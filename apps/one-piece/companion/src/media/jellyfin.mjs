import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { MediaError } from './errors.mjs';
import { createTimingInspector } from './timing.mjs';
import { preparedRecipe, finalizePreparedFiles, managedRegularFile, renditionId, canonicalCaptionHash } from './prepared.mjs';
import { createHash, randomUUID } from 'node:crypto';
import { fetchStaticResource } from './static-resource.mjs';
import { PreparedToolRegistry } from './prepared-processes.mjs';

const SECRET_QUERY = /^(?:api[_-]?key|token|access_token|x-emby-token)$/i;
const GUID = /^[a-f0-9-]{32,36}$/i;
const idKey = value => String(value).replaceAll('-', '').toLowerCase();

export function selectTracks(streams, requestedAudioIndex, preferredAudioLanguage) {
  const audio = streams.filter(s => s.Type === 'Audio');
  let japanese = audio.filter(s => ['jpn', 'ja'].includes(s.Language?.toLowerCase()) && !/commentary|descrip/i.test(s.Title ?? ''));
  japanese.sort((a, b) => Number(b.Codec === 'aac' && b.Channels === 2) - Number(a.Codec === 'aac' && a.Channels === 2));
  const languages=['en','eng'].includes(preferredAudioLanguage)?['en','eng']:['ja','jpn'];
  const preferred=audio.filter(s=>languages.includes(s.Language?.toLowerCase())&&!/commentary|descrip/i.test(s.Title??''));
  preferred.sort((a,b)=>Number(b.Codec==='aac'&&b.Channels===2)-Number(a.Codec==='aac'&&a.Channels===2));
  const selectedAudio = requestedAudioIndex === undefined ? (preferred[0]??japanese[0]) : audio.find(s => s.Index === requestedAudioIndex);
  const english = streams.filter(s => s.Type === 'Subtitle' && ['eng', 'en'].includes(s.Language?.toLowerCase())
    && !s.IsForced && !/sign|song|karaoke|commentary|forced/i.test(s.Title ?? ''));
  if (!selectedAudio || english.length !== 1) throw new MediaError('TRACKS_UNVERIFIED', 'Japanese audio and full-English subtitles could not be identified unambiguously', { status: 422 });
  return { audioIndex: selectedAudio.Index, subtitleIndex: english[0].Index,
    audioLanguage: selectedAudio.Language, subtitleLanguage: english[0].Language };
}

export function deviceProfile(mode) {
  if (!['compatible-h264', 'cast-h264', 'hevc-fmp4'].includes(mode)) throw new MediaError('INVALID_MODE', 'Unsupported playback mode');
  const h264 = mode !== 'hevc-fmp4';
  return { Name: `PTI ${mode}`, MaxStreamingBitrate: 10000000, DirectPlayProfiles: [],
    TranscodingProfiles: [{ Container: h264 ? 'ts' : 'mp4', Type: 'Video',
      VideoCodec: h264 ? 'h264' : 'hevc', AudioCodec: 'aac', Protocol: 'hls',
      Context: 'Streaming', MinSegments: 1, SegmentLength: mode === 'cast-h264' ? 2 : 3, MaxAudioChannels: '2' }],
    CodecProfiles: h264 ? [{ Type: 'Video', Codec: 'h264', Conditions: [
      { Condition: 'LessThanEqual', Property: 'VideoBitDepth', Value: '8', IsRequired: true }
    ] }] : [],
    SubtitleProfiles: [{ Format: 'vtt', Method: 'External' }, { Format: 'ass', Method: 'External' }] };
}

async function boundedBytes(response, maxBytes) {
  const reader = response.body?.getReader();
  const parts = []; let length = 0;
  if (!reader) return Buffer.alloc(0);
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maxBytes) throw new MediaError('ENGINE_RESPONSE_LIMIT', 'Media engine response exceeded its limit', { status: 502 });
      parts.push(value);
    }
    return Buffer.concat(parts);
  } finally { await reader.cancel().catch(() => {}); }
}

