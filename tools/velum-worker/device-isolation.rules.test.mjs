import {test,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
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
