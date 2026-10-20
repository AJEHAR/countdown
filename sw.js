/* AZ=R Countdown service worker: lets the site open without internet and be installed as an app.
   Code (HTML/JS/CSS/JSON) is network-first so updates arrive straight away; media is cache-first.
   Firebase live data is never cached. Bump VERSION when releasing. */
const VERSION = 'azr-13';
const CORE = ['./', './index.html', './kawal/', './kawal/index.html', './app.css?v=13', './app.js?v=13', './i18n.js?v=13',
  './firebase-config.js?v=13', './site-config.js?v=13', './favicon.svg', './apple-touch-icon.png', './sounds/sounds.json'];
const CDN = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => Promise.all(CORE.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.endsWith('/sw.js')) return;
    const code = req.mode === 'navigate' || /\.(html|js|css|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
    e.respondWith(code ? networkFirst(req) : cacheFirst(req));
  } else if (CDN.includes(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req));
  }
});
async function networkFirst(req) {
  const c = await caches.open(VERSION);
  try { const r = await fetch(req); if (r && r.ok) c.put(req, r.clone()); return r; }
  catch (err) { return (await c.match(req)) || (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? c.match('./index.html') : Response.error()); }
}
async function cacheFirst(req) {
  const c = await caches.open(VERSION), hit = await c.match(req);
  if (hit) return hit;
  try { const r = await fetch(req); if (r && r.ok) c.put(req, r.clone()); return r; } catch (err) { return Response.error(); }
}
async function staleWhileRevalidate(req) {
  const c = await caches.open(VERSION), hit = await c.match(req);
  const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) c.put(req, r.clone()); return r; }).catch(() => hit);
  return hit || net;
}
