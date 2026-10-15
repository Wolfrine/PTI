import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {recordFixture} from '../../tests/fixtures.mjs';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true}),states=[],fixture=await recordFixture();
try{
 for(const width of[1440,390]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/demo.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export function demoRecords(){return ${JSON.stringify(fixture)}}`}));
  for(const[id,route,marker]of[['overview','catering','Food counter'],['sangeet','catering/18-4','Hot kesar milk'],['breakfast','catering/18-1','aloo paratha with dahi']]){
   await page.goto(`http://127.0.0.1:5177/family/?demo=1#/${route}`);await page.locator('.food-art').first().waitFor();
   await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('img.food-art')].map(async image=>{image.loading='eager';await image.decode()}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))});
   const actual=await page.locator('main').innerText();if(!actual.includes(marker))throw Error('Wrong state '+id);
   const path=`design/illustrated-pwa/round1-${id}-${width}.png`;await page.screenshot({path,fullPage:true});
   states.push({id,route:page.url(),viewport:{width,height:width===1440?1000:844},path,observedMarker:marker,checks:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].some(image=>!image.complete||!image.naturalWidth)})),pageErrors:[...errors]});
  }
  await page.close();
 }
 await writeFile('design/illustrated-pwa/round1.json',JSON.stringify({description:'Actual watercolor assets and current rendered UI. Document-derived proposed menus plus synthetic people/logistics through DEV-only fixture interception.',states},null,2));console.log('Retained',states.length,'states');
}finally{await browser.close()}
