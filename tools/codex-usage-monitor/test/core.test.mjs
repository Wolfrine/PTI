import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRateLimits, normalizeDaily, createSnapshot, fingerprint, retry, MonitorError, shouldPublish } from '../src/core.mjs';

const window = { usedPercent: 3, windowDurationMins: 10080, resetsAt: 1893456000 };
const rate = { accountId: 'synthetic-account', rateLimits: { limitId: 'codex', primary: window }, rateLimitsByLimitId: { codex: { primary: window, credits: { balance: 'not-tokens' } }, other: { limitName: 'Other allowance', secondary: { usedPercent: 120, windowDurationMins: 60, resetsAt: null } } } };
const daily = { summary: { lifetimeTokens: 999 }, dailyUsageBuckets: [{ startDate: '2026-10-23', tokens: 123456 }], threadUsage: { private: 'must-not-publish' } };
test('multi-bucket readings preserve every returned window and omit credits/identifiers', () => {
  const buckets = normalizeRateLimits(rate); assert.equal(buckets.length, 2); assert.equal(buckets[0].windows[0].remainingPercent, 97);
  assert.equal(buckets[1].windows[0].remainingPercent, 0); assert.equal(buckets[1].windows[0].usedPercent, 120);
  assert(!JSON.stringify(buckets).includes('not-tokens')); assert(!JSON.stringify(buckets).includes('synthetic-account'));
});
test('legacy fallback never invents secondary windows; missing is not zero', () => {
  const [bucket] = normalizeRateLimits({ rateLimits: { primary: { usedPercent: null, windowDurationMins: null, resetsAt: null } } });
  assert.equal(bucket.windows.length, 1); assert.equal(bucket.windows[0].remainingPercent, null);
  assert.deepEqual(normalizeRateLimits({}), []);
  assert.throws(() => normalizeRateLimits({ rateLimits: { primary: { usedPercent: '3' } } }), /invalid-source-response/);
});
test('source daily dates are retained without making today zero or using lifetime deltas', () => {
  assert.deepEqual(normalizeDaily(daily), { latest: daily.dailyUsageBuckets[0], buckets: daily.dailyUsageBuckets });
  assert.equal(normalizeDaily({ dailyUsageBuckets: null }).latest, null);
  assert.equal(normalizeDaily({ dailyUsageBuckets: [{ startDate: '2026-10-23', tokens: 0 }] }).latest.tokens, 0);
  assert.throws(() => normalizeDaily({ dailyUsageBuckets: [{ startDate: '2026-10-23', tokens: -1 }] }));
  assert.throws(() => normalizeDaily({ dailyUsageBuckets: [{ startDate: '2026-10-23', tokens: 1 }, { startDate: '2026-10-23', tokens: 2 }] }));
});
test('daily history is bounded to30 returned dates, no session/tool payloads', () => {
  const result = normalizeDaily({ ...daily, dailyUsageBuckets: Array.from({ length: 40 }, (_, i) => ({ startDate: new Date(Date.UTC(2026, 8, i + 1)).toISOString().slice(0, 10), tokens: i })) });
  assert.equal(result.buckets.length, 30); assert.equal(result.latest.tokens, 39); assert(!JSON.stringify(result).includes('private'));
});
test('partial failure preserves the old section timestamp and independently advances successful data', () => {
  const first = createSnapshot(null, { allowanceResult: rate, dailyResult: daily }, '2026-10-24T00:00:00Z');
  const next = createSnapshot(first, { allowanceError: new MonitorError('rpc-timeout'), dailyResult: daily }, '2026-10-24T00:05:00Z');
  assert.equal(next.allowance.status, 'error'); assert.equal(next.allowance.lastSuccessAt, first.allowance.lastSuccessAt);
  assert.deepEqual(next.allowance.buckets, first.allowance.buckets); assert.equal(next.daily.lastSuccessAt, next.lastAttemptAt);
});
test('unsupported and unavailable readings are explicit and never fabricated', () => {
  const snapshot = createSnapshot(null, { allowanceResult: {}, dailyError: new MonitorError('unsupported-method') });
  assert.equal(snapshot.allowance.status, 'unavailable'); assert.equal(snapshot.daily.status, 'unsupported'); assert.equal(snapshot.daily.latest, null);
});
test('identical success heartbeats publish, repeated identical total failures do not', () => {
  const success = createSnapshot(null, { allowanceResult: rate, dailyResult: daily });
  assert(shouldPublish(success, success));
  const failure = createSnapshot(success, { allowanceError: new MonitorError('rpc-timeout'), dailyError: new MonitorError('rpc-timeout') });
  assert(shouldPublish(success, failure)); assert(!shouldPublish(failure, failure));
});
test('fixed transient retry budget stops at3 calls; auth failures are not retried', async () => {
  let attempts = 0, waits = [];
  await assert.rejects(retry(async () => { attempts++; throw new MonitorError('rpc-timeout', { transient: true }); }, { sleep: async ms => waits.push(ms), random: () => 0 }), /rpc-timeout/);
  assert.equal(attempts, 3); assert.deepEqual(waits, [1000, 3000]);
  attempts = 0; await assert.rejects(retry(async () => { attempts++; throw new MonitorError('codex-login-required'); })); assert.equal(attempts, 1);
});
test('account fingerprints bind identities without serializing email', () => {
  const value = fingerprint({ type: 'chatgpt', email: 'synthetic@example.test' }, rate);
  assert.match(value, /^[a-f0-9]{64}$/); assert.notEqual(value, fingerprint({ type: 'chatgpt', email: 'other@example.test' }, rate));
  assert.throws(() => fingerprint({ type: 'apiKey' }, rate), /codex-login-required/);
});
