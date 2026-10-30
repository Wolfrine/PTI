import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configureNativeAuth, keyName, services, verifyRestrictions} from './configure-native-auth.mjs';
const key = () => ({name: keyName, displayName: 'PTI native Firebase Authentication', restrictions: {apiTargets: services.map(service => ({service}))}});
const keyString = 'AIza' + 'x'.repeat(35);
const response = (status, value) => new Response(JSON.stringify(value), {status});
function fixture({exists = true, restrictions = key(), probeStatus = 400, denied = false} = {}) {
  const calls = []; let created = false;
  return {calls, fetchImpl: async (url, options) => {
    calls.push({url, options});
    if (url.includes('securetoken.googleapis.com')) {
      assert.equal(options.headers.Referer, undefined);
      assert.equal(options.headers.Authorization, undefined);
      return response(probeStatus, {error: {message: 'INVALID_REFRESH_TOKEN'}});
    }
    if (denied) return response(403, {});
    if (url.endsWith('/keyString')) return response(200, {keyString});
    if (url.includes('?keyId=')) {created = true; assert.deepEqual(JSON.parse(options.body).restrictions, key().restrictions); return response(200, {name: 'operations/fixture'});}
    if (url.includes('/operations/')) return response(200, {done: true});
    return response(exists || created ? 200 : 404, restrictions);
  }};
}
test('reuses only the dedicated auth-only key and probes native refresh without a Referer', async () => {
  const f = fixture(); const actual = await configureNativeAuth({accessToken: 'fixture-token', ...f});
  assert.equal(actual.firebaseAuthApiKey, keyString); assert.equal(f.calls.length, 3);
  assert(!f.calls.some(c => c.options.method === 'PATCH' || c.options.method === 'POST' && !c.url.includes('securetoken')));
});
test('creates a missing deterministic key and verifies restrictions before exporting', async () => {
  const f = fixture({exists: false}); await configureNativeAuth({accessToken: 'fixture-token', pause: async () => {}, ...f});
  assert.equal(f.calls.filter(c => c.url.includes('?keyId=pti-native-firebase-auth')).length, 1);
});
test('browser, extra API, method-limited and wrong identity keys fail without mutation', () => {
  for (const value of [
    {...key(), name: 'browser-key'},
    {...key(), restrictions: {...key().restrictions, browserKeyRestrictions: {allowedReferrers: ['https://example.com/*']}}},
    {...key(), restrictions: {apiTargets: [...key().restrictions.apiTargets, {service: 'drive.googleapis.com'}]}},
    {...key(), restrictions: {apiTargets: [{service: services[0], methods: ['*']}, {service: services[1]}]}},
  ]) assert.throws(() => verifyRestrictions(value), /refusing/);
});
test('IAM denial and native-referrer denial are explicit failures without widening a key', async () => {
  await assert.rejects(configureNativeAuth({accessToken: 'fixture-token', ...fixture({denied: true})}), /HTTP 403/);
  await assert.rejects(configureNativeAuth({accessToken: 'fixture-token', ...fixture({probeStatus: 403})}), /probe failed/);
});
