/* LT-Planner ground heights.  No DOM, so it can be tested on its own (qa: planner_terrain_test.mjs).

   The ground is a grid of heights over the site, in metres, one value every `cell` metres (1 m is a good size; 2 m or 5 m is fine for
   a big farm).  Plan coordinates: x across, y down, (0, 0) = top-left of the site, as in model.js.  Heights are above sea level or above
   any base you like: only the differences matter inside a plan.

   Real mapping data comes in as FILES the member supplies (nothing is uploaded or fetched):
     - ASCII grid (.asc), the plain-text form of the free 1 m LiDAR ground models (NSW Spatial Services / Geoscience Australia ELVIS)
     - point files (.csv / .xyz / .txt: x y height per line), e.g. from a surveyor
   and are placed on the site from the plan's latitude, longitude and north.  Map coordinates may be metres in a UTM or MGA zone, or plain
   longitude / latitude in degrees.

   In a plan file the grid is stored as { cell, nx, ny, base64 of Int16 centimetres }, so a 20 acre site at 1 m is about 220 KB of text. */

const D2R = Math.PI / 180;

/* ---------- map coordinates: UTM / MGA (WGS84 and GDA2020 differ by about a metre, fine for a garden) ---------- */
const A = 6378137, F = 1 / 298.257223563, K0 = 0.9996, E2 = F * (2 - F), EP2 = E2 / (1 - E2);
export const utmZone = lon => Math.min(60, Math.max(1, Math.floor((lon + 180) / 6) + 1));
export function latLonToUtm(lat, lon, zone = utmZone(lon)) {
  const phi = lat * D2R, lam = lon * D2R, lam0 = ((zone - 1) * 6 - 180 + 3) * D2R;
  const N = A / Math.sqrt(1 - E2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = EP2 * Math.cos(phi) ** 2, a = Math.cos(phi) * (lam - lam0);
  const M = A * ((1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256) * phi - (3 * E2 / 8 + 3 * E2 ** 2 / 32 + 45 * E2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * E2 ** 2 / 256 + 45 * E2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * E2 ** 3 / 3072) * Math.sin(6 * phi));
  const e = K0 * N * (a + (1 - T + C) * a ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * EP2) * a ** 5 / 120) + 500000;
  let n = K0 * (M + N * Math.tan(phi) * (a * a / 2 + (5 - T + 9 * C + 4 * C * C) * a ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * EP2) * a ** 6 / 720));
  if (lat < 0) n += 10000000;
  return { e, n, zone };
}
export function utmToLatLon(e, n, zone, south = true) {
  const x = e - 500000, y = south ? n - 10000000 : n, lam0 = ((zone - 1) * 6 - 180 + 3) * D2R;
  const M = y / K0, mu = M / (A * (1 - E2 / 4 - 3 * E2 ** 2 / 64 - 5 * E2 ** 3 / 256));
  const e1 = (1 - Math.sqrt(1 - E2)) / (1 + Math.sqrt(1 - E2));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu) + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const N1 = A / Math.sqrt(1 - E2 * Math.sin(phi1) ** 2), T1 = Math.tan(phi1) ** 2, C1 = EP2 * Math.cos(phi1) ** 2, R1 = A * (1 - E2) / (1 - E2 * Math.sin(phi1) ** 2) ** 1.5, d = x / (N1 * K0);
  const phi = phi1 - (N1 * Math.tan(phi1) / R1) * (d * d / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * EP2) * d ** 4 / 24 + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * EP2 - 3 * C1 * C1) * d ** 6 / 720);
  const lam = lam0 + (d - (1 + 2 * T1 + C1) * d ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * EP2 + 24 * T1 * T1) * d ** 5 / 120) / Math.cos(phi1);
  return { lat: phi / D2R, lon: lam / D2R };
}

