import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { AppServer } from '../src/rpc.mjs';
const fixture = fileURLToPath(new URL('./fixtures/fake-server.mjs', import.meta.url));
const server = mode => new AppServer('synthetic-only', { timeoutMs: mode ? 50 : 3000,
  spawnImpl: (_exe, _args, options) => spawn(process.execPath, [fixture], { ...options, env: { ...process.env, FAKE_RPC_MODE: mode || '' } }) });
test('stdio handshake, request IDs and notifications require no inference', async () => {
  const rpc = server(); try {
    await rpc.initialize();
    const [identity, limits] = await Promise.all([rpc.request('account/read', { refreshToken: false }), rpc.request('account/rateLimits/read')]);
    assert.equal(identity.account.type, 'chatgpt'); assert.equal(limits.rateLimits.primary.usedPercent, 4);
    assert.throws(() => rpc.request('turn/start', {}), /allowlist/);
    await assert.rejects(rpc.request('account/usage/read'), error => error.code === 'unsupported-method' && !error.message.includes('SYNTHETIC_PRIVATE'));
  } finally { await rpc.close(); }
  assert.notEqual(rpc.child.exitCode, null);
});
test('stalled and exiting children produce bounded sanitized errors and are stopped', async () => {
  for (const mode of ['timeout', 'exit']) {
    const rpc = server(mode); try { await assert.rejects(rpc.initialize(), error => ['rpc-timeout', 'rpc-exited'].includes(error.code)); }
    finally { await rpc.close(); }
  }
});
