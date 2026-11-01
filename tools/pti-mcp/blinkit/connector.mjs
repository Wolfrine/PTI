import { projectDetail, projectPage } from './model.mjs';

const bases = ['get_session', 'list_orders', 'get_order'];
const transient = new Set(['busy', 'rate_limited', 'unavailable', 'not_answered', 'transient', 'timeout', 'transport_unavailable', 'tool_unavailable']);
export class BlinkitReadError extends Error {
  constructor(code) { super(code); this.code = code; }
}
export function decodeEnvelope(raw) {
  let value = raw;
  for (let depth = 0; depth < 6; depth++) {
    if (typeof value === 'string') { try { value = JSON.parse(value); } catch { throw new BlinkitReadError('invalid_envelope'); } continue; }
    if (value?.structuredContent) { value = value.structuredContent; continue; }
    if (value?.content && !('ok' in value)) { value = value.content.find(c => c.type === 'text')?.text; continue; }
    if (value && typeof value.ok === 'boolean') return value;
    break;
  }
  throw new BlinkitReadError('invalid_envelope');
}
export function discoverReadTools(tools) {
  const names = (Array.isArray(tools) ? tools : tools?.tools || []).map(t => typeof t === 'string' ? t : t.name);
  return Object.fromEntries(bases.map(base => {
    const found = names.filter(name => typeof name === 'string' && new RegExp(`^${base}(?:__[A-Za-z0-9_-]+)?$`).test(name));
    if (found.length !== 1) throw new BlinkitReadError('read_tool_discovery_failed');
    return [base, found[0]];
  }));
}

// discoverTools and callTool are supplied by the authorized ChatGPT Browser surface.
// This module never opens a browser, requests OTPs, sets locations or makes HTTP calls.
export function createBlinkitReader({ discoverTools, callTool, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  let names, calling = false;
  async function read(base, args, unavailableDetail = false) {
    if (!bases.includes(base) || !names || calling) throw new BlinkitReadError('read_only_or_serial_boundary');
    calling = true;
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        let response;
        try { response = decodeEnvelope(await callTool(names[base], args)); }
        catch (error) { if (error instanceof BlinkitReadError) throw error; response = { ok: false, error: { code: 'transport_unavailable' } }; }
        const unavailable = response.ok && unavailableDetail && response.result?.contents?.kind === 'unavailable';
        if (response.ok && !unavailable) return response;
        const rawCode = unavailable ? 'not_answered' : response.error?.code;
        const code = typeof rawCode === 'string' && /^[a-z_]{1,80}$/.test(rawCode) ? rawCode : 'read_failed';
        if (attempt === 0 && transient.has(code)) {
          const delay = response.error?.retryAfterMs ?? response.result?.retryAfterMs ?? 0;
          if (!Number.isFinite(delay) || delay < 0 || delay > 60000) throw new BlinkitReadError('rate_limited');
          if (delay) await sleep(delay);
          continue;
        }
        throw new BlinkitReadError(code);
      }
    } finally { calling = false; }
  }
  return {
    async open() {
      names = discoverReadTools(await discoverTools()); // rediscover every batch/document/turn
      const value = await read('get_session', {});
      if ((value.session?.login ?? value.result?.login)?.kind !== 'logged_in') throw new BlinkitReadError('needs_login');
      return { loggedIn: true }; // never return the session/userId to persistence
    },
    async list(cursor = null) {
      const args = cursor === null ? { limit: 10 } : { limit: 10, cursor };
      for (let attempt = 0; attempt < 2; attempt++) {
        const page = projectPage((await read('list_orders', args)).result, cursor);
        if (!page.truncated) return page;
      }
      throw new BlinkitReadError('truncated');
    },
    async detail(order) {
      const result = (await read('get_order', { order }, true)).result;
      if (result?.order !== order) throw new BlinkitReadError('order_token_mismatch');
      return projectDetail(result);
    },
  };
}

