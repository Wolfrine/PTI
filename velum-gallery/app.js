import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';

const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',
  authDomain: 'pti-app-2ab59.firebaseapp.com',
  projectId: 'pti-app-2ab59',
  storageBucket: 'pti-app-2ab59.firebasestorage.app',
  messagingSenderId: '185802494856',
  appId: '1:185802494856:web:5e9777771492528c6e203d',
  measurementId: 'G-BY7B708EVV'
};

const PRIVATE_FOLDER_ID = '1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence).catch(() => {});

const $ = s => document.querySelector(s);
const authGate = $('#authGate');
const authTitle = $('#authTitle');
const authCopy = $('#authCopy');
const connectBtn = $('#connectBtn');
const authStatus = $('#authStatus');
const signOutBtn = $('#signOutBtn');
const syncBtn = $('#syncBtn');
const syncLabel = $('#syncLabel');
const driftMedia = $('#driftMedia');
const ambientBg = $('#ambientBg');
const driftChrome = $('#driftChrome');
const driftHint = $('#driftHint');
const driftStage = $('#driftStage');
const counter = $('#driftCounter');
const voteFlash = $('#voteFlash');
const toast = $('#toast');
const browseGrid = $('#browseGrid');
const sortSelect = $('#sortSelect');

let accessToken = sessionStorage.getItem('velum-drive-token') || '';
let tokenIssuedAt = Number(sessionStorage.getItem('velum-drive-token-at') || 0);
let images = [];
let imageMap = new Map();
let objectUrls = new Map();
let current = { type: 'single', ids: [] };
let history = [];
let historyIndex = -1;
let advanceTimer = null;
let chromeTimer = null;
let viewStarted = 0;
let wakeLock = null;
let browseObserver = null;
let initializedGallery = false;

class EventStore {
  constructor() { this.db = null; this.memory = []; }
  async init() {
    await new Promise(resolve => {
      const req = indexedDB.open('velum-local', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
      };
      req.onsuccess = () => { this.db = req.result; resolve(); };
      req.onerror = () => resolve();
    });
    this.memory = await this.all();
  }
  async all() {
    if (!this.db) return [];
    return new Promise(resolve => {
      const tx = this.db.transaction('events', 'readonly');
      const req = tx.objectStore('events').getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    });
  }
  async add(event) {
    const e = { ...event, at: Date.now() };
    this.memory.push(e);
    if (this.db) {
      const tx = this.db.transaction('events', 'readwrite');
      tx.objectStore('events').add(e);
    }
    return e;
  }
  stats(id) {
    const ev = this.memory.filter(e => e.imageIds?.includes(id));
    const directUp = ev.filter(e => e.type === 'up').length;
    const directDown = ev.filter(e => e.type === 'down').length;
    const pairUp = ev.filter(e => e.type === 'pair-up').length;
    const pairDown = ev.filter(e => e.type === 'pair-down').length;
    const views = ev.filter(e => e.type === 'view');
    const skips = ev.filter(e => e.type === 'skip').length;
    const lastView = views.length ? Math.max(...views.map(e => e.at)) : 0;
    const dwell = views.reduce((s, e) => s + (e.ms || 0), 0);
    const score = (directUp * 3 - directDown * 2.8) + (pairUp * .7 - pairDown * .65) + Math.min(dwell / 15000, 2) - skips * .18;
    return { directUp, directDown, pairUp, pairDown, views: views.length, lastView, dwell, skips, score };
  }
}
const store = new EventStore();
await store.init();

function tokenProbablyFresh() {
  return accessToken && (Date.now() - tokenIssuedAt) < 50 * 60 * 1000;
}

function setAuthMessage(title, copy, status = '') {
  authTitle.textContent = title;
  authCopy.textContent = copy;
  authStatus.textContent = status;
}

