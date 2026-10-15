import {readFile,writeFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {createHash} from 'node:crypto';

const prefix='mahima-mayank-public-v1-';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const forbidden=path=>/^\/(family(?:\/|$)|__\/|auth(?:\/|$)|firestore(?:\/|$))/.test(path);
const local=(value,from)=>{
  if(!value||/^(data:|blob:|https?:|#|mailto:|tel:)/i.test(value))return null;
  const path=new URL(value,'https://wedding.invalid'+from).pathname;
  return path&&!forbidden(path)?path:null;
};
/** Follow Rollup's actual public dependency graph, never a blanket dist cache. */
export function weddingPwaPlugin() {
  let config;const chunks=new Map();const privateChunks=new Set();
  return {name:'wedding-public-offline',apply:'build',
    configResolved(value){config=value;},
    writeBundle(_options,bundle){
      for(const [name,item] of Object.entries(bundle))if(item.type==='chunk') {
        chunks.set('/'+name,[...item.imports,...item.dynamicImports,...(item.viteMetadata?.importedCss||[]),...(item.viteMetadata?.importedAssets||[])].map(path=>'/'+path));
        if(Object.keys(item.modules).some(path=>/\/(?:@firebase|firebase)\//.test(path)||/\/src\/(?:family|store|demo)\.ts$/.test(path)))privateChunks.add('/'+name);
      }
    },
    async closeBundle(){
      const out=resolve(config.root,config.build.outDir),assets=new Map(),queue=['/index.html','/offline.html','/manifest.webmanifest','/monogram.svg','/icons/apple-touch-icon.png'];
      while(queue.length) {
        const path=queue.shift();if(assets.has(path))continue;
        if(forbidden(path)||privateChunks.has(path))throw Error(`Private code entered the public offline graph: ${path}`);
        const file=resolve(out,'.'+path);if(!file.startsWith(out+sep))throw Error('Invalid offline asset path');
        const bytes=await readFile(file);assets.set(path,bytes);
        for(const dependency of chunks.get(path)||[])queue.push(dependency);
        const extension=extname(path);
        if(extension==='.html') {
          for(const tag of bytes.toString('utf8').matchAll(/<(?:script|link|img|source|video)\b[^>]*>/gi)) {
            if(/^<link/i.test(tag[0])&&!/\brel=["'](?:stylesheet|preload|modulepreload|icon|manifest|apple-touch-icon)["']/i.test(tag[0]))continue;
            for(const attr of tag[0].matchAll(/\b(?:src|href|poster)=["']([^"']+)["']/gi)){const next=local(attr[1],path);if(next)queue.push(next);}
            for(const attr of tag[0].matchAll(/\bsrcset=["']([^"']+)["']/gi))for(const candidate of attr[1].split(',')){const next=local(candidate.trim().split(/\s+/)[0],path);if(next)queue.push(next);}
          }
        } else if(extension==='.css') {
          for(const match of bytes.toString('utf8').matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)|@import\s+["']([^"']+)["']/gi)){const next=local(match[1]||match[2],path);if(next)queue.push(next);}
        } else if(extension==='.webmanifest') {
          const manifest=JSON.parse(bytes.toString('utf8'));
          for(const icon of [...(manifest.icons||[]),...(manifest.shortcuts||[]).flatMap(shortcut=>shortcut.icons||[])]){const next=local(icon.src,path);if(next)queue.push(next);}
        }
      }
      const files=[...assets].sort(([a],[b])=>a.localeCompare(b)).map(([url,bytes])=>({url,sha256:hash(bytes)}));
      // Worker-only repairs also get a distinct cache, never replacing an active version in place.
      const version=hash(JSON.stringify(files)+(await readFile(resolve(config.root,'scripts/pwa-build.mjs'))).toString('utf8').replaceAll('\r\n','\n')).slice(0,20);
      await writeFile(resolve(out,'pwa-assets.json'),JSON.stringify({version,cacheName:prefix+version,assets:files},null,2)+'\n');
      await writeFile(resolve(out,'sw.js'),workerSource({version,cacheName:prefix+version,files}));
    }
  };
}

function workerSource({version,cacheName,files}) {
  return `/* Public invitation only. Generated from its exact production dependency graph. */
const VERSION=${JSON.stringify(version)},CACHE=${JSON.stringify(cacheName)},PREFIX=${JSON.stringify(prefix)},FILES=${JSON.stringify(files)},META='/pwa-install-metadata.json';
const PATHS=new Set(FILES.map(file=>file.url)),fallbackClients=new Set();
const digest=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const downloaded=await Promise.all(FILES.map(async file=>{
    const response=await fetch(file.url,{cache:'no-store',credentials:'omit'});
    if(!response.ok||new URL(response.url).origin!==self.location.origin||await digest(await response.clone().arrayBuffer())!==file.sha256)throw Error('Incomplete wedding invitation: '+file.url);
    return [file.url,response];
  }));
  try {
    const cache=await caches.open(CACHE);await Promise.all(downloaded.map(([url,response])=>cache.put(url,response)));
    await cache.put(META,new Response(JSON.stringify({version:VERSION,savedAt:new Date().toISOString()}),{headers:{'Content-Type':'application/json'}}));
  } catch(error){await caches.delete(CACHE);throw error;}
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  await Promise.all((await caches.keys()).filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));
  await self.clients.claim();
})()));
self.addEventListener('message',event=>{if(event.data?.type==='WEDDING_OFFLINE_DOCUMENT'&&event.source?.id)fallbackClients.add(event.source.id);});
async function network(request) {
  // An explicitly offline client must not receive a live private shell while its modules are unavailable.
  // Some Chromium network stacks can still reach a local origin from the worker in offline mode.
  if(self.navigator.onLine===false)throw Error('Offline');
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),3000);
  try{const response=await fetch(request,{signal:controller.signal});if(!response.ok)throw Error('Unavailable');return response;}finally{clearTimeout(timer);}
}
function offlineHeaders(response) {
  const headers=new Headers(response.headers);
  headers.delete('Content-Length');headers.delete('Content-Encoding');headers.delete('ETag');headers.set('Cache-Control','no-store');
  return headers;
}
async function reconnect() {
  const response=await(await caches.open(CACHE)).match('/offline.html');if(!response)return Response.error();
  // cleanUrls can redirect this cached resource. Navigations require a fresh, unredirected response.
  return new Response(await response.arrayBuffer(),{headers:offlineHeaders(response)});
}
async function invitation(event) {
  try{const response=await network(event.request);fallbackClients.delete(event.resultingClientId);return response;}
  catch {
    const cache=await caches.open(CACHE),response=await cache.match('/index.html');if(!response)return Response.error();
    if(event.resultingClientId)fallbackClients.add(event.resultingClientId);
    const metadata=await cache.match(META),saved=metadata?(await metadata.json()).savedAt:'',headers=offlineHeaders(response);
    return new Response((await response.text()).replace('</head>','<meta name="wedding-offline" content="'+saved+'"></head>'),{headers});
  }
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||/^\\/(?:__\\/|auth(?:\\/|$)|firestore(?:\\/|$))/.test(url.pathname))return;
  if(event.request.mode==='navigate'){
    if(url.pathname==='/'||url.pathname==='/index.html'){event.respondWith(invitation(event));return;}
    if(url.pathname==='/family'||url.pathname.startsWith('/family/'))event.respondWith(network(event.request).catch(reconnect));
    return;
  }
  if(!PATHS.has(url.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE),saved=await cache.match(url.pathname);
    if(fallbackClients.has(event.clientId)&&saved)return saved;
    try{return await network(event.request);}catch{return saved||Response.error();}
  })());
});
`;
}
