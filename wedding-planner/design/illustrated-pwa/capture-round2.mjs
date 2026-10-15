import {chromium} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
import {recordFixture} from '../../tests/fixtures.mjs';
const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined,headless:true}),states=[],fixture=await recordFixture();
try{
 for(const width of[1440,390,360]){
  const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/src/demo.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export function demoRecords(){return ${JSON.stringify(fixture)}}`}));
  const snap=async(id,marker,fullPage=true)=>{await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.querySelectorAll('img.food-art')].map(async image=>{image.loading='eager';await image.decode()}));await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))});const actual=await page.locator('body').innerText();if(!actual.includes(marker))throw Error('Wrong state '+id);const path=`design/illustrated-pwa/round2-${id}-${width}.png`;await page.screenshot({path,fullPage});states.push({id,route:page.url(),viewport:{width,height:width===1440?1000:844},path,observedMarker:marker,checks:await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].some(image=>!image.complete||!image.naturalWidth)})),pageErrors:[...errors]});};
  for(const[id,route,marker]of[['sangeet','catering/18-4','Hot kesar milk'],['reception','catering/reception-undated','Shahi Patam'],['uncertain-lunch','catering/19-7','dal lapeta (verify exact name)'],['breakfast20','catering/20-9','Shahi toast']]){
   await page.goto(`http://127.0.0.1:5177/family/?demo=1#/${route}`);await page.locator('.reading-menu').waitFor();await snap(id,marker);
  }
  await page.goto('http://127.0.0.1:5177/family/?demo=1#/catering/reception-undated');await page.locator('.recorded-menu').waitFor();await page.locator('.recorded-menu summary').click();await page.locator('.recorded-menu pre').scrollIntoViewIfNeeded();await snap('recorded-source','Shahi Patam',false);
  await page.locator('[data-section="menu"]').click();await page.locator('dialog textarea').waitFor();const raw=await page.locator('dialog textarea').inputValue();if(raw!==fixture.events.find(event=>event.id==='reception-undated').menuText)throw Error('Editor source changed');await snap('canonical-editor','Keep unclear readings',false);
  await page.close();
 }
 await writeFile('design/illustrated-pwa/round2.json',JSON.stringify({description:'Actual real-art long/uncertain existing menus and complete recorded-source/editor. No added dishes, edits or backend writes.',states},null,2));console.log('Retained',states.length,'states');
}finally{await browser.close()}
