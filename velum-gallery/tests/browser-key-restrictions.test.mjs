import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPtiReferrers,verifyBrowserRestrictions,PTI_REFERRERS,probeBrowserAuth} from '../scripts/browser-key-restrictions.mjs';
const existing={browserKeyRestrictions:{allowedReferrers:['https://pti-app-2ab59-velum.web.app/*','https://docs.google.com/*','https://existing.example/*']},apiTargets:[{service:'picker.googleapis.com'},{service:'identitytoolkit.googleapis.com',methods:['SignInWithIdp']}]};
test('appends only exact PTI origins, preserves all restrictions and is idempotent',()=>{
 const before=structuredClone(existing),first=appendPtiReferrers(existing),second=appendPtiReferrers(first.restrictions);
 assert.deepEqual(existing,before);assert.deepEqual(first.additions,PTI_REFERRERS);
 assert.deepEqual(first.restrictions.apiTargets,existing.apiTargets);
 assert.deepEqual(first.restrictions.browserKeyRestrictions.allowedReferrers,[...existing.browserKeyRestrictions.allowedReferrers,...PTI_REFERRERS]);
 assert.deepEqual(second.restrictions,first.restrictions);assert.deepEqual(second.additions,[]);
 assert.throws(()=>appendPtiReferrers({apiTargets:existing.apiTargets}),/refusing/);
});
test('readback rejects missing or broadened referrers, targets and method restrictions',()=>{
 const {restrictions}=appendPtiReferrers(existing);verifyBrowserRestrictions(restrictions,structuredClone(restrictions));
 const reordered=structuredClone(restrictions);reordered.apiTargets.reverse();reordered.browserKeyRestrictions.allowedReferrers.reverse();verifyBrowserRestrictions(restrictions,reordered);
 for(const change of [v=>v.browserKeyRestrictions.allowedReferrers.pop(),v=>v.browserKeyRestrictions.allowedReferrers.push('https://*'),v=>v.apiTargets.push({service:'extra.googleapis.com'}),v=>delete v.apiTargets[1].methods]){
  const actual=structuredClone(restrictions);change(actual);assert.throws(()=>verifyBrowserRestrictions(restrictions,actual),/readback differs/);
 }
});
test('browser probes explicitly test both PTI origins and Velum on both endpoints',async()=>{
 const requests=[];
 const results=await probeBrowserAuth('fixture-browser-key',{fetchImpl:async(url,options)=>{
  requests.push({url,options});const message=url.includes('identitytoolkit')?'INVALID_IDP_RESPONSE : invalid token':'INVALID_REFRESH_TOKEN';return new Response(JSON.stringify({error:{message}}),{status:400});
 }});
 assert.equal(results.length,6);assert.deepEqual([...new Set(results.map(item=>item.origin))],['https://pti-app-2ab59.web.app/','https://pti-app-2ab59.firebaseapp.com/','https://pti-app-2ab59-velum.web.app/']);
 assert(requests.every(({options})=>new Headers(options.headers).get('Referer')?.startsWith('https://pti-app-2ab59')));
 await assert.rejects(probeBrowserAuth('fixture-browser-key',{fetchImpl:async()=>new Response(JSON.stringify({error:{message:'API_KEY_HTTP_REFERRER_BLOCKED'}}),{status:403})}),/HTTP 403/);
});
