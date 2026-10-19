/* LT-Catalogue: load a catalogue file from the app, set your brand, shape the page, download it, share it, and send the items to LT-Print.
   Nothing is stored on our server. The brand and the last catalogue stay on this device. */
import { CFG, loadConfig, el, toast, store, gate, REASONS, signInUrl, rootUrl, registerSW } from '../kit/core.js';
import { topBar } from '../kit/bar.js';
import { downloadText, pickFile } from '../kit/files.js';
import { getBrand, setBrand, blankBrand, hasBrand, logoFromFile, putHandoff } from '../kit/brand.js';
import { QR } from '../kit/qr.js';
import { fold } from '../kit/fold.js';
import { readCatalogue, buildPage, csvRows, LOOKS } from './template.js';
import { SAMPLE, SAMPLE_BRAND, SAMPLE_GOODS, SAMPLE_GOODS_BRAND } from './sample.js';
import { viewOrders } from './orders.js';
import { viewStock, baseOf, cleanBase, mergeIncoming, changedCount } from './stock.js';
import { viewPrint } from './printjobs.js';

const app = document.getElementById('app');
const K = { idx: 'ltcat_idx', cur: 'ltcat_cur', p: id => 'ltcat_p_' + id, old: ['ltcat_cat', 'ltcat_opts', 'ltcat_url'] };
const DEF = () => ({ title: '', intro: '', terms: '', order: 'email', prices: true, photos: true, photoSize: 'asis', master: 'app' });
const S = { cat: null, brand: getBrand(), opts: DEF(), step: 'load', url: '', runtime: '', id: '', lib: [], orders: [], base: {} };
const newId = () => Math.random().toString(36).slice(2, 10);
const validCat = c => !!(c && Array.isArray(c.items) && c.items.length && c.list && c.sender);
/* Several catalogues are kept on this device. The page and all choices belong to the catalogue; the brand is shared by all of them. */
function libLoad() {
  let idx = store.get(K.idx, null);
  if (!Array.isArray(idx)) {
    idx = [];
    const c = store.get(K.old[0], null);
    if (validCat(c)) {
      const id = newId();
      store.set(K.p(id), { cat: c, opts: Object.assign(DEF(), store.get(K.old[1], {}) || {}), url: store.get(K.old[2], '') || '', orders: [] });
      idx.push({ id, name: c.list.name || 'Catalogue', n: c.items.length, at: Date.now() }); store.set(K.idx, idx); store.set(K.cur, id);
    }
    K.old.forEach(k => store.del(k));
  }
  S.lib = idx.filter(m => m && m.id);
  const cur = store.get(K.cur, '');
  openProject(S.lib.some(m => m.id === cur) ? cur : (S.lib[0] && S.lib[0].id) || '');
}
function openProject(id) {
  S.id = id; const p = id ? store.get(K.p(id), null) : null;
  if (p && validCat(p.cat)) { S.cat = p.cat; S.opts = Object.assign(DEF(), p.opts || {}); S.url = p.url || ''; S.orders = Array.isArray(p.orders) ? p.orders : []; S.base = cleanBase(p.base, p.cat); } else { S.cat = null; S.opts = DEF(); S.url = ''; S.orders = []; S.base = {}; }
  if (id) store.set(K.cur, id);
}
function saveProject(touch = true) {
  if (!S.id) return true;
  const ok = store.set(K.p(S.id), { cat: S.cat, opts: S.opts, url: S.url, orders: S.orders, base: S.base });
  const m = S.lib.find(x => x.id === S.id);
  if (m) { m.name = S.opts.title || (S.cat && S.cat.list.name) || 'New catalogue'; m.n = S.cat ? S.cat.items.length : 0; m.u = (S.cat && S.cat.updated) || ''; if (touch) m.at = Date.now(); store.set(K.idx, S.lib); }
  if (!ok) toast('This device has no room left to save this catalogue. Remove a catalogue you no longer need, or use smaller pictures.', 7000);
  return ok;
}
function newProject() {
  const id = newId(); S.id = id; S.cat = null; S.opts = DEF(); S.url = ''; S.orders = []; S.base = {};
  S.lib.unshift({ id, name: 'New catalogue', n: 0, at: Date.now() });
  store.set(K.idx, S.lib); store.set(K.cur, id); store.set(K.p(id), { cat: null, opts: S.opts, url: '' });
}
let main, stepsEl, tabsEl, libEl;
const GROUP = { orders: 'orders', stock: 'stock', print: 'print', load: 'load', controls: 'load', page: 'load', share: 'load', brand: 'brand' };

(async function start() {
  registerSW(); await loadConfig();
  const g = await gate('catalogue');
  if (!g.ok) return showGate(g.reason);
  try { S.runtime = await (await fetch(new URL('runtime.js', import.meta.url))).text(); } catch { S.runtime = ''; }
  libLoad();
  build(g);
  if (g.preview) toast('LT-Catalogue is not open to everyone yet. You can try it because you are staff.', 5000);
})();

