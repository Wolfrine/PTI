// Observation-backed source comparison for the Living Horizon experiment only.
// No GPS, account information or API keys are persisted or sent to PTI storage.
// Open-Meteo supplies gridded models; METAR is a nearby airport observation.

export const WEATHER_LAB_AREAS = Object.freeze([
  { id: 'kharghar', name: 'Kharghar', latitude: 19.05064, longitude: 73.07570 },
  { id: 'belapur', name: 'CBD Belapur', latitude: 19.02350, longitude: 73.03930 },
  { id: 'panvel', name: 'Panvel', latitude: 18.99970, longitude: 73.12630 },
  { id: 'vashi', name: 'Vashi', latitude: 19.07210, longitude: 73.00420 },
  { id: 'ulwe', name: 'Ulwe', latitude: 18.97050, longitude: 73.03120 },
  { id: 'thane', name: 'Thane', latitude: 19.22690, longitude: 72.97840 },
  { id: 'mumbai-airport', name: 'Mumbai Airport', latitude: 19.09020, longitude: 72.86280 },
]);

// Aerodrome positions: Indian aeronautical information and public airport data.
// These are station locations, not representative points for a neighbourhood.
const STATIONS = Object.freeze([
  { icao: 'VANM', name: 'Navi Mumbai Airport', latitude: 18.99438, longitude: 73.07026 },
  { icao: 'VABB', name: 'Mumbai Airport', latitude: 19.08900, longitude: 72.86600 },
]);

const MAX_STATION_DISTANCE_KM = 40;
const MAX_STATION_AGE_MINUTES = 90;
const METAR_CACHE_MS = 2 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10500;
const metarCache = new Map();
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export function distanceKm(latitude, longitude, otherLatitude, otherLongitude) {
  const radiusKm = 6371;
  const rad = degrees => degrees * Math.PI / 180;
  const dLatitude = rad(otherLatitude - latitude);
  const dLongitude = rad(otherLongitude - longitude);
  const a = Math.sin(dLatitude / 2) ** 2 + Math.cos(rad(latitude)) * Math.cos(rad(otherLatitude))
    * Math.sin(dLongitude / 2) ** 2;
  return 2 * radiusKm * Math.asin(Math.min(1, Math.sqrt(a)));
}

function validLocation(latitude, longitude) {
  return Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
}

async function fetchJson(url, signal) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(abort, FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-store', credentials: 'omit',
      headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

async function fetchModel(latitude, longitude, signal) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', 'temperature_2m,visibility,weather_code,cloud_cover,precipitation,wind_speed_10m');
  url.searchParams.set('forecast_days', '1');
  url.searchParams.set('timezone', 'auto');
  const result = await fetchJson(url, signal);
  const values = result?.current;
  if (!values || typeof values.time !== 'string') throw new Error('Incomplete model reading');
  const visibilityMeters = numeric(values.visibility);
  return {
    source: 'Open-Meteo', kind: 'model', time: values.time, timezone: result.timezone || 'UTC',
    grid: { latitude: numeric(result.latitude), longitude: numeric(result.longitude) },
    temperatureC: numeric(values.temperature_2m), cloudCoverPct: numeric(values.cloud_cover),
    weatherCode: numeric(values.weather_code), precipitationMm: numeric(values.precipitation),
    windKmh: numeric(values.wind_speed_10m),
    visibilityMeters, visibilityKm: visibilityMeters === null ? null : visibilityMeters / 1000,
  };
}

async function fetchAir(latitude, longitude, signal) {
  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', 'pm2_5,pm10,us_aqi');
  url.searchParams.set('timezone', 'auto');
  const result = await fetchJson(url, signal);
  const values = result?.current;
  if (!values || typeof values.time !== 'string') throw new Error('Incomplete air-quality reading');
  return {
    source: 'Open-Meteo Air Quality', kind: 'model', time: values.time,
    timezone: result.timezone || 'UTC',
    grid: { latitude: numeric(result.latitude), longitude: numeric(result.longitude) },
    pm25: numeric(values.pm2_5), pm10: numeric(values.pm10), usAqi: numeric(values.us_aqi),
  };
}

// A METAR encodes day-of-month and UTC time, but not month/year. Resolve it
// against adjacent months instead of assuming the device's local month.
function metarObservationTime(timestamp, now = new Date()) {
  const match = /^(\d{2})(\d{2})(\d{2})Z$/.exec(String(timestamp || ''));
  if (!match) return null;
  const day = Number(match[1]);
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  if (day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const candidates = [-1, 0, 1].map(monthOffset => new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth() + monthOffset, day, hour, minute,
  ))).filter(value => value.getUTCDate() === day);
  const viable = candidates.filter(candidate => candidate.getTime() - now.getTime() <= 5 * 60 * 1000);
  return viable.sort((a, b) => Math.abs(now - a) - Math.abs(now - b))[0] || null;
}

const WEATHER_CODES = Object.freeze({
  HZ: 'Haze', FU: 'Smoke', BR: 'Mist', FG: 'Fog', DU: 'Dust', SA: 'Sand',
  RA: 'Rain', DZ: 'Drizzle', TS: 'Thunderstorm', SN: 'Snow', VA: 'Volcanic ash',
});