async function connectDrive() {
  connectBtn.disabled = true;
  setAuthMessage('Connecting', 'Choose the Google account that owns the private collection.', 'Waiting for Google…');
  try {
    const provider = new GoogleAuthProvider();
    provider.addScope(DRIVE_SCOPE);
    provider.setCustomParameters({ prompt: 'consent' });
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) throw new Error('Google did not return a Drive access token.');
    accessToken = credential.accessToken;
    tokenIssuedAt = Date.now();
    sessionStorage.setItem('velum-drive-token', accessToken);
    sessionStorage.setItem('velum-drive-token-at', String(tokenIssuedAt));
    await syncDrive({ initial: true });
  } catch (error) {
    console.error(error);
    let status = error?.message || 'Could not connect.';
    if (error?.code === 'auth/unauthorized-domain') {
      status = `One-time Firebase setup needed: add ${location.hostname} to Authentication → Settings → Authorized domains.`;
    }
    setAuthMessage('Connection needed', 'Velum reads only the configured Private folder after you sign in.', status);
    authGate.classList.add('open');
  } finally {
    connectBtn.disabled = false;
  }
}
connectBtn.addEventListener('click', connectDrive);

signOutBtn.addEventListener('click', async () => {
  sessionStorage.removeItem('velum-drive-token');
  sessionStorage.removeItem('velum-drive-token-at');
  accessToken = '';
  tokenIssuedAt = 0;
  revokeObjectUrls();
  images = [];
  imageMap.clear();
  initializedGallery = false;
  await signOut(auth).catch(() => {});
  authGate.classList.add('open');
  setAuthMessage('Private collection', 'Connect the Google account that owns the Drive folder.', 'Nothing is uploaded to this site.');
});

syncBtn.addEventListener('click', async () => {
  if (!tokenProbablyFresh()) return connectDrive();
  await syncDrive({ initial: false });
});

async function driveFetch(url, options = {}) {
  if (!accessToken) throw new Error('Drive is not connected.');
  const headers = new Headers(options.headers || {});
  headers.set('Authorization', `Bearer ${accessToken}`);
  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) {
    accessToken = '';
    sessionStorage.removeItem('velum-drive-token');
    sessionStorage.removeItem('velum-drive-token-at');
    throw new Error('Google Drive authorization expired. Reconnect to continue.');
  }
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error?.message || ''; } catch {}
    throw new Error(detail || `Google Drive request failed (${response.status}).`);
  }
  return response;
}

async function listPrivateImages() {
  const fields = 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,imageMediaMetadata(width,height))';
  const q = `'${PRIVATE_FOLDER_ID}' in parents and trashed=false`;
  const all = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ q, spaces: 'drive', pageSize: '1000', fields, orderBy: 'createdTime desc' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await driveFetch(`${DRIVE_API}/files?${params}`);
    const data = await response.json();
    all.push(...(data.files || []).filter(f => f.mimeType?.startsWith('image/')));
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return all.map(file => ({
    id: file.id,
    name: file.name,
    mimeType: file.mimeType,
    addedAt: Date.parse(file.createdTime || file.modifiedTime || new Date().toISOString()),
    modifiedAt: Date.parse(file.modifiedTime || file.createdTime || new Date().toISOString()),
    width: file.imageMediaMetadata?.width || 0,
    height: file.imageMediaMetadata?.height || 0,
    size: Number(file.size || 0)
  }));
}

async function syncDrive({ initial = false } = {}) {
  syncBtn.disabled = true;
  syncLabel.textContent = 'Syncing';
  if (initial) {
    authGate.classList.add('open');
    setAuthMessage('Opening collection', 'Reading image metadata from your Private Google Drive folder.', 'Images remain in Google Drive.');
  }
  try {
    const next = await listPrivateImages();
    if (!next.length) throw new Error('No images were found in the configured Private folder, or this account cannot access it.');
    images = next;
    imageMap = new Map(images.map(i => [i.id, i]));
    authGate.classList.remove('open');
    if (!initializedGallery) initGallery();
    else {
      renderBrowse();
      showToast(`${images.length} images synced`);
    }
  } catch (error) {
    console.error(error);
    authGate.classList.add('open');
    setAuthMessage('Could not open collection', 'Reconnect the Google account that owns the Private Drive folder.', error?.message || 'Drive access failed.');
  } finally {
    syncBtn.disabled = false;
    syncLabel.textContent = 'Sync';
  }
}

async function ensureObjectUrl(id) {
  if (objectUrls.has(id)) return objectUrls.get(id);
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  objectUrls.set(id, url);
  return url;
}
function revokeObjectUrls() {
  for (const url of objectUrls.values()) URL.revokeObjectURL(url);
  objectUrls.clear();
}
function imageById(id) { return imageMap.get(id); }

