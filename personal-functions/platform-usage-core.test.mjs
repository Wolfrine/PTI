import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectGithub, collectFirebase, createPlatformSnapshot, parseGithubBilling, projectIds,
  sumMonitoringSeries } from './platform-usage-core.mjs';

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
    return json({ total_count: 2, workflow_runs: [{ conclusion: 'failure' }, { conclusion: 'success' }] });
  };
  const output = await collectGithub({ now, billingToken: 'synthetic-billing', workflowToken: 'synthetic-workflow', fetchImpl });
  assert.equal(output.status, 'ok');
  assert.equal(output.period, '2026-10');
  assert.equal(output.billedActionsMinutes, 9);
  assert.equal(output.failedRuns24h, 1);
  assert.equal(output.workflowRepoScope, 'Wolfrine/PTI');
  assert.equal(urls[0].authorization, 'Bearer synthetic-billing');
  assert.match(urls[1].url, /created=%3E%3D2026-10-29T08%3A00%3A00Z/);
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
  assert.deepEqual(output.projects, [{ projectId: 'pti-app-2ab59', status: 'ok', reads24h: 71, writes24h: 8, deletes24h: null }]);
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
