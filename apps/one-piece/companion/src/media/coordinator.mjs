import { MediaCache } from './cache.mjs';
import { JellyfinClient } from './jellyfin.mjs';
import { lookupEpisode, nextEpisode } from '../sources/archive.mjs';
import { MediaError, safeProgress } from './errors.mjs';
import { randomUUID } from 'node:crypto';

const SESSION_ID = /^[a-zA-Z0-9_-]{1,96}$/;

export class MediaCoordinator {
  constructor({ catalog, cache, engine, maxSessions = 3, monitorMs = 1000, idleMs = 2 * 3600000,
    onEmergencyStop = async () => {}, autoPrefetch = true, transitionGraceMs = 30000, defaultMode = 'compatible-h264', clock = () => Date.now() } = {}) {
    if (!catalog?.episodes || !cache || !engine || maxSessions < 1 || maxSessions > 3) throw new Error('Catalogue, cache, engine, and at most three sessions are required');
    if (typeof clock !== 'function') throw new Error('A maintenance clock is required');
    if (!engine.verifiedModes?.has(defaultMode)) throw new Error('Default playback mode must be explicitly verified');
    Object.assign(this, { catalog, cache, engine, maxSessions, monitorMs, idleMs, onEmergencyStop, autoPrefetch, transitionGraceMs, defaultMode, clock });
    this.sessions = new Map(); this.timer = null; this.maintaining = null; this.generation = 0; this.warmTasks = new Map();
    this.lastCacheSweep = null; this.maintenanceAutomatic = false;
  }

  async initialize(options = {}) {
    await this.engine.recoverPreparedJobs?.(); // Verify/stop hard-kill orphans BEFORE deleting their staging files.
    await this.cache.initialize();
    const engine = await this.engine.configure(options);
    await this.cache.maintain();
    this.lastCacheSweep = this.clock();
    if (this.monitorMs > 0) { this.timer = setInterval(() => this.maintain({ automatic: true }).catch(() => {}), this.monitorMs); this.timer.unref?.(); }
    return { engine, cache: await this.cache.usage() };
  }

  original(episodeNumber) {
    const row = lookupEpisode(this.catalog, episodeNumber);
    if (row.availability !== 'listed') throw new MediaError(row.availability === 'missing' ? 'EPISODE_MISSING' : 'COLLECTION_ENDED',
      row.availability === 'missing' ? `Episode ${episodeNumber} is missing from these collections` : 'These collections end at episode 1085', { status: 404 });
    const originals = row.candidates.filter(c => c.role === 'original' && c.container === 'mkv' && c.checksums?.md5);
    if (!originals.length) throw new MediaError('NO_VERIFIED_ORIGINAL', 'This episode has no original with a usable integrity check', { status: 422 });
    return { row, candidate: originals[0] };
  }

  snapshot(sessionId) {
    const s = this.sessions.get(sessionId); if (!s) return null;
    return { sessionId, profileId: s.profileId, episodeNumber: s.episodeNumber, state: s.state,
      progress: s.progress ?? null, next: s.next ?? null, error: s.error ? { code: s.error.code ?? 'PREPARATION_FAILED', message: s.error.message } : null,
      playback: s.descriptor ?? null };
  }

