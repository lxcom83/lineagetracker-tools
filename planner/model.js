/* LT-Planner plan model.  No DOM here, so it can be tested on its own (qa: planner_model_test.mjs).

   A plan file is JSON, extension .ltplan.  Units are metres; x grows to the right (east when north is up), y grows down.
   {
     format: 'lt-planner-plan', version: 1, name,
     site:  { w, h, north (degrees: where north points, 0 = up, 90 = right), lat, lon, grid (snap step in m), country (ISO code, '' = not set), zone (climate zone in that country, '' = not set) }
            The planting guide is only used when both are set: there is no default location.
     date:  'YYYY-MM-DD'   the day the timeline is showing
     items: [ item ]       the plan, front of the drawing last
     blocks: { id: { name, items: [ item ] } }   block definitions; their items use the block's own coordinates
   }
   Every item: { id, kind, folder, name, hidden, locked, off }, then by kind:
     bed, area, tank, bench:  x, y (centre), w, h, rot (degrees)  + bed: raised (m); area: fill
     path, fence, pipe:       pts [[x, y], ...]  + path: width; fence: height
     plant:                   x, y, crop, shape, spread, height, sow, harvest (dates), link (app record id, optional),
                              after (id of the planting it follows in the same spot), remind (days before each event), save (saving seed from it)
     task:                    x, y, text, date, every ('', 'week', 'month', 'year'), remind   a job on the calendar (prune, feed, clean the tank)
     note:                    x, y, text
     block:                   def (block id), x, y, rot   one placed copy of a block
   Beds, benches, areas, tanks and block copies can carry place: the id of a Place in the app.  Linked items take the
   app's name for that place, so both use the same names.
   hidden = out of view while you work;  locked = cannot be moved;  off = kept in the plan but left out (also of the app hand-over). */

import { GUIDES, PACKS, ISOLATION } from './guides.js';
export const FORMAT = 'lt-planner-plan', VERSION = 1, EXT = '.ltplan';
export const FOLDERS = [
  ['ground', 'Ground'], ['models', 'Buildings and models'], ['structures', 'Structures'], ['beds', 'Beds and areas'],
  ['planting', 'Planting'], ['water', 'Water'], ['animals', 'Animals'],
];
const FOLDER_KEYS = FOLDERS.map(f => f[0]);
export const SHAPES = ['upright', 'bush', 'vine', 'tree', 'root', 'grass'];
export const KINDS = {
  bed: { name: 'Bed', folder: 'beds', box: true }, area: { name: 'Area', folder: 'beds', box: true },
  bench: { name: 'Seed bench', folder: 'structures', box: true }, tank: { name: 'Water tank', folder: 'water', box: true },
  path: { name: 'Path', folder: 'structures', line: true }, fence: { name: 'Fence', folder: 'structures', line: true },
  pipe: { name: 'Drip line', folder: 'water', line: true },
  plant: { name: 'Plant', folder: 'planting', point: true }, note: { name: 'Note', folder: 'ground', point: true },
  task: { name: 'Job', folder: 'ground', point: true },
  block: { name: 'Block', folder: 'beds', point: true },
};
/* Crops come from the planting guides (guides.js): [name, shape, spread (m, full size), height (m), days to harvest]. */
export const CROPS = Object.fromEntries(Object.entries(GUIDES).map(([k, g]) => [k, [g[0], g[2], g[2] === 'vine' ? g[4] : g[3], g[5], g[6]]]));

