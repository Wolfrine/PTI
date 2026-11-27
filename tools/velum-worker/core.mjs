import {validateJob,MODEL_IDS,CHUNK_SIZE,MAX_CHUNKS} from '../../velum-gallery/studio-contract.mjs';
import {createHash} from 'node:crypto';
export const WEIGHTS={
  'zimage-nvfp4':['diffusion_models/z_image_turbo_nvfp4.safetensors','text_encoders/qwen_3_4b_fp8_mixed.safetensors','vae/ae.safetensors'],
  'flux2-klein-fp8':['diffusion_models/flux-2-klein-4b-fp8.safetensors','text_encoders/qwen_3_4b_fp8_mixed.safetensors','vae/flux2-vae.safetensors'],
  'realvis-dynamic':['checkpoints/RealVisXL_V5.0_fp16.safetensors'],
  'realistic-sd15':['checkpoints/Realistic_Vision_V6.0_NV_B1_fp16.safetensors','vae/vae-ft-mse-840000-ema-pruned.safetensors'],
};
export function runnable(job,now=Date.now()) {
  try { validateJob(job); return job.status==='queued' && job.createdAt<=now+30000 && job.expiresAt>now; }
  catch { return false; }
}
export function encode(value) {
  if(value===null)return {nullValue:null};
  if(typeof value==='string')return {stringValue:value};
  if(typeof value==='boolean')return {booleanValue:value};
  if(typeof value==='number')return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if(Array.isArray(value))return {arrayValue:{values:value.map(encode)}};
  return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([key,item])=>[key,encode(item)]))}};
}
export function decode(value) {
  if('stringValue'in value)return value.stringValue;
  if('integerValue'in value)return Number(value.integerValue);
  if('doubleValue'in value)return value.doubleValue;
  if('booleanValue'in value)return value.booleanValue;
  if('nullValue'in value)return null;
  if('arrayValue'in value)return (value.arrayValue.values||[]).map(decode);
  if('mapValue'in value)return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([key,item])=>[key,decode(item)]));
  throw new Error('invalid-firestore-value');
}
export function imagePayload(bytes) {
  if(!Buffer.isBuffer(bytes)||bytes.length<100||!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('invalid-output');
  const base64=bytes.toString('base64'),chunks=[];
  for(let i=0;i<base64.length;i+=CHUNK_SIZE)chunks.push(base64.slice(i,i+CHUNK_SIZE));
  if(chunks.length>MAX_CHUNKS)throw new Error('output-too-large');
  return {chunks,result:{mime:'image/png',bytes:bytes.length,chunks:chunks.length,sha256:createHash('sha256').update(bytes).digest('hex')}};
}
export {MODEL_IDS};
