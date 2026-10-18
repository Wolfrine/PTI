import { MediaError } from './errors.mjs';

const MAX_BYTES = 20 * 1024 ** 3;
const MAX_LIFETIME_MS = 4 * 3600_000;
const GUID = '(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})';
const STATIC_PATH = new RegExp(`^/Videos/${GUID}/stream\\.mp4$`, 'i');
const error = (code, message, status = 502) => new MediaError(code, message, { status, retryable: status >= 500 });
const requestError = () => error('STATIC_REQUEST', 'The prepared video request is invalid', 400);
const cancelled = () => error('STATIC_CANCELLED', 'The prepared video request was cancelled', 499);

function endpoint(origin, relative) {
  let base, target;
  try { base = new URL(origin); target = new URL(relative, base); } catch { throw requestError(); }
  if (typeof origin !== 'string' || base.origin !== origin || base.protocol !== 'http:'
      || !['127.0.0.1', '[::1]'].includes(base.hostname) || base.username || base.password
      || typeof relative !== 'string' || relative.length > 2048 || /[\x00-\x20\x7f\\%#]/.test(relative)
      || !relative.startsWith('/') || relative.startsWith('//') || target.origin !== origin
      || !STATIC_PATH.test(relative.split('?')[0]) || target.hash || target.username || target.password) throw requestError();
  const parameters = [...target.searchParams];
  if (parameters.length !== 2 || parameters.filter(([key, value]) => key === 'Static' && value === 'true').length !== 1
      || parameters.filter(([key, value]) => key === 'MediaSourceId' && new RegExp(`^${GUID}$`, 'i').test(value)).length !== 1) throw requestError();
  return target.href;
}

function interval(range, byteLength) {
  if (range === undefined) return null;
  if (typeof range !== 'string' || range.length > 128) return false;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return false;
  const first = match[1] ? Number(match[1]) : null, last = match[2] ? Number(match[2]) : null;
  if ([first, last].some(value => value !== null && (!Number.isSafeInteger(value) || value < 0))) return false;
  if (first === null) {
    if (!last) return false;
    return { start: Math.max(0, byteLength - last), end: byteLength - 1 };
  }
  if (first >= byteLength || (last !== null && last < first)) return false;
  return { start: first, end: last === null ? byteLength - 1 : Math.min(last, byteLength - 1) };
}

function deadline(value, maximum) {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) throw requestError();
  return value;
}

/** Exact-file transport only. Admission, language selection and renewable authorization
 * remain in the coordinator/API. No identity or membership cache is introduced here.
 */
