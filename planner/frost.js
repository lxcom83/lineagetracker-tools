/* Planting-guide packs for places where the season is set by frost (north America, Europe, New Zealand).

   Australian packs are written out as month lists in guides.js.  Here the months are WORKED OUT from two typical dates
   for each zone: the average last spring frost and the number of frost-free days (so the first autumn frost follows).
   Each crop has a short rule in weeks from those dates, in the style of the usual extension-service charts:
     tender crops   go out one or more weeks after the last frost and must finish before the first autumn frost;
     cool crops     go in weeks before the last frost, and again in late summer so they finish before hard frost;
     garlic, broad beans, fruit trees and berries follow their own rules.
   Where winters are mild ("winter": true) cool crops can also be sown through winter.  "hot" lists months too hot for
   crops that dislike heat; "late" is extra weeks tender crops wait after the last frost (cool, slow-warming springs, such as the
   British Isles and the New Zealand coast, where soil stays cold after the frosts end).  This is a general guide: local conditions vary, and the planner says "check your local guide".
   Sources used to set the rules and to check the results: Farmers' Almanac seed-starting chart (weeks from last frost),
   Ontario government climate zones and planting dates, Sonairte (Ireland) year-round sowing guide, RHS sowing advice,
   and a New Zealand planting calendar by region.  The zone dates are typical values, for the owner to review. */

import { REGIONS } from './frost-regions.js';
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
const doy = (m, d) => CUM[m - 1] + d - 1;
const monthOf = d => { const x = ((Math.round(d) % 365) + 365) % 365; let m = 0; while (CUM[m + 1] <= x) m++; return m + 1; };
const W = 7;

/* kind T: tender.  a = weeks after last frost to start; buf = days of spare time before first frost.
   kind C: cool.  s = weeks before last frost to start; e = weeks after it to stop; fall = also sow in late summer;
           g = weeks past "just in time" that the autumn sowing can still be made (frost-hardy crops).
   kind special: handled below by name. */
const RULES = {
  tomato: { k: 'T', a: 1, buf: 14, heat: 1 }, capsicum: { k: 'T', a: 2, buf: 14 }, chilli: { k: 'T', a: 2, buf: 14 },
  eggplant: { k: 'T', a: 2, buf: 14 }, pumpkin: { k: 'T', a: 1, buf: 14 }, squash: { k: 'T', a: 0, buf: 14 },
  cucumber: { k: 'T', a: 1, buf: 14 }, melon: { k: 'T', a: 2, buf: 14 }, bean: { k: 'T', a: 0, buf: 14 },
  corn: { k: 'T', a: 1, buf: 14 }, basil: { k: 'T', a: 1, buf: 21 }, sweetpotato: { k: 'T', a: 3, buf: 14 }, other: { k: 'T', a: 0, buf: 14 },
  pea: { k: 'C', s: 6, e: 4, fall: 1, g: 0, heat: 1 }, lettuce: { k: 'C', s: 5, e: 6, fall: 1, g: 3, heat: 1 },
  spinach: { k: 'C', s: 5, e: 4, fall: 1, g: 4, heat: 1 }, radish: { k: 'C', s: 5, e: 8, fall: 1, g: 4, heat: 1 },
  silverbeet: { k: 'C', s: 2, e: 14, fall: 1, g: 2 }, beetroot: { k: 'C', s: 3, e: 10, fall: 1, g: 0 },
  carrot: { k: 'C', s: 3, e: 10, fall: 0, g: 0 }, kale: { k: 'C', s: 5, e: 8, fall: 1, g: 5, heat: 1 },
  cabbage: { k: 'C', s: 4, e: 6, fall: 1, g: 0, heat: 1 }, broccoli: { k: 'C', s: 4, e: 6, fall: 1, g: 0, heat: 1 },
  cauliflower: { k: 'C', s: 4, e: 5, fall: 1, g: 0, heat: 1 }, parsley: { k: 'C', s: 2, e: 12, fall: 1, g: 0 },
  onion: { k: 'C', s: 3, e: 3, fall: 0, g: 0 }, leek: { k: 'C', s: 2, e: 8, fall: 0, g: 0 },
  potato: { k: 'C', s: 3, e: 6, fall: 0, g: 0 }, herb: { k: 'C', s: 0, e: 10, fall: 0, g: 0 },
};

/* windows are [from, to] in days; the first autumn frost is last frost + frost-free days, so they can run past December */
function windows(crop, days, z) {
  const s0 = doy(z.lsf[0], z.lsf[1]), F = s0 + z.free, r = RULES[crop] || RULES.other, out = [];
  if (crop === 'garlic') {
    out.push([F - 3 * W, F + 3 * W]); if (z.winter) out.push([s0 - 8 * W, s0 - 2 * W]);
  } else if (crop === 'broadbean') {
    out.push([s0 - 8 * W, s0 + 4 * W]); if (z.winter) out.push([F, F + 5 * W]);
  } else if (crop === 'strawberry') {
    out.push([s0 - 4 * W, s0 + 4 * W], [F - 8 * W, F - 2 * W]);
  } else if (crop === 'berry' || crop === 'fruittree') {
    out.push([F, s0 - W + 365]);   // dormant season: from the first frost to just before the last
  } else if (r.k === 'T') {
    const a = s0 + (r.a + (z.late || 0)) * W, b = Math.max(F - days - r.buf, a + 2 * W);
    out.push([a, b]);
  } else {
    out.push([s0 - r.s * W, s0 + r.e * W]);
    if (r.fall) out.push([F - days - 3 * W, F - days + r.g * W]);
    if (z.winter && r.fall) out.push([F - days - 3 * W, s0 - r.s * W + 365]);
  }
  return out;
}
function monthsFor(crop, days, z) {
  const count = Array(13).fill(0);
  for (const [a, b] of windows(crop, days, z)) for (let d = Math.ceil(a); d <= b; d++) count[monthOf(d)]++;
  const hot = (z.hot || []);
  const heatSensitive = (RULES[crop] || {}).heat;
  const out = [];
  for (let m = 1; m <= 12; m++) if (count[m] >= 8 && !(heatSensitive && hot.includes(m))) out.push(m);
  return out;
}
/* zones: [[code, label, [lastFrostMonth, lastFrostDay], frostFreeDays, {winter, hot}], ...]
   daysOf(crop) gives the days to first harvest from the main guide (0 for perennials). */
