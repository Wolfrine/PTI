import test from 'node:test';
import assert from 'node:assert/strict';
import {appendPtiReferrers,verifyBrowserRestrictions,PTI_REFERRERS,ONE_PIECE_REFERRERS,probeBrowserAuth} from '../scripts/browser-key-restrictions.mjs';
const existing={browserKeyRestrictions:{allowedReferrers:['https://pti-app-2ab59-velum.web.app/*','https://docs.google.com/*','https://existing.example/*']},apiTargets:[{service:'picker.googleapis.com'},{service:'identitytoolkit.googleapis.com',methods:['SignInWithIdp']}]};
test('appends only exact PTI and One Piece origins, preserves all restrictions and is idempotent',()=>{
 const before=structuredClone(existing),first=appendPtiReferrers(existing),second=appendPtiReferrers(first.restrictions);
 assert.deepEqual(existing,before);assert.deepEqual(first.additions,PTI_REFERRERS);
 assert.deepEqual(first.restrictions.apiTargets,existing.apiTargets);
 assert.deepEqual(first.restrictions.browserKeyRestrictions.allowedReferrers,[...existing.browserKeyRestrictions.allowedReferrers,...PTI_REFERRERS]);
 assert.deepEqual(second.restrictions,first.restrictions);assert.deepEqual(second.additions,[]);
 assert.throws(()=>appendPtiReferrers({apiTargets:existing.apiTargets}),/refusing/);
});
test('repairs a key that already permits PTI by adding only both One Piece hosts',()=>{
 const before={...structuredClone(existing),browserKeyRestrictions:{allowedReferrers:[...existing.browserKeyRestrictions.allowedReferrers,'https://pti-app-2ab59.web.app/*','https://pti-app-2ab59.firebaseapp.com/*']}};
 const snapshot=structuredClone(before),result=appendPtiReferrers(before);
 assert.deepEqual(result.additions,['https://pti-app-2ab59-one-piece.web.app/*','https://pti-app-2ab59-one-piece.firebaseapp.com/*']);
 assert.deepEqual(result.additions,ONE_PIECE_REFERRERS);
 assert.deepEqual(before,snapshot);
 assert.deepEqual(result.restrictions.apiTargets,before.apiTargets);
 assert.deepEqual(result.restrictions.browserKeyRestrictions.allowedReferrers,[...before.browserKeyRestrictions.allowedReferrers,...result.additions]);
});
test('readback rejects missing or broadened referrers, targets and method restrictions',()=>{
 const {restrictions}=appendPtiReferrers(existing);verifyBrowserRestrictions(restrictions,structuredClone(restrictions));
 const reordered=structuredClone(restrictions);reordered.apiTargets.reverse();reordered.browserKeyRestrictions.allowedReferrers.reverse();verifyBrowserRestrictions(restrictions,reordered);
 for(const change of [v=>v.browserKeyRestrictions.allowedReferrers.pop(),v=>v.browserKeyRestrictions.allowedReferrers.push('https://*'),v=>v.apiTargets.push({service:'extra.googleapis.com'}),v=>delete v.apiTargets[1].methods]){
  const actual=structuredClone(restrictions);change(actual);assert.throws(()=>verifyBrowserRestrictions(restrictions,actual),/readback differs/);
 }
});
test('browser probes test both One Piece and PTI hosts plus Velum on sign-in and renewal endpoints',async()=>{
 const requests=[];
 const results=await probeBrowserAuth('fixture-browser-key',{fetchImpl:async(url,options)=>{
  requests.push({url,options});const message=url.includes('identitytoolkit')?'INVALID_IDP_RESPONSE : invalid token':'INVALID_REFRESH_TOKEN';return new Response(JSON.stringify({error:{message}}),{status:400});
 }});
 assert.equal(results.length,10);assert.deepEqual([...new Set(results.map(item=>item.origin))],['https://pti-app-2ab59.web.app/','https://pti-app-2ab59.firebaseapp.com/','https://pti-app-2ab59-one-piece.web.app/','https://pti-app-2ab59-one-piece.firebaseapp.com/','https://pti-app-2ab59-velum.web.app/']);
 assert(requests.every(({options})=>new Headers(options.headers).get('Referer')?.startsWith('https://pti-app-2ab59')));
 await assert.rejects(probeBrowserAuth('fixture-browser-key',{fetchImpl:async()=>new Response(JSON.stringify({error:{message:'API_KEY_HTTP_REFERRER_BLOCKED'}}),{status:403})}),/HTTP 403/);
});
test('a One Piece-only sign-in or renewal denial fails the shared release probe',async()=>{
 for(const blockedOrigin of ONE_PIECE_REFERRERS.map(value=>value.slice(0,-1))){
  for(const blockedEndpoint of ['identitytoolkit','securetoken']){
   await assert.rejects(probeBrowserAuth('fixture-browser-key',{fetchImpl:async(url,options)=>{
    const endpoint=url.includes('identitytoolkit')?'identitytoolkit':'securetoken';
    const denied=options.headers.Referer===blockedOrigin&&endpoint===blockedEndpoint;
    return new Response(JSON.stringify({error:{message:denied?'API_KEY_HTTP_REFERRER_BLOCKED':endpoint==='identitytoolkit'?'INVALID_IDP_RESPONSE':'INVALID_REFRESH_TOKEN'}}),{status:denied?403:400});
   }}),error=>error.message.includes(blockedOrigin)&&error.message.includes(blockedEndpoint)&&error.message.includes('HTTP 403'));
  }
 }
});
