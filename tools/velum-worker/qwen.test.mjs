import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {mkdtemp,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {makeJob,QWEN_MODEL,MODEL_IDS} from '../../velum-gallery/studio-contract.mjs';
import {engineProfile,qwenInstalled,QWEN_WEIGHTS,QWEN_REVISION,workerCapabilities} from './engine-profile.mjs';
import {downloadReferences} from './reference-input.mjs';

test('only Qwen selects its isolated installed interpreter, adapter, F output and longer bounded timeout',()=>{
 const qwen=engineProfile(QWEN_MODEL),legacy=engineProfile('realvis-dynamic');
 assert.match(qwen.python,/velum-qwen21-research-20261103/);assert.match(qwen.script,/infer-qwen.py$/);assert.match(qwen.outputRoot,/[\\/]velum-worker[\\/]\.runtime[\\/]qwen21$/);if(process.platform==='win32')assert.match(qwen.outputRoot,/^[Ff]:/);
 assert.equal(qwen.timeoutMs,7200000);assert.equal(qwen.parentTimeoutMs,7230000);
 for(const model of MODEL_IDS.filter(model=>model!==QWEN_MODEL))assert.deepEqual(engineProfile(model),legacy);
 assert.equal(legacy.timeoutMs,1800000);assert.equal(legacy.parentTimeoutMs,1830000);
});
test('Qwen installation detection fails closed for missing/changed weights, runtime revision or native node',async()=>{
 const statFile=async filename=>({isFile:()=>true,size:Object.entries(QWEN_WEIGHTS).find(([relative])=>filename.endsWith(relative.replaceAll('/',path.sep)))?.[1]??0});
 const read=async filename=>filename.endsWith('HEAD')?QWEN_REVISION:'class TextEncodeQwenImage21(\nclass QwenImage21Cache(';
 assert.equal(await qwenInstalled({statFile,read}),true);
 assert.equal(await qwenInstalled({statFile:async()=>({isFile:()=>true,size:1}),read}),false);
 assert.equal(await qwenInstalled({statFile,read:async()=> 'wrong revision'}),false);
 assert.equal(await qwenInstalled({statFile,read:async filename=>filename.endsWith('HEAD')?QWEN_REVISION:'old nodes'}),false);
 const capabilities=workerCapabilities(MODEL_IDS,true);assert.equal(capabilities.qwenMaxReferences,10);assert.equal(capabilities.promptSchema,4);assert.equal(capabilities.referenceLimits['realvis-dynamic'],1);
 assert.equal(workerCapabilities([],true).referenceModels.includes(QWEN_MODEL),false);
});
test('schema4 requires every immutable ready manifest before any reference chunks; exact cached inputs remain reusable',async()=>{
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(1024,9)]);
 const reference={index:0,mime:'image/png',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),width:512,height:768,chunks:1,source:{kind:'file',id:'fixture',name:'Fixture'}};
 const job={...makeJob({model:QWEN_MODEL,prompt:'Keep the subject.',seed:1,consent:true,references:[reference]}),status:'queued',inputsReady:true};
 const root=await mkdtemp(path.join(process.cwd(),'.qwen-reference-test-'));let reads=0;
 const ready=Object.fromEntries(['index','sha256','bytes','chunks'].map(key=>[key,reference[key]]));
 const fetchChunk=async(_,index)=>{reads++;return {index,data:bytes.toString('base64')};};
 try{
  await assert.rejects(downloadReferences('fixture',job,{root,fetchChunk}),/invalid-reference/);assert.equal(reads,0);
  for(const value of [{...ready,sha256:'0'.repeat(64)},{...ready,complete:true},{index:0}])await assert.rejects(downloadReferences('fixture',job,{root,fetchChunk,fetchManifest:async()=>value}),/invalid-reference/);
  assert.equal(reads,0);
  await downloadReferences('fixture',job,{root,fetchChunk,fetchManifest:async()=>ready});assert.equal(reads,1);
  await downloadReferences('fixture',job,{root,fetchChunk,fetchManifest:async()=>ready});assert.equal(reads,1);
 }finally{await rm(root,{recursive:true,force:true});}
});
