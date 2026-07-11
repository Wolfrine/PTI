import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';

const projectId = process.env.FIREBASE_PROJECT_ID || 'pti-app-2ab59';
const apply = process.argv.includes('--apply');
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const baselinePath = path.resolve(
  scriptDirectory,
  '../../pti-app/public/data/operating-system-baseline.json',
);

initializeApp({ credential: applicationDefault(), projectId });
const firestore = getFirestore();

const baseline = JSON.parse(await fs.readFile(baselinePath, 'utf8'));
const collections = [
  'projects', 'outcomes', 'signals', 'decisions', 'commitments', 'workPackets',
  'agentRuns', 'submissions', 'evaluations', 'releases', 'allocations', 'learnings', 'auditEvents',
];

validateBaseline(baseline);
const targetUid = await resolveTargetUid();
const recordCounts = Object.fromEntries(collections.map((name) => [name, baseline[name].length]));
const totalRecords = 1 + Object.values(recordCounts).reduce((sum, count) => sum + count, 0);

console.log(JSON.stringify({
  mode: apply ? 'apply' : 'dry-run',
  projectId,
  schemaVersion: baseline.workspace.schemaVersion,
  totalRecords,
  recordCounts,
}, null, 2));

if (!apply) {
  console.log('Dry-run complete. No Firestore records were changed.');
  process.exit(0);
}

const basePath = `users/${targetUid}/operatingSystems/default`;
const batch = firestore.batch();
batch.set(
  firestore.doc(`${basePath}/workspace/current`),
  convertTimestamps({ ...baseline.workspace, mode: 'live' }),
  { merge: true },
);

for (const collectionName of collections) {
  for (const record of baseline[collectionName]) {
    batch.set(
      firestore.doc(`${basePath}/${collectionName}/${record.id}`),
      convertTimestamps(record),
      { merge: true },
    );
  }
}

batch.set(
  firestore.doc(`${basePath}/migrationReports/baseline-2026-07-11`),
  {
    id: 'baseline-2026-07-11',
    schemaVersion: 2,
    source: 'pti-app/public/data/operating-system-baseline.json',
    appliedAt: FieldValue.serverTimestamp(),
    recordCounts,
    totalRecords,
    mode: 'additive-idempotent-merge',
  },
  { merge: true },
);

await batch.commit();
console.log(`Applied ${totalRecords} operating-system records and one migration report.`);

async function resolveTargetUid() {
  const configured = process.env.PTI_TARGET_UID?.trim();
  if (configured) {
    return configured;
  }

  const userDocuments = await firestore.collection('users').limit(3).get();
  if (userDocuments.size === 1) {
    return userDocuments.docs[0].id;
  }
  if (userDocuments.size > 1) {
    throw new Error('Multiple Firestore user roots exist; set PTI_TARGET_UID explicitly.');
  }

  const authUsers = await getAuth().listUsers(3);
  if (authUsers.users.length === 1) {
    return authUsers.users[0].uid;
  }
  if (authUsers.users.length > 1) {
    throw new Error('Multiple Firebase Auth users exist; set PTI_TARGET_UID explicitly.');
  }

  throw new Error('No PTI user could be resolved from Firestore or Firebase Auth.');
}

function validateBaseline(value) {
  if (!value?.workspace || value.workspace.schemaVersion !== 2) {
    throw new Error('Baseline workspace with schemaVersion 2 is required.');
  }
  for (const collectionName of collections) {
    if (!Array.isArray(value[collectionName])) {
      throw new Error(`Baseline collection ${collectionName} must be an array.`);
    }
    const ids = value[collectionName].map((record) => record.id);
    if (ids.some((id) => !id) || new Set(ids).size !== ids.length) {
      throw new Error(`Baseline collection ${collectionName} has missing or duplicate IDs.`);
    }
  }
}

function convertTimestamps(value, key = '') {
  if (Array.isArray(value)) {
    return value.map((item) => convertTimestamps(item));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [
        childKey,
        convertTimestamps(childValue, childKey),
      ]),
    );
  }
  if (typeof value === 'string' && key.endsWith('At')) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return Timestamp.fromDate(parsed);
    }
  }
  return value;
}
