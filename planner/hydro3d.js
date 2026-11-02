/* Hydro and indoor gear in 3D: where a pipe or cable meets each item, how it runs along the floor, and where the plants go.
   Pure maths (no three.js, no page), so every rule here is tested in node.  The 3D view (view3d.js) and the part models (hydroparts.js) use it.
   Nothing here certifies anything: it only decides where things are drawn. */
import { EQUIP } from './indoor.js';
import { HYDRO_TYPES } from './hydro.js';

const D2R = Math.PI / 180;
/* tube radius by what it carries (metres) */
export const RADIUS = { water: 0.014, air: 0.007, power: 0.0055, control: 0.004 };
/* how high a system's working surface stands above the floor */
export const LIFT = { nft: 0.85, ebb: 0.8, dwc: 0.1, kratky: 0.3, dutch: 0.12, drip: 0.75, tower: 0, wick: 0.3, media: 0.75 };
/* systems whose feed and return are fixed fittings at the two ends (the feed manifold and the drain/return collector) */
const FIXED_ENDS = new Set(['nft', 'dutch']);
export const STUB = 0.12;   // a fitting sticks out this far before the pipe turns
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
export const liftOf = t => (own(LIFT, t) ? LIFT[t] : 0.3);

/* the plan point at (u, v) in an item's own frame (the same turn the planner and 3D view use) */
export const localPt = (it, u, v) => { const a = (it.rot || 0) * D2R; return [it.x + u * Math.cos(a) - v * Math.sin(a), it.y + u * Math.sin(a) + v * Math.cos(a)]; };
/* the other way: a plan point in the item's own frame */
export const toLocal = (it, x, z) => { const a = (it.rot || 0) * D2R, dx = x - it.x, dz = z - it.y; return [dx * Math.cos(a) + dz * Math.sin(a), -dx * Math.sin(a) + dz * Math.cos(a)]; };
const dirOut = (it, du, dv) => { const a = (it.rot || 0) * D2R; return [du * Math.cos(a) - dv * Math.sin(a), du * Math.sin(a) + dv * Math.cos(a)]; };
export const footprint = (it, pad = 0) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => localPt(it, a * (it.w / 2 + pad), b * (it.h / 2 + pad)));

