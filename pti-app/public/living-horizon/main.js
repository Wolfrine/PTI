// Public-safe visual prototype. No authentication, account data or personal metrics.
// Live weather + modelled air quality: Open-Meteo. Opted-in position is coarse.
import {
  ARTWORKS, classifyLandscape, dailyArtworkIndex, localDayKey, celestialState,
  phaseFromSun, formatLocalTime, paintMoon,
} from './environment.js';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const CURRENT_FIELDS = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,visibility,is_day';
const CACHE_KEY = 'pti.living-horizon.coarse-weather.v2';
const AIR_CACHE_KEY = 'pti.living-horizon.coarse-air.v1';
const CACHE_AGE_MS = 15 * 60 * 1000;
const AIR_AGE_MS = 60 * 60 * 1000;
const COARSE_LOCATION = { name: 'Navi Mumbai', latitude: 19.05, longitude: 73.02 };
const PRESETS = {
  dawn: { phase: 'dawn', weather: 'cloudy', description: 'First light over the hills · visual study' },
  day: { phase: 'day', weather: 'clear', description: 'Open sky over the valley · visual study' },
  rain: { phase: 'day', weather: 'rain', description: 'Monsoon moving through · visual study' },
  night: { phase: 'night', weather: 'clear', description: 'A quiet moonlit horizon · visual study' },
};

const frame = document.querySelector('#horizon-frame');
const locationLabel = document.querySelector('#hero-location');
const temperatureLabel = document.querySelector('#hero-temperature');
const descriptionLabel = document.querySelector('#hero-description');
const heroKicker = document.querySelector('#hero-kicker');
const statusNode = document.querySelector('#horizon-status');
const statusLabel = document.querySelector('#status-label');
const sourceLine = document.querySelector('#source-line');
const artwork = document.querySelector('#artwork');
const artButton = document.querySelector('#next-art');
const artCount = document.querySelector('#art-count');
const airReadout = document.querySelector('#air-readout');
const visibilityReadout = document.querySelector('#visibility-readout');
const moonReadout = document.querySelector('#moon-readout');
const moonDisc = document.querySelector('#moon-disc');
const sunDisc = document.querySelector('.sun');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const useLocation = document.querySelector('#use-location');
let liveWeather = null;
let liveLocation = COARSE_LOCATION.name;
let airQuality = null;
let activeMode = 'live';
let liveAttempt = 0;
let airAttempt = 0;
let lastObservationFetch = 0;
let lastAirFetch = 0;
let currentArea = { latitude: COARSE_LOCATION.latitude, longitude: COARSE_LOCATION.longitude, cache: true, label: COARSE_LOCATION.name };
let placeProfile = classifyLandscape(COARSE_LOCATION.name);
let artIndex = -1;
let artOverride = null;
let artOverrideDay = null;
let renderedDay = '';

function setStatus(label, type = 'sample') {
  statusLabel.textContent = label;
  statusNode.dataset.type = type;
}

function localMinutes(timezone) {
  try {
    const segments = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const part = (type) => Number(segments.find(x => x.type === type)?.value ?? 0);
    return part('hour') * 60 + part('minute');
  } catch { return new Date().getHours() * 60 + new Date().getMinutes(); }
}
function conditions(code, cloudCover, precipitation) {
  if (code >= 95) return { weather: 'storm', text: 'Thunderstorms' };
  if (code === 45 || code === 48) return { weather: 'fog', text: 'Foggy' };
  if (code >= 71 && code <= 77) return { weather: 'overcast', text: 'Wintry weather' };
  if (code >= 51 && code <= 82 || precipitation >= .1) return { weather: 'rain', text: 'Rain in the area' };
  if (code === 3 || cloudCover >= 82) return { weather: 'overcast', text: 'Overcast' };
  if (code === 2 || cloudCover >= 42) return { weather: 'cloudy', text: 'Partly cloudy' };
  return { weather: 'clear', text: 'Clear skies' };
}
function updateScene({ phase, weather, description, temperature, location, state, note }) {
  frame.dataset.phase = phase;
  frame.dataset.weather = weather;
  locationLabel.textContent = location;
  temperatureLabel.textContent = Number.isFinite(temperature) ? `${Math.round(temperature)}°` : '';
  descriptionLabel.textContent = description;
  heroKicker.textContent = state === 'live' ? 'THE SKY, RIGHT NOW' : 'LIVING HORIZON · VISUAL STUDY';
  if (state === 'live') setStatus('Live weather', 'live');
  else if (state === 'offline') setStatus('Offline · sample', 'sample');
  else setStatus('Scene preview', 'sample');
  sourceLine.textContent = note;
  configureRain(weather === 'rain' || weather === 'storm', weather === 'storm');
  if (state === 'live') renderCelestials();
  else {
    frame.dataset.sunVisible = String(phase !== 'night');
    frame.dataset.moonVisible = String(phase === 'night');
    frame.style.removeProperty('--sun-x');
    frame.style.removeProperty('--sun-y');
    frame.style.removeProperty('--moon-x');
    frame.style.removeProperty('--moon-y');
    moonDisc.title = 'Illustrative moon · atmosphere preview';
    paintMoon(moonDisc, .5);
  }
  renderReadouts(state === 'live');
}

