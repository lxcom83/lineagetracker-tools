/* Hydro systems and indoor gear as 3D models: tilted NFT channels with lids, net pots and a feed manifold; a dark DWC tub with a raft; a flood table; Kratky jars;
   lidded reservoirs, pumps, fans and filters; and the pipes and cables between them (round tubes with square bends and fittings).
   Everything is built from a few shared shapes (unit box, cylinder, ball), so the page can join them into a handful of draw calls.
   The where-does-the-pipe-go maths is in hydro3d.js and is tested in node; this file only turns those numbers into shapes.  Nothing here certifies anything. */

const D2R = Math.PI / 180;
const C = { pipe: '#23272b', white: '#e6eaec', pale: '#d3d9dc', grey: '#aeb6ba', dark: '#2b3035', tub: '#2d3338', lid: '#3b4349', frame: '#59636e', pot: '#25292d', flange: '#c6cdd0', hole: '#14171a', media: '#66605a', water: '#5da6cf', jar: '#2f4a5a', metal: '#8d969b' };
export const LINK_COL = { water: '#2a7fbf', air: '#8b9298', power: '#e08a1e', control: '#7b4bb0' };

export function makeParts(env) {
  const { THREE, solids, flat, IND, H3, date } = env;
  const UB = new THREE.BoxGeometry(1, 1, 1), UC = new THREE.CylinderGeometry(1, 1, 1, 14), UBALL = new THREE.SphereGeometry(1, 10, 8), UPOT = new THREE.CylinderGeometry(1, 0.7, 1, 10);
  let cups = 0; const CUP_MAX = 4500;   // net pots drawn over the whole view
  /* a budget so an absurdly large system cannot make the 3D view run out of memory: each system draws at most PER_SYS pots/jars/buckets and the whole view SITE_MAX */
  const PER_SYS = 1500, SITE_MAX = 4500; let siteLeft = SITE_MAX;   // PER_SYS matches the most sites that get plants drawn (view3d)
  const cap = n => Math.max(2, Math.min(n, 40));   // legs and rails: a few dozen is plenty
  function takeGrid(rows, cols) {
    const allow = Math.max(0, Math.min(PER_SYS, siteLeft)); if (!allow) return { R: 0, K: 0 };
    const K = Math.max(1, Math.min(cols, allow)), R = Math.max(1, Math.min(rows, Math.floor(allow / K)));
    siteLeft -= R * K; return { R, K };
  }

  const grp = (it, y) => { const g = new THREE.Group(); g.position.set(it.x, y, it.y); g.rotation.y = -(it.rot || 0) * D2R; solids.add(g); return g; };
  const add = (g, geo, c, sx, sy, sz, u, y, v, rot) => { const m = new THREE.Mesh(geo, flat(c)); m.scale.set(sx, sy, sz); m.position.set(u, y, v); if (rot) m.rotation.set(rot[0] || 0, rot[1] || 0, rot[2] || 0); g.add(m); return m; };
  const bx = (g, c, w, h, d, u, y, v) => add(g, UB, c, Math.max(0.002, w), Math.max(0.002, h), Math.max(0.002, d), u, y + h / 2, v);      // y is the bottom
  const cyl = (g, c, r, h, u, y, v) => add(g, UC, c, r, Math.max(0.002, h), r, u, y + h / 2, v);                                       // upright, y is the bottom
  const cylU = (g, c, r, len, u, y, v) => add(g, UC, c, r, len, r, u, y, v, [0, 0, Math.PI / 2]);                                       // lying along u, y is the middle
  const cylV = (g, c, r, len, u, y, v) => add(g, UC, c, r, len, r, u, y, v, [Math.PI / 2, 0, 0]);                                       // lying along v
  const ball = (g, c, r, u, y, v) => add(g, UBALL, c, r, r, r, u, y, v);
  const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

  /* a round tube between two points in the plan (x, y up, z) */
  const tube = (a, b, r, c) => {
    const d = V3(b[0] - a[0], b[1] - a[1], b[2] - a[2]), L = d.length(); if (L < 1e-4) return;
    const m = new THREE.Mesh(UC, flat(c)); m.scale.set(r, L, r); m.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2); m.quaternion.setFromUnitVectors(V3(0, 1, 0), d.normalize()); solids.add(m);
  };
  const jointBall = (p, r, c) => { const m = new THREE.Mesh(UBALL, flat(c)); m.scale.set(r, r, r); m.position.set(p[0], p[1], p[2]); solids.add(m); };

  /* how far through its cycle a batch is: null when nothing is growing */
  function growth(it) {
    const cy = IND.cycleOf(it.crop), st = IND.status(it, date);
    if (!cy || !(st === 'growing' || st === 'ready' || st === 'late')) return null;
    const tl = IND.timeline(cy, it.sow, it.actual, it.reset), total = Math.max(1, IND.daysBetween(it.sow, tl.readyExp)), done = Math.max(0, IND.daysBetween(it.sow, date));
    return { f: Math.min(1, done / total), st, cy };
  }

  /* a net pot sitting in a lid: a dark ring with a pale flange (the plant stands in it) */
  function pot(g, u, y, v) {
    if (cups >= CUP_MAX) return; cups++;
    add(g, UPOT, C.pot, 0.027, 0.045, 0.027, u, y - 0.0225 + 0.004, v);
    add(g, UC, C.flange, 0.034, 0.005, 0.034, u, y + 0.0025, v);
    add(g, UC, C.hole, 0.021, 0.0055, 0.021, u, y + 0.0055, v);
  }

  /* ---------- the systems ---------- */
  /* Each returns { surf(u, v) -> height of the plant bases above the floor, lab, mat?: { y, w, h } }.  `base` is the floor the system stands on. */
  function nft(it, g) {
    const hw = it.w / 2, hh = it.h / 2, lift = H3.LIFT.nft, ch = Math.max(1, Math.round(+it.channels || 1)), chN = Math.min(ch, 60), pitch = it.h / ch, wd = Math.max(0.03, Math.min(0.1, pitch * 0.6));
    const slope = Math.max(20, +it.slope || 60), drop = it.w / slope, tilt = -Math.atan(drop / it.w);
    // legs and rails: a frame under the channels
    const nLeg = cap(Math.ceil(it.w / 1.2) + 1);
    for (let i = 0; i < nLeg; i++) {
      const u = -hw + 0.05 + (it.w - 0.1) * i / (nLeg - 1);
      for (const s of [-1, 1]) bx(g, C.frame, 0.04, lift - 0.06, 0.04, u, 0, s * (hh - 0.03));
      bx(g, C.frame, 0.035, 0.03, it.h - 0.02, u, lift - 0.075, 0);
    }
    for (const s of [-1, 1]) bx(g, C.frame, it.w, 0.03, 0.035, 0, lift - 0.075, s * (hh - 0.03));
    const sp = Math.max(0.05, +it.spacing || 0.2), cols = Math.max(1, Math.floor((it.w + 1e-9) / sp)), colSp = sp, u0 = -((cols - 1) * colSp) / 2;
    const gbN = takeGrid(chN, cols);
    for (let c = 0; c < chN; c++) {
      const v = -hh + pitch * (c + 0.5), cg = new THREE.Group(); cg.position.set(0, lift, v); cg.rotation.z = tilt; g.add(cg);
      bx(cg, C.pale, it.w, 0.004, wd, 0, 0, 0);
      for (const s of [-1, 1]) bx(cg, C.pale, it.w, 0.05, 0.004, 0, 0, s * (wd / 2 - 0.002));
      bx(cg, C.white, it.w + 0.004, 0.004, wd + 0.004, 0, 0.05, 0);                       // the lid, with a hole for each plant
      for (const s of [-1, 1]) bx(cg, C.white, 0.004, 0.056, wd, s * (hw + 0.002), 0, 0);   // end caps
      if (c < gbN.R) for (let k = 0; k < gbN.K; k++) { const u = u0 + k * colSp; pot(cg, u, 0.054, 0); }
      bx(cg, C.pale, 0.05, 0.012, 0.03, hw + 0.025, -0.002, 0);                           // the spout over the return gutter
    }
    const my = lift + drop / 2 + 0.09, gy = lift - drop / 2 - 0.06;
    cylV(g, C.pipe, 0.016, it.h + 0.1, -hw - 0.03, my, 0);                                    // the feed manifold across the high end
    for (let c = 0; c < chN; c++) { const v = -hh + pitch * (c + 0.5); cylU(g, C.pipe, 0.007, 0.07, -hw, my, v); cyl(g, C.pipe, 0.007, 0.04, -hw + 0.033, lift + drop / 2 + 0.05, v); }
    cylV(g, C.grey, 0.04, it.h + 0.1, hw + 0.04, gy, 0);                                       // the return gutter at the low end
    for (const s of [-1, 1]) ball(g, C.grey, 0.04, hw + 0.04, gy, s * (hh + 0.05));
    return { surf: u => lift + 0.058 - u * drop / it.w, lab: lift + drop / 2 + 0.55, mat: null };
  }

  function dwc(it, g) {
    const hw = it.w / 2, hh = it.h / 2, y0 = 0.1, top = 0.4, t = 0.014;
    for (const s of [-1, 1]) bx(g, C.frame, 0.06, y0, it.h - 0.06, s * (hw - 0.12), 0, 0);   // two skids under the tub
    bx(g, C.tub, it.w, 0.012, it.h, 0, y0, 0);
    for (const s of [-1, 1]) { bx(g, C.tub, it.w, top - y0, t, 0, y0, s * (hh - t / 2)); bx(g, C.tub, t, top - y0, it.h - 2 * t, s * (hw - t / 2), y0, 0); }
    bx(g, C.water, it.w - 2 * t, 0.004, it.h - 2 * t, 0, top - 0.06, 0);                     // the solution, a little below the raft
    bx(g, C.white, it.w - 2 * t - 0.012, 0.025, it.h - 2 * t - 0.012, 0, top - 0.04, 0);       // the raft floating on it
    const sp = Math.max(0.05, +it.spacing || 0.2), cols = Math.max(1, Math.floor((it.w + 1e-9) / sp)), rows = Math.max(1, Math.floor((it.h + 1e-9) / sp));
    { const gb = takeGrid(rows, cols); for (let r = 0; r < gb.R; r++) for (let k = 0; k < gb.K; k++) pot(g, -((cols - 1) * sp) / 2 + k * sp, top - 0.015, -((rows - 1) * sp) / 2 + r * sp); }
    bx(g, '#a9c9dc', 0.014, top - y0 - 0.06, 0.014, hw + 0.012, y0 + 0.03, hh - 0.08);        // a see-through level tube on the end
    bx(g, C.lid, 0.026, 0.02, 0.026, hw + 0.012, top - 0.04, hh - 0.08);
    return { surf: () => top - 0.015 + 0.012, lab: top + 0.55, mat: null };
  }

  function kratky(it, g) {
    const hw = it.w / 2, hh = it.h / 2, lift = H3.LIFT.kratky, sp = Math.max(0.05, +it.spacing || 0.2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, C.frame, 0.04, lift - 0.03, 0.04, sx * (hw - 0.03), 0, sz * (hh - 0.03));
    bx(g, C.frame, it.w, 0.03, it.h, 0, lift - 0.03, 0);
    const cols = Math.max(1, Math.floor((it.w + 1e-9) / sp)), rows = Math.max(1, Math.floor((it.h + 1e-9) / sp));
    if (it.h <= 0.4) {   // a row of jars, each with its own lid and plant
      const r = Math.min(0.09, sp * 0.42);
      for (let k = 0, KK = takeGrid(1, cols).K; k < KK; k++) { const u = -((cols - 1) * sp) / 2 + k * sp; cyl(g, C.jar, r, 0.16, u, lift, 0); cyl(g, C.pot, r * 1.02, 0.012, u, lift + 0.16, 0); pot(g, u, lift + 0.172, 0); bx(g, '#a9c9dc', 0.01, 0.1, 0.004, u, lift + 0.03, r * 1.01); }
      return { surf: () => lift + 0.172 + 0.012, lab: lift + 0.6, mat: null };
    }
    const top = lift + 0.2;
    bx(g, C.tub, it.w, 0.01, it.h, 0, lift, 0);
    for (const s of [-1, 1]) { bx(g, C.tub, it.w, top - lift, 0.012, 0, lift, s * (hh - 0.006)); bx(g, C.tub, 0.012, top - lift, it.h, s * (hw - 0.006), lift, 0); }
    bx(g, C.lid, it.w + 0.01, 0.012, it.h + 0.01, 0, top, 0);
    { const gb = takeGrid(rows, cols); for (let r = 0; r < gb.R; r++) for (let k = 0; k < gb.K; k++) pot(g, -((cols - 1) * sp) / 2 + k * sp, top + 0.012, -((rows - 1) * sp) / 2 + r * sp); }
    return { surf: () => top + 0.012 + 0.012, lab: top + 0.55, mat: null };
  }

  function ebb(it, g) {
    const hw = it.w / 2, hh = it.h / 2, lift = H3.LIFT.ebb, wallH = 0.13, sp = Math.max(0.05, +it.spacing || 0.2);
    const nx = cap(Math.ceil(it.w / 1.2) + 1);
    for (let i = 0; i < nx; i++) { const u = -hw + 0.04 + (it.w - 0.08) * i / (nx - 1); for (const s of [-1, 1]) bx(g, C.frame, 0.04, lift - 0.03, 0.04, u, 0, s * (hh - 0.03)); }
    for (const s of [-1, 1]) bx(g, C.frame, it.w, 0.03, 0.035, 0, lift - 0.06, s * (hh - 0.03));
    bx(g, C.white, it.w, 0.012, it.h, 0, lift - 0.03, 0);
    for (const s of [-1, 1]) { bx(g, C.white, it.w, wallH, 0.012, 0, lift - 0.03, s * (hh - 0.006)); bx(g, C.white, 0.012, wallH, it.h, s * (hw - 0.006), lift - 0.03, 0); }
    bx(g, C.water, it.w - 0.03, 0.004, it.h - 0.03, 0, lift - 0.02, 0);
    const cols = Math.max(1, Math.floor((it.w + 1e-9) / sp)), rows = Math.max(1, Math.floor((it.h + 1e-9) / sp)), s0 = Math.min(0.14, sp * 0.8);
    const gb = takeGrid(rows, cols);
    for (let r = 0; r < gb.R; r++) for (let k = 0; k < gb.K; k++) {
      const u = -((cols - 1) * sp) / 2 + k * sp, v = -((rows - 1) * sp) / 2 + r * sp;
      bx(g, C.pot, s0, 0.11, s0, u, lift - 0.018, v); bx(g, C.media, s0 - 0.014, 0.004, s0 - 0.014, u, lift + 0.088, v);
    }
    cyl(g, C.white, 0.013, wallH + 0.01, hw - 0.05, lift - 0.03, hh - 0.05);                  // the overflow standpipe
    cyl(g, C.white, 0.02, 0.01, hw - 0.05, lift - 0.03 + wallH + 0.01, hh - 0.05);
    return { surf: () => lift + 0.092 + 0.01, lab: lift + 0.6, mat: null };
  }


  /* Dutch buckets on a rack (or small pots on a drip bench): a drip header across the feed end with a line along each row and a stake in every pot,
     and a drain pipe under each row running to a collector at the return end */
  function buckets(it, g, kind) {
    const hw = it.w / 2, hh = it.h / 2, lift = H3.LIFT[kind], sp = Math.max(0.05, +it.spacing || 0.3), cols = Math.max(1, Math.floor((it.w + 1e-9) / sp)), rows = Math.max(1, Math.floor((it.h + 1e-9) / sp));
    const dutch = kind === 'dutch', bw = Math.min(0.26, sp * 0.82), bh = dutch ? 0.27 : 0.18, top = lift + bh, rowV = r => -((rows - 1) * sp) / 2 + r * sp, colU = k => -((cols - 1) * sp) / 2 + k * sp;
    if (dutch) {   // a low rack: two rails along each row's length
      for (let r = 0; r < Math.min(rows, 80); r++) bx(g, C.frame, it.w, 0.03, 0.035, 0, lift - 0.03, rowV(r));
    } else {       // a table
      const nx = cap(Math.ceil(it.w / 1.2) + 1);
      for (let i = 0; i < nx; i++) { const u = -hw + 0.04 + (it.w - 0.08) * i / (nx - 1); for (const q of [-1, 1]) bx(g, C.frame, 0.04, lift - 0.03, 0.04, u, 0, q * (hh - 0.03)); }
      for (const q of [-1, 1]) bx(g, C.frame, it.w, 0.03, 0.035, 0, lift - 0.06, q * (hh - 0.03));
      bx(g, C.white, it.w, 0.012, it.h, 0, lift - 0.03, 0); for (const q of [-1, 1]) { bx(g, C.white, it.w, 0.04, 0.012, 0, lift - 0.03, q * (hh - 0.006)); bx(g, C.white, 0.012, 0.04, it.h, q * (hw - 0.006), lift - 0.03, 0); }
    }
    const hy = lift + bh + 0.22;   // the drip line's height over the pots
    const gb = takeGrid(Math.min(rows, 80), cols);
    for (let r = 0; r < gb.R; r++) {
      const v = rowV(r);
      if (dutch) cylU(g, C.white, 0.02, it.w, 0, lift + 0.06, v);   // the drain pipe under the row
      cylU(g, C.pipe, 0.006, it.w + 0.05, 0, hy, v);                  // the drip line
      for (let k = 0; k < gb.K; k++) {
        const u = colU(k);
        if (dutch) { add(g, UPOT, C.pot, bw / 2, bh, bw / 2, u, lift + bh / 2 + 0.01, v); add(g, UC, C.pot, bw / 2 * 1.04, 0.015, bw / 2 * 1.04, u, top - 0.003, v); cyl(g, C.white, 0.02, 0.05, u, lift + 0.02, v); }
        else { add(g, UPOT, C.pot, bw / 2, bh, bw / 2, u, lift - 0.02 + bh / 2, v); add(g, UC, C.pot, bw / 2 * 1.04, 0.012, bw / 2 * 1.04, u, lift - 0.02 + bh - 0.003, v); }
        add(g, UC, C.media, bw / 2 * 0.86, 0.004, bw / 2 * 0.86, u, (dutch ? top : lift - 0.02 + bh) + 0.006, v);
        cyl(g, C.pipe, 0.0035, hy - (dutch ? top : lift - 0.02 + bh) - 0.01, u + bw * 0.25, (dutch ? top : lift - 0.02 + bh) + 0.01, v);   // the drip stake
      }
    }
    const feedY = lift + (dutch ? 0.52 : 0.42), retY = dutch ? lift + 0.06 : lift - 0.02;
    cylV(g, C.pipe, 0.016, it.h + 0.1, -hw - 0.03, feedY, 0);                        // the feed header across the end
    for (let r = 0; r < gb.R; r++) { const v = rowV(r), u1 = colU(0) - 0.1; cylU(g, C.pipe, 0.008, u1 + hw + 0.03, (u1 - hw - 0.03) / 2, feedY, v); if (hy > feedY) cyl(g, C.pipe, 0.008, hy - feedY, u1, feedY, v); }
    for (const q of [-1, 1]) ball(g, C.white, 0.03, hw + 0.04, retY, q * (hh + 0.05));
    cylV(g, C.white, 0.03, it.h + 0.1, hw + 0.04, retY, 0);                          // the return collector
    return { surf: () => (dutch ? top : lift - 0.02 + bh) + 0.012, lab: hy + 0.5 };
  }
  const dutch = (it, g) => buckets(it, g, 'dutch'), drip = (it, g) => buckets(it, g, 'drip');

  /* a vertical tower: a base tank, a tall white column with plant pockets spiralling up it, a distributor cap on top */
  function tower(it, g) {
    const r = Math.min(it.w, it.h) / 2 * 0.72, Ht = 1.5, n = Math.min(H3.siteLayout(it).count, 120), gr = growth(it), f = gr ? Math.max(0.15, gr.f) : 0;
    cyl(g, C.tub, Math.min(it.w, it.h) / 2, 0.14, 0, 0, 0); cyl(g, C.lid, Math.min(it.w, it.h) / 2 * 1.03, 0.012, 0, 0.14, 0);
    cyl(g, C.white, r, Ht, 0, 0.152, 0); cyl(g, C.pale, r * 1.12, 0.03, 0, 0.152 + Ht, 0); cyl(g, C.pipe, 0.015, 0.12, 0, 0.152 + Ht + 0.03, 0);
    const per = 4, rowsN = Math.ceil(n / per), gap = (Ht - 0.25) / Math.max(1, rowsN);
    for (let i = 0; i < n; i++) {
      const a = (i % per) * Math.PI / 2 + Math.floor(i / per) * (Math.PI / 4), y = 0.152 + 0.18 + Math.floor(i / per) * gap, ux = Math.cos(a), vz = Math.sin(a);
      add(g, UPOT, C.pot, 0.03, 0.05, 0.03, ux * (r + 0.012), y, vz * (r + 0.012), [vz * 0.9, 0, -ux * 0.9]);   // a pocket angled out of the column
      if (f) { const sz = 0.03 + 0.07 * f; ball(g, gr.st === 'late' ? '#9bb84a' : '#5aa14a', sz, ux * (r + 0.05 + sz * 0.5), y + 0.03 + sz * 0.5, vz * (r + 0.05 + sz * 0.5)); }
    }
    return { surf: () => 0, lab: 0.152 + Ht + 0.55, noPlants: true };
  }

  /* wick pots: a low tub with a lid, a grid of pots of media on it, and a cord wick running down from each into the solution */
  function wick(it, g) {
    const hw = it.w / 2, hh = it.h / 2, lift = H3.LIFT.wick, sp = Math.max(0.05, +it.spacing || 0.2), top = lift + 0.18;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, C.frame, 0.04, lift - 0.03, 0.04, sx * (hw - 0.03), 0, sz * (hh - 0.03));
    bx(g, C.frame, it.w, 0.03, it.h, 0, lift - 0.03, 0);
    bx(g, C.tub, it.w, 0.18, it.h, 0, lift, 0); bx(g, C.lid, it.w + 0.01, 0.012, it.h + 0.01, 0, top, 0);
    const cols = Math.max(1, Math.floor((it.w + 1e-9) / sp)), rows = Math.max(1, Math.floor((it.h + 1e-9) / sp)), s0 = Math.min(0.14, sp * 0.8);
    const gb = takeGrid(rows, cols);
    for (let r = 0; r < gb.R; r++) for (let k = 0; k < gb.K; k++) {
      const u = -((cols - 1) * sp) / 2 + k * sp, v = -((rows - 1) * sp) / 2 + r * sp;
      add(g, UPOT, C.pot, s0 / 2, 0.11, s0 / 2, u, top + 0.012 + 0.055, v); add(g, UC, C.media, s0 / 2 * 0.86, 0.004, s0 / 2 * 0.86, u, top + 0.012 + 0.11, v); bx(g, '#e9dfc8', 0.006, 0.05, 0.006, u + s0 / 2 + 0.004, top - 0.04, v);
    }
    return { surf: () => top + 0.012 + 0.115, lab: top + 0.55 };
  }

  /* a media bed: a deep tray of clay pebbles on a stand, a bell siphon in one corner and a fill pipe */
  function media(it, g) {
    const hw = it.w / 2, hh = it.h / 2, lift = H3.LIFT.media, dep = 0.26, top = lift + dep;
    const nx = cap(Math.ceil(it.w / 1.2) + 1);
    for (let i = 0; i < nx; i++) { const u = -hw + 0.04 + (it.w - 0.08) * i / (nx - 1); for (const q of [-1, 1]) bx(g, C.frame, 0.04, lift - 0.03, 0.04, u, 0, q * (hh - 0.03)); }
    for (const q of [-1, 1]) bx(g, C.frame, it.w, 0.03, 0.035, 0, lift - 0.06, q * (hh - 0.03));
    bx(g, C.white, it.w, 0.012, it.h, 0, lift - 0.03, 0);
    for (const q of [-1, 1]) { bx(g, C.white, it.w, dep + 0.03, 0.014, 0, lift - 0.03, q * (hh - 0.007)); bx(g, C.white, 0.014, dep + 0.03, it.h, q * (hw - 0.007), lift - 0.03, 0); }
    bx(g, C.media, it.w - 0.03, dep - 0.03, it.h - 0.03, 0, lift - 0.015, 0);                       // the clay pebbles
    cyl(g, C.white, 0.018, dep + 0.06, hw - 0.07, lift - 0.03, hh - 0.07); cyl(g, C.pale, 0.05, dep + 0.02, hw - 0.07, lift + 0.01, hh - 0.07);   // the bell siphon and its cover
    cyl(g, C.pipe, 0.008, dep - 0.04, -hw + 0.07, lift + 0.01, -hh + 0.07);                           // the fill pipe's outlet
    return { surf: () => top - 0.02, lab: top + 0.55, bedPlants: true };
  }

  /* ---------- gear ---------- */
  const gearHeights = it => (IND.EQUIP[it.item] || IND.EQUIP.led_bar).hgt;
  /* draws one piece of equipment; returns false when this item has no model (the caller then draws its plain box) */
  function gear(it, y) {
    const k = it.item, w = it.w, d = it.h, H = Math.max(0.01, gearHeights(it));
    switch (k) {
      case 'reservoir50': case 'reservoir100': {
        const g = grp(it, y);
        bx(g, C.tub, w, H - 0.03, d, 0, 0, 0); bx(g, C.lid, w + 0.02, 0.03, d + 0.02, 0, H - 0.03, 0);
        bx(g, '#1c2024', 0.12, 0.012, 0.08, w * 0.2, H, 0); cyl(g, C.grey, 0.02, 0.04, -w * 0.25, H, d * 0.2);
        for (const s of [-1, 1]) bx(g, C.lid, 0.06, 0.02, 0.012, 0, H - 0.1, s * (d / 2 + 0.006));
        bx(g, '#a9c9dc', 0.014, H * 0.6, 0.012, w / 2 + 0.007, 0.04, d * 0.3);
        return true;
      }
      case 'bucket': {
        const g = grp(it, y), r = Math.min(w, d) / 2;
        add(g, new THREE.CylinderGeometry(1, 0.82, 1, 20), '#4a5a66', r, H, r, 0, H / 2, 0); cyl(g, C.lid, r * 1.03, 0.02, 0, H, 0);
        add(g, UB, C.metal, r * 2, 0.006, 0.01, 0, H + 0.1, 0); add(g, UB, C.metal, 0.01, 0.1, 0.01, r, H + 0.05, 0); add(g, UB, C.metal, 0.01, 0.1, 0.01, -r, H + 0.05, 0);
        return true;
      }
      case 'water_pump': {
        const g = grp(it, y);
        bx(g, '#1d2327', w * 0.85, H * 0.8, d * 0.9, 0, 0.005, 0); bx(g, C.metal, w * 0.5, H * 0.3, 0.004, 0, 0.012, d * 0.45 + 0.002);
        cyl(g, C.pipe, 0.011, H * 0.45, w * 0.2, H * 0.8, 0); cylU(g, C.pipe, 0.01, 0.04, w * 0.45, H * 0.55, 0);
        for (const s of [-1, 1]) bx(g, '#101316', 0.02, 0.006, d * 0.9, s * w * 0.35, 0, 0);
        return true;
      }
      case 'air_pump': {
        const g = grp(it, y);
        bx(g, '#2a3036', w, H * 0.8, d, 0, 0.008, 0); for (let i = -2; i <= 2; i++) bx(g, '#1d2227', w * 0.9, 0.004, 0.006, 0, H * 0.8 + 0.008, i * d * 0.15);
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) bx(g, '#101316', 0.02, 0.008, 0.02, sx * w * 0.38, 0, sz * d * 0.38);
        cylU(g, C.grey, 0.006, 0.04, w / 2 + 0.015, H * 0.5, 0);
        return true;
      }
      case 'timer': {
        const g = grp(it, y);
        bx(g, C.white, w, H, d, 0, 0, 0); add(g, UC, '#9aa3a8', 0.022, 0.006, 0.022, 0, H + 0.002, 0); bx(g, C.dark, 0.012, 0.014, 0.004, 0, H + 0.003, 0.006);
        for (const s of [-1, 1]) bx(g, C.metal, 0.006, 0.012, 0.002, s * w * 0.16, 0.02, d / 2 + 0.001);
        return true;
      }
      case 'power_board': {
        const g = grp(it, y); const n = Math.max(2, Math.min(8, Math.round(w / 0.07)));
        bx(g, C.white, w, H, d, 0, 0, 0); for (let i = 0; i < n; i++) { const u = -w / 2 + (i + 0.5) * w / n; bx(g, C.dark, Math.min(0.04, w / n * 0.7), 0.003, d * 0.5, u, H, 0); }
        bx(g, '#c24a3a', 0.012, 0.006, 0.012, -w / 2 + 0.02, H, d * 0.3);
        return true;
      }
      case 'inline_fan': {
        const g = grp(it, y), r = Math.min(d, H) / 2;
        cylU(g, '#4a5258', r * 0.92, w * 0.86, 0, H / 2, 0); for (const s of [-1, 1]) { cylU(g, C.metal, r, 0.012, s * w * 0.46, H / 2, 0); cylU(g, C.metal, r * 0.78, 0.035, s * (w / 2 + 0.005), H / 2, 0); }
        bx(g, '#2f363b', w * 0.35, 0.04, 0.05, 0, H / 2 + r * 0.8, 0);
        for (const s of [-1, 1]) bx(g, C.metal, 0.02, H / 2 - r * 0.2, 0.012, s * w * 0.3, 0, 0);
        return true;
      }
      case 'carbon_filter': {
        const g = grp(it, y), r = Math.min(w, d) / 2;
        cyl(g, '#1f2326', r, H, 0, 0, 0); cyl(g, C.metal, r * 1.05, 0.02, 0, 0, 0); cyl(g, C.metal, r * 1.05, 0.02, 0, H - 0.02, 0); cyl(g, C.metal, r * 0.6, 0.015, 0, H, 0);
        cyl(g, C.grey, r * 1.01, 0.01, 0, H * 0.5, 0);
        return true;
      }
      case 'clip_fan': {
        const g = grp(it, y), r = Math.min(H * 0.42, 0.1);
        bx(g, C.pot, w * 0.5, 0.025, d * 0.8, 0, 0, 0); bx(g, C.pot, 0.02, H * 0.55, 0.02, 0, 0.02, 0);
        add(g, UC, '#3b4349', r, 0.035, r, 0, H * 0.62, 0, [Math.PI / 2, 0, 0]); add(g, UC, C.metal, r * 1.02, 0.006, r * 1.02, 0, H * 0.62, d * 0.2, [Math.PI / 2, 0, 0]);
        return true;
      }
      case 'humidifier': {
        const g = grp(it, y), r = Math.min(w, d) / 2;
        cyl(g, C.white, r, H * 0.62, 0, 0, 0); cyl(g, '#bfe0ee', r * 0.92, H * 0.3, 0, H * 0.62, 0); cyl(g, C.grey, 0.02, H * 0.15, 0, H * 0.92, 0);
        return true;
      }
      case 'led_panel': case 'led_panel_s': {
        const g = grp(it, y);
        bx(g, '#2d3338', w, 0.03, d, 0, 0.01, 0); bx(g, '#fffbe0', w * 0.94, 0.004, d * 0.94, 0, 0.008, 0);
        for (let i = -3; i <= 3; i++) bx(g, C.metal, w * 0.9, 0.025, 0.006, 0, 0.04, i * d * 0.12);
        return true;
      }
      case 'led_bar': case 't5_fixture': case 'led_strip': {
        const g = grp(it, y);
        bx(g, '#2d3338', w, Math.max(0.012, H * 0.7), Math.max(0.02, d), 0, 0.006, 0); bx(g, '#fffbe0', w * 0.96, 0.004, Math.max(0.012, d * 0.7), 0, 0.004, 0);
        for (const s of [-1, 1]) bx(g, C.pot, 0.006, 0.12, 0.006, s * (w / 2 - 0.03), 0.02, 0);
        return true;
      }
      default: return false;
    }
  }

  /* ---------- pipes and cables ---------- */
  /* Draw one link as round tubes lying on the floor with square bends, joined to a fitting at each end.  pts come from hydro3d.routeLink. */
  function pipe(medium, pts, r) {
    const col = LINK_COL[medium] || LINK_COL.water;
    for (let i = 1; i < pts.length; i++) tube(pts[i - 1], pts[i], r, col);
    for (let i = 1; i < pts.length - 1; i++) jointBall(pts[i], r * 1.02, col);
    for (const [p, q] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {   // a fitting collar at each end, a little wider than the tube
      const d = V3(q[0] - p[0], q[1] - p[1], q[2] - p[2]); if (d.length() < 1e-4) continue; d.normalize().multiplyScalar(Math.min(0.03, d.length() * 0.5));
      tube(p, [p[0] + d.x, p[1] + d.y, p[2] + d.z], r * 1.55, medium === 'water' ? '#d7dcdf' : '#3a4147');
    }
  }

  /* ---------- a hydro system ---------- */
  const BUILD = { nft, dwc, kratky, ebb, dutch, drip, tower, wick, media };
  /* Draws the system; returns what the view needs to plant it:
     { surf(x, z) -> y of the plant bases there (plan coordinates), box: [x0, z0, x1, z1], job: { species?, f, lay } or mat }.  `species` is chosen by the caller (it knows which plant shapes exist). */
  function hydro(it, base) {
    const g = grp(it, base), fn = BUILD[it.type] || kratky, res = fn(it, g), gr = growth(it);
    it.__lab = base + res.lab;
    const lay = H3.siteLayout(it);
    const xs = H3.footprint(it, 0.05).map(p => p[0]), zs = H3.footprint(it, 0.05).map(p => p[1]);
    return { it, base, surfLocal: res.surf, noPlants: !!res.noPlants, gr, lay, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] };
  }
  /* a dense mat of microgreens (or anything with no plant shape) rising over the sites */
  function mat(h, color) {
    const it = h.it; if (!h.gr) return;
    const ch = Math.max(0.01, 0.1 * h.gr.f), g = grp(it, h.base), hh = it.h / 2;
    if (it.type === 'nft') { const n = Math.max(1, Math.round(+it.channels || 1)), nD = Math.min(n, 60), pitch = it.h / n, wd = Math.max(0.03, Math.min(0.1, pitch * 0.6)); for (let c = 0; c < nD; c++) bx(g, color, it.w - 0.04, ch, wd * 0.8, 0, h.surfLocal(0, 0), -hh + pitch * (c + 0.5)); }
    else bx(g, color, Math.max(0.05, it.w - 0.1), ch, Math.max(0.05, it.h - 0.1), 0, h.surfLocal(0, 0), 0);
  }

  return { hydro, mat, gear, pipe, growth, gearHeights, pot };
}
