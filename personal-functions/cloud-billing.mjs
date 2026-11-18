// Cloud Billing has no incurred-cost API. Read only an explicitly configured
// Standard Cloud Billing BigQuery export; never create a dataset or run a query
// just because a user opens PTI. All amounts use the export's own currency.
const MAX_QUERY_BYTES = '104857600'; // 100 MiB hard cap per scheduled query.
const MAX_ROWS = 5000;
const PROJECT = /^[a-z][a-z0-9-]{3,40}$/;
const DATASET = /^[A-Za-z_][A-Za-z0-9_]{0,1023}$/;
const EXPORT_TABLE = /^gcp_billing_export_v1_[A-Za-z0-9_]+$/;
const LOCATION = /^(?:US|EU|[a-z]+(?:-[a-z]+)*\d)$/i;

const emptyReading = (invoiceMonth, status, reason) => ({
  status, source: 'cloud-billing-bigquery-standard', invoiceMonth,
  currency: null, gross: null, credits: null, otherCharges: null,
  net: null, latestExportAt: null, changeSincePrevious: null,
  projects: [], services: [], reason,
});

function safeConfiguration(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { table, queryProject, location } = value;
  if (typeof table !== 'string' || typeof queryProject !== 'string' || typeof location !== 'string') return null;
  const parts = table.split('.');
  if (parts.length !== 3 || !PROJECT.test(parts[0]) || !DATASET.test(parts[1]) || !EXPORT_TABLE.test(parts[2]) ||
    !PROJECT.test(queryProject) || !LOCATION.test(location)) return null;
  return { table, queryProject, location };
}

async function bigQueryJson(url, options, fetchImpl) {
  const response = await fetchImpl(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) { await response.body?.cancel(); throw new Error(`bigquery-http-${response.status}`); }
  const length = Number(response.headers?.get?.('content-length') || 0);
  if (length > 2_000_000) { await response.body?.cancel(); throw new Error('bigquery-response-too-large'); }
  const raw = await response.text();
  if (raw.length > 2_000_000) throw new Error('bigquery-response-too-large');
  return JSON.parse(raw);
}

async function queryExport({ config, token, invoiceMonth, fetchImpl }) {
  const sql = `SELECT
    COALESCE(project.id, '(no project)') AS project_id,
    COALESCE(service.description, '(unknown service)') AS service_name,
    currency, cost_type,
    SUM(cost) AS charges,
    SUM(IFNULL((SELECT SUM(credit.amount) FROM UNNEST(credits) credit), 0)) AS credits,
    FORMAT_TIMESTAMP('%Y-%m-%dT%H:%M:%E3SZ', MAX(export_time), 'UTC') AS latest_export_at
  FROM \`${config.table}\`
  WHERE invoice.month = @invoiceMonth
  GROUP BY 1, 2, 3, 4
  ORDER BY 1, 2, 3, 4`;
  const base = `https://bigquery.googleapis.com/bigquery/v2/projects/${config.queryProject}`;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const body = {
    query: sql, useLegacySql: false, location: config.location, timeoutMs: 10000,
    maximumBytesBilled: MAX_QUERY_BYTES, maxResults: 1000,
    parameterMode: 'NAMED', queryParameters: [{
      name: 'invoiceMonth', parameterType: { type: 'STRING' }, parameterValue: { value: invoiceMonth },
    }],
  };
  let result = await bigQueryJson(`${base}/queries`, { method: 'POST', headers, body: JSON.stringify(body) }, fetchImpl);
  const jobId = result?.jobReference?.jobId;
  if (!result?.jobComplete) {
    if (typeof jobId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(jobId)) throw new Error('bigquery-missing-job');
    for (let attempt = 0; attempt < 5 && !result?.jobComplete; attempt++) {
      const url = new URL(`${base}/queries/${encodeURIComponent(jobId)}`);
      url.searchParams.set('location', config.location);
      url.searchParams.set('timeoutMs', '10000');
      url.searchParams.set('maxResults', '1000');
      result = await bigQueryJson(url, { headers }, fetchImpl);
    }
  }
  if (!result?.jobComplete || result?.errors?.length) throw new Error('bigquery-incomplete-job');
  const schema = result.schema?.fields?.map(field => field.name);
  if (!Array.isArray(schema) || schema.join(',') !== 'project_id,service_name,currency,cost_type,charges,credits,latest_export_at')
    throw new Error('bigquery-unexpected-schema');
  const rows = [];
  for (let page = 0; page < 6; page++) {
    if (!Array.isArray(result.rows) && result.rows !== undefined) throw new Error('bigquery-unexpected-rows');
    for (const row of result.rows || []) {
      if (!Array.isArray(row?.f) || row.f.length !== schema.length) throw new Error('bigquery-unexpected-row');
      rows.push(Object.fromEntries(schema.map((column, index) => [column, row.f[index]?.v])));
    }
    if (rows.length > MAX_ROWS) throw new Error('bigquery-results-too-large');
    if (!result.pageToken) {
      if (!/^\d+$/.test(String(result.totalRows ?? '')) || Number(result.totalRows) !== rows.length)
        throw new Error('bigquery-results-incomplete');
      return rows;
    }
    if (!jobId || !/^[a-zA-Z0-9_-]{1,200}$/.test(jobId)) throw new Error('bigquery-missing-job');
    const url = new URL(`${base}/queries/${encodeURIComponent(jobId)}`);
    url.searchParams.set('location', config.location);
    url.searchParams.set('pageToken', result.pageToken);
    url.searchParams.set('maxResults', '1000');
    result = await bigQueryJson(url, { headers }, fetchImpl);
  }
  throw new Error('bigquery-pagination-limit');
}