function environmentTimeZone() { return liveWeather?.timezone || 'Asia/Kolkata'; }

function updateDailyArt() {
  const timezone = environmentTimeZone();
  const today = localDayKey(new Date(), timezone);
  if (today !== renderedDay) {
    renderedDay = today;
    artOverride = null;
    artOverrideDay = null;
  }
  const selected = artOverrideDay === today && artOverride !== null ? artOverride
    : dailyArtworkIndex(new Date(), timezone, placeProfile.region);
  if (selected === artIndex) return;
  artIndex = selected;
  const choice = ARTWORKS[selected];
  artwork.src = '../assets/images/living-horizon/' + choice.file;
  frame.dataset.art = choice.id;
  frame.style.setProperty('--art-position', choice.desktop);
  frame.style.setProperty('--art-mobile-position', choice.mobile);
  artCount.textContent = String(selected + 1) + '/' + ARTWORKS.length;
  artButton.title = 'Today: ' + choice.name + ' · click to explore another artwork';
  artButton.setAttribute('aria-label', artButton.title);
}

function renderCelestials() {
  const position = celestialState(
    new Date(), currentArea.latitude, currentArea.longitude, environmentTimeZone(),
    Number(liveWeather?.utc_offset_seconds) || 19800,
  );
  if (!position) return;
  const { sun, moon, illumination, events, phaseName } = position;
  frame.dataset.sunVisible = String(sun.visible);
  frame.dataset.moonVisible = String(moon.visible && illumination.fraction > .025);
  frame.style.setProperty('--sun-x', sun.x.toFixed(2) + '%');
  frame.style.setProperty('--sun-y', sun.y.toFixed(2) + '%');
  frame.style.setProperty('--moon-x', moon.x.toFixed(2) + '%');
  frame.style.setProperty('--moon-y', moon.y.toFixed(2) + '%');
  const sunrise = String(liveWeather?.daily?.sunrise?.[0] || '').split('T')[1] || '—';
  const sunset = String(liveWeather?.daily?.sunset?.[0] || '').split('T')[1] || '—';
  sunDisc.title = 'Sun altitude ' + Math.round(sun.altitude) + '° · rise ' + sunrise + ' · set ' + sunset;
  paintMoon(moonDisc, illumination.phase);
  const rise = events.rise ? ' · rises ' + formatLocalTime(events.rise, environmentTimeZone()) : '';
  const set = events.set ? ' · sets ' + formatLocalTime(events.set, environmentTimeZone()) : '';
  moonDisc.title = phaseName + ' · ' + Math.round(illumination.fraction * 100) + '% lit' + rise + set;
  moonReadout.textContent = phaseName + ' ' + Math.round(illumination.fraction * 100) + '%';
  moonReadout.title = moonDisc.title;
}

function renderReadouts(live) {
  const rawVisibility = liveWeather?.current?.visibility;
  const visibilityMeters = Number(rawVisibility);
  const hasVisibility = live && typeof rawVisibility === 'number' && Number.isFinite(visibilityMeters) && visibilityMeters >= 0;
  visibilityReadout.hidden = !hasVisibility;
  if (hasVisibility) {
    const km = visibilityMeters / 1000;
    visibilityReadout.textContent = 'Visibility ' + (km >= 10 ? km.toFixed(0) : km.toFixed(1)) + ' km';
    const visibleHaze = Math.max(0, Math.min(.74, (11000 - visibilityMeters) / 13500));
    frame.style.setProperty('--visibility-haze', visibleHaze.toFixed(2));
  } else frame.style.setProperty('--visibility-haze', '0.04');
  const rawAqi = airQuality?.current?.us_aqi;
  const usAqi = Number(rawAqi);
  const hasAir = live && typeof rawAqi === 'number' && Number.isFinite(usAqi) && usAqi >= 0;
  airReadout.hidden = !hasAir;
  if (hasAir) {
    airReadout.textContent = 'US AQI ' + Math.round(usAqi);
    airReadout.title = 'Modelled US AQI · Copernicus CAMS via Open-Meteo (not an observed Indian AQI reading)';
    frame.style.setProperty('--air-haze', Math.max(0, Math.min(.24, (usAqi - 100) / 700)).toFixed(2));
  } else frame.style.setProperty('--air-haze', '0');
  moonReadout.hidden = !live;
}

