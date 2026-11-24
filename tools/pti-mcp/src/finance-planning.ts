import express, { type ErrorRequestHandler } from 'express';
import { z } from 'zod';
import type { DocumentReference } from 'firebase-admin/firestore';
import type { CheckUser, UserIdentity } from './oauth.js';
import { financeOwner, FinanceError } from './finance-contract.js';

const amount=z.number().int().min(0).max(100_000_000_000_000);
const signedAmount=z.number().int().min(-100_000_000_000_000).max(100_000_000_000_000);
const key=z.string().regex(/^[A-Za-z0-9_-]{8,96}$/);
const title=z.string().trim().min(1).max(72).refine(v=>!/[\p{Cc}\p{Cf}<>@]|\d{6}|https?:/iu.test(v));
const goal=z.object({id:key,title,targetPaisa:amount.positive(),savedPaisa:amount,due:z.iso.date()}).strict();
const bill=z.object({id:key,title,amountPaisa:amount.positive(),due:z.iso.date(),state:z.enum(['open','paid'])}).strict();
const scenario=z.object({id:key,title,pricePaisa:amount.positive(),upfrontPaisa:amount,termMonths:z.number().int().min(1).max(360),annualRateBps:z.number().int().min(0).max(6000),ongoingPaisa:amount,state:z.enum(['considering','chosen','declined'])}).strict().refine(v=>v.upfrontPaisa<=v.pricePaisa);
const profile=z.object({
 incomePaisa:amount.nullable(),essentialsPaisa:amount.nullable(),discretionaryPaisa:amount.nullable(),commitmentsPaisa:amount.nullable(),reservePaisa:amount.nullable(),extraCashPaisa:amount.nullable(),dueBeforeIncomePaisa:amount.nullable(),nextIncomeOn:z.iso.date().nullable(),
 goals:z.array(goal).max(12),bills:z.array(bill).max(30),scenarios:z.array(scenario).max(12)
}).strict().refine(v=>[v.goals,v.bills,v.scenarios].every(list=>new Set(list.map(x=>x.id)).size===list.length));
type Profile=z.output<typeof profile>;
const empty:Profile={incomePaisa:null,essentialsPaisa:null,discretionaryPaisa:null,commitmentsPaisa:null,reservePaisa:null,extraCashPaisa:null,dueBeforeIncomePaisa:null,nextIncomeOn:null,goals:[],bills:[],scenarios:[]};
const persisted=z.object({revision:z.number().int().nonnegative(),profile,updatedAt:z.string()}).strict();
const input=z.discriminatedUnion('action',[z.object({action:z.literal('read')}).strict(),z.object({action:z.literal('save'),expectedRevision:z.number().int().nonnegative(),profile}).strict()]);
type Input=z.output<typeof input>;
const statement=z.object({
 month:z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/),from:z.iso.date(),to:z.iso.date(),rows:z.number().int().nonnegative(),
 debitPaisa:amount,creditPaisa:amount,openingPaisa:signedAmount,closingPaisa:signedAmount,
 account:z.string().regex(/^[a-z][a-z0-9_-]{1,47}$/).refine(v=>!/\d{5}/.test(v)),sourceWindowId:z.string().regex(/^[a-f0-9]{64}$/)
}).strict().refine(v=>v.from<=v.to&&v.from.startsWith(v.month)&&v.to.startsWith(v.month)&&v.openingPaisa-v.debitPaisa+v.creditPaisa===v.closingPaisa);

