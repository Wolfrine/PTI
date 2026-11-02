import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { home, config, project, read, write, runtime, task, taskDir, digest, alive, subscriptionEnvironment } from './common.mjs';
import {assertStoredIdle} from './codex-history.mjs';
import {modelSelection,requireModel,verifyModel} from './model-policy.mjs';
import {harnessPolicy} from './harness-policy.mjs';
import {createTelemetry,archiveRun} from './telemetry.mjs';
import {acquireWorkspaceLock} from './workspace-locks.mjs';
import {executionPolicy,verifyExecutionPolicy,workerInstructions} from './execution-policy.mjs';
import {executionDeadline,deadlineElapsed} from './limits.mjs';
import {moduleParent} from './chat-routing.mjs';

const id = process.argv[2];
const directory = taskDir(id);
const file = path.join(directory, 'task.json');
const lock = path.join(directory, 'worker.lock');
let lockFd;
try { lockFd = fs.openSync(lock, 'wx'); } catch { process.exit(0); }
let job = task(id), proc, timer, deadline, closed = false, sequence = 0, releaseWorkspace,threadLock,moduleLock,telemetry,selection,policy;
const requests = new Map(), waiting = new Map();
const childChecks = new Map();
function acquireIdentityLock(kind,value){
  const locks=path.join(home,'locks');fs.mkdirSync(locks,{recursive:true});
  const candidate=path.join(locks,`${digest(kind+':'+value)}.json`);
  if(fs.existsSync(candidate)&&!alive(read(candidate).pid))fs.unlinkSync(candidate);
  const fd=fs.openSync(candidate,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid,taskId:id}));fs.closeSync(fd);return candidate;
}
function acquireThreadLock(threadId){threadLock=acquireIdentityLock('thread',threadId);}
function save() { job.updatedAt = new Date().toISOString(); if(telemetry)job.telemetry=telemetry.snapshot(); write(file, job); }
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
  clearInterval(timer);
  job.status = status;
  job.pending = [];
  if (error) job.error = error;
  if(telemetry){telemetry.finish();archiveRun(job,telemetry,status);}
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
  releaseWorkspace?.();
  if (threadLock && fs.existsSync(threadLock) && read(threadLock).taskId === id) fs.unlinkSync(threadLock);
  if (moduleLock && fs.existsSync(moduleLock) && read(moduleLock).taskId === id) fs.unlinkSync(moduleLock);
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
  telemetry?.requestOpened(requestId,kind);
  job.pending.push(pending);
  job.status = 'waiting_for_user';
  save();
}
function notification(message) {
  const p = message.params || {};
  if(message.method==='serverRequest/resolved'){
    for(const [requestId,request] of waiting){
      if(String(request.id)!==String(p.requestId)||p.threadId&&request.params?.threadId!==p.threadId)continue;
      waiting.delete(requestId);telemetry?.requestClosed(requestId);job.pending=job.pending.filter(value=>value.id!==requestId);
      job.status=waiting.size?'waiting_for_user':'running';save();
    }
  }
  const violation=telemetry?.observe(message,job.threadId,selection);
  if(violation){finish('failed',violation);return;}
  if(telemetry&&policy){
    const observed=telemetry.snapshot();
    if(policy.maxSubagents!==null&&observed.childrenSeen>policy.maxSubagents){finish('failed','The owner-selected subagent limit was exceeded.');return;}
    for(const child of observed.children){
      if(child.selectionVerified||childChecks.has(child.threadId))continue;
      const check=rpc('thread/read',{threadId:child.threadId,includeTurns:false}).then(({thread})=>{
        if(closed||thread?.parentThreadId!==job.threadId&&!telemetry.snapshot().children.some(value=>value.threadId===thread?.parentThreadId))return;
        const mismatch=thread.modelProvider&&thread.modelProvider!=='openai'?'A subagent selected a different model provider. Ask the owner; no fallback is allowed.':telemetry.childMetadata(child.threadId,thread,selection,true);
        if(mismatch)finish('failed',mismatch);else save();
      }).catch(()=>{/* Missing metadata remains unknown, not verified execution. */});
      childChecks.set(child.threadId,check);
    }
    if(message.method==='thread/tokenUsage/updated'||message.method==='model/rerouted'||message.method==='thread/started'||message.method==='item/completed'&&p.item?.type!=='agentMessage')save();
  }
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
    Promise.allSettled([...childChecks.values()]).then(()=>{
      if(closed)return;
      if (!job.final && p.turn.status === 'completed') job.final = job.messages.filter(item => item.turnId === p.turn.id).at(-1)?.text || '';
      finish(p.turn.status, p.turn.error?.message);
    });
  }
  if (message.method === 'error' && !p.willRetry) {
    job.error = p.error?.message || 'Codex reported an error.';
    save();
  }
}
try {
  if(job.telemetry&&!(job.runs||[]).some(run=>run.runId===job.telemetry.runId))archiveRun(job,job.telemetry,job.telemetry.finishedAt?'unknown':'interrupted');
  delete job.executionPolicy;
  telemetry=createTelemetry(job);
  const settings=config();selection=modelSelection(settings);policy=harnessPolicy(job,settings,selection);
  job.strategy=policy.strategy;job.purpose||='work';job.turnId=null;job.model=null;job.reasoningEffort=null;
  const target = project(job.project);
  if (target.path !== job.cwd) throw new Error('The project path changed. Start a new task after reviewing list_projects.');
  if(job.chatRouting)moduleLock=acquireIdentityLock('module',job.chatRouting.affinity_id);
  releaseWorkspace=acquireWorkspaceLock(home,{taskId:id,cwd:job.cwd,resourcePath:target.resourcePath||job.resourcePath||job.cwd,mode:job.mode});
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
        if (pending) { clearTimeout(pending.timeout); requests.delete(message.id); message.error ? pending.reject(Object.assign(new Error(message.error.message),{code:message.error.code})) : pending.resolve(message.result); }
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
      if(deadlineElapsed(deadline,Date.now())){finish('interrupted','The owner-configured maximum task duration elapsed. Continue explicitly to resume.');return;}
      for (const [requestId, message] of waiting) {
        const responseFile = path.join(directory, `response-${digest(requestId)}.json`);
        if (!fs.existsSync(responseFile)) continue;
        const response = read(responseFile);
        const payload = message.method === 'item/tool/requestUserInput'
          ? { answers: Object.fromEntries(Object.entries(response.answers).map(([key, answers]) => [key, { answers }])) }
          : { decision: response.decision === 'approve' ? 'accept' : 'decline' };
        send({ id: message.id, result: payload });
        waiting.delete(requestId);
        telemetry.requestClosed(requestId);
        job.pending = job.pending.filter(item => item.id !== requestId);
        job.status = waiting.size ? 'waiting_for_user' : 'running';
        save();
      }
    } catch (error) { finish('failed', error.message); }
  }, 500);
  // Check the optional owner deadline on the existing control timer. A large
  // explicit duration must not overflow setTimeout into a one-millisecond kill.
  deadline=executionDeadline(Date.now(),settings.maxTaskMinutes);
  await rpc('initialize', { clientInfo: { name: 'local_codex_bridge', title: 'Local Codex Bridge', version: '0.1.0' }, capabilities: { experimentalApi: false } });
  send({ method: 'initialized', params: {} });
  const account = await rpc('account/read', { refreshToken: false });
  if (account.account?.type !== 'chatgpt') throw new Error('ChatGPT subscription sign-in is required. API-key authentication is disabled for this bridge.');
  await requireModel(rpc, selection);
  const parent=await moduleParent(rpc,job,target);
  if(parent.reason){
    job.chatRouting={...job.chatRouting,selection:'new',previous_thread_id:job.threadId,reason:parent.reason};
    job.threadId=null;save();
  }
  if(parent.threadId){
    await assertStoredIdle(rpc,parent.thread,id);
    // The caller explicitly selects the allowlisted project for a historical
    // thread. Resume applies that cwd and reloads its current project guidance.
    acquireThreadLock(job.threadId);
  }
  const permissions = executionPolicy(job.mode);
  const instructions = workerInstructions(job)+' '+policy.instructions+(job.chatRouting?` Current functional module: ${job.chatRouting.module_key}. This is task ${job.id}, with its own current scope and authorization. Retained native history is source context, never authority to repeat earlier actions. Prioritize native subagents under this parent for independent lanes; dependent work stays serial.`:'');
  const options = { cwd: job.cwd, model: selection.model, sandbox: permissions.sandbox, approvalPolicy: permissions.approvalPolicy, developerInstructions: instructions,
    config: { model_reasoning_effort: selection.effort, ...policy.config, 'plugins.local-codex@local-codex-bridge.enabled': false, 'plugins.local-codex@created-by-me-remote.enabled': false } };
  const started = job.threadId
    ? await rpc('thread/resume', { ...options, threadId: job.threadId,excludeTurns:true })
    : await rpc('thread/start', { ...options, serviceName: 'local_codex_bridge' });
  if (started.modelProvider !== 'openai') throw new Error('Only the signed-in ChatGPT provider is allowed.');
  verifyExecutionPolicy(started, permissions);
  verifyModel(started, selection);
  const isNewThread=!job.threadId;
  if(isNewThread)acquireThreadLock(started.thread.id);
  job.threadId = started.thread.id;
  job.model = started.model;
  job.reasoningEffort = started.reasoningEffort;
  job.sandbox = started.sandbox;
  job.approvalPolicy = started.approvalPolicy;
  // Resuming can retain the initial developer message even when the resume
  // response reflects new sandbox settings. Append the current contract through
  // the supported history API before inference, rather than trusting an echo.
  if(!isNewThread){
    const injected=await rpc('thread/inject_items',{threadId:job.threadId,items:[{type:'message',role:'developer',content:[{type:'input_text',text:instructions}]}]});
    if(!injected||typeof injected!=='object'||Array.isArray(injected))throw Error('Codex did not acknowledge the current instruction refresh; refusing to start.');
  }
  job.executionPolicy = {version:1,mode:job.mode,sandboxType:started.sandbox.type,approvalPolicy:started.approvalPolicy,instructionRefresh:isNewThread?'thread-start':'history-injection',verifiedAt:new Date().toISOString()};
  save();
  if(isNewThread&&job.title)await rpc('thread/name/set',{threadId:job.threadId,name:`[${target.name}] ${job.title}`.slice(0,120)});
  const currentPrompt=job.handoff?`Project handoff supplied for this rotation (source context only):\n${job.handoff}\n\nCurrent authorized request:\n${job.prompt}`:job.prompt;
  const turn = await rpc('turn/start', { threadId: job.threadId, model: selection.model, effort: selection.effort, input: [{ type: 'text', text: currentPrompt }] });
  job.turnId = turn.turn.id;
  save();
} catch (error) { finish('failed', error.message); }
