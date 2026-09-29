const CACHE = 'pti-personal-shell-v4-evidence';
const SHELL = ['/', '/index.html', '/style.css', '/boot.mjs', '/app.mjs', '/views.mjs', '/core.mjs', '/demo.mjs', '/manifest.webmanifest', '/icon.svg', '/icon-192.png', '/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('pti-personal-shell-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
 const url = new URL(e.request.url);
 // Cache only static same-origin shell files; never images, Firebase, auth or private content.
 if (e.request.method !== 'GET' || url.origin !== self.location.origin || !SHELL.includes(url.pathname)) return;
 e.respondWith(fetch(e.request).then(response => { if (response.ok && !url.search) { const copy = response.clone(); caches.open(CACHE).then(c => c.put(url.pathname, copy)); } return response; }).catch(() => caches.match(url.pathname)));
});