function abortableHeaders(operation, signal) {
  return new Promise((resolve, reject) => {
    let ended = false;
    const finish = (error, value) => { if (ended) return; ended = true; signal.removeEventListener('abort', aborted); error ? reject(error) : resolve(value); };
    const aborted = () => finish(signal.reason);
    if (signal.aborted) { aborted(); return; }
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(operation).then(response => {
      if (ended) { try { void Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch {} return; }
      finish(null, response);
    }, error => finish(error));
  });
}

/** All credentials remain here. Only paths in each session's discovered resource graph can be read. */
export class JellyfinClient {
  constructor({ baseUrl = 'http://127.0.0.1:18096', tokenProvider, fetchImpl = fetch,
    originalRoot, transcodeRoot, ffprobePath, ffmpegPath, preparedRoot, preparedEnabled = false, preparedRunner,
    timingInspector, verifiedModes = ['compatible-h264', 'cast-h264'], libraryName = 'PTI One Piece Cache', allowOtherLibrariesForPilot = false,
    headerAdmissionTimeoutMs = 30000 } = {}) {
    const base = new URL(baseUrl);
    if (base.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password
      || base.pathname !== '/' || base.search || base.hash || typeof tokenProvider !== 'function') throw new Error('Jellyfin requires a literal loopback endpoint and private token provider');
    if (!originalRoot || !transcodeRoot) throw new Error('Managed engine paths are required');
    if (!Number.isSafeInteger(headerAdmissionTimeoutMs) || headerAdmissionTimeoutMs < 1 || headerAdmissionTimeoutMs > 30000) throw new Error('Engine header admission must have a bounded deadline');
    Object.assign(this, { baseUrl: base.origin, tokenProvider, fetchImpl, originalRoot: path.resolve(originalRoot), transcodeRoot: path.resolve(transcodeRoot), libraryName, allowOtherLibrariesForPilot });
    if (!Array.isArray(verifiedModes) || !verifiedModes.includes('compatible-h264') || verifiedModes.some(mode => !['compatible-h264', 'cast-h264', 'hevc-fmp4', 'prepared-mp4'].includes(mode))) throw new Error('Only explicitly verified modes, including compatible-h264, are permitted');
    if (preparedEnabled && (!preparedRoot || !ffmpegPath || !ffprobePath) || verifiedModes.includes('prepared-mp4') && !preparedEnabled) throw new Error('Prepared MP4 needs explicit enablement, managed roots and pinned tools');
    Object.assign(this, { preparedEnabled, preparedRoot: preparedRoot ? path.resolve(preparedRoot) : null, ffmpegPath, ffprobePath, preparedRunner });
    this.preparedTools = preparedEnabled ? new PreparedToolRegistry({ workRoot: path.join(path.dirname(this.preparedRoot), 'prepared-work'), ffmpegPath, ffprobePath }) : null;
    if (timingInspector !== undefined && typeof timingInspector !== 'function') throw new Error('Timing inspector must be a bounded function');
    this.inspectTiming = timingInspector ?? (ffprobePath ? createTimingInspector({ ffprobePath, originalRoot: this.originalRoot }) : null);
    this.verifiedModes = new Set(verifiedModes); this.sessions = new Map(); this.library = null;
    this.headerAdmissionTimeoutMs = headerAdmissionTimeoutMs; this.headerTail = Promise.resolve(); this.pendingHeaders = 0;
  }

  /** Pinned12.2 lazily creates its transcode manager, which deletes the marker
   * initialized by System/Info. Admit authenticated engine requests one at a
   * time through headers; never hold the gate while consuming a media body.
   */
  async fetchHeaders(url, options = {}) {
    const target = new URL(url);
    if (target.origin !== this.baseUrl || target.username || target.password) throw new MediaError('ENGINE_ENDPOINT', 'Engine request escaped its private origin', { status: 403 });
    if (this.pendingHeaders >= 32) throw new MediaError('ENGINE_BUSY', 'The private engine has too many pending requests', { status: 503, retryable: true });
    const deadline = new AbortController(), signal = options.signal ? AbortSignal.any([options.signal, deadline.signal]) : deadline.signal;
    const timer = setTimeout(() => deadline.abort(new MediaError('ENGINE_HEADER_TIMEOUT', 'The private engine request did not reach its headers in time', { status: 504, retryable: true })), this.headerAdmissionTimeoutMs);
    this.pendingHeaders++;
    // A cancelled queued ticket must stay behind its predecessor. Releasing it
    // early would let a later caller overlap the still-running header request.
    const admitted = this.headerTail.then(async () => {
      if (signal.aborted) throw signal.reason;
      // Caller cancellation/deadline can finish independently, but ownership of
      // admission ends only at actual fetch settlement. A late/uncooperative
      // fetch must not overlap the next marker-initializing engine request.
      const response = await this.fetchImpl(url, { ...options, signal });
      if (signal.aborted) { try { void Promise.resolve(response?.body?.cancel()).catch(() => {}); } catch {} throw signal.reason; }
      return response;
    });
    this.headerTail = admitted.then(() => { this.pendingHeaders--; }, () => { this.pendingHeaders--; });
    try { return await abortableHeaders(() => admitted, signal); }
    finally { clearTimeout(timer); }
  }

  async auth(deviceId = 'pti-one-piece-companion') {
    const token = await this.tokenProvider();
    if (!/^[a-zA-Z0-9._-]{8,256}$/.test(token ?? '') || !/^[a-zA-Z0-9._-]{1,160}$/.test(deviceId)) throw new MediaError('ENGINE_CREDENTIAL', 'Private media-engine credential is unavailable', { status: 503 });
    return `MediaBrowser Client="PTI One Piece", Device="PC companion", DeviceId="${deviceId}", Version="1", Token="${token}"`;
  }

  async request(relative, { method = 'GET', body, signal: callerSignal, deviceId, timeoutMs = 30000 } = {}) {
    if (!relative.startsWith('/') || relative.startsWith('//')) throw new Error('Internal engine path required');
    const signal = callerSignal ? AbortSignal.any([callerSignal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
    let response;
    try { response = await this.fetchHeaders(this.baseUrl + relative, { method, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual', signal,
      headers: { Authorization: await this.auth(deviceId), Accept: 'application/json', 'Content-Type': 'application/json' } }); }
    catch (error) { if (callerSignal?.aborted) throw callerSignal.reason;
      throw new MediaError('ENGINE_OFFLINE', 'The PC media engine is unavailable', { status: 503, retryable: true, cause: error }); }
    if (!response.ok) { await response.body?.cancel(); throw new MediaError('ENGINE_UNAVAILABLE', `Media engine returned HTTP ${response.status}`, { status: 503, retryable: response.status >= 500 }); }
    const bytes = await boundedBytes(response, 4 * 1024 * 1024);
    return bytes.length ? JSON.parse(bytes.toString('utf8')) : null;
  }

  async configure({ hardwareAcceleration } = {}) {
    const network = await this.request('/System/Configuration/network');
    if (network.AutoDiscovery || network.EnableRemoteAccess || !network.LocalNetworkAddresses?.length
      || network.LocalNetworkAddresses.some(a => !['127.0.0.1', '::1'].includes(a))) throw new MediaError('ENGINE_BIND', 'Media-engine administration must stay on loopback', { status: 503 });
    const info = await this.request('/System/Info/Public');
    if (!/^12\.2(?:\.|$)/.test(info.Version ?? '')) throw new MediaError('ENGINE_VERSION', 'This companion was validated with pinned Jellyfin 12.2', { status: 503 });
    for (const task of await this.request('/ScheduledTasks')) await this.request(`/ScheduledTasks/${task.Id}/Triggers`, { method: 'POST', body: [] });
    const encoding = await this.request('/System/Configuration/encoding');
    Object.assign(encoding, { TranscodingTempPath: this.transcodeRoot, EnableThrottling: !this.preparedEnabled, ThrottleDelaySeconds: 30,
      EnableSegmentDeletion: true, SegmentKeepSeconds: 60, EnableSubtitleExtraction: true, SubtitleExtractionTimeoutMinutes: 2 });
    if (hardwareAcceleration !== undefined) {
      if (!['none', 'nvenc'].includes(hardwareAcceleration)) throw new MediaError('INVALID_MODE', 'Unsupported hardware configuration');
      Object.assign(encoding, { HardwareAccelerationType: hardwareAcceleration, EnableHardwareEncoding: hardwareAcceleration === 'nvenc',
        HardwareDecodingCodecs: ['h264', 'hevc'], EnableDecodingColorDepth10Hevc: true, AllowHevcEncoding: false, AllowAv1Encoding: false });
    }
    await this.request('/System/Configuration/encoding', { method: 'POST', body: encoding });
    // Pinned12.2 creates its transcode marker lazily through GetTranscodePath.
    // Concurrent first video requests after restart can race on that Windows
    // file. This authenticated mature-engine read initializes it serially and
    // verifies the effective root before any viewing session is admitted.
    const system = await this.request('/System/Info');
    if (typeof system?.TranscodingTempPath !== 'string' || path.resolve(system.TranscodingTempPath) !== this.transcodeRoot)
      throw new MediaError('ENGINE_TRANSCODE_PATH', 'The private engine did not activate its managed processing root', { status: 503 });
    const options = { Enabled: true, EnableRealtimeMonitor: false, EnableLUFSScan: false, EnableInternetProviders: false,
      EnableChapterImageExtraction: false, ExtractChapterImagesDuringLibraryScan: false,
      EnableTrickplayImageExtraction: false, ExtractTrickplayImagesDuringLibraryScan: false, SaveLocalMetadata: false,
      AutomaticRefreshIntervalDays: 0, MetadataSavers: [], SubtitleDownloadLanguages: [], SaveSubtitlesWithMedia: false,
      AllowEmbeddedSubtitles: 'AllowAll', TypeOptions: [{ Type: 'Movie', MetadataFetchers: [], ImageFetchers: [] }],
      PathInfos: [this.originalRoot, ...(this.preparedEnabled ? [this.preparedRoot] : [])].map(Path => ({ Path })) };
    let folders = await this.request('/Library/VirtualFolders');
    if ((!this.allowOtherLibrariesForPilot || this.preparedEnabled) && folders.some(f => f.Name !== this.libraryName)) {
      throw new MediaError('ENGINE_SHARED_INSTANCE', 'Production requires a dedicated private engine containing only the bounded local family cache', { status: 503 });
    }
    this.library = folders.find(f => f.Name === this.libraryName);
    if (!this.library) {
      await this.request(`/Library/VirtualFolders?name=${encodeURIComponent(this.libraryName)}&collectionType=movies&refreshLibrary=false`, { method: 'POST', body: { LibraryOptions: options } });
      folders = await this.request('/Library/VirtualFolders'); this.library = folders.find(f => f.Name === this.libraryName);
    } else {
      const roots = new Set(options.PathInfos.map(info => info.Path));
      if (this.library.Locations?.some(location => !roots.has(path.resolve(location)))) throw new MediaError('ENGINE_LIBRARY', 'Existing family library points outside the managed cache');
      await this.request('/Library/VirtualFolders/LibraryOptions', { method: 'POST', body: { Id: this.library.ItemId, LibraryOptions: options } });
    }
    if (!this.library?.ItemId) throw new MediaError('ENGINE_LIBRARY', 'Managed media library could not be created');
    if (this.preparedEnabled) {
      const actual = (await this.request('/Library/VirtualFolders')).find(folder => folder.Name === this.libraryName);
      const expected = options.PathInfos.map(info => info.Path), movie = actual?.LibraryOptions?.TypeOptions?.find(type => type.Type === 'Movie');
      if (!actual || actual.Locations?.length !== expected.length || actual.Locations.some(location => !expected.includes(location))
        || !movie || movie.MetadataFetchers?.length !== 0 || movie.ImageFetchers?.length !== 0 || actual.LibraryOptions.EnableRealtimeMonitor)
        throw new MediaError('ENGINE_LIBRARY', 'Prepared cache roots and disabled providers did not survive engine readback', { status: 503 });
      this.library = actual;
    }
    return { version: info.Version, hardwareAcceleration: encoding.HardwareAccelerationType, libraryId: this.library.ItemId };
  }

  async ensureFile(file, { signal } = {}) {
    const resolved = path.resolve(file);
    if (!resolved.startsWith(this.originalRoot + path.sep)) throw new MediaError('ENGINE_PATH', 'Only verified managed originals can be imported');
    if (!this.library) throw new MediaError('ENGINE_NOT_READY', 'Media engine has not been initialized', { status: 503 });
    const list = async () => this.request(`/Items?Recursive=true&ParentId=${this.library.ItemId}&IncludeItemTypes=Movie&Fields=MediaSources,MediaStreams,Path`, { signal });
    let found = (await list()).Items?.find(item => path.resolve(item.Path ?? '') === resolved && item.MediaSources?.[0]?.MediaStreams?.length);
    if (found) return found;
    // Jellyfin's item Refresh API cannot discover new filesystem children. The
    // engine is required to contain ONLY this finite, locally verified cache.
    // This scan never sees the 1,084-entry Archive catalogue or remote STRMs.
    await this.request('/Library/Refresh', { method: 'POST', signal });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      found = (await list()).Items?.find(item => path.resolve(item.Path ?? '') === resolved && item.MediaSources?.[0]?.MediaStreams?.length);
      if (found) return found;
      await delay(200, undefined, { signal });
    }
    throw new MediaError('ENGINE_IMPORT_TIMEOUT', 'The cached episode could not be inspected within its preparation limit', { status: 503, retryable: true });
  }

  canonicalResource(value, session, basePath = '/') {
    if (typeof value !== 'string' || value.length > 16384 || /[\x00-\x20\\]/.test(value)) throw new MediaError('MEDIA_RESOURCE', 'Invalid media resource');
    const url = new URL(value, this.baseUrl + basePath);
    if (url.origin !== this.baseUrl || url.username || url.password || url.hash) throw new MediaError('MEDIA_RESOURCE', 'Media resource escaped its private engine');
    if (session.mode === 'prepared-mp4') {
      for (const key of [...url.searchParams.keys()]) if (SECRET_QUERY.test(key)) url.searchParams.delete(key);
      url.searchParams.sort(); const canonical = url.pathname + url.search;
      if (![session.videoPath, session.subtitlePath].includes(canonical)) throw new MediaError('MEDIA_RESOURCE', 'Prepared resource is outside its exact video/caption bindings', { status: 403 });
      return canonical;
    }
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0]?.toLowerCase() !== 'videos' || idKey(parts[1]) !== idKey(session.itemId)) throw new MediaError('MEDIA_RESOURCE', 'Media resource belongs to another episode', { status: 403 });
    if (parts.some(part => /%2f|%5c|%2e/i.test(part))) throw new MediaError('MEDIA_RESOURCE', 'Encoded media path is not permitted');
    for (const [key, val] of [...url.searchParams]) {
      if (SECRET_QUERY.test(key)) url.searchParams.delete(key);
      else if (key.toLowerCase() === 'mediasourceid' && idKey(val) !== idKey(session.mediaSourceId)) throw new MediaError('MEDIA_RESOURCE', 'Media source does not match this session', { status: 403 });
      else if (key.toLowerCase() === 'playsessionid' && val !== session.playSessionId) throw new MediaError('MEDIA_RESOURCE', 'Playback resource belongs to another session', { status: 403 });
    }
    if (parts.some(p => p.toLowerCase() === 'subtitles')) {
      if (idKey(parts[2]) !== idKey(session.mediaSourceId)) throw new MediaError('MEDIA_RESOURCE', 'Caption source does not match this session', { status: 403 });
      const index = Number(parts[4]);
      if (index !== session.selected.subtitleIndex) throw new MediaError('MEDIA_RESOURCE', 'Caption track is not the full-English selection', { status: 403 });
    }
    url.searchParams.sort();
    return url.pathname + url.search;
  }

  async inspectPresentation(entry, { audioIndex, audioLanguage, signal, inspectedItem } = {}) {
    if (!this.preparedEnabled || !this.inspectTiming) throw new MediaError('UNVERIFIED_MODE', 'Prepared presentation is not enabled on this installation', { status: 422 });
    const item = inspectedItem ?? await this.ensureFile(entry.path, { signal }), source = item.MediaSources?.[0];
    if (!source?.MediaStreams || !GUID.test(item.Id) || !GUID.test(source.Id)) throw new MediaError('ENGINE_METADATA', 'Original presentation metadata is incomplete');
    const selected = selectTracks(source.MediaStreams, audioIndex, audioLanguage), videoIndex = source.MediaStreams.find(stream => stream.Type === 'Video')?.Index;
    const timing = await this.inspectTiming(entry.path, { videoIndex, audioIndex: selected.audioIndex, signal });
    return { item, source, selected, timing, recipe: preparedRecipe({ candidate: entry.candidate, source, selected, timing }) };
  }
  async recoverPreparedJobs() { return this.preparedTools ? this.preparedTools.recover() : { verified: true, stopped: 0 }; }

  async prepareRendition({ entry, presentation, recipe, paths, maximumOutputBytes, signal, checkStorage, onProgress, onCleanupFailure }) {
    if (!this.preparedEnabled || renditionId(recipe) !== renditionId(presentation.recipe)) throw new MediaError('PREPARED_INVALID', 'Preparation recipe changed');
    const sessionId = `mp4-${randomUUID()}`, deviceId = `pti-mp4-${randomUUID()}`; let progressiveBinding;
    try {
      const original = await this.openPlayback({ sessionId, entry, mode: 'compatible-h264', audioIndex: presentation.selected.audioIndex,
        signal, inspectedItem: presentation.item });
      const captionResponse = await this.getPlaybackResource(sessionId, original.subtitlePath, { signal });
      const captions = Buffer.from(await new Response(captionResponse.body).arrayBuffer());
      const profile = deviceProfile('compatible-h264'); profile.Name = 'PTI prepared MP4';
      Object.assign(profile.TranscodingProfiles[0], { Container: 'mp4', Protocol: 'http', CopyTimestamps: true });
      const reply = await this.request(`/Items/${original.itemId}/PlaybackInfo`, { method: 'POST', deviceId, signal, body: {
        MediaSourceId: original.mediaSourceId, AudioStreamIndex: presentation.selected.audioIndex, SubtitleStreamIndex: presentation.selected.subtitleIndex,
        MaxStreamingBitrate: recipe.maxBitrate, MaxAudioChannels: 2, EnableDirectPlay: false, EnableDirectStream: true, EnableTranscoding: true,
        AllowVideoStreamCopy: recipe.videoPolicy === 'copy-compatible-h264', AllowAudioStreamCopy: recipe.audio.allowCopy, DeviceProfile: profile } });
      const media = reply.MediaSources?.find(source => source.Id === original.mediaSourceId);
      if (!media?.TranscodingUrl || media.DefaultAudioStreamIndex !== presentation.selected.audioIndex) throw new MediaError('ENGINE_SELECTION', 'Prepared media ignored the selected original audio');
      progressiveBinding = { itemId: original.itemId, mediaSourceId: original.mediaSourceId, selected: presentation.selected, playSessionId: reply.PlaySessionId, deviceId };
      const relative = this.canonicalResource(media.TranscodingUrl, progressiveBinding);
      if (!/\/stream(?:\.mp4)?$/i.test(new URL(relative, this.baseUrl).pathname)) throw new MediaError('ENGINE_SELECTION', 'Engine did not negotiate private progressive MP4');
      const response = await this.fetchHeaders(this.baseUrl + relative, { redirect: 'manual',
        headers: { Authorization: await this.auth(deviceId) }, signal: AbortSignal.any([signal ?? new AbortController().signal, AbortSignal.timeout(600000)]) });
      const result = await finalizePreparedFiles({ response, captions, paths, recipe, maximumOutputBytes, ffmpegPath: this.ffmpegPath, ffprobePath: this.ffprobePath,
        signal, checkStorage, onProgress, registry: this.preparedTools, ...(this.preparedRunner ? { run: this.preparedRunner } : {}) });
      return { ...result, presentation: { item: { Id: presentation.item.Id }, source: { Id: presentation.source.Id,
        MediaStreams: presentation.source.MediaStreams.filter(stream => ['Audio', 'Subtitle'].includes(stream.Type)).map(stream => ({ Index: stream.Index,
          Type: stream.Type, Language: stream.Language, Title: stream.Title ?? stream.DisplayTitle ?? '', Codec: stream.Codec,
          Channels: stream.Channels, IsForced: stream.IsForced ?? false })) }, selected: presentation.selected, timing: presentation.timing } };
    } finally {
      let cleanupFailed = false;
      if (progressiveBinding) await this.request(`/Videos/ActiveEncodings?DeviceId=${encodeURIComponent(deviceId)}&PlaySessionId=${encodeURIComponent(progressiveBinding.playSessionId)}`, { method: 'DELETE', timeoutMs: 5000 }).catch(() => { cleanupFailed = true; });
      await this.stopSession(sessionId);
      if (cleanupFailed || signal?.aborted) {
        const error = new MediaError('ENGINE_CLEANUP', 'Prepared processing needs verified private-engine cancellation', { status: 503, retryable: true });
        if (typeof onCleanupFailure !== 'function') throw error;
        await onCleanupFailure(error);
      }
    }
  }

  async ensurePreparedFile(record, { signal } = {}) {
    if (!this.preparedEnabled || !this.library || record.id !== renditionId(record.recipe)) throw new MediaError('ENGINE_NOT_READY', 'Prepared library is not enabled');
    const expected = path.join(this.preparedRoot, record.id, 'video.mp4');
    if (path.resolve(record.paths.video) !== expected || path.resolve(record.paths.captions) !== path.join(this.preparedRoot, record.id, 'video.en.vtt')) throw new MediaError('ENGINE_PATH', 'Prepared file identity escaped its managed recipe');
    await managedRegularFile(expected, this.preparedRoot); await managedRegularFile(record.paths.captions, this.preparedRoot);
    const list = async () => this.request(`/Items?Recursive=true&ParentId=${this.library.ItemId}&IncludeItemTypes=Movie&Fields=MediaSources,MediaStreams,Path`, { signal });
    let item = (await list()).Items?.find(item => path.resolve(item.Path ?? '') === expected && item.MediaSources?.[0]?.MediaStreams?.length);
    if (item) return item;
    const folders = await this.request('/Library/VirtualFolders', { signal });
    const roots = new Set([this.originalRoot, this.preparedRoot]);
    if (folders.length !== 1 || folders[0].ItemId !== this.library.ItemId || folders[0].Locations.some(root => !roots.has(path.resolve(root)))) throw new MediaError('ENGINE_SHARED_INSTANCE', 'Prepared import requires only the dedicated finite cache');
    // Both roots contain only admitted cache files; no Archive catalogue, URL or STRM is imported.
    await this.request('/Library/Refresh', { method: 'POST', signal });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) { item = (await list()).Items?.find(item => path.resolve(item.Path ?? '') === expected && item.MediaSources?.[0]?.MediaStreams?.length);
      if (item) return item; await delay(200, undefined, { signal }); }
    throw new MediaError('ENGINE_IMPORT_TIMEOUT', 'Prepared episode could not be imported within its bounded preparation time', { status: 503, retryable: true });
  }

  async openPreparedPlayback({ sessionId, entry, rendition, presentation, signal }) {
    if (!this.verifiedModes.has('prepared-mp4')) throw new MediaError('UNVERIFIED_MODE', 'Prepared MP4 has not been enabled for this installation', { status: 422 });
    const item = await this.ensurePreparedFile(rendition, { signal }), source = item.MediaSources[0];
    const derived = selectTracks(source.MediaStreams, undefined, rendition.recipe.audio.language);
    const videoPath = `/Videos/${item.Id}/stream.mp4?MediaSourceId=${source.Id}&Static=true`;
    const subtitlePath = `/Videos/${item.Id}/${source.Id}/Subtitles/${derived.subtitleIndex}/0/Stream.vtt`;
    const session = { id: sessionId, mode: 'prepared-mp4', itemId: item.Id, mediaSourceId: source.Id, deviceId: `pti-${sessionId}`, playSessionId: randomUUID(),
      selected: derived, videoPath, subtitlePath, allowed: new Set([videoPath, subtitlePath]), byteLength: rendition.video.bytes,
      durationSeconds: rendition.recipe.durationSeconds, renditionId: rendition.id };
    this.sessions.set(sessionId, session);
    try {
      const captionResponse = await this.getPlaybackResource(sessionId, subtitlePath, { signal }), captionBytes = Buffer.from(await new Response(captionResponse.body).arrayBuffer());
      if (createHash('sha256').update(captionBytes).digest('hex') !== rendition.captions.sha256) {
        const cues = canonicalCaptionHash(captionBytes);
        if (cues.version !== rendition.captions.cueIdentity?.version || cues.sha256 !== rendition.captions.cueIdentity.sha256) throw new MediaError('CAPTION_LINEAGE', 'Imported captions did not match the inspected original full-English track', { status: 503 });
      }
    } catch (error) { this.sessions.delete(sessionId); throw error; }
    return { sessionId, itemId: presentation.item.Id, mediaSourceId: presentation.source.Id, durationSeconds: rendition.recipe.durationSeconds,
      containerDurationSeconds: presentation.timing.containerDurationSeconds, timing: presentation.timing, mode: 'prepared-mp4', contentType: 'video/mp4',
      selected: presentation.selected, tracks: presentation.source.MediaStreams.filter(stream => ['Audio', 'Subtitle'].includes(stream.Type)).map(stream => ({
        index: stream.Index, type: stream.Type.toLowerCase(), language: stream.Language ?? null, title: stream.Title ?? stream.DisplayTitle ?? '', codec: stream.Codec,
        fullEnglish: stream.Index === presentation.selected.subtitleIndex })), masterPath: videoPath, subtitlePath, renditionId: rendition.id };
  }

  async openPlayback({ sessionId, entry, mode = 'compatible-h264', audioIndex, audioLanguage, signal, inspectedItem } = {}) {
    if (!this.verifiedModes.has(mode)) throw new MediaError('UNVERIFIED_MODE', 'That delivery mode has not passed this installation’s device checks', { status: 422 });
    const item = inspectedItem ?? await this.ensureFile(entry.path, { signal });
    const source = item.MediaSources?.[0];
    if (!source?.Id || !GUID.test(item.Id)) throw new MediaError('ENGINE_METADATA', 'Cached episode has no playable source');
    const selected = selectTracks(source.MediaStreams, audioIndex,audioLanguage);
    const videoIndex = source.MediaStreams.find(stream => stream.Type === 'Video')?.Index;
    if (mode === 'cast-h264' && !this.inspectTiming) throw new MediaError('TIMING_UNVERIFIED', 'Cast requires selected-track timing inspection', { status: 503 });
    const timing = this.inspectTiming ? await this.inspectTiming(entry.path, { videoIndex, audioIndex: selected.audioIndex, signal }) : null;
    const deviceId = `pti-${sessionId}`;
    const response = await this.request(`/Items/${item.Id}/PlaybackInfo`, { method: 'POST', signal, deviceId,
      body: { MediaSourceId: source.Id, AudioStreamIndex: selected.audioIndex, SubtitleStreamIndex: selected.subtitleIndex,
        MaxStreamingBitrate: 10000000, MaxAudioChannels: 2, EnableDirectPlay: false, EnableDirectStream: true,
        EnableTranscoding: true, AllowVideoStreamCopy: mode !== 'cast-h264', AllowAudioStreamCopy: true, DeviceProfile: deviceProfile(mode) } });
    const media = response.MediaSources?.find(s => s.Id === source.Id);
    if (!media?.TranscodingUrl || media.DefaultAudioStreamIndex !== selected.audioIndex) throw new MediaError('ENGINE_SELECTION', 'Media engine did not honor the selected audio');
    const session = { id: sessionId, itemId: item.Id, mediaSourceId: source.Id, playSessionId: response.PlaySessionId, deviceId,
      selected, allowed: new Set(), durationSeconds: timing?.effectiveDurationSeconds ?? media.RunTimeTicks / 10000000,
      containerDurationSeconds: media.RunTimeTicks / 10000000, timing };
    const masterPath = this.canonicalResource(media.TranscodingUrl, session);
    // Always offer full English as WebVTT; ASS remains private and optional for a future fidelity renderer.
    const subtitlePath = this.canonicalResource(`/Videos/${item.Id}/${source.Id}/Subtitles/${selected.subtitleIndex}/0/Stream.vtt`, session);
    session.allowed.add(masterPath); session.allowed.add(subtitlePath);
    this.sessions.set(sessionId, session);
    return { sessionId, itemId: item.Id, mediaSourceId: source.Id, durationSeconds: session.durationSeconds,
      containerDurationSeconds: session.containerDurationSeconds, timing, mode, selected, contentType: 'application/vnd.apple.mpegurl',
      tracks: source.MediaStreams.filter(s => ['Audio', 'Subtitle'].includes(s.Type)).map(s => ({ index: s.Index, type: s.Type.toLowerCase(), language: s.Language ?? null,
        title: s.Title ?? s.DisplayTitle ?? '', codec: s.Codec, fullEnglish: s.Index === selected.subtitleIndex })), masterPath, subtitlePath };
  }

  async getPlaybackResource(sessionId, relative, { signal: callerSignal, range, method = 'GET' } = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) throw new MediaError('SESSION_GONE', 'Playback session has ended', { status: 410 });
    const canonical = this.canonicalResource(relative, session);
    if (!session.allowed.has(canonical)) throw new MediaError('MEDIA_RESOURCE', 'Resource is not authorized for this playback session', { status: 403 });
    if (session.mode === 'prepared-mp4' && canonical === session.videoPath) return fetchStaticResource({ fetchImpl: (url, options) => this.fetchHeaders(url, options), origin: this.baseUrl,
      relative: canonical, authorization: await this.auth(session.deviceId), byteLength: session.byteLength, method, range, signal: callerSignal });
    if (range && (!/^bytes=\d*-\d*$/.test(range) || range === 'bytes=-')) throw new MediaError('MEDIA_RANGE', 'Only one bounded media range is supported', { status: 416 });
    const signal = callerSignal ? AbortSignal.any([callerSignal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000);
    const response = await this.fetchHeaders(this.baseUrl + canonical, { redirect: 'manual', signal,
      headers: { Authorization: await this.auth(session.deviceId), ...(range ? { Range: range } : {}) } });
    if (![200, 206].includes(response.status)) { await response.body?.cancel(); throw new MediaError('PLAYBACK_RESOURCE', `Prepared media returned HTTP ${response.status}`, { status: 502, retryable: response.status >= 500 }); }
    const type = response.headers.get('content-type') ?? 'application/octet-stream';
    const headers = { 'content-type': type, 'cache-control': 'private, no-store' };
    for (const name of ['content-length', 'content-range', 'accept-ranges']) if (response.headers.has(name)) headers[name] = response.headers.get(name);
    if (/mpegurl/i.test(type) || /\.m3u8(?:\?|$)/i.test(canonical)) {
      let text = (await boundedBytes(response, 1024 * 1024)).toString('utf8');
      if (!text.startsWith('#EXTM3U')) throw new MediaError('ENGINE_MANIFEST', 'Media engine returned an invalid playlist');
      if (session.timing) text = trimVodManifest(text, session.durationSeconds);
      const discovered = [];
      const convert = reference => { const child = this.canonicalResource(reference, session, canonical); session.allowed.add(child); discovered.push(child); return child; };
      text = text.split(/\r?\n/).map(line => line.startsWith('#')
        ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${convert(uri)}"`)
        : line.trim() ? convert(line.trim()) : line).join('\n');
      headers['content-length'] = String(Buffer.byteLength(text));
      return { status: response.status, headers, body: new Blob([text]).stream(), manifestText: text, resources: [...new Set(discovered)] };
    }
    const maxBytes = /text\/vtt/i.test(type) || /Stream\.vtt/i.test(canonical) ? 16 * 1024 * 1024 : 32 * 1024 * 1024;
    if (Number(headers['content-length'] ?? 0) > maxBytes) { await response.body?.cancel(); throw new MediaError('ENGINE_RESPONSE_LIMIT', 'Prepared media resource is too large', { status: 502 }); }
    const reader = response.body?.getReader(); let bytes = 0;
    const body = new ReadableStream({ async pull(controller) {
      try { const next = await reader.read(); if (next.done) { controller.close(); return; }
        bytes += next.value.byteLength; if (bytes > maxBytes) throw new MediaError('ENGINE_RESPONSE_LIMIT', 'Prepared resource exceeded its byte limit', { status: 502 }); controller.enqueue(next.value);
      } catch (error) { await reader?.cancel().catch(() => {}); controller.error(error); }
    }, cancel: reason => reader?.cancel(reason) });
    return { status: response.status, headers, body, resources: [] };
  }

  ownsResource(sessionId, relative) {
    const session = this.sessions.get(sessionId); if (!session) return false;
    try { return session.allowed.has(this.canonicalResource(relative, session)); } catch { return false; }
  }

  async stopSession(sessionId, positionSeconds = 0) {
    const session = this.sessions.get(sessionId); if (!session) return;
    this.sessions.delete(sessionId);
    await this.request('/Sessions/Playing/Stopped', { method: 'POST', deviceId: session.deviceId,
      body: { ItemId: session.itemId, MediaSourceId: session.mediaSourceId, PlaySessionId: session.playSessionId,
        PositionTicks: Math.max(0, Math.round(positionSeconds * 10000000)), Failed: false }, timeoutMs: 5000 }).catch(() => {});
  }

  async reportProgress(sessionId, { positionSeconds = 0, isPaused = false, playbackRate = 1 } = {}) {
    const session = this.sessions.get(sessionId); if (!session) throw new MediaError('SESSION_GONE', 'Playback session has ended', { status: 410 });
    if (!Number.isFinite(positionSeconds) || positionSeconds < 0 || !Number.isFinite(playbackRate) || playbackRate < .25 || playbackRate > 2) throw new MediaError('INVALID_PROGRESS', 'Invalid media progress');
    await this.request('/Sessions/Playing/Progress', { method: 'POST', deviceId: session.deviceId, timeoutMs: 5000,
      body: { ItemId: session.itemId, MediaSourceId: session.mediaSourceId, PlaySessionId: session.playSessionId,
        PositionTicks: Math.round(positionSeconds * 10000000), IsPaused: Boolean(isPaused), PlaybackRate: playbackRate,
        AudioStreamIndex: session.selected.audioIndex, SubtitleStreamIndex: session.selected.subtitleIndex, CanSeek: true } });
  }
}

