/* LT-Nutrients: the arithmetic and the saved file. No DOM here, so it can be tested on its own (qa: nutrients_test.mjs).
   Nothing in this tool is a recipe, a product or a dose chosen for you: the member types the numbers from their own product label and this
   does the sums. Typical target bands come from the sources named in RESEARCH-indoor-growing.md and are labelled typical. */
export const FORMAT = 'lt-nutrients', VERSION = 1, EXT = '.ltnutr';
const num = (v, d, lo = -1e9, hi = 1e9) => { const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const str = (v, max = 80, d = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : d);
const day = v => {   // a real calendar day only: no 31 February, no year 9999
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return '';
  const d = new Date(v + 'T00:00:00Z'), y = +v.slice(0, 4);
  return !isNaN(+d) && d.toISOString().slice(0, 10) === v && y >= 1900 && y <= 2200 ? v : '';
};
export const isDay = day;
const r2 = n => Math.round(n * 100) / 100, r3 = n => Math.round(n * 1000) / 1000;

/* ---------- conversions (always say which scale) ---------- */
export const PPM_SCALES = { 500: 'NaCl scale (x 500)', 640: 'Europe scale (x 640)', 700: 'KCl scale (x 700)' };
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);   // a plain lookup would find '__proto__' and 'constructor'
export const ecToPpm = (ec, scale = 500) => Math.round(ec * (own(PPM_SCALES, scale) ? scale : 500) * 100) / 100;          // ec in mS/cm
export const ppmToEc = (ppm, scale = 500) => Math.round(ppm / (own(PPM_SCALES, scale) ? scale : 500) * 1e6) / 1e6;
export const L_PER_GAL = 3.785411784, ML_PER_TSP = 4.92892159375, ML_PER_TBSP = 14.78676478125, ML_PER_FLOZ = 29.5735295625;
export const lToGal = l => l / L_PER_GAL, galToL = g => g * L_PER_GAL;
export const cToF = c => c * 9 / 5 + 32, fToC = f => (f - 32) * 5 / 9;
export const msToUs = ms => ms * 1000, usToMs = us => us / 1000;
/* the label's dose is kept in mL per litre; the member can type it the way their own label is written */
export const DOSE_UNITS = { mlL: { name: 'mL per litre', per: 1 }, mlGal: { name: 'mL per US gallon', per: 1 / L_PER_GAL }, tspGal: { name: 'teaspoons per US gallon', per: ML_PER_TSP / L_PER_GAL }, tspL: { name: 'teaspoons per litre', per: ML_PER_TSP } };
export const DOSE_KEYS = Object.keys(DOSE_UNITS);
const dfac = u => (own(DOSE_UNITS, u) ? DOSE_UNITS[u].per : 1);
export const doseToMlL = (v, unit) => v * dfac(unit);            // what the member typed -> mL per litre
export const doseFromMlL = (mlL, unit) => mlL / dfac(unit);      // mL per litre -> the way they type it

/* ---------- the mix ----------
   volumeL: litres of finished solution.  targetEc: finishing strength (mS/cm).  fraction: 1 for finishing strength, 0.25 to 0.5 for seedlings.
   waterEc: the plain water's own EC (mS/cm).  labelDose + labelEc: the member's product label says "labelDose mL per litre" and a measured or stated
   rise of labelEc mS/cm in plain water; the tool only scales that.  Returns numbers and plain-language notes. */
