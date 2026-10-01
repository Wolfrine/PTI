import {chromium} from '../../personal-functions/node_modules/playwright/index.mjs';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base=path.resolve('food-app');
const server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost');const file=path.resolve(base,'.'+(url.pathname==='/'?'/index.html':url.pathname));if(!file.startsWith(base+path.sep)){res.writeHead(403).end();return}const body=await readFile(file);const type={'.html':'text/html','.mjs':'application/javascript','.css':'text/css','.webp':'image/webp','.svg':'image/svg+xml'}[path.extname(file)]||'application/octet-stream';res.writeHead(200,{'Content-Type':type});res.end(body)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(8766,'127.0.0.1',r));await mkdir('food-qa',{recursive:true});
async function settle(page){await page.evaluate(()=>Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{}))));}
const browser=await chromium.launch({headless:true,...(process.env.MORSEL_CHROME_PATH?{executablePath:process.env.MORSEL_CHROME_PATH}:{}),args:['--no-sandbox']});
try{for(const [name,width,height] of [['desktop',1440,1100],['mobile',390,844],['small-mobile',320,740]]){
 const page=await browser.newPage({viewport:{width,height}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8766/?sample=1',{waitUntil:'networkidle'});
 assert.equal(await page.locator('.choice').count(),3);
 console.log(name,await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,overflow:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,8).map(e=>e.className)})));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await settle(page);await page.screenshot({path:`food-qa/${name}.png`,fullPage:true});
 await page.getByRole('button',{name:'Spicy',exact:true}).click();await page.getByRole('button',{name:'Why this fits'}).first().click();
 await page.getByRole('button',{name:'Loved',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Loved',exact:true}).getAttribute('aria-pressed'),'true');
 await page.getByRole('button',{name:'Close details'}).click();await page.getByRole('button',{name:'History',exact:true}).click();await page.locator('.order-row').first().click();
 await settle(page);await page.locator('.toast.show').waitFor({state:'hidden'});await page.screenshot({path:`food-qa/${name}-receipt.png`});await page.getByRole('button',{name:'Close details'}).click();
 await page.getByRole('button',{name:'Taste',exact:true}).click();await settle(page);await page.screenshot({path:`food-qa/${name}-taste.png`,fullPage:true});
 await page.getByRole('button',{name:'Discover',exact:true}).click();assert.equal(await page.locator('.discovery-card').count(),4);
 await page.getByRole('button',{name:'Tonight',exact:true}).click();await page.getByRole('button',{name:'Pause motion'}).click();assert.equal(await page.locator('body').getAttribute('class'),'motion-paused');await page.getByRole('button',{name:'Taste',exact:true}).click();assert.equal(await page.locator('.view.active').evaluate(e=>getComputedStyle(e).opacity),'1');
 assert.deepEqual(errors,[]);console.log(`PASS ${name}: responsive width, choices, mood, feedback, receipt, taste, discovery and motion.`);await page.close();
 }}finally{await browser.close();await new Promise(r=>server.close(r));}
