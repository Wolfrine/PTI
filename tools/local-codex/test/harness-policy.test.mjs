import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harnessPolicy} from '../src/harness-policy.mjs';
import {ownerLimit,ownerDuration,executionDeadline,deadlineElapsed} from '../src/limits.mjs';
const selection={model:'gpt-6.1-sol',effort:'xhigh'};
test('default delegation has no bridge count or nesting ceiling and preserves exact model settings',()=>{
  for(const configuration of [{},{maxSubagentsPerTask:null}]){
    const value=harnessPolicy({},configuration,selection);
    assert.equal(value.maxSubagents,null);assert.equal(value.config['agents.enabled'],true);
    assert.equal(value.config['agents.default_subagent_model'],'gpt-6.1-sol');assert.equal(value.config['agents.default_subagent_reasoning_effort'],'xhigh');
    assert.equal(Object.hasOwn(value.config,'agents.max_concurrent_threads_per_session'),false);
    assert.match(value.instructions,/ceilings are withdrawn/);assert.match(value.instructions,/inspect tasks remain read-only/);
    assert.match(value.instructions,/Ask the owner before introducing/);assert(!value.instructions.includes('spawn another layer'));
    assert.match(value.instructions,/Keep one native parent for this project\/module/);
    assert.match(value.instructions,/prioritize .*native subagents.*under this parent/);
    assert.match(value.instructions,/narrow, dependent or tiny/);
    assert.match(value.instructions,/non-overlapping file ownership/);
  }
});
test('only explicit single or finite owner choices constrain delegation, without a bridge hard maximum',()=>{
  const single=harnessPolicy({strategy:'single'},{},selection);assert.equal(single.maxSubagents,0);assert.equal(single.config['agents.enabled'],false);
  const finite=harnessPolicy({strategy:'team'},{maxSubagentsPerTask:25},selection);assert.equal(finite.config['agents.max_concurrent_threads_per_session'],25);
  assert.throws(()=>harnessPolicy({strategy:'team'},{maxSubagentsPerTask:0},selection),/owner-configured/);
  for(const maxSubagentsPerTask of [-1,1.5,'2'])assert.throws(()=>harnessPolicy({}, {maxSubagentsPerTask},selection),/integer/);
});

test('default duration has no deadline and an explicit long duration cannot overflow into an immediate timeout',()=>{
  assert.equal(ownerLimit(undefined,'parents'),null);assert.equal(ownerLimit(null,'children'),null);
  assert.equal(ownerLimit(25,'parents'),25);assert.equal(ownerLimit(0,'children',0),0);
  assert.throws(()=>ownerLimit(0,'parents'),/integer/);
  assert.equal(executionDeadline(1000,null),null);assert.equal(deadlineElapsed(null,Number.MAX_SAFE_INTEGER),false);
  assert.equal(executionDeadline(1000,1),61000);assert.equal(deadlineElapsed(61000,61000),true);
  assert.equal(ownerDuration(0.25),0.25);assert.equal(executionDeadline(0,0.25),15000);assert.throws(()=>ownerDuration(Infinity),/finite/);
  const long=executionDeadline(0,100000);assert(long>2147483647);assert.equal(deadlineElapsed(long,2147483648),false);
});
