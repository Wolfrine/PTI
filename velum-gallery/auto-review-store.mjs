const FINISHED = new Set(['accepted', 'rejected', 'closed']);
export const INITIAL_REVIEW_MODEL = 'qwen-image-2.1-turbo';
export const isReviewFeedbackJob = id => /^feedback-review-v2-[a-f0-9]{32}$/.test(id || '');
export const isReviewJob = id => /^review-(?:v[12]-)?[a-f0-9]{32}$/.test(id || '') || isReviewFeedbackJob(id);
export const isVisionReviewJob = id => /^review-v[12]-[a-f0-9]{32}$/.test(id || '');
export const isConfiguredVisionReviewJob = id => /^review-v2-[a-f0-9]{32}$/.test(id || '');
export const REVIEW_POOL_LIMIT = 6;
export const REVIEW_BATCH_LIMIT = 3;
export const reviewFinished = run => FINISHED.has(run?.phase);
export const reviewId = () => crypto.randomUUID().replaceAll('-', '');

export async function selectReviewSource(sources, started, readEligible) {
  if (!Array.isArray(sources) || !sources.length || sources.length > REVIEW_POOL_LIMIT) return null;
  const offset = started % sources.length;
  for (const entry of [...sources.slice(offset), ...sources.slice(0, offset)]) {
    const [id, version] = entry.split(':');
    try { return await readEligible(id, version); }
    catch (error) { if (error.code !== 'drive/review-source-ineligible' && error.status !== 404) throw error; }
  }
  return null;
}