export async function fetchStaticResource({ fetchImpl = fetch, origin, relative, authorization, byteLength,
  method = 'GET', range, signal, headerTimeoutMs = 15000, readTimeoutMs = 30000,
  lifetimeMs = MAX_LIFETIME_MS } = {}) {
  const url = endpoint(origin, relative);
  if (typeof fetchImpl !== 'function' || !Number.isSafeInteger(byteLength) || byteLength < 1 || byteLength > MAX_BYTES
      || !['GET', 'HEAD'].includes(method) || typeof authorization !== 'string' || !authorization.length
      || authorization.length > 4096 || /[\x00-\x1f\x7f]/.test(authorization)
      || signal !== undefined && !(signal instanceof AbortSignal)) throw requestError();
  deadline(headerTimeoutMs, 120000); deadline(readTimeoutMs, 120000); deadline(lifetimeMs, MAX_LIFETIME_MS);
  // Range is defined for GET. HEAD always describes the complete known object.
  const selected = method === 'HEAD' ? null : interval(range, byteLength);
  const baseHeaders = { 'accept-ranges': 'bytes', 'cache-control': 'private, no-store' };
  if (selected === false) return { status: 416, headers: { ...baseHeaders, 'content-range': `bytes */${byteLength}`, 'content-length': '0' },
    body: new ReadableStream({ start(controller) { controller.close(); } }), resources: [], longLived: true };
  if (signal?.aborted) throw cancelled();
  const expected = selected ? selected.end - selected.start + 1 : byteLength;
  const normalizedRange = selected ? `bytes=${selected.start}-${selected.end}` : null;
  const expectedContentRange = selected ? `bytes ${selected.start}-${selected.end}/${byteLength}` : null;
  const transport = new AbortController();
  let response, reader, outputController, ended = false, failure = null, lifetimeTimer;

  const detach = () => { clearTimeout(lifetimeTimer); signal?.removeEventListener('abort', callerAborted); };
  const cancelSource = () => {
    try {
      const pending = reader ? reader.cancel(failure) : response?.body?.cancel(failure);
      void Promise.resolve(pending).catch(() => {}).finally(() => { try { reader?.releaseLock(); } catch {} });
    } catch {}
  };
  const fail = problem => {
    if (ended) return;
    ended = true; failure = problem; detach();
    transport.abort(problem); cancelSource();
    try { outputController?.error(problem); } catch {}
  };
  const callerAborted = () => fail(cancelled());
  signal?.addEventListener('abort', callerAborted, { once: true });
  lifetimeTimer = setTimeout(() => fail(error('STATIC_LIFETIME', 'The prepared video response expired', 410)), lifetimeMs);

  // A wait owns its deadline and listener only while an upstream operation is pending.
  const wait = (operation, milliseconds, timeoutError, operationError) => new Promise((resolve, reject) => {
    let settled = false, timer;
    const finish = (problem, value) => {
      if (settled) return;
      settled = true; clearTimeout(timer); transport.signal.removeEventListener('abort', aborted);
      problem ? reject(problem) : resolve(value);
    };
    const aborted = () => finish(failure ?? cancelled());
    if (transport.signal.aborted) { aborted(); return; }
    transport.signal.addEventListener('abort', aborted, { once: true });
    timer = setTimeout(() => fail(timeoutError()), milliseconds);
    Promise.resolve().then(operation).then(value => finish(null, value), () => {
      if (!ended) fail(operationError());
      finish(failure ?? operationError());
    });
  });

  try {
    response = await wait(async () => {
      const result = await fetchImpl(url, { method, redirect: 'manual', credentials: 'omit', cache: 'no-store', signal: transport.signal,
        headers: { Authorization: authorization, Accept: 'video/mp4', 'Accept-Encoding': 'identity', ...(normalizedRange ? { Range: normalizedRange } : {}) } });
      if (ended) { try { void Promise.resolve(result.body?.cancel()).catch(() => {}); } catch {} }
      return result;
    }, headerTimeoutMs,
    () => error('STATIC_HEADER_TIMEOUT', 'Prepared video headers did not arrive in time', 504),
    () => error('STATIC_FETCH', 'The prepared video source is unavailable', 503));
    const length = response.headers.get('content-length'), type = response.headers.get('content-type');
    const contentRange = response.headers.get('content-range'), encoding = response.headers.get('content-encoding');
    if (response.status !== (selected ? 206 : 200) || response.redirected || response.url && response.url !== url
        || !/^video\/mp4(?:\s*;|$)/i.test(type ?? '') || !/^\d+$/.test(length ?? '') || Number(length) !== expected
        || response.headers.get('accept-ranges')?.toLowerCase() !== 'bytes'
        || contentRange !== expectedContentRange || encoding && encoding.toLowerCase() !== 'identity') {
      throw error('STATIC_HEADERS', 'Prepared video headers did not match the verified file');
    }
    const headers = { ...baseHeaders, 'content-type': 'video/mp4', 'content-length': String(expected),
      ...(selected ? { 'content-range': expectedContentRange } : {}) };
    if (method === 'HEAD') {
      ended = true; detach(); cancelSource();
      return { status: 200, headers, body: null, resources: [], longLived: true };
    }
    if (!response.body || typeof response.body.getReader !== 'function') throw error('STATIC_TRUNCATED', 'The prepared video body was incomplete');
    reader = response.body.getReader();
    let received = 0;
    const body = new ReadableStream({
      start(controller) { outputController = controller; },
      async pull(controller) {
        if (ended) { if (failure) controller.error(failure); return; }
        try {
          const result = await wait(() => reader.read(), readTimeoutMs,
            () => error('STATIC_READ_TIMEOUT', 'Prepared video data did not arrive in time', 504),
            () => error('STATIC_READ', 'The prepared video source was interrupted', 503));
          if (ended) return;
          if (result.done) {
            if (received !== expected) throw error('STATIC_TRUNCATED', 'The prepared video body was incomplete');
            ended = true; detach(); reader.releaseLock(); controller.close(); return;
          }
          if (!(result.value instanceof Uint8Array) || result.value.byteLength < 1) throw error('STATIC_BYTES', 'Prepared video returned invalid data');
          if (received + result.value.byteLength > expected) throw error('STATIC_OVERRUN', 'Prepared video exceeded its verified byte count');
          received += result.value.byteLength; controller.enqueue(result.value);
        } catch (problem) { fail(problem instanceof MediaError ? problem : error('STATIC_READ', 'The prepared video source was interrupted', 503)); }
      },
      cancel() { fail(cancelled()); }
    }, { highWaterMark: 0 });
    return { status: selected ? 206 : 200, headers, body, resources: [], longLived: true };
  } catch (problem) {
    const safe = problem instanceof MediaError ? problem : error('STATIC_FETCH', 'The prepared video source is unavailable', 503);
    fail(safe); throw safe;
  }
}
