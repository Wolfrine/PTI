// Living Horizon geographic art selector: small, source-backed and fail-open.
// All paintings are representative landscapes, not GPS-accurate satellite views.
// Public sources: https://open-meteo.com/en/docs/elevation-api ,
// https://wiki.openstreetmap.org/wiki/Overpass_API/Overpass_QL ,
// https://operations.osmfoundation.org/policies/nominatim/ .
// No credential, exact GPS, Firebase, persisted location or scheduled polling.

import { ARTWORKS, classifyLandscape, dateParts } from './environment.js';

export const REGION_PACKS = Object.freeze({
  'coastal-foothill': { title: 'Coastal foothills', geography: 'Original Navi Mumbai interpretation' },
  'himalayan-highland': { title: 'Himalayan highland', geography: 'Representative Himalayan pine valleys and snow peaks' },
  'river-plain': { title: 'River plains', geography: 'Representative village, agricultural plain and meandering river' },
  'western-ghats': { title: 'Forest hills', geography: 'Representative Western Ghats forest, falls and rugged hills' },
  'tropical-coast': { title: 'Tropical coast', geography: 'Representative Konkan seashore and vegetation' },
});

const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
const cache = new Map(); // Session-only, coarse-coordinate cache; at most 8 areas.
const knownIndia = /\bindia\b|maharashtra|goa|uttarakhand|himachal|sikkim|kerala|karnataka|assam|bengal|bihar|uttar pradesh/i;
const naviArea = /kharghar|navi mumbai|belapur|panvel|vashi|nerul|seawoods/i;
const ghatsArea = /western ghats|sahyadri|lonavala|khandala|mahabaleshwar|matheran|igatpuri|pune|coorg|wayanad|ooty|nilgiri/i;
const himalayanArea = /himalaya|himalayan|nainital|ranikhet|mussoorie|shimla|manali|sikkim|darjeeling|gangtok|uttarakhand|himachal/i;
const konkanArea = /konkan|\bgoa\b|ratnagiri|sindhudurg|alibag|karwar|margao|panaji|mumbai/i;

const round2 = number => Math.round(Number(number) * 100) / 100;
const validCoords = (latitude, longitude) => Number.isFinite(latitude) && Number.isFinite(longitude)
  && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
const normaliseAddress = (name, address) =>
  [name, address?.city, address?.town, address?.village, address?.county, address?.state, address?.country]
    .filter(Boolean).join(' ');
const sortByDistance = (items, latitude, longitude) => {
  const longitudeFactor = Math.max(.05, Math.cos(latitude * Math.PI / 180));
  return [...items].sort((a, b) => distanceSq(a, latitude, longitude, longitudeFactor)
    - distanceSq(b, latitude, longitude, longitudeFactor));
};
const distanceSq = (item, lat, lon, lonFactor) => ((item.lat - lat) * 111) ** 2
  + ((item.lon - lon) * 111 * lonFactor) ** 2;

async function fetchedJSON(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6500);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function nearbyRelief(latitude, longitude) {
  // 3×3 DEM sample, ~7 km radius; a single centre elevation cannot tell relief.
  const spread = .063;
  const lonSpread = spread / Math.max(.2, Math.cos(latitude * Math.PI / 180));
  const locations = [];
  for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) {
    locations.push([latitude + row * spread, longitude + col * lonSpread]);
  }
  const url = new URL('https://api.open-meteo.com/v1/elevation');
  url.searchParams.set('latitude', locations.map(p => p[0].toFixed(3)).join(','));
  url.searchParams.set('longitude', locations.map(p => p[1].toFixed(3)).join(','));
  const body = await fetchedJSON(url);
  const entries = Array.isArray(body?.elevation) ? body.elevation.map(Number).filter(Number.isFinite) : [];
  if (entries.length < 7) throw new Error('Incomplete elevation profile');
  const variation = Math.max(...entries) - Math.min(...entries);
  const centerMeters = entries[4];
  // With ~7 km separation these thresholds identify broad local relief, not named ranges.
  const relief = variation >= 480 ? 'mountains' : variation >= 115 ? 'hills' : 'plain';
  return { relief, centerMeters, variationMeters: Math.round(variation),
    provider: 'Open-Meteo Elevation / Copernicus DEM', resolution: '90 m terrain model' };
}

