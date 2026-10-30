import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {validateJob,validateReference,CHUNK_SIZE,REFERENCE_LIMITS} from '../../velum-gallery/studio-contract.mjs';

export function referenceBytes(manifest,chunks) {
 validateReference(manifest,manifest.index);
 if(!Array.isArray(chunks)||chunks.length!==manifest.chunks)throw new Error('invalid-reference');
 for(let index=0;index<chunks.length;index++)if(typeof chunks[index]!=='string'||chunks[index].length>CHUNK_SIZE||!chunks[index].length||!/^[A-Za-z0-9+/]*={0,2}$/.test(chunks[index])||(index<chunks.length-1&&chunks[index].length!==CHUNK_SIZE))throw new Error('invalid-reference');
 const joined=chunks.join(''),bytes=Buffer.from(joined,'base64');
 if(bytes.toString('base64')!==joined||bytes.length!==manifest.bytes||createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw new Error('invalid-reference');
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 const jpeg=bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
 if((manifest.mime==='image/png'&&!png)||(manifest.mime==='image/jpeg'&&!jpeg))throw new Error('invalid-reference');
 return bytes;
}

// Callers fetch only chunks under a claimed job. Complete local files are immutable
// and reusable after interruption; partial network transfers never reach inference.
export async function downloadReferences(id,job,{root,fetchChunk,approved=async()=>{}}) {
 try{validateJob(job);}catch{throw new Error('invalid-reference');}
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(id))throw new Error('invalid-job');
 if(!job.references?.length)return;
 const directory=path.join(root,id,'inputs');await mkdir(directory,{recursive:true});
 for(const reference of job.references){
  await approved();
  const filename=path.join(directory,`${reference.index}.${reference.mime==='image/png'?'png':'jpg'}`);
  try{
   const existing=await readFile(filename);
   if(existing.length!==reference.bytes||createHash('sha256').update(existing).digest('hex')!==reference.sha256)throw new Error('invalid-reference');
   continue;
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const chunks=[];
  for(let index=0;index<reference.chunks;index++){
   await approved();const chunk=await fetchChunk(reference.index,index);
   if(chunk?.index!==index)throw new Error('invalid-reference');chunks.push(chunk.data);
  }
  const bytes=referenceBytes(reference,chunks);await writeFile(filename,bytes,{flag:'wx'});
 }
}

export function thumbnailPayload(bytes,{id,width,height,createdAt}) {
 if(!/^[A-Za-z0-9_-]{1,80}$/.test(id)||!Buffer.isBuffer(bytes)||bytes.length<100||bytes.length>65536||bytes[0]!==255||bytes[1]!==216||bytes[2]!==255||![width,height].every(value=>Number.isInteger(value)&&value>0&&value<=512)||!Number.isSafeInteger(createdAt))throw new Error('invalid-thumbnail');
 return {jobId:id,mime:'image/jpeg',data:bytes.toString('base64'),sha256:createHash('sha256').update(bytes).digest('hex'),bytes:bytes.length,width,height,createdAt};
}
export {REFERENCE_LIMITS};
