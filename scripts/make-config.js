// File: scripts/make-config.js | ساخت config.js هنگام انتشار؛ مقادیر از Variables/Secrets گیت‌هاب می‌آیند.
// فقط مقادیر «عمومی» (آدرس پروژه و کلید anon) وارد سایت می‌شوند. کلیدهای محرمانه هرگز اینجا نمی‌آیند.
const fs = require('fs');
const e = process.env;
const url = (e.SUPABASE_URL || '').trim().replace(/\/+$/, '');
if (url && !/^https:\/\/[a-z0-9]{10,30}\.supabase\.co$/.test(url)) {
  console.error('SUPABASE_URL درست نیست؛ باید مثل https://abcdefgh.supabase.co باشد.'); process.exit(1);
}
const bool = v => String(v || '').trim().toLowerCase() === 'true';
const cfg = {
  SUPABASE_URL: url,
  SUPABASE_ANON_KEY: (e.SUPABASE_ANON_KEY || '').trim(),
  TELEGRAM_BOT: (e.TELEGRAM_BOT_USERNAME || '').trim().replace(/^@/, ''),
  ENABLE_GOOGLE: bool(e.ENABLE_GOOGLE),
  ENABLE_GITHUB: bool(e.ENABLE_GITHUB),
  ALLOW_GUEST: bool(e.ALLOW_GUEST),
  OTP_LENGTH: Number(e.OTP_LENGTH) || 6,
};
if (url && !cfg.SUPABASE_ANON_KEY) { console.error('SUPABASE_ANON_KEY خالی است.'); process.exit(1); }
fs.writeFileSync('config.js', 'window.APP_CONFIG=' + JSON.stringify(cfg) + ';\n');
console.log(url ? 'config.js ساخته شد (ورود فعال).' : 'هشدار: SUPABASE_URL خالی است؛ صفحهٔ ورود غیرفعال می‌ماند.');
