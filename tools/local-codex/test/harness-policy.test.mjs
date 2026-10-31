import {test} from 'node:test';
import assert from 'node:assert/strict';
import {harnessPolicy} from '../src/harness-policy.mjs';
const selection={model:'gpt-6.1-sol',effort:'xhigh'};
test('auto strategy provides bounded delegation with exact model defaults',()=>{
  const value=harnessPolicy({}, {}, selection);assert.equal(value.strategy,'auto');assert.equal(value.maxSubagents,2);assert.equal(value.config['agents.default_subagent_model'],'gpt-6.1-sol');assert.equal(value.config['agents.default_subagent_reasoning_effort'],'xhigh');assert.equal(value.config['agents.max_concurrent_threads_per_session'],2);assert.match(value.instructions,/smallest useful topology/);assert.match(value.instructions,/inspect tasks remain read-only/);
});
test('single disables subagents and team rejects a zero bound',()=>{
  const single=harnessPolicy({strategy:'single'},{maxSubagentsPerTask:4},selection);assert.equal(single.maxSubagents,0);assert.equal(single.config['agents.enabled'],false);
  assert.throws(()=>harnessPolicy({strategy:'team'},{maxSubagentsPerTask:0},selection),/positive/);
  for(const maxSubagentsPerTask of [-1,5,1.5,'2'])assert.throws(()=>harnessPolicy({}, {maxSubagentsPerTask},selection),/integer/);
});
