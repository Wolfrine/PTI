import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes,createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {DEFAULT_SETTINGS} from './core.mjs';
const {db,auth,now}=createRequire(import.meta.url)('./runtime.cjs');
const firestore='https://firestore.googleapis.com/v1/projects/pti-app-2ab59/databases/(default)/documents';
const apiKey='AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs';
const suffix=randomBytes(6).toString('hex'),uids=[`personal-test-a-${suffix}`,`personal-test-b-${suffix}`];
const checks=[];
const pass=(name,condition)=>{assert(condition,name);checks.push(name);console.log(`PASS ${name}`);};
function value(v){if(v instanceof Date)return{timestampValue:v.toISOString()};if(typeof v==='string')return{stringValue:v};if(typeof v==='boolean')return{booleanValue:v};if(typeof v==='number')return{integerValue:String(v)};if(Array.isArray(v))return{arrayValue:{values:v.map(value)}};return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,value(x)]))}};}
async function client(path,token,method='GET',data){return fetch(`${firestore}/${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,'Content-Type':'application/json'},body:data?JSON.stringify({fields:value(data).mapValue.fields}):undefined});}
async function login(uid){await auth.createUser({uid});const token=await auth.createCustomToken(uid);const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});const result=await r.json();assert(r.ok,'Temporary test identity exchange failed.');return result.idToken;}
try{
 const [a,b]=await Promise.all(uids.map(login));const root=`users/${uids[0]}/personalData/workspace`;
 const profile={settings:structuredClone(DEFAULT_SETTINGS),paused:false,preferenceVersion:1,generation:suffix,updatedAt:now()};
 let owner;for(let i=0;i<20;i++){owner=await client(root,a,'PATCH',profile);if(owner.ok)break;await new Promise(r=>setTimeout(r,3000));}
 pass('owner profile write',owner.ok);
 pass('owner profile read',(await client(root,a)).ok);
 pass('anonymous profile denied',(await client(root,null)).status===403);
 pass('other user profile denied',(await client(root,b)).status===403);
 pass('other user profile update denied',(await client(root,b,'PATCH',profile)).status===403);
 const capture={text:'Synthetic security test.',kind:'thought',threadId:'',url:'',articleId:'',articleTitle:'',createdAt:now()};
 pass('owner capture write',(await client(root+'/captures/probe',a,'PATCH',capture)).ok);
 pass('other user capture denied',(await client(root+'/captures/probe',b)).status===403);
 pass('invalid capture rejected',(await client(root+'/captures/bad',a,'PATCH',{...capture,extra:'not allowed'})).status===403);
 const feedback={itemId:'probe',reaction:'thought',note:'Please show implementation evidence.',itemTitle:'Synthetic source',url:'https://example.com',source:'Test',topic:'AI & agents',createdAt:now()};
 pass('explicit written feedback saved',(await client(root+'/feedback/probe',a,'PATCH',feedback)).ok);
 pass('other user feedback denied',(await client(root+'/feedback/probe',b)).status===403);
 pass('owner thread saved',(await client(root+'/threads/probe',a,'PATCH',{title:'Synthetic question',shareWithAgent:true,createdAt:now()})).ok);
 pass('client edition publishing denied',(await client(root+'/editions/probe',a,'PATCH',{createdAt:now()})).status===403);
 pass('client run forgery denied',(await client(root+'/runs/probe',a,'PATCH',{createdAt:now()})).status===403);
 const digest=createHash('sha256').update(randomBytes(32)).digest('hex');
 const keyPath=`${root}/agentKeys/${digest}`;
 const key=await fetch(firestore+':commit',{method:'POST',headers:{Authorization:`Bearer ${a}`,'Content-Type':'application/json'},body:JSON.stringify({writes:[{update:{name:`projects/pti-app-2ab59/databases/(default)/documents/${keyPath}`,fields:value({scope:'news',expiresAt:new Date(Date.now()+29*86400000)}).mapValue.fields},updateTransforms:[{fieldPath:'createdAt',setToServerValue:'REQUEST_TIME'}]}]})});
 pass('owner can create scoped expiring key',key.ok);
 pass('other user key read denied',(await client(keyPath,b)).status===403);
 pass('owner can revoke key',(await client(keyPath,a,'DELETE')).ok);
 const legacy=`users/${uids[0]}/legacyIntegration/probe`;
 pass('legacy user data policy preserved',(await client(legacy,a,'PATCH',{synthetic:true})).ok);
 await db.doc(root+'/editions/probe').set({createdAt:now(),synthetic:true});
 pass('owner can read agent edition',(await client(root+'/editions/probe',a)).ok);
 pass('other user edition read denied',(await client(root+'/editions/probe',b)).status===403);
 pass('owner can delete their edition',(await client(root+'/editions/probe',a,'DELETE')).ok);
 pass('owner can delete personal capture',(await client(root+'/captures/probe',a,'DELETE')).ok);
 await db.doc(root+'/reflections/probe').set({createdAt:now(),synthetic:true});
 let reflectionRead;for(let i=0;i<20;i++){reflectionRead=await client(root+'/reflections/probe',a);if(reflectionRead.ok)break;await new Promise(r=>setTimeout(r,3000));}
 pass('owner can read agent reflection',reflectionRead.ok);
 pass('other user reflection denied',(await client(root+'/reflections/probe',b)).status===403);
 pass('anonymous reflection denied',(await client(root+'/reflections/probe',null)).status===403);
 pass('client reflection forgery denied',(await client(root+'/reflections/forged',a,'PATCH',{createdAt:now()})).status===403);
 pass('owner can delete reflection',(await client(root+'/reflections/probe',a,'DELETE')).ok);
 const report=JSON.parse(await readFile('personal-activation-report.json','utf8'));
 report.clientChecks=checks;report.clientVerifiedAt=now();report.mcpVerified=false;report.agentReason='This test verifies client rules, not the connected MCP session. Consult actual agent publication records.';
 await writeFile('personal-activation-report.json',JSON.stringify(report,null,2));
 console.log(JSON.stringify({passed:checks.length,database:'(default)',scope:'temporary synthetic users; personal namespace only',mcpVerified:false}));
}finally{
 for(const uid of uids){await db.recursiveDelete(db.doc(`users/${uid}/personalData/workspace`));await db.doc(`users/${uid}/legacyIntegration/probe`).delete();await auth.deleteUser(uid).catch(()=>{});}
}
