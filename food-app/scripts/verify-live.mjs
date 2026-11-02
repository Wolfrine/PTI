import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {firebaseConfig} from '../firebase-config.mjs';
const require=createRequire(new URL('../../personal-functions/runtime.cjs',import.meta.url));
const {initializeApp,applicationDefault}=require('firebase-admin/app');
const {getAuth}=require('firebase-admin/auth');
const project='pti-app-2ab59',owner='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const app=initializeApp({credential:applicationDefault(),projectId:project},'morsel-live-check');
const auth=getAuth(app),base=`https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/`;
async function identity(uid){const custom=await auth.createCustomToken(uid);const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${firebaseConfig.apiKey}`,{method:'POST',headers:{'Content-Type':'application/json',Referer:'https://pti-app-2ab59-morsel.web.app/'},body:JSON.stringify({token:custom,returnSecureToken:true})});if(!r.ok)throw new Error('Test identity could not sign in.');return (await r.json()).idToken;}
async function check(path,token,status){const r=await fetch(base+path,{headers:token?{Authorization:'Bearer '+token}:undefined});if(r.status!==status)throw new Error(`Private access check: expected ${status}, got ${r.status}.`);}
function encode(v){if(v===null)return {nullValue:null};if(typeof v==='string')return {stringValue:v};if(typeof v==='boolean')return {booleanValue:v};if(typeof v==='number')return Number.isInteger(v)?{integerValue:String(v)}:{doubleValue:v};if(Array.isArray(v))return {arrayValue:{values:v.map(encode)}};return {mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};}
function decode(v){if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if(v.arrayValue)return (v.arrayValue.values||[]).map(decode);if(v.integerValue!==undefined)return +v.integerValue;if(v.doubleValue!==undefined)return v.doubleValue;if(v.booleanValue!==undefined)return v.booleanValue;if(v.nullValue!==undefined)return null;return v.stringValue;}
async function write(path,token,data,status){const fields=encode(data).mapValue.fields,r=await fetch(base+path,{method:'PATCH',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({fields})});if(r.status!==status)throw new Error(`Private write check for ${path.split('/').at(-2)} expected ${status}, got ${r.status}: ${await r.text()}`);}
const outsider='morsel-qa-'+randomUUID(),cleanup=[];let cleanupToken;
try{
 const [ownerToken,otherToken]=await Promise.all([identity(owner),identity(outsider)]);
 const path=`users/${owner}/foodData/workspace`;
 await check(path,ownerToken,200);await check(path,otherToken,403);await check(path,null,403);
 await check(path+'/orders/zomato-8650593269',ownerToken,200);await check(path+'/orders/zomato-8650593269',otherToken,403);
 cleanupToken=ownerToken;
 const receiptResponse=await fetch(base+path+'/orders/zomato-8650593269',{headers:{Authorization:'Bearer '+ownerToken}});const receipt=decode({mapValue:{fields:(await receiptResponse.json()).fields}}),createdAt=new Date().toISOString();
 const id='qa-'+randomUUID();
 const records={
  preferences:{id,signal:'smoky',stance:'like',scope:'always',createdAt},
  learning:{id,orderId:receipt.id,dishId:receipt.items[0].dishId,restaurantId:receipt.restaurantId,eaten:false,reaction:'okay',reason:'other',note:'Temporary access test; does not infer enjoyment.',mood:'Comfort',createdAt},
  memories:{id,orderId:receipt.id,title:'Temporary access test',note:'',occasion:'any',createdAt},
  sessions:{id,restaurantId:receipt.restaurantId,restaurant:receipt.restaurantName,dishIds:[receipt.items[0].dishId],itemNames:[receipt.items[0].name],status:'chosen',context:{craving:'',mood:'Comfort',wants:[],avoid:[],diners:1,budget:0,mode:'delivery'},experiment:null,createdAt}
 };
 for(const [collection,data]of Object.entries(records)){
  const doc=path+'/'+collection+'/'+id;await write(doc,ownerToken,data,200);cleanup.push(doc);await check(doc,ownerToken,200);await check(doc,otherToken,403);await check(doc,null,403);await write(doc,otherToken,data,403);await write(doc,ownerToken,{...data,unapprovedField:true},403);
 }
 await write(path+'/sessions/'+id,ownerToken,{...records.sessions,status:'receipt-linked',linkedOrderId:receipt.id},403);
 await write(path+'/sessions/'+id,ownerToken,{...records.sessions,status:'dismissed'},200);
 await write(path+'/learning/'+id,ownerToken,{...records.learning,eaten:'yes'},403);
 await write(path+'/memories/'+id,ownerToken,{...records.memories,orderId:'missing'},403);
 await write(path+'/research/'+id,ownerToken,{id,items:[],createdAt},403);await check(path+'/research',otherToken,403);
 await write(path+'/orders/'+id,ownerToken,receipt,403);
 // Reuse the existing CI owner/outsider test identities. Read-only transport
 // acceptance; never submit a synthetic purchase or sync run to the real owner.
 const bridge='https://pti-firestore-mcp-185802494856.asia-south1.run.app/morsel/blinkit';
 const bridgeCall=(token,origin,action)=>fetch(bridge,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify({action,args:action==='context'?{limit:1}:{}}),signal:AbortSignal.timeout(30000)});
 let capabilities;
 for(let attempt=0;attempt<18;attempt++){
  const response=await bridgeCall(ownerToken,'https://pti-app-2ab59-morsel.web.app','capabilities');
  if(response.ok){capabilities=await response.json();if(capabilities.tools?.some(t=>t.name==='food_blinkit_events'))break;await new Promise(r=>setTimeout(r,5000));continue;}
  if(![404,503].includes(response.status))throw Error('Owner page bridge rejected HTTP '+response.status);
  await new Promise(r=>setTimeout(r,5000));
 }
 if(!capabilities?.ok||capabilities.tools.length!==4||!capabilities.tools.find(t=>t.name==='food_blinkit_sync')?.inputSchema.properties.action.enum.includes('exclude'))throw Error('Deployed page bridge capabilities are incomplete.');
 const pageContext=await bridgeCall(ownerToken,'https://pti-app-2ab59-morsel.web.app','context');
 if(!pageContext.ok||!Array.isArray((await pageContext.json()).purchases))throw Error('Owner page purchase context failed.');
 if((await bridgeCall(null,'https://pti-app-2ab59-morsel.web.app','context')).status!==401||
    (await bridgeCall(otherToken,'https://pti-app-2ab59-morsel.web.app','context')).status!==403||
    (await bridgeCall(ownerToken,'https://fake.example','context')).status!==403)throw Error('Page bridge authentication/origin denial failed.');
 console.log('PASS: deployed Morsel page backend has four canonical tools with payment-event leases and explicit scope exclusions, owner read, unsigned/outsider/fake-origin denials. No purchase or run created. Browser registration/sign-in still needs owner acceptance.');
 console.log('PASS: owner reads history and saves validated learning/preferences/plans/memories. Outsider/unsigned access, extra fields, invalid learning, invented memories, client menu/receipt writes and forged receipt reconciliation are denied.');
}finally{for(const path of cleanup){const r=await fetch(base+path,{method:'DELETE',headers:{Authorization:'Bearer '+cleanupToken}});if(!r.ok)throw new Error('Temporary private test document could not be removed.');}await auth.deleteUser(outsider).catch(()=>{});}
const origin='https://pti-app-2ab59-morsel.web.app/';
for(const file of ['index.html','app.mjs','firebase-config.mjs','blinkit-webmcp.mjs','blinkit-projection.mjs','core.mjs','intelligence.mjs','places.mjs','styles.css','sw.js','manifest.webmanifest','assets/bhel.webp','assets/vada-pav.webp','assets/dal.webp','assets/hara-bhara.webp','assets/paneer-tikka.webp','assets/veg-biryani.webp']){
 const expected=await readFile('food-app/'+file);let verified=false;
 for(let i=0;i<12;i++){const response=await fetch(origin+file+'?release='+process.env.GITHUB_SHA,{headers:{'Cache-Control':'no-cache'}});if(response.ok&&Buffer.from(await response.arrayBuffer()).equals(expected)){verified=true;break}await new Promise(r=>setTimeout(r,3000));}
 if(!verified)throw new Error('Live asset did not match: '+file);
}
console.log('PASS: live Morsel assets match this release.');
if((await fetch(origin,{headers:{'Cache-Control':'no-cache'}})).headers.get('referrer-policy')!=='strict-origin')throw Error('Morsel must send only its origin for browser-restricted Firebase authentication.');
console.log('PASS: live Morsel sends origin-only Referer policy, without page paths.');

const manifest=await fetch(origin+'manifest.webmanifest').then(r=>r.json());
if(manifest.start_url!=='./'||manifest.scope!=='./')throw new Error('Morsel must install at its own app root.');
console.log('PASS: standalone Morsel PWA start URL and scope.');
