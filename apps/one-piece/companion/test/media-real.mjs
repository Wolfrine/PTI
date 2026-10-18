/** Explicit real-original smoke. Default reuses two MD5-verified originals. A separate opt-in downloads ONLY episode 1000 for the cross-source transition. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_ITEMS, buildCatalog } from '../src/sources/archive.mjs';
import { createMediaCoordinator, ArchiveDownloader } from '../src/media/index.mjs';

const PILOT = 'H:/PTI-OnePiece/pilot/jellyfin';
const ROOT = process.env.PTI_MEDIA_RUNTIME_ROOT ?? 'H:/PTI-OnePiece/production-media';
const tokenFile = `${PILOT}/private/state.json`;
const evidence = new URL('../../../../docs/one-piece/evidence/jellyfin/production-core.json', import.meta.url);

export async function command(program, args, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = ''; child.stdout.on('data', bytes => { out += bytes; }); child.stderr.on('data', bytes => { err += bytes; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('Bounded command timed out')); }, timeoutMs);
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

export async function hls(media, sessionId, masterPath, position, label) {
  const began = performance.now(); let resource = masterPath;
  for (let level = 0; level < 4; level++) {
    const response = await media.getPlaybackResource(sessionId, resource);
    if (response.manifestText) {
      const lines = response.manifestText.split('\n').filter(line => line.trim() && !line.startsWith('#'));
      let index = 0;
      if (response.manifestText.includes('#EXTINF:') && position) {
        const durations = [...response.manifestText.matchAll(/#EXTINF:([\d.]+)/g)].map(match => Number(match[1]));
        let start = 0;
        for (index = 0; index < durations.length; index++) { if (start + durations[index] > position) break; start += durations[index]; }
      }
      resource = lines[Math.min(index, lines.length - 1)];
    } else {
      const bytes = Buffer.from(await new Response(response.body).arrayBuffer());
      const elapsedMs = Math.round(performance.now() - began);
      const file = path.join(ROOT, 'real-clips', label + '.ts'); await writeFile(file, bytes);
      const probe = await command(`${PILOT}/runtime/jellyfin/ffprobe.exe`, ['-v', 'error', '-show_entries', 'stream=codec_name,codec_type,start_time,duration', '-of', 'json', file]);
      assert.equal(probe.code, 0);
      const metadata = JSON.parse(probe.out);
      assert.ok(metadata.streams.some(stream => stream.codec_name === 'h264'));
      assert.ok(metadata.streams.some(stream => stream.codec_name === 'aac'));
      return { elapsedMs, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
        positionSeconds: position, codecs: metadata.streams, rendered: false, listened: false };
    }
  }
  throw new Error('No real media segment found');
}

async function main() {
  await mkdir(path.join(ROOT, 'real-clips'), { recursive: true });
  const inventories = await Promise.all(ARCHIVE_ITEMS.map(item => readFile(new URL(`../../../../docs/one-piece/evidence/sources/${item}.json`, import.meta.url), 'utf8').then(JSON.parse)));
  const catalog = buildCatalog(inventories);
  const stopPath = new URL('../pilot/jellyfin/stop.ps1', import.meta.url);
  const stop = async () => { const result = await command('pwsh', ['-NoProfile', '-File', fileURLToPath(stopPath), '-EncodersOnly']);
    if (result.code) throw new Error('Private engine cancellation was not confirmed'); };
  const media = createMediaCoordinator({ catalog, cacheRoot: path.join(ROOT, 'cache'),
    managedRoots: { transcodes: path.join(ROOT, 'transcodes'), subtitles: `${PILOT}/data-v2/data/subtitles` },
    extraAccountingRoots: [ROOT, `${PILOT}/cache`], importRoots: [`${PILOT}/cache`], autoPrefetch: false, monitorMs: 1000,
    jellyfin: { baseUrl: 'http://127.0.0.1:18096', allowOtherLibrariesForPilot: true,
      tokenProvider: async () => JSON.parse(await readFile(tokenFile, 'utf8')).token },
    downloader: new ArchiveDownloader({ maxAttempts: 1, attemptTimeoutMs: 180000 }), onEmergencyStop: stop });
  const report = { kind: 'real-media-core-smoke', originals: [1, 1001], newNetworkDownloads: 0, startedAt: new Date().toISOString(),
    browserRendered: false, heardJapanese: false, actualCast: false, sixtyMinuteConcurrency: false, baseline: [], gpu: null };
  try {
    report.initialization = await media.initialize({ hardwareAcceleration: 'none' });
    for (const number of [1, 1001]) {
      const candidate = catalog.episodes[number - 1].candidates.find(c => c.role === 'original' && c.container === 'mkv');
      const source = `${PILOT}/cache/${number === 1 ? 'cached-case' : 'cached-case-1001'}/episode-${number}.mkv`;
      const imported = await media.cache.importVerified(candidate, source);
      report.baseline.push({ episode: number, importedBytes: imported.candidate.bytes, md5: imported.metrics.md5 });
    }
    for (const row of report.baseline) {
      const sessionId = `real-${row.episode}`; const began = performance.now();
      const playback = await media.openSession({ sessionId, profileId: `real-profile-${row.episode}`, episodeNumber: row.episode });
      row.readyMs = Math.round(performance.now() - began); row.selected = playback.selected; row.subtitleBytes = playback.subtitleBytes;
      row.visiblePreparation = playback.preparation;
      const captions = await media.getPlaybackResource(sessionId, playback.subtitlePath);
      const text = await new Response(captions.body).text(); assert.ok(text.startsWith('WEBVTT') && text.includes('-->'));
      row.webVttCueCount = (text.match(/-->/g) ?? []).length;
      row.start = await hls(media, sessionId, playback.masterPath, 0, `episode-${row.episode}-start`);
      await media.reportProgress(sessionId, { positionSeconds: 600, isPaused: false, episodeNumber: row.episode });
      row.seek = await hls(media, sessionId, playback.masterPath, 600, `episode-${row.episode}-seek`);
      await media.closeSession(sessionId); await stop();
    }
    const before = new Set(await readdir(`${PILOT}/logs`));
    const configured = await media.engine.configure({ hardwareAcceleration: 'nvenc' });
    const gpuBegan = performance.now();
    const sessions = await Promise.all([0, 1, 2].map(async index => {
      const sessionId = `gpu-${index}`;
      const readyBegan = performance.now();
      const playback = await media.openSession({ sessionId, profileId: `gpu-profile-${index}`, episodeNumber: 1001 });
      return { sessionId, selected: playback.selected, masterPath: playback.masterPath,
        readyMs: Math.round(performance.now() - readyBegan), visiblePreparation: playback.preparation };
    }));
    const readyWallMs = Math.round(performance.now() - gpuBegan);
    const warm = await Promise.all(sessions.map(async (session, index) => ({ sessionId: session.sessionId,
      segment: await hls(media, session.sessionId, session.masterPath, 0, `gpu-${index}-warm-first`) })));
    const seeks = await Promise.all(sessions.map(async (session, index) => {
      const position = 600 + index * 300;
      await media.reportProgress(session.sessionId, { positionSeconds: position, isPaused: false, episodeNumber: 1001 });
      return { sessionId: session.sessionId, segment: await hls(media, session.sessionId, session.masterPath, position, `gpu-${index}-concurrent-seek`) };
    }));
    const newLogs = (await readdir(`${PILOT}/logs`)).filter(name => !before.has(name) && name.startsWith('FFmpeg.'));
    const jobs = [];
    for (const name of newLogs) { const text = await readFile(`${PILOT}/logs/${name}`, 'utf8');
      jobs.push({ name, nvenc: /-codec:v:0 h264_nvenc/.test(text), japaneseMap: /-map 0:2/.test(text), localInput: text.includes('originals'),
        hardwareDecode: /-hwaccel cuda|hevc_cuvid/.test(text) }); }
    report.gpu = { configured, readyWallMs, wallMs: Math.round(performance.now() - gpuBegan), sessions, warm, seeks, jobs,
      independentEncoderJobsObserved: jobs.filter(job => job.nvenc).length, durationClaim: 'short real segment jobs only; not 60-minute capacity acceptance' };
    for (const session of sessions) await media.closeSession(session.sessionId);
    await stop();
    if (process.env.PTI_RUN_TRANSITION_1000 === '1') {
      const transitionBegan = performance.now(), states = [];
      const first = await media.openSession({ sessionId: 'cross-source', profileId: 'cross-source-profile', episodeNumber: 1000,
        onProgress: snapshot => { if (states.at(-1)?.state !== snapshot.state) states.push({ state: snapshot.state, elapsedMs: Math.round(performance.now() - transitionBegan) }); } });
      const firstReadyMs = Math.round(performance.now() - transitionBegan);
      const candidate = catalog.episodes[999].candidates.find(c => c.id === first.sourceId);
      const entry = media.cache.entries.get(candidate.id);
      const caption1 = await media.getPlaybackResource('cross-source', first.subtitlePath);
      const captionText1 = await new Response(caption1.body).text(); assert.ok(captionText1.startsWith('WEBVTT') && captionText1.includes('-->'));
      const firstSegment = await hls(media, 'cross-source', first.masterPath, 0, 'transition-1000-first');
      const switchBegan = performance.now();
      const second = await media.switchEpisode('cross-source', 1001);
      const switchReadyMs = Math.round(performance.now() - switchBegan);
      const caption2 = await media.getPlaybackResource('cross-source', second.subtitlePath);
      const captionText2 = await new Response(caption2.body).text(); assert.ok(captionText2.startsWith('WEBVTT') && captionText2.includes('-->'));
      const secondSegment = await hls(media, 'cross-source', second.masterPath, 0, 'transition-1001-first');
      assert.equal(media.sessions.size, 1);
      const old = await media.getPlaybackResource('cross-source', first.masterPath); assert.ok(old.manifestText?.startsWith('#EXTM3U'));
      await assert.rejects(media.reportProgress('cross-source', { positionSeconds: 1200, episodeNumber: 1000 }), { code: 'STALE_PROGRESS' });
      report.transition = { from: 1000, to: 1001, viewingLeasePreserved: true, activeSessions: media.sessions.size,
        oldResourcesDuringGrace: true, staleEpisodeProgressRejected: true, firstReadyMs, switchReadyMs, states,
        source1000: { sourceId: first.sourceId, expectedBytes: candidate.bytes, download: entry.metrics, selected: first.selected,
          visiblePreparation: first.preparation, captionCues: (captionText1.match(/-->/g) ?? []).length, segment: firstSegment },
        source1001: { sourceId: second.sourceId, selected: second.selected, visiblePreparation: second.preparation,
          captionCues: (captionText2.match(/-->/g) ?? []).length, segment: secondSegment }, actualCast: false };
      report.originals.push(1000); report.newNetworkDownloads = entry.metrics.imported ? 0 : 1;
      await media.closeSession('cross-source'); await stop();
    }
    report.storage = await media.cache.usage(); report.completedAt = new Date().toISOString();
  } catch (error) { report.error = { name: error.name, code: error.code ?? null, message: error.message }; }
  finally { await media.shutdown(); await stop().catch(() => {}); await writeFile(evidence, JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ evidence: 'docs/one-piece/evidence/jellyfin/production-core.json', error: report.error ?? null,
    baseline: report.baseline.map(row => ({ episode: row.episode, readyMs: row.readyMs, startMs: row.start?.elapsedMs, seekMs: row.seek?.elapsedMs })),
    gpuJobs: report.gpu?.independentEncoderJobsObserved ?? 0 }, null, 2));
  if (report.error) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.env.PTI_RUN_REAL_MEDIA === '1') await main();
  else console.log('Real-media smoke skipped: set PTI_RUN_REAL_MEDIA=1 explicitly; no media is downloaded.');
}
