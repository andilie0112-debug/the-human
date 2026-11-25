// The Human service worker: makes the game installable and playable offline after the first visit.
// Pages: network first (so updates arrive), cache as fallback.
// Hashed build files (assets/*): cache first. Models and textures: cache, refreshed in the background.
const CACHE = 'the-human-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match(self.registration.scope))),
    );
    return;
  }
  const hashed = url.pathname.includes('/assets/') && /-[A-Za-z0-9_-]{8,}\.\w+$/.test(url.pathname);
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok) cache.put(req, res.clone());
          return res;
        })
        .catch(() => hit);
      if (hit) {
        if (!hashed) event.waitUntil(refresh);
        return hit;
      }
      return refresh;
    }),
  );
});
