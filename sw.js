const CACHE_PREFIX = "treino-pro-";
const CACHE_VERSION = "v11";
const CACHE = CACHE_PREFIX + CACHE_VERSION;
const ASSETS = ["./", "./index.html", "./manifest.json"];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") e.respondWith(networkFirstHtml(req, e));
  else e.respondWith(cacheFirst(req));
});

// Fix item 3: após 1.5s entrega cache, mas fetch continua em background
async function networkFirstHtml(req, event) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 1500);

  const fetchPromise = fetch(req, { signal: controller.signal })
    .then((res) => {
      clearTimeout(timeoutId);
      if (res && res.ok) {
        const clone = res.clone();
        caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
      }
      return res;
    })
    .catch(() => {
      clearTimeout(timeoutId);
      return null;
    });

  const timeoutPromise = new Promise((resolve) =>
    setTimeout(() => resolve("TIMEOUT"), 1500)
  );

  const result = await Promise.race([fetchPromise, timeoutPromise]);

  if (result === "TIMEOUT") {
    // Deixa o fetch terminar em background
    event.waitUntil(fetchPromise.catch(() => {}));
    const cached = await caches.match(req);
    return cached ||
      (await caches.match("./index.html")) ||
      new Response("Offline", { status: 503 });
  }
  if (result) return result;

  // fetch falhou
  const cached = await caches.match(req);
  return cached ||
    (await caches.match("./index.html")) ||
    new Response("Offline", { status: 503 });
}

async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.ok && res.type === "basic") {
      const clone = res.clone();
      caches.open(CACHE).then((c) => c.put(req, clone)).catch(() => {});
    }
    return res;
  } catch {
    return new Response("", { status: 404 });
  }
}
