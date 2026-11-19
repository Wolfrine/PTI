import { applicationDefault, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { createPlatformSnapshot, PTI_PROJECT, PTI_REPOSITORY } from './platform-usage-core.mjs';
import { OWNER_UID } from '../tools/codex-usage-monitor/src/config.mjs';

// This is an unattended read-only integration with external providers and one
// write to an explicitly private PTI document. No account token enters Firestore.
if (process.env.GITHUB_REPOSITORY !== PTI_REPOSITORY) throw new Error('wrong-release-repository');
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) throw new Error('firebase-deployment-identity-unavailable');

const app = initializeApp({ credential: applicationDefault(), projectId: PTI_PROJECT });
try {
  const token = (await app.options.credential.getAccessToken()).access_token;
  const requestRules = async (url, body) => {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`live-rules-access-${response.status}`);
    return response.json();
  };
  const url = `https://firebaserules.googleapis.com/v1/projects/${PTI_PROJECT}/releases/cloud.firestore`;
  const release = await requestRules(url);
  if (typeof release.rulesetName !== 'string') throw new Error('live-rules-unexpected');
  const ruleset = await requestRules(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
  if (!ruleset.source?.files?.length) throw new Error('live-rules-unexpected');
  // Check the effective policy for the two private documents. Other teams may
  // legitimately update unrelated rules without stopping this collector.
  const ownerAuth = { uid: OWNER_UID, token: { firebase: { sign_in_provider: 'google.com' } } };
  const outsiderAuth = { uid: 'resource-usage-outsider', token: { firebase: { sign_in_provider: 'google.com' } } };
  const testCases = ['config', 'current', 'current/private/probe'].flatMap(document => {
    const path = `/databases/(default)/documents/users/${OWNER_UID}/resourceUsage/${document}`;
    // Supply a plausible document on both sides of a write. Otherwise a
    // conditional write grant might fail for missing data and falsely pass DENY.
    const resource = { data: { schemaVersion: 1, source: document === 'config' ? 'github-repository-mapping-audit' : 'pti-platform-usage' } };
    const probe = (method, expectation, auth) => ({
      expectation,
      request: { method, path, ...(auth ? { auth } : {}), ...(['create', 'update'].includes(method) ? { resource } : {}) },
      ...(method === 'create' ? {} : { resource }),
    });
    return [
      probe('get', 'ALLOW', ownerAuth),
      probe('get', 'DENY', outsiderAuth),
      probe('get', 'DENY'),
      ...['create', 'update', 'delete'].map(method => probe(method, 'DENY', ownerAuth)),
      ...['create', 'update', 'delete'].map(method => probe(method, 'DENY', outsiderAuth)),
      probe('create', 'DENY'),
    ];
  });
  const privacy = await requestRules(`https://firebaserules.googleapis.com/v1/projects/${PTI_PROJECT}:test`, {
    source: ruleset.source,
    testSuite: { testCases },
  });
  if (privacy.testResults?.length !== testCases.length ||
      privacy.testResults.some(result => result.state !== 'SUCCESS')) {
    throw new Error('live-resource-privacy-not-verified');
  }
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
    billingExport: trustedRegistry.billingExport,
  });
  const current = snapshot.cloudBilling;
  if (current.status === 'ok') {
    const previous = (await firestore.doc(`users/${OWNER_UID}/resourceUsage/current`).get()).data()?.cloudBilling;
    if (previous?.status === 'ok' && current.invoiceMonth === previous.invoiceMonth &&
      current.currency === previous.currency && typeof previous.net === 'number' && Number.isFinite(previous.net)) {
      current.changeSincePrevious = Number((current.net - previous.net).toFixed(6));
    }
  }
  // Service Account roles are deliberately restricted by Google IAM. A project
  // without Monitoring Viewer shows as unavailable rather than inventing zeros.
  if ((await requestRules(url)).rulesetName !== release.rulesetName) throw new Error('live-rules-changed-during-collection');
  await firestore.doc(`users/${OWNER_UID}/resourceUsage/current`).set(snapshot);
  const available = snapshot.firebase.projects.filter(project => project.status === 'ok').length;
  console.log(`Published private platform snapshot: GitHub ${snapshot.github.coveredRepoCount}/${snapshot.github.repositoryCount} active repositories, Firebase ${available}/${snapshot.firebase.projects.length} projects, Cloud Billing ${current.status}.`);
} finally {
  await app.delete();
}
