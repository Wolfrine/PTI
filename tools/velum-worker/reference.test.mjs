import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {referenceBytes,downloadReferences,thumbnailPayload} from './reference-input.mjs';
import {makeJob,REFERENCE_LIMITS} from '../../velum-gallery/studio-contract.mjs';
import {runnable} from './core.mjs';

const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(800000,9)]);
const base64=bytes.toString('base64'),chunks=[base64.slice(0,600000),base64.slice(600000)];
const manifest={index:0,mime:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),width:512,height:512,chunks:2,source:{kind:'studio',id:'original-job',name:'Original preserved'}};
const request={model:'flux2-klein-fp8',prompt:'  Keep the red object.\nChange only its background.  ',seed:88,consent:true,references:[manifest],parentJobId:'original-job'};
test('reference queue waits for input completion, preserves original provenance and keeps legacy work valid',()=>{
 const uploading=makeJob(request,1000);assert.equal(uploading.schemaVersion,3);assert.equal(uploading.status,'uploading');assert.equal(uploading.inputsReady,false);
 assert.equal(runnable(uploading,2000),false);assert.equal(runnable({...uploading,inputsReady:true,status:'queued'},2000),true);
 assert.equal(uploading.prompt,request.prompt);assert.equal(uploading.parentJobId,'original-job');assert.deepEqual(uploading.references,[manifest]);
 assert.equal(uploading.width,REFERENCE_LIMITS.width);assert.equal(uploading.height,REFERENCE_LIMITS.height);
 const legacy=makeJob({...request,references:[],parentJobId:''},1000);assert.equal(legacy.schemaVersion,2);assert.equal(runnable(legacy,2000),true);
 assert.equal(runnable({...legacy,references:[manifest]},2000),false);
});
test('capability contract rejects other models, over-budget references, injected provenance and unready queue',()=>{
 for(const invalid of [{model:'zimage-nvfp4'},{references:[manifest,{...manifest,index:1},{...manifest,index:2}]},{references:[{...manifest,width:2048}]},{references:[{...manifest,bytes:2097153}]},{references:[{...manifest,sha256:'a'.repeat(63)}]},{references:[{...manifest,chunks:1}]},{references:[{...manifest,source:{...manifest.source,path:'C:/forbidden'}}]},{parentJobId:'../escape'}])assert.throws(()=>makeJob({...request,...invalid},1000));
 assert.equal(runnable({...makeJob(request,1000),status:'queued'},2000),false);
});
test('reference chunks bind exact bytes, MIME magic, hash and bounded transport',()=>{
 assert.ok(referenceBytes(manifest,chunks).equals(bytes));
 for(const changed of [{...manifest,sha256:'a'.repeat(64)},{...manifest,mime:'image/jpeg'},{...manifest,bytes:manifest.bytes-1}])assert.throws(()=>referenceBytes(changed,chunks));
 assert.throws(()=>referenceBytes(manifest,[chunks[1],chunks[0]]));assert.throws(()=>referenceBytes(manifest,[...chunks,'A'.repeat(600001)]));
});
test('offline input preparation resumes only missing references and never overwrites originals',async()=>{
 const root=await mkdtemp(path.join(process.cwd(),'.velum-reference-test-')),id='fixture-job',job={...makeJob(request,1000),status:'queued',inputsReady:true};
 const file=path.join(root,id,'inputs','0.png');let calls=0;
 try{
  await assert.rejects(downloadReferences(id,job,{root,fetchChunk:async(_,index)=>{calls++;if(index===1)throw new Error('network-offline');return {index,data:chunks[index]};}}),/network-offline/);
  await assert.rejects(readFile(file),{code:'ENOENT'});
  await downloadReferences(id,job,{root,fetchChunk:async(_,index)=>{calls++;return {index,data:chunks[index]};}});
  assert.ok((await readFile(file)).equals(bytes));const fetched=calls;
  await downloadReferences(id,job,{root,fetchChunk:async()=>assert.fail('cached exact input must survive restart')});assert.equal(calls,fetched);
  await assert.rejects(downloadReferences('bad/escape',job,{root}),/invalid-job/);
  await assert.rejects(downloadReferences(id,job,{root,approved:async()=>{throw new Error('revoked');},fetchChunk:async()=>assert.fail()}),/revoked/);
 }finally{await unlink(file).catch(()=>{});await rmdir(path.join(root,id,'inputs')).catch(()=>{});await rmdir(path.join(root,id)).catch(()=>{});await rmdir(root);}
});
test('thumbnail transport stays small and separate from full originals',()=>{
 const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(1000,4)]);
 const value=thumbnailPayload(jpeg,{id:'job',width:341,height:512,createdAt:1000});assert.equal(value.bytes,jpeg.length);assert.equal(value.mime,'image/jpeg');assert.equal(value.jobId,'job');
 assert.throws(()=>thumbnailPayload(jpeg,{id:'../job',width:341,height:512,createdAt:1000}));assert.throws(()=>thumbnailPayload(Buffer.alloc(65537),{id:'job',width:512,height:512,createdAt:1000}));
});