function showGate(reason) {
  const msg = REASONS[reason] || REASONS.error, out = reason === 'signed_out' || reason === 'offline';
  app.textContent = '';
  app.append(topBar({ tool: 'catalogue' }), el('main', { class: 'gate' }, [
    el('h1', { text: 'LT-Catalogue' }),
    el('p', { class: 'muted', text: 'Turn your catalogue into one interactive page for a forum or your own site. Free with a Lineage Tracker account.' }),
    el('div', { class: 'card' }, [el('p', { text: msg }), el('div', { class: 'actions', style: 'justify-content:center' }, [
      out ? el('a', { class: 'btn primary', href: signInUrl('catalogue/') }, ['Sign in']) : null,
      out ? el('a', { class: 'btn', href: CFG.SITE + '/register.html' }, ['Create a free account']) : null,
      reason === 'error' ? el('button', { type: 'button', class: 'btn primary', text: 'Try again', onclick: () => location.reload() }) : null,
      el('a', { class: 'btn', href: rootUrl('') }, ['All tools'])])]),
  ]));
}

const saveOpts = () => saveProject();
function load(cat) {
  if (!S.id) newProject();
  if (S.cat) {
    const n = changedCount(S.cat, S.base);
    if (S.opts.master !== 'site' && n && !confirm('You changed stock or prices on ' + n + (n === 1 ? ' item' : ' items') + ' here. The app is in charge, so loading this file replaces them with the app\'s numbers. Continue?')) return;
    const m = mergeIncoming(S.cat, S.base, cat, S.opts.master);
    S.cat = m.cat; S.base = m.base; if (m.kept) toast(m.kept + (m.kept === 1 ? ' item keeps' : ' items keep') + ' the stock and price you set here.', 5000);
  } else { S.cat = cat; S.base = baseOf(cat); }
  if (!S.opts.title) S.opts.title = cat.list.name; saveProject(); renderLib(); go(hasBrand(S.brand) ? 'page' : 'brand');
}

