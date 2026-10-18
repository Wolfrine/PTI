/** Private process owner for the opt-in production-prepared capacity test only. */
import assert from 'node:assert/strict';
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {dedicatedEngineDescriptor} from '../src/media/runtime.mjs';
import {loadRuntimeSecret} from '../src/runtime/config.mjs';
import {command} from './media-real.mjs';

const PINNED='H:/PTI-OnePiece/pilot/jellyfin/runtime/jellyfin';
const ps=value=>"'"+String(value).replaceAll("'","''")+"'";
const inside=(child,parent)=>{const rel=path.win32.relative(path.win32.resolve(parent),path.win32.resolve(child));return rel&&!rel.startsWith('..')&&!path.win32.isAbsolute(rel);};
const canonical=value=>path.win32.resolve(value).toLowerCase();
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function within(promise,ms){let timer;try{return await Promise.race([promise,new Promise(resolve=>{timer=setTimeout(()=>resolve(null),ms);timer.unref();})]);}finally{clearTimeout(timer);}}

export function validateDurationHandoff(input){
 assert.equal(input.kind,'real-production-prepared-core-handoff');
 const handoff={...input,runtimeRoot:path.win32.dirname(input.descriptor.directories.config),executable:input.descriptor.executable,
  args:input.descriptor.args,managedRoots:input.descriptor.managedRoots,baseUrl:input.descriptor.baseUrl,
  port:Number(new URL(input.descriptor.baseUrl).port),extraAccountingRoots:input.accountingRoots};
 assert.ok(inside(handoff.runtimeRoot,'H:/PTI-OnePiece'));
 assert.ok(inside(handoff.protectedResumeConfigPath,handoff.runtimeRoot));
 assert.ok(inside(handoff.cacheRoot,'H:/PTI-OnePiece'));
 assert.ok(inside(handoff.cacheRoot,handoff.runRoot));
 assert.ok(Array.isArray(handoff.extraAccountingRoots)&&handoff.extraAccountingRoots.length>0&&handoff.extraAccountingRoots.length<=10);
 for(const root of handoff.extraAccountingRoots)assert.ok(inside(root,'H:/PTI-OnePiece'));
 assert.ok(Number.isInteger(handoff.port)&&handoff.port>=1024&&handoff.port<=65535);
 assert.ok(![8443,18096,18097,18098,18099,18100,18102,18106].includes(handoff.port),'Never claim an existing browser, pilot or managed-runtime port');
 assert.equal(handoff.baseUrl,`http://127.0.0.1:${handoff.port}`);
 assert.equal(canonical(handoff.executable),canonical(`${PINNED}/jellyfin.exe`));
 const descriptor=dedicatedEngineDescriptor({runtimeRoot:handoff.runtimeRoot,binaryDir:PINNED,port:handoff.port});
 assert.equal(handoff.args.length,descriptor.args.length);
 for(const[index,value]of descriptor.args.entries())assert.equal(value.startsWith('--')?handoff.args[index]:canonical(handoff.args[index]),value.startsWith('--')?value:canonical(value));
 assert.ok(handoff.managedRoots?.transcodes&&handoff.managedRoots?.subtitles);
 for(const root of Object.values(handoff.managedRoots))assert.ok(inside(root,handoff.runtimeRoot));
 return handoff;
}

export function authorizeOwnedEngineIntent(intent='duration',environment=process.env){
 assert.ok(['duration','cast'].includes(intent),'Known explicit hardware/test intent required');
 assert.equal(environment[intent==='cast'?'PTI_RUN_REAL_CAST':'PTI_RUN_REAL_DURATION'],'1','Explicit matching test opt-in required');
}

