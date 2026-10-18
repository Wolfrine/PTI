import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFile, readFile, open, access, rm, symlink, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaCache } from '../src/media/cache.mjs';
import { JellyfinClient } from '../src/media/jellyfin.mjs';
import { MediaCoordinator } from '../src/media/coordinator.mjs';
import { canonicalEpisodeId } from '../src/sources/archive.mjs';
import { preparedRecipe, renditionId, canonicalCaptionHash, validatePreparedMetadata, finalizePreparedFiles, inspectMp4Atoms } from '../src/media/prepared.mjs';
import { candidate, temporary, fixtureDownloader } from './media-helpers.mjs';

const captions = Buffer.from('WEBVTT\n\n1\n00:00:00.000 --> 00:00:01.000\nExplicit fixture English dialogue\n');
function presentation(source, audioIndex = 1) {
  const streams = [{ Type: 'Video', Index: 0, Codec: 'h264', BitDepth: 8, Profile: 'High', Level: 40, Width: 1280, Height: 720 },
    { Type: 'Audio', Index: 1, Codec: 'aac', Channels: 2, Language: 'jpn' }, { Type: 'Audio', Index: 2, Codec: 'aac', Channels: 2, Language: 'eng' },
    { Type: 'Subtitle', Index: 3, Codec: 'ass', Language: 'eng', Title: 'Full English' }];
  const value = { item: { Id: '11111111111111111111111111111111' }, source: { Id: '22222222222222222222222222222222', MediaStreams: streams },
    selected: { audioIndex, subtitleIndex: 3, audioLanguage: audioIndex === 1 ? 'jpn' : 'eng', subtitleLanguage: 'eng' }, timing: { effectiveDurationSeconds: 1, containerDurationSeconds: 1 } };
  value.recipe = preparedRecipe({ candidate: source, ...value }); return value;
}
async function fixture(t, options = {}) {
  const root = await temporary(t), bytes = Buffer.from('explicit original fixture bytes');
  const cache = new MediaCache({ cacheRoot: root, downloader: fixtureDownloader(bytes), minimumFreeBytes: 0, limitBytes: 512 * 1024 ** 2, diskFree: async () => 100 * 1024 ** 3, ...options });
  await cache.initialize(); t.after(() => cache.shutdown());
  return { root, cache, bytes, source: candidate(1000, bytes) };
}
const producer = (view, options = {}) => async ({ paths, signal }) => {
  options.state && options.state.calls++; await options.wait; if (signal.aborted) throw signal.reason;
  if (options.sparseBytes) { const file = await open(paths.video, 'wx'); await file.truncate(options.sparseBytes); await file.close(); }
  else await writeFile(paths.video, 'Explicit mock MP4 bytes, not a playable video');
  await writeFile(paths.captions, captions);
  return { metadata: { fixture: true }, presentation: view, metrics: { fixture: true } };
};

test('recipe isolates original checksum, selected audio and pipeline; only inspected compatible H264 permits copy', () => {
  const source = candidate(1000), ja = presentation(source), en = presentation(source, 2);
  assert.equal(ja.recipe.videoPolicy, 'copy-compatible-h264'); assert.notEqual(renditionId(ja.recipe), renditionId(en.recipe));
  ja.source.MediaStreams[0].Codec = 'hevc'; ja.source.MediaStreams[0].BitDepth = 10;
  const hevc = preparedRecipe({ candidate: source, ...ja }); assert.equal(hevc.videoPolicy, 'convert-h264-8bit');
  assert.throws(() => renditionId({ ...hevc, original: { ...hevc.original, id: '../../outside' } }), { code: 'PREPARED_INVALID' });
  assert.throws(() => renditionId({ ...hevc, external: 'https://untrusted.invalid/' }), { code: 'PREPARED_INVALID' });
});

test('versioned cue identity permits IDs/settings/header formatting but rejects dialogue or timing changes', () => {
  const a = canonicalCaptionHash(captions);
  assert.deepEqual(a, canonicalCaptionHash(captions.toString().replace('\n1\n', '\nother-id\n').replace(' --> ', '  -->  ').replace('01.000\n', '01.000 align:center\n').replaceAll('\n', '\r\n')));
  assert.notEqual(a.sha256, canonicalCaptionHash(captions.toString().replace('dialogue', 'changed dialogue')).sha256);
  assert.notEqual(a.sha256, canonicalCaptionHash(captions.toString().replace('01.000', '02.000')).sha256);
  assert.equal(canonicalCaptionHash(Buffer.concat([captions, Buffer.from('\n2\n00:00:02.000 --> 00:00:03.000\n\n')])).cues, 2);
  assert.throws(() => canonicalCaptionHash('WEBVTT\n\n00:00:02.000 --> 00:00:03.000\n'), { code: 'PREPARED_INVALID' });
});