export function mix({ volumeL, targetEc, fraction = 1, waterEc = 0, labelDose, labelEc }) {
  const V = num(volumeL, 0, 0, 1e6), T = num(targetEc, 0, 0, 20), f = num(fraction, 1, 0.05, 1), w = num(waterEc, 0, 0, 20), D = num(labelDose, 0, 0, 1000), E = num(labelEc, 0, 0, 20);
  const notes = [], out = { ok: false, notes };
  if (V <= 0) { notes.push('Type how many litres you are making.'); return out; }
  if (T <= 0) { notes.push('Type the EC you want to reach.'); return out; }
  if (E > 0 && E < 0.01) { notes.push('An EC rise under 0.01 mS/cm is too small to scale from: measure it again with more product, or read it from the label.'); return out; }
  if (D <= 0 || E <= 0) { notes.push('Type the dose and the EC rise from your own product label (or measure it: add a little to 1 litre of your water and read the rise).'); return out; }
  const goal = T * f, perMl = E / D;                       // mS/cm gained per (mL per litre)
  const need = goal - w;
  if (need <= 0) { out.goal = r2(goal); notes.push('Your plain water already reads ' + r2(w) + ' mS/cm, which is at or above the ' + r2(goal) + ' mS/cm goal. Use cleaner water (rainwater or filtered) or a higher goal.'); return out; }
  const mlPerL = need / perMl, total = mlPerL * V;
  out.ok = true; out.goal = r2(goal); out.mlPerL = r3(mlPerL); out.totalMl = r2(total); out.finalEc = r2(w + mlPerL * perMl); out.perMl = r3(perMl);
  if (mlPerL > D * 1.5) notes.push('That is ' + r2(mlPerL / D) + ' times the label dose. Check the label and your numbers before adding anything.');
  if (T > 3.5) notes.push('An EC of ' + r2(T) + ' mS/cm is high for most crops. Check your target.');
  if (f < 1) notes.push('Seedling strength: ' + Math.round(f * 100) + '% of the finishing EC.');
  notes.push('Add a little at a time, mix, measure again. Follow your product label and wear what it says.');
  return out;
}
/* topping up a reservoir that has dropped: it holds currentL at currentEc now and you want targetL at targetEc using plain water (waterEc) and the same product */
export function topUp({ currentL, currentEc, targetL, targetEc, waterEc = 0, labelDose, labelEc }) {
  const Vc = num(currentL, 0, 0, 1e6), Ec = num(currentEc, 0, 0, 20), V = num(targetL, 0, 0, 1e6), T = num(targetEc, 0, 0, 20), w = num(waterEc, 0, 0, 20), D = num(labelDose, 0, 0, 1000), E = num(labelEc, 0, 0, 20);
  const notes = [], out = { ok: false, notes };
  if (V <= 0 || Vc < 0 || T <= 0) { notes.push('Type the volume you want and the EC you want.'); return out; }
  if (V < Vc) { notes.push('The reservoir already holds more than you want to end with.'); return out; }
  const water = V - Vc, waterOnly = (Ec * Vc + w * water) / V;
  out.waterL = r2(water); out.waterOnlyEc = r2(waterOnly);
  if (waterOnly >= T) { out.ok = true; out.mlNutrient = 0; out.finalEc = r2(waterOnly); notes.push(waterOnly > T + 0.05 ? 'Topping up with plain water only would give ' + r2(waterOnly) + ' mS/cm, which is above your goal: dilute with more water or drain some first.' : 'Plain water alone gets you to the goal.'); return out; }
  if (E > 0 && E < 0.01) { notes.push('An EC rise under 0.01 mS/cm is too small to scale from: measure it again with more product.'); out.waterOnly = true; return out; }
  if (D <= 0 || E <= 0) { notes.push('Type the dose and the EC rise from your product label to work out how much to add.'); out.waterOnly = true; return out; }
  const perMl = E / D, ml = (T - waterOnly) * V / perMl;
  out.ok = true; out.mlNutrient = r2(ml); out.finalEc = r2(T);
  if (ml / V > D * 1.5) notes.push('That is ' + r2(ml / V / D) + ' times the label dose for the whole reservoir. Check the label and your numbers before adding anything.');
  if (T > 3.5) notes.push('An EC of ' + r2(T) + ' mS/cm is high for most crops. Check your target.');
  notes.push('Add the water first, then the nutrient a little at a time, mixing and measuring. Follow your product label.');
  return out;
}

/* ---------- typical target bands (labelled typical, with the source) ---------- */
export const BANDS = {
  greens:   { name: 'Leafy greens (typical)', ec: [1.2, 2.0], ph: [5.5, 6.2], src: 'Virginia Tech SPES-463' },
  lettuce:  { name: 'Lettuce (typical)', ec: [1.2, 1.6], ph: [5.4, 6.0], src: 'Produce Grower, lettuce 101 (about 1.4)' },
  spinach:  { name: 'Spinach (typical)', ec: [1.6, 2.0], ph: [5.4, 6.0], src: 'Produce Grower (about 1.8)' },
  cress:    { name: 'Watercress (typical)', ec: [1.0, 1.4], ph: [5.4, 6.0], src: 'Produce Grower (about 1.2)' },
  basil:    { name: 'Basil (typical)', ec: null, ph: [4.5, 6.5], phBest: 5.5, src: 'Produce Grower, herbs (best about 5.5)' },
  dillpars: { name: 'Dill and parsley (typical)', ec: null, ph: [5.0, 6.0], phBest: 5.5, src: 'Produce Grower, herbs' },
  sage:     { name: 'Sage (typical)', ec: null, ph: [5.5, 6.5], phBest: 6.0, src: 'Produce Grower, herbs' },
  nft_school: { name: 'A school NFT system', ec: [0.85, 0.95], ph: [5.9, 6.2], src: 'St Olaf fact sheet (850 to 950 uS/cm)' },
  ebb_school: { name: 'A school ebb and flow system', ec: [0.6, 0.7], ph: [6.2, 6.5], src: 'St Olaf fact sheet (600 to 700 uS/cm)' },
};
export const SEEDLING_FRACTION = [0.25, 0.5];   // seedling solution at 1/4 to 1/2 of the finishing EC (Produce Grower)
export const bandCheck = (v, range) => (!range || !Number.isFinite(v) ? '' : v < range[0] ? 'low' : v > range[1] ? 'high' : 'ok');

