import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGithub, collectFirebase, createPlatformSnapshot, listFirestoreDatabases, monitoringBreakdown,
  pacificUsageWindow, parseGithubBilling, projectIds, repositories, sumMonitoringSeries } from './platform-usage-core.mjs';

const now = '2026-10-30T08:00:00.000Z';
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

test('GitHub billing is explicitly billed Actions minutes and net spend', () => {
  assert.deepEqual(parseGithubBilling({ usageItems: [
    { product: 'Actions', unitType: 'minutes', grossQuantity: 43, netAmount: 0 },
    { product: 'Actions', unitType: 'minutes', grossQuantity: 9, netAmount: 0.12 },
    { product: 'Codespaces', unitType: 'gigabyte-hours', grossQuantity: 10, netAmount: 1.2 },
  ] }), { billedActionsMinutes: 52, billedActionsUsd: 0.12 });
  assert.throws(() => parseGithubBilling({ usageItems: [{ product: 'Actions', unitType: 'minutes', grossQuantity: '0', netAmount: 0 }] }), /schema/);
});

test('GitHub workload and optional billing are distinct, with correct 24h scope', async () => {
  const urls = [];
  const fetchImpl = async (url, options) => {
    urls.push({ url: String(url), authorization: options.headers.Authorization });
    if (String(url).includes('billing/usage')) return json({ usageItems: [{ product: 'Actions', unitType: 'minutes', grossQuantity: 9, netAmount: 0.07 }] });
    if (String(url).includes('/user/repos')) return json([]);
    return json({ total_count: 2, workflow_runs: [{ conclusion: 'failure' }, { conclusion: 'success' }] });
  };
  const output = await collectGithub({ now, billingToken: 'synthetic-billing', workflowToken: 'synthetic-workflow', fetchImpl });
  assert.equal(output.status, 'ok');
  assert.equal(output.period, '2026-10');
  assert.equal(output.billedActionsMinutes, 9);
  assert.equal(output.failedRuns24h, 1);
  assert.equal(output.workflowRepoScope, 'Wolfrine/PTI');
  assert.equal(urls[0].authorization, 'Bearer synthetic-billing');
  assert.match(urls.find(item => item.url.includes('/actions/runs')).url, /created=%3E%3D2026-10-29T08%3A00%3A00Z/);
});

test('a missing billing permission never creates fictional zero billed usage', async () => {
  const output = await collectGithub({ now, workflowToken: 'synthetic-workflow', fetchImpl: async url =>
    String(url).includes('billing/usage') ? json({}, 403) : json({ total_count: 0, workflow_runs: [] }) });
  assert.equal(output.status, 'partial');
  assert.equal(output.billedActionsMinutes, null);
  assert.equal(output.workflowRuns24h, 0);
  assert.equal(output.failedRuns24h, 0);
});

test('incomplete GitHub workflow pagination is unavailable, not underestimated', async () => {
  const output = await collectGithub({ now, workflowToken: 'synthetic-workflow', fetchImpl: async () => json({ total_count: 101, workflow_runs: [] }) });
  assert.equal(output.status, 'error');
  assert.equal(output.workflowRuns24h, null);
});

test('Firestore metrics are summed across database series without inventing missing data', async () => {
  assert.equal(sumMonitoringSeries({}), null);
  assert.equal(sumMonitoringSeries({ timeSeries: [] }), null);
  assert.equal(sumMonitoringSeries({ timeSeries: [{ points: [{ value: { int64Value: '12' } }, { value: { int64Value: '3' } }] }] }), 15);
  assert.throws(() => sumMonitoringSeries({ timeSeries: [{ points: [{ value: { int64Value: '3' } }, { value: { int64Value: 'bad' } }] }] }), /schema/);
  const fetchImpl = async url => {
    const filter = new URL(url).searchParams.get('filter');
    if (filter?.includes('read_ops_count')) return json({ timeSeries: [{ points: [{ value: { int64Value: '71' } }] }] });
    if (filter?.includes('write_ops_count')) return json({ timeSeries: [{ points: [{ value: { int64Value: '8' } }] }] });
    return json({ timeSeries: [] });
  };
  const output = await collectFirebase({ now, token: 'synthetic-cloud', projects: ['pti-app-2ab59'], fetchImpl });
  assert.equal(output.status, 'ok');
  assert.deepEqual(output.projects, [{ projectId: 'pti-app-2ab59', status: 'ok', reads24h: 71, writes24h: 8,
    deletes24h: null, databaseMetadataStatus: 'ok', databases: [] }]);
});

