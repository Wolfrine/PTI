const deviceModule = new URL('./device-config.mjs', import.meta.url);
deviceModule.search = new URL(import.meta.url).search;
const { PC_DEVICE_UID } = await import(deviceModule.href);

// Validate the owner's words; never rewrite or enhance them.
export const MODELS = Object.freeze([
  {id:'zimage-nvfp4',label:'Z-Image Turbo',hint:'8 steps · detailed scenes · slower cold start'},
  {id:'flux2-klein-fp8',label:'FLUX.2 Klein 4B',hint:'4 steps · quickest iteration · prompt following'},
  {id:'realvis-dynamic',label:'RealVisXL 5',hint:'28 steps · photographic finish · heavier'},
  {id:'realistic-sd15',label:'Realistic Vision 6',hint:'28 steps · lighter fallback · less detail'},
]);
export const MODEL_IDS = MODELS.map(model=>model.id);
export const MODEL_REFERENCE_LIMITS = Object.freeze({'flux2-klein-fp8':2,'realvis-dynamic':1,'realistic-sd15':1,'zimage-nvfp4':1});
export function modelReferenceLimit(status,model) {
 if(!MODEL_REFERENCE_LIMITS[model])return 0;
 if(status?.version==='2.1.0'&&status?.capabilities?.referenceModels?.includes(model))return MODEL_REFERENCE_LIMITS[model];
 return status?.version==='2.0.0'&&model==='flux2-klein-fp8'&&status?.capabilities?.referenceModel===model&&status?.capabilities?.maxReferences===2?2:0;
}
export const JOB_TTL = 7*24*60*60*1000, MAX_CHUNKS = 16, CHUNK_SIZE = 600000;
export const REFERENCE_LIMITS = Object.freeze({count:2,bytes:2097152,edge:1024,pixels:1048576,chunks:5,inferencePixels:262144,width:512,height:768});
export function validateReference(reference,index) {
  const limit=REFERENCE_LIMITS, source=reference?.source;
  if (reference && Object.keys(reference).some(key=>!['index','mime','bytes','sha256','width','height','chunks','source'].includes(key))) throw new Error('Invalid reference image.');
  if (!reference || reference.index!==index || !['image/png','image/jpeg'].includes(reference.mime) || !Number.isSafeInteger(reference.bytes) || reference.bytes<100 || reference.bytes>limit.bytes || !/^[a-f0-9]{64}$/.test(reference.sha256)) throw new Error('Invalid reference image.');
  if (![reference.width,reference.height].every(value=>Number.isSafeInteger(value)&&value>0&&value<=limit.edge) || reference.width*reference.height>limit.pixels || reference.chunks!==Math.ceil(4*Math.ceil(reference.bytes/3)/CHUNK_SIZE) || reference.chunks>limit.chunks) throw new Error('Reference exceeds the PC image limits.');
  if (!source || !['file','studio','drive'].includes(source.kind) || typeof source.id!=='string' || source.id.length>160 || typeof source.name!=='string' || source.name.length>160) throw new Error('Invalid reference provenance.');
  if (Object.keys(source).some(key=>!['kind','id','name'].includes(key))) throw new Error('Invalid reference provenance.');
  return reference;
}
export function validateJob(job) {
  if (!job || ![2,3].includes(job.schemaVersion) || job.deviceUid!==PC_DEVICE_UID || !MODEL_IDS.includes(job.model)) throw new Error('Choose a verified local model on your approved PC.');
  if (typeof job.prompt!=='string' || !job.prompt.trim() || job.prompt.length>6000) throw new Error('Enter a prompt of 1–6,000 characters.');
  if (!Number.isSafeInteger(job.seed) || job.seed<0 || job.seed>2147483647) throw new Error('Seed must be between 0 and 2147483647.');
  let referenced=false;
  if (job.schemaVersion===2 && (job.references!==undefined || job.inputsReady!==undefined || job.parentJobId!==undefined)) throw new Error('Invalid legacy job.');
  if (job.schemaVersion===3) {
    if (!Array.isArray(job.references) || job.references.length>REFERENCE_LIMITS.count || typeof job.inputsReady!=='boolean' || typeof job.parentJobId!=='string' || (job.parentJobId && !/^[A-Za-z0-9_-]{1,80}$/.test(job.parentJobId))) throw new Error('Invalid reference job.');
    job.references.forEach(validateReference); referenced=job.references.length>0;
    if (referenced && job.references.length>MODEL_REFERENCE_LIMITS[job.model]) throw new Error('This model supports fewer reference images.');
    if (job.status==='queued' && !job.inputsReady) throw new Error('Reference upload is incomplete.');
  }
  if (job.width!==(referenced?REFERENCE_LIMITS.width:768) || job.height!==(referenced?REFERENCE_LIMITS.height:1024) || job.consent!==true) throw new Error('Confirm lawful, consensual adult use.');
  if (!Number.isSafeInteger(job.createdAt) || !Number.isSafeInteger(job.expiresAt) || job.expiresAt!==job.createdAt+JOB_TTL) throw new Error('Invalid job lifetime.');
  return job;
}
export function makeJob({model,prompt,seed,consent,references=[],parentJobId=''}, now=Date.now()) {
  const referenced=references.length>0, modern=referenced||Boolean(parentJobId);
  return validateJob({schemaVersion:modern?3:2,deviceUid:PC_DEVICE_UID,model,prompt,seed,width:referenced?REFERENCE_LIMITS.width:768,height:referenced?REFERENCE_LIMITS.height:1024,status:referenced?'uploading':'queued',createdAt:now,expiresAt:now+JOB_TTL,consent,...(modern?{references:structuredClone(references),parentJobId,inputsReady:!referenced}:{})});
}
export function deviceApproved(binding) {
  return Boolean(binding?.deviceUid===PC_DEVICE_UID && binding.status==='approved');
}
export function devicePending(binding,now=Date.now()) {
  return Boolean(binding?.deviceUid===PC_DEVICE_UID && binding.status==='pending' && Number.isSafeInteger(binding.expiresAt) && binding.expiresAt>now);
}
export function deviceCanQueue(binding,status,model) {
  // The last verified installation survives a stale heartbeat. Work waits in Firestore.
  return Boolean(deviceApproved(binding) && status?.deviceUid===PC_DEVICE_UID && ['2.0.0','2.1.0'].includes(status.version) && MODEL_IDS.includes(model) && status.installed?.includes(model));
}
export function workerOnline(status,now=Date.now()) {
  return Boolean(status?.deviceUid===PC_DEVICE_UID && ['2.0.0','2.1.0'].includes(status.version) && ['idle','running'].includes(status.state) && Number.isFinite(status.updatedAt) && now-status.updatedAt>=-30000 && now-status.updatedAt<90000);
}
