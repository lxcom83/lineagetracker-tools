/* LT-Planner plan model.  No DOM here, so it can be tested on its own (qa: planner_model_test.mjs).

   A plan file is JSON, extension .ltplan.  Units are metres; x grows to the right (east when north is up), y grows down.
   {
     format: 'lt-planner-plan', version: 1, name,
     site:  { w, h, north (degrees: where north points, 0 = up, 90 = right), lat, lon, grid (snap step in m), country (ISO code, '' = not set), zone (climate zone in that country, '' = not set) }
            The planting guide is only used when both are set: there is no default location.
            ground (optional): { cell, nx, ny, base, data } ground heights (terrain.js packGrid); junk is dropped, the site is then flat.
     date:  'YYYY-MM-DD'   the day the timeline is showing
     items: [ item ]       the plan, front of the drawing last
     blocks: { id: { name, items: [ item ] } }   block definitions; their items use the block's own coordinates
   }
   Every item: { id, kind, folder, name, hidden, locked, off }, then by kind:
     bed, area, tank, bench:  x, y (centre), w, h, rot (degrees)  + bed: raised (m); area: fill, surface (optional: lawn, gravel, mulch, soil, pavers, decking)
     bed, area (optional):    shape: 'round' (an ellipse in the box; otherwise rectangle)
     building, greenhouse, pergola: x, y, w, h, rot  + building: wallH, roof ('gable', 'hip', 'flat', 'skillion'), pitch (degrees),
                              ridge ('auto', 'w', 'h'), wallColour, roofColour, windows (true/false); greenhouse: wallH, frame (colour);
                              pergola: height, cover ('open', 'shade', 'vine', 'roof'), colour
     path, fence, pipe, trellis, wall: pts [[x, y], ...]  + path: width; fence: height, style ('palings', 'pickets', 'slats', 'wire', 'panels'), colour;
                              trellis: height, style ('wire', 'lattice', 'mesh'); wall (retaining wall): height, material ('sleeper', 'stone', 'block', 'brick')
     plant:                   x, y, crop, shape, spread, height, sow, harvest (dates), link (app record id, optional),
                              after (id of the planting it follows in the same spot), remind (days before each event), save (saving seed from it)
     task:                    x, y, text, date, every ('', 'week', 'month', 'year'), remind   a job on the calendar (prune, feed, clean the tank)
     rows:                    x, y (centre), w, h, rot  + crop, variety, rowSpacing, plantSpacing (m), sow, harvest, remind
                              a whole block of crop rows kept as ONE item (a rule, not one object per plant): rows run along the width,
                              spaced across the depth. A 20 acre field of corn is still a few numbers.
     note:                    x, y, text
     block:                   def (block id), x, y, rot   one placed copy of a block
   Beds, benches, areas, tanks and block copies can carry place: the id of a Place in the app.  Linked items take the
   app's name for that place, so both use the same names.
   hidden = out of view while you work;  locked = cannot be moved;  off = kept in the plan but left out (also of the app hand-over). */

import { GUIDES, PACKS, ISOLATION } from './guides.js';
import { unpackGrid } from './terrain.js';
import { cleanPoly, selfIntersects, area as polyArea } from './outline.js';
import { crossesItself, MAX_RETAIN_WALLS, MAX_RETAIN_PTS, RETAIN_MIN_H, RETAIN_MAX_H } from './earthworks.js';
import { BY_ID as PLANT_DB } from '../kit/plantdb.js';
import { HYDRO_TYPES, HYDRO_KEYS, DRAINS, MEDIA, LIMITS_HYDRO, sites as hydroSites, linkProblem } from './hydro.js';
import { portsOf, pickPair, endPoints, portsValid, linkKey } from './hydro3d.js';
import { TRAY_PRESETS, TRAY_KINDS, CYCLES, EQUIP, LIMITS as INDOOR_LIMITS, LIMITS_GEAR, UNITS, timeline as cycleTimeline } from './indoor.js';
export const FORMAT = 'lt-planner-plan', VERSION = 4, EXT = '.ltplan';
/* How far a plan may expand once every block copy is written out in full.  A small file can ask for an enormous
   plan by nesting blocks inside blocks, so the drawing, the calendar and the 3D view all work from these two
   ceilings rather than from the size of the file. */
export const MAX_BLOCK_ITEMS = 20000, MAX_PLAN_ITEMS = 60000;
export const FOLDERS = [
  ['ground', 'Ground'], ['models', 'Buildings and models'], ['structures', 'Structures'], ['beds', 'Beds and areas'],
  ['planting', 'Planting'], ['water', 'Water'], ['indoor', 'Indoor growing'], ['animals', 'Animals'],
];
const FOLDER_KEYS = FOLDERS.map(f => f[0]);
export const SHAPES = ['upright', 'bush', 'vine', 'tree', 'root', 'grass'];
export const SURFACE_KEYS = ['lawn', 'gravel', 'mulch', 'soil', 'pavers', 'decking'];   // planner/surfaces.js draws them
export const KINDS = Object.assign(Object.create(null), {
  bed: { name: 'Bed', folder: 'beds', box: true }, area: { name: 'Area', folder: 'beds', box: true },
  bench: { name: 'Seed bench', folder: 'structures', box: true }, tank: { name: 'Water tank', folder: 'water', box: true },
  path: { name: 'Path', folder: 'structures', line: true }, fence: { name: 'Fence', folder: 'structures', line: true },
  pipe: { name: 'Drip line', folder: 'water', line: true },
  plant: { name: 'Plant', folder: 'planting', point: true }, note: { name: 'Note', folder: 'ground', point: true },
  task: { name: 'Job', folder: 'ground', point: true },
  block: { name: 'Block', folder: 'beds', point: true },
  rows: { name: 'Crop rows', folder: 'planting', box: true },
  building: { name: 'Building', folder: 'structures', box: true }, greenhouse: { name: 'Greenhouse', folder: 'structures', box: true },
  pergola: { name: 'Pergola', folder: 'structures', box: true },
  trellis: { name: 'Trellis', folder: 'structures', line: true }, wall: { name: 'Retaining wall', folder: 'structures', line: true },
  shape: { name: 'Free-form shape', folder: 'beds', line: true, poly: true },
  room: { name: 'Room', folder: 'indoor', box: true }, shelf: { name: 'Shelf', folder: 'indoor', box: true }, tray: { name: 'Tray', folder: 'indoor', box: true }, gear: { name: 'Equipment', folder: 'indoor', box: true },
  hydro: { name: 'Hydro system', folder: 'indoor', box: true }, conn: { name: 'Link', folder: 'indoor', line: true },
});
export const SHAPE_STYLES = ['bed', 'area', 'building', 'pond'];
export const ROOFS = ['gable', 'hip', 'flat', 'skillion'], COVERS = ['open', 'shade', 'vine', 'roof'], FENCE_STYLES = ['palings', 'pickets', 'slats', 'wire', 'panels'],
  TRELLIS_STYLES = ['wire', 'lattice', 'mesh'], WALL_MATERIALS = ['sleeper', 'stone', 'block', 'brick'];
const BAD_KEYS = ['__proto__', 'constructor', 'prototype'];   // never allowed as a block id: they would reach the object's own machinery
const hexOr = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d), pick = (v, list) => (list.includes(v) ? v : list[0]);
/* A key a lookup table or a regexp may be given.  ['bed'] turns into 'bed' in both, so without this a one-item
   array passed every check and was then stored as an array, skipping the checks meant for that kind. */
const key = v => (typeof v === 'string' ? v : '');
/* Crops come from the planting guides (guides.js): [name, shape, spread (m, full size), height (m), days to harvest]. */
export const CROPS = Object.assign(Object.create(null), Object.fromEntries(Object.entries(GUIDES).map(([k, g]) => [k, [g[0], g[2], g[2] === 'vine' ? g[4] : g[3], g[5], g[6]]])));

