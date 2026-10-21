/* LT-Print: start-up, the membership gate, saved state, the top bar (steps, file menu, undo and redo), and the
   New / Open / Save dialogs. */
import { CFG, loadConfig, el, icon, toast, dialog, confirmBox, store, gate, REASONS, signInUrl, rootUrl, fmtDay, registerSW } from '../kit/core.js';
import { topBar } from '../kit/bar.js';
import { history } from '../kit/history.js';
import { storageFor, downloadText, pickFile, dropboxHandleRedirect, dropboxSignIn, dropboxConnected, dropboxForget } from '../kit/files.js';
import { cleanTemplate, blankTemplate, sampleRow, KINDS, EXT, FORMAT, commonValues, numberText, usedFields, parseTable, MAX_ASSET } from './model.js';
import { starter, starterList, addressStarter } from './starters.js';
import { LIBRARY, LIBRARY_GROUPS, libraryDesign, exampleCSV, exampleRow } from './library.js';
import { labelHTML, fitText } from './render.js';
import { takeHandoff, hasBrand } from '../kit/brand.js';
import { designView, setLogo, LABEL_CSS } from './editor.js';
import { recordsView } from './records.js';
import { printView } from './printing.js';

const app = document.getElementById('app');
const K = { doc: 'ltprint_doc', data: 'ltprint_data', prefs: 'ltprint_prefs', lib: 'ltprint_lib', where: 'ltprint_where' };
const prefs = store.get(K.prefs, {}) || {};
const S = {
  t: null, sel: new Set(), step: 'design', preview: '', zoomFit: true,
  snap: prefs.snap !== false, grid: [0.5, 1, 2, 5].includes(prefs.grid) ? prefs.grid : 1,
  appUrl: typeof prefs.appUrl === 'string' && /^https?:\/\//.test(prefs.appUrl) ? prefs.appUrl : CFG.APP,
  print: Object.assign({ paper: 'a4', layout: 'auto', margin: 8, gap: 2, skip: 0, guides: true, blank: 1 }, prefs.print || {}),
  data: null, appData: null, chosen: {}, copies: {}, file: null, saved: '',
};
const storage = storageFor({ driveRole: 'ltprint', driveName: 'LT-Print designs', dbxPath: '/LT-Print', ext: EXT });
let hist, design, records, printing, views = {}, titleEl, undoB, redoB;

/* ---------- start ---------- */
(async function start() {
  registerSW();
  await loadConfig();
  if (!prefs.appUrl) S.appUrl = CFG.APP;
  const g = await gate('print');
  if (!g.ok) { showGate(g.reason); return; }
  try {
    const b = await (await fetch(rootUrl('brand/logo-icon.svg'))).blob();
    setLogo(await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = () => r(''); fr.readAsDataURL(b); }));
  } catch { /* the logo just will not show */ }
  loadState();
  build(g);
  const dbx = await dropboxHandleRedirect();
  if (dbx) {
    if (!dbx.ok) toast(dbx.msg);
    else if (dbx.ret.sync) { go('records'); ctx.fromSync('dropbox'); }
    else if (dbx.ret.open) openDialog('dropbox');
    else if (dbx.ret.save) saveDialog('dropbox');
    else toast('Dropbox connected');
  }
  const handoff = takeHandoff('print');
  if (handoff && typeof handoff.csv === 'string') applyHandoff(handoff);
  if (g.preview) toast('LT-Print is not open to everyone yet. You can try it because you are staff.', 5000);
})();

