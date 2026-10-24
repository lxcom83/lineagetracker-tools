/* LT-Planner: plant editor and "My plants" library.
   Take any default plant, change its height, leaf colours and pattern, fruit colour and shape ..., and keep it as your own variety
   (with its parents and generation, for breeding work).  Varieties live on this device (My plants), travel inside each plan that uses
   them, and can be exported and imported as a file.  The recipe format and the list of editable traits are in plants/plants.js and
   plants/traits.js; this file is only the screens. */
import { el, icon, toast, dialog, confirmBox, store } from '../kit/core.js';
import { downloadText, pickFile } from '../kit/files.js';
import { BY_ID as PLANT_DB } from '../kit/plantdb.js';

const LIB = 'lt-tools.plants';
export const loadLibrary = () => { const o = store.get(LIB, null); return o && typeof o.items === 'object' ? o.items : {}; };
const saveLibrary = items => store.set(LIB, { v: 1, items });
let mods = null;
const load = async () => mods || (mods = { P: await import('./plants/plants.js'), T: await import('./plants/traits.js'), THREE: await import('./plants/vendor/three.module.js') });

/* default plants as a picker list: "Tomato", "Apple", ... (from the plant database where a plant names this look, else the key made readable) */
export function defaultPlantList(P) {
  const names = {}; for (const p of Object.values(PLANT_DB)) if (p.look && !names[p.look]) names[p.look] = p.name;
  return Object.keys(P.PRESETS).map(k => [k, names[k] || k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()), P.PRESETS[k].kind]).sort((a, b) => a[1].localeCompare(b[1]));
}

/* ---------- the editor ----------
   opts: { baseKey, variety, cropName, onUse(variety, {all}), cropLabel }   baseKey = default plant to start from (or variety.base) */