/* a small repeatable number from an id, so two links to the same item do not land on the same spot */
const hash = s => { let h = 7; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
const spread = id => [-0.06, 0, 0.06][hash(id) % 3];

/* ---------- what each end of a link is for ---------- */
const isHydro = i => i.kind === 'hydro';
const isGear = (i, k) => i.kind === 'gear' && i.item === k;
const isRes = i => i.kind === 'gear' && (i.item === 'reservoir50' || i.item === 'reservoir100' || i.item === 'bucket');
const isPump = i => isGear(i, 'water_pump');
const isAirPump = i => isGear(i, 'air_pump');
/* The role an item plays in one link: which fitting the pipe joins.  `from` says whether this item is the link's first end. */
export function roleOf(it, other, medium, from) {
  if (medium === 'water') {
    if (isHydro(it)) return isPump(other) ? 'feed' : isRes(other) ? 'return' : isHydro(other) ? (from ? 'return' : 'feed') : 'feed';
    if (isRes(it)) return isHydro(other) ? 'inlet' : 'outlet';
    if (isPump(it)) return isRes(other) ? 'inlet' : 'outlet';
    return 'outlet';
  }
  if (medium === 'air') return isAirPump(it) ? 'outlet' : isGear(it, 'inline_fan') || isGear(it, 'carbon_filter') ? (from ? 'out' : 'in') : 'air';
  if (medium === 'power') return isGear(it, 'power_board') ? 'socket' : 'plug';
  return isGear(it, 'timer') || isGear(it, 'thermostat') ? 'out' : 'in';
}

/* height of a fitting above the item's own floor level (metres) */
export function portHeight(it, role) {
  if (isHydro(it)) {
    const lift = liftOf(it.type);
    if (it.type === 'nft') { const drop = it.w / Math.max(20, +it.slope || 60); return role === 'return' ? lift - drop / 2 - 0.06 : lift + drop / 2 + 0.09; }   // the gutter's spout, and the feed manifold
    if (it.type === 'dutch') return role === 'return' ? lift + 0.06 : lift + 0.52;   // the drain collector, and the drip header
    if (it.type === 'drip') return role === 'return' ? lift - 0.02 : lift + 0.42;
    if (it.type === 'tower') return role === 'return' ? 0.1 : 1.65;
    if (it.type === 'media') return role === 'return' ? lift + 0.05 : lift + 0.12;
    if (it.type === 'wick') return lift + 0.12;
    if (it.type === 'dwc') return role === 'return' ? lift + 0.05 : role === 'air' ? lift + 0.28 : lift + 0.2;
    if (it.type === 'ebb') return lift + 0.04;
    return lift + 0.1;
  }
  const e = EQUIP[it.item], hg = e ? e.hgt : 0.1;
  if (isRes(it)) return role === 'outlet' ? Math.min(0.1, hg * 0.3) : hg * 0.92;
  if (isPump(it)) return role === 'outlet' ? hg * 0.85 : 0.025;
  if (isAirPump(it)) return hg * 0.7;
  if (isGear(it, 'inline_fan') || isGear(it, 'carbon_filter')) return hg * 0.5;
  if (role === 'socket') return hg * 0.5;
  return Math.min(hg * 0.5, 0.15);
}

/* where a pipe meets an item, on the side facing the item at the other end.  Returns { p: [x, z], y, out: [dx, dz] } (y is above the item's floor). */
export function attach(it, role, toward, portId) {
  if (portId) { const P = portsOf(it).find(q => q.id === portId); if (P) return portPos(it, P); }
  const [du, dv] = toLocal(it, toward[0], toward[1]), hw = it.w / 2, hh = it.h / 2;
  let u, v, ou = 0, ov = 0;
  if (isHydro(it) && FIXED_ENDS.has(it.type) && (role === 'feed' || role === 'return')) {
    // the feed manifold is at the high end (left), the return gutter at the low end (right)
    u = role === 'feed' ? -hw - 0.03 : hw + 0.04; const s = role === 'feed' ? 1 : -1; v = s * (hh + 0.05); ov = s;   // the feed comes in at the near end of the manifold, the return leaves from the far end of the gutter
  } else if (Math.abs(du) / Math.max(hw, 1e-6) >= Math.abs(dv) / Math.max(hh, 1e-6)) {
    const s = du >= 0 ? 1 : -1; u = s * hw; ou = s; v = Math.max(-hh + 0.03, Math.min(hh - 0.03, dv * 0.3));
  } else {
    const s = dv >= 0 ? 1 : -1; v = s * hh; ov = s; u = Math.max(-hw + 0.03, Math.min(hw - 0.03, du * 0.3));
  }
  // a little sideways give so two links on one side do not sit on the same point
  const sg = spread(role + (it.id || ''));
  if (ou) v = Math.max(-hh + 0.02, Math.min(hh - 0.02, v + sg)); else if (ov) u = Math.max(-hw - 0.2, Math.min(hw + 0.2, u + sg));
  return { p: localPt(it, u, v), y: portHeight(it, role), out: dirOut(it, ou, ov) };
}

/* ---------- ports: the named places on an item where a hose or cable joins ---------- */
/* which way a port passes things: 'src' gives (a pump outlet, a power socket, a timer's control output), 'dst' takes (an inlet, a plug, a control input).  A link joins one of each. */
export const ROLE_DIR = { outlet: 'src', return: 'src', out: 'src', socket: 'src', inlet: 'dst', feed: 'dst', in: 'dst', plug: 'dst', air: 'dst' };
const PORT_LABEL = { feed: 'Feed in', return: 'Return out', air: 'Air in', inlet: 'Water in', outlet: 'Water out', plug: 'Power plug', socket: 'Power sockets', in: 'In', out: 'Out' };
const gearWatts = it => { const e = EQUIP[it.item]; return Math.max(+it.watts || 0, e ? e.watts || 0 : 0); };
export function portsOf(it) {
  const P = (id, medium, side, label) => ({ id, role: id, medium, side, label: label || PORT_LABEL[id] || id });
  if (!it || typeof it !== 'object') return [];
  if (isHydro(it)) { const T = HYDRO_TYPES[it.type] || {}, out = [P('feed', 'water', 'w'), P('return', 'water', 'e')]; if (T.air) out.push(P('air', 'air', 'n')); return out; }
  if (it.kind !== 'gear') return [];
  const k = it.item;
  if (isRes(it)) return [P('inlet', 'water', 'w'), P('outlet', 'water', 'e'), P('air', 'air', 'n', 'Air in (air stone)')];
  if (k === 'water_pump') return [P('inlet', 'water', 'w'), P('outlet', 'water', 'e'), P('plug', 'power', 's'), P('in', 'control', 'n', 'Control in')];
  if (k === 'air_pump') return [P('outlet', 'air', 'e', 'Air out'), P('plug', 'power', 's')];
  if (k === 'power_board') return [P('socket', 'power', 'n', 'Power sockets')];
  if (k === 'timer') return [P('plug', 'power', 's'), P('socket', 'power', 'n', 'Power out'), P('out', 'control', 'e', 'Control out')];
  if (k === 'thermostat') return [P('plug', 'power', 's'), P('out', 'control', 'e', 'Control out')];
  if (k === 'inline_fan') return [P('plug', 'power', 's')];   // duct links to fans and filters are not drawn yet
  if (k === 'carbon_filter') return [];
  if (gearWatts(it) > 0) return [P('plug', 'power', 's'), P('in', 'control', 'n', 'Control in')];
  return [];
}
/* where a port is: { p: [x, z], y, out: [dx, dz] } (y above the item's floor) */
export function portPos(it, port) {
  const hw = it.w / 2, hh = it.h / 2, all = portsOf(it);
  if (isHydro(it) && FIXED_ENDS.has(it.type) && (port.id === 'feed' || port.id === 'return')) {
    const feed = port.id === 'feed', s = feed ? 1 : -1, u = feed ? -hw - 0.03 : hw + 0.04, v = s * (hh + 0.05);
    return { p: localPt(it, u, v), y: portHeight(it, port.role), out: dirOut(it, 0, s) };
  }
  const same = all.filter(q => q.side === port.side), i = same.findIndex(q => q.id === port.id), off = (i - (same.length - 1) / 2) * 0.09;
  let u = 0, v = 0, ou = 0, ov = 0;
  if (port.side === 'w' || port.side === 'e') { const sg = port.side === 'w' ? -1 : 1; u = sg * hw; ou = sg; v = Math.max(-hh + 0.02, Math.min(hh - 0.02, off)); }
  else { const sg = port.side === 'n' ? -1 : 1; v = sg * hh; ov = sg; u = Math.max(-hw + 0.02, Math.min(hw - 0.02, off)); }
  return { p: localPt(it, u, v), y: portHeight(it, port.role), out: dirOut(it, ou, ov) };
}
export const portCompatible = (pa, pb) => !!pa && !!pb && pa.medium === pb.medium && ROLE_DIR[pa.role] !== ROLE_DIR[pb.role];
/* the best pair of ports for a link between a and b (carrying `medium`).  The link runs from a to b, so a's port should GIVE (outlet, return, socket, control out) and b's should TAKE
   (inlet, feed, plug, control in); the other way round is allowed but loses.  A port already used by another locked link loses to a free one; then the shorter way wins. */
export function pickPair(a, b, medium, used, want) {
  let best = null, bc = Infinity;
  for (const pa of portsOf(a)) for (const pb of portsOf(b)) {
    if (medium && pa.medium !== medium) continue; if (!portCompatible(pa, pb)) continue;
    if (want && want.from && pa.id !== want.from) continue; if (want && want.to && pb.id !== want.to) continue;
    const A = portPos(a, pa), B = portPos(b, pb), fwd = ROLE_DIR[pa.role] === 'src';
    const d = Math.hypot(A.p[0] - B.p[0], A.p[1] - B.p[1]) + (fwd ? 0 : 100) + (used && used.has(a.id + '|' + pa.id) ? 20 : 0) + (used && used.has(b.id + '|' + pb.id) ? 20 : 0);
    if (d < bc) { bc = d; best = { from: pa, to: pb }; }
  }
  return best;
}
/* a link's ports are only good if both exist, carry what the link carries, and join one giver to one taker */
export function portsValid(c, a, b) {
  const pa = c.fp && portsOf(a).find(q => q.id === c.fp), pb = c.tp && portsOf(b).find(q => q.id === c.tp);
  return !!pa && !!pb && pa.medium === c.medium && pb.medium === c.medium && portCompatible(pa, pb);
}
/* a short key for a link's two ends, the same whichever way round it was drawn */
export const linkKey = c => [c.from + '|' + (c.fp || ''), c.to + '|' + (c.tp || '')].sort().join('>') + '|' + c.medium;
/* both ends of a link: from its chosen ports, or the side-facing fittings of old links */
export function endPoints(c, a, b) {
  const pa = c.fp && portsOf(a).find(q => q.id === c.fp), pb = c.tp && portsOf(b).find(q => q.id === c.tp);
  const A = pa ? portPos(a, pa) : attach(a, roleOf(a, b, c.medium, true), [b.x, b.y]), B = pb ? portPos(b, pb) : attach(b, roleOf(b, a, c.medium, false), [a.x, a.y]);
  return { A, B };
}
/* the length of hose or cable a link needs, in metres, as an ESTIMATE: out of one fitting, along the floor with square bends, up to the other */
export function linkLength(c, a, b, items, obs) {
  const { A, B } = endPoints(c, a, b), R = routeLink(c, A, B, { lane: 0.03, a: 0.03, b: 0.03 }, items || [], obs || (items ? undefined : []));
  let L = 0; for (let i = 1; i < R.pts.length; i++) L += Math.hypot(R.pts[i][0] - R.pts[i - 1][0], R.pts[i][1] - R.pts[i - 1][1], R.pts[i][2] - R.pts[i - 1][2]);
  return L;
}

/* ---------- running a pipe along the floor ---------- */
const orient = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
const segCross = (a, b, c, d) => { const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b); return o1 * o2 < 0 && o3 * o4 < 0; };
const inPoly = (p, q) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > p[1]) !== (q[j][1] > p[1]) && p[0] < (q[j][0] - q[i][0]) * (p[1] - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) c = !c; return c; };
export const segHitsPoly = (a, b, q) => { if (inPoly(a, q) || inPoly(b, q)) return true; for (let i = 0; i < q.length; i++) if (segCross(a, b, q[i], q[(i + 1) % q.length])) return true; return false; };

