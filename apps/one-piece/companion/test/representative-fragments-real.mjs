/** Opt-in, bounded public-Archive head fragments. No engine/relay/TV/GPU/full originals. */
import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, open, statfs, realpath } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createArchiveTransport, RANGE_MAX_BYTES } from '../src/sources/transport.mjs';
import { parseEpisodeFile, lookupEpisode } from '../src/sources/archive.mjs';
import { validateOriginal } from '../src/media/download.mjs';
import { scanFiles, hashFile, CACHE_LIMIT_BYTES, MINIMUM_FREE_BYTES } from '../src/media/cache.mjs';
import { selectTracks } from '../src/media/jellyfin.mjs';
import { runPreparedCommand } from '../src/media/prepared.mjs';
import { PreparedToolRegistry } from '../src/media/prepared-processes.mjs';
import { WindowsProtection } from '../src/dpapi.mjs';

const MiB = 1024 ** 2, EPISODES = [500, 944, 1044, 1085], PER_EPISODE = 8 * MiB, TOTAL = EPISODES.length * PER_EPISODE;
const MEDIA_ROOT = 'H:/PTI-OnePiece/production-media', BIN = 'H:/PTI-OnePiece/pilot/jellyfin/runtime/jellyfin';
const ACCOUNTING = [MEDIA_ROOT, 'H:/PTI-OnePiece/pilot/jellyfin', 'H:/PTI-OnePiece/runtime/media', 'H:/PTI-OnePiece/runtime/jellyfin'];
const EVIDENCE = new URL('../../../../docs/one-piece/evidence/representative-fragments/', import.meta.url);
const took = start => Math.round(performance.now() - start);
const say = value => process.stdout.write(JSON.stringify(value) + '\n');
const safeFailure = error => ({ name: /^[A-Za-z]{1,40}$/.test(error?.name ?? '') ? error.name : 'Error',
  code: /^[A-Z_a-z-]{1,80}$/.test(error?.code ?? '') ? error.code : 'BOUNDED_PROBE_FAILED' });
function diagnosticSummary(text) {
  return { bytes: Buffer.byteLength(text), prematureEnd: /ended prematurely|truncat|partial file|end of file/i.test(text),
    invalidData: /invalid data|error while decoding|corrupt/i.test(text), unknownCodec: /unknown codec|unsupported codec/i.test(text) };
}
function progress(text) {
  const values = Object.fromEntries(text.trim().split(/\r?\n/).filter(line => /^[a-z_]+=/.test(line)).map(line => {
    const at = line.indexOf('='); return [line.slice(0, at), line.slice(at + 1)];
  }));
  return { frames: /^\d+$/.test(values.frame ?? '') ? Number(values.frame) : null,
    decodedSeconds: /^\d+$/.test(values.out_time_us ?? '') ? Number(values.out_time_us) / 1e6 : null, completed: values.progress === 'end' };
}
async function usage() {
  const usedBytes = (await Promise.all(ACCOUNTING.map(scanFiles))).flat().reduce((sum, file) => sum + file.bytes, 0);
  const disk = await statfs(MEDIA_ROOT); return { usedBytes, limitBytes: CACHE_LIMIT_BYTES,
    freeBytes: Number(disk.bavail) * Number(disk.bsize), minimumFreeBytes: MINIMUM_FREE_BYTES };
}

