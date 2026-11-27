// Local preparation primitives for ordinary authorized image edits.
// No inference invocation, new credential, network access, or admission changes.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {open,stat,lstat,realpath,link,rm} from 'node:fs/promises';
import {engineProfile} from './engine-profile.mjs';
import {AutoEditFault} from './auto-edit-runner.mjs';
import {AUTO_EDIT_LIMITS,SOURCE_FOLDERS,isAutoId,isDriveId,isHash} from './auto-edit-contract.mjs';

const HERE=path.dirname(fileURLToPath(import.meta.url));
const RUNTIME_ROOT='H:\\Workspace\\Generated\\Velum\\auto-edit-v1';
const MAX_BYTES=AUTO_EDIT_LIMITS.imageBytes;
const PROBE_TIMEOUT=20000;
const SOURCE_MIMES=new Set(['image/png','image/jpeg']);
const CHECK_NAMES=new Set(['parent-identity','ram-available','disk-f-free','disk-h-free','elapsed','vram-used','gpu-temperature','query-parent','query-ram','query-disk-f','query-disk-h','query-gpu']);
const fault=(code,scope='batch')=>new AutoEditFault(code,scope);
function need(value,code,scope){if(!value)throw fault(code,scope);}
function alive(signal){if(signal?.aborted)throw fault('execution-interrupted');}
const samePath=(a,b)=>a.toLowerCase()===b.toLowerCase();
const md5Valid=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
const presentHash=s=>s!==null&&s!==undefined;

// Use the existing Qwen diagnostics module and pinned Python environment.
// No torch import, model load or change to the existing thresholds.
const RESOURCE_PROBE=[
 'import json, os, sys, time, psutil',
 'from qwen_diagnostics import collect, evaluate',
 'pid = int(sys.argv[1])',
 'parent = psutil.Process(pid)',
 'if os.getppid() != pid: raise RuntimeError("parent-identity")',
 'sample = collect(psutil, pid, parent.create_time(), time.monotonic())',
 'result = evaluate(sample, startup=sys.argv[2] == "startup")',
 'keys = ("ramAvailableBytes","ramTotalBytes","diskFreeFBytes","diskFreeHBytes","vramUsedMiB","gpuTempC")',
 'values = {k:sample["observed"].get(k) for k in keys}',
 'print(json.dumps({"failed":result["failed"],"values":values},allow_nan=False))'
].join('\n');

export async function probeAutoEditResources({startup=true,signal}={}){
 need(process.platform==='win32','windows-required');
 alive(signal);
 const python=engineProfile('qwen-image-2.1').python;
 const output=await new Promise((resolve,reject)=>{
  execFile(python,['-B','-c',RESOURCE_PROBE,String(process.pid),startup?'startup':'runtime'],
   {cwd:HERE,windowsHide:true,shell:false,encoding:'utf8',timeout:PROBE_TIMEOUT,maxBuffer:8192,signal},
   (error,stdout)=>error?reject(fault(signal?.aborted?'execution-interrupted':'resource-probe-unavailable')):resolve(stdout));
 });
 let value;
 try{value=JSON.parse(output);}catch{throw fault('resource-probe-unavailable');}
 need(value&&Array.isArray(value.failed)&&value.failed.every(x=>CHECK_NAMES.has(x))&&value.values&&typeof value.values==='object','resource-probe-invalid');
 const readings={};
 for(const key of ['ramAvailableBytes','ramTotalBytes','diskFreeFBytes','diskFreeHBytes','vramUsedMiB','gpuTempC']){
  const n=value.values[key];readings[key]=typeof n==='number'&&Number.isFinite(n)&&n>=0?n:null;
 }
 // An unavailable required reading is never a successful check.
 need(value.failed.length>0||Object.values(readings).every(x=>x!==null),'resource-probe-invalid');
 return {ready:value.failed.length===0,failed:value.failed,readings};
}
export async function guardAutoEditStage({signal,checkClaim}={}){
 need(typeof checkClaim==='function','claim-check-required');
 alive(signal);
 const c=await checkClaim();
 need(c?.command==='run','execution-interrupted');
 const result=await probeAutoEditResources({startup:true,signal});
 if(!result.ready){
  const error=fault('resource-'+result.failed[0]);
  error.predicates=result.failed;error.readings=result.readings;throw error;
 }
 alive(signal);
 const current=await checkClaim();
 need(current?.command==='run','execution-interrupted');
 return result;
}

