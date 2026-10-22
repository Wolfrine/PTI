// Deliberate affection, not one vote per particle. Kept pure for regression tests.
export const HOLD_THRESHOLD_MS = 450;
export const HOLD_LEVEL_STEP_MS = 650; // level 5 is reached in 3.05 seconds total
export const MAX_AFFECTION_LEVEL = 5;

export function affectionLevel(durationMs) {
  const duration = Number(durationMs);
  if (!Number.isFinite(duration) || duration < HOLD_THRESHOLD_MS) return 0;
  return Math.min(MAX_AFFECTION_LEVEL, 1 + Math.floor((duration - HOLD_THRESHOLD_MS) / HOLD_LEVEL_STEP_MS));
}

export function safeAffectionLevel(level) {
  const n = Number(level);
  return Number.isFinite(n) ? Math.max(1, Math.min(MAX_AFFECTION_LEVEL, Math.floor(n))) : 1;
}

// Each explicit hold strengthens the preference; further holds have diminishing returns.
// The total influence is bounded, unlike an uncapped repeated-upvote counter.
export function affectionScore(events = []) {
  let weighted = 0;
  let index = 0;
  for (const event of events) {
    if (event?.type !== 'affection') continue;
    weighted += safeAffectionLevel(event.level) / Math.sqrt(++index);
    if (weighted >= 20) return 20;
  }
  return Math.min(20, weighted);
}

// Prior versions emitted "skip" on quick navigation even when the image had
// been watched for tens of seconds. Such long views must not be penalized.
export function isQuickSkip(event) {
  return event?.type === 'skip' && Number.isFinite(Number(event.ms)) &&
    Number(event.ms) >= 0 && Number(event.ms) < 1600;
}
