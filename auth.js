/* File: auth.js | Version: 1.0.0 | Date: 2026-10-25
   ورود و ثبت‌نام: ایمیل + کد تأیید (+ رمز اختیاری)، گوگل، گیت‌هاب، تلگرام، شماره تلفن (از راه ربات تلگرام).
   سرور: Supabase (طرح رایگان). در این فایل هیچ کلید محرمانه‌ای نیست؛
   فقط آدرس پروژه و کلید عمومی (anon) از config.js خوانده می‌شود که هنگام انتشار از Secrets/Variables گیت‌هاب ساخته می‌شود. */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const root = document.documentElement;
  if (!CFG.SUPABASE_URL) { root.classList.remove('auth-pending'); return; } // بدون پیکربندی: برنامه مثل قبل کار می‌کند

  const D = document;
  const $ = id => D.getElementById(id);
  const OTP_LEN = Number(CFG.OTP_LENGTH) || 8;
  const GUEST_OK = CFG.ALLOW_GUEST !== false; // ورود مهمان به‌طور پیش‌فرض فعال است
  const STORE_KEY = 'emp-auth';
  const DATA_KEYS = ['emp_desk_settings_v44', 'emp_onboarding_done_v44', 'emp_shifts_cfg_v43', 'emp_custom_shifts_v42',
    'emp_shift_overrides_v42', 'emp_desk_notes_v4', 'emp_finance_tx_v44', 'emp_finance_loans_v46'];
  const CONTENT_KEYS = ['emp_desk_notes_v4', 'emp_finance_tx_v44', 'emp_finance_loans_v46', 'emp_shifts_cfg_v43'];
  const S = { user: null, entered: false, cur: '',  email: '', mode: 'otp', forgot: false, fromAccount: false, cool: 0, timer: null, tgRun: 0, closable: false };
  let sb = null;

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
    const m = String((e && (e.code || e.message)) || '').toLowerCase();
    if (!navigator.onLine || m.includes('fetch') || m.includes('network')) return 'اتصال اینترنت برقرار نیست.';
    if (m.includes('invalid login') || m.includes('invalid_credentials')) return 'ایمیل یا رمز عبور درست نیست.';
    if (m.includes('rate') || m.includes('seconds') || m.includes('too many')) return 'درخواست‌ها زیاد بود؛ چند دقیقه بعد دوباره تلاش کنید.';
    if (m.includes('same') || m.includes('different')) return 'رمز جدید باید با رمز قبلی فرق داشته باشد.';
    if (m.includes('weak') || m.includes('password')) return 'رمز عبور به‌اندازهٔ کافی قوی نیست.';
    if (m.includes('provider') && m.includes('enabled')) return 'این روش ورود هنوز فعال نشده است.';
    if (m.includes('expired') || m.includes('invalid')) return 'کد اشتباه است یا منقضی شده؛ دوباره تلاش کنید.';
    return 'خطایی رخ داد؛ دوباره تلاش کنید.';
  }

  /* ---------- ساخت رابط ---------- */
  const SOCIAL = [];
  if (CFG.ENABLE_GOOGLE) SOCIAL.push(['google', 'Google', 'G', '#ea4335']);
  if (CFG.ENABLE_GITHUB) SOCIAL.push(['github', 'GitHub', 'GH', '#24292f']);
  if (CFG.TELEGRAM_BOT) { SOCIAL.push(['telegram', 'تلگرام', 'TG', '#229ed9']); SOCIAL.push(['phone', 'شماره تلفن', '☎', '#16a34a']); }

  const MARKUP = `
<div class="au-wrap"><div class="au-card" role="dialog" aria-modal="true" aria-labelledby="auTitle">
  <button type="button" class="au-x" id="auX" data-act="dismiss" aria-label="بستن" title="بستن">✕</button>
  <div class="au-brand"><img src="icon-192.png" alt="" width="48" height="48"><div><div class="au-brand-t">میز کار هوشمند کارمند</div><div class="au-brand-s">ورود یا ساخت حساب</div></div></div>
  <div class="au-msg" id="auMsg" role="alert" hidden></div>

  <section data-screen="loading"><div class="au-wait"><div class="au-spin"></div><p class="au-p">در حال بررسی…</p></div></section>

  <section data-screen="fatal" hidden>
    <h1 class="au-h">بارگذاری کامل نشد</h1><p class="au-p">اتصال اینترنت را بررسی کنید و دوباره تلاش کنید.</p>
    <button type="button" class="btn btn-primary au-block" data-act="reload">تلاش دوباره</button>
  </section>

  <section data-screen="email" hidden>
    <h1 class="au-h" id="auTitle">ورود یا ثبت‌نام</h1>
    <p class="au-p" id="auEmailHint">ایمیل‌تان را وارد کنید؛ یک کد تأیید برایتان می‌فرستیم. نیازی به ساختن رمز نیست.</p>
    <form id="auEmailForm" novalidate>
      <label class="au-l" for="auEmail">ایمیل</label>
      <input class="input au-ltr" id="auEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="none" spellcheck="false" placeholder="name@example.com" maxlength="254">
      <div id="auPwdBox" hidden>
        <label class="au-l" for="auPwd">رمز عبور</label>
        <div class="au-pw"><input class="input au-ltr" id="auPwd" type="password" autocomplete="current-password" maxlength="128">
          <button type="button" class="btn btn-secondary btn-sm" data-act="togglepw" data-target="auPwd">نمایش</button></div>
      </div>
      <button type="submit" class="btn btn-primary au-block" id="auGo">دریافت کد تأیید</button>
    </form>
    <div class="au-row"><button type="button" class="au-link" id="auMode" data-act="mode">رمز عبور دارم</button><button type="button" class="au-link" id="auForgot" data-act="forgot" hidden>رمزم را فراموش کرده‌ام</button></div>
    <div id="auSocialBox" hidden><div class="au-or"><span>یا ورود با</span></div><div class="au-social" id="auSocial"></div></div>
    <div class="au-row" style="justify-content:center"><button type="button" class="au-link" data-act="guest" id="auGuest" hidden>ادامه بدون حساب کاربری</button></div>
  </section>

  <section data-screen="code" hidden>
    <h1 class="au-h">کد تأیید را وارد کنید</h1>
    <p class="au-p">کد ۸ رقمی به <b class="au-ltr" id="auSentTo"></b> ارسال شد. اگر نرسید، پوشهٔ اسپم را هم ببینید.</p>
    <form id="auCodeForm" novalidate>
      <input class="input au-code" id="auCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="••••••••" dir="ltr" aria-label="کد تأیید">
      <button type="submit" class="btn btn-primary au-block">تأیید و ورود</button>
    </form>
    <div class="au-row"><button type="button" class="au-link" id="auResend" data-act="resend">ارسال مجدد کد</button><button type="button" class="au-link" data-act="changeemail">تغییر ایمیل</button></div>
  </section>

  <section data-screen="setpw" hidden>
    <h1 class="au-h" id="auPwTitle">می‌خواهید رمز عبور بگذارید؟</h1>
    <p class="au-p" id="auPwHint">اگر دوست دارید، یک رمز بگذارید تا دفعهٔ بعد بدون گرفتن کد از ایمیل وارد شوید. اجباری نیست.</p>
    <form id="auPwForm" novalidate>
      <label class="au-l" for="auNewPwd">رمز جدید</label>
      <div class="au-pw"><input class="input au-ltr" id="auNewPwd" type="password" autocomplete="new-password" maxlength="128">
        <button type="button" class="btn btn-secondary btn-sm" data-act="togglepw" data-target="auNewPwd">نمایش</button></div>
      <div class="au-meter" aria-hidden="true"><i id="auMeter"></i></div>
      <div class="au-sub" id="auPwTip">حداقل ۸ نویسه، شامل حرف و عدد</div>
      <button type="submit" class="btn btn-primary au-block">ذخیرهٔ رمز و ورود</button>
    </form>
    <button type="button" class="au-link" data-act="skippw" id="auSkipPw">حالا نه، با همین کد ادامه می‌دهم</button>
  </section>

  <section data-screen="tg" hidden>
    <div class="au-wait"><div class="au-spin"></div>
      <h1 class="au-h" id="auTgTitle">ورود با تلگرام</h1>
      <p class="au-p" id="auTgHint">در حال آماده‌سازی…</p>
      <a class="btn btn-primary au-block" id="auTgOpen" href="#" target="_blank" rel="noopener noreferrer" hidden>باز کردن تلگرام</a>
    </div>
    <button type="button" class="au-link" data-act="tgcancel">انصراف</button>
  </section>
</div></div>`;


  const authRoot = D.createElement('div'); authRoot.id = 'authRoot'; authRoot.innerHTML = MARKUP; D.body.appendChild(authRoot);

  const show = name => {
    authRoot.querySelectorAll('[data-screen]').forEach(s => { s.hidden = s.dataset.screen !== name; });
    S.cur = name; $('auX').hidden = !(S.entered || GUEST_OK);
    msg('');
    const f = authRoot.querySelector('[data-screen="' + name + '"] input'); if (f && !f.closest('[hidden]')) setTimeout(() => { try { f.focus(); } catch (e) {} }, 60);
  };
  function msg(t, ok) { const m = $('auMsg'); m.hidden = !t; m.textContent = t || ''; m.className = 'au-msg' + (ok ? ' ok' : ''); }
  function busy(on) { authRoot.querySelectorAll('button, input, a.btn').forEach(b => { if (on) { b.dataset.wasDis = b.disabled ? '1' : ''; b.disabled = true; } else { b.disabled = b.dataset.wasDis === '1'; } }); }
  function focusFirst() { const f = authRoot.querySelector('[data-screen]:not([hidden]) input:not([hidden])'); if (f && f.offsetParent) { try { f.focus(); } catch (e) {} } }
  async function run(fn) { busy(true); try { return await fn(); } catch (e) { msg(errText(e)); } finally { busy(false); tick(); focusFirst(); } }

  if (!window.supabase || !window.supabase.createClient) { show('fatal'); return; }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: STORE_KEY }
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
    $('auGo').textContent = m === 'pwd' ? 'ورود' : 'دریافت کد تأیید';
    $('auMode').textContent = m === 'pwd' ? 'ورود بدون رمز (با کد ایمیل)' : 'رمز عبور دارم';
    $('auEmailHint').textContent = m === 'pwd' ? 'ایمیل و رمز عبورتان را وارد کنید.' : 'ایمیل‌تان را وارد کنید؛ یک کد تأیید برایتان می‌فرستیم. نیازی به ساختن رمز نیست.';
  }
  async function sendCode(email) {
    const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) { msg(errText(error)); return false; }
    S.email = email; $('auSentTo').textContent = email; $('auCode').value = ''; show('code'); startCooldown(); return true;
  }
  $('auEmailForm').addEventListener('submit', e => {
    e.preventDefault();
    const email = normEmail($('auEmail').value);
    if (!email) return msg('ایمیل را درست وارد کنید.');
    if (S.mode === 'pwd') {
      const pwd = $('auPwd').value; if (!pwd) return msg('رمز عبور را وارد کنید.');
      run(async () => {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: pwd });
        if (error) return msg(errText(error));
        $('auPwd').value = ''; enter(data.user, true);
      });
    } else run(() => sendCode(email));
  });
  function startCooldown() {
    S.cool = 60; clearInterval(S.timer);
    S.timer = setInterval(() => { S.cool--; tick(); if (S.cool <= 0) clearInterval(S.timer); }, 1000); tick();
  }
  function tick() { const b = $('auResend'); if (!b) return; b.disabled = S.cool > 0; b.textContent = S.cool > 0 ? 'ارسال مجدد (' + toFa(S.cool) + ')' : 'ارسال مجدد کد'; }
  function verifyCode() {
    const token = toEn($('auCode').value).replace(/\D/g, '');
    if (token.length < OTP_LEN) return msg('کد را کامل وارد کنید (' + toFa(OTP_LEN) + ' رقم).');
    run(async () => {
      const { data, error } = await sb.auth.verifyOtp({ email: S.email, token, type: 'email' });
      if (error) { $('auCode').value = ''; return msg(errText(error)); }
      const u = data.user, md = (u && u.user_metadata) || {};
      if (S.forgot || (!md.has_password && !md.pwd_asked)) { S.user = u; S.fromAccount = false; preparePw(S.forgot); show('setpw'); }
      else enter(u, true);
    });
  }
  $('auCodeForm').addEventListener('submit', e => { e.preventDefault(); verifyCode(); });
  $('auCode').addEventListener('input', e => {
    const v = toEn(e.target.value).replace(/\D/g, ''); e.target.value = v; if (v.length >= OTP_LEN) verifyCode();
  });

  /* ---------- تعیین رمز (اختیاری) ---------- */
  function preparePw(forgot) {
    $('auNewPwd').value = ''; meter('');
    $('auPwTitle').textContent = forgot ? 'رمز جدید بگذارید' : (S.fromAccount ? 'تعیین یا تغییر رمز عبور' : 'می‌خواهید رمز عبور بگذارید؟');
    $('auPwHint').textContent = forgot ? 'رمز جدیدتان را بنویسید تا دفعهٔ بعد با ایمیل و رمز وارد شوید.' : 'اگر دوست دارید، یک رمز بگذارید تا دفعهٔ بعد بدون گرفتن کد از ایمیل وارد شوید. اجباری نیست.';
    $('auSkipPw').textContent = S.fromAccount ? 'انصراف' : (forgot ? 'حالا نه' : 'حالا نه، با همین کد ادامه می‌دهم');
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
      if (S.fromAccount) { closeAuth(); toast('✅ رمز عبور ذخیره شد'); } else { enter(data.user || S.user, true); toast('✅ رمز عبور ذخیره شد'); }
    });
  });

  /* ---------- گوگل / گیت‌هاب ---------- */
  function oauth(provider) {
    run(async () => {
      const { error } = await sb.auth.signInWithOAuth({ provider, options: { redirectTo: location.origin + location.pathname } });
      if (error) msg(errText(error));
    });
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
    if (!r || r.status !== 'ok') { show('email'); return msg(!navigator.onLine ? 'اتصال اینترنت برقرار نیست.' : 'اتصال به سرویس تلگرام برقرار نشد؛ کمی بعد دوباره تلاش کنید.'); }
    $('auTgHint').textContent = purpose === 'phone'
      ? 'تلگرام را باز کنید، روی Start بزنید و سپس دکمهٔ «اشتراک‌گذاری شماره من» را بزنید. بعد به همین صفحه برگردید.'
      : 'تلگرام را باز کنید و روی Start بزنید. بعد به همین صفحه برگردید.';
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
  function openAuth() { authRoot.hidden = false; setMode('otp'); show('email'); }
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
  function closeAuth() { authRoot.hidden = true; S.fromAccount = false; }
  function enter(user, fresh) {
    S.user = user || null; S.entered = true; closeAuth(); window.__authReady = true; root.classList.remove('auth-pending'); renderAccount();
    if (user && fresh) maybeRestore();
    try { if (user) localStorage.removeItem('emp_guest'); else localStorage.setItem('emp_guest', '1'); } catch (e) {}
  }
  function cachedSession() {
    try { const r = JSON.parse(localStorage.getItem(STORE_KEY) || 'null'); return r && r.user && r.refresh_token ? r : null; } catch (e) { return null; }
  }
  async function boot() {
    const q = new URLSearchParams(location.search), h = new URLSearchParams(location.hash.slice(1));
    const oerr = q.get('error_description') || h.get('error_description');
    let session = null;
    try { const r = await sb.auth.getSession(); session = r.data && r.data.session; } catch (e) {}
    if (!session && !navigator.onLine) session = cachedSession(); // آفلاین: با نشست ذخیره‌شده وارد می‌شود
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
      if (error) throw error; if (!quiet) toast('☁️ داده‌ها در ابر ذخیره شد'); return true;
    } catch (e) { if (!quiet) toast('⚠️ ذخیره در ابر انجام نشد'); return false; }
  }
  async function restore(confirmFirst) {
    try {
      const { data, error } = await sb.from('user_backups').select('data').eq('user_id', S.user.id).maybeSingle();
      if (error) throw error;
      if (!data || !data.data) return toast('پشتیبانی در ابر پیدا نشد');
      if (confirmFirst && !confirm('داده‌های این دستگاه با پشتیبان ابری جایگزین شود؟')) return;
      if (applyData(data.data)) { toast('✅ بازیابی شد؛ برنامه دوباره بارگذاری می‌شود'); setTimeout(() => location.reload(), 900); }
    } catch (e) { toast('⚠️ بازیابی انجام نشد'); }
  }
  async function maybeRestore() {
    if (CONTENT_KEYS.some(k => localStorage.getItem(k) !== null)) return; // روی دستگاه داده دارد؛ دست نمی‌زنیم
    try {
      const { data } = await sb.from('user_backups').select('data').eq('user_id', S.user.id).maybeSingle();
      if (data && data.data && applyData(data.data)) { toast('✅ داده‌های شما از ابر بازیابی شد'); setTimeout(() => location.reload(), 900); }
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
    try { await sb.auth.signOut(); } catch (e) {}
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
    else if (a === 'forgot') { const em = normEmail($('auEmail').value); if (!em) return msg('ابتدا ایمیل را بنویسید.'); S.forgot = true; run(() => sendCode(em)); }
    else if (a === 'togglepw') { const i = $(t.dataset.target); const s = i.type === 'password'; i.type = s ? 'text' : 'password'; t.textContent = s ? 'پنهان' : 'نمایش'; }
    else if (a === 'resend') { if (S.cool <= 0) run(() => sendCode(S.email)); }
    else if (a === 'changeemail') { S.forgot = false; show('email'); }
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
