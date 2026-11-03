import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {CodexRelay,FirestoreRelayStore,OWNER,heartbeatSchema,workerSyncSchema,type ActiveClaim} from './local-codex.js';

// An instrumented transaction store counts actual production-store operations.
// These are synthetic protocol counts, not provider billing measurements.
function fixture(){
  let at=1000000;
  const rootPath=`_ptiLocalServices/local-codex/owners/${OWNER}`,signalPath=`${rootPath}/signals/dispatch`;
  const documents=new Map<string,any>(),counts={reads:0,queueQueries:0,writes:0,transactions:0};
  const commits:{path:string;data:any}[][]=[];
  const snapshot=(path:string)=>({data:()=>structuredClone(documents.get(path))});
  function ref(path:string):any{return {path,collection:(name:string)=>({doc:(id:string)=>ref(`${path}/${name}/${id}`),where:()=>({limit:(limit:number)=>({get:async()=>{
    counts.queueQueries++;
    return {docs:[...documents.entries()].filter(([key,value])=>key.startsWith(`${path}/jobs/`)&&value.status==='queued').slice(0,limit).map(([key])=>({id:key.split('/').at(-1)}))};
  }})})}),get:async()=>{counts.reads++;return snapshot(path);},set:async(data:any,{merge}:any={})=>{counts.writes++;documents.set(path,merge?{...documents.get(path),...structuredClone(data)}:structuredClone(data));}};}
  const db={doc:ref,runTransaction:async(fn:any)=>{
    counts.transactions++;const writes:{path:string;data:any;merge:boolean}[]=[];
    const tx={get:async(r:any)=>{counts.reads++;return snapshot(r.path);},getAll:async(...refs:any[])=>{counts.reads+=refs.length;return refs.map(r=>snapshot(r.path));},set:(r:any,data:any,options?:any)=>{writes.push({path:r.path,data:structuredClone(data),merge:!!options?.merge});}};
    const result=await fn(tx);
    for(const write of writes){counts.writes++;documents.set(write.path,write.merge?{...documents.get(write.path),...write.data}:write.data);}
    commits.push(writes);return result;
  }};
  const relay=new CodexRelay(new FirestoreRelayStore(db as never),()=>at);
  const heartbeat=heartbeatSchema.parse({instanceId:randomUUID(),authMode:'chatgpt',version:'0.4.3',maxConcurrentTasks:null,maxSubagentsPerTask:null,maxTaskMinutes:null,projects:[{key:'scratch',name:'Scratch',path:'F:/scratch',available:true}]});
  const args={project:'scratch',prompt:'PRIVATE PROMPT',mode:'inspect' as const,request_key:'transport-task'};
  const sync=(active:ActiveClaim[]=[],dispatch=false)=>relay.sync(OWNER,{heartbeat,active,dispatch});
  const reset=()=>{for(const key of Object.keys(counts))counts[key as keyof typeof counts]=0;commits.length=0;};
  return {relay,heartbeat,args,documents,counts,commits,rootPath,signalPath,sync,reset,advance:(ms:number)=>at+=ms};
}

