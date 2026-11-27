// Private metadata broker + existing Google Drive for desktop connection.
// Only the worker's pinned Firebase identity is sent to the existing service;
// original and edited bytes stay on the PC/Drive mount, not in Firestore.
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open,lstat,readFile,realpath} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {createVerifiedOriginalReader} from './auto-edit-local.mjs';
import {AutoEditFault} from './auto-edit-runner.mjs';
import {SOURCE_FOLDERS,REVIEW_STAGING_ID,AUTO_EDIT_LIMITS,isAutoId,isHash,validateDeliveryReceipt} from './auto-edit-contract.mjs';

const ENDPOINT='https://pti-app-2ab59-velum.web.app/api/drive/auto-edit-metadata';
const ROOT='H:\\Workspace\\Generated\\Velum\\auto-edit-v1';
const hash=value=>createHash('sha256').update(value).digest('hex');
const fault=code=>new AutoEditFault(code);
const need=(ok,code)=>{if(!ok)throw fault(code)};
const same=(a,b)=>a.toLowerCase()===b.toLowerCase();
const alive=signal=>need(!signal?.aborted,'execution-interrupted');
async function exists(file){try{await lstat(file);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
async function exactDir(dir){
 const st=await lstat(dir);
 need(st.isDirectory()&&!st.isSymbolicLink()&&same(path.resolve(dir),await realpath(dir)),'drive-folder-mapping-unavailable');
 return path.resolve(dir);
}
function filename(value){
 need(typeof value==='string'&&value.length>0&&value.length<=255&&value!=='.'&&value!=='..'&&!/[<>:"/\\|?*\x00-\x1f]/.test(value)&&!/[. ]$/.test(value)&&!/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value),'drive-filename-not-materializable');
 return value;
}
async function verifyClaim(context){
 alive(context.signal);
 need(typeof context.checkClaim==='function','claim-check-required');
 const c=await context.checkClaim();
 need(c?.command==='run','execution-interrupted');
}
async function jsonResponse(response){
 const reader=response.body?.getReader();
 need(reader,'drive-metadata-response-invalid');
 const chunks=[];let size=0;
 try{
  while(true){
   const {done,value}=await reader.read();if(done)break;
   size+=value.byteLength;need(size<=16384,'drive-metadata-response-budget');chunks.push(Buffer.from(value));
  }
 }finally{await reader.cancel().catch(()=>{});}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw fault('drive-metadata-response-invalid');}
}
async function broker(queue,action,c){
 need(isAutoId(c.batchId)&&/^item-\d{3}$/.test(c.itemId),'invalid-auto-edit-item');
 alive(c.signal);
 const signal=c.signal?AbortSignal.any([c.signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000);
 let response;
 try{
  response=await fetch(ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+await queue.token()},body:JSON.stringify({action,batchId:c.batchId,itemId:c.itemId}),redirect:'error',signal});
 }catch{throw fault(c.signal?.aborted?'execution-interrupted':'drive-metadata-unavailable');}
 const value=await jsonResponse(response);
 if(!response.ok){
  const code=typeof value?.code==='string'&&/^drive\/[a-z0-9-]{1,70}$/.test(value.code)?value.code.replace('/','-'):'drive-metadata-rejected';
  throw fault(code);
 }
 return value;
}
async function artifact(file,signal,expected){
 alive(signal);
 const before=await lstat(file);
 need(before.isFile()&&!before.isSymbolicLink()&&before.size>=16&&before.size<=AUTO_EDIT_LIMITS.imageBytes,'invalid-delivery-artifact');
 const digest=createHash('sha256');let bytes=0;
 for await(const part of createReadStream(file,{signal})){digest.update(part);bytes+=part.length;}
 const after=await lstat(file),sha256=digest.digest('hex');
 need(before.size===after.size&&before.mtimeMs===after.mtimeMs&&bytes===after.size&&sha256===expected,'delivery-byte-identity-mismatch');
 return {bytes,sha256};
}
async function copyNoReplace(source,target,{signal,expected}){
 const original=await artifact(source,signal,expected);
 // The mounted destination is created once. Interrupted partial copies are
 // deliberately retained and blocked, never overwritten or uploaded twice.
 let handle;
 try{handle=await open(target,'wx',0o600);}catch(error){if(error.code==='EEXIST')return artifact(target,signal,expected);throw error;}
 let written=0;
 try{
  for await(const chunk of createReadStream(source,{signal})){
   let offset=0;
   while(offset<chunk.length){
    alive(signal);
    const result=await handle.write(chunk,offset,chunk.length-offset,written);
    need(result.bytesWritten>0,'drive-copy-incomplete');
    offset+=result.bytesWritten;written+=result.bytesWritten;
   }
  }
  need(written===original.bytes,'drive-copy-incomplete');await handle.sync();
 }finally{await handle.close();}
 return artifact(target,signal,expected);
}
async function contextPaths(c,stagingRoot){
 need(isAutoId(c.batchId)&&/^item-\d{3}$/.test(c.itemId)&&isHash(c.outputHash)&&c.key===c.batchId+'-'+c.itemId,'invalid-delivery-context');
 const dir=path.join(ROOT,c.batchId,c.itemId),source=path.join(dir,'edited.png');
 need(same(path.resolve(c.editedPath),source),'invalid-delivery-source');
 await exactDir(dir);await exactDir(stagingRoot);
 const name='Velum-auto-'+hash(c.batchId+':'+c.itemId).slice(0,32)+'.png';
 return {source,output:path.join(stagingRoot,name),intent:path.join(dir,'delivery-intent.json'),name};
}
async function readIntent(file){
 if(!await exists(file))return null;
 const st=await lstat(file);need(st.isFile()&&!st.isSymbolicLink()&&st.size<=4096,'delivery-intent-invalid');
 try{return JSON.parse(await readFile(file,'utf8'));}catch{throw fault('delivery-intent-invalid');}
}
async function createIntent(file,value){
 const handle=await open(file,'wx',0o600);
 try{await handle.writeFile(JSON.stringify(value),'utf8');await handle.sync();}finally{await handle.close();}
}
export function createDriveDesktopAdapters({queue,folders,stagingRoot}){
 need(queue&&typeof queue.token==='function'&&folders&&typeof stagingRoot==='string','drive-desktop-binding-not-ready');
 const privateRoot=folders[SOURCE_FOLDERS.private],referenceRoot=folders[SOURCE_FOLDERS.references];
 need(typeof privateRoot==='string'&&typeof referenceRoot==='string'&&path.isAbsolute(privateRoot)&&path.isAbsolute(referenceRoot)&&path.isAbsolute(stagingRoot),'drive-folder-mapping-required');
 need(same(path.dirname(path.resolve(referenceRoot)),path.resolve(privateRoot))&&path.basename(referenceRoot)==='References'&&same(path.dirname(path.resolve(stagingRoot)),path.resolve(privateRoot))&&path.basename(stagingRoot)==='Review staging','drive-folder-mapping-mismatch');
 const reader=createVerifiedOriginalReader({folders,lookup:async c=>{
  const value=await broker(queue,'source',c);
  need(value?.fileId===c.fileId&&value.folderId===c.folderId,'drive-source-identity-mismatch');
  const root=folders[value.folderId];need(typeof root==='string','drive-folder-mapping-required');
  await exactDir(root);
  return {...value,localPath:path.join(root,filename(value.name))};
 }});
 async function cloudCheck(c,paths){
  const value=await broker(queue,'delivery',c);
  if(value?.status==='saved')return {status:'saved',receipt:validateDeliveryReceipt(value.receipt,{key:c.key,outputHash:c.outputHash})};
  need(value?.status==='not-found'&&value.confirmed===true&&value.name===paths.name&&value.parentId===REVIEW_STAGING_ID,'drive-delivery-status-invalid');
  return {status:'not-found'};
 }
 async function waitCloud(c,paths){
  // Bounded active verification only, not an idle listener or a scheduled job.
  for(const delay of [0,2000,5000,10000]){
   if(delay)await sleep(delay,undefined,{signal:c.signal});
   await verifyClaim(c);
   const result=await cloudCheck(c,paths);
   if(result.status==='saved')return result;
  }
  throw fault('drive-sync-not-confirmed');
 }
 async function reconcile(c,paths){
  await verifyClaim(c);
  const result=await cloudCheck(c,paths);
  if(result.status==='saved')return result;
  const intent=await readIntent(paths.intent),present=await exists(paths.output);
  if(!intent&&!present)return {status:'not-started',confirmed:true};
  need(intent?.version===1&&intent.key===c.key&&intent.name===paths.name&&intent.outputHash===c.outputHash&&intent.parentId===REVIEW_STAGING_ID&&present,'delivery-outcome-unknown');
  await artifact(paths.output,c.signal,c.outputHash);
  return waitCloud(c,paths);
 }
 return {
  ...reader,
  async reconcileDelivery(c){return reconcile(c,await contextPaths(c,stagingRoot));},
  async deliver(c){
   const paths=await contextPaths(c,stagingRoot),previous=await reconcile(c,paths);
   if(previous.status==='saved')return previous;
   const original=await artifact(paths.source,c.signal,c.outputHash);
   await verifyClaim(c);
   await createIntent(paths.intent,{version:1,key:c.key,name:paths.name,outputHash:c.outputHash,bytes:original.bytes,parentId:REVIEW_STAGING_ID});
   await verifyClaim(c);
   await copyNoReplace(paths.source,paths.output,{signal:c.signal,expected:c.outputHash});
   return waitCloud(c,paths);
  }
 };
}