function renderMode() {
  updateDailyArt();
  modeButtons.forEach(button => {
    const selected = button.dataset.mode === activeMode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (activeMode !== 'live') {
    frame.style.removeProperty('--cloud-opacity');
    frame.style.removeProperty('--cloud-duration');
    const preset = PRESETS[activeMode];
    updateScene({ ...preset, location: COARSE_LOCATION.name, temperature: null, state: 'preview', note: 'Visual study only · selectable atmospheres are not live readings.' });
    return;
  }
  if (liveWeather?.current) {
    const current = liveWeather.current;
    const rainfall = Math.max(Number(current.rain) || 0, Number(current.showers) || 0, Number(current.precipitation) || 0);
    const { weather, text } = conditions(Number(current.weather_code), Number(current.cloud_cover), rainfall);
    const solar = celestialState(
      new Date(), currentArea.latitude, currentArea.longitude, environmentTimeZone(),
      Number(liveWeather.utc_offset_seconds) || 19800,
    );
    const phase = phaseFromSun(solar?.sun);
    const hhmm = String(current.time || '').split('T')[1]?.slice(0, 5);
    updateScene({ phase, weather, location: liveLocation, temperature: Number(current.temperature_2m), description: text + (hhmm ? ' · model ' + hhmm : ''), state: 'live', note: `Weather by Open-Meteo · ${liveLocation === COARSE_LOCATION.name ? 'coarse Navi Mumbai area' : 'your opted-in area'} · artwork is interpretive.` });
    const clouds = Number(current.cloud_cover);
    sourceLine.textContent = 'Open-Meteo weather · CAMS / Open-Meteo modelled air · ' +
      (placeProfile.artworkGeographyMatch ? 'coastal-foothill art' : 'regional artwork not yet mapped') + '.';
    if (weather === 'rain' || weather === 'storm') {
      frame.style.setProperty('--rain-sheet-opacity', Math.min(.64, Math.max(.34, .34 + rainfall / 12)).toFixed(2));
    }
    if (Number.isFinite(clouds)) frame.style.setProperty('--cloud-opacity', String(Math.min(.96, .10 + clouds / 124).toFixed(2)));
    const wind = Number(current.wind_speed_10m);
    if (Number.isFinite(wind)) frame.style.setProperty('--cloud-duration', `${Math.max(65, Math.min(145, 145 - wind * 2.4))}s`);
    return;
  }
  frame.style.removeProperty('--cloud-opacity');
  frame.style.removeProperty('--cloud-duration');
  const hour = Math.floor(localMinutes('Asia/Kolkata') / 60);
  const phase = hour < 5 || hour > 19 ? 'night' : hour < 8 ? 'dawn' : hour > 17 ? 'dusk' : 'day';
  updateScene({ phase, weather: 'cloudy', location: COARSE_LOCATION.name, temperature: null, description: 'Weather feed unavailable · visual study', state: 'offline', note: 'Offline · sample atmosphere shown. No current weather reading available.' });
}
function setMode(mode) {
  if (mode !== 'live' && !PRESETS[mode]) return;
  activeMode = mode;
  const url = new URL(window.location.href);
  url.searchParams.set('mode', mode);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  renderMode();
  if (mode === 'live' && Date.now() - lastObservationFetch >= CACHE_AGE_MS) {
    void fetchWeather(currentArea.latitude, currentArea.longitude, currentArea);
  }
}

function readCache() {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return value && Date.now() - value.at < CACHE_AGE_MS && value.data?.current ? value : null;
  } catch { return null; }
}
async function fetchWeather(latitude, longitude, { cache = false, label = COARSE_LOCATION.name } = {}) {
  const myAttempt = ++liveAttempt;
  currentArea = { latitude, longitude, cache, label };
  // Throttle retries as well as successful refreshes when the feed is unavailable.
  lastObservationFetch = Date.now();
  if (cache) {
    const stored = readCache();
    if (stored) { liveWeather = stored.data; lastObservationFetch = stored.at; liveLocation = label; if (activeMode === 'live') renderMode(); return; }
  }
  if (activeMode === 'live') setStatus('Connecting', 'fetching');
  try {
    const url = new URL(WEATHER_URL);
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', CURRENT_FIELDS);
    url.searchParams.set('daily', 'sunrise,sunset');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '1');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 9000);
    let response;
    try { response = await fetch(url, { signal: controller.signal, cache: 'no-store' }); }
    finally { window.clearTimeout(timeout); }
    if (!response.ok) throw new Error(`Weather HTTP ${response.status}`);
    const data = await response.json();
    if (!data?.current || typeof data.current.temperature_2m !== 'number') throw new Error('Incomplete current conditions');
    if (myAttempt !== liveAttempt) return;
    liveWeather = data;
    liveLocation = label === 'Your area' && liveLocation !== 'Your area' ? liveLocation : label;
    lastObservationFetch = Date.now();
    if (cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* Storage is optional. */ } }
    if (activeMode === 'live') renderMode();
  } catch (error) {
    if (myAttempt !== liveAttempt) return;
    liveWeather = null;
    if (activeMode === 'live') renderMode();
    console.info('Living Horizon: current weather unavailable; using clearly labelled visual study.', error?.message || error);
  }
}

