// Explicit, reviewed publication of the shared Firestore policy. Never run from Hosting.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';

const reviewed=process.env.REVIEWED_LIVE_RULESET;
if(!reviewed||!/^projects\/pti-app-2ab59\/rulesets\/[A-Za-z0-9_-]+$/.test(reviewed))throw new Error('Supply the exact live ruleset name reviewed before this release.');
const {app}=createRequire(import.meta.url)('./runtime.cjs');
const project='pti-app-2ab59',api='https://firebaserules.googleapis.com/v1';
const token=(await app.options.credential.getAccessToken()).access_token;
async function request(url,method='GET',data){
 const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});
 const body=await response.json();
 if(!response.ok)throw new Error(`${method} ${new URL(url).hostname}: ${response.status} ${body.error?.message||''}`);
 return body;
}
const target=await readFile('personal-harness/firestore.rules','utf8');
const releaseUrl=`${api}/projects/${project}/releases/cloud.firestore`;
const release=await request(releaseUrl);
if(release.rulesetName!==reviewed)throw new Error('Production policy changed after review; no update made.');
const live=await request(`${api}/${release.rulesetName}`);
if(live.source?.files?.length!==1)throw new Error('Unexpected multi-file production rules; review this rules release.');
if(live.source.files[0].content===target){
 console.log('Shared Firestore policy is already live.');
}else{
 const next=await request(`${api}/projects/${project}/rulesets`,'POST',{source:{files:[{name:'firestore.rules',content:target}]}});
 if((await request(releaseUrl)).rulesetName!==release.rulesetName)throw new Error('Rules changed while preparing this release; no update made.');
 await request(releaseUrl,'PATCH',{release:{name:release.name,rulesetName:next.name},updateMask:'rulesetName'});
 if((await request(releaseUrl)).rulesetName!==next.name)throw new Error('Shared rules release readback did not match the published ruleset.');
 console.log('Published shared Firestore policy; other Hosting and MCP releases are independent.');
}
