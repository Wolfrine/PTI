// Studio owner journey with local synthetic Firestore and a fake Drive target.
// Exercises the real mountStudio controller, not a reimplementation of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {resolve,dirname,relative,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

let chromium;
try { ({chromium}=createRequire(new URL('../../wedding-planner/package.json',import.meta.url))('playwright')); } catch {}

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const original=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6C7sAAAAASUVORK5CYII=','base64');
const sha256=createHash('sha256').update(original).digest('hex');
const manifest={mime:'image/png',sha256,bytes:original.byteLength,chunks:1,seconds:12};
const job=(id,seed)=>({id,model:'qwen-image-2.1',status:'completed',createdAt:Date.now()-seed*1000,seed,prompt:`Synthetic prompt ${seed}`,width:768,height:1024,consent:true,source:'test',result:manifest,references:[]});
const jobs=[job('job-1',1),job('job-2',2),job('job-3',3)];
const data={jobs,chunks:{index:0,data:original.toString('base64')}};
const html=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/redesign.css"></head><body><section id="studioView" class="studio-view"></section><script type="module">
import {mountStudio} from '/studio.mjs';
window.__mock={jobs:${JSON.stringify(data.jobs)},chunk:${JSON.stringify(data.chunks)},readResults:[],writes:[]};
const drive={clear(){},async save({job}){return {id:'drive-'+job.id,name:job.id+'.png'};},async listReferences(){return {files:[],cursor:''}},async readReference(){throw Error('No Drive source in synthetic test')},async loadQualityCreations(){return []}};
window.__studio=await mountStudio({app:{},auth:{},drive});window.__ready=true;
window.__swipe=(startX,endX)=>{const media=document.querySelector('#studioDetailsPanel .studio-detail-image img');const y=230;for(const [kind,x] of [['pointerdown',startX],['pointermove',(startX+endX)/2],['pointerup',endX]]){const node=kind==='pointerdown'?media:window;node.dispatchEvent(new PointerEvent(kind,{bubbles:true,isPrimary:true,pointerId:91,pointerType:'touch',button:0,clientX:x,clientY:y}));}};
</script></body></html>`;

// These are the only two network imports in Studio, and both are intercepted.
const authStub=`export function onAuthStateChanged(auth,callback){queueMicrotask(()=>callback({uid:'synthetic-owner'}));window.__fakeAuth=callback;return()=>{};}`;
const storeStub=`const mock=window.__mock;
const ref=(kind,parts)=>({kind,path:parts.join('/')});
const snap=(id,data)=>({id,exists:()=>data!=null,data:()=>data});
export const getFirestore=()=>({});
export const doc=(db,...parts)=>ref('doc',parts);
export const collection=(db,...parts)=>ref('collection',parts);
export const query=(base,...filters)=>({...base,filters});
export const where=(...parts)=>({type:'where',parts});
export const orderBy=(...parts)=>({type:'orderBy',parts});
export const limit=(...parts)=>({type:'limit',parts});
export const startAfter=(...parts)=>({type:'startAfter',parts});
export const documentId=()=>({type:'id'});
export async function getDoc(item){const p=item.path.split('/'),last=p.at(-1);
 if(item.path.endsWith('/status/pc'))return snap(last,{updatedAt:Date.now(),state:'idle',installed:['qwen-image-2.1'],version:'2.2.0'});
 if(item.path.includes('/devices/'))return snap(last,{status:'approved',deviceUid:last,approvedAt:Date.now()});
 if(p.at(-2)==='jobs')return snap(last,mock.jobs.find(job=>job.id===last));
 const saved=mock.writes.find(record=>record.path===item.path);return snap(last,saved?.data??null);
}
export async function getDocs(item){const p=item.path.split('/'),last=p.at(-1);
 if(last==='chunks'&&p.includes('jobs')){mock.readResults.push(p[p.indexOf('jobs')+1]);return {docs:[snap('0',mock.chunk)]};}
 if(last==='jobs')return {docs:mock.jobs.map(job=>snap(job.id,job))};
 return {docs:[]};
}
export async function setDoc(item,value){mock.writes.push({path:item.path,data:value});}
export async function updateDoc(item,value){mock.writes.push({path:item.path,data:value});}
export async function deleteDoc(item){mock.writes=mock.writes.filter(record=>record.path!==item.path);}`;

async function withBrowser(run){
  const server=createServer(async(request,response)=>{
    const name=new URL(request.url,'http://local').pathname;
    if(name==='/'){response.writeHead(200,{'Content-Type':'text/html'}).end(html);return;}
    const path=resolve(root,'.'+name),rel=relative(root,path);
    if(rel==='..'||rel.startsWith('..'+sep)){response.writeHead(403).end();return;}
    try{response.writeHead(200,{'Content-Type':extname(path)==='.css'?'text/css':'text/javascript'}).end(await readFile(path));}
    catch{response.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try{browser=await chromium.launch({headless:true,channel:'chrome'});return await run(browser,`http://127.0.0.1:${server.address().port}`);}
  finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}

