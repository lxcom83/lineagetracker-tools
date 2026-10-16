/* LT-Print: the design file format, record fields, and turning Lineage Tracker records into label rows.

   A design (template) file, .ltprint (JSON):
   { app:'lt-print', format:'lt-print-template', v:1, name, kind, w, h, radius, bg, fold:{on,gap}, items:[...], assets:{id:dataURL} }
   kind: which records it is for (individual = plants and animals, stock = seed lots and stock, place, strain = varieties
         and breeds, table = a spreadsheet's own columns).
   Sizes are millimetres; text sizes are points. Items are listed front first (like the feature tree).
   Item: {id, type, name, x, y, w, h, rot, hidden, locked, off, ...type settings}; a group is {id, type:'group', name, open, children}.
   Text holds {field} placeholders, filled from each record when printing.

   Files can come from anyone (people share designs), so everything is checked by cleanTemplate() before use. */
import { uid } from '../kit/core.js';

export const FORMAT = 'lt-print-template', VERSION = 1, EXT = '.ltprint';
export const KINDS = {
  individual: { name: 'Plants and animals', one: 'plant or animal' },
  stock: { name: 'Seed lots and stock', one: 'lot' },
  place: { name: 'Places', one: 'place' },
  strain: { name: 'Varieties and breeds', one: 'variety or breed' },
  table: { name: 'My own spreadsheet', one: 'row' },
};
export const FONTS = {
  body: { name: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible',Arial,sans-serif" },
  head: { name: 'Barlow Condensed', css: "'Barlow Condensed','Arial Narrow',sans-serif" },
  arial: { name: 'Arial', css: 'Arial,Helvetica,sans-serif' },
  serif: { name: 'Georgia', css: "Georgia,'Times New Roman',serif" },
  mono: { name: 'Monospace', css: "'Courier New',monospace" },
};
export const TYPES = { text: 'Text', qr: 'QR code', barcode: 'Barcode', rect: 'Rectangle', ellipse: 'Ellipse', line: 'Line', image: 'Picture', group: 'Group' };

/* ---------- fields ---------- */
const COMMON = [['today', 'Today\'s date'], ['year', 'This year'], ['number', 'Number (counts up)']];
export const SPECIAL = new Set(['today', 'year', 'number']);
const FIELDS = {
  individual: [['title', 'Tag or name'], ['code', 'Tag or ID'], ['name', 'Nickname'], ['strain', 'Variety or breed'], ['group', 'Group (e.g. Pumpkin)'], ['species', 'Species'], ['gen', 'Generation'], ['started', 'Sown or hatched (with words)'], ['date', 'Start date'], ['place', 'Place'], ['parents', 'Parents'], ['mother', 'Mother'], ['father', 'Father'], ['sex', 'Sex'], ['status', 'Status'], ['project', 'Project'], ['notes', 'Notes'], ['link', 'Link to the record (for QR codes)']],
  stock: [['title', 'Lot name'], ['strain', 'Variety or breed'], ['group', 'Group (e.g. Pumpkin)'], ['species', 'Species'], ['source', 'Source'], ['batch', 'Batch'], ['year_packed', 'Packed or bought'], ['qty', 'Quantity'], ['best', 'Best before'], ['where', 'Stored where'], ['parents', 'Parents'], ['project', 'Project'], ['notes', 'Notes'], ['link', 'Link to the record (for QR codes)']],
  place: [['title', 'Place name'], ['method', 'Method or housing'], ['details', 'Details'], ['link', 'Link to the record (for QR codes)']],
  strain: [['title', 'Variety or breed'], ['group', 'Group (e.g. Pumpkin)'], ['species', 'Species'], ['origin', 'Origin'], ['description', 'Description'], ['link', 'Link to the record (for QR codes)']],
};
export function fieldsFor(kind, columns = []) {
  const own = kind === 'table' ? columns.map(c => [c, c]) : FIELDS[kind] || [];
  return [...own, ...COMMON].map(([key, label]) => ({ key, label }));
}
const plantSample = {
  individual: { title: 'Tomato 12', code: 'Tomato 12', name: 'Big Red', strain: 'Black Cherry', group: 'Tomato', species: 'Solanum lycopersicum', gen: 'Generation F3', started: 'Sown 14 Oct 2026', date: '14 Oct 2026', place: 'Bed 2', parents: 'Tomato 3 × Tomato 8', mother: 'Tomato 3', father: 'Tomato 8', sex: '', status: 'Active', project: 'Dark cherry line', notes: 'Strong vine, early fruit', link: 'https://app.lineagetracker.org/#/ind/example' },
  stock: { title: 'Black Cherry', strain: 'Black Cherry', group: 'Tomato', species: 'Solanum lycopersicum', source: 'Saved from Bed 2', batch: 'Batch 3', year_packed: '2026', qty: '40 seeds', best: 'Best before Jun 2029', where: 'Seed box A', parents: 'Tomato 3 × Tomato 8', project: 'Dark cherry line', notes: '', link: 'https://app.lineagetracker.org/#/lot/example' },
  place: { title: 'Raised bed 2', method: 'Raised bed', details: '1.2 × 3 m, full sun', link: 'https://app.lineagetracker.org/#/place/example' },
  strain: { title: 'Black Cherry', group: 'Tomato', species: 'Solanum lycopersicum', origin: 'Heirloom', description: 'Dark, sweet cherry tomato.', link: 'https://app.lineagetracker.org/#/strain/example' },
};
const animalSample = {
  individual: { title: 'Hen 12', code: 'Hen 12', name: 'Daisy', strain: 'Blue Australorp', group: 'Chicken', species: 'Gallus gallus domesticus', gen: 'Generation F2', started: 'Hatched 14 Oct 2026', date: '14 Oct 2026', place: 'Pen 2', parents: 'Hen 3 × Rooster 8', mother: 'Hen 3', father: 'Rooster 8', sex: 'Female', status: 'Active', project: 'Blue layers', notes: 'Calm, good layer', link: 'https://app.lineagetracker.org/#/ind/example' },
  stock: { title: 'Blue Australorp eggs', strain: 'Blue Australorp', group: 'Chicken', species: 'Gallus gallus domesticus', source: 'Pen 2', batch: 'Batch 3', year_packed: '2026', qty: '12 eggs', best: '', where: 'Egg room', parents: 'Hen 3 × Rooster 8', project: 'Blue layers', notes: '', link: 'https://app.lineagetracker.org/#/lot/example' },
  place: { title: 'Pen 2', method: 'Pen', details: 'Breeding pen, 4 m²', link: 'https://app.lineagetracker.org/#/place/example' },
  strain: { title: 'Blue Australorp', group: 'Chicken', species: 'Gallus gallus domesticus', origin: 'Australia', description: 'Calm utility breed, good layer.', link: 'https://app.lineagetracker.org/#/strain/example' },
};
export function sampleRow(kind, animal = false, columns = []) {
  if (kind === 'table') return Object.fromEntries(columns.map(c => [c, c]));
  return { ...((animal ? animalSample : plantSample)[kind] || {}) };
}
export function commonValues() {
  const d = new Date();
  return { today: d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }), year: String(d.getFullYear()) };
}
/* Dates with a sum: {today+3y}, {date+90d}, {best-6m}. d days, w weeks, m months, y years. The base is today, or a
   record's date (rows keep the plain date under "<field>@"), or a spreadsheet value written as 2026-10-16. */
