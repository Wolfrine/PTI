import {readFile,lstat,writeFile,mkdir} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {loadRuntimeConfig,loadRuntimeSecrets} from '../src/runtime/config.mjs';
if(!process.argv.includes('--allow-unpaired-restart'))throw new Error('Explicit unpaired restart flag required');
const config=await loadRuntimeConfig('H:/PTI-OnePiece/runtime/private/config.json');
try{await lstat(config.ownerBindingPath);throw new Error('Refusing paired-runtime crash');}catch(error){if(error.code!=='ENOENT')throw error;}
const before=JSON.parse(await readFile(config.statePath,'utf8'));if(!Object.values(before.health).filter(x=>typeof x==='boolean').every(Boolean)||Object.keys(before.processes).length!==4)throw new Error('Runtime must be healthy');
const SCRIPT=String.raw`$ErrorActionPreference='Stop';try{$r=[Console]::In.ReadToEnd()|ConvertFrom-Json;$p=Get-CimInstance Win32_Process -Filter ('ProcessId='+[int]$r.pid);$owner=Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid;if(-not $p -or $owner.Sid -ne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value -or $p.ExecutablePath -ne $r.nodeExecutable -or $p.CommandLine.Replace('/','\').IndexOf($r.entry.Replace('/','\'),[StringComparison]::OrdinalIgnoreCase) -lt 0 -or [Math]::Abs(($p.CreationDate.ToUniversalTime()-[DateTimeOffset]::Parse($r.startedAt).UtcDateTime).TotalSeconds) -gt 5){throw 'identity'};Stop-Process -Id $p.ProcessId -Force;[Console]::Out.Write('verified-supervisor-stopped')}catch{exit 1}`;
await new Promise((resolve,reject)=>{
 const child=spawn(path.win32.join(process.env.SystemRoot??'C:/Windows','System32/WindowsPowerShell/v1.0/powershell.exe'),['-NoLogo','-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(SCRIPT,'utf16le').toString('base64')],{windowsHide:true,stdio:['pipe','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();child.on('error',()=>reject(new Error('supervisor-test-process')));child.on('close',code=>code===0?resolve():reject(new Error('supervisor-test-identity')));child.stdin.end(JSON.stringify({pid:before.supervisorPid,nodeExecutable:config.nodeExecutable,entry:path.join(path.dirname(config.serverEntry),'runtime/supervisor.mjs'),startedAt:before.startedAt}));
});
const started=Date.now();console.log(JSON.stringify({test:'fatal-supervisor',startedAt:new Date(started).toISOString(),killedVerifiedSupervisorPid:before.supervisorPid}));
let after,recovered=false;
while(Date.now()-started<95000){
 await new Promise(resolve=>setTimeout(resolve,1000));after=JSON.parse(await readFile(config.statePath,'utf8'));
 if(after.supervisorPid===before.supervisorPid||!after.health||!['jellyfin','backend','mdns','caddy'].every(name=>after.health[name]===true))continue;
 const secrets=await loadRuntimeSecrets(config);
 try{const response=await fetch('http://127.0.0.1:18098/api/health',{headers:{Origin:'https://pti-app-2ab59.web.app','X-OnePiece-Proxy':secrets.proxySecret,'X-Forwarded-Proto':'https'},signal:AbortSignal.timeout(3000)});await response.body?.cancel();if(response.ok){recovered=true;break;}}catch{}
}
let orphan;try{orphan=JSON.parse(await readFile(path.join(config.privateRoot,'orphan-recovery-proof.json'),'utf8'));}catch{}
const proof={recordedAt:new Date().toISOString(),test:'actual unpaired fatal-supervisor crash; persistent H launcher restart plus guarded orphan cleanup',recovered,elapsedMilliseconds:Date.now()-started,previousSupervisorPid:before.supervisorPid,currentSupervisorPid:after.supervisorPid,allChildrenReplaced:['jellyfin','backend','mdns','caddy'].every(name=>before.processes[name].pid!==after.processes[name].pid),health:after.health,dpapiSecretsLoadedAfterRecovery:recovered,orphanCleanup:orphan??null,mediaOrTvSessionStarted:false,rebootTest:false};
const index=process.argv.indexOf('--evidence');if(index>=0){const file=path.resolve(process.argv[index+1]);await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(proof,null,2)+'\n');}console.log(JSON.stringify(proof));if(!recovered)process.exitCode=1;
