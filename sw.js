/* =====================================================
   InternetTool – sw.js  (Service Worker)
   Provides offline support via Cache API
   ===================================================== */

var CACHE_NAME   = 'internet-tool-v1';
var SHELL_ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

/* ---- INSTALL: pre-cache app shell ---- */
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(SHELL_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

/* ---- ACTIVATE: remove old caches ---- */
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== CACHE_NAME; })
            .map(function (k) { return caches.delete(k); })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

/* ---- FETCH: cache-first for shell, network-first for API ---- */
self.addEventListener('fetch', function (event) {
  var url = new URL(event.request.url);

  /* External API calls: network-first, no cache fallback (live data needed) */
  if (url.hostname !== self.location.hostname &&
      url.hostname !== 'localhost') {
    event.respondWith(
      fetch(event.request).catch(function () {
        /* Return a simple offline JSON for API calls that fail */
        return new Response(JSON.stringify({ offline: true }),
          { headers: { 'Content-Type': 'application/json' } });
      })
    );
    return;
  }

  /* App shell files: cache-first with network fallback */
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (response) {
        /* Cache successful responses for same-origin files */
        if (response && response.status === 200 && response.type === 'basic') {
          var clone = response.clone();
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(function () {
        /* Ultimate fallback: serve index.html for navigation requests */
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('', { status: 503 });
      });
    })
  );
});
