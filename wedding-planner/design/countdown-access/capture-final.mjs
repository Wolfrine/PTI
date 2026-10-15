import {chromium} from '@playwright/test';
import {writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {visualStoreSource} from './visual-fixture.mjs';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true}),states=[];
const candidate=JSON.parse(await readFile('design/countdown-access/build-fingerprint.json','utf8'));
const unchanged=async()=>{for(const entry of candidate.entries)if(createHash('sha256').update(await readFile(entry.path)).digest('hex')!==entry.sha256)throw Error('Candidate changed during capture: '+entry.path)};
const retain=async(page,id,width,marker,errors=[],staticPage=false)=>{
 if(staticPage)await page.evaluate(()=>document.fonts.ready);
 else await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(['/art/botanical-scene.webp','/art/botanical-scene-640.webp'].map(src=>new Promise(resolve=>{const image=new Image();image.onload=image.onerror=resolve;image.src=src})));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))});
 const actual=await page.locator('main').innerText();if(!actual.includes(marker))throw Error('Wrong state '+id);
 const path=`design/countdown-access/round5-${id}-${width}.png`;if(states.some(s=>s.path===path))throw Error('Duplicate screenshot '+path);
 await page.screenshot({path,fullPage:true});
 states.push({id,route:page.url(),viewport:{width,height:width===1440?1000:844},path,observedMarker:marker,checks:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].some(i=>!i.complete||!i.naturalWidth),editControls:document.querySelectorAll('[data-edit],[data-add],#archive-record,select[data-guest]').length})),pageErrors:[...errors]});
};
try{
 await unchanged();
 for(const width of[1440,390,360]){
  for(const mode of['live',...(width===390?['no-js','complete']:[])]){
   const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},javaScriptEnabled:mode!=='no-js',reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(mode!=='no-js')await page.clock.install({time:new Date(mode==='complete'?'2027-01-18T00:00:01+05:30':'2026-10-15T12:00:00Z')});
   await page.goto('http://127.0.0.1:5177/');await page.locator('.countdown').waitFor();if(mode!=='no-js')await page.locator(mode==='complete'?'.countdown-complete':'[data-countdown] b').first().waitFor();await retain(page,`invitation-${mode}`,width,mode==='complete'?'18 January is here.':'To the first day of our planned celebrations',errors,mode==='no-js');await page.close();
  }
  for(const mode of['admin','pending','viewer',...(width===390?['blocked','loading','failure']:[])]){
   const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const source=await visualStoreSource(mode==='failure'?'admin':mode,{error:mode==='failure'?'You are offline. Reconnect before saving.':'',delay:120});
   await page.route('**/src/store.ts*',r=>r.fulfill({contentType:'application/javascript',body:source}));
   const visit=async(route)=>{await page.goto(`http://127.0.0.1:5177/family/?demo=1#/${route}`);await page.locator('main h1, main h2').first().waitFor()};
   await visit(mode==='admin'||mode==='failure'?'access':'home');
   if(mode==='admin'){
    await retain(page,'admin-roster',width,'Family access.',errors);
    if(width!==360){await page.locator('[data-access-filter="pending"]').click();await retain(page,'admin-pending',width,'Awaiting approval',errors);}
    if(width===390){await page.locator('[data-role-email]').first().selectOption('viewer');await retain(page,'admin-role-choice',width,'Awaiting approval',errors);await page.locator('#access-search').fill('no synthetic match');await retain(page,'admin-no-match',width,'No matching accounts.',errors);await page.getByRole('button',{name:'Show all accounts'}).click();await page.locator('.account-menu > summary').click();await retain(page,'admin-account',width,'Family access.',errors);}
   }else if(mode==='pending'||mode==='blocked'||mode==='loading')await retain(page,mode,width,mode==='pending'?'You’re signed in.':mode==='blocked'?'Family access is paused.':'Opening the family workspace…',errors);
   else if(mode==='viewer'){
    await retain(page,'viewer-home',width,'Viewer access',errors);
    if(width===390){await visit('catering/18-4');await retain(page,'viewer-menu',width,'Hot kesar milk',errors);await visit('attendance/18-1');await retain(page,'viewer-attendance',width,'Who’s joining?',errors);await visit('access');await retain(page,'viewer-no-access',width,'Admins manage family access.',errors);}
   }else{
    await page.locator('[data-access-filter="pending"]').click();await page.locator('[data-role-email]').first().selectOption('family');await page.locator('[data-role-save]').first().click();await page.locator('.role-error').waitFor();await retain(page,'failed-offline-role',width,'You are offline. Reconnect before saving.',errors);
   }
   await page.close();
  }
 }
 await unchanged();
 await writeFile('design/countdown-access/states.json',JSON.stringify({fingerprint:candidate.fingerprint,description:'Final actual Chromium renders, reduced-motion. Public clock fixed only for stable evidence; target is the clearly labelled start-of-day implementation boundary. All family identities/roles/errors are browser-only synthetic store fixtures, not wedding data or backend authorization proof.',states},null,2));
 console.log('Retained',states.length,'unique states; failed checks',states.filter(s=>s.checks.overflow||s.checks.brokenImages||s.pageErrors.length).length);
}finally{await browser.close()}
