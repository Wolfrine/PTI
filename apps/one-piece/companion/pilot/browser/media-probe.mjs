/* Technical pilot only. Remote input stays seekable and bounded; no whole-file buffer. */
export async function readBoundedRange(url, start, end, size) {
  const response = await fetch(url, {headers: {Range: `bytes=${start}-${end}`}, signal: AbortSignal.timeout(20000)});
  if (response.status !== 206) {await response.body?.cancel(); throw new Error(`Range request returned ${response.status}; refusing full-file response`);}
  const expected = end - start + 1;
  const contentRange = response.headers.get('Content-Range');
  const contentLength = response.headers.get('Content-Length');
  if (contentRange !== `bytes ${start}-${end}/${size}` || (contentLength !== null && Number(contentLength) !== expected)) {
    await response.body?.cancel();
    throw new Error('Mismatched Content-Range or Content-Length; refusing unbounded input');
  }
  if (!response.body) throw new Error('Range response had no readable body');
  const reader = response.body.getReader();
  const data = new Uint8Array(expected);
  let received = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      if (received + value.length > expected) throw new Error('Range response exceeded its byte bound');
      data.set(value, received); received += value.length;
    }
    if (received !== expected) throw new Error('Truncated range response');
  } catch (error) {await reader.cancel().catch(() => {}); throw error;}
  finally {reader.releaseLock();}
  return data;
}

export async function openRemote({LibAV, url, size, log = () => {}, byteLimit = 24 * 1024 * 1024}) {
  const start = performance.now();
  const libav = await LibAV.LibAV({noworker: true});
  const metrics = {bytes: 0, requests: [], startedAt: new Date().toISOString()};
  const cache = new Map();
  let failure;
  libav.onblockread = (name, pos, length) => {
    (async () => {
      const blockStart = Math.floor(pos / 1048576) * 1048576;
      let data = cache.get(blockStart);
      if (!data) {
        const end = Math.min(size - 1, blockStart + 1048575);
        if (metrics.bytes + end - blockStart + 1 > byteLimit) throw new Error('Per-run byte budget reached');
        const at = performance.now();
        data = await readBoundedRange(url, blockStart, end, size);
        metrics.bytes += data.length;
        metrics.requests.push({start: blockStart, bytes: data.length, ms: Math.round(performance.now() - at)});
        cache.set(blockStart, data);
        if (cache.size > 8) cache.delete(cache.keys().next().value);
      }
      const offset = pos - blockStart;
      await libav.ff_block_reader_dev_send(name, pos, data.subarray(offset, Math.min(data.length, offset + length)));
    })().catch(async error => {
      failure = error;
      await libav.ff_block_reader_dev_send(name, pos, null, {errorCode: 5});
    });
  };
  await libav.mkblockreaderdev('original.mkv', size);
  let context, streams;
  try {[context, streams] = await libav.ff_init_demuxer_file('original.mkv');}
  catch (error) {libav.terminate(); throw failure || error;}
  if (failure) throw failure;
  for (const stream of streams) {
    stream.codecName = await libav.avcodec_get_name(stream.codec_id);
    const extra = await libav.AVCodecParameters_extradata(stream.codecpar);
    const extraSize = await libav.AVCodecParameters_extradata_size(stream.codecpar);
    stream.extra = extraSize ? await libav.copyout_u8(extra, extraSize) : new Uint8Array();
  }
  metrics.probeMs = Math.round(performance.now() - start);
  const video = streams.find(s => s.codec_type === 0);
  const audio = streams.find(s => s.codec_type === 1 && /^(jpn|ja|japanese)$/i.test(s.metadata?.language || ''));
  const english = streams.filter(s => s.codec_type === 3 && /^(eng|en|english)$/i.test(s.metadata?.language || ''));
  const subtitle = english.find(s => !/sign|song|forced/i.test(s.metadata?.title || '')) || null;
  log('probe', {ms: metrics.probeMs, bytes: metrics.bytes, streams: streams.map(({extra, ...s}) => s), selected: {video: video?.index, japanese: audio?.index, fullEnglish: subtitle?.index}});
  return {libav, context, streams, video, audio, subtitle, metrics, getFailure: () => failure};
}

export function packetSeconds(packet, stream) {
  return ((packet.pts || 0) + (packet.ptshi || 0) * 4294967296) * stream.time_base_num / stream.time_base_den;
}

function assTime(seconds) {
  seconds = Math.max(0, seconds);
  const centis = Math.round(seconds * 100);
  return `${Math.floor(centis / 360000)}:${String(Math.floor(centis / 6000) % 60).padStart(2, '0')}:${String(Math.floor(centis / 100) % 60).padStart(2, '0')}.${String(centis % 100).padStart(2, '0')}`;
}

