// Fresh Auto Edit metadata transport. Uses the existing approved PC session.
// No separate credentials, image-byte transfer or network service.
import {isDeepStrictEqual} from 'node:util';
import {encode,decode} from './core.mjs';
import {OWNER_UID,PROJECT} from './session.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
import {validateAutoEditPlan,autoEditPlanHash,AUTO_EDIT_MODELS,isAutoId,isDriveId,isHash} from './auto-edit-contract.mjs';
import {AutoEditFault,AutoEditJournal,AutoEditRunner} from './auto-edit-runner.mjs';
import {ResourceSampler} from './resources.mjs';
import {learningAdmission,validateLearningRequest,reviewedEvidence,validateStoredProposal,LEARNING_ITEM} from '../../velum-gallery/auto-edit-learning-contract.mjs';

const ROOT='users/'+OWNER_UID+'/velumStudio/workspace';
const DOCUMENTS='projects/'+PROJECT+'/databases/(default)/documents/';
const COLLECTION='autoBatches';
const TELEMETRY_MS=25000;
const STATES=new Set(['queued','running','paused','blocked','completed','completed-with-failures','stopped']);
const COMMANDS=new Set(['run','pause','stop']);
const ADAPTERS=['guard','verifySource','download','describe','edit','recoverEdit','compare','deliver','reconcileDelivery','learn'];
const check=(ok,code)=>{if(!ok)throw new AutoEditFault(code)};
const unwrap=document=>decode({mapValue:{fields:document.fields}});
const pathFor=id=>{check(isAutoId(id),'invalid-batch-id');return COLLECTION+'/'+id};
const remoteRevision=doc=>doc.execution?.publicationRevision??0;
function pilotOf(value,now=Date.now()){
 return value?.version===1&&value.enabled===true&&value.mode==='pilot'&&isAutoId(value.batchId)&&isDriveId(value.sourceFileId)
  &&Number.isSafeInteger(value.expiresAt)&&value.expiresAt>now&&value.expiresAt<=now+10800000
  ? {mode:'pilot',batchId:value.batchId,sourceFileId:value.sourceFileId,expiresAt:value.expiresAt}:null;
}
function admissionOf(value){return pilotOf(value)||learningAdmission(value);}
function learningPath(id){check(isAutoId(id),'invalid-learning-id');return 'autoLearnings/'+id;}
function matchesPilot(pilot,plan){
 return Boolean(pilot?.mode==='pilot'&&plan?.batchId===pilot.batchId&&plan.config?.batchSize===1&&plan.config?.model===AUTO_EDIT_MODELS.image
  &&plan.items?.length===1&&plan.items[0].source?.authorized===true&&plan.items[0].source.fileId===pilot.sourceFileId);
}
function commandOf(doc){
 const c=doc.command;
 check(c&&COMMANDS.has(c.kind)&&Number.isSafeInteger(c.revision)&&c.revision>=0&&(c.retryItemId===null||(c.kind==='run'&&/^item-\d{3}$/.test(c.retryItemId))),'invalid-batch-command');
 return c;
}
export function autoEditShouldDispatch(doc,execution){
 return doc.command.revision>execution.commandRevision||['queued','running'].includes(execution.status);
}
function validateEnvelope(id,data){
 const plan=validateAutoEditPlan(data.plan);
 check(data.schemaVersion===1&&data.deviceUid===PC_DEVICE_UID&&plan.batchId===id&&data.createdAt===plan.createdAt&&isHash(data.planHash)&&data.planHash===autoEditPlanHash(plan),'batch-plan-mismatch');
 commandOf(data);
 check(data.claim===null||(data.claim?.deviceUid===PC_DEVICE_UID&&data.claim.planHash===data.planHash&&Number.isSafeInteger(data.claim.claimedAt)),'invalid-batch-claim');
 check(data.execution===null||(data.claim!==null&&data.execution?.batchId===id&&STATES.has(data.execution.status)&&Number.isSafeInteger(remoteRevision(data))&&remoteRevision(data)>0),'invalid-batch-execution');
 return plan;
}
export class AutoEditQueue {
 constructor(queue){this.queue=queue;}
 get uid(){return this.queue.session?.uid;}
 async read(id){
  check(this.uid===PC_DEVICE_UID,'device-identity-mismatch');
  const result=await this.queue.request(ROOT+'/'+pathFor(id),{allow:[404]});
  if(result.status===404)return null;
  return {id,updateTime:result.value.updateTime,data:unwrap(result.value)};
 }
 async admission(){
  check(this.uid===PC_DEVICE_UID,'device-identity-mismatch');
  const r=await this.queue.request(ROOT+'/autoEditControl/admission',{allow:[404]});
  if(r.status===404)return null;
  return admissionOf(unwrap(r.value));
 }
 async readLearning(id){
  check(this.uid===PC_DEVICE_UID,'device-identity-mismatch');
  const result=await this.queue.request(ROOT+'/'+learningPath(id),{allow:[404]});
  if(result.status===404)return null;
  return {id,updateTime:result.value.updateTime,data:validateLearningRequest(unwrap(result.value))};
 }
 async checkLearning(id){
  const admitted=await this.admission();
  check(admitted?.mode==='learning'&&admitted.learningId===id,'learning-admission-closed');
  const row=await this.readLearning(id);
  check(row?.data.learningId===id&&row.data.status==='running','learning-claim-lost');
  return row;
 }
 async readLearningEvidence(request){
  const read=async relative=>{
   const result=await this.queue.request(ROOT+'/'+relative,{allow:[404]});
   check(result.status===200,'learning-evidence-unavailable');
   return unwrap(result.value);
  };
  const configRecord=await read('autoConfigs/'+request.baseRevisionId);
  check(configRecord?.version===1&&configRecord.revisionId===request.baseRevisionId&&configRecord.config?.revisionId===request.baseRevisionId&&configRecord.config.model===request.model,'learning-config-mismatch');
  const config=configRecord.config,evidence=[];
  for(const batchId of request.batchIds){
   const [item,review]=await Promise.all([read(pathFor(batchId)+'/items/'+LEARNING_ITEM),read('autoReviews/'+batchId+'-'+LEARNING_ITEM)]);
   evidence.push(reviewedEvidence(batchId,item,review,config));
  }
  return {config,evidence};
 }
 async writeLearning(row,fields){
  await this.queue.write(learningPath(row.id),fields,{updateTime:row.updateTime});
 }
 async ready(pilot){
  if(!pilot)return [];
  const row=await this.read(pilot.batchId);
  if(!row||row.data.dispatch!==true)return [];
  check(matchesPilot(pilot,validateEnvelope(row.id,row.data)),'auto-edit-pilot-mismatch');
  return [row];
 }
 async reserve(row,pilot){
  const plan=validateEnvelope(row.id,row.data);
  check(matchesPilot(pilot,plan),'auto-edit-pilot-mismatch');
  check(row.data.dispatch===true,'batch-not-dispatchable');
  if(row.data.claim===null){
   try{await this.queue.write(pathFor(row.id),{claim:{deviceUid:this.uid,planHash:row.data.planHash,claimedAt:Date.now()}},{updateTime:row.updateTime});}
   catch(error){if(!['firebase-409','firebase-412'].includes(error.message))throw error;}
  }
  const current=await this.read(row.id);
  check(current&&current.data.dispatch===true,'batch-not-dispatchable');
  validateEnvelope(row.id,current.data);
  check(current.data.claim?.deviceUid===this.uid&&current.data.claim.planHash===row.data.planHash,'claim-lost');
  return {plan,planHash:row.data.planHash};
 }
 async claim({batchId,deviceUid,planHash,publicationRevision}){
  check(deviceUid===this.uid&&this.uid===PC_DEVICE_UID,'claim-lost');
  const [current,admitted]=await Promise.all([this.read(batchId),this.admission()]);
  check(admitted?.batchId===batchId,'auto-edit-admission-closed');
  check(current&&current.data.deviceUid===deviceUid&&current.data.planHash===planHash&&current.data.claim?.deviceUid===deviceUid&&current.data.claim.planHash===planHash,'claim-lost');
  check(matchesPilot(admitted,current.data.plan),'auto-edit-pilot-mismatch');
  // Missing/behind-cloud journal is not permission to run inference again.
  check(Number.isSafeInteger(publicationRevision)&&remoteRevision(current.data)<=publicationRevision,'local-journal-behind-cloud');
  const c=commandOf(current.data);
  return {approved:true,owned:true,command:c.kind,revision:c.revision,retryItemId:c.retryItemId};
 }
 async publish(plan,summary){
  const {batch,item}=summary,id=plan.batchId,hash=autoEditPlanHash(plan);
  check(batch?.batchId===id&&Number.isSafeInteger(batch.publicationRevision)&&batch.publicationRevision>0&&STATES.has(batch.status),'invalid-batch-publication');
  for(let attempt=0;attempt<3;attempt++){
   const current=await this.read(id);
   check(current&&current.data.deviceUid===this.uid&&current.data.planHash===hash&&current.data.claim?.deviceUid===this.uid&&current.data.claim.planHash===hash,'claim-lost');
   const revision=remoteRevision(current.data);
   if(revision===batch.publicationRevision){
    check(isDeepStrictEqual(current.data.execution,batch),'publication-revision-conflict');
    if(item){
     const existing=await this.queue.request(ROOT+'/'+pathFor(id)+'/items/'+item.itemId,{allow:[404]});
     check(existing.status===200&&isDeepStrictEqual(unwrap(existing.value),{...item,publicationRevision:revision}),'item-publication-conflict');
    }
    return {dispatch:current.data.dispatch};
   }
   check(revision+1===batch.publicationRevision,'publication-revision-conflict');
   const command=commandOf(current.data);
   check(batch.commandRevision<=command.revision,'unobserved-owner-command');
   const dispatch=autoEditShouldDispatch(current.data,batch),parentName=DOCUMENTS+ROOT+'/'+pathFor(id);
   const writes=[{update:{name:parentName,fields:encode({execution:batch,dispatch}).mapValue.fields},updateMask:{fieldPaths:['execution','dispatch']},currentDocument:{updateTime:current.updateTime}}];
   if(item){
    const spec=plan.items[item.ordinal-1];
    check(spec?.itemId===item.itemId&&isDeepStrictEqual(spec.source,item.source)&&spec.seed===item.seed,'item-plan-mismatch');
    writes.push({update:{name:parentName+'/items/'+item.itemId,fields:encode({...item,publicationRevision:batch.publicationRevision}).mapValue.fields}});
   }
   try{await this.queue.request(':commit',{method:'POST',value:{writes}});return {dispatch};}
   catch(error){if(!['firebase-409','firebase-412'].includes(error.message)||attempt===2)throw error;}
  }
  throw new AutoEditFault('publication-conflict');
 }
 async telemetry(plan,summary,resources){
  const {batch,item}=summary;
  if(batch.status!=='running'||!item?.inFlight||batch.activeItemId!==item.itemId)return false;
  const updatedAt=Date.now(),stageStartedAt=item.inFlight.startedAt;
  if(!Number.isSafeInteger(stageStartedAt)||stageStartedAt>updatedAt)return false;
  await this.queue.write(pathFor(plan.batchId)+'/live/pc',{
   batchId:plan.batchId,publicationRevision:batch.publicationRevision,itemId:item.itemId,
   progress:{stage:item.inFlight.stage,stageStartedAt,updatedAt,resources}
  });
  return true;
 }
}
// This optional listener attaches to the existing authenticated SDK instance.
// Never start it until concrete adapters are installed and admission is enabled.
export function subscribeAutoEditQueue(db,uid,{sdk,wake,command,connected,admission,error}){
 check(uid===PC_DEVICE_UID,'device-identity-mismatch');
 const {doc,onSnapshot}=sdk;
 let closed=false,queueStop=null,generation=0,pilot=null,expiry=null;
 function stopQueue(){
  generation++;queueStop?.();queueStop=null;
  clearTimeout(expiry);expiry=null;
  connected?.(false);
 }
 function setPilot(next){
  if(isDeepStrictEqual(pilot,next))return;
  stopQueue();pilot=next;admission?.(Boolean(next));
  if(!next)return;
  const current=++generation;
  expiry=setTimeout(()=>{
   if(!closed&&current===generation)setPilot(null);
  },Math.max(0,next.expiresAt-Date.now()));
  let seenRevision=null,online=false;
  // Listen to the exact admitted batch, not the full queue.
  const target=doc(db,ROOT+'/'+(next.mode==='learning'?learningPath(next.learningId):pathFor(next.batchId)));
  queueStop=onSnapshot(target,{includeMetadataChanges:true},snapshot=>{
   if(closed||current!==generation||!pilot)return;
   const wasOnline=online;online=!snapshot.metadata.fromCache;connected?.(online);
   if(!online||!snapshot.exists())return;
   const data=snapshot.data(),c=data.command;
   if(pilot.mode==='learning'){
    if(data.learningId!==pilot.learningId)return;
    const changed=seenRevision!==data.status;seenRevision=data.status;
    if(data.status==='cancelled'){command?.({batchId:next.learningId,kind:'stop'});return;}
    if((data.status==='queued'&&changed)||(data.status==='running'&&!wasOnline))wake();
    return;
   }
   if(!c||!COMMANDS.has(c.kind)||!Number.isSafeInteger(c.revision)||!matchesPilot(pilot,data.plan))return;
   const changed=c.revision!==seenRevision;
   if(changed){seenRevision=c.revision;command?.({batchId:next.batchId,kind:c.kind,revision:c.revision});}
   if(data.dispatch===true&&(changed||!wasOnline))wake();
  },cause=>{if(!closed&&current===generation){setPilot(null);error?.(cause);}});
 }
 const stopAdmission=onSnapshot(doc(db,ROOT+'/autoEditControl/admission'),{includeMetadataChanges:true},snapshot=>{
  if(closed)return;
  const next=!snapshot.metadata.fromCache&&snapshot.exists()?admissionOf(snapshot.data()):null;
  setPilot(next);
 },cause=>{if(!closed){setPilot(null);error?.(cause);}});
 return ()=>{closed=true;stopAdmission();stopQueue();pilot=null;admission?.(false);};
}
// One slice, under the existing worker lock. No independent GPU scheduler.
export class AutoEditDispatcher{
 constructor({queue,adapters,journal=new AutoEditJournal(),onError=()=>{},onActive=async()=>{}}){
  check(adapters&&ADAPTERS.every(key=>typeof adapters[key]==='function'),'incomplete-auto-edit-adapters');
  this.store=new AutoEditQueue(queue);this.adapters=adapters;this.journal=journal;this.onError=onError;this.onActive=onActive;this.active=null;
 }
 command({batchId,kind}){if(kind==='stop'&&this.active?.batchId===batchId)this.active.controller.abort();}
 abort(){this.active?.controller.abort();}
 async runLearning(admission,signal){
  const id=admission.learningId;
  let row=await this.store.readLearning(id);
  if(!row||!['queued','running'].includes(row.data.status))return {ran:false,needsMore:false};
  check(row.id===row.data.learningId,'learning-request-mismatch');
  // The claim is a one-shot boundary. A previous running claim after a
  // restart is ambiguous; never repeat its model call automatically.
  if(row.data.status==='running'){
   const current=await this.store.checkLearning(id);
   await this.store.writeLearning(current,{status:'failed',finishedAt:Date.now(),error:'learning-interrupted'});
   return {ran:true,needsMore:false};
  }
  const controller=new AbortController(),abort=()=>controller.abort();
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  this.active={batchId:id,controller};
  let claimed=false;
  const checkClaim=async()=>{
   check(!controller.signal.aborted,'execution-interrupted');
   await this.store.checkLearning(id);
   check(!controller.signal.aborted,'execution-interrupted');
   return {approved:true,owned:true,command:'run'};
  };
  try{
   check(!controller.signal.aborted,'execution-interrupted');
   await this.store.writeLearning(row,{status:'running',startedAt:Date.now()});claimed=true;
   row=await this.store.checkLearning(id);
   await this.onActive(id);
   const {config,evidence}=await this.store.readLearningEvidence(row.data);
   await this.adapters.guard({stage:'vision2',model:row.data.model,signal:controller.signal,checkClaim});
   const proposal=validateStoredProposal(await this.adapters.learn({request:row.data,config,evidence,signal:controller.signal,checkClaim}),row.data.batchIds);
   const current=await this.store.checkLearning(id);
   check(!controller.signal.aborted,'execution-interrupted');
   await this.store.writeLearning(current,{status:'proposed',finishedAt:Date.now(),proposal});
   return {ran:true,needsMore:false};
  }catch(error){
   if(claimed){
    try{
     const current=await this.store.checkLearning(id);
     const code=/^[a-z0-9-]{1,80}$/.test(error?.message||'')?error.message:'learning-unavailable';
     await this.store.writeLearning(current,{status:'failed',finishedAt:Date.now(),error:code});
    }catch{/* Expiry, cancellation or an uncertain write remains fail closed. */}
   }else throw error;
   return {ran:true,needsMore:false};
  }finally{
   controller.abort();signal?.removeEventListener('abort',abort);this.active=null;
   await this.onActive(null);
  }
 }
 async runOne({signal}={}){
  check(!this.active,'auto-dispatch-already-running');
  if(signal?.aborted)return {ran:false,needsMore:false};
  const pilot=await this.store.admission();
  if(!pilot)return {ran:false,needsMore:false};
  if(pilot.mode==='learning')return this.runLearning(pilot,signal);
  const rows=await this.store.ready(pilot);let reservation=null;
  for(const row of rows){
   try{reservation=await this.store.reserve(row,pilot);break;}
   catch(cause){if(!['batch-not-dispatchable','invalid-auto-edit-plan','batch-plan-mismatch','invalid-batch-command','invalid-batch-claim','invalid-batch-execution'].includes(cause?.message))throw cause;this.onError(cause,row.id);}
  }
  if(!reservation)return {ran:false,needsMore:false};
  const {plan}=reservation,controller=new AbortController();
  const abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  const sampler=new ResourceSampler();let latest=null,sampling=null;
  this.active={batchId:plan.batchId,controller};
  const sample=()=>{
   if(sampling||controller.signal.aborted||!latest||latest.batch.status!=='running'||!latest.item?.inFlight)return;
   const snapshot=latest;
   sampling=Promise.resolve().then(()=>sampler.sample({signal:controller.signal})).then(resources=>{
    if(latest===snapshot&&!controller.signal.aborted)return this.store.telemetry(plan,snapshot,resources);
   }).catch(()=>{}).finally(()=>{sampling=null;});
  };
  const timer=setInterval(sample,TELEMETRY_MS);
  try{
   await this.onActive(plan.batchId);
   const runner=new AutoEditRunner({journal:this.journal,adapters:{
    ...this.adapters,claim:details=>this.store.claim(details),
    publish:async summary=>{await this.store.publish(plan,summary);latest=summary;}
   }});
   const result=await runner.runSlice(plan,{signal:controller.signal});
   const current=await this.store.read(plan.batchId);
   return {ran:true,needsMore:Boolean(current?.data.dispatch)||rows.length>1,result};
  }finally{
   clearInterval(timer);controller.abort();await sampling;
   signal?.removeEventListener('abort',abort);this.active=null;
   await this.onActive(null);
  }
 }
}
