import {readFile,writeFile,mkdir,lstat} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {loadRuntimeConfig,loadRuntimeSecret} from '../src/runtime/config.mjs';
if(!process.argv.includes('--allow-unpaired-restart'))throw new Error('Explicit unpaired restart diagnostic flag required');
const config=await loadRuntimeConfig('H:/PTI-OnePiece/runtime/private/config.json');
try{await lstat(config.ownerBindingPath);throw new Error('Refusing to interrupt a paired household runtime');}catch(error){if(error.code!=='ENOENT')throw error;}
const before=JSON.parse(await readFile(config.statePath,'utf8'));
const request={pid:before.processes.backend.pid,supervisorPid:before.supervisorPid,nodeExecutable:config.nodeExecutable,serverEntry:config.serverEntry};
const SCRIPT=String.raw`$ErrorActionPreference='Stop';try{$r=[Console]::In.ReadToEnd()|ConvertFrom-Json;$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$r.pid);$s=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$r.supervisorPid);if(-not $s -or $p.ParentProcessId -ne $s.ProcessId -or $p.ExecutablePath -ne $r.nodeExecutable -or $p.CommandLine.IndexOf($r.serverEntry,[StringComparison]::OrdinalIgnoreCase) -lt 0){throw 'identity'};Stop-Process -Id $p.ProcessId -Force;[Console]::Out.Write('verified-backend-stopped')}catch{exit 1}`;
await new Promise((resolve,reject)=>{
 const child=spawn(path.win32.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SCRIPT,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();child.once('error',()=>reject(new Error('diagnostic-process')));child.once('close',code=>code===0?resolve():reject(new Error('diagnostic-identity')));child.stdin.end(JSON.stringify(request));
});
const started=Date.now(),proxySecret=await loadRuntimeSecret(config,'proxySecret');let after,recovered=false;
while(Date.now()-started<40000){
 await new Promise(resolve=>setTimeout(resolve,500));after=JSON.parse(await readFile(config.statePath,'utf8'));
 if(after.processes.backend.pid===before.processes.backend.pid||after.processes.jellyfin.pid===before.processes.jellyfin.pid||after.processes.backend.state!=='ready')continue;
 try{const response=await fetch('http://127.0.0.1:18098/api/health',{headers:{Origin:'https://pti-app-2ab59.web.app','X-OnePiece-Proxy':proxySecret,'X-Forwarded-Proto':'https'},signal:AbortSignal.timeout(2000)});await response.body?.cancel();if(response.ok){recovered=true;break;}}catch{}
}
const proof={recordedAt:new Date().toISOString(),test:'real unpaired backend crash and supervised core recovery',recovered,elapsedMilliseconds:Date.now()-started,supervisorUnchanged:after.supervisorPid===before.supervisorPid,before:{backendPid:before.processes.backend.pid,jellyfinPid:before.processes.jellyfin.pid},after:{backendPid:after.processes.backend.pid,jellyfinPid:after.processes.jellyfin.pid},caddyUnchanged:after.processes.caddy.pid===before.processes.caddy.pid,mdnsUnchanged:after.processes.mdns.pid===before.processes.mdns.pid,mediaOrTvSessionStarted:false};
const index=process.argv.indexOf('--evidence');if(index>=0){const file=path.resolve(process.argv[index+1]);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(proof,null,2)+'\n');}
console.log(JSON.stringify(proof));if(!recovered)process.exitCode=1;
