import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {runnable,encode,decode,imagePayload} from './core.mjs';
import {makeJob} from '../../velum-gallery/studio-contract.mjs';
import {refreshSession,OWNER_UID,PROJECT,pairingPage,pairOwner} from './session.mjs';
const input={model:'flux2-klein-fp8',prompt:'  Sheer silk study\nFictional consenting adult.  ',seed:123,consent:true};
test('worker preserves raw words and refuses expired or already-claimed work',()=>{
 const job=makeJob(input,1000);assert.equal(runnable(job,2000),true);assert.equal(job.prompt,input.prompt);
 assert.equal(runnable(job,902000),false);assert.equal(runnable({...job,status:'running'},2000),false);
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
test('separate session validates actual owner/project and never asks for Drive scopes',async()=>{
 const value={user_id:OWNER_UID,project_id:PROJECT,id_token:'fixture-owner-id-token',refresh_token:'fixture-refreshed-session',expires_in:'3600'};
 const response=data=>async()=>({ok:true,json:async()=>data});
 const session=await refreshSession('fixture-only-refresh-token',response(value));assert.equal(session.idToken,value.id_token);
 await assert.rejects(refreshSession('fixture-only-refresh-token',response({...value,user_id:'other'})),/owner-account-required/);
 await assert.rejects(refreshSession('fixture-only-refresh-token',response({...value,project_id:'other'})),/owner-account-required/);
 await assert.rejects(refreshSession('fixture-only-refresh-token',response({...value,expires_in:'invalid'})),/owner-account-required/);
 assert.doesNotMatch(pairingPage(),/drive\.readonly|localStorage|credential\.json|codex-usage-monitor/);
 assert.match(pairingPage(),/inMemoryPersistence/);
});
test('loopback pairing rejects wrong paths and cross-origin submissions, then expires',async()=>{
 let ready;const urlReady=new Promise(resolve=>{ready=resolve;});
 const pairing=pairOwner({onUrl:ready,timeoutMs:1000});
 const expired=assert.rejects(pairing,/owner-login-required/);
 const url=await urlReady;
 const page=await fetch(url);assert.equal(page.status,200);assert.match(await page.text(),/Sign in to PTI/);
 const wrong=await fetch(`${url}-wrong`);assert.equal(wrong.status,404);await wrong.body.cancel();
 const crossOrigin=await fetch(url,{method:'POST',headers:{Origin:'https://untrusted.invalid','X-Velum-Pair':'1','Content-Type':'application/json'},body:'{}'});
 assert.equal(crossOrigin.status,403);await crossOrigin.body.cancel();
 await expired;
});
