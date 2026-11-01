/* File: sms-parser.js | Version: 1.1.0 | Date: 2026-11-01
   تحلیل پیامک بانکی ایرانی روی خود دستگاه. متن پیامک هرگز ذخیره یا ارسال نمی‌شود؛
   فقط مبلغ (ریال)، بانک، نوع (واریز/برداشت) و تاریخ و ساعت نگه داشته می‌شود. */
(function (root) {
  'use strict';
  const toEn = s => String(s || '')
    .replace(/[۰-۹]/g, d => String(d.charCodeAt(0) - 1776)).replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 1632))
    .replace(/[٬،]/g, ',').replace(/٫/g, '.').replace(/[\u200c\u200f\u200e\u202a-\u202e\u00a0]/g, ' ')
    .replace(/[يى]/g, 'ی').replace(/ك/g, 'ک').replace(/[أإ]/g, 'ا').replace(/ة/g, 'ه')
    // جداکنندهٔ هزارگان «/» در بعضی بانک‌ها (مثل 1/200/000)؛ تاریخ‌ها (گروه‌های ۱ تا ۲ رقمی) دست‌نخورده می‌مانند
    .replace(/(?<![\d\/])(\d{1,3}(?:\/\d{3})+)(?![\d\/])/g, m => m.replace(/\//g, ','));

  // نام بانک‌ها و نام‌های رایج پیامک‌فرستنده (حروف لاتین یا فارسی)
  const BANKS = [
    ['ملی', ['بانک ملی', 'ملی ایران', 'bmi', 'melli', 'bam']], ['ملت', ['بانک ملت', 'mellat', 'bankmellat', 'ملت']],
    ['صادرات', ['صادرات', 'saderat', 'bsi.ir']], ['تجارت', ['تجارت', 'tejarat', 'tejaratbank']], ['سپه', ['بانک سپه', 'sepah', 'سپه']],
    ['کشاورزی', ['کشاورزی', 'keshavarzi', 'bki']], ['مسکن', ['بانک مسکن', 'maskan', 'مسکن']], ['پارسیان', ['پارسیان', 'parsian']],
    ['پاسارگاد', ['پاسارگاد', 'pasargad', 'bpi']], ['سامان', ['بانک سامان', 'saman', 'سامان']], ['رفاه', ['رفاه', 'refah']],
    ['اقتصاد نوین', ['اقتصاد نوین', 'en bank', 'enbank', 'eghtesad']], ['شهر', ['بانک شهر', 'shahr']], ['سینا', ['بانک سینا', 'sina']],
    ['آینده', ['بانک آینده', 'ayandeh', 'آینده']], ['دی', ['بانک دی', 'bank day', 'dey']], ['سرمایه', ['بانک سرمایه', 'sarmayeh']],
    ['انصار', ['انصار', 'ansar']], ['مهر اقتصاد', ['مهر اقتصاد', 'مهراقتصاد']], ['قوامین', ['قوامین', 'ghavamin']],
    ['توسعه تعاون', ['توسعه تعاون', 'tose-e taavon', 'ttbank']], ['توسعه صادرات', ['توسعه صادرات', 'edbi']], ['صنعت و معدن', ['صنعت و معدن', 'bim']],
    ['پست بانک', ['پست بانک', 'postbank']], ['گردشگری', ['گردشگری', 'tourism']], ['ایران زمین', ['ایران زمین', 'iranzamin']],
    ['خاورمیانه', ['خاورمیانه', 'middle east']], ['کارآفرین', ['کارآفرین', 'karafarin']], ['حکمت ایرانیان', ['حکمت ایرانیان', 'hekmat']],
    ['قرض‌الحسنه مهر', ['قرض الحسنه مهر', 'مهر ایران', 'mehr']], ['قرض‌الحسنه رسالت', ['رسالت', 'resalat']], ['بلو', ['بلو', 'blu']],
    ['ثامن', ['ثامن', 'samen']], ['کوثر', ['کوثر', 'kosar']], ['شهر (آینده)', []]
  ].filter(b => b[1].length);

  // فیلتر قاطع پیامک‌های رمز و کد (برگرفته از مستند تیم فنی): اگر این عبارت‌ها باشد، هرگز تراکنش نیست
  const OTP_BLACKLIST_V2 = /(رمز\s*پویا|رمز\s*دوم|رمز\s*یکبار\s*مصرف|رمز\s*یک\s*بار\s*مصرف|کد\s*تایید|کد\s*ورود|کد\s*امنیتی|محرمانه|کد\s*فعال\s*سازی|پویا|otp|verification|security\s*code|passcode|pin\s*code)/i;
  const OTP_WORDS = /(رمز\s*(پویا|یکبار|دوم|اول)|کد\s*(تایید|تأیید|فعال|ورود|امنیتی)|cvv2?|otp|پسورد|یکبار\s*مصرف)/i;
  const OUT_WORDS = ['برداشت', 'کاهش', 'خرید', 'پرداخت', 'کسر', 'انتقال از', 'پایا از', 'حواله', 'کارمزد', 'بدهکار', 'قسط', 'پرداختی', 'خروج', 'انتقال وجه', 'کارت به کارت از', 'کارت‌به‌کارت از', 'ساتنا از'];
  const IN_WORDS = ['واریز', 'افزایش', 'شارژ شد', 'دریافت', 'بستانکار', 'سود', 'حقوق', 'انتقال به', 'پایا به', 'برگشت', 'ورود', 'ساتنا به', 'عودت', 'یارانه'];
  const AMOUNT_RE = /([+\-−–]?)\s*(\d{1,3}(?:,\d{3})+|\d{4,})(?!\d)(?:\s*(ریال|تومان|ر\b|تومن))?([+\-−–]?)/g;

  function g2j(gy, gm, gd) {
    const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days = 355666 + 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) + gd + gdm[gm - 1];
    let jy = -1595 + 33 * Math.floor(days / 12053); days %= 12053;
    jy += 4 * Math.floor(days / 1461); days %= 1461;
    if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
    const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
    return { jy, jm, jd };
  }
  const pad = n => String(n).padStart(2, '0');

  function findBank(text, sender) {
    const hay = (' ' + toEn(sender || '') + ' ' + toEn(text)).toLowerCase();
    let best = null;
    for (const [name, aliases] of BANKS) {
      for (const a of aliases) {
        const i = hay.indexOf(a.toLowerCase());
        if (i !== -1 && (!best || a.length > best.len || (a.length === best.len && i < best.i))) best = { name, len: a.length, i };
      }
    }
    return best ? best.name : '';
  }

  function findDateTime(t) {
    let date = null, time = '';
    const dm = /(?:^|[^\d])(\d{2,4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/.exec(t);
    if (dm) {
      let y = +dm[1], m = +dm[2], d = +dm[3];
      if (y >= 1700) { const j = g2j(y, m, d); date = j; }
      else if (y < 100) { date = { jy: 1400 + y, jm: m, jd: d }; }
      else date = { jy: y, jm: m, jd: d };
      if (date.jm < 1 || date.jm > 12 || date.jd < 1 || date.jd > 31) date = null;
    }
    const tm = /(?:^|[^\d])([01]?\d|2[0-3])[:٫.]([0-5]\d)(?::[0-5]\d)?(?!\d)/.exec(t.replace(dm ? dm[0] : '', ' '));
    if (tm) time = pad(tm[1]) + ':' + tm[2];
    return { date, time };
  }

  // قاعده‌های آموخته‌شده توسط کاربر: { label, type, bank }
  function applyLearned(t, rules) {
    for (const r of rules || []) {
      if (!r || !r.label) continue;
      const i = t.indexOf(toEn(r.label));
      if (i === -1) continue;
      const rest = t.slice(i + r.label.length, i + r.label.length + 40);
      const m = /(\d{1,3}(?:,\d{3})+|\d{4,})/.exec(rest);
      if (m) return { amount: Number(m[1].replace(/,/g, '')), type: r.type === 'income' ? 'income' : 'expense', bank: r.bank || '', learned: true };
    }
    return null;
  }

  function parseOne(raw, opts) {
    opts = opts || {};
    const t = toEn(raw).trim();
    if (t.length < 12) return null;
    if (OTP_BLACKLIST_V2.test(t)) return null;
    if (OTP_WORDS.test(t) && !/(برداشت|واریز|مانده|موجودی)/.test(t)) return null; // پیامک رمز و تبلیغ نادیده گرفته می‌شود
    const bank = findBank(t, opts.sender);
    const dt = findDateTime(t);

    // مبلغ‌ها را پیدا کن و آنهایی که «مانده/موجودی» هستند کنار بگذار
    const cands = []; let m;
    AMOUNT_RE.lastIndex = 0;
    while ((m = AMOUNT_RE.exec(t))) {
      const before = t.slice(Math.max(0, m.index - 14), m.index);
      const raw1 = m[2].replace(/,/g, '');
      if (raw1.length >= 14) continue; // شماره کارت/حساب
      if (/(?:^|\D)\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/.test(t.slice(m.index - 5, m.index + m[0].length + 5)) && !m[2].includes(',')) continue;
      const isBalance = /(مانده|موجودی|مان\s*[:ـ]?|balance)\s*[:ـ\-]?\s*$/i.test(before);
      const sign = (m[1] || m[4] || '').replace(/[−–]/g, '-');
      let v = Number(raw1);
      const unit = (m[3] || '').replace('تومن', 'تومان');
      if (unit === 'تومان') v *= 10;
      cands.push({ v, sign, isBalance, idx: m.index, before, unit });
    }
    // مانده فقط برای جدا کردن دو تراکنش هم‌مبلغ هم‌دقیقه استفاده می‌شود؛ از آن فقط یک چکیدهٔ ۱۶ بیتی نگه می‌داریم (قابل بازگشت به مانده نیست)
    const balC = cands.find(c => c.isBalance); let bh = '';
    if (balC) { let h = 2166136261; const bs = String(Math.round(balC.v)); for (let i = 0; i < bs.length; i++) { h ^= bs.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } bh = (h & 0xffff).toString(16).padStart(4, '0'); }
    const learned = applyLearned(t, opts.rules);
    let amount = 0, type = '', how = '';
    if (learned) { amount = learned.amount; type = learned.type; how = 'learned'; }
    else {
      const pool = cands.filter(c => !c.isBalance);
      if (!pool.length) return null;
      // اولویت با مبلغی که کنار کلمهٔ برداشت/واریز یا علامت +/- آمده
      let pick = pool.find(c => c.sign) || pool.find(c => /(برداشت|واریز|خرید|پرداخت|کسر|مبلغ|انتقال|دریافت|بستانکار|بدهکار|حقوق)\W*[:ـ]?\s*$/.test(c.before)) || pool[0];
      amount = pick.v;
      if (pick.sign === '+') type = 'income'; else if (pick.sign === '-') type = 'expense';
      if (!type) {
        const lower = t;
        let firstIn = -1, firstOut = -1;
        IN_WORDS.forEach(w => { const i = lower.indexOf(w); if (i !== -1 && (firstIn === -1 || i < firstIn)) firstIn = i; });
        OUT_WORDS.forEach(w => { const i = lower.indexOf(w); if (i !== -1 && (firstOut === -1 || i < firstOut)) firstOut = i; });
        if (firstIn !== -1 && (firstOut === -1 || firstIn < firstOut)) type = 'income';
        else if (firstOut !== -1) type = 'expense';
      }
      how = 'builtin';
    }
    if (!amount || amount < 100 || !type) return null;
    const now = opts.at ? new Date(Number(opts.at)) : new Date();
    const j = dt.date || g2j(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const time = dt.time || ((dt.date && !opts.at) ? '' : pad(now.getHours()) + ':' + pad(now.getMinutes()));
    const dateKey = j.jy + '/' + pad(j.jm) + '/' + pad(j.jd);
    return { type, amount: Math.round(amount), bank: learned && learned.bank ? learned.bank : bank, dateKey, time, dateFromSms: !!dt.date || !!opts.at, how, bh };
  }

  // چند پیامک چسبانده‌شده را جدا می‌کند (خط خالی، خط جداکننده، یا شروع دوبارهٔ نام بانک)
  function splitMessages(text) {
    const t = String(text || '').replace(/\r/g, '').trim();
    if (!t) return [];
    let parts = t.split(/\n\s*\n+|\n[-=_*]{3,}\n/).map(x => x.trim()).filter(Boolean);
    if (parts.length === 1) {
      const lines = t.split('\n'); const out = []; let cur = [];
      lines.forEach(l => {
        if (/^\s*(بانک\s+\S+|bank\s*\S+)/i.test(l) && cur.length && /(برداشت|واریز|مانده|خرید|پرداخت)/.test(cur.join(' '))) { out.push(cur.join('\n')); cur = []; }
        cur.push(l);
      });
      if (cur.length) out.push(cur.join('\n'));
      parts = out;
    }
    return parts;
  }

  function parseMany(text, opts) {
    const res = [];
    splitMessages(text).forEach(p => { const r = parseOne(p, opts); if (r) res.push(r); });
    return res;
  }
  // امضای تراکنش برای تشخیص تکراری بودن (بدون ذخیرهٔ متن)
  const fingerprintLegacy = r => [r.type, r.amount, r.dateKey, r.time || '', r.bank || ''].join('|');
  const fingerprint = r => fingerprintLegacy(r) + (r.bh ? '|' + r.bh : '');

  // آموزش: عددهای متن را برای انتخاب کاربر برمی‌گرداند
  function numberTokens(raw) {
    const t = toEn(raw), out = []; let m; const re = /(\d{1,3}(?:,\d{3})+|\d{4,})/g;
    while ((m = re.exec(t))) { if (m[1].replace(/,/g, '').length >= 14) continue; out.push({ text: m[1], value: Number(m[1].replace(/,/g, '')), before: t.slice(Math.max(0, m.index - 14), m.index).replace(/[\n:ـ\-]+/g, ' ').trim() }); }
    return out;
  }
  function labelBefore(before) { const w = String(before || '').trim().split(/\s+/).slice(-2).join(' '); return w.length >= 2 ? w : ''; }

  const api = { parseOne, parseMany, splitMessages, fingerprint, fingerprintLegacy, numberTokens, labelBefore, BANK_NAMES: BANKS.map(b => b[0]), g2j };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SmsParser = api;
})(typeof window !== 'undefined' ? window : globalThis);