const DATE_SUM = /^(.+?)\s*([+-])\s*(\d{1,4})\s*([dwmy])$/;
export const dateText = d => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
function dateSum(key, row) {
  const m = DATE_SUM.exec(key); if (!m) return null;
  const base = m[1].trim(), own = Object.prototype.hasOwnProperty.call(row, base + '@') ? row[base + '@'] : Object.prototype.hasOwnProperty.call(row, base) ? row[base] : '';
  let d;
  if (base === 'today') d = new Date();
  else { const iso = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(String(own || '')); if (!iso) return ''; d = new Date(+iso[1], +iso[2] - 1, +(iso[3] || 1)); }
  const n = (m[2] === '-' ? -1 : 1) * +m[3];
  if (m[4] === 'd') d.setDate(d.getDate() + n); else if (m[4] === 'w') d.setDate(d.getDate() + 7 * n);
  else { const day = d.getDate(); d.setDate(1); d.setMonth(d.getMonth() + (m[4] === 'y' ? 12 * n : n)); d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate())); }
  return dateText(d);
}
export const baseKey = k => { const m = DATE_SUM.exec(k.trim()); return m ? m[1].trim() : k.trim(); };
/* Fill {field} placeholders. Returns {text, any, all}: whether any / all of the fields used had a value. */
export function fill(tpl, row) {
  let used = 0, filled = 0;
  const text = String(tpl ?? '').replace(/\{([^{}\n]{1,60})\}/g, (m, k) => {
    used++;
    const key = k.trim(), sum = Object.prototype.hasOwnProperty.call(row, key) ? null : dateSum(key, row);
    const v = sum != null ? sum : Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null;
    if (v == null || v === '') return '';
    filled++; return String(v);
  });
  return { text, used, any: used === 0 || filled > 0, all: filled === used };
}