/** A container may be longer because an unselected audio track extends past the movie.
 * Trim only the VOD tail; preserve global timestamps, preceding segment indices and subtitle time.
 */
export function trimVodManifest(text, durationSeconds) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) throw new MediaError('TIMING_UNVERIFIED', 'Selected presentation duration is invalid');
  if (!text.includes('#EXTINF:') || !text.includes('#EXT-X-ENDLIST')) return text;
  const out = []; let start = 0, exhausted = false;
  for (const line of text.split(/\r?\n/)) {
    if (line === '#EXT-X-ENDLIST') continue;
    if (exhausted) continue;
    if (line.startsWith('#EXTINF:')) {
      const match = /^#EXTINF:([\d.]+)(,.*)?$/.exec(line), seconds = Number(match?.[1]);
      if (!Number.isFinite(seconds) || seconds <= 0) throw new MediaError('ENGINE_MANIFEST', 'Prepared VOD has an invalid segment duration');
      const remaining = durationSeconds - start;
      if (remaining <= .000001) { exhausted = true; continue; }
      const actual = Math.min(seconds, remaining);
      out.push(`#EXTINF:${Number(actual.toFixed(6))}${match?.[2] ?? ','}`);
      start += seconds;
    } else if (line) {
      out.push(line);
      if (!line.startsWith('#') && start >= durationSeconds - .000001) exhausted = true;
    }
  }
  return out.join('\n') + '\n#EXT-X-ENDLIST\n';
}

/** API-ticket layer uses this to replace every URI, including EXT-X-MAP/KEY/MEDIA tags. */
export function rewriteManifest(text, mapResource) {
  return text.split(/\r?\n/).map(line => line.startsWith('#')
    ? line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${mapResource(uri)}"`)
    : line.trim() ? mapResource(line.trim()) : line).join('\n');
}
