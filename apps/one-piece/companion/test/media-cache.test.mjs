import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile, access, symlink, rm } from 'node:fs/promises';
import path from 'node:path';
import { MediaCache, scanFiles } from '../src/media/cache.mjs';
import { candidate, temporary, fixtureDownloader } from './media-helpers.mjs';

const ampleDisk = async () => 100 * 1024 ** 3;
test('shared viewers use one preparation; one cancellation preserves the other viewer', async t => {
  const root = await temporary(t), bytes = Buffer.alloc(2000, 1), source = candidate(1, bytes), downloader = fixtureDownloader(bytes, 40);
  const cache = new MediaCache({ cacheRoot: root, downloader, diskFree: ampleDisk }); await cache.initialize();
  const controller = new AbortController();
  const a = cache.prepare(source, { owner: 'a', signal: controller.signal });
  const b = cache.prepare(source, { owner: 'b' });
  await new Promise(resolve => setTimeout(resolve, 10)); controller.abort(new Error('a stopped'));
  await assert.rejects(a, /a stopped/); assert.equal((await b).metrics.fixture, true);
  assert.equal(downloader.state.calls, 1); assert.equal(cache.pins.get(source.id).has('b'), true);
  cache.releaseOwner('b'); await cache.shutdown();
});

test('last viewer cancellation releases reservations and incomplete files', async t => {
  const root = await temporary(t), bytes = Buffer.alloc(1000, 1), downloader = fixtureDownloader(bytes, 50);
  const cache = new MediaCache({ cacheRoot: root, downloader, diskFree: ampleDisk }); await cache.initialize();
  const controller = new AbortController(), promise = cache.prepare(candidate(1, bytes), { owner: 'only', signal: controller.signal });
  await new Promise(resolve => setTimeout(resolve, 10)); controller.abort(new Error('cancelled'));
  await assert.rejects(promise, /cancelled/); await cache.shutdown();
  assert.equal((await cache.usage()).reservedBytes, 0);
  assert.equal((await scanFiles(root)).some(f => f.path.includes('.part-')), false);
});

test('at most two downloads run; ready cache survives restart and verifies mutations', async t => {
  const root = await temporary(t), bytes = Buffer.alloc(2000, 1), underlying = fixtureDownloader(bytes);
  let release, twoStarted, timeout;
  const gate = new Promise(resolve => { release = resolve; });
  const overlapping = new Promise((resolve, reject) => { twoStarted = resolve; timeout = setTimeout(() => reject(new Error('Two downloads did not start')), 10000); });
  t.after(() => { clearTimeout(timeout); release(); });
  const state = { calls: 0, active: 0, peak: 0 };
  const downloader = { state, async download(...args) {
    state.calls++; state.active++; state.peak = Math.max(state.peak, state.active);
    if (state.active === 2) twoStarted();
    try { await gate; return await underlying.download(...args); } finally { state.active--; }
  } };
  const cache = new MediaCache({ cacheRoot: root, downloader, diskFree: ampleDisk }); await cache.initialize();
  const prepared = [1, 2, 3].map(n => cache.prepare(candidate(n, bytes), { owner: `owner-${n}` }));
  await overlapping; clearTimeout(timeout); assert.equal(state.active, 2); assert.equal(state.calls, 2);
  release(); await Promise.all(prepared);
  assert.equal(downloader.state.peak, 2);
  const restored = new MediaCache({ cacheRoot: root, downloader, diskFree: ampleDisk }); await restored.initialize();
  await restored.prepare(candidate(1, bytes), { owner: 'restored' }); assert.equal(downloader.state.calls, 3);
  await writeFile(restored.entryPath(candidate(1, bytes)), Buffer.alloc(bytes.length, 2));
  await assert.rejects(restored.prepare(candidate(1, bytes), { owner: 'corrupt' }), { code: 'CACHE_INTEGRITY' });
  restored.releaseOwner('restored');
  const repaired = await restored.prepare(candidate(1, bytes), { owner: 'repair' });
  assert.equal(repaired.metrics.md5, candidate(1, bytes).checksums.md5); assert.equal(downloader.state.calls, 4);
  await cache.shutdown(); await restored.shutdown();
});

