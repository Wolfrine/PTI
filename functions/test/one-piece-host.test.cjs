const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { createOnePieceController, createOnePieceRouter, HostError } = require('../lib/one-piece-host');

const owner = { uid: '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2', aud: 'pti-app-2ab59', iss: 'https://securetoken.google.com/pti-app-2ab59' };
const worker = { uid: 'assistant-worker-sachit-windows', assistantWorker: true, workerId: 'sachit-windows', aud: 'gtop-app', iss: 'https://securetoken.google.com/gtop-app' };
const origin = 'https://pti-app-2ab59.web.app';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const poll = (extra = {}) => ({ version: '1.1.0', companionReady: false, ...extra });

function fixture() {
    let at = Date.parse('2026-10-27T12:00:00Z'), sequence = 100, state;
    let lock = Promise.resolve(), writes = 0, reads = 0;
    const store = {
        async read() { reads++; return structuredClone(state); },
        transact(update) {
            const result = lock.then(() => {
                reads++;
                const changed = update(structuredClone(state || { schemaVersion: 1, recentRequestIds: [] }));
                if (changed.write !== false) { state = changed.mailbox; writes++; }
                return changed.result;
            });
            lock = result.catch(() => {});
            return result;
        },
    };
    return { controller: createOnePieceController(store, () => at, () => id(sequence++)), advance: ms => at += ms, state: () => structuredClone(state), get writes() { return writes; }, get reads() { return reads; } };
}

test('unchanged legacy 15-second polls persist every 30 seconds and return the real persisted freshness', async () => {
    const f = fixture();
    const first = await f.controller.poll(poll({ companionReady: true }));
    f.advance(15_000);
    const skipped = await f.controller.poll(poll({ companionReady: true }));
    assert.equal(f.writes, 1); assert.equal(f.reads, 2);
    assert.equal(skipped.service.starter.lastSeenAt, first.service.starter.lastSeenAt);
    assert.equal(skipped.service.companion.lastSeenAt, first.service.companion.lastSeenAt);
    f.advance(15_000);
    const due = await f.controller.poll(poll({ companionReady: true }));
    assert.equal(f.writes, 2); assert.equal(f.reads, 3);
    assert.notEqual(due.service.starter.lastSeenAt, first.service.starter.lastSeenAt);
    f.advance(60_001);
    assert.equal((await f.controller.status()).service.state, 'starter_offline');
});

test('readiness/version changes, matching ACKs and expiry write immediately inside the heartbeat window', async () => {
    const f = fixture(); await f.controller.poll(poll());
    f.advance(1_000); await f.controller.poll(poll({ companionReady: true })); assert.equal(f.writes, 2);
    f.advance(1_000); await f.controller.poll(poll({ companionReady: true, version: '1.3.0' })); assert.equal(f.writes, 3);
    f.advance(1_000); await f.controller.poll(poll()); assert.equal(f.writes, 4);
    const accepted = await f.controller.start({ clientRequestId: id(1) });
    await f.controller.poll(poll({ lastStartResult: { requestId: accepted.service.request.id, state: 'started' } }));
    assert.equal(f.writes, 6); assert.equal(f.state().request.state, 'started');
    await f.controller.poll(poll({ lastStartResult: { requestId: accepted.service.request.id, state: 'failed' } }));
    assert.equal(f.writes, 6); assert.equal(f.state().request.state, 'started');
    f.advance(15_000); await f.controller.start({ clientRequestId: id(2) });
    f.advance(119_999); await f.controller.poll(poll());
    const before = f.writes;
    f.advance(1); await f.controller.poll(poll());
    assert.equal(f.writes, before + 1); assert.equal(f.state().request.state, 'expired');
});

test('replayed Start and concurrent unchanged polls perform no redundant writes or launches', async () => {
    const f = fixture(); await f.controller.poll(poll());
    const accepted = await f.controller.start({ clientRequestId: id(1) });
    const before = f.writes;
    await Promise.all(Array.from({ length: 10 }, () => f.controller.start({ clientRequestId: id(1) })));
    const responses = await Promise.all(Array.from({ length: 10 }, () => f.controller.poll(poll())));
    assert.equal(f.writes, before);
    assert.ok(responses.every(response => response.request.id === accepted.service.request.id));
    f.advance(30_000);
    await Promise.all(Array.from({ length: 10 }, () => f.controller.poll(poll())));
    assert.equal(f.writes, before + 1);
});

test('heartbeat decisions capture transaction execution time after queued work', async () => {
    const f = fixture(); await f.controller.poll(poll());
    const first = f.controller.poll(poll()), queued = f.controller.poll(poll());
    f.advance(30_000);
    const results = await Promise.all([first, queued]);
    assert.equal(f.writes, 2);
    assert.equal(results[0].service.starter.lastSeenAt, new Date(Date.parse('2026-10-27T12:00:00Z') + 30_000).toISOString());
    assert.equal(results[1].service.starter.lastSeenAt, results[0].service.starter.lastSeenAt);
});

