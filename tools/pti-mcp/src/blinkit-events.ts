import type {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import type {Firestore} from 'firebase-admin/firestore';
import {createHash,randomUUID} from 'node:crypto';
import {z} from 'zod';
import {assertUser} from './access.js';
export const eventSchema=z.object({schemaVersion:z.literal(1),kind:z.literal('payment-alert'),provider:z.literal('blinkit'),merchant:z.literal('Blinkit'),gmailMessageId:z.string().regex(/^[a-f0-9]{8,40}$/),amount:z.number().positive().max(100000),currency:z.literal('INR'),paymentAt:z.iso.datetime({offset:true}).refine(v=>v.endsWith('+05:30'),'Use the actual Asia/Kolkata offset.'),paymentTimezone:z.literal('Asia/Kolkata'),observedAt:z.iso.datetime({offset:true}),status:z.literal('pending')}).strict();
export const eventIdFor=(message:string)=>'blinkit-gmail-'+message;
export const eventPath=(path:string)=>/^users\/[^/]+\/foodData\/workspace\/purchaseEvents\/[^/]+$/.test(path);
const leaseHash=(value:string)=>createHash('sha256').update(value).digest('hex');
export function eventPayload(data:any){return eventSchema.parse(Object.fromEntries(Object.keys(eventSchema.shape).map(key=>[key,key==='status'?'pending':data[key]])));}
export async function createPaymentEvent(db:Firestore,path:string,data:any,owner?:string){
 if(data.provider!=='blinkit'||data.merchant!=='Blinkit')return {ignored:true};
 const value=eventSchema.parse(data),parts=path.split('/');assertUser(parts[1],owner);
 if(!eventPath(path)||parts[5]!==eventIdFor(value.gmailMessageId))throw Error('Payment event path must use its deterministic Gmail message ID.');
 if(Date.parse(value.observedAt)>Date.now()+300000||Date.parse(value.paymentAt)>Date.parse(value.observedAt)+300000)throw Error('Invalid payment observation time.');
 const root=db.doc(parts.slice(0,4).join('/')),ref=db.doc(path);
 return db.runTransaction(async tx=>{
  const [settings,existing]=await Promise.all([tx.get(root),tx.get(ref)]);
  if(settings.get('ingestionPaused')===true)throw Error('Morsel ingestion is paused by its owner.');
  if(existing.exists){const old=eventPayload(existing.data());const {observedAt:unused,...a}=value,{observedAt:prior,...b}=old;if(JSON.stringify(a)!==JSON.stringify(b))throw Error('Payment event identity conflict.');return {ok:true,duplicate:true,eventId:ref.id};}
  tx.create(ref,{...value,attempts:0,createdAt:new Date().toISOString(),nextAttemptAt:value.observedAt});
  return {ok:true,duplicate:false,eventId:ref.id};
 });
}
export function validateEventLease(event:any,lease:string|undefined){
 if(!event||!lease||event.status!=='processing'||event.leaseHash!==leaseHash(lease)||!Number.isFinite(Date.parse(event.leaseExpiresAt||''))||Date.parse(event.leaseExpiresAt)<=Date.now())throw Error('Payment event lease expired or mismatched.');
 return eventPayload(event);
}
const json=(value:any)=>({content:[{type:'text' as const,text:JSON.stringify(value)}]});
const codes=z.enum(['not_yet_listed','transient','blinkit_login_required','first_party_tools_unavailable','source_access_denied','ambiguous_match','unknown_source_date','preview_needs_review','nonfood_only_preview','revision_conflict']);
export function registerBlinkitEventTools(server:McpServer,db:Firestore,owner:string|undefined){
 server.registerTool('food_blinkit_events',{title:'Claim and reconcile email-triggered Blinkit capture',description:'Read minimal payment wake-ups, lease one bounded event, retain retry/manual scope outcomes and publish local reader readiness. No email bodies, bank identifiers, source endpoint access or direct purchase writes. Ingestion uses the canonical food_blinkit_ingest transaction.',
  inputSchema:{uid:z.string().optional(),action:z.enum(['context','claim','defer','heartbeat']),eventId:z.string().regex(/^blinkit-gmail-[a-f0-9]{8,40}$/).optional(),after:z.string().max(100).optional(),lease:z.string().max(100).optional(),replay:z.boolean().default(false),limit:z.number().int().min(1).max(20).default(10),code:codes.optional(),workerStatus:z.enum(['ready','paused','blinkit_login_required','morsel_login_required','source_access_denied','first_party_tools_unavailable','browser_profile_in_use']).optional()},annotations:{readOnlyHint:false,destructiveHint:false}},async input=>{
  if(input.uid)assertUser(input.uid,owner);const uid=assertUser(owner||input.uid||'',owner),root=db.doc(`users/${uid}/foodData/workspace`),events=root.collection('purchaseEvents');
  if(input.action==='context'){
   let q=events.orderBy('__name__');if(input.after)q=q.startAfter(input.after);
   const [settings,state,queue]=await Promise.all([root.get(),root.collection('purchaseWorkerState').doc('local').get(),q.limit(201).get()]);
   const now=Date.now(),rows=queue.docs.map(d=>({...d.data(),id:d.id} as any)).filter(d=>d.provider==='blinkit'&&d.merchant==='Blinkit');
   const due=rows.filter(d=>['pending','retry_wait','reconcile_pending','processing'].includes(d.status)&&Date.parse(d.nextAttemptAt||d.observedAt)<=now&&(d.status!=='processing'||Date.parse(d.leaseExpiresAt||'')<=now)).slice(0,input.limit);
   return json({ingestionPaused:settings.get('ingestionPaused')===true,worker:state.data()||null,events:due.map(d=>({eventId:d.id,...eventPayload(d),status:d.status,purchaseId:d.purchaseId||null,attempts:d.attempts||0})),window:{scanned:rows.length,truncated:queue.size>200,nextAfter:queue.size>200?queue.docs[199].id:null},rules:['Payment is a wake-up, never item/consumption evidence.','Only first-party listed tokens, full eligible details and unique amount/display-time matches can be ingested.']});
  }
  if(input.action==='heartbeat'){
   if(!input.workerStatus)throw Error('A bounded worker status is required.');
   await db.runTransaction(async tx=>{const settings=await tx.get(root);tx.set(root.collection('purchaseWorkerState').doc('local'),{schemaVersion:1,source:'local-firstparty-webmcp',status:settings.get('ingestionPaused')===true?'paused':input.workerStatus,lastSeenAt:new Date().toISOString()});});return json({ok:true});
  }
  if(!input.eventId)throw Error('An event ID is required.');const ref=events.doc(input.eventId);
  return json(await db.runTransaction(async tx=>{
   const [settings,snap]=await Promise.all([tx.get(root),tx.get(ref)]);if(settings.get('ingestionPaused')===true)throw Error('Morsel ingestion is paused by its owner.');
   if(!snap.exists)throw Error('Payment event not found.');const event=snap.data()!,payload=eventPayload(event),now=Date.now();
   if(ref.id!==eventIdFor(payload.gmailMessageId))throw Error('Payment event identity mismatch.');
   if(input.action==='claim'){
    if(event.status==='imported'&&!input.replay)return {ok:true,duplicate:true,purchaseId:event.purchaseId};
    if(!['pending','retry_wait','reconcile_pending','processing','imported'].includes(event.status))throw Error('Payment event needs owner review.');
    if(event.status==='processing'&&Date.parse(event.leaseExpiresAt)>now)throw Error('Payment event already leased.');
    if(!input.replay&&Date.parse(event.nextAttemptAt||payload.observedAt)>now)throw Error('Payment retry is not due.');
    const lease=randomUUID();tx.set(ref,{...event,status:'processing',attempts:(event.attempts||0)+1,leaseHash:leaseHash(lease),leaseExpiresAt:new Date(now+600000).toISOString(),nextAttemptAt:new Date(now+600000).toISOString()});
    return {ok:true,event:{...payload,eventId:ref.id,purchaseId:event.purchaseId||null},lease};
   }
   validateEventLease(event,input.lease);if(!input.code)throw Error('A bounded outcome code is required.');
   const review=['ambiguous_match','unknown_source_date','preview_needs_review','revision_conflict'].includes(input.code),outside=input.code==='nonfood_only_preview';
   const delay=Math.min(3600000,60000*2**Math.min(6,(event.attempts||1)-1));
   tx.set(ref,{...event,status:outside?'outside_food_scope':review?'needs_review':'retry_wait',lastCode:input.code,leaseHash:null,leaseExpiresAt:null,nextAttemptAt:review||outside?null:new Date(now+delay).toISOString(),...(outside?{scopeBasis:'preview_only',foodContentsKnown:false}:{}),updatedAt:new Date(now).toISOString()});
   return {ok:true,status:outside?'outside_food_scope':review?'needs_review':'retry_wait'};
  }));
 });
}
