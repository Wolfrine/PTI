import {configureFinanceBrowserAuth} from './configure-morsel-auth.mjs';

const project = 'pti-app-2ab59';
const site = 'pti-app-2ab59-finance';
const domains = [`${site}.web.app`, `${site}.firebaseapp.com`];
const accessToken = process.env.ACCESS_TOKEN;
if (!accessToken || process.env.FIREBASE_PROJECT_ID !== project || process.env.FINANCE_SITE_ID !== site) {
  throw new Error('Finance Auth requires the existing PTI release identity and the exact production site.');
}

const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
async function configRequest(method, data) {
  const response = await fetch(configUrl + (data ? '?updateMask=authorizedDomains' : ''), {
    method,
    headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json'},
    body: data && JSON.stringify(data),
    redirect: 'error',
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`Inspecting or updating Finance Auth domains returned HTTP ${response.status}.`);
  }
  return response.json();
}

try {
  const {authorizedDomains: before} = await configRequest('GET');
  if (!Array.isArray(before) || !before.includes(`${project}.web.app`)) throw new Error('Unexpected PTI Auth domain configuration.');
  if (domains.some(domain => !before.includes(domain))) {
    const {authorizedDomains: latest} = await configRequest('GET');
    if (JSON.stringify(latest) !== JSON.stringify(before)) throw new Error('Auth domains changed during inspection. Retry against the current configuration.');
    await configRequest('PATCH', {authorizedDomains: [...before, ...domains.filter(domain => !before.includes(domain))]});
  }
  const {authorizedDomains: verified} = await configRequest('GET');
  if (![...before, ...domains].every(domain => verified?.includes(domain))) throw new Error('Finance Auth domains did not match readback.');
  const key = await configureFinanceBrowserAuth({accessToken});
  console.log(JSON.stringify({authDomainsPreserved: true, financeDomainCount: domains.length, ...key}));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
