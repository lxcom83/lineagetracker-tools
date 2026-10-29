/* Site outline geometry for LT-Planner: pure functions, no DOM, no imports (so model.js, app.js and view3d.js can all use it).
   A site is the rectangle [0,w] x [0,h]. An optional outline (a polygon of [x,y] corners, metres, y down) lies inside that rectangle.
   No outline = rectangle. Everything here takes a "region" { outer, holes, w, h, rect } made by regionOf(site); holes stay empty for now
   (rooms and courtyards come later). Nothing here throws on bad input. */
export const MAX_POLY_PTS = 100, MAX_HOLES = 8, MAX_HOLE_PTS = 50;
const TOL = 0.005, r3 = n => Math.round(n * 1000) / 1000;
const fin = n => typeof n === 'number' && Number.isFinite(n);

export const area = ring => { let a = 0; for (let i = 0, n = ring.length; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };   // positive for the stored winding
export const perimeter = ring => { let L = 0; for (let i = 0, n = ring.length; i < n; i++) { const p = ring[i], q = ring[(i + 1) % n]; L += Math.hypot(q[0] - p[0], q[1] - p[1]); } return L; };

const segX = (a, b, c, d) => {   // proper crossing of segments ab and cd (touching ends do not count)
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return ((d1 > 1e-9 && d2 < -1e-9) || (d1 < -1e-9 && d2 > 1e-9)) && ((d3 > 1e-9 && d4 < -1e-9) || (d3 < -1e-9 && d4 > 1e-9));
};
export function selfIntersects(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i++) for (let j = i + 2; j < n; j++) { if (i === 0 && j === n - 1) continue; if (segX(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true; }
  return false;
}

/* would a new side a -> b cross any side already drawn along the open path pts? (the side that ends at a is not counted) */
export function segCrosses(pts, a, b) {
  for (let i = 0; i + 1 < pts.length; i++) { if (pts[i + 1] === a || (pts[i + 1][0] === a[0] && pts[i + 1][1] === a[1])) continue; if (segX(pts[i], pts[i + 1], a, b)) return true; }
  return false;
}

/* untrusted input in, a clean ring (positive winding) or null (= rectangle) out */
export function cleanPoly(raw, w, h) {
  try {
    if (!Array.isArray(raw) || raw.length > 400) return null;
    let pts = [];
    for (const p of raw.slice(0, MAX_POLY_PTS)) {
      if (!Array.isArray(p)) return null;
      const x = +p[0], y = +p[1]; if (!fin(x) || !fin(y)) return null;
      pts.push([r3(Math.min(w, Math.max(0, x))), r3(Math.min(h, Math.max(0, y)))]);
    }
    let again = true;   // drop repeated and in-line corners until none are left
    while (again && pts.length >= 3) {
      again = false;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[(i + pts.length - 1) % pts.length], q = pts[i], r = pts[(i + 1) % pts.length];
        const dup = Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01, cross = (q[0] - p[0]) * (r[1] - q[1]) - (q[1] - p[1]) * (r[0] - q[0]);
        if (dup || Math.abs(cross) < 1e-6 * (1 + Math.hypot(q[0] - p[0], q[1] - p[1]) * Math.hypot(r[0] - q[0], r[1] - q[1]))) { pts.splice(i, 1); again = true; break; }
      }
    }
    if (pts.length < 3) return null;
    let a = area(pts); if (Math.abs(a) < 1 || Math.abs(a) < 0.005 * w * h) return null;
    if (selfIntersects(pts)) return null;
    if (a < 0) pts.reverse();
    const near = (u, v) => Math.abs(u - v) <= 0.01;
    if (pts.length === 4 && pts.every(p => (near(p[0], 0) || near(p[0], w)) && (near(p[1], 0) || near(p[1], h))) && Math.abs(Math.abs(a) - w * h) < 0.02) return null;   // it is just the rectangle
    return pts;
  } catch { return null; }
}

/* ---------- the region everything else asks about ---------- */
let memo = null;
export function regionOf(site) {
  const w = site && site.w > 0 ? site.w : 1, h = site && site.h > 0 ? site.h : 1, poly = site && site.poly;
  const key = poly ? w + ',' + h + ':' + poly.join(';') : '';
  if (memo && memo.key === key && memo.w === w && memo.h === h) return memo.reg;
  const rect = !Array.isArray(poly) || poly.length < 3;
  const outer = rect ? [[0, 0], [w, 0], [w, h], [0, h]] : poly, xs = outer.map(p => p[0]), ys = outer.map(p => p[1]);
  const reg = { w, h, rect, outer, holes: [], bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] };
  memo = { key, w, h, reg }; return reg;
}

