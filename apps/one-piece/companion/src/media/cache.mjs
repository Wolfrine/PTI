import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, readdir, lstat, statfs, rm, link, copyFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { ArchiveDownloader, validateOriginal } from './download.mjs';
import { MediaError, abortReason, safeProgress } from './errors.mjs';
import { renditionId, validateRenditionRecipe, managedRegularFile, canonicalCaptionHash } from './prepared.mjs';

export const CACHE_LIMIT_BYTES = 20 * 1024 ** 3;
export const MINIMUM_FREE_BYTES = 2 * 1024 ** 3;

export async function hashFile(file, algorithm = 'md5') {
  const digest = createHash(algorithm);
  for await (const bytes of createReadStream(file)) digest.update(bytes);
  return digest.digest('hex');
}

export async function scanFiles(root) {
  const files = [];
  const rootStat = await lstat(root).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
  if (!rootStat) return files;
  if (rootStat.isSymbolicLink()) throw new MediaError('CACHE_LINK', 'Managed media roots cannot be links');
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true }).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error))) {
      const file = path.join(dir, entry.name);
      const stats = await lstat(file).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (!stats) continue;
      if (stats.isSymbolicLink()) throw new MediaError('CACHE_LINK', 'Managed media directories cannot contain links');
      if (stats.isDirectory()) await walk(file);
      else if (stats.isFile()) files.push({ path: file, bytes: stats.size, mtimeMs: stats.mtimeMs });
    }
  }
  await walk(root);
  return files;
}

function uniqueRoots(values) {
  const roots = [...new Set(values.filter(Boolean).map(p => path.resolve(p)))].sort((a, b) => a.length - b.length);
  return roots.filter((root, i) => !roots.slice(0, i).some(parent => root === parent || !path.relative(parent, root).startsWith('..') && !path.isAbsolute(path.relative(parent, root))));
}

class Semaphore {
  active = 0; waiting = [];
  constructor(max) { this.max = max; }
  async run(fn, signal) {
    abortReason(signal);
    if (this.active >= this.max) await new Promise((resolve, reject) => {
      const entry = { resolve: () => { signal?.removeEventListener('abort', cancel); resolve(); }, reject };
      const cancel = () => { this.waiting = this.waiting.filter(item => item !== entry); reject(signal.reason); };
      this.waiting.push(entry); signal?.addEventListener('abort', cancel, { once: true });
    });
    else this.active++;
    try { abortReason(signal); return await fn(); }
    finally { this.active--; const next = this.waiting.shift(); if (next) { this.active++; next.resolve(); } }
  }
}

