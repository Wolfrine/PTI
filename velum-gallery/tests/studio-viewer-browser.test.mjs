// Real-browser gesture checks for the opened Studio creation. All media is
// synthetic: no owner account, Firebase requests, or Drive downloads.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

let chromium;
try { ({chromium}=createRequire(new URL('../../wedding-planner/package.json',import.meta.url))('playwright')); } catch {}

const fixture=`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
html,body{margin:0;background:#090609;color:#f4e3ee} #studioView{width:100vw;height:100dvh}
#studioDetailsPanel{position:fixed;inset:0;margin:0;padding:0;width:100vw;height:100dvh;max-height:none;max-width:none;border:0;background:#090609;color:#f4e3ee}
.studio-detail-image{height:70dvh;display:grid;place-items:center;touch-action:pan-y;user-select:none}
.studio-image-compare{width:100%;height:100%;border:0;background:#170e15;color:inherit;touch-action:pan-y;user-select:none}
.studio-compare-frame{display:block;width:100%;height:100%;position:relative}.studio-compare-frame img{width:100%;height:100%;object-fit:contain;pointer-events:none}
.studio-compare-source{position:absolute;inset:0} [hidden]{display:none!important}
.studio-detail-information{padding:12px}.studio-dialog-tools{display:flex;gap:8px}button,input{font-size:17px}
</style></head><body><section id="studioView"><dialog id="studioDetailsPanel"><div class="studio-dialog-tools"><button id="close" type="button">Close</button></div><div class="studio-detail-image"><button type="button" class="studio-image-compare" data-compare-original="job-1"><span class="studio-compare-frame"><img class="studio-detail-output" alt="Generated" src="data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='10'%20height='10'%3E%3Crect%20width='10'%20height='10'%20fill='pink'/%3E%3C/svg%3E"><img class="studio-compare-source" data-compare-source alt="Original" hidden></span><span data-compare-cue></span></button></div><section class="studio-detail-information"><input id="feedbackNote" placeholder="Notes"><button data-viewer-direction="prev">Previous</button><button data-viewer-direction="next">Next</button></section></dialog></section>
<script type="module">
import {createOriginalCompareController} from '/studio-compare.mjs';
import {createStudioViewerController} from '/studio-viewer.mjs';
const root=document.querySelector('#studioView'),dialog=root.querySelector('dialog'),compare=root.querySelector('[data-compare-original]');
const source={sha256:'a'.repeat(64),role:'subject',source:{kind:'file',id:'test',name:'source.png'}};
const job=id=>({id,status:'completed',model:'test',references:[source]});
let index=0,locked=false,originalCalls=0;const jobs=['job-1','job-2','job-3'];const previews={};
const current=()=>({job:job(jobs[index]),generatedUrl:'synthetic-result',previews,locked});
const original=createOriginalCompareController(root,{current,loadOriginal:async()=>{originalCalls++;previews[source.sha256]='data:image/svg+xml,%3Csvg%20xmlns="http://www.w3.org/2000/svg"%20width="10"%20height="10"%3E%3Crect%20width="10"%20height="10"%20fill="green"/%3E%3C/svg%3E';original.sync();}});
const viewer=createStudioViewerController(root,{isOpen:()=>dialog.open&&!locked,navigate:direction=>{const next=index+direction;if(next<0||next>=jobs.length)return false;index=next;original.reset();compare.dataset.compareOriginal=jobs[index];original.sync();window.moves.push(direction);return true;}});
window.moves=[];window.getState=()=>({index,originalCalls,comparing:compare.dataset.comparing});
window.setLocked=value=>{locked=value;viewer.reset();original.reset();};
window.closeViewer=()=>{dialog.close();viewer.reset();original.reset();};
window.openViewer=()=>{dialog.showModal();original.sync();};
window.syntheticPointer=(kind,x,y)=>{const target=kind==='pointerdown'?compare:window;target.dispatchEvent(new PointerEvent(kind,{bubbles:true,isPrimary:true,pointerId:33,pointerType:'touch',button:0,clientX:x,clientY:y}));};
document.querySelector('#close').onclick=window.closeViewer;
window.openViewer();window.ready=true;
</script></body></html>`;

