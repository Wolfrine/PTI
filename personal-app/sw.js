const CACHE = 'pti-personal-shell-v2';
const SHELL = ['/', '/index.html', '/style.css', '/boot.mjs', '/app.mjs', '/core.mjs', '/demo.mjs', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pti-personal-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
 const url = new URL(e.request.url);
 // Never cache Firebase, API, token, personal-content or third-party responses.
 if (e.request.method !== 'GET' || url.origin !== self.location.origin || (!SHELL.includes(url.pathname) && e.request.mode !== 'navigate') || url.pathname.startsWith('/api') || url.pathname.startsWith('/mcp') || url.pathname.startsWith('/__/')) return;
 e.respondWith(fetch(e.request).then(response => { if (response.ok && !url.search) { const copy = response.clone(); caches.open(CACHE).then(c => c.put(url.pathname, copy)); } return response; }).catch(() => caches.match(e.request.mode === 'navigate' ? '/' : url.pathname)));
});
