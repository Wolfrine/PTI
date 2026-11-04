import {after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {makeJob} from '../../velum-gallery/studio-contract.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
const require=createRequire(new URL('../../apps/one-piece/package.json',import.meta.url));
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc}=require('firebase/firestore');
const ownerUid='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',root=`users/${ownerUid}/velumStudio/workspace`;
const rulesFile=process.env.VELUM_RULES_FILE||new URL('../../personal-harness/firestore.rules',import.meta.url);
const env=await initializeTestEnvironment({projectId:'demo-velum-progress-tests',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(rulesFile,'utf8')}});
after(()=>env.cleanup());beforeEach(()=>env.clearFirestore());
const db=(uid=ownerUid,provider='google.com')=>uid?env.authenticatedContext(uid,{firebase:{sign_in_provider:provider}}).firestore():env.unauthenticatedContext().firestore();
const device=()=>db(PC_DEVICE_UID,'anonymous');
const ref=(client,suffix)=>doc(client,`${root}/${suffix}`);
const stages=['preparing','loading-model','encoding-references','encoding-prompt','loading-diffusion','sampling','decoding','publishing'];
function progress(){const now=Date.now();return {stage:'sampling',jobStartedAt:now-700000,stageStartedAt:now-20000,updatedAt:now,stageDurations:{preparing:5000,'loading-model':10000,'encoding-references':10000,'encoding-prompt':650000,'loading-diffusion':5000},step:3,total:40,resources:{sampledAt:now,cpuPercent:12.5,ramUsedBytes:12000000000,ramTotalBytes:34000000000,gpuUtilPercent:91,vramUsedMiB:6140,vramTotalMiB:8188,gpuTempC:71}};}
async function seed(){
 const references=Array.from({length:10},(_,index)=>({index,role:'subject',mime:'image/jpeg',bytes:120,sha256:index.toString(16).repeat(64),width:512,height:768,chunks:1,source:{kind:'drive',id:`fixture-${index}`,name:'Synthetic manifest'}}));
 const job={...makeJob({model:'qwen-image-2.1',prompt:'Immutable synthetic rules request',seed:42,consent:true,references}),status:'running',inputsReady:true,workerId:PC_DEVICE_UID,startedAt:Date.now()-700000};
 await env.withSecurityRulesDisabled(async context=>{await setDoc(ref(context.firestore(),`devices/${PC_DEVICE_UID}`),{status:'approved'});await setDoc(ref(context.firestore(),'jobs/live'),job);});return job;
}
test('approved worker current resources and all exact stages fit ten-reference expression budget',async()=>{
 const job=await seed(),client=device();
 for(const stage of stages)await assertSucceeds(updateDoc(ref(client,'jobs/live'),{progress:{...progress(),stage,step:stage==='sampling'?40:null,total:stage==='sampling'?40:null,stageDurations:Object.fromEntries(stages.map(s=>[s,1000]))}}));
 await assertSucceeds(updateDoc(ref(client,'jobs/live'),{status:'completed',finishedAt:Date.now(),result:{mime:'image/png',bytes:256,chunks:1,sha256:'b'.repeat(64),seconds:900,settings:{model:job.model,seed:job.seed}}}));
 assert.equal((await getDoc(ref(db(),'jobs/live'))).data().status,'completed');
 await assertFails(updateDoc(ref(client,'jobs/live'),{status:'running',progress:progress()}));
});
test('owner can read private metrics, but only pinned approved worker can write them',async()=>{
 await seed();await assertSucceeds(updateDoc(ref(device(),'jobs/live'),{progress:progress()}));
 await assertSucceeds(getDoc(ref(db(),'jobs/live')));
 for(const client of [db(),db('other'),db('anonymous','anonymous'),db(null)]){
  await assertFails(updateDoc(ref(client,'jobs/live'),{progress:progress()}));
 }
 for(const client of [db('other'),db('anonymous','anonymous'),db(null)])await assertFails(getDoc(ref(client,'jobs/live')));
 await env.withSecurityRulesDisabled(context=>updateDoc(ref(context.firestore(),`devices/${PC_DEVICE_UID}`),{status:'revoked'}));
 await assertFails(updateDoc(ref(device(),'jobs/live'),{progress:progress()}));
});
test('unavailable values and legacy installed-worker progress remain compatible',async()=>{
 await seed();const p=progress();p.stage='encoding-prompt';p.step=null;p.total=null;
 p.resources=Object.fromEntries(Object.keys(p.resources).map(k=>[k,k==='sampledAt'?p.updatedAt:null]));
 await assertSucceeds(updateDoc(ref(device(),'jobs/live'),{progress:p}));
 for(const value of [{},{step:0,total:0},{step:0,total:40,stage:'encoding-prompt'},{step:3,total:40},{step:0,total:0,stage:'publishing'}])await assertSucceeds(updateDoc(ref(device(),'jobs/live'),{progress:value}));
});
test('malformed and unbounded telemetry is denied without mutating the request',async()=>{
 await seed();const p=progress();
 const bad=[{...p,unexpected:'private'},{...p,stage:'arbitrary'},{...p,step:-1},{...p,step:41},{...p,step:1.2},{...p,total:40001},{...p,total:2.5},{...p,updatedAt:Date.now()+600000},{...p,stageStartedAt:p.jobStartedAt-1},{...p,stageDurations:{history:[1,2]}},{...p,stageDurations:{sampling:-1}},{...p,stageDurations:{sampling:null}},{...p,resources:{...p.resources,cpuPercent:101}},{...p,resources:{...p.resources,gpuUtilPercent:-1}},{...p,resources:{...p.resources,gpuTempC:'71'}},{...p,resources:{...p.resources,ramUsedBytes:p.resources.ramTotalBytes+1}},{...p,resources:{...p.resources,vramUsedMiB:99999}},{...p,resources:{...p.resources,sampledAt:p.updatedAt+1}},{...p,resources:{...p.resources,hostname:'private-pc'}},{stage:'sampling',updatedAt:Date.now()}];
 for(const value of bad)await assertFails(updateDoc(ref(device(),'jobs/live'),{progress:value}));
 for(const patch of [{prompt:'changed'},{references:[]},{deviceUid:'other'},{seed:4}])await assertFails(updateDoc(ref(device(),'jobs/live'),{progress:p,...patch}));
});

