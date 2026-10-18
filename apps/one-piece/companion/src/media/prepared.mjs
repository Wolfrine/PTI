import path from 'node:path';
import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { lstat, open, rename, writeFile, realpath } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawn } from 'node:child_process';
import { MediaError, abortReason, safeProgress } from './errors.mjs';

export const PREPARED_RECIPE_VERSION = 'jellyfin-12.2-ffmpeg-8.1.3-mp4-v1';
const fail = message => new MediaError('PREPARED_INVALID', message, { status: 503, retryable: true });
const digest = value => createHash('sha256').update(value).digest('hex');
export function canonicalCaptionHash(bytes) {
  const text = Buffer.from(bytes).toString('utf8').replace(/^\uFEFF/, '').replaceAll('\r\n', '\n');
  if (!text.startsWith('WEBVTT') || Buffer.byteLength(text) > 16 * 1024 ** 2) throw fail('Invalid full-English WebVTT');
  const cues = [];
  for (const block of text.split(/\n\s*\n/)) {
    const lines = block.split('\n'), at = lines.findIndex(line => line.includes('-->')); if (at < 0) continue;
    const match = /^(\d\d:\d\d:\d\d\.\d{3})\s+-->\s+(\d\d:\d\d:\d\d\.\d{3})(?:\s.*)?$/.exec(lines[at]);
    // Archive1000 contains two genuine blank outro cues. Preserve their exact
    // timing/empty payload in lineage rather than rejecting the whole track.
    if (!match) throw fail('Invalid English dialogue cue');
    cues.push([match[1], match[2], lines.slice(at + 1).join('\n')]);
  }
  if (!cues.length || cues.length > 20000 || !cues.some(cue => cue[2].trim())) throw fail('Full-English WebVTT contains no bounded dialogue');
  return { version: 'vtt-dialogue-and-millisecond-timing-v1', sha256: digest(JSON.stringify(cues)), cues: cues.length };
}

export function validateRenditionRecipe(recipe) {
  if (!recipe || recipe.version !== PREPARED_RECIPE_VERSION || !/^archive-[a-f0-9]{20}$/.test(recipe.original?.id ?? '')
    || !/^[a-f0-9]{32}$/.test(recipe.original?.md5 ?? '') || !Number.isSafeInteger(recipe.original?.bytes) || recipe.original.bytes <= 0
    || !Number.isFinite(recipe.durationSeconds) || recipe.durationSeconds <= 0 || recipe.durationSeconds > 14400
    || !['copy-compatible-h264', 'convert-h264-8bit'].includes(recipe.videoPolicy) || recipe.maxBitrate !== 10000000
    || recipe.audio?.outputCodec !== 'aac' || !Number.isInteger(recipe.audio.index) || recipe.audio.index < 0 || recipe.audio.index > 128
    || !/^[a-z]{2,3}$/.test(recipe.audio.language ?? '') || !Number.isInteger(recipe.subtitle?.index) || recipe.subtitle.index < 0 || recipe.subtitle.index > 128
    || !['eng', 'en'].includes(recipe.subtitle.language) || !/^[a-f0-9]{64}$/.test(recipe.subtitle.fingerprint ?? '')) throw fail('Invalid prepared presentation recipe');
  // The recipe is a closed local identity, never a URL/path/engine credential container.
  const serialized = JSON.stringify(recipe);
  if (serialized.length > 8192 || /https?:\/\/|[A-Za-z]:[\\/]|api[_-]?key|access_token/i.test(serialized)) throw fail('Prepared recipe contains an external identity');
  return recipe;
}
export function renditionId(recipe) { validateRenditionRecipe(recipe); return digest(JSON.stringify(recipe)); }

export function preparedRecipe({ candidate, source, selected, timing }) {
  const video = source.MediaStreams.find(stream => stream.Type === 'Video'), audio = source.MediaStreams.find(stream => stream.Index === selected.audioIndex),
    subtitle = source.MediaStreams.find(stream => stream.Index === selected.subtitleIndex);
  if (!video || !audio || !subtitle || !timing?.effectiveDurationSeconds) throw fail('Prepared presentation lacks inspected tracks or timing');
  const copy = video.Codec === 'h264' && video.BitDepth === 8 && ['high', 'main', 'baseline', 'constrained baseline'].includes(video.Profile?.toLowerCase())
    && video.Width > 0 && video.Width <= 1920 && video.Height > 0 && video.Height <= 1080 && Number(video.Level) > 0 && Number(video.Level) <= 41;
  return validateRenditionRecipe({ version: PREPARED_RECIPE_VERSION,
    original: { id: candidate.id, md5: candidate.checksums.md5.toLowerCase(), bytes: candidate.bytes },
    durationSeconds: timing.effectiveDurationSeconds, videoPolicy: copy ? 'copy-compatible-h264' : 'convert-h264-8bit', maxBitrate: 10000000,
    video: { index: video.Index, codec: video.Codec, bitDepth: video.BitDepth ?? null, profile: video.Profile ?? null,
      width: video.Width ?? null, height: video.Height ?? null, level: video.Level ?? null },
    audio: { index: selected.audioIndex, language: selected.audioLanguage.toLowerCase(), inputCodec: audio.Codec,
      channels: audio.Channels ?? null, outputCodec: 'aac', allowCopy: audio.Codec === 'aac' && audio.Channels <= 2 },
    subtitle: { index: selected.subtitleIndex, language: selected.subtitleLanguage.toLowerCase(),
      fingerprint: digest(JSON.stringify({ index: subtitle.Index, codec: subtitle.Codec, language: subtitle.Language, title: subtitle.Title ?? '' })) } });
}

