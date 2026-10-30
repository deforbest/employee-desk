// File: deno/supabase-proxy.js | Version: 1.3.0 | Date: 2026-10-29
// Same proxy for Deno Deploy (free) that forwards login/database/function requests to your Supabase project,
// for networks where supabase.co is blocked. It only talks to YOUR project and only these paths:
//   /auth/v1/*   /rest/v1/*   /functions/v1/*
// Settings (Deno Deploy app > Settings > Environment variables):
//   TARGET          = https://zpcfryooielfecabfywy.supabase.co
//   ALLOWED_ORIGIN  = https://deforbest.github.io     (several origins: separate with a comma)
//   STATUS_KEY      = (optional, type Secret) any long random text. Without it /__status only says ok and reveals nothing.
// Open /__status?key=YOUR_STATUS_KEY to see the detailed JSON health report.
// NOTE: this file is intentionally pure ASCII (no Persian characters) so the dashboard editor cannot corrupt it.

const STRIP = /[\u200e\u200f\u202a-\u202e\u200b\ufeff\s"'`]/g;
const clean = (v) => String(v == null ? '' : v).replace(STRIP, '').replace(/\/+$/, '');
const json = (obj, status) =>
  new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

function withTimeout(ms) {
  const ac = new AbortController();
  const t = setTimeout(function () { ac.abort(); }, ms);
  return { signal: ac.signal, done: function () { clearTimeout(t); } };
}

const worker = {
  async fetch(request, env) {
    try {
      const TARGET = clean(env.TARGET);
      const ORIGINS = String(env.ALLOWED_ORIGIN == null ? '' : env.ALLOWED_ORIGIN)
        .split(',').map(clean).filter(Boolean);
      let targetUrl = null;
      try { targetUrl = new URL(TARGET); } catch (_e) { targetUrl = null; }
      const targetOk = !!targetUrl && targetUrl.protocol === 'https:';

      const url = new URL(request.url);

      if (url.pathname === '/__status') {
        const out = { worker: 'ok' };
        const key = clean(env.STATUS_KEY);
        if (key && url.searchParams.get('key') === key) { // details only for the owner
          out.version = '1.3.0';
          out.targetSet = !!TARGET;
          out.targetValid = targetOk;
          out.targetHost = targetOk ? targetUrl.host : null;
          out.allowedOrigins = ORIGINS;
          if (targetOk) {
            const t = withTimeout(10000);
            try {
              const r = await fetch(TARGET + '/auth/v1/health', { signal: t.signal });
              out.upstreamStatus = r.status; // 200 or 401 both mean Supabase is reachable
            } catch (e) {
              out.upstreamError = String((e && e.message) || e);
            } finally { t.done(); }
          }
        }
        return json(out);
      }

      if (!targetOk || ORIGINS.length === 0) {
        return json({ error: 'not_configured' }, 500);
      }

      const origin = request.headers.get('Origin') || '';
      const originAllowed = !origin || ORIGINS.indexOf(origin) !== -1;
      const addCors = function (h) {
        h.set('Access-Control-Allow-Origin', origin && originAllowed ? origin : ORIGINS[0]);
        h.set('Vary', 'Origin');
        h.set('Access-Control-Expose-Headers', '*');
        return h;
      };

      if (request.method === 'OPTIONS') {
        if (!origin || !originAllowed) return new Response(null, { status: 403 });
        const h = addCors(new Headers());
        h.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        h.set('Access-Control-Allow-Headers', request.headers.get('Access-Control-Request-Headers') || 'authorization,apikey,content-type,x-client-info');
        h.set('Access-Control-Max-Age', '86400');
        return new Response(null, { status: 204, headers: h });
      }
      if (!originAllowed) return new Response('forbidden', { status: 403 });
      if (!/^\/(auth|rest|functions)\/v1\//.test(url.pathname)) return new Response('not found', { status: 404 });

      const headers = new Headers(request.headers);
      ['host', 'cf-connecting-ip', 'cf-ipcountry', 'cf-ray', 'cf-visitor', 'x-forwarded-proto', 'x-real-ip']
        .forEach(function (n) { headers.delete(n); });

      const t = withTimeout(25000);
      let upstream;
      try {
        upstream = await fetch(TARGET + url.pathname + url.search, {
          method: request.method,
          headers: headers,
          body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
          redirect: 'manual',
          signal: t.signal,
        });
      } finally { t.done(); }
      const res = new Response(upstream.body, upstream);
      addCors(res.headers);
      return res;
    } catch (e) {
      return json({ error: 'upstream_failed' }, 502);
    }
  },
};

Deno.serve((request) => worker.fetch(request, {
  TARGET: Deno.env.get('TARGET'),
  ALLOWED_ORIGIN: Deno.env.get('ALLOWED_ORIGIN'),
  STATUS_KEY: Deno.env.get('STATUS_KEY'),
}));
