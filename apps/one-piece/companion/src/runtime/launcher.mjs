// Stable H-drive logon entrypoint; supervisor exit0 means intentional shutdown.
import {readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
const configPath='H:/PTI-OnePiece/runtime/private/config.json';
const proofPath='H:/PTI-OnePiece/runtime/private/launcher-state.json';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let failures=0;
for(;;){
 let config,entry,started=Date.now(),pid;
 try{
  config=JSON.parse(await readFile(configPath,'utf8'));
  if(path.win32.normalize(config.nodeExecutable)!==path.win32.normalize('H:/PTI-OnePiece/tools/node/node.exe')||!path.win32.isAbsolute(config.serverEntry)||!config.serverEntry.replaceAll('\\','/').endsWith('/apps/one-piece/companion/src/server.mjs'))throw new Error();
  entry=path.join(path.dirname(config.serverEntry),'runtime/supervisor.mjs');
  const code=await new Promise(resolve=>{
   const child=spawn(config.nodeExecutable,[entry,'--config',configPath],{cwd:config.repositoryRoot,windowsHide:true,stdio:'ignore'});pid=child.pid;
   child.once('error',()=>resolve(1));child.once('exit',code=>resolve(Number.isInteger(code)?code:1));
  });
  if(code===0){process.exitCode=0;break;}
  const {loadRuntimeConfig}=await import(pathToFileURL(path.join(path.dirname(entry),'config.mjs')).href);
  const {reapOwnedOrphans}=await import(pathToFileURL(path.join(path.dirname(entry),'orphans.mjs')).href);
  await reapOwnedOrphans(await loadRuntimeConfig(configPath));
  failures=Date.now()-started>60000?1:failures+1;
  await writeFile(proofPath,JSON.stringify({recordedAt:new Date().toISOString(),launcherPid:process.pid,unexpectedSupervisorPid:pid,orphanCleanupVerified:true,restartAttempt:failures,delayMilliseconds:Math.min(30000,1000*2**Math.min(5,failures-1))}));
 }catch{
  failures++;
  await writeFile(proofPath,JSON.stringify({recordedAt:new Date().toISOString(),launcherPid:process.pid,unexpectedSupervisorPid:pid??null,restartAttempt:failures,failure:'guarded-recovery-unavailable'})).catch(()=>{});
 }
 await wait(Math.min(30000,1000*2**Math.min(5,Math.max(0,failures-1))));
}
