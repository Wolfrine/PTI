// Carry the release identity through the Studio graph, including a phone whose
// older HTTP cache predates the new revalidation headers or service worker.
const localModule = relative => {
  const url = new URL(relative, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return import(url.href);
};
const { MODELS, makeJob, workerOnline, deviceApproved, devicePending, deviceCanQueue } = await localModule('./studio-contract.mjs');
const { PC_DEVICE_UID } = await localModule('./device-config.mjs');

const STATUS_COPY = {
  queued: 'Queued for your PC', running: 'Generating on your PC', completed: 'Ready for your review',
  failed: 'Generation stopped', expired: 'Request expired', cancelled: 'Request cancelled'
};
const ERRORS = {
  'resource-guard': 'The PC stopped this request to protect memory or temperature. Try again when it is ready.',
  'model-unavailable': 'This model is no longer available on the PC. Refresh its status and choose an installed model.',
  'inference-failed': 'The local model could not finish this request. Your original prompt is kept below.',
  'interrupted': 'The worker session ended during this request. It was not automatically generated again.',
  'expired': 'The PC did not claim this request within seven days. Send a new request when you are ready.',
  'invalid-output': 'The output failed its integrity check. No substitute image is shown.',
  'output-too-large': 'The image exceeds this first pass’s private transfer limit. The original remains on the PC.',
  resource_guard: 'The PC paused this request to protect memory or temperature. Try again when it is ready.',
  model_missing: 'This model is no longer available on the PC. Refresh the worker and choose an installed model.',
  generation_failed: 'The local model could not finish this request. Your original prompt is kept below.',
  worker_timeout: 'The PC did not finish in time. Check the worker before trying again.'
};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const modelLabel = id => MODELS.find(model => model.id === id)?.label || 'Local model';
const pendingJob = (job,now=Date.now()) => job.status === 'running' || (job.status === 'queued' && job.expiresAt > now);

export function formatJobStatus(job) {
  if (job?.status === 'running' && Number.isFinite(job.progress?.step) && Number.isFinite(job.progress?.total) && job.progress.total > 0) {
    return `Generating · step ${job.progress.step} of ${job.progress.total}`;
  }
  return STATUS_COPY[job?.status] || 'Waiting for status';
}

export async function decodeResult(result, chunks) {
  if (result?.mime !== 'image/png' || !Number.isInteger(result.chunks) || result.chunks < 1 || result.chunks > 16 ||
      !Number.isInteger(result.bytes) || result.bytes < 8 || result.bytes > 7200000 || !/^[a-f0-9]{64}$/.test(result.sha256 || '') ||
      chunks.length !== result.chunks) throw new Error('Invalid image manifest');
  const ordered = [...chunks].sort((a, b) => a.index - b.index);
  const parts = ordered.map((chunk, index) => {
    if (chunk.index !== index || typeof chunk.data !== 'string' || !chunk.data.length || chunk.data.length > 600000 ||
        !/^[A-Za-z0-9+/]*={0,2}$/.test(chunk.data)) throw new Error('Invalid image chunk');
    return Uint8Array.from(atob(chunk.data), value => value.charCodeAt(0));
  });
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  parts.forEach(part => { bytes.set(part, offset); offset += part.length; });
  if (bytes.length !== result.bytes || [137, 80, 78, 71, 13, 10, 26, 10].some((value, index) => bytes[index] !== value)) throw new Error('Image size or format mismatch');
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (digest !== result.sha256) throw new Error('Image integrity check failed');
  return new Blob([bytes], { type: 'image/png' });
}

// Presentation exports also serve the local-only QA fixture. They do not authenticate or write data.
export function renderStudioShell(root) {
  root.innerHTML = `
    <div class="studio-head"><div><span class="eyebrow">Your PC · your direction</span><h1>Studio</h1></div><span class="studio-private">Private drafts</span></div>
    <div class="studio-worker" id="studioWorker" role="status"><i></i><div><strong>Checking your PC</strong><span>Installed models and live availability are checked separately.</span></div><button type="button" id="studioRefresh" aria-label="Refresh PC status">Refresh</button></div>
    <section class="studio-device" id="studioDevice" aria-labelledby="studioDeviceHeading"><div class="studio-device-title"><h2 id="studioDeviceHeading">Your remote PC</h2><span id="studioDeviceBadge">Checking</span></div><p id="studioDeviceCopy">Checking this PC’s secure device approval.</p><div class="studio-device-actions"><button type="button" id="studioApprove" hidden>Approve this PC</button><button type="button" id="studioRevoke" hidden>Revoke PC access</button></div><p class="studio-device-note">Approve once here in Velum. The worker reconnects automatically while Windows is awake and your Windows session is signed in. No local sign-in or repeated pairing.</p></section>
    <form id="studioForm" class="studio-form">
      <label class="studio-label" for="studioModel">Local model <span id="studioInstalled">Not verified yet</span></label>
      <select id="studioModel" class="studio-input" aria-describedby="studioModelHint">${MODELS.map(model => `<option value="${escapeHTML(model.id)}" disabled>${escapeHTML(model.label)}</option>`).join('')}</select>
      <p id="studioModelHint" class="studio-hint">${escapeHTML(MODELS[0]?.hint || '')}</p>
      <label class="studio-label studio-prompt-label" for="studioPrompt">Your prompt <span>Sent verbatim</span></label>
      <textarea id="studioPrompt" class="studio-input studio-prompt" rows="6" maxlength="6000" placeholder="Describe the image you want to make…" spellcheck="false" autocomplete="off" aria-describedby="studioPromptHint"></textarea>
      <p id="studioPromptHint" class="studio-hint">Your words go directly to the model. No prompt enhancer or hidden rewrite. Up to 6,000 characters.</p>
      <div class="studio-settings"><label for="studioSeed"><span class="studio-label">Seed</span><input class="studio-input" id="studioSeed" type="number" min="0" max="2147483647" step="1" inputmode="numeric" placeholder="Random" /></label><div class="studio-format"><span class="studio-label">Image</span><strong>768 × 1024</strong><span>Portrait · PNG</span></div></div>
      <label class="studio-consent"><input id="studioConsent" type="checkbox" required /><span>I am an adult. My request is lawful; any people depicted are adults and any required consent is in place.</span></label>
      <button class="studio-generate" id="studioGenerate" type="submit" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3Z"/></svg><span>Generate on my PC</span></button>
      <p class="studio-submit-note" id="studioSubmitNote">Approve your PC once to send private requests from anywhere.</p>
      <p class="studio-message" id="studioMessage" role="status" hidden></p>
    </form>
    <section class="studio-results" aria-labelledby="studioResultsHeading"><div class="studio-section-head"><h2 id="studioResultsHeading">Your results</h2><span>Only real outputs</span></div><div id="studioJobs" class="studio-jobs"></div><div id="studioResult"><div class="studio-empty"><span class="studio-empty-mark" aria-hidden="true">V</span><h3>A space for your next image</h3><p>Choose an installed model, write your prompt, then generate on your PC. Results stay separate from your Drive gallery.</p></div></div></section>`;
  return root;
}

export function renderStudioState(root, state) {
  const now = state.now ?? Date.now();
  state = {...state,jobs:(state.jobs || []).map(job=>job.status === 'queued' && job.expiresAt <= now ? {...job,status:'expired'} : job)};
  const worker = state.worker;
  const approved = deviceApproved(state.binding);
  const pending = devicePending(state.binding, now);
  const revoked = state.binding?.deviceUid===PC_DEVICE_UID && state.binding.status==='revoked';
  const online = approved && workerOnline(worker, now);
  const installed = worker?.deviceUid===PC_DEVICE_UID && Array.isArray(worker.installed) ? worker.installed.filter(id=>MODELS.some(model=>model.id===id)) : [];
  const workerEl = root.querySelector('#studioWorker');
  workerEl.classList.toggle('online', online);
  workerEl.querySelector('strong').textContent = online ? (worker.state === 'running' ? 'PC is generating' : 'PC is ready') : approved ? 'PC is offline' : 'PC approval required';
  workerEl.querySelector('span').textContent = online ? 'Secure device connection · one image at a time' : approved ? 'Requests wait here. Your PC picks them up when it reconnects.' : 'Your owner account controls which PC may generate.';
  root.querySelector('#studioDeviceBadge').textContent = approved ? 'Approved' : pending ? 'Awaiting you' : state.binding?.status==='revoked' ? 'Revoked' : state.binding?.status==='pending' ? 'Grant expired' : 'Not enrolled';
  root.querySelector('#studioDeviceCopy').textContent = approved ? 'This PC can receive your requests. Its private device sign-in survives worker restarts; you can revoke access here.' : pending ? `${state.binding.label || 'Your local PC'} is ready for approval. Only this installed device receives access. Approve before ${new Date(state.binding.expiresAt).toLocaleString()}.` : revoked ? 'This PC can no longer receive jobs or read private results. Re-enable it here only when you want the same installed PC to have access again.' : state.binding?.status==='pending' ? 'This one-time approval request expired. The worker will renew its request automatically when it reconnects.' : 'Waiting for the installed worker to request secure enrollment. Refresh when your PC is online.';
  const approveButton = root.querySelector('#studioApprove');
  approveButton.hidden = (!pending && !revoked) || !state.signedIn;
  approveButton.disabled = Boolean(state.bindingBusy || state.connected===false);
  approveButton.textContent = state.bindingBusy==='approve' ? 'Approving…' : revoked ? 'Re-enable this PC' : 'Approve this PC';
  const revokeButton = root.querySelector('#studioRevoke');
  revokeButton.hidden = !approved || !state.signedIn;
  revokeButton.disabled = Boolean(state.bindingBusy || state.connected===false);
  revokeButton.textContent = state.bindingBusy==='revoke' ? 'Revoking…' : 'Revoke PC access';
  root.querySelector('#studioInstalled').textContent = installed.length ? `${MODELS.filter(model => installed.includes(model.id)).length} installed` : 'Not verified yet';
  root.querySelectorAll('#studioModel option').forEach(option => { option.disabled = !installed.includes(option.value); });
  const select = root.querySelector('#studioModel');
  if (!installed.includes(select.value) && installed.length) select.value = MODELS.find(model => installed.includes(model.id))?.id || '';
  root.querySelector('#studioModelHint').textContent = MODELS.find(model => model.id === select.value)?.hint || 'Choose a verified installed model.';
  const busyJob = state.jobs?.some(job => pendingJob(job,now));
  const canSubmit = Boolean(state.signedIn && deviceCanQueue(state.binding, worker, select.value) && !busyJob && !state.submitting &&
    root.querySelector('#studioPrompt').value.trim() && root.querySelector('#studioConsent').checked && state.connected !== false);
  root.querySelector('#studioGenerate').disabled = !canSubmit;
  root.querySelector('#studioGenerate span').textContent = state.submitting ? 'Sending request…' : approved && !online ? 'Queue for my PC' : 'Generate on my PC';
  root.querySelector('#studioSubmitNote').textContent = !state.signedIn ? 'Sign in with the owner account to open Studio.' : state.connected === false ? 'Your phone is offline. Reconnect to send a request; confirmed requests remain queued.' : !approved ? 'Approve the installed PC above before sending requests.' : !installed.length ? 'Waiting for the PC to verify installed models for the first time.' : busyJob ? 'One request at a time. Your next prompt can wait here.' : !online ? 'Saved privately for up to seven days. Generation starts when your PC reconnects.' : 'Private draft · no automatic save to your Drive gallery';
  const message = root.querySelector('#studioMessage');
  message.hidden = !state.message;
  message.textContent = state.message || '';
  const jobs = root.querySelector('#studioJobs');
  const jobSignature = (state.jobs || []).map(job => `${job.id}:${job.status}:${job.progress?.step || 0}`).join('|') + `:${state.selectedId}`;
  if (jobs.dataset.signature !== jobSignature) {
    jobs.dataset.signature = jobSignature;
    jobs.replaceChildren(...(state.jobs || []).map(job => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = `studio-job${job.id === state.selectedId ? ' selected' : ''}`; button.dataset.job = job.id;
      const title = document.createElement('strong'); title.textContent = modelLabel(job.model);
      const detail = document.createElement('span'); detail.textContent = formatJobStatus(job);
      button.append(title, detail);
      button.setAttribute('aria-pressed', String(job.id === state.selectedId));
      return button;
    }));
  }
  const job = state.jobs?.find(item => item.id === state.selectedId);
  if (!job) return;
  const result = root.querySelector('#studioResult');
  const resultSignature = `${job.id}:${job.status}:${job.progress?.step || 0}:${state.resultUrl || ''}:${state.resultError || ''}:${online}:${approved}`;
  if (result.dataset.signature === resultSignature) return;
  result.dataset.signature = resultSignature;
  const content = document.createElement('article'); content.className = 'studio-result';
  const status = document.createElement('div'); status.className = `studio-result-status ${job.status}`;
  status.textContent = formatJobStatus(job); content.append(status);
  if (job.status === 'completed' && state.resultUrl) {
    const image = document.createElement('img'); image.className = 'studio-output'; image.src = state.resultUrl; image.alt = 'Generated image for your review'; content.append(image);
    const download = document.createElement('a'); download.className = 'studio-download'; download.href = state.resultUrl; download.download = `velum-${job.seed}.png`; download.textContent = 'Download image'; content.append(download);
  } else {
    const pending = document.createElement('div'); pending.className = `studio-result-placeholder${job.status === 'failed' || state.resultError ? ' error' : ''}`;
    const title = document.createElement('h3'); title.textContent = state.resultError ? 'Preview could not be verified' : job.status === 'completed' ? 'Verifying your image…' : job.status === 'failed' ? 'Generation stopped' : job.status === 'running' ? 'The model is at work' : job.status === 'expired' ? 'Request expired' : 'Waiting for your PC';
    const copy = document.createElement('p'); copy.textContent = state.resultError || (job.status === 'failed' ? (ERRORS[job.error] || `The PC reported ${job.error || 'a generation error'}. You can retry your original prompt.`) : job.status === 'expired' ? 'This request expired before completion. Send a new request when your PC is ready.' : job.status === 'queued' ? `${!approved ? 'Your request remains private. The PC needs your approval before it can receive this job.' : online ? 'Your PC will pick up this request shortly.' : 'Your request is saved privately while the PC is offline. It starts when the PC reconnects.'} Expires ${new Date(job.expiresAt).toLocaleString()}.` : 'The genuine output will appear here when it is ready.');
    pending.append(title, copy); content.append(pending);
  }
  const meta = document.createElement('p'); meta.className = 'studio-result-meta';
  meta.textContent = `${modelLabel(job.model)} · seed ${job.seed} · ${job.width} × ${job.height}${Number.isFinite(job.result?.seconds) ? ` · ${Math.round(job.result.seconds)}s` : ''}`; content.append(meta);
  const settings = document.createElement('details'); settings.className = 'studio-original';
  const summary = document.createElement('summary'); summary.textContent = 'Original prompt & settings';
  const raw = document.createElement('pre'); raw.textContent = job.prompt;
  const settingsCopy = document.createElement('p'); settingsCopy.textContent = job.result?.settings ? JSON.stringify(job.result.settings, null, 2) : 'Exact submitted prompt · portrait PNG';
  settings.append(summary, raw, settingsCopy); content.append(settings);
  if (job.status === 'completed' && state.resultUrl) {
    const feedback = document.createElement('form'); feedback.id = 'studioFeedback'; feedback.className = 'studio-feedback';
    feedback.innerHTML = `<h3>Your eye, your decision</h3><p>Feedback stays with this result for future iteration. It does not rewrite your prompts.</p><fieldset><legend>How does this image work for you?</legend><label><input type="radio" name="verdict" value="keep" required />Keep</label><label><input type="radio" name="verdict" value="iterate" />Iterate</label><label><input type="radio" name="verdict" value="reject" />Reject</label></fieldset><label class="studio-label" for="studioFeedbackNote">Your notes <span>Optional</span></label><textarea class="studio-input" id="studioFeedbackNote" name="note" maxlength="2000" rows="3" placeholder="What would you keep or try next?"></textarea><button class="studio-feedback-save" type="submit">Save feedback</button><span id="studioFeedbackStatus" class="studio-feedback-status" role="status"></span>`;
    if (['keep', 'iterate', 'reject'].includes(state.feedback?.verdict)) feedback.querySelector(`input[value="${state.feedback.verdict}"]`).checked = true;
    feedback.querySelector('textarea').value = state.feedback?.note || '';
    content.append(feedback);
  }
  result.replaceChildren(content);
}