async function nearbySurface(latitude, longitude) {
  // Small 4.5 km area; count/nearest-feature evidence only (OSM is incomplete).
  const spread = .04;
  const lonSpread = spread / Math.max(.2, Math.cos(latitude * Math.PI / 180));
  const box = [latitude - spread, longitude - lonSpread,
    latitude + spread, longitude + lonSpread].map(n => n.toFixed(4)).join(',');
  const query = `[out:json][timeout:8];(
    nwr["natural"="coastline"](${box});
    nwr["natural"~"^(water|wood|scrub|grassland)$"](${box});
    nwr["landuse"~"^(forest|farmland|meadow|residential)$"](${box});
    nwr["waterway"~"^(river|stream)$"](${box});
  );out center 250;`;
  const body = await fetchedJSON('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ data: query }),
  });
  if (!Array.isArray(body?.elements)) throw new Error('Incomplete OSM geometry');
  const nodes = body.elements
    .map(item => ({ lat: item.lat ?? item.center?.lat, lon: item.lon ?? item.center?.lon, tags: item.tags || {} }))
    .filter(item => Number.isFinite(item.lat) && Number.isFinite(item.lon));
  const nearest = sortByDistance(nodes, latitude, longitude);
  const waters = nearest.filter(item => item.tags.natural === 'coastline' || item.tags.natural === 'water'
    || ['river', 'stream'].includes(item.tags.waterway));
  const nearestWater = waters[0];
  const water = nearestWater
    ? nearestWater.tags.natural === 'coastline' ? 'coast'
      : nearestWater.tags.waterway === 'river' || nearestWater.tags.waterway === 'stream' ? 'river' : 'lake'
    : 'unmapped';
  const green = nearest.filter(item => ['wood', 'grassland', 'scrub'].includes(item.tags.natural)
    || ['forest', 'farmland', 'meadow'].includes(item.tags.landuse));
  const nearestGreen = green[0];
  const vegetation = nearestGreen
    ? nearestGreen.tags.natural === 'wood' || nearestGreen.tags.landuse === 'forest' ? 'forest'
      : nearestGreen.tags.natural === 'scrub' ? 'arid' : 'grassland'
    : nearest.some(item => item.tags.landuse === 'residential') ? 'urban' : 'unmapped';
  const longitudeFactor = Math.max(.05, Math.cos(latitude * Math.PI / 180));
  const distanceKm = point => point ? Math.sqrt(distanceSq(point, latitude, longitude, longitudeFactor)) : null;
  return { water, vegetation, waterDistanceKm: distanceKm(nearestWater),
    vegetationDistanceKm: distanceKm(nearestGreen), featuresExamined: body.elements.length,
    provider: 'OpenStreetMap / Overpass', resolution: 'Nearby mapped features, not land-cover survey' };
}

function evidenceSummary(name, address, elevation, surface, reliefInfo) {
  const area = normaliseAddress(name, address);
  const baseline = classifyLandscape(name || 'Unknown area', address || {}, elevation);
  return {
    ...baseline,
    region: baseline.region,
    settlement: baseline.settlement,
    relief: reliefInfo?.relief || baseline.relief || 'unmapped',
    water: surface?.water || 'unmapped',
    vegetation: surface?.vegetation || 'unmapped',
    mapped: Boolean(surface || reliefInfo),
    artworkGeographyMatch: naviArea.test(area),
    evidence: {
      settlement: baseline.settlement !== 'unknown' ? 'OSM reverse-geocoded area label' : 'Unmapped',
      relief: reliefInfo || null,
      surface: surface || null,
    },
    confidence: reliefInfo && surface ? 'sourced-partial' : reliefInfo || surface ? 'sourced-limited' : 'unverified',
    // The paintings depict landscape archetypes, not observed conditions.
    artworkIsIllustrative: true,
    areaDescription: area || 'Area unavailable',
  };
}

// Requires an already-approved, coarse location. The caller controls geolocation
// consent; this function never requests permission and never stores coordinates.
export async function resolveLandscapeProfile({ latitude, longitude, name = '', address = {} } = {}) {
  const lat = round2(latitude), lon = round2(longitude);
  if (!validCoords(lat, lon)) return evidenceSummary(name, address, null, null, null);
  const key = lat.toFixed(2) + ':' + lon.toFixed(2);
  const hit = cache.get(key);
  let terrain;
  if (hit && Date.now() - hit.at < CACHE_DURATION_MS) terrain = hit.terrain;
  else {
    // Provider failures are deliberately local: no fabricated river/forest or
    // mandatory dependency on third-party mapping services.
    const [height, surface] = await Promise.allSettled([nearbyRelief(lat, lon), nearbySurface(lat, lon)]);
    terrain = {
      relief: height.status === 'fulfilled' ? height.value : null,
      surface: surface.status === 'fulfilled' ? surface.value : null,
    };
    cache.set(key, { at: Date.now(), terrain });
    if (cache.size > 8) cache.delete(cache.keys().next().value);
  }
  return evidenceSummary(name, address, terrain.relief?.centerMeters, terrain.surface, terrain.relief);
}

