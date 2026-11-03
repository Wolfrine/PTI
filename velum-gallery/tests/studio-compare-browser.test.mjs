// Isolated real-browser verification: synthetic media, no Firebase, Google, or owner data.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';

let chromium;
try { ({chromium}=createRequire(new URL('../../wedding-planner/package.json',import.meta.url))('playwright')); } catch {}
const screenshotRoot=process.env.VELUM_COMPARE_VISUAL_DIR;
async function capture(page,name){if(!screenshotRoot)return;await mkdir(screenshotRoot,{recursive:true});await page.screenshot({path:join(screenshotRoot,name+'.png')});}

const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/studio.css"><link rel="stylesheet" href="/redesign.css"></head><body><section id="studioView" class="studio-view"></section><script type="module">
import {renderStudioShell,renderStudioState,renderCreationDetails,selectedJob} from '/studio-view.mjs';
import {createOriginalCompareController} from '/studio-compare.mjs';
const svg=(label,color,width=560,height=700)=>'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="'+width+'" height="'+height+'" viewBox="0 0 '+width+' '+height+'"><rect width="'+width+'" height="'+height+'" fill="'+color+'"/><text x="'+(width/2)+'" y="'+(height/2)+'" fill="white" font-size="32" font-family="system-ui" text-anchor="middle">'+label+'</text></svg>');
window.generated=svg('GENERATED','#624156');window.original=svg('ORIGINAL','#39665a',700,350);
window.sha='a'.repeat(64);window.source={sha256:sha,role:'subject',bytes:135,chunks:1,source:{kind:'file',id:'synthetic',name:'synthetic-reference.png'}};
window.makeJob=(id,refs=[source])=>({id,status:'completed',model:'qwen-image-2.1',seed:123,createdAt:Date.now(),width:560,height:700,prompt:'Synthetic browser test',result:{mime:'image/png'},references:refs});
window.job=makeJob('job-1');window.state={signedIn:true,connected:true,mode:'create',jobs:[job],archiveJobs:[],selectedId:job.id,resultUrl:generated,referencePreviews:{},references:[],binding:null,worker:null,archiveHasMore:false,saves:{},removed:{}};
window.view=document.querySelector('#studioView');renderStudioShell(view);
window.draw=()=>{renderStudioState(view,state);controller.sync();};
window.drawDetails=()=>{renderCreationDetails(view,state);controller.sync();};
window.calls=0;window.holdRequests=[];window.pending=false;window.locked=false;
window.loadOriginal=async()=>{calls++;if(pending)await new Promise(resolve=>holdRequests.push(resolve));if(!locked)state.referencePreviews[sha]=original;drawDetails();};
window.controller=createOriginalCompareController(view,{current:()=>({job:selectedJob(state),generatedUrl:state.resultUrl,previews:state.referencePreviews,locked}),loadOriginal:()=>loadOriginal()});
window.resolveRequests=()=>{holdRequests.splice(0).forEach(resolve=>resolve());};
window.setRefs=refs=>{controller.reset();state.jobs[0]=makeJob('job-'+Math.random().toString().slice(2),refs);state.selectedId=state.jobs[0].id;state.referencePreviews={};state.resultUrl=generated;document.querySelector('#studioResult').dataset.signature='';draw();};
window.openDetails=()=>{drawDetails();document.querySelector('#studioDetailsPanel').showModal();};
window.pointer=(kind,selector)=>{const el=kind==='pointerdown'?document.querySelector(selector):window;const r=document.querySelector(selector).getBoundingClientRect();el.dispatchEvent(new PointerEvent(kind,{bubbles:true,isPrimary:true,pointerId:5,pointerType:'touch',button:0,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));};
draw();window.ready=true;
</script></body></html>`;

async function withBrowser(operation){
  const names=['studio-view.mjs','studio-compare.mjs','studio-contract.mjs','studio-archive.mjs','studio-recovery.mjs','device-config.mjs','styles.css','studio.css','redesign.css'];
  const files=new Map(await Promise.all(names.map(async name=>['/'+name,await readFile(new URL('../'+name,import.meta.url))])));
  const server=createServer((request,response)=>{const name=new URL(request.url,'http://local').pathname;if(name==='/'){response.writeHead(200,{'Content-Type':'text/html'});response.end(fixture);}else if(files.has(name)){response.writeHead(200,{'Content-Type':name.endsWith('.css')?'text/css':'text/javascript'});response.end(files.get(name));}else{response.writeHead(404);response.end();}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try {browser=await chromium.launch({headless:true,channel:'chrome'});return await operation(browser,`http://127.0.0.1:${server.address().port}`);}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
}

