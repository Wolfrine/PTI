import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');

test('mobile framing starts with complete image; fill is explicitly optional', () => {
  const interaction = source('interaction-upgrades.js');
  assert.match(interaction, /function setDefaultFit\(/);
  assert.match(interaction, /scale = 1;\s+panX = 0;/);
  assert.match(interaction, /setDefaultFit\(\);/);
  assert.match(interaction, /function toggleFill\(/);
  assert.match(source('zoom-failsafe.js'), /velumFillView/);
});
test('drift vote advances instead of being swallowed by timer override', () => {
  const interaction = source('interaction-upgrades.js');
  assert.match(interaction, /ms === 220 && fn\.name === 'goNext'/);
  assert.match(interaction, /return nativeSetTimeout\(fn, ms, \.\.\.args\)/);
  assert.doesNotMatch(interaction, /nativeSetTimeout\(\(\) => \{\}, ms\)/);
});
test('Focus has close/fit actions within thumb reach and Back dismissal', () => {
  const html = source('index.html');
  const app = source('app.js');
  const css = source('styles.css');
  assert.match(html, /id="focusDone"/);
  assert.match(html, /id="focusFit"/);
  assert.match(app, /focusDoneBtn\.onclick/);
  assert.match(app, /addEventListener\('popstate'/);
  assert.match(app, /dy > 95 && dy > Math\.abs\(dx\) \* 1\.25/);
  assert.match(css, /\.focus-overlay\{position:absolute;z-index:180/);
});
test('the service worker includes new selector module',()=>{
  const sw=source('sw.js');
  assert.match(sw,/feed\.mjs/);
  assert.match(sw,/velum-shell-v16/);
});
