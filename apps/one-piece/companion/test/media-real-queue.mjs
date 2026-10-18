/** Real cached-only queue/copy-seek comparison. Never permits an upstream download. */
import assert from 'node:assert/strict';
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { ARCHIVE_ITEMS, buildCatalog } from '../src/sources/archive.mjs';
import { createMediaCoordinator } from '../src/media/index.mjs';
import { command, hls } from './media-real.mjs';

if (process.env.PTI_RUN_REAL_QUEUE !== '1') console.log('Cached-only real queue smoke skipped; set PTI_RUN_REAL_QUEUE=1 explicitly.');
else {
  const PILOT = 'H:/PTI-OnePiece/pilot/jellyfin', ROOT = 'H:/PTI-OnePiece/production-media';
  const catalog = buildCatalog(await Promise.all(ARCHIVE_ITEMS.map(item => readFile(new URL(`../../../../docs/one-piece/evidence/sources/${item}.json`, import.meta.url), 'utf8').then(JSON.parse))));
  const stop = async () => { const result = await command('pwsh', ['-NoProfile', '-File', fileURLToPath(new URL('../pilot/jellyfin/stop.ps1', import.meta.url)), '-EncodersOnly']);
    if (result.code) throw new Error('Private engine cancellation was not confirmed'); };
  const media = createMediaCoordinator({ catalog, cacheRoot: `${ROOT}/cache`,
    managedRoots: { transcodes: `${ROOT}/transcodes`, subtitles: `${PILOT}/data-v2/data/subtitles` },
    extraAccountingRoots: [ROOT, `${PILOT}/cache`], autoPrefetch: false, monitorMs: 1000,
    downloader: { async download() { throw new Error('Network downloads are forbidden in this cached-only experiment'); } },
    jellyfin: { baseUrl: 'http://127.0.0.1:18096', allowOtherLibrariesForPilot: true,
      tokenProvider: async () => JSON.parse(await readFile(`${PILOT}/private/state.json`, 'utf8')).token }, onEmergencyStop: stop });
  const report = { kind: 'real-cached-copy-seek-and-queued-transition', startedAt: new Date().toISOString(),
    newNetworkDownloads: 0, actualCast: false, browserRendered: false, heardJapanese: false, sixtyMinuteConcurrency: false };
  try {
    await media.initialize({ hardwareAcceleration: 'nvenc' });
    const before = new Set(await readdir(`${PILOT}/logs`));
    let began = performance.now();
    const copy = await media.openSession({ sessionId: 'copy-recheck', profileId: 'copy-recheck-profile', episodeNumber: 1 });
    report.copy = { episode: 1, readyMs: Math.round(performance.now() - began), selected: copy.selected,
      visiblePreparation: copy.preparation, seeks: [] };
    for (const position of [600, 1200, 60]) {
      await media.reportProgress('copy-recheck', { positionSeconds: position, isPaused: false, episodeNumber: 1 });
      report.copy.seeks.push(await hls(media, 'copy-recheck', copy.masterPath, position, `copy-recheck-${position}`));
    }
    await media.closeSession('copy-recheck'); await stop();
    began = performance.now();
    const sessions = await Promise.all([0, 1, 2].map(async index => {
      const sessionId = `queue-real-${index}`, t = performance.now();
      const current = await media.openSession({ sessionId, profileId: `queue-real-profile-${index}`, episodeNumber: 1000 });
      return { sessionId, current, readyMs: Math.round(performance.now() - t) };
    }));
    const next = await Promise.all(sessions.map(async session => {
      const t = performance.now(), descriptor = await media.prepareNextPlayback(session.sessionId);
      assert.equal(media.snapshot(session.sessionId).episodeNumber, 1000);
      return { sessionId: session.sessionId, descriptor, preparationMs: Math.round(performance.now() - t) };
    }));
    const children = await command('pwsh', ['-NoProfile', '-Command', '$pilotPid=[int](Get-Content -LiteralPath H:/PTI-OnePiece/pilot/jellyfin/private/process.id); @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $pilotPid -and $_.Name -in @("ffmpeg.exe","ffprobe.exe") } | Select-Object ProcessId,Name) | ConvertTo-Json -Compress']);
    report.queued = { activeViewingLeases: media.sessions.size, activeContexts: [...media.sessions.values()].reduce((sum, session) => sum + session.contexts.size, 0),
      engineChildrenObserved: children.out.trim() ? JSON.parse(children.out) : [],
      currentReady: sessions.map(s => ({ sessionId: s.sessionId, readyMs: s.readyMs, selected: s.current.selected })),
      nextReady: next.map(s => ({ sessionId: s.sessionId, preparationMs: s.preparationMs, selected: s.descriptor.selected,
        visiblePreparation: s.descriptor.preparation })), seeks: [] };
    report.queued.seeks = await Promise.all(next.map(async (session, index) => ({ sessionId: session.sessionId,
      segment: await hls(media, session.sessionId, session.descriptor.masterPath, 600 + 300 * index, `queued-next-${index}-seek`) })));
    report.queued.adoptions = await Promise.all(next.map(async (session, index) => {
      const t = performance.now(), adopted = await media.switchEpisode(session.sessionId, 1001);
      assert.equal(adopted.masterPath, session.descriptor.masterPath);
      assert.equal(media.snapshot(session.sessionId).episodeNumber, 1001);
      await media.getPlaybackResource(session.sessionId, sessions[index].current.masterPath);
      return { sessionId: session.sessionId, adoptionMs: Math.round(performance.now() - t), reusedPreparedContext: true, oldGraphRetained: true };
    }));
    report.queued.wallMs = Math.round(performance.now() - began);
    const jobs = [];
    for (const name of (await readdir(`${PILOT}/logs`)).filter(name => !before.has(name) && name.startsWith('FFmpeg.'))) {
      const text = await readFile(`${PILOT}/logs/${name}`, 'utf8');
      jobs.push({ name, videoCopy: /-codec:v:0 copy/.test(text), nvenc: /-codec:v:0 h264_nvenc/.test(text),
        japaneseLaterMap: /-map 0:2/.test(text), japaneseEarlyMap: /-map 0:1/.test(text), hardwareDecode: /-hwaccel cuda|hevc_cuvid/.test(text), localInput: text.includes('originals') });
    }
    report.jobs = jobs;
    for (const session of sessions) await media.closeSession(session.sessionId);
    await stop(); report.storage = await media.cache.usage(); report.completedAt = new Date().toISOString();
  } catch (error) { report.error = { code: error.code ?? null, name: error.name, message: error.message }; }
  finally { await media.shutdown(); await stop().catch(() => {});
    await writeFile(new URL('../../../../docs/one-piece/evidence/jellyfin/production-core-queue.json', import.meta.url), JSON.stringify(report, null, 2)); }
  console.log(JSON.stringify({ error: report.error ?? null, copySeekMs: report.copy?.seeks.map(s => s.elapsedMs),
    queuedSeekMs: report.queued?.seeks.map(s => s.segment.elapsedMs), evidence: 'docs/one-piece/evidence/jellyfin/production-core-queue.json' }, null, 2));
  if (report.error) process.exitCode = 1;
}
