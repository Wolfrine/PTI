import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { VERSION, home, config, project, digest, read, write, taskDir, task, view, health, launch, alive } from './common.mjs';

const worker = path.join(path.dirname(fileURLToPath(import.meta.url)), 'worker.mjs');
const server = new McpServer({ name: 'local-codex', version: VERSION }, {
  instructions: 'Delegate local project inspection or explicitly authorized edits to this PC. First list_projects; use project keys, never guessed paths. start_task returns a durable asynchronous task ID. Poll get_task until terminal; surface waiting_for_user requests and use respond_to_task only for the human response. Do not claim a queued task is complete. Only bridge-created tasks are accessible. Inspect is the default; edit requires explicit user intent. This PC must be awake. Web/mobile uses the authenticated PTI job relay.',
});
const annotations = readOnly => ({ readOnlyHint: readOnly, destructiveHint: !readOnly, idempotentHint: true, openWorldHint: true });
function result(data) { return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data }; }
function register(name, description, shape, readOnly, fn) {
  server.registerTool(name, { description, inputSchema: shape, annotations: annotations(readOnly) }, async args => {
    try { return result(await fn(args)); }
    catch (error) { return { content: [{ type: 'text', text: error.message }], isError: true }; }
  });
}
const id = z.string().regex(/^[a-f0-9]{32}$/);
const key = z.string().min(8).max(128).describe('Stable unique key for this exact request. Reuse on retry to avoid duplicate execution.');
const prompt = z.string().trim().min(1).max(24000);

register('bridge_status', 'Check the local Codex runtime and bridge transport. Does not run a model or expose credentials.', {}, true, health);
register('list_projects', 'List the configured F-drive project keys available to local Codex. This does not read project contents.', {}, true, () => ({
  projects: Object.keys(config().projects).map(name => { try { return { ...project(name), available: true }; } catch (error) { return { key: name, available: false, error: error.message }; } }),
}));
register('start_task', 'Start an asynchronous local Codex task. Inspect reads a project; edit may change files in that project and requires explicit human authorization. Return the task ID and poll get_task. Reuse request_key on retries.', {
  project: z.string(), prompt, mode: z.enum(['inspect', 'edit']).default('inspect'), request_key: key,
}, false, args => {
  const target = project(args.project);
  const jobId = digest(args.request_key).slice(0, 32);
  const inputHash = digest(JSON.stringify({ project: target.key, prompt: args.prompt, mode: args.mode }));
  const directory = taskDir(jobId);
  fs.mkdirSync(path.dirname(directory), { recursive: true });
  try { fs.mkdirSync(directory); } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const existing = task(jobId);
    if (existing.inputHash !== inputHash) throw new Error('request_key was already used for a different request.');
    return view(existing);
  }
  const now = new Date().toISOString();
  const job = { id: jobId, project: target.key, cwd: target.path, mode: args.mode, inputHash, prompt: args.prompt,
    createdAt: now, updatedAt: now, status: 'queued', threadId: null, turnId: null, messages: [], pending: [], history: [] };
  write(path.join(directory, 'task.json'), job);
  launch(jobId, worker);
  return job;
});
register('get_task', 'Read a bridge-created task, progress, pending human questions or approvals, and the completed response. Call again while status is queued/running. Does not start a model.', {
  task_id: id, wait_seconds: z.number().int().min(0).max(20).default(0),
}, true, async args => {
  let job = view(task(args.task_id));
  const before = job.updatedAt;
  const deadline = Date.now() + args.wait_seconds * 1000;
  while (['queued', 'running'].includes(job.status) && job.updatedAt === before && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 300));
    job = view(task(args.task_id));
  }
  return job;
});
register('continue_task', 'Continue a completed or interrupted bridge-created Codex task in its existing thread. Cannot change its project or inspect/edit mode. Reuse request_key on retry.', {
  task_id: id, prompt, request_key: key,
}, false, args => {
  const directory = taskDir(args.task_id);
  const job = view(task(args.task_id));
  const action = digest(args.request_key);
  const inputHash = digest(args.prompt);
  const prior = job.history.find(entry => entry.key === action);
  if (prior) {
    if (prior.inputHash !== inputHash) throw new Error('request_key was already used for a different continuation.');
    return job;
  }
  if (!['completed', 'failed', 'interrupted'].includes(job.status)) throw new Error('Wait for completion or cancel the active turn first.');
  if (alive(job.workerPid)) throw new Error('The previous worker is still exiting; retry shortly.');
  project(job.project);
  // An exclusive lock serializes continuation requests from separate ChatGPT connections.
  const lock = path.join(directory, 'continuation.lock');
  const fd = fs.openSync(lock, 'wx');
  try {
    const current = read(path.join(directory, 'task.json'));
    if (current.updatedAt !== job.updatedAt) throw new Error('Task changed; retrieve it before continuing.');
    for (const name of ['cancel.json', 'worker.lock']) if (fs.existsSync(path.join(directory, name))) fs.unlinkSync(path.join(directory, name));
    Object.assign(job, { prompt: args.prompt, status: 'queued', pending: [], final: null, error: null, updatedAt: new Date().toISOString() });
    job.history.push({ key: action, inputHash });
    write(path.join(directory, 'task.json'), job);
    launch(job.id, worker);
    return job;
  } finally { fs.closeSync(fd); fs.unlinkSync(lock); }
});
register('respond_to_task', 'Send the human answer to a displayed pending request. For approvals use approve or decline only after explicit human choice; never approve on the user behalf. Answers for questions map each question id to an array of answer strings.', {
  task_id: id, request_id: z.string(), decision: z.enum(['approve', 'decline']).optional(),
  answers: z.record(z.string(), z.array(z.string())).optional(),
}, false, args => {
  const job = view(task(args.task_id));
  const pending = job.pending.find(item => item.id === args.request_id);
  const responseFile = path.join(taskDir(job.id), `response-${digest(args.request_id)}.json`);
  if (fs.existsSync(responseFile)) {
    const previous = read(responseFile);
    if (previous.decision !== args.decision || JSON.stringify(previous.answers) !== JSON.stringify(args.answers)) throw new Error('This request already has a different response.');
    return { task_id: job.id, accepted: true };
  }
  if (!pending || job.status !== 'waiting_for_user') throw new Error('No matching active request. Retrieve the task first.');
  if (pending.kind === 'approval' && (!args.decision || args.answers)) throw new Error('An approval requires decision: approve or decline.');
  if (pending.kind === 'question') {
    if (!args.answers || args.decision) throw new Error('A question requires answers.');
    const questions = pending.details.questions || [];
    if (questions.some(question => !args.answers[question.id]?.length)) throw new Error('Answer every displayed question.');
    if (Object.keys(args.answers).some(name => !questions.some(q => q.id === name))) throw new Error('Unknown question id.');
  }
  const fd = fs.openSync(responseFile, 'wx');
  try { fs.writeFileSync(fd, JSON.stringify(args)); } finally { fs.closeSync(fd); }
  return { task_id: job.id, accepted: true };
});
register('cancel_task', 'Request cancellation of an active bridge-created task. Cancellation does not undo file changes already made. Poll get_task for the terminal state.', {
  task_id: id,
}, false, args => {
  const job = view(task(args.task_id));
  if (['completed', 'failed', 'interrupted'].includes(job.status)) return job;
  write(path.join(taskDir(job.id), 'cancel.json'), { requestedAt: new Date().toISOString() });
  return { task_id: job.id, status: 'cancellation_requested' };
});

await server.connect(new StdioServerTransport());
