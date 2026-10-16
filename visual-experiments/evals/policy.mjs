export const VERSION = '1.0.0';
export const PROFILES = [
  { id: 'desktop-pointer', width: 1440, height: 900, input: 'pointer' },
  { id: 'desktop-keyboard', width: 1440, height: 900, input: 'keyboard' },
  { id: 'phone-touch', width: 390, height: 844, input: 'touch' },
  { id: 'narrow-touch', width: 320, height: 568, input: 'touch' },
  { id: 'landscape-touch', width: 844, height: 390, input: 'touch' },
  { id: 'reduced-keyboard', width: 1440, height: 900, input: 'keyboard', reducedMotion: true },
];
export const BUDGET = Object.freeze({ trials: 3, readyMs: 2500, frameP95Ms: 34, sampleMs: 10000 });

export function percentile(values, fraction) {
  if (!values.length || values.some(v => !Number.isFinite(v) || v < 0)) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
}

export function gradePerformance(trials) {
  if (trials.length !== BUDGET.trials || trials.some(t =>
    t.status !== 'pass' || !Number.isFinite(t.readyMs) || t.readyMs < 0 ||
    !Number.isFinite(t.durationMs) || t.durationMs < BUDGET.sampleMs ||
    !Array.isArray(t.frames) || t.frames.length < 2 || percentile(t.frames, .95) === null)) {
    return { status: 'blocked', reason: 'Three valid cold trials and complete >=10s frame samples required' };
  }
  const readyP75Ms = percentile(trials.map(t => t.readyMs), .75);
  const frameP95ByTrialMs = trials.map(t => percentile(t.frames, .95));
  const frameP95P75Ms = percentile(frameP95ByTrialMs, .75);
  return { status: readyP75Ms <= BUDGET.readyMs && frameP95P75Ms <= BUDGET.frameP95Ms ? 'pass' : 'fail',
    readyP75Ms, frameP95ByTrialMs, frameP95P75Ms };
}

export function verdict(checks) {
  if (checks.some(c => c.status === 'fail')) return 'fail';
  if (!checks.length || checks.some(c => c.status !== 'pass')) return 'blocked';
  return 'pass';
}

export function validateScenario(scenario) {
  const text = v => typeof v === 'string' && v.trim().length > 0 && !v.includes('REPLACE');
  if (!text(scenario?.name) || !text(scenario?.outcomes?.a) || !text(scenario?.outcomes?.b) ||
      scenario.outcomes.a === scenario.outcomes.b) throw new Error('Declare a core promise and two distinct outcomes');
  for (const key of ['ready', 'assertInitial', 'act', 'assertOutcome', 'recover']) {
    if (typeof scenario[key] !== 'function') throw new Error(`Missing scenario hook: ${key}`);
  }
}
