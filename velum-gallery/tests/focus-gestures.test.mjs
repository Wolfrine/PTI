import test from 'node:test';
import assert from 'node:assert/strict';
import { createFocusGestures } from '../focus-gestures.mjs';

function setup({ video = false, naturalWidth = 4000, naturalHeight = 2400 } = {}) {
  const callbacks = {};
  const canvas = {
    clientWidth: 400,
    clientHeight: 800,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
    addEventListener: (name, fn) => { callbacks[name] = fn; },
    removeEventListener: (name) => { delete callbacks[name]; },
    setPointerCapture: () => {}
  };
  const image = { naturalWidth, naturalHeight, style: { transform: '' } };
  let now = 1000;
  let closes = 0;
  const controller = createFocusGestures({
    canvas, image, isVideo: () => video, onClose: () => { closes++; }, clock: () => now
  });
  const fire = (type, pointerId, clientX, clientY) => {
    const fn = callbacks[type];
    assert.ok(fn, `missing event ${type}`);
    fn({ pointerId, pointerType: 'touch', clientX, clientY, button: 0 });
  };
  const tick = ms => { now += ms; };
  const tap = (x = 200, y = 400) => {
    fire('pointerdown', 1, x, y);
    tick(50);
    fire('pointerup', 1, x, y);
    tick(80);
  };
  return { controller, image, tap, tick, fire, closes: () => closes };
}

test('initial view is full fit with no transform crop', () => {
  const v = setup();
  v.controller.fit();
  assert.equal(v.controller.getState().scale, 1);
  assert.equal(v.controller.getState().x, 0);
  assert.match(v.image.style.transform, /scale\(1\)/);
});

test('double-tap zooms; double-tap again restores full fit', () => {
  const v = setup();
  v.tap(150, 360);
  v.tap(151, 361);
  assert.ok(v.controller.getState().scale > 1);
  v.tap(151, 361);
  v.tap(150, 360);
  assert.equal(v.controller.getState().scale, 1);
  assert.equal(v.controller.getState().x, 0);
});

test('pinch extends beyond previous fixed five-times cap, up to pixel-aware maximum', () => {
  const v = setup({ naturalWidth: 12000, naturalHeight: 6000 });
  for (let i = 0; i < 2; i++) {
    v.fire('pointerdown', 1, 150, 400);
    v.fire('pointerdown', 2, 250, 400);
    v.fire('pointermove', 2, i === 0 ? 650 : 750, 400);
    v.fire('pointerup', 2, i === 0 ? 650 : 750, 400);
    v.fire('pointerup', 1, 150, 400);
  }
  const state = v.controller.getState();
  assert.ok(state.scale > 5, 'pinch should exceed the previous 5x limit');
  assert.ok(state.scale <= state.maxScale + 0.001);
  assert.ok(state.maxScale >= 6);
});

test('a downward swipe closes only when image is fully fitted', () => {
  const v = setup();
  v.fire('pointerdown', 1, 200, 290);
  v.fire('pointermove', 1, 200, 470);
  v.fire('pointerup', 1, 200, 470);
  assert.equal(v.closes(), 1);
});

test('while zoomed a downward movement pans, never closes', () => {
  const v = setup();
  v.tap(); v.tap();
  v.fire('pointerdown', 1, 200, 300);
  v.fire('pointermove', 1, 200, 530);
  v.fire('pointerup', 1, 200, 530);
  assert.equal(v.closes(), 0);
  assert.ok(v.controller.getState().scale > 1);
});

test('pinch release cannot accidentally close or double tap', () => {
  const v = setup();
  v.fire('pointerdown', 1, 140, 300);
  v.fire('pointerdown', 2, 250, 300);
  v.fire('pointermove', 2, 300, 490);
  v.fire('pointerup', 2, 300, 490);
  v.fire('pointerup', 1, 140, 300);
  assert.equal(v.closes(), 0);
});

test('video still permits native playback taps and swipe-down exit', () => {
  const v = setup({ video: true });
  v.tap(); v.tap();
  assert.equal(v.controller.getState().scale, 1);
  v.fire('pointerdown', 1, 150, 150);
  v.fire('pointerup', 1, 150, 330);
  assert.equal(v.closes(), 1);
});

test('destroy removes all pointer handlers', () => {
  const v = setup();
  v.controller.destroy();
  assert.equal(v.controller.getState().scale, 1);
  assert.throws(() => v.fire('pointerdown', 1, 1, 1));
});
