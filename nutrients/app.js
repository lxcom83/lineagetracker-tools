/* LT-Nutrients: start-up, the membership gate, the five tabs (Mix, Top up, Log, Convert, About) and the saved file.
   The arithmetic lives in model.js. Nothing here chooses a product or a dose: the member types the numbers from their own label. */
import { CFG, loadConfig, el, toast, store, gate, REASONS, signInUrl, rootUrl, registerSW, saveUnits, syncUnits } from '../kit/core.js';
import { topBar } from '../kit/bar.js';
import { downloadText, pickFile } from '../kit/files.js';
import * as N from './model.js';

const app = document.getElementById('app');
const K = { doc: 'ltnutr_doc', tab: 'ltnutr_tab' };
const S = { doc: null, rid: '', tab: 'mix', stage: 'finish', target: '', vol: '', dose: '' };
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const imperial = () => S.doc.units === 'ft';
const R = () => S.doc.res.find(r => r.id === S.rid) || S.doc.res[0];
const fix = (n, d = 2) => (Number.isFinite(n) ? String(Math.round(n * 10 ** d) / 10 ** d) : '');

(async function start() {
  registerSW();
  await loadConfig();
  const g = await gate('nutrients');
  if (!g.ok) { showGate(g.reason); return; }
  const acct = await syncUnits();
  try { S.doc = N.cleanDoc(store.get(K.doc)); } catch { S.doc = N.blankDoc(); S.doc.units = acct === 'ft' ? 'ft' : 'm'; }
  S.rid = S.doc.res[0] ? S.doc.res[0].id : '';
  if (!S.doc.res.length) { S.doc = N.blankDoc(); S.rid = S.doc.res[0].id; }
  S.tab = ['mix', 'topup', 'log', 'convert', 'about'].includes(store.get(K.tab)) ? store.get(K.tab) : 'mix';
  handoff();
  render(g);
  if (g.preview) toast('LT-Nutrients is not open to everyone yet. You can try it because you are staff.', 5000);
})();

/* LT-Planner can hand a reservoir over: both tools live at the same address, so a short note in this device's storage is enough.
   It is used once and thrown away, and only if it is fresh. */
