// The accuracy comparison lives only in the opt-in Living Horizon experiment.
// It never writes the owner's location, a weather reading or account data.
import { WEATHER_LAB_AREAS, fetchWeatherComparison } from './weather-sources.js';

const $ = selector => document.querySelector(selector);
const reading = (value, decimals = 1) => Number.isFinite(value) ? value.toFixed(decimals) : '—';
const timeInIndia = value => {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true }).format(date)
    : 'time unavailable';
};

function modelSky(model) {
  const code = Number(model?.weatherCode);
  const cloud = Number(model?.cloudCoverPct);
  if (code >= 95) return 'Thunderstorms';
  if (code === 45 || code === 48) return 'Fog forecast';
  if (code >= 71 && code <= 77 || code === 85 || code === 86) return 'Snow forecast';
  if (code >= 51 && code <= 70 || code >= 80 && code <= 82 || (model?.precipitationMm || 0) > 0) return 'Rain forecast';
  if (code === 3 || cloud >= 82) return 'Overcast';
  if (code >= 1 || cloud >= 42) return 'Partly cloudy';
  return 'Clear sky';
}

function observedAir(observation) {
  if (!observation) return '';
  const names = {
    HZ: 'haze', FU: 'smoke', BR: 'mist', FG: 'fog', DU: 'dust', SA: 'sand', VA: 'volcanic ash',
  };
  const phenomena = Array.isArray(observation.phenomena) ? observation.phenomena : [];
  return [...new Set(phenomena.map(item => names[String(item).toUpperCase()] || String(item).toLowerCase()))].join(' · ') || 'no reported obscuration';
}

function locationFromDevice() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Location is unavailable in this browser')); return; }
    navigator.geolocation.getCurrentPosition(
      position => resolve(position),
      error => reject(new Error(error.code === 1 ? 'Location permission was not granted' : 'Could not get an accurate location')),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 13000 },
    );
  });
}

async function labelForDeviceArea(latitude, longitude) {
  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(latitude));
  url.searchParams.set('lon', String(longitude));
  url.searchParams.set('zoom', '14');
  url.searchParams.set('addressdetails', '1');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) return null;
    const address = (await response.json())?.address || {};
    const local = address.neighbourhood || address.suburb || address.quarter || address.city_district
      || address.village || address.town || address.city || address.county;
    const parent = address.city || address.town || address.county;
    if (!local) return null;
    return local !== parent && parent ? `${local}, ${parent}` : local;
  } catch { return null; }
  finally { clearTimeout(timeout); }
}

