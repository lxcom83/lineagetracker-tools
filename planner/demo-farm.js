/* Showcase plan: "Larkspur Ridge Farm", an invented 50 acre mixed farm that uses everything the planner can do at scale.
   500 m x 420 m. Ground heights (a slope to the south, a hill, a dam, swales), a house with verandah and patio, machinery and packing sheds,
   glasshouses, tanks on pads, orchards, an olive grove on the hill, a vineyard on trellis, crop fields as rules (about 108,000 plants), a kitchen
   garden of raised and in-ground beds, a food forest, fences, a retaining wall, paths, surfaces and jobs on the calendar.
   Invented place and name; nothing here is a real farm, person or address.  Built in code (131 items; the plants come from rules). */
import * as TR from './terrain.js';
import { FORMAT, VERSION } from './model.js';

const W = 500, H = 420;
const bed = (id, name, x, y, w, h, extra = {}) => ({ id, kind: 'bed', folder: 'beds', name, x, y, w, h, rot: 0, raised: 0, ...extra });
const area = (id, name, x, y, w, h, fill, extra = {}) => ({ id, kind: 'area', folder: 'beds', name, x, y, w, h, rot: 0, fill, ...extra });
const plant = (id, name, crop, x, y, extra = {}) => ({ id, kind: 'plant', folder: 'planting', name, crop, x, y, ...extra });
const rows = (id, name, crop, x, y, w, h, rowSpacing, plantSpacing, extra = {}) => ({ id, kind: 'rows', folder: 'planting', name, crop, x, y, w, h, rot: 0, rowSpacing, plantSpacing, ...extra });
const line = (id, kind, name, pts, extra = {}) => ({ id, kind, folder: kind === 'pipe' ? 'water' : 'structures', name, pts, ...extra });
const note = (id, text, x, y) => ({ id, kind: 'note', folder: 'ground', name: 'Note', x, y, text });
const task = (id, text, x, y, date, every) => ({ id, kind: 'task', folder: 'ground', name: 'Job', x, y, text, date, every, remind: 7 });

function ground() {
  const g = TR.makeGrid(W, H, 2, 0);
  TR.tiltSite(g, W, H, 14, 180, 0);                 // the whole farm falls 14 m toward the south road
  TR.dome(g, 130, 100, 210, 8, 0.2);                 // the hill in the north-west
  TR.dome(g, 400, 330, 72, -3.5, 0.5);               // the dam
  TR.swale(g, [[270, 122], [406, 122]], 5, 0.6, true);   // on contour, below the apples
  TR.swale(g, [[270, 268], [406, 268]], 5, 0.6, true);   // below the vineyard
  TR.swale(g, [[22, 236], [246, 236]], 5, 0.6, true);    // below the crop fields
  for (const [cx, cy, w, h] of [[110, 328, 24, 15], [250, 310, 30, 18], [300, 315, 24, 16], [339, 345, 26, 34], [247, 286, 24, 8]]) TR.levelBox(g, cx, cy, w, h, 0, TR.heightAt(g, cx, cy), 2);   // pads under the house and sheds
  return TR.packGrid(g);
}