function handoff() {
  let h = null;
  try { const raw = localStorage.getItem('lt_tools_handoff_nutrients'); localStorage.removeItem('lt_tools_handoff_nutrients'); h = raw ? JSON.parse(raw) : null; } catch { return; }
  if (!h || typeof h !== 'object' || h.v !== 1 || !(Date.now() - (+h.at || 0) < 600000)) return;   // ten minutes old at most
  const name = (typeof h.name === 'string' ? h.name : '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 60) || 'Reservoir from my plan';
  const litres = Number.isFinite(+h.litres) && +h.litres > 0 ? Math.min(100000, +h.litres) : 0;
  const band = typeof h.band === 'string' && Object.prototype.hasOwnProperty.call(N.BANDS, h.band) ? h.band : 'greens';
  const found = S.doc.res.find(r => r.name === name);
  const r = found || (S.doc.res.length < N.LIMITS.res ? N.cleanDoc({ format: N.FORMAT, version: 1, res: [{ name }] }).res[0] : null);
  if (!r) { toast('This file already holds as many reservoirs as it can.', 5000); return; }
  if (litres) r.litres = litres;
  r.band = band;
  if (!found) S.doc.res.push(r);
  S.rid = r.id; if (h.units === 'ft' || h.units === 'm') S.doc.units = h.units;
  save();
  setTimeout(() => toast((found ? 'Updated' : 'Added') + ' "' + name + '"' + (litres ? ', ' + (S.doc.units === 'ft' ? fix(N.lToGal(litres), 1) + ' US gal' : fix(litres, 1) + ' L') : '') + ', from your plan. Type your own product label below.', 7000), 400);
}

function showGate(reason) {
  const msg = REASONS[reason] || REASONS.error, out = reason === 'signed_out' || reason === 'offline';
  app.textContent = '';
  app.append(topBar({ tool: 'nutrients' }), el('main', { class: 'gate' }, [
    el('img', { class: 'logo logo-light', src: rootUrl('brand/logo-icon.svg'), alt: '' }), el('img', { class: 'logo logo-dark', src: rootUrl('brand/logo-icon-dark.svg'), alt: '' }),
    el('h1', { text: 'LT-Nutrients' }),
    el('p', { class: 'muted', text: 'Work out how much to add to a hydroponic reservoir from your own product label, convert EC and ppm, and keep a reading log. Free with a Lineage Tracker account.' }),
    el('div', { class: 'card' }, [el('p', { text: msg }), el('div', { class: 'actions' }, [
      out ? el('a', { class: 'btn primary', href: signInUrl('nutrients/') }, ['Sign in']) : null,
      out ? el('a', { class: 'btn', href: CFG.SITE + '/register.html' }, ['Create a free account']) : null,
      reason === 'needs_terms' ? el('a', { class: 'btn primary', href: CFG.SITE + '/account.html' }, ['Open my account']) : null,
      el('a', { class: 'btn', href: rootUrl('') }, ['LT tools home'])].filter(Boolean))])]));
}

let barBox, main;
const save = () => { store.set(K.doc, S.doc); };
function render(g) {
  app.textContent = '';
  const slot = el('div', { class: 'actions' }, [
    el('button', { type: 'button', class: 'btn sm', text: 'Open…', onclick: openFile }), el('button', { type: 'button', class: 'btn sm', text: 'Save a copy', onclick: saveFile })]);
  barBox = topBar({ tool: 'nutrients', slot, who: g && g.alias ? { alias: g.alias, offline: g.offline, checked: g.checked } : null });
  main = el('main', { class: 'nu-main' });
  app.append(barBox, main); draw();
}
async function openFile() {
  const f = await pickFile('.ltnutr,application/json'); if (!f) return;
  if (f.size > 5e6) { toast('That file is too big to be an LT-Nutrients file.'); return; }
  try { S.doc = N.cleanDoc(JSON.parse(await f.text())); S.rid = S.doc.res[0] ? S.doc.res[0].id : ''; if (!S.doc.res.length) { S.doc = N.blankDoc(); S.rid = S.doc.res[0].id; } save(); draw(); toast('Opened ' + S.doc.name); }
  catch (e) { toast(e && e.message ? e.message : 'That file could not be opened.', 5000); }
}
const saveFile = () => downloadText((S.doc.name.replace(/[^\w -]+/g, '').trim() || 'reservoirs') + N.EXT, JSON.stringify(S.doc));

/* ---------- small builders ---------- */
const F = (label, input) => el('label', { class: 'nu-f' }, [label, input]);
const numIn = (value, onchange, attrs = {}) => { const i = el('input', Object.assign({ type: 'number', inputmode: 'decimal', step: 'any', value: value === '' || value == null ? '' : value }, attrs)); i.addEventListener('change', () => onchange(i.value === '' ? '' : Number(i.value))); return i; };
const selIn = (opts, value, onchange) => { const s = el('select', {}, opts.map(([v, l]) => el('option', { value: v, text: l }))); s.value = value; s.addEventListener('change', () => onchange(s.value)); return s; };
const unitsPick = () => F('Units', selIn([['m', 'Metric (litres, mL)'], ['ft', 'Imperial (US gallons, teaspoons)']], S.doc.units, v => { S.doc.units = v; saveUnits(v); S.vol = ''; S.up = null; save(); draw(); }));   // typed volumes are cleared: 10 litres is not 10 gallons

function reservoirBar() {
  const r = R(), name = el('input', { value: r.name, maxlength: '60', 'aria-label': 'Reservoir name' }); name.addEventListener('change', () => { r.name = name.value.trim().slice(0, 60) || 'Reservoir'; save(); draw(); });
  const sel = selIn(S.doc.res.map(x => [x.id, x.name]), r.id, v => { S.rid = v; S.target = ''; S.vol = ''; S.dose = ''; draw(); });
  return el('section', { class: 'card' }, [
    el('div', { class: 'nu-bar' }, [F('Reservoir', sel), F('Name', name), unitsPick(),
      el('button', { type: 'button', class: 'btn sm', text: 'Add another', onclick: () => { if (S.doc.res.length >= N.LIMITS.res) { toast('That is the most reservoirs in one file.'); return; } const d = N.cleanDoc({ format: N.FORMAT, version: 1, res: [{ name: 'Reservoir ' + (S.doc.res.length + 1) }] }).res[0]; S.doc.res.push(d); S.rid = d.id; save(); draw(); } }),
      el('button', { type: 'button', class: 'btn sm danger', text: 'Delete', onclick: () => { if (S.doc.res.length <= 1) { toast('Keep at least one reservoir.'); return; } if (!confirm('Delete "' + r.name + '" and its readings?')) return; S.doc.res = S.doc.res.filter(x => x !== r); S.rid = S.doc.res[0].id; save(); draw(); } })]),
    el('div', { class: 'nu-grid', style: 'margin-top:12px' }, [
      F('Target set (typical bands)', selIn(Object.entries(N.BANDS).map(([k, b]) => [k, b.name]), r.band, v => { r.band = v; S.target = ''; save(); draw(); })),
      F(imperial() ? 'Reservoir size (US gal)' : 'Reservoir size (litres)', numIn(imperial() ? fix(N.lToGal(r.litres), 2) : r.litres, v => { if (Number.isFinite(v) && v > 0) { r.litres = Math.min(100000, imperial() ? N.galToL(v) : v); S.vol = ''; save(); draw(); } }, { min: '0.1' }))]),
    bandNote(r)]);
}
function bandNote(r) {
  const b = N.BANDS[r.band], bits = [];
  if (b.ec) bits.push('EC about ' + b.ec[0] + ' to ' + b.ec[1] + ' mS/cm (' + Math.round(N.ecToPpm(b.ec[0], S.doc.scale)) + ' to ' + Math.round(N.ecToPpm(b.ec[1], S.doc.scale)) + ' ppm, ' + N.PPM_SCALES[S.doc.scale] + ')');
  bits.push('pH about ' + b.ph[0] + ' to ' + b.ph[1] + (b.phBest ? ' (best about ' + b.phBest + ')' : ''));
  return el('p', { class: 'small muted', text: 'Typical, not a promise: ' + bits.join('; ') + '. Source: ' + b.src + '. Your system and water may want different numbers.' });
}

/* ---------- tabs ---------- */
function draw() {
  main.textContent = '';
  const tabs = el('div', { class: 'nu-tabs', role: 'tablist' }, [['mix', 'Mix'], ['topup', 'Top up'], ['log', 'Log'], ['convert', 'Convert'], ['about', 'About']].map(([k, l]) => el('button', { type: 'button', role: 'tab', 'aria-pressed': String(S.tab === k), text: l, onclick: () => { S.tab = k; store.set(K.tab, k); draw(); } })));
  main.append(el('h1', { text: 'LT-Nutrients' }), tabs);
  if (S.tab !== 'convert' && S.tab !== 'about') main.append(reservoirBar());
  main.append(S.tab === 'mix' ? mixTab() : S.tab === 'topup' ? topUpTab() : S.tab === 'log' ? logTab() : S.tab === 'convert' ? convertTab() : aboutTab());
  save();
}
const doseUnit = r => (N.DOSE_UNITS[r.doseUnit] ? r.doseUnit : 'mlL');
const doseIn = r => (r.labelDose ? fix(N.doseFromMlL(r.labelDose, doseUnit(r)), 3) : '');
const doseEcho = r => (r.labelDose ? '= ' + fix(r.labelDose, 3) + ' mL per litre, ' + fix(N.doseFromMlL(r.labelDose, 'mlGal'), 2) + ' mL per US gallon, ' + fix(N.doseFromMlL(r.labelDose, 'tspGal'), 2) + ' tsp per US gallon.' : '');
function labelFields(r) {
  return [F('Label dose', numIn(doseIn(r), v => { if (Number.isFinite(v) && v >= 0) { r.labelDose = Math.round(N.doseToMlL(v, doseUnit(r)) * 1000) / 1000; save(); draw(); } }, { min: '0' })),
    F('…in', selIn(N.DOSE_KEYS.map(k => [k, N.DOSE_UNITS[k].name]), doseUnit(r), v => { r.doseUnit = v; save(); draw(); })),
    F('EC that dose gives in plain water (mS/cm)', numIn(r.labelEc || '', v => { if (Number.isFinite(v) && v >= 0) { r.labelEc = v; save(); draw(); } }, { min: '0' })),
    F('Your plain water EC (mS/cm)', numIn(r.waterEc, v => { if (Number.isFinite(v) && v >= 0) { r.waterEc = v; save(); draw(); } }, { min: '0' }))];
}
const amount = ml => (imperial() ? fix(ml / N.ML_PER_TSP, 1) + ' tsp (' + fix(ml / N.ML_PER_TBSP, 1) + ' tbsp, ' + fix(ml, 0) + ' mL)' : fix(ml, 1) + ' mL' + (ml >= 1000 ? ' (' + fix(ml / 1000, 2) + ' L)' : ''));
const ppmLine = ec => fix(N.ecToPpm(ec, S.doc.scale), 0) + ' ppm on the ' + N.PPM_SCALES[S.doc.scale];

function mixTab() {
  const r = R(), b = N.BANDS[r.band], defEc = b.ec ? Math.round((b.ec[0] + b.ec[1]) / 2 * 100) / 100 : '';
  const stage = el('div', { class: 'nu-grid' }, [
    F('Stage', selIn([['finish', 'Finishing strength'], ['q', 'Seedlings, 1/4 strength'], ['h', 'Seedlings, 1/2 strength']], S.stage, v => { S.stage = v; draw(); })),
    F('Finishing EC you want (mS/cm)', numIn(S.target !== '' ? S.target : defEc, v => { S.target = Number.isFinite(v) ? v : ''; draw(); }, { min: '0' })),
    F(imperial() ? 'How much to make (US gal)' : 'How much to make (litres)', numIn(S.vol !== '' ? S.vol : (imperial() ? fix(N.lToGal(r.litres), 2) : r.litres), v => { S.vol = Number.isFinite(v) ? v : ''; draw(); }, { min: '0.1' }))]);
  const vol = S.vol !== '' ? S.vol : (imperial() ? N.lToGal(r.litres) : r.litres), vL = imperial() ? N.galToL(vol) : vol;
  const target = S.target !== '' ? S.target : defEc, frac = S.stage === 'q' ? 0.25 : S.stage === 'h' ? 0.5 : 1;
  const m = N.mix({ volumeL: vL, targetEc: target, fraction: frac, waterEc: r.waterEc, labelDose: r.labelDose, labelEc: r.labelEc });
  const out = el('div', { class: 'nu-res', 'aria-live': 'polite' });
  if (m.ok) {
    out.append(el('div', { class: 'nu-big', text: 'Add ' + amount(m.totalMl) }), el('p', { text: 'to ' + fix(vol, 1) + (imperial() ? ' US gal' : ' litres') + ' of water. That is ' + (imperial() ? fix(m.mlPerL * N.L_PER_GAL / N.ML_PER_TSP, 2) + ' tsp per US gal' : fix(m.mlPerL, 2) + ' mL per litre') + '.' }),
      el('p', { text: 'It should read about ' + fix(m.finalEc, 2) + ' mS/cm (' + ppmLine(m.finalEc) + ') when mixed. Always measure and adjust.' }));
  } else out.append(el('p', { class: 'nu-warn', text: m.notes[0] }));
  if (m.ok) m.notes.forEach(n => out.append(el('p', { class: 'small ' + (/times|high/.test(n) ? 'nu-warn' : 'muted'), text: n })));
  return el('section', { class: 'card' }, [el('h2', { text: 'Mix a fresh reservoir' }), el('p', { class: 'small muted', text: 'Type the numbers from your own product label. This tool only does the sums: it never picks a product or a dose for you.' }), stage, el('div', { class: 'nu-grid', style: 'margin-top:12px' }, labelFields(r)), el('p', { class: 'small muted', text: 'No EC figure on the label? Add a little to 1 litre of your water, read the EC, and use that rise with the amount you added.' }), r.labelDose ? el('p', { class: 'small muted', text: doseEcho(r) + ' Check that against your own label: a dose written per gallon, typed as per litre, is nearly four times too much.' }) : null, out]);
}
function topUpTab() {
  const r = R(), b = N.BANDS[r.band], defEc = b.ec ? Math.round((b.ec[0] + b.ec[1]) / 2 * 100) / 100 : '', st = S.up || (S.up = { cur: '', ec: '', tvol: '', tec: '' });
  const u = imperial() ? N.galToL : x => x, from = imperial() ? N.lToGal : x => x;
  const tv = st.tvol !== '' ? st.tvol : fix(from(r.litres), 2), tec = st.tec !== '' ? st.tec : defEc;
  const res = N.topUp({ currentL: u(Number(st.cur) || 0), currentEc: Number(st.ec) || 0, targetL: u(Number(tv) || 0), targetEc: Number(tec) || 0, waterEc: r.waterEc, labelDose: r.labelDose, labelEc: r.labelEc });
  const out = el('div', { class: 'nu-res', 'aria-live': 'polite' });
  if (res.ok || res.waterL != null) {
    out.append(el('div', { class: 'nu-big', text: 'Add ' + fix(from(res.waterL), 2) + (imperial() ? ' US gal' : ' litres') + ' of water' + (res.mlNutrient ? ' and ' + amount(res.mlNutrient) + ' of nutrient' : '') }),
      el('p', { text: 'Plain water alone would give about ' + fix(res.waterOnlyEc, 2) + ' mS/cm (' + ppmLine(res.waterOnlyEc) + ').' + (res.finalEc != null ? ' Aim for ' + fix(res.finalEc, 2) + ' mS/cm.' : '') }));
  } else out.append(el('p', { class: 'nu-warn', text: res.notes[0] }));
  res.notes.forEach(n => out.append(el('p', { class: 'small muted', text: n })));
  return el('section', { class: 'card' }, [el('h2', { text: 'Top up a reservoir that has dropped' }), el('p', { class: 'small muted', text: 'Plants drink water faster than nutrient, so the level drops and the EC often rises. Type what is in the reservoir now.' }),
    el('div', { class: 'nu-grid' }, [
      F(imperial() ? 'In it now (US gal)' : 'In it now (litres)', numIn(st.cur, v => { st.cur = Number.isFinite(v) ? v : ''; draw(); }, { min: '0' })), F('EC now (mS/cm)', numIn(st.ec, v => { st.ec = Number.isFinite(v) ? v : ''; draw(); }, { min: '0' })),
      F(imperial() ? 'Fill to (US gal)' : 'Fill to (litres)', numIn(tv, v => { st.tvol = Number.isFinite(v) ? v : ''; draw(); }, { min: '0' })), F('EC you want (mS/cm)', numIn(tec, v => { st.tec = Number.isFinite(v) ? v : ''; draw(); }, { min: '0' }))]),
    el('div', { class: 'nu-grid', style: 'margin-top:12px' }, labelFields(r)), out]);
}

/* ---------- the log ---------- */
function logTab() {
  const r = R(), b = N.BANDS[r.band], f = S.reading || (S.reading = { date: today(), ec: '', ph: '', temp: '', litres: '', note: '' });
  const inp = (k, label, attrs) => F(label, numIn(f[k], v => { f[k] = Number.isFinite(v) ? v : ''; }, attrs));
  const date = el('input', { type: 'date', value: f.date }); date.addEventListener('change', () => { f.date = date.value; });
  const note = el('input', { value: f.note, maxlength: '120' }); note.addEventListener('change', () => { f.note = note.value; });
  const add = el('button', { type: 'button', class: 'btn primary', text: 'Add this reading', onclick: () => {
    const n2 = v => (v === '' || v == null || !Number.isFinite(Number(v)) ? '' : Number(v));
    const x = { date: f.date, ec: f.ec, ph: f.ph, note: f.note,   // imperial readings become metric BEFORE cleaning, whose limits are metric
      temp: n2(f.temp) === '' ? '' : (imperial() ? Math.round(N.fToC(n2(f.temp)) * 100) / 100 : n2(f.temp)),
      litres: n2(f.litres) === '' ? '' : (imperial() ? Math.round(N.galToL(n2(f.litres)) * 1000) / 1000 : n2(f.litres)) };
    const doc = N.cleanDoc({ format: N.FORMAT, version: 1, res: [{ readings: [x] }] }).res[0].readings[0];
    if (!doc) { toast('Type a date and at least one number or note.'); return; }
    r.readings.push(doc); r.readings.sort((a, c) => (a.date < c.date ? -1 : a.date > c.date ? 1 : 0)); if (r.readings.length > N.LIMITS.readings) r.readings.splice(0, r.readings.length - N.LIMITS.readings);
    S.reading = null; save(); draw(); toast('Reading added');
  } }, []);
  const form = el('div', { class: 'nu-grid' }, [F('Date', date), inp('ec', 'EC (mS/cm)', { min: '0', max: '20' }), inp('ph', 'pH', { min: '0', max: '14' }), inp('temp', imperial() ? 'Water temperature (°F)' : 'Water temperature (°C)'), inp('litres', imperial() ? 'Level (US gal)' : 'Level (litres)', { min: '0' }), F('Note (short)', note)]);
  const rows = r.readings.slice().reverse().slice(0, 60);
  const cell = (v, band, d = 2) => el('td', { class: band ? 'nu-' + band : '', text: v == null ? '' : fix(v, d) });
  const table = rows.length ? el('table', { class: 'nu-t' }, [el('thead', {}, [el('tr', {}, ['Date', 'EC', 'pH', 'Temp', 'Level', 'Note', ''].map(h => el('th', { text: h })))]),
    el('tbody', {}, rows.map(x => el('tr', {}, [el('td', { text: x.date }), cell(x.ec, N.bandCheck(x.ec, b.ec)), cell(x.ph, N.bandCheck(x.ph, b.ph)), cell(x.temp == null ? null : imperial() ? N.cToF(x.temp) : x.temp, '', 1), cell(x.litres == null ? null : imperial() ? N.lToGal(x.litres) : x.litres, '', 1), el('td', { text: x.note || '' }), el('td', {}, [el('button', { type: 'button', class: 'btn sm', 'aria-label': 'Delete reading of ' + x.date, text: '×', onclick: () => { r.readings.splice(r.readings.indexOf(x), 1); save(); draw(); } })])])))]) : el('p', { class: 'muted', text: 'No readings yet.' });
  const nc = N.nextChange(r);
  const change = el('div', { class: 'nu-bar' }, [F('Change the solution every (days)', numIn(r.changeEvery, v => { if (Number.isFinite(v)) { r.changeEvery = Math.min(120, Math.max(1, Math.round(v))); save(); draw(); } }, { min: '1', max: '120' })),
    el('button', { type: 'button', class: 'btn sm', text: 'Solution changed today', onclick: () => { r.lastChange = today(); save(); draw(); } }),
    el('button', { type: 'button', class: 'btn sm', text: 'Add reminders to my calendar', onclick: () => { if (!nc) { toast('Tap Solution changed today first.'); return; } downloadText((r.name.replace(/[^\w -]+/g, '') || 'reservoir') + '-reminders.ics', ics(r, nc), 'text/calendar'); } })]);
  return el('section', { class: 'card' }, [el('h2', { text: 'Reading log for ' + r.name }), form, el('div', { class: 'actions', style: 'margin:12px 0' }, [add]),
    chart(r, b), el('p', { class: 'small muted', text: 'Shaded bands are typical for this target set, not a rule. Colours in the table: blue low, green in band, orange high.' }), table,
    el('h3', { text: 'Changing the solution' }), el('p', { class: 'small', text: nc ? 'Last changed ' + r.lastChange + '. Next change about ' + nc + (nc <= today() ? ' (due now).' : '.') : 'Tap Solution changed today to start counting.' }), change]);
}
const fold = l => (l.length <= 73 ? l : l.match(/.{1,72}/g).join('\r\n '));   // RFC 5545: a long line is wrapped with a leading space
function ics(r, nc) {
  if (nc < today()) nc = today();   // an overdue change goes in as today, never in the past
  const d = x => x.replace(/-/g, ''), n = new Date(nc + 'T00:00:00Z'); n.setUTCDate(n.getUTCDate() + 1);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z', esc = t => String(t).replace(/[\\;,]/g, m => '\\' + m);
  const ev = (uid, title, start, end, rr) => ['BEGIN:VEVENT', 'UID:' + uid + '@nutrients.lineagetracker.org', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d(start), 'DTEND;VALUE=DATE:' + d(end), 'SUMMARY:' + esc(title), rr || '', 'END:VEVENT'].filter(Boolean);
  const next1 = new Date(today() + 'T00:00:00Z'); next1.setUTCDate(next1.getUTCDate() + 1); const t0 = today(), t1 = next1.toISOString().slice(0, 10);
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lineage Tracker//LT-Nutrients//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc(r.name),
    ...ev(r.id + '-change', 'Change the solution: ' + r.name, nc, n.toISOString().slice(0, 10)), ...ev(r.id + '-check', 'Check pH and EC: ' + r.name, t0, t1, 'RRULE:FREQ=DAILY;COUNT=60'), 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
}
function chart(r, b) {
  const pts = r.readings.filter(x => x.ec != null || x.ph != null).slice(-60);
  if (pts.length < 2) return el('p', { class: 'small muted', text: 'Add two or more readings to see a chart.' });
  const NS = 'http://www.w3.org/2000/svg', W = 640, H = 120, wrap = el('div', {});
  const mk = (tag, a) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(a || {})) e.setAttribute(k, v); return e; };
  for (const [key, label, band, color] of [['ec', 'EC (mS/cm)', b.ec, '#2a6fb0'], ['ph', 'pH', b.ph, '#8a4a00']]) {
    const data = pts.map((p, i) => [i, p[key]]).filter(p => p[1] != null); if (data.length < 2) continue;
    const vals = data.map(p => p[1]).concat(band || []), lo = Math.min(...vals), hi = Math.max(...vals), pad = (hi - lo) * 0.15 || 0.5, y0 = lo - pad, y1 = hi + pad, X = i => 40 + (i / (pts.length - 1)) * (W - 60), Y = v => H - 20 - ((v - y0) / (y1 - y0)) * (H - 40);
    const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, class: 'nu-chart', role: 'img', 'aria-label': label + ' over time' });
    if (band) svg.append(mk('rect', { x: 40, y: Y(band[1]), width: W - 60, height: Math.max(1, Y(band[0]) - Y(band[1])), fill: '#2f7d32', 'fill-opacity': 0.14 }));
    svg.append(mk('polyline', { points: data.map(([i, v]) => X(i) + ',' + Y(v)).join(' '), fill: 'none', stroke: color, 'stroke-width': 2 }), ...data.map(([i, v]) => mk('circle', { cx: X(i), cy: Y(v), r: 3, fill: color })));
    const t = mk('text', { x: 4, y: 14, 'font-size': 12, fill: 'currentColor' }); t.textContent = label; svg.append(t);
    [y0 + pad, y1 - pad].forEach(v => { const tt = mk('text', { x: 4, y: Y(v) + 4, 'font-size': 10, fill: 'currentColor' }); tt.textContent = fix(v, 1); svg.append(tt); });
    const d0 = mk('text', { x: 40, y: H - 4, 'font-size': 10, fill: 'currentColor' }); d0.textContent = pts[0].date; const d1 = mk('text', { x: W - 20, y: H - 4, 'font-size': 10, fill: 'currentColor', 'text-anchor': 'end' }); d1.textContent = pts[pts.length - 1].date; svg.append(d0, d1);
    wrap.append(svg);
  }
  return wrap;
}

