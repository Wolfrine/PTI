// Public-safe visual prototype. No authentication, account data or personal metrics.
// Live weather: Open-Meteo. Opted-in position is coarse; smog simulation is artistic.
import {
  ARTWORKS, classifyLandscape, localDayKey, celestialState,
  phaseFromSun, formatLocalTime, paintMoon, moonPhaseName,
} from './environment.js?v=horizon-r7-20261113';
import {
  REGION_PACKS, resolveLandscapeProfile, pickRegionPack, eligibleArtwork, regionalArtworkIndex,
} from './landscape-regions.js?v=horizon-r7-20261113';
import { createCloudSystem } from './clouds.js?v=horizon-r7-20261113';
import { createRainSystem } from './rain-effects.js?v=horizon-r7-20261113';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const CURRENT_FIELDS = 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m,visibility,is_day';
const CACHE_KEY = 'pti.living-horizon.coarse-weather.v2';
const CACHE_AGE_MS = 15 * 60 * 1000;
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
const heroKicker = document.querySelector('#hero-kicker');
const statusNode = document.querySelector('#horizon-status');
const statusLabel = document.querySelector('#status-label');
const localClock = document.querySelector('#local-clock');
const sourceLine = document.querySelector('#source-line');
const artwork = document.querySelector('#artwork');
const artButton = document.querySelector('#next-art');
const artCount = document.querySelector('#art-count');
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
let liveLocation = COARSE_LOCATION.name;
let activeMode = 'live';
let liveAttempt = 0;
let lastObservationFetch = 0;
let lastSuccessfulSync = 0;
let currentArea = { latitude: COARSE_LOCATION.latitude, longitude: COARSE_LOCATION.longitude, cache: true, label: COARSE_LOCATION.name };
let placeProfile = classifyLandscape(COARSE_LOCATION.name);
let artIndex = -1;
let artOverride = null;
let artOverrideDay = null;
let renderedDay = '';
let simulation = null;
let landscapeResolveAttempt = 0;

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

