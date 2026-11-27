// Local model binding for the fresh Auto Edit coordinator. It uses the
// currently supported Studio engine, not a new inference service or a manual job.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn,execFile} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open,readFile,readdir,lstat,mkdir,link,rm,stat,realpath} from 'node:fs/promises';
import {isDeepStrictEqual} from 'node:util';
import {engineProfile,QWEN_REVISION} from './engine-profile.mjs';
import {assertOutputIdentity} from './lifecycle.mjs';
import {makeJob,validateJob,CHUNK_SIZE,isQwenModel} from '../../velum-gallery/studio-contract.mjs';
import {AutoEditFault} from './auto-edit-runner.mjs';
import {AUTO_EDIT_MODELS,isAutoId,isHash,isSeed,validateVision1,validateVision2} from './auto-edit-contract.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const ROOT='H:\\Workspace\\Generated\\Velum\\auto-edit-v1';
const RUNTIME=path.join(HERE,'auto-edit-runtime.py');
const PIN_FILES=['bin/llama-mtmd-cli.exe','models/Qwen3VL-2B-Instruct-Q4_K_M.gguf','models/mmproj-Qwen3VL-2B-Instruct-F16.gguf','models/Qwen3VL-4B-Instruct-Q4_K_M.gguf','models/mmproj-Qwen3VL-4B-Instruct-F16.gguf'];
const fault=code=>new AutoEditFault(code);
const need=(value,code)=>{if(!value)throw fault(code);};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const alive=signal=>need(!signal?.aborted,'execution-interrupted');
const exists=async file=>{try{await lstat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}};
async function fileHash(file,max=64*1024*1024){
 const before=await lstat(file);
 need(before.isFile()&&!before.isSymbolicLink()&&before.size>0&&before.size<=max,'invalid-local-artifact');
 const digest=createHash('sha256');
 for await(const chunk of createReadStream(file))digest.update(chunk);
 const after=await lstat(file);
 need(before.size===after.size&&before.mtimeMs===after.mtimeMs,'local-artifact-changed');
 return digest.digest('hex');
}
async function fileJson(file){
 const info=await lstat(file);
 need(info.isFile()&&!info.isSymbolicLink()&&info.size<=524288,'invalid-runtime-receipt');
 return JSON.parse(await readFile(file,'utf8'));
}
async function verifyDirectory(dir){
 const info=await lstat(dir);
 need(info.isDirectory()&&!info.isSymbolicLink()&&path.resolve(dir).toLowerCase()===(await realpath(dir)).toLowerCase(),'unsafe-runtime-directory');
}
async function localItem(context){
 need(process.platform==='win32'&&isAutoId(context.batchId)&&/^item-\d{3}$/.test(context.itemId)&&context.consent===true,'local-edit-authorization-required');
 need(context.source?.authorized===true&&isHash(context.sourceHash)&&isSeed(context.seed),'invalid-source-identity');
 const dir=path.join(ROOT,context.batchId,context.itemId);
 await verifyDirectory(dir);
 const expected=path.join(dir,context.source.mime==='image/png'?'source.png':'source.jpg');
 need(path.resolve(context.sourcePath).toLowerCase()===expected.toLowerCase(),'invalid-local-source');
 need(await fileHash(expected)===context.sourceHash,'source-identity-mismatch');
 if(context.targetPath)need(path.resolve(context.targetPath).toLowerCase()===path.join(dir,'edited.png').toLowerCase(),'invalid-edit-target');
 if(context.editedPath)need(path.resolve(context.editedPath).toLowerCase()===path.join(dir,'edited.png').toLowerCase(),'invalid-comparison-target');
 return {dir,sourcePath:expected,targetPath:path.join(dir,'edited.png')};
}
async function currentClaim(context){
 alive(context.signal);
 need(typeof context.checkClaim==='function','claim-check-required');
 const c=await context.checkClaim();need(c?.command==='run','execution-interrupted');
}
function runLocal(python,request,{signal,timeoutMs,maxOutput}){
 alive(signal);
 return new Promise((resolve,reject)=>{
  const child=spawn(python,['-B',RUNTIME],{cwd:HERE,windowsHide:true,shell:false,stdio:['pipe','pipe','pipe']});
  let chunks=[],size=0,failure=null;
  const terminate=code=>{failure??=code;child.kill();};
  const abort=()=>terminate('execution-interrupted');
  const timer=setTimeout(()=>terminate('local-runtime-timeout'),timeoutMs);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  child.stdout.on('data',chunk=>{
   size+=chunk.length;
   if(size>maxOutput){chunks=[];terminate('local-runtime-output-budget');return;}
   if(!failure)chunks.push(chunk);
  });
  child.stderr.resume();
  child.once('error',()=>{failure??='local-runtime-unavailable';});
  child.once('close',code=>{
   clearTimeout(timer);signal?.removeEventListener('abort',abort);
   if(failure)return reject(fault(failure));
   try{
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(code!==0||data?.ok!==true||!data.result)return reject(fault(typeof data?.code==='string'?data.code:'local-runtime-failed'));
    resolve(data.result);
   }catch{reject(fault('local-runtime-output-invalid'));}
  });
  child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify(request));
 });
}
async function parentCreation(python,signal){
 const value=await new Promise((resolve,reject)=>execFile(python,['-B','-c','import psutil,sys; print(psutil.Process(int(sys.argv[1])).create_time())',String(process.pid)],{windowsHide:true,encoding:'utf8',timeout:15000,maxBuffer:1024,signal},(error,stdout)=>error?reject(fault('parent-identity-unavailable')):resolve(Number(stdout.trim()))));
 need(Number.isFinite(value)&&value>0,'parent-identity-unavailable');return value;
}
async function writeExclusive(file,bytes){
 const temp=path.join(path.dirname(file),'.write-'+randomUUID()+'.tmp');
 const handle=await open(temp,'wx',0o600);
 try{
  await handle.writeFile(bytes);await handle.sync();await handle.close();
  try{await link(temp,file);}catch(error){if(error.code!=='EEXIST')throw error;}
  need(await fileHash(file,Math.max(bytes.length,1))===hash(bytes),'local-artifact-conflict');
 }finally{await handle.close().catch(()=>{});await rm(temp,{force:true}).catch(()=>{});}
}
const jsonText=object=>Buffer.from(JSON.stringify(object),'utf8');
function engineId(c){return 'auto-v1-'+hash(c.batchId+':'+c.itemId).slice(0,48);}
async function enginePaths(c){
 const profile=engineProfile(c.model),id=engineId(c),work=path.join(profile.outputRoot,id);
 return {profile,id,work,inputDir:path.join(work,'inputs'),input:path.join(work,'inputs','0.jpg')};
}
async function normalize(c,local,profile){
 const result=await runLocal(profile.python,{action:'normalize',sourcePath:local.sourcePath,sourceHash:c.sourceHash},{signal:c.signal,timeoutMs:120000,maxOutput:4*1024*1024});
 const data=Buffer.from(result.data,'base64');
 need(result.sourceHash===c.sourceHash&&result.mime==='image/jpeg'&&result.bytes===data.length&&data.toString('base64')===result.data&&isHash(result.sha256)&&hash(data)===result.sha256,'normalized-reference-invalid');
 need(data.length>=100&&data.length<=2097152&&Number.isSafeInteger(result.width)&&Number.isSafeInteger(result.height)&&result.width>0&&result.height>0&&Math.max(result.width,result.height)<=1024,'normalized-reference-invalid');
 const manifest={index:0,mime:result.mime,bytes:data.length,sha256:result.sha256,width:result.width,height:result.height,chunks:Math.ceil(result.data.length/CHUNK_SIZE),source:{kind:'drive',id:c.source.fileId,name:'Original reference'},role:'subject'};
 return {data,manifest};
}
async function loadIntent(c,local,paths){
 const file=path.join(local.dir,'engine-intent.json');
 if(!await exists(file))return null;
 const value=await fileJson(file);
 need(value.version===1&&value.engineId===paths.id&&value.sourceHash===c.sourceHash&&value.promptHash===hash(c.prompt)&&value.job?.model===c.model&&value.job?.seed===c.seed&&value.job?.prompt===c.prompt&&value.job?.effectivePrompt===c.prompt&&value.job?.references?.length===1&&value.job.references[0].source?.id===c.source.fileId,'edit-intent-conflict');
 validateJob(value.job);
 need(isHash(value.adapterHash),'edit-intent-conflict');
 return value;
}
async function prepare(c,local,paths){
 let intent=await loadIntent(c,local,paths);
 if(!intent){
  need(!await exists(paths.work),'edit-outcome-unknown');
  const {data,manifest}=await normalize(c,local,paths.profile);
  const job=makeJob({model:c.model,prompt:c.prompt,effectivePrompt:c.prompt,seed:c.seed,consent:c.consent,references:[manifest],parentJobId:''});
  job.inputsReady=true;job.status='queued';validateJob(job);
  intent={version:1,engineId:paths.id,sourceHash:c.sourceHash,promptHash:hash(c.prompt),adapterHash:await fileHash(paths.profile.script),job};
  await writeExclusive(path.join(local.dir,'engine-intent.json'),jsonText(intent));
  // Keep the immutable normalized bytes alongside their source lineage.
  await writeExclusive(path.join(local.dir,'engine-reference.jpg'),data);
 }else{
  need(intent.adapterHash===await fileHash(paths.profile.script),'engine-adapter-changed');
 }
 const normalized=path.join(local.dir,'engine-reference.jpg');
 if(!await exists(normalized)){
  const {data,manifest}=await normalize(c,local,paths.profile);
  need(isDeepStrictEqual(manifest,intent.job.references[0]),'normalized-reference-changed');
  await writeExclusive(normalized,data);
 }
 need(await fileHash(normalized,2097152)===intent.job.references[0].sha256,'normalized-reference-conflict');
 return intent;
}
async function recoverResult(c,local,paths,intent){
 const marker=path.join(paths.work,'inference-started.json'),metadataPath=path.join(paths.work,'result.json'),image=path.join(paths.work,'image.png');
 if(!await exists(paths.work)){
  need(!await exists(local.targetPath),'edit-outcome-unknown');
  return {status:'not-started',confirmed:true};
 }
 await verifyDirectory(paths.work);
 if(!intent)throw fault('edit-outcome-unknown');
 if(!await exists(metadataPath)){
  const names=await readdir(paths.work);
  if(names.every(name=>name==='inputs')&&!await exists(local.targetPath)&&!await exists(marker))return {status:'not-started',confirmed:true};
  throw fault('edit-outcome-unknown');
 }
 need(await exists(marker)&&await exists(image),'edit-outcome-unknown');
 const metadata=await fileJson(metadataPath),started=await fileJson(marker);
 assertOutputIdentity(intent.job,metadata);
 need(started.jobId===paths.id&&started.seed===c.seed&&started.prompt===c.prompt&&started.effectivePrompt===c.prompt&&isDeepStrictEqual(started.references,intent.job.references),'edit-marker-conflict');
 const sha256=await fileHash(image);
 need(metadata.sha256===sha256,'edit-output-hash-mismatch');
 const output=await readFile(image);
 await writeExclusive(local.targetPath,output);
 const settings=metadata.settings;
 if(isQwenModel(c.model))need(settings.runtimeRevision===QWEN_REVISION&&settings.steps===(c.model==='qwen-image-2.1-turbo'?8:40),'edit-runtime-revision-mismatch');
 const engineRevision=isQwenModel(c.model)?settings.runtimeRevision:'studio-adapter-sha256:'+intent.adapterHash;
 need(typeof engineRevision==='string'&&engineRevision.length>0&&Number.isSafeInteger(settings.steps),'edit-engine-receipt-invalid');
 return {status:'saved',model:c.model,seed:c.seed,sourceHash:c.sourceHash,promptHash:hash(c.prompt),sha256,engineRevision,width:settings.width,height:settings.height,steps:settings.steps};
}
// These are conventional image-quality/scene tasks, not identity recognition or
// inferred authorization. Treat the owner's guidance as data, not tool commands.
function visionTask(stage,c){
 const payload={instructions:c.instructions??'',guidance:stage==='vision1'?c.guidance??'':undefined,actualPrompt:stage==='vision2'?c.prompt:undefined};
 const rules=stage==='vision1'
  ?'Describe only visible, non-sensitive details relevant to the approved ordinary edit (composition, lighting, colors, scene, materials, preservation constraints). Do not invent identity, consent, private traits or details hidden from view. Do not expand the requested edit or change its subject. If no useful addition is supported, return an empty addition and explain any limitations. Return only JSON with addition and limitations.'
  :'Compare image 1 (original) and image 2 (edited). Evaluate the approved ordinary edit against the instructions and actual prompt, noting visible changes, preserved details, unintended changes and image-quality defects. Separate observation from uncertainty. Do not infer identity, consent or sensitive personal traits. Return only JSON with summary, observations, limitations.';
 return rules+'\n\nOwner-provided task data (JSON):\n'+JSON.stringify(payload);
}
export function createLocalModelAdapters({installed,infer,pins,assertRuntimeReady}){
 need(Array.isArray(installed)&&typeof infer==='function'&&typeof assertRuntimeReady==='function'&&pins&&PIN_FILES.every(name=>isHash(pins[name])),'local-model-binding-not-ready');
 const pinSnapshot=Object.fromEntries(PIN_FILES.map(name=>[name,pins[name]]));
 const python=engineProfile('qwen-image-2.1').python;
 async function runVision(stage,c){
  const local=await localItem(c);
  await currentClaim(c);await assertRuntimeReady({stage,signal:c.signal});
  need(c.visionModel===(stage==='vision1'?AUTO_EDIT_MODELS.vision1:AUTO_EDIT_MODELS.vision2),'vision-model-mismatch');
  if(stage==='vision2')need(isHash(c.outputHash)&&await fileHash(local.targetPath)===c.outputHash,'comparison-identity-mismatch');
  const parentCreated=await parentCreation(python,c.signal);
  const request={action:'vision',stage,sourcePath:local.sourcePath,sourceHash:c.sourceHash,consent:c.consent,pins:pinSnapshot,task:visionTask(stage,c),parentPid:process.pid,parentCreated,...(stage==='vision2'?{editedPath:local.targetPath,outputHash:c.outputHash}:{})};
  await currentClaim(c);
  const result=await runLocal(python,request,{signal:c.signal,timeoutMs:720000,maxOutput:262144});
  return stage==='vision1'?validateVision1(result):validateVision2(result);
 }
 return {
  describe:c=>runVision('vision1',c),
  compare:c=>runVision('vision2',c),
  async recoverEdit(c){
   const local=await localItem(c),paths=await enginePaths(c);
   await currentClaim(c);await assertRuntimeReady({stage:'edit',model:c.model,signal:c.signal});
   return recoverResult(c,local,paths,await loadIntent(c,local,paths));
  },
  async edit(c){
   need(installed.includes(c.model),'model-unavailable');
   const local=await localItem(c),paths=await enginePaths(c);
   await currentClaim(c);await assertRuntimeReady({stage:'edit',model:c.model,signal:c.signal});
   const existing=await loadIntent(c,local,paths);
   const recovery=await recoverResult(c,local,paths,existing);
   if(recovery.status==='saved')return recovery;
   const intent=await prepare(c,local,paths);
   await mkdir(paths.inputDir,{recursive:true});
   await verifyDirectory(paths.work);await verifyDirectory(paths.inputDir);
   const input=await readFile(path.join(local.dir,'engine-reference.jpg'));
   await writeExclusive(paths.input,input);
   await currentClaim(c);
   await infer(paths.id,intent.job,()=>{},{signal:c.signal});
   return recoverResult(c,local,paths,intent);
  }
 };
}
