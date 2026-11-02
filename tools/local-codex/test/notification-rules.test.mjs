import {test,after} from 'node:test';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../../apps/one-piece/package.json',import.meta.url));
const {initializeTestEnvironment,assertSucceeds,assertFails}=require('@firebase/rules-unit-testing');
const {doc,getDoc,getDocs,collection,setDoc}=require('firebase/firestore');
const uid='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',root=`_ptiLocalServices/local-codex/owners/${uid}`,signal=`${root}/signals/dispatch`;
const [host,port]=(process.env.FIRESTORE_EMULATOR_HOST||'127.0.0.1:8085').split(':');
const env=await initializeTestEnvironment({projectId:'demo-local-codex-listener',firestore:{host,port:Number(port),rules:await readFile(new URL('../../../personal-harness/firestore.rules',import.meta.url),'utf8')}});
after(()=>env.cleanup());
test('only the exact owner can read the dispatch marker; mailbox and writes stay private',async()=>{
  await env.withSecurityRulesDisabled(async context=>{const db=context.firestore();await setDoc(doc(db,signal),{schemaVersion:1,revision:'fixture'});await setDoc(doc(db,`${root}/jobs/${'a'.repeat(32)}`),{private:'fixture'});});
  const owner=env.authenticatedContext(uid,{firebase:{sign_in_provider:'google.com'}}).firestore();
  await assertSucceeds(getDoc(doc(owner,signal)));
  for(const db of [env.unauthenticatedContext().firestore(),env.authenticatedContext('someone-else').firestore(),env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'}}).firestore()])await assertFails(getDoc(doc(db,signal)));
  for(const target of [root,`${root}/jobs/${'a'.repeat(32)}`,`${root}/signals/other`])await assertFails(getDoc(doc(owner,target)));
  await assertFails(getDocs(collection(owner,`${root}/signals`)));
  await assertFails(setDoc(doc(owner,signal),{schemaVersion:1,revision:'tampered'}));
});