/* ---------- converters ---------- */
function convertTab() {
  const pair = (title, aLabel, bLabel, ab, ba, d = 2) => {
    const a = el('input', { type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': aLabel }), b = el('input', { type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': bLabel });
    a.addEventListener('input', () => { b.value = a.value === '' ? '' : fix(ab(Number(a.value)), d); }); b.addEventListener('input', () => { a.value = b.value === '' ? '' : fix(ba(Number(b.value)), d); });
    return el('div', {}, [el('h3', { text: title }), el('div', { class: 'nu-grid' }, [F(aLabel, a), F(bLabel, b)])]);
  };
  const scale = selIn(Object.entries(N.PPM_SCALES).map(([k, l]) => [k, l]), String(S.doc.scale), v => { S.doc.scale = +v; save(); draw(); });
  return el('section', { class: 'card' }, [el('h2', { text: 'Convert' }), el('p', { class: 'small muted', text: 'Meters read EC and many show ppm using a conversion scale. Pick the one your meter says, and always quote it with the number.' }), F('ppm scale on your meter', scale),
    pair('EC and ppm', 'EC (mS/cm)', 'ppm (' + S.doc.scale + ' scale)', v => N.ecToPpm(v, S.doc.scale), v => N.ppmToEc(v, S.doc.scale), 3),
    pair('mS/cm and µS/cm', 'mS/cm', 'µS/cm', N.msToUs, N.usToMs, 3), pair('Litres and US gallons', 'Litres', 'US gallons', N.lToGal, N.galToL, 3),
    pair('mL and teaspoons (US)', 'mL', 'teaspoons', v => v / N.ML_PER_TSP, v => v * N.ML_PER_TSP, 3), pair('Celsius and Fahrenheit', '°C', '°F', N.cToF, N.fToC, 1)]);
}
function aboutTab() {
  return el('section', { class: 'card' }, [el('h2', { text: 'About LT-Nutrients' }),
    el('p', { text: 'A small calculator and log for hydroponic reservoirs, and for the bench-top seedlings and herbs that go with the LT-Planner indoor tools.' }),
    el('p', { text: 'What it does: scales the dose from your own product label to your reservoir size and target EC, works out a top-up, converts EC and ppm, and keeps your readings with typical bands behind the chart.' }),
    el('p', { text: 'What it does not do: it does not name products, pick a dose, or tell you what is safe. Follow your product label, wear what it says, and add a little at a time. Typical target bands come from the extension and grower pages named in the band list and are labelled typical: your crop, system and water may want different numbers.' }),
    el('p', { class: 'small muted', text: 'Your reservoirs and readings stay on this device. Use Save a copy to keep a file, and Open to bring one back. Nothing here is sent to Lineage Tracker, apart from your choice of units, which is kept on your account so every tool shows the same ones.' })]);
}
