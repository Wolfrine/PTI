import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import {modelSelection} from './model-policy.mjs';

export const VERSION = '0.3.3';
export const DEFAULT_HOME = 'F:/Workspace/Support/LocalCodexBridge';
export const home = process.env.LOCAL_CODEX_BRIDGE_HOME || DEFAULT_HOME;
export const configFile = path.join(home, 'config.json');
export const digest = text => crypto.createHash('sha256').update(text).digest('hex');
export function subscriptionEnvironment() {
  const env={...process.env};
  for(const name of Object.keys(env))if(['OPENAI_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN','OPENAI_BASE_URL','OPENAI_API_BASE'].includes(name.toUpperCase()))delete env[name];
  return env;
}
export const read = file => JSON.parse(fs.readFileSync(file, 'utf8'));
export function write(file, value) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try{
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2));
    // Windows readers and antivirus can briefly hold a destination without
    // delete-sharing. Retain the old complete file while retrying replacement.
    for(let attempt=0;;attempt++){
      try{fs.renameSync(temporary,file);break;}
      catch(error){if(!['EPERM','EACCES','EBUSY'].includes(error.code)||attempt>=19)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}
    }
  }finally{if(fs.existsSync(temporary))fs.unlinkSync(temporary);}
}
export function config() {
  const value = read(configFile);
  if (!path.win32.isAbsolute(home) || !home.toLowerCase().startsWith('f:')) throw new Error('Bridge data must be on F:.');
  if (!value.projects || !Object.keys(value.projects).length) throw new Error('Configure at least one project.');
  return value;
}
export function project(key) {
  const target = config().projects[key];
  if (!target) throw new Error('Unknown project. Call list_projects for configured project keys.');
  const actual = fs.realpathSync.native(target.path);
  if (!actual.toLowerCase().startsWith('f:\\')) throw new Error('The resolved project must be on F:.');
  if (!fs.statSync(actual).isDirectory()) throw new Error('The project is not a directory.');
  return { key, name: target.name || key, path: actual };
}
export function taskDir(id) {
  if (!/^[a-f0-9]{32}$/.test(id)) throw new Error('Invalid task ID.');
  return path.join(home, 'tasks', id);
}
export function task(id) { return read(path.join(taskDir(id), 'task.json')); }
export function alive(pid) {
  if (!Number.isInteger(pid)) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}
export function runtime() {
  const configured = config().codexPath;
  if (configured && fs.existsSync(configured)) return configured;
  const base = path.join(process.env.LOCALAPPDATA || '', 'OpenAI', 'Codex', 'bin');
  const candidates = fs.existsSync(base) ? fs.readdirSync(base).map(name => path.join(base, name, 'codex.exe')).filter(file => fs.existsSync(file)) : [];
  candidates.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  if (!candidates.length) throw new Error('No desktop Codex runtime found. Set codexPath in config.json.');
  return candidates[0];
}
export function launch(id, worker) {
  const proc = spawn(process.execPath, [worker, id], {
    cwd: home, detached: true, windowsHide: true, stdio: 'ignore',
    env: { ...process.env, LOCAL_CODEX_BRIDGE_HOME: home },
  });
  proc.on('error', error => {
    const job = task(id);
    if (job.status === 'queued') write(path.join(taskDir(id), 'task.json'), { ...job, status: 'failed', error: error.message });
  });
  proc.unref();
}
export function view(job) {
  if (job.status === 'queued' && Date.now() - Date.parse(job.updatedAt) > 60000 && !alive(job.workerPid)) {
    return { ...job, status: 'interrupted', error: 'The queued worker did not start. Continue to retry.' };
  }
  if (['running', 'waiting_for_user'].includes(job.status) && !alive(job.workerPid)) {
    return { ...job, status: 'interrupted', error: 'The local worker stopped. Continue the task to resume its Codex thread.' };
  }
  return job;
}
export function health() {
  const executable = runtime();
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  if (result.status !== 0) throw new Error('The configured Codex runtime did not start.');
  const login=spawnSync(executable,['login','status'],{encoding:'utf8',windowsHide:true,timeout:10000,env:subscriptionEnvironment()});
  const authMode=login.status===0&&/Logged in using ChatGPT/i.test(login.stdout+login.stderr)?'chatgpt':'unavailable';
  const selection=modelSelection(config());
  return { version: VERSION, codexVersion: result.stdout.trim(), codexPath: executable, dataPath: home, model:selection.model, reasoning_effort:selection.effort,
    authMode,
    transport: 'stdio', networkListener: false, signIn: 'Uses the current Windows user Codex sign-in; verified when a task starts.',
    webMobile: 'Available through the authenticated PTI job relay when this worker is online.' };
}
