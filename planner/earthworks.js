/* Retaining walls as a rule laid over the ground (see DESIGN-retaining-walls.md).
   The stored height grid stays the NATURAL ground. finished(plan) answers "how high is the ground here once the soil-holding walls have done their work?":
     high side of a wall: max(natural, Top)  (soil is held up behind the wall)
     low side of a wall:  min(natural, Base) (the ground in front is dug down to the wall's foot),  Base = Top - height.
   Each effect reaches `reach` metres from the wall, fades out over a short blend, and fades to nothing at the wall ends.
   Pure functions: no page access; imports terrain.js only. All numbers are estimates for laying out a yard, not an engineered design. */
import * as TR from './terrain.js';

export const RETAIN_MIN_H = 0.15, RETAIN_MAX_H = 3.0, MAX_RETAIN_WALLS = 200, MAX_RETAIN_PTS = 100;
export const WALL_THICK = { sleeper: 0.12, block: 0.2, brick: 0.2, stone: 0.4, gabion: 0.5 };
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const B = 8;   // bucket size in metres

/* the soil-holding walls of a plan (top level only; hidden walls still hold soil, walls switched off do not) */
export function retainWalls(plan) {
  const out = [];
  for (const it of (plan && plan.items) || []) if (it && it.kind === 'wall' && it.retain && !it.off && Array.isArray(it.pts) && it.pts.length >= 2) out.push(it);
  return out.slice(0, MAX_RETAIN_WALLS);
}
/* an open polyline that crosses itself, touches itself, doubles back on itself, or closes into a loop (none of these can hold soil in v1) */
export function crossesItself(pts) {
  const o = (a, b, c) => { const v = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); return v > 1e-12 ? 1 : v < -1e-12 ? -1 : 0; };
  const on = (a, b, c) => Math.min(a[0], b[0]) - 1e-9 <= c[0] && c[0] <= Math.max(a[0], b[0]) + 1e-9 && Math.min(a[1], b[1]) - 1e-9 <= c[1] && c[1] <= Math.max(a[1], b[1]) + 1e-9;
  const hit = (a, b, c, d) => { const o1 = o(a, b, c), o2 = o(a, b, d), o3 = o(c, d, a), o4 = o(c, d, b); if (o1 !== o2 && o3 !== o4) return true; return (o1 === 0 && on(a, b, c)) || (o2 === 0 && on(a, b, d)) || (o3 === 0 && on(c, d, a)) || (o4 === 0 && on(c, d, b)); };
  pts = pts.filter((p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-6);   // a repeated point is just one point
  const n = pts.length; if (n > 2 && Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 0.1) return true;   // a closed loop (or one with a gap too small to matter)
  for (let i = 0; i < n - 1; i++) {
    if (i < n - 2) { const a = pts[i], b = pts[i + 1], c = pts[i + 2], ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - b[0], vy = c[1] - b[1], L = Math.hypot(ux, uy) * Math.hypot(vx, vy); if (L > 1e-12 && (ux * vx + uy * vy) / L < -0.9999) return true; }   // doubles straight back
    for (let j = i + 2; j < n - 1; j++) if (hit(pts[i], pts[i + 1], pts[j], pts[j + 1])) return true;
  }
  return false;
}
const segInfo = pts => { const segs = []; let run = 0; for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy); if (L < 1e-9) continue; segs.push({ a: [a[0], a[1]], b: [b[0], b[1]], dx, dy, L, s0: run, nx: dy / L, ny: -dx / L }); run += L; } return { segs, length: run }; };   // (nx, ny) = the wall's left, as seen on screen walking from the first point

