/* Offline cache — bump CACHE when the shell files change.
   The built JS/CSS bundle gets a content hash in its filename, so it isn't
   listed here; the fetch handler below caches it (and everything else)
   the first time it's requested, and serves it from cache after that. */
const CACHE = 'serveapp-v3';
const SHELL_PAGE = './index.html';
const SHELL = [
  './',
  SHELL_PAGE,
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);

    // The JS/CSS bundle's filename is content-hashed, so it can't be listed
    // in SHELL ahead of build time — pull its actual path out of the page
    // we just cached and precache that too. Without this, the very first
    // visit never warms the runtime cache for it (the page's own resources
    // load before this service worker registers and can intercept
    // anything), so offline mode would only start working on a second
    // visit, defeating "works after Add to Home Screen on one visit".
    try {
      const html = await (await cache.match(SHELL_PAGE)).text();
      const assetPaths = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);
      await Promise.all(assetPaths.map((p) => fetch(p).then((res) => cache.put(p, res)).catch(() => {})));
    } catch (_) { /* best effort — the runtime cache-first path still covers this later */ }

    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  // The page itself references a content-hashed JS/CSS bundle that gets a
  // new filename on every deploy, so it can never be served stale: always
  // try the network first, and only fall back to the cached copy when
  // there's truly no connection. (Serving a stale index.html here would
  // point the browser at hashed asset URLs from an old deploy that no
  // longer exist, and the page would load with no styling at all.)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(SHELL_PAGE, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(SHELL_PAGE))
    );
    return;
  }

  // Everything else — the hashed JS/CSS bundle, icons, manifest — is safe
  // to cache-first: a content-hashed filename's contents never change once
  // built, so a cache hit is always correct.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return res;
    }))
  );
});
