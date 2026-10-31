import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTasks} from '../src/review-usage.mjs';
const now=Date.parse('2026-10-31T07:00:00Z');
const task={id:'a'.repeat(32),project:'pti',mode:'inspect',status:'completed',createdAt:'2026-10-30T07:00:00Z',updatedAt:'2026-10-30T07:01:00Z',prompt:'PRIVATE_PROMPT',final:'PRIVATE_FINAL',history:[]};
test('historical missing metrics stay unknown, completion does not certify owner acceptance, and content never enters report',()=>{
  const actual=summarizeTasks([task],{now});
  assert.equal(actual.rows[0].durationMs,null);assert.equal(actual.rows[0].observedResponseTokens,null);assert.equal(actual.rows[0].ownerOutcome,'unknown');
  assert(!JSON.stringify(actual).includes('PRIVATE_'));assert.equal(actual.coverage.ordinaryRunsWithDuration,0);
});
test('explicit acceptance runs are separate and owner verdicts bind only to matching generation',()=>{
  const runs=[{runId:'run-1',generation:1,finishedAt:task.updatedAt,status:'completed',durationMs:100,waitingMs:0,strategy:'single',purpose:'work',parentUsage:{totalTokens:400},tokenBasis:'latest-response'}];
  const localTasks={remote:task.id},remoteData={jobs:[{id:'remote',generation:2,ownerOutcome:'accepted',outcomeAt:1,outcomesHistory:[{generation:1,outcome:'needs_rework',at:0}]}],has_more:false};
  const actual=summarizeTasks([{...task,runs},{...task,id:'b'.repeat(32),purpose:'acceptance'}],{now,localTasks,remoteData});
  assert.equal(actual.coverage.ordinaryRuns,1);assert.equal(actual.coverage.acceptanceRuns,1);assert.equal(actual.rows[0].ownerOutcome,'needs_rework');assert.equal(actual.rows[0].tokenBasis,'latest-response');
  assert.equal(actual.ordinary.medianDurationMs,100);
});
test('a sparse successful window does not create an improvement claim or auto-change candidate',()=>{
  const actual=summarizeTasks([task],{now});assert.deepEqual(actual.candidates,[]);assert.throws(()=>summarizeTasks([],{now,days:0}),/1 to 90/);
});
test('archived failure truth survives a later successful continuation and remote coverage limit remains explicit',()=>{
  const prior={runId:'failed-run',generation:1,finishedAt:task.updatedAt,status:'failed',purpose:'work',errorCategory:'model-or-harness-policy'};
  const current={runId:'good-run',generation:2,finishedAt:task.updatedAt,status:'completed',purpose:'work',errorCategory:null};
  const actual=summarizeTasks([{...task,error:null,runs:[prior,current]}],{now,remoteData:{jobs:[],limit:100,limitReached:true}});
  assert.equal(actual.rows[0].failureClass,'model-or-harness-policy');assert.equal(actual.rows[1].failureClass,null);assert.equal(actual.coverage.remoteLimitReached,true);assert.equal(actual.coverage.remoteHasMore,null);
});
