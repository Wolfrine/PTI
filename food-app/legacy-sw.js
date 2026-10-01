// Retire only the former /food/ app shell. Account data is untouched.
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 await Promise.all((await caches.keys()).filter(k=>k.startsWith('morsel-shell-')).map(k=>caches.delete(k)));
 await self.registration.unregister();
 for(const client of await self.clients.matchAll({type:'window'})){
  const url=new URL(client.url);
  if(url.origin===self.location.origin&&url.pathname.startsWith('/food/'))await client.navigate('https://pti-app-2ab59-morsel.web.app/'+url.hash);
 }
})()));