test('complete gate rejects HEVC/10bit, extra audio and unselected English-duration tail', () => {
  const recipe = presentation(candidate(1000)).recipe;
  const metadata = { format: { duration: '1' }, streams: [{ codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 1280, height: 720, level: 40, start_time: '0' },
    { codec_type: 'audio', codec_name: 'aac', channels: 2, start_time: '0', tags: { language: 'jpn' } }] };
  assert.equal(validatePreparedMetadata(metadata, recipe), metadata);
  assert.throws(() => validatePreparedMetadata({ ...metadata, format: { duration: 14 } }, recipe), { code: 'PREPARED_INVALID' });
  assert.throws(() => validatePreparedMetadata({ ...metadata, streams: [{ ...metadata.streams[0], pix_fmt: 'yuv420p10le' }, metadata.streams[1]] }, recipe));
  assert.throws(() => validatePreparedMetadata({ ...metadata, streams: [...metadata.streams, metadata.streams[1]] }, recipe));
  assert.throws(() => validatePreparedMetadata({ ...metadata, streams: [metadata.streams[0], { ...metadata.streams[1], tags: { language: 'eng' } }] }, recipe));
  assert.throws(() => validatePreparedMetadata({ ...metadata, streams: [{ ...metadata.streams[0], width: undefined }, metadata.streams[1]] }, recipe));
});

function atom(type) { const value = Buffer.alloc(8); value.writeUInt32BE(8); value.write(type, 4, 'ascii'); return value; }
const mockClassic = Buffer.concat(['ftyp', 'moov', 'mdat'].map(atom));
const mockFragmented = Buffer.concat(['ftyp', 'moov', 'moof', 'mdat'].map(atom));
function inspectedMockMetadata() { return { format: { duration: '1' }, streams: [
  { codec_type: 'video', codec_name: 'h264', pix_fmt: 'yuv420p', width: 1280, height: 720, level: 40, start_time: '0' },
  { codec_type: 'audio', codec_name: 'aac', channels: 2, start_time: '0', tags: { language: 'jpn' } }] }; }

test('finalization with explicit fake atoms requires classic front index, selected-track probe and three decode checkpoints', async t => {
  const root = await temporary(t), recipe = presentation(candidate(1000)).recipe, calls = [];
  const paths = { raw: path.join(root, 'mock.progressive.part.mp4'), video: path.join(root, 'mock.video.part.mp4'), captions: path.join(root, 'mock.captions.part') };
  const result = await finalizePreparedFiles({ response: new Response(mockFragmented, { headers: { 'content-type': 'video/mp4' } }), captions, paths, recipe,
    maximumOutputBytes: 1024, ffmpegPath: path.join(root, 'ffmpeg.exe'), ffprobePath: path.join(root, 'ffprobe.exe'), checkStorage: async () => {},
    run: async (tool, args) => { calls.push({ tool: path.basename(tool), args });
      if (args.includes('+faststart')) { assert.deepEqual(args.slice(args.indexOf('-c'), args.indexOf('-c') + 2), ['-c', 'copy']); await writeFile(paths.video, mockClassic); }
      return { output: JSON.stringify(inspectedMockMetadata()), code: 0 };
    } });
  assert.equal(result.metrics.faststartCopy, true); assert.equal(result.metrics.decodedStartMiddleEnd, true);
  assert.equal(calls.filter(call => call.args.includes('-ss')).length, 3); assert.equal(calls.filter(call => call.tool === 'ffprobe.exe').length, 1);
  assert.ok(calls.filter(call => call.args.includes('-ss')).every(call => call.args[call.args.indexOf('-t') + 1] === '0.25'), 'FFmpeg requires a leading digit for fractional duration');
  assert.deepEqual(await readFile(paths.captions), captions); assert.equal((await inspectMp4Atoms(paths.video)).frontIndex, true);
});

test('bounded progressive preparation refuses oversize before invoking a tool or publishing captions', async t => {
  const root = await temporary(t), paths = { raw: path.join(root, 'raw'), video: path.join(root, 'video'), captions: path.join(root, 'caption') };
  await assert.rejects(finalizePreparedFiles({ response: new Response(mockFragmented, { headers: { 'content-type': 'video/mp4' } }), captions, paths,
    recipe: presentation(candidate(1000)).recipe, maximumOutputBytes: 8, ffmpegPath: path.join(root, 'ffmpeg.exe'), ffprobePath: path.join(root, 'ffprobe.exe'),
    checkStorage: async () => {}, run: async () => { throw new Error('An oversize preparation must not launch a tool'); } }), { code: 'PREPARED_INVALID' });
  await assert.rejects(access(paths.video)); await assert.rejects(access(paths.captions));
});