/* ---------- helpers ---------- */
const num = (v, d, lo = -1e6, hi = 1e6) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const str = (v, max = 80, d = '') => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, max) : d);
const day = v => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) ? v : '');
const r3 = n => Math.round(n * 1000) / 1000;
export const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* ---------- cleaning: every plan that is opened goes through this, because plans get shared ---------- */
function cleanItem(it, ids, defs) {
  if (!it || typeof it !== 'object' || !KINDS[it.kind]) return null;
  const k = KINDS[it.kind];
  let id = str(it.id, 24).replace(/[^A-Za-z0-9_-]/g, '');
  if (!id || ids.has(id)) id = newId();
  ids.add(id);
  const o = { id, kind: it.kind, folder: FOLDER_KEYS.includes(it.folder) ? it.folder : k.folder, name: str(it.name, 60) || k.name, hidden: !!it.hidden, locked: !!it.locked, off: !!it.off };
  if (k.box) {
    Object.assign(o, { x: r3(num(it.x, 0)), y: r3(num(it.y, 0)), w: r3(num(it.w, 1, 0.05, 2000)), h: r3(num(it.h, 1, 0.05, 2000)), rot: r3(num(it.rot, 0, -360, 360)) });
    if (it.kind === 'bed') o.raised = r3(num(it.raised, 0.3, 0, 3));
    if (it.kind === 'area') o.fill = /^#[0-9a-fA-F]{6}$/.test(it.fill) ? it.fill : '#C9DDB8';
    const place = str(it.place, 40).replace(/[^A-Za-z0-9_-]/g, ''); if (place) o.place = place;
  } else if (k.line) {
    const pts = (Array.isArray(it.pts) ? it.pts : []).slice(0, 500).filter(p => Array.isArray(p)).map(p => [r3(num(p[0], 0)), r3(num(p[1], 0))]);
    if (pts.length < 2) return null;
    o.pts = pts;
    if (it.kind === 'path') o.width = r3(num(it.width, 0.9, 0.1, 20));
    if (it.kind === 'fence') o.height = r3(num(it.height, 1.2, 0.1, 6));
  } else {
    Object.assign(o, { x: r3(num(it.x, 0)), y: r3(num(it.y, 0)) });
    if (it.kind === 'plant') {
      const crop = CROPS[it.crop] ? it.crop : 'other', c = CROPS[crop];
      Object.assign(o, { crop, shape: SHAPES.includes(it.shape) ? it.shape : c[1], spread: r3(num(it.spread, c[2], 0.02, 40)), height: r3(num(it.height, c[3], 0.02, 40)), sow: day(it.sow), harvest: day(it.harvest), variety: str(it.variety, 60) });
      const link = str(it.link, 40).replace(/[^A-Za-z0-9_-]/g, ''); if (link) o.link = link;
      const after = str(it.after, 24).replace(/[^A-Za-z0-9_-]/g, ''); if (after) o.after = after;   // follows this planting in the same spot
      o.remind = Number.isInteger(+it.remind) ? Math.min(60, Math.max(0, +it.remind)) : 3;       // remind this many days before each event
      if (it.save) o.save = true;                                                                 // saving seed from this planting
    }
    if (it.kind === 'note') o.text = str(it.text, 300);
    if (it.kind === 'task') { o.text = str(it.text, 200); o.date = day(it.date); o.every = ['week', 'month', 'year'].includes(it.every) ? it.every : ''; o.remind = Number.isInteger(+it.remind) ? Math.min(60, Math.max(0, +it.remind)) : 1; }
    if (it.kind === 'block') { if (!defs || !defs.has(it.def)) return null; o.def = it.def; o.rot = r3(num(it.rot, 0, -360, 360)); const place = str(it.place, 40).replace(/[^A-Za-z0-9_-]/g, ''); if (place) o.place = place; }
  }
  return o;
}
export function cleanPlan(p) {
  if (!p || typeof p !== 'object' || p.format !== FORMAT) throw new Error('This is not an LT-Planner plan.');
  if (+p.version > VERSION) throw new Error('This plan was made by a newer LT-Planner. Reload the page to update, then open it again.');
  const s = p.site || {};
  const out = {
    format: FORMAT, version: VERSION, name: str(p.name, 80) || 'My plan',
    site: { w: r3(num(s.w, 20, 1, 5000)), h: r3(num(s.h, 15, 1, 5000)), north: r3(num(s.north, 0, -360, 360)), lat: num(s.lat, -33.9, -90, 90), lon: num(s.lon, 151.2, -180, 180), grid: [0.1, 0.25, 0.5, 1].includes(+s.grid) ? +s.grid : 0.5, country: /^[A-Z]{2}$/.test(s.country) ? s.country : '', zone: '' },
    date: day(p.date) || todayISO(), items: [], blocks: {},
  };
  // the zone only counts inside a country that has a guide; no location = no guide (there is no default)
  if (out.site.country && PACKS[out.site.country] && PACKS[out.site.country].zones.some(z => z[0] === s.zone)) out.site.zone = s.zone;
  else if (out.site.country && !PACKS[out.site.country] && typeof s.zone === 'string') out.site.zone = s.zone.replace(/[^a-z0-9-]/g, '').slice(0, 24);
  const rawDefs = p.blocks && typeof p.blocks === 'object' ? p.blocks : {};
  const defIds = new Set(Object.keys(rawDefs).filter(k => /^[A-Za-z0-9_-]{1,24}$/.test(k)).slice(0, 300));
  const ids = new Set();
  for (const k of defIds) {
    const d = rawDefs[k] || {};
    out.blocks[k] = { name: str(d.name, 60) || 'Block', items: (Array.isArray(d.items) ? d.items : []).slice(0, 2000).map(it => cleanItem(it, ids, defIds)).filter(Boolean) };
  }
  // a block that (through other blocks) contains itself would never finish drawing: cut such links
  for (const k of Object.keys(out.blocks)) out.blocks[k].items = out.blocks[k].items.filter(it => it.kind !== 'block' || !reaches(out.blocks, it.def, k));
  out.items = (Array.isArray(p.items) ? p.items : []).slice(0, 5000).map(it => cleanItem(it, ids, defIds)).filter(Boolean);
  return out;
}
/* does block `from` contain block `target`, directly or deeper? */
function reaches(blocks, from, target, seen = new Set()) {
  if (from === target) return true;
  if (seen.has(from) || !blocks[from]) return false;
  seen.add(from);
  return blocks[from].items.some(it => it.kind === 'block' && reaches(blocks, it.def, target, seen));
}
export function blankPlan(name = 'My plan', w = 20, h = 15) {
  return cleanPlan({ format: FORMAT, version: VERSION, name, site: { w, h }, items: [] });
}

