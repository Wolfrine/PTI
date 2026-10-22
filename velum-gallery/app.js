import { chooseFeedImage, reconcileDiscovery } from './feed.mjs';
import { affectionScore, totalAffectionMs, isQuickSkip } from './affection.mjs';
import { createHeartEffects } from './heart-effects.mjs';
import { createDriftGestures } from './drift-gestures.mjs';
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
const ambientLayers = [...ambientBg.querySelectorAll('.ambient-layer')];
let ambientActive = -1;
function showAmbient(url) {
  if (!url || ambientLayers.length !== 2) return;
  const next = ambientActive === 0 ? 1 : 0;
  ambientLayers[next].style.backgroundImage = `url("${url}")`;
  ambientLayers[next].classList.add('active');
  if (ambientActive >= 0) ambientLayers[ambientActive].classList.remove('active');
  ambientActive = next;
}
// Capture a tiny first-frame poster locally; no second private Drive download.
function setVideoAmbient(video, id, serial) {
  const paint = () => {
    if (serial !== renderSerial || current.ids[0] !== id || !video.isConnected) return;
    if (!video.videoWidth || !video.videoHeight) return;
    try {
      const thumbnail = document.createElement('canvas');
      const ratio = video.videoWidth / video.videoHeight;
      thumbnail.width = ratio >= 1 ? 192 : Math.max(64, Math.round(192 * ratio));
      thumbnail.height = ratio >= 1 ? Math.max(64, Math.round(192 / ratio)) : 192;
      const ctx = thumbnail.getContext('2d', { willReadFrequently: false });
      ctx.drawImage(video, 0, 0, thumbnail.width, thumbnail.height);
      showAmbient(thumbnail.toDataURL('image/jpeg', .7));
      thumbnail.width = thumbnail.height = 0;
    } catch (error) {
      console.warn('Video poster preview not available', error);
    }
  };
  if (video.readyState >= 2) paint();
  else video.addEventListener('loadeddata', paint, { once: true });
}

const driftStage = $('#driftStage');
const heartField = $('#heartField');
const toast = $('#toast');
const browseGrid = $('#browseGrid');
const sortSelect = $('#sortSelect');

let accessToken = sessionStorage.getItem('velum-drive-token') || '';
let tokenIssuedAt = Number(sessionStorage.getItem('velum-drive-token-at') || 0);
let images = [];
let imageMap = new Map();
const DISCOVERY_KEY = 'velum-feed-discovery-v1';
let discovered = {};
try { discovered = JSON.parse(localStorage.getItem(DISCOVERY_KEY) || '{}') || {}; } catch {}
function rememberDiscovery(items) {
  discovered = reconcileDiscovery(items, discovered);
  try { localStorage.setItem(DISCOVERY_KEY, JSON.stringify(discovered)); } catch {}
}
let objectUrls = new Map();
const MEDIA_CACHE_LIMIT = 40;
const MEDIA_CACHE_MAX_BYTES = 256 * 1024 * 1024;
let current = { type: 'single', ids: [] };
let history = [];
let historyIndex = -1;
let viewStarted = 0;
let wakeLock = null;
let browseObserver = null;
let initializedGallery = false;
let renderSerial = 0;

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
    // Old Drift builds recorded BOTH an opening event and a closing event.
    // Count only completed Drift views; Focus views remain one event each.
    const views = ev.filter(e => e.type === 'view' && e.mode !== 'drift');
    // Preserve historical votes, but do not punish the old falsely long "skip" events.
    const skips = ev.filter(isQuickSkip).length;
    const affectionEvents = ev.filter(e => e.type === 'affection');
    const affectionHolds = affectionEvents.length;
    const affectionDurationMs = totalAffectionMs(affectionEvents);
    const affectionWeight = affectionScore(affectionEvents);
    const lastView = views.length ? Math.max(...views.map(e => e.at)) : 0;
    const dwell = views.reduce((s, e) => s + (e.ms || 0), 0);
    const score = Math.min(15, directUp * 3) - directDown * 2.8 +
      pairUp * .7 - pairDown * .65 + affectionWeight +
      Math.min(dwell / 15000, 2) - skips * .18;
    return { directUp, directDown, pairUp, pairDown, views: views.length,
      lastView, dwell, skips, affectionHolds, affectionDurationMs, affectionWeight, score };
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
  const fields = 'nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,size,thumbnailLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))';
  const q = `'${PRIVATE_FOLDER_ID}' in parents and trashed=false`;
  const all = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ q, spaces: 'drive', pageSize: '1000', fields, orderBy: 'createdTime desc' });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await driveFetch(`${DRIVE_API}/files?${params}`);
    const data = await response.json();
    all.push(...(data.files || []).filter(f =>
      f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/')
    ));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return all.map(file => {
    const kind = file.mimeType?.startsWith('video/')
      ? 'video'
      : file.mimeType === 'image/gif'
        ? 'gif'
        : 'image';
    const mediaMeta = kind === 'video' ? file.videoMediaMetadata : file.imageMediaMetadata;
    return {
      id: file.id,
      name: file.name,
      mimeType: file.mimeType,
      kind,
      addedAt: Date.parse(file.createdTime || file.modifiedTime || new Date().toISOString()),
      modifiedAt: Date.parse(file.modifiedTime || file.createdTime || new Date().toISOString()),
      width: mediaMeta?.width || 0,
      height: mediaMeta?.height || 0,
      durationMs: Number(file.videoMediaMetadata?.durationMillis || 0),
      size: Number(file.size || 0),
      thumbnailLink: file.thumbnailLink || ''
    };
  });
}

