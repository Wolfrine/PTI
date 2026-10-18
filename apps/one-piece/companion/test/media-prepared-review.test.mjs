import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, writeFile, access, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { MediaCache } from '../src/media/cache.mjs';
import { preparedRecipe, renditionId, runPreparedCommand } from '../src/media/prepared.mjs';
import { candidate } from './media-helpers.mjs';

// Adversarial lifecycle fixtures only. No media engine, encoder or real child is run.
const defer = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const captions = 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nExplicit fixture dialogue\n';
function recipe() {
  return preparedRecipe({ candidate: candidate(1000), source: { MediaStreams: [
    { Type: 'Video', Index: 0, Codec: 'h264', BitDepth: 8, Profile: 'High', Level: 40, Width: 1280, Height: 720 },
    { Type: 'Audio', Index: 1, Language: 'jpn', Codec: 'aac', Channels: 2 },
    { Type: 'Subtitle', Index: 2, Language: 'eng', Codec: 'ass', Title: 'Full English' }
  ] }, selected: { audioIndex: 1, subtitleIndex: 2, audioLanguage: 'jpn', subtitleLanguage: 'eng' },
  timing: { effectiveDurationSeconds: 1 } });
}

test('last cancellation while final publication is queued cannot publish an unpinned rendition', { timeout: 5000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pti-prepared-review-'));
  const cache = new MediaCache({ cacheRoot: root, limitBytes: 512 * 1024 ** 2, minimumFreeBytes: 0, diskFree: async () => 100 * 1024 ** 3 });
  t.after(async () => { await cache.shutdown(); assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('pti-prepared-review-')); await rm(root, { recursive: true, force: true }); });
  await cache.initialize();
  const selected = recipe(), id = renditionId(selected), held = defer(), release = defer(), controller = new AbortController();
  let blocking, job;
  const pending = cache.prepareRendition(selected, { owner: 'only-viewer', signal: controller.signal, prepare: async ({ paths }) => {
    await writeFile(paths.video, 'Explicit mock prepared bytes'); await writeFile(paths.captions, captions);
    // Hold the real cache transaction lock before the job queues publication.
    blocking = cache.locked(async () => { held.resolve(); await release.promise; });
    await held.promise;
    return { metadata: { fixture: true }, metrics: { fixture: true }, presentation: { fixture: true } };
  } });
  void pending.catch(() => {});
  try {
    await held.promise; job = cache.renditionJobs.get(id);
    const paths = cache.renditionPaths(id), until = Date.now() + 2000;
    for (;;) {
      try { await access(paths.video); await access(paths.captions); break; } catch (error) { if (Date.now() >= until) throw error; await delay(5); }
    }
    assert.equal(cache.renditions.has(id), false, 'publication is still behind the held transaction');
    controller.abort(new Error('last viewer cancelled before publication'));
    await assert.rejects(pending, /last viewer cancelled/);
    release.resolve(); await blocking; await job.promise;
    assert.equal(cache.renditions.has(id), false, 'cancelled output must not become a published unpinned entry');
    await assert.rejects(access(paths.video)); await assert.rejects(access(paths.captions));
    assert.equal(cache.preparedReservations.size, 0); assert.equal(cache.renditionPins.size, 0);
  } finally { release.resolve(); await blocking; await job?.promise; }
});

test('failed child kill cannot clear durable ownership before the owned child closes', { timeout: 5000 }, async () => {
  const originalSpawn = childProcess.spawn, killed = defer();
  const child = new EventEmitter(); Object.assign(child, { pid: 42424242, stdout: new PassThrough(), stderr: new PassThrough() });
  let complete = false, closed = false;
  child.kill = () => { queueMicrotask(() => { child.emit('error', new Error('Explicit fixture kill failure')); killed.resolve(); }); return false; };
  const registry = { async begin() { return { fixture: true }; }, async started() {}, async complete() { complete = true; } };
  childProcess.spawn = () => child; syncBuiltinESMExports();
  let pending;
  try {
    pending = runPreparedCommand('fixture-only-pinned-tool', ['fixture-only'], { registry, timeoutMs: 10 });
    void pending.catch(() => {});
    await killed.promise; await new Promise(resolve => setImmediate(resolve));
    assert.equal(closed, false); assert.equal(complete, false, 'a live child still needs its durable recovery identity');
    closed = true; child.emit('close', 1); await assert.rejects(pending);
    assert.equal(complete, true);
  } finally {
    if (!closed) child.emit('close', 1);
    await pending?.catch(() => {});
    childProcess.spawn = originalSpawn; syncBuiltinESMExports(); child.stdout.destroy(); child.stderr.destroy();
  }
});

