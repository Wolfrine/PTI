import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { JellyfinClient } from '../src/media/jellyfin.mjs';

const base = 'http://127.0.0.1:18096';
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const client = options => new JellyfinClient({ originalRoot: 'H:/explicit-admission-fixture/originals', transcodeRoot: 'H:/explicit-admission-fixture/transcodes', tokenProvider: () => 'fixture-only-secret', ...options });

test('engine admissions serialize only until headers; an unread body never blocks the next response', async () => {
  const first = deferred(), calls = []; let bodyControl;
  const engine = client({ fetchImpl: async url => { calls.push(url); return calls.length === 1 ? first.promise : new Response('second fixture body'); } });
  const a = engine.fetchHeaders(base + '/System/Info'), b = engine.fetchHeaders(base + '/Videos/fixture');
  await delay(5); assert.equal(calls.length, 1);
  first.resolve(new Response(new ReadableStream({ start(controller) { bodyControl = controller; } })));
  const firstResponse = await a, secondResponse = await b;
  assert.equal(firstResponse.bodyUsed, false); assert.equal(await secondResponse.text(), 'second fixture body'); assert.equal(calls.length, 2);
  bodyControl.enqueue(Buffer.from('first fixture body')); bodyControl.close(); assert.equal(await firstResponse.text(), 'first fixture body');
  assert.equal(engine.pendingHeaders, 0);
});

test('cancelled queued admissions never fetch or release a predecessor; failed headers release later tickets', async () => {
  const first = deferred(), abort = new AbortController(), calls = [];
  const engine = client({ fetchImpl: async url => { calls.push(url); return calls.length === 1 ? first.promise : new Response('third'); } });
  const a = engine.fetchHeaders(base + '/first'), b = engine.fetchHeaders(base + '/cancelled', { signal: abort.signal }), c = engine.fetchHeaders(base + '/third');
  void a.catch(() => {}); abort.abort(new Error('fixture caller cancellation')); await assert.rejects(b, /fixture caller cancellation/);
  await delay(5); assert.deepEqual(calls, [base + '/first']); first.reject(new Error('fixture upstream header failure'));
  await assert.rejects(a, /fixture upstream header failure/); assert.equal(await (await c).text(), 'third');
  assert.deepEqual(calls, [base + '/first', base + '/third']); assert.equal(engine.pendingHeaders, 0);
});

test('a caller deadline cannot release an uncooperative active fetch before its real headers; late body is cancelled', async () => {
  const first = deferred(); let calls = 0, lateCancels = 0;
  const engine = client({ headerAdmissionTimeoutMs: 20, fetchImpl: async () => ++calls === 1 ? first.promise : new Response('recovered') });
  await assert.rejects(engine.fetchHeaders(base + '/first'), { code: 'ENGINE_HEADER_TIMEOUT' });
  const next = engine.fetchHeaders(base + '/next'); await delay(5); assert.equal(calls, 1, 'The old underlying header operation is still active');
  first.resolve(new Response(new ReadableStream({ cancel() { lateCancels++; return new Promise(() => {}); } })));
  assert.equal(await (await next).text(), 'recovered');
  await delay(5); assert.equal(lateCancels, 1); assert.equal(engine.pendingHeaders, 0);
});

test('queue admission has a finite32-ticket cap and abort drains only after the underlying request settles', async () => {
  const abort = new AbortController(), active = deferred(); let calls = 0;
  const engine = client({ fetchImpl: async () => { calls++; return active.promise; } });
  const pending = Array.from({ length: 32 }, (_, i) => engine.fetchHeaders(base + `/fixture-${i}`, { signal: abort.signal }));
  for (const promise of pending) void promise.catch(() => {});
  await assert.rejects(engine.fetchHeaders(base + '/too-many'), { code: 'ENGINE_BUSY' }); await delay(5); abort.abort(new Error('fixture shutdown'));
  await Promise.allSettled(pending); assert.equal(calls, 1); assert.equal(engine.pendingHeaders, 32);
  active.reject(new Error('Fixture native transport acknowledged abort')); await delay(5); assert.equal(engine.pendingHeaders, 0);
});

test('JSON administration and strict prepared static resources share the same header boundary', async () => {
  let active = 0, maximum = 0;
  const item = '11111111111111111111111111111111', source = '22222222222222222222222222222222';
  const videoPath = `/Videos/${item}/stream.mp4?MediaSourceId=${source}&Static=true`;
  const engine = client({ fetchImpl: async (url, options) => {
    assert.match(options.headers.Authorization, /fixture-only-secret/); active++; maximum = Math.max(maximum, active); await delay(10); active--;
    if (url.endsWith('/System/Info')) return new Response(JSON.stringify({ fixture: true }));
    return new Response('mp4!', { status: 206, headers: { 'content-type': 'video/mp4', 'content-length': '4', 'content-range': 'bytes 0-3/4', 'accept-ranges': 'bytes' } });
  } });
  engine.sessions.set('fixture', { mode: 'prepared-mp4', videoPath, subtitlePath: '/unread-fixture-caption', allowed: new Set([videoPath]), byteLength: 4, deviceId: 'fixture' });
  const [admin, video] = await Promise.all([engine.request('/System/Info'), engine.getPlaybackResource('fixture', videoPath, { range: 'bytes=0-3' })]);
  assert.equal(admin.fixture, true); assert.equal(video.status, 206); assert.equal(await new Response(video.body).text(), 'mp4!'); assert.equal(maximum, 1);
});
