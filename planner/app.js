/* LT-Planner (first slice): the 2D plan.  Same kit and feel as LT-Print: top bar, Plans menu, undo, tools on the left,
   feature tree and properties on the right.  Plans are saved on this device and as .ltplan files; Drive and Dropbox,
   the 3D view, ground shaping and model import come in later slices (see LT-PLANNER-PLAN.md). */
import { CFG, loadConfig, el, icon, toast, dialog, confirmBox, promptBox, store, gate, REASONS, signInUrl, rootUrl, registerSW } from '../kit/core.js';
import { topBar } from '../kit/bar.js';
import { history } from '../kit/history.js';
import { featureTree } from '../kit/tree.js';
import { downloadText, pickFile, readZipEntry, openProtected } from '../kit/files.js';
import { fold, foldHeadings } from '../kit/fold.js';
import { rowsFromApp } from '../print/model.js';
import * as M from './model.js';
import { DEMOS } from './demos.js';
import { GUIDES, PACKS, COUNTRIES, MESSAGE, ISOLATION, hasGuide, zoneFromLat, sowMonths, monthsText, inSeason } from './guides.js';

const app = document.getElementById('app');
const SVGNS = 'http://www.w3.org/2000/svg';
const K = { doc: 'ltplanner_doc', prefs: 'ltplanner_prefs', lib: 'ltplanner_blocks', places: 'ltplanner_places' };
const S = { plan: null, sel: new Set(), tool: 'select', crop: 'tomato', ctx: null, open: {}, view: null, draft: null, sun: true };
let hist, tree, svg, world, overlay, propsEl, blocksEl, calEl, placesEl, titleEl, undoB, redoB, dateIn, dateLbl, toolBtns = {};

const cropOptions = () => Object.entries(M.CROPS).sort((a, b) => (a[0] === 'other') - (b[0] === 'other') || a[1][0].localeCompare(b[1][0])).map(([k, c]) => el('option', { value: k, text: c[0] }));
const located = () => hasGuide(S.plan.site.country, S.plan.site.zone);
const months = crop => sowMonths(crop, S.plan.site.country, S.plan.site.zone);
const seasonNote = (crop, iso) => (inSeason(crop, S.plan.site.country, S.plan.site.zone, iso) === false ? M.CROPS[crop][0] + ' is usually sown ' + monthsText(months(crop)) + ' in your area. ' : '');
/* shown wherever a guide feature is used without a location; the button opens the plan settings */
const needLocation = () => el('div', { class: 'pl-guide' }, [el('p', { class: 'small pl-warn', text: MESSAGE }),
  el('p', { class: 'small muted', text: S.plan.site.country && !PACKS[S.plan.site.country] ? 'There is no planting guide for ' + (COUNTRIES.find(c => c[0] === S.plan.site.country) || [0, 'this country'])[1] + ' yet.' : 'Set the country and climate zone in the plan settings.' }),
  el('button', { type: 'button', class: 'btn sm', text: 'Plan settings', onclick: () => { S.sel.clear(); drawAll(); } })]);
const sv = (tag, attrs = {}) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v); return n; };
const items = () => (S.ctx ? S.plan.blocks[S.ctx].items : S.plan.items);
const byId = id => items().find(it => it.id === id);
const snap = v => { const g = S.plan.site.grid; return Math.round(v / g) * g; };
const r2 = n => Math.round(n * 100) / 100;

/* ---------- start ---------- */
(async function start() {
  registerSW();
  await loadConfig();
  const g = await gate('planner');
  if (!g.ok) { showGate(g.reason); return; }
  const saved = store.get(K.doc);
  try { S.plan = saved ? M.cleanPlan(saved) : null; } catch { S.plan = null; }
  if (!S.plan) S.plan = DEMOS[0].make();
  const pl = store.get(K.places); S.places = pl && Array.isArray(pl.list) ? pl : { list: [], from: '' };
  build();
  const due = M.dueSoon(S.plan, M.todayISO());
  if (due.length) setTimeout(() => toast((due.length === 1 ? 'Coming up: ' : due.length + ' things coming up, first: ') + due[0].title + ' (' + shortDay(due[0].date) + ')', 6000), g.preview ? 5600 : 800);
  if (g.preview) toast('LT-Planner is not open to everyone yet. You can try it because you are staff.', 5000);
})();

function showGate(reason) {
  const msg = REASONS[reason] || REASONS.error, out = reason === 'signed_out' || reason === 'offline';
  app.textContent = '';
  app.append(topBar({ tool: 'planner' }), el('main', { class: 'gate' }, [
    el('img', { class: 'logo logo-light', src: rootUrl('brand/logo-icon.svg'), alt: '' }), el('img', { class: 'logo logo-dark', src: rootUrl('brand/logo-icon-dark.svg'), alt: '' }),
    el('h1', { text: 'LT-Planner' }),
    el('p', { class: 'muted', text: 'Plan your garden or farm: beds, paths, fences, water and what grows where through the season. Free with a Lineage Tracker account.' }),
    el('div', { class: 'card' }, [el('p', { text: msg }), el('div', { class: 'actions' }, [
      out ? el('a', { class: 'btn primary', href: signInUrl('planner/') }, ['Sign in']) : null,
      out ? el('a', { class: 'btn', href: CFG.SITE + '/register.html' }, ['Create a free account']) : null,
      reason === 'needs_terms' ? el('a', { class: 'btn primary', href: CFG.SITE + '/account.html' }, ['Open my account']) : null,
      el('a', { class: 'btn', href: rootUrl('') }, ['All tools'])]),
    el('p', { class: 'small muted', text: 'Your plans are saved to your own device (and later Google Drive or Dropbox), never to our server.' })]),
  ]));
}

/* ---------- saving ---------- */
let saveTimer = 0;
function autosave() { clearTimeout(saveTimer); saveTimer = setTimeout(() => { if (!store.set(K.doc, S.plan)) toast('This plan is too big to keep in the browser. Download it as a file.', 6000); }, 400); }
function commit(key) { hist.commit(key); autosave(); drawAll(); }
const exportPlan = () => M.pruneBlocks(M.cleanPlan(JSON.parse(JSON.stringify(S.plan))));
const fileName = (ext = M.EXT) => (S.plan.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'plan') + ext;
function loadPlan(p) { if (S.places && S.places.list.length) M.linkPlaces(p, S.places.list); S.plan = p; S.sel.clear(); S.ctx = null; S.view = null; hist.reset(); autosave(); fit(); drawAll(); }