// Conservative, bounded visual matching: 5 approved packs, never claim exact
// neighbourhood scenery. Missing geographic evidence returns illustrative art.
export function pickRegionPack(profile = {}) {
  const area = String(profile.areaDescription || profile.name || profile.region || '');
  const relief = profile.relief;
  const water = profile.water;
  const vegetation = profile.vegetation;
  const india = knownIndia.test(area) || profile.region === 'navi-mumbai';
  const terrainSourced = Boolean(profile.evidence?.relief);
  const waterSourced = Boolean(profile.evidence?.surface && water !== 'unmapped');
  let id = 'coastal-foothill', rationale = 'Original coastal-foothill study (geographic match unverified)';
  let matched = false;
  if (naviArea.test(area) || profile.region === 'navi-mumbai') {
    matched = true;
    rationale = 'Original Navi Mumbai landscape interpretation';
  } else if (india && himalayanArea.test(area) && relief === 'mountains' && terrainSourced) {
    id = 'himalayan-highland'; matched = true;
    rationale = 'Himalayan area label supported by local terrain relief';
  } else if (india && ghatsArea.test(area) && ['hills', 'mountains'].includes(relief) && terrainSourced) {
    id = 'western-ghats'; matched = true;
    rationale = 'Western Ghats area label supported by local terrain relief';
  } else if (india && konkanArea.test(area) && water === 'coast' && waterSourced) {
    id = 'tropical-coast'; matched = true;
    rationale = 'Konkan area label supported by mapped coastal features';
  } else if (water === 'river' && waterSourced && terrainSourced && relief === 'plain' && ['village', 'town'].includes(profile.settlement)) {
    id = 'river-plain'; matched = true;
    rationale = 'Mapped river near a low-relief settled plain';
  } else if (['hills', 'mountains'].includes(relief) && vegetation === 'forest') {
    id = 'western-ghats';
    rationale = 'Representative green forest hills, not a confirmed Western Ghats location';
  } else if (relief === 'mountains') {
    id = 'himalayan-highland';
    rationale = 'Representative mountain study, not a confirmed Himalayan location';
  } else if (water === 'coast' && vegetation === 'forest') {
    id = 'tropical-coast';
    rationale = 'Representative green coast, not a confirmed Konkan location';
  }
  return {
    id, title: REGION_PACKS[id].title, description: REGION_PACKS[id].geography,
    matched, illustrative: true, reason: rationale, confidence: profile.confidence || 'unverified',
  };
}

export function eligibleArtwork(profile = {}) {
  const pack = pickRegionPack(profile);
  return ARTWORKS.map((artwork, index) => ({ ...artwork, index }))
    .filter(artwork => artwork.pack === pack.id);
}

function textHash(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return hash >>> 0;
}
function shuffleBag(seed, count) {
  const indices = Array.from({ length: count }, (_, i) => i);
  let state = seed || 1;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

// Returns global ARTWORKS index. All images in one pack are visited once per
// shuffled cycle, with no adjacent duplicate at day-block boundaries.
export function regionalArtworkIndex(date, timezone, profile = {}) {
  const pack = pickRegionPack(profile);
  const pool = eligibleArtwork(profile);
  if (!pool.length) return 0;
  if (pool.length === 1) return pool[0].index;
  const p = dateParts(date, timezone);
  const day = Math.floor(Date.UTC(p.year, p.month - 1, p.day) / 86400000);
  const count = pool.length, block = Math.floor(day / count);
  const slot = ((day % count) + count) % count;
  const bag = shuffleBag(textHash(pack.id + ':' + block), count);
  // Give every cycle the same final anchor while shuffling all other styles.
  // This eliminates day-block boundary repeats for any pool size, including 2.
  // Unlike comparing to the prior *raw* shuffle, it does not depend on whether
  // the previous cycle itself had to make a boundary adjustment.
  const anchor = count - 1;
  const last = bag.indexOf(anchor);
  [bag[last], bag[anchor]] = [bag[anchor], bag[last]];
  return pool[bag[slot]].index;
}
