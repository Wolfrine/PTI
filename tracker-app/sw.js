const CACHE='pti-tracker-shell-v1';
const ASSETS=['./','./index.html','./app.js?v=1','./model.mjs?v=1','./styles.css?v=1','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('pti-tracker-shell-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==location.origin)return;if(url.pathname.includes('/__/')||url.pathname.includes('/google'))return;event.respondWith(caches.match(event.request).then(hit=>hit||fetch(event.request).then(r=>{if(r.ok&&['document','script','style','image'].includes(event.request.destination)){const copy=r.clone();caches.open(CACHE).then(c=>c.put(event.request,copy));}return r;})));});
