import path from 'node:path';
import { lstat, realpath } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { MediaError } from './errors.mjs';

const MAX_SECONDS = 4 * 3600;
function durationTag(value) {
  const match = /^(\d{1,2}):(\d{2}):(\d{2}(?:\.\d{1,9})?)$/.exec(value ?? '');
  if (!match || Number(match[2]) > 59 || Number(match[3]) >= 60) return null;
  const seconds = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  return seconds > 0 && seconds <= MAX_SECONDS ? seconds : null;
}

function streamEnd(stream) {
  const tagged = durationTag(stream?.tags?.DURATION ?? stream?.tags?.duration
    ?? Object.entries(stream?.tags ?? {}).find(([name]) => /^duration-[a-z]{2,3}$/i.test(name))?.[1]);
  const duration = Number(stream?.duration), start = Number(stream?.start_time ?? 0);
  if (!Number.isFinite(start) || Math.abs(start) > MAX_SECONDS) return null;
  const end = tagged ?? (Number.isFinite(duration) && duration > 0 && duration <= MAX_SECONDS ? duration + start : null);
  return Number.isFinite(end) && end > Math.max(0, start) && end <= MAX_SECONDS ? end : null;
}

export function inspectSelectedTiming(metadata, packetsByIndex, { videoIndex, audioIndex }) {
  const tracks = [videoIndex, audioIndex].map((index, position) => {
    const type = position === 0 ? 'video' : 'audio';
    const stream = metadata.streams?.find(stream => stream.index === index && stream.codec_type === type);
    if (!stream) throw new MediaError('TIMING_UNVERIFIED', 'The selected presentation tracks could not be inspected', { status: 422 });
    const declaredEndSeconds = streamEnd(stream);
    if (!declaredEndSeconds) throw new MediaError('TIMING_UNVERIFIED', 'The selected track end could not be verified without a full scan', { status: 422 });
    const packets = packetsByIndex.get(index)?.packets ?? [];
    if (!Array.isArray(packets) || packets.length > 8192)
      throw new MediaError('TIMING_UNVERIFIED', 'The bounded selected-track packet response is invalid', { status: 422 });
    const ends = packets.filter(packet => packet.stream_index === index).map(packet => Number(packet.pts_time) + Number(packet.duration_time ?? 0)).filter(Number.isFinite);
    const endSeconds = Math.max(...ends);
    if (!Number.isFinite(endSeconds) || endSeconds <= 0 || endSeconds > MAX_SECONDS || Math.abs(endSeconds - declaredEndSeconds) > .25)
      throw new MediaError('TIMING_UNVERIFIED', 'Selected-track end metadata did not match its bounded tail check', { status: 422 });
    return { index, type, endSeconds, declaredEndSeconds };
  });
  const effectiveDurationSeconds = Math.round(Math.max(...tracks.map(track => track.endSeconds)) * 1000) / 1000;
  return { effectiveDurationSeconds, containerDurationSeconds: Number(metadata.format?.duration), tracks,
    source: 'bounded-cached-ffprobe' };
}

/** Only the pinned bundled ffprobe, a managed regular original, metadata and <=8s per selected track.
 * No URL input, shell, packet payload, network read or complete-source scan is permitted.
 */
export function createTimingInspector({ ffprobePath, originalRoot, run = probeJson } = {}) {
  if (!ffprobePath || !path.isAbsolute(ffprobePath) || !/^ffprobe(?:\.exe)?$/i.test(path.basename(ffprobePath))) throw new Error('Pinned ffprobe executable path is required');
  const root = path.resolve(originalRoot), inspected = new Map();
  return async (file, { videoIndex, audioIndex, signal } = {}) => {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(root + path.sep)) throw new MediaError('ENGINE_PATH', 'Timing inspection requires a managed original');
    const stats = await lstat(resolved);
    if (!stats.isFile() || stats.isSymbolicLink() || path.resolve(await realpath(resolved)) !== resolved)
      throw new MediaError('CACHE_LINK', 'Timing inspection requires a regular managed original');
    for (const index of [videoIndex, audioIndex]) if (!Number.isInteger(index) || index < 0 || index > 128) throw new MediaError('TIMING_UNVERIFIED', 'Selected track index is invalid', { status: 422 });
    const key = `${resolved}|${stats.size}|${stats.mtimeMs}|${videoIndex}|${audioIndex}`;
    if (inspected.has(key)) return inspected.get(key);
    const promise = (async () => {
      const metadata = await run(ffprobePath, ['-v', 'error', '-show_entries',
        'format=duration:stream=index,codec_type,start_time,duration:stream_tags', '-of', 'json', resolved], { signal });
      const packets = await Promise.all([videoIndex, audioIndex].map(async index => {
        const stream = metadata.streams?.find(stream => stream.index === index);
        const end = streamEnd(stream);
        if (!end) throw new MediaError('TIMING_UNVERIFIED', 'The selected track end requires unsupported full-source probing', { status: 422 });
        const interval = `${Math.max(0, end - 4).toFixed(3)}%+8`;
        const data = await run(ffprobePath, ['-v', 'error', '-select_streams', String(index), '-read_intervals', interval,
          '-show_packets', '-show_entries', 'packet=stream_index,pts_time,duration_time', '-of', 'json', resolved], { signal });
        return [index, data];
      }));
      return inspectSelectedTiming(metadata, new Map(packets), { videoIndex, audioIndex });
    })();
    inspected.set(key, promise);
    if (inspected.size > 24) inspected.delete(inspected.keys().next().value);
    try { return await promise; } catch (error) { inspected.delete(key); throw error; }
  };
}

function probeJson(executable, args, { signal } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    const finishError = () => new MediaError('TIMING_UNVERIFIED', 'Bounded cached-track inspection failed; retry preparation', { status: 503, retryable: true });
    try { child = spawn(executable, args, { windowsHide: true, shell: false, signal, stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch { reject(finishError()); return; }
    let bytes = 0, output = '', settled = false;
    const finish = (error, value) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(value); };
    const timer = setTimeout(() => { child.kill(); finish(finishError()); }, 15000);
    child.stdout.on('data', chunk => {
      bytes += chunk.length;
      if (bytes > 2 * 1024 ** 2) { child.kill(); finish(finishError()); }
      else output += chunk;
    });
    child.stderr.on('data', chunk => { bytes += chunk.length; if (bytes > 2 * 1024 ** 2) { child.kill(); finish(finishError()); } });
    child.on('error', () => finish(finishError()));
    child.on('close', code => {
      if (code !== 0) { finish(finishError()); return; }
      try { finish(null, JSON.parse(output)); } catch { finish(finishError()); }
    });
  });
}