export async function ownDurationEngine(handoffPath,{intent='duration'}={}){
 authorizeOwnedEngineIntent(intent);
 const handoff=validateDurationHandoff(JSON.parse(await readFile(handoffPath,'utf8')));
 const cfg=JSON.parse(await readFile(handoff.protectedResumeConfigPath,'utf8'));
 assert.equal(canonical(cfg.runRoot),canonical(handoff.runRoot));
 assert.equal(canonical(cfg.cacheRoot),canonical(handoff.cacheRoot));
 assert.deepEqual(cfg.descriptor.args,handoff.args);
 let token=await loadRuntimeSecret(cfg,'jellyfinToken');assert.ok(token&&token.length<=4096);
 const free=createServer();await new Promise((resolve,reject)=>{free.once('error',reject);free.listen(handoff.port,'127.0.0.1',resolve);});await new Promise(resolve=>free.close(resolve));
 const log=createWriteStream(path.join(handoff.runtimeRoot,'logs',`duration-${Date.now()}.log`),{flags:'wx'});
 const child=spawn(handoff.executable,handoff.args,{windowsHide:true,shell:false,cwd:PINNED,stdio:['ignore','pipe','pipe']});child.stdout.pipe(log,{end:false});child.stderr.pipe(log,{end:false});
 const exited=new Promise(resolve=>{child.once('error',()=>resolve({spawnFailed:true}));child.once('close',(code,signal)=>{log.end();resolve({code,signal});});});
 const evidence={port:handoff.port,runtimeKind:'separately owned production-prepared engine',pid:child.pid,cleanup:{}};
 const proof=async()=>{
  assert.ok(Number.isInteger(child.pid)&&child.pid>0);
  const script=`$p=Get-CimInstance Win32_Process -Filter 'ProcessId=${child.pid}'; $l=@(Get-NetTCPConnection -State Listen -LocalPort ${handoff.port} -ErrorAction SilentlyContinue); $c=@(Get-CimInstance Win32_Process|Where-Object{$_.ParentProcessId -in @(${child.pid},${process.pid}) -and $_.Name -in @('ffmpeg.exe','ffprobe.exe')}); [pscustomobject]@{identity=[bool]($p -and $p.ExecutablePath -eq ${ps(path.resolve(handoff.executable))} -and $p.CommandLine.Contains(${ps(path.resolve(handoff.runtimeRoot))}));onlyLoopback=[bool]($l.Count -gt 0 -and @($l|Where-Object{$_.LocalAddress -ne '127.0.0.1' -or $_.OwningProcess -ne ${child.pid}}).Count -eq 0);noOwnedProcess=[bool](-not $p);noListener=[bool]($l.Count -eq 0);noMediaChildren=[bool]($c.Count -eq 0)}|ConvertTo-Json -Compress`;
  const result=await command('pwsh',['-NoProfile','-Command',script],15000);assert.equal(result.code,0,'Owned engine proof failed');return JSON.parse(result.out.trim());
 };
 return{handoff,evidence,tokenProvider:async()=>token,
  async ready(client){const until=Date.now()+60000;let info;while(Date.now()<until){try{info=await client.request('/System/Info/Public',{timeoutMs:3000});if(info?.Version)break;}catch{}await delay(500);}assert.ok(info?.Version);const current=await proof();assert.ok(current.identity&&current.onlyLoopback);evidence.started=current;return info;},
  async shutdown(client){
   const current=await proof();
   if(current.identity&&current.onlyLoopback){try{await client.request('/System/Shutdown',{method:'POST',timeoutMs:5000});evidence.cleanup.shutdownRequested=true;}catch{evidence.cleanup.shutdownRequested=false;}}
   let result=await within(exited,15000);
   if(!result){assert.ok((await proof()).identity,'Refuse to kill an unproven engine');child.kill();result=await within(exited,10000);evidence.cleanup.forcedOwnedTermination=true;}
   evidence.cleanup.exit=result;evidence.cleanup.proof=await proof();token=null;
   assert.ok(evidence.cleanup.proof.noOwnedProcess&&evidence.cleanup.proof.noListener&&evidence.cleanup.proof.noMediaChildren,'Owned engine did not stop completely');
  }
 };
}
