// Application shell only. Identity, progress, playback and media are never cached here.
const VERSION='one-piece-shell-__BUILD_ID__';
const SHELL=['/one-piece/','/one-piece/index.html','/one-piece/app.js','/one-piece/app.css','/one-piece/catalog.json','/one-piece/manifest.webmanifest','/one-piece/icons/icon-192.png','/one-piece/icons/icon-512.png','/one-piece/icons/icon.svg'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
 const cache=await caches.open(VERSION);
 await cache.addAll(SHELL.map(url=>new Request(url,{cache:'reload'})));
 // An active player is not reloaded. The page offers an explicit update action.
})()));
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 for(const key of await caches.keys())if(key.startsWith('one-piece-shell-')&&key!==VERSION)await caches.delete(key);
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/one-piece/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).then(response=>response.ok?response:Promise.reject()).catch(()=>caches.match('/one-piece/index.html')));return;
 }
 if(url.search||!SHELL.includes(url.pathname))return;
 if(url.pathname==='/one-piece/catalog.json'){
  event.respondWith(fetch(request,{cache:'no-cache'}).then(async response=>{if(response.ok)(await caches.open(VERSION)).put(request,response.clone());return response;}).catch(()=>caches.match(request)));return;
 }
 event.respondWith(caches.match(request).then(hit=>hit??fetch(request)));
});
