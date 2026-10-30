import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runnable,encode,decode,imagePayload} from './core.mjs';
import {makeJob} from '../../velum-gallery/studio-contract.mjs';
import {refreshSession,restoreDevice,DeviceStore,PROJECT,protect,enrollment,GRANT_TTL} from './session.mjs';
import {finishClaimed,retryDelay} from './lifecycle.mjs';
import {lockMatches} from './worker-lock.mjs';
import {mkdtemp,readFile,unlink,rmdir} from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
const DEVICE='fixtureDeviceIdentity001';
const jwt=(uid=DEVICE,project=PROJECT,provider='anonymous')=>`e30.${Buffer.from(JSON.stringify({aud:project,iss:`https://securetoken.google.com/${project}`,sub:uid,firebase:{sign_in_provider:provider}})).toString('base64url')}.fixture`;
const input={model:'flux2-klein-fp8',prompt:'  Sheer silk study\nFictional consenting adult.  ',seed:123,consent:true};
test('worker preserves raw words and refuses expired or already-claimed work',()=>{
 const job=makeJob(input,1000);assert.equal(runnable(job,2000),true);assert.equal(job.prompt,input.prompt);
 assert.equal(runnable(job,job.expiresAt+1),false);assert.equal(runnable({...job,status:'running'},2000),false);
 assert.equal(runnable({...job,model:'executable-path'},2000),false);
 assert.deepEqual(decode(encode(job)),job);
});
test('private result transport hashes exact bytes and bounds upload size',()=>{
 const bytes=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),Buffer.alloc(800000,7)]);
 const {chunks,result}=imagePayload(bytes);
 assert.equal(result.chunks,2);assert(Buffer.from(chunks.join(''),'base64').equals(bytes));
 assert.equal(result.sha256,createHash('sha256').update(bytes).digest('hex'));
 assert.throws(()=>imagePayload(Buffer.alloc(200)));assert.throws(()=>imagePayload(Buffer.concat([bytes,Buffer.alloc(8000000)])));
});
test('device refresh binds exact UID, project and anonymous provider',async()=>{
 const value={user_id:DEVICE,project_id:PROJECT,id_token:jwt(),refresh_token:'fixture-refreshed-session',expires_in:'3600'};
 const response=data=>async()=>({ok:true,json:async()=>data});
 const session=await refreshSession('fixture-only-refresh-token',DEVICE,response(value));assert.equal(session.idToken,value.id_token);
 for(const changed of [{user_id:'anotherDeviceIdentity001'},{project_id:'other'},{expires_in:'invalid'},{id_token:jwt(DEVICE,'other')},{id_token:jwt(DEVICE,PROJECT,'google.com')}])
  await assert.rejects(refreshSession('fixture-only-refresh-token',DEVICE,response({...value,...changed})),/device-identity-mismatch/);
});
test('restart restores same device and commits token rotation before use',async()=>{
 let disk=null,creates=0;
 const store={load:async()=>disk,save:async value=>{disk=structuredClone(value);}};
 const create=async()=>{creates++;return {uid:DEVICE,refreshToken:'fixture-original-refresh-token'};};
 const first=await restoreDevice(store,{create});assert.equal(disk.refreshToken,first.refreshToken);
 const second=await restoreDevice(store,{create,refresh:async(token,uid)=>{assert.equal(uid,DEVICE);assert.equal(token,disk.refreshToken);return {uid,refreshToken:'fixture-rotated-refresh-token'};}});
 assert.equal(creates,1);assert.equal(second.uid,DEVICE);assert.equal(disk.refreshToken,second.refreshToken);assert.equal(first.saved.grant,second.saved.grant);
 assert.equal(enrollment(second.saved).expiresAt-second.saved.grantCreatedAt,GRANT_TTL);
 await assert.rejects(restoreDevice({load:async()=>disk,save:async()=>{throw new Error('disk-offline');}},{refresh:async()=>second}),/disk-offline/);
});
test('Windows DPAPI stores no plaintext and decrypts after a new store instance',{skip:process.platform!=='win32'},async()=>{
 const directory=await mkdtemp(path.join(process.cwd(),'.velum-device-test-')),file=path.join(directory,'device.dpapi');
 const saved={version:2,uid:DEVICE,refreshToken:'fixture-test-refresh-secret-only',grant:'a'.repeat(64),createdAt:1,grantCreatedAt:1};
 try{const first=new DeviceStore(file);await first.save(saved);const sealed=await readFile(file,'utf8');assert.ok(!sealed.includes(saved.refreshToken));assert.deepEqual(await new DeviceStore(file).load(),saved);}
 finally{await unlink(file).catch(()=>{});await rmdir(directory);}
});
test('offline result delivery retries saved output and never resamples on reconnect/restart',async()=>{
 let disk=null,runs=0,uploads=0;
 const deps={load:async()=>disk,infer:async()=>{runs++;disk={sha256:'genuine-saved-fixture'};},upload:async()=>{uploads++;if(uploads===1)throw new Error('network-offline');},fail:async()=>assert.fail('should retain running claim'),approved:async()=>{}};
 await assert.rejects(finishClaimed({id:'job'},deps),/network-offline/);
 await finishClaimed({id:'job'},{...deps,resumed:true});assert.equal(runs,1);assert.equal(uploads,2);
});
test('input transport retries after restart until inference marker, then preserves the exact result',async()=>{
 let disk=null,started=false,runs=0,prepares=0,uploads=0;
 const deps={load:async()=>disk,approved:async()=>{},canResumeInference:async()=>!started,
  prepare:async()=>{if(++prepares===1)throw new Error('network-offline');},
  infer:async()=>{started=true;runs++;disk={sha256:'reference-conditioned-result'};},
  upload:async()=>{uploads++;},fail:async()=>assert.fail('retryable transport must retain claim')};
 await assert.rejects(finishClaimed({id:'reference'},deps),/network-offline/);
 await finishClaimed({id:'reference'},{...deps,resumed:true});
 await finishClaimed({id:'reference'},{...deps,resumed:true});
 assert.equal(runs,1);assert.equal(prepares,2);assert.equal(uploads,2);
});
test('invalid references stop before inference and an attempted interrupted edit never repeats',async()=>{
 let failure;
 const deps={load:async()=>null,approved:async()=>{},canResumeInference:async()=>false,
  prepare:async()=>{throw new Error('invalid-reference');},infer:async()=>assert.fail('untrusted or repeated inference'),upload:async()=>assert.fail(),fail:async(_,error)=>{failure=error;}};
 await finishClaimed({id:'invalid-reference'},deps);assert.equal(failure,'invalid-reference');
 await finishClaimed({id:'attempted'},{...deps,resumed:true});assert.equal(failure,'interrupted');
});
test('interrupted claim, expired queue and revocation never start duplicate inference',async()=>{
 let failure;
 const deps={load:async()=>null,infer:async()=>assert.fail('must not resample'),upload:async()=>assert.fail('no output'),fail:async(_,error)=>{failure=error;},approved:async()=>{}};
 await finishClaimed({id:'interrupted'},{...deps,resumed:true});assert.equal(failure,'interrupted');
 await assert.rejects(finishClaimed({id:'revoked'},{...deps,approved:async()=>{throw new Error('device-not-approved');}}),/device-not-approved/);
 assert.equal(retryDelay(0),5000);assert.equal(retryDelay(99),120000);
});
test('deterministically corrupt result fails once while network failures remain recoverable',async()=>{
 let error;
 await finishClaimed({id:'corrupt'},{load:async()=>({}),approved:async()=>{},upload:async()=>{throw new Error('invalid-output');},infer:async()=>assert.fail(),fail:async(_,reason)=>{error=reason;}});
 assert.equal(error,'invalid-output');
});
test('stale PID reuse cannot block recovery or claim an unrelated process',()=>{
 const lock={pid:12,createdAt:'old-start'};
 assert.equal(lockMatches(lock,{createdAt:'old-start',worker:true}),true);
 assert.equal(lockMatches(lock,{createdAt:'new-start',worker:true}),false);
 assert.equal(lockMatches(lock,{createdAt:'old-start',worker:false}),false);
 assert.equal(lockMatches(12,{createdAt:'any',worker:false}),false);
 assert.equal(lockMatches(lock,null),false);
});
test('cancellation of the installed venv launcher also exits its real interpreter',{skip:process.platform!=='win32',timeout:10000},async()=>{
 const child=spawn('F:\\Workspace\\Support\\tools\\local-image-gen\\venv\\Scripts\\python.exe',['-B','-u','-c','import os,time; print(os.getpid(),flush=True); time.sleep(30)'],{windowsHide:true,stdio:['ignore','pipe','pipe']});
 let actual;const closed=new Promise((resolve,reject)=>{child.on('close',resolve);child.on('error',reject);});
 try{
  actual=await new Promise((resolve,reject)=>{let text='';child.stdout.on('data',chunk=>{text+=chunk;if(text.includes('\n'))resolve(Number(text.trim()));});child.on('error',reject);});
  assert.ok(Number.isInteger(actual)&&actual>0);assert.notEqual(actual,child.pid);
  child.kill();await closed;
  assert.throws(()=>process.kill(actual,0),error=>error.code==='ESRCH');
 }finally{if(child.exitCode===null&&child.signalCode===null)child.kill();}
});
