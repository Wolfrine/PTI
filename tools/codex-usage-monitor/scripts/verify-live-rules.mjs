// Uses only the existing CI identity. No owner credential or real usage is uploaded.
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
const require = createRequire(new URL('../../../personal-functions/runtime.cjs', import.meta.url));
const { db, auth } = require('./runtime.cjs');
const apiKey = 'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs';
const suffix = randomBytes(8).toString('hex');
const uids = [`usage-probe-a-${suffix}`, `usage-probe-b-${suffix}`];
const root = `users/${uids[0]}/codexProjects/codex-usage`;
const base = 'https://firestore.googleapis.com/v1/projects/pti-app-2ab59/databases/(default)/documents';
const checks = [];
function fields(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'number') return { integerValue: String(value) };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(fields) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([k, v]) => [k, fields(v)])) } };
}
async function request(target, token, method = 'GET', value) {
  return fetch(`${base}/${target}`, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: value ? JSON.stringify(value) : undefined, signal: AbortSignal.timeout(15000), redirect: 'error' });
}
async function login(uid) {
  await auth.createUser({ uid });
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: await auth.createCustomToken(uid), returnSecureToken: true }), signal: AbortSignal.timeout(15000) });
  const value = await response.json();
  const claims = typeof value.idToken === 'string' ? JSON.parse(Buffer.from(value.idToken.split('.')[1], 'base64url').toString()) : {};
  assert(response.ok && claims.sub === uid && claims.aud === 'pti-app-2ab59', 'Temporary identity exchange failed'); return value.idToken;
}
const pass = (name, ok) => { assert(ok, name); checks.push(name); console.log(`PASS ${name}`); };
try {
  const [owner, other] = await Promise.all(uids.map(login));
  const data = { schemaVersion: 1, source: 'codex-app-server', collectorVersion: '1.0.0', lastAttemptAt: new Date().toISOString(),
    allowance: { status: 'unavailable', lastSuccessAt: null, buckets: [] }, daily: { status: 'unavailable', lastSuccessAt: null, latest: null, buckets: [] } };
  const commit = { writes: [{ update: { name: `projects/pti-app-2ab59/databases/(default)/documents/${root}`, fields: fields(data).mapValue.fields }, updateTransforms: [{ fieldPath: 'publishedAt', setToServerValue: 'REQUEST_TIME' }] }] };
  let written;
  for (let attempt = 0; attempt < 20; attempt++) {
    written = await fetch(`${base}:commit`, { method: 'POST', headers: { Authorization: `Bearer ${owner}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commit), signal: AbortSignal.timeout(15000) });
    if (written.ok) break; await written.body?.cancel(); await new Promise(resolve => setTimeout(resolve, 3000));
  }
  pass('owner can publish synthetic usage', written.ok); await written.body?.cancel();
  for (const [name, token, target] of [['owner read', owner, root], ['different account read denied', other, root], ['anonymous read denied', null, root],
    ['different account nested path denied', other, `${root}/private/probe`]]) {
    const response = await request(target, token); pass(name, response.status === (name === 'owner read' ? 200 : 403)); await response.body?.cancel();
  }
  for (const token of [other, null]) {
    const response = await request(root, token, 'PATCH', { fields: fields(data).mapValue.fields }); pass(token ? 'different account write denied' : 'anonymous write denied', response.status === 403); await response.body?.cancel();
  }
  const otherRoot = `users/${uids[1]}/codexProjects/codex-usage`;
  const absent = await request(otherRoot, owner); pass('absent other-account usage denied by overlapping rules', absent.status === 403); await absent.body?.cancel();
  const legacy = await request(`users/${uids[0]}/codexProjects/usage-legacy-probe`, owner, 'PATCH', { fields: fields({ synthetic: 'legacy-preservation' }).mapValue.fields });
  pass('legacy project policy preserved', legacy.ok); await legacy.body?.cancel();
  for (const [name, token] of [['authenticated', owner], ['other', other], ['anonymous', null]]) {
    const response = await request('_ptiLocalServices/one-piece', token);
    pass(`${name} cannot directly read service mailbox`, response.status === 403); await response.body?.cancel();
    const write = await request(`_ptiLocalServices/privacy-probe-${suffix}`, token, 'PATCH', { fields: fields({ synthetic: 'service-privacy-probe' }).mapValue.fields });
    pass(`${name} cannot directly write service mailbox`, write.status === 403); await write.body?.cancel();
  }
  const report = { kind: 'codex-usage-live-privacy', syntheticOnly: true, checkedAt: new Date().toISOString(), passed: checks.length, checks, project: 'pti-app-2ab59', database: '(default)' };
  await writeFile('codex-usage-activation-report.json', JSON.stringify(report, null, 2));
} finally {
  await db.doc(`_ptiLocalServices/privacy-probe-${suffix}`).delete();
  for (const uid of uids) {
    await db.doc(`users/${uid}/codexProjects/codex-usage`).delete();
    await db.doc(`users/${uid}/codexProjects/usage-legacy-probe`).delete();
    await auth.deleteUser(uid).catch(error => { if (error.code !== 'auth/user-not-found') throw error; });
  }
}
