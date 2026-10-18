import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, writeBatch } from 'firebase/firestore';

// All identities and records here are synthetic emulator fixtures, never live family data.
const root = 'users/owner/onePieceData/workspace';
let env;
const client = (uid, email = `${uid}@example.test`, verified = true, provider = 'google.com') => env.authenticatedContext(uid,
  { email, email_verified: verified, firebase: { sign_in_provider: provider } }).firestore();
const workspace = (ownerUid = 'owner') => ({ schemaVersion: 1, ownerUid, active: true, label: 'Synthetic family', revision: 1, createdAt: Date.now(), updatedAt: Date.now() });
const member = (uid, extra = {}) => ({ email: `${uid}@example.test`, uid, role: 'member', active: true, name: `Synthetic ${uid}`, invitedBy: 'owner', invitedAt: Date.now(), updatedAt: Date.now(), revision: 1, ...extra });
const profile = (uid, extra = {}) => ({ uid, displayName: `Synthetic ${uid}`, audioLanguage: 'ja', subtitleLanguage: 'en', autoplay: true, showTitles: false, revision: 1, updatedAt: Date.now(), ...extra });
const lease = (extra = {}) => ({ sessionId: 'synthetic-session-0001', deviceId: 'synthetic-device', destination: 'local', generation: 1, authorityEpoch: 1, revision: 0, expiresAt: Date.now() + 120000, updatedAt: Date.now(), ...extra });
const progress = (extra = {}) => ({ episodeId: 'one-piece-0001', sessionId: 'synthetic-session-0001', generation: 1, authorityEpoch: 1, revision: 1, positionSeconds: 1000, durationSeconds: 1400, watched: false, reason: 'heartbeat', updatedAt: Date.now(), ...extra });
async function writeProgress(d, value, leasePatch = {}) {
  const batch = writeBatch(d);
  batch.update(doc(d, `${root}/leases/alice`), { revision: value.revision, ...leasePatch });
  batch.set(doc(d, `${root}/profiles/alice/progress/${value.episodeId}`), value);
  return batch.commit();
}
before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-one-piece-tests', firestore: { host: '127.0.0.1', port: 8085,
    rules: await readFile(new URL('../../../personal-harness/firestore.rules', import.meta.url), 'utf8') } });
});
after(() => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const d = context.firestore();
    const batch = writeBatch(d);
    batch.set(doc(d, root), workspace());
    for (const uid of ['alice', 'bob', 'blocked']) batch.set(doc(d, `${root}/members/${uid}@example.test`), member(uid, uid === 'blocked' ? { role: 'blocked', active: false } : {}));
    batch.set(doc(d, `${root}/members/invite@example.test`), member('invite', { uid: '' }));
    batch.set(doc(d, `${root}/profiles/alice`), profile('alice'));
    batch.set(doc(d, `${root}/profiles/bob`), profile('bob'));
    batch.set(doc(d, `${root}/leases/alice`), lease());
    await batch.commit();
  });
});