// Source identities must come from the owner's independently authenticated
// Drive metadata and authorization provider. A filename, mount path or folder
// membership alone is not a sufficient identity/authorization receipt.
function validateSource(source,record){
 need(source?.authorized===true&&isDriveId(source.fileId)&&Object.values(SOURCE_FOLDERS).includes(source.folderId)&&SOURCE_MIMES.has(source.mime),'invalid-source','item');
 need(record?.verified===true&&record.authorized===true&&record.trashed===false&&record.fileId===source.fileId&&record.folderId===source.folderId&&record.mime===source.mime,'source-authorization-or-identity-changed','item');
 need(Number.isSafeInteger(record.bytes)&&record.bytes>=16&&record.bytes<=MAX_BYTES,'invalid-source-size','item');
 const sha256=record.sha256??null,md5=record.md5??null;
 need(!presentHash(sha256)||isHash(sha256),'source-checksum-invalid','item');
 need(!presentHash(md5)||md5Valid(md5),'source-checksum-invalid','item');
 need(sha256!==null||md5!==null,'independent-drive-checksum-required');
 if(source.sha256&&sha256)need(source.sha256===sha256,'source-identity-changed','item');
 return {fileId:source.fileId,folderId:source.folderId,mime:source.mime,bytes:record.bytes,sha256:sha256??source.sha256??null,md5,localPath:record.localPath,authorized:true,trashed:false};
}
async function directChild(root,file){
 need(path.isAbsolute(root)&&path.isAbsolute(file)&&samePath(path.dirname(path.resolve(file)),path.resolve(root)),'source-path-outside-approved-folder');
 const [realRoot,actual]=await Promise.all([realpath(root),realpath(file)]);
 need(samePath(path.dirname(actual),realRoot),'source-path-outside-approved-folder');
 const info=await lstat(file);
 need(info.isFile()&&!info.isSymbolicLink(),'invalid-source-file','item');
 return file;
}
async function checkedTarget(targetPath,batchId,itemId,mime){
 need(isAutoId(batchId)&&/^item-\d{3}$/.test(itemId),'invalid-batch-identity');
 const expected=path.join(RUNTIME_ROOT,batchId,itemId,mime==='image/png'?'source.png':'source.jpg');
 need(path.isAbsolute(targetPath)&&samePath(path.resolve(targetPath),path.resolve(expected)),'invalid-local-source-target');
 const dir=path.dirname(expected),root=await realpath(RUNTIME_ROOT);
 const info=await lstat(dir);
 need(info.isDirectory()&&!info.isSymbolicLink()&&samePath(await realpath(dir),path.join(root,batchId,itemId)),'unsafe-runtime-directory');
 return expected;
}
async function inspectFile(filename,{signal,writeHandle,expected}){
 alive(signal);
 const info=await lstat(filename);
 need(info.isFile()&&!info.isSymbolicLink()&&info.size===expected.bytes&&info.size<=MAX_BYTES,'source-byte-size-mismatch','item');
 const handle=await open(filename,'r');
 const sha=createHash('sha256'),md5=createHash('md5'),buffer=Buffer.alloc(256*1024);
 let total=0,header=null;
 try{
  const before=await handle.stat();
  need(before.isFile()&&before.size===expected.bytes,'source-byte-size-mismatch','item');
  while(total<expected.bytes){
   alive(signal);
   const {bytesRead}=await handle.read(buffer,0,Math.min(buffer.length,expected.bytes-total),total);
   need(bytesRead>0,'source-copy-incomplete','item');
   const part=buffer.subarray(0,bytesRead);
   if(header===null)header=Buffer.from(part.subarray(0,8));
   sha.update(part);md5.update(part);
   if(writeHandle){
    let offset=0;
    while(offset<part.length){
     const {bytesWritten}=await writeHandle.write(part,offset,part.length-offset,total+offset);
     need(bytesWritten>0,'source-copy-incomplete');offset+=bytesWritten;
    }
   }
   total+=bytesRead;
  }
  const after=await handle.stat();
  need(before.size===after.size&&before.mtimeMs===after.mtimeMs,'source-changed-during-read','item');
 }finally{await handle.close();}
 const sha256=sha.digest('hex'),md5sum=md5.digest('hex');
 need(total===expected.bytes&&(!expected.sha256||expected.sha256===sha256)&&(!expected.md5||expected.md5===md5sum),'source-checksum-mismatch','item');
 const png=header?.equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=header?.[0]===255&&header?.[1]===216&&header?.[2]===255;
 need(expected.mime==='image/png'?png:jpeg,'source-format-mismatch','item');
 return {mime:expected.mime,bytes:total,sha256};
}

