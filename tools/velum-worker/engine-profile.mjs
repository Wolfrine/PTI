import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stat,readFile} from 'node:fs/promises';
import {createReadStream,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {QWEN_MODEL,QWEN_TURBO_MODEL,isQwenModel,MODEL_REFERENCE_LIMITS} from '../../velum-gallery/studio-contract.mjs';
const HERE=path.dirname(fileURLToPath(import.meta.url));
export const QWEN_ENGINE='H:\\AI-ImageGen\\velum-qwen21-research-20261103';
export const QWEN_RUNTIME='F:\\Workspace\\Support\\LocalCodexBridge\\scratch\\qwen21-quality-20261103\\ComfyUI';
export const QWEN_REVISION='426f5eea52a7ece1dd599fff4cb6cd1f352ddd24';
export const QWEN_WEIGHTS=Object.freeze({
 'diffusion_models/qwen_image_2.1_int8_convrot.safetensors':7256783064,
 'text_encoders/qwen3vl_8b_w4a8.safetensors':6312105364,
 'vae/qwen_image_2.1_vae_bf16.safetensors':675509688,
});
const TURBO_WEIGHT='diffusion_models/qwen_image_2.1_turbo_int8_convrot.safetensors';
const TURBO_SHA256='8144a0182964aa8403ad6dbc011db837304167d235161b9aabaa8532e967314c';
// The worker, Python adapter and thumbnail CLI share this tracked path contract.
export const QWEN_OUTPUT_ROOT=(()=>{
 try{
  const {outputRoot}=JSON.parse(readFileSync(new URL('./qwen-paths.json',import.meta.url),'utf8'));
  if(typeof outputRoot!=='string'||!path.win32.isAbsolute(outputRoot)||path.win32.parse(outputRoot).root.toLowerCase()!=='h:\\'||path.win32.normalize(outputRoot)!==outputRoot)return null;
  return outputRoot;
 }catch{return null;}
})();
export function engineProfile(model,{driveOriginal=false}={}){
 if(isQwenModel(model)){
  if(!QWEN_OUTPUT_ROOT)throw new Error('model-unavailable');
  return {python:path.join(QWEN_ENGINE,'venv','Scripts','python.exe'),script:path.join(HERE,'infer-qwen.py'),outputRoot:QWEN_OUTPUT_ROOT,timeoutMs:7200000,parentTimeoutMs:7230000};
 }
 const python=driveOriginal?path.join(QWEN_ENGINE,'venv','Scripts','python.exe'):'F:\\Workspace\\Support\\tools\\local-image-gen\\venv\\Scripts\\python.exe';
 return {python,script:path.join(HERE,'infer.py'),outputRoot:'H:\\AI-ImageGen\\portrait-pilot\\velum-studio',timeoutMs:1800000,parentTimeoutMs:1830000};
}
// Presence/size/runtime-source checks only. No imports, downloads or GPU loads.
export async function qwenInstalled({statFile=stat,read=readFile}={}){
 try{
  if(!QWEN_OUTPUT_ROOT||!(await statFile(path.win32.parse(QWEN_OUTPUT_ROOT).root)).isDirectory())return false;
  for(const [relative,bytes] of Object.entries(QWEN_WEIGHTS)){
   const file=await statFile(path.join(QWEN_ENGINE,'models',relative));if(!file.isFile()||file.size!==bytes)return false;
  }
  await statFile(engineProfile(QWEN_MODEL).python);
  const head=(await read(path.join(QWEN_RUNTIME,'.git','HEAD'),'utf8')).trim();
  const revision=head.startsWith('ref: ')?(await read(path.join(QWEN_RUNTIME,'.git',head.slice(5)),'utf8')).trim():head;
  if(revision!==QWEN_REVISION)return false;
  const source=await read(path.join(QWEN_RUNTIME,'comfy_extras','nodes_qwen.py'),'utf8');
  if(!source.includes('class TextEncodeQwenImage21(')||!source.includes('class QwenImage21Cache('))return false;
  await statFile(path.join(QWEN_ENGINE,'venv','Lib','site-packages','torch-2.14.1+cu130.dist-info','METADATA'));
  return true;
 }catch{return false;}
}
export async function qwenTurboInstalled(){
 // Opt in only after the compatibility and license gates for this device are met.
 try{
  if(!QWEN_OUTPUT_ROOT||(await readFile(path.join(QWEN_OUTPUT_ROOT,'turbo-evaluation.enabled'),'utf8')).trim()!==QWEN_TURBO_MODEL)return false;
  const filename=path.join(QWEN_ENGINE,'models',TURBO_WEIGHT),info=await stat(filename);
  if(!info.isFile()||info.size!==7256787829)return false;
  const hash=createHash('sha256');
  for await(const chunk of createReadStream(filename))hash.update(chunk);
  return hash.digest('hex')===TURBO_SHA256;
 }catch{return false;}
}
export function workerCapabilities(installed,recoveryControl){
 const references={...MODEL_REFERENCE_LIMITS};
 if(!installed.includes(QWEN_TURBO_MODEL))delete references[QWEN_TURBO_MODEL];
 return {referenceModel:'flux2-klein-fp8',maxReferences:2,referenceModels:Object.keys(references).filter(model=>installed.includes(model)),referenceOutputWidth:512,referenceOutputHeight:768,recoveryControl,qwenMaxReferences:10,promptSchema:4,referenceLimits:references};
}
