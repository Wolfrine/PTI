import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJob,validateJob,workerOnline,deviceApproved,devicePending,deviceCanQueue,MODEL_IDS,JOB_TTL,modelReferenceLimit,QWEN_MODEL,composeEffectivePrompt} from '../studio-contract.mjs';
import {PC_DEVICE_UID} from '../device-config.mjs';
import {readFile} from 'node:fs/promises';
import {workerCapabilities} from '../../tools/velum-worker/engine-profile.mjs';
import {supportsRecovery} from '../studio-recovery.mjs';
const input={model:'flux2-klein-fp8',prompt:'  Fictional adult, sheer silk.\nSensual lighting.  ',seed:42,consent:true};

test('current worker release stays online and permits every installed model, reference limit and recovery',async()=>{
 const {version}=JSON.parse(await readFile(new URL('../../tools/velum-worker/package.json',import.meta.url),'utf8'));
 const now=Date.now(),binding={deviceUid:PC_DEVICE_UID,status:'approved'};
 const status={deviceUid:PC_DEVICE_UID,version,state:'idle',activeJob:'',updatedAt:now,installed:MODEL_IDS,capabilities:workerCapabilities(MODEL_IDS,true)};
 assert.equal(workerOnline(status,now),true);assert.equal(supportsRecovery(status),true);
 for(const model of MODEL_IDS){assert.equal(deviceCanQueue(binding,status,model),true,model);assert.equal(modelReferenceLimit(status,model),model===QWEN_MODEL?10:model==='flux2-klein-fp8'?2:1);}
 const unknown={...status,version:'2.3.2'};assert.equal(workerOnline(unknown,now),false);assert.equal(supportsRecovery(unknown),false);
 for(const model of MODEL_IDS)assert.equal(deviceCanQueue(binding,unknown,model),false);
});
test('raw wording and whitespace survive submission exactly',()=>{
  const job=makeJob(input,1000);
  assert.equal(job.prompt,input.prompt); assert.equal(job.seed,42); assert.equal(job.expiresAt,1000+7*24*60*60*1000);
  assert.equal(job.schemaVersion,2); assert.equal(job.deviceUid,PC_DEVICE_UID); assert.equal(JOB_TTL,604800000);
  assert.equal(job.negative,undefined); assert.equal(job.enhancedPrompt,undefined);
});
test('only five installed architectures and bounded explicit settings are accepted',()=>{
  assert.equal(MODEL_IDS.length,5);
  for(const model of MODEL_IDS) assert.equal(makeJob({...input,model}).model,model);
  for(const invalid of [{model:'remote'},{prompt:' '},{prompt:'a'.repeat(6001)},{seed:-1},{seed:1.2},{consent:false}]) assert.throws(()=>makeJob({...input,...invalid}));
  assert.throws(()=>validateJob({...makeJob(input),width:2048}));
  assert.throws(()=>validateJob({...makeJob(input),deviceUid:'another-PC'}));
  assert.throws(()=>validateJob({...makeJob(input),schemaVersion:1}));
  assert.throws(()=>validateJob({...makeJob(input),expiresAt:Date.now()+900000}));
});
test('installed weights do not imply a fresh worker heartbeat',()=>{
  const status={state:'idle',updatedAt:1000,installed:MODEL_IDS,deviceUid:PC_DEVICE_UID,version:'2.0.0'};
  assert.equal(workerOnline(status,2000),true); assert.equal(workerOnline(status,92000),false);
  assert.equal(workerOnline({...status,state:'offline'},2000),false);
  assert.equal(workerOnline({...status,updatedAt:40000},1000),false);
  assert.equal(workerOnline({...status,deviceUid:'another-PC'},2000),false);
  assert.equal(workerOnline({...status,version:'1.0.0'},2000),false);
});
test('capability heartbeat gates edit models without breaking old FLUX worker',()=>{
 const legacy={version:'2.0.0',capabilities:{referenceModel:'flux2-klein-fp8',maxReferences:2}};
 assert.equal(modelReferenceLimit(legacy,'flux2-klein-fp8'),2);
 assert.equal(modelReferenceLimit(legacy,'realvis-dynamic'),0);
 const updated={version:'2.1.0',capabilities:{referenceModels:MODEL_IDS}};
 assert.equal(modelReferenceLimit(updated,'flux2-klein-fp8'),2);
 for(const model of MODEL_IDS.filter(id=>id!=='flux2-klein-fp8'&&id!==QWEN_MODEL))assert.equal(modelReferenceLimit(updated,model),1);
 assert.equal(modelReferenceLimit(updated,QWEN_MODEL),0);
 const qwen={version:'2.3.0',capabilities:{referenceModels:MODEL_IDS,qwenMaxReferences:10}};
 assert.equal(modelReferenceLimit(qwen,QWEN_MODEL),10);
 assert.equal(modelReferenceLimit({...qwen,capabilities:{...qwen.capabilities,qwenMaxReferences:16}},QWEN_MODEL),0);
});
const ref=index=>({index,mime:'image/png',bytes:1000,sha256:index.toString(16).padStart(64,'0'),width:512,height:768,chunks:1,source:{kind:'drive',id:`reference-${index}`,name:`Reference ${index}`},role:'subject'});
test('Qwen schema4 preserves exact prompt and all ten distinct actual references with native canvas geometry',()=>{
 for(const count of [0,1,10]){
  const job=makeJob({...input,model:QWEN_MODEL,references:Array.from({length:count},(_,index)=>ref(index))},1000);
  assert.equal(job.schemaVersion,4);assert.equal(job.prompt,input.prompt);assert.equal(job.effectivePrompt,input.prompt);
  assert.equal(job.references.length,count);assert.equal(job.width,count?832:768);assert.equal(job.height,count?1248:1024);
 }
 assert.throws(()=>makeJob({...input,model:QWEN_MODEL,references:Array.from({length:11},(_,index)=>ref(index))}));
 assert.throws(()=>makeJob({...input,model:QWEN_MODEL,references:[ref(0),{...ref(1),sha256:ref(0).sha256}]}),/distinct/);
 assert.throws(()=>makeJob({...input,model:QWEN_MODEL,references:[ref(0),{...ref(1),source:ref(0).source}]}),/distinct/);
 assert.throws(()=>makeJob({...input,model:QWEN_MODEL,references:[{...ref(0),width:1,height:1024}]}),/aspect ratio/);
 assert.throws(()=>makeJob({...input,model:QWEN_MODEL,effectivePrompt:`${input.prompt} hidden suffix`}),/effective/);
 const job=makeJob({...input,model:QWEN_MODEL});assert.throws(()=>validateJob({...job,schemaVersion:3}));
 assert.throws(()=>validateJob({...job,recordType:'historical-import'}));
});
test('explicit pose lineage counts the actual image in the model cap and composes reviewable exact text',()=>{
 const pose={referenceIndex:1,catalogId:'test-pose',fileId:'pose-file',category:'standing',label:'Standing',instruction:'Use reference image 2 for the standing pose.',mode:'image'};
 const references=[ref(0),{...ref(1),role:'pose',source:{kind:'drive',id:pose.fileId,name:'Pose'}}];
 for(const model of ['flux2-klein-fp8',QWEN_MODEL]){
  const job=makeJob({...input,model,references,pose});assert.equal(job.schemaVersion,4);assert.equal(job.effectivePrompt,composeEffectivePrompt(input.prompt,pose));assert.deepEqual(job.pose,pose);
 }
 for(const model of ['realvis-dynamic','realistic-sd15','zimage-nvfp4'])assert.throws(()=>makeJob({...input,model,references,pose}),/fewer/);
 const text={...pose,referenceIndex:-1,mode:'text'};
 assert.equal(makeJob({...input,references:[ref(0)],pose:text}).pose.mode,'text');
 for(const invalid of [{...pose,referenceIndex:0},{...pose,fileId:'wrong-file'},{...pose,mode:'text'},{...pose,referenceIndex:-1},{...pose,instruction:''}])assert.throws(()=>makeJob({...input,references,pose:invalid}));
 assert.throws(()=>makeJob({...input,references,effectivePrompt:input.prompt}),/lineage/);
 const old=makeJob(input);assert.throws(()=>validateJob({...old,effectivePrompt:input.prompt}));
 const oldRef=makeJob({...input,references:[{...ref(0),role:undefined}]});assert.equal(oldRef.schemaVersion,3);
});
test('remote device approval expires once but approved identity persists until revoked',()=>{
  const binding={deviceUid:PC_DEVICE_UID,status:'pending',createdAt:1000,expiresAt:2000};
  assert.equal(devicePending(binding,1999),true);
  assert.equal(devicePending(binding,2000),false);
  assert.equal(deviceApproved(binding),false);
  assert.equal(deviceApproved({...binding,status:'approved'}),true);
  assert.equal(devicePending({...binding,status:'approved'},1500),false);
  assert.equal(deviceApproved({...binding,status:'revoked'}),false);
  assert.equal(deviceApproved({...binding,status:'approved',deviceUid:'another-PC'}),false);
});
test('approved PC accepts offline queue using verified installed choices, then reconnects',()=>{
  const binding={deviceUid:PC_DEVICE_UID,status:'approved'};
  const offline={deviceUid:PC_DEVICE_UID,version:'2.0.0',state:'idle',updatedAt:1000,installed:MODEL_IDS};
  assert.equal(workerOnline(offline,100000),false);
  assert.equal(deviceCanQueue(binding,offline,input.model),true);
  const queued=makeJob(input,100000);
  assert.equal(queued.status,'queued'); assert.equal(queued.prompt,input.prompt);
  assert.equal(workerOnline({...offline,updatedAt:100001},100001),true);
  assert.equal(deviceCanQueue({...binding,status:'pending'},offline,input.model),false);
  assert.equal(deviceCanQueue({...binding,status:'revoked'},offline,input.model),false);
  assert.equal(deviceCanQueue(binding,{...offline,deviceUid:'another-PC'},input.model),false);
  assert.equal(deviceCanQueue(binding,{...offline,installed:[]},input.model),false);
  assert.equal(deviceCanQueue(binding,{...offline,version:'1.0.0'},input.model),false);
});
