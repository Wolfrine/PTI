/** Opt-in production media path, fresh private engine, cached originals only. No TV or public listener. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, mkdir, open, rm } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as tcpServer } from 'node:net';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { ARCHIVE_ITEMS, buildCatalog } from '../src/sources/archive.mjs';
import { createMediaCoordinator } from '../src/media/coordinator.mjs';
import { MediaCache } from '../src/media/cache.mjs';
import { dedicatedEngineDescriptor } from '../src/media/runtime.mjs';
import { WindowsProtection } from '../src/dpapi.mjs';
import { saveRuntimeSecret } from '../src/runtime/config.mjs';

const ROOT = 'H:/PTI-OnePiece/production-media', PILOT = 'H:/PTI-OnePiece/pilot/jellyfin', BIN = `${PILOT}/runtime/jellyfin`;
const EVIDENCE = new URL('../../../../docs/one-piece/evidence/cast-media-compat/', import.meta.url), MiB = 1024 ** 2;
const took = start => Math.round(performance.now() - start);
async function command(executable, args, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); let out = '', err = '', bytes = 0;
    const timer = setTimeout(() => child.kill(), timeoutMs);
    for (const [stream, stderr] of [[child.stdout, false], [child.stderr, true]]) stream.on('data', part => { bytes += part.length; if (bytes > 4 * MiB) child.kill(); else if (stderr) err += part; else out += part; });
    child.once('error', () => { clearTimeout(timer); reject(new Error('Owned technical command unavailable')); });
    child.once('close', code => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}
async function body(response, max = 16 * MiB) { const parts = []; let bytes = 0; for await (const part of response.body ?? []) { bytes += part.length; assert.ok(bytes <= max); parts.push(part); } return Buffer.concat(parts); }
async function localBytes(file, start, length) { const handle = await open(file, 'r'); try { const buffer = Buffer.alloc(length); assert.equal((await handle.read(buffer, 0, length, start)).bytesRead, length); return buffer; } finally { await handle.close(); } }
async function main() {
  assert.equal(process.env.PTI_EXCLUSIVE_PILOT_LANE, 'prepared-production');
  const runId = new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomBytes(3).toString('hex'), runRoot = `${ROOT}/prepared-core-pilot/${runId}`;
  const cacheRoot = `${runRoot}/cache`, descriptor = dedicatedEngineDescriptor({ runtimeRoot: `${runRoot}/engine`, binaryDir: BIN, port: 18107 });
  const accounting = [ROOT, PILOT, 'H:/PTI-OnePiece/runtime/media', 'H:/PTI-OnePiece/runtime/jellyfin'];
  const report = { kind: 'real-production-prepared-media-core', runId, startedAt: new Date().toISOString(), newOriginalDownloads: 0,
    productionMediaModules: true, productionFirebaseAuth: false, actualCast: false, audibleLanguageVerified: false, visualSubtitlesVerified: false, events: [], episodes: [], cleanup: {} };
  let media, engineProcess, engineExit, relay, token, active = 0;
  const assets = new Map(), checkpoint = async () => { await mkdir(EVIDENCE, { recursive: true }); await writeFile(new URL(`prepared-production-${runId}.json`, EVIDENCE), JSON.stringify(report, null, 2)); };
  const say = value => process.stdout.write(JSON.stringify(value) + '\n');
  const account = async () => { const usage = await media.cache.usage(); assert.ok(usage.projectedBytes <= 20 * 1024 ** 3); assert.ok(usage.freeBytes - usage.reservedBytes >= usage.minimumFreeBytes);
    report.peakAccountedBytes = Math.max(report.peakAccountedBytes ?? 0, usage.projectedBytes); return usage; };
  const stopEngine = async () => {
    if (!engineProcess || engineProcess.exitCode !== null || engineProcess.signalCode !== null) return;
    await media?.engine.request('/System/Shutdown', { method: 'POST', timeoutMs: 5000 }).catch(() => {});
    const graceful = await Promise.race([engineExit, delay(10000).then(() => null)]); if (!graceful) engineProcess.kill();
    report.cleanup.engineExit = graceful ?? await engineExit;
  };
  const makeMedia = () => { const coordinator = createMediaCoordinator({ catalog, cacheRoot, managedRoots: descriptor.managedRoots, extraAccountingRoots: accounting,
    importRoots: [`${ROOT}/cache/originals`], defaultMode: 'prepared-mp4', verifiedModes: ['compatible-h264', 'cast-h264', 'prepared-mp4'], autoPrefetch: false, monitorMs: 1000,
    jellyfin: { baseUrl: descriptor.baseUrl, tokenProvider: async () => token, preparedEnabled: true, ffmpegPath: `${BIN}/ffmpeg.exe`, ffprobePath: `${BIN}/ffprobe.exe` },
    downloader: { async download() { throw Object.assign(new Error('Original downloads forbidden in cached-only gate'), { code: 'CACHED_ORIGINAL_REQUIRED' }); } }, onEmergencyStop: stopEngine });
    const usage = coordinator.cache.usage.bind(coordinator.cache); coordinator.cache.usage = async () => { const result = await usage();
      report.peakAccountedBytes = Math.max(report.peakAccountedBytes ?? 0, result.projectedBytes); return result; }; return coordinator; };
  const catalog = buildCatalog(await Promise.all(ARCHIVE_ITEMS.map(item => readFile(new URL(`../../../../docs/one-piece/evidence/sources/${item}.json`, import.meta.url), 'utf8').then(JSON.parse))));
  try {
    const checkPort = tcpServer(); await new Promise((resolve, reject) => { checkPort.once('error', reject); checkPort.listen(18107, '127.0.0.1', resolve); }); await new Promise(resolve => checkPort.close(resolve));
    const protection = new WindowsProtection(); await protection.secureDirectory(path.resolve(runRoot));
    for (const dir of Object.values(descriptor.directories)) await mkdir(dir, { recursive: true });
    await writeFile(descriptor.networkConfigPath, descriptor.networkXml);
    await writeFile(path.join(descriptor.directories.config, 'system.xml'), '<?xml version="1.0" encoding="utf-8"?><ServerConfiguration><IsStartupWizardCompleted>false</IsStartupWizardCompleted><PluginRepositories /></ServerConfiguration>');
    await mkdir(cacheRoot, { recursive: true }); media = makeMedia(); report.preflight = await account(); await checkpoint(); say({ phase: 'preflight', bytes: report.preflight.projectedBytes, limit: report.preflight.limitBytes });
    const setupBegan = performance.now();
    engineProcess = spawn(descriptor.executable, descriptor.args, { windowsHide: true, shell: false, cwd: descriptor.workingDirectory, stdio: ['ignore', 'pipe', 'pipe'] });
    engineProcess.stdout.pipe(createWriteStream(path.join(descriptor.directories.logs, 'console.out.log'))); engineProcess.stderr.pipe(createWriteStream(path.join(descriptor.directories.logs, 'console.err.log')));
    engineExit = new Promise(resolve => { engineProcess.once('error', () => resolve({ error: 'spawn' })); engineProcess.once('close', (code, signal) => resolve({ code, signal })); });
    const initial = async (relative, value) => { const reply = await fetch(descriptor.baseUrl + relative, { method: value === undefined ? 'GET' : 'POST', signal: AbortSignal.timeout(10000),
      headers: { 'content-type': 'application/json', Authorization: 'MediaBrowser Client="PTI One Piece", Device="Production mode pilot", DeviceId="production-mode-pilot", Version="1"' },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }) }); assert.ok(reply.ok, `Private initialization HTTP ${reply.status}`); const bytes = await body(reply, 2 * MiB); return bytes.length ? JSON.parse(bytes) : null; };
    let ready = false; for (let n = 0; n < 120; n++) { try { assert.match((await initial('/System/Info/Public')).Version, /^12\.2(?:\.|$)/); ready = true; break; } catch {} await delay(500); }
    assert.ok(ready); const listenerResult = await command('pwsh', ['-NoProfile', '-Command', `$a=@(Get-NetTCPConnection -State Listen -OwningProcess ${engineProcess.pid} -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort);ConvertTo-Json -InputObject $a -Compress`]);
    const listeners = JSON.parse(listenerResult.out || '[]'); assert.ok(listeners.length && listeners.every(row => row.LocalAddress === '127.0.0.1' && row.LocalPort === 18107));
    const username = 'prepared-core-' + randomBytes(6).toString('hex'), password = randomBytes(32).toString('base64url');
    await initial('/Startup/FirstUser'); await initial('/Startup/User', { Name: username, Password: password }); await initial('/Startup/RemoteAccess', { EnableRemoteAccess: false, EnableAutomaticPortMapping: false }); await initial('/Startup/Complete', {});
    token = (await initial('/Users/AuthenticateByName', { Username: username, Pw: password })).AccessToken; assert.ok(token);
    const privateConfig = { jellyfinTokenPath: path.join(descriptor.directories.private, 'jellyfin-token.dpapi'), jellyfinCredentialsPath: path.join(descriptor.directories.private, 'jellyfin-admin.dpapi') };
    await saveRuntimeSecret(privateConfig, 'jellyfinToken', token, { protection }); await saveRuntimeSecret(privateConfig, 'jellyfinCredentials', JSON.stringify({ username, password }), { protection });
    await writeFile(path.join(descriptor.directories.private, 'resume-config.json'), JSON.stringify({ ...privateConfig, runRoot: path.resolve(runRoot), cacheRoot: path.resolve(cacheRoot), descriptor, accountingRoots: accounting }, null, 2));
    report.engineSetup = { elapsedMs: took(setupBegan), listeners, protectedSecrets: true };
    const initialization = performance.now(); await media.initialize({ hardwareAcceleration: 'nvenc' }); report.initializeMs = took(initialization); await checkpoint(); say({ phase: 'production-engine-configured', setupMs: report.engineSetup.elapsedMs, initializeMs: report.initializeMs });
    const prior = new MediaCache({ cacheRoot: `${ROOT}/cache`, extraAccountingRoots: accounting }); await prior.initialize();
    for (const number of [1000, 1001]) { const candidate = catalog.episodes.find(row => row.episodeNumber === number).candidates.find(value => value.role === 'original');
      const imported = await media.cache.importVerified(candidate, prior.entryPath(candidate)); report.events.push({ phase: 'verified-original-import', episode: number, bytes: candidate.bytes, md5: candidate.checksums.md5 }); assert.equal(imported.candidate.bytes, candidate.bytes); }
    let preparations = 0; const prepare = media.engine.prepareRendition.bind(media.engine); media.engine.prepareRendition = options => { preparations++; return prepare(options); };
    const abort = new AbortController(), start = performance.now();
    const departing = media.openSession({ sessionId: 'core-cancel', profileId: 'technical-cancel-profile', episodeNumber: 1000, signal: abort.signal });
    void departing.catch(() => {}); const staying = media.openSession({ sessionId: 'core-1000', profileId: 'technical-staying-profile', episodeNumber: 1000 });
    let shared = false; for (let n = 0; n < 600; n++) { if ([...media.cache.renditionJobs.values()].some(job => job.waiters.size === 2)) { shared = true; break; } await delay(50); }
    assert.ok(shared, 'Real production preparation did not share two consumers'); abort.abort(new Error('Technical first consumer left')); await assert.rejects(departing); await media.closeSession('core-cancel');
    const first = await staying; assert.equal(preparations, 1); report.events.push({ phase: 'shared-production-prepare-one-cancel', episode: 1000, elapsedMs: took(start), preparations, remainingReady: true }); await checkpoint(); say({ phase: 'production-1000-prepared-one-shared-job', readyMs: took(start) });
    const secondStart = performance.now(), second = await media.prepareNextPlayback('core-1000'); assert.equal(preparations, 2);
    report.events.push({ phase: 'queued-production-prepare', episode: 1001, elapsedMs: took(secondStart), preparations });
    for (const [number, descriptor] of [[1000, first], [1001, second]]) {
      const record = media.cache.renditions.get(descriptor.renditionId), row = { episode: number, selected: descriptor.selected, durationSeconds: descriptor.durationSeconds, contentType: descriptor.contentType,
        renditionId: descriptor.renditionId, recipe: record.recipe, video: record.video, captions: record.captions, metadata: record.metadata, metrics: record.metrics, ranges: [], seeks: [] };
      assert.equal(descriptor.contentType, 'video/mp4'); assert.equal(descriptor.selected.audioLanguage, 'jpn');
      const vtt = await body(await media.getPlaybackResource('core-1000', descriptor.subtitlePath)); row.servedCaptionSha256 = createHash('sha256').update(vtt).digest('hex'); row.servedCues = (vtt.toString().match(/-->/g) ?? []).length; assert.ok(row.servedCues > 100);
      const head = await media.getPlaybackResource('core-1000', descriptor.masterPath, { method: 'HEAD', range: 'invalid-ignored' }); assert.equal(head.status, 200); assert.equal(Number(head.headers['content-length']), record.video.bytes);
      for (const range of ['bytes=0-65535', `bytes=${Math.floor(record.video.bytes / 2)}-${Math.floor(record.video.bytes / 2) + 65535}`, `bytes=${record.video.bytes - 65536}-${record.video.bytes - 1}`, 'bytes=-65536']) {
        const began = performance.now(), reply = await media.getPlaybackResource('core-1000', descriptor.masterPath, { range }), bytes = await body(reply, 65536);
        assert.equal(reply.status, 206); const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(reply.headers['content-range']); assert.equal(Number(match[3]), record.video.bytes); assert.deepEqual(bytes, await localBytes(record.paths.video, Number(match[1]), bytes.length));
        row.ranges.push({ range, status: reply.status, bytes: bytes.length, elapsedMs: took(began), byteExact: true }); }
      assets.set(number, { descriptor, record, row, remaining: 0 }); report.episodes.push(row); await account(); await checkpoint(); say({ phase: 'production-complete-static-ready', episode: number, bytes: record.video.bytes, preparedMs: record.metrics.preparedMs });
    }
    const capability = randomBytes(24).toString('base64url');
    relay = createServer(async (req, res) => { const controller = new AbortController(); res.once('close', () => controller.abort()); active++;
      let asset; try { const match = new RegExp(`^/technical/${capability}/(1000|1001)\\.mp4$`).exec(req.url); asset = match && assets.get(Number(match[1])); assert.ok(asset && ['GET', 'HEAD'].includes(req.method));
        const reply = await media.getPlaybackResource('core-1000', asset.descriptor.masterPath, { method: req.method, range: req.headers.range, signal: controller.signal }); res.writeHead(reply.status, reply.headers);
        if (req.method === 'HEAD') { res.end(); return; }
        await pipeline(Readable.fromWeb(reply.body), async function* (source) { for await (const part of source) { asset.remaining -= part.length; assert.ok(asset.remaining >= 0, '64 MiB aggregate HTTP seek bound'); yield part; } }, res);
      } catch { if (!res.headersSent) res.writeHead(404); res.destroy(); } finally { active--; } });
    await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve));
    for (const [number, asset] of assets) for (const position of [0, 600, asset.descriptor.durationSeconds - 3]) { asset.remaining = 64 * MiB; const began = performance.now();
      const result = await command(`${BIN}/ffmpeg.exe`, ['-v', 'warning', '-ss', String(position), '-i', `http://127.0.0.1:${relay.address().port}/technical/${capability}/${number}.mp4`, '-t', '1', '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-']);
      for (let n = 0; active && n < 40; n++) await delay(50); assert.equal(active, 0); assert.equal(result.code, 0, 'Actual production static HTTP seek/decode failed');
      asset.row.seeks.push({ positionSeconds: position, elapsedMs: took(began), transferredBytes: 64 * MiB - asset.remaining, decodedExitCode: result.code, diagnosticSha256: createHash('sha256').update(result.err).digest('hex') }); }
    const transitionStart = performance.now(), adopted = await media.switchEpisode('core-1000', 1001); assert.equal(adopted.masterPath, second.masterPath); assert.equal(preparations, 2);
    report.events.push({ phase: 'production-cross-source-queue-adoption', elapsedMs: took(transitionStart), noDuplicatePreparation: true });
    await new Promise(resolve => relay.close(resolve)); relay = null; await media.shutdown();
    const original1000 = catalog.episodes.find(row => row.episodeNumber === 1000).candidates.find(value => value.role === 'original'); await rm(media.cache.entryPath(original1000));
    media = makeMedia(); await media.initialize({ hardwareAcceleration: 'nvenc' }); let restartPrepared = 0; const restartPrepare = media.engine.prepareRendition.bind(media.engine); media.engine.prepareRendition = options => { restartPrepared++; return restartPrepare(options); };
    const restartStart = performance.now(), restored = await media.openSession({ sessionId: 'core-restart', profileId: 'technical-restored-profile', episodeNumber: 1000 });
    assert.equal(restored.renditionId, first.renditionId); assert.equal(restartPrepared, 0); report.events.push({ phase: 'production-restart-no-original', elapsedMs: took(restartStart), originalMissing: true, newPreparations: 0, newDownloads: 0 });
    report.finalUsage = await account(); report.completedAt = new Date().toISOString(); report.passed = true;
    await writeFile(new URL('prepared-production-handoff.json', EVIDENCE), JSON.stringify({ kind: 'real-production-prepared-core-handoff', createdAt: new Date().toISOString(), runId, runRoot: path.resolve(runRoot), cacheRoot: path.resolve(cacheRoot),
      protectedResumeConfigPath: path.join(descriptor.directories.private, 'resume-config.json'), descriptor, accountingRoots: accounting, evidence: `prepared-production-${runId}.json`, actualTV: false, productionMediaModules: true, noTokensCredentialsOrMediaURLs: true }, null, 2));
    say({ phase: 'production-prepared-gate-passed', episodes: report.episodes.map(row => ({ episode: row.episode, seeksMs: row.seeks.map(seek => seek.elapsedMs) })), peakAccountedBytes: report.peakAccountedBytes });
  } catch (error) { report.failed = { code: error.code ?? 'assertion-or-pilot-error', name: error.name, message: String(error.message).replace(/https?:\/\/\S+/g, '[private-resource]').slice(0, 240) }; say({ phase: 'production-prepared-gate-failed', ...report.failed }); process.exitCode = 1; }
  finally { await media?.shutdown().catch(() => {}); if (relay) { relay.closeAllConnections(); await new Promise(resolve => relay.close(resolve)); } await stopEngine();
    report.cleanup.engineStopped = !engineProcess || engineProcess.exitCode !== null || engineProcess.signalCode !== null; report.cleanup.originalDownloads = 0; report.cleanup.assetsPreservedForOwnedRestart = true; await checkpoint(); }
}
if (process.env.PTI_RUN_PREPARED_PRODUCTION === '1') await main(); else console.log('Prepared production real-media gate disabled; set explicit exclusive-engine opt-ins.');
