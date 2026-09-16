const CACHE='velum-shell-v9';
const SHELL=['./','./index.html','./styles.css','./interaction-upgrades.js','./zoom-failsafe.js','./bootstrap.js','./app.js','./manifest.webmanifest','./assets/icons/icon.svg'];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin || url.pathname.startsWith('/__/') || url.pathname.startsWith('/velum-api/')) return;

  const networkFirst = request.mode==='navigate' || /\.(?:html|js|css|webmanifest)$/.test(url.pathname);

  if(networkFirst){
    event.respondWith(
      fetch(request,{cache:'no-store'})
        .then(response=>{
          if(response && response.ok){
            const copy=response.clone();
            caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
          }
          return response;
        })
        .catch(()=>caches.match(request).then(cached=>cached || caches.match('./index.html')))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>cached || fetch(request).then(response=>{
      if(response && response.ok){
        const copy=response.clone();
        caches.open(CACHE).then(cache=>cache.put(request,copy)).catch(()=>{});
      }
      return response;
    }))
  );
});
