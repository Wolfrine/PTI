import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {nativeFirebaseKey,readNativeFirebaseKey} from '../src/runtime/native-auth.mjs';
const fixture=()=>({projectId:'pti-app-2ab59',keyResource:'projects/185802494856/locations/global/keys/pti-native-firebase-auth',firebaseAuthApiKey:'AIza'+'x'.repeat(35),applicationRestrictions:'none',apiTargets:['identitytoolkit.googleapis.com','securetoken.googleapis.com']});
test('native auth accepts only the existing PTI artifact and both authentication API targets',()=>{
 const value=fixture();assert.equal(nativeFirebaseKey(value),value.firebaseAuthApiKey);
 for(const change of [x=>x.projectId='foreign',x=>x.keyResource+='-other',x=>x.applicationRestrictions='browser',x=>x.firebaseAuthApiKey='bad-key',x=>x.apiTargets.push('drive.googleapis.com'),x=>x.apiTargets[1]='identitytoolkit.googleapis.com']){
  const value=fixture();change(value);assert.throws(()=>nativeFirebaseKey(value),/runtime-native-auth-required/);
 }
});
test('native artifact reads are explicit and bounded without falling back to a browser key',async t=>{
 const root=await mkdtemp(path.join(tmpdir(),'one-piece-native-auth-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const file=path.join(root,'native-auth.json');await writeFile(file,JSON.stringify(fixture()));
 assert.equal(await readNativeFirebaseKey(file),fixture().firebaseAuthApiKey);
 await assert.rejects(readNativeFirebaseKey(undefined),/runtime-native-auth-required/);
 await assert.rejects(readNativeFirebaseKey('relative.json'),/runtime-native-auth-required/);
 await writeFile(file,'x'.repeat(8193));await assert.rejects(readNativeFirebaseKey(file),/runtime-native-auth-required/);
});
