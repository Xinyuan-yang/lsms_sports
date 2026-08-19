---
---
const CACHE_NAME = "lsms-sports-v1";
const ASSETS = [
  "{{ '/' | relative_url }}",
  "{{ '/index.html' | relative_url }}",
  "{{ '/switzerland-hiking-tracker/' | relative_url }}",
  "{{ '/calculation-details/' | relative_url }}",
  "{{ '/assets/css/style.css' | relative_url }}",
  "{{ '/script.js' | relative_url }}",
  "{{ '/map.js' | relative_url }}",
  "{{ '/assets/icons/icon-192x192.png' | relative_url }}",
  "{{ '/assets/icons/icon-512x512.png' | relative_url }}"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Skip cross-origin requests (e.g. Firebase, Leaflet CDN, OSM tiles).
  if (new URL(event.request.url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request);
    })
  );
});
