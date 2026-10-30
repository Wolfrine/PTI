// Output recovery is separate from inference: reconnect/restart never resamples.
export const retryDelay=attempt=>Math.min(120000,5000*2**Math.min(attempt,5));
export async function finishClaimed(item,{resumed=false,load,infer,upload,fail,approved,prepare=async()=>{},canResumeInference=async()=>false}){
 await approved();
 let output;
 try{output=await load(item.id);}catch{await fail(item,'invalid-output');return;}
 if(!output&&resumed&&!await canResumeInference(item)){await fail(item,'interrupted');return;}
 if(!output){
  // Input transport can retry while the job is claimed. Its first durable
  // inference marker ends that retry window; an interrupted inference never repeats.
  try{await prepare(item);}catch(error){if(error.message==='invalid-reference'){await fail(item,error.message);return;}throw error;}
  try{await infer(item);output=await load(item.id);if(!output)throw new Error('invalid-output');}
  catch(error){await fail(item,['resource-guard','invalid-output','output-too-large'].includes(error.message)?error.message:'inference-failed');return;}
 }
 await approved();
 // Upload/network failures deliberately leave the running claim intact. The next
 // cycle resumes these exact saved bytes without another call to inference.
 try{await upload(item,output);}catch(error){
  if(['invalid-output','output-too-large'].includes(error.message)){await fail(item,error.message);return;}
  throw error;
 }
}