/* the floor-standing things a pipe should go round (a table or bench stands on legs, so a pipe may pass under it) */
export function obstacles(items) {
  const out = [];
  for (const it of items) {
    if (it.off) continue;
    if (it.kind === 'gear' && !it.shelf && EQUIP[it.item] && EQUIP[it.item].mount === 'floor') out.push({ id: it.id, poly: footprint(it, 0.03), soft: false });
    else if (it.kind === 'hydro' && liftOf(it.type) < 0.5) out.push({ id: it.id, poly: footprint(it, 0.03), soft: false });
    else if (it.kind === 'hydro' || it.kind === 'shelf') out.push({ id: it.id, poly: footprint(it, 0.03), soft: true });
  }
  return out;
}
/* orthogonal routes between two plan points: the two L-shapes and two Z-shapes; the cheapest wins (length, corners, crossing things) */
function planRoute(a, b, obs, wiggle) {
  const [ax, az] = a, [bx, bz] = b, mx = (ax + bx) / 2 + wiggle, mz = (az + bz) / 2 + wiggle;
  const cands = [[a, [bx, az], b], [a, [ax, bz], b], [a, [mx, az], [mx, bz], b], [a, [ax, mz], [bx, mz], b]];
  /* going round the things in the way: out to one side of each, along, and back (U shapes) */
  const hard = obs.filter(o => !o.soft).slice(0, 8);
  for (const o of hard) {
    const xs = o.poly.map(q => q[0]), zs = o.poly.map(q => q[1]), x0 = Math.min(...xs) - 0.12, x1 = Math.max(...xs) + 0.12, z0 = Math.min(...zs) - 0.12, z1 = Math.max(...zs) + 0.12;
    for (const z of [z0, z1]) cands.push([a, [ax, z], [bx, z], b]);
    for (const x of [x0, x1]) cands.push([a, [x, az], [x, bz], b]);
  }
  let best = null, bestCost = Infinity;
  for (const poly of cands) {
    const pts = poly.filter((p, i) => i === 0 || Math.hypot(p[0] - poly[i - 1][0], p[1] - poly[i - 1][1]) > 1e-6);
    let len = 0, hit = 0, soft = 0;
    for (let i = 1; i < pts.length; i++) { len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); for (const o of obs) if (segHitsPoly(pts[i - 1], pts[i], o.poly)) { if (o.soft) soft++; else hit++; } }
    const cost = len + 4 * (pts.length - 2) + 1000 * hit + 0.5 * soft;
    if (cost < bestCost - 1e-9) { best = pts; bestCost = cost; }
  }
  return { pts: best, hits: Math.floor(bestCost / 1000) };
}
const same3 = (p, q) => Math.abs(p[0] - q[0]) < 1e-6 && Math.abs(p[1] - q[1]) < 1e-6 && Math.abs(p[2] - q[2]) < 1e-6;
const collinear = (a, b, c) => { const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - b[0], c[1] - b[1], c[2] - b[2]], x = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; return Math.hypot(...x) < 1e-9; };
/* Route one link.  A and B come from attach(); floors = { lane: the floor the pipe lies on, a, b: what each end's item stands on (a tier board, say) }; items are all the plan's items.
   Returns the 3D points of the pipe: [x, y, z] (y up).  The pipe leaves each fitting, drops to the floor, runs along it with square bends, and rises to the next fitting. */