test('fresh status requires measured companion health, never an accepted request', async () => {
    const f = fixture();
    assert.equal((await f.controller.status()).service.state, 'starter_offline');
    await f.controller.poll(poll());
    const initial = (await f.controller.status()).service;
    assert.equal(initial.state, 'offline'); assert.equal(initial.canStart, true);
    const accepted = await f.controller.start({ clientRequestId: id(1) });
    assert.equal(accepted.service.state, 'starting'); assert.equal(accepted.service.companion.state, 'offline');
    const result = await f.controller.poll(poll({ companionReady: true, lastStartResult: { requestId: accepted.service.request.id, state: 'started' } }));
    assert.equal(result.service.state, 'ready'); assert.equal(result.service.canStart, false); assert.equal(result.request, null);
    f.advance(60_001);
    assert.equal((await f.controller.status()).service.state, 'starter_offline');
    assert.equal((await f.controller.status()).service.companion.state, 'offline');
});

test('concurrent starts, repeated clicks and duplicate polls have one stable command', async () => {
    const f = fixture(); await f.controller.poll(poll());
    const responses = await Promise.all(Array.from({ length: 10 }, (_, i) => f.controller.start({ clientRequestId: id(i + 1) })));
    assert.equal(new Set(responses.map(value => value.service.request.id)).size, 1);
    const first = await f.controller.poll(poll()); const again = await f.controller.poll(poll());
    assert.deepEqual(first.request, again.request); assert.equal(first.request.action, 'start');
    assert.equal(f.state().recentRequestIds.length, 10);
    await f.controller.poll(poll({ lastStartResult: { requestId: first.request.id, state: 'failed', errorCode: 'start_failed' } }));
    f.advance(20_000);
    assert.equal((await f.controller.start({ clientRequestId: id(10) })).service.request.id, first.request.id);
    assert.equal((await f.controller.start({ clientRequestId: id(11) })).service.state, 'starting');
});

test('stale pending requests expire and are never delivered or rescued by a late acknowledgement', async () => {
    const f = fixture(); await f.controller.poll(poll());
    const accepted = await f.controller.start({ clientRequestId: id(1) });
    f.advance(120_000);
    const response = await f.controller.poll(poll({ lastStartResult: { requestId: accepted.service.request.id, state: 'started' } }));
    assert.equal(response.request, null); assert.equal(response.service.state, 'failed');
    assert.equal(response.service.request.state, 'expired'); assert.equal(response.service.request.errorCode, 'companion_start_timeout');
    const next = await f.controller.start({ clientRequestId: id(2) });
    const unrelated = await f.controller.poll(poll({ lastStartResult: { requestId: accepted.service.request.id, state: 'failed', errorCode: 'configuration_invalid' } }));
    assert.equal(unrelated.request.id, next.service.request.id); assert.equal(unrelated.service.request.state, 'pending');
});

test('started acknowledgement alone cannot claim a healthy companion, and duplicate acknowledgements cannot reverse a result', async () => {
    const f = fixture(); await f.controller.poll(poll());
    const accepted = await f.controller.start({ clientRequestId: id(1) });
    const result = await f.controller.poll(poll({ lastStartResult: { requestId: accepted.service.request.id, state: 'started' } }));
    assert.equal(result.service.companion.state, 'offline'); assert.notEqual(result.service.state, 'ready');
    const again = await f.controller.poll(poll({ lastStartResult: { requestId: accepted.service.request.id, state: 'failed', errorCode: 'configuration_invalid' } }));
    assert.equal(again.service.request.state, 'started'); assert.equal(again.service.request.errorCode, null);
});

test('cooldown, offline starter and bounded dedupe protect the single mailbox', async () => {
    const f = fixture();
    await assert.rejects(() => f.controller.start({ clientRequestId: id(1) }), error => error.status === 503 && error.code === 'starter_offline');
    await f.controller.poll(poll());
    let response = await f.controller.start({ clientRequestId: id(1) });
    await f.controller.poll(poll({ lastStartResult: { requestId: response.service.request.id, state: 'failed' } }));
    await assert.rejects(() => f.controller.start({ clientRequestId: id(2) }), error => error.status === 429 && error.code === 'start_cooldown');
    for (let i = 2; i <= 80; i++) {
        f.advance(15_000); await f.controller.poll(poll());
        response = await f.controller.start({ clientRequestId: id(i) });
        await f.controller.poll(poll({ lastStartResult: { requestId: response.service.request.id, state: 'failed', errorCode: 'start_failed' } }));
    }
    assert.equal(f.state().recentRequestIds.length, 64);
    assert.ok(JSON.stringify(f.state()).length < 4000);
});

