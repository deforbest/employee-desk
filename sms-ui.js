/* File: sms-ui.js | Version: 1.2.0 | Date: 2026-11-01
   ثبت آسان تراکنش از پیامک بانکی. مرورگر اجازهٔ خواندن مستقیم پیامک را نمی‌دهد؛ ورودی از سه راه می‌آید:
   ۱) اشتراک‌گذاری پیامک به برنامه (اندروید، برنامهٔ نصب‌شده)  ۲) چسباندن متن  ۳) خواندن از کلیپ‌بورد.
   فقط مبلغ، بانک، نوع و تاریخ/ساعت ذخیره می‌شود؛ متن پیامک هرگز ذخیره یا ارسال نمی‌شود. */
(function () {
  'use strict';
  const P = window.SmsParser, D = document;
  if (!P) return;
  const K_CFG = 'emp_sms_cfg', K_INBOX = 'emp_sms_inbox', K_RULES = 'emp_sms_rules';
  const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  const save = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  let cfg = Object.assign({ enabled: false, mode: 'all', asked: false }, load(K_CFG, {}));
  let inbox = Array.isArray(load(K_INBOX, [])) ? load(K_INBOX, []) : [];
  let rules = Array.isArray(load(K_RULES, [])) ? load(K_RULES, []) : [];
  let failed = [];            // فقط در حافظهٔ موقت؛ هیچ‌وقت ذخیره نمی‌شود
  const Cap = window.Capacitor;
  const isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
  const Native = isNative && Cap.Plugins ? Cap.Plugins.SmsReader : null;
  const K_SENDERS = 'emp_sms_senders', K_LAST = 'emp_sms_last';
  let senders = load(K_SENDERS, []); if (!Array.isArray(senders)) senders = [];
  let sel = new Set();
  const F = () => window.EmpFinance || null;
  const $ = (s, r) => (r || D).querySelector(s);
  const el = (tag, cls, txt) => { const e = D.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
  const saveCfg = () => save(K_CFG, cfg), saveInbox = () => save(K_INBOX, inbox);
  const rial = n => (F() ? F().sep(n) : String(n)) + ' ریال';

  /* ---------- ورود پیامک ---------- */
  function intake(text) {
    const parts = P.splitMessages(text); let added = 0, dup = 0; failed = [];
    parts.forEach(raw => {
      const r = P.parseOne(raw, { rules });
      if (!r) { if (raw.trim().length > 15) failed.push(raw); return; }
      const fp = P.fingerprint(r);
      if (inbox.some(x => x.fp === fp)) { dup++; return; }
      const exists = F() && F().has(fp);
      inbox.unshift({ id: 'sm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: r.type, amount: r.amount, bank: r.bank, dateKey: r.dateKey, time: r.time, fp, dateFromSms: r.dateFromSms, dup: !!exists });
      added++;
    });
    inbox = inbox.slice(0, 300); saveInbox();
    return { added, dup, failed: failed.length, total: parts.length };
  }

  /* ---------- رابط: ورقهٔ ثبت ---------- */
  let sheet = null;
  function build() {
    if (sheet) return;
    sheet = el('div', 'sms-backdrop'); sheet.id = 'smsSheet'; sheet.hidden = true;
    sheet.innerHTML = `<div class="sms-sheet" role="dialog" aria-modal="true" aria-label="ثبت تراکنش از پیامک">
      <div class="sms-head"><strong>ثبت از پیامک بانکی</strong><button type="button" class="btn btn-secondary btn-sm" data-sms="close">بستن</button></div>
      ${Native ? '<div class="sms-row"><select id="smsDays" class="select" aria-label="بازهٔ خواندن"><option value="0">از آخرین بررسی</option><option value="1">۲۴ ساعت گذشته</option><option value="7">۷ روز گذشته</option><option value="30">۳۰ روز گذشته</option></select><button type="button" class="btn btn-primary btn-sm" data-sms="scan">خواندن پیامک‌های گوشی</button><button type="button" class="btn btn-secondary btn-sm" data-sms="senders">فرستنده‌های مجاز</button></div>' : ''}
      <p class="sms-hint">پیامک بانکی را کپی کنید و اینجا بچسبانید (چند پیامک را می‌توانید پشت هم بچسبانید). فقط مبلغ، بانک، نوع و زمان ذخیره می‌شود؛ متن پیامک ذخیره نمی‌شود.</p>
      <textarea id="smsText" class="input" rows="4" placeholder="پیامک‌ها را اینجا بچسبانید" aria-label="متن پیامک‌ها"></textarea>
      <div class="sms-row"><button type="button" class="btn btn-secondary btn-sm" data-sms="clip">خواندن از کلیپ‌بورد</button><button type="button" class="btn btn-primary btn-sm" data-sms="parse">تحلیل پیامک‌ها</button></div>
      <div class="sms-msg" id="smsMsg" role="status" aria-live="polite" hidden></div>
      <div class="sms-teach" id="smsTeach" hidden></div>
      <div class="sms-list-head"><strong id="smsCount"></strong><span><button type="button" class="au-link" data-sms="all">انتخاب همه</button><button type="button" class="au-link" data-sms="none">هیچ‌کدام</button></span></div>
      <div class="sms-list" id="smsList"></div>
      <div class="sms-actions">
        <button type="button" class="btn" id="smsBtnAll" data-sms="regall">ثبت همه</button>
        <button type="button" class="btn" id="smsBtnSel" data-sms="regsel">ثبت انتخاب‌شده</button>
        <button type="button" class="btn btn-secondary btn-sm" data-sms="discard">حذف انتخاب‌شده از فهرست</button>
      </div></div>`;
    D.body.appendChild(sheet);
    sheet.addEventListener('click', onClick);
    D.addEventListener('keydown', e => { if (e.key === 'Escape' && !sheet.hidden) close(); });
  }
  function msg(t) { if (!sheet) return; const m = $('#smsMsg', sheet); m.hidden = !t; m.textContent = t || ''; }
  function open(resetSel) {
    if (!cfg.enabled) { return optIn(); }
    if (Native && !senders.length) return openSenders();
    build(); sheet.hidden = false;
    if (resetSel !== false) { sel = cfg.mode === 'all' ? new Set(inbox.filter(x => !x.dup).map(x => x.id)) : new Set(); }
    render();
  }
  function close() { if (sheet) sheet.hidden = true; failed = []; const t = $('#smsText', sheet); if (t) t.value = ''; updateBanner(); }
  function render() {
    if (!sheet) return;
    $('#smsCount', sheet).textContent = inbox.length ? inbox.length.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]) + ' تراکنش در فهرست' : 'فهرست خالی است';
    $('#smsBtnAll', sheet).className = 'btn ' + (cfg.mode === 'all' ? 'btn-primary' : 'btn-secondary');
    $('#smsBtnSel', sheet).className = 'btn ' + (cfg.mode === 'select' ? 'btn-primary' : 'btn-secondary');
    const box = $('#smsList', sheet); box.textContent = '';
    inbox.forEach(x => {
      const row = el('label', 'sms-item' + (x.dup ? ' dup' : ''));
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = sel.has(x.id); cb.dataset.id = x.id; cb.setAttribute('aria-label', 'انتخاب تراکنش');
      cb.addEventListener('change', () => { cb.checked ? sel.add(x.id) : sel.delete(x.id); });
      const info = el('div', 'sms-info');
      const top = el('div', 'sms-top');
      top.appendChild(el('span', 'badge ' + (x.type === 'income' ? 'badge-success' : 'badge-danger'), x.type === 'income' ? 'واریز' : 'برداشت'));
      top.appendChild(el('strong', null, rial(x.amount)));
      const sub = el('div', 'sms-sub', [x.bank ? 'بانک ' + x.bank : 'بانک نامشخص', x.dateKey.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]) + (x.time ? ' • ' + x.time.replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]) : ''), x.dateFromSms ? '' : 'زمان: همین الان', x.dup ? 'احتمالاً قبلاً ثبت شده' : ''].filter(Boolean).join(' · '));
      info.appendChild(top); if (x.title) info.appendChild(el('div', 'sms-sub', 'عنوان: ' + x.title)); info.appendChild(sub); row.appendChild(cb); row.appendChild(info);
      const eb = el('button', 'btn btn-secondary btn-sm', 'ویرایش'); eb.type = 'button'; eb.dataset.sms = 'edit'; eb.dataset.id = x.id; eb.style.marginInlineStart = 'auto'; row.appendChild(eb); box.appendChild(row);
    });
    const teach = $('#smsTeach', sheet);
    if (failed.length) {
      teach.hidden = false; teach.textContent = '';
      teach.appendChild(el('div', 'sms-teach-t', failed.length.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]) + ' پیامک را نفهمیدم. اگر بانکی است، یادم بدهید.'));
      const b = el('button', 'btn btn-secondary btn-sm', 'آموزش دادن'); b.type = 'button'; b.dataset.sms = 'teach'; teach.appendChild(b);
    } else teach.hidden = true;
  }

  /* ---------- آموزش قاعدهٔ تازه ---------- */
  function teach() {
    const raw = failed[0]; if (!raw) return;
    const toks = P.numberTokens(raw); const t = $('#smsTeach', sheet); t.textContent = '';
    if (!toks.length) { t.appendChild(el('div', 'sms-teach-t', 'در این متن مبلغی پیدا نشد.')); failed.shift(); return; }
    t.appendChild(el('div', 'sms-teach-t', 'مبلغ تراکنش کدام عدد است؟'));
    const chips = el('div', 'sms-chips'); let chosen = -1;
    toks.forEach((k, i) => { const c = el('button', 'btn btn-secondary btn-sm', (F() ? F().toFa(k.text) : k.text) + (k.before ? '  ‹ ' + k.before.slice(-12) : '')); c.type = 'button'; c.addEventListener('click', () => { chosen = i; chips.querySelectorAll('button').forEach((x, j) => x.classList.toggle('btn-primary', j === i)); }); chips.appendChild(c); });
    t.appendChild(chips);
    const row = el('div', 'sms-row');
    const typ = el('select', 'select'); [['expense', 'برداشت (خرج)'], ['income', 'واریز (دریافتی)']].forEach(o => { const op = el('option', null, o[1]); op.value = o[0]; typ.appendChild(op); });
    const bank = el('select', 'select'); const o0 = el('option', null, 'بانک را انتخاب کنید'); o0.value = ''; bank.appendChild(o0); P.BANK_NAMES.forEach(n => { const op = el('option', null, n); op.value = n; bank.appendChild(op); });
    row.appendChild(typ); row.appendChild(bank); t.appendChild(row);
    const ok = el('button', 'btn btn-primary btn-sm', 'ذخیرهٔ الگو و تحلیل دوباره'); ok.type = 'button';
    ok.addEventListener('click', () => {
      if (chosen < 0) return msg('اول مبلغ را انتخاب کنید.');
      const label = P.labelBefore(toks[chosen].before);
      if (!label) return msg('این پیامک الگوی قابل‌یادگیری ندارد. از ثبت دستی استفاده کنید.');
      rules.push({ label, type: typ.value, bank: bank.value }); rules = rules.slice(-60); save(K_RULES, rules);
      const again = failed.join('\n\n'); const r = intake(again); failed = failed.filter(() => false);
      msg(r.added ? 'یاد گرفتم و ' + r.added + ' تراکنش اضافه شد.' : 'الگو ذخیره شد ولی تراکنشی پیدا نشد.');
      sel = cfg.mode === 'all' ? new Set(inbox.filter(x => !x.dup).map(x => x.id)) : sel; render();
    });
    t.appendChild(ok);
  }

  /* ---------- ثبت ---------- */
  function register(ids) {
    const f = F(); if (!f) return msg('برنامه هنوز آماده نیست.');
    let n = 0; const left = [];
    inbox.forEach(x => {
      if (!ids.has(x.id)) { left.push(x); return; }
      const ok = f.add({ type: x.type, amount: x.amount, title: x.title || ((x.bank ? 'بانک ' + x.bank : 'بانک') + ' — ' + (x.type === 'income' ? 'واریز' : 'برداشت') + ' (پیامک)'), dateKey: x.dateKey, time: x.time, bank: x.bank, src: 'sms', fp: x.fp, force: true });
      if (ok === true) n++; else left.push(x);
    });
    inbox = left; saveInbox(); sel = new Set(); f.refresh(); f.toast(n ? n.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]) + ' تراکنش ثبت شد' : 'چیزی ثبت نشد'); render(); updateBanner();
    if (!inbox.length) setTimeout(close, 500);
  }

  async function readClip() {
    try { const t = Native && Native.readClipboard ? ((await Native.readClipboard()) || {}).text : await navigator.clipboard.readText(); if (!t) return msg('کلیپ‌بورد خالی است.'); $('#smsText', sheet).value = t; parseNow(); }
    catch (e) { msg('مرورگر اجازهٔ خواندن کلیپ‌بورد را نداد. متن را در کادر بچسبانید (نگه‌داشتن انگشت روی کادر ← چسباندن).'); }
  }
  function parseNow() {
    const txt = $('#smsText', sheet).value; if (!txt.trim()) return msg('اول متن پیامک را بچسبانید.');
    const r = intake(txt); $('#smsText', sheet).value = '';
    msg(r.added ? r.added + ' تراکنش پیدا شد.' + (r.dup ? ' (' + r.dup + ' مورد تکراری رد شد)' : '') : (r.failed ? 'پیامکی که بانکی باشد پیدا نشد؛ می‌توانید به من یاد بدهید.' : 'تراکنش تازه‌ای پیدا نشد.'));
    sel = cfg.mode === 'all' ? new Set(inbox.filter(x => !x.dup).map(x => x.id)) : new Set(inbox.filter(x => sel.has(x.id)).map(x => x.id)); render();
  }
  function onClick(e) {
    const b = e.target.closest('[data-sms]'); if (!b) { if (e.target === sheet) close(); return; }
    const a = b.dataset.sms;
    if (a === 'close') close(); else if (a === 'clip') readClip(); else if (a === 'parse') parseNow();
    else if (a === 'all') { sel = new Set(inbox.map(x => x.id)); render(); } else if (a === 'none') { sel = new Set(); render(); }
    else if (a === 'regall') register(new Set(inbox.filter(x => !x.dup).map(x => x.id)));
    else if (a === 'regsel') { if (!sel.size) return msg('هیچ تراکنشی انتخاب نشده است.'); register(new Set(sel)); }
    else if (a === 'discard') { inbox = inbox.filter(x => !sel.has(x.id)); saveInbox(); sel = new Set(); render(); updateBanner(); }
    else if (a === 'teach') teach();
    else if (a === 'edit') editInbox(b.dataset.id);
    else if (a === 'scan') scanNative(true, Number(($('#smsDays', sheet) || {}).value) || 0).then(n => { msg(n ? n + ' تراکنش تازه پیدا شد.' : 'تراکنش تازه‌ای پیدا نشد.'); sel = cfg.mode === 'all' ? new Set(inbox.filter(x => !x.dup).map(x => x.id)) : sel; render(); });
    else if (a === 'senders') openSenders();
  }

  /* ---------- پیشنهاد فعال‌سازی ---------- */
  function optIn() {
    if (D.getElementById('smsOpt')) return;
    const w = el('div', 'sms-backdrop'); w.id = 'smsOpt';
    w.innerHTML = `<div class="sms-sheet" role="dialog" aria-modal="true" aria-label="فعال‌سازی ثبت از پیامک">
      <div class="sms-head"><strong>ثبت آسان از پیامک بانکی</strong></div>
      <p class="sms-hint">${Native ? 'برنامه با اجازهٔ شما فقط پیامک‌های فرستنده‌هایی را که خودتان تأیید کنید می‌خواند و مبلغ، بانک و نوع (واریز یا برداشت) را خودش می‌فهمد.' : 'پیامک بانکی را کپی یا «اشتراک‌گذاری» کنید تا برنامه مبلغ، بانک و نوع (واریز یا برداشت) را خودش بفهمد. مرورگر اجازهٔ خواندن مستقیم پیامک‌های گوشی را نمی‌دهد، پس خودِ شما تعیین می‌کنید کدام پیامک وارد شود.'}</p>
      <p class="sms-hint">فقط مبلغ، بانک، نوع و تاریخ و ساعت ذخیره می‌شود. متن پیامک هرگز ذخیره یا ارسال نمی‌شود. هر وقت خواستید از «تنظیمات ← دسترسی‌پذیری» خاموشش کنید.</p>
      <div class="sms-actions"><button type="button" class="btn btn-primary" data-o="yes">فعال‌سازی</button><button type="button" class="btn btn-secondary" data-o="later">بعداً</button><button type="button" class="au-link" data-o="never">دیگر نپرس</button></div></div>`;
    D.body.appendChild(w);
    w.addEventListener('click', e => {
      const b = e.target.closest('[data-o]'); if (!b && e.target !== w) return; const o = b ? b.dataset.o : 'later';
      if (o === 'yes') { cfg.enabled = true; cfg.asked = true; saveCfg(); syncSettings(); injectBtn(); w.remove(); open(); }
      else { if (o === 'never') { cfg.asked = true; saveCfg(); } try { sessionStorage.setItem('emp_sms_later', '1'); } catch (x) {} w.remove(); }
    });
  }

  /* ---------- دکمه، بنر و تنظیمات ---------- */
  function injectBtn() {
    const host = D.getElementById('btnTxTypeIncome'); if (!host || D.getElementById('btnSmsImport')) return;
    const b = el('button', 'btn btn-secondary btn-sm', '📥 از پیامک'); b.type = 'button'; b.id = 'btnSmsImport'; b.addEventListener('click', () => open());
    host.parentNode.appendChild(b); b.hidden = !cfg.enabled;
  }
  function updateBanner() {
    const v = D.getElementById('view-finance'); if (!v) return;
    let bn = D.getElementById('smsBanner');
    if (!cfg.enabled || !inbox.length) { if (bn) bn.remove(); const bt = D.getElementById('btnSmsImport'); if (bt) bt.hidden = !cfg.enabled; return; }
    if (!bn) { bn = el('div', 'sms-banner'); bn.id = 'smsBanner'; v.insertBefore(bn, v.firstChild); }
    bn.textContent = '';
    bn.appendChild(el('span', null, inbox.length.toString().replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]) + ' تراکنش بانکی منتظر ثبت است.'));
    const b = el('button', 'btn btn-primary btn-sm', 'بررسی و ثبت'); b.type = 'button'; b.addEventListener('click', () => open()); bn.appendChild(b);
    const bt = D.getElementById('btnSmsImport'); if (bt) bt.hidden = false;
  }
  function syncSettings() {
    const sw = D.getElementById('setSmsEnabled'), md = D.getElementById('setSmsMode');
    if (sw) sw.checked = !!cfg.enabled; if (md) md.value = cfg.mode;
    const row = D.getElementById('setSmsModeRow'); if (row) row.style.opacity = cfg.enabled ? '1' : '.5';
    const bt = D.getElementById('btnSmsImport'); if (bt) bt.hidden = !cfg.enabled;
    updateBanner();
  }
  function wireSettings() {
    const sw = D.getElementById('setSmsEnabled'), md = D.getElementById('setSmsMode');
    if (sw) sw.addEventListener('change', () => { cfg.enabled = sw.checked; cfg.asked = true; saveCfg(); syncSettings(); });
    if (md) md.addEventListener('change', () => { cfg.mode = md.value === 'select' ? 'select' : 'all'; saveCfg(); });
    syncSettings();
  }

  /* ---------- ورودی اشتراک‌گذاری (Share Target) ---------- */
  function pickShared() {
    try {
      const q = new URLSearchParams(location.search); const t = [q.get('title'), q.get('text'), q.get('url')].filter(Boolean).join('\n');
      if (q.has('text') || q.has('title')) { ['title', 'text', 'url'].forEach(k => q.delete(k)); const s = q.toString(); history.replaceState(null, '', location.pathname + (s ? '?' + s : '') + location.hash); }
      if (t.trim()) sessionStorage.setItem('emp_share_in', t);
    } catch (e) {}
  }
  function handleShared() {
    let t = ''; try { t = sessionStorage.getItem('emp_share_in') || ''; sessionStorage.removeItem('emp_share_in'); } catch (e) {}
    if (!t) return;
    if (!cfg.enabled) { try { sessionStorage.setItem('emp_share_in', t); } catch (e) {} return optIn(); }
    const r = intake(t); const f = F(); if (f) { const v = D.querySelector('.nav-btn[data-view="view-finance"]'); if (v) v.click(); }
    open(); msg(r.added ? r.added + ' تراکنش از پیامک اشتراک‌گذاری‌شده پیدا شد.' : 'پیامک بانکی قابل‌فهم پیدا نشد.');
  }


  /* ---------- نسخهٔ اندروید (نصبی): خواندن پیامک با اجازهٔ کاربر؛ فقط از فرستنده‌های تأییدشده ---------- */
  const fa = n => String(n).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[+d]);
  let scanning = false;
  async function nativePerm(ask) {
    try { let r = await Native.checkPermissions(); if (r && r.sms === 'granted') return true; if (!ask) return false; r = await Native.requestPermissions({ permissions: ['sms'] }); return !!(r && r.sms === 'granted'); } catch (e) { return false; }
  }
  async function discover() { // فقط روی همین دستگاه و موقت؛ متن پیامک‌ها ذخیره نمی‌شود
    if (!(await nativePerm(true))) return { denied: true };
    const res = await Native.read({ since: Date.now() - 60 * 86400000, limit: 800 }); const map = new Map();
    (res.messages || []).forEach(m => {
      const r = P.parseOne(m.body, { rules, sender: m.address, at: m.date }); if (!r) return;
      const e = map.get(m.address) || { address: m.address, count: 0, bank: '' }; e.count++; if (!e.bank) e.bank = r.bank; map.set(m.address, e);
    });
    return { list: Array.from(map.values()).sort((a, b) => b.count - a.count) };
  }
  async function scanNative(manual, days) {
    if (!Native || !cfg.enabled || !senders.length || scanning) return 0;
    scanning = true;
    try {
      if (!(await nativePerm(false))) { if (manual) { const f = F(); if (f) f.toast('اجازهٔ خواندن پیامک داده نشده است'); } return 0; }
      const since = days > 0 ? Date.now() - days * 86400000 : (Number(localStorage.getItem(K_LAST)) || (Date.now() - 86400000));
      const res = await Native.read({ since, limit: 300, addresses: senders });
      let maxD = since; const added = [];
      (res.messages || []).sort((a, b) => a.date - b.date).forEach(m => {
        if (m.date > maxD) maxD = m.date;
        const r = P.parseOne(m.body, { rules, sender: m.address, at: m.date }); if (!r) return;
        const fp = P.fingerprint(r); if (inbox.some(x => x.fp === fp)) return;
        const exists = !!(F() && F().has(fp));
        const it = { id: 'sm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), type: r.type, amount: r.amount, bank: r.bank, dateKey: r.dateKey, time: r.time, fp, dateFromSms: true, dup: exists };
        inbox.unshift(it); if (!exists) added.push(it);
      });
      if (!(days > 0)) { try { localStorage.setItem(K_LAST, String(maxD)); } catch (e) {} }
      inbox = inbox.slice(0, 300); saveInbox(); updateBanner();
      if (added.length && !manual) promptNew(added);
      return added.length;
    } catch (e) { return 0; } finally { scanning = false; }
  }
  function promptNew(items) {
    const old = D.getElementById('smsNew'); if (old) old.remove();
    const card = el('div', 'sms-new'); card.id = 'smsNew'; card.setAttribute('role', 'alertdialog');
    const one = items.length === 1;
    card.appendChild(el('div', 'sms-new-t', one ? 'تراکنش تازه: ' + (items[0].type === 'income' ? 'واریز ' : 'برداشت ') + rial(items[0].amount) + (items[0].bank ? ' · بانک ' + items[0].bank : '') : fa(items.length) + ' تراکنش تازه از پیامک پیدا شد'));
    const row = el('div', 'sms-row'); const ids = new Set(items.map(x => x.id));
    const primaryAll = one || cfg.mode === 'all';
    const bAll = el('button', 'btn btn-sm ' + (primaryAll ? 'btn-primary' : 'btn-secondary'), one ? 'ثبت' : 'ثبت همه'); bAll.type = 'button';
    const bSel = el('button', 'btn btn-sm ' + (primaryAll ? 'btn-secondary' : 'btn-primary'), one ? 'ویرایش' : 'انتخاب تراکنش‌ها'); bSel.type = 'button';
    const bLater = el('button', 'au-link', 'بعداً'); bLater.type = 'button';
    bAll.addEventListener('click', () => { card.remove(); register(ids); });
    bSel.addEventListener('click', () => { card.remove(); sel = new Set(); build(); open(false); });
    bLater.addEventListener('click', () => card.remove());
    row.appendChild(bAll); row.appendChild(bSel); row.appendChild(bLater); card.appendChild(row); D.body.appendChild(card);
    setTimeout(() => { if (card.isConnected) card.remove(); }, 60000);
  }

  /* ---------- ویرایش تراکنش (عنوان، مبلغ، نوع، بانک) ---------- */
  const QUICK_TITLES = ['هزینه غذا', 'دریافت حقوق', 'پاداش', 'قرض', 'خرید روزمره', 'کرایه و رفت‌وآمد', 'قبض و شارژ', 'انتقال وجه'];
  const toEnDigits = t => String(t || '').replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632)).replace(/[,٬،\s]/g, '');
  function openEdit(init, heading, onSave) {
    const old = D.getElementById('smsEdit'); if (old) old.remove();
    const w = el('div', 'sms-backdrop'); w.id = 'smsEdit'; w.style.zIndex = '3700';
    const sh = el('div', 'sms-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', heading);
    const head = el('div', 'sms-head'); head.appendChild(el('strong', null, heading));
    const x = el('button', 'btn btn-secondary btn-sm', 'بستن'); x.type = 'button'; head.appendChild(x); sh.appendChild(head);
    const field = (label, node) => { const g = el('div'); g.style.marginBottom = '10px'; const l = el('label', 'sms-sub', label); l.style.display = 'block'; l.style.marginBottom = '4px'; g.appendChild(l); g.appendChild(node); sh.appendChild(g); return node; };
    const title = el('input', 'input'); title.type = 'text'; title.maxLength = 80; title.value = init.title || ''; title.placeholder = 'مثلاً: هزینه غذا';
    field('عنوان تراکنش (بابت چه کاری؟)', title);
    const chips = el('div', 'sms-chips');
    QUICK_TITLES.forEach(t => { const c = el('button', 'btn btn-secondary btn-sm', t); c.type = 'button'; c.addEventListener('click', () => { title.value = t; title.focus(); }); chips.appendChild(c); });
    sh.appendChild(chips);
    const amount = el('input', 'input'); amount.type = 'text'; amount.inputMode = 'numeric'; amount.value = init.amount ? String(init.amount) : '';
    field('مبلغ (ریال)', amount);
    const typ = el('select', 'select'); [['expense', 'برداشت (خرج)'], ['income', 'واریز (دریافتی)']].forEach(o => { const op = el('option', null, o[1]); op.value = o[0]; typ.appendChild(op); });
    typ.value = init.type === 'income' ? 'income' : 'expense'; field('نوع تراکنش', typ);
    const bank = el('select', 'select'); const o0 = el('option', null, 'نامشخص'); o0.value = ''; bank.appendChild(o0);
    const names = P.BANK_NAMES.slice(); if (init.bank && names.indexOf(init.bank) === -1) names.unshift(init.bank);
    names.forEach(n => { const op = el('option', null, n); op.value = n; bank.appendChild(op); }); bank.value = init.bank || ''; field('بانک', bank);
    const m = el('div', 'sms-msg'); m.hidden = true; sh.appendChild(m);
    const act = el('div', 'sms-actions');
    const ok = el('button', 'btn btn-primary', 'ذخیره'); ok.type = 'button';
    const no = el('button', 'btn btn-secondary', 'انصراف'); no.type = 'button';
    act.appendChild(ok); act.appendChild(no); sh.appendChild(act); w.appendChild(sh); D.body.appendChild(w);
    const close = () => w.remove();
    x.addEventListener('click', close); no.addEventListener('click', close);
    w.addEventListener('click', e => { if (e.target === w) close(); });
    ok.addEventListener('click', () => {
      const a = Math.round(Number(toEnDigits(amount.value)) || 0);
      if (a <= 0) { m.hidden = false; m.textContent = 'مبلغ را درست وارد کنید.'; return; }
      onSave({ title: title.value.trim().slice(0, 80), amount: a, type: typ.value, bank: bank.value });
      close();
    });
    setTimeout(() => title.focus(), 50);
  }
  function editInbox(id) {
    const it = inbox.find(x => x.id === id); if (!it) return;
    openEdit(it, 'ویرایش تراکنش', patch => { Object.assign(it, patch); saveInbox(); render(); });
  }
  function editTx(id) {
    const f = F(); const t = f && f.get ? f.get(id) : null; if (!t) return;
    openEdit(t, 'ویرایش تراکنش', patch => {
      const ok = f.update(id, patch); f.refresh(); f.toast(ok ? 'تغییرات ذخیره شد' : 'ذخیره نشد');
    });
  }
  async function openSenders() {
    if (!Native) return;
    const old = D.getElementById('smsSenders'); if (old) old.remove();
    const w = el('div', 'sms-backdrop'); w.id = 'smsSenders';
    w.innerHTML = `<div class="sms-sheet" role="dialog" aria-modal="true" aria-label="پیامک‌های مجاز">
      <div class="sms-head"><strong>پیامک‌های مجاز</strong><button type="button" class="btn btn-secondary btn-sm" data-s="close">بستن</button></div>
      <p class="sms-hint">فقط پیامک فرستنده‌هایی خوانده می‌شود که شما تأیید کنید. متن پیامک‌ها ذخیره نمی‌شود؛ فقط مبلغ، بانک، نوع و زمان.</p>
      <div class="sms-row"><input id="smsNewSender" class="input" type="text" maxlength="30" dir="auto" placeholder="افزودن فرستندهٔ دلخواه (شماره یا نام حرفی بانک)" aria-label="فرستندهٔ دلخواه" style="flex:1 1 200px"><button type="button" class="btn btn-secondary btn-sm" data-s="add">افزودن</button></div>
      <div class="sms-msg" id="smsSMsg" role="status" aria-live="polite">در حال بررسی پیامک‌های گوشی…</div>
      <div class="sms-list" id="smsSList"></div>
      <div class="sms-row"><select id="smsFrom" class="select" aria-label="از چه زمانی وارد شود"><option value="0">فقط پیامک‌های جدید</option><option value="7">پیامک‌های ۷ روز گذشته هم وارد شود</option><option value="30">پیامک‌های ۳۰ روز گذشته هم وارد شود</option></select></div>
      <div class="sms-actions"><button type="button" class="btn btn-primary" data-s="save">ذخیره</button></div></div>`;
    D.body.appendChild(w); const msgEl = w.querySelector('#smsSMsg'), box = w.querySelector('#smsSList'); let found = [];
    w.addEventListener('click', async e => {
      const b = e.target.closest('[data-s]'); if (!b) { if (e.target === w) w.remove(); return; }
      if (b.dataset.s === 'close') return w.remove();
      if (b.dataset.s === 'add') {
        const inp = w.querySelector('#smsNewSender'); const v = (inp.value || '').trim().slice(0, 30); if (!v) return;
        if (!Array.from(box.querySelectorAll('input')).some(i => i.dataset.addr === v)) addRow({ address: v, count: 0, bank: '' }, true);
        inp.value = ''; return;
      }
      const picked = Array.from(box.querySelectorAll('input:checked')).map(i => i.dataset.addr);
      senders = picked.slice(0, 50); save(K_SENDERS, senders);
      const days = Number(w.querySelector('#smsFrom').value) || 0;
      try { localStorage.setItem(K_LAST, String(Date.now() - days * 86400000)); } catch (x) {}
      cfg.enabled = true; cfg.asked = true; saveCfg(); syncSettings(); w.remove();
      if (!senders.length) { const f = F(); if (f) f.toast('هیچ فرستنده‌ای انتخاب نشد'); return; }
      const n = await scanNative(true); const f = F(); if (f) f.toast(n ? fa(n) + ' تراکنش پیدا شد' : 'ذخیره شد');
      if (n) open();
    });
    const addRow = (x, checked) => {
      const row = el('label', 'sms-item'); const cb = el('input'); cb.type = 'checkbox'; cb.dataset.addr = x.address; cb.checked = !!checked;
      const info = el('div', 'sms-info'); info.appendChild(el('strong', null, x.address)); info.appendChild(el('div', 'sms-sub', x.count ? (x.bank ? 'بانک ' + x.bank : 'بانک نامشخص') + ' · ' + fa(x.count) + ' پیام' : 'افزوده‌شده توسط شما'));
      row.appendChild(cb); row.appendChild(info); box.appendChild(row);
    };
    const d = await discover();
    if (d.denied) { msgEl.textContent = 'اجازهٔ خواندن پیامک داده نشد. از تنظیمات اندروید: برنامه‌ها ← میز کار ← مجوزها ← پیامک. اگر گزینه خاکستری بود، در همان صفحه از منوی سه‌نقطه «مجاز کردن تنظیمات محدودشده» را بزنید.'; return; }
    found = d.list;
    msgEl.textContent = found.length ? 'فرستنده‌هایی که پیامک بانکی داشتند را انتخاب کنید (یا فرستندهٔ دلخواه را بالا اضافه کنید):' : 'در ۶۰ روز گذشته پیامک بانکی قابل‌فهم پیدا نشد. می‌توانید فرستندهٔ دلخواه را بالا اضافه کنید.';
    found.forEach(x => addRow(x, senders.indexOf(x.address) !== -1 || (!senders.length && !!x.bank)));
    senders.forEach(a => { if (!found.some(x => x.address === a)) addRow({ address: a, count: 0, bank: '' }, true); });
  }
  function injectNativeRow() {
    if (!Native) return; const g = D.getElementById('setSmsModeRow'); if (!g || D.getElementById('setSmsSenders')) return;
    const row = el('div', 'set-row'); row.id = 'setSmsSenders';
    const tx = el('div', 'set-row-text'); tx.appendChild(el('div', 'set-row-title', 'پیامک‌های مجاز')); tx.appendChild(el('div', 'set-row-sub', 'انتخاب فرستنده‌هایی که برنامه اجازه دارد بخواند'));
    const b = el('button', 'btn btn-secondary btn-sm', 'انتخاب فرستنده‌ها'); b.type = 'button'; b.addEventListener('click', () => { cfg.enabled = true; saveCfg(); syncSettings(); openSenders(); });
    row.appendChild(tx); row.appendChild(b); g.parentNode.appendChild(row);
  }

  /* ---------- راه‌اندازی ---------- */
  pickShared();
  function init() {
    injectBtn(); wireSettings(); updateBanner(); injectNativeRow();
    if (Native) {
      const go = () => { if (D.visibilityState === 'visible' && !D.documentElement.classList.contains('auth-pending')) scanNative(false); };
      D.addEventListener('visibilitychange', go); setInterval(go, 45000); setTimeout(go, 2500);
    }
    const v = D.getElementById('view-finance');
    if (v) {
      let was = v.classList.contains('active'); let shown = false;
      new MutationObserver(() => {
        const now = v.classList.contains('active');
        if (now && !was) {
          injectBtn(); updateBanner();
          let later = false; try { later = sessionStorage.getItem('emp_sms_later') === '1'; } catch (e) {}
          if (!cfg.enabled && !cfg.asked && !later) setTimeout(optIn, 600);
          else if (cfg.enabled && inbox.length && !shown) { shown = true; setTimeout(() => open(), 500); }
        }
        was = now;
      }).observe(v, { attributes: true, attributeFilter: ['class'] });
    }
    // بعد از رفع قفل ورود، اگر پیامی اشتراک‌گذاری شده بود پردازش شود
    const tryShared = () => { if (!D.documentElement.classList.contains('auth-pending')) { handleShared(); return true; } return false; };
    if (!tryShared()) { const iv = setInterval(() => { if (tryShared()) clearInterval(iv); }, 400); setTimeout(() => clearInterval(iv), 120000); }
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', () => setTimeout(init, 0)); else setTimeout(init, 0);
  window.EmpSms = { open, intake, editTx };
})();
