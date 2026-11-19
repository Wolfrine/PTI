// Public-safe visual prototype. No authentication, account data or personal metrics.
// Live weather: Open-Meteo forecast with fresh nearby METAR air observations.
import {
  ARTWORKS, classifyLandscape, localDayKey, celestialState,
  phaseFromSun, formatLocalTime, paintMoon, moonPhaseName, celestialAppearance,
} from './environment.js?v=artwork-expansion-20261119';
import { EXPERIMENTAL_ARTWORKS } from './artwork-experiments.js?v=artwork-promotion-20261116';
import {
  REGION_PACKS, resolveLandscapeProfile, pickRegionPack, artworkMatchesPack,
  eligibleArtwork, regionalArtworkIndex, randomRegionalArtworkIndex,
} from './landscape-regions.js?v=artwork-expansion-20261119';
import { createCloudSystem } from './clouds.js?v=horizon-r8-20261115';
import { createRainSystem } from './rain-effects.js?v=horizon-r8-20261115';
import { fetchNearbyObservation } from './weather-sources.js?v=weather-home-accuracy-20261116';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const CURRENT_FIELDS = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,visibility,is_day';
const HOURLY_FIELDS = 'temperature_2m,precipitation_probability,precipitation,weather_code,cloud_cover,wind_speed_10m,visibility';
const CACHE_KEY = 'pti.living-horizon.coarse-weather.v3';
const CACHE_AGE_MS = 15 * 60 * 1000;
const LAST_OBSERVATION_AGE_MS = 6 * 60 * 60 * 1000;
const COARSE_LOCATION = { name: 'Navi Mumbai area', latitude: 19.05, longitude: 73.02 };
const PRESETS = {
  dawn: { event: 'sunrise', weather: 'cloudy', cloud: 48, rain: 0 },
  day: { event: 'solarNoon', weather: 'clear', cloud: 8, rain: 0 },
  rain: { event: 'solarNoon', weather: 'rain', cloud: 91, rain: 8 },
  night: { event: 'night', weather: 'clear', cloud: 8, rain: 0 },
};

const frame = document.querySelector('#horizon-frame');
const locationLabel = document.querySelector('#hero-location');
const temperatureLabel = document.querySelector('#hero-temperature');
const descriptionLabel = document.querySelector('#hero-description');
const heroObservationTime = document.querySelector('#hero-observation-time');
const heroKicker = document.querySelector('#hero-kicker');
const statusNode = document.querySelector('#horizon-status');
const statusLabel = document.querySelector('#status-label');
const isHomeEmbed = document.documentElement.classList.contains('horizon-embed');
const isArtworkLab = document.documentElement.classList.contains('horizon-art-lab');
// The experiment retains its own model/observation toggle. Home uses a fresh
// nearby observation automatically, without presenting it as device-measured.
let weatherLabObservation = null;
let homeNearbyObservation = null;
let deviceLocationAccuracy = null;
let deviceLocationRequest = 0;
const homeClockButton = document.querySelector('#home-weather-clock');
const homeClock = document.querySelector('#home-local-time');
const homeRefreshStatus = document.querySelector('#home-refresh-status');
const homeWeatherCredits = document.querySelector('.home-weather-credits');
const homeWeatherCredit = document.querySelector('#home-weather-credit');
const homeMetarCredit = document.querySelector('#home-metar-credit');
const homeMapCredit = document.querySelector('#home-map-credit');
const isAmbient = document.documentElement.classList.contains('horizon-ambient');
const forecastOutlook = document.querySelector('#forecast-outlook');
const forecastHours = document.querySelector('#forecast-hours');
const forecastSource = document.querySelector('#forecast-source');
const sourceLine = document.querySelector('#source-line');
const artwork = document.querySelector('#artwork');
const incomingArtwork = document.querySelector('#artwork-incoming');
const artButton = document.querySelector('#next-art');
const artCount = document.querySelector('#art-count');
const artLabGrid = document.querySelector('#art-lab-grid');
const artLabOriginal = document.querySelector('#art-lab-original');
const artLabSelection = document.querySelector('#art-lab-selection');
const atmosphericReadouts = document.querySelector('.atmospheric-readouts');
const visibilityReadout = document.querySelector('#visibility-readout');
const moonReadout = document.querySelector('#moon-readout');
const geographyReadout = document.querySelector('#geography-readout');
const moonDisc = document.querySelector('#moon-disc');
const sunDisc = document.querySelector('.sun');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const useLocation = document.querySelector('#use-location');
const cloudSystem = createCloudSystem(document.querySelector('#cloud-canvas'), frame);
const rainSystem = createRainSystem(document.querySelector('#weather-canvas'), frame);
const studio = document.querySelector('#scene-lab');
const studioInputs = [...document.querySelectorAll('[data-sim]')];
const studioSummary = document.querySelector('#sim-summary');
const studioGeographyNote = document.querySelector('#sim-geography-note');
let liveWeather = null;
let liveWeatherStale = false;
let lastValidObservationAt = 0;
let liveLocation = COARSE_LOCATION.name;
let activeMode = 'live';
let liveAttempt = 0;
let lastObservationFetch = 0;
let currentArea = { latitude: COARSE_LOCATION.latitude, longitude: COARSE_LOCATION.longitude, cache: true, label: COARSE_LOCATION.name };
let placeProfile = classifyLandscape(COARSE_LOCATION.name);
let artIndex = -1;
let homeSelectedArtIndex = -1;
let homeFallbackArtIndex = -1;
let experimentalArtIndex = -1;
let artOverride = null;
let artOverrideDay = null;
let renderedDay = '';
let simulation = null;
let landscapeResolveAttempt = 0;
let homeRefreshing = false;
let selectedForecastIndex = null;
let homeVisualBusy = isHomeEmbed;
let homeVisualReady = false;
let homePresentationToken = 0;
let artCrossfadeToken = 0;
let artCrossfadeTimer = null;
let artCrossfadeFile = null;

const clamp = (n, minimum, maximum) => Math.max(minimum, Math.min(maximum, n));
const displayTime = minutes => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Convert a wall-clock time in the selected place's IANA time zone into an
// instant. This deliberately does not use the viewing device's time zone.
function zonedDate(dayKey, minutes, timezone) {
  const [year, month, day] = dayKey.split('-').map(Number);
  if (!year || !month || !day) return new Date();
  const target = Date.UTC(year, month - 1, day, Math.floor(minutes / 60), minutes % 60);
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  let instant = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = formatter.formatToParts(new Date(instant));
    const value = type => Number(parts.find(part => part.type === type)?.value || 0);
    const wall = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'));
    const delta = wall - target;
    instant -= delta;
    if (!delta) break;
  }
  return new Date(instant);
}

function localTimeAsMinutes(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const field = type => Number(parts.find(part => part.type === type)?.value || 0);
  return field('hour') * 60 + field('minute');
}

function offsetSecondsAt(date, timezone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const field = type => Number(parts.find(part => part.type === type)?.value || 0);
  const wall = Date.UTC(field('year'), field('month') - 1, field('day'), field('hour'), field('minute'), field('second'));
  return Math.round((wall - date.getTime()) / 1000);
}

function localDayOffset(date, timezone) {
  const midnight = zonedDate(localDayKey(date, timezone), 0, timezone);
  return offsetSecondsAt(midnight, timezone);
}

function createSimulation() {
  const timezone = environmentTimeZone();
  const now = new Date();
  const weather = liveWeather?.current || {};
  const numeric = (value, fallback) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  const rainfall = Math.max(Number(weather.rain) || 0, Number(weather.showers) || 0, Number(weather.precipitation) || 0);
  const derivedWeather = conditions(Number(weather.weather_code), Number(weather.cloud_cover), rainfall).weather;
  const moon = celestialState(now, currentArea.latitude, currentArea.longitude, timezone, localDayOffset(now, timezone));
  return {
    date: localDayKey(now, timezone), minutes: Math.floor(localMinutes(timezone) / 5) * 5,
    weather: liveWeather?.current ? derivedWeather : 'cloudy',
    cloud: clamp(numeric(weather.cloud_cover, 45), 0, 100), rain: clamp(rainfall, 0, 20),
    wind: clamp(numeric(weather.wind_speed_10m, 12), 0, 80),
    visibility: clamp(numeric(weather.visibility, 10000) / 1000, .5, 30),
    pollution: 0, // Studio-only artistic control; not a measured air-quality index.
    temperature: clamp(numeric(weather.temperature_2m, 28), -10, 50),
    realMoon: true, moon: Math.round((moon?.illumination.phase || 0) * 100),
    settlement: placeProfile.settlement && placeProfile.settlement !== 'unknown' ? placeProfile.settlement : 'city',
    relief: placeProfile.relief || 'hills',
    water: placeProfile.water && placeProfile.water !== 'unmapped' ? placeProfile.water : 'coast',
    vegetation: placeProfile.vegetation && placeProfile.vegetation !== 'unmapped' ? placeProfile.vegetation : 'urban',
    art: artIndex >= 0 ? artIndex + 1 : 1,
  };
}

