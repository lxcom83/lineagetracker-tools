/* LT-Catalogue: your own order book. For the seller only: nothing here goes on the page and nothing is sent to us.
   Orders live with the catalogue on this device, and go into the backup file you keep in your own Drive or Dropbox. */
import { el } from '../kit/core.js';
import { csvCell } from '../kit/brand.js';
import { getAiKey, setAiKey, clearAiKey, aiReadOrder, imageToJpeg } from './ai.js';

export const DEFAULT_STATUSES = [['new', 'New'], ['paid', 'Paid'], ['packed', 'Packed'], ['posted', 'Posted'], ['done', 'Done'], ['cancelled', 'Cancelled']];
/* The seller's own status list lives with the catalogue (opts.statuses). Orders keep the key, so renaming a status never loses an order. */
export const statusList = opts => { const l = opts && Array.isArray(opts.statuses) ? opts.statuses.filter(x => Array.isArray(x) && /^[a-z0-9_-]{1,24}$/.test(x[0]) && String(x[1] || '').trim()).slice(0, 12).map(x => [x[0], String(x[1]).trim().slice(0, 24)]) : []; return l.length ? l : DEFAULT_STATUSES.map(x => x.slice()); };
let STATUSES = DEFAULT_STATUSES;
const label = s => (STATUSES.find(x => x[0] === s) || STATUSES[0])[1];
const newId = () => Math.random().toString(36).slice(2, 10);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const num = p => { const n = parseFloat(String(p || '').replace(/[^0-9.]/g, '')); return isFinite(n) ? n : 0; };
const sym = items => { const m = String((items.find(i => i.price) || {}).price || '').match(/^[^0-9\s]+/); return m ? m[0] : '$'; };
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function orderTotal(o) { return o.lines.reduce((t, l) => t + (+l.qty || 0) * num(l.price), 0); }
const money = (n, s) => n ? s + n.toFixed(2) : '';