/* ---------- geometry ---------- */
const rad = d => (d * Math.PI) / 180;
export function rotPt([x, y], deg, cx = 0, cy = 0) {
  const a = rad(deg), c = Math.cos(a), s = Math.sin(a), dx = x - cx, dy = y - cy;
  return [r3(cx + dx * c - dy * s), r3(cy + dx * s + dy * c)];
}
/* move an item by dx, dy */
export function moveItem(it, dx, dy) {
  if (it.pts) it.pts = it.pts.map(([x, y]) => [r3(x + dx), r3(y + dy)]);
  else { it.x = r3(it.x + dx); it.y = r3(it.y + dy); }
  return it;
}
/* rotate an item about (cx, cy) by deg, then move it by (dx, dy): how a block's items are placed */
export function placeItem(it, deg, cx, cy, dx, dy) {
  const o = JSON.parse(JSON.stringify(it));
  if (o.pts) o.pts = o.pts.map(p => rotPt(p, deg, cx, cy));
  else { [o.x, o.y] = rotPt([o.x, o.y], deg, cx, cy); if ('rot' in o) o.rot = r3(((o.rot + deg + 540) % 360) - 180); }
  return moveItem(o, dx, dy);
}
/* the outline of an item in plan coordinates, for drawing selection and hit tests: [minX, minY, maxX, maxY] */
export function bounds(it, plan) {
  if (it.pts) { const xs = it.pts.map(p => p[0]), ys = it.pts.map(p => p[1]), pad = (it.width || 0.2) / 2; return [Math.min(...xs) - pad, Math.min(...ys) - pad, Math.max(...xs) + pad, Math.max(...ys) + pad]; }
  if (KINDS[it.kind].box) {
    const c = [[-it.w / 2, -it.h / 2], [it.w / 2, -it.h / 2], [it.w / 2, it.h / 2], [-it.w / 2, it.h / 2]].map(p => rotPt(p, it.rot)).map(([x, y]) => [x + it.x, y + it.y]);
    return [Math.min(...c.map(p => p[0])), Math.min(...c.map(p => p[1])), Math.max(...c.map(p => p[0])), Math.max(...c.map(p => p[1]))];
  }
  if (it.kind === 'plant') { const r = it.spread / 2; return [it.x - r, it.y - r, it.x + r, it.y + r]; }
  if (it.kind === 'block') {
    const parts = blockItems(plan, it);
    if (!parts.length) return [it.x - 0.5, it.y - 0.5, it.x + 0.5, it.y + 0.5];
    const bs = parts.map(p => bounds(p, plan));
    return [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))];
  }
  return [it.x - 0.4, it.y - 0.4, it.x + 0.4, it.y + 0.4];
}
const union = bs => [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))];

/* ---------- blocks ---------- */
/* the items of one placed copy, in plan coordinates (blocks inside blocks are left as copies, drawn the same way) */
export function blockItems(plan, ins) {
  const d = plan.blocks[ins.def]; if (!d) return [];
  return d.items.filter(it => !it.off).map(it => placeItem(it, ins.rot || 0, 0, 0, ins.x, ins.y));
}
/* Merge the chosen items into a new block, placed where they were.  Returns the new copy (or null). */
export function makeBlock(plan, ids, name) {
  const pick = plan.items.filter(it => ids.includes(it.id));
  if (!pick.length) return null;
  const b = union(pick.map(it => bounds(it, plan))), ox = r3(b[0]), oy = r3(b[1]);
  const defId = newId();
  plan.blocks[defId] = { name: (name || 'Block').slice(0, 60), items: pick.map(it => moveItem(JSON.parse(JSON.stringify(it)), -ox, -oy)) };
  const at = plan.items.indexOf(pick[pick.length - 1]);
  const ins = { id: newId(), kind: 'block', folder: pick[0].folder, name: plan.blocks[defId].name, hidden: false, locked: false, off: false, def: defId, x: ox, y: oy, rot: 0 };
  plan.items.splice(at + 1, 0, ins);
  plan.items = plan.items.filter(it => !ids.includes(it.id));
  return ins;
}
/* Turn one copy back into loose items (with new ids). Returns the new items. */
export function explodeBlock(plan, insId) {
  const i = plan.items.findIndex(it => it.id === insId && it.kind === 'block');
  if (i < 0) return [];
  const loose = blockItemsAll(plan, plan.items[i]).map(it => Object.assign(it, { id: newId() }));
  plan.items.splice(i, 1, ...loose);
  return loose;
}
function blockItemsAll(plan, ins) { const d = plan.blocks[ins.def]; return d ? d.items.map(it => placeItem(it, ins.rot || 0, 0, 0, ins.x, ins.y)) : []; }
/* Give one copy its own definition, so editing it no longer changes the others. */
export function makeUnique(plan, insId) {
  const ins = plan.items.find(it => it.id === insId && it.kind === 'block'); if (!ins || !plan.blocks[ins.def]) return null;
  const old = plan.blocks[ins.def], defId = newId();
  plan.blocks[defId] = { name: old.name + ' (own copy)', items: old.items.map(it => Object.assign(JSON.parse(JSON.stringify(it)), { id: newId() })) };
  ins.def = defId; ins.name = plan.blocks[defId].name;
  return defId;
}
export const copiesOf = (plan, defId) => plan.items.filter(it => it.kind === 'block' && it.def === defId).length + Object.values(plan.blocks).reduce((n, d) => n + d.items.filter(it => it.kind === 'block' && it.def === defId).length, 0);
/* Remove definitions that nothing uses any more (on save). */
export function pruneBlocks(plan) {
  const used = new Set(), walk = items => items.forEach(it => { if (it.kind === 'block' && !used.has(it.def)) { used.add(it.def); if (plan.blocks[it.def]) walk(plan.blocks[it.def].items); } });
  walk(plan.items);
  for (const k of Object.keys(plan.blocks)) if (!used.has(k)) delete plan.blocks[k];
  return plan;
}
/* Can block `defId` be placed inside the items of block `into` (null = the plan)? */
export const canPlace = (plan, defId, into) => !into || !reaches(plan.blocks, defId, into);

