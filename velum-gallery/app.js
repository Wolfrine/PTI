import { chooseFeedImage, reconcileDiscovery } from './feed.mjs';
import { affectionScore, totalAffectionMs, isQuickSkip } from './affection.mjs';
import { createHeartEffects } from './heart-effects.mjs';
import { createDriftGestures } from './drift-gestures.mjs';
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
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

const DRIVE_API = 'https://www.googleapis.com/drive/v3';

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
const localModule = relative => {
  const url = new URL(relative, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return import(url.href);
};
const [
  { createStudioDrive, readBoundedImage, createDriveAccess, DRIVE_READ_SCOPE },
  { libraryQuery, libraryFile, PRIVATE_FOLDER_ID, REFERENCES_FOLDER_ID },
  { mountGalleryLibrary },
  { createGoogleDriveTokenRequest, preloadGoogleIdentityServices }
] = await Promise.all([
  localModule('./studio-drive.mjs'),
  localModule('./drive-library.mjs'),
  localModule('./gallery-library-ui.mjs'),
  localModule('./google-drive-token.mjs'),
  setPersistence(auth, browserLocalPersistence).catch(() => {})
]);

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
const browseView = $('#browseView');
const sortSelect = $('#sortSelect');
const BROWSE_PAGE_SIZE = 60;
const browsePagination = document.createElement('div');
browsePagination.className = 'browse-pagination';
browsePagination.hidden = true;
const browseStatus = document.createElement('p');
browseStatus.setAttribute('role', 'status');
const browsePageActions = document.createElement('div');
const browsePrevious = document.createElement('button');
browsePrevious.type = 'button';
browsePrevious.textContent = 'Previous';
browsePrevious.setAttribute('aria-controls', 'browseGrid');
const browseNext = document.createElement('button');
browseNext.type = 'button';
browseNext.setAttribute('aria-controls', 'browseGrid');
browsePageActions.append(browsePrevious, browseNext);
browsePagination.append(browseStatus, browsePageActions);
browseGrid.after(browsePagination);

let galleryEpoch = 0;
let galleryLocked = document.documentElement.dataset.velumLocked !== 'false';
let galleryRevision = 0;
let galleryOwner = auth.currentUser?.uid || '';
const galleryRequests = new Set();
let images = [];
let imageMap = new Map();
const DISCOVERY_KEY = 'velum-feed-discovery-v1';
let discovered = {};
let pendingDiscoveryBase = null;
try { discovered = JSON.parse(localStorage.getItem(DISCOVERY_KEY) || '{}') || {}; } catch {}
function rememberDiscovery(items, { prior = discovered, persist = true } = {}) {
  discovered = reconcileDiscovery(items, prior);
  if (persist) {
    try { localStorage.setItem(DISCOVERY_KEY, JSON.stringify(discovered)); } catch {}
  }
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
let browseState = null;
let browseRenderVersion = 0;
let gallerySync = null;
let galleryRestore = null;
let galleryListingState = 'idle';
let initializedGallery = false;
let connectingDrive = false;
let pendingGalleryView = '';
let renderSerial = 0;
let pendingMediaId = '';
let driftPreferencesOpen = false;
let optionsPausedVideo = null;
let studioMount = null;
let access;
const tokenRequests = createGoogleDriveTokenRequest({
  auth,
  onCancelledResult:result => access.handleCancelledGrant(result)
});
access = createDriveAccess({auth,backend:true,
 requestAccess:scopes => tokenRequests.request(scopes),
 cancelAccessRequest:reason => tokenRequests.cancel(reason),
 onConnectRequired:error => {
   if(galleryLocked)return;
   setAuthMessage('Connect Drive','Use your connected Google account to continue.',error.message);
   if($('#studioView').classList.contains('active'))authGate.classList.add('open');
 },
 signIn:scopes => {
  const provider = new GoogleAuthProvider();
  scopes.forEach(scope => provider.addScope(scope));
  const parameters={include_granted_scopes:'false'};
  if(auth.currentUser?.email)parameters.login_hint=auth.currentUser.email;
  provider.setCustomParameters(parameters);
  const popup = signInWithPopup(auth, provider);
  return popup.then(result => GoogleAuthProvider.credentialFromResult(result));
}});
connectBtn.disabled = true;
void Promise.allSettled([preloadGoogleIdentityServices(), access.ready]).then(() => {
  if(!connectingDrive)connectBtn.disabled = false;
});
const studioDrive = createStudioDrive({auth,access,apiKey:FIREBASE_CONFIG.apiKey,appId:FIREBASE_CONFIG.messagingSenderId,
  reserve: async (job,candidate) => {
    const uid=auth.currentUser?.uid;
    if(uid!=='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2')throw new Error('Owner sign-in is required.');
    const { getFirestore, doc, runTransaction } = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
    if (galleryLocked || auth.currentUser?.uid !== uid) throw new Error('Unlock Velum to save to Drive.');
    const db=getFirestore(app),ref=doc(db,`users/${uid}/velumStudio/workspace/uploads/${job.id}`);
    return runTransaction(db,async tx=>{
      const snapshot=await tx.get(ref);
      if(snapshot.exists()){
        const saved=snapshot.data();
        if(saved.sha256!==job.result.sha256||saved.bytes!==job.result.bytes)throw new Error('Drive reservation does not match the original.');
        return saved.fileId;
      }
      if(!candidate)return null;
      tx.set(ref,{jobId:job.id,fileId:candidate,sha256:job.result.sha256,bytes:job.result.bytes,createdAt:Date.now()});
      return candidate;
    });
  },
});
studioDrive.setGalleryProvider({list:()=>images.filter(item=>item.kind==='image'),current:()=>currentMediaItem(),read:async (id,signal)=>{
  if(imageById(id)?.size>16*1024*1024)throw new Error('Choose a reference smaller than 16 MB.');
  return readDrive(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`,{signal},readBoundedImage);
}});
function openStudio() {
  if (studioMount) return;
  const generation = galleryEpoch;
  const canStart = () => generation === galleryEpoch && !galleryLocked;
  studioMount = localModule('./studio.mjs')
    .then(({ mountStudio }) => canStart() && mountStudio({ app, auth, drive: studioDrive, canStart }))
    .then(controller => { if (!controller) studioMount = null; })
    .catch(() => {
      studioMount = null;
      if (canStart()) $('#studioView').textContent = 'Studio could not load. Reconnect and refresh Velum.';
    });
}
window.addEventListener('velum:lock',clearGallerySession);
window.addEventListener('velum:unlock', () => {
  galleryLocked = false;
  activateView('drift', { incoming: true, awaitingConnection: true });
  void restoreGalleryConnection();
});
window.addEventListener('pagehide',()=>clearGallerySession({clearAccess:false}));
const libraryControls=mountGalleryLibrary({drive:studioDrive,connect:()=>access.connect({management:true}),current:currentMediaItem,getUrl:ensureObjectUrl,getOwner:()=>auth.currentUser?.uid||'',canRead:()=>access.has([DRIVE_READ_SCOPE])&&!galleryLocked,
 onFilter: () => {
   history = [];
   historyIndex = -1;
   clearDriftFrame();
   if (driftActive()) startGalleryMoment();
   renderBrowse();
   if (galleryListingState === 'complete' && !images.some(matchesGalleryFilter)) {
     showToast('No media in this folder. Choose All or Sync.');
   }
 },
 onChanged:({kind,file,id})=>{
   galleryRevision++;
   if(kind==='trash')images=images.filter(item=>item.id!==id);
   else if(file){
     const old=imageMap.get(id);
     const updated={...old,...file};
     updated.kind ||= updated.mimeType?.startsWith('video/')?'video':updated.mimeType==='image/gif'?'gif':'image';
     updated.addedAt ||= Date.now();
     if(old)images=images.map(item=>item.id===id?updated:item);
     else images.push(updated);
   }
   imageMap=new Map(images.map(item=>[item.id,item]));
   if(initializedGallery)renderBrowse({ preservePage: true });
   reconcileGallerySelection();
   notifyStats();
   libraryControls.update();
 }

});

class EventStore {
  constructor() {
    this.db = null;
    this.memory = [];
    this.ready = this.init().catch(() => {});
  }
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
    this.memory = (await this.all()).concat(this.memory);
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
    await this.ready;
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

const statsControl = window.__velumStats?.connect({
  getCollection: () => galleryLocked ? null : { ids: [...imageMap.keys()], state: galleryListingState },
  openMedia: id => openInDrift(id, { fromStats: true })
});
function notifyStats() { statsControl?.update(); }

function readPreference(key, allowed, fallback) {
  try {
    const value = localStorage.getItem(key);
    if (allowed.includes(value)) return value;
  } catch {}
  return fallback;
}

function writePreference(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

const driftModeKey = 'velum-drift-mode';
const intervalKey = 'velum-drift-interval';
const backgroundKey = 'velum-drift-background';
const columnsKey = 'velum-browse-columns';
const modeSelect = $('#driftModeSelect');
const intervalSelect = $('#driftIntervalSelect');
const backgroundSelect = $('#driftBackgroundSelect');
const columnsSelect = $('#browseColumnsSelect');
function setPreference(select, key, fallback, apply = () => {}) {
  select.value = readPreference(key, Array.from(select.options, option => option.value), fallback);
  apply(select.value);
  select.addEventListener('change', () => {
    writePreference(key, select.value);
    apply(select.value);
  });
}
setPreference(modeSelect, driftModeKey, 'adaptive');
setPreference(intervalSelect, intervalKey, '15', value => {
  window.__velumInteraction?.setDuration?.(Number(value) * 1000);
});
setPreference(backgroundSelect, backgroundKey, 'ambient', value => {
  driftStage.classList.toggle('drift-black', value === 'black');
});
setPreference(columnsSelect, columnsKey, 'auto', value => {
  const anchor = visibleBrowseAnchor(browseState);
  browseGrid.dataset.columns = value;
  if (anchor) {
    const tile = [...browseGrid.querySelectorAll('[data-id]')]
      .find(media => media.dataset.id === anchor.id)?.closest('.tile');
    if (tile) browseView.scrollTop += tile.getBoundingClientRect().top - browseView.getBoundingClientRect().top - anchor.offset;
  }
});
window.addEventListener('velum:drift-options', event => {
  driftPreferencesOpen = event.detail.open;
  window.__velumInteraction?.setOptionsOpen?.(driftPreferencesOpen);
  if (driftPreferencesOpen) {
    const video = displayedVideo();
    optionsPausedVideo = video && !video.paused ? video : null;
    optionsPausedVideo?.pause();
  } else {
    const video = optionsPausedVideo;
    optionsPausedVideo = null;
    if (video && video === displayedVideo() && driftActive()) void video.play().catch(() => {});
  }
});

function tokenProbablyFresh() {
  return access.has([DRIVE_READ_SCOPE]);
}

function setAuthMessage(title, copy, status = '') {
  authTitle.textContent = title;
  authCopy.textContent = copy;
  authStatus.textContent = status;
}

async function connectDrive() {
  if(connectingDrive||galleryLocked)return;
  const generation=galleryEpoch;
  connectingDrive=true;
  connectBtn.disabled=true;
  setAuthMessage('Connecting', 'Connect Drive for browsing, fixed-folder moves and Studio saving.', access.mode==='temporary'?'Secure renewal setup is pending. Connecting a temporary session…':'Checking your saved Drive connection…');
  try {
    await access.connect();
    if(generation!==galleryEpoch||galleryLocked)return;
    await syncDrive({initial:true});
    if(generation!==galleryEpoch||galleryLocked)return;
    await libraryControls.resume();
    if(pendingGalleryView&&initializedGallery){
      const view=pendingGalleryView;
      pendingGalleryView='';
      activateView(view);
    }
  } catch(error) {
    if(generation!==galleryEpoch||galleryLocked)return;
    console.error(error);
    const status=error?.code==='auth/unauthorized-domain'
      ? `One-time Firebase setup needed: add ${location.hostname} to Authentication settings, Authorized domains.`
      : error?.message||'Could not connect.';
    setAuthMessage('Connection needed','Reconnect your Google account to open the private collection.',status);
    if(!$('#studioView').classList.contains('active'))authGate.classList.add('open');
    else showToast(status);
  } finally {
    connectingDrive=false;
    connectBtn.disabled=false;
  }
}
connectBtn.addEventListener('click', connectDrive);
$('#openStudioBtn')?.addEventListener('click', async () => {
  if(connectingDrive||galleryLocked)return;
  const generation=galleryEpoch;
  const button = $('#openStudioBtn');
  connectingDrive=true;
  button.disabled = true;
  try {
    await access.connect();
    if(generation!==galleryEpoch||galleryLocked)return;
    activateView('studio');
    authGate.classList.remove('open');
    await libraryControls.resume();
  } catch(error) {
    if(generation!==galleryEpoch||galleryLocked)return;
    setAuthMessage('Studio connection needed','Connect the owner Google account for Studio and its Drive references.',error?.message||'Google authorization was not completed.');
  } finally { connectingDrive=false;button.disabled = false; }
});

async function disconnectDrive(){
  if(signOutBtn.disabled)return;
  signOutBtn.disabled=true;
  try{
    const result=await access.disconnect();
    clearGallerySession();libraryControls.clear();galleryLocked=false;authGate.classList.add('open');
    connectBtn.textContent='Connect Google Drive';
    setAuthMessage('Drive disconnected','Connect Drive when you want access again.',result.revoked?(result.googleRevoked?'Google Drive access was revoked.':'Saved access has been cleared.'):'Local access is cleared. Google revocation is unconfirmed. You can reconnect or retry Disconnect.');
  }catch(error){showToast(error.message||'Disconnect could not be confirmed. Retry when online.');}
  finally{signOutBtn.disabled=false;}
}
signOutBtn.addEventListener('click',disconnectDrive);

syncBtn.addEventListener('click', async () => {
  try{await access.ensure();await syncDrive({initial:false});}
  catch(error){showToast(error.message||'Drive needs a connection.');authGate.classList.add('open');}
});

function clearGallerySession({clearAccess=true}={}){
  galleryLocked=true;
  galleryEpoch++;
  galleryRestore = null;
  gallerySync?.controller.abort();
  gallerySync = null;
  galleryListingState = 'idle';
  if (pendingDiscoveryBase) discovered = pendingDiscoveryBase;
  pendingDiscoveryBase = null;
  syncBtn.disabled = false;
  syncLabel.textContent = 'Sync';
  for(const controller of galleryRequests)controller.abort();
  galleryRequests.clear();
  studioDrive.clear({clearAccess});
  revokeObjectUrls();
  images=[];
  imageMap.clear();
  history=[];
  historyIndex=-1;
  clearDriftFrame({ record: false });
  initializedGallery=false;
  browseObserver?.disconnect();
  browseRenderVersion++;
  browseState = null;
  browseGrid.replaceChildren();
  browseStatus.textContent = '';
  browsePagination.hidden = true;
  statsControl?.clear();
}

async function readDrive(url,options={},parse=response=>response.json()){
  if(galleryLocked)throw new Error('Unlock Velum before opening Drive media.');
  const generation=galleryEpoch,owner=auth.currentUser?.uid;
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  options.signal?.addEventListener('abort',cancel,{once:true});
  if(options.signal?.aborted)controller.abort();
  galleryRequests.add(controller);
  try{
    const response=await access.request(url,{...options,cache:'no-store',signal:controller.signal},[DRIVE_READ_SCOPE]);
    if(!response.ok)throw new Error(`Google Drive request failed (${response.status}). Reconnect or retry.`);
    const value=await parse(response);
    if(generation!==galleryEpoch||galleryLocked||owner!==auth.currentUser?.uid)throw new Error('Velum session changed. Reconnect after unlocking.');
    return value;
  }finally{
    galleryRequests.delete(controller);
    options.signal?.removeEventListener('abort',cancel);
  }
}

async function* listPrivateImages({ signal } = {}) {
  const fields = 'nextPageToken,files(id,name,mimeType,parents,createdTime,modifiedTime,size,thumbnailLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))';
  const q = libraryQuery({imagesOnly:false});
  const all = new Map();
  let pageToken = '';
  do {
    // Open a small first page before reading the rest of the collection.
    const params = new URLSearchParams({ q, spaces: 'drive', pageSize: pageToken ? '500' : '60', fields, orderBy: 'createdTime desc' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await readDrive(`${DRIVE_API}/files?${params}`, { signal });
    for (const file of data.files || []) {
      if (!/^[\w-]{8,160}$/.test(file.id || '') || file.parents?.length !== 1
        || ![PRIVATE_FOLDER_ID, REFERENCES_FOLDER_ID].includes(file.parents[0])
        || (!file.mimeType?.startsWith('image/') && !file.mimeType?.startsWith('video/'))) continue;
      all.set(file.id, galleryMedia(file));
    }
    pageToken = data.nextPageToken || '';
    yield { items: [...all.values()], complete: !pageToken };
  } while (pageToken);
}

function galleryMedia(file) {
  const kind = file.mimeType?.startsWith('video/')
    ? 'video'
    : file.mimeType === 'image/gif' ? 'gif' : 'image';
  const mediaMeta = kind === 'video' ? file.videoMediaMetadata : file.imageMediaMetadata;
  return {
    ...libraryFile(file),
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
}

async function syncDrive({ initial = false } = {}) {
  if(galleryLocked)return false;
  gallerySync?.controller.abort();
  const operation = {
    controller: new AbortController(),
    generation: galleryEpoch,
    revision: galleryRevision,
    owner: auth.currentUser?.uid
  };
  gallerySync = operation;
  galleryListingState = 'loading';
  pendingDiscoveryBase ||= { ...discovered };
  const discoveryBase = pendingDiscoveryBase;
  const progressive = !initializedGallery || !images.length;
  const active = () => gallerySync === operation && operation.generation === galleryEpoch
    && operation.owner === auth.currentUser?.uid && !galleryLocked;
  syncBtn.disabled = true;
  syncLabel.textContent = 'Syncing';
  updateBrowseStatus();
  notifyStats();
  if (initial && !initializedGallery && !$('#studioView').classList.contains('active')) {
    authGate.classList.add('open');
    setAuthMessage('Opening collection', 'Reading Private and References folder metadata.', 'Media remains in Google Drive.');
  }
  try {
    for await (const { items, complete } of listPrivateImages({ signal: operation.controller.signal })) {
      if (!active()) return false;
      if (operation.revision !== galleryRevision) {
        galleryListingState = 'partial';
        showToast('Collection changed. Sync again to finish.');
        return false;
      }
      galleryListingState = complete ? 'complete' : 'loading';
      if (complete && !items.length) {
        clearDriftFrame();
        images = [];
        imageMap.clear();
        history = [];
        historyIndex = -1;
        revokeObjectUrls();
        rememberDiscovery([], { prior: discoveryBase });
        pendingDiscoveryBase = null;
        initializedGallery = true;
        authGate.classList.remove('open');
        renderBrowse();
        if (pendingGalleryView) {
          const view = pendingGalleryView;
          pendingGalleryView = '';
          activateView(view);
        }
        showToast('Private and References are empty.');
        return true;
      }
      // A refresh keeps the current complete snapshot until its replacement is ready.
      if (items.length && (progressive || complete)) {
        images = items;
        imageMap = new Map(images.map(item => [item.id, item]));
        // Partial pages must not prune historic discovery or turn old imports into new media.
        rememberDiscovery(images, { prior: discoveryBase, persist: complete });
        if (complete) pendingDiscoveryBase = null;
        authGate.classList.remove('open');
        if (complete && initializedGallery) reconcileGallerySelection();
        if (!initializedGallery) initGallery();
        else {
          if (!current.ids.length && !pendingMediaId && !history.length) startGalleryMoment();
          renderBrowse({ preservePage: true });
        }
        if (pendingGalleryView) {
          const view = pendingGalleryView;
          pendingGalleryView = '';
          activateView(view);
        }
      }
      updateBrowseStatus();
      if (complete) {
        notifyStats();
        if (driftActive() && !images.some(matchesGalleryFilter)) showToast('No media in this folder. Choose All or Sync.');
        if (!initial) showToast(`${images.length} media synced`);
      }
    }
    return true;
  } catch (error) {
    if (!active()) return false;
    console.error(error);
    galleryListingState = 'partial';
    if (initializedGallery && images.length) {
      showToast('Sync paused. Loaded media stays available.');
      return false;
    }
    if (!$('#studioView').classList.contains('active')) authGate.classList.add('open');
    else showToast('Drive gallery needs reconnecting. Studio is still available.');
    setAuthMessage('Could not open collection', 'Reconnect the Google account that owns the Private Drive folder.', error?.message || 'Drive access failed.');
  } finally {
    operation.controller.abort();
    if (gallerySync === operation) {
      gallerySync = null;
      syncBtn.disabled = false;
      syncLabel.textContent = 'Sync';
      updateBrowseStatus();
      notifyStats();
    }
  }
}

function protectedMediaIds() {
  const protectedIds = new Set(current.ids || []);
  if (pendingMediaId) protectedIds.add(pendingMediaId);
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
  if (galleryLocked) throw new Error('Velum is locked.');
  if (!imageMap.has(id)) throw new Error('This media is no longer in the collection. Sync before opening it.');
  const cached = objectUrls.get(id);
  if (cached) {
    cached.lastUsed = Date.now();
    return cached.url;
  }
  const generation=galleryEpoch;
  const blob=await readDrive(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`,{},response=>response.blob());
  if(generation!==galleryEpoch||galleryLocked)throw new Error('Velum is locked.');
  if (!imageMap.has(id)) throw new Error('This media left the collection while loading.');
  const existing = objectUrls.get(id);
  if (existing) return existing.url;
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
function displayedVideo() { return driftMedia.querySelector('.single-wrap:not(.drift-outgoing) .drift-video'); }
function matchesGalleryFilter(item) {
  const filter = libraryControls.filter;
  return filter === 'all' || item.folderId === (filter === 'private' ? PRIVATE_FOLDER_ID : REFERENCES_FOLDER_ID);
}

function driftActive() {
  return !galleryLocked && !document.hidden &&
    $('#driftView').classList.contains('active') &&
    !authGate.classList.contains('open') &&
    !$('#neutralScreen').classList.contains('open');
}

function clearDriftFrame({ record = true } = {}) {
  if (record) finalizeView(false);
  viewStarted = 0;
  renderSerial++;
  pendingMediaId = '';
  current = { type: 'single', ids: [] };
  window.__velumInteraction?.clearAdvance?.();
  driftMedia.querySelectorAll('video').forEach(video => video.pause());
  driftMedia.replaceChildren();
  ambientLayers.forEach(layer => {
    layer.style.backgroundImage = '';
    layer.classList.remove('active');
  });
  ambientActive = -1;
}

function reconcileGallerySelection() {
  const retained = [];
  let retainedIndex = -1;
  history.forEach((moment, index) => {
    const ids = moment.ids.filter(id => {
      const item = imageMap.get(id);
      return item && (moment.direct || matchesGalleryFilter(item));
    });
    if (!ids.length) return;
    retained.push({ ...moment, ids });
    if (index <= historyIndex) retainedIndex = retained.length - 1;
  });
  history = retained;
  historyIndex = retainedIndex;

  const selected = currentMediaItem();
  if (pendingMediaId && !imageMap.has(pendingMediaId)) {
    renderSerial++;
    pendingMediaId = '';
  }
  if (!selected || (!current.direct && !matchesGalleryFilter(selected))) {
    if (current.ids.length) clearDriftFrame();
    if (!pendingMediaId) startGalleryMoment();
  }
  for (const [id, entry] of objectUrls) {
    if (!imageMap.has(id)) {
      URL.revokeObjectURL(entry.url);
      objectUrls.delete(id);
    }
  }
  libraryControls.update();
}

function chooseMoment({ opening = false } = {}) {
  // Build an exposure-aware feed; recent picks are excluded where possible.
  const recentIds = history.slice(-6).flatMap(h => h.ids);
  let candidates = images.filter(matchesGalleryFilter);
  if (!candidates.length) return null;
  if (opening) {
    const stills = candidates.filter(item => item.kind === 'image');
    if (stills.length) candidates = stills;
    else if (galleryListingState === 'loading') return null;
  }
  const mode = opening ? 'shuffle' : modeSelect.value;
  if (mode === 'unseen') {
    const unseen = candidates.filter(item => store.stats(item.id).views === 0);
    if (unseen.length) candidates = unseen;
  }
  if (mode !== 'adaptive') {
    const fresh = candidates.filter(item => !recentIds.includes(item.id));
    if (fresh.length) candidates = fresh;
    const item = candidates[Math.floor(Math.random() * candidates.length)];
    return { type: 'single', ids: [item.id] };
  }
  const item = chooseFeedImage(candidates, {
    getStats: id => store.stats(id),
    discovered,
    recentIds
  });
  return { type: 'single', ids: [item.id] };
}

async function renderMoment(moment, { record = true } = {}) {
  const id = moment.ids[0];
  const meta = imageById(id);
  if (!meta || !driftActive()) return;
  const generation = galleryEpoch;
  const owner = auth.currentUser?.uid;
  const serial = ++renderSerial;
  const isCurrent = () => serial === renderSerial && generation === galleryEpoch &&
    owner === auth.currentUser?.uid && driftActive() && imageById(id) &&
    (moment.direct || matchesGalleryFilter(imageById(id)));
  pendingMediaId = id;
  window.__velumInteraction?.clearAdvance?.();
  const wrap = document.createElement('div');
  wrap.className = 'single-wrap';
  let firstUrl, video;
  try {
    firstUrl = await ensureObjectUrl(id);
    if (!isCurrent()) return;
    if (isVideoMedia(meta)) {
      video = document.createElement('video');
      video.className = 'drift-video';
      video.dataset.fullMediaId = id;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.disablePictureInPicture = true;
      video.setAttribute('aria-label', 'Private gallery video');
      video.src = firstUrl;
      wrap.append(video);
    } else {
      const img = document.createElement('img');
      img.className = isGifMedia(meta) ? 'drift-image drift-gif' : 'drift-image';
      img.dataset.fullMediaId = id;
      img.alt = '';
      img.draggable = false;
      img.src = firstUrl;
      await img.decode();
      const ratio = img.naturalWidth / img.naturalHeight;
      if (Math.abs(Math.log(ratio / (innerWidth / innerHeight))) > .55) img.classList.add('contained');
      wrap.append(img);
    }
    if (!isCurrent()) return;
  } catch {
    if (isCurrent()) showToast('Could not open this media. Swipe to try another.');
    return;
  } finally {
    if (serial === renderSerial) pendingMediaId = '';
  }

  finalizeView(false);
  gestures.reset();
  heartEffects.reset();
  driftMedia.querySelector('.drift-outgoing')?.remove();
  const outgoing = driftMedia.firstElementChild;
  if (outgoing) {
    outgoing.querySelector('video')?.pause();
    outgoing.classList.remove('drift-arriving');
    outgoing.classList.add('drift-outgoing');
    outgoing.inert = true;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) outgoing.remove();
    else {
      wrap.classList.add('drift-arriving');
      setTimeout(() => outgoing.remove(), 240);
    }
  }
  current = moment;
  driftMedia.prepend(wrap);
  libraryControls.update();
  if (video) {
    video.addEventListener('playing', () => {
      store.add({ type: 'interaction', action: 'drift-video-play', imageIds: [id] });
    }, { once: true });
    video.addEventListener('ended', () => {
      if (current.ids[0] !== id || !driftActive() || pendingMediaId ||
          driftMedia.firstElementChild !== wrap) return;
      store.add({ type: 'interaction', action: 'drift-video-complete', imageIds: [id] });
      finalizeView(false);
      goNext();
    }, { once: true });
    setVideoAmbient(video, id, serial);
    video.play().catch(() => window.__velumInteraction?.showControls?.());
  } else {
    showAmbient(firstUrl);
    markFirstImage(wrap, isCurrent);
  }

  trimMediaCache();
  if (record) store.add({ type: 'impression', imageIds: [id], ms: 0, mode: 'drift' });
  viewStarted = Date.now();
  scheduleAdvance();
  requestWake();
}
function markFirstImage(frame, isCurrent) {
  if (!performance.getEntriesByName('velum:pin-accepted').length ||
      performance.getEntriesByName('velum:pin-to-drift').length) return;
  const opening = performance.getEntriesByName('velum:pin-accepted').at(-1).startTime;
  const gateAnimations = authGate.getAnimations().map(animation => animation.finished);
  void Promise.allSettled(gateAnimations).then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!isCurrent() || !frame.isConnected ||
          performance.getEntriesByName('velum:pin-accepted').at(-1)?.startTime !== opening) return;
      performance.measure('velum:pin-to-drift', 'velum:pin-submitted');
    }));
  });
}
function pushNext() {
  const m = chooseMoment();
  if(!m)return;
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
  getImage: () => driftMedia.querySelector('.single-wrap:not(.drift-outgoing) .drift-image'),
  isActive: () => initializedGallery && driftActive() && !driftPreferencesOpen,
  onNext: () => goNext(),
  onPrev: () => goPrev(),
  onHoldStart: ({ x, y }) => {
    // Tie the reaction to the actually displayed image, not a pending Drive fetch.
    heldMediaId = driftMedia.querySelector('[data-full-media-id]')?.dataset.fullMediaId || null;
    if (!heldMediaId) return;
    const video = displayedVideo();
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
    const video = displayedVideo();
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
function browseActive(state) {
  return state && browseState === state && state.version === browseRenderVersion
    && state.generation === galleryEpoch && state.owner === auth.currentUser?.uid
    && !galleryLocked && browseView.classList.contains('active');
}

function visibleBrowseAnchor(state) {
  if (!browseActive(state)) return null;
  const viewport = browseView.getBoundingClientRect();
  for (const media of browseGrid.querySelectorAll('[data-id]')) {
    const tile = media.closest('.tile');
    const rect = tile.getBoundingClientRect();
    if (rect.bottom > viewport.top && rect.top < viewport.bottom) {
      return { id: media.dataset.id, offset: rect.top - viewport.top };
    }
  }
  return null;
}

function updateBrowseStatus() {
  const state = browseState;
  if (!browseActive(state)) return;
  const total = state.items.length;
  const start = state.page * BROWSE_PAGE_SIZE;
  const end = Math.min(start + BROWSE_PAGE_SIZE, total);
  const folder = libraryControls.filter === 'all' ? '' : ` in ${libraryControls.filter === 'private' ? 'Private' : 'References'}`;
  const scope = galleryListingState === 'complete' ? 'media' : 'loaded media';
  const progress = galleryListingState === 'loading' ? ' · Reading more from Drive…'
    : galleryListingState === 'partial' ? ' · Sync paused; use Sync to finish.' : '';
  browseStatus.textContent = total
    ? `${start + 1}–${end} of ${total} ${scope}${folder}${progress}`
    : `No media${folder}${galleryListingState === 'complete' ? '.' : ' loaded yet.'}${progress}`;
  browsePrevious.disabled = state.page === 0;
  browseNext.disabled = end >= total;
  browseNext.textContent = end < total ? 'Next 60'
    : galleryListingState === 'loading' ? 'Reading more…'
    : galleryListingState === 'partial' ? 'End of loaded media' : 'End of collection';
  browsePageActions.hidden = !total;
  browsePagination.hidden = false;
}

function renderBrowse({ preservePage = false } = {}) {
  // Drift startup does not pay for hidden Browse tiles or their event-history reads.
  if (!initializedGallery || galleryLocked || !browseView.classList.contains('active')) return;
  const prior = browseState;
  const visibleAnchor = preservePage ? visibleBrowseAnchor(prior) : null;
  const arr = images.filter(matchesGalleryFilter);
  const key = sortSelect.value;
  const stats = new Map();
  const stat = item => {
    if (!stats.has(item.id)) stats.set(item.id, store.stats(item.id));
    return stats.get(item.id);
  };
  if (key === 'newest') arr.sort((a,b) => b.addedAt-a.addedAt);
  if (key === 'oldest') arr.sort((a,b) => a.addedAt-b.addedAt);
  if (key === 'score') arr.sort((a,b) => confidenceScore(stat(b))-confidenceScore(stat(a)));
  if (key === 'love') arr.sort((a,b) =>
    (stat(b).affectionWeight + 3 * stat(b).directUp) -
    (stat(a).affectionWeight + 3 * stat(a).directUp));
  if (key === 'views') arr.sort((a,b) => stat(b).views-stat(a).views);
  if (key === 'leastViews' || key === 'rare') arr.sort((a,b) => stat(a).views-stat(b).views);
  if (key === 'recent') arr.sort((a,b) => stat(b).lastView-stat(a).lastView);
  // Keep an existing random order stable as later Drive pages arrive.
  const randomRanks = preservePage && prior?.sort === 'random' ? new Map(prior.randomRanks) : new Map();
  if (key === 'random') {
    for (const item of arr) if (!randomRanks.has(item.id)) randomRanks.set(item.id, Math.random());
    arr.sort((a,b) => randomRanks.get(a.id) - randomRanks.get(b.id));
  }
  let page = preservePage
    ? Math.min(prior?.page || 0, Math.max(0, Math.ceil(arr.length / BROWSE_PAGE_SIZE) - 1)) : 0;
  let restoreAnchor = null;
  if (preservePage && prior) {
    const positions = new Map(arr.map((item, index) => [item.id, index]));
    const visibleIndex = visibleAnchor ? prior.items.findIndex(item => item.id === visibleAnchor.id) : -1;
    const start = visibleIndex >= 0 ? visibleIndex : prior.page * BROWSE_PAGE_SIZE;
    // A moved or removed first item falls back to the nearest surviving neighbor.
    for (let distance = 0; distance < prior.items.length; distance++) {
      const following = prior.items[start + distance];
      const preceding = distance ? prior.items[start - distance] : null;
      const anchorIndex = positions.get(following?.id) ?? positions.get(preceding?.id);
      if (anchorIndex !== undefined) {
        page = Math.floor(anchorIndex / BROWSE_PAGE_SIZE);
        if (visibleAnchor) restoreAnchor = { id: arr[anchorIndex].id, offset: visibleAnchor.offset };
        break;
      }
    }
  }
  browseState = {
    items: arr, stat, page, sort: key, randomRanks,
    generation: galleryEpoch, owner: auth.currentUser?.uid, version: ++browseRenderVersion
  };
  renderBrowsePage({ restoreAnchor });
  if (!preservePage) browseView.scrollTop = 0;
}

function renderBrowsePage({ restoreAnchor = null } = {}) {
  const state = browseState;
  if (!browseActive(state)) return;
  const pageItems = state.items.slice(state.page * BROWSE_PAGE_SIZE, (state.page + 1) * BROWSE_PAGE_SIZE);
  let focusedAction = null;
  if (browseGrid.contains(document.activeElement)) {
    const control = document.activeElement.closest('.tile-open, .tile-quick-move');
    const tile = control?.closest('.tile');
    if (tile) {
      focusedAction = {
        id: tile.querySelector('[data-id]')?.dataset.id,
        selector: control.classList.contains('tile-quick-move') ? '.tile-quick-move' : '.tile-open'
      };
    }
  }
  browseGrid.replaceChildren();
  browseObserver?.disconnect();
  browseObserver = new IntersectionObserver(entries => {
    if (!browseActive(state)) return;
    entries.forEach(entry => {
      const media = entry.target;
      const item = imageById(media.dataset.id);
      if (!item || !media.isConnected) return;

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
        if (!browseActive(state) || !media.isConnected || media.dataset.visible !== '1' || !src) return;
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
        if (!browseActive(state) || !media.isConnected || media.dataset.visible !== '1') return;
        media.dataset.fullMediaId = item.id;
        setPreview(url);
      }).catch(() => {});
    });
  }, { root: browseView, rootMargin: '420px 0px' });

  const fragment = document.createDocumentFragment();
  pageItems.forEach(item => {
    const s = state.stat(item);
    const tile = document.createElement('article');
    tile.className = `tile tile-${item.kind || 'image'}`;
    const opener = document.createElement('button');
    opener.type = 'button';
    opener.className = 'tile-open';
    opener.setAttribute('aria-label', `View ${item.name || 'image'} in Drift`);
    const ratio = item.width && item.height ? Math.max(.72, Math.min(1.65, item.height / item.width)) : 1.22;
    const preview = `<img class="tile-media" data-id="${item.id}" alt="">`;
    const badge = isVideoMedia(item)
      ? '<span class="tile-badge video"><svg viewBox="0 0 24 24"><path d="m9 7 8 5-8 5z"/></svg>Video</span>'
      : isGifMedia(item)
        ? '<span class="tile-badge gif">GIF</span>'
        : '';
    opener.innerHTML = `<div class="tile-placeholder" style="aspect-ratio:1/${ratio}">${preview}${badge}<span class="tile-folder">${item.folderLabel||'Private'}</span></div><div class="tile-meta"><span title="Deliberate holds and historical likes">♥ ${s.affectionHolds + s.directUp}</span><span>${(s.affectionDurationMs / 1000).toFixed(s.affectionDurationMs < 10000 ? 1 : 0).replace(/\.0$/, '')}s held · ${s.views} views</span></div>`;
    opener.onclick = () => openInDrift(item.id);
    tile.append(opener);
    if(item.mimeType?.startsWith('image/')&&[PRIVATE_FOLDER_ID,REFERENCES_FOLDER_ID].includes(item.folderId)){
      const destination=item.folderId===REFERENCES_FOLDER_ID?'Private':'References';
      const move=document.createElement('button');
      move.type='button';move.className='tile-quick-move';
      move.setAttribute('aria-label',`Move ${item.name || 'image'} to ${destination}`);
      move.title=`Move to ${destination}`;
      move.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
      move.disabled=libraryControls.busy;
      move.onclick=async event=>{
        event.preventDefault();event.stopPropagation();
        move.classList.add('is-pending');move.setAttribute('aria-busy','true');
        try{await libraryControls.move(item,{focusUndo:event.detail===0});}finally{
          move.classList.remove('is-pending');move.removeAttribute('aria-busy');
        }
      };
      tile.append(move);
    }
    fragment.append(tile);
  });
  browseGrid.append(fragment);
  const previews = [...browseGrid.querySelectorAll('[data-id]')];
  previews.forEach(media => browseObserver.observe(media));
  updateBrowseStatus();
  if (restoreAnchor) {
    const media = previews.find(item => item.dataset.id === restoreAnchor.id);
    if (media) {
      const offset = media.closest('.tile').getBoundingClientRect().top - browseView.getBoundingClientRect().top;
      browseView.scrollTop += offset - restoreAnchor.offset;
    }
  }
  if (focusedAction) {
    const viewport = browseView.getBoundingClientRect();
    const media = previews.find(item => item.dataset.id === focusedAction.id)
      || previews.find(item => item.dataset.id === restoreAnchor?.id)
      || previews.find(item => {
        const rect = item.closest('.tile').getBoundingClientRect();
        return rect.bottom > viewport.top && rect.top < viewport.bottom;
      }) || previews[0];
    const tile = media?.closest('.tile');
    const equivalent = tile?.querySelector(focusedAction.selector);
    const target = equivalent && !equivalent.disabled ? equivalent : tile?.querySelector('.tile-open');
    target?.focus({ preventScroll: true });
  }
}

