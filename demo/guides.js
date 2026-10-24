/* Planting guides for common vegetables, herbs and fruit, built in so they work offline.
   A general guide only: local conditions vary, so the planner says "check your local guide" wherever it uses them.

   Each crop: [name, family, shape, spacing (m, between plants in a row), row (m, between rows), height (m),
               days (sowing or planting to first harvest; 0 = perennial), sun ('full' | 'part'), how ('seed' | 'seedling' | 'both'),
               Australian sowing months by climate zone (1-12): { tropical, subtropical, temperate, cool, arid },
               friends (grow well near), avoid (keep apart)]
   Climate zones as used in Australian gardening guides: tropical (Darwin, Cairns), subtropical (Brisbane, northern NSW),
   temperate (Sydney, Perth, Adelaide), cool (Melbourne, Canberra, Hobart, the tablelands), arid (inland). */
import { frostPack, ZONES, NAMES } from './frost.js';
import { IN_PACK, PH_PACK } from './seasons.js';
import { REGIONS } from './frost-regions.js';
import { PLANTS, BY_ID, suitsZone } from '../kit/plantdb.js';
const R = (a, b) => { const out = []; for (let m = a; ; m = (m % 12) + 1) { out.push(m); if (m === b) break; } return out; };
const ALL = R(1, 12);
export const GUIDES = {
  tomato: ['Tomato', 'Solanaceae', 'upright', 0.5, 0.9, 1.5, 75, 'full', 'seedling', { tropical: R(3, 7), subtropical: R(8, 2), temperate: R(9, 12), cool: R(10, 12), arid: [2, 3, 8, 9, 10] }, ['basil', 'carrot', 'lettuce', 'parsley'], ['potato', 'corn', 'cabbage', 'broccoli', 'cauliflower']],
  capsicum: ['Capsicum', 'Solanaceae', 'bush', 0.5, 0.6, 0.8, 100, 'full', 'seedling', { tropical: R(3, 8), subtropical: R(8, 12), temperate: R(9, 11), cool: [10, 11], arid: [8, 9, 10] }, ['basil', 'carrot', 'onion'], ['bean']],
  chilli: ['Chilli', 'Solanaceae', 'bush', 0.5, 0.6, 0.8, 100, 'full', 'seedling', { tropical: R(3, 8), subtropical: R(8, 12), temperate: R(9, 11), cool: [10, 11], arid: [8, 9, 10] }, ['basil', 'carrot', 'onion'], ['bean']],
  eggplant: ['Eggplant', 'Solanaceae', 'bush', 0.6, 0.75, 0.9, 100, 'full', 'seedling', { tropical: R(3, 8), subtropical: R(8, 12), temperate: R(9, 11), cool: [10, 11], arid: [8, 9, 10] }, ['bean', 'basil'], ['potato']],
  potato: ['Potato', 'Solanaceae', 'bush', 0.3, 0.75, 0.6, 100, 'full', 'seed', { tropical: R(4, 7), subtropical: [2, 3, 7, 8, 9], temperate: R(8, 12), cool: R(9, 12), arid: [2, 3, 7, 8] }, ['bean', 'corn', 'cabbage'], ['tomato', 'pumpkin', 'cucumber', 'squash', 'melon', 'capsicum', 'eggplant']],
  pumpkin: ['Pumpkin', 'Cucurbitaceae', 'vine', 1.5, 2, 0.5, 110, 'full', 'both', { tropical: R(3, 8), subtropical: R(8, 1), temperate: R(9, 12), cool: [10, 11], arid: [8, 9, 10, 2] }, ['corn', 'bean', 'nasturtium'], ['potato']],
  squash: ['Zucchini / squash', 'Cucurbitaceae', 'bush', 0.9, 1.2, 0.7, 55, 'full', 'both', { tropical: R(3, 8), subtropical: R(8, 2), temperate: R(9, 1), cool: R(10, 12), arid: [8, 9, 10, 2, 3] }, ['corn', 'bean', 'nasturtium'], ['potato']],
  cucumber: ['Cucumber', 'Cucurbitaceae', 'vine', 0.4, 1, 1.8, 60, 'full', 'both', { tropical: R(3, 8), subtropical: R(8, 2), temperate: R(9, 1), cool: R(10, 12), arid: [8, 9, 10, 2, 3] }, ['bean', 'corn', 'lettuce'], ['potato', 'sage']],
  melon: ['Melon', 'Cucurbitaceae', 'vine', 1, 1.5, 0.4, 90, 'full', 'both', { tropical: R(5, 8), subtropical: R(8, 12), temperate: R(10, 12), cool: [11, 12], arid: [9, 10] }, ['corn', 'nasturtium'], ['potato']],
  bean: ['Beans', 'Fabaceae', 'upright', 0.15, 0.6, 1.8, 60, 'full', 'seed', { tropical: R(3, 8), subtropical: R(8, 3), temperate: R(9, 1), cool: R(10, 12), arid: [8, 9, 2, 3] }, ['corn', 'carrot', 'cucumber', 'squash', 'potato'], ['onion', 'garlic', 'leek']],
  pea: ['Peas', 'Fabaceae', 'upright', 0.08, 0.6, 1.2, 70, 'full', 'seed', { tropical: R(4, 7), subtropical: R(3, 7), temperate: R(3, 8), cool: [3, 4, 5, 6, 7, 8, 9, 10], arid: R(3, 6) }, ['carrot', 'lettuce', 'radish', 'corn'], ['onion', 'garlic', 'leek']],
  broadbean: ['Broad beans', 'Fabaceae', 'upright', 0.2, 0.5, 1.2, 120, 'full', 'seed', { tropical: [5, 6], subtropical: R(3, 6), temperate: R(3, 6), cool: R(3, 7), arid: R(3, 5) }, ['lettuce', 'spinach', 'potato'], ['onion', 'garlic']],
  corn: ['Sweet corn', 'Poaceae', 'grass', 0.3, 0.75, 2, 85, 'full', 'seed', { tropical: R(3, 8), subtropical: R(8, 1), temperate: R(9, 12), cool: R(10, 12), arid: [8, 9, 10] }, ['bean', 'pumpkin', 'cucumber', 'squash', 'pea'], ['tomato']],
  lettuce: ['Lettuce', 'Asteraceae', 'bush', 0.25, 0.3, 0.25, 55, 'part', 'both', { tropical: R(4, 8), subtropical: R(2, 10), temperate: R(2, 11), cool: R(8, 4), arid: R(3, 9) }, ['carrot', 'radish', 'beetroot', 'cucumber', 'strawberry'], []],
  spinach: ['Spinach', 'Amaranthaceae', 'bush', 0.15, 0.3, 0.25, 45, 'part', 'seed', { tropical: R(5, 7), subtropical: R(3, 8), temperate: R(3, 9), cool: [2, 3, 4, 8, 9, 10, 11], arid: R(3, 8) }, ['strawberry', 'broadbean', 'pea'], []],
  silverbeet: ['Silverbeet', 'Amaranthaceae', 'bush', 0.3, 0.45, 0.5, 60, 'part', 'both', { tropical: R(3, 9), subtropical: ALL, temperate: R(8, 4), cool: R(9, 2), arid: R(2, 10) }, ['bean', 'lettuce', 'onion'], []],
  beetroot: ['Beetroot', 'Amaranthaceae', 'root', 0.1, 0.3, 0.3, 65, 'full', 'seed', { tropical: R(4, 8), subtropical: R(2, 11), temperate: R(7, 3), cool: R(9, 2), arid: R(2, 10) }, ['lettuce', 'onion', 'cabbage'], ['bean']],
  carrot: ['Carrot', 'Apiaceae', 'root', 0.05, 0.25, 0.3, 75, 'full', 'seed', { tropical: R(4, 8), subtropical: R(2, 11), temperate: R(7, 3), cool: R(9, 2), arid: R(2, 10) }, ['lettuce', 'onion', 'tomato', 'pea', 'leek'], ['dill']],
  radish: ['Radish', 'Brassicaceae', 'root', 0.05, 0.2, 0.2, 28, 'part', 'seed', { tropical: R(4, 9), subtropical: ALL, temperate: ALL, cool: R(8, 4), arid: R(2, 10) }, ['lettuce', 'pea', 'carrot', 'cucumber'], []],
  onion: ['Onion', 'Amaryllidaceae', 'root', 0.1, 0.3, 0.5, 160, 'full', 'both', { tropical: R(4, 6), subtropical: R(3, 6), temperate: R(3, 7), cool: R(5, 8), arid: R(3, 6) }, ['carrot', 'beetroot', 'lettuce', 'cabbage', 'tomato'], ['bean', 'pea', 'broadbean']],
  leek: ['Leek', 'Amaryllidaceae', 'upright', 0.15, 0.3, 0.6, 120, 'full', 'seedling', { tropical: R(4, 6), subtropical: R(2, 7), temperate: R(2, 9), cool: R(9, 12), arid: R(3, 6) }, ['carrot', 'celery'], ['bean', 'pea']],
  garlic: ['Garlic', 'Amaryllidaceae', 'root', 0.15, 0.3, 0.5, 210, 'full', 'seed', { tropical: [4, 5], subtropical: R(3, 5), temperate: R(3, 6), cool: R(3, 6), arid: R(3, 5) }, ['tomato', 'carrot', 'beetroot', 'strawberry'], ['bean', 'pea', 'broadbean']],
  cabbage: ['Cabbage', 'Brassicaceae', 'bush', 0.5, 0.6, 0.4, 100, 'full', 'seedling', { tropical: R(4, 6), subtropical: R(2, 6), temperate: R(1, 6), cool: R(10, 3), arid: R(2, 5) }, ['onion', 'beetroot', 'celery', 'potato'], ['tomato', 'strawberry']],
  broccoli: ['Broccoli', 'Brassicaceae', 'bush', 0.5, 0.6, 0.7, 80, 'full', 'seedling', { tropical: R(4, 6), subtropical: R(2, 6), temperate: R(1, 6), cool: R(11, 3), arid: R(2, 5) }, ['onion', 'beetroot', 'celery', 'potato'], ['tomato', 'strawberry']],
  cauliflower: ['Cauliflower', 'Brassicaceae', 'bush', 0.6, 0.7, 0.6, 110, 'full', 'seedling', { tropical: R(4, 6), subtropical: R(2, 5), temperate: R(1, 5), cool: R(11, 2), arid: R(2, 4) }, ['onion', 'beetroot', 'celery'], ['tomato', 'strawberry']],
  kale: ['Kale', 'Brassicaceae', 'bush', 0.45, 0.6, 0.8, 60, 'full', 'both', { tropical: R(4, 7), subtropical: R(2, 8), temperate: R(1, 8), cool: R(9, 4), arid: R(2, 7) }, ['onion', 'beetroot', 'potato'], ['tomato', 'strawberry']],
  basil: ['Basil', 'Lamiaceae', 'bush', 0.25, 0.3, 0.5, 50, 'full', 'both', { tropical: R(9, 4), subtropical: R(9, 1), temperate: R(9, 12), cool: [11, 12], arid: [9, 10, 11] }, ['tomato', 'capsicum', 'chilli', 'eggplant'], []],
  parsley: ['Parsley', 'Apiaceae', 'bush', 0.25, 0.3, 0.4, 70, 'part', 'both', { tropical: R(4, 8), subtropical: R(2, 11), temperate: [2, 3, 4, 5, 8, 9, 10, 11], cool: R(9, 3), arid: R(3, 9) }, ['tomato', 'asparagus'], []],
  herb: ['Herbs', 'mixed', 'bush', 0.4, 0.4, 0.4, 60, 'full', 'seedling', { tropical: ALL, subtropical: ALL, temperate: ALL, cool: R(9, 4), arid: ALL }, [], []],
  sweetpotato: ['Sweet potato', 'Convolvulaceae', 'vine', 0.4, 1, 0.4, 120, 'full', 'seedling', { tropical: R(9, 2), subtropical: R(9, 12), temperate: R(10, 12), cool: [], arid: [10, 11] }, ['bean'], ['pumpkin']],
  strawberry: ['Strawberry', 'Rosaceae', 'bush', 0.3, 0.45, 0.25, 0, 'full', 'seedling', { tropical: R(3, 5), subtropical: R(3, 5), temperate: R(4, 6), cool: [4, 5, 6, 7, 8], arid: R(3, 5) }, ['lettuce', 'spinach', 'garlic', 'bean'], ['cabbage', 'broccoli', 'cauliflower', 'kale']],
  berry: ['Berry bush', 'mixed', 'bush', 1.2, 1.5, 1.5, 0, 'full', 'seedling', { tropical: R(4, 7), subtropical: R(5, 8), temperate: R(6, 8), cool: R(6, 8), arid: R(5, 7) }, [], []],
  fruittree: ['Fruit tree', 'mixed', 'tree', 4, 5, 4, 0, 'full', 'seedling', { tropical: R(4, 8), subtropical: R(5, 8), temperate: R(6, 8), cool: R(6, 8), arid: R(5, 7) }, [], []],
  other: ['Other', 'mixed', 'bush', 0.5, 0.5, 0.5, 90, 'full', 'both', { tropical: ALL, subtropical: ALL, temperate: ALL, cool: ALL, arid: ALL }, [], []],
};
/* ---------- perennials from the plant database (kit/plantdb.js): fruit and nut trees, berries, vines and perennial herbs ----------
   Their planting months come from when each is usually planted (bare-root in winter, or spring, or autumn), limited to the zones
   whose climate suits them.  For the frost and rainy-season packs they follow the general fruit tree, berry or herb rules (LIKE),
   and are left out where winters are likely colder than the plant survives (estimated from the zone's frost-free days). */
