// Synthetic state only: production controller/rendering, no credentials, media,
// Firebase writes, queue submissions or inference.
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium,inBrowser,openPage,refresh} from './studio-live-browser-fixture.mjs';

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

test('live progress renders truthful compact states on desktop and small phones',{skip:!chromium&&'Local Playwright unavailable'},()=>inBrowser(async(browser,origin)=>{
 for(const viewport of [{width:1440,height:900},{width:390,height:844},{width:360,height:800}]){
  const page=await openPage(browser,origin,viewport);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  for(const scenario of ['encoding','sampling','publishing','stale','missing']){
   await page.evaluate(name=>setStudioFixtureState(name),scenario);
   await page.locator('#studioLiveProgress').waitFor({state:'visible'});
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`${scenario} fits ${viewport.width}`);
   assert.equal(await page.locator('#studioGenerate').isEnabled(),false);
   assert.equal(await page.locator('#studioResult').isVisible(),false,'active status has one visual home');
   if(scenario==='sampling')assert.match(await page.locator('#studioLiveProgress').innerText(),/8 \/ 40 steps/);
   if(scenario==='encoding'||scenario==='missing')assert.doesNotMatch(await page.locator('#studioLiveProgress').innerText(),/steps/);
   if(scenario==='stale')assert.match(await page.locator('#studioLiveProgress').innerText(),/PC offline · last report/);
   if(scenario==='missing')assert.equal(await page.locator('#studioLiveProgress dd').allTextContents().then(values=>values.every(value=>value==='—')),true);
   if(process.env.VELUM_UI_EVIDENCE_DIR){await mkdir(process.env.VELUM_UI_EVIDENCE_DIR,{recursive:true});await page.screenshot({path:join(process.env.VELUM_UI_EVIDENCE_DIR,`studio-live-${scenario}-${viewport.width}.png`),fullPage:true});}
  }
  await page.evaluate(async()=>{
   await setStudioFixtureState('encoding');
   fixture.jobs[0].progress.stage='loading-diffusion';
   await emitStudioSnapshots();
  });
  assert.equal(await page.locator('#studioLiveProgress h2').innerText(),'Preparing the first image step');
  assert.doesNotMatch(await page.locator('#studioLiveProgress').innerText(),/\d+ \/ \d+ steps/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  if(process.env.VELUM_UI_EVIDENCE_DIR)await page.screenshot({path:join(process.env.VELUM_UI_EVIDENCE_DIR,`studio-live-first-step-${viewport.width}.png`),fullPage:true});
  await page.evaluate(()=>setStudioFixtureState('sampling'));await page.locator('#studioLiveProgress summary').click();
  const summary=page.locator('#studioLiveProgress summary');await summary.focus();await page.waitForTimeout(1100);
  assert.equal(await summary.evaluate(node=>node===document.activeElement),true,'local ticks preserve disclosure focus');
  assert.equal(await page.locator('#studioLiveProgress details').evaluate(node=>node.open),true);
  assert.match(await page.locator('#studioLiveProgress details').innerText(),/1m 25s/);
  if(process.env.VELUM_UI_EVIDENCE_DIR)await page.screenshot({path:join(process.env.VELUM_UI_EVIDENCE_DIR,`studio-live-stages-${viewport.width}.png`),fullPage:true});
  assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>mutations),[]);await page.close();
 }
}));

test('ticks and repeated refreshes create no reads; lock, hide, leave, logout and teardown detach streams',{skip:!chromium&&'Local Playwright unavailable'},()=>inBrowser(async(browser,origin)=>{
 const page=await openPage(browser,origin,{width:390,height:844});
 const active=()=>page.evaluate(()=>subscriptions.filter(slot=>slot.active).length);
 await page.waitForTimeout(100);assert.equal(await active(),4);
 if(page.clock?.install)await page.clock.install();
 const before=await page.evaluate(()=>({reads:reads.length,starts:subscriptions.length}));
 await page.evaluate(()=>{studio.refresh();studio.refresh();studio.refresh();});
 if(page.clock?.fastForward)await page.clock.fastForward(65000);else await page.waitForTimeout(2200);
 assert.deepEqual(await page.evaluate(()=>({reads:reads.length,starts:subscriptions.length})),before);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});assert.equal(await active(),0);
 await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});await page.waitForFunction(()=>subscriptions.filter(slot=>slot.active).length===4);
 await page.evaluate(()=>{document.querySelector('#studioView').classList.add('view');});await page.waitForFunction(()=>subscriptions.every(slot=>!slot.active));
 await page.evaluate(()=>document.querySelector('#studioView').classList.add('active'));await page.waitForFunction(()=>subscriptions.filter(slot=>slot.active).length===4);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('velum:lock')));assert.equal(await active(),0);
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('velum:unlock')));await page.waitForFunction(()=>subscriptions.filter(slot=>slot.active).length===4);
 await page.evaluate(()=>fixtureAuth(null));assert.equal(await active(),0);assert.equal(await page.locator('#studioGenerate').isEnabled(),false);
 await page.evaluate(()=>fixtureAuth({uid:'fixture-owner'}));await page.waitForFunction(()=>subscriptions.filter(slot=>slot.active).length===4);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));assert.equal(await active(),0);
 await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));await page.waitForFunction(()=>subscriptions.filter(slot=>slot.active).length===4);
 await page.evaluate(()=>studio.destroy());assert.equal(await active(),0);
 await page.evaluate(()=>{window.dispatchEvent(new Event('online'));window.dispatchEvent(new CustomEvent('velum:unlock'));fixtureAuth({uid:'fixture-owner'});});assert.equal(await active(),0);
 await page.evaluate(async()=>{const {mountStudio}=await import('/studio.mjs');studio=await mountStudio({app:{},auth:{},drive:{clear(){},async listReferences(){return {files:[]}},async loadQualityCreations(){return []}}});});
 if(page.clock?.runFor)await page.clock.runFor(1);
 await page.waitForFunction(()=>subscriptions.filter(slot=>slot.active).length===4);
 await page.locator('#studioPrompt').fill('Remounted fixture. Do not send.');await page.locator('#studioConsent').check();
 assert.equal(await page.locator('#studioGenerate').isEnabled(),true);
 await page.locator('#studioCreationsTab').click();assert.equal(await page.locator('#studioCreations').isVisible(),true);
 await page.evaluate(()=>studio.destroy());assert.equal(await active(),0);assert.deepEqual(await page.evaluate(()=>mutations),[]);
 await page.close();
}));