test('Cloud Monitoring access failures are visible, and project discovery is explicit', async () => {
  assert.deepEqual(projectIds('gtop-app, pti-app-2ab59, <bad>, gtop-app'), ['pti-app-2ab59', 'gtop-app']);
  const output = await createPlatformSnapshot({ now, workflowToken: 'synthetic-workflow', cloudToken: 'synthetic-cloud',
    configuredProjects: 'gtop-app', fetchImpl: async url => String(url).includes('/actions/runs')
      ? json({ total_count: 0, workflow_runs: [] }) : json({ error: 'forbidden' }, 403) });
  assert.equal(output.source, 'pti-platform-usage');
  assert.equal(output.github.status, 'partial');
  assert.equal(output.firebase.status, 'error');
  assert.equal(output.firebase.projects.length, 2);
  assert.equal(output.firebase.projects[0].reads24h, null);
});

test('owner registry enables all project placeholders without publishing private names in the repository', () => {
  assert.deepEqual(projectIds('gtop-app', ['noveliaa', 'pti-app-2ab59', 'noveliaa']),
    ['pti-app-2ab59', 'gtop-app', 'noveliaa']);
  assert.deepEqual(repositories([{ repo: 'Wolfrine/gtop-app' }, { repo: 'somebody/private-project' },
    { repo: 'Wolfrine/GrowthWebsite', archived: true }]), [
    { repo: 'Wolfrine/PTI', archived: false }, { repo: 'Wolfrine/gtop-app', archived: false },
    { repo: 'Wolfrine/GrowthWebsite', archived: true },
  ]);
});

test('GitHub run counts are scoped to reporting active repositories and permission gaps are explicit', async () => {
  const result = await collectGithub({ now, workflowToken: 'synthetic-gh',
    repositoryConfig: [{ repo: 'Wolfrine/gtop-app' }, { repo: 'Wolfrine/private-app' },
      { repo: 'Wolfrine/archived-app', archived: true }],
    fetchImpl: async url => {
      if (String(url).includes('/private-app/')) return json({ error: 'permission denied' }, 403);
      if (String(url).includes('/gtop-app/')) return json({ total_count: 3, workflow_runs: [
        { conclusion: 'success' }, { conclusion: 'success' }, { conclusion: 'failure' }] });
      return json({ total_count: 2, workflow_runs: [{ conclusion: 'success' }, { conclusion: 'failure' }] });
    } });
  assert.equal(result.repositoryCount, 3);
  assert.equal(result.archivedExcluded, 1);
  assert.equal(result.coveredRepoCount, 2);
  assert.equal(result.workflowRuns24h, 5);
  assert.equal(result.failedRuns24h, 2);
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.repos.find(item => item.repo === 'Wolfrine/private-app'),
    { repo: 'Wolfrine/private-app', status: 'not-connected', runs24h: null, failed24h: null });
});

test('Firestore quota window resets at Pacific midnight on normal and DST transition days', () => {
  assert.deepEqual(pacificUsageWindow('2026-10-30T08:00:00Z'), {
    dayPacific: '2026-10-30', start: '2026-10-30T07:00:00.000Z', nextResetAt: '2026-10-31T07:00:00.000Z',
  });
  assert.deepEqual(pacificUsageWindow('2026-03-08T12:00:00Z'), {
    dayPacific: '2026-03-08', start: '2026-03-08T08:00:00.000Z', nextResetAt: '2026-03-09T07:00:00.000Z',
  });
  assert.deepEqual(pacificUsageWindow('2026-11-01T14:00:00Z'), {
    dayPacific: '2026-11-01', start: '2026-11-01T07:00:00.000Z', nextResetAt: '2026-11-02T08:00:00.000Z',
  });
});