/* ---------- Lineage Tracker records → rows ---------- */
function fmtDate(s) {
  if (!s) return '';
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s); if (!m) return String(s);
  const d = new Date(+m[1], +m[2] - 1, +(m[3] || 1));
  return d.toLocaleDateString(undefined, m[3] ? { day: 'numeric', month: 'short', year: 'numeric' } : { month: 'short', year: 'numeric' });
}
const fmtNum = n => (Number.isFinite(+n) ? String(Math.round(+n * 100) / 100) : String(n));
const LINK = { strain: '#/strain/', stock: '#/lot/', individual: '#/ind/', place: '#/place/' };
/* data: the app's export ({records:[...]}) or synced copy. appUrl: where QR codes should open. */
export function rowsFromApp(data, appUrl) {
  const recs = (data && Array.isArray(data.records) ? data.records : []).filter(r => r && typeof r === 'object' && !r.deletedAt && !r.purged);
  const byId = new Map(recs.map(r => [r.id, r]));
  const get = id => (id ? byId.get(id) : null);
  const kindOf = (r, d = 0) => { if (!r || d > 4) return 'plant'; if (r.kind) return r.kind; return kindOf(get(r.strainId) || get(r.projectId) || get(r.stockId), d + 1); };
  const title = r => {
    if (!r) return '';
    if (r.type === 'individual') return r.code || r.name || 'Untagged';
    if (r.type === 'stock') { if (r.label) return r.label; const s = get(r.strainId); if (s) return r.code ? `${s.name}-${r.code}` : s.name; const c = get(r.crossId); if (c) return `${short(get(c.motherId))} × ${short(get(c.fatherId))} seed`; return 'Unnamed lot'; }
    return r.name || 'Unnamed';
  };
  const short = r => (r ? (r.type === 'individual' ? (r.code || r.name) : title(r)) : '?');
  const parentsOf = (r, d = 0) => {
    if (!r || r.type === 'strain' || d > 20) return [null, null];
    if (r.cloneOf) { const src = get(r.cloneOf); if (src && src.id !== r.id) return parentsOf(src, d + 1); }
    let m = r.motherId, f = r.fatherId;
    if (!m && !f && r.crossId) { const c = get(r.crossId); if (c) { m = c.motherId; f = c.fatherId; } }
    if (!m && !f && r.stockId) { const l = get(r.stockId); if (l) { const p = parentsOf(l, d + 1); m = p[0]?.id; f = p[1]?.id; } }
    return [get(m) || null, get(f) || null];
  };
  const pText = r => { const [m, f] = parentsOf(r); return m || f ? `${m ? short(m) : '?'} × ${f ? short(f) : '?'}` : ''; };
  const base = String(appUrl || '').trim();
  const link = r => (base ? base.replace(/#.*$/, '') + LINK[r.type] + r.id : '');
  const strainBits = r => { const s = get(r.strainId); return { strain: s?.name || '', group: s?.group || '', species: s?.species || '' }; };
  const out = { individual: [], stock: [], place: [], strain: [] };
  for (const r of recs) {
    const animal = kindOf(r) === 'animal';
    if (r.type === 'individual') {
      const [m, f] = parentsOf(r);
      out.individual.push({ _id: r.id, _animal: animal, _status: r.status || '', title: title(r), code: r.code || '', name: r.name || '', ...strainBits(r), gen: r.generation ? `Generation ${r.generation}` : '', started: r.startDate ? `${animal ? 'Hatched or born' : 'Sown'} ${fmtDate(r.startDate)}` : '', date: fmtDate(r.startDate), 'date@': r.startDate || '', 'started@': r.startDate || '', place: get(r.placeId)?.name || '', parents: pText(r), mother: m ? short(m) : '', father: f ? short(f) : '', sex: r.sex || '', status: r.status || '', project: get(r.projectId)?.name || '', notes: r.description || '', link: link(r) });
    } else if (r.type === 'stock') {
      const q = r.qty != null && r.qty !== '' ? `${fmtNum(r.qty)}${r.unit ? ' ' + r.unit : ''}` : r.quantity || '';
      out.stock.push({ _id: r.id, _animal: animal, _status: r.status || '', title: title(r), ...strainBits(r), source: r.source || '', batch: r.batch ? `Batch ${r.batch}` : '', year_packed: r.year ? String(r.year) : '', 'year_packed@': /^\d{4}$/.test(String(r.year || '')) ? `${r.year}-01` : '', qty: q, best: r.bestBefore ? `Best before ${fmtDate(r.bestBefore)}` : '', 'best@': r.bestBefore || '', where: r.location || '', parents: pText(r), project: get(r.projectId)?.name || '', notes: r.notes || '', link: link(r) });
    } else if (r.type === 'place') {
      out.place.push({ _id: r.id, _animal: animal, title: title(r), method: r.method || '', details: r.details || '', link: link(r) });
    } else if (r.type === 'strain') {
      out.strain.push({ _id: r.id, _animal: animal, title: title(r), group: r.group || '', species: r.species || '', origin: r.origin || '', description: r.description || '', link: link(r) });
    }
  }
  const coll = (a, b) => String(a.title).localeCompare(String(b.title), undefined, { numeric: true, sensitivity: 'base' });
  Object.values(out).forEach(l => l.sort(coll));
  return out;
}

/* ---------- spreadsheets (CSV or pasted from a spreadsheet) ---------- */
export function parseTable(text) {
  text = String(text || '').replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; continue; }
    if (c === '"' && cell === '') q = true;
    else if (c === sep) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
    if (rows.length > 5001) break;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const clean = rows.filter(r => r.some(c => String(c).trim() !== ''));
  if (!clean.length) return { columns: [], rows: [] };
  const seen = new Set();
  const columns = clean[0].slice(0, 40).map((h, i) => { let n = String(h).trim().replace(/[{}\n\r]/g, '').slice(0, 40) || `Column ${i + 1}`; if (n === '__proto__') n = 'proto'; while (seen.has(n)) n += ' 2'; seen.add(n); return n; });
  const out = clean.slice(1, 5001).map((r, i) => { const o = { _id: 'row' + (i + 1) }; columns.forEach((c, j) => { o[c] = String(r[j] ?? '').trim().slice(0, 500); }); o.title = o[columns[0]] || ''; return o; });
  return { columns, rows: out };
}

/* ---------- items ---------- */
const clamp = (v, lo, hi, d) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
const r2 = v => Math.round(v * 100) / 100;
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v)) ? String(v).toLowerCase() : d);
const hexOrNone = (v, d) => (v === '' || v === 'none' ? '' : hex(v, d));
const str = (v, max, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);
const pick = (v, list, d) => (list.includes(v) ? v : d);
const ID = v => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : uid());

