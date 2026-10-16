import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,expect} from '@playwright/test';

const cwd=fileURLToPath(new URL('..',import.meta.url));
const origin=process.env.WEDDING_MOTION_ORIGIN||'http://127.0.0.1:4187';
if(!['http://127.0.0.1:4187','https://mahima-mayank.web.app'].includes(origin))throw Error('Unexpected motion verification origin');
const server=process.env.WEDDING_MOTION_ORIGIN?null:spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4187','--strictPort'],{cwd,stdio:'pipe'});
const evidence=fileURLToPath(new URL('../../.wedding-qa/motion-session/',import.meta.url));
const sample=page=>page.evaluate(()=>({state:document.querySelector('.garden-hero')?.dataset.motionState,time:document.getAnimations().find(a=>a.id==='botanical-sway')?.currentTime??null,headingOpacity:getComputedStyle(document.querySelector('h1')).opacity,headingTransform:getComputedStyle(document.querySelector('h1')).transform}));
let browser;const results=[],errors=[];
try{
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}if(i===59)throw Error('Motion verification origin did not start');await pause(300);}
  await mkdir(evidence,{recursive:true});
  browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  for(const width of[1440,390,360]){
    const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},reducedMotion:'no-preference'}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
    await page.goto(origin+'/');const control=page.locator('[data-motion-toggle]');await expect(control).toBeVisible();
    // Deliberately pause while the entrance can still be running: names/date must settle.
    await control.click();await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.ready)));
    const stopped=await sample(page);await pause(650);assert.equal((await sample(page)).time,stopped.time);assert.equal(stopped.headingOpacity,'1');assert.equal(stopped.headingTransform,'none');
    await expect(control).toHaveAccessibleName('Resume motion');await expect(control).toHaveAttribute('aria-pressed','true');
    await page.reload();await expect(control).toHaveAccessibleName('Resume motion');assert.equal((await sample(page)).headingOpacity,'1');
    await control.click();await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionState==='playing');const resumed=await sample(page);await pause(700);assert.ok((await sample(page)).time>resumed.time);
    await page.emulateMedia({reducedMotion:'reduce'});await expect(control).toBeHidden();await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionState==='reduced');const reduced=await sample(page);assert.equal(reduced.time,null);assert.equal(reduced.headingOpacity,'1');
    await page.emulateMedia({reducedMotion:'no-preference'});await expect(control).toBeVisible();await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionState==='playing');await pause(300);assert.ok((await sample(page)).time>0);
    await page.evaluate(()=>document.fonts.ready);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await page.evaluate(()=>[...document.images].some(image=>!image.complete||!image.naturalWidth)),false);
    await page.screenshot({path:evidence+'motion-production-'+width+'.png',fullPage:true});
    // A genuinely offscreen hero stops; no synthetic visibility override is used here.
    await page.setViewportSize({width,height:250});await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionState==='offscreen');await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.ready)));const offscreen=await sample(page);await pause(650);assert.equal((await sample(page)).time,offscreen.time);
    await page.evaluate(()=>scrollTo(0,0));await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionState==='playing');await pause(300);assert.ok((await sample(page)).time>offscreen.time);
    results.push({width,earlyPause:stopped,resumed,reduced,actualOffscreen:offscreen});await context.close();
  }
  assert.deepEqual(errors,[]);await writeFile(evidence+'motion-results.json',JSON.stringify({origin,checkedAt:new Date().toISOString(),results,errors,limits:'Real production browser motion and preference/offscreen controls; actual OS backgrounding and physical installed-device lifecycle are separate manual checks.'},null,2));
  console.log('PASS production invitation motion, persistent pause, reduced-motion changes and real offscreen lifecycle at1440/390/360');
}finally{await browser?.close();server?.kill();}