test('monitoring database breakdown preserves per-database counts and never attributes unlabeled series', () => {
  assert.deepEqual(monitoringBreakdown({}), { total: null, byDatabase: {} });
  const result = monitoringBreakdown({ timeSeries: [
    { resource: { type: 'firestore.googleapis.com/Database', labels: { database_id: '(default)' } },
      points: [{ value: { int64Value: '20' } }] },
    { resource: { type: 'firestore.googleapis.com/Database', labels: { database_id: 'paid_db' } },
      points: [{ value: { int64Value: '5' } }] },
    { points: [{ value: { int64Value: '7' } }] },
  ] });
  assert.equal(result.total, 32);
  assert.deepEqual(result.byDatabase, { '(default)': 20, paid_db: 5 });
});

test('only confirmed eligible Standard database gets free tier comparison data', async () => {
  const urls = [];
  const fetchImpl = async url => {
    urls.push(String(url));
    if (String(url).includes('/databases')) return json({ databases: [
      { name: 'projects/pti-app-2ab59/databases/(default)', freeTier: true, databaseEdition: 'STANDARD' },
      { name: 'projects/pti-app-2ab59/databases/paid_db', freeTier: false, databaseEdition: 'STANDARD' },
    ] });
    const u = new URL(url), metric = u.searchParams.get('filter');
    const today = u.searchParams.get('interval.startTime') === '2026-10-30T07:00:00.000Z';
    const count = metric.includes('read_ops_count') ? (today ? 51_000 : 53_000)
      : metric.includes('write_ops_count') ? (today ? 21_000 : 25_000) : 0;
    return json({ timeSeries: [
      { resource: { type: 'firestore.googleapis.com/Database', labels: { database_id: '(default)' } },
        points: [{ value: { int64Value: String(count) } }] },
      { resource: { type: 'firestore.googleapis.com/Database', labels: { database_id: 'paid_db' } },
        points: [{ value: { int64Value: '900' } }] },
    ] });
  };
  const metadata = await listFirestoreDatabases({ projectId: 'pti-app-2ab59', token: 'synthetic-cloud', fetchImpl });
  assert.equal(metadata[0].freeTier, true);
  const reading = await collectFirebase({ now, token: 'synthetic-cloud', projects: ['pti-app-2ab59'], fetchImpl });
  assert.equal(reading.status, 'ok');
  assert.equal(reading.dayPacific, '2026-10-30');
  assert.equal(reading.projects[0].reads24h, 53_900);
  assert.equal(reading.projects[0].databases[0].readsToday, 51_000);
  assert.equal(reading.projects[0].databases[0].writesToday, 21_000);
  assert.equal(reading.projects[0].databases[0].freeTier, true);
  assert.equal(reading.projects[0].databases[1].freeTier, false);
  assert.ok(urls.some(url => url.includes('resource.type%3D%22firestore.googleapis.com')));
});

test('Firestore metadata permission denial does not fabricate free eligibility or billable zero', async () => {
  const fetchImpl = async url => String(url).includes('/databases') ? json({ error: 'forbidden' }, 403)
    : json({ timeSeries: [{ resource: { type: 'firestore.googleapis.com/Database', labels: { database_id: '(default)' } },
      points: [{ value: { int64Value: '500' } }] }] });
  const reading = await collectFirebase({ now, token: 'synthetic-cloud', projects: ['pti-app-2ab59'], fetchImpl });
  assert.equal(reading.status, 'partial');
  assert.equal(reading.projects[0].status, 'ok');
  assert.equal(reading.projects[0].databaseMetadataStatus, 'unavailable');
  assert.equal(reading.projects[0].databases[0].freeTier, null);
  assert.equal(reading.projects[0].databases[0].readsToday, 500);
});
