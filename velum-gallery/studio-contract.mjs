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
export const JOB_TTL = 7*24*60*60*1000, MAX_CHUNKS = 16, CHUNK_SIZE = 600000;
export function validateJob(job) {
  if (!job || job.schemaVersion!==2 || job.deviceUid!==PC_DEVICE_UID || !MODEL_IDS.includes(job.model)) throw new Error('Choose a verified local model on your approved PC.');
  if (typeof job.prompt!=='string' || !job.prompt.trim() || job.prompt.length>6000) throw new Error('Enter a prompt of 1–6,000 characters.');
  if (!Number.isSafeInteger(job.seed) || job.seed<0 || job.seed>2147483647) throw new Error('Seed must be between 0 and 2147483647.');
  if (job.width!==768 || job.height!==1024 || job.consent!==true) throw new Error('Confirm lawful, consensual adult use.');
  if (!Number.isSafeInteger(job.createdAt) || !Number.isSafeInteger(job.expiresAt) || job.expiresAt!==job.createdAt+JOB_TTL) throw new Error('Invalid job lifetime.');
  return job;
}
export function makeJob({model,prompt,seed,consent}, now=Date.now()) {
  return validateJob({schemaVersion:2,deviceUid:PC_DEVICE_UID,model,prompt,seed,width:768,height:1024,status:'queued',createdAt:now,expiresAt:now+JOB_TTL,consent});
}
export function deviceApproved(binding) {
  return Boolean(binding?.deviceUid===PC_DEVICE_UID && binding.status==='approved');
}
export function devicePending(binding,now=Date.now()) {
  return Boolean(binding?.deviceUid===PC_DEVICE_UID && binding.status==='pending' && Number.isSafeInteger(binding.expiresAt) && binding.expiresAt>now);
}
export function deviceCanQueue(binding,status,model) {
  // The last verified installation survives a stale heartbeat. Work waits in Firestore.
  return Boolean(deviceApproved(binding) && status?.deviceUid===PC_DEVICE_UID && status.version==='2.0.0' && MODEL_IDS.includes(model) && status.installed?.includes(model));
}
export function workerOnline(status,now=Date.now()) {
  return Boolean(status?.deviceUid===PC_DEVICE_UID && status.version==='2.0.0' && ['idle','running'].includes(status.state) && Number.isFinite(status.updatedAt) && now-status.updatedAt>=-30000 && now-status.updatedAt<90000);
}
