/* The interactive catalogue page: search, filters, quantities and an order you send by email or copy.
   This one file runs both in the preview and inside the downloaded page. It never sends anything anywhere:
   an order only leaves through the buyer's own email program or the clipboard. All text goes in with textContent. */
(function () {
  'use strict';
  var node = document.getElementById('lt-data'); if (!node) return;
  var D; try { D = JSON.parse(node.textContent); } catch (e) { return; }
  var O = D.opts || {}, B = D.brand || {}, items = D.items || [];
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'text') n.textContent = attrs[k]; else if (k === 'class') n.className = attrs[k]; else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]); else if (attrs[k] != null && attrs[k] !== false) n.setAttribute(k, attrs[k] === true ? '' : attrs[k]); }
    (kids || []).forEach(function (c) { if (c != null) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  }
  var qty = {}, q = '', fType = '', fGroup = '', onlyAvail = false, sort = 'az';
  function num(p) { var m = /(-?\d+(?:[.,]\d+)?)/.exec(String(p || '').replace(/,(?=\d{3}\b)/g, '')); return m ? parseFloat(m[1].replace(',', '.')) : null; }
  function cur(p) { var m = /^[^\d-]*/.exec(String(p || '')); return m ? m[0].trim() : ''; }
  var money = function (n, c) { return (c || '') + n.toFixed(2); };
  function canOrder(it) { return O.order !== 'none' && it.available !== 0 && it.offer !== 'Info' ; }
  function max(it) { return O.stockMode === 'exact' && typeof it.available === 'number' && it.available > 0 ? it.available : 99; }

  /* header and quick links */
  var head = $('#lt-head');
  if (B.logo) head.append(el('img', { class: 'brand-logo', src: B.logo, alt: B.name ? B.name + ' logo' : '' }));
  var hb = el('div', { class: 'brand-text' });
  if (B.name) hb.append(el('p', { class: 'eyebrow', text: B.name }));
  hb.append(el('h1', { text: O.title || (D.list && D.list.name) || 'Catalogue' }));
  if (B.tagline) hb.append(el('p', { class: 'tag', text: B.tagline }));
  var area = B.area || (D.sender && D.sender.area);
  if (area) hb.append(el('p', { class: 'meta', text: area }));
  if (O.intro) hb.append(el('p', { class: 'intro', text: O.intro }));
  head.append(hb);
  function ico(d) { var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); s.append(p); return s; }
  var IC = { mail: 'M3 6h18v12H3zM3 7l9 7 9-7', phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z', web: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18', share: 'M4 12v7h16v-7M12 3v12M8 7l4-4 4 4', info: 'M5 4h14v16H5zM9 9h6M9 13h6M9 17h3' };
  function webHref(v) { v = String(v || '').trim(); if (!v) return ''; if (/^https?:\/\//i.test(v)) return v; if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i.test(v)) return 'https://' + v; return ''; }
  if (O.links !== false) {
    var nav = $('#lt-links');
    function lk(cls, icn, label, href, ext) { nav.append(el('a', { class: cls, href: href, rel: ext ? 'noopener noreferrer' : null, target: ext ? '_blank' : null }, [ico(IC[icn]), label])); }
    var em = String(B.email || '').trim(); if (/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(em)) lk('main', 'mail', 'Email us', 'mailto:' + encodeURIComponent(em).replace(/%40/g, '@'));
    var ph = String(B.phone || '').replace(/[^\d+]/g, ''); if (ph.replace(/\D/g, '').length >= 6) lk('', 'phone', 'Call ' + B.phone, 'tel:' + ph);
    var wh = webHref(B.web); if (wh) lk('', 'web', 'Website', wh, true);
    String(B.social || '').split(/[\s,]+/).filter(Boolean).slice(0, 6).forEach(function (tok) {
      var h = webHref(tok); if (!h) return; var host = ''; try { host = new URL(h).hostname.replace(/^www\./, '').toLowerCase(); } catch (e) { return; }
      var names = { 'facebook.com': 'Facebook', 'fb.com': 'Facebook', 'instagram.com': 'Instagram', 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'tiktok.com': 'TikTok', 'x.com': 'X', 'twitter.com': 'X', 'pinterest.com': 'Pinterest', 'etsy.com': 'Etsy shop', 'ebay.com.au': 'eBay shop', 'ebay.com': 'eBay shop' };
      var nm = ''; for (var k in names) if (host === k || host.slice(-k.length - 1) === '.' + k) { nm = names[k]; break; }
      lk('', nm === 'Etsy shop' || nm === 'eBay shop' ? 'web' : 'share', nm || 'Follow us', h, true);
    });
    lk('', 'info', 'Postage and terms', '#terms');
    var ft = document.getElementById('terms');
    if (ft) { var fl = el('p', { class: 'flinks' }); nav.querySelectorAll('a').forEach(function (a) { var h = a.getAttribute('href'); if (/^https?:/.test(h)) fl.append(el('a', { href: h, rel: 'noopener noreferrer', target: '_blank', text: a.textContent }), ' · '); });
      if (fl.lastChild) { fl.removeChild(fl.lastChild); ft.insertBefore(fl, ft.firstChild); } }
  }

  /* tools */
  var types = [], groups = [];
  items.forEach(function (it) { if (it.offer && it.offer !== 'Products' && types.indexOf(it.offer) < 0) types.push(it.offer); var g = it.group || (it.kind === 'animal' ? 'Animals' : it.kind === 'product' ? 'Products' : 'Plants'); if (groups.indexOf(g) < 0) groups.push(g); });
  var tools = $('#lt-tools');
  var search = el('input', { type: 'search', placeholder: 'Search the catalogue', 'aria-label': 'Search the catalogue', oninput: function () { q = this.value.toLowerCase(); draw(); } });
  if (O.search !== false) tools.append(el('label', { class: 'f grow' }, [el('span', { class: 'sr', text: 'Search' }), search]));
  function sel(label, opts, set) {
    var s = el('select', { 'aria-label': label, onchange: function () { set(this.value); draw(); } }, [el('option', { value: '', text: label })]);
    opts.forEach(function (o) { s.append(el('option', { value: o, text: o })); }); return el('label', { class: 'f' }, [s]);
  }
  if (types.length > 1 && O.filter !== false) tools.append(sel('All offers', types, function (v) { fType = v; }));
  var chipBox = null;
  if (groups.length > 1 && O.jump !== false && groups.length <= 14) {
    chipBox = el('div', { id: 'lt-chips', role: 'group', 'aria-label': 'Categories' });
    ['All'].concat(groups).forEach(function (g) { chipBox.append(el('button', { type: 'button', class: 'chip', 'data-g': g === 'All' ? '' : g, 'aria-pressed': g === 'All' ? 'true' : 'false', text: g, onclick: function () { fGroup = this.getAttribute('data-g'); chipBox.querySelectorAll('.chip').forEach(function (c) { c.setAttribute('aria-pressed', String(c.getAttribute('data-g') === fGroup)); }); draw(); } })); });
  } else if (groups.length > 1) tools.append(sel('All kinds', groups, function (v) { fGroup = v; }));
  var s2 = el('select', { 'aria-label': 'Sort', onchange: function () { sort = this.value; draw(); } }, [el('option', { value: 'az', text: 'A to Z' }), el('option', { value: 'plow', text: 'Price, low to high' }), el('option', { value: 'phigh', text: 'Price, high to low' })]);
  if (O.prices !== false && O.sort !== false) tools.append(el('label', { class: 'f' }, [s2]));
  if (O.instock !== false) tools.append(el('label', { class: 'chk' }, [el('input', { type: 'checkbox', onchange: function () { onlyAvail = this.checked; draw(); } }), ' In stock only']));
  var count = el('p', { class: 'count', 'aria-live': 'polite' }); tools.append(count);
  if (chipBox) tools.append(chipBox);
  if (O.prices !== false && O.priceNote) tools.append(el('p', { class: 'pnote', style: 'flex-basis:100%', text: O.priceNote }));

  /* cards */
  var grid = $('#lt-grid');
  function visible() {
    var r = items.filter(function (it) {
      if (fType && it.offer !== fType) return false;
      if (fGroup && (it.group || (it.kind === 'animal' ? 'Animals' : it.kind === 'product' ? 'Products' : 'Plants')) !== fGroup) return false;
      if (onlyAvail && it.available === 0) return false;
      if (q && [it.name, it.variety, it.species, it.description, it.note, it.group].join(' ').toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
    r.sort(function (a, b) {
      if (sort === 'az') return String(a.name).localeCompare(String(b.name));
      var pa = num(a.price), pb = num(b.price); if (pa == null) pa = 1e9; if (pb == null) pb = 1e9;
      return sort === 'plow' ? pa - pb : pb - pa;
    });
    return r;
  }
  function stepper(it) {
    var k = it.key, val = el('output', { text: String(qty[k] || 0), 'aria-live': 'polite' });
    function set(n) { n = Math.max(0, Math.min(max(it), n)); if (n) qty[k] = n; else delete qty[k]; val.textContent = String(n); bar(); }
    return el('div', { class: 'step', role: 'group', 'aria-label': 'Quantity for ' + it.name }, [
      el('button', { type: 'button', 'aria-label': 'One fewer', text: '−', onclick: function () { set((qty[k] || 0) - 1); } }), val,
      el('button', { type: 'button', 'aria-label': 'One more', text: '+', onclick: function () { set((qty[k] || 0) + 1); } })]);
  }
  function card(it) {
    var out = it.available === 0;
    var c = el('article', { class: 'card' + (out ? ' out' : '') });
    var rib = O.offers !== false && it.offer && ['Seed', 'Sell', 'Sale', 'Products'].indexOf(it.offer) < 0 ? it.offer : '';
    if (rib && O.photos !== false && it.photo) c.append(el('span', { class: 'ribbon', text: rib }));
    if (O.photos !== false && it.photo) c.append(el('img', { class: 'ph', src: it.photo, alt: it.name, loading: 'lazy' }));
    var b = el('div', { class: 'body' }, [rib && !(O.photos !== false && it.photo) ? el('span', { class: 'ribbon inl', text: rib }) : null, el('h2', { text: it.name })]);
    if (it.species && O.species !== false) b.append(el('p', { class: 'sp', text: it.species }));
    if (it.description && O.desc !== false) b.append(el('p', { class: 'ds', text: it.description }));
    var facts = [it.per || (it.bag ? it.bag + ' per pack' : ''), it.form, it.hybrid ? 'F1 hybrid' : ''].filter(Boolean).join(' · ');
    if (facts && O.facts !== false) b.append(el('p', { class: 'fa', text: facts }));
    if (it.note && O.notes !== false) b.append(el('p', { class: 'nt', text: it.note }));
    var foot = el('div', { class: 'foot' });
    if (O.prices !== false && it.price) foot.append(el('span', { class: 'price', text: it.price }));
    var badge = out ? 'Sold out' : (O.stockMode === 'off' || !it.stock ? '' : (O.stockMode === 'exact' && typeof it.available === 'number' ? 'Only ' + it.available + ' left' : 'Limited supply'));
    if (badge) foot.append(el('span', { class: 'badge' + (out ? ' bad' : ''), text: badge }));
    if (canOrder(it)) foot.append(stepper(it));
    b.append(foot); c.append(b); return c;
  }
  function draw() {
    var r = visible(); grid.textContent = '';
    r.forEach(function (it) { grid.append(card(it)); });
    count.textContent = r.length + ' of ' + items.length + (items.length === 1 ? ' item' : ' items');
    if (!r.length) grid.append(el('p', { class: 'none', text: 'Nothing matches. Try clearing the search or filters.' }));
  }

  /* the order */
  var obar = $('#lt-order');
  function lines() {
    return items.filter(function (it) { return qty[it.key]; }).map(function (it) { return { it: it, n: qty[it.key], p: num(it.price) }; });
  }
  function total(ls) {
    var t = 0, c = '', ok = O.prices !== false && O.total !== false && ls.length;
    ls.forEach(function (l) { if (l.p == null || !/\d/.test(l.it.price)) { if (/^free$/i.test(l.it.price)) return; ok = false; return; } t += l.p * l.n; c = c || cur(l.it.price); });
    return ok ? money(t, c) : '';
  }
  function bar() {
    var ls = lines(), n = ls.reduce(function (a, l) { return a + l.n; }, 0);
    obar.hidden = !n; if (!n) return;
    obar.textContent = '';
    var t = total(ls);
    obar.append(el('span', { text: n + (n === 1 ? ' item' : ' items') + (t ? ' · about ' + t : '') }), el('button', { type: 'button', class: 'go', text: 'Review order', onclick: review }));
  }
  function orderText(who) {
    var ls = lines(), t = total(ls), L = ['Order for ' + (B.name || (D.sender && D.sender.name) || O.title || 'the catalogue'), ''];
    ls.forEach(function (l) { L.push(l.n + ' x ' + l.it.name + (l.it.per ? ' (' + l.it.per + ')' : '') + (O.prices !== false && l.it.price ? ', ' + l.it.price : '')); });
    if (t) L.push('', 'Estimated total: ' + t + ' (postage extra unless stated)');
    L.push('', 'From: ' + (who.name || ''), 'Email: ' + (who.email || ''));
    [['Phone', 'phone'], ['Street', 'street'], ['Suburb', 'suburb'], ['State', 'state'], ['Postcode', 'postcode'], ['Country', 'country']].forEach(function (r) { if (who[r[1]]) L.push(r[0] + ': ' + who[r[1]]); });
    if (who.note) L.push('', 'Note: ' + who.note);
    return L.join('\n');
  }
  function review() {
    var d = $('#lt-dlg'); d.textContent = '';
    var ls = lines(), t = total(ls);
    var f = {};
    function fld(key, label, type, ph) { var i = type === 'area' ? el('textarea', { rows: '3', placeholder: ph || '' }) : el('input', { type: type || 'text', placeholder: ph || '', autocomplete: key === 'email' ? 'email' : key === 'name' ? 'name' : 'off' }); f[key] = i; return el('label', { class: 'fl' }, [el('span', { text: label }), i]); }
    var list = el('ul', { class: 'ol' }); ls.forEach(function (l) { list.append(el('li', {}, [el('span', { text: l.n + ' × ' + l.it.name }), O.prices !== false && l.it.price ? el('span', { class: 'r', text: l.it.price }) : null])); });
    var msg = el('p', { class: 'hint' });
    function who() { var w = {}; ['name', 'email', 'phone', 'street', 'suburb', 'state', 'postcode', 'country', 'note'].forEach(function (k) { w[k] = f[k].value.trim(); }); return w; }
    function need() { var w = who(); if (!w.name || !w.email) { msg.textContent = 'Please add your name and email so the seller can reply.'; return null; } if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(w.email)) { msg.textContent = 'That email address does not look right.'; return null; } msg.textContent = ''; return w; }
    var acts = el('div', { class: 'acts' });
    if (B.email) acts.append(el('button', { type: 'button', class: 'go', text: 'Send order by email', onclick: function () {
      var w = need(); if (!w) return; var body = orderText(w);
      var href = 'mailto:' + B.email + '?subject=' + encodeURIComponent('Order from ' + w.name) + '&body=' + encodeURIComponent(body);
      if (href.length > 1900) { msg.textContent = 'This order is long for an email link. Use Copy order and paste it into an email to ' + B.email + '.'; return; }
      location.href = href; msg.textContent = 'Your email program should open with the order ready to send.';
    } }));
    acts.append(el('button', { type: 'button', text: 'Download order file', onclick: function () {
      var w = need(); if (!w) return;
      var file = { app: 'lt-order', v: 1, at: new Date().toISOString().slice(0, 10), shop: B.name || (D.sender && D.sender.name) || '', customer: { name: w.name, email: w.email, phone: w.phone, street: w.street, suburb: w.suburb, state: w.state, postcode: w.postcode, country: w.country }, note: w.note, lines: lines().map(function (l) { return { key: l.it.key, name: l.it.name, qty: l.n, price: l.it.price || '' }; }) };
      var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: 'application/json' })); a.download = 'order-' + file.at + '.lt-order.json'; document.body.appendChild(a); a.click(); a.remove();
      msg.textContent = 'Order file saved.' + (B.email ? ' Attach it to an email to ' + B.email + ', or send it any way you like.' : ' Send it to the seller any way you like.');
    } }));
    acts.append(el('button', { type: 'button', text: 'Copy order', onclick: function () {
      var w = need(); if (!w) return; var body = orderText(w);
      function done() { msg.textContent = 'Order copied.' + (B.email ? ' Paste it into an email to ' + B.email + '.' : ''); }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(body).then(done, function () { msg.textContent = 'Could not copy. Select the order text below instead.'; });
      else msg.textContent = 'Could not copy on this browser.';
    } }), el('button', { type: 'button', text: 'Close', onclick: function () { d.close(); } }));
    d.append(el('h2', { text: 'Your order' }), list, t ? el('p', { class: 'tot', text: 'Estimated total: ' + t + ' (postage extra unless stated)' }) : null,
      O.pay ? el('p', { class: 'hint', text: 'How to pay: ' + O.pay }) : null,
      el('p', { class: 'hint', text: 'Nothing is sent from this page. Your order goes by your own email program, or you copy it.' }),
      fld('name', 'Your name'), fld('email', 'Your email', 'email'), fld('phone', 'Phone (optional)', 'tel'), fld('street', 'Street address', 'text', 'Where should it go?'), fld('suburb', 'Suburb or town'), fld('state', 'State'), fld('postcode', 'Postcode'), fld('country', 'Country (only if overseas)'), fld('note', 'Note for the seller (optional)', 'area'), msg, acts);
    if (d.showModal) d.showModal(); else d.setAttribute('open', '');
  }
  if (O.order === 'none') obar.remove();
  /* the Report link carries this page's own address (when it is on the web), so we know which page is meant */
  try { var rp = document.getElementById('ltreport'); if (rp && /^https?:$/.test(location.protocol)) rp.href += '&page=' + encodeURIComponent((location.origin + location.pathname).slice(0, 300)); } catch (e) { /* ignore */ }
  draw(); bar();
})();
