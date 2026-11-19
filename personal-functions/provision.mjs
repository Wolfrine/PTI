// Hosting bootstrap only. Firestore rules have their own release workflow.
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
const {app}=createRequire(import.meta.url)('./runtime.cjs');
const project='pti-app-2ab59';
const token=(await app.options.credential.getAccessToken()).access_token;
async function request(url,method='GET',data){
 const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000)});
 const body=await response.json();
 if(!response.ok)throw new Error(`${method} ${new URL(url).hostname}: ${response.status} ${body.error?.message||''}`);
 return body;
}
const configUrl=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const config=await request(configUrl);
const domains=[...new Set([...(config.authorizedDomains||[]),'pti-app-2ab59-personal.web.app','pti-app-2ab59-personal.firebaseapp.com'])];
if(domains.length!==(config.authorizedDomains||[]).length)await request(configUrl+'?updateMask=authorizedDomains','PATCH',{authorizedDomains:domains});
await writeFile('personal-activation-report.json',JSON.stringify({project,database:'(default)',namespace:'users/{uid}/personalData/workspace',checkedAt:new Date().toISOString(),databaseCreated:false,authDomainsReady:true},null,2));
console.log('Existing Personal sign-in domains ready; Firestore rules left unchanged.');
