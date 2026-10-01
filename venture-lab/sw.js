// Private studio data is never cached by this worker. Network-only by design.
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('venture-'))await caches.delete(key);await self.clients.claim()})()));
