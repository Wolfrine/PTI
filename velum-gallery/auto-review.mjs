const local = name => {
  const url = new URL(name, import.meta.url);
  url.search = new URL(import.meta.url).search;
  return import(url.href);
};
const [{ createReviewStore, INITIAL_REVIEW_MODEL, REVIEW_SOURCE_SCOPE, REVIEW_GUIDANCE_SCOPE, REVIEW_BATCH_LIMIT, isVisionReviewJob, isConfiguredVisionReviewJob, isOriginalReviewJob, reviewFinished, reviewId },
  { MODELS, deviceCanQueue, modelReferenceLimit, makeJob, workerOnline },
  { prepareReference, decodeReference }, { formatJobStatus }] = await Promise.all([
  local('./auto-review-store.mjs'), local('./studio-contract.mjs'), local('./studio-reference.mjs'),
  local('./studio-view.mjs')
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
          <button type="button" class="studio-image-compare" data-compare-original="" hidden>
            <span class="studio-compare-frame"><img alt="Verified staged edit" draggable="false" />
              <img class="studio-compare-source" data-compare-source alt="Reference supplied to the model" draggable="false" hidden /></span>
            <span class="studio-compare-cue" data-compare-cue aria-live="polite">Hold to peek at the source</span>
          </button>
        </div>
        <div class="review-controls">
          <form class="review-start" hidden>
            <h3>Start an approved batch</h3>
            <p class="review-seed"></p>
            <p class="review-model studio-hint"></p>
            <label>Batch size <input class="studio-input" name="count" type="number" inputmode="numeric" min="1" step="1" value="1" required /></label>
            <p class="review-quota studio-hint"></p>
            <button type="submit" class="review-primary">Prepare and start batch</button>
            <button type="button" data-review="grant-batch" hidden>Authorize staging folder</button>
          </form>
          <section class="review-run" hidden aria-label="Current edit">
            <h3 class="review-run-title"></h3>
            <div><span class="studio-hint">Editing seed</span><p class="review-intent"></p></div>
            <p class="review-run-model studio-hint"></p>
            <details class="review-vision" hidden><summary>Local vision analysis</summary>
              <dl class="review-prompt-parts">
                <div class="review-description" hidden><dt>Vision 1 addition</dt><dd class="review-addition"></dd></div>
                <div><dt>Final edit prompt</dt><dd class="review-edit-prompt"></dd></div>
              </dl><p class="review-observation"></p>
              <button type="button" data-review="use-proposal" hidden>Edit proposed improvement</button>
              <p class="review-followup"></p>
            </details>
            <div class="review-actions">
              <button type="button" data-review="resume" hidden>Resume reference upload</button>
              <button type="button" data-review="discard" hidden>Close incomplete run</button>
              <button type="button" data-review="result" hidden>Load review</button>
              <button type="button" data-review="grant" hidden>Grant staging folder</button>
              <button type="button" data-review="grant-target" hidden>Authorize acceptance folder</button>
              <button type="button" data-review="accept" class="review-primary" hidden>Accept to Drift</button>
              <button type="button" data-review="reject" aria-expanded="false" hidden>Not Okay…</button>
              <button type="button" data-review="next" hidden>Prepare another batch</button>
            </div>
            <form class="review-rejection" hidden>
              <label>Reason (optional) <select class="studio-input" name="reason"><option value="other">No reason selected</option>${Object.entries(failure).filter(([id])=>id!=='other').map(([id, [label]]) =>
                `<option value="${id}">${label}</option>`).join('')}</select></label>
              <label>Feedback (optional) <textarea class="studio-input" name="note" rows="3" maxlength="2000"></textarea></label>
              <button type="submit">Confirm rejection</button>
            </form>
            <form class="review-learning" hidden>
              <p class="review-analysis"></p>
              <label>Learning draft <textarea class="studio-input" name="learning" rows="4" maxlength="3000" required></textarea></label>
              <div class="review-actions"><button type="submit" value="draft">Save draft</button>
                <button type="submit" value="approve" class="review-primary">Approve learning</button></div>
              <p class="review-approved studio-hint" hidden></p>
              <button type="button" data-review="use-learning" hidden>Draft prompt guidance from approved learning</button>
            </form>
          </section>
        </div>
      </div>
      <div class="review-secondary">
        <section class="review-queue" hidden aria-label="Batch review queue">
          <h3>Review queue</h3>
          <div class="review-actions">
            <button type="button" data-review="pause">Pause remaining</button>
            <button type="button" data-review="resume-batch" hidden>Resume batch</button>
            <button type="button" data-review="stop">Stop remaining</button>
          </div>
          <p class="studio-hint">The current edit may finish while the remaining items are paused or stopped.</p>
          <ol></ol>
        </section>
        <details class="review-settings"><summary>Approved seed, sources and model</summary>
          <form><label>Model <select class="studio-input" name="model">${MODELS.map(model =>
            `<option value="${model.id}">${model.label}</option>`).join('')}</select></label>
            <label>Editing seed <textarea class="studio-input" name="seed" rows="4" maxlength="800" required autocomplete="off" spellcheck="false"></textarea></label>
            <p class="studio-hint">Auto Review selects eligible originals directly from Private and References.</p>
            <label class="review-confirm"><input type="checkbox" name="consent" required /> I authorize this non-intimate edit on eligible images in those folders that I have permission to edit. Any people used are consenting adults.</label>
            <p class="review-config studio-hint"></p>
            <button type="submit">Approve configuration</button></form>
        </details>
        <details class="review-prompt-settings"><summary>Descriptive guidance</summary>
          <form><label>Guidance for Vision Model 1
            <textarea class="studio-input" name="guidance" rows="3" maxlength="400" required autocomplete="off">Describe only visible details that help locate the approved edit.</textarea>
          </label><p class="studio-hint">Guidance controls how the edit prompt is phrased. The approved editing seed supplies the edit.</p>
          <button type="submit">Approve prompt guidance</button></form>
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
  const promptForm = $('.review-prompt-settings form');
  const compare = $('[data-compare-original]');
  let session, store, record, current, run, job, approvedLearning, vision, resultUrl = '', compareSource = '';
  let newEdit = false, historyView = false, cursor, attempted = '', busy = false, grantNeeded = false, grantBatchFolder = '', grantTarget = '';
  let feedbackJob, queueSignature = '';
  const completedRuns = new Set();
  const readyModel = (id, version = 4) => {
    const { studio } = context();
    return studio.connected && !studio.liveCached && studio.worker?.capabilities?.promptSchema === 4 && workerOnline(studio.worker) &&
      (!version || Number(studio.worker.capabilities.autoReviewVision) >= version) &&
      deviceCanQueue(studio.binding, studio.worker, id) && modelReferenceLimit(studio.worker, id) > 0;
  };
  const model = () => record?.settings?.model || INITIAL_REVIEW_MODEL;
  const admissionOpen = () => record?.activation.until > Date.now();
  const contextReady = () => Boolean(context().owner && context().unlocked && !document.hidden);
  function verifySession(active) {
    if (active !== session || !contextReady() || !dialog.open) throw new DOMException('Review closed', 'AbortError');
  }
  function clearComparison() {
    compareReset();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    if (compareSource) URL.revokeObjectURL(compareSource);
    resultUrl = compareSource = '';
    compare.querySelectorAll('img').forEach(image => image.removeAttribute('src'));
  }
  function clear() {
    session?.abort();
    session = store = record = current = run = job = approvedLearning = vision = cursor = null;
    feedbackJob = null;
    grantBatchFolder = grantTarget = queueSignature = '';
    completedRuns.clear();
    clearComparison();
    attempted = '';
    newEdit = historyView = busy = grantNeeded = false;
    startForm.reset();
    rejectForm.reset();
    learningForm.reset();
    settingsForm.reset();
    promptForm.reset();
    rejectForm.hidden = true;
    action('reject').setAttribute('aria-expanded', 'false');
    $('.review-intent').textContent = '';
    for (const field of ['.review-seed', '.review-edit-prompt', '.review-observation', '.review-addition', '.review-followup']) $(field).textContent = '';
    $('.review-approved').textContent = '';
    $('.review-analysis').textContent = '';
    $('.review-history ol').replaceChildren();
    $('.review-queue ol').replaceChildren();
    $('.review-history').open = $('.review-settings').open = $('.review-prompt-settings').open = false;
    action('history').textContent = 'Load history';
    action('history').hidden = false;
    status('');
  }
  function render() {
    $('.review-content').hidden = !record;
    if (!record) return;
    const canStart = !busy && admissionOpen() && readyModel(model()) && !context().studioBusy;
    const remaining = Math.min(REVIEW_BATCH_LIMIT, record.activation.maxRuns-(record.current?.started||0));
    const exhausted = remaining<=0;
    $('.review-quota').textContent=admissionOpen()?`Operational limit · ${Math.max(0,remaining)} edits available in the next batch.`:'';
    const staged = run?.phase === 'staged';
    const accepting = run?.phase === 'accepting';
    const pending = run?.phase === 'pending';
    const complete = job?.status === 'completed';
    const ready = Boolean(staged && resultUrl);
    const batch=record.batch;
    const batchSettled=!batch||((batch.state==='stopped'||batch.expiresAt<=Date.now()||record.runs.length===batch.ids.length)&&record.runs.every(reviewFinished));
    const starting = !historyView && batchSettled && (!current || (reviewFinished(current) && newEdit));
    const showBatch=Boolean(batch)&&!starting;
    $('.review-queue').hidden=!showBatch;
    action('pause').hidden=batch?.state!=='active'||batchSettled||batch.expiresAt<=Date.now();
    action('resume-batch').hidden=batch?.state!=='paused'||batch.expiresAt<=Date.now();
    action('stop').hidden=batch?.state==='stopped'||batchSettled;
    action('grant-batch').hidden=!grantBatchFolder;
    const signature=JSON.stringify(record.runs.map(item=>[item.id,item.phase,item.jobStatus,item.id===run?.id]));
    if(queueSignature!==signature){
      queueSignature=signature;
      const list=$('.review-queue ol');
      list.replaceChildren(...record.runs.map((item,index)=>{
        const row=document.createElement('li'),control=document.createElement('button');
        control.type='button';control.dataset.review='batch-run';control.dataset.id=item.id;
        control.setAttribute('aria-current',item.id===run?.id?'true':'false');
        const label={staged:'Ready to review',accepted:'Accepted',rejected:'Not Okay',closed:'Closed'}[item.phase]||
          {running:'Editing',queued:'Waiting',paused:'Paused',uploading:'Preparing source',completed:'Staging needs attention',failed:'Edit failed'}[item.jobStatus]||'Preparing';
        control.textContent=`Edit ${index+1} · ${label}`;row.append(control);return row;
      }));
    }
    startForm.hidden = !starting;
    $('.review-run').hidden = starting || !run;
    $('.review-canvas').hidden = !ready;
    compare.hidden = !ready;
    $('.review-seed').textContent = record.settings?.seed || 'Approve an editing seed to begin.';
    $('.review-model').textContent = !admissionOpen() ? 'The approved admission window has ended.' : exhausted ? 'The approved run limit has been reached.' :
      `${modelName(model())}${!readyModel(model()) ? ' · Awaiting a fresh, approved PC capability' :
        record.prompt?.scope!==REVIEW_GUIDANCE_SCOPE ? ' · Approve descriptive guidance below' : ''}`;
    startForm.querySelector('button[type="submit"]').disabled = !canStart || exhausted || record.settings?.sourceScope!==REVIEW_SOURCE_SCOPE || record.prompt?.scope!==REVIEW_GUIDANCE_SCOPE;
    const original=isOriginalReviewJob(run?.id);
    $('.review-run-title').textContent = ({ pending: 'Editing', staged: 'Ready for review', accepting: 'Finishing acceptance',
      accepted: original?'Accepted into Auto Generated':'Accepted into Private', rejected: 'Rejected', closed: 'Closed' })[run?.phase] || '';
    $('.review-intent').textContent = job?.prompt || '';
    $('.review-vision').hidden = !vision;
    $('.review-description').hidden=vision?.schema!==2;
    $('.review-addition').textContent=vision?.schema===2?(vision.addition||'No addition'):'';
    $('.review-edit-prompt').textContent = vision?.prompt || '';
    $('.review-observation').textContent = vision ? (vision.state === 'ready' ? vision.observation : 'Local comparison was unavailable. Review the image yourself.') : '';
    action('use-proposal').hidden = run?.batchId ? !feedbackJob?.improvement?.guidance : !vision?.nextSeed || !admissionOpen();
    $('.review-followup').textContent=feedbackJob?.improvement?.observation||
      ({queued:'Feedback comparison queued on the PC.',running:'Comparing the saved edit and owner feedback.',failed:'Feedback comparison unavailable.'})[feedbackJob?.status]||'';
    $('.review-run-model').textContent = job?.model ? `${modelName(job.model)} · Sampling seed ${job.seed}` : '';
    action('load').disabled = busy;
    action('resume').hidden = !admissionOpen() || !pending || job?.status !== 'uploading' || finishedJob(job);
    action('discard').hidden = !pending || !(finishedJob(job) || job?.status === 'uploading' || complete);
    action('discard').textContent = complete ? 'Close without accepting' : 'Close incomplete run';
    action('result').hidden = !complete || !(pending || staged && !resultUrl);
    action('result').textContent = pending ? 'Recover Drive staging' : 'Load review';
    action('grant').hidden = !pending || !complete || !grantNeeded;
    action('grant-target').hidden=!accepting||!grantTarget;
    action('accept').hidden = !ready && !accepting;
    action('accept').textContent = accepting ? `Finish moving into ${original?'Auto Generated':'Private'}` : 'Accept to Drift';
    action('reject').hidden = !ready;
    if (!ready) rejectForm.hidden = true;
    action('next').hidden = !reviewFinished(current) || !batchSettled || starting || exhausted;
    learningForm.hidden = !['accepted', 'rejected'].includes(run?.phase);
    $('.review-analysis').textContent = run?.phase === 'rejected' ? [run.reason==='other'?'':failure[run.reason]?.[0],run.note,run.analysis].filter(Boolean).join('\n') : '';
    $('.review-approved').hidden = !approvedLearning;
    $('.review-approved').textContent = approvedLearning ? `Approved guidance\n${approvedLearning.text}` : '';
    action('use-learning').hidden = !approvedLearning;
    $('.review-config').textContent = record.settings?.sourceScope===REVIEW_SOURCE_SCOPE ? `Approved for later runs · ${modelName(model())}` : `Approve automatic selection · ${modelName(model())}`;
    settingsForm.elements.model.value ||= model();
    for (const button of dialog.querySelectorAll('.review-run button, .review-queue button, .review-secondary button, .review-start [data-review="grant-batch"]')) button.disabled = busy;
    settingsForm.querySelector('[type="submit"]').disabled = busy || !admissionOpen() || !readyModel(settingsForm.elements.model.value);
    promptForm.querySelector('button').disabled = busy;
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
        if (error.code === 'drive/review-private-grant') grantTarget='private';
        if (error.code === 'drive/review-generated-grant') grantTarget='generated';
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
    [job,feedbackJob] = await Promise.all([store.job(id),value.phase==='rejected'&&value.batchId?store.feedback(id):null]);
    vision = await verifiedVision();
    approvedLearning = await store.readRevision(run.learningId);
    verifySession(active);
    learningForm.elements.learning.value = run.draft || (run.phase === 'accepted' ? vision?.learning || '' : '');
    status(run.phase === 'pending' ? (job.status==='paused'?'Paused before editing.':formatJobStatus(job)) : '');
  }

  async function verifiedVision() {
    if (!isVisionReviewJob(job?.id) || job.status !== 'completed') return null;
    const receipt = await store.vision(job.id);
    if (receipt?.outputSha256 !== job.result.sha256 || receipt.sourceSha256 !== job.references[0].sha256) {
      throw new Error('The local vision record does not match this source and output.');
    }
    if(isOriginalReviewJob(job.id)&&(receipt.schema!==2||receipt.seed!==job.prompt||typeof receipt.addition!=='string'||
      receipt.prompt!==(receipt.addition?`${job.prompt}\n\n${receipt.addition}`:job.prompt)))throw new Error('The local prompt does not match the approved editing seed.');
    return receipt;
  }

  async function reload(active) {
    historyView = newEdit = false;
    rejectForm.hidden = true;
    action('reject').setAttribute('aria-expanded', 'false');
    record = await store.load();
    verifySession(active);
    if (!record) { status('Auto Review is awaiting production activation.'); return; }
    settingsForm.elements.model.value = model();
    settingsForm.elements.seed.value = record.settings?.seed || '';
    settingsForm.elements.consent.checked = false;
    promptForm.reset();
    if (record.prompt?.scope===REVIEW_GUIDANCE_SCOPE) promptForm.elements.guidance.value = record.prompt.guidance;
    current = record.run;
    const first=record.runs.find(item=>item.phase==='staged')||record.runs.find(item=>!reviewFinished(item));
    if(first)await inspectRun(first.id,first,active);
    else if (current) await inspectRun(record.current.runId, current, active);
    else status('');
  }

  async function submit(active) {
    const configuration = record?.settings;
    const promptConfig = record?.prompt;
    if (configuration?.sourceScope!==REVIEW_SOURCE_SCOPE || promptConfig?.scope!==REVIEW_GUIDANCE_SCOPE || !admissionOpen() || !readyModel(model()) || context().studioBusy) return;
    const count=startForm.elements.count.valueAsNumber;
    const offset=record.current?.started||0;
    const maximum=Math.min(REVIEW_BATCH_LIMIT,record.activation.maxRuns-offset);
    if(!Number.isSafeInteger(count)||count<1||count>maximum)throw new Error(`Enter a whole batch size from 1 to ${maximum}.`);
    await drive.authorize();
    verifySession(active);
    status('Selecting eligible original files…');
    const {model: approvedModel, seed: intent} = configuration;
    const signal = AbortSignal.any([active.signal, AbortSignal.timeout(150000)]);
    const candidates=await drive.review.listOriginals({count,offset,signal});
    if(candidates.length!==count)throw new Error(`Found ${candidates.length} eligible originals in the discovery window. Choose a smaller batch.`);
    verifySession(active);
    const stageFolderId = await drive.review.stageFolder(signal);
    const prepared=candidates.map(item=>({...item,id:`review-v3-${reviewId()}`}));
    if (!readyModel(approvedModel) || context().studioBusy) throw new Error('The PC is busy or its approved model is unavailable.');
    const batchId=reviewId(),ids=prepared.map(item=>item.id);
    const originals=prepared.map(({reference,version})=>({id:reference.source.id,parentId:reference.source.parentId,version,sha256:reference.sha256}));
    let expiresAt;
    try{expiresAt=await drive.review.authorizeBatch({id:batchId,ids,folder:stageFolderId,originals},active.signal);}
    catch(error){if(error.code==='drive/review-folder-grant')grantBatchFolder=stageFolderId;throw error;}
    grantBatchFolder='';
    newEdit = false;
    vision = null;
    record.batch={id:batchId,folder:stageFolderId,ids,state:'active',expiresAt};
    record.runs=[];
    for(const {id,reference,version} of prepared){
      verifySession(active);
      const request={...makeJob({model:approvedModel,prompt:intent,effectivePrompt:intent,consent:true,driveOriginal:true,
        seed:crypto.getRandomValues(new Uint32Array(1))[0]&0x7fffffff,references:[reference]}),batchId,batchExpiresAt:expiresAt,
        review:{configId:promptConfig.id,seedId:configuration.id,promptGuidance:promptConfig.guidance}};
      const agreement={createdAt:request.createdAt,phase:'pending',configId:configuration.id,sourceVersion:version,nonIntimate:true,stageFolderId,batchId};
      await store.start(id,request,agreement);
      current=run={...agreement,id};
      job={...request,id};
      record.runs.push({...run,jobStatus:'queued'});
      record.current={runId:id,batchId,started:(record.current?.started||0)+1};
      render();
      status(`Queued ${record.runs.length} of ${prepared.length} edits…`);
    }
    await reload(active);
    status(`${prepared.length} approved edits queued. The PC and Drive can finish them while Studio is closed.`);
  }

  async function resume(active) {
    const version = run.batchId ? 3 : isConfiguredVisionReviewJob(run.id) ? 2 : isVisionReviewJob(run.id) ? 1 : 0;
    if (!readyModel(job.model, version)) throw new Error('The approved PC and original model must be online to resume.');
    const reference = job.references[0];
    await drive.authorize();
    verifySession(active);
    const actual = await drive.review.loadSource(reference.source.id, active.signal, run.sourceVersion);
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
    if(job?.status!=='completed')throw new Error('The PC is finishing delivery. Refresh Auto Review when it is ready.');
    if (reconnect) await drive.authorize();
    verifySession(active);
    const signal = AbortSignal.any([active.signal, AbortSignal.timeout(180000)]);
    vision ||= await verifiedVision();
    verifySession(active);
    let blob;
    if (run.phase === 'pending') {
      if(run.batchId&&!reconnect)throw new Error('The PC has not confirmed private staging for this item.');
      if(run.batchId)await drive.review.checkSource(job.references[0].source.id,run.sourceVersion,signal,job.references[0].source.parentId);
      status('Verifying the edit before private staging…');
      blob = await decodeResult(job.result, await store.chunks(run.id));
      verifySession(active);
      const fileId = await drive.review.stage({ job, blob, run, signal,
        onProgress: value => { if (active === session && typeof value === 'number') status(`Staging privately in Drive · ${Math.round(value * 100)}%`); } });
      verifySession(active);
      run = { ...await store.transition(run.id, 'pending', { phase: 'staged', fileId }), id: run.id };
      if(run.id===record.current?.runId)current=run;
      record.runs=record.runs.map(item=>item.id===run.id?run:item);
      grantNeeded = false;
    }
    if (run.phase !== 'staged') return;
    const [stagedImage, source] = await Promise.all([
      blob || drive.review.readStaged(run, job, signal),
      reviewOriginal(run,job,signal)
    ]);
    verifySession(active);
    compareSource = URL.createObjectURL(source);
    resultUrl = URL.createObjectURL(stagedImage);
    compare.dataset.compareOriginal = run.id;
    compare.querySelector('img').src = resultUrl;
    status('Staged privately in Drive. Hold the image to peek at the source, or tap to switch.');
  }

  async function reviewOriginal(item,request,signal) {
    const reference=request.references[0];
    return isOriginalReviewJob(item.id)?drive.review.readOriginal(reference,item.sourceVersion,signal):
      decodeReference(reference,await store.chunks(item.id,true));
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
    await showResult(active, true);
  }

  async function grantBatch(active) {
    await drive.authorize();
    verifySession(active);
    dialog.close();dialog.show();
    try { await drive.review.grantStage({stageFolderId:grantBatchFolder},active.signal); }
    finally { if(session===active&&dialog.open){dialog.close();dialog.showModal();} }
    verifySession(active);grantBatchFolder='';
    status('Folder authorization verified. Start the approved batch.');
  }

  async function accept(active) {
    await drive.authorize();
    verifySession(active);
    if (run.phase === 'staged') {
      run = { ...await store.transition(run.id, 'staged', { phase: 'accepting' }), id: run.id };
      if(run.id===record.current?.runId)current=run;
    }
    const destination=isOriginalReviewJob(run.id)?'Auto Generated':'Private';
    if (run.phase === 'accepted') { clearComparison(); status(`Accepted into ${destination}. Sync the gallery to see it in Drift and Browse.`); return; }
    render();
    status('Finishing the same Drive move…');
    await drive.review.accept(run, job, AbortSignal.any([active.signal, AbortSignal.timeout(120000)]));
    verifySession(active);
    grantTarget='';
    run = { ...await store.transition(run.id, 'accepting', { phase: 'accepted', finishedAt: Date.now() }), id: run.id };
    if(run.id===record.current?.runId)current=run;
    record.runs=record.runs.map(item=>item.id===run.id?run:item);
    clearComparison();
    learningForm.elements.learning.value = run.draft || vision?.learning || '';
    status(`Drive verified the same PNG in ${destination}. Sync the gallery to see it in Drift and Browse.`);
  }

  async function grantAcceptance(active) {
    await drive.authorize();
    verifySession(active);
    dialog.close();dialog.show();
    try{await drive.review.grantGenerated(grantTarget,active.signal);}
    finally{if(session===active&&dialog.open){dialog.close();dialog.showModal();}}
    verifySession(active);
    grantTarget='';
    await accept(active);
  }

  async function reject(active) {
    const reason = rejectForm.elements.reason.value;
    const note = rejectForm.elements.note.value.trim();
    if (!note&&!isOriginalReviewJob(run.id)) throw new Error('Describe what you observed before rejecting this earlier edit.');
    const analysis = vision?.observation || (isVisionReviewJob(run.id) ? 'Local comparison was unavailable.' : failure[reason][1]);
    const draft = [note, vision?.learning || (!isVisionReviewJob(run.id) ? failure[reason][1] : '')].filter(Boolean).join('\n\n')||analysis;
    const update={phase:'rejected',finishedAt:Date.now(),reason,note,analysis,draft,learningId:''};
    run={...(run.batchId ? await store.rejectAndCompare(run,job,update) : await store.transition(run.id,'staged',update)),id:run.id};
    if(run.id===record.current?.runId)current=run;
    record.runs=record.runs.map(item=>item.id===run.id?run:item);
    if(run.batchId)feedbackJob={status:'queued'};
    verifySession(active);
    clearComparison();
    learningForm.elements.learning.value = run.draft;
    status(run.batchId?'Marked Not Okay. Vision Model 2 will draft descriptive guidance for review.':
      'Rejected. The image stays in private staging.');
  }

  function autoStage() {
    if (!session || !contextReady() || busy || historyView || run?.batchId || run?.phase !== 'pending' || job?.status !== 'completed' || attempted === run.id) return;
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
    if (name === 'use-learning' && approvedLearning) {
      if (approvedLearning.text.length > promptForm.elements.guidance.maxLength) {
        status('Shorten the approved learning to 400 characters or fewer before using it as prompt guidance.');
        return;
      }
      promptForm.elements.guidance.value = approvedLearning.text;
      $('.review-prompt-settings').open = true;
      promptForm.elements.guidance.focus();
      return;
    }
    if (name === 'next') {
      clearComparison(); newEdit = true; historyView = false;
      status(''); render();
      startForm.querySelector('button').focus();
      return;
    }
    if (name === 'use-proposal') {
      if(run?.batchId){
        const guidance=feedbackJob?.improvement?.guidance;
        if(!guidance)return;
        promptForm.elements.guidance.value=guidance;
        $('.review-prompt-settings').open=true;promptForm.elements.guidance.focus();
      }else{
        if(!vision?.nextSeed)return;
        settingsForm.elements.seed.value = vision.nextSeed;
        settingsForm.elements.consent.checked = false;
        $('.review-settings').open = true;
        settingsForm.elements.seed.focus();
      }
      return;
    }
    const handlers = {
      resume, accept, load: reload, result: active => showResult(active, true),
      grant: grantStage,'grant-batch':grantBatch,'grant-target':grantAcceptance,
      pause: async()=>{await store.controlBatch(record.batch.id,'paused');await reload(session);},
      'resume-batch':async()=>{await store.controlBatch(record.batch.id,'active');await reload(session);},
      stop:async()=>{await store.controlBatch(record.batch.id,'stopped');await reload(session);},
      'batch-run':async active=>{
        const id=button.dataset.id,value=await store.run(id);
        if(!value||value.batchId!==record.batch?.id)throw new Error('This review is no longer in the active batch.');
        newEdit=historyView=false;await inspectRun(id,value,active);
        if(value.phase==='staged'&&job.status==='completed')await showResult(active,true);
      },
      discard: async () => {
        run = { ...await store.closeFailed(run.id), id: run.id };
        if(run.id===record.current?.runId)current=run;
        record.runs=record.runs.map(item=>item.id===run.id?run:item);
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
      const seed = settingsForm.elements.seed.value;
      if (!readyModel(requested) || !settingsForm.elements.consent.checked || !seed.trim()) return;
      void withAction(async () => {
        record.settings = await store.approveConfiguration({model: requested, seed, sourceScope:REVIEW_SOURCE_SCOPE}, record.settings?.id || '');
        settingsForm.elements.consent.checked = false;
        $('.review-settings').open = false;
        status('Configuration approved for future runs.');
      });
    }
    if (event.target === promptForm) {
      const guidance = promptForm.elements.guidance.value;
      if (!record || !guidance.trim() || guidance.length > 400) return;
      if (record.prompt?.scope===REVIEW_GUIDANCE_SCOPE&&guidance === record.prompt.guidance) { status('This descriptive guidance is already approved.'); return; }
      void withAction(async () => {
        record.prompt = await store.approvePrompt(guidance, record.prompt?.id || '');
        $('.review-prompt-settings').open = false;
        status('Prompt guidance approved. The editing seed is unchanged.');
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
        status(approve ? 'Learning approved. It can be used to draft separate prompt guidance.' : 'Learning draft saved.');
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
      const latest = run && jobs.find(item => item.id === run.id);
      if(run?.phase==='rejected'&&run.batchId){
        const next=jobs.find(item=>item.id===`feedback-${run.id}`);
        if(next)feedbackJob=next;
      }
      for(const item of record.runs){
        const update=jobs.find(candidate=>candidate.id===item.id);
        if(update)item.jobStatus=update.status;
        if(update?.status==='completed'&&item.phase==='pending'&&!completedRuns.has(item.id)&&!busy){
          completedRuns.add(item.id);
          const id=item.id,active=session;
          void store.run(id).then(value=>{
            if(active!==session||!value)return;
            const fresh={...value,id,jobStatus:update.status};
            record.runs=record.runs.map(record=>record.id===id?fresh:record);
            if(run?.id===id){run=fresh;job=update;status(fresh.phase==='staged'?'Ready for owner review.':'Private staging could not be confirmed.');}
            render();
          }).catch(()=>{completedRuns.delete(id);});
        }
      }
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
      const blob = await reviewOriginal(run,job,active.signal);
      verifySession(active);
      if (run.id !== id || !resultUrl || compareSource) return;
      compareSource = URL.createObjectURL(blob);
    }
  };
}