const failCode = error => {
  const code = error?.code || error?.message;
  const allowed = ['not_answered', 'order_not_found', 'needs_login', 'needs_location', 'disabled', 'rate_limited', 'truncated', 'unreadable_rows', 'repeated_cursor', 'invalid_list_shape', 'invalid_cursor', 'read_tool_discovery_failed', 'order_token_mismatch', 'incomplete_detail', 'incomplete_item', 'contents_unavailable'];
  return allowed.find(value => typeof code === 'string' && new RegExp(`\\b${value}\\b`).test(code)) || 'transient';
};

/** PTI persistence interface:
 * context({runId}) -> {run, ingestionPaused}; sync({...}) -> {run};
 * ingest({runId,detail,capturedAt,listPlacedText}) -> {ok,duplicate,revision,...}.
 * Decode PTI MCP text envelopes in the injected functions; throw on isError.
 * No automatic changed-payload revision approval: conflicts remain pending for review.
 */
export async function syncBlinkitBatch({ reader, persistence, runId, mode = 'history', maxPages = 2, maxDetails = 20, scopePolicy = () => null, now = () => new Date().toISOString() }) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10 || !Number.isInteger(maxDetails) || maxDetails < 1 || maxDetails > 100) throw new Error('invalid_batch_bounds');
  let state = await persistence.context({ runId });
  if (state.ingestionPaused) return { paused: true, run: state.run };
  let run = state.run || (await persistence.sync({ action: 'start', runId, mode })).run;
  // A lost response is recovered by rereading durable run state on the next invocation.
  const mutate = async (action, extra = {}) => {
    const result = await persistence.sync({ action, runId, expectedRevision: run.revision, ...extra });
    run = result.run;
  };
  try { await reader.open(); }
  catch (error) { await mutate('block', { errorCode: failCode(error) }); return { blocked: true, run }; }
  let pages = 0, details = 0;
  const attempted = new Set();
  while (details < maxDetails) {
    const pending = run.pending.find(row => !attempted.has(row.order));
    if (pending) {
      // Explicit injected decisions only. Missing food words never authorize an exclusion.
      const exclusion = await scopePolicy({...pending});
      if(exclusion){
        await mutate('exclude',{exclusions:[{order:pending.order,reason:exclusion.reason,basis:exclusion.basis}]});
        continue;
      }
      attempted.add(pending.order); details++;
      let detail;
      try { detail = await reader.detail(pending.order); }
      catch (error) { await mutate('fail', { order: pending.order, errorCode: failCode(error) }); continue; }
      try {
        await persistence.ingest({ runId, detail, capturedAt: now(), listPlacedText: pending.placedText });
      } catch {
        // Includes changed-payload conflicts and persistence outages; do not skip or auto-approve.
        state = await persistence.context({ runId }); run = state.run;
        if (run.pending.some(row => row.order === pending.order)) await mutate('fail', { order: pending.order, errorCode: 'persistence_or_revision_conflict' });
        continue;
      }
      state = await persistence.context({ runId }); run = state.run;
      continue;
    }
    if (run.pending.length) return { partial: true, pages, details, run };
    if (run.endReached) {
      if (!run.historyComplete) await mutate('finish');
      return { historyComplete: run.historyComplete, complete: ['complete','food_scope_complete'].includes(run.status), pages, details, run };
    }
    if (pages >= maxPages) break;
    try {
      const page = await reader.list(run.cursor);
      if (page.unreadableRows) throw new BlinkitReadError('unreadable_rows');
      await mutate('page', { page }); pages++;
    } catch (error) {
      // A stale revision/transport failure must never be mistaken for end-of-history.
      state = await persistence.context({ runId }); run = state.run;
      await mutate('block', { errorCode: failCode(error) }); return { blocked: true, pages, details, run };
    }
  }
  if (run.endReached && !run.pending.length && !run.historyComplete) await mutate('finish');
  return { partial: !run.historyComplete, complete: ['complete','food_scope_complete'].includes(run.status), pages, details, run };
}