export async function openPlantEditor(opts = {}) {
  const { P, T, THREE } = await load();
  const lib = loadLibrary();
  let rec = opts.variety ? T.cleanVariety(opts.variety) : null;
  const baseKey = (rec && rec.base) || opts.baseKey || 'tomato';
  let spec = T.clone(rec ? rec.spec : P.PRESETS[baseKey] || P.PRESETS.tomato);
  const meta = { name: rec ? rec.name : (opts.cropName ? 'My ' + opts.cropName : 'My plant'), mother: rec ? rec.mother : '', father: rec ? rec.father : '', gen: rec ? rec.gen : '', notes: rec ? rec.notes : '' };
  let stage = 1, dirty = false, d = null, raf = 0, timer = 0, geoms = null;
  const baseSpec = T.clone(P.PRESETS[baseKey] || spec);

  // ----- preview -----
  const cv = el('canvas', { class: 'pe-canvas', width: 560, height: 440, 'aria-label': 'Preview of the plant. Drag to turn it.' });
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, preserveDrawingBuffer: true }); r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); r.setClearColor('#cfe3f3');
  const scene = new THREE.Scene(); scene.fog = new THREE.Fog('#cfe3f3', 20, 80);
  scene.add(new THREE.HemisphereLight('#e6f2ff', '#6a5a40', 1.5)); const sun = new THREE.DirectionalLight('#fff3dc', 2.2); sun.position.set(4, 8, 5); scene.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: '#7b9a55' })); ground.rotation.x = -Math.PI / 2; scene.add(ground);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
  const cam = new THREE.PerspectiveCamera(40, 560 / 440, 0.02, 400); const view = { yaw: 0.6, pitch: 0.22, dist: 6, tx: 0, ty: 1, tz: 0 };
  let mesh = null;
  const draw = () => { raf = 0; const w = cv.clientWidth || 560, h = Math.round(w * 440 / 560); if (cv.width !== Math.round(w * r.getPixelRatio())) r.setSize(w, h, false);
    cam.aspect = w / h; cam.updateProjectionMatrix(); cam.position.set(view.tx + Math.sin(view.yaw) * Math.cos(view.pitch) * view.dist, view.ty + Math.sin(view.pitch) * view.dist, view.tz + Math.cos(view.yaw) * Math.cos(view.pitch) * view.dist); cam.lookAt(view.tx, view.ty, view.tz); r.render(scene, cam); };
  const redraw = () => { if (!raf) raf = requestAnimationFrame(draw); };
  const message = el('p', { class: 'small', role: 'status' });
  function rebuild(refit) {
    let clean; try { clean = T.cleanSpec(spec); message.textContent = ''; message.className = 'small'; } catch (e) { message.textContent = e.message; message.className = 'small pl-warn'; return; }
    const g = P.generate(clean, stage, { level: 'medium' }); if (mesh) { scene.remove(mesh); mesh.geometry.dispose(); } mesh = new THREE.Mesh(g, mat); scene.add(mesh);
    if (refit !== false) { g.computeBoundingBox(); const b = g.boundingBox, h = Math.max(0.1, b.max.y), w = Math.max(b.max.x - b.min.x, b.max.z - b.min.z, 0.1); view.tx = (b.max.x + b.min.x) / 2; view.tz = (b.max.z + b.min.z) / 2; view.ty = h * 0.5; view.dist = Math.max(h * 1.7, w * 1.15) + 0.3; }
    redraw();
  }
  const later = refit => { dirty = true; clearTimeout(timer); timer = setTimeout(() => rebuild(refit), 80); };
  let drag = null; const pts = new Map();
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); drag = { x: e.clientX, y: e.clientY, d: 0 }; });
  cv.addEventListener('pointermove', e => { if (!pts.has(e.pointerId)) return; const was = pts.get(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; const now = Math.hypot(a[0] - b[0], a[1] - b[1]); if (drag.d) view.dist = Math.max(0.3, Math.min(120, view.dist * drag.d / now)); drag.d = now; redraw(); return; }
    view.yaw -= (e.clientX - was[0]) * 0.008; view.pitch = Math.max(-0.1, Math.min(1.4, view.pitch + (e.clientY - was[1]) * 0.006)); redraw(); });
  const up = e => { pts.delete(e.pointerId); if (!pts.size) drag = null; else if (drag) drag.d = 0; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); view.dist = Math.max(0.3, Math.min(120, view.dist * (e.deltaY > 0 ? 1.1 : 0.9))); redraw(); }, { passive: false });
  const grow = el('input', { type: 'range', min: '0.15', max: '1', step: '0.05', value: '1', 'aria-label': 'How grown' }); grow.addEventListener('input', () => { stage = +grow.value; later(false); });

  // ----- controls -----
  const panel = el('div', { class: 'pe-controls' });
  const num = (t, v) => { const rng = el('input', { type: 'range', min: t.min, max: t.max, step: t.step, value: v }), box = el('input', { type: 'number', min: t.min, max: t.max, step: t.step, value: v, 'aria-label': t.label });
    const apply = x => { T.setTrait(spec, t, x); const nv = T.getTrait(spec, t); rng.value = nv; box.value = +(+nv).toFixed(4); later(t.id === 'height' || t.id === 'length' || t.id === 'spread' || t.id === 'leafSize'); };
    rng.addEventListener('input', () => apply(rng.value)); box.addEventListener('change', () => apply(box.value)); return el('div', { class: 'pe-num' }, [rng, box]); };
  function control(t) {
    const v = T.getTrait(spec, t);
    let inp;
    if (t.type === 'num' || t.type === 'int') inp = num(t, v === undefined ? t.def : v);
    else if (t.type === 'color') { inp = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : t.def, 'aria-label': t.label }); inp.addEventListener('input', () => { T.setTrait(spec, t, inp.value); later(false); }); }
    else if (t.type === 'optcolor') { const on = el('input', { type: 'checkbox', checked: !!v, 'aria-label': 'Use ' + t.label }), c = el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(v) ? v : t.def, disabled: !v, 'aria-label': t.label });
      on.addEventListener('change', () => { c.disabled = !on.checked; T.setTrait(spec, t, on.checked ? c.value : ''); later(false); }); c.addEventListener('input', () => { T.setTrait(spec, t, c.value); later(false); }); inp = el('div', { class: 'pe-opt' }, [on, c]); }
    else { inp = el('select', { 'aria-label': t.label }, t.options.map(([k, n]) => el('option', { value: k, text: n }))); inp.value = v || ''; inp.addEventListener('change', () => { T.setTrait(spec, t, inp.value); later(false); if (t.id === 'patKind') drawControls(); }); }
    return el('label', { class: 'pe-row' }, [el('span', { text: t.label }), inp]);
  }
  function drawControls() {
    panel.textContent = '';
    const app = T.applicable(spec);
    for (const g of T.GROUPS) {
      const ts = app.filter(t => t.group === g); if (!ts.length) continue;
      const kids = ts.map(control);
      if (g === 'Fruit' && spec.fruit && spec.fruit.shape) kids.unshift(el('div', { class: 'pe-styles' }, [el('span', { text: 'Quick shape' }), ...T.FRUIT_STYLES.map(([n]) => el('button', { type: 'button', class: 'btn small', text: n, onclick: () => { T.applyFruitStyle(spec, n); later(false); drawControls(); } }))]));
      if (g === 'Size') kids.push(el('div', { class: 'pe-styles' }, [el('button', { type: 'button', class: 'btn small', text: 'New branch pattern', title: 'Same plant, different random branching', onclick: () => { spec.seed = 1 + Math.floor(Math.random() * 900000); later(false); } })]));
      panel.append(el('details', { class: 'pe-group', open: g !== 'Fruit' || true }, [el('summary', { text: g === 'Size' ? 'Size and shape' : g }), ...kids]));
    }
    if (!spec.fruit || !(spec.fruit.count > 0)) panel.append(el('p', { class: 'small muted', text: 'This plant has no fruit in its picture (a tree grown for leaves, or a leaf crop).' }));
    panel.append(el('details', { class: 'pe-group' }, [el('summary', { text: 'Breeding notes' }),
      ...[['mother', 'Seed parent (mother)'], ['father', 'Pollen parent (father)'], ['gen', 'Generation (F1, F2, S3 ...)']].map(([k, label]) => { const i = el('input', { type: 'text', maxlength: k === 'gen' ? '20' : '60', value: meta[k] }); i.addEventListener('input', () => { meta[k] = i.value; dirty = true; }); return el('label', { class: 'pe-row' }, [el('span', { text: label }), i]); }),
      (() => { const ta = el('textarea', { rows: '3', maxlength: '600', 'aria-label': 'Notes' }); ta.value = meta.notes; ta.addEventListener('input', () => { meta.notes = ta.value; dirty = true; }); return el('label', { class: 'pe-row' }, [el('span', { text: 'Notes' }), ta]); })()]));
  }

  // ----- actions -----
  const name = el('input', { type: 'text', maxlength: '60', value: meta.name, 'aria-label': 'Name of this plant' }); name.addEventListener('input', () => { meta.name = name.value; dirty = true; });
  const all = el('input', { type: 'checkbox' });
  const makeRecord = () => { const base = rec || { id: T.newId() }; return T.cleanVariety({ ...base, name: meta.name.trim() || 'My plant', base: baseKey, spec, mother: meta.mother, father: meta.father, gen: meta.gen, notes: meta.notes, made: (rec && rec.made) || new Date().toISOString().slice(0, 10) }); };
  function keep() { let v; try { v = makeRecord(); } catch (e) { toast(e.message || 'Could not keep this plant.'); return null; } if (!v) { toast('Could not keep this plant.'); return null; }
    const items = loadLibrary(); items[v.id] = v; if (!saveLibrary(items)) toast('This device would not store it. Export the plant to keep a copy.'); rec = v; dirty = false; return v; }
  function crossDialog() {
    const lib2 = loadLibrary(), partners = [...Object.values(lib2).filter(v => v.spec.kind === spec.kind && (!rec || v.id !== rec.id)).map(v => ['v:' + v.id, v.name + ' (mine)']), ...defaultPlantList(P).filter(x => x[2] === spec.kind).map(x => ['p:' + x[0], x[1]])];
    if (!partners.length) { toast('No other plant is built the same way to cross with.'); return; }
    const sel = el('select', { 'aria-label': 'Other parent' }, partners.map(([k, n]) => el('option', { value: k, text: n }))), mode = el('select', { 'aria-label': 'Which generation' }, [el('option', { value: 'f1', text: 'F1: a blend of the two' }), el('option', { value: 'f2', text: 'F2: shuffled, like a second generation' })]);
    const msg = el('p', { class: 'small', role: 'status' });
    const dd = dialog('Cross this plant with another', [
      el('p', { text: 'This plant is the seed parent. The result is a picture of a likely offspring, a guess to adjust by hand, not a genetics prediction. Press again for another F2 seedling.' }),
      el('label', { class: 'fld' }, [el('span', { text: 'Pollen parent' }), sel]), el('label', { class: 'fld' }, [el('span', { text: 'Result' }), mode]), msg,
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Make a seedling', onclick: () => {
        const [k, id] = [sel.value.slice(0, 1), sel.value.slice(2)], other = k === 'v' ? lib2[id] : { name: (defaultPlantList(P).find(x => x[0] === id) || [])[1], spec: P.PRESETS[id] };
        try { spec = T.crossSpecs(spec, other.spec, { mode: mode.value }); } catch (e) { msg.textContent = e.message; return; }
        meta.father = other.name || ''; if (!meta.mother) meta.mother = meta.name; meta.gen = mode.value === 'f1' ? 'F1' : 'F2'; if (!/ x /.test(meta.name)) meta.name = (meta.name + ' x ' + meta.father).slice(0, 60); name.value = meta.name; rec = rec ? { ...rec, id: T.newId() } : null; dirty = true; dd.close(); drawControls(); rebuild(); } }),
        el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => dd.close() })])]);
  }
  const buttons = el('div', { class: 'actions' }, [
    opts.onUse ? el('button', { type: 'button', class: 'btn primary', text: 'Use in this plan', onclick: () => { const v = keep(); if (!v) return; d.close(); opts.onUse(v, { all: all.checked }); } }) : null,
    el('button', { type: 'button', class: opts.onUse ? 'btn' : 'btn primary', text: 'Save to My plants', onclick: () => { const v = keep(); if (v) toast('Saved to My plants: ' + v.name); } }),
    el('button', { type: 'button', class: 'btn', text: 'Cross with…', onclick: crossDialog }),
    el('button', { type: 'button', class: 'btn', text: 'Back to the default look', onclick: () => { spec = T.clone(baseSpec); drawControls(); rebuild(); dirty = true; } }),
    el('button', { type: 'button', class: 'btn', text: 'Export…', onclick: () => { try { const v = makeRecord(); downloadText((v.name || 'plant').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') + '.lt-plant.json', JSON.stringify({ format: 'lt-plant-variety', version: 1, variety: v }, null, 1)); } catch (e) { toast(e.message); } } }),
    el('button', { type: 'button', class: 'btn', text: 'Close', onclick: () => { if (!dirty) { d.close(); return; } confirmBox('Close without keeping?', 'You changed this plant. Close and lose the changes?', 'Close', { danger: true }).then(ok => { if (ok) d.close(); }); } })]);
  drawControls();
  d = dialog('Edit a plant' + (opts.cropLabel ? ': ' + opts.cropLabel : ''), [
    el('p', { class: 'small muted', text: 'Starts from the ' + ((defaultPlantList(P).find(x => x[0] === baseKey) || [])[1] || 'default') + ' plant. Change anything, then keep it as your own variety. Your plant is saved as a full copy, so it never changes when the default plants are improved.' }),
    el('div', { class: 'pe-wrap' }, [
      el('div', { class: 'pe-left' }, [el('label', { class: 'pe-row' }, [el('span', { text: 'Name' }), name]), cv, el('label', { class: 'pe-row' }, [el('span', { text: 'How grown' }), grow]), message,
        opts.onUse && opts.cropLabel ? el('label', { class: 'small pl-check' }, [all, ' Use it for every ' + opts.cropLabel.toLowerCase() + ' in this plan']) : null]),
      panel]),
    buttons], { wide: true, onClose: () => { clearTimeout(timer); if (raf) cancelAnimationFrame(raf); if (mesh) mesh.geometry.dispose(); mat.dispose(); r.dispose(); } });
  d.box.classList.add('pe-dlg');
  rebuild();
  return d;
}

/* ---------- My plants (the library) ---------- */
export async function openLibrary({ onEdit, onPick } = {}) {
  const { P, T } = await load();
  const list = el('div', { class: 'pe-list' }), msg = el('p', { class: 'small', role: 'status' });
  let sel = null;
  const draw = () => {
    list.textContent = ''; const items = Object.values(loadLibrary()).sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) list.append(el('p', { class: 'muted', text: 'Nothing here yet. Open a plant in your plan and press "Edit this plant\'s look", or start a new one below.' }));
    for (const v of items) list.append(el('button', { type: 'button', class: 'pe-item' + (sel === v.id ? ' on' : ''), onclick: () => { sel = v.id; draw(); } }, [el('b', { text: v.name }),
      el('small', { text: ((defaultPlantList(P).find(x => x[0] === v.base) || [])[1] || v.base || 'plant') + (v.gen ? ' · ' + v.gen : '') + (v.mother || v.father ? ' · ' + [v.mother, v.father].filter(Boolean).join(' x ') : '') })]));
  };
  const cur = () => loadLibrary()[sel];
  const need = fn => () => { if (!cur()) { msg.textContent = 'Pick one from the list first.'; return; } msg.textContent = ''; fn(cur()); };
  const fresh = () => { const dl = defaultPlantList(P), s = el('select', { 'aria-label': 'Start from' }, dl.map(([k, n]) => el('option', { value: k, text: n }))); s.value = 'tomato';
    const dd = dialog('Start a new plant', [el('label', { class: 'fld' }, [el('span', { text: 'Start from this default plant' }), s]),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Edit it', onclick: () => { dd.close(); d.close(); openPlantEditor({ baseKey: s.value, cropName: dl.find(x => x[0] === s.value)[1].toLowerCase() }); } }), el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => dd.close() })])]); };
  const d = dialog('My plants', [
    el('p', { class: 'small muted', text: 'Your own varieties, kept on this device. A plan carries a copy of each one it uses, so shared plans still look right. Export a plant to keep it safe or move it to another device.' }),
    list, msg,
    el('div', { class: 'actions' }, [
      el('button', { type: 'button', class: 'btn primary', text: 'Edit', onclick: need(v => { d.close(); openPlantEditor({ variety: v, onUse: onPick }); }) }),
      onPick ? el('button', { type: 'button', class: 'btn', text: 'Use in this plan', onclick: need(v => { d.close(); onPick(v, { all: false }); }) }) : null,
      el('button', { type: 'button', class: 'btn', text: 'Copy', onclick: need(v => { const c = T.cleanVariety({ ...v, id: T.newId(), name: (v.name + ' copy').slice(0, 60) }); const items = loadLibrary(); items[c.id] = c; saveLibrary(items); sel = c.id; draw(); }) }),
      el('button', { type: 'button', class: 'btn', text: 'Export', onclick: need(v => downloadText(v.name.replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-') + '.lt-plant.json', JSON.stringify({ format: 'lt-plant-variety', version: 1, variety: v }, null, 1))) }),
      el('button', { type: 'button', class: 'btn', text: 'Import…', onclick: async () => { const f = await pickFile('.json,application/json'); if (!f) return; try { const j = JSON.parse(await f.text()); let v;
        if (j && j.format === 'lt-plant-variety') v = T.cleanVariety(j.variety); else if (j && j.format === 'lt-plant') v = T.cleanVariety({ id: T.newId(), name: f.name.replace(/\.[^.]+$/, ''), spec: j.spec });
        if (!v) throw new Error('This is not a plant file.'); const items = loadLibrary(); if (items[v.id]) v.id = T.newId(); items[v.id] = v; saveLibrary(items); sel = v.id; draw(); msg.textContent = 'Added: ' + v.name; } catch (e) { msg.textContent = e.message || 'This is not a plant file.'; } } }),
      el('button', { type: 'button', class: 'btn danger', text: 'Delete', onclick: need(v => confirmBox('Delete ' + v.name + '?', 'It is removed from My plants on this device. Plans that already use it keep their copy.', 'Delete', { danger: true }).then(ok => { if (!ok) return; const items = loadLibrary(); delete items[v.id]; saveLibrary(items); sel = null; draw(); })) }),
      el('button', { type: 'button', class: 'btn', text: 'New plant…', onclick: fresh })])], { wide: true });
  draw();
  void icon;
  return d;
}
