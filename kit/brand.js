/* The brand kit shared by the tools: the name, logo, colour and contact details a seller wants on everything they make.
   LT-Catalogue uses it for the page and flyer, LT-Print offers it as ready-made label pieces.
   Kept on this device only (never sent to us). "Hand-offs" carry rows from one tool to the next on the same device. */
import { store } from './core.js';

const KEY = 'lt_brand', HAND = 'lt_handoff';
export const LOGO_MAX = 150 * 1024;                     // characters of data URL kept for the logo
const HEX = /^#[0-9a-fA-F]{6}$/, IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const s = (v, n) => String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
const url = v => { v = s(v, 200); if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(\/\S*)?$/i.test(v)) v = 'https://' + v; return /^https?:\/\/[^\s<>"']+$/i.test(v) ? v : ''; };
const mail = v => { v = s(v, 120); return /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v) ? v : ''; };

export const blankBrand = () => ({ name: '', tagline: '', logo: '', accent: '#C8794A', ink: '#1F3557', email: '', phone: '', web: '', area: '', post: '', social: '', note: '' });
export function cleanBrand(b) {
  b = b && typeof b === 'object' ? b : {};
  const o = blankBrand();
  o.name = s(b.name, 80); o.tagline = s(b.tagline, 120);
  o.logo = typeof b.logo === 'string' && b.logo.length <= LOGO_MAX * 1.4 && IMG.test(b.logo) ? b.logo : '';
  o.accent = HEX.test(b.accent) ? b.accent : o.accent; o.ink = HEX.test(b.ink) ? b.ink : o.ink;
  o.email = mail(b.email); o.phone = s(b.phone, 40); o.web = url(b.web); o.area = s(b.area, 80); o.post = s(b.post, 160); o.social = s(b.social, 500); o.note = s(b.note, 240);
  return o;
}
export const getBrand = () => cleanBrand(store.get(KEY, null));
export const hasBrand = b => !!(b && (b.name || b.logo));
export function setBrand(b) { const c = cleanBrand(b); return { ok: store.set(KEY, c), brand: c }; }

/* Shrink a picked image to a small logo (fits the label designer's limit too). */
export async function logoFromFile(file) {
  const u = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = u; await img.decode();
    for (const max of [360, 260, 180]) {
      const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const png = c.toDataURL('image/png');
      if (png.length <= LOGO_MAX) return png;
      const jpg = (() => { const d = document.createElement('canvas'); d.width = c.width; d.height = c.height; const x = d.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, d.width, d.height); x.drawImage(c, 0, 0); return d.toDataURL('image/jpeg', 0.85); })();
      if (jpg.length <= LOGO_MAX) return jpg;
    }
    throw new Error('too big');
  } finally { URL.revokeObjectURL(u); }
}

/* Hand-offs: one tool leaves rows for the next. They expire after ten minutes and are used once. */
export function putHandoff(to, data) {
  return store.set(HAND, { to: s(to, 20), at: Date.now(), data });
}
export function takeHandoff(to) {
  const h = store.get(HAND, null);
  if (!h || h.to !== to || !h.at || Date.now() - h.at > 10 * 60000) return null;
  store.del(HAND);
  return h.data && typeof h.data === 'object' ? h.data : null;
}

export const csvCell = v => { v = String(v ?? '').replace(/\r?\n/g, ' '); return /[",\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