/* ---------- the height grid ---------- */
export const MAX_NODES = 1500000;   // keeps a typing slip from making a huge grid
export function makeGrid(w, h, cell = 1, fill = 0) {
  cell = Math.max(0.1, +cell || 1);
  while ((Math.floor(w / cell) + 1) * (Math.floor(h / cell) + 1) > MAX_NODES) cell *= 1.25;
  const nx = Math.floor(w / cell) + 1, ny = Math.floor(h / cell) + 1;
  return { cell, nx, ny, z: new Float32Array(nx * ny).fill(fill) };
}
const clampI = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/* height at plan point (x, y), smoothly between grid nodes; outside the grid the nearest edge height is used */
export function heightAt(g, x, y) {
  const fx = clampI(x / g.cell, 0, g.nx - 1), fy = clampI(y / g.cell, 0, g.ny - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(g.nx - 1, x0 + 1), y1 = Math.min(g.ny - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
  const a = g.z[y0 * g.nx + x0], b = g.z[y0 * g.nx + x1], c = g.z[y1 * g.nx + x0], d = g.z[y1 * g.nx + x1];
  return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty;
}
/* slope at a point: { pct (rise over run, %), deg, aspect (degrees clockwise from plan-up, the way the ground faces downhill) } */
export function slopeAt(g, x, y) {
  const s = Math.max(g.cell, 0.5), dzx = (heightAt(g, x + s, y) - heightAt(g, x - s, y)) / (2 * s), dzy = (heightAt(g, x, y + s) - heightAt(g, x, y - s)) / (2 * s), r = Math.hypot(dzx, dzy);
  return { pct: r * 100, deg: Math.atan(r) / D2R, aspect: r < 1e-6 ? 0 : (Math.atan2(-dzx, dzy) / D2R + 360) % 360 };
}
export function range(g) { let lo = Infinity, hi = -Infinity; for (const v of g.z) { if (v < lo) lo = v; if (v > hi) hi = v; } return { min: lo, max: hi }; }


/* ---------- shaping the ground by hand (no map data needed) ---------- */
/* a flat height grid for a site; small gardens get a finer grid than big farms (makeGrid coarsens it if the node count would be too large) */
export function flatSite(w, h) { return makeGrid(w, h, w * h <= 2500 ? 0.25 : w * h <= 40000 ? 0.5 : 1, 0); }
/* a grid that covers a w x h site: the same grid if it already does, otherwise a bigger one (same spacing) with the new edge filled from the nearest old heights.
   Used when the site was made bigger after its ground was shaped or imported, so the new part can be shaped too. */
export function fitGrid(g, w, h) {
  if ((g.nx - 1) * g.cell >= w - 1e-6 && (g.ny - 1) * g.cell >= h - 1e-6) return g;
  const n = makeGrid(Math.max(w, (g.nx - 1) * g.cell), Math.max(h, (g.ny - 1) * g.cell), g.cell);
  for (let j = 0; j < n.ny; j++) for (let i = 0; i < n.nx; i++) n.z[j * n.nx + i] = heightAt(g, i * n.cell, j * n.cell);
  return n;
}
export const SCULPT_OPS = ['raise', 'lower', 'smooth', 'flatten'];
/* one dab of a round brush with a soft edge.  raise/lower: `amount` metres at the centre.  smooth/flatten: `amount` is 0..1, how far each node moves toward
   its neighbours' average / toward `level`.  Changes g in place; returns false when nothing was in reach. */
export function sculpt(g, op, cx, cy, radius, amount, level = 0) {
  radius = Math.max(g.cell * 0.5, +radius || 1);
  const x0 = Math.max(0, Math.ceil((cx - radius) / g.cell)), x1 = Math.min(g.nx - 1, Math.floor((cx + radius) / g.cell)), y0 = Math.max(0, Math.ceil((cy - radius) / g.cell)), y1 = Math.min(g.ny - 1, Math.floor((cy + radius) / g.cell));
  if (x0 > x1 || y0 > y1 || !SCULPT_OPS.includes(op)) return false;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, old = op === 'smooth' ? new Float32Array(w * h) : null;
  if (old) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) old[y * w + x] = g.z[(y0 + y) * g.nx + x0 + x];
  let any = false;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const d = Math.hypot(x * g.cell - cx, y * g.cell - cy); if (d > radius) continue;
    const f = 0.5 * (1 + Math.cos(Math.PI * d / radius)), i = y * g.nx + x; any = true;
    if (op === 'raise') g.z[i] += amount * f; else if (op === 'lower') g.z[i] -= amount * f;
    else if (op === 'flatten') g.z[i] += (level - g.z[i]) * Math.min(1, amount * f);
    else { // smooth: mean of the node and its four neighbours (read from the copy, so the order of work does not matter)
      const at = (xx, yy) => { xx = clampI(xx, 0, g.nx - 1); yy = clampI(yy, 0, g.ny - 1); return xx >= x0 && xx <= x1 && yy >= y0 && yy <= y1 ? old[(yy - y0) * w + xx - x0] : g.z[yy * g.nx + xx]; };
      let t = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) t += at(x + dx, y + dy);
      g.z[i] += (t / 9 - g.z[i]) * Math.min(1, amount * f);
    }
  }
  return any;
}
/* a brush stroke: dabs fall every `step` metres of travel (the leftover distance carries over), so the result does not depend on how fast the pointer moved.
   const st = brushStroke(grid, op, radius, amount, level); st.to(x, y) for every pointer position (the first call dabs at the start); st.dabs counts them. */
