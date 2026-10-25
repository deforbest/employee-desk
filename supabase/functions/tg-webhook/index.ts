// File: supabase/functions/tg-webhook/index.ts | Version: 1.0.0 | Date: 2026-10-25
// وب‌هوک ربات تلگرام. فقط درخواست‌هایی که secret_token درست دارند پذیرفته می‌شوند.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? '';
const SECRET = Deno.env.get('TELEGRAM_WEBHOOK_SECRET') ?? '';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const send = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
  fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id, text, ...extra }),
  }).catch(() => {});

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get('x-telegram-bot-api-secret-token') !== SECRET) return new Response('forbidden', { status: 403 });
  try {
    const u = await req.json();
    const m = u?.message;
    if (!m || m.chat?.type !== 'private' || !m.from) return new Response('ok');
    const from = m.from, chat = m.chat.id as number, now = new Date().toISOString();

    if (typeof m.text === 'string' && m.text.startsWith('/start')) {
      const id = (m.text.split(/\s+/)[1] ?? '').trim();
      if (!UUID.test(id)) { await send(chat, 'برای ورود، از داخل برنامه روی «ورود با تلگرام» یا «شماره تلفن» بزنید.'); return new Response('ok'); }
      const { data: r } = await db.from('tg_login_requests').select('id,purpose').eq('id', id).eq('status', 'pending').eq('consumed', false).gt('expires_at', now).maybeSingle();
      if (!r) { await send(chat, 'این درخواست منقضی شده است. به برنامه برگردید و دوباره شروع کنید.'); return new Response('ok'); }
      const base = { tg_id: from.id, tg_name: [from.first_name, from.last_name].filter(Boolean).join(' ').slice(0, 100), tg_username: from.username ?? null, chat_id: chat };
      if (r.purpose === 'login') {
        await db.from('tg_login_requests').update({ ...base, status: 'verified' }).eq('id', id).eq('status', 'pending');
        await send(chat, '✅ ورود تأیید شد. به برنامه برگردید.');
      } else {
        await db.from('tg_login_requests').update({ ...base, status: 'awaiting_phone' }).eq('id', id).eq('status', 'pending');
        await send(chat, 'برای تأیید شمارهٔ شما، دکمهٔ پایین را بزنید:', {
          reply_markup: { keyboard: [[{ text: '📱 اشتراک‌گذاری شماره من', request_contact: true }]], resize_keyboard: true, one_time_keyboard: true },
        });
      }
    } else if (m.contact) {
      // فقط شمارهٔ خود همین کاربر پذیرفته می‌شود (نه مخاطب فوروارد‌شده)
      if (m.contact.user_id !== from.id) { await send(chat, 'فقط شمارهٔ خودتان را با دکمهٔ پایین بفرستید.'); return new Response('ok'); }
      const { data: r } = await db.from('tg_login_requests').select('id').eq('tg_id', from.id).eq('status', 'awaiting_phone').eq('consumed', false)
        .gt('expires_at', now).order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (!r) { await send(chat, 'درخواستی پیدا نشد. از برنامه دوباره شروع کنید.'); return new Response('ok'); }
      const raw = String(m.contact.phone_number ?? '').replace(/[^\d]/g, '');
      await db.from('tg_login_requests').update({ phone: raw ? '+' + raw : null, status: 'verified' }).eq('id', r.id).eq('status', 'awaiting_phone');
      await send(chat, '✅ شمارهٔ شما تأیید شد. به برنامه برگردید.', { reply_markup: { remove_keyboard: true } });
    }
  } catch (_e) { /* همیشه 200 برمی‌گردانیم تا تلگرام درخواست را تکرار نکند */ }
  return new Response('ok');
});
