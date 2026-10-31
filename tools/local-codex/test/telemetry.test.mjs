import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createTelemetry,usageCounters,archiveRun} from '../src/telemetry.mjs';
const parent='01900000-0000-7000-8000-000000000001',child='01900000-0000-7000-8000-000000000002';
const selection={model:'gpt-6.1-sol',effort:'xhigh'};
const usage={totalTokens:30,inputTokens:20,cachedInputTokens:10,outputTokens:10,reasoningOutputTokens:4};
const event=(method,params)=>({method,params});
test('explicit relay generations survive skipped remote runs without being replaced by local history length',()=>{
  assert.equal(createTelemetry({relayGeneration:7,history:[{}]}).snapshot().generation,7);
  assert.equal(createTelemetry({history:[{}]}).snapshot().generation,2);
});
test('per-run telemetry is content-free, deduplicates updates, and marks missing child usage',()=>{
  let now=1000;const metric=createTelemetry({strategy:'team',purpose:'acceptance',history:[{}]},{clock:()=>now});
  for(let i=0;i<2;i++)metric.observe(event('thread/tokenUsage/updated',{threadId:parent,tokenUsage:{last:usage,total:{...usage,totalTokens:9999}}}),parent,selection);
  const command=event('item/completed',{threadId:parent,item:{id:'command',type:'commandExecution',status:'failed',exitCode:1,command:'SECRET_COMMAND',aggregatedOutput:'SECRET_OUTPUT'}});
  metric.observe(command,parent,selection);metric.observe(command,parent,selection);
  metric.observe(event('item/completed',{threadId:parent,item:{id:'spawn',type:'collabAgentToolCall',tool:'spawnAgent',receiverThreadIds:[child],model:selection.model,reasoningEffort:selection.effort,prompt:'SECRET_PROMPT',agentsStates:{[child]:{status:'running',message:'SECRET_MESSAGE'}}}}),parent,selection);
  assert.equal(metric.snapshot().children[0].selectionVerified,false);
  metric.observe(event('item/completed',{threadId:parent,item:{id:'activity',type:'subAgentActivity',kind:'started',agentThreadId:child,model:selection.model,reasoningEffort:selection.effort}}),parent,selection);
  const actual=metric.snapshot();assert.equal(actual.generation,2);assert.equal(actual.tokenBasis,'latest-response');assert.deepEqual(actual.parentUsage,usage);assert.equal(actual.commands,1);assert.equal(actual.toolFailures,1);assert.equal(actual.childrenSeen,1);assert.equal(actual.usageCoverage,'partial-team');assert.equal(actual.children[0].selectionVerified,true);assert.equal(actual.children[0].executionVerified,null);assert.equal(actual.children[0].usage,null);assert(!JSON.stringify(actual).includes('SECRET'));
  metric.observe(event('thread/tokenUsage/updated',{threadId:child,tokenUsage:{last:usage}}),parent,selection);assert.equal(metric.snapshot().usageCoverage,'team');
  now=1500;metric.finish();assert.equal(metric.snapshot().durationMs,500);
});
test('human wait counts concurrent requests once and snapshots do not create clock-only progress',()=>{
  let now=1000;const metric=createTelemetry({},{clock:()=>now});metric.requestOpened('a','approval');metric.requestOpened('a','approval');now=2000;metric.requestOpened('b','question');
  const before=metric.snapshot();now=3000;assert.deepEqual(metric.snapshot(),before);
  metric.requestClosed('a');now=4000;metric.requestClosed('b');assert.equal(metric.snapshot().waitingMs,3000);assert.equal(metric.snapshot().approvals,1);assert.equal(metric.snapshot().questions,1);
  metric.requestOpened('c','question');now=4500;metric.finish();assert.equal(metric.snapshot().waitingMs,3500);
});
test('unknown thread data stays excluded and mismatched model/reroute is actionable',()=>{
  const metric=createTelemetry({});metric.observe(event('thread/tokenUsage/updated',{threadId:child,tokenUsage:{last:usage}}),parent,selection);assert.equal(metric.snapshot().childrenSeen,0);assert.equal(metric.snapshot().parentUsage,null);
  assert.match(metric.observe(event('thread/started',{thread:{id:child,parentThreadId:parent,model:'lower-model',reasoningEffort:'xhigh'}}),parent,selection),/Ask the owner/);
  assert.match(metric.observe(event('model/rerouted',{threadId:parent,toModel:'lower-model'}),parent,selection),/Ask the owner/);
});
test('invalid counters stay unknown, runs are unique and history is bounded',()=>{
  assert.equal(usageCounters({totalTokens:-1}),null);assert.equal(usageCounters({totalTokens:2}).inputTokens,null);
  const job={project:'fixture',mode:'inspect',model:'gpt-6.1-sol',reasoningEffort:'xhigh'};
  for(let i=0;i<55;i++){const metric=createTelemetry(job);metric.finish();archiveRun(job,metric,'completed');archiveRun(job,metric,'completed');}
  assert.equal(job.runs.length,50);assert.equal(new Set(job.runs.map(r=>r.runId)).size,50);
});
