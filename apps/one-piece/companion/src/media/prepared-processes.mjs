import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, lstat, readdir, rm } from 'node:fs/promises';
import { MediaError } from './errors.mjs';

const UUID = '[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}';
const MARKER = new RegExp(`^(${UUID})\\.(?:progressive|video|captions)\\.part(?:\\.mp4)?$`);
const RECORD = new RegExp(`^${UUID}\\.tool\\.json$`);
const problem = () => new MediaError('PREPARED_PROCESS_IDENTITY', 'Prepared processing ownership could not be verified; preserve its files and retry recovery', { status: 503 });

export function validatePreparedToolRecord(record, { workRoot, executablePaths }) {
  const marker = typeof record?.marker === 'string' ? path.resolve(record.marker) : '', match = MARKER.exec(path.basename(marker));
  if (record?.version !== 1 || !Number.isSafeInteger(record.parentPid) || record.parentPid < 1
    || record.pid !== null && (!Number.isSafeInteger(record.pid) || record.pid < 1)
    || !Number.isFinite(Date.parse(record.intentAt)) || !Number.isFinite(Date.parse(record.parentStartedAt))
    || record.spawnedAt !== undefined && !Number.isFinite(Date.parse(record.spawnedAt))
    || !executablePaths.map(file => path.resolve(file)).includes(path.resolve(record.executable ?? ''))
    || path.dirname(marker) !== path.resolve(workRoot) || !match || match[1] !== record.token) throw problem();
  return record;
}

// Constant script; only a closed local record travels on stdin. No command strings,
// media URLs or credentials enter process arguments, output or error diagnostics.
const RECOVER = String.raw`
$ErrorActionPreference='Stop'
try {
 $request=[Console]::In.ReadToEnd()|ConvertFrom-Json
 $all=@(Get-CimInstance Win32_Process)
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $verified=@()
 foreach($entry in $request.records){
  $parent=$all|Where-Object ProcessId -eq ([int]$entry.parentPid)
  $ownerStart=[DateTimeOffset]::Parse($entry.parentStartedAt).UtcDateTime
  # Also protect the intent-before-spawn interval, when no child PID exists yet.
  if($parent -and [Math]::Abs(($parent.CreationDate.ToUniversalTime()-$ownerStart).TotalSeconds) -le 2){throw 'owner-still-active'}
  $needle=[regex]::Escape(([string]$entry.marker).Replace('/','\'))
  $pattern='(?i)(?:^|\s|")'+$needle+'(?:$|\s|")'
  if($null -ne $entry.pid){$candidates=@($all|Where-Object ProcessId -eq ([int]$entry.pid))}
  else{$candidates=@($all|Where-Object {$_.ParentProcessId -eq [int]$entry.parentPid -and $_.ExecutablePath -and [IO.Path]::GetFullPath($_.ExecutablePath) -eq [IO.Path]::GetFullPath($entry.executable) -and [regex]::IsMatch($_.CommandLine.Replace('/','\'),$pattern)})}
  if($candidates.Count -gt 1){throw 'ambiguous'}
  foreach($candidate in $candidates){
   if($candidate.ParentProcessId -ne [int]$entry.parentPid -or [IO.Path]::GetFullPath($candidate.ExecutablePath) -ne [IO.Path]::GetFullPath($entry.executable) -or -not [regex]::IsMatch($candidate.CommandLine.Replace('/','\'),$pattern)){throw 'identity'}
   $created=$candidate.CreationDate.ToUniversalTime();$stamp=$entry.intentAt;$tolerance=600
   if($null -ne $entry.pid -and $entry.spawnedAt){$stamp=$entry.spawnedAt;$tolerance=10}
   $intent=[DateTimeOffset]::Parse($stamp).UtcDateTime
   if(($created-$intent).TotalSeconds -lt -2 -or ($created-$intent).TotalSeconds -gt $tolerance){throw 'creation'}
   $owner=Invoke-CimMethod -InputObject $candidate -MethodName GetOwnerSid
   if($owner.ReturnValue -ne 0 -or $owner.Sid -ne $sid){throw 'owner'}
   $parent=$all|Where-Object ProcessId -eq ([int]$entry.parentPid)
   # A still-live original backend may be serving another viewer. Never stop its tool.
   # A reused parent PID created after this child does not resurrect that old backend.
   if($parent -and $parent.CreationDate.ToUniversalTime() -le $created){throw 'owner-still-active'}
   $verified+=$candidate
  }
 }
 if($verified.Count -gt 8){throw 'bound'}
 foreach($candidate in $verified){
  $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$candidate.ProcessId)
  if($live -and ($live.CreationDate -ne $candidate.CreationDate -or $live.ParentProcessId -ne $candidate.ParentProcessId -or $live.ExecutablePath -ne $candidate.ExecutablePath -or $live.CommandLine -ne $candidate.CommandLine)){throw 'pid-reused'}
  if($live){Stop-Process -Id $live.ProcessId -Force -ErrorAction Stop}
 }
 foreach($candidate in $verified){for($i=0;$i -lt 25 -and (Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue);$i++){Start-Sleep -Milliseconds 100};if(Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue){throw 'stop-unconfirmed'}}
 [Console]::Out.Write((@{verified=$true;stopped=$verified.Count}|ConvertTo-Json -Compress))
}catch{[Console]::Error.Write('prepared-owned-process-recovery-failed');exit 1}
`;

