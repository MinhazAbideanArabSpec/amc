// sw.js — network-first app shell caching, for PWA installability and
// minimal offline resilience. This app has no build step, so file URLs
// never change between deploys — a cache-first strategy would risk
// serving stale JS/CSS indefinitely after an update. Instead this always
// prefers a live network response and only falls back to the cache when
// the network is unavailable.

const CACHE_NAME = 'amc-shell-v1';
const SHELL_URLS = ['.', 'index.html', 'style.css', 'favicon.svg', 'manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Never intercept cross-origin requests — Supabase (API/auth/storage/
  // edge functions), Google Fonts, the jsPDF CDN all need to stay live.
  if (url.origin !== self.location.origin) return;
  if (event.request.method !== 'GET') return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