async function syncDrive({ initial = false } = {}) {
  syncBtn.disabled = true;
  syncLabel.textContent = 'Syncing';
  if (initial) {
    authGate.classList.add('open');
    setAuthMessage('Opening collection', 'Reading media metadata from your Private Google Drive folder.', 'Media remains in Google Drive.');
  }
  try {
    const next = await listPrivateImages();
    if (!next.length) throw new Error('No supported images, GIFs, or videos were found in the configured Private folder, or this account cannot access it.');
    images = next;
    imageMap = new Map(images.map(i => [i.id, i]));
    rememberDiscovery(images);
    authGate.classList.remove('open');
    if (!initializedGallery) initGallery();
    else {
      renderBrowse();
      showToast(`${images.length} media synced`);
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

function protectedMediaIds() {
  const protectedIds = new Set(current.ids || []);
  document.querySelectorAll('[data-full-media-id]').forEach(el => {
    if (el.dataset.fullMediaId) protectedIds.add(el.dataset.fullMediaId);
  });
  return protectedIds;
}

function trimMediaCache() {
  const protectedIds = protectedMediaIds();
  let totalBytes = [...objectUrls.values()].reduce((sum, entry) => sum + (entry.bytes || 0), 0);
  if (objectUrls.size <= MEDIA_CACHE_LIMIT && totalBytes <= MEDIA_CACHE_MAX_BYTES) return;

  const candidates = [...objectUrls.entries()]
    .filter(([id]) => !protectedIds.has(id))
    .sort((a, b) => (a[1].lastUsed || 0) - (b[1].lastUsed || 0));

  for (const [id, entry] of candidates) {
    if (objectUrls.size <= MEDIA_CACHE_LIMIT && totalBytes <= MEDIA_CACHE_MAX_BYTES) break;
    URL.revokeObjectURL(entry.url);
    objectUrls.delete(id);
    totalBytes -= entry.bytes || 0;
  }
}

async function ensureObjectUrl(id) {
  const cached = objectUrls.get(id);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.url;
  }
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  objectUrls.set(id, { url, bytes: blob.size || 0, lastUsed: Date.now() });
  trimMediaCache();
  return url;
}

function revokeObjectUrls() {
  for (const entry of objectUrls.values()) URL.revokeObjectURL(entry.url);
  objectUrls.clear();
}

window.__velumCacheSnapshot = () => ({
  fullMediaItems: objectUrls.size,
  fullMediaBytes: [...objectUrls.values()].reduce((sum, entry) => sum + (entry.bytes || 0), 0),
  itemLimit: MEDIA_CACHE_LIMIT,
  byteLimit: MEDIA_CACHE_MAX_BYTES
});

function imageById(id) { return imageMap.get(id); }
function isVideoMedia(item) { return item?.kind === 'video'; }
function isGifMedia(item) { return item?.kind === 'gif'; }
function currentMediaItem() { return current.ids.length ? imageById(current.ids[0]) : null; }

function chooseMoment() {
  // Build an exposure-aware feed; recent picks are excluded where possible.
  const recentIds = history.slice(-6).flatMap(h => h.ids);
  const item = chooseFeedImage(images, {
    getStats: id => store.stats(id),
    discovered,
    recentIds
  });
  return { type: 'single', ids: [item.id] };
}

async function renderMoment(moment, { record = true } = {}) {
  finalizeView(false);
  const id = moment.ids[0];
  const meta = imageById(id);
  if (!meta) return;
  current = { type: 'single', ids: [id] };
  const serial = ++renderSerial;

  window.__velumInteraction?.clearAdvance?.();
  driftMedia.querySelectorAll('video').forEach(video => video.pause());
  const firstUrl = await ensureObjectUrl(id);
  if (serial !== renderSerial) return;

  driftMedia.innerHTML = '';
  const wrap = document.createElement('div');
  wrap.className = 'single-wrap';

  if (isVideoMedia(meta)) {
    const video = document.createElement('video');
    video.className = 'drift-video';
    video.dataset.fullMediaId = id;
    video.src = firstUrl;
    video.muted = true;
    video.autoplay = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.controls = false;
    video.disablePictureInPicture = true;
    video.setAttribute('aria-label', 'Private gallery video');
    video.addEventListener('playing', () => {
      store.add({ type: 'interaction', action: 'drift-video-play', imageIds: [id] });
    }, { once: true });
    video.addEventListener('ended', () => {
      if (current.ids[0] !== id || !driftMedia.contains(video)) return;
      store.add({ type: 'interaction', action: 'drift-video-complete', imageIds: [id] });
      finalizeView(false);
      goNext();
    }, { once: true });
    wrap.append(video);
    driftMedia.append(wrap);
    setVideoAmbient(video, id, serial);
    video.play().catch(() => window.__velumInteraction?.showControls?.());
  } else {
    showAmbient(firstUrl);
    const img = document.createElement('img');
    img.className = 'drift-image';
    img.dataset.fullMediaId = id;
    if (isGifMedia(meta)) img.classList.add('drift-gif');
    img.alt = '';
    img.draggable = false;
    img.src = firstUrl;
    if (meta.width && meta.height) {
      const ratio = meta.width / meta.height;
      const screen = innerWidth / innerHeight;
      if (Math.abs(Math.log(ratio / screen)) > .55) img.classList.add('contained');
    }
    wrap.append(img);
    driftMedia.append(wrap);
  }

  gestures.reset();
  heartEffects.reset();
  trimMediaCache();
  if (record) store.add({ type: 'impression', imageIds: [id], ms: 0, mode: 'drift' });
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
  if (ms < 1600) current.ids.forEach(id => store.add({ type: 'skip', imageIds: [id], ms }));
  viewStarted = 0;
}
function scheduleAdvance() {
  window.__velumInteraction?.clearAdvance?.();
  if (isVideoMedia(currentMediaItem())) return;
  window.__velumInteraction?.scheduleAdvance?.(() => goNext());
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

// A single gesture owner handles both fitted navigation and zoomed inspection.
driftStage.addEventListener('contextmenu', event => {
  if (!event.target?.closest?.('button,a,select,input,textarea')) event.preventDefault();
});
const heartEffects = createHeartEffects({
  stage: driftStage,
  field: heartField,
  reducedMotion: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false
});
let heldMediaId = null;
let holdPausedVideo = null;
function resumeHeldVideo() {
  const video = holdPausedVideo;
  holdPausedVideo = null;
  if (video?.isConnected && current.ids[0] === video.dataset.fullMediaId &&
      $('#driftView').classList.contains('active') && !document.hidden)
    video.play().catch(() => {});
}
function cancelHeart() {
  heldMediaId = null;
  heartEffects.cancel();
  resumeHeldVideo();
}

const gestures = createDriftGestures({
  stage: driftStage,
  getImage: () => driftMedia.querySelector('.drift-image'),
  isActive: () => initializedGallery &&
    $('#driftView').classList.contains('active') &&
    !authGate.classList.contains('open') &&
    !$('#neutralScreen').classList.contains('open'),
  onNext: () => goNext(),
  onPrev: () => goPrev(),
  onHoldStart: ({ x, y }) => {
    // Tie the reaction to the actually displayed image, not a pending Drive fetch.
    heldMediaId = driftMedia.querySelector('[data-full-media-id]')?.dataset.fullMediaId || null;
    if (!heldMediaId) return;
    const video = driftMedia.querySelector('.drift-video');
    holdPausedVideo = video && !video.paused ? video : null;
    holdPausedVideo?.pause();
    heartEffects.start({ x, y });
  },
  onHoldProgress: detail => {
    if (heldMediaId) heartEffects.progress(detail);
  },
  onHoldEnd: detail => {
    const id = heldMediaId;
    heldMediaId = null;
    if (id && current.ids[0] === id) {
      // One real duration per deliberate hold; older 1–5 events stay untouched.
      store.add({ type: 'affection', imageIds: [id],
        ms: detail.durationMs, mode: 'drift' });
      heartEffects.finish(detail);
    } else heartEffects.cancel();
    resumeHeldVideo();
  },
  onHoldCancel: cancelHeart,
  onTap: () => {
    const video = driftMedia.querySelector('.drift-video');
    if (video) {
      // Native transport/sound controls remain accessible without a Focus screen.
      video.controls = true;
      if (video.paused) video.play().catch(() => {});
      else video.pause();
      clearTimeout(video._velumHideControls);
      video._velumHideControls = setTimeout(() => {
        if (!video.paused && video.isConnected) video.controls = false;
      }, 6000);
    }
    window.__velumInteraction?.showControls?.();
  },
  onState: state => window.__velumInteraction?.gestureState?.(state)
});
function confidenceScore(s) {
  const up = s.directUp + s.pairUp * .35;
  const down = s.directDown + s.pairDown * .35;
  const n = up + down;
  if (!n) return s.score;
  const p = up / n;
  const z = 1.2816;
  const lower = (p + z*z/(2*n) - z*Math.sqrt((p*(1-p)+z*z/(4*n))/n)) / (1 + z*z/n);
  return lower * Math.log2(n + 2) + s.score * .35;
}
function renderBrowse() {
  if (!initializedGallery) return;
  let arr = [...images];
  const key = sortSelect.value;
  const stat = i => store.stats(i.id);
  if (key === 'newest') arr.sort((a,b) => b.addedAt-a.addedAt);
  if (key === 'oldest') arr.sort((a,b) => a.addedAt-b.addedAt);
  if (key === 'score') arr.sort((a,b) => confidenceScore(stat(b))-confidenceScore(stat(a)));
  if (key === 'love') arr.sort((a,b) =>
    (stat(b).affectionWeight + 3 * stat(b).directUp) -
    (stat(a).affectionWeight + 3 * stat(a).directUp));
  if (key === 'views') arr.sort((a,b) => stat(b).views-stat(a).views);
  if (key === 'leastViews' || key === 'rare') arr.sort((a,b) => stat(a).views-stat(b).views);
  if (key === 'recent') arr.sort((a,b) => stat(b).lastView-stat(a).lastView);
  if (key === 'random') arr.sort(() => Math.random()-.5);

  browseGrid.innerHTML = '';
  browseObserver?.disconnect();
  browseObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const media = entry.target;
      const item = imageById(media.dataset.id);
      if (!item) return;

      if (!entry.isIntersecting) {
        media.dataset.visible = '0';
        media.removeAttribute('src');
        media.classList.remove('loaded');
        delete media.dataset.fullMediaId;
        return;
      }

      media.dataset.visible = '1';
      if (media.getAttribute('src')) return;

      const setPreview = src => {
        if (!media.isConnected || media.dataset.visible !== '1' || !src) return;
        media.src = src;
        media.classList.add('loaded');
      };

      if (item.thumbnailLink) {
        setPreview(item.thumbnailLink);
        return;
      }

      if (isVideoMedia(item)) {
        media.classList.add('no-preview');
        return;
      }

      ensureObjectUrl(item.id).then(url => {
        if (!media.isConnected || media.dataset.visible !== '1') return;
        media.dataset.fullMediaId = item.id;
        setPreview(url);
      }).catch(() => {});
    });
  }, { root: $('#browseView'), rootMargin: '420px 0px' });

  arr.forEach(item => {
    const s = stat(item);
    const tile = document.createElement('button');
    tile.className = `tile tile-${item.kind || 'image'}`;
    const ratio = item.width && item.height ? Math.max(.72, Math.min(1.65, item.height / item.width)) : 1.22;
    const preview = `<img class="tile-media" data-id="${item.id}" alt="">`;
    const badge = isVideoMedia(item)
      ? '<span class="tile-badge video"><svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5z"/></svg>Video</span>'
      : isGifMedia(item)
        ? '<span class="tile-badge gif">GIF</span>'
        : '';
    tile.innerHTML = `<div class="tile-placeholder" style="aspect-ratio:1/${ratio}">${preview}${badge}</div><div class="tile-meta"><span title="Deliberate holds and historical likes">♥ ${s.affectionHolds + s.directUp}</span><span>${(s.affectionDurationMs / 1000).toFixed(s.affectionDurationMs < 10000 ? 1 : 0).replace(/\\.0$/, '')}s held · ${s.views} views</span></div>`;
    tile.onclick = () => openInDrift(item.id);
    browseGrid.append(tile);
    const previewEl = tile.querySelector('[data-id]');
    if (previewEl) browseObserver.observe(previewEl);
  });
}
sortSelect.onchange = renderBrowse;

