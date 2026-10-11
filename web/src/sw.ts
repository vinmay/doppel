/// <reference lib="webworker" />
// Service worker: precache the app shell (list injected at build time), cache
// the LiteRT WASM runtime on first use, and serve the shell for navigations
// when offline. The model file itself is cached by src/embed/model-source.ts.
declare const __PRECACHE__: string[];
declare const __BUILD_ID__: string;
declare const __LITERT_VERSION__: string;

const sw = self as unknown as ServiceWorkerGlobalScope;
const SHELL = `doppel-shell-${__BUILD_ID__}`;
const RUNTIME = `doppel-wasm-${__LITERT_VERSION__}`; // LiteRT WASM runtime
const BASE = new URL(sw.registration.scope).pathname;

// Navigations can't be answered with a redirected response, so store a clean copy.
async function precache() {
  const cache = await caches.open(SHELL);
  await Promise.all(__PRECACHE__.map(async (p) => {
    const url = p === "index.html" ? BASE : BASE + p;
    const res = await fetch(url, { cache: "reload" });
    if (!res.ok) throw new Error(`precache ${url}: HTTP ${res.status}`);
    await cache.put(url, res.redirected ? new Response(await res.blob(), { headers: res.headers }) : res);
  }));
}

sw.addEventListener("install", (e) => {
  e.waitUntil(precache().then(() => sw.skipWaiting()));
});

sw.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((k) => (k.startsWith("doppel-shell-") && k !== SHELL) || (k.startsWith("doppel-wasm-") && k !== RUNTIME))
        .map((k) => caches.delete(k))))
      .then(() => sw.clients.claim()),
  );
});

async function cacheFirst(req: Request, cacheName: string): Promise<Response> {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req, { ignoreVary: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone()).catch(() => {}); // quota: still serve the response
  return res;
}

sw.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== sw.location.origin) return; // model download is handled by the page

  if (req.mode === "navigate") {
    // Network first so updates show up; fall back to the cached shell when
    // offline or when the server errors (captive portals, flaky hosts).
    const shell = async () => (await caches.match(BASE, { cacheName: SHELL, ignoreVary: true })) ?? Response.error();
    e.respondWith(fetch(req).then((res) => (res.status >= 500 ? shell() : res), shell));
    return;
  }
  if (url.pathname.startsWith(BASE + "litertlm-wasm/")) {
    e.respondWith(cacheFirst(req, RUNTIME));
    return;
  }
  e.respondWith(caches.match(req, { cacheName: SHELL, ignoreVary: true, ignoreSearch: true }).then((hit) => hit ?? fetch(req)));
});