/** Filesystem admission, finite shared preparation, and current/next ownership. No HTTP server. */
export class MediaCache {
  constructor({ cacheRoot, managedRoots = {}, extraAccountingRoots = [], limitBytes = CACHE_LIMIT_BYTES,
    minimumFreeBytes = MINIMUM_FREE_BYTES, downloader = new ArchiveDownloader(), concurrency = 2,
    diskFree = async root => { const fs = await statfs(root); return Number(fs.bavail) * Number(fs.bsize); }, importRoots = [] } = {}) {
    if (!cacheRoot || !Number.isSafeInteger(limitBytes) || limitBytes <= 0 || limitBytes > CACHE_LIMIT_BYTES) throw new Error('A media root and quota <=20 GiB are required');
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2) throw new Error('Upstream concurrency must be 1..2');
    this.root = path.resolve(cacheRoot); this.originalRoot = path.join(this.root, 'originals');
    this.renditionRoot = path.join(this.root, 'renditions'); this.preparedWorkRoot = path.join(this.root, 'prepared-work');
    this.managedRoots = uniqueRoots(Object.values(managedRoots));
    this.accountingRoots = uniqueRoots([this.root, ...this.managedRoots, ...extraAccountingRoots]);
    this.importRoots = importRoots.map(p => path.resolve(p));
    Object.assign(this, { limitBytes, minimumFreeBytes, downloader, diskFree });
    this.entries = new Map(); this.jobs = new Map(); this.pins = new Map(); this.engineBudgets = new Map();
    this.renditions = new Map(); this.renditionJobs = new Map(); this.renditionPins = new Map(); this.renditionGate = new Semaphore(1);
    this.preparedReservations = new Map();
    this.gate = new Semaphore(concurrency); this.lock = Promise.resolve();
  }

  locked(fn) { const result = this.lock.then(fn, fn); this.lock = result.catch(() => {}); return result; }
  entryPath(candidate) { validateOriginal(candidate); return path.join(this.originalRoot, candidate.id, `${candidate.checksums.md5.toLowerCase()}.mkv`); }
  async initialize() {
    for (const root of [this.originalRoot, this.renditionRoot, this.preparedWorkRoot]) await mkdir(root, { recursive: true });
    await scanFiles(this.renditionRoot); await scanFiles(this.preparedWorkRoot);
    for (const root of this.managedRoots) await mkdir(root, { recursive: true });
    const manifest = JSON.parse(await readFile(path.join(this.root, 'cache.json'), 'utf8').catch(error => error.code === 'ENOENT' ? '{"entries":[]}' : Promise.reject(error)));
    for (const entry of manifest.entries ?? []) {
      try {
        validateOriginal(entry.candidate);
        const file = this.entryPath(entry.candidate), stats = await lstat(file);
        if (stats.isFile() && !stats.isSymbolicLink() && stats.size === entry.candidate.bytes) {
          this.entries.set(entry.candidate.id, { ...entry, path: file, verifiedMtimeMs: entry.verifiedMtimeMs === stats.mtimeMs ? stats.mtimeMs : null });
        }
      } catch { /* Stale or malformed entries are never offered as playable. */ }
    }
    for (const record of manifest.renditions ?? []) {
      try {
        const id = renditionId(record.recipe); if (record.id !== id) continue;
        const paths = this.renditionPaths(id), video = await lstat(paths.video), captions = await lstat(paths.captions);
        if (!video.isFile() || video.isSymbolicLink() || !captions.isFile() || captions.isSymbolicLink()
          || video.size !== record.video.bytes || captions.size !== record.captions.bytes || !/^[a-f0-9]{64}$/.test(record.video.sha256)
          || !/^[a-f0-9]{64}$/.test(record.captions.sha256)) continue;
        this.renditions.set(id, { ...record, paths, verifiedVideoMtimeMs: record.verifiedVideoMtimeMs === video.mtimeMs ? video.mtimeMs : null,
          verifiedCaptionMtimeMs: record.verifiedCaptionMtimeMs === captions.mtimeMs ? captions.mtimeMs : null });
      } catch { /* Incomplete/untrusted renditions are repaired before use. */ }
    }
    // A process restart has no active leases. Remove only our exact unpublished
    // video/caption pair; unknown filenames are neither served nor deleted.
    for (const dir of await readdir(this.renditionRoot, { withFileTypes: true })) if (dir.isDirectory() && /^[a-f0-9]{64}$/.test(dir.name) && !this.renditions.has(dir.name)) await this.removeRendition(dir.name);
    // A previous process owns no current jobs; incomplete downloads are never playable.
    for (const file of await scanFiles(this.originalRoot)) if (/\.part-[a-f0-9-]+$/.test(file.path)) await rm(file.path, { force: true });
    // Only the cache owns this finite scratch root. No completed rendition is published here.
    for (const file of await scanFiles(this.preparedWorkRoot)) if (/^[a-f0-9-]+\.(?:progressive|video|captions)\.part(?:\.mp4)?$/.test(path.basename(file.path))) await rm(file.path);
    await this.persist();
    return this.usage();
  }

  async persist() {
    const target = path.join(this.root, 'cache.json'), temporary = target + '.tmp';
    await writeFile(temporary, JSON.stringify({ version: 2, entries: [...this.entries.values()].map(({ path: ignored, ...entry }) => entry),
      renditions: [...this.renditions.values()].map(({ paths: ignored, ...record }) => record) }));
    await rename(temporary, target);
  }

  pin(sourceId, owner) {
    if (typeof owner !== 'string' || !owner || owner.length > 160) throw new MediaError('INVALID_OWNER', 'A session owner is required');
    const owners = this.pins.get(sourceId) ?? new Map(); owners.set(owner, (owners.get(owner) ?? 0) + 1); this.pins.set(sourceId, owners);
  }
  releaseOwner(owner) { for (const map of [this.pins, this.renditionPins]) for (const [id, owners] of map) { owners.delete(owner); if (!owners.size) map.get(id) === owners && map.delete(id); } }
  releasePin(sourceId, owner) { const owners = this.pins.get(sourceId); if (!owners) return;
    const count = owners.get(owner) ?? 0; if (count <= 1) owners.delete(owner); else owners.set(owner, count - 1);
    if (!owners.size) this.pins.delete(sourceId); }

  async usage() {
    const all = (await Promise.all(this.accountingRoots.map(scanFiles))).flat();
    const engine = (await Promise.all(this.managedRoots.map(scanFiles))).flat().reduce((n, f) => n + f.bytes, 0);
    const usedBytes = all.reduce((n, f) => n + f.bytes, 0);
    const downloadsRemaining = [...this.jobs.values()].filter(j => j.admitted).reduce((n, j) => n + Math.max(0, j.candidate.bytes - j.receivedBytes), 0);
    const engineRemaining = Math.max(0, [...this.engineBudgets.values()].reduce((n, b) => n + b, 0) - engine);
    // Prepared jobs reserve their complete three-copy peak independently of HLS budgets.
    // Their engine/raw/final files can be written outside one managed engine root; retaining
    // the reservation until adoption deliberately overcounts rather than hides a copy.
    let preparedRemaining = 0;
    for (const reservation of this.preparedReservations.values()) {
      const owned = await Promise.all(reservation.paths.map(file => lstat(file).catch(() => null)));
      preparedRemaining += Math.max(0, reservation.bytes - owned.reduce((n, stats) => n + (stats?.isFile() && !stats.isSymbolicLink() ? stats.size : 0), 0));
    }
    return { usedBytes, engineBytes: engine, reservedBytes: downloadsRemaining + engineRemaining + preparedRemaining,
      projectedBytes: usedBytes + downloadsRemaining + engineRemaining + preparedRemaining, limitBytes: this.limitBytes,
      freeBytes: await this.diskFree(this.root), minimumFreeBytes: this.minimumFreeBytes,
      pinnedSources: this.pins.size, pinnedRenditions: this.renditionPins.size, activePreparations: this.jobs.size + this.renditionJobs.size };
  }

  async ensureCapacity(additionalBytes = 0) {
    let usage = await this.usage();
    const fits = () => usage.projectedBytes + additionalBytes <= this.limitBytes
      && usage.freeBytes - usage.reservedBytes - additionalBytes >= this.minimumFreeBytes;
    for (const record of [...this.renditions.values()].sort((a, b) => a.lastAccess - b.lastAccess)) {
      if (fits()) break;
      if (this.renditionPins.get(record.id)?.size || this.renditionJobs.has(record.id)) continue;
      await this.removeRendition(record.id); usage = await this.usage();
    }
    for (const entry of [...this.entries.values()].sort((a, b) => a.lastAccess - b.lastAccess)) {
      if (fits()) break;
      if (this.pins.get(entry.candidate.id)?.size || this.jobs.has(entry.candidate.id)) continue;
      await rm(entry.path, { force: true }); this.entries.delete(entry.candidate.id);
      usage = await this.usage();
    }
    await this.persist();
    if (!fits()) throw new MediaError('CACHE_PRESSURE', 'The PC needs room before another episode can be prepared', { status: 507, retryable: true });
    return usage;
  }

  async reserveEngine(owner, bytes) {
    if (!Number.isSafeInteger(bytes) || bytes < 0) throw new Error('Invalid engine reservation');
    return this.locked(async () => {
      const old = this.engineBudgets.get(owner) ?? 0;
      this.engineBudgets.set(owner, bytes);
      try { return await this.ensureCapacity(); }
      catch (error) { if (old) this.engineBudgets.set(owner, old); else this.engineBudgets.delete(owner); throw error; }
    });
  }
  releaseEngine(owner) { this.engineBudgets.delete(owner); }

  renditionPaths(id) {
    if (!/^[a-f0-9]{64}$/.test(id ?? '')) throw new MediaError('RENDITION_ID', 'Invalid prepared rendition identity');
    return { directory: path.join(this.renditionRoot, id), video: path.join(this.renditionRoot, id, 'video.mp4'), captions: path.join(this.renditionRoot, id, 'video.en.vtt') };
  }
  pinRendition(id, owner) {
    if (!/^[a-f0-9]{64}$/.test(id ?? '') || typeof owner !== 'string' || !owner || owner.length > 160) throw new MediaError('INVALID_OWNER', 'Prepared rendition owner is invalid');
    const owners = this.renditionPins.get(id) ?? new Map(); owners.set(owner, (owners.get(owner) ?? 0) + 1); this.renditionPins.set(id, owners);
  }
  releaseRenditionPin(id, owner) { const owners = this.renditionPins.get(id); if (!owners) return;
    const count = owners.get(owner) ?? 0; if (count <= 1) owners.delete(owner); else owners.set(owner, count - 1); if (!owners.size) this.renditionPins.delete(id); }
  async removeRendition(id) {
    const paths = this.renditionPaths(id);
    for (const file of [paths.video, paths.captions]) { const stats = await lstat(file).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (!stats) continue; await managedRegularFile(file, this.renditionRoot); await rm(file); }
    this.renditions.delete(id);
  }
  async readyRendition(recipe) {
    const id = renditionId(recipe), record = this.renditions.get(id); if (!record) return null;
    const paths = this.renditionPaths(id), video = await lstat(paths.video).catch(() => null), captions = await lstat(paths.captions).catch(() => null);
    if (video?.isSymbolicLink() || captions?.isSymbolicLink() || video && !video.isFile() || captions && !captions.isFile()) throw new MediaError('CACHE_LINK', 'Prepared cache contains a non-regular file');
    if (video) await managedRegularFile(paths.video, this.renditionRoot); if (captions) await managedRegularFile(paths.captions, this.renditionRoot);
    const changed = !video || !captions || video.size !== record.video.bytes || captions.size !== record.captions.bytes
      || record.verifiedVideoMtimeMs !== video.mtimeMs && await hashFile(paths.video, 'sha256') !== record.video.sha256
      || record.verifiedCaptionMtimeMs !== captions.mtimeMs && await hashFile(paths.captions, 'sha256') !== record.captions.sha256;
    if (changed) {
      if (this.renditionPins.get(id)?.size > 1) throw new MediaError('CACHE_INTEGRITY', 'A shared prepared episode changed; end its playback before repairing it', { status: 409, retryable: true });
      await this.removeRendition(id); await this.persist(); return null;
    }
    record.verifiedVideoMtimeMs = video.mtimeMs; record.verifiedCaptionMtimeMs = captions.mtimeMs; record.lastAccess = Date.now();
    return { ...record, paths };
  }

  async findRendition(candidate, { owner, audioIndex, audioLanguage } = {}) {
    validateOriginal(candidate);
    const languages = ['en', 'eng'].includes(audioLanguage) ? ['en', 'eng'] : ['ja', 'jpn'];
    return this.locked(async () => {
      for (const record of [...this.renditions.values()].sort((a, b) => b.lastAccess - a.lastAccess)) {
        if (record.recipe.original.id !== candidate.id || record.recipe.original.md5 !== candidate.checksums.md5.toLowerCase()
          || (audioIndex === undefined ? !languages.includes(record.recipe.audio.language) : record.recipe.audio.index !== audioIndex) || !record.presentation) continue;
        this.pinRendition(record.id, owner);
        try { const ready = await this.readyRendition(record.recipe); if (ready) { await this.persist(); return ready; } }
        catch (error) { this.releaseRenditionPin(record.id, owner); throw error; }
        this.releaseRenditionPin(record.id, owner);
      }
      return null;
    });
  }

  /** One finite CPU/GPU preparation is shared across profiles; the last cancelled consumer stops it. */
  async prepareRendition(recipe, { owner, signal, onProgress, prepare } = {}) {
    validateRenditionRecipe(recipe); abortReason(signal); if (typeof prepare !== 'function') throw new Error('Prepared media producer is required');
    const id = renditionId(recipe); this.pinRendition(id, owner); let job;
    try {
      const stale = this.renditionJobs.get(id); if (stale?.controller.signal.aborted) await stale.promise;
      const found = await this.locked(async () => {
        const record = await this.readyRendition(recipe); if (record) { await this.persist(); return { record }; }
        job = this.renditionJobs.get(id);
        if (job?.controller.signal.aborted) { this.renditionJobs.delete(id); job = null; }
        if (!job) { job = { id, recipe, prepare, controller: new AbortController(), waiters: new Set(), state: 'queued' }; this.renditionJobs.set(id, job); }
        return { job };
      });
      if (found.record) { safeProgress(onProgress, { state: 'cached', renditionId: id, receivedBytes: found.record.video.bytes, totalBytes: found.record.video.bytes }); return found.record; }
      job = found.job;
      return await new Promise((resolve, reject) => {
        const waiter = { owner, onProgress };
        const cancel = () => { job.waiters.delete(waiter); reject(signal?.reason ?? new MediaError('CANCELLED', 'Prepared episode cancelled'));
          if (!job.waiters.size) job.controller.abort(new MediaError('CANCELLED', 'No viewers need this prepared episode')); };
        waiter.finish = (error, record) => { signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(record); };
        job.waiters.add(waiter); signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) { cancel(); return; }
        safeProgress(onProgress, { state: job.state, renditionId: id });
        if (!job.promise) job.promise = this.runRenditionJob(job);
      });
    } catch (error) { this.releaseRenditionPin(id, owner); throw error; }
  }
  async runRenditionJob(job) {
    let record, failure; const temporaryId = randomUUID(), paths = this.renditionPaths(job.id);
    const staging = { raw: path.join(this.preparedWorkRoot, `${temporaryId}.progressive.part.mp4`),
      video: path.join(this.preparedWorkRoot, `${temporaryId}.video.part.mp4`), captions: path.join(this.preparedWorkRoot, `${temporaryId}.captions.part`) };
    try {
      await this.renditionGate.run(async () => {
        const maximumOutputBytes = Math.ceil(Math.max(job.recipe.original.bytes * 1.25, job.recipe.durationSeconds * 10000000 / 8 * 1.2) + 64 * 1024 ** 2);
        await this.locked(async () => { this.preparedReservations.set(job.id, { bytes: maximumOutputBytes * 3, paths: [...Object.values(staging), paths.video, paths.captions] });
          try { await this.ensureCapacity(); } catch (error) { this.preparedReservations.delete(job.id); throw error; } });
        job.state = 'preparing-video'; for (const waiter of job.waiters) safeProgress(waiter.onProgress, { state: job.state, receivedBytes: 0, totalBytes: maximumOutputBytes });
        const produced = await job.prepare({ recipe: job.recipe, paths: staging, signal: job.controller.signal, maximumOutputBytes,
          checkStorage: () => this.locked(() => this.ensureCapacity()), onProgress: progress => { job.state = progress.state;
            for (const waiter of job.waiters) safeProgress(waiter.onProgress, progress); } });
        abortReason(job.controller.signal);
        const video = await lstat(staging.video), captions = await lstat(staging.captions);
        if (!video.isFile() || video.isSymbolicLink() || !captions.isFile() || captions.isSymbolicLink() || video.size < 1 || video.size > maximumOutputBytes
          || captions.size < 1 || captions.size > 16 * 1024 ** 2) throw new MediaError('PREPARED_INVALID', 'Prepared media is incomplete or exceeds its bound');
        const videoHash = await hashFile(staging.video, 'sha256'), captionHash = await hashFile(staging.captions, 'sha256');
        await managedRegularFile(staging.video, this.preparedWorkRoot); await managedRegularFile(staging.captions, this.preparedWorkRoot);
        const cueIdentity = canonicalCaptionHash(await readFile(staging.captions));
        abortReason(job.controller.signal);
        await mkdir(paths.directory, { recursive: true }); if (path.resolve(await realpath(paths.directory)) !== path.resolve(paths.directory)) throw new MediaError('CACHE_LINK', 'Prepared publication directory is linked');
        abortReason(job.controller.signal);
        await rename(staging.video, paths.video); await rename(staging.captions, paths.captions);
        const finalVideo = await lstat(paths.video), finalCaptions = await lstat(paths.captions);
        const completed = { id: job.id, recipe: job.recipe, paths, video: { bytes: finalVideo.size, sha256: videoHash },
          captions: { bytes: finalCaptions.size, sha256: captionHash, cueIdentity, lineage: job.recipe.subtitle },
          metadata: produced.metadata, metrics: produced.metrics, presentation: produced.presentation,
          verifiedVideoMtimeMs: finalVideo.mtimeMs, verifiedCaptionMtimeMs: finalCaptions.mtimeMs, lastAccess: Date.now() };
        await this.locked(async () => {
          // A last viewer can cancel while hashing/renaming or waiting for this
          // transaction. Only this checked publication makes the pair reusable.
          abortReason(job.controller.signal); record = completed;
          this.renditions.set(job.id, record); this.preparedReservations.delete(job.id); await this.persist();
        });
      }, job.controller.signal);
    } catch (error) { failure = error; }
    finally {
      for (const file of Object.values(staging)) { const stats = await lstat(file).catch(() => null); if (stats?.isFile() && !stats.isSymbolicLink()) await rm(file, { force: true }); }
      if (failure && !record) await this.removeRendition(job.id).catch(() => {});
      // A retry waits on this job until its unpublished final pair is removed;
      // otherwise old cleanup could race a new producer of the same recipe.
      this.preparedReservations.delete(job.id); if (this.renditionJobs.get(job.id) === job) this.renditionJobs.delete(job.id);
      for (const waiter of job.waiters) waiter.finish(failure, record); job.waiters.clear();
    }
  }

  async readyEntry(candidate) {
    const entry = this.entries.get(candidate.id);
    if (!entry || entry.candidate.checksums.md5.toLowerCase() !== candidate.checksums.md5.toLowerCase()) return null;
    const stats = await lstat(entry.path).catch(() => null);
    const invalid = !stats || !stats.isFile() || stats.isSymbolicLink() || stats.size !== candidate.bytes;
    const wrongHash = !invalid && entry.verifiedMtimeMs !== stats.mtimeMs
      && await hashFile(entry.path) !== candidate.checksums.md5.toLowerCase();
    if (invalid || wrongHash) {
      if (this.pins.get(candidate.id)?.size > 1 || stats?.isSymbolicLink() || stats && !stats.isFile()) {
        throw new MediaError('CACHE_INTEGRITY', 'Cached episode changed; end affected playback before preparing it again', { status: 409, retryable: true });
      }
      // A single requester can repair an idle damaged original automatically.
      // Never delete a directory/link or an original pinned by another viewer.
      await rm(entry.path, { force: true }).catch(error => { throw new MediaError('CACHE_INTEGRITY', 'The damaged cache file is in use; end playback and retry preparation', { status: 409, retryable: true, cause: error }); });
      this.entries.delete(candidate.id); await this.persist(); return null;
    }
    if (entry.verifiedMtimeMs !== stats.mtimeMs) {
      entry.verifiedMtimeMs = stats.mtimeMs;
    }
    entry.lastAccess = Date.now();
    return { ...entry };
  }

  async prepare(candidate, { owner, signal, onProgress } = {}) {
    validateOriginal(candidate); abortReason(signal); this.pin(candidate.id, owner);
    let job;
    try {
      const result = await this.locked(async () => {
        const entry = await this.readyEntry(candidate);
        if (entry) { await this.persist(); return { entry }; }
        job = this.jobs.get(candidate.id);
        if (job?.controller.signal.aborted) { this.jobs.delete(candidate.id); job = null; }
        if (!job) {
          job = { candidate, controller: new AbortController(), waiters: new Set(), receivedBytes: 0, state: 'queued', admitted: false };
          this.jobs.set(candidate.id, job);
          // Start only after a consumer is registered below.
        }
        return { job };
      });
      if (result.entry) { safeProgress(onProgress, { state: 'cached', receivedBytes: candidate.bytes, totalBytes: candidate.bytes }); return result.entry; }
      job = result.job;
      return await new Promise((resolve, reject) => {
        const waiter = { owner, onProgress, resolve, reject };
        const cancel = () => {
          job.waiters.delete(waiter);
          reject(signal.reason ?? new MediaError('CANCELLED', 'Preparation cancelled'));
          if (!job.waiters.size) { job.controller.abort(new MediaError('CANCELLED', 'No viewers need this preparation'));
            if (!job.promise) this.jobs.delete(candidate.id); }
        };
        waiter.finish = (error, entry) => { signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(entry); };
        job.waiters.add(waiter); signal?.addEventListener('abort', cancel, { once: true });
        if (signal?.aborted) { cancel(); return; }
        safeProgress(onProgress, { state: job.state, receivedBytes: job.receivedBytes, totalBytes: candidate.bytes });
        if (!job.promise) job.promise = this.runJob(job);
      });
    } catch (error) { this.releasePin(candidate.id, owner); throw error; }
  }

  async runJob(job) {
    let entry, failure;
    const target = this.entryPath(job.candidate), temporary = target + '.part-' + randomUUID();
    try {
      await this.locked(async () => { await this.ensureCapacity(job.candidate.bytes); job.admitted = true; });
      await this.gate.run(async () => {
        await mkdir(path.dirname(target), { recursive: true });
        const metrics = await this.downloader.download(job.candidate, temporary, { signal: job.controller.signal,
          onProgress: progress => { job.state = progress.state; job.receivedBytes = progress.receivedBytes ?? 0;
            for (const waiter of job.waiters) safeProgress(waiter.onProgress, progress); } });
        abortReason(job.controller.signal);
        await rename(temporary, target);
        const stats = await lstat(target);
        entry = { candidate: job.candidate, path: target, verifiedMtimeMs: stats.mtimeMs, lastAccess: Date.now(), metrics };
        await this.locked(async () => { this.entries.set(job.candidate.id, entry); job.receivedBytes = job.candidate.bytes; await this.persist(); });
      }, job.controller.signal);
    } catch (error) { failure = error; await rm(temporary, { force: true }); }
    finally {
      if (this.jobs.get(job.candidate.id) === job) this.jobs.delete(job.candidate.id);
      for (const waiter of job.waiters) waiter.finish(failure, entry);
      job.waiters.clear();
    }
  }

  /** Administrative migration only. Caller supplies approved import roots; HTTP APIs must not expose a file picker. */
  async importVerified(candidate, sourcePath) {
    validateOriginal(candidate);
    const source = await realpath(path.resolve(sourcePath));
    const approved = await Promise.all(this.importRoots.map(root => realpath(root)));
    if (!approved.some(root => source.startsWith(root + path.sep))) throw new MediaError('IMPORT_PATH', 'Import is outside approved runtime roots');
    const stats = await lstat(source);
    if (!stats.isFile() || stats.isSymbolicLink() || stats.size !== candidate.bytes || await hashFile(source) !== candidate.checksums.md5.toLowerCase()) throw new MediaError('CACHE_INTEGRITY', 'Import failed the Archive size/MD5 check');
    return this.locked(async () => {
      const existing = await this.readyEntry(candidate); if (existing) return existing;
      await this.ensureCapacity(candidate.bytes);
      const target = this.entryPath(candidate); await mkdir(path.dirname(target), { recursive: true });
      await link(source, target).catch(error => error.code === 'EXDEV' ? copyFile(source, target) : Promise.reject(error));
      const copied = await lstat(target);
      const entry = { candidate, path: target, verifiedMtimeMs: copied.mtimeMs, lastAccess: Date.now(), metrics: { imported: true, bytes: copied.size, md5: candidate.checksums.md5.toLowerCase() } };
      this.entries.set(candidate.id, entry); await this.persist(); return entry;
    });
  }

  async maintain() { return this.locked(() => this.ensureCapacity()); }
  async purgeIdleEngineMedia() {
    if (this.engineBudgets.size) return false;
    const safeExtensions = new Set(['.ts', '.m3u8', '.m4s', '.mp4', '.ass', '.vtt', '.srt']);
    for (const root of this.managedRoots) for (const file of await scanFiles(root)) if (safeExtensions.has(path.extname(file.path).toLowerCase())) await rm(file.path, { force: true });
    return true;
  }
  async shutdown() {
    for (const job of this.jobs.values()) job.controller.abort(new MediaError('CANCELLED', 'Companion stopped'));
    for (const job of this.renditionJobs.values()) job.controller.abort(new MediaError('CANCELLED', 'Companion stopped'));
    await Promise.allSettled([...this.jobs.values(), ...this.renditionJobs.values()].map(job => job.promise));
    this.pins.clear(); this.renditionPins.clear(); this.engineBudgets.clear(); this.preparedReservations.clear();
  }
}
