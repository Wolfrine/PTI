import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTasks,reviewTaskIds,collectReviewMetadata,reviewFingerprint} from '../src/review-usage.mjs';
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

test('an approval-wait interruption is actionable without inventing an owner verdict',()=>{
  const run={runId:'stalled',generation:1,finishedAt:task.updatedAt,status:'interrupted',purpose:'work',approvals:1,questions:0,waitingMs:688985,durationMs:1800047};
  const result=summarizeTasks([{...task,mode:'edit',runs:[run]}],{now});
  assert.equal(result.candidates[0].id,'inspect-approval-wait-interruption');assert.equal(result.rows[0].ownerOutcome,'unknown');assert.equal(result.rows[0].sandboxType,'unknown');
  assert.deepEqual(summarizeTasks([{...task,purpose:'acceptance',runs:[{...run,purpose:'acceptance'}]}],{now}).candidates,[]);
  assert.deepEqual(summarizeTasks([{...task,runs:[{...run,approvals:0,questions:1}]}],{now}).candidates,[]);
  assert.deepEqual(summarizeTasks([{...task,runs:[{...run,approvals:1,questions:1}]}],{now}).candidates,[]);
  assert.deepEqual(summarizeTasks([{...task,runs:[{...run,waitingMs:299999}]}],{now}).candidates,[]);
});

test('feedback lookup selects mapped tasks in the actual window, including old tasks with recent generations',()=>{
  const remote='c'.repeat(32),stale='d'.repeat(32),recentRun={finishedAt:task.updatedAt,status:'completed',purpose:'work'};
  const tasks=[{...task,createdAt:'2025-01-01',updatedAt:'2025-01-01',runs:[recentRun]},{...task,id:'b'.repeat(32),updatedAt:'2025-01-01'}];
  assert.deepEqual(reviewTaskIds(tasks,{[remote]:task.id,[stale]:'b'.repeat(32),bad:task.id},{now}),[remote]);
});

test('feedback lookup covers more than 100 jobs without scanning recent unrelated jobs; missing records stay unknown',async()=>{
  const ids=Array.from({length:205},(_,index)=>(index+1).toString(16).padStart(32,'0')),calls=[];
  const result=await collectReviewMetadata([...ids,ids[0]],async batch=>{
    calls.push(batch);return {coverage:'requested-jobs',requestedJobs:batch.length,missingTaskIds:batch.includes(ids[204])?[ids[204]]:[],jobs:batch.filter(id=>id!==ids[204]).map(id=>({id,generation:1,ownerOutcome:id===ids[0]?'accepted':null}))};
  });
  assert.deepEqual(calls.map(batch=>batch.length),[100,100,5]);assert.equal(result.requestedJobs,205);assert.equal(result.jobs.length,204);assert.equal(result.batchCount,3);
  const report=summarizeTasks([{...task,runs:[{generation:1,finishedAt:task.updatedAt,purpose:'work',status:'completed'}]}],{now,remoteData:result,localTasks:{[ids[0]]:task.id}});
  assert.equal(report.rows[0].ownerOutcome,'accepted');assert.equal(report.coverage.remoteRecentLimit,null);assert.equal(report.coverage.remoteMissingJobs,1);assert.equal(report.coverage.ordinaryRunsWithRemoteMetadata,1);
  const missing=summarizeTasks([{...task,purpose:'work'}],{now,remoteData:result,localTasks:{[ids[204]]:task.id}});
  assert.equal(missing.rows[0].ownerOutcome,'unknown');assert.equal(missing.coverage.ordinaryRunsWithRemoteMetadata,0);
});

test('feedback lookup refuses legacy truncation, scope errors and a failed later batch rather than certifying partial sync',async()=>{
  const ids=Array.from({length:101},(_,index)=>(index+1).toString(16).padStart(32,'0'));
  await assert.rejects(collectReviewMetadata(ids,async()=>({coverage:'most-recent-100-jobs',jobs:[]})),/scope/);
  for(const jobs of [[],[{id:'f'.repeat(32)}],[{id:ids[0]},{id:ids[0]}]])await assert.rejects(collectReviewMetadata(ids.slice(0,1),async()=>({coverage:'requested-jobs',requestedJobs:1,jobs,missingTaskIds:[]})),/identities/);
  await assert.rejects(collectReviewMetadata(ids,async batch=>{
    if(batch.length===1)throw Error('fixture offline');
    return {coverage:'requested-jobs',requestedJobs:batch.length,jobs:batch.map(id=>({id})),missingTaskIds:[]};
  }),/fixture offline/);
  assert.equal((await collectReviewMetadata([],()=>assert.fail('No request for an empty window'))).requestedJobs,0);
});

test('coverage-only changes replace stale reports while identical evidence remains deduplicated',()=>{
  const recent=summarizeTasks([task],{now,remoteData:{coverage:'most-recent-100-jobs',jobs:[],limit:100,limitReached:true}});
  const scoped=summarizeTasks([task],{now,remoteData:{coverage:'requested-jobs',jobs:[],limit:null,limitReached:false,has_more:false,requestedJobs:1,missingTaskIds:['c'.repeat(32)],batchCount:1}});
  assert.deepEqual(recent.rows,scoped.rows);assert.notEqual(reviewFingerprint(recent),reviewFingerprint(scoped));
  assert.equal(reviewFingerprint(scoped),reviewFingerprint({...scoped,generatedAt:'2026-11-05T00:00:00Z'}));
});
