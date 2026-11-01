import {test} from 'node:test';
import assert from 'node:assert/strict';
import {configureMorselAuth,morselReferrer} from './configure-morsel-auth.mjs';
const response=(status,data)=>new Response(JSON.stringify(data),{status});
function fixture(patch={}){
 let key={name:'projects/185802494856/locations/global/keys/synthetic-browser',etag:'one',restrictions:{browserKeyRestrictions:{allowedReferrers:['https://existing.example/*']},apiTargets:[{service:'identitytoolkit.googleapis.com'},{service:'securetoken.googleapis.com'},{service:'another.googleapis.com',methods:['read']}]},...patch};const calls=[];
 return {calls,fetchImpl:async(url,options)=>{
  calls.push({url,options});
  if(url.includes('securetoken')){assert.equal(options.headers.Referer,'https://pti-app-2ab59-morsel.web.app/');assert.equal(options.headers.Authorization,undefined);return response(400,{error:{message:'INVALID_REFRESH_TOKEN'}});}
  if(url.includes('lookupKey'))return response(200,{name:key.name});
  if(options.method==='PATCH'){const next=JSON.parse(options.body);assert.equal(next.etag,key.etag);key={...key,...next,etag:'two'};return response(200,{name:'operations/synthetic',done:true});}
  return response(200,structuredClone(key));
 }};
}
test('adds only Morsel referrer with etag and retains all API targets/referrers',async()=>{
 const f=fixture(),result=await configureMorselAuth({accessToken:'synthetic',publicKey:'synthetic-public-key',...f});assert.equal(result.changed,true);
 const patch=JSON.parse(f.calls.find(c=>c.options.method==='PATCH').options.body);assert.deepEqual(patch.restrictions.browserKeyRestrictions.allowedReferrers,['https://existing.example/*',morselReferrer]);assert.equal(patch.restrictions.apiTargets.length,3);assert.equal(result.apiTargetsUnchanged,true);
});
test('an existing exact restriction is verified without mutation',async()=>{
 const f=fixture({restrictions:{browserKeyRestrictions:{allowedReferrers:[morselReferrer]},apiTargets:[{service:'identitytoolkit.googleapis.com'},{service:'securetoken.googleapis.com'}]}});assert.equal((await configureMorselAuth({accessToken:'synthetic',...f})).changed,false);assert(!f.calls.some(c=>c.options.method==='PATCH'));
});
test('native, unrestricted, foreign, incompatible keys and permission denial fail closed',async()=>{
 for(const patch of [{name:'projects/185802494856/locations/global/keys/pti-native-firebase-auth'},{name:'projects/other/locations/global/keys/key'},{restrictions:{apiTargets:[]}},{restrictions:{browserKeyRestrictions:{allowedReferrers:['https://existing.example/*']},apiTargets:[{service:'drive.googleapis.com'}]}}]){const f=fixture(patch);await assert.rejects(configureMorselAuth({accessToken:'synthetic',...f}));assert(!f.calls.some(c=>c.options.method==='PATCH'));}
 await assert.rejects(configureMorselAuth({accessToken:'synthetic',fetchImpl:async()=>response(403,{})}),/apikeys.keys.lookup returned HTTP 403/);
});
test('concurrent changes and failed origin probes are not accepted',async()=>{
 const f=fixture();let reads=0;await assert.rejects(configureMorselAuth({accessToken:'synthetic',pause:async()=>{},fetchImpl:async(url,options)=>{const r=await f.fetchImpl(url,options);if(!url.includes('lookup')&&!options.method&&++reads===2){const d=await r.json();d.etag='changed';return response(200,d);}return r;}}),/changed during/);
 const g=fixture();await assert.rejects(configureMorselAuth({accessToken:'synthetic',pause:async()=>{},fetchImpl:(url,o)=>url.includes('securetoken')?Promise.resolve(response(403,{error:{message:'blocked'}})):g.fetchImpl(url,o)}),/probe failed/);
});
