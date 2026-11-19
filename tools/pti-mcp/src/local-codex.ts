import {randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {z} from 'zod';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Firestore} from 'firebase-admin/firestore';
import {digest} from './auth-store.js';
import {browserContextSchema,HOST_VERSION,transportCapabilities} from './local-codex-capabilities.js';

export const OWNER='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
export const terminal=['completed','failed','interrupted'];
const id=z.string().regex(/^[a-f0-9]{32}$/),key=z.string().min(8).max(128),text=z.string().trim().min(1).max(24000),threadId=z.string().uuid(),title=z.string().trim().min(1).max(100);
const model=z.string().regex(/^[a-z0-9][a-z0-9._-]{0,99}$/i),effort=z.enum(['none','minimal','low','medium','high','xhigh','max','ultra']);
const project=z.object({key:z.string().regex(/^[a-z0-9-]{1,64}$/),name:z.string().max(100),path:z.string().regex(/^F:[\\/]/i).max(2048),resourcePath:z.string().regex(/^F:[\\/]/i).max(2048).optional(),available:z.boolean()}).strict();
export const heartbeatSchema=z.object({
  instanceId:z.string().uuid(),authMode:z.literal('chatgpt'),dispatchReady:z.boolean().optional(),version:z.string().max(40),model:z.string().max(100).optional(),reasoning_effort:z.string().max(20).optional(),projects:z.array(project),browser_context:browserContextSchema.optional(),
  runtimeRoot:z.string().max(2048).optional(),sourceSha:z.string().regex(/^[a-f0-9]{40}$/).nullable().optional(),
// Legacy heartbeat extras are ignored, never interpreted as scheduling policy.
}).strip();
export type Worker=z.infer<typeof heartbeatSchema>&{at:number};
type Command={action:string;args:Record<string,unknown>};
type Delivery={id:string;generation:number;instanceId:string;attemptedAt:number};
export type Job={
  id:string;project:string;mode:'inspect'|'edit';prompt:string;inputHash:string;generation:number;status:string;createdAt:number;updatedAt:number;expiresAt:number|null;history:{key:string;inputHash:string}[];
  transportVersion?:string;delivery?:Delivery;lease?:string;leaseUntil?:number;instanceId?:string;cancelRequested?:boolean;responses?:Record<string,unknown>[];snapshot?:Record<string,unknown>;
  title?:string;workKey?:string;requestKeyDigest?:string;threadId?:string;sourceThreadId?:string|null;projectPath?:string;resourcePath?:string;command?:Command;model?:string;reasoning_effort?:string;continuation_of?:string;
  ownerOutcome?:'accepted'|'needs_rework'|'abandoned';outcomeAt?:number;outcomeGeneration?:number;outcomesHistory?:{generation:number;outcome:'accepted'|'needs_rework'|'abandoned';at:number}[];
  [legacy:string]:unknown;
};
type UpdateResult<T>={job:Job;result:T};
export type ActiveClaim={id:string;generation:number;nativeGeneration?:number;lease?:string;deliveryId?:string};
type Controls={generation:number;nativeGeneration:number;cancel:boolean;responses:Record<string,unknown>[]};
type Start={project:string;prompt:string;mode:'inspect'|'edit';request_key:string;title?:string;work_key?:string;thread_id?:string;model?:string;reasoning_effort?:string};
export function dispatchIntentChanged(before:Job|undefined,after:Job) {return after.status==='queued'&&(!before||before.status!=='queued'||before.generation!==after.generation)||!before?.cancelRequested&&!!after.cancelRequested||!isDeepStrictEqual(before?.responses||[],after.responses||[]);}
function workerMetadata(value:Worker) {return {...heartbeatSchema.parse(value),at:value.at};}
function normalizedPath(value:string) {const normalized=value.replace(/\\/g,'/').replace(/\/+$/,'').toLowerCase();if(!/^f:\//.test(normalized)||normalized.split('/').some(part=>part==='.'||part==='..'))throw Error('Project paths must be explicit F-drive paths.');return normalized;}
function supportsTransport(version:string) {const [major,minor]=version.split('.').map(Number);return major>0||minor>=5;}

export interface RelayStore {
  read(uid:string,id:string):Promise<Job|undefined>;readMany(uid:string,ids:string[]):Promise<(Job|undefined)[]>;
  watch(uid:string,id:string,changed:(job:Job|undefined)=>void,failed:(error:Error)=>void):()=>void;
  worker(uid:string):Promise<Worker|undefined>;heartbeat(uid:string,value:Worker):Promise<void>;
  update<T>(uid:string,id:string,operation:(job:Job|undefined,worker:Worker|undefined)=>UpdateResult<T>):Promise<T>;
  queued(uid:string):Promise<string[]>;list(uid:string):Promise<Job[]>;
}
export class FirestoreRelayStore implements RelayStore {
  constructor(private db:Firestore) {}
  private root(uid:string) {if(uid!==OWNER)throw Error('Account is not authorized.');return this.db.doc(`_ptiLocalServices/local-codex/owners/${uid}`);}
  async worker(uid:string) {return (await this.root(uid).get()).data() as Worker|undefined;}
  async read(uid:string,jobId:string) {return (await this.root(uid).collection('jobs').doc(jobId).get()).data() as Job|undefined;}
  async readMany(uid:string,ids:string[]) {const jobs=this.root(uid).collection('jobs');return ids.length?(await this.db.getAll(...ids.map(value=>jobs.doc(value)))).map(snapshot=>snapshot.data() as Job|undefined):[];}
  watch(uid:string,jobId:string,changed:(job:Job|undefined)=>void,failed:(error:Error)=>void) {return this.root(uid).collection('jobs').doc(jobId).onSnapshot(snapshot=>changed(snapshot.data() as Job|undefined),failed);}
  async heartbeat(uid:string,value:Worker) {await this.db.runTransaction(async tx=>{
    const root=this.root(uid),previous=(await tx.get(root)).data() as Worker|undefined;
    // Old active reporting remains supported without hiding a live new helper.
    if(previous&&supportsTransport(previous.version)&&!supportsTransport(value.version)&&value.at-previous.at<=60000)return;
    tx.set(root,workerMetadata(value),{merge:true});
  });}
  async update<T>(uid:string,jobId:string,operation:(job:Job|undefined,worker:Worker|undefined)=>UpdateResult<T>) {
    return this.db.runTransaction(async tx=>{
      const root=this.root(uid),ref=root.collection('jobs').doc(jobId),[j,w]=await tx.getAll(ref,root),original=j.data() as Job|undefined;
      const outcome=operation(structuredClone(original),w.data() as Worker|undefined),next=JSON.parse(JSON.stringify(outcome.job)) as Job;
      if(!isDeepStrictEqual(original,next))tx.set(ref,next);
      if(dispatchIntentChanged(original,next))tx.set(root.collection('signals').doc('dispatch'),{schemaVersion:1,revision:randomUUID(),writtenAt:Date.now()});
      return outcome.result;
    });
  }
  async queued(uid:string) {const docs=(await this.root(uid).collection('jobs').where('status','==','queued').get()).docs;
    // Historical queued requests are never new-helper dispatch candidates.
    return docs.filter(item=>item.data().transportVersion===HOST_VERSION).sort((a,b)=>(a.data().createdAt||0)-(b.data().createdAt||0)||a.id.localeCompare(b.id)).map(item=>item.id);}
  async list(uid:string) {return (await this.root(uid).collection('jobs').orderBy('updatedAt','desc').limit(100).get()).docs.map(item=>item.data() as Job);}
}
export class CodexRelay {
  constructor(readonly store:RelayStore,readonly clock=()=>Date.now()) {}
  private owner(uid:string) {if(uid!==OWNER)throw Error('Account is not authorized.');}
  private ready(worker:Worker|undefined) {if(!worker||worker.authMode!=='chatgpt'||worker.dispatchReady===false||this.clock()-worker.at>60000)throw Error('Local Codex is unavailable. The PC must be awake, online and signed in to ChatGPT. Nothing was queued.');return worker;}
  private target(worker:Worker,projectKey:string) {const target=worker.projects.find(item=>item.key===projectKey&&item.available);if(!target)throw Error('Choose an available key from list_projects.');normalizedPath(target.path);normalizedPath(target.resourcePath||target.path);return target;}
  private public(job:Job) {
    const snapshot={...(job.snapshot||{})};
    // Retired pairing receipts can contain a temporary secret.
    if(job.command?.action==='remote-pair'&&snapshot.result&&typeof snapshot.result==='object'){const {manualPairingCode:_code,...result}=snapshot.result as Record<string,unknown>;snapshot.result=result;}
    const exact=job.snapshot?.native_terminal_observed===true&&typeof job.snapshot.native_turn_id==='string'&&typeof (job.snapshot.native_thread_id||job.snapshot.thread_id)==='string';
    const unverifiedTerminal=!job.command&&terminal.includes(job.status)&&!exact&&job.snapshot?.native_delivery_absent!==true;
    return {id:job.id,project:job.project,mode:job.mode,generation:job.generation,nativeGeneration:job.generation,...(job.title?{title:job.title}:{}),...(job.workKey?{work_key:job.workKey}:{}),...(job.command?{operation:job.command.action}:{}),...(job.model?{model:job.model}:{}),...(job.reasoning_effort?{reasoning_effort:job.reasoning_effort}:{}),...(job.threadId?{thread_id:job.threadId,native_thread_id:job.threadId}:{}),...snapshot,status:unverifiedTerminal?'unknown':job.status,...(unverifiedTerminal?{storedStatus:job.status}:{}),
      createdAt:new Date(job.createdAt).toISOString(),updatedAt:new Date(job.updatedAt).toISOString(),cancelRequested:!!job.cancelRequested,delivery:job.delivery?{state:'attempted',at:new Date(job.delivery.attemptedAt).toISOString(),automaticReplay:false}:undefined,
      ...(job.continuation_of?{continuation_of:job.continuation_of}:{}),...(job.ownerOutcome?{ownerOutcome:job.ownerOutcome,outcomeAt:new Date(job.outcomeAt!).toISOString(),outcomeGeneration:job.outcomeGeneration}:{}),observationNotice:'Stored native observations only. Dispatch, heartbeat and helper receipt are not task completion or owner acceptance. Missing native evidence remains unknown; elapsed time never cancels or replays a request.'};
  }
  async capabilities(uid:string) {this.owner(uid);return transportCapabilities(await this.store.worker(uid),this.clock());}
  async status(uid:string) {this.owner(uid);const worker=await this.store.worker(uid);return {version:HOST_VERSION,...transportCapabilities(worker,this.clock()),model:worker?.model||null,reasoning_effort:worker?.reasoning_effort||null,runtimeRoot:worker?.runtimeRoot||null,sourceSha:worker?.sourceSha||null,authMode:worker?.authMode||'unavailable',lastSeenAt:worker?new Date(worker.at).toISOString():null,openaiApiKeyRequired:false};}
  async projects(uid:string) {this.owner(uid);const worker=this.ready(await this.store.worker(uid));return {projects:worker.projects,notice:'Start creates a fresh native session. Select a native thread explicitly only for authorized continuation in this project and mode.'};}
  async list(uid:string,args:{project?:string;query?:string;limit:number}) {this.owner(uid);const jobs=(await this.store.list(uid)).filter(job=>!job.command&&(!args.project||job.project===args.project)&&(!args.query||[job.title,job.workKey,job.id].some(value=>value?.toLowerCase().includes(args.query!.toLowerCase()))));
    return {tasks:jobs.slice(0,args.limit).map(job=>({id:job.id,title:job.title||'Historical task',project:job.project,mode:job.mode,generation:job.generation,status:this.public(job).status,storedStatus:job.status,thread_id:job.threadId||job.snapshot?.thread_id||null,updatedAt:new Date(job.updatedAt).toISOString()})),has_more:jobs.length>args.limit,coverage:'most-recent-100-jobs',notice:'Historical records are preserved. This list does not resume or cancel them.'};}
  async start(uid:string,args:Start) {this.owner(uid);const selectedModel=args.model||'gpt-6.2-sol',selectedEffort=args.reasoning_effort||'xhigh',jobId=digest(`${uid}:${args.request_key}`).slice(0,32),inputHash=digest(JSON.stringify({...args,model:selectedModel,reasoning_effort:selectedEffort}));
    return this.store.update(uid,jobId,(old,worker)=>{
      if(old){if(old.inputHash!==inputHash)throw Error('request_key was already used for different work.');return {job:old,result:this.public(old)};}
      const host=this.ready(worker);if(!supportsTransport(host.version))throw Error('Upgrade the PC helper to 0.5.0 before submitting new work. Nothing was queued.');
      const target=this.target(host,args.project),at=this.clock(),job:Job={id:jobId,project:args.project,mode:args.mode,prompt:args.prompt,inputHash,generation:1,status:'queued',createdAt:at,updatedAt:at,expiresAt:null,history:[],responses:[],transportVersion:HOST_VERSION,requestKeyDigest:digest(args.request_key),title:args.title||args.prompt.split(/[\r\n]/)[0].replace(/\s+/g,' ').slice(0,80),...(args.work_key?{workKey:args.work_key}:{}),sourceThreadId:args.thread_id||null,...(args.thread_id?{threadId:args.thread_id}:{}),projectPath:target.path,resourcePath:target.resourcePath||target.path,model:selectedModel,reasoning_effort:selectedEffort};
      return {job,result:this.public(job)};
    });}
  async command(uid:string,command:Command,requestKey:string) {this.owner(uid);if(!['list','read'].includes(command.action))throw Error('Only read-only native history operations are supported.');const jobId=digest(`${uid}:command:${requestKey}`).slice(0,32),inputHash=digest(JSON.stringify(command));
    return this.store.update(uid,jobId,(old,worker)=>{
      if(old){if(old.inputHash!==inputHash)throw Error('request_key was already used for another operation.');return {job:old,result:this.public(old)};}
      const host=this.ready(worker);if(!supportsTransport(host.version))throw Error('Upgrade the PC helper to 0.5.0 before submitting a history read.');
      const projectKey=typeof command.args.project==='string'?command.args.project:host.projects.find(item=>item.available)?.key;if(!projectKey)throw Error('No available project.');const target=this.target(host,projectKey),at=this.clock(),scoped=command.action==='list'?{...command,args:{...command.args,project:projectKey}}:command,job:Job={id:jobId,project:projectKey,projectPath:target.path,resourcePath:target.resourcePath||target.path,mode:'inspect',prompt:'',inputHash,command:scoped,generation:1,status:'queued',createdAt:at,updatedAt:at,expiresAt:null,history:[],responses:[],transportVersion:HOST_VERSION};return {job,result:this.public(job)};
    });}
  async get(uid:string,jobId:string) {this.owner(uid);const job=await this.store.read(uid,jobId);if(!job)throw Error('Unknown task.');return this.public(job);}
  async wait(uid:string,jobId:string,seconds:number,signal?:AbortSignal) {this.owner(uid);signal?.throwIfAborted();if(seconds<=0)return this.get(uid,jobId);
    return new Promise<ReturnType<CodexRelay['public']>>((resolve,reject)=>{
      let done=false,current:Job|undefined,before:ReturnType<CodexRelay['public']>|undefined,unsubscribe:(()=>void)|undefined;
      const finish=(error?:Error)=>{if(done)return;done=true;clearTimeout(timer);unsubscribe?.();signal?.removeEventListener('abort',aborted);if(error)reject(error);else if(current)resolve(this.public(current));else reject(Error('Task listener did not initialize.'));};
      const aborted=()=>finish(Error('Task wait cancelled.')),timer=setTimeout(()=>finish(),Math.min(seconds,50)*1000);signal?.addEventListener('abort',aborted,{once:true});if(signal?.aborted){aborted();return;}
      try{unsubscribe=this.store.watch(uid,jobId,job=>{if(done)return;if(!job){finish(Error('Unknown task.'));return;}current=job;const visible=this.public(job);if(!before){before=visible;if(terminal.includes(job.status)||job.status==='waiting_for_user')finish();}else if(!isDeepStrictEqual(before,visible))finish();},finish);if(done)unsubscribe();}catch(error){finish(error as Error);}
    });}
  async continue(uid:string,args:{task_id:string;prompt:string;request_key:string}) {
    this.owner(uid);const source=await this.store.read(uid,args.task_id);if(!source)throw Error('Unknown task.');if(source.command)throw Error('A history read cannot be continued as model work.');
    const recorded=source.threadId||source.snapshot?.native_thread_id||source.snapshot?.thread_id;if(typeof recorded!=='string')throw Error('This request has no recorded native thread to continue.');const selectedThread=threadId.parse(recorded);
    const jobId=digest(`${uid}:continue:${args.request_key}`).slice(0,32),inputHash=digest(JSON.stringify({task_id:source.id,prompt:args.prompt,project:source.project,mode:source.mode,thread_id:selectedThread}));
    return this.store.update(uid,jobId,(old,worker)=>{
      if(old){if(old.inputHash!==inputHash)throw Error('request_key was already used for different work.');return {job:old,result:this.public(old)};}
      const host=this.ready(worker);if(!supportsTransport(host.version))throw Error('Upgrade the PC helper to 0.5.0 before continuation.');const target=this.target(host,source.project);
      if(source.projectPath&&normalizedPath(source.projectPath)!==normalizedPath(target.path)||source.resourcePath&&normalizedPath(source.resourcePath)!==normalizedPath(target.resourcePath||target.path))throw Error('The selected project path changed. Start a distinct request after reviewing list_projects.');
      const selectedModel=source.model||(typeof source.snapshot?.model==='string'?source.snapshot.model:'gpt-6.2-sol'),selectedEffort=source.reasoning_effort||(typeof source.snapshot?.reasoning_effort==='string'?source.snapshot.reasoning_effort:'xhigh');
      const at=this.clock(),job:Job={id:jobId,project:source.project,mode:source.mode,prompt:args.prompt,inputHash,generation:1,status:'queued',createdAt:at,updatedAt:at,expiresAt:null,history:[],responses:[],transportVersion:HOST_VERSION,requestKeyDigest:digest(args.request_key),title:source.title,continuation_of:source.id,sourceThreadId:selectedThread,threadId:selectedThread,projectPath:target.path,resourcePath:target.resourcePath||target.path,model:selectedModel,reasoning_effort:selectedEffort};
      return {job,result:this.public(job)};
    });
  }
  async cancel(uid:string,jobId:string) {this.owner(uid);return this.store.update(uid,jobId,job=>{if(!job)throw Error('Unknown task.');if(!terminal.includes(job.status)&&!job.cancelRequested){job.cancelRequested=true;job.updatedAt=this.clock();if(job.status==='queued'&&!job.delivery&&job.transportVersion===HOST_VERSION){job.status='interrupted';job.snapshot={status:'interrupted',native_delivery_absent:true,error:'Owner cancelled before dispatch.'};}}return {job,result:this.public(job)};});}
  async respond(uid:string,args:{task_id:string;request_id:string;decision?:'approve'|'decline';answers?:Record<string,string[]>}) {this.owner(uid);return this.store.update(uid,args.task_id,job=>{
    if(!job)throw Error('Unknown task.');const pending=job.snapshot?.pending as {id:string;kind:string;details?:{questions?:{id:string}[]}}[]|undefined,request=pending?.find(item=>item.id===args.request_id);if(!request||job.status!=='waiting_for_user')throw Error('No matching active request.');
    if(request.kind==='approval'&&(!args.decision||args.answers))throw Error('Approval requires the human approve/decline decision.');if(request.kind==='question'&&(!args.answers||args.decision||(request.details?.questions||[]).some(item=>!args.answers?.[item.id]?.length)))throw Error('Answer the displayed questions.');
    job.responses||=[];const previous=job.responses.find(item=>item.request_id===args.request_id);if(previous&&!isDeepStrictEqual(previous,args))throw Error('This request already has a different answer.');if(!previous){job.responses.push(args);job.updatedAt=this.clock();}return {job,result:{task_id:job.id,accepted:true}};
  });}
  async recordOutcome(uid:string,args:{task_id:string;generation:number;outcome:'accepted'|'needs_rework'|'abandoned'}) {this.owner(uid);return this.store.update(uid,args.task_id,job=>{
    if(!job||job.generation!==args.generation)throw Error('Retrieve the current task generation before recording the human verdict.');if(!terminal.includes(this.public(job).status))throw Error('Record a human verdict only after the native task is terminal.');
    if(job.ownerOutcome!==args.outcome||job.outcomeGeneration!==job.generation){job.ownerOutcome=args.outcome;job.outcomeGeneration=job.generation;job.outcomeAt=this.clock();job.outcomesHistory=[...(job.outcomesHistory||[]),{generation:job.generation,outcome:args.outcome,at:job.outcomeAt}];}return {job,result:{task_id:job.id,generation:job.generation,ownerOutcome:job.ownerOutcome,outcomeAt:new Date(job.outcomeAt!).toISOString()}};
  });}
  async reviewData(uid:string,input:unknown={}) {this.owner(uid);const args=z.object({task_ids:z.array(id).optional()}).strict().parse(input),ids=args.task_ids?[...new Set(args.task_ids)]:null,found=ids?await this.store.readMany(uid,ids):await this.store.list(uid);
    return {schemaVersion:1,checkedAt:new Date(this.clock()).toISOString(),coverage:ids?'requested-jobs':'most-recent-100-jobs',missingTaskIds:ids?.filter((_,index)=>!found[index])||[],jobs:found.filter((job):job is Job=>!!job).map(job=>({id:job.id,project:job.project,mode:job.mode,generation:job.generation,status:this.public(job).status,storedStatus:job.status,createdAt:job.createdAt,updatedAt:job.updatedAt,ownerOutcome:job.ownerOutcome||null,outcomesHistory:job.outcomesHistory||[],telemetry:job.snapshot?.telemetry||null}))};}
  async control(uid:string,active:ActiveClaim[]) {this.owner(uid);const controls:Record<string,Controls>={},unknown:string[]=[];
    for(const claim of active){const job=await this.store.read(uid,claim.id);if(!job||job.generation!==claim.generation){unknown.push(claim.id);continue;}const token=claim.deliveryId||claim.lease,expected=job.delivery?.id||job.lease;if(expected&&token!==expected){unknown.push(claim.id);continue;}controls[job.id]={generation:job.generation,nativeGeneration:job.generation,cancel:!!job.cancelRequested,responses:job.responses||[]};}
    // Unknown observation is never a cancellation instruction.
    return {controls,unknown,lost:[]};}
  async heartbeat(uid:string,value:z.infer<typeof heartbeatSchema>) {this.owner(uid);await this.store.heartbeat(uid,{...value,at:this.clock()});return {accepted:true,hostVersion:HOST_VERSION};}
  private async dispatch(uid:string,heartbeat:z.infer<typeof heartbeatSchema>) {
    if(!supportsTransport(heartbeat.version)||heartbeat.dispatchReady===false)return [];const jobs:Record<string,unknown>[]=[];
    for(const jobId of await this.store.queued(uid)){const delivered=await this.store.update<Record<string,unknown>|null>(uid,jobId,(job,worker)=>{
      if(!job)throw Error('Unknown task.');if(job.transportVersion!==HOST_VERSION||job.status!=='queued'||job.delivery||job.cancelRequested)return {job,result:null};if(job.command&&!['list','read'].includes(job.command.action))return {job,result:null};
      let target:z.infer<typeof project>;
      try{target=this.target({...heartbeat,at:this.clock()},job.project);if(job.projectPath&&normalizedPath(job.projectPath)!==normalizedPath(target.path)||job.resourcePath&&normalizedPath(job.resourcePath)!==normalizedPath(target.resourcePath||target.path))throw Error('The selected project path changed before dispatch.');}
      catch(error){job.status='failed';job.updatedAt=this.clock();job.snapshot={status:'failed',native_delivery_absent:true,error:(error as Error).message};return {job,result:null};}
      const at=this.clock();job.delivery={id:randomUUID(),generation:job.generation,instanceId:heartbeat.instanceId,attemptedAt:at};job.status='dispatched';job.updatedAt=at;
      return {job,result:{id:job.id,generation:job.generation,nativeGeneration:job.generation,deliveryId:job.delivery.id,lease:job.delivery.id,project:job.project,projectPath:target.path,mode:job.mode,prompt:job.prompt,...(job.title?{title:job.title}:{}),...(job.threadId?{nativeThreadId:job.threadId,thread_id:job.threadId}:{}),model:job.model||'gpt-6.2-sol',reasoning_effort:job.reasoning_effort||'xhigh',reasoningEffort:job.reasoning_effort||'xhigh',...(job.command?{command:job.command}:{})}};
    });if(delivered)jobs.push(delivered);}return jobs;
  }
  async sync(uid:string,body:{heartbeat:z.infer<typeof heartbeatSchema>;active?:ActiveClaim[];dispatch?:boolean}) {this.owner(uid);await this.heartbeat(uid,body.heartbeat);const observed=await this.control(uid,body.active||[]),jobs=body.dispatch?await this.dispatch(uid,body.heartbeat):[];return {...observed,newJobs:jobs,jobs,more:false,syncDelayMs:30000};}
  async poll(uid:string,body:{heartbeat:z.infer<typeof heartbeatSchema>;active?:ActiveClaim|ActiveClaim[]}) {const active=Array.isArray(body.active)?body.active:body.active?[body.active]:[],result=await this.sync(uid,{heartbeat:body.heartbeat,active,dispatch:true});return Array.isArray(body.active)?result:{job:result.jobs[0]||null,controls:active[0]?result.controls[active[0].id]||null:null};}
  async report(uid:string,body:{id:string;generation:number;nativeGeneration?:number;lease?:string;deliveryId?:string;snapshot:Record<string,unknown>}) {this.owner(uid);return this.store.update<{accepted:boolean;ignored?:string}>(uid,body.id,job=>{
    if(!job||job.generation!==body.generation||body.nativeGeneration!==undefined&&body.nativeGeneration!==job.generation)throw Error('request_mismatch');const expected=job.delivery?.id||job.lease,token=body.deliveryId||body.lease;if(expected&&token!==expected)throw Error('request_mismatch');if(job.transportVersion===HOST_VERSION&&!job.delivery)throw Error('Request was never dispatched.');
    const thread=body.snapshot.native_thread_id||body.snapshot.thread_id,turn=body.snapshot.native_turn_id;if(typeof thread==='string'&&job.threadId&&thread!==job.threadId)throw Error('Native thread does not match this request.');if(typeof turn==='string'&&typeof job.snapshot?.native_turn_id==='string'&&turn!==job.snapshot.native_turn_id)throw Error('Native turn does not match this generation.');
    const policy=body.snapshot.execution_policy as {mode?:string}|undefined;if(policy&&policy.mode!==job.mode)throw Error('Native execution mode does not match this request.');
    if(job.snapshot?.native_terminal_observed===true&&body.snapshot.native_terminal_observed===true&&job.status!==body.snapshot.status)throw Error('Native terminal observations disagree.');
    if(terminal.includes(job.status)&&(!terminal.includes(String(body.snapshot.status))||job.snapshot?.native_terminal_observed===true&&body.snapshot.native_terminal_observed!==true))return {job,result:{accepted:true,ignored:'terminal-generation'}};
    if(typeof thread==='string')job.threadId=thread;
    // A report-only observer of a retired path cannot erase its original receipt.
    const snapshot=job.transportVersion!==HOST_VERSION&&body.snapshot.status==='unknown'?{...(job.snapshot||{}),...Object.fromEntries(Object.entries(body.snapshot).filter(([field,value])=>value!==null||job.snapshot?.[field]===undefined))}:body.snapshot;
    if(job.status!==body.snapshot.status||!isDeepStrictEqual(job.snapshot,snapshot)){job.status=String(body.snapshot.status);job.snapshot=snapshot;job.updatedAt=this.clock();}return {job,result:{accepted:true}};
  });}
}

const activeClaim=z.object({id,generation:z.number().int().positive(),nativeGeneration:z.number().int().positive().optional(),lease:z.string().uuid().optional(),deliveryId:z.string().uuid().optional()}).strict().refine(value=>value.nativeGeneration===undefined||value.nativeGeneration===value.generation,'Generation aliases disagree').refine(value=>!value.deliveryId||!value.lease||value.deliveryId===value.lease,'Delivery aliases disagree');
export const workerPollSchema=z.object({heartbeat:heartbeatSchema,active:z.union([activeClaim,z.array(activeClaim)]).optional()}).strict();
export const workerSyncSchema=z.object({heartbeat:heartbeatSchema,active:z.array(activeClaim).default([]),dispatch:z.boolean().default(false)}).strict();
export const workerControlSchema=z.object({active:z.array(activeClaim).default([])}).strict();
const executionPolicySchema=z.object({version:z.union([z.literal(1),z.literal(2)]),mode:z.enum(['inspect','edit']),sandboxType:z.enum(['readOnly','dangerFullAccess']),approvalPolicy:z.literal('never'),instructionRefresh:z.enum(['thread-start','history-injection']),verifiedAt:z.string().datetime({offset:true})}).strict().refine(value=>value.sandboxType===(value.mode==='edit'?'dangerFullAccess':'readOnly'),'Execution policy mode and sandbox disagree');
export const workerReportSchema=z.object({id,generation:z.number().int().positive(),nativeGeneration:z.number().int().positive().optional(),lease:z.string().uuid().optional(),deliveryId:z.string().uuid().optional(),snapshot:z.object({
  status:z.enum(['running','waiting_for_user','completed','failed','interrupted','unknown']),final:z.string().max(48000).nullable().optional(),result:z.record(z.string(),z.unknown()).refine(value=>JSON.stringify(value).length<=24000,'History result too large').optional(),thread_id:threadId.optional(),native_thread_id:threadId.optional(),native_turn_id:threadId.optional(),native_terminal_observed:z.literal(true).optional(),native_delivery_absent:z.literal(true).optional(),
  error:z.string().max(2000).nullable().optional(),control_error:z.string().max(2000).nullable().optional(),cancellation_state:z.enum(['interrupt_requested','interrupt_delivery_unknown','terminal_observed','interrupt_acknowledged','interrupt_rejected','cancelled_before_dispatch','waiting_for_native_turn']).nullable().optional(),messages:z.array(z.object({text:z.string().max(48000),phase:z.string().nullable().optional()}).strict()).max(10).optional(),pending:z.array(z.object({id:z.string().max(200),kind:z.enum(['approval','question']),method:z.string().max(100),details:z.record(z.string(),z.unknown())}).strict()).optional(),
  model:z.string().max(100).optional(),requested_model:z.string().max(100).nullable().optional(),returned_model:z.string().max(100).nullable().optional(),reasoning_effort:z.string().max(20).optional(),requested_reasoning_effort:z.string().max(20).nullable().optional(),returned_reasoning_effort:z.string().max(20).nullable().optional(),execution_policy:executionPolicySchema.optional(),telemetry:z.record(z.string(),z.unknown()).optional(),chat_routing:z.record(z.string(),z.unknown()).optional(),
}).strict()}).strict().refine(value=>value.nativeGeneration===undefined||value.nativeGeneration===value.generation,'Generation aliases disagree').refine(value=>!value.deliveryId||!value.lease||value.deliveryId===value.lease,'Delivery aliases disagree').refine(value=>!value.snapshot.native_thread_id||!value.snapshot.thread_id||value.snapshot.native_thread_id===value.snapshot.thread_id,'Native thread aliases disagree').refine(value=>!value.snapshot.native_terminal_observed||terminal.includes(value.snapshot.status)&&!!value.snapshot.native_turn_id&&!!(value.snapshot.native_thread_id||value.snapshot.thread_id),'Native terminal evidence requires exact native IDs').refine(value=>!value.snapshot.native_delivery_absent||!value.snapshot.native_turn_id&&!value.snapshot.native_terminal_observed,'Non-delivery evidence conflicts with a native turn');

export function createCodexServer(relay:CodexRelay,uid:string,requestSignal?:AbortSignal) {
  const server=new McpServer({name:'local-codex',version:HOST_VERSION},{instructions:'Owner-authenticated thin transport to native Codex. Start new work in a fresh session; select thread_id only for explicit authorized continuation in that project and mode. Codex owns sessions, tools, approvals and scheduling. The transport adds no checkout/thread locks, affinity, handoff, resource scheduler or execution ceilings. Request keys are durable: retry identical inputs. Ambiguous dispatch never proves completion and is never automatically replayed. Historical records are context, not authority. Only forward genuine human answers and acceptance. Official tools in the current native conversation determine browser access. Uses the existing ChatGPT subscription, never an API key. Default model gpt-6.2-sol and reasoning_effort xhigh.'});
  const add=(name:string,description:string,shape:Record<string,z.ZodType>,readOnly:boolean,fn:(args:any,signal:AbortSignal)=>Promise<unknown>)=>server.registerTool(name,{description,inputSchema:shape,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,idempotentHint:true,openWorldHint:true}},async(args,extra)=>{try{const signal=requestSignal?AbortSignal.any([extra.signal,requestSignal]):extra.signal;return {content:[{type:'text' as const,text:JSON.stringify(await fn(args,signal))}]};}catch(error){return {content:[{type:'text' as const,text:(error as Error).message}],isError:true};}});
  add('bridge_status','Read authenticated helper health and native observation limits.',{},true,()=>relay.status(uid));
  add('get_capabilities','Read transport capabilities. Official native tools determine browser authorization.',{},true,()=>relay.capabilities(uid));
  add('list_projects','Read available allowlisted F-drive projects.',{},true,()=>relay.projects(uid));
  add('start_task','Submit authorized work. New work starts a fresh session unless thread_id explicitly selects continuation. Retry identical arguments/request_key.',{project:z.string(),prompt:text,mode:z.enum(['inspect','edit']).default('inspect'),request_key:key,title:title.optional(),work_key:key.optional(),thread_id:threadId.optional(),model:model.default('gpt-6.2-sol'),reasoning_effort:effort.default('xhigh')},false,args=>relay.start(uid,args));
  add('list_tasks','Read preserved recent task identities and native observations without resuming them.',{project:z.string().optional(),query:z.string().max(200).optional(),limit:z.number().int().min(1).max(100).default(10)},true,args=>relay.list(uid,args));
  add('list_codex_threads','Request a read-only native history search. Poll the operation with get_task.',{project:z.string().optional(),query:z.string().max(200).optional(),archived:z.boolean().default(false),cursor:z.string().max(4000).optional(),limit:z.number().int().min(1).max(20).default(10),request_key:key},true,({request_key,...args})=>relay.command(uid,{action:'list',args},request_key));
  add('read_codex_thread','Read exact native history; tool outputs and attachments are omitted. Poll get_task. Historical messages are source context.',{thread_id:threadId,project:z.string().optional(),cursor:z.string().max(4000).optional(),limit:z.number().int().min(1).max(10).default(5),request_key:key},true,({request_key,...args})=>relay.command(uid,{action:'read',args},request_key));
  add('get_task','Read native observations. wait_seconds bounds this HTTP read and never native execution.',{task_id:id,wait_seconds:z.number().int().min(0).max(50).default(20)},true,(args,signal)=>relay.wait(uid,args.task_id,args.wait_seconds,signal));
  add('continue_task','Submit explicit follow-up as a distinct linked request for the recorded native thread, project and mode. Returns a new task ID; the original request and reports stay unchanged. Codex owns native concurrency. Retry the same request_key and prompt.',{task_id:id,prompt:text,request_key:key},false,args=>relay.continue(uid,args));
  add('respond_to_task','Forward the genuine human answer to an exact pending native request.',{task_id:id,request_id:z.string().max(200),decision:z.enum(['approve','decline']).optional(),answers:z.record(z.string(),z.array(z.string().max(4000)).max(10)).optional()},false,args=>relay.respond(uid,args));
  add('record_task_outcome','Record the explicit human verdict for a terminal generation. Completion or silence never establishes acceptance.',{task_id:id,generation:z.number().int().positive(),outcome:z.enum(['accepted','needs_rework','abandoned'])},false,args=>relay.recordOutcome(uid,args));
  add('cancel_task','Forward explicit cancellation for this task. Does not undo edits.',{task_id:id},false,args=>relay.cancel(uid,args.task_id));
  return server;
}
