// Node-only sampling and hash functions around the shared Auto Edit contract.
import {createHash,randomInt} from 'node:crypto';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
import {AUTO_EDIT_MODELS,AUTO_EDIT_LIMITS,AUTO_EDIT_VERSION,isAutoId,isHash,configOf,sourceOf,validateAutoEditPlan,planJson} from '../../velum-gallery/auto-edit-shared.mjs';
export * from '../../velum-gallery/auto-edit-shared.mjs';
const need=(ok,code)=>{if(!ok)throw new Error(code);};
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
const text=(value,max,required=false)=>typeof value==='string'&&value.length<=max&&(!required||Boolean(value.trim()));
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
export function autoEditPlanHash(plan){
 return createHash('sha256').update(planJson(plan)).digest('hex');
}
export function validateEditReceipt(value,{model,seed,sourceHash,prompt}){
 const promptHash=createHash('sha256').update(prompt).digest('hex');
 need(value?.status==='saved'&&value.model===model&&value.seed===seed&&value.sourceHash===sourceHash&&value.promptHash===promptHash&&isHash(value.sha256),'unverified-edit-lineage');
 need(text(value.engineRevision,160,true)&&integer(value.width,1,8192)&&integer(value.height,1,8192)&&integer(value.steps,1,1000),'invalid-engine-result');
 return {status:'saved',model,seed,sourceHash,promptHash,sha256:value.sha256,engineRevision:value.engineRevision,width:value.width,height:value.height,steps:value.steps};
}