function changeBrowsePage(delta) {
  const state = browseState;
  if (!browseActive(state)) return;
  const page = state.page + delta;
  if (page < 0 || page * BROWSE_PAGE_SIZE >= state.items.length) return;
  state.page = page;
  renderBrowsePage();
  browseView.scrollTop = 0;
  browseGrid.querySelector('.tile-open')?.focus({ preventScroll: true });
}
browsePrevious.onclick = () => changeBrowsePage(-1);
browseNext.onclick = () => changeBrowsePage(1);
sortSelect.onchange = renderBrowse;

function activateView(view, { incoming = false, awaitingConnection = false } = {}) {
  if (galleryLocked || (view === 'stats' && !auth.currentUser)) return false;
  const browse = view === 'browse';
  const drift = view === 'drift';
  const studio = view === 'studio';
  if (!studio && view !== 'stats' && !awaitingConnection && !initializedGallery && !tokenProbablyFresh()) {
    pendingGalleryView = view;
    authGate.classList.add('open');
    setAuthMessage('Private collection', 'Reconnect Drive to open your gallery.', 'Studio uses your owner sign-in separately.');
    return false;
  }
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.view === view));
  $('#driftView').classList.toggle('active', drift);
  $('#browseView').classList.toggle('active', browse);
  $('#studioView')?.classList.toggle('active', studio);
  $('#statsView')?.classList.toggle('active', view === 'stats');
  if (studio) {
    if (auth.currentUser) authGate.classList.remove('open');
    openStudio();
  }
  if (!drift) {
    renderSerial++;
    pendingMediaId = '';
    finalizeView(false);
    window.__velumInteraction?.clearAdvance?.();
    displayedVideo()?.pause();
    libraryControls.closeOptions();
    gestures.fit();
    if (browse) renderBrowse();
  } else if (!incoming && initializedGallery) {
    gestures.fit();
    resumeDrift();
  }
  if (view === 'stats') notifyStats();
  return true;
}
document.querySelectorAll('.nav-item').forEach(btn =>
  btn.addEventListener('click', () => activateView(btn.dataset.view)));

