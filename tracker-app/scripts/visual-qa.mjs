// Controlled UI regression test: production client + read-only owner data snapshot.
// SDK stubs isolate rendering; this does not attest Firebase authentication/rules.
import {createRequire} from 'node:module';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve, extname} from 'node:path';
import assert from 'node:assert/strict';
const modules=process.env.TRACKER_QA_MODULES;
const require=modules?createRequire(resolve(modules,'../qa.cjs')):createRequire(import.meta.url);
const {chromium}=require('playwright');
const names=['evidence','events','nodes','edges','dayIndex','sourceState','assessments','runs','chatTurns','chatConversations'];
const uid='5PbKbpGf3AbarNrp6pyqJ5C5Ziu2';
const decode=v=>v?.stringValue??v?.timestampValue??(v?.integerValue!==undefined?Number(v.integerValue):v?.doubleValue!==undefined?v.doubleValue:v?.booleanValue!==undefined?v.booleanValue:v?.nullValue!==undefined?null:v?.arrayValue?(v.arrayValue.values||[]).map(decode):v?.mapValue?Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)])):null);
let data;
if(process.env.PTI_TRACKER_FIXTURE)data=JSON.parse(await readFile(process.env.PTI_TRACKER_FIXTURE,'utf8'));
else{
 const {GoogleAuth}=require('google-auth-library');
 const token=await new GoogleAuth({scopes:['https://www.googleapis.com/auth/datastore']}).getAccessToken();
 data={};
 for(const name of names){
  const docs=[];let page='';
  do{
   const url=`https://firestore.googleapis.com/v1/projects/pti-app-2ab59/databases/(default)/documents/users/${uid}/trackerData/workspace/${name}?pageSize=1000${page?'&pageToken='+encodeURIComponent(page):''}`;
   const res=await fetch(url,{headers:{Authorization:`Bearer ${token}`}});
   if(!res.ok)throw new Error(`Read-only QA snapshot failed for ${name}: ${res.status}`);
   const json=await res.json();
   docs.push(...(json.documents||[]).map(d=>({id:d.name.split('/').at(-1),...Object.fromEntries(Object.entries(d.fields||{}).map(([k,v])=>[k,decode(v)]))})));
   page=json.nextPageToken||'';
  }while(page);
  data[name]=docs;
 }
}
const root=resolve('tracker-app');
const csp="default-src 'self'; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self'; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebaseapp.com https://www.gstatic.com; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'";
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(root+'/'))throw new Error('Path');const body=await readFile(file);res.setHeader('Content-Type',({'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml'})[extname(file)]||'text/plain');res.setHeader('Content-Security-Policy',csp);res.end(body);}catch{res.statusCode=404;res.end('Not found');}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;
const out=resolve('tracker-qa-output');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const issues=[];const captures=[];
const firestoreStub=`export const doc=(...args)=>({name:args.at(-1)}); export const collection=(root,name)=>({name}); export const getDoc=async()=>({exists:()=>true}); export const initializeFirestore=()=>({}); export const getFirestore=()=>({}); export const persistentLocalCache=()=>({}); export const persistentMultipleTabManager=()=>({}); export const orderBy=(...args)=>({args}); export const limit=n=>({n}); export const query=ref=>ref; export const onSnapshot=(ref,...args)=>{const cb=args.find(x=>typeof x==='function'); const fail=args.filter(x=>typeof x==='function').at(-1); setTimeout(()=>{if(globalThis.__QA_MODE__==='loading')return;if(globalThis.__QA_MODE__==='error'&&ref.name==='nodes'){fail?.({code:'permission-denied'});return;} cb({docs:(globalThis.__QA_DATA__[ref.name]||[]).map(d=>({id:d.id,data:()=>d})),metadata:{fromCache:false,hasPendingWrites:false}})},10);return()=>{}};`;
const authStub=`export const getAuth=()=>({}); export class GoogleAuthProvider {setCustomParameters(){}}; export const signInWithPopup=async()=>{}; export const signInWithRedirect=async()=>{}; export const onAuthStateChanged=(auth,cb)=>setTimeout(()=>cb(globalThis.__QA_MODE__==='auth'?null:{uid:'${uid}',displayName:'Owner review fixture'}),0); export const signOut=async()=>{};`;
try{
 for(const [label,width,height] of [['desktop',1440,1000],['mobile',390,844],['small-mobile',320,740]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await ctx.addInitScript(fixture=>{globalThis.__QA_DATA__=fixture;globalThis.__QA_MODE__='normal';},data);
  await ctx.route('https://www.gstatic.com/firebasejs/**',async route=>{const url=route.request().url();await route.fulfill({contentType:'text/javascript',body:url.includes('firebase-app.js')?'export const initializeApp=()=>({});':url.includes('firebase-auth.js')?authStub:firestoreStub});});
  const page=await ctx.newPage();page.on('pageerror',e=>issues.push(`${label}: ${e.message}`));
  for(const route of ['review','chronicle','trace','investment','search','node/ws-morsel','discussions']){
   await page.goto(`${origin}/#${route}`);await page.waitForTimeout(450);
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
   if(overflow)issues.push(`${label}/${route}: body overflows`);
   const name=`${label}-${route.replaceAll('/','-')}.png`;
   await page.screenshot({path:resolve(out,name),fullPage:true});captures.push(name);
  }
  await page.goto(`${origin}/#discussions`);await page.waitForTimeout(400);
  const discussions=page.locator('a[href^="#discussion/"]');
  if(await discussions.count()){
   const href=await discussions.first().getAttribute('href');
   const id=decodeURIComponent(href.split('/').slice(1).join('/'));
   await discussions.first().click();await page.waitForTimeout(150);
   for(const turn of data.chatTurns.filter(t=>t.harnessConversationId===id))for(const message of turn.messages||[]){
    const displayed=await page.locator('.message-text').allTextContents();
    assert.ok(displayed.includes(message.content),`${label}: exact full captured message text must appear in the reader`);
   }
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1))issues.push(`${label}/discussion-reader: body overflows`);
   await page.screenshot({path:resolve(out,`${label}-discussion-expanded.png`),fullPage:true});
  }
  await page.goto(`${origin}/#review`);await page.waitForTimeout(350);
  if(await page.locator('[data-event]').count()){
   await page.locator('[data-event]').first().click();await page.waitForTimeout(100);
   assert.equal(await page.getByRole('dialog').count(),1,`${label}: event details open`);
   await page.screenshot({path:resolve(out,`${label}-event-expanded.png`),fullPage:true});
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0,`${label}: event details stay closed`);
  }
  await ctx.close();
 }
 const ctx=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await ctx.route('https://www.gstatic.com/firebasejs/**',async route=>{const u=route.request().url();await route.fulfill({contentType:'text/javascript',body:u.includes('firebase-app.js')?'export const initializeApp=()=>({});':u.includes('firebase-auth.js')?authStub:firestoreStub});});
 for(const mode of ['auth','loading','error','empty']){
  const page=await ctx.newPage();await page.addInitScript(({data,mode})=>{globalThis.__QA_DATA__=mode==='empty'?{}:data;globalThis.__QA_MODE__=mode;},{data,mode});
  page.on('pageerror',e=>issues.push(`${mode}: ${e.message}`));await page.goto(origin);await page.waitForTimeout(450);await page.screenshot({path:resolve(out,`mobile-${mode}.png`),fullPage:true});await page.close();
 }
 await ctx.close();
 await writeFile(resolve(out,'result.json'),JSON.stringify({sourceCommit:process.env.GITHUB_SHA||null,dataCounts:Object.fromEntries(names.map(n=>[n,data[n]?.length||0])),captures,issues,limits:'Read-only data snapshot; SDK stub rendering tests do not verify production authentication or source completeness.'},null,2));
 assert.deepEqual(issues,[],'Browser render/overflow regression');
 console.log(`Rendered ${captures.length} screen/viewport combinations without runtime or body-overflow errors.`);
}finally{await browser.close();await new Promise(r=>server.close(r));}