const distSeg = (x, y, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; let t = L ? ((x - a[0]) * dx + (y - a[1]) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  const px = a[0] + t * dx, py = a[1] + t * dy; return [Math.hypot(x - px, y - py), px, py];
};
const inRing = (ring, x, y) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const p = ring[i], q = ring[j]; if ((p[1] > y) !== (q[1] > y) && x < (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]) + p[0]) c = !c; } return c; };

export function inside(reg, x, y, tol = TOL) {
  if (reg.rect) return x >= -tol && y >= -tol && x <= reg.w + tol && y <= reg.h + tol;
  const b = reg.bb; if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) return false;
  const rings = [reg.outer, ...reg.holes];
  for (const r of rings) for (let i = 0; i < r.length; i++) if (distSeg(x, y, r[i], r[(i + 1) % r.length])[0] <= tol) return true;
  return inRing(reg.outer, x, y) && !reg.holes.some(hl => inRing(hl, x, y));
}
/* closest point on any edge: [x, y, ring, edge] */
export function nearest(reg, x, y) {
  let best = null; const rings = [reg.outer, ...reg.holes];
  rings.forEach((r, ri) => { for (let i = 0; i < r.length; i++) { const d = distSeg(x, y, r[i], r[(i + 1) % r.length]); if (!best || d[0] < best[0]) best = [d[0], d[1], d[2], ri, i]; } });
  return best ? [best[1], best[2], best[3], best[4]] : [x, y, 0, 0];
}
/* a point moved to the nearest spot inside (a centimetre in from the edge) */
export function clampPoint(reg, p) {
  if (reg.rect) return [Math.min(reg.w, Math.max(0, p[0])), Math.min(reg.h, Math.max(0, p[1]))];
  if (inside(reg, p[0], p[1])) return [p[0], p[1]];
  const q = nearest(reg, p[0], p[1]), r = reg.outer[q[3]], s = reg.outer[(q[3] + 1) % reg.outer.length], L = Math.hypot(s[0] - r[0], s[1] - r[1]) || 1;
  const ix = -(s[1] - r[1]) / L, iy = (s[0] - r[0]) / L;   // inward normal: the inside is on the left of each edge for the stored (positive) winding
  for (const k of [0.01, 0.003, 0]) { const x = q[0] + ix * k, y = q[1] + iy * k; if (k === 0 || inside(reg, x, y, 0)) return [r3(x), r3(y)]; }
  return [q[0], q[1]];
}

