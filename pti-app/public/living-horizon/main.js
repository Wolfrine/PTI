// Public-safe visual prototype. No authentication, account data or personal metrics.
// Live weather + modelled air quality: Open-Meteo. Opted-in position is coarse.
import {
  ARTWORKS, classifyLandscape, dailyArtworkIndex, localDayKey, celestialState,
  phaseFromSun, formatLocalTime, paintMoon, moonPhaseName,
} from './environment.js';
import { createCloudSystem } from './clouds.js';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const CURRENT_FIELDS = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,visibility,is_day';
const CACHE_KEY = 'pti.living-horizon.coarse-weather.v2';
const AIR_CACHE_KEY = 'pti.living-horizon.coarse-air.v1';
const CACHE_AGE_MS = 15 * 60 * 1000;
const AIR_AGE_MS = 60 * 60 * 1000;
const COARSE_LOCATION = { name: 'Navi Mumbai', latitude: 19.05, longitude: 73.02 };
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
const heroAqi = document.querySelector('#hero-aqi');
const heroAqiValue = document.querySelector('#hero-aqi-value');
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
const geographyReadout = document.querySelector('#geography-readout');
const moonDisc = document.querySelector('#moon-disc');
const sunDisc = document.querySelector('.sun');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const useLocation = document.querySelector('#use-location');
const cloudSystem = createCloudSystem(document.querySelector('#cloud-canvas'), frame);
const studio = document.querySelector('#scene-lab');
const studioInputs = [...document.querySelectorAll('[data-sim]')];
const studioSummary = document.querySelector('#sim-summary');
const studioGeographyNote = document.querySelector('#sim-geography-note');
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
let simulation = null;

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
    aqi: clamp(numeric(airQuality?.current?.us_aqi, 100), 0, 500),
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
function updateScene({ phase, weather, description, temperature, location, state, note, date = new Date(), moonOverride = null, celestial = null, observedTime = '', cloudCover = 20, wind = 12 }) {
  frame.dataset.phase = phase;
  frame.dataset.weather = weather;
  locationLabel.textContent = location;
  temperatureLabel.textContent = Number.isFinite(temperature) ? `${Math.round(temperature)}°` : '';
  descriptionLabel.textContent = description;
  heroObservationTime.hidden = !observedTime;
  heroObservationTime.textContent = observedTime;
  heroObservationTime.title = state === 'live' ? 'Open-Meteo current weather timestamp in local time'
    : state === 'simulation' ? 'Selected local simulation time' : '';
  heroKicker.textContent = state === 'live' ? 'THE SKY, RIGHT NOW'
    : state === 'simulation' ? 'LIVING HORIZON · SIMULATION' : 'LIVING HORIZON · VISUAL STUDY';
  if (state === 'live') setStatus('Live weather', 'live');
  else if (state === 'simulation') setStatus('Simulated · not live', 'sample');
  else if (state === 'offline') setStatus('Offline · sample', 'sample');
  else setStatus('Scene preview', 'sample');
  sourceLine.textContent = note;
  configureRain(weather === 'rain' || weather === 'storm', weather === 'storm');
  if (state === 'live' || state === 'simulation') renderCelestials(date, moonOverride, state === 'live', celestial);
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
  frame.dataset.sunVisible = String(sun.visible);
  frame.dataset.moonVisible = String(moon.visible && fraction > .025);
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

function showHeroAqi(value, simulated = false) {
  const valid = typeof value === 'number' && Number.isFinite(value) && value >= 0;
  heroAqi.hidden = !valid;
  if (!valid) return;
  const aqi = Math.round(value);
  const levels = ['good', 'moderate', 'sensitive', 'unhealthy', 'very-unhealthy', 'hazardous'];
  const names = ['Good', 'Moderate', 'Unhealthy for sensitive groups', 'Unhealthy', 'Very unhealthy', 'Hazardous'];
  const tier = aqi <= 50 ? 0 : aqi <= 100 ? 1 : aqi <= 150 ? 2 : aqi <= 200 ? 3 : aqi <= 300 ? 4 : 5;
  heroAqi.dataset.level = levels[tier];
  heroAqi.dataset.simulated = String(simulated);
  heroAqiValue.textContent = String(aqi);
  heroAqi.title = simulated ? `Simulated US AQI ${aqi} · ${names[tier]}`
    : `Regional CAMS global model (~45 km grid), US AQI ${aqi} · ${names[tier]}. Not a nearby station measurement or India's official AQI.`;
  heroAqi.setAttribute('aria-label', heroAqi.title);
}

function setAtmosphericDepth(visibilityKm, aqi) {
  const visibility = Number.isFinite(visibilityKm)
    ? Math.pow(clamp((15 - visibilityKm) / 14.5, 0, 1), 1.25) : 0;
  const pollution = Number.isFinite(aqi) ? clamp((aqi - 35) / 345, 0, 1) : 0;
  frame.style.setProperty('--visibility-strength', visibility.toFixed(3));
  frame.style.setProperty('--visibility-blur', `${(visibility * 6).toFixed(1)}px`);
  frame.style.setProperty('--aqi-strength', pollution.toFixed(3));
}

function renderReadouts(live) {
  const rawVisibility = liveWeather?.current?.visibility;
  const visibilityMeters = Number(rawVisibility);
  const hasVisibility = live && typeof rawVisibility === 'number' && Number.isFinite(visibilityMeters) && visibilityMeters >= 0;
  visibilityReadout.hidden = !hasVisibility;
  if (hasVisibility) {
    const km = visibilityMeters / 1000;
    visibilityReadout.textContent = 'Visibility ' + (km >= 10 ? km.toFixed(0) : km.toFixed(1)) + ' km';
  }
  const rawAqi = airQuality?.current?.us_aqi;
  const usAqi = Number(rawAqi);
  const hasAir = live && typeof rawAqi === 'number' && Number.isFinite(usAqi) && usAqi >= 0;
  airReadout.hidden = true; // The primary AQI value now lives beside sky conditions.
  showHeroAqi(hasAir ? usAqi : null);
  setAtmosphericDepth(hasVisibility ? visibilityMeters / 1000 : null, hasAir ? usAqi : null);
  moonReadout.hidden = !live;
  geographyReadout.hidden = true;
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
  document.querySelector('#sim-aqi-value').textContent = String(simulation.aqi);
  document.querySelector('#sim-temperature-value').textContent = simulation.temperature + '°C';
  const currentArt = ARTWORKS[simulation.art - 1] || ARTWORKS[0];
  document.querySelector('#sim-art-value').textContent = currentArt.name;
  const matchesSettlement = currentArt.settlement.includes(simulation.settlement);
  const matchesRelief = currentArt.terrain.includes(simulation.relief);
  const matchesWater = simulation.water === 'none' || currentArt.terrain.includes(simulation.water);
  studioGeographyNote.textContent = matchesSettlement && matchesRelief && matchesWater
    ? 'Coastal-foothill artwork is a stylistic approximation. Vegetation and exact terrain are not mapped yet.'
    : 'Matching regional artwork is unavailable. The existing coastal-foothill painting stays visible as an interpretive study.';
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
  studioSummary.textContent = activeMode === 'live' ? 'Open simulation studio'
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
  const description = `${simulation.weather[0].toUpperCase() + simulation.weather.slice(1)} · ${simulation.cloud}% cloud · ${simulation.rain} mm/h rain`;
  updateScene({ phase, weather: simulation.weather, location: currentArea.label || COARSE_LOCATION.name,
    temperature: simulation.temperature, description, date, moonOverride: manualPhase, celestial: solar,
    observedTime:displayTime(simulation.minutes), cloudCover:simulation.cloud, wind:simulation.wind,
    state: 'simulation', note: `Simulation · ${simulation.date} ${displayTime(simulation.minutes)} ${timezone} · landscape choice is an interpretation.` });
  frame.style.setProperty('--cloud-opacity', String(clamp(.06 + simulation.cloud / 115, .04, .96).toFixed(2)));
  frame.style.setProperty('--cloud-duration', `${clamp(145 - simulation.wind * 2.4, 40, 145).toFixed(0)}s`);
  setAtmosphericDepth(simulation.visibility, simulation.aqi);
  showHeroAqi(simulation.aqi, true);
  configureRain((simulation.weather === 'rain' || simulation.weather === 'storm') && simulation.rain > 0,
    simulation.weather === 'storm');
  frame.style.setProperty('--rain-sheet-opacity', simulation.rain <= 0 ? '0'
    : clamp(.12 + simulation.rain / 30, .12, .72).toFixed(2));
  visibilityReadout.hidden = false;
  visibilityReadout.textContent = `Visibility ${Number(simulation.visibility).toFixed(1)} km · simulated`;
  airReadout.hidden = true;
  moonReadout.hidden = false;
  geographyReadout.hidden = false;
  geographyReadout.textContent = [simulation.settlement, simulation.relief, simulation.water, simulation.vegetation]
    .map(value => value[0].toUpperCase() + value.slice(1)).join(' · ') + ' · hypothetical';
  syncStudio();
}

function renderMode() {
  updateDailyArt();
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
    const solar = celestialState(
      new Date(), currentArea.latitude, currentArea.longitude, environmentTimeZone(),
      localDayOffset(new Date(), environmentTimeZone()),
    );
    const phase = phaseFromSun(solar?.sun);
    const hhmm = String(current.time || '').split('T')[1]?.slice(0, 5);
    updateScene({ phase, weather, location: liveLocation, temperature: Number(current.temperature_2m), description: text, observedTime:hhmm,
      cloudCover:Number(current.cloud_cover), wind:Number(current.wind_speed_10m), state: 'live', celestial: solar,
      note: `Weather by Open-Meteo · ${liveLocation === COARSE_LOCATION.name ? 'coarse Navi Mumbai area' : 'your opted-in area'} · artwork is interpretive.` });
    const clouds = Number(current.cloud_cover);
    sourceLine.textContent = 'Open-Meteo weather · US AQI from regional CAMS global model (~45 km grid) · ' +
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

function setCustomSimulation(input) {
  if (!simulation || activeMode === 'live') simulation = createSimulation();
  const key = input.dataset.sim;
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
  }
  activeMode = 'custom';
  const url = new URL(window.location.href);
  url.searchParams.delete('mode'); // A scenario is intentionally not persisted in a shareable URL.
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
  studio.addEventListener('toggle', () => {
    if (studio.open && !simulation) { simulation = createSimulation(); syncStudio(); }
  });
  studioInputs.forEach(input => input.addEventListener(input.type === 'range' ? 'input' : 'change', () => setCustomSimulation(input)));
  document.querySelector('#sim-reset-live').addEventListener('click', () => {
    artOverride = null;
    artOverrideDay = null;
    artIndex = -1;
    setMode('live');
  });
  artButton.addEventListener('click', () => {
    artOverride = (artIndex + 1) % ARTWORKS.length;
    artOverrideDay = localDayKey(new Date(), environmentTimeZone());
    updateDailyArt();
    if (simulation) { simulation.art = artIndex + 1; syncStudio(); }
  });
  const initialMode = new URL(window.location.href).searchParams.get('mode');
  activeMode = 'live';
  if (PRESETS[initialMode]) setMode(initialMode);
  else renderMode();
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
        // Discard the old area before changing its label so Navi Mumbai's
        // previous weather never appears under the newly selected place.
        ++liveAttempt;
        ++airAttempt;
        liveWeather = null;
        currentArea = { latitude, longitude, cache: false, label: 'Your area' };
        liveLocation = 'Your area';
        placeProfile = classifyLandscape('Your area');
        airQuality = null;
        artIndex = -1;
        lastObservationFetch = Date.now();
        setMode('live');
        setStatus('Connecting', 'fetching');
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
