// Offline registry regression only. Importing verify-data must not initialize
// Firebase Admin, use credentials, connect a client or access real account data.
import assert from 'node:assert/strict';
import test from 'node:test';
import { appCatalog } from '../dist/apps.js';
import { assertCanonicalAppCatalog } from './verify-data.mjs';

const catalog = () => ({ apps: appCatalog('synthetic-registry-test-owner') });

test('discovery accepts the current canonical registry including Atlas', () => {
  const current = catalog();
  assert(current.apps.some(app => app.id === 'atlas'));
  assert.doesNotThrow(() => assertCanonicalAppCatalog(current));
});

test('canonical app verification does not depend on ordering', () => {
  const current = catalog();
  current.apps.reverse();
  assert.doesNotThrow(() => assertCanonicalAppCatalog(current));
});

test('an omitted canonical app is rejected', () => {
  const current = catalog();
  current.apps = current.apps.filter(app => app.id !== 'atlas');
  assert.throws(() => assertCanonicalAppCatalog(current), /canonical registry/);
});

test('an unknown replacement is rejected even when the count matches', () => {
  const current = catalog();
  current.apps[0] = { ...current.apps[0], id: 'synthetic-unregistered-app' };
  assert.throws(() => assertCanonicalAppCatalog(current), /canonical registry/);
});

test('a duplicate replacement is rejected even when the count matches', () => {
  const current = catalog();
  current.apps[1] = { ...current.apps[1], id: current.apps[0].id };
  assert.throws(() => assertCanonicalAppCatalog(current), /must be unique/);
});

test('malformed app discovery is rejected', () => {
  for (const value of [null, {}, { apps: 'invalid' }, { apps: [null] }, { apps: [{}] }, { apps: [{ id: '' }] }]) {
    assert.throws(() => assertCanonicalAppCatalog(value));
  }
});
