import assert from 'node:assert/strict';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {setTimeout as pause} from 'node:timers/promises';
import {chromium,expect} from '@playwright/test';
const cwd=fileURLToPath(new URL('..',import.meta.url)),evidence='.wedding-qa';
const servers=[],results=[],errors=[];let browser;
async function server(port,preview=false){
 const child=spawn(process.execPath,['node_modules/vite/bin/vite.js',...(preview?['preview']:[]),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd,env:{...process.env,VITE_USE_EMULATORS:''},stdio:'pipe'});servers.push(child);
 const origin=`http://127.0.0.1:${port}`;
 for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)return origin;}catch{}await pause(500);}
 throw Error(`Browser QA server ${port} did not start.`);
}
try {
 await mkdir(evidence,{recursive:true});
 const production=await server(4182,true),development=await server(4183);
 browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
 // Public essentials are static, readable without JavaScript or database access.
 const noJs=await browser.newContext({javaScriptEnabled:false});const staticPage=await noJs.newPage();
 await staticPage.goto(production);await expect(staticPage.locator('#couple-names')).toContainText('Mahima');await expect(staticPage.locator('#couple-names')).toContainText('Mayank');await expect(staticPage.locator('.hero-date')).toContainText('18–20 January 2027');
 assert.equal(await staticPage.locator('[data-countdown]').count(),0);assert.ok(!(await staticPage.locator('body').textContent()).includes('Reception'));results.push('Static approved invitation works without JavaScript; no fabricated countdown or programme');
 const publicContext=await browser.newContext({reducedMotion:'reduce'}),publicPage=await publicContext.newPage(),requests=[];
 publicPage.on('pageerror',e=>errors.push(e.message));publicPage.on('request',r=>requests.push(r.url()));
 for(const width of [1440,390,360]){
  await publicPage.setViewportSize({width,height:900});await publicPage.goto(production);await publicPage.evaluate(()=>document.fonts.ready);
  assert.ok(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Invitation must not overflow horizontally');
  await publicPage.screenshot({path:`${evidence}/invitation-${width}.png`,fullPage:true});
 }
 assert.ok(!requests.some(url=>/googleapis\.com|firebaseio\.com|firebaseapp\.com/.test(url)));results.push('Public page loads without Firebase requests at desktop and phone widths');
 await publicPage.setViewportSize({width:390,height:900});await publicPage.keyboard.press('Tab');await expect(publicPage.locator('.skip-link')).toBeFocused();await publicPage.keyboard.press('Enter');assert.ok((await publicPage.url()).includes('#celebration'));
 await publicPage.setViewportSize({width:720,height:450});assert.ok(await publicPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));results.push('Public keyboard skip link and desktop 200%-zoom-equivalent CSS viewport reflow');
 // Production ignores the local demonstration switch and renders only a sign-in surface.
 const productionFamily=await publicContext.newPage();await productionFamily.goto(production+'/family/?demo=1');await expect(productionFamily.getByRole('heading',{name:/A little planning/})).toBeVisible();assert.equal(await productionFamily.locator('.demo-banner').count(),0);assert.equal(await productionFamily.locator('[data-add]').count(),0);results.push('Production has no demonstration authentication bypass');
 // The local preview uses explicitly synthetic data for interface tasks, never cloud data.
 const ctx=await browser.newContext(),page=await ctx.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(development+'/family/?demo=1');await expect(page.locator('.demo-banner')).toBeVisible();
 await page.locator('[data-add="decisions"]').click();await page.locator('dialog [name="title"]').fill('Synthetic welcome decision');await page.locator('dialog [name="status"]').selectOption('confirmed');await page.locator('dialog button[type="submit"]').click();
 await expect(page.locator('#form-error')).toContainText('Record the decision');await expect(page.locator('dialog [name="title"]')).toHaveValue('Synthetic welcome decision');await page.locator('dialog [name="resolution"]').fill('Synthetic agreement for verification only.');await page.locator('dialog button[type="submit"]').click();await expect(page.locator('dialog')).not.toBeVisible();results.push('Decision confirmation requires a recorded agreement and preserves failed input');
 await page.locator('[data-view="guests"]').first().click();
 for(const name of ['Synthetic Guest One','Synthetic Guest Two']){
  await page.locator('[data-add="guests"]').first().click();await page.locator('dialog [name="name"]').fill(name);await page.locator('dialog [name="household"]').fill('Synthetic shared household');await page.locator('dialog [name="stayFrom"]').fill('2027-01-18');await page.locator('dialog [name="stayUntil"]').fill('2027-01-20');await page.locator('dialog button[type="submit"]').click();await expect(page.locator('dialog')).not.toBeVisible();
 }
 await expect(page.locator('.household').filter({hasText:'Synthetic shared household'}).locator('.guest-row')).toHaveCount(2);await expect(page.locator('.stay-nights strong').first()).toHaveText('3');results.push('Two people in one household remain two people; stay nights exclude checkout');
 await page.locator('#guest-search').fill('nonexistent synthetic search');await expect(page.getByRole('heading',{name:'No matching guests.'})).toBeVisible();await page.getByRole('button',{name:'Clear search'}).click();await expect(page.locator('.guest-row')).toHaveCount(3);
 await page.locator('[data-add="guests"]').first().click();await page.locator('dialog [name="name"]').fill('Private unsaved synthetic guest');await ctx.setOffline(true);await page.locator('dialog button[type="submit"]').click();await expect(page.locator('#form-error')).toContainText('offline');await expect(page.locator('dialog [name="name"]')).toHaveValue('Private unsaved synthetic guest');await ctx.setOffline(false);await page.locator('dialog [data-close]').first().click();results.push('Offline save fails honestly and retains the form draft');
 await page.locator('[data-view="celebration"]').first().click();await page.locator('summary').filter({hasText:'Menu & attendance'}).first().click();await page.locator('[data-attendance]').first().click();await page.locator('dialog select[data-guest]').first().selectOption('confirmed');await expect(page.locator('dialog select[data-guest]').first()).toBeEnabled();await page.locator('dialog [data-close]').first().click();await expect(page.locator('.attendance-strip').first()).toContainText('1 Confirmed');results.push('Attendance changes per person and occasion');
 for(const width of [1440,390,360]){
  await page.setViewportSize({width,height:900});
  for(const view of ['overview','celebration','guests','arrangements']){await page.locator(`[data-view="${view}"]`).first().click();await expect(page.locator('#toast')).not.toHaveClass(/visible/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${view} must fit ${width}px`);await page.screenshot({path:`${evidence}/family-${view}-${width}.png`,fullPage:true});}
 }
 // Source documents, test fixtures and personal menu transcripts must never enter the Hosting build.
 const publicHtml=await readFile(`${cwd}/dist/index.html`,'utf8');assert.ok(publicHtml.includes('Mahima'));assert.ok(!publicHtml.includes('PUBLIC_INVITATION'));
 async function inspect(path){for(const e of await readdir(path,{withFileTypes:true})){const p=path+'/'+e.name;if(e.isDirectory())await inspect(p);else if(/\.(js|html|json)$/.test(e.name)){const text=await readFile(p,'utf8');for(const privateText of ['1000154329.jpg','Example guest','Private menu','WEDDING_RECORD.md','SYNTHETIC MENU — LAYOUT REVIEW ONLY'])assert.ok(!text.includes(privateText),`Private/development content leaked in ${e.name}`);}}}
 await inspect(`${cwd}/dist`);results.push('Production assets exclude records, fixtures and catering seed');
 assert.deepEqual(errors,[],'Browser runtime must have no unhandled exceptions');
 await writeFile(`${evidence}/browser-results.json`,JSON.stringify({status:'pass',checks:results,viewports:[1440,390,360],data:'Public approved names/planned dates; local family synthetic fixtures. Cloud collaboration is tested separately on emulators.'},null,2));
 console.log(`PASS ${results.length} browser scenarios, desktop/mobile, public no-JS and production source boundary.`);
} finally {if(browser)await browser.close();for(const child of servers)child.kill();}