// Reads original bytes only. The trusted local resolver is deliberately
// supplied at installation; never discover or guess private filenames.
export function createVerifiedOriginalReader({folders,lookup}){
 need(process.platform==='win32','windows-required');
 need(folders&&typeof lookup==='function','drive-resolver-required');
 const roots=new Map();
 for(const folderId of Object.values(SOURCE_FOLDERS)){
  const root=folders[folderId];
  need(typeof root==='string'&&path.isAbsolute(root)&&path.parse(root).root.toLowerCase()==='j:\\','drive-folder-mapping-required');
  roots.set(folderId,path.resolve(root));
 }
 const resolve=async({source,batchId,itemId,signal})=>{
  alive(signal);
  const entry=validateSource(source,await lookup({fileId:source.fileId,folderId:source.folderId,batchId,itemId,signal}));
  need(typeof entry.localPath==='string','drive-file-mapping-unavailable');
  entry.localPath=await directChild(roots.get(entry.folderId),entry.localPath);
  return entry;
 };
 return {
  async verifySource(context){
   const x=await resolve(context);
   if(context.sourceHash){
    need(isHash(context.sourceHash)&&(!x.sha256||x.sha256===context.sourceHash),'source-identity-changed','item');
    const cached=await checkedTarget(context.sourcePath,context.batchId,context.itemId,context.source.mime);
    await inspectFile(cached,{signal:context.signal,expected:{...x,sha256:context.sourceHash}});
   }
   return {fileId:x.fileId,folderId:x.folderId,mime:x.mime,authorized:true,trashed:false};
  },
  async download(context){
   const {source,batchId,itemId,signal,checkClaim}=context;
   need(typeof checkClaim==='function','claim-check-required');
   const c=await checkClaim();need(c?.command==='run','execution-interrupted');
   const entry=await resolve(context);
   const target=await checkedTarget(context.targetPath,batchId,itemId,source.mime);
   try{
    await lstat(target);
    // A prior verified copy can be reused, never overwritten.
    return await inspectFile(target,{signal,expected:entry});
   }catch(error){if(error?.code!=='ENOENT')throw error;}
   const temp=path.join(path.dirname(target),'.original-'+randomUUID()+'.tmp');
   let handle=null;
   try{
    handle=await open(temp,'wx',0o600);
    const result=await inspectFile(entry.localPath,{signal,writeHandle:handle,expected:entry});
    await handle.sync();await handle.close();handle=null;
    alive(signal);
    const current=await checkClaim();need(current?.command==='run','execution-interrupted');
    // No replace operation. NTFS H: hard-link creation is atomic and must
    // fail if a competing or previously completed copy already exists.
    try{await link(temp,target);}
    catch(error){if(error?.code!=='EEXIST')throw error;}
    const checked=await inspectFile(target,{signal,expected:{...entry,sha256:result.sha256}});
    return checked;
   }finally{
    if(handle)await handle.close().catch(()=>{});
    await rm(temp,{force:true}).catch(()=>{});
   }
  }
 };
}
