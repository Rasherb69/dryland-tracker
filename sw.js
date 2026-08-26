/* Dry-Land Tracker service worker.
   Strategy: NETWORK-FIRST with a short timeout, cache as the offline fallback.
   Rationale: the offline requirement is "works in the gym with no signal", not
   "loads in 50ms". Cache-first made deployed changes take several opens to
   appear, because GitHub Pages serves max-age=600 and the revalidating fetch
   was answered by the browser's own HTTP cache. Every fetch here uses
   cache:"no-store" so the network copy is always genuinely fresh.
   Bump CACHE on every deploy. */
var CACHE = "dryland-v10";
var NET_TIMEOUT_MS = 3000;
var ASSETS = ["./", "index.html", "plan.html", "manifest.webmanifest",
              "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE)
      .then(function (c) { return c.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  var url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  e.respondWith(caches.open(CACHE).then(function (cache) {
    return cache.match(e.request, { ignoreSearch: true }).then(function (cached) {
      var fromNetwork = fetch(e.request, { cache: "no-store" }).then(function (resp) {
        if (resp && resp.ok) cache.put(e.request, resp.clone());
        return resp;
      });

      if (!cached) return fromNetwork;               // nothing to fall back to

      // Serve the network copy, but never make the user wait on a bad signal.
      return new Promise(function (resolve) {
        var settled = false;
        function done(r) { if (!settled && r) { settled = true; resolve(r); } }
        setTimeout(function () { done(cached); }, NET_TIMEOUT_MS);
        fromNetwork.then(done, function () { done(cached); });
      });
    });
  }));
});
