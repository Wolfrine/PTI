// Velum's affection is continuous. Visual effects and recommendation scoring
// are separate: real hold durations are never truncated to a 1–5 rating.
export const HOLD_THRESHOLD_MS = 450;
export const HEART_GROWTH_MS = 8000; // Visual size stabilizes; holding does not stop.

export function affectionDurationMs(event) {
  if (event?.type !== 'affection') return 0;
  const actual = Number(event.ms);
  if (Number.isFinite(actual) && actual >= HOLD_THRESHOLD_MS) return actual;
  // Prior releases stored both real ms and 1–5 levels; recover older partial
  // records without deleting them or rewriting IndexedDB.
  const legacyLevel = Number(event.level);
  if (Number.isFinite(legacyLevel) && legacyLevel >= 1) {
    return HOLD_THRESHOLD_MS + (Math.min(5, legacyLevel) - 1) * 650;
  }
  return HOLD_THRESHOLD_MS;
}

export function heartGrowth(durationMs) {
  const ms = Number(durationMs);
  if (!Number.isFinite(ms)) return 0;
  const t = Math.max(0, Math.min(1,
    (ms - HOLD_THRESHOLD_MS) / (HEART_GROWTH_MS - HOLD_THRESHOLD_MS)));
  return t * t * (3 - 2 * t); // Ease into the visual ceiling, without a step.
}

export function heartParticleSizePx(durationMs, random = 0.5) {
  const r = Math.max(0, Math.min(1, Number.isFinite(random) ? random : 0.5));
  // Small hearts immediately, varied large hearts by ~8s; max 64px before
  // the slight animated scale (at most 1.08x, approximately 69px apparent).
  return Math.round(15 + 11 * r + heartGrowth(durationMs) * (18 + 20 * r));
}

// Every deliberate hold adds evidence, with a logarithmic duration response
// and diminishing returns for subsequent holds. No hard score ceiling.
export function affectionScore(events = []) {
  let weight = 0;
  let holdIndex = 0;
  for (const event of events) {
    if (event?.type !== 'affection') continue;
    holdIndex += 1;
    weight += 2.5 * Math.log1p(affectionDurationMs(event) / 1000) /
      Math.sqrt(holdIndex);
  }
  return weight;
}

export function totalAffectionMs(events = []) {
  return events.reduce((sum, event) => sum + affectionDurationMs(event), 0);
}

// Earlier builds marked long deliberate viewing as a "skip" on navigation.
export function isQuickSkip(event) {
  return event?.type === 'skip' && Number.isFinite(Number(event.ms)) &&
    Number(event.ms) >= 0 && Number(event.ms) < 1600;
}
