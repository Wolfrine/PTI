import {after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {makeJob} from '../../velum-gallery/studio-contract.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
const require=createRequire(new URL('../../apps/one-piece/package.json',import.meta.url));
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc}=require('firebase/firestore');
const root='users/5PbKbpGf3AbarNrp6pyqJ5C5Ziu2/velumStudio/workspace';
const env=await initializeTestEnvironment({projectId:'demo-qwen-rules',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
after(()=>env.cleanup());beforeEach(()=>env.clearFirestore());
const db=(uid='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',provider='google.com')=>env.authenticatedContext(uid,{firebase:{sign_in_provider:provider}}).firestore();
const ref=(client,suffix)=>doc(client,`${root}/${suffix}`);
const references=()=>Array.from({length:10},(_,index)=>({index,role:'subject',mime:'image/jpeg',bytes:120,sha256:index.toString(16).repeat(64),width:512,height:768,chunks:1,source:{kind:'drive',id:`fixture-image-${index}`,name:`Synthetic fixture ${index}`}}));
const job=()=>makeJob({model:'qwen-image-2.1',prompt:'  Exact original\n',seed:42,consent:true,references:references()});
test('ten staged reference readiness records fit Firestore access limits and cannot queue incomplete inputs',async()=>{
 const client=db(),item=job();await assertSucceeds(setDoc(ref(client,'jobs/ten'),item));
 await assertFails(updateDoc(ref(client,'jobs/ten'),{status:'queued',inputsReady:true}));
 for(const r of item.references){
  const target=ref(client,`jobs/ten/inputs/${r.index}`),manifest={index:r.index,sha256:r.sha256,bytes:r.bytes,chunks:r.chunks};
  await assertFails(setDoc(target,manifest));
  await assertSucceeds(setDoc(ref(client,`jobs/ten/inputs/${r.index}/chunks/0`),{index:0,data:'a'.repeat(160)}));
  await assertFails(setDoc(target,{...manifest,sha256:'f'.repeat(64)}));
  await assertSucceeds(setDoc(target,manifest));
  await assertFails(updateDoc(target,{bytes:123}));
 }
 await assertSucceeds(updateDoc(ref(client,'jobs/ten'),{status:'queued',inputsReady:true}));
 await assertFails(updateDoc(ref(client,'jobs/ten'),{prompt:'silently changed'}));
 await assertFails(getDoc(ref(db('other'),'jobs/ten/inputs/9')));
});
test('Qwen model, explicit prompt lineage and legacy caps are enforced by owner rules',async()=>{
 const item=job();await assertFails(setDoc(ref(db(),'jobs/wrong-prompt'),{...item,effectivePrompt:'hidden enhancement'}));
 await assertFails(setDoc(ref(db(),'jobs/legacy-cap'),{...item,model:'flux2-klein-fp8',width:512,height:768}));
 await assertFails(setDoc(ref(db(),'jobs/fake-history'),{...item,recordType:'historical-import'}));
});
test('only approved device reports installed Qwen and publishes its actual progress/output',async()=>{
 const client=db(PC_DEVICE_UID,'anonymous'),owner=db();
 await env.withSecurityRulesDisabled(context=>setDoc(ref(context.firestore(),`devices/${PC_DEVICE_UID}`),{status:'approved'}));
 const installed=['zimage-nvfp4','flux2-klein-fp8','realvis-dynamic','realistic-sd15','qwen-image-2.1'];
 const capabilities={referenceModel:'flux2-klein-fp8',maxReferences:2,referenceModels:installed,referenceOutputWidth:512,referenceOutputHeight:768,recoveryControl:true,qwenMaxReferences:10,promptSchema:4,referenceLimits:{'flux2-klein-fp8':2,'realvis-dynamic':1,'realistic-sd15':1,'zimage-nvfp4':1,'qwen-image-2.1':10}};
 await assertSucceeds(setDoc(ref(client,'status/pc'),{deviceUid:PC_DEVICE_UID,updatedAt:Date.now(),installed,state:'idle',activeJob:'',version:'2.3.0',capabilities}));
 const item=makeJob({model:'qwen-image-2.1',prompt:'Synthetic test',seed:9,consent:true});await assertSucceeds(setDoc(ref(owner,'jobs/output'),item));
 await assertSucceeds(updateDoc(ref(client,'jobs/output'),{status:'running',workerId:PC_DEVICE_UID,startedAt:Date.now(),progress:{step:0,total:40,stage:'loading-diffusion'}}));
 await assertSucceeds(updateDoc(ref(client,'jobs/output'),{status:'completed',finishedAt:Date.now(),result:{mime:'image/png',bytes:256,chunks:1,sha256:'a'.repeat(64),seconds:1500,localPath:'F:\\Workspace\\Programs\\Independent-Products\\PTI\\tools\\velum-worker\\.runtime\\qwen21\\output\\image.png',referenceMethod:'qwen21-native-multireference',settings:{model:item.model,seed:item.seed}}}));
 assert.equal((await getDoc(ref(owner,'jobs/output'))).data().prompt,item.prompt);
});