/* ---- addresses ---- */
const ADDR = ['street', 'suburb', 'state', 'postcode', 'country'];
/* Older orders kept a single contact line: put it where it belongs. */
export function tidyOrder(o) {
  ADDR.concat(['email', 'phone']).forEach(k => { if (typeof o[k] !== 'string') o[k] = ''; });
  if (!o.email && !o.phone && o.contact) { if (/@/.test(o.contact)) o.email = o.contact; else o.phone = o.contact; }
  return o;
}
/* "12 Smith St, Bowral NSW 2576" into parts (Australian style); anything else goes into the street line for the seller to fix. */
export function splitAddress(t) {
  t = String(t || '').trim();
  const m = t.match(/^(.*?)[,\s]+([A-Za-z][A-Za-z .'-]*?)\s+(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\.?(?:\s+(\d{4}))?\s*(?:,?\s*(Australia|AU))?\s*$/i);
  if (m) return { street: m[1].trim().replace(/,$/, ''), suburb: m[2].trim(), state: m[3].toUpperCase(), postcode: m[4] || '', country: m[5] ? 'Australia' : '' };
  return { street: t, suburb: '', state: '', postcode: '', country: '' };
}
export const placeLine = o => [o.suburb, [o.state, o.postcode].filter(Boolean).join(' ')].filter(Boolean).join(' ');
export const addrLines = o => [o.name, o.street, placeLine(o), o.country].filter(Boolean);
const nextRef = orders => { let m = 0; orders.forEach(o => { const n = parseInt(String(o.ref || '').replace(/\D/g, ''), 10); if (n > m) m = n; }); return String(m + 1).padStart(3, '0'); };

/* Read an order email made by a catalogue page ("2 x Name (pack), $4.00 ... From: ... Email: ... Note: ...") back into an order. */
export function parseOrderEmail(txt, items) {
  const o = { name: '', email: '', phone: '', street: '', suburb: '', state: '', postcode: '', country: '', note: '', lines: [] };
  const names = items.map(i => ({ i, n: norm(i.name) })).filter(x => x.n).sort((a, b) => b.n.length - a.n.length);
  String(txt || '').split(/\r?\n/).forEach(raw => {
    const line = raw.trim(); let m;
    if ((m = line.match(/^(\d{1,3})\s*[x×]\s*(.+)$/i))) {
      const q = +m[1], rest = norm(m[2]), hit = names.find(x => rest.startsWith(x.n));
      if (hit) o.lines.push({ key: hit.i.key, name: hit.i.name, qty: q, price: hit.i.price || '' });
      else o.lines.push({ key: '', name: m[2].replace(/\s*\(.*$/, '').replace(/,\s*[^,]*$/, '').trim() || m[2], qty: q, price: '' });
    } else if ((m = line.match(/^From:\s*(.*)$/i))) o.name = m[1].trim();
    else if ((m = line.match(/^Email:\s*(.*)$/i))) o.email = m[1].trim();
    else if ((m = line.match(/^Delivery details:\s*(.*)$/i))) { if (m[1].trim()) Object.assign(o, splitAddress(m[1])); }
    else if ((m = line.match(/^(Phone|Street|Suburb|State|Postcode|Country):\s*(.*)$/i))) o[m[1].toLowerCase()] = m[2].trim();
    else if ((m = line.match(/^Note:\s*(.*)$/i))) o.note = m[1].trim();
  });
  return o;
}

/* An order file made by a catalogue page ("Download order file"). Untrusted: every field is cleaned and every item is checked against this catalogue. */
export function parseOrderFile(txt, items) {
  let j; try { j = JSON.parse(txt); } catch { throw new Error('That is not an order file.'); }
  if (!j || j.app !== 'lt-order' || typeof j.customer !== 'object' || !Array.isArray(j.lines)) throw new Error('That is not an order file from a catalogue page.');
  const t = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n), c = j.customer || {};
  const o = { name: t(c.name, 120), email: t(c.email, 200), phone: t(c.phone, 60), street: t(c.street, 160), suburb: t(c.suburb, 80), state: t(c.state, 40), postcode: t(c.postcode, 20), country: t(c.country, 60), note: t(j.note, 600), lines: [] };
  const by = new Map(items.map(i => [i.key, i]));
  j.lines.slice(0, 100).forEach(l => {
    if (!l || typeof l !== 'object') return;
    const it = by.get(String(l.key || '')), q = Math.max(1, Math.min(999, Math.round(+l.qty) || 1));
    if (it) o.lines.push({ key: it.key, name: it.name, qty: q, price: it.price || '' }); else o.lines.push({ key: '', name: t(l.name, 140) || 'Unknown item', qty: q, price: '' });
  });
  return o;
}

export function packingList(orders) {
  const L = ['Packing list', ''];
  orders.forEach(o => {
    L.push((o.ref ? '#' + o.ref + ' ' : '') + (o.name || 'Customer') + (o.date ? ' (' + o.date + ')' : ''));
    o.lines.forEach(l => L.push('  ' + l.qty + ' x ' + l.name));
    if (o.note) L.push('  Note: ' + o.note.replace(/\n/g, ' '));
    L.push('');
  });
  const sum = new Map(); orders.forEach(o => o.lines.forEach(l => sum.set(l.name, (sum.get(l.name) || 0) + (+l.qty || 0))));
  L.push('Pick totals'); [...sum].sort((a, b) => a[0].localeCompare(b[0])).forEach(([n, q]) => L.push('  ' + q + ' x ' + n));
  return L.join('\n');
}

export function ordersCsv(orders, items) {
  const s = sym(items), q = v => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const rows = [['Order', 'Date', 'Customer', 'Email', 'Phone', 'Street', 'Suburb', 'State', 'Postcode', 'Country', 'Status', 'Items', 'Total', 'Note'].map(q).join(',')];
  orders.forEach(o => { tidyOrder(o); rows.push([o.ref, o.date, o.name, o.email, o.phone, o.street, o.suburb, o.state, o.postcode, o.country, label(o.status), o.lines.map(l => l.qty + ' x ' + l.name).join('; '), money(orderTotal(o), s), o.note].map(q).join(',')); });
  return rows.join('\r\n');
}

/* The rows LT-Print turns into address labels. The seller's return address comes from the brand step. */
export function addressCsv(orders, brand) {
  const cols = ['Name', 'Street', 'Place', 'Country', 'Phone', 'Order', 'Items', 'From', 'From address'];
  const from = (brand && (brand.name || '')) || '', fromAddr = (brand && brand.post) || '';
  const rows = orders.map(o => { tidyOrder(o); return [o.name, o.street, placeLine(o), o.country, o.phone, o.ref ? '#' + o.ref : '', o.lines.map(l => l.qty + ' x ' + l.name).join(', '), from, fromAddr].map(csvCell).join(','); });
  return { text: [cols.join(','), ...rows].join('\n'), count: rows.length };
}

/* One packing slip per page. Carries the seller's brand only. */
export function slipHTML(orders, brand, items) {
  const s = sym(items), b = brand || {};
  const pages = orders.map(o => {
    tidyOrder(o);
    const tot = orderTotal(o);
    const rows = o.lines.map(l => `<tr><td class="q">${esc(l.qty)}</td><td>${esc(l.name)}</td><td class="r">${esc(l.price || '')}</td><td class="r">${l.price ? esc(money((+l.qty || 0) * num(l.price), s)) : ''}</td></tr>`).join('');
    return `<section class="pg"><header>${b.logo ? `<img src="${esc(b.logo)}" alt="">` : ''}<div><h1>${esc(b.name || 'Packing slip')}</h1>${b.tagline ? `<p>${esc(b.tagline)}</p>` : ''}${b.post ? `<p>${esc(b.post)}</p>` : ''}${[b.email, b.phone].filter(Boolean).length ? `<p>${esc([b.email, b.phone].filter(Boolean).join(' · '))}</p>` : ''}</div></header>
<h2>Packing slip${o.ref ? ' #' + esc(o.ref) : ''}</h2><p class="m">${esc(o.date || '')}</p>
<div class="to"><b>Ship to</b><br>${addrLines(o).map(esc).join('<br>')}${o.phone ? '<br>' + esc(o.phone) : ''}</div>
<table><thead><tr><th class="q">Qty</th><th>Item</th><th class="r">Price</th><th class="r">Total</th></tr></thead><tbody>${rows}</tbody>${tot ? `<tfoot><tr><td></td><td colspan="2" class="r"><b>Items total</b></td><td class="r"><b>${esc(money(tot, s))}</b></td></tr></tfoot>` : ''}</table>
${o.note ? `<p class="n"><b>Note:</b> ${esc(o.note).replace(/\n/g, '<br>')}</p>` : ''}
<p class="f">${esc(b.note || 'Thank you for your order.')}</p></section>`;
  }).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Packing slips</title><style>@page{size:A5;margin:12mm}body{font-family:Arial,Helvetica,sans-serif;color:#1F2B40;margin:0}.pg{page-break-after:always;padding:6px}header{display:flex;gap:12px;align-items:center;border-bottom:2px solid ${/^#[0-9a-f]{6}$/i.test(b.ink || '') ? b.ink : '#1F3557'};padding-bottom:8px;margin-bottom:10px}header img{height:52px;width:auto}header h1{margin:0;font-size:1.25rem}header p{margin:1px 0;font-size:.8rem;color:#555}h2{margin:6px 0 0;font-size:1.05rem}.m{margin:0 0 8px;color:#555;font-size:.85rem}.to{border:1px solid #bbb;border-radius:6px;padding:8px 10px;margin:8px 0;line-height:1.35}table{width:100%;border-collapse:collapse;margin:8px 0;font-size:.9rem}th,td{padding:5px 4px;border-bottom:1px solid #ddd;text-align:left}th.q,td.q{width:34px}.r{text-align:right}.n{font-size:.85rem}.f{margin-top:14px;color:#555;font-size:.85rem;text-align:center}</style></head><body>${pages}</body></html>`;
}

/* The Orders step. c: { S, field, text, area, toast, save, downloadText, toPrintOrders } */
export function viewOrders(v, c) {
  const { S, field, text, area, toast, save, downloadText } = c;
  STATUSES = statusList(S.opts);
  S.orders.forEach(tidyOrder);
  const s = sym(S.cat.items);
  let filter = 'all', adding = null, pasting = false, edOpen = false, aiOpen = false;
  const queue = [];
  const nextInQueue = () => { if (!queue.length) return false; adding = queue.shift(); toast(queue.length ? queue.length + ' more order file' + (queue.length === 1 ? '' : 's') + ' to check after this one.' : 'Last order file. Check it, then save.', 4000); return true; };
  const root = el('div', {});
  const log = (o, t) => { (o.log ||= []).push({ at: Date.now(), t }); };
  const commit = () => { save(false); draw(); };
  const shownOrders = () => S.orders.filter(o => filter === 'all' || o.status === filter);

  function stock(o, dir) {
    let n = 0;
    o.lines.forEach(l => { const it = S.cat.items.find(i => i.key === l.key); if (it && typeof it.available === 'number') { it.available = Math.max(0, it.available + dir * (+l.qty || 0)); n++; } });
    o.stockTaken = dir < 0; log(o, dir < 0 ? 'Taken off stock' : 'Put back on stock');
    toast(n ? (dir < 0 ? 'Taken off stock. ' : 'Put back. ') + 'Download the page again so buyers see the new numbers.' : 'None of these items have a stock number, so nothing changed.', 5000); commit();
  }
  function labels(list) {
    const withAddr = list.filter(o => o.street || o.suburb);
    if (!withAddr.length) { toast('None of these orders has an address yet. Add one with Edit.', 5000); return; }
    const r = addressCsv(withAddr, S.brand);
    if (!S.brand.post) toast('Tip: add a return address on the Brand step and it prints small on each label.', 6000);
    c.toPrintOrders(r.text, 'Address labels', withAddr.length < list.length ? list.length - withAddr.length : 0);
  }
  function slips(list) {
    if (!list.length) { toast('No orders to print'); return; }
    const html = slipHTML(list, S.brand, S.cat.items), w = window.open('', '_blank');
    if (!w) { downloadText('packing-slips.html', html, 'text/html'); toast('Saved as a file. Open it and print.', 5000); return; }
    w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch { /* the seller can print from the window */ } }, 500);
  }

  function card(o) {
    const lines = el('ul', { class: 'ordl' }, o.lines.map(l => el('li', {}, [l.qty + ' × ' + l.name + (l.price ? '  ' + l.price : '')])));
    const sel = el('select', { 'aria-label': 'Status' }, STATUSES.map(([k, t]) => el('option', { value: k, text: t }))); sel.value = o.status;
    sel.addEventListener('change', () => { o.status = sel.value; log(o, 'Status: ' + label(o.status)); commit(); });
    const note = el('input', { type: 'text', placeholder: 'Add a note (private)', 'aria-label': 'Add a note' });
    const addNote = () => { const t = note.value.trim(); if (!t) return; log(o, t.slice(0, 300)); note.value = ''; commit(); };
    note.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addNote(); } });
    const tot = orderTotal(o), canStock = o.lines.some(l => S.cat.items.some(i => i.key === l.key && typeof i.available === 'number'));
    const addr = addrLines(o).slice(1);
    return el('article', { class: 'ocard', 'data-status': o.status }, [
      el('div', { class: 'ohead' }, [el('b', { text: (o.ref ? '#' + o.ref + ' ' : '') + (o.name || 'Customer') }), el('span', { class: 'ostat s-' + o.status, text: label(o.status) }), el('small', { text: [o.date, money(tot, s)].filter(Boolean).join(' · ') })]),
      el('p', { class: 'small oaddr', text: [o.email, o.phone].filter(Boolean).join(' · ') + (addr.length ? '\n' + addr.join('\n') : '') }), lines,
      o.note ? el('p', { class: 'small onote', text: 'Note from customer: ' + o.note }) : null,
      el('div', { class: 'oact' }, [field('Status', sel), el('div', { class: 'ofield' }, [note, el('button', { type: 'button', class: 'btn sm', text: 'Add note', onclick: addNote })])]),
      el('div', { class: 'actions', style: 'margin:6px 0 0' }, [
        el('button', { type: 'button', class: 'btn sm', text: 'Edit', onclick: () => { adding = JSON.parse(JSON.stringify(o)); adding.editId = o.id; pasting = false; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); } }),
        el('button', { type: 'button', class: 'btn sm', text: 'Address label', onclick: () => labels([o]) }),
        el('button', { type: 'button', class: 'btn sm', text: 'Packing slip', onclick: () => slips([o]) }),
        canStock ? el('button', { type: 'button', class: 'btn sm', text: o.stockTaken ? 'Put back on stock' : 'Take off stock', onclick: () => stock(o, o.stockTaken ? 1 : -1) }) : null,
        el('button', { type: 'button', class: 'btn sm', text: 'Delete', onclick: () => { if (!confirm('Delete this order? It cannot be undone.')) return; S.orders = S.orders.filter(x => x.id !== o.id); commit(); } })]),
      (o.log || []).length ? el('details', { class: 'olog' }, [el('summary', { text: 'History (' + o.log.length + ')' }), el('ul', {}, o.log.slice().reverse().map(e => el('li', {}, [new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ': ' + e.t])))]) : null,
    ]);
  }

  function orderForm() {
    const o = adding, items = S.cat.items, editing = !!o.editId, un = k => (o.unsure || []).includes(k);
    const mark = (f, k) => { if (un(k)) f.classList.add('unsure'); return f; };
    const t = (label2, key, ph, type) => mark(field(label2, text(o[key], v2 => { o[key] = v2; }, ph, type)), key === 'name' ? 'customer' : key);
    const pick = el('select', { 'aria-label': 'Item' }, [el('option', { value: '', text: 'Choose an item…' })].concat(items.map(i => el('option', { value: i.key, text: i.name + (i.price ? ' (' + i.price + ')' : '') }))));
    const qty = el('input', { type: 'number', min: '1', max: '999', value: '1', 'aria-label': 'Quantity', style: 'max-width:90px' });
    const ul = el('ul', { class: 'ordl' });
    const redraw = () => { ul.textContent = ''; o.lines.forEach((l, k) => ul.append(el('li', {}, [l.qty + ' × ' + l.name + (l.key ? '' : '  (not in your catalogue)') + ' ', el('button', { type: 'button', class: 'btn sm', text: 'Remove', onclick: () => { o.lines.splice(k, 1); redraw(); } })]))); };
    redraw();
    const st = el('select', { 'aria-label': 'Status' }, STATUSES.map(([k, t2]) => el('option', { value: k, text: t2 }))); st.value = STATUSES.some(x => x[0] === o.status) ? o.status : STATUSES[0][0]; o.status = st.value; st.addEventListener('change', () => { o.status = st.value; });
    return el('div', { class: 'card oform' }, [
      el('h2', { text: editing ? 'Edit order' + (o.ref ? ' #' + o.ref : '') : 'New order' }),
      o.unsure && o.unsure.length ? el('p', { class: 'notice warn', text: 'The AI was not sure about the highlighted parts. Please check them against the message.' }) : null,
      el('div', { class: 'two' }, [t('Customer', 'name', 'Name'), t('Email', 'email', 'name@example.com')]),
      el('div', { class: 'two' }, [t('Phone', 'phone', 'Mobile'), t('Date', 'date', '', 'date')]),
      t('Street address', 'street', '12 Smith St'),
      el('div', { class: 'two' }, [t('Suburb or town', 'suburb', 'Bowral'), t('State', 'state', 'NSW')]),
      el('div', { class: 'two' }, [t('Postcode', 'postcode', '2576'), t('Country (only if overseas)', 'country', '')]),
      mark(field('Items', el('div', { class: 'ofield' }, [pick, qty, el('button', { type: 'button', class: 'btn sm', text: 'Add item', onclick: () => { const it = items.find(i => i.key === pick.value); if (!it) { toast('Choose an item first'); return; } const q = Math.max(1, Math.min(999, Math.round(+qty.value) || 1)); const ex = o.lines.find(l => l.key === it.key); if (ex) ex.qty += q; else o.lines.push({ key: it.key, name: it.name, qty: q, price: it.price || '' }); qty.value = '1'; redraw(); } })])), 'lines'), ul,
      field('Status', st), field('Note (optional)', area(o.note, v2 => { o.note = v2; }, 'Anything to remember', 2)),
      el('div', { class: 'actions' }, [
        el('button', { type: 'button', class: 'btn primary', text: 'Save order', onclick: () => {
          if (!o.lines.length) { toast('Add at least one item'); return; }
          const keep = { name: o.name, email: o.email, phone: o.phone, street: o.street, suburb: o.suburb, state: o.state, postcode: o.postcode, country: o.country, date: o.date, status: o.status, note: o.note, lines: o.lines.map(l => ({ key: l.key, name: l.name, qty: l.qty, price: l.price })) };
          if (editing) { const t0 = S.orders.find(x => x.id === o.editId); if (t0) { Object.assign(t0, keep); log(t0, 'Edited'); } } else { S.orders.unshift(Object.assign({ id: newId(), at: Date.now(), ref: nextRef(S.orders), log: [{ at: Date.now(), t: 'Order added' }] }, keep)); }
          adding = null; nextInQueue(); commit(); } }),
        el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => { adding = null; nextInQueue(); draw(); } })]),
    ]);
  }

  function aiPanel() {
    const has = !!getAiKey(), box = el('details', { class: 'aip' }, [el('summary', { text: has ? 'AI reading: on (your own key)' : 'AI reading: add your own key to turn it on' })]);
    box.open = aiOpen; box.addEventListener('toggle', () => { aiOpen = box.open; });
    box.append(el('p', { class: 'small muted', text: 'With your own Anthropic key, the AI can read an order from a pasted message or a photo or screenshot. The key stays on this device, and the picture or text goes straight from your browser to Anthropic. It does not pass through us and we never see it. The customer\'s name and address are in what is sent, so only use it if you are happy with that. Remove the key at any time to switch it off. You pay Anthropic directly for each use, usually a fraction of a cent.' }));
    const k = el('input', { type: 'password', placeholder: has ? 'A key is saved on this device' : 'Paste your key (starts sk-ant-)', autocomplete: 'off', 'aria-label': 'Anthropic key' });
    box.append(el('div', { class: 'ofield' }, [k,
      el('button', { type: 'button', class: 'btn sm', text: 'Save key', onclick: () => { if (!setAiKey(k.value)) { toast('That does not look like a key. Copy it again from your Anthropic account.', 5000); return; } k.value = ''; toast('Key saved on this device'); draw(); } }),
      has ? el('button', { type: 'button', class: 'btn sm', text: 'Remove key', onclick: () => { clearAiKey(); toast('Key removed. AI reading is off.'); draw(); } }) : null].filter(Boolean)));
    return box;
  }

  function pasteForm() {
    const ta = el('textarea', { rows: '7', placeholder: 'Paste the customer\'s message or order email here.' });
    const file = el('input', { type: 'file', accept: 'image/*', 'aria-label': 'Add a photo or screenshot' }), msg = el('p', { class: 'small muted', 'aria-live': 'polite' });
    const go = order => { adding = Object.assign({ name: '', email: '', phone: '', street: '', suburb: '', state: '', postcode: '', country: '', note: '', date: today(), status: STATUSES[0][0], lines: [] }, order); pasting = false; draw(); window.scrollTo({ top: 0, behavior: 'smooth' }); };
    const ai = getAiKey() ? el('button', { type: 'button', class: 'btn primary', text: 'Read with AI', onclick: async () => {
      msg.textContent = 'Reading…';
      try { const img = file.files && file.files[0] ? await imageToJpeg(file.files[0]) : ''; const r = await aiReadOrder({ text: ta.value.trim(), image: img, items: S.cat.items }); if (!r.lines.length && !r.name && !r.street) { msg.textContent = 'Nothing that looks like an order was found. Check the message, or fill the form in by hand.'; return; } go(r); toast('Check it over, then save the order.', 5000); }
      catch (e) { msg.textContent = e.message || 'Could not read it.'; }
    } }) : null;
    return el('div', { class: 'card oform' }, [
      el('h2', { text: 'Add from a message' }),
      el('p', { class: 'small muted', text: 'Order emails made by your catalogue page are read without any AI. For any other message, or a photo or screenshot, turn on AI reading with your own key below.' }), ta,
      el('label', { class: 'fld' }, [el('span', { text: 'Photo or screenshot (needs AI reading)' }), file]),
      el('div', { class: 'actions' }, [ai,
        el('button', { type: 'button', class: ai ? 'btn' : 'btn primary', text: 'Read it (our order emails)', onclick: () => { const r = parseOrderEmail(ta.value, S.cat.items); if (!r.lines.length) { msg.textContent = 'No items found. Our order emails have lines like "2 x Name". For other messages use AI reading.'; return; } go(r); toast('Check it over, then save the order.'); } }),
        el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => { pasting = false; draw(); } })].filter(Boolean)), msg, aiPanel(),
    ]);
  }

  function statusEditor() {
    const used = k => S.orders.some(o => o.status === k), persist = () => { S.opts.statuses = STATUSES.map(x => x.slice()); save(false); };
    const box = el('details', { class: 'sted' }, [el('summary', { text: 'Edit statuses' })]); box.open = edOpen; box.addEventListener('toggle', () => { edOpen = box.open; });
    box.append(el('p', { class: 'small muted', text: 'Name the steps your orders go through. Renaming a status keeps the orders in it.' }));
    STATUSES.forEach(([k, t], i) => {
      const inp = el('input', { type: 'text', value: t, maxlength: '24', 'aria-label': 'Status name' });
      inp.addEventListener('change', () => { const v2 = inp.value.trim().slice(0, 24); if (!v2) { inp.value = t; return; } STATUSES[i][1] = v2; persist(); draw(); });
      box.append(el('div', { class: 'ofield' }, [inp,
        el('button', { type: 'button', class: 'btn sm', text: 'Move up', onclick: () => { if (i > 0) { const a = STATUSES[i - 1]; STATUSES[i - 1] = STATUSES[i]; STATUSES[i] = a; persist(); draw(); } } }),
        el('button', { type: 'button', class: 'btn sm', text: 'Remove', onclick: () => { if (STATUSES.length < 2) { toast('Keep at least one status'); return; } if (used(k)) { toast('Some orders are "' + t + '". Move them to another status first.', 5000); return; } STATUSES.splice(i, 1); persist(); draw(); } })]));
    });
    const add = el('input', { type: 'text', maxlength: '24', placeholder: 'New status, for example Ready to collect', 'aria-label': 'New status name' });
    const addIt = () => { const v2 = add.value.trim().slice(0, 24); if (!v2) return; if (STATUSES.length >= 12) { toast('That is plenty of statuses'); return; } STATUSES.push([(v2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16) || 's') + '-' + Math.random().toString(36).slice(2, 5), v2]); persist(); draw(); };
    add.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addIt(); } });
    box.append(el('div', { class: 'ofield' }, [add, el('button', { type: 'button', class: 'btn sm', text: 'Add', onclick: addIt }),
      el('button', { type: 'button', class: 'btn sm', text: 'Back to the standard list', onclick: () => { const keep = STATUSES.filter(x => !DEFAULT_STATUSES.some(d => d[0] === x[0]) && used(x[0])); STATUSES = DEFAULT_STATUSES.map(x => x.slice()).concat(keep); persist(); draw(); } })]));
    return box;
  }

  function draw() {
    root.textContent = '';
    const all = S.orders, shown = shownOrders();
    const counts = k => k === 'all' ? all.length : all.filter(o => o.status === k).length;
    root.append(
      el('p', { class: 'muted', style: 'margin-top:0', text: 'Your private order book. Nothing here goes on your page. It is kept with this catalogue on this device, and saved in the backup file you keep in your own Drive or Dropbox.' }),
      el('div', { class: 'actions' }, [
        el('button', { type: 'button', class: 'btn primary', text: 'New order', onclick: () => { adding = { name: '', email: '', phone: '', street: '', suburb: '', state: '', postcode: '', country: '', note: '', lines: [], date: today(), status: STATUSES[0][0] }; pasting = false; draw(); } }),
        el('button', { type: 'button', class: 'btn', text: 'Add from a message or photo', onclick: () => { pasting = true; adding = null; draw(); } }),
        el('button', { type: 'button', class: 'btn', text: 'Copy packing list', onclick: async () => { const stop = STATUSES.findIndex(x => x[0] === 'packed'), early = STATUSES.slice(0, stop > 0 ? stop : 2).map(x => x[0]), todo = all.filter(o => early.includes(o.status)); if (!todo.length) { toast('No orders waiting to be packed'); return; } try { await navigator.clipboard.writeText(packingList(todo)); toast('Packing list copied (orders before the Packed status)'); } catch { toast('Could not copy'); } } }),
        el('button', { type: 'button', class: 'btn', text: 'Open order files', onclick: () => {
          const inp = document.createElement('input'); inp.type = 'file'; inp.multiple = true; inp.accept = '.json,application/json';
          inp.addEventListener('change', async () => {
            const got = []; let bad = 0;
            for (const f of [...inp.files].slice(0, 30)) { try { const o = parseOrderFile(await f.text(), S.cat.items); if (o.lines.length) got.push(Object.assign({ name: '', email: '', phone: '', street: '', suburb: '', state: '', postcode: '', country: '', note: '', date: today(), status: STATUSES[0][0] }, o)); else bad++; } catch { bad++; } }
            if (bad) toast(bad + (bad === 1 ? ' file was not a usable order file.' : ' files were not usable order files.'), 5000);
            if (!got.length) return;
            queue.length = 0; queue.push(...got); pasting = false; nextInQueue(); draw(); window.scrollTo({ top: 0, behavior: 'smooth' });
          }); inp.click();
        } }),
        c.updateItems ? el('button', { type: 'button', class: 'btn', text: 'Update items from a new file', onclick: c.updateItems }) : null,
        el('button', { type: 'button', class: 'btn', text: 'Download as a spreadsheet', onclick: () => { if (!all.length) { toast('No orders yet'); return; } downloadText('orders.csv', ordersCsv(all, S.cat.items), 'text/csv'); } })]),
      ...[adding ? orderForm() : null, pasting ? pasteForm() : null].filter(Boolean),
      el('div', { class: 'ochips', role: 'group', 'aria-label': 'Filter by status' }, [['all', 'All']].concat(STATUSES).map(([k, t]) => el('button', { type: 'button', class: 'chipb', 'aria-pressed': String(filter === k), text: t + ' (' + counts(k) + ')', onclick: () => { filter = k; draw(); } }))),
      all.length ? el('div', { class: 'actions oprint' }, [el('span', { class: 'small muted', text: 'For the orders shown below:' }),
        el('button', { type: 'button', class: 'btn sm', text: 'Print address labels', onclick: () => labels(shown) }),
        el('button', { type: 'button', class: 'btn sm', text: 'Print packing slips', onclick: () => slips(shown) })]) : null,
      statusEditor(),
      shown.length ? el('div', { class: 'olist' }, shown.map(card)) : el('p', { class: 'muted', text: all.length ? 'No orders with that status.' : 'No orders yet. When an order email arrives, paste it in, or add the order by hand.' }));
  }
  v.append(root); draw();
}