function setStatus(label, type = 'sample') {
  statusLabel.textContent = label;
  statusNode.dataset.type = type;
}

function updateHomeClock() {
  const localTime = formatLocalTime(new Date(), environmentTimeZone());
  homeClock.dateTime = localTime;
  homeClock.textContent = localTime;
  homeClockButton.setAttribute('aria-label', `${localTime} in ${liveLocation}. Change artwork and refresh weather for your area`);
  homeClockButton.title = `Refresh local weather and artwork${deviceLocationAccuracy === null ? ' · tap to locate device' : ` · device fix ±${Math.round(deviceLocationAccuracy)} m`}`;
  homeClockButton.hidden = false;
}

function activeNearbyObservation() {
  const observed = isArtworkLab ? weatherLabObservation : isHomeEmbed || isAmbient ? homeNearbyObservation : null;
  if (!observed?.observedAt) return null;
  const age = (Date.now() - Date.parse(observed.observedAt)) / 60000;
  return age >= -5 && age <= 90 ? observed : null;
}

function tickHomeClock() {
  if (!document.hidden) updateHomeClock();
  window.setTimeout(tickHomeClock, 60000 - Date.now() % 60000);
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
function updateScene({ phase, weather, description, temperature, location, state, note, date = new Date(), moonOverride = null, celestial = null, observedTime = '', cloudCover = 20, wind = 12, rainfall = 0 }) {
  frame.dataset.phase = phase;
  frame.dataset.weather = weather;
  locationLabel.textContent = location;
  temperatureLabel.textContent = Number.isFinite(temperature) ? `${Math.round(temperature)}°` : '';
  descriptionLabel.textContent = description;
  heroObservationTime.hidden = !observedTime;
  heroObservationTime.textContent = observedTime;
  heroObservationTime.title = state === 'live' ? 'Open-Meteo current weather timestamp in local time'
    : state === 'stale' ? 'Earlier Open-Meteo observation; current weather could not be refreshed'
    : state === 'simulation' ? 'Selected local simulation time' : '';
  heroKicker.textContent = state === 'live' ? 'THE SKY, RIGHT NOW'
    : state === 'stale' ? 'LAST OBSERVED SKY'
    : state === 'forecast' ? 'FORECAST · HOURS AHEAD'
    : state === 'simulation' ? 'LIVING HORIZON · SIMULATION' : 'LIVING HORIZON · VISUAL STUDY';
  if (isHomeEmbed) heroKicker.textContent = state === 'stale' ? 'AN EARLIER GLIMPSE' : 'THE SKY, RIGHT NOW';
  if (state === 'live') setStatus('Live weather', 'live');
  else if (state === 'stale') setStatus('Earlier observation', 'sample');
  else if (state === 'forecast') setStatus('Model forecast', 'sample');
  else if (state === 'simulation') setStatus('Simulated · not live', 'sample');
  else if (state === 'offline') setStatus(isHomeEmbed ? 'Weather unavailable' : 'Offline · sample', 'sample');
  else setStatus('Scene preview', 'sample');
  if (isHomeEmbed || isAmbient) {
    homeWeatherCredit.hidden = (state !== 'live' && state !== 'stale') || !liveWeather?.current;
    const nearby = activeNearbyObservation();
    homeMetarCredit.hidden = !nearby;
    if (nearby) {
      const ageMinutes = Math.round((Date.now() - Date.parse(nearby.observedAt)) / 60000);
      homeMetarCredit.textContent = `METAR ${nearby.station} · ${Math.round(nearby.distanceKm)}km · ${ageMinutes}m`;
      homeMetarCredit.href = `https://metars.eu/api/metars/${nearby.station}/decoded`;
      homeMetarCredit.title = `${nearby.stationName} · ${nearby.distanceKm.toFixed(1)} km away · ${ageMinutes} min old`;
    }
    homeMapCredit.hidden = currentArea.cache || (liveLocation === 'Your area' && !placeProfile.evidence?.surface);
    homeWeatherCredits.hidden = homeWeatherCredit.hidden && homeMapCredit.hidden && homeMetarCredit.hidden;
    updateHomeClock();
  }
  sourceLine.textContent = note;
  rainSystem.update({active:(weather === 'rain'||weather === 'storm')&&rainfall>0,
    storm:weather === 'storm', intensity:rainfall, wind, phase});
  if (['live', 'stale', 'forecast', 'simulation', 'offline'].includes(state) || isHomeEmbed || isAmbient) {
    renderCelestials(date, moonOverride, state === 'live' || state === 'stale', celestial);
  }
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
  cloudSystem.update({ weather, phase, cover:cloudCover, wind,
    sunX:celestial?.sun?.x ?? 50, sunY:celestial?.sun?.y ?? 35 });
  renderReadouts(state === 'live' || state === 'stale');
}

function environmentTimeZone() { return liveWeather?.timezone || 'Asia/Kolkata'; }

// Keep the continuous hillside in the bottom 35% of the visible composition,
// independent of each source painting's skyline and the viewport's aspect.
// Isolated decorative trees still rise naturally into the sky. No scaling or
// distortion is applied to any artwork.
function displayedArtwork() {
  return isArtworkLab && experimentalArtIndex >= 0
    ? EXPERIMENTAL_ARTWORKS[experimentalArtIndex] : ARTWORKS[artIndex];
}

function positionArtwork(targetImage = artwork, art = displayedArtwork()) {
  const width = frame.clientWidth;
  const height = frame.clientHeight;
  if (!art || !width || !height || !targetImage.naturalWidth || !targetImage.naturalHeight) return;
  const renderedHeight = Math.max(height, width * targetImage.naturalHeight / targetImage.naturalWidth);
  const overflow = Math.max(0, renderedHeight - height);
  const ridgeY = targetImage.dataset.wide === 'true' ? art.wideRidgeY : art.ridgeY;
  const ridge = (ridgeY || art.ridgeY) * renderedHeight;
  const target = height * .65;
  const position = overflow > 1 ? clamp((ridge - target) / overflow, 0, 1) : 0;
  const shift = Math.max(0, target - (ridge - position * overflow));
  targetImage.style.setProperty('--art-fit-y', `${(position * 100).toFixed(2)}%`);
  targetImage.style.setProperty('--art-shift-y', `${shift.toFixed(1)}px`);
}

function artworkSource(art) {
  const wide = Boolean(art.wideFile) && frame.clientWidth / Math.max(1, frame.clientHeight) > 2.7;
  const file = wide ? art.wideFile : art.file;
  return { file, wide, src: '../assets/images/living-horizon/' + (art.experimental ? 'experiments/' : '') + file };
}

function crossfadeHomeArtwork(art, selection) {
  if (artCrossfadeFile === selection.file) {
    positionArtwork(incomingArtwork, art);
    return;
  }
  const change = ++artCrossfadeToken;
  artCrossfadeFile = selection.file;
  window.clearTimeout(artCrossfadeTimer);
  const finish = () => {
    if (change !== artCrossfadeToken) return;
    artCrossfadeFile = null;
    artwork.dataset.file = selection.file;
    artwork.dataset.wide = String(selection.wide);
    artwork.src = selection.src;
    positionArtwork(artwork, art);
    incomingArtwork.style.transition = 'none';
    incomingArtwork.classList.remove('is-visible');
    requestAnimationFrame(() => {
      if (change === artCrossfadeToken) incomingArtwork.style.removeProperty('transition');
    });
  };
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finish();
    return;
  }
  incomingArtwork.style.transition = 'none';
  incomingArtwork.classList.remove('is-visible');
  // A rapid second refresh must never reuse a half-opaque incoming layer.
  void incomingArtwork.offsetWidth;
  incomingArtwork.style.removeProperty('transition');
  incomingArtwork.dataset.wide = String(selection.wide);
  incomingArtwork.src = selection.src;
  const reveal = () => {
    if (change !== artCrossfadeToken) return;
    positionArtwork(incomingArtwork, art);
    requestAnimationFrame(() => {
      if (change !== artCrossfadeToken) return;
      incomingArtwork.classList.add('is-visible');
      artCrossfadeTimer = window.setTimeout(finish, 760);
    });
  };
  if (incomingArtwork.complete && incomingArtwork.naturalWidth) reveal();
  else {
    incomingArtwork.addEventListener('load', reveal, { once: true });
    incomingArtwork.addEventListener('error', () => {
      if (change !== artCrossfadeToken) return;
      artCrossfadeFile = null;
      incomingArtwork.classList.remove('is-visible');
    }, { once: true });
  }
}

function updateArtworkSource() {
  const art = displayedArtwork();
  if (!art) return;
  if (isHomeEmbed && homeVisualBusy && homeVisualReady) return;
  // Compact cards use a purpose-composed panoramic painting. Portrait/TV
  // scenes retain the complete original 16:9 art and its foreground details.
  const { file, wide, src } = artworkSource(art);
  if (artwork.dataset.file !== file) {
    if (isHomeEmbed && homeVisualReady) {
      crossfadeHomeArtwork(art, { file, wide, src });
      return;
    }
    artwork.dataset.file = file;
    artwork.dataset.wide = String(wide);
    artwork.src = src;
  }
  positionArtwork(artwork, art);
}

