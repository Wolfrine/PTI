import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import assert from 'node:assert/strict';
// Reuse existing locked emulator dependencies; do not introduce a second stack.
const require = createRequire(new URL('../../apps/one-piece/package.json', import.meta.url));
const { initializeTestEnvironment, assertSucceeds, assertFails } = require('@firebase/rules-unit-testing');
const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch, runTransaction } = require('firebase/firestore');

// Synthetic fixtures only. These tests must never target a production project.
const root = 'users/owner/atlasData/workspace', evidenceId = `ev_${'a'.repeat(64)}`;
let env;
const client = uid => env.authenticatedContext(uid).firestore();
const evidence = { id: evidenceId, identity: `src_${'b'.repeat(64)}`, fingerprint: 'c'.repeat(64), supersedes: null,
  record: { claim: 'Synthetic artifact only, not evidence of personal mastery.', reviewStatus: 'pending', sourceSystem: 'github' } };
const source = (patch = {}) => ({ sourceId: 'synthetic-repo', system: 'github', locator: 'https://github.com/example/atlas/', recordLocatorPrefixes: ['https://github.com/example/atlas/'], recordLocators: [], enabled: true, ...patch });

function fieldsFor(kind, targetId, fields) { return kind === 'progress' ? { subjectId: targetId, state: 'learning', note: '', basis: 'self-report', ...fields }
  : kind === 'review' ? { evidenceId: targetId, status: 'accepted', note: '', ...fields } : source(fields); }
function collectionFor(kind) { return kind === 'review' ? 'reviews' : kind === 'source' ? 'sources' : 'progress'; }
async function change(d, kind, targetId, fields = {}, expectedRevision = 0, options = {}) {
  const ref = doc(d, `${root}/${collectionFor(kind)}/${targetId}`), eventId = `owner_${randomUUID()}`, createdAt = Date.now();
  return runTransaction(d, async tx => {
    const snapshot = await tx.get(ref), before = snapshot.exists() ? snapshot.data() : null;
    if ((before?.revision || 0) !== expectedRevision) throw new Error('revision-conflict');
    const after = { schemaVersion: 1, ...fieldsFor(kind, targetId, fields), revision: expectedRevision + 1, updatedAt: createdAt, lastEventId: eventId, ...options.after };
    const event = { schemaVersion: 1, eventId, kind, targetId, revision: after.revision, createdAt, before, after, ...options.event };
    tx.set(ref, after);
    if (!options.omitEvent) tx.set(doc(d, `${root}/events/${eventId}`), event);
    return { after, event };
  });
}

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-atlas-tests', firestore: { host: '127.0.0.1', port: 8085,
    rules: await readFile(new URL('../firestore.rules', import.meta.url), 'utf8') } });
});
after(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async c => {
    const d = c.firestore(), batch = writeBatch(d);
    batch.set(doc(d, `${root}/evidence/${evidenceId}`), evidence);
    batch.set(doc(d, `${root}/runs/synthetic`), { status: 'staged' });
    batch.set(doc(d, `${root}/sourceState/integrity`), { kind: 'integrity', unresolvedConflictCount: 0 });
    batch.set(doc(d, 'users/owner/trackerData/workspace/evidence/synthetic'), { claim: 'Existing sibling fixture.' });
    await batch.commit();
  });
});