function build(g) {
  app.textContent = '';
  stepsEl = el('div', { class: 'steps', role: 'group', 'aria-label': 'Steps' });
  tabsEl = el('div', { class: 'steps tabs5', role: 'group', 'aria-label': 'Sections' });
  [['orders', 'Orders'], ['stock', 'Stock & prices'], ['print', 'Print'], ['load', 'Catalogue page'], ['brand', 'Setup']].forEach(([v, l]) =>
    tabsEl.append(el('button', { type: 'button', 'data-tab': GROUP[v], 'data-step': v, onclick: () => go(v) }, [l])));
  stepsEl = el('div', { class: 'steps subs', role: 'group', 'aria-label': 'Catalogue page steps' });
  [['load', 'Catalogue'], ['controls', 'Controls'], ['page', 'Page'], ['share', 'Share']].forEach(([v, l], i) =>
    stepsEl.append(el('button', { type: 'button', 'data-sub': v, onclick: () => go(v) }, [el('span', { class: 'num', text: String(i + 1) }), l])));
  libEl = el('details', { class: 'lib', open: true });
  if (window.matchMedia && matchMedia('(max-width:980px)').matches) libEl.open = false;
  main = el('main', { class: 'page' }, [el('h1', { text: 'LT-Catalogue' }), tabsEl, stepsEl, el('div', { class: 'work' }, [el('div', { id: 'view' }), libEl])]);
  renderLib();
  app.append(topBar({ tool: 'catalogue', who: { alias: g.alias, offline: g.offline, checked: g.checked } }), main);
  go(S.cat ? (S.orders.length ? 'orders' : hasBrand(S.brand) ? 'page' : 'brand') : 'load');
}
const dayText = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
const ago = ms => { const d = Math.floor((Date.now() - ms) / 86400000); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? d + ' days ago' : Math.round(d / 30) + ' months ago'; };
function renderLib() {
  if (!libEl) return;
  libEl.textContent = '';
  libEl.append(el('summary', { text: `Your catalogues (${S.lib.length})` }));
  const box = el('div', { class: 'libbox' });
  if (!S.lib.length) box.append(el('p', { class: 'small muted', text: 'Nothing saved yet. Choose a catalogue file to start.' }));
  S.lib.forEach(m => box.append(el('button', { type: 'button', class: 'libitem', 'aria-current': String(m.id === S.id), onclick: () => switchTo(m.id) }, [el('b', { text: m.name || 'Catalogue' }), el('small', { text: (m.n ? `${m.n} ${m.n === 1 ? 'item' : 'items'}` : 'Empty') }), el('small', { text: `Last changed ${dayText(m.at)} (${ago(m.at)})` }), m.u ? el('small', { text: `Stock file dated ${/^\d{4}-\d{2}-\d{2}$/.test(m.u) ? dayText(new Date(m.u + 'T12:00:00').getTime()) : m.u}` }) : null])));
  box.append(el('button', { type: 'button', class: 'btn sm', text: '+ New catalogue', onclick: () => { newProject(); renderLib(); go('load'); } }));
  if (S.id) box.append(el('div', { class: 'libact' }, [
    el('button', { type: 'button', class: 'btn sm', text: 'Rename', onclick: renameCur }),
    el('button', { type: 'button', class: 'btn sm', text: 'Duplicate', onclick: dupCur }),
    el('button', { type: 'button', class: 'btn sm', text: 'Delete', onclick: delCur })]));
  if (S.id && S.cat) box.append(el('div', { class: 'libact' }, [
    el('button', { type: 'button', class: 'btn sm', text: 'Save a backup file', onclick: saveBackup }),
    el('button', { type: 'button', class: 'btn sm', text: 'Open a backup file', onclick: openBackup })]));
  else box.append(el('div', { class: 'libact' }, [el('button', { type: 'button', class: 'btn sm', text: 'Open a backup file', onclick: openBackup })]));
  box.append(el('p', { class: 'small muted', text: 'Saved on this device only. Keep a backup file in your own Drive or Dropbox: it holds the catalogue, your choices and your orders. Your brand is shared by all of them. Nothing is stored by us.' }));
  libEl.append(box);
}
/* A backup file holds one catalogue, its choices and its orders. The seller keeps it in their own Drive or Dropbox. */
function saveBackup() {
  const name = S.opts.title || (S.cat && S.cat.list.name) || 'catalogue';
  downloadText(`${slug(name)}.lt-catalogue.json`, JSON.stringify({ app: 'lt-catalogue', v: 1, saved: new Date().toISOString().slice(0, 10), cat: S.cat, opts: S.opts, url: S.url, orders: S.orders, base: S.base }));
  toast('Backup saved. Put the file in your own Drive or Dropbox.', 5000);
}
async function openBackup() {
  const f = await pickFile('.json,application/json'); if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (!j || j.app !== 'lt-catalogue' || !validCat(j.cat)) throw new Error('That is not a catalogue backup file.');
    const ord = (Array.isArray(j.orders) ? j.orders : []).slice(0, 5000).map(o => ({ id: String(o.id || newId()).slice(0, 20), at: +o.at || Date.now(), date: String(o.date || '').slice(0, 10), name: String(o.name || '').slice(0, 120), contact: String(o.contact || '').slice(0, 200), ref: String(o.ref || '').replace(/\D/g, '').slice(0, 6), email: String(o.email || '').slice(0, 200), phone: String(o.phone || '').slice(0, 60), street: String(o.street || '').slice(0, 160), suburb: String(o.suburb || '').slice(0, 80), state: String(o.state || '').slice(0, 40), postcode: String(o.postcode || '').slice(0, 20), country: String(o.country || '').slice(0, 60), note: String(o.note || '').slice(0, 600), status: /^[a-z0-9_-]{1,24}$/.test(String(o.status || '')) ? String(o.status) : 'new', stockTaken: !!o.stockTaken, lines: (Array.isArray(o.lines) ? o.lines : []).slice(0, 100).map(l => ({ key: String(l.key || '').slice(0, 60), name: String(l.name || '').slice(0, 140), qty: Math.max(1, Math.min(999, Math.round(+l.qty) || 1)), price: String(l.price || '').slice(0, 40) })), log: (Array.isArray(o.log) ? o.log : []).slice(0, 200).map(e => ({ at: +e.at || 0, t: String(e.t || '').slice(0, 300) })) }));
    const id = newId(), cat = readCatalogue(JSON.stringify({ ...j.cat, app: 'lineage', format: 'catalogue', version: 1 })); cat.items.forEach((it, k) => { it.hide = !!(j.cat.items[k] && j.cat.items[k].hide); const a = j.cat.items[k] && j.cat.items[k].available; if (typeof a === 'number' && a >= 0 && a < 1e6) it.available = Math.floor(a); });
    const opts = Object.assign(DEF(), typeof j.opts === 'object' && j.opts ? j.opts : {});
    S.lib.unshift({ id, name: opts.title || cat.list.name || 'Catalogue', n: cat.items.length, u: cat.updated || '', at: Date.now() }); store.set(K.idx, S.lib);
    if (!store.set(K.p(id), { cat, opts, url: String(j.url || '').slice(0, 300), orders: ord, base: cleanBase(j.base, cat) })) { S.lib.shift(); store.set(K.idx, S.lib); toast('This device has no room for that backup.'); return; }
    openProject(id); renderLib(); go('page'); toast('Backup opened');
  } catch (e) { toast(e.message || 'That file could not be read.'); }
}
function switchTo(id) {
  if (id === S.id) return;
  openProject(id); renderLib();
  go(S.cat ? (S.step === 'load' ? 'page' : S.step) : 'load');
}
function renameCur() {
  const v = prompt('Name for this catalogue (this is also the page title)', S.opts.title || (S.cat && S.cat.list.name) || ''); if (v == null) return;
  S.opts.title = v.trim().slice(0, 120); saveProject(); renderLib(); go(S.step);
}
function dupCur() {
  if (!S.cat) { toast('Choose a catalogue file first'); return; }
  const src = { cat: JSON.parse(JSON.stringify(S.cat)), opts: { ...S.opts, title: (S.opts.title || S.cat.list.name || 'Catalogue') + ' (copy)' }, url: '', orders: [], base: JSON.parse(JSON.stringify(S.base)) };
  const id = newId(); S.lib.unshift({ id, name: src.opts.title, n: src.cat.items.length, at: Date.now() }); store.set(K.idx, S.lib);
  if (!store.set(K.p(id), src)) { S.lib.shift(); store.set(K.idx, S.lib); toast('This device has no room for another copy.'); return; }
  openProject(id); renderLib(); go(S.step);
}
function delCur() {
  const name = (S.opts.title || (S.cat && S.cat.list.name) || 'this catalogue');
  if (!confirm(`Delete "${name}" from this device? Your catalogue file from the app is not affected.`)) return;
  const id = S.id; store.del(K.p(id)); S.lib = S.lib.filter(m => m.id !== id); store.set(K.idx, S.lib);
  openProject(S.lib[0] ? S.lib[0].id : ''); renderLib(); go(S.cat ? 'page' : 'load');
}
function go(step) {
  if (step !== 'load' && !S.cat) { toast('Choose a catalogue first'); step = 'load'; }
  S.step = step;
  const grp = GROUP[step] || step;
  tabsEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.tab === grp)));
  stepsEl.hidden = grp !== 'load';
  stepsEl.querySelectorAll('button').forEach(b => b.setAttribute('aria-current', String(b.dataset.sub === step)));
  const v = document.getElementById('view'); v.textContent = '';
  const ctx = { S, field, text, area, toast, save: saveProject, downloadText, toPrintOrders, toPrintItems, toPrintQr, go, updateItems };
  ({ load: viewLoad, brand: viewSetup, controls: viewControls, page: viewPage, orders: v2 => viewOrders(v2, ctx), stock: v2 => viewStock(v2, ctx), print: v2 => viewPrint(v2, ctx), share: viewShare })[step](v);
}
const field = (label, input, hint) => el('label', { class: 'fld' }, [el('span', { text: label }), input, hint ? el('small', { text: hint }) : null]);
const text = (val, on, ph, type = 'text') => { const i = el('input', { type, value: val || '', placeholder: ph || '' }); i.addEventListener('input', () => on(i.value)); return i; };
const area = (val, on, ph, rows = 3) => { const t = el('textarea', { rows: String(rows), placeholder: ph || '' }); t.value = val || ''; t.addEventListener('input', () => on(t.value)); return t; };

