const CACHE_NAME = "tito-github-v29-recordatorios-discretos";
const BASE = self.registration.scope;

const APP_SHELL = [
  BASE,
  BASE + "index.html",
  BASE + "supabase-config.js",
  BASE + "role-ui.js",
  BASE + "month-history.js",
  BASE + "summary-movements.js",
  BASE + "client-month-filter.js",
  BASE + "studio-noir-copper.js",
  BASE + "agenda-persistence.js",
  BASE + "agenda-reminders.js",
  BASE + "beta-welcome.js",
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

self.addEventListener("push",event=>{
  let payload={};
  try{payload=event.data?.json()||{}}catch{}
  const raw=String(payload.url||BASE);
  let url;try{url=new URL(raw,BASE)}catch{url=new URL(BASE)}
  const safeUrl=url.origin===self.location.origin&&url.pathname.startsWith(new URL(BASE).pathname)?url.href:BASE;
  event.waitUntil(self.registration.showNotification(String(payload.title||"TiTo · Recordatorio"),{
    body:String(payload.body||"Abre TiTo para revisar tu Agenda."),
    icon:BASE+"icons/icon-192.png",badge:BASE+"icons/favicon-48.png",
    tag:String(payload.tag||"tito-reminder"),data:{url:safeUrl},renotify:false
  }));
});
self.addEventListener("notificationclick",event=>{
  event.notification.close();
  const url=event.notification.data?.url||BASE;
  event.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(async clients=>{
    for(const client of clients){if(client.url.startsWith(BASE)&&"navigate" in client){await client.navigate(url);return client.focus();}}
    return self.clients.openWindow(url);
  }));
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
  const scripts = ["role-ui.js","month-history.js","summary-movements.js","beta-welcome.js","client-month-filter.js"];
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