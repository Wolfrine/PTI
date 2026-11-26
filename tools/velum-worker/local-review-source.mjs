import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {lstat, mkdir, open, readFile, realpath, rename, unlink} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateReference} from '../../velum-gallery/studio-contract.mjs';
import {isOriginalReviewJob} from '../../velum-gallery/auto-review-store.mjs';

const PRIVATE='1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA';
const REFERENCES='1yDt_5NSv8fDYhZvOdsihdJwKQJuTzx66';
const mountConfig='H:\\Workspace\\Runtimes\\PTI\\velum-review-vision\\review-drive.json';
const runtime=path.dirname(mountConfig);
const script=fileURLToPath(import.meta.url);
const onRuntimeDrive=value=>typeof value==='string'&&path.win32.isAbsolute(value)&&
  path.win32.parse(path.win32.normalize(value)).root.toLowerCase()==='h:\\';

export async function reviewDriveLocation() {
  try {
    const {privateRoot} = JSON.parse(await readFile(mountConfig, 'utf8'));
    if(typeof privateRoot!=='string'||!/^[a-z]:\\My Drive\\/i.test(privateRoot)||
      path.win32.normalize(privateRoot)!==privateRoot||path.win32.basename(privateRoot)!=='Private')return null;
    const canonical=await realpath(privateRoot), references=path.join(canonical,'References');
    if(canonical.toLowerCase()!==privateRoot.toLowerCase()||
      (await realpath(references)).toLowerCase()!==references.toLowerCase())return null;
    if(!(await lstat(canonical)).isDirectory()||!(await lstat(references)).isDirectory())return null;
    return {[PRIVATE]:canonical,[REFERENCES]:references};
  } catch { return null; }
}

async function verifyBytes(filename,reference,signal) {
  const info=await lstat(filename);
  if(!info.isFile()||info.size!==reference.bytes)throw new Error('invalid-reference');
  const handle=await open(filename,'r');
  const buffer=Buffer.alloc(reference.bytes+1);
  let length=0;
  try {
    const opened=await handle.stat();
    if(!opened.isFile()||opened.size!==reference.bytes||opened.ino!==info.ino)throw new Error('invalid-reference');
    while(length<buffer.length){
      signal.throwIfAborted();
      const {bytesRead}=await handle.read(buffer,length,buffer.length-length,length);
      if(!bytesRead)break;
      length+=bytesRead;
    }
  } finally {await handle.close();}
  const bytes=buffer.subarray(0,length);
  const header=reference.mime==='image/png'?Buffer.from([137,80,78,71,13,10,26,10]):Buffer.from([255,216,255]);
  if(bytes.length!==reference.bytes||!bytes.subarray(0,header.length).equals(header)||
    createHash('sha256').update(bytes).digest('hex')!==reference.sha256)throw new Error('invalid-reference');
  return bytes;
}

async function copyOriginal(id,reference,{outputRoot,signal}) {
  if(!isOriginalReviewJob(id)||!onRuntimeDrive(outputRoot))throw new Error('invalid-reference');
  try {validateReference(reference,0,true);} catch {throw new Error('invalid-reference');}
  const active=AbortSignal.any([signal,AbortSignal.timeout(90000)]);
  active.throwIfAborted();
  const directory=path.join(outputRoot,id,'inputs');
  const destination=path.join(directory,reference.mime==='image/png'?'0.png':'0.jpg');
  try {await verifyBytes(destination,reference,active);return destination;}
  catch(error){if(error.code!=='ENOENT')throw error;}
  const folders=await reviewDriveLocation(), root=folders?.[reference.source.parentId];
  if(!root)throw new Error('invalid-reference');
  let bytes;
  try {
    const source=path.join(root,reference.source.name), canonical=await realpath(source);
    if(canonical.toLowerCase()!==source.toLowerCase())throw new Error('invalid-reference');
    bytes=await verifyBytes(source,reference,active);
  } catch {active.throwIfAborted();throw new Error('invalid-reference');}
  active.throwIfAborted();
  await mkdir(directory,{recursive:true});
  const partial=destination+'.partial';
  try {
    const file=await open(partial,'wx');
    try {await file.writeFile(bytes,{signal:active});await file.sync();}finally{await file.close();}
    active.throwIfAborted();
    await rename(partial,destination);
  } finally {await unlink(partial).catch(()=>{});}
  return destination;
}

function invokeLocalDrive(request,signal,timeout) {
  return new Promise((resolve,reject)=>{
    signal.throwIfAborted();
    // Isolate DriveFS calls so an unavailable network-backed handle cannot
    // hold the serial inference queue or the manual worker startup.
    const child=spawn(process.execPath,[script],{cwd:runtime,windowsHide:true,shell:false,stdio:['pipe','pipe','ignore'],
      env:{...process.env,TEMP:runtime,TMP:runtime,TMPDIR:runtime}});
    const stop=()=>child.kill();
    const timer=setTimeout(stop,timeout);
    signal.addEventListener('abort',stop,{once:true});if(signal.aborted)stop();
    let body='';
    child.stdout.on('data',chunk=>{body+=chunk;if(body.length>128)stop();});
    child.stdin.on('error',()=>{});
    child.on('error',()=>{clearTimeout(timer);signal.removeEventListener('abort',stop);reject(new Error('invalid-reference'));});
    child.on('close',code=>{
      clearTimeout(timer);signal.removeEventListener('abort',stop);
      if(signal.aborted){reject(signal.reason);return;}
      if(code===0&&body.trim()==='verified')resolve();else reject(new Error('invalid-reference'));
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export async function reviewDriveReady() {
  try{await invokeLocalDrive({probe:true},AbortSignal.timeout(12000),12000);return true;}catch{return false;}
}

export async function readLocalReviewSource(id,reference,{outputRoot,signal}) {
  if(!isOriginalReviewJob(id)||!onRuntimeDrive(outputRoot))throw new Error('invalid-reference');
  try{validateReference(reference,0,true);}catch{throw new Error('invalid-reference');}
  const destination=path.join(outputRoot,id,'inputs',reference.mime==='image/png'?'0.png':'0.jpg');
  try{await invokeLocalDrive({id,reference,outputRoot},signal,90000);}
  finally{await unlink(destination+'.partial').catch(()=>{});}
  return destination;
}

if(process.argv[1]&&path.resolve(process.argv[1])===script){
  try{
    let body='';
    for await(const chunk of process.stdin){body+=chunk;if(body.length>8192)throw new Error('invalid-reference');}
    const request=JSON.parse(body);
    if(request.probe){if(!await reviewDriveLocation())throw new Error('invalid-reference');}
    else await copyOriginal(request.id,request.reference,{outputRoot:request.outputRoot,signal:AbortSignal.timeout(85000)});
    process.stdout.write('verified\n');
  }catch{process.exitCode=1;}
}
