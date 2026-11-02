import test from 'node:test';
import assert from 'node:assert/strict';
import {GtopSupervisor,HEALTHY_POLL_MS} from '../src/supervision.mjs';

function fixture({managed=false,state='running',healthy=true}={}){
  let at=Date.parse('2026-11-02T10:00:00Z'),saved=managed?{managed:true}:null,starts=0,polls=0,failPoll,failStart;
  const observation={state,healthy};
  const host={observe:async()=>({...observation}),start:async()=>{starts++;if(failStart)throw Error(failStart);observation.state='running';observation.healthy=true;}};
  const subject=new GtopSupervisor({host,poll:async()=>{polls++;if(failPoll)throw Error(failPoll);return {state:'ready'};},read:async()=>saved,write:async value=>saved=structuredClone(value),now:()=>at});
  return {subject,host,observation,advance:ms=>at+=ms,set pollError(value){failPoll=value;},set startError(value){failStart=value;},get starts(){return starts;},get polls(){return polls;},get saved(){return saved;}};
}

test('a full quiet day uses 1440 mailbox heartbeats and zero starts despite 43200 local checks',async()=>{
  const f=fixture();let result;
  for(let ms=0;ms<86400000;ms+=2000){result=await f.subject.tick();f.advance(2000);}
  assert.equal(f.polls,86400000/HEALTHY_POLL_MS);assert.equal(f.starts,0);
  assert.equal(result.counters.localChecks,43200);assert.equal(f.saved.managed,true);
  assert.equal(result.workerRunning,true);assert.equal(result.errorCode,null);
});

test('simulated owned-worker death expedites authenticated recovery, coalesces ticks and launches exactly once',async()=>{
  const f=fixture();await f.subject.tick();f.advance(2000);f.observation.state='stopped';
  const results=await Promise.all([f.subject.tick(),f.subject.tick(),f.subject.tick()]);
  assert.equal(f.polls,2);assert.equal(f.starts,1);assert.equal(results[0].counters.recoveries,1);
  for(let i=0;i<20;i++){f.advance(2000);await f.subject.tick();}
  assert.equal(f.starts,1);assert.equal(f.polls,2);
});

test('durable intent recovers after reboot, but a never-started service waits for an authorized request',async()=>{
  for(const managed of [true,false]){
    const f=fixture({managed,state:'stopped'});await f.subject.tick();assert.equal(f.starts,managed?1:0);
  }
});

test('short network/authentication loss neither kills a worker nor launches without a valid mailbox response',async()=>{
  for(const error of ['authentication_required','gateway_unavailable']){
    const f=fixture();await f.subject.tick();f.pollError=error;f.observation.state='stopped';f.advance(2000);
    let result=await f.subject.tick();assert.equal(result.state,'unavailable');assert.equal(result.errorCode,error);assert.equal(f.starts,0);
    for(let i=0;i<6;i++){f.advance(2000);await f.subject.tick();}
    assert.equal(f.polls,2);f.pollError=null;f.advance(4000);result=await f.subject.tick();
    assert.equal(f.starts,1);assert.equal(result.errorCode,null);
  }
});

test('failed recovery backs off to five minutes and cannot produce a restart storm',async()=>{
  const f=fixture({managed:true,state:'stopped'});f.startError='model_unavailable';let result;
  for(let i=0;i<180;i++){result=await f.subject.tick();f.advance(2000);}
  assert.ok(f.starts<=5);assert.equal(result.workerRunning,false);assert.equal(result.errorCode,'model_unavailable');
  f.startError=null;f.advance(300000);await f.subject.tick();assert.equal(f.starts,6);
});

test('unverified/conflicting processes or stale/unavailable health never trigger a restart',async()=>{
  for(const state of ['unknown','running']){
    const f=fixture({managed:true,state,healthy:false});const result=await f.subject.tick();
    assert.equal(f.starts,0);assert.equal(result.state,state==='unknown'?'unavailable':'offline');
  }
});

test('restored local model/runtime health returns to healthy cadence without restarting the worker',async()=>{
  const f=fixture({healthy:false});assert.equal((await f.subject.tick()).state,'offline');
  f.observation.healthy=true;f.advance(16000);
  const result=await f.subject.tick();assert.equal(result.state,'ready');assert.equal(f.starts,0);
  assert.equal(Date.parse(result.nextPollAt)-Date.parse(result.checkedAt),60000);
});

test('a successful mailbox Start is re-inspected and never followed by a duplicate recovery',async()=>{
  const f=fixture({managed:true,state:'stopped'});
  f.subject.poll=async()=>{f.observation.state='running';return {state:'starting'};};
  await f.subject.tick();assert.equal(f.starts,0);
});

test('local inspection failures fail closed and remote errors expose no private exception text',async()=>{
  const f=fixture({managed:true});f.host.observe=async()=>{throw Error('private data');};f.pollError='private credential';
  const result=await f.subject.tick();assert.equal(f.starts,0);assert.equal(result.localState,'unknown');
  assert.equal(result.errorCode,'gateway_unavailable');assert.equal(JSON.stringify(result).includes('private'),false);
});
