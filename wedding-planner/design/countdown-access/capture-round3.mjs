import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { visualStoreSource } from './visual-fixture.mjs';
const browser=await chromium.launch({executablePath:'C:/Users/Sachit Tewary/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',headless:true}),states=[];
try {
 for(const width of [1440,390,360]) for(const mode of ['admin','pending','viewer','blocked']) {
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'}),errors=[],source=await visualStoreSource(mode);
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/store.ts*',r=>r.fulfill({contentType:'application/javascript',body:source}));
  await page.goto(`http://127.0.0.1:5177/family/?demo=1#/${mode==='admin'?'access':'home'}`);
  await page.locator('main h1').waitFor();
  const snap=async(id,marker)=>{await page.evaluate(()=>document.fonts.ready);const path=`design/countdown-access/round3-${id}-${width}.png`;await page.screenshot({path,fullPage:true});const actual=await page.locator('main').innerText();if(!actual.includes(marker))throw Error('Wrong state '+id);states.push({id,route:page.url(),viewport:width,path,observedMarker:marker,checks:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].some(i=>!i.complete||!i.naturalWidth),editControls:document.querySelectorAll('[data-edit],[data-add],#archive-record,select[data-guest]').length})),pageErrors:[...errors]});};
  if(mode==='admin'){
    await page.locator('[data-access-filter="pending"]').click();await snap('pending-roster','Awaiting approval');
    await page.locator('[data-role-email]').first().selectOption('family');await snap('role-choice','Family');
  }else if(mode==='viewer'){
    await snap('viewer-home','Viewer access');
    await page.goto('http://127.0.0.1:5177/family/?demo=1#/catering/18-4');await page.locator('.reading-menu').waitFor();await snap('viewer-menu','Viewer access');
    await page.goto('http://127.0.0.1:5177/family/?demo=1#/attendance/18-1');await page.locator('.attendance-person').first().waitFor();await snap('viewer-attendance','Who’s joining?');
    await page.goto('http://127.0.0.1:5177/family/?demo=1#/access');await page.locator('.empty-state').waitFor();await snap('non-admin-access','Admins manage family access.');
  }else await snap(mode,mode==='pending'?'You’re signed in.':'Family access is paused.');
  await page.close();
 }
 await writeFile('design/countdown-access/round3.json',JSON.stringify({fixture:'Browser-only synthetic role store; all frontend routes/read-only states actual rendered UI.',states},null,2));console.log('Captured',states.length,'states');
}finally{await browser.close()}
