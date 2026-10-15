import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {visualStoreSource} from './visual-fixture.mjs';
const browser=await chromium.launch({executablePath:'C:/Users/Sachit Tewary/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',headless:true}),states=[];
try{
 for(const width of[1440,390,360])for(const scenario of['failure','saving','loading','downgrade','blocked','viewer-attendance']){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const source=await visualStoreSource(scenario==='loading'?'loading':scenario==='blocked'?'blocked':scenario==='viewer-attendance'?'viewer':'admin',{delay:scenario==='saving'?1800:150,error:scenario==='failure'?'This account changed. Review its current role before saving.':''});
  await page.route('**/src/store.ts*',r=>r.fulfill({contentType:'application/javascript',body:source}));
  await page.goto(`http://127.0.0.1:5177/family/?demo=1#/${scenario==='downgrade'?'catering/18-4':scenario==='viewer-attendance'?'attendance/18-1':'access'}`);await page.locator('main h1').waitFor();
  const snap=async(id,marker,fullPage=true)=>{await page.evaluate(async()=>{await document.fonts.ready;if(document.querySelector('.login-scene'))await Promise.all(['/art/botanical-scene.webp','/art/botanical-scene-640.webp'].map(src=>new Promise(resolve=>{const image=new Image();image.onload=image.onerror=resolve;image.src=src})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))});const path=`design/countdown-access/round4-${id}-${width}.png`;const text=await page.locator('main').innerText();if(!text.includes(marker))throw Error('Wrong state '+id);await page.screenshot({path,fullPage});states.push({id,route:page.url(),viewport:width,path,observedMarker:marker,checks:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].some(i=>!i.complete||!i.naturalWidth),openPrivateEditor:!!document.querySelector('dialog[open]')})),pageErrors:[...errors]});};
  if(['failure','saving'].includes(scenario)){
   await page.locator('[data-access-filter="pending"]').click();await page.locator('[data-role-email]').first().selectOption('family');await page.locator('[data-role-save]').first().click();
   if(scenario==='failure'){await page.locator('.role-error').waitFor();await snap('failed-role','This account changed.');await page.locator('[data-role-reset]').click();await snap('reset-role','Awaiting approval');}
   else {await page.getByRole('button',{name:'Saving…',exact:true}).waitFor();await snap('saving-role','Saving…');await page.getByRole('button',{name:'Saving…',exact:true}).waitFor({state:'hidden'});await page.locator('[data-access-filter="all"]').click();await snap('approved-role','Family');}
  }else if(scenario==='downgrade'){
   await page.locator('[data-section="menu"]').click();await page.locator('dialog').waitFor({state:'visible'});await page.evaluate(()=>globalThis.__visualSetRole('viewer'));await snap('downgraded-viewer','Viewer access');await page.evaluate(()=>globalThis.__visualSetRole('pending'));await snap('returned-pending','You’re signed in.');
  }else if(scenario==='blocked') await snap('blocked','Family access is paused.');
  else if(scenario==='viewer-attendance') await snap('viewer-attendance','Who’s joining?');
  else await snap('loading','Opening the family workspace…');
  await page.close();
 }
 await writeFile('design/countdown-access/round4.json',JSON.stringify({fixture:'Browser-intercepted synthetic roles/errors/delay/transitions. Frontend state rendering only, not backend security verification.',states},null,2));console.log('Captured',states.length,'states');
}finally{await browser.close()}
