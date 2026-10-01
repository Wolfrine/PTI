export const collections=['threads','messages','branches','researchTasks','findings','decisions','experiments','discoveries','patterns','opportunities','runs'];
export const now=()=>new Date().toISOString();
export const id=()=>crypto.randomUUID();
export const clean=(v,max=4000)=>String(v??'').trim().slice(0,max);
export function required(v,label,max=4000){const s=clean(v,max);if(!s)throw new Error(`${label} is required.`);return s;}
export function choice(v,options,fallback){if(v==null||v==='')return fallback;if(!options.includes(v))throw new Error('Invalid status or category.');return v;}
export function safeUrl(v){const s=clean(v,2000);if(!s)return '';try{const u=new URL(s);if(!['https:','http:'].includes(u.protocol))throw 0;return u.href;}catch{throw new Error('Use a complete http or https source link.');}}
export function emailKey(v){const s=clean(v,254).toLowerCase();if(!/^[^\s/@]+@[^\s/@]+\.[^\s/@]+$/.test(s))throw new Error('Enter a valid Google account email.');return s;}
export function stamp(user){return {createdAt:now(),updatedAt:now(),createdBy:user.uid,authorName:clean(user.displayName||user.email||'Workspace member',120),revision:1};}
export function makeThread(input,user){return {...stamp(user),title:required(input.title,'Discussion title',180),summary:clean(input.summary,6000),status:'active',sourceOpportunityId:clean(input.sourceOpportunityId,150)};}
export function makeMessage(input,user){
 const audioData=String(input.audioData||'');if(audioData&&(!/^data:audio\/(webm|mp4|ogg|mpeg|wav)(;codecs=[^;,]+)?;base64,[A-Za-z0-9+/=]+$/.test(audioData)||audioData.length>600000))throw new Error('Voice note is too large or has an unsupported format. Record a shorter note.');
 const text=clean(input.text,12000);if(!text&&!audioData)throw new Error('Write a thought or record a voice note.');
 return {...stamp(user),threadId:required(input.threadId,'Discussion',150),branchId:clean(input.branchId,150),text,kind:choice(input.kind,['thought','question','link','summary'],'thought'),sourceUrl:safeUrl(input.sourceUrl),audioData,audioDuration:Math.max(0,Math.min(60,Number(input.audioDuration)||0))};
}
export const branchFields=['title','hypothesis','customer','offer','assumptions','openQuestions','demand','access','repeatability','economics','effort','automation','uncertainty'];
export function branchPatch(input){const result={};for(const k of branchFields)if(k in input)result[k]=k==='title'?required(input[k],'Direction title',180):clean(input[k],4000);return result;}
export function makeBranch(input,user){return {...stamp(user),threadId:required(input.threadId,'Discussion',150),parentId:clean(input.parentId,150),sourceMessageId:clean(input.sourceMessageId,150),...Object.fromEntries(branchFields.map(k=>[k,''])),...branchPatch(input),title:required(input.title,'Direction title',180),status:'exploring'};}
export function makeTask(input,user){return {...stamp(user),threadId:clean(input.threadId,150),branchId:clean(input.branchId,150),question:required(input.question,'Research question',4000),scope:choice(input.scope,['focused','open'],'focused'),status:'queued'};}
export function makeFinding(input,user){if(['fact','reported'].includes(input.evidenceType)&&!safeUrl(input.sourceUrl))throw new Error('Add a source link for a fact or reported claim, or label it as an inference.');return {...stamp(user),threadId:clean(input.threadId,150),branchId:clean(input.branchId,150),taskId:clean(input.taskId,150),title:required(input.title,'Finding title',180),summary:required(input.summary,'Finding',8000),stance:choice(input.stance,['supports','challenges','neutral'],'neutral'),sourceUrl:safeUrl(input.sourceUrl),sourceTitle:clean(input.sourceTitle,250),evidenceType:choice(input.evidenceType,['fact','reported','inference','question'],'inference')};}
export const decisionStatus={shortlisted:'shortlisted',parked:'parked',rejected:'rejected',reopened:'exploring'};
export function makeDecision(input,user){return {...stamp(user),threadId:required(input.threadId,'Discussion',150),branchId:required(input.branchId,'Direction',150),outcome:choice(input.outcome,Object.keys(decisionStatus),'shortlisted'),reason:required(input.reason,'Decision reason',6000),revisitWhen:clean(input.revisitWhen,2000)};}
export const experimentFields=['title','hypothesis','method','successCriterion','result','learning','nextStep'];
export function experimentPatch(input){const p={};for(const k of experimentFields)if(k in input)p[k]=clean(input[k],k==='title'?180:6000);if('status'in input)p.status=choice(input.status,['planned','running','completed','stopped'],'planned');return p;}
export function validateExperiment(v){for(const [k,label]of [['title','Experiment title'],['hypothesis','Hypothesis'],['method','Test method'],['successCriterion','Success criterion']])required(v[k],label);if(v.status==='completed'){required(v.result,'Observed result');required(v.learning,'What you learned');}return v;}
export function makeExperiment(input,user){return validateExperiment({...stamp(user),threadId:required(input.threadId,'Discussion',150),branchId:required(input.branchId,'Direction',150),...Object.fromEntries(experimentFields.map(k=>[k,''])),...experimentPatch(input),status:'planned'});}
export function validateLinks(record,state){
 if(record.threadId&&!state.threads.some(x=>x.id===record.threadId))throw new Error('This discussion is no longer available. Refresh and try again.');
 if(record.branchId){const b=state.branches.find(x=>x.id===record.branchId);if(!b||b.threadId!==record.threadId)throw new Error('Choose a direction from this discussion.');}
 if(record.parentId){const p=state.branches.find(x=>x.id===record.parentId);if(!p||p.threadId!==record.threadId)throw new Error('The parent direction must belong to this discussion.');}
 if(record.sourceMessageId){const m=state.messages.find(x=>x.id===record.sourceMessageId);if(!m||m.threadId!==record.threadId)throw new Error('The source thought must belong to this discussion.');}
}
