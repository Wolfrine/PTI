import test from 'node:test';
import assert from 'node:assert/strict';
import { percentile, gradePerformance, validateScenario, verdict, PROFILES } from '../policy.mjs';

const trial = (readyMs = 2500, frameMs = 34) => ({ status: 'pass', readyMs,
  frames: Array(600).fill(frameMs), durationMs: 10000 });

test('nearest-rank percentile retains worst of three cold samples', () => {
  assert.equal(percentile([1, 100, 2], .75), 100);
  assert.equal(percentile([], .95), null);
  assert.equal(percentile([NaN], .95), null);
});
test('budgets pass at boundary, fail beyond it without averaging desktop/mobile', () => {
  assert.equal(gradePerformance([trial(), trial(), trial()]).status, 'pass');
  assert.equal(gradePerformance([trial(), trial(), trial(2501)]).status, 'fail');
  assert.equal(gradePerformance([trial(), trial(), trial(1000, 35)]).status, 'fail');
});
test('missing, partial, invalid or failed measurements cannot pass', () => {
  for (const trials of [[], [trial()], [trial(), trial(), { ...trial(), status: 'fail' }],
    [trial(), trial(), { ...trial(), durationMs: 9999 }],
    [trial(), trial(), { ...trial(), frames: [] }],
    [trial(), trial(), { ...trial(), readyMs: NaN }]]) {
    assert.equal(gradePerformance(trials).status, 'blocked');
  }
});
test('known failure outranks missing evidence; an empty result never passes', () => {
  assert.equal(verdict([]), 'blocked');
  assert.equal(verdict([{ status: 'pass' }, { status: 'not_run' }]), 'blocked');
  assert.equal(verdict([{ status: 'blocked' }, { status: 'fail' }]), 'fail');
  assert.equal(verdict([{ status: 'pass' }]), 'pass');
});
test('placeholder/incomplete contract and identical declared outcomes are rejected', async () => {
  const template = (await import('../scenario.template.mjs')).default;
  assert.throws(() => validateScenario(template));
  const hooks = Object.fromEntries(['ready', 'assertInitial', 'act', 'assertOutcome', 'recover'].map(k => [k, async () => {}]));
  assert.throws(() => validateScenario({ ...hooks, name: 'promise', outcomes: { a: 'same', b: 'same' } }));
  assert.throws(() => validateScenario({ name: 'promise', outcomes: { a: 'one', b: 'two' } }));
});
test('required viewports and real input modes are explicit', () => {
  assert.equal(PROFILES.length, 6);
  assert(PROFILES.some(p => p.width === 320 && p.input === 'touch'));
  assert(PROFILES.some(p => p.width > p.height && p.input === 'touch'));
  assert(PROFILES.some(p => p.reducedMotion && p.input === 'keyboard'));
});
