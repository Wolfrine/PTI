import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const base='design/motion-session';await mkdir(base+'/round2-video',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined}),states=[];
try {
 for(const width of[1440,390,360]){
  const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},recordVideo:{dir:base+'/round2-video',size:{width,height:width===1440?1000:844}},reducedMotion:'no-preference'});
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5177/');await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionReady==='true');
  await page.locator('[data-motion-toggle]').click();
  await page.evaluate(()=>Promise.all(document.getAnimations().map(animation=>animation.ready)));
  const paused=await page.evaluate(()=>({nameOpacity:getComputedStyle(document.querySelector('h1')).opacity,nameTransform:getComputedStyle(document.querySelector('h1')).transform,ambient:document.getAnimations().find(a=>a.id==='botanical-sway')?.currentTime,playState:document.getAnimations().find(a=>a.id==='botanical-sway')?.playState}));
  await page.waitForTimeout(600);const pausedAfter=await page.evaluate(()=>document.getAnimations().find(a=>a.id==='botanical-sway')?.currentTime);
  assert.equal(paused.nameOpacity,'1');assert.equal(paused.nameTransform,'none');assert.equal(paused.playState,'paused');assert.equal(pausedAfter,paused.ambient);
  const pausePath=`${base}/round2-paused-opening-${width}.png`;await page.screenshot({path:pausePath});
  await page.locator('[data-motion-toggle]').click();
  const frames=[];for(const delay of[0,2500,3000]){
   if(delay)await page.waitForTimeout(delay);
   const observed=await page.evaluate(()=>({time:performance.now(),motionState:document.querySelector('.garden-hero').dataset.motionState,botanicalTransform:getComputedStyle(document.querySelector('.motion-botanical')).transform,ambientTime:document.getAnimations().find(a=>a.id==='botanical-sway')?.currentTime,ambientState:document.getAnimations().find(a=>a.id==='botanical-sway')?.playState,overflow:document.documentElement.scrollWidth>innerWidth}));
   const path=`${base}/round2-ambient-${width}-${frames.length}.png`;await page.screenshot({path});frames.push({path,observed});
  }
  assert.notEqual(frames[0].observed.botanicalTransform,frames.at(-1).observed.botanicalTransform);assert.deepEqual(errors,[]);
  const video=page.video();await page.close();states.push({id:'ambient-and-pause',viewport:{width,height:width===1440?1000:844},pausedOpening:{path:pausePath,observed:paused,after600ms:pausedAfter},frames,video:await video.path(),pageErrors:errors});await context.close();
 }
 const inputs=[];for(const path of['src/motion.ts','src/motion.css','src/public.ts','src/public-content.ts','src/family.ts','src/styles.css'])inputs.push({path,sha256:createHash('sha256').update(await readFile(path)).digest('hex')});
 await writeFile(base+'/round2.json',JSON.stringify({scope:'Actual native botanical ambient movement and explicit-pause correction. Full authenticated navigation is scheduled round4; no auth claim.',inputs,states},null,2));console.log('Retained3viewport ambient+pause/video sequences');
}finally{await browser.close()}
