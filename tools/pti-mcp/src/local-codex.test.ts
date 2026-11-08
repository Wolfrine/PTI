import {afterEach,describe,it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {InMemoryTransport} from '@modelcontextprotocol/sdk/inMemory.js';
import {CodexRelay,createCodexServer,FirestoreRelayStore,OWNER,heartbeatSchema,workerPollSchema,workerReportSchema,type RelayStore,type Job,type Worker} from './local-codex.js';
import {capacity,type SchedulerPatch} from './local-codex-admission.js';
import type {ChatAffinity} from './local-codex-affinity.js';
import type {SelectAffinity} from './local-codex.js';
import {createHttpApp} from './http-app.js';
import {PtiOAuthProvider,CODEX_SCOPE} from './oauth.js';
class Memory implements RelayStore {
  jobs=new Map<string,Job>(); host?:Worker;
  modules=new Map<string,ChatAffinity>();
  listeners=new Map<string,Set<{changed:(job:Job|undefined)=>void;failed:(error:Error)=>void}>>(); reads=0;
  async read(_uid:string,id:string){this.reads++;return structuredClone(this.jobs.get(id));}
  async readMany(uid:string,ids:string[]){return Promise.all(ids.map(id=>this.read(uid,id)));}
  watch(_uid:string,id:string,changed:(job:Job|undefined)=>void,failed:(error:Error)=>void){
    const entry={changed,failed},listeners=this.listeners.get(id)||new Set();this.listeners.set(id,listeners);listeners.add(entry);
    queueMicrotask(()=>{if(listeners.has(entry))changed(structuredClone(this.jobs.get(id)));});
    return ()=>{listeners.delete(entry);if(!listeners.size)this.listeners.delete(id);};
  }
  async worker(){return this.host;}
  async heartbeat(_uid:string,w:Worker){const reservations=this.host?.reservations;this.host={...structuredClone(w),reservations,maxConcurrentTasks:capacity(w)};}
  async queued(){return [...this.jobs.values()].filter(j=>j.status==='queued').map(j=>j.id);}
  async list(){return [...this.jobs.values()].sort((a,b)=>b.updatedAt-a.updatedAt);}
  async clearActive(_uid:string,id:string){if(this.host?.activeTask===id)this.host.activeTask=null;}
  async update<T>(_uid:string,id:string,fn:(job:Job|undefined,worker:Worker|undefined,affinity?:ChatAffinity)=>{job:Job;result:T;scheduler?:SchedulerPatch;affinity?:ChatAffinity},selectAffinity?:SelectAffinity){const old=structuredClone(this.jobs.get(id)),host=structuredClone(this.host),scope=selectAffinity?selectAffinity(old,host):old?.affinityId;const result=fn(old,host,structuredClone(scope?this.modules.get(scope):undefined));this.jobs.set(id,result.job);if(result.affinity)this.modules.set(result.affinity.id,structuredClone(result.affinity));if(result.scheduler&&this.host)Object.assign(this.host,structuredClone(result.scheduler));for(const listener of this.listeners.get(id)||[])listener.changed(structuredClone(result.job));return result.result;}
}
function fixture(){let at=1000000;const store=new Memory(),relay=new CodexRelay(store,()=>at);const heartbeat={instanceId:randomUUID(),authMode:'chatgpt' as const,version:'0.3.0',projects:[{key:'scratch',name:'Scratch',path:'F:/scratch',available:true}]};const args={project:'scratch',prompt:'inspect',mode:'inspect' as const,request_key:'request-one'};return {store,relay,heartbeat,args,advance:(ms:number)=>at+=ms,pair:()=>relay.poll(OWNER,{heartbeat})};}
function concurrentFixture(maxConcurrentTasks:number|null=3){
  const f=fixture(),heartbeat=heartbeatSchema.parse({...f.heartbeat,version:maxConcurrentTasks===null?'0.4.2':'0.4.0',maxConcurrentTasks,maxSubagentsPerTask:maxConcurrentTasks===null?null:2,maxTaskMinutes:null,projects:[
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
function moduleFixture(){const f=concurrentFixture(null);f.heartbeat.version='0.4.4';return f;}
describe('module parent lifecycle',()=>{
  const native='01900000-0000-7000-8000-000000000071';
  async function completed(f:ReturnType<typeof moduleFixture>,args:Parameters<CodexRelay['start']>[1],thread=native){
    const task=await f.relay.start(OWNER,args),claim=(await f.pair()).jobs!.find(value=>value.id===task.id)!;
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:thread}});return task;
  }
  it('reuses work keys after learning a native thread, while source provenance and exact-request idempotency remain strict',async()=>{
    const f=moduleFixture();await f.pair();const args={...f.args,work_key:'lifecycle-outcome',module_key:'local-codex'};
    const first=await completed(f,args);
    expect(await f.relay.start(OWNER,{...args,request_key:'fresh-retry-key'})).toMatchObject({id:first.id,reused:true,followup_required:false,thread_id:native});
    expect(await f.relay.start(OWNER,{...args,request_key:'followup-key',prompt:'same outcome followup'})).toMatchObject({id:first.id,reused:true,followup_required:true});
    await expect(f.relay.start(OWNER,{...args,prompt:'changed exact request'})).rejects.toThrow('different work');
    await expect(f.relay.start(OWNER,{...args,request_key:'other-source',thread_id:native})).rejects.toThrow('different source');
    await expect(f.relay.start(OWNER,{...args,request_key:'other-module',module_key:'velum'})).rejects.toThrow('different source');
    const next=await f.relay.continue(OWNER,{task_id:first.id,prompt:'same outcome followup',request_key:'continue-outcome'});
    expect(next).toMatchObject({id:first.id,generation:2,thread_id:native});expect(f.store.jobs.size).toBe(1);
  });
  it('routes distinct work keys and inspect/edit authorizations to one durable parent, surviving a new router instance',async()=>{
    const f=moduleFixture();await f.pair();const first=await completed(f,{...f.args,work_key:'lifecycle-first',module_key:'local-codex'});
    const router=new CodexRelay(f.store,f.relay.clock);
    const second=await router.start(OWNER,{...f.args,work_key:'lifecycle-second',request_key:'second-outcome',module_key:'local-codex',mode:'edit'});
    expect(second.id).not.toBe(first.id);expect(second).toMatchObject({thread_id:native,mode:'edit',generation:1,chat_routing:{selection:'affinity'}});
    expect(f.store.jobs.get(second.id)).toMatchObject({sourceThreadId:null,threadId:native});
    const claim=(await f.pair()).jobs![0];expect(claim).toMatchObject({thread_id:native,mode:'edit',affinity_fallback:true});
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:native}});
    const third=await router.start(OWNER,{...f.args,work_key:'lifecycle-third',request_key:'third-outcome',module_key:'local-codex'});
    expect(third).toMatchObject({thread_id:native,mode:'inspect'});expect(new Set([first.id,second.id,third.id]).size).toBe(3);
    console.info('MOCK lifecycle mapping',JSON.stringify([{task:first.id,mode:'inspect',thread:native},{task:second.id,mode:'edit',thread:second.thread_id},{task:third.id,mode:'inspect',thread:third.thread_id}]));
  });
  it('keeps different modules, physical projects/checkouts and unlabelled requests separate without title guessing',async()=>{
    const f=moduleFixture();await f.pair();await completed(f,{...f.args,title:'Shared title',module_key:'local-codex'});
    for(const extra of [{module_key:'velum'},{module_key:'local-codex',project:'two'},{title:'Shared title'}]){
      const task=await f.relay.start(OWNER,{...f.args,request_key:'separate-'+JSON.stringify(extra),...extra});expect(task.thread_id).toBeUndefined();
      const claim=(await f.pair()).jobs![0];await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:'01900000-0000-7000-8000-000000000072'}});
    }
    f.heartbeat.projects[0].resourcePath='F:/NewCheckout';await f.pair();
    const moved=await f.relay.start(OWNER,{...f.args,request_key:'new-checkout',module_key:'local-codex'});expect(moved.thread_id).toBeUndefined();
  });
  it('serializes a module before its first thread is known and blocks rotation or continuation while its parent is reserved',async()=>{
    const f=moduleFixture();await f.pair();const first=await f.relay.start(OWNER,{...f.args,module_key:'local-codex'});
    await expect(f.relay.start(OWNER,{...f.args,request_key:'parallel-module',module_key:'local-codex'})).rejects.toThrow(first.id);
    expect(f.store.jobs.size).toBe(1);expect(f.store.modules.size).toBe(1);
    const claim=(await f.pair()).jobs![0];await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:native}});
    const next=await f.relay.start(OWNER,{...f.args,request_key:'next-module',module_key:'local-codex'});
    await expect(f.relay.continue(OWNER,{task_id:first.id,prompt:'continue',request_key:'old-continue'})).rejects.toThrow(next.id);
    await expect(f.relay.start(OWNER,{...f.args,request_key:'rotate-busy',module_key:'local-codex',chat_policy:'rotate',rotation_reason:'context-bloat',handoff:'Use repository decision evidence.'})).rejects.toThrow(next.id);
  });
  it('requires explicit rotation evidence and preserves the former task without archive/delete or stale-pointer overwrite',async()=>{
    const f=moduleFixture();await f.pair();const first=await completed(f,{...f.args,module_key:'local-codex'});
    await expect(f.relay.start(OWNER,{...f.args,request_key:'no-handoff',module_key:'local-codex',chat_policy:'rotate',rotation_reason:'context-bloat'})).rejects.toThrow('handoff');
    const rotated=await f.relay.start(OWNER,{...f.args,request_key:'rotate-module',module_key:'local-codex',chat_policy:'rotate',rotation_reason:'context-bloat',handoff:'Read the source decision; preserve current owner constraints.'});
    expect(rotated.thread_id).toBeUndefined();expect(rotated.chat_routing).toMatchObject({selection:'rotate',previous_thread_id:native,reason:'context-bloat'});
    const claim=(await f.pair()).jobs![0],replacement='01900000-0000-7000-8000-000000000073';
    expect(claim.handoff).toContain('source decision');await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:replacement}});
    expect(f.store.jobs.get(first.id)?.threadId).toBe(native);expect([...f.store.modules.values()][0].threadId).toBe(replacement);
    await f.relay.continue(OWNER,{task_id:first.id,prompt:'explicit old outcome followup',request_key:'continue-retired'});
    const older=(await f.pair()).jobs![0];expect(older.affinity_fallback).toBe(false);
    await f.relay.report(OWNER,{...older,snapshot:{status:'completed',thread_id:native}});
    expect([...f.store.modules.values()][0].threadId).toBe(replacement);
  });
  it('adopts only an explicitly selected source; rejects old workers and never substitutes the selected source in a report',async()=>{
    const f=moduleFixture();await f.pair();const task=await f.relay.start(OWNER,{...f.args,module_key:'local-codex',thread_id:native,work_key:'adopt-source-work'});
    const claim=(await f.pair()).jobs![0];expect(claim.affinity_fallback).toBe(false);
    await expect(f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:randomUUID()}})).rejects.toThrow('explicitly selected');
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:native}});
    expect(await f.relay.start(OWNER,{...f.args,module_key:'local-codex',thread_id:native,work_key:'adopt-source-work',request_key:'source-retry'})).toMatchObject({id:task.id,reused:true});
    const old=concurrentFixture(null);await old.pair();await expect(old.relay.start(OWNER,{...old.args,module_key:'local-codex'})).rejects.toThrow('0.4.4');
    await expect(f.relay.start('foreign',{...f.args,module_key:'local-codex'})).rejects.toThrow('authorized');
  });
  it('normalizes physical aliases and records fallback without allowing an old generation to replace affinity',async()=>{
    const f=moduleFixture();f.heartbeat.projects[1].path='f:\\repos\\MAIN\\';await f.pair();
    await completed(f,{...f.args,module_key:'local-codex'});
    const second=await f.relay.start(OWNER,{...f.args,project:'alias',module_key:'local-codex',request_key:'alias-reuse'});
    expect(second.thread_id).toBe(native);expect(f.store.modules.size).toBe(1);
    const claim=(await f.pair()).jobs![0],replacement='01900000-0000-7000-8000-000000000074';
    const routing={...second.chat_routing!,selection:'new',previous_thread_id:native,reason:'missing'};
    await f.relay.report(OWNER,{...claim,snapshot:{status:'running',chat_routing:routing}});
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:replacement,chat_routing:routing}});
    expect([...f.store.modules.values()][0].threadId).toBe(replacement);
    await f.relay.continue(OWNER,{task_id:second.id,prompt:'continue the same outcome',request_key:'follow-replaced'});
    await expect(f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:native}})).rejects.toThrow('lease_lost');
    const continued=(await f.pair()).jobs![0];
    await expect(f.relay.report(OWNER,{...continued,snapshot:{status:'completed',thread_id:native}})).rejects.toThrow('bound task thread');
  });
  it('reads and writes the owner module pointer in the same Firestore transaction as job and reservations',async()=>{
    const data=new Map<string,any>(),refs=new Map<string,any>(),transactions:string[][]=[];
    const ref=(path:string):any=>{if(!refs.has(path))refs.set(path,{path,collection:(name:string)=>({doc:(id:string)=>ref(`${path}/${name}/${id}`)}),get:async()=>({data:()=>structuredClone(data.get(path))})});return refs.get(path);};
    const db={doc:ref,runTransaction:async(fn:any)=>{const writes:{ref:any;value:any;options?:any}[]=[],reads:string[]=[];const result=await fn({get:async(value:any)=>{expect(writes).toHaveLength(0);reads.push(value.path);return {data:()=>structuredClone(data.get(value.path))};},set:(r:any,value:any,options:any)=>writes.push({ref:r,value,options})});for(const write of writes)data.set(write.ref.path,write.options?.merge?{...data.get(write.ref.path),...write.value}:write.value);transactions.push(writes.map(w=>w.ref.path));return result;}};
    const f=moduleFixture(),root=`_ptiLocalServices/local-codex/owners/${OWNER}`;data.set(root,{...f.heartbeat,at:f.relay.clock()});
    const router=new CodexRelay(new FirestoreRelayStore(db as never),f.relay.clock);
    const first=await router.start(OWNER,{...f.args,module_key:'local-codex'});
    const affinity=[...data.keys()].find(path=>path.includes('/modules/'))!;
    expect(transactions[0]).toEqual(expect.arrayContaining([`${root}/jobs/${first.id}`,root,affinity,`${root}/signals/dispatch`]));
    expect(data.get(affinity)).not.toHaveProperty('prompt');
    await expect(router.start(OWNER,{...f.args,module_key:'local-codex',request_key:'second-atomic'})).rejects.toThrow(first.id);
    expect(transactions).toHaveLength(1);expect(data.get(affinity).lastTaskId).toBe(first.id);
    expect(await router.start(OWNER,{...f.args,module_key:'local-codex'})).toMatchObject({id:first.id});expect(transactions[1]).toEqual([]);
  });
  it('exposes optional module/rotation fields over MCP and refuses queued routing after a worker downgrade',async()=>{
    const f=moduleFixture();await f.pair();const server=createCodexServer(f.relay,OWNER),client=new Client({name:'module-schema',version:'1'});
    const [a,b]=InMemoryTransport.createLinkedPair();await Promise.all([server.connect(a),client.connect(b)]);
    try{
      const listing=await client.listTools();expect(listing.tools).toHaveLength(19);
      const start=listing.tools.find(tool=>tool.name==='start_task')!;expect(start.inputSchema.properties).toHaveProperty('module_key');expect(start.inputSchema.required||[]).not.toContain('module_key');
      expect(start.inputSchema.properties).toHaveProperty('rotation_reason');
      const result=await client.callTool({name:'start_task',arguments:{...f.args,module_key:'local-codex'}});expect(result.isError).not.toBe(true);
      const task=JSON.parse((result.content as {text:string}[])[0].text);expect(task.module_key).toBe('local-codex');
      expect((await f.relay.list(OWNER,{module_key:'local-codex',limit:10})).tasks[0].module_key).toBe('local-codex');
      f.heartbeat.version='0.4.3';expect((await f.pair()).jobs).toHaveLength(0);
      expect(await f.relay.get(OWNER,task.id)).toMatchObject({status:'failed',error:expect.stringContaining('worker 0.4.4')});
    }finally{await client.close();await server.close();}
  });
});
describe('Local Codex relay',()=>{
  it('waits for terminal progress after an already acknowledged cancellation instead of returning in a hot loop',async()=>{
    const f=fixture();await f.pair();const task=await f.relay.start(OWNER,f.args),claim=(await f.pair()).job!;
    await f.relay.cancel(OWNER,task.id);let returned=false;
    const waiting=f.relay.wait(OWNER,task.id,1).then(value=>{returned=true;return value;});
    await new Promise(resolve=>setImmediate(resolve));expect(returned).toBe(false);
    await f.relay.report(OWNER,{...claim,snapshot:{status:'interrupted'}});
    expect((await waiting).status).toBe('interrupted');expect(f.store.listeners.size).toBe(0);
  });
  it('admits and renews more than four parents without replacing the removed ceiling',async()=>{
    const f=concurrentFixture(null);await f.pair();
    const tasks=await Promise.all(Array.from({length:25},(_,i)=>f.relay.start(OWNER,{...f.args,request_key:`uncapped-${i}`})));
    expect(tasks).toHaveLength(25);expect(f.store.host?.reservations).toHaveLength(25);
    expect(await f.relay.status(OWNER)).toMatchObject({capacity:null,capacityLimited:false,usedSlots:25,availableSlots:null,busy:false,canAcceptMore:true,maxSubagentsPerTask:null,maxTaskMinutes:null,limitPolicy:'owner-only'});
    const claims=(await f.pair()).jobs!;expect(claims).toHaveLength(25);
    expect(workerPollSchema.safeParse({heartbeat:f.heartbeat,active:claims.map(({id,generation,lease})=>({id,generation,lease}))}).success).toBe(true);
    await f.relay.cancel(OWNER,tasks[3].id);
    const controls=await f.pair(claims);expect(controls.controls![tasks[3].id].cancel).toBe(true);expect(controls.controls![tasks[24].id].cancel).toBe(false);
    expect(await f.relay.status(OWNER)).toMatchObject({usedSlots:25,canAcceptMore:true});
    expect(await f.relay.start(OWNER,{...f.args,request_key:'uncapped-24'})).toMatchObject({id:tasks[24].id});
  });
  it('does not clamp an explicitly owner-selected finite capacity to four',async()=>{
    const f=concurrentFixture(9);await f.pair();for(let i=0;i<9;i++)await f.relay.start(OWNER,{...f.args,request_key:`finite-${i}`});
    expect(await f.relay.status(OWNER)).toMatchObject({capacity:9,usedSlots:9,canAcceptMore:false});
    await expect(f.relay.start(OWNER,{...f.args,request_key:'finite-extra'})).rejects.toThrow('capacity');
  });
  it('drains paginated transport batches beyond ten without limiting active parents and renews every existing claim',async()=>{
    const f=concurrentFixture(null),queued=f.store.queued.bind(f.store);f.store.queued=async()=> (await queued()).slice(0,10);await f.pair();
    const tasks=await Promise.all(Array.from({length:25},(_,i)=>f.relay.start(OWNER,{...f.args,request_key:`paged-${i}`})));
    let active:NonNullable<Awaited<ReturnType<typeof f.pair>>['jobs']>=[];
    for(const expected of [10,10,5]){const response=await f.pair(active);expect(response.jobs).toHaveLength(expected);active.push(...response.jobs!);}
    expect(active).toHaveLength(25);expect(new Set(active.map(c=>c.id)).size).toBe(25);expect((await f.store.queued())).toHaveLength(0);
    const before=f.store.jobs.get(tasks[24].id)!.leaseUntil!;f.advance(31000);const refreshed=await f.pair(active);
    expect(Object.keys(refreshed.controls!)).toHaveLength(25);expect(f.store.jobs.get(tasks[24].id)!.leaseUntil).toBeGreaterThan(before);
    expect(await f.relay.status(OWNER)).toMatchObject({usedSlots:25,capacity:null,canAcceptMore:true});
  });
  it('continues the same task beyond one hundred prior turns and keeps more than twenty human answers',async()=>{
    const f=concurrentFixture(null);await f.pair();const task=await f.relay.start(OWNER,f.args),claim=(await f.pair()).jobs![0];
    await f.relay.report(OWNER,{...claim,snapshot:{status:'completed',thread_id:randomUUID()}});
    const stored=f.store.jobs.get(task.id)!;stored.history=Array.from({length:150},(_,i)=>({key:'previous-'+i,inputHash:'hash-'+i}));stored.generation=151;
    const continued=await f.relay.continue(OWNER,{task_id:task.id,prompt:'Continue',request_key:'turn-after-one-hundred'});expect(continued).toMatchObject({generation:152});
    const current=(await f.pair()).jobs![0];
    for(let i=0;i<25;i++){
      const request_id='question-'+i;await f.relay.report(OWNER,{...current,snapshot:{status:'waiting_for_user',pending:[{id:request_id,kind:'question',details:{questions:[{id:'choice'}]}}]}});
      await f.relay.respond(OWNER,{task_id:task.id,request_id,answers:{choice:['actual human answer']}});
    }
    expect(f.store.jobs.get(task.id)!.responses).toHaveLength(25);
  });
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
  it('looks up exact review identities beyond the recent listing with the existing sanitizer and owner boundary',async()=>{
    const f=fixture();await f.pair();const task=await f.relay.start(OWNER,{...f.args,prompt:'PRIVATE_PROMPT',title:'PRIVATE_TITLE'}),seed=f.store.jobs.get(task.id)!;
    const ids=Array.from({length:105},(_,index)=>(index+1).toString(16).padStart(32,'0'));
    f.store.jobs.clear();for(const [index,id] of ids.entries())f.store.jobs.set(id,{...seed,id,updatedAt:seed.updatedAt+index,status:'completed',snapshot:{status:'completed',final:'PRIVATE_FINAL'},ownerOutcome:'needs_rework',outcomeAt:seed.updatedAt,outcomeGeneration:1});
    const list=vi.spyOn(f.store,'list').mockImplementation(async()=>[...f.store.jobs.values()].sort((a,b)=>b.updatedAt-a.updatedAt).slice(0,100));
    expect((await f.relay.reviewData(OWNER)).jobs.some(job=>job.id===ids[0])).toBe(false);
    const missing='f'.repeat(32),review=await f.relay.reviewData(OWNER,{task_ids:[ids[0],missing,ids[0]]});
    expect(review).toMatchObject({coverage:'requested-jobs',limit:null,has_more:false,requestedJobs:2,missingTaskIds:[missing],jobs:[{id:ids[0],ownerOutcome:'needs_rework'}]});
    expect(list).toHaveBeenCalledOnce();expect(JSON.stringify(review)).not.toContain('PRIVATE_');
    expect((await f.relay.reviewData(OWNER,{task_ids:[]})).jobs).toEqual([]);
    await expect(f.relay.reviewData('foreign',{task_ids:[ids[0]]})).rejects.toThrow('authorized');
    for(const input of [{task_ids:['../foreign']},{task_ids:ids},{task_ids:[ids[0]],prompt:'PRIVATE_RAW'}])await expect(f.relay.reviewData(OWNER,input)).rejects.toThrow();
  });
  it('uses one owner-scoped Firestore multi-get for review identities and preserves missing positions',async()=>{
    const refs:string[]=[],getAll=vi.fn(async(...ids:string[])=>ids.map((id,index)=>({data:()=>index?undefined:{id}})));
    const db={doc:(root:string)=>({collection:(collection:string)=>({doc:(id:string)=>{const ref=`${root}/${collection}/${id}`;refs.push(ref);return ref;}})}),getAll};
    const store=new FirestoreRelayStore(db as never),ids=['a'.repeat(32),'b'.repeat(32)];
    expect(await store.readMany(OWNER,ids)).toEqual([{id:`_ptiLocalServices/local-codex/owners/${OWNER}/jobs/${ids[0]}`},undefined]);
    expect(getAll).toHaveBeenCalledOnce();expect(refs).toHaveLength(2);
    expect(await store.readMany(OWNER,[])).toEqual([]);expect(getAll).toHaveBeenCalledOnce();
    await expect(store.readMany('foreign',ids)).rejects.toThrow('authorized');expect(getAll).toHaveBeenCalledOnce();
  });
  it('returns only strictly validated execution permission metadata through the normal task read',async()=>{
    const f=fixture();await f.relay.poll(OWNER,{heartbeat:f.heartbeat});
    const task=await f.relay.start(OWNER,{...f.args,mode:'edit'}),claim=(await f.relay.poll(OWNER,{heartbeat:f.heartbeat})).job!;
    const policy={version:1,mode:'edit',sandboxType:'dangerFullAccess',approvalPolicy:'never',instructionRefresh:'history-injection',verifiedAt:new Date().toISOString()};
    const report={id:claim.id,generation:claim.generation,lease:claim.lease,snapshot:{status:'completed',execution_policy:policy}};
    await expect(f.relay.report(OWNER,{...report,snapshot:{...report.snapshot,execution_policy:{...policy,mode:'inspect',sandboxType:'readOnly'}}})).rejects.toThrow('admitted task mode');
    await f.relay.report(OWNER,workerReportSchema.parse(report));
    expect(await f.relay.get(OWNER,task.id)).toMatchObject({execution_policy:policy});
    for(const patch of [{credential:'PRIVATE_RAW'},{sandboxType:'workspaceWrite'},{approvalPolicy:'on-request'},{mode:'inspect'}])expect(workerReportSchema.safeParse({...report,snapshot:{...report.snapshot,execution_policy:{...policy,...patch}}}).success).toBe(false);
  });
  it('reports configured model preference and retains the confirmed turn model and effort',async()=>{
    const f=fixture();const heartbeat=heartbeatSchema.parse({...f.heartbeat,version:'0.3.3',model:'gpt-6.1-sol',reasoning_effort:'xhigh'});
    await f.relay.poll(OWNER,{heartbeat});
    expect(await f.relay.status(OWNER)).toMatchObject({version:'0.4.9',workerVersion:'0.3.3',model:'gpt-6.1-sol',reasoning_effort:'xhigh'});
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
    expect(settled).toBe(false);expect(f.store.reads).toBe(reads);expect(f.store.jobs.get(j.id)?.updatedAt).toBe(Date.parse(before.updatedAt));
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
  it('forwards exact review scopes over the authenticated worker HTTP route and rejects foreign identities',async()=>{
    const f=fixture();await f.pair();const task=await f.relay.start(OWNER,f.args);
    const provider=new PtiOAuthProvider({get:async()=>undefined,put:async()=>{},consume:async()=>{throw Error('Unused test grant');}} as never,'https://pti.example',async()=>{});
    const app=createHttpApp({provider,codex:f.relay,verifyIdentity:async token=>({uid:token==='owner'?OWNER:'foreign',email:'fixture@example.test',authenticatedAt:1}),firebaseConfig:{},createServer:()=>{throw Error('Unused root route');}});
    const http=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>http.on('listening',resolve));
    try{
      const url=`http://127.0.0.1:${(http.address() as {port:number}).port}/local-codex/worker/review_data`;
      const post=(body:unknown,token='owner')=>fetch(url,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      expect(await (await post({task_ids:[task.id]})).json()).toMatchObject({coverage:'requested-jobs',jobs:[{id:task.id}]});
      expect(await (await post({task_ids:[]})).json()).toMatchObject({coverage:'requested-jobs',jobs:[]});
      expect(await (await post({})).json()).toMatchObject({coverage:'most-recent-100-jobs',jobs:[{id:task.id}]});
      expect((await post({task_ids:[task.id]},'foreign')).status).toBe(400);
      expect((await post({task_ids:['bad']})).status).toBe(400);
    }finally{http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()));}
  });
  it('detaches the Firestore wait when an actual HTTP client disconnects',async()=>{
    const f=fixture();await f.pair();const job=await f.relay.start(OWNER,f.args);await f.pair();
    const provider=new PtiOAuthProvider({get:async()=>undefined,put:async()=>{},consume:async()=>{throw Error('Unused test grant');}} as never,'https://pti.example',async()=>{});
    // Authentication is a fixture here; the production HTTP response close and
    // real MCP tool/listener lifecycle are exercised through a local socket.
    vi.spyOn(provider,'verifyAccessToken').mockImplementation(async token=>({token,clientId:'fixture',scopes:[CODEX_SCOPE],expiresAt:Math.floor(Date.now()/1000)+60,resource:new URL('https://pti.example/local-codex/mcp'),extra:{uid:OWNER}}));
    const app=createHttpApp({provider,codex:f.relay,verifyIdentity:async()=>{throw Error('Unused worker route');},firebaseConfig:{},createServer:()=>{throw Error('Unused root route');}});
    const http=app.listen(0,'127.0.0.1'),abort=new AbortController();
    await new Promise<void>(resolve=>http.on('listening',resolve));
    try{
      const base=`http://127.0.0.1:${(http.address() as {port:number}).port}`;
      const response=fetch(base+'/local-codex/mcp',{method:'POST',headers:{Authorization:'Bearer fixture-token','Content-Type':'application/json',Accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'get_task',arguments:{task_id:job.id,wait_seconds:50}}}),signal:abort.signal}).catch(error=>error);
      await vi.waitFor(()=>expect(f.store.listeners.size).toBe(1));abort.abort();
      expect((await response).name).toBe('AbortError');await vi.waitFor(()=>expect(f.store.listeners.size).toBe(0));
    }finally{abort.abort();http.closeAllConnections();await new Promise<void>(resolve=>http.close(()=>resolve()));}
  });
});
