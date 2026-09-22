import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  getFirestore,
  enableIndexedDbPersistence,
  collection,
  addDoc,
  doc,
  setDoc,
  getDocs,
  query,
  orderBy,
  limit,
  serverTimestamp,
  increment
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const APP_VERSION = '0.1.0';
const UI_VERSION = 'observer-v1';
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs',
  authDomain: 'pti-app-2ab59.firebaseapp.com',
  projectId: 'pti-app-2ab59',
  storageBucket: 'pti-app-2ab59.firebasestorage.app',
  messagingSenderId: '185802494856',
  appId: '1:185802494856:web:5e9777771492528c6e203d',
  measurementId: 'G-BY7B708EVV'
};

const firebaseApp = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
enableIndexedDbPersistence(db).catch(() => {});

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const els = {
  authGate: $('#authGate'),
  appShell: $('#appShell'),
  signInBtn: $('#signInBtn'),
  authError: $('#authError'),
  syncState: $('#syncState'),
  brandBtn: $('#brandBtn'),
  profileBtn: $('#profileBtn'),
  profileDialog: $('#profileDialog'),
  profileName: $('#profileName'),
  profileEmail: $('#profileEmail'),
  closeProfileBtn: $('#closeProfileBtn'),
  signOutBtn: $('#signOutBtn'),
  markBtn: $('#markBtn'),
  markStatus: $('#markStatus'),
  voiceBtn: $('#voiceBtn'),
  textBtn: $('#textBtn'),
  textComposer: $('#textComposer'),
  observationText: $('#observationText'),
  textCount: $('#textCount'),
  cancelTextBtn: $('#cancelTextBtn'),
  saveTextBtn: $('#saveTextBtn'),
  voicePanel: $('#voicePanel'),
  voiceState: $('#voiceState'),
  voiceTranscript: $('#voiceTranscript'),
  lastCapture: $('#lastCapture'),
  timelineList: $('#timelineList'),
  timelineEmpty: $('#timelineEmpty'),
  refreshTimelineBtn: $('#refreshTimelineBtn'),
  refreshDiscoverBtn: $('#refreshDiscoverBtn'),
  patternList: $('#patternList'),
  patternEmpty: $('#patternEmpty'),
  toast: $('#toast')
};

let currentUser = null;
let currentView = 'observe';
let timelineItems = [];
let timelineFilter = 'all';
let sessionId = crypto.randomUUID();
let sessionStartedAt = Date.now();
let textDirty = false;
let textSavedSinceOpen = false;
let recognition = null;
let voiceFinal = '';
let voiceInterim = '';
let voiceActive = false;
let lastVoiceStart = 0;
let toastTimer = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

function datasetCollection(dataset) {
  if (!currentUser) throw new Error('Not authenticated');
  return collection(db, `users/${currentUser.uid}/luminaryData/${dataset}/items`);
}

function datasetDocument(dataset, id) {
  if (!currentUser) throw new Error('Not authenticated');
  return doc(db, `users/${currentUser.uid}/luminaryData/${dataset}/items/${id}`);
}