test('fixed schemas reject arbitrary commands, URLs, paths, unknown errors and malformed acknowledgements', async () => {
    const f = fixture(); await f.controller.poll(poll());
    for (const body of [null, [], {}, { clientRequestId: 'bad' }, { clientRequestId: id(1), target: 'gtop' }, { clientRequestId: id(1), command: 'anything' }, { clientRequestId: id(1), path: 'F:\\secret' }, { clientRequestId: id(1), url: 'https://example.com' }]) {
        await assert.rejects(() => f.controller.start(body), error => error instanceof HostError && error.status === 400);
    }
    for (const body of [null, {}, poll({ version: 'x'.repeat(65) }), poll({ companionReady: 'true' }), poll({ command: 'run' }), poll({ lastStartResult: { requestId: id(1), state: 'failed', errorCode: 'raw secret exception' } }), poll({ lastStartResult: { requestId: id(1), state: 'started', errorCode: 'start_failed' } }), poll({ lastStartResult: { requestId: id(1), state: 'failed', details: 'private' } })]) {
        await assert.rejects(() => f.controller.poll(body), error => error.status === 400);
    }
});

test('router isolates owner PTI identity and exact GTOP worker claims; CORS is explicit', async t => {
    const f = fixture();
    const tokens = { owner, worker, other: { ...owner, uid: 'other' }, wrongProject: { ...owner, aud: 'gtop-app' }, wrongIssuer: { ...owner, iss: 'https://securetoken.google.com/gtop-app' }, badWorker: { ...worker, workerId: 'different' }, notWorker: { ...worker, assistantWorker: false }, wrongWorkerUid: { ...worker, uid: 'other' }, wrongWorkerIssuer: { ...worker, iss: 'https://securetoken.google.com/pti-app-2ab59' }, wrongWorkerProject: { ...worker, aud: 'pti-app-2ab59' } };
    const verify = async token => { if (!tokens[token]) throw Error('secret credential failure'); return tokens[token]; };
    const server = http.createServer(createOnePieceRouter({ controller: f.controller, verifyOwner: verify, verifyWorker: verify }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const base = `http://127.0.0.1:${server.address().port}`;
    const call = (path, { token = 'owner', browserOrigin = origin, method = 'GET', body, headers = {} } = {}) => fetch(base + path, { method, headers: { ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(browserOrigin ? { Origin: browserOrigin } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    assert.equal((await call('/status')).status, 200);
    for (const token of ['other', 'wrongProject', 'wrongIssuer', 'worker']) assert.equal((await call('/status', { token })).status, 403);
    assert.equal((await call('/status', { token: 'invalid' })).status, 401);
    assert.equal((await call('/status', { browserOrigin: null })).status, 403);
    const denied = await call('/status', { browserOrigin: 'https://attacker.example' });
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
    for (const token of ['owner', 'badWorker', 'notWorker', 'wrongWorkerUid', 'wrongWorkerIssuer', 'wrongWorkerProject']) assert.equal((await call('/poll', { token, browserOrigin: null, method: 'POST', body: poll() })).status, 403);
    assert.equal((await call('/poll', { token: 'worker', browserOrigin: null, method: 'POST', body: poll() })).status, 200);
    assert.equal((await call('/poll', { token: 'worker', method: 'POST', body: poll() })).status, 403);
    const preflight = await call('/start', { token: null, method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'Authorization,Content-Type' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), origin);
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);
    assert.equal((await call('/start', { token: null, method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'X-Command' } })).status, 403);
    assert.equal((await call('/start', { method: 'POST', body: { clientRequestId: id(1) } })).status, 200);
    assert.equal((await call('/start?target=other', { method: 'POST', body: { clientRequestId: id(1) } })).status, 400);
    assert.equal((await call('/start', { method: 'GET' })).status, 405);
    assert.equal((await call('/unknown')).status, 404);
    const tooLarge = await call('/start', { method: 'POST', body: { clientRequestId: id(1), ignored: 'x'.repeat(3000) } });
    assert.equal(tooLarge.status, 413);
    const malformed = await fetch(base + '/start', { method: 'POST', headers: { Origin: origin, Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: '{' });
    assert.equal(malformed.status, 400);
});

test('unexpected persistence errors are sanitized instead of disclosing deployment internals', async t => {
    const controller = { status: async () => { throw Error('private signing key or filesystem path'); } };
    const server = http.createServer(createOnePieceRouter({ controller, verifyOwner: async () => owner, verifyWorker: async () => worker }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    t.after(() => new Promise(resolve => server.close(resolve)));
    const result = await fetch(`http://127.0.0.1:${server.address().port}/status`, { headers: { Authorization: 'Bearer owner', Origin: origin } });
    assert.equal(result.status, 503); assert.deepEqual(await result.json(), { error: 'service_unavailable' });
});
