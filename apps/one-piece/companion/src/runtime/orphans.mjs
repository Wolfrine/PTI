import {spawn} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {atomicJson} from '../progress.mjs';
const SCRIPT=String.raw`
$ErrorActionPreference='Stop'
try{
 $request=[Console]::In.ReadToEnd()|ConvertFrom-Json
 $all=@(Get-CimInstance Win32_Process)
 if($all|Where-Object ProcessId -eq ([int]$request.supervisorPid)){throw 'supervisor-not-absent'}
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $verified=@();$descendants=@()
 foreach($entry in $request.processes){
  $candidate=$all|Where-Object ProcessId -eq ([int]$entry.pid)
  if(-not $candidate){continue}
  if($candidate.ParentProcessId -ne [int]$request.supervisorPid -or [IO.Path]::GetFullPath($candidate.ExecutablePath) -ne [IO.Path]::GetFullPath($entry.executable)){throw 'orphan-identity'}
  $expected=[DateTimeOffset]::Parse($entry.startedAt).UtcDateTime
  if([Math]::Abs(($candidate.CreationDate.ToUniversalTime()-$expected).TotalSeconds) -gt 5){throw 'orphan-creation'}
  $owner=Invoke-CimMethod -InputObject $candidate -MethodName GetOwnerSid
  if($owner.ReturnValue -ne 0 -or $owner.Sid -ne $sid){throw 'orphan-owner'}
  foreach($fragment in $entry.commandFragments){if($candidate.CommandLine.Replace('/','\').IndexOf($fragment.Replace('/','\'),[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'orphan-command'}}
  $verified+=$candidate
  $parents=@([int]$candidate.ProcessId)
  while($parents.Count){$next=@($all|Where-Object {$_.ParentProcessId -in $parents});$descendants+=$next;$parents=@($next|ForEach-Object {[int]$_.ProcessId})}
 }
 $allowed=@($request.ffmpeg,$request.ffprobe,(Join-Path $env:SystemRoot 'System32\conhost.exe'))|ForEach-Object {[IO.Path]::GetFullPath($_)}
 foreach($child in $descendants){
  $file=[IO.Path]::GetFullPath($child.ExecutablePath)
  $castChild=$file -eq [IO.Path]::GetFullPath($request.pythonExecutable) -and $child.CommandLine.IndexOf($request.castEntry,[StringComparison]::OrdinalIgnoreCase) -ge 0
  if($file -notin $allowed -and -not $castChild){throw 'unexpected-orphan-descendant'}
  $owner=Invoke-CimMethod -InputObject $child -MethodName GetOwnerSid
  if($owner.ReturnValue -ne 0 -or $owner.Sid -ne $sid){throw 'descendant-owner'}
 }
 foreach($candidate in @($descendants)+@($verified)){
  # Verify creation again immediately before stopping, preventing PID-reuse deletion.
  $live=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$candidate.ProcessId)
  if($live -and $live.CreationDate -ne $candidate.CreationDate){throw 'pid-reused'}
  if($live){Stop-Process -Id $live.ProcessId -Force -ErrorAction Stop}
 }
 foreach($candidate in @($descendants)+@($verified)){if(Get-Process -Id $candidate.ProcessId -ErrorAction SilentlyContinue){throw 'orphan-stop-unconfirmed'}}
 [ordered]@{verified=$true;stoppedProcesses=$verified.Count;stoppedDescendants=$descendants.Count;supervisorAbsent=$true}|ConvertTo-Json -Compress
}catch{[ordered]@{verified=$false;reason='orphan-verification-or-stop-failed'}|ConvertTo-Json -Compress;exit 1}
`;
export async function reapOwnedOrphans(config){
 const state=JSON.parse(await readFile(config.statePath,'utf8'));if(!Number.isInteger(state.supervisorPid)||state.supervisorPid<1)throw new Error('runtime-orphan-state');
 const src=path.dirname(config.serverEntry),bin=config.jellyfin.binaryDir;
 const definitions={backend:{executable:config.nodeExecutable,commandFragments:[config.serverEntry,config.configPath]},jellyfin:{executable:path.join(bin,'jellyfin.exe'),commandFragments:[config.jellyfin.runtimeRoot]},caddy:{executable:config.caddy.executable,commandFragments:[config.caddy.configurationPath]},mdns:{executable:config.pythonExecutable,commandFragments:[path.join(src,'runtime/mdns.py'),config.configPath]}};
 const processes=Object.entries(state.processes).filter(([name,entry])=>definitions[name]&&Number.isInteger(entry.pid)).map(([name,entry])=>({pid:entry.pid,startedAt:entry.startedAt,...definitions[name]}));
 if(processes.length>4)throw new Error('runtime-orphan-state');
 const request={supervisorPid:state.supervisorPid,processes,ffmpeg:path.join(bin,'ffmpeg.exe'),ffprobe:path.join(bin,'ffprobe.exe'),pythonExecutable:config.pythonExecutable,castEntry:path.join(src,'cast-bridge.py')};
 const result=await new Promise((resolve,reject)=>{
  const child=spawn(path.win32.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SCRIPT,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('runtime-orphan-timeout'));},15000);child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{output+=chunk;if(output.length>16000)child.kill();});child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(new Error('runtime-orphan-cleanup'));});child.on('close',code=>{clearTimeout(timer);try{const value=JSON.parse(output);if(code!==0||value.verified!==true)throw new Error();resolve(value);}catch{reject(new Error('runtime-orphan-cleanup'));}});child.stdin.end(JSON.stringify(request));
 });
 await atomicJson(path.join(config.privateRoot,'orphan-recovery-proof.json'),{recordedAt:new Date().toISOString(),...result});return result;
}