test('atomic v2 manifest migrates originals, shares prepared jobs and cancellation leaves another viewer intact', async t => {
  const { root, cache, source } = await fixture(t); const view = presentation(source), state = { calls: 0 }; let release;
  const wait = new Promise(resolve => { release = resolve; }), abort = new AbortController();
  await cache.prepare(source, { owner: 'a' }); await cache.prepare(source, { owner: 'b' });
  const make = producer(view, { state, wait });
  const a = cache.prepareRendition(view.recipe, { owner: 'a', signal: abort.signal, prepare: make });
  const b = cache.prepareRendition(view.recipe, { owner: 'b', prepare: make });
  await delay(20); abort.abort(new Error('first viewer left')); await assert.rejects(a, /first viewer left/); release();
  const result = await b; assert.equal(state.calls, 1); assert.ok(cache.renditionPins.get(result.id).has('b'));
  const manifest = JSON.parse(await readFile(path.join(root, 'cache.json'))); assert.equal(manifest.version, 2); assert.equal(manifest.entries.length, 1); assert.equal(manifest.renditions.length, 1);
  assert.equal(JSON.stringify(manifest.renditions).includes('paths'), false);
  const restored = new MediaCache({ cacheRoot: root, minimumFreeBytes: 0, diskFree: async () => 100 * 1024 ** 3 }); await restored.initialize();
  const reused = await restored.findRendition(source, { owner: 'restart', audioLanguage: 'ja' });
  assert.equal(reused.video.sha256, result.video.sha256); assert.equal(reused.presentation.selected.audioIndex, 1); await restored.shutdown();
});

test('prepared corruption cannot replace another active viewer; last owner can repair once idle', async t => {
  const { cache, source } = await fixture(t); const view = presentation(source), state = { calls: 0 }, make = producer(view, { state });
  const ready = await cache.prepareRendition(view.recipe, { owner: 'active', prepare: make });
  await delay(10); await writeFile(ready.paths.video, 'corruption');
  await assert.rejects(cache.prepareRendition(view.recipe, { owner: 'other', prepare: make }), { code: 'CACHE_INTEGRITY' });
  assert.equal(state.calls, 1); cache.releaseOwner('active');
  const repaired = await cache.prepareRendition(view.recipe, { owner: 'repair', prepare: make }); assert.equal(state.calls, 2); await access(repaired.paths.video);
});

test('all recipes prepare serially; aborted/incomplete output is never adopted and releases reservations', async t => {
  const { cache, source } = await fixture(t), a = presentation(source), b = presentation(source, 2);
  let active = 0, peak = 0;
  const make = view => async options => { active++; peak = Math.max(peak, active); try { await delay(20); return await producer(view)(options); } finally { active--; } };
  await Promise.all([cache.prepareRendition(a.recipe, { owner: 'a', prepare: make(a) }), cache.prepareRendition(b.recipe, { owner: 'b', prepare: make(b) })]);
  assert.equal(peak, 1); assert.equal(cache.renditions.size, 2); assert.equal(cache.preparedReservations.size, 0);
  const c = presentation(candidate(1001, Buffer.from('next fixture')));
  await assert.rejects(cache.prepareRendition(c.recipe, { owner: 'broken', prepare: async ({ paths }) => { await writeFile(paths.video, 'incomplete'); throw new Error('producer failed'); } }), /producer failed/);
  assert.equal(cache.renditions.size, 2); assert.equal(cache.renditionJobs.size, 0); assert.equal((await cache.usage()).reservedBytes, 0);
});

test('idle rendition LRU evicts before originals; active current/next files survive peak admission pressure', async t => {
  const { cache, bytes } = await fixture(t, { limitBytes: 320 * 1024 ** 2 });
  const prepare = async (number, owner) => { const source = candidate(number, bytes), view = presentation(source); await cache.prepare(source, { owner });
    return cache.prepareRendition(view.recipe, { owner, prepare: producer(view, { sparseBytes: 64 * 1024 ** 2 }) }); };
  const old = await prepare(1, 'old'); cache.releaseOwner('old');
  const current = await prepare(2, 'current'), next = await prepare(3, 'next');
  await assert.rejects(access(old.paths.video)); await access(current.paths.video); await access(next.paths.video);
  await assert.rejects(prepare(4, 'fourth'), { code: 'CACHE_PRESSURE' }); await access(current.paths.video); await access(next.paths.video);
  assert.ok((await cache.usage()).projectedBytes <= cache.limitBytes);
});