describe('Local Codex listener transport',()=>{
  it('uses forty-second idle heartbeats only with a connected listener and preserves sixty-second freshness',async()=>{
    const f=fixture();f.heartbeat.dispatchReady=true;
    expect(await f.sync()).toMatchObject({jobs:[],syncDelayMs:40000});
    f.reset();
    for(let tick=0;tick<2160;tick++){
      f.advance(40000);expect((await f.sync()).syncDelayMs).toBe(40000);
    }
    expect(f.counts).toMatchObject({reads:2160,writes:2160,queueQueries:0});
    f.advance(59999);expect(await f.relay.status(OWNER)).toMatchObject({online:true});
    f.advance(2);expect(await f.relay.status(OWNER)).toMatchObject({online:false});
    f.heartbeat.dispatchReady=false;
    expect((await f.sync()).syncDelayMs).toBe(30000);
  });
  it('keeps thirty-second maintenance as soon as a marker wakes a new claim',async()=>{
    const f=fixture();f.heartbeat.dispatchReady=true;await f.sync();
    await f.relay.start(OWNER,f.args);
    const admitted=await f.sync([],true);
    expect(admitted.jobs).toHaveLength(1);expect(admitted.syncDelayMs).toBe(30000);
    f.advance(31000);expect((await f.sync(admitted.jobs)).syncDelayMs).toBe(30000);
    expect(await f.relay.status(OWNER)).toMatchObject({online:true});
  });
  it('does no queue query during quiet health maintenance and throttles heartbeat writes to thirty seconds',async()=>{
    const f=fixture();await f.sync();expect(f.counts).toMatchObject({reads:1,queueQueries:0,writes:1});
    f.reset();f.advance(10000);await f.sync();expect(f.counts).toMatchObject({reads:1,queueQueries:0,writes:0});
    f.reset();f.advance(20000);expect(await f.sync()).toMatchObject({jobs:[],more:false,syncDelayMs:30000});
    expect(f.counts).toMatchObject({reads:1,queueQueries:0,writes:1});expect(f.documents.has(f.signalPath)).toBe(false);
  });
  it('publishes only changed queue/control intent atomically, with no task content in the signal',async()=>{
    const f=fixture();await f.sync();f.reset();const task=await f.relay.start(OWNER,f.args);
    const signal=f.documents.get(f.signalPath);expect(Object.keys(signal).sort()).toEqual(['revision','schemaVersion','writtenAt']);
    expect(signal).toMatchObject({schemaVersion:1,revision:expect.any(String),writtenAt:expect.any(Number)});
    expect(f.commits[0].map(w=>w.path)).toEqual(expect.arrayContaining([`${f.rootPath}/jobs/${task.id}`,f.rootPath,f.signalPath]));
    f.reset();await f.relay.start(OWNER,f.args);expect(f.counts.writes).toBe(0);
    const claim=(await f.sync([],true)).jobs[0];
    await f.relay.report(OWNER,{...claim,snapshot:{status:'waiting_for_user',pending:[{id:'question',kind:'question',details:{questions:[{id:'answer'}]}}]}});
    f.advance(31000);await f.sync([claim]);expect(f.documents.get(f.signalPath)).toEqual(signal);
    await f.relay.respond(OWNER,{task_id:task.id,request_id:'question',answers:{answer:['Actual human response']}});
    const responseSignal=f.documents.get(f.signalPath);expect(responseSignal.revision).not.toBe(signal.revision);
    await f.relay.respond(OWNER,{task_id:task.id,request_id:'question',answers:{answer:['Actual human response']}});
    expect(f.documents.get(f.signalPath)).toEqual(responseSignal);
    await f.relay.cancel(OWNER,task.id);const cancellation=f.documents.get(f.signalPath);expect(cancellation.revision).not.toBe(responseSignal.revision);
    await f.relay.cancel(OWNER,task.id);expect(f.documents.get(f.signalPath)).toEqual(cancellation);
    await f.relay.report(OWNER,{...claim,snapshot:{status:'interrupted'}});
    expect(f.documents.get(f.signalPath)).toEqual(cancellation);
    await f.relay.continue(OWNER,{task_id:task.id,prompt:'Continue',request_key:'transport-continue'});
    expect(f.documents.get(f.signalPath).revision).not.toBe(cancellation.revision);
  });
  it('queries each dispatch page once and drains over ten tasks without imposing a task ceiling',async()=>{
    const f=fixture();await f.sync();
    for(let i=0;i<25;i++)await f.relay.start(OWNER,{...f.args,request_key:`transport-${i}`});
    let active:ActiveClaim[]=[];f.reset();
    for(const [length,more] of [[10,true],[10,true],[5,false]] as const){
      const before=f.counts.queueQueries,result=await f.sync(active,true);expect(result.jobs).toHaveLength(length);expect(result.more).toBe(more);
      expect(f.counts.queueQueries-before).toBe(1);active.push(...result.jobs);
    }
    expect(active).toHaveLength(25);expect(new Set(active.map(job=>job.id)).size).toBe(25);expect(f.counts.queueQueries).toBe(3);
    f.reset();f.advance(31000);const result=await f.sync(active);
    expect(result.lost).toEqual([]);expect(Object.keys(result.controls)).toHaveLength(25);
    expect(f.counts).toMatchObject({transactions:1,reads:26,queueQueries:0,writes:26});
    expect(f.documents.get(f.rootPath).reservations).toHaveLength(25);
  });
  it('isolates stale claims and preserves valid peers with one maintenance transaction',async()=>{
    const f=fixture();await f.sync();for(let i=0;i<3;i++)await f.relay.start(OWNER,{...f.args,request_key:`identity-${i}`});
    const active=(await f.sync([],true)).jobs;const bad=[{...active[0],lease:randomUUID()},{...active[1],generation:2},active[2]];
    f.reset();const result=await f.sync(bad);expect(result.lost).toEqual(active.slice(0,2).map(job=>job.id));
    expect(Object.keys(result.controls)).toEqual([active[2].id]);expect(f.counts).toMatchObject({transactions:1,reads:4,queueQueries:0});
    expect(f.documents.get(`${f.rootPath}/jobs/${active[0].id}`).lease).toBe(active[0].lease);
    f.reset();await expect(f.relay.sync('foreign',{heartbeat:f.heartbeat,active})).rejects.toThrow('authorized');expect(f.counts.reads).toBe(0);
    f.advance(90001);expect((await f.sync(active)).lost).toEqual(active.map(job=>job.id));
  });
  it('validates unique array claims and explicit dispatch at the worker HTTP boundary',()=>{
    const f=fixture(),claim={id:'a'.repeat(32),generation:1,lease:randomUUID()};
    expect(workerSyncSchema.parse({heartbeat:f.heartbeat})).toMatchObject({active:[],dispatch:false});
    expect(workerSyncSchema.safeParse({heartbeat:f.heartbeat,active:[claim,claim]}).success).toBe(false);
    expect(workerSyncSchema.safeParse({heartbeat:f.heartbeat,active:claim}).success).toBe(false);
    expect(workerSyncSchema.safeParse({heartbeat:f.heartbeat,dispatch:'true'}).success).toBe(false);
  });
  it('rejects new work while dispatch is disconnected but maintains existing leases and recovers on reconnection',async()=>{
    const f=fixture();await f.sync();const task=await f.relay.start(OWNER,f.args),active=(await f.sync([],true)).jobs;
    const initialLease=f.documents.get(`${f.rootPath}/jobs/${task.id}`).leaseUntil;
    f.heartbeat.dispatchReady=false;f.advance(31000);const result=await f.sync(active);
    expect(result.lost).toEqual([]);expect(f.documents.get(`${f.rootPath}/jobs/${task.id}`).leaseUntil).toBeGreaterThan(initialLease);
    expect(await f.relay.status(OWNER)).toMatchObject({online:false,canAcceptMore:false});
    await expect(f.relay.start(OWNER,{...f.args,request_key:'disconnected-new-work'})).rejects.toThrow('unavailable');
    f.heartbeat.dispatchReady=true;await f.sync(active);expect(await f.relay.status(OWNER)).toMatchObject({online:true,canAcceptMore:true});
    expect(await f.relay.start(OWNER,{...f.args,request_key:'reconnected-new-work'})).toMatchObject({status:'queued'});
  });
});
