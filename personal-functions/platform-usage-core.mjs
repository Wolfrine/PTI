// The dashboard consumes one owner-only snapshot. No provider tokens, raw account
// identifiers, logs or individual workflow records are persisted.
export const PTI_PROJECT = 'pti-app-2ab59';
export const PTI_REPOSITORY = 'Wolfrine/PTI';
export const SOURCE = 'pti-platform-usage';

const githubHeaders = token => ({
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2026-03-10',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});
const validNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const validCount = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export async function requestJson(url, headers, fetchImpl = fetch) {
  const response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(15000), redirect: 'error' });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`source-http-${response.status}`);
  }
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > 2_000_000) { await response.body?.cancel(); throw new Error('source-payload-too-large'); }
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new Error('source-payload-too-large');
  return JSON.parse(raw);
}

export function parseGithubBilling(value) {
  if (!Array.isArray(value?.usageItems)) throw new Error('github-billing-schema');
  const actions = value.usageItems.filter(item => item?.product === 'Actions' && item?.unitType === 'minutes');
  let minutes = 0, dollars = 0;
  for (const item of actions) {
    const quantity = validNumber(item.grossQuantity ?? item.quantity);
    const amount = validNumber(item.netAmount);
    if (quantity === null || amount === null) throw new Error('github-billing-schema');
    minutes += quantity; dollars += amount;
  }
  return { billedActionsMinutes: minutes, billedActionsUsd: Number(dollars.toFixed(6)) };
}

export async function collectGithub({ now, billingToken, workflowToken, fetchImpl = fetch }) {
  const end = new Date(now), start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const period = end.toISOString().slice(0, 7);
  const github = { status: 'not-connected', period, billedActionsMinutes: null, billedActionsUsd: null,
    workflowRuns24h: null, failedRuns24h: null, workflowRepoScope: PTI_REPOSITORY };
  let billingOk = false, workflowsOk = false;

  if (billingToken) {
    try {
      const url = new URL('https://api.github.com/users/Wolfrine/settings/billing/usage/summary');
      url.searchParams.set('year', period.slice(0, 4)); url.searchParams.set('month', String(end.getUTCMonth() + 1));
      Object.assign(github, parseGithubBilling(await requestJson(url, githubHeaders(billingToken), fetchImpl)));
      billingOk = true;
    } catch { /* A missing billing grant is not zero usage. */ }
  }

  try {
    const runs = [];
    let expected = null;
    for (let page = 1; page <= 10; page++) {
      const url = new URL(`https://api.github.com/repos/${PTI_REPOSITORY}/actions/runs`);
      url.searchParams.set('per_page', '100'); url.searchParams.set('page', String(page));
      url.searchParams.set('created', `>=${start.toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
      const result = await requestJson(url, githubHeaders(workflowToken || billingToken), fetchImpl);
      if (!Array.isArray(result?.workflow_runs) || validCount(result.total_count) === null) throw new Error('github-workflow-schema');
      expected = result.total_count;
      runs.push(...result.workflow_runs);
      if (runs.length >= expected) break;
    }
    if (expected === null || runs.length < expected) throw new Error('github-workflows-truncated');
    github.workflowRuns24h = expected;
    github.failedRuns24h = runs.filter(run => run?.conclusion === 'failure').length;
    workflowsOk = true;
  } catch { /* GitHub may refuse a private repository without Actions read. */ }

  github.status = billingOk && workflowsOk ? 'ok' : billingOk || workflowsOk ? 'partial' : billingToken || workflowToken ? 'error' : 'not-connected';
  return github;
}

export function sumMonitoringSeries(value) {
  if (!Array.isArray(value?.timeSeries) || !value.timeSeries.length) return null;
  let sum = 0, observed = false;
  for (const series of value.timeSeries) {
    if (!Array.isArray(series?.points)) continue;
    for (const point of series.points) {
      const raw = point?.value?.int64Value ?? point?.value?.doubleValue;
      const numeric = typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : validNumber(raw);
      if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error('monitoring-metric-schema');
      sum += numeric; observed = true;
      if (!Number.isSafeInteger(sum)) throw new Error('monitoring-metric-overflow');
    }
  }
  return observed ? sum : null;
}

export async function collectFirestoreMetric({ projectId, metric, start, end, token, fetchImpl = fetch }) {
  // These are successful operations, not exact billable units. Use DB-scoped
  // time series rather than old SDK connection-level counts.
  const url = new URL(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`);
  url.searchParams.set('filter', `metric.type="firestore.googleapis.com/document/${metric}_ops_count"`);
  url.searchParams.set('interval.startTime', start);
  url.searchParams.set('interval.endTime', end);
  url.searchParams.set('aggregation.alignmentPeriod', '3600s');
  url.searchParams.set('aggregation.perSeriesAligner', 'ALIGN_SUM');
  url.searchParams.set('view', 'FULL');
  url.searchParams.set('pageSize', '1000');
  let sum = 0, observed = false, nextPageToken = '';
  for (let page = 0; page < 10; page++) {
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);
    const result = await requestJson(url, { Authorization: `Bearer ${token}` }, fetchImpl);
    const partial = sumMonitoringSeries(result);
    if (partial !== null) { sum += partial; observed = true; }
    if (!Number.isSafeInteger(sum)) throw new Error('monitoring-metric-overflow');
    nextPageToken = typeof result?.nextPageToken === 'string' ? result.nextPageToken : '';
    if (!nextPageToken) return observed ? sum : null;
  }
  throw new Error('monitoring-results-truncated');
}

export function projectIds(configured = '') {
  return [...new Set([PTI_PROJECT, ...configured.split(',').map(value => value.trim())])]
    .filter(value => /^[a-z][a-z0-9-]{3,40}$/.test(value)).slice(0, 12);
}

export async function collectFirebase({ now, token, projects, fetchImpl = fetch }) {
  const start = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const results = [];
  for (const projectId of projects) {
    const result = { projectId, status: token ? 'error' : 'not-connected', reads24h: null, writes24h: null, deletes24h: null };
    const read = token ? await Promise.allSettled(['read', 'write', 'delete'].map(metric =>
      collectFirestoreMetric({ projectId, metric, start, end: now, token, fetchImpl }))) : [];
    for (let i = 0; i < read.length; i++) {
      if (read[i].status === 'fulfilled') result[['reads24h', 'writes24h', 'deletes24h'][i]] = read[i].value;
    }
    if (read.length && read.every(item => item.status === 'fulfilled')) result.status = 'ok';
    results.push(result);
  }
  const successful = results.filter(item => item.status === 'ok').length;
  return { status: !token ? 'not-connected' : successful === results.length ? 'ok' : successful ? 'partial' : 'error', projects: results };
}

export async function createPlatformSnapshot({ now = new Date().toISOString(), billingToken = '', workflowToken = '',
  cloudToken = '', configuredProjects = '', fetchImpl = fetch } = {}) {
  if (!Number.isFinite(Date.parse(now))) throw new Error('invalid-collection-time');
  const [github, firebase] = await Promise.all([
    collectGithub({ now, billingToken, workflowToken, fetchImpl }),
    collectFirebase({ now, token: cloudToken, projects: projectIds(configuredProjects), fetchImpl }),
  ]);
  return { schemaVersion: 1, source: SOURCE, collectedAt: now, github, firebase };
}