function weightedPick(exclude = []) {
  const explore = Math.random() < .22;
  const pool = images.filter(i => !exclude.includes(i.id));
  if (!pool.length) return images[Math.floor(Math.random() * images.length)];
  if (explore) return pool[Math.floor(Math.random() * pool.length)];
  const now = Date.now();
  const weights = pool.map(img => {
    const s = store.stats(img.id);
    const recency = s.lastView ? Math.min((now - s.lastView) / 3600000, 72) : 72;
    const rarity = 2.4 / (1 + s.views * .65);
    const preference = Math.max(.18, 1 + s.score * .17);
    const freshness = 1 + Math.max(0, (img.addedAt - (now - 72 * 3600000)) / (72 * 3600000)) * .6;
    return Math.max(.06, preference + rarity + Math.min(recency / 48, .8) + freshness);
  });
  let r = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) {
    r -= weights[i];
    if (r <= 0) return pool[i];
  }
  return pool.at(-1);
}

function chooseMoment() {
  const recent = history.slice(-4).flatMap(h => h.ids);
  if (Math.random() < .12 && images.length > 3) {
    const a = weightedPick(recent);
    const b = weightedPick([...recent, a.id]);
    return { type: 'pair', ids: [a.id, b.id] };
  }
  return { type: 'single', ids: [weightedPick(recent).id] };
}

async function renderMoment(moment, { record = true } = {}) {
  finalizeView(false);
  current = moment;
  const firstUrl = await ensureObjectUrl(moment.ids[0]);
  ambientBg.style.backgroundImage = `url("${firstUrl}")`;
  driftMedia.innerHTML = '';
  if (moment.type === 'single') {
    const wrap = document.createElement('div');
    wrap.className = 'single-wrap';
    const img = document.createElement('img');
    img.className = 'drift-image';
    img.alt = '';
    img.draggable = false;
    img.src = firstUrl;
    const meta = imageById(moment.ids[0]);
    if (meta?.width && meta?.height) {
      const ratio = meta.width / meta.height;
      const screen = innerWidth / innerHeight;
      if (Math.abs(Math.log(ratio / screen)) > .55) img.classList.add('contained');
    }
    wrap.append(img);
    driftMedia.append(wrap);
    counter.textContent = 'single';
  } else {
    const urls = await Promise.all(moment.ids.map(ensureObjectUrl));
    const wrap = document.createElement('div');
    wrap.className = 'pair-wrap';
    moment.ids.forEach((id, idx) => {
      const pane = document.createElement('div');
      pane.className = 'pair-pane';
      const img = document.createElement('img');
      img.src = urls[idx];
      img.alt = '';
      img.draggable = false;
      pane.append(img);
      wrap.append(pane);
    });
    driftMedia.append(wrap);
    counter.textContent = 'pair';
  }
  if (record) moment.ids.forEach(id => store.add({ type: 'view', imageIds: [id], ms: 0, mode: 'drift' }));
  viewStarted = Date.now();
  scheduleAdvance();
  requestWake();
}
function pushNext() {
  const m = chooseMoment();
  history = history.slice(0, historyIndex + 1);
  history.push(m);
  historyIndex = history.length - 1;
  renderMoment(m);
}
function goPrev() { if (historyIndex > 0) { historyIndex--; renderMoment(history[historyIndex]); } }
function goNext() { if (historyIndex < history.length - 1) { historyIndex++; renderMoment(history[historyIndex]); } else pushNext(); }
function finalizeView(quick) {
  if (!viewStarted || !current.ids.length) return;
  const ms = Date.now() - viewStarted;
  current.ids.forEach(id => store.add({ type: 'view', imageIds: [id], ms, mode: 'drift-end' }));
  if (quick || ms < 1600) current.ids.forEach(id => store.add({ type: 'skip', imageIds: [id], ms }));
  viewStarted = 0;
}
function vote(dir) {
  if (!current.ids.length) return;
  const pair = current.type === 'pair';
  if (pair) store.add({ type: `pair-${dir}`, imageIds: [...current.ids], pairKey: [...current.ids].sort().join('|') });
  else store.add({ type: dir, imageIds: [current.ids[0]] });
  flashVote(dir);
  showToast(dir === 'up' ? 'Upvoted · saved locally' : 'Downvoted · saved locally');
  setTimeout(goNext, 220);
}
function flashVote(dir) {
  voteFlash.textContent = dir === 'up' ? '↑' : '↓';
  voteFlash.className = 'vote-flash show';
  setTimeout(() => voteFlash.className = 'vote-flash', 680);
}
function scheduleAdvance() {
  clearTimeout(advanceTimer);
  const delay = 7000 + Math.random() * 5000;
  advanceTimer = setTimeout(() => { finalizeView(false); goNext(); }, delay);
}
function showChrome() {
  driftChrome.classList.toggle('visible');
  driftHint.classList.add('hide');
  clearTimeout(chromeTimer);
  if (driftChrome.classList.contains('visible')) chromeTimer = setTimeout(() => driftChrome.classList.remove('visible'), 3500);
}
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast.t);
  showToast.t = setTimeout(() => toast.classList.remove('show'), 1500);
}
async function requestWake() {
  try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch {}
}

