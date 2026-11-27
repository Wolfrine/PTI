// Shared, bounded learning/revision contract. No cloud or model credentials.
const localModule=relative=>{const url=new URL(relative,import.meta.url);url.search=new URL(import.meta.url).search;return import(url.href);};
const {AUTO_EDIT_MODELS,configOf,isAutoId,isHash,isDriveId,isSeed,validateVision2,sourceOf,REVIEW_STAGING_ID}=await localModule('./auto-edit-shared.mjs');
const {PC_DEVICE_UID}=await localModule('./device-config.mjs');
export const LEARNING_MAX_EVIDENCE=2;
export const LEARNING_TTL=30*60*1000;
export const LEARNING_MODEL=AUTO_EDIT_MODELS.vision2;
export const LEARNING_ITEM='item-001';
// Model output selects from these ordinary image-quality improvements. Its
// free-form observations are evidence for a human, never executable guidance.
export const QUALITY_CHANGES=Object.freeze({
 'limit-edit-scope':{label:'Limit the edit scope',field:'instructions',text:'Apply only the explicitly requested change; preserve unrelated image content.'},
 'preserve-composition':{label:'Preserve composition',field:'instructions',text:'Preserve the original framing, camera viewpoint, and spatial arrangement unless explicitly requested otherwise.'},
 'preserve-background':{label:'Preserve background',field:'instructions',text:'Preserve unrelated background objects, textures, and geometry.'},
 'preserve-lighting':{label:'Preserve lighting',field:'instructions',text:'Keep the original lighting direction, shadow coherence, and exposure unless the requested edit changes them.'},
 'preserve-colors':{label:'Preserve colors',field:'instructions',text:'Keep unrelated colors and white balance consistent with the original.'},
 'avoid-artifacts':{label:'Reduce artifacts',field:'instructions',text:'Keep edges, textures, reflections, and geometry coherent; avoid unintended distortions and duplicate objects.'},
 'describe-composition':{label:'Describe composition',field:'visionGuidance',text:'Describe visible framing, object placement, and relevant spatial relationships without adding unsupported details.'},
 'describe-materials':{label:'Describe materials and colors',field:'visionGuidance',text:'Describe relevant visible materials, surface textures, and colors; state uncertainty when details are unclear.'},
 'describe-lighting':{label:'Describe lighting',field:'visionGuidance',text:'Describe visible light direction, exposure, shadows, and reflections relevant to the requested edit.'}
});
const own=(v,k)=>Object.prototype.hasOwnProperty.call(v,k);
const text=(v,n,required=false)=>typeof v==='string'&&v.length<=n&&(!required||Boolean(v.trim()));
const time=v=>Number.isSafeInteger(v)&&v>0;
const need=(ok,code)=>{if(!ok)throw new Error(code);};
const nullableId=v=>v===null||isAutoId(v);
export function sameConfiguration(a,b){
 try{const x=configOf(a),y=configOf({...b,revisionId:x.revisionId});return JSON.stringify(x)===JSON.stringify(y);}catch{return false;}
}
export function revisionRecord({config,parentRevisionId=null,kind='manual',restoredFromRevisionId=null,learningId=null,reason='',approvedAt=Date.now()}){
 const c=configOf(config);
 need(nullableId(parentRevisionId)&&nullableId(restoredFromRevisionId)&&nullableId(learningId)&&parentRevisionId!==c.revisionId&&time(approvedAt)&&text(reason,1000),'invalid-revision');
 need(['pilot','manual','restore','learning'].includes(kind),'invalid-revision-kind');
 need((kind==='restore')===(restoredFromRevisionId!==null)&&(kind==='learning')===(learningId!==null),'invalid-revision-lineage');
 if(kind==='learning')need(parentRevisionId!==null,'learning-base-required');
 return {version:1,revisionId:c.revisionId,config:c,approvedAt,parentRevisionId,kind,restoredFromRevisionId,learningId,reason};
}
export function makeLearningRequest({learningId,baseRevisionId,batchIds,createdAt=Date.now(),consent}){
 need(isAutoId(learningId)&&isAutoId(baseRevisionId)&&time(createdAt)&&consent===true,'learning-authorization-required');
 need(Array.isArray(batchIds)&&batchIds.length>=1&&batchIds.length<=LEARNING_MAX_EVIDENCE&&batchIds.every(isAutoId)&&new Set(batchIds).size===batchIds.length,'invalid-learning-evidence');
 return {version:1,learningId,deviceUid:PC_DEVICE_UID,baseRevisionId,model:AUTO_EDIT_MODELS.image,batchIds:[...batchIds],createdAt,consent:true,status:'queued',startedAt:null,finishedAt:null,proposal:null,error:null,decision:null};
}
export function validateLearningRequest(v){
 need(v?.version===1&&v.deviceUid===PC_DEVICE_UID&&v.model===AUTO_EDIT_MODELS.image&&['queued','running','proposed','failed','cancelled'].includes(v.status),'invalid-learning-request');
 const base=makeLearningRequest(v);
 need((v.startedAt===null||time(v.startedAt))&&(v.finishedAt===null||time(v.finishedAt)),'invalid-learning-time');
 if(v.status==='queued')need(v.startedAt===null&&v.finishedAt===null&&v.proposal===null&&v.error===null&&v.decision===null,'invalid-learning-state');
 if(v.status==='running')need(time(v.startedAt)&&v.finishedAt===null&&v.proposal===null&&v.error===null&&v.decision===null,'invalid-learning-state');
 if(v.status==='proposed'){
  need(time(v.startedAt)&&time(v.finishedAt)&&v.finishedAt>=v.startedAt&&v.error===null&&v.proposal&&
   (v.decision===null||(time(v.decision?.decidedAt)&&((v.decision.kind==='approved'&&isAutoId(v.decision.revisionId))||(v.decision.kind==='rejected'&&v.decision.revisionId===null)))),'invalid-learning-state');
  validateStoredProposal(v.proposal,base.batchIds);
 }
 if(['failed','cancelled'].includes(v.status))need(time(v.finishedAt)&&text(v.error,80,true)&&v.proposal===null&&v.decision===null&&(v.status==='cancelled'||time(v.startedAt)),'invalid-learning-state');
 return {...base,status:v.status,startedAt:v.startedAt,finishedAt:v.finishedAt,proposal:v.proposal,error:v.error,decision:v.decision};
}
export function learningAdmission(v,now=Date.now()){
 return v?.version===1&&v.enabled===true&&v.mode==='learning'&&isAutoId(v.learningId)&&Number.isSafeInteger(v.expiresAt)&&v.expiresAt>now&&v.expiresAt<=now+LEARNING_TTL
  ?{mode:'learning',learningId:v.learningId,expiresAt:v.expiresAt}:null;
}
export function reviewedEvidence(batchId,item,review,baseConfig){
 const config=configOf(baseConfig);
 need(isAutoId(batchId)&&item?.itemId===LEARNING_ITEM&&item.status==='review-ready'&&item.stage==='review-ready'
  &&item.configurationRevision===config.revisionId&&item.model===config.model&&isSeed(item.seed),'learning-item-not-ready');
 const source=sourceOf(item.source,config.sourceScope);
 const sourceHash=item.sourceArtifact?.sha256,outputHash=item.outputArtifact?.sha256;
 need(isHash(sourceHash)&&isHash(outputHash)&&(!source.sha256||source.sha256===sourceHash)
  &&item.receipt?.verified===true&&item.receipt.key===batchId+'-'+LEARNING_ITEM&&item.receipt.parentId===REVIEW_STAGING_ID
  &&item.receipt.sha256===outputHash&&item.editReceipt?.sha256===outputHash&&item.editReceipt?.sourceHash===sourceHash&&isDriveId(item.receipt.fileId),'learning-evidence-identity-mismatch');
 need(review?.version===1&&review.batchId===batchId&&review.itemId===LEARNING_ITEM&&review.sourceFileId===source.fileId&&review.fileId===item.receipt.fileId
  &&review.sha256===outputHash&&time(review.decidedAt)&&text(review.feedback,2000)
  &&((review.decision==='okay'&&review.status==='accepted'&&isDriveId(review.parentId)&&isHash(review.moveReceiptId))||(review.decision==='not-okay'&&review.status==='rejected')),'learning-review-not-final');
 const vision=validateVision2(item.vision2);
 need(text(item.prompt,6000,true),'learning-prompt-invalid');
 return {batchId,itemId:LEARNING_ITEM,source,sourceHash,outputHash,seed:item.seed,model:item.model,
  review:{reviewId:batchId+'-'+LEARNING_ITEM,decision:review.decision,decidedAt:review.decidedAt,feedback:review.feedback},
  comparison:vision,prompt:item.prompt};
}
export function validateLearningResult(value,evidenceCount){
 need(Number.isInteger(evidenceCount)&&evidenceCount>=1&&evidenceCount<=LEARNING_MAX_EVIDENCE&&value&&Array.isArray(value.recommendations)&&value.recommendations.length<=4&&text(value.limitations,1000),'invalid-learning-result');
 const seen=new Set();
 const recommendations=value.recommendations.map(r=>{
  need(r&&own(QUALITY_CHANGES,r.key)&&!seen.has(r.key)&&Number.isInteger(r.evidenceIndex)&&r.evidenceIndex>=0&&r.evidenceIndex<evidenceCount
   &&text(r.observation,500,true)&&text(r.hypothesis,500,true)&&['low','medium','high'].includes(r.confidence),'invalid-learning-recommendation');
  seen.add(r.key);return {key:r.key,evidenceIndex:r.evidenceIndex,observation:r.observation,hypothesis:r.hypothesis,confidence:r.confidence};
 });
 return {recommendations,limitations:value.limitations};
}
export function proposalFor(value,evidence,evidenceHash){
 need(Array.isArray(evidence)&&evidence.length>=1&&evidence.length<=LEARNING_MAX_EVIDENCE&&isHash(evidenceHash),'invalid-learning-evidence-hash');
 const modelResult=validateLearningResult(value,evidence.length);
 return {version:1,model:LEARNING_MODEL,evidenceHash,evidence:evidence.map(e=>({batchId:e.batchId,reviewId:e.review.reviewId,sourceHash:e.sourceHash,outputHash:e.outputHash,decision:e.review.decision,decidedAt:e.review.decidedAt})),...modelResult};
}
export function validateStoredProposal(p,batchIds){
 need(p?.version===1&&p.model===LEARNING_MODEL&&isHash(p.evidenceHash)&&Array.isArray(p.evidence)&&p.evidence.length===batchIds.length,'invalid-learning-proposal');
 p.evidence.forEach((e,i)=>need(e?.batchId===batchIds[i]&&e.reviewId===e.batchId+'-'+LEARNING_ITEM&&isHash(e.sourceHash)&&isHash(e.outputHash)&&['okay','not-okay'].includes(e.decision)&&time(e.decidedAt),'invalid-learning-proposal-evidence'));
 return {...p,...validateLearningResult(p,batchIds.length)};
}
export function suggestedConfig(base,proposal,selectedKeys,revisionId){
 const c=configOf({...base,revisionId});
 for(const r of proposal.recommendations){
  if(!selectedKeys.includes(r.key))continue;
  const change=QUALITY_CHANGES[r.key];need(change,'invalid-learning-recommendation');
  if(!c[change.field].includes(change.text))c[change.field]+=(c[change.field].trim()?'\n\n':'')+change.text;
 }
 // Never silently truncate the owner's existing configuration. The editor
 // can shorten the draft before approval, or reject the proposal.
 return c;
}
