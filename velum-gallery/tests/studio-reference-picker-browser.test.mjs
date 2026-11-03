// Real browser UI contracts with visibly synthetic images. No Firebase, OAuth or private media.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
let chromium;
try { ({chromium}=createRequire(new URL('../../wedding-planner/package.json',import.meta.url))('playwright')); } catch {}

const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/studio.css"></head><body><button id="opener">Open references</button><section id="studioView" class="studio-view"></section><script type="module">
import {createReferencePicker} from '/studio-reference-picker.mjs';
import {renderStudioShell,renderStudioState,renderCreationDetails} from '/studio-view.mjs';
import {PC_DEVICE_UID} from '/device-config.mjs';
const asset='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500"><rect width="400" height="500" fill="#655063"/><circle cx="200" cy="200" r="130" fill="#d0bca0"/><text x="200" y="460" text-anchor="middle" fill="white">SYNTHETIC UI FIXTURE</text></svg>');
window.files=Array.from({length:12},(_,i)=>({id:'file-'+i,name:'Synthetic reference '+i+'.png',thumbnailLink:asset,mimeType:'image/png',folderLabel:i%2?'References':'Private',folderId:'folder-'+i%2}));
window.calls=[];window.requests=[];window.mode='normal';window.exitCount=0;window.addEventListener('velum:quick-exit',()=>exitCount++);
window.picker=createReferencePicker({drive:{async listReferences(options){calls.push({folder:options.folder,search:options.search,cursor:options.cursor});if(mode==='pending')return new Promise(resolve=>requests.push({resolve,signal:options.signal}));if(mode==='error')throw Error('Synthetic failure');if(mode==='empty')return {files:[],cursor:''};if(mode==='pages')return options.cursor?{files:files.slice(6),cursor:''}:{files:files.slice(0,6),cursor:'page-2'};return {files:files.filter(file=>(options.folder==='all'||file.folderLabel.toLowerCase()===options.folder)&&file.name.toLowerCase().includes(options.search.toLowerCase())),cursor:''};}}});
window.openPicker=(limit=3,selectedIds=[])=>{document.querySelector('#opener').focus();window.result=null;window.choice=picker.choose({limit,selectedIds}).then(value=>result=value);};
window.view=document.querySelector('#studioView');renderStudioShell(view);
window.state={signedIn:true,connected:true,jobs:[],archiveJobs:[],references:[],binding:{deviceUid:PC_DEVICE_UID,status:'approved'},worker:{deviceUid:PC_DEVICE_UID,version:'2.3.0',state:'idle',updatedAt:Date.now(),installed:['flux2-klein-fp8','qwen-image-2.1'],capabilities:{referenceModels:['flux2-klein-fp8','qwen-image-2.1'],qwenMaxReferences:10}},poseEnabled:false};
view.querySelector('#studioPrompt').value='Original words remain untouched.';view.querySelector('#studioConsent').checked=true;view.querySelector('#studioModel').value='flux2-klein-fp8';window.draw=()=>renderStudioState(view,state);draw();
window.makeReference=i=>({url:asset,manifest:{sha256:String(i).padStart(64,'0'),role:'subject',source:{id:files[i].id,name:files[i].name,kind:'drive'},width:400,height:500}});
window.showDetails=()=>{state.jobs=[{id:'synthetic-job',model:'qwen-image-2.1',status:'completed',createdAt:Date.now(),seed:123,width:400,height:500,prompt:'Original words remain untouched.',effectivePrompt:'Original words remain untouched.\\n\\nRecorded pose instruction.',pose:{mode:'image',catalogId:'synthetic-catalog',fileId:'pose-source',category:'standard',label:'Synthetic pose',instruction:'Recorded pose instruction.',referenceIndex:1},references:[makeReference(0).manifest,{...makeReference(1).manifest,role:'pose',source:{id:'pose-source',name:'Synthetic pose.png',kind:'drive'}}],result:{settings:{steps:40,seed:123,fixture:'SYNTHETIC NO INFERENCE'}}}];state.selectedId='synthetic-job';state.resultUrl=asset;state.referencePreviews={[makeReference(0).manifest.sha256]:asset};renderCreationDetails(view,state);};
window.ready=true;</script></body></html>`;

async function inBrowser(operation){
 const names=['studio-reference-picker.mjs','studio-view.mjs','studio-compare.mjs','studio-contract.mjs','studio-archive.mjs','studio-recovery.mjs','device-config.mjs','styles.css','studio.css'];
 const files=new Map(await Promise.all(names.map(async name=>['/'+name,await readFile(new URL('../'+name,import.meta.url))])));
 const server=createServer((req,res)=>{const pathname=new URL(req.url,'http://local').pathname;if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(fixture);}else if(files.has(pathname)){res.writeHead(200,{'Content-Type':pathname.endsWith('.css')?'text/css':'text/javascript'});res.end(files.get(pathname));}else{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
 try{browser=await chromium.launch({headless:true,channel:'chrome'});const origin='http://127.0.0.1:'+server.address().port;return await operation(browser,origin);}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}

test('reference picker: ordered metadata, cap, existing IDs, folders, recents and cursor paging in desktop/mobile Chrome',{skip:!chromium&&'Local Playwright unavailable'},()=>inBrowser(async(browser,origin)=>{
 for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
  const page=await browser.newPage({viewport});await page.goto(origin);await page.waitForFunction(()=>window.ready);
  await page.evaluate(()=>openPicker(2,['file-0']));await page.locator('[data-picker-file="file-0"]').waitFor();
  assert.equal(await page.locator('[data-picker-file="file-0"]').getAttribute('aria-disabled'),'true');
  await page.locator('[data-picker-file="file-0"]').dispatchEvent('click');assert.equal(await page.locator('[data-picker-selection]').count(),0);
  await page.locator('[data-picker-file="file-1"]').click();await page.locator('[data-picker-file="file-2"]').click();await page.locator('[data-picker-file="file-3"]').click();assert.equal(await page.locator('[data-picker-selection]').count(),2);
  await page.locator('[data-picker-review]').click();await page.locator('[data-picker-up="1"]').click();assert.equal(await page.evaluate(()=>document.activeElement.closest('[data-picker-selection]')!==null),true);
  await page.locator('[data-picker-confirm]').click();await page.waitForFunction(()=>result!==null);assert.deepEqual(await page.evaluate(()=>result.map(file=>[file.id,file.folderLabel])),[['file-2','Private'],['file-1','References']]);
  await page.evaluate(()=>openPicker());await page.locator('[data-picker-file]').first().waitFor();await page.locator('[data-picker-folder="recent"]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-picker-file]').length===2);assert.equal(await page.locator('[data-picker-file]').first().getAttribute('data-picker-file'),'file-2');
  await page.locator('[data-picker-folder="references"]').click();await page.locator('[data-picker-search]').fill('reference 1.');await page.waitForFunction(()=>window.calls.at(-1)?.search==='reference 1.'&&document.querySelectorAll('[data-picker-file]').length===1);assert.equal(await page.locator('[data-picker-file]').count(),1);assert.deepEqual(await page.evaluate(()=>calls.at(-1)),{folder:'references',search:'reference 1.',cursor:''});
  await page.locator('[data-picker-close]').focus();await page.keyboard.press('Escape');await page.waitForFunction(()=>result!==null);assert.deepEqual(await page.evaluate(()=>result),[]);assert.equal(await page.locator('#opener').evaluate(el=>el===document.activeElement),true);
  await page.evaluate(()=>{mode='pages';openPicker();});await page.locator('[data-picker-more]').waitFor();await page.locator('[data-picker-more]').click();await page.waitForFunction(()=>document.querySelectorAll('[data-picker-file]').length===12);assert.equal(await page.evaluate(()=>calls.at(-1).cursor),'page-2');
  assert.equal(await page.evaluate(()=>{const el=document.querySelector('.studio-reference-picker');return el.scrollWidth<=el.clientWidth;}),true);
  await page.evaluate(()=>picker.clear());await page.close();
 }
}));

test('reference picker: errors retry, in-flight abort/late results, repeated choose and Quick Exit clear private state',{skip:!chromium&&'Local Playwright unavailable'},()=>inBrowser(async(browser,origin)=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(origin);await page.waitForFunction(()=>window.ready);
 await page.evaluate(()=>{mode='error';openPicker();});await page.locator('[data-picker-retry]').waitFor();await page.evaluate(()=>mode='normal');await page.locator('[data-picker-retry]').click();await page.locator('[data-picker-file]').first().waitFor();await page.locator('[data-picker-close]').click();
 await page.evaluate(()=>{mode='pending';openPicker();});await page.waitForFunction(()=>requests.length===1);await page.evaluate(()=>{picker.clear();requests[0].resolve({files,cursor:''});});await page.waitForTimeout(20);assert.equal(await page.evaluate(()=>requests[0].signal.aborted),true);assert.equal(await page.locator('.studio-reference-picker').count(),0);assert.deepEqual(await page.evaluate(()=>result),[]);
 await page.evaluate(()=>{mode='normal';openPicker();});await page.locator('[data-picker-file]').first().waitFor();await page.locator('[data-picker-file="file-0"]').click();await page.locator('[data-picker-confirm]').click();await page.waitForFunction(()=>result!==null);
 await page.evaluate(()=>openPicker());await page.locator('[data-picker-file]').first().waitFor();await page.locator('[data-picker-quick-exit]').click();await page.waitForFunction(()=>result!==null);assert.equal(await page.evaluate(()=>exitCount),1);assert.deepEqual(await page.evaluate(()=>result),[]);assert.equal(await page.locator('.studio-reference-picker').count(),0);
 await page.evaluate(()=>openPicker());await page.locator('[data-picker-file]').first().waitFor();await page.locator('[data-picker-folder="recent"]').click();await page.locator('[data-picker-empty]').waitFor();assert.equal(await page.locator('[data-picker-file]').count(),0);
 await page.evaluate(()=>{window.first=picker.choose({limit:1});window.second=picker.choose({limit:1});});assert.deepEqual(await page.evaluate(()=>first),[]);assert.equal(await page.locator('.studio-reference-picker').count(),1);await page.evaluate(()=>picker.clear());assert.deepEqual(await page.evaluate(()=>second),[]);
 await page.close();
}));

test('Studio pose/reference UI: default off, image cap, unresolved pose gate and original/effective/source lineage',{skip:!chromium&&'Local Playwright unavailable'},()=>inBrowser(async(browser,origin)=>{
 const page=await browser.newPage({viewport:{width:390,height:844}});await page.goto(origin);await page.waitForFunction(()=>window.ready);
 assert.equal(await page.locator('#studioPoseEnabled').isChecked(),false);assert.equal(await page.locator('#studioGenerate').isEnabled(),true);
 await page.evaluate(()=>{state.poseEnabled=true;draw();});assert.equal(await page.locator('#studioGenerate').isEnabled(),false);assert.match(await page.locator('#studioSubmitNote').textContent(),/subject reference/);
 await page.evaluate(()=>{state.references=[makeReference(0)];state.poseLoading=true;draw();});assert.equal(await page.locator('#studioGenerate').isEnabled(),false);
 await page.evaluate(()=>{state.poseLoading=false;state.pose={fileId:'synthetic-pose',label:'Synthetic pose',category:'standard',url:files[1].thumbnailLink,mode:'image'};draw();});assert.equal(await page.locator('#studioGenerate').isEnabled(),true);assert.equal(await page.locator('#studioRefCount').textContent(),'2/2');assert.match(await page.locator('#studioAdvancedOpen').textContent(),/Pose on/);
 await page.evaluate(()=>{state.references.push(makeReference(2));draw();});assert.equal(await page.locator('#studioGenerate').isEnabled(),false);assert.equal(await page.locator('#studioRefCount').textContent(),'3/2');
 await page.evaluate(()=>{state.poseError='Synthetic pose failed';draw();});assert.equal(await page.locator('#studioGenerate').isEnabled(),false);
 await page.evaluate(()=>showDetails());const text=await page.locator('#studioDetails').textContent();for(const value of ['Original words remain untouched.','Effective prompt sent to the model','Actual generation settings','Subject reference','Pose reference','Source ID: pose-source','Recorded pose instruction.'])assert.ok(text.includes(value),value);
 assert.equal(await page.locator('.studio-source-comparison img').getAttribute('loading'),'lazy');assert.equal(await page.locator('[data-source-reference="1"]').textContent(),'Load source preview');await page.close();
}));