export function routeLink(c, A, B, floors, items, obsAll) {
  const r = RADIUS[c.medium] || RADIUS.water, lane = floors.lane + r + 0.004;
  const yA = floors.a + A.y, yB = floors.b + B.y;
  const axis = o => (Math.abs(o[0]) >= Math.abs(o[1]) ? [Math.sign(o[0]) || 1, 0] : [0, Math.sign(o[1]) || 1]);   // pipes run along the plan's axes, even out of a turned item
  const oa = axis(A.out), ob = axis(B.out);
  const sa = [A.p[0] + oa[0] * STUB, A.p[1] + oa[1] * STUB], sb = [B.p[0] + ob[0] * STUB, B.p[1] + ob[1] * STUB];
  const wiggle = ((hash(c.id) % 5) - 2) * 0.05;
  const all = obsAll || obstacles(items || []), x0 = Math.min(sa[0], sb[0]) - 1.5, x1 = Math.max(sa[0], sb[0]) + 1.5, z0 = Math.min(sa[1], sb[1]) - 1.5, z1 = Math.max(sa[1], sb[1]) + 1.5;
  const obs = all.filter(o => { let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity; for (const q of o.poly) { a0 = Math.min(a0, q[0]); a1 = Math.max(a1, q[0]); b0 = Math.min(b0, q[1]); b1 = Math.max(b1, q[1]); } return a1 >= x0 && a0 <= x1 && b1 >= z0 && b0 <= z1; });   // only what is near this link matters
  const { pts, hits } = planRoute(sa, sb, obs, wiggle);
  let path = [[A.p[0], yA, A.p[1]], [sa[0], yA, sa[1]], [sa[0], lane, sa[1]]];
  for (let i = 1; i < pts.length; i++) path.push([pts[i][0], lane, pts[i][1]]);
  path.push([sb[0], yB, sb[1]], [B.p[0], yB, B.p[1]]);
  path = path.filter((p, i) => i === 0 || !same3(p, path[i - 1]));
  const out = [path[0]]; for (let i = 1; i < path.length - 1; i++) if (!collinear(out[out.length - 1], path[i], path[i + 1])) out.push(path[i]); out.push(path[path.length - 1]);
  return { pts: out, r, hits };
}

