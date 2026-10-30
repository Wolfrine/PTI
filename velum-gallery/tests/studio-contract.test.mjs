import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJob,validateJob,workerOnline,deviceApproved,devicePending,deviceCanQueue,MODEL_IDS,JOB_TTL,modelReferenceLimit} from '../studio-contract.mjs';
import {PC_DEVICE_UID} from '../device-config.mjs';
const input={model:'flux2-klein-fp8',prompt:'  Fictional adult, sheer silk.\nSensual lighting.  ',seed:42,consent:true};
test('raw wording and whitespace survive submission exactly',()=>{
  const job=makeJob(input,1000);
  assert.equal(job.prompt,input.prompt); assert.equal(job.seed,42); assert.equal(job.expiresAt,1000+7*24*60*60*1000);
  assert.equal(job.schemaVersion,2); assert.equal(job.deviceUid,PC_DEVICE_UID); assert.equal(JOB_TTL,604800000);
  assert.equal(job.negative,undefined); assert.equal(job.enhancedPrompt,undefined);
});
test('only four architectures and bounded explicit settings are accepted',()=>{
  assert.equal(MODEL_IDS.length,4);
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
 for(const model of MODEL_IDS.filter(id=>id!=='flux2-klein-fp8'))assert.equal(modelReferenceLimit(updated,model),1);
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
