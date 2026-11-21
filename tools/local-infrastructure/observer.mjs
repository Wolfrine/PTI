import { execFile } from 'node:child_process';
import { rename, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('.', import.meta.url));
const run = promisify(execFile);
const project = 'pti-app-2ab59';
const uid = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const document = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/users/${uid}/resourceUsage/local-infrastructure`;
const rulesApi = 'https://firebaserules.googleapis.com/v1';
const hours = 60 * 60 * 1000;

const bounded = (value, max = Number.MAX_SAFE_INTEGER, min = 0) =>
  Number.isFinite(value) && value >= min && value <= max ? value : null;

function capacity(value) {
  const totalBytes = bounded(value?.totalBytes, Number.MAX_SAFE_INTEGER, 1);
  const usedBytes = bounded(value?.usedBytes, totalBytes ?? 0);
  return totalBytes !== null && usedBytes !== null ? { usedBytes, totalBytes } : null;
}

function cpuCounters() {
  return os.cpus().reduce(({ idle, total }, { times }) => ({
    idle: idle + times.idle,
    total: total + Object.values(times).reduce((sum, time) => sum + time, 0),
  }), { idle: 0, total: 0 });
}

async function cpuUsage() {
  const before = cpuCounters();
  await delay(1200);
  const after = cpuCounters();
  return bounded(Math.round((1 - (after.idle - before.idle) / (after.total - before.total)) * 100), 100);
}

async function nvidia() {
  const system = process.env.SystemRoot || 'C:\\Windows';
  const options = { timeout: 5000, windowsHide: true, maxBuffer: 4096, cwd: root };
  const fields = ['--id=0', '--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu', '--format=csv,noheader,nounits'];
  try {
    const { stdout } = await run(path.join(system, 'System32', 'nvidia-smi.exe'), fields, options);
    const [gpuPercent, used, total, gpuTemperatureC] = stdout.trim().split(',').map(value => /^\s*\d+\s*$/.test(value) ? Number(value) : null);
    return {
      gpuPercent: bounded(gpuPercent, 100),
      vram: used === null || total === null ? null : capacity({ usedBytes: used * 1048576, totalBytes: total * 1048576 }),
      gpuTemperatureC: bounded(gpuTemperatureC, 150),
    };
  } catch {
    return { gpuPercent: null, vram: null, gpuTemperatureC: null };
  }
}

async function windowsProbe() {
  const system = process.env.SystemRoot || 'C:\\Windows';
  const shell = path.join(system, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await run(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'probe.ps1')],
    { timeout: 22_000, windowsHide: true, maxBuffer: 32_768, cwd: root });
  return JSON.parse(stdout);
}

async function sample() {
  if (process.platform !== 'win32') throw new Error('windows-required');
  const [cpuPercent, gpu, native] = await Promise.all([cpuUsage(), nvidia(), windowsProbe()]);
  const totalBytes = os.totalmem();
  const memory = capacity({ totalBytes, usedBytes: totalBytes - os.freemem() });
  const receivedBytesPerSecond = bounded(native.network?.receivedBytesPerSecond);
  const sentBytesPerSecond = bounded(native.network?.sentBytesPerSecond);
  return {
    schemaVersion: 1,
    collectedAt: Date.now(),
    workstation: {
      cpuPercent, memory, ...gpu,
      disks: { F: capacity(native.disks?.F), H: capacity(native.disks?.H) },
      uptimeSeconds: bounded(Math.floor(os.uptime())),
      cpuTemperatureC: null,
      network: receivedBytesPerSecond === null || sentBytesPerSecond === null ? null : { receivedBytesPerSecond, sentBytesPerSecond },
    },
    workers: native.workers,
  };
}

function encode(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'number') return Number.isSafeInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, encode(entry)])) } };
}

function decode(value) {
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.arrayValue) return (value.arrayValue.values ?? []).map(decode);
  if (value.mapValue) return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([key, entry]) => [key, decode(entry)]));
  return Object.values(value)[0];
}

async function cloudClient() {
  // SDK-managed ADC for the existing Windows user. No service-account key is provisioned.
  const { GoogleAuth, UserRefreshClient } = await import('google-auth-library');
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  if (!(client instanceof UserRefreshClient)) throw new Error('owner-user-adc-required');
  return options => client.request({ timeout: 8000, retry: false, ...options });
}

async function readDocument(request) {
  try {
    const { data } = await request({ url: document });
    return { snapshot: decode({ mapValue: { fields: data.fields } }), updateTime: data.updateTime };
  } catch (error) {
    if (error.response?.status === 404) return { snapshot: null, updateTime: null };
    throw error;
  }
}

async function verifyPrivacy(request) {
  const { data: release } = await request({ url: `${rulesApi}/projects/${project}/releases/cloud.firestore` });
  if (!new RegExp(`^projects/${project}/rulesets/[a-f0-9-]+$`, 'i').test(release.rulesetName)) throw new Error('active-rules-unverified');
  const { data: rules } = await request({ url: `${rulesApi}/${release.rulesetName}` });
  const source = (rules.source?.files ?? []).map(file => file.content).join('\n').replace(/\/\/[^\r\n]*/g, '').replace(/\s+/g, ' ');
  // Keep the current separation from both legacy recursive grants and deny client writes.
  if (!/match \/users\/\{uid\}\/resourceUsage\/\{document=\*\*\} \{ allow read: if owner\(uid\); allow write: if false; \}/.test(source) ||
      !source.includes("collection != 'users'") || !source.includes("collection != 'resourceUsage'") ||
      !/function owner\(uid\) \{ return request\.auth != null && request\.auth\.uid == uid .*sign_in_provider != 'anonymous'; \}/.test(source)) {
    throw new Error('active-rules-unverified');
  }
  const response = await fetch(document, { signal: AbortSignal.timeout(8000) });
  await response.body?.cancel();
  if (response.status !== 403) throw new Error('signed-out-read-not-denied');
  return { outcome: 'privacy-verified', signedOutRead: response.status, rulesUpdatedAt: release.updateTime };
}

function appendHistory(next, previous) {
  const cutoff = next.collectedAt - hours;
  const prior = Array.isArray(previous?.history) ? previous.history : [];
  const times = new Map(prior.filter(point => Number.isSafeInteger(point?.at) && point.at >= cutoff && point.at < next.collectedAt)
    .map(point => [point.at, { at: point.at, cpuPercent: bounded(point.cpuPercent, 100), gpuPercent: bounded(point.gpuPercent, 100), memoryPercent: bounded(point.memoryPercent, 100) }]));
  const { cpuPercent, gpuPercent, memory } = next.workstation;
  times.set(next.collectedAt, { at: next.collectedAt, cpuPercent, gpuPercent, memoryPercent: memory ? Math.round(memory.usedBytes / memory.totalBytes * 100) : null });
  next.history = [...times.values()].sort((a, b) => a.at - b.at).slice(-13);
  const priorWorkers = Array.isArray(previous?.workers) ? previous.workers : [];
  for (const worker of next.workers) {
    if (worker.lastSeenAt === null) {
      const at = priorWorkers.find(entry => entry.id === worker.id)?.lastSeenAt;
      worker.lastSeenAt = bounded(at, next.collectedAt, 1);
    }
  }
}

async function publish(request) {
  const next = await sample();
  const previous = await readDocument(request);
  if (previous.snapshot?.collectedAt >= next.collectedAt) throw new Error('clock-not-advanced');
  appendHistory(next, previous.snapshot);
  // Precondition makes overlap or a retry safe without clearing a newer snapshot.
  const params = previous.updateTime ? { 'currentDocument.updateTime': previous.updateTime } : { 'currentDocument.exists': 'false' };
  const { data } = await request({ url: document, method: 'PATCH', params, data: { fields: encode(next).mapValue.fields } });
  return { outcome: 'published', collectedAt: next.collectedAt, serverUpdatedAt: data.updateTime, workerCount: next.workers.length, samples: next.history.length };
}

async function receipt(value) {
  const target = path.join(root, 'last-run.json');
  const temporary = `${target}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value)}\n`, { encoding: 'utf8' });
  await rename(temporary, target);
}

const command = process.argv[2];
try {
  let result;
  if (command === 'probe') result = await sample();
  else {
    const request = await cloudClient();
    if (command === 'preflight') result = await verifyPrivacy(request);
    else if (command === 'readback') result = (await readDocument(request)).snapshot;
    else if (command === 'publish') {
      result = await publish(request);
      await receipt(result);
    } else throw new Error('unknown-command');
  }
  console.log(JSON.stringify(result));
} catch (error) {
  const status = error.response?.status;
  const known = ['active-rules-unverified', 'signed-out-read-not-denied', 'clock-not-advanced', 'owner-user-adc-required', 'windows-required', 'unknown-command'];
  const code = Number.isInteger(status) ? `http-${status}` : known.includes(error.message) ? error.message : 'observation-unavailable';
  const result = { outcome: 'failed', code, at: Date.now() };
  if (command === 'publish') await receipt(result).catch(() => {});
  console.error(JSON.stringify(result));
  process.exitCode = 1;
}