function openInDrift(id, { fromStats = false } = {}) {
  if (!imageById(id) || galleryLocked || !auth.currentUser) return false;
  if (!activateView('drift', { incoming: true })) return false;
  const moment = { type: 'single', ids: [id], direct: fromStats };
  history = history.slice(0, historyIndex + 1);
  history.push(moment);
  historyIndex = history.length - 1;
  void renderMoment(moment);
  return true;
}

function quickExit(){window.dispatchEvent(new Event('velum:lock'));$('#neutralScreen').classList.add('open');}
window.addEventListener('velum:quick-exit',quickExit);
$('#exitBtn').onclick = quickExit;
$('#returnBtn').onclick = () => $('#neutralScreen').classList.remove('open');
$('#brandBtn').onclick = quickExit;

document.addEventListener('visibilitychange', () => {
  const video = displayedVideo();
  if (document.hidden) {
    window.__velumInteraction?.clearAdvance?.();
    video?.pause();
    finalizeView(false);
  } else if (driftActive() && initializedGallery) {
    if (!pendingMediaId) resumeDrift();
  }
});

function resumeDrift() {
  if (!current.ids.length) {
    const pending = history[historyIndex];
    if (pending && imageById(pending.ids[0])) void renderMoment(pending);
    else startGalleryMoment();
    return;
  }
  viewStarted ||= Date.now();
  const video = displayedVideo();
  if (video && !driftPreferencesOpen) video.play().catch(() => {});
  else scheduleAdvance();
}

