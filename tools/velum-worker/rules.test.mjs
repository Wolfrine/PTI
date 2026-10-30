import {after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {makeJob} from '../../velum-gallery/studio-contract.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
const require=createRequire(new URL('../../apps/one-piece/package.json',import.meta.url));
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,collection,getDocs,query,where}=require('firebase/firestore');
const uid='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',root=`users/${uid}/velumStudio/workspace`;
const env=await initializeTestEnvironment({projectId:'demo-velum-tests',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
after(()=>env.cleanup());beforeEach(()=>env.clearFirestore());
const client=(id,provider='google.com')=>id?env.authenticatedContext(id,{firebase:{sign_in_provider:provider},email_verified:true,email:'fixture@example.test'}).firestore():env.unauthenticatedContext().firestore();
const owner=()=>client(uid),device=()=>client(PC_DEVICE_UID,'anonymous');
const pending=()=>({deviceUid:PC_DEVICE_UID,label:'Owner Windows PC',grantHash:'a'.repeat(64),createdAt:Date.now(),expiresAt:Date.now()+86400000,status:'pending'});
const binding=db=>doc(db,`${root}/devices/${PC_DEVICE_UID}`);
const job=()=>makeJob({model:'flux2-klein-fp8',prompt:'  A sheer fabric study.\n  ',seed:42,consent:true});
async function approve(){const grant=pending();grant.expiresAt=grant.createdAt+86400000;await setDoc(binding(device()),grant);await updateDoc(binding(owner()),{status:'approved',approvedAt:Date.now()});}

test('only the pinned device requests enrollment; only owner approves its immutable unexpired grant',async()=>{
 const grant=pending();grant.expiresAt=grant.createdAt+86400000;
 await assertFails(setDoc(binding(client('rogueDevice00000001','anonymous')),grant));
 await assertFails(setDoc(binding(owner()),grant));
 await assertSucceeds(setDoc(binding(device()),grant));
 await assertFails(updateDoc(binding(device()),{status:'approved',approvedAt:Date.now()}));
 await assertFails(updateDoc(binding(client('other')),{status:'approved',approvedAt:Date.now()}));
 await assertFails(updateDoc(binding(owner()),{status:'approved',approvedAt:Date.now(),deviceUid:'rogue'}));
 await assertSucceeds(updateDoc(binding(owner()),{status:'approved',approvedAt:Date.now()}));
 await assertFails(updateDoc(binding(device()),{status:'pending'}));
 await assertFails(updateDoc(binding(owner()),{grantHash:'b'.repeat(64)}));
});
test('expired grants cannot be approved; renewal cannot replace approved or revoked bindings',async()=>{
 const createdAt=Date.now()-2*86400000;
 await env.withSecurityRulesDisabled(async context=>setDoc(binding(context.firestore()),{...pending(),createdAt,expiresAt:createdAt+86400000}));
 await assertFails(updateDoc(binding(owner()),{status:'approved',approvedAt:Date.now()}));
 const created=Date.now();await assertSucceeds(updateDoc(binding(device()),{grantHash:'b'.repeat(64),createdAt:created,expiresAt:created+86400000}));
 await assertSucceeds(updateDoc(binding(owner()),{status:'approved',approvedAt:Date.now()}));
 await assertSucceeds(updateDoc(binding(owner()),{status:'revoked',revokedAt:Date.now()}));
 await assertFails(updateDoc(binding(device()),{status:'pending',grantHash:'c'.repeat(64),createdAt:created,expiresAt:created+86400000}));
 await assertSucceeds(updateDoc(binding(owner()),{status:'approved',approvedAt:Date.now()}));
});
test('owner can queue while PC is offline; device reads only its assigned jobs after approval',async()=>{
 const path=`${root}/jobs/probe`;await setDoc(doc(owner(),path),job());
 await assertFails(getDoc(doc(device(),path)));await approve();
 await assertSucceeds(getDoc(doc(device(),path)));
 await assertSucceeds(getDocs(query(collection(device(),`${root}/jobs`),where('deviceUid','==',PC_DEVICE_UID),where('status','==','queued'))));
 await assertFails(getDocs(collection(device(),`${root}/jobs`)));
 await assertFails(setDoc(doc(device(),`${root}/jobs/device-created`),job()));
 for(const id of ['other',null])for(const target of [path,`${root}/jobs/absent`,`${path}/chunks/0`,`${root}/status/pc`,`${root}/devices/${PC_DEVICE_UID}`]){
  await assertFails(getDoc(doc(client(id),target)));await assertFails(setDoc(doc(client(id),target),job()));
 }
 assert.equal((await getDoc(doc(owner(),path))).data().prompt,job().prompt);
});
test('device preserves prompt, seed, target and settings; only genuine bounded output transitions accepted',async()=>{
 await approve();const ref=doc(device(),`${root}/jobs/probe`);await setDoc(doc(owner(),`${root}/jobs/probe`),job());
 for(const change of [{prompt:'rewritten'},{seed:99},{deviceUid:'rogue'},{expiresAt:Date.now()+1000}])await assertFails(updateDoc(ref,change));
 await assertFails(updateDoc(ref,{status:'completed'}));
 await assertSucceeds(updateDoc(ref,{status:'running',workerId:PC_DEVICE_UID,startedAt:Date.now()}));
 await assertSucceeds(setDoc(doc(device(),`${root}/jobs/probe/chunks/0`),{data:'cG5n',index:0}));
 await assertFails(setDoc(doc(device(),`${root}/jobs/probe/chunks/1`),{data:'a'.repeat(600001),index:1}));
 await assertFails(setDoc(doc(device(),`${root}/jobs/probe/chunks/0`),{data:'replace',index:0}));
 const result={mime:'image/png',bytes:256,chunks:1,sha256:'a'.repeat(64),settings:{model:'flux2-klein-fp8',seed:42},seconds:1};
 await assertFails(updateDoc(ref,{status:'completed',result:{...result,settings:{model:'flux2-klein-fp8',seed:99}}}));
 await assertSucceeds(updateDoc(ref,{status:'completed',result,finishedAt:Date.now()}));
 await assertFails(updateDoc(ref,{status:'queued'}));
 await assertFails(setDoc(doc(device(),`${root}/feedback/probe`),{verdict:'keep',note:'forged',updatedAt:Date.now()}));
 await assertSucceeds(setDoc(doc(owner(),`${root}/feedback/probe`),{verdict:'iterate',note:'Keep my wording',updatedAt:Date.now()}));
});
test('revoke immediately removes heartbeat, queue and chunk access; owner retains drafts',async()=>{
 await approve();await setDoc(doc(owner(),`${root}/jobs/probe`),job());
 await updateDoc(doc(device(),`${root}/jobs/probe`),{status:'running',workerId:PC_DEVICE_UID});
 const status={deviceUid:PC_DEVICE_UID,installed:['flux2-klein-fp8'],state:'idle',activeJob:'',version:'2.0.0',updatedAt:Date.now()};
 await assertSucceeds(setDoc(doc(device(),`${root}/status/pc`),status));
 await updateDoc(binding(owner()),{status:'revoked',revokedAt:Date.now()});
 await assertFails(getDoc(doc(device(),`${root}/jobs/probe`)));
 await assertFails(setDoc(doc(device(),`${root}/status/pc`),status));
 await assertFails(setDoc(doc(device(),`${root}/jobs/probe/chunks/0`),{data:'cG5n',index:0}));
 await assertSucceeds(getDoc(binding(device())));await assertSucceeds(getDoc(doc(owner(),`${root}/jobs/probe`)));
});
test('expired offline jobs cannot be claimed; malformed and unconsented jobs fail closed',async()=>{
 await approve();const expired=makeJob({model:'flux2-klein-fp8',prompt:'expired',seed:42,consent:true},Date.now()-8*86400000);
 await env.withSecurityRulesDisabled(context=>setDoc(doc(context.firestore(),`${root}/jobs/expired`),expired));
 await assertFails(updateDoc(doc(device(),`${root}/jobs/expired`),{status:'running',workerId:PC_DEVICE_UID}));
 await assertSucceeds(updateDoc(doc(device(),`${root}/jobs/expired`),{status:'failed',error:'expired',finishedAt:Date.now()}));
 for(const bad of [{consent:false},{model:'remote'},{width:4096},{prompt:'x'.repeat(6001)},{hiddenPrompt:'added'},{deviceUid:'rogue'},{expiresAt:Date.now()+86400000}])await assertFails(setDoc(doc(owner(),`${root}/jobs/probe`),{...job(),...bad}));
 await assertFails(setDoc(doc(owner(),`${root}/private/unknown`),{x:1}));
});
