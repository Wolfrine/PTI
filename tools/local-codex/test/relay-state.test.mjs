import {test} from 'node:test';
import assert from 'node:assert/strict';
import {claims,mergeClaims,withoutClaim,retryableLocal} from '../src/relay-state.mjs';
const first={id:'a'.repeat(32),generation:1,lease:'lease-a',localId:'local-a',reportedSnapshot:'acknowledged-a'};
const second={id:'b'.repeat(32),generation:1,lease:'lease-b',localId:'local-b',reportedSnapshot:'acknowledged-b'};
test('a persisted serial claim migrates without losing local task identity or acknowledged progress',()=>{
  assert.deepEqual(claims(null),[]);
  const active=mergeClaims(JSON.parse(JSON.stringify(first)),[first,second]);
  assert.equal(active.length,2);assert.equal(active[0].localId,'local-a');assert.equal(active[0].reportedSnapshot,'acknowledged-a');
  const restarted=claims(JSON.parse(JSON.stringify(active)));
  assert.deepEqual(restarted,active);
});
test('one terminal or lost claim leaves its peers intact and stale generations cannot remove a newer claim',()=>{
  assert.deepEqual(withoutClaim([first,second],first),[second]);
  const newer={...first,generation:2,lease:'new-lease'};
  assert.deepEqual(withoutClaim([newer,second],first),[newer,second]);
  assert.equal(mergeClaims([newer,second],[newer])[0].localId,'local-a');
  assert.throws(()=>mergeClaims([newer,second],[first]),/conflicting generation/);
});
test('invalid or duplicate durable claims fail without inventing a recovery task',()=>{
  assert.throws(()=>claims([first,first]),/Duplicate/);
  assert.throws(()=>claims([{id:'unexpected',generation:1,lease:'x'}]),/Invalid/);
});
test('a resumed generation waits for its own cancelled predecessor without retrying unrelated failures',()=>{
  assert.equal(retryableLocal('continue_task','Wait for completion or cancel the active turn first.'),true);
  assert.equal(retryableLocal('continue_task','The previous worker is still exiting; retry shortly.'),true);
  assert.equal(retryableLocal('start_task','Wait for completion or cancel the active turn first.'),false);
  assert.equal(retryableLocal('continue_task','Workspace is busy with a conflicting task; wait for it to finish.'),false);
  assert.deepEqual(withoutClaim([first,second],first),[second]);
});
