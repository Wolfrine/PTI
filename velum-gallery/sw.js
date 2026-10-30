const CACHE='velum-shell-__VELUM_CACHE__';
const SHELL=['./','./index.html','./styles.css','./media-upgrades.css','./studio.css','./studio.mjs','./studio-contract.mjs','./interaction-upgrades.js','./stats-upgrades.js','./bootstrap.js','./app.js','./feed.mjs','./drift-gestures.mjs','./affection.mjs','./heart-effects.mjs','./manifest.webmanifest','./assets/icons/icon.svg'];

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
  if(url.origin!==self.location.origin || url.pathname.startsWith('/__/')) return;

  const networkFirst = request.mode==='navigate' || /\.(?:html|m?js|css|webmanifest)$/.test(url.pathname);

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
        // Release query strings deliberately bypass stale browser HTTP caches.
        // The installed shell also has canonical unversioned entries for offline use.
        .catch(()=>caches.match(request,{ignoreSearch:true}).then(cached=>cached ||
          (request.mode==='navigate' ? caches.match('./index.html') : Response.error())))
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
