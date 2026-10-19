/* Morning Edition, public copy: service worker (exported as sw.js next to index.html).
   Same idea as the private app's worker, for a static site under a sub-path
   (ajv009.com/morning-edition/) that shares its origin with other sites, so every cache
   name starts with "me-pub-" and nothing else on the origin is touched.
   - shell (index, stylesheet, script, fonts, icons, manifest) precached;
   - every issue kept on the device ("me-pub-issue-<date>"), synced from issues.json when
     the worker starts, when a page asks, on Background Sync after being offline, and on
     Periodic Background Sync while the app is closed (installed app only);
   - pages network first with a short wait, then the cached copy. */
// publish.py replaces these two lines on export.
const SHELL = "me-pub-shell-8ac783ad3e38";
const SHELL_PATHS = ["./", "manifest.webmanifest", "static/app.css", "static/public.js", "static/fonts/doto.woff2", "static/fonts/geist.woff2", "static/fonts/literata-italic.woff2", "static/fonts/literata.woff2", "static/icons/mark.svg", "static/icons/icon-192.png", "static/icons/icon-512.png"];
const NET_WAIT_MS = 2500;
const KEEP_ISSUES = 365;
const REFRESH_ON_UPDATE = 30;
const BASE = self.registration.scope;                     // ".../morning-edition/"
const abs = (p) => new URL(p, BASE).href;
const ISSUE_RE = /issue\/(\d{4}-\d{2}-\d{2})\/(?:index\.html)?$/;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_PATHS.map(abs))).then(() => self.skipWaiting()));
});

const retryLater = () => self.registration.sync?.register("me-pub-issues").catch(() => {});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    let upgraded = false;
    for (const k of await caches.keys()) {
      if (k.startsWith("me-pub-shell-") && k !== SHELL) { await caches.delete(k); upgraded = true; }
    }
    await self.clients.claim();
    syncIssues({ refresh: upgraded ? REFRESH_ON_UPDATE : 0 }).catch(retryLater);
  })());
});

let syncing = null;
function syncIssues(opts = {}) {
  if (!syncing) syncing = doSync(opts).finally(() => { syncing = null; });
  return syncing;
}

async function cacheIssue(date) {
  const name = "me-pub-issue-" + date;
  const res = await fetch(abs("issue/" + date + "/"), { cache: "no-cache" });
  if (!res.ok) throw new Error(date + " " + res.status);
  await (await caches.open(name)).put(abs("issue/" + date + "/"), res);
}

async function doSync({ refresh = 0 } = {}) {
  const res = await fetch(abs("issues.json"), { cache: "no-store" });
  if (!res.ok) throw new Error("issues.json " + res.status);
  const dates = (await res.json()).map((r) => r.date).sort().reverse();
  const keep = new Set(dates.slice(0, KEEP_ISSUES));
  const have = new Set((await caches.keys()).filter((k) => /^me-pub-issue-\d{4}-\d{2}-\d{2}$/.test(k))
                                            .map((k) => k.slice(13)));
  let added = 0;
  for (const [i, d] of dates.entries()) {
    if (!keep.has(d) || (have.has(d) && i >= refresh)) continue;
    try { await cacheIssue(d); if (!have.has(d)) added++; } catch (_) { /* next sync */ }
  }
  for (const d of have) if (!keep.has(d)) await caches.delete("me-pub-issue-" + d);
  try {
    const home = await fetch(abs("./"), { cache: "no-cache" });
    if (home.ok) await (await caches.open(SHELL)).put(abs("./"), home);
  } catch (_) {}
  const out = { type: "issues-synced", added, latest: dates[0] || null, count: keep.size };
  for (const c of await self.clients.matchAll({ type: "window" })) c.postMessage(out);
  return out;
}

self.addEventListener("message", (e) => {
  if (e.data && e.data.type === "sync-issues") e.waitUntil(syncIssues().catch(retryLater));
});
self.addEventListener("sync", (e) => { if (e.tag === "me-pub-issues") e.waitUntil(syncIssues()); });
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "me-pub-issues") e.waitUntil(syncIssues().catch(() => {}));
});

async function cached(key, cacheName) {
  return (cacheName && (await (await caches.open(cacheName)).match(key, { ignoreSearch: true }))) ||
         (await caches.match(key, { ignoreSearch: true }));
}

async function networkFirst(e, req, key, cacheName) {
  const net = fetch(req).then(async (res) => {
    if (res.ok && cacheName && (await caches.has(cacheName))) {
      await (await caches.open(cacheName)).put(key, res.clone());
    }
    return res;
  });
  e.waitUntil(net.then(() => {}, () => {}));
  const timer = new Promise((r) => setTimeout(() => r("slow"), NET_WAIT_MS));
  try {
    const first = await Promise.race([net, timer]);
    if (first !== "slow") return first;
    return (await cached(key, cacheName)) || await net;
  } catch (err) {
    const hit = (await cached(key, cacheName)) || (await cached(abs("./"), SHELL));
    if (hit) return hit;
    throw err;
  }
}

async function staleWhileRevalidate(e, req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req, { ignoreSearch: true });
  const fresh = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; });
  if (hit) { e.waitUntil(fresh.then(() => {}, () => {})); return hit; }
  return fresh;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || !req.url.startsWith(BASE)) return;
  const url = new URL(req.url);
  const rel = url.href.slice(BASE.length).split(/[?#]/)[0];
  const m = rel.match(ISSUE_RE);
  if (m) {
    e.respondWith(networkFirst(e, req, abs("issue/" + m[1] + "/"), "me-pub-issue-" + m[1]));
    return;
  }
  if (rel.startsWith("static/") || rel === "manifest.webmanifest") {
    e.respondWith(staleWhileRevalidate(e, req));
    return;
  }
  if (req.mode === "navigate" && (rel === "" || rel === "index.html")) {
    e.respondWith(networkFirst(e, req, abs("./"), SHELL));
  }
});
