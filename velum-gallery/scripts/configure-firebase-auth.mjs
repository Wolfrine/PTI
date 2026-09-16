import fs from 'node:fs';
import { GoogleAuth } from 'google-auth-library';

const projectId = process.env.FIREBASE_PROJECT_ID || 'pti-app-2ab59';
const siteId = process.env.VELUM_SITE_ID || 'pti-app-2ab59-velum';
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

const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config`;
const headers = {
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
};

const currentResponse = await fetch(base, { headers });
if (!currentResponse.ok) {
  throw new Error(`Could not read Firebase Auth config (${currentResponse.status}): ${await currentResponse.text()}`);
}
const current = await currentResponse.json();
const required = [`${siteId}.web.app`, `${siteId}.firebaseapp.com`];
const authorizedDomains = [...new Set([...(current.authorizedDomains || []), ...required])];

const changed = required.some(domain => !(current.authorizedDomains || []).includes(domain));
if (!changed) {
  console.log('Velum Firebase Auth domains are already authorized.');
  process.exit(0);
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