  async openSession({ sessionId, profileId, episodeNumber, mode = this.defaultMode, audioIndex, audioLanguage, takeover = false, signal, onProgress } = {}) {
    if (!SESSION_ID.test(sessionId ?? '') || typeof profileId !== 'string' || !profileId || profileId.length > 160) throw new MediaError('INVALID_SESSION', 'A valid session and family profile are required');
    const { row, candidate } = this.original(episodeNumber);
    if (!this.engine.verifiedModes?.has(mode)) throw new MediaError('UNVERIFIED_MODE', 'That delivery mode has not passed this installation’s device checks', { status: 422 });
    const existing = this.sessions.get(sessionId);
    if (existing) {
      if (existing.profileId !== profileId) throw new MediaError('SESSION_OWNER', 'Session belongs to another family profile', { status: 403 });
      if (!['error', 'storage-paused'].includes(existing.state) && existing.episodeNumber === episodeNumber && existing.mode === mode && existing.audioIndex === audioIndex && existing.audioLanguage===audioLanguage) return existing.promise;
      if (existing.state === 'ready') return this.switchEpisode(sessionId, episodeNumber, { explicitSelection: true, mode, audioIndex, audioLanguage, signal, onProgress });
      await this.closeSession(sessionId);
    }
    const sameProfile = [...this.sessions.values()].filter(s => s.profileId === profileId);
    if (sameProfile.length && !takeover) throw new MediaError('PROFILE_IN_USE', 'This profile is already watching on another device; explicit takeover is required', { status: 409 });
    if (takeover) for (const s of sameProfile) await this.closeSession(s.id);
    if (this.sessions.size >= this.maxSessions) throw new MediaError('SESSION_LIMIT', 'Three family viewing sessions are already active', { status: 409 });
    const session = this.newRecord({ sessionId, profileId, episodeNumber, mode, audioIndex, audioLanguage, row, candidate, signal, onProgress });
    this.sessions.set(sessionId, session);
    session.promise = this.prepareCurrent(session).catch(async error => { session.state = 'error'; session.error = error;
      await this.releaseContext(session, session.engineKey);
      this.cache.releaseOwner(session.currentOwner); this.cache.releaseOwner(session.nextOwner); this.cache.releaseEngine(session.engineKey); throw error; });
    return session.promise;
  }

  newRecord({ sessionId, profileId, episodeNumber, mode, audioIndex, audioLanguage, row, candidate, signal, onProgress, contexts = new Map() }) {
    const controller = new AbortController(), engineKey = `${sessionId}-g${++this.generation}`;
    return { id: sessionId, profileId, episodeNumber, mode, audioIndex, audioLanguage, row, candidate, controller, engineKey, contexts,
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      state: 'preparing', lastAccess: this.clock(), currentOwner: `${engineKey}:current`, nextOwner: `${engineKey}:next`, onProgress };
  }

  async switchEpisode(sessionId, episodeNumber, { explicitSelection = false, mode, audioIndex, audioLanguage, signal, onProgress } = {}) {
    const previous = this.sessions.get(sessionId);
    if (!previous) throw new MediaError('SESSION_GONE', 'Viewing session has ended', { status: 410 });
    if (previous.switchingTarget === episodeNumber) return previous.promise;
    if (previous.state !== 'ready') throw new MediaError('TRANSITION_BUSY', 'Current episode preparation must finish before switching', { status: 409 });
    if (!explicitSelection && episodeNumber !== previous.episodeNumber + 1) throw new MediaError('TRANSITION_ORDER', 'Automatic playback only advances to the immediately following episode', { status: 409 });
    const { row, candidate } = this.original(episodeNumber); // Missing 590 never becomes an implicit skip.
    mode ??= previous.mode;
    audioLanguage ??= previous.descriptor?.selected?.audioLanguage;
    if (!this.engine.verifiedModes?.has(mode)) throw new MediaError('UNVERIFIED_MODE', 'Playback mode has not passed device checks', { status: 422 });
    if (previous.queued && previous.queued.episodeNumber === episodeNumber && previous.queued.mode === mode && previous.queued.audioIndex === audioIndex && previous.queued.audioLanguage===audioLanguage) {
      const queued = previous.queued;
      const descriptor = await queued.promise;
      if (this.sessions.get(sessionId) !== previous || previous.queued !== queued) throw new MediaError('SESSION_GONE', 'Viewing session changed while the queue was being prepared', { status: 410 });
      previous.queued = null;
      queued.onProgress = onProgress ?? previous.onProgress; queued.lastAccess = this.clock(); queued.next = null;
      this.sessions.set(sessionId, queued);
      const old = queued.contexts.get(previous.engineKey); if (old) old.expiresAt = this.clock() + this.transitionGraceMs;
      previous.controller.abort(new MediaError('CANCELLED', 'Queued episode took over the viewing session'));
      this.cache.releaseOwner(previous.nextOwner);
      if (this.autoPrefetch) this.prefetchNext(queued);
      return descriptor;
    }
    await this.discardQueued(previous);
    const session = this.newRecord({ sessionId, profileId: previous.profileId, episodeNumber, mode, audioIndex, audioLanguage, row, candidate,
      signal, onProgress: onProgress ?? previous.onProgress, contexts: new Map(previous.contexts) });
    session.switchingTarget = episodeNumber; this.sessions.set(sessionId, session);
    session.promise = this.prepareCurrent(session).then(descriptor => {
      const old = session.contexts.get(previous.engineKey);
      if (old) old.expiresAt = this.clock() + this.transitionGraceMs;
      previous.controller.abort(new MediaError('CANCELLED', 'Next episode took over the viewing session'));
      this.cache.releaseOwner(previous.nextOwner);
      delete session.switchingTarget;
      return descriptor;
    }).catch(async error => {
      await this.releaseContext(session, session.engineKey);
      session.controller.abort(error); this.cache.releaseOwner(session.currentOwner); this.cache.releaseOwner(session.nextOwner);
      this.cache.releaseEngine(session.engineKey);
      if (this.sessions.get(sessionId) === session) this.sessions.set(sessionId, previous);
      throw error;
    });
    return session.promise;
  }