const SHAPE_OF = { tree: 'tree', palm: 'tree', clump: 'tree', bush: 'bush', vine: 'vine', herb: 'bush', groundcover: 'bush', grass: 'grass' };
const PLANT_AU = { winter: { tropical: [6, 7], subtropical: [6, 7, 8], temperate: [6, 7, 8], cool: [6, 7, 8], arid: [6, 7] },
  spring: { tropical: [10, 11, 12], subtropical: [9, 10, 11], temperate: [9, 10, 11], cool: [10, 11], arid: [9, 10] },
  autumn: { tropical: [4, 5], subtropical: [3, 4, 5], temperate: [3, 4, 5], cool: [3, 4], arid: [3, 4, 5] } };
export const LIKE = {};
export const FROM_DB = new Set();
for (const p of PLANTS) {
  if (GUIDES[p.id]) continue;
  if (p.sowLike && GUIDES[p.sowLike]) {   // an annual that follows another crop's sowing months for now
    const L = GUIDES[p.sowLike], shape = /parsnip|turnip/.test(p.id) ? 'root' : SHAPE_OF[p.form] || 'bush';
    GUIDES[p.id] = [p.name, p.fam, shape, p.sp[0], p.sp[1], p.h, p.days, p.sun === 'full' ? 'full' : 'part', L[8], L[9], [], []];
    LIKE[p.id] = p.sowLike; FROM_DB.add(p.id); continue;
  }
  if (p.life !== 'perennial') continue;
  const au = {};
  for (const z of ['tropical', 'subtropical', 'temperate', 'cool', 'arid']) au[z] = suitsZone(p, z) === 'no' ? [] : [...new Set([].concat(p.plant || 'spring').flatMap(k => PLANT_AU[k][z]))].sort((a, b) => a - b);
  const treeish = ['tree', 'palm', 'clump'].includes(p.form);
  GUIDES[p.id] = [p.name, p.fam, SHAPE_OF[p.form] || 'bush', p.s, Math.max(p.s, 0.3), p.h, 0, p.sun === 'full' ? 'full' : 'part', 'seedling', au, [], []];
  LIKE[p.id] = treeish ? 'fruittree' : (p.group === 'berry' || p.form === 'vine') ? 'berry' : 'herb';
  FROM_DB.add(p.id);
}
/* about the coldest winter night for a zone, from its frost-free days (a rough guide, used only to leave out plants that would not survive) */
const FFD = new Map();
// three curves: continental winters (North America, mainland Europe) are much colder for the same frost-free season than
// sea-moderated ones (Britain, Ireland, the Netherlands, New Zealand) or southern-hemisphere ones (Australia, South Africa)
const MIN_BY_FFD = { cont: [[100, -35], [145, -25], [180, -18], [225, -10], [260, -6], [300, -3], [340, -1], [365, 3]],
  sea: [[100, -16], [150, -12], [200, -8], [240, -5], [300, -2], [365, 2]],
  south: [[75, -14], [150, -9], [200, -6], [260, -4], [300, -2], [340, 0], [365, 3]] };
