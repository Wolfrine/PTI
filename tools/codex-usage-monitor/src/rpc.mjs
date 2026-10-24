import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { MonitorError, retry } from './core.mjs';

const execute = promisify(execFile);
const ALLOWED = new Set(['initialize', 'account/read', 'account/rateLimits/read', 'account/usage/read']);
export async function resolveCodex({ localAppData = process.env.LOCALAPPDATA, preferred } = {}) {
  const base = path.join(localAppData || '', 'OpenAI', 'Codex', 'bin');
  const candidates = new Set();
  // The running desktop process identifies its selected package; do not attach to it.
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        "Get-Process -Name codex -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique"], { windowsHide: true, timeout: 5000, maxBuffer: 32_768 });
      for (const executable of stdout.split(/\r?\n/)) if (path.resolve(executable.trim()).startsWith(path.resolve(base) + path.sep)) candidates.add(executable.trim());
    } catch { /* A closed desktop app is normal. Use installed packages below. */ }
  }
  if (preferred && path.resolve(preferred).startsWith(path.resolve(base) + path.sep)) candidates.add(preferred);
  try {
    const entries = await readdir(base, { withFileTypes: true });
    const dirs = await Promise.all(entries.filter(e => e.isDirectory()).map(async e => ({ executable: path.join(base, e.name, 'codex.exe'), mtime: (await stat(path.join(base, e.name))).mtimeMs })));
    dirs.sort((a, b) => b.mtime - a.mtime).forEach(e => candidates.add(e.executable));
  } catch { /* Report one sanitized error below. */ }
  for (const executable of candidates) {
    try {
      const { stdout } = await execute(executable, ['--version'], { windowsHide: true, timeout: 5000, maxBuffer: 4096 });
      if (/^codex-cli \S+/m.test(stdout)) return { executable, version: stdout.trim().slice(0, 100) };
    } catch { /* An old package may have been removed during an update. */ }
  }
  throw new MonitorError('codex-binary-unavailable');
}
export class AppServer {
  constructor(executable, { timeoutMs = 20_000, spawnImpl = spawn } = {}) {
    this.timeoutMs = timeoutMs; this.nextId = 0; this.pending = new Map(); this.closed = false;
    this.child = spawnImpl(executable, ['app-server', '--listen', 'stdio://'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    this.child.stderr.on('data', () => {}); // Do not export server diagnostics or account details.
    this.child.stdin.on('error', () => this.failAll(new MonitorError('rpc-exited', { transient: true })));
    this.child.on('error', () => this.failAll(new MonitorError('rpc-unavailable', { transient: true })));
    this.child.on('exit', () => { this.closed = true; this.failAll(new MonitorError('rpc-exited', { transient: true })); });
    this.lines = readline.createInterface({ input: this.child.stdout, crlfDelay: Infinity });
    this.lines.on('line', line => {
      if (line.length > 2 * 1024 * 1024) { this.failAll(new MonitorError('invalid-source-response')); this.close(); return; }
      let message; try { message = JSON.parse(line); } catch { return; }
      const request = this.pending.get(message.id); if (!request) return;
      this.pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new MonitorError(message.error.code === -32601 ? 'unsupported-method' : 'source-unavailable', { transient: message.error.code !== -32601 && !/auth|login|unauthorized/i.test(message.error.message || '') }));
      else request.resolve(message.result);
    });
  }
  failAll(error) { for (const item of this.pending.values()) { clearTimeout(item.timer); item.reject(error); } this.pending.clear(); }
  request(method, params) {
    if (!ALLOWED.has(method)) throw new Error('RPC method is outside the monitor allowlist');
    if (this.closed) return Promise.reject(new MonitorError('rpc-exited', { transient: true }));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new MonitorError('rpc-timeout', { transient: true })); }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, method, ...(params === undefined ? {} : { params }) }) + '\n');
    });
  }
  async initialize() {
    await this.request('initialize', { clientInfo: { name: 'pti_usage_monitor', title: 'PTI Usage Monitor', version: '1.0.0' }, capabilities: { experimentalApi: true } });
    this.child.stdin.write(JSON.stringify({ method: 'initialized' }) + '\n');
  }
  async close() {
    if (this.closing) return this.closing;
    this.closing = (async () => {
      this.failAll(new MonitorError('rpc-exited'));
      this.lines.close(); this.child.stdin.end();
      if (this.child.exitCode !== null) return;
      await new Promise(resolve => { const timer = setTimeout(() => { this.child.kill(); resolve(); }, 1000); this.child.once('exit', () => { clearTimeout(timer); resolve(); }); });
    })();
    return this.closing;
  }
}
export async function collect(executable, { previousCapability, timeoutMs, onServer } = {}) {
  const server = new AppServer(executable, { timeoutMs }); await onServer?.(server);
  try {
    await server.initialize();
    const identity = await server.request('account/read', { refreshToken: false });
    if (identity?.account?.type !== 'chatgpt') throw new MonitorError('codex-login-required');
    const [allowance, daily] = await Promise.allSettled([
      retry(() => server.request('account/rateLimits/read')),
      previousCapability === 'unsupported' ? Promise.reject(new MonitorError('unsupported-method')) : retry(() => server.request('account/usage/read')),
    ]);
    return { account: identity.account,
      allowanceResult: allowance.status === 'fulfilled' ? allowance.value : undefined,
      allowanceError: allowance.status === 'rejected' ? allowance.reason : undefined,
      dailyResult: daily.status === 'fulfilled' ? daily.value : undefined,
      dailyError: daily.status === 'rejected' ? daily.reason : undefined };
  } finally { await server.close(); }
}
