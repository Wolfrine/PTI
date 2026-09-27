import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const {app}=createRequire(import.meta.url)('./runtime.cjs');
const project='pti-app-2ab59', api='https://firebaserules.googleapis.com/v1';
const token=(await app.options.credential.getAccessToken()).access_token;
async function request(url,method='GET',data){
 const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});
 const body=await r.json();if(!r.ok)throw new Error(`${method} ${new URL(url).hostname}: ${r.status} ${body.error?.message||''}`);return body;
}
const digest=s=>createHash('sha256').update(s).digest('hex');
const db=await request(`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)`);
const releaseUrl=`${api}/projects/${project}/releases/cloud.firestore`;
const release=await request(releaseUrl), old=await request(`${api}/${release.rulesetName}`);
const source=await readFile('personal-harness/firestore.rules','utf8');
const previous=old.source?.files;
if(previous?.length!==1)throw new Error('Unexpected multi-file live rules; inspect before updating.');
const priorHash=digest(previous[0].content),targetHash=digest(source);
const approvedPrevious='00e383c39716729a89dca55839ec3503da4cc4cbd3f191560d78c356bb53dc2a';
if(priorHash!==targetHash&&priorHash!==approvedPrevious)throw new Error('Live rules changed since review. Refusing to overwrite another change.');
const report={project,database:'(default)',namespace:'users/{uid}/personalData/workspace',location:db.locationId,previousRuleset:release.rulesetName,previousSourceHash:priorHash,sourceHash:targetHash,checkedAt:new Date().toISOString(),databaseCreated:false};
await writeFile('personal-activation-report.json',JSON.stringify(report,null,2));
if(priorHash!==targetHash){
 const ruleset=await request(`${api}/projects/${project}/rulesets`,'POST',{source:{files:[{name:'firestore.rules',content:source}]}});
 const latest=await request(releaseUrl);
 if(latest.rulesetName!==release.rulesetName)throw new Error('Rule release changed during verification; no release update attempted.');
 // Update the EXISTING release; do not request releases.create or databases.create.
 await request(releaseUrl,'PATCH',{release:{name:release.name,rulesetName:ruleset.name},updateMask:'rulesetName'});
 report.ruleset=ruleset.name;
}else report.ruleset=release.rulesetName;
const configUrl=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const config=await request(configUrl);
const domains=[...new Set([...(config.authorizedDomains||[]),'pti-app-2ab59-personal.web.app','pti-app-2ab59-personal.firebaseapp.com'])];
if(domains.length!==(config.authorizedDomains||[]).length)await request(configUrl+'?updateMask=authorizedDomains','PATCH',{authorizedDomains:domains});
report.rulesUpdated=true;report.authDomainsReady=true;
await writeFile('personal-activation-report.json',JSON.stringify(report,null,2));
console.log('Existing default Firestore rules and sign-in domains ready. No database, billing plan, or unrelated data changed.');
