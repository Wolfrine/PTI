import test from 'node:test';
import assert from 'node:assert/strict';
import { getEventListeners } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { fetchStaticResource } from '../src/media/static-resource.mjs';

// Isolated transport fixtures only: these bytes are not episode or engine evidence.
const item = '11111111111111111111111111111111';
const source = '22222222-2222-2222-2222-222222222222';
const origin = 'http://127.0.0.1:18097';
const relative = `/Videos/${item}/stream.mp4?Static=true&MediaSourceId=${source}`;
const authorization = 'MediaBrowser Token="fixture-only"';
const input = { origin, relative, authorization, byteLength: 8, headerTimeoutMs: 500,
  readTimeoutMs: 500, lifetimeMs: 5000 };
const bytes = (...values) => new Uint8Array(values);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

function stream(chunks, state = {}) {
  const queue = [...chunks];
  return new ReadableStream({
    pull(controller) {
      state.pulls = (state.pulls ?? 0) + 1;
      if (!queue.length) { controller.close(); return; }
      const next = queue.shift();
      if (next === 'stall') { state.readStarted?.resolve(); return new Promise(() => {}); }
      if (next instanceof Error) { controller.error(next); return; }
      controller.enqueue(next);
    },
    cancel(reason) { state.cancelled = (state.cancelled ?? 0) + 1; state.reason = reason; }
  }, { highWaterMark: 0 });
}

function response({ status = 200, length = 8, headers = {}, body = stream([bytes(0, 1, 2, 3, 4, 5, 6, 7)]),
  redirected = false, url = '' } = {}) {
  return { status, redirected, url, body, headers: new Headers({ 'content-type': 'video/mp4',
    'content-length': String(length), 'accept-ranges': 'bytes', ...headers }) };
}

async function resource(t, upstream, overrides = {}) {
  const requests = [];
  const result = await fetchStaticResource({ ...input, fetchImpl: async (url, options) => {
    requests.push({ url, options });
    return typeof upstream === 'function' ? upstream(url, options) : upstream;
  }, ...overrides });
  t.after(async () => { try { await result.body?.cancel(); } catch {} });
  return { result, requests };
}

async function consume(body) {
  const chunks = [];
  for await (const chunk of body) chunks.push(...chunk);
  return chunks;
}

