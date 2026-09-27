import {createRequire} from 'node:module';
const {app}=createRequire(import.meta.url)('./runtime.cjs');
const project='pti-app-2ab59';const token=(await app.options.credential.getAccessToken()).access_token;
async function request(url,method='GET',data){const r=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined});const body=await r.json();if(!r.ok){const e=new Error(`${method} ${new URL(url).hostname}: ${r.status} ${body.error?.message||''}`);e.status=r.status;throw e;}return body;}
const base=`https://firestore.googleapis.com/v1/projects/${project}/databases`;
try{await request(`${base}/personal`);console.log('Personal database already exists.');}catch(e){if(e.status!==404)throw e;const original=await request(`${base}/(default)`);const op=await request(`${base}?databaseId=personal`,'POST',{locationId:original.locationId,type:'FIRESTORE_NATIVE',deleteProtectionState:'DELETE_PROTECTION_ENABLED'});let done=op.done;for(let i=0;!done&&i<60;i++){await new Promise(r=>setTimeout(r,2000));const status=await request(`https://firestore.googleapis.com/v1/${op.name}`);if(status.error)throw new Error(status.error.message);done=status.done;}if(!done)throw new Error('Database creation timed out.');console.log('Created isolated Personal database in the existing project location.');}
const configUrl=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const config=await request(configUrl);const domains=[...new Set([...(config.authorizedDomains||[]),'pti-app-2ab59-personal.web.app','pti-app-2ab59-personal.firebaseapp.com'])];
if(domains.length!==(config.authorizedDomains||[]).length)await request(configUrl+'?updateMask=authorizedDomains','PATCH',{authorizedDomains:domains});
console.log('Personal sign-in domains authorised; existing domains preserved.');
