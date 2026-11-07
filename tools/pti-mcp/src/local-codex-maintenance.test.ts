import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {FirestoreMaintenance} from './local-codex-maintenance.js';
import {CodexRelay,FirestoreRelayStore,heartbeatSchema,OWNER} from './local-codex.js';

// Optimistic transactions retry on root/query conflicts, like Firestore. No models.
function fixture(){
  let now=1794070000000,revision=0;const docs=new Map<string,any>(),root=`_ptiLocalServices/local-codex/owners/${OWNER}`;
  const snap=(p:string)=>({id:p.split('/').at(-1),exists:docs.has(p),data:()=>structuredClone(docs.get(p))});
  function query(prefix:string,field:string,op:string,value:any,limit=Infinity):any{return {query:true,prefix,field,op,value,limit:(n:number)=>query(prefix,field,op,value,n),get:async()=>({docs:[...docs.keys()].filter(p=>p.startsWith(prefix+'/')&&!p.slice(prefix.length+1).includes('/')&&(op==='in'?value.includes(docs.get(p)[field]):docs.get(p)[field]===value)).slice(0,limit).map(snap)})};}
  function ref(p:string):any{return {path:p,get:async()=>snap(p),set:async(v:any,opt:any)=>{docs.set(p,opt?.merge?{...docs.get(p),...structuredClone(v)}:structuredClone(v));revision++;},collection:(name:string)=>({doc:(id:string)=>ref(p+'/'+name+'/'+id),where:(field:string,op:string,value:any)=>query(p+'/'+name,field,op,value)})};}
  const db:any={doc:ref,runTransaction:async(fn:any)=>{
    while(true){const before=revision,writes:any[]=[];const tx={get:async(r:any)=>{await Promise.resolve();return r.query?r.get():snap(r.path);},getAll:async(...refs:any[])=>{await Promise.resolve();return refs.map(r=>snap(r.path));},set:(r:any,v:any,opt:any)=>writes.push([r.path,structuredClone(v),opt?.merge])};
      let value;try{value=await fn(tx);}catch(error){if(revision!==before)continue;throw error;}
      if(revision!==before)continue;
      for(const [p,v,merge] of writes){docs.set(p,merge?{...docs.get(p),...v}:v);revision++;}return value;
    }
  }};
  const relay=new CodexRelay(new FirestoreRelayStore(db),()=>now),control=new FirestoreMaintenance(db,OWNER,()=>now);
  const heartbeat=heartbeatSchema.parse({instanceId:randomUUID(),version:'0.4.7',authMode:'chatgpt',dispatchReady:true,maxConcurrentTasks:null,projects:[{key:'scratch',path:'F:/scratch',name:'Scratch',available:true}]});
  const request={id:randomUUID(),targetVersion:'0.4.8',artifactSetHash:'1'.repeat(64),deadline:now+600000};
  const args={project:'scratch',mode:'inspect' as const,prompt:'synthetic protocol request',request_key:'maintenance-race-task'};
  return {relay,control,heartbeat,request,args,docs,root,pair:()=>relay.sync(OWNER,{heartbeat,active:[],dispatch:false}),advance:(ms:number)=>now+=ms,setHost:(v:any)=>{docs.set(root,{...docs.get(root),...v});revision++;},clock:()=>now};
}
describe('transactional maintenance admission fence',()=>{
  it('serializes competing new admission and drain; never admits and seals from the same idle snapshot',async()=>{
    for(const first of ['drain','admission']){
      const f=fixture();await f.pair();const drain=()=>f.control.begin(OWNER,f.request),start=()=>f.relay.start(OWNER,f.args);
      const results=await Promise.allSettled(first==='drain'?[drain(),start()]:[start(),drain()]);
      expect(results.filter(r=>r.status==='fulfilled')).toHaveLength(1);
      const gate=f.docs.get(f.root).maintenance,jobs=[...f.docs.values()].filter(v=>v.prompt===f.args.prompt);
      expect(gate?jobs.length===0:jobs.length===1).toBe(true);
      if(gate){expect(await f.relay.status(OWNER)).toMatchObject({canAcceptMore:false,maintenance:{phase:'draining'}});await expect(f.relay.start(OWNER,{...f.args,request_key:'after-drain-task'})).rejects.toThrow('maintenance');}
      else expect(jobs[0].status).toBe('queued');
    }
  });
  it('handles a claim/drain race without losing accepted jobs and allows existing report/heartbeat to finish',async()=>{
    const f=fixture();await f.pair();const task=await f.relay.start(OWNER,f.args);
    const [claimed,drained]=await Promise.allSettled([f.relay.sync(OWNER,{heartbeat:f.heartbeat,active:[],dispatch:true}),f.control.begin(OWNER,f.request)]);
    expect(claimed.status).toBe('fulfilled');const claim=(claimed as PromiseFulfilledResult<any>).value.jobs[0];expect(claim.id).toBe(task.id);expect(f.docs.get(f.root+'/jobs/'+task.id).status).toBe('running');
    if(drained.status==='rejected')await f.control.begin(OWNER,f.request);
    await expect(f.control.seal(OWNER,f.request)).rejects.toThrow('busy');
    await f.relay.sync(OWNER,{heartbeat:f.heartbeat,active:[{id:claim.id,generation:claim.generation,lease:claim.lease}],dispatch:false});
    expect(f.docs.get(f.root).maintenance.id).toBe(f.request.id);
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',final:'synthetic completion'}});
    await f.control.seal(OWNER,f.request);expect(f.docs.get(f.root).maintenance.phase).toBe('installing');
    await expect(f.relay.continue(OWNER,{task_id:task.id,prompt:'new generation',request_key:'maintenance-continue'})).rejects.toThrow('maintenance');
    expect(f.docs.get(f.root+'/jobs/'+task.id).generation).toBe(1);
  });
  it('rejects drain with preexisting queued jobs; blocks all claims under an existing fence without expiring the job',async()=>{
    const f=fixture();await f.pair();const task=await f.relay.start(OWNER,f.args);await expect(f.control.begin(OWNER,f.request)).rejects.toThrow('queued work');
    f.setHost({maintenance:{...f.request,phase:'draining',startedAt:f.clock(),instanceId:f.heartbeat.instanceId,protectedTasks:[]}});f.advance(121000);
    expect((await f.relay.sync(OWNER,{heartbeat:f.heartbeat,active:[],dispatch:true})).jobs).toEqual([]);
    expect(f.docs.get(f.root+'/jobs/'+task.id).status).toBe('queued');
  });
  it('keeps interrupted installation fenced after the deadline and releases only after verified rollback health',async()=>{
    const f=fixture();await f.pair();await f.control.begin(OWNER,f.request);await f.control.seal(OWNER,f.request);f.advance(700000);
    await expect(f.control.abort(OWNER,f.request)).rejects.toThrow('recovery');await expect(f.relay.start(OWNER,f.args)).rejects.toThrow();
    await f.control.recovery(OWNER,f.request);
    await expect(f.control.finish(OWNER,f.request,'0.4.8',f.clock(),'F:/receipt.json')).rejects.toThrow('heartbeat');
    await f.pair();const result=await f.control.finish(OWNER,f.request,'0.4.7',f.clock(),'F:/receipt.json');expect(result.outcome).toBe('rolled-back-verified');expect(f.docs.get(f.root).maintenance).toBeNull();expect((await f.relay.start(OWNER,f.args)).status).toBe('queued');
  });
  it('does not create a gate on old hosted protocol or foreign identity; normal abort preserves running work',async()=>{
    const f=fixture();await f.pair();f.setHost({maintenanceProtocol:undefined});await expect(f.control.begin(OWNER,f.request)).rejects.toThrow('maintenance-aware');
    f.advance(31000);await f.pair();await expect(f.control.begin('foreign',f.request)).rejects.toThrow('not authorized');await f.control.begin(OWNER,f.request);await f.control.abort(OWNER,f.request);expect(f.docs.get(f.root).maintenance).toBeNull();
  });
  it('does not equate a missing protected task with successful exit',async()=>{
    const f=fixture();await f.pair();const id='a'.repeat(32),p=f.root+'/jobs/'+id;f.docs.set(p,{id,generation:1,status:'running'});
    await f.control.begin(OWNER,f.request);f.docs.delete(p);
    await expect(f.control.seal(OWNER,f.request)).rejects.toThrow('missing');expect(f.docs.get(f.root).maintenance.phase).toBe('draining');
  });
});
