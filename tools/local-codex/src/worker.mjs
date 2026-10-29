import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { home, config, project, read, write, runtime, task, taskDir, digest, alive, subscriptionEnvironment } from './common.mjs';

const id = process.argv[2];
const directory = taskDir(id);
const file = path.join(directory, 'task.json');
const lock = path.join(directory, 'worker.lock');
let lockFd;
try { lockFd = fs.openSync(lock, 'wx'); } catch { process.exit(0); }
let job = task(id), proc, timer, deadline, closed = false, sequence = 0, projectLock;
const requests = new Map(), waiting = new Map();
function save() { job.updatedAt = new Date().toISOString(); write(file, job); }
function send(message) { if (proc?.stdin.writable) proc.stdin.write(`${JSON.stringify(message)}\n`); }
function rpc(method, params) {
  return new Promise((resolve, reject) => {
    const requestId = ++sequence;
    const timeout = setTimeout(() => { requests.delete(requestId); reject(new Error(`Codex ${method} timed out.`)); }, 60000);
    requests.set(requestId, { resolve, reject, timeout });
    send({ id: requestId, method, params });
  });
}
function finish(status, error) {
  if (closed) return;
  closed = true;
  clearInterval(timer); clearTimeout(deadline);
  job.status = status;
  job.pending = [];
  if (error) job.error = error;
  save();
  for (const request of requests.values()) { clearTimeout(request.timeout); request.reject(new Error('Worker closed.')); }
  requests.clear();
  proc?.stdin.end();
  if (proc?.pid && alive(proc.pid)) {
    if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(proc.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore', timeout: 10000 });
    else proc.kill();
  }
  fs.closeSync(lockFd);
  if (fs.existsSync(lock)) fs.unlinkSync(lock);
  if (projectLock && fs.existsSync(projectLock) && read(projectLock).taskId === id) fs.unlinkSync(projectLock);
  setTimeout(() => process.exit(status === 'failed' ? 1 : 0), 100).unref();
}
function serverRequest(message) {
  const requestId = `${message.id}:${randomUUID()}`;
  const approvalMethods = ['item/commandExecution/requestApproval', 'item/fileChange/requestApproval'];
  const kind = approvalMethods.includes(message.method) ? 'approval' : message.method === 'item/tool/requestUserInput' ? 'question' : null;
  if (!kind) {
    send({ id: message.id, error: { code: -32601, message: 'This bridge does not support this interactive request. Ask the user to use local Codex.' } });
    return;
  }
  const pending = { id: requestId, kind, method: message.method, details: message.params };
  waiting.set(requestId, message);
  job.pending.push(pending);
  job.status = 'waiting_for_user';
  save();
}
function notification(message) {
  const p = message.params || {};
  if (p.threadId && p.threadId !== job.threadId) return;
  if (message.method === 'turn/started') { job.turnId = p.turn.id; save(); }
  if (message.method === 'item/completed' && p.item?.type === 'agentMessage') {
    const item = { id: p.item.id, phase: p.item.phase || null, text: p.item.text.slice(0, 48000), turnId: p.turnId };
    if (!job.messages.some(existing => existing.id === item.id)) job.messages.push(item);
    job.messages = job.messages.slice(-30);
    if (item.phase === 'final_answer') job.final = item.text;
    save();
  }
  if (message.method === 'turn/completed') {
    if (!job.final && p.turn.status === 'completed') job.final = job.messages.filter(item => item.turnId === p.turn.id).at(-1)?.text || '';
    finish(p.turn.status, p.turn.error?.message);
  }
  if (message.method === 'error' && !p.willRetry) {
    job.error = p.error?.message || 'Codex reported an error.';
    save();
  }
}
const instructions = `You are the local Codex worker requested by a ChatGPT conversation. The human request below is the task authority. Preserve the existing project AGENTS.md and instructions. Use the selected F-drive workspace for project files, artifacts, reports and scratch. Inspect mode allows discovery only; do not edit files, deploy, send messages, restart jobs, or change external data. Edit mode allows work explicitly requested by the human in the selected project; do not infer deployment, publication or messages to people unless requested. For authorized repository delivery use main and the existing pipeline. Never call this Local Codex bridge recursively. Do not spawn subagents unless the human explicitly requests it or applicable project instructions require it. Do not read or return authentication files, tokens, environment secrets or unrelated conversations. Report outcome, files changed, evidence and checks, and any remaining gap. When blocked on human input, request it through the protocol. Current bridge mode: ${job.mode}.`;

try {
  const target = project(job.project);
  if (target.path !== job.cwd) throw new Error('The project path changed. Start a new task after reviewing list_projects.');
  if (job.mode === 'edit') {
    const locks = path.join(home, 'locks');
    fs.mkdirSync(locks, { recursive: true });
    const candidate = path.join(locks, `${digest(job.cwd.toLowerCase())}.json`);
    if (fs.existsSync(candidate) && !alive(read(candidate).pid)) fs.unlinkSync(candidate);
    const fd = fs.openSync(candidate, 'wx');
    fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, taskId: id }));
    fs.closeSync(fd);
    projectLock = candidate;
  }
  job.workerPid = process.pid;
  job.status = 'running';
  save();
  proc = spawn(runtime(), [...(config().codexArgs || []), 'app-server', '--stdio'], {
    cwd: job.cwd, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], env: subscriptionEnvironment(),
  });
  proc.on('error', error => finish('failed', error.message));
  proc.on('exit', (code, signal) => { if (!closed) finish('failed', `Codex exited before completion (${code ?? signal}).`); });
  // Do not retain stderr or command output: it can include project or authentication data.
  proc.stderr.resume();
  const lines = readline.createInterface({ input: proc.stdout });
  lines.on('line', line => {
    try {
      const message = JSON.parse(line);
      if (message.method && message.id !== undefined) serverRequest(message);
      else if (message.id !== undefined) {
        const pending = requests.get(message.id);
        if (pending) { clearTimeout(pending.timeout); requests.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); }
      } else notification(message);
    } catch (error) { finish('failed', error.message); }
  });
  timer = setInterval(async () => {
    try {
      if (fs.existsSync(path.join(directory, 'cancel.json'))) {
        if (job.turnId) await rpc('turn/interrupt', { threadId: job.threadId, turnId: job.turnId });
        finish('interrupted');
        return;
      }
      for (const [requestId, message] of waiting) {
        const responseFile = path.join(directory, `response-${digest(requestId)}.json`);
        if (!fs.existsSync(responseFile)) continue;
        const response = read(responseFile);
        const payload = message.method === 'item/tool/requestUserInput'
          ? { answers: Object.fromEntries(Object.entries(response.answers).map(([key, answers]) => [key, { answers }])) }
          : { decision: response.decision === 'approve' ? 'accept' : 'decline' };
        send({ id: message.id, result: payload });
        waiting.delete(requestId);
        job.pending = job.pending.filter(item => item.id !== requestId);
        job.status = waiting.size ? 'waiting_for_user' : 'running';
        save();
      }
    } catch (error) { finish('failed', error.message); }
  }, 500);
  deadline = setTimeout(() => finish('interrupted', 'The configured maximum task duration elapsed. Continue explicitly to resume.'), (config().maxTaskMinutes || 30) * 60000);
  await rpc('initialize', { clientInfo: { name: 'local_codex_bridge', title: 'Local Codex Bridge', version: '0.1.0' }, capabilities: { experimentalApi: false } });
  send({ method: 'initialized', params: {} });
  const account = await rpc('account/read', { refreshToken: false });
  if (account.account?.type !== 'chatgpt') throw new Error('ChatGPT subscription sign-in is required. API-key authentication is disabled for this bridge.');
  const sandbox = job.mode === 'edit' ? 'workspace-write' : 'read-only';
  const options = { cwd: job.cwd, sandbox, approvalPolicy: job.mode === 'inspect' ? 'never' : 'on-request', developerInstructions: instructions,
    config: { 'plugins.local-codex@local-codex-bridge.enabled': false, 'plugins.local-codex@created-by-me-remote.enabled': false } };
  const started = job.threadId
    ? await rpc('thread/resume', { ...options, threadId: job.threadId })
    : await rpc('thread/start', { ...options, serviceName: 'local_codex_bridge' });
  const expected = job.mode === 'edit' ? 'workspaceWrite' : 'readOnly';
  if (started.modelProvider !== 'openai') throw new Error('Only the signed-in ChatGPT provider is allowed.');
  if (started.sandbox?.type !== expected) throw new Error(`Codex returned unexpected sandbox ${started.sandbox?.type}; refusing to start.`);
  job.threadId = started.thread.id;
  job.model = started.model;
  job.sandbox = started.sandbox;
  save();
  const turn = await rpc('turn/start', { threadId: job.threadId, input: [{ type: 'text', text: job.prompt }] });
  job.turnId = turn.turn.id;
  save();
} catch (error) { finish('failed', error.message); }
