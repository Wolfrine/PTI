import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {weddingSeed} from './seed-record.mjs';

const {app,db}=createRequire(import.meta.url)('../../personal-functions/runtime.cjs');
const project='pti-app-2ab59',site='mahima-mayank-2027',uid='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const token=(await app.options.credential.getAccessToken()).access_token;
const report={project,site,database:'(default)',rulesUpdated:false,seeded:false,authDomainsReady:false,verifiedAt:null};
async function request(url,method='GET',data,allow404=false) {
  const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});
  if(allow404&&response.status===404)return null;
  const body=await response.json();
  if(!response.ok)throw Error(`${method} ${new URL(url).hostname}: ${response.status} ${body.error?.message||''}`);
  return body;
}
const digest=s=>createHash('sha256').update(s).digest('hex');
// Compare exact reviewed live predecessor; never overwrite an unknown concurrent rule release.
const database=await request(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`);
report.location=database.locationId;
const rulesApi=`https://firebaserules.googleapis.com/v1/projects/${project}`;
const releaseUrl=`${rulesApi}/releases/cloud.firestore`;
const release=await request(releaseUrl),old=await request(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`);
if(old.source?.files?.length!==1)throw Error('Unexpected live rules source. Inspect before provisioning wedding data.');
const source=await readFile('personal-harness/firestore.rules','utf8');
const baseline=JSON.parse(await readFile('wedding-planner/scripts/rules-baseline.json','utf8'));
const before=digest(old.source.files[0].content),after=digest(source);
if(before!==after && before!==baseline.sha256)throw Error('Live Firestore rules differ from the reviewed baseline. No rules or wedding data changed.');
report.previousRuleset=release.rulesetName;report.previousSourceHash=before;report.sourceHash=after;
if(before!==after) {
  const next=await request(`${rulesApi}/rulesets`,'POST',{source:{files:[{name:'firestore.rules',content:source}]}});
  const latest=await request(releaseUrl);
  if(latest.rulesetName!==release.rulesetName) {
    const concurrent=await request(`https://firebaserules.googleapis.com/v1/${latest.rulesetName}`);
    if(concurrent.source?.files?.length!==1||digest(concurrent.source.files[0].content)!==after)throw Error('Rules changed during verification. No release update attempted.');
  } else await request(releaseUrl,'PATCH',{release:{name:release.name,rulesetName:next.name},updateMask:'rulesetName'});
}
report.rulesUpdated=true;
const siteUrl=`https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites/${site}`;
if(!await request(siteUrl,'GET',undefined,true))await request(`https://firebasehosting.googleapis.com/v1beta1/projects/${project}/sites?siteId=${site}`,'POST',{});
const configUrl=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const google=await request(`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/defaultSupportedIdpConfigs/google.com`);
if(google.enabled!==true)throw Error('The existing Firebase Google sign-in provider is disabled. Enable it before family launch.');
report.googleProviderEnabled=true;
const config=await request(configUrl),domains=[...new Set([...(config.authorizedDomains||[]),`${site}.web.app`,`${site}.firebaseapp.com`])];
if(domains.length!==(config.authorizedDomains||[]).length)await request(configUrl+'?updateMask=authorizedDomains','PATCH',{authorizedDomains:domains});
report.authDomainsReady=true;
const root=db.doc(`users/${uid}/weddingData/workspace`);
const seed=weddingSeed(await readFile('wedding-planner/WEDDING_RECORD.md','utf8'));
await db.runTransaction(async tx=>{
  if((await tx.get(root)).exists)return; // An existing operational record always wins.
  const at=new Date().toISOString();
  tx.create(root,{schemaVersion:1,title:'Mahima & Mayank · Family',seedSource:'WEDDING_RECORD.md',seedSourceHash:seed.sourceHash,createdAt:at,ownerUid:uid});
  for(const collection of ['events','decisions'])for(const {id,...data} of seed[collection]) {
    tx.create(root.collection(collection).doc(id),{...data,revision:1,createdAt:at,createdBy:uid,updatedAt:at,updatedBy:uid,archived:false,lastChangeId:'initial-record-import'});
  }
  report.seeded=true;
});
report.verifiedAt=new Date().toISOString();
report.liveGooglePopupVerified=false;
await writeFile('wedding-activation-report.json',JSON.stringify(report,null,2));
console.log('Wedding Hosting identity, protected shared workspace and Google sign-in domains ready. Existing wedding records preserved.');
