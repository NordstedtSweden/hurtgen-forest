/* Västfronten – service worker: spelen fungerar utan täckning när de laddats en gång */
const V = "vf-v2";
const PRE = [
  "/", "/common.js", "/manifest.webmanifest", "/icon-192.png", "/apple-touch-icon.png", "/favicon-32.png",
  "/hurtgen/", "/eben-emael/", "/verdun/",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(PRE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

function timeout(p, ms) {
  return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error("timeout")), ms); p.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
}

self.addEventListener("fetch", e => {
  const r = e.request;
  if (r.method !== "GET") return;
  const u = new URL(r.url);
  const net = () => fetch(r).then(res => {
    if (res && (res.ok || res.type === "opaque")) { const c = res.clone(); caches.open(V).then(ca => ca.put(r, c)); }
    return res;
  });
  const sameOrigin = u.origin === self.location.origin;
  const fresh = sameOrigin && (r.mode === "navigate" || u.pathname.startsWith("/api/") || /\.(html|js|webmanifest)$/.test(u.pathname) || u.pathname.endsWith("/"));
  if (fresh) {
    // Nätet först (så att uppdateringar kommer fram), annars sparad kopia
    e.respondWith(timeout(net(), 4000).catch(() => caches.match(r).then(m => m || net())));
  } else {
    // Bilder och typsnitt: sparad kopia först
    e.respondWith(caches.match(r).then(m => m || net()));
  }
});
