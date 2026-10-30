// File: scripts/make-config.js | Version: 1.2.0 | ساخت config.js هنگام انتشار؛ مقادیر از Variables/Secrets گیت‌هاب می‌آیند.
// فقط مقادیر «عمومی» وارد سایت می‌شوند. کلیدهای محرمانه هرگز اینجا نمی‌آیند.
// حالت مخفی‌سازی آدرس (HIDE_ORIGIN=true): آدرس اصلی Supabase اصلاً در سایت قرار نمی‌گیرد و فقط آدرس پل‌ها می‌ماند.
const fs = require('fs');
const e = process.env;
const bool = v => String(v || '').trim().toLowerCase() === 'true';
const fail = m => { console.error(m); process.exit(1); };

let url = (e.SUPABASE_URL || '').trim().replace(/\/+$/, '');
if (url && !/^https:\/\/[a-z0-9]{10,30}\.supabase\.co$/.test(url)) fail('SUPABASE_URL درست نیست؛ باید مثل https://abcdefgh.supabase.co باشد.');

// چند پل با ویرگول یا فاصله جدا می‌شوند. ترتیب = اولویت.
const proxies = (e.SUPABASE_PROXY_URL || '').split(/[\s,]+/).map(x => x.trim().replace(/\/+$/, '')).filter(Boolean);
proxies.forEach(p => { if (!/^https:\/\/[a-z0-9.-]+$/i.test(p)) fail('SUPABASE_PROXY_URL درست نیست: ' + p + ' (باید مثل https://name.account.workers.dev باشد، بدون / آخر و بدون مسیر).'); });

const hide = bool(e.HIDE_ORIGIN);
if (hide && !proxies.length) fail('HIDE_ORIGIN=true نیاز به حداقل یک آدرس در SUPABASE_PROXY_URL دارد.');
if (hide) url = ''; // آدرس اصلی در سایت نمی‌آید

const cfg = {
  SUPABASE_URL: url,
  SUPABASE_PROXY_URL: proxies.join(','),
  SUPABASE_ANON_KEY: (e.SUPABASE_ANON_KEY || '').trim(),
  TELEGRAM_BOT: (e.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, ''),
  // ورود با گوگل/گیت‌هاب در لحظهٔ انتقال، آدرس اصلی Supabase را در مرورگر نشان می‌دهد؛ در حالت مخفی‌سازی خاموش می‌شود
  ENABLE_GOOGLE: !hide && bool(e.ENABLE_GOOGLE),
  ENABLE_GITHUB: !hide && bool(e.ENABLE_GITHUB),
  ALLOW_GUEST: String(e.ALLOW_GUEST || '').trim().toLowerCase() !== 'false', // پیش‌فرض: ورود مهمان فعال
  OTP_LENGTH: Number(e.OTP_LENGTH) || 8,
};
const active = !!(cfg.SUPABASE_URL || cfg.SUPABASE_PROXY_URL);
if (active && !cfg.SUPABASE_ANON_KEY) fail('SUPABASE_ANON_KEY خالی است.');
fs.writeFileSync('config.js', 'window.APP_CONFIG=' + JSON.stringify(cfg) + ';\n');
console.log(active ? 'config.js ساخته شد (ورود فعال' + (hide ? '، آدرس اصلی مخفی' : '') + ').' : 'هشدار: هیچ آدرسی تعریف نشده؛ صفحهٔ ورود غیرفعال می‌ماند.');
