/* Indoor growing data and helpers for LT-Planner (no DOM, tested on its own: qa indoor_test.mjs).
   Everything here is a TYPICAL starting point taken from extension and grower sources (see RESEARCH-indoor-growing.md).
   Members can edit any number in the plan; nothing here is advice for a particular room, and nothing certifies safety. */

/* ---------- units: plans always store metres; this is only how lengths are shown and typed ---------- */
export const UNITS = ['m', 'ft'];
/* tables a plan names things in are made without Object.prototype, so a name like 'constructor' or '__proto__' is simply not found */
const nul = o => Object.assign(Object.create(null), o);
const FT = 0.3048, IN = 0.0254;
const trimZ = s => (s.includes('.') ? s.replace(/\.?0+$/, '') : s);   // only trim after a decimal point: '450' must not become '45'
export function fmtLen(m, units = 'm') {
  if (!Number.isFinite(m)) return '';
  if (units === 'ft') {
    const neg = m < 0, tin = Math.round(Math.abs(m) / IN);   // whole inches
    const f = Math.floor(tin / 12), i = tin % 12;
    return (neg ? '-' : '') + (f ? f + "'" : '') + (f && i ? ' ' : '') + (i || !f ? i + '"' : '');
  }
  const a = Math.abs(m);
  return a >= 1 || a === 0 ? trimZ(m.toFixed(2)) + ' m' : Math.round(m * 100) + ' cm';
}
/* Accepts 125, 125cm, 1.25m, 4'1", 4' 1, 4ft 1in, 49in, 3.5 ft, 1.5' ; a bare number uses the member's units (m, or inches for ft ... no: feet).
   Returns metres, or null when it cannot be read. */
