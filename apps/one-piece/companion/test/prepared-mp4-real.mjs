/** Explicit, exclusive-engine, cached-only MP4 feasibility experiment. Not production delivery.
 * Defaults to no-op. No TV, public listener, arbitrary source proxy or upstream original download.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { readFile, writeFile, mkdir, readdir, lstat, rename, rm, open } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { ARCHIVE_ITEMS, buildCatalog } from '../src/sources/archive.mjs';
import { MediaCache, scanFiles } from '../src/media/cache.mjs';
import { JellyfinClient, deviceProfile } from '../src/media/jellyfin.mjs';
import { dedicatedEngineDescriptor } from '../src/media/runtime.mjs';
import { WindowsProtection } from '../src/dpapi.mjs';
import { saveRuntimeSecret, loadRuntimeSecret } from '../src/runtime/config.mjs';

const PILOT = 'H:/PTI-OnePiece/pilot/jellyfin', ROOT = 'H:/PTI-OnePiece/production-media';
const BIN = `${PILOT}/runtime/jellyfin`, BASE = 'http://127.0.0.1:18096';
const EVIDENCE = new URL('../../../../docs/one-piece/evidence/cast-media-compat/', import.meta.url);
const elapsed = start => Math.round(performance.now() - start);
const MiB = 1024 ** 2;

async function command(executable, args, { timeoutMs = 15000, outputLimit = 8 * MiB } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', bytes = 0, settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Owned media command reached its deadline')); }, timeoutMs);
    const consume = (part, stderr) => { bytes += part.length; if (bytes > outputLimit) { child.kill(); finish(new Error('Owned command output limit')); }
      else if (stderr) err += part; else out += part; };
    child.stdout.on('data', chunk => consume(chunk, false)); child.stderr.on('data', chunk => consume(chunk, true));
    child.on('error', () => finish(new Error('Owned media command could not start')));
    child.on('close', code => finish(null, { code, out, err }));
  });
}

async function shaFile(file) { const digest = createHash('sha256'); for await (const bytes of createReadStream(file)) digest.update(bytes); return digest.digest('hex'); }
async function probe(file) {
  const result = await command(`${BIN}/ffprobe.exe`, ['-v', 'error', '-show_entries',
    'format=duration,size,start_time:stream=index,codec_type,codec_name,profile,pix_fmt,level,width,height,channels,sample_rate,start_time,duration:stream_tags=language', '-of', 'json', file]);
  assert.equal(result.code, 0, 'Final MP4 metadata probe failed'); return JSON.parse(result.out);
}
async function atoms(file) {
  const handle = await open(file, 'r'), size = (await handle.stat()).size, boxes = []; let at = 0;
  try { while (at + 8 <= size) {
    assert.ok(boxes.length < 10000, 'Too many top-level MP4 boxes');
    const buffer = Buffer.alloc(16); await handle.read(buffer, 0, Math.min(16, size - at), at);
    let bytes = buffer.readUInt32BE(0); const type = buffer.toString('ascii', 4, 8);
    if (bytes === 1) bytes = Number(buffer.readBigUInt64BE(8)); else if (bytes === 0) bytes = size - at;
    assert.ok(Number.isSafeInteger(bytes) && bytes >= 8 && at + bytes <= size, 'Invalid MP4 box boundary');
    boxes.push({ type, start: at, bytes }); at += bytes;
  } } finally { await handle.close(); }
  assert.equal(at, size, 'MP4 has an incomplete trailing box');
  return { bytes: size, boxCount: boxes.length, types: [...new Set(boxes.map(box => box.type))],
    fragmented: boxes.some(box => box.type === 'moof'),
    moovBeforeMedia: boxes.findIndex(box => box.type === 'moov') >= 0 && boxes.findIndex(box => box.type === 'moov') < boxes.findIndex(box => box.type === 'mdat') };
}

function interval(range, size) {
  if (!range) return { start: 0, end: size - 1, length: size, ranged: false };
  const match = /^bytes=(\d*)-(\d*)$/.exec(range); assert.ok(match && (match[1] || match[2]), 'Only one byte range is permitted');
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
  const end = match[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
  assert.ok(Number.isSafeInteger(start) && Number.isSafeInteger(end) && start >= 0 && start <= end && start < size, 'Unsatisfiable byte range');
  return { start, end, length: end - start + 1, ranged: true };
}
async function bytesAt(file, start, length) {
  const handle = await open(file, 'r'); try { const buffer = Buffer.alloc(length); const result = await handle.read(buffer, 0, length, start); assert.equal(result.bytesRead, length); return buffer; }
  finally { await handle.close(); }
}
async function readLimited(response, maxBytes) {
  const parts = []; let count = 0;
  if (!response.body) return Buffer.alloc(0);
  try { for await (const part of response.body) { count += part.length; assert.ok(count <= maxBytes, 'Private response exceeded exact byte budget'); parts.push(part); } }
  finally { await response.body?.cancel().catch(() => {}); }
  return Buffer.concat(parts);
}

async function main() {
  assert.equal(process.env.PTI_EXCLUSIVE_PILOT_LANE, 'prepared-mp4', 'Explicit exclusive-engine lane required');
  const episodes = (process.env.PTI_PREPARED_MP4_EPISODES ?? '1000,1001').split(',').map(Number);
  assert.ok(episodes.length <= 2 && episodes.length && episodes.every(number => [1000, 1001].includes(number)), 'Only verified cached 1000/1001 are allowed');
  const runId = new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomBytes(3).toString('hex');
  const reuseName = process.env.PTI_PREPARED_MP4_REUSE_EVIDENCE;
  assert.ok(!reuseName || /^prepared-mp4-[\dTZ-]+-[a-f0-9]{6}\.json$/.test(reuseName), 'Reuse requires an exact prior sanitized evidence filename');
  const reused = reuseName ? JSON.parse(await readFile(new URL(reuseName, EVIDENCE), 'utf8')) : null;
  assert.ok(!reused || /^[\dTZ-]+-[a-f0-9]{6}$/.test(reused.runId), 'Invalid previous run identity');
  let assetRunId = reused?.assetRunId ?? reused?.runId ?? runId, lineage = reused;
  for (let n = 0; lineage?.reusedPreparedEvidence && !lineage.assetRunId; n++) {
    assert.ok(n < 8 && /^prepared-mp4-[\dTZ-]+-[a-f0-9]{6}\.json$/.test(lineage.reusedPreparedEvidence), 'Invalid bounded reuse lineage');
    lineage = JSON.parse(await readFile(new URL(lineage.reusedPreparedEvidence, EVIDENCE), 'utf8')); assetRunId = lineage.assetRunId ?? lineage.runId;
  }
  assert.match(assetRunId, /^[\dTZ-]+-[a-f0-9]{6}$/);
  const keepIsolated = process.env.PTI_KEEP_ISOLATED_PREPARED_ENGINE === '1';
  const runRoot = `${ROOT}/prepared-mp4-pilot/${assetRunId}`, libraryRoot = `${runRoot}/library`, workRoot = `${runRoot}/work`;
  for (const dir of [libraryRoot, workRoot, `${runRoot}/captions`]) await mkdir(dir, { recursive: true });
  await mkdir(EVIDENCE, { recursive: true });
  const report = { kind: 'complete-mp4-jellyfin-private-preparation-static-range-pilot', runId, startedAt: new Date().toISOString(),
    newOriginalDownloads: 0, actualCast: false, productionApiAuthenticated: false, heardJapanese: false, subtitlesVisuallyVerified: false,
    scope: 'technical private engine and exact loopback test relay; no production media policy', assetRunId, reusedPreparedEvidence: reuseName ?? null, episodes: [], steps: [], cleanup: {} };
  let secret, previousEncoding, libraryName, ownLibrary, libraryCreated = false, relay, relayCapability, relayPort, staticEngine, isolatedProcess, isolatedExit, isolatedDescriptor;
  const contexts = [], relayAssets = new Map(), preservedOriginals = [], verifiedReuse = new Map();
  const cache = new MediaCache({ cacheRoot: `${ROOT}/cache`, managedRoots: { transcodes: `${ROOT}/transcodes`, subtitles: `${PILOT}/data-v2/data/subtitles` },
    extraAccountingRoots: [ROOT, PILOT, 'H:/PTI-OnePiece/runtime/media', 'H:/PTI-OnePiece/runtime/jellyfin'],
    downloader: { async download() { throw new Error('Every upstream original download is forbidden'); } } });
  const engine = new JellyfinClient({ baseUrl: BASE, originalRoot: cache.originalRoot, transcodeRoot: `${ROOT}/transcodes`,
    allowOtherLibrariesForPilot: true, ffprobePath: `${BIN}/ffprobe.exe`, tokenProvider: async () => secret });
  const say = data => console.log(JSON.stringify(data));
  const account = async () => { const usage = await cache.usage(); assert.ok(usage.projectedBytes <= usage.limitBytes, 'Shared 20 GiB accounting exceeded');
    assert.ok(usage.freeBytes - usage.reservedBytes >= usage.minimumFreeBytes, 'Disk headroom exceeded');
    report.peakAccountedBytes = Math.max(report.peakAccountedBytes ?? 0, usage.projectedBytes); return usage; };
  const fetchPrivate = async (resource, { method = 'GET', range, deviceId = 'prepared-mp4-probe', signal, timeoutMs = 30000, delivery = false } = {}) => {
    assert.ok(/^\/videos\//i.test(resource) && !resource.includes('://'), 'Only admitted private video resources permitted');
    const selectedEngine = delivery ? staticEngine : engine; assert.ok(selectedEngine);
    return fetch(selectedEngine.baseUrl + resource, { method, redirect: 'manual', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      headers: { Authorization: await selectedEngine.auth(deviceId), ...(range ? { Range: range } : {}) } });
  };
  const stopContext = async context => {
    await engine.request(`/Videos/ActiveEncodings?DeviceId=${encodeURIComponent(context.deviceId)}&PlaySessionId=${encodeURIComponent(context.playSessionId)}`, { method: 'DELETE' });
    await engine.request('/Sessions/Playing/Stopped', { method: 'POST', deviceId: context.deviceId, body: {
      ItemId: context.itemId, MediaSourceId: context.mediaSourceId, PlaySessionId: context.playSessionId, PositionTicks: 0, Failed: false } });
  };
  const children = async explicitPid => {
    const enginePid = explicitPid ?? Number(await readFile(`${PILOT}/private/process.id`, 'utf8')); assert.ok(Number.isSafeInteger(enginePid) && enginePid > 0);
    const result = await command('pwsh', ['-NoProfile', '-Command', `$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${enginePid}'; if(-not $p -or $p.ExecutablePath -ne [IO.Path]::GetFullPath('H:/PTI-OnePiece/pilot/jellyfin/runtime/jellyfin/jellyfin.exe')){throw 'Pilot identity mismatch'}; $c=@(Get-CimInstance Win32_Process|Where-Object{$_.ParentProcessId -eq ${enginePid} -and $_.Name -in @('ffmpeg.exe','ffprobe.exe')}|Select-Object ProcessId,Name); ConvertTo-Json -InputObject $c -Compress`]);
    assert.equal(result.code, 0, 'Pilot process identity check failed'); return JSON.parse(result.out.trim() || '[]');
  };
  async function waitNoChildren(pid) { for (let n = 0; n < 20; n++) { const found = await children(pid); if (!found.length) return found; await delay(250); } throw new Error('Private engine children remained after owned work'); }
  async function startStaticEngine() {
    const began = performance.now(), port = 18106;
    const probeListener = createTcpServer();
    await new Promise((resolve, reject) => { probeListener.once('error', reject); probeListener.listen(port, '127.0.0.1', resolve); });
    await new Promise(resolve => probeListener.close(resolve));
    isolatedDescriptor = dedicatedEngineDescriptor({ runtimeRoot: `${runRoot}/isolated-engine/${runId}`, binaryDir: BIN, port });
    const protection = new WindowsProtection(); await protection.secureDirectory(path.resolve(`${runRoot}/isolated-engine/${runId}`));
    for (const dir of Object.values(isolatedDescriptor.directories)) await mkdir(dir, { recursive: true });
    await writeFile(isolatedDescriptor.networkConfigPath, isolatedDescriptor.networkXml);
    await writeFile(path.join(isolatedDescriptor.directories.config, 'system.xml'), '<?xml version="1.0" encoding="utf-8"?><ServerConfiguration><IsStartupWizardCompleted>false</IsStartupWizardCompleted><PluginRepositories /></ServerConfiguration>');
    const stdout = createWriteStream(path.join(isolatedDescriptor.directories.logs, 'console.out.log'), { flags: 'wx' });
    const stderr = createWriteStream(path.join(isolatedDescriptor.directories.logs, 'console.err.log'), { flags: 'wx' });
    isolatedProcess = spawn(isolatedDescriptor.executable, isolatedDescriptor.args, { windowsHide: true, shell: false, cwd: isolatedDescriptor.workingDirectory, stdio: ['ignore', 'pipe', 'pipe'] });
    isolatedProcess.stdout.pipe(stdout); isolatedProcess.stderr.pipe(stderr);
    isolatedExit = new Promise(resolve => { isolatedProcess.once('error', () => resolve({ error: 'spawn-failed' })); isolatedProcess.once('close', (code, signal) => resolve({ code, signal })); });
    let token, ready = false;
    staticEngine = new JellyfinClient({ baseUrl: isolatedDescriptor.baseUrl, tokenProvider: async () => token,
      originalRoot: libraryRoot, transcodeRoot: isolatedDescriptor.directories.transcodes });
    const initial = async (resource, body) => {
      const reply = await fetch(isolatedDescriptor.baseUrl + resource, { method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'MediaBrowser Client="PTI One Piece", Device="Isolated static pilot", DeviceId="prepared-mp4-isolated", Version="1"' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000) });
      assert.ok(reply.ok, `Isolated initialization HTTP ${reply.status}`); const bytes = await readLimited(reply, 2 * MiB); return bytes.length ? JSON.parse(bytes) : null;
    };
    for (let n = 0; n < 120; n++) { if (isolatedProcess.exitCode !== null) throw new Error('Isolated static engine exited during startup');
      try { const info = await initial('/System/Info/Public'); assert.match(info.Version, /^12\.2(?:\.|$)/); ready = true; break; } catch {} await delay(500); }
    assert.ok(ready, 'Isolated static engine startup deadline');
    const binding = await command('pwsh', ['-NoProfile', '-Command', `$a=@(Get-NetTCPConnection -State Listen -OwningProcess ${isolatedProcess.pid} -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort);ConvertTo-Json -InputObject $a -Compress`]);
    assert.equal(binding.code, 0); const listeners = JSON.parse(binding.out.trim() || '[]');
    assert.ok(listeners.length > 0 && listeners.every(listener => listener.LocalAddress === '127.0.0.1' && listener.LocalPort === port), 'Isolated engine escaped loopback binding');
    const username = 'isolated-mp4-' + randomBytes(6).toString('hex'), password = randomBytes(32).toString('base64url');
    await initial('/Startup/FirstUser'); await initial('/Startup/User', { Name: username, Password: password });
    await initial('/Startup/RemoteAccess', { EnableRemoteAccess: false, EnableAutomaticPortMapping: false }); await initial('/Startup/Complete', {});
    token = (await initial('/Users/AuthenticateByName', { Username: username, Pw: password })).AccessToken; assert.ok(token);
    if (keepIsolated) {
      const privateConfig = { jellyfinTokenPath: path.join(isolatedDescriptor.directories.private, 'jellyfin-token.dpapi'),
        jellyfinCredentialsPath: path.join(isolatedDescriptor.directories.private, 'jellyfin-admin.dpapi') };
      await saveRuntimeSecret(privateConfig, 'jellyfinToken', token, { protection });
      await saveRuntimeSecret(privateConfig, 'jellyfinCredentials', JSON.stringify({ username, password }), { protection });
      assert.equal(await loadRuntimeSecret(privateConfig, 'jellyfinToken', { protection }), token, 'Protected restart token did not roundtrip');
      await writeFile(path.join(isolatedDescriptor.directories.private, 'resume-config.json'), JSON.stringify({ ...privateConfig, runtimeRoot: path.resolve(`${runRoot}/isolated-engine/${runId}`),
        binaryDir: path.resolve(BIN), port, libraryRoot: path.resolve(libraryRoot), executable: isolatedDescriptor.executable, args: isolatedDescriptor.args }, null, 2));
    }
    const tasks = await staticEngine.request('/ScheduledTasks'); for (const task of tasks) await staticEngine.request(`/ScheduledTasks/${task.Id}/Triggers`, { method: 'POST', body: [] });
    const folders = await staticEngine.request('/Library/VirtualFolders'); assert.equal(folders.length, 0, 'Clean static instance already had a library');
    report.isolatedEngine = { port, setupMs: elapsed(began), pinnedBinaryReused: true, listeners, initialLibraries: folders.length, scheduledTasksDisabled: tasks.length,
      credentialsInScriptArgumentsOrRepo: false, accountState: 'Generated login secrets in process memory; engine account/session state in protected isolated data only' };
    report.isolatedEngine.libraryMonitorDelaySeconds = (await staticEngine.request('/System/Configuration')).LibraryMonitorDelay;
    assert.ok(Number.isInteger(report.isolatedEngine.libraryMonitorDelaySeconds) && report.isolatedEngine.libraryMonitorDelaySeconds <= 60);
    await account(); say({ phase: 'isolated-static-engine-ready', setupMs: report.isolatedEngine.setupMs });
  }
  async function ensureDerived(file) {
    const initialized = report.steps.some(step => step.phase === 'exact-file-import');
    const timeoutMs = initialized ? Math.min(75000, report.isolatedEngine.libraryMonitorDelaySeconds * 1000 + 15000) : 30000;
    const deadline = Date.now() + timeoutMs, began = performance.now();
    assert.ok(path.resolve(file).startsWith(path.resolve(libraryRoot) + path.sep));
    const folders = await staticEngine.request('/Library/VirtualFolders');
    assert.ok(folders.length === 1 && folders[0].ItemId === ownLibrary.ItemId && folders[0].Locations.length === 1 && path.resolve(folders[0].Locations[0]) === path.resolve(libraryRoot), 'Scoped static scan escaped exact owned library');
    const files = await scanFiles(libraryRoot), admitted = [...new Set([...report.episodes.map(row => row.episode), ...verifiedReuse.keys()])];
    const permitted = new Set(admitted.flatMap(episode => [
      path.resolve(`${libraryRoot}/episode-${episode}/One Piece ${episode}.mp4`), path.resolve(`${libraryRoot}/episode-${episode}/One Piece ${episode}.en.vtt`)]));
    assert.ok(files.length && files.every(entry => permitted.has(path.resolve(entry.path))), 'Finite static library contains an unadmitted file');
    report.isolatedEngine.finiteScanFiles = files.map(entry => ({ role: entry.path.endsWith('.vtt') ? 'full-English-captions' : 'verified-prepared-video', bytes: entry.bytes }));
    // One-time initialization is finite. Later additions must use exact-file discovery.
    const existing = initialized && (await staticEngine.request(`/Items?Recursive=true&ParentId=${ownLibrary.ItemId}&IncludeItemTypes=Movie&Fields=MediaSources,MediaStreams,Path`)).Items?.find(item => path.resolve(item.Path ?? '') === path.resolve(file) && item.MediaSources?.[0]?.MediaStreams?.length);
    if (existing) { report.steps.push({ phase: 'exact-file-import', episode: Number(path.basename(path.dirname(file)).split('-')[1]), method: 'resolved-existing-verified-file', elapsedMs: elapsed(began), timeoutMs }); return existing; }
    if (initialized) await staticEngine.request('/Library/Media/Updated', { method: 'POST', body: { Updates: [{ Path: path.resolve(file), UpdateType: 'Created' }] } });
    else await staticEngine.request('/Library/Refresh', { method: 'POST', timeoutMs });
    while (Date.now() < deadline) {
      const items = await staticEngine.request(`/Items?Recursive=true&ParentId=${ownLibrary.ItemId}&IncludeItemTypes=Movie&Fields=MediaSources,MediaStreams,Path`);
      const item = items.Items?.find(item => path.resolve(item.Path ?? '') === path.resolve(file) && item.MediaSources?.[0]?.MediaStreams?.length);
      if (item) { report.steps.push({ phase: 'exact-file-import', episode: Number(path.basename(path.dirname(file)).split('-')[1]), method: initialized ? 'exact-file-update' : 'one-time-finite-library-initialization', elapsedMs: elapsed(began), timeoutMs }); return item; } await delay(750);
    }
    throw new Error('Isolated finite-library import did not discover prepared file');
  }
  try {
    secret = JSON.parse(await readFile(`${PILOT}/private/state.json`, 'utf8')).token;
    const network = await engine.request('/System/Configuration/network'), info = await engine.request('/System/Info/Public');
    assert.match(info.Version, /^12\.2(?:\.|$)/); assert.ok(network.LocalNetworkAddresses.every(address => ['127.0.0.1', '::1'].includes(address)) && !network.EnableRemoteAccess);
    await waitNoChildren(); report.engineVersion = info.Version;
    const systemConfiguration = await engine.request('/System/Configuration');
    assert.ok(Number.isInteger(systemConfiguration.LibraryMonitorDelay) && systemConfiguration.LibraryMonitorDelay >= 0 && systemConfiguration.LibraryMonitorDelay <= 60, 'Configured scoped import delay exceeds pilot bound');
    report.libraryMonitorDelaySeconds = systemConfiguration.LibraryMonitorDelay;
    await cache.initialize(); for (const entry of cache.entries.values()) {
      cache.pin(entry.candidate.id, runId); const file = cache.entryPath(entry.candidate), stats = await lstat(file);
      preservedOriginals.push({ file, bytes: stats.size, mtimeMs: stats.mtimeMs });
    }
    const folders = await engine.request('/Library/VirtualFolders');
    engine.library = folders.find(folder => folder.Name === 'PTI One Piece Cache' && folder.Locations?.every(location => path.resolve(location) === cache.originalRoot));
    assert.ok(engine.library?.ItemId, 'Existing bounded original library required');
    const catalog = buildCatalog(await Promise.all(ARCHIVE_ITEMS.map(item => readFile(new URL(`../../../../docs/one-piece/evidence/sources/${item}.json`, import.meta.url), 'utf8').then(JSON.parse))));
    for (const prior of reused?.episodes ?? []) if (episodes.includes(prior.episode) && prior.bytes) {
      const candidate = catalog.episodes[prior.episode - 1].candidates.find(candidate => candidate.role === 'original');
      assert.equal(prior.original.md5, candidate.checksums.md5);
      const final = `${libraryRoot}/episode-${prior.episode}/One Piece ${prior.episode}.mp4`, stats = await lstat(final);
      assert.ok(stats.isFile() && !stats.isSymbolicLink() && stats.size === prior.bytes); assert.equal(await shaFile(final), prior.sha256);
      verifiedReuse.set(prior.episode, prior);
    }
    for (const number of episodes) {
      const row = { episode: number, phase: 'metadata', ranges: [], streamedSeeks: [] }; report.episodes.push(row);
      const candidate = catalog.episodes[number - 1].candidates.find(candidate => candidate.role === 'original');
      const entry = await cache.readyEntry(candidate); assert.ok(entry, 'Required original must already be MD5 verified in cache');
      row.original = { bytes: candidate.bytes, md5: candidate.checksums.md5 };
      let finalFile = `${libraryRoot}/episode-${number}/One Piece ${number}.mp4`, captionFile = `${runRoot}/captions/${number}.en.vtt`, vtt;
      const prior = verifiedReuse.get(number);
      if (prior) {
        assert.ok(prior?.bytes && prior.original.md5 === candidate.checksums.md5 && prior.sha256 && prior.captions?.sha256, 'No verified completed prior rendition for this exact original');
        const stats = await lstat(finalFile); assert.ok(stats.isFile() && !stats.isSymbolicLink() && stats.size === prior.bytes);
        assert.equal(await shaFile(finalFile), prior.sha256); vtt = await readFile(captionFile);
        assert.equal(createHash('sha256').update(vtt).digest('hex'), prior.captions.sha256);
        Object.assign(row, prior, { phase: 'verified-prior-complete-file-reuse', ranges: [], streamedSeeks: [], originalPreparationMs: prior.originalPreparationMs ?? prior.readyPreparationMs, readyPreparationMs: null });
        row.metadata = await probe(finalFile); row.atoms = await atoms(finalFile);
        assert.ok(!row.atoms.fragmented && row.atoms.moovBeforeMedia && Math.abs(Number(row.metadata.format.duration) - row.durationSeconds) < .25);
      } else {
      if (!previousEncoding) { previousEncoding = await engine.request('/System/Configuration/encoding');
        await engine.request('/System/Configuration/encoding', { method: 'POST', body: { ...previousEncoding,
          TranscodingTempPath: `${ROOT}/transcodes`, HardwareAccelerationType: 'nvenc', EnableHardwareEncoding: true,
          HardwareDecodingCodecs: ['h264', 'hevc'], EnableDecodingColorDepth10Hevc: true, AllowHevcEncoding: false,
          EnableThrottling: false, EnableSegmentDeletion: false } }); }
      const metadataOwner = `mp4-metadata-${number}-${runId}`, metadataUsage = await cache.usage();
      assert.ok(metadataUsage.projectedBytes + 64 * MiB <= metadataUsage.limitBytes, 'No room for bounded timing/caption preparation');
      await cache.reserveEngine(metadataOwner, 64 * MiB);
      const began = performance.now(), originalSession = `mp4-original-${number}-${runId}`;
      const original = await engine.openPlayback({ sessionId: originalSession, entry });
      const originalBinding = engine.sessions.get(originalSession); contexts.push(originalBinding);
      row.selected = original.selected; row.durationSeconds = original.durationSeconds; row.containerDurationSeconds = original.containerDurationSeconds;
      const captions = await engine.getPlaybackResource(originalSession, original.subtitlePath); vtt = Buffer.from(await new Response(captions.body).arrayBuffer());
      assert.ok(vtt.length <= 16 * MiB && vtt.toString('utf8').startsWith('WEBVTT') && vtt.includes('-->'));
      row.captions = { bytes: vtt.length, cues: (vtt.toString('utf8').match(/-->/g) ?? []).length, sha256: createHash('sha256').update(vtt).digest('hex'), source: 'inspected original full-English track; no timing shift' };
      await writeFile(captionFile, vtt);
      cache.releaseEngine(metadataOwner);
      const outputBudget = Math.ceil(Math.max(candidate.bytes * 1.25, original.durationSeconds * 10000000 / 8 * 1.2) + 64 * MiB);
      // Deliberately conservative: full engine output + adapter part + faststart output.
      const reserved = outputBudget * 3, owner = `mp4-output-${number}-${runId}`;
      const before = await cache.usage(); assert.ok(before.projectedBytes + reserved <= before.limitBytes, 'No room for complete-file peak; no original eviction allowed');
      await cache.reserveEngine(owner, reserved); await account();
      const profile = deviceProfile('compatible-h264'); profile.Name = 'PTI private prepared MP4';
      Object.assign(profile.TranscodingProfiles[0], { Container: 'mp4', Protocol: 'http', Context: 'Streaming', CopyTimestamps: true });
      const deviceId = `mp4-prep-${number}-${runId}`;
      const negotiation = { MediaSourceId: original.mediaSourceId, AudioStreamIndex: original.selected.audioIndex, SubtitleStreamIndex: original.selected.subtitleIndex,
        MaxStreamingBitrate: 10000000, MaxAudioChannels: 2, EnableDirectPlay: false, EnableDirectStream: true, EnableTranscoding: true,
        AllowVideoStreamCopy: number === 1000, AllowAudioStreamCopy: true, DeviceProfile: profile };
      const reply = await engine.request(`/Items/${original.itemId}/PlaybackInfo`, { method: 'POST', deviceId, body: negotiation });
      const media = reply.MediaSources?.find(source => source.Id === original.mediaSourceId);
      assert.ok(media?.TranscodingUrl && media.DefaultAudioStreamIndex === original.selected.audioIndex, 'Private progressive negotiation ignored selected audio');
      const binding = { itemId: original.itemId, mediaSourceId: original.mediaSourceId, selected: original.selected, deviceId, playSessionId: reply.PlaySessionId }; contexts.push(binding);
      const progressive = engine.canonicalResource(media.TranscodingUrl, binding); assert.match(new URL(progressive, BASE).pathname, /\/stream(?:\.mp4)?$/i, 'Engine did not negotiate progressive MP4');
      row.negotiation = { protocol: 'http', container: 'mp4', video: 'h264', audio: 'aac', allowVideoCopy: number === 1000,
        maxBitrate: 10000000, selectedAudioIndex: original.selected.audioIndex, selectedSubtitleIndex: original.selected.subtitleIndex,
        role: 'private preparation only, never delivered as a seekable object' };
      const beforeLogs = new Set(await readdir(`${PILOT}/logs`)); row.phase = 'complete-private-progressive-preparation'; say({ episode: number, phase: row.phase });
      const rawFile = `${workRoot}/${number}.progressive.part.mp4`, conversionBegan = performance.now();
      const response = await fetchPrivate(progressive, { deviceId, timeoutMs: 360000 }); assert.equal(response.status, 200, 'Private progressive conversion failed');
      row.progressiveHeaders = { contentType: response.headers.get('content-type'), acceptRanges: response.headers.get('accept-ranges') };
      assert.match(row.progressiveHeaders.contentType ?? '', /video\/mp4/i);
      let received = 0, lastCheck = 0;
      await pipeline(Readable.fromWeb(response.body), async function* (source) {
        for await (const part of source) { received += part.length; row.progressiveBytesReceived = received; assert.ok(received <= outputBudget, 'Private full-file output exceeds reservation');
          if (received - lastCheck > 64 * MiB) { lastCheck = received; await account(); say({ episode: number, phase: 'preparing', bytes: received }); }
          yield part; }
      }, createWriteStream(rawFile, { flags: 'wx' }));
      row.conversion = { elapsedMs: elapsed(conversionBegan), bytes: received, eof: true, osChildExitCodeAvailableViaHttp: false };
      row.rawAtoms = await atoms(rawFile); const rawMetadata = await probe(rawFile);
      assert.ok(Math.abs(Number(rawMetadata.format.duration) - original.durationSeconds) < .25, 'Prepared private output is truncated or has an unselected tail');
      row.phase = 'finalize-classic-faststart'; let completed = rawFile;
      if (row.rawAtoms.fragmented || !row.rawAtoms.moovBeforeMedia) {
        completed = `${workRoot}/${number}.final.part.mp4`; const t = performance.now();
        const remux = await command(`${BIN}/ffmpeg.exe`, ['-v', 'warning', '-i', rawFile, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy',
          '-map_metadata', '-1', '-metadata:s:a:0', 'language=jpn', '-movflags', '+faststart', '-f', 'mp4', '-n', completed], { timeoutMs: 120000 });
        assert.equal(remux.code, 0, 'Owned no-reencode faststart finalization failed'); row.finalization = { needed: true, codecCopy: true, elapsedMs: elapsed(t), exitCode: remux.code };
      } else row.finalization = { needed: false, reason: 'Already complete classic MP4 with front index' };
      await mkdir(`${libraryRoot}/episode-${number}`, { recursive: true });
      await rename(completed, finalFile);
      row.metadata = await probe(finalFile); row.atoms = await atoms(finalFile); row.sha256 = await shaFile(finalFile); row.bytes = (await lstat(finalFile)).size;
      const video = row.metadata.streams.filter(stream => stream.codec_type === 'video'), audio = row.metadata.streams.filter(stream => stream.codec_type === 'audio');
      assert.equal(video.length, 1); assert.equal(audio.length, 1); assert.equal(video[0].codec_name, 'h264'); assert.equal(video[0].pix_fmt, 'yuv420p'); assert.equal(audio[0].codec_name, 'aac');
      assert.ok(!row.atoms.fragmented && row.atoms.moovBeforeMedia); assert.ok(Math.abs(Number(row.metadata.format.duration) - original.durationSeconds) < .25);
      row.jobs = [];
      for (const name of (await readdir(`${PILOT}/logs`)).filter(name => !beforeLogs.has(name) && name.startsWith('FFmpeg.'))) {
        const text = await readFile(`${PILOT}/logs/${name}`, 'utf8'), line = text.split('\n').find(line => /ffmpeg\.exe -/.test(line));
        row.jobs.push({ log: name, videoCopy: /-codec:v:0 copy/.test(line), nvenc: /-codec:v:0 h264_nvenc/.test(line),
          selectedJapaneseMap: new RegExp(`-map 0:${original.selected.audioIndex}(?:\\s|$)`).test(line),
          noSubtitleBurnFilter: !/subtitles=|ass=/.test(line), normalFinalStatistics: /Lsize=/.test(text), conversionFailureMarker: /Conversion failed|Error while|Error opening/.test(text) });
      }
      assert.ok(row.jobs.some(job => job.selectedJapaneseMap && job.noSubtitleBurnFilter && (number === 1000 ? job.videoCopy : job.nvenc)), 'Actual private engine command did not prove requested mapping/mode');
      assert.ok(row.jobs.every(job => job.normalFinalStatistics && !job.conversionFailureMarker), 'Private engine did not report normal final statistics');
      await stopContext(binding); await engine.stopSession(originalSession); await waitNoChildren();
      // Explicit owned-file cleanup only; canonical completed asset remains for later receiver work.
      if (rawFile !== finalFile) await rm(rawFile, { force: true });
      cache.releaseEngine(owner); row.readyPreparationMs = elapsed(began); await account();
      }
      await writeFile(`${libraryRoot}/episode-${number}/One Piece ${number}.en.vtt`, vtt);
      if (!ownLibrary) {
        await startStaticEngine();
        libraryName = `PTI MP4 pilot ${runId}`;
        await staticEngine.request(`/Library/VirtualFolders?name=${encodeURIComponent(libraryName)}&collectionType=movies&refreshLibrary=false`, { method: 'POST', body: { LibraryOptions: {
          Enabled: true, EnableRealtimeMonitor: false, EnableInternetProviders: false, EnableLUFSScan: false, EnableChapterImageExtraction: false,
          ExtractChapterImagesDuringLibraryScan: false, EnableTrickplayImageExtraction: false, ExtractTrickplayImagesDuringLibraryScan: false,
          AutomaticRefreshIntervalDays: 0, SaveLocalMetadata: false, MetadataSavers: [], SubtitleDownloadLanguages: [],
          TypeOptions: [{ Type: 'Movie', MetadataFetchers: [], ImageFetchers: [] }], PathInfos: [{ Path: path.resolve(libraryRoot) }] } } });
        libraryCreated = true;
        ownLibrary = (await staticEngine.request('/Library/VirtualFolders')).find(folder => folder.Name === libraryName);
        assert.ok(ownLibrary?.ItemId && ownLibrary.Locations.length === 1 && path.resolve(ownLibrary.Locations[0]) === path.resolve(libraryRoot), 'Temporary library binding mismatch');
        report.isolatedEngine.effectiveLibraryOptionsBeforeScan = ownLibrary.LibraryOptions;
        const movie = ownLibrary.LibraryOptions?.TypeOptions?.find(type => type.Type === 'Movie');
        assert.ok(movie && Array.isArray(movie.MetadataFetchers) && movie.MetadataFetchers.length === 0 && movie.ImageFetchers?.length === 0, 'Effective provider options did not preserve disabled Movie metadata/images');
      }
      row.phase = 'static-import-and-range-verification'; const derived = await ensureDerived(finalFile), derivedSource = derived.MediaSources[0];
      row.staticIdentity = { itemId: derived.Id, mediaSourceId: derivedSource.Id, path: path.resolve(finalFile), bytes: row.bytes };
      const staticPath = `/Videos/${derived.Id}/stream.mp4?Static=true&MediaSourceId=${derivedSource.Id}`;
      const head = await fetchPrivate(staticPath, { method: 'HEAD', delivery: true }); assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), row.bytes);
      assert.match(head.headers.get('content-type') ?? '', /video\/mp4/i); row.staticHead = { status: head.status, bytes: row.bytes, acceptRanges: head.headers.get('accept-ranges') };
      for (const range of [`bytes=0-65535`, `bytes=${Math.floor(row.bytes / 2)}-${Math.floor(row.bytes / 2) + 65535}`, `bytes=${row.bytes - 65536}-${row.bytes - 1}`, 'bytes=-65536']) {
        const expected = interval(range, row.bytes), t = performance.now(), reply = await fetchPrivate(staticPath, { range, delivery: true });
        assert.equal(reply.status, 206); assert.equal(reply.headers.get('content-range'), `bytes ${expected.start}-${expected.end}/${row.bytes}`);
        const actual = await readLimited(reply, expected.length); assert.deepEqual(actual, await bytesAt(finalFile, expected.start, expected.length));
        row.ranges.push({ range, status: reply.status, bytes: actual.length, elapsedMs: elapsed(t), matchesCompletedFile: true });
      }
      row.staticRangeChildren = await waitNoChildren(isolatedProcess.pid); await waitNoChildren();
      relayAssets.set(number, { staticPath, finalFile, bytes: row.bytes, captionFile, captionBytes: vtt.length, remaining: 0, requests: [], active: 0 });
      say({ episode: number, phase: 'static-ranges-passed', preparationMs: row.readyPreparationMs, bytes: row.bytes });
      await verifyStreamedSeeks(row);
    }
    async function verifyStreamedSeeks(row) {
    if (!relay) {
    // Technical, exact-resource, loopback-only bridge avoids private engine credentials in ffmpeg argv.
    const capability = relayCapability = randomBytes(24).toString('base64url');
    relay = createServer(async (req, res) => {
      const controller = new AbortController(); res.on('close', () => controller.abort()); let observation, activeAsset;
      try {
        assert.ok(['GET', 'HEAD'].includes(req.method) && !req.headers.authorization && !req.headers.cookie);
        const match = new RegExp(`^/technical/${capability}/(1000|1001)\\.(mp4|vtt)$`).exec(req.url), asset = match && relayAssets.get(Number(match[1]));
        assert.ok(asset, 'Unknown technical resource');
        if (match[2] === 'vtt') { const vtt = await readFile(asset.captionFile); assert.ok(vtt.length === asset.captionBytes && vtt.length <= 16 * MiB); res.writeHead(200, { 'content-type': 'text/vtt', 'content-length': vtt.length }); res.end(req.method === 'HEAD' ? undefined : vtt); return; }
        const expected = interval(req.headers.range, asset.bytes);
        activeAsset = asset; asset.active++;
        observation = { method: req.method, range: req.headers.range ?? null, status: null, bytes: 0, completed: false }; asset.requests.push(observation);
        const reply = await fetchPrivate(asset.staticPath, { method: req.method, range: req.headers.range, signal: controller.signal, timeoutMs: 120000, delivery: true });
        assert.equal(reply.status, expected.ranged ? 206 : 200); if (expected.ranged) assert.equal(reply.headers.get('content-range'), `bytes ${expected.start}-${expected.end}/${asset.bytes}`);
        assert.equal(Number(reply.headers.get('content-length')), expected.length); observation.status = reply.status;
        const headers = { 'content-type': 'video/mp4', 'content-length': expected.length, 'accept-ranges': 'bytes', 'cache-control': 'no-store' };
        if (expected.ranged) headers['content-range'] = reply.headers.get('content-range'); res.writeHead(reply.status, headers);
        if (req.method === 'HEAD') { res.end(); observation.completed = true; return; }
        await pipeline(Readable.fromWeb(reply.body), async function* (source) { for await (const part of source) {
          observation.bytes += part.length; asset.remaining -= part.length; assert.ok(asset.remaining >= 0 && observation.bytes <= expected.length, 'Technical seek byte budget exceeded'); yield part;
        } }, res); observation.completed = true;
      } catch { if (observation) observation.clientOrBudgetAbort = true; if (!res.headersSent) res.writeHead(404); res.destroy(); }
      finally { if (activeAsset) activeAsset.active--; }
    });
    await new Promise(resolve => relay.listen(0, '127.0.0.1', resolve)); relayPort = relay.address().port;
    }
      const asset = relayAssets.get(row.episode), privateScopedUrl = `http://127.0.0.1:${relayPort}/technical/${relayCapability}/${row.episode}.mp4`;
      for (const position of [0, 600, row.durationSeconds - 3]) {
        asset.remaining = 64 * MiB; const beforeCount = asset.requests.length, t = performance.now();
        const result = await command(`${BIN}/ffmpeg.exe`, ['-v', 'warning', '-ss', String(position), '-i', privateScopedUrl,
          '-t', '1', '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], { timeoutMs: 30000 });
        for (let n = 0; asset.active && n < 30; n++) await delay(50);
        assert.equal(asset.active, 0, 'Previous exact seek response did not close');
        // Diagnostics can contain the scoped media URL; persist only its hash/presence, never raw text.
        row.streamedSeeks.push({ positionSeconds: position, elapsedMs: elapsed(t), decodedExitCode: result.code,
          diagnosticBytes: Buffer.byteLength(result.err), diagnosticSha256: createHash('sha256').update(result.err).digest('hex'),
          transferredBytes: 64 * MiB - asset.remaining, requests: asset.requests.slice(beforeCount) });
        assert.equal(result.code, 0, 'Exact Jellyfin static HTTP seek/decode failed'); await waitNoChildren(isolatedProcess.pid); await waitNoChildren();
      }
      row.phase = 'passed-headless-static-streaming';
      say({ episode: row.episode, phase: row.phase, streamedSeekMs: row.streamedSeeks.map(seek => seek.elapsedMs) });
    }
    report.completedAt = new Date().toISOString(); report.storage = await account();
    if (keepIsolated) {
      const handoff = { kind: 'private-prepared-mp4-isolated-jellyfin-handoff', createdAt: new Date().toISOString(),
        evidence: `prepared-mp4-${runId}.json`, assetRunId, runtimeRoot: path.resolve(`${runRoot}/isolated-engine/${runId}`),
        protectedResumeConfigPath: path.join(isolatedDescriptor.directories.private, 'resume-config.json'),
        executable: isolatedDescriptor.executable, args: isolatedDescriptor.args, loopbackHost: '127.0.0.1', port: 18106,
        library: { id: ownLibrary.ItemId, root: path.resolve(libraryRoot), nativePathsRequired: true },
        episodes: report.episodes.map(row => ({ episode: row.episode, original: row.original, selected: row.selected, durationSeconds: row.durationSeconds,
          video: { ...row.staticIdentity, sha256: row.sha256, metadata: row.metadata }, fullEnglishCaptions: { ...row.captions, path: path.resolve(`${runRoot}/captions/${row.episode}.en.vtt`) } })),
        noCredentialsTokensOrMediaUrls: true, productionPolicy: false, actualTvPassed: false };
      await writeFile(new URL('prepared-mp4-handoff.json', EVIDENCE), JSON.stringify(handoff, null, 2));
      report.handoff = 'prepared-mp4-handoff.json';
    }
  } catch (error) {
    report.error = { name: error.name, code: error.code ?? null, message: String(error.message).split('\n')[0].replaceAll(/https?:\/\/\S+/g, '[private-url]').replaceAll(secret ?? 'unmatchable-private-secret', '[private-credential]') };
    say({ phase: 'failed', code: report.error.code, message: report.error.message });
  } finally {
    if (relay) { relay.closeAllConnections(); await new Promise(resolve => relay.close(resolve)); }
    for (const context of contexts) await stopContext(context).catch(() => {});
    for (const key of [...engine.sessions.keys()]) await engine.stopSession(key).catch(() => {});
    if (libraryCreated && !(keepIsolated && !report.error)) try {
      const actual = (await staticEngine.request('/Library/VirtualFolders')).find(folder => folder.Name === libraryName);
      assert.ok(actual?.ItemId && (!ownLibrary || actual.ItemId === ownLibrary.ItemId) && actual.Locations.length === 1 && path.resolve(actual.Locations[0]) === path.resolve(libraryRoot));
      await staticEngine.request(`/Library/VirtualFolders?name=${encodeURIComponent(libraryName)}&refreshLibrary=false`, { method: 'DELETE' });
      report.cleanup.temporaryLibraryRemoved = !(await staticEngine.request('/Library/VirtualFolders')).some(folder => folder.Name === libraryName);
    } catch { report.cleanup.temporaryLibraryRemoved = false; }
    else if (libraryCreated) report.cleanup.finiteLibraryPreservedForOwnerControlledRestart = true;
    if (previousEncoding) try { await engine.request('/System/Configuration/encoding', { method: 'POST', body: previousEncoding }); report.cleanup.encodingRestored = true; }
    catch { report.cleanup.encodingRestored = false; }
    else report.cleanup.encodingUnchanged = true;
    if (isolatedProcess) {
      report.cleanup.isolatedChildrenBeforeStop = await waitNoChildren(isolatedProcess.pid).catch(() => 'identity-check-failed-or-child-remains');
      await staticEngine?.request('/System/Shutdown', { method: 'POST' }).catch(() => {});
      const closed = await Promise.race([isolatedExit, delay(10000).then(() => 'deadline')]);
      if (closed === 'deadline') isolatedProcess.kill();
      report.cleanup.isolatedEngineExit = closed === 'deadline' ? await isolatedExit : closed;
      report.cleanup.isolatedEngineStopped = isolatedProcess.exitCode !== null || isolatedProcess.signalCode !== null;
    }
    cache.releaseOwner(runId); for (const key of [...cache.engineBudgets.keys()]) cache.releaseEngine(key);
    await cache.shutdown().catch(() => {}); report.cleanup.children = await waitNoChildren().catch(() => 'identity-check-failed-or-child-remains');
    report.cleanup.verifiedOriginalCountChecked = preservedOriginals.length;
    report.cleanup.verifiedOriginalsRetained = preservedOriginals.length > 0 && (await Promise.all(preservedOriginals.map(async original => {
      const stats = await lstat(original.file).catch(() => null); return stats?.isFile() && stats.size === original.bytes && stats.mtimeMs === original.mtimeMs;
    }))).every(Boolean);
    const completedRows = report.episodes.filter(row => row.bytes);
    report.cleanup.completedAssetCountChecked = completedRows.length;
    report.cleanup.completedAssetsOnH = completedRows.length > 0 && (await Promise.all(completedRows.map(async row =>
      (await lstat(`${libraryRoot}/episode-${row.episode}/One Piece ${row.episode}.mp4`).catch(() => null))?.size === row.bytes))).every(Boolean);
    report.cleanup.ownedPartialFilesRemoved = [];
    for (const name of await readdir(workRoot)) if (/^(?:1000|1001)\.(?:progressive|final)\.part\.mp4$/.test(name)) {
      const file = path.resolve(workRoot, name); assert.ok(file.startsWith(path.resolve(workRoot) + path.sep));
      const stats = await lstat(file); assert.ok(stats.isFile() && !stats.isSymbolicLink());
      await rm(file); report.cleanup.ownedPartialFilesRemoved.push({ role: name.split('.')[1], bytes: stats.size });
    }
    await writeFile(new URL(`prepared-mp4-${runId}.json`, EVIDENCE), JSON.stringify(report, null, 2));
    await writeFile(new URL('prepared-mp4-latest.json', EVIDENCE), JSON.stringify(report, null, 2));
  }
  say({ evidence: `docs/one-piece/evidence/cast-media-compat/prepared-mp4-${runId}.json`, error: report.error ?? null,
    episodes: report.episodes.map(row => ({ episode: row.episode, phase: row.phase, preparationMs: row.readyPreparationMs,
      streamedSeekMs: row.streamedSeeks.map(seek => seek.elapsedMs) })), cleanup: report.cleanup });
  if (report.error || report.cleanup.encodingRestored === false || report.cleanup.temporaryLibraryRemoved === false) process.exitCode = 1;
}

if (process.env.PTI_RUN_PREPARED_MP4 === '1') await main();
else console.log('Skipped: no engine, GPU, filesystem mutation, network or TV activity. Set PTI_RUN_PREPARED_MP4=1 and acquire exclusive prepared-mp4 lane.');