test('Studio journey: image swipe, save, return to Create, lock, and no neighbor prefetch',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,origin)=>{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  await page.route('https://www.gstatic.com/firebasejs/**',route=>{
    const auth=route.request().url().includes('firebase-auth');
    return route.fulfill({status:200,contentType:'text/javascript',headers:{'access-control-allow-origin':'*'},body:auth?authStub:storeStub});
  });
  await page.goto(origin);
  try { await page.waitForFunction(()=>window.__ready&&document.querySelector('#studioCreateTab')&&document.querySelector('#studioResult img'),{},{timeout:6000}); }
  catch(error){throw new Error('Studio fixture did not mount: '+JSON.stringify({errors,html:await page.locator('body').innerText(),mock:await page.evaluate(()=>Boolean(window.__mock)),ready:await page.evaluate(()=>Boolean(window.__ready))}));}
  assert.deepEqual(errors,[]);
  await page.locator('#studioCreationsTab').click();
  await page.locator('[data-creation="job-2"]').waitFor();
  await page.locator('[data-creation="job-2"]').click();
  await page.waitForFunction(()=>document.querySelector('#studioDetailsPanel').open&&document.querySelector('#studioViewerPosition').textContent.includes('2 /'));
  assert.deepEqual(await page.evaluate(()=>window.__mock.readResults),['job-1','job-2']);
  await page.locator('#studioDetailsPanel [data-action="toggle-details"]').click();
  await page.locator('#studioFeedback input[value="keep"]').check();
  await page.locator('#studioFeedback .studio-feedback-save').click();
  await page.waitForFunction(()=>window.__mock.writes.some(write=>write.path.endsWith('/feedback/job-2')));
  await page.locator('#studioDetailsPanel .studio-creation-manage > summary').click();
  await page.locator('#studioDetailsPanel [data-action="arm-remove"]').click();
  assert.equal(await page.evaluate(()=>window.__mock.writes.some(write=>write.path.endsWith('/removed/job-2'))),false,'first remove tap only arms confirmation');
  await page.locator('#studioDetailsPanel [data-action="close-details"]').click();
  await page.evaluate(()=>__swipe(315,95));
  await page.waitForFunction(()=>document.querySelector('#studioViewerPosition').textContent.includes('3 /'));
  await page.waitForFunction(()=>window.__mock.readResults.includes('job-3'));
  assert.deepEqual(await page.evaluate(()=>window.__mock.readResults),['job-1','job-2','job-3'],'do not prefetch non-selected originals');
  await page.locator('#studioDetailsPanel .studio-viewer-actions [data-action="save"]').click();
  await page.waitForFunction(()=>window.__mock.writes.some(write=>write.path.endsWith('/saves/job-3')));
  assert.equal(await page.locator('#studioDetailsPanel').evaluate(el=>el.open),true,'save keeps the viewer open');
  await page.locator('#studioDetailsPanel [data-close]').click();
  await page.waitForFunction(()=>!document.querySelector('#studioDetailsPanel').open);
  await page.locator('#studioCreateTab').click();
  assert.match(await page.locator('#studioResult .studio-canvas-caption').innerText(),/Seed 1/,'original Create selection restored');
  await page.locator('#studioCreationsTab').click();
  await page.locator('[data-creation="job-2"]').click();
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('velum:lock')));
  await page.waitForFunction(()=>!document.querySelector('#studioDetailsPanel').open);
  assert.equal(await page.locator('#studioResult img').count(),0,'locking removes private full-resolution media');
  assert.deepEqual(errors,[]);
  await page.close();
}));
