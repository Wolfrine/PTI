import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const source = name => readFileSync(new URL(name, root), 'utf8');

test('Drift remains the single full-image viewer; Browse opens Drift directly',()=>{
  const html=source('index.html');
  const app=source('app.js');
  assert.doesNotMatch(html,/id="focusOverlay"|id="focusBtn"/);
  assert.match(app,/tile\.onclick = \(\) => openInDrift\(item\.id\)/);
  assert.match(app,/createDriftGestures\(/);
});
test('image stays fully contained over the same-image blurred backdrop',()=>{
  const html=source('index.html');
  const app=source('app.js');
  const css=source('styles.css');
  const interaction=source('interaction-upgrades.js');
  assert.match(interaction,/\.drift-image\{[^}]*object-fit:contain!important/);
  assert.match(css,/\.ambient-layer\{[^}]*background-size:cover/);
  assert.match(css,/filter:blur\(48px\)[^}]*/);
  assert.match(html,/id="ambientBg"[^>]*>\s*<div class="ambient-layer"/);
  assert.match(app,/showAmbient\(firstUrl\)/);
  assert.match(app,/setVideoAmbient\(video, id, serial\)/);
});
test('only heart reaction effects; no up/down vote or less controls',()=>{
  const html=source('index.html');
  const gesture=source('drift-gestures.mjs');
  const app=source('app.js');
  const css=source('styles.css');
  assert.match(html,/id="heartField"/);
  assert.doesNotMatch(html,/id="upBtn"|id="downBtn"|Show less|Most downvoted|Most upvoted/);
  assert.doesNotMatch(gesture,/onVote|drift-vote-gesture|onVote\(/);
  assert.doesNotMatch(app,/function vote\(|flashVote\(|setTimeout\(goNext, 220\)/);
  assert.match(app,/type: 'affection', imageIds: \[id\]/);
  assert.match(app,/onHoldEnd: detail/);
  assert.match(css,/\.heart-field\{[^}]*pointer-events:none/);
  assert.match(source('heart-effects.mjs'),/prefers-reduced-motion|reducedMotion/);
});
test('hold starts after .45s, second double-tap is reserved for slide zoom',()=>{
  const gesture=source('drift-gestures.mjs');
  const model=source('affection.mjs');
  assert.match(gesture,/if \(!doubleCandidate\) holdTimer = setDelay\(\(\) => beginHold/);
  assert.match(gesture,/pointer\.doubleCandidate \|\| pointer\.holdDisabled/);
  assert.match(model,/HOLD_THRESHOLD_MS = 450/);
});
test('existing vote history preserved, historical long skip penalties corrected',()=>{
  const app=source('app.js');
  assert.match(app,/directUp\s*\*\s*3/);
  assert.match(app,/affectionScore\(affectionEvents\)/);
  assert.match(app,/ev\.filter\(isQuickSkip\)/);
  assert.match(app,/affectionHolds, affectionDurationMs, affectionWeight/);
  assert.match(app,/totalAffectionMs\(affectionEvents\)/);
});
test('statistics and exported intensity remain entirely in browser storage',()=>{
  const stats=source('stats-upgrades.js');
  const app=source('app.js');
  assert.match(stats,/affectionHolds: snapshot\.affectionHolds/);
  assert.match(stats,/affectionDurationMs: allSnapshot\.affectionDurationMs/);
  assert.match(stats,/VELUM_STATE_V2/);
  assert.doesNotMatch(stats,/affectionStrength/);
  assert.match(stats,/e\.type === 'impression'/);
  assert.match(app,/indexedDB\.open\('velum-local'/);
  assert.doesNotMatch(app,/firestore|createDocument|updateDocument|notion\.so/i);
});
test('auto-advance pauses during touch and zoom and resumes after grace',()=>{
  const interaction=source('interaction-upgrades.js');
  assert.match(interaction,/if \(zoomed\) pauseAuto\('inspect'\)/);
  assert.match(interaction,/else if \(touching\) pauseAuto\('touch'\)/);
  assert.match(interaction,/resumeAuto\(\{ delay: TOUCH_GRACE \}\)/);
});
test('continuous affection modules remain in the stamped PWA shell',()=>{
  const shell=source('sw.js');
  for(const asset of ['affection.mjs','heart-effects.mjs','drift-gestures.mjs'])
    assert.ok(shell.includes(asset),asset);
  assert.match(shell,/velum-shell-__VELUM_CACHE__/);
});

test('hearts grow visually without numeric rating labels or a timed stop',()=>{
  const heart=source('heart-effects.mjs');
  const css=source('styles.css');
  const gestures=source('drift-gestures.mjs');
  const app=source('app.js');
  const model=source('affection.mjs');
  assert.match(model,/Math\.log1p\(affectionDurationMs\(event\) \/ 1000\)/);
  assert.match(heart,/heartParticleSizePx\(durationMs, random\(\)\)/);
  assert.match(heart,/MAX_LIVE_PARTICLES = 28/);
  assert.match(css,/var\(--heart-core-size,32px\)/);
  assert.doesNotMatch(heart,/heart-level|\/5|lastLevel/);
  assert.doesNotMatch(gestures,/affectionLevel|MAX_AFFECTION_LEVEL/);
  assert.doesNotMatch(app,/\/5 · saved locally|detail\.level/);
  assert.match(app,/ms: detail\.durationMs, mode: 'drift'/);
  assert.match(source('stats-upgrades.js'),/affectionDurationMs/);
});