test('same-recipe retry waits for cancelled job cleanup and its reservation', { timeout: 5000 }, async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'pti-prepared-review-'));
  const cache = new MediaCache({ cacheRoot: root, limitBytes: 512 * 1024 ** 2, minimumFreeBytes: 0, diskFree: async () => 100 * 1024 ** 3 });
  t.after(async () => { await cache.shutdown(); assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('pti-prepared-review-')); await rm(root, { recursive: true, force: true }); });
  await cache.initialize();
  const selected = recipe(), id = renditionId(selected), producerStarted = defer(), releaseProducer = defer();
  const cleanupStarted = defer(), releaseCleanup = defer(), controller = new AbortController();
  const remove = cache.removeRendition.bind(cache); let calls = 0, firstCleanup = true;
  cache.removeRendition = async key => { if (firstCleanup) { firstCleanup = false; cleanupStarted.resolve(); await releaseCleanup.promise; } return remove(key); };
  const prepare = async ({ paths }) => { calls++; await writeFile(paths.video, 'Explicit fixture bytes'); await writeFile(paths.captions, captions);
    if (calls === 1) { producerStarted.resolve(); await releaseProducer.promise; }
    return { metadata: { fixture: true }, metrics: { fixture: true }, presentation: { fixture: true } }; };
  const cancelled = cache.prepareRendition(selected, { owner: 'leaving', signal: controller.signal, prepare }); void cancelled.catch(() => {});
  let job, retry;
  try {
    await producerStarted.promise; job = cache.renditionJobs.get(id); controller.abort(new Error('leaving'));
    await assert.rejects(cancelled, /leaving/); releaseProducer.resolve(); await cleanupStarted.promise;
    retry = cache.prepareRendition(selected, { owner: 'joining', prepare }); void retry.catch(() => {});
    assert.equal(cache.renditionJobs.get(id), job, 'old cleanup still owns the recipe');
    assert.equal(cache.preparedReservations.has(id), true); assert.equal(calls, 1);
    releaseCleanup.resolve(); const ready = await retry;
    assert.equal(calls, 2); await access(ready.paths.video); await access(ready.paths.captions);
    assert.equal(cache.preparedReservations.size, 0); assert.equal(cache.renditionPins.get(id).has('joining'), true);
  } finally { releaseProducer.resolve(); releaseCleanup.resolve(); await job?.promise; await retry?.catch(() => {}); }
});

test('never-spawned tool error can complete its intent without waiting for nonexistent child close', { timeout: 5000 }, async () => {
  const originalSpawn = childProcess.spawn, child = new EventEmitter();
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough() }); let complete = false, kills = 0;
  child.kill = () => { kills++; return false; };
  const registry = { async begin() { return { fixture: true }; }, async started() {}, async complete() { complete = true; } };
  childProcess.spawn = () => { queueMicrotask(() => child.emit('error', new Error('Explicit fixture ENOENT'))); return child; }; syncBuiltinESMExports();
  try {
    await assert.rejects(runPreparedCommand('fixture-only-missing-tool', [], { registry }), { code: 'PREPARED_INVALID' });
    assert.equal(complete, true); assert.equal(kills, 0);
  } finally { childProcess.spawn = originalSpawn; syncBuiltinESMExports(); child.stdout.destroy(); child.stderr.destroy(); }
});
