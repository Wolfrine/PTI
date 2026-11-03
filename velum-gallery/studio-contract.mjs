const deviceModule = new URL('./device-config.mjs', import.meta.url);
deviceModule.search = new URL(import.meta.url).search;
const { PC_DEVICE_UID } = await import(deviceModule.href);

// Validate the owner's words; never rewrite or enhance them.
export const MODELS = Object.freeze([
  {id:'zimage-nvfp4',label:'Z-Image Turbo',hint:'8 steps · detailed scenes · slower cold start'},
  {id:'flux2-klein-fp8',label:'FLUX.2 Klein 4B',hint:'4 steps · quickest iteration · prompt following'},
  {id:'realvis-dynamic',label:'RealVisXL 5',hint:'28 steps · photographic finish · heavier'},
  {id:'realistic-sd15',label:'Realistic Vision 6',hint:'28 steps · lighter fallback · less detail'},
  {id:'qwen-image-2.1',label:'Qwen-Image 2.1',hint:'40 steps · up to 10 image inputs · longer renders'},
]);
export const MODEL_IDS = MODELS.map(model=>model.id);
export const QWEN_MODEL='qwen-image-2.1';
export const WORKER_VERSIONS=Object.freeze(['2.0.0','2.1.0','2.2.0','2.3.0']);
export const MODEL_REFERENCE_LIMITS = Object.freeze({'flux2-klein-fp8':2,'realvis-dynamic':1,'realistic-sd15':1,'zimage-nvfp4':1,[QWEN_MODEL]:10});
export function modelReferenceLimit(status,model) {
 if(!MODEL_REFERENCE_LIMITS[model])return 0;
 if(model===QWEN_MODEL)return status?.version==='2.3.0'&&status?.capabilities?.referenceModels?.includes(model)&&status?.capabilities?.qwenMaxReferences===10?10:0;
 if(['2.1.0','2.2.0','2.3.0'].includes(status?.version)&&status?.capabilities?.referenceModels?.includes(model))return MODEL_REFERENCE_LIMITS[model];
 return status?.version==='2.0.0'&&model==='flux2-klein-fp8'&&status?.capabilities?.referenceModel===model&&status?.capabilities?.maxReferences===2?2:0;
}
export const JOB_TTL = 7*24*60*60*1000, MAX_CHUNKS = 16, CHUNK_SIZE = 600000;
export const REFERENCE_LIMITS = Object.freeze({count:10,legacyCount:2,bytes:2097152,edge:1024,pixels:1048576,chunks:5,inferencePixels:262144,width:512,height:768});
export function validateReference(reference,index) {
  const limit=REFERENCE_LIMITS, source=reference?.source;
  if (reference && Object.keys(reference).some(key=>!['index','mime','bytes','sha256','width','height','chunks','source','role'].includes(key))) throw new Error('Invalid reference image.');
  if(reference?.role!==undefined&&!['subject','pose'].includes(reference.role))throw new Error('Invalid reference role.');
  if (!reference || reference.index!==index || !['image/png','image/jpeg'].includes(reference.mime) || !Number.isSafeInteger(reference.bytes) || reference.bytes<100 || reference.bytes>limit.bytes || !/^[a-f0-9]{64}$/.test(reference.sha256)) throw new Error('Invalid reference image.');
  if (![reference.width,reference.height].every(value=>Number.isSafeInteger(value)&&value>0&&value<=limit.edge) || reference.width*reference.height>limit.pixels || reference.chunks!==Math.ceil(4*Math.ceil(reference.bytes/3)/CHUNK_SIZE) || reference.chunks>limit.chunks) throw new Error('Reference exceeds the PC image limits.');
  if (!source || !['file','studio','drive'].includes(source.kind) || typeof source.id!=='string' || source.id.length>160 || typeof source.name!=='string' || source.name.length>160) throw new Error('Invalid reference provenance.');
  if (Object.keys(source).some(key=>!['kind','id','name'].includes(key))) throw new Error('Invalid reference provenance.');
  return reference;
}
// Match the installed native node's Python round (ties to even), without cropping
// a reference to fit a different output canvas.
const roundEven=value=>{const floor=Math.floor(value),fraction=value-floor;return fraction===.5?(floor%2?floor+1:floor):Math.round(value);};
export function jobDimensions(model,references=[]) {
 if(model===QWEN_MODEL&&references.length){
  const ratio=references[0].width/references[0].height;
  return {width:Math.max(32,roundEven(Math.sqrt(1048576*ratio)/32)*32),height:Math.max(32,roundEven(Math.sqrt(1048576/ratio)/32)*32)};
 }
 return {width:references.length?REFERENCE_LIMITS.width:768,height:references.length?REFERENCE_LIMITS.height:1024};
}
export function composeEffectivePrompt(prompt,pose) {return pose?`${prompt}\n\n${pose.instruction}`:prompt;}
export function validatePose(pose,references) {
 if(!pose||typeof pose!=='object'||Array.isArray(pose)||Object.keys(pose).some(key=>!['referenceIndex','catalogId','fileId','category','label','instruction','mode'].includes(key)))throw new Error('Invalid pose lineage.');
 for(const [key,limit] of Object.entries({catalogId:160,fileId:160,category:80,label:160,instruction:1200}))if(typeof pose[key]!=='string'||!pose[key].trim()||pose[key].length>limit)throw new Error('Invalid pose lineage.');
 if(pose.mode==='image'){
  const reference=references[pose.referenceIndex];
  if(!Number.isInteger(pose.referenceIndex)||pose.referenceIndex<1||!reference||reference.role!=='pose'||reference.source.kind!=='drive'||reference.source.id!==pose.fileId)throw new Error('Pose image must follow a subject reference.');
 }else if(pose.mode!=='text'||pose.referenceIndex!==-1)throw new Error('Invalid pose lineage.');
 if(references.filter(reference=>reference.role==='pose').length!==(pose.mode==='image'?1:0))throw new Error('Invalid pose reference role.');
 return pose;
}
export function validateJob(job) {
  if (!job || ![2,3,4].includes(job.schemaVersion) || job.recordType!==undefined || job.deviceUid!==PC_DEVICE_UID || !MODEL_IDS.includes(job.model) || (job.model===QWEN_MODEL&&job.schemaVersion!==4)) throw new Error('Choose a verified local model on your approved PC.');
  if (typeof job.prompt!=='string' || !job.prompt.trim() || job.prompt.length>6000) throw new Error('Enter a prompt of 1–6,000 characters.');
  if (!Number.isSafeInteger(job.seed) || job.seed<0 || job.seed>2147483647) throw new Error('Seed must be between 0 and 2147483647.');
  let referenced=false;
  if (job.schemaVersion<4&&(job.effectivePrompt!==undefined||job.pose!==undefined))throw new Error('Invalid legacy prompt.');
  if (job.schemaVersion===2 && (job.references!==undefined || job.inputsReady!==undefined || job.parentJobId!==undefined)) throw new Error('Invalid legacy job.');
  if ([3,4].includes(job.schemaVersion)) {
    if (!Array.isArray(job.references) || job.references.length>(job.schemaVersion===3?REFERENCE_LIMITS.legacyCount:REFERENCE_LIMITS.count) || typeof job.inputsReady!=='boolean' || typeof job.parentJobId!=='string' || (job.parentJobId && !/^[A-Za-z0-9_-]{1,80}$/.test(job.parentJobId))) throw new Error('Invalid reference job.');
    job.references.forEach(validateReference); referenced=job.references.length>0;
    if(job.schemaVersion===3&&job.references.some(reference=>reference.role!==undefined))throw new Error('Invalid legacy reference role.');
    if (referenced && job.references.length>MODEL_REFERENCE_LIMITS[job.model]) throw new Error('This model supports fewer reference images.');
    if (job.status==='queued' && !job.inputsReady) throw new Error('Reference upload is incomplete.');
  }
  if(job.schemaVersion===4){
   if(typeof job.effectivePrompt!=='string'||job.effectivePrompt.length>8000||job.effectivePrompt!==composeEffectivePrompt(job.prompt,job.pose))throw new Error('Review the exact effective prompt.');
   if(job.pose!==undefined)validatePose(job.pose,job.references);
   else if(job.references.some(reference=>reference.role==='pose'))throw new Error('Pose reference has no lineage.');
   const hashes=new Set(),driveIds=new Set();
   for(const reference of job.references){
    if(job.model===QWEN_MODEL&&(reference.width>reference.height*8||reference.height>reference.width*8))throw new Error('Qwen references need an aspect ratio between 1:8 and 8:1.');
    if(hashes.has(reference.sha256)||(reference.source.kind==='drive'&&reference.source.id&&driveIds.has(reference.source.id)))throw new Error('Choose distinct reference images.');
    hashes.add(reference.sha256);if(reference.source.kind==='drive'&&reference.source.id)driveIds.add(reference.source.id);
   }
  }
  const size=jobDimensions(job.model,job.references);
  if (job.width!==size.width || job.height!==size.height || job.consent!==true) throw new Error('Confirm lawful, consensual adult use.');
  if (!Number.isSafeInteger(job.createdAt) || !Number.isSafeInteger(job.expiresAt) || job.expiresAt!==job.createdAt+JOB_TTL) throw new Error('Invalid job lifetime.');
  return job;
}
export function makeJob({model,prompt,seed,consent,references=[],parentJobId='',effectivePrompt,pose}, now=Date.now()) {
  const referenced=references.length>0, explicit=model===QWEN_MODEL||effectivePrompt!==undefined||pose!==undefined,modern=explicit||referenced||Boolean(parentJobId);
  return validateJob({schemaVersion:explicit?4:modern?3:2,deviceUid:PC_DEVICE_UID,model,prompt,seed,...jobDimensions(model,references),status:referenced?'uploading':'queued',createdAt:now,expiresAt:now+JOB_TTL,consent,...(modern?{references:structuredClone(references),parentJobId,inputsReady:!referenced}:{}),...(explicit?{effectivePrompt:effectivePrompt??composeEffectivePrompt(prompt,pose),...(pose===undefined?{}:{pose:structuredClone(pose)})}:{})});
}
export function deviceApproved(binding) {
  return Boolean(binding?.deviceUid===PC_DEVICE_UID && binding.status==='approved');
}
export function devicePending(binding,now=Date.now()) {
  return Boolean(binding?.deviceUid===PC_DEVICE_UID && binding.status==='pending' && Number.isSafeInteger(binding.expiresAt) && binding.expiresAt>now);
}
export function deviceCanQueue(binding,status,model) {
  // The last verified installation survives a stale heartbeat. Work waits in Firestore.
 return Boolean(deviceApproved(binding) && status?.deviceUid===PC_DEVICE_UID && WORKER_VERSIONS.includes(status.version) && MODEL_IDS.includes(model) && (model!==QWEN_MODEL||status.version==='2.3.0') && status.installed?.includes(model));
}
export function workerOnline(status,now=Date.now()) {
 return Boolean(status?.deviceUid===PC_DEVICE_UID && WORKER_VERSIONS.includes(status.version) && ['idle','running'].includes(status.state) && Number.isFinite(status.updatedAt) && now-status.updatedAt>=-30000 && now-status.updatedAt<90000);
}