/* corners of a box item (x, y centre; w, h; rot degrees) */
export function boxCorners(it) {
  const a = (it.rot || 0) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a), hw = (it.w || 0) / 2, hh = (it.h || 0) / 2;
  return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [it.x + x * c - y * s, it.y + x * s + y * c]);
}
export function hull(points) {   // convex hull (monotone chain)
  const p = points.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
/* is a convex shape (list of corners) entirely inside the region? Two tests: every corner is inside, and no corner of the region pokes into it */
export function containsConvex(reg, pts) {
  if (reg.rect) return pts.every(p => p[0] >= -TOL && p[1] >= -TOL && p[0] <= reg.w + TOL && p[1] <= reg.h + TOL);
  if (!pts.every(p => inside(reg, p[0], p[1]))) return false;
  if (pts.length < 3) return true;
  const hl = pts.length > 3 ? hull(pts) : pts, sg = area(hl) >= 0 ? 1 : -1;
  for (const ring of [reg.outer, ...reg.holes]) for (const v of ring) {
    let strictly = true;
    for (let i = 0; i < hl.length; i++) { const p = hl[i], q = hl[(i + 1) % hl.length]; if (sg * ((q[0] - p[0]) * (v[1] - p[1]) - (q[1] - p[1]) * (v[0] - p[0])) <= 1e-6) { strictly = false; break; } }
    if (strictly) return false;
  }
  for (const ring of [reg.outer, ...reg.holes]) for (let i = 0; i < ring.length; i++) for (let j = 0; j < hl.length; j++) if (segX(ring[i], ring[(i + 1) % ring.length], hl[j], hl[(j + 1) % hl.length])) return false;   // an outline edge cutting across the shape (a slot narrower than the shape)
  return true;
}
const shift = (pts, dx, dy) => pts.map(p => [p[0] + dx, p[1] + dy]);
/* a group is a list of "pieces": a box is one convex piece (its corners); a plant, a note or each corner of a path is a piece of its own, so a path may bend round an inside corner */
const fitsAll = (reg, pieces, dx, dy) => pieces.every(pc => containsConvex(reg, shift(pc, dx, dy)));
/* move a group by (dx, dy) as far as it will go while staying inside (from where it already is: offset ox, oy): full step, slide along one axis, or stop at the edge */
export function fitDelta(reg, pieces, dx, dy, ox = 0, oy = 0) {
  const f = (a, b) => fitsAll(reg, pieces, ox + a, oy + b);
  if (f(dx, dy)) return [dx, dy];
  const okX = dx !== 0 && f(dx, 0), okY = dy !== 0 && f(0, dy);
  if (okX && (!okY || Math.abs(dx) >= Math.abs(dy))) return [dx, 0];
  if (okY) return [0, dy];
  let lo = 0, hi = 1; for (let i = 0; i < 8; i++) { const m = (lo + hi) / 2; if (f(dx * m, dy * m)) lo = m; else hi = m; }
  return [dx * lo, dy * lo];
}
/* push a group back inside after a nudge, copy or insert; returns [dx, dy] or null if it will not fit */
export function nudgeInside(reg, pieces) {
  let tx = 0, ty = 0; const all = pieces.flat();
  for (let round = 0; round < 8; round++) {
    if (fitsAll(reg, pieces, tx, ty)) return [r3(tx), r3(ty)];
    let worst = null;
    for (const p of all) { const x = p[0] + tx, y = p[1] + ty; if (inside(reg, x, y)) continue; const q = clampPoint(reg, [x, y]), d = Math.hypot(q[0] - x, q[1] - y); if (!worst || d > worst[0]) worst = [d, q[0] - x, q[1] - y]; }
    if (!worst) {   // every corner is inside but the outline pokes into a shape: step towards the middle of the site
      const cx = (reg.bb[0] + reg.bb[2]) / 2, cy = (reg.bb[1] + reg.bb[3]) / 2, gx = all.reduce((s, p) => s + p[0], 0) / all.length + tx, gy = all.reduce((s, p) => s + p[1], 0) / all.length + ty, L = Math.hypot(cx - gx, cy - gy) || 1;
      worst = [0, (cx - gx) / L * 0.5, (cy - gy) / L * 0.5];
    }
    tx += worst[1]; ty += worst[2];
  }
  return fitsAll(reg, pieces, tx, ty) ? [r3(tx), r3(ty)] : null;
}

/* ready-made shapes inside a w x h canvas */
export const SHAPES = [['rect', 'Rectangle'], ['L', 'L shape'], ['T', 'T shape'], ['triangle', 'Triangle'], ['trapezoid', 'Trapezoid']];
export function presets(name, w, h) {
  const f = (a, b) => [r3(a * w), r3(b * h)];
  const P = {
    L: [f(0, 0), f(0.55, 0), f(0.55, 0.5), f(1, 0.5), f(1, 1), f(0, 1)],
    T: [f(0, 0), f(1, 0), f(1, 0.4), f(0.65, 0.4), f(0.65, 1), f(0.35, 1), f(0.35, 0.4), f(0, 0.4)],
    triangle: [f(0, 1), f(0.5, 0), f(1, 1)],
    trapezoid: [f(0.2, 0), f(0.8, 0), f(1, 1), f(0, 1)],
  }[name];
  return P || null;
}