function selectedDailyArtworkIndex() {
  if (isHomeEmbed) {
    // Draw once per page load, and hold the result across weather/model/GPS
    // renders. Explicit clock refresh chooses another random unseen painting.
    const homePool = eligibleArtwork(placeProfile, { homeOnly: true });
    if (!(homeFallbackArtIndex >= 0 && homeSelectedArtIndex === homeFallbackArtIndex)
      && !homePool.some(art => art.index === homeSelectedArtIndex)) {
      homeSelectedArtIndex = randomRegionalArtworkIndex(placeProfile, { homeOnly: true });
    }
    return homeSelectedArtIndex;
  }
  const timezone = environmentTimeZone();
  const today = localDayKey(new Date(), timezone);
  if (today !== renderedDay) {
    renderedDay = today;
    artOverride = null;
    artOverrideDay = null;
  }
  return artOverrideDay === today && artOverride !== null ? artOverride
    : regionalArtworkIndex(new Date(), timezone, placeProfile, { homeOnly: isHomeEmbed });
}

async function preloadHomeArtwork() {
  const art = ARTWORKS[selectedDailyArtworkIndex()];
  if (!art) return false;
  const { src } = artworkSource(art);
  const preview = new Image();
  preview.decoding = 'async';
  preview.src = src;
  let timer;
  try {
    const decoded = await Promise.race([
      preview.decode().then(() => true, () => false),
      new Promise(resolve => { timer = window.setTimeout(() => resolve(false), 4200); }),
    ]);
    return decoded && preview.naturalWidth > 0;
  } catch { return false; /* A missing image never blocks weather or the controls. */ }
  finally { window.clearTimeout(timer); }
}

function updateDailyArt() {
  const selected = selectedDailyArtworkIndex();
  const pack = pickRegionPack(placeProfile);
  const pool = eligibleArtwork(placeProfile, { homeOnly: isHomeEmbed });
  if (selected === artIndex) return;
  artIndex = selected;
  // Candidate previews override only the visible art. The regional selector
  // still updates in the background, so exiting the lab restores today's art.
  if (isArtworkLab && experimentalArtIndex >= 0) return;
  const choice = ARTWORKS[selected];
  frame.dataset.art = choice.id;
  updateArtworkSource();
  const place = pool.findIndex(candidate => candidate.index === selected);
  artCount.textContent = place >= 0 ? `${place + 1}/${pool.length}` : `${selected + 1}/${ARTWORKS.length}`;
  const artPackName = REGION_PACKS[choice.pack]?.title || choice.pack;
  const relationship = !artworkMatchesPack(choice, pack.id) ? 'manual artistic study'
    : pack.matched ? 'area study' : 'illustration';
  artButton.title = `${choice.name} · ${artPackName} ${relationship} · click to explore another artwork`;
  artButton.setAttribute('aria-label', artButton.title);
}

function selectExperimentalArtwork(index, updateURL = true) {
  if (!isArtworkLab) return;
  experimentalArtIndex = index >= 0 && index < EXPERIMENTAL_ARTWORKS.length ? index : -1;
  const art = displayedArtwork();
  if (!art) return;
  frame.dataset.art = art.experimental ? `experiment-${art.id}` : art.id;
  updateArtworkSource();
  if (art.experimental) {
    artCount.textContent = `${experimentalArtIndex + 1}/${EXPERIMENTAL_ARTWORKS.length}`;
    artButton.title = `${art.name} · artwork study · click for the next landscape`;
    artLabSelection.textContent = `${art.id} / ${EXPERIMENTAL_ARTWORKS.length}`;
  } else {
    const pool = eligibleArtwork(placeProfile);
    const position = pool.findIndex(candidate => candidate.index === artIndex);
    artCount.textContent = position >= 0 ? `${position + 1}/${pool.length}` : `${artIndex + 1}/${ARTWORKS.length}`;
    artButton.title = `${art.name} · approved regional artwork`;
    artLabSelection.textContent = 'Original';
  }
  artButton.setAttribute('aria-label', artButton.title);
  artLabOriginal.classList.toggle('is-selected', experimentalArtIndex < 0);
  artLabOriginal.setAttribute('aria-pressed', String(experimentalArtIndex < 0));
  for (const button of artLabGrid.querySelectorAll('[data-experiment]')) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.experiment) === experimentalArtIndex));
  }
  if (updateURL) {
    const url = new URL(window.location.href);
    if (experimentalArtIndex >= 0) url.searchParams.set('art', art.id);
    else url.searchParams.delete('art');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  }
}

function setupArtworkLab() {
  if (!isArtworkLab) return;
  document.querySelector('.breadcrumb').textContent = 'LIVING HORIZON / ARTWORK LAB';
  for (const [index, art] of EXPERIMENTAL_ARTWORKS.entries()) {
    const button = document.createElement('button');
    button.className = 'art-lab-option';
    button.type = 'button';
    button.dataset.experiment = String(index);
    button.setAttribute('aria-label', `Preview ${art.id}: ${art.name}`);
    button.setAttribute('aria-pressed', 'false');
    const preview = document.createElement('span');
    preview.className = 'art-lab-option-preview';
    const image = document.createElement('img');
    image.src = `../assets/images/living-horizon/experiments/${art.file}`;
    image.alt = '';
    image.loading = index < 6 ? 'eager' : 'lazy';
    image.decoding = 'async';
    preview.appendChild(image);
    const label = document.createElement('span');
    label.className = 'art-lab-option-text';
    const count = document.createElement('b');
    count.textContent = art.id;
    const name = document.createElement('span');
    name.textContent = art.name;
    label.append(count, name);
    button.append(preview, label);
    button.addEventListener('click', () => selectExperimentalArtwork(index));
    artLabGrid.appendChild(button);
  }
  artLabOriginal.addEventListener('click', () => selectExperimentalArtwork(-1));
  const requested = new URL(window.location.href).searchParams.get('art');
  const initial = requested === 'original' ? -1 : Math.max(0, EXPERIMENTAL_ARTWORKS.findIndex(art => art.id === requested));
  selectExperimentalArtwork(requested === null ? 8 : initial, false);
}

function advanceArtwork() {
  if (isArtworkLab && experimentalArtIndex >= 0) {
    selectExperimentalArtwork((experimentalArtIndex + 1) % EXPERIMENTAL_ARTWORKS.length);
    return;
  }
  if (isHomeEmbed) {
    homeFallbackArtIndex = -1;
    homeSelectedArtIndex = randomRegionalArtworkIndex(placeProfile, { homeOnly: true });
    // Clock refresh prepares the complete next scene first, so its artwork
    // is only revealed after fresh weather and image decoding are ready.
    if (!homeVisualBusy) updateDailyArt();
    return;
  }
  const candidates = activeMode === 'live'
    ? eligibleArtwork(placeProfile, { homeOnly: isHomeEmbed }).map(entry => entry.index)
    : ARTWORKS.map((_, index) => index);
  const position = candidates.indexOf(artIndex);
  artOverride = candidates[(position + 1) % candidates.length] ?? 0;
  artOverrideDay = localDayKey(new Date(), environmentTimeZone());
  if (isHomeEmbed && homeVisualBusy) return;
  updateDailyArt();
  if (simulation) { simulation.art = artIndex + 1; syncStudio(); }
}

const LANDSCAPE_AXES = ['settlement', 'relief', 'water', 'vegetation'];
function artworkFit(art, scenario) {
  return LANDSCAPE_AXES.filter(axis => art?.[axis]?.includes(scenario[axis])).length;
}
function bestScenarioArt(scenario) {
  const scores = ARTWORKS.map((art, index) => ({ index, score: artworkFit(art, scenario) }));
  const best = Math.max(...scores.map(item => item.score));
  const current = clamp(scenario.art - 1, 0, ARTWORKS.length - 1);
  if (scores[current].score === best) return current;
  return scores.find(item => item.score === best)?.index ?? 0;
}

