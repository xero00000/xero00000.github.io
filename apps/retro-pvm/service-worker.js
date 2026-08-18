const CACHE = 'xero-crt-lab-pro-v3-20260818b';
const CORE = [
  './',
  './index.html',
  './style.css',
  './crt-app.js',
  './renderer.js',
  './crt-renderer.js',
  './audio.js',
  './gl-utils.js',
  './shaders.js',
  './shaders-signal.js',
  './shaders-display.js',
  './presets.js',
  './analyzer.js',
  './recorder.js',
  './manifest.webmanifest',
  './icon.svg',
  './README.md'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith('xero-crt-lab-') && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    const network = fetch(event.request).then(response => {
      if (response.ok && response.type === 'basic') {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => null);
    return cached || await network || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error());
  })());
});