export function setupWeatherLab({ onAreaChange, onObservationPreview }) {
  const panel = $('#weather-lab-panel');
  if (!panel) return;
  const select = $('#weather-lab-location');
  const useDevice = $('#weather-lab-device-location');
  const refresh = $('#weather-lab-refresh');
  const status = $('#weather-lab-status');
  const modelValue = $('#weather-lab-model-value');
  const modelDetail = $('#weather-lab-model-detail');
  const observedValue = $('#weather-lab-observed-value');
  const observedDetail = $('#weather-lab-observed-detail');
  const airValue = $('#weather-lab-air-value');
  const airDetail = $('#weather-lab-air-detail');
  const difference = $('#weather-lab-difference');
  const previewModel = $('#weather-lab-preview-model');
  const previewObserved = $('#weather-lab-preview-observed');
  const previewNote = $('#weather-lab-preview-note');
  const accuracy = $('#weather-lab-accuracy');
  const sources = $('#weather-lab-sources');
  const reportLink = $('#weather-lab-report-link');

  let activeArea = WEATHER_LAB_AREAS[0];
  let comparison = null;
  let chosenPreview = 'model';
  let requestNumber = 0;
  let deviceAttempt = 0;
  let controller = null;

  const drawPreview = () => {
    const observation = comparison?.observation;
    if (chosenPreview === 'observed' && !observation) chosenPreview = 'model';
    previewModel.classList.toggle('is-selected', chosenPreview === 'model');
    previewObserved.classList.toggle('is-selected', chosenPreview === 'observed');
    previewModel.setAttribute('aria-pressed', String(chosenPreview === 'model'));
    previewObserved.setAttribute('aria-pressed', String(chosenPreview === 'observed'));
    previewObserved.disabled = !observation;
    onObservationPreview(chosenPreview === 'observed' ? observation : null);
    previewNote.textContent = chosenPreview === 'observed' && observation
      ? `${observation.station} · ${observedAir(observation)} · observed at ${timeInIndia(observation.observedAt)} (airport, not your street)`
      : 'The scene uses Open-Meteo’s modelled visibility. Switch to nearby observed to see the difference.';
  };

  const renderReadings = () => {
    const { model, air, observation, errors } = comparison || {};
    modelValue.textContent = model && Number.isFinite(model.visibilityKm)
      ? `${reading(model.visibilityKm)} km` : 'Unavailable';
    modelDetail.textContent = model
      ? `${modelSky(model)} · ${reading(model.cloudCoverPct, 0)}% cloud · ${model.time?.slice(11, 16) || '—'} model time`
      : errors?.model || 'No current model reading';
    observedValue.textContent = observation && Number.isFinite(observation.visibilityKm)
      ? `${observation.visibilityLowerBound ? '≥' : ''}${reading(observation.visibilityKm)} km` : 'Unavailable';
    observedDetail.textContent = observation
      ? `${observation.station} · ${observedAir(observation)} · ${reading(observation.distanceKm)} km away · ${timeInIndia(observation.observedAt)}`
      : errors?.observation || 'No recent nearby airport observation';
    airValue.textContent = air && Number.isFinite(air.usAqi) ? `${Math.round(air.usAqi)} US AQI` : 'Unavailable';
    airDetail.textContent = air && Number.isFinite(air.pm25)
      ? `Modelled PM₂.₅ ${reading(air.pm25)} µg/m³ · ${air.time?.slice(11, 16) || '—'}`
      : errors?.air || 'No modelled air-quality reading';
    if (model && observation && Number.isFinite(model.visibilityKm) && Number.isFinite(observation.visibilityKm)) {
      difference.textContent = `${reading(model.visibilityKm)} km model at selected area vs `
        + `${observation.visibilityLowerBound ? '≥' : ''}${reading(observation.visibilityKm)} km at ${observation.station} `
        + `(${reading(observation.distanceKm)} km away). Different locations and observation times.`;
    } else difference.textContent = 'Both a model estimate and a recent nearby airport report are needed';
    const modelGrid = model?.grid;
    const airGrid = air?.grid;
    const modelSource = modelGrid && Number.isFinite(modelGrid.latitude) && Number.isFinite(modelGrid.longitude)
      ? `Open-Meteo grid ${modelGrid.latitude.toFixed(3)}, ${modelGrid.longitude.toFixed(3)}` : 'Open-Meteo unavailable';
    const stationSource = observation ? `Nearby ${observation.station}, ${Math.round(observation.ageMinutes)} min old` : 'Station reading unavailable';
    const airSource = airGrid && Number.isFinite(airGrid.latitude) && Number.isFinite(airGrid.longitude)
      ? `air grid ${airGrid.latitude.toFixed(2)}, ${airGrid.longitude.toFixed(2)}` : 'air grid unavailable';
    sources.textContent = `${modelSource} · ${stationSource} · ${airSource}. Weather and AQI grids are estimates.`;
    reportLink.hidden = !observation;
    if (observation) reportLink.href = `https://metars.eu/api/metars/${observation.station}/decoded`;
    status.textContent = model && observation ? 'Nearby measured observation and forecast-grid estimates available'
      : model ? 'Forecast available · recent local observation unavailable'
        : observation ? 'Airport observation available · forecast unavailable' : 'Weather sources unavailable at the moment';
    status.dataset.state = model && observation ? 'ready' : 'partial';
    drawPreview();
  };

  const load = async (area, updateSceneArea = true) => {
    const token = ++requestNumber;
    controller?.abort();
    controller = new AbortController();
    activeArea = area;
    comparison = null;
    chosenPreview = 'model';
    previewObserved.disabled = true;
    status.textContent = `Comparing latest readings for ${area.name}…`;
    status.dataset.state = 'loading';
    refresh.disabled = true;
    modelValue.textContent = observedValue.textContent = airValue.textContent = '…';
    modelDetail.textContent = 'Checking forecast model';
    observedDetail.textContent = 'Checking nearby stations';
    airDetail.textContent = 'Checking particulate estimate';
    difference.textContent = 'Waiting for source readings';
    sources.textContent = 'Sources will be identified after their timestamps are checked.';
    reportLink.hidden = true;
    if (updateSceneArea) onAreaChange(area);
    else onObservationPreview(null);
    try {
      const next = await fetchWeatherComparison({ latitude: area.latitude, longitude: area.longitude, signal: controller.signal });
      if (token !== requestNumber) return;
      comparison = next;
      renderReadings();
    } catch (error) {
      if (token !== requestNumber) return;
      status.textContent = 'Sources could not be reached. Try again shortly.';
      status.dataset.state = 'partial';
      modelValue.textContent = observedValue.textContent = airValue.textContent = 'Unavailable';
      difference.textContent = 'No verified comparison available';
      sources.textContent = String(error?.message || 'Network error');
      drawPreview();
    } finally {
      if (token === requestNumber) refresh.disabled = false;
    }
  };

  select.addEventListener('change', () => {
    ++deviceAttempt; // A pending device fix must not override a newer manual choice.
    const area = WEATHER_LAB_AREAS.find(item => item.id === select.value);
    if (!area) return;
    accuracy.textContent = `${area.name} · selected neighbourhood centre, not device GPS`;
    void load(area);
  });
  refresh.addEventListener('click', () => void load(activeArea));
  previewModel.addEventListener('click', () => { chosenPreview = 'model'; drawPreview(); });
  previewObserved.addEventListener('click', () => { if (comparison?.observation) { chosenPreview = 'observed'; drawPreview(); } });
  useDevice.addEventListener('click', async () => {
    const attempt = ++deviceAttempt;
    useDevice.disabled = true;
    status.textContent = 'Requesting a fresh device position…';
    status.dataset.state = 'loading';
    try {
      const position = await locationFromDevice();
      if (attempt !== deviceAttempt) return;
      const { latitude, longitude, accuracy: meters } = position.coords;
      if (![latitude, longitude, meters].every(Number.isFinite)) throw new Error('The device supplied an incomplete location');
      // A local fix is used transiently for finding the nearest station, without rounding to a city.
      const label = await labelForDeviceArea(latitude, longitude) || 'Device area';
      if (attempt !== deviceAttempt) return;
      const area = { id: 'device', name: label, latitude, longitude };
      const existing = select.querySelector('option[value="device"]');
      if (existing) existing.textContent = label;
      else select.add(new Option(label, 'device'));
      select.value = 'device';
      accuracy.textContent = `${label} · device accuracy ±${Math.round(meters)} m${meters > 2000 ? ' · approximate fix' : ''} · coordinates not saved`;
      void load(area);
    } catch (error) {
      if (attempt !== deviceAttempt) return;
      status.textContent = error?.message || 'Could not determine device location';
      status.dataset.state = 'partial';
    } finally { useDevice.disabled = false; }
  });

  accuracy.textContent = `${activeArea.name} · selected neighbourhood centre, not device GPS`;
  select.value = activeArea.id;
  void load(activeArea);
}