function renderCelestials(date = new Date(), phaseOverride = null, live = true, celestial = null) {
  const position = celestial || celestialState(
    date, currentArea.latitude, currentArea.longitude, environmentTimeZone(),
    localDayOffset(date, environmentTimeZone()),
  );
  if (!position) return;
  const { sun, moon, illumination, events, phaseName } = position;
  const phase = phaseOverride === null ? illumination.phase : phaseOverride;
  const fraction = phaseOverride === null ? illumination.fraction : (1 - Math.cos(2 * Math.PI * phase)) / 2;
  const name = phaseOverride === null ? phaseName : moonPhaseName(phase);
  const appearance = celestialAppearance(sun, moon, { fraction });
  frame.dataset.sunVisible = String(appearance.sunVisible);
  frame.dataset.moonVisible = String(appearance.moonVisible);
  frame.style.setProperty('--moon-opacity', appearance.moonOpacity.toFixed(3));
  frame.style.setProperty('--moon-halo-opacity', appearance.moonHaloOpacity.toFixed(3));
  frame.style.setProperty('--sun-diameter', `${appearance.sunDiameter}px`);
  frame.style.setProperty('--moon-diameter', `${appearance.moonDiameter}px`);
  frame.style.setProperty('--sun-x', sun.x.toFixed(2) + '%');
  frame.style.setProperty('--sun-y', sun.y.toFixed(2) + '%');
  frame.style.setProperty('--moon-x', moon.x.toFixed(2) + '%');
  frame.style.setProperty('--moon-y', moon.y.toFixed(2) + '%');
  const sunTimes = window.SunCalc?.getTimes(date, currentArea.latitude, currentArea.longitude);
  const asTime = event => event instanceof Date && Number.isFinite(event.getTime())
    ? formatLocalTime(event, environmentTimeZone()) : '—';
  const sunrise = live ? String(liveWeather?.daily?.sunrise?.[0] || '').split('T')[1] || asTime(sunTimes?.sunrise)
    : asTime(sunTimes?.sunrise);
  const sunset = live ? String(liveWeather?.daily?.sunset?.[0] || '').split('T')[1] || asTime(sunTimes?.sunset)
    : asTime(sunTimes?.sunset);
  sunDisc.title = 'Sun altitude ' + Math.round(sun.altitude) + '° · rise ' + sunrise + ' · set ' + sunset;
  paintMoon(moonDisc, phase);
  const rise = events.rise ? ' · rises ' + formatLocalTime(events.rise, environmentTimeZone()) : '';
  const set = events.set ? ' · sets ' + formatLocalTime(events.set, environmentTimeZone()) : '';
  moonDisc.title = name + ' · ' + Math.round(fraction * 100) + '% lit' + rise + set + (phaseOverride === null ? '' : ' · manual phase override');
  moonReadout.textContent = name + ' ' + Math.round(fraction * 100) + '%' + (phaseOverride === null ? '' : ' · manual');
  moonReadout.title = moonDisc.title;
}

function setAtmosphericDepth(visibilityKm, artisticSmog = 0) {
  const visibility = Number.isFinite(visibilityKm)
    ? Math.pow(clamp((15 - visibilityKm) / 14.5, 0, 1), 1.25) : 0;
  const pollution = Number.isFinite(artisticSmog) ? clamp(artisticSmog / 100, 0, 1) : 0;
  frame.style.setProperty('--visibility-strength', visibility.toFixed(3));
  frame.style.setProperty('--visibility-blur', `${(visibility * 6).toFixed(1)}px`);
  frame.style.setProperty('--pollution-strength', pollution.toFixed(3));
  frame.style.setProperty('--pollution-saturation', (1 - pollution * .43).toFixed(3));
  frame.style.setProperty('--pollution-contrast', (1 - pollution * .12).toFixed(3));
}

function renderReadouts(live) {
  const observed = live ? activeNearbyObservation() : null;
  const rawVisibility = liveWeather?.current?.visibility;
  const visibilityMeters = Number(rawVisibility);
  const hasVisibility = live && typeof rawVisibility === 'number' && Number.isFinite(visibilityMeters) && visibilityMeters >= 0;
  visibilityReadout.hidden = !hasVisibility && !Number.isFinite(observed?.visibilityKm);
  if (observed && Number.isFinite(observed.visibilityKm)) {
    visibilityReadout.textContent = `Nearby vis. ${observed.visibilityLowerBound ? '≥' : ''}${observed.visibilityKm.toFixed(1)} km`;
    visibilityReadout.title = `Measured at ${observed.stationName}, ${observed.distanceKm.toFixed(1)} km away, ${Math.round(observed.ageMinutes)} min before retrieval`;
    const smoke = observed.phenomena?.some(word => /smoke/i.test(word));
    const haze = observed.phenomena?.some(word => /haze|dust/i.test(word));
    setAtmosphericDepth(observed.visibilityKm, smoke ? 28 : haze ? 16 : 0);
  } else if (hasVisibility) {
    const km = visibilityMeters / 1000;
    visibilityReadout.textContent = (isHomeEmbed || isAmbient ? 'Est. vis. ' : 'Visibility ') + (km >= 10 ? km.toFixed(0) : km.toFixed(1)) + ' km';
    visibilityReadout.title = 'Open-Meteo gridded model estimate, not a local measurement';
    setAtmosphericDepth(km);
  } else setAtmosphericDepth(null);
  moonReadout.hidden = !(live || isHomeEmbed) || !moonReadout.textContent;
  geographyReadout.hidden = true;
  if (isHomeEmbed) atmosphericReadouts.hidden = visibilityReadout.hidden && moonReadout.hidden;
}

function syncStudio() {
  if (!simulation) return;
  for (const input of studioInputs) {
    const key = input.dataset.sim;
    if (input.type === 'checkbox') input.checked = Boolean(simulation[key]);
    else input.value = String(simulation[key]);
  }
  document.querySelector('#sim-moon').disabled = simulation.realMoon;
  document.querySelector('#sim-time-value').textContent = displayTime(simulation.minutes);
  document.querySelector('#sim-cloud-value').textContent = simulation.cloud + '%';
  document.querySelector('#sim-rain-value').textContent = Number(simulation.rain).toFixed(1) + ' mm/h';
  document.querySelector('#sim-wind-value').textContent = simulation.wind + ' km/h';
  document.querySelector('#sim-visibility-value').textContent = Number(simulation.visibility).toFixed(1) + ' km';
  document.querySelector('#sim-pollution-value').textContent = simulation.pollution + '%';
  document.querySelector('#sim-temperature-value').textContent = simulation.temperature + '°C';
  const currentArt = ARTWORKS[simulation.art - 1] || ARTWORKS[0];
  const candidate = displayedArtwork()?.experimental ? displayedArtwork() : null;
  document.querySelector('#sim-art-value').textContent = candidate ? `${candidate.name} · study` : currentArt.name;
  const matchCount = artworkFit(currentArt, simulation);
  const unmatched = LANDSCAPE_AXES.filter(axis => !currentArt[axis]?.includes(simulation[axis]));
  studioGeographyNote.textContent = candidate
    ? `${candidate.name} is a visual study. Regional matching uses the full approved artwork collection.`
    : matchCount === 4
    ? `${currentArt.name} · ${currentArt.pack.replaceAll('-', ' ')}. All four selected landscape categories are represented artistically.`
    : `${currentArt.name} reflects ${matchCount}/4 categories. ${unmatched.join(', ')} ${unmatched.length === 1 ? 'is' : 'are'} not represented by this painting; explore another combination or art treatment.`;
  const selected = zonedDate(simulation.date, simulation.minutes, environmentTimeZone());
  const illumination = window.SunCalc?.getMoonIllumination(selected);
  const phase = simulation.realMoon && illumination ? illumination.phase : simulation.moon / 100;
  document.querySelector('#sim-moon-value').textContent = (simulation.realMoon ? 'Calculated · ' : 'Manual · ') + moonPhaseName(phase);
  const previewMoon = document.querySelector('#sim-moon-preview');
  paintMoon(previewMoon, phase);
  previewMoon.setAttribute('aria-label', `Moon phase preview: ${moonPhaseName(phase)}`);
  if (simulation.realMoon && illumination) {
    simulation.moon = Math.round(illumination.phase * 100);
    document.querySelector('#sim-moon').value = String(simulation.moon);
  }
  studioSummary.textContent = studio.open ? 'Close studio'
    : activeMode === 'live' ? 'Open simulation studio'
      : `${simulation.date} · ${displayTime(simulation.minutes)} · ${simulation.weather}`;
}

function renderSimulation() {
  if (!simulation) simulation = createSimulation();
  const timezone = environmentTimeZone();
  const date = zonedDate(simulation.date, simulation.minutes, timezone);
  const solar = celestialState(date, currentArea.latitude, currentArea.longitude, timezone,
    localDayOffset(date, timezone));
  const phase = phaseFromSun(solar?.sun);
  const manualPhase = simulation.realMoon ? null : simulation.moon / 100;
  const isForecast = activeMode === 'forecast';
  const description = isForecast ? conditions(Number(liveWeather?.hourly?.weather_code?.[selectedForecastIndex]), simulation.cloud, simulation.rain).text
    : `${simulation.weather[0].toUpperCase() + simulation.weather.slice(1)} · ${simulation.cloud}% cloud · ${simulation.rain} mm/h rain`;
  updateScene({ phase, weather: simulation.weather, location: currentArea.label || COARSE_LOCATION.name,
    temperature: simulation.temperature, description, date, moonOverride: manualPhase, celestial: solar,
    observedTime:displayTime(simulation.minutes), cloudCover:simulation.cloud, wind:simulation.wind, rainfall:simulation.rain,
    state: isForecast ? 'forecast' : 'simulation', note: `${isForecast ? 'Open-Meteo hourly model forecast' : 'Simulation'} · ${simulation.date} ${displayTime(simulation.minutes)} ${timezone} · landscape choice is an interpretation.` });
  frame.style.setProperty('--cloud-opacity', String(clamp(.06 + simulation.cloud / 115, .04, .96).toFixed(2)));
  frame.style.setProperty('--cloud-duration', `${clamp(145 - simulation.wind * 2.4, 40, 145).toFixed(0)}s`);
  setAtmosphericDepth(simulation.visibility, simulation.pollution);
  visibilityReadout.hidden = false;
  visibilityReadout.textContent = `Visibility ${Number(simulation.visibility).toFixed(1)} km · ${isForecast ? 'forecast' : 'simulated'}`;
  moonReadout.hidden = false;
  geographyReadout.hidden = false;
  geographyReadout.textContent = [simulation.settlement, simulation.relief, simulation.water, simulation.vegetation]
    .map(value => value[0].toUpperCase() + value.slice(1)).join(' · ') + ' · hypothetical';
  syncStudio();
}