let pointerStart = null;
driftStage.addEventListener('pointerdown', e => { if (!initializedGallery) return; pointerStart = { x: e.clientX, y: e.clientY, t: Date.now() }; });
driftStage.addEventListener('pointerup', e => {
  if (!pointerStart) return;
  const dx = e.clientX - pointerStart.x;
  const dy = e.clientY - pointerStart.y;
  const dt = Date.now() - pointerStart.t;
  pointerStart = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) { showChrome(); scheduleAdvance(); return; }
  if (Math.abs(dy) > Math.abs(dx) * 1.15 && Math.abs(dy) > 52) { vote(dy < 0 ? 'up' : 'down'); return; }
  if (Math.abs(dx) > 52) { finalizeView(dt < 500); dx < 0 ? goNext() : goPrev(); }
});
$('#upBtn').onclick = () => vote('up');
$('#downBtn').onclick = () => vote('down');
$('#focusBtn').onclick = () => current.ids[0] && openFocus(current.ids[0]);

function confidenceScore(s) {
  const up = s.directUp + s.pairUp * .35;
  const down = s.directDown + s.pairDown * .35;
  const n = up + down;
  if (!n) return s.score;
  const p = up / n;
  const z = 1.2816;
  const lower = (p + z*z/(2*n) - z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)) / (1 + z*z/n);
  return lower * Math.log2(n + 2) + s.score * .03;
}
function renderBrowse() {
  if (!initializedGallery) return;
  let arr = [...images];
  const key = sortSelect.value;
  const stat = i => store.stats(i.id);
  if (key === 'newest') arr.sort((a,b) => b.addedAt-a.addedAt);
  if (key === 'oldest') arr.sort((a,b) => a.addedAt-b.addedAt);
  if (key === 'score') arr.sort((a,b) => confidenceScore(stat(b))-confidenceScore(stat(a)));
  if (key === 'upvotes') arr.sort((a,b) => stat(b).directUp-stat(a).directUp);
  if (key === 'downvotes') arr.sort((a,b) => stat(b).directDown-stat(a).directDown);
  if (key === 'views') arr.sort((a,b) => stat(b).views-stat(a).views);
  if (key === 'leastViews' || key === 'rare') arr.sort((a,b) => stat(a).views-stat(b).views);
  if (key === 'recent') arr.sort((a,b) => stat(b).lastView-stat(a).lastView);
  if (key === 'random') arr.sort(() => Math.random()-.5);
  browseGrid.innerHTML = '';
  browseObserver?.disconnect();
  browseObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      browseObserver.unobserve(img);
      ensureObjectUrl(img.dataset.id).then(url => { img.src = url; img.classList.add('loaded'); }).catch(() => {});
    });
  }, { root: $('#browseView'), rootMargin: '320px 0px' });
  arr.forEach(img => {
    const s = stat(img);
    const tile = document.createElement('button');
    tile.className = 'tile';
    const ratio = img.width && img.height ? Math.max(.72, Math.min(1.65, img.height / img.width)) : 1.22;
    tile.innerHTML = `<div class="tile-placeholder" style="aspect-ratio:1/${ratio}"><img data-id="${img.id}" alt=""></div><div class="tile-meta"><span>↑ ${s.directUp}</span><span>${s.views} views</span></div>`;
    tile.onclick = () => openFocus(img.id);
    browseGrid.append(tile);
    browseObserver.observe(tile.querySelector('img'));
  });
}
sortSelect.onchange = renderBrowse;

