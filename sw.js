/* Vision service worker. Bump VER on every release. */
const VER = 'vision-v3', FONTS = 'vision-fonts-v1';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'extras.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const okRes = r => r && (r.ok || r.type === 'opaque');
async function fonts(req) {   /* Google Fonts: CSS refreshes in the background, font files are cached for good */
  const c = await caches.open(FONTS), hit = await c.match(req);
  const net = fetch(req).then(r => { if (okRes(r)) c.put(req, r.clone()); return r; });
  if (hit) { if (new URL(req.url).hostname === 'fonts.googleapis.com') net.catch(() => {}); return hit; }
  return net;
}
async function app(req) {   /* app files: network first (so updates show up), cache when offline or slow */
  const c = await caches.open(VER);
  try {
    const r = await Promise.race([fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })), new Promise((_, rej) => setTimeout(() => rej(new Error('slow')), 4000))]);
    if (r && r.ok) c.put(req, r.clone());
    return r;
  } catch (e) {
    const hit = (await c.match(req, { ignoreSearch: true })) || (req.mode === 'navigate' ? await c.match('index.html') : null);
    return hit || Response.error();
  }
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.hostname === 'fonts.googleapis.com' || u.hostname === 'fonts.gstatic.com') e.respondWith(fonts(req));
  else if (u.origin === location.origin) e.respondWith(app(req));
});
