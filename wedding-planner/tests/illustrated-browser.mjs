import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,expect} from '@playwright/test';
import {parseMenu} from '../src/menu.ts';
import {recordFixture} from './fixtures.mjs';
const cwd=fileURLToPath(new URL('..',import.meta.url)),origin='http://127.0.0.1:4186',fixture=await recordFixture();
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4186','--strictPort'],{cwd,stdio:'pipe'});
let browser;const errors=[];
try{
 for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await pause(300);}
 browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/src/demo.ts*',route=>route.fulfill({contentType:'application/javascript',body:'export function demoRecords(){return '+JSON.stringify(fixture)+'}'}));
 const visit=async route=>{await page.goto(origin+'/family/?demo=1#/'+route);await expect(page.locator('.demo-banner')).toBeVisible();};
 for(const event of fixture.events){
  await visit('catering/'+event.id);
  const expected=parseMenu(event.menuText).sections.flatMap(section=>section.items.map(item=>item.text));
  assert.deepEqual(await page.locator('.dish-name').allTextContents(),expected);
  await expect(page.locator('.recorded-menu pre')).toHaveText(event.menuText,{useInnerText:false});
  const uncertain=page.locator('.menu-item-uncertain');for(const row of await uncertain.all())assert.match(await row.locator('img').getAttribute('src'),/\/setting[.]webp$/);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 await visit('catering/18-4');await page.locator('#menu-search').fill('Soups');
 await expect(page.locator('.dish-name')).toHaveText(['Sweet corn','Manchow']);
 await page.locator('#menu-search').fill('no matching dish');await expect(page.locator('.menu-no-results')).toBeVisible();
 await page.locator('[data-clear-menu]').first().click();await expect(page.locator('#menu-search')).toBeFocused();assert.ok(await page.locator('.dish-name').count()>20);
 await visit('catering/compare');assert.equal(await page.locator('.compare-category[open]').count(),0);
 await page.locator('#menu-search').fill('paneer');assert.equal(await page.locator('.compare-category:not([open])').count(),0);for(const name of await page.locator('.dish-name').allTextContents())assert.match(name,/paneer/i);
 await page.locator('[data-clear-menu]').first().click();assert.equal(await page.locator('.compare-category[open]').count(),0);
 const breakfasts=fixture.events.filter(event=>event.title==='Breakfast');
 await page.locator('[data-compare="a"]').selectOption(breakfasts[0].id);await page.locator('[data-compare="b"]').selectOption(breakfasts[1].id);
 const dates=await page.locator('.compare-selected-date').allTextContents();assert.ok(dates[0].includes('18 January 2027'));assert.ok(dates[1].includes('19 January 2027'));
 await page.locator('.compare-category summary').first().click();await expect(page.locator('.compare-category[open]')).toHaveCount(1);
 assert.deepEqual(errors,[]);console.log('PASS all10 complete menu projections, neutral uncertainty, search/clear and selected-pair comparison on390px phone');
}finally{await browser?.close();server.kill();}
