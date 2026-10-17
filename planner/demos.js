/* Demo plans, built here so they work offline with nothing to download. Members share their own plans as files. */
import { FORMAT, VERSION, cleanPlan } from './model.js';

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
export const DEMOS = [{ key: 'backyard', name: 'Backyard veg patch', note: '16 x 12 m: raised beds as blocks, pumpkins, garlic, tank and drip line', make: () => cleanPlan(backyard()) }];