export function brushStroke(g, op, radius, amount, level = 0) {
  const step = Math.max(radius * 0.3, g.cell * 0.5); let last = null, carry = 0;
  return {
    dabs: 0,
    to(x, y) {
      if (!last) { last = [x, y]; this.dabs++; return sculpt(g, op, x, y, radius, amount, level); }
      const len = Math.hypot(x - last[0], y - last[1]); let any = false, d = step - carry;
      for (; d <= len + 1e-9; d += step) { const t = len ? d / len : 0; if (sculpt(g, op, last[0] + (x - last[0]) * t, last[1] + (y - last[1]) * t, radius, amount, level)) any = true; this.dabs++; }
      carry = len - (d - step); if (carry < 0) carry = 0; last = [x, y]; return any;
    },
    again() { return last ? sculpt(g, op, last[0], last[1], radius, amount, level) : false; }   // press and hold: another dab in the same place
  };
}

/* ---------- ground under a box-shaped item (bed, bench, tank, area) ---------- */
/* points spread over a w x h box centred on (cx, cy) and turned rot degrees (the plan's rotation: clockwise on screen) */
export function boxPoints(cx, cy, w, h, rot = 0, step = 0.5) {
  const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), nx = Math.max(1, Math.ceil(w / step)), ny = Math.max(1, Math.ceil(h / step)), out = [];
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const u = (i / nx - 0.5) * w, v = (j / ny - 0.5) * h; out.push([cx + u * c - v * s, cy + u * s + v * c]); }
  return out;
}
/* lowest, highest and average ground height under the box */
export function groundUnder(g, cx, cy, w, h, rot = 0) {
  let lo = Infinity, hi = -Infinity, sum = 0, n = 0;
  for (const [x, y] of boxPoints(cx, cy, w, h, rot, Math.max(g.cell, Math.min(w, h) / 8, 0.25))) { const z = heightAt(g, x, y); lo = Math.min(lo, z); hi = Math.max(hi, z); sum += z; n++; }
  return { min: lo, max: hi, mean: sum / n, fall: hi - lo };
}
/* make the ground level under the box at `level` (default: the average), blending back to the old ground over `margin` metres around it.
   Changes g in place; returns how many grid points moved. */
export function levelBox(g, cx, cy, w, h, rot = 0, level, margin = 0.5) {
  if (level === undefined || !Number.isFinite(level)) level = groundUnder(g, cx, cy, w, h, rot).mean;
  const a = -rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), R = Math.hypot(w, h) / 2 + margin + g.cell * 2;
  const x0 = Math.max(0, Math.floor((cx - R) / g.cell)), x1 = Math.min(g.nx - 1, Math.ceil((cx + R) / g.cell)), y0 = Math.max(0, Math.floor((cy - R) / g.cell)), y1 = Math.min(g.ny - 1, Math.ceil((cy + R) / g.cell));
  let n = 0;
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const dx = i * g.cell - cx, dy = j * g.cell - cy, u = dx * c - dy * s, v = dx * s + dy * c;
    const out = Math.max(Math.abs(u) - w / 2, Math.abs(v) - h / 2, 0) - g.cell * 1.5; if (out > margin) continue;   // a ring one grid step wide around the box is level too, so its edges are flat
    const t = margin > 0 ? Math.max(0, out) / margin : 0, k = 1 - t * t * (3 - 2 * t), z = j * g.nx + i, nz = g.z[z] + (level - g.z[z]) * k;
    if (Math.abs(nz - g.z[z]) > 1e-9) { g.z[z] = nz; n++; }
  }
  return n;
}

/* ---------- the ground wizard: whole shapes in plain terms ---------- */
const smooth01 = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
/* the whole site falls `fall` metres toward a compass bearing (0 = north, 90 = east), measured across the site in that direction.
   `north` is where north points on the plan (degrees, 0 = up).  Adds to whatever is there. */