test('prepared directories cannot redirect admission or eviction through a junction', async t => {
  const { root, cache, source } = await fixture(t), view = presentation(source), paths = cache.renditionPaths(renditionId(view.recipe));
  const outside = path.join(root, 'outside'); await mkdir(outside); await symlink(outside, paths.directory, process.platform === 'win32' ? 'junction' : 'dir');
  try { await assert.rejects(cache.prepareRendition(view.recipe, { owner: 'linked', prepare: producer(view) }), { code: 'CACHE_LINK' }); }
  finally { await rm(paths.directory); }
});

test('prepared client binds derived indices internally, validates original cue lineage and admits only two exact roles', async t => {
  const root = await temporary(t), original = candidate(1001), view = presentation(original), id = renditionId(view.recipe), calls = [];
  const derivedId = '33333333333333333333333333333333', derivedSource = '44444444444444444444444444444444';
  const videoBytes = Buffer.from('explicit fixture prepared stream');
  const engine = new JellyfinClient({ originalRoot: path.join(root, 'originals'), preparedRoot: path.join(root, 'renditions'), transcodeRoot: path.join(root, 'transcodes'),
    tokenProvider: () => 'explicit-fixture-secret', preparedEnabled: true, ffmpegPath: path.join(root, 'ffmpeg.exe'), ffprobePath: path.join(root, 'ffprobe.exe'),
    timingInspector: async () => view.timing, verifiedModes: ['compatible-h264', 'prepared-mp4'], fetchImpl: async (url, options) => {
      calls.push(url); if (url.includes('/Subtitles/')) return new Response(captions.toString().replace('\n1\n', '\nreindexed\n'), { headers: { 'content-type': 'text/vtt' } });
      const range = /^bytes=(\d+)-(\d+)$/.exec(options.headers.Range), start = Number(range[1]), end = Number(range[2]);
      return new Response(videoBytes.subarray(start, end + 1), { status: 206, headers: { 'content-type': 'video/mp4', 'accept-ranges': 'bytes',
        'content-length': String(end - start + 1), 'content-range': `bytes ${start}-${end}/${videoBytes.length}` } });
    } });
  engine.request = async () => null;
  engine.ensurePreparedFile = async () => ({ Id: derivedId, MediaSources: [{ Id: derivedSource, MediaStreams: [
    { Type: 'Audio', Index: 9, Codec: 'aac', Channels: 2, Language: 'jpn' }, { Type: 'Subtitle', Index: 0, Codec: 'vtt', Language: 'eng' }] }] });
  const record = { id, recipe: view.recipe, video: { bytes: videoBytes.length }, captions: { sha256: '0'.repeat(64), cueIdentity: canonicalCaptionHash(captions) } };
  const descriptor = await engine.openPreparedPlayback({ sessionId: 'prepared-test', entry: { candidate: original }, rendition: record, presentation: view });
  assert.equal(descriptor.selected.audioIndex, 1); assert.equal(descriptor.selected.subtitleIndex, 3); assert.equal(descriptor.contentType, 'video/mp4');
  assert.equal(engine.sessions.get('prepared-test').selected.audioIndex, 9); assert.equal(engine.sessions.get('prepared-test').selected.subtitleIndex, 0);
  const response = await engine.getPlaybackResource('prepared-test', descriptor.masterPath, { range: 'bytes=0-7' });
  assert.equal(response.longLived, true); assert.equal((await new Response(response.body).arrayBuffer()).byteLength, 8);
  await assert.rejects(engine.getPlaybackResource('prepared-test', descriptor.masterPath.replace('Static=true', 'Static=false')), { code: 'MEDIA_RESOURCE' });
  await assert.rejects(engine.getPlaybackResource('prepared-test', descriptor.subtitlePath.replace('/Subtitles/0/', '/Subtitles/3/')), { code: 'MEDIA_RESOURCE' });
  await assert.rejects(engine.getPlaybackResource('prepared-test', descriptor.masterPath.replace(derivedId, view.item.Id)), { code: 'MEDIA_RESOURCE' });
  const before = calls.length; engine.fetchImpl = async () => new Response(captions.toString().replace('dialogue', 'wrong source dialogue'), { headers: { 'content-type': 'text/vtt' } });
  await assert.rejects(engine.openPreparedPlayback({ sessionId: 'wrong-caption', entry: {}, rendition: record, presentation: view }), { code: 'CAPTION_LINEAGE' });
  assert.equal(engine.sessions.has('wrong-caption'), false); assert.ok(before >= 2); await engine.stopSession('prepared-test');
});

