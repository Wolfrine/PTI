import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

const parent = 'projects/185802494856/locations/global';
export const keyName = `${parent}/keys/pti-native-firebase-auth`;
const displayName = 'PTI native Firebase Authentication';
export const services = ['identitytoolkit.googleapis.com', 'securetoken.googleapis.com'];

export function verifyRestrictions(key) {
  const restrictions = key.restrictions || {};
  const targets = restrictions.apiTargets || [];
  if (key.name !== keyName || key.displayName !== displayName ||
      Object.keys(restrictions).some(name => name !== 'apiTargets') ||
      targets.length !== services.length ||
      !services.every(service => targets.filter(target => target.service === service && Object.keys(target).every(name => name === 'service')).length === 1)) {
    throw Error('The dedicated native key has unexpected identity or restrictions; refusing to alter or reuse it.');
  }
}

export async function configureNativeAuth({accessToken, fetchImpl = fetch, pause = ms => new Promise(resolve => setTimeout(resolve, ms))}) {
  if (!accessToken) throw Error('Use the existing authenticated GitHub Actions identity.');
  const call = async (resource, options = {}) => {
    const response = await fetchImpl(`https://apikeys.googleapis.com/v2/${resource}`, {
      ...options, redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: {Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json'},
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw Object.assign(Error(`Native Authentication key API returned HTTP ${response.status}.`), {status: response.status});
    }
    return response.json();
  };
  let key;
  try { key = await call(keyName); }
  catch (error) {
    if (error.status !== 404) throw error;
    // A deterministic ID makes unknown outcomes and reruns recover the same
    // resource. Never patch a browser/Picker key or change project IAM.
    const operation = await call(`${parent}/keys?keyId=pti-native-firebase-auth`, {
      method: 'POST', body: JSON.stringify({displayName, restrictions: {apiTargets: services.map(service => ({service}))}}),
    });
    let result = operation;
    for (let attempt = 0; !result.done && attempt < 60; attempt++) {
      if (!/^operations\/[a-zA-Z0-9._-]+$/.test(operation.name || '')) throw Error('Unexpected API key operation.');
      await pause(1000);
      result = await call(operation.name);
    }
    if (!result.done || result.error) throw Error('Native Authentication key creation was not confirmed. Rerun to recover the same resource.');
    key = await call(keyName);
  }
  verifyRestrictions(key);
  const {keyString} = await call(`${keyName}/keyString`);
  if (!/^AIza[\w-]{35}$/.test(keyString || '')) throw Error('Invalid Firebase API key configuration.');
  // This deliberately invalid credential must reach Firebase without a forged
  // Referer. HTTP 403 would reproduce the original native-worker regression.
  const probe = await fetchImpl(`https://securetoken.googleapis.com/v1/token?key=${keyString}`, {
    method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: 'native-auth-configuration-probe-invalid'}),
  });
  const body = await probe.json();
  if (probe.status !== 400 || !['INVALID_REFRESH_TOKEN', 'INVALID_GRANT'].includes(body.error?.message)) {
    throw Error(`Native SecureToken probe failed (HTTP ${probe.status}); configuration was not accepted.`);
  }
  return {projectId: 'pti-app-2ab59', keyResource: keyName, firebaseAuthApiKey: keyString,
    apiTargets: services, applicationRestrictions: 'none', nativeProbe: 'invalid-refresh-token-rejected-as-expected', verifiedAt: new Date().toISOString()};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const configuration = await configureNativeAuth({accessToken: process.env.ACCESS_TOKEN});
    if (!process.env.NATIVE_AUTH_OUTPUT) throw Error('Set the public configuration artifact output path.');
    fs.writeFileSync(process.env.NATIVE_AUTH_OUTPUT, JSON.stringify(configuration, null, 2) + '\n');
    console.log('Dedicated native Firebase Authentication key verified. Browser keys and IAM were not modified. Public configuration saved as the workflow artifact.');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
