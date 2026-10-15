import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Users/Sachit Tewary/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',headless:true}),states=[];
try{
 for(const width of[1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.clock.install({time:new Date('2026-10-15T12:00:00Z')});
  await page.goto('http://127.0.0.1:5177/');await page.locator('[data-countdown] b').first().waitFor();
  const before=await page.locator('[data-countdown]').innerText();
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  await page.clock.fastForward(65000);const hidden=await page.locator('[data-countdown]').innerText();
  if(before!==hidden)throw Error('Timer continued after pagehide');
  await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
  const resumed=await page.locator('[data-countdown]').innerText();if(before===resumed)throw Error('Timer did not refresh on pageshow');
  await page.clock.fastForward(1000);if(await page.locator('[data-countdown]').innerText()===resumed)throw Error('Timer did not keep ticking');
  await page.evaluate(()=>document.fonts.ready);const path=`design/countdown-access/round4-countdown-resumed-${width}.png`;await page.screenshot({path,fullPage:true});
  states.push({id:'countdown-resumed',route:page.url(),viewport:width,path,observedMarker:await page.locator('.countdown').innerText(),checks:{stoppedOnPagehide:true,refreshedOnPageshow:true,continuedTicking:true,pageErrors:errors}});await page.close();
 }
 await writeFile('design/countdown-access/lifecycle.json',JSON.stringify({fixture:'Browser clock and synthetic page transition events verify lifecycle handling; this does not claim an actual BFCache navigation was observed.',states},null,2));console.log('Lifecycle checks pass');
}finally{await browser.close()}
