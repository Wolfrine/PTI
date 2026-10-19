import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { publicCatalog, buildOnePiece } from '../scripts/build.mjs';
const repo = new URL('../../../', import.meta.url);
test('public catalogue derives exact real availability and excludes source paths or media URLs', async () => {
  const real = JSON.parse(await readFile(new URL('docs/one-piece/evidence/sources/catalog.json', repo)));
  const catalog = publicCatalog(real);
  assert.equal(catalog.summary.listedEpisodes, 1084);
  assert.deepEqual(catalog.episodes.filter(e => e.availability === 'listed').map(e => e.episodeNumber), Array.from({ length: 1085 }, (_, i) => i + 1).filter(n => n !== 590));
  assert.equal(catalog.endBoundary.episodeNumber, 1086);
  assert.doesNotMatch(JSON.stringify(catalog), /archive\.org|fileName|checksums|candidates|H:[/\\]/);
});
test('Hosting preserves PTI while One Piece has one canonical origin and redirect-only legacy entry', async () => {
  const firebase = JSON.parse(await readFile(new URL('firebase.json', repo)));
  const hosting = firebase.hosting.find(h => h.target === 'default');
  assert.equal(hosting.public, 'pti-app/dist/pti-app/browser');
  assert.ok(hosting.rewrites.findIndex(r => r.source === '/one-piece{,/**}') < hosting.rewrites.findIndex(r => r.source === '**'));
  assert.ok(hosting.rewrites.some(r => r.source === '/food{,/**}'));
  const worker = JSON.parse(await readFile(new URL('pti-app/ngsw-config.json', repo)));
  assert.ok(worker.navigationUrls.includes('!/one-piece'));
  assert.ok(worker.navigationUrls.includes('!/one-piece/**'));
  assert.deepEqual(firebase.hosting.map(site => site.target), ['default', 'velum', 'luminary', 'sefpo', 'venture', 'one-piece']);
  const dedicated=firebase.hosting.find(site=>site.target==='one-piece');
  assert.equal(dedicated.public,'pti-app/dist/one-piece-app');
  assert.deepEqual(dedicated.redirects,[{source:'/',destination:'/one-piece/',type:302}]);
  assert.deepEqual(dedicated.rewrites,[{source:'/one-piece{,/**}',destination:'/one-piece/index.html'},{source:'**',destination:'/index.html'}]);
  const workerHeaders=dedicated.headers.find(rule=>rule.source==='/one-piece/sw.js').headers;
  assert.equal(workerHeaders.find(header=>header.key==='Service-Worker-Allowed').value,'/one-piece/');
  for(const route of ['/','/login'])assert.match(dedicated.headers.find(rule=>rule.source===route).headers.find(header=>header.key==='Cache-Control').value,/no-cache, no-store/);
  const targets=JSON.parse(await readFile(new URL('.firebaserc',repo))).targets['pti-app-2ab59'].hosting;
  assert.deepEqual(targets['one-piece'],['pti-app-2ab59-one-piece']);
  assert.deepEqual(targets.default,['pti-app-2ab59']);
});
test('One Piece release creates its sibling site, requires Auth authorization and verifies live assets',async()=>{
  const workflow=await readFile(new URL('.github/workflows/firebase-deploy.yml',repo),'utf8');
  assert.match(workflow,/ONE_PIECE_SITE_ID=pti-app-2ab59-one-piece/);
  assert.match(workflow,/hosting:sites:create "\$ONE_PIECE_SITE_ID"/);
  assert.match(workflow,/hosting:default,hosting:one-piece --non-interactive/);
  assert.match(workflow,/pti-app-2ab59-one-piece\.web\.app','pti-app-2ab59-one-piece\.firebaseapp\.com/);
  assert.match(workflow,/authorizedDomains:\[\.\.\.new Set\(\[\.\.\.existing,\.\.\.required\]\)\]/);
  const verification=workflow.split('- name: Verify dedicated One Piece routes, identity and exact release assets')[1]?.split('- name: Deploy optional')[0];
  assert.ok(verification);
  assert.match(verification,/verifyAsset\(asset\)/);
  assert.match(verification,/response\('\/login'\)/);
  assert.match(verification,/assert\.equal\(manifest\.scope,'\/'\)/);
  const checks=await readFile(new URL('.github/workflows/one-piece-checks.yml',repo),'utf8');
  assert.match(checks,/['"]\.firebaserc['"]/);
  assert.match(checks,/['"]\.github\/workflows\/firebase-deploy\.yml['"]/);
  assert.match(checks,/fingerprint\.mjs pti-app\/dist\/one-piece-app\/one-piece/);
  assert.match(checks,/assert\.equal\(independent\.candidate,accepted\.independent_candidate\)/);
});
test('production build retains PTI, emits one native app, and leaves only legacy navigation redirects', async () => {
  const scratch = await mkdtemp(path.join(os.tmpdir(), 'one-piece-build-'));
  try {
    const destination = path.join(scratch, 'browser'), webRoot = path.join(scratch, 'web');
    await mkdir(destination); await mkdir(path.join(webRoot, 'src'), { recursive: true });
    await writeFile(path.join(destination, 'index.html'), '<!doctype html><title>Existing PTI artifact</title>');
    await writeFile(path.join(destination, 'sibling.txt'), 'preserve');
    await writeFile(path.join(webRoot, 'index.html'), '<!doctype html><head></head><script type="module" src="./src/main.mjs"></script>');
    await writeFile(path.join(webRoot, 'src/main.mjs'), 'if (__DEV__) globalThis.DEV_AUTH_BYPASS = true; console.log("production");');
    await writeFile(path.join(webRoot, 'sw.js'), "const VERSION='one-piece-shell-__BUILD_ID__';");
    const {dedicatedArtifact}=await buildOnePiece({ destination, webRoot });
    const initialWorker=await readFile(path.join(destination,'one-piece/sw.js'),'utf8');
    const initialIndex=await readFile(path.join(destination,'one-piece/index.html'),'utf8');
    assert.doesNotMatch(initialWorker,/__BUILD_ID__|cache\.addAll/);
    assert.match(initialIndex,/Opening One Piece/);
    assert.doesNotMatch(initialIndex,/app\.js|rel="manifest"/);
    assert.equal(await readFile(path.join(destination,'one-piece/manifest.webmanifest'),'utf8'),'{}\n');
    const ownWorker=await readFile(path.join(dedicatedArtifact,'one-piece/sw.js'),'utf8');
    const ownIndex=await readFile(path.join(dedicatedArtifact,'one-piece/index.html'),'utf8');
    assert.match(ownIndex,/\/one-piece\/app\.js\?v=[a-f0-9]{20}/);
    await assert.rejects(readFile(path.join(dedicatedArtifact,'sibling.txt')),/ENOENT/);
    assert.equal(await readFile(path.join(destination, 'sibling.txt'), 'utf8'), 'preserve');
    assert.match(await readFile(path.join(destination, 'index.html'), 'utf8'), /Existing PTI artifact/);
    assert.doesNotMatch(await readFile(path.join(destination, 'one-piece/app.js'), 'utf8'), /DEV_AUTH_BYPASS|__DEV__/);
    assert.doesNotMatch(await readFile(path.join(dedicatedArtifact,'one-piece/app.js'),'utf8'),/DEV_AUTH_BYPASS|__DEV__/);
    await buildOnePiece({destination,webRoot});
    assert.equal(await readFile(path.join(destination,'one-piece/sw.js'),'utf8'),initialWorker);
    assert.equal(await readFile(path.join(destination,'one-piece/index.html'),'utf8'),initialIndex);
    assert.equal(await readFile(path.join(dedicatedArtifact,'one-piece/sw.js'),'utf8'),ownWorker);
    assert.equal(await readFile(path.join(dedicatedArtifact,'one-piece/index.html'),'utf8'),ownIndex);
    await writeFile(path.join(webRoot,'src/main.mjs'),'console.log("changed public shell");');
    await buildOnePiece({destination,webRoot});
    assert.equal(await readFile(path.join(destination,'one-piece/sw.js'),'utf8'),initialWorker);
    assert.equal(await readFile(path.join(destination,'one-piece/index.html'),'utf8'),initialIndex);
    assert.notEqual(await readFile(path.join(dedicatedArtifact,'one-piece/sw.js'),'utf8'),ownWorker);
    assert.notEqual(await readFile(path.join(dedicatedArtifact,'one-piece/index.html'),'utf8'),ownIndex);
    await assert.rejects(buildOnePiece({ destination: path.join(scratch, 'missing'), webRoot }), /ENOENT/);
  } finally { assert.equal(path.dirname(path.resolve(scratch)),path.resolve(os.tmpdir()));assert.ok(path.basename(scratch).startsWith('one-piece-build-'));await rm(scratch, { recursive: true, force: true }); }
});

// Keep the deployed legacy fetch policy here: this is the upgrade path that must
// work before a new service worker activates, not just a fresh-install test.
const legacyWorker = `const SHELL=['/one-piece/','/one-piece/index.html','/one-piece/app.js','/one-piece/app.css'];
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/one-piece/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>response.ok?response:Promise.reject()).catch(()=>caches.match('/one-piece/index.html')));return;
 }
 if(url.search||!SHELL.includes(url.pathname))return;
 event.respondWith(caches.match(request).then(hit=>hit??fetch(request)));
});`;

function workerHarness(source, assets) {
  const origin='https://pti-app-2ab59.web.app', listeners=new Map(), stores=new Map();
  let online=true, skipped=false, claimed=false;
  const key=input=>new URL(typeof input==='string'?input:input.url,origin).href;
  const network=async input=>{
    if(!online)throw new Error('offline');
    const url=new URL(key(input));
    if(url.origin!==origin||!assets.has(url.pathname))return new Response('missing',{status:404});
    return new Response(assets.get(url.pathname));
  };
  const caches={
    async open(name){
      if(!stores.has(name))stores.set(name,new Map());
      const entries=stores.get(name);
      return {
        async match(input){return entries.get(key(input))?.clone();},
        async put(input,response){entries.set(key(input),response.clone());},
        async addAll(requests){
          for(const request of requests){const response=await network(request);if(!response.ok)throw new Error('precache failed');entries.set(key(request),response);}
        },
      };
    },
    async keys(){return [...stores.keys()];},
    async delete(name){return stores.delete(name);},
    async match(input){for(const entries of stores.values()){const response=entries.get(key(input));if(response)return response.clone();}},
  };
  const self={location:{origin},clients:{async claim(){claimed=true;}},skipWaiting(){skipped=true;},addEventListener(type,callback){listeners.set(type,callback);}};
  class ShellRequest extends Request {constructor(input,options){super(key(input),options);}}
  vm.runInNewContext(source,{self,caches,fetch:network,URL,Request:ShellRequest,Response});
  return {
    stores,caches,setOnline(value){online=value;},get skipped(){return skipped;},get claimed(){return claimed;},
    async lifecycle(type){let pending;listeners.get(type)?.({waitUntil(value){pending=value;}});await pending;},
    async request(input,{mode='cors',method='GET'}={}){
      let pending;listeners.get('fetch')?.({request:{url:key(input),mode,method},respondWith(value){pending=Promise.resolve(value);}});
      return {handled:!!pending,response:pending?await pending:await network(input)};
    },
    handles(input,{mode='cors',method='GET'}={}){
      let handled=false;listeners.get('fetch')?.({request:{url:key(input),mode,method},respondWith(value){handled=true;Promise.resolve(value).catch(()=>{});}});return handled;
    },
  };
}

async function shellFixture(run) {
  const scratch=await mkdtemp(path.join(os.tmpdir(),'one-piece-shell-'));
  try {
    const destination=path.join(scratch,'browser'),webRoot=path.join(scratch,'web');
    await mkdir(destination);await mkdir(path.join(webRoot,'src'),{recursive:true});
    await writeFile(path.join(destination,'index.html'),'<title>PTI</title>');
    await writeFile(path.join(webRoot,'index.html'),'<!doctype html><head></head><script type="module" src="./src/main.mjs"></script>');
    await writeFile(path.join(webRoot,'src/main.mjs'),'import "./shell.css"; console.log("https://pti-onepiece-home.duckdns.org:8443");');
    await writeFile(path.join(webRoot,'src/shell.css'),'body { color: #123; }');
    await writeFile(path.join(webRoot,'sw.js'),await readFile(new URL('../web/sw.js',import.meta.url)));
    const {dedicatedArtifact}=await buildOnePiece({destination,webRoot});
    const output=path.join(dedicatedArtifact,'one-piece'),assets=new Map(),aliasAssets=new Map();
    for(const name of ['index.html','app.js','app.css','catalog.json'])assets.set(`/one-piece/${name}`,await readFile(path.join(output,name),'utf8'));
    assets.set('/one-piece/',assets.get('/one-piece/index.html'));
    for(const name of ['manifest.webmanifest','icons/icon-192.png','icons/icon-512.png','icons/icon.svg'])assets.set(`/one-piece/${name}`,'public fixture asset');
    const alias=await readFile(path.join(destination,'one-piece/index.html'),'utf8');
    for(const route of ['/one-piece/','/one-piece/index.html','/one-piece/watch/1001'])aliasAssets.set(route,alias);
    await run({assets,aliasAssets,worker:await readFile(path.join(output,'sw.js'),'utf8'),redirectWorker:await readFile(path.join(destination,'one-piece/sw.js'),'utf8')});
  }finally{assert.equal(path.dirname(path.resolve(scratch)),path.resolve(os.tmpdir()));assert.ok(path.basename(scratch).startsWith('one-piece-shell-'));await rm(scratch,{recursive:true,force:true});}
}

test('a deployed legacy worker fetches the redirect-only document instead of booting another app',async()=>{
  await shellFixture(async({aliasAssets})=>{
    const browser=workerHarness(legacyWorker,aliasAssets),cache=await browser.caches.open('one-piece-shell-old');
    await cache.put('/one-piece/app.js',new Response('https://onepiece.local:8443'));
    await cache.put('/one-piece/app.css',new Response('old styling'));
    assert.equal(await (await browser.request('/one-piece/app.js')).response.text(),'https://onepiece.local:8443');
    const navigation=await browser.request('/one-piece/',{mode:'navigate'}),html=await navigation.response.text();
    assert.match(html,/pti-app-2ab59-one-piece\.web\.app/);
    assert.doesNotMatch(html,/app\.js|rel="manifest"/);
    assert.equal(browser.skipped,false);
  });
});

test('legacy retirement worker redirects future navigation without replacing active players or private requests',async()=>{
  await shellFixture(async({aliasAssets,redirectWorker})=>{
    const browser=workerHarness(redirectWorker,aliasAssets);
    const previous=await browser.caches.open('one-piece-shell-old');
    await previous.put('/one-piece/index.html',new Response('old usable app'));
    await (await browser.caches.open('some-other-app')).put('/other',new Response('preserve'));
    await browser.lifecycle('install');await browser.lifecycle('activate');
    assert.equal(browser.skipped,true);assert.equal(browser.claimed,true);
    assert.equal(browser.stores.has('one-piece-shell-old'),false);assert.equal(browser.stores.has('some-other-app'),true);
    browser.setOnline(false);
    const redirected=await browser.request('/one-piece/watch/1001',{mode:'navigate'});
    assert.equal(redirected.handled,true);assert.match(await redirected.response.text(),/Opening One Piece/);
    for(const route of ['/api/me','/one-piece/app.js','/one-piece/media/1.mp4','https://pti-onepiece-home.duckdns.org:8443/media/1'])assert.equal(browser.handles(route),false);
    assert.doesNotMatch(redirectWorker,/clients\.matchAll|\.navigate\(|location\.reload|localStorage|indexedDB/);
  });
});

test('current worker precaches exact versioned shell for offline and excludes every private or foreign URL',async()=>{
  await shellFixture(async({assets,worker})=>{
    const browser=workerHarness(worker,assets);
    await (await browser.caches.open('one-piece-shell-old')).put('/one-piece/index.html',new Response('stale old index'));
    await browser.lifecycle('install');
    assert.equal(browser.skipped,false);assert.equal(browser.claimed,false);
    browser.setOnline(false);
    const html=await (await browser.request('/one-piece/watch/1001',{mode:'navigate'})).response.text();
    assert.equal(html,assets.get('/one-piece/index.html'));
    const script=html.match(/src="([^"]*app\.js[^"]*)"/)[1],css=html.match(/href="([^"]*app\.css[^"]*)"/)[1];
    assert.equal(await (await browser.request(script)).response.text(),assets.get('/one-piece/app.js'));
    assert.equal(await (await browser.request(css)).response.text(),assets.get('/one-piece/app.css'));
    assert.equal(await (await browser.request('/one-piece/catalog.json')).response.text(),assets.get('/one-piece/catalog.json'));
    for(const input of ['/one-piece/app.js','/one-piece/app.js?v=old','/one-piece/app.js?v=old&ticket=secret','/one-piece/api/me','/one-piece/media/1.mp4','/one-piece/catalog.json?ticket=secret','/api/me','https://pti-onepiece-home.duckdns.org:8443/api/me'])assert.equal(browser.handles(input),false,input);
    assert.equal(browser.handles(script,{method:'POST'}),false);
    await browser.lifecycle('activate');
    assert.equal(browser.claimed,true);assert.equal(browser.stores.has('one-piece-shell-old'),false);
    const entries=[...browser.stores.values()][0];
    assert.ok(entries.has(new URL(script,'https://pti-app-2ab59.web.app').href));
    assert.equal(entries.has('https://pti-app-2ab59.web.app/one-piece/app.js'),false);
  });
});