export function frostPack(name, zones, daysOf) {
  const byCode = Object.fromEntries(zones.map(([c, l, lsf, free, o]) => [c, { lsf, free, ...(o || {}) }]));
  const cache = {};
  return {
    name, zones: zones.map(([c, l, , , o]) => [c, l, (o && o.group) || '']), frost: true,
    months: (crop, zone) => { const k = crop + '|' + zone; if (!byCode[zone]) return []; return cache[k] || (cache[k] = monthsFor(crop, daysOf(crop), byCode[zone])); },
  };
}

/* ---------- zone dates: typical last spring frost and number of frost-free days ---------- */
export const ZONES = {
  US: [
    ['us-3-4', 'Zones 3 to 4: very cold (last frost early June)', [6, 1], 100],
    ['us-5', 'Zone 5: cold (last frost mid May)', [5, 10], 145],
    ['us-6-7', 'Zones 6 to 7: cool temperate (last frost mid April to early May)', [4, 25], 180],
    ['us-8', 'Zone 8: mild (last frost late March)', [3, 25], 225, { winter: 1, late: 2 }],
    ['us-9', 'Zone 9: warm (last frost February)', [2, 10], 290, { winter: 1, hot: [7, 8] }],
    ['us-10-11', 'Zones 10 to 11: frost-free (Florida, southern California, Hawaii)', [1, 25], 330, { winter: 1, hot: [6, 7, 8, 9] }],
  ],
  CA: [
    ['ca-coast', 'Pacific coast (Vancouver, Victoria)', [3, 25], 235, { winter: 1, late: 4 }],
    ['ca-south', 'Southern Ontario and southern Quebec', [5, 8], 150],
    ['ca-east', 'Ottawa, Montreal and the Atlantic provinces', [5, 15], 135],
    ['ca-prairies', 'Prairies (Calgary, Edmonton, Winnipeg)', [5, 22], 110],
    ['ca-north', 'Northern, mountain and short-season areas', [6, 2], 85],
  ],
  GB: [
    ['gb-south', 'South and south-west England, coasts', [4, 1], 225, { late: 6 }],
    ['gb-central', 'Midlands, east England and Wales', [4, 25], 185, { late: 3 }],
    ['gb-north', 'Northern England and lowland Scotland', [5, 8], 160, { late: 2 }],
    ['gb-upland', 'Uplands and the Highlands', [5, 25], 120, { late: 1 }],
  ],
  IE: [
    ['ie-coast', 'Coastal south and west', [4, 5], 220, { late: 4 }],
    ['ie-inland', 'Midlands and east (hard frosts can come in mid May)', [4, 25], 175, { late: 2 }],
  ],
  NZ: [
    ['nz-north', 'Northland and Auckland', [8, 20], 280, { winter: 1, late: 5 }],
    ['nz-central', 'Waikato, Bay of Plenty and Wellington', [9, 5], 250, { winter: 1, late: 7 }],
    ['nz-south', 'Canterbury, Otago and Southland', [10, 10], 190, { late: 2 }],
    ['nz-mountain', 'Cool mountain and high country', [11, 5], 140, { late: 1 }],
  ],
  DE: [
    ['de-mild', 'Mild: Rhine, Mosel and the south-west', [4, 20], 190, { late: 2 }],
    ['de-central', 'Central and northern Germany (after the Ice Saints, mid May)', [5, 12], 160],
    ['de-cool', 'Alpine foothills, uplands and the east', [5, 15], 140],
  ],
  FR: [
    ['fr-ocean', 'Atlantic coast and Brittany', [4, 1], 225, { late: 5 }],
    ['fr-north', 'Paris basin, north and east', [4, 25], 185],
    ['fr-med', 'Mediterranean south', [3, 1], 270, { winter: 1, hot: [7, 8] }],
    ['fr-mountain', 'Mountains and Massif Central', [5, 15], 140],
  ],
  ES: [
    ['es-atlantic', 'North Atlantic coast (Galicia to the Basque Country)', [3, 15], 250, { winter: 1, late: 3 }],
    ['es-interior', 'Interior plateau and the north-east valleys', [4, 20], 190, { hot: [7, 8] }],
    ['es-med', 'Mediterranean, southern and island climates', [1, 25], 330, { winter: 1, hot: [7, 8] }],
  ],
  NL: [
    ['nl-coast', 'Coast and islands', [4, 20], 200, { late: 3 }],
    ['nl-inland', 'Inland', [5, 5], 170, { late: 2 }],
  ],
};
/* every country lists its states or regions first, then the broader climate bands as a fallback */
for (const cc of Object.keys(ZONES)) ZONES[cc] = [...(REGIONS[cc] || []), ...ZONES[cc].map(([c, l, lsf, free, o]) => [c, l, lsf, free, { ...(o || {}), group: 'By climate band' }])];
export const NAMES = { US: 'United States', CA: 'Canada', GB: 'United Kingdom', IE: 'Ireland', NZ: 'New Zealand', DE: 'Germany', FR: 'France', NL: 'Netherlands', ES: 'Spain' };
