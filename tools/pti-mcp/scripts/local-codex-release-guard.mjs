import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { keyName, verifyRestrictions } from './configure-native-auth.mjs';

const project = 'pti-app-2ab59';
const rulesApi = 'https://firebaserules.googleapis.com/v1';
const releaseUrl = `${rulesApi}/projects/${project}/releases/cloud.firestore`;
// Reviewed production policy at the Local Codex 0.5.0 cutover. A later rules
// release needs a fresh review before its bytes can be accepted here.
const reviewedRules = '7ea6b187bc3867e00f16791e212e6358837a386a857e6fd06e735acab5e0dfc4';
const { ACCESS_TOKEN, PUBLIC_ORIGIN, RUNNER_TEMP } = process.env;
assert(ACCESS_TOKEN && PUBLIC_ORIGIN && RUNNER_TEMP, 'Use the existing hosted release identity.');
const receiptPath = join(RUNNER_TEMP, 'local-codex-rules.json');

async function get(url) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  assert(response.ok, `${new URL(url).hostname} read failed (HTTP ${response.status}).`);
  return response.json();
}

async function readLiveRules() {
  const release = await get(releaseUrl);
  assert(release.rulesetName.startsWith(`projects/${project}/rulesets/`));
  const ruleset = await get(`${rulesApi}/${release.rulesetName}`);
  assert.equal(ruleset.source.files.length, 1, 'Review unexpected live rule files before deployment.');
  const sha256 = createHash('sha256').update(ruleset.source.files[0].content).digest('hex');
  assert.equal((await get(releaseUrl)).rulesetName, release.rulesetName, 'The live rules changed during readback.');
  return { ruleset: release.rulesetName, sha256 };
}

const phase = process.argv[2];
assert(['before', 'after'].includes(phase), 'Specify before or after.');
const live = await readLiveRules();
if (phase === 'before') {
  assert.equal(live.sha256, reviewedRules, 'Review changed live rules before a Local Codex host release.');
  const auth = await get(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`);
  assert(auth.authorizedDomains.includes(new URL(PUBLIC_ORIGIN).hostname), 'Local Codex sign-in origin is not registered.');
  verifyRestrictions(await get(`https://apikeys.googleapis.com/v2/${keyName}`));
  await writeFile(receiptPath, JSON.stringify(live));
} else {
  assert.deepEqual(live, JSON.parse(await readFile(receiptPath, 'utf8')), 'The live rules changed during the host release.');
}
console.log(`Local Codex ${phase} Firestore rules ${live.ruleset} SHA-256 ${live.sha256}`);