test('LRU evicts only inactive originals; current and next pins survive pressure', async t => {
  const root = await temporary(t), bytes = Buffer.alloc(20000, 1), downloader = fixtureDownloader(bytes);
  const cache = new MediaCache({ cacheRoot: root, downloader, limitBytes: 55000, minimumFreeBytes: 0, diskFree: ampleDisk }); await cache.initialize();
  await cache.prepare(candidate(1, bytes), { owner: 'old' }); cache.releaseOwner('old');
  const active = await cache.prepare(candidate(2, bytes), { owner: 'current' });
  await cache.prepare(candidate(3, bytes), { owner: 'next' });
  await assert.rejects(access(cache.entryPath(candidate(1, bytes)))); await access(active.path);
  await assert.rejects(cache.prepare(candidate(4, bytes), { owner: 'fourth' }), { code: 'CACHE_PRESSURE' });
  await access(active.path); await access(cache.entryPath(candidate(3, bytes))); await cache.shutdown();
});

test('quota includes engine temporaries, output reservations, and disk floor', async t => {
  const root = await temporary(t), engine = path.join(root, 'engine'); await mkdir(engine);
  await writeFile(path.join(engine, 'segment.ts'), Buffer.alloc(10000));
  const cache = new MediaCache({ cacheRoot: path.join(root, 'cache'), managedRoots: { transcodes: engine }, limitBytes: 45000,
    minimumFreeBytes: 0, diskFree: ampleDisk, downloader: fixtureDownloader(Buffer.alloc(20000)) }); await cache.initialize();
  await cache.prepare(candidate(1, Buffer.alloc(20000)), { owner: 'current' });
  await assert.rejects(cache.reserveEngine('view', 30000), { code: 'CACHE_PRESSURE' });
  assert.equal((await cache.usage()).engineBytes, 10000);
  const low = new MediaCache({ cacheRoot: path.join(root, 'low'), minimumFreeBytes: 90000, diskFree: async () => 100000,
    downloader: fixtureDownloader(Buffer.alloc(20000)) }); await low.initialize();
  await assert.rejects(low.prepare(candidate(1, Buffer.alloc(20000)), { owner: 'low' }), { code: 'CACHE_PRESSURE' });
  await cache.shutdown(); await low.shutdown();
});

test('import cannot read an arbitrary external file; managed links are refused', async t => {
  const root = await temporary(t), outside = path.join(root, 'outside.mkv'); await writeFile(outside, 'mock');
  const cache = new MediaCache({ cacheRoot: path.join(root, 'cache'), importRoots: [path.join(root, 'approved')], diskFree: ampleDisk });
  await mkdir(path.join(root, 'approved')); await cache.initialize();
  await assert.rejects(cache.importVerified(candidate(1, Buffer.from('mock')), outside), { code: 'IMPORT_PATH' });
  const linked = path.join(cache.root, 'linked');
  await symlink(path.join(root, 'approved'), linked, process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(scanFiles(cache.root), { code: 'CACHE_LINK' });
  await rm(linked); // Remove only the verified test link before recursive fixture cleanup.
});

test('unchanged capacity checks do not rewrite the manifest and a new admission still checks current free space', async t => {
  const root = await temporary(t), bytes = Buffer.alloc(2000, 1), downloader = fixtureDownloader(bytes); let free = 100000000000;
  const cache = new MediaCache({ cacheRoot: root, downloader, diskFree: async () => free }); await cache.initialize();
  const original = cache.persist.bind(cache); let writes = 0;
  cache.persist = async () => { writes++; return original(); };
  const before = await readFile(path.join(root, 'cache.json'), 'utf8');
  for (let tick = 0; tick < 60; tick++) await cache.maintain();
  assert.equal(writes, 0); assert.equal(await readFile(path.join(root, 'cache.json'), 'utf8'), before);
  free = 0;
  await assert.rejects(cache.prepare(candidate(1, bytes), { owner: 'first-after-idle' }), { code: 'CACHE_PRESSURE' });
  assert.equal(downloader.state.calls, 0); assert.equal(writes, 0); await cache.shutdown();
});

test('partial eviction is persisted even when pinned media still prevents quota admission', async t => {
  const root = await temporary(t), bytes = Buffer.alloc(5000, 1), downloader = fixtureDownloader(bytes);
  const cache = new MediaCache({ cacheRoot: root, downloader, minimumFreeBytes: 0, diskFree: ampleDisk }); await cache.initialize();
  const old = candidate(1, bytes), active = candidate(2, bytes);
  await cache.prepare(old, { owner: 'old' }); cache.releaseOwner('old');
  const pinned = await cache.prepare(active, { owner: 'current' }); cache.limitBytes = 1000;
  await assert.rejects(cache.maintain(), { code: 'CACHE_PRESSURE' });
  await assert.rejects(access(cache.entryPath(old))); await access(pinned.path);
  const persisted = JSON.parse(await readFile(path.join(root, 'cache.json'), 'utf8'));
  assert.deepEqual(persisted.entries.map(record => record.candidate.id), [active.id]);
  await cache.shutdown();
});
