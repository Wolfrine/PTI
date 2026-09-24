const CACHE = 'luminary-shell-v6';
const SHELL = [
  './',
  './index.html',
  './version-loader.js',
  './app.js',
  './manifest.webmanifest',
  './assets/icon.svg',
  './versions/meaningful-motion-v4.html',
  './versions/meaningful-motion-v4.css',
  './versions/intuitive-capture-v3.html',
  './versions/intuitive-capture-v3.css',
  './versions/trace-register-v2.1.html',
  './versions/trace-register-v2.1.css'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request, { cache: 'no-store' })
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match('./index.html')))
  );
});