async function recoverWindows(records) {
  if (process.platform !== 'win32') throw problem();
  return new Promise((resolve, reject) => {
    const child = spawn(path.win32.join(process.env.SystemRoot ?? 'C:/Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe'),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(RECOVER, 'utf16le').toString('base64')],
      { windowsHide: true, shell: false, stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '', settled = false;
    const finish = (error, result) => { if (settled) return; settled = true; clearTimeout(timer); error ? reject(error) : resolve(result); };
    const timer = setTimeout(() => { child.kill(); finish(problem()); }, 15000);
    child.stdout.on('data', part => { output += part; if (output.length > 8192) { child.kill(); finish(problem()); } }); child.stderr.resume();
    child.on('error', () => finish(problem())); child.stdin.on('error', () => finish(problem()));
    child.on('close', code => { try { const result = JSON.parse(output); if (code !== 0 || result.verified !== true) throw problem(); finish(null, result); } catch { finish(problem()); } });
    child.stdin.end(JSON.stringify({ records }));
  });
}

/** Intent is durable BEFORE spawn, closing the hard-kill-before-PID-write gap. */
export class PreparedToolRegistry {
  constructor({ workRoot, ffmpegPath, ffprobePath, recover = recoverWindows } = {}) {
    this.workRoot = path.resolve(workRoot); this.root = path.join(this.workRoot, 'ownership');
    this.executablePaths = [ffmpegPath, ffprobePath].map(file => path.resolve(file)); this.recoverOperation = recover;
  }
  async checkRoot(create = false) {
    if (create) await mkdir(this.root, { recursive: true });
    for (const dir of [this.workRoot, this.root]) { const stats = await lstat(dir).catch(error => error.code === 'ENOENT' ? null : Promise.reject(error));
      if (stats && (!stats.isDirectory() || stats.isSymbolicLink())) throw problem(); }
  }
  async begin(executable, args) {
    await this.checkRoot(true);
    if (!Array.isArray(args) || args.length > 128 || args.some(value => typeof value !== 'string' || value.length > 4096 || /https?:\/\/|[\x00-\x1f]/i.test(value))) throw problem();
    const marker = args.find(value => path.isAbsolute(value) && path.dirname(path.resolve(value)) === this.workRoot && MARKER.test(path.basename(value)));
    const record = validatePreparedToolRecord({ version: 1, executable: path.resolve(executable), marker, token: marker && MARKER.exec(path.basename(marker))[1],
      parentPid: process.pid, parentStartedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(), pid: null, intentAt: new Date().toISOString() }, this);
    const file = path.join(this.root, `${randomUUID()}.tool.json`), temporary = file + '.tmp';
    await writeFile(temporary, JSON.stringify(record), { flag: 'wx' }); await rename(temporary, file); return { file, record };
  }
  async started(intent, pid) {
    validatePreparedToolRecord({ ...intent.record, pid }, this); intent.record.pid = pid; intent.record.spawnedAt = new Date().toISOString();
    const temporary = intent.file + '.tmp'; await writeFile(temporary, JSON.stringify(intent.record), { flag: 'wx' }); await rename(temporary, intent.file);
  }
  async complete(intent) { if (intent) await rm(intent.file, { force: true }); }
  async recover() {
    await this.checkRoot(); const files = await readdir(this.root).catch(error => error.code === 'ENOENT' ? [] : Promise.reject(error));
    const records = [], admitted = []; if (files.length > 64) throw problem();
    for (const name of files) if (RECORD.test(name)) {
      const file = path.join(this.root, name), stats = await lstat(file); if (!stats.isFile() || stats.isSymbolicLink() || stats.size > 8192) throw problem();
      const record = validatePreparedToolRecord(JSON.parse(await readFile(file, 'utf8')), this); records.push(record); admitted.push(file);
    }
    const result = records.length ? await this.recoverOperation(records) : { verified: true, stopped: 0 }; if (result?.verified !== true) throw problem();
    for (const file of admitted) await rm(file);
    for (const name of files) if (name.endsWith('.tmp') && RECORD.test(name.slice(0, -4))) { const file = path.join(this.root, name), stats = await lstat(file); if (!stats.isFile() || stats.isSymbolicLink()) throw problem(); await rm(file); }
    return result;
  }
}
