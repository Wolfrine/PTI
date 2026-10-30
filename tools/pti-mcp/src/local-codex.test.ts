import {afterEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {CodexRelay,createCodexServer,FirestoreRelayStore,OWNER,type RelayStore,type Job,type Worker} from './local-codex.js';
class Memory implements RelayStore {
  jobs=new Map<string,Job>(); host?:Worker;
  listeners=new Map<string,Set<{changed:(job:Job|undefined)=>void;failed:(error:Error)=>void}>>(); reads=0;
  async read(_uid:string,id:string){this.reads++;return structuredClone(this.jobs.get(id));}
  watch(_uid:string,id:string,changed:(job:Job|undefined)=>void,failed:(error:Error)=>void){
    const entry={changed,failed},listeners=this.listeners.get(id)||new Set();this.listeners.set(id,listeners);listeners.add(entry);
    queueMicrotask(()=>{if(listeners.has(entry))changed(structuredClone(this.jobs.get(id)));});
    return ()=>{listeners.delete(entry);if(!listeners.size)this.listeners.delete(id);};
  }
  async worker(){return this.host;}
  async heartbeat(_uid:string,w:Worker){this.host=structuredClone(w);}
  async queued(){return [...this.jobs.values()].filter(j=>j.status==='queued').map(j=>j.id);}
  async list(){return [...this.jobs.values()].sort((a,b)=>b.updatedAt-a.updatedAt);}
  async clearActive(_uid:string,id:string){if(this.host?.activeTask===id)this.host.activeTask=null;}
  async update<T>(_uid:string,id:string,fn:(job:Job|undefined,worker:Worker|undefined)=>{job:Job;result:T}){const result=fn(structuredClone(this.jobs.get(id)),structuredClone(this.host));this.jobs.set(id,result.job);for(const listener of this.listeners.get(id)||[])listener.changed(structuredClone(result.job));return result.result;}
}
function fixture(){let at=1000000;const store=new Memory(),relay=new CodexRelay(store,()=>at);const heartbeat={instanceId:randomUUID(),authMode:'chatgpt' as const,version:'0.3.0',projects:[{key:'scratch',name:'Scratch',path:'F:/scratch',available:true}]};const args={project:'scratch',prompt:'inspect',mode:'inspect' as const,request_key:'request-one'};return {store,relay,heartbeat,args,advance:(ms:number)=>at+=ms,pair:()=>relay.poll(OWNER,{heartbeat})};}
afterEach(()=>vi.useRealTimers());
describe('Local Codex relay',()=>{
  it('reuses a stable work key without silently submitting the next prompt, while keeping modes separate',async()=>{
    const f=fixture();await f.pair();const args={...f.args,title:'One outcome',work_key:'one-outcome'};
    const first=await f.relay.start(OWNER,args),again=await f.relay.start(OWNER,{...args,prompt:'follow up',request_key:'second-request'});
    expect(again).toMatchObject({id:first.id,reused:true,followup_required:true});expect(f.store.jobs.size).toBe(1);expect(f.store.jobs.get(first.id)?.prompt).toBe('inspect');
    await expect(f.relay.start(OWNER,{...args,prompt:'changed'})).rejects.toThrow('different');
    const edit=await f.relay.start(OWNER,{...args,mode:'edit'});expect(edit.id).not.toBe(first.id);
    expect((await f.relay.list(OWNER,{query:'outcome',limit:10})).tasks.length).toBe(2);
  });
  it('runs idempotent non-model history operations through the protected lease and result channel',async()=>{
    const f=fixture();await f.pair();const command={action:'list' as const,args:{query:'fixture'}};
    const job=await f.relay.command(OWNER,command,'history-one');expect((await f.relay.command(OWNER,command,'history-one')).id).toBe(job.id);
    const claim=(await f.pair()).job!;expect(claim).toHaveProperty('command',command);expect(claim.prompt).toBe('');
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',result:{threads:[{title:'Fixture'}]}}});
    expect(await f.relay.get(OWNER,job.id)).toHaveProperty('result',{threads:[{title:'Fixture'}]});
    expect((await f.relay.list(OWNER,{limit:10})).tasks).toHaveLength(0);
    await expect(f.relay.continue(OWNER,{task_id:job.id,prompt:'run model',request_key:'not-allowed'})).rejects.toThrow('cannot be continued');
    await expect(f.relay.command('foreign',command,'history-two')).rejects.toThrow('authorized');
  });
  it('requires a modern worker before queueing new history or resume features',async()=>{
    const f=fixture();f.heartbeat.version='0.2.0';await f.pair();
    await expect(f.relay.command(OWNER,{action:'list',args:{}},'history-one')).rejects.toThrow('upgraded');
    await expect(f.relay.start(OWNER,{...f.args,thread_id:randomUUID()})).rejects.toThrow('upgraded');expect(f.store.jobs.size).toBe(0);
  });
  it('reports busy work and refuses unrelated submissions without queueing',async()=>{
    const f=fixture();await f.pair();const first=await f.relay.start(OWNER,f.args);const claim=(await f.pair()).job!;
    expect(await f.relay.status(OWNER)).toMatchObject({online:true,busy:true,activeTask:first.id});
    await expect(f.relay.start(OWNER,{...f.args,request_key:'unrelated-one'})).rejects.toThrow('busy');
    await expect(f.relay.command(OWNER,{action:'list',args:{}},'history-one')).rejects.toThrow('Nothing was queued');
    expect(f.store.jobs.size).toBe(1);
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed'}});
    expect(await f.relay.status(OWNER)).toMatchObject({busy:false,activeTask:null});
    const second=await f.relay.start(OWNER,{...f.args,request_key:'second-after-idle'});await f.pair();
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed'}});
    expect(await f.relay.status(OWNER)).toMatchObject({busy:true,activeTask:second.id});
  });
  it('rejects offline and foreign-account requests without storing work',async()=>{const f=fixture();await expect(f.relay.start(OWNER,f.args)).rejects.toThrow('unavailable');await expect(f.relay.status('another')).rejects.toThrow('authorized');expect(f.store.jobs.size).toBe(0);});
  it('deduplicates requests and rejects different arguments with the same key',async()=>{const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);expect((await f.relay.start(OWNER,f.args)).id).toBe(j.id);await expect(f.relay.start(OWNER,{...f.args,prompt:'changed'})).rejects.toThrow('different');expect(f.store.jobs.size).toBe(1);});
  it('expires queued work rather than running it on reconnect',async()=>{const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);f.advance(120001);expect((await f.relay.get(OWNER,j.id)).status).toBe('failed');expect((await f.pair()).job).toBe(null);});
  it('checks fresh heartbeat and configured project at submission',async()=>{const f=fixture();await f.pair();await expect(f.relay.start(OWNER,{...f.args,project:'unknown'})).rejects.toThrow('available key');f.advance(60001);await expect(f.relay.start(OWNER,f.args)).rejects.toThrow('unavailable');});
  it('claims once, hides the lease, and protects reports by generation and lease',async()=>{const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);const claim=(await f.pair()).job!;expect(claim.id).toBe(j.id);expect((await f.pair()).job).toBe(null);expect(await f.relay.get(OWNER,j.id)).not.toHaveProperty('lease');await expect(f.relay.report(OWNER,{...claim,lease:randomUUID(),snapshot:{status:'completed'}})).rejects.toThrow('lease_lost');await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',final:'proof'}});expect((await f.relay.get(OWNER,j.id)).final).toBe('proof');await f.relay.report(OWNER,{...claim,snapshot:{status:'running'}});expect((await f.relay.get(OWNER,j.id)).status).toBe('completed');});
  it('continues only explicitly, with a new generation and immutable mode',async()=>{const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);const claim=(await f.pair()).job!;await f.relay.report(OWNER,{...claim,snapshot:{status:'completed'}});const args={task_id:j.id,prompt:'follow up',request_key:'followup-one'};const next=await f.relay.continue(OWNER,args);expect(next.generation).toBe(2);expect(next.mode).toBe('inspect');expect((await f.relay.continue(OWNER,args)).generation).toBe(2);await expect(f.relay.report(OWNER,{...claim,snapshot:{status:'completed',final:'old'}})).rejects.toThrow('lease_lost');});
  it('relays exact human responses and cancellation, including cancellation before claim',async()=>{const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);const claim=(await f.pair()).job!;await f.relay.report(OWNER,{...claim,snapshot:{status:'waiting_for_user',pending:[{id:'approval-one',kind:'approval'}]}});await expect(f.relay.respond(OWNER,{task_id:j.id,request_id:'other',decision:'approve'})).rejects.toThrow('matching');await f.relay.respond(OWNER,{task_id:j.id,request_id:'approval-one',decision:'decline'});await f.relay.cancel(OWNER,j.id);const controls=await f.relay.poll(OWNER,{heartbeat:f.heartbeat,active:claim});expect(controls.controls?.cancel).toBe(true);expect(controls.controls?.responses[0]).toMatchObject({decision:'decline'});await f.relay.report(OWNER,{...claim,snapshot:{status:'interrupted'}});await f.pair();const second=await f.relay.start(OWNER,{...f.args,request_key:'request-two'});await f.relay.cancel(OWNER,second.id);expect((await f.pair()).job).toBe(null);});
  it('reports a lost lease as interrupted and refuses late renewal or completion',async()=>{const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);const claim=(await f.pair()).job!;f.advance(90001);expect((await f.relay.get(OWNER,j.id)).status).toBe('interrupted');await expect(f.relay.poll(OWNER,{heartbeat:f.heartbeat,active:claim})).rejects.toThrow('lease_lost');await expect(f.relay.report(OWNER,{...claim,snapshot:{status:'completed'}})).rejects.toThrow('lease_lost');expect((await f.pair()).job).toBe(null);});
  it('keeps heartbeats and duplicate legacy reports from waking a wait, without repeated reads',async()=>{
    vi.useFakeTimers();const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args),claim=(await f.pair()).job!;
    const snapshot={status:'running',messages:[{text:'Working'}]};await f.relay.report(OWNER,{...claim,snapshot});
    const before=await f.relay.get(OWNER,j.id),reads=f.store.reads;let settled=false;
    const waiting=f.relay.wait(OWNER,j.id,20).then(value=>{settled=true;return value;});await vi.advanceTimersByTimeAsync(0);
    for(let index=0;index<3;index++){
      f.advance(3000);await vi.advanceTimersByTimeAsync(3000);
      await f.relay.poll(OWNER,{heartbeat:f.heartbeat,active:claim});
      await f.relay.report(OWNER,{...claim,snapshot:structuredClone(snapshot)});
    }
    expect(settled).toBe(false);expect(f.store.reads).toBe(reads+1);expect(f.store.jobs.get(j.id)?.updatedAt).toBe(Date.parse(before.updatedAt));
    await f.relay.report(OWNER,{...claim,snapshot:{...snapshot,messages:[{text:'New progress'}]}});
    expect((await waiting).messages).toEqual([{text:'New progress'}]);expect(f.store.listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);
  });
  it('renews leases before expiry without rewriting them on every heartbeat',async()=>{
    const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args),claim=(await f.pair()).job!;
    const original=f.store.jobs.get(j.id)!.leaseUntil;
    f.advance(3000);await f.relay.poll(OWNER,{heartbeat:f.heartbeat,active:claim});expect(f.store.jobs.get(j.id)!.leaseUntil).toBe(original);
    f.advance(28000);await f.relay.poll(OWNER,{heartbeat:f.heartbeat,active:claim});expect(f.store.jobs.get(j.id)!.leaseUntil).toBe(original!+31000);
    expect((await f.relay.get(OWNER,j.id)).status).toBe('running');
  });
  it('skips unchanged Firestore writes and uses the document listener with a detachable subscription',async()=>{
    const original={id:'fixture',leaseUntil:123},set=vi.fn(),unsubscribe=vi.fn(),onSnapshot=vi.fn(()=>unsubscribe);
    const ref={onSnapshot},root={collection:()=>({doc:()=>ref})};
    const db={doc:()=>root,runTransaction:async(fn:any)=>fn({get:async(value:unknown)=>({data:()=>value===ref?structuredClone(original):undefined}),set})};
    const store=new FirestoreRelayStore(db as never);
    await store.update(OWNER,'fixture',job=>({job:job!,result:true}));expect(set).not.toHaveBeenCalled();
    await store.update(OWNER,'fixture',job=>{job!.leaseUntil=456;return {job:job!,result:true};});expect(set).toHaveBeenCalledOnce();expect(original.leaseUntil).toBe(123);
    const changed=vi.fn(),failed=vi.fn();store.watch(OWNER,'fixture',changed,failed)();expect(unsubscribe).toHaveBeenCalledOnce();
    const next=onSnapshot.mock.calls[0][0] as (snapshot:{data:()=>unknown})=>void;next({data:()=>original});expect(changed).toHaveBeenCalledWith(original);
    expect(()=>store.watch('foreign','fixture',changed,failed)).toThrow('authorized');
  });
  it('holds a quiet wait for its full 50-second bound and detaches on timeout',async()=>{
    vi.useFakeTimers();const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);await f.pair();let settled=false;
    const waiting=f.relay.wait(OWNER,j.id,50).then(value=>{settled=true;return value;});await vi.advanceTimersByTimeAsync(0);const reads=f.store.reads;
    f.advance(49999);await vi.advanceTimersByTimeAsync(49999);expect(settled).toBe(false);
    f.advance(1);await vi.advanceTimersByTimeAsync(1);expect((await waiting).status).toBe('running');
    expect(f.store.reads).toBe(reads);expect(f.store.listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);
  });
  it.each(['waiting_for_user','completed','failed','interrupted'])('returns %s immediately and releases its listener',async status=>{
    vi.useFakeTimers();const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args),claim=(await f.pair()).job!;
    const waiting=f.relay.wait(OWNER,j.id,20);await vi.advanceTimersByTimeAsync(0);
    await f.relay.report(OWNER,{...claim,snapshot:{status,pending:status==='waiting_for_user'?[{id:'approval-one',kind:'approval'}]:[],final:status==='completed'?'Actual final':null}});
    expect((await waiting).status).toBe(status);expect(f.store.listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);
    expect((await f.relay.wait(OWNER,j.id,20)).status).toBe(status);expect(f.store.listeners.size).toBe(0);
  });
  it('returns cancellation without delaying the worker controls',async()=>{
    vi.useFakeTimers();const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);await f.pair();
    const waiting=f.relay.wait(OWNER,j.id,20);await vi.advanceTimersByTimeAsync(0);await f.relay.cancel(OWNER,j.id);
    expect((await waiting).cancelRequested).toBe(true);expect(f.store.listeners.size).toBe(0);
  });
  it('surfaces queue expiry and lost leases without another database write',async()=>{
    vi.useFakeTimers();const f=fixture();await f.pair();const queued=await f.relay.start(OWNER,f.args);f.advance(119990);
    const waiting=f.relay.wait(OWNER,queued.id,20);await vi.advanceTimersByTimeAsync(0);f.advance(11);await vi.advanceTimersByTimeAsync(11);
    expect((await waiting).status).toBe('failed');expect(f.store.listeners.size).toBe(0);
    const g=fixture();await g.pair();const active=await g.relay.start(OWNER,g.args);await g.pair();g.advance(89990);
    const lost=g.relay.wait(OWNER,active.id,20);await vi.advanceTimersByTimeAsync(0);g.advance(11);await vi.advanceTimersByTimeAsync(11);
    expect((await lost).status).toBe('interrupted');expect(g.store.listeners.size).toBe(0);
  });
  it('does not miss completion between the initial read and listener attachment',async()=>{
    const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);await f.pair();const watch=f.store.watch.bind(f.store);
    vi.spyOn(f.store,'watch').mockImplementation((uid,id,changed,failed)=>{
      const job=f.store.jobs.get(id)!;job.status='completed';job.snapshot={status:'completed',final:'Finished during attachment'};
      return watch(uid,id,changed,failed);
    });
    expect((await f.relay.wait(OWNER,j.id,20)).final).toBe('Finished during attachment');expect(f.store.listeners.size).toBe(0);
  });
  it('detaches on disconnect and listener errors, and rejects foreign owners before reading',async()=>{
    vi.useFakeTimers();const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);await f.pair();const abort=new AbortController();
    const waiting=expect(f.relay.wait(OWNER,j.id,20,abort.signal)).rejects.toThrow('cancelled');await vi.advanceTimersByTimeAsync(0);abort.abort();await waiting;
    expect(f.store.listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);
    const failure=expect(f.relay.wait(OWNER,j.id,20)).rejects.toThrow('listener failed');await vi.advanceTimersByTimeAsync(0);
    for(const listener of f.store.listeners.get(j.id)||[])listener.failed(new Error('listener failed'));await failure;
    expect(f.store.listeners.size).toBe(0);expect(vi.getTimerCount()).toBe(0);const reads=f.store.reads;
    await expect(f.relay.wait('foreign',j.id,20)).rejects.toThrow('authorized');expect(f.store.reads).toBe(reads);
  });
  it('exposes bounded waits through the real MCP handler and cancels them when the HTTP request closes',async()=>{
    const f=fixture();await f.pair();const j=await f.relay.start(OWNER,f.args);await f.pair();
    const request=new AbortController(),server=createCodexServer(f.relay,OWNER,request.signal),client=new Client({name:'wait-test',version:'1'});
    const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
    try{
      const immediate=await client.callTool({name:'get_task',arguments:{task_id:j.id,wait_seconds:0}});expect(immediate.isError).not.toBe(true);expect(f.store.listeners.size).toBe(0);
      const waiting=client.callTool({name:'get_task',arguments:{task_id:j.id,wait_seconds:50}});
      await vi.waitFor(()=>expect(f.store.listeners.size).toBe(1));request.abort();
      expect((await waiting).isError).toBe(true);expect(f.store.listeners.size).toBe(0);
    }finally{await client.close();await server.close();}
  });
});
