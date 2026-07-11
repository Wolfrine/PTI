import fs from 'node:fs/promises';
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const projectId = 'pti-rules-test';
const environment = await initializeTestEnvironment({
  projectId,
  firestore: {
    rules: await fs.readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
  },
});

after(async () => {
  await environment.cleanup();
});

test('owner can write and read the operating-system subtree', async () => {
  const owner = environment.authenticatedContext('owner-uid').firestore();
  const reference = doc(owner, 'users/owner-uid/operatingSystems/default/outcomes/pti-refoundation');

  await assertSucceeds(setDoc(reference, { title: 'PTI re-foundation' }));
  const snapshot = await assertSucceeds(getDoc(reference));
  assert.equal(snapshot.data()?.['title'], 'PTI re-foundation');
});

test('another authenticated user cannot read or write the owner subtree', async () => {
  const intruder = environment.authenticatedContext('other-uid').firestore();
  const reference = doc(intruder, 'users/owner-uid/operatingSystems/default/outcomes/pti-refoundation');

  await assertFails(getDoc(reference));
  await assertFails(setDoc(reference, { title: 'Unauthorized change' }));
});

test('unauthenticated access is denied', async () => {
  const anonymous = environment.unauthenticatedContext().firestore();
  const reference = doc(anonymous, 'users/owner-uid/operatingSystems/default/signals/private');

  await assertFails(getDoc(reference));
  await assertFails(setDoc(reference, { claim: 'Unauthorized' }));
});

test('documents outside user ownership are denied', async () => {
  const owner = environment.authenticatedContext('owner-uid').firestore();
  const reference = doc(owner, 'system/global');

  await assertFails(getDoc(reference));
  await assertFails(setDoc(reference, { open: true }));
});