export async function mountStudio({ app, auth }) {
  const root = document.querySelector('#studioView');
  if (!root) return;
  renderStudioShell(root);
  const { getFirestore, doc, collection, query, orderBy, limit, getDoc, getDocs, setDoc, updateDoc } = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore-lite.js');
  const { onAuthStateChanged } = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js');
  const db = getFirestore(app);
  const state = { signedIn: false, connected: navigator.onLine, worker: null, binding: null, bindingBusy: false, jobs: [], selectedId: '', resultUrl: '', feedback: null, message: '' };
  let uid = '', timer = 0, epoch = 0, polling = false, resultJob = '', feedbackJob = '';
  const draw = () => renderStudioState(root, { ...state, now: Date.now() });
  const workspace = () => ['users', uid, 'velumStudio', 'workspace'];
  function clearResult() {
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = ''; state.resultError = ''; state.feedback = null; resultJob = ''; feedbackJob = '';
  }
  async function loadResult() {
    const job = state.jobs.find(item => item.id === state.selectedId);
    if (!job || job.status !== 'completed' || resultJob === job.id) return;
    resultJob = job.id;
    const token = epoch, selected = job.id;
    try {
      const [chunks, feedback] = await Promise.all([
        getDocs(collection(db, ...workspace(), 'jobs', job.id, 'chunks')),
        getDoc(doc(db, ...workspace(), 'feedback', job.id))
      ]);
      const blob = await decodeResult(job.result, chunks.docs.map(item => item.data()));
      if (token !== epoch || selected !== state.selectedId || !uid) return;
      state.resultUrl = URL.createObjectURL(blob);
      state.feedback = feedback.exists() ? feedback.data() : null; feedbackJob = selected;
    } catch {
      if (token !== epoch || selected !== state.selectedId) return;
      state.resultError = 'The image is unavailable or its integrity check failed. No substitute preview is shown.';
      resultJob = '';
    }
    draw();
  }
  async function poll() {
    clearTimeout(timer);
    if (!uid || polling) return;
    polling = true;
    const token = epoch;
    try {
      const [status, jobs, binding] = await Promise.all([
        getDoc(doc(db, ...workspace(), 'status', 'pc')),
        getDocs(query(collection(db, ...workspace(), 'jobs'), orderBy('createdAt', 'desc'), limit(12))),
        getDoc(doc(db, ...workspace(), 'devices', PC_DEVICE_UID))
      ]);
      if (token !== epoch || !uid) return;
      state.worker = status.exists() ? status.data() : null;
      state.binding = binding.exists() ? binding.data() : null;
      state.jobs = jobs.docs.map(item => ({ ...item.data(), id: item.id }));
      if (state.connected === false) state.message = '';
      state.connected = true;
      if (!state.selectedId || !state.jobs.some(job => job.id === state.selectedId)) { clearResult(); state.selectedId = state.jobs[0]?.id || ''; }
      draw(); await loadResult();
    } catch (error) {
      if (token !== epoch || !uid) return;
      state.connected = false;
      state.message = error?.code === 'permission-denied' ? 'Studio is private to its owner. This account does not have access.' : 'Could not reach private Studio. Reconnect to refresh the queue.';
      draw();
    } finally {
      polling = false;
      if (uid && token === epoch) timer = setTimeout(poll, document.hidden ? 30000 : 10000);
      else if (uid) timer = setTimeout(poll, 0);
    }
  }
  root.querySelector('#studioModel').addEventListener('change', draw);
  root.querySelector('#studioPrompt').addEventListener('input', draw);
  root.querySelector('#studioConsent').addEventListener('change', draw);
  root.querySelector('#studioRefresh').addEventListener('click', () => { state.message = ''; clearResult(); root.querySelector('#studioResult').dataset.signature = ''; draw(); poll(); });
  async function changeBinding(action) {
    if (!uid || state.bindingBusy || !navigator.onLine || !state.connected ||
        (action==='approve' ? !(devicePending(state.binding) || (state.binding?.deviceUid===PC_DEVICE_UID && state.binding.status==='revoked')) : !deviceApproved(state.binding))) return;
    const token = epoch;
    state.bindingBusy = action; state.message = ''; draw();
    try {
      const update = action==='approve' ? {status:'approved',approvedAt:Date.now()} : {status:'revoked',revokedAt:Date.now()};
      await updateDoc(doc(db, ...workspace(), 'devices', PC_DEVICE_UID), update);
      if (token!==epoch || !uid) return;
      state.binding = {...state.binding,...update};
      state.message = action==='approve' ? 'PC approved. You can send requests from Velum without local sign-in.' : 'PC access revoked. Private requests are no longer available to this device.';
    } catch {
      if (token===epoch) state.message = 'Device approval was not confirmed. Refresh and try again.';
    } finally {
      if (token===epoch) { state.bindingBusy = false; draw(); poll(); }
    }
  }
  root.querySelector('#studioApprove').addEventListener('click', () => changeBinding('approve'));
  root.querySelector('#studioRevoke').addEventListener('click', () => changeBinding('revoke'));
  root.querySelector('#studioForm').addEventListener('submit', async event => {
    event.preventDefault();
    if (!uid || state.submitting || !navigator.onLine || !state.connected || !deviceApproved(state.binding) || state.jobs.some(job => pendingJob(job))) return;
    const model = root.querySelector('#studioModel').value;
    if (!deviceCanQueue(state.binding,state.worker,model)) return;
    const seedInput = root.querySelector('#studioSeed').value;
    const seed = seedInput === '' ? crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff : Number(seedInput);
    const token = epoch;
    state.submitting = true; state.message = ''; draw();
    try {
      const job = makeJob({ model, prompt: root.querySelector('#studioPrompt').value, seed, consent: root.querySelector('#studioConsent').checked });
      const target = doc(collection(db, ...workspace(), 'jobs'));
      await setDoc(target, job);
      if (token !== epoch || !uid) return;
      clearResult(); state.selectedId = target.id; state.jobs.unshift({ ...job, id: target.id });
      state.message = workerOnline(state.worker) ? 'Request sent. Your prompt was preserved exactly.' : 'Request queued privately. Your PC will receive it when it reconnects; your prompt was preserved exactly.';
    } catch (error) {
      if (token !== epoch) return;
      state.message = error?.code === 'permission-denied' ? 'This account cannot create private Studio requests.' : 'Request was not confirmed. Refresh the queue before trying again.';
    } finally {
      if (token === epoch) { state.submitting = false; draw(); poll(); }
    }
  });
  root.querySelector('#studioJobs').addEventListener('click', event => {
    const id = event.target.closest('[data-job]')?.dataset.job;
    if (!id || id === state.selectedId) return;
    clearResult(); state.selectedId = id; draw(); loadResult();
  });
  root.querySelector('#studioResult').addEventListener('submit', async event => {
    if (event.target.id !== 'studioFeedback') return;
    event.preventDefault();
    const form = event.target, output = form.querySelector('#studioFeedbackStatus');
    if (!uid || !navigator.onLine || !state.connected || feedbackJob !== state.selectedId) { output.textContent = 'Reconnect before saving feedback.'; return; }
    const data = new FormData(form), verdict = data.get('verdict'), note = String(data.get('note') || '');
    if (!['keep', 'iterate', 'reject'].includes(verdict) || note.length > 2000) return;
    const token = epoch, id = state.selectedId, button = form.querySelector('button'); button.disabled = true; output.textContent = 'Saving…';
    try {
      const feedback = { verdict, note, updatedAt: Date.now() };
      await setDoc(doc(db, ...workspace(), 'feedback', id), feedback);
      if (token === epoch && id === state.selectedId) { state.feedback = feedback; output.textContent = 'Feedback saved'; }
    } catch { if (token === epoch) output.textContent = 'Not saved. Reconnect and try again.'; }
    finally { if (token === epoch) button.disabled = false; }
  });
  onAuthStateChanged(auth, user => {
    epoch++; clearTimeout(timer); clearResult(); uid = user?.uid || '';
    state.signedIn = Boolean(uid); state.jobs = []; state.worker = null; state.binding = null; state.bindingBusy = false; state.selectedId = ''; state.message = ''; state.submitting = false;
    root.querySelector('#studioResult').dataset.signature = '';
    root.querySelector('#studioResult').replaceChildren();
    if (!uid) { root.querySelector('#studioPrompt').value = ''; root.querySelector('#studioConsent').checked = false; }
    draw(); if (uid) poll();
  });
  const onlineChanged = () => { state.connected = navigator.onLine; draw(); if (uid && navigator.onLine) poll(); };
  window.addEventListener('online', onlineChanged); window.addEventListener('offline', onlineChanged);
  document.addEventListener('visibilitychange', () => { if (uid && !document.hidden) poll(); });
  window.addEventListener('pagehide', () => { epoch++; clearTimeout(timer); clearResult(); });
  window.addEventListener('pageshow', event => { if (event.persisted && uid) { draw(); poll(); } });
  draw();
  return { refresh: poll };
}
