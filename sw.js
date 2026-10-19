// File: sw.js | Version: 1.0.0 | Date: 2026-10-18
// سرویس‌ورکر: برنامه بعد از اولین بار بدون اینترنت هم باز می‌شود.
// فقط فایل‌های خود برنامه را نگه می‌دارد؛ قیمت‌های بازار هرگز ذخیره نمی‌شوند و همیشه مستقیم از اینترنت می‌آیند.
const CACHE = 'emp-desk-v4.8.1';
const ASSETS = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // بازار، فونت و ... مستقیم از اینترنت

  if (req.mode === 'navigate') {
    // صفحهٔ اصلی: اول اینترنت (برای نسخهٔ جدید)، اگر نبود نسخهٔ ذخیره‌شده
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
