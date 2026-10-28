// File: cloudflare/supabase-proxy.js | Version: 1.0.0 | Date: 2026-10-28
// پروکسی رایگان کلادفلر برای رساندن درخواست‌های ورود به Supabase از شبکه‌هایی که supabase.co در آن‌ها فیلتر است.
// فقط به پروژهٔ خودتان وصل می‌شود و فقط سه مسیر را عبور می‌دهد (ورود، دیتابیس، توابع). پروکسی باز نیست.
// تنظیمات (در کلادفلر: Settings ← Variables and secrets):
//   TARGET          = https://zpcfryooielfecabfywy.supabase.co
//   ALLOWED_ORIGIN  = https://deforbest.github.io
export default {
  async fetch(request, env) {
    const TARGET = String(env.TARGET || '').replace(/\/+$/, '');
    const ALLOWED = String(env.ALLOWED_ORIGIN || '');
    if (!TARGET || !ALLOWED) return new Response('not configured', { status: 500 });

    const origin = request.headers.get('Origin') || '';
    const addCors = (h) => {
      h.set('Access-Control-Allow-Origin', ALLOWED);
      h.set('Vary', 'Origin');
      h.set('Access-Control-Expose-Headers', '*');
      return h;
    };

    if (request.method === 'OPTIONS') {
      if (origin !== ALLOWED) return new Response(null, { status: 403 });
      const h = addCors(new Headers());
      h.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      h.set('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers') || 'authorization,apikey,content-type,x-client-info');
      h.set('Access-Control-Max-Age', '86400');
      return new Response(null, { status: 204, headers: h });
    }
    if (origin && origin !== ALLOWED) return new Response('forbidden', { status: 403 });

    const url = new URL(request.url);
    if (!/^\/(auth|rest|functions)\/v1\//.test(url.pathname)) return new Response('not found', { status: 404 });

    const headers = new Headers(request.headers);
    headers.delete('host');
    const upstream = await fetch(TARGET + url.pathname + url.search, {
      method: request.method,
      headers,
      body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
      redirect: 'manual',
    });
    const res = new Response(upstream.body, upstream);
    addCors(res.headers);
    return res;
  },
};
