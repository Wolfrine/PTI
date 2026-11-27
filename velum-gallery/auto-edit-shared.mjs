// Shared browser/worker Auto Edit v1 contract. No Node-only dependency.
const localModule=relative=>{const url=new URL(relative,import.meta.url);url.search=new URL(import.meta.url).search;return import(url.href);};
const {MODEL_IDS,QWEN_TURBO_MODEL}=await localModule('./studio-contract.mjs');
const {PC_DEVICE_UID}=await localModule('./device-config.mjs');
const {PRIVATE_FOLDER_ID,REFERENCES_FOLDER_ID}=await localModule('./drive-library.mjs');

export const AUTO_EDIT_VERSION=1;
export const AUTO_EDIT_BATCH_VERSION=2;
export const AUTO_EDIT_BATCH_TTL=48*60*60*1000;
// Stored in the existing visionGuidance field for immutable revision compatibility.
export const DEFAULT_VISION1_INSTRUCTION="For an authorized ordinary image edit, describe only the subject's visible overall silhouette, general proportions and posture relevant to preserving the reference. Be concise and factual. Do not describe clothing, facial features, background, lighting or environment. Do not infer concealed anatomy or measurements. Phrase the result as a short preservation instruction for the image editor.";
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
export function configOf(value){
 need(value&&value.consent===true,'auto-edit-authorization-required');
 need(text(value.instructions,AUTO_EDIT_LIMITS.instructions,true),'invalid-edit-instructions');
 need(text(value.visionGuidance,AUTO_EDIT_LIMITS.guidance),'invalid-vision-guidance');
 need(MODEL_IDS.includes(value.model),'invalid-image-model');
 need(value.vision1===AUTO_EDIT_MODELS.vision1&&value.vision2===AUTO_EDIT_MODELS.vision2,'invalid-vision-model');
 need(SCOPES.has(value.sourceScope)&&integer(value.batchSize,1,AUTO_EDIT_LIMITS.batch),'invalid-batch-size-or-scope');
 need(isAutoId(value.revisionId),'approved-configuration-required');
 return {instructions:value.instructions,visionGuidance:value.visionGuidance,model:value.model,vision1:value.vision1,vision2:value.vision2,sourceScope:value.sourceScope,batchSize:value.batchSize,revisionId:value.revisionId,consent:true};
}
export function sourceOf(source,scope,privateTree=false){
 need(source&&source.authorized===true&&!source.trashed&&isDriveId(source.fileId)&&MIMES.has(source.mime),'invalid-or-unauthorized-source');
 need(privateTree
  ? scope==='both'&&isDriveId(source.folderId)&&source.folderId!==REVIEW_STAGING_ID
  : Object.values(SOURCE_FOLDERS).includes(source.folderId)&&(scope==='both'||source.folderId===SOURCE_FOLDERS[scope]),'invalid-source-folder');
 need(source.sha256===undefined||source.sha256===null||isHash(source.sha256),'invalid-source-hash');
 return {fileId:source.fileId,folderId:source.folderId,mime:source.mime,authorized:true,sha256:source.sha256??null};
}
export function validateAutoEditPlan(plan){
 const batch=plan?.schemaVersion===AUTO_EDIT_BATCH_VERSION;
 need((batch||plan?.schemaVersion===AUTO_EDIT_VERSION)&&isAutoId(plan.batchId)&&plan.deviceUid===PC_DEVICE_UID&&integer(plan.createdAt,1,Number.MAX_SAFE_INTEGER),'invalid-auto-edit-plan');
 const config=configOf(plan.config);
 if(batch)need(isAutoId(plan.seedVersionId)&&config.model===AUTO_EDIT_MODELS.image&&config.sourceScope==='both','invalid-seed-version');
 need(Array.isArray(plan.items)&&plan.items.length===config.batchSize,'invalid-item-count');
 const seen=new Set();
 const items=plan.items.map((item,i)=>{
  need(item?.ordinal===i+1&&item.itemId==='item-'+String(i+1).padStart(3,'0')&&isSeed(item.seed),'invalid-item-identity');
  const source=sourceOf(item.source,config.sourceScope,batch);
  need(!seen.has(source.fileId),'duplicate-original');seen.add(source.fileId);
  return {itemId:item.itemId,ordinal:item.ordinal,source,seed:item.seed};
 });
 return {schemaVersion:plan.schemaVersion,batchId:plan.batchId,deviceUid:plan.deviceUid,createdAt:plan.createdAt,...(batch?{seedVersionId:plan.seedVersionId}:{}),config,items};
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

// The normalized object is serialized identically by the browser and worker.
export function planJson(plan){return JSON.stringify(validateAutoEditPlan(plan));}
