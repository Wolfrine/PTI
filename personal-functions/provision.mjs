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
// Last entry is the reviewed OAuth-isolated rules in commit 3c4f30a, before adding owner-readable reflections.
// Reviewed Morsel owner-only baseline from 63260adc.
const approvedPrevious=new Set(['3075107d79eb458b543c467b2acfd91541a2c76e48dbffe3b6531cdca38c031b','44c427751ccb98cde0fc8cad8f02e4445ce3e856c81087a202c1d49363eaa5f4','00e383c39716729a89dca55839ec3503da4cc4cbd3f191560d78c356bb53dc2a','5c3cd9cdff141cf9a1536311cb16c68d0742c32b5d8df86878bcc7292b4fc442']);
// Reviewed owner-only Venture baseline, PTI f40ee229. Only Venture's isolated block changes.
approvedPrevious.add('72111fbf34b5575a8b42ec434ba732dc80558086fee0d7cf0defdcfe9f3fd38a');
// Reviewed pre-tracker live rules from 7ddac78; allows the tracker owner-only block to layer onto that exact deployed predecessor.
approvedPrevious.add('23cc6d79329cafe835d1de837350b1ee5a539a471d1813f24b29b7c958b6893e');
if(process.env.APPROVED_PREVIOUS_RULES_FILE){
 const approvedSource=await readFile(process.env.APPROVED_PREVIOUS_RULES_FILE,'utf8');
 approvedPrevious.add(digest(approvedSource));
}
if(priorHash!==targetHash&&!approvedPrevious.has(priorHash))throw new Error('Live rules changed since review. Refusing to overwrite another change.');
const report={project,database:'(default)',namespace:'users/{uid}/personalData/workspace',location:db.locationId,previousRuleset:release.rulesetName,previousSourceHash:priorHash,sourceHash:targetHash,checkedAt:new Date().toISOString(),databaseCreated:false};
await writeFile('personal-activation-report.json',JSON.stringify(report,null,2));
if(priorHash!==targetHash){
 const ruleset=await request(`${api}/projects/${project}/rulesets`,'POST',{source:{files:[{name:'firestore.rules',content:source}]}});
 const latest=await request(releaseUrl);
 if(latest.rulesetName!==release.rulesetName)throw new Error('Rule release changed during verification; no release update attempted.');
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