document.querySelectorAll('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const v = btn.dataset.view;
  $('#driftView').classList.toggle('active', v === 'drift');
  $('#browseView').classList.toggle('active', v === 'browse');
  if (v === 'browse') { finalizeView(false); clearTimeout(advanceTimer); renderBrowse(); }
  else { viewStarted = Date.now(); scheduleAdvance(); }
}));

const overlay = $('#focusOverlay');
const focusImage = $('#focusImage');
const focusCanvas = $('#focusCanvas');
const focusBackdrop = $('#focusBackdrop');
let focusId = null, scale = 1, tx = 0, ty = 0, pointers = new Map(), pinchStart = null;
function applyTransform() { focusImage.style.transform = `translate3d(${tx}px,${ty}px,0) scale(${scale})`; }
function resetFocus() { scale = 1; tx = ty = 0; applyTransform(); }
async function openFocus(id) {
  focusId = id;
  const url = await ensureObjectUrl(id);
  focusImage.src = url;
  focusBackdrop.style.backgroundImage = `url("${url}")`;
  resetFocus();
  overlay.classList.add('open');
  overlay.setAttribute('aria-hidden', 'false');
  store.add({ type: 'view', imageIds: [id], ms: 0, mode: 'focus' });
}
function closeFocus() {
  overlay.classList.remove('open');
  overlay.setAttribute('aria-hidden', 'true');
  focusId = null;
  pointers.clear();
  if ($('#browseView').classList.contains('active')) renderBrowse();
}
$('#focusClose').onclick = closeFocus;
$('#focusReset').onclick = resetFocus;
$('#focusUp').onclick = () => { if (focusId) { store.add({ type: 'up', imageIds: [focusId], mode: 'focus' }); showToast('Upvoted'); } };
$('#focusDown').onclick = () => { if (focusId) { store.add({ type: 'down', imageIds: [focusId], mode: 'focus' }); showToast('Downvoted'); } };
focusCanvas.addEventListener('pointerdown', e => {
  focusCanvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, px: e.clientX, py: e.clientY });
  if (pointers.size === 2) {
    const [a,b] = [...pointers.values()];
    pinchStart = { dist: Math.hypot(a.x-b.x, a.y-b.y), scale };
  }
});
focusCanvas.addEventListener('pointermove', e => {
  if (!pointers.has(e.pointerId)) return;
  const p = pointers.get(e.pointerId);
  p.px = p.x; p.py = p.y; p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 1 && scale > 1) { tx += p.x-p.px; ty += p.y-p.py; applyTransform(); }
  else if (pointers.size === 2) {
    const [a,b] = [...pointers.values()];
    const d = Math.hypot(a.x-b.x, a.y-b.y);
    scale = Math.max(1, Math.min(5, pinchStart.scale * (d / pinchStart.dist)));
    applyTransform();
  }
});
['pointerup','pointercancel'].forEach(type => focusCanvas.addEventListener(type, e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinchStart = null; }));
let lastTap = 0;
focusCanvas.addEventListener('click', () => {
  const t = Date.now();
  if (t-lastTap < 300) { scale = scale > 1 ? 1 : 2; tx = ty = 0; applyTransform(); }
  lastTap = t;
});

$('#exitBtn').onclick = () => $('#neutralScreen').classList.add('open');
$('#returnBtn').onclick = () => $('#neutralScreen').classList.remove('open');
$('#brandBtn').onclick = () => $('#neutralScreen').classList.add('open');

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { clearTimeout(advanceTimer); finalizeView(false); }
  else if ($('#driftView').classList.contains('active') && initializedGallery) { viewStarted = Date.now(); scheduleAdvance(); }
});

function initGallery() {
  if (!images.length) return;
  initializedGallery = true;
  history = [chooseMoment()];
  historyIndex = 0;
  renderMoment(history[0]);
  renderBrowse();
  showToast(`${images.length} images · Drive connected`);
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

onAuthStateChanged(auth, async user => {
  if (!user || !tokenProbablyFresh()) {
    authGate.classList.add('open');
    setAuthMessage('Private collection', 'Connect the Google account that owns the Drive folder.', user ? 'Drive permission needs refreshing.' : 'Images stay in Google Drive; votes stay on this device.');
    return;
  }
  await syncDrive({ initial: true });
});