/* ---------- plants ---------- */
const cap = n => Math.min(n, 800);
/* where the plant sites are, in the item's own frame: [{ u, v }], and the block the plant engine wants (rows x cols from a corner) */
export function siteLayout(it) {
  if (it.type === 'tower') { const n = Math.max(4, Math.min(60, Math.round(+it.pockets || 20))); return { rows: 1, cols: n, rowSp: 0.18, colSp: 0.18, u0: 0, v0: 0, count: n, sites: Array.from({ length: n }, () => ({ u: 0, v: 0 })) }; }
  const sp = Math.max(0.05, +it.spacing || 0.2);
  let rows, cols, rowSp, colSp;
  if (it.type === 'nft') { rows = Math.max(1, Math.round(+it.channels || 1)); cols = Math.max(1, Math.floor((it.w + 1e-9) / sp)); rowSp = it.h / rows; colSp = sp; }
  else { cols = Math.max(1, Math.floor((it.w + 1e-9) / sp)); rows = Math.max(1, Math.floor((it.h + 1e-9) / sp)); rowSp = sp; colSp = sp; }
  const u0 = -((cols - 1) * colSp) / 2, v0 = -((rows - 1) * rowSp) / 2;
  const sites = []; for (let r = 0; r < rows && sites.length < 800; r++) for (let k = 0; k < cols && sites.length < 800; k++) sites.push({ u: u0 + k * colSp, v: v0 + r * rowSp });   // only the first 800 are kept, so only those are made
  return { rows, cols, rowSp, colSp, u0, v0, count: rows * cols, sites };
}
/* the cells of a seedling tray */
export function trayLayout(it, cells) {
  if (!(cells > 1)) return { rows: 0, cols: 0, count: 0, sites: [] };
  const ratio = it.w / it.h; let rows = Math.max(1, Math.round(Math.sqrt(cells / ratio))), cols = Math.max(1, Math.round(cells / rows));
  const colSp = it.w / cols, rowSp = it.h / rows, u0 = -((cols - 1) * colSp) / 2, v0 = -((rows - 1) * rowSp) / 2, sites = [];
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) sites.push({ u: u0 + k * colSp, v: v0 + r * rowSp });
  return { rows, cols, rowSp, colSp, u0, v0, count: rows * cols, sites };
}

