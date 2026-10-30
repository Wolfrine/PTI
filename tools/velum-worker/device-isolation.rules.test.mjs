import {test,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PC_DEVICE_UID} from '../../velum-gallery/device-config.mjs';
const require=createRequire(new URL('../../apps/one-piece/package.json',import.meta.url));
const {initializeTestEnvironment,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,setDoc}=require('firebase/firestore');
const env=await initializeTestEnvironment({projectId:'demo-velum-isolation',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
after(()=>env.cleanup());
test('anonymous device identities cannot inherit any legacy authenticated or own-account grants',async()=>{
 const device='unapprovedDeviceIdentity001';
 const db=env.authenticatedContext(device,{firebase:{sign_in_provider:'anonymous'}}).firestore();
 for(const path of ['arbitrary/legacy','users/another-owner','users/another-owner/unknown/record','users/another-owner/codexProjects/legacy',`users/${device}/personalData/workspace`,`users/${device}/sefpoData/workspace`,`users/${device}/codexProjects/codex-usage`,`users/${device}/resourceUsage/current`]){
  await assertFails(getDoc(doc(db,path)));await assertFails(setDoc(doc(db,path),{probe:true}));
 }
});
test('pinned device remains confined even if its account is linked to a different provider',async()=>{
 for(const provider of ['anonymous','password','google.com']){
  const db=env.authenticatedContext(PC_DEVICE_UID,{firebase:{sign_in_provider:provider},email_verified:true,email:'fixture@example.test'}).firestore();
  for(const path of ['arbitrary/legacy','users/another-owner','users/another-owner/codexProjects/legacy',`users/${PC_DEVICE_UID}/personalData/workspace`,`users/${PC_DEVICE_UID}/sefpoData/workspace`,`users/${PC_DEVICE_UID}/onePieceData/workspace`,`users/${PC_DEVICE_UID}/weddingData/workspace`,`users/${PC_DEVICE_UID}/ventureData/workspace`]){
   await assertFails(getDoc(doc(db,path)));await assertFails(setDoc(doc(db,path),{probe:true}));
  }
 }
});