  async releaseContext(session, key, positionSeconds = 0) {
    const context = session.contexts.get(key);
    await this.engine.stopSession(key, positionSeconds);
    this.cache.releaseEngine(key);
    if (context) this.cache.releaseOwner(context.owner);
    session.contexts.delete(key);
  }

  /** Explicit receiver queue preparation, after current ready. Adds no viewing lease. */
  async prepareNextPlayback(sessionId, { signal } = {}) {
    const current = this.sessions.get(sessionId);
    if (!current || current.state !== 'ready') throw new MediaError('SESSION_NOT_READY', 'Current playback must be ready before preparing the receiver queue', { status: 409 });
    if (current.queued) return current.queued.promise;
    const { row, candidate } = this.original(current.episodeNumber + 1);
    const queued = this.newRecord({ sessionId, profileId: current.profileId, episodeNumber: row.episodeNumber,
      mode: current.mode, audioLanguage:current.descriptor?.selected?.audioLanguage, row, candidate, signal, contexts: current.contexts,
      onProgress: () => {
        current.next = { episodeNumber: row.episodeNumber, availability: 'listed', state: queued.state,
          progress: queued.progress ?? null, subtitlesReady: queued.state === 'ready', playbackReady: queued.state === 'ready' };
        safeProgress(current.onProgress, this.snapshot(sessionId));
      } });
    current.queued = queued;
    queued.promise = this.prepareCurrent(queued, { preload: true }).then(async descriptor => {
      if (this.sessions.get(sessionId) !== current || current.queued !== queued || queued.signal.aborted) throw new MediaError('CANCELLED', 'Receiver queue preparation ended');
      await this.engine.reportProgress(queued.engineKey, { positionSeconds: 0, isPaused: true, playbackRate: 1 });
      return descriptor;
    }).catch(async error => {
      await this.releaseContext(queued, queued.engineKey); this.cache.releaseOwner(queued.currentOwner); this.cache.releaseOwner(queued.nextOwner);
      queued.controller.abort(error);
      if (current.queued === queued) { current.queued = null; current.next = { episodeNumber: row.episodeNumber, availability: 'listed',
        state: error.code === 'CACHE_PRESSURE' ? 'waiting-for-space' : 'error', error: error.code ?? 'PREPARATION_FAILED' }; }
      throw error;
    });
    return queued.promise;
  }

  preparedNext(sessionId) { const queued = this.sessions.get(sessionId)?.queued; return queued?.state === 'ready' ? queued.descriptor : null; }

  async discardQueued(session) {
    const queued = session.queued; if (!queued) return;
    session.queued = null; queued.controller.abort(new MediaError('CANCELLED', 'Receiver queue ended'));
    await Promise.allSettled([queued.promise]);
    await this.releaseContext(queued, queued.engineKey); this.cache.releaseOwner(queued.currentOwner); this.cache.releaseOwner(queued.nextOwner);
  }

