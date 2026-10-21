/* LT-Planner 3D view (beta, staff only for now).  Own code, MIT.  Loaded only when the button is pressed, so the planner itself stays light.
   Shows the plan from above or at an angle: the ground (from ground heights if the plan has them), beds, paths, fences, tanks, benches,
   block copies, single plants and crop rows.  Only what the camera can see is drawn (plants/field.js); the Quality setting
   (Low, Medium, High, Ultra) is remembered on this device.  The view is a snapshot: close and open it again after changing the plan. */
import { el, icon } from '../kit/core.js';

export async function open3D({ plan, M, TR, date, ex = 1 }) {
  const THREE = await import('./plants/vendor/three.module.js');
  const { PRESETS, stats: geoStats } = await import('./plants/plants.js');
  const F = await import('./plants/field.js');
  const { FieldView } = await import('./plants/fieldview.js');
  const site = plan.site, g = site.ground ? TR.unpackGrid(site.ground) : null, base = g ? TR.range(g).min : 0;
  ex = [1, 2, 3, 5].includes(+ex) ? +ex : 1;   // heights can be stretched to make gentle slopes easier to see (the ground only; everything still sits on it)
  const ground = g ? (x, z) => (TR.heightAt(g, x, z) - base) * ex : () => 0;

  /* ---- page ---- */
  const cv = el('canvas', { class: 'v3-canvas', 'aria-label': '3D view of the plan' }), info = el('span', { class: 'small muted', role: 'status' });
  const qSel = el('select', { 'aria-label': 'Quality' }, [['low', 'Low (tablet)'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra (gaming PC)']].map(([v, l]) => el('option', { value: v, text: l })));
  qSel.value = F.getQuality();
  const camSel = el('select', { 'aria-label': 'Camera' }, [['top', 'Overhead'], ['tilt', 'Angled']].map(([v, l]) => el('option', { value: v, text: l })));
  const dragSel = el('select', { 'aria-label': 'What dragging does' }, [['move', 'Drag moves'], ['turn', 'Drag turns']].map(([v, l]) => el('option', { value: v, text: l })));
  const hourIn = el('input', { type: 'range', min: 6, max: 19, step: 0.5, value: 14, 'aria-label': 'Time of day' });
  const exSel = el('select', { 'aria-label': 'Height stretch' }, [1, 2, 3, 5].map(v => el('option', { value: String(v), text: v === 1 ? 'True heights' : 'Heights ×' + v }))); exSel.value = String(ex); exSel.hidden = !g;
  const closeB = el('button', { type: 'button', class: 'btn sm', text: 'Close' });
  const bar = el('div', { class: 'v3-bar' }, [el('b', { text: '3D view (beta)' }), closeB, el('label', { class: 'small' }, ['Quality ', qSel]), el('label', { class: 'small' }, ['Camera ', camSel]), exSel, dragSel, el('label', { class: 'small' }, ['Sun ', hourIn]), info]);
  const wrap = el('div', { class: 'v3-wrap', role: 'dialog', 'aria-label': '3D view' }, [bar, cv]);
  document.body.append(wrap);

  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  const scene = new THREE.Scene(); scene.background = new THREE.Color('#9fb7c9');
  const sun = new THREE.DirectionalLight('#fff3dc', 2.2); scene.add(sun, new THREE.HemisphereLight('#cfe8ff', '#5a4a34', 0.7));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
  const mats = new Map(), flat = c => { let m = mats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }); mats.set(c, m); } return m; };   // one material per colour, freed on close

  /* ---- ground ---- */
  const gy = (x, z) => ground(Math.min(site.w, Math.max(0, x)), Math.min(site.h, Math.max(0, z)));
  { const step = Math.max(g ? g.cell : 1, Math.max(site.w, site.h) / 200), nx = Math.max(2, Math.ceil(site.w / step) + 1), nz = Math.max(2, Math.ceil(site.h / step) + 1), pos = [], col = [], idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = Math.min(site.w, i * step), z = Math.min(site.h, j * step), y = gy(x, z); pos.push(x, y, z);
      const s = g ? TR.slopeAt(g, x, z).pct : 0, t = Math.min(1, s / 60), c = new THREE.Color('#6f8f45').lerp(new THREE.Color('#8a6d3b'), t * 0.55); col.push(c.r, c.g, c.b); }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, mat)); }

  /* ---- everything that is not a plant: simple solids, drawn once ---- */
  const solids = new THREE.Group(); scene.add(solids);
  const flatten = (items, out = []) => { for (const it of items) { if (it.off || it.hidden) continue; if (it.kind === 'block') flatten(M.blockItems(plan, it), out); else out.push(it); } return out; };
  const all = flatten(plan.items);
  const box = (w, h, d, c, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), flat(c)); m.position.set(x, y + h / 2, z); m.rotation.y = ry; solids.add(m); return m; };
  // a straight run is cut into short pieces so it follows the ground up and down a slope
  const seg = (a, b, w, h, c, lift = 0) => { const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < 0.01) return; const n = Math.min(200, Math.max(1, Math.ceil(len / 1.5)));
    for (let i = 0; i < n; i++) { const x0 = a[0] + dx * i / n, z0 = a[1] + dz * i / n, x1 = a[0] + dx * (i + 1) / n, z1 = a[1] + dz * (i + 1) / n, y0 = gy(x0, z0), y1 = gy(x1, z1);
      const dir = new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0), m = new THREE.Mesh(new THREE.BoxGeometry(dir.length() * 1.02, h, w), flat(c));
      m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.normalize()); m.position.set((x0 + x1) / 2, (y0 + y1) / 2 + lift + h / 2, (z0 + z1) / 2); solids.add(m); } };
  for (const it of all) {
    if (it.kind === 'bed') box(it.w, Math.max(0.05, it.raised || 0.05), it.h, '#8a5a35', it.x, gy(it.x, it.y), it.y, -it.rot * Math.PI / 180);
    else if (it.kind === 'area') box(it.w, 0.03, it.h, it.fill || '#C9DDB8', it.x, gy(it.x, it.y) + 0.01, it.y, -it.rot * Math.PI / 180);
    else if (it.kind === 'bench') box(it.w, 0.9, it.h, '#b9a27f', it.x, gy(it.x, it.y), it.y, -it.rot * Math.PI / 180);
    else if (it.kind === 'tank') { const m = new THREE.Mesh(new THREE.CylinderGeometry(it.w / 2, it.w / 2, 1.6, 20), flat('#7FB3DA')); m.position.set(it.x, gy(it.x, it.y) + 0.8, it.y); solids.add(m); }
    else if (it.kind === 'path') it.pts.slice(1).forEach((p, i) => seg(it.pts[i], p, it.width, 0.04, '#CBBFA8', 0.01));
    else if (it.kind === 'pipe') it.pts.slice(1).forEach((p, i) => seg(it.pts[i], p, 0.04, 0.04, '#2F7FC1', 0.03));
    else if (it.kind === 'fence') { it.pts.slice(1).forEach((p, i) => seg(it.pts[i], p, 0.05, it.height, '#8a6b4a', 0)); it.pts.forEach((p, i) => { box(0.1, it.height + 0.1, 0.1, '#5B4632', p[0], gy(p[0], p[1]), p[1]); const q = it.pts[i + 1]; if (!q) return; const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.min(200, Math.floor(L / 2.5)); for (let k = 1; k < n; k++) { const x = p[0] + (q[0] - p[0]) * k / n, z = p[1] + (q[1] - p[1]) * k / n; box(0.08, it.height + 0.05, 0.08, '#5B4632', x, gy(x, z), z); } }); }
  }

  /* ---- plants: single plants and crop rows, as rules for the field drawer ---- */
  const rules = M.fieldRules(plan, date), singles = [];
  for (const it of all) if (it.kind === 'plant') { const gr = M.growth(it, date); if (gr !== null) singles.push([it, gr, M.presetFor(it.crop)]); }
  const used = new Set([...rules.map(q => q.species), ...singles.map(s => s[2])]);
  const specs = Object.fromEntries([...used].map(k => [k, PRESETS[k]]));
  const fv = new FieldView(scene, mat, specs); fv.shadows = false; fv.setDetail(1, qSel.value);
  const real = k => fv.size(k);   // measured from the drawn plant, so a 3 m tree is drawn 3 m wide
  const blocks = [];
  for (const q of rules) { const e = real(q.species), want = ((M.CROPS[q.crop] || M.CROPS.other)[3]) || e.h; blocks.push({ ...q, scale: Math.max(0.05, (want / e.h) * (0.2 + 0.8 * Math.min(1, Math.max(0.15, q.stage)))) }); }
  for (const [it, gr, k] of singles) { const e = real(k);
    blocks.push({ id: it.id, species: k, x: it.x, z: it.y, rows: 1, cols: 1, rowSpacing: 1, plantSpacing: 1, seed: 7, sizeVar: 0, scale: Math.max(0.05, (it.spread / (2 * e.r)) * (0.25 + 0.75 * gr)) }); }
  const sp = {}; for (const k of used) { const e = real(k); sp[k] = { h: e.h, r: e.r, tris: [0, 1, 2].map(L => Math.round(geoStats(fv.geometry(k, L)).tris)).concat([8]) }; }
  const field = new F.PlantField({ quality: qSel.value, species: sp, blocks }); field.setGround(gy);

  /* ---- camera ---- */
  const asp = (cv.clientWidth / cv.clientHeight) || 1.5;   // fit the whole site on a tall phone screen too
  const st = { cx: site.w / 2, cz: site.h / 2, half: Math.max(site.h / 2, site.w / 2 / asp) * 1.12 + 1, yaw: 0.6, pitch: 0.7, dist: Math.max(site.w, site.h) * 1.2 };
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 5000), persp = new THREE.PerspectiveCamera(50, 1, 0.2, 6000);
  let raf = 0, dirty = true, cam = ortho; const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function frame() {
    raf = 0; if (!dirty) return; dirty = false;
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) { schedule(); return; }
    r.setSize(w, h, false); const a = w / h, top = camSel.value === 'top'; let view;
    const cy = gy(st.cx, st.cz);
    if (top) { cam = ortho; ortho.left = -st.half * a; ortho.right = st.half * a; ortho.top = st.half; ortho.bottom = -st.half; ortho.position.set(st.cx, cy + 2000, st.cz + 0.001); ortho.up.set(0, 0, -1); ortho.lookAt(st.cx, cy, st.cz); ortho.updateProjectionMatrix(); view = F.orthoView({ cx: st.cx, cz: st.cz, halfH: st.half, aspect: a, heightPx: h }); }
    else { cam = persp; persp.aspect = a; const ex = st.cx + Math.sin(st.yaw) * Math.cos(st.pitch) * st.dist, ez = st.cz + Math.cos(st.yaw) * Math.cos(st.pitch) * st.dist, ey = cy + Math.sin(st.pitch) * st.dist; persp.position.set(ex, Math.max(ey, gy(ex, ez) + 1.5), ez); persp.up.set(0, 1, 0); persp.lookAt(st.cx, cy, st.cz); persp.updateProjectionMatrix();
      view = F.perspView({ eye: [persp.position.x, persp.position.y, persp.position.z], target: [st.cx, cy, st.cz], fovDeg: 50, aspect: a, heightPx: h, maxDist: Math.max(300, st.dist * 4) }); }
    // sun from date, time and latitude (model.js)
    const hour = +hourIn.value, s = M.sunAt(date, hour, site.lat), az = (s.az - (site.north || 0)) * Math.PI / 180, el_ = Math.max(8, s.el) * Math.PI / 180;
    sun.position.set(Math.sin(az) * Math.cos(el_) * 200 + st.cx, Math.sin(el_) * 200, -Math.cos(az) * Math.cos(el_) * 200 + st.cz); sun.target.position.set(st.cx, 0, st.cz); scene.add(sun.target);
    const sel = field.select(view); fv.apply(sel); r.render(scene, cam);
    const t = sel.stats; info.textContent = field.count().toLocaleString() + ' plants · drawn ' + t.drawn.toLocaleString() + ' (' + t.full + ' full, ' + t.reduced + ' reduced, ' + t.proxy + ' simple, ' + t.marker + ' flat) · ' + Math.round(t.tris).toLocaleString() + ' triangles';
    window.__v3 = { stats: t, cam: camSel.value, rules: blocks.length, ground: !!g };
  }
  const schedule = () => { dirty = true; if (!raf) raf = requestAnimationFrame(frame); };
  /* ---- controls: drag to move, wheel or pinch to zoom, angled view: drag to turn (two fingers or right button to move) ---- */
  const ptrs = new Map(); let last = null, pinch = 0;
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); last = [e.clientX, e.clientY, e.button, e.shiftKey]; if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = Math.hypot(a[0] - b[0], a[1] - b[1]); } });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (pinch) zoom(pinch / d); pinch = d; return; }
    const dx = e.clientX - last[0], dy = e.clientY - last[1]; last = [e.clientX, e.clientY, last[2], last[3]];
    const top = camSel.value === 'top';
    if (!top && (dragSel.value === 'turn' || last[2] === 2)) { st.yaw -= dx * 0.006; st.pitch = clamp(st.pitch + dy * 0.005, 0.12, 1.45); }
    else {   // grab the ground: it follows the finger
      const per = top ? (2 * st.half) / cv.clientHeight : st.dist * 0.0016, yw = top ? 0 : st.yaw, c = Math.cos(yw), s = Math.sin(yw);
      st.cx += -c * dx * per - s * dy * per; st.cz += s * dx * per - c * dy * per;
    }
    schedule();
  });
  const up = e => { ptrs.delete(e.pointerId); pinch = 0; const left = [...ptrs.values()][0]; if (left && last) last = [left[0], left[1], last[2], last[3]]; }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  const zoom = f => { st.half = clamp(st.half * f, 1, 600); st.dist = clamp(st.dist * f, 2, 1500); schedule(); };
  cv.addEventListener('wheel', e => { e.preventDefault(); const f = Math.exp(e.deltaY * 0.001), b = cv.getBoundingClientRect();
    if (camSel.value === 'top' && b.height) { const k = (2 * st.half) / b.height, wx = (e.clientX - b.left - b.width / 2) * k, wz = (e.clientY - b.top - b.height / 2) * k, f2 = clamp(st.half * f, 1, 600) / st.half; st.cx += wx * (1 - f2); st.cz += wz * (1 - f2); }   // overhead: zoom toward the pointer
    zoom(f); }, { passive: false });
  qSel.addEventListener('change', () => { F.setQuality(qSel.value); field.setQuality(qSel.value); fv.setDetail(1, qSel.value); schedule(); });
  camSel.addEventListener('change', () => { dragSel.hidden = camSel.value === 'top'; schedule(); }); dragSel.hidden = true; cv.addEventListener('contextmenu', e => e.preventDefault()); hourIn.addEventListener('input', schedule); addEventListener('resize', schedule);
  const close = () => { cancelAnimationFrame(raf); removeEventListener('resize', schedule); document.removeEventListener('keydown', key, true); fv.dispose(); mats.forEach(m => m.dispose()); mat.dispose(); scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); r.dispose(); wrap.remove(); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true); closeB.addEventListener('click', close);
  exSel.addEventListener('change', () => { close(); open3D({ plan, M, TR, date, ex: +exSel.value }); });
  window.__v3close = close; schedule(); closeB.focus();
  return { close };
}
