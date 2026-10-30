// Synthetic CI acceptance only. Uses the existing configured Firebase Admin
// identity, never an owner's token, UID, data, exported credential or raw chats.
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { configureNativeAuth } from './configure-native-auth.mjs';
const require = createRequire(new URL('../../../personal-functions/runtime.cjs', import.meta.url));
const { app, db, auth } = require('./runtime.cjs');
const project = 'pti-app-2ab59';
// Native CI exchanges must prove the same no-Referer path as Windows workers.
// Browser/Picker restrictions are verified separately by Velum cloud setup.
const { firebaseAuthApiKey: apiKey } = await configureNativeAuth({ accessToken: (await app.options.credential.getAccessToken()).access_token });
const suffix = randomBytes(8).toString('hex'), uids = [`atlas-probe-a-${suffix}`, `atlas-probe-b-${suffix}`];
const root = `users/${uids[0]}/atlasData/workspace`;
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const name = path => `projects/${project}/databases/(default)/documents/${path}`;
const createdUsers = new Set(), attemptedPaths = new Set(), checks = [];
const evidenceId = `ev_${'a'.repeat(64)}`;
const pass = (label, ok) => { assert(ok, label); checks.push(label); console.log(`PASS ${label}`); };
function field(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') { assert(Number.isSafeInteger(value)); return { integerValue: String(value) }; }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(field) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, field(item)])) } };
}
function remember(path) {
  assert(path.startsWith(`${root}/`), 'Probe may mutate only its generated synthetic namespace.');
  attemptedPaths.add(path); return path;
}
async function request(path, token, method = 'GET', data) {
  if (method !== 'GET') remember(path);
  const response = await fetch(`${base}/${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data), signal: AbortSignal.timeout(15000), redirect: 'error' });
  const status = response.status; await response.body?.cancel(); return status;
}
async function login(uid) {
  await auth.createUser({ uid }); createdUsers.add(uid);
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: await auth.createCustomToken(uid), returnSecureToken: true }), signal: AbortSignal.timeout(15000), redirect: 'error',
  });
  const data = await response.json(), claims = typeof data.idToken === 'string' ? JSON.parse(Buffer.from(data.idToken.split('.')[1], 'base64url').toString()) : {};
  assert(response.ok && claims.sub === uid && claims.aud === project, 'Synthetic identity exchange failed.'); return data.idToken;
}
function transition(kind, targetId, fields, before = null, eventSuffix = 'initial') {
  const eventId = `probe_${kind}_${eventSuffix}`, revision = (before?.revision || 0) + 1, createdAt = Date.now();
  const after = { schemaVersion: 1, ...fields, revision, updatedAt: createdAt, lastEventId: eventId };
  const event = { schemaVersion: 1, eventId, kind, targetId, revision, createdAt, before, after };
  const collection = kind === 'review' ? 'reviews' : kind === 'source' ? 'sources' : 'progress';
  const targetPath = remember(`${root}/${collection}/${targetId}`), eventPath = remember(`${root}/events/${eventId}`);
  return { after, writes: [
    { update: { name: name(targetPath), fields: field(after).mapValue.fields }, currentDocument: { exists: before !== null } },
    { update: { name: name(eventPath), fields: field(event).mapValue.fields }, currentDocument: { exists: false } },
  ] };
}
async function commit(token, writes) {
  const response = await fetch(`${base}:commit`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ writes }), signal: AbortSignal.timeout(20000), redirect: 'error' });
  const status = response.status; await response.body?.cancel(); return status;
}

let succeeded = false;
try {
  const exchanges = await Promise.allSettled(uids.map(login));
  const failed = exchanges.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  const [owner, other] = exchanges.map(result => result.value);
  const evidencePath = remember(`${root}/evidence/${evidenceId}`);
  await db.doc(evidencePath).create({ id: evidenceId, identity: `src_${'b'.repeat(64)}`, fingerprint: 'c'.repeat(64), supersedes: null,
    record: { sourceSystem: 'github', sourceLocator: 'https://github.com/example/atlas/blob/main/README.md', sourceRecordId: 'README.md', sourceRevision: 'synthetic', occurredAt: null, sourceUpdatedAt: null, capturedAt: new Date().toISOString(), claim: 'Synthetic CI privacy fixture only.', originalStatus: null, evidenceKind: 'primary_artifact', subjectIds: [], projectId: 'synthetic', contribution: null, limitations: ['Not owner evidence.'], reviewStatus: 'pending' } });
  // Rule publication can propagate briefly; never proceed while another account
  // can read the synthetic fixture. No real Atlas data is present in this probe.
  let isolated = false;
  for (let attempt = 0; attempt < 15; attempt++) {
    if (await request(evidencePath, other) === 403) { isolated = true; break; }
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  pass('different account cannot read Atlas evidence', isolated);
  pass('owner can read Atlas evidence', await request(evidencePath, owner) === 200);
  pass('anonymous cannot read Atlas evidence', await request(evidencePath, null) === 403);
  pass('different account cannot read absent Atlas records', await request(`${root}/progress/absent`, other) === 403);
  for (const [label, token] of [['owner', owner], ['other', other], ['anonymous', null]]) {
    pass(`${label} cannot create evidence`, await request(`${root}/evidence/forged`, token, 'PATCH', { fields: field({ claim: 'forged synthetic' }).mapValue.fields }) === 403);
    pass(`${label} cannot replace evidence`, await request(evidencePath, token, 'PATCH', { fields: field({ claim: 'forged synthetic' }).mapValue.fields }) === 403);
    pass(`${label} cannot delete evidence`, await request(evidencePath, token, 'DELETE') === 403);
  }
  const progressFields = { subjectId: 'synthetic-subject', state: 'learning', note: 'Synthetic explicit declaration.', basis: 'self-report' };
  const first = transition('progress', 'synthetic-subject', progressFields);
  pass('owner cannot save progress without history', await commit(owner, [first.writes[0]]) === 403);
  pass('owner atomically saves self-report and immutable event', await commit(owner, first.writes) === 200);
  pass('owner can read saved self-report', await request(`${root}/progress/synthetic-subject`, owner) === 200);
  const a = transition('progress', 'synthetic-subject', { ...progressFields, state: 'practicing' }, first.after, 'race-a');
  const b = transition('progress', 'synthetic-subject', { ...progressFields, state: 'applying' }, first.after, 'race-b');
  const race = await Promise.all([commit(owner, a.writes), commit(owner, b.writes)]);
  pass('concurrent same-revision writes have exactly one winner', race.filter(status => status === 200).length === 1 && race.every(status => [200, 403, 409].includes(status)));
  const review = transition('review', evidenceId, { evidenceId, status: 'accepted', note: 'Synthetic linked evidence, not verification of mastery.' });
  pass('owner atomically links existing evidence', await commit(owner, review.writes) === 200);
  const consent = transition('source', 'synthetic-tracker', { sourceId: 'synthetic-tracker', system: 'pti-tracker-firestore', locator: `users/${uids[0]}/trackerData/workspace/evidence/`, recordLocatorPrefixes: [`users/${uids[0]}/trackerData/workspace/evidence/`], recordLocators: [], enabled: true });
  pass('owner atomically approves a bounded own source', await commit(owner, consent.writes) === 200);
  const outside = transition('progress', 'other-write', { ...progressFields, subjectId: 'other-write' }, null, 'other');
  pass('different account cannot write Atlas declarations', await commit(other, outside.writes) === 403);
  pass('owner cannot rewrite event history', await request(`${root}/events/probe_progress_initial`, owner, 'PATCH', { fields: field({ forged: true }).mapValue.fields }) === 403);
  pass('owner cannot delete event history', await request(`${root}/events/probe_progress_initial`, owner, 'DELETE') === 403);
  pass('owner cannot fabricate a completed source cursor', await request(`${root}/sourceState/forged`, owner, 'PATCH', { fields: field({ completeness: 'complete' }).mapValue.fields }) === 403);
  succeeded = true;
} finally {
  // Exact generated paths only; no recursive delete and no existing owner data.
  const cleanup = await Promise.allSettled([
    ...[...attemptedPaths].map(path => db.doc(path).delete()),
    ...[...createdUsers].map(uid => auth.deleteUser(uid).catch(error => { if (error.code !== 'auth/user-not-found') throw error; })),
  ]);
  assert(cleanup.every(result => result.status === 'fulfilled'), 'Synthetic cleanup needs attention; one or more exact generated records could not be removed.');
  if (attemptedPaths.size) assert((await db.getAll(...[...attemptedPaths].map(path => db.doc(path)))).every(snapshot => !snapshot.exists), 'Synthetic document cleanup failed.');
  for (const uid of createdUsers) {
    try { await auth.getUser(uid); throw new Error('Synthetic identity cleanup failed.'); }
    catch (error) { if (error.code !== 'auth/user-not-found') throw error; }
  }
}
assert(succeeded, 'Atlas live privacy probe did not complete.');
const report = { kind: 'atlas-live-privacy', syntheticOnly: true, cleanupVerified: true, checkedAt: new Date().toISOString(), passed: checks.length, checks, project, database: '(default)' };
await writeFile('atlas-activation-report.json', JSON.stringify(report, null, 2));
console.log(`Atlas live privacy checks complete: ${checks.length}; synthetic records and identities removed.`);