export function tiltSite(g, w, h, fall, bearing, north = 0) {
  const a = (bearing + north) * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), pr = [[0, 0], [w, 0], [0, h], [w, h]].map(([x, y]) => x * dx + y * dy), lo = Math.min(...pr), hi = Math.max(...pr), span = Math.max(1e-6, hi - lo);
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const t = ((i * g.cell) * dx + (j * g.cell) * dy - lo) / span; g.z[j * g.nx + i] += fall * (1 - Math.min(1, Math.max(0, t))); }
}
/* a round mound (height > 0) or hollow / pond (height < 0) `diameter` across, with a flat top or bottom `flat` (0..0.9) of the way out */
export function dome(g, cx, cy, diameter, height, flat = 0.25) {
  const R = Math.max(g.cell, diameter / 2), x0 = Math.max(0, Math.floor((cx - R) / g.cell)), x1 = Math.min(g.nx - 1, Math.ceil((cx + R) / g.cell)), y0 = Math.max(0, Math.floor((cy - R) / g.cell)), y1 = Math.min(g.ny - 1, Math.ceil((cy + R) / g.cell));
  let n = 0; for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) { const d = Math.hypot(i * g.cell - cx, j * g.cell - cy) / R; if (d >= 1) continue; g.z[j * g.nx + i] += height * (1 - smooth01((d - flat) / (1 - flat))); n++; }
  return n;
}
/* a swale: a shallow trench `width` wide and `depth` deep along a line, with the soil heaped as a bank on the lower side (on contour,
   it catches water running down the slope).  pts: [[x, y], ...].  The lower side is found from the ground beside the middle of the line. */
export function swale(g, pts, width, depth, bank = true) {
  if (!pts || pts.length < 2) return 0;
  const dist = (x, y) => { let best = Infinity, side = 0; for (let k = 1; k < pts.length; k++) { const [ax, ay] = pts[k - 1], [bx, by] = pts[k], vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2)), px = ax + t * vx, py = ay + t * vy, d = Math.hypot(x - px, y - py);
      if (d < best) { best = d; side = Math.sign(vx * (y - ay) - vy * (x - ax)); } } return [best, side]; };
  const m = Math.floor(pts.length / 2), [ax, ay] = pts[m - 1] || pts[0], [bx, by] = pts[m], mx = (ax + bx) / 2, my = (ay + by) / 2, l = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / l, ny = (bx - ax) / l;
  const off = width * 1.2, lowSide = heightAt(g, mx + nx * off, my + ny * off) < heightAt(g, mx - nx * off, my - ny * off) ? 1 : -1;   // +1 = the left of the line's direction
  const reach = width * 2.2; let n = 0;
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.max(0, Math.floor((Math.min(...xs) - reach) / g.cell)), x1 = Math.min(g.nx - 1, Math.ceil((Math.max(...xs) + reach) / g.cell)), y0 = Math.max(0, Math.floor((Math.min(...ys) - reach) / g.cell)), y1 = Math.min(g.ny - 1, Math.ceil((Math.max(...ys) + reach) / g.cell));
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const [d, side] = dist(i * g.cell, j * g.cell); let dz = 0;
    if (d < width / 2) dz -= depth * 0.5 * (1 + Math.cos(Math.PI * d / (width / 2)));
    if (bank && side === lowSide) { const c = width * 1.1, bw = width * 0.9, t = Math.abs(d - c) / bw; if (t < 1) dz += depth * 0.75 * 0.5 * (1 + Math.cos(Math.PI * t)); }
    if (dz) { g.z[j * g.nx + i] += dz; n++; }
  }
  return n;
}

