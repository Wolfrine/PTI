const UI_VERSIONS = [
  { id: 'perceptual-specimens-v5', label: 'Perceptual Specimens v5', badge: 'Latest', theme: '#f2efe6' },
  { id: 'meaningful-motion-v4', label: 'Meaningful Motion v4', badge: 'Previous', theme: '#f2efe6' },
  { id: 'trace-register-v2.1', label: 'Trace Register v2.1', badge: 'Previous', theme: '#f2efe6' },
  { id: 'intuitive-capture-v3', label: 'Intuitive Capture v3', badge: 'Previous', theme: '#f4f2ed' }
];
const LATEST_UI_VERSION = 'perceptual-specimens-v5';
const STORAGE_KEY = 'luminary.uiVersion';

const known = new Set(UI_VERSIONS.map((version) => version.id));
const queryVersion = new URLSearchParams(location.search).get('ui');
const storedVersion = localStorage.getItem(STORAGE_KEY);
const selectedVersion = known.has(queryVersion)
  ? queryVersion
  : known.has(storedVersion)
    ? storedVersion
    : LATEST_UI_VERSION;

window.__LUMINARY_UI_VERSION__ = selectedVersion;
window.__LUMINARY_UI_VERSIONS__ = UI_VERSIONS;
window.__LUMINARY_LATEST_UI_VERSION__ = LATEST_UI_VERSION;
window.__LUMINARY_UI_STORAGE_KEY__ = STORAGE_KEY;
document.body.dataset.uiVersion = selectedVersion;

const selected = UI_VERSIONS.find((version) => version.id === selectedVersion);
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', selected?.theme || '#f4f2ed');

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = './versions/' + selectedVersion + '.css';
stylesheet.id = 'experienceStylesheet';
document.head.appendChild(stylesheet);

async function loadExperience(versionId) {
  const response = await fetch('./versions/' + versionId + '.html', { cache: 'no-store' });
  if (!response.ok) throw new Error('Experience template unavailable: ' + versionId);
  return response.text();
}

const root = document.getElementById('versionRoot');
try {
  root.innerHTML = await loadExperience(selectedVersion);
} catch (error) {
  console.error(error);
  if (selectedVersion !== 'trace-register-v2.1') {
    window.__LUMINARY_UI_VERSION__ = 'trace-register-v2.1';
    document.body.dataset.uiVersion = 'trace-register-v2.1';
    stylesheet.href = './versions/trace-register-v2.1.css';
    root.innerHTML = await loadExperience('trace-register-v2.1');
  } else {
    root.innerHTML = '<main class="version-load-error"><h1>Luminary could not load.</h1><p>Reconnect and try again.</p></main>';
    throw error;
  }
}

await import('./app.js');
