import { createHash } from 'node:crypto';
import { VERSION } from './config.mjs';

export class MonitorError extends Error {
  constructor(code, { transient = false } = {}) { super(code); this.code = code; this.transient = transient; }
}
const record = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const finite = x => typeof x === 'number' && Number.isFinite(x);
const optionalNumber = (x, valid) => x == null ? null : finite(x) && valid(x) ? x : invalid();
function invalid() { throw new MonitorError('invalid-source-response'); }
const label = x => typeof x === 'string' && x.trim() ? x.trim().slice(0, 120) : null;
export function normalizeRateLimits(result) {
  if (!record(result)) invalid();
  const multiple = record(result.rateLimitsByLimitId) && Object.keys(result.rateLimitsByLimitId).length > 0;
  const entries = multiple ? Object.entries(result.rateLimitsByLimitId) : result.rateLimits ? [[result.rateLimits.limitId || 'codex', result.rateLimits]] : [];
  return entries.map(([key, bucket]) => {
    if (!record(bucket)) invalid();
    const limitId = label(bucket.limitId) || label(key);
    if (!limitId) invalid();
    const windows = ['primary', 'secondary'].filter(id => bucket[id] != null).map(id => {
      const value = bucket[id]; if (!record(value)) invalid();
      const usedPercent = optionalNumber(value.usedPercent, x => x >= 0);
      return { id, usedPercent, remainingPercent: usedPercent === null ? null : Math.max(0, Math.min(100, 100 - usedPercent)),
        windowDurationMins: optionalNumber(value.windowDurationMins, x => Number.isInteger(x) && x > 0),
        resetsAt: optionalNumber(value.resetsAt, x => Number.isSafeInteger(x) && x >= 0) };
    });
    return { limitId, label: label(bucket.limitName) || limitId, windows };
  });
}
export function normalizeDaily(result) {
  if (!record(result)) invalid();
  if (result.dailyUsageBuckets == null) return { latest: null, buckets: [] };
  if (!Array.isArray(result.dailyUsageBuckets) || result.dailyUsageBuckets.length > 20_000) invalid();
  const byDate = new Map();
  for (const bucket of result.dailyUsageBuckets) {
    if (!record(bucket) || !/^\d{4}-\d{2}-\d{2}$/.test(bucket.startDate || '') ||
        !Number.isSafeInteger(bucket.tokens) || bucket.tokens < 0 ||
        new Date(`${bucket.startDate}T00:00:00Z`).toISOString().slice(0, 10) !== bucket.startDate) invalid();
    if (byDate.has(bucket.startDate) && byDate.get(bucket.startDate) !== bucket.tokens) invalid();
    byDate.set(bucket.startDate, bucket.tokens);
  }
  const buckets = [...byDate].sort(([a], [b]) => a.localeCompare(b)).slice(-30).map(([startDate, tokens]) => ({ startDate, tokens }));
  return { latest: buckets.at(-1) || null, buckets };
}
export function safeCode(error) {
  const code = error?.code;
  return ['rpc-timeout', 'rpc-exited', 'rpc-unavailable', 'unsupported-method', 'codex-login-required', 'codex-account-mismatch',
    'codex-binary-unavailable', 'invalid-source-response', 'source-unavailable', 'firebase-login-required', 'firebase-account-mismatch',
    'firebase-unavailable', 'firebase-permission-denied', 'private-rules-not-verified', 'protected-store-unavailable', 'run-timeout'].includes(code) ? code : 'source-unavailable';
}
export function fingerprint(account, limits) {
  if (!account || account.type !== 'chatgpt') throw new MonitorError('codex-login-required');
  const identity = typeof account.email === 'string' && account.email ? `email:${account.email.toLowerCase()}` :
    typeof limits?.accountId === 'string' && limits.accountId ? `id:${limits.accountId}` : null;
  if (!identity) throw new MonitorError('codex-login-required');
  return createHash('sha256').update(`pti-codex-usage-v1:${identity}`).digest('hex');
}
export function accountIdFingerprint(limits) {
  return typeof limits?.accountId === 'string' && limits.accountId ? createHash('sha256').update(`pti-codex-account-v1:${limits.accountId}`).digest('hex') : null;
}
export function createSnapshot(previous, results, now = new Date().toISOString()) {
  const previousAllowance = previous?.allowance;
  const previousDaily = previous?.daily;
  function section(prior, result, error, normalize, empty, available) {
    if (error) return { status: error.code === 'unsupported-method' ? 'unsupported' : 'error', lastAttemptAt: now,
      lastSuccessAt: prior?.lastSuccessAt || null, errorCode: safeCode(error), ...(prior ? empty(prior) : empty()) };
    try {
      const value = normalize(result);
      return { status: available(value) ? 'ok' : 'unavailable', lastAttemptAt: now, lastSuccessAt: now, errorCode: null, ...value };
    } catch (error) { return section(prior, undefined, error, normalize, empty, available); }
  }
  return {
    schemaVersion: 1, source: 'codex-app-server', collectorVersion: VERSION, lastAttemptAt: now,
    allowance: section(previousAllowance, results.allowanceResult, results.allowanceError,
      value => ({ buckets: normalizeRateLimits(value) }), prior => ({ buckets: prior?.buckets || [] }),
      value => value.buckets.some(b => b.windows.some(w => w.usedPercent !== null))),
    daily: section(previousDaily, results.dailyResult, results.dailyError, normalizeDaily,
      prior => ({ latest: prior?.latest || null, buckets: prior?.buckets || [] }), value => value.latest !== null),
  };
}
export function shouldPublish(previousPublished, snapshot) {
  if (!previousPublished) return true;
  // Fresh successful observations need a heartbeat even when percentages do not change.
  if ([snapshot.allowance, snapshot.daily].some(s => ['ok', 'unavailable'].includes(s.status))) return true;
  return ['allowance', 'daily'].some(k => snapshot[k].status !== previousPublished[k]?.status || snapshot[k].errorCode !== previousPublished[k]?.errorCode);
}
export async function retry(operation, { delays = [1000, 3000], sleep = ms => new Promise(r => setTimeout(r, ms)), random = Math.random } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await operation(attempt); }
    catch (error) {
      if (!error.transient || attempt >= delays.length) throw error;
      await sleep(delays[attempt] + Math.floor(random() * 250));
    }
  }
}
