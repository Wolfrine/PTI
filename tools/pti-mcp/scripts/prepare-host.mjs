// Narrow, compare-before-write rules change. No database or billing changes.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const project = 'pti-app-2ab59';
const token = process.env.ACCESS_TOKEN;
const origin = process.env.PUBLIC_ORIGIN;
if (!token || !origin) throw new Error('Deployment identity and public origin are required.');
async function request(url, method = 'GET', body) {
  const response = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const result = await response.json();
  if (!response.ok) throw new Error(`${new URL(url).hostname}: ${response.status} ${result.error?.message || ''}`);
  return result;
}
const api = 'https://firebaserules.googleapis.com/v1';
const releaseUrl = `${api}/projects/${project}/releases/cloud.firestore`;
const release = await request(releaseUrl);
const current = await request(`${api}/${release.rulesetName}`);
if (current.source.files.length !== 1) throw new Error('Review multi-file live rules before deploying.');
const before = current.source.files[0].content;
const target = await readFile('personal-harness/firestore.rules', 'utf8');
const baseline = target.replace(" && collection != '_ptiMcpAuth' && collection != 'mcpAuditLog'", '');
const hash = value => createHash('sha256').update(value).digest('hex');
const approved = new Set([hash(target),hash(baseline),'5c3cd9cdff141cf9a1536311cb16c68d0742c32b5d8df86878bcc7292b4fc442']);
if (!approved.has(hash(before))) throw new Error('Live rules differ from the reviewed baseline. Inspect before changing.');
if (before !== target) {
  const ruleset = await request(`${api}/projects/${project}/rulesets`, 'POST', { source: { files: [{ name: 'firestore.rules', content: target }] } });
  const latest = await request(releaseUrl);
  if (latest.rulesetName !== release.rulesetName) throw new Error('Rule release changed; no update made.');
  await request(releaseUrl, 'PATCH', { release: { name: release.name, rulesetName: ruleset.name }, updateMask: 'rulesetName' });
}
const configUrl = `https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const config = await request(configUrl);
const host = new URL(origin).hostname;
if (!config.authorizedDomains.includes(host)) await request(`${configUrl}?updateMask=authorizedDomains`, 'PATCH', { authorizedDomains: [...config.authorizedDomains, host] });
console.log('OAuth storage isolated and sign-in origin registered.');
