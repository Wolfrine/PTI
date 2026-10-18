import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ProgressStore } from '../src/progress.mjs';
async function cleanTemporary(root) {
  assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('op-progress-'));
  await rm(root,{recursive:true,force:true});
}

test('takeover revokes old writes and a newer intentional rewind beats delayed progress',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'op-progress-'));t.after(()=>cleanTemporary(root));
  const revoked=[];const store=new ProgressStore({root,catalog:{episodes:[{episodeNumber:1,availability:'listed'}]},onRevoke:id=>revoked.push(id)});
  const lease=await store.claim({uid:'viewer',deviceId:'device-one'});
  const event=(revision,positionSeconds,generation=lease.generation)=>({episodeId:'one-piece-0001',generation,authorityEpoch:lease.authorityEpoch,revision,positionSeconds,reason:'seek'});
  await store.record('viewer',lease.sessionId,event(1,600),{durationSeconds:1500});
  await store.record('viewer',lease.sessionId,event(3,200),{durationSeconds:1500});
  await assert.rejects(store.record('viewer',lease.sessionId,event(2,620),{durationSeconds:1500}),{code:'stale-progress'});
  assert.equal((await store.snapshot('viewer')).progress['one-piece-0001'].positionSeconds,200);
  assert.equal((await store.record('viewer',lease.sessionId,event(3,200),{durationSeconds:1500})).duplicate,true);
  await assert.rejects(store.claim({uid:'viewer',deviceId:'device-two'}),{code:'active-session'});
  const next=await store.claim({uid:'viewer',deviceId:'device-two',takeover:true});
  assert.equal(next.generation,lease.generation+1);assert.deepEqual(revoked,[lease.sessionId]);
  await assert.rejects(store.record('viewer',lease.sessionId,event(4,700),{durationSeconds:1500}),{code:'session-replaced-or-expired'});
});
test('Cast rejects phone estimates, profiles stay separate, disk resume does not resurrect control',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'op-progress-'));t.after(()=>cleanTemporary(root));
  const options={root,catalog:{episodes:[{episodeNumber:1001,availability:'listed'},{episodeNumber:590,availability:'missing'}]}};const store=new ProgressStore(options);
  assert.throws(()=>store.episode('one-piece-0590'),{code:'episode-missing'});
  const lease=await store.claim({uid:'sister',deviceId:'phone-device',destination:'cast'});
  const event={episodeId:'one-piece-1001',generation:lease.generation,authorityEpoch:lease.authorityEpoch,revision:1,positionSeconds:61,reason:'heartbeat'};
  await assert.rejects(store.record('sister',lease.sessionId,event,{durationSeconds:1500}),{code:'stale-progress-authority'});
  await store.record('sister',lease.sessionId,event,{durationSeconds:1500,authority:'receiver'});
  assert.deepEqual((await store.snapshot('wife')).progress,{});
  assert.notEqual(store.fileFor('wife'),store.fileFor('Wife'));
  const restarted=new ProgressStore(options);const snapshot=await restarted.snapshot('sister');
  assert.equal(snapshot.progress['one-piece-1001'].positionSeconds,61);assert.equal(snapshot.lease,null);
  await restarted.acknowledge('sister','one-piece-1001',lease.generation,0);
  assert.ok((await restarted.pending('sister'))['one-piece-1001']);
  await restarted.acknowledge('sister','one-piece-1001',lease.generation,1);
  assert.deepEqual(await restarted.pending('sister'),{});
});
test('handoff epochs reject delayed local and receiver events after a round trip',async t=>{
  const root=await mkdtemp(path.join(os.tmpdir(),'op-progress-'));t.after(()=>cleanTemporary(root));
  const store=new ProgressStore({root,catalog:{episodes:[{episodeNumber:1,availability:'listed'}]}});
  const local=await store.claim({uid:'viewer',deviceId:'device-one'});
  const event=(revision,authorityEpoch,positionSeconds)=>({episodeId:'one-piece-0001',generation:local.generation,authorityEpoch,revision,positionSeconds,reason:'seek'});
  await store.record('viewer',local.sessionId,event(1,local.authorityEpoch,600),{durationSeconds:1500});
  const cast=await store.setDestination('viewer',local.sessionId,'cast');
  await store.record('viewer',local.sessionId,event(2,cast.authorityEpoch,900),{durationSeconds:1500,authority:'receiver'});
  const returned=await store.setDestination('viewer',local.sessionId,'local');
  await store.record('viewer',local.sessionId,event(3,returned.authorityEpoch,610),{durationSeconds:1500});
  await assert.rejects(store.record('viewer',local.sessionId,event(4,local.authorityEpoch,950),{durationSeconds:1500}),{code:'stale-progress-authority'});
  await assert.rejects(store.record('viewer',local.sessionId,event(5,cast.authorityEpoch,960),{durationSeconds:1500,authority:'receiver'}),{code:'stale-progress-authority'});
  assert.equal((await store.snapshot('viewer')).progress['one-piece-0001'].positionSeconds,610);
});
