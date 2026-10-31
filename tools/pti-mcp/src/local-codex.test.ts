import {afterEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {CodexRelay,createCodexServer,FirestoreRelayStore,OWNER,heartbeatSchema,workerPollSchema,workerReportSchema,type RelayStore,type Job,type Worker} from './local-codex.js';
import type {SchedulerPatch} from './local-codex-admission.js';
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
  async heartbeat(_uid:string,w:Worker){const reservations=this.host?.reservations;this.host={...structuredClone(w),reservations,maxConcurrentTasks:Number(w.version.split('.')[1])>=4?w.maxConcurrentTasks||3:1};}
  async queued(){return [...this.jobs.values()].filter(j=>j.status==='queued').map(j=>j.id);}
  async list(){return [...this.jobs.values()].sort((a,b)=>b.updatedAt-a.updatedAt);}
  async clearActive(_uid:string,id:string){if(this.host?.activeTask===id)this.host.activeTask=null;}
  async update<T>(_uid:string,id:string,fn:(job:Job|undefined,worker:Worker|undefined)=>{job:Job;result:T;scheduler?:SchedulerPatch}){const result=fn(structuredClone(this.jobs.get(id)),structuredClone(this.host));this.jobs.set(id,result.job);if(result.scheduler&&this.host)Object.assign(this.host,structuredClone(result.scheduler));for(const listener of this.listeners.get(id)||[])listener.changed(structuredClone(result.job));return result.result;}
}
function fixture(){let at=1000000;const store=new Memory(),relay=new CodexRelay(store,()=>at);const heartbeat={instanceId:randomUUID(),authMode:'chatgpt' as const,version:'0.3.0',projects:[{key:'scratch',name:'Scratch',path:'F:/scratch',available:true}]};const args={project:'scratch',prompt:'inspect',mode:'inspect' as const,request_key:'request-one'};return {store,relay,heartbeat,args,advance:(ms:number)=>at+=ms,pair:()=>relay.poll(OWNER,{heartbeat})};}
function concurrentFixture(maxConcurrentTasks=3){
  const f=fixture(),heartbeat=heartbeatSchema.parse({...f.heartbeat,version:'0.4.0',maxConcurrentTasks,maxSubagentsPerTask:2,projects:[
    {key:'one',name:'One',path:'F:/Repos/Main',resourcePath:'F:/Repos/Main',available:true},
    {key:'alias',name:'Alias',path:'F:/Junction',resourcePath:'f:\\repos\\MAIN\\',available:true},
    {key:'nested',name:'Nested',path:'F:/Repos/Main/Sub',available:true},
    {key:'two',name:'Two',path:'F:/Repos/Other',available:true},
    {key:'similar',name:'Similar',path:'F:/Repos/Main-Other',available:true},
  ]});
  return {...f,heartbeat,args:{...f.args,project:'one'},pair:(active:{id:string;generation:number;lease:string}[]=[])=>f.relay.poll(OWNER,{heartbeat,active})};
}
function safeTelemetry(){return {schemaVersion:1,runId:randomUUID(),generation:1,tokenBasis:'latest-response',strategy:'auto',purpose:'work',startedAt:new Date(1000000).toISOString(),finishedAt:new Date(1000100).toISOString(),durationMs:100,waitingMs:0,approvals:0,questions:0,commands:0,toolCalls:0,toolFailures:0,modelReroutes:0,parentUsage:null,usageCoverage:'none',children:[],childrenSeen:0};}
afterEach(()=>vi.useRealTimers());
describe('Local Codex relay',()=>{
  it('reserves modern capacity atomically for queued work and deduplicates retries even when full',async()=>{
    const f=concurrentFixture();await f.pair();
    const submissions=await Promise.allSettled(Array.from({length:9},(_,i)=>f.relay.start(OWNER,{...f.args,request_key:`concurrent-${i}`})));
    expect(submissions.filter(result=>result.status==='fulfilled')).toHaveLength(3);expect(f.store.jobs.size).toBe(3);expect(f.store.host?.reservations).toHaveLength(3);
    expect(await f.relay.status(OWNER)).toMatchObject({capacity:3,usedSlots:3,availableSlots:0,busy:true,canAcceptMore:false});
    const retry=await f.relay.start(OWNER,{...f.args,request_key:'concurrent-0'});expect(f.store.jobs.size).toBe(3);
    await expect(f.relay.start(OWNER,{...f.args,request_key:'concurrent-0',strategy:'single'})).rejects.toThrow('different');
    const response=await f.pair();expect(response.jobs).toHaveLength(3);expect(response.jobs?.some(job=>job.id===retry.id)).toBe(true);
    expect(new Set(response.jobs?.map(job=>job.id)).size).toBe(3);
    expect(await f.relay.status(OWNER)).toHaveProperty('activeTasks',expect.arrayContaining([{id:retry.id,project:'one',mode:'inspect',resourcePath:'F:/Repos/Main',status:'running'}]));
  });
  it('allows independent edits and shared inspections while blocking nested, aliased and case-varied read/write conflicts',async()=>{
    const f=concurrentFixture();await f.pair();
    const first=await f.relay.start(OWNER,{...f.args,mode:'edit'});
    for(const project of ['one','alias','nested'])await expect(f.relay.start(OWNER,{...f.args,project,request_key:`blocked-${project}`})).rejects.toThrow(first.id);
    expect(f.store.jobs.size).toBe(1);
    await f.relay.start(OWNER,{...f.args,mode:'edit',project:'two',request_key:'other-repository'});
    await f.relay.start(OWNER,{...f.args,mode:'edit',project:'similar',request_key:'similar-path-not-nested'});expect(f.store.jobs.size).toBe(3);
    const g=concurrentFixture();await g.pair();await g.relay.start(OWNER,g.args);await g.relay.start(OWNER,{...g.args,project:'alias',request_key:'second-reader'});
    expect(await g.relay.status(OWNER)).toMatchObject({usedSlots:2,availableSlots:1,busy:false});
    await expect(g.relay.start(OWNER,{...g.args,mode:'edit',project:'nested',request_key:'writer-after-readers'})).rejects.toThrow('conflicts');
  });
  it('binds same native threads exclusively while permitting no-model list/read beside running work',async()=>{
    const f=concurrentFixture(4),thread=randomUUID();await f.pair();
    const first=await f.relay.start(OWNER,{...f.args,mode:'edit',thread_id:thread});
    await expect(f.relay.start(OWNER,{...f.args,project:'two',thread_id:thread,request_key:'same-thread'})).rejects.toThrow(first.id);
    await expect(f.relay.command(OWNER,{action:'rename',args:{thread_id:thread,title:'Busy thread'}},'same-thread-rename')).rejects.toThrow(first.id);
    await f.relay.command(OWNER,{action:'list',args:{}},'parallel-history-list');
    await f.relay.command(OWNER,{action:'read',args:{thread_id:thread}},'parallel-history-read');
    expect((await f.pair()).jobs).toHaveLength(3);expect(f.store.jobs.size).toBe(3);
  });
  it('isolates pending answers, cancellation and lost claims between concurrent jobs',async()=>{
    const f=concurrentFixture();await f.pair();
    const a=await f.relay.start(OWNER,f.args),b=await f.relay.start(OWNER,{...f.args,project:'two',request_key:'second-job'}),response=await f.pair();
    const claimA=response.jobs!.find(job=>job.id===a.id)!,claimB=response.jobs!.find(job=>job.id===b.id)!;
    await f.relay.report(OWNER,{...claimA,snapshot:{status:'waiting_for_user',pending:[{id:'owner-approval',kind:'approval'}]}});
    await f.relay.respond(OWNER,{task_id:a.id,request_id:'owner-approval',decision:'decline'});await f.relay.cancel(OWNER,b.id);
    const controls=await f.pair([claimA,claimB]);expect(controls.controls![a.id]).toMatchObject({cancel:false,responses:[{task_id:a.id,request_id:'owner-approval',decision:'decline'}]});
    expect(controls.controls![b.id]).toMatchObject({cancel:true,responses:[]});
    const partial=await f.pair([{...claimA,lease:randomUUID()},claimB]);expect(partial.lost).toEqual([a.id]);expect(partial.controls![b.id]).toMatchObject({cancel:true});
    expect((await f.relay.get(OWNER,b.id)).status).toBe('running');
  });
  it('keeps thread ownership on continuation and stale completion cannot release a newer generation reservation',async()=>{
    const f=concurrentFixture(),thread=randomUUID();await f.pair();const a=await f.relay.start(OWNER,f.args),claim=(await f.pair()).jobs![0];
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:thread}});
    expect(f.store.jobs.get(a.id)?.threadId).toBe(thread);
    const continued=await f.relay.continue(OWNER,{task_id:a.id,prompt:'Continue',request_key:'generation-two'});expect(continued).toMatchObject({generation:2,thread_id:thread});
    await expect(f.relay.report(OWNER,{...claim,snapshot:{status:'completed'}})).rejects.toThrow('lease_lost');
    await expect(f.relay.start(OWNER,{...f.args,project:'two',thread_id:thread,request_key:'concurrent-old-thread'})).rejects.toThrow(a.id);
    expect(f.store.host?.reservations).toMatchObject([{id:a.id,generation:2,threadId:thread}]);
  });
  it('frees expired queued reservations without executing stale work and keeps waiting owners reserved',async()=>{
    const f=concurrentFixture(1);await f.pair();const expired=await f.relay.start(OWNER,f.args);f.advance(120001);await f.pair();
    expect((await f.relay.get(OWNER,expired.id)).status).toBe('failed');expect(await f.relay.status(OWNER)).toMatchObject({usedSlots:0,availableSlots:1});
    const next=await f.relay.start(OWNER,{...f.args,request_key:'after-expiry'}),claim=(await f.pair()).jobs![0];
    await f.relay.report(OWNER,{...claim,snapshot:{status:'waiting_for_user',pending:[{id:'question',kind:'question'}]}});
    expect(await f.relay.status(OWNER)).toMatchObject({usedSlots:1,availableSlots:0});
    await expect(f.relay.start(OWNER,{...f.args,request_key:'waiting-owner-capacity'})).rejects.toThrow('capacity');
    await f.relay.cancel(OWNER,next.id);expect((await f.pair([claim])).controls![claim.id].cancel).toBe(true);
  });
  it('preserves reservations across modern and legacy heartbeats and gates the concurrent protocol',async()=>{
    const f=concurrentFixture();await f.pair();await f.relay.start(OWNER,f.args);const claim=(await f.pair()).jobs![0],before=structuredClone(f.store.host?.reservations);
    await f.pair([claim]);expect(f.store.host?.reservations).toMatchObject(before!);
    await f.relay.poll(OWNER,{heartbeat:{...f.heartbeat,version:'0.3.3'}});expect(f.store.host?.reservations).toMatchObject(before!);
    expect(await f.relay.status(OWNER)).toHaveProperty('capacity',1);
    await expect(f.relay.poll(OWNER,{heartbeat:{...f.heartbeat,version:'0.3.3'},active:[]})).rejects.toThrow('Upgrade');
    const duplicate={id:'a'.repeat(32),generation:1,lease:randomUUID()};expect(workerPollSchema.safeParse({heartbeat:f.heartbeat,active:[duplicate,duplicate]}).success).toBe(false);
  });
  it('refuses a changed project resource before executing queued work or continuing a prior native thread',async()=>{
    const f=concurrentFixture();await f.pair();const queued=await f.relay.start(OWNER,f.args);f.heartbeat.projects[0].resourcePath='F:/ChangedRepository';
    expect((await f.pair()).jobs).toHaveLength(0);expect((await f.relay.get(OWNER,queued.id)).status).toBe('failed');expect(await f.relay.status(OWNER)).toHaveProperty('usedSlots',0);
    const g=concurrentFixture();await g.pair();const task=await g.relay.start(OWNER,g.args),claim=(await g.pair()).jobs![0];await g.relay.report(OWNER,{...claim,snapshot:{status:'completed'}});
    g.heartbeat.projects[0].resourcePath='F:/ChangedRepository';await g.pair();
    await expect(g.relay.continue(OWNER,{task_id:task.id,prompt:'Continue',request_key:'changed-destination'})).rejects.toThrow('resource path changed');
  });
  it('requires explicit terminal-generation owner feedback, preserves corrections and keeps review data free of task contents',async()=>{
    const f=concurrentFixture();await f.pair();const task=await f.relay.start(OWNER,{...f.args,prompt:'PRIVATE_PROMPT',title:'PRIVATE_TITLE'});
    await expect(f.relay.recordOutcome('foreign',{task_id:task.id,generation:1,outcome:'accepted'})).rejects.toThrow('authorized');
    await expect(f.relay.recordOutcome(OWNER,{task_id:task.id,generation:1,outcome:'accepted'})).rejects.toThrow('terminal');
    const claim=(await f.pair()).jobs![0],telemetry=safeTelemetry();
    const report=workerReportSchema.parse({id:claim.id,generation:claim.generation,lease:claim.lease,snapshot:{status:'completed',final:'PRIVATE_FINAL',error:'PRIVATE_ERROR',telemetry}});
    await f.relay.report(OWNER,report);
    const first=await f.relay.recordOutcome(OWNER,{task_id:task.id,generation:1,outcome:'accepted'});f.advance(100);
    expect(await f.relay.recordOutcome(OWNER,{task_id:task.id,generation:1,outcome:'accepted'})).toEqual(first);
    await f.relay.recordOutcome(OWNER,{task_id:task.id,generation:1,outcome:'needs_rework'});
    await f.relay.continue(OWNER,{task_id:task.id,prompt:'PRIVATE_FOLLOW_UP',request_key:'continue-reviewed'});
    await expect(f.relay.recordOutcome(OWNER,{task_id:task.id,generation:1,outcome:'accepted'})).rejects.toThrow('generation');
    const review=await f.relay.reviewData(OWNER);expect(review.jobs[0]).toMatchObject({generation:2,ownerOutcome:null,outcomesHistory:[{generation:1,outcome:'needs_rework'}]});
    expect(JSON.stringify(review)).not.toContain('PRIVATE_');
    delete f.store.jobs.get(task.id)!.strategy;delete f.store.jobs.get(task.id)!.purpose;
    expect((await f.relay.reviewData(OWNER)).jobs[0]).toMatchObject({strategy:null,purpose:null});
    await expect(f.relay.reviewData('foreign')).rejects.toThrow('authorized');
    expect(workerReportSchema.safeParse({...report,snapshot:{...report.snapshot,telemetry:{...telemetry,prompt:'PRIVATE_RAW'}}}).success).toBe(false);
  });
  it('reports configured model preference and retains the confirmed turn model and effort',async()=>{
    const f=fixture();const heartbeat=heartbeatSchema.parse({...f.heartbeat,version:'0.3.3',model:'gpt-6.1-sol',reasoning_effort:'xhigh'});
    await f.relay.poll(OWNER,{heartbeat});
    expect(await f.relay.status(OWNER)).toMatchObject({version:'0.4.0',workerVersion:'0.3.3',model:'gpt-6.1-sol',reasoning_effort:'xhigh'});
    const task=await f.relay.start(OWNER,f.args),claim=(await f.relay.poll(OWNER,{heartbeat})).job!;
    const report=workerReportSchema.parse({id:claim.id,generation:claim.generation,lease:claim.lease,snapshot:{status:'completed',model:'gpt-6.1-sol',reasoning_effort:'xhigh',final:'Fixture result'}});
    await f.relay.report(OWNER,report);
    expect(await f.relay.get(OWNER,task.id)).toMatchObject({model:'gpt-6.1-sol',reasoning_effort:'xhigh'});
  });
  it('reuses a stable work key without silently submitting the next prompt, while keeping modes separate',async()=>{
    const f=fixture();await f.pair();const args={...f.args,title:'One outcome',work_key:'one-outcome'};
    const first=await f.relay.start(OWNER,args),again=await f.relay.start(OWNER,{...args,prompt:'follow up',request_key:'second-request'});
    expect(again).toMatchObject({id:first.id,reused:true,followup_required:true});expect(f.store.jobs.size).toBe(1);expect(f.store.jobs.get(first.id)?.prompt).toBe('inspect');
    await expect(f.relay.start(OWNER,{...args,prompt:'changed'})).rejects.toThrow('different');
    const claim=(await f.pair()).job!;await f.relay.report(OWNER,{...claim,snapshot:{status:'completed'}});
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
  it('merges runtime heartbeat without replacing server reservations and reserves a slot in the job transaction',async()=>{
    const reservation={id:'a'.repeat(32),generation:1,project:'one',mode:'inspect' as const,resourcePath:'F:/one',status:'queued' as const,until:2000000};
    let owner:any={reservations:[reservation]},job:any;const writes:any[]=[];
    const root={collection:()=>({doc:()=>ref}),set:async(value:any,options:any)=>{expect(options).toEqual({merge:true});Object.assign(owner,value);}},ref={};
    const db={doc:()=>root,runTransaction:async(fn:any)=>fn({get:async(value:unknown)=>({data:()=>structuredClone(value===root?owner:job)}),set:(value:unknown,data:any,options:any)=>{writes.push({value,data,options});if(value===root)Object.assign(owner,data);else job=data;}})};
    const store=new FirestoreRelayStore(db as never),f=concurrentFixture();
    await store.heartbeat(OWNER,{...f.heartbeat,at:1000000,reservations:[]});expect(owner.reservations).toEqual([reservation]);
    await store.update(OWNER,reservation.id,()=>({job:{id:reservation.id} as Job,result:true,scheduler:{reservations:[{...reservation,generation:2}]}}));
    expect(writes).toHaveLength(2);expect(writes[0].value).toBe(ref);expect(writes[1].value).toBe(root);expect(owner.reservations[0].generation).toBe(2);
    writes.length=0;await store.update(OWNER,reservation.id,existing=>({job:existing!,result:true,scheduler:{reservations:owner.reservations}}));expect(writes).toHaveLength(0);
    await store.heartbeat(OWNER,{...f.heartbeat,version:'0.3.3',at:1000000});expect(owner.maxConcurrentTasks).toBe(1);expect(owner.reservations[0].generation).toBe(2);
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
