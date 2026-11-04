// Synthetic state only: production controller/rendering, no credentials, media,
// Firebase writes, queue submissions or inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join,resolve,extname} from 'node:path';
let chromium;
try{({chromium}=createRequire(new URL('../../wedding-planner/package.json',import.meta.url))('playwright'));}catch{}
const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/redesign.css"></head><body><p style="margin:0;padding:8px;color:#fff;background:#59344d;font:12px sans-serif">SYNTHETIC STATE FIXTURE — no Firebase, private media or inference</p><section id="studioView" class="studio-view"></section><script type="module">
import {mountStudio} from '/studio.mjs';
import {PC_DEVICE_UID} from '/device-config.mjs';
window.mutations=[];window.reads=[];
window.fixture={worker:{deviceUid:PC_DEVICE_UID,version:'2.3.0',state:'idle',activeJob:'',updatedAt:Date.now(),installed:['flux2-klein-fp8','qwen-image-2.1'],capabilities:{referenceModels:['flux2-klein-fp8','qwen-image-2.1'],qwenMaxReferences:10,recoveryControl:true}},jobs:[],removed:[]};
await mountStudio({app:{},auth:{},drive:{clear(){},async listReferences(){return {files:[],cursor:''};},async loadQualityCreations(){return [];}}});window.ready=true;
</script></body></html>`;
const firestore=`
export const getFirestore=()=>({});
export const doc=(base,...parts)=>({path:[base.path,...parts].filter(Boolean).join('/')});
export const collection=doc;
export const query=(base,...conditions)=>({...base,conditions});
export const where=(field,op,value)=>({field,op,value});
export const orderBy=(field,direction)=>({orderBy:field,direction});
export const limit=value=>({limit:value});
export const startAfter=value=>({after:value});
export const documentId=()=>('__name__');
const snapshot=(id,data)=>({id,exists:()=>data!==undefined,data:()=>data});
export async function getDoc(target){
 const parts=target.path.split('/'),kind=parts.at(-2),id=parts.at(-1);reads.push({kind,id});
 const value=kind==='status'?fixture.worker:kind==='devices'?{status:'approved',deviceUid:fixture.worker.deviceUid}:kind==='jobs'?fixture.jobs.find(job=>job.id===id):undefined;
 return snapshot(id,value);
}
export async function getDocs(target){
 const kind=target.path.split('/').at(-1);reads.push({kind,conditions:target.conditions});
 let values=kind==='jobs'?[...fixture.jobs]:kind==='removed'?[...fixture.removed]:[];
 for(const c of target.conditions||[]){if(c.field==='status'&&c.op==='in')values=values.filter(v=>c.value.includes(v.status));if(c.limit)values=values.slice(0,c.limit);}
 const docs=values.map(value=>snapshot(value.id,value));return {docs,empty:!docs.length,size:docs.length};
}
const rejectWrite=(...args)=>{mutations.push(args);throw Error('Fixture must never submit a job or mutate Firestore');};
export const setDoc=rejectWrite,updateDoc=rejectWrite,deleteDoc=rejectWrite;
`;
async function inBrowser(operation){
 const base=resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
 const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(fixture);return;}
  const file=resolve(base,'.'+pathname);
  if(!file.startsWith(base+'/')&&!file.startsWith(base+'\\')){res.writeHead(403);res.end();return;}
  if(!['.mjs','.js','.css'].includes(extname(file))){res.writeHead(404);res.end();return;}
  try{res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'text/javascript'});res.end(await readFile(file));}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  return await operation(browser,`http://127.0.0.1:${server.address().port}`);
 }finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}
async function openPage(browser,origin,viewport){
 const page=await browser.newPage({viewport});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://www.gstatic.com/firebasejs/**',async route=>{
  const auth=route.request().url().endsWith('firebase-auth.js');
  await route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:auth?`export const onAuthStateChanged=(auth,callback)=>{queueMicrotask(()=>callback({uid:'fixture-owner'}));return ()=>{};};`:firestore});
 });
 await page.goto(origin);try{await page.waitForFunction(()=>window.ready&&document.querySelector('#studioPcLabel').textContent==='PC ready',{},{timeout:10000});}catch(error){throw new Error(JSON.stringify({errors,state:await page.evaluate(()=>({ready:window.ready,label:document.querySelector('#studioPcLabel')?.textContent,message:document.querySelector('#studioMessage')?.textContent,reads:window.reads}))}),{cause:error});}
 await page.locator('#studioPrompt').fill('Synthetic UI check. Do not submit.');await page.locator('#studioConsent').check();
 return page;
}
async function refresh(page){await page.locator('#studioDeviceOpen').click();await page.locator('#studioRefresh').click();await page.keyboard.press('Escape');}

