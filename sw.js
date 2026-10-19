// File: sw.js | Version: 1.1.0 | Date: 2026-10-19
// سرویس‌ورکر: ۱) کار آفلاین  ۲) نمایش اعلان‌ها  ۳) بررسی دوره‌ای یادآورها (در صورت پشتیبانی مرورگر)
// قیمت‌های بازار هرگز ذخیره نمی‌شوند و همیشه مستقیم از اینترنت می‌آیند.
const CACHE = 'emp-desk-v4.9.0';
const DIGEST_CACHE = 'emp-digest-v49';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== DIGEST_CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // بازار، فونت و ... مستقیم از اینترنت

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }
  event.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});

// لمس اعلان: برنامه را باز می‌کند و به بخش مربوط می‌رود
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const view = (event.notification.data && event.notification.data.view) || '';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          client.postMessage({ type: 'open-view', view });
          return client.focus();
        }
      }
      return self.clients.openWindow('./' + (view ? '#' + view : ''));
    })
  );
});

// بیدار شدن دوره‌ای (فقط اندروید/Chrome برای برنامهٔ نصب‌شده؛ زمانش را مرورگر تعیین می‌کند)
self.addEventListener('periodicsync', event => {
  if (event.tag === 'emp-digest') event.waitUntil(runDigest());
});

async function runDigest() {
  const c = await caches.open(DIGEST_CACHE);
  const r = await c.match('digest.json');
  if (!r) return;
  const d = await r.json();
  if (!d.enabled) return;
  let shown = {};
  const sr = await c.match('shown.json');
  if (sr) shown = await sr.json();
  const now = Date.now();
  let dirty = false;
  Object.keys(shown).forEach(k => { if (now - shown[k] > 3 * 86400000) { delete shown[k]; dirty = true; } });
  for (const it of d.items) {
    if (shown[it.key]) continue;
    if (now >= it.at && now - it.at < 12 * 3600000) {
      await self.registration.showNotification(it.title, {
        body: it.body, icon: 'icon-192.png', badge: 'icon-192.png', lang: 'fa', dir: 'rtl',
        tag: it.key, data: { view: it.view }, vibrate: [120, 60, 120]
      });
      shown[it.key] = now;
      dirty = true;
    }
  }
  if (dirty) await c.put('shown.json', new Response(JSON.stringify(shown), { headers: { 'content-type': 'application/json' } }));
}