/* ---------- the page ---------- */
function build() {
  hist = history({ snap: () => JSON.stringify(S.plan), restore: s => { S.plan = JSON.parse(s); if (S.ctx && !S.plan.blocks[S.ctx]) S.ctx = null; [...S.sel].forEach(id => { if (!byId(id)) S.sel.delete(id); }); autosave(); drawAll(); }, onChange: st => { undoB.disabled = !st.canUndo; redoB.disabled = !st.canRedo; } });
  const fileBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Plans: new, open, save', title: 'Plans', 'aria-haspopup': 'true' }, [icon('folder')]);
  const fileWrap = el('div', { class: 'kswitch' }, [fileBtn]);
  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; } };
  fileBtn.addEventListener('click', () => {
    if (menu) { closeMenu(); return; }
    const mi = (ic, label, sub, fn) => el('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); fn(); } }, [icon(ic), el('span', {}, [label, sub ? el('small', { text: sub }) : null])]);
    menu = el('div', { class: 'kmenu', role: 'menu', style: 'left:0;right:auto' }, [
      mi('plus', 'New plan', 'Blank, or a demo plan', newDialog),
      mi('folder', 'Open a plan file…', 'A .ltplan file from this device', openFile),
      mi('download', 'Download the plan', 'A .ltplan file to keep or share in your groups', () => downloadText(fileName(), JSON.stringify({ ...exportPlan(), madeWith: 'Powered by Lineage Tracker, free at lineagetracker.org' }))),
      el('div', { class: 'sep' }),
      mi('upload', 'Plan for the app', 'Beds and planned sowings, for the app to import', () => downloadText(fileName('.for-app.json'), JSON.stringify({ ...M.forApp(exportPlan()), madeWith: 'Powered by Lineage Tracker, free at lineagetracker.org' }, null, 1))),
    ]);
    fileWrap.append(menu); menu.querySelector('button').focus();
    const away = e => { if (menu && !menu.contains(e.target) && !fileBtn.contains(e.target)) { closeMenu(); document.removeEventListener('pointerdown', away, true); } };
    document.addEventListener('pointerdown', away, true);
    menu.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); fileBtn.focus(); } });
  });
  undoB = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', disabled: true, onclick: () => hist.undo() }, [icon('undo')]);
  redoB = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', disabled: true, onclick: () => hist.redo() }, [icon('redo')]);
  titleEl = el('span', { class: 'small muted hide-sm pl-title' });
  const slot = el('div', { class: 'pr-slot' }, [fileWrap, undoB, redoB, el('span', { class: 'sp' }), titleEl]);

  /* left: tools, crops, blocks */
  const T = [['select', 'Select', 'up', 'V'], ['bed', 'Bed', 'rect', 'B'], ['area', 'Area', 'grid', 'A'], ['path', 'Path', 'line', 'P'], ['fence', 'Fence', 'line', 'F'],
    ['plant', 'Plant', 'tag', 'L'], ['tank', 'Water tank', 'ellipse', 'W'], ['pipe', 'Drip line', 'line', 'D'], ['bench', 'Seed bench', 'table', 'S'], ['note', 'Note', 'text', 'N'], ['task', 'Job', 'calendar', 'J']];
  const toolGrid = el('div', { class: 'addgrid', role: 'group', 'aria-label': 'Tools' });
  for (const [k, l, ic, key] of T) { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', title: l + ' (' + key + ')', onclick: () => setTool(k) }, [icon(ic), l]); toolBtns[k] = b; toolGrid.append(b); }
  const cropSel = el('select', { 'aria-label': 'Crop for the Plant tool', onchange: e => { S.crop = e.target.value; } }, cropOptions());
  cropSel.value = S.crop;
  blocksEl = el('div');
  const left = el('aside', { class: 'pr-left', 'aria-label': 'Tools and blocks' }, [
    el('h3', { text: 'Draw' }), toolGrid,
    el('p', { class: 'small muted', text: 'Beds, areas, tanks and benches: drag a box. Paths, fences and drip lines: tap each corner, double-tap or Enter to finish.' }),
    el('h3', { text: 'Plant tool' }), el('label', { class: 'small' }, ['Crop', cropSel]),
    el('h3', { text: 'Blocks' }), blocksEl,
    el('h3', { text: 'Coming up' }), calEl = el('div'),
    el('h3', { text: 'From the app' }), placesEl = el('div')]);
  foldHeadings(left, 'planner-left', { closed: ['From the app'] });

  /* centre: the plan */
  dateIn = el('input', { type: 'range', min: '0', max: '364', 'aria-label': 'Date the plan shows', class: 'pl-date' });
  dateLbl = el('span', { class: 'small pl-datelbl' });
  dateIn.addEventListener('input', () => { S.plan.date = isoFromDay(+dateIn.value); drawScene(); });
  dateIn.addEventListener('change', () => commit('date'));
  const sunB = el('button', { type: 'button', class: 'icon-btn', 'aria-pressed': 'true', 'aria-label': 'Show the sun path', title: 'Sun path', onclick: () => { S.sun = !S.sun; sunB.setAttribute('aria-pressed', String(S.sun)); drawAll(); } }, [icon('info')]);
  const stageBar = el('div', { class: 'stage-bar' }, [
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.25) }, [icon('zoomOut')]),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.25) }, [icon('zoomIn')]),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fit the plan', onclick: () => { fit(); drawAll(); } }, [icon('fit')]),
    sunB, el('span', { class: 'grow' }), icon('calendar'), dateIn, dateLbl]);
  svg = sv('svg', { class: 'pl-svg', role: 'img', 'aria-label': 'The plan, seen from above', tabindex: '0' });
  world = sv('g'); overlay = sv('g'); svg.append(world, overlay);
  const stage = el('div', { class: 'pr-stage' }, [stageBar, el('div', { class: 'pr-canvas pl-canvas' }, [svg])]);

  /* right: tree and properties */
  const treeBox = el('div');
  propsEl = el('div');
  const right = el('aside', { class: 'pr-right', 'aria-label': 'Feature tree and properties' }, [
    el('div', { class: 'pane tree-pane' }, [(() => { const f = fold('planner', 'Feature tree', true); f.body.append(treeBox); return f.box; })()]),
    el('div', { class: 'pane props-pane' }, [propsEl])]);
  const mob = el('nav', { class: 'pl-mob' }, [el('button', { type: 'button', class: 'btn', text: 'Tools', onclick: () => document.body.classList.toggle('show-left') }), el('button', { type: 'button', class: 'btn', text: 'Tree and details', onclick: () => document.body.classList.toggle('show-right') })]);
  app.textContent = '';
  app.append(el('div', { class: 'pr-shell' }, [topBar({ tool: 'planner', slot }), el('div', { class: 'pr-view' }, [left, stage, right]), mob]));

  tree = featureTree(treeBox, {
    label: 'Feature tree', empty: 'Nothing in this plan yet. Pick a tool on the left.',
    nodes: treeNodes, isSelected: id => S.sel.has(id),
    iconFor: n => (n.children ? 'folder' : { task: 'calendar', bed: 'rect', area: 'grid', path: 'line', fence: 'line', pipe: 'line', plant: 'tag', tank: 'ellipse', bench: 'table', note: 'text', block: 'group' }[n.kind] || 'rect'),
    onSelect: (id, add) => { if (id.startsWith('f:')) return; select(id, add); },
    onToggle: (id, flag) => {
      const list = id.startsWith('f:') ? items().filter(it => it.folder === id.slice(2)) : [byId(id)].filter(Boolean);
      if (!list.length) return; const v = !list.every(it => it[flag]); list.forEach(it => { it[flag] = v; }); commit();
    },
    onRename: (id, name) => { const it = byId(id); if (it) { it.name = name.slice(0, 60); commit(); } },
    onOpen: (id, open) => { S.open[id] = open; tree.render(); },
    onNudge: (id, d) => { const L = items(), i = L.findIndex(x => x.id === id); const j = i - d; if (i < 0 || j < 0 || j >= L.length) return; [L[i], L[j]] = [L[j], L[i]]; commit(); },
    onMove: (id, target, where) => {
      const L = items(), it = byId(id); if (!it) return;
      if (target.startsWith('f:')) { it.folder = target.slice(2); L.splice(L.indexOf(it), 1); L.push(it); commit(); return; }
      const t = byId(target); if (!t || t === it) return;
      L.splice(L.indexOf(it), 1); it.folder = t.folder;
      // the tree lists the front first, so "before" in the tree means later in the drawing order
      L.splice(L.indexOf(t) + (where === 'before' ? 1 : 0), 0, it); commit();
    },
  });
  wireCanvas();
  wireKeys();
  new ResizeObserver(() => { if (!S.view) fit(); drawScene(); }).observe(svg.parentElement);
  setTool('select');
  fit(); drawAll();
}
const treeNodes = () => M.FOLDERS.map(([k, label]) => {
  const kids = items().filter(it => it.folder === k).slice().reverse().map(it => ({ id: it.id, name: it.name, kind: it.kind, hidden: it.hidden, locked: it.locked, off: it.off, note: it.kind === 'block' ? 'block' : it.kind === 'plant' && it.sow ? shortDay(it.sow) : '' }));
  const f = 'f:' + k;
  return { id: f, name: label, kind: 'folder', children: kids, open: S.open[f] !== false && (kids.length > 0 || S.open[f] === true), hidden: kids.length > 0 && kids.every(x => x.hidden), locked: kids.length > 0 && kids.every(x => x.locked), off: kids.length > 0 && kids.every(x => x.off) };
}).filter(f => f.children.length || ['beds', 'planting', 'structures'].includes(f.id.slice(2)));

