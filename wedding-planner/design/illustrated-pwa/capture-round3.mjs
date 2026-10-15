import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {recordFixture} from '../../tests/fixtures.mjs';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true}),states=[],fixture=await recordFixture();
try{
 for(const width of[1440,390,360]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/demo.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export function demoRecords(){return ${JSON.stringify(fixture)}}`}));
  const visit=async route=>{await page.goto(`http://127.0.0.1:5177/family/?demo=1#/${route}`);await page.locator('.demo-banner').waitFor()};
  const snap=async(id,marker)=>{await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('img.food-art')].map(async image=>{image.loading='eager';await image.decode()}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))});const actual=await page.locator('main').innerText();if(!actual.includes(marker))throw Error('Wrong state '+id);if(id==='compare-search'&&width===390)await page.screenshot({path:'design/illustrated-pwa/round3-compare-search-390-viewport-before-reset.png'});await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));const path=`design/illustrated-pwa/round3-${id}-${width}.png`;await page.screenshot({path,fullPage:true});states.push({id,route:page.url(),viewport:{width,height:width===1440?1000:844},path,observedMarker:marker,checks:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].some(image=>!image.complete||!image.naturalWidth),activeElement:document.activeElement?.id,skipLinkTop:document.querySelector('.skip-link')?.getBoundingClientRect().top})),pageErrors:[...errors]});};
  await visit('catering');await page.locator('#menu-search').fill('paneer');await snap('overview-search','Sangeet');await page.locator('#menu-search').fill('no matching dish');await snap('overview-no-match','No matching meals or menus.');await page.locator('[data-clear-menu]').first().click();
  await visit('catering/reception-undated');await page.locator('#menu-search').fill('verify');await snap('uncertain-search','Shahi Patam');await page.locator('[data-clear-menu]').first().click();
  await visit('catering/18-4');await page.locator('#menu-search').fill('Soups');await snap('category-search','Sweet corn');await page.locator('[data-clear-menu]').first().click();
  await visit('catering/compare');await snap('compare-compact','Two menus, together.');await page.locator('.comparison-grid > section').first().locator('.compare-category summary').first().click();await page.locator('.comparison-grid > section').nth(1).locator('.compare-category summary').first().click();await snap('compare-expanded','Hot kesar milk');await page.locator('#menu-search').fill('paneer');await snap('compare-search','Paneer');
  await page.close();
 }
 await writeFile('design/illustrated-pwa/round3.json',JSON.stringify({description:'Actual real-art search/category/no-results recovery and selected-pair compact comparison. Document-derived proposed menus; DEV fixture only.',states},null,2));console.log('Retained',states.length,'states');
}finally{await browser.close()}
