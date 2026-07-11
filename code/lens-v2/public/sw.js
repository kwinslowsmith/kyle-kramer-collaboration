/**
 * Service worker — minimal, for PWA installability + offline app shell.
 *
 * Scope is deliberately narrow: cache the app shell so Lens OPENS without a
 * connection (you can review already-synced words on the trail). It does NOT
 * try to cache Firebase calls or photos — the offline CAPTURE path is handled
 * by the IndexedDB queue in queue.js, which is the real "never lose a photo"
 * guarantee. Network-first so deploys show up on reload.
 */
const CACHE = "lens-shell-v17";  // bump on any shell change to purge stale clients (v17: Quiz Plus topbar button, owner-only)
const SHELL = [
  "./",
  "./index.html",
  "./css/app.css",
  "./js/app.js",
  "./js/study.js",
  "./js/quiz.js",
  "./js/clicktarget.js",
  "./js/queue.js",
  "./js/config.js",
  "./js/compendium.js",
  "./js/data.js",
  "./js/export-md.js",
  "./js/vocab.js",
  "./js/tts.js",
  "./js/roman.js",
  "./manifest.webmanifest",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Only handle our own origin's shell. Let Firebase/Storage/CDN go to network.
  if (url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request).then((resp) => {
      const copy = resp.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {});
      return resp;
    }).catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});
