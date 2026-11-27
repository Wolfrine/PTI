// Private metadata broker + existing Google Drive for desktop connection.
// Only the worker's pinned Firebase identity is sent to the existing service;
// original and edited bytes stay on the PC/Drive mount, not in Firestore.
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {open,lstat,readFile,realpath,link,rename,rm} from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {createVerifiedOriginalReader} from './auto-edit-local.mjs';
import {AutoEditFault} from './auto-edit-runner.mjs';
import {SOURCE_FOLDERS,REVIEW_STAGING_ID,AUTO_EDIT_LIMITS,isAutoId,isDriveId,isHash,validateDeliveryReceipt} from './auto-edit-contract.mjs';

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
// Read exactly the bounded, immutable H: artifact into memory once per
// delivery attempt. Never append bytes from an unverified/changed source.
async function deliveryBytes(file,signal,expected){
 alive(signal);
 const before=await lstat(file);
 need(before.isFile()&&!before.isSymbolicLink()&&before.size>=16&&before.size<=AUTO_EDIT_LIMITS.imageBytes&&same(path.resolve(file),await realpath(file)),'invalid-delivery-artifact');
 const handle=await open(file,'r');
 try{
  const current=await handle.stat();
  need(sameStat(before,current),'delivery-source-changed');
  const data=Buffer.allocUnsafe(current.size);
  let offset=0;
  while(offset<data.length){
   alive(signal);
   const {bytesRead}=await handle.read(data,offset,Math.min(262144,data.length-offset),offset);
   need(bytesRead>0,'delivery-source-changed');offset+=bytesRead;
  }
  need(sameStat(current,await handle.stat())&&sameStat(current,await lstat(file))&&hash(data)===expected,'delivery-byte-identity-mismatch');
  return data;
 }finally{await handle.close();}
}
function sameStat(a,b){
 return a.isFile()&&b.isFile()&&a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeMs===b.mtimeMs;
}
async function mountedFile(file,maximum){
 const info=await lstat(file);
 need(info.isFile()&&!info.isSymbolicLink()&&info.size>=0&&info.size<=maximum&&same(path.resolve(file),await realpath(file)),'delivery-local-file-invalid');
 return info;
}
async function verifyPrefix(handle,initial,data,signal){
 const buffer=Buffer.allocUnsafe(262144);
 let offset=0;
 while(offset<initial.size){
  alive(signal);
  const amount=Math.min(buffer.length,initial.size-offset);
  const {bytesRead}=await handle.read(buffer,0,amount,offset);
  need(bytesRead>0&&buffer.subarray(0,bytesRead).equals(data.subarray(offset,offset+bytesRead)),'delivery-local-prefix-mismatch');
  offset+=bytesRead;
 }
 need(sameStat(initial,await handle.stat()),'delivery-local-file-changed');
 return offset;
}
// Open an existing partial file without truncate or replace. A valid prefix
// from the exact verified H: output is the only state eligible for continuation.
async function appendVerified(target,data,{signal,expected,create,minimumBytes=0,checkClaim}){
 alive(signal);await checkClaim();
 const before=create?null:await mountedFile(target,data.length);
 let handle;
 try{handle=await open(target,create?'wx+':'r+');}
 catch(error){if(error.code==='EEXIST'||error.code==='ENOENT')throw fault('delivery-outcome-unknown');throw error;}
 try{
  const initial=await handle.stat();
  const onPath=await mountedFile(target,data.length);
  need(sameStat(initial,onPath)&&(!before||sameStat(before,initial))&&initial.size>=minimumBytes&&(!create||initial.size===0),'delivery-local-file-changed');
  let offset=await verifyPrefix(handle,initial,data,signal);
  await checkClaim();alive(signal);
  need(sameStat(initial,await handle.stat())&&sameStat(initial,await mountedFile(target,data.length)),'delivery-local-file-changed');
  while(offset<data.length){
   alive(signal);
   const {bytesWritten}=await handle.write(data,offset,Math.min(262144,data.length-offset),offset);
   need(bytesWritten>0,'drive-copy-incomplete');offset+=bytesWritten;
  }
  need((await handle.stat()).size===data.length,'drive-copy-incomplete');await handle.sync();
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
async function readIntent(file,c,paths,data){
 if(!await exists(file))return null;
 const st=await lstat(file);need(st.isFile()&&!st.isSymbolicLink()&&st.size<=4096,'delivery-intent-invalid');
 let v;
 try{v=JSON.parse(await readFile(file,'utf8'));}catch{throw fault('delivery-intent-invalid');}
 need(v&&[1,2].includes(v.version)&&v.key===c.key&&v.name===paths.name&&v.outputHash===c.outputHash&&v.bytes===data.length&&v.parentId===REVIEW_STAGING_ID,'delivery-intent-invalid');
 // The original version recorded intent before attempting a mount write.
 // It must be treated as potentially started, never as permission to create again.
 if(v.version===1)return {...v,version:2,phase:'started',driveFileId:null};
 need(['prepared','started'].includes(v.phase)&&(v.driveFileId===null||isDriveId(v.driveFileId)),'delivery-intent-invalid');
 return v;
}
async function writeIntent(file,value,{create=false}={}){
 const tmp=path.join(path.dirname(file),'.delivery-intent-'+randomUUID()+'.tmp');
 const handle=await open(tmp,'wx',0o600);
 try{
  await handle.writeFile(JSON.stringify(value),'utf8');await handle.sync();await handle.close();
  // H: is the protected NTFS journal; the remote mount is never renamed,
  // deleted, or replaced during recovery.
  if(create)await link(tmp,file);else await rename(tmp,file);
 }finally{await handle.close().catch(()=>{});await rm(tmp,{force:true}).catch(()=>{});}
}
async function bindFileId(intent,fileId,paths){
 need(isDriveId(fileId)&&(!intent.driveFileId||intent.driveFileId===fileId),'delivery-drive-id-conflict');
 if(intent.driveFileId!==fileId){
  const next={...intent,driveFileId:fileId};
  await writeIntent(paths.intent,next);return next;
 }
 return intent;
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
 async function cloudCheck(c,paths,data){
  const value=await broker(queue,'delivery',c);
  if(value?.status==='saved')return {status:'saved',receipt:validateDeliveryReceipt(value.receipt,{key:c.key,outputHash:c.outputHash})};
  if(value?.status==='partial'){
   const f=value.file;
   need(value.verifiedIdentity===true&&f&&f.name===paths.name&&f.parentId===REVIEW_STAGING_ID&&isDriveId(f.fileId)&&isHash(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0&&f.bytes<data.length,'drive-delivery-status-invalid');
   // This is an identity observation, NOT a delivery receipt. Check the
   // independently reported cloud bytes against the exact local prefix.
   need(hash(data.subarray(0,f.bytes))===f.sha256,'delivery-drive-prefix-mismatch');
   return {status:'partial',fileId:f.fileId,bytes:f.bytes};
  }
  need(value?.status==='not-found'&&value.confirmed===true&&value.name===paths.name&&value.parentId===REVIEW_STAGING_ID,'drive-delivery-status-invalid');
  return {status:'not-found'};
 }
 async function waitCloud(c,paths,data,intent){
  // Bounded active verification only. Preserve the observed Drive ID across
  // delayed sync and retries, and never issue a receipt for a partial file.
  for(const delay of [0,2000,5000,10000]){
   if(delay)await sleep(delay,undefined,{signal:c.signal});
   await verifyClaim(c);
   const result=await cloudCheck(c,paths,data);
   if(result.status==='saved'){
    if(intent)await bindFileId(intent,result.receipt.fileId,paths);
    return result;
   }
   if(result.status==='partial'){
    need(intent?.phase==='started','delivery-outcome-unknown');
    intent=await bindFileId(intent,result.fileId,paths);
   }
  }
  throw fault('drive-sync-not-confirmed');
 }
 async function reconcile(c,paths,data){
  await verifyClaim(c);
  let intent=await readIntent(paths.intent,c,paths,data);
  const result=await cloudCheck(c,paths,data);
  if(result.status==='saved'){
   if(intent)await bindFileId(intent,result.receipt.fileId,paths);
   return result;
  }
  const present=await exists(paths.output);
  if(!intent){
   need(result.status==='not-found'&&!present,'delivery-outcome-unknown');
   return {status:'not-started',confirmed:true};
  }
  if(intent.phase==='prepared'){
   // No remote write is allowed until the durable started marker exists.
   need(!present&&result.status==='not-found'&&!intent.driveFileId,'delivery-outcome-unknown');
   return {status:'not-started',confirmed:true};
  }
  // A started attempt may be resumed only in the existing mounted file.
  // A missing mount after an uncertain create is not evidence of absence.
  need(present,'delivery-outcome-unknown');
  const mounted=await mountedFile(paths.output,data.length);
  if(result.status==='partial'){
   intent=await bindFileId(intent,result.fileId,paths);
   need(mounted.size>=result.bytes,'delivery-mount-behind-cloud');
  }
  if(mounted.size<data.length){
   // If a previously identified cloud file disappeared, do not write.
   need(!intent.driveFileId||result.status==='partial','delivery-drive-id-unverified');
   await appendVerified(paths.output,data,{signal:c.signal,expected:c.outputHash,create:false,minimumBytes:result.bytes??0,checkClaim:()=>verifyClaim(c)});
  }else await artifact(paths.output,c.signal,c.outputHash);
  return waitCloud(c,paths,data,intent);
 }
 return {
  ...reader,
  async reconcileDelivery(c){
   const paths=await contextPaths(c,stagingRoot),data=await deliveryBytes(paths.source,c.signal,c.outputHash);
   return reconcile(c,paths,data);
  },
  async deliver(c){
   const paths=await contextPaths(c,stagingRoot),data=await deliveryBytes(paths.source,c.signal,c.outputHash);
   const previous=await reconcile(c,paths,data);
   if(previous.status==='saved')return previous;
   await verifyClaim(c);
   let intent=await readIntent(paths.intent,c,paths,data);
   if(!intent){
    intent={version:2,key:c.key,name:paths.name,outputHash:c.outputHash,bytes:data.length,parentId:REVIEW_STAGING_ID,phase:'prepared',driveFileId:null};
    await writeIntent(paths.intent,intent,{create:true});
   }
   need(intent.phase==='prepared'&&!intent.driveFileId,'delivery-outcome-unknown');
   await verifyClaim(c);
   // Persist possible side effect before exclusive create. A crash after
   // this point never authorizes a new mounted/Drive file on retry.
   intent={...intent,phase:'started'};await writeIntent(paths.intent,intent);
   await appendVerified(paths.output,data,{signal:c.signal,expected:c.outputHash,create:true,checkClaim:()=>verifyClaim(c)});
   return waitCloud(c,paths,data,intent);
  }
 };
}
