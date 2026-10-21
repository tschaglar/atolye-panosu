// iPhone ve tarayıcı sürümü için arka plan bildirimleri ve basit önbellek.
const CACHE = 'atolye-__VERSION__';
const SHELL = ['./', 'index.html', 'app.js', 'styles.css', 'manifest.webmanifest', 'icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  if (/\.apk$|version\.json/.test(req.url)) return;
  e.respondWith((async () => {
    try {
      const res = await fetch(req);
      if (res.ok) { const c = await caches.open(CACHE); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'Atölye Panosu', body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Atölye Panosu', {
    body: d.body || '',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    data: d.data || {},
    icon: 'icon-192.png',
    badge: 'badge-96.png',
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const data = e.notification.data || {};
  const url = new URL('./', self.registration.scope);
  if (data.route) url.hash = data.route + (data.id ? '-' + data.id : '');
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope)) {
        c.postMessage({ type: 'route', data });
        return c.focus();
      }
    }
    return self.clients.openWindow(url.href);
  })());
});
