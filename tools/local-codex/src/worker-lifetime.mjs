import {spawnSync} from 'node:child_process';

export function processStartedAt(pid) {
  if (!Number.isInteger(pid) || pid < 1 || process.platform !== 'win32') return null;
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().ToString('o')`],
  {encoding:'utf8',windowsHide:true,timeout:5000});
  const started = result.status === 0 ? Date.parse(result.stdout.trim()) : NaN;
  return Number.isFinite(started) ? started : null;
}

// A terminal job can retain its PID after Windows assigns that number to an
// unrelated process. Only a strictly later process birth proves that reuse.
// Unknown metadata retains the existing exit guard; it never authorizes a kill.
export function previousWorkerStillExiting(job, isAlive, startedAt = processStartedAt) {
  if (!isAlive(job.workerPid)) return false;
  const finished = Date.parse(job.updatedAt), started = startedAt(job.workerPid);
  return !(Number.isFinite(finished) && Number.isFinite(started) && started > finished);
}
