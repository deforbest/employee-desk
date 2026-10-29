/* File: auth.js | Version: 1.2.0 | Date: 2026-10-28
   ورود و ثبت‌نام: ایمیل + کد تأیید (+ رمز اختیاری)، گوگل، گیت‌هاب، تلگرام، شماره تلفن (از راه ربات تلگرام).
   سرور: Supabase (طرح رایگان). در این فایل هیچ کلید محرمانه‌ای نیست؛ فقط آدرس پروژه و کلید عمومی (anon) از config.js خوانده می‌شود.
   اتصال هوشمند: اگر آدرس پروکسی (SUPABASE_PROXY_URL) تعریف شده باشد، برنامه خودش سریع‌ترین مسیر در دسترس را انتخاب می‌کند. */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const root = document.documentElement;
  if (!CFG.SUPABASE_URL) { root.classList.remove('auth-pending'); return; } // بدون پیکربندی: برنامه مثل قبل کار می‌کند

  const D = document;
  const $ = id => D.getElementById(id);
  const OTP_LEN = Number(CFG.OTP_LENGTH) || 8;
  const GUEST_OK = CFG.ALLOW_GUEST !== false;
  const STORE_KEY = 'emp-auth', FLOW_KEY = 'emp_auth_flow', OTP_TTL = 10 * 60 * 1000;
  const DIRECT = String(CFG.SUPABASE_URL).replace(/\/+$/, '');
  const PROXY = String(CFG.SUPABASE_PROXY_URL || '').replace(/\/+$/, '');
  const DATA_KEYS = ['emp_desk_settings_v44', 'emp_onboarding_done_v44', 'emp_shifts_cfg_v43', 'emp_custom_shifts_v42',
    'emp_shift_overrides_v42', 'emp_desk_notes_v4', 'emp_finance_tx_v44', 'emp_finance_loans_v46'];
  const CONTENT_KEYS = ['emp_desk_notes_v4', 'emp_finance_tx_v44', 'emp_finance_loans_v46', 'emp_shifts_cfg_v43'];
  const S = { user: null, entered: false, cur: '', email: '', mode: 'otp', forgot: false, fromAccount: false, cool: 0, timer: null, tgRun: 0 };
  let sb = null;

  /* ---------- اتصال هوشمند (مسیر مستقیم یا پروکسی) ---------- */
  let chosen = DIRECT;
  const ssGet = k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const ssSet = (k, v) => { try { v === null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) {} };
  function ping(base, ms) {
    return new Promise((res, rej) => {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), ms);
      fetch(base + '/auth/v1/health', { signal: ac.signal, cache: 'no-store', headers: { apikey: CFG.SUPABASE_ANON_KEY } })
        .then(r => { clearTimeout(t); r.status < 500 ? res(base) : rej(); }).catch(() => { clearTimeout(t); rej(); });
    });
  }
  async function probe() {
    if (!PROXY) return DIRECT;
    try { const c = JSON.parse(ssGet('emp_ep') || 'null'); if (c && Date.now() - c.at < 10 * 60 * 1000 && (c.u === PROXY || c.u === DIRECT)) return c.u; } catch (e) {}
    let u = DIRECT; try { u = await Promise.any([ping(PROXY, 6000), ping(DIRECT, 6000)]); } catch (e) { u = PROXY; }
    ssSet('emp_ep', JSON.stringify({ u, at: Date.now() })); return u;
  }
  let probeP = probe().then(u => { chosen = u; window.__authEndpoint = u; try { console.info('[auth] endpoint:', u === DIRECT ? 'direct' : 'proxy'); } catch (e) {} });
  const swap = (url, to) => (typeof url === 'string' && url.indexOf(DIRECT) === 0) ? to + url.slice(DIRECT.length) : url;
  async function smartFetch(input, init) {
    await probeP;
    const url0 = typeof input === 'string' ? input : (input && input.url) || String(input);
    const go = base => fetch(swap(url0, base), init);
    try { return await go(chosen); }
    catch (e) {
      const other = PROXY ? (chosen === PROXY ? DIRECT : PROXY) : '';
      if (!other || (e && e.name === 'AbortError')) { ssSet('emp_ep', null); if (PROXY) probeP = probe().then(u => { chosen = u; }); throw e; }
      try { const r = await go(other); chosen = other; ssSet('emp_ep', JSON.stringify({ u: other, at: Date.now() })); return r; }
      catch (e2) { ssSet('emp_ep', null); probeP = probe().then(u => { chosen = u; }); throw e2; }
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
      <button type="submit" class="btn btn-primary au-block" id="auGo">دریافت کد</button>
    </form>
    <div class="au-row"><button type="button" class="au-link" id="auMode" data-act="mode">رمز عبور دارم</button><button type="button" class="au-link" id="auForgot" data-act="forgot" hidden>رمزم را فراموش کرده‌ام</button></div>
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
  sb = window.supabase.createClient(DIRECT, CFG.SUPABASE_ANON_KEY, {
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
    $('auPwdBox').hidden = m !== 'pwd'; $('auForgot').hidden = m !== 'pwd';
    $('auGo').textContent = m === 'pwd' ? 'ورود' : 'دریافت کد';
    $('auMode').textContent = m === 'pwd' ? 'ورود بدون رمز (با کد ایمیل)' : 'رمز عبور دارم';
    $('auEmailHint').textContent = m === 'pwd' ? 'ایمیل و رمز عبورتان را بنویسید.' : 'یک کد ' + toFa(OTP_LEN) + ' رقمی برایتان می‌فرستیم. ساخت رمز لازم نیست.';
  }
  async function sendCode(email) {
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) { msg(errText(error)); return false; }
    S.email = email; saveFlow({ step: 'code', email, at: Date.now(), forgot: S.forgot });
    $('auSentTo').textContent = email; $('auCode').value = ''; show('code'); startCooldown(60);
    status('کد ارسال شد. ایمیل خود را بررسی کنید.'); return true;
  }
  $('auEmail').addEventListener('input', e => { const f = loadFlow(); if (!f || f.step !== 'code') saveFlow({ step: 'email', email: e.target.value.slice(0, 254), at: Date.now() }); });
  $('auEmailForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = normEmail($('auEmail').value);
    if (!email) return msg('ایمیل را درست بنویسید. مثال: name@example.com');
    if (S.mode === 'pwd') {
      const pwd = $('auPwd').value; if (!pwd) return msg('رمز عبور را بنویسید.');
      run(async () => {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pwd });
        if (error) return msg(errText(error));
        $('auPwd').value = ''; enter(data.user, true);
      }, 'در حال ورود…');
    } else { S.forgot = false; run(() => sendCode(email), 'در حال ارسال کد… لطفاً صبر کنید'); }
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
      if (S.forgot || (!md.has_password && !md.pwd_asked)) { S.user = u; S.fromAccount = false; preparePw(S.forgot); show('setpw'); }
      else enter(u, true);
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
        return enter(data.user, true);
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
    S.user = user || null; S.entered = true; clearFlow(); closeAuth(); window.__authReady = true; root.classList.remove('auth-pending'); renderAccount();
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
    if (session && session.user) return enter(session.user, q.has('code'));
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
    else if (a === 'mode') setMode(S.mode === 'pwd' ? 'otp' : 'pwd');
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
  }
  authRoot.addEventListener('click', e => { onAct(e); if (!e.target.closest('.au-card') && D.contains(e.target)) dismiss(); });
  const panel = $('acctPanel'); if (panel) panel.addEventListener('click', onAct);

  setMode('otp'); boot();
})();
