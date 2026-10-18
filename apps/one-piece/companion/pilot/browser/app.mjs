import LibAV from '/vendor/libav-6.10.9.0-webcodecs.mjs';
import JASSUB from '/vendor/jassub.js';
import {openRemote, remuxWindow, extractSubtitleWindow} from './media-probe.mjs';
const $ = selector => document.querySelector(selector);
const video = $('#video');
const samples = await (await fetch('/samples')).json();
let events = [], started = performance.now(), remote, renderer, blobUrl, latestMode, generation = 0;
const rendererOptions = {workerUrl: '/vendor/jassub-worker.js', wasmUrl: '/vendor/jassub-worker.wasm', modernWasmUrl: '/vendor/jassub-worker-modern.wasm', availableFonts: {'liberation sans': '/vendor/default.woff2'}, queryFonts: false};
const log = (event, data = {}) => {
  const entry = {atMs: Math.round(performance.now() - started), event, ...data};
  events.push(entry);
  $('#log').textContent += JSON.stringify(entry) + '\n';
  $('#log').scrollTop = $('#log').scrollHeight;
  $('#state').textContent = event;
};
for (const event of ['loadstart', 'loadedmetadata', 'loadeddata', 'canplay', 'playing', 'waiting', 'seeking', 'seeked', 'ended', 'error']) {
  video.addEventListener(event, () => log(event, {position: video.currentTime, readyState: video.readyState, dimensions: [video.videoWidth, video.videoHeight], error: video.error && {code: video.error.code, message: video.error.message}, tracks: video.textTracks.length, decoded: video.getVideoPlaybackQuality?.()}));
}
const memory = () => performance.memory && {usedJSHeap: performance.memory.usedJSHeapSize, totalJSHeap: performance.memory.totalJSHeapSize};
async function cleanup() {
  generation++;
  video.pause(); video.removeAttribute('src'); video.load();
  if (renderer) {await renderer.destroy(); renderer = null;}
  if (remote) {remote.libav.terminate(); remote = null;}
  if (blobUrl) {URL.revokeObjectURL(blobUrl); blobUrl = null;}
}
async function begin(mode) {
  await cleanup();
  events = []; started = performance.now(); latestMode = mode; $('#log').textContent = '';
  const episode = Number($('#episode').value);
  const sample = samples.find(s => s.episodeNumber === episode);
  const original = sample.candidates.find(c => c.role === 'original');
  log('begin', {mode, episode, userAgent: navigator.userAgent, source: original.url, sourceBytes: original.bytes, memory: memory(), capabilities: {mp4H264: video.canPlayType('video/mp4; codecs="avc1.64001f,mp4a.40.2"'), mp4HEVC: video.canPlayType('video/mp4; codecs="hvc1.1.6.L120.B0,mp4a.40.2"'), mkv: video.canPlayType('video/x-matroska'), webcodecs: !!globalThis.VideoDecoder, isolated: crossOriginIsolated}});
  return {episode, original};
}
async function native(mode) {
  const {episode, original} = await begin(mode);
  const run = generation;
  video.src = mode === 'direct-original' ? original.url : `http://127.0.0.1:8793/media/${episode}/original`;
  video.play().catch(error => log('play-rejected', {message: error.message}));
  setTimeout(() => {if (run === generation) log('native-15-second-check', {position: video.currentTime, readyState: video.readyState, textTracks: Array.from(video.textTracks, t => ({language: t.language, label: t.label, mode: t.mode})), audioTracks: video.audioTracks ? Array.from(video.audioTracks, t => ({language: t.language, label: t.label, enabled: t.enabled})) : 'API unavailable', memory: memory()});}, 15000);
}
async function wasm() {
  const {episode, original} = await begin('browser-demux-remux-ass');
  remote = await openRemote({LibAV, url: `http://127.0.0.1:8793/media/${episode}/original`, size: original.bytes, log});
  await loadWindow(0);
}
async function overlay() {
  if (Number($('#episode').value) !== 1) throw new Error('This candidate only proves episode 1 default Japanese audio; use explicit remux for episode 1001');
  const {episode, original} = await begin('native-original-with-incremental-ASS');
  video.src = original.url;
  video.play().catch(error => log('play-rejected', {message: error.message}));
  remote = await openRemote({LibAV, url: `http://127.0.0.1:8793/media/${episode}/original`, size: original.bytes, log, byteLimit: 8 * 1024 * 1024});
  const result = await extractSubtitleWindow(remote, {seconds: 24, eventLimit: 3, log});
  renderer = new JASSUB({video, subContent: result.ass, ...rendererOptions});
  await renderer.ready;
  log('native-original-with-ASS-ready', {events: result.metrics.subtitleEvents, firstSubtitle: result.metrics.firstSubtitleTime, bytes: remote.metrics.bytes, position: video.currentTime, memory: memory()});
}
async function loadWindow(start) {
  if (!remote) throw new Error('Run Browser demux first');
  const result = await remuxWindow(remote, {start, log});
  if (renderer) {await renderer.destroy(); renderer = null;}
  video.pause();
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = URL.createObjectURL(new Blob([result.mp4], {type: 'video/mp4'}));
  video.src = blobUrl;
  renderer = new JASSUB({video, subContent: result.ass, ...rendererOptions});
  await renderer.ready;
  log('subtitle-renderer-ready', {events: result.metrics.subtitleEvents, bytes: remote.metrics.bytes, memory: memory()});
  if (start) video.addEventListener('loadedmetadata', () => {video.currentTime = Math.max(start, result.metrics.firstTime);}, {once: true});
  await video.play();
  log('play-requested-with-japanese-ass', {window: result.metrics, memory: memory()});
}
async function save() {
  const data = {kind: 'technical-browser-pilot', mode: latestMode, at: new Date().toISOString(), userAgent: navigator.userAgent, events, inputMetrics: remote?.metrics, memory: memory(), humanJapaneseAudioVerified: false, humanEnglishSubtitlesVerified: false, tvVerified: false};
  await fetch('/evidence', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
}
async function showCue() {
  if (!renderer || latestMode !== 'native-original-with-incremental-ASS') throw new Error('Run the episode-1 native plus ASS test and wait for ASS ready');
  video.pause();
  video.currentTime = 18.5;
  log('cue-verification-seek-requested', {position: 18.5, expectedText: 'Wealth, fame, power...'});
}
for (const [id, action] of [['direct', () => native('direct-original')], ['relay', () => native('relay-original')], ['overlay', overlay], ['cue', showCue], ['wasm', wasm], ['seek', () => loadWindow(600)], ['stop', async () => {await save(); await cleanup(); log('stopped-and-saved');}]]) {
  $('#' + id).onclick = () => action().catch(async error => {log('pilot-error', {message: error.message, stack: error.stack}); await save();});
}
window.addEventListener('unhandledrejection', event => log('unhandled-rejection', {message: String(event.reason)}));
