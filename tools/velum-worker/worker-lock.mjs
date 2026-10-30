import {execFileSync} from 'node:child_process';
import {readFile,open,unlink,stat} from 'node:fs/promises';
export function lockMatches(lock,info){
 return Boolean(info?.worker && (typeof lock==='number'||lock.createdAt===info.createdAt));
}
function processInfo(pid,script){
 if(!Number.isInteger(pid)||pid<1)return null;
 const quoted=script.replaceAll("'","''");
 const command=`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${pid}'; if($p){[pscustomobject]@{createdAt=$p.CreationDate.ToUniversalTime().Ticks.ToString();worker=($p.Name -eq 'node.exe' -and $p.CommandLine -and $p.CommandLine.IndexOf('${quoted}',[StringComparison]::OrdinalIgnoreCase) -ge 0)} | ConvertTo-Json -Compress}`;
 const value=execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true,timeout:15000}).trim();
 return value?JSON.parse(value):null;
}
export async function acquireWorkerLock(file,script){
 // The GUI host's named mutex serializes normal starts. This additional guard
 // handles direct invocation and recovers a stale PID without killing anything.
 try{const old=JSON.parse(await readFile(file,'utf8')),pid=typeof old==='number'?old:old.pid;
  if(lockMatches(old,processInfo(pid,script)))throw new Error('worker-already-running');await unlink(file);
 }catch(error){
  if(error instanceof SyntaxError){
   // A crash between exclusive creation and write can leave an empty record.
   // Give a live creator time to finish; the native mutex serializes recovery.
   if(Date.now()-(await stat(file)).mtimeMs<30000)throw new Error('worker-lock-initializing');
   await unlink(file);
  }else if(error.code!=='ENOENT')throw error;
 }
 const identity=processInfo(process.pid,script);if(!identity?.worker)throw new Error('worker-process-unverified');
 const lock=await open(file,'wx');await lock.writeFile(JSON.stringify({pid:process.pid,createdAt:identity.createdAt}));return lock;
}