/* ---------- planting through the season ---------- */
const dnum = s => Date.parse(s + 'T00:00:00Z') / 86400000;
/* how far a plant is on `date`: null = not sown yet or already harvested; otherwise 0.15 (seedling) .. 1 (full size) */
export function growth(it, date) {
  if (!it.sow) return 1;
  const t = dnum(date), s = dnum(it.sow);
  if (t < s) return null;
  if (it.harvest && t > dnum(it.harvest)) return null;
  const days = CROPS[it.crop] && CROPS[it.crop][4] ? CROPS[it.crop][4] : 90, end = it.harvest ? dnum(it.harvest) : s + days;
  // an S-shaped curve: slow as a seedling, fast in the middle, levelling off at full size about 80% of the way to harvest
  const f = Math.max(0, Math.min(1, (t - s) / Math.max(1, (end - s) * 0.8)));
  return 0.15 + 0.85 * f * f * (3 - 2 * f);
}

/* ---------- the sun (worked out on the device, NOAA's simple formulas) ---------- */
/* Returns azimuth (degrees clockwise from true north) and elevation (degrees) for a date, local solar hour and place. */
export function sunAt(dateISO, hour, lat) {
  const n = Math.round(dnum(dateISO) - dnum(dateISO.slice(0, 4) + '-01-01')) + 1;
  const g = (2 * Math.PI / 365) * (n - 1 + (hour - 12) / 24);
  const decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
  const ha = rad((hour - 12) * 15), la = rad(lat);
  const cosZen = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(ha);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  let az = Math.atan2(Math.sin(ha), Math.cos(ha) * Math.sin(la) - Math.tan(decl) * Math.cos(la));
  az = ((az * 180) / Math.PI + 180 + 360) % 360;
  return { az: Math.round(az * 10) / 10, el: Math.round((90 - (zen * 180) / Math.PI) * 10) / 10 };
}
/* The sun's path for the day: points every half hour while it is up. */
export const sunPath = (dateISO, lat) => { const out = []; for (let h = 4; h <= 20; h += 0.5) { const s = sunAt(dateISO, h, lat); if (s.el > 0) out.push(Object.assign(s, { h })); } return out; };