function renderMode() {
  // Home shows one coherent snapshot. Independent model, METAR, GPS and
  // reverse-geocoding completions update state silently until it is ready.
  if (isHomeEmbed && homeVisualBusy) return;
  updateDailyArt();
  for (const button of forecastHours.querySelectorAll('button[data-forecast-index]')) {
    button.setAttribute('aria-pressed', String(activeMode === 'forecast' && Number(button.dataset.forecastIndex) === selectedForecastIndex));
  }
  if (activeMode !== 'live' && simulation && artOverride === null) {
    // Quick presets initially construct their controls before daily art is
    // resolved. Keep the studio art slider aligned with the visible painting.
    simulation.art = artIndex + 1;
  }
  modeButtons.forEach(button => {
    const selected = button.dataset.mode === activeMode;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (activeMode !== 'live') {
    renderSimulation();
    return;
  }
  studioSummary.textContent = 'Open simulation studio';
  frame.style.removeProperty('--cloud-opacity');
  frame.style.removeProperty('--cloud-duration');
  if (liveWeather?.current) {
    const current = liveWeather.current;
    const rainfall = Math.max(Number(current.rain) || 0, Number(current.showers) || 0, Number(current.precipitation) || 0);
    const { weather, text } = conditions(Number(current.weather_code), Number(current.cloud_cover), rainfall);
    const observed = activeNearbyObservation();
    const obscuration = Array.isArray(observed?.phenomena) ? observed.phenomena.join(' · ') : '';
    const solar = celestialState(
      new Date(), currentArea.latitude, currentArea.longitude, environmentTimeZone(),
      localDayOffset(new Date(), environmentTimeZone()),
    );
    const phase = phaseFromSun(solar?.sun);
    const hhmm = String(current.time || '').split('T')[1]?.slice(0, 5);
    const stationDate = observed?.observedAt ? new Date(observed.observedAt) : null;
    const observedTime = stationDate && Number.isFinite(stationDate.getTime())
      ? formatLocalTime(stationDate, environmentTimeZone()) : hhmm;
    const skyText = text === 'Clear skies' ? 'Clear sky' : text;
    const description = observed ? (isArtworkLab ? `${obscuration || 'Nearby airport air'} · ${skyText} (model)`
      : `${obscuration || (observed.visibilityKm < 8 ? 'Reduced visibility' : skyText)} nearby`)
      : liveWeatherStale ? `${text} · earlier` : isHomeEmbed ? text : isAmbient ? `${text} · model estimate` : text;
    updateScene({ phase, weather, location: liveLocation, temperature: Number(current.temperature_2m), description, observedTime:observed ? observedTime : hhmm,
      cloudCover:Number(current.cloud_cover), wind:Number(current.wind_speed_10m), rainfall, state: liveWeatherStale ? 'stale' : 'live', celestial: solar,
      note: `Weather by Open-Meteo · ${currentArea.cache ? 'regional estimate' : 'consented device area'} · artwork is interpretive.` });
    const clouds = Number(current.cloud_cover);
    const pack = pickRegionPack(placeProfile);
    const source = placeProfile?.evidence?.relief && placeProfile?.evidence?.surface
      ? ' · Copernicus DEM elevation and OpenStreetMap features'
      : placeProfile?.evidence?.relief ? ' · Copernicus DEM terrain'
      : placeProfile?.evidence?.surface ? ' · mapped features' : '';
    // Place names and mapped land features come from OpenStreetMap after an
    // explicit location action; visible attribution is retained in Home embed.
    const osmCredit = currentArea.cache ? '' : ' · © OpenStreetMap contributors';
    sourceLine.textContent = `${liveWeatherStale ? 'Last available' : 'Current'} Open-Meteo weather · ${pack.title} ${pack.matched ? 'regional study' : 'illustration'}${source}${osmCredit}.`;
    sourceLine.title = `${pack.reason}. Regional paintings represent broad landscape types, not exact views from your location.`;
    if (Number.isFinite(clouds)) frame.style.setProperty('--cloud-opacity', String(Math.min(.96, .10 + clouds / 124).toFixed(2)));
    const wind = Number(current.wind_speed_10m);
    if (Number.isFinite(wind)) frame.style.setProperty('--cloud-duration', `${Math.max(65, Math.min(145, 145 - wind * 2.4))}s`);
    if (observed && Number.isFinite(observed.visibilityKm)) {
      // The airport observation controls apparent air transparency, while the
      // model still controls temperature/clouds. Neither is a street sensor.
      const smoke = observed.phenomena?.some(word => /smoke/i.test(word));
      const haze = observed.phenomena?.some(word => /haze|dust/i.test(word));
      setAtmosphericDepth(observed.visibilityKm, smoke ? 28 : haze ? 16 : 0);
      visibilityReadout.hidden = false;
      if (isArtworkLab) visibilityReadout.textContent = `Nearby observed visibility ${observed.visibilityLowerBound ? '≥' : ''}${observed.visibilityKm.toFixed(1)} km`;
      if (!isHomeEmbed) heroKicker.textContent = 'NEARBY AIR · MODEL SKY';
      heroObservationTime.title = `${observed.stationName} (${observed.station}), ${observed.distanceKm.toFixed(1)} km away · ${observed.observedAt}`;
      setStatus(`Observed · ${observed.station}`, 'sample');
      sourceLine.textContent = `Nearby ${observed.station} · ${observed.distanceKm.toFixed(1)} km away · visibility and ${obscuration || 'air conditions'} measured; temperature and clouds modelled; artwork illustrative.`;
    } else if (isAmbient) {
      heroKicker.textContent = currentArea.cache ? 'REGIONAL SKY · MODEL ESTIMATE' : 'LOCAL SKY · MODEL ESTIMATE';
    }
    return;
  }
  frame.style.removeProperty('--cloud-opacity');
  frame.style.removeProperty('--cloud-duration');
  const now = new Date();
  const solar = celestialState(now, currentArea.latitude, currentArea.longitude, environmentTimeZone(), localDayOffset(now, environmentTimeZone()));
  const phase = phaseFromSun(solar?.sun);
  const observed = activeNearbyObservation();
  if (observed && Number.isFinite(observed.visibilityKm)) {
    const obscuration = Array.isArray(observed.phenomena) ? observed.phenomena.join(' · ') : 'air conditions';
    const stationDate = new Date(observed.observedAt);
    updateScene({ phase, weather: 'clear', celestial: solar, location: liveLocation,
      temperature: observed.temperatureC, description: `Nearby airport · ${obscuration}`,
      observedTime: Number.isFinite(stationDate.getTime()) ? formatLocalTime(stationDate, environmentTimeZone()) : '',
      state: 'live', note: `Measured at ${observed.stationName}, ${observed.distanceKm.toFixed(1)} km away. No forecast model available.` });
    setAtmosphericDepth(observed.visibilityKm);
    visibilityReadout.hidden = false;
    if (isArtworkLab) visibilityReadout.textContent = `Nearby observed visibility ${observed.visibilityLowerBound ? '≥' : ''}${observed.visibilityKm.toFixed(1)} km`;
    if (!isHomeEmbed) heroKicker.textContent = 'OBSERVED AIR · SKY UNAVAILABLE';
    setStatus(`Observed · ${observed.station}`, 'sample');
    return;
  }
  updateScene({ phase, weather: 'cloudy', celestial:solar, location: isHomeEmbed || isAmbient || isArtworkLab ? liveLocation : COARSE_LOCATION.name, temperature: null,
    description: isHomeEmbed ? 'Weather unavailable' : 'Weather feed unavailable · visual study',
    state: 'offline', note: 'Offline · sample atmosphere shown. No current weather reading available.' });
}
function setMode(mode) {
  if (mode !== 'live' && !PRESETS[mode]) return;
  if (mode === 'live' && activeMode !== 'live') {
    artOverride = null;
    artOverrideDay = null;
    artIndex = -1;
  }
  if (mode !== 'live') {
    if (!simulation || activeMode === 'live') simulation = createSimulation();
    const preset = PRESETS[mode];
    const timezone = environmentTimeZone();
    const noon = zonedDate(simulation.date, 720, timezone);
    const times = window.SunCalc?.getTimes(noon, currentArea.latitude, currentArea.longitude);
    const event = preset.event === 'night' ? times?.sunset : times?.[preset.event];
    const suggestedTime = event instanceof Date && Number.isFinite(event.getTime())
      ? localTimeAsMinutes(event, timezone) + (preset.event === 'night' ? 130 : preset.event === 'sunrise' ? 7 : 0)
      : { dawn: 390, day: 780, rain: 780, night: 1320 }[mode];
    simulation.minutes = Math.round(clamp(suggestedTime, 0, 1435) / 5) * 5;
    simulation.weather = preset.weather;
    simulation.cloud = preset.cloud;
    simulation.rain = preset.rain;
  } else simulation = createSimulation();
  activeMode = mode;
  if (mode === 'live') selectedForecastIndex = null;
  const url = new URL(window.location.href);
  url.searchParams.set('mode', mode);
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  renderMode();
  if (mode === 'live') {
    simulation.art = artIndex + 1;
    syncStudio();
  }
  if (mode === 'live' && Date.now() - lastObservationFetch >= CACHE_AGE_MS) {
    void fetchWeather(currentArea.latitude, currentArea.longitude, currentArea);
  }
}

function previewForecast(index) {
  const hourly = liveWeather?.hourly;
  const timestamp = hourly?.time?.[index];
  if (typeof timestamp !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d/.test(timestamp)) return;
  if (!simulation || activeMode === 'live') simulation = createSimulation();
  const rainfall = Math.max(0, Number(hourly.precipitation?.[index]) || 0);
  const cloud = clamp(Number(hourly.cloud_cover?.[index]) || 0, 0, 100);
  simulation.date = timestamp.slice(0, 10);
  simulation.minutes = Number(timestamp.slice(11, 13)) * 60 + Number(timestamp.slice(14, 16));
  simulation.cloud = cloud;
  simulation.rain = rainfall;
  simulation.weather = conditions(Number(hourly.weather_code?.[index]), cloud, rainfall).weather;
  simulation.temperature = Number(hourly.temperature_2m?.[index]);
  simulation.wind = Number(hourly.wind_speed_10m?.[index]) || 0;
  simulation.visibility = clamp((Number(hourly.visibility?.[index]) || 12000) / 1000, .5, 30);
  simulation.pollution = 0;
  simulation.realMoon = true;
  selectedForecastIndex = index;
  activeMode = 'forecast';
  const url = new URL(window.location.href);
  url.searchParams.delete('mode');
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  renderMode();
}

function renderForecast() {
  if (isHomeEmbed || isAmbient) return;
  const hourly = liveWeather?.hourly;
  if (!Array.isArray(hourly?.time) || !Array.isArray(hourly?.temperature_2m)) {
    forecastOutlook.hidden = true;
    forecastHours.replaceChildren();
    return;
  }
  const observation = String(liveWeather.current?.time || '');
  const tz = environmentTimeZone();
  const today = localDayKey(new Date(), tz);
  const localNow = `${today}T${displayTime(localMinutes(tz))}`;
  const first = hourly.time.findIndex(time => typeof time === 'string' && time > observation && time > localNow);
  const indices = first < 0 ? [] : Array.from({ length: Math.min(8, hourly.time.length - first) }, (_, n) => first + n);
  forecastOutlook.hidden = indices.length === 0;
  forecastSource.textContent = (liveWeatherStale ? 'Earlier model run' : 'Open-Meteo hourly model forecast') + ' · select an hour to preview';
  const symbols = { clear:'☀', cloudy:'◒', overcast:'☁', rain:'☂', storm:'ϟ', fog:'≋' };
  const buttons = indices.map(index => {
    const timestamp = hourly.time[index];
    const category = conditions(Number(hourly.weather_code?.[index]), Number(hourly.cloud_cover?.[index]), Number(hourly.precipitation?.[index])).weather;
    const probability = hourly.precipitation_probability?.[index];
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'forecast-hour';
    button.dataset.forecastIndex = String(index);
    button.setAttribute('aria-pressed', String(activeMode === 'forecast' && selectedForecastIndex === index));
    const label = timestamp.slice(11, 16);
    const tomorrow = timestamp.slice(0, 10) !== observation.slice(0, 10);
    const glyph = category === 'clear' && (Number(label.slice(0, 2)) < 6 || Number(label.slice(0, 2)) >= 19) ? '☾' : symbols[category] || '◒';
    const parts = [
      ['hour-label', tomorrow ? `+1d ${label}` : label],
      ['hour-symbol', glyph],
      ['hour-temp', Number.isFinite(hourly.temperature_2m?.[index]) ? `${Math.round(hourly.temperature_2m[index])}°` : '—'],
      ['hour-rain', Number.isFinite(probability) ? `${Math.round(probability)}% rain` : category],
    ];
    for (const [className, value] of parts) { const span = document.createElement('span'); span.className = className; span.textContent = value; button.append(span); }
    button.title = `${timestamp.replace('T', ' ')} ${environmentTimeZone()} · ${category} · hourly forecast`;
    button.addEventListener('click', () => previewForecast(index));
    return button;
  });
  forecastHours.replaceChildren(...buttons);
}

function setCustomSimulation(input) {
  if (!simulation || activeMode === 'live') simulation = createSimulation();
  const key = input.dataset.sim;
  if (isArtworkLab && (key === 'art' || LANDSCAPE_AXES.includes(key)) && experimentalArtIndex >= 0) {
    selectExperimentalArtwork(-1);
  }
  if (input.type === 'checkbox') simulation[key] = input.checked;
  else if (input.type === 'range') simulation[key] = Number(input.value);
  else if (input.value) simulation[key] = input.value;
  // Keep weather category and its physical intensity sliders coherent. Every
  // rainfall movement now has an observable effect on the painted scene.
  if (key === 'rain') {
    if (simulation.rain > 0 && !['rain', 'storm'].includes(simulation.weather)) {
      simulation.weather = 'rain';
      simulation.cloud = Math.max(60, simulation.cloud);
    } else if (simulation.rain === 0 && ['rain', 'storm'].includes(simulation.weather)) {
      simulation.weather = simulation.cloud >= 82 ? 'overcast' : simulation.cloud >= 42 ? 'cloudy' : 'clear';
    }
  }
  if (key === 'weather') {
    const cloudByWeather = { clear: 8, cloudy: 55, overcast: 94, rain: 86, fog: 82, storm: 98 };
    simulation.cloud = cloudByWeather[simulation.weather];
    if (simulation.weather === 'rain' && simulation.rain === 0) simulation.rain = 4;
    else if (simulation.weather === 'storm' && simulation.rain === 0) simulation.rain = 12;
    else if (!['rain', 'storm'].includes(simulation.weather)) simulation.rain = 0;
  }
  if (key === 'cloud' && ['clear', 'cloudy', 'overcast'].includes(simulation.weather)) {
    simulation.weather = simulation.cloud >= 82 ? 'overcast' : simulation.cloud >= 42 ? 'cloudy' : 'clear';
  }
  if (key === 'art') {
    artOverride = clamp(simulation.art - 1, 0, ARTWORKS.length - 1);
    artOverrideDay = localDayKey(new Date(), environmentTimeZone());
    updateDailyArt();
  } else if (LANDSCAPE_AXES.includes(key)) {
    simulation.art = bestScenarioArt(simulation) + 1;
    artOverride = simulation.art - 1;
    artOverrideDay = localDayKey(new Date(), environmentTimeZone());
    updateDailyArt();
  }
  activeMode = 'custom';
  const url = new URL(window.location.href);
  url.searchParams.delete('mode'); // A scenario is intentionally not persisted in a shareable URL.
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
  renderMode();
}

function readCache(maxAge = CACHE_AGE_MS) {
  try {
    const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return value && Number.isFinite(value.at) && Date.now() - value.at >= 0
      && Date.now() - value.at < maxAge && value.data?.current ? value : null;
  } catch { return null; }
}
async function fetchWeather(latitude, longitude, { cache = false, label = COARSE_LOCATION.name, force = false } = {}) {
  const myAttempt = ++liveAttempt;
  currentArea = { latitude, longitude, cache, label };
  let nearbyPromise = Promise.resolve();
  if (isHomeEmbed || isAmbient) {
    // Airport readings refresh independently: a broken station feed must never
    // prevent the temperature, sunrise or cloud forecast from loading.
    nearbyPromise = fetchNearbyObservation({ latitude, longitude }).then(({ observation }) => {
      if (myAttempt !== liveAttempt) return;
      homeNearbyObservation = observation;
      if (activeMode === 'live') renderMode();
    }).catch(() => {
      if (myAttempt !== liveAttempt) return;
      homeNearbyObservation = null;
      if (activeMode === 'live') renderMode();
    });
  }
  // Throttle retries as well as successful refreshes when the feed is unavailable.
  lastObservationFetch = Date.now();
  if (cache && !force) {
    const stored = readCache();
    if (stored) {
      liveWeather = stored.data;
      liveWeatherStale = false;
      lastValidObservationAt = stored.at;
      lastObservationFetch = stored.at;
      liveLocation = label;
      if (isHomeEmbed) await nearbyPromise;
      if (activeMode === 'live') renderMode();
      renderForecast();
      return true;
    }
  }
  if (activeMode === 'live') setStatus('Connecting', 'fetching');
  try {
    const url = new URL(WEATHER_URL);
    url.searchParams.set('latitude', String(latitude));
    url.searchParams.set('longitude', String(longitude));
    url.searchParams.set('current', CURRENT_FIELDS);
    url.searchParams.set('hourly', HOURLY_FIELDS);
    url.searchParams.set('daily', 'sunrise,sunset');
    url.searchParams.set('timezone', 'auto');
    url.searchParams.set('forecast_days', '2');
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
    liveWeatherStale = false;
    lastValidObservationAt = Date.now();
    liveLocation = currentArea.label;
    lastObservationFetch = Date.now();
    if (cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* Storage is optional. */ } }
    if (isHomeEmbed) await nearbyPromise;
    if (activeMode === 'live') renderMode();
    renderForecast();
    return true;
  } catch (error) {
    if (myAttempt !== liveAttempt) return;
    // Preserve an honest, explicitly earlier observation instead of replacing
    // it with a fictitious current reading during a network interruption.
    const lastKnown = cache ? readCache(LAST_OBSERVATION_AGE_MS) : null;
    if (!liveWeather && lastKnown) { liveWeather = lastKnown.data; lastValidObservationAt = lastKnown.at; liveLocation = label; }
    if (liveWeather && (!lastValidObservationAt || Date.now() - lastValidObservationAt >= LAST_OBSERVATION_AGE_MS)) liveWeather = null;
    liveWeatherStale = Boolean(liveWeather?.current);
    if (isHomeEmbed) await nearbyPromise;
    if (activeMode === 'live') renderMode();
    renderForecast();
    console.info('Living Horizon: current weather unavailable; using clearly labelled visual study.', error?.message || error);
    return false;
  }
}

async function resolveCoarsePlace(latitude, longitude) {
  // Only called after explicit/granted user location permission. Providers see
  // approximately 100 m-rounded coordinates, never saved in PTI storage.
  const resolution = ++landscapeResolveAttempt;
  let address = {};
  let name = 'Your area';
  try {
    const url = new URL('https://nominatim.openstreetmap.org/reverse');
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('lat', String(latitude));
    url.searchParams.set('lon', String(longitude));
    url.searchParams.set('zoom', '14');
    url.searchParams.set('addressdetails', '1');
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 7000);
    let response;
    try { response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } }); }
    finally { window.clearTimeout(timeout); }
    if (response.ok) {
      const data = await response.json();
      address = data?.address || {};
      const locality = address.neighbourhood || address.suburb || address.quarter || address.city_district
        || address.village || address.town || address.city || address.county;
      const parent = address.city || address.town || address.county;
      // Network-assisted GPS can be off by kilometres. Do not claim a precise
      // neighbourhood when the browser itself reports a poor accuracy radius.
      name = deviceLocationAccuracy === null || deviceLocationAccuracy > 1500
        ? `${parent || locality || 'Your area'} (approx.)`
        : locality && parent && locality !== parent ? `${locality}, ${parent}` : locality || 'Your area';
    }
  } catch { /* Place-name lookup is optional; still try broad terrain evidence. */ }
  if (resolution !== landscapeResolveAttempt || currentArea.latitude !== latitude || currentArea.longitude !== longitude) return;
  liveLocation = String(name).slice(0, 45);
  currentArea.label = liveLocation;
  let profile;
  try {
    profile = await resolveLandscapeProfile({ latitude, longitude, name, address });
  } catch {
    profile = classifyLandscape(name, address);
  }
  if (resolution !== landscapeResolveAttempt || currentArea.latitude !== latitude || currentArea.longitude !== longitude) return;
  if (isHomeEmbed && artOverride !== null && !artworkMatchesPack(ARTWORKS[artOverride], pickRegionPack(profile).id)) {
    artOverride = null;
    artOverrideDay = null;
  }
  placeProfile = profile;
  artIndex = -1;
  if (activeMode === 'live') renderMode();
}