/* ---------- saving in a plan file ---------- */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function toB64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 3) { const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0); s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (i + 1 < bytes.length ? B64[n >> 6 & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '='); } return s; }
function fromB64(s) {
  const clean = s.replace(/[^A-Za-z0-9+/]/g, ''), out = new Uint8Array(Math.floor(clean.length * 3 / 4)), idx = c => (c === undefined ? 0 : B64.indexOf(c));
  let o = 0; for (let i = 0; i < clean.length; i += 4) { const n = (idx(clean[i]) << 18) | (idx(clean[i + 1]) << 12) | (idx(clean[i + 2]) << 6) | idx(clean[i + 3]); out[o++] = n >> 16 & 255; if (i + 2 < clean.length) out[o++] = n >> 8 & 255; if (i + 3 < clean.length) out[o++] = n & 255; }
  return out;
}
/* { cell, nx, ny, base, data } : heights are stored as whole centimetres above `base` (the lowest height), 16 bits each */
export function packGrid(g) {
  const { min } = range(g), base = Math.round(min * 100) / 100, bytes = new Uint8Array(g.z.length * 2);
  g.z.forEach((v, i) => { const c = clampI(Math.round((v - base) * 100), 0, 65535); bytes[i * 2] = c & 255; bytes[i * 2 + 1] = c >> 8; });
  return { cell: Math.round(g.cell * 1000) / 1000, nx: g.nx, ny: g.ny, base, data: toB64(bytes) };
}
/* every plan that is opened is checked: wrong sizes or junk give null (a flat site) rather than an error */
export function unpackGrid(p) {
  if (!p || typeof p !== 'object') return null;
  const cell = +p.cell, nx = p.nx | 0, ny = p.ny | 0, base = +p.base;
  if (!(cell >= 0.1 && cell <= 1000) || nx < 2 || ny < 2 || nx * ny > MAX_NODES || !Number.isFinite(base) || typeof p.data !== 'string' || p.data.length > MAX_NODES * 3) return null;
  const bytes = fromB64(p.data); if (bytes.length !== nx * ny * 2) return null;
  const z = new Float32Array(nx * ny); for (let i = 0; i < z.length; i++) z[i] = base + (bytes[i * 2] | (bytes[i * 2 + 1] << 8)) / 100;
  return { cell, nx, ny, z };
}

/* ---------- reading files ---------- */
/* ASCII grid: ncols nrows xllcorner|xllcenter yllcorner|yllcenter cellsize [NODATA_value], then rows from north to south */
export function parseAscii(text) {
  const lines = text.split(/\r?\n/), head = {}; let i = 0;
  for (; i < lines.length && i < 12; i++) { const m = /^\s*([A-Za-z_]+)\s+(\S+)\s*$/.exec(lines[i]); if (!m) break; head[m[1].toLowerCase()] = m[2]; }
  const ncols = +head.ncols, nrows = +head.nrows, cs = +(head.cellsize || head.dx);
  if (!(ncols >= 2) || !(nrows >= 2) || !(cs > 0)) throw new Error('This does not look like an ASCII grid file (.asc).');
  if (ncols * nrows > 60000000) throw new Error('This grid is too big to open here. Cut it down to your property first.');
  let xll = head.xllcorner !== undefined ? +head.xllcorner : +head.xllcenter - cs / 2, yll = head.yllcorner !== undefined ? +head.yllcorner : +head.yllcenter - cs / 2;
  if (!Number.isFinite(xll) || !Number.isFinite(yll)) throw new Error('The grid has no position.');
  const nodata = head.nodata_value !== undefined ? +head.nodata_value : -9999, data = new Float32Array(ncols * nrows); let k = 0;
  for (; i < lines.length && k < data.length; i++) { const t = lines[i].trim(); if (!t) continue; for (const w of t.split(/\s+/)) { if (k < data.length) { const v = +w; data[k++] = !Number.isFinite(v) || v === nodata ? NaN : v; } } }
  if (k < data.length) throw new Error('The grid file is cut short (' + k + ' of ' + data.length + ' values).');
  return { ncols, nrows, cs, xll, yll, data, kind: 'grid' };
}
/* x y z per line (comma, space, tab or semicolon); a header line is skipped */
export function parsePoints(text) {
  const xs = [], ys = [], zs = [];
  for (const line of text.split(/\r?\n/)) { const w = line.trim().split(/[\s,;]+/); if (w.length < 3) continue; const x = +w[0], y = +w[1], z = +w[2]; if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && w[0] !== '' ) { xs.push(x); ys.push(y); zs.push(z); } if (xs.length > 5000000) break; }
  if (xs.length < 3) throw new Error('Found fewer than 3 points. Each line needs x, y and height.');
  return { xs, ys, zs, kind: 'points' };
}
/* sample a parsed ASCII grid at map position (e, n); NaN outside it or on no-data */
function gridSample(d, e, n) {
  const fx = (e - d.xll) / d.cs - 0.5, fy = (d.yll + d.nrows * d.cs - n) / d.cs - 0.5;
  if (fx < -0.5 || fy < -0.5 || fx > d.ncols - 0.5 || fy > d.nrows - 0.5) return NaN;
  const x0 = clampI(Math.floor(fx), 0, d.ncols - 1), y0 = clampI(Math.floor(fy), 0, d.nrows - 1), x1 = Math.min(d.ncols - 1, x0 + 1), y1 = Math.min(d.nrows - 1, y0 + 1), tx = clampI(fx - x0, 0, 1), ty = clampI(fy - y0, 0, 1);
  const a = d.data[y0 * d.ncols + x0], b = d.data[y0 * d.ncols + x1], c = d.data[y1 * d.ncols + x0], dd = d.data[y1 * d.ncols + x1], w = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty], v = [a, b, c, dd];
  let s = 0, ws = 0; for (let i = 0; i < 4; i++) if (!Number.isNaN(v[i])) { s += v[i] * w[i]; ws += w[i]; }
  return ws > 0 ? s / ws : NaN;
}

