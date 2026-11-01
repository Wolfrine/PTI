import {pathToFileURL} from 'node:url';
import {firebaseConfig} from '../../../food-app/firebase-config.mjs';
export const morselReferrer='https://pti-app-2ab59-morsel.web.app/*';
const prefix='projects/185802494856/locations/global/keys/';
const stable=v=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b))):x);
export function validateBrowserKey(key){
 const r=key.restrictions,refs=r?.browserKeyRestrictions?.allowedReferrers;
 if(!key.name?.startsWith(prefix)||key.name.endsWith('/pti-native-firebase-auth')||!key.etag||!Array.isArray(refs)||!refs.length||Object.keys(r).some(k=>!['browserKeyRestrictions','apiTargets'].includes(k))||Object.keys(r.browserKeyRestrictions).some(k=>k!=='allowedReferrers'))throw Error('Unexpected browser key identity/restrictions; refusing to widen or replace a key.');
 const targets=r.apiTargets||[];
 if(targets.length&&['identitytoolkit.googleapis.com','securetoken.googleapis.com'].some(service=>!targets.some(t=>t.service===service&&!t.methods?.length)))throw Error('Existing browser key lacks Firebase Auth API targets; source-key selection requires review. API scope unchanged.');
}
export async function configureMorselAuth({accessToken,fetchImpl=fetch,pause=ms=>new Promise(r=>setTimeout(r,ms)),publicKey=firebaseConfig.apiKey}){
 if(!accessToken)throw Error('Use the existing release identity; no alternate credential is accepted.');
 const call=async(resource,options={},operation='apikeys.keys.get')=>{
  const response=await fetchImpl('https://apikeys.googleapis.com/v2/'+resource,{...options,redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:'Bearer '+accessToken,'Content-Type':'application/json'}});
  if(!response.ok){await response.body?.cancel();throw Error(`${operation} returned HTTP ${response.status}. No IAM change made; release identity needs that operation on the existing browser key.`);}return response.json();
 };
 const lookup=await call('keys:lookupKey?keyString='+encodeURIComponent(publicKey),{},'apikeys.keys.lookup');
 if(!lookup.name?.startsWith(prefix))throw Error('Source browser key is outside the authorized project.');
 const before=await call(lookup.name);validateBrowserKey(before);
 const original=structuredClone(before.restrictions),refs=original.browserKeyRestrictions.allowedReferrers,required=[...refs];
 if(!required.includes(morselReferrer))required.push(morselReferrer);let changed=false;
 if(required.length!==refs.length){
  const latest=await call(before.name);if(latest.etag!==before.etag||stable(latest.restrictions)!==stable(original))throw Error('Browser key changed during inspection; no update made. Rerun against the current configuration.');
  const restrictions={...original,browserKeyRestrictions:{allowedReferrers:required}};
  let op=await call(before.name+'?updateMask=restrictions',{method:'PATCH',body:JSON.stringify({name:before.name,etag:before.etag,restrictions})},'apikeys.keys.update');
  for(let i=0;!op.done&&i<60;i++){
   if(!/^operations\/[A-Za-z0-9._-]+$/.test(op.name||''))throw Error('Unexpected key update operation.');await pause(1000);op=await call(op.name,{},'apikeys.operations.get');
  }
  if(!op.done||op.error)throw Error('Browser key update not confirmed. Read back the existing key; do not replace it.');changed=true;
 }
 const verified=await call(before.name);validateBrowserKey(verified);
 if(stable(verified.restrictions.apiTargets||[])!==stable(original.apiTargets||[])||stable([...verified.restrictions.browserKeyRestrictions.allowedReferrers].sort())!==stable([...required].sort()))throw Error('Browser-key readback differs from the exact scoped update.');
 let accepted=false,status;
 for(let i=0;i<12;i++){
  const response=await fetchImpl('https://securetoken.googleapis.com/v1/token?key='+encodeURIComponent(publicKey),{method:'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{'Content-Type':'application/x-www-form-urlencoded',Referer:'https://pti-app-2ab59-morsel.web.app/'},body:new URLSearchParams({grant_type:'refresh_token',refresh_token:'morsel-referrer-probe-invalid'})});
  status=response.status;const body=await response.json();accepted=status===400&&['INVALID_REFRESH_TOKEN','INVALID_GRANT'].includes(body.error?.message);
  if(accepted)break;if(i<11)await pause(5000);
 }
 if(!accepted)throw Error(`Morsel browser-origin Firebase Auth probe failed (HTTP ${status}). Referrer configuration is not accepted.`);
 return {keyResource:before.name,changed,addedReferrerCount:required.length-refs.length,preservedReferrerCount:refs.length,apiTargetsUnchanged:true,probe:'Morsel Referer reached Firebase; invalid refresh credential rejected as expected',ownerBrowserLoginVerified:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){try{console.log(JSON.stringify(await configureMorselAuth({accessToken:process.env.ACCESS_TOKEN})));}catch(error){console.error(error.message);process.exitCode=1;}}
