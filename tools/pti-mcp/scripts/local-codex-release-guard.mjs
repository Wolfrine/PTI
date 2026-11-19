// Local Codex release prerequisites are OAuth and API-key restrictions, not
// the unrelated global Firestore ruleset revision.
import assert from 'node:assert/strict';
import { keyName, verifyRestrictions } from './configure-native-auth.mjs';

const project = 'pti-app-2ab59';
const { ACCESS_TOKEN, PUBLIC_ORIGIN } = process.env;
assert(ACCESS_TOKEN && PUBLIC_ORIGIN, 'Use the existing hosted release identity.');

async function get(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  assert(response.ok, `${new URL(url).hostname} read failed (HTTP ${response.status}).`);
  return response.json();
}

const auth = await get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`);
assert(auth.authorizedDomains.includes(new URL(PUBLIC_ORIGIN).hostname), 'Local Codex sign-in origin is not registered.');
verifyRestrictions(await get(`https://apikeys.googleapis.com/v2/${keyName}`));
console.log('Local Codex OAuth origin and API-key restrictions verified.');
