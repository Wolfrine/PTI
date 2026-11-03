import assert from 'node:assert/strict';
import test from 'node:test';
import {previousWorkerStillExiting,processStartedAt} from '../src/worker-lifetime.mjs';

const terminal={workerPid:8720,updatedAt:'2026-11-01T12:32:49.753Z'};
test('a recycled PID does not indefinitely block the completed generation',()=>{
  assert.equal(previousWorkerStillExiting(terminal,()=>true,()=>Date.parse('2026-11-02T04:56:09.744Z')),false);
});
test('the actual prior process still exiting retains its existing guard',()=>{
  assert.equal(previousWorkerStillExiting(terminal,()=>true,()=>Date.parse('2026-11-01T12:00:00Z')),true);
  assert.equal(previousWorkerStillExiting(terminal,()=>true,()=>Date.parse(terminal.updatedAt)),true);
});
test('an exited PID needs no process inspection',()=>{
  assert.equal(previousWorkerStillExiting(terminal,()=>false,()=>{throw Error('unexpected inspection');}),false);
});
test('unknown process or terminal timing does not weaken the existing guard',()=>{
  for(const unavailable of [null,undefined,NaN])assert.equal(previousWorkerStillExiting(terminal,()=>true,()=>unavailable),true);
  assert.equal(previousWorkerStillExiting({...terminal,updatedAt:'unknown'},()=>true,()=>Date.now()),true);
});
test('the Windows process probe reads this live process without launching work',()=>{
  if(process.platform!=='win32')return;
  const started=processStartedAt(process.pid);
  assert.equal(Number.isFinite(started),true);
  assert.ok(started<=Date.now());
  assert.equal(processStartedAt(-1),null);
});
