import { createHash } from 'node:crypto';
import { open, rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { archiveFileUrl, parseEpisodeFile } from '../sources/archive.mjs';
import { retryAfterMs } from '../sources/transport.mjs';
import { MediaError, abortReason, safeProgress } from './errors.mjs';

export const MAX_ORIGINAL_BYTES = 2 * 1024 ** 3;

export function validateOriginal(candidate, maxBytes = MAX_ORIGINAL_BYTES) {
  if (!candidate || candidate.provider !== 'archive' || candidate.role !== 'original' || candidate.container !== 'mkv'
      || !/^archive-[a-f0-9]{20}$/.test(candidate.id ?? '')
      || !Number.isSafeInteger(candidate.bytes) || candidate.bytes <= 0 || candidate.bytes > maxBytes
      || !/^[a-f0-9]{32}$/i.test(candidate.checksums?.md5 ?? '')) {
    throw new MediaError('INVALID_SOURCE', 'A verified original with known size and MD5 is required');
  }
  const parsed = parseEpisodeFile(candidate.itemId, candidate.fileName);
  if (!parsed || candidate.url !== archiveFileUrl(candidate.itemId, candidate.fileName)) {
    throw new MediaError('INVALID_SOURCE', 'The source does not match the allowlisted Archive adapter');
  }
  return candidate;
}

function checkedRedirect(value, itemId) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port
      || !(url.hostname === 'archive.org' || url.hostname.endsWith('.archive.org'))) {
    throw new MediaError('SOURCE_REDIRECT', 'Archive redirected outside the permitted source');
  }
  let path;
  try { path = decodeURIComponent(url.pathname); } catch { throw new MediaError('SOURCE_REDIRECT', 'Malformed source path'); }
  if ((!path.startsWith(`/download/${itemId}/`) && !path.includes(`/items/${itemId}/`))
      || path.split('/').some(p => p === '..' || p === '.')) {
    throw new MediaError('SOURCE_REDIRECT', 'Archive redirected outside the selected collection');
  }
  return url.href;
}

export class ArchiveDownloader {
  constructor({ fetchImpl = fetch, attemptTimeoutMs = 180000, maxAttempts = 3, maxBytes = MAX_ORIGINAL_BYTES, sleep = delay } = {}) {
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('maxAttempts must be 1..3');
    Object.assign(this, { fetchImpl, attemptTimeoutMs, maxAttempts, maxBytes, sleep });
  }

  async download(candidate, destination, { signal: callerSignal, onProgress } = {}) {
    validateOriginal(candidate, this.maxBytes);
    const began = performance.now();
    const history = [];
    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      abortReason(callerSignal);
      const signal = callerSignal ? AbortSignal.any([callerSignal, AbortSignal.timeout(this.attemptTimeoutMs)]) : AbortSignal.timeout(this.attemptTimeoutMs);
      let response, reader, file, created = false;
      let received = 0;
      try {
        let url = candidate.url;
        for (let hop = 0; hop <= 5; hop++) {
          url = checkedRedirect(url, candidate.itemId);
          response = await this.fetchImpl(url, { redirect: 'manual', signal,
            headers: { 'User-Agent': 'PTI-OnePiece-Companion/1.0 (private bounded episode preparation)', 'Accept-Encoding': 'identity' } });
          if (![301, 302, 303, 307, 308].includes(response.status)) break;
          const location = response.headers.get('location');
          await response.body?.cancel();
          if (!location || hop === 5) throw new MediaError('SOURCE_REDIRECT', 'Excessive source redirects');
          url = checkedRedirect(new URL(location, url).href, candidate.itemId);
        }
        if ([429, 500, 502, 503, 504].includes(response.status)) {
          const waitMs = retryAfterMs(response.headers.get('retry-after')) ?? Math.min(500 * 2 ** (attempt - 1), 4000);
          await response.body?.cancel();
          if (waitMs > 30000 || attempt === this.maxAttempts) throw new MediaError('SOURCE_BUSY', 'Archive is temporarily unavailable; retry later', { retryable: true, retryAfterMs: waitMs, status: 503 });
          history.push({ attempt, status: response.status, waitMs });
          safeProgress(onProgress, { state: 'retrying', attempt, receivedBytes: 0, totalBytes: candidate.bytes, retryAfterMs: waitMs });
          await this.sleep(waitMs, undefined, { signal: callerSignal });
          continue;
        }
        if (response.status !== 200) throw new MediaError('SOURCE_UNAVAILABLE', `Archive returned HTTP ${response.status}`, { status: 502 });
        const length = response.headers.get('content-length');
        if ((length !== null && Number(length) !== candidate.bytes) || !['', 'identity'].includes(response.headers.get('content-encoding') ?? '')) {
          throw new MediaError('SOURCE_CHANGED', 'Source size or encoding changed; refresh the catalogue');
        }
        file = await open(destination, 'wx').catch(error => { throw new MediaError('CACHE_WRITE', 'The PC could not create a private preparation file', { status: 507, cause: error }); });
        created = true;
        const digest = createHash('md5');
        reader = response.body?.getReader();
        if (!reader) throw new MediaError('SOURCE_EMPTY', 'Archive returned no episode body');
        safeProgress(onProgress, { state: 'downloading', attempt, receivedBytes: 0, totalBytes: candidate.bytes });
        while (true) {
          abortReason(signal);
          const { done, value } = await reader.read();
          if (done) break;
          received += value.byteLength;
          if (received > candidate.bytes || received > this.maxBytes) throw new MediaError('SOURCE_OVERSIZE', 'Source exceeded its verified size');
          digest.update(value);
          await file.writeFile(value).catch(error => { throw new MediaError('CACHE_WRITE', 'The PC could not write the preparation file', { status: 507, cause: error }); });
          safeProgress(onProgress, { state: 'downloading', attempt, receivedBytes: received, totalBytes: candidate.bytes,
            elapsedMs: Math.round(performance.now() - began) });
        }
        safeProgress(onProgress, { state: 'verifying', receivedBytes: received, totalBytes: candidate.bytes });
        const md5 = digest.digest('hex');
        if (received !== candidate.bytes || md5 !== candidate.checksums.md5.toLowerCase()) throw new MediaError('SOURCE_INTEGRITY', 'Episode failed its Archive size/MD5 check');
        await file.sync().catch(error => { throw new MediaError('CACHE_WRITE', 'The PC could not commit the preparation file', { status: 507, cause: error }); });
        return { bytes: received, md5, elapsedMs: Math.round(performance.now() - began), attempts: attempt, history };
      } catch (error) {
        await file?.close().catch(() => {}); file = null;
        await reader?.cancel().catch(() => {}); reader = null;
        await response?.body?.cancel().catch(() => {});
        if (created) await rm(destination, { force: true });
        abortReason(callerSignal);
        if (error instanceof MediaError) throw error;
        if (attempt === this.maxAttempts) throw new MediaError('SOURCE_NETWORK', 'Episode preparation could not finish within its network limits', { retryable: true, status: 503, cause: error });
        history.push({ attempt, error: error.name ?? 'NetworkError', receivedBytes: received });
        await this.sleep(Math.min(500 * 2 ** (attempt - 1), 4000), undefined, { signal: callerSignal });
      } finally {
        await file?.close().catch(() => {});
        await reader?.cancel().catch(() => {});
      }
    }
    throw new MediaError('SOURCE_NETWORK', 'Preparation exhausted its retry limit');
  }
}
