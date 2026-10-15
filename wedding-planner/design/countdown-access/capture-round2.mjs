import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { visualStoreSource } from './visual-fixture.mjs';
const browser = await chromium.launch({executablePath:'C:/Users/Sachit Tewary/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',headless:true});
const states=[];
const source=await visualStoreSource();
try {
 for(const width of [1440,390,360]) {
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/store.ts*',r=>r.fulfill({contentType:'application/javascript',body:source}));
  await page.goto('http://127.0.0.1:5177/family/?demo=1#/access');
  await page.locator('[data-role-email]').first().waitFor();
  const snap=async(id)=>{await page.evaluate(()=>document.fonts.ready);const path=`design/countdown-access/round2-${id}-${width}.png`;await page.screenshot({path,fullPage:true});states.push({id,route:page.url(),viewport:width,path,observedMarker:await page.locator('main').innerText(),checks:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].some(i=>!i.complete||!i.naturalWidth)})),pageErrors:[...errors]});};
  await snap('access-all');
  await page.locator('[data-access-filter="pending"]').click();await snap('access-pending');
  await page.locator('[data-access-filter="all"]').click();await page.locator('.role-guide summary').click();await snap('role-guide');
  await page.close();
 }
 await writeFile('design/countdown-access/round2.json',JSON.stringify({fixture:'Browser-only intercepted store, synthetic account names/emails. Actual frontend rendering; no production auth bypass.',states},null,2));
 console.log('Captured',states.length,'states');
}finally{await browser.close()}
