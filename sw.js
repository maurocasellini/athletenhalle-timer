// Offline support. Network-first so new deploys show up immediately; cache is the fallback.
const CACHE = 'athletenhalle-v4';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.webmanifest',
  '/js/main.js',
  '/js/modes.js',
  '/js/engine.js',
  '/js/audio.js',
  '/js/store.js',
  '/js/wakelock.js',
  '/js/icons.js',
  '/vendor/keepalive-media.js',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/fonts/barlow-condensed-latin-600-normal.woff2',
  '/fonts/barlow-condensed-latin-700-italic.woff2',
  '/fonts/barlow-condensed-latin-800-italic.woff2',
  '/fonts/barlow-condensed-latin-900-italic.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req.mode === 'navigate' ? '/' : req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req.mode === 'navigate' ? '/' : req).then((r) => r || caches.match('/'))),
  );
});
