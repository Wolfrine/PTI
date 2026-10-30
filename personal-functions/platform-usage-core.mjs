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
const metrics = ['read', 'write', 'delete'];
const repoPattern = /^Wolfrine\/[a-zA-Z0-9_.-]{1,100}$/;

export function repositories(configured = []) {
  const result = new Map([[PTI_REPOSITORY, { repo: PTI_REPOSITORY, archived: false }]]);
  for (const item of Array.isArray(configured) ? configured : []) {
    if (!item || typeof item.repo !== 'string' || !repoPattern.test(item.repo)) continue;
    if (item.repo === PTI_REPOSITORY) continue;
    result.set(item.repo, { repo: item.repo, archived: item.archived === true });
    if (result.size >= 50) break;
  }
  return [...result.values()];
}

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

async function githubRuns({ repo, start, token, fetchImpl }) {
  const runs = [];
  let expected = null;
  for (let page = 1; page <= 10; page++) {
    const url = new URL(`https://api.github.com/repos/${repo}/actions/runs`);
    url.searchParams.set('per_page', '100'); url.searchParams.set('page', String(page));
    url.searchParams.set('created', `>=${start.toISOString().replace(/\.\d{3}Z$/, 'Z')}`);
    const result = await requestJson(url, githubHeaders(token), fetchImpl);
    if (!Array.isArray(result?.workflow_runs) || validCount(result.total_count) === null) throw new Error('github-workflow-schema');
    expected = result.total_count;
    runs.push(...result.workflow_runs);
    if (runs.length >= expected) break;
  }
  if (expected === null || runs.length < expected) throw new Error('github-workflows-truncated');
  return { runs24h: expected, failed24h: runs.filter(run => run?.conclusion === 'failure').length };
}

async function discoverGithubRepositories(token, fetchImpl) {
  if (!token) return [];
  const discovered = [];
  for (let page = 1; page <= 3; page++) {
    const url = new URL('https://api.github.com/user/repos');
    url.searchParams.set('affiliation', 'owner'); url.searchParams.set('per_page', '100');
    url.searchParams.set('page', String(page));
    const items = await requestJson(url, githubHeaders(token), fetchImpl);
    if (!Array.isArray(items)) throw new Error('github-repository-schema');
    for (const item of items) {
      if (repoPattern.test(item?.full_name)) discovered.push({ repo: item.full_name, archived: item.archived === true });
    }
    if (items.length < 100) break;
  }
  return discovered;
}

export async function collectGithub({ now, billingToken, workflowToken, repositoryConfig = [], fetchImpl = fetch }) {
  const end = new Date(now), start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  const period = end.toISOString().slice(0, 7);
  const github = { status: 'not-connected', period, billedActionsMinutes: null, billedActionsUsd: null,
    workflowRuns24h: null, failedRuns24h: null, workflowRepoScope: PTI_REPOSITORY,
    repos: [], repositoryCount: 0, coveredRepoCount: 0, archivedExcluded: 0 };
  let billingOk = false;

  if (billingToken) {
    try {
      const url = new URL('https://api.github.com/users/Wolfrine/settings/billing/usage/summary');
      url.searchParams.set('year', period.slice(0, 4)); url.searchParams.set('month', String(end.getUTCMonth() + 1));
      Object.assign(github, parseGithubBilling(await requestJson(url, githubHeaders(billingToken), fetchImpl)));
      billingOk = true;
    } catch { /* A missing billing grant is not zero usage. */ }
  }

  let discovered = [];
  try { discovered = await discoverGithubRepositories(billingToken, fetchImpl); }
  catch { /* A restricted Plan token need not grant repository enumeration. */ }
  const registry = repositories([...repositoryConfig, ...discovered]);
  const active = registry.filter(repo => !repo.archived);
  github.repositoryCount = active.length;
  github.archivedExcluded = registry.length - active.length;
  github.workflowRepoScope = active.length > 1 ? 'Wolfrine' : PTI_REPOSITORY;

  // Bound parallel requests. A scoped token reveals private repo usage; the
  // built-in token still supports PTI and publicly readable repositories.
  for (let offset = 0; offset < active.length; offset += 4) {
    const chunk = await Promise.all(active.slice(offset, offset + 4).map(async ({ repo }) => {
      const token = repo === PTI_REPOSITORY ? workflowToken || billingToken : billingToken || workflowToken;
      try {
        const reading = await githubRuns({ repo, start, token, fetchImpl });
        return { repo, status: 'ok', ...reading };
      } catch (error) {
        const denied = /source-http-(?:401|403|404)/.test(String(error));
        return { repo, status: denied ? 'not-connected' : 'error', runs24h: null, failed24h: null };
      }
    }));
    github.repos.push(...chunk);
  }
  const connected = github.repos.filter(item => item.status === 'ok');
  github.coveredRepoCount = connected.length;
  if (connected.length) {
    github.workflowRuns24h = connected.reduce((sum, item) => sum + item.runs24h, 0);
    github.failedRuns24h = connected.reduce((sum, item) => sum + item.failed24h, 0);
  }
  const workflowsOk = connected.length === active.length;
  github.status = billingOk && workflowsOk ? 'ok' : billingOk || connected.length ? 'partial' : billingToken || workflowToken ? 'error' : 'not-connected';
  return github;
}

