// Explicit, reviewed publication of the shared Firestore policy. Never run from Hosting.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';

const reviewed=process.env.REVIEWED_LIVE_RULESET;
if(!reviewed||!/^projects\/pti-app-2ab59\/rulesets\/[A-Za-z0-9_-]+$/.test(reviewed))throw new Error('Supply the exact live ruleset name reviewed before this release.');
const scope=process.env.PTI_RULES_RELEASE_SCOPE || 'shared';
if(!['shared','finance'].includes(scope))throw new Error('Unknown shared rules release scope.');
const require=createRequire(new URL('../tools/pti-mcp/package.json',import.meta.url));
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const app=initializeApp({credential:applicationDefault(),projectId:'pti-app-2ab59'});
const project='pti-app-2ab59',api='https://firebaserules.googleapis.com/v1';
const token=(await app.options.credential.getAccessToken()).access_token;
async function request(url,method='GET',data){
 const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});
 const body=await response.json();
 if(!response.ok)throw new Error(`${method} ${new URL(url).hostname}: ${response.status} ${body.error?.message||''}`);
 return body;
}
const source=await readFile('personal-harness/firestore.rules','utf8');
const releaseUrl=`${api}/projects/${project}/releases/cloud.firestore`;
const release=await request(releaseUrl);
if(release.rulesetName!==reviewed)throw new Error('Production policy changed after review; no update made.');
const live=await request(`${api}/${release.rulesetName}`);
if(live.source?.files?.length!==1)throw new Error('Unexpected multi-file production rules; review this rules release.');
const current=live.source.files[0].content;
const target=scope==='finance'?financeOnly(current,source):source;
if(current===target){
 console.log('Shared Firestore policy is already live.');
}else{
 const next=await request(`${api}/projects/${project}/rulesets`,'POST',{source:{files:[{name:'firestore.rules',content:target}]}});
 if((await request(releaseUrl)).rulesetName!==release.rulesetName)throw new Error('Rules changed while preparing this release; no update made.');
 await request(releaseUrl,'PATCH',{release:{name:release.name,rulesetName:next.name},updateMask:'rulesetName'});
 if((await request(releaseUrl)).rulesetName!==next.name)throw new Error('Shared rules release readback did not match the published ruleset.');
 console.log(`Published Firestore policy (${scope}) ${next.name}.`);
}

function financeOnly(current,source){
 const start='  // Finance audit, envelopes and writes are reserved for the verified owner service.';
 const end='  // Private Studio drafts, reference inputs, thumbnails and explicit Drive save receipts.';
 const finance="collection != 'financeData' && ";
 const adjacent="collection != 'foodData' && collection != 'ventureData'";
 const scoped="collection != 'foodData' && "+finance+"collection != 'ventureData'";
 function unique(content,marker){
  const index=content.indexOf(marker);
  if(index<0||index!==content.lastIndexOf(marker))throw new Error('Finance or neighboring rule markers changed. Review the live policy before publication.');
  return index;
 }
 const canonical=source.replace(/\r\n/g,'\n');
 const startAt=unique(canonical,start);
 const endAt=unique(canonical,end);
 unique(canonical,scoped);
 if(startAt>=endAt)throw new Error('Invalid Finance rule block order.');
 const block=canonical.slice(startAt,endAt);
 const liveEnd=unique(current,end);
 if(current.includes(start)){
  const liveStart=unique(current,start);
  unique(current,scoped);
  if(liveStart>=liveEnd)throw new Error('Invalid live Finance rule block order.');
  return current.slice(0,liveStart)+block+current.slice(liveEnd);
 }
 unique(current,adjacent);
 if(current.includes(finance))throw new Error('Unexpected partial Finance rule. Review the live policy before publication.');
 return (current.slice(0,liveEnd)+block+current.slice(liveEnd)).replace(adjacent,scoped);
}
