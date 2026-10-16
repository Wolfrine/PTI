import {chromium} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
const base='design/motion-session';await mkdir(base+'/round1-video',{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined}),states=[];
try {
 for(const width of[1440,390,360]){
  const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},recordVideo:{dir:base+'/round1-video',size:{width,height:width===1440?1000:844}},reducedMotion:'no-preference'});
  const warm=await context.newPage();await warm.goto('http://127.0.0.1:5177/');await warm.evaluate(()=>document.fonts.ready);await warm.close();
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5177/');await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionReady==='true');await page.evaluate(()=>document.fonts.ready);
  let elapsed=0;const frames=[];
  for(const at of[0,350,1000,2200]){
   if(at>elapsed)await page.waitForTimeout(at-elapsed);elapsed=at;
   const observed=await page.evaluate(()=>({time:performance.now(),motionState:document.querySelector('.garden-hero').dataset.motionState,name:getComputedStyle(document.querySelector('h1')).transform,nameOpacity:getComputedStyle(document.querySelector('h1')).opacity,scene:getComputedStyle(document.querySelector('.scene')).transform,animations:document.getAnimations().map(a=>({target:a.effect?.target?.className,playState:a.playState,currentTime:a.currentTime})),overflow:document.documentElement.scrollWidth>innerWidth}));
   const path=`${base}/round1-opening-${width}-${at}.png`;await page.screenshot({path});frames.push({at,path,observed});
  }
  const video=page.video();await page.close();const videoPath=await video.path();states.push({id:'opening',viewport:{width,height:width===1440?1000:844},frames,video:videoPath,pageErrors:errors});await context.close();
 }
 await writeFile(base+'/round1.json',JSON.stringify({scope:'Actual opening choreography only; ambient accent and final motion control state are next cycle. Sample times are relative capture schedule; actual animation currentTime/computed transforms are retained.',states},null,2));console.log('Retained3viewport opening sequences');
}finally{await browser.close()}