function activateView(view, { incoming = false } = {}) {
  const browse = view === 'browse';
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.view === view));
  $('#driftView').classList.toggle('active', !browse);
  $('#browseView').classList.toggle('active', browse);
  if (browse) {
    finalizeView(false);
    window.__velumInteraction?.clearAdvance?.();
    driftMedia.querySelector('.drift-video')?.pause();
    gestures.fit();
    renderBrowse();
  } else if (!incoming) {
    gestures.fit();
    viewStarted = Date.now();
    const video = driftMedia.querySelector('.drift-video');
    if (video) video.play().catch(() => {});
    else scheduleAdvance();
  }
}
document.querySelectorAll('.nav-item').forEach(btn =>
  btn.addEventListener('click', () => activateView(btn.dataset.view)));

function openInDrift(id) {
  if (!imageById(id)) return;
  const moment = { type: 'single', ids: [id] };
  history = history.slice(0, historyIndex + 1);
  history.push(moment);
  historyIndex = history.length - 1;
  activateView('drift', { incoming: true });
  renderMoment(moment);
}

$('#exitBtn').onclick = () => $('#neutralScreen').classList.add('open');
$('#returnBtn').onclick = () => $('#neutralScreen').classList.remove('open');
$('#brandBtn').onclick = () => $('#neutralScreen').classList.add('open');

document.addEventListener('visibilitychange', () => {
  const video = driftMedia.querySelector('.drift-video');
  if (document.hidden) {
    window.__velumInteraction?.clearAdvance?.();
    video?.pause();
    finalizeView(false);
  } else if ($('#driftView').classList.contains('active') && initializedGallery) {
    viewStarted = Date.now();
    if (video) video.play().catch(() => {});
    else scheduleAdvance();
  }
});

function initGallery() {
  if (!images.length) return;
  initializedGallery = true;
  history = [chooseMoment()];
  historyIndex = 0;
  renderMoment(history[0]);
  renderBrowse();
  showToast(`${images.length} media · Drive connected`);
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
