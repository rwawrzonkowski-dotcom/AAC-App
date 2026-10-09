// Service worker: caches every app file so the board works offline.
// When you change any file, bump CACHE_VERSION so devices pick up the update.
const CACHE_VERSION = "aac-v3";
const FILES = [
  "./", "index.html", "styles.css", "manifest.webmanifest",
  "js/app.js", "js/board.js", "js/speech.js", "js/storage.js",
  "js/db.js", "js/profiles.js", "js/hold.js", "js/ui.js", "js/lock.js",
  "js/adult.js", "js/editor.js", "js/events.js",
  "data/core-board.json",
  "icons/icon-180.png", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first. ignoreSearch lets any ?query on the page address match the cached page.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request))
  );
});
