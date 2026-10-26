/* File: icons.js | Version: 1.0.0 | Date: 2026-10-26
   آیکون‌های مینیمال تک‌رنگ (سبک خطی، شبیه سامسونگ/آیفون) به‌جای ایموجی‌ها.
   همهٔ ایموجی‌های داخل صفحه (حتی متن‌هایی که بعداً با جاوااسکریپت ساخته می‌شوند) خودکار به آیکون تبدیل می‌شوند. */
(function () {
  'use strict';
  const P = {
    'check-circle': '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.7 2.7L16 9.5"/>',
    bank: '<path d="M3 10l9-6 9 6"/><path d="M5.5 10v8M9.8 10v8M14.2 10v8M18.5 10v8M3 20h18"/>',
    bell: '<path d="M6 16v-5a6 6 0 0112 0v5l1.5 2h-15z"/><path d="M10 20.5a2 2 0 004 0"/>',
    'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.2M12 16.3v.1"/>',
    alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4.2M12 17.2v.1"/>',
    ban: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15V6.5A2.5 2.5 0 017.5 4H15"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    paste: '<rect x="6" y="4" width="12" height="16" rx="2.5"/><path d="M12 9.5v5.5M9.5 12.8L12 15.3l2.5-2.5"/>',
    moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/>',
    sunset: '<path d="M5 18a7 7 0 0114 0"/><path d="M3 18h18M12 6v3M5.6 10.6L7 12M18.4 10.6L17 12"/>',
    pause: '<circle cx="12" cy="12" r="9"/><path d="M10 9v6M14 9v6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    refresh: '<path d="M20 11a8 8 0 00-14-4.5L4 9"/><path d="M4 4v5h5"/><path d="M4 13a8 8 0 0014 4.5l2-2.5"/><path d="M20 20v-5h-5"/>',
    card: '<rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M3 10h18M7 15h4"/>',
    bolt: '<path d="M13 3L5.5 13.5H11L10 21l7.5-10.5H12z"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    pencil: '<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 013 3L8 19z"/><path d="M14.5 6.5l3 3"/>',
    cash: '<rect x="3" y="6.5" width="18" height="11" rx="2.5"/><circle cx="12" cy="12" r="2.4"/>',
    coin: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>',
    pin: '<path d="M12 21v-6"/><path d="M8 4h8l-1 6 3 3H6l3-3z"/>',
    save: '<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2.5"/><path d="M11 18h2"/>',
    sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
    download: '<path d="M12 4v11M7.5 10.5L12 15l4.5-4.5M5 19.5h14"/>',
    upload: '<path d="M12 16V5M7.5 9.5L12 5l4.5 4.5M5 19.5h14"/>',
    chart: '<path d="M5 20V11M12 20V4M19 20v-6"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    medal: '<circle cx="12" cy="9" r="5"/><path d="M8.5 13.5L7 21l5-3 5 3-1.5-7.5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0115 0"/>',
    palette: '<path d="M12 4a8 8 0 100 16c1.4 0 2-.8 2-1.8 0-1.2-1-1.4-1-2.4 0-.9.7-1.3 1.6-1.3H17a3 3 0 003-3C20 7 16.4 4 12 4z"/><path d="M8 11h.01M11 7.5h.01M15.5 8.5h.01"/>',
    access: '<circle cx="12" cy="5" r="1.8"/><path d="M5 9l7 1.5L19 9M12 10.5V15l-3 5.5M12 15l3 5.5"/>',
    building: '<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M9 8h.01M15 8h.01M9 12h.01M15 12h.01M10 21v-4h4v4"/>',
    cart: '<path d="M3 4h2l2 11h11l2-8H6"/><circle cx="9.5" cy="19" r="1.2"/><circle cx="16.5" cy="19" r="1.2"/>',
    car: '<path d="M4 15l1.5-5A2 2 0 017.4 8.6h9.2a2 2 0 011.9 1.4L20 15v3H4z"/><path d="M8 15.5h.01M16 15.5h.01"/>',
    home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
    medical: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M12 8.5v7M8.5 12h7"/>',
    coffee: '<path d="M5 9h11v5a4 4 0 01-4 4H9a4 4 0 01-4-4z"/><path d="M16 10h1.5a2 2 0 010 4H16M8 4v2M12 4v2"/>',
    briefcase: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7M3 13h18"/>',
    gift: '<rect x="4" y="9" width="16" height="11" rx="2.5"/><path d="M12 9v11M3 9h18M12 9c-2.5 0-3.8-1-3.8-2.5S10.5 4.5 12 9zM12 9c2.5 0 3.8-1 3.8-2.5S13.5 4.5 12 9z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>'
  };
  const M = {
    '✅': 'check-circle', '🎉': 'check-circle', '🏦': 'bank', '🔔': 'bell', '🚨': 'alert-circle', '⚠': 'alert',
    '⛔': 'ban', '🚫': 'ban', '📋': 'copy', '📅': 'calendar', '📥': 'paste', '🌙': 'moon', '☀': 'sun',
    '🌤': 'sunset', '🏖': 'pause', '⏰': 'clock', '🕒': 'clock', '🕗': 'clock', '⏱': 'clock', '⏳': 'clock',
    '🚒': 'clock', '🔄': 'refresh', '💳': 'card', '⚡': 'bolt', '➕': 'plus', '➖': 'minus', '✏': 'pencil',
    '💵': 'cash', '💰': 'cash', '💸': 'cash', '🪙': 'coin', '📌': 'pin', '💾': 'save', '📱': 'phone',
    '🛠': 'sliders', '⚙': 'sliders', '⬇': 'download', '⬆': 'upload', '📊': 'chart', '📈': 'trend',
    '🥇': 'medal', '🥈': 'medal', '👤': 'user', '🎨': 'palette', '♿': 'access', '🏢': 'building',
    '🏭': 'building', '🛒': 'cart', '🚗': 'car', '🏠': 'home', '🏥': 'medical', '☕': 'coffee',
    '💼': 'briefcase', '🎁': 'gift', '✕': 'x'
  };
  const RE = new RegExp('(?:' + Object.keys(M).join('|') + ')\\uFE0F?', 'gu');
  const REO = new RegExp('(?:' + Object.keys(M).join('|') + ')\\uFE0F?\\s?', 'gu'); // برای حذف کامل (option و اعلان‌ها)
  const SKIP = /^(SCRIPT|STYLE|TEXTAREA|TITLE|SVG|SYMBOL|NOSCRIPT)$/i;
  const NS = 'http://www.w3.org/2000/svg';

  // پاک‌کردن ایموجی از متن ساده (اعلان‌های سیستم، فایل تقویم)
  window.stripEmoji = s => String(s == null ? '' : s).replace(REO, '').trim();

  const sprite = document.createElementNS(NS, 'svg');
  sprite.setAttribute('width', '0'); sprite.setAttribute('height', '0'); sprite.setAttribute('aria-hidden', 'true');
  sprite.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  sprite.innerHTML = Object.keys(P).map(k => '<symbol id="ic-' + k + '" viewBox="0 0 24 24">' + P[k] + '</symbol>').join('');
  document.body.appendChild(sprite);

  function icon(name) {
    const s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
    const u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#ic-' + name); s.appendChild(u); return s;
  }
  function fixNode(n) {
    const v = n.nodeValue; if (!v) return;
    const p = n.parentNode; if (!p || SKIP.test(p.nodeName) || (p.closest && p.closest('[data-noic]'))) return;
    RE.lastIndex = 0; if (!RE.test(v)) return; RE.lastIndex = 0;
    if (p.nodeName === 'OPTION') { n.nodeValue = v.replace(REO, ''); return; }
    const f = document.createDocumentFragment(); let last = 0, m;
    while ((m = RE.exec(v))) {
      if (m.index > last) f.appendChild(document.createTextNode(v.slice(last, m.index)));
      f.appendChild(icon(M[m[0].replace(/\uFE0F/g, '')])); last = m.index + m[0].length;
    }
    if (last < v.length) f.appendChild(document.createTextNode(v.slice(last)));
    p.replaceChild(f, n);
  }
  function fixTree(root) {
    if (!root) return;
    if (root.nodeType === 3) return fixNode(root);
    if (root.nodeType !== 1 || SKIP.test(root.nodeName)) return;
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), list = [];
    while (w.nextNode()) list.push(w.currentNode);
    list.forEach(fixNode);
  }
  fixTree(document.body);
  new MutationObserver(ms => {
    for (const m of ms) {
      if (m.type === 'characterData') fixNode(m.target);
      else m.addedNodes.forEach(fixTree);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true });
})();
