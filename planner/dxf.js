/* A small, careful reader for ASCII DXF files (what CAD programs export): finds closed outlines to use as the site outline or as free-form shapes.
   Reads polylines (with curved segments), lines that join end to end, and circles. Everything else is skipped and counted. Pure functions, no page access. */
export const UNIT_M = { 1: 0.0254, 2: 0.3048, 4: 0.001, 5: 0.01, 6: 1, 7: 1000 };   // $INSUNITS code -> metres per drawing unit
const TAU = Math.PI * 2;

function pairsOf(text) {
  const L = String(text).split(/\r?\n/), out = [];
  for (let i = 0; i + 1 < L.length; i += 2) { const c = parseInt(L[i].trim(), 10); if (!Number.isFinite(c)) continue; out.push([c, L[i + 1].trim()]); }
  return out;
}
function arcPoints(p, q, bulge) {   // the bend of a polyline segment: bulge = tan(angle / 4); returns the points after p up to and including q
  if (!bulge || Math.abs(bulge) < 1e-9) return [q];
  const ang = 4 * Math.atan(bulge), chord = Math.hypot(q[0] - p[0], q[1] - p[1]); if (chord < 1e-12) return [q];
  const r = chord / (2 * Math.sin(Math.abs(ang) / 2)), mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, d = Math.sqrt(Math.max(0, r * r - chord * chord / 4)) * (bulge > 0 ? 1 : -1) * (Math.abs(ang) > Math.PI ? -1 : 1);
  const cx = mx - (q[1] - p[1]) / chord * d, cy = my + (q[0] - p[0]) / chord * d, a0 = Math.atan2(p[1] - cy, p[0] - cx), n = Math.max(2, Math.ceil(Math.abs(ang) / (Math.PI / 18))), pts = [];
  for (let k = 1; k < n; k++) { const a = a0 + ang * k / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  pts.push(q); return pts;
}
function bendy(verts, closed) {   // verts: [{x, y, b}] -> a plain point list with curved segments turned into short straight ones
  const pts = []; const n = verts.length;
  if (!n) return pts; pts.push([verts[0].x, verts[0].y]);
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) { const a = verts[i], b = verts[(i + 1) % n]; const seg = arcPoints([a.x, a.y], [b.x, b.y], a.b); for (const q of seg) pts.push(q); }
  if (closed) pts.pop();   // the last point is the first again
  return pts;
}
export function parseDxf(text) {
  const P = pairsOf(text); let factor = null, skipped = 0, i = 0;
  for (; i < P.length; i++) if (P[i][0] === 9 && P[i][1] === '$INSUNITS') { const v = P[i + 1]; if (v && v[0] === 70) factor = UNIT_M[parseInt(v[1], 10)] || null; break; }
  let s = -1; for (i = 0; i < P.length - 1; i++) if (P[i][0] === 0 && P[i][1] === 'SECTION' && P[i + 1][0] === 2 && P[i + 1][1] === 'ENTITIES') { s = i + 2; break; }
  if (s < 0) throw new Error('This file has no drawing in it (no ENTITIES section). Save it as an ASCII DXF and try again.');
  const ents = []; let cur = null;
  for (i = s; i < P.length; i++) {
    const [c, v] = P[i];
    if (c === 0) { if (v === 'ENDSEC') break; cur = { type: v, g: [] }; ents.push(cur); } else if (cur) cur.g.push([c, v]);
  }
  if (ents.length > 600000) throw new Error('This drawing has too many parts (' + ents.length.toLocaleString() + '). Export just the site boundary from your CAD program.');
  const closedLoops = [], open = [];   // open: point lists to be joined end to end
  const add = (pts, closed) => { const q = pts.filter((p, k) => k === 0 || Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]) > 1e-9); if (closed || (q.length > 2 && Math.hypot(q[0][0] - q[q.length - 1][0], q[0][1] - q[q.length - 1][1]) < 1e-6)) { if (!closed) q.pop(); if (q.length >= 3) closedLoops.push(q); } else if (q.length >= 2) open.push(q); };
  for (let e = 0; e < ents.length; e++) {
    const en = ents[e];
    if (en.type === 'LWPOLYLINE') {
      const verts = []; let flag = 0;
      for (const [c, v] of en.g) { if (c === 70) flag = parseInt(v, 10) || 0; else if (c === 10) verts.push({ x: parseFloat(v), y: 0, b: 0 }); else if (c === 20 && verts.length) verts[verts.length - 1].y = parseFloat(v); else if (c === 42 && verts.length) { const bb = parseFloat(v); verts[verts.length - 1].b = Number.isFinite(bb) ? bb : 0; } }
      add(bendy(verts.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y)), !!(flag & 1)), !!(flag & 1));
    } else if (en.type === 'POLYLINE') {
      let flag = 0; for (const [c, v] of en.g) if (c === 70) flag = parseInt(v, 10) || 0;
      const verts = []; let k = e + 1;
      for (; k < ents.length && ents[k].type !== 'SEQEND'; k++) if (ents[k].type === 'VERTEX') { const o = { x: NaN, y: NaN, b: 0 }; for (const [c, v] of ents[k].g) { if (c === 10) o.x = parseFloat(v); else if (c === 20) o.y = parseFloat(v); else if (c === 42) { const bb = parseFloat(v); o.b = Number.isFinite(bb) ? bb : 0; } } if (Number.isFinite(o.x) && Number.isFinite(o.y)) verts.push(o); }
      e = k; if (flag & 8 || flag & 16 || flag & 64) { skipped++; continue; }   // 3D polylines and meshes are not outlines
      add(bendy(verts, !!(flag & 1)), !!(flag & 1));
    } else if (en.type === 'LINE') {
      const o = {}; for (const [c, v] of en.g) o[c] = parseFloat(v);
      if ([10, 20, 11, 21].every(k => Number.isFinite(o[k]))) open.push([[o[10], o[20]], [o[11], o[21]]]); else skipped++;
    } else if (en.type === 'CIRCLE') {
      const o = {}; for (const [c, v] of en.g) o[c] = parseFloat(v);
      if ([10, 20, 40].every(k => Number.isFinite(o[k])) && o[40] > 0) { const pts = []; for (let k = 0; k < 36; k++) pts.push([o[10] + Math.cos(k / 36 * TAU) * o[40], o[20] + Math.sin(k / 36 * TAU) * o[40]]); closedLoops.push(pts); } else skipped++;
    } else if (!['VERTEX', 'SEQEND'].includes(en.type)) skipped++;
  }
  // join open pieces that meet end to end: ends are looked up in a table, so the work grows in step with the number of lines (not with its square)
  if (open.length) {
    let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
    for (const q of open) for (const p of [q[0], q[q.length - 1]]) { if (p[0] < ax) ax = p[0]; if (p[0] > bx) bx = p[0]; if (p[1] < ay) ay = p[1]; if (p[1] > by) by = p[1]; }
    const tol = Math.max(1e-9, 1e-6 * Math.hypot(bx - ax, by - ay)), key = p => Math.round(p[0] / tol) + ',' + Math.round(p[1] / tol), ends = new Map();
    open.forEach((q, i) => { for (const e of [0, 1]) { const k = key(e ? q[q.length - 1] : q[0]); let l = ends.get(k); if (!l) { l = []; ends.set(k, l); } l.push([i, e]); } });
    const used = new Uint8Array(open.length), grab = p => { const l = ends.get(key(p)); if (!l) return null; while (l.length) { const g = l.pop(); if (!used[g[0]]) return g; } return null; };
    const closed = c => c.length > 3 && key(c[0]) === key(c[c.length - 1]);
    const run = c => { while (!closed(c)) { const g = grab(c[c.length - 1]); if (!g) break; used[g[0]] = 1; const q = open[g[0]]; if (g[1] === 0) for (let k = 1; k < q.length; k++) c.push(q[k]); else for (let k = q.length - 2; k >= 0; k--) c.push(q[k]); } };
    for (let i = 0; i < open.length; i++) {
      if (used[i]) continue; used[i] = 1; let chain = open[i].slice(); run(chain);
      if (!closed(chain)) { chain.reverse(); run(chain); }
      if (closed(chain)) { chain.pop(); closedLoops.push(chain); } else skipped++;
    }
  }
  const outlines = closedLoops.map(q => { let a = 0; for (let k = 0; k < q.length; k++) { const p = q[k], r = q[(k + 1) % q.length]; a += p[0] * r[1] - r[0] * p[1]; } return { pts: q, area: Math.abs(a / 2) }; }).filter(o => o.area > 1e-9).sort((x, y) => y.area - x.area);
  return { factor, outlines, skipped };
}
function dp(pts, eps) {   // Douglas-Peucker on a closed ring (split at the two farthest points)
  if (pts.length <= 3) return pts.slice();
  const sd = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-12; return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L; };
  const run = (arr, lo, hi, keep) => { const st = [[lo, hi]]; while (st.length) { const [l, h] = st.pop(); let m = -1, mi = -1; for (let k = l + 1; k < h; k++) { const d = sd(arr[k], arr[l], arr[h]); if (d > m) { m = d; mi = k; } } if (m > eps) { keep[mi] = true; st.push([l, mi], [mi, h]); } } };   // a list of pending ranges instead of recursion, so a huge ring cannot overflow the stack
  let a = 0, b = 0, best = -1; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > best) { best = d; b = i; } }
  const keep = pts.map(() => false); keep[a] = keep[b] = true; run(pts, a, b, keep);
  const second = pts.slice(b).concat([pts[0]]), k2 = second.map(() => false); k2[0] = k2[second.length - 1] = true; run(second, 0, second.length - 1, k2);
  const out = []; pts.forEach((p, i) => { if (keep[i]) out.push(p); }); second.slice(1, -1).forEach((p, i) => { if (k2[i + 1]) out.push(p); });
  return out;
}
export function simplify(pts, maxPts = 100, scale = 1) {   // fewer corners, tolerance growing until it fits; never fewer than 3
  let eps = 0.002 * scale, out = pts.slice();
  for (let n = 0; out.length > maxPts && n < 40; n++) { const c = dp(pts, eps); if (c.length < 3) break; out = c; eps *= 1.6; }
  if (out.length > maxPts) { const step = out.length / maxPts; out = Array.from({ length: maxPts }, (_, i) => out[Math.floor(i * step)]); }
  return out;
}
/* turn outlines into plan metres: scale, flip up/down (CAD has y up), and move the lot so its corner sits at 0,0. Returns { w, h, rings } with rings in the same order. */
export function fitToPlan(outlines, metresPerUnit, { maxPts = 100 } = {}) {
  if (!outlines.length) return { w: 0, h: 0, rings: [] };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of outlines) for (const p of o.pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
  const f = metresPerUnit, rings = outlines.map(o => simplify(o.pts.map(p => [Math.round((p[0] - x0) * f * 1000) / 1000, Math.round((y1 - p[1]) * f * 1000) / 1000]), maxPts, Math.max((x1 - x0), (y1 - y0)) * f));
  return { w: Math.round((x1 - x0) * f * 100) / 100, h: Math.round((y1 - y0) * f * 100) / 100, rings };
}
