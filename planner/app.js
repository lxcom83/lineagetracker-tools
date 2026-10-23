/* LT-Planner (first slice): the 2D plan.  Same kit and feel as LT-Print: top bar, Plans menu, undo, tools on the left,
   feature tree and properties on the right.  Plans are saved on this device and as .ltplan files; Drive and Dropbox,
   the 3D view, ground shaping and model import come in later slices (see LT-PLANNER-PLAN.md). */
import { whoAmI, CFG, loadConfig, el, icon, toast, dialog, confirmBox, promptBox, store, gate, REASONS, signInUrl, rootUrl, registerSW } from '../kit/core.js';
import { topBar } from '../kit/bar.js';
import { history } from '../kit/history.js';
import { featureTree } from '../kit/tree.js';
import { downloadText, pickFile, readZipEntry, openProtected } from '../kit/files.js';
import * as TR from './terrain.js';
import { parseGeoTiff } from './geotiff.js';
import { fold, foldHeadings } from '../kit/fold.js';
import { rowsFromApp } from '../print/model.js';
import * as M from './model.js';
import { DEMOS } from './demos.js';
import { BY_ID as PLANT_DB } from '../kit/plantdb.js';
import { scanDialog, askAI, parseReplyJSON } from '../kit/ai.js';
import { drawingPrompt, planFromReply } from './scan.js';
import { GUIDES, PACKS, COUNTRIES, MESSAGE, ISOLATION, hasGuide, zoneFromLat, sowMonths, monthsText, inSeason } from './guides.js';

const app = document.getElementById('app');
const SVGNS = 'http://www.w3.org/2000/svg';
const K = { doc: 'ltplanner_doc', prefs: 'ltplanner_prefs', lib: 'ltplanner_blocks', places: 'ltplanner_places' };
const S = { show: (() => { try { const v = localStorage.getItem('ltplanner.show2d'); return ['grow', 'count'].includes(v) ? v : ''; } catch { return ''; } })(), find: '', pulse: null, contours: false, contourStep: 0.5, plan: null, sel: new Set(), tool: 'select', crop: 'tomato', ctx: null, open: {}, view: null, draft: null, sun: true, brush: { op: 'raise', size: 3, power: 1 } };
let btn3d, hist, tree, svg, world, overlay, propsEl, blocksEl, calEl, placesEl, titleEl, undoB, redoB, dateIn, dateLbl, toolBtns = {};

/* the crop list in groups (from the plant database): vegetables, herbs, fruit, nuts, berries and vines, then the general choices */
const CROP_GROUPS = [['vegetable', 'Vegetables'], ['herb', 'Herbs'], ['fruit', 'Fruit'], ['nut', 'Nut trees'], ['berry', 'Berries and vines'], ['law', 'Legal only in some places (check your local law)'], ['', 'General']];
const cropGroup = k => { const p = PLANT_DB[k]; return !p ? '' : p.law ? 'law' : p.group === 'grain' ? 'vegetable' : p.group === 'vine' ? 'berry' : p.group; };
const cropOptions = () => CROP_GROUPS.map(([g, label]) => {
  const list = Object.entries(M.CROPS).filter(([k]) => cropGroup(k) === g).sort((a, b) => (a[0] === 'other') - (b[0] === 'other') || a[1][0].localeCompare(b[1][0]));
  return list.length ? el('optgroup', { label }, list.map(([k, c]) => el('option', { value: k, text: c[0] }))) : null; }).filter(Boolean);
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
  S.contours = !!S.plan.site.ground;
  const pl = store.get(K.places); S.places = pl && Array.isArray(pl.list) ? pl : { list: [], from: '' };
  build(g);
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
function loadPlan(p) { if (S.places && S.places.list.length) M.linkPlaces(p, S.places.list); S.plan = p; S.contours = !!p.site.ground; S.stepSet = false; S.sel.clear(); S.ctx = null; S.view = null; hist.reset(); autosave(); fit(); drawAll(); }

