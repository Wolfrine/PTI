import assert from 'node:assert/strict';
import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {recordFixture} from '../../tests/fixtures.mjs';
const base='design/motion-session',fixture=await recordFixture(),states=[];
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
try {
 for(const width of[1440,390,360]){
  const context=await browser.newContext({viewport:{width,height:width===1440?1000:844},reducedMotion:'no-preference'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/demo.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export function demoRecords(){return ${JSON.stringify(fixture)}}`}));
  const snap=async(id,observed)=>{await page.evaluate(()=>document.fonts.ready);const path=`${base}/round4-${id}-${width}.png`;await page.screenshot({path});const checks=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,active:document.activeElement?.className}));assert.equal(checks.overflow,false);states.push({id,path,viewport:page.viewportSize(),observed,checks,pageErrors:[...errors]})};
  await page.goto('http://127.0.0.1:5177/');await page.locator('[data-motion-toggle]').waitFor();await page.locator('[data-motion-toggle]').focus();await page.keyboard.press('Space');await page.reload();await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionState==='paused');
  const preference=await page.evaluate(()=>({preference:localStorage.getItem('wedding-motion'),opacity:getComputedStyle(document.querySelector('h1')).opacity,control:document.querySelector('[data-motion-toggle]').textContent.trim()}));assert.equal(preference.preference,'paused');assert.equal(preference.opacity,'1');await snap('pause-reload',preference);
  await page.goto('http://127.0.0.1:5177/family/?demo=1#/catering/reception-undated');await page.locator('.dish-name').first().waitFor();assert.ok(await page.locator('.dish-name').count()>40);await page.locator('a.invitation-link').focus();await snap('working-menu-keyboard',{marker:'Reception',invitationBounds:await page.locator('a.invitation-link').boundingBox(),dishCount:await page.locator('.dish-name').count()});
  await page.locator('.account-menu > summary').focus();await page.keyboard.press('Enter');await snap('working-account-open',{marker:'Export private plan',open:await page.locator('.account-menu').getAttribute('open')});await page.locator('.account-menu > summary').press('Enter');
  await page.locator('a.invitation-link').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.querySelector('.garden-hero')?.dataset.motionState==='paused');await snap('paused-return',{marker:'Resume motion',preference:await page.evaluate(()=>localStorage.getItem('wedding-motion')),fixture:'Actual keyboard navigation out of DEV-only family fixture; real auth restoration belongs to parent QA'});
  await page.locator('[data-motion-toggle]').focus();await page.keyboard.press('Space');await page.evaluate(()=>Promise.all(document.getAnimations().map(a=>a.ready)));const before=await page.evaluate(()=>document.getAnimations().find(a=>a.id==='botanical-sway').currentTime);await page.waitForTimeout(650);const after=await page.evaluate(()=>document.getAnimations().find(a=>a.id==='botanical-sway').currentTime);assert.ok(after>before);states.push({id:'keyboard-resume',viewport:page.viewportSize(),before,after});assert.deepEqual(errors,[]);await context.close();
 }
 await writeFile(base+'/round4.json',JSON.stringify({scope:'Working long-menu header, keyboard navigation/account controls, persisted explicit pause over reload and actual DEV family→public route. Document-derived proposed menu and synthetic family fixture, no production auth claim.',states},null,2));console.log('PASS round4 states',states.length);
}finally{await browser.close()}
