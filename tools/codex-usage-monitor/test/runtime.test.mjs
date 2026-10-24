import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runOnce } from '../src/monitor.mjs';
import { fingerprint, MonitorError } from '../src/core.mjs';
import { atomicJson, readJson, acquireLease } from '../src/store.mjs';
import { refreshSession, verifyPrivateAccess } from '../src/credentials.mjs';

const account = { type: 'chatgpt', email: 'synthetic@example.test' };
const results = { account, allowanceResult: { rateLimits: { primary: { usedPercent: 3, windowDurationMins: 10080, resetsAt: 1893456000 } } }, dailyResult: { dailyUsageBuckets: [{ startDate: '2026-10-23', tokens: 100 }] } };
async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pti-monitor-test-')); t.after(() => rm(root, { recursive: true, force: true }));
  const credential = { codexFingerprint: fingerprint(account, results.allowanceResult), refreshToken: 'synthetic-refresh-token', privacyVerifiedAt: '2026-10-24T00:00:00Z' };
  const writes = []; const saves = [];
  return { root, credential, writes, saves, credentials: { initialize: async () => {}, load: async () => credential, save: async v => saves.push(v) },
    resolve: async () => ({ executable: 'synthetic-codex.exe', version: 'synthetic1' }), read: async () => structuredClone(results),
    refresh: async () => ({ idToken: 'synthetic-id-token', refreshToken: credential.refreshToken }), write: async (_token, data) => writes.push(data) };
}
test('actual run contract publishes once and a fresh process recovers pending after a network failure', async t => {
  const f = await fixture(t);
  await assert.rejects(runOnce({ ...f, write: async () => { throw new MonitorError('firebase-unavailable'); } }));
  assert((await readJson(path.join(f.root, 'runtime.json'))).pending);
  assert.equal(await readJson(path.join(f.root, 'run.lock')), null);
  const { stdout } = await promisify(execFile)(process.execPath, [fileURLToPath(new URL('./fixtures/recover-run.mjs', import.meta.url)), f.root], { timeout: 15000, windowsHide: true });
  assert.equal(JSON.parse(stdout).outcome, 'published');
  assert.equal((await readJson(path.join(f.root, 'synthetic-cloud-write.json'))).source, 'codex-app-server');
  const state = await readJson(path.join(f.root, 'runtime.json')); assert.equal(state.pending, null);
  assert(!JSON.stringify(state).includes('synthetic-refresh-token')); assert(!JSON.stringify(state).includes('synthetic-id-token')); assert(!JSON.stringify(state).includes('synthetic@example.test'));
});
test('overall deadline prevents a late source completion from publishing after lease release', async t => {
  const f = await fixture(t);
  await assert.rejects(runOnce({ ...f, deadlineMs: 10, read: async () => { await new Promise(resolve => setTimeout(resolve, 80)); return results; } }), /run-timeout/);
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(f.writes.length, 0); assert.equal(await readJson(path.join(f.root, 'run.lock')), null);
});
test('live lease blocks a duplicate and dead process lease is recovered', async t => {
  const f = await fixture(t), lease = await acquireLease(f.root); assert(lease);
  assert.equal((await runOnce(f)).outcome, 'already-running'); await lease.release();
  await atomicJson(path.join(f.root, 'run.lock'), { pid: 2147483647, token: 'dead', startedAt: '2026-01-01T00:00:00Z' });
  assert.equal((await runOnce(f)).outcome, 'published');
});
test('wrong Codex identity stops all cloud publication', async t => {
  const f = await fixture(t); await assert.rejects(runOnce({ ...f, read: async () => ({ ...results, account: { ...account, email: 'other@example.test' } }) }), /codex-account-mismatch/);
  assert.equal(f.writes.length, 0);
});
test('unverified privacy and revoked Firebase credential fail closed', async t => {
  const f = await fixture(t); f.credential.privacyVerifiedAt = null; await assert.rejects(runOnce(f), /private-rules-not-verified/);
  f.credential.privacyVerifiedAt = 'verified'; await assert.rejects(runOnce({ ...f, refresh: async () => { throw new MonitorError('firebase-login-required'); } }), /firebase-login-required/); assert.equal(f.writes.length, 0);
});
test('Firebase credential renewal is saved before publication', async t => {
  const f = await fixture(t); let saved = false;
  f.credentials.save = async value => { assert.equal(value.refreshToken, 'renewed-token'); saved = true; };
  await runOnce({ ...f, refresh: async () => ({ idToken: 'token', refreshToken: 'renewed-token' }), write: async () => assert(saved) });
});
test('a version change probes usage again instead of persisting unsupported forever', async t => {
  const f = await fixture(t); let previousCapability;
  await runOnce({ ...f, read: async (_exe, options) => { previousCapability = options.previousCapability; return { ...results, dailyResult: undefined, dailyError: new MonitorError('unsupported-method') }; } });
  await runOnce({ ...f, read: async (_exe, options) => { previousCapability = options.previousCapability; return results; } }); assert.equal(previousCapability, 'unsupported');
  await runOnce({ ...f, resolve: async () => ({ executable: 'synthetic-codex.exe', version: 'synthetic2' }), read: async (_exe, options) => { previousCapability = options.previousCapability; return results; } }); assert.equal(previousCapability, undefined);
});
test('atomic replacement leaves prior complete JSON after a failed serialization', async t => {
  const f = await fixture(t), file = path.join(f.root, 'atomic.json'); await atomicJson(file, { complete: true });
  const cycle = {}; cycle.self = cycle; await assert.rejects(atomicJson(file, cycle)); assert.deepEqual(await readJson(file), { complete: true });
});
test('refresh endpoint validates project and owner, not just a returned token', async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ user_id: 'wrong', project_id: 'pti-app-2ab59', id_token: 'x'.repeat(30), refresh_token: 'y'.repeat(30) }));
  await assert.rejects(refreshSession('z'.repeat(30), { fetchImpl }), /firebase-account-mismatch/);
  await assert.rejects(refreshSession('z'.repeat(30), { fetchImpl: async () => new Response('{}', { status: 400 }) }), /firebase-login-required/);
});
test('privacy preflight rejects legacy broad authenticated access even for absent records', async () => {
  let count = 0;
  await assert.rejects(verifyPrivateAccess('synthetic-id-token', { fetchImpl: async () => { count++; return new Response('{}', { status: count === 1 ? 403 : 404 }); } }), /private-rules-not-verified/);
  assert.equal(count, 2);
});
