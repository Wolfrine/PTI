import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Firestore } from 'firebase-admin/firestore';
import { digest } from './auth-store.js';

export const OWNER = '5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
export const terminal = ['completed', 'failed', 'interrupted'];
const key = z.string().min(8).max(128);
const text = z.string().trim().min(1).max(24000);
const id = z.string().regex(/^[a-f0-9]{32}$/);
const project = z.object({key:z.string().regex(/^[a-z0-9-]{1,64}$/),name:z.string().max(100),path:z.string().regex(/^F:[\\/]/i),available:z.boolean()}).strict();
export const heartbeatSchema = z.object({instanceId:z.string().uuid(),authMode:z.literal('chatgpt'),version:z.string().max(40),projects:z.array(project).max(30)}).strict();
export type Worker = z.infer<typeof heartbeatSchema> & {at:number};
export type Job = {
  id:string;project:string;mode:'inspect'|'edit';prompt:string;inputHash:string;generation:number;status:string;
  createdAt:number;updatedAt:number;expiresAt:number;history:{key:string;inputHash:string}[];
  lease?:string;leaseUntil?:number;instanceId?:string;cancelRequested?:boolean;
  responses?:Record<string,unknown>[]; snapshot?:Record<string,unknown>;
};
export interface RelayStore {
  read(uid:string,id:string):Promise<Job|undefined>;
  worker(uid:string):Promise<Worker|undefined>;
  heartbeat(uid:string,value:Worker):Promise<void>;
  update<T>(uid:string,id:string,operation:(job:Job|undefined,worker:Worker|undefined)=>{job:Job;result:T}):Promise<T>;
  queued(uid:string):Promise<string[]>;
}
export class FirestoreRelayStore implements RelayStore {
  constructor(private db:Firestore) {}
  private root(uid:string) { if(uid!==OWNER)throw Error('Account is not authorized.');return this.db.doc(`_ptiLocalServices/local-codex/owners/${uid}`); }
  async worker(uid:string) { return (await this.root(uid).get()).data() as Worker|undefined; }
  async read(uid:string,id:string) { return (await this.root(uid).collection('jobs').doc(id).get()).data() as Job|undefined; }
  async heartbeat(uid:string,value:Worker) { await this.root(uid).set(value); }
  async update<T>(uid:string,id:string,operation:(job:Job|undefined,worker:Worker|undefined)=>{job:Job;result:T}) {
    return this.db.runTransaction(async tx=>{
      const root=this.root(uid),ref=root.collection('jobs').doc(id);
      const [j,w]=await Promise.all([tx.get(ref),tx.get(root)]);
      const outcome=operation(j.data() as Job|undefined,w.data() as Worker|undefined);
      tx.set(ref,JSON.parse(JSON.stringify(outcome.job)));return outcome.result;
    });
  }
  async queued(uid:string) { return (await this.root(uid).collection('jobs').where('status','==','queued').limit(10).get()).docs.map(d=>d.id); }
}
export class CodexRelay {
  constructor(readonly store:RelayStore,readonly clock=()=>Date.now()) {}
  private owner(uid:string) { if(uid!==OWNER)throw Error('Account is not authorized.'); }
  private ready(worker:Worker|undefined) { if(!worker||worker.authMode!=='chatgpt'||this.clock()-worker.at>60000)throw Error('Local Codex is unavailable. The PC must be awake, online and signed in to ChatGPT. Nothing was queued.');return worker; }
  private public(job:Job) {
    const expired = job.status==='queued'&&job.expiresAt<this.clock();
    const lost = ['running','waiting_for_user'].includes(job.status)&&(job.leaseUntil||0)<this.clock();
    return {id:job.id,project:job.project,mode:job.mode,generation:job.generation,status:expired?'failed':lost?'interrupted':job.status,
      createdAt:new Date(job.createdAt).toISOString(),updatedAt:new Date(job.updatedAt).toISOString(),
      ...(job.snapshot||{}),...(expired?{status:'failed',error:'Request expired before the PC claimed it. It will not execute later.'}:{}),
      ...(lost?{status:'interrupted',error:'The worker heartbeat was lost. Resume explicitly after the PC is ready.'}:{}),
      cancelRequested:!!job.cancelRequested};
  }
  async status(uid:string) { this.owner(uid);const worker=await this.store.worker(uid);return {version:'0.2.0',online:!!worker&&this.clock()-worker.at<=60000,authMode:worker?.authMode||'unavailable',lastSeenAt:worker?new Date(worker.at).toISOString():null,transport:'private-pti-relay',openaiApiKeyRequired:false}; }
  async projects(uid:string) { this.owner(uid);return {projects:this.ready(await this.store.worker(uid)).projects}; }
  async start(uid:string,args:{project:string;prompt:string;mode:'inspect'|'edit';request_key:string}) {
    this.owner(uid);const jobId=digest(`${uid}:${args.request_key}`).slice(0,32),inputHash=digest(JSON.stringify([args.project,args.prompt,args.mode]));
    return this.store.update(uid,jobId,(old,worker)=>{
      if(old) {if(old.inputHash!==inputHash)throw Error('request_key was already used for different work.');return {job:old,result:this.public(old)};}
      const host=this.ready(worker);if(!host.projects.some(p=>p.key===args.project&&p.available))throw Error('Choose an available key from list_projects.');
      const at=this.clock();const job:Job={id:jobId,project:args.project,prompt:args.prompt,mode:args.mode,inputHash,generation:1,status:'queued',createdAt:at,updatedAt:at,expiresAt:at+120000,history:[],responses:[]};
      return {job,result:this.public(job)};
    });
  }
  async get(uid:string,jobId:string) { this.owner(uid);const job=await this.store.read(uid,jobId);if(!job)throw Error('Unknown task.');return this.public(job); }
  async continue(uid:string,args:{task_id:string;prompt:string;request_key:string}) {
    this.owner(uid);return this.store.update(uid,args.task_id,(job,worker)=>{
      if(!job)throw Error('Unknown task.');const action=digest(args.request_key),hash=digest(args.prompt),old=job.history.find(h=>h.key===action);
      if(old){if(old.inputHash!==hash)throw Error('request_key was already used for different work.');return {job,result:this.public(job)};}
      if(!terminal.includes(String(this.public(job).status)))throw Error('Wait for completion or cancel the active turn first.');this.ready(worker);
      job.generation++;job.prompt=args.prompt;job.status='queued';job.expiresAt=this.clock()+120000;job.updatedAt=this.clock();job.history.push({key:action,inputHash:hash});
      if(job.history.length>100)throw Error('This task reached its continuation limit. Start a new task.');
      delete job.lease;delete job.leaseUntil;delete job.snapshot;job.cancelRequested=false;job.responses=[];
      return {job,result:this.public(job)};
    });
  }
  async cancel(uid:string,jobId:string) { this.owner(uid);return this.store.update(uid,jobId,job=>{
    if(!job)throw Error('Unknown task.');if(!terminal.includes(job.status)){job.cancelRequested=true;if(job.status==='queued')job.status='interrupted';job.updatedAt=this.clock();}
    return {job,result:this.public(job)};
  }); }
  async respond(uid:string,args:{task_id:string;request_id:string;decision?:'approve'|'decline';answers?:Record<string,string[]>}) {
    this.owner(uid);return this.store.update(uid,args.task_id,job=>{
      if(!job)throw Error('Unknown task.');const pending=job.snapshot?.pending as {id:string;kind:string;details?:{questions?:{id:string}[]}}[]|undefined;
      const request=pending?.find(p=>p.id===args.request_id);if(!request||job.status!=='waiting_for_user')throw Error('No matching active request.');
      if(request.kind==='approval'&&(!args.decision||args.answers))throw Error('Approval requires a human approve/decline decision.');
      if(request.kind==='question'&&(!args.answers||args.decision||(request.details?.questions||[]).some(q=>!args.answers?.[q.id]?.length)))throw Error('Answer the displayed questions.');
      job.responses ||= [];const previous=job.responses.find(r=>r.request_id===args.request_id);
      if(previous&&JSON.stringify(previous)!==JSON.stringify(args))throw Error('This request already has a different response.');
      if(!previous)job.responses.push(args);if(job.responses.length>20)throw Error('Too many pending responses.');job.updatedAt=this.clock();return {job,result:{task_id:job.id,accepted:true}};
    });
  }
  async poll(uid:string,body:{heartbeat:z.infer<typeof heartbeatSchema>;active?:{id:string;generation:number;lease:string}}) {
    this.owner(uid);await this.store.heartbeat(uid,{...body.heartbeat,at:this.clock()});
    if(body.active) {const active=body.active;return this.store.update(uid,active.id,job=>{
      if(!job||job.generation!==active.generation||job.lease!==active.lease||job.instanceId!==body.heartbeat.instanceId||(job.leaseUntil||0)<this.clock())throw Error('lease_lost');
      job.leaseUntil=this.clock()+90000;return {job,result:{job:null,controls:{cancel:!!job.cancelRequested,responses:job.responses||[]}}};
    });}
    for(const jobId of await this.store.queued(uid)) {
      const claimed=await this.store.update(uid,jobId,job=>{
        if(!job)throw Error('Unknown task.');
        if(job.status!=='queued')return {job,result:null};
        if(job.expiresAt<this.clock()){job.status='failed';job.snapshot={error:'Request expired before claim.'};return {job,result:null};}
        job.status='running';job.lease=randomUUID();job.leaseUntil=this.clock()+90000;job.instanceId=body.heartbeat.instanceId;job.updatedAt=this.clock();
        return {job,result:{id:job.id,generation:job.generation,lease:job.lease,project:job.project,mode:job.mode,prompt:job.prompt}};
      });
      if(claimed)return {job:claimed,controls:null};
    }
    return {job:null,controls:null};
  }
  async report(uid:string,body:{id:string;generation:number;lease:string;snapshot:Record<string,unknown>}) {
    this.owner(uid);return this.store.update(uid,body.id,job=>{
      if(!job||job.generation!==body.generation||job.lease!==body.lease||(job.leaseUntil||0)<this.clock())throw Error('lease_lost');
      const status=String(body.snapshot.status);if(!['running','waiting_for_user',...terminal].includes(status))throw Error('Invalid task status.');
      // An old/in-flight progress report must never reopen a finished job.
      if(terminal.includes(job.status))return {job,result:{accepted:true}};
      job.status=status;job.updatedAt=this.clock();job.snapshot=body.snapshot;job.leaseUntil=this.clock()+90000;
      return {job,result:{accepted:true}};
    });
  }
}
export function createCodexServer(relay:CodexRelay,uid:string) {
  const server=new McpServer({name:'local-codex',version:'0.2.0'},{instructions:'Use list_projects before work. Inspection is default; edit only when the human requests changes. start_task is asynchronous: poll get_task until completed, failed or interrupted. Return actual evidence to the same chat. Never approve a pending action without the human answer. Offline requests are rejected. Codex uses the PC ChatGPT subscription, never an OpenAI API key. Only this owner account and bridge-created tasks are supported.'});
  const add=(name:string,description:string,shape:Record<string,z.ZodType>,readOnly:boolean,fn:(args:any)=>Promise<unknown>)=>server.registerTool(name,{description,inputSchema:shape,annotations:{readOnlyHint:readOnly,destructiveHint:!readOnly,idempotentHint:true,openWorldHint:true}},async args=>{
    try{const value=await fn(args);return {content:[{type:'text' as const,text:JSON.stringify(value)}]};}catch(error){return {content:[{type:'text' as const,text:(error as Error).message}],isError:true};}
  });
  add('bridge_status','Check whether this PC and subscription-authenticated local Codex worker are online.',{},true,()=>relay.status(uid));
  add('list_projects','List the local F-drive project keys that this PC permits.',{},true,()=>relay.projects(uid));
  add('start_task','Start a local Codex task from this chat. Inspection reads files; edit can change files and requires human intent. Reuse request_key on retry.',{project:z.string(),prompt:text,mode:z.enum(['inspect','edit']).default('inspect'),request_key:key},false,args=>relay.start(uid,args));
  add('get_task','Read progress, a pending human question/approval, or the actual completed result. Keep polling active tasks.',{task_id:id,wait_seconds:z.number().int().min(0).max(20).default(0)},true,async args=>{
    let value=await relay.get(uid,args.task_id);const before=value.updatedAt,end=Date.now()+args.wait_seconds*1000;
    while(['queued','running'].includes(value.status)&&value.updatedAt===before&&Date.now()<end){await new Promise(r=>setTimeout(r,1000));value=await relay.get(uid,args.task_id);}return value;
  });
  add('continue_task','Continue the same task and project with authorized follow-up. Mode cannot be broadened.',{task_id:id,prompt:text,request_key:key},false,args=>relay.continue(uid,args));
  add('respond_to_task','Forward the human answer to an exact pending request. Never invent an approval.',{task_id:id,request_id:z.string().max(200),decision:z.enum(['approve','decline']).optional(),answers:z.record(z.string(),z.array(z.string().max(4000)).max(10)).optional()},false,args=>relay.respond(uid,args));
  add('cancel_task','Request cancellation. This does not undo edits already made.',{task_id:id},false,args=>relay.cancel(uid,args.task_id));
  return server;
}
export const workerPollSchema=z.object({heartbeat:heartbeatSchema,active:z.object({id,generation:z.number().int().positive(),lease:z.string().uuid()}).strict().optional()}).strict();
export const workerReportSchema=z.object({id,generation:z.number().int().positive(),lease:z.string().uuid(),snapshot:z.object({status:z.enum(['running','waiting_for_user','completed','failed','interrupted']),final:z.string().max(48000).nullable().optional(),error:z.string().max(2000).nullable().optional(),messages:z.array(z.object({text:z.string().max(48000),phase:z.string().nullable().optional()}).strict()).max(10).optional(),pending:z.array(z.object({id:z.string().max(200),kind:z.enum(['approval','question']),method:z.string().max(100),details:z.record(z.string(),z.unknown())}).strict()).max(10).optional(),model:z.string().max(100).optional()}).strict()}).strict();
