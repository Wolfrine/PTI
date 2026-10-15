import {chromium} from '@playwright/test';
import {recordFixture} from '../../tests/fixtures.mjs';
import {writeFile} from 'node:fs/promises';
// Run from wedding-planner with a fresh Vite dev server; this uses test records only.
const origin=process.env.WEDDING_REVIEW_ORIGIN||'http://127.0.0.1:5177',fixture=await recordFixture(),states=[];
Object.assign(fixture.guests[0],{name:'Synthetic guest with a longer name',household:'Synthetic extended family household',dietary:'Vegetarian. A milder meal requested for this synthetic example.',stayFrom:'2027-01-18',stayUntil:'2027-01-20',accommodation:'Synthetic accommodation allocation with a longer property name',room:'Example room — not a booking',transport:'Synthetic station pickup; family contact to be agreed.'});
const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
const retain=async(page,id,width,marker,fullPage=true,errors=[])=>{
 await page.evaluate(()=>document.fonts.ready);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 const actual=await page.locator('body').innerText();if(!actual.toLowerCase().includes(marker.toLowerCase()))throw Error(`Wrong state ${id}: ${marker}`);
 const path=`design/botanical/cycle5-${id}-${width}.png`;if(states.some(s=>s.path===path||s.id===id&&s.viewport.width===width))throw Error('Duplicate evidence identity '+id+' '+width);await page.screenshot({path,fullPage});
 const checks=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,brokenImages:[...document.images].some(i=>!i.complete||i.naturalWidth===0)}));
 states.push({id,route:page.url(),viewport:{width,height:width===1440?1000:844},path,observedMarker:marker,checks:{...checks,pageErrors:[...errors]}});
 await writeFile('design/botanical/states.json',JSON.stringify({description:'Actual Chromium renders of current Botanical candidate. Public approved names/planned dates; document-derived proposed menus and visibly labelled synthetic people/logistics. Reduced-motion context.',states},null,2));
};
try{for(const width of[1440,390,360]){
 const page=await browser.newPage({viewport:{width,height:width===1440?1000:844},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/demo.ts*',r=>r.fulfill({contentType:'application/javascript',body:`export function demoRecords(){return ${JSON.stringify(fixture)}}`}));
 const snap=(id,marker,full=true)=>retain(page,id,width,marker,full,errors);
 const visit=async(route)=>{await page.goto(`${origin}/family/?demo=1#/${route}`);await page.locator('.demo-banner').waitFor();};
 await page.goto(origin);await page.locator('#couple-names').waitFor();await snap('invitation','The days are coming together.');
 for(const[id,route,marker]of[['home','home','The celebration'],['catering','catering','Food counter'],['sangeet','catering/18-4','Hot kesar milk'],['reception','catering/reception-undated','Date to confirm'],['tasks','tasks','Responsibilities']]){await visit(route);await snap(id,marker);}
 await visit('catering/reception-undated');await page.locator('[data-section="menu"]').click();await snap('menu-edit','Keep unclear readings',false);await page.locator('[data-close]').first().click();
 if(width===360){await page.close();continue;}
 await page.goto(`${origin}/design/botanical/approved-content.html`);await page.locator('.public-event').first().waitFor();await snap('future-content','SYNTHETIC FUTURE CONTENT');
 await page.goto(`${origin}/family/`);await page.getByRole('button',{name:/Continue with Google/}).waitFor();await snap('login','For invited family members.');
 for(const[id,route,marker]of[['guest-detail','guests/synthetic-person','Food & hospitality'],['stay','stays/synthetic-person','Their stay'],['responsibilities','tasks?tab=responsibilities','Synthetic hospitality arrangement'],['attendance','attendance/18-1','Who’s joining?']]){await visit(route);await snap(id,marker);}
 await visit('tasks/decision/programme');await page.locator('[data-section="decision"]').click();await page.locator('[name="status"]').selectOption('confirmed');await page.locator('dialog [type="submit"]').click();await snap('validation','Record the decision before confirming it.',false);await page.locator('[data-close]').first().click();
 await visit('guests');await page.locator('#guest-search').fill('unmatched example');await snap('empty-search','No matching guests.');await page.getByRole('button',{name:'Clear search'}).click();await page.locator('[data-add="guests"]').first().click();await page.locator('[name="name"]').fill('Unsaved synthetic person');await page.context().setOffline(true);await page.locator('dialog [type="submit"]').click();await snap('offline','You are offline.',false);await page.context().setOffline(false);await page.locator('[data-close]').first().click();await page.locator('.account-menu > summary').click();await snap('account','Export private plan',false);await page.close();
 const empty=await browser.newPage({viewport:{width,height:width===1440?1000:844}});await empty.route('**/src/demo.ts*',r=>r.fulfill({contentType:'application/javascript',body:'export function demoRecords(){return {events:[],guests:[],attendance:[],arrangements:[],decisions:[]}}'}));await empty.goto(`${origin}/family/?demo=1#/home`);await empty.getByRole('heading',{name:'The programme is taking shape.'}).waitFor();await retain(empty,'empty-home',width,'The programme is taking shape.');await empty.close();
 const loading=await browser.newPage({viewport:{width,height:width===1440?1000:844}});let release;const held=new Promise(r=>release=r);await loading.route('**/firebase_auth.js*',async r=>{await held;await r.abort();});await loading.goto(`${origin}/family/`,{waitUntil:'domcontentloaded'});await loading.getByText('Opening the family workspace…').waitFor();await retain(loading,'loading',width,'Opening the family workspace…');release();await loading.getByText('Sign-in is temporarily unavailable.',{exact:false}).waitFor();await retain(loading,'unavailable',width,'Sign-in is temporarily unavailable.');await loading.close();
}console.log('Retained',states.length,'states; failed checks',states.filter(s=>s.checks.overflow||s.checks.brokenImages||s.checks.pageErrors.length).length);}finally{await browser.close();}
