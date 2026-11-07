import {createHash,randomUUID} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import type {Firestore} from 'firebase-admin/firestore';
import {z} from 'zod';
import {desktopHandoff} from './local-codex-capabilities.js';

const id=z.string().regex(/^[a-f0-9]{32}$/),key=z.string().min(8).max(128);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stamp=z.string().datetime({offset:true});
function safeUrl(value:string) {
  try {const u=new URL(value);return !u.username&&!u.password&&!u.search&&!u.hash&&
    (u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname));}catch{return false;}
}
const url=z.string().max(2048).refine(safeUrl,'Use HTTPS or loopback HTTP without credentials, query strings or fragments.');
const artifactUri=z.string().max(2048).refine(value=>safeUrl(value)||/^F:[\\/]/i.test(value)&&!/[\r\n?#]/.test(value),'Use a credential-free HTTPS or physical F-drive artifact reference.');
export const qaRequestSchema=z.object({
  request_key:key,project:z.string().regex(/^[a-z0-9-]{1,64}$/),revision:z.string().trim().min(1).max(200),
  url,build:z.string().trim().min(1).max(1000),objectives:z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  device:z.object({viewport:z.enum(['desktop','mobile','both']),input:z.enum(['mouse_keyboard','touch','both']),audio:z.enum(['required','optional','none'])}).strict(),
  expires_at:stamp.optional(),
}).strict();
const session=z.object({source_session_id:z.string().trim().min(1).max(200),entrypoint:z.enum(['@Chrome','@Browser','@Computer']),owner_consent_confirmed:z.literal(true),foreground_exclusive_confirmed:z.literal(true)}).strict();
const artifact=z.object({kind:z.enum(['screenshot','video','log','audio']),uri:artifactUri,sha256:z.string().regex(/^[a-f0-9]{64}$/),captured_at:stamp,
  capture_source:z.enum(['official-browser-tool','official-computer-tool','owner-recording']),contains_audio:z.boolean().optional()}).strict();
export const qaReceiptSchema=z.object({
  gameplay_verdict:z.enum(['playable_observed','defects_observed','blocked','not_tested']),
  observations:z.array(z.string().trim().min(1).max(2000)).min(1).max(30),
  visual_observed:z.boolean(),audio_observed:z.boolean(),observed_at:stamp,artifacts:z.array(artifact).max(30),
}).strict();
export const qaUpdateSchema=z.object({request_id:id,request_key:key,action:z.enum(['begin','renew','complete','fail','expire','release']),
  session:session.optional(),run_id:z.string().uuid().optional(),desktop_idle:z.boolean().optional(),
  receipt:qaReceiptSchema.optional(),reason:z.string().trim().min(1).max(2000).optional(),
}).strict();
export const qaListSchema=z.object({cursor:id.optional(),limit:z.number().int().min(1).max(50).default(10)}).strict();
type RequestInput=z.infer<typeof qaRequestSchema>;
type UpdateInput=z.infer<typeof qaUpdateSchema>;
type Receipt=z.infer<typeof qaReceiptSchema>;
export type QaRequest={id:string;inputHash:string;target:Omit<RequestInput,'request_key'|'expires_at'>;status:string;provider:'official-desktop-manual';
  createdAt:number;updatedAt:number;expiresAt:number;reason:string;run?:{id:string;session:z.infer<typeof session>;startedAt:number;leaseUntil:number};
  receipt?:(Receipt&{run_id:string;source:'operator-reported';verification:'not-independently-verified';owner_verdict:'unreviewed'});};
export type Foreground={requestId:string;runId:string;leaseUntil:number};
type Operation={inputHash:string;at:number;action:string};
type Change={request:QaRequest;foreground:Foreground|null;operation:Operation};
export interface InteractiveQaStore {
  read(uid:string,id:string):Promise<QaRequest|undefined>;
  list(uid:string,cursor:string|undefined,limit:number):Promise<{requests:QaRequest[];nextCursor:string|null}>;
  update(uid:string,id:string,operationId:string,change:(request:QaRequest|undefined,foreground:Foreground|null,operation:Operation|undefined)=>Change):Promise<QaRequest>;
}

// Existing server-only, owner-scoped namespace; no new Firestore client grants.
export class FirestoreInteractiveQaStore implements InteractiveQaStore {
  constructor(private db:Firestore,private owner:string){}
  private root(uid:string){if(uid!==this.owner)throw Error('Account is not authorized.');return this.db.doc(`_ptiLocalServices/local-codex/owners/${uid}`);}
  async read(uid:string,id:string){return (await this.root(uid).collection('interactiveQaRequests').doc(id).get()).data() as QaRequest|undefined;}
  async list(uid:string,cursor:string|undefined,limit:number){
    const collection=this.root(uid).collection('interactiveQaRequests');let query=collection.orderBy('updatedAt','desc').limit(limit+1);
    if(cursor){const after=await collection.doc(cursor).get();if(!after.exists)throw Error('Unknown QA cursor.');query=query.startAfter(after);}
    const docs=(await query.get()).docs;return {requests:docs.slice(0,limit).map(d=>d.data() as QaRequest),nextCursor:docs.length>limit?docs[limit-1].id:null};
  }
  async update(uid:string,id:string,operationId:string,change:Parameters<InteractiveQaStore['update']>[3]){
    const root=this.root(uid),ref=root.collection('interactiveQaRequests').doc(id),lock=root.collection('interactiveQaLocks').doc('foreground'),event=ref.collection('operations').doc(operationId);
    return this.db.runTransaction(async tx=>{
      const [r,l,e]=await tx.getAll(ref,lock,event),previous=r.data() as QaRequest|undefined,foreground=l.exists?l.data() as Foreground:null;
      const next=change(structuredClone(previous),foreground,e.data() as Operation|undefined);
      if(!isDeepStrictEqual(previous,next.request))tx.set(ref,next.request);
      if(!isDeepStrictEqual(foreground,next.foreground)){if(next.foreground)tx.set(lock,next.foreground);else tx.delete(lock);}
      if(!e.exists)tx.set(event,next.operation);
      return next.request;
    });
  }
}

export class InteractiveQaBroker {
  constructor(private store:InteractiveQaStore,private owner:string,private clock=()=>Date.now()){}
  private check(uid:string){if(uid!==this.owner)throw Error('Account is not authorized.');}
  private view(request:QaRequest){
    const expired=['requires_handoff','active'].includes(request.status)&&(request.expiresAt<=this.clock()||request.status==='active'&&(request.run?.leaseUntil||0)<=this.clock());
    return {request_id:request.id,target:request.target,status:expired?'expired':request.status,storedStatus:request.status,provider:request.provider,
      authorizationProofKind:request.run?'owner-scoped-operator-attestation':'none',providerSessionVerified:false,
      automaticActivation:false,playableTested:false,reason:expired?'Request or foreground lease expired; confirm the desktop is idle before releasing any held reservation.':request.reason,
      createdAt:new Date(request.createdAt).toISOString(),updatedAt:new Date(request.updatedAt).toISOString(),expiresAt:new Date(request.expiresAt).toISOString(),
      run:request.run?{...request.run,startedAt:new Date(request.run.startedAt).toISOString(),leaseUntil:new Date(request.run.leaseUntil).toISOString()}:null,
      receipt:request.receipt||null,handoff:desktopHandoff,nextStep:request.status==='requires_handoff'?desktopHandoff:'Read the receipt/provenance. Renew an active reservation before its lease expires; finish or release only after the desktop is idle. No external session is stopped by this broker.'};
  }
  async request(uid:string,args:unknown,projects:{key:string;available:boolean}[]){
    this.check(uid);const input=qaRequestSchema.parse(args),{request_key,expires_at,...target}=input;
    const trusted=['taleweald','ragnarok'].includes(target.project)&&['https://taleweald.firebaseapp.com','https://taleweald.web.app'].includes(new URL(target.url).origin);
    if(!trusted&&!projects.some(p=>p.key===target.project&&p.available))throw Error('Use a trusted Taleweald URL/project or an explicitly allowlisted available project.');
    const requestId=hash(['interactive-qa',request_key]).slice(0,32),inputHash=hash({...target,expires_at:expires_at||null}),now=this.clock();
    const request=await this.store.update(uid,requestId,'request',(previous,foreground,operation)=>{
      if(previous){if(previous.inputHash!==inputHash)throw Error('request_key was already used for a different QA request.');return {request:previous,foreground,operation:operation!};}
      const expiresAt=expires_at?Date.parse(expires_at):now+86400000;if(expiresAt<=now)throw Error('QA request expiry must be in the future.');
      return {request:{id:requestId,inputHash,target,status:'requires_handoff',provider:'official-desktop-manual',createdAt:now,updatedAt:now,expiresAt,
        reason:'No verified official programmatic Desktop-session provider is supported. Request persisted; no browser or audio capture was launched.'},foreground,operation:{inputHash,at:now,action:'request'}};
    });
    return this.view(request);
  }
  async get(uid:string,requestId:string){this.check(uid);id.parse(requestId);const request=await this.store.read(uid,requestId);if(!request)throw Error('Unknown interactive QA request.');return this.view(request);}
  async list(uid:string,args:unknown){this.check(uid);const input=qaListSchema.parse(args),page=await this.store.list(uid,input.cursor,input.limit);return {...page,requests:page.requests.map(r=>this.view(r))};}
  async update(uid:string,args:unknown){
    this.check(uid);const input=qaUpdateSchema.parse(args),{request_id,request_key,...action}=input,inputHash=hash(action),now=this.clock();
    if(input.receipt&&!['complete','fail'].includes(input.action)||input.session&&input.action!=='begin')throw Error('Session attestation belongs to begin; receipts belong to complete/fail only.');
    const request=await this.store.update(uid,request_id,hash(request_key),(request,foreground,operation)=>{
      if(!request)throw Error('Unknown interactive QA request.');
      if(operation){if(operation.inputHash!==inputHash)throw Error('request_key was already used for a different QA update.');return {request,foreground,operation};}
      const owns=!!request.run&&foreground?.requestId===request.id&&foreground.runId===request.run.id;
      const expired=request.expiresAt<=now||request.status==='active'&&(request.run?.leaseUntil||0)<=now;
      const terminal=['completed','failed','expired','released'].includes(request.status);
      if(input.action==='begin'){
        if(request.status!=='requires_handoff'||expired)throw Error('Only an unexpired handoff can begin.');
        if(!input.session)throw Error('Explicit owner consent and official desktop source-session attestation are required.');
        if(foreground)throw Error(`Foreground reserved by QA request ${foreground.requestId}. Even an expired reservation requires confirmed idle release; no session was launched.`);
        const runId=randomUUID(),leaseUntil=Math.min(now+90000,request.expiresAt);
        request.run={id:runId,session:input.session,startedAt:now,leaseUntil};foreground={requestId:request.id,runId,leaseUntil};request.status='active';
        request.reason='External official Desktop session reported by owner-scoped operator; authorization and observation are not independently verified by this broker.';
      }else if(input.action==='expire'){
        if(terminal||!expired)throw Error('Only an expired pending/active request can be marked expired.');
        request.status='expired';request.reason='Expired; any foreground reservation remains held until confirmed idle release.';
      }else if(input.action==='release'){
        if(owns&&input.desktop_idle!==true)throw Error('Confirm desktop_idle:true before releasing the foreground. This does not stop the external session.');
        if(terminal&&request.status!=='expired')throw Error('This QA request is terminal.');
        if(owns)foreground=null;request.status='released';request.reason=input.reason||'Released without claiming successful QA.';
      }else{
        if(terminal||expired||request.status!=='active'||!owns||input.run_id!==request.run?.id)throw Error('An unexpired owned foreground reservation and matching run_id are required.');
        if(input.action==='renew'){
          request.run!.leaseUntil=Math.min(now+90000,request.expiresAt);foreground={requestId:request.id,runId:request.run!.id,leaseUntil:request.run!.leaseUntil};
        }else{
          if(input.desktop_idle!==true)throw Error('Confirm desktop_idle:true before finishing the external session.');
          if(input.action==='complete'){
            if(!input.receipt)throw Error('A completed report requires an observation receipt.');
            this.validateReceipt(input.receipt,request,now);
            request.receipt={...input.receipt,run_id:request.run!.id,source:'operator-reported',verification:'not-independently-verified',owner_verdict:'unreviewed'};
            request.status='completed';request.reason='External operator report stored; this is not independently verified QA or owner acceptance.';
          }else{
            if(!input.reason)throw Error('Failure requires an actionable reason.');
            if(input.receipt){this.validateReceipt(input.receipt,request,now);if(input.receipt.gameplay_verdict==='playable_observed')throw Error('A failed QA run cannot report playable_observed.');request.receipt={...input.receipt,run_id:request.run!.id,source:'operator-reported',verification:'not-independently-verified',owner_verdict:'unreviewed'};}
            request.status='failed';request.reason=input.reason;
          }
          foreground=null;
        }
      }
      request.updatedAt=now;return {request,foreground,operation:{inputHash,at:now,action:input.action}};
    });
    return this.view(request);
  }
  private validateReceipt(receipt:Receipt,request:QaRequest,now:number){
    const within=(at:string)=>Date.parse(at)>=request.run!.startedAt&&Date.parse(at)<=now;
    if(!within(receipt.observed_at)||receipt.artifacts.some(a=>!within(a.captured_at)))throw Error('Observation/capture timestamps must belong to this actual run, without future dates.');
    if(receipt.visual_observed&&!receipt.artifacts.some(a=>['screenshot','video'].includes(a.kind)))throw Error('Visual observation requires a captured screenshot or video reference.');
    if(receipt.audio_observed&&!receipt.artifacts.some(a=>a.kind==='audio'||a.kind==='video'&&a.contains_audio===true))throw Error('Audio observation requires captured audio or video explicitly containing audio; playback or logs alone are insufficient.');
    if(receipt.gameplay_verdict==='playable_observed'&&(!receipt.visual_observed||request.target.device.audio==='required'&&!receipt.audio_observed))throw Error('Playable observation requires visual evidence and any requested audio observation.');
    if(receipt.gameplay_verdict==='not_tested'&&(receipt.visual_observed||receipt.audio_observed))throw Error('not_tested cannot claim sensory observation.');
  }
}
