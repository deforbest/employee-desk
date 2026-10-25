# راهنمای نصب ورود و ثبت‌نام (نسخهٔ ۵.۰)

همهٔ بخش‌ها رایگان است: **Supabase** (دیتابیس و احراز هویت)، **GitHub Pages + Actions** (میزبانی و کلیدها)، **Gmail یا Brevo** (ایمیل)، **ربات تلگرام** (تأیید تلگرام و شماره).

## ساختار فایل‌ها (همه را در ریشهٔ مخزن گیت‌هاب آپلود کنید)
```
index.html  sw.js  auth.js  auth.css  manifest.webmanifest  icon-*.png  config.example.js  .gitignore
scripts/make-config.js
supabase/schema.sql  supabase/config.toml
supabase/functions/tg-auth/index.ts   supabase/functions/tg-webhook/index.ts
.github/workflows/deploy.yml
```
نکته: پوشهٔ `.github` نقطه‌دار است. اگر در آپلود وب دیده نشد: Add file ← Create new file ← مسیر `.github/workflows/deploy.yml` را بنویسید و محتوا را بچسبانید.

## گام ۱ — ساخت پروژهٔ Supabase
1. وارد https://supabase.com/dashboard شوید (با حساب گیت‌هاب) ← New project ← پلن Free.
2. **SQL Editor** ← محتوای `supabase/schema.sql` را بچسبانید ← Run.
3. **Project Settings ← API**: آدرس پروژه (`https://xxxx.supabase.co`) و کلید `anon` را یادداشت کنید. `xxxx` همان Project ref است.
4. **Authentication ← Providers ← Email**: فعال باشد؛ `Confirm email` روشن؛ `Minimum password length` = ۸؛ `Email OTP Length` = ۶؛ `Email OTP Expiration` = ۶۰۰ (ده دقیقه).
5. **Authentication ← URL Configuration**:
   - Site URL: `https://USERNAME.github.io/REPO/`
   - Redirect URLs: `https://USERNAME.github.io/REPO/**`

## گام ۲ — ارسال رایگان ایمیل (ضروری)
سرویس پیش‌فرض Supabase فقط برای آزمایش است (حدود ۲ ایمیل در ساعت) و باید SMTP خودتان را بگذارید: **Authentication ← Emails ← SMTP Settings ← Enable custom SMTP**.

**گزینهٔ ساده (Gmail، ۵۰۰ ایمیل در روز):**
1. تأیید دومرحله‌ای حساب گوگل را روشن کنید ← https://myaccount.google.com/apppasswords ← یک App password بسازید.
2. Host: `smtp.gmail.com` — Port: `465` — Username: آدرس جیمیل — Password: همان App password — Sender email: همان جیمیل.

**گزینهٔ دوم (Brevo، ۳۰۰ ایمیل در روز):** https://www.brevo.com ← SMTP & API ← مقادیر SMTP را وارد کنید (Host: `smtp-relay.brevo.com`، Port: `587`).
برای فروش واقعی بهتر است یک دامنهٔ اختصاصی و ایمیل از همان دامنه داشته باشید تا ایمیل‌ها در اسپم نیفتد.

### قالب ایمیل (حتماً هر دو را تغییر دهید تا «کد» برود، نه لینک)
**Authentication ← Emails ← Templates** ← قالب‌های **Magic Link** و **Confirm signup** را با این متن جایگزین کنید.
Subject: `کد ورود شما: {{ .Token }}`
```html
<div dir="rtl" style="font-family:Tahoma,Arial,sans-serif;max-width:420px;margin:auto;padding:20px">
  <h2>میز کار هوشمند کارمند</h2>
  <p>کد تأیید شما:</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;direction:ltr">{{ .Token }}</p>
  <p>این کد ۱۰ دقیقه اعتبار دارد. اگر شما درخواست نکرده‌اید، این ایمیل را نادیده بگیرید.</p>
</div>
```

