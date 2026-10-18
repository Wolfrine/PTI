import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { JellyfinClient, selectTracks, rewriteManifest, deviceProfile } from '../src/media/jellyfin.mjs';
import { temporary } from './media-helpers.mjs';

const item = '11111111111111111111111111111111', source = '22222222222222222222222222222222';
const streams = [
  { Type: 'Video', Index: 0, Codec: 'hevc' },
  { Type: 'Audio', Index: 1, Language: 'eng', IsDefault: true, Codec: 'aac' },
  { Type: 'Audio', Index: 2, Language: 'jpn', Codec: 'aac', Channels: 2 },
  { Type: 'Subtitle', Index: 3, Language: 'eng', Title: 'Song & Signs', IsDefault: true },
  { Type: 'Subtitle', Index: 4, Language: 'eng', Title: 'English' },
];

test('metadata chooses Japanese and full dialogue; defaults and fixed index conventions are irrelevant', () => {
  assert.deepEqual(selectTracks(streams), { audioIndex: 2, subtitleIndex: 4, audioLanguage: 'jpn', subtitleLanguage: 'eng' });
  assert.equal(selectTracks(streams.map(s => ({ ...s, Index: s.Index + 10 }))).subtitleIndex, 14);
  assert.equal(selectTracks(streams, 1).audioIndex, 1);
  assert.equal(selectTracks(streams,undefined,'en').audioIndex,1);
  assert.equal(selectTracks(streams.map(s=>({...s,Index:s.Index+20})),undefined,'eng').audioIndex,21);
  assert.equal(selectTracks(streams.filter(s=>s.Type!=='Audio'||s.Language==='jpn'),undefined,'en').audioLanguage,'jpn');
  assert.throws(() => selectTracks(streams.filter(s => s.Language !== 'jpn')), { code: 'TRACKS_UNVERIFIED' });
  assert.throws(() => selectTracks([...streams, { Type: 'Subtitle', Index: 9, Language: 'eng', Title: 'Full English' }]), { code: 'TRACKS_UNVERIFIED' });
  assert.equal(deviceProfile('compatible-h264').TranscodingProfiles[0].VideoCodec, 'h264');
  assert.deepEqual(deviceProfile('cast-h264').CodecProfiles, deviceProfile('compatible-h264').CodecProfiles);
  assert.equal(deviceProfile('cast-h264').CodecProfiles[0].Conditions[0].Value, '8');
  assert.throws(() => deviceProfile('arbitrary-profile'), { code: 'INVALID_MODE' });
});

test('engine is loopback-only and non-verified HEVC mode is refused before work', async t => {
  const root = await temporary(t);
  assert.throws(() => new JellyfinClient({ baseUrl: 'http://192.168.1.2:8096', tokenProvider: () => 'fixture-token', originalRoot: root, transcodeRoot: root }));
  const engine = new JellyfinClient({ tokenProvider: () => 'fixture-token', originalRoot: root, transcodeRoot: root });
  await assert.rejects(engine.openPlayback({ sessionId: 'test', entry: {}, mode: 'hevc-fmp4' }), { code: 'UNVERIFIED_MODE' });
  await assert.rejects(engine.ensureFile(path.dirname(root)), { code: 'ENGINE_PATH' });
  await assert.rejects(engine.openPlayback({ sessionId: 'test', entry: {}, mode: 'cast-h264', inspectedItem: { Id: item, MediaSources: [{ Id: source, MediaStreams: streams }] } }), { code: 'TIMING_UNVERIFIED' });
});

