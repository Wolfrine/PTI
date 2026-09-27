import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const {app}=createRequire(import.meta.url)('./runtime.cjs');
const project='pti-app-2ab59';const token=(await app.options.credential.getAccessToken()).access_token;
async function request(url,method='GET',data){const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const body=await r.json();if(!r.ok){const e=new Error(`${method} ${new URL(url).hostname}: ${r.status} ${body.error?.message||''}`);e.status=r.status;throw e;}return body;}
const base=`https://firestore.googleapis.com/v1/projects/${project}/databases`;
const original=await request(`${base}/(default)`);
const required=['datastore.databases.create','datastore.databases.get','datastore.entities.get','datastore.entities.list','datastore.entities.create','datastore.entities.update','datastore.entities.delete','firebaseauth.configs.get','firebaseauth.configs.update','firebaseauth.users.create','firebaseauth.users.delete','cloudfunctions.functions.create','firebasehosting.sites.create','firebaserules.rulesets.create','firebaserules.releases.create','firebaserules.releases.update'];
let granted=null;
try{granted=(await request(`https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`,'POST',{permissions:required})).permissions||[];}catch(e){console.log('Permission introspection unavailable:',e.status);}
const report={project,database:'personal',mode:'FIRESTORE_NATIVE',location:original.locationId,requiredPermissions:required,missingPermissions:granted?required.filter(p=>!granted.includes(p)):null,checkedAt:new Date().toISOString()};
await writeFile('personal-activation-report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
try{await request(`${base}/personal`);console.log('Personal database already exists.');}catch(e){
 if(e.status!==404)throw e;
 if(!granted?.includes('datastore.databases.create'))throw new Error(`Owner action required: create Native-mode Firestore database 'personal' in '${original.locationId}' in project '${project}'. The current deployment credential cannot create it. No alternate credential or shared-database fallback was attempted.`);
 const op=await request(`${base}?databaseId=personal`,'POST',{locationId:original.locationId,type:'FIRESTORE_NATIVE',deleteProtectionState:'DELETE_PROTECTION_ENABLED'});let done=op.done;
 for(let i=0;!done&&i<60;i++){await new Promise(r=>setTimeout(r,2000));const status=await request(`https://firestore.googleapis.com/v1/${op.name}`);if(status.error)throw new Error(status.error.message);done=status.done;}
 if(!done)throw new Error('Database creation timed out.');
 console.log('Created isolated Personal database in the existing project location.');
}
const configUrl=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const config=await request(configUrl);const domains=[...new Set([...(config.authorizedDomains||[]),'pti-app-2ab59-personal.web.app','pti-app-2ab59-personal.firebaseapp.com'])];
if(domains.length!==(config.authorizedDomains||[]).length)await request(configUrl+'?updateMask=authorizedDomains','PATCH',{authorizedDomains:domains});
console.log('Personal sign-in domains authorised; existing domains preserved.');