/* ---------- helpers ---------- */
const num = (v, d, lo = -1e6, hi = 1e6) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
const str = (v, max = 80, d = '') => (typeof v === 'string' ? v.slice(0, max).replace(/[\u0000-\u001f\u007f]/g, ' ') : d);   // cut first: cleaning 10 MB of control characters took a second
const day = v => { if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return ''; const d = new Date(v + 'T00:00:00Z'); return !isNaN(+d) && d.toISOString().slice(0, 10) === v && +v.slice(0, 4) >= 1900 && +v.slice(0, 4) <= 2200 ? v : ''; };   // a real calendar day (no 31 February)
const r3 = n => Math.round(n * 1000) / 1000;
export const newId = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
export const todayISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/* ---------- cleaning: every plan that is opened goes through this, because plans get shared ---------- */
function cleanItem(it, ids, defs) {
  if (!it || typeof it !== 'object' || Array.isArray(it) || !KINDS[key(it.kind)]) return null;
  const k = KINDS[it.kind];
  let id = str(it.id, 24).replace(/[^A-Za-z0-9_-]/g, '');
  if (!id || ids.has(id)) id = newId();
  ids.add(id);
  const o = { id, kind: it.kind, folder: FOLDER_KEYS.includes(it.folder) ? it.folder : k.folder, name: str(it.name, 60) || k.name, hidden: !!it.hidden, locked: !!it.locked, off: !!it.off };
  if (k.box) {
    Object.assign(o, { x: r3(num(it.x, 0)), y: r3(num(it.y, 0)), w: r3(num(it.w, 1, it.kind === 'tray' || it.kind === 'gear' ? 0.02 : 0.05, 2000)), h: r3(num(it.h, 1, it.kind === 'tray' || it.kind === 'gear' ? 0.02 : 0.05, 2000)), rot: r3(num(it.rot, 0, -360, 360)) });
    if (it.kind === 'bed') o.raised = r3(num(it.raised, 0.3, 0, 3));
    if (it.kind === 'area') o.fill = hexOr(it.fill, '#C9DDB8');
    if (it.kind === 'area' && SURFACE_KEYS.includes(it.surface)) o.surface = it.surface;   // optional: how it looks in 3D (lawn, gravel ...)
    if ((it.kind === 'area' || it.kind === 'bed') && it.shape === 'round') o.shape = 'round';
    if (it.kind === 'building') Object.assign(o, { wallH: r3(num(it.wallH, 2.4, 0.5, 30)), roof: pick(it.roof, ROOFS), pitch: r3(num(it.pitch, 22, 0, 60)), ridge: pick(it.ridge, ['auto', 'w', 'h']),
      wallColour: hexOr(it.wallColour, '#d9d2c3'), roofColour: hexOr(it.roofColour, '#6b6f75'), windows: it.windows !== false });
    if (it.kind === 'greenhouse') Object.assign(o, { wallH: r3(num(it.wallH, 2, 0.5, 8)), frame: hexOr(it.frame, '#3d4a40') });
    if (it.kind === 'pergola') Object.assign(o, { height: r3(num(it.height, 2.4, 1, 6)), cover: pick(it.cover, COVERS), colour: hexOr(it.colour, '#7a5a3a') });
    const place = str(it.place, 40).replace(/[^A-Za-z0-9_-]/g, ''); if (place) o.place = place;
    if (it.kind === 'room') {
      const dr = it.door && typeof it.door === 'object' ? it.door : {};
      Object.assign(o, { style: it.style === 'tent' ? 'tent' : 'room', ceilH: r3(num(it.ceilH, 2.4, 0.5, 8)), wallColour: hexOr(it.wallColour, '#e6e2d8'), floorColour: hexOr(it.floorColour, '#b9b3a4'),
        door: { side: ['n', 'e', 's', 'w'].includes(dr.side) ? dr.side : 's', pos: r3(num(dr.pos, 0.5, 0, 1)), w: r3(Math.max(0.2, Math.min(num(dr.w, 0.8, 0.2, 3), Math.min(o.w, o.h) - 0.1))) } });
      if (it.noDoor) o.noDoor = true;
    }
    if (it.kind === 'shelf') {
      Object.assign(o, { tiers: Math.round(num(it.tiers, 3, 1, 6)), tierGap: r3(num(it.tierGap, 0.4, 0.1, 1.5)), tierT: r3(num(it.tierT, 0.03, 0.005, 0.1)) });
      o.base = r3(num(it.base, 0.15, 0, 1));   // height of the lowest tier above the floor
    }
    if (it.kind === 'gear') {
      const gk = EQUIP[key(it.item)] ? it.item : 'led_bar', e = EQUIP[gk];
      Object.assign(o, { item: gk, watts: r3(num(it.watts, e.watts, 0, 5000)), hours: r3(num(it.hours, e.hours, 0, 24)), above: r3(num(it.above, 0.25, 0.03, 3)) });
      if (it.w == null || it.w === '') o.w = e.w; if (it.h == null || it.h === '') o.h = e.h;   // a new item takes the catalogue footprint; the member can change it
      if (e.group === 'Lights') o.spread = Math.round(num(it.spread, e.spread, 20, 170));
      const sh = str(it.shelf, 24).replace(/[^A-Za-z0-9_-]/g, ''); if (sh) { o.shelf = sh; o.tier = Math.round(num(it.tier, 1, 1, 6)); }
      if (e.litres) {   // a reservoir: how much it holds, and (if asked for) when to change the solution
        o.litres = r3(num(it.litres, e.litres, 1, 5000));
        o.changeEvery = Math.round(num(it.changeEvery, 14, 1, 120));
        o.lastChange = day(it.lastChange);
        if (it.remind) o.remind = true;
      }
      o.note = str(it.note, 200);
    }
    if (it.kind === 'hydro') {
      const type = HYDRO_KEYS.includes(it.type) ? it.type : 'nft';
      Object.assign(o, { type, spacing: r3(num(it.spacing, 0.2, 0.05, 1)), channels: Math.round(num(it.channels, 6, 1, 24)), channelSpacing: r3(num(it.channelSpacing, 0.2, 0.1, 1)), pockets: Math.round(num(it.pockets, 20, 4, 60)), slope: Math.round(num(it.slope, 60, 10, 500)), flow: r3(num(it.flow, 0.25, 0.05, 2)), volume: r3(num(it.volume, 0, 0, 5000)), drain: DRAINS.includes(it.drain) ? it.drain : 'recirculate' });
      if (CYCLES[key(it.crop)] && CYCLES[it.crop].group === 'Hydro') o.crop = it.crop;
      o.sow = day(it.sow);
      if (it.actual && typeof it.actual === 'object') { const a = {}; for (const k of ['germ', 'grow']) if (day(it.actual[k])) a[k] = it.actual[k]; if (Object.keys(a).length) o.actual = a; }
      if (day(it.cleared)) o.cleared = o.sow && it.cleared < o.sow ? o.sow : it.cleared;
      if (it.reset != null && it.reset !== '' && Number.isFinite(Number(it.reset))) o.reset = Math.round(num(it.reset, 2, 0, 30));
      o.note = str(it.note, 120);
      if (Array.isArray(it.history)) { const hs = []; for (const h of it.history.slice(-12)) { if (!h || typeof h !== 'object' || !CYCLES[h.crop] || !day(h.sow)) continue; const e = { crop: h.crop, sow: h.sow }; if (day(h.cleared)) e.cleared = h.cleared < h.sow ? h.sow : h.cleared; if (str(h.note, 60)) e.note = str(h.note, 60); hs.push(e); } if (hs.length) o.history = hs; }
    }
    if (it.kind === 'tray') {
      const kind = TRAY_KINDS.includes(it.kind2) ? it.kind2 : 'flat1020', pr = TRAY_PRESETS[kind];
      o.kind2 = kind;
      if (pr) { o.w = pr.w; o.h = pr.h; }   // a preset tray keeps its real size; only 'custom' lets w and h through
      const sh = str(it.shelf, 24).replace(/[^A-Za-z0-9_-]/g, ''); if (sh) { o.shelf = sh; o.tier = Math.round(num(it.tier, 1, 1, 6)); }
      if (CYCLES[key(it.crop)]) o.crop = it.crop;
      o.sow = day(it.sow);
      if (it.actual && typeof it.actual === 'object') { const a = {}; for (const k of ['germ', 'grow']) if (day(it.actual[k])) a[k] = it.actual[k]; if (Object.keys(a).length) o.actual = a; }
      if (day(it.cleared)) o.cleared = o.sow && it.cleared < o.sow ? o.sow : it.cleared;
      if (it.reset != null && it.reset !== '' && Number.isFinite(Number(it.reset))) o.reset = Math.round(num(it.reset, 2, 0, 30));
      o.qty = it.qty != null && Number.isFinite(Number(it.qty)) ? r3(num(it.qty, 0, 0, 100000)) : 0;   // seed used (g)
      o.note = str(it.note, 120);
      if (Array.isArray(it.history)) { const hs = []; for (const h of it.history.slice(-12)) { if (!h || typeof h !== 'object' || !CYCLES[h.crop] || !day(h.sow)) continue; const e = { crop: h.crop, sow: h.sow }; if (day(h.cleared)) e.cleared = h.cleared; if (h.qty != null && Number.isFinite(Number(h.qty))) e.qty = r3(num(h.qty, 0, 0, 100000)); if (str(h.note, 60)) e.note = str(h.note, 60); if (e.cleared && e.cleared < e.sow) e.cleared = e.sow; hs.push(e); } if (hs.length) o.history = hs; }   // finished batches on this tray, oldest first
      const lk = str(it.link, 40).replace(/[^A-Za-z0-9_-]/g, ''); if (lk) o.link = lk;   // reserved: a seed lot or plant record in the app (later)
    }
    if (it.kind === 'rows') {
      const crop = CROPS[key(it.crop)] ? it.crop : 'other', g = GUIDES[crop] || GUIDES.other;
      Object.assign(o, { crop, variety: str(it.variety, 60), ...lookOf(it), rowSpacing: r3(num(it.rowSpacing, g[4] || 0.75, 0.05, 50)), plantSpacing: r3(num(it.plantSpacing, g[3] || 0.3, 0.02, 50)), sow: day(it.sow), harvest: day(it.harvest) });
      o.remind = Number.isInteger(+it.remind) ? Math.min(60, Math.max(0, +it.remind)) : 3;
    }
  } else if (it.kind === 'conn') {   // a link between two indoor items; its line is worked out from where they stand (syncConns)
    const ref = v => str(v, 24).replace(/[^A-Za-z0-9_-]/g, '');
    Object.assign(o, { from: ref(it.from), to: ref(it.to), medium: MEDIA.includes(it.medium) ? it.medium : 'water', note: str(it.note, 120), pts: [[0, 0], [0, 0]] });
    if (it.fp) o.fp = ref(it.fp).slice(0, 12); if (it.tp) o.tp = ref(it.tp).slice(0, 12);   // the ports it joins (named places on each item)
    if (it.free === true) { o.free = true; o.pts = (Array.isArray(it.pts) && it.pts.length === 2 ? it.pts : [[0, 0], [0, 0]]).map(q => [r3(Math.max(-3000, Math.min(3000, num(q && q[0], 0)))), r3(Math.max(-3000, Math.min(3000, num(q && q[1], 0))))]); }   // unlocked: the line stays where it was left
    if (!o.from || !o.to) return null;
  } else if (k.line) {
    const pts = (Array.isArray(it.pts) ? it.pts : []).slice(0, 500).filter(p => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])) && p[0] !== null && p[1] !== null && p[0] !== '' && p[1] !== '').map(p => [r3(num(p[0], 0)), r3(num(p[1], 0))]);
    if (pts.length < (k.poly ? 3 : 2)) return null;
    if (k.poly) {   // a closed outline of any shape: needs a real area and no crossing sides
      if (pts.length > 100 || selfIntersects(pts) || Math.abs(polyArea(pts)) < 0.01) return null;
      o.style = SHAPE_STYLES.includes(it.style) ? it.style : 'bed';
      if (/^#[0-9a-fA-F]{6}$/.test(it.fill || '')) o.fill = it.fill;
      if (o.style === 'bed') { o.raised = r3(num(it.raised, 0, 0, 1.5)); }
      if (o.style === 'area' && SURFACE_KEYS.includes(it.surface)) o.surface = it.surface;
      if (o.style === 'building') { o.wallH = r3(num(it.wallH, 2.7, 0.5, 12)); o.wallColour = hexOr(it.wallColour, '#d8d2c4'); o.roofColour = hexOr(it.roofColour, '#8a5a44'); }
    }
    o.pts = pts;
    if (it.kind === 'path') o.width = r3(num(it.width, 0.9, 0.1, 20));
    if (it.kind === 'path' && SURFACE_KEYS.includes(it.surface)) o.surface = it.surface;
    if (it.kind === 'fence') { o.height = r3(num(it.height, 1.2, 0.1, 6)); if (FENCE_STYLES.includes(it.style) && it.style !== 'palings') o.style = it.style; if (/^#[0-9a-fA-F]{6}$/.test(it.colour || '')) o.colour = it.colour; }
    if (it.kind === 'trellis') Object.assign(o, { height: r3(num(it.height, 1.8, 0.3, 5)), style: pick(it.style, TRELLIS_STYLES) });
    if (it.kind === 'wall') {
      Object.assign(o, { height: r3(num(it.height, 0.6, 0.1, 4)), material: pick(it.material, WALL_MATERIALS) });
      const rt = it.retain;   // optional: this wall holds back soil (see earthworks.js); anything wrong with it and the wall simply stays an ordinary wall
      if (rt && typeof rt === 'object' && !Array.isArray(rt) && (rt.high === 'left' || rt.high === 'right') && pts.length <= MAX_RETAIN_PTS && !crossesItself(pts) && pts.reduce((n, p, i) => n + (i ? Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0) >= 0.5) {
        o.height = r3(Math.min(RETAIN_MAX_H, Math.max(RETAIN_MIN_H, o.height)));
        const r = { high: rt.high, split: Math.round(num(rt.split, 0.5, 0, 1) * 20) / 20 };
        if (rt.lvl != null && rt.lvl !== '' && Number.isFinite(Number(rt.lvl))) r.lvl = r3(num(rt.lvl, 0, -1000, 10000));
        if (rt.reach != null && Number.isFinite(Number(rt.reach))) r.reach = r3(num(rt.reach, 4, 0.5, 30));
        if (rt.follow === true) r.follow = true;
        o.retain = r;
      }
    }
  } else {
    Object.assign(o, { x: r3(num(it.x, 0)), y: r3(num(it.y, 0)) });
    if (it.kind === 'plant') {
      const crop = CROPS[key(it.crop)] ? it.crop : 'other', c = CROPS[crop];
      Object.assign(o, { crop, shape: SHAPES.includes(it.shape) ? it.shape : c[1], spread: r3(num(it.spread, c[2], 0.02, 40)), height: r3(num(it.height, c[3], 0.02, 40)), sow: day(it.sow), harvest: day(it.harvest), variety: str(it.variety, 60), ...lookOf(it) });
      if (o.sow && o.harvest && o.harvest < o.sow) o.harvest = o.sow;   // harvested before it was sown: the plant would never be drawn on any date
      const link = str(it.link, 40).replace(/[^A-Za-z0-9_-]/g, ''); if (link) o.link = link;
      const after = str(it.after, 24).replace(/[^A-Za-z0-9_-]/g, ''); if (after && after !== o.id) o.after = after;   // follows this planting in the same spot (never itself)
      o.remind = Number.isInteger(+it.remind) ? Math.min(60, Math.max(0, +it.remind)) : 3;       // remind this many days before each event
      if (it.save) o.save = true;                                                                 // saving seed from this planting
    }
    if (it.kind === 'note') o.text = str(it.text, 300);
    if (it.kind === 'task') { o.text = str(it.text, 200); o.date = day(it.date); o.every = ['week', 'month', 'year'].includes(it.every) ? it.every : ''; o.remind = Number.isInteger(+it.remind) ? Math.min(60, Math.max(0, +it.remind)) : 1; }
    if (it.kind === 'block') { if (!defs || !defs.has(it.def)) return null; o.def = it.def; o.rot = r3(num(it.rot, 0, -360, 360)); const place = str(it.place, 40).replace(/[^A-Za-z0-9_-]/g, ''); if (place) o.place = place; }
  }
  return o;
}
/* the member's own plant looks (made in the plant editor, plants/traits.js): kept in the plan as complete recipes, checked lightly here and
   fully by the plant generator when drawn; a bad one is simply not used */
const lookOf = it => (typeof it.look === 'string' && /^[a-z0-9]{4,12}$/.test(it.look) ? { look: it.look } : {});
export function cleanVarieties(v) {
  const out = {}; if (!v || typeof v !== 'object') return out;
  for (const id of Object.keys(v).slice(0, 80)) {
    const x = v[id]; if (!/^[a-z0-9]{4,12}$/.test(id) || !x || typeof x !== 'object' || !x.spec || typeof x.spec !== 'object') continue;
    let spec; try { spec = JSON.parse(JSON.stringify(x.spec)); } catch { continue; } if (JSON.stringify(spec).length > 30000) continue;
    out[id] = { id, name: str(x.name, 60) || 'My plant', base: str(x.base, 40), spec, mother: str(x.mother, 60), father: str(x.father, 60), gen: str(x.gen, 20), notes: str(x.notes, 600), made: day(x.made) };
  }
  return out;
}
export function cleanPlan(p) {
  if (!p || typeof p !== 'object' || p.format !== FORMAT) throw new Error('This is not an LT-Planner plan.');
  if (+p.version > VERSION) throw new Error('This plan was made by a newer LT-Planner. Reload the page to update, then open it again.');
  const s = p.site || {};
  const out = {
    format: FORMAT, version: VERSION, name: str(p.name, 80) || 'My plan',
    site: { w: r3(num(s.w, 20, 1, 5000)), h: r3(num(s.h, 15, 1, 5000)), north: r3(num(s.north, 0, -360, 360)), lat: num(s.lat, -33.9, -90, 90), lon: num(s.lon, 151.2, -180, 180), grid: [0.1, 0.25, 0.5, 1].includes(+s.grid) ? +s.grid : 0.5, country: /^[A-Z]{2}$/.test(key(s.country)) ? s.country : '', zone: '' },
    date: day(p.date) || todayISO(), items: [], blocks: Object.create(null),   // null prototype: a block called '__proto__' must be an ordinary key, never the object's prototype
  };
  // the zone only counts inside a country that has a guide; no location = no guide (there is no default)
  if (out.site.country && PACKS[out.site.country] && PACKS[out.site.country].zones.some(z => z[0] === s.zone)) out.site.zone = s.zone;
  else if (out.site.country && !PACKS[out.site.country] && typeof s.zone === 'string') out.site.zone = s.zone.replace(/[^a-z0-9-]/g, '').slice(0, 24);
  { const g = s.ground && unpackGrid(s.ground); if (g) out.site.ground = { cell: r3(+s.ground.cell), nx: g.nx, ny: g.ny, base: r3(num(s.ground.base, 0, -1000, 10000)), data: s.ground.data }; }
  const rawDefs = p.blocks && typeof p.blocks === 'object' ? p.blocks : {};
  const defIds = new Set(Object.keys(rawDefs).filter(k => /^[A-Za-z0-9_-]{1,24}$/.test(k) && !BAD_KEYS.includes(k)).slice(0, 300));
  const ids = new Set();
  for (const k of defIds) {
    const d = rawDefs[k] || {};
    out.blocks[k] = { name: str(d.name, 60) || 'Block', items: (Array.isArray(d.items) ? d.items : []).slice(0, 2000).map(it => cleanItem(it, ids, defIds)).filter(Boolean) };
  }
  // a block that (through other blocks) contains itself would never finish drawing: cut such links.
  // One depth-first walk over the definitions, cutting the link that closes a loop; a definition is only ever walked once.
  { const seen = Object.create(null);   // 1 = being walked (on the stack), 2 = finished
    const walkDef = k => {
      seen[k] = 1;
      out.blocks[k].items = out.blocks[k].items.filter(it => {
        if (it.kind !== 'block') return true;
        const d = it.def; if (!d || !out.blocks[d]) return true;
        if (seen[d] === 1) return false;                 // this link closes the loop: cut it
        if (seen[d] !== 2) walkDef(d);
        return true;
      });
      seen[k] = 2;
    };
    // Started from the definitions the plan itself places, so the link that gets cut is the one deeper in,
    // not the one the member put on the plan: cutting that way used to leave their block drawing nothing.
    const seeds = [];
    for (const it of (Array.isArray(p.items) ? p.items : [])) { const d = it && it.kind === 'block' ? it.def : null; if (typeof d === 'string' && out.blocks[d] && !seeds.includes(d)) seeds.push(d); }
    for (const k of seeds) if (seen[k] !== 2) walkDef(k);
    for (const k of Object.keys(out.blocks)) if (seen[k] !== 2) walkDef(k);
  }
  out.items = (Array.isArray(p.items) ? p.items : []).slice(0, 5000).map(it => cleanItem(it, ids, defIds)).filter(Boolean);
  { const vs = cleanVarieties(p.varieties); if (Object.keys(vs).length) out.varieties = vs; }
  if (UNITS.includes(s.units) && s.units !== 'm') out.site.units = s.units;   // absent = metric; lengths are always stored in metres
  { const hs = s.heightScale == null ? 1 : r3(num(s.heightScale, 1, 0.5, 2)); if (hs !== 1) out.site.heightScale = hs; }   // plan-wide plant height scale; absent = 1
  { const poly = cleanPoly(s.poly, out.site.w, out.site.h); if (poly) { out.site.poly = poly; out.version = 2; } else out.version = 1; }
  { let n = 0; for (const i of out.items) if (i.retain && ++n > MAX_RETAIN_WALLS) { delete i.retain; } }   // bounds the work a hostile file can ask for
  if (out.items.some(i => i.kind === 'wall' && i.retain) || Object.values(out.blocks).some(b => b.items.some(i => i.kind === 'wall' && i.retain))) out.version = 3;
  else if (out.items.some(i => i.kind === 'shape') || Object.values(out.blocks).some(b => b.items.some(i => i.kind === 'shape'))) out.version = 2;   // older apps would drop free-form shapes   // only a plan with an outline needs a newer app; rectangle plans stay version 1
  { // indoor items: capped (a hostile file cannot ask for thousands), trays that name a missing shelf are loosened, tiers kept inside the shelf
    const caps = { room: INDOOR_LIMITS.rooms, shelf: INDOOR_LIMITS.shelves, tray: INDOOR_LIMITS.trays, gear: LIMITS_GEAR, hydro: LIMITS_HYDRO.hydro, conn: LIMITS_HYDRO.conn }, n = { room: 0, shelf: 0, tray: 0, gear: 0, hydro: 0, conn: 0 }, drop = new Set(), all = [...out.items];
    for (const b of Object.values(out.blocks)) all.push(...b.items);
    for (const i of all) if (caps[i.kind] && ++n[i.kind] > caps[i.kind]) drop.add(i);
    if (drop.size) { out.items = out.items.filter(i => !drop.has(i)); for (const b of Object.values(out.blocks)) b.items = b.items.filter(i => !drop.has(i)); }
    const shelves = new Map(out.items.filter(i => i.kind === 'shelf').map(i => [i.id, i]));
    for (const i of out.items) if ((i.kind === 'tray' || i.kind === 'gear') && i.shelf) { const sh = shelves.get(i.shelf); if (!sh) { delete i.shelf; delete i.tier; } else if (i.tier > sh.tiers) i.tier = sh.tiers; }
    // block copies count too: a block holding 2000 trays placed 300 times would be 600000 trays
    { const zero = () => ({ room: 0, shelf: 0, tray: 0, gear: 0, hydro: 0, conn: 0, all: 0 }), memo = Object.create(null);
      // what one copy of a definition really comes to, counting the blocks nested inside it all the way down.
      // Loops are already cut above, so this ends; the memo makes it one pass over each definition.
      const ofDef = def => { if (memo[def]) return memo[def]; const c = zero(); memo[def] = c;
        for (const i of (out.blocks[def] ? out.blocks[def].items : [])) {
          if (i.kind === 'block' && out.blocks[i.def]) { const d = ofDef(i.def); for (const k in c) c[k] += d[k]; }
          else { c.all++; if (caps[i.kind]) c[i.kind]++; }
        }
        return c; };
      // one copy may not bring more than this many items, however deeply it is nested
      for (const list of [out.items, ...Object.values(out.blocks).map(b => b.items)])
        for (let x = list.length - 1; x >= 0; x--) { const i = list[x]; if (i.kind === 'block' && out.blocks[i.def] && ofDef(i.def).all > MAX_BLOCK_ITEMS) list.splice(x, 1); }
      const tally = () => { const c = zero(); for (const i of out.items) { if (i.kind === 'block' && out.blocks[i.def]) { const d = ofDef(i.def); for (const k in c) c[k] += d[k]; } else { c.all++; if (caps[i.kind]) c[i.kind]++; } } return c; };
      const over = c => c.all > MAX_PLAN_ITEMS || Object.keys(caps).some(k => c[k] > caps[k]);
      { const c = tally();
        for (let x = out.items.length - 1; x >= 0 && over(c); x--) { const i = out.items[x]; if (i.kind === 'block' && out.blocks[i.def]) { const d = ofDef(i.def); for (const k in c) c[k] -= d[k]; out.items.splice(x, 1); } } } }
    for (const b of Object.values(out.blocks)) { const sh = new Map(b.items.filter(i => i.kind === 'shelf').map(i => [i.id, i])); for (const i of b.items) if ((i.kind === 'tray' || i.kind === 'gear') && i.shelf) { const s0 = sh.get(i.shelf); if (!s0) { delete i.shelf; delete i.tier; } else if (i.tier > s0.tiers) i.tier = s0.tiers; } }
    syncConns(out.items); for (const b of Object.values(out.blocks)) syncConns(b.items);
    if (all.some(i => caps[i.kind] && !drop.has(i))) out.version = 4;   // older apps would drop rooms, shelves and trays
  }
  return out;
}
/* links follow their two ends: drop any whose end is gone, that join an item to itself or repeat another, and redraw the line centre to centre */
const LINKABLE = ['room', 'shelf', 'tray', 'gear', 'hydro'];
export function syncConns(list) {
  const byId = new Map(list.map(i => [i.id, i]));
  for (let x = list.length - 1; x >= 0; x--) {   // links with a missing, same or unlinkable end go
    const c = list[x]; if (c.kind !== 'conn') continue;
    const a = byId.get(c.from), b = byId.get(c.to);
    if (!a || !b || a === b || !LINKABLE.includes(a.kind) || !LINKABLE.includes(b.kind) || typeof a.x !== 'number' || typeof b.x !== 'number') list.splice(x, 1);
  }
  const used = new Set();   // ports already taken by an earlier link, so a second link takes a free port when there is one
  for (const c of list) {   // repair and pick ports first, so two older links between the same pair end up on different ports instead of one being lost
    if (c.kind !== 'conn') continue; const a = byId.get(c.from), b = byId.get(c.to);
    if ((c.fp || c.tp) && !(c.fp && c.tp && portsValid(c, a, b))) { delete c.fp; delete c.tp; }   // a port that is gone, carries something else, or no longer pairs up
    if (!c.fp && !c.tp && !c.free) { const pr = pickPair(a, b, c.medium, used); if (pr) { c.fp = pr.from.id; c.tp = pr.to.id; } }
    if (c.fp) used.add(c.from + '|' + c.fp); if (c.tp) used.add(c.to + '|' + c.tp);
  }
  const seen = new Set();
  for (let x = list.length - 1; x >= 0; x--) {   // then the same two ports twice is one link
    const c = list[x]; if (c.kind !== 'conn') continue; const key = linkKey(c);
    if (seen.has(key)) { list.splice(x, 1); continue; } seen.add(key);
  }
  for (const c of list) {
    if (c.kind !== 'conn' || c.free) continue;   // an unlocked link keeps the line it had
    const a = byId.get(c.from), b = byId.get(c.to);
    if (c.fp && c.tp) { try { const { A, B } = endPoints(c, a, b); c.pts = [[r3(A.p[0]), r3(A.p[1])], [r3(B.p[0]), r3(B.p[1])]]; continue; } catch (e) { /* fall back to centres */ } }
    c.pts = [[r3(a.x), r3(a.y)], [r3(b.x), r3(b.y)]];
  }
  return list;
}
/* a new link between two items on a list, or null (missing end, same item, an end that is itself a link, or the same link again) */
export function makeConn(list, from, to, medium, ports) {
  const a = list.find(i => i.id === from), b = list.find(i => i.id === to);
  if (!a || !b || a === b || !LINKABLE.includes(a.kind) || !LINKABLE.includes(b.kind) || typeof a.x !== 'number' || typeof b.x !== 'number') return null;
  const med = MEDIA.includes(medium) ? medium : 'water';
  const used = new Set(); for (const k of list) if (k.kind === 'conn' && !k.free) { if (k.fp) used.add(k.from + '|' + k.fp); if (k.tp) used.add(k.to + '|' + k.tp); }
  const c = { id: newId(), kind: 'conn', folder: 'indoor', name: 'Link', hidden: false, locked: false, off: false, from, to, medium: med, note: '', pts: [[r3(a.x), r3(a.y)], [r3(b.x), r3(b.y)]] };
  const pr = pickPair(a, b, med, used, ports && { from: ports.from, to: ports.to });
  if (ports && (ports.from || ports.to) && !pr) return null;   // the ports asked for cannot be joined
  if (pr) { c.fp = pr.from.id; c.tp = pr.to.id; }
  const key = linkKey(c);
  if (list.some(k => k.kind === 'conn' && linkKey(k) === key)) return null;   // the same two ports again
  return c;
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
/* Write out one copy of a block.  Each copy gets ids of its own (the copy's id, then the part's), because two
   copies of the same block are two real things: a calendar needs two events, the 3D view two shelves, and a
   link inside the block has to find the ends belonging to its own copy.  Ids that point inside the block
   (a tray's shelf, a link's two ends, "sow after") are moved across with them. */
function copyOut(plan, ins, keepOff) {
  const d = plan.blocks[ins.def]; if (!d) return [];
  const src = keepOff ? d.items : d.items.filter(it => !it.off);
  const pre = ins.id + ':', own = new Set(d.items.map(it => it.id));
  const ref = id => (id != null && own.has(id) ? pre + id : id);
  return src.map(it => {
    const o = placeItem(it, ins.rot || 0, 0, 0, ins.x, ins.y);
    o.id = pre + o.id;
    if (o.shelf) o.shelf = ref(o.shelf);
    if (o.after) o.after = ref(o.after);
    if (o.kind === 'conn') { o.from = ref(o.from); o.to = ref(o.to); }
    return o;
  });
}
export function blockItems(plan, ins) { return copyOut(plan, ins, false); }
/* Merge the chosen items into a new block, placed where they were.  Returns the new copy (or null). */
export function makeBlock(plan, ids, name) {
  const chosen = new Set(ids);
  for (const c of plan.items) if (c.kind === 'conn' && chosen.has(c.from) && chosen.has(c.to)) chosen.add(c.id);   // a link whose two ends both move goes into the block with them
  ids = [...chosen];
  const pick = plan.items.filter(it => chosen.has(it.id) && !(it.kind === 'conn' && !(chosen.has(it.from) && chosen.has(it.to))));
  if (!pick.length || pick.every(it => it.kind === 'conn')) return null;
  const b = union(pick.filter(it => it.kind !== 'conn').map(it => bounds(it, plan))), ox = r3(b[0]), oy = r3(b[1]);
  const defId = newId();
  plan.blocks[defId] = { name: (name || 'Block').slice(0, 60), items: syncConns(pick.map(it => moveItem(JSON.parse(JSON.stringify(it)), -ox, -oy))) };
  const at = plan.items.indexOf(pick[pick.length - 1]);
  const first = pick.find(it => it.kind !== 'conn') || pick[0];
  const ins = { id: newId(), kind: 'block', folder: first.folder, name: plan.blocks[defId].name, hidden: false, locked: false, off: false, def: defId, x: ox, y: oy, rot: 0 };
  plan.items.splice(at + 1, 0, ins);
  plan.items = plan.items.filter(it => !ids.includes(it.id));
  return ins;
}
/* Turn one copy back into loose items (with new ids). Returns the new items. */
export function explodeBlock(plan, insId) {
  const i = plan.items.findIndex(it => it.id === insId && it.kind === 'block');
  if (i < 0) return [];
  const src = blockItemsAll(plan, plan.items[i]), idMap = new Map(src.map(it => [it.id, newId()]));
  const loose = src.map(it => { const o = Object.assign(it, { id: idMap.get(it.id) }); if (o.shelf) { if (idMap.has(o.shelf)) o.shelf = idMap.get(o.shelf); else { delete o.shelf; delete o.tier; } } if (o.after) { if (idMap.has(o.after)) o.after = idMap.get(o.after); else delete o.after; } if (o.kind === 'conn') { o.from = idMap.get(o.from) || o.from; o.to = idMap.get(o.to) || o.to; } return o; });
  plan.items.splice(i, 1, ...loose);
  syncConns(plan.items);
  return loose;
}
function blockItemsAll(plan, ins) { return copyOut(plan, ins, true); }
/* Give one copy its own definition, so editing it no longer changes the others. */
export function makeUnique(plan, insId) {
  const ins = plan.items.find(it => it.id === insId && it.kind === 'block'); if (!ins || !plan.blocks[ins.def]) return null;
  const old = plan.blocks[ins.def], defId = newId();
  plan.blocks[defId] = { name: old.name + ' (own copy)', items: (() => { const idMap = new Map(old.items.map(it => [it.id, newId()])); return old.items.map(it => { const o = Object.assign(JSON.parse(JSON.stringify(it)), { id: idMap.get(it.id) }); if (o.shelf) { if (idMap.has(o.shelf)) o.shelf = idMap.get(o.shelf); else { delete o.shelf; delete o.tier; } } if (o.after) { if (idMap.has(o.after)) o.after = idMap.get(o.after); else delete o.after; } if (o.kind === 'conn') { o.from = idMap.get(o.from) || o.from; o.to = idMap.get(o.to) || o.to; } return o; }); })() };
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

/* ---------- crop rows: a rule that stands for many plants ---------- */
const MAX_ROW_PLANTS = 2000000;   // beyond this the spacing is widened, so a typing slip cannot freeze a tablet
const MAX_FIELD_PLANTS = 2000000;   // and this is the ceiling for the whole plan: 500 beds of two million each is not a plan a tablet can draw
/* rows run along the width and are spaced across the depth; one plant sits on each crossing */
export function rowsLayout(it) {
  let rs = it.rowSpacing, ps = it.plantSpacing, rows = Math.floor(it.h / rs + 1e-9) + 1, cols = Math.floor(it.w / ps + 1e-9) + 1;
  while (rows * cols > MAX_ROW_PLANTS) { rs *= 1.25; ps *= 1.25; rows = Math.floor(it.h / rs + 1e-9) + 1; cols = Math.floor(it.w / ps + 1e-9) + 1; }
  return { rows, cols, rowSpacing: rs, plantSpacing: ps, count: rows * cols };
}
/* which generated plant stands in for each crop until it has its own (by growing shape) */
const PRESET_FOR = { tomato: 'tomato', corn: 'corn', pumpkin: 'pumpkinVine', squash: 'pattypan', melon: 'pumpkinVine', cucumber: 'pumpkinVine', fruittree: 'citrus', sunflower: 'sunflower',
  capsicum: 'capsicum', chilli: 'chilli', eggplant: 'eggplant', potato: 'potato', bean: 'bean', pea: 'pea', broadbean: 'bean', sweetpotato: 'pumpkinVine',
  lettuce: 'lettuce', spinach: 'spinach', silverbeet: 'silverbeet', beetroot: 'beetroot', carrot: 'carrot', radish: 'radish', onion: 'onion', leek: 'leek', garlic: 'garlic',
  cabbage: 'cabbage', broccoli: 'broccoli', cauliflower: 'cauliflower', kale: 'kale', basil: 'basil', parsley: 'parsley', herb: 'herbs', strawberry: 'strawberry' };
/* a few varieties look different enough to get their own plant: red lettuce and cabbage, rainbow and red chard, Tuscan kale, red onion */
const BY_VARIETY = [['lettuce', /red|oak|lollo|rouge|merlot|cos.*red/i, 'lettuceRed'], ['cabbage', /red|purple|ruby/i, 'cabbageRed'], ['silverbeet', /rainbow|bright lights|five colou?r|ruby|red|rhubarb|yellow/i, 'chardRainbow'],
  ['kale', /tuscan|cavolo|nero|black|lacinato|dinosaur/i, 'kaleTuscan'], ['onion', /red|purple|spanish/i, 'onionRed']];
const PRESET_BY_SHAPE = { upright: 'tomato', bush: 'tomato', vine: 'pumpkinVine', tree: 'appleTree', root: 'tomato', grass: 'corn' };
/* plants from the plant database name their own look (a preset in plants/plants.js; the plant database test checks each one exists) */
export const presetFor = (crop, variety = '', own = '', varieties = null) => {
  if (own && varieties && Object.prototype.hasOwnProperty.call(varieties, own) && varieties[own]) return 'v_' + own;   // the member's own variety (carried in the plan)
  if (variety) for (const [c, re, p] of BY_VARIETY) if (c === crop && re.test(variety)) return p;
  if (PRESET_FOR[crop]) return PRESET_FOR[crop];
  const look = PLANT_DB[crop] && PLANT_DB[crop].look; if (look) return look;
  return PRESET_BY_SHAPE[(CROPS[crop] || CROPS.other)[1]] || 'tomato'; };
const hashId = s => { let h = 7; for (const c of String(s)) h = (Math.imul(h, 31) + c.charCodeAt(0)) | 0; return Math.abs(h) || 1; };
/* The rows of the plan as rules for the 3D field drawer (plants/field.js), in plan metres: x across, y becomes the ground's z.
   Rows that are not sown yet on `date`, or already harvested, are left out. `stage` is how far grown they are (0.15 to 1). */
export function fieldRules(plan, date) {
  const out = [], d = date || plan.date;
  let left = MAX_FIELD_PLANTS;   // shared out across every bed of rows, not given to each one over again
  const walk = items => items.forEach(it => { if (it.off || it.hidden) return; if (it.kind === 'block') walk(blockItemsAll(plan, it)); else if (it.kind === 'rows') {
    const g = growth(it, d); if (g === null || left <= 0) return;
    let L = rowsLayout(it);
    if (L.count > left) {   // widen the spacing until this bed fits what is left, the same way one oversized bed is thinned
      let rs = L.rowSpacing, ps = L.plantSpacing, rows = L.rows, cols = L.cols;
      while (rows * cols > left && rs < 1e4) { rs *= 1.25; ps *= 1.25; rows = Math.floor(it.h / rs + 1e-9) + 1; cols = Math.floor(it.w / ps + 1e-9) + 1; }
      L = { rows, cols, rowSpacing: rs, plantSpacing: ps, count: rows * cols };
      if (L.count > left) return;
    }
    left -= L.count;
    const a = rad(it.rot || 0), cx = -it.w / 2, cy = -it.h / 2;
    out.push({ id: it.id, species: presetFor(it.crop, it.variety, it.look, plan.varieties), crop: it.crop, stage: r3(g), x: r3(it.x + cx * Math.cos(a) - cy * Math.sin(a)), z: r3(it.y + cx * Math.sin(a) + cy * Math.cos(a)), angle: r3(it.rot || 0),
      rows: L.rows, cols: L.cols, rowSpacing: r3(L.rowSpacing), plantSpacing: r3(L.plantSpacing), jitter: r3(Math.min(0.1, L.plantSpacing * 0.1)), seed: hashId(it.id) });
  } });
  walk(plan.items);
  return out;
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
const isBedLike = it => it.kind === 'bed' || it.kind === 'bench' || (it.kind === 'shape' && it.style === 'bed');   // a free-form garden bed counts as a bed
const boxOf = it => { if (!it.pts) return { w: it.w, h: it.h, x: it.x, y: it.y }; const xs = it.pts.map(q => q[0]), ys = it.pts.map(q => q[1]); let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity; for (const v of xs) { if (v < x0) x0 = v; if (v > x1) x1 = v; } for (const v of ys) { if (v < y0) y0 = v; if (v > y1) y1 = v; } return { w: r3(x1 - x0), h: r3(y1 - y0), x: r3((x0 + x1) / 2), y: r3((y0 + y1) / 2) }; };
export function forApp(plan) {
  const all = [];
  const linkedBlocks = [];
  const walk = items => items.forEach(it => { if (it.off) return; if (it.kind === 'block') { if (it.place) linkedBlocks.push(it); walk(blockItemsAll(plan, it).filter(x => !x.off)); } else all.push(it); });
  walk(plan.items);
  const beds = all.filter(isBedLike);   // worked out once: every sowing used to scan the whole plan for its bed
  return {
    format: 'lt-planner-for-app', version: 1, plan: plan.name, made: new Date().toISOString(),
    location: { country: plan.site.country, zone: plan.site.zone },   // the app uses the guide for this same location
    // place: the app Place this bed is (the app updates it); no place = a new Place with this name.  A linked block copy
    // counts as one Place (e.g. "Tomato bed 2") holding everything inside it.
    beds: all.filter(isBedLike).map(it => { const bx = boxOf(it); return { planId: it.id, name: it.name, kind: it.kind === 'shape' ? 'bed' : it.kind, w: bx.w, h: bx.h, x: bx.x, y: bx.y, place: it.place || '' }; })
      .concat(linkedBlocks.map(b => { const bb = bounds(b, plan); return { planId: b.id, name: b.name, kind: 'block', w: r3(bb[2] - bb[0]), h: r3(bb[3] - bb[1]), x: r3((bb[0] + bb[2]) / 2), y: r3((bb[1] + bb[3]) / 2), place: b.place }; })),
    sowings: all.filter(it => (it.kind === 'plant' || it.kind === 'rows') && it.sow).map(it => ({ planId: it.id, crop: CROPS[it.crop][0], variety: it.variety || '', sow: it.sow, harvest: it.harvest || '', link: it.link || '', bed: bedUnder(beds, it), after: it.after || '', saveSeed: !!it.save })),
    // dated events for the app's calendar and reminders (the app asks before adding them)
    reminders: events(plan).map(e => ({ planId: e.id, date: e.date, kind: e.kind, title: e.title, remindDaysBefore: e.remind || 0, every: e.every || '' })),
  };
}
function bedUnder(beds, p) {
  const b = beds.find(it => inBed(it, p));
  return b ? b.id : '';
}

/* ---------- follow-on plantings, the calendar and reminders ---------- */
const addDays = (iso, n) => {   // never throws: a bad date or step gives the date back unchanged
  const t = Date.parse(iso + 'T00:00:00Z'), k = Number(n);
  if (!Number.isFinite(t) || !Number.isFinite(k)) return iso;
  const ms = t + k * 86400000;
  if (!Number.isFinite(ms) || ms < -2208988800000 || ms > 7258118400000) return iso;   // keep inside 1900..2200
  return new Date(ms).toISOString().slice(0, 10);
};
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
/* Add whole months to a date, keeping the day of the month and clamping to the end of a short month.
   Stepping with setUTCMonth drifted: 31 January became 3 March, then the 3rd of every month after that. */
const addMonths = (iso, k) => {
  const y = +iso.slice(0, 4), m0 = +iso.slice(5, 7) - 1, d0 = +iso.slice(8, 10), n = Number(k);
  if (!Number.isFinite(y) || !Number.isFinite(m0) || !Number.isFinite(d0) || !Number.isFinite(n)) return iso;
  const t = y * 12 + m0 + Math.round(n), ny = Math.floor(t / 12), nm = t - ny * 12;
  if (ny < 1900 || ny > 2200) return iso;
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const dt = new Date(Date.UTC(ny, nm, Math.min(d0, last)));
  return Number.isFinite(+dt) ? dt.toISOString().slice(0, 10) : iso;
};
/* How many whole steps of `days` it takes to reach `from` from `anchor`.  Worked out rather than stepped to:
   a weekly job anchored two years back used to run out of steps before it reached today and vanish. */
const stepsTo = (anchor, from, days) => { const a = dnum(anchor), f = dnum(from), d = Number(days); return (!Number.isFinite(a) || !Number.isFinite(f) || !(d > 0)) ? 0 : Math.max(0, Math.ceil((f - a) / d)); };

/* Every dated event in the plan, oldest first: sowings, harvests, swaps (a harvest followed by the next planting) and jobs.
   Jobs that repeat are listed for the next 12 months from `from`. */
export function events(plan, from) {
  const out = [], all = [];
  const walk = items => items.forEach(it => { if (it.off) return; if (it.kind === 'block') walk(blockItemsAll(plan, it)); else all.push(it); });
  walk(plan.items);
  const plants = all.filter(it => it.kind === 'plant' || it.kind === 'rows');
  // indexed once: scanning the list for each plant turned a big plan into minutes of work
  const byPlantId = new Map(), nextByAfter = new Map();
  for (const p of plants) { if (!byPlantId.has(p.id)) byPlantId.set(p.id, p); if (p.after && !nextByAfter.has(p.after)) nextByAfter.set(p.after, p); }
  const nextOf = id => nextByAfter.get(id);
  for (const p of plants) {
    const label = CROPS[p.crop][0] + (p.variety ? ' (' + p.variety + ')' : '');
    const prev = p.after ? byPlantId.get(p.after) : null;
    if (p.sow && !prev) out.push({ date: p.sow, kind: 'sow', title: 'Sow or plant ' + label, id: p.id, remind: p.remind ?? 3 });
    if (p.harvest) {
      const nx = nextOf(p.id);
      if (nx) out.push({ date: p.harvest, kind: 'swap', title: 'Swap: ' + label + ' out, ' + CROPS[nx.crop][0] + (nx.variety ? ' (' + nx.variety + ')' : '') + ' in', id: p.id, next: nx.id, remind: p.remind ?? 3 });
      else out.push({ date: p.harvest, kind: 'harvest', title: 'Harvest ' + label, id: p.id, remind: p.remind ?? 3 });
    }
  }
  for (const t of all.filter(it => (it.kind === 'tray' || it.kind === 'hydro') && it.crop && it.sow && CYCLES[it.crop])) {   // indoor batches: sow, move to light, ready, clean and reset (expected dates; the tray panel shows early and late)
    const cy = CYCLES[t.crop], tl = cycleTimeline(cy, t.sow, t.actual, t.reset); if (!tl) continue;
    const nm = cy.name + ' on ' + t.name;
    out.push({ date: t.sow, kind: 'sow', title: 'Sow ' + nm, id: t.id, remind: 1 });
    if (t.cleared) { out.push({ date: t.cleared, kind: 'harvest', title: 'Cleared: ' + nm, id: t.id, remind: 0 }); continue; }
    const g = tl.stages[0]; if (tl.stages.length > 1 && !g.actual) out.push({ date: g.endExp, kind: 'stage', title: (cy.group === 'Hydro' ? 'Transplant into the system, ' : cy.light === 'after' ? 'Take off the blackout, ' : 'Check germination, ') + nm, id: t.id, remind: 0, est: true });
    out.push({ date: tl.readyExp, kind: 'harvest', title: (cy.group === 'Seedlings' ? 'Ready to plant out: ' : 'Harvest ') + nm, id: t.id, remind: 1, est: true });
    if (tl.reset) out.push({ date: tl.freeExp, kind: 'clean', title: 'Clean and reset the space for ' + nm, id: t.id, remind: 0, est: true });
  }
  const start = from || plan.date, stop = addDays(start, 366);
  let resEvents = 0;   // a hostile or very big plan cannot fill the calendar with reminders
  for (const r of all.filter(it => it.kind === 'gear' && it.remind && it.lastChange && it.changeEvery && EQUIP[it.item] && EQUIP[it.item].litres)) {
    if (resEvents > 300) break;
    for (let k = Math.max(1, stepsTo(r.lastChange, start, r.changeEvery)), n = 0; n < 40; k++, n++) {
      const d = addDays(r.lastChange, k * r.changeEvery); if (d > stop) break;
      out.push({ date: d, kind: 'clean', title: 'Change the solution: ' + r.name, id: r.id, remind: 1, every: 'res' }); resEvents++;
    }
    // the weekly check counts from the last change, not from today, or it reads as due every time the plan is opened
    for (let k = stepsTo(r.lastChange, start, 7), m = 0; m < 13; k++, m++) {
      const c = addDays(r.lastChange, k * 7); if (c > stop) break;
      out.push({ date: c, kind: 'job', title: 'Check pH and EC: ' + r.name, id: r.id, remind: 0, every: 'week' }); resEvents++;
    }
  }
  for (const t of all.filter(it => it.kind === 'task' && it.date)) {
    const title = t.text || t.name;
    if (!t.every) { out.push({ date: t.date, kind: 'job', title, id: t.id, remind: t.remind ?? 1, every: t.every }); continue; }
    // every occurrence is worked out from the job's own date, so the series never drifts and an old job still shows
    const at = t.every === 'week' ? i => addDays(t.date, i * 7) : t.every === 'month' ? i => addMonths(t.date, i) : i => addMonths(t.date, i * 12);
    let i0 = 0;
    if (t.every === 'week') i0 = stepsTo(t.date, start, 7);
    else {
      const per = t.every === 'month' ? 1 : 12;
      i0 = Math.max(0, Math.floor(((+start.slice(0, 4) - +t.date.slice(0, 4)) * 12 + (+start.slice(5, 7) - +t.date.slice(5, 7))) / per));
      while (i0 > 0 && at(i0 - 1) >= start) i0--;
      for (let g = 0; g < 24 && at(i0) < start; g++) i0++;
    }
    for (let i = i0, n = 0; n < 60; i++, n++) { const d = at(i); if (d > stop) break; out.push({ date: d, kind: 'job', title, id: t.id, remind: t.remind ?? 1, every: t.every }); }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.title < b.title ? -1 : 1));
}
/* Events that are due now or whose reminder has started, as of `today`. */
export const dueSoon = (plan, today) => {
  const d = day(today) ? today : ((plan && day(plan.date)) ? plan.date : new Date().toISOString().slice(0, 10));
  const from = addDays(d, -7);
  return events(plan, from).filter(e => e.date >= from && addDays(e.date, -(e.remind || 0)) <= d);
};
/* A calendar file (.ics) any phone or computer calendar can import, with an alarm before each event. */
export function toICS(plan, from) {
  const esc = t => String(t).replace(/[\\;,]/g, m => '\\' + m).replace(/\r?\n/g, ' ');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Lineage Tracker//LT-Planner//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:' + esc(plan.name), 'X-WR-CALDESC:Powered by Lineage Tracker\\, free at lineagetracker.org'];
  for (const e of events(plan, from)) {
    const d = e.date.replace(/-/g, ''), d2 = addDays(e.date, 1).replace(/-/g, '');
    lines.push('BEGIN:VEVENT', 'UID:' + e.id + '-' + e.kind + '-' + d + '@planner.lineagetracker.org', 'DTSTAMP:' + stamp, 'DTSTART;VALUE=DATE:' + d, 'DTEND;VALUE=DATE:' + d2, 'SUMMARY:' + esc(e.title), 'DESCRIPTION:' + esc('From the plan "' + plan.name + '" (LT-Planner)' + (e.est ? '. Expected date, worked out from typical timings for this crop: your own batch may be earlier or later.' : '')));
    if (e.remind > 0) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + esc(e.title), 'TRIGGER:-P' + e.remind + 'D', 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  // RFC 5545 wraps a line longer than 75 octets onto the next one with a leading space.  Counted in octets,
  // not characters, so a plan name in another script does not push the line over.
  const fold = l => {
    const b = [...l].reduce((n, c) => n + new TextEncoder().encode(c).length, 0);
    if (b <= 73) return l;
    const out = []; let cur = '', n = 0;
    for (const ch of l) { const w = new TextEncoder().encode(ch).length; if (n + w > 72) { out.push(cur); cur = ''; n = 0; } cur += ch; n += w; }
    if (cur) out.push(cur);
    return out.join('\r\n ');
  };
  return lines.map(fold).join('\r\n') + '\r\n';
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
  const bed = items.find(it => it.id === bedId && isBedLike(it)); if (!bed) return [];
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
const inBed = (bed, p) => {
  if (bed.pts) return pip([p.x, p.y], bed.pts);
  const [x, y] = rotPt([p.x - bed.x, p.y - bed.y], -bed.rot); return Math.abs(x) <= bed.w / 2 && Math.abs(y) <= bed.h / 2; };
/* What is growing in a bed, greenhouse or bench on `date` (items = the flat list of plan items): [{ crop, name, variety, n }], most plants first */
const pip = ([x, y], q) => { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) if ((q[i][1] > y) !== (q[j][1] > y) && x < (q[j][0] - q[i][0]) * (y - q[i][1]) / (q[j][1] - q[i][1]) + q[i][0]) c = !c; return c; };
export function growingIn(items, bed, date) {
  const by = new Map();
  for (const it of items) {
    if (it.kind !== 'plant' || it.off || it.hidden || growth(it, date) === null || !inBed(bed, it)) continue;
    const key = it.crop + '|' + (it.variety || ''), e = by.get(key) || { crop: it.crop, name: (CROPS[it.crop] || CROPS.other)[0], variety: it.variety || '', n: 0 }; e.n++; by.set(key, e);
  }
  return [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
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
  const bed = items.find(it => isBedLike(it) && !it.off && inBed(it, plant)); if (!bed) return [];
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
