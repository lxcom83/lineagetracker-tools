/* LT-Planner 3D view (beta, staff only for now).  Own code, MIT.  Loaded only when the button is pressed, so the planner itself stays light.
   Shows the plan in 3D: the ground (from ground heights if the plan has them), beds, paths, fences, tanks, benches, block copies,
   single plants and crop rows.  Only what the camera can see is drawn (plants/field.js); the Quality setting (Low, Medium, High, Ultra)
   is remembered on this device.  The view is a snapshot: close and open it again after changing the plan.

   Moving around works like Fusion 360 / SolidWorks:
     mouse   left drag = turn around the target, right or middle drag (or Shift + left) = move, wheel = zoom toward the pointer,
             double-click = move the target to that spot
     touch   one finger = turn, two fingers = move and pinch to zoom
     keys    arrows turn, + and - zoom, F fits the site, H goes home, T looks straight down
   A view cube in the bottom corner shows which way you are looking (compass faces, north from the plan): tap a face, edge or corner
   to swing round to it.  Home and Fit buttons sit beside it. */
import { el, icon } from '../kit/core.js';
import { openShare } from './share.js';

export async function open3D({ plan, M, TR, date, ex = 1, keepView = null, glow = [], find: findStart = '' }) {
  const THREE = await import('./plants/vendor/three.module.js');
  const { PRESETS, stats: geoStats, specFromJSON, specToJSON } = await import('./plants/plants.js');
  const F = await import('./plants/field.js');
  const { FieldView } = await import('./plants/fieldview.js');
  const SF = await import('./surfaces.js');
  const site = plan.site, g = site.ground ? TR.unpackGrid(site.ground) : null, base = g ? TR.range(g).min : 0;
  ex = [1, 2, 3, 5].includes(+ex) ? +ex : 1;   // heights can be stretched to make gentle slopes easier to see (the ground only; everything still sits on it)
  const ground = g ? (x, z) => (TR.heightAt(g, x, z) - base) * ex : () => 0;
  const D2R = Math.PI / 180, clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ---- page ---- */
  const cv = el('canvas', { class: 'v3-canvas', 'aria-label': '3D view of the plan. Drag to turn, right-drag or two fingers to move, wheel or pinch to zoom.', tabindex: '0' }), info = el('span', { class: 'small muted', role: 'status' });
  const qSel = el('select', { 'aria-label': 'Quality' }, [['low', 'Low (tablet)'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra (gaming PC)']].map(([v, l]) => el('option', { value: v, text: l })));
  qSel.value = F.getQuality();
  const projSel = el('select', { 'aria-label': 'Projection' }, [['persp', 'Perspective'], ['ortho', 'Flat (no perspective)']].map(([v, l]) => el('option', { value: v, text: l })));
  const hourIn = el('input', { type: 'range', min: 6, max: 19, step: 0.5, value: 14, 'aria-label': 'Time of day' });
  const exSel = el('select', { 'aria-label': 'Slopes: exaggerate the ground heights to see gentle slopes', title: 'Gentle slopes are hard to see at real size. This stretches the ground heights only (beds, plants and fences keep their real size) so you can see which way the ground falls.' }, [1, 2, 3, 5].map(v => el('option', { value: String(v), text: v === 1 ? 'Real size' : 'Exaggerate ×' + v }))); exSel.value = String(ex);
  const exLbl = el('label', { class: 'small', hidden: !g }, ['Slopes ', exSel]);
  const closeB = el('button', { type: 'button', class: 'btn sm', text: 'Close' });
  let showLabels = true; try { showLabels = localStorage.getItem('ltplanner.labels3d') !== 'off'; } catch {}
  const labCb = el('input', { type: 'checkbox', checked: showLabels, 'aria-label': 'Show names on the plan' });
  const help = el('p', { class: 'small muted v3-help', text: 'Drag: turn · Right-drag or two fingers: move · Wheel or pinch: zoom · Double-click: centre there' });
  const shareB = el('button', { type: 'button', class: 'btn sm', title: 'Make a picture to share or save' }, [icon('image'), ' Share picture']);
  let panelOpen = window.innerWidth >= 900; try { const s = localStorage.getItem('ltplanner.v3panel'); if (s) panelOpen = s === 'open'; } catch {}
  const panelB = el('button', { type: 'button', class: 'icon-btn v3-pb', 'aria-label': 'Show or hide the side panel', 'aria-expanded': String(panelOpen), title: 'Side panel' }, [icon('menu')]);
  const bar = el('div', { class: 'v3-bar' }, [panelB, el('b', { text: '3D view (beta)' }), closeB, shareB]);
  // the side panel: find, what to show, the view controls
  const findIn = el('input', { type: 'search', class: 'v3-find', placeholder: 'Find a plant or variety…', 'aria-label': 'Find a plant or variety', autocomplete: 'off', maxlength: '60', value: findStart }), findMsg = el('p', { class: 'small muted', role: 'status' });
  const growCb = el('input', { type: 'checkbox', 'aria-label': 'Show what is growing in each bed' }), cntCb = el('input', { type: 'checkbox', 'aria-label': 'Show how many of each' });
  const sec = (t, kids) => el('section', { class: 'v3-sec' }, [el('h3', { text: t }), ...kids]);
  const side = el('aside', { class: 'v3-side', 'aria-label': 'View options', hidden: !panelOpen }, [
    sec('Find', [findIn, findMsg]),
    sec('Show', [el('label', { class: 'small v3-chk' }, [labCb, ' Names']), el('label', { class: 'small v3-chk' }, [growCb, ' What is growing in each bed']), el('label', { class: 'small v3-chk' }, [cntCb, ' How many of each'])]),
    sec('View', [el('label', { class: 'small' }, ['Quality ', qSel]), el('label', { class: 'small' }, ['Projection ', projSel]), exLbl, el('label', { class: 'small' }, ['Sun ', hourIn])]),
    info, help]);
  const homeB = el('button', { type: 'button', class: 'icon-btn v3-nb', title: 'Home view (H)', 'aria-label': 'Home view' }, [navIcon('home')]);
  const fitB = el('button', { type: 'button', class: 'icon-btn v3-nb', title: 'Fit the whole site (F)', 'aria-label': 'Fit the whole site' }, [icon('fit')]);
  const topB = el('button', { type: 'button', class: 'icon-btn v3-nb', title: 'Look straight down (T)', 'aria-label': 'Look straight down' }, [navIcon('top')]);
  const nav = el('div', { class: 'v3-nav' }, [homeB, fitB, topB]);
  const labelsEl = el('div', { class: 'v3-labels', 'aria-hidden': 'true', hidden: !showLabels });
  const stage = el('div', { class: 'v3-stage' }, [side, el('div', { class: 'v3-view' }, [cv, labelsEl, nav])]);
  const wrap = el('div', { class: 'v3-wrap', role: 'dialog', 'aria-label': '3D view' }, [bar, stage]);
  document.body.append(wrap);

  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true }); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.autoClear = false;
  const scene = new THREE.Scene();
  { const c = document.createElement('canvas'); c.width = 4; c.height = 256; const x = c.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, '#6f9fcf'); gr.addColorStop(0.55, '#a9c6de'); gr.addColorStop(1, '#dfe7e4'); x.fillStyle = gr; x.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }   // a soft sky: deeper blue above, hazy at the horizon
  scene.fog = new THREE.Fog('#d6e1e2', 200, 1200);   // distant things fade into the haze (set from the camera each frame)
  const sun = new THREE.DirectionalLight('#fff3dc', 2.2), sky = new THREE.HemisphereLight('#cfe8ff', '#5a4a34', 0.7); scene.add(sun, sky);
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.camera.near = 1; sun.shadow.camera.far = 1500;
  const shadowsFor = q => q === 'high' || q === 'ultra';   // soft shadows only where there is power to spare
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.85 });
  // surfaces drawn on the device (planner/surfaces.js): one texture and one material per kind, freed on close
  const texs = new Map(), surfMats = new Map();
  const tex = k => { let t = texs.get(k); if (!t) { t = new THREE.CanvasTexture(SF.make(k)); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texs.set(k, t); } return t; };
  const surf = k => { let m = surfMats.get(k); if (!m) { m = new THREE.MeshStandardMaterial({ map: tex(k), roughness: k === 'pavers' || k === 'decking' ? 0.8 : 0.97, side: THREE.DoubleSide }); surfMats.set(k, m); } return m; };
  const planarUV = (geo, metres) => { const P = geo.getAttribute('position'), uv = new Float32Array(P.count * 2); for (let i = 0; i < P.count; i++) { uv[i * 2] = P.getX(i) / metres; uv[i * 2 + 1] = P.getZ(i) / metres; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); return geo; };
  const scaleUV = (geo, su, sv) => { const U = geo.getAttribute('uv'); for (let i = 0; i < U.count; i++) U.setXY(i, U.getX(i) * su, U.getY(i) * sv); U.needsUpdate = true; return geo; };
  // a grey pattern tinted by a colour (roof sheets, painted pickets), or a see-through one (lattice, mesh): one material per pattern and colour
  const tinted = (k, c) => { const key = k + c; let m = surfMats.get(key); if (!m) { const cut = SF.SURFACES[k].cut; m = new THREE.MeshStandardMaterial({ map: tex(k), color: c, roughness: k === 'roof' ? 0.55 : 0.9, metalness: k === 'roof' ? 0.25 : 0, side: THREE.DoubleSide, alphaTest: cut ? 0.5 : 0, transparent: false }); surfMats.set(key, m); } return m; };
  const glassMat = new THREE.MeshStandardMaterial({ color: '#d8eef0', roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
  const mats = new Map(), flat = c => { let m = mats.get(c); if (!m) { m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, side: THREE.DoubleSide }); mats.set(c, m); } return m; };   // one material per colour, freed on close
  mats.set('#glass', glassMat);

  /* ---- ground ---- */
  const gy = (x, z) => ground(Math.min(site.w, Math.max(0, x)), Math.min(site.h, Math.max(0, z)));
  let groundMesh;
  const span = g ? TR.range(g).max - base : 0;
  // natural-looking speckle: two layers of smooth value noise (own code, no texture to download)
  const hash = (i, j) => { const h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); };
  const vnoise = (x, z) => { const i = Math.floor(x), j = Math.floor(z), fx = x - i, fz = z - j, u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz); return (hash(i, j) * (1 - u) + hash(i + 1, j) * u) * (1 - v) + (hash(i, j + 1) * (1 - u) + hash(i + 1, j + 1) * u) * v; };
  const speck = (x, z) => 0.65 * vnoise(x / 3.1, z / 3.1) + 0.35 * vnoise(x / 0.9, z / 0.9);
  { const step = Math.max(g ? g.cell : 1, Math.max(site.w, site.h) / 200), nx = Math.max(2, Math.ceil(site.w / step) + 1), nz = Math.max(2, Math.ceil(site.h / step) + 1), pos = [], col = [], idx = [];
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const x = Math.min(site.w, i * step), z = Math.min(site.h, j * step), y = gy(x, z); pos.push(x, y, z);
      const s = g ? TR.slopeAt(g, x, z).pct : 0, t = Math.min(1, s / 60), hgt = g && span > 0.05 ? (y / ex) / span : 0.5, nz_ = speck(x, z);
      const c = new THREE.Color('#6f8f45').lerp(new THREE.Color('#5d8240'), Math.max(0, 0.3 - hgt) * 2).lerp(new THREE.Color('#8d9a55'), Math.max(0, hgt - 0.75) * 2.4).lerp(new THREE.Color('#8a6d3b'), t * 0.55);
      c.offsetHSL((nz_ - 0.5) * 0.025, 0, (nz_ - 0.5) * 0.07 + 0.04); col.push(c.r, c.g, c.b); }
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) { const a = j * nx + i; idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    planarUV(geo, SF.SURFACES.detail.metres); groundMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: tex('detail'), roughness: 0.95, side: THREE.DoubleSide })); scene.add(groundMesh); }

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
  // ground heights under a turned box: the plan turns clockwise on screen, which is +rot about the plan's down-pointing y
  const local = (it, u, v) => { const a = (it.rot || 0) * D2R; return [it.x + u * Math.cos(a) - v * Math.sin(a), it.y + u * Math.sin(a) + v * Math.cos(a)]; };
  const under = it => { let lo = Infinity, hi = -Infinity; const nu = Math.max(2, Math.ceil(it.w / 0.4)), nv = Math.max(2, Math.ceil(it.h / 0.4));
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const [x, z] = local(it, (i / nu - 0.5) * it.w, (j / nv - 0.5) * it.h), y = gy(x, z); lo = Math.min(lo, y); hi = Math.max(hi, y); } return { lo, hi }; };
  const TIMBER = ['#9a6a3e', '#8f6136', '#a3734a'], SOIL = '#4b3626';
  // a raised bed: built level (the top is level even on a slope), sleeper boards stacked from the top down past the lowest ground,
  // corner posts, a capping rail and soil just below the top.  An in-ground bed gets a low timber edge that follows the ground.
  function bed(it) {
    const ry = -(it.rot || 0) * D2R, R = it.raised || 0, T = 0.05, u = under(it);
    if (it.shape === 'round') return roundBed(it, R, u, ry);
    if (R < 0.02) {
      const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => local(it, a * it.w / 2, b * it.h / 2));
      c.forEach((p, i) => seg(p, c[(i + 1) % 4], 0.04, 0.1, TIMBER[0], -0.03));
      drape(it, SOIL, 0.02, 0.06, 'soil'); return;
    }
    const top = u.hi + R, B = 0.2;   // sleeper height
    const sides = [[0, -it.h / 2 + T / 2, it.w, 0], [0, it.h / 2 - T / 2, it.w, 0], [-it.w / 2 + T / 2, 0, it.h - 2 * T, 1], [it.w / 2 - T / 2, 0, it.h - 2 * T, 1]];
    for (const [cu, cvv, len, turned] of sides) {
      const [x, z] = local(it, cu, cvv), ends = turned ? [local(it, cu, -len / 2), local(it, cu, len / 2)] : [local(it, -len / 2, cvv), local(it, len / 2, cvv)];
      const low = Math.min(gy(...ends[0]), gy(...ends[1]), gy(x, z)), n = Math.min(20, Math.max(1, Math.ceil((top - low + 0.05) / B)));
      for (let k = 0; k < n; k++) { const m = box(turned ? T : len, B * 0.97, turned ? len : T, TIMBER[k % 3], x, top - (k + 1) * B, z, ry); m.material = surf('timber'); scaleUV(m.geometry, len / 0.8, 1); m.userData.bed = it.id; }
    }
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [x, z] = local(it, a * (it.w / 2 - 0.04), b * (it.h / 2 - 0.04)), y0 = gy(x, z) - 0.1; box(0.09, top + 0.04 - y0, 0.09, '#6e4a2a', x, y0, z, ry); }
    // capping rail: a slightly wider board on top of each side
    box(it.w + 0.04, 0.025, 0.09, '#b07f50', ...xyz(local(it, 0, -it.h / 2 + 0.03), top), ry); box(it.w + 0.04, 0.025, 0.09, '#b07f50', ...xyz(local(it, 0, it.h / 2 - 0.03), top), ry);
    box(0.09, 0.025, it.h, '#b07f50', ...xyz(local(it, -it.w / 2 + 0.03, 0), top), ry); box(0.09, 0.025, it.h, '#b07f50', ...xyz(local(it, it.w / 2 - 0.03, 0), top), ry);
    { const sw = Math.max(0.05, it.w - 2 * T), sh = Math.max(0.05, it.h - 2 * T), m = box(sw, 0.03, sh, SOIL, it.x, top - 0.07, it.y, ry); m.material = surf('soil'); scaleUV(m.geometry, sw / 1.2, sh / 1.2); }
    it.__top = top - 0.04;   // plants in this bed stand on the soil
  }
  const xyz = ([x, z], y) => [x, y, z];
  const ellipse = (it, n, inset = 0) => Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return local(it, Math.cos(t) * (it.w / 2 - inset), Math.sin(t) * (it.h / 2 - inset)); });
  // a round bed: in the ground, a soil circle with a low edge; raised, a galvanised ring (the common round steel bed) reaching down past the lowest ground
  function roundBed(it, R, u, ry) {
    if (R < 0.02) { const c = ellipse(it, 36); c.forEach((p, i) => seg(p, c[(i + 1) % c.length], 0.04, 0.1, '#8d969a', -0.03)); drape(it, SOIL, 0.02, 0.06, 'soil'); return; }
    const top = u.hi + R, low = u.lo - 0.1, H = top - low, ring = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, H, 64, 1, true), tinted('roof', '#a7b0b3'));
    ring.scale.set(it.w / 2, 1, it.h / 2); ring.rotation.y = ry; ring.position.set(it.x, low + H / 2, it.y); scaleUV(ring.geometry, Math.PI * (it.w + it.h) / 2 / 0.76, 1); solids.add(ring);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.018, 6, 64), flat('#c3cacc')); lip.rotation.x = Math.PI / 2; const lg = new THREE.Group(); lg.add(lip); lg.scale.set(it.w / 2, 1, it.h / 2); lg.rotation.y = ry; lg.position.set(it.x, top, it.y); solids.add(lg);
    const soil = new THREE.Mesh(new THREE.CircleGeometry(1, 48), surf('soil')); soil.rotation.x = -Math.PI / 2; scaleUV(soil.geometry, it.w / 1.2, it.h / 1.2); const sg = new THREE.Group(); sg.add(soil); sg.scale.set(it.w / 2 - 0.02, 1, it.h / 2 - 0.02); sg.rotation.y = ry; sg.position.set(it.x, top - 0.06, it.y); solids.add(sg);
    it.__top = top - 0.06;
  }

  /* ---- structures: buildings, greenhouses, pergolas, trellis, retaining walls ---- */
  // a mesh from triangles given in the item's own frame (u along the width, v along the depth, y up from 'y0'), turned and placed on the plan
  function tris(it, y0, list, material, ry = -(it.rot || 0) * D2R) {
    const pos = []; for (const t of list) for (const [uu, yy, vv] of t) pos.push(uu, yy, vv);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.computeVertexNormals();
    if (material.map) { const P = geo.getAttribute('position'), N = geo.getAttribute('normal'), uv = new Float32Array(P.count * 2), m = 1;   // map each face across its own slope
      for (let i = 0; i < P.count; i++) { const nx = Math.abs(N.getX(i)), nz = Math.abs(N.getZ(i)); uv[i * 2] = (nz >= nx ? P.getX(i) : P.getZ(i)) / 0.76 * m; uv[i * 2 + 1] = (Math.hypot(nx >= nz ? P.getX(i) : P.getZ(i), P.getY(i))) / 0.76; } geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); }
    const mesh = new THREE.Mesh(geo, material); mesh.rotation.y = ry; mesh.position.set(it.x, y0, it.y); solids.add(mesh); return mesh;
  }
  const quad = (a, b, c, d) => [[a, b, c], [a, c, d]];
  // roof faces over a rectangle a (half length along the ridge) by b (half across), rising 'rise' at the ridge; 'along' says if the ridge runs along u
  function roofFaces(type, a, b, rise, o) {
    const A = a + o, B = b + o, k = rise / b, drop = o * k, f = [], g = [];   // f: roof sheets, g: gable ends (wall colour)
    if (type === 'gable') { f.push(...quad([-A, -drop, -B], [A, -drop, -B], [A, rise, 0], [-A, rise, 0]), ...quad([-A, -drop, B], [-A, rise, 0], [A, rise, 0], [A, -drop, B])); g.push([[-a, 0, -b], [-a, rise, 0], [-a, 0, b]], [[a, 0, -b], [a, 0, b], [a, rise, 0]]); }
    else if (type === 'hip') { const r = Math.max(0, a - b), R_ = r; f.push(...quad([-A, -drop, -B], [A, -drop, -B], [R_, rise, 0], [-R_, rise, 0]), ...quad([-A, -drop, B], [-R_, rise, 0], [R_, rise, 0], [A, -drop, B]), [[-A, -drop, -B], [-R_, rise, 0], [-A, -drop, B]], [[A, -drop, -B], [A, -drop, B], [R_, rise, 0]]); }
    else if (type === 'skillion') { const r2 = rise * 2, k2 = r2 / (2 * b); f.push(...quad([-A, -o * k2, -B], [A, -o * k2, -B], [A, r2 + o * k2, B], [-A, r2 + o * k2, B])); g.push([[-a, 0, -b], [-a, r2, b], [-a, 0, b]], [[a, 0, -b], [a, 0, b], [a, r2, b]], ...quad([-a, 0, b], [-a, r2, b], [a, r2, b], [a, 0, b])); }
    return { f, g };
  }
  // turn faces from ridge-along-u to the item's frame when the ridge runs along v
  const swapUV = list => list.map(t => t.map(([u, y, v]) => [v, y, u]));
  function building(it) {
    const ry = -(it.rot || 0) * D2R, u = under(it), floor = u.hi + 0.15, low = u.lo - 0.1, H = it.wallH, top = floor + H;
    const plinth = box(it.w + 0.04, floor - low, it.h + 0.04, '#9c968c', it.x, low, it.y, ry); plinth.userData.struct = it.id;
    box(it.w, H, it.h, it.wallColour, it.x, floor, it.y, ry);
    if (it.windows !== false && H >= 1.6) {   // windows along each wall and a door on the front (the side facing plan-down)
      const glass = '#3f5566', frameC = '#f2efe8', wh = Math.min(1.2, H - 1.1), wy = floor + Math.min(0.9, H - wh - 0.25);
      for (const [len, side, turned] of [[it.w, -1, 0], [it.w, 1, 0], [it.h, -1, 1], [it.h, 1, 1]]) {
        const n = Math.floor((len - 0.8) / 3); for (let i = 0; i < n; i++) { const t = (i + 0.5) / n - 0.5, door = side === 1 && !turned && i === Math.floor(n / 2) && H >= 2.1;
          const [x, z] = turned ? local(it, side * (it.w / 2 + 0.012), t * len) : local(it, t * len, side * (it.h / 2 + 0.012));
          const ww = door ? 0.9 : Math.min(1.5, len / n * 0.5), hh = door ? Math.min(2.05, H - 0.15) : wh, y = door ? floor : wy;
          box(turned ? 0.03 : ww + 0.1, hh + 0.1, turned ? ww + 0.1 : 0.03, frameC, x, y - 0.05, z, ry);
          const m = box(turned ? 0.04 : ww, hh, turned ? ww : 0.04, door ? '#6b4a32' : glass, x, y, z, ry); if (!door) m.material = flatGlass(); } }
    }
    const along = it.ridge === 'w' || (it.ridge === 'auto' && it.w >= it.h), a = (along ? it.w : it.h) / 2, b = (along ? it.h : it.w) / 2, o = 0.45;
    if (it.roof === 'flat') { box(it.w + 0.3, 0.18, it.h + 0.3, it.roofColour, it.x, top, it.y, ry); box(it.w + 0.3, 0.06, it.h + 0.3, '#d8d4cc', it.x, top + 0.18, it.y, ry); it.__lab = top + 0.6; return; }
    const rise = b * Math.tan(Math.max(1, it.pitch) * D2R) * 1, F_ = roofFaces(it.roof, a, b, rise, o);
    const sw = list => (along ? list : swapUV(list).map(t => [t[0], t[2], t[1]]));   // swapping axes flips the winding; put it back
    tris(it, top, sw(F_.f), tinted('roof', it.roofColour)); if (F_.g.length) tris(it, top, sw(F_.g), flat(it.wallColour));
    // fascia: a thin board round the eaves
    it.__lab = top + rise * (it.roof === 'skillion' ? 2 : 1) + 0.5;
  }
  let gm = null; const flatGlass = () => gm || (gm = new THREE.MeshStandardMaterial({ color: '#3f5566', roughness: 0.15, metalness: 0.4 }), mats.set('#window', gm), gm);
  function greenhouse(it) {
    const ry = -(it.rot || 0) * D2R, u = under(it), base = u.hi + 0.05, low = u.lo - 0.1, H = it.wallH, top = base + H, fc = it.frame;
    box(it.w + 0.1, base - low, it.h + 0.1, '#a19a8e', it.x, low, it.y, ry);   // a low base wall
    const along = it.w >= it.h, a = (along ? it.w : it.h) / 2, b = (along ? it.h : it.w) / 2, rise = b * Math.tan(30 * D2R);
    const L = (uu, vv) => (along ? local(it, uu, vv) : local(it, vv, uu)), bar = 0.04;
    // glass walls and roof
    const gl = []; gl.push(...quad([-a, 0, -b], [a, 0, -b], [a, H, -b], [-a, H, -b]), ...quad([-a, 0, b], [-a, H, b], [a, H, b], [a, 0, b]), ...quad([-a, 0, -b], [-a, H, -b], [-a, H, b], [-a, 0, b]), ...quad([a, 0, -b], [a, 0, b], [a, H, b], [a, H, -b]),
      [[-a, H, -b], [-a, H + rise, 0], [-a, H, b]], [[a, H, -b], [a, H, b], [a, H + rise, 0]], ...quad([-a, H, -b], [a, H, -b], [a, H + rise, 0], [-a, H + rise, 0]), ...quad([-a, H, b], [-a, H + rise, 0], [a, H + rise, 0], [a, H, b]));
    const gmesh = tris(it, base, along ? gl : swapUV(gl).map(t => [t[0], t[2], t[1]]), glassMat); gmesh.userData.glass = true; gmesh.renderOrder = 2;
    // frame: uprights every 0.6 m on the long sides with rafters to the ridge, corner posts, eaves rails, ridge
    const n = Math.max(1, Math.round(2 * a / 0.6));
    for (let i = 0; i <= n; i++) { const uu = -a + 2 * a * i / n; for (const sd of [-1, 1]) { const [x, z] = L(uu, sd * b); box(bar, H, bar, fc, x, base, z, ry); const [x2, z2] = L(uu, sd * b / 2), r_ = new THREE.Mesh(new THREE.BoxGeometry(bar, bar, Math.hypot(b, rise)), flat(fc)); const grp = new THREE.Group(); grp.add(r_); r_.rotation.x = sd * Math.atan2(rise, b); grp.rotation.y = ry + (along ? 0 : Math.PI / 2); grp.position.set(x2, top + rise / 2, z2); solids.add(grp); } }
    for (const sd of [-1, 1]) { const [x, z] = L(0, sd * b); box(along ? 2 * a : bar, bar, along ? bar : 2 * a, fc, x, top, z, ry); for (let k = 1; k < 4; k++) { const [px, pz] = L(sd * a, -b + 2 * b * k / 4); box(bar, H, bar, fc, px, base, pz, ry); } }
    { const [x, z] = L(0, 0); box(along ? 2 * a : bar * 1.5, bar * 1.5, along ? bar * 1.5 : 2 * a, fc, x, top + rise - 0.03, z, ry); }
    it.__lab = top + rise + 0.4; it.__top = base;   // plants and benches inside stand on the floor
  }
  function pergola(it) {
    const ry = -(it.rot || 0) * D2R, u = under(it), Ht = it.height, top = u.hi + Ht, c = it.colour, post = 0.1;
    const along = it.w >= it.h, a = (along ? it.w : it.h) / 2, b = (along ? it.h : it.w) / 2, L = (uu, vv) => (along ? local(it, uu, vv) : local(it, vv, uu));
    const n = Math.max(1, Math.ceil(2 * a / 3));
    for (let i = 0; i <= n; i++) for (const sd of [-1, 1]) { const [x, z] = L(-a + 0.08 + (2 * a - 0.16) * i / n, sd * (b - 0.08)), y0 = gy(x, z) - 0.05; box(post, top - y0, post, c, x, y0, z, ry); }
    for (const sd of [-1, 1]) { const [x, z] = L(0, sd * (b - 0.08)); box(along ? 2 * a + 0.3 : 0.07, 0.19, along ? 0.07 : 2 * a + 0.3, c, x, top - 0.19, z, ry); }
    const nr = Math.max(2, Math.round(2 * a / 0.5)); for (let i = 0; i <= nr; i++) { const [x, z] = L(-a + 2 * a * i / nr, 0); box(along ? 0.05 : 2 * b + 0.3, 0.14, along ? 2 * b + 0.3 : 0.05, c, x, top, z, ry); }
    const yTop = top + 0.15;
    if (it.cover === 'shade' || it.cover === 'roof') { const m = new THREE.Mesh(new THREE.PlaneGeometry(it.w + 0.2, it.h + 0.2), it.cover === 'shade' ? new THREE.MeshStandardMaterial({ color: '#2f4a3a', transparent: true, opacity: 0.82, side: THREE.DoubleSide, roughness: 1 }) : glassMat);
      if (it.cover === 'roof') m.userData.glass = true; else mats.set('shade' + it.id, m.material); m.rotation.x = -Math.PI / 2; const grp = new THREE.Group(); grp.add(m); grp.rotation.y = ry; grp.position.set(it.x, yTop + 0.01, it.y); solids.add(grp); }
    if (it.cover === 'vine') {   // leafy clumps over the rafters (simple, cheap shapes; seeded so they stay put)
      let sd = 1; for (const ch of it.id) sd = (sd * 31 + ch.charCodeAt(0)) >>> 0; const rnd = () => { sd = (sd * 1664525 + 1013904223) >>> 0; return sd / 4294967296; };
      const geo = new THREE.IcosahedronGeometry(1, 1), cols = ['#4f7a35', '#5d8a3c', '#6b9446', '#466d2f'], cnt = Math.min(220, Math.round(it.w * it.h * 2.2));
      for (let i = 0; i < cnt; i++) { const [x, z] = local(it, (rnd() - 0.5) * it.w, (rnd() - 0.5) * it.h), r_ = 0.25 + rnd() * 0.3, m = new THREE.Mesh(geo, flat(cols[i % 4])); m.scale.set(r_, r_ * 0.55, r_); m.position.set(x, yTop + r_ * 0.2, z); solids.add(m); }
      for (const sd2 of [-1, 1]) { const [x, z] = L(-a + 0.08, sd2 * (b - 0.08)); const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.05, Ht, 5), flat('#5a4630')); m.position.set(x + 0.08, gy(x, z) + Ht / 2, z + 0.08); solids.add(m); }
    }
    it.__lab = yTop + (it.cover === 'vine' ? 0.6 : 0.35);
  }
  // an upright panel that follows the ground along a polyline, cut into short pieces (fence boards, trellis lattice, wire mesh)
  function panel(pts, h, material, { lift = 0, metres = 1, vRepeat = null, thick = 0 } = {}) {
    for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < 0.01) continue; const n = Math.min(200, Math.max(1, Math.ceil(len / 1.2)));
      for (let k = 0; k < n; k++) { const x0 = a[0] + dx * k / n, z0 = a[1] + dz * k / n, x1 = a[0] + dx * (k + 1) / n, z1 = a[1] + dz * (k + 1) / n, y0 = gy(x0, z0) + lift, y1 = gy(x1, z1) + lift, pl = len / n;
        const geo = thick ? new THREE.BoxGeometry(pl * 1.01, h, thick) : new THREE.PlaneGeometry(pl * 1.01, h); scaleUV(geo, pl / metres, vRepeat || h / metres);
        if (!thick) { const off = (k * pl) / metres, U = geo.getAttribute('uv'); for (let q = 0; q < U.count; q++) U.setX(q, U.getX(q) + off); }
        const m = new THREE.Mesh(geo, material), ang = Math.atan2(dz, dx); m.rotation.y = -ang; m.position.set((x0 + x1) / 2, Math.min(y0, y1) + h / 2, (z0 + z1) / 2);
        // shear the piece so its bottom follows the slope (local +x points toward the far end)
        const P = geo.getAttribute('position'); for (let q = 0; q < P.count; q++) P.setY(q, P.getY(q) + (P.getX(q) / pl) * (y1 - y0)); P.needsUpdate = true; geo.computeVertexNormals();
        m.position.y = (y0 + y1) / 2 + h / 2; solids.add(m); } } }
  const posts = (pts, h, c, every = 2.4, s_ = 0.09) => pts.forEach((p, i) => { box(s_, h + 0.1, s_, c, p[0], gy(p[0], p[1]) - 0.05, p[1]); const q = pts[i + 1]; if (!q) return; const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.min(200, Math.ceil(L / every)); for (let k = 1; k < n; k++) { const x = p[0] + (q[0] - p[0]) * k / n, z = p[1] + (q[1] - p[1]) * k / n; box(s_ * 0.9, h + 0.05, s_ * 0.9, c, x, gy(x, z) - 0.05, z); } });
  const wires = (pts, hs, c = '#9aa3a6') => { for (const y of hs) pts.slice(1).forEach((p, i) => seg(pts[i], p, 0.01, 0.01, c, y)); };
  const FENCE_COL = { palings: '#8a6b4a', pickets: '#f1eee6', slats: '#6b5238', wire: '#7a6a55', panels: '#8a998c' };
  function fence(it) {
    const st_ = it.style || 'palings', c = it.colour || FENCE_COL[st_], H = it.height;
    if (st_ === 'wire') { posts(it.pts, H, c, 3, 0.08); wires(it.pts, [H * 0.3, H * 0.6, H * 0.92]); return; }
    posts(it.pts, H, st_ === 'panels' ? shadeC(c, -0.2) : shadeC(c, -0.25), st_ === 'panels' ? 2.4 : 2.4, st_ === 'panels' ? 0.07 : 0.1);
    if (st_ === 'palings') panel(it.pts, H, it.colour ? tinted('palings', it.colour) : surf('palings'), { metres: 0.9, vRepeat: 1, thick: 0.025 });
    else if (st_ === 'panels') panel(it.pts, H, tinted('roof', c), { metres: 0.76, vRepeat: 1, thick: 0.01 });
    else panel(it.pts, H, tinted(st_, c), { metres: st_ === 'pickets' ? 0.36 : 0.6, vRepeat: st_ === 'pickets' ? 1 : H / 0.6 });
  }
  const shadeC = (hex, f) => { const c = new THREE.Color(hex); c.offsetHSL(0, 0, f * 0.5); return '#' + c.getHexString(); };
  function trellis(it) {
    const H = it.height; posts(it.pts, H, '#6b4f33', 2.4, 0.08);
    if (it.style === 'wire') wires(it.pts, [0.4, 0.75, 1.1, 1.45, 1.8, 2.2, 2.6].filter(y => y < H - 0.05).concat([H - 0.05]));
    else panel(it.pts, H - 0.1, tinted(it.style === 'mesh' ? 'mesh' : 'lattice', it.style === 'mesh' ? '#8e989b' : '#a27c55'), { lift: 0.05, metres: it.style === 'mesh' ? 0.3 : 0.6 });
  }
  // a retaining wall: stands on the lower ground on either side and rises 'height' above it (or to the higher side, whichever is more)
  function wall(it) {
    const M_ = it.material, th = M_ === 'stone' ? 0.4 : M_ === 'sleeper' ? 0.12 : 0.2, mat_ = M_ === 'sleeper' ? surf('timber') : surf(M_), mt = M_ === 'sleeper' ? 0.8 : SF.SURFACES[M_].metres;
    const P = it.pts;
    for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < 0.01) continue; const nx = -dz / len, nz = dx / len, n = Math.min(200, Math.max(1, Math.ceil(len / 0.6))), ang = Math.atan2(dz, dx);
      for (let k = 0; k < n; k++) { const t = (k + 0.5) / n, x = a[0] + dx * t, z = a[1] + dz * t, s1 = gy(x + nx * 0.5, z + nz * 0.5), s2 = gy(x - nx * 0.5, z - nz * 0.5), lo = Math.min(s1, s2, gy(x, z)), hi = Math.max(s1, s2);
        const top = Math.max(lo + it.height, hi + 0.03), bot = lo - 0.15, h = top - bot, pl = len / n + (k === n - 1 || k === 0 ? th / 2 : 0.01);
        const geo = new THREE.BoxGeometry(pl, h, th); scaleUV(geo, pl / mt, M_ === 'sleeper' ? h / 0.6 : h / mt); const U = geo.getAttribute('uv'); for (let q = 0; q < U.count; q++) U.setX(q, U.getX(q) + k * len / n / mt);
        const m = new THREE.Mesh(geo, mat_); m.rotation.y = -ang; m.position.set(x, bot + h / 2, z); solids.add(m);
        if (M_ !== 'sleeper') { const cap = new THREE.Mesh(new THREE.BoxGeometry(pl, 0.05, th + 0.04), flat(M_ === 'brick' ? '#9a9286' : '#b7b1a6')); cap.rotation.y = -ang; cap.position.set(x, top + 0.025, z); solids.add(cap); } } }
  }
  // a flat item laid over the ground (lawn, gravel, an in-ground bed's soil): a sheet that follows every rise and dip
  function drape(it, colour, lift = 0.015, inset = 0, surface = null) {
    const w = Math.max(0.05, it.w - 2 * inset), h = Math.max(0.05, it.h - 2 * inset), step = Math.max(0.25, Math.min(1, Math.max(w, h) / 40)), nu = Math.max(1, Math.ceil(w / step)), nv = Math.max(1, Math.ceil(h / step)), pos = [], idx = [];
    if (it.shape === 'round') {   // rings round the centre, so the edge is a smooth circle or oval
      const nr = Math.max(2, Math.ceil(Math.max(w, h) / 2 / step)), ns = 56; { const [x, z] = local(it, 0, 0); pos.push(x, gy(x, z) + lift, z); }
      for (let k = 1; k <= nr; k++) for (let i = 0; i < ns; i++) { const t = i / ns * Math.PI * 2, [x, z] = local(it, Math.cos(t) * w / 2 * k / nr, Math.sin(t) * h / 2 * k / nr); pos.push(x, gy(x, z) + lift, z); }
      for (let i = 0; i < ns; i++) idx.push(0, 1 + (i + 1) % ns, 1 + i);
      for (let k = 1; k < nr; k++) for (let i = 0; i < ns; i++) { const a = 1 + (k - 1) * ns + i, b = 1 + (k - 1) * ns + (i + 1) % ns; idx.push(a, b, a + ns, b, b + ns, a + ns); }
    } else {
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const [x, z] = local(it, (i / nu - 0.5) * w, (j / nv - 0.5) * h); pos.push(x, gy(x, z) + lift, z); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i; idx.push(a, a + nu + 1, a + 1, a + 1, a + nu + 1, a + nu + 2); }
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    if (surface) planarUV(geo, SF.SURFACES[surface].metres);
    solids.add(new THREE.Mesh(geo, surface ? surf(surface) : flat(colour)));
  }
  // a path: a ribbon laid on the ground, sampled every 30 cm so it bends smoothly over rises and dips
  function ribbon(pts, width, colour, lift = 0.02, surface = null) {
    const P = []; for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / 0.3)); for (let k = i === 1 ? 0 : 1; k <= n; k++) P.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); }
    if (P.length < 2) return; const pos = [], idx = [], hw = width / 2;
    P.forEach((p, i) => { const q = P[Math.min(P.length - 1, i + 1)], o = P[Math.max(0, i - 1)]; let dx = q[0] - o[0], dz = q[1] - o[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      for (const sd of [-1, 1]) { const x = p[0] - dz * hw * sd, z = p[1] + dx * hw * sd; pos.push(x, Math.max(gy(x, z), gy(p[0], p[1])) + lift, z); } });
    for (let i = 0; i < P.length - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    if (surface) { const m = SF.SURFACES[surface].metres, uv = []; let run = 0; P.forEach((p, i) => { if (i) run += Math.hypot(p[0] - P[i - 1][0], p[1] - P[i - 1][1]); uv.push(0, run / m, width / m, run / m); }); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); }
    solids.add(new THREE.Mesh(geo, surface ? surf(surface) : flat(colour)));
  }
  let areaN = 0;
  for (const it of all) {
    if (it.kind === 'bed') bed(it);
    else if (it.kind === 'area') drape(it, it.fill || '#C9DDB8', 0.012 + Math.min(40, areaN++) * 0.003, 0, it.surface || SF.guessSurface(it));   // later areas sit a hair higher, so overlaps never flicker
    else if (it.kind === 'rows') drape(it, '#4f3a28', 0.02, -0.15, 'soil');   // crop rows stand in a bed of dug soil a little wider than the rows
    else if (it.kind === 'bench') {   // level top on legs that reach the ground
      const u = under(it), ry = -(it.rot || 0) * D2R, top = u.hi + 0.9;
      { const m = box(it.w, 0.04, it.h, '#b9a27f', it.x, top - 0.04, it.y, ry); m.material = surf('decking'); scaleUV(m.geometry, it.w / 1.4, it.h / 1.4); }
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const [x, z] = local(it, a * (it.w / 2 - 0.06), b * (it.h / 2 - 0.06)), y0 = gy(x, z) - 0.05; box(0.05, top - 0.04 - y0, 0.05, '#7d6a4f', x, y0, z, ry); }
    } else if (it.kind === 'tank') {   // on a level pad: the pad reaches down to the lowest ground under it
      const rr = it.w / 2, u = under({ ...it, w: it.w + 0.3, h: it.w + 0.3 }), padTop = u.hi + 0.08;
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(rr + 0.15, rr + 0.18, padTop - u.lo + 0.1, 24), flat('#b8b2a7')); pad.position.set(it.x, (padTop + u.lo - 0.1) / 2, it.y); solids.add(pad);
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rr, rr, 1.6, 24), flat('#7FB3DA')); m.position.set(it.x, padTop + 0.8, it.y); solids.add(m);
    }
    else if (it.kind === 'path') ribbon(it.pts, it.width || 1, '#CBBFA8', 0.025, it.surface || 'gravel');
    else if (it.kind === 'pipe') it.pts.slice(1).forEach((p, i) => seg(it.pts[i], p, 0.04, 0.04, '#2F7FC1', 0.03));
    else if (it.kind === 'fence') fence(it);
    else if (it.kind === 'trellis') trellis(it);
    else if (it.kind === 'wall') wall(it);
    else if (it.kind === 'building') building(it);
    else if (it.kind === 'greenhouse') greenhouse(it);
    else if (it.kind === 'pergola') pergola(it);
  }
  groundMesh.receiveShadow = true; solids.traverse(o => { if (o.isMesh) { o.castShadow = !o.userData.glass; o.receiveShadow = !o.userData.glass; } });
  const setShadows = q => { const on = shadowsFor(q); if (r.shadowMap.enabled !== on) { r.shadowMap.enabled = on; r.shadowMap.type = THREE.PCFSoftShadowMap; mats.forEach(m => { m.needsUpdate = true; }); surfMats.forEach(m => { m.needsUpdate = true; }); mat.needsUpdate = true; groundMesh.material.needsUpdate = true; } sun.castShadow = on; return on; };
  // plants that stand inside a raised bed sit on its soil, not on the ground under it
  const beds = all.filter(it => (it.kind === 'bed' || it.kind === 'greenhouse') && it.__top !== undefined);
  const inBed = (x, z) => { for (const b of beds) { const a = -(b.rot || 0) * D2R, dx = x - b.x, dz = z - b.y, u = dx * Math.cos(a) - dz * Math.sin(a), v = dx * Math.sin(a) + dz * Math.cos(a); if (b.shape === 'round' ? (u / (b.w / 2)) ** 2 + (v / (b.h / 2)) ** 2 <= 1 : Math.abs(u) <= b.w / 2 && Math.abs(v) <= b.h / 2) return b.__top; } return null; };
  const plantY = (x, z) => { const t = beds.length ? inBed(x, z) : null; return t === null ? gy(x, z) : t; };

  /* ---- plants: single plants and crop rows, as rules for the field drawer ---- */
  // the member's own plant looks (plant editor): checked by the plant generator; one that fails is dropped and its plants fall back to the default look
  const mine = {}; for (const [id, x] of Object.entries(plan.varieties || {})) { try { PRESETS['v_' + id] = specFromJSON(specToJSON(x.spec)); mine[id] = x; } catch { /* not usable */ } }
  const rules = M.fieldRules({ ...plan, varieties: mine }, date), singles = [];
  for (const it of all) if (it.kind === 'plant') { const gr = M.growth(it, date); if (gr !== null) singles.push([it, gr, M.presetFor(it.crop, it.variety, it.look, mine)]); }
  const used = new Set([...rules.map(q => q.species), ...singles.map(s => s[2])]);
  const specs = Object.fromEntries([...used].map(k => [k, PRESETS[k]]));
  const fv = new FieldView(scene, mat, specs); fv.shadows = setShadows(qSel.value); fv.setDetail(1, qSel.value);
  const real = k => fv.size(k);   // measured from the drawn plant, so a 3 m tree is drawn 3 m wide
  const blocks = [];
  // size rows from the crop's usual height, except low wide heads (lettuce, cabbage, cauliflower, squash), which are sized from their usual spread
  for (const q of rules) { const e = real(q.species), c = M.CROPS[q.crop] || M.CROPS.other, sp_ = PRESETS[q.species], wide = sp_.kind === 'rosette' || (sp_.kind === 'leafy' && ['loose', 'head', 'curd'].includes(sp_.form || 'loose'));
    /* a member's own variety is drawn exactly as designed */ const own = q.species.startsWith('v_'), ratio = own ? 1 : wide ? (c[2] || 2 * e.r) / (2 * e.r) : (c[3] || e.h) / e.h; blocks.push({ ...q, scale: Math.max(0.05, ratio * (0.2 + 0.8 * Math.min(1, Math.max(0.15, q.stage)))) }); }
  const drawnH = {};   // how tall each single plant is drawn, so its label sits just above it
  for (const [it, gr, k] of singles) { const e = real(k), sc = Math.max(0.05, (it.spread / (2 * e.r)) * (0.25 + 0.75 * gr)); drawnH[it.id] = e.h * sc;
    blocks.push({ id: it.id, species: k, x: it.x, z: it.y, rows: 1, cols: 1, rowSpacing: 1, plantSpacing: 1, seed: 7, sizeVar: 0, scale: sc }); }
  const sp = {}; for (const k of used) { const e = real(k); sp[k] = { h: e.h, r: e.r, tris: [0, 1, 2].map(L => Math.round(geoStats(fv.geometry(k, L)).tris)).concat([8]) }; }
  const field = new F.PlantField({ quality: qSel.value, species: sp, blocks }); field.setGround(plantY);

  /* ---- labels: names over beds, areas, rows, trees, tanks, notes and lines (HTML on top of the picture, placed every frame) ---- */
  let glowSet = new Set(glow || []);
  const labels = [];
  const lookName = it => (plan.varieties && it.look && plan.varieties[it.look] ? plan.varieties[it.look].name : '');
  const findText = it => [it.name, it.kind === 'plant' || it.kind === 'rows' ? ((M.CROPS[it.crop] || [])[0] || '') : '', it.variety, lookName(it)].join(' ').toLowerCase();
  const matches = q => { const ws = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean); return ws.length ? all.filter(it => ws.every(w => findText(it).includes(w))).map(it => it.id) : []; };
  /* what is growing in beds, greenhouses and benches (second line of the label, switched on in the side panel) */
  const contents = it => { if (!['bed', 'greenhouse', 'bench'].includes(it.kind)) return null; const g = M.growingIn(all, it, date); if (!g.length) return null;
    const one = (e, n) => e.name + (n ? ' ×' + e.n : '') + (e.variety ? ' (' + e.variety + ')' : ''), join = n => g.slice(0, 4).map(e => one(e, n)).join(', ') + (g.length > 4 ? ' +' + (g.length - 4) + ' more' : '');
    return { grow: join(false), count: join(true) }; };
  { const named = it => (it.name || '').trim(), mid = pts => { const i = Math.floor((pts.length - 1) / 2), a = pts[i], b = pts[i + 1] || a; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
    for (const it of all) {
      let text = named(it), x, z, y, kind = it.kind, minor = false;
      if (it.kind === 'note') text = (it.text || '').slice(0, 60) || text;
      if (it.kind === 'plant') { if (drawnH[it.id] === undefined) continue; minor = !(it.spread >= 1.2 || (it.variety && it.spread >= 0.6)); text = text + (it.variety ? ' ' + it.variety : ''); }   // not in the ground on this date: no label; small plants are named only when found
      if (!text) continue;
      if (it.pts) { [x, z] = mid(it.pts); y = gy(x, z) + (['fence', 'trellis', 'wall'].includes(it.kind) ? (it.height || 1.2) + 0.25 : 0.3); }
      else if (it.__lab !== undefined) { x = it.x; z = it.y; y = it.__lab; }
      else { x = it.x; z = it.y; const top = it.__top !== undefined ? it.__top : gy(x, z); y = (it.kind === 'plant' ? plantY(x, z) : top) + (it.kind === 'plant' ? (drawnH[it.id] || 0.5) + 0.2 : it.kind === 'tank' ? 2 : it.kind === 'bench' ? 1.15 : it.kind === 'building' ? (it.wallH || 3) + 0.6 : 0.3); }
      const c = contents(it), nm = el('span', { class: 'v3-nm', text }), sub = c ? el('span', { class: 'v3-sub' }) : null;
      const tag = el('span', { class: 'v3-lab v3-lab-' + kind + (glowSet.has(it.id) ? ' v3-glow' : '') }, [nm, sub]);
      labelsEl.append(tag); labels.push({ id: it.id, x, y, z, tag, text, minor, sub, c });
    } }
  const setSubs = () => { for (const L of labels) { if (!L.sub) continue; const t = cntCb.checked ? L.c.count : growCb.checked ? L.c.grow : ''; L.sub.textContent = t; L.sub.hidden = !t; L.tw = 0; L.th = 0; } schedule(); };
  /* ---- glow: things found with the Find box (or picked in the list) get a pulsing gold patch on the ground and a beam of light you can spot from afar ---- */
  // two shared materials for every patch and beam (a find can match thousands of plants on a farm); at most GLOW_MAX get a beam, all labels still glow
  const GLOW_MAX = 250, glowMats = [], glowObjs = [];
  const reduceMotion = (() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  const glowMat = () => { const m = new THREE.MeshBasicMaterial({ color: '#ffc828', transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); m.userData.base = 0.55; return m; };
  const slabMat = glowMat(), beamMat = glowMat();
  let glowTimer = 0;
  function setGlow(ids) {
    glowSet = new Set(ids);
    for (const o of glowObjs) { scene.remove(o); o.geometry.dispose(); } glowObjs.length = 0; glowMats.length = 0;
    let n = 0;
    const big = Math.max(plan.site.w, plan.site.h), beamH = Math.min(40, Math.max(3, big * 0.1)), beamR = beamH * 0.03;
    for (const it of all) { if (!glowSet.has(it.id) || n++ >= GLOW_MAX) continue;
      const b = M.bounds(it, plan), cx = (b[0] + b[2]) / 2, cz = (b[1] + b[3]) / 2, w = Math.max(0.5, b[2] - b[0]) + 0.6, d = Math.max(0.5, b[3] - b[1]) + 0.6, y0 = (it.__top !== undefined ? it.__top : gy(cx, cz)) + 0.1;
      const slab = new THREE.Mesh(new THREE.PlaneGeometry(w, d), slabMat); slab.rotation.x = -Math.PI / 2; slab.position.set(cx, y0, cz); slab.renderOrder = 9; scene.add(slab); glowObjs.push(slab);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(beamR, beamR * 1.6, beamH, 10, 1, true), beamMat); beam.position.set(cx, y0 + beamH / 2, cz); beam.renderOrder = 9; scene.add(beam); glowObjs.push(beam);
    }
    if (glowObjs.length) glowMats.push(slabMat, beamMat);
    for (const L of labels) L.tag.classList.toggle('v3-glow', glowSet.has(L.id));
    if (window.__v3) window.__v3.glow = glowObjs.length / 2;
    schedule();
  }
  const placeLabels = (w, h) => {
    if (!showLabels || !labels.length) return; const v = new THREE.Vector3(), boxes = [];
    for (const L of labels) {
      L.shown = false;
      if (L.minor && !glowSet.has(L.id)) { L.tag.style.display = 'none'; continue; }
      v.set(L.x, L.y, L.z).project(cam); const vis = v.z < 1 && v.z > -1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      if (!vis) { L.tag.style.display = 'none'; continue; }
      const px = (v.x + 1) / 2 * w, py = (1 - v.y) / 2 * h, tw = L.tw || (L.tw = L.tag.offsetWidth || 60), th = L.th || (L.th = L.tag.offsetHeight || 18);
      const box = [px - tw / 2, py - th, px + tw / 2, py];
      if (!glowSet.has(L.id) && boxes.some(b => b[0] < box[2] && box[0] < b[2] && b[1] < box[3] && box[1] < b[3])) { L.tag.style.display = 'none'; continue; }   // nearer labels first win; overlapping ones wait (found things always show)
      boxes.push(box); L.tag.style.display = ''; L.tag.style.transform = `translate(${Math.round(px - tw / 2)}px, ${Math.round(py - th)}px)`; L.px = px; L.py = py; L.shown = true;
    }
  };

  /* ---- camera: an orbit camera around a target point ----
     yaw   = the plan direction (degrees clockwise from plan-up) from the target to the camera
     pitch = height angle above the ground, 3 to 89.9 degrees;  dist = metres from the target */
  const FOV = 45, persp = new THREE.PerspectiveCamera(FOV, 1, 0.1, 8000), ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 20000);
  const N = site.north || 0, bearingYaw = b => b + N;   // a compass bearing as a plan direction
  const diag = Math.hypot(site.w, site.h), fitDist = () => { const a = Math.max(0.3, cv.clientWidth / Math.max(1, cv.clientHeight)); return (diag / 2) / Math.tan(FOV / 2 * D2R) / Math.min(1, a) * 1.08 + 1; };
  const HOME = () => ({ tx: site.w / 2, tz: site.h / 2, yaw: bearingYaw(210), pitch: 38, dist: fitDist() });
  const st = Object.assign(HOME(), keepView || {}); let anim = null;
  let raf = 0, dirty = true, cam = persp;
  const offset = () => { const y = st.yaw * D2R, p = st.pitch * D2R; return new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p)); };
  function placeCamera(w, h) {
    const a = w / h, ty = gy(st.tx, st.tz), tgt = new THREE.Vector3(st.tx, ty, st.tz), o = offset();
    if (projSel.value === 'ortho') {
      cam = ortho; const half = st.dist * Math.tan(FOV / 2 * D2R); ortho.left = -half * a; ortho.right = half * a; ortho.top = half; ortho.bottom = -half;
      ortho.position.copy(tgt).addScaledVector(o, Math.max(st.dist, diag) + 500);
    } else { cam = persp; persp.aspect = a; persp.position.copy(tgt).addScaledVector(o, st.dist); const gnd = gy(persp.position.x, persp.position.z) + 0.6; if (persp.position.y < gnd) persp.position.y = gnd; }
    cam.up.set(0, 1, 0); if (st.pitch > 89) { const y = st.yaw * D2R; cam.up.set(-Math.sin(y), 0, Math.cos(y)); }   // looking straight down: keep "away from the camera" at the top of the screen
    cam.lookAt(tgt); cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    return tgt;
  }

  /* ---- view cube (bottom right): compass faces, rendered in its own small scene ---- */
  const cubeScene = new THREE.Scene(), cubeCam = new THREE.OrthographicCamera(-1.2, 1.2, 1.2, -1.2, 0.1, 10);
  const faceTex = (txt, bg) => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, 128, 128); x.strokeStyle = '#7d8a96'; x.lineWidth = 6; x.strokeRect(3, 3, 122, 122);
    x.fillStyle = txt === 'N' ? '#b33a2a' : '#26323d'; x.font = 'bold ' + (txt.length > 2 ? 34 : 54) + 'px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(txt, 64, 66); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
  // BoxGeometry face order: +x, -x, +y, -y, +z, -z.  With the cube turned so its -z face points north: +x east, -x west, +y top, +z south
  const cubeMats = [['E', '#eef2f5'], ['W', '#eef2f5'], ['TOP', '#f7f9fb'], ['', '#cfd6dc'], ['S', '#eef2f5'], ['N', '#eef2f5']].map(([t, b]) => new THREE.MeshBasicMaterial({ map: faceTex(t, b) }));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), cubeMats); cube.rotation.y = -N * D2R; cubeScene.add(cube);
  const cubeEdges = new THREE.LineSegments(new THREE.EdgesGeometry(cube.geometry), new THREE.LineBasicMaterial({ color: '#5f6b76' })); cube.add(cubeEdges);
  for (const [t, b] of [['N', 0], ['E', 90], ['S', 180], ['W', 270]]) {   // compass letters around the cube, so a top view still shows north
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); x.fillStyle = t === 'N' ? '#b33a2a' : '#33414d'; x.font = 'bold 44px system-ui, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(t, 32, 34);
    const tex = new THREE.CanvasTexture(c), spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex })); spr.scale.set(0.32, 0.32, 1); const a = b * D2R; spr.position.set(Math.sin(a) * 0.86, -0.5, -Math.cos(a) * 0.86); cube.add(spr);
  }
  const hover = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshBasicMaterial({ color: '#2b6cb0', transparent: true, opacity: 0.55 })); hover.visible = false; cube.add(hover);
  const CUBE = () => Math.round(Math.min(136, Math.max(96, Math.min(cv.clientWidth, cv.clientHeight) * 0.2)));
  const cubeRect = () => { const s = CUBE(), m = 12; return { x: cv.clientWidth - s - m, y: cv.clientHeight - s - m, s }; };   // in CSS pixels, from the top left
  const ray = new THREE.Raycaster();
  // which face, edge or corner of the cube is under the pointer: a direction like (1, 1, 0) in the cube's own axes, or null
  function cubePick(px, py) {
    const R = cubeRect(); if (px < R.x || py < R.y || px > R.x + R.s || py > R.y + R.s) return null;
    ray.setFromCamera(new THREE.Vector2(((px - R.x) / R.s) * 2 - 1, -((py - R.y) / R.s) * 2 + 1), cubeCam);
    const hit = ray.intersectObject(cube, false)[0]; if (!hit) return { miss: true };
    const p = cube.worldToLocal(hit.point.clone()), d = new THREE.Vector3(Math.abs(p.x) > 0.3 ? Math.sign(p.x) : 0, Math.abs(p.y) > 0.3 ? Math.sign(p.y) : 0, Math.abs(p.z) > 0.3 ? Math.sign(p.z) : 0);
    return d.lengthSq() ? { d } : { miss: true };
  }
  function goToCubeDir(d) {   // d in cube axes (x east, y up, z south) -> yaw/pitch
    if (d.y < 0) d = new THREE.Vector3(d.x, 0, d.z).lengthSq() ? new THREE.Vector3(d.x, 0, d.z) : new THREE.Vector3(0, 1, 0);   // never under the ground
    const len = d.length(), horiz = Math.hypot(d.x, d.z), pitch = clamp(Math.asin(d.y / len) / D2R, 3, 89.9);
    const bearing = horiz < 1e-6 ? (((st.yaw - N) % 360) + 360) % 360 : (Math.atan2(d.x, -d.z) / D2R + 360) % 360;   // straight down keeps the current heading
    flyTo({ yaw: bearingYaw(horiz < 1e-6 ? snapBearing(bearing) : bearing), pitch });
  }
  const snapBearing = b => (Math.round(b / 90) * 90) % 360;
  function flyTo(to, ms = 380) {
    const from = { tx: st.tx, tz: st.tz, yaw: st.yaw, pitch: st.pitch, dist: st.dist }, goal = Object.assign({}, from, to);
    let dy = ((goal.yaw - from.yaw) % 360 + 540) % 360 - 180; goal.yaw = from.yaw + dy;   // the short way round
    const t0 = performance.now(); anim = () => { const t = Math.min(1, (performance.now() - t0) / ms), k = t * t * (3 - 2 * t);
      for (const key of Object.keys(goal)) st[key] = from[key] + (goal[key] - from[key]) * k; if (t >= 1) anim = null; };
    schedule();
  }
  const fit = () => flyTo({ tx: site.w / 2, tz: site.h / 2, dist: fitDist() });
  const home = () => flyTo(HOME());
  const topView = () => flyTo({ pitch: 89.9, yaw: bearingYaw(snapBearing(((st.yaw - N) % 360 + 360) % 360)) });

  function frame() {
    raf = 0; if (anim) { anim(); dirty = true; }
    if (glowMats.length) {   // the pulse redraws about 12 times a second (not every screen refresh, to spare tablet batteries); none with reduced motion
      const p = reduceMotion ? 1 : 0.5 + 0.5 * Math.sin(performance.now() / 260); for (const m of glowMats) m.opacity = m.userData.base * (0.3 + 0.7 * p);
      if (!reduceMotion && !glowTimer) glowTimer = setTimeout(() => { glowTimer = 0; if (glowMats.length) schedule(); }, 80);
      if (!reduceMotion) dirty = true;
    }
    if (!dirty) return; dirty = false;
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) { schedule(); return; }
    r.setSize(w, h, false); const tgt = placeCamera(w, h);
    const view = projSel.value === 'ortho' && st.pitch > 89 ? F.orthoView({ cx: st.tx, cz: st.tz, halfH: st.dist * Math.tan(FOV / 2 * D2R), aspect: w / h, heightPx: h })
      : F.perspView({ eye: [cam.position.x, cam.position.y, cam.position.z].map((v, i) => projSel.value === 'ortho' ? [tgt.x, tgt.y, tgt.z][i] + offset().toArray()[i] * st.dist : v), target: [tgt.x, tgt.y, tgt.z], fovDeg: FOV, aspect: w / h, heightPx: h, maxDist: Math.max(300, st.dist * 4) });
    // sun from date, time and latitude (model.js)
    const hour = +hourIn.value, s = M.sunAt(date, hour, site.lat), az = (s.az + N) * D2R, el_ = Math.max(4, s.el) * D2R, warm = clamp(s.el / 40, 0, 1);
    sun.position.set(st.tx + Math.sin(az) * Math.cos(el_) * 400, Math.sin(el_) * 400 + tgt.y, st.tz - Math.cos(az) * Math.cos(el_) * 400); sun.target.position.set(st.tx, tgt.y, st.tz); scene.add(sun.target);
    sun.color.set('#ffae66').lerp(new THREE.Color('#fff4e0'), warm); sun.intensity = s.el <= 0 ? 0.25 : 0.9 + 1.4 * warm; sky.intensity = 0.45 + 0.3 * warm;   // low sun: warmer and dimmer
    if (sun.castShadow) { const half = clamp(st.dist * 0.9, 12, 220), sc = sun.shadow.camera; sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half; sc.updateProjectionMatrix(); }
    scene.fog.near = st.dist * 1.1 + diag * 0.7; scene.fog.far = scene.fog.near + diag * 2.5 + 500;
    const sel = field.select(view); fv.apply(sel);
    r.setScissorTest(false); r.setViewport(0, 0, w, h); r.clear(); r.render(scene, cam);
    // the view cube looks the same way as the camera
    cube.children.forEach(c => { if (c.isSprite) c.visible = st.pitch > 60; });   // the compass letters only help when looking down
    const o = offset(); cubeCam.position.set(o.x * 3, o.y * 3, o.z * 3); cubeCam.up.copy(cam.up); cubeCam.lookAt(0, 0, 0); cubeCam.updateMatrixWorld();
    const R = cubeRect(); r.setScissorTest(true); r.setScissor(R.x, h - R.y - R.s, R.s, R.s); r.setViewport(R.x, h - R.y - R.s, R.s, R.s); r.clearDepth(); r.render(cubeScene, cubeCam); r.setScissorTest(false);
    if (showLabels) { const cp = cam.position; labels.sort((a, b) => ((a.x - cp.x) ** 2 + (a.y - cp.y) ** 2 + (a.z - cp.z) ** 2) - ((b.x - cp.x) ** 2 + (b.y - cp.y) ** 2 + (b.z - cp.z) ** 2)); placeLabels(w, h); }
    const t = sel.stats; info.textContent = field.count().toLocaleString() + ' plants · drawn ' + t.drawn.toLocaleString() + ' (' + t.full + ' full, ' + t.reduced + ' reduced, ' + t.proxy + ' simple, ' + t.marker + ' flat) · ' + Math.round(t.tris).toLocaleString() + ' triangles';
    window.__v3 = { glow: glowObjs.length / 2, species: singles.map(s => s[2]).concat(rules.map(q => q.species)), labels: labels.filter(L => L.tag.style.display !== 'none').map(L => L.tag.textContent), labelsOn: showLabels, stats: t, cam: { yaw: st.yaw, pitch: st.pitch, dist: st.dist, tx: st.tx, tz: st.tz, proj: projSel.value, north: N }, rules: blocks.length, ground: !!g, cube: R,
      beds: beds.map(b => ({ id: b.id, top: b.__top })), under: (x, z) => gy(x, z), plantY, view: k => ({ home, fit, top: topView })[k](), look: o => flyTo(o, 1), dir: (x, y, z) => goToCubeDir(new THREE.Vector3(x, y, z)) };
    if (anim) schedule();
  }
  const schedule = () => { dirty = true; if (!raf) raf = requestAnimationFrame(frame); };

  /* ---- pointer: turn, move, zoom; the cube ---- */
  const ptrs = new Map(); let drag = null, pinch = null;
  const rel = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  const ndc = (px, py) => new THREE.Vector2((px / cv.clientWidth) * 2 - 1, -(py / cv.clientHeight) * 2 + 1);
  // the point on the ground under the pointer (the ground mesh, or a level plane through the target when the pointer is above the horizon)
  function groundAt(px, py, planeY) {
    placeCamera(cv.clientWidth, cv.clientHeight); ray.setFromCamera(ndc(px, py), cam);
    if (planeY === undefined) { const hit = ray.intersectObject(groundMesh, false)[0]; if (hit) return hit.point; planeY = gy(st.tx, st.tz); }
    const pl = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY), p = new THREE.Vector3(); return ray.ray.intersectPlane(pl, p) ? p : null;
  }
  const keepOnSite = () => { const m = diag * 0.25; st.tx = clamp(st.tx, -m, site.w + m); st.tz = clamp(st.tz, -m, site.h + m); };
  cv.addEventListener('pointerdown', e => {
    cv.focus(); const [px, py] = rel(e);
    if (ptrs.size === 0) { const c = cubePick(px, py); if (c) { if (c.d) goToCubeDir(c.d); return; } }
    cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [px, py]); anim = null;
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), mid: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], dist: st.dist }; const gp = groundAt(pinch.mid[0], pinch.mid[1]); pinch.y = gp ? gp.y : gy(st.tx, st.tz); pinch.grab = groundAt(pinch.mid[0], pinch.mid[1], pinch.y); drag = null; return; }
    const move = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);
    if (move) { const gp = groundAt(px, py), y = gp ? gp.y : gy(st.tx, st.tz); drag = { move: true, y, grab: groundAt(px, py, y) }; }
    else drag = { turn: true, last: [px, py] };
  });
  cv.addEventListener('pointermove', e => {
    const [px, py] = rel(e);
    if (!ptrs.size) { const c = cubePick(px, py); hover.visible = !!(c && c.d); if (c && c.d) hover.position.copy(c.d).multiplyScalar(0.5); cv.style.cursor = c && c.d ? 'pointer' : ''; schedule(); return; }
    if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [px, py]);
    if (pinch && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      st.dist = clamp(pinch.dist * pinch.d / Math.max(1, d), 1.5, 4000);
      if (pinch.grab) { const now = groundAt(mid[0], mid[1], pinch.y); if (now) { st.tx += pinch.grab.x - now.x; st.tz += pinch.grab.z - now.z; keepOnSite(); } }
      schedule(); return;
    }
    if (!drag) return;
    if (drag.turn) { const dx = px - drag.last[0], dy = py - drag.last[1]; drag.last = [px, py]; st.yaw -= dx * 0.35; st.pitch = clamp(st.pitch + dy * 0.3, 3, 89.9); }
    else if (drag.move && drag.grab) { const now = groundAt(px, py, drag.y); if (now) { st.tx += drag.grab.x - now.x; st.tz += drag.grab.z - now.z; keepOnSite(); } }
    schedule();
  });
  const up = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; else if (ptrs.size === 1) { const [p] = [...ptrs.values()]; drag = { turn: true, last: p }; } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('pointerleave', () => { if (!ptrs.size && hover.visible) { hover.visible = false; schedule(); } });
  // zoom toward the pointer: the spot under it stays under it
  const zoomAt = (f, px, py) => {
    const before = px === undefined ? null : groundAt(px, py), nd = clamp(st.dist * f, 1.5, 4000); if (nd === st.dist) return;
    if (before) { const k = 1 - nd / st.dist; st.tx += (before.x - st.tx) * k; st.tz += (before.z - st.tz) * k; keepOnSite(); }
    st.dist = nd; schedule();
  };
  cv.addEventListener('wheel', e => { e.preventDefault(); anim = null; const [px, py] = rel(e); zoomAt(Math.exp(clamp(e.deltaY, -300, 300) * 0.0015), px, py); }, { passive: false });
  cv.addEventListener('dblclick', e => { const [px, py] = rel(e); if (cubePick(px, py)) return; const p = groundAt(px, py); if (p) flyTo({ tx: clamp(p.x, 0, site.w), tz: clamp(p.z, 0, site.h), dist: Math.max(3, st.dist * 0.6) }); });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  homeB.addEventListener('click', home); fitB.addEventListener('click', fit); topB.addEventListener('click', topView);
  /* ---- side panel, find, show ticks, share picture ---- */
  const setPanel = on => { panelOpen = on; side.hidden = !on; panelB.setAttribute('aria-expanded', String(on)); try { localStorage.setItem('ltplanner.v3panel', on ? 'open' : 'closed'); } catch {} schedule(); setTimeout(schedule, 60); };
  panelB.addEventListener('click', () => setPanel(!panelOpen));
  const doFind = () => { const q = findIn.value.trim(), ids = matches(q), idSet = new Set(ids); setGlow(ids); findMsg.textContent = !q ? '' : ids.length ? ids.length + ' found, glowing in gold' : 'Nothing matches that in this plan'; const L = labels.find(l => idSet.has(l.id)); if (ids.length && L) flyTo({ tx: clamp(L.x, 0, site.w), tz: clamp(L.z, 0, site.h), dist: Math.max(8, Math.min(st.dist, diag * 0.5)) }); };
  findIn.addEventListener('input', () => { clearTimeout(findIn._t); findIn._t = setTimeout(doFind, 180); });
  findIn.addEventListener('keydown', e => { if (e.key === 'Escape' && findIn.value) { e.stopPropagation(); e.preventDefault(); findIn.value = ''; doFind(); } else if (e.key === 'Enter') { e.preventDefault(); clearTimeout(findIn._t); doFind(); } });
  const needNames = () => { if ((growCb.checked || cntCb.checked) && !labCb.checked) { labCb.checked = true; labCb.dispatchEvent(new Event('change')); } };   // the text sits under the names, so ticking it turns names on
  growCb.addEventListener('change', () => { if (growCb.checked) cntCb.checked = false; setSubs(); needNames(); }); cntCb.addEventListener('change', () => { if (cntCb.checked) growCb.checked = false; setSubs(); needNames(); });
  const shot = async sharp => {
    const old = { pr: r.getPixelRatio(), sh: r.shadowMap.enabled }, wasLab = showLabels;
    const w = cv.clientWidth, h = cv.clientHeight, want = sharp ? Math.min(3, 4096 / Math.max(w, h)) : Math.min(2, window.devicePixelRatio || 1);
    try {
      if (sharp) { fv.shadows = setShadows('ultra'); }
      r.setPixelRatio(want); dirty = true; frame(); await new Promise(res => requestAnimationFrame(res));
      dirty = true; frame();
      const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0);
      const k = c.width / w, out = wasLab ? labels.filter(L => L.shown && (L.tag.style.display !== 'none')).map(L => ({ x: L.px * k, y: L.py * k, text: L.text, sub: L.sub && !L.sub.hidden ? L.sub.textContent : '', glow: glowSet.has(L.id) })) : [];
      return { canvas: c, labels: out, scale: k };
    } finally { r.setPixelRatio(old.pr); fv.shadows = setShadows(qSel.value); dirty = true; schedule(); }
  };
  shareB.addEventListener('click', () => openShare({ title: plan.name || 'My plan', date: new Date(date + 'T00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }), render: shot }));
  setGlow(findStart ? matches(findStart) : glow); setSubs(); let savedPanel = null; try { savedPanel = localStorage.getItem('ltplanner.v3panel'); } catch {} if (window.innerWidth < 900 && panelOpen && !savedPanel) setPanel(false);
  qSel.addEventListener('change', () => { F.setQuality(qSel.value); field.setQuality(qSel.value); fv.shadows = setShadows(qSel.value); fv.setDetail(1, '_'); fv.setDetail(1, qSel.value); schedule(); });
  labCb.addEventListener('change', () => { showLabels = labCb.checked; labelsEl.hidden = !showLabels; try { localStorage.setItem('ltplanner.labels3d', showLabels ? 'on' : 'off'); } catch {} schedule(); });
  projSel.addEventListener('change', schedule); hourIn.addEventListener('input', schedule); addEventListener('resize', schedule);
  const close = () => { cancelAnimationFrame(raf); clearTimeout(glowTimer); glowMats.length = 0; slabMat.dispose(); beamMat.dispose(); removeEventListener('resize', schedule); document.removeEventListener('keydown', key, true); fv.dispose(); mats.forEach(m => m.dispose()); mat.dispose(); surfMats.forEach(m => m.dispose()); texs.forEach(t => t.dispose()); groundMesh.material.dispose();
    cubeMats.forEach(m => { m.map.dispose(); m.dispose(); }); cube.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } }); cube.geometry.dispose(); cubeEdges.geometry.dispose(); hover.geometry.dispose();
    scene.traverse(o => { if (o.geometry) o.geometry.dispose(); }); r.dispose(); wrap.remove(); };
  const key = e => {
    if (e.key === 'Escape') { if (e.target === findIn && findIn.value) return; e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.target.closest && e.target.closest('select,input')) return;
    const k = e.key.toLowerCase(), act = { f: fit, h: home, t: topView }[k];
    if (act) { e.preventDefault(); act(); return; }
    if (e.key === 'ArrowLeft') st.yaw += 8; else if (e.key === 'ArrowRight') st.yaw -= 8; else if (e.key === 'ArrowUp') st.pitch = clamp(st.pitch + 6, 3, 89.9); else if (e.key === 'ArrowDown') st.pitch = clamp(st.pitch - 6, 3, 89.9);
    else if (e.key === '+' || e.key === '=') zoomAt(1 / 1.2); else if (e.key === '-') zoomAt(1.2); else return;
    e.preventDefault(); schedule();
  };
  document.addEventListener('keydown', key, true); closeB.addEventListener('click', close);
  exSel.addEventListener('change', () => { const v = { tx: st.tx, tz: st.tz, yaw: st.yaw, pitch: st.pitch, dist: st.dist }; close(); open3D({ plan, M, TR, date, ex: +exSel.value, keepView: v, find: findIn.value }); });
  window.__v3close = close; schedule(); cv.focus();
  return { close };
}
/* two small icons the shared kit does not have */
function navIcon(k) {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', k === 'home' ? 'M3 11l9-7 9 7M5 10v10h5v-6h4v6h5V10' : 'M12 3v10M8 9l4 4 4-4M4 17h16l-3 4H7z'); s.append(p); return s;
}
