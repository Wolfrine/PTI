import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createInterface } from 'node:readline';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { PreparedToolRegistry, validatePreparedToolRecord } from '../src/media/prepared-processes.mjs';
import { runPreparedCommand } from '../src/media/prepared.mjs';
import { temporary } from './media-helpers.mjs';

const canaryCode = "const fs=require('node:fs');setInterval(()=>{if(fs.existsSync(process.argv[1]+'.stop'))process.exit(0)},50);setTimeout(()=>process.exit(0),30000)";
const registryFor = root => new PreparedToolRegistry({ workRoot: root, ffmpegPath: process.execPath, ffprobePath: process.execPath });
const exists = pid => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function waitGone(pid) { for (let i = 0; i < 40 && exists(pid); i++) await delay(50); assert.equal(exists(pid), false); }

test('prepared process records admit only a pinned executable and an exact owned staging token', async t => {
  const root = await temporary(t), registry = registryFor(root), marker = path.join(root, `${randomUUID()}.video.part.mp4`);
  const intent = await registry.begin(process.execPath, ['-e', canaryCode, marker]);
  assert.equal(JSON.parse(await readFile(intent.file)).pid, null);
  for (const replacement of [{ marker: path.join(root, 'outside.mp4') }, { executable: path.join(root, 'different.exe') }, { token: randomUUID() }, { parentPid: 0 }]) {
    assert.throws(() => validatePreparedToolRecord({ ...intent.record, ...replacement }, registry), { code: 'PREPARED_PROCESS_IDENTITY' });
  }
  await assert.rejects(registry.begin(process.execPath, ['https://source.invalid/private', marker]), { code: 'PREPARED_PROCESS_IDENTITY' });
  await registry.complete(intent); assert.deepEqual(await readdir(registry.root), []);
});

test('a live backend protects both its intent-before-spawn and running benign canary', { skip: process.platform !== 'win32', timeout: 30000 }, async t => {
  const root = await temporary(t), registry = registryFor(root), marker = path.join(root, `${randomUUID()}.video.part.mp4`);
  const args = ['-e', canaryCode, marker], intent = await registry.begin(process.execPath, args);
  await assert.rejects(registry.recover(), { code: 'PREPARED_PROCESS_IDENTITY' });
  const child = spawn(process.execPath, args, { windowsHide: true, stdio: 'ignore' });
  const closed = once(child, 'close');
  try {
    await registry.started(intent, child.pid);
    await assert.rejects(registry.recover(), { code: 'PREPARED_PROCESS_IDENTITY' });
    assert.equal(child.exitCode, null); assert.equal(exists(child.pid), true);
    assert.equal((await readdir(registry.root)).length, 1);
  } finally { child.kill(); await closed; await registry.complete(intent); }
});

async function checkOrphan(t, intentOnly) {
  const root = await temporary(t), registry = registryFor(root);
  const parent = spawn(process.execPath, [fileURLToPath(new URL('./fixtures/prepared-orphan-parent.mjs', import.meta.url)), root, intentOnly ? 'intent-only' : 'pid-written'],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const parentClosed = once(parent, 'close'), lines = createInterface({ input: parent.stdout });
  let canary;
  try {
    const [line] = await Promise.race([once(lines, 'line'), once(parent, 'error').then(([error]) => Promise.reject(error)), delay(5000).then(() => Promise.reject(new Error('Canary parent did not become ready')))]);
    canary = JSON.parse(line); assert.equal(exists(canary.pid), true);
    parent.kill(); await parentClosed; // Only the ChildProcess handle created by this fixture is killed here.
    assert.equal(exists(canary.pid), true, 'The benign child must survive the killed backend to test orphan recovery');
    const original = JSON.parse(await readFile(canary.record, 'utf8')); assert.equal(original.pid === null, intentOnly);
    if (!intentOnly) {
      const token = randomUUID();
      await writeFile(canary.record, JSON.stringify({ ...original, token, marker: path.join(root, `${token}.video.part.mp4`) }));
      await assert.rejects(registry.recover(), { code: 'PREPARED_PROCESS_IDENTITY' });
      assert.equal(exists(canary.pid), true); assert.equal((await readdir(registry.root)).length, 1);
      await writeFile(canary.record, JSON.stringify(original));
    }
    const result = await registry.recover(); assert.equal(result.stopped, 1); await waitGone(canary.pid);
    assert.deepEqual(await readdir(registry.root), []);
  } finally {
    lines.close(); if (parent.exitCode === null && parent.signalCode === null) { parent.kill(); await parentClosed; }
    // Cooperative canary-only fallback; never kill an unproven numeric PID.
    if (canary && exists(canary.pid)) { await writeFile(canary.marker + '.stop', 'stop benign fixture'); await waitGone(canary.pid); }
  }
}

for (const intentOnly of [false, true]) test(`hard-killed backend recovers only its verified benign orphan (${intentOnly ? 'intent before PID write' : 'PID persisted'})`,
  { skip: process.platform !== 'win32', timeout: 30000 }, t => checkOrphan(t, intentOnly));

test('failed PID registration is handled immediately and command completion waits for the owned child to stop', async t => {
  const root = await temporary(t); let completed = false;
  const registry = { async begin() { return {}; }, async started() { throw new Error('Fixture registration failure'); }, async complete() { completed = true; } };
  await assert.rejects(runPreparedCommand(process.execPath, ['-e', 'setTimeout(()=>{},20000)', path.join(root, 'fixture')], { registry }), { code: 'PREPARED_INVALID' });
  assert.equal(completed, true);
});
