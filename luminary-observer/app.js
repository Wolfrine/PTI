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
  increment,
  where,
  documentId
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const APP_VERSION = '0.6.0';
const UI_VERSION = window.__LUMINARY_UI_VERSION__ || 'generated-material-v6';
const UI_VERSIONS = window.__LUMINARY_UI_VERSIONS__ || [];
const LATEST_UI_VERSION = window.__LUMINARY_LATEST_UI_VERSION__ || 'generated-material-v6';
const UI_STORAGE_KEY = window.__LUMINARY_UI_STORAGE_KEY__ || 'luminary.uiVersion';
const intuitiveExperience = () => UI_VERSION === 'intuitive-capture-v3';
const meaningfulMotionExperience = () => UI_VERSION === 'meaningful-motion-v4';
const perceptualExperience = () => UI_VERSION === 'perceptual-specimens-v5';
const generatedMaterialExperience = () => UI_VERSION === 'generated-material-v6';
const visualSpecimenExperience = () => perceptualExperience() || generatedMaterialExperience();
const meaningFirstExperience = () => intuitiveExperience() || meaningfulMotionExperience() || visualSpecimenExperience();

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
  versionControls: $('#versionControls'),
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
  streamRegister: $('#streamRegister'),
  streamRange: $('#streamRange'),
  refreshTimelineBtn: $('#refreshTimelineBtn'),
  refreshDiscoverBtn: $('#refreshDiscoverBtn'),
  patternList: $('#patternList'),
  patternEmpty: $('#patternEmpty'),
  patternField: $('#patternField'),
  momentDialog: $('#momentDialog'),
  closeMomentBtn: $('#closeMomentBtn'),
  momentHero: $('#momentHero'),
  momentRegister: $('#momentRegister'),
  momentContext: $('#momentContext'),
  momentNeighbors: $('#momentNeighbors'),
  momentRelations: $('#momentRelations'),
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
let hasAnimatedInitialView = false;
let patternSourceDetails = new Map();
let currentPatterns = [];
let selectedV5PatternId = null;

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function v5Hash(value) {
  let hash = 2166136261;
  const text = String(value ?? 'specimen');
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function v5Rand(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function v5BlobPath(width, height, seed) {
  const rand = v5Rand(seed);
  const points = [];
  const steps = 10;
  const cx = width / 2;
  const cy = height / 2;
  const rx = width * .34;
  const ry = height * .30;
  for (let i = 0; i < steps; i++) {
    const angle = (Math.PI * 2 / steps) * i - Math.PI / 2;
    const radial = .86 + rand() * .28;
    points.push([
      cx + Math.cos(angle) * rx * radial,
      cy + Math.sin(angle) * ry * (.88 + rand() * .25)
    ]);
  }
  let path = 'M ' + points[0][0].toFixed(1) + ' ' + points[0][1].toFixed(1);
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const mx = (p1[0] + p2[0]) / 2;
    const my = (p1[1] + p2[1]) / 2;
    path += ' Q ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + my.toFixed(1);
  }
  return path + ' Z';
}

function v5SpecimenMarkup(sourceType = 'mark', seed = 'specimen', size = 76) {
  const type = sourceType === 'voice' ? 'voice' : sourceType === 'text' ? 'text' : 'mark';
  if (generatedMaterialExperience()) {
    const width = Math.max(52, Number(size) || 76);
    const height = Math.round(width * .84);
    const rotation = ((v5Hash(seed) % 17) - 8);
    const scale = .94 + ((v5Hash(seed + ':scale') % 9) / 100);
    return '<span class="specimen-v5 material-v6 ' + type + '" style="width:' + width + 'px;height:' + height + 'px">' +
      '<span class="material-v6-body" style="transform:rotate(' + rotation + 'deg) scale(' + scale.toFixed(2) + ')"></span>' +
    '</span>';
  }
  const width = Math.max(52, Number(size) || 76);
  const height = Math.round(width * .84);
  const seedNum = v5Hash(seed + ':' + type);
  const uid = 'v5-' + seedNum.toString(36) + '-' + width;
  const outer = v5BlobPath(width, height, seedNum);
  const shadow = v5BlobPath(width, height, seedNum ^ 0xabc123);
  const crease = type === 'mark'
    ? 'M ' + (width * .5).toFixed(1) + ' ' + (height * .18).toFixed(1) + ' L ' + (width * .5).toFixed(1) + ' ' + (height * .77).toFixed(1)
    : type === 'voice'
      ? 'M ' + (width * .27).toFixed(1) + ' ' + (height * .56).toFixed(1) + ' Q ' + (width * .5).toFixed(1) + ' ' + (height * .24).toFixed(1) + ' ' + (width * .73).toFixed(1) + ' ' + (height * .57).toFixed(1)
      : 'M ' + (width * .28).toFixed(1) + ' ' + (height * .44).toFixed(1) + ' Q ' + (width * .5).toFixed(1) + ' ' + (height * .66).toFixed(1) + ' ' + (width * .72).toFixed(1) + ' ' + (height * .4).toFixed(1);
  const vein = 'M ' + (width * .25).toFixed(1) + ' ' + (height * .52).toFixed(1) + ' Q ' + (width * .42).toFixed(1) + ' ' + (height * .36).toFixed(1) + ' ' + (width * .68).toFixed(1) + ' ' + (height * .48).toFixed(1);
  const start = type === 'mark' ? '#fffdf9' : type === 'voice' ? '#fbfdfc' : '#fcfcf8';
  const end = type === 'mark' ? '#ecd6cf' : type === 'voice' ? '#dbe3df' : '#e3e6df';
  return '<span class="specimen-v5 ' + type + '" style="width:' + width + 'px;height:' + height + 'px">' +
    '<svg width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + uid + '-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="' + start + '"/><stop offset="100%" stop-color="' + end + '"/></linearGradient></defs>' +
      '<path class="s-shadow" d="' + shadow + '"/>' +
      '<path class="s-outer" fill="url(#' + uid + '-g)" d="' + outer + '"/>' +
      '<path class="s-vein" d="' + vein + '"/>' +
      '<path class="s-crease" d="' + crease + '"/>' +
    '</svg></span>';
}

function setupV5StaticVisuals() {
  if (!visualSpecimenExperience()) return;
  const seed = $('#markSpecimenSeed');
  if (seed) seed.innerHTML = v5SpecimenMarkup('mark', 'live-mark', 108);
  const demos = [
    ['.demo-a', 'mark', 'entry-mark', 170],
    ['.demo-b', 'voice', 'entry-voice', 132],
    ['.demo-c', 'text', 'entry-text', 150],
    ['.demo-d', 'mark', 'entry-mark-small', 100]
  ];
  demos.forEach(([selector, type, id, size]) => {
    const node = $(selector);
    if (node) node.innerHTML = v5SpecimenMarkup(type, id, size);
  });
}

function setV5LastSpecimen(sourceType, observationId, iso) {
  if (!visualSpecimenExperience()) return;
  const slot = $('#lastSpecimenSlot');
  if (!slot) return;
  slot.innerHTML = v5SpecimenMarkup(sourceType, observationId || iso || 'last', 106);
}

function datasetCollection(dataset) {
  if (!currentUser) throw new Error('Not authenticated');
  return collection(db, `users/${currentUser.uid}/luminaryData/${dataset}/items`);
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
    if (els.lastCapture) els.lastCapture.dataset.observationId = ref.id;
    if (visualSpecimenExperience() && !(generatedMaterialExperience() && sourceType === 'mark')) setV5LastSpecimen(sourceType, ref.id, payload.clientCreatedAt);
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

function playElementEntrance(nodes, options = {}) {
  if (reducedMotion()) return;
  const baseDelay = options.baseDelay ?? 0;
  const step = options.step ?? 55;
  nodes.filter(Boolean).forEach((node, index) => {
    node.animate(
      [
        { opacity: 0, transform: 'translate3d(0,14px,0) scale(.995)' },
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
      ],
      {
        duration: 460,
        delay: baseDelay + index * step,
        easing: 'cubic-bezier(.2,.75,.25,1)',
        fill: 'both'
      }
    );
  });
}

function animateObserveEntrance() {
  if (hasAnimatedInitialView || reducedMotion()) return;
  hasAnimatedInitialView = true;

  if (meaningFirstExperience()) {
    playElementEntrance([
      els.markBtn,
      ...$('.capture-button'),
      $('.last-capture')
    ], { step: meaningfulMotionExperience() ? 45 : 65 });
    return;
  }

  const register = $('.observe-register');
  if (register) {
    const mobile = window.matchMedia?.('(max-width: 720px)').matches;
    register.animate(
      mobile
        ? [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0 0)' }]
        : [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
      { duration: 720, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' }
    );
  }

  const stem = $('.mark-stem');
  if (stem) {
    stem.animate(
      [{ transform: 'scaleY(0)', opacity: .25 }, { transform: 'scaleY(1)', opacity: 1 }],
      { duration: 420, delay: 260, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' }
    );
  }

  playElementEntrance([
    ...$$('.capture-button'),
    $('.last-capture')
  ], { baseDelay: 340, step: 70 });
}

function animateCurrentView(view) {
  const active = document.querySelector(`.view[data-view="${view}"]`);
  if (!active || reducedMotion()) return;
  active.classList.remove('entering');
  void active.offsetWidth;
  active.classList.add('entering');
  setTimeout(() => active.classList.remove('entering'), 650);
}

function animateRenderedItems(selector) {
  if (reducedMotion()) return;
  const items = $$(selector);
  items.forEach((item, index) => {
    item.animate(
      [
        { opacity: 0, transform: 'translate3d(-8px,12px,0)' },
        { opacity: 1, transform: 'translate3d(0,0,0)' }
      ],
      {
        duration: 400,
        delay: Math.min(index * 42, 420),
        easing: 'cubic-bezier(.2,.75,.25,1)',
        fill: 'both'
      }
    );
  });
}

function animatePatternField() {
  if (!els.patternField || reducedMotion() || meaningFirstExperience()) return;
  const tracks = $$('.pattern-track-line');
  tracks.forEach((track, index) => {
    track.animate(
      [
        { clipPath: 'inset(0 100% 0 0)' },
        { clipPath: 'inset(0 0 0 0)' }
      ],
      {
        duration: 560,
        delay: Math.min(index * 70, 350),
        easing: 'cubic-bezier(.2,.75,.25,1)',
        fill: 'both'
      }
    );
  });
}

function setV4LastImprint(sourceType, iso) {
  if (!meaningfulMotionExperience()) return;
  const slot = $('#lastImprintSlot');
  if (!slot) return;
  const type = sourceType === 'voice' ? 'voice' : sourceType === 'text' ? 'text' : 'mark';
  const label = sourceType === 'mark' ? 'Mark' : capitalize(sourceType);
  slot.innerHTML = '<span class="imprint-chip ' + type + '">' + escapeHtml(formatTime(iso) + ' · ' + label) + '</span>';
}

function animateV4ImprintTransfer(sourceType, iso) {
  if (!meaningfulMotionExperience()) return;
  const slot = $('#lastImprintSlot');
  if (!slot) return;

  if (reducedMotion()) {
    setV4LastImprint(sourceType, iso);
    return;
  }

  const source = els.markBtn?.getBoundingClientRect();
  const target = slot.getBoundingClientRect();
  if (!source || !target) {
    setV4LastImprint(sourceType, iso);
    return;
  }

  const flying = document.createElement('div');
  flying.className = 'flying-imprint-v4';
  flying.textContent = formatTime(iso) + ' · Mark';
  document.body.appendChild(flying);

  const sx = source.left + source.width / 2;
  const sy = source.top + source.height * .5;
  const tx = target.right - 60;
  const ty = target.top + 14;
  flying.style.left = sx + 'px';
  flying.style.top = sy + 'px';

  const finalTransform = 'translate(' + (tx - sx - 42) + 'px,' + (ty - sy - 12) + 'px) scale(.92)';
  const animation = flying.animate([
    { transform: 'translate(-50%,-50%) scale(.45)', opacity: 0 },
    { transform: 'translate(-50%,-50%) scale(1)', opacity: 1, offset: .18 },
    { transform: finalTransform, opacity: .94 }
  ], {
    duration: 560,
    easing: 'cubic-bezier(.2,.78,.25,1)',
    fill: 'forwards'
  });

  animation.finished
    .catch(() => {})
    .finally(() => {
      flying.remove();
      setV4LastImprint(sourceType, iso);
    });
}

function animateV4PatternEvidence() {
  if (!meaningfulMotionExperience() || reducedMotion()) return;
  $('.pattern-source').forEach((source, index) => {
    const imprint = source.querySelector('.source-imprint');
    const text = source.querySelector('span');
    imprint?.animate(
      [{ opacity: 0, transform: 'translateX(-10px)' }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: 260, delay: 90 + Math.min(index * 100, 500), easing: 'cubic-bezier(.2,.78,.25,1)', fill: 'both' }
    );
    text?.animate(
      [{ opacity: 0, transform: 'translateX(-6px)' }, { opacity: 1, transform: 'translateX(0)' }],
      { duration: 280, delay: 150 + Math.min(index * 100, 500), easing: 'cubic-bezier(.2,.78,.25,1)', fill: 'both' }
    );
  });
}

function animateV6MaterialTransfer(sourceType, observationId, iso) {
  if (!generatedMaterialExperience()) return;
  const source = $('#markSpecimenSeed .material-v6');
  const slot = $('#lastSpecimenSlot');
  if (!source || !slot || reducedMotion()) {
    setV5LastSpecimen(sourceType, observationId, iso);
    return;
  }

  const from = source.getBoundingClientRect();
  const to = slot.getBoundingClientRect();
  const flying = document.createElement('div');
  flying.className = 'v6-flying-material';
  flying.innerHTML = v5SpecimenMarkup(sourceType, observationId || iso || 'transfer', 138);
  flying.style.left = (from.left + from.width / 2 - 69) + 'px';
  flying.style.top = (from.top + from.height / 2 - 58) + 'px';
  document.body.appendChild(flying);

  const dx = (to.left + to.width / 2) - (from.left + from.width / 2);
  const dy = (to.top + to.height / 2) - (from.top + from.height / 2);
  const animation = flying.animate([
    { transform:'translate(0,0) scale(.72)', opacity:0 },
    { transform:'translate(0,0) scale(1)', opacity:1, offset:.18 },
    { transform:'translate(' + dx + 'px,' + dy + 'px) scale(.82)', opacity:.94 }
  ], { duration:620, easing:'cubic-bezier(.2,.78,.25,1)', fill:'forwards' });

  animation.finished.catch(() => {}).finally(() => {
    flying.remove();
    setV5LastSpecimen(sourceType, observationId, iso);
  });
}

async function handleMark() {
  els.markBtn.disabled = true;
  els.markStatus.textContent = 'Preserving this moment…';
  const pressedAt = Date.now();
  const capturedIso = new Date(pressedAt).toISOString();
  try {
    await saveObservation('mark', '', { interactionLatencyMs: Date.now() - pressedAt });
    els.markStatus.textContent = meaningfulMotionExperience() ? 'Preserved in your raw record.' : 'Preserved.';
    els.markBtn.classList.remove('saved');
    void els.markBtn.offsetWidth;
    els.markBtn.classList.add('saved');
    if (meaningfulMotionExperience()) animateV4ImprintTransfer('mark', capturedIso);
    if (visualSpecimenExperience()) {
      const latestId = els.lastCapture?.dataset?.observationId || capturedIso;
      if (generatedMaterialExperience()) animateV6MaterialTransfer('mark', latestId, capturedIso);
      else setV5LastSpecimen('mark', latestId, capturedIso);
    }
    showToast('Moment preserved');
    setTimeout(() => {
      els.markBtn.classList.remove('saved');
      if (els.markStatus.textContent === 'Preserved.' || els.markStatus.textContent === 'Preserved in your raw record.') {
        els.markStatus.textContent = intuitiveExperience()
          ? 'One tap. Nothing else required.'
          : 'Tap when something is worth preserving.';
      }
    }, meaningfulMotionExperience() ? 1200 : 1500);
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
  if (!reducedMotion()) {
    els.textComposer.animate(
      [
        { opacity: 0, transform: 'translate3d(0,18px,0) scale(.985)' },
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
      ],
      { duration: 360, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' }
    );
  }
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
    showToast('Observation preserved');
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
  if (!reducedMotion()) {
    els.voicePanel.animate(
      [
        { opacity: 0, transform: 'translate3d(0,14px,0) scale(.985)' },
        { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }
      ],
      { duration: 300, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' }
    );
  }
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
  els.voiceState.textContent = 'Preserving…';
  try {
    await saveObservation('voice', transcript, {
      captureDurationMs: durationMs,
      transcriptionMethod: 'browser-speech-recognition',
      locale: recognition?.lang || navigator.language || 'unknown'
    });
    await track('voice_capture_saved', { durationMs, textLength: transcript.length });
    els.voicePanel.hidden = true;
    showToast('Voice observation preserved');
  } catch {
    els.voiceState.textContent = 'Save failed';
  }
}

function observationTimeMs(item) {
  return coercePatternDateMs(item?.clientCreatedAtMs ?? item?.clientCreatedAt);
}

function observationDayKey(item) {
  if (item?.localDate) return String(item.localDate);
  const ms = observationTimeMs(item);
  if (!Number.isFinite(ms)) return 'unknown-date';
  const d = new Date(ms);
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

function formatDayKey(dayKey) {
  const match = String(dayKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(dayKey || 'DATE UNKNOWN').toUpperCase();
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(date).toUpperCase();
}

function observationLocalMinute(item) {
  const ms = observationTimeMs(item);
  if (!Number.isFinite(ms)) return null;

  const offset = Number(item?.timezoneOffsetMinutes);
  if (Number.isFinite(offset)) {
    const local = new Date(ms - offset * 60_000);
    return local.getUTCHours() * 60 + local.getUTCMinutes() + local.getUTCSeconds() / 60;
  }

  const local = new Date(ms);
  return local.getHours() * 60 + local.getMinutes() + local.getSeconds() / 60;
}

function formatObservationLocalTime(item) {
  const ms = observationTimeMs(item);
  if (!Number.isFinite(ms)) return 'TIME UNKNOWN';

  const offset = Number(item?.timezoneOffsetMinutes);
  if (Number.isFinite(offset)) {
    const local = new Date(ms - offset * 60_000);
    return String(local.getUTCHours()).padStart(2, '0') + ':' + String(local.getUTCMinutes()).padStart(2, '0');
  }

  if (item?.timezone) {
    try {
      const parts = new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: item.timezone
      }).formatToParts(new Date(ms));
      const hour = parts.find((part) => part.type === 'hour')?.value;
      const minute = parts.find((part) => part.type === 'minute')?.value;
      if (hour && minute) return hour + ':' + minute;
    } catch {}
  }

  const local = new Date(ms);
  return String(local.getHours()).padStart(2, '0') + ':' + String(local.getMinutes()).padStart(2, '0');
}

function formatGap(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'gap unavailable';
  if (ms < 60_000) return Math.max(1, Math.round(ms / 1000)) + ' sec';
  if (ms < 3_600_000) return Math.round(ms / 60_000) + ' min';
  if (ms < 86_400_000) {
    const hours = Math.floor(ms / 3_600_000);
    const minutes = Math.round((ms % 3_600_000) / 60_000);
    return minutes ? hours + ' hr ' + minutes + ' min' : hours + ' hr';
  }
  const days = Math.floor(ms / 86_400_000);
  const hours = Math.round((ms % 86_400_000) / 3_600_000);
  return hours ? days + ' d ' + hours + ' hr' : days + ' d';
}

function renderStreamRegister(items) {
  if (!els.streamRegister) return;
  const dated = items
    .map((item) => ({ item, ms: observationTimeMs(item) }))
    .filter((entry) => Number.isFinite(entry.ms));

  if (generatedMaterialExperience()) {
    if (!items.length) {
      els.streamRegister.innerHTML = '<div class="v5-field-caption"><span class="instrument-meta">ACCUMULATION FIELD</span><strong id="streamRange">NO RANGE YET</strong></div><div class="v5-field-empty">Your visual record will appear here.</div>';
      return;
    }
    const dated = items.map((item) => ({ item, ms: observationTimeMs(item) })).filter((entry) => Number.isFinite(entry.ms));
    const minMs = dated.length ? Math.min(...dated.map((entry) => entry.ms)) : 0;
    const maxMs = dated.length ? Math.max(...dated.map((entry) => entry.ms)) : 1;
    const span = Math.max(1, maxMs - minMs);
    const lane = { mark: 18, voice: 49, text: 78 };
    const nodes = items.slice(0, 40).map((item, index) => {
      const ms = observationTimeMs(item);
      const normalized = Number.isFinite(ms) ? (maxMs - ms) / span : index / Math.max(1, items.length - 1);
      const sourceType = item.sourceType === 'voice' ? 'voice' : item.sourceType === 'text' ? 'text' : 'mark';
      const jitter = ((v5Hash(item.id) % 9) - 4) * .7;
      const left = lane[sourceType] + jitter;
      const top = 16 + Math.max(0, Math.min(1, normalized)) * 70;
      const size = sourceType === 'mark' ? 92 : sourceType === 'voice' ? 84 : 80;
      return '<button class="v5-stream-node" type="button" data-observation-id="' + escapeHtml(item.id) + '" style="left:' + left.toFixed(2) + '%;top:' + top.toFixed(2) + '%" aria-label="Open raw observation">' +
        v5SpecimenMarkup(sourceType, item.id, size) +
      '</button>';
    }).join('');
    const range = dated.length ? formatAxisDate(minMs) + ' — ' + formatAxisDate(maxMs) : 'DATE RANGE UNAVAILABLE';
    els.streamRegister.innerHTML = '<div class="v5-field-caption"><span class="instrument-meta">ACCUMULATION FIELD</span><strong id="streamRange">' + escapeHtml(range) + '</strong></div>' + nodes;
    return;
  }

  if (perceptualExperience()) {
    if (!items.length) {
      els.streamRegister.innerHTML = '<div class="v5-field-caption"><span class="instrument-meta">ACCUMULATION FIELD</span><strong id="streamRange">NO RANGE YET</strong></div><div class="v5-field-empty">Your visual record will appear here.</div>';
      return;
    }
    const dated = items.map((item) => ({ item, ms: observationTimeMs(item) })).filter((entry) => Number.isFinite(entry.ms));
    const minMs = dated.length ? Math.min(...dated.map((entry) => entry.ms)) : 0;
    const maxMs = dated.length ? Math.max(...dated.map((entry) => entry.ms)) : 1;
    const span = Math.max(1, maxMs - minMs);
    const nodes = items.slice(0, 40).map((item, index) => {
      const ms = observationTimeMs(item);
      const normalized = Number.isFinite(ms) ? (maxMs - ms) / span : index / Math.max(1, items.length - 1);
      const hash = v5Hash(item.id);
      const left = 18 + (hash % 67);
      const top = 17 + Math.max(0, Math.min(1, normalized)) * 68;
      const size = item.sourceType === 'mark' ? 82 : item.sourceType === 'voice' ? 76 : 72;
      return '<button class="v5-stream-node" type="button" data-observation-id="' + escapeHtml(item.id) + '" style="left:' + left + '%;top:' + top.toFixed(2) + '%" aria-label="Open raw observation">' +
        v5SpecimenMarkup(item.sourceType, item.id, size) +
      '</button>';
    }).join('');
    const range = dated.length ? formatAxisDate(minMs) + ' — ' + formatAxisDate(maxMs) : 'DATE RANGE UNAVAILABLE';
    els.streamRegister.innerHTML = '<div class="v5-field-caption"><span class="instrument-meta">ACCUMULATION FIELD</span><strong id="streamRange">' + escapeHtml(range) + '</strong></div>' + nodes;
    return;
  }

  if (meaningFirstExperience()) {
    if (!dated.length) {
      els.streamRegister.innerHTML =
        '<span>No dated observations in this view.</span><strong id="streamRange">No dated range</strong>';
      return;
    }
    const minMs = Math.min(...dated.map((entry) => entry.ms));
    const maxMs = Math.max(...dated.map((entry) => entry.ms));
    els.streamRegister.innerHTML =
      '<span>' + escapeHtml(String(items.length) + ' observation' + (items.length === 1 ? '' : 's') + ' visible') + '</span>' +
      '<strong id="streamRange">' + escapeHtml(formatAxisDate(minMs) + ' — ' + formatAxisDate(maxMs)) + '</strong>';
    return;
  }

  if (!dated.length) {
    els.streamRegister.innerHTML =
      '<div class="stream-register-empty">' +
        '<span class="instrument-meta">RAW TEMPORAL REGISTER</span>' +
        '<span>No dated observations in this view.</span>' +
      '</div>';
    if (els.streamRange) els.streamRange.textContent = 'NO DATED RANGE';
    return;
  }

  const minMs = Math.min(...dated.map((entry) => entry.ms));
  const maxMs = Math.max(...dated.map((entry) => entry.ms));
  const span = Math.max(1, maxMs - minMs);
  const ticks = dated.map(({ item, ms }) => {
    const position = minMs === maxMs ? 50 : ((ms - minMs) / span) * 100;
    const source = item.sourceType || 'observation';
    const label = source.toUpperCase() + ' · ' + formatDayKey(observationDayKey(item)) + ' · ' + formatObservationLocalTime(item);
    return '<button class="stream-register-tick" type="button" data-source="' + escapeHtml(source) +
      '" data-observation-id="' + escapeHtml(item.id) + '" style="left:' + position.toFixed(3) +
      '%" aria-label="' + escapeHtml(label) + '"><span aria-hidden="true"></span></button>';
  }).join('');

  els.streamRegister.innerHTML =
    '<div class="stream-register-head">' +
      '<span class="instrument-meta">RAW TEMPORAL REGISTER</span>' +
      '<span class="instrument-meta">' + dated.length + ' DATED / ' + items.length + ' VISIBLE</span>' +
    '</div>' +
    '<div class="stream-register-axis">' +
      '<span class="stream-register-line" aria-hidden="true"></span>' +
      ticks +
    '</div>' +
    '<div class="stream-register-range instrument-meta">' +
      '<span>' + escapeHtml(formatAxisDate(minMs)) + '</span>' +
      '<span>' + escapeHtml(formatAxisDate(maxMs)) + '</span>' +
    '</div>';

  if (els.streamRange) {
    els.streamRange.textContent = formatAxisDate(minMs).toUpperCase() + ' — ' + formatAxisDate(maxMs).toUpperCase();
  }

  if (!reducedMotion()) {
    $('.stream-register-line')?.animate(
      [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }],
      { duration: 520, easing: 'cubic-bezier(.2,.75,.25,1)', fill: 'both' }
    );
    $$('.stream-register-tick').forEach((tick, index) => {
      tick.animate(
        [{ opacity: 0, transform: 'translateX(-50%) scaleY(.2)' }, { opacity: 1, transform: 'translateX(-50%) scaleY(1)' }],
        { duration: 260, delay: Math.min(index * 12, 280), easing: 'ease-out', fill: 'both' }
      );
    });
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
    els.timelineEmpty.textContent = 'Stream could not be loaded.';
    els.timelineEmpty.hidden = false;
    renderStreamRegister([]);
  }
}

function renderTimeline() {
  const items = timelineFilter === 'all'
    ? timelineItems
    : timelineItems.filter((item) => item.sourceType === timelineFilter);

  const dayCounts = new Map();
  items.forEach((item) => {
    const key = observationDayKey(item);
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
  });

  let previousDay = null;
  els.timelineList.innerHTML = items.map((item) => {
    const day = observationDayKey(item);
    const header = day !== previousDay
      ? '<div class="timeline-day-label"><span>' + escapeHtml(formatDayKey(day)) + '</span><span class="instrument-meta">' +
        escapeHtml(String(dayCounts.get(day) || 0)) + ' RECORD' + ((dayCounts.get(day) || 0) === 1 ? '' : 'S') + '</span></div>'
      : '';
    previousDay = day;
    return header + renderTimelineItem(item);
  }).join('');

  renderStreamRegister(items);
  els.timelineEmpty.textContent = 'No observations yet.';
  els.timelineEmpty.hidden = items.length > 0;
  animateRenderedItems('.timeline-item');
}

function renderTimelineItem(item) {
  const source = item.sourceType || 'observation';
  const time = formatObservationLocalTime(item);
  const sourceAttr = escapeHtml(source);
  const timeMs = observationTimeMs(item);
  const timeAttr = Number.isFinite(timeMs) ? String(timeMs) : '';

  if (visualSpecimenExperience()) {
    const specimen = v5SpecimenMarkup(source, item.id, source === 'mark' ? 58 : 54);
    const body = source === 'mark' ? 'Moment preserved' : (item.rawText || '');
    return '<article class="timeline-item" data-source="' + sourceAttr + '" data-observation-id="' + escapeHtml(item.id) +
      '" data-time-ms="' + escapeHtml(timeAttr) + '">' +
      '<div class="timeline-meta"><span class="v5-list-specimen">' + specimen + '<span>' + escapeHtml(time) + '</span></span></div>' +
      '<div class="timeline-body">' + escapeHtml(body) + '</div>' +
    '</article>';
  }

  if (source === 'mark') {
    return '<article class="timeline-item" data-source="' + sourceAttr + '" data-observation-id="' + escapeHtml(item.id) +
      '" data-time-ms="' + escapeHtml(timeAttr) + '">' +
      '<div class="timeline-meta"><span>MARK</span><span>' + escapeHtml(time) + '</span></div>' +
      '<div class="timeline-mark">Moment preserved</div>' +
    '</article>';
  }

  return '<article class="timeline-item" data-source="' + sourceAttr + '" data-observation-id="' + escapeHtml(item.id) +
    '" data-time-ms="' + escapeHtml(timeAttr) + '">' +
    '<div class="timeline-meta"><span>' + escapeHtml(source.toUpperCase()) + '</span><span>' + escapeHtml(time) + '</span></div>' +
    '<p class="timeline-body">' + escapeHtml(item.rawText || '') + '</p>' +
  '</article>';
}

function renderMomentRegister(item) {
  if (!els.momentRegister) return;
  const selectedMinute = observationLocalMinute(item);
  const dayKey = observationDayKey(item);

  if (meaningFirstExperience()) {
    const sameDayCount = timelineItems.filter((entry) => observationDayKey(entry) === dayKey).length;
    const localTime = formatObservationLocalTime(item);
    els.momentRegister.innerHTML =
      '<span>Captured ' + escapeHtml(formatDayKey(dayKey)) + ' at ' + escapeHtml(localTime) + '.</span> ' +
      '<span>' + escapeHtml(String(sameDayCount)) + ' raw observation' + (sameDayCount === 1 ? '' : 's') + ' recorded that day.</span>';
    return;
  }

  if (selectedMinute == null) {
    els.momentRegister.innerHTML =
      '<div class="moment-register-empty"><span class="instrument-meta">LOCAL DAY REGISTER</span><span>Capture time unavailable.</span></div>';
    return;
  }

  const sameDay = timelineItems
    .filter((entry) => observationDayKey(entry) === dayKey && observationLocalMinute(entry) != null)
    .sort((a, b) => observationLocalMinute(a) - observationLocalMinute(b));

  const ticks = sameDay.map((entry) => {
    const minute = observationLocalMinute(entry);
    const position = Math.max(0, Math.min(100, (minute / 1440) * 100));
    const selected = entry.id === item.id;
    const source = entry.sourceType || 'observation';
    return '<span class="moment-day-tick' + (selected ? ' selected' : '') + '" data-source="' + escapeHtml(source) +
      '" style="left:' + position.toFixed(3) + '%" title="' + escapeHtml(formatObservationLocalTime(entry) + ' · ' + source) + '"></span>';
  }).join('');

  els.momentRegister.innerHTML =
    '<div class="moment-register-head">' +
      '<span class="instrument-meta">LOCAL DAY REGISTER</span>' +
      '<span class="instrument-meta">' + escapeHtml(formatDayKey(dayKey)) + '</span>' +
    '</div>' +
    '<div class="moment-day-axis">' +
      '<span class="moment-day-line" aria-hidden="true"></span>' +
      '<span class="moment-midday" aria-hidden="true"></span>' +
      ticks +
    '</div>' +
    '<div class="moment-day-labels instrument-meta"><span>00:00</span><span>12:00</span><span>24:00</span></div>';
}

function renderMomentNeighbors(item) {
  if (!els.momentNeighbors) return;
  const selectedMs = observationTimeMs(item);
  const ordered = timelineItems
    .map((entry) => ({ entry, ms: observationTimeMs(entry) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => a.ms - b.ms);

  const index = ordered.findIndex(({ entry }) => entry.id === item.id);
  const before = index > 0 ? ordered[index - 1] : null;
  const after = index >= 0 && index < ordered.length - 1 ? ordered[index + 1] : null;

  const renderNeighbor = (label, neighbor) => {
    if (!neighbor) {
      return '<div class="moment-neighbor empty"><span class="instrument-meta">' + label +
        '</span><strong>No ' + (label === 'BEFORE' ? 'earlier' : 'later') + ' observation in the loaded record.</strong></div>';
    }
    const source = neighbor.entry.sourceType || 'observation';
    const summary = source === 'mark' ? 'Moment preserved' : (neighbor.entry.rawText || 'Raw observation');
    const gap = Number.isFinite(selectedMs) ? formatGap(Math.abs(neighbor.ms - selectedMs)) : 'gap unavailable';
    return '<div class="moment-neighbor">' +
      '<span class="instrument-meta">' + label + '</span>' +
      '<strong>' + escapeHtml(formatDayKey(observationDayKey(neighbor.entry)) + ' · ' + formatObservationLocalTime(neighbor.entry) + ' · ' + source.toUpperCase()) + '</strong>' +
      '<p>' + escapeHtml(summary) + '</p>' +
      '<small class="instrument-meta">' + escapeHtml(gap.toUpperCase() + ' FROM SELECTED') + '</small>' +
    '</div>';
  };

  els.momentNeighbors.innerHTML = renderNeighbor('BEFORE', before) + renderNeighbor('AFTER', after);
}

async function openMoment(observationId) {
  const item = timelineItems.find((entry) => entry.id === observationId);
  if (!item || !els.momentDialog) return;

  const source = item.sourceType || 'observation';
  const day = formatDayKey(observationDayKey(item));
  const localTime = formatObservationLocalTime(item);
  const raw = visualSpecimenExperience()
    ? '<div class="v5-moment-specimen">' + v5SpecimenMarkup(source, item.id, 104) + '<div>' +
        '<div class="instrument-meta">' + escapeHtml(source.toUpperCase()) + '</div>' +
        '<div class="moment-raw" style="border:0;margin:4px 0 0;padding:0">' + escapeHtml(source === 'mark' ? 'Moment preserved' : (item.rawText || '')) + '</div>' +
      '</div></div>'
    : source === 'mark'
      ? '<div class="moment-mark-hero"><span class="moment-trace" aria-hidden="true"></span><span>Moment preserved</span></div>'
      : '<div class="moment-raw">' + escapeHtml(item.rawText || '') + '</div>';

  els.momentHero.innerHTML =
    '<div class="moment-time-row"><span>' + escapeHtml(day + ' · ' + localTime) + '</span><span>' + escapeHtml(source) + '</span></div>' +
    raw;

  const contextRows = [
    ['Captured as', capitalize(source)],
    ['Local date', item.localDate || observationDayKey(item) || 'Not recorded'],
    ['Local time', localTime],
    ['Timezone', item.timezone || 'Not recorded'],
    ['Capture version', item.uiVersion || item.appVersion || 'Earlier version']
  ];
  els.momentContext.innerHTML = contextRows.map(([label, value]) =>
    '<div class="context-card"><strong>' + escapeHtml(label) + '</strong><span>' + escapeHtml(value) + '</span></div>'
  ).join('');

  renderMomentRegister(item);
  renderMomentNeighbors(item);

  els.momentRelations.innerHTML =
    '<div class="relation-card">' +
      '<strong>No assumed causality</strong>' +
      '<span>Explicit relationships appear here only when they exist as separate research records. Temporal proximity above is context, not explanation.</span>' +
    '</div>';

  els.momentDialog.showModal();
  playElementEntrance([
    els.momentHero,
    els.momentRegister,
    ...els.momentContext.children,
    ...els.momentNeighbors.children,
    ...els.momentRelations.children,
    $('.exposure-note')
  ], { baseDelay: 40, step: 45 });

  await logExposure('raw_observation_reviewed', { observationId, sourceType: source, surface: 'moment_detail' });
  await track('moment_open', { observationId, sourceType: source });
}

function coercePatternDateMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sourceFromPatternValue(value) {
  if (typeof value === 'string' && value.trim()) {
    return { id: value.trim(), dateMs: null };
  }
  if (!value || typeof value !== 'object') return null;
  const id = value.observationId || value.sourceObservationId || value.observationID || null;
  if (!id) return null;
  const dateMs = coercePatternDateMs(
    value.clientCreatedAtMs ??
    value.observedAtMs ??
    value.timestampMs ??
    value.clientCreatedAt ??
    value.observedAt ??
    value.date
  );
  return {
    id: String(id),
    dateMs,
    rawText: value.rawText || value.text || value.sourceText || null,
    sourceType: value.sourceType || value.type || null,
    localDate: value.localDate || null
  };
}

function extractPatternSources(pattern) {
  const sources = [];
  const idKeys = [
    'sourceObservationIds',
    'supportingObservationIds',
    'observationIds',
    'evidenceObservationIds'
  ];
  const objectKeys = [
    'sources',
    'evidence',
    'supportingObservations',
    'supportingEvents'
  ];

  idKeys.forEach((key) => {
    if (!Array.isArray(pattern[key])) return;
    pattern[key].forEach((value) => {
      const source = sourceFromPatternValue(value);
      if (source) sources.push(source);
    });
  });

  objectKeys.forEach((key) => {
    if (!Array.isArray(pattern[key])) return;
    pattern[key].forEach((value) => {
      const source = sourceFromPatternValue(value);
      if (source) sources.push(source);
    });
  });

  const byId = new Map();
  sources.forEach((source) => {
    const existing = byId.get(source.id);
    if (!existing || (existing.dateMs == null && source.dateMs != null)) {
      byId.set(source.id, source);
    }
  });
  return [...byId.values()];
}

async function loadPatternSourceDates(patterns) {
  const displayed = patterns.slice(0, 6);
  const sources = displayed.flatMap(extractPatternSources);
  const dateMap = new Map();
  patternSourceDetails = new Map();

  sources.forEach((source) => {
    if (source.dateMs != null) dateMap.set(source.id, source.dateMs);
    patternSourceDetails.set(source.id, { ...source });
  });

  const sourceIds = [...new Set(sources.map((source) => source.id))].slice(0, 240);

  for (let offset = 0; offset < sourceIds.length; offset += 30) {
    const ids = sourceIds.slice(offset, offset + 30);
    if (!ids.length) continue;
    try {
      const snapshot = await getDocs(query(
        datasetCollection('observations'),
        where(documentId(), 'in', ids)
      ));
      snapshot.docs.forEach((item) => {
        const data = item.data();
        const dateMs = coercePatternDateMs(data.clientCreatedAtMs ?? data.clientCreatedAt);
        if (dateMs != null) dateMap.set(item.id, dateMs);
        patternSourceDetails.set(item.id, {
          id: item.id,
          dateMs,
          rawText: data.rawText || '',
          sourceType: data.sourceType || 'observation',
          localDate: data.localDate || null,
          timezone: data.timezone || null,
          timezoneOffsetMinutes: data.timezoneOffsetMinutes
        });
      });
    } catch (error) {
      console.warn('Pattern source-detail lookup failed', error);
      break;
    }
  }

  return dateMap;
}

function formatAxisDate(ms) {
  if (!Number.isFinite(ms)) return 'DATE UNAVAILABLE';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(ms));
}

function renderPatternRegister(patterns, sourceDateMap) {
  if (!els.patternField) return;

  if (generatedMaterialExperience()) {
    if (!patterns.length) {
      els.patternField.innerHTML = '<div class="v5-field-empty">Waiting for source-linked patterns.</div>';
      return;
    }
    const selected = patterns.find((pattern) => pattern.id === selectedV5PatternId) || patterns[0];
    selectedV5PatternId = selected.id;
    const supportIds = extractPatternSources(selected).map((source) => source.id);
    const support = new Set(supportIds);
    const all = [...patternSourceDetails.values()].slice(0, 28);
    const supportNodes = supportIds.map((id, index) => {
      const detail = patternSourceDetails.get(id) || { id, sourceType: 'mark' };
      const columns = 3;
      const col = index % columns;
      const row = Math.floor(index / columns);
      const left = 20 + col * 18 + (row % 2) * 4;
      const top = 20 + row * 17 + (col % 2) * 3;
      return '<button class="v5-pattern-node support" type="button" data-observation-id="' + escapeHtml(id) + '" style="left:' + left + '%;top:' + top + '%" aria-label="Open supporting moment">' +
        v5SpecimenMarkup(detail.sourceType || 'mark', id, 96) +
      '</button>';
    }).join('');
    const background = all.filter((detail) => !support.has(detail.id)).slice(0, 8).map((detail, index) => {
      const left = 72 + (index % 2) * 10;
      const top = 16 + index * 9;
      return '<button class="v5-pattern-node dim" type="button" data-observation-id="' + escapeHtml(detail.id) + '" style="left:' + left + '%;top:' + top + '%" aria-label="Open other moment">' +
        v5SpecimenMarkup(detail.sourceType || 'mark', detail.id, 62) +
      '</button>';
    }).join('');
    els.patternField.innerHTML =
      '<div class="v5-pattern-caption">COMMON REGION · ' + escapeHtml(String(support.size)) + ' SUPPORTING MOMENTS</div>' +
      supportNodes + background +
      '<div class="v5-pattern-title"><strong>' + escapeHtml(selected.title || selected.description || 'Observed pattern') + '</strong><span>' + escapeHtml(selected.summary || selected.statement || selected.description || '') + '</span></div>';
    return;
  }

  if (perceptualExperience()) {
    if (!patterns.length) {
      els.patternField.innerHTML = '<div class="v5-field-empty">Waiting for source-linked patterns.</div>';
      return;
    }
    const selected = patterns.find((pattern) => pattern.id === selectedV5PatternId) || patterns[0];
    selectedV5PatternId = selected.id;
    const support = new Set(extractPatternSources(selected).map((source) => source.id));
    const all = [...patternSourceDetails.values()].slice(0, 28);
    const nodes = all.map((detail, index) => {
      const isSupport = support.has(detail.id);
      const hash = v5Hash(detail.id);
      const supportIndex = [...support].indexOf(detail.id);
      const left = isSupport ? 22 + (supportIndex % 3) * 18 + Math.floor(supportIndex / 3) * 6 : 62 + (hash % 25);
      const top = isSupport ? 24 + (supportIndex % 4) * 13 : 18 + ((hash >>> 5) % 66);
      const sourceType = detail.sourceType || 'mark';
      const cls = isSupport ? 'support' : 'dim';
      return '<button class="v5-pattern-node ' + cls + '" type="button" data-observation-id="' + escapeHtml(detail.id) + '" style="left:' + left + '%;top:' + top + '%" aria-label="Open supporting moment">' +
        v5SpecimenMarkup(sourceType, detail.id, isSupport ? 84 : 64) +
      '</button>';
    }).join('');
    els.patternField.innerHTML =
      '<div class="v5-pattern-caption">SOURCE OBJECTS · ' + escapeHtml(String(support.size)) + ' SUPPORTING</div>' +
      nodes +
      '<div class="v5-pattern-title"><strong>' + escapeHtml(selected.title || selected.description || 'Observed pattern') + '</strong><span>' + escapeHtml(selected.summary || selected.statement || selected.description || '') + '</span></div>';
    return;
  }

  if (meaningFirstExperience()) {
    els.patternField.innerHTML = patterns.length
      ? '<span>' + escapeHtml(String(patterns.length)) + ' published pattern' + (patterns.length === 1 ? '' : 's') + '. Open supporting moments to inspect the raw evidence.</span>'
      : '<span>No published patterns yet.</span>';
    return;
  }

  if (!patterns.length) {
    els.patternField.innerHTML =
      '<div class="pattern-register-empty">' +
        '<span class="instrument-meta">DERIVED STRUCTURE</span>' +
        '<span>No published pattern has entered the register yet.</span>' +
      '</div>';
    return;
  }

  const rows = patterns.slice(0, 6).map((pattern) => {
    const sources = extractPatternSources(pattern);
    const dated = sources
      .map((source) => ({
        id: source.id,
        dateMs: source.dateMs ?? sourceDateMap.get(source.id) ?? null
      }))
      .filter((source) => source.dateMs != null);
    return { pattern, sources, dated };
  });

  const allDates = rows.flatMap((row) => row.dated.map((source) => source.dateMs));
  let minMs = allDates.length ? Math.min(...allDates) : null;
  let maxMs = allDates.length ? Math.max(...allDates) : null;

  if (minMs != null && maxMs != null && minMs === maxMs) {
    minMs -= 12 * 60 * 60 * 1000;
    maxMs += 12 * 60 * 60 * 1000;
  }

  const axisStart = minMs == null ? 'SOURCE DATES NOT LINKED' : formatAxisDate(minMs);
  const axisEnd = maxMs == null ? 'NO TEMPORAL POSITION' : formatAxisDate(maxMs);

  let html =
    '<div class="pattern-axis">' +
      '<div class="pattern-axis-label instrument-meta">SOURCE SPAN</div>' +
      '<div class="pattern-axis-range"><span>' + escapeHtml(axisStart) + '</span><span>' + escapeHtml(axisEnd) + '</span></div>' +
    '</div>';

  rows.forEach((row) => {
    const pattern = row.pattern;
    const title = pattern.title || pattern.description || 'Observed pattern';
    const supportCount = pattern.supportCount == null ? row.sources.length : pattern.supportCount;
    const supportLabel = supportCount
      ? String(supportCount) + ' SUPPORT' + (Number(supportCount) === 1 ? '' : 'S')
      : 'SUPPORT COUNT NOT RECORDED';

    const ticks = minMs == null || maxMs == null
      ? ''
      : row.dated.map((source) => {
          const position = Math.max(0, Math.min(100, ((source.dateMs - minMs) / (maxMs - minMs)) * 100));
          return '<i class="pattern-source-tick" style="left:' + position.toFixed(3) + '%" title="' +
            escapeHtml(formatDateTime(new Date(source.dateMs).toISOString())) + '"></i>';
        }).join('');

    const linkage = row.sources.length
      ? String(row.dated.length) + '/' + String(row.sources.length) + ' SOURCE DATES'
      : 'SOURCE IDS NOT LINKED';

    html +=
      '<div class="pattern-track" data-pattern-id="' + escapeHtml(pattern.id) + '">' +
        '<div class="pattern-track-label">' +
          '<strong>' + escapeHtml(title) + '</strong>' +
          '<span>' + escapeHtml(supportLabel + ' · ' + linkage) + '</span>' +
        '</div>' +
        '<div class="pattern-track-line">' +
          ticks +
          (row.dated.length ? '' : '<span class="pattern-unlinked">NO SYNTHETIC POSITION</span>') +
        '</div>' +
      '</div>';
  });

  els.patternField.innerHTML = html;
}

async function loadPatterns() {
  if (!currentUser) return;
  els.patternList.innerHTML = '';
  els.patternEmpty.hidden = true;
  try {
    const snapshot = await getDocs(query(datasetCollection('patterns'), orderBy('updatedAtMs', 'desc'), limit(50)));
    const patterns = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    currentPatterns = patterns;
    if (!selectedV5PatternId && patterns.length) selectedV5PatternId = patterns[0].id;
    const sourceDates = patterns.length ? await loadPatternSourceDates(patterns) : new Map();

    renderPatternRegister(patterns, sourceDates);
    els.patternList.innerHTML = patterns.map(renderPattern).join('');
    els.patternEmpty.hidden = patterns.length > 0;
    await track('discover_loaded', {
      patterns: patterns.length,
      sourceDatesResolved: sourceDates.size
    });
    animatePatternField();
    animateRenderedItems('.pattern-card');
    animateV4PatternEvidence();
    if (patterns.length) {
      await logExposure('derived_patterns_viewed', { patternIds: patterns.map((p) => p.id), count: patterns.length });
    }
  } catch (error) {
    console.error(error);
    els.patternField.innerHTML = meaningFirstExperience()
      ? '<span>Patterns could not be loaded.</span>'
      : '<div class="pattern-register-empty"><span class="instrument-meta">DERIVED STRUCTURE</span><span>The pattern register could not be loaded.</span></div>';
    els.patternEmpty.textContent = 'Derived patterns could not be loaded.';
    els.patternEmpty.hidden = false;
  }
}

function renderPattern(pattern) {
  const title = pattern.title || pattern.description || 'Observed pattern';
  const summary = pattern.summary || pattern.statement || pattern.description || '';
  const status = pattern.status || 'observed';
  const confidence = pattern.confidence == null ? '' : 'confidence ' + pattern.confidence;
  const supportCount = pattern.supportCount == null ? null : Number(pattern.supportCount);
  const support = supportCount == null ? '' : supportCount + ' supporting moment' + (supportCount === 1 ? '' : 's');

  if (visualSpecimenExperience()) {
    return '<article class="pattern-card" data-pattern-id="' + escapeHtml(pattern.id) + '" data-selected="' + (pattern.id === selectedV5PatternId ? 'true' : 'false') + '">' +
      '<div class="pattern-main">' +
        '<p class="pattern-kicker">Observed pattern</p>' +
        '<h3>' + escapeHtml(title) + '</h3>' +
        '<p>' + escapeHtml(summary) + '</p>' +
        '<div class="pattern-foot">' + (support ? '<span>' + escapeHtml(support) + '</span>' : '') + '</div>' +
      '</div>' +
    '</article>';
  }

  if (meaningFirstExperience()) {
    const sourceRefs = extractPatternSources(pattern);
    const evidence = sourceRefs.slice(0, 3).map((source) => {
      const detail = patternSourceDetails.get(source.id) || source;
      const dateMs = detail.dateMs ?? source.dateMs;
      const date = Number.isFinite(dateMs) ? formatDateTime(new Date(dateMs).toISOString()) : 'Date unavailable';
      const sourceType = detail.sourceType || 'observation';
      const text = sourceType === 'mark'
        ? 'Moment preserved'
        : (detail.rawText || 'Supporting raw observation');
      const sourceClass = sourceType === 'voice' ? ' voice' : sourceType === 'text' ? ' text' : ' mark';
      return '<div class="pattern-source" data-source="' + escapeHtml(sourceType) + '" data-observation-id="' + escapeHtml(source.id) + '">' +
        '<time class="source-imprint' + sourceClass + '">' + escapeHtml(date) + '</time>' +
        '<span>' + escapeHtml(text) + '</span>' +
      '</div>';
    }).join('');

    return '<article class="pattern-card" data-pattern-id="' + escapeHtml(pattern.id) + '">' +
      '<div class="pattern-main">' +
        '<p class="pattern-kicker">Observed pattern</p>' +
        '<h3>' + escapeHtml(title) + '</h3>' +
        '<p>' + escapeHtml(summary) + '</p>' +
        '<div class="pattern-foot">' +
          (support ? '<span>' + escapeHtml(support) + '</span>' : '') +
          (confidence ? '<span>' + escapeHtml(confidence) + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<aside class="pattern-evidence">' +
        '<strong>Supporting moments</strong>' +
        (evidence || '<div class="pattern-source-empty">Source moments are not linked yet. No evidence position is invented.</div>') +
      '</aside>' +
    '</article>';
  }

  return '<article class="pattern-card" data-pattern-id="' + escapeHtml(pattern.id) + '">' +
    '<h3>' + escapeHtml(title) + '</h3>' +
    '<p>' + escapeHtml(summary) + '</p>' +
    '<div class="pattern-foot">' +
      '<span>' + escapeHtml(status) + '</span>' +
      (confidence ? '<span>' + escapeHtml(confidence) + '</span>' : '') +
      (support ? '<span>' + escapeHtml(support) + '</span>' : '') +
    '</div>' +
  '</article>';
}

async function switchView(view, source = 'nav') {
  if (!['observe', 'timeline', 'discover'].includes(view)) return;

  const commitSwitch = async () => {
    currentView = view;
    $$('.view').forEach((node) => node.classList.toggle('active', node.dataset.view === view));
    $$('.nav-item').forEach((node) => node.classList.toggle('active', node.dataset.nav === view));
  };

  if (document.startViewTransition && !reducedMotion()) {
    const transition = document.startViewTransition(commitSwitch);
    await transition.finished.catch(() => {});
  } else {
    await commitSwitch();
  }

  animateCurrentView(view);
  await track('view_open', { view, source });

  if (view === 'timeline') {
    await logExposure('raw_history_reviewed', { surface: 'stream' });
    await loadTimeline();
  }
  if (view === 'discover') {
    await loadPatterns();
  }
}

function setupVersionControls() {
  if (!els.versionControls || !UI_VERSIONS.length) return;

  const options = UI_VERSIONS.map((version) => {
    const suffix = version.id === LATEST_UI_VERSION ? ' — Latest' : '';
    return '<option value="' + escapeHtml(version.id) + '"' + (version.id === UI_VERSION ? ' selected' : '') + '>' +
      escapeHtml(version.label + suffix) +
    '</option>';
  }).join('');

  els.versionControls.innerHTML =
    '<label for="experienceVersion">Experience version</label>' +
    '<select id="experienceVersion">' + options + '</select>' +
    '<small>Switches the interface only. Your account, observations and research data stay the same.</small>';

  $('#experienceVersion')?.addEventListener('change', async (event) => {
    const next = event.target.value;
    if (!UI_VERSIONS.some((version) => version.id === next) || next === UI_VERSION) return;

    await track('ui_version_selected', { from: UI_VERSION, to: next }).catch(() => {});
    localStorage.setItem(UI_STORAGE_KEY, next);

    const url = new URL(location.href);
    url.searchParams.delete('ui');
    location.replace(url.toString());
  });
}

function bindEvents() {
  setupVersionControls();
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

  els.timelineList.addEventListener('click', (event) => {
    const item = event.target.closest('.timeline-item');
    if (item?.dataset.observationId) openMoment(item.dataset.observationId);
  });

  els.streamRegister?.addEventListener('click', (event) => {
    const specimenNode = event.target.closest('.v5-stream-node[data-observation-id]');
    if (specimenNode?.dataset.observationId) {
      openMoment(specimenNode.dataset.observationId);
      track('stream_visual_open', { observationId: specimenNode.dataset.observationId });
      return;
    }
    const tick = event.target.closest('.stream-register-tick');
    if (!tick?.dataset.observationId) return;
    const item = els.timelineList.querySelector('[data-observation-id="' + CSS.escape(tick.dataset.observationId) + '"]');
    if (!item) return;
    item.classList.remove('register-focus');
    item.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'center' });
    requestAnimationFrame(() => item.classList.add('register-focus'));
    setTimeout(() => item.classList.remove('register-focus'), 1200);
    track('stream_register_seek', { observationId: tick.dataset.observationId });
  });

  els.patternList?.addEventListener('click', async (event) => {
    const patternCard = event.target.closest('.pattern-card[data-pattern-id]');
    if (visualSpecimenExperience() && patternCard?.dataset.patternId) {
      selectedV5PatternId = patternCard.dataset.patternId;
      $('.pattern-card[data-pattern-id]').forEach((card) => {
        card.dataset.selected = card.dataset.patternId === selectedV5PatternId ? 'true' : 'false';
      });
      renderPatternRegister(currentPatterns, new Map());
      track('pattern_visual_select', { patternId: selectedV5PatternId });
      return;
    }
    const source = event.target.closest('.pattern-source[data-observation-id]');
    if (!source?.dataset.observationId) return;
    const observationId = source.dataset.observationId;
    if (!timelineItems.some((item) => item.id === observationId)) await loadTimeline();
    await openMoment(observationId);
    track('pattern_source_open', { observationId });
  });

  els.patternField?.addEventListener('click', async (event) => {
    const node = event.target.closest('.v5-pattern-node[data-observation-id]');
    if (!node?.dataset.observationId) return;
    const observationId = node.dataset.observationId;
    if (!timelineItems.some((item) => item.id === observationId)) await loadTimeline();
    await openMoment(observationId);
    track('pattern_visual_source_open', { observationId, patternId: selectedV5PatternId });
  });

  els.closeMomentBtn?.addEventListener('click', () => els.momentDialog.close());
  els.momentDialog?.addEventListener('click', (event) => {
    if (event.target === els.momentDialog) els.momentDialog.close();
  });

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

  const revealAuthenticatedShell = () => {
    els.authGate.hidden = true;
    els.appShell.hidden = false;
  };

  if (document.startViewTransition && !reducedMotion()) {
    const transition = document.startViewTransition(revealAuthenticatedShell);
    await transition.finished.catch(() => {});
  } else {
    revealAuthenticatedShell();
  }

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

  requestAnimationFrame(animateObserveEntrance);
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

setupV5StaticVisuals();
bindEvents();

if ('serviceWorker' in navigator) {
  let reloadingForWorker = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForWorker) return;
    reloadingForWorker = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      await registration.update();
    } catch {}
  });
}