/* Rows (and the seller's brand) passed over from LT-Catalogue on this device: they become a fresh branded design with the rows loaded */
function applyHandoff(h) {
  const { columns, rows } = parseTable(h.csv);
  if (!columns.length || !rows.length) return;
  const br = h.brand && typeof h.brand === 'object' ? h.brand : null;
  const branded = !!(br && (br.name || br.logo));
  const address = h.kind === 'address';
  const t = address ? addressStarter(99.1, 67.7, columns) : branded ? starter('branded', 'table', 90, 55, columns) : starter('front', 'table', 60, 40, columns);
  t.name = String(h.label || 'Catalogue labels').slice(0, 60);
  if (address) { S.print.layout = 's8'; S.print.paper = 'a4'; savePrefs(); }
  if (branded && !address) {
    const logoOk = typeof br.logo === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(br.logo) && br.logo.length <= MAX_ASSET * 1.37;
    if (logoOk) t.assets.brand = br.logo;
    for (const it of t.items) {
      if (it.name === 'Tree logo' && logoOk) { it.asset = 'brand'; it.name = 'Your logo'; }
      if (it.name === 'Band title' && br.name) it.text = String(br.name).slice(0, 60);
      if (it.name === 'Band' && /^#[0-9a-fA-F]{6}$/.test(br.ink || '')) it.fill = br.ink;
    }
  }
  /* the seller's labels carry the seller's brand only: no Lineage Tracker mark, address or tree */
  t.items = t.items.filter(it => it.name !== 'Web address' && !(it.name === 'Tree logo') && !(it.name === 'Band title' && !(branded && br.name)));
  const logoUsed = t.items.some(it => it.name === 'Your logo');
  if (!logoUsed && t.assets) delete t.assets.logo;
  t.own = S.t.own; t.own.on = false; t.counter = S.t.counter;
  S.data = { source: 'table', label: t.name, rows: { table: rows }, columns };
  S.appData = null; S.chosen = {}; S.copies = {};
  setDoc(t, null); saveData(); go('records');
  toast(address ? `${rows.length} order${rows.length === 1 ? '' : 's'} loaded as address labels. Pick the ones to print.` : `${rows.length} rows from LT-Catalogue are loaded. Pick the ones to print.`, 5000);
}
function showGate(reason) {
  const msg = REASONS[reason] || REASONS.error;
  const out = reason === 'signed_out' || reason === 'offline';
  app.textContent = '';
  app.append(topBar({ tool: 'print' }), el('main', { class: 'gate' }, [
    el('img', { class: 'logo logo-light', src: rootUrl('brand/logo-icon.svg'), alt: '' }), el('img', { class: 'logo logo-dark', src: rootUrl('brand/logo-icon-dark.svg'), alt: '' }),
    el('h1', { text: 'LT-Print' }),
    el('p', { class: 'muted', text: 'Design your own labels and stickers, filled in from your Lineage Tracker records. Free with a Lineage Tracker account.' }),
    el('div', { class: 'card' }, [
      el('p', { text: msg }),
      el('div', { class: 'actions' }, [
        out ? el('a', { class: 'btn primary', href: signInUrl('print/') }, ['Sign in']) : null,
        out ? el('a', { class: 'btn', href: CFG.SITE + '/register.html' }, ['Create a free account']) : null,
        reason === 'needs_terms' ? el('a', { class: 'btn primary', href: CFG.SITE + '/account.html' }, ['Open my account']) : null,
        reason === 'error' ? el('button', { type: 'button', class: 'btn primary', text: 'Try again', onclick: () => location.reload() }) : null,
        el('a', { class: 'btn', href: rootUrl('') }, ['All tools'])]),
      el('p', { class: 'small muted', text: 'Your designs are saved to your own Google Drive, Dropbox or device, never to our server. The account only lets us know who uses the tools.' }),
    ]),
  ]));
}

/* ---------- saved state ---------- */
function loadState() {
  const saved = store.get(K.doc);
  try { S.t = saved && saved.t ? cleanTemplate(saved.t) : null; } catch { S.t = null; }
  if (S.t) S.file = saved.file && typeof saved.file === 'object' ? { where: String(saved.file.where || ''), id: String(saved.file.id || ''), name: String(saved.file.name || '') } : null;
  if (!S.t) { S.t = starter('tag', 'individual', 75, 25); S.t.name = 'My first label'; }
  S.saved = saved && saved.savedSnap || '';
  const d = store.get(K.data);
  if (d && d.rows && typeof d.rows === 'object') {
    S.data = { source: d.source === 'table' ? 'table' : 'app', label: String(d.label || 'records'), rows: {}, columns: Array.isArray(d.columns) ? d.columns.map(String).slice(0, 40) : [] };
    for (const k of Object.keys(KINDS)) if (Array.isArray(d.rows[k])) S.data.rows[k] = d.rows[k].filter(r => r && typeof r === 'object' && r._id).map(r => Object.fromEntries(Object.entries(r).filter(([, v]) => typeof v !== 'object').map(([k2, v]) => [k2, typeof v === 'boolean' ? v : String(v).slice(0, 2000)])));
    S.chosen = d.chosen && typeof d.chosen === 'object' ? d.chosen : {};
    S.copies = d.copies && typeof d.copies === 'object' ? d.copies : {};
  }
}
let saveTimer = 0, warned = false;
function autosave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!store.set(K.doc, { t: S.t, file: S.file, savedSnap: S.saved }) && !warned) { warned = true; toast('This design is too big to keep in the browser. Save it to a file or to Drive or Dropbox', 6000); }
    refreshTitle();
  }, 400);
}
function saveData() {
  if (!S.data) { store.del(K.data); return; }
  if (!store.set(K.data, { source: S.data.source, label: S.data.label, rows: S.data.rows, columns: S.data.columns, chosen: S.chosen, copies: S.copies })) toast('These records are too many to keep for next time. They still work until you close the page');
}
function savePrefs() { store.set(K.prefs, { snap: S.snap, grid: S.grid, appUrl: S.appUrl, print: S.print }); }
// pictures are kept out of the undo snapshots (they can be large); every picture used this session stays in this pool,
// so undo and redo can always put them back
const assetPool = {};
const snapOf = () => { Object.assign(assetPool, S.t.assets); return JSON.stringify({ ...S.t, assets: Object.keys(S.t.assets) }); };
/* a clean copy for saving: unused pictures dropped, everything checked */
const exportT = () => cleanTemplate(JSON.parse(JSON.stringify(S.t)));

