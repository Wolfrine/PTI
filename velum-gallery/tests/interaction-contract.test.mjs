import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');

test('the only image viewer is Drift, and Browse thumbnails enter it directly', () => {
  const html = source('index.html');
  const app = source('app.js');
  assert.doesNotMatch(html, /id="focusOverlay"|id="focusBtn"|class="focus-overlay"/);
  assert.doesNotMatch(app, /openFocus\(|createFocusGestures|focusOverlay/);
  assert.match(app, /tile\.onclick = \(\) => openInDrift\(item\.id\)/);
  assert.match(app, /activateView\('drift', \{ incoming: true \}\)/);
  assert.match(app, /createDriftGestures\(/);
});

test('foreground is always contained; blurred backdrop uses the same media URL', () => {
  const css = source('styles.css');
  const interaction = source('interaction-upgrades.js');
  const app = source('app.js');
  const html = source('index.html');
  assert.match(interaction, /\.drift-image\{[^}]*object-fit:contain!important/);
  assert.match(css, /\.ambient-layer\{[^}]*background-size:cover/);
  assert.match(css, /filter:blur\(48px\)[^}]*/);
  assert.match(css, /\.ambient-layer\.active\{opacity:1\}/);
  assert.match(html, /id="ambientBg"[^>]*>\s*<div class="ambient-layer"/);
  assert.match(app, /showAmbient\(firstUrl\)/);
  assert.match(app, /setVideoAmbient\(video, id, serial\)/);
  assert.doesNotMatch(app, /ambientBg\.style\.backgroundImage/);
});

test('the old competing pointer and timeout interceptors are removed', () => {
  const app = source('app.js');
  const interaction = source('interaction-upgrades.js');
  assert.doesNotMatch(app, /pointerStart|driftStage\.addEventListener\('pointerup'/);
  assert.doesNotMatch(interaction, /driftPointers|window\.setTimeout =|window\.clearTimeout =/);
  assert.match(app, /__velumInteraction\?\.scheduleAdvance\?/);
  assert.match(interaction, /scheduleAdvance: callback => scheduleAuto/);
});

test('zoom pauses auto-advance until fit, and voting remains available in Drift', () => {
  const controller = source('drift-gestures.mjs');
  const interaction = source('interaction-upgrades.js');
  const app = source('app.js');
  assert.match(controller, /if \(isZoomed\(\)\)/);
  assert.match(controller, /onVote\(dy < 0 \? 'up' : 'down'\)/);
  assert.match(interaction, /if \(zoomed\) pauseAuto\('inspect'\)/);
  assert.match(interaction, /resumeAuto\(\{ delay: TOUCH_GRACE \}\)/);
  assert.match(app, /setTimeout\(goNext, 220\)/);
});

test('versioned PWA cache and release files have no references to Focus', () => {
  const sw = source('sw.js');
  assert.match(sw, /velum-shell-v18/);
  assert.match(sw, /drift-gestures\.mjs/);
  assert.doesNotMatch(sw, /focus-gestures/);
  assert.doesNotMatch(source('index.html'), /focus-gestures/);
});
