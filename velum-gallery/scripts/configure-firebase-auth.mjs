import fs from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const projectId = process.env.FIREBASE_PROJECT_ID || 'pti-app-2ab59';
const siteId = process.env.VELUM_SITE_ID || 'pti-app-2ab59-velum';
const webApiKey = 'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs';
const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!credentialsPath || !fs.existsSync(credentialsPath)) {
  throw new Error('GOOGLE_APPLICATION_CREDENTIALS is missing.');
}

const auth = new GoogleAuth({
  keyFile: credentialsPath,
  scopes: ['https://www.googleapis.com/auth/cloud-platform']
});
const client = await auth.getClient();
const token = await client.getAccessToken();
const accessToken = typeof token === 'string' ? token : token?.token;
if (!accessToken) throw new Error('Could not obtain Google Cloud access token.');

const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
};

async function configureAuthorizedDomains() {
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
  const currentResponse = await fetch(base, { headers });
  if (!currentResponse.ok) {
    throw new Error(`Could not read Firebase Auth config (${currentResponse.status}): ${await currentResponse.text()}`);
  }

  const current = await currentResponse.json();
  const required = [`${siteId}.web.app`, `${siteId}.firebaseapp.com`];
  const existing = current.authorizedDomains || [];
  const authorizedDomains = [...new Set([...existing, ...required])];
  const changed = required.some(domain => !existing.includes(domain));

  if (!changed) {
    console.log('Velum Firebase Auth domains are already authorized.');
    return;
  }

  const patchResponse = await fetch(`${base}?updateMask=authorizedDomains`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ authorizedDomains })
  });
  if (!patchResponse.ok) {
    throw new Error(`Could not update Firebase Auth config (${patchResponse.status}): ${await patchResponse.text()}`);
  }

  console.log(`Authorized Firebase Auth domains: ${required.join(', ')}`);
}

async function probeDriveApi() {
  const probe = await fetch(`https://www.googleapis.com/drive/v3/about?fields=user&key=${encodeURIComponent(webApiKey)}`);
  const text = await probe.text();
  let body = {};
  try { body = JSON.parse(text); } catch {}

  const details = body?.error?.details || [];
  const disabled = details.some(detail => detail?.reason === 'SERVICE_DISABLED' || detail?.metadata?.service === 'drive.googleapis.com')
    || /drive api.*(disabled|has not been used)/i.test(body?.error?.message || '');

  if (disabled) return false;

  // An unauthenticated/permission error is expected here; reaching Drive without SERVICE_DISABLED proves the API is active.
  if ([400, 401, 403].includes(probe.status)) {
    console.log(`Google Drive API probe reached the service (HTTP ${probe.status}); OAuth is expected for actual data.`);
    return true;
  }

  if (probe.ok) {
    console.log('Google Drive API probe succeeded.');
    return true;
  }

  throw new Error(`Unexpected Google Drive API probe response (${probe.status}): ${text}`);
}

async function tryEnableDriveApi() {
  const serviceName = `projects/${projectId}/services/drive.googleapis.com`;
  const serviceUrl = `https://serviceusage.googleapis.com/v1/${serviceName}`;
  const enableResponse = await fetch(`${serviceUrl}:enable`, {
    method: 'POST',
    headers,
    body: '{}'
  });
  if (!enableResponse.ok) {
    throw new Error(`Google Drive API is disabled and this service account cannot enable it (${enableResponse.status}): ${await enableResponse.text()}`);
  }

  const operation = await enableResponse.json();
  if (!operation.name) {
    console.log('Google Drive API enable request accepted.');
    return;
  }

  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    const opResponse = await fetch(`https://serviceusage.googleapis.com/v1/${operation.name}`, { headers });
    if (!opResponse.ok) continue;
    const op = await opResponse.json();
    if (op.error) throw new Error(`Google Drive API enable failed: ${JSON.stringify(op.error)}`);
    if (op.done) {
      console.log('Google Drive API enabled successfully.');
      return;
    }
  }
  throw new Error('Timed out while enabling Google Drive API.');
}

async function ensureDriveApi() {
  // The deployment service account may not have Service Usage Viewer/Admin. Probe Drive directly first.
  if (await probeDriveApi()) return;
  await tryEnableDriveApi();
  if (!(await probeDriveApi())) throw new Error('Google Drive API still appears disabled after enable request.');
}

await configureAuthorizedDomains();
await ensureDriveApi();
