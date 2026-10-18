import test from 'node:test';
import assert from 'node:assert/strict';
import { open } from 'node:fs/promises';
import path from 'node:path';
import { MediaCache } from '../src/media/cache.mjs';
import { MediaCoordinator } from '../src/media/coordinator.mjs';
import { canonicalEpisodeId } from '../src/sources/archive.mjs';
import { candidate, temporary, fixtureDownloader } from './media-helpers.mjs';

function fixtureCatalog(numbers, bytes) {
  const listed = new Set(numbers);
  return { episodes: Array.from({ length: 1085 }, (_, i) => ({ id: canonicalEpisodeId(i + 1), episodeNumber: i + 1,
    availability: listed.has(i + 1) ? 'listed' : 'missing', candidates: listed.has(i + 1) ? [candidate(i + 1, bytes)] : [] })) };
}
class FixtureEngine {
  verifiedModes = new Set(['compatible-h264']); stopped = []; allowed = new Map();
  async configure() { return { version: 'fixture-not-real' }; }
  async ensureFile() { return { MediaSources: [{ RunTimeTicks: 10000000 }] }; }
  async openPlayback({ sessionId, mode }) { const masterPath = `/mock/${sessionId}/master`, subtitlePath = `/mock/${sessionId}/captions.vtt`;
    this.allowed.set(sessionId, new Set([masterPath, subtitlePath])); return { sessionId, mode, masterPath, subtitlePath, selected: { audioIndex: 1, subtitleIndex: 2 } }; }
  async getPlaybackResource(id, resource) {
    if (resource.endsWith('/master')) { const segment = `/mock/${id}/segment.ts`; this.allowed.get(id).add(segment);
      return { manifestText: '#EXTM3U\n' + segment + '\n' }; }
    return { body: new Blob([resource.endsWith('.vtt') ? 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nFixture caption\n' : 'explicit mock transport segment']).stream() };
  }
  async stopSession(id) { this.stopped.push(id); this.allowed.delete(id); }
  ownsResource(id, resource) { return this.allowed.get(id)?.has(resource) ?? false; }
  async reportProgress() {}
}
async function setup(t, numbers, { autoPrefetch = false, limitBytes = 512 * 1024 ** 2, onEmergencyStop = async () => {} } = {}) {
  const root = await temporary(t), bytes = Buffer.from('explicit mock video fixture'), downloader = fixtureDownloader(bytes, 10);
  const cache = new MediaCache({ cacheRoot: root, downloader, minimumFreeBytes: 0, limitBytes, diskFree: async () => 100 * 1024 ** 3 });
  const engine = new FixtureEngine();
  const media = new MediaCoordinator({ catalog: fixtureCatalog(numbers, bytes), cache, engine, monitorMs: 0, autoPrefetch, onEmergencyStop });
  await media.initialize(); t.after(() => media.shutdown()); return { root, media, cache, engine, downloader };
}

test('three independent family sessions; fourth denied, explicit profile takeover required', async t => {
  const { media } = await setup(t, [1, 2, 3]);
  await Promise.all([1, 2, 3].map(n => media.openSession({ sessionId: `s${n}`, profileId: `p${n}`, episodeNumber: n })));
  assert.equal(media.sessions.size, 3);
  await assert.rejects(media.openSession({ sessionId: 's4', profileId: 'p4', episodeNumber: 1 }), { code: 'SESSION_LIMIT' });
  await assert.rejects(media.openSession({ sessionId: 'same-profile', profileId: 'p1', episodeNumber: 1 }), { code: 'PROFILE_IN_USE' });
  await media.openSession({ sessionId: 'takeover', profileId: 'p1', episodeNumber: 1, takeover: true });
  assert.equal(media.snapshot('s1'), null); assert.equal(media.snapshot('takeover').state, 'ready');
  await assert.rejects(media.openSession({ sessionId: 'takeover', profileId: 'intruder', episodeNumber: 2 }), { code: 'SESSION_OWNER' });
});

test('shared source deduplicates preparation and refuses unverified mode before download', async t => {
  const { media, downloader } = await setup(t, [1]);
  await assert.rejects(media.openSession({ sessionId: 'hevc', profileId: 'p', episodeNumber: 1, mode: 'hevc-fmp4' }), { code: 'UNVERIFIED_MODE' });
  assert.equal(downloader.state.calls, 0);
  await Promise.all(['a', 'b'].map(id => media.openSession({ sessionId: id, profileId: id, episodeNumber: 1 })));
  assert.equal(downloader.state.calls, 1);
});

test('receiver queue and adopted next episode keep Cast profile; local handback can restore copy mode', async t => {
  const { media, engine } = await setup(t, [1000, 1001]);
  engine.verifiedModes.add('cast-h264');
  const current = await media.openSession({ sessionId: 'cast-mode', profileId: 'profile', episodeNumber: 1000, mode: 'cast-h264' });
  const queued = await media.prepareNextPlayback('cast-mode');
  assert.equal(current.mode, 'cast-h264'); assert.equal(queued.mode, 'cast-h264');
  const adopted = await media.switchEpisode('cast-mode', 1001);
  assert.equal(adopted.mode, 'cast-h264'); assert.equal(adopted.masterPath, queued.masterPath);
  const local = await media.switchEpisode('cast-mode', 1001, { explicitSelection: true, mode: 'compatible-h264' });
  assert.equal(local.mode, 'compatible-h264');
});

test('ready is withheld until a real first-segment response has completed', async t => {
  const { media, engine } = await setup(t, [1]);
  const original = engine.getPlaybackResource.bind(engine);
  let release, arrived;
  const entered = new Promise(resolve => { arrived = resolve; });
  const blocked = new Promise(resolve => { release = resolve; });
  engine.getPlaybackResource = async (id, resource) => {
    if (resource.endsWith('segment.ts')) { arrived(); await blocked; }
    return original(id, resource);
  };
  let resolved = false;
  const task = media.openSession({ sessionId: 'warming', profileId: 'warming-profile', episodeNumber: 1 }).then(value => { resolved = true; return value; });
  await entered; assert.equal(media.snapshot('warming').state, 'preparing-playback'); assert.equal(resolved, false);
  release(); const descriptor = await task;
  assert.equal(media.snapshot('warming').state, 'ready'); assert.ok(descriptor.preparation.firstSegmentBytes > 0);
});

test('automatic next preparation honors gap 590 and crosses sources at 1000/1001', async t => {
  const { media, downloader } = await setup(t, [589, 591, 1000, 1001, 1085], { autoPrefetch: true });
  await media.openSession({ sessionId: 'gap', profileId: 'gap-profile', episodeNumber: 589 });
  assert.deepEqual(media.snapshot('gap').next, { episodeNumber: 590, availability: 'missing', state: 'blocked' });
  assert.equal(downloader.state.calls, 1);
  await assert.rejects(media.prepareEpisode(591, { sessionId: 'gap' }), { code: 'PREPARATION_SCOPE' });
  await media.closeSession('gap');
  await media.openSession({ sessionId: 'boundary', profileId: 'boundary-profile', episodeNumber: 1000 });
  await media.sessions.get('boundary').nextPromise;
  assert.equal(media.snapshot('boundary').next.episodeNumber, 1001); assert.equal(media.snapshot('boundary').next.state, 'cached');
  await media.closeSession('boundary');
  await media.openSession({ sessionId: 'end', profileId: 'end-profile', episodeNumber: 1085 });
  assert.equal(media.snapshot('end').next.availability, 'outside-sources');
});

test('unexpected external disk pressure cancels engine jobs before temp cleanup and revokes resources', async t => {
  let emergency = 0;
  const { root, media, cache } = await setup(t, [1], { limitBytes: 150 * 1024 ** 2, onEmergencyStop: async () => { emergency++; } });
  await media.openSession({ sessionId: 'watch', profileId: 'profile', episodeNumber: 1 });
  const file = await open(path.join(root, 'external-pressure.fixture'), 'w'); await file.truncate(100 * 1024 ** 2); await file.close();
  await assert.rejects(media.maintain(), { code: 'CACHE_PRESSURE' });
  assert.equal(emergency, 1); assert.equal(cache.engineBudgets.size, 0); assert.equal(cache.pins.size, 0);
  assert.equal(media.snapshot('watch').state, 'storage-paused');
  await assert.rejects(media.getPlaybackResource('watch', '/mock-master'), { code: 'SESSION_NOT_READY' });
});

test('Cast next uses the same lease with narrowly retained old resources and expiry', async t => {
  const { media, engine, downloader } = await setup(t, [1000, 1001], { autoPrefetch: true });
  media.transitionGraceMs = 15;
  const previous = await media.openSession({ sessionId: 'cast', profileId: 'cast-profile', episodeNumber: 1000 });
  await media.sessions.get('cast').nextPromise;
  await Promise.all(['other-a', 'other-b'].map(id => media.openSession({ sessionId: id, profileId: id, episodeNumber: 1000 })));
  const next = await media.switchEpisode('cast', 1001);
  assert.equal(next.sessionId, 'cast'); assert.equal(media.sessions.size, 3); assert.equal(next.episodeNumber, 1001);
  assert.equal(downloader.state.calls, 2);
  await media.getPlaybackResource('cast', previous.masterPath);
  const otherMaster = media.snapshot('other-a').playback.masterPath;
  await assert.rejects(media.getPlaybackResource('cast', otherMaster), { code: 'MEDIA_RESOURCE' });
  await new Promise(resolve => setTimeout(resolve, 25)); await media.maintain();
  await assert.rejects(media.getPlaybackResource('cast', previous.masterPath), { code: 'MEDIA_RESOURCE' });
  assert.equal(engine.allowed.size, 3);
  await assert.rejects(media.reportProgress('cast', { episodeNumber: 1000, positionSeconds: 100 }), { code: 'STALE_PROGRESS' });
});

test('receiver queue authorizes current and next graphs, then adopts its existing engine context', async t => {
  const { media, engine } = await setup(t, [1000, 1001, 1002]);
  const current = await media.openSession({ sessionId: 'queue', profileId: 'queue-profile', episodeNumber: 1000 });
  const before = engine.allowed.size;
  const [queued, duplicate] = await Promise.all([media.prepareNextPlayback('queue'), media.prepareNextPlayback('queue')]);
  assert.equal(queued.masterPath, duplicate.masterPath); assert.equal(media.snapshot('queue').episodeNumber, 1000);
  assert.equal(engine.allowed.size, before + 1); assert.equal(media.sessions.size, 1);
  assert.equal(media.preparedNext('queue').episodeNumber, 1001);
  await media.getPlaybackResource('queue', current.masterPath); await media.getPlaybackResource('queue', queued.masterPath);
  const adopted = await media.switchEpisode('queue', 1001);
  assert.equal(adopted.masterPath, queued.masterPath); assert.equal(engine.allowed.size, before + 1);
  assert.equal(media.preparedNext('queue'), null); assert.equal(media.snapshot('queue').episodeNumber, 1001);
  await media.closeSession('queue'); assert.equal(engine.allowed.size, 0);
  await media.openSession({ sessionId: 'gap-queue', profileId: 'queue-profile', episodeNumber: 1000 });
  await assert.rejects(media.prepareEpisode(1002, { sessionId: 'gap-queue' }), { code: 'PREPARATION_SCOPE' });
});

test('optional receiver queue storage denial leaves current playback intact', async t => {
  const { media, engine } = await setup(t, [1000, 1001], { limitBytes: 150 * 1024 ** 2 });
  const current = await media.openSession({ sessionId: 'small', profileId: 'small-profile', episodeNumber: 1000 });
  await assert.rejects(media.prepareNextPlayback('small'), { code: 'CACHE_PRESSURE' });
  assert.equal(media.snapshot('small').state, 'ready'); assert.equal(media.snapshot('small').next.state, 'waiting-for-space');
  assert.equal(media.preparedNext('small'), null); assert.equal(engine.allowed.size, 1);
  await media.getPlaybackResource('small', current.masterPath);
});
