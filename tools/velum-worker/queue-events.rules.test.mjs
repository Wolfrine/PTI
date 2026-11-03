import {after,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {subscribeForWork} from './queue-events.mjs';
import {OWNER_UID,enrollment} from './session.mjs';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
import {makeJob} from '../../velum-gallery/studio-contract.mjs';
const require=createRequire(new URL('../../apps/one-piece/package.json',import.meta.url));
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const sdk=require('firebase/firestore');
const {doc,setDoc,updateDoc,query,collection,where,limit,getDocs}=sdk;
const env=await initializeTestEnvironment({projectId:'demo-velum-queue-events',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
after(()=>env.cleanup());
const root=`users/${OWNER_UID}/velumStudio/workspace`;
const device=env.authenticatedContext(PC_DEVICE_UID,{firebase:{sign_in_provider:'anonymous'}}).firestore();
const owner=env.authenticatedContext(OWNER_UID,{firebase:{sign_in_provider:'google.com'}}).firestore();
async function until(check){
 const deadline=Date.now()+8000;
 while(!check()){if(Date.now()>deadline)assert.fail('emulator notification timed out');await new Promise(resolve=>setTimeout(resolve,10));}
}

test('real device-scoped query listeners wake on owner queue writes and close on revocation',async()=>{
 const now=Date.now(),binding=`${root}/devices/${PC_DEVICE_UID}`;
 await env.withSecurityRulesDisabled(async context=>{
  const db=context.firestore();
  await setDoc(doc(db,binding),{...enrollment({uid:PC_DEVICE_UID,grant:'a'.repeat(64),grantCreatedAt:now}),status:'approved',approvedAt:now});
  await setDoc(doc(db,`${root}/jobs/other-device`),{...makeJob({model:'flux2-klein-fp8',prompt:'Synthetic listener fixture',seed:1,consent:true}),deviceUid:'other-device'});
 });
 let connected=false,wakes=0,status='',failures=[];
 const received=new Set();
 const close=subscribeForWork(device,PC_DEVICE_UID,{sdk:{...sdk,onSnapshot:(target,options,next,error)=>sdk.onSnapshot(target,options,snapshot=>{
  if(snapshot.docs)for(const item of snapshot.docs)received.add(item.id);
  next(snapshot);
 },error)},changed:()=>wakes++,binding:value=>{status=value;},connection:value=>{connected=value;},failed:error=>failures.push(error.code)});
 try{
  await until(()=>connected);const baseline=wakes;
  await setDoc(doc(owner,`${root}/jobs/event-fixture`),makeJob({model:'flux2-klein-fp8',prompt:'Synthetic listener fixture',seed:1,consent:true}));
  await until(()=>wakes>baseline&&received.has('event-fixture'));
  assert.equal(received.has('other-device'),false);
  await assertFails(getDocs(query(collection(device,`${root}/jobs`),where('status','==','queued'),limit(20))));
  await updateDoc(doc(owner,binding),{status:'revoked',revokedAt:Date.now()});
  await until(()=>status==='revoked');
  await assertFails(getDocs(query(collection(device,`${root}/jobs`),where('status','==','queued'),where('deviceUid','==',PC_DEVICE_UID),limit(20))));
  await updateDoc(doc(owner,binding),{status:'approved',approvedAt:Date.now()});
  await until(()=>status==='approved'&&connected);
  assert.ok(failures.every(code=>code==='permission-denied'));
 }finally{close();}
});