test('Cast uses forced aligned two-second H264 while local playback keeps stream copy and selected duration', async t => {
  const root = await temporary(t), requests = [];
  const engine = new JellyfinClient({ originalRoot: root, transcodeRoot: root, tokenProvider: () => 'fixture-token',
    timingInspector: async (file, selected) => {
      assert.equal(selected.audioIndex, 2); assert.equal(selected.videoIndex, 0);
      return { effectiveDurationSeconds: 1419.04, containerDurationSeconds: 1432.415, source: 'explicit fixture' };
    } });
  engine.request = async (route, options) => { requests.push(options.body); return { PlaySessionId: 'play-a', MediaSources: [
    { Id: source, DefaultAudioStreamIndex: 2, RunTimeTicks: 14324150000, TranscodingUrl: `/Videos/${item}/master.m3u8?MediaSourceId=${source}&PlaySessionId=play-a` }
  ] }; };
  const inspectedItem = { Id: item, MediaSources: [{ Id: source, MediaStreams: streams }] };
  const cast = await engine.openPlayback({ sessionId: 'cast', entry: { path: 'explicit-fixture.mkv' }, mode: 'cast-h264', inspectedItem });
  const local = await engine.openPlayback({ sessionId: 'local', entry: { path: 'explicit-fixture.mkv' }, inspectedItem });
  assert.equal(requests[0].AllowVideoStreamCopy, false); assert.equal(requests[0].DeviceProfile.TranscodingProfiles[0].SegmentLength, 2);
  assert.equal(requests[1].AllowVideoStreamCopy, true); assert.equal(requests[1].DeviceProfile.TranscodingProfiles[0].SegmentLength, 3);
  assert.equal(cast.durationSeconds, 1419.04); assert.equal(local.durationSeconds, 1419.04);
  assert.equal(cast.containerDurationSeconds, 1432.415); assert.equal(cast.selected.subtitleIndex, 4);
  assert.equal(engine.verifiedModes.has('cast-h264'), true);
});