function decodePhenomena(parsed, raw) {
  const words = new Set();
  for (const entry of Array.isArray(parsed?.weather) ? parsed.weather : []) {
    const code = String(entry?.code || '').replace(/^[+\-]/, '').toUpperCase();
    for (const [symbol, label] of Object.entries(WEATHER_CODES)) {
      if (code.includes(symbol)) words.add(label);
    }
  }
  // Some feeds omit decoded phenomena while retaining the raw report.
  if (!words.size) for (const token of String(raw || '').split(/\s+/)) {
    if (WEATHER_CODES[token]) words.add(WEATHER_CODES[token]);
  }
  return [...words];
}

function describeClouds(parsed, raw) {
  const layers = Array.isArray(parsed?.clouds) ? parsed.clouds : [];
  const highest = ['OVC', 'BKN', 'SCT', 'FEW'].find(code => layers.some(layer => layer?.type === code));
  if (highest) return ({ OVC: 'Overcast', BKN: 'Broken clouds', SCT: 'Scattered clouds', FEW: 'Few clouds' })[highest];
  if (/\b(?:NSC|NCD|SKC|CLR|CAVOK)\b/.test(raw)) return 'No significant clouds';
  return 'Cloud cover unreported';
}

function parseMetar(payload, station, latitude, longitude, now) {
  const parsed = payload?.parsed || payload;
  const raw = String(parsed?.rawText || payload?.raw || '').trim();
  if (!raw || parsed?.isNil || parsed?.station !== station.icao || payload?.station && payload.station !== station.icao) return null;
  const date = metarObservationTime(parsed.timestamp || payload.timestamp, now);
  if (!date) return null;
  const ageMinutes = (now.getTime() - date.getTime()) / 60000;
  const distance = distanceKm(latitude, longitude, station.latitude, station.longitude);
  if (ageMinutes < -5 || ageMinutes > MAX_STATION_AGE_MINUTES || distance > MAX_STATION_DISTANCE_KM) return null;
  const reportedVisibility = numeric(parsed?.visibility?.meters);
  const visibilityToken = parsed?.tokens?.find(token => token.type === 'VISIBILITY')?.text;
  const visibilityLowerBound = visibilityToken === '9999' || /\b(?:9999|CAVOK)\b/.test(raw);
  const visibilityMeters = reportedVisibility === null && visibilityLowerBound ? 10000 : reportedVisibility;
  if (visibilityMeters === null || visibilityMeters < 0) return null;
  return {
    source: 'METAR via metars.eu (NOAA)', kind: 'nearby_observation',
    station: station.icao, stationName: station.name,
    stationLatitude: station.latitude, stationLongitude: station.longitude,
    observedAt: date.toISOString(), ageMinutes, distanceKm: distance,
    visibilityMeters, visibilityKm: visibilityMeters / 1000, visibilityLowerBound,
    phenomena: decodePhenomena(parsed, raw), cloudDescription: describeClouds(parsed, raw),
    temperatureC: numeric(parsed?.temperature?.temp), raw,
  };
}

async function fetchStation(station, latitude, longitude, signal, now) {
  const cached = metarCache.get(station.icao);
  let body;
  if (cached && Date.now() - cached.at < METAR_CACHE_MS) body = cached.body;
  else {
    body = await fetchJson(`https://metars.eu/api/metars/${station.icao}/decoded`, signal);
    metarCache.set(station.icao, { at: Date.now(), body });
  }
  return parseMetar(body, station, latitude, longitude, now);
}

/**
 * Source contract for the experiment UI:
 * {model, air, observation, stations, errors}, where unavailable readings are
 * null, stations contains all fresh qualifying airport reports ordered by
 * distance, and errors has fixed non-sensitive short provider messages.
 * Neither modeled visibility nor airport visibility is labelled a device fix.
 */
export async function fetchWeatherComparison({ latitude, longitude, signal } = {}) {
  if (!validLocation(latitude, longitude)) throw new TypeError('Valid latitude/longitude required');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const now = new Date();
  const eligible = STATIONS.filter(station => distanceKm(latitude, longitude, station.latitude, station.longitude)
    <= MAX_STATION_DISTANCE_KM);
  const [modelResult, airResult, ...stationResults] = await Promise.allSettled([
    fetchModel(latitude, longitude, signal), fetchAir(latitude, longitude, signal),
    ...eligible.map(station => fetchStation(station, latitude, longitude, signal, now)),
  ]);
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  const model = modelResult.status === 'fulfilled' ? modelResult.value : null;
  const air = airResult.status === 'fulfilled' ? airResult.value : null;
  const stations = stationResults.filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value).sort((a, b) => a.distanceKm - b.distanceKm);
  const errors = {};
  if (!model) errors.model = 'Model unavailable';
  if (!air) errors.air = 'Air-quality model unavailable';
  if (!stations.length) errors.observation = eligible.length
    ? 'No fresh nearby airport observation' : 'No airport station within 40 km';
  return { model, air, observation: stations[0] || null, stations, errors };
}