export async function extractSubtitleWindow(remote, {start = 0, seconds = 25, eventLimit = 3, log = () => {}} = {}) {
  const {libav, context, subtitle, video} = remote;
  if (!subtitle) throw new Error('Full English subtitle track not identified');
  const begin = performance.now(), before = remote.metrics.bytes;
  if (start) {
    const ts = Math.round(start * video.time_base_den / video.time_base_num);
    const seek = await libav.av_seek_frame(context, video.index, ts >>> 0, Math.floor(ts / 4294967296), 1);
    if (seek < 0) throw new Error(`Subtitle indexed seek failed (${seek})`);
  }
  const packet = await libav.av_packet_alloc();
  let ass = new TextDecoder().decode(subtitle.extra), count = 0, lastVideoTime = start;
  if (!ass.includes('[Events]')) ass += '\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  let firstSubtitleTime;
  for (let batch = 0; batch < 80; batch++) {
    const [code, grouped] = await libav.ff_read_frame_multi(context, packet, {limit: 96 * 1024, unify: true});
    const packets = grouped[0] || [];
    for (const p of packets) {
      if (p.stream_index === video.index) lastVideoTime = packetSeconds(p, video);
      if (p.stream_index !== subtitle.index) continue;
      const time = packetSeconds(p, subtitle);
      const duration = ((p.duration || 0) + (p.durationhi || 0) * 4294967296) * subtitle.time_base_num / subtitle.time_base_den;
      const fields = new TextDecoder().decode(p.data).split(',');
      if (fields.length < 9) continue;
      ass += `Dialogue: ${fields[1]},${assTime(time)},${assTime(time + duration)},${fields.slice(2).join(',')}\n`;
      firstSubtitleTime ??= time; count++;
    }
    if (remote.getFailure()) throw remote.getFailure();
    if (count >= eventLimit || lastVideoTime >= start + seconds || code === libav.AVERROR_EOF || !packets.length) break;
  }
  await libav.av_packet_free_js(packet);
  const metrics = {start, lastVideoTime, firstSubtitleTime, subtitleEvents: count, ms: Math.round(performance.now() - begin), inputBytes: remote.metrics.bytes - before};
  log('subtitle-window', metrics);
  return {ass, metrics};
}

export async function remuxWindow(remote, {start = 0, seconds = 22, log = () => {}} = {}) {
  const {libav, context, video, audio, subtitle, metrics} = remote;
  if (!video || !audio || !subtitle) throw new Error('Required video, Japanese audio, or full English subtitle track missing');
  const begin = performance.now();
  const before = metrics.bytes;
  if (start) {
    const ts = Math.round(start * video.time_base_den / video.time_base_num);
    const seek = await libav.av_seek_frame(context, video.index, ts >>> 0, Math.floor(ts / 4294967296), 1);
    log('seek-result', {seconds: start, result: seek});
    if (seek < 0) throw new Error(`Demux seek failed (${seek})`);
  }
  const packet = await libav.av_packet_alloc();
  const chunks = [];
  let outputBytes = 0;
  libav.onwrite = (_name, position, bytes) => {
    chunks.push({position, data: bytes.slice()});
    outputBytes = Math.max(outputBytes, position + bytes.length);
  };
  await libav.mkstreamwriterdev('window.mp4');
  const [mux, , io, outStreams] = await libav.ff_init_muxer({format_name: 'mp4', filename: 'window.mp4', open: true, codecpars: true}, [video, audio].map(s => [s.codecpar, s.time_base_num, s.time_base_den]));
  const dict = await libav.malloc(4);
  const options = await libav.av_dict_set_js(0, 'movflags', 'frag_keyframe+empty_moov+default_base_moof', 0);
  await libav.copyin_s32(dict, new Int32Array([options]));
  const header = await libav.avformat_write_header(mux, dict);
  await libav.free(dict);
  if (header < 0) throw new Error(`MP4 header failed (${header})`);
  let lastTime = 0;
  let firstTime = null;
  let subtitleEvents = 0;
  let ass = new TextDecoder().decode(subtitle.extra);
  if (!ass.includes('[Events]')) ass += '\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n';
  for (let batch = 0; batch < 120; batch++) {
    const [code, grouped] = await libav.ff_read_frame_multi(context, packet, {limit: 192 * 1024, unify: true});
    const packets = grouped[0] || [];
    const outgoing = [];
    for (const p of packets) {
      const stream = remote.streams.find(s => s.index === p.stream_index);
      const time = packetSeconds(p, stream);
      if (p.stream_index === video.index) {
        firstTime ??= time;
        lastTime = time;
      }
      if (p.stream_index === subtitle.index) {
        const fields = new TextDecoder().decode(p.data).split(',');
        const duration = ((p.duration || 0) + (p.durationhi || 0) * 4294967296) * stream.time_base_num / stream.time_base_den;
        if (fields.length >= 9) {
          ass += `Dialogue: ${fields[1]},${assTime(time)},${assTime(time + duration)},${fields.slice(2).join(',')}\n`;
          subtitleEvents++;
        }
      }
      if (p.stream_index === video.index || p.stream_index === audio.index) {
        const sourceIndex = p.stream_index === video.index ? 0 : 1;
        // ff_write_multi rescales from packet.time_base; preserve signed AV_NOPTS_VALUE.
        p.stream_index = sourceIndex;
        outgoing.push(p);
      }
    }
    if (outgoing.length) await libav.ff_write_multi(mux, packet, outgoing);
    if (remote.getFailure()) throw remote.getFailure();
    if (lastTime >= start + seconds || code === libav.AVERROR_EOF || !packets.length) break;
  }
  await libav.av_write_trailer(mux);
  await libav.ff_free_muxer(mux, io);
  await libav.unlink('window.mp4');
  await libav.av_packet_free_js(packet);
  const output = new Uint8Array(outputBytes);
  for (const chunk of chunks) output.set(chunk.data, chunk.position);
  const result = {start, firstTime, lastTime, seconds, subtitleEvents, outputBytes, ms: Math.round(performance.now() - begin), inputBytes: metrics.bytes - before};
  log('remux-window', result);
  return {mp4: output, ass, metrics: result};
}
