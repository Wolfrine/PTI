import { open, readFile, rename, rm, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { MonitorError } from './core.mjs';

export async function readJson(file, fallback = null) {
  try { const info = await stat(file); if (!info.isFile() || info.size > 512_000) throw new Error('Invalid local state'); return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw new MonitorError('protected-store-unavailable'); }
}
export async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(temporary, 'wx', 0o600); await handle.writeFile(JSON.stringify(value)); await handle.sync(); await handle.close(); handle = null;
    await rename(temporary, file);
  } finally { await handle?.close(); await rm(temporary, { force: true }); }
}
const alive = pid => { if (!Number.isSafeInteger(pid) || pid < 1) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code !== 'ESRCH'; } };
export async function recoverChild(lease) {
  if (process.platform !== 'win32' || !lease?.rpcPid || !lease?.rpcExecutable || !lease?.startedAt || alive(lease.pid)) return false;
  // PID, exact package path, parent PID and creation window must all match our lease.
  const script = String.raw`$ErrorActionPreference='Stop'; $r=[Console]::In.ReadToEnd()|ConvertFrom-Json; $p=Get-CimInstance Win32_Process -Filter ('ProcessId = '+[int]$r.rpcPid); if($p -and $p.ParentProcessId -eq [int]$r.pid -and $p.ExecutablePath -eq [string]$r.rpcExecutable -and $p.CommandLine -match 'app-server.*--listen.*stdio://' -and $p.CreationDate.ToUniversalTime() -ge [DateTime]::Parse([string]$r.startedAt).ToUniversalTime().AddSeconds(-2) -and $p.CreationDate.ToUniversalTime() -le [DateTime]::Parse([string]$r.childRecordedAt).ToUniversalTime().AddSeconds(2)){Stop-Process -Id $p.ProcessId -Force;[Console]::Out.Write('recovered')}`;
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise(resolve => {
    const child = (async () => { const { spawn } = await import('node:child_process'); return spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }); })();
    child.then(proc => { let out = ''; const timer = setTimeout(() => { proc.kill(); resolve(false); }, 8000); proc.stdout.on('data', b => { out += b.toString(); }); proc.on('error', () => { clearTimeout(timer); resolve(false); }); proc.on('close', () => { clearTimeout(timer); resolve(out === 'recovered'); }); proc.stdin.on('error', () => {}); proc.stdin.end(JSON.stringify(lease)); }).catch(() => resolve(false));
  });
}
export async function acquireLease(root) {
  await mkdir(root, { recursive: true });
  const file = path.join(root, 'run.lock'); const token = randomUUID(); let handle;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { handle = await open(file, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const info = await stat(file).catch(() => null); if (!info) continue;
      const prior = await readJson(file).catch(() => null);
      if (alive(prior?.pid) || !prior && Date.now() - info.mtimeMs < 180_000) return null;
      await recoverChild(prior);
      // A unique takeover name prevents two reclaimers deleting the same old lease.
      const claimed = `${file}.stale-${token}`;
      try { await rename(file, claimed); await rm(claimed, { force: true }); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    }
  }
  if (!handle) return null;
  let value = { token, pid: process.pid, startedAt: new Date().toISOString() };
  await handle.writeFile(JSON.stringify(value)); await handle.sync(); await handle.close();
  return {
    async child(server) { value = { ...value, rpcPid: server.child.pid, rpcExecutable: server.child.spawnfile, childRecordedAt: new Date().toISOString() }; await atomicJson(file, value); },
    async release() { const current = await readJson(file); if (current?.token === token) await rm(file, { force: true }); },
  };
}
export async function logEvent(root, event, details = {}) {
  const file = path.join(root, 'events.json');
  const previous = await readJson(file, []).catch(() => []);
  // Caller supplies only fixed codes/timestamps/counts, never raw exceptions or responses.
  await atomicJson(file, [...previous, { at: new Date().toISOString(), event, ...details }].slice(-100));
}
