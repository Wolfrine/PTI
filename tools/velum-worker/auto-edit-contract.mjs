// Fresh Auto Edit v1. Independent of manual Studio job documents.
import {createHash,randomInt} from 'node:crypto';
import {MODEL_IDS,QWEN_TURBO_MODEL} from '../../velum-gallery/studio-contract.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
import {PRIVATE_FOLDER_ID,REFERENCES_FOLDER_ID} from '../../velum-gallery/drive-library.mjs';

export const AUTO_EDIT_VERSION=1;
export const AUTO_EDIT_LIMITS=Object.freeze({batch:100,instructions:3998,guidance:4000,addition:2000,prompt:6000,imageBytes:64*1024*1024});
export const AUTO_EDIT_MODELS=Object.freeze({image:QWEN_TURBO_MODEL,vision1:'qwen3-vl-2b-instruct',vision2:'qwen3-vl-4b-instruct'});
export const AUTO_EDIT_STAGES=Object.freeze(['source','vision1','prompt','edit','vision2','delivery','review-ready']);
export const SOURCE_FOLDERS=Object.freeze({private:PRIVATE_FOLDER_ID,references:REFERENCES_FOLDER_ID});
export const REVIEW_STAGING_ID='1o7mc6xUgh_oAWjQLxdZoZtpTZa66xwhE';
const SCOPES=new Set(['private','references','both']);
const MIMES=new Set(['image/png','image/jpeg']);
export const isAutoId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,80}$/.test(value);
export const isDriveId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{8,160}$/.test(value);
export const isHash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export const isSeed=value=>Number.isSafeInteger(value)&&value>=0&&value<=2147483647;
const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||Boolean(value.trim()));
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
function need(ok,code){if(!ok)throw new Error(code);}
function configOf(value){
 need(value&&value.consent===true,'auto-edit-authorization-required');
 need(text(value.instructions,AUTO_EDIT_LIMITS.instructions,true),'invalid-edit-instructions');
 need(text(value.visionGuidance,AUTO_EDIT_LIMITS.guidance),'invalid-vision-guidance');
 need(MODEL_IDS.includes(value.model),'invalid-image-model');
 need(value.vision1===AUTO_EDIT_MODELS.vision1&&value.vision2===AUTO_EDIT_MODELS.vision2,'invalid-vision-model');
 need(SCOPES.has(value.sourceScope)&&integer(value.batchSize,1,AUTO_EDIT_LIMITS.batch),'invalid-batch-size-or-scope');
 need(isAutoId(value.revisionId),'approved-configuration-required');
 return {instructions:value.instructions,visionGuidance:value.visionGuidance,model:value.model,vision1:value.vision1,vision2:value.vision2,sourceScope:value.sourceScope,batchSize:value.batchSize,revisionId:value.revisionId,consent:true};
}
function sourceOf(source,scope){
 need(source&&source.authorized===true&&!source.trashed&&isDriveId(source.fileId)&&MIMES.has(source.mime),'invalid-or-unauthorized-source');
 need(Object.values(SOURCE_FOLDERS).includes(source.folderId)&&(scope==='both'||source.folderId===SOURCE_FOLDERS[scope]),'invalid-source-folder');
 need(source.sha256===undefined||source.sha256===null||isHash(source.sha256),'invalid-source-hash');
 return {fileId:source.fileId,folderId:source.folderId,mime:source.mime,authorized:true,sha256:source.sha256??null};
}
// Selection is without replacement from the explicitly authorized source set.
// Only chosen source identities are persisted; the rest of the gallery is not.
export function makeAutoEditPlan({batchId,deviceUid=PC_DEVICE_UID,config,candidates,now=Date.now()}){
 const normalized=configOf({...AUTO_EDIT_MODELS,...config,model:config?.model??AUTO_EDIT_MODELS.image,visionGuidance:config?.visionGuidance??''});
 need(isAutoId(batchId)&&deviceUid===PC_DEVICE_UID&&integer(now,1,Number.MAX_SAFE_INTEGER),'invalid-batch-identity');
 need(Array.isArray(candidates),'source-selection-required');
 const eligible=new Map();
 for(const entry of candidates){
  const source=sourceOf(entry,normalized.sourceScope);
  const previous=eligible.get(source.fileId);
  need(!previous||JSON.stringify(previous)===JSON.stringify(source),'conflicting-source-identity');
  eligible.set(source.fileId,source);
 }
 need(eligible.size>=normalized.batchSize,'not-enough-authorized-originals');
 const pool=[...eligible.values()],items=[];
 for(let i=0;i<normalized.batchSize;i++){
  const pick=randomInt(i,pool.length);
  [pool[i],pool[pick]]=[pool[pick],pool[i]];
  items.push({itemId:'item-'+String(i+1).padStart(3,'0'),ordinal:i+1,source:pool[i],seed:randomInt(0,2147483648)});
 }
 return validateAutoEditPlan({schemaVersion:AUTO_EDIT_VERSION,batchId,deviceUid,createdAt:now,config:normalized,items});
}
export function validateAutoEditPlan(plan){
 need(plan?.schemaVersion===AUTO_EDIT_VERSION&&isAutoId(plan.batchId)&&plan.deviceUid===PC_DEVICE_UID&&integer(plan.createdAt,1,Number.MAX_SAFE_INTEGER),'invalid-auto-edit-plan');
 const config=configOf(plan.config);
 need(Array.isArray(plan.items)&&plan.items.length===config.batchSize,'invalid-item-count');
 const seen=new Set();
 const items=plan.items.map((item,i)=>{
  need(item?.ordinal===i+1&&item.itemId==='item-'+String(i+1).padStart(3,'0')&&isSeed(item.seed),'invalid-item-identity');
  const source=sourceOf(item.source,config.sourceScope);
  need(!seen.has(source.fileId),'duplicate-original');seen.add(source.fileId);
  return {itemId:item.itemId,ordinal:item.ordinal,source,seed:item.seed};
 });
 return {schemaVersion:AUTO_EDIT_VERSION,batchId:plan.batchId,deviceUid:plan.deviceUid,createdAt:plan.createdAt,config,items};
}
export function autoEditPlanHash(plan){
 return createHash('sha256').update(JSON.stringify(validateAutoEditPlan(plan))).digest('hex');
}
export function composeAutoEditPrompt(instructions,addition){
 need(text(instructions,AUTO_EDIT_LIMITS.instructions,true)&&text(addition,AUTO_EDIT_LIMITS.addition),'invalid-vision-addition');
 const prompt=addition.trim()?instructions+'\n\n'+addition:instructions;
 need(prompt.length<=AUTO_EDIT_LIMITS.prompt,'effective-prompt-too-long');return prompt;
}
export function validateVision1(value){
 need(value&&text(value.addition,AUTO_EDIT_LIMITS.addition)&&text(value.limitations??'',2000),'invalid-vision1-result');
 return {addition:value.addition,limitations:value.limitations??''};
}
export function validateVision2(value){
 need(value&&text(value.summary,3000,true)&&Array.isArray(value.observations)&&value.observations.length<=20&&value.observations.every(v=>text(v,1000,true))&&text(value.limitations??'',2000),'invalid-vision2-result');
 return {summary:value.summary,observations:[...value.observations],limitations:value.limitations??''};
}
export function validateDeliveryReceipt(value,{key,outputHash}){
 need(value&&value.verified===true&&value.key===key&&isDriveId(value.fileId)&&value.parentId===REVIEW_STAGING_ID&&value.sha256===outputHash,'unverified-staging-delivery');
 return {key,fileId:value.fileId,parentId:value.parentId,sha256:value.sha256,verified:true};
}

export function validateEditReceipt(value,{model,seed,sourceHash,prompt}){
 const promptHash=createHash('sha256').update(prompt).digest('hex');
 need(value?.status==='saved'&&value.model===model&&value.seed===seed&&value.sourceHash===sourceHash&&value.promptHash===promptHash&&isHash(value.sha256),'unverified-edit-lineage');
 need(text(value.engineRevision,160,true)&&integer(value.width,1,8192)&&integer(value.height,1,8192)&&integer(value.steps,1,1000),'invalid-engine-result');
 return {status:'saved',model,seed,sourceHash,promptHash,sha256:value.sha256,engineRevision:value.engineRevision,width:value.width,height:value.height,steps:value.steps};
}
