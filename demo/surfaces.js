/* LT-Planner: surface textures drawn on the device (no images to download, works offline, nothing to license).
   Each surface is a small square picture that repeats: lawn, gravel, bark mulch, soil, pavers, decking, timber grain, and a grey
   "detail" picture that is laid over the plain ground colour.  make(kind) returns a canvas; SURFACES says how many metres one
   repeat covers.  Pictures are made once per kind and reused. */

export const SURFACES = {
  lawn:    { name: 'Lawn',            metres: 2.0, colour: '#7fa652' },
  gravel:  { name: 'Gravel',          metres: 1.0, colour: '#c9bfae' },
  mulch:   { name: 'Bark mulch',      metres: 1.4, colour: '#7a5434' },
  soil:    { name: 'Soil',            metres: 1.2, colour: '#4f3a28' },
  pavers:  { name: 'Pavers',          metres: 1.2, colour: '#b9b2a6' },
  decking: { name: 'Decking',         metres: 1.4, colour: '#9a7350' },
  timber:  { name: 'Timber',          metres: 0.8, colour: '#9a6a3e' },
  detail:  { name: 'Ground detail',   metres: 3.0, colour: '#ffffff' },
  // for structures (grey ones are tinted by the item's own colour)
  roof:    { name: 'Corrugated sheet', metres: 0.76, colour: '#ffffff', grey: true },
  stone:   { name: 'Stone',           metres: 1.2, colour: '#9a948a' },
  block:   { name: 'Concrete block',  metres: 0.8, colour: '#a8a39a' },
  brick:   { name: 'Brick',           metres: 0.92, colour: '#a5553a' },
  palings: { name: 'Timber palings',  metres: 0.9, colour: '#8a6b4a' },
  // see-through patterns (transparent where there is no timber or wire): one repeat each
  lattice: { name: 'Lattice',         metres: 0.6, colour: '#ffffff', grey: true, cut: true },
  mesh:    { name: 'Mesh',            metres: 0.3, colour: '#ffffff', grey: true, cut: true },
  pickets: { name: 'Pickets',         metres: 0.9, colour: '#ffffff', grey: true, cut: true },
  slats:   { name: 'Slats',           metres: 0.6, colour: '#ffffff', grey: true, cut: true }
};
export const AREA_SURFACES = ['lawn', 'gravel', 'mulch', 'soil', 'pavers', 'decking'];
export const PATH_SURFACES = ['gravel', 'pavers', 'mulch', 'decking', 'lawn'];

/* a surface for an area that has none yet, from its name and colour */
export function guessSurface(it) {
  const n = String(it.name || '').toLowerCase();
  if (/lawn|grass|turf/.test(n)) return 'lawn';
  if (/gravel|stone|pebble|crushed/.test(n)) return 'gravel';
  if (/mulch|bark|chip/.test(n)) return 'mulch';
  if (/pav|patio|brick|concrete|flag/.test(n)) return 'pavers';
  if (/deck|boardwalk/.test(n)) return 'decking';
  if (/soil|dirt|veg|bed|plot|garden/.test(n)) return 'soil';
  const c = String(it.fill || '').replace('#', ''), r = parseInt(c.slice(0, 2), 16), g = parseInt(c.slice(2, 4), 16), b = parseInt(c.slice(4, 6), 16);
  if (!(r >= 0)) return 'lawn';
  if (g > r + 10 && g > b) return 'lawn';
  if (r > g + 25 && g > b) return r + g + b < 360 ? 'soil' : 'mulch';
  return 'gravel';
}

