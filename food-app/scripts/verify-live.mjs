import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
const require=createRequire(new URL('../../personal-functions/runtime.cjs',import.meta.url));
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const project='pti-app-2ab59',owner='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2',key='AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs';
const app=initializeApp({credential:applicationDefault(),projectId:project},'morsel-live-check');
const auth=getAuth(app),base=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/`;
async function identity(uid){const custom=await auth.createCustomToken(uid);const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${key}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:custom,returnSecureToken:true})});if(!r.ok)throw new Error('Test identity could not sign in.');return (await r.json()).idToken;}
async function check(path,token,status){const r=await fetch(base+path,{headers:token?{Authorization:'Bearer '+token}:undefined});if(r.status!==status)throw new Error(`Private access check: expected ${status}, got ${r.status}.`);}
const outsider='morsel-qa-'+randomUUID();
try{
 const [ownerToken,otherToken]=await Promise.all([identity(owner),identity(outsider)]);
 const path=`users/${owner}/foodData/workspace`;
 await check(path,ownerToken,200);await check(path,otherToken,403);await check(path,null,403);
 await check(path+'/orders/zomato-8650593269',ownerToken,200);await check(path+'/orders/zomato-8650593269',otherToken,403);
 console.log('PASS: owner can read imported food history; unrelated and unsigned clients cannot.');
}finally{await auth.deleteUser(outsider).catch(()=>{});}
const origin='https://pti-app-2ab59-morsel.web.app/';
for(const file of ['index.html','app.mjs','core.mjs','styles.css','sw.js','manifest.webmanifest']){
 const expected=await readFile('food-app/'+file,'utf8');let verified=false;
 for(let i=0;i<12;i++){const response=await fetch(origin+file+'?release='+process.env.GITHUB_SHA,{headers:{'Cache-Control':'no-cache'}});if(response.ok&&(await response.text())===expected){verified=true;break}await new Promise(r=>setTimeout(r,3000));}
 if(!verified)throw new Error('Live asset did not match: '+file);
}
console.log('PASS: live Morsel assets match this release.');

const manifest=await fetch(origin+'manifest.webmanifest').then(r=>r.json());
if(manifest.start_url!=='./'||manifest.scope!=='./')throw new Error('Morsel must install at its own app root.');
console.log('PASS: standalone Morsel PWA start URL and scope.');