/* 1. the catalogue */
function viewLoad(v) {
  const info = S.cat ? el('div', { class: 'notice' }, [el('b', { text: S.cat.list.name || 'Catalogue' }), ` · ${S.cat.items.length} items` + (S.cat.sender.name ? ` · from ${S.cat.sender.name}` : ''), el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Continue', onclick: () => go('brand') })])]) : null;
  v.append(
    el('p', { class: 'muted', text: 'In the Lineage Tracker app, open a list, press Share, then Catalogue file. Choose that file here. It stays on this device.' }),
    S.cat ? el('p', { class: 'small muted', text: 'Choosing a file here replaces the items in this catalogue. To keep this one and add another, use + New catalogue in the panel.' }) : null,
    info,
    el('div', { class: 'drop' }, [
      el('p', { style: 'margin:0 0 12px', text: 'Choose your catalogue file (ends in .lineage-list.json)' }),
      el('div', { class: 'actions', style: 'justify-content:center' }, [
        el('button', { type: 'button', class: 'btn primary', text: 'Choose a file', onclick: async () => { const f = await pickFile('.json,application/json'); if (!f) return; try { load(readCatalogue(await f.text())); } catch (e) { toast(e.message, 6000); } } }),
        el('button', { type: 'button', class: 'btn', text: 'Try Fluffy Lemon Seeds (an invented seller)', onclick: () => { if (!hasBrand(S.brand)) S.brand = setBrand(SAMPLE_BRAND).brand; load(readCatalogue(JSON.stringify(SAMPLE))); } }),
        el('button', { type: 'button', class: 'btn', text: 'Try Bramble Hill Homestead (invented goods seller)', onclick: () => { if (!hasBrand(S.brand)) S.brand = setBrand(SAMPLE_GOODS_BRAND).brand; load(readCatalogue(JSON.stringify(SAMPLE_GOODS))); } })])]),
    el('p', { class: 'small muted', style: 'margin-top:14px', text: 'Only what is in the catalogue file is used: names, descriptions, pack sizes, prices, availability and the pictures you chose to share.' }));
}

/* Setup: the brand and the return address (the master choice lives on Stock & prices) */
function viewSetup(v) { viewBrand(v); }
/* 2. the brand */
function viewBrand(v) {
  const b = S.brand; let logoImg;
  const save = () => { const r = setBrand(S.brand); S.brand = r.brand; if (!r.ok) toast('Your brand is too big to keep on this device. Try a smaller logo.'); };
  const set = k => val => { b[k] = val; save(); };
  const acc = el('input', { type: 'color', value: b.accent, 'aria-label': 'Accent colour' }); acc.addEventListener('input', () => { b.accent = acc.value; save(); });
  const ink = el('input', { type: 'color', value: b.ink, 'aria-label': 'Heading colour' }); ink.addEventListener('input', () => { b.ink = ink.value; save(); });
  logoImg = el('img', { src: b.logo || rootUrl('brand/logo-icon.svg'), alt: '' });
  v.append(
    el('p', { class: 'muted', text: 'Your brand is used on the page and the flyer, and LT-Print offers it as ready-made label pieces. It is kept on this device only.' }),
    el('div', { class: 'split' }, [
      el('div', {}, [(() => { const f = fold('catalogue', 'Logo, name and colours', true); f.body.append(
        el('div', { class: 'logo-box' }, [logoImg, el('div', {}, [
          el('button', { type: 'button', class: 'btn sm', text: b.logo ? 'Change logo' : 'Add a logo', onclick: async () => { const f = await pickFile('image/png,image/jpeg,image/webp,image/gif'); if (!f) return; try { b.logo = await logoFromFile(f); save(); logoImg.src = b.logo; } catch { toast('That picture could not be used. Try a smaller PNG or JPEG.'); } } }),
          b.logo ? el('button', { type: 'button', class: 'btn sm', text: 'Remove', onclick: () => { b.logo = ''; save(); logoImg.src = rootUrl('brand/logo-icon.svg'); } }) : null])]),
        field('Business or seller name', text(b.name, set('name'), 'Hillside Heirloom Seeds')),
        field('Tagline (optional)', text(b.tagline, set('tagline'), 'Heirloom seed from our hillside block')),
        el('div', { class: 'swatches' }, [el('label', { class: 'fld' }, [el('span', { text: 'Accent colour' }), acc]), el('label', { class: 'fld' }, [el('span', { text: 'Heading colour' }), ink])])); return f.box; })()]),
      el('div', {}, [(() => { const f = fold('catalogue', 'Contact and links', true); f.body.append(
        field('Email for orders', text(b.email, set('email'), 'orders@example.com', 'email'), 'Orders open in the buyer\'s email program addressed to this.'),
        el('div', { class: 'two' }, [field('Phone (optional)', text(b.phone, set('phone'))), field('Area (optional)', text(b.area, set('area'), 'Southern Highlands, NSW'))]),
        field('Return address for parcels (optional)', text(b.post, set('post'), 'PO Box 12, Bowral NSW 2576'), 'Printed small on address labels and packing slips. Not shown on your page.'),
        field('Website (optional)', text(b.web, set('web'), 'https://', 'url')),
        field('Facebook, Instagram and other links (optional)', text(b.social, set('social'), 'facebook.com/yourpage instagram.com/you'), 'Add as many as you like, with a space between. Each one becomes a button on your page.'),
        field('Footer note (optional)', area(b.note, set('note'), 'Orders go out each Friday.', 2))); return f.box; })()])]),
    el('div', { class: 'actions' }, [
      el('button', { type: 'button', class: 'btn primary', text: 'Next: controls', onclick: () => go('controls') }),
      el('button', { type: 'button', class: 'btn', text: 'Save brand to a file', onclick: () => downloadText('my-brand.lt-brand.json', JSON.stringify({ app: 'lt-brand', v: 1, brand: S.brand })) }),
      el('button', { type: 'button', class: 'btn', text: 'Open a brand file', onclick: async () => { const f = await pickFile('.json,application/json'); if (!f) return; try { const j = JSON.parse(await f.text()); if (j.app !== 'lt-brand') throw 0; S.brand = setBrand(j.brand).brand; go('brand'); toast('Brand loaded'); } catch { toast('That is not a brand file'); } } })]));
}

/* 3. the page */
const makeFrame = () => el('iframe', { class: 'pv', title: 'Preview of your page', sandbox: 'allow-scripts allow-modals allow-forms' });
/* 3. controls: what the seller wants on the page and what not */
const CONTROLS = [
  ['What buyers see', [['photos', 'Pictures'], ['prices', 'Prices'], ['species', 'Latin or species names'], ['desc', 'Descriptions'], ['notes', 'Your notes on each item'], ['facts', 'Pack sizes and details'], ['offers', 'Labels such as Plant, Swap or Trade']]],
  ['Finding things', [['search', 'Search box'], ['sort', 'Sort menu (needs prices)'], ['filter', 'Offer filter'], ['jump', 'Category buttons'], ['instock', '"In stock only" tickbox']]],
  ['Top of the page', [['links', 'Quick links: email, call, website, Facebook and other pages, terms']]],
];
function viewControls(v) {
  const o = S.opts, cat = S.cat; let frame;
  const refresh = async (save = true) => { if (save !== false) saveOpts(); await prepPhotos(); frame.srcdoc = pageHTML(''); paintMeter(); };
  const chk = (label, key) => { const c = el('input', { type: 'checkbox' }); c.checked = o[key] !== false; c.addEventListener('change', () => { o[key] = c.checked; refresh(); }); return el('label', { class: 'chk', style: 'display:flex;gap:8px;align-items:center;margin:0 0 8px' }, [c, label]); };
  const mode = el('select', {}, [el('option', { value: 'email', text: 'Buyers can build an order and send it by email' }), el('option', { value: 'none', text: 'Browse only, no ordering' })]); mode.value = o.order; mode.addEventListener('change', () => { o.order = mode.value; refresh(); });
  const list = el('div', { class: 'items' }, cat.items.map(it => { const c = el('input', { type: 'checkbox' }); c.checked = !it.hide; c.addEventListener('change', () => { it.hide = !c.checked; saveProject(); renderLib(); refresh(); }); c.dataset.item = '1'; return el('label', {}, [c, it.name]); }));
  const setAll = on => { list.querySelectorAll('input').forEach(c => { c.checked = on; }); cat.items.forEach(it => { it.hide = !on; }); saveProject(); renderLib(); refresh(); };
  const photoSel = el('select', {}, [el('option', { value: 'asis', text: 'As they are in your catalogue file' }), el('option', { value: 'medium', text: 'Medium' }), el('option', { value: 'small', text: 'Small (smallest page)' })]);
  photoSel.value = o.photoSize || 'asis'; photoSel.addEventListener('change', () => { o.photoSize = photoSel.value; refresh(); });
  const stockSel = el('select', {}, [el('option', { value: 'limited', text: 'Limited supply (recommended)' }), el('option', { value: 'exact', text: 'Exact numbers, such as "Only 3 left"' }), el('option', { value: 'off', text: 'Nothing, only "Sold out"' })]);
  stockSel.value = o.stockMode || (o.stock === false ? 'off' : 'limited'); stockSel.addEventListener('change', () => { o.stockMode = stockSel.value; refresh(); });
  frame = makeFrame();
  const warn = !S.brand.email && o.order === 'email' ? el('div', { class: 'notice warn' }, ['Add an email for orders on the Brand step, or buyers can only copy their order. ', el('a', { href: '#', text: 'Go to Brand', onclick: e => { e.preventDefault(); go('brand'); } })]) : null;
  const group = (title, kids, open = true) => { const f = fold('catalogue', title, open); f.body.append(...kids.filter(Boolean)); return f.box; };
  v.append(el('div', { class: 'split' }, [
    el('div', {}, [
      el('p', { class: 'muted', style: 'margin-top:0', text: 'Choose what goes on your page. Everything is on by default. The preview updates as you tick and untick.' }), warn,
      ...CONTROLS.map(([t, rows]) => group(t, rows.filter(([k]) => !(k === 'species' && !cat.items.some(i => i.species))).map(([k, l]) => chk(l, k)))),
      group('Page style', [el('div', { class: 'looks', role: 'radiogroup', 'aria-label': 'Page style' }, LOOKS.map(([k, name, txt]) => { const r = el('input', { type: 'radio', name: 'look', value: k }); r.checked = (o.look || 'classic') === k; r.addEventListener('change', () => { o.look = k; refresh(); }); return el('label', { class: 'look' }, [r, el('span', { class: 'lk-art lk-' + k, 'aria-hidden': 'true' }, [el('i'), el('i'), el('i')]), el('b', { text: name }), el('small', { text: txt })]); })), el('p', { class: 'small muted', text: 'The same items and ordering in all three. Try each one and watch the preview.' })]),
      group('Picture size', [field('Pictures on the page', photoSel, 'Smaller pictures make a smaller page that loads faster on phones. Your catalogue file is not changed.'), makeMeter()]),
      group('Stock wording', [field('What buyers are told', stockSel), field('Say "Limited supply" when this many or fewer are left', text(String(o.lowAt || 5), val => { o.lowAt = Math.max(1, Math.min(50, Math.round(+val) || 5)); refresh(); }, '5', 'number'), 'Sold out always shows. Exact numbers never leave your device unless you choose "Exact numbers".')]),
      group('Ordering and money', [field('Ordering', mode), chk('Show an estimated order total', 'total'),
        field('Price note (optional)', text(o.priceNote, val => { o.priceNote = val; refresh(); }, 'Prices in AUD, GST not applicable'), 'Shown under the search bar when prices are on.'),
        field('How to pay (optional)', area(o.pay, val => { o.pay = val; refresh(); }, 'Bank transfer details, PayID, or a PayPal link. Shown in the page footer and when buyers review their order.', 3), 'We only show this text. Payments never go through us.')]),
      group(`Items on the page (${cat.items.length})`, [el('div', { class: 'actions', style: 'margin:0 0 6px' }, [el('button', { type: 'button', class: 'btn sm', text: 'All', onclick: () => setAll(true) }), el('button', { type: 'button', class: 'btn sm', text: 'None', onclick: () => setAll(false) })]), list]),
      el('p', { class: 'small muted', text: 'The "Powered by Lineage Tracker" line at the foot of the page always stays.' }),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Next: the page', onclick: () => go('page') })])]),
    frame]));
  refresh(false);
}

/* 4. the page */
/* Pictures can be shrunk on this device before they go on the page. Your original catalogue file is not changed. */
const PIC = { small: [200, 0.6], medium: [320, 0.72] }, shrunk = new Map();
const picKey = it => it.key + '|' + S.opts.photoSize + '|' + it.photo.length;
function shrinkImg(url, side, q) {
  return new Promise(res => { const im = new Image(); im.onload = () => { try { const sc = Math.min(1, side / Math.max(im.width, im.height)), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(im.width * sc)); c.height = Math.max(1, Math.round(im.height * sc)); c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL('image/jpeg', q)); } catch { res(''); } }; im.onerror = () => res(''); im.src = url; });
}
async function prepPhotos() {
  const sz = PIC[S.opts.photoSize]; if (!sz || !S.cat) return;
  for (const it of S.cat.items) { if (it.photo && S.opts.photos !== false && !shrunk.has(picKey(it))) shrunk.set(picKey(it), await shrinkImg(it.photo, sz[0], sz[1])); }
}
function viewCat() {
  if (!PIC[S.opts.photoSize]) return S.cat;
  return { ...S.cat, items: S.cat.items.map(it => { const p = it.photo && shrunk.get(picKey(it)); return p && p.length < it.photo.length ? { ...it, photo: p } : it; }) };
}
const pageHTML = inline => buildPage(viewCat(), S.brand, S.opts, inline);
const kb = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
let meterEl = null;
function paintMeter() {
  if (!meterEl || !meterEl.isConnected) return;
  const total = new Blob([pageHTML(S.runtime || '')]).size, c = viewCat();
  const pics = c.items.filter(i => !i.hide && S.opts.photos !== false).reduce((t, i) => t + (i.photo || '').length, 0);
  meterEl.textContent = `Your page is about ${kb(total)}${pics ? ', ' + kb(pics) + ' of it pictures' : ''}.` + (total > 3 * 1048576 ? ' That is heavy for phones. Choose Small pictures, or hide pictures.' : total > 1.5 * 1048576 ? ' Fine on a good connection. Small pictures make it quicker on phones.' : '');
  meterEl.className = 'meter' + (total > 3 * 1048576 ? ' warn' : '');
}
const makeMeter = () => { meterEl = el('p', { class: 'meter', 'aria-live': 'polite' }); return meterEl; };
function viewPage(v) {
  const o = S.opts, cat = S.cat; let frame;
  const refresh = async (save = true) => { if (save !== false) saveOpts(); await prepPhotos(); frame.srcdoc = pageHTML(''); paintMeter(); };
  frame = makeFrame();
  v.append(el('div', { class: 'split' }, [
    el('div', {}, [
      field('Page title', text(o.title, val => { o.title = val; refresh(); }, cat.list.name)),
      field('Introduction (optional)', area(o.intro, val => { o.intro = val; refresh(); }, 'A line or two for buyers.', 3)),
      field('Postage and terms (optional)', area(o.terms, val => { o.terms = val; refresh(); }, 'Postage, returns...', 3), cat.list.postage ? 'Your list already adds: ' + cat.list.postage : ''),
      makeMeter(),
      el('p', { class: 'small muted' }, ['What shows on the page is set on the ', el('a', { href: '#', text: 'Controls step', onclick: e => { e.preventDefault(); go('controls'); } }), '.']),
      el('div', { class: 'actions' }, [
        el('button', { type: 'button', class: 'btn primary', text: 'Download the page', onclick: download }),
        el('button', { type: 'button', class: 'btn', text: 'Print labels in LT-Print', onclick: toPrint }),
        el('button', { type: 'button', class: 'btn', text: 'Next: share', onclick: () => go('share') })]),
      el('p', { class: 'small muted', text: 'The page is a single file. Put it on your own website or a free web host such as GitHub Pages, Cloudflare Pages or Netlify, then share the link (the Share tab has a guide). (Google Drive and Dropbox links usually show the page as plain code, so they are not good hosts for it.) Nothing is sent to us.' })]),
    frame]));
  refresh(false);
}
function slug(s) { return String(s || 'catalogue').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'catalogue'; }
async function download() {
  await prepPhotos();
  if (!S.runtime) { toast('The page script could not be loaded. Check your connection and reload.'); return; }
  downloadText(`${slug(S.opts.title)}.html`, pageHTML(S.runtime), 'text/html');
  toast('Page downloaded. Put the file on your site or Drive, then share its link.', 5000);
}
function toPrintQr() { if (!S.url) { toast('Add your catalogue link first'); return; } const ok = putHandoff('print', { source: 'catalogue', label: 'QR link stickers', csv: 'Title,Link,Seller\n' + [S.opts.title || S.cat.list.name, S.url, S.brand.name || S.cat.sender.name].map(x => /[",]/.test(x) ? '"' + String(x).replace(/"/g, '""') + '"' : x).join(','), brand: hasBrand(S.brand) ? S.brand : null }); if (ok) location.href = rootUrl('print/'); }
function toPrintOrders(csv, label, skipped) {
  const ok = putHandoff('print', { source: 'orders', kind: 'address', label, csv, brand: hasBrand(S.brand) ? S.brand : null });
  if (!ok) { toast('Could not pass the orders to LT-Print on this device'); return; }
  location.href = rootUrl('print/');
}
async function updateItems() { const f = await pickFile('.json,application/json'); if (!f) return; try { load(readCatalogue(await f.text())); go('orders'); } catch (e) { toast(e.message, 6000); } }
function toPrintItems() { toPrint(); }
function toPrint() {
  const { text, count } = csvRows(S.cat, S.brand);
  if (!count) { toast('Include at least one item first'); return; }
  const ok = putHandoff('print', { source: 'catalogue', label: S.cat.list.name || 'catalogue', csv: text, brand: hasBrand(S.brand) ? S.brand : null });
  if (!ok) { toast('Could not pass the items to LT-Print on this device'); return; }
  location.href = rootUrl('print/');
}

/* 4. share */
function postText(kind) {
  const b = S.brand, c = S.cat, n = c.items.filter(i => !i.hide).length, name = b.name || c.sender.name || 'Our';
  const top = c.items.filter(i => !i.hide && i.available !== 0).slice(0, 6).map(i => i.name);
  const link = S.url || '[link to your catalogue]';
  const bb = kind === 'bb';
  return [bb ? `[b]${S.opts.title || c.list.name}[/b]` : `${S.opts.title || c.list.name}`, `${n} items${name ? ' from ' + name : ''}${b.area ? ' (' + b.area + ')' : ''}.`, S.opts.intro || '', top.length ? '\n' + (bb ? '[list]\n' + top.map(t => '[*]' + t).join('\n') + '\n[/list]' : top.map(t => '• ' + t).join('\n')) + (n > top.length ? '\n…and more' : '') : '', `\nBrowse and order: ${bb ? `[url=${link}]${link}[/url]` : link}`, b.email ? `Questions: ${b.email}` : '', b.web ? `Website: ${b.web}` : '', ...String(b.social || '').split(/[\s,]+/).filter(x => /^https?:\/\//.test(x) || /^[a-z0-9.-]+\.[a-z]{2,}\//i.test(x)).slice(0, 3), '', bb ? '[i]Powered by [url=https://lineagetracker.org]Lineage Tracker[/url], free[/i]' : 'Powered by Lineage Tracker, free at lineagetracker.org'].filter((x, i, a) => x !== '' || (i > 0 && a[i - 1] !== '' && i < a.length - 1)).join('\n');
}
function flyerHTML() {
  const b = S.brand, c = S.cat, ink = b.ink, ac = b.accent, name = b.name || c.sender.name || '';
  const qr = S.url ? QR.svg(S.url, { dark: ink, light: '#ffffff', quiet: 2 }) : '';
  const e = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const top = c.items.filter(i => !i.hide && i.available !== 0).slice(0, 5).map(i => e(i.name));
  return `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:A5;margin:0}*{box-sizing:border-box}body{margin:0;font-family:system-ui,Arial,sans-serif;color:#1f2b40;width:148mm;height:210mm;padding:12mm;display:flex;flex-direction:column;border-top:10mm solid ${ac}}
.lg{height:22mm;object-fit:contain;align-self:flex-start;margin-bottom:6mm}h1{margin:0 0 3mm;font-size:30pt;line-height:1.05;color:${ink}}p{margin:0 0 3mm;font-size:12pt}.by{font-weight:700;color:${ac}}ul{margin:2mm 0 4mm;padding-left:5mm;font-size:12pt}.q{margin-top:auto;display:flex;gap:6mm;align-items:center}.q svg{width:42mm;height:42mm;flex:none}.u{word-break:break-all;font-weight:700;font-size:10pt}.f{margin-top:6mm;font-size:8pt;color:#5d6470}</style></head><body>
${b.logo ? `<img class="lg" src="${b.logo}" alt="">` : ''}<h1>${e(S.opts.title || c.list.name)}</h1>${name ? `<p class="by">${e(name)}${b.tagline ? ' · ' + e(b.tagline) : ''}</p>` : ''}${S.opts.intro ? `<p>${e(S.opts.intro)}</p>` : ''}${top.length ? `<ul>${top.map(t => `<li>${t}</li>`).join('')}</ul>` : ''}
<div class="q">${qr}<div><p><b>${qr ? 'Scan to browse and order' : 'Add your catalogue link to show a QR code'}</b></p>${S.url ? `<p class="u">${e(S.url)}</p>` : ''}${b.email ? `<p>${e(b.email)}</p>` : ''}${b.phone ? `<p>${e(b.phone)}</p>` : ''}${b.web ? `<p>${e(b.web)}</p>` : ''}${b.social ? `<p>${e(b.social)}</p>` : ''}</div></div><p class="f">Powered by Lineage Tracker, free at lineagetracker.org</p></body></html>`;
}
function viewShare(v) {
  let plain, bb, fr;
  const urlIn = text(S.url, val => { S.url = val.trim(); saveProject(); plain.value = postText('plain'); bb.value = postText('bb'); fr.srcdoc = flyerHTML(); }, 'https://…/my-catalogue.html', 'url');
  plain = el('textarea', { class: 'post', readonly: true }); bb = el('textarea', { class: 'post', readonly: true });
  plain.value = postText('plain'); bb.value = postText('bb');
  const copy = (ta, label) => el('button', { type: 'button', class: 'btn sm', text: label, onclick: async () => { try { await navigator.clipboard.writeText(ta.value); toast('Copied'); } catch { ta.select(); toast('Press copy on your keyboard'); } } });
  fr = el('iframe', { class: 'pv flyer', title: 'Flyer preview', sandbox: 'allow-modals allow-same-origin' }); fr.srcdoc = flyerHTML();
  const opt = (t, d) => el('li', {}, [el('b', { text: t + ' ' }), el('span', { text: d })]);
  v.append(el('div', { class: 'card', id: 'hosting' }, [el('h2', { text: 'Where to put your page' }),
    el('ul', { class: 'small' }, [
      opt('Forum or social post.', 'Share the link in a post. Copy the text below.'),
      opt('A free host with a free address.', 'GitHub Pages, Cloudflare Pages or Netlify give you an address such as yourname.github.io at no cost.'),
      opt('Your own domain.', 'Buy a name such as yourshop.com.au (about $15 to $25 a year) and point it at a free host. To a visitor it looks like a website.')]),
    el('p', { class: 'small muted', text: 'The limits: it is one page with no card checkout, orders arrive as an email, it is a snapshot you upload again when stock or prices change, and we cannot promise how search engines rank it.' }),
    el('p', { class: 'small' }, [el('a', { href: 'host-guide.html', target: '_blank', rel: 'noopener', text: 'Read the step by step guide' })])]),
    el('p', { class: 'muted', text: 'Once your page is online, paste its link here for a forum post and a flyer with a QR code. The link is kept on this device.' }),
    field('Link to your page', urlIn, 'Optional until you have uploaded the page.'),
    el('div', { class: 'split', style: 'grid-template-columns:repeat(auto-fit,minmax(280px,1fr))' }, [
      el('div', {}, [el('h2', { text: 'Forum post' }), el('p', { class: 'lbl', text: 'Plain text (Facebook, Discord, email)' }), plain, copy(plain, 'Copy text'), el('p', { class: 'lbl', style: 'margin-top:14px', text: 'BBCode (most forums)' }), bb, copy(bb, 'Copy BBCode')]),
      el('div', {}, [el('h2', { text: 'Flyer (A5)' }), fr, el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Print the flyer', onclick: () => { try { fr.contentWindow.focus(); fr.contentWindow.print(); } catch { toast('Printing is not available here'); } } }),
        el('button', { type: 'button', class: 'btn', text: 'Make QR stickers in LT-Print', onclick: toPrintQr })])])]));
}
