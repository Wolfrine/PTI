import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {CodexRelay,OWNER,type RelayStore,type Job,type Worker} from './local-codex.js';
class Memory implements RelayStore {
  jobs=new Map<string,Job>(); host?:Worker;
  async read(_uid:string,id:string){return this.jobs.get(id);}
  async worker(){return this.host;}
  async heartbeat(_uid:string,w:Worker){this.host=structuredClone(w);}
  async queued(){return [...this.jobs.values()].filter(j=>j.status==='queued').map(j=>j.id);}
  async list(){return [...this.jobs.values()].sort((a,b)=>b.updatedAt-a.updatedAt);}
  async clearActive(_uid:string,id:string){if(this.host?.activeTask===id)this.host.activeTask=null;}
  async update<T>(_uid:string,id:string,fn:(job:Job|undefined,worker:Worker|undefined)=>{job:Job;result:T}){const result=fn(structuredClone(this.jobs.get(id)),structuredClone(this.host));this.jobs.set(id,result.job);return result.result;}
}
function fixture(){let at=1000000;const store=new Memory(),relay=new CodexRelay(store,()=>at);const heartbeat={instanceId:randomUUID(),authMode:'chatgpt' as const,version:'0.3.0',projects:[{key:'scratch',name:'Scratch',path:'F:/scratch',available:true}]};const args={project:'scratch',prompt:'inspect',mode:'inspect' as const,request_key:'request-one'};return {store,relay,heartbeat,args,advance:(ms:number)=>at+=ms,pair:()=>relay.poll(OWNER,{heartbeat})};}
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
});