test('Studio compare: mobile tap toggles only one valid subject reference and stays on dark theme',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,origin)=>{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.goto(origin);await page.waitForFunction(()=>window.ready);
  const compare=page.locator('#studioResult [data-compare-original]');
  assert.equal(await compare.count(),1);
  assert.match(await compare.locator('[data-compare-cue]').innerText(),/Tap to compare/);
  assert.equal(await page.evaluate(()=>calls),0,'loading must be on-demand');
  await capture(page,'create-generated-390');
  const before=await compare.boundingBox();
  await compare.tap();
  await page.waitForFunction(()=>document.querySelector('#studioResult [data-compare-original]').dataset.comparing==='original');
  assert.equal(await page.evaluate(()=>calls),1);
  assert.equal(await compare.getAttribute('aria-pressed'),'true');
  assert.equal(await compare.locator('[data-compare-source]').getAttribute('src'),await page.evaluate(()=>original));
  assert.equal(await compare.locator('[data-compare-source]').isVisible(),true);
  const after=await compare.boundingBox();
  assert.ok(Math.abs(before.height-after.height)<2,'comparison must keep canvas height despite opposing aspect ratios');
  await capture(page,'create-original-390');
  await compare.tap();
  assert.equal(await compare.getAttribute('data-comparing'),'generated');
  assert.equal(await compare.locator('[data-compare-source]').isVisible(),false);
  assert.equal(await compare.locator('.studio-compare-frame > img:not([data-compare-source])').getAttribute('src'),await page.evaluate(()=>generated));
  await page.evaluate(()=>setRefs([]));assert.equal(await compare.count(),0);
  await page.evaluate(()=>setRefs([source,{...source,sha256:'b'.repeat(64)}]));assert.equal(await compare.count(),0);
  await page.evaluate(()=>setRefs([{...source,role:'pose'}]));assert.equal(await compare.count(),0);
  await page.evaluate(()=>setRefs([source]));assert.equal(await compare.count(),1);
  assert.equal(await page.locator('html').evaluate(el=>el.scrollWidth<=el.clientWidth),true);
  await page.close();
}));

test('Studio compare: hold peeks and release restores, even when details redraw during hold',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,origin)=>{
  const page=await browser.newPage({viewport:{width:360,height:800},isMobile:true,hasTouch:true});await page.goto(origin);await page.waitForFunction(()=>window.ready);
  const selector='#studioResult [data-compare-original]';
  await page.evaluate(selector=>pointer('pointerdown',selector),selector);
  await page.waitForFunction(()=>document.querySelector('#studioResult [data-compare-original]').dataset.comparing==='original');
  assert.match(await page.locator(selector+' [data-compare-cue]').innerText(),/release to return/);
  await capture(page,'create-hold-original-360');
  assert.equal(await page.locator(selector).getAttribute('aria-pressed'),'false','hold is a transient peek, not a pinned toggle');
  await page.evaluate(selector=>pointer('pointerup',selector),selector);
  assert.equal(await page.locator(selector).getAttribute('data-comparing'),'generated');
  await page.evaluate(()=>openDetails());
  const detail='#studioDetails [data-compare-original]';assert.equal(await page.locator(detail).count(),1);
  await capture(page,'details-generated-360');
  await page.evaluate(selector=>pointer('pointerdown',selector),detail);
  await page.waitForFunction(()=>document.querySelector('#studioDetails [data-compare-original]').dataset.comparing==='original');
  await page.evaluate(()=>drawDetails()); // async source loading recreates the details DOM.
  assert.equal(await page.locator(detail).getAttribute('data-comparing'),'original');
  await capture(page,'details-hold-original-360');
  await page.evaluate(selector=>pointer('pointerup',selector),detail);
  assert.equal(await page.locator(detail).getAttribute('data-comparing'),'generated');
  await page.locator(detail).click();assert.equal(await page.locator(detail).getAttribute('data-comparing'),'original');
  await page.locator(detail).click();assert.equal(await page.locator(detail).getAttribute('data-comparing'),'generated');
  await page.close();
}));

test('Studio compare: delayed source does not appear after release or session lock',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,origin)=>{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await page.goto(origin);await page.waitForFunction(()=>window.ready);
  await page.evaluate(()=>{pending=true;});const selector='#studioResult [data-compare-original]';
  await page.evaluate(selector=>pointer('pointerdown',selector),selector);
  await page.waitForFunction(()=>holdRequests.length===1);
  assert.match(await page.locator(selector+' [data-compare-cue]').innerText(),/Loading original/);
  await page.evaluate(selector=>pointer('pointerup',selector),selector);
  await page.evaluate(()=>resolveRequests());
  await page.waitForFunction(()=>state.referencePreviews[sha]);
  assert.equal(await page.locator(selector).getAttribute('data-comparing'),'generated');
  await page.evaluate(()=>{controller.reset();state.referencePreviews={};pending=true;controller.sync();});
  await page.evaluate(()=>document.querySelector('#studioResult [data-compare-original]').click());
  await page.waitForFunction(()=>holdRequests.length===1,{},{timeout:5000});
  await page.evaluate(()=>{locked=true;controller.reset();state.resultUrl='';state.referencePreviews={};resolveRequests();document.querySelector('#studioResult').dataset.signature='';draw();});
  assert.equal(await page.locator('[data-compare-original]').count(),0,'lock must clear compare control');
  assert.equal(await page.evaluate(()=>Object.values(state.referencePreviews).length),0);
  await page.close();
}));