/* ---------- the page ---------- */
function build(g = {}) {
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
      mi('list', 'My plants…', 'Your own plant varieties: colours, shapes, crosses', openMyPlants),
      mi('image', 'Scan a drawing (AI)…', 'Photo of a garden drawing: lays out the areas', scanDrawing),
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
  btn3d = el('button', { type: 'button', class: 'btn sm', title: '3D view (beta)', 'aria-label': '3D view (beta)', onclick: open3d }, ['3D', el('span', { class: 'hide-sm', text: ' view (beta)' })]);
  const slot = el('div', { class: 'pr-slot' }, [fileWrap, undoB, redoB, btn3d, el('span', { class: 'sp' }), titleEl]);

  /* left: tools, crops, blocks */
  const T = [['select', 'Select', 'up', 'V'], ['bed', 'Bed', 'rect', 'B'], ['area', 'Area', 'grid', 'A'], ['path', 'Path', 'path', 'P'], ['fence', 'Fence', 'fence', 'F'],
    ['plant', 'Plant', 'tag', 'L'], ['rows', 'Crop rows', 'rows', 'R'], ['ground', 'Shape ground', 'hill', 'G'], ['tank', 'Water tank', 'ellipse', 'W'], ['pipe', 'Drip line', 'drip', 'D'], ['bench', 'Seed bench', 'table', 'S'], ['building', 'Building', 'house', 'H'], ['greenhouse', 'Greenhouse', 'greenhouse', 'E'], ['pergola', 'Pergola', 'pergola', 'O'], ['trellis', 'Trellis', 'trellis', 'T'], ['wall', 'Retaining wall', 'wall', 'K'], ['note', 'Note', 'text', 'N'], ['task', 'Job', 'calendar', 'J']];
  const toolGrid = el('div', { class: 'addgrid', role: 'group', 'aria-label': 'Tools' });
  for (const [k, l, ic, key] of T) { const b = el('button', { type: 'button', class: 'chip', 'aria-pressed': 'false', title: l + ' (' + key + ')', onclick: () => setTool(k) }, [icon(ic), l]); toolBtns[k] = b; toolGrid.append(b); }
  const cropSel = el('select', { 'aria-label': 'Crop for the Plant tool', onchange: e => { S.crop = e.target.value; } }, cropOptions());
  cropSel.value = S.crop;
  blocksEl = el('div');
  const left = el('aside', { class: 'pr-left', 'aria-label': 'Tools and blocks' }, [
    el('h3', { text: 'Draw' }), toolGrid,
    el('p', { class: 'small muted', text: 'Beds, areas, tanks and benches: drag a box. Paths, fences and drip lines: tap each corner, double-tap or Enter to finish.' }),
    brushBar(),
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
  const showSel = el('select', { class: 'pl-showsel', 'aria-label': 'Text on beds, greenhouses and benches', title: 'What to write under each bed, greenhouse and bench' }, [['', 'Names only'], ['grow', 'Names + what is growing'], ['count', 'Names + how many']].map(([v, l]) => el('option', { value: v, text: l })));
  showSel.value = S.show; showSel.addEventListener('change', () => { S.show = showSel.value; try { localStorage.setItem('ltplanner.show2d', S.show); } catch {} drawScene(); });
  const stageBar = el('div', { class: 'stage-bar' }, [
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom out', onclick: () => zoomBy(1 / 1.25) }, [icon('zoomOut')]),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Zoom in', onclick: () => zoomBy(1.25) }, [icon('zoomIn')]),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Fit the plan', onclick: () => { fit(); drawAll(); } }, [icon('fit')]),
    sunB, showSel, el('span', { class: 'grow' }), icon('calendar'), dateIn, dateLbl]);
  svg = sv('svg', { class: 'pl-svg', role: 'img', 'aria-label': 'The plan, seen from above', tabindex: '0' });
  world = sv('g'); overlay = sv('g'); svg.append(world, overlay);
  const stage = el('div', { class: 'pr-stage' }, [stageBar, el('div', { class: 'pr-canvas pl-canvas' }, [svg, floatEl || el('span')])]);

  /* right: tree and properties */
  const treeBox = el('div');
  propsEl = el('div');
  const right = el('aside', { class: 'pr-right', 'aria-label': 'Feature tree and properties' }, [
    el('div', { class: 'pane tree-pane' }, [(() => { const f = fold('planner', 'Feature tree', true); f.body.append(findBox(), treeBox); return f.box; })()]),
    el('div', { class: 'pane props-pane' }, [propsEl])]);
  const mob = el('nav', { class: 'pl-mob' }, [el('button', { type: 'button', class: 'btn', text: 'Tools', onclick: () => { document.body.classList.remove('show-right'); document.body.classList.toggle('show-left'); } }), el('button', { type: 'button', class: 'btn', text: 'Tree and details', onclick: () => { document.body.classList.remove('show-left'); document.body.classList.toggle('show-right'); } })]);
  app.textContent = '';
  app.append(el('div', { class: 'pr-shell' }, [topBar({ tool: 'planner', slot, who: g.alias ? { alias: g.alias, offline: g.offline, checked: g.checked } : null }), el('div', { class: 'pr-view' }, [left, stage, right]), mob]));

  tree = featureTree(treeBox, {
    label: 'Feature tree', empty: 'Nothing in this plan yet. Pick a tool on the left.',
    nodes: treeNodes, isSelected: id => S.sel.has(id),
    iconFor: n => (n.children ? 'folder' : { task: 'calendar', bed: 'rect', area: 'grid', path: 'line', fence: 'line', pipe: 'line', plant: 'tag', tank: 'ellipse', bench: 'table', note: 'text', block: 'group', rows: 'grid', building: 'house', greenhouse: 'greenhouse', pergola: 'pergola', trellis: 'trellis', wall: 'wall' }[n.kind] || 'rect'),
    onSelect: (id, add) => { if (id.startsWith('f:')) return; S.pulse = { id, until: Date.now() + 3000 }; setTimeout(drawScene, 3100); select(id, add); },
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
/* find a plant or variety: every word must appear in the item's name, crop, variety or look name; matches glow on the plan, in the list and in 3D */
const findText = it => [it.name, it.kind === 'plant' || it.kind === 'rows' ? (M.CROPS[it.crop] || [])[0] : '', it.variety, lookName(it)].join(' ').toLowerCase();
const isMatch = it => !!S.find && S.find.split(/\s+/).filter(Boolean).every(w => findText(it).includes(w));
const matchIds = () => { const out = []; const walk = list => list.forEach(it => { if (it.kind === 'block') walk((S.plan.blocks[it.def] || {}).items || []); else if (isMatch(it)) out.push(it.id); }); walk(S.plan.items); return out; };
const glowing = it => isMatch(it) || (S.pulse && S.pulse.id === it.id && Date.now() < S.pulse.until);
const treeNodes = () => M.FOLDERS.map(([k, label]) => {
  const kids = items().filter(it => it.folder === k && (!S.find || isMatch(it))).slice().reverse().map(it => ({ id: it.id, name: it.name, kind: it.kind, hidden: it.hidden, locked: it.locked, off: it.off, glow: isMatch(it), note: it.kind === 'block' ? 'block' : (it.kind === 'plant' || it.kind === 'rows') ? [it.variety, it.kind === 'plant' && it.sow ? shortDay(it.sow) : ''].filter(Boolean).join(' · ') : '' }));
  const f = 'f:' + k;
  return { id: f, name: label, kind: 'folder', children: kids, open: (S.find ? kids.length > 0 : S.open[f] !== false && (kids.length > 0 || S.open[f] === true)), hidden: kids.length > 0 && kids.every(x => x.hidden), locked: kids.length > 0 && kids.every(x => x.locked), off: kids.length > 0 && kids.every(x => x.off) };
}).filter(f => f.children.length || (!S.find && ['beds', 'planting', 'structures'].includes(f.id.slice(2))));


function findBox() {
  const inp = el('input', { type: 'search', class: 'pl-find', placeholder: 'Find a plant or variety…', 'aria-label': 'Find a plant or variety', autocomplete: 'off', maxlength: '60' }), msg = el('p', { class: 'small muted pl-find-msg', role: 'status' });
  const run = () => { S.find = inp.value.trim().toLowerCase().slice(0, 60); const n = S.find ? matchIds().length : 0; msg.textContent = S.find ? (n ? n + ' found. They glow on the plan and in 3D. Press Enter to select them.' : 'Nothing matches that.') : ''; tree.render(); drawScene(); };
  inp.addEventListener('input', run);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const ids = matchIds(); if (ids.length) { S.sel = new Set(ids); drawAll(); } } else if (e.key === 'Escape' && inp.value) { inp.value = ''; run(); e.stopPropagation(); } });
  return el('div', { class: 'pl-findbox' }, [inp, msg]);
}

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
    const fill = it.kind === 'bed' ? COL.bedFill : it.kind === 'area' ? areaFill(it) : it.kind === 'tank' ? COL.tank : it.kind === 'rows' ? '#DCE8C4' : it.kind === 'building' ? it.roofColour : it.kind === 'greenhouse' ? '#dcefee' : it.kind === 'pergola' ? 'none' : COL.bench;
    const stroke = it.kind === 'bed' ? COL.bed : it.kind === 'area' ? 'none' : it.kind === 'pergola' ? it.colour : it.kind === 'greenhouse' ? it.frame : '#4A5A6A';
    const shape = (it.kind === 'tank' || it.shape === 'round') ? sv('ellipse', { rx: it.w / 2, ry: it.h / 2 }) : sv('rect', { x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, rx: it.kind === 'bed' ? Math.min(0.08, it.w / 10) : 0 });
    shape.setAttribute('transform', tf); shape.setAttribute('fill', fill); shape.setAttribute('stroke', stroke); shape.setAttribute('stroke-width', it.kind === 'bed' && it.raised > 0 ? 3 : 1.5); shape.setAttribute('vector-effect', 'non-scaling-stroke');
    grp.append(shape);
    if (it.kind === 'building' || it.kind === 'greenhouse' || it.kind === 'pergola') { const lines = structLines2D(it); if (lines) { const p = sv('path', { d: lines, fill: 'none', stroke: it.kind === 'building' ? shade(it.roofColour, -0.35) : it.kind === 'pergola' ? it.colour : it.frame, 'stroke-width': it.kind === 'pergola' ? 2 : 1, 'vector-effect': 'non-scaling-stroke' }); p.setAttribute('transform', tf); grp.append(p); } }
    if (it.kind === 'rows') {      // the rows themselves: one line per row (or a light hatch when they would be too close to tell apart)
      const L = M.rowsLayout(it), px = L.rowSpacing * S.view.scale, gr = M.growth(it, plan.date), cc = COL.plant[(M.CROPS[it.crop] || M.CROPS.other)[1]] || COL.plant.bush;
      if (gr === null && !faded) grp.setAttribute('opacity', 0.35);
      const step = px >= 3 ? 1 : Math.ceil(3 / Math.max(px, 0.01)), lines = [];
      for (let i = 0; i < L.rows && lines.length < 400; i += step) { const y = -it.h / 2 + i * L.rowSpacing; lines.push('M' + (-it.w / 2) + ' ' + y + 'H' + (it.w / 2)); }
      const rl = sv('path', { d: lines.join(''), fill: 'none', stroke: cc, 'stroke-width': Math.max(1.5, Math.min(5, L.plantSpacing * S.view.scale * 0.6)), 'stroke-opacity': 0.8, 'vector-effect': 'non-scaling-stroke', 'stroke-dasharray': L.plantSpacing * S.view.scale >= 5 ? '1 ' + Math.max(2, L.plantSpacing * S.view.scale - 1) : null, 'stroke-linecap': 'round' });
      rl.setAttribute('transform', tf); grp.append(rl);
    }
    if (it.kind !== 'area' || it.w * S.view.scale > 60) grp.append(label(it.name, it.x, it.y + (it.kind === 'area' ? 0 : it.h / 2 + 0.05), it.kind === 'area'));
    if (S.show && ['bed', 'greenhouse', 'bench'].includes(it.kind) && it.w * S.view.scale > 40) { const t = contentsText(it, plan); if (t) { const l2 = label(t, it.x, it.y + it.h / 2 + 0.05 + 14 / S.view.scale, false); l2.setAttribute('class', 'pl-label pl-sub'); grp.append(l2); } }
  } else if (k.line) {
    const d = 'M' + it.pts.map(p => p.join(' ')).join('L');
    if (it.kind === 'path') grp.append(sv('path', { d, fill: 'none', stroke: COL.path, 'stroke-width': it.width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    if (it.kind === 'fence') { const st = it.style || 'palings', c = it.colour || { palings: COL.fence, pickets: '#9a8f7a', slats: '#6b5238', wire: '#7a6a55', panels: '#8a998c' }[st]; grp.append(sv('path', { d, fill: 'none', stroke: c, 'stroke-width': st === 'wire' ? 1.5 : 3, 'stroke-dasharray': st === 'wire' ? '6 4' : st === 'pickets' ? '2 2' : null, 'vector-effect': 'non-scaling-stroke' })); it.pts.forEach(p => grp.append(sv('rect', { x: p[0] - 0.06, y: p[1] - 0.06, width: 0.12, height: 0.12, fill: c }))); }
    if (it.kind === 'trellis') { grp.append(sv('path', { d, fill: 'none', stroke: '#6E8B4A', 'stroke-width': 2, 'stroke-dasharray': it.style === 'wire' ? '2 3' : null, 'vector-effect': 'non-scaling-stroke' })); it.pts.forEach(p => grp.append(sv('circle', { cx: p[0], cy: p[1], r: 0.05, fill: '#6b4f33' }))); }
    if (it.kind === 'wall') { const c = WALL_2D[it.material] || WALL_2D.sleeper; grp.append(sv('path', { d, fill: 'none', stroke: c, 'stroke-width': 0.2 + it.height * 0.1, 'stroke-linejoin': 'miter' })); grp.append(sv('path', { d, fill: 'none', stroke: shade(c, -0.4), 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' })); }
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
/* what is growing in a bed, greenhouse or bench on the plan's date, as one line of text (the plan's "Text on plan" choice) */
let flatCache = { items: null, n: -1, all: [] };
function flatAll(plan) {
  const out = [], walk = list => { for (const x of list) { if (x.off || x.hidden) continue; if (x.kind === 'block') walk(M.blockItems(plan, x)); else out.push(x); } };
  walk(plan.items);
  return out.filter(x => x.kind === 'plant' && M.growth(x, plan.date) !== null);   // only plants growing on the plan's date: each bed then checks far fewer
}
const flatNow = plan => { const key = plan.items.length + '|' + plan.date; if (flatCache.items !== plan.items || flatCache.key !== key || S.dirtyFlat) { flatCache = { items: plan.items, key, all: flatAll(plan) }; S.dirtyFlat = false; } return flatCache.all; };
function contentsText(it, plan) {
  const g = M.growingIn(flatNow(plan), it, plan.date); if (!g.length) return '';
  const one = e => e.name + (S.show === 'count' ? ' ×' + e.n : '') + (e.variety ? ' (' + e.variety + ')' : '');
  return g.slice(0, 4).map(one).join(', ') + (g.length > 4 ? ' +' + (g.length - 4) + ' more' : '');
}
function label(text, x, y, centre, note) {
  const fs = 12 / S.view.scale;
  const t = sv('text', { x, y: centre ? y : y + fs, 'font-size': fs, 'stroke-width': 3 / S.view.scale, 'text-anchor': 'middle', 'dominant-baseline': centre ? 'middle' : 'auto', class: 'pl-label' + (note ? ' note' : '') });
  t.textContent = String(text).slice(0, 60); return t;
}
/* drawAll: the plan and every panel.  drawScene: only the plan (while dragging, panning and zooming, so the tree keeps focus). */
function drawAll() { if (!S.view || !svg) return; drawScene(); tree.render(); drawProps(); drawBlocks(); drawCal(); drawPlaces(); }
/* contour lines from the plan's ground heights (worked out once per height set and interval, then reused) */
let contourCache = { gd: null, step: 0, lines: [] };
function drawContours() {
  const gd = S.plan.site.ground;
  if (!(contourCache.live || (contourCache.gd === gd && contourCache.step === S.contourStep))) { const g = groundGrid(); contourCache = { gd, step: S.contourStep, lines: g ? TR.contours(g, S.contourStep) : [] }; }
  for (const c of contourCache.lines) {
    const major = Math.abs(c.level / (S.contourStep * 5) - Math.round(c.level / (S.contourStep * 5))) < 1e-6;
    const d = c.lines.map(l => 'M' + l.map(p => p[0].toFixed(2) + ' ' + p[1].toFixed(2)).join('L')).join('');
    world.append(sv('path', { d, fill: 'none', stroke: '#8a6d3b', 'stroke-width': major ? 1.6 : 0.8, 'stroke-opacity': major ? 0.9 : 0.6, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
    if (major && c.lines.length) { const l = c.lines.reduce((b, x) => (x.length > b.length ? x : b), c.lines[0]), p = l[Math.floor(l.length / 2)]; const t = sv('text', { x: p[0], y: p[1], 'font-size': 11 / S.view.scale, fill: '#6b5226', 'pointer-events': 'none' }); t.textContent = c.level.toFixed(1) + ' m'; world.append(t); }
  }
}
function drawScene() {
  if (!S.view || !svg) return;
  flatCache = { items: null, key: '', all: [] };   // the bed text is worked out fresh for every drawing
  const v = S.view, { w, h } = S.plan.site;
  world.setAttribute('transform', `translate(${v.x} ${v.y}) scale(${v.scale})`);
  world.textContent = ''; overlay.textContent = ''; ring = null;
  // ground and grid (major line every 5 m, or 1 m when zoomed in)
  world.append(sv('rect', { x: 0, y: 0, width: w, height: h, class: 'pl-ground' }));
  const step = v.scale > 40 ? 1 : v.scale > 8 ? 5 : 10, gp = sv('path', { class: 'pl-grid', 'vector-effect': 'non-scaling-stroke' }); let d = '';
  for (let x = step; x < w; x += step) d += `M${x} 0V${h}`; for (let y = step; y < h; y += step) d += `M0 ${y}H${w}`;
  gp.setAttribute('d', d); world.append(gp);
  if (S.contours && S.plan.site.ground) drawContours();
  const editing = S.ctx ? S.plan.blocks[S.ctx] : null;
  if (editing) { S.plan.items.forEach(it => drawItem(world, it, S.plan, true)); world.append(sv('rect', { x: -1000, y: -1000, width: 3000, height: 3000, fill: 'var(--desk)', opacity: 0.55 })); }
  items().forEach(it => drawItem(world, it, S.plan, false));
  // glow: items found with the Find box, and the one just picked in the list
  { const walk = list => list.forEach(it => { if (it.kind === 'block') return; if (glowing(it)) { const b = M.bounds(it, S.plan), pad = 0.25; world.append(sv('rect', { x: b[0] - pad, y: b[1] - pad, width: b[2] - b[0] + 2 * pad, height: b[3] - b[1] + 2 * pad, rx: 0.3, class: 'pl-glow', 'vector-effect': 'non-scaling-stroke' })); } }); walk(items()); }
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

/* an area with a surface but the standard colour is drawn in its surface's colour, so a house, a driveway and a lawn do not all look alike */
const SURF_2D = { lawn: '#cfe3b5', gravel: '#e6dfd0', mulch: '#cdb08f', soil: '#b9a088', pavers: '#d9d4ca', decking: '#d8bd9a' };
const areaFill = it => (it.surface && SURF_2D[it.surface] && (!it.fill || it.fill.toUpperCase() === '#C9DDB8') ? SURF_2D[it.surface] : it.fill);
const WALL_2D = { sleeper: '#7a5a3a', stone: '#9a948a', block: '#a8a39a', brick: '#a5553a' };
const shade = (hex, f) => { const n = parseInt(hex.slice(1), 16), c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f)); return '#' + c.map(v => v.toString(16).padStart(2, '0')).join(''); };
/* plan lines inside a building (ridge and hips), greenhouse (glazing bars) or pergola (rafters), in the item's own frame */
function structLines2D(it) {
  const W = it.w / 2, H = it.h / 2, out = [];
  if (it.kind === 'building') {
    const along = it.ridge === 'w' || (it.ridge === 'auto' && it.w >= it.h), a = along ? W : H, b = along ? H : W, P = (u, v) => (along ? [u, v] : [v, u]).join(' ');
    if (it.roof === 'gable') out.push('M' + P(-a, 0) + 'L' + P(a, 0));
    else if (it.roof === 'hip') { const r = Math.max(0, a - b); out.push('M' + P(-r, 0) + 'L' + P(r, 0), 'M' + P(-a, -b) + 'L' + P(-r, 0) + 'L' + P(-a, b), 'M' + P(a, -b) + 'L' + P(r, 0) + 'L' + P(a, b)); }
    else if (it.roof === 'skillion') out.push('M' + P(-a, -b * 0.9) + 'L' + P(a, -b * 0.9));
    else out.push('M' + (-W + 0.15) + ' ' + (-H + 0.15) + 'H' + (W - 0.15) + 'V' + (H - 0.15) + 'H' + (-W + 0.15) + 'Z');
  } else if (it.kind === 'greenhouse') {
    const along = it.w >= it.h, a = along ? W : H, b = along ? H : W, P = (u, v) => (along ? [u, v] : [v, u]).join(' ');
    out.push('M' + P(-a, 0) + 'L' + P(a, 0)); for (let u = -a + 0.6; u < a - 0.1; u += 0.6) out.push('M' + P(u, -b) + 'L' + P(u, b));
  } else if (it.kind === 'pergola') {
    const along = it.w >= it.h, a = along ? W : H, b = along ? H : W, P = (u, v) => (along ? [u, v] : [v, u]).join(' ');
    out.push('M' + P(-a, -b + 0.1) + 'L' + P(a, -b + 0.1), 'M' + P(-a, b - 0.1) + 'L' + P(a, b - 0.1));
    for (let u = -a + 0.1; u <= a - 0.05; u += 0.5) out.push('M' + P(u, -b) + 'L' + P(u, b));
  }
  return out.join('');
}
/* a short "about this plant" box from the plant database, with a hint when the plan's location is likely too cold or too warm for it */
function plantFacts(crop) {
  const p = PLANT_DB[crop]; if (!p) return null;
  const bits = [];
  if (p.life === 'perennial') bits.push('About ' + p.h + ' m tall and ' + p.s + ' m wide' + (p.years ? ', first crop after about ' + p.years + (p.years === 1 ? ' year' : ' years') : '') + (p.decid ? ', loses its leaves in winter' : '') + '.');
  if (p.chill) bits.push('Needs about ' + p.chill[0] + ' to ' + p.chill[1] + ' hours of winter chill (low-chill varieties need less).');
  if (p.minC !== undefined) bits.push('Takes winter lows down to about ' + p.minC + ' °C once established.');
  if (p.fr) bits.push('Fruit: ' + p.fr + '.');
  if (p.note) bits.push(p.note);
  const ms = located() ? months(crop) : null, warn = ms && !ms.length && p.life === 'perennial' ? el('p', { class: 'small pl-warn', text: 'May not grow outdoors in your area: winters are likely too cold' + (p.chill ? ' or too mild to give it enough chill' : '') + ', or the climate does not suit it. A warm sheltered spot, a pot or a variety bred for your climate may still work. Check your local guide.' }) : null;
  return el('div', { class: 'pl-guide pl-facts' }, [el('b', { text: 'About ' + p.name.toLowerCase() }), el('p', { class: 'small muted', text: p.bot + (p.alt && p.alt.length ? ' · also called ' + p.alt.join(', ') : '') }), ...bits.map(t => el('p', { class: 'small', text: t })), warn]);
}
/* ---------- tools and pointer ---------- */
const smallScreen = () => window.matchMedia('(max-width:860px)').matches;
const TOOL_HINT = { bed: 'Bed: drag a box on the plan.', area: 'Area: drag a box on the plan.', rows: 'Crop rows: drag a box; rows run along its width.', tank: 'Water tank: drag a box.', bench: 'Seed bench: drag a box.', building: 'Building: drag a box for the walls.', greenhouse: 'Greenhouse: drag a box.', pergola: 'Pergola: drag a box.',
  trellis: 'Trellis: tap each end or corner, then tap the last one again to finish.', wall: 'Retaining wall: tap each corner, then tap the last one again to finish.',
  path: 'Path: tap each corner, then tap the last one again to finish.', fence: 'Fence: tap each corner, then tap the last one again to finish.', pipe: 'Drip line: tap each corner, then tap the last one again to finish.',
  plant: 'Plant: tap where it goes.', note: 'Note: tap where it goes.', task: 'Job: tap where it is.', ground: 'Shape ground: drag on the plan. Two fingers move and zoom.', select: 'Select: tap an item; drag empty space to move around.' };
function setTool(t) {
  S.tool = t; S.draft = null;
  Object.entries(toolBtns).forEach(([k, b]) => b.setAttribute('aria-pressed', String(k === t)));
  svg.style.cursor = t === 'select' ? 'default' : 'crosshair';
  if (brushEl) brushEl.hidden = t !== 'ground';
  if (floatEl) floatEl.hidden = t !== 'ground';
  if (smallScreen() && document.body.classList.contains('show-left')) { document.body.classList.remove('show-left'); const h = TOOL_HINT[t]; if (h) toast(h, 3500); }
  if (t === 'ground') { S.contours = true; if (!S.plan.site.ground && S.contourStep > 0.25) S.contourStep = 0.25; }
  drawAll();
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
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; if (sculptDrag) cancelSculpt(); if (S.draft && S.draft.box) { S.draft = null; drawScene(); } pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), s: S.view.scale, mx: (a[0] + b[0]) / 2, my: (a[1] + b[1]) / 2 }; drag = null; return; }
    const p = toWorld(e), sp = [snap(p[0]), snap(p[1])];
    if (S.pickPoint) { const f = S.pickPoint; S.pickPoint = null; S.pickCancel = null; f([r2(Math.min(S.plan.site.w, Math.max(0, p[0]))), r2(Math.min(S.plan.site.h, Math.max(0, p[1])))]); return; }
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
    if (S.tool === 'ground') { if (e.pointerType === 'mouse' && e.button !== 0) return; startSculpt(p); drag = sculptDrag; return; }
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
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), bx = svg.getBoundingClientRect(), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2; S.view.x += mx - pinch.mx; S.view.y += my - pinch.my; pinch.mx = mx; pinch.my = my; zoomBy((pinch.s * d / pinch.d) / S.view.scale, mx - bx.left, my - bx.top); return; }
    const p = toWorld(e);
    if (S.tool === 'ground') { moveRing(p); if (drag && drag.sculpt) { sculptTo(p); return; } if (!drag) return; }
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
    if (d.sculpt) { endSculpt(); return; }
    if (d.draw) {
      const dr = S.draft; S.draft = null;
      let [x0, y0] = dr.a, [x1, y1] = dr.b;
      if (Math.abs(x1 - x0) < 0.1 || Math.abs(y1 - y0) < 0.1) { const def = { bed: [2.4, 1.2], area: [4, 3], tank: [1.4, 1.4], bench: [2, 0.6], rows: [10, 4], building: [10, 8], greenhouse: [3, 2.4], pergola: [4, 3] }[S.tool]; x1 = x0 + def[0]; y1 = y0 + def[1]; }
      add(Object.assign({ kind: S.tool, name: S.tool === 'rows' ? M.CROPS[S.crop][0] + ' rows' : M.KINDS[S.tool].name, x: r2((x0 + x1) / 2), y: r2((y0 + y1) / 2), w: r2(Math.abs(x1 - x0)), h: r2(Math.abs(y1 - y0)), rot: 0 }, S.tool === 'rows' ? { crop: S.crop } : {}));
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

/* ---------- 3D view (beta, open to every member) ---------- */
async function open3d() {
  btn3d.disabled = true;
  try { const mod = await import('./view3d.js'); await mod.open3D({ plan: exportPlan(), M, TR, date: S.plan.date, find: S.find || '', glow: [...new Set([...matchIds(), ...(S.find ? [] : [...S.sel])])] }); }
  catch (e) { toast('The 3D view could not start: ' + (e && e.message ? e.message : 'unknown error'), 6000); }
  btn3d.disabled = false;
}


/* ---------- shaping the ground by hand ---------- */
let gridCache = { gd: null, g: null };
function groundGrid() { const gd = S.plan.site.ground; if (!gd) return null; if (gridCache.gd !== gd) gridCache = { gd, g: TR.unpackGrid(gd) }; return gridCache.g; }
let brushEl, brushInfo, floatEl, ring = null, sculptDrag = null;
const POWER = { raise: [0.01, 0.03, 0.08], lower: [0.01, 0.03, 0.08], smooth: [0.2, 0.4, 0.8], flatten: [0.15, 0.35, 0.7] };
const BRUSH_OPS = [['raise', 'Raise'], ['lower', 'Lower'], ['smooth', 'Smooth'], ['flatten', 'Flatten']];
function brushBar() {
  const b = S.brush, ops = el('div', { class: 'addgrid', role: 'group', 'aria-label': 'Ground brush' });
  const paint = () => document.querySelectorAll('[data-op]').forEach(x => x.setAttribute('aria-pressed', String(x.dataset.op === b.op)));
  for (const [k, l] of BRUSH_OPS) ops.append(el('button', { type: 'button', class: 'chip', 'data-op': k, 'aria-pressed': String(k === b.op), onclick: () => { b.op = k; paint(); } }, [l]));
  const setSize = v => { b.size = Math.min(30, Math.max(0.5, Math.round(v * 2) / 2)); size.value = String(b.size); lbl.textContent = flbl.textContent = b.size + ' m'; if (ring) ring.setAttribute('r', b.size * S.view.scale); };
  const size = el('input', { type: 'range', min: '0.5', max: '30', step: '0.5', value: String(b.size), 'aria-label': 'Brush size in metres', oninput: e => setSize(+e.target.value) }), lbl = el('span', { class: 'small', text: b.size + ' m' }), flbl = el('span', { class: 'small', text: b.size + ' m' });
  floatEl = el('div', { class: 'pl-brushfloat', role: 'group', 'aria-label': 'Ground brush (quick)', hidden: true }, [
    ...BRUSH_OPS.map(([k, l]) => el('button', { type: 'button', class: 'chip', 'data-op': k, 'aria-pressed': String(k === b.op), onclick: () => { b.op = k; paint(); } }, [l])),
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Smaller brush', onclick: () => setSize(b.size > 3 ? b.size / 1.5 : b.size - 0.5) }, [icon('zoomOut')]), flbl,
    el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bigger brush', onclick: () => setSize(b.size >= 2 ? b.size * 1.5 : b.size + 0.5) }, [icon('zoomIn')]),
    el('button', { type: 'button', class: 'chip', text: 'Wizard…', title: 'Ground wizard: slopes, mounds, ponds, terraces and swales in plain terms', onclick: () => openGroundWizard() })]);
  const pow = el('select', { 'aria-label': 'Brush strength', onchange: e => { b.power = +e.target.value; } }, [['0', 'Gentle'], ['1', 'Normal'], ['2', 'Strong']].map(([v, t]) => el('option', { value: v, text: t })));
  pow.value = String(Math.min(2, b.power)); b.power = +pow.value;
  brushInfo = el('p', { class: 'small muted', text: 'Move over the plan to see the height.' });
  brushEl = el('div', { class: 'pl-guide', hidden: true }, [el('b', { text: 'Shape ground' }),
    el('p', { class: 'small', text: 'Drag to paint hills and hollows. Raise and Lower change the height, Smooth softens bumps, Flatten pulls the ground to the height where you start dragging (good for a pad or terrace). Ctrl+Z undoes a stroke.' }),
    el('button', { type: 'button', class: 'btn sm primary', text: 'Ground wizard…', onclick: () => openGroundWizard() }), el('p', { class: 'small muted', text: 'Or touch up by hand with a brush:' }),
    ops, el('label', { class: 'small pl-field' }, ['Brush size ', lbl, size]), el('label', { class: 'small pl-field' }, ['Strength', pow]), brushInfo]);
  return brushEl;
}
function moveRing(p) {
  if (!ring) { ring = sv('circle', { fill: 'none', stroke: '#2b6cb0', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }); overlay.append(ring); }
  const v = S.view; ring.setAttribute('cx', p[0] * v.scale + v.x); ring.setAttribute('cy', p[1] * v.scale + v.y); ring.setAttribute('r', S.brush.size * v.scale);   // the overlay is in screen pixels
  if (!brushInfo) return; const g = (sculptDrag && sculptDrag.g) || groundGrid();
  if (!g) { brushInfo.textContent = 'Flat ground. Height 0 m (heights are relative, so 0 is where you start).'; return; }
  const h = TR.heightAt(g, p[0], p[1]), sl = TR.slopeAt(g, p[0], p[1]);
  brushInfo.textContent = 'Height ' + r2(h) + ' m, slope ' + Math.round(sl.pct) + '%' + (sl.pct >= 2 ? ', falls toward ' + ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round((((sl.aspect - (S.plan.site.north || 0)) % 360 + 360) % 360) / 45) % 8] : '') + '.';
}
function startSculpt(p) {
  const site = S.plan.site, had = groundGrid();
  let g = had ? TR.fitGrid(had, site.w, site.h) : TR.flatSite(site.w, site.h);
  if (g === had) g = { cell: had.cell, nx: had.nx, ny: had.ny, z: had.z.slice() };   // work on a copy: the saved ground only changes when the stroke ends
  const b = S.brush, amt = POWER[b.op][Math.min(2, b.power)], level = TR.heightAt(g, p[0], p[1]);
  sculptDrag = { sculpt: true, g, stroke: TR.brushStroke(g, b.op, b.size, amt, level), raf: 0, hold: 0, at: p, still: performance.now() };
  sculptDrag.changed = sculptDrag.stroke.to(p[0], p[1]); liveDraw();
  sculptDrag.hold = setInterval(() => { const d = sculptDrag; if (d && performance.now() - d.still > 180 && d.stroke.again()) { d.changed = true; liveDraw(); } }, 140);
}
function sculptTo(p) { const d = sculptDrag; if (!d) return; if (Math.hypot(p[0] - d.at[0], p[1] - d.at[1]) > 1e-6) d.still = performance.now(); d.at = p; if (d.stroke.to(p[0], p[1])) d.changed = true; liveDraw(); }
/* a second finger (pinch to zoom) or Escape stops the stroke without keeping it */
function cancelSculpt() { const d = sculptDrag; sculptDrag = null; if (!d) return; clearInterval(d.hold); if (d.raf) cancelAnimationFrame(d.raf); contourCache = { gd: null, step: 0, lines: [] }; drawScene(); }
/* while shaping, pick a contour interval that shows the shape (unless the person chose one) */
function autoStep(g) { if (S.stepSet) return; const r = TR.range(g), f = r.max - r.min; S.contourStep = f < 0.6 ? 0.05 : f < 1.5 ? 0.1 : f < 4 ? 0.25 : f < 10 ? 0.5 : 1; }
function liveDraw() {
  const d = sculptDrag; if (!d || d.raf) return;
  d.raf = requestAnimationFrame(() => { d.raf = 0; autoStep(d.g); contourCache = { live: true, lines: TR.contours(d.g, S.contourStep) }; const at = d.at; drawScene(); if (at) moveRing(at); });
}
function endSculpt() {
  const d = sculptDrag; sculptDrag = null; if (!d) return;
  clearInterval(d.hold); if (d.raf) cancelAnimationFrame(d.raf);
  if (!d.changed) return;
  autoStep(d.g); S.plan.site.ground = TR.packGrid(d.g); S.contours = true; contourCache = { gd: null, step: 0, lines: [] }; commit();
}

/* ---------- ground wizard: whole shapes in plain terms (the brushes are for touching up) ---------- */
const COMPASS = [['north', 0], ['north-east', 45], ['east', 90], ['south-east', 135], ['south', 180], ['south-west', 225], ['west', 270], ['north-west', 315]];
const WIZ = [
  ['tilt', 'Slope the whole site', 'The whole yard falls one way, for example 0.5 m toward the north-east.'],
  ['mound', 'A mound or hill', 'A raised area, round in shape, with a flat-ish top.'],
  ['hollow', 'A hollow or pond', 'A dip with a flat bottom: a pond, a sunken garden, a soak.'],
  ['level', 'A level terrace for an item', 'Flatten the ground under a bed, bench, tank or area and blend it into the slope.'],
  ['swale', 'A swale along a line', 'A shallow trench along a path, drip line or fence you have drawn, with a bank on the lower side to hold water.']];
function pickOnPlan(hideEl, msg) {
  return new Promise(res => { hideEl.style.display = 'none'; toast(msg, 4000); S.pickPoint = p => { hideEl.style.display = ''; res(p); }; S.pickCancel = () => { hideEl.style.display = ''; res(null); }; });
}
function openGroundWizard(start) {
  const site = S.plan.site, body = el('div', { class: 'pl-wiz' }); let d;
  const now = () => groundGrid() || TR.flatSite(site.w, site.h);
  const choose = () => {
    body.textContent = '';
    body.append(el('p', { class: 'small muted', text: 'Pick what you want to do. You will see what it changes before anything happens, and Undo takes it back.' }),
      ...WIZ.map(([k, t, sub]) => el('button', { type: 'button', class: 'pl-wizcard', onclick: () => step(k) }, [el('b', { text: t }), el('span', { class: 'small muted', text: sub })])));
  };
  const num = (label, v, step_, min, max, unit) => { const i = el('input', { type: 'number', value: String(v), step: String(step_), min: String(min), max: String(max), inputmode: 'decimal' }); return [i, el('label', { class: 'small pl-field' }, [label + (unit ? ' (' + unit + ')' : ''), i])]; };
  const step = k => {
    body.textContent = ''; const def = WIZ.find(w => w[0] === k), out = el('p', { class: 'small', role: 'status' }), fields = [];
    let where = [site.w / 2, site.h / 2]; const whereTxt = el('span', { class: 'small' });
    const showWhere = () => { whereTxt.textContent = 'Middle at ' + r2(where[0]) + ' m across, ' + r2(where[1]) + ' m down.'; };
    const whereRow = () => el('div', { class: 'pl-field small' }, [whereTxt, el('div', { class: 'actions' }, [
      el('button', { type: 'button', class: 'btn sm', text: 'Tap the plan to choose', onclick: async () => { const p = await pickOnPlan(d.box.parentNode, 'Tap the plan where the middle should go. Esc to cancel.'); if (p) { where = p; showWhere(); preview(); } } }),
      el('button', { type: 'button', class: 'btn sm', text: 'Middle of the site', onclick: () => { where = [site.w / 2, site.h / 2]; showWhere(); preview(); } })])]);
    let make;   // (grid) => description of what was done, or an error string starting with '!'
    if (k === 'tilt') {
      const [fall, fl] = num('How much it falls', 0.5, 0.05, 0.05, 50, 'm'), dir = el('select', { 'aria-label': 'Falls toward' }, COMPASS.map(([n, b]) => el('option', { value: String(b), text: n }))); dir.value = '45';
      fields.push(fl, el('label', { class: 'small pl-field' }, ['Falls toward', dir]));
      make = w => { const f = +fall.value; if (!(f > 0 && f <= 50)) return '!Enter how many metres it falls.'; TR.tiltSite(w, site.w, site.h, f, +dir.value, site.north || 0); return 'falls ' + r2(f) + ' m toward the ' + dir.selectedOptions[0].text; };
    } else if (k === 'mound' || k === 'hollow') {
      const [dia, dl] = num('Across', k === 'mound' ? 4 : 3, 0.5, 0.5, 200, 'm'), [ht, hl] = num(k === 'mound' ? 'Height' : 'Depth', k === 'mound' ? 0.6 : 0.5, 0.05, 0.05, 20, 'm');
      fields.push(dl, hl, whereRow()); showWhere();
      make = w => { const a = +dia.value, hh = +ht.value; if (!(a > 0 && hh > 0)) return '!Enter the size.'; TR.dome(w, where[0], where[1], a, k === 'mound' ? hh : -hh, k === 'mound' ? 0.25 : 0.5); return (k === 'mound' ? 'a mound ' : 'a hollow ') + r2(a) + ' m across and ' + r2(hh) + ' m ' + (k === 'mound' ? 'high' : 'deep'); };
    } else if (k === 'level') {
      const list = items().filter(it => ['bed', 'bench', 'tank', 'area', 'rows'].includes(it.kind));
      if (!list.length) { body.append(el('p', { text: 'Draw a bed, bench, tank, area or crop rows first, then come back to level the ground under it.' }), el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn', text: 'Back', onclick: choose })])); return; }
      const pick = el('select', { 'aria-label': 'Item' }, list.map(it => el('option', { value: it.id, text: (it.name || M.KINDS[it.kind].name) + ' (' + M.KINDS[it.kind].name.toLowerCase() + ')' })));
      const sel = [...S.sel].map(byId).find(it => it && list.includes(it)); if (sel) pick.value = sel.id;
      const how = el('select', { 'aria-label': 'Level it at' }, [['mean', 'the average height (cut and fill)'], ['min', 'its lowest point (dig in)'], ['max', 'its highest point (build up)']].map(([v, l]) => el('option', { value: v, text: l })));
      fields.push(el('label', { class: 'small pl-field' }, ['Item', pick]), el('label', { class: 'small pl-field' }, ['Level it at', how]));
      make = w => { const it = byId(pick.value); if (!it) return '!Pick an item.'; const u = TR.groundUnder(w, it.x, it.y, it.w, it.h, it.rot || 0), lv = { mean: u.mean, min: u.min, max: u.max }[how.value];
        TR.levelBox(w, it.x, it.y, it.w, it.h, it.rot || 0, lv, Math.max(0.5, Math.min(2, Math.max(it.w, it.h) * 0.25))); return 'level ground at ' + r2(lv) + ' m under ' + (it.name || 'it'); };
    } else {
      const list = items().filter(it => ['path', 'pipe', 'fence'].includes(it.kind) && it.pts && it.pts.length >= 2);
      if (!list.length) { body.append(el('p', { text: 'Draw the line first: use the Path or Drip line tool along where the swale should go (across the slope, on the contour), then come back.' }), el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn', text: 'Back', onclick: choose })])); return; }
      const pick = el('select', { 'aria-label': 'Along' }, list.map(it => el('option', { value: it.id, text: (it.name || M.KINDS[it.kind].name) + ' (' + M.KINDS[it.kind].name.toLowerCase() + ')' })));
      const [wd, wl] = num('Width', 1, 0.1, 0.3, 10, 'm'), [dp, dl] = num('Depth', 0.3, 0.05, 0.05, 3, 'm'), bank = el('input', { type: 'checkbox', checked: true });
      fields.push(el('label', { class: 'small pl-field' }, ['Along', pick]), wl, dl, el('label', { class: 'small pl-check' }, [bank, ' Heap the soil as a bank on the lower side']));
      make = w => { const it = byId(pick.value); if (!it) return '!Pick a line.'; TR.swale(w, it.pts, +wd.value, +dp.value, bank.checked); return 'a swale ' + r2(+wd.value) + ' m wide and ' + r2(+dp.value) + ' m deep along ' + (it.name || 'the line'); };
    }
    const before = now(), r0 = TR.range(before);
    const preview = () => { const w = { cell: before.cell, nx: before.nx, ny: before.ny, z: before.z.slice() }, msg = make(w);
      if (msg.startsWith('!')) { out.className = 'small pl-warn'; out.textContent = msg.slice(1); return null; }
      const r1 = TR.range(w); out.className = 'small'; out.textContent = 'This makes ' + msg + '. The ground will run from ' + r2(r1.min) + ' m to ' + r2(r1.max) + ' m' + (groundGrid() ? ' (now ' + r2(r0.min) + ' to ' + r2(r0.max) + ' m).' : ' (it is flat now).'); return { w, msg }; };
    body.append(el('p', { class: 'small muted', text: def[2] }), ...fields, out, el('div', { class: 'actions' }, [
      el('button', { type: 'button', class: 'btn primary', text: 'Make it', onclick: () => { const r = preview(); if (!r) return; S.plan.site.ground = TR.packGrid(r.w); S.contours = true; d.close(); commit(); toast('Done: ' + r.msg + '. Undo takes it back.', 5000); } }),
      el('button', { type: 'button', class: 'btn', text: 'Back', onclick: choose })]));
    body.querySelectorAll('input,select').forEach(x => x.addEventListener('input', preview)); body.querySelectorAll('select').forEach(x => x.addEventListener('change', preview)); preview();
  };
  d = dialog('Ground wizard', [body], { onClose: () => { if (S.pickCancel) { S.pickPoint = null; S.pickCancel = null; } } });
  if (start) step(start); else choose();
}

/* ---------- the ground under a bed, bench, tank, area or crop rows ---------- */
function groundUnderPanel(it) {
  const g = groundGrid(); if (!g) return null;
  const u = TR.groundUnder(g, it.x, it.y, it.w, it.h, it.rot || 0), cm = v => Math.round(v * 100);
  const how = el('select', { 'aria-label': 'Level it at' }, [['mean', 'the average height (cut and fill)'], ['min', 'its lowest point (dig in)'], ['max', 'its highest point (build up)']].map(([v, l]) => el('option', { value: v, text: l })));
  const words = u.fall < 0.02 ? 'The ground here is level.' : 'The ground under it falls ' + cm(u.fall) + ' cm (from ' + r2(u.max) + ' m to ' + r2(u.min) + ' m).' + (it.kind === 'bed' && (it.raised || 0) >= 0.02 ? ' In 3D the bed is built level, with deeper boards on the low side.' : '');
  return el('div', { class: 'pl-guide' }, [el('b', { text: 'Ground under this' }), el('p', { class: 'small', text: words }),
    u.fall < 0.02 ? null : el('label', { class: 'small pl-field' }, ['Level it at', how]),
    u.fall < 0.02 ? null : el('button', { type: 'button', class: 'btn sm', text: 'Level the ground under this', onclick: () => {
      const w = { cell: g.cell, nx: g.nx, ny: g.ny, z: g.z.slice() }, level = { mean: u.mean, min: u.min, max: u.max }[how.value];
      TR.levelBox(w, it.x, it.y, it.w, it.h, it.rot || 0, level, Math.max(0.5, Math.min(2, Math.max(it.w, it.h) * 0.25)));
      S.plan.site.ground = TR.packGrid(w); commit(); toast('Ground levelled at ' + r2(level) + ' m under ' + (it.name || 'this') + ', blending into the slope around it. Ctrl+Z undoes it.', 5000);
    } })]);
}

/* ---------- ground heights from a file ---------- */
function groundPanel(s) {
  const gd = s.ground, g = gd && TR.unpackGrid(gd), box = el('div', { class: 'pl-guide' });
  if (g) {
    const r = TR.range(g), sl = el('select', { 'aria-label': 'Contour interval', onchange: e => { S.contourStep = +e.target.value; S.stepSet = true; drawScene(); } }, [0.05, 0.1, 0.25, 0.5, 1, 2, 5].map(v => el('option', { value: String(v), text: v + ' m' })));
    sl.value = String(S.contourStep);
    const cb = el('input', { type: 'checkbox', checked: S.contours, onchange: e => { S.contours = e.target.checked; drawScene(); } });
    box.append(el('b', { text: 'Ground heights are set' }), el('p', { class: 'small', text: 'Lowest ' + r2(r.min) + ' m, highest ' + r2(r.max) + ' m: a fall of ' + r2(r.max - r.min) + ' m across the site. One height every ' + gd.cell + ' m.' }),
      el('label', { class: 'small pl-check' }, [cb, ' Show contour lines']), el('label', { class: 'small pl-field' }, ['Contour every', sl]),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm primary', text: 'Ground wizard…', onclick: () => openGroundWizard() }), el('button', { type: 'button', class: 'btn sm', text: 'Replace from a file…', onclick: importGround }), el('button', { type: 'button', class: 'btn sm', text: 'Remove', onclick: async () => { if (!(await confirmBox('Remove ground heights', 'The site goes back to flat ground.', 'Remove'))) return; delete S.plan.site.ground; S.contours = false; commit(); } })]));
  } else box.append(el('b', { text: 'Ground heights' }), el('p', { class: 'small', text: 'The ground is flat until you add heights. Shape it with the Ground wizard (slopes, mounds, ponds, terraces, swales) or the Shape ground brushes (G), or bring in real mapping data from a file: an ASCII grid (.asc, such as a free 1 m LiDAR ground model) or a list of survey points (.csv or .xyz with x, y, height on each line). The file stays on your device.' }),
    el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm primary', text: 'Ground wizard…', onclick: () => openGroundWizard() }), el('button', { type: 'button', class: 'btn sm', text: 'Add ground heights from a file…', onclick: importGround })]));
  return box;
}
async function importGround() {
  const f = await pickFile('.asc,.tif,.tiff,.txt,.csv,.xyz,image/tiff,text/plain,text/csv'); if (!f) return;
  let data;
  try {
    const head = new Uint8Array(await f.slice(0, 4).arrayBuffer()), isTiff = (head[0] === 0x49 && head[1] === 0x49 && head[2] === 42) || (head[0] === 0x4d && head[1] === 0x4d && head[3] === 42) || (head[0] === 0x49 && head[1] === 0x49 && head[2] === 43);
    if (isTiff) data = await parseGeoTiff(await f.arrayBuffer());
    else { const text = await f.text(); data = /^\s*ncols\b/i.test(text) ? TR.parseAscii(text) : TR.parsePoints(text); }
  } catch (e) { toast(e.message || 'That file could not be read.', 6000); return; }
  const s = S.plan.site, crs = el('select', { 'aria-label': 'Coordinates in the file' }, [el('option', { value: 'utm', text: 'Metres (UTM or MGA, e.g. MGA zone 56)' }), el('option', { value: 'latlon', text: 'Degrees (longitude, latitude)' })]);
  if (data.crs && data.crs.kind === 'latlon') crs.value = 'latlon'; else if (data.crs && data.crs.kind === 'utm') crs.value = 'utm'; else if (data.kind === 'grid' ? data.xll > -400 && data.xll < 400 && data.yll > -100 && data.yll < 100 : data.xs.every(v => Math.abs(v) <= 360) && data.ys.every(v => Math.abs(v) <= 90)) crs.value = 'latlon';
  const cell = el('select', { 'aria-label': 'Height every' }, [0.5, 1, 2, 5, 10].map(v => el('option', { value: String(v), text: v + ' m' }))); cell.value = s.w * s.h > 100000 ? '2' : '1';
  const msg = el('p', { class: 'small', role: 'status' });
  const d = dialog('Ground heights from a file', [el('div', {}, [
    el('p', { text: (data.kind === 'grid' ? 'Height grid: ' + data.ncols + ' x ' + data.nrows + ' values, one every ' + data.cs + ' m.' : data.xs.length.toLocaleString() + ' survey points.') }),
    el('p', { class: 'pl-warn small', text: 'Your site is placed using its centre at latitude ' + s.lat + ', longitude ' + s.lon + ', with north at ' + s.north + ' degrees. If those are not right, close this and set them in Plan settings first, or the heights will land in the wrong place.' }),
    el('label', { class: 'small pl-field' }, ['Coordinates in the file', crs]), el('label', { class: 'small pl-field' }, ['Keep one height every', cell]), msg,
    (data.crs && data.crs.kind === 'unknown') ? el('p', { class: 'small pl-warn', text: 'This file uses a map projection I do not recognise' + (data.crs.epsg ? ' (EPSG ' + data.crs.epsg + ')' : '') + '. Check the coordinate type below, or ask for the file in MGA or UTM metres or in degrees.' }) : (data.crs && data.crs.kind === 'utm') ? el('p', { class: 'small', text: 'Map projection: UTM / MGA zone ' + data.crs.zone + ' (found in the file).' }) : null,
    el('p', { class: 'small muted', text: 'LiDAR files show bare ground, not recent earthworks or raised beds. Phone GPS heights are not accurate enough to use.' }),
    el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Add to the plan', onclick: () => {
      try {
        const r = TR.importHeights(data, s, { crs: crs.value, cell: +cell.value, zone: data.crs && data.crs.kind === 'utm' ? data.crs.zone : undefined });
        if (r.covered < 0.98 && !confirm('The file covers only ' + Math.round(r.covered * 100) + '% of your site. The rest will be filled in from the nearest heights. Use it anyway?')) return;
        s.ground = TR.packGrid(r.grid); S.contours = true; d.close(); commit(); toast('Ground heights added: ' + r2(r.min) + ' to ' + r2(r.max) + ' m.', 5000);
      } catch (e) { msg.className = 'small pl-warn'; msg.textContent = e.message; }
    } }), el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => d.close() })])])]);
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
    if (e.key === 'Escape' && sculptDrag) { cancelSculpt(); return; }
    if (e.key === 'Escape' && S.pickPoint) { const c = S.pickCancel; S.pickPoint = null; S.pickCancel = null; if (c) c(); return; }
    if (e.key === 'Escape') { if (S.draft) { S.draft = null; drawAll(); } else if (S.ctx) doneEditing(); else select(null); return; }
    if (e.key === 'Enter' && S.draft && S.draft.pts) { finishLine(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel.size) { e.preventDefault(); removeSel(); return; }
    if (e.key.startsWith('Arrow') && S.sel.size) {
      e.preventDefault(); const g = S.plan.site.grid * (e.shiftKey ? 5 : 1), d = { ArrowLeft: [-g, 0], ArrowRight: [g, 0], ArrowUp: [0, -g], ArrowDown: [0, g] }[e.key];
      [...S.sel].map(byId).filter(it => it && !it.locked).forEach(it => M.moveItem(it, d[0], d[1])); commit('nudge'); return;
    }
    if (!mod && !e.altKey) { const t = { v: 'select', b: 'bed', a: 'area', p: 'path', f: 'fence', l: 'plant', w: 'tank', d: 'pipe', s: 'bench', n: 'note', j: 'task', r: 'rows', g: 'ground', h: 'building', e: 'greenhouse', o: 'pergola', t: 'trellis', k: 'wall' }[k]; if (t) setTool(t); }
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
const pickF = (label, it, key, opts) => el('label', { class: 'small pl-field' }, [label, (() => { const sl = el('select', { onchange: e => { it[key] = e.target.value; commit(); } }, opts.map(([v, l]) => el('option', { value: v, text: l }))); sl.value = it[key] || opts[0][0]; return sl; })()]);
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
      sec('Ground heights'),
      groundPanel(s),
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
  if (k.box && S.plan.site.ground && ['bed', 'bench', 'tank', 'area', 'rows', 'building', 'greenhouse', 'pergola'].includes(it.kind) && !S.ctx) put(groundUnderPanel(it));
  if (it.kind === 'rows') {
    const L = M.rowsLayout(it);
    section('Crop and dates');
    put(el('label', { class: 'small pl-field' }, ['Crop', (() => { const sl = el('select', { onchange: e => { const g = GUIDES[e.target.value] || GUIDES.other; Object.assign(it, { crop: e.target.value, rowSpacing: g[4] || it.rowSpacing, plantSpacing: g[3] || it.plantSpacing }); if (/ rows$/.test(it.name)) it.name = M.CROPS[e.target.value][0] + ' rows'; commit(); } }, cropOptions()); sl.value = it.crop; return sl; })()]),
      field('Variety', it.variety, v => { it.variety = String(v).slice(0, 60); }, { maxlength: '60' }), lookRow(it),
      el('div', { class: 'pl-row' }, [numF('Row spacing (m)', it, 'rowSpacing', 0.05, 0.05, 50), numF('Plant spacing (m)', it, 'plantSpacing', 0.05, 0.02, 50)]),
      el('p', { class: 'small muted', text: L.rows.toLocaleString() + ' rows of ' + L.cols.toLocaleString() + ' plants = ' + L.count.toLocaleString() + ' plants. Saved as one rule, not one object per plant.' + (L.rowSpacing !== it.rowSpacing ? ' Spacing was widened to keep this under 2 million plants.' : '') }),
      el('div', { class: 'pl-row' }, [field('Sow / plant', it.sow, v => { it.sow = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }, { type: 'date' }), field('Harvest', it.harvest, v => { it.harvest = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }, { type: 'date' })]),
      numF('Remind me (days before)', it, 'remind', 1, 0, 60),
      el('p', { class: 'small muted', text: 'Rows run along the width and are spaced across the depth. Turn the box to angle them.' }));
  }
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
  if (it.kind === 'area' || it.kind === 'path') { const opts = it.kind === 'area' ? ['', 'lawn', 'gravel', 'mulch', 'soil', 'pavers', 'decking'] : ['', 'gravel', 'pavers', 'mulch', 'decking', 'lawn'], names = { '': it.kind === 'area' ? 'Guess from the name and colour' : 'Gravel (standard)', lawn: 'Lawn', gravel: 'Gravel', mulch: 'Bark mulch', soil: 'Soil', pavers: 'Pavers', decking: 'Decking' };
    put(el('label', { class: 'small pl-field' }, ['Surface in 3D', (() => { const sl = el('select', { onchange: e => { if (e.target.value) it.surface = e.target.value; else delete it.surface; commit(); } }, opts.map(v => el('option', { value: v, text: names[v] }))); sl.value = it.surface || ''; return sl; })()])); }
  if (it.kind === 'path') put(numF('Width (m)', it, 'width', 0.1, 0.1, 20));
  if (it.kind === 'fence') put(numF('Height (m)', it, 'height', 0.1, 0.1, 6), pickF('Style', it, 'style', [['palings', 'Timber palings'], ['pickets', 'Pickets'], ['slats', 'Horizontal slats'], ['wire', 'Wire and posts'], ['panels', 'Steel panels']]), field('Colour (leave for the standard)', it.colour || '#6b5238', v => { if (/^#[0-9a-f]{6}$/i.test(v)) it.colour = v; }, { type: 'color' }));
  if (it.kind === 'trellis') put(numF('Height (m)', it, 'height', 0.1, 0.3, 5), pickF('Style', it, 'style', [['wire', 'Wires between posts'], ['lattice', 'Timber lattice'], ['mesh', 'Mesh panel']]), el('p', { class: 'small muted', text: 'For climbing beans, peas, grapes, passionfruit and espalier.' }));
  if (it.kind === 'wall') put(numF('Height (m)', it, 'height', 0.05, 0.1, 4), pickF('Material', it, 'material', [['sleeper', 'Timber sleepers'], ['stone', 'Stone'], ['block', 'Concrete block'], ['brick', 'Brick']]), el('p', { class: 'small muted', text: 'In 3D the wall stands on the lower ground and its top follows the higher side. Shape the ground (or use the Ground wizard, Level) to make the terrace behind it.' }));
  if (it.kind === 'building') put(numF('Wall height (m)', it, 'wallH', 0.1, 0.5, 30),
    pickF('Roof', it, 'roof', [['gable', 'Gable (two slopes)'], ['hip', 'Hip (four slopes)'], ['skillion', 'Skillion (one slope)'], ['flat', 'Flat']]),
    it.roof === 'flat' ? null : numF('Roof pitch (degrees)', it, 'pitch', 1, 0, 60),
    it.roof === 'flat' ? null : pickF('Ridge runs', it, 'ridge', [['auto', 'Along the longer side'], ['w', 'Along the width'], ['h', 'Along the depth']]),
    el('div', { class: 'pl-row' }, [field('Walls', it.wallColour, v => { if (/^#[0-9a-f]{6}$/i.test(v)) it.wallColour = v; }, { type: 'color' }), field('Roof', it.roofColour, v => { if (/^#[0-9a-f]{6}$/i.test(v)) it.roofColour = v; }, { type: 'color' })]),
    (() => { const cb = el('input', { type: 'checkbox', checked: it.windows !== false, onchange: e => { it.windows = e.target.checked; commit(); } }); return el('label', { class: 'small pl-check' }, [cb, ' Windows and a door']); })(),
    el('p', { class: 'small muted', text: 'A house, garage or shed. Its shadow shows in 3D on High and Ultra quality.' }));
  if (it.kind === 'greenhouse') put(numF('Wall height (m)', it, 'wallH', 0.1, 0.5, 8), field('Frame colour', it.frame, v => { if (/^#[0-9a-f]{6}$/i.test(v)) it.frame = v; }, { type: 'color' }));
  if (it.kind === 'pergola') put(numF('Height (m)', it, 'height', 0.1, 1, 6), pickF('Cover', it, 'cover', [['open', 'Open rafters'], ['shade', 'Shade cloth'], ['vine', 'Grown over with a vine'], ['roof', 'Clear roof sheets']]), field('Timber colour', it.colour, v => { if (/^#[0-9a-f]{6}$/i.test(v)) it.colour = v; }, { type: 'color' }));
  if ((it.kind === 'bed' || it.kind === 'area') && !S.ctx) put((() => { const cb = el('input', { type: 'checkbox', checked: it.shape === 'round', onchange: e => { if (e.target.checked) it.shape = 'round'; else delete it.shape; commit(); } }); return el('label', { class: 'small pl-check' }, [cb, ' Round (fits a circle or oval in the box)']); })());
  if (k.line) put(el('p', { class: 'small muted', text: 'Length: ' + r2(it.pts.reduce((n, p, i) => n + (i ? Math.hypot(p[0] - it.pts[i - 1][0], p[1] - it.pts[i - 1][1]) : 0), 0)) + ' m. Drag the corner squares to reshape.' }));
  if (it.kind === 'plant') {
    section('Crop and dates');
    put(el('label', { class: 'small pl-field' }, ['Crop', (() => { const sl = el('select', { onchange: e => { const c = M.CROPS[e.target.value]; Object.assign(it, { crop: e.target.value, shape: c[1], spread: c[2], height: c[3] }); commit(); } }, cropOptions()); sl.value = it.crop; return sl; })()]),
      it.link ? el('p', { class: 'small pl-good', text: 'Linked to the app: ' + (((S.places.plants || []).find(p => p.id === it.link) || {}).title || 'a plant record') + '. The plan for the app refers to this record.' }) : null,
      field('Variety', it.variety, v => { it.variety = String(v).slice(0, 60); }, { maxlength: '60' }), lookRow(it),
      el('div', { class: 'pl-row' }, [numF('Spread (m)', it, 'spread', 0.05, 0.02, 40), numF('Height (m)', it, 'height', 0.1, 0.02, 40)]),
      el('div', { class: 'pl-row' }, [field('Sow / plant', it.sow, v => { it.sow = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }, { type: 'date' }), field('Harvest', it.harvest, v => { it.harvest = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }, { type: 'date' })]),
      numF('Remind me (days before)', it, 'remind', 1, 0, 60),
      (() => { const cb = el('input', { type: 'checkbox', checked: !!it.save, onchange: e => { if (e.target.checked) it.save = true; else delete it.save; commit(); } }); return el('label', { class: 'small pl-check' }, [cb, ' Saving seed from this plant']); })());
    { const facts = plantFacts(it.crop); if (facts) put(facts); }
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

/* ---------- plant editor: the member's own plant looks (planner/editor.js) ---------- */
const lookName = it => (it.look && S.plan.varieties && S.plan.varieties[it.look] ? S.plan.varieties[it.look].name : '');
function lookRow(it) {
  const own = lookName(it);
  return el('div', { class: 'pl-look' }, [el('span', { class: 'small', text: 'Look in 3D: ' + (own || 'the default ' + M.CROPS[it.crop][0].toLowerCase()) }),
    el('button', { type: 'button', class: 'btn small', text: own ? 'Edit this plant…' : 'Edit this plant\'s look…', onclick: () => editLook(it) }),
    own ? el('button', { type: 'button', class: 'btn small', text: 'Back to default', onclick: () => { delete it.look; commit(); } }) : null,
    el('button', { type: 'button', class: 'btn small', text: 'My plants…', onclick: () => openMyPlants(it) })]);
}
async function editLook(it) {
  const E = await import('./editor.js'), base = M.presetFor(it.crop, it.variety);
  E.openPlantEditor({ baseKey: base, variety: it.look && S.plan.varieties ? S.plan.varieties[it.look] : null, cropName: M.CROPS[it.crop][0].toLowerCase(), cropLabel: M.CROPS[it.crop][0], onUse: (v, o) => useLook(it, v, o) });
}
async function openMyPlants(it) {
  const E = await import('./editor.js'), one = it && it.id && (it.kind === 'plant' || it.kind === 'rows') ? it : null;
  E.openLibrary({ onPick: one ? (v, o) => useLook(one, v, o) : undefined });
}
/* put a variety into the plan and on the plant (and on its other plantings: all of the crop if asked, and every planting already using it) */
async function useLook(it, v, o = {}) {
  const P = await import('./plants/plants.js');
  S.plan.varieties = S.plan.varieties || {}; S.plan.varieties[v.id] = v;
  let ex = { h: 0, r: 0 }; try { ex = P.extent(P.specFromJSON(P.specToJSON(v.spec)), 1); } catch { /* keep the old size */ }
  const walk = (list, f) => list.forEach(x => { if (x.kind === 'block') walk(((S.plan.blocks[x.def] || {}).items) || [], f); else f(x); });
  const targets = new Set([it]); walk([...S.plan.items, ...Object.values(S.plan.blocks).flatMap(b => b.items)], x => { if ((x.kind === 'plant' || x.kind === 'rows') && ((o.all && x.crop === it.crop) || x.look === v.id)) targets.add(x); });
  for (const t of targets) { t.look = v.id; if (!t.variety) t.variety = v.name; if (t.kind === 'plant' && ex.r) { t.spread = r2(Math.max(0.02, 2 * ex.r)); t.height = r2(Math.max(0.02, ex.h)); } }
  commit(); toast('Using ' + v.name + (targets.size > 1 ? ' on ' + targets.size + ' plantings' : ''));
}

/* ---------- Scan a drawing (AI helper, the member's own key) ---------- */
function scanDrawing() {
  const s = S.plan.site;
  scanDialog({ title: 'Scan a garden drawing', unit: 'm', labels: ['Width', 'Depth'], start: [Math.round(s.w) || 20, Math.round(s.h) || 15], min: 1, max: 5000, step: 0.5, consentKind: 'drawing', goText: 'Lay out the plan',
    consentText: 'LT-Planner sends your photo of the drawing so the AI can find the lawns, beds, paths, buildings and fences and measure where they are.',
    intro: 'Take a photo of a drawing of your garden or property (a sketch, a landscape plan or a printed site plan), from above if you can, and give the real size of the whole drawn area. LT-Planner lays out the areas, beds, paths, fences, buildings and existing trees, so you can add the planting yourself. It starts a new plan, so download this one first if you want to keep it.',
    onGo: async (photo, w, h) => {
      const reply = await askAI({ images: [photo], text: drawingPrompt(w, h), maxTokens: 8000 });
      const r = planFromReply(parseReplyJSON(reply), { w, h, name: 'Scanned plan', base: S.plan });
      if (!r.total) throw new Error('Nothing could be laid out from that photo. Try a sharper photo from straight above, with the whole drawing in view.');
      if (S.plan.items.length && !(await leaveOk())) throw new Error('Kept your current plan.');
      loadPlan(r.plan);
      const c = r.counts, bits = [['area', 'area'], ['bed', 'bed'], ['building', 'building'], ['path', 'path'], ['fence', 'fence'], ['plant', 'tree'], ['note', 'note']].filter(([k]) => c[k]).map(([k, w1]) => c[k] + ' ' + w1 + (c[k] > 1 ? 's' : ''));
      return 'Laid out ' + (bits.join(', ') || r.total + ' items') + '. Check the sizes and positions, then set the location in Plan settings for the planting guide.';
    } });
}
const leaveOk = () => confirmBox('Start another plan?', 'This plan stays only until you start another. Download it first if you want to keep it.', 'Continue');
async function openFile() {
  const f = await pickFile('.ltplan,application/json'); if (!f) return;
  try { const p = M.cleanPlan(JSON.parse(await f.text())); if (!(await leaveOk())) return; loadPlan(p); toast('Opened "' + p.name + '"'); }
  catch (e) { toast(e && e.message && e.message.length < 120 ? e.message : 'That file is not an LT-Planner plan.', 5000); }
}

/* test hook: the QA script reads the plan from here (nothing secret: it is the plan on screen) */
function syncHash() { window.__ltPlanner = { plan: S.plan, sel: [...S.sel], ctx: S.ctx, tool: S.tool, view: S.view }; }
