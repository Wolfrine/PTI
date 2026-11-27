// Fresh, local stage coordinator. The caller must bind it to the existing approved
// worker's queue/claim, GPU arbitration, resource guards and private Drive/model adapters.
// This module deliberately has no auto-start, service, credential, network or model loader.
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {mkdir,open,readFile,rename,lstat,realpath,rm,stat} from 'node:fs/promises';
import {
 AUTO_EDIT_LIMITS,AUTO_EDIT_STAGES,autoEditPlanHash,validateAutoEditPlan,
 composeAutoEditPrompt,validateVision1,validateVision2,validateEditReceipt,validateDeliveryReceipt,isHash
} from './auto-edit-contract.mjs';

const MAX_JOURNAL_BYTES=8*1024*1024;
const ROOT=String.raw`H:\Workspace\Generated\Velum\auto-edit-v1`;
const TERMINAL_ITEMS=new Set(['review-ready','failed','cancelled']);
const TERMINAL_BATCHES=new Set(['completed','completed-with-failures','stopped']);
const BATCH_STATES=new Set(['queued','running','paused','blocked','completed','completed-with-failures','stopped']);
const COMMANDS=new Set(['run','pause','stop']);
const STAGES=AUTO_EDIT_STAGES.slice(0,-1);
const boundedCode=value=>typeof value==='string'&&/^[a-z0-9-]{1,80}$/.test(value)?value:'stage-failed';
const clone=value=>structuredClone(value);
export class AutoEditFault extends Error{
 constructor(code,scope='batch'){super(boundedCode(code));this.code=boundedCode(code);this.scope=scope==='item'?'item':'batch';}
}
const fault=(code,scope)=>new AutoEditFault(code,scope);
function must(value,code){if(!value)throw fault(code);}
function samePath(a,b){return process.platform==='win32'?a.toLowerCase()===b.toLowerCase():a===b;}
function newState(plan){
 return {schemaVersion:1,planHash:autoEditPlanHash(plan),batchId:plan.batchId,status:'queued',commandRevision:-1,command:null,commandRetryItemId:null,blockedRevision:null,activeItemId:null,reason:null,pendingPublication:null,publicationRevision:0,updatedAt:Date.now(),
  items:plan.items.map(item=>({itemId:item.itemId,stage:'source',status:'queued',attempt:1,inFlight:null,durations:{},sourceArtifact:null,vision1:null,prompt:null,outputArtifact:null,editReceipt:null,vision2:null,receipt:null,failure:null}))};
}
function verifyState(state,plan){
 must(state?.schemaVersion===1&&state.batchId===plan.batchId&&state.planHash===autoEditPlanHash(plan)&&BATCH_STATES.has(state.status),'journal-plan-mismatch');
 must(Array.isArray(state.items)&&state.items.length===plan.items.length&&Number.isSafeInteger(state.commandRevision)&&state.commandRevision>=-1&&Number.isSafeInteger(state.publicationRevision)&&state.publicationRevision>=0,'invalid-journal');
 must(state.pendingPublication===null||(state.pendingPublication&&('itemId' in state.pendingPublication)&&(state.pendingPublication.itemId===null||state.items.some(i=>i.itemId===state.pendingPublication.itemId))),'invalid-pending-publication');
 must(state.activeItemId===null||state.items.some(i=>i.itemId===state.activeItemId),'invalid-active-item');
 for(let i=0;i<state.items.length;i++){
  const item=state.items[i];
  must(item?.itemId===plan.items[i].itemId&&AUTO_EDIT_STAGES.includes(item.stage)&&['queued','running','review-ready','failed','cancelled'].includes(item.status)&&Number.isSafeInteger(item.attempt)&&item.attempt>=1,'invalid-journal-item');
  must(item.inFlight===null||(item.inFlight?.stage===item.stage&&Number.isSafeInteger(item.inFlight.startedAt)),'invalid-journal-checkpoint');
  if(item.stage==='review-ready'){
   must(item.status==='review-ready'&&item.receipt&&item.outputArtifact,'invalid-review-checkpoint');
   validateDeliveryReceipt(item.receipt,{key:plan.batchId+'-'+item.itemId,outputHash:item.outputArtifact.sha256});
  }
  if(item.status==='review-ready')must(item.stage==='review-ready','invalid-review-status');
 }
 return state;
}
async function checkedDir(dir){
 await mkdir(dir,{recursive:true});
 const info=await lstat(dir);
 must(info.isDirectory()&&!info.isSymbolicLink()&&samePath(await realpath(dir),path.resolve(dir)),'unsafe-runtime-directory');
 return dir;
}
export class AutoEditJournal{
 constructor(root=ROOT){
  must(typeof root==='string'&&path.isAbsolute(root),'invalid-runtime-root');
  if(process.platform==='win32')must(path.win32.parse(root).root.toLowerCase()==='h:\\','runtime-must-be-on-h');
  this.root=path.resolve(root);
 }
 async directory(plan,itemId){
  const root=await checkedDir(this.root);
  const batch=await checkedDir(path.join(root,plan.batchId));
  return itemId?checkedDir(path.join(batch,itemId)):batch;
 }
 async load(plan){
  const dir=await this.directory(plan),filename=path.join(dir,'state.json');
  try{
   const info=await lstat(filename);must(info.isFile()&&!info.isSymbolicLink()&&info.size<=MAX_JOURNAL_BYTES,'invalid-journal-file');
   return verifyState(JSON.parse(await readFile(filename,'utf8')),plan);
  }catch(error){if(error?.code==='ENOENT')return newState(plan);throw error;}
 }
 async save(plan,state){
  verifyState(state,plan);
  const dir=await this.directory(plan),filename=path.join(dir,'state.json'),temporary=path.join(dir,'.state-'+randomUUID()+'.tmp');
  const bytes=Buffer.from(JSON.stringify(state));
  must(bytes.length<=MAX_JOURNAL_BYTES,'journal-too-large');
  const handle=await open(temporary,'wx',0o600);
  try{await handle.writeFile(bytes);await handle.sync();}finally{await handle.close();}
  try{await rename(temporary,filename);}finally{await rm(temporary,{force:true}).catch(()=>{});}
 }
}
async function imageArtifact(file,mime,expectedHash=null){
 const before=await lstat(file);
 must(before.isFile()&&!before.isSymbolicLink()&&before.size>=16&&before.size<=AUTO_EDIT_LIMITS.imageBytes,'invalid-image-file');
 const handle=await open(file,'r'),header=Buffer.alloc(24);
 try{await handle.read(header,0,24,0);}finally{await handle.close();}
 const png=header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&header.readUInt32BE(8)===13&&header.toString('ascii',12,16)==='IHDR',jpeg=header[0]===255&&header[1]===216&&header[2]===255;
 must(mime==='image/png'?png:mime==='image/jpeg'&&jpeg,'image-format-mismatch');
 const digest=createHash('sha256');
 for await(const chunk of createReadStream(file))digest.update(chunk);
 const after=await stat(file),sha256=digest.digest('hex');
 must(before.size===after.size&&before.mtimeMs===after.mtimeMs&&(!expectedHash||sha256===expectedHash),'image-identity-mismatch');
 const dimensions=mime==='image/png'?{width:header.readUInt32BE(16),height:header.readUInt32BE(20)}:{};
 if(mime==='image/png')must(dimensions.width>0&&dimensions.height>0,'invalid-image-dimensions');
 return {mime,bytes:before.size,sha256,...dimensions};
}
async function verifiedArtifact(file,record){
 must(record&&isHash(record.sha256),'missing-artifact-checkpoint');
 const actual=await imageArtifact(file,record.mime,record.sha256);
 must(actual.bytes===record.bytes&&actual.width===record.width&&actual.height===record.height,'image-size-mismatch');return actual;
}
const keyOf=(plan,item)=>plan.batchId+'-'+item.itemId;
function counts(state){
 return {total:state.items.length,ready:state.items.filter(i=>i.status==='review-ready').length,failed:state.items.filter(i=>i.status==='failed').length,cancelled:state.items.filter(i=>i.status==='cancelled').length};
}
function summary(plan,state,item){
 const spec=item?plan.items.find(x=>x.itemId===item.itemId):null;
 return {batch:{batchId:state.batchId,publicationRevision:state.publicationRevision,status:state.status,activeItemId:state.activeItemId,commandRevision:state.commandRevision,acknowledgedCommand:state.command,reason:state.reason,counts:counts(state),updatedAt:state.updatedAt,...(state.status==='stopped'?{cancelledItemIds:state.items.filter(i=>i.status==='cancelled').map(i=>i.itemId)}:{})},
  item:item?{...clone(item),ordinal:spec.ordinal,source:clone(spec.source),seed:spec.seed,model:plan.config.model,configurationRevision:plan.config.revisionId}:null};
}
// All callbacks must be bound by an approved-device integration. In particular,
// claim() is authoritative; adapters cannot substitute a cached owner decision.
const REQUIRED=['claim','publish','guard','verifySource','download','describe','edit','recoverEdit','compare','deliver','reconcileDelivery'];
export class AutoEditRunner{
 constructor({journal,adapters}){
  must(journal&&typeof journal.load==='function'&&typeof journal.save==='function'&&typeof journal.directory==='function','journal-required');
  must(adapters&&REQUIRED.every(key=>typeof adapters[key]==='function'),'incomplete-auto-edit-adapters');
  this.journal=journal;this.adapters=adapters;this.busy=false;
 }
 async claim(plan,state){
  const c=await this.adapters.claim({batchId:plan.batchId,deviceUid:plan.deviceUid,planHash:state.planHash,publicationRevision:state.publicationRevision});
  must(c?.approved===true&&c?.owned===true&&COMMANDS.has(c.command)&&Number.isSafeInteger(c.revision)&&c.revision>=0,'claim-lost');
  const retryItemId=c.retryItemId??null;
  must(retryItemId===null||(c.command==='run'&&state.items.some(i=>i.itemId===retryItemId)),'invalid-retry-command');
  must(c.revision>=state.commandRevision&&(c.revision!==state.commandRevision||(c.command===state.command&&retryItemId===state.commandRetryItemId)),'stale-or-conflicting-command');
  return {...c,retryItemId};
 }
 // Journal the publication before doing any cloud write. Replaying after an
 // ambiguous response is a fenced, idempotent metadata update, not inference.
 async flushPublication(plan,state){
  if(!state.pendingPublication)return;
  const item=state.items.find(i=>i.itemId===state.pendingPublication.itemId)??null;
  await this.claim(plan,state);
  await this.adapters.publish(summary(plan,state,item));
  state.pendingPublication=null;await this.journal.save(plan,state);
 }
 async persist(plan,state,item){
  state.publicationRevision++;state.updatedAt=Date.now();
  state.pendingPublication={itemId:item?.itemId??null};
  await this.journal.save(plan,state);
  await this.flushPublication(plan,state);
 }
 async control(plan,state,item,signal){
  const c=await this.claim(plan,state);
  if(c.revision>state.commandRevision&&c.retryItemId!==null){
   // Retry is an explicit owner command. A running slice first yields safely;
   // an interrupted edit/delivery keeps its checkpoint for reconciliation.
   if(state.activeItemId!==null){
    const active=state.items.find(i=>i.itemId===state.activeItemId);
    if(active&&!TERMINAL_ITEMS.has(active.status))active.status='queued';
    state.status='paused';state.reason='retry-awaiting-boundary';state.activeItemId=null;
    await this.persist(plan,state,active);return false;
   }
   const target=state.items.find(i=>i.itemId===c.retryItemId);
   must(target&&(target.status==='failed'||(state.status==='blocked'&&target.status==='queued'&&target.failure)),'retry-not-allowed');
   target.status='queued';target.failure=null;target.attempt++;
   state.status='queued';state.reason=null;state.blockedRevision=null;
   state.commandRevision=c.revision;state.command=c.command;state.commandRetryItemId=c.retryItemId;
   await this.persist(plan,state,target);
  }
  state.commandRevision=c.revision;state.command=c.command;state.commandRetryItemId=c.retryItemId;
  if(c.command==='stop'){
   const active=item||state.items.find(entry=>entry.itemId===state.activeItemId)||state.items.find(entry=>!TERMINAL_ITEMS.has(entry.status));
   for(const entry of state.items)if(!TERMINAL_ITEMS.has(entry.status)){entry.status='cancelled';entry.failure={code:'owner-stopped',stage:entry.stage,uncertain:Boolean(entry.inFlight)};}
   state.status='stopped';state.activeItemId=null;state.reason='owner-stopped';await this.persist(plan,state,active??null);return false;
  }
  if(c.command==='pause'||signal?.aborted){
   const active=item||state.items.find(entry=>entry.itemId===state.activeItemId)||state.items.find(entry=>!TERMINAL_ITEMS.has(entry.status));
   state.status='paused';state.reason=c.command==='pause'?'owner-paused':'execution-interrupted';state.activeItemId=null;
   if(active&&!TERMINAL_ITEMS.has(active.status))active.status='queued';
   await this.persist(plan,state,active??null);return false;
  }
  if(state.blockedRevision!==null&&c.revision<=state.blockedRevision)return false;
  state.blockedRevision=null;state.reason=null;return true;
 }
 async invokeStage(plan,state,item,spec,dir,stage,recovering,signal){
  const a=this.adapters,key=keyOf(plan,item),sourceFile=path.join(dir,spec.source.mime==='image/png'?'source.png':'source.jpg'),outputFile=path.join(dir,'edited.png');
  const checkClaim=async()=>{const c=await this.claim(plan,state);if(c.command==='stop'||signal?.aborted)throw fault('execution-interrupted');return c;};
  if((await checkClaim()).command!=='run')throw fault('execution-interrupted');
  // Guard includes current resource availability and serialization with manual jobs.
  await a.guard({batchId:plan.batchId,itemId:item.itemId,stage,model:plan.config.model,signal,checkClaim});
  const source=await a.verifySource({source:clone(spec.source),batchId:plan.batchId,itemId:item.itemId,sourcePath:sourceFile,sourceHash:item.sourceArtifact?.sha256??null,signal});
  if(source?.authorized!==true||source.fileId!==spec.source.fileId||source.folderId!==spec.source.folderId||source.mime!==spec.source.mime||source.trashed!==false)throw fault('source-authorization-or-identity-changed','item');
  if((await checkClaim()).command!=='run')throw fault('execution-interrupted');
  const context={batchId:plan.batchId,itemId:item.itemId,key,source:clone(spec.source),sourceHash:item.sourceArtifact?.sha256??null,outputHash:item.outputArtifact?.sha256??null,consent:plan.config.consent,model:plan.config.model,seed:spec.seed,configurationRevision:plan.config.revisionId,signal,checkClaim};
  if(stage==='source'){
   await a.download({...context,targetPath:sourceFile});
   item.sourceArtifact=await imageArtifact(sourceFile,spec.source.mime,spec.source.sha256);return;
  }
  await verifiedArtifact(sourceFile,item.sourceArtifact);
  if(stage==='vision1'){
   item.vision1=validateVision1(await a.describe({...context,sourcePath:sourceFile,visionModel:plan.config.vision1,guidance:plan.config.visionGuidance,instructions:plan.config.instructions}));return;
  }
  if(stage==='prompt'){item.prompt=composeAutoEditPrompt(plan.config.instructions,item.vision1?.addition);return;}
  must(item.prompt===composeAutoEditPrompt(plan.config.instructions,item.vision1?.addition),'prompt-checkpoint-mismatch');
  if(stage==='edit'){
   let result;
   if(recovering){
    const receipt=await a.recoverEdit({...context,sourcePath:sourceFile,targetPath:outputFile,prompt:item.prompt});
    if(receipt?.status==='saved')result=receipt;
    else if(receipt?.status!=='not-started'||receipt.confirmed!==true)throw fault('edit-outcome-unknown');
   }
   if(!result)result=await a.edit({...context,sourcePath:sourceFile,targetPath:outputFile,prompt:item.prompt});
   item.editReceipt=validateEditReceipt(result,{model:plan.config.model,seed:spec.seed,sourceHash:item.sourceArtifact.sha256,prompt:item.prompt});
   item.outputArtifact=await imageArtifact(outputFile,'image/png',item.editReceipt.sha256);
   must(item.outputArtifact.width===item.editReceipt.width&&item.outputArtifact.height===item.editReceipt.height,'output-dimensions-mismatch');return;
  }
  const editReceipt=validateEditReceipt(item.editReceipt,{model:plan.config.model,seed:spec.seed,sourceHash:item.sourceArtifact.sha256,prompt:item.prompt});
  must(editReceipt.sha256===item.outputArtifact?.sha256,'output-lineage-mismatch');
  await verifiedArtifact(outputFile,item.outputArtifact);
  if(stage==='vision2'){
   item.vision2=validateVision2(await a.compare({...context,sourcePath:sourceFile,editedPath:outputFile,visionModel:plan.config.vision2,instructions:plan.config.instructions,prompt:item.prompt}));return;
  }
  if(stage==='delivery'){
   const delivery={...context,editedPath:outputFile,outputHash:item.outputArtifact.sha256};
   // A stable key is required for reserved Drive ID reconciliation. Unknown outcomes
   // must not be retried as a fresh upload.
   let result=await a.reconcileDelivery(delivery);
   if(result?.status==='not-started'&&result.confirmed===true)result=await a.deliver(delivery);
   must(result?.status==='saved','delivery-outcome-unknown');
   item.receipt=validateDeliveryReceipt(result.receipt,{key,outputHash:item.outputArtifact.sha256});return;
  }
  throw fault('unknown-stage');
 }
 // One item per slice. The existing dispatcher can service manual jobs between
 // slices. It must supply a stop/revocation AbortSignal to terminate active work.
 async runSlice(rawPlan,{signal}={}){
  must(!this.busy,'runner-already-active');this.busy=true;
  try{
   const plan=validateAutoEditPlan(rawPlan),state=await this.journal.load(plan);
   await this.flushPublication(plan,state);
   if(TERMINAL_BATCHES.has(state.status)){
    if(state.status!=='completed-with-failures')return summary(plan,state,null);
    const c=await this.claim(plan,state);
    if(c.revision<=state.commandRevision||c.retryItemId===null)return summary(plan,state,null);
   }
   if(!await this.control(plan,state,null,signal))return summary(plan,state,null);
   const ready=i=>!TERMINAL_ITEMS.has(i.status);
   const item=state.items.find(i=>i.itemId===state.commandRetryItemId&&ready(i))??state.items.find(ready);
   if(!item){state.status=counts(state).failed?'completed-with-failures':'completed';state.activeItemId=null;await this.persist(plan,state,null);return summary(plan,state,null);}
   const spec=plan.items.find(i=>i.itemId===item.itemId),dir=await this.journal.directory(plan,item.itemId);
   state.status='running';state.activeItemId=item.itemId;item.status='running';await this.persist(plan,state,item);
   while(item.stage!=='review-ready'){
    if(!await this.control(plan,state,item,signal))return summary(plan,state,item);
    const stage=item.stage,recovering=item.inFlight?.stage===stage;
    if(!recovering)item.inFlight={stage,startedAt:Date.now()};
    await this.persist(plan,state,item);
    const started=Date.now();
    try{
     await this.invokeStage(plan,state,item,spec,dir,stage,recovering,signal);
    }catch(error){
     item.durations[stage]=(item.durations[stage]??0)+Math.max(0,Date.now()-started);
     if(error?.code==='claim-lost'||error?.code==='stale-or-conflicting-command')throw error;
     // On interruption, re-read the real owner command; preserve the in-flight
     // checkpoint for edit/delivery reconciliation. Unknown exceptions block.
     if(!await this.control(plan,state,item,signal))return summary(plan,state,item);
     item.failure={code:boundedCode(error?.code||error?.message),stage,uncertain:Boolean(item.inFlight)};
     if(error instanceof AutoEditFault&&error.scope==='item'){
      item.status='failed';state.activeItemId=null;
     }else{
      state.status='blocked';state.blockedRevision=state.commandRevision;state.reason=item.failure.code;state.activeItemId=null;item.status='queued';
     }
     await this.persist(plan,state,item);return summary(plan,state,item);
    }
    item.durations[stage]=(item.durations[stage]??0)+Math.max(0,Date.now()-started);
    item.inFlight=null;item.failure=null;item.stage=AUTO_EDIT_STAGES[STAGES.indexOf(stage)+1];
    if(item.stage==='review-ready')item.status='review-ready';
    // A stage result is durable before reading further commands or publishing.
    await this.persist(plan,state,item);
   }
   state.activeItemId=null;
   if(state.items.every(i=>TERMINAL_ITEMS.has(i.status)))state.status=counts(state).failed?'completed-with-failures':'completed';
   await this.persist(plan,state,item);return summary(plan,state,item);
  }finally{this.busy=false;}
 }
}
