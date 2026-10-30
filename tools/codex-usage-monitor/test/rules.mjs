import { before, after, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
// Reuse PTI's existing emulator dependency, config and complete shared rules.
const require = createRequire(new URL('../../../apps/one-piece/package.json', import.meta.url));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, setDoc, getDoc, getDocs, deleteDoc, serverTimestamp } = require('firebase/firestore');
let env;
const root = 'users/usage-owner/codexProjects/codex-usage';
const reading = () => ({ schemaVersion: 1, source: 'codex-app-server', collectorVersion: '1.0.0', lastAttemptAt: '2026-10-24T00:00:00Z', publishedAt: serverTimestamp(),
  allowance: { status: 'ok', lastSuccessAt: '2026-10-24T00:00:00Z', buckets: [] }, daily: { status: 'unavailable', lastSuccessAt: null, latest: null, buckets: [] } });
const client = uid => uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
before(async () => { env = await initializeTestEnvironment({ projectId: 'demo-codex-usage-tests', firestore: { host: '127.0.0.1', port: 8085, rules: await readFile(new URL('../../../personal-harness/firestore.rules', import.meta.url), 'utf8') } }); });
after(() => env?.cleanup());
beforeEach(() => env.clearFirestore());
test('owner can write and read the private reading; unrelated and anonymous users cannot', async () => {
  const owner = client('usage-owner'), other = client('usage-other'), anonymous = client(null);
  await assertSucceeds(setDoc(doc(owner, root), reading()));
  assert.equal((await assertSucceeds(getDoc(doc(owner, root)))).data().source, 'codex-app-server');
  for (const db of [other, anonymous]) {
    await assertFails(getDoc(doc(db, root))); await assertFails(setDoc(doc(db, root), reading())); await assertFails(deleteDoc(doc(db, root)));
    await assertFails(getDoc(doc(db, `${root}/private/probe`))); await assertFails(setDoc(doc(db, `${root}/private/probe`), { synthetic: true }));
  }
});
test('absent documents do not hide broad legacy allow overlap', async () => {
  await assertFails(getDoc(doc(client('usage-other'), root)));
  await assertFails(getDoc(doc(client('usage-owner'), 'users/synthetic-victim/codexProjects/codex-usage')));
  await assertFails(getDoc(doc(client('usage-owner'), 'users/synthetic-victim/codexProjects/codex-usage/private/probe')));
});
test('the reserved document rejects credential fields, wrong source and fake publication time', async () => {
  const owner = client('usage-owner');
  await assertFails(setDoc(doc(owner, root), { ...reading(), credential: 'synthetic-secret' }));
  await assertFails(setDoc(doc(owner, root), { ...reading(), source: 'session-log-scraper' }));
  await assertFails(setDoc(doc(owner, root), { ...reading(), publishedAt: new Date('2020-01-01') }));
});
test('legacy project data and retained standalone tools keep their previous policy', async () => {
  const owner = client('usage-owner'), other = client('usage-other');
  await assertSucceeds(setDoc(doc(owner, 'users/usage-owner/codexProjects/legacy-project'), { synthetic: true }));
  await assertSucceeds(getDoc(doc(other, 'users/usage-owner/codexProjects/legacy-project')));
  await assertSucceeds(setDoc(doc(owner, 'users/usage-owner/domains/legacy-domain'), { synthetic: true }));
  await assertSucceeds(setDoc(doc(owner, root), reading()));
  assert.equal((await assertSucceeds(getDocs(collection(owner, 'users/usage-owner/codexProjects')))).size, 2);
});
test('infrastructure snapshots are owner-readable, server-written and isolated', async () => {
  const root = 'users/usage-owner/resourceUsage/current';
  await env.withSecurityRulesDisabled(async context => {
    await setDoc(doc(context.firestore(), root), { schemaVersion: 1, source: 'pti-platform-usage', synthetic: true });
  });
  const owner = client('usage-owner'), other = client('usage-other'), anonymous = client(null);
  assert.equal((await assertSucceeds(getDoc(doc(owner, root)))).data().source, 'pti-platform-usage');
  assert.equal((await assertSucceeds(getDocs(collection(owner, 'users/usage-owner/resourceUsage')))).size, 1);
  for (const db of [owner, other, anonymous]) {
    await assertFails(setDoc(doc(db, root), { synthetic: true }));
    await assertFails(deleteDoc(doc(db, root)));
  }
  for (const db of [other, anonymous]) {
    await assertFails(getDocs(collection(db, 'users/usage-owner/resourceUsage')));
    await assertFails(getDoc(doc(db, root)));
    await assertFails(getDoc(doc(db, 'users/usage-owner/resourceUsage/absent')));
  }
});
