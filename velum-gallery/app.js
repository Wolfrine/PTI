import { chooseFeedImage, reconcileDiscovery } from './feed.mjs';
import { affectionScore, totalAffectionMs, isQuickSkip } from './affection.mjs';
import { createHeartEffects } from './heart-effects.mjs';
import { createDriftGestures } from './drift-gestures.mjs';
const studioModule = new URL('./studio.mjs', import.meta.url);
studioModule.search = new URL(import.meta.url).search;
const { mountStudio } = await import(studioModule.href);
const driveModule = new URL('./studio-drive.mjs', import.meta.url);
driveModule.search = new URL(import.meta.url).search;
const { createStudioDrive,readBoundedImage,createDriveAccess,DRIVE_READ_SCOPE } = await import(driveModule.href);
const libraryModule=new URL('./drive-library.mjs',import.meta.url);libraryModule.search=new URL(import.meta.url).search;
const {libraryQuery,libraryFile,PRIVATE_FOLDER_ID,REFERENCES_FOLDER_ID}=await import(libraryModule.href);
const libraryUiModule=new URL('./gallery-library-ui.mjs',import.meta.url);libraryUiModule.search=new URL(import.meta.url).search;
const {mountGalleryLibrary}=await import(libraryUiModule.href);
const tokenModule = new URL('./google-drive-token.mjs', import.meta.url);
tokenModule.search = new URL(import.meta.url).search;
const {createGoogleDriveTokenRequest, preloadGoogleIdentityServices} = await import(tokenModule.href);
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {getFirestore,doc,runTransaction} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

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

let galleryEpoch = 0;
let galleryLocked = false;
let galleryRevision = 0;
let galleryOwner = auth.currentUser?.uid || '';
const galleryRequests = new Set();
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
let connectingDrive = false;
let pendingGalleryView = '';
let renderSerial = 0;
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
  const parameters={include_granted_scopes:'true'};
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
mountStudio({ app, auth, drive:studioDrive }).catch(() => {
  const studio = document.querySelector('#studioView');
  if (studio) studio.textContent = 'Studio could not load. Reconnect and refresh Velum.';
});
window.addEventListener('velum:lock',clearGallerySession);
window.addEventListener('velum:unlock',()=>{galleryLocked=false;void restoreGalleryConnection();});
window.addEventListener('pagehide',()=>clearGallerySession({clearAccess:false}));
window.addEventListener('pageshow',event=>{
  if(!event.persisted)return;
  // A BFCache return must pass the same local PIN gate as an ordinary reload.
  window.dispatchEvent(new CustomEvent('velum:request-unlock'));
});
const libraryControls=mountGalleryLibrary({drive:studioDrive,connect:()=>access.connect(),current:currentMediaItem,getUrl:ensureObjectUrl,getOwner:()=>auth.currentUser?.uid||'',canRead:()=>access.has([DRIVE_READ_SCOPE])&&!galleryLocked,
 onFilter:()=>{history=[];historyIndex=-1;renderBrowse();const next=chooseMoment();if(next){history=[next];historyIndex=0;void renderMoment(next).catch(error=>{if(!galleryLocked)showToast(error.message);});}else{renderSerial++;current={type:'single',ids:[]};window.__velumInteraction?.clearAdvance?.();driftMedia.replaceChildren();showToast('No media in this folder. Choose All or Sync.');}},
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
   if(initializedGallery)renderBrowse();
   const selected=currentMediaItem();
   if(!selected||(libraryControls.filter!=='all'&&selected.folderLabel?.toLowerCase()!==libraryControls.filter)){
     const next=chooseMoment();
     if(next){history=[next];historyIndex=0;void renderMoment(next).catch(error=>showToast(error.message));}
     else{renderSerial++;current={type:'single',ids:[]};driftMedia.replaceChildren();window.__velumInteraction?.clearAdvance?.();}
   }
   libraryControls.update();
 }

});

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
  renderSerial++;
  for(const controller of galleryRequests)controller.abort();
  galleryRequests.clear();
  studioDrive.clear({clearAccess});
  revokeObjectUrls();
  images=[];
  imageMap.clear();
  history=[];
  historyIndex=-1;
  current={type:'single',ids:[]};
  initializedGallery=false;
  browseObserver?.disconnect();
  browseGrid.replaceChildren();
  driftMedia.querySelectorAll('video').forEach(video=>video.pause());
  driftMedia.replaceChildren();
  ambientLayers.forEach(layer=>layer.style.backgroundImage='');
  window.__velumInteraction?.clearAdvance?.();
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
    const response=await access.request(url,{...options,signal:controller.signal},[DRIVE_READ_SCOPE]);
    if(!response.ok)throw new Error(`Google Drive request failed (${response.status}). Reconnect or retry.`);
    const value=await parse(response);
    if(generation!==galleryEpoch||galleryLocked||owner!==auth.currentUser?.uid)throw new Error('Velum session changed. Reconnect after unlocking.');
    return value;
  }finally{
    galleryRequests.delete(controller);
    options.signal?.removeEventListener('abort',cancel);
  }
}

