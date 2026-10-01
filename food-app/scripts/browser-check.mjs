import {chromium} from '../../personal-functions/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=path.resolve('food-app');
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const file=path.resolve(base,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return}const body=await readFile(file);const type={'.html':'text/html','.mjs':'application/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type});res.end(body)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(8766,'127.0.0.1',r));await mkdir('food-qa',{recursive:true});
async function settle(page){await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));}
async function widthCheck(page){assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page overflows horizontally');}
const browser=await chromium.launch({headless:true,...(process.env.MORSEL_CHROME_PATH?{executablePath:process.env.MORSEL_CHROME_PATH}:{}),args:['--no-sandbox']});
try{for(const [name,width,height] of [['desktop',1440,1100],['mobile',390,844],['small-mobile',320,740]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8766/?sample=1',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.choice').count(),3);await widthCheck(page);
 await settle(page);await page.screenshot({path:`food-qa/${name}.png`,fullPage:true});
 await page.locator('#craving').fill('Smoky and crispy, no paneer, not too heavy, for two under ₹700');await page.getByRole('button',{name:'Shape my meal',exact:true}).click();
 assert((await page.locator('#intentSummary').innerText()).includes('No paneer today'));assert.equal(await page.locator('#diners').inputValue(),'2');assert.equal(await page.locator('#budget').inputValue(),'700');assert(!/paneer/i.test(await page.locator('.meal-slots').allTextContents().then(a=>a.join(' '))));
 await page.locator('#craving').fill('Warm and soft for two under ₹700');await page.getByRole('button',{name:'Shape my meal',exact:true}).click();
 const card=page.locator('.choice').filter({has:page.locator('.restaurant',{hasText:'The Green Table'})}).first();await card.getByRole('button',{name:'Shape this meal →',exact:true}).click();
 assert(await page.locator('.composition-piece').count()>0);await page.locator('#swapAnchor').selectOption({label:'Paneer Tikka'});
 if(await page.locator('#extraDish').count())await page.locator('#extraDish').selectOption({label:'Butter Naan'});
 assert((await page.locator('.composition').innerText()).includes('Paneer Tikka'));await widthCheck(page);await settle(page);await page.screenshot({path:`food-qa/${name}-studio.png`});
 await page.getByRole('button',{name:'This is my direction',exact:true}).click();assert.equal(await page.locator('.chosen-row').count(),1);await page.locator('.toast.show').waitFor({state:'hidden'});
 await page.getByRole('button',{name:'Clear plan',exact:true}).click();assert.equal(await page.locator('.chosen-row').count(),0);
 const before=await page.locator('.meal-slots').first().innerText();await page.getByRole('button',{name:'Not today',exact:true}).first().click();assert.notEqual(await page.locator('.meal-slots').first().innerText(),before);
 await page.locator('.toast.show').waitFor({state:'hidden'});await page.getByRole('button',{name:'History',exact:true}).click();await page.locator('.order-row').first().click();
 const row=page.locator('.dish-reaction').first();await row.locator('[data-eaten]').check();await row.locator('[data-dish-note]').fill('Loved the spice, too rich');await row.getByRole('button',{name:'Loved',exact:true}).click();
 assert.equal(await page.locator('.dish-reaction').first().getByRole('button',{name:'Loved',exact:true}).getAttribute('aria-pressed'),'true');assert(await page.getByRole('button',{name:'Enjoy spicy for Comfort',exact:true}).count());
 await page.getByRole('button',{name:'Enjoy spicy for Comfort',exact:true}).click();await settle(page);await page.locator('.toast.show').waitFor({state:'hidden'});await page.screenshot({path:`food-qa/${name}-receipt.png`});
 await page.locator('.memory-form summary').click();await page.locator('#memoryTitle').fill('Our slow Sunday lunch');await page.locator('#memoryOccasion').selectOption('weekend');await page.locator('#memoryNote').fill('A meal to recreate together.');await page.getByRole('button',{name:'Save this memory',exact:true}).click();
 await page.locator('.toast.show').waitFor({state:'hidden'});await page.getByRole('button',{name:'Taste',exact:true}).click();assert((await page.locator('.taste-intelligence h2').innerText()).includes('1 meal'));assert((await page.locator('.food-memories').innerText()).includes('Our slow Sunday lunch'));
 const pref=page.locator('.preference-row').filter({has:page.locator('strong',{hasText:/^paneer$/})});await pref.getByRole('button',{name:'Avoid',exact:true}).click();assert.equal(await pref.getByRole('button',{name:'Avoid',exact:true}).getAttribute('aria-pressed'),'true');await widthCheck(page);await settle(page);await page.locator('.toast.show').waitFor({state:'hidden'});await page.screenshot({path:`food-qa/${name}-taste.png`,fullPage:true});
 await page.locator('.toast.show').waitFor({state:'hidden'});await page.getByRole('button',{name:'Discover',exact:true}).click();assert.equal(await page.locator('.discovery-card').count(),2);assert.equal(await page.getByRole('link',{name:'Inspect menu ↗',exact:true}).count(),2);await widthCheck(page);await settle(page);await page.screenshot({path:`food-qa/${name}-discover.png`,fullPage:true});
 await page.getByRole('button',{name:'Your table',exact:true}).click();assert(!/paneer/i.test(await page.locator('.meal-slots').allTextContents().then(a=>a.join(' '))));await page.getByRole('button',{name:'Pause motion'}).click();assert.equal(await page.locator('body').getAttribute('class'),'motion-paused');await page.getByRole('button',{name:'Taste',exact:true}).click();assert.equal(await page.locator('.view.active').evaluate(e=>getComputedStyle(e).opacity),'1');
 assert.deepEqual(errors,[]);console.log(`PASS ${name}: craving/exclusions, shared table, coherent editing, choice/reset, dish consumption, note confirmation, lasting preferences, rituals, sources, responsive width and motion.`);await page.close();
 }
 if(process.env.MORSEL_PRIVATE_FIXTURE){
  const fixture=JSON.parse(await readFile(process.env.MORSEL_PRIVATE_FIXTURE,'utf8'));assert(fixture.orders.length>=93);
  const page=await browser.newPage({viewport:{width:390,height:844}});await page.addInitScript(data=>globalThis.MORSEL_QA=data,fixture);await page.goto('http://127.0.0.1:8766/',{waitUntil:'networkidle'});assert.equal(await page.locator('.choice').count(),3);await widthCheck(page);await settle(page);await page.screenshot({path:'food-qa/private-history-mobile.png',fullPage:true});await page.getByRole('button',{name:'History',exact:true}).click();assert.equal(await page.locator('.order-row').count(),25);await page.close();console.log('PASS private local fixture: real history generates three meal directions without publishing account data.');
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