/* ---------- what goes to the app (a plan-for-the-app file; the app imports it with a review list) ---------- */
export function forApp(plan) {
  const all = [];
  const linkedBlocks = [];
  const walk = items => items.forEach(it => { if (it.off) return; if (it.kind === 'block') { if (it.place) linkedBlocks.push(it); walk(blockItemsAll(plan, it).filter(x => !x.off)); } else all.push(it); });
  walk(plan.items);
  return {
    format: 'lt-planner-for-app', version: 1, plan: plan.name, made: new Date().toISOString(),
    location: { country: plan.site.country, zone: plan.site.zone },   // the app uses the guide for this same location
    // place: the app Place this bed is (the app updates it); no place = a new Place with this name.  A linked block copy
    // counts as one Place (e.g. "Tomato bed 2") holding everything inside it.
    beds: all.filter(it => it.kind === 'bed' || it.kind === 'bench').map(it => ({ planId: it.id, name: it.name, kind: it.kind, w: it.w, h: it.h, x: it.x, y: it.y, place: it.place || '' }))
      .concat(linkedBlocks.map(b => { const bb = bounds(b, plan); return { planId: b.id, name: b.name, kind: 'block', w: r3(bb[2] - bb[0]), h: r3(bb[3] - bb[1]), x: r3((bb[0] + bb[2]) / 2), y: r3((bb[1] + bb[3]) / 2), place: b.place }; })),
    sowings: all.filter(it => it.kind === 'plant' && it.sow).map(it => ({ planId: it.id, crop: CROPS[it.crop][0], variety: it.variety || '', sow: it.sow, harvest: it.harvest || '', link: it.link || '', bed: bedUnder(all, it), after: it.after || '', saveSeed: !!it.save })),
    // dated events for the app's calendar and reminders (the app asks before adding them)
    reminders: events(plan).map(e => ({ planId: e.id, date: e.date, kind: e.kind, title: e.title, remindDaysBefore: e.remind || 0, every: e.every || '' })),
  };
}
function bedUnder(all, p) {
  const b = all.find(it => (it.kind === 'bed' || it.kind === 'bench') && (() => { const [x, y] = rotPt([p.x - it.x, p.y - it.y], -it.rot); return Math.abs(x) <= it.w / 2 && Math.abs(y) <= it.h / 2; })());
  return b ? b.id : '';
}

/* ---------- follow-on plantings, the calendar and reminders ---------- */
const addDays = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
/* Plant something next in the same spot when this one comes out (e.g. summer tomatoes, then winter garlic).
   The new planting starts the day after this one's harvest and remembers what it follows. */
export function followOn(plan, items, prevId, crop) {
  const prev = items.find(it => it.id === prevId && it.kind === 'plant'); if (!prev) return null;
  const c = CROPS[CROPS[crop] ? crop : 'other'];
  const start = prev.harvest ? addDays(prev.harvest, 1) : addDays(prev.sow || plan.date, (CROPS[prev.crop] && CROPS[prev.crop][4]) || 90);
  const it = { id: newId(), kind: 'plant', folder: prev.folder, name: c[0], hidden: false, locked: false, off: false, x: prev.x, y: prev.y, crop: CROPS[crop] ? crop : 'other', shape: c[1], spread: c[2], height: c[3], sow: start, harvest: c[4] ? addDays(start, c[4]) : '', variety: '', after: prev.id, remind: prev.remind ?? 3 };
  if (!prev.harvest) prev.harvest = addDays(start, -1);
  items.splice(items.indexOf(prev) + 1, 0, it);
  return it;
}
/* Every dated event in the plan, oldest first: sowings, harvests, swaps (a harvest followed by the next planting) and jobs.
   Jobs that repeat are listed for the next 12 months from `from`. */