export function parseLen(text, units = 'm') {
  if (typeof text !== 'string' && typeof text !== 'number') return null;
  const s = String(text).trim().toLowerCase().replace(/,/g, '.').replace(/”|″|''/g, '"').replace(/’|′/g, "'");
  if (!s || s.length > 40) return null;
  let m = s.match(/^(-?(?:\d+\.?\d*|\.\d+))\s*(?:'|ft|feet|foot)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inch|inches)?)?$/);
  if (m) { const f = +m[1], i = m[2] ? +m[2] : 0; return f < 0 ? f * FT - i * IN : f * FT + i * IN; }
  m = s.match(/^(-?(?:\d+\.?\d*|\.\d+))\s*(mm|cm|m|"|in|inch|inches)?$/);
  if (m) {
    const v = +m[1], u = m[2];
    if (u === 'mm') return v / 1000; if (u === 'cm') return v / 100; if (u === 'm') return v;
    if (u === '"' || u === 'in' || u === 'inch' || u === 'inches') return v * IN;
    return units === 'ft' ? v * FT : v;   // a bare number is metres or feet to match the plan
  }
  return null;
}
/* area, volume and weight shown the member's way */
export const fmtArea = (m2, units = 'm') => units === 'ft' ? trimZ((m2 / (FT * FT)).toFixed(1)) + ' sq ft' : trimZ(m2.toFixed(2)) + ' m²';
export const fmtMass = (g, units = 'm') => units === 'ft' ? trimZ((g / 28.3495).toFixed(1)) + ' oz' : trimZ(g.toFixed(0)) + ' g';

/* ---------- rooms, shelves, trays (sizes in metres) ---------- */
export const ROOM_PRESETS = nul({
  tent60:  { name: 'Grow tent 60 x 60 cm', style: 'tent', w: 0.6, h: 0.6, ceilH: 1.4 },
  tent80:  { name: 'Grow tent 80 x 80 cm', style: 'tent', w: 0.8, h: 0.8, ceilH: 1.6 },
  tent100: { name: 'Grow tent 1 x 1 m', style: 'tent', w: 1.0, h: 1.0, ceilH: 2.0 },
  tent120: { name: 'Grow tent 1.2 x 1.2 m', style: 'tent', w: 1.2, h: 1.2, ceilH: 2.0 },
  tent120x240: { name: 'Grow tent 1.2 x 2.4 m', style: 'tent', w: 1.2, h: 2.4, ceilH: 2.0 },
  closet:  { name: 'Closet or cupboard', style: 'room', w: 1.2, h: 0.7, ceilH: 2.4 },
  room3:   { name: 'Small room 3 x 3 m', style: 'room', w: 3, h: 3, ceilH: 2.4 },
  room4:   { name: 'Room 4 x 3 m', style: 'room', w: 4, h: 3, ceilH: 2.4 },
});
export const SHELF_PRESETS = nul({
  wire3:  { name: 'Wire rack, 3 tiers', w: 0.9, h: 0.35, tiers: 3, tierGap: 0.4 },
  wire4:  { name: 'Wire rack, 4 tiers', w: 1.2, h: 0.45, tiers: 4, tierGap: 0.4 },
  wire5:  { name: 'Wire rack, 5 tiers', w: 1.2, h: 0.45, tiers: 5, tierGap: 0.35 },
  bench1: { name: 'Bench, 1 tier', w: 1.2, h: 0.6, tiers: 1, tierGap: 0.6 },
  bench2: { name: 'Bench with shelf under', w: 1.2, h: 0.6, tiers: 2, tierGap: 0.45 },
  tall6:  { name: 'Tall rack, 6 tiers', w: 1.2, h: 0.45, tiers: 6, tierGap: 0.3 },
});
/* footprint in metres; cells = number of cells for capacity; the six presets plus a custom size ('custom' uses the item's own w/h) */
export const TRAY_PRESETS = nul({
  flat1020: { name: '1020 flat (microgreens)', w: 0.543, h: 0.279, cells: 0 },
  half1010: { name: 'Half flat 10 x 10 in', w: 0.254, h: 0.254, cells: 0 },
  cell72:   { name: '72-cell tray', w: 0.543, h: 0.279, cells: 72 },
  cell128:  { name: '128-cell tray', w: 0.543, h: 0.279, cells: 128 },
  pot4:     { name: '4 in pots (one)', w: 0.1, h: 0.1, cells: 1 },
  prop:     { name: 'Propagator 38 x 24 cm', w: 0.38, h: 0.24, cells: 0 },
});
export const TRAY_KINDS = [...Object.keys(TRAY_PRESETS), 'custom'];
export const LIMITS = { rooms: 100, shelves: 300, trays: 3000 };
export const HISTORY_KEEP = 12;   // the same number cleanItem keeps, so nothing is lost when the plan is opened again

/* ---------- crop cycles ----------
   stages: [key, label, min, expected, max] in days from the end of the stage before.
   'reset' = days to empty and clean the space before the next batch.  All typical; edit freely. */
const ord = ([a, b, c]) => { b = Math.max(a, b); c = Math.max(b, c); return [a, b, c]; };   // keep min <= expected <= max
const mg = (name, germ, harvest, seedG, extra = {}) => ({ name, group: 'Microgreens', stages: [['germ', 'Blackout / germination', germ[0], germ[1], germ[2]], ['grow', 'Under light to harvest', ...ord([Math.max(1, harvest[0] - germ[0]), Math.max(1, harvest[1] - germ[1]), Math.max(1, harvest[2] - germ[2])])]], reset: 2, seedG, light: 'after', ...extra });
/* hydroponic crops: [days sowing to transplant: min, expected, max], [days transplant to harvest]. verify = the grow-out figure has not been checked against a source yet. */
const hy = (name, seedling, grow, targets, note, verify = false) => ({ name, group: 'Hydro', stages: [['germ', 'Seedling in plugs to transplant', ...ord(seedling)], ['grow', 'Grow-out in the system to harvest', ...ord(grow)]], reset: 2, light: 'any', ec: targets.ec || null, ph: targets.ph, phBest: targets.phBest || null, src: targets.src, band: targets.band, note, verify });
const sd = (name, germ, weeks, cell, temp, dark = false) => ({ name, group: 'Seedlings', stages: [['germ', 'Germination', germ[0], germ[1], germ[2]], ['grow', 'Grow on to transplant', ...ord([Math.max(7, weeks[0] * 7 - germ[0]), Math.max(7, weeks[1] * 7 - germ[1]), Math.max(7, weeks[2] * 7 - germ[2])])]], reset: 3, cell, temp, light: dark ? 'dark' : 'any' });
export const CYCLES = nul({
  // microgreens: [germination/blackout min, expected, max], [harvest min, expected, max days from sowing]
  mg_radish:    mg('Radish', [2, 3, 4], [5, 10, 12], 32),
  mg_arugula:   mg('Arugula', [3, 4, 6], [6, 10, 12], 12),
  mg_broccoli:  mg('Broccoli', [2, 3, 4], [8, 10, 12], 20),
  mg_kale:      mg('Kale', [2, 3, 4], [8, 10, 12], 20),
  mg_mustard:   mg('Mustard', [2, 3, 4], [6, 9, 12], 20),
  mg_cabbage:   mg('Red cabbage', [2, 3, 4], [8, 10, 12], 20),
  mg_pea:       mg('Pea shoots', [3, 4, 5], [8, 10, 12], 237, { soakH: 8 }),
  mg_sunflower: mg('Sunflower', [3, 4, 5], [8, 10, 12], 150, { soakH: 8 }),
  mg_wheatgrass: mg('Wheatgrass', [2, 3, 4], [8, 9, 10], 450, { soakH: 8 }),
  mg_beet:      mg('Beet', [3, 4, 5], [10, 12, 14], 50, { soakH: 6 }),
  mg_chard:     mg('Swiss chard', [3, 4, 5], [10, 12, 14], 50, { soakH: 6 }),
  mg_cress:     mg('Cress', [2, 3, 4], [7, 9, 12], 20),
  mg_coriander: mg('Coriander (cilantro)', [5, 7, 9], [14, 21, 28], 50),
  mg_basil:     mg('Basil', [3, 4, 6], [20, 22, 25], 10),
  mg_amaranth:  mg('Amaranth', [2, 3, 4], [8, 10, 14], 10),
  mg_buckwheat: mg('Buckwheat', [2, 3, 4], [8, 10, 12], 100, { soakH: 6 }),
  // seedlings for transplanting: [days to germinate], [weeks sowing to planting out min, expected, max]
  s_tomato:  sd('Tomato', [6, 8, 12], [5, 6, 7], '72 cells, then 2-3 in pots', [21, 24]),
  s_pepper:  sd('Pepper and chilli', [7, 10, 14], [6, 8, 10], '72 cells, then pots', [21, 27]),
  s_eggplant: sd('Eggplant', [7, 10, 14], [6, 8, 10], '72 cells, then pots', [24, 29]),
  s_lettuce: sd('Lettuce', [2, 3, 7], [4, 5, 6], '128 cells', [15, 21], true),
  s_brassica: sd('Cabbage, broccoli, kale', [4, 5, 7], [4, 5, 6], '72 or 128 cells', [18, 24]),
  s_cucurbit: sd('Cucumber, squash, melon', [3, 5, 10], [3, 4, 4], '32-50 cells or pots', [24, 27]),
  s_onion:   sd('Onion and leek', [5, 8, 12], [8, 9, 10], '128-288 cells', [18, 24]),
  s_celery:  sd('Celery', [10, 12, 18], [10, 11, 12], '128 cells', [18, 21], true),
  s_basil:   sd('Basil (to plant out)', [5, 10, 14], [5, 5, 6], '72 cells', [21, 24]),
  s_parsley: sd('Parsley', [14, 20, 25], [6, 7, 8], '72 cells', [18, 24]),
  s_dill:    sd('Dill', [7, 10, 14], [5, 6, 6], '72 cells', [18, 21]),
  s_flower:  sd('Annual flowers', [5, 8, 14], [5, 7, 10], '72 cells', [18, 24]),
  // hydroponic crops. Seedling times: University extension guides (10 to 14 days for lettuce; 2 to 3 weeks for herbs). Basil grow-out: about 4 weeks after transplant.
  h_lettuce: hy('Lettuce (hydro)', [10, 12, 14], [21, 28, 35], { ec: [1.2, 1.6], ph: [5.4, 6.0], src: 'Produce Grower, lettuce (about EC 1.4)', band: 'lettuce' }, 'Grow-out days are a typical range that still needs checking against your own batches.', true),
  h_basil:   hy('Basil (hydro)', [14, 17, 21], [28, 28, 35], { ec: [1.2, 2.0], ph: [4.5, 6.5], phBest: 5.5, src: 'Produce Grower, herbs; leafy EC from Virginia Tech SPES-463', band: 'basil' }, 'Harvest about 4 weeks after transplant.'),
  h_parsley: hy('Parsley (hydro)', [14, 21, 21], [28, 28, 35], { ec: [1.2, 2.0], ph: [5.0, 6.0], phBest: 5.5, src: 'Produce Grower, herbs; leafy EC from Virginia Tech SPES-463', band: 'dillpars' }, ''),
  h_dill:    hy('Dill (hydro)', [14, 17, 21], [28, 28, 35], { ec: [1.2, 2.0], ph: [5.0, 6.0], phBest: 5.5, src: 'Produce Grower, herbs; leafy EC from Virginia Tech SPES-463', band: 'dillpars' }, ''),
  h_sage:    hy('Sage (hydro)', [14, 21, 21], [28, 35, 42], { ec: [1.2, 2.0], ph: [5.5, 6.5], phBest: 6.0, src: 'Produce Grower, herbs; leafy EC from Virginia Tech SPES-463', band: 'sage' }, 'Slower than the soft herbs.'),
});
export const CYCLE_KEYS = Object.keys(CYCLES);
/* a seedling tray grown in plugs usually goes into the system as the matching hydro crop */
export const TO_HYDRO = nul({ s_lettuce: 'h_lettuce', s_basil: 'h_basil', s_parsley: 'h_parsley', s_dill: 'h_dill', mg_basil: 'h_basil' });
export const cycleOf = key => CYCLES[key] || null;

const DAY = 864e5;
const toD = s => { const d = new Date(s + 'T00:00:00Z'); return isNaN(+d) ? null : d; };
const iso = d => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = toD(s); return d ? iso(new Date(+d + Math.round(n) * DAY)) : ''; };
export const daysBetween = (a, b) => { const x = toD(a), y = toD(b); return x && y ? Math.round((+y - +x) / DAY) : null; };

/* stage timeline for a sowing date. Returns [{key,label,startE,endEarly,endExp,endLate}] with ISO dates, and the date the space is free again
   (early, expected, late), reset time included. A stage the member already logged (actual end date) moves every later stage. */
export function timeline(cycle, sow, actual = {}, reset) {
  if (!cycle || !sow || !toD(sow)) return null;
  let sE = sow, sX = sow, sL = sow; const out = [];
  for (const [key, label, mn, ex, mx] of cycle.stages) {
    const row = { key, label, start: sX };
    const done = actual && actual[key] && toD(actual[key]) && actual[key] >= row.start ? actual[key] : null;   // a logged date before the stage began is ignored
    if (done) { sE = sX = sL = done; row.endEarly = row.endExp = row.endLate = done; row.actual = true; }
    else { sE = addDays(sE, mn); sX = addDays(sX, ex); sL = addDays(sL, mx); row.endEarly = sE; row.endExp = sX; row.endLate = sL; }
    out.push(row);
  }
  const r = Number.isFinite(+reset) ? +reset : cycle.reset || 0;
  return { stages: out, readyEarly: sE, readyExp: sX, readyLate: sL, freeEarly: addDays(sE, r), freeExp: addDays(sX, r), freeLate: addDays(sL, r), reset: r };
}

/* ---------- occupancy and succession ---------- */
/* a tray's busy window: [sow, freeLate) ; later of 'expected' used for planning, 'late' for clash warnings */
export function busy(tray, mode = 'late') {
  const cy = cycleOf(tray.crop); if (!cy || !tray.sow) return null;
  const tl = timeline(cy, tray.sow, tray.actual, tray.reset);
  if (!tl) return null;
  const hasEnd = tray.cleared && toD(tray.cleared);
  const end = hasEnd ? tray.cleared : mode === 'exp' ? tl.freeExp : mode === 'early' ? tl.freeEarly : tl.freeLate;
  return { from: tray.sow, to: end < tray.sow ? tray.sow : end, tl };
}
/* Do two batches that share one place (same shelf, same tier, overlapping spot) overlap in time? Touching is not overlapping. */
export const overlaps = (a, b) => a && b && a.from < b.to && b.from < a.to;

/* Succession: one tray of `crop` every `every` days for `count` sowings starting `start`, filling the given slots ([{id}], each a free place).
   A slot can take a new batch once its last batch's late free date has passed. Returns [{sow, slot|null}], null slot = no free place that day. */
export function succession(crop, start, every, count, slots, taken = {}) {
  const cy = cycleOf(crop); if (!cy || !toD(start) || !(every >= 1) || !(count >= 1) || !slots || !slots.length) return [];
  count = Math.min(count, 200);
  // null-prototype, and own-property reads: a tray named "constructor" or "toString" used to crash the planner
  const own = (o, k) => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  const freeAt = Object.create(null);
  for (const s of slots) { const b0 = own(taken, s.id); freeAt[s.id] = (Array.isArray(b0) ? b0 : []).reduce((m, b) => (b && b.to > m ? b.to : m), '0000-00-00'); }
  const plan = [];
  for (let i = 0; i < count; i++) {
    const sow = addDays(start, i * every), tl = timeline(cy, sow);
    const slot = slots.find(s => freeAt[s.id] <= sow);
    if (slot) freeAt[slot.id] = tl.freeLate;
    plan.push({ sow, slot: slot ? slot.id : null, ready: tl.readyExp, free: tl.freeLate });
  }
  return plan;
}

/* ---------- shelf maths (all in the shelf's own frame: x along the width, y along the depth, origin at the shelf centre) ---------- */
const rotXY = (x, y, deg) => { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [x * c - y * s, x * s + y * c]; };
/* where a tray sits in its shelf's frame, and how far it reaches along each axis (its rotation against the shelf counted) */
export function inShelf(tray, shelf) {
  const [lx, ly] = rotXY(tray.x - shelf.x, tray.y - shelf.y, -shelf.rot), d = ((tray.rot - shelf.rot) * Math.PI) / 180, c = Math.abs(Math.cos(d)), s = Math.abs(Math.sin(d));
  return { x: lx, y: ly, ex: tray.w * c + tray.h * s, ey: tray.w * s + tray.h * c };
}
/* how many trays of this footprint fit one tier: whichever way round gives more (estimate: ignores handles and lips) */
export function capacity(shelf, w, h) {
  if (!(w > 0) || !(h > 0) || !(shelf && shelf.w > 0 && shelf.h > 0)) return 0;
  const fit = (a, b) => Math.floor((shelf.w + 1e-6) / a) * Math.floor((shelf.h + 1e-6) / b);
  return Math.max(fit(w, h), fit(h, w));
}
/* free positions on a tier for trays of w x h, in plan coordinates and the shelf's rotation: a grid from the left rear corner, skipping spots a tray already holds */
export function freeSpots(shelf, tier, w, h, trays, max = 200) {
  if (!(w > 0) || !(h > 0) || !(shelf && shelf.w > 0 && shelf.h > 0)) return [];   // a zero or missing size gave 200 spots at NaN
  const cols = Math.floor((shelf.w + 1e-6) / w), rows = Math.floor((shelf.h + 1e-6) / h); if (cols < 1 || rows < 1) return [];
  const mine = trays.filter(t => t.shelf === shelf.id && t.tier === tier).map(t => inShelf(t, shelf)), out = [];
  const gx = (shelf.w - cols * w) / (cols + 1), gy = (shelf.h - rows * h) / (rows + 1);
  for (let r = 0; r < rows && out.length < max; r++) for (let c = 0; c < cols && out.length < max; c++) {
    const lx = -shelf.w / 2 + gx * (c + 1) + w * c + w / 2, ly = -shelf.h / 2 + gy * (r + 1) + h * r + h / 2;
    if (mine.some(m => Math.abs(m.x - lx) < (m.ex + w) / 2 - 1e-3 && Math.abs(m.y - ly) < (m.ey + h) / 2 - 1e-3)) continue;
    const [px, py] = rotXY(lx, ly, shelf.rot); out.push({ x: Math.round((shelf.x + px) * 1000) / 1000, y: Math.round((shelf.y + py) * 1000) / 1000, rot: shelf.rot });
  }
  return out;
}
/* the tier a new tray at (x, y) should take: the lowest tier where nothing is already there */
export function pickTier(shelf, x, y, w, h, trays) {
  const probe = { x, y, w, h, rot: shelf.rot };
  const mine = n => trays.filter(t => t.shelf === shelf.id && t.tier === n).map(t => inShelf(t, shelf)), me = inShelf(probe, shelf);
  for (let n = 1; n <= shelf.tiers; n++) if (!mine(n).some(m => Math.abs(m.x - me.x) < (m.ex + me.ex) / 2 - 1e-3 && Math.abs(m.y - me.y) < (m.ey + me.ey) / 2 - 1e-3)) return n;
  return 1;
}
/* trays sharing a place at the same time: [[a, b, reason]] where a and b are tray ids. Same shelf and tier, footprints overlap, and the batches overlap in time (late dates, so it is a warning not a certainty).
   Also trays that overhang the shelf. */
export function clashes(items) {
  const shelves = new Map(items.filter(i => i.kind === 'shelf').map(i => [i.id, i])), trays = items.filter(i => i.kind === 'tray' && i.shelf && shelves.has(i.shelf) && !i.off);
  const by = new Map(); for (const t of trays) { const k = t.shelf + '|' + t.tier; (by.get(k) || by.set(k, []).get(k)).push(t); }
  const out = [];
  for (const list of by.values()) {
    const sh = shelves.get(list[0].shelf), ge = list.map(t => ({ t, g: inShelf(t, sh), b: busy(t) }));
    for (let i = 0; i < ge.length && out.length < 500; i++) for (let j = i + 1; j < ge.length; j++) {
      const a = ge[i], b = ge[j];
      if (Math.abs(a.g.x - b.g.x) < (a.g.ex + b.g.ex) / 2 - 1e-3 && Math.abs(a.g.y - b.g.y) < (a.g.ey + b.g.ey) / 2 - 1e-3) {
        if (!a.b && !b.b) out.push([a.t.id, b.t.id, 'space']);          // two trays drawn on top of each other (no batches yet)
        else if (!a.b || !b.b || overlaps(a.b, b.b)) out.push([a.t.id, b.t.id, a.b && b.b ? 'time' : 'space']);
      }
    }
  }
  return out;
}
export function overhangs(tray, shelf) { const g = inShelf(tray, shelf); return Math.abs(g.x) + g.ex / 2 > shelf.w / 2 + 0.01 || Math.abs(g.y) + g.ey / 2 > shelf.h / 2 + 0.01; }

/* ---------- batch status on a day, and what this member's own batches say ---------- */
export function status(tray, date) {
  if (!tray.crop || !tray.sow) return 'empty';
  if (date < tray.sow) return 'planned';
  if (tray.cleared && date >= tray.cleared) return 'cleared';
  const tl = timeline(cycleOf(tray.crop), tray.sow, tray.actual, tray.reset); if (!tl) return 'empty';
  if (date > tl.readyLate) return 'late';
  return date >= tl.readyEarly ? 'ready' : 'growing';
}
/* finished batches (history plus a cleared current one): { n, avg days sow to cleared, min, max } for a crop, or null */
export function learned(items, crop) {
  const days = [];
  for (const t of items) if (t.kind === 'tray' || t.kind === 'hydro') {
    for (const h of [...(t.history || []), t]) if (h.crop === crop && h.sow && h.cleared) { const d = daysBetween(h.sow, h.cleared); if (d != null && d >= 0 && d < 400) days.push(d); }
  }
  if (!days.length) return null;
  return { n: days.length, avg: Math.round(days.reduce((a, b) => a + b, 0) / days.length * 10) / 10, min: days.reduce((a, b) => (b < a ? b : a), days[0]), max: days.reduce((a, b) => (b > a ? b : a), days[0]) };
}
/* finish this tray's batch (cleared today) and start the next: the old one goes to history (newest last, 30 kept) */
export function nextBatch(tray, clearedOn, crop, sow) {
  if (tray.crop && tray.sow) {
    const h = { crop: tray.crop, sow: tray.sow, cleared: tray.cleared || clearedOn };
    if (tray.actual) h.actual = { ...tray.actual }; if (tray.qty) h.qty = tray.qty; if (tray.note) h.note = tray.note;
    tray.history = [...(tray.history || []), h].slice(-HISTORY_KEEP);
  }
  delete tray.actual; delete tray.cleared; tray.qty = 0; tray.note = '';
  if (crop && CYCLES[crop]) { tray.crop = crop; tray.sow = sow || ''; } else { delete tray.crop; tray.sow = ''; }
  return tray;
}

/* ---------- equipment: generic items we write (no brands, no prices); members edit every number ----------
   [key]: { name, group, w, h (footprint, m), hgt (height, m), watts (typical, 0 = not powered), hours (typical hours on per day),
            spread (beam angle for lights, degrees, an assumption), mount ('tier' sits on a tier, 'above' hangs above a tier, 'floor' stands on the floor), note } */
const eq = (name, group, w, h, hgt, watts, hours, mount, note = '', extra = {}) => ({ name, group, w, h, hgt, watts, hours, mount, note, ...extra });
export const EQUIP = nul({
  // lights
  led_bar:     eq('LED bar light (seedling)', 'Lights', 0.55, 0.04, 0.03, 20, 16, 'above', 'Hang 20-30 cm above seedlings. Wattage is the plug rating, not a light measurement.', { spread: 110 }),
  led_strip:   eq('LED strip (under shelf)', 'Lights', 1.1, 0.03, 0.01, 15, 16, 'above', 'Stuck under the tier above. Needs a driver; keep wiring clear of water.', { spread: 120 }),
  led_panel:   eq('LED panel light', 'Lights', 0.6, 0.6, 0.05, 100, 16, 'above', 'For a tent or a taller crop. Hang at the height the maker gives.', { spread: 90 }),
  led_panel_s: eq('LED panel light (small)', 'Lights', 0.3, 0.3, 0.04, 45, 16, 'above', 'Fits a 60-80 cm tent.', { spread: 90 }),
  t5_fixture:  eq('T5 fluorescent fixture', 'Lights', 1.2, 0.1, 0.05, 54, 16, 'above', 'Keep about 10-15 cm above seedlings. Runs warmer than LED.', { spread: 120 }),
  // heat
  heat_mat:    eq('Seedling heat mat', 'Heat', 0.53, 0.28, 0.01, 20, 24, 'tier', 'One flat sized. Use the thermostat so seed mix does not overheat.'),
  heat_mat_l:  eq('Heat mat (large)', 'Heat', 1.0, 0.5, 0.01, 40, 24, 'tier', 'Two flats sized.'),
  heater_fan:  eq('Small room heater', 'Heat', 0.25, 0.2, 0.3, 800, 8, 'floor', 'Keep clear of curtains, fabric tent walls and water. Ask a qualified person about the circuit.'),
  // air
  clip_fan:    eq('Clip fan (air movement)', 'Air', 0.15, 0.1, 0.18, 10, 24, 'floor', 'Gentle air over seedlings helps stems and cuts damping-off.'),
  inline_fan:  eq('Inline extraction fan', 'Air', 0.25, 0.25, 0.3, 40, 24, 'floor', 'Moves air out of a tent. Size to your tent and ducting; the planner does not calculate air changes.'),
  carbon_filter: eq('Carbon filter', 'Air', 0.2, 0.2, 0.4, 0, 0, 'floor', 'Passive, goes on the inline fan.'),
  // humidity
  humidifier:  eq('Humidifier', 'Humidity', 0.2, 0.2, 0.3, 25, 8, 'floor', 'Clean often. Raises humidity: watch for mould on microgreens.'),
  dehumidifier: eq('Dehumidifier', 'Humidity', 0.3, 0.25, 0.5, 200, 8, 'floor', 'Needs a drain or emptying. Ask a qualified person about the circuit.'),
  dome:        eq('Humidity dome', 'Humidity', 0.55, 0.28, 0.15, 0, 0, 'tier', 'Lid over a flat. Vent it daily once seedlings are up.'),
  // control and sensing
  timer:       eq('Plug-in timer', 'Control', 0.07, 0.05, 0.08, 0, 0, 'floor', 'Set for the hours on the light.'),
  thermostat:  eq('Heat mat thermostat', 'Control', 0.1, 0.06, 0.05, 0, 0, 'floor', 'Probe goes in the seed mix.'),
  thermo_hygro: eq('Thermometer and hygrometer', 'Control', 0.07, 0.03, 0.08, 0, 0, 'tier', 'Put one at plant height, and note min and max.'),
  power_board: eq('Power board', 'Control', 0.3, 0.06, 0.04, 0, 0, 'floor', 'Add up what is plugged in. The planner does not check electrical safety.'),
  // water
  spray_bottle: eq('Spray bottle', 'Water', 0.08, 0.06, 0.25, 0, 0, 'floor'),
  watering_can: eq('Watering can', 'Water', 0.2, 0.12, 0.25, 0, 0, 'floor'),
  bottom_tray: eq('Bottom-watering tray', 'Water', 0.55, 0.3, 0.05, 0, 0, 'tier', 'A tray under the cell tray; fill it and let seedlings drink.'),
  bucket:      eq('Reservoir bucket (20 L)', 'Water', 0.3, 0.3, 0.35, 0, 0, 'floor', 'Water store for hand watering.', { litres: 20 }),
  air_pump:    eq('Air pump', 'Water', 0.12, 0.08, 0.08, 5, 24, 'floor', 'Keep above water level or fit a check valve.'),
  water_pump:  eq('Small water pump', 'Water', 0.1, 0.07, 0.08, 10, 24, 'floor', 'For later hydro layouts. Water and mains power: use a residual current device and ask a qualified person.'),
  // covers and tidy
  blackout:    eq('Blackout cover', 'Covers', 0.55, 0.28, 0.02, 0, 0, 'tier', 'Keeps microgreens dark for the blackout days.'),
  weight_tray: eq('Weight tray (stack cover)', 'Covers', 0.55, 0.28, 0.03, 0, 0, 'tier', 'An empty flat on top, for pressing seed down.'),
  stacker:     eq('Tray stacking frame', 'Covers', 0.58, 0.3, 0.3, 0, 0, 'tier', 'Holds stacked flats during germination.'),
  labels:      eq('Label stand', 'Covers', 0.1, 0.05, 0.1, 0, 0, 'tier'),
  scale:       eq('Kitchen scale', 'Covers', 0.15, 0.12, 0.03, 0, 0, 'floor', 'For weighing seed and yield.'),
  reservoir50:  eq('Reservoir, about 50 L', 'Water', 0.5, 0.4, 0.45, 0, 0, 'floor', 'A lidded tub for nutrient solution. Keep it dark and covered. Change the size to match yours.', { litres: 50 }),
  reservoir100: eq('Reservoir, about 100 L', 'Water', 0.65, 0.5, 0.55, 0, 0, 'floor', 'A lidded tub for nutrient solution. Keep it dark and covered. Change the size to match yours.', { litres: 100 }),
  sink_station: eq('Rinse station', 'Water', 0.6, 0.4, 0.8, 0, 0, 'floor', 'Where you soak, rinse and drain.'),
});
export const EQUIP_KEYS = Object.keys(EQUIP), EQUIP_GROUPS = [...new Set(Object.values(EQUIP).map(e => e.group))];
export const LIMITS_GEAR = 600;
const rect = (cx, cy, w, h, rot) => { const a = rot * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]); };
/* light coverage on the tray below: the light's own box widened by the beam at that height. An ESTIMATE (spread angle is an assumption you can change); nothing here is a light measurement */
export function coverage(g) {
  const e = EQUIP[g.item]; if (!e || e.group !== 'Lights') return null;
  const grow = 2 * Math.max(0.01, g.above) * Math.tan((Math.min(170, Math.max(20, g.spread || e.spread || 90)) / 2) * Math.PI / 180);
  return { w: g.w + grow, h: g.h + grow, rot: g.rot, x: g.x, y: g.y };
}
/* trays whose centre is under a light's coverage (same shelf and tier, or same tier of the shelf the light hangs from) */
export function litTrays(g, items) {
  const cv = coverage(g); if (!cv) return null;
  const a = (cv.rot || 0) * Math.PI / 180, c = Math.cos(-a), s = Math.sin(-a);
  const inside = t => { const dx = t.x - cv.x, dy = t.y - cv.y, lx = dx * c - dy * s, ly = dx * s + dy * c; return Math.abs(lx) <= cv.w / 2 && Math.abs(ly) <= cv.h / 2; };
  return items.filter(t => t.kind === 'tray' && !t.off && (g.shelf ? t.shelf === g.shelf && t.tier === g.tier : true) && inside(t));
}
/* does a light at this height fit above a tray on its tier? needs: tray height + plant height + light height <= tier gap. Plant height is typical for the crop. (estimate) */
export function lightFit(g, shelf, trays) {
  if (!shelf || !EQUIP[g.item] || EQUIP[g.item].group !== 'Lights') return null;
  const lit = (litTrays(g, trays) || []).filter(t => t.shelf === shelf.id);
  const trayH = 0.055, plant = Math.max(0, ...lit.map(t => (CYCLES[t.crop] ? (CYCLES[t.crop].group === 'Seedlings' ? 0.15 : 0.1) : 0))), need = trayH + plant + g.above + EQUIP[g.item].hgt, room = shelf.tierGap - shelf.tierT;
  return { need, room, ok: need <= room + 1e-6, plant };
}
/* energy: watts times hours on. A rough figure for planning (estimate); never a statement about circuits */
export const energy = g => { const w = Math.max(0, g.watts || 0), h = Math.min(24, Math.max(0, g.hours || 0)); return { watts: w, kwhDay: Math.round(w * h) / 1000 }; };
export function loadSummary(items) {
  const gear = items.filter(i => i.kind === 'gear' && !i.off && !i.hidden); let w = 0, kwh = 0, n = 0;
  for (const g of gear) { const e = energy(g); if (e.watts > 0) { n++; w += e.watts; kwh += e.kwhDay; } }
  return { items: gear.length, powered: n, watts: w, kwhDay: Math.round(kwh * 100) / 100 };
}
/* a heat mat should sit under a tray: report heat mats with nothing above them (estimate) */
export function matUnused(g, items) {
  if (g.item !== 'heat_mat' && g.item !== 'heat_mat_l') return false;
  return !items.some(t => t.kind === 'tray' && !t.off && (g.shelf ? t.shelf === g.shelf && t.tier === g.tier : true) && Math.abs(t.x - g.x) < (t.w + g.w) / 2 && Math.abs(t.y - g.y) < (t.h + g.h) / 2);
}