// The current clock is independent of forecast issue time. The unobtrusive
// sync indicator reports a successful fetch, never a failed retry attempt.
function updateClockAndFreshness() {
  const now = new Date();
  const timezone = environmentTimeZone();
  let localTime;
  try {
    localTime = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).format(now);
  } catch { localTime = displayTime(now.getHours() * 60 + now.getMinutes()); }
  localClock.textContent = localTime;
  localClock.dateTime = `${localDayKey(now, timezone)}T${localTime}`;
  localClock.title = `Current local time · ${timezone}`;

  if (activeMode !== 'live' || !liveWeather?.current || !lastSuccessfulSync) return;
  const age = Math.max(0, now.getTime() - lastSuccessfulSync);
  const minutes = Math.floor(age / 60000);
  const ageText = minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h`;
  setStatus(`↻ ${ageText}`, age > 60 * 60000 ? 'sample' : 'live');
  const fetchedAt = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(new Date(lastSuccessfulSync));
  statusNode.title = `Weather last retrieved at ${fetchedAt} local time${minutes >= 60 ? ' · may be outdated' : ''}`;
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
    : state === 'simulation' ? 'Selected local simulation time' : '';
  heroKicker.textContent = state === 'live' ? 'THE SKY, RIGHT NOW'
    : state === 'simulation' ? 'LIVING HORIZON · SIMULATION' : 'LIVING HORIZON · VISUAL STUDY';
  if (state === 'live') setStatus('↻', 'live');
  else if (state === 'simulation') setStatus('Preview', 'sample');
  else if (state === 'offline') setStatus('Weather unavailable', 'sample');
  else setStatus('Scene preview', 'sample');
  statusNode.title = '';
  updateClockAndFreshness();
  sourceLine.textContent = note;
  rainSystem.update({active:(weather === 'rain'||weather === 'storm')&&rainfall>0,
    storm:weather === 'storm', intensity:rainfall, wind, phase});
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
  const pack = pickRegionPack(placeProfile);
  const pool = eligibleArtwork(placeProfile);
  const selected = artOverrideDay === today && artOverride !== null ? artOverride
    : regionalArtworkIndex(new Date(), timezone, placeProfile);
  if (selected === artIndex) return;
  artIndex = selected;
  const choice = ARTWORKS[selected];
  artwork.src = '../assets/images/living-horizon/' + choice.file;
  frame.dataset.art = choice.id;
  frame.style.setProperty('--art-position', choice.desktop);
  frame.style.setProperty('--art-mobile-position', choice.mobile);
  const place = pool.findIndex(candidate => candidate.index === selected);
  artCount.textContent = place >= 0 ? `${place + 1}/${pool.length}` : `${selected + 1}/${ARTWORKS.length}`;
  const artPackName = REGION_PACKS[choice.pack]?.title || choice.pack;
  const relationship = choice.pack !== pack.id ? 'manual artistic study'
    : pack.matched ? 'area study' : 'illustration';
  artButton.title = `${choice.name} · ${artPackName} ${relationship} · click to explore another artwork`;
  artButton.setAttribute('aria-label', artButton.title);
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
  const rawVisibility = liveWeather?.current?.visibility;
  const visibilityMeters = Number(rawVisibility);
  const hasVisibility = live && typeof rawVisibility === 'number' && Number.isFinite(visibilityMeters) && visibilityMeters >= 0;
  visibilityReadout.hidden = !hasVisibility;
  if (hasVisibility) {
    const km = visibilityMeters / 1000;
    visibilityReadout.textContent = 'Visibility ' + (km >= 10 ? km.toFixed(0) : km.toFixed(1)) + ' km';
  }
  setAtmosphericDepth(hasVisibility ? visibilityMeters / 1000 : null);
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
  document.querySelector('#sim-pollution-value').textContent = simulation.pollution + '%';
  document.querySelector('#sim-temperature-value').textContent = simulation.temperature + '°C';
  const currentArt = ARTWORKS[simulation.art - 1] || ARTWORKS[0];
  document.querySelector('#sim-art-value').textContent = currentArt.name;
  const matchCount = artworkFit(currentArt, simulation);
  const unmatched = LANDSCAPE_AXES.filter(axis => !currentArt[axis]?.includes(simulation[axis]));
  studioGeographyNote.textContent = matchCount === 4
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
  const description = `${simulation.weather[0].toUpperCase() + simulation.weather.slice(1)} · ${simulation.cloud}% cloud · ${simulation.rain} mm/h rain`;
  updateScene({ phase, weather: simulation.weather, location: currentArea.label || COARSE_LOCATION.name,
    temperature: simulation.temperature, description, date, moonOverride: manualPhase, celestial: solar,
    observedTime:displayTime(simulation.minutes), cloudCover:simulation.cloud, wind:simulation.wind, rainfall:simulation.rain,
    state: 'simulation', note: `Simulation · ${simulation.date} ${displayTime(simulation.minutes)} ${timezone} · landscape choice is an interpretation.` });
  frame.style.setProperty('--cloud-opacity', String(clamp(.06 + simulation.cloud / 115, .04, .96).toFixed(2)));
  frame.style.setProperty('--cloud-duration', `${clamp(145 - simulation.wind * 2.4, 40, 145).toFixed(0)}s`);
  setAtmosphericDepth(simulation.visibility, simulation.pollution);
  visibilityReadout.hidden = false;
  visibilityReadout.textContent = `Visibility ${Number(simulation.visibility).toFixed(1)} km · simulated`;
  moonReadout.hidden = false;
  geographyReadout.hidden = false;
  geographyReadout.textContent = [simulation.settlement, simulation.relief, simulation.water, simulation.vegetation]
    .map(value => value[0].toUpperCase() + value.slice(1)).join(' · ') + ' · hypothetical';
  syncStudio();
}

function renderMode() {
  updateDailyArt();
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
    const solar = celestialState(
      new Date(), currentArea.latitude, currentArea.longitude, environmentTimeZone(),
      localDayOffset(new Date(), environmentTimeZone()),
    );
    const phase = phaseFromSun(solar?.sun);
    const hhmm = String(current.time || '').split('T')[1]?.slice(0, 5);
    updateScene({ phase, weather, location: liveLocation, temperature: Number(current.temperature_2m), description: text, observedTime:hhmm,
      cloudCover:Number(current.cloud_cover), wind:Number(current.wind_speed_10m), rainfall, state: 'live', celestial: solar,
      note: `Weather by Open-Meteo · ${liveLocation === COARSE_LOCATION.name ? 'coarse Navi Mumbai area' : 'your opted-in area'} · artwork is interpretive.` });
    const clouds = Number(current.cloud_cover);
    const pack = pickRegionPack(placeProfile);
    const source = placeProfile?.evidence?.relief && placeProfile?.evidence?.surface
      ? ' · Copernicus DEM elevation and OpenStreetMap features'
      : placeProfile?.evidence?.relief ? ' · Copernicus DEM terrain'
      : placeProfile?.evidence?.surface ? ' · mapped features' : '';
    // Place names and mapped land features come from OpenStreetMap after an
    // explicit location action; visible attribution is retained in Home embed.
    const osmCredit = currentArea.cache ? '' : ' · © OpenStreetMap contributors';
    sourceLine.textContent = `Open-Meteo weather · ${pack.title} ${pack.matched ? 'regional study' : 'illustration'}${source}${osmCredit}.`;
    sourceLine.title = `${pack.reason}. Regional paintings represent broad landscape types, not exact views from your location.`;
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
    if (stored) { liveWeather = stored.data; lastObservationFetch = stored.at; lastSuccessfulSync = stored.at; liveLocation = label; if (activeMode === 'live') renderMode(); return; }
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
    lastSuccessfulSync = lastObservationFetch;
    if (cache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data })); } catch { /* Storage is optional. */ } }
    if (activeMode === 'live') renderMode();
  } catch (error) {
    if (myAttempt !== liveAttempt) return;
    liveWeather = null;
    if (activeMode === 'live') renderMode();
    console.info('Living Horizon: current weather unavailable; using clearly labelled visual study.', error?.message || error);
  }
}

async function resolveCoarsePlace(latitude, longitude) {
  // Only called after explicit user location permission. Providers see already
  // rounded ~1 km coordinates; results remain in memory and can fail independently.
  const resolution = ++landscapeResolveAttempt;
  let address = {};
  let name = 'Your area';
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
    if (response.ok) {
      const data = await response.json();
      address = data?.address || {};
      name = address.city || address.town || address.village || address.county || 'Your area';
    }
  } catch { /* Place-name lookup is optional; still try broad terrain evidence. */ }
  if (resolution !== landscapeResolveAttempt || currentArea.latitude !== latitude || currentArea.longitude !== longitude) return;
  liveLocation = String(name).slice(0, 45);
  currentArea.label = liveLocation;
  try {
    const sourced = await resolveLandscapeProfile({ latitude, longitude, name, address });
    if (resolution !== landscapeResolveAttempt || currentArea.latitude !== latitude || currentArea.longitude !== longitude) return;
    placeProfile = sourced;
  } catch {
    placeProfile = classifyLandscape(name, address);
  }
  artIndex = -1;
  if (activeMode === 'live') renderMode();
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
    artOverride = null;
    artOverrideDay = null;
    artIndex = -1;
    setMode('live');
  });
  artButton.addEventListener('click', () => {
    const candidates = activeMode === 'live'
      ? eligibleArtwork(placeProfile).map(entry => entry.index)
      : ARTWORKS.map((_, index) => index);
    const position = candidates.indexOf(artIndex);
    artOverride = candidates[(position + 1) % candidates.length] ?? 0;
    artOverrideDay = localDayKey(new Date(), environmentTimeZone());
    updateDailyArt();
    if (simulation) { simulation.art = artIndex + 1; syncStudio(); }
  });
  const initialMode = new URL(window.location.href).searchParams.get('mode');
  activeMode = 'live';
  if (PRESETS[initialMode]) setMode(initialMode);
  else renderMode();
  void fetchWeather(COARSE_LOCATION.latitude, COARSE_LOCATION.longitude, { cache: true });
  // Refresh only while the live scene is visible, at most once per 15 minutes.
  window.setInterval(() => {
    if (document.hidden || activeMode !== 'live') return;
    if (liveWeather) renderMode();
    else updateClockAndFreshness();
    if (Date.now() - lastObservationFetch >= CACHE_AGE_MS) {
      void fetchWeather(currentArea.latitude, currentArea.longitude, currentArea);
    }
  }, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || activeMode !== 'live') return;
    renderMode();
    if (Date.now() - lastObservationFetch > CACHE_AGE_MS) {
      void fetchWeather(currentArea.latitude, currentArea.longitude, currentArea);
    }
  });
  useLocation.addEventListener('click', () => {
    if (!navigator.geolocation) { sourceLine.textContent = 'Location access is unavailable. Using the coarse Navi Mumbai area.'; return; }
    sourceLine.textContent = 'Permission requested · approximate area is sent to weather and place providers.';
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        // Two decimals (~1 km) are enough for a visual atmosphere and avoid
        // sending or saving the precise GPS result.
        const latitude = Math.round(coords.latitude * 100) / 100;
        const longitude = Math.round(coords.longitude * 100) / 100;
        // Discard the old area before changing its label so Navi Mumbai's
        // previous weather never appears under the newly selected place.
        ++liveAttempt;
        liveWeather = null;
        lastSuccessfulSync = 0;
        currentArea = { latitude, longitude, cache: false, label: 'Your area' };
        liveLocation = 'Your area';
        placeProfile = classifyLandscape('Your area');
        artIndex = -1;
        lastObservationFetch = Date.now();
        setMode('live');
        setStatus('Connecting', 'fetching');
        void fetchWeather(latitude, longitude, { cache: false, label: 'Your area' });
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
  if (document.documentElement.classList.contains('horizon-embed') && window.parent !== window) {
    // Rehome only the location-consent button. Standalone preview controls
    // remain in their familiar place, while Home keeps a tiny location icon.
    statusNode.appendChild(useLocation);
    // The parent owns page scrolling; only painted depth layers respond.
    window.addEventListener('message', event => {
      if (event.origin !== window.location.origin || event.source !== window.parent ||
          event.data?.source !== 'pti-home' || event.data?.event !== 'parallax') return;
      const requested = Number(event.data.offset);
      if (!Number.isFinite(requested)) return;
      const depth = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : clamp(requested, 0, 14);
      frame.style.setProperty('--horizon-art-shift', `${depth}px`);
      frame.style.setProperty('--horizon-cloud-shift', `${Math.round(depth * .6)}px`);
      frame.style.setProperty('--horizon-sky-shift', `${Math.round(depth * .3)}px`);
    });
    // The real Angular Home owns surrounding content; fit only this calm strip.
    const content = document.querySelector('.living-section');
    const reportHeight = () => {
      const height = Math.ceil(content.getBoundingClientRect().height + 2);
      window.parent.postMessage({ source: 'pti-living-horizon', event: 'resize', height }, window.location.origin);
    };
    new ResizeObserver(reportHeight).observe(content);
    window.addEventListener('load', reportHeight);
    reportHeight();
  }
}
setup();