export function createReviewStore({ sdk, db, workspace, check }) {
  const { collection, doc, getDocFromServer, getDocsFromServer, limit, orderBy, query,
    runTransaction, startAfter, writeBatch } = sdk;
  const ref = (...path) => doc(db, ...workspace, ...path);
  const control = id => ref('autoReviewControl', id);
  const runRef = id => ref('autoReviewRuns', id);
  const jobRef = id => ref('jobs', id);
  const read = async target => {
    check();
    const snapshot = await getDocFromServer(target);
    check();
    return snapshot.exists() ? snapshot.data() : null;
  };
  const transact = callback => {
    check();
    return runTransaction(db, async tx => {
      check();
      return callback(tx);
    }, { maxAttempts: 3 });
  };
  const txRead = async (tx, target) => {
    const snapshot = await tx.get(target);
    check();
    return snapshot.exists() ? snapshot.data() : null;
  };
  const revision = (id, kind, fields) => ({ id, kind, ...fields, approvedAt: Date.now() });

  async function load() {
    const activation = await read(control('activation'));
    if (!Number.isInteger(activation?.maxRuns)) return null;
    const [current, settings, prompt, batch] = await Promise.all(
      [read(control('current')), read(control('settings')), read(control('prompt')), read(control('batch'))]);
    const run = current ? await read(runRef(current.runId)) : null;
    if (current && !run) throw new Error('The current review record is unavailable. Refresh before starting another run.');
    const runs = batch ? (await Promise.all(batch.ids.map(async id => {
      const item = await read(runRef(id));
      return item && { ...item, id };
    }))).filter(Boolean) : [];
    return { activation, settings, prompt, current, run, batch, runs };
  }

  async function start(id, job, run) {
    await transact(async tx => {
      const pointer = await txRead(tx, control('current'));
      const active = pointer ? await txRead(tx, runRef(pointer.runId)) : null;
      const settings = await txRead(tx, control('settings'));
      const prompt = await txRead(tx, control('prompt'));
      const batch = await txRead(tx, control('batch'));
      if (active && pointer.runId === id) return;
      if (batch?.id !== run.batchId || batch.state !== 'active' || !batch.ids.includes(id)) {
        throw new Error('The batch authorization expired, paused, or changed.');
      }
      if (pointer && pointer.batchId !== run.batchId && !reviewFinished(active)) {
        throw new Error('Finish the current review before starting another batch.');
      }
      const selection = job.references[0].source.id + ':' + run.sourceVersion;
      if (settings?.id !== run.configId || settings.model !== job.model || settings.seed !== job.prompt ||
          !settings.sources.includes(selection) || prompt?.id !== job.review.configId ||
          prompt.guidance !== job.review.promptGuidance || settings.id !== job.review.seedId) {
        throw new Error('The approved seed or prompt configuration changed. Refresh Auto Review.');
      }
      tx.set(jobRef(id), job);
      tx.set(runRef(id), run);
      tx.set(control('current'), { runId: id, batchId: run.batchId, started: (pointer?.started || 0) + 1 });
    });
    check();
  }

  async function queue(id, job, chunks) {
    const input = ref('jobs', id, 'inputs', '0');
    const manifest = job.references[0];
    const paths = chunks.map(chunk => ref('jobs', id, 'inputs', '0', 'chunks', String(chunk.index)));
    await transact(async tx => {
      const current = await txRead(tx, jobRef(id));
      if (current?.inputsReady) return;
      if (current?.status !== 'uploading') throw new Error('This input transfer is no longer active.');
      const previous = await Promise.all(paths.map(path => txRead(tx, path)));
      for (const [index, chunk] of chunks.entries()) {
        if (!previous[index]) tx.set(paths[index], chunk);
        else if (previous[index].data !== chunk.data || previous[index].index !== chunk.index) {
          throw new Error('The reference has changed since this run was created. Close the incomplete run to start again.');
        }
      }
    });
    check();
    // Input readiness and queue promotion must commit together. The existing
    // job rules verify the input's chunks and use getAfter for the ready record.
    try {
      const batch = writeBatch(db);
      batch.set(input, { index: 0, bytes: manifest.bytes, sha256: manifest.sha256, chunks: manifest.chunks });
      batch.update(jobRef(id), { status: 'queued', inputsReady: true });
      await batch.commit();
    } catch (error) {
      if (!(await read(jobRef(id)))?.inputsReady) throw error;
    }
    check();
  }

  async function transition(id, expected, update) {
    await transact(async tx => {
      const current = await txRead(tx, runRef(id));
      if (current?.phase === update.phase && (!update.fileId || current.fileId === update.fileId)) return;
      if (current?.phase !== expected) throw new Error('The decision changed in another session. Reopen the review.');
      tx.update(runRef(id), update);
    });
    return read(runRef(id));
  }

  async function closeFailed(id) {
    await transact(async tx => {
      const run = await txRead(tx, runRef(id));
      const job = await txRead(tx, jobRef(id));
      if (run?.phase !== 'pending') throw new Error('The review changed. Reopen it before continuing.');
      if (job?.status === 'uploading') tx.update(jobRef(id), { status: 'cancelled' });
      else if (!['failed', 'cancelled', 'expired', 'completed'].includes(job?.status) &&
        !(job?.status === 'queued' && job.expiresAt <= Date.now())) throw new Error('This edit is still active.');
      tx.update(runRef(id), { phase: 'closed', finishedAt: Date.now() });
    });
    return read(runRef(id));
  }

  async function controlBatch(expected, state) {
    await transact(async tx => {
      const batch = await txRead(tx, control('batch'));
      if (batch?.id !== expected || batch.state === 'stopped' || !['active','paused','stopped'].includes(state)) {
        throw new Error('The batch changed. Refresh Auto Review.');
      }
      const jobs = await Promise.all(batch.ids.map(id => txRead(tx, jobRef(id))));
      const runs = state === 'stopped' ? await Promise.all(batch.ids.map(id => txRead(tx, runRef(id)))) : [];
      tx.update(control('batch'), {state, changedAt:Date.now()});
      for (const [index, id] of batch.ids.entries()) {
        const job = jobs[index];
        if (state === 'paused' && job?.status === 'queued') tx.update(jobRef(id), {status:'paused'});
        if (state === 'active' && job?.status === 'paused') tx.update(jobRef(id), {status:'queued'});
        if (state === 'stopped' && ['queued','paused','uploading'].includes(job?.status)) {
          tx.update(jobRef(id), {status:'cancelled'});
          if (runs[index]?.phase === 'pending') tx.update(runRef(id), {phase:'closed',finishedAt:Date.now()});
        }
      }
    });
    return read(control('batch'));
  }

  async function approveConfiguration(configuration, baseId) {
    const value = revision(reviewId(), 'configuration', { ...configuration, previous: baseId });
    await transact(async tx => {
      const settings = await txRead(tx, control('settings'));
      if ((settings?.id || '') !== baseId) throw new Error('A newer configuration was approved. Refresh Auto Review.');
      tx.set(ref('autoReviewRevisions', value.id), value);
      tx.set(control('settings'), { id: value.id, ...configuration });
    });
    check();
    return { id: value.id, ...configuration };
  }

  async function approvePrompt(guidance, baseId) {
    const value = revision(reviewId(), 'prompt', { guidance, previous: baseId });
    await transact(async tx => {
      const pointer = await txRead(tx, control('prompt'));
      if ((pointer?.id || '') !== baseId) throw new Error('A newer prompt configuration was approved. Refresh Auto Review.');
      tx.set(ref('autoReviewRevisions', value.id), value);
      tx.set(control('prompt'), { id: value.id, guidance });
    });
    check();
    return { id: value.id, guidance };
  }

  async function saveLearning(id, draft, base, approve) {
    const value = approve ? revision(reviewId(), 'learning', { runId: id, text: draft, previous: base.learningId || '' }) : null;
    await transact(async tx => {
      const current = await txRead(tx, runRef(id));
      if (!['rejected', 'accepted'].includes(current?.phase) || current.learningId !== base.learningId || current.draft !== base.draft) {
        throw new Error('Learning changed in another session. Reload the rejected run.');
      }
      if (value) tx.set(ref('autoReviewRevisions', value.id), value);
      tx.update(runRef(id), value ? { draft, learningId: value.id } : { draft });
    });
    return read(runRef(id));
  }

  async function rejectAndCompare(run, job, update) {
    const target = runRef(run.id), followup = jobRef('feedback-' + run.id);
    await transact(async tx => {
      const current = await txRead(tx,target);
      const existing = await txRead(tx,followup);
      if(existing&&current?.phase==='rejected')return;
      if(current?.phase!=='staged'||current.batchId!==run.batchId||job.status!=='completed')
        throw new Error('This result changed. Refresh its review.');
      const now=Date.now();
      tx.update(target,update);
      tx.set(followup,{recordType:'review-feedback',reviewJobId:run.id,deviceUid:job.deviceUid,
        status:'queued',createdAt:now,expiresAt:now+86400000,feedback:update.note,reason:update.reason});
    });
    return read(target);
  }

  async function listRuns(cursor) {
    check();
    const page = await getDocsFromServer(query(collection(db, ...workspace, 'autoReviewRuns'),
      orderBy('createdAt', 'desc'), ...(cursor ? [startAfter(cursor)] : []), limit(12)));
    check();
    return { records: page.docs.map(item => ({ ...item.data(), id: item.id })), cursor: page.size === 12 ? page.docs.at(-1) : null };
  }

  return { load, start, queue, transition, closeFailed, controlBatch, approveConfiguration, approvePrompt, saveLearning, rejectAndCompare, listRuns,
    job: async id => ({ ...await read(jobRef(id)), id }), run: id => read(runRef(id)),
    feedback: id => read(jobRef('feedback-' + id)),
    vision: id => isVisionReviewJob(id) ? read(ref('autoReviewVision', id)) : Promise.resolve(null),
    readRevision: id => id ? read(ref('autoReviewRevisions', id)) : Promise.resolve(null),
    async chunks(id, source = false) {
      check();
      const path = source ? ['inputs', '0', 'chunks'] : ['chunks'];
      const snapshot = await getDocsFromServer(query(collection(db, ...workspace, 'jobs', id, ...path), limit(source ? 6 : 17)));
      check();
      return snapshot.docs.map(item => item.data());
    } };
}