  async prepareEpisode(episodeNumber, { sessionId, signal, onProgress } = {}) {
    const session = this.sessions.get(sessionId);
    if (!session || ![session.episodeNumber, session.episodeNumber + 1].includes(episodeNumber)) throw new MediaError('PREPARATION_SCOPE', 'Only an admitted viewer’s current and next episode may be prepared', { status: 403 });
    const { candidate } = this.original(episodeNumber);
    return this.cache.prepare(candidate, { owner: episodeNumber === session.episodeNumber ? session.currentOwner : session.nextOwner,
      signal: signal ?? session.signal, onProgress });
  }

  async prepareCurrent(session, { preload = false } = {}) {
    if (session.mode === 'prepared-mp4') return this.preparePreparedCurrent(session, { preload });
    const entry = await this.cache.prepare(session.candidate, { owner: session.currentOwner, signal: session.signal,
      onProgress: progress => { session.state = progress.state; session.progress = progress; safeProgress(session.onProgress, this.snapshot(session.id)); } });
    session.state = 'inspecting'; safeProgress(session.onProgress, this.snapshot(session.id));
    // Small initial allowance covers embedded-caption/font preparation; expand using inspected duration before any HLS job.
    await this.cache.reserveEngine(session.engineKey, 64 * 1024 * 1024);
    const warmed = await this.warmTracks(entry);
    if (session.signal.aborted) throw session.signal.reason;
    const inspectedItem = warmed.item;
    const seconds = inspectedItem.MediaSources?.[0]?.RunTimeTicks / 10000000;
    if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 4 * 3600) throw new MediaError('ENGINE_DURATION', 'Episode duration could not be verified');
    // Full VOD at the constrained 10Mbps cap plus container/caption allowance, even if throttling/deletion stalls.
    const outputBudget = Math.ceil(Math.max(entry.candidate.bytes * 1.25, seconds * 10000000 / 8 * 1.2) + 64 * 1024 * 1024);
    await this.cache.reserveEngine(session.engineKey, outputBudget);
    const descriptor = await this.engine.openPlayback({ sessionId: session.engineKey, entry, mode: session.mode,
        audioIndex: session.audioIndex, audioLanguage:session.audioLanguage, signal: session.signal, inspectedItem });
    session.state = 'preparing-subtitles'; safeProgress(session.onProgress, this.snapshot(session.id));
    session.contexts.set(session.engineKey, { owner: session.currentOwner, expiresAt: null, episodeNumber: session.episodeNumber });
    const subtitles = await this.engine.getPlaybackResource(session.engineKey, descriptor.subtitlePath, { signal: session.signal });
    const captionText = await new Response(subtitles.body).text();
    if (!captionText.startsWith('WEBVTT') || !captionText.includes('-->')) throw new MediaError('SUBTITLES_UNAVAILABLE', 'Full English captions were not ready; retry episode preparation', { status: 503, retryable: true });
    session.state = 'preparing-playback'; safeProgress(session.onProgress, this.snapshot(session.id));
    const firstSegment = await this.warmFirstSegment(session.engineKey, descriptor.masterPath, session.signal);
    session.descriptor = { ...descriptor, sessionId: session.id, episodeId: session.row.id, episodeNumber: session.episodeNumber,
      sourceId: session.candidate.id, subtitleBytes: Buffer.byteLength(captionText), preparation: firstSegment };
    session.state = 'ready'; session.progress = { state: 'ready', receivedBytes: entry.candidate.bytes, totalBytes: entry.candidate.bytes };
    safeProgress(session.onProgress, this.snapshot(session.id));
    if (this.autoPrefetch && !preload) this.prefetchNext(session);
    return session.descriptor;
  }

  async preparePreparedCurrent(session, { preload = false } = {}) {
    let record = await this.cache.findRendition(session.candidate, { owner: session.currentOwner, audioIndex: session.audioIndex, audioLanguage: session.audioLanguage });
    let entry, presentation;
    if (record) {
      this.cache.pin(session.candidate.id, session.currentOwner); // Preserve its original too, when retained.
      presentation = record.presentation; entry = { candidate: session.candidate };
    } else {
      entry = await this.cache.prepare(session.candidate, { owner: session.currentOwner, signal: session.signal,
        onProgress: progress => { session.state = progress.state; session.progress = progress; safeProgress(session.onProgress, this.snapshot(session.id)); } });
      session.state = 'inspecting'; safeProgress(session.onProgress, this.snapshot(session.id));
      await this.cache.reserveEngine(session.engineKey, 64 * 1024 ** 2);
      try { presentation = await this.engine.inspectPresentation(entry, { audioIndex: session.audioIndex, audioLanguage: session.audioLanguage, signal: session.signal }); }
      finally { this.cache.releaseEngine(session.engineKey); }
      record = await this.cache.prepareRendition(presentation.recipe, { owner: session.currentOwner, signal: session.signal,
        onProgress: progress => { session.state = progress.state; session.progress = progress; safeProgress(session.onProgress, this.snapshot(session.id)); },
        prepare: options => this.engine.prepareRendition({ ...options, entry, presentation, onCleanupFailure: this.onEmergencyStop }) });
    }
    if (session.signal.aborted) throw session.signal.reason;
    session.state = 'preparing-playback'; safeProgress(session.onProgress, this.snapshot(session.id));
    const descriptor = await this.engine.openPreparedPlayback({ sessionId: session.engineKey, entry, rendition: record, presentation, signal: session.signal });
    session.contexts.set(session.engineKey, { owner: session.currentOwner, expiresAt: null, episodeNumber: session.episodeNumber, renditionId: record.id });
    const first = await this.engine.getPlaybackResource(session.engineKey, descriptor.masterPath, { range: `bytes=0-${Math.min(65535, record.video.bytes - 1)}`, signal: session.signal });
    const firstBytes = (await new Response(first.body).arrayBuffer()).byteLength;
    if (!firstBytes || first.status !== 206) throw new MediaError('PLAYBACK_EMPTY', 'Complete prepared video did not pass its first range check', { status: 503 });
    session.descriptor = { ...descriptor, sessionId: session.id, episodeId: session.row.id, episodeNumber: session.episodeNumber, sourceId: session.candidate.id,
      subtitleBytes: record.captions.bytes, preparation: { completeFileReady: true, firstRangeBytes: firstBytes, renditionId: record.id } };
    session.state = 'ready'; session.progress = { state: 'ready', receivedBytes: session.candidate.bytes, totalBytes: session.candidate.bytes };
    safeProgress(session.onProgress, this.snapshot(session.id)); if (this.autoPrefetch && !preload) this.prefetchNext(session);
    return session.descriptor;
  }

  async warmFirstSegment(engineKey, masterPath, signal) {
    const began = performance.now(); let resource = masterPath;
    for (let level = 0; level < 4; level++) {
      const response = await this.engine.getPlaybackResource(engineKey, resource, { signal });
      if (response.manifestText) {
        for (const match of response.manifestText.matchAll(/#EXT-X-MAP:[^\n]*URI="([^"]+)"/g)) {
          const init = await this.engine.getPlaybackResource(engineKey, match[1], { signal }); await new Response(init.body).arrayBuffer();
        }
        resource = response.manifestText.split('\n').find(line => line.trim() && !line.startsWith('#'))?.trim();
        if (!resource) throw new MediaError('ENGINE_MANIFEST', 'Prepared playlist contains no media');
      } else {
        const bytes = (await new Response(response.body).arrayBuffer()).byteLength;
        if (!bytes) throw new MediaError('PLAYBACK_EMPTY', 'The first prepared video segment was empty');
        return { firstSegmentBytes: bytes, firstSegmentMs: Math.round(performance.now() - began),
          note: 'Visible preparation includes selected audio, full-English WebVTT, and real first-segment availability; rendering is a separate check.' };
      }
    }
    throw new MediaError('ENGINE_MANIFEST', 'Prepared playlist nesting exceeded its limit');
  }

  async warmTracks(entry) {
    const existing = this.warmTasks.get(entry.candidate.id); if (existing) return existing.promise;
    const controller = new AbortController(), key = `prep-${randomUUID()}`;
    const task = { controller, promise: null };
    this.cache.pin(entry.candidate.id, key);
    task.promise = (async () => {
      try {
        await this.cache.reserveEngine(key, 64 * 1024 * 1024);
        const item = await this.engine.ensureFile(entry.path, { signal: controller.signal });
        const playback = await this.engine.openPlayback({ sessionId: key, entry, mode: 'compatible-h264', signal: controller.signal, inspectedItem: item });
        const captions = await this.engine.getPlaybackResource(key, playback.subtitlePath, { signal: controller.signal });
        const text = await new Response(captions.body).text();
        if (!text.startsWith('WEBVTT') || !text.includes('-->')) throw new MediaError('SUBTITLES_UNAVAILABLE', 'Full English captions could not be prepared', { status: 503, retryable: true });
        return { item, captionBytes: Buffer.byteLength(text) };
      } finally {
        await this.engine.stopSession(key); this.cache.releaseEngine(key); this.cache.releaseOwner(key);
        if (this.warmTasks.get(entry.candidate.id) === task) this.warmTasks.delete(entry.candidate.id);
      }
    })();
    this.warmTasks.set(entry.candidate.id, task);
    return task.promise;
  }

  prefetchNext(session) {
    const row = nextEpisode(this.catalog, session.episodeNumber);
    session.next = { episodeNumber: row.episodeNumber, availability: row.availability, state: row.availability === 'listed' ? 'queued' : 'blocked' };
    if (row.availability !== 'listed') return; // 589 -> missing 590 never silently prefetches 591.
    if (session.mode === 'prepared-mp4') {
      session.nextPromise = this.prepareNextPlayback(session.id).catch(error => { if (!session.queued) session.next = { ...session.next,
        state: error.code === 'CACHE_PRESSURE' ? 'waiting-for-space' : 'error', error: error.code ?? 'PREPARATION_FAILED' }; });
      return;
    }
    session.nextPromise = this.prepareEpisode(row.episodeNumber, { sessionId: session.id, signal: session.signal,
      onProgress: progress => { if (!session.queued) session.next = { ...session.next, state: progress.state, receivedBytes: progress.receivedBytes, totalBytes: progress.totalBytes }; } })
      .then(async entry => { if (!session.queued) session.next.state = 'preparing-subtitles'; await this.warmTracks(entry);
        if (!session.queued) session.next.state = 'cached'; session.next.subtitlesReady = true; })
      .catch(error => { if (!session.queued) { session.next.state = error.code === 'CACHE_PRESSURE' ? 'waiting-for-space' : 'error'; session.next.error = error.code ?? 'PREPARATION_FAILED'; } });
  }

  async getPlaybackResource(sessionId, relative, options) {
    const session = this.sessions.get(sessionId);
    if (!session || ['error', 'storage-paused'].includes(session.state)) throw new MediaError('SESSION_NOT_READY', 'Episode preparation is not complete', { status: 409 });
    session.lastAccess = this.clock();
    for (const [key, context] of session.contexts) {
      if (context.expiresAt !== null && context.expiresAt <= this.clock()) continue;
      if (this.engine.ownsResource(key, relative)) return this.engine.getPlaybackResource(key, relative, options);
    }
    throw new MediaError('MEDIA_RESOURCE', 'Resource is not authorized for this viewing session', { status: 403 });
  }

  async reportProgress(sessionId, progress) {
    const session = this.sessions.get(sessionId); if (!session) throw new MediaError('SESSION_GONE', 'Playback session has ended', { status: 410 });
    session.lastAccess = this.clock();
    if (progress.episodeNumber !== undefined && progress.episodeNumber !== session.episodeNumber) throw new MediaError('STALE_PROGRESS', 'Progress belongs to the previous episode', { status: 409 });
    return this.engine.reportProgress(session.engineKey, progress);
  }

  async closeSession(sessionId, positionSeconds = 0) {
    const session = this.sessions.get(sessionId); if (!session) return;
    this.sessions.delete(sessionId); session.controller.abort(new MediaError('CANCELLED', 'Viewing session ended'));
    await this.discardQueued(session);
    for (const key of [...session.contexts.keys()]) await this.releaseContext(session, key, positionSeconds);
    await Promise.allSettled([session.promise, session.nextPromise].filter(Boolean));
    this.cache.releaseOwner(session.currentOwner); this.cache.releaseOwner(session.nextOwner); this.cache.releaseEngine(session.engineKey);
  }

  async maintain({ automatic = false } = {}) {
    if (this.maintaining) {
      // An explicit pressure check must not inherit a timer's skipped sweep.
      if (!automatic && this.maintenanceAutomatic) { await this.maintaining; return this.maintain(); }
      return this.maintaining;
    }
    this.maintenanceAutomatic = automatic;
    this.maintaining = (async () => {
      const now = this.clock();
      for (const s of [...this.sessions.values()]) if (now - s.lastAccess > this.idleMs) await this.closeSession(s.id);
      for (const s of this.sessions.values()) for (const [key, context] of [...s.contexts]) {
        if (context.expiresAt !== null && context.expiresAt <= now) await this.releaseContext(s, key);
      }
      // Ready MP4s do not grow. Keep cheap expiry cleanup frequent, but scan the
      // filesystem only while producers can write, or once a minute for viewers.
      // Every foreground admission still performs its own full capacity check.
      const producing = [this.cache.jobs, this.cache.renditionJobs, this.cache.preparedReservations, this.cache.engineBudgets, this.warmTasks]
        .some(jobs => jobs?.size > 0);
      if (automatic && !producing && (!this.sessions.size || this.lastCacheSweep !== null
          && now >= this.lastCacheSweep && now - this.lastCacheSweep < 60000)) return;
      this.lastCacheSweep = now;
      try { return await this.cache.maintain(); }
      catch (error) {
        if (error.code !== 'CACHE_PRESSURE') throw error;
        for (const job of this.cache.renditionJobs.values()) job.controller.abort(error);
        for (const task of this.warmTasks.values()) task.controller.abort(error);
        for (const s of this.sessions.values()) { s.state = 'storage-paused'; s.error = error;
          await this.discardQueued(s);
          s.controller.abort(error); for (const key of [...s.contexts.keys()]) await this.releaseContext(s, key);
          this.cache.releaseOwner(s.currentOwner); this.cache.releaseOwner(s.nextOwner); safeProgress(s.onProgress, this.snapshot(s.id)); }
        // Runtime owner must implement this hook as verified cancellation of this private engine's jobs.
        await this.onEmergencyStop(error);
        await Promise.allSettled([...this.cache.renditionJobs.values()].map(job => job.promise));
        await this.cache.purgeIdleEngineMedia();
        throw error;
      }
    })().finally(() => { this.maintaining = null; this.maintenanceAutomatic = false; });
    return this.maintaining;
  }

  async shutdown() {
    if (this.timer) clearInterval(this.timer);
    for (const task of this.warmTasks.values()) task.controller.abort(new MediaError('CANCELLED', 'Companion stopped'));
    for (const id of [...this.sessions.keys()]) await this.closeSession(id);
    await Promise.allSettled([...this.warmTasks.values()].map(task => task.promise));
    await this.cache.shutdown();
  }
}

export function createMediaCoordinator({ catalog, cacheRoot, managedRoots, extraAccountingRoots, importRoots,
  limitBytes, minimumFreeBytes, downloader, jellyfin = {}, verifiedModes, onEmergencyStop, ...options } = {}) {
  if (typeof onEmergencyStop !== 'function') throw new Error('The runtime owner must supply verified emergency cancellation for its private engine jobs');
  const cache = new MediaCache({ cacheRoot, managedRoots, extraAccountingRoots, importRoots, limitBytes, minimumFreeBytes, downloader });
  const engine = new JellyfinClient({ ...jellyfin, originalRoot: cache.originalRoot, preparedRoot: cache.renditionRoot, transcodeRoot: managedRoots?.transcodes, verifiedModes });
  return new MediaCoordinator({ catalog, cache, engine, onEmergencyStop, ...options });
}