export function newItem(type, at = {}) {
  const base = { id: uid(), type, name: TYPES[type] || 'Item', x: 2, y: 2, w: 30, h: 8, rot: 0, hidden: false, locked: false, off: false };
  const d = {
    text: { text: 'Text', font: 'body', size: 9, bold: false, italic: false, color: '#000000', align: 'left', valign: 'middle', fit: 'shrink', upper: false, hideEmpty: true, lineH: 1.15, spacing: 0 },
    qr: { w: 18, h: 18, text: '{link}', color: '#000000', hideEmpty: true },
    barcode: { w: 40, h: 12, text: '{title}', color: '#000000', showText: true, textSize: 7, hideEmpty: true },
    rect: { w: 20, h: 10, fill: '#1f3557', stroke: '', sw: 0.3, radius: 0 },
    ellipse: { w: 12, h: 12, fill: '', stroke: '#000000', sw: 0.3 },
    line: { w: 30, h: 2, stroke: '#000000', sw: 0.3, dash: false },
    image: { w: 12, h: 13, asset: 'logo', fit: 'contain', gray: false },
  }[type] || {};
  return { ...base, ...d, ...at };
}
/* Untrusted item → safe item (or null). */
function cleanItem(it, assets, depth = 0) {
  if (!it || typeof it !== 'object' || depth > 4) return null;
  const type = pick(it.type, Object.keys(TYPES), null); if (!type) return null;
  const o = { id: ID(it.id), type, name: str(it.name, 60, TYPES[type]).trim() || TYPES[type], hidden: !!it.hidden, locked: !!it.locked, off: !!it.off };
  if (type === 'group') { o.open = it.open !== false; o.children = (Array.isArray(it.children) ? it.children : []).slice(0, 200).map(c => cleanItem(c, assets, depth + 1)).filter(Boolean); return o; }
  Object.assign(o, { x: r2(clamp(it.x, -500, 1000, 0)), y: r2(clamp(it.y, -500, 1000, 0)), w: r2(clamp(it.w, 0.5, 1000, 20)), h: r2(clamp(it.h, 0.2, 1000, 8)), rot: r2(clamp(it.rot, -360, 360, 0)) });
  if (type === 'text') Object.assign(o, { text: str(it.text, 2000, ''), font: pick(it.font, Object.keys(FONTS), 'body'), size: r2(clamp(it.size, 3, 200, 9)), bold: !!it.bold, italic: !!it.italic, color: hex(it.color, '#000000'), align: pick(it.align, ['left', 'center', 'right'], 'left'), valign: pick(it.valign, ['top', 'middle', 'bottom'], 'middle'), fit: pick(it.fit, ['shrink', 'wrap', 'clip'], 'shrink'), upper: !!it.upper, hideEmpty: it.hideEmpty !== false, lineH: r2(clamp(it.lineH, 0.8, 3, 1.15)), spacing: r2(clamp(it.spacing, -2, 10, 0)) });
  if (type === 'qr') Object.assign(o, { text: str(it.text, 700, '{link}'), color: hex(it.color, '#000000'), hideEmpty: it.hideEmpty !== false });
  if (type === 'barcode') Object.assign(o, { text: str(it.text, 200, '{title}'), color: hex(it.color, '#000000'), showText: it.showText !== false, textSize: r2(clamp(it.textSize, 3, 40, 7)), hideEmpty: it.hideEmpty !== false });
  if (type === 'rect' || type === 'ellipse') Object.assign(o, { fill: hexOrNone(it.fill, ''), stroke: hexOrNone(it.stroke, ''), sw: r2(clamp(it.sw, 0, 10, 0.3)) });
  if (type === 'rect') o.radius = r2(clamp(it.radius, 0, 100, 0));
  if (type === 'line') Object.assign(o, { stroke: hex(it.stroke, '#000000'), sw: r2(clamp(it.sw, 0.05, 10, 0.3)), dash: !!it.dash });
  if (type === 'image') Object.assign(o, { asset: it.asset === 'logo' || (typeof it.asset === 'string' && assets[it.asset]) ? it.asset : 'logo', fit: pick(it.fit, ['contain', 'cover'], 'contain'), gray: !!it.gray });
  return o;
}
const IMG_OK = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
export const MAX_ASSET = 700 * 1024, MAX_ASSETS = 3 * 1024 * 1024;
/* Untrusted file → safe template. Throws a readable error if it is not a design file. */
export function cleanTemplate(t) {
  if (!t || typeof t !== 'object' || t.format !== FORMAT) throw new Error('This is not an LT-Print design file');
  if ((+t.v || 0) > VERSION) throw new Error('This design was made with a newer LT-Print. Please reload the page to get the latest version');
  const assets = {}; let total = 0;
  for (const [k, v] of Object.entries(t.assets && typeof t.assets === 'object' ? t.assets : {}).slice(0, 20)) {
    if (/^[A-Za-z0-9_-]{1,40}$/.test(k) && typeof v === 'string' && v.length <= MAX_ASSET * 1.4 && IMG_OK.test(v) && (total += v.length) <= MAX_ASSETS * 1.4) assets[k] = v;
  }
  const out = {
    app: 'lt-print', format: FORMAT, v: VERSION, name: str(t.name, 80, 'Untitled').trim() || 'Untitled', kind: pick(t.kind, Object.keys(KINDS), 'individual'),
    w: r2(clamp(t.w, 10, 600, 75)), h: r2(clamp(t.h, 5, 600, 25)), radius: r2(clamp(t.radius, 0, 50, 0)), bg: hex(t.bg, '#ffffff'),
    fold: { on: !!(t.fold && t.fold.on), gap: [2, 5, 10].includes(+(t.fold && t.fold.gap)) ? +t.fold.gap : 5 },
    columns: Array.isArray(t.columns) ? t.columns.filter(c => typeof c === 'string').slice(0, 40).map(c => c.replace(/[{}\n\r]/g, '').slice(0, 40)) : [],
    counter: cleanCounter(t.counter),
    own: cleanOwn(t.own),
    items: [], assets,
  };
  out.items = (Array.isArray(t.items) ? t.items : []).slice(0, 300).map(i => cleanItem(i, assets)).filter(Boolean);
  // ids must be unique
  const seen = new Set(); walk(out.items, it => { if (seen.has(it.id)) it.id = uid(); seen.add(it.id); });
  // drop pictures nobody uses
  const used = new Set(); walk(out.items, it => { if (it.type === 'image') used.add(it.asset); });
  for (const k of Object.keys(assets)) if (!used.has(k)) delete assets[k];
  return out;
}
export function blankTemplate(w = 60, h = 30, kind = 'individual') {
  return { app: 'lt-print', format: FORMAT, v: VERSION, name: 'Untitled design', kind, w, h, radius: 0, bg: '#ffffff', fold: { on: false, gap: 5 }, columns: [], counter: cleanCounter(), own: cleanOwn(), items: [], assets: {} };
}