export function farm() {
  const items = [], blocks = {};
  const add = (...x) => items.push(...x);
  // ---- raised bed blocks (one bed with four plants, kept once and placed many times) ----
  const raised = (key, name, crop, label) => { blocks[key] = { name, items: [bed(key + '_b', name, 1.2, 0.6, 2.4, 1.2, { raised: 0.35 }), ...[0, 1, 2, 3].map(i => plant(key + '_p' + i, label, crop, 0.3 + i * 0.6, 0.6, { sow: '2026-10-05', harvest: '2027-02-20' }))] }; };
  raised('rbTomato', 'Raised bed: tomatoes', 'tomato', 'Tomato'); raised('rbCapsicum', 'Raised bed: capsicum', 'capsicum', 'Capsicum');
  raised('rbLettuce', 'Raised bed: lettuce', 'lettuce', 'Lettuce'); raised('rbBasil', 'Raised bed: basil', 'basil', 'Basil');
  const defs = ['rbTomato', 'rbCapsicum', 'rbLettuce', 'rbBasil'];

  // ---- ground cover and surfaces first (the back of the drawing) ----
  add(area('yard', 'House lawn', 115, 335, 70, 55, '#D7E6C3', { surface: 'lawn' }),
    area('fyard', 'Farm yard', 270, 330, 110, 80, '#CFC5B0', { surface: 'gravel' }),
    area('ffor', 'Food forest', 40, 95, 60, 60, '#B9A27A', { surface: 'mulch' }),
    area('patio', 'Patio', 110, 343, 22, 7, '#C9C2B8', { surface: 'pavers' }),
    area('deck', 'Deck', 95, 328, 8, 10, '#B08A5E', { surface: 'decking' }),
    area('compost', 'Compost bays', 178, 318, 12, 6, '#6B5846', { surface: 'soil' }),
    area('padd', 'Paddock', 430, 395, 130, 40, '#D3E4BF', { surface: 'lawn' }),
    area('chookrun', 'Chook run', 205, 388, 20, 16, '#D9C68F', { surface: 'mulch' }),
    area('dam', 'Dam', 400, 330, 78, 54, '#8FC1DE', { shape: 'round' }));

  // ---- orchards, olive grove, windbreak (rules: a few numbers each) ----
  const orch = (id, name, crop, x, y, w, h, rs, ps, variety) => rows(id, name, crop, x, y, w, h, rs, ps, variety ? { variety } : {});
  add(orch('apples', 'Apple orchard', 'apple', 340, 70, 140, 80, 4.5, 5, 'Gala'),
    orch('peach', 'Peaches', 'peach', 305, 148, 70, 20, 4, 5), orch('plum', 'Plums', 'plum', 375, 148, 70, 20, 4, 5),
    orch('apricot', 'Apricots', 'apricot', 305, 185, 70, 20, 4, 5), orch('cherry', 'Cherries', 'cherry', 375, 185, 70, 20, 4, 5),
    orch('lemons', 'Lemons', 'lemon', 450, 55, 66, 40, 5, 5), orch('oranges', 'Oranges', 'orange', 450, 105, 66, 40, 5, 5), orch('mandarins', 'Mandarins', 'mandarin', 450, 155, 66, 40, 5, 5),
    orch('olives', 'Hilltop olive grove', 'olive', 120, 90, 100, 70, 6, 7),
    orch('windbreak', 'Walnut windbreak', 'walnut', 250, 9, 480, 0.5, 4, 9));

  // ---- crop fields, in rows (about 108,000 plants, drawn only as far as the camera can see) ----
  add(rows('corn', 'Sweet corn', 'corn', 95, 160, 150, 40, 0.75, 0.25, { sow: '2026-10-20', harvest: '2027-02-10' }),
    rows('grain', 'Grain corn', 'corn', 210, 160, 70, 40, 0.9, 0.3, { sow: '2026-10-25', harvest: '2027-02-25' }),
    rows('pumpk', 'Pumpkins', 'pumpkin', 95, 205, 150, 40, 1.8, 1.6, { sow: '2026-10-28', harvest: '2027-04-10' }),
    rows('tomf', 'Field tomatoes', 'tomato', 210, 205, 70, 40, 1.2, 0.6, { sow: '2026-10-12', harvest: '2027-03-15' }),
    rows('potato', 'Potatoes', 'potato', 468, 215, 56, 30, 0.75, 0.3, { sow: '2026-09-25', harvest: '2027-02-05' }),
    rows('beans', 'Beans', 'bean', 468, 255, 56, 30, 0.8, 0.1, { sow: '2026-11-05', harvest: '2027-02-12' }),
    rows('capsi', 'Capsicum', 'capsicum', 468, 295, 56, 30, 0.6, 0.45, { sow: '2026-10-25', harvest: '2027-03-30' }),
    rows('straw', 'Strawberries', 'strawberry', 465, 335, 50, 20, 0.8, 0.4, { sow: '2026-05-10', harvest: '2027-04-30' }));

  // ---- vineyard and trellis ----
  for (let i = 0; i < 6; i++) {
    const y = 220 + i * 6;
    add(rows('vine' + i, 'Grapes row ' + (i + 1), 'grape', 336, y, 132, 0.5, 2, 2, { variety: 'Shiraz' }));
  }
  add(line('ct', 'trellis', 'Cucumber trellis', [[190, 245], [190, 295]], { height: 1.9, style: 'mesh' }), rows('cuc', 'Cucumbers on the trellis', 'cucumber', 191.5, 270, 50, 0.5, 1, 0.5, { rot: 90, sow: '2026-10-30', harvest: '2027-02-20' }));

  // ---- the home: house, verandah, retaining wall, kitchen garden ----
  add({ id: 'house', kind: 'building', folder: 'structures', name: 'Farmhouse', x: 110, y: 328, w: 20, h: 11, rot: 0, wallH: 2.8, roof: 'hip', pitch: 24, ridge: 'auto', wallColour: '#E4DCC8', roofColour: '#7A3B2E', windows: true },
    { id: 'verandah', kind: 'pergola', folder: 'structures', name: 'Verandah', x: 110, y: 335.5, w: 20, h: 3, rot: 0, height: 2.5, cover: 'roof', colour: '#7a5a3a' },
    { id: 'kgpergola', kind: 'pergola', folder: 'structures', name: 'Grape pergola', x: 150, y: 270, w: 5, h: 8, rot: 0, height: 2.4, cover: 'vine', colour: '#6a4d33' },
    line('rwall', 'wall', 'Stone retaining wall', [[72, 306], [100, 301], [140, 301], [162, 307]], { height: 0.9, material: 'stone' }),
    line('kgfence', 'fence', 'Kitchen garden fence', [[36, 243], [186, 243], [186, 298], [36, 298], [36, 243]], { height: 1.8, style: 'pickets', colour: '#F1ECDD' }));
  let n = 0;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 6; i++) add({ id: 'rb' + (n++), kind: 'block', folder: 'beds', name: blocks[defs[(i + j) % 4]].name, def: defs[(i + j) % 4], x: 46 + i * 15, y: 250 + j * 5, rot: 0 });
  add(bed('igGarlic', 'In-ground bed: garlic', 60, 275, 30, 3, {}), rows('garlic', 'Garlic', 'garlic', 60, 275, 30, 2, 0.3, 0.1, { sow: '2026-04-10', harvest: '2026-12-20' }),
    bed('igOnion', 'In-ground bed: onions', 60, 281, 30, 3, {}), rows('onion', 'Onions', 'onion', 60, 281, 30, 2, 0.3, 0.1, { sow: '2026-06-01', harvest: '2027-01-10' }),
    bed('igCarrot', 'In-ground bed: carrots', 60, 287, 30, 3, {}), rows('carrot', 'Carrots', 'carrot', 60, 287, 30, 2, 0.3, 0.05, { sow: '2026-09-10', harvest: '2027-01-20' }),
    bed('igBeet', 'In-ground bed: beetroot', 100, 281, 30, 3, {}), rows('beet', 'Beetroot', 'beetroot', 100, 281, 30, 2, 0.3, 0.1, { sow: '2026-10-01', harvest: '2027-01-25' }));

  // ---- food forest (single plants, drawn at their natural size) ----
  [['fig', 'Fig', 14, 78], ['persimmon', 'Persimmon', 30, 70], ['pomegranate', 'Pomegranate', 50, 76], ['mulberry', 'Mulberry', 20, 96], ['pear', 'Pear', 42, 98],
    ['feijoa', 'Feijoa', 58, 92], ['macadamia', 'Macadamia', 14, 114], ['almond', 'Almond', 34, 118], ['hazelnut', 'Hazelnut', 54, 112], ['blueberry', 'Blueberries', 24, 106], ['blackberry', 'Blackberries', 62, 70]]
    .forEach(([c, nm, x, y], i) => add(plant('ff' + i, nm, c, x, y)));

  // ---- water: tanks on pads, the dam, pipes ----
  [236, 243, 250, 257].forEach((x, i) => add({ id: 'tank' + i, kind: 'tank', folder: 'water', name: 'Tank ' + (i + 1) + ' (large)', x, y: 286, w: 6, h: 6, rot: 0 }));
  add({ id: 'tankk', kind: 'tank', folder: 'water', name: 'Kitchen garden tank (5,000 L)', x: 200, y: 262, w: 3, h: 3, rot: 0 },
    line('pipe1', 'pipe', 'Dam to tanks', [[368, 322], [300, 300], [262, 290]]), line('pipe2', 'pipe', 'Tanks to kitchen garden', [[236, 290], [225, 290], [225, 262], [203, 262]]),
    line('pipe3', 'pipe', 'Tanks to the orchards', [[257, 283], [262, 160], [262, 112]]), line('pipe4', 'pipe', 'Garden drip line', [[200, 262], [50, 262]]));

  // ---- the farm yard: sheds, glasshouses, benches, chooks, shade house ----
  add({ id: 'mshed', kind: 'building', folder: 'structures', name: 'Machinery shed', x: 250, y: 310, w: 26, h: 14, rot: 0, wallH: 5, roof: 'gable', pitch: 14, ridge: 'w', wallColour: '#C9CDC9', roofColour: '#5E6A63', windows: false },
    { id: 'pshed', kind: 'building', folder: 'structures', name: 'Packing shed', x: 300, y: 315, w: 20, h: 12, rot: 0, wallH: 4.2, roof: 'skillion', pitch: 10, ridge: 'auto', wallColour: '#D9D2C3', roofColour: '#8B5A3C', windows: true },
    { id: 'chook', kind: 'building', folder: 'structures', name: 'Hen house', x: 205, y: 384, w: 4, h: 3, rot: 0, wallH: 1.6, roof: 'skillion', pitch: 12, ridge: 'auto', wallColour: '#C98B63', roofColour: '#5E6A63', windows: false },
    { id: 'gh1', kind: 'greenhouse', folder: 'structures', name: 'Glasshouse 1', x: 331, y: 345, w: 9, h: 32, rot: 0, wallH: 2.6, frame: '#3d4a40' },
    { id: 'gh2', kind: 'greenhouse', folder: 'structures', name: 'Glasshouse 2', x: 347, y: 345, w: 9, h: 32, rot: 0, wallH: 2.6, frame: '#3d4a40' },
    { id: 'shade', kind: 'pergola', folder: 'structures', name: 'Shade house', x: 300, y: 380, w: 14, h: 9, rot: 0, height: 2.6, cover: 'shade', colour: '#4a4a4a' },
    line('chfence', 'fence', 'Chook run fence', [[195, 380], [215, 380], [215, 396], [195, 396], [195, 380]], { height: 1.4, style: 'wire' }));
  for (let i = 0; i < 3; i++) add({ id: 'bench' + i, kind: 'bench', folder: 'structures', name: 'Seed-raising bench ' + (i + 1), x: 331, y: 332 + i * 8, w: 6, h: 1.2, rot: 0 }, { id: 'benchb' + i, kind: 'bench', folder: 'structures', name: 'Propagation bench ' + (i + 1), x: 347, y: 332 + i * 8, w: 6, h: 1.2, rot: 0 });

  // ---- paths, drives, boundary and paddock fences ----
  add(line('drive', 'path', 'Main drive', [[230, 418], [230, 300], [230, 255]], { width: 4, surface: 'gravel' }),
    line('drive2', 'path', 'House drive', [[230, 368], [190, 352], [135, 346]], { width: 3, surface: 'gravel' }),
    line('walk', 'path', 'Garden path', [[125, 340], [125, 300]], { width: 1.4, surface: 'pavers' }),
    line('lane', 'path', 'Orchard lane', [[262, 296], [262, 30]], { width: 3, surface: 'gravel' }),
    line('boundary', 'fence', 'Boundary fence', [[2, 2], [498, 2], [498, 418], [2, 418], [2, 2]], { height: 1.3, style: 'wire' }),
    line('paddockf', 'fence', 'Paddock fence', [[365, 375], [498, 375]], { height: 1.2, style: 'wire' }),
    line('gardenf', 'fence', 'Orchard fence', [[252, 24], [412, 24], [412, 204], [252, 204], [252, 24]], { height: 1.8, style: 'panels', colour: '#6f5a3f' }));

  // ---- notes and jobs ----
  add(note('n1', 'Hilltop olives, picked in autumn', 120, 128), note('n2', 'Swale 1: on contour, catches the run-off', 332, 118), note('n3', 'Dam, 3.5 m deep', 400, 360),
    note('n4', 'Kitchen garden: raised and in-ground beds', 110, 305), note('n5', 'Food forest', 40, 66), note('n6', 'Vineyard on wire trellis', 330, 214),
    note('n7', 'Glasshouses and seed raising', 340, 366), note('n8', 'Goats and chooks here', 430, 372),
    task('t1', 'Prune the apples', 330, 100, '2027-07-15', 'year'), task('t2', 'Clean the tanks', 247, 280, '2027-02-01', 'year'),
    task('t3', 'Check the swales after heavy rain', 332, 124, '2026-12-15', 'month'), task('t4', 'Feed the citrus', 450, 150, '2027-03-10', 'year'),
    task('t5', 'Check the dam wall', 400, 305, '2027-01-05', 'year'));

  return {
    format: FORMAT, version: VERSION, name: 'Demo: Larkspur Ridge Farm (50 acres)',
    site: { w: W, h: H, north: 0, lat: -33.5, lon: 150.0, grid: 1, country: 'AU', zone: 'temperate', ground: ground() }, date: '2026-12-10',
    blocks, items,
  };
}