test('only a verified Google owner can bootstrap; workspace fields and revisions are bounded', async () => {
  const d = client('bootstrap');
  await assertSucceeds(setDoc(doc(d, 'users/bootstrap/onePieceData/workspace'), workspace('bootstrap')));
  await assertFails(setDoc(doc(client('stranger'), 'users/victim/onePieceData/workspace'), workspace('victim')));
  await assertFails(setDoc(doc(client('email-owner', undefined, true, 'password'), 'users/email-owner/onePieceData/workspace'), workspace('email-owner')));
  const owner = client('owner');
  await assertFails(updateDoc(doc(owner, root), { label: 'No revision' }));
  await assertFails(updateDoc(doc(owner, root), { revision: 2, engineUrl: 'http://localhost:8096' }));
  await assertFails(updateDoc(doc(owner, root), { revision: 2, ownerUid: 'stranger' }));
  await assertSucceeds(updateDoc(doc(owner, root), { revision: 2, label: 'Updated synthetic label' }));
  await assertFails(deleteDoc(doc(owner, root)));
});
test('anonymous, strangers, unverified, non-Google and blocked identities cannot use the family', async () => {
  for (const d of [env.unauthenticatedContext().firestore(), client('stranger'), client('alice', undefined, false), client('alice', undefined, true, 'password'), client('blocked'), client('owner', undefined, false)]) {
    await assertFails(getDoc(doc(d, root)));
    await assertFails(getDoc(doc(d, `${root}/profiles/alice`)));
    await assertFails(setDoc(doc(d, `${root}/profiles/stranger`), profile('stranger')));
    await assertFails(getDoc(doc(d, `${root}/leases/alice`)));
  }
  await assertSucceeds(getDoc(doc(client('blocked'), `${root}/members/blocked@example.test`)));
});
test('active accounts read minimal metadata, while another family and unknown descendants stay denied', async () => {
  await assertSucceeds(getDoc(doc(client('owner'), root)));
  await assertSucceeds(getDoc(doc(client('alice'), root)));
  const alice = client('alice');
  for (const path of ['users/other/onePieceData/workspace', `${root}/secrets/engine`, `${root}/profiles/alice/arbitrary/x`, 'users/owner/onePieceData/other', `${root}/unknown/x/deeper/y`]) {
    await assertFails(getDoc(doc(alice, path)));
    await assertFails(setDoc(doc(alice, path), { any: 'legacy catchall must not grant this' }));
  }
  await assertFails(getDocs(collection(alice, 'users/owner/onePieceData')));
});
test('a verified invite binds its own UID exactly once without modifying its invitation', async () => {
  const invited = client('new-uid', 'invite@example.test'), ref = doc(invited, `${root}/members/invite@example.test`);
  await assertSucceeds(getDoc(ref));
  await assertFails(getDoc(doc(invited, root)));
  await assertSucceeds(updateDoc(ref, { uid: 'new-uid', revision: 2, updatedAt: Date.now() }));
  await assertSucceeds(getDoc(doc(invited, root)));
  await assertFails(updateDoc(ref, { uid: 'replacement', revision: 3 }));
  await assertFails(getDoc(doc(client('replacement', 'invite@example.test'), root)));
  await assertFails(updateDoc(doc(client('owner'), `${root}/members/invite@example.test`), { uid: 'replacement', revision: 3 }));
});
test('members cannot list invitations, elevate roles, bind others, inject fields or change settings', async () => {
  const alice = client('alice');
  await assertSucceeds(getDoc(doc(alice, `${root}/members/alice@example.test`)));
  await assertFails(getDoc(doc(alice, `${root}/members/bob@example.test`)));
  await assertFails(getDocs(collection(alice, `${root}/members`)));
  await assertFails(setDoc(doc(alice, `${root}/members/outsider@example.test`), member('outsider')));
  await assertFails(updateDoc(doc(alice, `${root}/members/alice@example.test`), { role: 'owner', revision: 2 }));
  await assertFails(updateDoc(doc(alice, root), { active: false, revision: 2 }));
  const invite = client('claim', 'invite@example.test');
  await assertFails(updateDoc(doc(invite, `${root}/members/invite@example.test`), { uid: 'claim', role: 'owner', revision: 2 }));
  await assertFails(updateDoc(doc(invite, `${root}/members/invite@example.test`), { uid: 'claim', secret: true, revision: 2 }));
  await assertFails(updateDoc(doc(client('stranger'), `${root}/members/invite@example.test`), { uid: 'stranger', revision: 2 }));
});
test('owner manages canonical invitations and blocking removes active access', async () => {
  const owner = client('owner');
  await assertSucceeds(setDoc(doc(owner, `${root}/members/third@example.test`), member('third', { uid: '' })));
  await assertSucceeds(getDocs(collection(owner, `${root}/members`)));
  await assertFails(setDoc(doc(owner, `${root}/members/UPPER@example.test`), member('UPPER')));
  await assertFails(setDoc(doc(owner, `${root}/members/outsider@example.test`), member('outsider', { role: 'owner' })));
  await assertFails(updateDoc(doc(owner, `${root}/members/alice@example.test`), { uid: 'rebound', revision: 2 }));
  await assertSucceeds(updateDoc(doc(owner, `${root}/members/alice@example.test`), { role: 'blocked', active: false, revision: 2 }));
  await assertFails(getDoc(doc(client('alice'), root)));
  await assertFails(updateDoc(doc(client('alice'), `${root}/profiles/alice`), { revision: 2, autoplay: false }));
});
test('profiles are self-only bounded preferences; owner can administer labels alone', async () => {
  const alice = client('alice'), owner = client('owner');
  await assertSucceeds(updateDoc(doc(alice, `${root}/profiles/alice`), { audioLanguage: 'en', subtitleLanguage: 'off', showTitles: true, revision: 2 }));
  await assertFails(updateDoc(doc(alice, `${root}/profiles/bob`), { autoplay: false, revision: 2 }));
  await assertFails(getDoc(doc(alice, `${root}/profiles/bob`)));
  await assertFails(getDocs(collection(alice, `${root}/profiles`)));
  await assertSucceeds(updateDoc(doc(owner, `${root}/profiles/alice`), { displayName: 'New synthetic label', revision: 3 }));
  await assertFails(updateDoc(doc(owner, `${root}/profiles/alice`), { autoplay: false, revision: 4 }));
  for (const patch of [{ displayName: '<img src=x>' }, { audioLanguage: 'http://evil.test' }, { subtitleLanguage: 'jp' }, { engineTrackIndex: 1 }, { displayName: 'x'.repeat(81) }])
    await assertFails(updateDoc(doc(alice, `${root}/profiles/alice`), { ...patch, revision: 4 }));
  await assertSucceeds(setDoc(doc(owner, `${root}/profiles/owner`), profile('owner')));
});
test('owner administration does not grant another viewer lease or progress access', async () => {
  for (const d of [client('owner'), client('bob')]) {
    await assertFails(getDoc(doc(d, `${root}/leases/alice`)));
    await assertFails(updateDoc(doc(d, `${root}/leases/alice`), { revision: 1 }));
    await assertFails(getDoc(doc(d, `${root}/profiles/alice/progress/one-piece-0001`)));
    await assertFails(setDoc(doc(d, `${root}/profiles/alice/progress/one-piece-0001`), progress()));
  }
  await assertFails(deleteDoc(doc(client('alice'), `${root}/leases/alice`)));
});
test('lease create, renew and destination transitions enforce generation and authority ordering', async () => {
  const bob = client('bob'), alice = client('alice'), ref = doc(alice, `${root}/leases/alice`);
  await assertSucceeds(setDoc(doc(bob, `${root}/leases/bob`), lease({ sessionId: 'synthetic-bob-session' })));
  await assertSucceeds(updateDoc(ref, { updatedAt: Date.now(), expiresAt: Date.now() + 180000 }));
  await assertFails(updateDoc(ref, { authorityEpoch: 0 }));
  await assertFails(updateDoc(ref, { destination: 'cast' }));
  await assertSucceeds(updateDoc(ref, { destination: 'cast', authorityEpoch: 2 }));
  await assertFails(updateDoc(ref, { authorityEpoch: 1 }));
  await assertFails(updateDoc(ref, { destination: 'hdmi', authorityEpoch: 1 }));
  await assertFails(updateDoc(ref, { generation: 2, authorityEpoch: 1, revision: 0 }));
  await assertFails(updateDoc(ref, { expiresAt: Date.now() + 14460000 }));
  await assertFails(updateDoc(ref, { lastEventHash: 'internal-only' }));
});
test('progress accepts deliberate rewinds with higher revision; duplicate and older events fail', async () => {
  const alice = client('alice');
  await assertSucceeds(writeProgress(alice, progress()));
  const rewind = progress({ revision: 2, positionSeconds: 400, reason: 'seek' });
  await assertSucceeds(writeProgress(alice, rewind));
  await assertSucceeds(writeProgress(alice, rewind)); // Lost HTTP acknowledgement: exact retry is safe.
  await assertFails(writeProgress(alice, progress({ revision: 1, positionSeconds: 1100 })));
  await assertFails(writeProgress(alice, progress({ revision: 2, positionSeconds: 1100 })));
  await assertSucceeds(writeProgress(alice, progress({ revision: 3, positionSeconds: 0, reason: 'restart' })));
  await assertSucceeds(getDocs(collection(alice, `${root}/profiles/alice/progress`)));
  await assertFails(deleteDoc(doc(alice, `${root}/profiles/alice/progress/one-piece-0001`)));
});
test('late local or receiver events cannot survive authority epoch rotation', async () => {
  const alice = client('alice');
  await assertSucceeds(writeProgress(alice, progress()));
  await assertSucceeds(writeProgress(alice, progress({ revision: 2, authorityEpoch: 2 }), { destination: 'cast', authorityEpoch: 2 }));
  await assertFails(writeProgress(alice, progress({ revision: 3, authorityEpoch: 1 })));
  await assertSucceeds(writeProgress(alice, progress({ revision: 3, authorityEpoch: 3, positionSeconds: 300, reason: 'seek' }), { destination: 'local', authorityEpoch: 3 }));
  await assertFails(writeProgress(alice, progress({ revision: 4, authorityEpoch: 2, positionSeconds: 1200 })));
});
test('explicit takeover starts one higher generation and rejects all old generation writes', async () => {
  const alice = client('alice'), nextSession = 'synthetic-session-0002';
  await assertSucceeds(writeProgress(alice, progress()));
  await assertSucceeds(updateDoc(doc(alice, `${root}/leases/alice`), { generation: 2, sessionId: nextSession, authorityEpoch: 1, revision: 0 }));
  await assertFails(writeProgress(alice, progress({ revision: 100 })));
  await assertSucceeds(writeProgress(alice, progress({ generation: 2, sessionId: nextSession, revision: 1, positionSeconds: 0 })));
  await assertFails(updateDoc(doc(alice, `${root}/leases/alice`), { generation: 1, revision: 0 }));
  await assertFails(updateDoc(doc(alice, `${root}/leases/alice`), { generation: 3, revision: 0 }));
});
test('offline mirror catches up across missed takeovers and destination round trips', async () => {
  const alice = client('alice'), ref = doc(alice, `${root}/leases/alice`);
  await assertSucceeds(writeProgress(alice, progress()));
  // Local -> Cast -> local occurred while the cloud mirror was unavailable.
  await assertSucceeds(writeProgress(alice, progress({ revision: 9, authorityEpoch: 5, positionSeconds: 250, reason: 'seek' }), { authorityEpoch: 5 }));
  await assertFails(writeProgress(alice, progress({ revision: 10, authorityEpoch: 3 })));
  // Two explicit takeovers and a handoff happened before the next projection.
  const projected = { generation: 4, sessionId: 'synthetic-offline-session', authorityEpoch: 3, destination: 'cast', revision: 7 };
  await assertSucceeds(writeProgress(alice, progress({ generation: projected.generation, sessionId: projected.sessionId,
    authorityEpoch: projected.authorityEpoch, revision: projected.revision, positionSeconds: 100, reason: 'restart' }), projected));
  await assertFails(updateDoc(ref, { generation: 3 }));
  await assertFails(updateDoc(ref, { generation: 4, sessionId: 'synthetic-wrong-session' }));
  await assertFails(updateDoc(ref, { authorityEpoch: 2 }));
  await assertFails(updateDoc(ref, { revision: 6 }));
  const bob = client('bob');
  await assertSucceeds(setDoc(doc(bob, `${root}/leases/bob`), lease({ generation: 5, authorityEpoch: 4, revision: 20 })));
});
test('progress rejects missing/outside episodes, extra fields, bad numbers and lease mismatches', async () => {
  const alice = client('alice');
  for (const patch of [{ episodeId: 'one-piece-0590' }, { episodeId: 'one-piece-1086' }, { episodeId: 'one-piece-0000' }, { episodeId: 'one-piece-01' },
    { positionSeconds: -1 }, { positionSeconds: 1401 }, { durationSeconds: 0 }, { durationSeconds: 21601 }, { positionSeconds: Number.NaN }, { positionSeconds: Number.POSITIVE_INFINITY },
    { sourceUrl: 'http://evil.test' }, { reason: 'invented' }, { revision: 1.5 }, { watched: 'true' }, { generation: 2 }, { authorityEpoch: 2 }, { sessionId: 'synthetic-other-session' }]) {
    await assertFails(writeProgress(alice, progress(patch)));
  }
  await assertFails(setDoc(doc(alice, `${root}/profiles/alice/progress/one-piece-0001`), progress()));
  await assertFails(writeProgress(alice, progress(), { expiresAt: Date.now() - 1000 }));
});
test('One Piece isolation preserves the existing legacy collection behavior', async () => {
  const d = client('legacy');
  await assertSucceeds(setDoc(doc(d, 'legacyPublicCollection/sample'), { synthetic: true }));
  await assertSucceeds(setDoc(doc(d, 'users/owner/legacyCollection/sample'), { synthetic: true }));
  await assertFails(setDoc(doc(d, `${root}/legacyCollection/sample`), { synthetic: true }));
  await assertFails(getDoc(doc(d, 'users/owner/personalData/workspace')));
  await assertFails(getDoc(doc(d, 'users/owner/ventureData/workspace')));
  await assertFails(getDoc(doc(d, 'users/owner/weddingData/workspace')));
});