/* ---------- dates ---------- */
const yearOf = () => +S.plan.date.slice(0, 4);
const dayOf = iso => Math.max(0, Math.min(364, Math.round((Date.parse(iso + 'T00:00:00Z') - Date.UTC(yearOf(), 0, 1)) / 86400000)));
const isoFromDay = n => new Date(Date.UTC(yearOf(), 0, 1) + n * 86400000).toISOString().slice(0, 10);
const shortDay = iso => new Date(iso + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/* ---------- view: pan and zoom (scale = pixels per metre) ---------- */
function fit() {
  const box = svg.parentElement.getBoundingClientRect(), { w, h } = S.plan.site, pad = 40;
  const scale = Math.max(4, Math.min((box.width - pad * 2) / w, (box.height - pad * 2) / h));
  S.view = { scale, x: (box.width - w * scale) / 2, y: (box.height - h * scale) / 2 };
}
function zoomBy(f, cx, cy) {
  const box = svg.getBoundingClientRect(); cx = cx ?? box.width / 2; cy = cy ?? box.height / 2;
  const v = S.view, ns = Math.max(2, Math.min(800, v.scale * f));
  v.x = cx - ((cx - v.x) * ns) / v.scale; v.y = cy - ((cy - v.y) * ns) / v.scale; v.scale = ns; drawScene();
}
const toWorld = e => { const b = svg.getBoundingClientRect(), v = S.view; return [(e.clientX - b.left - v.x) / v.scale, (e.clientY - b.top - v.y) / v.scale]; };

/* ---------- drawing ---------- */
const COL = { bed: '#9C6B3F', bedFill: '#E9D3B5', path: '#CBBFA8', fence: '#5B4632', pipe: '#2F7FC1', tank: '#7FB3DA', bench: '#B9A27F', plant: { upright: '#4E8F3A', bush: '#6BA34A', vine: '#8DAA2F', tree: '#2F6B2B', root: '#B07A2A', grass: '#A3B84A' } };
function drawItem(g, it, plan, faded) {
  if (it.off || it.hidden) return;
  const k = M.KINDS[it.kind];
  const grp = sv('g', { 'data-id': it.id, opacity: faded ? 0.35 : null });
  if (k.box) {
    const tf = `translate(${it.x} ${it.y}) rotate(${it.rot})`;
    const fill = it.kind === 'bed' ? COL.bedFill : it.kind === 'area' ? it.fill : it.kind === 'tank' ? COL.tank : COL.bench;
    const stroke = it.kind === 'bed' ? COL.bed : it.kind === 'area' ? 'none' : '#4A5A6A';
    const shape = it.kind === 'tank' ? sv('ellipse', { rx: it.w / 2, ry: it.h / 2 }) : sv('rect', { x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, rx: it.kind === 'bed' ? Math.min(0.08, it.w / 10) : 0 });
    shape.setAttribute('transform', tf); shape.setAttribute('fill', fill); shape.setAttribute('stroke', stroke); shape.setAttribute('stroke-width', it.kind === 'bed' && it.raised > 0 ? 3 : 1.5); shape.setAttribute('vector-effect', 'non-scaling-stroke');
    grp.append(shape);
    if (it.kind !== 'area' || it.w * S.view.scale > 60) grp.append(label(it.name, it.x, it.y + (it.kind === 'area' ? 0 : it.h / 2 + 0.05), it.kind === 'area'));
  } else if (k.line) {
    const d = 'M' + it.pts.map(p => p.join(' ')).join('L');
    if (it.kind === 'path') grp.append(sv('path', { d, fill: 'none', stroke: COL.path, 'stroke-width': it.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (it.kind === 'fence') { grp.append(sv('path', { d, fill: 'none', stroke: COL.fence, 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke' })); it.pts.forEach(p => grp.append(sv('rect', { x: p[0] - 0.06, y: p[1] - 0.06, width: 0.12, height: 0.12, fill: COL.fence }))); }
    if (it.kind === 'pipe') grp.append(sv('path', { d, fill: 'none', stroke: COL.pipe, 'stroke-width': 2, 'stroke-dasharray': '6 4', 'vector-effect': 'non-scaling-stroke' }));
    grp.append(sv('path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(0.4, it.width || 0), class: 'hit' }));
  } else if (it.kind === 'plant') {
    const gr = M.growth(it, plan.date);
    if (gr === null && !faded) { grp.setAttribute('opacity', 0.25); }
    const r = (it.spread / 2) * (gr ?? 1), c = COL.plant[it.shape] || COL.plant.bush;
    grp.append(sv('circle', { cx: it.x, cy: it.y, r: Math.max(0.03, r), fill: c, 'fill-opacity': 0.55, stroke: c, 'stroke-width': 1.2, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': it.shape === 'vine' ? '4 3' : null }));
    grp.append(sv('circle', { cx: it.x, cy: it.y, r: Math.max(0.02, Math.min(0.06, r / 3)), fill: c }));
    if (!faded && it.save && items().includes(it)) grp.append(sv('circle', { cx: it.x, cy: it.y, r: Math.max(0.05, r * 0.45), fill: 'none', stroke: '#7A4FB5', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke', class: 'pl-seed' }));
    if (!faded && items().length < 600 && items().includes(it) && (it.save || items().some(o => o.save)) && M.crossRisks(items(), it).length) grp.append(sv('circle', { cx: it.x, cy: it.y, r: Math.max(0.1, r) + 7 / S.view.scale, fill: 'none', stroke: '#7A4FB5', 'stroke-width': 2.5, 'stroke-dasharray': '1 3', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', class: 'pl-cross-ring' }));
    if (gr !== null && !faded && items().length < 600 && items().includes(it) && M.rotationIssues(items(), it).length) grp.append(sv('rect', { x: it.x - Math.max(0.08, r) - 3 / S.view.scale, y: it.y - Math.max(0.08, r) - 3 / S.view.scale, width: 2 * (Math.max(0.08, r) + 3 / S.view.scale), height: 2 * (Math.max(0.08, r) + 3 / S.view.scale), fill: 'none', stroke: '#C0602A', 'stroke-width': 1.5, 'stroke-dasharray': '4 2', 'vector-effect': 'non-scaling-stroke', class: 'pl-rot' }));
    if (gr !== null && !faded && items().length < 600 && items().includes(it) && M.neighbours(items(), it, plan.date).avoid.length) grp.append(sv('circle', { cx: it.x, cy: it.y, r: Math.max(0.08, r) + 4 / S.view.scale, fill: 'none', stroke: '#C0392B', 'stroke-width': 2, 'stroke-dasharray': '3 2', 'vector-effect': 'non-scaling-stroke', class: 'pl-clash' }));
  } else if (it.kind === 'task') {
    const s = 9 / S.view.scale;
    grp.append(sv('rect', { x: it.x - s, y: it.y - s, width: s * 2, height: s * 2, rx: s / 3, fill: '#5A3E8C' }), sv('path', { d: `M${it.x - s / 2} ${it.y}l${s / 3} ${s / 3} ${s * 0.7} ${-s * 0.7}`, stroke: '#fff', 'stroke-width': 2, fill: 'none', 'vector-effect': 'non-scaling-stroke' }));
    grp.append(label((it.every ? '↻ ' : '') + (it.text || it.name), it.x, it.y + s, false, true));
  } else if (it.kind === 'note') {
    grp.append(label(it.text || it.name, it.x, it.y, false, true));
  } else if (it.kind === 'block') {
    const sub = sv('g'); M.blockItems(plan, it).forEach(p => drawItem(sub, p, plan, faded)); grp.append(sub);
    const b = M.bounds(it, plan); grp.append(sv('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], fill: 'none', stroke: '#8E6BBF', 'stroke-width': 1, 'stroke-dasharray': '2 3', 'vector-effect': 'non-scaling-stroke' }));
  }
  g.append(grp);
}
function label(text, x, y, centre, note) {
  const fs = 12 / S.view.scale;
  const t = sv('text', { x, y: centre ? y : y + fs, 'font-size': fs, 'stroke-width': 3 / S.view.scale, 'text-anchor': 'middle', 'dominant-baseline': centre ? 'middle' : 'auto', class: 'pl-label' + (note ? ' note' : '') });
  t.textContent = String(text).slice(0, 60); return t;
}
/* drawAll: the plan and every panel.  drawScene: only the plan (while dragging, panning and zooming, so the tree keeps focus). */
function drawAll() { if (!S.view || !svg) return; drawScene(); tree.render(); drawProps(); drawBlocks(); drawCal(); drawPlaces(); }
function drawScene() {
  if (!S.view || !svg) return;
  const v = S.view, { w, h } = S.plan.site;
  world.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.scale})`);
  world.textContent = ''; overlay.textContent = '';
  // ground and grid (major line every 5 m, or 1 m when zoomed in)
  world.append(sv('rect', { x: 0, y: 0, width: w, height: h, class: 'pl-ground' }));
  const step = v.scale > 40 ? 1 : v.scale > 8 ? 5 : 10, gp = sv('path', { class: 'pl-grid', 'vector-effect': 'non-scaling-stroke' }); let d = '';
  for (let x = step; x < w; x += step) d += `M${x} 0V${h}`; for (let y = step; y < h; y += step) d += `M0 ${y}H${w}`;
  gp.setAttribute('d', d); world.append(gp);
  const editing = S.ctx ? S.plan.blocks[S.ctx] : null;
  if (editing) { S.plan.items.forEach(it => drawItem(world, it, S.plan, true)); world.append(sv('rect', { x: -1000, y: -1000, width: 3000, height: 3000, fill: 'var(--desk)', opacity: 0.55 })); }
  items().forEach(it => drawItem(world, it, S.plan, false));
  // selection
  for (const id of S.sel) {
    const it = byId(id); if (!it) continue;
    const b = M.bounds(it, S.plan);
    world.append(sv('rect', { x: b[0], y: b[1], width: b[2] - b[0], height: b[3] - b[1], class: 'pl-sel', 'vector-effect': 'non-scaling-stroke' }));
    if (S.sel.size === 1 && !it.locked) handlesFor(it).forEach(hd => world.append(sv('rect', { x: hd.x - 6 / v.scale, y: hd.y - 6 / v.scale, width: 12 / v.scale, height: 12 / v.scale, class: 'pl-handle', 'data-handle': hd.k })));
  }
  // drawing in progress
  if (S.draft) {
    const dr = S.draft;
    if (dr.box) world.append(sv('rect', { x: Math.min(dr.a[0], dr.b[0]), y: Math.min(dr.a[1], dr.b[1]), width: Math.abs(dr.b[0] - dr.a[0]), height: Math.abs(dr.b[1] - dr.a[1]), class: 'pl-draft', 'vector-effect': 'non-scaling-stroke' }));
    if (dr.pts) world.append(sv('path', { d: 'M' + dr.pts.concat(dr.hover ? [dr.hover] : []).map(p => p.join(' ')).join('L'), class: 'pl-draft', fill: 'none', 'vector-effect': 'non-scaling-stroke' }));
  }
  drawCompass();
  dateIn.value = String(dayOf(S.plan.date)); dateLbl.textContent = new Date(S.plan.date + 'T00:00:00Z').toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  titleEl.textContent = S.plan.name + (editing ? ' · editing block "' + editing.name + '"' : '');
  syncHash();
}
/* north arrow and the sun's path for the day, in the corner */
function drawCompass() {
  const b = svg.getBoundingClientRect(), cx = b.width - 70, cy = 70, R = 48, north = S.plan.site.north;
  const g = sv('g', { class: 'pl-compass', transform: `translate(${cx} ${cy})` });
  g.append(sv('circle', { r: R, class: 'ring' }));
  const at = (az, rr) => { const a = ((az + north) * Math.PI) / 180; return [Math.sin(a) * rr, -Math.cos(a) * rr]; };
  const [nx, ny] = at(0, R - 6); g.append(sv('line', { x1: 0, y1: 0, x2: nx, y2: ny, class: 'needle' }));
  const nt = sv('text', { x: at(0, R + 10)[0], y: at(0, R + 10)[1] + 4, 'text-anchor': 'middle', class: 'nlabel' }); nt.textContent = 'N'; g.append(nt);
  if (S.sun && !S.plan.site.country) { const t = sv('text', { x: 0, y: R + 26, 'text-anchor': 'middle', class: 'sunlbl' }); t.textContent = 'Set a location for the sun'; g.append(t); }
  if (S.sun && S.plan.site.country) {
    const path = M.sunPath(S.plan.date, S.plan.site.lat);
    if (path.length) {
      const pts = path.map(s => at(s.az, R * (1 - s.el / 110)));
      g.append(sv('path', { d: 'M' + pts.map(p => p.map(n => n.toFixed(1)).join(' ')).join('L'), class: 'sunpath' }));
      const noon = path.reduce((a, s) => (s.el > a.el ? s : a)); const [sx, sy] = at(noon.az, R * (1 - noon.el / 110));
      g.append(sv('circle', { cx: sx, cy: sy, r: 6, class: 'sun' }));
      const t = sv('text', { x: 0, y: R + 26, 'text-anchor': 'middle', class: 'sunlbl' }); t.textContent = `Sun ${Math.round(noon.el)}° at midday`; g.append(t);
    }
  }
  overlay.append(g);
}
function handlesFor(it) {
  const k = M.KINDS[it.kind];
  if (k.box) { const [x, y] = M.rotPt([it.w / 2, it.h / 2], it.rot); return [{ k: 'size', x: it.x + x, y: it.y + y }]; }
  if (k.line) return it.pts.map((p, i) => ({ k: 'pt' + i, x: p[0], y: p[1] }));
  return [];
}

/* ---------- tools and pointer ---------- */
function setTool(t) {
  S.tool = t; S.draft = null;
  Object.entries(toolBtns).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === t)));
  svg.style.cursor = t === 'select' ? 'default' : 'crosshair'; drawAll();
}
function hitTest(p) {
  const L = items();
  for (let i = L.length - 1; i >= 0; i--) {
    const it = L[i]; if (it.hidden || it.off) continue;
    const k = M.KINDS[it.kind];
    if (k.box) { const [x, y] = M.rotPt([p[0] - it.x, p[1] - it.y], -it.rot); if (Math.abs(x) <= it.w / 2 && Math.abs(y) <= it.h / 2) return it; }
    else if (k.line) { const tol = Math.max((it.width || 0) / 2, 8 / S.view.scale); for (let j = 1; j < it.pts.length; j++) if (segDist(p, it.pts[j - 1], it.pts[j]) <= tol) return it; }
    else { const b = M.bounds(it, S.plan); if (p[0] >= b[0] && p[0] <= b[2] && p[1] >= b[1] && p[1] <= b[3]) return it; }
  }
  return null;
}
function segDist(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1], l = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l)); return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy); }
function select(id, add) { if (!add) S.sel.clear(); if (id) { if (add && S.sel.has(id)) S.sel.delete(id); else S.sel.add(id); } drawAll(); }

function wireCanvas() {
  const pointers = new Map(); let drag = null, pinch = null;
  svg.addEventListener('pointerdown', e => {
    svg.focus(); svg.setPointerCapture(e.pointerId); pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: S.view.scale }; drag = null; return; }
    const p = toWorld(e), sp = [snap(p[0]), snap(p[1])];
    if (e.button === 1 || (e.button === 0 && e.altKey)) { drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y }; return; }
    const hd = e.target.getAttribute && e.target.getAttribute('data-handle');
    if (S.tool === 'select') {
      if (hd) { const it = byId([...S.sel][0]); drag = { handle: hd, it, start: JSON.stringify(it) }; return; }
      const it = hitTest(p);
      if (!it) { if (!e.shiftKey) select(null); drag = { pan: true, sx: e.clientX, sy: e.clientY, vx: S.view.x, vy: S.view.y }; return; }
      if (!S.sel.has(it.id) || e.shiftKey) select(it.id, e.shiftKey);
      const moving = [...S.sel].map(byId).filter(x => x && !x.locked);
      drag = { move: true, from: p, last: [0, 0], moving };
      return;
    }
    const kind = M.KINDS[S.tool];
    if (kind.box) { S.draft = { box: true, a: sp, b: sp }; drag = { draw: true }; drawAll(); return; }
    if (kind.line) {
      if (!S.draft) S.draft = { pts: [sp] };
      else { const last = S.draft.pts[S.draft.pts.length - 1]; if (Math.hypot(sp[0] - last[0], sp[1] - last[1]) < 0.01) finishLine(); else S.draft.pts.push(sp); }
      drawAll(); return;
    }
    if (S.tool === 'plant') { const c = M.CROPS[S.crop], warn = seasonNote(S.crop, S.plan.date); if (warn) toast(warn + 'Check your local guide.', 5000); add({ kind: 'plant', name: c[0], x: r2(p[0]), y: r2(p[1]), crop: S.crop, shape: c[1], spread: c[2], height: c[3], sow: S.plan.date, harvest: c[4] ? isoPlus(S.plan.date, c[4]) : '' }); return; }
    if (S.tool === 'task') { promptBox('Job', 'What needs doing here? (it goes on the calendar for ' + shortDay(S.plan.date) + '; change the date and repeat in the details)', '', { max: 200 }).then(t => { if (t) add({ kind: 'task', name: t.slice(0, 60), x: r2(p[0]), y: r2(p[1]), text: t, date: S.plan.date, every: '', remind: 1 }); }); return; }
    if (S.tool === 'note') { promptBox('Note', 'What should it say?', '', { max: 300 }).then(t => { if (t) add({ kind: 'note', name: 'Note', x: r2(p[0]), y: r2(p[1]), text: t }); }); }
  });
  svg.addEventListener('pointermove', e => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), bx = svg.getBoundingClientRect(); zoomBy((pinch.s * d / pinch.d) / S.view.scale, (a[0] + b[0]) / 2 - bx.left, (a[1] + b[1]) / 2 - bx.top); return; }
    const p = toWorld(e);
    if (S.draft && S.draft.pts && !drag) { S.draft.hover = [snap(p[0]), snap(p[1])]; drawScene(); return; }
    if (!drag) return;
    if (drag.pan) { S.view.x = drag.vx + e.clientX - drag.sx; S.view.y = drag.vy + e.clientY - drag.sy; drawScene(); return; }
    if (drag.draw) { S.draft.b = [snap(p[0]), snap(p[1])]; drawScene(); return; }
    if (drag.move) {
      const dx = snap(p[0] - drag.from[0]), dy = snap(p[1] - drag.from[1]);
      if (dx === drag.last[0] && dy === drag.last[1]) return;
      drag.moving.forEach(it => M.moveItem(it, dx - drag.last[0], dy - drag.last[1])); drag.last = [dx, dy]; drag.moved = true; drawScene(); return;
    }
    if (drag.handle) {
      const it = drag.it;
      if (drag.handle === 'size') { const [x, y] = M.rotPt([p[0] - it.x, p[1] - it.y], -it.rot); it.w = Math.max(0.1, snap(Math.abs(x) * 2)); it.h = Math.max(0.1, snap(Math.abs(y) * 2)); }
      else { const i = +drag.handle.slice(2); it.pts[i] = [snap(p[0]), snap(p[1])]; }
      drag.moved = true; drawScene();
    }
  });
  const up = e => {
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null;
    if (!drag) return;
    const d = drag; drag = null;
    if (d.draw) {
      const dr = S.draft; S.draft = null;
      let [x0, y0] = dr.a, [x1, y1] = dr.b;
      if (Math.abs(x1 - x0) < 0.1 || Math.abs(y1 - y0) < 0.1) { const def = { bed: [2.4, 1.2], area: [4, 3], tank: [1.4, 1.4], bench: [2, 0.6] }[S.tool]; x1 = x0 + def[0]; y1 = y0 + def[1]; }
      add({ kind: S.tool, name: M.KINDS[S.tool].name, x: r2((x0 + x1) / 2), y: r2((y0 + y1) / 2), w: r2(Math.abs(x1 - x0)), h: r2(Math.abs(y1 - y0)), rot: 0 });
      return;
    }
    if ((d.move || d.handle) && d.moved) commit();
  };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('dblclick', () => { if (S.draft && S.draft.pts) finishLine(); else if (S.sel.size === 1) { const it = byId([...S.sel][0]); if (it && it.kind === 'block') editBlock(it.def); } });
  svg.addEventListener('wheel', e => { e.preventDefault(); const b = svg.getBoundingClientRect(); zoomBy(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - b.left, e.clientY - b.top); }, { passive: false });
}
const isoPlus = (iso, days) => new Date(Date.parse(iso + 'T00:00:00Z') + days * 86400000).toISOString().slice(0, 10);
function finishLine() {
  const dr = S.draft; S.draft = null;
  const pts = dr.pts.filter((p, i) => i === 0 || Math.hypot(p[0] - dr.pts[i - 1][0], p[1] - dr.pts[i - 1][1]) > 0.01);
  if (pts.length < 2) { drawAll(); return; }
  add({ kind: S.tool, name: M.KINDS[S.tool].name, pts });
}
function add(raw) {
  const it = M.cleanPlan({ format: M.FORMAT, version: 1, items: [Object.assign({ id: M.newId(), folder: M.KINDS[raw.kind].folder }, raw)] }).items[0];
  if (!it) return;
  items().push(it); S.sel = new Set([it.id]); commit();
}

/* ---------- keyboard ---------- */
function wireKeys() {
  document.addEventListener('keydown', e => {
    if (e.target.closest && e.target.closest('input,select,textarea,[contenteditable]') || document.querySelector('dialog[open]')) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); hist.redo(); return; }
    if (mod && k === 'd') { e.preventDefault(); duplicate(); return; }
    if (mod && k === 'b') { e.preventDefault(); makeBlockFromSel(); return; }
    if (e.key === 'Escape') { if (S.draft) { S.draft = null; drawAll(); } else if (S.ctx) doneEditing(); else select(null); return; }
    if (e.key === 'Enter' && S.draft && S.draft.pts) { finishLine(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel.size) { e.preventDefault(); removeSel(); return; }
    if (e.key.startsWith('Arrow') && S.sel.size) {
      e.preventDefault(); const g = S.plan.site.grid * (e.shiftKey ? 5 : 1), d = { ArrowLeft: [-g, 0], ArrowRight: [g, 0], ArrowUp: [0, -g], ArrowDown: [0, g] }[e.key];
      [...S.sel].map(byId).filter(it => it && !it.locked).forEach(it => M.moveItem(it, d[0], d[1])); commit('nudge'); return;
    }
    if (!mod && !e.altKey) { const t = { v: 'select', b: 'bed', a: 'area', p: 'path', f: 'fence', l: 'plant', w: 'tank', d: 'pipe', s: 'bench', n: 'note', j: 'task' }[k]; if (t) setTool(t); }
  });
}
function removeSel() { const L = items(); const keep = L.filter(it => !S.sel.has(it.id) || it.locked); L.length = 0; L.push(...keep); S.sel.clear(); commit(); }
function duplicate() {
  const L = items(), copies = [...S.sel].map(byId).filter(Boolean).map(it => M.moveItem(Object.assign(JSON.parse(JSON.stringify(it)), { id: M.newId(), locked: false }), S.plan.site.grid * 2, S.plan.site.grid * 2));
  if (!copies.length) return; L.push(...copies); S.sel = new Set(copies.map(c => c.id)); commit();
}

/* ---------- blocks ---------- */
async function makeBlockFromSel() {
  if (S.ctx) { toast('Finish editing this block first.'); return; }
  const ids = [...S.sel]; if (!ids.length) { toast('Select the items to merge first (Shift adds to the selection).'); return; }
  const name = await promptBox('Make a block', 'Name of the block', ids.length === 1 ? byId(ids[0]).name : 'Garden bed', { max: 60 }); if (!name) return;
  const ins = M.makeBlock(S.plan, ids, name); if (!ins) return;
  S.sel = new Set([ins.id]); commit(); toast('Block made. Copy it with Ctrl+D; double-click a copy to edit every copy at once.');
}
function editBlock(defId) { if (!S.plan.blocks[defId]) return; S.ctx = defId; S.sel.clear(); setTool('select'); toast('Editing the block: every copy changes. Press Done (or Esc) when finished.'); }
function doneEditing() { S.ctx = null; S.sel.clear(); drawAll(); }
function insertBlock(defId) {
  if (S.ctx && !M.canPlace(S.plan, defId, S.ctx)) { toast('A block cannot go inside itself.'); return; }
  const b = svg.getBoundingClientRect(), v = S.view, x = snap((b.width / 2 - v.x) / v.scale), y = snap((b.height / 2 - v.y) / v.scale);
  const ins = { id: M.newId(), kind: 'block', folder: 'beds', name: S.plan.blocks[defId].name, hidden: false, locked: false, off: false, def: defId, x, y, rot: 0 };
  items().push(ins); S.sel = new Set([ins.id]); commit();
}
const library = () => { const l = store.get(K.lib, []); return Array.isArray(l) ? l : []; };
function saveToLibrary(defId) {
  const d = S.plan.blocks[defId]; if (!d) return;
  // keep blocks it uses too, so it works on its own in another plan
  const sub = { format: M.FORMAT, version: 1, items: [{ id: 'x', kind: 'block', def: defId, x: 0, y: 0 }], blocks: S.plan.blocks };
  const one = M.pruneBlocks(M.cleanPlan(JSON.parse(JSON.stringify(sub))));
  const lib = library().filter(b => b.name !== d.name); lib.unshift({ name: d.name, root: defId, blocks: one.blocks, saved: Date.now() });
  if (store.set(K.lib, lib.slice(0, 60))) toast('Saved to your block library on this device.'); else toast('The block library is full on this device. Download the block instead.');
}
function fromLibrary(entry) {
  try {
    const p = M.cleanPlan({ format: M.FORMAT, version: 1, items: [{ id: 'x', kind: 'block', def: entry.root, x: 0, y: 0 }], blocks: entry.blocks });
    const map = {}; for (const k of Object.keys(p.blocks)) map[k] = M.newId();
    for (const [k, d] of Object.entries(p.blocks)) S.plan.blocks[map[k]] = { name: d.name, items: d.items.map(it => (it.kind === 'block' ? Object.assign(it, { def: map[it.def] }) : it)) };
    insertBlock(map[entry.root]);
  } catch { toast('That block could not be read.'); }
}
function drawBlocks() {
  blocksEl.textContent = '';
  const defs = Object.entries(S.plan.blocks);
  if (S.ctx) blocksEl.append(el('div', { class: 'notice' }, [el('p', { text: 'Editing "' + S.plan.blocks[S.ctx].name + '". Changes show in every copy.' }), el('button', { type: 'button', class: 'btn primary', text: 'Done', onclick: doneEditing })]));
  if (!defs.length) blocksEl.append(el('p', { class: 'small muted', text: 'Select items (Shift adds) and press Make block (Ctrl+B) to merge them into one piece you can copy and move around.' }));
  for (const [id, d] of defs) {
    const n = M.copiesOf(S.plan, id);
    blocksEl.append(el('div', { class: 'pl-block' }, [el('b', { text: d.name }), el('small', { class: 'muted', text: n + (n === 1 ? ' copy' : ' copies') }),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Place', onclick: () => insertBlock(id) }), el('button', { type: 'button', class: 'btn sm', text: 'Edit', onclick: () => editBlock(id) }), el('button', { type: 'button', class: 'btn sm', text: 'Keep', title: 'Save to your block library on this device', onclick: () => saveToLibrary(id) })])]));
  }
  const lib = library();
  if (lib.length) {
    blocksEl.append(el('h3', { text: 'My block library' }));
    lib.forEach(b => blocksEl.append(el('div', { class: 'pl-block' }, [el('b', { text: b.name }), el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Place in this plan', onclick: () => fromLibrary(b) }), el('button', { type: 'button', class: 'btn sm', text: 'Remove', onclick: () => { store.set(K.lib, library().filter(x => x !== b && x.name !== b.name)); drawBlocks(); } })])])));
  }
}

/* ---------- properties ---------- */
function field(label, value, set, attrs = {}) {
  const inp = el('input', Object.assign({ value: value ?? '' }, attrs));
  inp.addEventListener('change', () => { set(attrs.type === 'number' ? Number(inp.value) : inp.value); commit(); });
  return el('label', { class: 'small pl-field' }, [label, inp]);
}
const numF = (label, it, key, step = 0.1, min = -10000, max = 10000) => field(label, it[key], v => { if (Number.isFinite(v)) it[key] = Math.min(max, Math.max(min, Math.round(v * 1000) / 1000)); }, { type: 'number', step: String(step), min: String(min), max: String(max), inputmode: 'decimal' });
let cur = null, pend = null;
const section = (title, open = true) => { pend = { title, open }; };
const sec = (title, open = true) => () => section(title, open);
const topLevel = () => { cur = propsEl; pend = null; };
/* put: add to the properties panel. null and false are skipped; a section marker starts a new expandable section (made only when something goes in it). */
const put = (...n) => {
  for (const x of n) {
    if (x == null || x === false) continue;
    if (typeof x === 'function') { x(); continue; }
    if (pend) { const f = fold('planner', pend.title, pend.open); propsEl.append(f.box); cur = f.body; pend = null; }
    (cur || propsEl).append(x);
  }
};
function drawProps() {
  propsEl.textContent = ''; topLevel();
  const sel = [...S.sel].map(byId).filter(Boolean);
  if (!sel.length) {
    const s = S.plan.site;
    put(el('div', { class: 'pane-head' }, [el('h3', { text: 'Plan' })]),
      field('Name', S.plan.name, v => { S.plan.name = String(v).slice(0, 80) || 'My plan'; }, { maxlength: '80' }),
      sec('Size and north'),
      el('div', { class: 'pl-row' }, [numF('Width (m)', s, 'w', 1, 1, 5000), numF('Depth (m)', s, 'h', 1, 1, 5000)]),
      numF('North points (degrees, 0 = up)', s, 'north', 5, -360, 360),
      sec('Location and planting guide'),
      el('label', { class: 'small pl-field' }, ['Country (for the planting guide)', (() => { const sl = el('select', { onchange: e => { s.country = e.target.value; s.zone = s.country === 'AU' ? zoneFromLat(s.lat) : ''; commit(); } }, [el('option', { value: '', text: 'Choose your country' })].concat(COUNTRIES.map(([v, l]) => el('option', { value: v, text: l + (PACKS[v] ? '' : ' (guide coming)') })))); sl.value = s.country; return sl; })()]),
      PACKS[s.country] ? el('label', { class: 'small pl-field' }, ['Climate zone', (() => { const sl = el('select', { onchange: e => { s.zone = e.target.value; commit(); } }, [el('option', { value: '', text: 'Choose your zone' })].concat((() => { const out = [], groups = {}; for (const [v, l, g] of PACKS[s.country].zones) { const o = el('option', { value: v, text: l }); if (!g) out.push(o); else { if (!groups[g]) { groups[g] = el('optgroup', { label: g }); out.push(groups[g]); } groups[g].append(o); } } return out; })())); sl.value = s.zone; return sl; })()]) : null,
      located() ? null : el('p', { class: 'small pl-warn', text: 'Planting guide: ' + MESSAGE }),
      el('div', { class: 'pl-row' }, [numF('Latitude', s, 'lat', 0.1, -90, 90), numF('Longitude', s, 'lon', 0.1, -180, 180)]),
      el('label', { class: 'small pl-field' }, ['Snap to', (() => { const sl = el('select', { onchange: e => { s.grid = +e.target.value; commit(); } }, [0.1, 0.25, 0.5, 1].map(g => el('option', { value: String(g), text: g * 100 + ' cm' }))); sl.value = String(s.grid); return sl; })()]),
      el('p', { class: 'small muted', text: 'The country and zone choose the planting guide; latitude draws the sun path. Nothing leaves your device.' }));
    return;
  }
  if (sel.length > 1) {
    put(el('div', { class: 'pane-head' }, [el('h3', { text: sel.length + ' selected' })]), el('div', { class: 'actions' }, [
      el('button', { type: 'button', class: 'btn primary', text: 'Make block', onclick: makeBlockFromSel }), el('button', { type: 'button', class: 'btn', text: 'Duplicate', onclick: duplicate }), el('button', { type: 'button', class: 'btn', text: 'Delete', onclick: removeSel })]));
    return;
  }
  const it = sel[0], k = M.KINDS[it.kind];
  put(el('div', { class: 'pane-head' }, [el('h3', { text: k.name })]),
    field('Name', it.name, v => { it.name = String(v).slice(0, 60) || k.name; }, { maxlength: '60' }),
    el('label', { class: 'small pl-field' }, ['Folder', (() => { const sl = el('select', { onchange: e => { it.folder = e.target.value; commit(); } }, M.FOLDERS.map(([v, l]) => el('option', { value: v, text: l }))); sl.value = it.folder; return sl; })()]));
  if (M.PLACE_KINDS.has(it.kind)) put(placePicker(it));
  section('Size and position');
  if (k.box) put(el('div', { class: 'pl-row' }, [numF('Width (m)', it, 'w', 0.1, 0.05, 2000), numF('Depth (m)', it, 'h', 0.1, 0.05, 2000)]), el('div', { class: 'pl-row' }, [numF('Centre x', it, 'x'), numF('Centre y', it, 'y')]), numF('Turn (degrees)', it, 'rot', 5, -360, 360));
  if (it.kind === 'bed') put(numF('Raised (m, 0 = in the ground)', it, 'raised', 0.05, 0, 3), el('p', { class: 'small muted', text: 'Area: ' + r2(it.w * it.h) + ' m²' }));
  section('Planting in this bed');
  if ((it.kind === 'bed' || it.kind === 'bench') && !S.ctx) {
    const h = M.bedHistory(items(), it);
    if (h.length) {
      const seen = new Map(); h.forEach(x => { const k = x.crop + '|' + x.sow; if (!seen.has(k)) seen.set(k, Object.assign({ n: 0 }, x)); seen.get(k).n++; });
      put(el('details', { class: 'pl-hist', open: h.length < 12 ? '' : null }, [el('summary', { class: 'small', text: 'Grown in this bed (' + seen.size + ')' }),
        ...[...seen.values()].reverse().slice(0, 30).map(x => el('p', { class: 'small' }, [el('b', { text: x.sow.slice(0, 7) }), ' ' + x.n + ' ' + M.CROPS[x.crop][0].toLowerCase() + (x.variety ? ' (' + x.variety + ')' : '') + ', ' + M.familyName(x.family)]))]));
    }
  }
  if ((it.kind === 'bed' || it.kind === 'bench') && !located()) put(needLocation());
  if ((it.kind === 'bed' || it.kind === 'bench') && located()) {
    const crop = el('select', { 'aria-label': 'Crop to fill the bed with' }, cropOptions()); crop.value = S.crop;
    const info = el('p', { class: 'small muted' });
    const say = () => { const g = GUIDES[crop.value]; info.textContent = 'Spacing ' + Math.round(g[3] * 100) + ' cm, rows ' + Math.round(g[4] * 100) + ' cm apart. ' + seasonNote(crop.value, S.plan.date); };
    crop.addEventListener('change', say); say();
    put(el('div', { class: 'pl-next' }, [el('label', { class: 'small pl-field' }, ['Fill this bed with', crop]), info,
      el('button', { type: 'button', class: 'btn', text: 'Fill at the guide spacing', onclick: () => { const made = M.fillBed(S.plan, items(), it.id, crop.value, S.plan.date); if (!made.length) return; S.sel = new Set(made.map(x => x.id)); commit(); toast(made.length + ' ' + M.CROPS[crop.value][0].toLowerCase() + ' plants added, sown ' + shortDay(S.plan.date) + '. Move or delete any you do not want.', 5000); } })]));
  }
  section('Look');
  if (it.kind === 'area') put(field('Colour', it.fill, v => { if (/^#[0-9a-f]{6}$/i.test(v)) it.fill = v; }, { type: 'color' }));
  if (it.kind === 'path') put(numF('Width (m)', it, 'width', 0.1, 0.1, 20));
  if (it.kind === 'fence') put(numF('Height (m)', it, 'height', 0.1, 0.1, 6));
  if (k.line) put(el('p', { class: 'small muted', text: 'Length: ' + r2(it.pts.reduce((n, p, i) => n + (i ? Math.hypot(p[0] - it.pts[i - 1][0], p[1] - it.pts[i - 1][1]) : 0), 0)) + ' m. Drag the corner squares to reshape.' }));
  if (it.kind === 'plant') {
    section('Crop and dates');
    put(el('label', { class: 'small pl-field' }, ['Crop', (() => { const sl = el('select', { onchange: e => { const c = M.CROPS[e.target.value]; Object.assign(it, { crop: e.target.value, shape: c[1], spread: c[2], height: c[3] }); commit(); } }, cropOptions()); sl.value = it.crop; return sl; })()]),
      it.link ? el('p', { class: 'small pl-good', text: 'Linked to the app: ' + (((S.places.plants || []).find(p => p.id === it.link) || {}).title || 'a plant record') + '. The plan for the app refers to this record.' }) : null,
      field('Variety', it.variety, v => { it.variety = String(v).slice(0, 60); }, { maxlength: '60' }),
      el('div', { class: 'pl-row' }, [numF('Spread (m)', it, 'spread', 0.05, 0.02, 40), numF('Height (m)', it, 'height', 0.1, 0.02, 40)]),
      el('div', { class: 'pl-row' }, [field('Sow / plant', it.sow, v => { it.sow = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }, { type: 'date' }), field('Harvest', it.harvest, v => { it.harvest = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }, { type: 'date' })]),
      numF('Remind me (days before)', it, 'remind', 1, 0, 60),
      (() => { const cb = el('input', { type: 'checkbox', checked: !!it.save, onchange: e => { if (e.target.checked) it.save = true; else delete it.save; commit(); } }); return el('label', { class: 'small pl-check' }, [cb, ' Saving seed from this plant']); })());
    section('Seed saving and warnings');
    { const risks = M.crossRisks(items(), it), iso = ISOLATION[it.crop];
      if (risks.length) put(el('div', { class: 'pl-guide pl-cross' }, [el('b', { text: 'Could cross' }),
        ...risks.slice(0, 5).map(r => el('p', { class: 'small pl-warn', text: (r.may ? 'May cross with ' : 'Will cross with ') + M.CROPS[r.crop][0].toLowerCase() + (r.variety ? ' (' + r.variety + ')' : '') + ', ' + r.m + ' m away. Keep at least ' + r.need + ' m apart.' })),
        el('p', { class: 'small', text: 'Or grow them at different times, or hand-pollinate and cover the flowers.' + (r0 => r0 && r0.may ? ' Pumpkins and zucchini cross only within the same species.' : '')(risks[0]) }),
        el('p', { class: 'small muted', text: 'General seed-saving distances: insects, wind and barriers change them.' })]));
      else if (it.save && iso && iso[1] > 0) put(el('p', { class: 'small pl-good', text: 'Seed saving: no crossing risk in this plan (keep ' + iso[1] + ' m from other ' + M.CROPS[it.crop][0].toLowerCase() + ' varieties' + (iso[0] === 'brassica' ? ', cabbage, broccoli, cauliflower and kale' : iso[0] === 'beta' ? ', beetroot and silverbeet' : iso[0] === 'capsicum' ? ', capsicum and chilli' : '') + ').' })); }
    { const rot = M.rotationIssues(items(), it);
      if (rot.length) put(el('div', { class: 'pl-guide' }, [el('b', { text: 'Crop rotation' }),
        el('p', { class: 'small pl-warn', text: 'The ' + M.familyName(M.familyOf(it.crop)) + ' grew in this bed ' + rot.map(r => M.CROPS[r.crop][0].toLowerCase() + ' from ' + shortDay(r.sow) + ' ' + r.sow.slice(0, 4)).join(', ') + '.' }),
        el('p', { class: 'small', text: 'Rotate it to another bed, or wait until ' + shortDay(rot[rot.length - 1].until) + ' ' + rot[rot.length - 1].until.slice(0, 4) + ' (a ' + M.ROTATION_YEARS + '-year rotation) to keep soil pests and diseases down.' })])); }
    section('Planting guide');
    const g = GUIDES[it.crop] || GUIDES.other, nb = M.neighbours(items(), it, S.plan.date), nm = k => (M.CROPS[k] ? M.CROPS[k][0] : k).toLowerCase();
    if (!located()) put(needLocation());
    else put(el('div', { class: 'pl-guide' }, [el('b', { text: 'Planting guide' }),
      el('p', { class: 'small', text: 'Sow or plant: ' + monthsText(months(it.crop)) + ' (' + PACKS[S.plan.site.country].name + ', ' + PACKS[S.plan.site.country].zones.find(z => z[0] === S.plan.site.zone)[1].toLowerCase() + '). ' + (g[8] === 'seed' ? 'Sow seed where it will grow.' : g[8] === 'seedling' ? 'Best from seedlings.' : 'From seed or seedlings.') }),
      el('p', { class: 'small', text: 'Spacing ' + Math.round(g[3] * 100) + ' cm, rows ' + Math.round(g[4] * 100) + ' cm. ' + (g[7] === 'full' ? 'Full sun.' : 'Sun or part shade.') + (g[6] ? ' About ' + g[6] + ' days to harvest.' : ' Perennial.') }),
      g[10].length ? el('p', { class: 'small', text: 'Grows well near: ' + g[10].map(nm).join(', ') + '.' }) : null,
      g[11].length ? el('p', { class: 'small', text: 'Keep apart from: ' + g[11].map(nm).join(', ') + '.' }) : null,
      nb.avoid.length ? el('p', { class: 'small pl-warn', text: 'Too close: ' + nb.avoid.map(nm).join(', ') + ' nearby.' }) : null,
      nb.friends.length ? el('p', { class: 'small pl-good', text: 'Good neighbours nearby: ' + nb.friends.map(nm).join(', ') + '.' }) : null,
      el('p', { class: 'small muted', text: 'A general guide: check your local guide too.' })]));
    section('Before and after this planting');
    const L = items(), prev = it.after && L.find(x => x.id === it.after), next = L.find(x => x.after === it.id);
    if (prev) put(el('p', { class: 'small' }, ['Follows ', el('a', { href: '#', text: prev.name + (prev.harvest ? ' (out ' + shortDay(prev.harvest) + ')' : ''), onclick: e => { e.preventDefault(); S.sel = new Set([prev.id]); drawAll(); } })]));
    if (next) put(el('p', { class: 'small' }, ['Then ', el('a', { href: '#', text: next.name + ' (in ' + shortDay(next.sow) + ')', onclick: e => { e.preventDefault(); S.plan.date = next.sow; S.sel = new Set([next.id]); commit('date'); } })]));
    else {
      const crop = el('select', { 'aria-label': 'Crop to plant next' }, cropOptions()); crop.value = it.crop === 'garlic' ? 'tomato' : 'garlic';
      put(el('div', { class: 'pl-next' }, [el('label', { class: 'small pl-field' }, ['When this comes out, plant next here', crop]),
        el('button', { type: 'button', class: 'btn', text: 'Plant next here', onclick: () => { const nx = M.followOn(S.plan, items(), it.id, crop.value); if (!nx) return; S.plan.date = nx.sow; S.sel = new Set([nx.id]); commit(); toast('Added: ' + nx.name + ' from ' + shortDay(nx.sow) + '. The calendar shows the swap.'); } })]));
    }
    put(el('p', { class: 'small muted', text: 'Move the date slider above the plan to watch it grow. Faded means not in the ground on that day.' }));
  }
  if (it.kind === 'task') put(field('What needs doing', it.text, v => { it.text = String(v).slice(0, 200); it.name = it.text.slice(0, 60) || 'Job'; }, { maxlength: '200' }),
    el('div', { class: 'pl-row' }, [field('Date', it.date, v => { it.date = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : it.date; }, { type: 'date' }),
      el('label', { class: 'small pl-field' }, ['Repeat', (() => { const sl = el('select', { onchange: e => { it.every = e.target.value; commit(); } }, [['', 'Once'], ['week', 'Every week'], ['month', 'Every month'], ['year', 'Every year']].map(([v, l]) => el('option', { value: v, text: l }))); sl.value = it.every; return sl; })()])]),
    numF('Remind me (days before)', it, 'remind', 1, 0, 60));
  if (it.kind === 'note') put(field('Text', it.text, v => { it.text = String(v).slice(0, 300); }, { maxlength: '300' }));
  if (it.kind === 'block') {
    const n = M.copiesOf(S.plan, it.def);
    put(el('div', { class: 'pl-row' }, [numF('x', it, 'x'), numF('y', it, 'y')]), numF('Turn (degrees)', it, 'rot', 15, -360, 360),
      el('p', { class: 'small muted', text: 'Block "' + (S.plan.blocks[it.def]?.name || '') + '", ' + n + (n === 1 ? ' copy.' : ' copies. Editing changes them all.') }),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Edit block', onclick: () => editBlock(it.def) }),
        el('button', { type: 'button', class: 'btn', text: 'Explode', title: 'Turn this copy back into loose items', onclick: () => { const loose = M.explodeBlock(S.plan, it.id); S.sel = new Set(loose.map(x => x.id)); commit(); } }),
        n > 1 ? el('button', { type: 'button', class: 'btn', text: 'Make unique', title: 'Give this copy its own block, so edits stop changing the others', onclick: () => { M.makeUnique(S.plan, it.id); commit(); } }) : null]));
  }
  topLevel();
  put(el('div', { class: 'actions', style: 'margin-top:12px' }, [el('button', { type: 'button', class: 'btn', text: 'Duplicate', onclick: duplicate }), el('button', { type: 'button', class: 'btn', text: 'Delete', onclick: removeSel })]));
}

/* ---------- calendar and reminders ---------- */
function drawCal() {
  calEl.textContent = '';
  const today = M.todayISO(), due = M.dueSoon(S.plan, today), dueIds = new Set(due.map(e => e.date + e.title));
  const next = M.events(S.plan, today).filter(e => e.date >= today && !dueIds.has(e.date + e.title)).slice(0, 6);
  const row = e => el('button', { type: 'button', class: 'pl-ev' + (dueIds.has(e.date + e.title) ? ' due' : ''), title: 'Show the plan on this day', onclick: () => { S.plan.date = e.date; S.sel = new Set(byId(e.id) ? [e.id] : []); commit('date'); } }, [el('b', { text: shortDay(e.date) }), ' ', e.title]);
  if (!due.length && !next.length) calEl.append(el('p', { class: 'small muted', text: 'Sowing, harvest and swap dates on plants, and Jobs (the Job tool), show here.' }));
  due.forEach(e => calEl.append(row(e))); next.forEach(e => calEl.append(row(e)));
  calEl.append(el('button', { type: 'button', class: 'btn sm', text: 'Add to my calendar', title: 'A calendar file for your phone or computer calendar, with a reminder before each event', onclick: () => downloadText(fileName('.ics'), M.toICS(S.plan, today), 'text/calendar') }));
  calEl.append(el('p', { class: 'small muted', text: 'Reminders also go to the app with Plan for the app.' }));
}

/* ---------- the app's Places: same names in both ---------- */
function drawPlaces() {
  placesEl.textContent = '';
  const list = S.places.list, linked = new Set(S.plan.items.filter(it => it.place).map(it => it.place));
  if (list.length) placesEl.append(el('p', { class: 'small', text: list.length + ' places from ' + S.places.from + ', ' + list.filter(p => linked.has(p.id)).length + ' linked in this plan.' }));
  else placesEl.append(el('p', { class: 'small muted', text: 'Read your places and plants from the app, so beds use the same names as the app and plants can be placed in their beds.' }));
  const plants = S.places.plants || [], inPlan = new Set(S.plan.items.filter(it => it.link).map(it => it.link));
  if (plants.length) {
    const todo = plants.filter(p => !inPlan.has(p.id));
    placesEl.append(el('p', { class: 'small', text: plants.length + ' plants from the app, ' + (plants.length - todo.length) + ' in this plan.' }));
    if (todo.length && !S.ctx) {
      const homed = todo.filter(p => p.placeId && S.plan.items.some(b => b.place === p.placeId && (b.kind === 'bed' || b.kind === 'bench')));
      if (homed.length) placesEl.append(el('button', { type: 'button', class: 'btn sm', text: 'Put ' + homed.length + ' in their beds', title: 'Plants whose app Place is linked to a bed here', onclick: () => placeAppPlants(homed) }));
      placesEl.append(el('details', {}, [el('summary', { class: 'small', text: todo.length + ' plants not in this plan yet' }),
        ...todo.slice(0, 60).map(p => el('div', { class: 'pl-place' }, [el('span', { text: p.title + (p.variety && p.variety !== p.title ? ' (' + p.variety + ')' : '') }), el('button', { type: 'button', class: 'btn sm', text: 'Place', onclick: () => placeAppPlants([p]) })]))]));
    }
  }
  placesEl.append(el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: list.length ? 'Read again' : 'Read from an app backup', onclick: readPlaces }),
    list.length ? el('button', { type: 'button', class: 'btn sm', text: 'Forget', onclick: () => { S.places = { list: [], from: '' }; store.del(K.places); drawPlaces(); drawProps(); } }) : null]));
  const free = list.filter(p => !linked.has(p.id));
  if (free.length && !S.ctx) placesEl.append(el('details', {}, [el('summary', { class: 'small', text: free.length + ' not in this plan yet' }),
    ...free.slice(0, 40).map(p => el('div', { class: 'pl-place' }, [el('span', { text: p.name }), el('button', { type: 'button', class: 'btn sm', text: 'Add as bed', onclick: () => { const b = svg.getBoundingClientRect(), v = S.view; add({ kind: 'bed', name: p.name, place: p.id, x: snap((b.width / 2 - v.x) / v.scale), y: snap((b.height / 2 - v.y) / v.scale), w: 2.4, h: 1.2, rot: 0 }); } })]))]));
}
/* put app plants in the plan: in their linked bed at a free spot when there is one, otherwise in the middle of the view */
function placeAppPlants(list) {
  const added = [], full = [];
  const b = svg.getBoundingClientRect(), v = S.view; let cx = (b.width / 2 - v.x) / v.scale, cy = (b.height / 2 - v.y) / v.scale;
  for (const p of list) {
    const c = M.CROPS[p.crop] || M.CROPS.other, bed = p.placeId && S.plan.items.find(it => it.place === p.placeId && (it.kind === 'bed' || it.kind === 'bench'));
    const working = S.plan.items.concat(added);
    let at = bed ? M.freeSpot(working, bed, c[2]) : null;
    if (bed && !at) full.push(p.title);
    if (!at) { at = [r2(cx), r2(cy)]; cx += Math.max(0.3, c[2]); }
    const raw = { kind: 'plant', name: p.title, x: at[0], y: at[1], crop: p.crop, shape: c[1], spread: c[2], height: c[3], sow: p.sow || S.plan.date, harvest: p.sow && c[4] ? isoPlus(p.sow, c[4]) : '', variety: p.variety, link: p.id };
    const it = M.cleanPlan({ format: M.FORMAT, version: 1, items: [Object.assign({ id: M.newId(), folder: 'planting' }, raw)] }).items[0];
    if (it) added.push(it);
  }
  S.plan.items.push(...added); S.sel = new Set(added.map(x => x.id)); commit();
  toast(added.length + ' placed' + (full.length ? '; ' + full.length + ' did not fit in their bed and are in the middle of the view' : '') + '.', 5000);
}
async function readPlaces() {
  const f = await pickFile('.zip,.json,application/zip,application/json'); if (!f) return;
  try {
    let text;
    if (/\.zip$/i.test(f.name) || f.type.includes('zip')) { text = await readZipEntry(f, 'lineage.json'); if (!text) throw new Error('This zip is not a Lineage Tracker backup (there is no lineage.json inside)'); }
    else text = await f.text();
    let data = JSON.parse(text);
    if (data && data.format === 'sync-encrypted') { const pass = await promptBox('Protected records', 'Your sync passphrase (only used on this device, not kept)', '', { max: 200 }); if (!pass) return; data = await openProtected(data, pass); }
    if (!data || !Array.isArray(data.records)) throw new Error('This file has no Lineage Tracker records in it');
    const list = rowsFromApp(data, '').place.map(r => ({ id: String(r._id).slice(0, 40).replace(/[^A-Za-z0-9_-]/g, ''), name: String(r.title).slice(0, 60) })).filter(p => p.id && p.name);
    if (!list.length && !M.appPlants(data).length) { toast('No places or plants found in that backup.'); return; }
    const plants = M.appPlants(data);
    S.places = { list, plants, from: f.name.slice(0, 60) }; if (!store.set(K.places, S.places)) store.set(K.places, { list, plants: [], from: S.places.from });
    const n = M.linkPlaces(S.plan, list); commit();
    toast(list.length + ' places and ' + plants.length + ' plants read' + (n ? ', ' + n + ' beds linked or renamed to match the app' : '') + '.', 5000);
  } catch (e) { toast(e && e.message && e.message.length < 140 ? e.message : 'That file could not be read.', 5000); }
}
function placePicker(it) {
  const list = S.places.list;
  if (S.ctx) return el('p', { class: 'small muted', text: 'Link to an app place on the block copy, not inside the block (every copy is its own place).' });
  if (!list.length) return el('p', { class: 'small muted', text: 'App place: read your places from the app (left panel) to link this to one.' });
  const taken = new Set(S.plan.items.filter(x => x.place && x !== it).map(x => x.place));
  const sl = el('select', { onchange: e => { const p = list.find(x => x.id === e.target.value); if (p) { it.place = p.id; it.name = p.name; } else delete it.place; commit(); } },
    [el('option', { value: '', text: 'Not linked' })].concat(list.map(p => el('option', { value: p.id, text: p.name + (taken.has(p.id) ? ' (used)' : ''), disabled: taken.has(p.id) }))));
  sl.value = it.place && list.some(p => p.id === it.place) ? it.place : '';
  return el('label', { class: 'small pl-field' }, ['App place (same name as in the app)', sl]);
}

/* ---------- new and open ---------- */
function newDialog() {
  const d = dialog('New plan', [el('div', {}, [
    el('h3', { text: 'Blank plan' }),
    (() => {
      const w = el('input', { type: 'number', value: '20', min: '1', max: '5000', 'aria-label': 'Width in metres' }), h = el('input', { type: 'number', value: '15', min: '1', max: '5000', 'aria-label': 'Depth in metres' }), n = el('input', { type: 'text', value: 'My plan', maxlength: '80', 'aria-label': 'Name' });
      return el('div', {}, [el('label', { class: 'small pl-field' }, ['Name', n]), el('div', { class: 'pl-row' }, [el('label', { class: 'small pl-field' }, ['Width (m)', w]), el('label', { class: 'small pl-field' }, ['Depth (m)', h])]),
        el('button', { type: 'button', class: 'btn primary', text: 'Start', onclick: async () => { if (!(await leaveOk())) return; const p = M.blankPlan(n.value.trim() || 'My plan', +w.value || 20, +h.value || 15); p.site.lat = S.plan.site.lat; p.site.lon = S.plan.site.lon; p.site.country = S.plan.site.country; p.site.zone = S.plan.site.zone; d.close(); loadPlan(p); } })]);
    })(),
    el('h3', { text: 'Demo plans' }),
    ...DEMOS.map(x => el('button', { type: 'button', class: 'starter', onclick: async () => { if (!(await leaveOk())) return; d.close(); loadPlan(x.make()); } }, [el('b', { text: x.name }), el('small', { text: x.note })])),
  ])]);
}
const leaveOk = () => confirmBox('Start another plan?', 'This plan stays only until you start another. Download it first if you want to keep it.', 'Continue');
async function openFile() {
  const f = await pickFile('.ltplan,application/json'); if (!f) return;
  try { const p = M.cleanPlan(JSON.parse(await f.text())); if (!(await leaveOk())) return; loadPlan(p); toast('Opened "' + p.name + '"'); }
  catch (e) { toast(e && e.message && e.message.length < 120 ? e.message : 'That file is not an LT-Planner plan.', 5000); }
}

/* test hook: the QA script reads the plan from here (nothing secret: it is the plan on screen) */
function syncHash() { window.__ltPlanner = { plan: S.plan, sel: [...S.sel], ctx: S.ctx, tool: S.tool, view: S.view }; }