function getCoarsePosition(maximumAge) {
  return new Promise(resolve => {
    if (!navigator.geolocation) { resolve(null); return; }
    try {
      navigator.geolocation.getCurrentPosition(({ coords }) => {
        // Round to ~100 m for neighbourhood identification; never store GPS.
        resolve({
          latitude: Math.round(coords.latitude * 1000) / 1000,
          longitude: Math.round(coords.longitude * 1000) / 1000,
          accuracyMeters: Number.isFinite(coords.accuracy) ? coords.accuracy : null,
        });
      }, () => resolve(null), { enableHighAccuracy: true, maximumAge, timeout: 13000 });
    } catch {
      resolve(null);
    }
  });
}

function changeArea({ latitude, longitude }) {
  ++liveAttempt;
  liveWeather = null;
  liveWeatherStale = false;
  homeNearbyObservation = null;
  lastValidObservationAt = 0;
  liveLocation = 'Your area';
  currentArea = { latitude, longitude, cache: false, label: liveLocation };
  placeProfile = classifyLandscape(liveLocation);
  if (isHomeEmbed && artOverride !== null && !artworkMatchesPack(ARTWORKS[artOverride], pickRegionPack(placeProfile).id)) {
    artOverride = null;
    artOverrideDay = null;
  }
}