class FixturePreparedEngine {
  verifiedModes = new Set(['compatible-h264', 'prepared-mp4']); calls = 0; contexts = new Map();
  async configure() { return { fixture: true }; }
  async inspectPresentation(entry, options) { return presentation(entry.candidate, options.audioIndex ?? (options.audioLanguage === 'eng' ? 2 : 1)); }
  async prepareRendition(options) { this.calls++; return producer(options.presentation)(options); }
  async openPreparedPlayback({ sessionId, rendition, presentation: view }) {
    const descriptor = { mode: 'prepared-mp4', contentType: 'video/mp4', masterPath: `/fixture/${sessionId}/video.mp4`, subtitlePath: `/fixture/${sessionId}/captions.vtt`,
      selected: view.selected, durationSeconds: 1, renditionId: rendition.id }; this.contexts.set(sessionId, descriptor); return descriptor;
  }
  ownsResource(id, relative) { const descriptor = this.contexts.get(id); return descriptor && [descriptor.masterPath, descriptor.subtitlePath].includes(relative); }
  async getPlaybackResource(id, relative) { assert.ok(this.ownsResource(id, relative)); return { status: 206, body: new Blob(['explicit fixture first range']).stream() }; }
  async stopSession(id) { this.contexts.delete(id); }
  async reportProgress() {}
}
const catalogFor = bytes => ({ episodes: Array.from({ length: 1085 }, (_, i) => ({ id: canonicalEpisodeId(i + 1), episodeNumber: i + 1,
  availability: [1000, 1001].includes(i + 1) ? 'listed' : 'missing', candidates: [1000, 1001].includes(i + 1) ? [candidate(i + 1, bytes)] : [] })) });

test('prepared coordinator shares rendition across profiles and adopts the same queued cross-source context', async t => {
  const { cache, bytes } = await fixture(t); const engine = new FixturePreparedEngine(), media = new MediaCoordinator({ catalog: catalogFor(bytes), cache, engine, autoPrefetch: false, monitorMs: 0 });
  t.after(() => media.shutdown());
  const [a, b] = await Promise.all(['a', 'b'].map(id => media.openSession({ sessionId: id, profileId: id, episodeNumber: 1000, mode: 'prepared-mp4' })));
  assert.equal(a.contentType, 'video/mp4'); assert.equal(a.renditionId, b.renditionId); assert.equal(engine.calls, 1);
  const queued = await media.prepareNextPlayback('a'); assert.equal(queued.episodeNumber, 1001); assert.equal(engine.calls, 2);
  const adopted = await media.switchEpisode('a', 1001); assert.equal(adopted.masterPath, queued.masterPath); assert.equal(engine.calls, 2);
  assert.equal(cache.renditionPins.size, 2); await media.closeSession('a'); await media.closeSession('b'); assert.equal(cache.renditionPins.size, 0);
});

test('persisted prepared playback survives restart with a missing original without re-downloading or re-encoding', async t => {
  const { root, cache, bytes, source } = await fixture(t), engine = new FixturePreparedEngine();
  const media = new MediaCoordinator({ catalog: catalogFor(bytes), cache, engine, autoPrefetch: false, monitorMs: 0 });
  const before = await media.openSession({ sessionId: 'before', profileId: 'profile', episodeNumber: 1000, mode: 'prepared-mp4' }); await media.shutdown();
  await rm(cache.entryPath(source));
  const restored = new MediaCache({ cacheRoot: root, minimumFreeBytes: 0, diskFree: async () => 100 * 1024 ** 3, downloader: { async download() { throw new Error('Unexpected original download'); } } });
  const secondEngine = new FixturePreparedEngine(), next = new MediaCoordinator({ catalog: catalogFor(bytes), cache: restored, engine: secondEngine, autoPrefetch: false, monitorMs: 0 });
  await next.initialize(); t.after(() => next.shutdown());
  const after = await next.openSession({ sessionId: 'after', profileId: 'profile', episodeNumber: 1000, mode: 'prepared-mp4' });
  assert.equal(after.renditionId, before.renditionId); assert.equal(secondEngine.calls, 0); assert.equal(restored.entries.size, 0); assert.equal(after.selected.audioIndex, 1);
});
