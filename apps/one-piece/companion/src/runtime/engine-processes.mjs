import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const SCRIPT=String.raw`
$ErrorActionPreference='Stop'
try {
  $request=[Console]::In.ReadToEnd()|ConvertFrom-Json
  $processes=@(Get-CimInstance Win32_Process)
  $engine=$processes|Where-Object ProcessId -eq ([int]$request.pid)
  if(-not $engine){[Console]::Out.Write('{"stopped":true,"children":0,"engineAbsent":true}');exit 0}
  if([IO.Path]::GetFullPath($engine.ExecutablePath) -ne [IO.Path]::GetFullPath($request.executable)){throw 'identity'}
  $supervisor=$processes|Where-Object ProcessId -eq ([int]$request.supervisorPid)
  if(-not $supervisor -or $engine.ParentProcessId -ne $supervisor.ProcessId){throw 'parent-identity'}
  if([IO.Path]::GetFullPath($supervisor.ExecutablePath) -ne [IO.Path]::GetFullPath($request.nodeExecutable)){throw 'supervisor-executable'}
  $normalizedCommand=$supervisor.CommandLine.Replace('/','\')
  if($normalizedCommand.IndexOf($request.supervisorEntry.Replace('/','\'),[StringComparison]::OrdinalIgnoreCase) -lt 0 -or $normalizedCommand.IndexOf($request.configPath.Replace('/','\'),[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'supervisor-command'}
  $descendants=@();$parents=@([int]$engine.ProcessId)
  while($parents.Count){$next=@($processes|Where-Object {$_.ParentProcessId -in $parents});$descendants+=$next;$parents=@($next|ForEach-Object {[int]$_.ProcessId})}
  $allowed=@([IO.Path]::GetFullPath($request.ffmpeg),[IO.Path]::GetFullPath($request.ffprobe))
  $consoleHost=[IO.Path]::GetFullPath((Join-Path $env:SystemRoot 'System32\conhost.exe'))
  foreach($child in $descendants){if([IO.Path]::GetFullPath($child.ExecutablePath) -notin $allowed -and [IO.Path]::GetFullPath($child.ExecutablePath) -ne $consoleHost){throw 'unexpected-descendant'}}
  $encoders=@($descendants|Where-Object {[IO.Path]::GetFullPath($_.ExecutablePath) -in $allowed})
  foreach($child in $encoders){Stop-Process -Id $child.ProcessId -Force -ErrorAction Stop}
  foreach($child in $encoders){if(Get-Process -Id $child.ProcessId -ErrorAction SilentlyContinue){throw 'still-running'}}
  [Console]::Out.Write((@{stopped=$true;children=$encoders.Count;consoleHelpers=($descendants.Count-$encoders.Count)}|ConvertTo-Json -Compress))
}catch{[Console]::Error.Write('verified-engine-stop-failed');exit 1}
`;
export async function stopVerifiedEngineChildren(config,{enginePid,supervisorPid}={}){
  if(!enginePid||!supervisorPid){const state=JSON.parse(await readFile(config.statePath,'utf8'));enginePid??=state.processes?.jellyfin?.pid;supervisorPid??=state.supervisorPid;}
  if(!Number.isSafeInteger(enginePid)||enginePid<1||!Number.isSafeInteger(supervisorPid)||supervisorPid<1)throw new Error('runtime-engine-identity');
  const binaryDir=config.jellyfin.binaryDir;
  const input=JSON.stringify({pid:enginePid,supervisorPid,nodeExecutable:config.nodeExecutable,supervisorEntry:path.join(path.dirname(fileURLToPath(import.meta.url)),'supervisor.mjs'),configPath:config.configPath,executable:path.join(binaryDir,'jellyfin.exe'),ffmpeg:path.join(binaryDir,'ffmpeg.exe'),ffprobe:path.join(binaryDir,'ffprobe.exe')});
  return new Promise((resolve,reject)=>{
    const child=spawn(path.win32.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SCRIPT,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('runtime-engine-stop-timeout'));},15000);
    child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(output.length>8192)child.kill();});child.stderr.on('data',()=>{});child.on('error',()=>{clearTimeout(timer);reject(new Error('runtime-engine-stop-failed'));});child.on('close',code=>{clearTimeout(timer);try{if(code!==0)throw new Error();const result=JSON.parse(output);if(result.stopped!==true)throw new Error();resolve(result);}catch{reject(new Error('runtime-engine-stop-failed'));}});child.stdin.end(input);
  });
}
export const stopOwnedEngineChildren=config=>stopVerifiedEngineChildren(config);
