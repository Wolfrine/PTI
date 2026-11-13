// Living Horizon environment model. No private account data or Firestore dependencies.
// Astronomy is calculated on-device with pinned, BSD-licensed SunCalc v1.9.0.

export const ARTWORKS = Object.freeze([
  { id: 'gouache', name: 'Atelier gouache', file: 'horizon-gouache.webp', settlement: ['city', 'town'], terrain: ['hills', 'coast'], desktop: '50% 87%', mobile: '50% 75%' },
  { id: 'modernist', name: 'Modernist terrace', file: 'horizon-modernist.webp', settlement: ['city'], terrain: ['hills', 'coast'], desktop: '50% 88%', mobile: '50% 75%' },
  { id: 'ink', name: 'Ink and mineral wash', file: 'horizon-ink.webp', settlement: ['city', 'town'], terrain: ['hills', 'coast', 'river'], desktop: '50% 86%', mobile: '50% 76%' },
  { id: 'paper', name: 'Cut-paper relief', file: 'horizon-paper.webp', settlement: ['city', 'town'], terrain: ['hills', 'coast', 'river'], desktop: '50% 88%', mobile: '50% 78%' },
  { id: 'screenprint', name: 'Coral screenprint', file: 'horizon-screenprint.webp', settlement: ['city'], terrain: ['hills', 'coast'], desktop: '50% 84%', mobile: '50% 73%' },
  { id: 'vellum', name: 'Luminous vellum', file: 'horizon-vellum.webp', settlement: ['village', 'town', 'city'], terrain: ['hills', 'coast', 'river'], desktop: '50% 85%', mobile: '50% 75%' },
]);

export const LANDSCAPE_DIMENSIONS = Object.freeze({
  settlement: ['city', 'town', 'village', 'wilderness'],
  relief: ['plain', 'hills', 'mountains'],
  water: ['coast', 'river', 'lake', 'none'],
  vegetation: ['urban', 'grassland', 'forest', 'arid'],
});

const MS_PER_DAY = 86400000;
const PI = Math.PI;
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

export function dateParts(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone || 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const value = name => Number(parts.find(p => p.type === name)?.value || 0);
  return { year: value('year'), month: value('month'), day: value('day') };
}

export function localDayKey(date, timezone) {
  const p = dateParts(date, timezone);
  return [p.year, String(p.month).padStart(2, '0'), String(p.day).padStart(2, '0')].join('-');
}

function hashText(str) {
  let h = 2166136261;
  for (const char of str) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return h >>> 0;
}

