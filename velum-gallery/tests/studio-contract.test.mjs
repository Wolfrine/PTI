import test from 'node:test';
import assert from 'node:assert/strict';
import {makeJob,validateJob,workerOnline,MODEL_IDS} from '../studio-contract.mjs';
const input={model:'flux2-klein-fp8',prompt:'  Fictional adult, sheer silk.\nSensual lighting.  ',seed:42,consent:true};
test('raw wording and whitespace survive submission exactly',()=>{
  const job=makeJob(input,1000);
  assert.equal(job.prompt,input.prompt); assert.equal(job.seed,42); assert.equal(job.expiresAt,901000);
  assert.equal(job.negative,undefined); assert.equal(job.enhancedPrompt,undefined);
});
test('only four architectures and bounded explicit settings are accepted',()=>{
  assert.equal(MODEL_IDS.length,4);
  for(const model of MODEL_IDS) assert.equal(makeJob({...input,model}).model,model);
  for(const invalid of [{model:'remote'},{prompt:' '},{prompt:'a'.repeat(6001)},{seed:-1},{seed:1.2},{consent:false}]) assert.throws(()=>makeJob({...input,...invalid}));
  assert.throws(()=>validateJob({...makeJob(input),width:2048}));
});
test('installed weights do not imply a fresh worker heartbeat',()=>{
  const status={state:'idle',updatedAt:1000,installed:MODEL_IDS};
  assert.equal(workerOnline(status,2000),true); assert.equal(workerOnline(status,92000),false);
  assert.equal(workerOnline({...status,state:'offline'},2000),false);
  assert.equal(workerOnline({...status,updatedAt:40000},1000),false);
});