/* ---------- placing data on the site ---------- */
/* plan (x, y) in metres -> map position, from the site's latitude and longitude (its centre) and north.
   opts.crs: 'utm' (metres; opts.zone, default from longitude) or 'latlon' (degrees) */
export function planToMap(site, opts = {}) {
  const n = (site.north || 0) * D2R, cn = Math.cos(n), sn = Math.sin(n), cx = site.w / 2, cy = site.h / 2;
  const ref = latLonToUtm(site.lat, site.lon, opts.zone || utmZone(site.lon)), south = site.lat < 0;
  return (x, y) => {
    const dx = x - cx, dy = y - cy, e = ref.e + dx * cn + dy * sn, nn = ref.n + dx * sn - dy * cn;
    if (opts.crs === 'latlon') { const p = utmToLatLon(e, nn, ref.zone, south); return [p.lon, p.lat]; }
    return [e, nn];
  };
}
/* Build the height grid for a site from parsed data.  Returns { grid, covered (0..1 of the site that had data), min, max }.
   Points are filled in by inverse-distance weighting of the nearest ones (so they should be reasonably even). */
export function importHeights(data, site, opts = {}) {
  const g = makeGrid(site.w, site.h, opts.cell || 1), map = planToMap(site, opts); let have = 0;
  if (data.kind === 'grid') {
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const [e, n] = map(i * g.cell, j * g.cell), v = gridSample(data, e, n); g.z[j * g.nx + i] = v; if (!Number.isNaN(v)) have++; }
  } else {
    // spatial hash of the points, in map units, then the 8 nearest within a reach
    const xs = data.xs, ys = data.ys, zs = data.zs, cs = opts.reach || Math.max(5, Math.sqrt((site.w * site.h) / Math.max(1, xs.length)) * 3), hash = new Map(), key = (a, b) => a * 73856093 ^ b * 19349663;
    for (let k = 0; k < xs.length; k++) { const kk = key(Math.floor(xs[k] / cs), Math.floor(ys[k] / cs)); (hash.get(kk) || hash.set(kk, []).get(kk)).push(k); }
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
      const [e, n] = map(i * g.cell, j * g.cell), cx = Math.floor(e / cs), cy = Math.floor(n / cs), near = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const k of hash.get(key(cx + a, cy + b)) || []) { const d = Math.hypot(xs[k] - e, ys[k] - n); if (d <= cs * 1.5) near.push([d, zs[k]]); }
      if (!near.length) { g.z[j * g.nx + i] = NaN; continue; }
      near.sort((p, q) => p[0] - q[0]); const use = near.slice(0, 8); let s = 0, ws = 0;
      for (const [d, z] of use) { if (d < 0.01) { s = z; ws = 1; break; } const w = 1 / (d * d); s += z * w; ws += w; }
      g.z[j * g.nx + i] = s / ws; have++;
    }
  }
  const covered = have / g.z.length;
  if (!have) throw new Error('None of this data falls inside the site. Check the site latitude, longitude and north, and the coordinate type (metres in a UTM zone, or degrees).');
  fillGaps(g);
  const r = range(g);
  return { grid: g, covered, min: r.min, max: r.max };
}
/* fill nodes with no data from the nearest ones that have data (a few passes of averaging; the data's own values never change) */
export function fillGaps(g) {
  const known = new Uint8Array(g.z.length); let missing = 0;
  for (let i = 0; i < g.z.length; i++) { if (Number.isNaN(g.z[i])) missing++; else known[i] = 1; }
  for (let pass = 0; missing && pass < g.nx + g.ny; pass++) {
    const add = [];
    for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const k = j * g.nx + i; if (known[k]) continue; let s = 0, c = 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < g.nx && b < g.ny && known[b * g.nx + a]) { s += g.z[b * g.nx + a]; c++; } }
      if (c) add.push([k, s / c]); }
    if (!add.length) break; for (const [k, v] of add) { g.z[k] = v; known[k] = 1; missing--; }
  }
  for (let i = 0; i < g.z.length; i++) if (Number.isNaN(g.z[i])) g.z[i] = 0;
}

