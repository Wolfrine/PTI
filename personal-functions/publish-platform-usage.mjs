import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createPlatformSnapshot, PTI_PROJECT, PTI_REPOSITORY } from './platform-usage-core.mjs';
import { OWNER_UID } from '../tools/codex-usage-monitor/src/config.mjs';

// This is an unattended read-only integration with external providers and one
// write to an explicitly private PTI document. No account token enters Firestore.
if (process.env.GITHUB_REPOSITORY !== PTI_REPOSITORY) throw new Error('wrong-release-repository');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('firebase-deployment-identity-unavailable');

const app = initializeApp({ credential: applicationDefault(), projectId: PTI_PROJECT });
try {
  const token = (await app.options.credential.getAccessToken()).access_token;
  const requestRules = async url => {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`live-rules-access-${response.status}`);
    return response.json();
  };
  const url = `https://firebaserules.googleapis.com/v1/projects/${PTI_PROJECT}/releases/cloud.firestore`;
  const release = await requestRules(url);
  if (typeof release.rulesetName !== 'string') throw new Error('live-rules-unexpected');
  const ruleset = await requestRules(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  const expected = await readFile('personal-harness/firestore.rules', 'utf8');
  const actual = ruleset.source?.files;
  const sha = source => createHash('sha256').update(source).digest('hex');
  if (actual?.length !== 1 || sha(actual[0].content) !== sha(expected)) throw new Error('live-resource-privacy-not-verified');
  const firestore = getFirestore(app);
  // The inventory is owner-only Firestore data. PTI is a public repository:
  // never embed private repository names or project associations in source.
  const registry = (await firestore.doc(`users/${OWNER_UID}/resourceUsage/config`).get()).data();
  const trustedRegistry = registry?.schemaVersion === 1 && registry?.source === 'github-repository-mapping-audit' ? registry : {};
  const snapshot = await createPlatformSnapshot({
    cloudToken: token,
    workflowToken: process.env.GITHUB_TOKEN || '',
    billingToken: process.env.PTI_GITHUB_USAGE_TOKEN || '',
    configuredProjects: process.env.PTI_FIREBASE_PROJECT_IDS || '',
    registeredProjects: trustedRegistry.firebaseProjectIds,
    repositoryConfig: trustedRegistry.githubRepositories,
  });
  // Service Account roles are deliberately restricted by Google IAM. A project
  // without Monitoring Viewer shows as unavailable rather than inventing zeros.
  await firestore.doc(`users/${OWNER_UID}/resourceUsage/current`).set(snapshot);
  const available = snapshot.firebase.projects.filter(project => project.status === 'ok').length;
  console.log(`Published private platform snapshot: GitHub ${snapshot.github.coveredRepoCount}/${snapshot.github.repositoryCount} active repositories, Firebase ${available}/${snapshot.firebase.projects.length} projects; billing ${snapshot.github.billedActionsMinutes === null ? 'not connected' : 'connected'}.`);
} finally {
  await app.delete();
}