const CURVE = { gb: 'sea', ie: 'sea', nl: 'sea', nz: 'sea', au: 'south', za: 'south' };
const ZONE_MIN = { 'us-3-4': -37, 'us-5': -26, 'us-6-7': -18, 'us-8': -9, 'us-9': -4, 'us-10-11': 2 };   // United States rows are named by USDA hardiness zone, so use its range
export function zoneMinC(zone) {
  if (ZONE_MIN[zone] !== undefined) return ZONE_MIN[zone];
  const f = FFD.get(zone); if (f === undefined) return null;
  const T = MIN_BY_FFD[CURVE[String(zone).slice(0, 2)] || 'cont'];
  if (f <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (f <= T[i][0]) { const [a, ta] = T[i - 1], [b, tb] = T[i]; return ta + (tb - ta) * (f - a) / (b - a); }
  return T[T.length - 1][1];
}
// winter chill a zone usually gives, from the same estimate (deciduous fruit need enough cold to flower; low-chill varieties need less)
const chillOf = m => (m >= 2 ? 100 : m >= 0.5 ? 300 : m >= -1.5 ? 500 : m >= -4 ? 800 : 1500);
const hardyIn = (crop, zone) => { const p = FROM_DB.has(crop) && BY_ID[crop], m = p && zoneMinC(zone); if (!p || m === null) return true;
  return (p.minC === undefined || p.minC <= m) && (!p.chill || p.chill[0] <= chillOf(m)); };
const likeWrap = pk => ({ ...pk, months: (crop, zone) => (hardyIn(crop, zone) ? pk.months(LIKE[crop] || crop, zone) : []) });
/* ---------- location packs ----------
   A planting guide belongs to one location: a country and a climate zone in it.  Only the member's own location is used,
   and there is no default: with no location set, the guide features are not available.  Today the only pack is
   Australia (the sowing months above); others are added as data packs (see the research doc). */
export const AU_ZONES = [['tropical', 'Tropical'], ['subtropical', 'Subtropical'], ['temperate', 'Temperate'], ['cool', 'Cool'], ['arid', 'Arid / inland']];
const auLegacy = (crop, zone) => (GUIDES[crop] || GUIDES.other)[9][zone] || [];
export const PACKS = { AU: { name: 'Australia', zones: AU_ZONES, months: auLegacy } };
/* the frost-based packs (frost.js): the months are worked out from each zone's typical last frost and frost-free days */
for (const cc of Object.keys(ZONES)) { for (const z of ZONES[cc]) FFD.set(z[0], z[3]); PACKS[cc] = likeWrap(frostPack(NAMES[cc], ZONES[cc], crop => (GUIDES[crop] || GUIDES.other)[6])); }
for (const cc of Object.keys(REGIONS)) for (const z of REGIONS[cc]) FFD.set(z[0], z[3]);
/* Australia: 41 state and region rows worked out from frost dates, like the other countries. The tropical north has wet and dry
   seasons instead of frost, so those three rows use the hand-written tropical guide. The five older whole-climate choices stay in the list
   (less exact) so plans saved earlier keep working. */
const AU_TROPICAL = new Set(['au-qld-north', 'au-wa-north', 'au-nt-top']);
const auFrost = likeWrap(frostPack('Australia', REGIONS.AU.filter(z => !AU_TROPICAL.has(z[0])), crop => (GUIDES[crop] || GUIDES.other)[6]));
PACKS.AU = {
  name: 'Australia', frost: true,
  zones: [...REGIONS.AU.map(([c, l, , , o]) => [c, l, (o && o.group) || '']), ...AU_ZONES.map(([c, l]) => [c, l, 'Whole-climate choices (less exact)'])],
  months: (crop, zone) => (AU_TROPICAL.has(zone) ? auLegacy(crop, 'tropical') : AU_ZONES.some(z => z[0] === zone) ? auLegacy(crop, zone) : auFrost.months(crop, zone)),
};
/* the monsoon and rainy-season packs (seasons.js): the months are the member's own zone's sowing seasons for each crop */
PACKS.IN = likeWrap(IN_PACK); PACKS.PH = likeWrap(PH_PACK);
export const COUNTRIES = [['AU', 'Australia'], ['NZ', 'New Zealand'], ['GB', 'United Kingdom'], ['IE', 'Ireland'], ['US', 'United States'], ['CA', 'Canada'], ['ZA', 'South Africa'], ['DE', 'Germany'], ['FR', 'France'], ['ES', 'Spain'], ['NL', 'Netherlands'], ['IN', 'India'], ['PH', 'Philippines']];
export const MESSAGE = 'This function can not be used without a location.';
/* Is there a guide for this location? */
export const hasGuide = (country, zone) => !!(PACKS[country] && PACKS[country].zones.some(z => z[0] === zone));
/* A first guess at the zone inside Australia from latitude (the member still chooses). */
export const zoneFromLat = lat => { const a = Math.abs(lat); return a < 20 ? 'tropical' : a < 29 ? 'subtropical' : a < 36 ? 'temperate' : 'cool'; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/* The months to sow or plant at this location, or null when there is no guide for it. */
export function sowMonths(crop, country, zone) { return hasGuide(country, zone) ? PACKS[country].months(crop, zone) : null; }
/* "Sep to Dec" style text for a month list (runs that wrap past December are joined). */
export function monthsText(ms) {
  if (!ms) return MESSAGE;
  if (!ms.length) return 'not usually grown here';
  if (ms.length === 12) return 'all year';
  const set = new Set(ms), runs = [];
  const start = ms.find(m => !set.has(((m + 10) % 12) + 1)) || ms[0];
  for (let i = 0, m = start; i < 12; i++, m = (m % 12) + 1) {
    if (set.has(m) && (!runs.length || runs[runs.length - 1].end !== ((m + 10) % 12) + 1)) runs.push({ start: m, end: m });
    else if (set.has(m)) runs[runs.length - 1].end = m;
  }
  return runs.map(r => (r.start === r.end ? MONTHS[r.start - 1] : MONTHS[r.start - 1] + ' to ' + MONTHS[r.end - 1])).join(', ');
}
/* true / false, or null when there is no guide for the location */
export const inSeason = (crop, country, zone, iso) => { const m = sowMonths(crop, country, zone); return m ? m.includes(+iso.slice(5, 7)) : null; };

/* ---------- seed saving: what crosses with what, and how far apart to keep them ----------
   [cross group, isolation distance in metres for seed true to type in a home garden, how it is pollinated].
   Crops in the same group can cross (broccoli, cabbage, cauliflower and kale are all one species; so are beetroot and
   silverbeet, and capsicum and chilli).  Pumpkin and zucchini cross only when they are the same species, so the warning
   says "may".  Distances are general seed-saving guidance and vary with insects, wind and barriers. */
export const ISOLATION = {
  tomato: ['tomato', 3, 'self'], capsicum: ['capsicum', 15, 'insect'], chilli: ['capsicum', 15, 'insect'], eggplant: ['eggplant', 15, 'insect'],
  potato: ['potato', 0, 'self'], pumpkin: ['cucurbita', 400, 'insect'], squash: ['cucurbita', 400, 'insect'], cucumber: ['cucumber', 400, 'insect'],
  melon: ['melon', 400, 'insect'], bean: ['bean', 3, 'self'], pea: ['pea', 3, 'self'], broadbean: ['broadbean', 400, 'insect'],
  corn: ['corn', 250, 'wind'], lettuce: ['lettuce', 3, 'self'], spinach: ['spinach', 800, 'wind'], silverbeet: ['beta', 800, 'wind'],
  beetroot: ['beta', 800, 'wind'], carrot: ['carrot', 800, 'insect'], radish: ['radish', 400, 'insect'], onion: ['onion', 400, 'insect'],
  leek: ['leek', 400, 'insect'], garlic: ['garlic', 0, 'none'], cabbage: ['brassica', 400, 'insect'], broccoli: ['brassica', 400, 'insect'],
  cauliflower: ['brassica', 400, 'insect'], kale: ['brassica', 400, 'insect'], basil: ['basil', 50, 'insect'], parsley: ['parsley', 400, 'insect'],
  sweetpotato: ['sweetpotato', 0, 'none'], strawberry: ['strawberry', 0, 'none'],
};