/* ---------- tree helpers ---------- */
export function walk(items, fn, parent = null) { for (const it of items) { fn(it, parent); if (it.children) walk(it.children, fn, it); } }
export function find(items, id) { let hit = null; walk(items, (it, p) => { if (it.id === id) hit = { item: it, parent: p, list: p ? p.children : items }; }); return hit; }
export function remove(items, id) { const f = find(items, id); if (!f) return null; f.list.splice(f.list.indexOf(f.item), 1); return f.item; }
/* every drawable item (not groups), front first, with the flags it inherits from its groups */
export function flat(items, inh = { hidden: false, locked: false, off: false }, out = []) {
  for (const it of items) {
    const f = { hidden: inh.hidden || it.hidden, locked: inh.locked || it.locked, off: inh.off || it.off };
    if (it.children) flat(it.children, f, out); else out.push({ it, ...f });
  }
  return out;
}
export function isInside(items, childId, groupId) { const g = find(items, groupId); if (!g || !g.item.children) return false; let yes = false; walk(g.item.children, it => { if (it.id === childId) yes = true; }); return yes; }
export function descendants(item) { const out = []; if (item.children) walk(item.children, it => { if (!it.children) out.push(it); }); else out.push(item); return out; }

/* ---------- numbering: {number} counts up across the labels of one print ---------- */
export function cleanCounter(c) {
  c = c && typeof c === 'object' ? c : {};
  return { start: Math.round(clamp(c.start, 0, 99999999, 1)), step: Math.round(clamp(c.step, 1, 1000, 1)), digits: Math.round(clamp(c.digits, 1, 10, 3)), prefix: str(c.prefix, 20, '').replace(/[{}]/g, ''), suffix: str(c.suffix, 20, '').replace(/[{}]/g, ''), perCopy: c.perCopy !== false };
}
export const numberText = (c, i) => c.prefix + String(c.start + i * c.step).padStart(c.digits, '0') + c.suffix;

