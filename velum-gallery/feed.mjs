// Velum feed selection. This module deliberately does not access Drive, storage or the DOM.
// Discovery timestamps reflect when THIS browser first noticed a media item on sync.
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
export const FRESH_WINDOW_MS = 21 * DAY;
export const FRESH_EXPOSURES = 2;

function validTime(value, fallback) {
  return Number.isFinite(Number(value)) && Number(value) > 0 ? Math.min(Number(value), fallback) : fallback;
}

/** On first installation, bootstrap from Drive creation dates instead of making all old media "new". */
export function reconcileDiscovery(images, stored = {}, now = Date.now()) {
  const prior = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  const initialized = Object.keys(prior).length > 0;
  const next = {};
  for (const image of images) {
    if (!image?.id) continue;
    const priorTime = prior[image.id];
    next[image.id] = priorTime ? validTime(priorTime, now) :
      initialized ? now : validTime(image.addedAt, now);
  }
  return next;
}

function drawWeighted(pool, weight, random) {
  const weighted = pool.map(item => Math.max(0.001, weight(item)));
  let remaining = random() * weighted.reduce((sum, n) => sum + n, 0);
  for (let i = 0; i < pool.length; i++) {
    remaining -= weighted[i];
    if (remaining <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * New items get a bounded 35–80% allocation which rises with the backlog.
 * Every new item is shown once before any of that cohort is repeated.
 * Old picks continue to mix adaptive preference and random rediscovery.
 */
export function chooseFeedImage(images, {
  getStats,
  discovered = {},
  recentIds = [],
  now = Date.now(),
  random = Math.random
} = {}) {
  if (!images.length) return null;
  const recent = new Set(recentIds);
  const available = images.filter(item => !recent.has(item.id));
  const eligible = available.length ? available : images;
  const entries = eligible.map(image => {
    const stats = getStats?.(image.id) || {};
    return {
      image,
      views: Math.max(0, Number(stats.views) || 0),
      score: Number(stats.score) || 0,
      lastView: Number(stats.lastView) || 0
    };
  });

  const fresh = entries.filter(({ image, views }) =>
    views < FRESH_EXPOSURES &&
    now - validTime(discovered[image.id] ?? image.addedAt, now) <= FRESH_WINDOW_MS
  );
  const established = entries.filter(entry => !fresh.includes(entry));
  const freshFraction = Math.min(0.8, 0.35 + 0.45 * (1 - Math.exp(-fresh.length / 6)));
  const chooseFresh = fresh.length > 0 && (established.length === 0 || random() < freshFraction);

  if (chooseFresh) {
    // Avoid repeatedly showing the same 'new' item while other new items remain unseen.
    const fewestViews = Math.min(...fresh.map(entry => entry.views));
    const leastSeen = fresh.filter(entry => entry.views === fewestViews);
    return drawWeighted(leastSeen, entry => {
      const age = Math.max(0, now - validTime(discovered[entry.image.id] ?? entry.image.addedAt, now));
      return 1 + Math.max(0, 1 - age / FRESH_WINDOW_MS) * 0.5;
    }, random).image;
  }

  const old = established.length ? established : fresh;
  if (random() < 0.22) return old[Math.floor(random() * old.length)].image;
  return drawWeighted(old, entry => {
    const hrs = entry.lastView ? Math.min(Math.max(0, now - entry.lastView) / HOUR, 72) : 72;
    const rarity = 2.4 / (1 + entry.views * 0.65);
    const preference = Math.max(0.18, 1 + entry.score * 0.17);
    return preference + rarity + Math.min(hrs / 48, 0.8) + 1;
  }, random).image;
}
