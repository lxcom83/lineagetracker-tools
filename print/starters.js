/* LT-Print: starter designs, rebuilt from the app's five sticker layouts (0.24), and the ready-made sheet layouts.
   Starters are made of ordinary items, so everything in them can be moved, changed, hidden or deleted. */
import { blankTemplate, newItem } from './model.js';

/* Sticker sheets (same as the app): columns, rows, top and left margins, gaps between labels (mm) */
export const SHEETS = {
  s21: { name: '21 per A4 sheet (63.5 × 38.1 mm)', paper: 'a4', w: 63.5, h: 38.1, cols: 3, rows: 7, top: 15.1, left: 7.2, gx: 2.5, gy: 0 },
  s14: { name: '14 per A4 sheet (99.1 × 38.1 mm)', paper: 'a4', w: 99.1, h: 38.1, cols: 2, rows: 7, top: 15.1, left: 4.65, gx: 2.5, gy: 0 },
  s8: { name: '8 per A4 sheet (99.1 × 67.7 mm)', paper: 'a4', w: 99.1, h: 67.7, cols: 2, rows: 4, top: 13, left: 4.65, gx: 2.5, gy: 0 },
  s65: { name: '65 per A4 sheet (38.1 × 21.2 mm)', paper: 'a4', w: 38.1, h: 21.2, cols: 5, rows: 13, top: 10.7, left: 4.7, gx: 2.5, gy: 0 },
};
const HEAD = { individual: '{title}', stock: '{title}', place: '{title}', strain: '{title}', table: '' };
const LINES = {
  individual: [['strain', 'Variety or breed'], ['gen', 'Generation'], ['started', 'Sown or hatched'], ['place', 'Place'], ['parents', 'Parents']],
  stock: [['source', 'Source'], ['batch', 'Batch'], ['year_packed', 'Packed or bought'], ['qty', 'Quantity'], ['best', 'Best before'], ['where', 'Stored where']],
  place: [['method', 'Method or housing'], ['details', 'Details']],
  strain: [['group', 'Group'], ['species', 'Species'], ['origin', 'Origin'], ['description', 'Description']],
};
const mm = pt => pt * 0.3528;
const r2 = v => Math.round(v * 100) / 100;
export const LAYOUTS = {
  tag: { name: 'Small tag', desc: 'Name, a couple of details and a QR code. For stakes, pots, tubes and cage fronts.', n: 2, sizes: [[75, 25], [50, 20], [38.1, 21.2, 's65']] },
  front: { name: 'Front sticker', desc: 'A bigger name with details and a QR code. For jars, boxes and trays.', n: 3, sizes: [[60, 40], [63.5, 38.1, 's21'], [99.1, 38.1, 's14']] },
  branded: { name: 'Branded packet sticker', desc: 'A coloured band with the logo, then the details and a QR code. For seed packets, egg boxes and jars.', n: 4, sizes: [[90, 55], [99.1, 67.7, 's8'], [75, 50]] },
  fold: { name: 'Wrap-around fold-over', desc: 'Prints a second copy upside down below a fold line, so it reads the right way up on both sides of a stake, wire or tube.', n: 3, sizes: [[50, 25], [75, 25], [60, 35]] },
  pen: { name: 'Cage or pen', desc: 'Large and easy to read from a distance.', n: 3, fs: 1.3, sizes: [[100, 70], [99.1, 67.7, 's8'], [148, 105]] },
};
/* layout: key of LAYOUTS; kind: record kind; w, h: label size in mm */
export function starter(layout, kind, w, h, columns = []) {
  const L = LAYOUTS[layout], t = blankTemplate(w, h, kind);
  t.name = `${L.name} ${r2(w)} × ${r2(h)} mm`;
  if (layout === 'fold') t.fold = { on: true, gap: 5 };
  const fs = L.fs || 1, pad = h < 28 ? 1.3 : 2;
  const headPt = Math.min(24, Math.max(9, 6.5 + h * 0.14)) * fs, linePt = Math.min(13, Math.max(7, 5 + h * 0.08)) * fs;
  const band = layout === 'branded' ? Math.max(9, h * 0.2) : 0;
  const markPt = Math.max(4.5, linePt * 0.7), markH = mm(markPt) * 1.5;
  const stack = layout === 'front' || layout === 'pen';
  const headH = mm(headPt) * 1.3, lineH = mm(linePt) * 1.3;
  const qr = r2(Math.max(0, Math.min(h - 2 * pad - band - (stack ? headH : 0), w * 0.42, 60)));
  const items = [];
  const head = kind === 'table' ? (columns[0] ? `{${columns[0]}}` : 'Name') : HEAD[kind];
  if (kind === 'table') t.columns = columns.slice();
  const lines = (kind === 'table' ? columns.slice(1).map(c => [c, c]) : LINES[kind] || []).slice(0, L.n);
  const text = (name, tpl, x, y, ww, hh, pt, extra = {}) => items.push(newItem('text', { name, text: tpl, x: r2(x), y: r2(y), w: r2(ww), h: r2(hh), size: r2(pt), ...extra }));
  if (band) {
    items.push(newItem('rect', { name: 'Band', x: 0, y: 0, w, h: r2(band), fill: '#1f3557', locked: false }));
    const lg = band - 2.5;
    items.push(newItem('image', { name: 'Tree logo', asset: 'logo', x: r2(pad + 0.5), y: 1.25, w: r2(lg * 0.925), h: r2(lg) }));
    text('Band title', 'Lineage Tracker', pad + 1.5 + lg, 0, w - (pad + 1.5 + lg) - pad, band, headPt * 0.95, { bold: true, color: '#ffffff', font: 'head', hideEmpty: false });
  }
  let textX, textW, top = band + pad, bottom = h - pad - markH;
  if (stack) {
    text('Name', head, pad, pad, w - 2 * pad, headH, headPt, { bold: true });
    top = pad + headH + 0.5;
    textX = pad; textW = w - 3 * pad - qr;
    items.push(newItem('qr', { name: 'QR code', x: r2(w - pad - qr), y: r2(top + Math.max(0, (h - pad - top - qr) / 2)), w: qr, h: qr }));
  } else {
    items.push(newItem('qr', { name: 'QR code', x: pad, y: r2(band + (h - band - qr) / 2), w: qr, h: qr }));
    textX = pad + qr + pad * 1.5; textW = w - textX - pad;
    text('Name', head, textX, top, textW, headH, headPt, { bold: true, color: layout === 'branded' ? '#1f3557' : '#000000' });
    top += headH;
  }
  const room = Math.max(0, Math.floor((bottom - top) / lineH));
  lines.slice(0, room).forEach(([k, label], i) => text(label, `{${k}}`, textX, top + i * lineH, textW, lineH, linePt, { color: '#222222' }));
  text('Web address', 'lineagetracker.org', textX, h - pad - markH, textW, markH, markPt, { color: '#555555', hideEmpty: false });
  t.items = items.reverse();   // front first: the last added sits on top
  return t;
}
export function starterList(kind) {
  // (kind 'table' starters take the spreadsheet's columns, passed to starter())
  const out = [];
  for (const [k, L] of Object.entries(LAYOUTS)) for (const [w, h, sheet] of L.sizes) out.push({ layout: k, kind, w, h, sheet: sheet || '', name: L.name, desc: L.desc, size: `${w} × ${h} mm${sheet ? ' · ' + SHEETS[sheet].name.split(' (')[0] : ''}` });
  return out;
}
