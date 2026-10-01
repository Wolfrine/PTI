import {createRequire} from 'node:module';
const require=createRequire(new URL('../../personal-functions/runtime.cjs',import.meta.url));
const {GoogleAuth}=require('google-auth-library');
const project=process.env.FIREBASE_PROJECT_ID||'pti-app-2ab59';
const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/cloud-platform']});
const client=await auth.getClient(),token=await client.getAccessToken(),accessToken=typeof token==='string'?token:token?.token;
if(!accessToken)throw new Error('Deployment identity is missing.');
const base=`https://identitytoolkit.googleapis.com/admin/v2/projects/${project}/config`;
const headers={Authorization:'Bearer '+accessToken,'Content-Type':'application/json'};
async function request(method='GET',body){const response=await fetch(base+(method==='PATCH'?'?updateMask=authorizedDomains':''),{method,headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});if(!response.ok)throw new Error('Firebase Auth domain configuration failed: '+response.status);return response.json();}
const required=['pti-app-2ab59-morsel.web.app','pti-app-2ab59-morsel.firebaseapp.com'];
const config=await request();
if(required.some(d=>!config.authorizedDomains.includes(d)))await request('PATCH',{authorizedDomains:[...new Set([...config.authorizedDomains,...required])]});
const verified=await request();
if(required.some(d=>!verified.authorizedDomains.includes(d)))throw new Error('Morsel sign-in domains were not saved.');
console.log('PASS: standalone Morsel sign-in domains authorized; existing domains preserved.');
