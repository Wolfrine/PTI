const CACHE='morsel-shell-v4';
const BASE=new URL('./',self.location.href).pathname;
const FILES=['index.html','styles.css','app.mjs','core.mjs','intelligence.mjs','places.mjs','icon.svg','assets/meal.webp','manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES.map(f=>BASE+f))).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('morsel-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(BASE))return;
 // Only public app-shell files are cached. Firebase and Gmail traffic never enter this cache.
 const file=url.pathname.slice(BASE.length)||'index.html';if(!FILES.includes(file))return;
 event.respondWith(fetch(event.request).then(r=>{if(r.ok)caches.open(CACHE).then(c=>c.put(event.request,r.clone()));return r}).catch(()=>caches.match(event.request)));
});