export function monitoringBreakdown(value) {
  if (value?.timeSeries !== undefined && !Array.isArray(value.timeSeries)) throw new Error('monitoring-metric-schema');
  let sum = 0, observed = false;
  const byDatabase = Object.create(null);
  for (const series of value?.timeSeries || []) {
    if (!Array.isArray(series?.points)) continue;
    const databaseId = series?.resource?.type === 'firestore.googleapis.com/Database' &&
      typeof series?.resource?.labels?.database_id === 'string' &&
      /^[a-zA-Z0-9_()\-]{1,100}$/.test(series.resource.labels.database_id)
      ? series.resource.labels.database_id : null;
    for (const point of series.points) {
      const raw = point?.value?.int64Value ?? point?.value?.doubleValue;
      const numeric = typeof raw === 'string' && /^\d+(?:\.\d+)?$/.test(raw) ? Number(raw) : validNumber(raw);
      if (!Number.isSafeInteger(numeric) || numeric < 0) throw new Error('monitoring-metric-schema');
      sum += numeric; observed = true;
      if (!Number.isSafeInteger(sum)) throw new Error('monitoring-metric-overflow');
      if (databaseId) {
        byDatabase[databaseId] = (byDatabase[databaseId] || 0) + numeric;
        if (!Number.isSafeInteger(byDatabase[databaseId])) throw new Error('monitoring-metric-overflow');
      }
    }
  }
  return { total: observed ? sum : null, byDatabase: { ...byDatabase } };
}

export function sumMonitoringSeries(value) {
  if (!Array.isArray(value?.timeSeries)) return null;
  return monitoringBreakdown(value).total;
}

export async function collectFirestoreMetricDetails({ projectId, metric, start, end, token, fetchImpl = fetch }) {
  // These are successful operations, not exact billable units. Use DB-scoped
  // time series rather than old SDK connection-level counts.
  const url = new URL(`https://monitoring.googleapis.com/v3/projects/${projectId}/timeSeries`);
  if (!metrics.includes(metric)) throw new Error('unexpected-firestore-metric');
  url.searchParams.set('filter', `metric.type="firestore.googleapis.com/document/${metric}_ops_count" AND resource.type="firestore.googleapis.com/Database"`);
  url.searchParams.set('interval.startTime', start);
  url.searchParams.set('interval.endTime', end);
  url.searchParams.set('aggregation.alignmentPeriod', '3600s');
  url.searchParams.set('aggregation.perSeriesAligner', 'ALIGN_SUM');
  url.searchParams.set('view', 'FULL');
  url.searchParams.set('pageSize', '1000');
  let sum = 0, observed = false, nextPageToken = '';
  const byDatabase = Object.create(null);
  for (let page = 0; page < 10; page++) {
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);
    const result = await requestJson(url, { Authorization: `Bearer ${token}` }, fetchImpl);
    const partial = monitoringBreakdown(result);
    if (partial.total !== null) { sum += partial.total; observed = true; }
    if (!Number.isSafeInteger(sum)) throw new Error('monitoring-metric-overflow');
    for (const [databaseId, value] of Object.entries(partial.byDatabase)) {
      byDatabase[databaseId] = (byDatabase[databaseId] || 0) + value;
      if (!Number.isSafeInteger(byDatabase[databaseId])) throw new Error('monitoring-metric-overflow');
    }
    nextPageToken = typeof result?.nextPageToken === 'string' ? result.nextPageToken : '';
    if (!nextPageToken) return { total: observed ? sum : null, byDatabase: { ...byDatabase } };
  }
  throw new Error('monitoring-results-truncated');
}

export async function collectFirestoreMetric(options) {
  return (await collectFirestoreMetricDetails(options)).total;
}

export function projectIds(configured = '', registered = []) {
  const configuredList = typeof configured === 'string' ? configured.split(',') : [];
  return [...new Set([PTI_PROJECT, ...configuredList, ...(Array.isArray(registered) ? registered : [])].map(value =>
    typeof value === 'string' ? value.trim() : ''))]
    .filter(value => /^[a-z][a-z0-9-]{3,40}$/.test(value)).slice(0, 32);
}

// Quota periods reset at Pacific midnight, including DST switches. Calculating
// both boundaries by local calendar time avoids a false 24-hour quota window.
const pacificParts = instant => {
  const formatted = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(instant));
  return Object.fromEntries(formatted.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]));
};

function pacificMidnightUtc(year, month, day) {
  const target = Date.UTC(year, month - 1, day);
  let guess = target + 8 * 60 * 60 * 1000;
  for (let tries = 0; tries < 4; tries++) {
    const p = pacificParts(guess);
    const represented = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const delta = represented - target;
    if (delta === 0) return new Date(guess).toISOString();
    guess -= delta;
  }
  throw new Error('pacific-midnight-not-resolved');
}

