import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {resolve,relative,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {brotliCompressSync} from 'node:zlib';
import {chromium,expect} from '@playwright/test';

const root=fileURLToPath(new URL('../dist/',import.meta.url)),evidence=fileURLToPath(new URL('../../.wedding-qa/pwa/',import.meta.url)),files=new Map(),results=[],errors=[],networkRequests=[],activationProofs=[];
const digest=value=>createHash('sha256').update(value).digest('hex');
async function walk(path){for(const item of await readdir(path,{withFileTypes:true})){const name=resolve(path,item.name);if(item.isDirectory())await walk(name);else files.set('/'+relative(root,name).replaceAll('\\','/'),await readFile(name));}}
await walk(root);await mkdir(evidence,{recursive:true});
const graph=JSON.parse(files.get('/pwa-assets.json').toString()),manifest=JSON.parse(files.get('/manifest.webmanifest').toString());
assert.equal(manifest.id,'/');assert.equal(manifest.start_url,'/');assert.equal(manifest.scope,'/');assert.equal(manifest.display,'standalone');assert.equal(manifest.name,'Mahima & Mayank');assert.ok(manifest.shortcuts.some(shortcut=>shortcut.url==='/family/'));
for(const asset of graph.assets){assert.equal(digest(files.get(asset.url)),asset.sha256);assert.ok(!/\/family|index[.]esm|firebase|\/__\//i.test(asset.url),asset.url);}
assert.ok(graph.assets.some(asset=>asset.url.endsWith('.woff2')));assert.ok(graph.assets.some(asset=>asset.url.startsWith('/art/')));assert.ok(graph.assets.some(asset=>asset.url.endsWith('/icon-512.png')));
const js=graph.assets.filter(asset=>asset.url.endsWith('.js')).map(asset=>files.get(asset.url).toString()).join('\n');assert.doesNotMatch(js,/firestore[.]googleapis[.]com|identitytoolkit[.]googleapis[.]com|initializeFirestore/);
results.push('Production public dependency graph is complete, hash checked and excludes family/Firebase chunks');
function version(marker) {
  const snapshot=new Map(files),html=files.get('/index.html').toString().replace('</body>',`<p data-release-marker>${marker}</p></body>`);snapshot.set('/index.html',Buffer.from(html));
  const assets=graph.assets.map(asset=>asset.url==='/index.html'?{...asset,sha256:digest(html)}:asset),id=digest(marker+JSON.stringify(assets)).slice(0,20),cacheName='mahima-mayank-public-v1-'+id;
  snapshot.set('/sw.js',Buffer.from(files.get('/sw.js').toString().replace(/const VERSION="[^"]+",CACHE="[^"]+"/,`const VERSION="${id}",CACHE="${cacheName}"`).replace(/FILES=\[[^\n]*?\],META=/,`FILES=${JSON.stringify(assets)},META=`)));
  return {snapshot,id,cacheName};
}
const versions={a:version('LOCAL PWA TEST A'),b:version('LOCAL PWA TEST B'),c:version('LOCAL PWA TEST C')};let release='a',broken=false;
const headers=JSON.parse(await readFile(new URL('../../firebase.wedding.json',import.meta.url),'utf8')).hosting[0].headers[0].headers;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2','.svg':'image/svg+xml'};
const server=createServer((request,response)=>{
  const pathname=new URL(request.url,'http://localhost').pathname,path=pathname==='/'?'/index.html':pathname==='/family/'||pathname==='/family'?'/family/index.html':pathname==='/offline/'?'/offline.html':pathname;
  networkRequests.push({pathname,at:new Date().toISOString()});
  for(const header of headers)response.setHeader(header.key,header.value);response.setHeader('Cache-Control','no-store');response.setHeader('Content-Type',mime[extname(path)]||'application/octet-stream');
  // Firebase cleanUrls/trailingSlash redirects the precached HTML URL before returning compressed bytes.
  if(pathname==='/offline.html'){response.statusCode=302;response.setHeader('Location','/offline/');response.end();return;}
  if(path.startsWith('/__/')||path.startsWith('/firestore/')){response.end('PRIVATE ENDPOINT TEST');return;}
  const body=versions[release].snapshot.get(path);if(!body||(broken&&path.startsWith('/art/'))){response.statusCode=404;response.end('Missing local test asset');return;}
  if(pathname==='/offline/'){const compressed=brotliCompressSync(body);response.setHeader('Content-Encoding','br');response.setHeader('Content-Length',compressed.length);response.setHeader('ETag','"local-neutral-brotli"');response.end(compressed);return;}response.end(body);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
let browser;
async function closeWindowsAndAwaitActivation(context,expected,pages,label) {
  let candidate,observed=[];
  await expect.poll(async()=>{
    const workers=await Promise.all(context.serviceWorkers().map(async worker=>{
      try{return{worker,...await worker.evaluate(()=>({version:typeof VERSION==='undefined'?null:VERSION,state:self.serviceWorker?.state??null,ownsWaiting:self.registration.waiting===self.serviceWorker,ownsActive:self.registration.active===self.serviceWorker}))};}catch(error){return{worker,error:error.message};}
    }));
    observed=workers.map(({worker,...state})=>({url:worker.url(),...state}));candidate=workers.find(state=>state.version===expected.id&&state.state==='installed'&&state.ownsWaiting)?.worker;
    return !!candidate;
  },{timeout:10000,message:`Find the installed ${label} service worker`}).toBe(true).catch(async error=>{await writeFile(evidence+`/activation-${label}-failure.json`,JSON.stringify({browser:browser.version(),build:graph.version,expectedVersion:expected.id,observed,pages:context.pages().map(page=>page.url()),error:error.message},null,2));throw error;});
  // Observe the waiting worker directly; opening an observer page would itself delay activation.
  const activation=candidate.evaluate(async expectedVersion=>{
    const registration=self.registration,target=self.serviceWorker;
    if(typeof VERSION==='undefined'||VERSION!==expectedVersion||!target||target.state!=='installed'||registration.waiting!==target)throw Error('Unexpected waiting update worker');
    const startedAt=Date.now(),transitions=[];
    const snapshot=async()=>({version:VERSION,state:target.state,activeState:registration.active?.state??null,waitingState:registration.waiting?.state??null,ownsActive:registration.active===target,caches:await caches.keys(),clients:(await self.clients.matchAll({type:'window',includeUncontrolled:true})).map(client=>client.url),transitions,elapsedMs:Date.now()-startedAt});
    return new Promise((resolve,reject)=>{
      let finished=false;
      const timer=setTimeout(async()=>{if(finished)return;finished=true;target.removeEventListener('statechange',changed);try{reject(Error('Natural activation timed out: '+JSON.stringify(await snapshot())));}catch(error){reject(Error('Natural activation timed out; state snapshot failed: '+error.message));}},20000);
      async function changed(){
        if(finished)return;transitions.push({state:target.state,atMs:Date.now()-startedAt});
        if(target.state!=='activated'&&target.state!=='redundant')return;
        finished=true;clearTimeout(timer);target.removeEventListener('statechange',changed);
        try{const proof=await snapshot();if(proof.state==='activated'&&proof.ownsActive)resolve(proof);else reject(Error('Unexpected natural activation state: '+JSON.stringify(proof)));}catch(error){reject(error);}
      }
      target.addEventListener('statechange',changed);void changed();
    });
  },expected.id).then(value=>({value}),error=>({error}));
  let activationResult;
  try {
    await Promise.all(pages.map(page=>page.close()));
    const outcome=await activation;if(outcome.error)throw outcome.error;activationResult=outcome.value;
    const proof={label,selected:observed.find(state=>state.version===expected.id&&state.state==='installed'&&state.ownsWaiting),...outcome.value};assert.equal(proof.state,'activated');assert.equal(proof.ownsActive,true);assert.deepEqual(proof.clients,[],'All wedding windows must remain closed during natural activation');
    assert.deepEqual(proof.caches.filter(name=>name.startsWith('mahima-mayank-public-v1-')),[expected.cacheName]);activationProofs.push(proof);
    await writeFile(evidence+'/natural-activation.json',JSON.stringify({browser:browser.version(),build:graph.version,activationProofs},null,2));
  }catch(error){
    await writeFile(evidence+`/activation-${label}-failure.json`,JSON.stringify({browser:browser.version(),build:graph.version,expected:{id:expected.id,cacheName:expected.cacheName},observed,pages:context.pages().map(page=>page.url()),error:error.message,activationResult,activationProofs},null,2));throw error;
  }
}
try {
  browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{});
  const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
  await page.goto(origin);await page.waitForFunction(()=>navigator.serviceWorker.controller!==null);await page.evaluate(()=>navigator.serviceWorker.ready);
  const cacheEntries=()=>page.evaluate(async()=>{const rows=[];for(const name of await caches.keys())for(const request of await(await caches.open(name)).keys())rows.push({name,url:request.url});return rows;});
  let entries=await cacheEntries();assert.equal(entries.filter(row=>row.name===versions.a.cacheName).length,graph.assets.length+1);assert.ok(!entries.some(row=>/\/family|firebase|\/__\//i.test(row.url)));
  const neutralCache=await page.evaluate(async cacheName=>{const response=await(await caches.open(cacheName)).match('/offline.html');return{url:response.url,redirected:response.redirected,headers:Object.fromEntries(response.headers),body:await response.text()};},versions.a.cacheName);
  assert.equal(neutralCache.redirected,true);assert.equal(neutralCache.url,origin+'/offline/');assert.equal(neutralCache.headers['content-encoding'],'br');assert.equal(neutralCache.body,files.get('/offline.html').toString());
  await writeFile(evidence+'/clean-url-cache.json',JSON.stringify({browser:browser.version(),build:graph.version,neutralCache},null,2));
  await page.evaluate(async()=>{const cache=await caches.open('another-app-test-cache');await cache.put('/other-public-resource',new Response('Other app'));await fetch('/__/auth/test');await fetch('/firestore/test');});
  assert.ok(!(await cacheEntries()).some(row=>/\/__\/|\/firestore\//.test(row.url)));
  results.push('Initial install saves one complete public version; auth/private endpoints never enter CacheStorage');
  await context.setOffline(true);await page.reload();await expect(page.locator('[data-pwa-notice="offline"]')).toContainText('Saved invitation');await expect(page.locator('[data-release-marker]')).toHaveText('LOCAL PWA TEST A');await expect(page.locator('[data-countdown] > span')).toHaveCount(4);
  await expect(page.locator('[data-motion-toggle]')).toBeVisible();
  await page.waitForFunction(()=>document.getAnimations().some(animation=>animation.id==='botanical-sway'&&animation.currentTime>0));
  const before=await page.locator('[data-countdown]').innerText();await expect.poll(()=>page.locator('[data-countdown]').innerText()).not.toBe(before);
  assert.ok(await page.locator('img').evaluateAll(images=>images.every(image=>image.complete&&image.naturalWidth>0)));assert.equal(await page.evaluate(()=>document.fonts.check('16px DM')),true);
  await page.screenshot({path:evidence+'/offline-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:evidence+'/offline-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  const privateRequestsBefore=networkRequests.filter(request=>request.pathname==='/family/').length;
  let privateOffline;try{privateOffline=await page.goto(origin+'/family/');}catch(error){await writeFile(evidence+'/clean-url-navigation-failure.json',JSON.stringify({browser:browser.version(),build:graph.version,neutralCache,error:error.message,networkRequests,errors},null,2));throw error;}
  try {await expect(page.locator('h1')).toHaveText('Let’s reconnect.');}
  catch(error){await writeFile(evidence+'/private-offline-response.json',JSON.stringify({url:page.url(),status:privateOffline?.status(),headers:await privateOffline?.allHeaders(),responseBody:await privateOffline?.text(),document:await page.content(),workers:await Promise.all(context.serviceWorkers().map(worker=>worker.evaluate(()=>({online:navigator.onLine,url:location.href})))),browser:await page.evaluate(async()=>({online:navigator.onLine,contentType:document.contentType,controller:!!navigator.serviceWorker.controller,cached:await Promise.all((await caches.keys()).filter(name=>name.startsWith('mahima-mayank-public-')).map(async name=>{const response=await(await caches.open(name)).match('/offline.html');return{name,headers:response?Object.fromEntries(response.headers):null,body:response?await response.text():null};}))})),networkRequests,errors},null,2));throw error;}
  await expect(page.locator('body')).not.toContainText('Continue with Google');await expect(page.locator('a[href="/"]')).toBeVisible();
  assert.equal(privateOffline.status(),200);assert.equal(privateOffline.fromServiceWorker(),true);assert.equal(await privateOffline.text(),files.get('/offline.html').toString());
  const neutralHeaders=await privateOffline.allHeaders();for(const name of ['content-encoding','content-length','etag'])assert.equal(neutralHeaders[name],undefined,name);assert.equal(neutralHeaders['cache-control'],'no-store');for(const header of headers.filter(header=>header.key!=='Cache-Control'))assert.equal(neutralHeaders[header.key.toLowerCase()],header.value,header.key);
  assert.equal(networkRequests.filter(request=>request.pathname==='/family/').length,privateRequestsBefore,'An explicitly offline family navigation must not fetch a live shell');assert.equal(await page.locator('#workspace, #editor, .guest-list').count(),0);
  await writeFile(evidence+'/private-offline-after-fix.json',JSON.stringify({browser:browser.version(),build:graph.version,status:privateOffline.status(),fromServiceWorker:privateOffline.fromServiceWorker(),headers:await privateOffline.allHeaders(),responseBody:await privateOffline.text(),offline:await page.evaluate(()=>!navigator.onLine),familyNetworkRequestsDuringOffline:networkRequests.filter(request=>request.pathname==='/family/').length-privateRequestsBefore,privateShellElements:await page.locator('#workspace, #editor, .guest-list').count(),errors},null,2));
  results.push('Offline invitation keeps artwork/fonts and a live countdown with saved-time notice; offline family route shows only neutral reconnect guidance');
  await context.setOffline(false);await page.goto(origin+'/family/');await page.waitForFunction(()=>document.body.dataset.pwaState==='registered');await expect(page.getByRole('button',{name:/Continue with Google/})).toBeVisible();
  assert.ok(!(await cacheEntries()).some(row=>/\/family|firebase|index[.]esm|\/__\//i.test(row.url)));
  await page.evaluate(()=>{const dialog=document.querySelector('#editor');dialog.innerHTML='<label>LOCAL SYNTHETIC DRAFT<textarea>Keep this unsaved draft</textarea></label>';dialog.showModal();});
  const update=async()=>page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});
  release='b';broken=true;await update();await expect.poll(()=>page.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();return !registration.installing;})).toBe(true);assert.equal(await page.evaluate(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting),false);await expect(page.locator('#editor textarea')).toHaveValue('Keep this unsaved draft');
  broken=false;await update();await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);await expect(page.locator('[data-pwa-notice="update"]')).toBeVisible();await expect(page.locator('#editor')).toHaveJSProperty('open',true);await expect(page.locator('#editor textarea')).toHaveValue('Keep this unsaved draft');await page.screenshot({path:evidence+'/waiting-update-desktop.png'});
  await context.setOffline(true);const saved=await context.newPage();await saved.goto(origin);await expect(saved.locator('[data-release-marker]')).toHaveText('LOCAL PWA TEST A');
  results.push('Incomplete update cannot activate; complete waiting update preserves an open editor/draft and the prior coherent offline fallback');
  await closeWindowsAndAwaitActivation(context,versions.b,[page,saved],'b');let current=await context.newPage();await current.goto(origin);await expect(current.locator('[data-release-marker]')).toHaveText('LOCAL PWA TEST B');
  await context.setOffline(false);release='c';await current.reload();await current.evaluate(async()=>{const registration=await navigator.serviceWorker.getRegistration();await registration.update();});await current.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration()).waiting);await context.setOffline(true);await current.reload();await expect(current.locator('[data-release-marker]')).toHaveText('LOCAL PWA TEST B');
  await closeWindowsAndAwaitActivation(context,versions.c,[current],'c');current=await context.newPage();await current.goto(origin);await expect(current.locator('[data-release-marker]')).toHaveText('LOCAL PWA TEST C');
  const cachesLeft=await current.evaluate(()=>caches.keys());assert.deepEqual(cachesLeft.filter(name=>name.startsWith('mahima-mayank-public-v1-')),[versions.c.cacheName]);assert.ok(cachesLeft.includes('another-app-test-cache'));
  results.push('Two version updates activate naturally after windows close, never overwrite the active fallback, and clean only wedding-owned caches');
  await context.setOffline(false);const phone=await browser.newContext({viewport:{width:390,height:844},userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1'}),iosPage=await phone.newPage();await iosPage.goto(origin);await iosPage.locator('[data-pwa-install]').first().click();await expect(iosPage.locator('.pwa-help')).toBeVisible();await expect(iosPage.locator('.pwa-help')).toContainText('Add to Home Screen');assert.equal(await iosPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.equal(await iosPage.locator('.pwa-help').evaluate(dialog=>dialog.contains(document.activeElement)),true);await iosPage.screenshot({path:evidence+'/install-help-mobile.png'});await iosPage.locator('.pwa-done').click();await iosPage.setViewportSize({width:1440,height:1000});await iosPage.locator('[data-pwa-install]').first().click();await iosPage.screenshot({path:evidence+'/install-help-desktop.png'});await iosPage.locator('.pwa-done').click();
  await current.setViewportSize({width:1440,height:1000});await current.evaluate(()=>{const event=new Event('beforeinstallprompt');event.prompt=async()=>{window.nativePromptUsed=true;};event.userChoice=Promise.resolve({outcome:'dismissed'});dispatchEvent(event);const button=document.createElement('button');button.textContent='LOCAL DYNAMIC INSTALL TEST';button.dataset.pwaInstall='';document.body.append(button);});await current.getByText('LOCAL DYNAMIC INSTALL TEST').click();assert.equal(await current.evaluate(()=>window.nativePromptUsed),true);await current.evaluate(()=>dispatchEvent(new Event('appinstalled')));await expect(current.locator('[data-pwa-install]').first()).toBeHidden();
  results.push('iOS instructions, delegated dynamic install controls and installed-state hiding work; native prompt was simulated, not a device-install claim');
  assert.deepEqual(errors,[]);await writeFile(evidence+'/results.json',JSON.stringify({origin,browser:browser.version(),build:graph.version,results,errors,activationProofs,versions:Object.fromEntries(Object.entries(versions).map(([key,value])=>[key,value.id]))},null,2));console.log(`PASS ${results.length} PWA acceptance scenarios`);
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