test('Atlas is owner-only even where legacy namespaces permit authenticated access', async () => {
  for (const bucket of ['evidence', 'runs', 'sourceState', 'progress', 'reviews', 'events', 'sources']) {
    await assertSucceeds(getDocs(collection(client('owner'), `${root}/${bucket}`)));
    await assertFails(getDocs(collection(client('other'), `${root}/${bucket}`)));
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), `${root}/${bucket}`)));
  }
  await assertFails(setDoc(doc(client('other'), `${root}/unknown/document`), { injected: true }));
  await assertFails(getDoc(doc(client('other'), root)));
});
test('evidence, runs and source state are client-immutable, including for the owner', async () => {
  const d = client('owner');
  for (const bucket of ['evidence', 'runs', 'sourceState']) {
    await assertFails(setDoc(doc(d, `${root}/${bucket}/forged`), { claim: 'forged' }));
    const id = bucket === 'evidence' ? evidenceId : bucket === 'runs' ? 'synthetic' : 'integrity';
    await assertFails(updateDoc(doc(d, `${root}/${bucket}/${id}`), { changed: true }));
    await assertFails(deleteDoc(doc(d, `${root}/${bucket}/${id}`)));
  }
});
test('owner self-reported progress is atomic with an immutable before/after event', async () => {
  const d = client('owner'), first = await assertSucceeds(change(d, 'progress', 'synthetic-subject'));
  assert.equal(first.after.basis, 'self-report');
  const next = await assertSucceeds(change(d, 'progress', 'synthetic-subject', { state: 'applying', note: 'Owner declares a practical application.' }, 1));
  assert.deepEqual(next.event.before, first.after); assert.equal(next.after.revision, 2);
  assert.equal((await getDocs(collection(d, `${root}/events`))).size, 2);
  await assertFails(updateDoc(doc(d, `${root}/events/${first.event.eventId}`), { kind: 'review' }));
  await assertFails(deleteDoc(doc(d, `${root}/events/${first.event.eventId}`)));
});
test('direct edits without matching history, forged before state, and fabricated mastery fail', async () => {
  const d = client('owner');
  await assertFails(change(d, 'progress', 'missing-history', {}, 0, { omitEvent: true }));
  await assertFails(change(d, 'progress', 'forged-before', {}, 0, { event: { before: { revision: 0 } } }));
  await assertFails(change(d, 'progress', 'mastery', { state: 'mastered' }));
  await assertFails(change(d, 'progress', 'inferred', { basis: 'inferred' }));
  await assertFails(change(d, 'progress', 'extra', { rawChats: 'forbidden' }));
});
test('stale revisions and parallel owner updates cannot silently overwrite each other', async () => {
  const d = client('owner'); await assertSucceeds(change(d, 'progress', 'concurrent'));
  const settled = await Promise.allSettled([change(d, 'progress', 'concurrent', { state: 'practicing' }, 1), change(client('owner'), 'progress', 'concurrent', { state: 'applying' }, 1)]);
  assert.equal(settled.filter(x => x.status === 'fulfilled').length, 1); assert.equal(settled.filter(x => x.status === 'rejected').length, 1);
  await assert.rejects(change(d, 'progress', 'concurrent', { state: 'paused' }, 1), /revision-conflict/);
  assert.equal((await getDoc(doc(d, `${root}/progress/concurrent`))).data().revision, 2);
  assert.equal((await getDocs(collection(d, `${root}/events`))).size, 2);
});
test('review links only existing evidence without mutating its pending source provenance', async () => {
  const d = client('owner'), result = await assertSucceeds(change(d, 'review', evidenceId));
  assert.equal(result.after.status, 'accepted');
  assert.deepEqual((await getDoc(doc(d, `${root}/evidence/${evidenceId}`))).data(), evidence);
  await assertFails(change(d, 'review', `ev_${'d'.repeat(64)}`));
  await assertFails(change(d, 'review', evidenceId, { status: 'verified' }, 1));
});
test('owner source approvals are bounded and retain disable/re-enable history', async () => {
  const d = client('owner'); await assertSucceeds(change(d, 'source', 'synthetic-repo'));
  await assertSucceeds(change(d, 'source', 'synthetic-repo', { enabled: false }, 1));
  await assertSucceeds(change(d, 'source', 'synthetic-repo', { enabled: true }, 2));
  await assertFails(deleteDoc(doc(d, `${root}/sources/synthetic-repo`)));
  assert.equal((await getDocs(collection(d, `${root}/events`))).size, 3);
});
test('source permission rejects global roots, other owners, all Pages/Drive and raw chats', async () => {
  const d = client('owner');
  for (const fields of [
    { recordLocatorPrefixes: ['https://github.com/'] }, { recordLocatorPrefixes: ['https://'] },
    { system: 'pti-tracker-firestore', recordLocatorPrefixes: ['users/other/trackerData/workspace/evidence/'] },
    { system: 'chatgpt-pages', recordLocatorPrefixes: ['https://chatgpt.com/space/'] },
    { system: 'google-drive-spreadsheet', recordLocatorPrefixes: ['https://docs.google.com/spreadsheets/'] },
    { system: 'chatgpt-pages', recordLocatorPrefixes: [], recordLocators: ['https://chatgpt.com/c/synthetic-chat'] },
    { system: 'raw-chat-history' }, { recordLocatorPrefixes: ['https://github.com/example/chatgpt_harness/'] },
  ]) await assertFails(change(d, 'source', 'synthetic-repo', fields));
});
test('bounded owner Tracker collection and exact Pages/Drive approvals succeed', async () => {
  const d = client('owner');
  await assertSucceeds(change(d, 'source', 'tracker', source({ sourceId: 'tracker', system: 'pti-tracker-firestore', recordLocatorPrefixes: ['users/owner/trackerData/workspace/evidence/'] })));
  await assertSucceeds(change(d, 'source', 'pages', source({ sourceId: 'pages', system: 'chatgpt-pages', recordLocatorPrefixes: [], recordLocators: ['https://chatgpt.com/space/page_synthetic'] })));
  await assertSucceeds(change(d, 'source', 'sheet', source({ sourceId: 'sheet', system: 'google-drive-spreadsheet', recordLocatorPrefixes: [], recordLocators: ['https://docs.google.com/spreadsheets/d/synthetic/edit?usp=drivesdk'] })));
});
test('the full advertised exact-source bound remains usable and validates every location', async () => {
  const d = client('owner'), locations = Array.from({ length: 8 }, (_, i) => `https://chatgpt.com/space/page_synthetic${i}`);
  await assertSucceeds(change(d, 'source', 'eight-pages', source({ sourceId: 'eight-pages', system: 'chatgpt-pages', recordLocatorPrefixes: [], recordLocators: locations })));
  await assertFails(change(d, 'source', 'bad-last-page', source({ sourceId: 'bad-last-page', system: 'chatgpt-pages', recordLocatorPrefixes: [], recordLocators: [...locations.slice(0, 7), 'https://chatgpt.com/c/raw-chat'] })));
  await assertFails(change(d, 'source', 'too-many-pages', source({ sourceId: 'too-many-pages', system: 'chatgpt-pages', recordLocatorPrefixes: [], recordLocators: [...locations, 'https://chatgpt.com/space/page_ninth'] })));
  await assertSucceeds(change(d, 'source', 'full-bounds', source({ sourceId: 'full-bounds', recordLocatorPrefixes: Array.from({ length: 4 }, (_, i) => `https://github.com/example/repo${i}/`), recordLocators: Array.from({ length: 8 }, (_, i) => `https://github.com/example/atlas/blob/main/file${i}.md`) })));
});
test('orphan events and client-created conflicts cannot forge history', async () => {
  const d = client('owner');
  await assertFails(setDoc(doc(d, `${root}/events/orphan`), { schemaVersion: 1, eventId: 'orphan', kind: 'progress', targetId: 'absent', revision: 1, createdAt: Date.now(), before: null, after: {} }));
  await assertFails(setDoc(doc(d, `${root}/events/conflict`), { schemaVersion: 1, eventId: 'conflict', kind: 'evidence-conflict', incomingRecord: {} }));
});
test('cross-owner progress/source/review transactions fail without publishing any event', async () => {
  const d = client('other');
  for (const [kind, id] of [['progress', 'synthetic-subject'], ['review', evidenceId], ['source', 'synthetic-repo']]) await assertFails(change(d, kind, id));
  assert.equal((await getDocs(collection(client('owner'), `${root}/events`))).size, 0);
});
test('Atlas rule addition preserves the existing tracker owner boundary', async () => {
  await assertSucceeds(getDoc(doc(client('owner'), 'users/owner/trackerData/workspace/evidence/synthetic')));
  await assertFails(getDoc(doc(client('other'), 'users/owner/trackerData/workspace/evidence/synthetic')));
  await assertFails(setDoc(doc(client('owner'), 'users/owner/trackerData/workspace/evidence/new'), { claim: 'not allowed' }));
});