/* indoor crop to the plant shape drawn outdoors; `has` is the set of shapes that exist.  Microgreens are a dense mat, not single plants (returns ''). */
const ALIAS = { lettuce: 'lettuce', basil: 'basil', parsley: 'parsley', dill: 'herbs', sage: 'herbs', coriander: 'herbs', tomato: 'tomato', pepper: 'capsicum', eggplant: 'eggplant', brassica: 'cabbage', cucurbit: 'pattypan', onion: 'onion', celery: 'silverbeet', flower: 'herbs' };
export function speciesFor(crop, has) {
  if (typeof crop !== 'string' || crop.startsWith('mg_')) return '';
  const base = crop.replace(/^(h|s)_/, ''), want = own(ALIAS, base) ? ALIAS[base] : 'herbs';
  return !has || has.has(want) ? want : has.has('herbs') ? 'herbs' : '';
}
/* how big each plant should be drawn when full grown: spread and height in metres */
export const MATURE = { lettuce: [0.26, 0.2], basil: [0.28, 0.32], parsley: [0.24, 0.26], herbs: [0.26, 0.3], tomato: [0.3, 0.45], capsicum: [0.3, 0.4], eggplant: [0.3, 0.4], cabbage: [0.3, 0.22], pattypan: [0.4, 0.25], onion: [0.18, 0.3], silverbeet: [0.28, 0.35] };
export const matureOf = species => (own(MATURE, species) ? MATURE[species] : [0.25, 0.25]);