## گام ۳ — ورود با گوگل (اختیاری)
1. https://console.cloud.google.com/apis/credentials ← Create credentials ← OAuth client ID ← Web application (اگر خواست، ابتدا OAuth consent screen را بسازید).
2. Authorized redirect URI: `https://xxxx.supabase.co/auth/v1/callback`
3. Client ID و Secret را در Supabase ← Authentication ← Providers ← Google وارد و فعال کنید.
راهنمای رسمی: https://supabase.com/docs/guides/auth/social-login/auth-google

## گام ۴ — ورود با گیت‌هاب (اختیاری)
1. https://github.com/settings/developers ← New OAuth App. Homepage URL: آدرس سایتتان. Authorization callback URL: `https://xxxx.supabase.co/auth/v1/callback`
2. Client ID و یک Client secret بسازید و در Supabase ← Providers ← GitHub وارد و فعال کنید.
راهنمای رسمی: https://supabase.com/docs/guides/auth/social-login/auth-github

## گام ۵ — ربات تلگرام (برای «ورود با تلگرام» و «شماره تلفن»)
1. در تلگرام به https://t.me/BotFather بروید ← `/newbot` ← نام و نام کاربری (آخرش `bot`) ← **توکن** را بگیرید.
2. توکن را جایی نگذارید جز Secrets گیت‌هاب (گام ۷).
3. در Supabase ← Account ← Access Tokens (https://supabase.com/dashboard/account/tokens) یک توکن بسازید؛ برای دیپلوی توابع لازم است.

> **دربارهٔ پیامک:** پیامک رایگان و پایدار وجود ندارد. به‌جای آن، شمارهٔ تلفن از راه «اشتراک‌گذاری مخاطب» در ربات تلگرام تأیید می‌شود. تلگرام خودش مالکیت شماره را تضمین می‌کند و برنامه فقط شمارهٔ خود فرستنده را می‌پذیرد. حساب «شماره تلفن» و «تلگرام» یکی است (هر دو بر پایهٔ شناسهٔ تلگرام).

## گام ۶ — فعال‌سازی GitHub Pages
مخزن ← Settings ← Pages ← Source = **GitHub Actions**.

## گام ۷ — Secrets و Variables
مخزن ← Settings ← Secrets and variables ← Actions.

**تب Secrets (محرمانه):**
| نام | مقدار |
|---|---|
| `SUPABASE_ANON_KEY` | کلید anon از گام ۱ (برای مرورگر طراحی شده؛ امنیت واقعی با RLS است) |
| `SUPABASE_ACCESS_TOKEN` | توکن گام ۵ (فقط اگر تلگرام می‌خواهید) |
| `TELEGRAM_BOT_TOKEN` | توکن BotFather (فقط اگر تلگرام می‌خواهید) |

**تب Variables:**
| نام | مقدار |
|---|---|
| `SUPABASE_URL` | `https://xxxx.supabase.co` |
| `SUPABASE_PROJECT_REF` | همان `xxxx` |
| `TELEGRAM_BOT_USERNAME` | نام ربات بدون `@` |
| `ALLOWED_ORIGIN` | `https://USERNAME.github.io` (بدون اسلش آخر و بدون نام مخزن) |
| `ENABLE_GOOGLE` | `true` بعد از انجام گام ۳ |
| `ENABLE_GITHUB` | `true` بعد از انجام گام ۴ |
| `ALLOW_GUEST` | اختیاری؛ `true` یعنی دکمهٔ «ادامه بدون حساب» هم باشد |
| `OTP_LENGTH` | اختیاری؛ اگر در گام ۱ چیزی غیر از ۶ گذاشتید |

## گام ۸ — انتشار
فایل‌ها را آپلود و commit کنید ← تب **Actions** ← اجرای «Deploy» باید سبز شود ← آدرس سایت را باز کنید.
اگر Secrets/Variables را بعداً عوض کردید: Actions ← Deploy ← Run workflow. اگر برنامه را قبلاً نصب کرده‌اید، یک‌بار ببندید و باز کنید تا نسخهٔ جدید بیاید.

## چک‌لیست آزمون
- [ ] ایمیل بدهم ← کد در ایمیل می‌آید ← وارد می‌کنم ← می‌پرسد رمز بگذارم؟
- [ ] خروج ← «رمز عبور دارم» ← ورود با ایمیل و رمز
- [ ] «رمزم را فراموش کرده‌ام» ← کد ← رمز جدید
- [ ] گوگل/گیت‌هاب/تلگرام/شماره (هر کدام که فعال کرده‌اید)
- [ ] برنامه را آفلاین باز کنم: با نشست ذخیره‌شده باید بالا بیاید
- [ ] در دستگاه دوم وارد شوم: اگر پشتیبان ابری باشد خودکار بازیابی می‌شود

## امنیت — آنچه رعایت شده
- رمزها روی سرور Supabase با bcrypt هش می‌شوند؛ در هیچ جای کد یا مرورگر ذخیره نمی‌شوند. اتصال‌ها همه HTTPS هستند و ورود با PKCE است.
- کد ایمیلی ده‌دقیقه‌ای و یک‌بارمصرف است؛ Supabase محدودیت تعداد درخواست دارد.
- جدول‌ها RLS دارند: هر کاربر فقط ردیف خودش را می‌بیند. شمارهٔ تأییدشده را کاربر نمی‌تواند خودش تغییر دهد.
- ورود تلگرام: توکن‌های یک‌بارمصرف، ۱۰ دقیقه‌ای، با verifier محلی؛ وب‌هوک با secret_token؛ فقط شمارهٔ خود فرستنده پذیرفته می‌شود.
- هیچ کلید محرمانه‌ای در مخزن نیست. فقط URL و کلید anon (عمومی) در `config.js` می‌رود. پوشه‌های `supabase/` و `.github/` در سایت منتشر نمی‌شوند.
- کتابخانهٔ Supabase هنگام انتشار با نسخهٔ ثابت از npm گرفته و از همین دامنهٔ خودتان سرو می‌شود (نه CDN).
- هنگام خروج، داده‌های دستگاه پاک می‌شود (بعد از گرفتن پشتیبان ابری) تا کاربر بعدی آن‌ها را نبیند.

## محدودیت‌ها و نکته‌های صادقانه
- پروژهٔ رایگان Supabase بعد از ۷ روز بدون فعالیت متوقف می‌شود (با یک کلیک از داشبورد روشن می‌شود).
- ایمیل جایگزینِ کاربران تلگرام شکل `tg-123@gmail.com` دارد (خط تیره در جیمیل ممکن نیست پس با ایمیل واقعی تداخل ندارد) و هرگز به آن ایمیل ارسال نمی‌شود. اگر دامنهٔ اختصاصی دارید، `PLACEHOLDER_EMAIL_DOMAIN` را روی آن بگذارید.
- پشتیبان ابری با TLS و رمزگذاری دیسک Supabase و RLS محافظت می‌شود، ولی رمزگذاری سرتاسری (E2E) نیست.
- ورود گوگل/گیت‌هاب با ریدایرکت است؛ در iOS ممکن است برنامهٔ نصب‌شده پس از ورود در مرورگر باز شود.
- تلگرام، گوگل و گیت‌هاب در برخی شبکه‌ها فیلتر هستند؛ ورود با ایمیل مسیر اصلی و مستقل از آن‌هاست.
- حذف حساب و کپچا (مثل Cloudflare Turnstile) هنوز اضافه نشده‌اند و می‌توانند مرحلهٔ بعد باشند.
- این کد در محیط من با یک پروژهٔ Supabase واقعی اجرا نشده (اینترنت نداشتم)؛ فقط بررسی نحو شده است. گام‌های آزمون بالا را حتماً انجام دهید.