const signedAmount = value => value !== null && value !== '' && /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(String(value)) &&
  Number.isFinite(Number(value)) ? Number(value) : null;
const rounded = value => Number(value.toFixed(6));

function summarize(rows, invoiceMonth) {
  if (!rows.length) return emptyReading(invoiceMonth, 'partial', 'awaiting-export');
  let currency = null, gross = 0, credits = 0, otherCharges = 0, latestExportAt = null;
  const projectCosts = new Map(), serviceCosts = new Map();
  for (const row of rows) {
    if (typeof row.currency !== 'string' || !/^[A-Z]{3}$/.test(row.currency) ||
      (currency !== null && currency !== row.currency)) throw new Error('bigquery-multiple-currencies');
    currency = row.currency;
    const charges = signedAmount(row.charges), credit = signedAmount(row.credits);
    if (charges === null || credit === null || typeof row.cost_type !== 'string' ||
      typeof row.project_id !== 'string' || typeof row.service_name !== 'string' ||
      row.project_id.length > 120 || row.service_name.length > 120) throw new Error('bigquery-invalid-values');
    if (row.latest_export_at !== null && row.latest_export_at !== undefined) {
      const instant = Date.parse(row.latest_export_at);
      if (!Number.isFinite(instant)) throw new Error('bigquery-invalid-export-time');
      const iso = new Date(instant).toISOString();
      if (!latestExportAt || iso > latestExportAt) latestExportAt = iso;
    }
    const regular = row.cost_type === 'regular';
    gross += regular ? charges : 0;
    otherCharges += regular ? 0 : charges;
    credits += credit;
    for (const [map, name] of [[projectCosts, row.project_id], [serviceCosts, row.service_name]]) {
      const entry = map.get(name) ?? { name, gross: 0, credits: 0, otherCharges: 0 };
      entry.gross += regular ? charges : 0;
      entry.otherCharges += regular ? 0 : charges;
      entry.credits += credit;
      map.set(name, entry);
    }
  }
  const breakdown = map => [...map.values()].map(({ name, gross: charge, credits: credit, otherCharges: other }) => ({
    name, gross: rounded(charge), credits: rounded(credit), otherCharges: rounded(other), net: rounded(charge + credit + other),
  })).sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, 50);
  return { status: 'ok', source: 'cloud-billing-bigquery-standard', invoiceMonth, currency,
    gross: rounded(gross), credits: rounded(credits), otherCharges: rounded(otherCharges),
    net: rounded(gross + credits + otherCharges), latestExportAt, changeSincePrevious: null,
    projects: breakdown(projectCosts), services: breakdown(serviceCosts), reason: null };
}

export async function collectCloudBilling({ now, token, exportConfig, fetchImpl = fetch }) {
  const invoiceMonth = new Date(now).toISOString().slice(0, 7).replace('-', '');
  if (exportConfig === undefined || exportConfig === null) return emptyReading(invoiceMonth, 'not-connected', 'export-not-configured');
  const config = safeConfiguration(exportConfig);
  if (!config) return emptyReading(invoiceMonth, 'error', 'invalid-export-configuration');
  if (!token) return emptyReading(invoiceMonth, 'error', 'missing-query-credentials');
  try {
    return summarize(await queryExport({ config, token, invoiceMonth, fetchImpl }), invoiceMonth);
  } catch {
    // Do not leak project, account, dataset or IAM details to the browser.
    return emptyReading(invoiceMonth, 'error', 'export-query-failed');
  }
}
