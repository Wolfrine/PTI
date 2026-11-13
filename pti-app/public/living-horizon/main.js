// Public-safe visual prototype. No authentication, account data or personal metrics.
// Live weather: Open-Meteo Forecast API. An opted-in precise position is never persisted.
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const CURRENT_FIELDS = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,cloud_cover,wind_speed_10m,is_day';
const CACHE_KEY = 'pti.living-horizon.coarse-weather.v1';
const CACHE_AGE_MS = 15 * 60 * 1000;
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
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const useLocation = document.querySelector('#use-location');
let liveWeather = null;
let liveLocation = COARSE_LOCATION.name;
let activeMode = 'live';
let liveAttempt = 0;
let lastObservationFetch = 0;
let currentArea = { latitude: COARSE_LOCATION.latitude, longitude: COARSE_LOCATION.longitude, cache: true, label: COARSE_LOCATION.name };

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
function eventMinutes(value) {
  const match = typeof value === 'string' ? value.match(/T(\d{2}):(\d{2})/) : null;
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}
function derivePhase(weather) {
  const now = localMinutes(weather.timezone || 'Asia/Kolkata');
  const dawn = eventMinutes(weather.daily?.sunrise?.[0]) ?? 365;
  const dusk = eventMinutes(weather.daily?.sunset?.[0]) ?? 1080;
  if (now >= dawn - 55 && now <= dawn + 48) return 'dawn';
  if (now >= dusk - 65 && now <= dusk + 44) return 'dusk';
  if (now < dawn - 55 || now > dusk + 44) return 'night';
  return 'day';
}
function conditions(code, cloudCover, precipitation) {
  if (code >= 95) return { weather: 'storm', text: 'Thunderstorms' };
  if (code === 45 || code === 48) return { weather: 'fog', text: 'Foggy' };
  if (code >= 71 && code <= 77) return { weather: 'overcast', text: 'Wintry weather' };
  if (code >= 51 && code <= 82 || precipitation >= .6) return { weather: 'rain', text: 'Rain in the area' };
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
  adjustOrb(phase, liveWeather);
}
function adjustOrb(phase, observation) {
  // The selected study states retain a stable illustrative sun position.
  if (activeMode !== 'live' || !observation || phase === 'night') {
    frame.style.removeProperty('--sun-x');
    frame.style.removeProperty('--sun-y');
    return;
  }
  const sunrise = eventMinutes(observation.daily?.sunrise?.[0]);
  const sunset = eventMinutes(observation.daily?.sunset?.[0]);
  if (sunrise == null || sunset == null || sunset <= sunrise) return;
  const progress = Math.max(0, Math.min(1, (localMinutes(observation.timezone) - sunrise) / (sunset - sunrise)));
  frame.style.setProperty('--sun-x', `${14 + progress * 72}%`);
  frame.style.setProperty('--sun-y', `${60 - 43 * Math.sin(progress * Math.PI)}%`);
}

function renderMode() {
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
    const { weather, text } = conditions(Number(current.weather_code), Number(current.cloud_cover), Number(current.precipitation));
    const phase = derivePhase(liveWeather);
    const hhmm = String(current.time || '').split('T')[1]?.slice(0, 5);
    updateScene({ phase, weather, location: liveLocation, temperature: Number(current.temperature_2m), description: `${text}${hhmm ? ` · observed ${hhmm}` : ''}`, state: 'live', note: `Weather by Open-Meteo · ${liveLocation === COARSE_LOCATION.name ? 'coarse Navi Mumbai area' : 'your opted-in area'} · artwork is interpretive.` });
    const clouds = Number(current.cloud_cover);
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
    liveWeather = data; liveLocation = label; lastObservationFetch = Date.now();
    if (cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* Storage is optional. */ } }
    if (activeMode === 'live') renderMode();
  } catch (error) {
    if (myAttempt !== liveAttempt) return;
    liveWeather = null;
    if (activeMode === 'live') renderMode();
    console.info('Living Horizon: current weather unavailable; using clearly labelled visual study.', error?.message || error);
  }
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

// Frame-budgeted rainfall canvas. It draws only when visibly rainy, in view and motion is allowed.
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
  drops = Array.from({ length: Math.max(35, Math.floor(width / 5)) }, (_, i) => ({ x: ((i * 137.7) % width), y: ((i * 71.3) % height), speed: 1.8 + (i % 7) * .23, len: 9 + i % 13 }));
}
function drawRain(time) {
  raf = 0;
  if (!rainActive || !inView || reducedMotion.matches || !ctx) return;
  if (time - lastFrame < 30) { raf = requestAnimationFrame(drawRain); return; }
  lastFrame = time;
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = thunder ? 'rgba(228,241,244,.50)' : 'rgba(240,250,255,.44)';
  ctx.lineWidth = .9;
  ctx.beginPath();
  for (const drop of drops) {
    ctx.moveTo(drop.x, drop.y);
    ctx.lineTo(drop.x - 3.8, drop.y + drop.len);
    drop.x -= .9; drop.y += drop.speed * 2.4;
    if (drop.y > height + 18) { drop.y = -25; drop.x = Math.random() * width; }
    if (drop.x < -10) drop.x = width + 5;
  }
  ctx.stroke();
  raf = requestAnimationFrame(drawRain);
}
function configureRain(active, storm = false) {
  rainActive = active; thunder = storm;
  ctx?.clearRect(0, 0, width, height);
  if (!raf && active && inView && !reducedMotion.matches) raf = requestAnimationFrame(drawRain);
  if (!active && raf) { cancelAnimationFrame(raf); raf = 0; }
}
function setup() {
  seededStars();
  sizeCanvas();
  new ResizeObserver(sizeCanvas).observe(frame);
  new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; configureRain(rainActive, thunder); }).observe(frame);
  reducedMotion.addEventListener?.('change', () => configureRain(rainActive, thunder));
  modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  const initialMode = new URL(window.location.href).searchParams.get('mode');
  activeMode = initialMode === 'live' || PRESETS[initialMode] ? initialMode : 'live';
  renderMode();
  void fetchWeather(COARSE_LOCATION.latitude, COARSE_LOCATION.longitude, { cache: true });
  // This is only a client-side clock tick. Weather is not polled in the background.
  window.setInterval(() => { if (!document.hidden && activeMode === 'live' && liveWeather) renderMode(); }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || activeMode !== 'live') return;
    renderMode();
    if (Date.now() - lastObservationFetch > CACHE_AGE_MS) {
      void fetchWeather(currentArea.latitude, currentArea.longitude, currentArea);
    }
  });
  useLocation.addEventListener('click', () => {
    if (!navigator.geolocation) { sourceLine.textContent = 'Location access is unavailable. Using the coarse Navi Mumbai area.'; return; }
    sourceLine.textContent = 'Waiting for your location permission · your coordinates are not saved.';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => { setMode('live'); void fetchWeather(coords.latitude, coords.longitude, { cache: false, label: 'Your area' }); },
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