function nowContext() {
  const d = new Date();
  return {
    clientCreatedAt: d.toISOString(),
    clientCreatedAtMs: d.getTime(),
    localDate: localDateKey(d),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'unknown',
    timezoneOffsetMinutes: d.getTimezoneOffset(),
    appVersion: APP_VERSION,
    uiVersion: UI_VERSION
  };
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function track(eventName, properties = {}) {
  if (!currentUser) return;
  const context = nowContext();
  const event = {
    eventName,
    properties,
    sessionId,
    view: currentView,
    ...context,
    createdAt: serverTimestamp()
  };
  try {
    await addDoc(datasetCollection('usageEvents'), event);
    const dailyRef = doc(db, `users/${currentUser.uid}/luminaryData/usageDaily/items/${context.localDate}`);
    await setDoc(dailyRef, {
      date: context.localDate,
      lastEventAt: serverTimestamp(),
      lastEventClientAt: context.clientCreatedAt,
      appVersion: APP_VERSION,
      uiVersion: UI_VERSION,
      totalEvents: increment(1),
      counts: { [eventName]: increment(1) }
    }, { merge: true });
  } catch (error) {
    console.warn('Telemetry write failed', error);
  }
}

async function logExposure(kind, details = {}) {
  if (!currentUser) return;
  try {
    await addDoc(datasetCollection('exposures'), {
      kind,
      details,
      sessionId,
      ...nowContext(),
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.warn('Exposure write failed', error);
  }
}

async function saveObservation(sourceType, rawText = '', extra = {}) {
  if (!currentUser) return;
  setSync('busy');
  const payload = {
    schemaVersion: 1,
    sourceType,
    rawText: rawText.trim(),
    sessionId,
    ...nowContext(),
    ...extra,
    createdAt: serverTimestamp()
  };
  try {
    const ref = await addDoc(datasetCollection('observations'), payload);
    setSync('online');
    await track('observation_saved', {
      sourceType,
      observationId: ref.id,
      textLength: payload.rawText.length
    });
    els.lastCapture.textContent = sourceType === 'mark'
      ? `Mark · ${formatTime(payload.clientCreatedAt)}`
      : `${capitalize(sourceType)} · ${formatTime(payload.clientCreatedAt)}`;
    return ref.id;
  } catch (error) {
    setSync('error');
    showToast('Capture could not be saved');
    throw error;
  }
}

function setSync(state) {
  els.syncState.classList.remove('online', 'error');
  if (state === 'online') {
    els.syncState.classList.add('online');
    els.syncState.title = 'Synced';
  } else if (state === 'error') {
    els.syncState.classList.add('error');
    els.syncState.title = 'Sync problem';
  } else {
    els.syncState.title = 'Saving';
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1800);
}

async function handleMark() {
  els.markBtn.disabled = true;
  els.markStatus.textContent = 'Preserving this moment…';
  const pressedAt = Date.now();
  try {
    await saveObservation('mark', '', { interactionLatencyMs: Date.now() - pressedAt });
    els.markStatus.textContent = 'Marked.';
    showToast('Moment marked');
    setTimeout(() => {
      if (els.markStatus.textContent === 'Marked.') els.markStatus.textContent = 'Tap when something is worth preserving.';
    }, 1500);
  } finally {
    els.markBtn.disabled = false;
  }
}

function openComposer() {
  els.voicePanel.hidden = true;
  els.textComposer.hidden = false;
  textSavedSinceOpen = false;
  textDirty = false;
  els.observationText.value = '';
  updateTextCount();
  requestAnimationFrame(() => els.observationText.focus());
  track('text_composer_open');
}

function closeComposer(reason = 'cancel') {
  if (textDirty && !textSavedSinceOpen) {
    track('text_capture_abandoned', { reason, textLength: els.observationText.value.trim().length });
  }
  els.textComposer.hidden = true;
  els.observationText.value = '';
  textDirty = false;
  updateTextCount();
}

async function saveTextObservation() {
  const value = els.observationText.value.trim();
  if (!value) return;
  els.saveTextBtn.disabled = true;
  try {
    await saveObservation('text', value);
    textSavedSinceOpen = true;
    await track('text_capture_saved', { textLength: value.length });
    closeComposer('saved');
    showToast('Observation saved');
  } finally {
    els.saveTextBtn.disabled = false;
  }
}

function updateTextCount() {
  els.textCount.textContent = `${els.observationText.value.length} / 5000`;
}

function setupSpeechRecognition() {
  if (!SpeechRecognition) return null;
  const rec = new SpeechRecognition();
  rec.lang = navigator.language || 'en-IN';
  rec.continuous = true;
  rec.interimResults = true;
  rec.maxAlternatives = 1;
  rec.onresult = (event) => {
    let interim = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const text = event.results[i][0]?.transcript || '';
      if (event.results[i].isFinal) voiceFinal += `${text} `;
      else interim += text;
    }
    voiceInterim = interim;
    els.voiceTranscript.textContent = `${voiceFinal}${voiceInterim}`.trim();
  };
  rec.onerror = (event) => {
    if (event.error !== 'aborted' && event.error !== 'no-speech') {
      els.voiceState.textContent = 'Speech capture unavailable';
      track('voice_error', { error: event.error });
    }
  };
  rec.onend = async () => {
    const shouldSave = voiceActive;
    voiceActive = false;
    els.voiceBtn.classList.remove('active');
    if (!shouldSave) return;
    await finishVoiceCapture();
  };
  return rec;
}

function startVoiceCapture(event) {
  event?.preventDefault?.();
  if (voiceActive) return;
  if (!SpeechRecognition) {
    showToast('Speech recognition is not supported here');
    track('voice_unsupported');
    return;
  }
  els.textComposer.hidden = true;
  recognition ||= setupSpeechRecognition();
  voiceFinal = '';
  voiceInterim = '';
  voiceActive = true;
  lastVoiceStart = Date.now();
  els.voiceTranscript.textContent = '';
  els.voiceState.textContent = 'Listening…';
  els.voicePanel.hidden = false;
  els.voiceBtn.classList.add('active');
  track('voice_capture_start');
  try {
    recognition.start();
  } catch (error) {
    voiceActive = false;
    els.voiceBtn.classList.remove('active');
    showToast('Voice capture could not start');
  }
}

function stopVoiceCapture(event) {
  event?.preventDefault?.();
  if (!voiceActive || !recognition) return;
  els.voiceState.textContent = 'Finishing…';
  try { recognition.stop(); } catch { finishVoiceCapture(); }
}

async function finishVoiceCapture() {
  const transcript = `${voiceFinal}${voiceInterim}`.trim();
  const durationMs = Math.max(0, Date.now() - lastVoiceStart);
  if (!transcript) {
    els.voicePanel.hidden = true;
    await track('voice_capture_empty', { durationMs });
    showToast('No speech captured');
    return;
  }
  els.voiceState.textContent = 'Saving…';
  try {
    await saveObservation('voice', transcript, {
      captureDurationMs: durationMs,
      transcriptionMethod: 'browser-speech-recognition',
      locale: recognition?.lang || navigator.language || 'unknown'
    });
    await track('voice_capture_saved', { durationMs, textLength: transcript.length });
    els.voicePanel.hidden = true;
    showToast('Voice observation saved');
  } catch {
    els.voiceState.textContent = 'Save failed';
  }
}

async function loadTimeline() {
  if (!currentUser) return;
  els.timelineList.innerHTML = '';
  els.timelineEmpty.hidden = true;
  try {
    const snapshot = await getDocs(query(datasetCollection('observations'), orderBy('clientCreatedAtMs', 'desc'), limit(120)));
    timelineItems = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderTimeline();
    await track('timeline_loaded', { items: timelineItems.length });
  } catch (error) {
    console.error(error);
    els.timelineEmpty.textContent = 'Timeline could not be loaded.';
    els.timelineEmpty.hidden = false;
  }
}

function renderTimeline() {
  const items = timelineFilter === 'all'
    ? timelineItems
    : timelineItems.filter((item) => item.sourceType === timelineFilter);
  els.timelineList.innerHTML = items.map(renderTimelineItem).join('');
  els.timelineEmpty.textContent = 'No observations yet.';
  els.timelineEmpty.hidden = items.length > 0;
}

function renderTimelineItem(item) {
  const source = item.sourceType || 'observation';
  const time = item.clientCreatedAt ? formatDateTime(item.clientCreatedAt) : 'Unknown time';
  if (source === 'mark') {
    return `<article class="timeline-item" data-observation-id="${escapeHtml(item.id)}">
      <div class="timeline-meta"><span>MARK</span><span>${escapeHtml(time)}</span></div>
      <div class="timeline-mark">Moment preserved</div>
    </article>`;
  }
  return `<article class="timeline-item" data-observation-id="${escapeHtml(item.id)}">
    <div class="timeline-meta"><span>${escapeHtml(source.toUpperCase())}</span><span>${escapeHtml(time)}</span></div>
    <p class="timeline-body">${escapeHtml(item.rawText || '')}</p>
  </article>`;
}

async function loadPatterns() {
  if (!currentUser) return;
  els.patternList.innerHTML = '';
  els.patternEmpty.hidden = true;
  try {
    const snapshot = await getDocs(query(datasetCollection('patterns'), orderBy('updatedAtMs', 'desc'), limit(50)));
    const patterns = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    els.patternList.innerHTML = patterns.map(renderPattern).join('');
    els.patternEmpty.hidden = patterns.length > 0;
    await track('discover_loaded', { patterns: patterns.length });
    if (patterns.length) {
      await logExposure('derived_patterns_viewed', { patternIds: patterns.map((p) => p.id), count: patterns.length });
    }
  } catch (error) {
    console.error(error);
    els.patternEmpty.textContent = 'Derived patterns could not be loaded.';
    els.patternEmpty.hidden = false;
  }
}

function renderPattern(pattern) {
  const title = pattern.title || pattern.description || 'Observed pattern';
  const summary = pattern.summary || pattern.statement || pattern.description || '';
  const status = pattern.status || 'observed';
  const confidence = pattern.confidence == null ? '' : `confidence ${pattern.confidence}`;
  const support = pattern.supportCount == null ? '' : `${pattern.supportCount} supporting events`;
  return `<article class="pattern-card" data-pattern-id="${escapeHtml(pattern.id)}">
    <h3>${escapeHtml(title)}</h3>
    <p>${escapeHtml(summary)}</p>
    <div class="pattern-foot"><span>${escapeHtml(status)}</span>${confidence ? `<span>${escapeHtml(confidence)}</span>` : ''}${support ? `<span>${escapeHtml(support)}</span>` : ''}</div>
  </article>`;
}

async function switchView(view, source = 'nav') {
  if (!['observe', 'timeline', 'discover'].includes(view)) return;
  currentView = view;
  $$('.view').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
  $$('.nav-item').forEach((node) => node.classList.toggle('active', node.dataset.nav === view));
  await track('view_open', { view, source });
  if (view === 'timeline') {
    await logExposure('raw_history_reviewed', { surface: 'timeline' });
    await loadTimeline();
  }
  if (view === 'discover') await loadPatterns();
}

function bindEvents() {
  els.signInBtn.addEventListener('click', async () => {
    els.signInBtn.disabled = true;
    els.authError.hidden = true;
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (error) {
      els.authError.textContent = 'Sign-in failed. Try again.';
      els.authError.hidden = false;
      console.error(error);
    } finally {
      els.signInBtn.disabled = false;
    }
  });
  els.markBtn.addEventListener('click', handleMark);
  els.textBtn.addEventListener('click', openComposer);
  els.cancelTextBtn.addEventListener('click', () => closeComposer('cancel'));
  els.saveTextBtn.addEventListener('click', saveTextObservation);
  els.observationText.addEventListener('input', () => {
    textDirty = els.observationText.value.trim().length > 0;
    updateTextCount();
  });
  els.observationText.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') saveTextObservation();
  });

  els.voiceBtn.addEventListener('pointerdown', startVoiceCapture);
  els.voiceBtn.addEventListener('pointerup', stopVoiceCapture);
  els.voiceBtn.addEventListener('pointercancel', stopVoiceCapture);
  els.voiceBtn.addEventListener('pointerleave', (event) => {
    if (event.buttons) stopVoiceCapture(event);
  });

  $$('.nav-item').forEach((node) => node.addEventListener('click', () => switchView(node.dataset.nav)));
  els.brandBtn.addEventListener('click', () => switchView('observe', 'brand'));
  els.refreshTimelineBtn.addEventListener('click', () => loadTimeline());
  els.refreshDiscoverBtn.addEventListener('click', () => loadPatterns());
  $$('#timelineFilters .filter').forEach((node) => node.addEventListener('click', () => {
    timelineFilter = node.dataset.filter;
    $$('#timelineFilters .filter').forEach((item) => item.classList.toggle('active', item === node));
    renderTimeline();
    track('timeline_filter', { filter: timelineFilter });
  }));

  els.profileBtn.addEventListener('click', () => {
    els.profileDialog.showModal();
    track('account_open');
  });
  els.closeProfileBtn.addEventListener('click', () => els.profileDialog.close());
  els.signOutBtn.addEventListener('click', async () => {
    await track('sign_out');
    await signOut(auth);
    els.profileDialog.close();
  });

  window.addEventListener('online', () => setSync('online'));
  window.addEventListener('offline', () => {
    els.syncState.classList.remove('online');
    els.syncState.title = 'Offline — Firestore persistence active';
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && currentUser) {
      track('session_backgrounded', { durationMs: Date.now() - sessionStartedAt });
    }
  });
}

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  if (!user) {
    els.authGate.hidden = false;
    els.appShell.hidden = true;
    return;
  }
  els.authGate.hidden = true;
  els.appShell.hidden = false;
  els.profileName.textContent = user.displayName || 'Luminary';
  els.profileEmail.textContent = user.email || '';
  setSync(navigator.onLine ? 'online' : 'busy');
  sessionId = crypto.randomUUID();
  sessionStartedAt = Date.now();
  await setDoc(doc(db, `users/${user.uid}/luminaryData/appMeta`), {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || null,
    appVersion: APP_VERSION,
    uiVersion: UI_VERSION,
    lastOpenedAt: serverTimestamp(),
    lastOpenedClientAt: new Date().toISOString()
  }, { merge: true }).catch(() => {});
  await track('session_start', {
    referrer: document.referrer || null,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || false,
    speechRecognitionSupported: Boolean(SpeechRecognition)
  });
});

function formatTime(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

function formatDateTime(iso) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit'
  }).format(date);
}

function capitalize(value) {
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

bindEvents();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