test('exact full MP4 forwards only loopback static request and safe response metadata', async t => {
  const { result, requests } = await resource(t, response({ headers: { 'x-private-engine-header': 'fixture-private' } }));
  assert.deepEqual(await consume(result.body), [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(result.status, 200); assert.equal(result.longLived, true); assert.deepEqual(result.resources, []);
  assert.deepEqual(result.headers, { 'accept-ranges': 'bytes', 'cache-control': 'private, no-store',
    'content-type': 'video/mp4', 'content-length': '8' });
  assert.equal(requests.length, 1); assert.equal(requests[0].url, origin + relative);
  assert.deepEqual(requests[0].options.headers, { Authorization: authorization, Accept: 'video/mp4', 'Accept-Encoding': 'identity' });
  assert.equal(requests[0].options.method, 'GET'); assert.equal(requests[0].options.redirect, 'manual');
  assert.equal(requests[0].options.credentials, 'omit'); assert.equal(requests[0].options.cache, 'no-store');
});

test('normalizes explicit, open, suffix and clamped ranges against the exact known file', async t => {
  for (const [range, start, end] of [['bytes=2-4', 2, 4], ['bytes=6-', 6, 7], ['bytes=-3', 5, 7],
    ['bytes=4-999', 4, 7], ['bytes=-999', 0, 7], [' BYTES=000-000 ', 0, 0]]) {
    const length = end - start + 1;
    const { result, requests } = await resource(t, response({ status: 206, length,
      headers: { 'content-range': `bytes ${start}-${end}/8` }, body: stream([new Uint8Array(length).fill(3)]) }), { range });
    assert.equal(result.status, 206); assert.equal(result.headers['content-range'], `bytes ${start}-${end}/8`);
    assert.equal(requests[0].options.headers.Range, `bytes=${start}-${end}`);
    assert.equal((await consume(result.body)).length, length);
  }
});

test('invalid or unsatisfiable ranges return bounded 416 without contacting the engine', async () => {
  for (const range of ['', null, 42, 'items=0-2', 'bytes=-', 'bytes=-0', 'bytes=8-', 'bytes=7-4',
    'bytes=0-1,3-4', 'bytes=0 -1', 'bytes=9007199254740992-', 'bytes=-9007199254740992',
    `bytes=0-${'9'.repeat(129)}`]) {
    let calls = 0;
    const result = await fetchStaticResource({ ...input, range, fetchImpl: async () => { calls++; throw new Error('must not fetch'); } });
    assert.equal(calls, 0); assert.equal(result.status, 416);
    assert.equal(result.headers['content-range'], 'bytes */8'); assert.equal(result.headers['content-length'], '0');
    assert.equal(result.longLived, true); assert.deepEqual(result.resources, []); assert.deepEqual(await consume(result.body), []);
  }
});

test('HEAD ignores Range, requests full metadata, cancels unexpected body and exposes no body', async t => {
  const state = {};
  const { result, requests } = await resource(t, response({ body: stream([bytes(1)], state) }), { method: 'HEAD', range: 'malformed ignored range' });
  assert.equal(requests[0].options.method, 'HEAD'); assert.equal(requests[0].options.headers.Range, undefined);
  assert.equal(result.status, 200); assert.equal(result.headers['content-length'], '8'); assert.equal(result.body, null);
  assert.equal(result.headers['content-range'], undefined); assert.equal(state.cancelled, 1); assert.equal(state.pulls, undefined);
  await assert.rejects(fetchStaticResource({ ...input, method: 'HEAD', range: 'bytes=2-4', fetchImpl: async () => response({
    status: 206, length: 3, headers: { 'content-range': 'bytes 2-4/8' }, body: null }) }), { code: 'STATIC_HEADERS' });
});

test('only canonical literal loopback origins and bounded static MP4 routes are admissible', async t => {
  const cases = [
    { origin: 'http://localhost:18097' }, { origin: 'https://127.0.0.1:18097' }, { origin: 'http://192.168.1.2:18097' },
    { origin: 'http://127.1:18097' }, { origin: 'http://2130706433:18097' }, { origin: 'http://127.0.0.1:18097/' },
    { origin: 'http://user:password@127.0.0.1:18097' }, { relative: origin + relative }, { relative: '//' + relative },
    { relative: relative.replace('/Videos/', '/System/') }, { relative: relative.replace('/stream.mp4', '/master.m3u8') },
    { relative: relative.replace('/stream.mp4', '/a/../stream.mp4') }, { relative: relative.replace('/stream.mp4', '/%73tream.mp4') },
    { relative: relative + '&ApiKey=fixture-secret' }, { relative: relative + '&Static=true' },
    { relative: relative.replace('Static=true', 'Static=false') }, { relative: relative.replace(source, 'not-a-guid') },
    { relative: relative + '#fragment' }, { relative: relative + '\n' }, { relative: relative.replace('/Videos/', '\\Videos\\') },
    { relative: '/'.repeat(2049) }, { byteLength: 0 }, { byteLength: 20 * 1024 ** 3 + 1 },
    { byteLength: Number.MAX_SAFE_INTEGER + 1 }, { byteLength: 8.5 }, { method: 'POST' },
    { authorization: '' }, { authorization: 'fixture\nHeader: injected' }, { authorization: 'a'.repeat(4097) },
    { signal: {} }, { headerTimeoutMs: NaN }, { headerTimeoutMs: 120001 }, { readTimeoutMs: 0 },
    { readTimeoutMs: Infinity }, { lifetimeMs: 4 * 3600_000 + 1 }, { lifetimeMs: 1.5 }
  ];
  let calls = 0;
  for (const overrides of cases) await assert.rejects(fetchStaticResource({ ...input, fetchImpl: async () => { calls++; }, ...overrides }), { code: 'STATIC_REQUEST' });
  assert.equal(calls, 0);
  const { result } = await resource(t, response(), { origin: 'http://[::1]:18097' });
  assert.equal((await consume(result.body)).length, 8);
});

test('rejects redirects, wrong status, range-ignoring 200 and inconsistent metadata before exposing bytes', async () => {
  const cases = [
    { status: 302, headers: { location: 'http://example.invalid/private' } }, { status: 404 }, { redirected: true },
    { url: 'http://example.invalid/changed' }, { headers: { 'content-type': 'video/webm' } },
    { headers: { 'content-length': '7' } }, { headers: { 'content-length': '8.0' } },
    { headers: { 'accept-ranges': 'none' } }, { headers: { 'content-range': 'bytes 0-7/8' } },
    { headers: { 'content-encoding': 'gzip' } }, { status: 206 }
  ];
  for (const overrides of cases) {
    const state = {};
    await assert.rejects(fetchStaticResource({ ...input, fetchImpl: async () => response({ ...overrides,
      body: stream([bytes(1)], state) }) }), { code: 'STATIC_HEADERS' });
    assert.equal(state.cancelled, 1); assert.equal(state.pulls, undefined);
  }
  for (const overrides of [{}, { status: 206, length: 3, headers: { 'content-range': 'bytes 1-3/8' } },
    { status: 206, length: 3, headers: { 'content-range': 'bytes 2-4/9' } }]) {
    await assert.rejects(fetchStaticResource({ ...input, range: 'bytes=2-4', fetchImpl: async () => response(overrides) }), { code: 'STATIC_HEADERS' });
  }
});

test('truncation, missing body, invalid chunks and excess bytes are rejected with exact byte caps', async t => {
  await assert.rejects(fetchStaticResource({ ...input, fetchImpl: async () => response({ body: null }) }), { code: 'STATIC_TRUNCATED' });
  for (const [chunks, code] of [[[bytes(1, 2)], 'STATIC_TRUNCATED'], [[bytes(1, 2, 3, 4, 5, 6, 7, 8, 9)], 'STATIC_OVERRUN'],
    [[new Uint8Array()], 'STATIC_BYTES'], [['unsafe non-byte fixture'], 'STATIC_BYTES']]) {
    const state = {};
    const { result } = await resource(t, response({ body: stream(chunks, state) }));
    await assert.rejects(consume(result.body), { code });
    // End-of-stream truncation is already closed; all live failures cancel upstream.
    if (code !== 'STATIC_TRUNCATED') assert.equal(state.cancelled, 1);
  }
  const state = {};
  const { result } = await resource(t, response({ body: stream([new Uint8Array(8), bytes(99)], state) }));
  const reader = result.body.getReader();
  assert.equal((await reader.read()).value.byteLength, 8);
  await assert.rejects(reader.read(), { code: 'STATIC_OVERRUN' }); assert.equal(state.cancelled, 1);
  reader.releaseLock();
});

test('header deadline aborts even an uncooperative fetch; a late response body is cancelled safely', async () => {
  const late = deferred(), state = {};
  let transportSignal;
  const pending = fetchStaticResource({ ...input, headerTimeoutMs: 25, fetchImpl: (_url, options) => {
    transportSignal = options.signal; return late.promise;
  } });
  await assert.rejects(pending, { code: 'STATIC_HEADER_TIMEOUT', status: 504 });
  assert.equal(transportSignal.aborted, true);
  late.resolve(response({ body: stream([bytes(1)], state) }));
  await delay(0); assert.equal(state.cancelled, 1);
});

test('read timeout runs only during an awaited upstream read and cancels a stalled source', async t => {
  const state = { readStarted: deferred() };
  const { result } = await resource(t, response({ body: stream(['stall'], state) }), { readTimeoutMs: 30 });
  const reader = result.body.getReader(), pending = reader.read();
  await state.readStarted.promise;
  await assert.rejects(pending, { code: 'STATIC_READ_TIMEOUT', status: 504 });
  assert.equal(state.cancelled, 1); reader.releaseLock();
});

test('downstream backpressure performs no eager reads and outlives short header/read deadlines', async t => {
  const state = {};
  const { result } = await resource(t, response({ body: stream([bytes(0, 1, 2, 3), bytes(4, 5, 6, 7)], state) }),
    { headerTimeoutMs: 25, readTimeoutMs: 25, lifetimeMs: 2000 });
  await delay(80); assert.equal(state.pulls, undefined, 'no source read before consumer asks');
  const reader = result.body.getReader(); assert.deepEqual([...(await reader.read()).value], [0, 1, 2, 3]);
  await delay(80); assert.equal(state.pulls, 1, 'no read while consumer is backpressured');
  assert.deepEqual([...(await reader.read()).value], [4, 5, 6, 7]);
  await delay(80); assert.equal(state.pulls, 2);
  assert.equal((await reader.read()).done, true); assert.equal(state.pulls, 3); reader.releaseLock();
});

test('caller cancellation works before fetch, during headers and while a body is idle or reading', async t => {
  const early = new AbortController(); early.abort(); let calls = 0;
  await assert.rejects(fetchStaticResource({ ...input, signal: early.signal, fetchImpl: async () => { calls++; } }), { code: 'STATIC_CANCELLED' });
  assert.equal(calls, 0);
  const duringHeaders = new AbortController(), started = deferred(); let upstreamSignal;
  const pending = fetchStaticResource({ ...input, signal: duringHeaders.signal, fetchImpl: (_url, options) => {
    upstreamSignal = options.signal; started.resolve(); return new Promise(() => {});
  } });
  await started.promise; duringHeaders.abort(); await assert.rejects(pending, { code: 'STATIC_CANCELLED' });
  assert.equal(upstreamSignal.aborted, true);
  for (const reading of [false, true]) {
    const controller = new AbortController(), state = { readStarted: deferred() };
    const { result } = await resource(t, response({ body: stream(['stall'], state) }), { signal: controller.signal });
    const reader = result.body.getReader();
    const read = reading ? reader.read() : null;
    if (reading) await state.readStarted.promise;
    controller.abort(new Error('private caller reason must not escape'));
    await assert.rejects(read ?? reader.read(), { code: 'STATIC_CANCELLED' });
    assert.equal(state.cancelled, 1); assert.equal(state.reason.message.includes('private caller reason'), false); reader.releaseLock();
  }
});

test('consumer cancellation cancels pending upstream reads and uses a safe reason', async t => {
  const state = { readStarted: deferred() };
  const { result } = await resource(t, response({ body: stream(['stall'], state) }));
  const reader = result.body.getReader(), pending = reader.read();
  await state.readStarted.promise;
  await reader.cancel(new Error('private consumer reason'));
  assert.equal((await pending).done, true); assert.equal(state.cancelled, 1);
  assert.equal(state.reason.code, 'STATIC_CANCELLED'); assert.equal(state.reason.message.includes('private consumer reason'), false);
  reader.releaseLock();
});

test('overall lifetime expires even while backpressured; successful completion removes abort listeners', async t => {
  const state = {};
  const { result } = await resource(t, response({ body: stream([new Uint8Array(8)], state) }), { lifetimeMs: 30 });
  await delay(60);
  await assert.rejects(consume(result.body), { code: 'STATIC_LIFETIME', status: 410 });
  assert.equal(state.cancelled, 1); assert.equal(state.pulls, undefined);
  const controller = new AbortController(), completeState = {};
  const complete = await resource(t, response({ body: stream([new Uint8Array(8)], completeState) }), { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  await consume(complete.result.body);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
  controller.abort();
  assert.equal(completeState.cancelled, undefined, 'completion detaches caller cancellation');
});

test('failure detaches caller listeners and safely handles a rejecting source cancellation', async t => {
  const controller = new AbortController(); let sourceCancelled = 0;
  const body = new ReadableStream({ pull() { return new Promise(() => {}); },
    cancel() { sourceCancelled++; throw new Error('private cancellation fixture'); } }, { highWaterMark: 0 });
  const { result } = await resource(t, response({ body }), { signal: controller.signal });
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  controller.abort();
  await assert.rejects(consume(result.body), { code: 'STATIC_CANCELLED' });
  await delay(0);
  assert.equal(sourceCancelled, 1); assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
});

test('upstream fetch/read failures are safe errors without URL, headers or private diagnostic causes', async t => {
  const privateReason = 'fixture-secret authorization http://example.invalid/private';
  await assert.rejects(fetchStaticResource({ ...input, fetchImpl: async () => { throw new Error(privateReason); } }), problem => {
    assert.equal(problem.code, 'STATIC_FETCH'); assert.equal(problem.cause, undefined); assert.equal(problem.message.includes(privateReason), false); return true;
  });
  const { result } = await resource(t, response({ body: stream([new Error(privateReason)]) }));
  await assert.rejects(consume(result.body), problem => {
    assert.equal(problem.code, 'STATIC_READ'); assert.equal(problem.cause, undefined); assert.equal(problem.message.includes(privateReason), false); return true;
  });
});