/** Bounded owned child; abort/deadline waits for termination before releasing output reservations. */
export async function runPreparedCommand(executable, args, { signal, timeoutMs = 15000, maximumOutputBytes = 4 * 1024 ** 2, registry } = {}) {
  const intent = registry ? await registry.begin(executable, args) : null;
  try { return await new Promise((resolve, reject) => {
    abortReason(signal); let child, output = '', diagnostic = '', bytes = 0, failure, settled = false;
    let registered;
    const finish = async (error, result) => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      try { await registered; error ? reject(error) : resolve(result); } catch { reject(fail('Owned media tool registration failed')); } };
    try { child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { reject(fail('Pinned media tool could not start')); return; }
    // A failed kill can emit 'error' while the owned process is still writing.
    // Keep its promise, reservation and durable identity until actual close.
    const stop = () => { try { child.kill(); } catch { failure ??= fail('Owned media tool termination was not confirmed'); } };
    const abort = () => { failure ??= signal.reason ?? fail('Prepared media cancelled'); stop(); };
    const timer = setTimeout(() => { failure ??= fail('Prepared media tool deadline exceeded'); stop(); }, timeoutMs);
    if (registry) {
      registered = registry.started(intent, child.pid).catch(error => { failure ??= error; stop(); throw error; });
      // Registration can fail before the process closes. Keep its rejection handled
      // immediately; finish still awaits it before releasing the durable intent.
      void registered.catch(() => {});
    }
    signal?.addEventListener('abort', abort, { once: true });
    const consume = (part, stderr) => { bytes += part.length; if (bytes > maximumOutputBytes) { failure ??= fail('Prepared media tool output exceeded its bound'); stop(); }
      else if (stderr) diagnostic += part; else output += part; };
    child.stdout.on('data', part => consume(part, false)); child.stderr.on('data', part => consume(part, true));
    child.on('error', () => {
      failure ??= fail('Pinned media tool failed');
      // Missing PID proves spawn never succeeded. Post-spawn errors alone do
      // not prove exit, so they must not clear the durable recovery intent.
      if (!Number.isSafeInteger(child.pid) || child.pid < 1) finish(failure);
    });
    child.on('close', code => finish(failure ?? (code !== 0 ? fail('Prepared media tool failed validation') : null), { code, output, diagnostic }));
    if (signal?.aborted) abort();
  }); } finally { await registry?.complete(intent); }
}

export async function inspectMp4Atoms(file) {
  const handle = await open(file, 'r'), size = (await handle.stat()).size; let offset = 0, count = 0, moov = -1, mdat = -1, fragmented = false;
  try { while (offset + 8 <= size) {
    if (++count > 10000) throw fail('Prepared MP4 box count exceeded its bound');
    const buffer = Buffer.alloc(16); await handle.read(buffer, 0, Math.min(16, size - offset), offset);
    let bytes = buffer.readUInt32BE(0); const type = buffer.toString('ascii', 4, 8);
    if (bytes === 1) bytes = Number(buffer.readBigUInt64BE(8)); else if (bytes === 0) bytes = size - offset;
    if (!Number.isSafeInteger(bytes) || bytes < 8 || offset + bytes > size) throw fail('Prepared MP4 has an incomplete box');
    if (type === 'moov') moov = offset; if (type === 'mdat' && mdat < 0) mdat = offset; if (type === 'moof') fragmented = true; offset += bytes;
  } } finally { await handle.close(); }
  if (offset !== size || moov < 0 || mdat < 0) throw fail('Prepared MP4 is incomplete');
  return { bytes: size, fragmented, frontIndex: moov < mdat };
}

