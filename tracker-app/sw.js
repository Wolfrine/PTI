const CACHE='pti-tracker-shell-v5';
const ASSETS=['./','./index.html','./app.js?v=4','./model.mjs?v=4','./discussions.mjs?v=4','./styles.css?v=4','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS.map(url=>new Request(url,{cache:'reload'})))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('pti-tracker-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==location.origin||url.pathname.includes('/__/')||url.pathname.includes('/google'))return;
 // Refresh the HTML shell first so an older index cannot keep loading old versioned assets.
 if(event.request.mode==='navigate'){
  event.respondWith(fetch(new Request(event.request,{cache:'no-cache'})).then(response=>{
   if(response.ok){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)))}
   return response;
  }).catch(async()=>{const cached=await caches.match(event.request)||await caches.match('./index.html');if(cached)return cached;throw new Error('Tracker is unavailable offline')}));
  return;
 }
 event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(response=>{
  if(response.ok&&['script','style','image'].includes(event.request.destination)){const copy=response.clone();event.waitUntil(caches.open(CACHE).then(c=>c.put(event.request,copy)))}
  return response;
 })));
});
