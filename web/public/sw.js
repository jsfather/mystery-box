// Vite replaces these build markers with the immutable app asset list and hash.
const CACHE = 'our-world-__BUILD_ID__';
const SHELL = __PRECACHE_ASSETS__;
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('our-world-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  // Never store credentials, API responses, messages, activity or event streams.
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/healthz') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => response.status >= 500 ? caches.match('/offline.html') : response).catch(() => caches.match('/offline.html')));
    return;
  }
  if (SHELL.includes(url.pathname)) event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
