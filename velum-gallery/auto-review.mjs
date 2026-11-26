const local = name => {
  const url = new URL(name, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return import(url.href);
};
const [{ createReviewStore, INITIAL_REVIEW_MODEL, reviewFinished, reviewId },
  { MODELS, deviceCanQueue, modelReferenceLimit, makeJob, workerOnline },
  { prepareReference, decodeReference }, { createReferencePicker }, { formatJobStatus }] = await Promise.all([
  local('./auto-review-store.mjs'), local('./studio-contract.mjs'), local('./studio-reference.mjs'),
  local('./studio-reference-picker.mjs'), local('./studio-view.mjs')
]);

const failure = {
  intent: ['Missed edit', 'Describe one visible edit and state which area it applies to.'],
  preservation: ['Source details changed', 'Name the source details to preserve and the only region to change.'],
  artifact: ['Visible artifact', 'Name the artifact and its location. Keep the next edit limited to that region.'],
  scope: ['Outside the approved scope', 'Constrain the next edit to a non-intimate change. Review the source and instruction before running it.'],
  other: ['Other', 'Write the observable difference and what would make a later edit acceptable.']
};
const modelName = id => MODELS.find(model => model.id === id)?.label || 'Local model';
const finishedJob = job => ['failed', 'cancelled', 'expired'].includes(job?.status) ||
  (['uploading', 'queued'].includes(job?.status) && job.expiresAt <= Date.now());

export function mountAutoReview({ root, sdk, db, drive, context, decodeResult, compareSync, compareReset }) {
  const modes = root.querySelector('.studio-modes');
  const opener = document.createElement('button');
  opener.type = 'button';
  opener.hidden = true;
  opener.textContent = 'Auto Review';
  opener.setAttribute('aria-haspopup', 'dialog');
  modes.append(opener);
  const dialog = document.createElement('dialog');
  dialog.className = 'studio-dialog studio-auto-review';
  dialog.setAttribute('aria-labelledby', 'autoReviewHeading');
  dialog.innerHTML = `
    <header class="review-header">
      <h2 id="autoReviewHeading">Auto Review</h2>
      <div class="review-actions"><button type="button" class="studio-dialog-exit" data-review="load">Refresh</button>
        <button type="button" class="studio-dialog-exit" data-review="exit">Quick exit</button>
        <button type="button" class="studio-dialog-exit" data-review="close">Close</button></div>
    </header>
    <p class="review-status" role="status" aria-live="polite"></p>
    <div class="review-content" hidden>
      <div class="review-workspace">
        <div class="review-canvas" hidden>
          <img class="review-source" alt="Selected source image" hidden />
          <button type="button" class="studio-image-compare" data-compare-original="" hidden>
            <span class="studio-compare-frame"><img alt="Verified staged edit" draggable="false" />
              <img class="studio-compare-source" data-compare-source alt="Reference supplied to the model" draggable="false" hidden /></span>
            <span class="studio-compare-cue" data-compare-cue aria-live="polite">Hold to peek at the source</span>
          </button>
        </div>
        <div class="review-controls">
          <form class="review-start" hidden>
            <h3>Prepare an edit</h3>
            <button type="button" data-review="source">Choose from References</button>
            <p class="review-filename" hidden></p>
            <label>Editing seed <textarea class="studio-input" name="intent" rows="4" maxlength="6000" required autocomplete="off" spellcheck="false"></textarea></label>
            <p class="studio-hint">Describe the edit in your own words. Velum sends this instruction verbatim.</p>
            <label class="review-confirm"><input name="consent" type="checkbox" required /> I have permission to use this source. The source and requested edit are non-intimate, and any people shown are consenting adults.</label>
            <p class="review-model studio-hint"></p>
            <button type="submit" class="review-primary">Run edit</button>
          </form>
          <section class="review-run" hidden aria-label="Current edit">
            <h3 class="review-run-title"></h3>
            <p class="review-intent"></p>
            <p class="review-run-model studio-hint"></p>
            <div class="review-actions">
              <button type="button" data-review="resume" hidden>Resume reference upload</button>
              <button type="button" data-review="discard" hidden>Close incomplete run</button>
              <button type="button" data-review="result" hidden>Load review</button>
              <button type="button" data-review="grant" hidden>Grant staging folder</button>
              <button type="button" data-review="accept" class="review-primary" hidden>Accept to Drift</button>
              <button type="button" data-review="reject" aria-expanded="false" hidden>Reject…</button>
              <button type="button" data-review="next" hidden>Prepare another edit</button>
            </div>
            <form class="review-rejection" hidden>
              <label>Reason <select class="studio-input" name="reason">${Object.entries(failure).map(([id, [label]]) =>
                `<option value="${id}">${label}</option>`).join('')}</select></label>
              <label>What did you observe? <textarea class="studio-input" name="note" rows="3" maxlength="2000" required></textarea></label>
              <button type="submit">Confirm rejection</button>
            </form>
            <form class="review-learning" hidden>
              <p class="review-analysis"></p>
              <label>Learning draft <textarea class="studio-input" name="learning" rows="4" maxlength="3000" required></textarea></label>
              <div class="review-actions"><button type="submit" value="draft">Save draft</button>
                <button type="submit" value="approve" class="review-primary">Approve learning</button></div>
              <p class="review-approved studio-hint" hidden></p>
              <button type="button" data-review="use-learning" hidden>Use approved guidance in next seed</button>
            </form>
          </section>
        </div>
      </div>
      <div class="review-secondary">
        <details class="review-settings"><summary>Model for future runs</summary>
          <form><label>Model <select class="studio-input" name="model">${MODELS.map(model =>
            `<option value="${model.id}">${model.label}</option>`).join('')}</select></label>
            <p class="review-config studio-hint"></p>
            <button type="submit">Approve model revision</button></form>
        </details>
        <details class="review-history"><summary>Review history</summary>
          <ol></ol><button type="button" data-review="history">Load history</button>
        </details>
      </div>
    </div>`;
  root.append(dialog);

  const $ = selector => dialog.querySelector(selector);
  const action = name => $(`[data-review="${name}"]`);
  const status = text => { $('.review-status').textContent = text; };
  const startForm = $('.review-start');
  const rejectForm = $('.review-rejection');
  const learningForm = $('.review-learning');
  const settingsForm = $('.review-settings form');
  const sourceImage = $('.review-source');
  const compare = $('[data-compare-original]');
  const picker = createReferencePicker({ drive: { listReferences: options => drive.review.listSources(options) },
    fixedFolder: 'references' });
  let session, store, record, current, run, job, approvedLearning, selected, sourceUrl = '', resultUrl = '', compareSource = '';
  let newEdit = false, historyView = false, cursor, attempted = '', busy = false, grantNeeded = false;
  const readyModel = id => {
    const { studio } = context();
    return studio.connected && !studio.liveCached && studio.worker?.capabilities?.promptSchema === 4 && workerOnline(studio.worker) &&
      deviceCanQueue(studio.binding, studio.worker, id) && modelReferenceLimit(studio.worker, id) > 0;
  };
  const model = () => record?.settings?.model || INITIAL_REVIEW_MODEL;
  const admissionOpen = () => record?.activation.until > Date.now();
  const contextReady = () => Boolean(context().owner && context().unlocked && !document.hidden);
  function verifySession(active) {
    if (active !== session || !contextReady() || !dialog.open) throw new DOMException('Review closed', 'AbortError');
  }
  const clearSource = () => {
    if (sourceUrl) URL.revokeObjectURL(sourceUrl);
    sourceUrl = '';
    selected = null;
    sourceImage.removeAttribute('src');
  };
  function clearComparison() {
    compareReset();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    if (compareSource) URL.revokeObjectURL(compareSource);
    resultUrl = compareSource = '';
    compare.querySelectorAll('img').forEach(image => image.removeAttribute('src'));
  }
  function clear() {
    session?.abort();
    session = store = record = current = run = job = approvedLearning = cursor = null;
    picker.clear();
    clearSource();
    clearComparison();
    attempted = '';
    newEdit = historyView = busy = grantNeeded = false;
    startForm.reset();
    rejectForm.reset();
    learningForm.reset();
    settingsForm.reset();
    rejectForm.hidden = true;
    action('reject').setAttribute('aria-expanded', 'false');
    $('.review-intent').textContent = '';
    $('.review-filename').textContent = '';
    $('.review-approved').textContent = '';
    $('.review-analysis').textContent = '';
    $('.review-history ol').replaceChildren();
    $('.review-history').open = $('.review-settings').open = false;
    action('history').textContent = 'Load history';
    action('history').hidden = false;
    status('');
  }
  function render() {
    $('.review-content').hidden = !record;
    if (!record) return;
    const canStart = !busy && admissionOpen() && readyModel(model()) && !context().studioBusy;
    const exhausted = (record.current?.started || 0) >= record.activation.maxRuns;
    const starting = !historyView && (!current || (reviewFinished(current) && newEdit));
    const staged = run?.phase === 'staged';
    const accepting = run?.phase === 'accepting';
    const pending = run?.phase === 'pending';
    const complete = job?.status === 'completed';
    const ready = Boolean(staged && resultUrl);
    startForm.hidden = !starting;
    $('.review-run').hidden = starting || !run;
    $('.review-canvas').hidden = !((starting && selected) || ready);
    sourceImage.hidden = !starting || !selected;
    compare.hidden = !ready;
    $('.review-filename').textContent = selected?.source.name || '';
    $('.review-filename').hidden = !selected;
    $('.review-model').textContent = !admissionOpen() ? 'The approved admission window has ended.' : exhausted ? 'The approved run limit has been reached.' :
      `${modelName(model())}${readyModel(model()) ? '' : ' · Awaiting a fresh, approved PC capability'}`;
    startForm.querySelector('button[type="submit"]').disabled = !canStart || exhausted || !selected;
    action('source').disabled = busy || exhausted || !admissionOpen();
    $('.review-run-title').textContent = ({ pending: 'Editing', staged: 'Ready for review', accepting: 'Finishing acceptance',
      accepted: 'Accepted into Private', rejected: 'Rejected', closed: 'Closed' })[run?.phase] || '';
    $('.review-intent').textContent = job?.prompt || '';
    $('.review-run-model').textContent = job?.model ? `${modelName(job.model)} · Sampling seed ${job.seed}` : '';
    action('load').disabled = busy;
    action('resume').hidden = !admissionOpen() || !pending || job?.status !== 'uploading' || finishedJob(job);
    action('discard').hidden = !pending || !(finishedJob(job) || job?.status === 'uploading' || complete);
    action('discard').textContent = complete ? 'Close without accepting' : 'Close incomplete run';
    action('result').hidden = !(pending && complete || staged && !resultUrl);
    action('result').textContent = pending ? 'Retry Drive staging' : 'Load review';
    action('grant').hidden = !pending || !complete || !grantNeeded;
    action('accept').hidden = !ready && !accepting;
    action('accept').textContent = accepting ? 'Finish moving into Private' : 'Accept to Drift';
    action('reject').hidden = !ready;
    if (!ready) rejectForm.hidden = true;
    action('next').hidden = !reviewFinished(current) || starting || exhausted;
    learningForm.hidden = run?.phase !== 'rejected';
    $('.review-analysis').textContent = run?.phase === 'rejected' ? `${failure[run.reason][0]} · ${run.note}\n${run.analysis}` : '';
    $('.review-approved').hidden = !approvedLearning;
    $('.review-approved').textContent = approvedLearning ? `Approved guidance\n${approvedLearning.text}` : '';
    action('use-learning').hidden = !approvedLearning || !reviewFinished(current) || exhausted || !admissionOpen();
    $('.review-config').textContent = record.settings ? `Approved for later runs: ${modelName(model())}` : `Default: ${modelName(model())}`;
    settingsForm.elements.model.value ||= model();
    for (const button of dialog.querySelectorAll('.review-run button, .review-secondary button')) button.disabled = busy;
    settingsForm.querySelector('button').disabled = busy || !admissionOpen() || settingsForm.elements.model.value === model() || !readyModel(settingsForm.elements.model.value);
    compareSync();
  }

  async function withAction(work) {
    const active = session;
    if (!active || busy) return;
    busy = true;
    render();
    try { verifySession(active); await work(active); }
    catch (error) {
      if (active === session) {
        if (error.code === 'drive/review-folder-grant') grantNeeded = true;
        status(error.code === 'permission-denied' ? 'Auto Review is unavailable for this session or its approved limit has changed.' :
          error.message || 'The action could not be confirmed. Refresh before retrying.');
      }
    } finally {
      if (active === session) { busy = false; render(); }
    }
  }

  async function inspectRun(id, value, active) {
    clearComparison();
    run = { ...value, id };
    job = await store.job(id);
    approvedLearning = await store.readRevision(run.learningId);
    verifySession(active);
    learningForm.elements.learning.value = run.draft || '';
    status(run.phase === 'pending' ? formatJobStatus(job) : '');
  }

  async function reload(active) {
    historyView = newEdit = false;
    rejectForm.hidden = true;
    action('reject').setAttribute('aria-expanded', 'false');
    record = await store.load();
    verifySession(active);
    if (!record) { status('Auto Review is awaiting production activation.'); return; }
    settingsForm.elements.model.value = model();
    current = record.run;
    if (current) await inspectRun(record.current.runId, current, active);
    else status('');
  }

  async function chooseSource(active) {
    await drive.authorize();
    verifySession(active);
    const [file] = await picker.choose({ limit: 1 });
    verifySession(active);
    if (!file) return;
    const actual = await drive.review.loadSource(file.id, active.signal);
    const prepared = await prepareReference(actual.blob, actual.source);
    if (active !== session) { URL.revokeObjectURL(prepared.url); return; }
    clearSource();
    selected = { ...prepared, version: actual.version, source: actual.source };
    sourceUrl = prepared.url;
    sourceImage.src = sourceUrl;
    startForm.elements.consent.checked = false;
    status('');
  }

  async function submit(active) {
    if (!selected || !admissionOpen() || !startForm.elements.consent.checked || !readyModel(model()) || context().studioBusy) return;
    const approvedModel = model();
    const source = selected;
    const intent = startForm.elements.intent.value;
    await drive.review.checkSource(source.source.id, source.version, active.signal);
    const stageFolderId = await drive.review.stageFolder(active.signal);
    verifySession(active);
    if (!readyModel(approvedModel) || context().studioBusy) throw new Error('The PC is busy or its approved model is unavailable.');
    const id = `review-${reviewId()}`;
    job = makeJob({ model: approvedModel, prompt: intent, effectivePrompt: intent, consent: true,
      seed: crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff, references: [{ ...source.manifest, index: 0 }] });
    const agreement = { createdAt: job.createdAt, phase: 'pending', configId: record.settings?.id || '',
      sourceVersion: source.version, nonIntimate: true, stageFolderId };
    await store.start(id, job, agreement);
    current = run = { ...agreement, id };
    record.current = { runId: id, started: (record.current?.started || 0) + 1 };
    newEdit = false;
    clearSource();
    startForm.reset();
    render();
    status('Transferring the verified reference…');
    await store.queue(id, job, source.chunks);
    job = await store.job(id);
    status(formatJobStatus(job));
  }

  async function resume(active) {
    if (!readyModel(job.model)) throw new Error('The approved PC and original model must be online to resume.');
    const reference = job.references[0];
    await drive.authorize();
    verifySession(active);
    const actual = await drive.review.loadSource(reference.source.id, active.signal);
    if (actual.version !== run.sourceVersion) throw new Error('This source has changed. Close the incomplete run to make a new selection.');
    const prepared = await prepareReference(actual.blob, actual.source);
    URL.revokeObjectURL(prepared.url);
    verifySession(active);
    if (prepared.manifest.sha256 !== reference.sha256) throw new Error('The prepared source differs on this device. Resume from the original browser or close the incomplete run.');
    await store.queue(run.id, job, prepared.chunks);
    job = await store.job(run.id);
    status(formatJobStatus(job));
  }

  async function showResult(active, reconnect = false) {
    if (reconnect) await drive.authorize();
    verifySession(active);
    const signal = AbortSignal.any([active.signal, AbortSignal.timeout(180000)]);
    let blob;
    if (run.phase === 'pending') {
      status('Verifying the edit before private staging…');
      blob = await decodeResult(job.result, await store.chunks(run.id));
      verifySession(active);
      const fileId = await drive.review.stage({ job, blob, run, signal,
        onProgress: value => { if (active === session && typeof value === 'number') status(`Staging privately in Drive · ${Math.round(value * 100)}%`); } });
      verifySession(active);
      current = run = { ...await store.transition(run.id, 'pending', { phase: 'staged', fileId }), id: run.id };
      grantNeeded = false;
    }
    if (run.phase !== 'staged') return;
    const [stagedImage, source] = await Promise.all([
      blob || drive.review.readStaged(run, job, signal),
      decodeReference(job.references[0], await store.chunks(run.id, true))
    ]);
    verifySession(active);
    compareSource = URL.createObjectURL(source);
    resultUrl = URL.createObjectURL(stagedImage);
    compare.dataset.compareOriginal = run.id;
    compare.querySelector('img').src = resultUrl;
    status('Staged privately in Drive. Hold the image to peek at the source, or tap to switch.');
  }

  async function grantStage(active) {
    await drive.authorize();
    verifySession(active);
    // Google's Picker is outside the native dialog's top layer.
    dialog.close();
    dialog.show();
    try { await drive.review.grantStage(run, active.signal); }
    finally {
      if (session === active && dialog.open) {
        dialog.close();
        dialog.showModal();
      }
    }
    verifySession(active);
    await showResult(active);
  }

  async function accept(active) {
    await drive.authorize();
    verifySession(active);
    if (run.phase === 'staged') {
      current = run = { ...await store.transition(run.id, 'staged', { phase: 'accepting' }), id: run.id };
    }
    if (run.phase === 'accepted') { clearComparison(); status('Accepted into Private. Sync the gallery to see it in Drift.'); return; }
    render();
    status('Finishing the same Drive move…');
    await drive.review.accept(run, job, AbortSignal.any([active.signal, AbortSignal.timeout(120000)]));
    verifySession(active);
    current = run = { ...await store.transition(run.id, 'accepting', { phase: 'accepted', finishedAt: Date.now() }), id: run.id };
    clearComparison();
    status('Drive verified the same PNG directly in Private. Sync the gallery to see it in Drift.');
  }

  async function reject(active) {
    const reason = rejectForm.elements.reason.value;
    const note = rejectForm.elements.note.value.trim();
    if (!note) throw new Error('Describe what you observed before rejecting.');
    const analysis = failure[reason][1];
    const draft = `${note}\n\nNext edit: ${analysis}`;
    current = run = { ...await store.transition(run.id, 'staged', { phase: 'rejected', finishedAt: Date.now(),
      reason, note, analysis, draft, learningId: '' }), id: run.id };
    verifySession(active);
    clearComparison();
    learningForm.elements.learning.value = run.draft;
    status('Rejected. The image stays in private staging. Review the proposed learning below.');
  }

  function autoStage() {
    if (!session || !contextReady() || busy || historyView || run?.phase !== 'pending' || job?.status !== 'completed' || attempted === run.id) return;
    attempted = run.id;
    void withAction(active => showResult(active));
  }

  opener.addEventListener('click', () => {
    if (!contextReady() || dialog.open) return;
    clear();
    dialog.showModal();
    const active = session = new AbortController();
    store = createReviewStore({ sdk, db, workspace: context().workspace, check: () => verifySession(active) });
    status('Opening private review…');
    void withAction(reload).then(autoStage);
  });
  dialog.addEventListener('close', () => { if (!dialog.open) clear(); });
  dialog.addEventListener('click', event => {
    const button = event.target.closest('button[data-review]');
    if (!button) return;
    const name = button.dataset.review;
    if (name === 'exit') { window.dispatchEvent(new Event('velum:quick-exit')); return; }
    if (name === 'close') { dialog.close(); clear(); return; }
    if (name === 'reject') {
      rejectForm.hidden = !rejectForm.hidden;
      button.setAttribute('aria-expanded', String(!rejectForm.hidden));
      if (!rejectForm.hidden) rejectForm.elements.note.focus();
      return;
    }
    if (name === 'next' || name === 'use-learning') {
      clearComparison(); clearSource(); newEdit = true; historyView = false;
      if (name === 'use-learning') {
        const intent = startForm.elements.intent;
        const nextSeed = [intent.value, approvedLearning.text].filter(Boolean).join('\n\n');
        if (nextSeed.length > intent.maxLength) { status('The seed and guidance exceed 6,000 characters together.'); render(); return; }
        intent.value = nextSeed;
      }
      status(''); render();
      if (name === 'use-learning') startForm.elements.intent.focus(); else action('source').focus();
      return;
    }
    const handlers = {
      source: chooseSource, resume, accept, load: reload, result: active => showResult(active, true), grant: grantStage,
      discard: async () => {
        current = run = { ...await store.closeFailed(run.id), id: run.id };
        status('Run closed. The PC original and any private staging copy are retained.');
      },
      history: async active => {
        const page = await store.listRuns(cursor);
        verifySession(active);
        cursor = page.cursor;
        const list = $('.review-history ol');
        for (const item of page.records) {
          const row = document.createElement('li');
          const control = document.createElement('button');
          control.type = 'button';
          control.dataset.review = 'history-run';
          control.dataset.id = item.id;
          control.textContent = `${new Date(item.createdAt).toLocaleString()} · ${item.phase}`;
          row.append(control); list.append(row);
        }
        if (!list.childElementCount) status('No reviews yet.');
        action('history').hidden = !cursor;
        action('history').textContent = 'Load older reviews';
      },
      'history-run': async active => {
        const id = button.dataset.id;
        const value = await store.run(id);
        if (!value) throw new Error('This run could not be found.');
        if (id === record.current?.runId) { historyView = false; newEdit = false; current = value; }
        else if (!reviewFinished(value)) throw new Error('Open the current run to continue a review.');
        else historyView = true;
        await inspectRun(id, value, active);
        $('.review-run').scrollIntoView({ block: 'start' });
      }
    };
    if (handlers[name]) void withAction(handlers[name]).then(autoStage);
  });
  dialog.addEventListener('submit', event => {
    event.preventDefault();
    if (event.target === startForm) void withAction(submit).then(autoStage);
    if (event.target === rejectForm) void withAction(reject);
    if (event.target === settingsForm) {
      const requested = settingsForm.elements.model.value;
      if (!readyModel(requested) || requested === model()) return;
      void withAction(async () => {
        record.settings = await store.approveModel(requested, record.settings?.id || '');
        status('Model revision approved for future runs.');
      });
    }
    if (event.target === learningForm) {
      const draft = learningForm.elements.learning.value.trim();
      const approve = event.submitter?.value === 'approve';
      if (!draft) { status('Enter the learning to save.'); return; }
      void withAction(async () => {
        run = { ...await store.saveLearning(run.id, draft, run, approve), id: run.id };
        if (run.id === record.current?.runId) current = run;
        approvedLearning = await store.readRevision(run.learningId);
        status(approve ? 'Learning approved. Refer to it when writing a future seed.' : 'Learning draft saved.');
      });
    }
  });
  settingsForm.addEventListener('change', render);

  return {
    get open() { return dialog.open; },
    close() { if (dialog.open) dialog.close(); clear(); },
    onStudioState(jobs) {
      opener.hidden = !context().owner;
      if (!record || !session || !contextReady()) return;
      const latest = run?.phase === 'pending' && jobs.find(item => item.id === run.id);
      if (latest && !busy && !historyView && !['completed', 'failed', 'cancelled', 'expired'].includes(job?.status)) {
        if (job?.status !== latest.status || job?.progress?.stage !== latest.progress?.stage) status(formatJobStatus(latest));
        job = latest;
      }
      render();
      autoStage();
    },
    comparison() {
      return { job, generatedUrl: resultUrl, previews: { [job?.references?.[0]?.sha256]: compareSource }, locked: !session || !contextReady() };
    },
    async loadOriginal() {
      const active = session;
      const id = run.id;
      const blob = await decodeReference(job.references[0], await store.chunks(id, true));
      verifySession(active);
      if (run.id !== id || !resultUrl || compareSource) return;
      compareSource = URL.createObjectURL(blob);
    }
  };
}