export function events(plan, from) {
  const out = [], all = [];
  const walk = items => items.forEach(it => { if (it.off) return; if (it.kind === 'block') walk(blockItemsAll(plan, it)); else all.push(it); });
  walk(plan.items);
  const plants = all.filter(it => it.kind === 'plant'), nextOf = id => plants.find(p => p.after === id);
  for (const p of plants) {
    const label = CROPS[p.crop][0] + (p.variety ? ' (' + p.variety + ')' : '');
    const prev = p.after && plants.find(q => q.id === p.after);
    if (p.sow && !prev) out.push({ date: p.sow, kind: 'sow', title: 'Sow or plant ' + label, id: p.id, remind: p.remind ?? 3 });
    if (p.harvest) {
      const nx = nextOf(p.id);
      if (nx) out.push({ date: p.harvest, kind: 'swap', title: 'Swap: ' + label + ' out, ' + CROPS[nx.crop][0] + (nx.variety ? ' (' + nx.variety + ')' : '') + ' in', id: p.id, next: nx.id, remind: p.remind ?? 3 });
      else out.push({ date: p.harvest, kind: 'harvest', title: 'Harvest ' + label, id: p.id, remind: p.remind ?? 3 });
    }
  }
  const start = from || plan.date, stop = addDays(start, 366);
  for (const t of all.filter(it => it.kind === 'task' && it.date)) {
    let d = t.date, n = 0;
    while (d <= stop && n++ < 60) {
      if (!t.every || d >= start) out.push({ date: d, kind: 'job', title: t.text || t.name, id: t.id, remind: t.remind ?? 1, every: t.every });
      if (!t.every) break;
      const dt = new Date(d + 'T00:00:00Z');
      if (t.every === 'week') dt.setUTCDate(dt.getUTCDate() + 7); else if (t.every === 'month') dt.setUTCMonth(dt.getUTCMonth() + 1); else dt.setUTCFullYear(dt.getUTCFullYear() + 1);
      d = dt.toISOString().slice(0, 10);
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title < b.title ? -1 : 1));
}
/* Events that are due now or whose reminder has started, as of `today`. */
export const dueSoon = (plan, today) => events(plan, addDays(today, -7)).filter(e => e.date >= addDays(today, -7) && addDays(e.date, -(e.remind || 0)) <= today);
/* A calendar file (.ics) any phone or computer calendar can import, with an alarm before each event. */
export function toICS(plan, from) {
  const esc = t => String(t).replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, ' ');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lineage Tracker//LT-Planner//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc(plan.name), 'X-WR-CALDESC:Powered by Lineage Tracker\\, free at lineagetracker.org'];
  for (const e of events(plan, from)) {
    const d = e.date.replace(/-/g, ''), d2 = addDays(e.date, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', 'UID:' + e.id + '-' + e.kind + '-' + d + '@planner.lineagetracker.org', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + d2, 'SUMMARY:' + esc(e.title), 'DESCRIPTION:' + esc('From the plan "' + plan.name + '" (LT-Planner)'));
    if (e.remind > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), 'TRIGGER:-P' + e.remind + 'D', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

/* ---------- the app's Places ---------- */
export const PLACE_KINDS = new Set(['bed', 'bench', 'area', 'tank', 'block']);
/* places: [{ id, name }] from the app.  Linked items take the app's current name; unlinked items whose name matches a
   place exactly (ignoring case and spaces) are linked.  A place is only linked to one item.  Returns how many changed. */
export function linkPlaces(plan, places) {
  const byId = new Map(places.map(p => [p.id, p])), key = s => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const byName = new Map(places.map(p => [key(p.name), p]));
  // only the plan's own items and block copies: a bed inside a block definition is shared by every copy, so the copy is what links
  const all = plan.items;
  const used = new Set(all.filter(it => it.place && byId.has(it.place)).map(it => it.place));
  let n = 0;
  for (const it of all) {
    if (!PLACE_KINDS.has(it.kind)) continue;
    if (it.place && byId.has(it.place)) { const nm = byId.get(it.place).name.slice(0, 60); if (nm && it.name !== nm) { it.name = nm; n++; } continue; }
    const hit = byName.get(key(it.name));
    if (hit && !used.has(hit.id)) { it.place = hit.id; used.add(hit.id); n++; }
  }
  return n;
}

/* ---------- planting guides in the plan ---------- */
/* Fill a bed (or bench) with one crop at the guide's spacing: rows along the longer side, half a spacing in from each edge.
   Plants already in the bed stay.  Returns the new plants (at most 400). */
export function fillBed(plan, items, bedId, crop, date) {
  const bed = items.find(it => it.id === bedId && (it.kind === 'bed' || it.kind === 'bench')); if (!bed) return [];
  const g = GUIDES[crop] || GUIDES.other, c = CROPS[GUIDES[crop] ? crop : 'other'];
  const long = bed.w >= bed.h, L = long ? bed.w : bed.h, Wd = long ? bed.h : bed.w;
  const along = Math.max(0.03, g[3]), across = Math.max(0.05, Math.min(g[4], Wd));
  const nA = Math.max(1, Math.floor((L - along) / along + 1e-9) + 1), nX = Math.max(1, Math.floor((Wd - across) / across + 1e-9) + 1);
  const offA = (L - (nA - 1) * along) / 2, offX = (Wd - (nX - 1) * across) / 2, out = [];
  for (let i = 0; i < nX && out.length < 400; i++) for (let j = 0; j < nA && out.length < 400; j++) {
    const la = -L / 2 + offA + j * along, lx = -Wd / 2 + offX + i * across;
    const [x, y] = rotPt(long ? [la, lx] : [lx, la], bed.rot);
    out.push({ id: newId(), kind: 'plant', folder: 'planting', name: c[0], hidden: false, locked: false, off: false, x: r3(bed.x + x), y: r3(bed.y + y), crop: GUIDES[crop] ? crop : 'other', shape: c[1], spread: c[2], height: c[3], sow: date, harvest: c[4] ? new Date(Date.parse(date + 'T00:00:00Z') + c[4] * 86400000).toISOString().slice(0, 10) : '', variety: '', remind: 3 });
  }
  items.splice(items.indexOf(bed) + 1, 0, ...out);
  return out;
}
/* Neighbours of a plant that the guides say to keep apart from it (or that grow well with it), within reach of its roots
   and leaves (the larger of 1 m and its spread), counting only plants in the ground at the same time. */
export function neighbours(items, plant, date) {
  const g = GUIDES[plant.crop] || GUIDES.other, reach = Math.max(1, plant.spread);
  const near = items.filter(it => it !== plant && it.kind === 'plant' && !it.off && it.crop !== plant.crop && Math.hypot(it.x - plant.x, it.y - plant.y) <= reach + it.spread / 2 && growth(it, date) !== null);
  const avoid = [...new Set(near.filter(it => g[11].includes(it.crop) || (GUIDES[it.crop] || GUIDES.other)[11].includes(plant.crop)).map(it => it.crop))];
  const friends = [...new Set(near.filter(it => g[10].includes(it.crop)).map(it => it.crop))];
  return { avoid, friends };
}

/* ---------- seed saving: crossing risk ---------- */
const span = it => [it.sow ? dnum(it.sow) : -1e9, it.harvest ? dnum(it.harvest) : (it.sow ? dnum(it.sow) + ((CROPS[it.crop] && CROPS[it.crop][4]) || 90) : 1e9)];
/* Plants that could cross with this one if you save its seed (or theirs): same cross group, a different variety (or a
   different crop in the group, e.g. broccoli and kale), in the ground at the same time, and closer than the isolation
   distance.  Only checked when this plant or the other is marked for seed saving.  Returns [{ id, crop, variety, m, need, may }]. */
export function crossRisks(items, plant) {
  const me = ISOLATION[plant.crop]; if (!me || me[1] <= 0) return [];
  const [a0, a1] = span(plant), out = [];
  for (const it of items) {
    if (it === plant || it.kind !== 'plant' || it.off) continue;
    const other = ISOLATION[it.crop]; if (!other || other[0] !== me[0]) continue;
    if (!plant.save && !it.save) continue;
    if (it.crop === plant.crop && (it.variety || '').trim().toLowerCase() === (plant.variety || '').trim().toLowerCase()) continue;
    const [b0, b1] = span(it); if (b1 < a0 || b0 > a1) continue;
    const m = Math.hypot(it.x - plant.x, it.y - plant.y), need = Math.max(me[1], other[1]);
    if (m < need) out.push({ id: it.id, crop: it.crop, variety: it.variety || '', m: Math.round(m * 10) / 10, need, may: me[0] === 'cucurbita' && it.crop !== plant.crop });
  }
  return out.sort((x, y) => x.m - y.m);
}

/* ---------- crop rotation ---------- */
export const ROTATION_YEARS = 3;   // a common home-garden rule: the same family back in a bed only every third year or later
const FAMILY_NAMES = { Solanaceae: 'tomato family', Cucurbitaceae: 'pumpkin family', Fabaceae: 'bean and pea family', Brassicaceae: 'cabbage family', Amaryllidaceae: 'onion family', Apiaceae: 'carrot family', Amaranthaceae: 'beet and spinach family', Asteraceae: 'lettuce family', Poaceae: 'grass family (corn)', Lamiaceae: 'mint family (basil)', Rosaceae: 'rose family', Convolvulaceae: 'sweet potato family' };
export const familyOf = crop => (GUIDES[crop] || GUIDES.other)[1];
export const familyName = f => FAMILY_NAMES[f] || f;
const inBed = (bed, p) => { const [x, y] = rotPt([p.x - bed.x, p.y - bed.y], -bed.rot); return Math.abs(x) <= bed.w / 2 && Math.abs(y) <= bed.h / 2; };
/* Everything planted in a bed, oldest first: [{ id, crop, family, variety, sow, harvest }]. */
export function bedHistory(items, bed) {
  return items.filter(it => it.kind === 'plant' && !it.off && it.sow && inBed(bed, it))
    .map(it => ({ id: it.id, crop: it.crop, family: familyOf(it.crop), variety: it.variety || '', sow: it.sow, harvest: it.harvest || '' }))
    .sort((a, b) => (a.sow < b.sow ? -1 : 1));
}
/* Earlier plantings of the same family in the same bed, within ROTATION_YEARS before this one was sown (perennials and
   'mixed' groups are left out).  Returns [{ id, crop, sow, harvest, until }] where until is the first date the family may come back. */
export function rotationIssues(items, plant) {
  const fam = familyOf(plant.crop); if (!plant.sow || fam === 'mixed' || !(GUIDES[plant.crop] || [])[6]) return [];
  const bed = items.find(it => (it.kind === 'bed' || it.kind === 'bench') && !it.off && inBed(it, plant)); if (!bed) return [];
  const t = dnum(plant.sow), seen = new Set(), out = [];
  for (const h of bedHistory(items, bed)) {
    if (h.id === plant.id || h.family !== fam || !(GUIDES[h.crop] || [])[6]) continue;
    const end = h.harvest ? dnum(h.harvest) : dnum(h.sow) + 120;
    if (end >= t || dnum(h.sow) >= t) continue;                 // same season or later: that is spacing, not rotation
    const back = dnum(h.sow) + 365 * ROTATION_YEARS;
    if (t < back && !seen.has(h.crop + h.sow)) { seen.add(h.crop + h.sow); out.push({ id: h.id, crop: h.crop, sow: h.sow, harvest: h.harvest, until: new Date(back * 86400000).toISOString().slice(0, 10), bed: bed.id }); }
  }
  return out;
}

/* ---------- plants from the app ---------- */
const CROP_WORDS = [
  ['pumpkin', /pumpkin|cucurbita maxima|winter squash|butternut|cucurbita moschata/], ['squash', /zucchini|courgette|cucurbita pepo|summer squash|squash/],
  ['tomato', /tomato|lycopersicum/], ['capsicum', /capsicum|bell pepper|sweet pepper/], ['chilli', /chil+i|hot pepper|capsicum (frutescens|chinense|baccatum)/],
  ['eggplant', /eggplant|aubergine|melongena/], ['potato', /potato|tuberosum/], ['sweetpotato', /sweet ?potato|kumara|ipomoea batatas/],
  ['cucumber', /cucumber|cucumis sativus/], ['melon', /melon|citrullus|cucumis melo/], ['broadbean', /broad ?bean|fava|vicia faba/],
  ['bean', /bean|phaseolus/], ['pea', /\bpeas?\b|pisum/], ['corn', /corn|maize|zea mays/], ['lettuce', /lettuce|lactuca/],
  ['spinach', /spinach|spinacia/], ['silverbeet', /silverbeet|chard/], ['beetroot', /beet/], ['carrot', /carrot|daucus/], ['radish', /radish|raphanus/],
  ['onion', /onion|allium cepa|shallot/], ['leek', /leek/], ['garlic', /garlic|allium sativum/], ['cauliflower', /cauliflower/], ['broccoli', /broccoli/],
  ['kale', /kale|cavolo/], ['cabbage', /cabbage|brassica oleracea/], ['basil', /basil|ocimum/], ['parsley', /parsley|petroselinum/],
  ['strawberry', /strawberr|fragaria/], ['fruittree', /apple|pear|citrus|lemon|orange|plum|peach|apricot|fig|mango|avocado|olive/], ['berry', /berry|rubus|vaccinium/],
];
/* the planner crop that best matches an app variety (name, group and species), or 'other' */
export function guessCrop(...texts) {
  const t = texts.filter(Boolean).join(' ').toLowerCase();
  for (const [k, re] of CROP_WORDS) if (re.test(t)) return k;
  return 'other';
}
/* The app's plants (not animals) from a backup or synced copy: [{ id, title, variety, crop, sow, placeId, status }]. */
export function appPlants(data) {
  const recs = (data && Array.isArray(data.records) ? data.records : []).filter(r => r && typeof r === 'object' && !r.deletedAt && !r.purged);
  const by = new Map(recs.map(r => [r.id, r]));
  const out = [];
  for (const r of recs) {
    if (r.type !== 'individual') continue;
    // seedlings from a cross often have no variety of their own: take it from a parent (or the cross's parents), then the project
    const parentStrain = (x, d = 0) => { if (!x || d > 3) return null; if (x.strainId && by.get(x.strainId)) return by.get(x.strainId); const c = by.get(x.crossId); return parentStrain(by.get(x.motherId) || (c && by.get(c.motherId)), d + 1) || parentStrain(by.get(x.fatherId) || (c && by.get(c.fatherId)), d + 1); };
    const st = by.get(r.strainId), pr = by.get(r.projectId), ps = st ? null : parentStrain(r);
    if ((st && st.kind === 'animal') || (!st && pr && pr.kind === 'animal')) continue;
    if (st && st.kind && st.kind !== 'plant' && st.kind !== 'animal') continue;
    const id = String(r.id || '').slice(0, 40).replace(/[^A-Za-z0-9_-]/g, ''); if (!id) continue;
    out.push({ id, title: String(r.code || r.name || (st && st.name) || 'Plant').slice(0, 60), variety: String((st && st.name) || '').slice(0, 60),
      crop: guessCrop(st && st.name, st && st.group, st && st.species, ps && ps.name, ps && ps.group, ps && ps.species, pr && pr.name, r.name), sow: day(String(r.startDate || '').slice(0, 10)),
      placeId: String(r.placeId || '').slice(0, 40).replace(/[^A-Za-z0-9_-]/g, ''), status: String(r.status || '').slice(0, 30) });
  }
  return out.slice(0, 5000);
}
/* A free spot in a bed for a plant of this spread: the guide grid, skipping spots already taken.  null when full. */
export function freeSpot(items, bed, spread) {
  const sp = Math.max(0.15, spread), long = bed.w >= bed.h, L = long ? bed.w : bed.h, Wd = long ? bed.h : bed.w;
  const nA = Math.max(1, Math.floor(L / sp)), nX = Math.max(1, Math.floor(Wd / sp));
  const taken = items.filter(it => it.kind === 'plant' && !it.off && inBed(bed, it));
  for (let i = 0; i < nX; i++) for (let j = 0; j < nA; j++) {
    const la = -L / 2 + sp / 2 + j * sp + (L - nA * sp) / 2, lx = -Wd / 2 + sp / 2 + i * sp + (Wd - nX * sp) / 2;
    const [x, y] = rotPt(long ? [la, lx] : [lx, la], bed.rot), px = r3(bed.x + x), py = r3(bed.y + y);
    if (!taken.some(t => Math.hypot(t.x - px, t.y - py) < sp * 0.5)) return [px, py];
  }
  return null;
}