export function validatePreparedMetadata(metadata, recipe) {
  const video = metadata.streams?.filter(stream => stream.codec_type === 'video'), audio = metadata.streams?.filter(stream => stream.codec_type === 'audio');
  const duration = Number(metadata.format?.duration), starts = metadata.streams?.map(stream => Number(stream.start_time ?? 0)) ?? [];
  const languages = ['ja', 'jpn'].includes(recipe.audio.language) ? ['ja', 'jpn'] : ['en', 'eng'].includes(recipe.audio.language) ? ['en', 'eng'] : [recipe.audio.language];
  if (video?.length !== 1 || audio?.length !== 1 || metadata.streams.length !== 2 || video[0].codec_name !== 'h264' || video[0].pix_fmt !== 'yuv420p'
    || !Number.isInteger(video[0].width) || video[0].width <= 0 || video[0].width > 1920 || !Number.isInteger(video[0].height) || video[0].height <= 0 || video[0].height > 1080
    || !Number.isInteger(video[0].level) || video[0].level < 1 || video[0].level > 41
    || audio[0].codec_name !== 'aac' || !Number.isInteger(audio[0].channels) || audio[0].channels < 1 || audio[0].channels > 2
    || !languages.includes(audio[0].tags?.language?.toLowerCase()) || !Number.isFinite(duration) || Math.abs(duration - recipe.durationSeconds) > .25
    || starts.some(start => !Number.isFinite(start) || Math.abs(start) > .25)) throw fail('Prepared tracks, timestamps or selected duration did not pass validation');
  return metadata;
}

export async function finalizePreparedFiles({ response, captions, paths, recipe, maximumOutputBytes, ffmpegPath, ffprobePath, signal,
  checkStorage, onProgress, run = runPreparedCommand, registry }) {
  const ownedRun = (executable, args, options = {}) => run(executable, args, { ...options, registry });
  for (const [file, name] of [[ffmpegPath, 'ffmpeg'], [ffprobePath, 'ffprobe']]) if (!file || !path.isAbsolute(file) || !new RegExp(`^${name}(?:\\.exe)?$`, 'i').test(path.basename(file))) throw fail('Pinned media tool path is required');
  if (!(captions instanceof Uint8Array) || captions.byteLength > 16 * 1024 ** 2 || !Buffer.from(captions).toString('utf8').startsWith('WEBVTT')
    || !Buffer.from(captions).includes('-->')) throw fail('Original full-English captions are incomplete');
  if (response.status !== 200 || !/video\/mp4/i.test(response.headers.get('content-type') ?? '') || !response.body) throw fail('Private progressive MP4 preparation failed');
  const began = performance.now(); let bytes = 0, checked = 0;
  await pipeline(Readable.fromWeb(response.body), async function* (source) {
    for await (const part of source) { abortReason(signal); bytes += part.length; if (bytes > maximumOutputBytes) throw fail('Prepared media exceeded its admitted output size');
      if (bytes - checked >= 32 * 1024 ** 2) { checked = bytes; await checkStorage(); safeProgress(onProgress, { state: 'preparing-video', receivedBytes: bytes, totalBytes: maximumOutputBytes }); } yield part; }
  }, createWriteStream(paths.raw, { flags: 'wx' }), { signal });
  const raw = await inspectMp4Atoms(paths.raw); let finalized = false;
  if (raw.fragmented || !raw.frontIndex) {
    await ownedRun(ffmpegPath, ['-v', 'warning', '-i', paths.raw, '-map', '0:v:0', '-map', '0:a:0', '-c', 'copy', '-map_metadata', '-1',
      '-metadata:s:a:0', `language=${recipe.audio.language}`, '-movflags', '+faststart', '-f', 'mp4', '-n', paths.video], { signal, timeoutMs: 120000 }); finalized = true;
  } else await rename(paths.raw, paths.video);
  await checkStorage(); const atoms = await inspectMp4Atoms(paths.video); if (atoms.fragmented || !atoms.frontIndex) throw fail('Prepared MP4 lacks its complete front seek index');
  const probe = await ownedRun(ffprobePath, ['-v', 'error', '-show_entries',
    'format=duration,size,start_time:stream=index,codec_type,codec_name,profile,pix_fmt,level,width,height,channels,sample_rate,start_time,duration:stream_tags=language', '-of', 'json', paths.video], { signal });
  let metadata; try { metadata = validatePreparedMetadata(JSON.parse(probe.output), recipe); } catch { throw fail('Complete prepared presentation could not be verified'); }
  for (const position of [0, recipe.durationSeconds / 2, Math.max(0, recipe.durationSeconds - 2)]) await ownedRun(ffmpegPath,
    ['-v', 'error', '-ss', String(position), '-i', paths.video, '-t', '0.25', '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', '-'], { signal, timeoutMs: 15000 });
  await writeFile(paths.captions, captions, { flag: 'wx' });
  return { metadata, metrics: { preparedMs: Math.round(performance.now() - began), progressiveBytes: bytes, faststartCopy: finalized,
    completeHeaderAndDuration: true, decodedStartMiddleEnd: true, privateEngineExitCodeExposedByHttp: false } };
}

export async function managedRegularFile(file, root) {
  const resolved = path.resolve(file), managed = path.resolve(root);
  if (!resolved.startsWith(managed + path.sep)) throw fail('Prepared file escaped its managed root');
  const stats = await lstat(resolved);
  if (!stats.isFile() || stats.isSymbolicLink() || path.resolve(await realpath(resolved)) !== resolved) throw fail('Prepared media must be a regular managed file');
  return stats;
}
