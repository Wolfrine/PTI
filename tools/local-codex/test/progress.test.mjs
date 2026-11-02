import {test} from 'node:test';
import assert from 'node:assert/strict';
import {reportChangedSnapshot} from '../src/progress.mjs';

test('telemetry-only changes publish with real progress and final counters, never as standalone live writes',async()=>{
  const claim={},sent=[],send=async value=>sent.push(value);
  const first={status:'running',messages:[],telemetry:{commands:0}};
  await reportChangedSnapshot(claim,first,send);
  assert.equal(await reportChangedSnapshot(claim,{...first,telemetry:{commands:10}},send),false);
  assert.equal(await reportChangedSnapshot(claim,{...first,messages:[{text:'Progress'}],telemetry:{commands:10}},send),true);
  const final={status:'completed',final:'Done',telemetry:{commands:11}};
  assert.equal(await reportChangedSnapshot(claim,final,send),true);
  assert.equal(sent.at(-1).telemetry.commands,11);
});

test('unchanged progress stays suppressed across restart; messages, approvals and completion publish',async()=>{
  let claim={id:'fixture',generation:1};const reports=[];const send=async value=>reports.push(value);
  const running={status:'running',messages:[]};
  assert.equal(await reportChangedSnapshot(claim,running,send),true);
  claim=JSON.parse(JSON.stringify(claim));
  assert.equal(await reportChangedSnapshot(claim,structuredClone(running),send),false);
  for(const snapshot of [{...running,messages:[{text:'Progress'}]},{status:'waiting_for_user',pending:[{id:'human-approval'}]},{status:'completed',final:'Finished'}]){
    assert.equal(await reportChangedSnapshot(claim,snapshot,send),true);
  }
  assert.equal(reports.length,4);
  assert.equal(await reportChangedSnapshot({id:'fixture',generation:2},running,send),true);
});

test('failed reports retry until acknowledged',async()=>{
  const claim={id:'fixture',generation:1},snapshot={status:'completed',final:'Must not be lost'};let attempts=0;
  const send=async()=>{if(++attempts===1)throw Error('connection lost');};
  await assert.rejects(reportChangedSnapshot(claim,snapshot,send),/connection lost/);
  assert.equal(claim.reportedSnapshot,undefined);
  assert.equal(await reportChangedSnapshot(claim,snapshot,send),true);
  assert.equal(await reportChangedSnapshot(claim,snapshot,send),false);
  assert.equal(attempts,2);
});