test('Studio new draft and Generate recover after terminal status on desktop/mobile',{skip:!chromium&&'Local Playwright unavailable'},()=>inBrowser(async(browser,origin)=>{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:360,height:800}]){
  const page=await openPage(browser,origin,viewport);
  await page.evaluate(()=>{fixture.worker.state='running';fixture.worker.activeJob='finished';fixture.jobs=[{id:'finished',model:'flux2-klein-fp8',status:'completed',createdAt:Date.now(),prompt:'Synthetic terminal fixture'}];});
  await refresh(page);await page.waitForFunction(()=>document.querySelector('#studioPcLabel').textContent==='PC ready');
  assert.equal(await page.locator('#studioGenerate').isEnabled(),true);
  await page.locator('#studioCreationsTab').click();assert.equal(await page.locator('#studioNew').isEnabled(),true);await page.locator('#studioNew').click();
  assert.equal(await page.locator('#studioPrompt').inputValue(),'');
  await page.locator('#studioPrompt').fill('Synthetic UI check. Do not submit.');
  assert.equal(await page.locator('#studioGenerate').isEnabled(),true);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(await page.evaluate(()=>mutations),[]);
  assert.equal(await page.evaluate(()=>reads.some(read=>read.kind==='jobs'&&read.conditions?.some(c=>c.field==='status'&&c.op==='in')&&read.conditions.some(c=>c.limit===20))),true);
  if(process.env.VELUM_UI_EVIDENCE_DIR){await mkdir(process.env.VELUM_UI_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.VELUM_UI_EVIDENCE_DIR,`studio-idle-${viewport.width}.png`),fullPage:true});}
  await page.close();
 }
}));

test('active, removed and delivering jobs stay protected while stale heartbeat text stays truthful',{skip:!chromium&&'Local Playwright unavailable'},()=>inBrowser(async(browser,origin)=>{
 const page=await openPage(browser,origin,{width:390,height:844});
 await page.evaluate(()=>{const now=Date.now();fixture.worker.state='running';fixture.worker.activeJob='active';fixture.jobs=[{id:'active',model:'qwen-image-2.1',status:'running',workerId:fixture.worker.deviceUid,createdAt:now-3600000,startedAt:now-3600000,expiresAt:now+86400000,prompt:'Synthetic running fixture',progress:{stage:'encoding-prompt',step:0,total:40}}];fixture.removed=[{id:'active',jobId:'active',removedAt:now}];});
 await refresh(page);await page.waitForFunction(()=>document.querySelector('#studioPcLabel').textContent==='PC generating');
 assert.equal(await page.locator('#studioGenerate').isEnabled(),false);
 await page.evaluate(()=>fixture.jobs[0].progress={stage:'publishing',step:0,total:0});await refresh(page);
 await page.waitForFunction(()=>document.querySelector('#studioPcLabel').textContent==='PC delivering result');
 assert.equal(await page.locator('#studioGenerate').isEnabled(),false);
 await page.evaluate(()=>fixture.worker.updatedAt=Date.now()-91000);await refresh(page);
 await page.waitForFunction(()=>document.querySelector('#studioPcLabel').textContent==='PC offline');
 await page.locator('#studioDeviceOpen').click();assert.equal(await page.locator('#studioRequestRecovery').isEnabled(),true);await page.keyboard.press('Escape');
 await page.evaluate(()=>{fixture.worker.updatedAt=Date.now();fixture.jobs[0].status='completed';});await refresh(page);
 await page.waitForFunction(()=>document.querySelector('#studioPcLabel').textContent==='PC ready');
 assert.equal(await page.locator('#studioGenerate').isEnabled(),true);assert.deepEqual(await page.evaluate(()=>mutations),[]);
 await page.close();
}));
