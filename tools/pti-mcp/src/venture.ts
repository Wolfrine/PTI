import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Firestore } from 'firebase-admin/firestore';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertUser } from './access.js';

const safeId=z.string().regex(/^[A-Za-z0-9_-]{1,150}$/);
const sourceUrl=z.string().url().refine(s=>/^https?:\/\//i.test(s),'Use http(s) sources.');
const finding=z.object({title:z.string().min(1).max(180),summary:z.string().min(1).max(8000),stance:z.enum(['supports','challenges','neutral']),evidenceType:z.enum(['fact','reported','inference','question']),sourceUrl:sourceUrl.optional(),sourceTitle:z.string().max(250).optional()}).refine(f=>!['fact','reported'].includes(f.evidenceType)||!!f.sourceUrl,'Facts and reported claims require a source URL.');
const normalize=(value:any):any=>value?.toDate?value.toDate().toISOString():Array.isArray(value)?value.map(normalize):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v)])):value;
const json=(value:unknown)=>({content:[{type:'text' as const,text:JSON.stringify(value,null,2)}]});
export function registerVentureTools(server:McpServer,db:Firestore,owner?:string){
 const root=(uid?:string)=>{const account=owner||(uid?assertUser(uid):null);if(!account)throw new Error('Provide the workspace owner uid.');if(uid)assertUser(uid,owner);return db.doc(`users/${account}/ventureData/workspace`);};
 server.registerTool('venture_context',{title:'Read Venture discussion and discovery context',description:'Read original discussion, branches, decisions, experiments, evidence and queued research. Preserve human words and rejection reasons. Truncated collections must be expanded through bounded queries before making claims of completeness.',inputSchema:{uid:z.string().optional(),threadId:safeId.optional()},annotations:{readOnlyHint:true}},async({uid,threadId})=>{
  const r=root(uid),workspace=await r.get();if(!workspace.exists)throw new Error('Venture workspace does not exist.');
  const names=['threads','messages','branches','researchTasks','findings','decisions','experiments','discoveries','patterns','opportunities','runs'];
  const result:Record<string,unknown>={workspace:normalize(workspace.data()),root:r.path,truncated:[]};
  await Promise.all(names.map(async name=>{let q:rQuery= r.collection(name).limit(100);if(threadId&&['messages','branches','researchTasks','findings','decisions','experiments'].includes(name))q=q.where('threadId','==',threadId);else q=q.orderBy(name==='runs'?'startedAt':'createdAt','desc');const snap=await q.get();result[name]=snap.docs.map(s=>{const value=normalize(s.data());if(value.audioData){value.audioAvailable=true;delete value.audioData;}return {id:s.id,...value,updateToken:`${s.updateTime!.seconds}:${s.updateTime!.nanoseconds}`};});if(snap.size===100)(result.truncated as string[]).push(name);}));
  return json(result);
 });
 server.registerTool('venture_claim_research',{title:'Claim a Venture research request',description:'Claim one queued request or reclaim an expired run. The returned token is needed for publication. Do not claim work unless research is starting.',inputSchema:{uid:z.string().optional(),taskId:safeId},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:false}},async({uid,taskId})=>{
  const taskRef=root(uid).collection('researchTasks').doc(taskId),token=randomUUID();let data:any;
  await db.runTransaction(async tx=>{const snap=await tx.get(taskRef);if(!snap.exists)throw new Error('Research request not found.');data=snap.data();if(data.status!=='queued'&&!(data.status==='running'&&new Date(data.leaseUntil).getTime()<Date.now()))throw new Error('Request is already claimed, completed or blocked.');tx.update(taskRef,{status:'running',claimToken:token,leaseUntil:new Date(Date.now()+45*60*1000).toISOString(),updatedAt:new Date().toISOString(),updatedBy:'venture-agent'});});return json({taskId,claimToken:token,question:data.question,threadId:data.threadId||'',branchId:data.branchId||''});
 });
 server.registerTool('venture_publish_research',{title:'Publish source-backed Venture findings',description:'Atomically append findings and finish a claimed request. Never changes human messages, decisions or branch statuses. Report blocked when evidence cannot be obtained; never fabricate completion.',inputSchema:{uid:z.string().optional(),taskId:safeId,claimToken:z.string().uuid(),status:z.enum(['completed','blocked']),summary:z.string().min(1).max(4000),findings:z.array(finding).max(8)},annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},async({uid,taskId,claimToken,status,summary,findings})=>{
  const r=root(uid),taskRef=r.collection('researchTasks').doc(taskId),ids=findings.map(()=>randomUUID()),time=new Date().toISOString();
  await db.runTransaction(async tx=>{const snap=await tx.get(taskRef);const data=snap.data();if(!data)throw new Error('Request missing.');if(data.status===status&&data.publishedClaimToken===claimToken)return;if(data.status!=='running'||data.claimToken!==claimToken)throw new Error('Request claim changed. Read fresh context.');if(new Date(data.leaseUntil).getTime()<Date.now())throw new Error('Claim expired. Reclaim before publishing.');
   if(data.threadId){const thread=await tx.get(r.collection('threads').doc(data.threadId));if(!thread.exists)throw new Error('Discussion no longer exists.');}
   if(data.branchId){const branch=await tx.get(r.collection('branches').doc(data.branchId));if(!branch.exists||branch.data()?.threadId!==data.threadId)throw new Error('Direction no longer belongs to this discussion.');}
   findings.forEach((f,i)=>tx.create(r.collection('findings').doc(ids[i]),{...f,sourceUrl:f.sourceUrl||'',sourceTitle:f.sourceTitle||'',threadId:data.threadId||'',branchId:data.branchId||'',taskId,createdAt:time,updatedAt:time,createdBy:'venture-agent',authorName:'Research agent',revision:1}));
   tx.update(taskRef,{status,resultSummary:summary,completedAt:time,updatedAt:time,updatedBy:'venture-agent',publishedClaimToken:claimToken,findingIds:ids});
  });
  const saved=await taskRef.get();return json({ok:true,taskId,status:saved.data()?.status,findingIds:saved.data()?.findingIds||[]});
 });
}
type rQuery=FirebaseFirestore.Query;