function invalidatePendingHomeFetches() {
  ++liveAttempt;
  ++landscapeResolveAttempt;
  ++deviceLocationRequest;
}

async function withinHomeDeadline(work, milliseconds) {
  let timer;
  const result = await Promise.race([
    Promise.resolve(work).then(value => ({ timedOut: false, value }), error => ({ timedOut: false, error })),
    new Promise(resolve => { timer = window.setTimeout(() => resolve({ timedOut: true }), milliseconds); }),
  ]);
  window.clearTimeout(timer);
  if (result.timedOut) invalidatePendingHomeFetches();
  return result;
}

async function presentHomeScene(token) {
  const artworkReady = await preloadHomeArtwork();
  if (token !== homePresentationToken) return;
  let recoveredArtwork = null;
  if (!artworkReady) {
    // Do not expose the HTML's temporary gouache poster when a selected image
    // fails to decode. On refresh, keep the last successfully painted artwork.
    const previousFile = artwork.dataset.file;
    const previousIndex = homeVisualReady
      ? ARTWORKS.findIndex(art => art.file === previousFile || art.wideFile === previousFile)
      : -1;
    if (previousIndex >= 0) {
      if (isHomeEmbed) {
        homeSelectedArtIndex = previousIndex;
        homeFallbackArtIndex = previousIndex;
      }
      else {
        artOverride = previousIndex;
        artOverrideDay = localDayKey(new Date(), environmentTimeZone());
      }
    } else frame.classList.add('home-art-unavailable');
  } else if (frame.classList.contains('home-art-unavailable')) {
    const art = ARTWORKS[selectedDailyArtworkIndex()];
    recoveredArtwork = art ? { art, ...artworkSource(art) } : null;
  }
  if (homeVisualReady) {
    // Only the wording dips briefly while a prepared painting crossfades.
    frame.classList.add('home-caption-changing');
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      await new Promise(resolve => window.setTimeout(resolve, 390));
    }
  }
  if (token !== homePresentationToken) return;
  if (recoveredArtwork) {
    artwork.dataset.file = recoveredArtwork.file;
    artwork.dataset.wide = String(recoveredArtwork.wide);
    artwork.src = recoveredArtwork.src;
    positionArtwork(artwork, recoveredArtwork.art);
  }
  homeVisualBusy = false;
  renderMode();
  if (artworkReady) frame.classList.remove('home-art-unavailable');
  if (!homeVisualReady) {
    homeVisualReady = true;
    requestAnimationFrame(() => {
      frame.classList.add('home-ready');
      // The cover owns the entire first fade. Enable ordinary atmospheric
      // transitions only after its 560 ms exit, so nothing assembles piecemeal.
      window.setTimeout(() => frame.classList.add('home-painted'), 610);
    });
  }
  frame.classList.remove('home-caption-changing');
  frame.setAttribute('aria-busy', 'false');
}

async function initializeHomeScene() {
  const token = ++homePresentationToken;
  homeVisualBusy = true;
  frame.setAttribute('aria-busy', 'true');
  const loading = (async () => {
    const locationRequest = deviceLocationRequest;
    const hasDeviceLocation = await restoreGrantedArea();
    // A timed-out geolocation attempt may finish after Home is already shown.
    if (token !== homePresentationToken || locationRequest !== deviceLocationRequest) return;
    if (!hasDeviceLocation) {
      await fetchWeather(COARSE_LOCATION.latitude, COARSE_LOCATION.longitude, { cache: true });
    }
  })();
  await withinHomeDeadline(loading, 17500);
  if (token === homePresentationToken) await presentHomeScene(token);
}

