import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { setTimeout as pause } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';
const cwd=fileURLToPath(new URL('..',import.meta.url));
const origin='http://127.0.0.1:4185', canonical='https://mahima-mayank.web.app/';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4185','--strictPort'],{cwd,stdio:'pipe'});
let browser;
const results=[];
try{
  for(let i=0;i<60;i++){try{if((await fetch(origin)).ok)break;}catch{}await pause(300);}
  browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  const context=await browser.newContext({javaScriptEnabled:false}), staticPage=await context.newPage();
  for(const path of ['/','/family/']){
    await staticPage.goto(origin+path);
    if(path==='/')await expect(staticPage.locator('.invitation-actions')).toBeHidden();
    for(const [selector,value] of [['meta[property="og:image"]',canonical+'share/wedding-invitation-v2.jpg'],['meta[property="og:image:type"]','image/jpeg'],['meta[property="og:image:width"]','1200'],['meta[property="og:image:height"]','630'],['meta[name="twitter:card"]','summary_large_image']])assert.equal(await staticPage.locator(selector).getAttribute('content'),value);
    assert.equal(await staticPage.locator('link[rel="manifest"]').getAttribute('href'),'/manifest.webmanifest');
    if(path==='/family/')assert.doesNotMatch(await staticPage.content(),/guest@example|menuText|dal lapeta|workspaceRoot/);
  }
  const image=await fetch(origin+'/share/wedding-invitation-v2.jpg');
  assert.equal(image.status,200);assert.match(image.headers.get('content-type'),/image\/jpeg/);
  const bytes=await image.arrayBuffer();assert.ok(bytes.byteLength<250000);
  const dimensions=await staticPage.evaluate(async url=>{const img=new Image();img.src=url;await img.decode();return [img.naturalWidth,img.naturalHeight];},origin+'/share/wedding-invitation-v2.jpg');
  assert.deepEqual(dimensions,[1200,630]);results.push('No-JavaScript public/family metadata, absolute versioned JPEG, 1200×630 under250KB');
  await context.close();
  async function pageWith(mode){
    const ctx=await browser.newContext({viewport:{width:390,height:844}});
    await ctx.addInitScript(mode=>{
      window.__shares=[];window.__copied=[];
      Object.defineProperty(navigator,'share',{configurable:true,value:mode==='native'||mode==='abort'||mode==='reject'?async payload=>{window.__shares.push(payload);if(mode==='abort')throw new DOMException('Cancelled','AbortError');if(mode==='reject')throw Error('Unavailable');}:undefined});
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{if(mode==='manual')throw Error('Denied');window.__copied.push(text);}}});
    },mode);
    const page=await ctx.newPage();await page.goto(origin+'/?guest=private-looking-query#private-looking-hash');await page.locator('[data-share-invitation]').waitFor();return {ctx,page};
  }
  for(const mode of ['native','abort','reject','clipboard','manual']){
    const {ctx,page}=await pageWith(mode);await page.locator('[data-share-invitation]').click();
    await expect(page.locator('[data-share-invitation]')).toBeEnabled();
    const recorded=await page.evaluate(()=>({shares:window.__shares,copied:window.__copied}));
    for(const payload of recorded.shares)assert.equal(payload.url,canonical);
    if(mode==='native')assert.deepEqual(recorded.copied,[]);
    if(mode==='abort'){assert.deepEqual(recorded.copied,[]);assert.equal(await page.locator('#share-status').innerText(),'');}
    if(mode==='reject'||mode==='clipboard'){assert.deepEqual(recorded.copied,[canonical]);await expect(page.locator('#share-status')).toHaveText('Invitation link copied.');}
    if(mode==='manual'){
      await expect(page.locator('#share-link-dialog')).toBeVisible();await expect(page.locator('#invitation-link')).toHaveValue(canonical);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mkdir('.wedding-qa',{recursive:true});await page.screenshot({path:'.wedding-qa/share-manual-390.png'});await page.getByRole('button',{name:'Done',exact:true}).click();await expect(page.locator('#share-link-dialog')).not.toBeVisible();
    }
    await ctx.close();
  }
  results.push('Synthetic native share, cancellation, clipboard and manual fallback all share only the canonical public URL');
  await mkdir('.wedding-qa',{recursive:true});await writeFile('.wedding-qa/sharing.json',JSON.stringify({results,deviceValidation:'Native share API simulated; no WhatsApp message sent and actual recipient rendering not verified'},null,2));console.log(results);
}finally{await browser?.close();server.kill();}
