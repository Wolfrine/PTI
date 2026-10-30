import {mkdir,open,readFile,writeFile,unlink,stat} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomBytes} from 'node:crypto';
import {DeviceStore,restoreDevice,refreshSession,enrollment,secureDirectory,OWNER_UID,PROJECT} from './session.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
import {finishClaimed,retryDelay} from './lifecycle.mjs';
import {acquireWorkerLock} from './worker-lock.mjs';
import {WEIGHTS,runnable,encode,decode,imagePayload} from './core.mjs';
import {downloadReferences,thumbnailPayload} from './reference-input.mjs';
import {ThumbnailBackfill} from './thumbnail-backfill.mjs';
import {pendingRecovery} from '../../velum-gallery/studio-recovery.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const STATE=path.join(HERE,'.runtime');
const DATA='H:\\AI-ImageGen\\portrait-pilot';
const PYTHON='F:\\Workspace\\Support\\tools\\local-image-gen\\venv\\Scripts\\python.exe';
const BASE=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ROOT=`users/${OWNER_UID}/velumStudio/workspace`;
const VERSION='2.2.0';
const EXPECTED_BYTES={
 'z_image_turbo_nvfp4.safetensors':4509509600,'flux-2-klein-4b-fp8.safetensors':4070624520,
 'RealVisXL_V5.0_fp16.safetensors':6938065488,'Realistic_Vision_V6.0_NV_B1_fp16.safetensors':2132625894,
 'qwen_3_4b_fp8_mixed.safetensors':5631994051,'ae.safetensors':335304388,
 'flux2-vae.safetensors':336211292,'vae-ft-mse-840000-ema-pruned.safetensors':334641190,
};
export class Queue {
 constructor(session,{store}={}){this.session=session;this.store=store;this.renewing=null;}
 async token(){
  if(this.session.expiresAt-Date.now()<300000){
   this.renewing??=(async()=>{
    const next=await refreshSession(this.session.refreshToken,this.session.uid);
    const saved={...this.session.saved,refreshToken:next.refreshToken};
    if(this.store)await this.store.save(saved);
    return {...next,saved};
   })().finally(()=>{this.renewing=null;});
   this.session=await this.renewing;
  }
  return this.session.idToken;
 }
 async request(relative,{method='GET',value,anonymous=false,allow=[]}={}){
  const response=await fetch(`${BASE}/${relative}`,{method,headers:{'Content-Type':'application/json',...(anonymous?{}:{Authorization:`Bearer ${await this.token()}`})},
   body:value===undefined?undefined:JSON.stringify(value),signal:AbortSignal.timeout(20000),redirect:'error'});
  if(!response.ok&&!allow.includes(response.status)){await response.body?.cancel();throw new Error(`firebase-${response.status}`);}
  const text=await response.text();return {status:response.status,value:text?JSON.parse(text):null};
 }
 async privacy(){
  const own=await this.request(`${ROOT}/devices/${this.session.uid}`,{allow:[404]});
  const anonymous=await this.request(`${ROOT}/status/pc`,{anonymous:true,allow:[403]});
  const other=await this.request('users/velum-isolation-probe/velumStudio/workspace/status/pc',{allow:[403]});
  const legacy=await this.request('velum-isolation-probe/absent',{allow:[403,404]});
  if(![200,404].includes(own.status)||anonymous.status!==403||other.status!==403||legacy.status!==403)throw new Error('private-rules-not-ready');
 }
 async write(relative,values,{updateTime,create=false}={}){
  const params=new URLSearchParams();
  if(updateTime)params.set('currentDocument.updateTime',updateTime);
  if(create)params.set('currentDocument.exists','false');
  if(!create)for(const key of Object.keys(values))params.append('updateMask.fieldPaths',key);
  return this.request(`${ROOT}/${relative}?${params}`,{method:'PATCH',value:{fields:encode(values).mapValue.fields}});
 }
 async jobs(status){
  const response=await this.request(`${ROOT}:runQuery`,{method:'POST',value:{structuredQuery:{from:[{collectionId:'jobs'}],where:{compositeFilter:{op:'AND',filters:[{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:encode(status)}},{fieldFilter:{field:{fieldPath:'deviceUid'},op:'EQUAL',value:encode(this.session.uid)}}]}},limit:20}}});
  return (response.value||[]).filter(item=>item.document).map(({document})=>({id:document.name.split('/').at(-1),updateTime:document.updateTime,job:decode({mapValue:{fields:document.fields}})})).sort((a,b)=>a.job.createdAt-b.job.createdAt);
 }
 async archivePage(cursor=''){
  const prefix=`projects/${PROJECT}/databases/(default)/documents/${ROOT}/jobs/`;
  if(cursor&&(!cursor.startsWith(prefix)||!/^[A-Za-z0-9_-]{1,80}$/.test(cursor.slice(prefix.length))))throw new Error('invalid-thumbnail-backfill');
  const response=await this.request(`${ROOT}:runQuery`,{method:'POST',value:{structuredQuery:{from:[{collectionId:'jobs'}],where:{fieldFilter:{field:{fieldPath:'deviceUid'},op:'EQUAL',value:encode(this.session.uid)}},orderBy:[{field:{fieldPath:'__name__'},direction:'ASCENDING'}],limit:24,...(cursor?{startAt:{values:[{referenceValue:cursor}],before:false}}:{})}}});
  const documents=(response.value||[]).filter(item=>item.document).map(item=>item.document);
  return {count:documents.length,cursor:documents.at(-1)?.name||cursor,items:documents.map(document=>({id:document.name.split('/').at(-1),job:decode({mapValue:{fields:document.fields}})}))};
 }
 async binding(){
  const response=await this.request(`${ROOT}/devices/${this.session.uid}`,{allow:[404]});
  return response.status===404?null:decode({mapValue:{fields:response.value.fields}});
 }
 async recovery(){
  const response=await this.request(`${ROOT}/controls/worker-start`,{allow:[404]});
  return response.status===404?null:decode({mapValue:{fields:response.value.fields}});
 }
}
async function installedModels(){
 const installed=[];
 for(const [id,files] of Object.entries(WEIGHTS)){
  const valid=await Promise.all(files.map(async file=>{try{const info=await stat(path.join(DATA,'models',file));return info.isFile()&&info.size===EXPECTED_BYTES[path.basename(file)];}catch{return false;}}));
  if(valid.every(Boolean))installed.push(id);
 }
 await stat(PYTHON);return installed;
}
async function loadThumbnail(directory,metadata){
 let thumbnail=metadata.thumbnail;
 try{await stat(path.join(directory,'thumbnail.jpg'));}catch(error){if(error.code==='ENOENT')thumbnail=null;else throw error;}
 if(!thumbnail)thumbnail=JSON.parse(execFileSync(PYTHON,['-B',path.join(HERE,'media.py'),'thumbnail',directory],{windowsHide:true,encoding:'utf8',timeout:15000}));
 return {...thumbnail,bytes:await readFile(path.join(directory,'thumbnail.jpg'))};
}
export async function infer(id,job,onProgress=()=>{},{signal,onEvent=()=>{}}={}){
 // No shell, client-supplied path, ComfyUI port, network-capable model process or warmup.
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('invalid-job');
 const logs=path.join(DATA,'velum-studio','logs');await mkdir(logs,{recursive:true});
 const parentCreated=execFileSync(PYTHON,['-B','-c',`import psutil; print(psutil.Process(${process.pid}).create_time())`],{windowsHide:true,encoding:'utf8',timeout:15000}).trim();
 return new Promise((resolve,reject)=>{
  const child=spawn(PYTHON,['-B',path.join(HERE,'infer.py')],{cwd:HERE,windowsHide:true,shell:false,
   env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',VELUM_PARENT_PID:String(process.pid),VELUM_PARENT_CREATED:parentCreated},stdio:['pipe','pipe','pipe']});
  const abort=()=>child.kill();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  let buffer='',diagnostic='',failure='inference-failed',saved=false;
  const timer=setTimeout(()=>{child.kill();reject(new Error('resource-guard'));},1830000);
  child.stdout.on('data',chunk=>{
   buffer+=chunk.toString();if(buffer.length>1000000)buffer=buffer.slice(-100000);
   let end;while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    try{const event=JSON.parse(line);onEvent(event);if(event.event==='progress')onProgress({step:event.step,total:event.total});
     if(event.event==='failed'&&event.error==='resource-guard')failure=event.error;if(event.event==='saved')saved=true;}catch{}
   }
  });
  // Bounded diagnostics stay beside private H-drive outputs, never in cloud documents.
  child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-65536);});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('inference-failed'));});
  child.on('close',async(code,exitSignal)=>{
   signal?.removeEventListener('abort',abort);
   // This disposable child owns all loaded model resources.
   clearTimeout(timer);
   await writeFile(path.join(logs,`${id}.json`),JSON.stringify({code,signal:exitSignal,saved,diagnostic})).catch(()=>{});
   code===0&&saved?resolve():reject(new Error(failure));
  });
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({id,job}));
 });
}
async function main(){
 if(process.platform!=='win32')throw new Error('windows-required');
 await mkdir(STATE,{recursive:true});
 secureDirectory(STATE);
 const lockPath=path.join(STATE,'worker.lock');
 const lock=await acquireWorkerLock(lockPath,fileURLToPath(import.meta.url));
 const store=new DeviceStore(path.join(STATE,'device.dpapi'));
 const recoveryInstalled=(()=>{try{return execFileSync('powershell.exe',['-NoLogo','-NoProfile','-NonInteractive','-Command',"$t=Get-ScheduledTask -TaskName 'PTI Velum Studio Recovery' -ErrorAction SilentlyContinue; if ($t -and $t.State -ne 'Disabled') {'yes'}"],{windowsHide:true,encoding:'utf8',timeout:15000}).trim()==='yes';}catch{return false;}})();
 let installed=[],queue,activeJob='',stopping=false,controller,heartbeat,lastPublish=0,lastState='',attempt=0,recoveryChecked=false;
 const local=values=>writeFile(path.join(STATE,'status.json'),JSON.stringify({version:VERSION,pid:process.pid,deviceUid:queue?.session.uid||PC_DEVICE_UID,updatedAt:Date.now(),startup:'interactive-logon-and-minute-recovery',...values}));
 const publish=async(state)=>{await local({state,activeJob,installed});if(queue&&(Date.now()-lastPublish>60000||lastState!==state)){
  await queue.write('status/pc',{deviceUid:queue.session.uid,updatedAt:Date.now(),installed,state,activeJob,version:VERSION,capabilities:{referenceModel:'flux2-klein-fp8',maxReferences:2,referenceModels:['flux2-klein-fp8','realvis-dynamic','realistic-sd15','zimage-nvfp4'],referenceOutputWidth:512,referenceOutputHeight:768,recoveryControl:recoveryInstalled}});lastPublish=Date.now();lastState=state;}};
 const approved=async()=>{if((await queue.binding())?.status!=='approved')throw new Error('device-not-approved');};
 const fail=(item,error)=>queue.write(`jobs/${item.id}`,{status:'failed',error,finishedAt:Date.now()});
 const load=async id=>{
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('invalid-output');
  try{
   const output=path.join(DATA,'velum-studio',id),bytes=await readFile(path.join(output,'image.png'));
   const metadata=JSON.parse(await readFile(path.join(output,'result.json'),'utf8')),payload=imagePayload(bytes);
   if(payload.result.sha256!==metadata.sha256)throw new Error('invalid-output');
   return {...payload,metadata,thumbnail:await loadThumbnail(output,metadata)};
  }catch(error){if(error.code==='ENOENT')return null;throw error;}
 };
 const upload=async(item,output)=>{
  const expected=item.job,actual=output.metadata;
  if(['model','seed','width','height'].some(key=>actual.settings?.[key]!==expected[key])||(actual.prompt!==undefined&&actual.prompt!==expected.prompt)||(expected.schemaVersion===3&&JSON.stringify(actual.references)!==JSON.stringify(expected.references)))throw new Error('invalid-output');
  for(let index=0;index<output.chunks.length;index++){
   await approved();const relative=`jobs/${item.id}/chunks/${index}`;
   const existing=await queue.request(`${ROOT}/${relative}`,{allow:[404]});
   if(existing.status===200){const data=decode({mapValue:{fields:existing.value.fields}});if(data.index!==index||data.data!==output.chunks[index])throw new Error('invalid-output');}
   else await queue.write(relative,{index,data:output.chunks[index]},{create:true});
  }
  await approved();
  const thumb=thumbnailPayload(output.thumbnail.bytes,{id:item.id,width:output.thumbnail.width,height:output.thumbnail.height,createdAt:item.job.createdAt});
  const prior=await queue.request(`${ROOT}/thumbs/${item.id}`,{allow:[404]});
  if(prior.status===404)await queue.write(`thumbs/${item.id}`,thumb,{create:true});
  else if(decode({mapValue:{fields:prior.value.fields}}).sha256!==thumb.sha256)throw new Error('invalid-output');
  await approved();await queue.write(`jobs/${item.id}`,{status:'completed',finishedAt:Date.now(),result:{...output.result,settings:output.metadata.settings,seconds:output.metadata.seconds,localPath:path.join(DATA,'velum-studio',item.id,'image.png')}});
 };
 const backfill=new ThumbnailBackfill(path.join(STATE,'thumbnail-backfill.json'),{
  page:cursor=>queue.archivePage(cursor),
  hasThumbnail:async id=>(await queue.request(`${ROOT}/thumbs/${id}`,{allow:[404]})).status===200,
  load:async(id,job)=>{
   if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))return null;
   const directory=path.join(DATA,'velum-studio',id);
   try{
    await stat(path.join(directory,'image.png'));
    const metadata=JSON.parse(await readFile(path.join(directory,'result.json'),'utf8'));
    if(metadata.sha256!==job.result?.sha256||['model','seed','width','height'].some(key=>metadata.settings?.[key]!==job[key]))return null;
    const thumbnail=await loadThumbnail(directory,metadata);
    return {metadata,thumbnail,bytes:thumbnail.bytes};
   }catch(error){if(error.code==='ENOENT')return null;throw error;}
  },
  publish:async(item,output)=>{
   await approved();await queue.write(`thumbs/${item.id}`,thumbnailPayload(output.bytes,{id:item.id,width:output.thumbnail.width,height:output.thumbnail.height,createdAt:item.job.createdAt}),{create:true});
  },
 });
 const run=async(item,resumed)=>{
  if(!/^[A-Za-z0-9_-]{1,80}$/.test(item.id))throw new Error('invalid-job');
  activeJob=item.id;controller=new AbortController();await publish('running');
  try{await finishClaimed(item,{resumed,load,upload,fail,approved,
   canResumeInference:async()=>{
    if(!item.job.references?.length)return false;
    try{await stat(path.join(DATA,'velum-studio',item.id,'inference-started.json'));return false;}catch(error){if(error.code==='ENOENT')return true;throw error;}
   },
   prepare:async()=>downloadReferences(item.id,item.job,{root:path.join(DATA,'velum-studio'),approved,fetchChunk:async(reference,index)=>{
    const response=await queue.request(`${ROOT}/jobs/${item.id}/inputs/${reference}/chunks/${index}`);return decode({mapValue:{fields:response.value.fields}});
   }}),infer:async()=>{
   let pending=Promise.resolve(),lastStep=0;
   await infer(item.id,item.job,progress=>{if(progress.step>lastStep){lastStep=progress.step;pending=pending.then(()=>queue.write(`jobs/${item.id}`,{status:'running',progress})).catch(()=>{});}},{signal:controller.signal});
   await pending;
  }});}finally{activeJob='';controller=null;}
 };
 process.on('SIGINT',()=>{stopping=true;controller?.abort();});process.on('SIGTERM',()=>{stopping=true;controller?.abort();});
 try{
  installed=await installedModels();
  await local({state:'restoring-device',installed});
  let checking=false;
  heartbeat=setInterval(async()=>{
   if(process.env.VELUM_HOST_PID){try{process.kill(Number(process.env.VELUM_HOST_PID),0);}catch{stopping=true;controller?.abort();}}
   if(!activeJob||checking)return;checking=true;
   try{await approved();await publish('running');}catch(error){if(error.message==='device-not-approved'||error.message==='firebase-403')controller?.abort();}finally{checking=false;}
  },15000);
  while(!stopping){
   try{
    if(!queue){const session=await restoreDevice(store);if(session.uid!==PC_DEVICE_UID)throw new Error('device-identity-mismatch');const candidate=new Queue(session,{store});await candidate.privacy();queue=candidate;}
    let binding=await queue.binding();
    if(!binding){queue.session.saved={...queue.session.saved,grant:randomBytes(32).toString('hex'),grantCreatedAt:Date.now()};await store.save(queue.session.saved);await queue.write(`devices/${queue.session.uid}`,enrollment(queue.session.saved),{create:true});binding=await queue.binding();}
    if(binding.status==='pending'&&binding.expiresAt<=Date.now()){
     if(queue.session.saved.grantCreatedAt<=binding.createdAt){queue.session.saved={...queue.session.saved,grant:randomBytes(32).toString('hex'),grantCreatedAt:Date.now()};await store.save(queue.session.saved);}
     const next=enrollment(queue.session.saved);await queue.write(`devices/${queue.session.uid}`,{grantHash:next.grantHash,createdAt:next.createdAt,expiresAt:next.expiresAt});
    }
    if(binding.status!=='approved'){await local({state:binding.status==='revoked'?'revoked':'approval-required',installed,activeJob:''});attempt=0;}
    else{
     await publish('idle');
      // A request can also be acknowledged by the already-running worker.
      // Acknowledgment alone is not success: the browser requires a fresh heartbeat.
      if(!recoveryChecked){
       const recovery=await queue.recovery().catch(error=>{if(error.message==='firebase-403')return null;throw error;});
       if(pendingRecovery(recovery))await queue.write('controls/worker-start',{status:'attempted',attemptedAt:Date.now()}).catch(error=>{if(error.message!=='firebase-403')throw error;});
       recoveryChecked=true;
      }
     for(const item of await queue.jobs('running')){if(stopping)break;await run(item,true);}
     for(const item of await queue.jobs('queued')){
      if(stopping)break;await approved();
      if(!runnable(item.job)){await fail(item,'expired');continue;}
      if(!installed.includes(item.job.model)){await fail(item,'model-unavailable');continue;}
      try{await queue.write(`jobs/${item.id}`,{status:'running',workerId:queue.session.uid,startedAt:Date.now()},{updateTime:item.updateTime});}
      catch(error){if(['firebase-409','firebase-412'].includes(error.message))continue;throw error;}
      await run(item,false);
     }
     if(!stopping)await backfill.step().catch(()=>backfill.recordError().catch(()=>{}));
     attempt=0;
    }
   }catch(error){
    await local({state:error.message==='device-not-approved'?'approval-required':'reconnecting',installed,activeJob:'',error:['device-identity-mismatch','private-rules-not-ready','device-auth-not-enabled-or-invalid'].includes(error.message)?error.message:'connection-unavailable'});
    await new Promise(resolve=>setTimeout(resolve,retryDelay(attempt++)));continue;
   }
   await new Promise(resolve=>setTimeout(resolve,15000));
  }
 }finally{
  clearInterval(heartbeat);await publish('offline').catch(()=>{});
  if(queue)queue.session=null;await lock?.close();await unlink(path.join(STATE,'worker.lock')).catch(()=>{});
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(async error=>{
 const allowed=['device-identity-mismatch','private-rules-not-ready','device-auth-unavailable','worker-already-running','invalid-worker-lock'];
 await writeFile(path.join(STATE,'error.json'),JSON.stringify({at:Date.now(),error:allowed.includes(error.message)?error.message:'worker-unavailable'})).catch(()=>{});
 process.exitCode=1;
});