function startGalleryMoment() {
  if (!driftActive()) return;
  const moment = chooseMoment({ opening: !history.length });
  if (!moment) return;
  history = [moment];
  historyIndex = 0;
  void renderMoment(moment);
}

function initGallery() {
  if (!images.length) return;
  initializedGallery = true;
  startGalleryMoment();
  renderBrowse();
}

if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

function restoreGalleryConnection(){
  if(galleryLocked||!auth.currentUser)return;
  const generation=galleryEpoch;
  const owner = auth.currentUser.uid;
  if (galleryRestore?.generation === generation && galleryRestore.owner === owner) return galleryRestore.promise;
  const promise = restoreCurrentGallery(generation).finally(() => {
    if (galleryRestore?.promise === promise) galleryRestore = null;
  });
  galleryRestore = { generation, owner, promise };
  return promise;
}

async function restoreCurrentGallery(generation) {
  try{
    await access.restore();
    if(generation!==galleryEpoch||galleryLocked)return;
    if(!tokenProbablyFresh()){
      if(!$('#studioView').classList.contains('active'))authGate.classList.add('open');
      setAuthMessage('Private collection',access.mode==='temporary'?'Secure renewal setup is pending. Connect a temporary Drive session.':'Connect Drive once to enable automatic renewal.','Your Studio sign-in and local PIN are ready.');
      return;
    }
    await syncDrive({initial:true});
    if(generation===galleryEpoch&&!galleryLocked)await libraryControls.resume();
  }catch(error){
    if(generation===galleryEpoch&&!galleryLocked){
      setAuthMessage('Connection needed','Reconnect Drive to open your collection.',error?.message||'Drive needs reconnecting.');
      if(!$('#studioView').classList.contains('active'))authGate.classList.add('open');
    }
  }
}
onAuthStateChanged(auth, async user => {
  const nextOwner=user?.uid||'';
  if(galleryOwner&&galleryOwner!==nextOwner){const wasLocked=galleryLocked;clearGallerySession();libraryControls.clear();galleryLocked=wasLocked;}
  galleryOwner=nextOwner;
  if(connectingDrive||galleryLocked)return;
  if(!user){
    authGate.classList.add('open');
    setAuthMessage('Private collection','Sign in once to connect your Drive collection.','Media stays in Google Drive.');return;
  }
  await restoreGalleryConnection();
});
