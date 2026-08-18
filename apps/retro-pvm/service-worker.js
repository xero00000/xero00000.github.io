const CACHE = 'xero-crt-lab-pro-v3-20260818c';
const CORE = [
  './',
  './index.html',
  './style.css',
  './mobile-fixes.css',
  './crt-app.js',
  './renderer.js',
  './profile-normalizer.js',
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

async function remember(request, response) {
  if (response?.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

async function networkFirst(request, navigationFallback = false) {
  try {
    return await remember(request, await fetch(request));
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (navigationFallback) return (await caches.match('./index.html')) || Response.error();
    return Response.error();
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    fetch(request).then(response => remember(request, response)).catch(() => {});
    return cached;
  }
  try {
    return await remember(request, await fetch(request));
  } catch {
    return Response.error();
  }
}

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(CORE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('xero-crt-lab-') && key !== CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isAppCode = request.mode === 'navigate'
    || ['script', 'style', 'manifest'].includes(request.destination)
    || /\.(?:html|js|css|webmanifest)$/i.test(url.pathname);

  event.respondWith(
    isAppCode
      ? networkFirst(request, request.mode === 'navigate')
      : cacheFirst(request)
  );
});
