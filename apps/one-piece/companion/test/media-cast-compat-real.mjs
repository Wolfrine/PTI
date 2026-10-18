/** Opt-in cached-only diagnostic. Never discovers a TV or downloads an original.
 * Run only after acquiring the exclusive pilot-engine lane from the parent.
 * The fetch interceptor changes PlaybackInfo in THIS harness, never production policy.
 */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { ARCHIVE_ITEMS, buildCatalog } from '../src/sources/archive.mjs';
import { createMediaCoordinator } from '../src/media/index.mjs';
import { command } from './media-real.mjs';

const PILOT = 'H:/PTI-OnePiece/pilot/jellyfin';
const ROOT = 'H:/PTI-OnePiece/production-media';
const OUT = `${ROOT}/cast-media-compat`;
const EVIDENCE = new URL('../../../../docs/one-piece/evidence/cast-media-compat/', import.meta.url);
const policies = {
  'copy-ts': { copy: true, container: 'ts' },
  'copy-ts-2s': { copy: true, container: 'ts', seconds: 2 },
  'encode-ts': { copy: false, container: 'ts' },
  'encode-ts-1s': { copy: false, container: 'ts', seconds: 1 },
  'encode-ts-2s': { copy: false, container: 'ts', seconds: 2 },
  'cast-h264': { copy: false, container: 'ts', seconds: 2, mode: 'cast-h264' },
  'copy-fmp4': { copy: true, container: 'mp4' },
  'encode-fmp4': { copy: false, container: 'mp4' }
};
const ms = start => Math.round(performance.now() - start);

function playlistSegments(text) {
  const rows = []; let duration, start = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('#EXTINF:')) duration = Number(line.slice(8).split(',')[0]);
    else if (line && !line.startsWith('#') && duration !== undefined) {
      rows.push({ path: line, startSeconds: start, durationSeconds: duration }); start += duration; duration = undefined;
    }
  }
  return rows;
}

async function findPlaylist(media, sessionId, resource, signal) {
  for (let level = 0; level < 4; level++) {
    const response = await media.getPlaybackResource(sessionId, resource, { signal });
    assert.ok(response.manifestText?.startsWith('#EXTM3U'));
    const segments = playlistSegments(response.manifestText);
    if (segments.length) return { resource, text: response.manifestText, segments };
    resource = response.manifestText.split('\n').find(line => line && !line.startsWith('#'));
  }
  throw new Error('Unexpected playlist nesting');
}

async function inspectFile(file) {
  const probe = await command(`${PILOT}/runtime/jellyfin/ffprobe.exe`, ['-v', 'error', '-show_streams', '-show_packets',
    '-show_entries', 'stream=index,codec_name,codec_type,time_base,start_time,duration:packet=stream_index,pts_time,dts_time,duration_time,flags', '-of', 'json', file], 15000);
  assert.equal(probe.code, 0, 'ffprobe failed');
  const data = JSON.parse(probe.out);
  return { streams: data.streams.map(stream => {
    const packets = data.packets.filter(packet => packet.stream_index === stream.index);
    const points = packets.map(packet => Number(packet.pts_time)).filter(Number.isFinite);
    return { ...stream, packetCount: packets.length, firstPacket: packets[0], lastPacket: packets.at(-1),
      minimumPts: Math.min(...points), maximumPts: Math.max(...points),
      packetEndSeconds: Math.max(...packets.map(packet => Number(packet.pts_time) + Number(packet.duration_time ?? 0)).filter(Number.isFinite)),
      keyframes: stream.codec_type === 'video' ? packets.filter(packet => packet.flags?.includes('K')).map(packet => Number(packet.pts_time)) : undefined };
  }), stderr: probe.err.slice(0, 2000) };
}

