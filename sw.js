// ============================================================
//  Samaji — Service Worker. Caches the static app shell (JS/CSS)
//  for instant repeat loads and a usable offline fallback.
//
//  Strategy is deliberately network-first, not cache-first: this
//  deploy has no build step and no cache-busted filenames (see the
//  comment in _headers) — every deploy overwrites /assets/*.js in
//  place at the same URL. A cache-first SW would happily keep
//  serving pre-fix JS forever once cached. Network-first means the
//  cache is only ever a fallback for when the network genuinely
//  isn't available, never a way to skip checking for the latest
//  code — same policy _headers already applies via must-revalidate,
//  just extended to work offline too.
// ============================================================
var CACHE = "samaji-shell-v1";
var SHELL = [
  "/assets/app.js",
  "/assets/idb-cache.js",
  "/assets/icons.js",
  "/assets/styles.css",
  "/assets/config.js"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL).catch(function () { /* offline install — fine, best effort */ });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET") return; // never intercept writes — this is a read-through cache only
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // leave Supabase/CDN requests alone entirely

  // HTML navigations: network-first, offline fallback to the cached shell page if one exists.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(function () { return caches.match(req).then(function (r) { return r || caches.match("/"); }); })
    );
    return;
  }

  // Static assets (JS/CSS): network-first so a fresh deploy is always picked
  // up when online; cache is purely the offline/flaky-network fallback.
  if (/\.(js|css)$/.test(url.pathname)) {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
        return res;
      }).catch(function () { return caches.match(req); })
    );
  }
});