async function refreshHomeInBackground() {
  if (!isHomeEmbed || homeVisualBusy) return;
  const token = ++homePresentationToken;
  homeVisualBusy = true;
  await withinHomeDeadline(fetchWeather(currentArea.latitude, currentArea.longitude, currentArea), 12500);
  if (token === homePresentationToken) await presentHomeScene(token);
}

async function refreshHomeWeather() {
  if (homeRefreshing || homeVisualBusy) return;
  const token = ++homePresentationToken;
  const locationRequest = ++deviceLocationRequest;
  homeRefreshing = true;
  homeVisualBusy = true;
  homeClockButton.setAttribute('aria-busy', 'true');
  homeClockButton.setAttribute('aria-disabled', 'true');
  homeRefreshStatus.textContent = 'Updating weather and artwork.';
  try {
    const result = await withinHomeDeadline((async () => {
      const location = await getCoarsePosition(0);
      if (token !== homePresentationToken || locationRequest !== deviceLocationRequest) return null;
      const areaChanged = location && (location.latitude !== currentArea.latitude || location.longitude !== currentArea.longitude);
      if (areaChanged || location && currentArea.cache) changeArea(location);
      if (location) deviceLocationAccuracy = location.accuracyMeters;
      const { latitude, longitude } = currentArea;
      const [weatherUpdated] = await Promise.all([
        fetchWeather(latitude, longitude, { ...currentArea, force: true }),
        location && (areaChanged || liveLocation === 'Your area' || currentArea.cache)
          ? resolveCoarsePlace(latitude, longitude) : undefined,
      ]);
      return { location, weatherUpdated };
    })(), 17500);
    if (token !== homePresentationToken) return;
    advanceArtwork();
    await presentHomeScene(token);
    if (result.timedOut) homeRefreshStatus.textContent = 'Showing the latest available weather.';
    else if (result.error) homeRefreshStatus.textContent = 'Weather refresh unavailable.';
    else if (!result.value) homeRefreshStatus.textContent = 'Showing the latest available weather.';
    else homeRefreshStatus.textContent = result.value.weatherUpdated
      ? `Weather updated for ${liveLocation}.` : `Weather unavailable for ${liveLocation}.`;
  } finally {
    homeRefreshing = false;
    homeClockButton.setAttribute('aria-busy', 'false');
    homeClockButton.removeAttribute('aria-disabled');
    if (homeVisualBusy && token === homePresentationToken) await presentHomeScene(token);
  }
}

async function restoreGrantedArea() {
  // A previously granted browser permission is reusable without reprompting;
  // first-time location access is still initiated only by the user's tap.
  if (!navigator.permissions?.query || !navigator.geolocation) return false;
  const request = deviceLocationRequest;
  try {
    const permission = await navigator.permissions.query({ name: 'geolocation' });
    if (permission.state !== 'granted' || homeRefreshing || request !== deviceLocationRequest) return false;
    const location = await getCoarsePosition(60000);
    if (!location || homeRefreshing || request !== deviceLocationRequest) return false;
    const changed = location.latitude !== currentArea.latitude || location.longitude !== currentArea.longitude;
    if (changed || currentArea.cache) changeArea(location);
    deviceLocationAccuracy = location.accuracyMeters;
    const { latitude, longitude } = currentArea;
    await Promise.all([
      fetchWeather(latitude, longitude, { ...currentArea, force: true }),
      resolveCoarsePlace(latitude, longitude),
    ]);
    return request === deviceLocationRequest;
  } catch { /* Browsers without a working permissions API retain regional view. */ }
  return false;
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

function setup() {
  seededStars();
  document.querySelector('#sim-art').max = String(ARTWORKS.length);
  artwork.addEventListener('load', () => positionArtwork());
  new ResizeObserver(updateArtworkSource).observe(frame);
  // Sky art and rain each own their resize, motion and visibility lifecycle.
  new IntersectionObserver(([entry]) => {
    frame.classList.toggle('out-of-view', !entry.isIntersecting);
  }).observe(frame);
  modeButtons.forEach(button => button.addEventListener('click', () => setMode(button.dataset.mode)));
  studio.addEventListener('toggle', () => {
    if (studio.open && !simulation) simulation = createSimulation();
    syncStudio();
  });
  studioInputs.forEach(input => input.addEventListener(input.type === 'range' ? 'input' : 'change', () => setCustomSimulation(input)));
  document.querySelector('#sim-reset-live').addEventListener('click', () => {
    if (isArtworkLab) selectExperimentalArtwork(-1);
    artOverride = null;
    artOverrideDay = null;
    artIndex = -1;
    setMode('live');
  });
  artButton.addEventListener('click', advanceArtwork);
  if (isHomeEmbed || isAmbient) {
    document.querySelector('.horizon-caption').append(atmosphericReadouts);
    homeClockButton.addEventListener('click', refreshHomeWeather);
  }
  const initialMode = new URL(window.location.href).searchParams.get('mode');
  activeMode = 'live';
  if (!isHomeEmbed && PRESETS[initialMode]) setMode(initialMode);
  else renderMode();
  setupArtworkLab();
  if (isArtworkLab) {
    // Load diagnostics only on the explicit experiment URL. The owner-approved
    // Home weather remains unaffected by network or preview-source failures.
    void import('./weather-lab.js?v=weather-accuracy-lab-20261116').then(({ setupWeatherLab }) => {
      setupWeatherLab({
        onAreaChange: area => {
          weatherLabObservation = null;
          ++liveAttempt;
          liveWeather = null;
          liveWeatherStale = false;
          lastValidObservationAt = 0;
          currentArea = { latitude: area.latitude, longitude: area.longitude, cache: false, label: area.name };
          liveLocation = area.name;
          placeProfile = classifyLandscape(area.name);
          if (activeMode !== 'live') setMode('live');
          else renderMode();
          void fetchWeather(area.latitude, area.longitude, { ...currentArea, force: true });
        },
        onObservationPreview: observation => {
          weatherLabObservation = observation;
          if (activeMode !== 'live') setMode('live');
          else renderMode();
        },
      });
    }).catch(() => {
      const status = document.querySelector('#weather-lab-status');
      if (status) status.textContent = 'Weather source comparison could not load.';
    });
  }
  if (isHomeEmbed || isAmbient) tickHomeClock();
  if (isHomeEmbed) void initializeHomeScene();
  else if (!isArtworkLab) void fetchWeather(COARSE_LOCATION.latitude, COARSE_LOCATION.longitude, { cache: true });
  if (isAmbient) void restoreGrantedArea();
  // Refresh only while the live scene is visible, at most once per 15 minutes.
  window.setInterval(() => {
    if (document.hidden || frame.classList.contains('out-of-view') || activeMode !== 'live' || homeRefreshing) return;
    if (liveWeather) renderMode();
    if (Date.now() - lastObservationFetch >= CACHE_AGE_MS) {
      if (isHomeEmbed) void refreshHomeInBackground();
      else void fetchWeather(currentArea.latitude, currentArea.longitude, currentArea);
    }
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || frame.classList.contains('out-of-view') || activeMode !== 'live' || homeRefreshing) return;
    renderMode();
    if (Date.now() - lastObservationFetch > CACHE_AGE_MS) {
      if (isHomeEmbed) void refreshHomeInBackground();
      else void fetchWeather(currentArea.latitude, currentArea.longitude, currentArea);
    }
  });
  useLocation.addEventListener('click', async () => {
    if (!navigator.geolocation) { sourceLine.textContent = 'Location access is unavailable. Using the coarse Navi Mumbai area.'; return; }
    sourceLine.textContent = 'Permission requested · approximately 100 m area is sent to weather and place providers.';
    const location = await getCoarsePosition(600000);
    if (!location) { sourceLine.textContent = `Location not shared · using the ${liveLocation} weather view.`; return; }
    changeArea(location);
    artIndex = -1;
    lastObservationFetch = Date.now();
    setMode('live');
    void fetchWeather(location.latitude, location.longitude, currentArea);
    void resolveCoarsePlace(location.latitude, location.longitude);
  });
  document.querySelector('#app-search').addEventListener('input', event => {
    const term = String(event.target.value || '').trim().toLowerCase();
    document.querySelectorAll('.pinned-card').forEach(card => { card.hidden = !card.textContent.toLowerCase().includes(term); });
  });
  if (isHomeEmbed && window.parent !== window) {
    // Match the existing responsive frame so Home never reserves space for studio controls.
    const reportHeight = () => {
      const height = Math.ceil(frame.getBoundingClientRect().height + 2);
      window.parent.postMessage({ source: 'pti-living-horizon', event: 'resize', height }, window.location.origin);
    };
    new ResizeObserver(reportHeight).observe(frame);
    window.addEventListener('load', reportHeight);
    reportHeight();
  }
}
setup();