/* ---------- records typed into the design itself ("Type your own"), saved with the design ---------- */
export const MAX_OWN = 2000;
export function cleanOwn(o) {
  o = o && typeof o === 'object' ? o : {};
  const rows = (Array.isArray(o.rows) ? o.rows : []).slice(0, MAX_OWN).filter(r => r && typeof r === 'object').map((r, i) => {
    const out = { _id: typeof r._id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(r._id) ? r._id : 'own' + uid(), _on: r._on !== false, _copies: Math.round(clamp(r._copies, 1, 99, 1)) };
    for (const [k, v] of Object.entries(r)) if (!k.startsWith('_') && k.length <= 60 && !/[{}\n\r]/.test(k) && k !== '__proto__' && (typeof v === 'string' || typeof v === 'number')) out[k] = String(v).slice(0, 500);
    return out;
  });
  return { on: !!o.on, rows };
}
/* the fields a design actually uses (from its text, QR codes and barcodes), in order; the special ones left out */
export function usedFields(t) {
  const out = [];
  // in reading order on the label: top to bottom, then left to right
  const items = flat(t.items).map(f => f.it).filter(it => ['text', 'qr', 'barcode'].includes(it.type)).sort((a, b) => (Math.abs(a.y - b.y) > 1.5 ? a.y - b.y : a.x - b.x));
  for (const it of items) {
    for (const m of String(it.text || '').matchAll(/\{([^{}\n]{1,60})\}/g)) { const k = baseKey(m[1]); if (!SPECIAL.has(k) && k !== 'link' && !out.includes(k)) out.push(k); }
  }
  return out;
}