export function pacificUsageWindow(now) {
  const instant = new Date(now);
  if (!Number.isFinite(instant.getTime())) throw new Error('invalid-collection-time');
  const p = pacificParts(instant);
  const tomorrow = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return {
    dayPacific: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`,
    start: pacificMidnightUtc(p.year, p.month, p.day),
    nextResetAt: pacificMidnightUtc(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth() + 1, tomorrow.getUTCDate()),
  };
}

export async function listFirestoreDatabases({ projectId, token, fetchImpl = fetch }) {
  const all = [], seen = new Set();
  const url = new URL(`https://firestore.googleapis.com/v1/projects/${projectId}/databases`);
  url.searchParams.set('pageSize', '100');
  let nextPageToken = '';
  for (let page = 0; page < 10; page++) {
    if (nextPageToken) url.searchParams.set('pageToken', nextPageToken);
    const result = await requestJson(url, { Authorization: `Bearer ${token}` }, fetchImpl);
    if (result?.databases !== undefined && !Array.isArray(result.databases)) throw new Error('firestore-databases-schema');
    for (const database of result?.databases || []) {
      const match = typeof database?.name === 'string' &&
        database.name.match(new RegExp(`^projects/${projectId}/databases/([a-zA-Z0-9_()\\-]{1,100})$`));
      if (!match || seen.has(match[1])) continue;
      seen.add(match[1]);
      all.push({ databaseId: match[1], freeTier: typeof database.freeTier === 'boolean' ? database.freeTier : null,
        edition: database.databaseEdition === 'STANDARD' || database.databaseEdition === 'ENTERPRISE'
          ? database.databaseEdition : null });
    }
    nextPageToken = typeof result?.nextPageToken === 'string' ? result.nextPageToken : '';
    if (!nextPageToken) return all;
  }
  throw new Error('firestore-databases-truncated');
}

export async function collectFirebase({ now, token, projects, fetchImpl = fetch }) {
  const start = new Date(new Date(now).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const pacific = pacificUsageWindow(now);
  const results = [];
  for (const projectId of projects) {
    const result = { projectId, status: token ? 'error' : 'not-connected', reads24h: null, writes24h: null, deletes24h: null,
      databaseMetadataStatus: token ? 'unavailable' : 'not-connected', databases: [] };
    if (!token) { results.push(result); continue; }
    const responses = await Promise.allSettled([
      listFirestoreDatabases({ projectId, token, fetchImpl }),
      ...metrics.map(metric => collectFirestoreMetricDetails({ projectId, metric, start, end: now, token, fetchImpl })),
      ...metrics.map(metric => collectFirestoreMetricDetails({ projectId, metric, start: pacific.start, end: now, token, fetchImpl })),
    ]);
    const metadata = responses[0].status === 'fulfilled' ? responses[0].value : [];
    if (responses[0].status === 'fulfilled') result.databaseMetadataStatus = 'ok';
    const daily = responses.slice(4);
    const allIds = new Set(metadata.map(item => item.databaseId));
    for (const reading of daily) if (reading.status === 'fulfilled') {
      for (const id of Object.keys(reading.value.byDatabase)) allIds.add(id);
    }
    for (let i = 0; i < metrics.length; i++) {
      if (responses[i + 1].status === 'fulfilled') {
        result[`${metrics[i]}s24h`] = responses[i + 1].value.total;
      }
    }
    result.databases = [...allIds].map(databaseId => {
      const details = metadata.find(item => item.databaseId === databaseId);
      const database = { databaseId, freeTier: details?.freeTier ?? null, edition: details?.edition ?? null,
        status: daily.every(item => item.status === 'fulfilled') ? 'ok' : 'error',
        readsToday: null, writesToday: null, deletesToday: null };
      for (let i = 0; i < metrics.length; i++) if (daily[i].status === 'fulfilled') {
        database[`${metrics[i]}sToday`] = daily[i].value.byDatabase[databaseId] ?? null;
      }
      return database;
    });
    if (responses.slice(1, 4).every(item => item.status === 'fulfilled')) result.status = 'ok';
    results.push(result);
  }
  const successful = results.filter(item => item.status === 'ok').length;
  const metadataComplete = results.every(item => item.databaseMetadataStatus === 'ok');
  const dailyComplete = results.every(item => item.databases.every(database => database.status === 'ok'));
  return { status: !token ? 'not-connected' : successful === results.length && metadataComplete && dailyComplete ? 'ok'
    : successful ? 'partial' : 'error', dayPacific: pacific.dayPacific, nextResetAt: pacific.nextResetAt, projects: results };
}

export async function createPlatformSnapshot({ now = new Date().toISOString(), billingToken = '', workflowToken = '',
  cloudToken = '', configuredProjects = '', registeredProjects = [], repositoryConfig = [], fetchImpl = fetch } = {}) {
  if (!Number.isFinite(Date.parse(now))) throw new Error('invalid-collection-time');
  const [github, firebase] = await Promise.all([
    collectGithub({ now, billingToken, workflowToken, repositoryConfig, fetchImpl }),
    collectFirebase({ now, token: cloudToken, projects: projectIds(configuredProjects, registeredProjects), fetchImpl }),
  ]);
  return { schemaVersion: 1, source: SOURCE, collectedAt: now, github, firebase };
}