function readAirCache() {
  try {
    const value = JSON.parse(localStorage.getItem(AIR_CACHE_KEY) || 'null');
    return value && Date.now() - value.at < AIR_AGE_MS && value.data?.current ? value : null;
  } catch { return null; }
}

async function fetchAirQuality(latitude, longitude, cache = false) {
  const attempt = ++airAttempt;
  lastAirFetch = Date.now();
  if (cache) {
    const stored = readAirCache();
    if (stored) {
      airQuality = stored.data;
      lastAirFetch = stored.at;
      if (activeMode === 'live') renderReadouts(true);
      return;
    }
  }
  try {
    const url = new URL(AIR_URL);
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', 'us_aqi,pm2_5,pm10');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '1');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    let response;
    try { response = await fetch(url, { signal: controller.signal, cache: 'no-store' }); }
    finally { window.clearTimeout(timeout); }
    if (!response.ok) throw new Error('Air quality HTTP ' + response.status);
    const result = await response.json();
    if (!result?.current || typeof result.current.us_aqi !== 'number') throw new Error('AQI missing');
    if (attempt !== airAttempt) return;
    airQuality = result;
    lastAirFetch = Date.now();
    if (cache) {
      try { localStorage.setItem(AIR_CACHE_KEY, JSON.stringify({ at: Date.now(), data: result })); }
      catch { /* Cache is optional. */ }
    }
    if (activeMode === 'live') renderReadouts(true);
  } catch (error) {
    if (attempt !== airAttempt) return;
    airQuality = null;
    if (activeMode === 'live') renderReadouts(true);
    console.info('Living Horizon: modelled air quality unavailable.', error?.message || error);
  }
}

async function resolveCoarsePlace(latitude, longitude) {
  // Only called after explicit user location permission; no continuous reverse-geocode.
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '10');
    url.searchParams.set('addressdetails', '1');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    let response;
    try { response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } }); }
    finally { window.clearTimeout(timeout); }
    if (!response.ok) return;
    const data = await response.json();
    const address = data?.address || {};
    const name = address.city || address.town || address.village || address.county || 'Your area';
    liveLocation = String(name).slice(0, 45);
    placeProfile = classifyLandscape(name, address, liveWeather?.elevation);
    currentArea.label = liveLocation;
    artIndex = -1;
    if (activeMode === 'live') renderMode();
  } catch { /* The area label and landscape may remain generic. */ }
}

function seededStars() {
  const holder = document.querySelector('#starfield');
  let seed = 1729;
  const next = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let n = 0; n < 47; n++) {
    const point = document.createElement('span');
    point.style.left = `${6 + next() * 88}%`;
    point.style.top = `${4 + next() * 56}%`;
    point.style.width = point.style.height = `${next() > .8 ? 2 : 1}px`;
    point.style.animationDelay = `${next() * -5}s`;
    holder.appendChild(point);
  }
}

