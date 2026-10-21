import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');

test('Drift and Focus both show the whole original image, without cropping', () => {
  const interaction = source('interaction-upgrades.js');
  const css = source('styles.css');
  assert.match(interaction, /function setDefaultFit\(/);
  assert.match(interaction, /scale = 1;\s+panX = 0;/);
  assert.match(interaction, /setDefaultFit\(\);/);
  assert.match(interaction, /maxScale = Math.max\(6, Math.min\(24, nativeZoom\)\)/);
  assert.match(css, /\.focus-canvas\{position:absolute;inset:0;/);
  assert.match(css, /\.focus-canvas img\{[^}]*object-fit:contain/);
  assert.doesNotMatch(css, /\.focus-top\{|\.focus-bottom\{/);
});

test('Focus has no chrome or reset/close/like/dislike buttons', () => {
  const html = source('index.html');
  const app = source('app.js');
  assert.match(html, /id="focusOverlay"/);
  assert.doesNotMatch(html, /id="focus(Close|Reset|Fit|Done|Up|Down|Backdrop|Status|Btn)"/);
  assert.doesNotMatch(html, /zoom-failsafe\.js/);
  assert.doesNotMatch(app, /focusDoneBtn|focusResetBtn|focusFitBtn|focusBackdrop/);
  assert.match(app, /createFocusGestures\(/);
  assert.doesNotMatch(html, /id="focusBtn"/);
});

test('gesture dismissal keeps native Back and keyboard Escape', () => {
  const app = source('app.js');
  assert.match(app, /addEventListener\('popstate'/);
  assert.match(app, /event\.key === 'Escape'/);
  assert.match(app, /window\.history\.back\(\)/);
});

test('Drift up/down voting still advances normally', () => {
  const interaction = source('interaction-upgrades.js');
  assert.match(interaction, /ms === 220 && fn\.name === 'goNext'/);
  assert.match(interaction, /return nativeSetTimeout\(fn, ms, \.\.\.args\)/);
  assert.doesNotMatch(interaction, /nativeSetTimeout\(\(\) => \{\}, ms\)/);
  assert.doesNotMatch(interaction, /function toggleFill\(/);
});

test('service worker ships the new gesture module and no obsolete scripts', () => {
  const sw = source('sw.js');
  assert.match(sw, /focus-gestures\.mjs/);
  assert.match(sw, /velum-shell-v17/);
  assert.doesNotMatch(sw, /zoom-failsafe\.js/);
});
