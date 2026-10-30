import {after,beforeEach,test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {makeJob} from '../../velum-gallery/studio-contract.mjs';
const require=createRequire(new URL('../../apps/one-piece/package.json',import.meta.url));
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,collection,getDocs}=require('firebase/firestore');
const uid='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',root=`users/${uid}/velumStudio/workspace`;
let env;
const client=id=>id?env.authenticatedContext(id).firestore():env.unauthenticatedContext().firestore();
const job=()=>makeJob({model:'flux2-klein-fp8',prompt:'  A sheer fabric study.\n  ',seed:42,consent:true});
env=await initializeTestEnvironment({projectId:'demo-velum-tests',firestore:{host:'127.0.0.1',port:8085,rules:await readFile(new URL('../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
after(()=>env?.cleanup());beforeEach(()=>env.clearFirestore());
test('owner queue is private including missing and nested image paths',async()=>{
 const db=client(uid),path=`${root}/jobs/probe`;
 await assertSucceeds(setDoc(doc(db,path),job()));
 assert.equal((await getDoc(doc(db,path))).data().prompt,job().prompt);
 for(const id of ['other',null]){
  const other=client(id);
  for(const target of [path,`${root}/jobs/absent`,`${path}/chunks/0`,`${root}/status/pc`]){
   await assertFails(getDoc(doc(other,target)));await assertFails(setDoc(doc(other,target),job()));
  }
  await assertFails(getDocs(collection(other,`${root}/jobs`)));
 }
 await assertFails(setDoc(doc(client('other'),'users/other/velumStudio/workspace/jobs/probe'),job()));
});
test('raw prompt and seed are immutable; states and image bounds enforced',async()=>{
 const db=client(uid),ref=doc(db,`${root}/jobs/probe`);await setDoc(ref,job());
 await assertFails(updateDoc(ref,{prompt:'rewritten'}));await assertFails(updateDoc(ref,{seed:99}));
 await assertFails(updateDoc(ref,{status:'completed'}));
 await assertSucceeds(updateDoc(ref,{status:'running',workerId:'pc'}));
 await assertSucceeds(setDoc(doc(db,`${root}/jobs/probe/chunks/0`),{data:'cG5n',index:0}));
 await assertFails(setDoc(doc(db,`${root}/jobs/probe/chunks/1`),{data:'a'.repeat(600001),index:1}));
 await assertFails(setDoc(doc(db,`${root}/jobs/probe/chunks/0`),{data:'replace',index:0}));
 const result={mime:'image/png',bytes:256,chunks:1,sha256:'a'.repeat(64),settings:{model:'flux2-klein-fp8',seed:42},seconds:1};
 await assertSucceeds(updateDoc(ref,{status:'completed',result}));
 await assertFails(updateDoc(ref,{status:'queued'}));
 await assertSucceeds(setDoc(doc(db,`${root}/feedback/probe`),{verdict:'iterate',note:'Keep my wording',updatedAt:Date.now()}));
});
test('malformed jobs, unknown paths and unconsented requests fail closed',async()=>{
 const db=client(uid);
 for(const bad of [{consent:false},{model:'remote'},{width:4096},{prompt:'x'.repeat(6001)},{hiddenPrompt:'added'},{expiresAt:Date.now()+86400000}])
  await assertFails(setDoc(doc(db,`${root}/jobs/probe`),{...job(),...bad}));
 await assertFails(setDoc(doc(db,`${root}/private/unknown`),{x:1}));
 await assertSucceeds(setDoc(doc(db,`${root}/status/pc`),{installed:['flux2-klein-fp8'],state:'idle',activeJob:'',version:'1.0.0',updatedAt:Date.now()}));
});