function shuffledBag(seed, count) {
  const bag = Array.from({ length: count }, (_, i) => i);
  let state = seed || 1;
  const next = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

// Each local calendar day gets a different style. Styles are shuffled without
// repetition within a six-day collection; a block-boundary duplicate is avoided.
export function dailyArtworkIndex(date, timezone, region = 'navi-mumbai') {
  const p = dateParts(date, timezone);
  const day = Math.floor(Date.UTC(p.year, p.month - 1, p.day) / MS_PER_DAY);
  const count = ARTWORKS.length;
  const block = Math.floor(day / count);
  const slot = ((day % count) + count) % count;
  const order = shuffledBag(hashText(region + ':' + block), count);
  // Apply the boundary adjustment to the *whole block*, not just its first
  // day, otherwise day two can repeat the adjusted first day.
  const previous = shuffledBag(hashText(region + ':' + (block - 1)), count);
  if (order[0] === previous[count - 1]) [order[0], order[1]] = [order[1], order[0]];
  return order[slot];
}

export function classifyLandscape(name, address = {}, elevation = null) {
  const area = [name, address.city, address.town, address.village, address.state, address.county]
    .filter(Boolean).join(' ').toLowerCase();
  const navi = /kharghar|navi mumbai|belapur|panvel/.test(area);
  const mumbai = !navi && /mumbai|bombay/.test(area);
  const goa = /\bgoa\b|margao|panaji/.test(area);
  const hills = /pune|lonavala|khandala/.test(area);
  const mountains = /ranikhet|nainital|manali|shimla|mussoorie/.test(area);
  let settlement = address.city || mumbai || navi ? 'city' : address.town ? 'town' : address.village ? 'village' : 'unknown';
  if (settlement === 'unknown' && /navi mumbai/.test(area)) settlement = 'city';
  const relief = mountains || (Number.isFinite(elevation) && elevation >= 1100) ? 'mountains'
    : navi || hills || (Number.isFinite(elevation) && elevation >= 350) ? 'hills' : 'plain';
  // A name and altitude do not establish the existence of nearby coastline or rivers.
  const water = navi || mumbai || goa ? 'coast' : 'unmapped';
  const vegetation = mountains ? 'forest' : 'unmapped';
  const mapped = navi || mumbai || goa || hills || mountains;
  return {
    region: navi ? 'navi-mumbai' : mumbai ? 'mumbai' : goa ? 'goa' : mountains ? 'himalayan-foothills' : hills ? 'deccan-hills' : 'unmapped',
    settlement, relief, water, vegetation, mapped,
    // Artwork catalogue is currently a stylized Navi Mumbai coastal-foothill pack.
    artworkGeographyMatch: navi,
  };
}

// SunCalc azimuth is radians from south toward west: E=-90°, S=0°, W=+90°.
// A stylized panoramic east–south–west sky, not a navigational compass camera.
export function skyPoint(position) {
  const azimuth = ((position.azimuth * 180 / PI + 180) + 360) % 360;
  const altitude = position.altitude * 180 / PI;
  return {
    azimuth, altitude,
    x: clamp(50 + (azimuth - 180) * .36, 4, 96),
    y: clamp(77 - 64 * Math.sin(Math.max(0, position.altitude)), 10, 81),
    visible: altitude > -.45 && azimuth >= 52 && azimuth <= 308,
  };
}

export function moonPhaseName(phase) {
  const p = ((phase % 1) + 1) % 1;
  if (p < .04 || p >= .96) return 'New moon';
  if (p < .21) return 'Waxing crescent';
  if (p < .29) return 'First quarter';
  if (p < .46) return 'Waxing gibbous';
  if (p < .54) return 'Full moon';
  if (p < .71) return 'Waning gibbous';
  if (p < .79) return 'Last quarter';
  return 'Waning crescent';
}

// Scan true lunar altitude over the location's calendar day for rise/set crossings.
// This handles timezones including half-hour offsets without relying on browser TZ.
function lunarEvents(astro, date, latitude, longitude, timezone, utcOffsetSeconds = 0) {
  const d = dateParts(date, timezone);
  const beginning = Date.UTC(d.year, d.month - 1, d.day) - utcOffsetSeconds * 1000;
  const getAlt = time => astro.getMoonPosition(new Date(time), latitude, longitude).altitude;
  const step = 20 * 60 * 1000;
  let previous = getAlt(beginning);
  const events = {};
  for (let elapsed = step; elapsed <= MS_PER_DAY; elapsed += step) {
    const altitude = getAlt(beginning + elapsed);
    if ((previous < 0 && altitude >= 0) || (previous >= 0 && altitude < 0)) {
      let a = beginning + elapsed - step;
      let b = beginning + elapsed;
      for (let i = 0; i < 12; i++) {
        const middle = (a + b) / 2;
        if ((getAlt(middle) >= 0) === (previous >= 0)) a = middle;
        else b = middle;
      }
      const kind = previous < 0 ? 'rise' : 'set';
      events[kind] = new Date((a + b) / 2);
    }
    previous = altitude;
  }
  return events;
}

export function celestialState(date, latitude, longitude, timezone, utcOffsetSeconds) {
  const astro = window.SunCalc;
  if (!astro) return null;
  const sun = skyPoint(astro.getPosition(date, latitude, longitude));
  const moon = skyPoint(astro.getMoonPosition(date, latitude, longitude));
  const illumination = astro.getMoonIllumination(date);
  const events = lunarEvents(astro, date, latitude, longitude, timezone, utcOffsetSeconds);
  return { sun, moon, illumination, events, phaseName: moonPhaseName(illumination.phase) };
}

// Use lighting geometry, not a fixed image or a linear fraction of daylight.
export function phaseFromSun(sun) {
  if (!sun || sun.altitude < -6) return 'night';
  if (sun.altitude < 8) return sun.azimuth < 180 ? 'dawn' : 'dusk';
  return 'day';
}

export function formatLocalTime(date, timezone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
}

// Small sphere shading accurately represents new, waxing, full, waning phases.
export function paintMoon(canvas, phase) {
  if (!canvas) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const size = 80;
  canvas.width = canvas.height = size;
  const pixels = context.createImageData(size, size);
  const angle = 2 * PI * phase;
  const lightX = Math.sin(angle);
  const lightZ = -Math.cos(angle);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = ((x + .5) / size - .5) * 2;
      const py = ((y + .5) / size - .5) * 2;
      const radius2 = px * px + py * py;
      if (radius2 >= 1) continue;
      const z = Math.sqrt(1 - radius2);
      const lit = clamp((px * lightX + z * lightZ) * 14 + .5, 0, 1);
      const edge = clamp((1 - Math.sqrt(radius2)) * 23, 0, 1);
      const offset = (y * size + x) * 4;
      const lunarTexture = Math.sin(x * 1.4 + y * .7) * 3;
      pixels.data[offset] = Math.round((62 + 181 * lit + lunarTexture) * edge);
      pixels.data[offset + 1] = Math.round((77 + 166 * lit + lunarTexture) * edge);
      pixels.data[offset + 2] = Math.round((92 + 146 * lit + lunarTexture) * edge);
      // An unlit moon should almost disappear into the sky, rather than
      // rendering as a conspicuous charcoal circle in broad daylight.
      pixels.data[offset + 3] = Math.round((4 + 251 * lit) * edge);
    }
  }
  context.putImageData(pixels, 0, 0);
}