const cache = new Map();
export function make(kind, size = 256) {
  const key = kind + ':' + size; if (cache.has(key)) return cache.get(key);
  const c = (typeof OffscreenCanvas !== 'undefined' && typeof document === 'undefined') ? new OffscreenCanvas(size, size) : Object.assign(document.createElement('canvas'), { width: size, height: size });
  const x = c.getContext('2d'), S = size; let seed = 1; for (const ch of kind) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const R = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
  // draw a shape at (px, py) and again wherever it crosses an edge, so the picture repeats without seams
  const wrap = (px, py, r, fn) => { for (const dx of [-S, 0, S]) for (const dy of [-S, 0, S]) { const X = px + dx, Y = py + dy; if (X > -r && X < S + r && Y > -r && Y < S + r) fn(X, Y); } };
  const blob = (px, py, rx, ry, rot, fill) => wrap(px, py, Math.max(rx, ry) + 1, (X, Y) => { x.fillStyle = fill; x.beginPath(); x.ellipse(X, Y, rx, ry, rot, 0, Math.PI * 2); x.fill(); });
  if (kind === 'lawn' || kind === 'detail') {
    const base = kind === 'lawn' ? [92, 38, 40] : [0, 0, 86];
    x.fillStyle = hsl(...base); x.fillRect(0, 0, S, S);
    for (let i = 0; i < S * 14; i++) {   // blades of grass: short strokes, mostly upright, light and dark
      const px = R() * S, py = R() * S, len = 3 + R() * 7, a = -Math.PI / 2 + (R() - 0.5) * 0.9, l = base[2] + (R() - 0.5) * (kind === 'lawn' ? 22 : 30);
      wrap(px, py, len + 1, (X, Y) => { x.strokeStyle = kind === 'lawn' ? hsl(base[0] + (R() - 0.5) * 16, base[1] + R() * 10, l, 0.55) : hsl(0, 0, l, 0.5); x.lineWidth = 1; x.beginPath(); x.moveTo(X, Y); x.lineTo(X + Math.cos(a) * len, Y + Math.sin(a) * len); x.stroke(); });
    }
  } else if (kind === 'gravel') {
    x.fillStyle = hsl(38, 14, 66); x.fillRect(0, 0, S, S);
    for (let i = 0; i < S * 9; i++) { const r = 1.2 + R() * 3.2, l = 48 + R() * 36; blob(R() * S, R() * S, r, r * (0.6 + R() * 0.4), R() * 3, hsl(30 + R() * 25, 6 + R() * 14, l)); }
    for (let i = 0; i < S * 2; i++) blob(R() * S, R() * S, 0.8 + R(), 0.8, 0, hsl(30, 10, 30 + R() * 10, 0.6));   // shadows between stones
  } else if (kind === 'mulch') {
    x.fillStyle = hsl(24, 38, 24); x.fillRect(0, 0, S, S);
    for (let i = 0; i < S * 6; i++) { const L = 4 + R() * 10; blob(R() * S, R() * S, L, 1 + R() * 2.2, R() * Math.PI, hsl(20 + R() * 12, 22 + R() * 18, 20 + R() * 22)); }
  } else if (kind === 'soil') {
    x.fillStyle = hsl(26, 32, 22); x.fillRect(0, 0, S, S);
    for (let i = 0; i < S * 22; i++) { const r = 0.6 + R() * 1.6; blob(R() * S, R() * S, r, r, 0, hsl(22 + R() * 12, 22 + R() * 20, 12 + R() * 22, 0.8)); }
    for (let i = 0; i < S / 2; i++) { const r = 2 + R() * 4; blob(R() * S, R() * S, r, r * 0.7, R() * 3, hsl(24, 26, 28 + R() * 10, 0.7)); }   // clods
  } else if (kind === 'pavers') {
    const n = 3, w = S / n; x.fillStyle = hsl(36, 6, 42); x.fillRect(0, 0, S, S);   // grout
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const l = 62 + R() * 14; x.fillStyle = hsl(34 + R() * 10, 8 + R() * 8, l); x.fillRect(i * w + 3, j * w + 3, w - 6, w - 6);
      for (let k = 0; k < 120; k++) { x.fillStyle = hsl(30, 6, l + (R() - 0.5) * 14, 0.5); x.fillRect(i * w + 3 + R() * (w - 8), j * w + 3 + R() * (w - 8), 2, 2); } }
  } else if (kind === 'decking' || kind === 'timber') {
    const boards = kind === 'decking' ? 5 : 3, h = S / boards;
    for (let b = 0; b < boards; b++) {
      const l = 36 + R() * 12; x.fillStyle = hsl(26 + R() * 6, 38 + R() * 10, l); x.fillRect(0, b * h, S, h);
      for (let k = 0; k < 26; k++) { const y0 = b * h + R() * h; x.strokeStyle = hsl(24, 40, l - 8 - R() * 8, 0.55); x.lineWidth = 0.8 + R(); x.beginPath(); x.moveTo(0, y0); for (let t = 0; t <= S; t += 16) x.lineTo(t, y0 + Math.sin(t / 30 + k) * 1.5); x.stroke(); }
      x.fillStyle = hsl(24, 30, 18, 0.9); x.fillRect(0, b * h, S, kind === 'decking' ? 3 : 1.5);   // gap between boards
    }
  } else if (kind === 'roof') {   // corrugated iron: soft light and dark bands, grey so the roof colour tints it
    const n = 8, w = S / n; for (let i = 0; i < S; i++) { const t = Math.sin((i / w) * Math.PI * 2); x.fillStyle = hsl(0, 0, 70 + t * 18); x.fillRect(i, 0, 1, S); }
    for (let i = 0; i < 300; i++) { x.fillStyle = hsl(0, 0, 60 + R() * 30, 0.08); x.fillRect(R() * S, R() * S, 2 + R() * 6, 1); }
  } else if (kind === 'stone') {   // a dry-stone wall: rounded stones of mixed size, dark gaps
    x.fillStyle = hsl(30, 8, 30); x.fillRect(0, 0, S, S);
    for (let row = 0, y = 0; row < 7; row++) { const h = S / 7; let px = (row % 2) * 14; while (px < S + 20) { const w = 22 + R() * 34; blob(px + w / 2, y + h / 2, w / 2 - 2, h / 2 - 2.5, (R() - 0.5) * 0.3, hsl(30 + R() * 20, 6 + R() * 10, 48 + R() * 22)); px += w; } y += h; }
  } else if (kind === 'block' || kind === 'brick') {   // running bond: each course offset by half a unit
    const rows = kind === 'brick' ? 12 : 4, cols = kind === 'brick' ? 4 : 2, h = S / rows, w = S / cols, m = kind === 'brick' ? 2.5 : 3;
    x.fillStyle = kind === 'brick' ? hsl(30, 10, 72) : hsl(30, 4, 52); x.fillRect(0, 0, S, S);
    for (let j = 0; j < rows; j++) for (let i = -1; i <= cols; i++) { const ox = (j % 2) * w / 2, l = kind === 'brick' ? 34 + R() * 12 : 62 + R() * 8;
      x.fillStyle = kind === 'brick' ? hsl(10 + R() * 10, 45 + R() * 15, l) : hsl(35, 4 + R() * 4, l); x.fillRect(i * w + ox + m / 2, j * h + m / 2, w - m, h - m);
      for (let k = 0; k < 30; k++) { x.fillStyle = hsl(20, 10, l + (R() - 0.5) * 16, 0.4); x.fillRect(i * w + ox + R() * w, j * h + R() * h, 2, 2); } }
  } else if (kind === 'palings') {   // upright boards side by side
    const n = 6, w = S / n; for (let i = 0; i < n; i++) { const l = 34 + R() * 12; x.fillStyle = hsl(26 + R() * 6, 30 + R() * 10, l); x.fillRect(i * w, 0, w, S);
      for (let k = 0; k < 14; k++) { const x0 = i * w + R() * w; x.strokeStyle = hsl(24, 30, l - 8, 0.5); x.lineWidth = 0.8; x.beginPath(); x.moveTo(x0, 0); for (let t = 0; t <= S; t += 16) x.lineTo(x0 + Math.sin(t / 25 + k) * 1.2, t); x.stroke(); }
      x.fillStyle = hsl(24, 30, 16, 0.9); x.fillRect(i * w, 0, 2, S); }
  } else if (kind === 'lattice') {   // timber strips crossing diagonally, gaps see-through
    x.strokeStyle = hsl(0, 0, 82); x.lineWidth = S * 0.09;
    for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(k * S, 0); x.lineTo(k * S + S, S); x.stroke(); x.beginPath(); x.moveTo(k * S + S, 0); x.lineTo(k * S, S); x.stroke(); }
  } else if (kind === 'mesh') {   // square wire mesh
    x.fillStyle = hsl(0, 0, 80); x.fillRect(0, 0, S, 5); x.fillRect(0, 0, 5, S);
  } else if (kind === 'pickets') {   // three pointed pickets with gaps, rails behind
    x.fillStyle = hsl(0, 0, 70); x.fillRect(0, S * 0.25, S, S * 0.06); x.fillRect(0, S * 0.75, S, S * 0.06);
    const w = S / 3; for (let i = 0; i < 3; i++) { x.fillStyle = hsl(0, 0, 88 - R() * 6); x.beginPath(); x.moveTo(i * w + w * 0.18, S); x.lineTo(i * w + w * 0.18, S * 0.1); x.lineTo(i * w + w * 0.5, 0); x.lineTo(i * w + w * 0.82, S * 0.1); x.lineTo(i * w + w * 0.82, S); x.fill(); }
  } else if (kind === 'slats') {   // horizontal boards with narrow gaps
    const n = 5, h = S / n; for (let j = 0; j < n; j++) { x.fillStyle = hsl(0, 0, 76 + R() * 12); x.fillRect(0, j * h, S, h * 0.78); }
  }
  cache.set(key, c); return c;
}