async function context(root:DocumentReference){
 const [saved,checkpoint,publications]=await Promise.all([root.collection('planning').doc('profile').get(),root.collection('projects').doc('pti-finance-v1').get(),root.collection('publications').orderBy('publishedAt','desc').limit(50).get()]);
 const plan=saved.exists?persisted.parse(saved.data()):{revision:0,profile:empty,updatedAt:''};
 const raw:unknown=checkpoint.get('statementCashEvidence.facts');
 const facts=(Array.isArray(raw)?raw.slice(0,120):[]).flatMap(v=>{const x=statement.safeParse(v);return x.success?[x.data]:[]});
 const ids=[...new Set(facts.map(v=>v.sourceWindowId))];
 const docs=ids.length?await root.firestore.getAll(...ids.map(v=>root.collection('sourceWindows').doc(v))):[];
 const windows=new Map(docs.map(v=>[v.id,v.data()]));
 const unique=new Map<string,typeof facts[number]>();
 for(const fact of facts){
  const w=windows.get(fact.sourceWindowId);
  if(w?.sourceType!=='bank_statement'||w.status!=='observed'||typeof w.period?.from!=='string'||typeof w.period?.to!=='string'||w.period.from>fact.from||w.period.to<fact.to)continue;
  const id=fact.account+'|'+fact.month,prior=unique.get(id);
  if(!prior||fact.from<prior.from||(fact.from===prior.from&&fact.to>prior.to))unique.set(id,fact);
 }
 return {ok:true,...plan,statementFacts:[...unique.values()].sort((a,b)=>a.month.localeCompare(b.month)),publications:publications.docs.map(d=>d.data())};
}
export async function financePlanning(root:DocumentReference,request:Input){
 if(request.action==='read')return context(root);
 const ref=root.collection('planning').doc('profile');
 await root.firestore.runTransaction(async tx=>{
  const existing=await tx.get(ref);
  const revision=existing.exists?persisted.parse(existing.data()).revision:0;
  if(revision!==request.expectedRevision)throw new FinanceError('revision_conflict');
  tx.set(ref,{revision:revision+1,profile:request.profile,updatedAt:new Date().toISOString()});
 });
 return context(root);
}
const origins=new Set(['https://pti-app-2ab59-finance.web.app','https://pti-app-2ab59-finance.firebaseapp.com']);
export function financePlanningRouter(options:{verifyIdentity:(token:string)=>Promise<UserIdentity>;checkUser:CheckUser;operate:(uid:string,request:Input)=>Promise<unknown>}){
 const router=express.Router();
 router.use((req,res,next)=>{
  res.vary('Origin').set('Cache-Control','no-store');
  const origin=req.get('origin');
  if(!origin||!origins.has(origin)){res.status(403).json({ok:false,error:{code:'origin_denied'}});return;}
  res.set('Access-Control-Allow-Origin',origin);
  if(req.method!=='OPTIONS'){next();return;}
  const headers=(req.get('access-control-request-headers')||'').split(',').map(v=>v.trim().toLowerCase()).filter(Boolean);
  if(req.get('access-control-request-method')!=='POST'||headers.some(v=>!['authorization','content-type'].includes(v))){res.status(403).end();return;}
  res.set({'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Max-Age':'300'}).status(204).end();
 });
 router.post('/',async(req,res,next)=>{
  const bearer=/^Bearer ([^\s]{1,12000})$/.exec(req.get('authorization')||'');
  if(!bearer){res.status(401).json({ok:false,error:{code:'sign_in_required'}});return;}
  try{const identity=await options.verifyIdentity(bearer[1]);await options.checkUser(identity.uid,identity.authenticatedAt);
   if(!financeOwner(identity.uid,identity.email)||identity.signInProvider!=='google.com')throw new Error('denied');
   res.locals.financeOwner=identity.uid;next();
  }catch{res.status(403).json({ok:false,error:{code:'owner_authorization_required'}});}
 },express.json({limit:'32kb',strict:true}),async(req,res)=>{
  const x=input.safeParse(req.body);if(!x.success){res.status(400).json({ok:false,error:{code:'invalid_request'}});return;}
  try{res.json(await options.operate(res.locals.financeOwner,x.data));}
  catch(error){const code=error instanceof FinanceError?error.code:'service_unavailable';res.status(code==='revision_conflict'?409:503).json({ok:false,error:{code}});}
 });
 router.all('/',(_req,res)=>res.set('Allow','POST, OPTIONS').status(405).end());
 router.use(((_err,_req,res,_next)=>res.status(400).json({ok:false,error:{code:'invalid_request'}})) as ErrorRequestHandler);
 return router;
}