test('all original upper and nullable bounds, fractional metrics, key closure and ordered instants remain exact',async()=>{
 await seed();const client=device();
 const p=progress();
 p.jobStartedAt=1;p.stageStartedAt=1;p.updatedAt=Date.now();
 p.resources={sampledAt:1,cpuPercent:100,gpuUtilPercent:100,gpuTempC:150,ramUsedBytes:17592186044416,ramTotalBytes:17592186044416,vramUsedMiB:16777216,vramTotalMiB:16777216};
 p.stageDurations=Object.fromEntries(stages.map(stage=>[stage,604800000]));p.step=10000;p.total=10000;
 await assertSucceeds(updateDoc(ref(client,'jobs/live'),{progress:p}));
 const fractional={...p,resources:{...p.resources,cpuPercent:0.5,gpuUtilPercent:0.5,gpuTempC:0.5,ramUsedBytes:0.5,ramTotalBytes:0.5,vramUsedMiB:0.5,vramTotalMiB:0.5}};
 await assertSucceeds(updateDoc(ref(client,'jobs/live'),{progress:fractional}));
 for(const pair of [[null,null],[null,0],[0,0],[0,10000],[10000,10000]])await assertSucceeds(updateDoc(ref(client,'jobs/live'),{progress:{...p,step:pair[0],total:pair[1],stageDurations:{}}}));
 for(const key of ['cpuPercent','gpuUtilPercent','gpuTempC','ramUsedBytes','ramTotalBytes','vramUsedMiB','vramTotalMiB']){
  for(const value of [-1,'1',true,p.resources[key]+1])await assertFails(updateDoc(ref(client,'jobs/live'),{progress:{...p,resources:{...p.resources,[key]:value}}}));
 }
 for(const key of Object.keys(p.resources)){
  const resources={...p.resources};delete resources[key];
  await assertFails(updateDoc(ref(client,'jobs/live'),{progress:{...p,resources}}));
 }
 for(const value of [0,-1,0.5,'1',null,p.updatedAt+1])await assertFails(updateDoc(ref(client,'jobs/live'),{progress:{...p,resources:{...p.resources,sampledAt:value}}}));
 for(const stage of stages)for(const value of [-1,604800001,0.5,'1',null])await assertFails(updateDoc(ref(client,'jobs/live'),{progress:{...p,stageDurations:{[stage]:value}}}));
 for(const value of [[],null,'invalid',7]){
  await assertFails(updateDoc(ref(client,'jobs/live'),{progress:{...p,stageDurations:value}}));
  await assertFails(updateDoc(ref(client,'jobs/live'),{progress:{...p,resources:value}}));
 }
 for(const key of ['jobStartedAt','stageStartedAt','updatedAt'])for(const value of [0,-1,1.5,'1',null])await assertFails(updateDoc(ref(client,'jobs/live'),{progress:{...p,[key]:value}}));
 for(const pair of [[0,null],[-1,1],[10001,10001],[0,-1],[1.5,2],[1,2.5],[null,10001]])await assertFails(updateDoc(ref(client,'jobs/live'),{progress:{...p,step:pair[0],total:pair[1]}}));
});
