/* File: auth.js | Version: 1.4.0 | Date: 2026-10-30
   ورود و ثبت‌نام: ایمیل + کد تأیید (+ رمز اختیاری)، گوگل، گیت‌هاب، تلگرام، شماره تلفن (از راه ربات تلگرام).
   سرور: Supabase (طرح رایگان). در این فایل هیچ کلید محرمانه‌ای نیست؛ فقط آدرس پروژه و کلید عمومی (anon) از config.js خوانده می‌شود.
   اتصال هوشمند: اگر آدرس پروکسی (SUPABASE_PROXY_URL) تعریف شده باشد، برنامه خودش سریع‌ترین مسیر در دسترس را انتخاب می‌کند. */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const root = document.documentElement;
  if (!CFG.SUPABASE_URL && !CFG.SUPABASE_PROXY_URL) { root.classList.remove('auth-pending'); return; } // بدون پیکربندی: برنامه مثل قبل کار می‌کند

  const D = document;
  const $ = id => D.getElementById(id);
  const OTP_LEN = Number(CFG.OTP_LENGTH) || 8;
  const GUEST_OK = CFG.ALLOW_GUEST !== false;
  const STORE_KEY = 'emp-auth', FLOW_KEY = 'emp_auth_flow', OTP_TTL = 10 * 60 * 1000;
  const DIRECT = String(CFG.SUPABASE_URL || '').replace(/\/+$/, ''); // در حالت مخفی‌سازی آدرس، خالی است
    const DATA_KEYS = ['emp_desk_settings_v44', 'emp_onboarding_done_v44', 'emp_shifts_cfg_v43', 'emp_custom_shifts_v42',
    'emp_shift_overrides_v42', 'emp_desk_notes_v4', 'emp_finance_tx_v44', 'emp_finance_loans_v46'];
  const CONTENT_KEYS = ['emp_desk_notes_v4', 'emp_finance_tx_v44', 'emp_finance_loans_v46', 'emp_shifts_cfg_v43'];
  const S = { user: null, entered: false, cur: '', email: '', mode: 'otp', forgot: false, fromAccount: false, cool: 0, timer: null, tgRun: 0 };
  let sb = null;

  /* ---------- اتصال هوشمند (مسیر مستقیم یا یک یا چند پروکسی) ---------- */
  // برای آزمایش: به آدرس سایت ?ep=proxy یا ?ep=direct اضافه کنید؛ برای برگشت: ?ep=auto
  const PROXIES = String(CFG.SUPABASE_PROXY_URL || '').split(/[\s,]+/).map(u => u.replace(/\/+$/, '')).filter(Boolean);
  const CANDS = PROXIES.concat(DIRECT ? [DIRECT] : []);
  const BASE = CANDS[0];
  let chosen = BASE;
  const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} };
  function forced() {
    try {
      const e = new URLSearchParams(location.search).get('ep');
      if (e === 'auto') ssSet('emp_ep_force', null); else if (e) ssSet('emp_ep_force', e);
      const f = ssGet('emp_ep_force');
      if (f === 'direct') return DIRECT;
      if (f === 'proxy' && PROXIES[0]) return PROXIES[0];
    } catch (e) {}
    return '';
  }
  function ping(base, ms) {
    return new Promise((res, rej) => {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
      fetch(base + '/auth/v1/health', { signal: ac.signal, cache: 'no-store', headers: { apikey: CFG.SUPABASE_ANON_KEY } })
        .then(r => { clearTimeout(t); r.status < 500 ? res(base) : rej(); }).catch(() => { clearTimeout(t); rej(); });
    });
  }
  async function probe() {
    const f = forced(); if (f) return f;
    if (CANDS.length < 2) return BASE;
    try { const c = JSON.parse(ssGet('emp_ep') || 'null'); if (c && Date.now() - c.at < 10 * 60 * 1000 && CANDS.indexOf(c.u) !== -1) return c.u; } catch (e) {}
    // اولویت با ترتیب فهرست است: پروکسی‌ها اول، مسیر مستقیم آخر. همه هم‌زمان آزمایش می‌شوند.
    const pings = CANDS.map(c => { const pr = ping(c, 6000); pr.catch(() => {}); return pr; });
    let u = CANDS[0]; for (let i = 0; i < pings.length; i++) { try { u = await pings[i]; break; } catch (e) {} }
    ssSet('emp_ep', JSON.stringify({ u, at: Date.now() })); return u;
  }
  const startProbe = () => probe().then(u => {
    chosen = u; window.__authEndpoint = u;
    try { console.info('[auth] endpoint:', u === DIRECT ? 'direct' : 'proxy', forced() ? '(forced)' : '(auto)', PROXIES.length ? '' : '- no proxy configured'); } catch (e) {}
  });
  let probeP = startProbe();
  const swap = (url, to) => (typeof url === 'string' && url.indexOf(BASE) === 0) ? to + url.slice(BASE.length) : url;
  async function smartFetch(input, init) {
    await probeP;
    const url0 = typeof input === 'string' ? input : (input && input.url) || String(input);
    const go = base => fetch(swap(url0, base), init);
    try { return await go(chosen); }
    catch (e) {
      if (forced() || CANDS.length < 2 || (e && e.name === 'AbortError')) { if (!forced()) { ssSet('emp_ep', null); probeP = startProbe(); } throw e; }
      let last = e;
      for (const o of CANDS.filter(c => c !== chosen)) {
        try { const r = await go(o); chosen = o; window.__authEndpoint = o; ssSet('emp_ep', JSON.stringify({ u: o, at: Date.now() })); return r; }
        catch (e2) { last = e2; }
      }
      ssSet('emp_ep', null); probeP = startProbe(); throw last;
    }
  }

  /* ---------- ابزارها ---------- */
  const toEn = v => String(v || '').replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632));
  const toFa = v => String(v).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const normEmail = v => { const e = toEn(v).trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 254 ? e : ''; };
  const rand = () => { const a = new Uint8Array(32); crypto.getRandomValues(a); return btoa(String.fromCharCode.apply(null, a)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const sha256hex = async s => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))).map(b => b.toString(16).padStart(2, '0')).join('');
  function toast(m) {
    const c = $('toastContainer'); if (!c) return;
    const t = D.createElement('div'); t.className = 'toast'; t.textContent = m; c.appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  function errText(e) {
    const raw = String((e && (e.code || e.message || e.name)) || ''), m = raw.toLowerCase();
    if (!navigator.onLine) return 'اینترنت قطع است. اتصال را بررسی کنید.';
    if (/fetch|network|timeout|abort|retryable/.test(m)) return 'ارتباط با سرور ورود برقرار نشد. چند لحظه بعد دوباره تلاش کنید.';
    if (m.includes('invalid login') || m.includes('invalid_credentials')) return 'ایمیل یا رمز عبور درست نیست.';
    const sec = m.match(/(\d+)\s*seconds?/);
    if (sec) return 'لطفاً ' + toFa(sec[1]) + ' ثانیه صبر کنید و دوباره بزنید.';
    if (m.includes('rate') || m.includes('too many')) return 'درخواست‌ها زیاد بود؛ چند دقیقه بعد دوباره تلاش کنید.';
    if (m.includes('same') || m.includes('different')) return 'رمز جدید باید با رمز قبلی فرق داشته باشد.';
    if (m.includes('weak') || m.includes('password')) return 'رمز عبور به‌اندازهٔ کافی قوی نیست.';
    if (m.includes('provider') && m.includes('enabled')) return 'این روش ورود هنوز فعال نشده است.';
    if (m.includes('expired') || m.includes('invalid')) return 'کد درست نیست یا منقضی شده. دوباره بررسی کنید یا کد تازه بگیرید.';
    return 'مشکلی پیش آمد. دوباره تلاش کنید.';
  }
  const loadFlow = () => { try { const f = JSON.parse(localStorage.getItem(FLOW_KEY) || 'null'); return f && typeof f === 'object' ? f : null; } catch (e) { return null; } };
  const saveFlow = f => { try { localStorage.setItem(FLOW_KEY, JSON.stringify(f)); } catch (e) {} };
  const clearFlow = () => { try { localStorage.removeItem(FLOW_KEY); } catch (e) {} };

  /* ---------- ساخت رابط ---------- */
  const SOCIAL = [];
  if (CFG.ENABLE_GOOGLE) SOCIAL.push(['google', 'Google', 'G', '#ea4335']);
  if (CFG.ENABLE_GITHUB) SOCIAL.push(['github', 'GitHub', 'GH', '#24292f']);
  if (CFG.TELEGRAM_BOT) { SOCIAL.push(['telegram', 'تلگرام', 'TG', '#229ed9']); SOCIAL.push(['phone', 'شماره تلفن', '☎', '#16a34a']); }

  const MARKUP = `
<div class="au-wrap"><div class="au-card" role="dialog" aria-modal="true" aria-labelledby="auTitle" id="auCard">
  <button type="button" class="au-x" id="auX" data-act="dismiss" aria-label="بستن" title="بستن">✕</button>
  <div class="au-brand"><img src="icon-192.png" alt="" width="44" height="44"><div><div class="au-brand-t">میز کار هوشمند کارمند</div><div class="au-brand-s">ورود به حساب</div></div></div>
  <ol class="au-steps" id="auSteps" aria-label="مراحل ورود" hidden><li data-s="email">ایمیل</li><li data-s="code">کد</li><li data-s="setpw">رمز (اختیاری)</li></ol>
  <div class="au-status" id="auStatus" role="status" aria-live="polite" hidden><span class="au-dot" aria-hidden="true"></span><span id="auStatusT"></span></div>
  <div class="au-msg" id="auMsg" role="alert" hidden></div>

  <section data-screen="loading"><div class="au-wait"><div class="au-spin"></div><p class="au-p">در حال آماده‌سازی…</p></div></section>

  <section data-screen="fatal" hidden>
    <h1 class="au-h" tabindex="-1">بارگذاری کامل نشد</h1><p class="au-p">اینترنت را بررسی کنید و دوباره تلاش کنید.</p>
    <button type="button" class="btn btn-primary au-block" data-act="reload">تلاش دوباره</button>
  </section>

  <section data-screen="email" hidden>
    <h1 class="au-h" id="auTitle" tabindex="-1">ایمیل‌تان را بنویسید</h1>
    <p class="au-p" id="auEmailHint">یک کد ${toFa(OTP_LEN)} رقمی برایتان می‌فرستیم. ساخت رمز لازم نیست.</p>
    <form id="auEmailForm" novalidate>
      <label class="au-l" for="auEmail">ایمیل</label>
      <input class="input au-ltr" id="auEmail" type="email" inputmode="email" enterkeyhint="send" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="name@example.com" maxlength="254">
      <div id="auPwdBox" hidden>
        <label class="au-l" for="auPwd">رمز عبور</label>
        <div class="au-pw"><input class="input au-ltr" id="auPwd" type="password" enterkeyhint="go" autocomplete="current-password" maxlength="128">
          <button type="button" class="btn btn-secondary btn-sm" data-act="togglepw" data-target="auPwd" aria-label="نمایش رمز">نمایش</button></div>
      </div>
      <button type="submit" class="btn btn-primary au-block" id="auGo">ادامه</button>
    </form>
    <button type="button" class="btn btn-secondary au-block" id="auSendCode" data-act="sendcode" hidden>ارسال کد به ایمیلم</button>
    <div class="au-row"><button type="button" class="au-link" id="auMode" data-act="mode">رمز عبور دارم</button><button type="button" class="au-link" id="auForgot" data-act="forgot" hidden>فراموشی رمز</button></div>
    <div id="auSocialBox" hidden><div class="au-or"><span>یا ادامه با</span></div><div class="au-social" id="auSocial"></div></div>
    <div class="au-row" style="justify-content:center"><button type="button" class="au-link" data-act="guest" id="auGuest" hidden>ادامه بدون حساب کاربری</button></div>
  </section>

  <section data-screen="code" hidden>
    <h1 class="au-h" tabindex="-1">کد را وارد کنید</h1>
    <p class="au-p">کد ${toFa(OTP_LEN)} رقمی به <b class="au-ltr" id="auSentTo"></b> رسید یا در راه است. اگر نرسید، پوشهٔ اسپم را هم ببینید.</p>
    <form id="auCodeForm" novalidate>
      <label class="au-l" for="auCode">کد تأیید</label>
      <input class="input au-code" id="auCode" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="one-time-code" maxlength="8" placeholder="••••••••" dir="ltr">
      <button type="submit" class="btn btn-primary au-block">تأیید و ورود</button>
    </form>
    <div class="au-row"><button type="button" class="au-link" id="auResend" data-act="resend">ارسال دوباره کد</button><button type="button" class="au-link" data-act="changeemail">تغییر ایمیل / انصراف</button></div>
  </section>

  <section data-screen="setpw" hidden>
    <h1 class="au-h" id="auPwTitle" tabindex="-1">رمز عبور بگذارید؟</h1>
    <p class="au-p" id="auPwHint">اگر دوست دارید، یک رمز بگذارید تا دفعهٔ بعد بدون کد وارد شوید. اجباری نیست.</p>
    <form id="auPwForm" novalidate>
      <label class="au-l" for="auNewPwd">رمز جدید</label>
      <div class="au-pw"><input class="input au-ltr" id="auNewPwd" type="password" enterkeyhint="done" autocomplete="new-password" maxlength="128">
        <button type="button" class="btn btn-secondary btn-sm" data-act="togglepw" data-target="auNewPwd" aria-label="نمایش رمز">نمایش</button></div>
      <div class="au-meter" aria-hidden="true"><i id="auMeter"></i></div>
      <div class="au-sub" id="auPwTip">حداقل ۸ نویسه، شامل حرف و عدد</div>
      <button type="submit" class="btn btn-primary au-block">ذخیرهٔ رمز و ورود</button>
    </form>
    <button type="button" class="au-link" data-act="skippw" id="auSkipPw">حالا نه، ادامه می‌دهم</button>
  </section>

  <section data-screen="mfa" hidden>
    <h1 class="au-h" id="auMfaTitle" tabindex="-1">کد دو مرحله‌ای را بنویسید</h1>
    <p class="au-p" id="auMfaHint">عدد ۶ رقمی را از برنامهٔ احراز هویت بخوانید و اینجا بنویسید.</p>
    <form id="auMfaForm" novalidate>
      <label class="au-l" for="auMfaCode">کد ۶ رقمی برنامه</label>
      <input class="input au-code" id="auMfaCode" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="one-time-code" maxlength="6" placeholder="••••••" dir="ltr">
      <button type="submit" class="btn btn-primary au-block">تأیید</button>
    </form>
    <div class="au-row" style="justify-content:center"><button type="button" class="au-link" data-act="dismiss">انصراف</button></div>
  </section>

  <section data-screen="mfasetup" hidden>
    <h1 class="au-h" tabindex="-1">فعال‌سازی تأیید دو مرحله‌ای</h1>
    <p class="au-p">۱) یک برنامهٔ احراز هویت نصب کنید (مثل گوگل اتنتیکیتور یا مایکروسافت اتنتیکیتور). ۲) این تصویر را در آن اسکن کنید. ۳) عدد ۶ رقمی را پایین بنویسید.</p>
    <div class="au-qr"><img id="auMfaQr" alt="تصویر اسکن" width="176" height="176" hidden></div>
    <div class="au-sub">اگر اسکن نمی‌شود، این کلید را دستی وارد کنید:</div>
    <div class="au-secret au-ltr" id="auMfaSecret"></div>
    <form id="auMfaSetupForm" novalidate>
      <label class="au-l" for="auMfaSetupCode">کد ۶ رقمی برنامه</label>
      <input class="input au-code" id="auMfaSetupCode" type="text" inputmode="numeric" enterkeyhint="done" autocomplete="off" maxlength="6" placeholder="••••••" dir="ltr">
      <button type="submit" class="btn btn-primary au-block">فعال‌سازی</button>
    </form>
    <div class="au-row" style="justify-content:center"><button type="button" class="au-link" data-act="dismiss">انصراف</button></div>
  </section>

  <section data-screen="sessions" hidden>
    <h1 class="au-h" tabindex="-1">دستگاه‌های وارد شده</h1>
    <p class="au-p">این دستگاه‌ها به حساب شما وارد شده‌اند. هر دستگاهی را که نمی‌شناسید حذف کنید. دستگاه حذف‌شده دیگر تمدید نمی‌شود و حداکثر تا یک ساعت بعد کاملاً بیرون می‌افتد.</p>
    <div class="au-sesslist" id="auSessList"></div>
    <button type="button" class="btn btn-danger au-block" data-act="revokeothers">خروج از همهٔ دستگاه‌های دیگر</button>
    <div class="au-row" style="justify-content:center"><button type="button" class="au-link" data-act="dismiss">بستن</button></div>
  </section>

  <section data-screen="tg" hidden>
    <div class="au-wait"><div class="au-spin"></div>
      <h1 class="au-h" id="auTgTitle" tabindex="-1">ورود با تلگرام</h1>
      <p class="au-p" id="auTgHint">در حال آماده‌سازی…</p>
      <a class="btn btn-primary au-block" id="auTgOpen" href="#" target="_blank" rel="noopener noreferrer" hidden>باز کردن تلگرام</a>
    </div>
    <button type="button" class="au-link" data-act="tgcancel">انصراف</button>
  </section>
</div></div>`;

  const authRoot = D.createElement('div'); authRoot.id = 'authRoot'; authRoot.innerHTML = MARKUP; D.body.appendChild(authRoot);

  const STEPS = { email: 1, code: 2, setpw: 3 };
  function status(t, spin) { const s = $('auStatus'); s.hidden = !t; s.classList.toggle('spin', !!spin); $('auStatusT').textContent = t || ''; }
  function msg(t, ok) { const m = $('auMsg'); m.hidden = !t; m.textContent = t || ''; m.className = 'au-msg' + (ok ? ' ok' : ''); }
  const show = name => {
    authRoot.querySelectorAll('[data-screen]').forEach(s => { s.hidden = s.dataset.screen !== name; });
    S.cur = name; $('auX').hidden = !(S.entered || GUEST_OK);
    const stepsOn = STEPS[name] && !(name === 'setpw' && S.fromAccount);
    $('auSteps').hidden = !stepsOn;
    if (stepsOn) authRoot.querySelectorAll('#auSteps li').forEach(li => {
      const n = STEPS[li.dataset.s]; li.className = n < STEPS[name] ? 'done' : n === STEPS[name] ? 'now' : '';
      if (n === STEPS[name]) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    msg(''); status('');
    setTimeout(() => focusFirst(true), 60);
  };
  function focusFirst(h1) {
    const sec = authRoot.querySelector('[data-screen]:not([hidden])'); if (!sec) return;
    const f = sec.querySelector('input:not([hidden]):not(:disabled)');
    const t = f && f.offsetParent ? f : (h1 ? sec.querySelector('h1') : null);
    if (t) { try { t.focus(); } catch (e) {} }
  }
  function busy(on) { $('auCard').setAttribute('aria-busy', on ? 'true' : 'false'); authRoot.querySelectorAll('button, input, a.btn').forEach(b => { if (on) { b.dataset.wasDis = b.disabled ? '1' : ''; b.disabled = true; } else { b.disabled = b.dataset.wasDis === '1'; } }); }
  async function run(fn, label) {
    const btn = authRoot.querySelector('[data-screen]:not([hidden]) button[type="submit"]'), old = btn ? btn.textContent : null;
    busy(true); if (label) { status(label, true); if (btn) btn.textContent = 'لطفاً صبر کنید…'; }
    try { return await fn(); } catch (e) { msg(errText(e)); }
    finally { busy(false); if (btn && old !== null) btn.textContent = old; if ($('auStatus').classList.contains('spin')) status(''); tick(); focusFirst(); }
  }

  if (!window.supabase || !window.supabase.createClient) { show('fatal'); return; }
  sb = window.supabase.createClient(BASE, CFG.SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: STORE_KEY },
    global: { fetch: smartFetch }
  });

  if (SOCIAL.length) {
    $('auSocial').innerHTML = SOCIAL.map(s => `<button type="button" class="btn btn-secondary" data-act="social" data-p="${s[0]}"><span class="au-ico" style="background:${s[3]}">${s[2]}</span>${s[1]}</button>`).join('');
    $('auSocialBox').hidden = false;
  }
  if (GUEST_OK) $('auGuest').hidden = false;

  /* ---------- ورود با ایمیل ---------- */
  function setMode(m) {
    S.mode = m;
    const pw = m === 'pwd';
    $('auPwdBox').hidden = !pw; $('auForgot').hidden = !pw; $('auSendCode').hidden = !pw; $('auMode').hidden = pw;
    $('auGo').textContent = pw ? 'ورود' : 'ادامه';
    $('auTitle').textContent = pw ? 'رمز عبور را بنویسید' : 'ایمیل‌تان را بنویسید';
    $('auEmailHint').textContent = pw ? 'برای این ایمیل رمز عبور تعیین شده است.' : 'اگر قبلاً رمز گذاشته‌اید، رمز را می‌پرسیم؛ وگرنه یک کد ' + toFa(OTP_LEN) + ' رقمی می‌فرستیم.';
    $('auPwd').autocomplete = 'current-password';
  }
  // تشخیص هوشمند: رمز دارد یا نه؟ (جواب فقط password / code / limited؛ ایمیل ناموجود هم code است)
  async function getHint(email) {
    const { data, error } = await sb.rpc('signin_hint', { p_email: email });
    if (error) { if (/PGRST202|Could not find|does not exist/i.test(String(error.code) + String(error.message))) return 'code'; throw error; }
    return data === 'password' || data === 'limited' ? data : 'code';
  }
  async function sendCode(email) {
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) { msg(errText(error)); return false; }
    S.email = email; saveFlow({ step: 'code', email, at: Date.now(), forgot: S.forgot });
    $('auSentTo').textContent = email; $('auCode').value = ''; show('code'); startCooldown(60);
    status('کد ارسال شد. ایمیل خود را بررسی کنید.'); return true;
  }
  $('auEmail').addEventListener('input', e => { if (S.mode === 'pwd' && normEmail(e.target.value) !== S.hintEmail) setMode('otp'); const f = loadFlow(); if (!f || f.step !== 'code') saveFlow({ step: 'email', email: e.target.value.slice(0, 254), at: Date.now() }); });
  $('auEmailForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = normEmail($('auEmail').value);
    if (!email) return msg('ایمیل را درست بنویسید. مثال: name@example.com');
    if (S.mode === 'pwd') {
      const pwd = $('auPwd').value; if (!pwd) return msg('رمز عبور را بنویسید.');
      run(async () => {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pwd });
        if (error) return msg(errText(error));
        $('auPwd').value = ''; await gate(data.user, () => enter(data.user, true));
      }, 'در حال ورود…');
    } else {
      run(async () => {
        const hint = await getHint(email);
        if (hint === 'password' || hint === 'limited') {
          S.hintEmail = email; setMode('pwd'); $('auPwd').value = '';
          status(hint === 'limited' ? 'تعداد بررسی‌ها زیاد بود. رمز را بنویسید یا کد بخواهید.' : 'رمز عبور را بنویسید. اگر نمی‌خواهید، «ارسال کد به ایمیلم» را بزنید.');
          setTimeout(() => { try { $('auPwd').focus(); } catch (x) {} }, 80);
          return;
        }
        S.forgot = false; await sendCode(email); // رمز ندارد (یا حساب تازه است): کد خودکار ارسال می‌شود
      }, 'در حال بررسی…');
    }
  });
  function startCooldown(sec) {
    S.cool = Math.max(0, sec); clearInterval(S.timer);
    if (S.cool > 0) S.timer = setInterval(() => { S.cool--; tick(); if (S.cool <= 0) clearInterval(S.timer); }, 1000);
    tick();
  }
  function tick() { const b = $('auResend'); if (!b) return; b.disabled = S.cool > 0; b.textContent = S.cool > 0 ? 'ارسال دوباره (' + toFa(S.cool) + ')' : 'ارسال دوباره کد'; }
  function verifyCode() {
    const token = toEn($('auCode').value).replace(/\D/g, '');
    if (token.length < OTP_LEN) return msg('کد را کامل بنویسید (' + toFa(OTP_LEN) + ' رقم).');
    run(async () => {
      const { data, error } = await sb.auth.verifyOtp({ email: S.email, token, type: 'email' });
      if (error) { $('auCode').value = ''; return msg(errText(error)); }
      clearFlow();
      const u = data.user, md = (u && u.user_metadata) || {};
      await gate(u, () => {
        if (S.forgot || (!md.has_password && !md.pwd_asked)) { S.user = u; S.fromAccount = false; preparePw(S.forgot); show('setpw'); }
        else enter(u, true);
      });
    }, 'در حال بررسی کد…');
  }
  $('auCodeForm').addEventListener('submit', e => { e.preventDefault(); verifyCode(); });
  $('auCode').addEventListener('input', e => {
    const v = toEn(e.target.value).replace(/\D/g, ''); e.target.value = v;
    if ($('auMsg').hidden === false) msg(''); if (v) status('');
    if (v.length >= OTP_LEN) verifyCode();
  });

  /* ---------- تعیین رمز (اختیاری) ---------- */
  function preparePw(forgot) {
    $('auNewPwd').value = ''; meter('');
    $('auPwTitle').textContent = forgot ? 'رمز جدید بگذارید' : (S.fromAccount ? 'تعیین یا تغییر رمز' : 'رمز عبور بگذارید؟');
    $('auPwHint').textContent = forgot ? 'رمز جدید را بنویسید تا دفعهٔ بعد با ایمیل و رمز وارد شوید.' : 'اگر دوست دارید، یک رمز بگذارید تا دفعهٔ بعد بدون کد وارد شوید. اجباری نیست.';
    $('auSkipPw').textContent = S.fromAccount ? 'انصراف' : (forgot ? 'حالا نه' : 'حالا نه، ادامه می‌دهم');
  }
  function pwScore(p) {
    let s = 0; if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[A-Za-z]/.test(p) && /\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p) || (/[a-z]/.test(p) && /[A-Z]/.test(p))) s++;
    return s;
  }
  function meter(p) { const s = p ? pwScore(p) : 0; const i = $('auMeter'); i.style.width = (s * 25) + '%'; i.style.background = s <= 1 ? 'var(--danger)' : s === 2 ? 'var(--warning)' : 'var(--success)'; }
  $('auNewPwd').addEventListener('input', e => meter(e.target.value));
  $('auPwForm').addEventListener('submit', e => {
    e.preventDefault();
    const p = $('auNewPwd').value;
    if (p.length < 8 || !/[A-Za-z]/.test(p) || !/\d/.test(p)) return msg('رمز باید حداقل ۸ نویسه و شامل حرف و عدد باشد.');
    run(async () => {
      const { data, error } = await sb.auth.updateUser({ password: p, data: { has_password: true, pwd_asked: true } });
      if (error) return msg(errText(error));
      $('auNewPwd').value = '';
      if (S.fromAccount) { closeAuth(); toast('رمز عبور ذخیره شد'); } else { enter(data.user || S.user, true); toast('رمز عبور ذخیره شد'); }
    }, 'در حال ذخیره…');
  });

  /* ---------- تأیید دو مرحله‌ای (برنامهٔ احراز هویت) و نشست‌ها ---------- */
  async function gate(user, next, resume) {
    let need = false;
    try {
      const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
      if (error) throw error;
      need = !!data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2';
    } catch (e) {
      // ورود تازه: بدون اطمینان از وضعیت، اجازه نمی‌دهیم. بازکردن مجدد برنامه (احتمالاً آفلاین): با نشست ذخیره‌شده ادامه می‌دهیم.
      if (!resume) { try { await sb.auth.signOut({ scope: 'local' }); } catch (x) {} show('email'); return msg(errText(e)); }
    }
    if (!need) return next();
    S.pend = next; S.mfaGate = true; prepareMfa(false); authRoot.hidden = false; show('mfa');
  }
  function prepareMfa(off) {
    $('auMfaCode').value = '';
    $('auMfaTitle').textContent = off ? 'غیرفعال‌سازی تأیید دو مرحله‌ای' : 'کد دو مرحله‌ای را بنویسید';
    $('auMfaHint').textContent = off ? 'برای تأیید، عدد ۶ رقمی برنامهٔ احراز هویت را بنویسید.' : 'عدد ۶ رقمی را از برنامهٔ احراز هویت (مثل گوگل اتنتیکیتور) بخوانید و اینجا بنویسید.';
  }
  function mfaSubmit() {
    const code = toEn($('auMfaCode').value).replace(/\D/g, '');
    if (code.length !== 6) return msg('عدد ۶ رقمی را کامل بنویسید.');
    run(async () => {
      const { data: f, error: e1 } = await sb.auth.mfa.listFactors();
      const fac = f && f.totp && f.totp[0];
      if (e1 || !fac) return msg(e1 ? errText(e1) : 'روش دوم پیدا نشد. دوباره وارد شوید.');
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: fac.id, code });
      if (error) { $('auMfaCode').value = ''; return msg('کد درست نیست. کد تازهٔ برنامه را بنویسید.'); }
      const nx = S.pend; S.pend = null; S.mfaGate = false; if (nx) await nx();
    }, 'در حال بررسی…');
  }
  async function mfaOn() {
    S.fromAccount = true; authRoot.hidden = false; show('mfasetup');
    $('auMfaQr').hidden = true; $('auMfaSecret').textContent = ''; $('auMfaSetupCode').value = '';
    status('در حال ساخت کد…', true);
    try {
      const { data: lf } = await sb.auth.mfa.listFactors();
      for (const f of ((lf && lf.all) || [])) if (f.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'app-' + Date.now().toString(36) });
      if (error) throw error;
      S.mfaFactor = data.id; $('auMfaQr').src = data.totp.qr_code; $('auMfaQr').hidden = false; $('auMfaSecret').textContent = data.totp.secret;
      status('');
    } catch (e) { status(''); msg(errText(e)); }
  }
  function mfaSetupSubmit() {
    const code = toEn($('auMfaSetupCode').value).replace(/\D/g, '');
    if (code.length !== 6) return msg('عدد ۶ رقمی را کامل بنویسید.');
    run(async () => {
      const { error } = await sb.auth.mfa.challengeAndVerify({ factorId: S.mfaFactor, code });
      if (error) { $('auMfaSetupCode').value = ''; return msg('کد درست نیست. کد تازهٔ برنامه را بنویسید.'); }
      closeAuth(); toast('تأیید دو مرحله‌ای فعال شد'); refreshSec();
    }, 'در حال فعال‌سازی…');
  }
  function mfaOff() {
    S.fromAccount = true; S.mfaGate = false; prepareMfa(true); authRoot.hidden = false; show('mfa');
    S.pend = async () => {
      const { data: f } = await sb.auth.mfa.listFactors();
      for (const x of ((f && f.totp) || [])) { const { error } = await sb.auth.mfa.unenroll({ factorId: x.id }); if (error) return msg(errText(error)); }
      closeAuth(); toast('تأیید دو مرحله‌ای غیرفعال شد'); refreshSec();
    };
  }
  async function refreshSec() {
    const st = $('acctMfaState'), btn = $('acctMfaBtn'); if (!st || !btn || !S.user) return;
    try {
      const { data } = await sb.auth.mfa.listFactors(); const on = !!(data && data.totp && data.totp.length);
      st.textContent = on ? 'فعال' : 'غیرفعال'; btn.textContent = on ? 'غیرفعال‌سازی' : 'فعال‌سازی';
      btn.dataset.act = on ? 'mfaoff' : 'mfaon'; btn.className = on ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm';
    } catch (e) { st.textContent = 'نامشخص'; }
  }
  const devName = ua => {
    ua = String(ua || '');
    const b = /Edg\//.test(ua) ? 'اج' : /OPR\/|Opera/.test(ua) ? 'اپرا' : /Firefox\//.test(ua) ? 'فایرفاکس' : /Chrome\//.test(ua) ? 'کروم' : /Safari\//.test(ua) ? 'سافاری' : 'مرورگر';
    const o = /Android/.test(ua) ? 'اندروید' : /iPhone|iPad|iOS/.test(ua) ? 'آیفون یا آیپد' : /Windows/.test(ua) ? 'ویندوز' : /Mac OS/.test(ua) ? 'مک' : /Linux/.test(ua) ? 'لینوکس' : 'دستگاه ناشناس';
    return b + ' روی ' + o;
  };
  const ago = iso => {
    const t = new Date(iso).getTime(); if (!t) return 'نامشخص';
    const m = Math.max(0, Math.round((Date.now() - t) / 60000)); if (m < 2) return 'همین حالا';
    if (m < 60) return toFa(m) + ' دقیقه پیش'; const h = Math.round(m / 60); if (h < 24) return toFa(h) + ' ساعت پیش'; return toFa(Math.round(h / 24)) + ' روز پیش';
  };
  async function curSid() {
    try { const { data } = await sb.auth.getSession(); const t = data.session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'); return JSON.parse(atob(t)).session_id || ''; } catch (e) { return ''; }
  }
  async function sessionsOpen() {
    S.fromAccount = true; authRoot.hidden = false; show('sessions'); status('در حال دریافت فهرست…', true);
    const sid = await curSid();
    const { data, error } = await sb.rpc('my_sessions'); status('');
    const box = $('auSessList'); box.textContent = '';
    if (error || !Array.isArray(data)) return msg(errText(error));
    if (!data.length) { box.textContent = 'نشستی پیدا نشد.'; return; }
    data.forEach(x => {
      const row = D.createElement('div'); row.className = 'au-sess';
      const info = D.createElement('div');
      const n = D.createElement('div'); n.className = 'au-sess-n'; n.textContent = devName(x.user_agent);
      const sub = D.createElement('div'); sub.className = 'au-sub'; sub.textContent = 'آخرین فعالیت: ' + ago(x.last_active);
      info.appendChild(n); info.appendChild(sub); row.appendChild(info);
      if (x.id === sid) { const bd = D.createElement('span'); bd.className = 'au-badge'; bd.textContent = 'این دستگاه'; row.appendChild(bd); }
      else { const bt = D.createElement('button'); bt.type = 'button'; bt.className = 'btn btn-secondary btn-sm'; bt.dataset.act = 'revoke'; bt.dataset.sid = x.id; bt.textContent = 'حذف'; row.appendChild(bt); }
      box.appendChild(row);
    });
  }
  $('auMfaForm').addEventListener('submit', e => { e.preventDefault(); mfaSubmit(); });
  $('auMfaCode').addEventListener('input', e => { const v = toEn(e.target.value).replace(/\D/g, ''); e.target.value = v; if (v.length === 6) mfaSubmit(); });
  $('auMfaSetupForm').addEventListener('submit', e => { e.preventDefault(); mfaSetupSubmit(); });
  $('auMfaSetupCode').addEventListener('input', e => { const v = toEn(e.target.value).replace(/\D/g, ''); e.target.value = v; if (v.length === 6) mfaSetupSubmit(); });

  /* ---------- گوگل / گیت‌هاب ---------- */
  function oauth(provider) {
    run(async () => {
      await probeP;
      const { data, error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname, skipBrowserRedirect: true } });
      if (error || !data || !data.url) return msg(errText(error));
      location.assign(swap(data.url, chosen));
    }, 'در حال انتقال…');
  }

  /* ---------- تلگرام و شماره تلفن (ربات تلگرام؛ رایگان) ---------- */
  async function invoke(body) {
    try { const { data, error } = await sb.functions.invoke('tg-auth', { body }); return error ? null : data; } catch (e) { return null; }
  }
  async function startTg(purpose) {
    const run_ = ++S.tgRun;
    show('tg'); $('auTgOpen').hidden = true;
    $('auTgTitle').textContent = purpose === 'phone' ? 'ورود با شماره تلفن' : 'ورود با تلگرام';
    $('auTgHint').textContent = 'در حال آماده‌سازی…';
    const verifier = rand(), challenge = await sha256hex(verifier);
    const r = await invoke({ action: 'start', purpose, challenge });
    if (run_ !== S.tgRun) return;
    if (!r || r.status !== 'ok') { show('email'); return msg(!navigator.onLine ? 'اینترنت قطع است.' : 'اتصال به ربات تلگرام برقرار نشد؛ کمی بعد دوباره تلاش کنید.'); }
    $('auTgHint').textContent = purpose === 'phone'
      ? 'تلگرام را باز کنید، روی «Start» بزنید و بعد دکمهٔ «اشتراک‌گذاری شماره من» را بزنید. سپس به همین صفحه برگردید.'
      : 'تلگرام را باز کنید و روی «Start» بزنید. سپس به همین صفحه برگردید.';
    const a = $('auTgOpen'); a.href = r.link; a.hidden = false;
    const until = Date.now() + 10 * 60 * 1000;
    while (run_ === S.tgRun && Date.now() < until) {
      await sleep(2200);
      if (run_ !== S.tgRun) return;
      const p = await invoke({ action: 'poll', id: r.id, verifier });
      if (!p) continue;
      if (p.status === 'ok') {
        const { data, error } = await sb.auth.verifyOtp({ token_hash: p.token_hash, type: 'magiclink' });
        if (run_ !== S.tgRun) return;
        S.tgRun++;
        if (error || !data.user) { show('email'); return msg(errText(error)); }
        return gate(data.user, () => enter(data.user, true));
      }
      if (p.status === 'expired' || p.status === 'error') { S.tgRun++; show('email'); return msg('درخواست منقضی شد؛ دوباره تلاش کنید.'); }
    }
    if (run_ === S.tgRun) { S.tgRun++; show('email'); msg('زمان تأیید تمام شد؛ دوباره تلاش کنید.'); }
  }

  /* ---------- ورود به برنامه ---------- */
  function openAuth() {
    authRoot.hidden = false; setMode('otp');
    const f = loadFlow(), fresh = f && f.email && f.at && Date.now() - f.at < OTP_TTL;
    if (fresh && f.step === 'code' && normEmail(f.email)) { // ادامهٔ مرحلهٔ قبلی، نه شروع از اول
      S.email = f.email; S.forgot = !!f.forgot; $('auSentTo').textContent = f.email; $('auCode').value = '';
      show('code'); startCooldown(60 - Math.floor((Date.now() - f.at) / 1000));
      status('کدی که قبلاً فرستادیم را وارد کنید. اگر کد را ندارید، «ارسال دوباره» را بزنید.');
    } else {
      show('email'); if (f && f.email && f.step !== 'code') $('auEmail').value = f.email;
    }
  }
  function closeAuth() { authRoot.hidden = true; S.fromAccount = false; }
  function dismiss() {
    if (S.cur === 'mfa' && S.mfaGate) { // انصراف از مرحلهٔ دوم = خروج از نشست نیمه‌کاره
      S.pend = null; S.mfaGate = false; S.tgRun++; S.user = null;
      try { sb.auth.signOut({ scope: 'local' }).catch(() => {}); } catch (e) {}
      if (S.entered) return closeAuth(); if (GUEST_OK) return enter(null, false); return openAuth();
    }
    if (!(S.entered || GUEST_OK)) return;
    S.tgRun++;
    if (S.user && S.cur === 'setpw' && !S.fromAccount) { try { sb.auth.updateUser({ data: { pwd_asked: true } }).catch(() => {}); } catch (e) {} return enter(S.user, true); }
    if (S.entered) return closeAuth();
    enter(null, false);
  }
  function renderAccount() {
    const u = S.user, md = (u && u.user_metadata) || {}, tg = md.provider === 'telegram';
    const name = u ? (md.full_name || md.name || (u.email && !tg ? u.email.split('@')[0] : 'کاربر')) : 'مهمان';
    const set = (id, t) => { const e = $(id); if (e) e.textContent = t; };
    set('acctName', name); set('acctSub', u ? (tg ? 'ورود با تلگرام' : (u.email || '')) : 'بدون حساب کاربری');
    set('acctAv', u ? (String(name).trim().charAt(0).toUpperCase() || '?') : '👤');
    [['acctLogin', !!u], ['acctGuestNote', !!u], ['acctUserBox', !u], ['acctPwRow', tg]].forEach(a => { const e = $(a[0]); if (e) e.hidden = a[1]; });
  }
  function enter(user, fresh) {
    S.user = user || null; S.entered = true; clearFlow(); closeAuth(); window.__authReady = true; root.classList.remove('auth-pending'); renderAccount(); refreshSec();
    if (user && fresh) maybeRestore();
    try { if (user) localStorage.removeItem('emp_guest'); else localStorage.setItem('emp_guest', '1'); } catch (e) {}
  }
  function cachedSession() {
    try { const r = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); return r && r.user && r.refresh_token ? r : null; } catch (e) { return null; }
  }
  async function boot() {
    const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
    const oerr = q.get('error_description') || h.get('error_description');
    let session = null, netErr = false;
    try { const r = await sb.auth.getSession(); session = r.data && r.data.session; if (r.error && /fetch|network|retryable|abort/i.test(r.error.name + r.error.message)) netErr = true; } catch (e) { netErr = true; }
    // اینترنت قطع یا سرور ورود در دسترس نیست: با نشست ذخیره‌شده، برنامه را باز می‌کنیم تا کاربر بیرون نماند
    if (!session && (!navigator.onLine || netErr)) session = cachedSession();
    if (q.has('code') || q.has('error') || h.has('error')) { try { history.replaceState(null, '', location.pathname); } catch (e) {} }
    if (session && session.user) return gate(session.user, () => enter(session.user, q.has('code')), true);
    if (GUEST_OK && localStorage.getItem('emp_guest') === '1') return enter(null, false);
    openAuth(); if (oerr) msg('ورود ناموفق بود؛ دوباره تلاش کنید.');
  }
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT' && S.user) { S.user = null; location.reload(); } });

  /* ---------- پشتیبان ابری ---------- */
  function collect() { const d = {}; DATA_KEYS.forEach(k => { const v = localStorage.getItem(k); if (v !== null) { try { d[k] = JSON.parse(v); } catch (e) {} } }); return d; }
  function applyData(d) {
    if (!d || typeof d !== 'object') return false;
    let n = 0; DATA_KEYS.forEach(k => { if (k in d) { localStorage.setItem(k, JSON.stringify(d[k])); n++; } }); return n > 0;
  }
  async function backup(quiet) {
    if (!S.user) return false;
    try {
      const { error } = await sb.from('user_backups').upsert({ user_id: S.user.id, data: collect(), updated_at: new Date().toISOString() });
      if (error) throw error; if (!quiet) toast('داده‌ها در ابر ذخیره شد'); return true;
    } catch (e) { if (!quiet) toast('ذخیره در ابر انجام نشد'); return false; }
  }
  async function restore(confirmFirst) {
    try {
      const { data, error } = await sb.from('user_backups').select('data').eq('user_id', S.user.id).maybeSingle();
      if (error) throw error;
      if (!data || !data.data) return toast('پشتیبانی در ابر پیدا نشد');
      if (confirmFirst && !confirm('داده‌های این دستگاه با پشتیبان ابری جایگزین شود؟')) return;
      if (applyData(data.data)) { toast('بازیابی شد؛ برنامه دوباره بارگذاری می‌شود'); setTimeout(() => location.reload(), 900); }
    } catch (e) { toast('بازیابی انجام نشد'); }
  }
  async function maybeRestore() {
    if (CONTENT_KEYS.some(k => localStorage.getItem(k) !== null)) return;
    try {
      const { data } = await sb.from('user_backups').select('data').eq('user_id', S.user.id).maybeSingle();
      if (data && data.data && applyData(data.data)) { toast('داده‌های شما از ابر بازیابی شد'); setTimeout(() => location.reload(), 900); }
    } catch (e) {}
  }
  function wipeLocal() {
    Object.keys(localStorage).filter(k => k.indexOf('emp_') === 0).forEach(k => localStorage.removeItem(k));
    try { if (window.caches) caches.delete('emp-digest-v49'); } catch (e) {}
  }
  async function logout() {
    if (!confirm('با خروج، داده‌های برنامه از روی این دستگاه پاک می‌شود (برای حفظ حریم خصوصی). پیش از آن یک پشتیبان ابری گرفته می‌شود. ادامه می‌دهید؟')) return;
    const ok = navigator.onLine ? await backup(true) : false;
    if (!ok && !confirm('پشتیبان ابری گرفته نشد. بدون پشتیبان خارج شوید و داده‌های این دستگاه پاک شود؟')) return;
    S.user = null; wipeLocal();
    try { await sb.auth.signOut({ scope: 'local' }); } catch (e) {}
    try { localStorage.removeItem(STORE_KEY); } catch (e) {}
    location.reload();
  }

  D.addEventListener('keydown', e => { if (e.key === 'Escape' && !authRoot.hidden) dismiss(); });

  /* ---------- رویدادها ---------- */
  function onAct(e) {
    const t = e.target.closest('[data-act]'); if (!t) return;
    const a = t.dataset.act;
    if (a === 'reload') location.reload();
    else if (a === 'mode') { S.hintEmail = normEmail($('auEmail').value); setMode('pwd'); setTimeout(() => { try { $('auPwd').focus(); } catch (x) {} }, 60); }
    else if (a === 'sendcode') { const em = normEmail($('auEmail').value); if (!em) return msg('ابتدا ایمیل را بنویسید.'); S.forgot = false; run(() => sendCode(em), 'در حال ارسال کد… لطفاً صبر کنید'); }
    else if (a === 'forgot') { const em = normEmail($('auEmail').value); if (!em) return msg('ابتدا ایمیل را بنویسید.'); S.forgot = true; run(() => sendCode(em), 'در حال ارسال کد… لطفاً صبر کنید'); }
    else if (a === 'togglepw') { const i = $(t.dataset.target); const s = i.type === 'password'; i.type = s ? 'text' : 'password'; t.textContent = s ? 'پنهان' : 'نمایش'; }
    else if (a === 'resend') { if (S.cool <= 0) run(() => sendCode(S.email), 'در حال ارسال دوبارهٔ کد…'); }
    else if (a === 'changeemail') { S.forgot = false; clearFlow(); show('email'); $('auEmail').value = S.email || ''; }
    else if (a === 'skippw') {
      if (S.fromAccount) return closeAuth();
      run(async () => { try { await sb.auth.updateUser({ data: { pwd_asked: true } }); } catch (x) {} enter(S.user, true); });
    }
    else if (a === 'social') { const p = t.dataset.p; if (p === 'telegram' || p === 'phone') startTg(p); else oauth(p); }
    else if (a === 'tgcancel') { S.tgRun++; show('email'); }
    else if (a === 'guest') enter(null, false);
    else if (a === 'dismiss') dismiss();
    else if (a === 'login') openAuth();
    else if (a === 'backup') backup(false);
    else if (a === 'restore') restore(true);
    else if (a === 'chpw') { S.fromAccount = true; authRoot.hidden = false; preparePw(false); show('setpw'); }
    else if (a === 'logout') logout();
    else if (a === 'mfaon') mfaOn();
    else if (a === 'mfaoff') mfaOff();
    else if (a === 'sessions') sessionsOpen();
    else if (a === 'revoke') { const sid = t.dataset.sid; run(async () => { const { data, error } = await sb.rpc('revoke_session', { sid }); if (error || !data) return msg('حذف انجام نشد.'); toast('دستگاه حذف شد'); await sessionsOpen(); }); }
    else if (a === 'revokeothers') { if (confirm('از همهٔ دستگاه‌های دیگر خارج می‌شوید. ادامه می‌دهید؟')) run(async () => { const { error } = await sb.auth.signOut({ scope: 'others' }); if (error) return msg(errText(error)); toast('از دستگاه‌های دیگر خارج شدید'); await sessionsOpen(); }); }
  }
  authRoot.addEventListener('click', e => { onAct(e); if (!e.target.closest('.au-card') && D.contains(e.target)) dismiss(); });
  const panel = $('acctPanel'); if (panel) panel.addEventListener('click', onAct);

  setMode('otp'); boot();
})();