async function main() {
  assert.equal(process.env.PTI_RUN_REPRESENTATIVE_FRAGMENTS, '1', 'Explicit bounded-fragment opt-in required');
  const runId = new Date().toISOString().replaceAll(/[:.]/g, '-') + '-' + randomUUID().slice(0, 8);
  const runRoot = path.resolve(MEDIA_ROOT, 'representative-probes/currentrun', runId);
  const ffmpegPath = path.resolve(BIN, 'ffmpeg.exe'), ffprobePath = path.resolve(BIN, 'ffprobe.exe');
  const report = { kind: 'bounded-original-fragment-track-codec-decode', runId, startedAt: new Date().toISOString(),
    requestedEpisodes: EPISODES, maximumOriginalFragmentBytes: PER_EPISODE, maximumTotalRequestedRangeBytes: TOTAL,
    upstreamConcurrency: 2, fragmentFormat: 'Original MKV head bytes; owned-tool marker extension is not a conversion',
    privateFragments: runRoot, fullOriginalIntegrityVerified: false, heardJapanese: false, renderedSubtitles: false,
    fullPlaybackVerified: false, fullSeekingVerified: false, preparationVerified: false, actualCast: false, episodes: [], tools: {}, errors: [] };
  await mkdir(EVIDENCE, { recursive: true });
  let checkpointTail = Promise.resolve();
  const checkpoint = () => { const bytes = JSON.stringify(report, null, 2) + '\n';
    checkpointTail = checkpointTail.then(() => writeFile(new URL(`representative-${runId}.json`, EVIDENCE), bytes)); return checkpointTail; };
  const catalog = JSON.parse(await readFile(new URL('../../../../docs/one-piece/evidence/sources/catalog.json', import.meta.url), 'utf8'));
  report.catalogSha256 = createHash('sha256').update(JSON.stringify(catalog)).digest('hex');
  report.preflight = await usage();
  assert.ok(report.preflight.usedBytes + TOTAL <= CACHE_LIMIT_BYTES, 'Fragment admission would exceed shared20GiB');
  assert.ok(report.preflight.freeBytes - TOTAL >= MINIMUM_FREE_BYTES, 'Fragment admission would cross disk floor');
  await new WindowsProtection().secureDirectory(runRoot); assert.equal(path.resolve(await realpath(runRoot)), runRoot);
  const registry = new PreparedToolRegistry({ workRoot: runRoot, ffmpegPath, ffprobePath });
  // Ledger is unique to this run; never invoke global or existing-engine recovery.
  const command = (tool, args, options = {}) => runPreparedCommand(tool, args, { registry, timeoutMs: 15000, maximumOutputBytes: 2 * MiB, ...options });
  for (const [name, file] of [['ffmpeg', ffmpegPath], ['ffprobe', ffprobePath]]) {
    // Version calls are read-only and have no staging input for an ownership marker.
    const version = await runPreparedCommand(file, ['-version'], { timeoutMs: 15000, maximumOutputBytes: MiB });
    report.tools[name] = { executable: path.basename(file), sha256: await hashFile(file, 'sha256'), version: version.output.split(/\r?\n/)[0] };
  }
  const transport = createArchiveTransport({ timeoutMs: 30000, maxAttempts: 3, fetchImpl: async (url, options) => {
    const response = await fetch(url, options);
    if (response.status === 206 && ![null, 'identity'].includes(response.headers.get('content-encoding'))) {
      await response.body?.cancel(); throw new Error('Encoded source fragment is not permitted');
    }
    return response;
  } });
  let requestedBytes = 0;
  async function fragment(number) {
    const candidate = lookupEpisode(catalog, number).candidates.find(value => value.role === 'original'); validateOriginal(candidate);
    const parsed = parseEpisodeFile(candidate.itemId, candidate.fileName); assert.equal(parsed.episodeNumber, number);
    assert.ok(candidate.bytes > PER_EPISODE, 'This probe must remain a partial original');
    const fragmentId = randomUUID(), file = path.join(runRoot, `${fragmentId}.video.part.mp4`);
    const row = { episode: number, candidateId: candidate.id, collection: candidate.itemId, fileName: candidate.fileName,
      parserReleaseGroup: parsed.releaseGroup, sourceBytes: candidate.bytes, listedOriginalMd5: candidate.checksums.md5,
      fragmentId, requestedBytes: 0, receivedBytes: 0, ranges: [], privateFile: path.basename(file), partialOriginal: true };
    report.episodes.push(row); const began = performance.now(), handle = await open(file, 'wx'), digest = createHash('sha256');
    try {
      for (let start = 0; start < PER_EPISODE; start += RANGE_MAX_BYTES) {
        const length = Math.min(RANGE_MAX_BYTES, PER_EPISODE - start); requestedBytes += length; row.requestedBytes += length;
        assert.ok(requestedBytes <= TOTAL);
        const response = await transport.range(candidate.itemId, candidate.fileName, { start, length, expectedTotal: candidate.bytes });
        assert.equal(response.status, 206); assert.equal(response.bytesRead, length); assert.equal(Number(response.headers['content-length']), length);
        digest.update(response.bytes); await handle.writeFile(response.bytes); row.receivedBytes += response.bytesRead;
        const { bytes: omitted, ...evidence } = response; row.ranges.push(evidence);
        say({ phase: 'bounded-source-range', episode: number, bytes: row.receivedBytes, maximumBytes: PER_EPISODE, elapsedMs: took(began) });
      }
      await handle.sync(); row.fragmentSha256 = digest.digest('hex'); row.downloadMs = took(began); row.completeHeadFragment = row.receivedBytes === PER_EPISODE;
    } catch (error) { row.downloadError = safeFailure(error); row.retryHistory = error.history ?? []; }
    finally { await handle.close(); }
    row.accountingAfterFragment = await usage(); assert.ok(row.accountingAfterFragment.usedBytes <= CACHE_LIMIT_BYTES);
    await checkpoint(); return row;
  }
  // Two source operations at once; no tools run until all bounded network reads end.
  const queue = [...EPISODES]; await Promise.all([0, 1].map(async () => { while (queue.length) await fragment(queue.shift()); }));
  report.requestedRangeBytes = requestedBytes; report.receivedFragmentBytes = report.episodes.reduce((sum, row) => sum + row.receivedBytes, 0);
  for (const row of report.episodes.sort((a, b) => a.episode - b.episode)) {
    if (!row.completeHeadFragment) continue;
    const file = path.join(runRoot, row.privateFile), began = performance.now();
    try {
      const probe = await command(ffprobePath, ['-v', 'warning', '-probesize', String(PER_EPISODE), '-analyzeduration', '10000000',
        '-show_entries', 'format=format_name,duration:stream=index,codec_type,codec_name,profile,pix_fmt,width,height,level,channels,sample_rate:stream_tags=language,title:stream_disposition=default,forced', '-of', 'json', file]);
      const metadata = JSON.parse(probe.output); row.probe = { elapsedMs: took(began), exitCode: probe.code, ...metadata, diagnostic: diagnosticSummary(probe.diagnostic),
        durationMeaning: 'Declared original-container duration; this head fragment does not verify the whole timeline' };
      const streams = metadata.streams.map(stream => ({ Type: { video: 'Video', audio: 'Audio', subtitle: 'Subtitle' }[stream.codec_type],
        Index: stream.index, Codec: stream.codec_name, Channels: stream.channels, Language: stream.tags?.language, Title: stream.tags?.title,
        IsForced: stream.disposition?.forced === 1 }));
      const selected = selectTracks(streams); row.selected = { ...selected, indices: 'ffprobe native original stream indices; no derived/Jellyfin index claim' };
      const video = metadata.streams.find(stream => stream.codec_type === 'video'); assert.ok(video);
      const decodeBegan = performance.now(), decoded = await command(ffmpegPath, ['-hide_banner', '-v', 'warning', '-hwaccel', 'none', '-threads', '1', '-i', file,
        '-t', '0.5', '-map', `0:${video.index}`, '-map', `0:${selected.audioIndex}`, '-sn', '-dn', '-threads', '1', '-progress', 'pipe:1', '-nostats', '-f', 'null', '-']);
      row.shortSoftwareDecode = { elapsedMs: took(decodeBegan), exitCode: decoded.code, requestedSeconds: .5,
        ...progress(decoded.output), diagnostic: diagnosticSummary(decoded.diagnostic), audioStreamIndex: selected.audioIndex, heard: false, displayed: false };
      const captionBegan = performance.now(), caption = await command(ffmpegPath, ['-hide_banner', '-v', 'warning', '-threads', '1', '-i', file,
        '-map', `0:${selected.subtitleIndex}`, '-t', '60', '-f', 'webvtt', '-']);
      row.englishCaptionFragment = { elapsedMs: took(captionBegan), exitCode: caption.code, bytes: Buffer.byteLength(caption.output),
        cues: (caption.output.match(/-->/g) ?? []).length, sha256: createHash('sha256').update(caption.output).digest('hex'),
        diagnostic: diagnosticSummary(caption.diagnostic), rendered: false, spokenDialogueVerified: false };
    } catch (error) { row.inspectionError = safeFailure(error); }
    say({ phase: 'bounded-local-inspection', episode: row.episode, selected: row.selected ?? null,
      decoded: row.shortSoftwareDecode ?? null, subtitleCues: row.englishCaptionFragment?.cues ?? null, error: row.inspectionError ?? null });
    await checkpoint();
  }
  report.finalUsage = await usage(); report.completedAt = new Date().toISOString();
  report.noFullOriginalDownloads = report.episodes.every(row => row.receivedBytes <= PER_EPISODE && row.receivedBytes < row.sourceBytes);
  report.allBoundedInspectionsCompleted = report.episodes.length === EPISODES.length && report.episodes.every(row => row.completeHeadFragment && row.probe && row.shortSoftwareDecode?.frames > 0 && row.englishCaptionFragment?.cues > 0);
  await checkpoint(); say({ phase: 'complete', evidence: fileURLToPath(new URL(`representative-${runId}.json`, EVIDENCE)),
    requestedBytes, receivedBytes: report.receivedFragmentBytes, allBoundedInspectionsCompleted: report.allBoundedInspectionsCompleted });
}

if (process.env.PTI_RUN_REPRESENTATIVE_FRAGMENTS === '1') main().catch(error => { process.stderr.write(JSON.stringify(safeFailure(error)) + '\n'); process.exitCode = 1; });