async function main() {
  assert.equal(process.env.PTI_EXCLUSIVE_PILOT_LANE, 'cast-media-compat', 'Explicit exclusive-engine lane required');
  const names = (process.env.PTI_COMPAT_POLICIES ?? 'copy-ts,encode-ts,copy-fmp4').split(',');
  assert.ok(names.every(name => policies[name]), 'Unknown comparison policy');
  const episodes = (process.env.PTI_COMPAT_EPISODES ?? '1000,1001').split(',').map(Number);
  assert.ok(episodes.length <= 2 && episodes.every(number => [1000, 1001].includes(number)), 'Only two already cached originals permitted');
  await mkdir(OUT, { recursive: true }); await mkdir(EVIDENCE, { recursive: true });
  const startedAt = new Date().toISOString(), signal = AbortSignal.timeout(240000);
  const report = { kind: 'cached-engine-timestamp-comparison', startedAt, runId: startedAt.replaceAll(/[:.]/g, '-'),
    noTvDiscoveredOrControlled: true, newNetworkDownloads: 0, browserRendered: false,
    heardJapanese: false, subtitlesVisuallyVerified: false, policies: [], sources: [] };
  const catalog = buildCatalog(await Promise.all(ARCHIVE_ITEMS.map(item => readFile(new URL(`../../../../docs/one-piece/evidence/sources/${item}.json`, import.meta.url), 'utf8').then(JSON.parse))));
  let activePolicy;
  const fetchImpl = async (url, options) => {
    if (activePolicy && String(url).endsWith('/PlaybackInfo') && options?.method === 'POST') {
      const body = JSON.parse(options.body);
      body.AllowVideoStreamCopy = activePolicy.copy;
      body.DeviceProfile.TranscodingProfiles[0].Container = activePolicy.container;
      body.DeviceProfile.TranscodingProfiles[0].SegmentLength = activePolicy.seconds ?? 3;
      options = { ...options, body: JSON.stringify(body) };
    }
    return fetch(url, options);
  };
  const media = createMediaCoordinator({ catalog, cacheRoot: `${ROOT}/cache`,
    managedRoots: { transcodes: `${ROOT}/transcodes`, subtitles: `${PILOT}/data-v2/data/subtitles` },
    extraAccountingRoots: [ROOT, `${PILOT}/cache`], autoPrefetch: false, monitorMs: 1000,
    downloader: { async download() { throw new Error('Original network downloads forbidden'); } },
    jellyfin: { baseUrl: 'http://127.0.0.1:18096', allowOtherLibrariesForPilot: true, fetchImpl,
      ffprobePath: `${PILOT}/runtime/jellyfin/ffprobe.exe`,
      tokenProvider: async () => JSON.parse(await readFile(`${PILOT}/private/state.json`, 'utf8')).token },
    onEmergencyStop: async () => { throw new Error('Storage pressure: stop diagnostic; no unrelated encoders may be cancelled'); } });
  let previousEncoding;
  try {
    previousEncoding = await media.engine.request('/System/Configuration/encoding');
    report.initialization = await media.initialize({ hardwareAcceleration: 'nvenc' });
    for (const episode of episodes) {
      const candidate = catalog.episodes[episode - 1].candidates.find(candidate => candidate.role === 'original');
      const entry = await media.cache.readyEntry(candidate);
      assert.ok(entry, `Episode ${episode} is not already verified in cache`);
      report.sources.push({ episode, bytes: entry.candidate.bytes, md5: entry.candidate.checksums.md5 });
      for (const name of names) {
        activePolicy = policies[name];
        const sessionId = `compat-${episode}-${name}-${randomUUID().slice(0, 8)}`;
        const row = { episode, policy: name, requested: activePolicy, samples: [] }; report.policies.push(row);
        const before = new Set(await readdir(`${PILOT}/logs`));
        try {
          const began = performance.now();
          const descriptor = await media.openSession({ sessionId, profileId: sessionId, episodeNumber: episode,
            mode: activePolicy.mode ?? 'compatible-h264', signal });
          row.readyMs = ms(began); row.selected = descriptor.selected; row.durationSeconds = descriptor.durationSeconds;
          row.timing = descriptor.timing; row.containerDurationSeconds = descriptor.containerDurationSeconds;
          row.preparation = descriptor.preparation;
          const playlist = await findPlaylist(media, sessionId, descriptor.masterPath, signal);
          row.playlist = { segmentCount: playlist.segments.length, totalSeconds: playlist.segments.reduce((sum, segment) => sum + segment.durationSeconds, 0),
            bytes: Buffer.byteLength(playlist.text),
            targetDuration: Number(playlist.text.match(/#EXT-X-TARGETDURATION:(\d+)/)?.[1]),
            version: Number(playlist.text.match(/#EXT-X-VERSION:(\d+)/)?.[1]), endList: playlist.text.includes('#EXT-X-ENDLIST') };
          const initializers = [...playlist.text.matchAll(/#EXT-X-MAP:[^\n]*URI="([^"]+)"/g)].map(match => match[1]);
          const initBuffers = [];
          for (const resource of initializers) {
            const response = await media.getPlaybackResource(sessionId, resource, { signal });
            initBuffers.push(Buffer.from(await new Response(response.body).arrayBuffer()));
          }
          for (const position of [0, 600, Math.max(0, descriptor.durationSeconds - 12)]) {
            const selectedIndex = Math.max(0, playlist.segments.findIndex(segment => segment.startSeconds + segment.durationSeconds > position));
            const buffers = [...initBuffers], sample = { targetSeconds: position, segments: [] }; row.samples.push(sample);
            const started = performance.now();
            const stopIndex = position > 1000 ? playlist.segments.length : Math.min(selectedIndex + (position === 0 ? 1 : 4), playlist.segments.length);
            assert.ok(stopIndex - selectedIndex <= 16, 'Tail sample exceeds finite segment budget');
            for (let i = selectedIndex; i < stopIndex; i++) {
              const segment = playlist.segments[i], t = performance.now();
              const response = await media.getPlaybackResource(sessionId, segment.path, { signal });
              const bytes = Buffer.from(await new Response(response.body).arrayBuffer());
              assert.ok(bytes.length > 0 && bytes.length < 32 * 1024 ** 2);
              const measured = { index: i, startSeconds: segment.startSeconds, durationSeconds: segment.durationSeconds,
                elapsedMs: ms(t), bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
              sample.segments.push(measured);
              const segmentFile = `${OUT}/${episode}-${name}-segment-${i}.${activePolicy.container === 'ts' ? 'ts' : 'mp4'}`;
              await writeFile(segmentFile, Buffer.concat([...initBuffers, bytes]));
              measured.probe = await inspectFile(segmentFile);
              buffers.push(bytes);
            }
            sample.fetchMs = sample.segments.reduce((sum, segment) => sum + segment.elapsedMs, 0);
            sample.fetchAndProbeMs = ms(started);
            const file = `${OUT}/${episode}-${name}-${Math.floor(position)}.${activePolicy.container === 'ts' ? 'ts' : 'mp4'}`;
            const bytes = Buffer.concat(buffers); await writeFile(file, bytes); sample.bytes = bytes.length;
            sample.probe = await inspectFile(file);
            const decode = await command(`${PILOT}/runtime/jellyfin/ffmpeg.exe`, ['-v', 'warning', '-i', file, '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], 15000);
            sample.decode = { code: decode.code, stderr: decode.err.slice(0, 4000) };
          }
        } catch (error) { row.error = { code: error.code ?? null, message: error.message }; }
        finally {
          const session = media.sessions.get(sessionId);
          for (const key of session?.contexts.keys() ?? []) {
            const engineSession = media.engine.sessions.get(key);
            if (engineSession) await media.engine.request(`/Videos/ActiveEncodings?DeviceId=${encodeURIComponent(engineSession.deviceId)}&PlaySessionId=${encodeURIComponent(engineSession.playSessionId)}`, { method: 'DELETE' }).catch(() => {});
          }
          await media.closeSession(sessionId).catch(() => {});
          row.commands = [];
          for (const name of (await readdir(`${PILOT}/logs`)).filter(name => !before.has(name) && name.startsWith('FFmpeg.'))) {
            const text = await readFile(`${PILOT}/logs/${name}`, 'utf8');
            const commandLine = text.split('\n').find(line => /ffmpeg\.exe -/.test(line));
            row.commands.push({ log: name, videoCopy: /-codec:v:0 copy/.test(commandLine), nvenc: /-codec:v:0 h264_nvenc/.test(commandLine),
              seekOffset: commandLine?.match(/-ss ([\d:.]+)/)?.[1] ?? null, copyTimestamps: /-copyts/.test(commandLine),
              startAtZero: /-start_at_zero/.test(commandLine), outputTimestampOffset: commandLine?.match(/-output_ts_offset ([\d.]+)/)?.[1] ?? null,
              startNumber: Number(commandLine?.match(/-start_number (\d+)/)?.[1]), warnings: text.split('\n').filter(line => /non.monoton|invalid|discontinu|error|warning/i.test(line)).slice(-10) });
          }
          report.storage = await media.cache.usage();
        }
      }
    }
  } catch (error) { report.error = { code: error.code ?? null, message: error.message }; }
  finally {
    await media.shutdown().catch(() => {});
    if (previousEncoding) await media.engine.request('/System/Configuration/encoding', { method: 'POST', body: previousEncoding }).catch(() => {});
    report.completedAt = new Date().toISOString();
    await writeFile(new URL(`engine-comparison-${report.runId}.json`, EVIDENCE), JSON.stringify(report, null, 2));
    await writeFile(new URL('engine-comparison.json', EVIDENCE), JSON.stringify(report, null, 2));
  }
  console.log(JSON.stringify({ evidence: 'docs/one-piece/evidence/cast-media-compat/engine-comparison.json',
    error: report.error ?? null, samples: report.policies.map(row => ({ episode: row.episode, policy: row.policy, readyMs: row.readyMs,
      error: row.error, fetchMs: row.samples.map(sample => sample.fetchMs) })) }, null, 2));
  if (report.error || report.policies.some(row => row.error)) process.exitCode = 1;
}

if (process.env.PTI_RUN_REAL_CAST_MEDIA === '1') await main();
else console.log('Skipped: no engine, GPU, TV, or download activity. Set PTI_RUN_REAL_CAST_MEDIA=1 and acquire exclusive pilot lane.');
