import {test} from 'node:test';
import assert from 'node:assert/strict';
import {executionPolicy,verifyExecutionPolicy,workerInstructions} from '../src/execution-policy.mjs';

test('trusted edit permission matches the owner while inspection stays read-only',()=>{
  assert.deepEqual(executionPolicy('edit'),{sandbox:'danger-full-access',sandboxType:'dangerFullAccess',approvalPolicy:'never'});
  const inspect=executionPolicy('inspect');assert.equal(inspect.sandbox,'read-only');assert.equal(inspect.approvalPolicy,'never');
  assert.throws(()=>executionPolicy('other'),/Unknown/);
  assert.doesNotThrow(()=>verifyExecutionPolicy({sandbox:{type:'dangerFullAccess'},approvalPolicy:'never'},executionPolicy('edit')));
  assert.throws(()=>verifyExecutionPolicy({sandbox:{type:'workspaceWrite'},approvalPolicy:'never'},executionPolicy('edit')),/sandbox/);
  assert.throws(()=>verifyExecutionPolicy({sandbox:{type:'readOnly'},approvalPolicy:'on-request'},inspect),/approval policy/);
  assert.doesNotThrow(()=>verifyExecutionPolicy({sandbox:{type:'readOnly',networkAccess:true},approvalPolicy:'never'},inspect));
  assert.throws(()=>verifyExecutionPolicy({sandbox:{type:'readOnly'}},inspect),/approval policy/);
});

test('current mode instructions contain trusted policy only and preserve scope',()=>{
  const instructions=workerInstructions({mode:'edit',prompt:'PRIVATE_PROMPT',final:'PRIVATE_FINAL'});
  assert.match(instructions,/Current bridge mode: edit/);assert.match(instructions,/not permission for unrelated work/);
  assert.match(instructions,/supersedes earlier bridge-mode/);assert(!instructions.includes('PRIVATE_'));
  const inspected=workerInstructions({mode:'inspect'});assert.match(inspected,/Discovery only/);assert(!inspected.includes('Runtime Full Access'));
});
