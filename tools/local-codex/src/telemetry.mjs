import {randomUUID} from 'node:crypto';

const counterNames = ['totalTokens', 'inputTokens', 'cachedInputTokens', 'outputTokens', 'reasoningOutputTokens'];
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const selectedModel = value => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]{0,99}$/i.test(value) ? value : null;
const effort = value => ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra'].includes(value) ? value : null;
const toolTypes = new Set(['mcpToolCall', 'dynamicToolCall', 'collabAgentToolCall', 'collabToolCall', 'webSearch', 'fileChange', 'imageView', 'imageGeneration']);
const statusMap = {pendingInit: 'queued', running: 'running', waiting_for_user: 'waiting_for_user', completed: 'completed', errored: 'failed', failed: 'failed', interrupted: 'interrupted', shutdown: 'interrupted', notFound: 'unknown', inProgress: 'running'};
export function usageCounters(value) {
  if (!value || typeof value !== 'object') return null;
  const counters = Object.fromEntries(counterNames.map(name => [name, Number.isSafeInteger(value[name]) && value[name] >= 0 ? value[name] : null]));
  return counterNames.some(name => counters[name] !== null) ? counters : null;
}

// Event payloads may contain prompts, command output, reasoning and user data.
// This collector copies only the explicit numeric/enum/identity allowlist below.
export function createTelemetry(job, {clock = Date.now} = {}) {
  const began = clock();
  const children = new Map(), seen = new Set(), pending = new Set();
  let waitingSince = null, waitingMs = 0, approvals = 0, questions = 0;
  let commands = 0, toolCalls = 0, toolFailures = 0, modelReroutes = 0;
  let parentUsage = null, finishedAt = null, finishedTime = null;
  const runId = randomUUID();
  const generation = Number.isInteger(job.relayGeneration)&&job.relayGeneration>0?job.relayGeneration:(job.history?.length || 0) + 1;
  function child(id) {
    if (!uuid(id)) return null;
    if (!children.has(id) && children.size < 16) children.set(id, {threadId: id, status: 'unknown', model: null, reasoningEffort: null, selectionVerified: false, executionVerified: null, usage: null});
    return children.get(id) || null;
  }
  function childMetadata(id, metadata, selection, resolved) {
    const value = child(id); if (!value) return null;
    const model = selectedModel(metadata.model), reasoning = effort(metadata.reasoningEffort);
    if (model) value.model = model;
    if (reasoning) value.reasoningEffort = reasoning;
    if (resolved && model && reasoning) value.selectionVerified = model === selection?.model && reasoning === selection?.effort;
    if (selection && (model && model !== selection.model || reasoning && reasoning !== selection.effort)) {value.selectionVerified=false;return 'A subagent selected a different model or reasoning effort. Ask the owner; no fallback is allowed.';}
    return null;
  }
  function requestOpened(id, kind) {
    if (pending.has(id)) return;
    if (!pending.size) waitingSince = clock();
    pending.add(id);
    if (kind === 'approval') approvals++; else if (kind === 'question') questions++;
  }
  function requestClosed(id) {
    pending.delete(id);
    if (!pending.size && waitingSince !== null) {waitingMs += Math.max(0, clock() - waitingSince); waitingSince = null;}
  }
  function observe(message, parentId, selection) {
    const p = message.params || {};
    if (message.method === 'thread/started' && p.thread?.parentThreadId === parentId && uuid(parentId)) {
      return childMetadata(p.thread.id, p.thread, selection, true);
    }
    const related = p.threadId === parentId || children.has(p.threadId);
    if (!related) return null;
    if (message.method === 'model/rerouted') {
      modelReroutes++;
      if (!selection || p.toModel !== selection.model) return 'Codex rerouted this task to a different model. Ask the owner; no fallback is allowed.';
    }
    if (message.method === 'thread/tokenUsage/updated') {
      const counters = usageCounters(p.tokenUsage?.last);
      if (p.threadId === parentId) parentUsage = counters;
      else child(p.threadId).usage = counters;
    }
    const item = p.item;
    if (item && ['item/started', 'item/completed'].includes(message.method)) {
      if (['collabAgentToolCall', 'collabToolCall'].includes(item.type)) {
        const receivers = item.receiverThreadIds || [item.receiverThreadId || item.newThreadId].filter(Boolean);
        for (const id of receivers) {
          if (id === parentId) continue;
          const value = child(id); if (!value) continue;
          const state = item.agentsStates?.[id]?.status;
          if (state && statusMap[state]) value.status = statusMap[state];
          else if (item.tool === 'spawnAgent' && value.status === 'unknown') value.status = 'queued';
          const violation = childMetadata(id, item, selection, false); if (violation) return violation;
        }
      }
      if (item.type === 'subAgentActivity') {
        const value = child(item.agentThreadId);
        if (value) {
          const violation = childMetadata(item.agentThreadId, item, selection, true); if (violation) return violation;
          if (item.kind === 'started' || item.kind === 'interacted') value.status = 'running';
          if (item.kind === 'completed') value.status = 'completed';
          if (item.kind === 'interrupted') value.status = 'interrupted';
        }
      }
      const identity = `${p.threadId}:${item.id}`;
      if (message.method === 'item/completed' && item.id && !seen.has(identity)) {
        seen.add(identity);
        if (item.type === 'commandExecution') commands++;
        else if (toolTypes.has(item.type)) toolCalls++;
        if ((item.type === 'commandExecution' || toolTypes.has(item.type)) &&
            (['failed', 'declined', 'cancelled'].includes(item.status) || item.success === false || item.error || item.result?.isError === true || Number.isInteger(item.exitCode) && item.exitCode !== 0)) toolFailures++;
      }
    }
    if (p.threadId !== parentId && message.method === 'turn/completed') {
      child(p.threadId).status = statusMap[p.turn?.status] || 'unknown';
    }
    return null;
  }
  function finish() {if (finishedTime === null) {finishedTime = clock(); finishedAt = new Date(finishedTime).toISOString();}}
  function snapshot() {
    const values = [...children.values()];
    const observedChildren = values.filter(value => value.usage !== null).length;
    const usageCoverage = !parentUsage ? 'none' : !values.length ? 'parent' : observedChildren === values.length ? 'team' : 'partial-team';
    const end = finishedTime ?? clock();
    return {schemaVersion: 1, runId, generation, tokenBasis: 'latest-response', strategy: job.strategy || 'auto', purpose: job.purpose || 'work',
      startedAt: new Date(began).toISOString(), finishedAt, durationMs: finishedTime === null ? null : Math.max(0, finishedTime - began),
      waitingMs: waitingMs + (finishedTime === null || waitingSince === null ? 0 : Math.max(0, end - waitingSince)), approvals, questions, commands, toolCalls, toolFailures, modelReroutes,
      parentUsage, usageCoverage, children: structuredClone(values), childrenSeen: values.length};
  }
  return {observe, childMetadata, requestOpened, requestClosed, finish, snapshot};
}

export function archiveRun(job, telemetry, status = job.status) {
  const value = typeof telemetry.snapshot === 'function' ? telemetry.snapshot() : telemetry;
  const failure = !['failed','interrupted'].includes(status) ? null :
    status==='interrupted' ? 'interrupted' : /model|reasoning effort|subagent bound/i.test(job.error||'') ? 'model-or-harness-policy' :
      /Workspace|conflicting/i.test(job.error||'') ? 'workspace-conflict' : /sign-in|subscription/i.test(job.error||'') ? 'sign-in-required' :
        /timed out|duration elapsed/i.test(job.error||'') ? 'timeout' : 'task-failed';
  job.runs = [...(job.runs || []).filter(run => run.runId !== value.runId), {...value, status, project: job.project, mode: job.mode,
    model: job.model || null, reasoningEffort: job.reasoningEffort || null, errorCategory:failure}].slice(-50);
}
