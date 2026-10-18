import { setTimeout as delay } from 'node:timers/promises';
import { ARCHIVE_ITEMS, archiveFileUrl, assertItem } from './archive.mjs';

export const USER_AGENT = 'PTI-OnePiece-Feasibility/0.1 (private family playback research; bounded requests)';
export const PTI_ORIGIN = 'https://pti-app-2ab59.web.app';
export const RANGE_MAX_BYTES = 1024 * 1024;

class Limiter {
  active = 0;
  waiting = [];
  async run(fn, signal) {
    if (signal?.aborted) throw signal.reason;
    if (this.active >= 2) await new Promise((resolve, reject) => {
      const entry = { resolve, reject };
      const onAbort = () => { this.waiting = this.waiting.filter(e => e !== entry); reject(signal.reason); };
      entry.resolve = () => { signal?.removeEventListener('abort', onAbort); resolve(); };
      this.waiting.push(entry);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    else this.active++;
    try { return await fn(); }
    finally {
      this.active--;
      const next = this.waiting.shift();
      if (next) { this.active++; next.resolve(); }
    }
  }
}
const sharedLimiter = new Limiter();

export function retryAfterMs(value, now = Date.now()) {
  if (!value) return null;
  const seconds = /^\d+(?:\.\d+)?$/.test(value) ? Number(value) * 1000 : Date.parse(value) - now;
  return Number.isFinite(seconds) ? Math.max(0, seconds) : null;
}

function validateRedirect(url, itemId, metadata) {
  const value = new URL(url);
  if (value.protocol !== 'https:' || value.username || value.password || value.port
      || !(value.hostname === 'archive.org' || value.hostname.endsWith('.archive.org'))) throw new Error('Unsafe Archive redirect');
  const pathname = decodeURIComponent(value.pathname);
  const permitted = metadata ? pathname === `/metadata/${itemId}`
    : pathname.startsWith(`/download/${itemId}/`) || pathname.includes(`/items/${itemId}/`);
  if (!permitted || pathname.split('/').some(p => p === '..' || p === '.')) throw new Error('Archive redirect escaped item');
  return value;
}

export function validateRange(start, length) {
  if (!Number.isSafeInteger(start) || start < 0 || !Number.isSafeInteger(length) || length < 1 || length > RANGE_MAX_BYTES
      || !Number.isSafeInteger(start + length - 1)) throw new Error('Invalid or excessive byte range');
  return `bytes=${start}-${start + length - 1}`;
}

async function readBounded(response, cap, signal) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  let length = 0;
  const chunks = [];
  try {
    while (true) {
      if (signal.aborted) throw signal.reason;
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > cap) throw new Error(`Response exceeds ${cap}-byte cap`);
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { await reader.cancel().catch(() => {}); }
}

export function createArchiveTransport({ fetchImpl = fetch, sleep = delay, timeoutMs = 30000, maxAttempts = 3 } = {}) {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 3) throw new Error('Attempts must be 1..3');
  async function request({ itemId, fileName, method = 'GET', start = 0, length = 65536, expectedTotal, signal: callerSignal, metadata = false, preflight = false }) {
    assertItem(itemId);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) throw new Error('Unsupported method');
    const initialUrl = metadata ? `https://archive.org/metadata/${itemId}` : archiveFileUrl(itemId, fileName);
    const range = metadata ? null : validateRange(start, length);
    if (expectedTotal !== undefined && (!Number.isSafeInteger(expectedTotal) || expectedTotal <= start + length - 1)) {
      throw new Error('Invalid expected source size');
    }
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = callerSignal ? AbortSignal.any([callerSignal, timeout]) : timeout;
    return sharedLimiter.run(async () => {
      const history = [];
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const began = performance.now();
        let url = initialUrl;
        let response;
        const redirects = [];
        try {
          for (let hop = 0; hop <= 5; hop++) {
            validateRedirect(url, itemId, metadata);
            const headers = { 'User-Agent': USER_AGENT, 'Accept-Encoding': 'identity', Origin: PTI_ORIGIN };
            if (range && method !== 'OPTIONS') headers.Range = range;
            if (preflight) Object.assign(headers, { 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'range' });
            response = await fetchImpl(url, { method, headers, redirect: 'manual', signal });
            if (![301, 302, 303, 307, 308].includes(response.status)) break;
            const location = response.headers.get('location');
            await response.body?.cancel();
            if (!location || hop === 5) throw new Error('Invalid or excessive redirect chain');
            const next = new URL(location, url).href;
            validateRedirect(next, itemId, metadata);
            redirects.push({ status: response.status, from: url, to: next,
              accessControlAllowOrigin: response.headers.get('access-control-allow-origin') });
            url = next;
          }
          const common = { attempt, status: response.status, finalUrl: url, redirects,
            headers: Object.fromEntries(['content-type', 'content-length', 'content-range', 'accept-ranges', 'access-control-allow-origin',
              'access-control-allow-methods', 'access-control-allow-headers', 'access-control-expose-headers', 'retry-after', 'etag', 'last-modified']
              .map(name => [name, response.headers.get(name)])) };
          if ([429, 500, 502, 503, 504].includes(response.status) && attempt < maxAttempts) {
            await response.body?.cancel();
            const waitMs = retryAfterMs(response.headers.get('retry-after')) ?? 500 * 2 ** (attempt - 1);
            history.push({ ...common, retryWaitMs: waitMs, elapsedMs: Math.round(performance.now() - began) });
            // Do not retry earlier than Retry-After or hold a pilot request open indefinitely.
            if (waitMs > 10000) throw new Error(`Retry-After ${waitMs}ms exceeds bounded pilot wait; retry later`);
            await sleep(waitMs, undefined, { signal });
            continue;
          }
          let bytes = Buffer.alloc(0);
          if (method === 'GET') {
            if (metadata && response.status === 200) bytes = await readBounded(response, 8 * 1024 * 1024, signal);
            else if (!metadata && response.status === 206) {
              const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') ?? '');
              if (!match || Number(match[1]) !== start || Number(match[2]) !== start + length - 1 || Number(match[3]) <= Number(match[2])) {
                await response.body?.cancel(); throw new Error('Response Content-Range does not match request');
              }
              if (expectedTotal !== undefined && Number(match[3]) !== expectedTotal) {
                await response.body?.cancel(); throw new Error('Source size changed since inventory; refresh source metadata');
              }
              bytes = await readBounded(response, length, signal);
              if (bytes.length !== length) throw new Error('Short range body');
            } else await response.body?.cancel(); // A range-ignoring 200 must never download the whole episode.
          } else await response.body?.cancel();
          return { ...common, request: { method, range, origin: PTI_ORIGIN }, elapsedMs: Math.round(performance.now() - began),
            bytesRead: bytes.length, bytes, history };
        } catch (error) {
          await response?.body?.cancel().catch(() => {});
          // Network retries are explicit and bounded; malformed redirects/ranges are never retried.
          error.history = history;
          throw error;
        }
      }
    }, signal);
  }
  return {
    metadata: (itemId, options = {}) => request({ ...options, itemId, metadata: true }),
    range: (itemId, fileName, options = {}) => request({ ...options, itemId, fileName }),
    preflight: (itemId, fileName, options = {}) => request({ ...options, itemId, fileName, method: 'OPTIONS', preflight: true }),
    allowedItems: ARCHIVE_ITEMS,
  };
}
