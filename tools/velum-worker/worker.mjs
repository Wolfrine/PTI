import {mkdir,open,readFile,writeFile,unlink,stat} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {pairOwner,refreshSession,OWNER_UID,PROJECT} from './session.mjs';
import {WEIGHTS,runnable,encode,decode,imagePayload} from './core.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const STATE=path.join(HERE,'.runtime');
const DATA='H:\\AI-ImageGen\\portrait-pilot';
const PYTHON='F:\\Workspace\\Support\\tools\\local-image-gen\\venv\\Scripts\\python.exe';
const BASE=`https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const ROOT=`users/${OWNER_UID}/velumStudio/workspace`;
const VERSION='1.0.0';
const EXPECTED_BYTES={
 'z_image_turbo_nvfp4.safetensors':4509509600,'flux-2-klein-4b-fp8.safetensors':4070624520,
 'RealVisXL_V5.0_fp16.safetensors':6938065488,'Realistic_Vision_V6.0_NV_B1_fp16.safetensors':2132625894,
 'qwen_3_4b_fp8_mixed.safetensors':5631994051,'ae.safetensors':335304388,
 'flux2-vae.safetensors':336211292,'vae-ft-mse-840000-ema-pruned.safetensors':334641190,
};
export class Queue {
 constructor(session){this.session=session;this.renewing=null;}
 async token(){
  if(this.session.expiresAt-Date.now()<300000){
   this.renewing??=refreshSession(this.session.refreshToken).finally(()=>{this.renewing=null;});
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
  const own=await this.request(`${ROOT}/status/pc`,{allow:[404]});
  const anonymous=await this.request(`${ROOT}/status/pc`,{anonymous:true,allow:[403]});
  const other=await this.request('users/velum-isolation-probe/velumStudio/workspace/status/pc',{allow:[403]});
  if(![200,404].includes(own.status)||anonymous.status!==403||other.status!==403)throw new Error('private-rules-not-ready');
 }
 async write(relative,values,{updateTime,create=false}={}){
  const params=new URLSearchParams();
  if(updateTime)params.set('currentDocument.updateTime',updateTime);
  if(create)params.set('currentDocument.exists','false');
  if(!create)for(const key of Object.keys(values))params.append('updateMask.fieldPaths',key);
  return this.request(`${ROOT}/${relative}?${params}`,{method:'PATCH',value:{fields:encode(values).mapValue.fields}});
 }
 async jobs(status){
  const response=await this.request(`${ROOT}:runQuery`,{method:'POST',value:{structuredQuery:{from:[{collectionId:'jobs'}],where:{fieldFilter:{field:{fieldPath:'status'},op:'EQUAL',value:encode(status)}},limit:20}}});
  return (response.value||[]).filter(item=>item.document).map(({document})=>({id:document.name.split('/').at(-1),updateTime:document.updateTime,job:decode({mapValue:{fields:document.fields}})})).sort((a,b)=>a.job.createdAt-b.job.createdAt);
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
export async function infer(id,job,onProgress=()=>{}){
 // No shell, client-supplied path, ComfyUI port, network-capable model process or warmup.
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('invalid-job');
 const logs=path.join(DATA,'velum-studio','logs');await mkdir(logs,{recursive:true});
 const parentCreated=execFileSync(PYTHON,['-B','-c',`import psutil; print(psutil.Process(${process.pid}).create_time())`],{windowsHide:true,encoding:'utf8',timeout:15000}).trim();
 return new Promise((resolve,reject)=>{
  const child=spawn(PYTHON,['-B',path.join(HERE,'infer.py')],{cwd:HERE,windowsHide:true,shell:false,
   env:{...process.env,PYTHONDONTWRITEBYTECODE:'1',VELUM_PARENT_PID:String(process.pid),VELUM_PARENT_CREATED:parentCreated},stdio:['pipe','pipe','pipe']});
  let buffer='',diagnostic='',failure='inference-failed',saved=false;
  const timer=setTimeout(()=>{child.kill();reject(new Error('resource-guard'));},1830000);
  child.stdout.on('data',chunk=>{
   buffer+=chunk.toString();if(buffer.length>1000000)buffer=buffer.slice(-100000);
   let end;while((end=buffer.indexOf('\n'))>=0){
    const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
    try{const event=JSON.parse(line);if(event.event==='progress')onProgress({step:event.step,total:event.total});
     if(event.event==='failed'&&event.error==='resource-guard')failure=event.error;if(event.event==='saved')saved=true;}catch{}
   }
  });
  // Bounded diagnostics stay beside private H-drive outputs, never in cloud documents.
  child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-65536);});
  child.on('error',()=>{clearTimeout(timer);reject(new Error('inference-failed'));});
  child.on('close',async(code,signal)=>{
   clearTimeout(timer);
   await writeFile(path.join(logs,`${id}.json`),JSON.stringify({code,signal,saved,diagnostic})).catch(()=>{});
   code===0&&saved?resolve():reject(new Error(failure));
  });
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({id,job}));
 });
}
async function main(){
 if(process.platform!=='win32')throw new Error('windows-required');
 await mkdir(STATE,{recursive:true});
 const account=execFileSync('whoami',[],{encoding:'utf8',windowsHide:true}).trim();
 execFileSync('icacls',[STATE,'/inheritance:r','/grant:r',`${account}:(OI)(CI)F`,'SYSTEM:(OI)(CI)F'],{windowsHide:true,stdio:'ignore'});
 let lock;
 try{lock=await open(path.join(STATE,'worker.lock'),'wx');await lock.writeFile(String(process.pid));}
 catch{throw new Error('worker-already-running-or-lock-needs-review');}
 const workerId=randomUUID();let installed=[],queue,activeJob='',stopping=false,heartbeat;
 const local=values=>writeFile(path.join(STATE,'status.json'),JSON.stringify({version:VERSION,pid:process.pid,updatedAt:Date.now(),...values}));
 const publish=async(state)=>{if(queue)await queue.write('status/pc',{updatedAt:Date.now(),installed,state,activeJob,version:VERSION});await local({state,activeJob,installed});};
 try{
  installed=await installedModels();
  await local({state:'owner-login-required',installed});
  const session=await pairOwner({onUrl:async url=>{await writeFile(path.join(STATE,'pairing-url.txt'),url);},verify:session=>new Queue(session).privacy()});
  await unlink(path.join(STATE,'pairing-url.txt')).catch(()=>{});
  queue=new Queue(session);await queue.privacy();
  // A claimed job is never silently resampled after a worker crash.
  for(const item of await queue.jobs('running'))await queue.write(`jobs/${item.id}`,{status:'failed',error:'interrupted',finishedAt:Date.now()},{updateTime:item.updateTime});
  process.on('SIGINT',()=>{stopping=true;});process.on('SIGTERM',()=>{stopping=true;});
  heartbeat=setInterval(()=>publish(activeJob?'running':'idle').catch(()=>{}),30000);
  const deadline=Date.now()+4*60*60*1000;
  while(!stopping&&Date.now()<deadline){
   await publish('idle');
   for(const item of await queue.jobs('queued')){
    if(stopping)break;
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(item.id))continue;
    if(!runnable(item.job)){await queue.write(`jobs/${item.id}`,{status:'failed',error:'expired',finishedAt:Date.now()},{updateTime:item.updateTime});continue;}
    if(!installed.includes(item.job.model)){await queue.write(`jobs/${item.id}`,{status:'failed',error:'model-unavailable',finishedAt:Date.now()},{updateTime:item.updateTime});continue;}
    try{await queue.write(`jobs/${item.id}`,{status:'running',workerId,startedAt:Date.now()},{updateTime:item.updateTime});}
    catch(error){if(['firebase-409','firebase-412'].includes(error.message))continue;throw error;}
    activeJob=item.id;await publish('running');
    let pending=Promise.resolve(),lastStep=0;
    try{
     await infer(item.id,item.job,progress=>{if(progress.step>lastStep){lastStep=progress.step;pending=pending.then(()=>queue.write(`jobs/${item.id}`,{status:'running',progress})).catch(()=>{});}});
     await pending;
     const output=path.join(DATA,'velum-studio',item.id);
     const bytes=await readFile(path.join(output,'image.png'));
     const metadata=JSON.parse(await readFile(path.join(output,'result.json'),'utf8'));
     const payload=imagePayload(bytes);
     if(payload.result.sha256!==metadata.sha256)throw new Error('invalid-output');
     for(let index=0;index<payload.chunks.length;index++)await queue.write(`jobs/${item.id}/chunks/${index}`,{index,data:payload.chunks[index]},{create:true});
     await queue.write(`jobs/${item.id}`,{status:'completed',finishedAt:Date.now(),result:{...payload.result,settings:metadata.settings,seconds:metadata.seconds}});
    }catch(error){
     const allowed=['resource-guard','invalid-output','output-too-large'];
     await queue.write(`jobs/${item.id}`,{status:'failed',error:allowed.includes(error.message)?error.message:'inference-failed',finishedAt:Date.now()});
    }finally{activeJob='';}
   }
   await new Promise(resolve=>setTimeout(resolve,10000));
  }
 }finally{
  clearInterval(heartbeat);await publish('offline').catch(()=>{});
  if(queue)queue.session=null;await lock?.close();await unlink(path.join(STATE,'worker.lock')).catch(()=>{});
  await unlink(path.join(STATE,'pairing-url.txt')).catch(()=>{});
 }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(async error=>{
 const allowed=['owner-login-required','owner-account-required','private-rules-not-ready','pairing-unavailable','worker-already-running-or-lock-needs-review'];
 await writeFile(path.join(STATE,'error.json'),JSON.stringify({at:Date.now(),error:allowed.includes(error.message)?error.message:'worker-unavailable'})).catch(()=>{});
 process.exitCode=1;
});
