import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {randomBytes} from 'node:crypto';
import {DEFAULT_SETTINGS} from './core.mjs';
const {db,auth,hash,now}=createRequire(import.meta.url)('./runtime.cjs');
const base='https://pti-app-2ab59-personal.web.app';
const firestore='https://firestore.googleapis.com/v1/projects/pti-app-2ab59/databases/personal/documents';
const apiKey='AIzaSyAFXtWCXQgR8Sn2H0ZWqJx_sdPM4ujO2Zs';
const suffix=randomBytes(6).toString('hex'),uids=[`personal-test-a-${suffix}`,`personal-test-b-${suffix}`];let checks=0;
const pass=(name,condition)=>{assert(condition,name);checks++;console.log(`PASS ${name}`);};
function fields(value){if(typeof value==='string')return{stringValue:value};if(typeof value==='boolean')return{booleanValue:value};if(typeof value==='number')return{integerValue:String(value)};if(Array.isArray(value))return{arrayValue:{values:value.map(fields)}};return{mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,fields(v)]))}};}
async function client(path,token,method='GET',data){return fetch(`${firestore}/${path}`,{method,headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,'Content-Type':'application/json'},body:data?JSON.stringify({fields:fields(data).mapValue.fields}):undefined});}
async function login(uid){await auth.createUser({uid});const token=await auth.createCustomToken(uid);const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token,returnSecureToken:true})});const result=await r.json();assert(r.ok,'Temporary test identity exchange failed.');return result.idToken;}
async function rpc(token,method,params){const r=await fetch(base+'/mcp',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});return{status:r.status,body:await r.json()};}
try{
 const [a,b]=await Promise.all(uids.map(login));const root=`users/${uids[0]}`;
 const profile={settings:structuredClone(DEFAULT_SETTINGS),paused:false,preferenceVersion:1,generation:suffix,updatedAt:now()};
 pass('owner profile write',(await client(root,a,'PATCH',profile)).ok);
 pass('owner profile read',(await client(root,a)).ok);
 pass('anonymous profile denied',(await client(root,null)).status===403);
 pass('other user profile denied',(await client(root,b)).status===403);
 const capture={text:'Synthetic security test; delete after verification.',kind:'thought',threadId:'',url:'',articleId:'',articleTitle:'',createdAt:now()};
 pass('owner capture write',(await client(root+'/captures/probe',a,'PATCH',capture)).ok);
 pass('other user capture denied',(await client(root+'/captures/probe',b)).status===403);
 pass('client edition publishing denied',(await client(root+'/editions/probe',a,'PATCH',{createdAt:now()})).status===403);
 pass('client catalogue publishing denied',(await client('catalog/probe',a,'PATCH',{createdAt:now()})).status===403);
 pass('client agent credentials denied',(await client('_agentTokens/probe',a)).status===403);
 pass('unauthenticated MCP denied',(await rpc('invalid','tools/list')).status===401);
 const credential=await fetch(base+'/api/token',{method:'POST',headers:{Authorization:`Bearer ${a}`,'Content-Type':'application/json'},body:'{}'});const key=await credential.json();pass('account-scoped key creation',credential.ok&&typeof key.token==='string');
 const listed=await rpc(key.token,'tools/list');pass('authenticated tools/list',listed.status===200&&listed.body.result?.tools?.length===3);
 const context=await rpc(key.token,'tools/call',{name:'personal_context',arguments:{}});const ctx=JSON.parse(context.body.result.content[0].text);pass('real context tools/call',ctx.contextVersion===1&&!('captures'in ctx)&&ctx.generation===suffix);
 const items=Array.from({length:5},(_,i)=>({id:`probe${i}`,title:`Synthetic item ${i}`,summary:'Security probe only.',why:'Testing validation.',source:'Test fixture',url:`https://example.com/test-${suffix}/${i}`,publishedAt:now(),topic:DEFAULT_SETTINGS.topics[i%4],region:i%2?'india':'global'}));
 let published=await rpc(key.token,'tools/call',{name:'personal_publish',arguments:{contextVersion:99,generation:suffix,edition:{items,explanation:'Test'}}});pass('stale context publishing rejected',published.body.result.isError===true);
 published=await rpc(key.token,'tools/call',{name:'personal_publish',arguments:{contextVersion:1,generation:suffix,edition:{items,explanation:'Synthetic publication for security verification; this entire user is deleted.'}}});pass('validated MCP publication',published.body.result.isError===false);
 const edition=await db.doc(root).collection('editions').get();pass('publication persisted',edition.size===1);
 await db.doc(root).update({paused:true});const paused=await rpc(key.token,'tools/call',{name:'personal_context',arguments:{}});pass('paused account context denied',paused.body.result.isError===true);
 const revoked=await fetch(base+'/api/token',{method:'DELETE',headers:{Authorization:`Bearer ${a}`}});pass('key revocation',revoked.ok&&(await rpc(key.token,'tools/list')).status===401);
 console.log(JSON.stringify({passed:checks,scope:'isolated personal database; temporary synthetic users only'}));
}finally{
 for(const uid of uids){const tokens=await db.collection('_agentTokens').where('uid','==',uid).get();for(const t of tokens.docs)await t.ref.delete();await db.recursiveDelete(db.collection('users').doc(uid));await auth.deleteUser(uid).catch(()=>{});}
}
