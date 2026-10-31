// File: supabase/functions/tg-auth/index.ts | Version: 1.1.0 | Date: 2026-11-01
// start: create a login request + bot link. poll: check confirmation and return a one-time sign-in token.
// The verifier never leaves the user's browser; a leaked bot link alone cannot steal a session.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const BOT = Deno.env.get('TELEGRAM_BOT_USERNAME') ?? '';
// ALLOWED_ORIGIN may hold several origins separated by commas (website + Android app origin https://localhost)
const ALLOWED = (Deno.env.get('ALLOWED_ORIGIN') ?? '*').split(',').map((s) => s.trim()).filter(Boolean);
const MAIL_DOMAIN = Deno.env.get('PLACEHOLDER_EMAIL_DOMAIN') ?? 'gmail.com';
const anyOrigin = ALLOWED.includes('*');

const sha256hex = async (s: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
    .map((b) => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const originOk = anyOrigin || ALLOWED.includes(origin);
  const cors = {
    'Access-Control-Allow-Origin': anyOrigin ? '*' : (originOk ? origin : ALLOWED[0] ?? ''),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ status: 'error', code: 'method' }, 405);
  if (!anyOrigin && !originOk) return json({ status: 'error', code: 'origin' }, 403);
  if (!BOT) return json({ status: 'error', code: 'not_configured' });

  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return json({ status: 'error', code: 'bad_request' }, 400); }

  try {
    if (b.action === 'start') {
      const purpose = b.purpose === 'phone' ? 'phone' : 'login';
      const challenge = String(b.challenge ?? '');
      if (!/^[0-9a-f]{64}$/.test(challenge)) return json({ status: 'error', code: 'bad_challenge' });
      const { count } = await db.from('tg_login_requests').select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 60_000).toISOString());
      if ((count ?? 0) > 60) return json({ status: 'error', code: 'busy' });
      await db.from('tg_login_requests').delete().lt('expires_at', new Date(Date.now() - 86_400_000).toISOString());
      const { data, error } = await db.from('tg_login_requests').insert({ purpose, challenge }).select('id').single();
      if (error || !data) return json({ status: 'error', code: 'db' });
      return json({ status: 'ok', id: data.id, link: `https://t.me/${BOT}?start=${data.id}` });
    }

    if (b.action === 'poll') {
      const id = String(b.id ?? ''), verifier = String(b.verifier ?? '');
      if (!/^[0-9a-f-]{36}$/.test(id) || verifier.length < 20 || verifier.length > 200) return json({ status: 'error', code: 'bad_request' });
      const { data: r } = await db.from('tg_login_requests').select('*').eq('id', id).maybeSingle();
      if (!r) return json({ status: 'expired' });
      if ((await sha256hex(verifier)) !== r.challenge) return json({ status: 'error', code: 'forbidden' });
      if (r.consumed || new Date(r.expires_at) < new Date()) return json({ status: 'expired' });
      if (r.status !== 'verified') return json({ status: 'pending', step: r.status });

      const { data: c } = await db.from('tg_login_requests').update({ consumed: true }).eq('id', id).eq('consumed', false).select('id');
      if (!c || c.length === 0) return json({ status: 'expired' });

      const email = `tg-${r.tg_id}@${MAIL_DOMAIN}`;
      await db.auth.admin.createUser({
        email, email_confirm: true,
        user_metadata: { provider: 'telegram', telegram_id: r.tg_id, full_name: r.tg_name, telegram_username: r.tg_username },
      });
      const link = await db.auth.admin.generateLink({ type: 'magiclink', email });
      const hashed = link.data?.properties?.hashed_token;
      if (link.error || !hashed || !link.data?.user) return json({ status: 'error', code: 'link' });
      await db.from('profiles').upsert({ id: link.data.user.id, telegram_id: r.tg_id, ...(r.phone ? { phone: r.phone } : {}) }, { onConflict: 'id' });
      return json({ status: 'ok', token_hash: hashed });
    }
  } catch (_e) {
    return json({ status: 'error', code: 'server' });
  }
  return json({ status: 'error', code: 'bad_action' }, 400);
});