/* ---------- contour lines (marching squares): [{ level, lines: [[ [x, y], ... ], ...] }] in plan metres ---------- */
export function contours(g, interval = 0.5, opts = {}) {
  const r = range(g), out = [], start = Math.ceil(r.min / interval) * interval;
  if (!(interval > 0) || r.max - r.min < 1e-6) return out;
  let count = 0;
  for (let level = start; level <= r.max + 1e-9 && count++ < 400; level += interval) {
    const segs = [], L = Math.round(level * 1e6) / 1e6, v = (i, j) => g.z[j * g.nx + i] - L + 1e-9;
    for (let j = 0; j < g.ny - 1; j++) for (let i = 0; i < g.nx - 1; i++) {
      const a = v(i, j), b = v(i + 1, j), c = v(i + 1, j + 1), d = v(i, j + 1), idx = (a > 0 ? 1 : 0) | (b > 0 ? 2 : 0) | (c > 0 ? 4 : 0) | (d > 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const X = i * g.cell, Y = j * g.cell, s = g.cell, P = { t: [X + s * a / (a - b), Y], r: [X + s, Y + s * b / (b - c)], b: [X + s * d / (d - c), Y + s], l: [X, Y + s * a / (a - d)] };
      const T = { 1: [['l', 't']], 2: [['t', 'r']], 3: [['l', 'r']], 4: [['r', 'b']], 5: [['l', 't'], ['r', 'b']], 6: [['t', 'b']], 7: [['l', 'b']], 8: [['l', 'b']], 9: [['t', 'b']], 10: [['t', 'l'], ['b', 'r']], 11: [['r', 'b']], 12: [['l', 'r']], 13: [['t', 'r']], 14: [['l', 't']] }[idx];
      for (const [p, q] of T) { const A1 = P[p], B1 = P[q]; if (Math.hypot(A1[0] - B1[0], A1[1] - B1[1]) > 1e-6 * s) segs.push([A1, B1]); }   // a level that falls exactly on a node gives a zero-length piece: skip it
    }
    if (segs.length) out.push({ level: L, lines: joinSegments(segs, opts.simplify === false ? 0 : g.cell * 0.05) });
  }
  return out;
}
function joinSegments(segs, tol) {
  const k = p => Math.round(p[0] * 1000) + ',' + Math.round(p[1] * 1000), ends = new Map();
  segs.forEach((s, i) => { for (const e of [0, 1]) { const kk = k(s[e]); (ends.get(kk) || ends.set(kk, []).get(kk)).push([i, e]); } });
  const used = new Uint8Array(segs.length), lines = [];
  const next = (pt, from) => { for (const [i, e] of ends.get(k(pt)) || []) if (!used[i] && i !== from) return [i, e]; return null; };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue; used[i] = 1; const line = [segs[i][0], segs[i][1]];
    for (const dir of [1, 0]) {
      for (;;) { const tail = dir ? line[line.length - 1] : line[0], n = next(tail, -1); if (!n) break; used[n[0]] = 1; const p = segs[n[0]][1 - n[1]]; if (dir) line.push(p); else line.unshift(p); }
    }
    lines.push(tol ? thin(line, tol) : line);
  }
  return lines;
}
/* drop points that sit on a straight run */
function thin(line, tol) {
  if (line.length < 3) return line; const out = [line[0]];
  for (let i = 1; i < line.length - 1; i++) { const a = out[out.length - 1], b = line[i], c = line[i + 1], cr = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / (Math.hypot(c[0] - a[0], c[1] - a[1]) || 1); if (cr > tol) out.push(b); }
  out.push(line[line.length - 1]); return out;
}