async function listPrivateImages() {
  const fields = 'nextPageToken,files(id,name,mimeType,parents,createdTime,modifiedTime,size,thumbnailLink,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))';
  const q = libraryQuery({imagesOnly:false});
  const all = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ q, spaces: 'drive', pageSize: '1000', fields, orderBy: 'createdTime desc' });
    if (pageToken) params.set('pageToken', pageToken);
    const data = await readDrive(`${DRIVE_API}/files?${params}`);
    all.push(...(data.files || []).filter(f =>
      f.mimeType?.startsWith('image/') || f.mimeType?.startsWith('video/')
    ));
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return [...new Map(all.map(file=>[file.id,file])).values()].map(file => {
    const kind = file.mimeType?.startsWith('video/')
      ? 'video'
      : file.mimeType === 'image/gif'
        ? 'gif'
        : 'image';
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
  });
}

async function syncDrive({ initial = false } = {}) {
  if(galleryLocked)return false;
  const generation=galleryEpoch,revision=galleryRevision;
  syncBtn.disabled = true;
  syncLabel.textContent = 'Syncing';
  if (initial && !$('#studioView').classList.contains('active')) {
    authGate.classList.add('open');
    setAuthMessage('Opening collection', 'Reading Private and References folder metadata.', 'Media remains in Google Drive.');
  }
  try {
    const next = await listPrivateImages();
    if(generation!==galleryEpoch||galleryLocked||revision!==galleryRevision)return false;
    if (!next.length) throw new Error('No supported media found in Private or References. Check folder access or add an image, then Sync.');
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
    if(generation!==galleryEpoch||galleryLocked)return false;
    console.error(error);
    if (!$('#studioView').classList.contains('active')) authGate.classList.add('open');
    else showToast('Drive gallery needs reconnecting. Studio is still available.');
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
  const generation=galleryEpoch;
  const blob=await readDrive(`${DRIVE_API}/files/${encodeURIComponent(id)}?alt=media`,{},response=>response.blob());
  if(generation!==galleryEpoch||galleryLocked)throw new Error('Velum is locked.');
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
  const candidates=libraryControls.filter==='all'?images:images.filter(item=>item.folderLabel.toLowerCase()===libraryControls.filter);
  if(!candidates.length)return null;
  const item = chooseFeedImage(candidates, {
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
  libraryControls.update();
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
  let arr = libraryControls.filter==='all'?[...images]:images.filter(item=>item.folderLabel.toLowerCase()===libraryControls.filter);
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
    browseGrid.append(tile);
    const previewEl = tile.querySelector('[data-id]');
    if (previewEl) browseObserver.observe(previewEl);
  });
}
sortSelect.onchange = renderBrowse;

function activateView(view, { incoming = false } = {}) {
  const browse = view === 'browse';
  const drift = view === 'drift';
  const studio = view === 'studio';
  if (!studio && !initializedGallery && !tokenProbablyFresh()) {
    pendingGalleryView = view;
    authGate.classList.add('open');
    setAuthMessage('Private collection', 'Reconnect Drive to open your gallery.', 'Studio uses your owner sign-in separately.');
    return;
  }
  document.querySelectorAll('.nav-item').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.view === view));
  $('#driftView').classList.toggle('active', drift);
  $('#browseView').classList.toggle('active', browse);
  $('#studioView')?.classList.toggle('active', studio);
  $('#statsView')?.classList.toggle('active', view === 'stats');
  if (studio && auth.currentUser) authGate.classList.remove('open');
  if (!drift) {
    finalizeView(false);
    window.__velumInteraction?.clearAdvance?.();
    driftMedia.querySelector('.drift-video')?.pause();
    gestures.fit();
    if (browse) renderBrowse();
  } else if (!incoming && initializedGallery) {
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

function quickExit(){window.dispatchEvent(new Event('velum:lock'));$('#neutralScreen').classList.add('open');}
window.addEventListener('velum:quick-exit',quickExit);
$('#exitBtn').onclick = quickExit;
$('#returnBtn').onclick = () => $('#neutralScreen').classList.remove('open');
$('#brandBtn').onclick = quickExit;

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

async function restoreGalleryConnection(){
  if(galleryLocked||!auth.currentUser)return;
  const generation=galleryEpoch;
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
