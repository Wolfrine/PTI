import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const dir='design/motion-session/stronger-round2';
const hashes=async()=>Object.fromEntries(await Promise.all(['src/motion.ts','src/motion.css','src/public.ts','src/family.ts','src/styles.css','index.html'].map(async p=>[p,createHash('sha256').update(await readFile(p)).digest('hex')]).map(p=>p.catch(e=>['unavailable',e.message]))));
const before=await hashes(); await mkdir(dir,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
const result={scope:'Independent stronger round-2 actual Chromium render and temporal motion samples; synthetic dev family fixture. No Firebase login or persistence claim.',before,states:[]};
const sample=page=>page.evaluate(()=>({time:performance.now(),state:document.querySelector('.garden-hero')?.dataset.motionState,overflow:document.documentElement.scrollWidth>innerWidth,animations:document.getAnimations().map(a=>({target:a.effect?.target?.outerHTML?.slice(0,220),playState:a.playState,currentTime:a.currentTime,timing:a.effect?.getComputedTiming(),transform:a.effect?.target?getComputedStyle(a.effect.target).transform:null,opacity:a.effect?.target?getComputedStyle(a.effect.target).opacity:null,keyframes:a.effect?.getKeyframes()}))}));
try {
 for(const width of [1440,360]) {
  const ctx=await browser.newContext({viewport:{width,height:width===1440?1000:844},reducedMotion:'no-preference'}),page=await ctx.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5177/'); await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionReady==='true');
  const frames=[]; let prior=0;
  for(const elapsed of [0,500,1500,3500,6500]) {
   await page.waitForTimeout(elapsed-prior);prior=elapsed;
   const observed=await sample(page),path=`${dir}/invitation-${width}-${elapsed}.png`;
   await page.screenshot({path,fullPage:true}); frames.push({scheduleMs:elapsed,observed,path});
  }
  const toggle=page.locator('[data-motion-toggle]');
  if(await toggle.count()) {
   await toggle.click(); const first=await sample(page); await page.waitForTimeout(550); const second=await sample(page);
   frames.push({state:'paused',first,second});
   await toggle.click();await page.waitForTimeout(350);frames.push({state:'resumed',observed:await sample(page)});
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.waitForTimeout(150);frames.push({state:'reduced',observed:await sample(page)});
  await page.screenshot({path:`${dir}/reduced-${width}.png`,fullPage:true});
  result.states.push({width,frames,errors});await ctx.close();
 }
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),page=await ctx.newPage();
 await page.goto('http://127.0.0.1:5177/family/?demo=1#/home');await page.locator('.demo-banner').waitFor();await page.evaluate(()=>document.fonts.ready);
 await page.screenshot({path:`${dir}/family-fixture-390.png`,fullPage:true});
 result.family={url:page.url(),text:await page.locator('body').innerText(),links:await page.locator('a[href="/"]').evaluateAll(es=>es.map(e=>({text:e.innerText,visible:!!(e.offsetWidth||e.offsetHeight||e.getClientRects().length),bounds:e.getBoundingClientRect().toJSON()})))};
 await ctx.close();result.after=await hashes();
 await writeFile(`${dir}/observations.json`,JSON.stringify(result,null,2));console.log(JSON.stringify({candidateStable:JSON.stringify(before)===JSON.stringify(result.after),states:result.states.map(s=>({width:s.width,errors:s.errors,animations:s.frames[4].observed.animations.length})),family:result.family.links}));
} finally {await browser.close();}
