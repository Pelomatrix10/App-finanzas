const CACHE_NAME = "tito-github-v11-month-movements-fix";
const BASE = self.registration.scope;

const APP_SHELL = [
  BASE,
  BASE + "index.html",
  BASE + "supabase-config.js",
  BASE + "role-ui.js",
  BASE + "month-history.js",
  BASE + "summary-movements.js",
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

async function enhanceHtml(response){
  if(!response || !response.ok) return response;
  const type = response.headers.get("content-type") || "";
  if(!type.includes("text/html")) return response;

  let html = await response.text();
  const scripts = ["role-ui.js","month-history.js","summary-movements.js"];
  for(const script of scripts){
    if(!html.includes(`src="./${script}"`) && !html.includes(`src="${script}"`)){
      html = html.includes("</body>") ? html.replace("</body>", `<script src="./${script}"></script></body>`) : html + `<script src="./${script}"></script>`;
    }
  }

  return new Response(html,{
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then(async (response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        if(event.request.mode === "navigate") return enhanceHtml(response);
        return response;
      })
      .catch(() =>
        caches.match(event.request).then(async (cached) => {
          if (cached) {
            if(event.request.mode === "navigate") return enhanceHtml(cached);
            return cached;
          }
          if (event.request.mode === "navigate") {
            const fallback = await caches.match(BASE + "index.html");
            return enhanceHtml(fallback);
          }
        })
      )
  );
});