/* ---------- the saved file ---------- */
export const LIMITS = { res: 20, readings: 500, reminders: 40 };
export function cleanDoc(p) {
  if (!p || typeof p !== 'object' || p.format !== FORMAT) throw new Error('This is not an LT-Nutrients file.');
  if (+p.version > VERSION) throw new Error('This file was made by a newer LT-Nutrients. Reload the page to update, then open it again.');
  const ids = new Set(), res = [];
  for (const r of (Array.isArray(p.res) ? p.res : []).slice(0, LIMITS.res)) {
    if (!r || typeof r !== 'object') continue;
    let id = str(r.id, 20).replace(/[^A-Za-z0-9_-]/g, ''); if (!id || ids.has(id)) id = 'r' + Math.random().toString(36).slice(2, 8); ids.add(id);
    const o = { id, name: str(r.name, 60) || 'Reservoir', litres: r3(num(r.litres, 20, 0.1, 100000)), band: typeof r.band === 'string' && own(BANDS, r.band) ? r.band : 'greens', labelDose: r3(num(r.labelDose, 0, 0, 1000)), doseUnit: typeof r.doseUnit === 'string' && own(DOSE_UNITS, r.doseUnit) ? r.doseUnit : 'mlL', labelEc: r3(num(r.labelEc, 0, 0, 20)), waterEc: r3(num(r.waterEc, 0, 0, 20)), changeEvery: Math.round(num(r.changeEvery, 14, 1, 120)), lastChange: day(r.lastChange), readings: [] };
    for (const x of (Array.isArray(r.readings) ? r.readings : []).slice(-LIMITS.readings)) {
      if (!x || typeof x !== 'object' || !day(x.date)) continue;
      const e = { date: x.date };
      if (x.ec != null && x.ec !== '' && Number.isFinite(Number(x.ec))) e.ec = r3(num(x.ec, 0, 0, 20));
      if (x.ph != null && x.ph !== '' && Number.isFinite(Number(x.ph))) e.ph = r2(num(x.ph, 7, 0, 14));
      if (x.temp != null && x.temp !== '' && Number.isFinite(Number(x.temp))) e.temp = r2(num(x.temp, 20, -10, 80));
      if (x.litres != null && x.litres !== '' && Number.isFinite(Number(x.litres))) e.litres = r3(num(x.litres, 0, 0, 100000));
      if (str(x.note, 120)) e.note = str(x.note, 120);
      if (e.ec == null && e.ph == null && e.temp == null && e.litres == null && !e.note) continue;
      o.readings.push(e);
    }
    o.readings.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    res.push(o);
  }
  return { format: FORMAT, version: VERSION, name: str(p.name, 80) || 'My reservoirs', units: p.units === 'ft' ? 'ft' : 'm', scale: own(PPM_SCALES, String(p.scale)) ? +p.scale : 500, res };
}
export const blankDoc = () => cleanDoc({ format: FORMAT, version: VERSION, res: [{ name: 'Reservoir 1' }] });
/* A worked example for people opening the tool for the first time: an invented lettuce-bench reservoir with two weeks of readings that end today.
   The product numbers are made up to show how the sums work. Members always type their own label figures. */
export function exampleReservoir(todayIso) {
  const base = day(todayIso) || new Date().toISOString().slice(0, 10), t0 = new Date(base + 'T00:00:00Z');
  const ago = n => { const d = new Date(t0); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
  const rows = [[13, 1.5, 5.9, 20.5, 'Fresh mix'], [11, 1.6, 6.1, 20.8], [9, 1.8, 6.3, 21.4, 'EC creeping up as plants drink'], [8, 1.5, 6.3, 21.1, 'Topped up with plain water'], [6, 1.6, 6.5, 21.0, 'pH drifting up'], [5, 1.6, 5.9, 21.6, 'Adjusted pH'], [3, 1.7, 6.0, 21.9], [0, 1.9, 6.2, 22.2]];
  return cleanDoc({ format: FORMAT, version: VERSION, res: [{ name: 'Example: lettuce bench', litres: 40, band: 'greens', labelDose: 2, doseUnit: 'mlL', labelEc: 1.3, waterEc: 0.2, changeEvery: 14, lastChange: ago(13),
    readings: rows.map(([n, ec, ph, temp, note]) => ({ date: ago(n), ec, ph, temp, note: note || '' })) }] }).res[0];
}
/* next solution change: lastChange plus changeEvery days (ISO), or '' */
export function nextChange(r) { if (!r.lastChange) return ''; const d = new Date(r.lastChange + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + r.changeEvery); return d.toISOString().slice(0, 10); }