// Frame-budgeted rain animation. CSS supplies an always-visible static rain layer
// for reduced-motion mode and browsers that suspend requestAnimationFrame.
const canvas = document.querySelector('#weather-canvas');
const ctx = canvas.getContext('2d');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let drops = [], rainActive = false, thunder = false, inView = true, raf = 0, lastFrame = 0, width = 0, height = 0;
function sizeCanvas() {
  const bounds = frame.getBoundingClientRect();
  width = bounds.width; height = bounds.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
  drops = Array.from({ length: Math.max(60, Math.floor(width / 5.5)) }, (_, i) => ({
    x: ((i * 137.7) % width), y: ((i * 71.3) % height),
    speed: 2.2 + (i % 7) * .27, len: 11 + i % 15,
  }));
}
function drawRain(time) {
  raf = 0;
  if (!rainActive || !inView || reducedMotion.matches || !ctx) return;
  if (time - lastFrame < 32) { raf = requestAnimationFrame(drawRain); return; }
  lastFrame = time;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = thunder ? 'rgba(224,242,253,.70)' : 'rgba(238,251,255,.57)';
  ctx.lineWidth = thunder ? 1.3 : 1.05;
  ctx.beginPath();
  for (const drop of drops) {
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x - 5, drop.y + drop.len);
    drop.x -= 1.2; drop.y += drop.speed * 2.7;
    if (drop.y > height + 18) { drop.y = -25; drop.x = Math.random() * width; }
    if (drop.x < -10) drop.x = width + 5;
  }
  ctx.stroke();
  raf = requestAnimationFrame(drawRain);
}
function configureRain(active, storm = false) {
  rainActive = active; thunder = storm;
  frame.style.setProperty('--rain-sheet-opacity', !active ? '0' : storm ? '.61' : '.35');
  ctx?.clearRect(0, 0, width, height);
  if (!raf && active && inView && !reducedMotion.matches) raf = requestAnimationFrame(drawRain);
  if (!active && raf) { cancelAnimationFrame(raf); raf = 0; }
}
function setup() {
  seededStars();
  sizeCanvas();
  new ResizeObserver(sizeCanvas).observe(frame);
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; frame.classList.toggle('out-of-view', !inView); configureRain(rainActive, thunder); }).observe(frame);
  reducedMotion.addEventListener?.('change', () => configureRain(rainActive, thunder));
  modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  artButton.addEventListener('click', () => {
    artOverride = (artIndex + 1) % ARTWORKS.length;
    artOverrideDay = localDayKey(new Date(), environmentTimeZone());
    updateDailyArt();
  });
  const initialMode = new URL(window.location.href).searchParams.get('mode');
  activeMode = initialMode === 'live' || PRESETS[initialMode] ? initialMode : 'live';
  renderMode();
  void fetchWeather(COARSE_LOCATION.latitude, COARSE_LOCATION.longitude, { cache: true });
  void fetchAirQuality(COARSE_LOCATION.latitude, COARSE_LOCATION.longitude, true);
  // Refresh only while the live scene is visible, at most once per 15 minutes.
  window.setInterval(() => {
    if (document.hidden || activeMode !== 'live') return;
    if (liveWeather) renderMode();
    if (Date.now() - lastObservationFetch >= CACHE_AGE_MS) {
      void fetchWeather(currentArea.latitude, currentArea.longitude, currentArea);
    }
    if (Date.now() - lastAirFetch >= AIR_AGE_MS) {
      void fetchAirQuality(currentArea.latitude, currentArea.longitude, currentArea.cache);
    }
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || activeMode !== 'live') return;
    renderMode();
    if (Date.now() - lastObservationFetch > CACHE_AGE_MS) {
      void fetchWeather(currentArea.latitude, currentArea.longitude, currentArea);
    }
    if (Date.now() - lastAirFetch > AIR_AGE_MS) {
      void fetchAirQuality(currentArea.latitude, currentArea.longitude, currentArea.cache);
    }
  });
  useLocation.addEventListener('click', () => {
    if (!navigator.geolocation) { sourceLine.textContent = 'Location access is unavailable. Using the coarse Navi Mumbai area.'; return; }
    sourceLine.textContent = 'Permission requested · approximate area is sent to weather, air and place providers.';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // Two decimals (~1 km) are enough for a visual atmosphere and avoid
        // sending or saving the precise GPS result.
        const latitude = Math.round(coords.latitude * 100) / 100;
        const longitude = Math.round(coords.longitude * 100) / 100;
        liveLocation = 'Your area';
        placeProfile = classifyLandscape('Your area');
        airQuality = null;
        artIndex = -1;
        lastObservationFetch = Date.now();
        setMode('live');
        void fetchWeather(latitude, longitude, { cache: false, label: 'Your area' });
        void fetchAirQuality(latitude, longitude, false);
        void resolveCoarsePlace(latitude, longitude);
      },
      () => { sourceLine.textContent = 'Location not shared · using the coarse Navi Mumbai weather view.'; },
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 10000 },
    );
  });
  document.querySelector('#app-search').addEventListener('input', event => {
    const term = String(event.target.value || '').trim().toLowerCase();
    document.querySelectorAll('.pinned-card').forEach(card => { card.hidden = !card.textContent.toLowerCase().includes(term); });
  });
}
setup();
