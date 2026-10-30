import {after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {makeJob} from '../../velum-gallery/studio-contract.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
const require=createRequire(new URL('../../apps/one-piece/package.json',import.meta.url));
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc}=require('firebase/firestore');
const uid='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',root=`users/${uid}/velumStudio/workspace`;
const env=await initializeTestEnvironment({projectId:'demo-studio2-tests',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
after(()=>env.cleanup());beforeEach(()=>env.clearFirestore());
const client=(id,provider='google.com')=>id?env.authenticatedContext(id,{firebase:{sign_in_provider:provider}}).firestore():env.unauthenticatedContext().firestore();
const owner=()=>client(uid),device=()=>client(PC_DEVICE_UID,'anonymous');
const path=(db,suffix)=>doc(db,`${root}/${suffix}`);
const reference={index:0,mime:'image/png',bytes:120,sha256:'a'.repeat(64),width:512,height:512,chunks:1,source:{kind:'file',id:'',name:'Technical reference.png'}};
const job=()=>makeJob({model:'flux2-klein-fp8',prompt:'  Preserve these exact words.\n',seed:42,consent:true,references:[reference]});
async function approve(){await env.withSecurityRulesDisabled(context=>setDoc(path(context.firestore(),`devices/${PC_DEVICE_UID}`),{status:'approved'}));}
async function completed(){const item=makeJob({model:'flux2-klein-fp8',prompt:'original',seed:42,consent:true});const result={mime:'image/png',bytes:256,chunks:1,sha256:'b'.repeat(64),settings:{model:item.model,seed:42},seconds:1};await env.withSecurityRulesDisabled(context=>setDoc(path(context.firestore(),'jobs/result'),{...item,status:'completed',result}));return result;}

test('reference manifests and upload chunks are owner scoped, bounded and immutable',async()=>{
 const item=job();await assertSucceeds(setDoc(path(owner(),'jobs/edit'),item));
 for(const db of [device(),client('other'),client('anonymous','anonymous'),client(null)]){
  await assertFails(getDoc(path(db,'jobs/edit/inputs/0/chunks/0')));
  await assertFails(setDoc(path(db,'jobs/edit/inputs/0/chunks/0'),{index:0,data:'a'.repeat(160)}));
 }
 await assertFails(updateDoc(path(owner(),'jobs/edit'),{status:'queued',inputsReady:true}));
 await assertFails(setDoc(path(owner(),'jobs/edit/inputs/2/chunks/0'),{index:0,data:'a'}));
 await assertFails(setDoc(path(owner(),'jobs/edit/inputs/0/chunks/1'),{index:1,data:'a'}));
 await assertFails(setDoc(path(owner(),'jobs/edit/inputs/0/chunks/0'),{index:0,data:'a'.repeat(600001)}));
 await assertSucceeds(setDoc(path(owner(),'jobs/edit/inputs/0/chunks/0'),{index:0,data:'a'.repeat(160)}));
 await assertFails(setDoc(path(owner(),'jobs/edit/inputs/0/chunks/0'),{index:0,data:'replaced'}));
 await assertFails(updateDoc(path(owner(),'jobs/edit'),{status:'queued',inputsReady:true,prompt:'rewritten'}));
 await assertSucceeds(updateDoc(path(owner(),'jobs/edit'),{status:'queued',inputsReady:true}));
 await approve();await assertSucceeds(getDoc(path(device(),'jobs/edit/inputs/0/chunks/0')));
 await assertFails(updateDoc(path(device(),'jobs/edit'),{references:[{...reference,sha256:'c'.repeat(64)}]}));
 await assertSucceeds(updateDoc(path(device(),'jobs/edit'),{status:'running',workerId:PC_DEVICE_UID}));
 await assertFails(setDoc(path(owner(),'jobs/edit/inputs/0/chunks/0'),{index:0,data:'new'}));
 assert.equal((await getDoc(path(owner(),'jobs/edit'))).data().prompt,item.prompt);
 for(const bad of [{model:'realvis-dynamic',references:[reference,{...reference,index:1}]},{references:[reference,reference,reference]},{width:2048},{references:[{...reference,bytes:2097153}]},{references:[{...reference,source:{...reference.source,secret:'no'}}]}])await assertFails(setDoc(path(owner(),'jobs/bad'),{...item,...bad}));
});
test('other models accept one reference but reject two',async()=>{
 for(const model of ['realvis-dynamic','realistic-sd15','zimage-nvfp4']){
  const id=`edit-${model}`,payload=makeJob({model,prompt:'edit',seed:3,consent:true,references:[reference]});
  await assertSucceeds(setDoc(path(owner(),`jobs/${id}`),payload));
  await assertFails(setDoc(path(owner(),`jobs/${id}-bad`),{...payload,references:[reference,{...reference,index:1}]}));
 }
});
test('two maximum five-chunk references can finish upload within the rules read budget',async()=>{
 const refs=[0,1].map(index=>({...reference,index,bytes:2097152,chunks:5}));
 const item=makeJob({model:'flux2-klein-fp8',prompt:'two references',seed:42,consent:true,references:refs});
 await setDoc(path(owner(),'jobs/edit'),item);
 for(let ref=0;ref<2;ref++)for(let index=0;index<5;index++)await setDoc(path(owner(),`jobs/edit/inputs/${ref}/chunks/${index}`),{index,data:'a'});
 await assertSucceeds(updateDoc(path(owner(),'jobs/edit'),{status:'queued',inputsReady:true}));
});
test('owner can abandon only an incomplete transfer without rewriting or deleting its inputs',async()=>{
 await setDoc(path(owner(),'jobs/edit'),job());
 await setDoc(path(owner(),'jobs/edit/inputs/0/chunks/0'),{index:0,data:'a'.repeat(160)});
 await approve();
 await assertFails(updateDoc(path(device(),'jobs/edit'),{status:'cancelled'}));
 await assertFails(updateDoc(path(owner(),'jobs/edit'),{status:'cancelled',prompt:'rewritten'}));
 await assertSucceeds(updateDoc(path(owner(),'jobs/edit'),{status:'cancelled'}));
 assert.equal((await getDoc(path(owner(),'jobs/edit/inputs/0/chunks/0'))).data().data.length,160);
 await assertFails(updateDoc(path(owner(),'jobs/edit'),{status:'queued',inputsReady:true}));
 await assertFails(updateDoc(path(device(),'jobs/edit'),{status:'running',workerId:PC_DEVICE_UID}));
});
test('thumbnail and capability writes require approved pinned device and revoke takes effect',async()=>{
 await completed();const thumbnail={jobId:'result',mime:'image/jpeg',data:'abcd',sha256:'c'.repeat(64),bytes:3,width:341,height:512,createdAt:Date.now()};
 await assertFails(setDoc(path(device(),'thumbs/result'),thumbnail));await approve();
 await assertFails(setDoc(path(owner(),'thumbs/result'),thumbnail));
 await assertFails(setDoc(path(device(),'thumbs/result'),{...thumbnail,width:513}));
 await assertSucceeds(setDoc(path(device(),'thumbs/result'),thumbnail));
 await assertFails(setDoc(path(device(),'thumbs/result'),{...thumbnail,data:'replace'}));
 const status={deviceUid:PC_DEVICE_UID,installed:['flux2-klein-fp8'],state:'idle',activeJob:'',version:'2.0.0',updatedAt:Date.now(),capabilities:{referenceModel:'flux2-klein-fp8',maxReferences:2,referenceOutputWidth:512,referenceOutputHeight:768}};
 await assertSucceeds(setDoc(path(device(),'status/pc'),status));
 await assertFails(setDoc(path(device(),'status/pc'),{...status,capabilities:{...status.capabilities,maxReferences:4}}));
 for(const db of [client('other'),client('anonymous','anonymous'),client(null)])await assertFails(getDoc(path(db,'thumbs/result')));
 await env.withSecurityRulesDisabled(context=>setDoc(path(context.firestore(),`devices/${PC_DEVICE_UID}`),{status:'revoked'}));
 await assertFails(getDoc(path(device(),'thumbs/result')));await assertSucceeds(getDoc(path(owner(),'thumbs/result')));
});
test('removed creations are owner-only and restore without touching originals',async()=>{
 await completed();const hidden={jobId:'result',removedAt:Date.now()};
 await assertSucceeds(setDoc(path(owner(),'removed/result'),hidden));
 for(const db of [device(),client('other'),client(null)]){
  await assertFails(getDoc(path(db,'removed/result')));
  await assertFails(setDoc(path(db,'removed/result'),hidden));
 }
 await assertFails(updateDoc(path(owner(),'removed/result'),{jobId:'changed'}));
 await assertSucceeds(deleteDoc(path(owner(),'removed/result')));
 assert.equal((await getDoc(path(owner(),'jobs/result'))).data().status,'completed');
});
test('Drive reservations and receipts bind immutable original identity without OAuth or session secrets',async()=>{
 const result=await completed(),reservation={jobId:'result',fileId:'drive_file_reserved_1',sha256:result.sha256,bytes:result.bytes,createdAt:Date.now()};
 await assertSucceeds(setDoc(path(owner(),'uploads/result'),reservation));
 await assertFails(updateDoc(path(owner(),'uploads/result'),{fileId:'another_file_id'}));
 const receipt={jobId:'result',fileId:reservation.fileId,name:'Velum-result.png',webViewLink:`https://drive.google.com/file/d/${reservation.fileId}/view`,savedAt:Date.now(),mime:'image/png',sha256:result.sha256,bytes:result.bytes,folderId:'1AedezVcOlOB-cdv00j1HQ7Sy-EZntHgA'};
 await assertFails(setDoc(path(owner(),'saves/result'),{...receipt,folderId:'different-root'}));
 await assertFails(setDoc(path(owner(),'saves/result'),{...receipt,sha256:'c'.repeat(64)}));
 await assertFails(setDoc(path(owner(),'saves/result'),{...receipt,token:'secret'}));
 await assertFails(setDoc(path(owner(),'saves/result'),{...receipt,fileId:'unreserved_file_id',webViewLink:'https://drive.google.com/file/d/unreserved_file_id/view'}));
 await assertSucceeds(setDoc(path(owner(),'saves/result'),receipt));
 await assertSucceeds(setDoc(path(owner(),'saves/result'),receipt));
 for(const db of [device(),client('other'),client(null)])for(const suffix of ['saves/result','uploads/result']){await assertFails(getDoc(path(db,suffix)));await assertFails(setDoc(path(db,suffix),receipt));}
});