/* ---------- shared bits the views use ---------- */
const ctx = {
  S, autosave, saveData, savePrefs,
  commit(key) { hist.commit(key); autosave(); },
  go, refreshAll, refreshTitle,
  rowsOfKind: kind => S.data?.rows?.[kind] || [],
  rowFor(v) {
    const extra = { ...commonValues(), number: numberText(S.t.counter, 0) };
    if (v && v.startsWith('own:')) { const r = (S.t.own.rows || []).find(x => x._id === v.slice(4)); if (r) return { ...extra, ...r }; }
    if (v && v.startsWith('rec:')) { const r = (S.data?.rows?.[S.t.kind] || []).find(x => x._id === v.slice(4)); if (r) return { ...extra, ...r }; }
    if (v === 'fill') return { ...extra, ...(S.print.fill || {}) };
    return { ...extra, ...sampleRow(S.t.kind, v === 'sample-a', S.t.kind === 'table' ? [...new Set([...S.t.columns, ...usedFields(S.t)])] : S.t.columns) };
  },
};

/* ---------- the page ---------- */
function build(g) {
  document.head.append(el('style', { text: LABEL_CSS }));
  hist = history({ snap: snapOf, restore: s => { const o = JSON.parse(s); o.assets = Object.fromEntries(o.assets.filter(k => assetPool[k]).map(k => [k, assetPool[k]])); S.t = o; refreshAll(); design.selChanged(); autosave(); }, onChange: st => { if (undoB) { undoB.disabled = !st.canUndo; redoB.disabled = !st.canRedo; } } });
  const steps = el('div', { class: 'seg', role: 'group', 'aria-label': 'Steps' });
  [['design', 'Design'], ['records', 'Records'], ['print', 'Print']].forEach(([v, l], i) => steps.append(el('button', { type: 'button', 'data-step': v, onclick: () => go(v) }, [el('span', { class: 'num', text: String(i + 1) }), el('span', { class: 'lbl', text: l })])));
  const fileBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Designs: new, open, save', title: 'Designs' }, [icon('folder'), el('span', { class: 'hide-xs', text: 'Designs' })]);
  fileBtn.classList.add('wide');
  const fileWrap = el('div', { class: 'kswitch' }, [fileBtn]);
  let menu = null;
  const closeMenu = () => { if (menu) { menu.remove(); menu = null; fileBtn.setAttribute('aria-expanded', 'false'); } };
  fileBtn.setAttribute('aria-haspopup', 'true');
  fileBtn.addEventListener('click', () => {
    if (menu) { closeMenu(); return; }
    const mi = (ic, label, sub, fn) => el('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenu(); fn(); } }, [icon(ic), el('span', {}, [label, sub ? el('small', { text: sub }) : null])]);
    menu = el('div', { class: 'kmenu', role: 'menu', style: 'left:0;right:auto' }, [
      mi('plus', 'New design', 'Blank, or from a starter', newDialog),
      mi('grid', 'Template library', 'Seed packets, ID tags, product labels, invoices', libraryDialog),
      mi('folder', 'Open…', 'From this device, Google Drive or Dropbox', () => openDialog()),
      mi('save', 'Save', S.file ? 'To ' + whereName(S.file.where) : 'Choose where', () => quickSave()),
      mi('save', 'Save as…', 'Another name or place', () => saveDialog()),
      el('div', { class: 'sep' }),
      mi('download', 'Download a copy', 'A .ltprint file to keep, share, or add to the app (Labels, Design)', () => downloadText(fileName(), JSON.stringify(exportT()))),
    ]);
    fileWrap.append(menu); fileBtn.setAttribute('aria-expanded', 'true');
    const away = e => { if (menu && !menu.contains(e.target) && !fileBtn.contains(e.target)) { closeMenu(); document.removeEventListener('pointerdown', away, true); } };
    document.addEventListener('pointerdown', away, true);
    menu.querySelector('button').focus();
    menu.addEventListener('keydown', e => { if (e.key === 'Escape') { closeMenu(); fileBtn.focus(); } });
  });
  undoB = el('button', { type: 'button', class: 'icon-btn hide-sm', 'aria-label': 'Undo', title: 'Undo (Ctrl+Z)', disabled: true, onclick: () => hist.undo() }, [icon('undo')]);
  redoB = el('button', { type: 'button', class: 'icon-btn hide-sm', 'aria-label': 'Redo', title: 'Redo (Ctrl+Shift+Z)', disabled: true, onclick: () => hist.redo() }, [icon('redo')]);
  titleEl = el('span', { class: 'small muted hide-sm', style: 'max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' });
  const slot = el('div', { class: 'pr-slot' }, [fileWrap, undoB, redoB, el('span', { class: 'sp' }), steps, el('span', { class: 'sp' }), titleEl]);
  design = designView(ctx); records = recordsView(ctx); printing = printView(ctx);
  views = { design, records, print: printing };
  const mbar = el('nav', { class: 'pr-mbar', 'aria-label': 'Panels' }, [
    el('button', { type: 'button', 'data-p': 'left', onclick: () => panel('left') }, [icon('plus'), 'Add']),
    el('button', { type: 'button', onclick: () => hist.undo() }, [icon('undo'), 'Undo']),
    el('button', { type: 'button', 'data-p': 'right', onclick: () => panel('right') }, [icon('settings'), 'Edit']),
  ]);
  app.textContent = '';
  app.append(el('div', { class: 'pr-shell' }, [topBar({ tool: 'print', slot, who: g }), design.el, records.el, printing.el]), mbar);
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); quickSave(); return; }
    if (e.target.closest('input,textarea,select,[contenteditable]') || document.querySelector('.dlg-wrap')) return;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? hist.redo() : hist.undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); hist.redo(); }
  });
  window.addEventListener('beforeunload', e => { if (S.file && unsaved()) { e.preventDefault(); e.returnValue = ''; } });
  go('design');
  autosave();
}
function panel(which) {
  const on = !document.body.classList.contains('show-' + which);
  document.body.classList.remove('show-left', 'show-right');
  if (on) document.body.classList.add('show-' + which);
  document.querySelectorAll('.pr-mbar [data-p]').forEach(b => b.setAttribute('aria-pressed', document.body.classList.contains('show-' + b.dataset.p) ? 'true' : 'false'));
}
function go(step) {
  S.step = step;
  for (const [k, v] of Object.entries(views)) v.el.hidden = k !== step;
  document.querySelectorAll('[data-step]').forEach(b => b.setAttribute('aria-pressed', b.dataset.step === step ? 'true' : 'false'));
  document.querySelector('.pr-mbar').hidden = step !== 'design';
  document.body.classList.remove('show-left', 'show-right');
  views[step].show();
  refreshTitle();
}
function refreshAll() { views[S.step]?.refresh(); if (S.step !== 'design') design.refresh?.(); refreshTitle(); }
const unsaved = () => S.saved !== snapOf();
function refreshTitle() { if (titleEl) titleEl.textContent = S.t.name + (S.file && unsaved() ? ' •' : ''); document.title = `${S.t.name} · LT-Print`; }
const whereName = w => ({ device: 'this device', drive: 'Google Drive', dropbox: 'Dropbox' }[w] || 'a file');
const fileName = () => (S.t.name.replace(/[\\/:*?"<>|]/g, '-').trim() || 'design') + EXT;
function setDoc(t, file) { S.t = t; S.file = file; S.sel = new Set(); S.preview = ''; S.zoomFit = true; S.saved = file ? snapOf() : ''; hist.reset(); autosave(); go('design'); }

/* ---------- New ---------- */
function newDialog() {
  const body = [el('p', { class: 'muted', text: 'Start blank or from one of the app\'s sticker layouts. The current design stays in your undo history only, so save it first if you want to keep it.' })];
  const kindSel = el('select', {}, Object.entries(KINDS).map(([k, v]) => el('option', { value: k, text: v.name, selected: k === S.t.kind })));
  body.push(el('label', { class: 'fld' }, [el('span', { text: 'Records it is for' }), kindSel]));
  const w = el('input', { type: 'number', min: '10', max: '600', step: '0.5', value: '60' }), h = el('input', { type: 'number', min: '5', max: '600', step: '0.5', value: '30' });
  body.push(el('h3', { text: 'Blank' }), el('div', { class: 'row' }, [el('label', { class: 'fld' }, [el('span', { text: 'Width (mm)' }), w]), el('label', { class: 'fld' }, [el('span', { text: 'Height (mm)' }), h]),
    el('button', { type: 'button', class: 'btn primary', style: 'margin-bottom:12px', text: 'Start blank', onclick: () => { const t = blankTemplate(Math.min(600, Math.max(10, +w.value || 60)), Math.min(600, Math.max(5, +h.value || 30)), kindSel.value); if (t.kind === 'table') t.columns = S.data?.columns || []; d.close(); setDoc(t, null); } })]));
  body.push(el('button', { type: 'button', class: 'btn', style: 'margin-bottom:12px', text: 'Browse the template library (seed packets, invoices and more)…', onclick: () => { d.close(); libraryDialog(); } }));
  body.push(el('h3', { text: 'From a starter' }));
  const list = el('div', { class: 'flist' });
  const fill = () => { list.textContent = ''; for (const s of starterList(kindSel.value)) list.append(el('button', { type: 'button', class: 'starter', onclick: () => { const t = starter(s.layout, kindSel.value, s.w, s.h, S.data?.columns || []); if (s.sheet) { S.print.layout = s.sheet; S.print.paper = 'a4'; savePrefs(); } d.close(); setDoc(t, null); } }, [el('b', { text: s.name }), el('small', { text: s.size + ' · ' + s.desc })])); };
  kindSel.addEventListener('change', fill); fill(); body.push(list);
  const d = dialog('New design', body, { wide: true });
}


/* ---------- Template library ---------- */
function libraryDialog() {
  const body = [el('p', { class: 'muted', text: 'Pick one and change it, instead of starting blank. Everything on it can be moved, edited or deleted. It replaces the design you have open, so save that first if you want to keep it. Labels for your customers carry only your own name.' })];
  let d = null;
  for (const g of LIBRARY_GROUPS) {
    body.push(el('h3', { text: g.name }), el('p', { class: 'small muted', style: 'margin:-4px 0 8px', text: g.desc }));
    const grid = el('div', { class: 'libgrid' });
    for (const e of LIBRARY.filter(x => x.group === g.id)) {
      const t = libraryDesign(e), row = Object.assign({}, commonValues(), exampleRow(e) || sampleRow(t.kind, false, t.columns));
      const thumb = el('div', { class: 'thumb' });
      const PX = 96 / 25.4, sc = Math.min(190 / (t.w * PX), 92 / (t.h * PX));
      const inner = el('div', { style: `transform:scale(${sc});transform-origin:center;flex:none` });
      inner.innerHTML = labelHTML(t, row, {}); thumb.append(inner);
      const card = el('div', { class: 'starter libcard' }, [
        el('button', { type: 'button', class: 'libuse', 'aria-label': 'Use ' + e.name, onclick: () => useLibrary(e, d) }, [thumb, el('b', { text: e.name }), el('small', { text: e.desc })]),
      ]);
      const csv = exampleCSV(e);
      if (csv) card.append(el('button', { type: 'button', class: 'btn sm', text: 'Example spreadsheet', title: 'A small .csv with the headings this design uses and a row to copy', onclick: () => downloadText(e.name.replace(/[^\w -]+/g, '').trim() + ' example.csv', csv) }));
      grid.append(card);
      requestAnimationFrame(() => fitText(inner));
    }
    body.push(grid);
  }
  d = dialog('Template library', body, { wide: true });
}
function useLibrary(e, d) {
  const t = libraryDesign(e);
  if (t.kind === 'table') { t.columns = (t.columns || []).slice(); }
  if (e.sheet) { S.print.layout = e.sheet; S.print.paper = 'a4'; savePrefs(); }
  else if (e.paper) { S.print.paper = e.paper; savePrefs(); }
  d.close(); setDoc(t, null); toast('Opened ' + t.name + '. Change anything you like, then Save as to keep your own copy');
}

/* ---------- Open ---------- */
async function openDialog(tab = store.get(K.where) || 'device') {
  const body = el('div');
  const d = dialog('Open a design', [body], { wide: true });
  const tabs = el('div', { class: 'seg tabs-row', role: 'group', 'aria-label': 'Where' });
  const pane = el('div');
  body.append(tabs, pane);
  const places = [['device', 'This device'], ['drive', 'Google Drive'], ['dropbox', 'Dropbox']];
  const show = async t => {
    tab = t; tabs.textContent = '';
    places.forEach(([v, l]) => tabs.append(el('button', { type: 'button', 'aria-pressed': v === t ? 'true' : 'false', text: l, onclick: () => show(v) })));
    pane.textContent = '';
    if (t === 'device') {
      const lib = store.get(K.lib, {}) || {};
      const names = Object.keys(lib).sort((a, b) => (lib[b].at || 0) - (lib[a].at || 0));
      pane.append(el('p', { class: 'small muted', text: 'Designs kept in this browser, and files you downloaded or were sent.' }), el('button', { type: 'button', class: 'btn', onclick: async () => { const f = await pickFile('.ltprint,.json,application/json'); if (!f) return; try { const t2 = cleanTemplate(JSON.parse(await f.text())); d.close(); setDoc(t2, null); toast('Opened ' + t2.name); } catch (e) { toast(e.message || 'That file could not be opened'); } } }, [icon('upload'), 'Open a file…']));
      const ul = el('ul', { class: 'flist' });
      for (const n of names) ul.append(el('li', {}, [el('span', { class: 'nm', text: n }), el('small', { text: fmtDay(lib[n].at || 0) }),
        el('button', { type: 'button', class: 'btn sm', text: 'Open', onclick: () => { try { const t2 = cleanTemplate(lib[n].t); d.close(); setDoc(t2, { where: 'device', id: n, name: n }); } catch { toast('That design could not be opened'); } } }),
        el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Delete ' + n, onclick: async () => { if (!await confirmBox('Delete this design?', `"${n}" will be removed from this browser.`, 'Delete', { danger: true })) return; const l2 = store.get(K.lib, {}); delete l2[n]; store.set(K.lib, l2); show('device'); } }, [icon('trash')])]));
      pane.append(names.length ? ul : el('p', { class: 'muted', text: 'Nothing kept in this browser yet.' }));
      return;
    }
    await cloudList(t, pane, async f => { try { const t2 = cleanTemplate(JSON.parse(await storage[t].load(f.id))); d.close(); setDoc(t2, { where: t, id: f.id, name: f.name }); toast('Opened ' + t2.name); } catch (e) { toast(e.message || 'That design could not be opened'); } }, { open: true });
  };
  show(tab);
}
async function cloudList(t, pane, onPick, ret) {
  const P = storage[t];
  if (!P.ready()) { pane.append(el('p', { class: 'notice', text: `${P.name} is not set up for the tools yet. Use this device for now.` })); return; }
  if (t === 'dropbox' && !dropboxConnected()) {
    pane.append(el('p', { text: 'Connect Dropbox once. LT-Print can only see its own folder there.' }), el('button', { type: 'button', class: 'btn primary', text: 'Connect Dropbox', onclick: () => dropboxSignIn(ret).catch(e => toast(e.message)) }));
    return;
  }
  const status = el('p', { class: 'small muted', text: 'Looking…' });
  pane.append(status);
  try {
    const files = await P.list();
    status.textContent = t === 'drive' ? 'Designs in the "LT-Print designs" folder of your Google Drive.' : 'Designs in the LT-Print folder of the Lineage Tracker app folder in your Dropbox.';
    const ul = el('ul', { class: 'flist' });
    for (const f of files) ul.append(el('li', {}, [el('span', { class: 'nm', text: f.name }), el('small', { text: f.modified ? fmtDay(f.modified) : '' }), onPick ? el('button', { type: 'button', class: 'btn sm', text: 'Open', onclick: () => onPick(f) }) : null]));
    pane.append(files.length ? ul : el('p', { class: 'muted', text: 'No designs saved there yet.' }));
    if (t === 'dropbox') pane.append(el('button', { type: 'button', class: 'btn sm', text: 'Disconnect Dropbox on this device', onclick: () => { dropboxForget(); toast('Dropbox disconnected on this device'); pane.textContent = ''; cloudList(t, pane, onPick, ret); } }));
  } catch (e) { status.textContent = e.message || 'That did not work'; }
}

/* ---------- Save ---------- */
async function quickSave() {
  if (!S.file || !S.file.where) return saveDialog();
  return saveTo(S.file.where, S.t.name, S.file.where === 'drive' && S.file.name === S.t.name ? S.file.id : undefined);
}
async function saveTo(where, name, id) {
  name = String(name || '').trim().slice(0, 80) || 'Untitled design';
  S.t.name = name;
  try {
    if (where === 'device') {
      const lib = store.get(K.lib, {}) || {};
      lib[name] = { at: Date.now(), t: exportT() };
      if (!store.set(K.lib, lib)) { toast('There is no room left in this browser. Download a copy or save to Drive or Dropbox', 6000); return false; }
      S.file = { where, id: name, name };
    } else if (where === 'file') {
      downloadText(fileName(), JSON.stringify(exportT())); S.file = null; S.saved = ''; autosave(); toast('Downloaded'); return true;
    } else {
      toast('Saving to ' + whereName(where) + '…');
      const r = await storage[where].save(name, JSON.stringify(exportT()), id);
      S.file = { where, id: r.id, name };
    }
    store.set(K.where, where === 'file' ? 'device' : where);
    S.saved = snapOf(); autosave(); refreshTitle(); toast('Saved to ' + whereName(where));
    return true;
  } catch (e) { toast(e.message || 'Saving did not work. Please try again'); return false; }
}
function saveDialog(tab) {
  const nm = el('input', { type: 'text', value: S.t.name, maxlength: '80' });
  const where = tab || store.get(K.where) || 'device';
  const opts = [['device', 'This device (this browser)'], ['drive', 'Google Drive'], ['dropbox', 'Dropbox'], ['file', 'Download a file']].filter(([v]) => v === 'device' || v === 'file' || storage[v].ready());
  const radios = el('div', {}, opts.map(([v, l]) => el('label', { class: 'chk' }, [el('input', { type: 'radio', name: 'where', value: v, checked: v === where }), l])));
  const msg = el('p', { class: 'small muted' });
  const d = dialog('Save design', [
    el('form', { onsubmit: async e => {
      e.preventDefault();
      const w = radios.querySelector('input:checked')?.value || 'device';
      if (w === 'dropbox' && !dropboxConnected()) { msg.textContent = 'Connecting to Dropbox first…'; S.t.name = nm.value.trim() || S.t.name; autosave(); await dropboxSignIn({ save: true }).catch(er => { msg.textContent = er.message; }); return; }
      if (await saveTo(w, nm.value)) d.close();
    } }, [el('label', { class: 'fld' }, [el('span', { text: 'Name' }), nm]), el('span', { class: 'lbl', text: 'Where' }), radios, msg,
      el('div', { class: 'actions' }, [el('button', { type: 'submit', class: 'btn primary', text: 'Save' })]),
      el('p', { class: 'small muted', text: 'Designs never go to a Lineage Tracker server. Drive and Dropbox use the same connection as the app; LT-Print only sees its own files. To use a design in the app (0.26 or later), download it, then add the file under Labels, Design. Anyone you send the file to can use it there without an account.' })]),
  ]);
}
export { FORMAT };