test('private admin query never reaches playlists; all nested URI kinds become session-authorized', async t => {
  const root = await temporary(t), fetched = [];
  const engine = new JellyfinClient({ originalRoot: root, transcodeRoot: root, tokenProvider: () => 'private-fixture-token', fetchImpl: async (url, options) => {
    fetched.push(url); assert.ok(!/apikey|access_token/i.test(url)); assert.match(options.headers.Authorization, /private-fixture-token/);
    return new Response(`#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="/Videos/${item}/${source}/Subtitles/4/0/Stream.vtt?ApiKey=private-query"\n#EXT-X-MAP:URI="init.mp4?ApiKey=private-query"\nmain.m3u8?PlaySessionId=play-a&ApiKey=private-query\n`, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } });
  } });
  const session = { itemId: item, mediaSourceId: source, playSessionId: 'play-a', deviceId: 'device-a', selected: { subtitleIndex: 4 }, allowed: new Set() };
  const seed = engine.canonicalResource(`/videos/${item}/master.m3u8?ApiKey=private-query&PlaySessionId=play-a`, session);
  session.allowed.add(seed); engine.sessions.set('viewer-a', session);
  const result = await engine.getPlaybackResource('viewer-a', seed);
  assert.equal(result.resources.length, 3); assert.ok(!result.manifestText.includes('private-query'));
  const rewritten = rewriteManifest(result.manifestText, uri => `/ticket/${encodeURIComponent(uri)}`);
  assert.equal((rewritten.match(/\/ticket\//g) ?? []).length, 3);
  await assert.rejects(engine.getPlaybackResource('viewer-a', `/videos/${item}/master.m3u8?videoBitRate=99999999999`), { code: 'MEDIA_RESOURCE' });
  await assert.rejects(engine.getPlaybackResource('viewer-a', `/Videos/${item}/${source}/Subtitles/3/0/Stream.vtt`), { code: 'MEDIA_RESOURCE' });
  const other = { ...session, itemId: '33333333333333333333333333333333', allowed: new Set() }; engine.sessions.set('viewer-b', other);
  await assert.rejects(engine.getPlaybackResource('viewer-b', seed), { code: 'MEDIA_RESOURCE' });
  await assert.rejects(engine.getPlaybackResource('viewer-a', 'http://127.0.0.1:18096/System/Configuration'), { code: 'MEDIA_RESOURCE' });
  assert.equal(fetched.length, 1);
});

test('configure disables bulk work, activates its exact engine root serially and sets bounded storage behavior', async t => {
  const root = await temporary(t), writes = [], routes = [];
  const engine = new JellyfinClient({ originalRoot: root, transcodeRoot: path.join(root, 'transcodes'), tokenProvider: () => 'fixture-token' });
  engine.request = async (route, options = {}) => {
    routes.push([route, options.method ?? 'GET']);
    if (options.method === 'POST') { writes.push([route, options.body]); return null; }
    if (route.endsWith('/network')) return { AutoDiscovery: false, EnableRemoteAccess: false, LocalNetworkAddresses: ['127.0.0.1'] };
    if (route.endsWith('/encoding')) return { HardwareAccelerationType: 'none' };
    if (route === '/System/Info/Public') return { Version: '12.2.0' };
    if (route === '/System/Info') return { TranscodingTempPath: path.join(root, 'transcodes') };
    if (route === '/ScheduledTasks') return [{ Id: 'task', Name: 'Extract' }];
    if (route === '/Library/VirtualFolders') return [{ Name: 'PTI One Piece Cache', ItemId: item, Locations: [root] }];
    throw new Error('Unexpected fixture route');
  };
  await engine.configure();
  assert.deepEqual(writes.find(([p]) => p.includes('/Triggers'))[1], []);
  const encoding = writes.find(([p]) => p.endsWith('/encoding'))[1];
  assert.equal(encoding.EnableThrottling, true); assert.equal(encoding.EnableSegmentDeletion, true);
  const library = writes.find(([p]) => p.endsWith('/LibraryOptions'))[1].LibraryOptions;
  assert.equal(library.EnableRealtimeMonitor, false); assert.equal(library.EnableTrickplayImageExtraction, false);
  assert.deepEqual(library.TypeOptions[0].MetadataFetchers, []);
  const configured = routes.findIndex(([route, method]) => route === '/System/Configuration/encoding' && method === 'POST');
  const activated = routes.findIndex(([route]) => route === '/System/Info'), imported = routes.findIndex(([route]) => route === '/Library/VirtualFolders');
  assert.ok(configured >= 0 && activated > configured && imported > activated);
  const operation = engine.request;
  engine.request = async (route, options) => route === '/System/Info' ? { TranscodingTempPath: path.join(root, 'unmanaged') } : operation(route, options);
  await assert.rejects(engine.configure(), { code: 'ENGINE_TRANSCODE_PATH' });
  engine.request = async (route, options) => { if (route === '/System/Info') throw new Error('Fixture engine activation failed'); return operation(route, options); };
  await assert.rejects(engine.configure(), /Fixture engine activation failed/);
});

test('unselected audio tail is removed before resources enter the session graph', async t => {
  const root = await temporary(t);
  const engine = new JellyfinClient({ originalRoot: root, transcodeRoot: root, tokenProvider: () => 'fixture-token', fetchImpl: async () => new Response(
    '#EXTM3U\n#EXT-X-TARGETDURATION:3\n' + Array.from({ length: 5 }, (_, i) => `#EXTINF:2,\n${i}.ts\n`).join('') + '#EXT-X-ENDLIST\n',
    { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }) });
  const seed = `/Videos/${item}/main.m3u8`;
  engine.sessions.set('bounded-tail', { itemId: item, mediaSourceId: source, selected: { subtitleIndex: 4 }, deviceId: 'fixture',
    allowed: new Set([seed]), durationSeconds: 4.5, timing: { source: 'explicit fixture' } });
  const response = await engine.getPlaybackResource('bounded-tail', seed);
  assert.equal(response.resources.length, 3); assert.match(response.manifestText, /#EXTINF:0.5,/);
  await assert.rejects(engine.getPlaybackResource('bounded-tail', `/Videos/${item}/3.ts`), { code: 'MEDIA_RESOURCE' });
});
