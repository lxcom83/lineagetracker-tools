/* Demo plans, built here so they work offline with nothing to download. Members share their own plans as files. */
import { FORMAT, VERSION, cleanPlan } from './model.js';
import { farm } from './demo-farm.js';
import { freeSpots, TRAY_PRESETS } from './indoor.js';

const bed = (id, name, x, y, w, h, extra = {}) => ({ id, kind: 'bed', folder: 'beds', name, x, y, w, h, rot: 0, raised: 0.3, ...extra });
const plant = (id, name, crop, x, y, sow, harvest, extra = {}) => ({ id, kind: 'plant', folder: 'planting', name, crop, x, y, sow, harvest, ...extra });

function backyard() {
  // one tomato bed, built once as a block and placed twice
  const tomatoBed = [bed('tb', 'Raised bed 2.4 x 1.2', 1.2, 0.6, 2.4, 1.2)];
  for (let i = 0; i < 4; i++) tomatoBed.push(plant('tp' + i, 'Tomato', 'tomato', 0.3 + i * 0.6, 0.6, '2026-10-10', '2027-03-15'));
  return {
    format: FORMAT, version: VERSION, name: 'Demo: backyard veg patch',
    site: { w: 16, h: 12, north: 0, lat: -33.9, lon: 151.2, grid: 0.5, country: 'AU', zone: 'temperate' }, date: '2026-12-01',
    blocks: { tomato: { name: 'Tomato bed', items: tomatoBed } },
    items: [
      { id: 'lawn', kind: 'area', folder: 'beds', name: 'Lawn', x: 8, y: 9.5, w: 16, h: 5, rot: 0, fill: '#D7E6C3' },
      { id: 'fence', kind: 'fence', folder: 'structures', name: 'Back fence', pts: [[0, 0], [16, 0], [16, 12]], height: 1.8 },
      { id: 'path', kind: 'path', folder: 'structures', name: 'Gravel path', pts: [[8, 7], [8, 1]], width: 0.9 },
      { id: 'c1', kind: 'block', folder: 'beds', name: 'Tomato bed', def: 'tomato', x: 1, y: 1.5, rot: 0 },
      { id: 'c2', kind: 'block', folder: 'beds', name: 'Tomato bed', def: 'tomato', x: 1, y: 4, rot: 0 },
      bed('b3', 'Pumpkin patch', 12.5, 3, 4, 3, { raised: 0 }),
      plant('pk1', 'Pumpkin', 'pumpkin', 11.5, 3, '2026-11-01', '2027-03-30', { variety: 'Kynes’ Dream' }),
      plant('pk2', 'Pumpkin', 'pumpkin', 13.5, 3, '2026-11-01', '2027-03-30', { variety: 'Arrakis Black' }),
      bed('b4', 'Garlic bed', 4.5, 6.2, 2.4, 1, {}),
      ...[0, 1, 2, 3, 4, 5].map(i => plant('g' + i, 'Garlic', 'garlic', 3.5 + i * 0.4, 6.2, '2027-04-01', '2027-11-20')),
      { id: 'tank', kind: 'tank', folder: 'water', name: 'Rain tank 2000 L', x: 15, y: 6.5, w: 1.4, h: 1.4, rot: 0 },
      { id: 'drip', kind: 'pipe', folder: 'water', name: 'Drip line', pts: [[14.3, 6.5], [9, 6.5], [9, 2]] },
      { id: 'bench', kind: 'bench', folder: 'structures', name: 'Seed-raising bench', x: 13, y: 0.6, w: 2, h: 0.6, rot: 0 },
      { id: 'tree', kind: 'plant', folder: 'planting', name: 'Lemon tree', crop: 'fruittree', x: 2, y: 9.5, spread: 3, height: 3 },
      { id: 'n1', kind: 'note', folder: 'ground', name: 'Note', x: 9.2, y: 10.8, text: 'Morning sun here' },
    ],
  };
}
/* an indoor seedling room: a 4-tier shelf of microgreens and tomato seedlings, a small shelf, and a grow tent. Invented names only. */
function seedling() {
  const items = [
    { id: 'room1', kind: 'room', folder: 'indoor', name: 'Propagation room', x: 3.2, y: 2.6, w: 5, h: 4, rot: 0, style: 'room', ceilH: 2.4, door: { side: 's', pos: 0.8, w: 0.9 } },
    { id: 'shA', kind: 'shelf', folder: 'indoor', name: 'Shelf A', x: 2.2, y: 1.1, w: 1.2, h: 0.45, rot: 0, tiers: 4, tierGap: 0.4, base: 0.15 },
    { id: 'shB', kind: 'shelf', folder: 'indoor', name: 'Shelf B', x: 4.9, y: 1.1, w: 0.9, h: 0.35, rot: 0, tiers: 3, tierGap: 0.4, base: 0.15 },
    { id: 'tent1', kind: 'room', folder: 'indoor', name: 'Seed-starting tent', x: 7.9, y: 1.9, w: 1, h: 1, rot: 0, style: 'tent', ceilH: 1.6, door: { side: 's', pos: 0.5, w: 0.6 } },
    { id: 'shC', kind: 'shelf', folder: 'indoor', name: 'Tent shelf', x: 7.9, y: 1.9, w: 0.9, h: 0.4, rot: 0, tiers: 2, tierGap: 0.5, base: 0.1 },
  ];
  const sh = id => items.find(i => i.id === id), placed = [];
  const put = (shelfId, tier, kind, crop, sow, extra = {}) => {
    const s = sh(shelfId), pr = TRAY_PRESETS[kind], spots = freeSpots(s, tier, pr.w, pr.h, placed);
    if (!spots.length) return;
    const t = { id: 't' + (placed.length + 1), kind: 'tray', folder: 'indoor', name: 'Tray ' + (placed.length + 1), kind2: kind, x: spots[0].x, y: spots[0].y, w: pr.w, h: pr.h, rot: 0, shelf: shelfId, tier, crop, sow, ...extra };
    placed.push(t); items.push(t);
  };
  put('shA', 1, 'flat1020', 'mg_radish', '2026-11-02'); put('shA', 1, 'flat1020', 'mg_radish', '2026-11-05');
  put('shA', 2, 'flat1020', 'mg_pea', '2026-10-30'); put('shA', 2, 'flat1020', 'mg_sunflower', '2026-11-03');
  put('shA', 3, 'cell72', 's_tomato', '2026-10-20'); put('shA', 3, 'cell72', 's_pepper', '2026-10-20');
  put('shA', 4, 'cell128', 's_lettuce', '2026-11-01'); put('shA', 4, 'cell72', 's_basil', '2026-10-27');
  put('shB', 1, 'half1010', 'mg_arugula', '2026-11-04'); put('shB', 1, 'half1010', 'mg_broccoli', '2026-11-04'); put('shB', 1, 'half1010');
  put('shC', 1, 'prop', 's_cucurbit', '2026-11-06'); put('shC', 2, 'half1010', 'mg_basil', '2026-10-25');
  const gear = (item, x, y, extra = {}) => items.push({ id: 'g' + (items.filter(i => i.kind === 'gear').length + 1), kind: 'gear', folder: 'indoor', item, x, y, rot: 0, ...extra });
  for (let k = 1; k <= 4; k++) gear('led_strip', 2.2, 1.1, { shelf: 'shA', tier: k, above: k >= 3 ? 0.12 : 0.15, name: 'Light, shelf A tier ' + k });
  gear('led_bar', 4.9, 1.1, { shelf: 'shB', tier: 1, above: 0.15, name: 'Light, shelf B' });
  gear('led_panel_s', 7.9, 1.9, { shelf: 'shC', tier: 2, above: 0.25, name: 'Tent light' });
  const prop = placed.find(t => t.kind2 === 'prop'); if (prop) gear('heat_mat', prop.x, prop.y, { shelf: 'shC', tier: 1, name: 'Heat mat under propagator' });
  gear('clip_fan', 3.6, 1.0, { name: 'Room fan' }); gear('humidifier', 1.0, 3.8, { name: 'Humidifier' }); gear('power_board', 0.9, 1.0, { name: 'Power board' }); gear('timer', 1.0, 1.5, { name: 'Light timer' });   // names of their own: three items all called 'Equipment' made the tree and the 'Link to' list guesswork
  items.push({ id: 'n1', kind: 'note', folder: 'ground', name: 'Note', x: 3.2, y: 4.9, text: 'Drag the date slider to watch the batches grow and the space free up. Click a tray to log what really happened.' });
  return { format: FORMAT, version: VERSION, name: 'Demo: seedling room', site: { w: 10, h: 6, north: 0, lat: -33.9, lon: 151.2, grid: 0.5, country: 'AU', zone: 'temperate' }, date: '2026-11-08', items };
}
/* a hydro room: an NFT bench of lettuce, a DWC tub of basil, a Kratky tray of herbs, an ebb-and-flow table, a seedling shelf, with the pumps, reservoir and links drawn. Invented names only. */
function hydroRoom() {
  const items = [
    { id: 'room1', kind: 'room', folder: 'indoor', name: 'Hydro room', x: 4, y: 2.8, w: 8, h: 5.4, rot: 0, style: 'room', ceilH: 2.6, door: { side: 's', pos: 0.85, w: 0.9 } },
    { id: 'sh1', kind: 'shelf', folder: 'indoor', name: 'Seedling shelf', x: 1.3, y: 0.8, w: 1.2, h: 0.45, rot: 0, tiers: 3, tierGap: 0.4, base: 0.15 },
    { id: 'nft', kind: 'hydro', folder: 'indoor', name: 'Lettuce bench', type: 'nft', x: 5.2, y: 1.6, w: 2.4, h: 1.2, rot: 0, channels: 6, spacing: 0.2, slope: 60, flow: 0.25, drain: 'recirculate', crop: 'h_lettuce', sow: '2026-10-20' },
    { id: 'dwc', kind: 'hydro', folder: 'indoor', name: 'Basil tub', type: 'dwc', x: 5.2, y: 3.9, w: 1.2, h: 0.6, rot: 0, spacing: 0.2, volume: 60, drain: 'recirculate', crop: 'h_basil', sow: '2026-10-12' },
    { id: 'kr', kind: 'hydro', folder: 'indoor', name: 'Herb jars', type: 'kratky', x: 2.2, y: 3.9, w: 0.9, h: 0.3, rot: 0, spacing: 0.15, volume: 12, drain: 'recirculate', crop: 'h_parsley', sow: '2026-10-25' },
    { id: 'ebb', kind: 'hydro', folder: 'indoor', name: 'Flood table', type: 'ebb', x: 2.2, y: 2.4, w: 0.8, h: 0.6, rot: 0, spacing: 0.2, drain: 'recirculate' },
  ];
  const gear = (id, item, x, y, extra = {}) => items.push({ id, kind: 'gear', folder: 'indoor', item, x, y, rot: 0, ...extra });
  gear('res1', 'reservoir100', 7.4, 1.2, { name: 'Bench reservoir' }); gear('pump1', 'water_pump', 7.4, 1.9, { watts: 25, name: 'Bench pump' });
  gear('air1', 'air_pump', 7.3, 3.9, { name: 'Tub air pump' }); gear('board1', 'power_board', 7.3, 3.2, { name: 'Power board' });
  gear('res2', 'reservoir50', 3.0, 2.4, { name: 'Table reservoir' }); gear('pump2', 'water_pump', 3.0, 3.0, { watts: 20, name: 'Table pump' }); gear('timer1', 'timer', 3.6, 3.0, { name: 'Flood timer' });
  for (let k = 1; k <= 3; k++) gear('l' + k, 'led_strip', 1.3, 0.8, { shelf: 'sh1', tier: k, above: 0.15, name: 'Light, seedling tier ' + k });
  const pr = TRAY_PRESETS.cell128, put = (tier, crop, sow, n) => { const sp = freeSpots(items.find(i => i.id === 'sh1'), tier, pr.w, pr.h, items.filter(i => i.kind === 'tray'), 1)[0]; if (sp) items.push({ id: 'tr' + n, kind: 'tray', folder: 'indoor', name: 'Plugs ' + n, kind2: 'cell128', x: sp.x, y: sp.y, w: pr.w, h: pr.h, rot: 0, shelf: 'sh1', tier, crop, sow }); };
  put(1, 's_lettuce', '2026-11-03', 1); put(2, 's_basil', '2026-10-31', 2);
  const link = (id, from, to, medium) => items.push({ id, kind: 'conn', folder: 'indoor', name: 'Link', from, to, medium });
  link('c1', 'nft', 'res1', 'water'); link('c2', 'res1', 'pump1', 'water'); link('c3', 'board1', 'pump1', 'power'); link('c4', 'air1', 'dwc', 'air'); link('c5', 'board1', 'air1', 'power');
  link('c6', 'ebb', 'res2', 'water'); link('c7', 'res2', 'pump2', 'water'); link('c8', 'timer1', 'pump2', 'control');
  items.push({ id: 'n1', kind: 'note', folder: 'ground', name: 'Note', x: 4, y: 6.2, text: 'Select a system for its warnings and links. Drag the date to watch the lettuce grow. The flood table has no power link yet, on purpose.' });
  return { format: FORMAT, version: VERSION, name: 'Demo: hydro room', site: { w: 10, h: 6.5, north: 0, lat: -33.9, lon: 151.2, grid: 0.5, country: 'AU', zone: 'temperate' }, date: '2026-11-08', items };
}
export const DEMOS = [{ key: 'backyard', name: 'Backyard veg patch', note: '16 x 12 m: raised beds as blocks, pumpkins, garlic, tank and drip line', make: () => cleanPlan(backyard()) },
  { key: 'farm', name: 'Showcase farm (50 acres)', note: '500 x 420 m: rolling ground, dam and swales, orchards, vineyard, crop fields, house, sheds, glasshouses, kitchen garden, food forest', make: () => cleanPlan(farm()) },
  { key: 'seedling', name: 'Seedling room and tent', note: '10 x 6 m: a room with a 4-tier shelf of microgreens and seedlings, a small shelf and a grow tent. Drag the date to watch batches grow', make: () => cleanPlan(seedling()) },
  { key: 'hydro', name: 'Hydro room', note: '10 x 6.5 m: an NFT lettuce bench, a basil tub, herb jars and a flood table with reservoirs, pumps and links drawn, plus a seedling shelf', make: () => cleanPlan(hydroRoom()) }];