async function withBrowser(run) {
  const files=new Map(await Promise.all(['studio-compare.mjs','studio-viewer.mjs','studio-archive.mjs'].map(async name=>['/'+name,await readFile(new URL('../'+name,import.meta.url))])));
  const server=createServer((request,response)=>{
    const path=new URL(request.url,'http://test').pathname;
    response.writeHead(200,{'Content-Type':path==='/'?'text/html':'text/javascript','Cache-Control':'no-store'});
    response.end(path==='/'?fixture:files.get(path)||'');
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
  try {
    browser=await chromium.launch({headless:true,channel:'chrome'});
    return await run(browser,`http://127.0.0.1:${server.address().port}`);
  } finally { await browser?.close();await new Promise(resolve=>server.close(resolve)); }
}

test('Studio viewer: mobile horizontal swipes follow selected archive in both directions without fetching originals',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,url)=>{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.goto(url);await page.waitForFunction(()=>window.ready);
  await page.evaluate(()=>{syntheticPointer('pointerdown',310,250);syntheticPointer('pointermove',180,252);syntheticPointer('pointerup',110,254);});
  assert.deepEqual(await page.evaluate(()=>window.moves),[1]);
  assert.equal(await page.evaluate(()=>getState().index),1);
  await page.waitForTimeout(200);
  await page.evaluate(()=>{syntheticPointer('pointerdown',60,260);syntheticPointer('pointermove',220,260);syntheticPointer('pointerup',300,260);});
  assert.deepEqual(await page.evaluate(()=>window.moves),[1,-1]);
  assert.equal(await page.evaluate(()=>getState().originalCalls),0);
  await page.close();
}));

test('Studio viewer: taps, short drags, vertical gestures, and cancellation do not navigate',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,url)=>{
  const page=await browser.newPage({viewport:{width:360,height:800},isMobile:true,hasTouch:true});
  await page.goto(url);await page.waitForFunction(()=>window.ready);
  await page.evaluate(()=>{
    syntheticPointer('pointerdown',180,230);syntheticPointer('pointerup',180,230);
    syntheticPointer('pointerdown',180,230);syntheticPointer('pointermove',155,230);syntheticPointer('pointerup',155,230);
    syntheticPointer('pointerdown',190,230);syntheticPointer('pointermove',195,320);syntheticPointer('pointerup',195,370);
    syntheticPointer('pointerdown',310,230);syntheticPointer('pointermove',180,233);syntheticPointer('pointercancel',180,233);syntheticPointer('pointerup',120,233);
  });
  assert.deepEqual(await page.evaluate(()=>window.moves),[]);
  await page.close();
}));

test('Studio viewer: keyboard arrows navigate except in text fields; disabled when closed or locked',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,url)=>{
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  await page.goto(url);await page.waitForFunction(()=>window.ready);
  await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>getState().index),1);
  await page.locator('#feedbackNote').focus();await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>getState().index),1);
  await page.evaluate(()=>document.activeElement.blur());await page.waitForTimeout(200);
  await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>getState().index),2);
  await page.waitForTimeout(200);await page.keyboard.press('ArrowRight');assert.equal(await page.evaluate(()=>getState().index),2,'no wrap beyond end');
  await page.evaluate(()=>closeViewer());await page.waitForTimeout(200);await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>getState().index),2);
  await page.evaluate(()=>{openViewer();setLocked(true);});await page.waitForTimeout(200);await page.keyboard.press('ArrowLeft');assert.equal(await page.evaluate(()=>getState().index),2);
  await page.close();
}));

test('Studio viewer: taps still compare the original on single-source images; viewer navigation resets compare',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,url)=>{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.goto(url);await page.waitForFunction(()=>window.ready);
  await page.locator('[data-compare-original]').tap();
  await page.waitForFunction(()=>document.querySelector('[data-compare-original]').dataset.comparing==='original');
  assert.equal(await page.evaluate(()=>getState().originalCalls),1);
  await page.evaluate(()=>{syntheticPointer('pointerdown',320,210);syntheticPointer('pointermove',160,214);syntheticPointer('pointerup',90,216);});
  assert.equal(await page.evaluate(()=>getState().index),1);
  assert.equal(await page.evaluate(()=>getState().comparing),'generated');
  await page.close();
}));

test('Studio viewer: actual mobile touch swipe does not become a comparison tap',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,url)=>{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.goto(url);await page.waitForFunction(()=>window.ready);
  const cdp=await page.context().newCDPSession(page);
  const touch=(x,y)=>({x,y,id:0});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touch(310,240)]});
  for(const x of [270,230,180,135,85])await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[touch(x,240)]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(()=>getState().index),1);
  assert.equal(await page.evaluate(()=>getState().originalCalls),0,'swipe must never read private source');
  assert.equal(await page.evaluate(()=>getState().comparing),'generated');
  await page.close();
}));

test('Studio viewer: explicit accessible previous/next buttons respect boundaries and closed state',{skip:!chromium&&'Playwright unavailable'},()=>withBrowser(async(browser,url)=>{
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await page.goto(url);await page.waitForFunction(()=>window.ready);
  await page.locator('[data-viewer-direction="prev"]').click();
  assert.equal(await page.evaluate(()=>getState().index),0);
  await page.waitForTimeout(200);
  await page.locator('[data-viewer-direction="next"]').click();
  assert.equal(await page.evaluate(()=>getState().index),1);
  await page.evaluate(()=>closeViewer());
  await page.evaluate(()=>document.querySelector('[data-viewer-direction="next"]').click());
  assert.equal(await page.evaluate(()=>getState().index),1);
  await page.close();
}));