export function makeFinished(site, plan) {
  const natGrid = site && site.ground ? TR.unpackGrid(site.ground) : null;
  const natural = (x, y) => (natGrid ? TR.heightAt(natGrid, x, y) : 0);
  const walls = [];
  for (const w of retainWalls(plan)) {
    const r = w.retain, { segs, length } = segInfo(w.pts); if (!segs.length || length < 0.3) continue;
    const high = r.high === 'right' ? -1 : 1, height = Math.max(RETAIN_MIN_H, Math.min(RETAIN_MAX_H, +w.height || 0.6)), split = r.split == null ? 0.5 : Math.max(0, Math.min(1, +r.split));
    const reach = Math.max(0.5, Math.min(30, r.reach == null ? 4 : +r.reach)), blend = Math.max(1, (natGrid ? natGrid.cell : 0.5) * 2);
    let zw = 0, n = 0; for (const sg of segs) { const k = Math.max(1, Math.min(400, Math.ceil(sg.L / 0.25))); for (let i = 0; i <= k; i++) { zw += natural(sg.a[0] + sg.dx * i / k, sg.a[1] + sg.dy * i / k); n++; } } zw /= n;
    const lvl0 = Number.isFinite(+r.lvl) && r.lvl != null ? +r.lvl : zw + split * height, top = Math.max(zw - height - 3, Math.min(zw + height + 3, lvl0)), base = top - height;   // a wall level far from the ground it stands on (a typo or a hostile file) cannot make a mesa or a trench
    const taper = Math.max(0.2, Math.min(1, length * 0.25)), th = WALL_THICK[w.material] || 0.2;
    const xs = w.pts.map(p => p[0]), ys = w.pts.map(p => p[1]), pad = reach + blend + 1;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of w.pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    if (x1 + pad < 0 || y1 + pad < 0 || x0 - pad > site.w || y0 - pad > site.h) continue;   // nowhere near the yard: no effect
    walls.push({ id: w.id, segs, length, high, height, top, base, reach, blend, taper, th, pad, bb: [x0 - pad, y0 - pad, x1 + pad, y1 + pad], raw: w });
  }
  /* visit each lattice cell (size c) within reach of a wall exactly once, walking the wall in short pieces so a long diagonal wall does not scan its whole bounding box */
  const clipSeg = (sg, pad) => { /* the part of a segment inside the yard (plus pad), or null */
    let t0 = 0, t1 = 1; const lim = [[-sg.dx, sg.a[0] + pad], [sg.dx, site.w + pad - sg.a[0]], [-sg.dy, sg.a[1] + pad], [sg.dy, site.h + pad - sg.a[1]]];
    for (const [p, q] of lim) { if (Math.abs(p) < 1e-12) { if (q < 0) return null; } else { const r = q / p; if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; } } }
    return t1 < t0 ? null : [t0, t1]; };
  const piecesOf = w => { const out = [], span = Math.max(2, w.reach); for (let si = 0; si < w.segs.length; si++) { const sg0 = w.segs[si]; const cl = clipSeg(sg0, w.pad); if (!cl) continue; const sg = { a: [sg0.a[0] + sg0.dx * cl[0], sg0.a[1] + sg0.dy * cl[0]], dx: sg0.dx * (cl[1] - cl[0]), dy: sg0.dy * (cl[1] - cl[0]), L: sg0.L * (cl[1] - cl[0]) }; const k = Math.max(1, Math.ceil(sg.L / span)); for (let i = 0; i < k; i++) { const ax = sg.a[0] + sg.dx * i / k, ay = sg.a[1] + sg.dy * i / k, bx = sg.a[0] + sg.dx * (i + 1) / k, by = sg.a[1] + sg.dy * (i + 1) / k; out.push([Math.min(ax, bx) - w.pad, Math.min(ay, by) - w.pad, Math.max(ax, bx) + w.pad, Math.max(ay, by) + w.pad, si]); } } return out; };
  const clipI = (v, max) => Math.max(0, Math.min(max, v));
  function forBand(w, c, cb, seen, maxI, maxJ) {   // maxI, maxJ: the last lattice index that exists (the ground grid's own edge, when there is one)
    const mi = maxI == null ? Math.floor(site.w / c) + 1 : maxI, mj = maxJ == null ? Math.floor(site.h / c) + 1 : maxJ;
    for (const q of piecesOf(w)) {
      const i0 = clipI(Math.floor(q[0] / c), mi), i1 = clipI(Math.ceil(q[2] / c), mi), j0 = clipI(Math.floor(q[1] / c), mj), j1 = clipI(Math.ceil(q[3] / c), mj);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const k = j * 1000003 + i; if (seen.has(k)) continue; seen.add(k); cb(i, j); }
    }
  }
  // buckets: which wall SEGMENTS could affect a point (one entry per short piece of segment, clipped to the yard; capped so a hostile plan cannot exhaust memory)
  const bk = new Map(), key = (i, j) => i * 100003 + j; let entries = 0, limited = false; const CAP = 1500000;
  walls.forEach((w, wi) => {
    const seen = new Set();
    for (const q of piecesOf(w)) {
      const i0 = Math.max(Math.floor(q[0] / B), -1), i1 = Math.min(Math.floor(q[2] / B), Math.floor(site.w / B) + 1), j0 = Math.max(Math.floor(q[1] / B), -1), j1 = Math.min(Math.floor(q[3] / B), Math.floor(site.h / B) + 1), ent = wi * 1000 + q[4];
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const k = key(i, j) * 1000003 + ent; if (seen.has(k)) continue; seen.add(k); if (++entries > CAP) { limited = true; return; } const kk = key(i, j); let l = bk.get(kk); if (!l) { l = []; bk.set(kk, l); } l.push(ent); }
    }
  });
  let work = 0, volLimited = false; const BUDGET = 2e7;   // segment checks allowed while building the finished grid
  const VOL_BUDGET = 6e6;   // the soil estimate gets a tighter one: at the wall cap the old figure blocked the panel for six seconds

  /* the nearest wall to (x, y) that reaches it: { w, d (signed, + on the high side), dist, sp (distance along the wall), beyond (metres past an end) } */
  function nearest(x, y) {
    const l = bk.get(key(Math.floor(x / B), Math.floor(y / B))); if (!l) return null;
    const per = new Map(); const n = l.length;   // best segment per wall
    for (const ent of l) {
      const wi = (ent / 1000) | 0, si = ent % 1000, w = walls[wi];
      if (x < w.bb[0] || x > w.bb[2] || y < w.bb[1] || y > w.bb[3]) continue;
      const s = w.segs[si], t = ((x - s.a[0]) * s.dx + (y - s.a[1]) * s.dy) / (s.L * s.L), tc = Math.max(0, Math.min(1, t)), px = s.a[0] + s.dx * tc, py = s.a[1] + s.dy * tc, d = Math.hypot(x - px, y - py);
      const cur = per.get(wi); if (!cur || d < cur.bd - 1e-9 || (Math.abs(d - cur.bd) <= 1e-9 && si < cur.bi)) per.set(wi, { bd: d, bs: s, bt: t, bi: si });
    }
    work += n;
    let best = null, bestFx = null, z = null;
    for (const [wi, c] of per) {
      const w = walls[wi], { bd, bs, bt, bi } = c;
      if (bd > w.reach + w.blend) continue;
      let side;   // + = the wall's left
      const tc = Math.max(0, Math.min(1, bt)), last = w.segs.length - 1;
      if ((tc === 0 && bi > 0) || (tc === 1 && bi < last)) {   // at a corner, use the corner's bisector so inside and outside corners do not flicker
        const o = tc === 0 ? w.segs[bi - 1] : w.segs[bi + 1], nx = bs.nx + o.nx, ny = bs.ny + o.ny, v = tc === 0 ? bs.a : bs.b; side = (x - v[0]) * nx + (y - v[1]) * ny;
      } else side = (x - bs.a[0]) * bs.nx + (y - bs.a[1]) * bs.ny;
      const sgn = side >= 0 ? 1 : -1, sp = bs.s0 + tc * bs.L;
      const beyond = (bi === 0 && bt < 0) ? -bt * bs.L : (bi === last && bt > 1) ? (bt - 1) * bs.L : 0;   // only the two free ends of the wall fade out, never a corner
      const rec = { w, d: bd < w.th / 2 ? 1e-6 : sgn * w.high * bd, dist: bd, sp, beyond };
      if (!best || bd < best.dist) best = rec;
      if (per.size > 1 && (!bestFx || bd < bestFx.dist)) { if (z === null) z = natural(x, y); if (Math.abs(effect(rec, z)) > 1e-6) bestFx = rec; }
    }
    return bestFx || best;   // when two walls overlap, the nearer one that actually moves the ground here wins (no phantom cliff between two build-up walls)
  }
  function effect(nr, z) {   // how much a wall moves the ground at a point whose natural height is z
    const w = nr.w, high = nr.d >= 0, target = high ? Math.max(z, w.top) : Math.min(z, w.base);
    const reachW = 1 - smooth((nr.dist - w.reach) / w.blend), endW = smooth(Math.min(nr.sp, w.length - nr.sp) / w.taper), fadeEnd = nr.beyond > 0 ? 1 - smooth(nr.beyond / w.blend) : 1;
    return (target - z) * reachW * endW * fadeEnd;
  }
  const heightAt = (x, y) => { const z = natural(x, y), nr = walls.length ? nearest(x, y) : null; return nr ? z + effect(nr, z) : z; };
  const sideAt = (x, y) => { const nr = walls.length ? nearest(x, y) : null; return nr ? (nr.d >= 0 ? 'high' : 'low') : null; };
  const deltaAt = (x, y) => heightAt(x, y) - natural(x, y);

  /* the finished grid (same spacing as the natural one) and which cells a wall line passes through */
  let grid = null, crossed = null;
  function getGrid() {
    if (grid) return grid;
    work = 0;
    const g = natGrid ? { cell: natGrid.cell, nx: natGrid.nx, ny: natGrid.ny, z: new Float32Array(natGrid.z) } : TR.flatSite(site.w, site.h);
    const seen = new Set();
    const base = new Float32Array(g.z);
    for (const w of walls) { if (work > BUDGET) break; forBand(w, g.cell, (i, j) => { if (work <= BUDGET) g.z[j * g.nx + i] = heightAt(i * g.cell, j * g.cell); }, seen, g.nx - 1, g.ny - 1); }
    if (work > BUDGET) { g.z.set(base); limited = true; }   // too much to work out: show the natural ground, never a half-built terrace
    grid = g; return g;
  }
  function getCrossed() {
    if (crossed) return crossed; const g = getGrid(); crossed = new Uint8Array((g.nx - 1) * (g.ny - 1)); const W = g.nx - 1, Hh = g.ny - 1;
    const flag = (ci, cj) => { if (ci >= 0 && cj >= 0 && ci < W && cj < Hh) crossed[cj * W + ci] = 1; };
    for (const w of walls) for (const s of w.segs) { const k = Math.max(1, Math.min(4000, Math.ceil(s.L / (g.cell / 2)))); for (let i = 0; i <= k; i++) { const x = s.a[0] + s.dx * i / k, y = s.a[1] + s.dy * i / k, fx = x / g.cell, fy = y / g.cell, ci = Math.floor(fx), cj = Math.floor(fy), ex = Math.abs(fx - Math.round(fx)) < 1e-6, ey = Math.abs(fy - Math.round(fy)) < 1e-6; flag(ci, cj); if (ex) flag(ci - 1, cj); if (ey) flag(ci, cj - 1); if (ex && ey) flag(ci - 1, cj - 1); } }   // a wall lying exactly on a grid line flags the cells on both sides
    return crossed;
  }
  /* about how much soil is cut and filled (cubic metres) and how much wall face shows; an ESTIMATE for laying out a yard */
  let volCache = null;
  function volumes(inside, onlyId) {
    if (!inside && onlyId == null && volCache) return volCache;
    work = 0;
    const per = []; let cut = 0, fill = 0;
    for (const w of walls) {
      if (onlyId != null && w.id !== onlyId) continue;
      let step = Math.max(0.1, Math.min(0.25, (natGrid ? natGrid.cell : 0.5) / 2));
      let est = 0; for (const q of piecesOf(w)) est += Math.max(0, (Math.min(q[2], site.w) - Math.max(q[0], 0)) * (Math.min(q[3], site.h) - Math.max(q[1], 0))); if (est / (step * step) > 400000) step = Math.sqrt(est / 400000);   // long walls: coarser sampling, never an unbounded scan
      const a = step * step; let c = 0, f = 0;
      forBand(w, step, (i, j) => { if (work > VOL_BUDGET) { volLimited = true; return; } const x = i * step, y = j * step; if (inside && !inside(x, y)) return; const nr = nearest(x, y); if (!nr || nr.w !== w) return; const d = effect(nr, natural(x, y)); if (d > 0) f += d * a; else c -= d * a; }, new Set());
      let fmin = Infinity, fmax = 0, area = 0;
      for (const s of w.segs) { const k = Math.max(1, Math.min(2000, Math.ceil(s.L / 0.25))); for (let i = 0; i < k; i++) { const t = (i + 0.5) / k, x = s.a[0] + s.dx * t, y = s.a[1] + s.dy * t, z = natural(x, y), face = Math.max(z, w.top) - Math.min(z, w.base); if (face < fmin) fmin = face; if (face > fmax) fmax = face; area += face * s.L / k; } }
      per.push({ id: w.id, cut: c, fill: f, faceMin: fmin === Infinity ? w.height : fmin, faceMax: Math.max(fmax, w.height), faceArea: area, length: w.length, top: w.top, base: w.base }); cut += c; fill += f;
    }
    const r = { cut, fill, perWall: per }; if (!inside && onlyId == null) volCache = r; return r;
  }
  return { natural, heightAt, sideAt, deltaAt, walls, get grid() { return getGrid(); }, get crossed() { return getCrossed(); }, get limited() { return limited; }, volumes, count: walls.length };
}

const memo = new WeakMap();   // plan object -> { gd, key, fin }; cheap re-use between redraws
export function finished(plan) {
  const site = plan.site, rw = retainWalls(plan), gd = site.ground || null;
  let key = site.w + 'x' + site.h + '|'; for (const w of rw) key += JSON.stringify([w.id, w.pts, w.height, w.material, w.retain]) + ';';
  const m = memo.get(plan); if (m && m.gd === gd && m.gdata === (gd && gd.data) && m.key === key) return m.fin;   // a new ground (even of the same size) is a different object, so a stale answer is never reused
  const fin = makeFinished(site, plan); memo.set(plan, { gd, gdata: gd && gd.data, key, fin }); return fin;
}
