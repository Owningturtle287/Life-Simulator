const CACHE = 'life-simulator-v1.0.0';
const ROOT = new URL('./', self.location.href);
const ASSETS = ['./', './index.html', './style.css', './manifest.webmanifest', './src/main.js', './src/chemistry.js', './src/engine.js', './src/renderer.js', './src/builder.js', './src/worker.js', './assets/icon.svg', './assets/icon-192.png', './assets/icon-512.png'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS.map(path => new URL(path, ROOT).href)))); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('life-simulator-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  // A single versioned cache keeps the worker, engine, and UI compatible offline.
  event.respondWith(caches.open(CACHE).then(async cache => {
    const index = new URL('./index.html', ROOT);
    const appNavigation = event.request.mode === 'navigate' && [ROOT.pathname, index.pathname].includes(url.pathname);
    const key = appNavigation ? index.href : event.request;
    const cached = await cache.match(key); if (cached) return cached;
    try { const response = await fetch(event.request); if (response.ok && ASSETS.some(path => new URL(path, ROOT).pathname === url.pathname)) await cache.put(key, response.clone()); return response; }
    catch { return new Response('This resource is unavailable offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } }); }
  }));
});
