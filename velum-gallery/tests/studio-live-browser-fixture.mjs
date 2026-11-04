// Local synthetic state only; no owner data, inference, credentials or writes.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve,extname} from 'node:path';
export let chromium;
try{({chromium}=createRequire(new URL('../../wedding-planner/package.json',import.meta.url))('playwright'));}catch{}
export const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/redesign.css"></head><body><p style="margin:0;padding:8px;color:#fff;background:#59344d;font:12px sans-serif">SYNTHETIC STATE FIXTURE — no Firebase, private media or inference</p><section id="studioView" class="studio-view"></section><script type="module">
import {mountStudio} from '/studio.mjs';
import {PC_DEVICE_UID} from '/device-config.mjs';
window.mutations=[];window.reads=[];window.subscriptions=[];
window.fixture={worker:{deviceUid:PC_DEVICE_UID,version:'2.3.1',state:'idle',activeJob:'',updatedAt:Date.now(),installed:['flux2-klein-fp8','qwen-image-2.1'],capabilities:{referenceModels:['flux2-klein-fp8','qwen-image-2.1'],qwenMaxReferences:10,recoveryControl:true}},jobs:[],removed:[]};
window.studio=await mountStudio({app:{},auth:{},drive:{clear(){},async listReferences(){return {files:[],cursor:''};},async loadQualityCreations(){return [];}}});window.ready=true;
window.setStudioFixtureState=async name=>{
 const now=Date.now();fixture.worker.updatedAt=now;fixture.worker.state='running';fixture.worker.activeJob='active-'+name;
 fixture.jobs=[{id:'active-'+name,model:'qwen-image-2.1',status:'running',workerId:fixture.worker.deviceUid,createdAt:now-142000,startedAt:now-140000,expiresAt:now+86400000,prompt:'Synthetic UI status only. No inference.',progress:{stage:name==='encoding'?'encoding-prompt':name==='publishing'?'publishing':'sampling',jobStartedAt:now-140000,stageStartedAt:now-35000,updatedAt:now-2000,stageDurations:{preparing:1500,'encoding-references':18000,'encoding-prompt':85500},step:name==='encoding'?null:8,total:name==='encoding'?null:40,resources:{sampledAt:now-2000,cpuPercent:29,ramUsedBytes:36*1073741824,ramTotalBytes:64*1073741824,gpuUtilPercent:98,vramUsedMiB:14950,vramTotalMiB:16384,gpuTempC:68}}}];
 if(name==='stale'){fixture.worker.updatedAt=now-91000;fixture.jobs[0].progress.jobStartedAt=now-240000;fixture.jobs[0].progress.stageStartedAt=now-125000;fixture.jobs[0].progress.updatedAt=now-91000;fixture.jobs[0].progress.resources.sampledAt=now-91000;}
 if(name==='missing'){fixture.jobs[0].progress={stage:'encoding-prompt',jobStartedAt:now-140000,stageStartedAt:now-35000,updatedAt:now,stageDurations:{preparing:1500},step:null,total:null,resources:{sampledAt:now,cpuPercent:null,ramUsedBytes:null,ramTotalBytes:null,gpuUtilPercent:null,vramUsedMiB:null,vramTotalMiB:null,gpuTempC:null}};}
 if(name==='failed')fixture.jobs[0].status='failed';
 await emitStudioSnapshots();
};
const scenario=new URL(location.href).searchParams.get('state');if(scenario)await setStudioFixtureState(scenario);
</script></body></html>`;
export const firestore=`
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
const listeners=new Set();
export function onSnapshot(target,options,next,error){
 const slot={target,next,error,active:true};listeners.add(slot);subscriptions.push(slot);
 queueMicrotask(async()=>{if(slot.active)next({...await (target.conditions?getDocs(target):getDoc(target)),metadata:{fromCache:false}});});
 return()=>{slot.active=false;listeners.delete(slot);};
}
window.emitStudioSnapshots=async()=>{await Promise.all([...listeners].map(async slot=>{const value=await (slot.target.conditions?getDocs(slot.target):getDoc(slot.target));if(slot.active)slot.next({...value,metadata:{fromCache:false}});}));await Promise.resolve();};
const rejectWrite=(...args)=>{mutations.push(args);throw Error('Fixture must never submit a job or mutate Firestore');};
export const setDoc=rejectWrite,updateDoc=rejectWrite,deleteDoc=rejectWrite;
`;
export async function startStudioFixture(port=0){
 const base=resolve(new URL('..',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));
 const server=createServer(async(req,res)=>{
  const pathname=new URL(req.url,'http://local').pathname;
  if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(fixture);return;}
  if(pathname==='/fixture-firestore.mjs'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(firestore);return;}
  if(pathname==='/fixture-auth.mjs'){res.writeHead(200,{'Content-Type':'text/javascript'});res.end(`export const onAuthStateChanged=(auth,callback)=>{queueMicrotask(()=>callback({uid:'fixture-owner'}));window.fixtureAuth=callback;return ()=>{};};`);return;}
  const file=resolve(base,'.'+pathname);
  if(!file.startsWith(base+'/')&&!file.startsWith(base+'\\')){res.writeHead(403);res.end();return;}
  if(!['.mjs','.js','.css'].includes(extname(file))){res.writeHead(404);res.end();return;}
  try{let content=await readFile(file,'utf8');if(pathname==='/studio.mjs')content=content.replace('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js','/fixture-firestore.mjs').replace('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js','/fixture-auth.mjs');res.writeHead(200,{'Content-Type':file.endsWith('.css')?'text/css':'text/javascript'});res.end(content);}catch{res.writeHead(404);res.end();}
 });
 await new Promise(resolve=>server.listen(port,'127.0.0.1',resolve));return{origin:`http://127.0.0.1:${server.address().port}`,close:()=>new Promise(resolve=>server.close(resolve))};
}
export async function inBrowser(operation){
 const server=await startStudioFixture();let browser;
 try{browser=await chromium.launch({headless:true,channel:'chrome'});return await operation(browser,server.origin);}
 finally{await browser?.close();await server.close();}
}
export async function openPage(browser,origin,viewport){
 const page=await browser.newPage({viewport});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('https://www.gstatic.com/firebasejs/**',async route=>{
  const auth=route.request().url().endsWith('firebase-auth.js');
  await route.fulfill({contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:auth?`export const onAuthStateChanged=(auth,callback)=>{queueMicrotask(()=>callback({uid:'fixture-owner'}));window.fixtureAuth=callback;return ()=>{};};`:firestore});
 });
 await page.goto(origin);try{await page.waitForFunction(()=>window.ready&&document.querySelector('#studioPcLabel').textContent==='PC ready',{},{timeout:10000});}catch(error){throw new Error(JSON.stringify({errors,state:await page.evaluate(()=>({ready:window.ready,label:document.querySelector('#studioPcLabel')?.textContent,message:document.querySelector('#studioMessage')?.textContent,reads:window.reads}))}),{cause:error});}
 await page.locator('#studioPrompt').fill('Synthetic UI check. Do not submit.');await page.locator('#studioConsent').check();
 return page;
}
export async function refresh(page){await page.evaluate(()=>emitStudioSnapshots());}
