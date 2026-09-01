const CACHE_NAME = "tito-github-v4";
const BASE = self.registration.scope;

const APP_SHELL = [
  BASE,
  BASE + "index.html",
  BASE + "manifest.json",
  BASE + "icons/icon-192.png",
  BASE + "icons/icon-512.png",
  BASE + "icons/apple-touch-icon.png",
  BASE + "icons/favicon-48.png",
  BASE + "assets/tito-logo-master.webp",
  BASE + "assets/tito-gato-cobro-00.webp",
  BASE + "assets/tito-gato-cobro-25.webp",
  BASE + "assets/tito-gato-cobro-50.webp",
  BASE + "assets/tito-gato-cobro-75.webp",
  BASE + "assets/tito-gato-cobro-100.webp"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() =>
        caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === "navigate") {
            return caches.match(BASE + "index.html");
          }
        })
      )
  );
});
