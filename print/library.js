/* LT-Print: the template library. Ready-made designs for the things people print most, so changing one is easier than
   starting blank. Each entry builds an ordinary design (every item can be moved, changed, hidden or deleted).
   Anything a seller hands to a customer (seed packets, product labels, address labels, packing slips, invoices)
   carries NO Lineage Tracker marks: the seller's own words only. */
import { blankTemplate, newItem } from './model.js';
import { starter, addressStarter } from './starters.js';

const r2 = v => Math.round(v * 100) / 100;
const mm = pt => pt * 0.3528;
const INK = '#2f5d3a', GOLD = '#c8962e', GREY = '#555555';

/* Small helper: a design is built from text / rect / line / qr / ellipse calls, front-most last, then reversed. */
function make(name, kind, w, h, columns = []) {
  const t = blankTemplate(w, h, kind);
  t.name = name; t.columns = columns.slice();
  const items = [];
  const api = {
    t, items,
    text(nm, tpl, x, y, ww, hh, pt, extra = {}) { items.push(newItem('text', { name: nm, text: tpl, x: r2(x), y: r2(y), w: r2(ww), h: r2(hh), size: r2(pt), ...extra })); return api; },
    rect(nm, x, y, ww, hh, fill, extra = {}) { items.push(newItem('rect', { name: nm, x: r2(x), y: r2(y), w: r2(ww), h: r2(hh), fill, locked: false, ...extra })); return api; },
    line(nm, x, y, ww, color = '#999999', sw = 0.3) { items.push(newItem('line', { name: nm, x: r2(x), y: r2(y), w: r2(ww), h: 0.4, stroke: color, sw })); return api; },
    qr(nm, tpl, x, y, s) { items.push(newItem('qr', { name: nm, text: tpl, x: r2(x), y: r2(y), w: r2(s), h: r2(s) })); return api; },
    ellipse(nm, x, y, ww, hh, stroke, extra = {}) { items.push(newItem('ellipse', { name: nm, x: r2(x), y: r2(y), w: r2(ww), h: r2(hh), fill: '', stroke, sw: 0.6, ...extra })); return api; },
    done() { t.items = items.slice().reverse(); return t; },
  };
  return api;
}

/* ---------- seed packets ---------- */
const SEED_COLS = ['Name', 'Species', 'Pack', 'Sow', 'Spacing', 'Harvest', 'Description', 'Packed', 'Seller', 'Web', 'Area'];
const SEED_ROWS = [
  { Name: 'Waltham Butternut', Species: 'Cucurbita moschata', Pack: '20 seeds', Sow: 'Oct to Dec, 2 cm deep', Spacing: '90 cm apart', Harvest: 'About 100 to 120 days', Description: 'Reliable, sweet and stores for months. Heirloom, open-pollinated.', Packed: 'Packed 2026', Seller: 'Your seed business', Web: 'https://example.com', Area: 'Your region' },
  { Name: 'Black Cherry Tomato', Species: 'Solanum lycopersicum', Pack: '30 seeds', Sow: 'Aug to Nov, start indoors', Spacing: '60 cm apart', Harvest: 'About 70 to 80 days', Description: 'Dark, glossy, rich little tomatoes in big trusses.', Packed: 'Packed 2026', Seller: 'Your seed business', Web: 'https://example.com', Area: 'Your region' },
];
function seedFront(w, h) {
  const b = make(`Seed packet front ${w} × ${h} mm`, 'table', w, h, SEED_COLS), s = h / 100;
  b.rect('Top band', 0, 0, w, 24 * s, INK).rect('Gold stripe', 0, 24 * s, w, 2.5 * s, GOLD)
    .text('Seller', '{Seller}', 5 * s, 3 * s, w - 10 * s, 18 * s, 15 * s, { bold: true, color: '#ffffff', font: 'head', align: 'center', hideEmpty: false })
    .text('Variety name', '{Name}', 6 * s, 32 * s, w - 12 * s, 30 * s, 30 * s, { bold: true, color: INK, font: 'head', align: 'center', hideEmpty: false })
    .text('Species', '{Species}', 6 * s, 63 * s, w - 12 * s, 8 * s, 10 * s, { italic: true, color: GREY, align: 'center' })
    .ellipse('Count badge', w / 2 - 17 * s, 73 * s, 34 * s, 20 * s, GOLD)
    .text('Pack', '{Pack}', w / 2 - 17 * s, 73 * s, 34 * s, 20 * s, 11 * s, { bold: true, color: INK, align: 'center' })
    .text('Area', '{Area}', 5 * s, 94 * s, w - 10 * s, 5 * s, 6 * s, { color: GREY, align: 'center' });
  return b.done();
}
function seedBack(w, h) {
  const b = make(`Seed packet back ${w} × ${h} mm`, 'table', w, h, SEED_COLS), s = h / 100, lx = 8 * s, vx = lx + 24 * s, vw = w - vx - 6 * s;
  b.rect('Top band', 0, 0, w, 14 * s, INK).rect('Gold stripe', 0, 14 * s, w, 2 * s, GOLD)
    .text('Heading', '{Name}', 5 * s, 1 * s, w - 10 * s, 12 * s, 18 * s, { bold: true, color: '#ffffff', font: 'head', align: 'center', hideEmpty: false })
    .text('About', '{Description}', lx, 19 * s, w - lx - 6 * s, 16 * s, 8 * s, { color: '#222222', valign: 'top' });
  [['Sow', 38], ['Space', 47], ['Harvest', 56]].forEach(([lab, y]) => {
    b.text(lab + ' label', lab, lx, y * s, 24 * s, 7 * s, 8 * s, { bold: true, color: INK, hideEmpty: false })
      .text(lab, '{' + (lab === 'Space' ? 'Spacing' : lab) + '}', vx, y * s, vw, 7 * s, 8 * s, { color: '#222222' });
  });
  b.line('Divider', lx, 66 * s, w - lx - 6 * s)
    .qr('QR to our page', '{Web}', lx, 70 * s, 22 * s)
    .text('Seller', '{Seller}', 34 * s, 70 * s, w - 34 * s - 6 * s, 7 * s, 8 * s, { bold: true, color: '#000000' })
    .text('Web', '{Web}', 34 * s, 77 * s, w - 34 * s - 6 * s, 6 * s, 6.5 * s, { color: GREY })
    .text('Area', '{Area}', 34 * s, 83 * s, w - 34 * s - 6 * s, 6 * s, 6.5 * s, { color: GREY })
    .text('Packed', '{Packed}', 34 * s, 88 * s, w - 34 * s - 6 * s, 5 * s, 6.5 * s, { color: GREY });
  return b.done();
}

/* ---------- plant and animal ID ---------- */
function breedingCard(w, h) {
  const b = make(`Breeding card ${w} × ${h} mm`, 'individual', w, h), s = h / 70, pad = 4;
  b.text('Name', '{title}', pad, pad, w - 2 * pad - 24 * s, 9 * s, 16 * s, { bold: true })
    .qr('QR code', '{link}', w - pad - 22 * s, pad, 22 * s);
  [['Variety or breed', 'strain'], ['Generation', 'gen'], ['Parents', 'parents'], ['Started', 'started'], ['Place', 'place']].forEach(([lab, k], i) => {
    b.text(lab, `${lab}: {${k}}`, pad, pad + 10 * s + i * 6 * s, w - 2 * pad - 24 * s, 5.5 * s, 8.5 * s, { color: '#222222' });
  });
  b.text('Notes label', 'Notes', pad, 46 * s, 30, 5 * s, 8 * s, { bold: true, hideEmpty: false, color: INK });
  [53, 59, 65].forEach((y, i) => b.line('Writing line ' + (i + 1), pad, y * s, w - 2 * pad));
  return b.done();
}

/* ---------- packaging and product ---------- */
function productLabel(w, h) {
  const b = make(`Product label ${r2(w)} × ${r2(h)} mm`, 'table', w, h, ['Product', 'Detail', 'Weight', 'Batch', 'Date', 'Seller', 'Web']), s = h / 40, p = 2.5;
  b.text('Product', '{Product}', p, p, w - 2 * p, 11 * s, 15 * s, { bold: true, font: 'head', hideEmpty: false })
    .text('Detail', '{Detail}', p, p + 11 * s, w - 2 * p, 7 * s, 8 * s, { color: '#222222' })
    .text('Weight', '{Weight}', p, p + 19 * s, w / 2, 7 * s, 10 * s, { bold: true })
    .text('Batch', 'Batch {Batch}', w / 2, p + 19 * s, w / 2 - p, 6 * s, 7 * s, { align: 'right', color: GREY })
    .line('Divider', p, 29 * s, w - 2 * p)
    .text('Seller', '{Seller}', p, 30 * s, w - 2 * p, 4.5 * s, 7 * s, { bold: true })
    .text('Web', '{Web}   {Date}', p, 34.5 * s, w - 2 * p, 4 * s, 6 * s, { color: GREY });
  return b.done();
}
function jarLabel(w, h) {
  const b = make(`Jar or bag label ${r2(w)} × ${r2(h)} mm`, 'table', w, h, ['Product', 'Ingredients', 'Weight', 'Batch', 'Best before', 'Seller', 'Address', 'Web']), s = h / 67.7, p = 4;
  b.rect('Top band', 0, 0, w, 18 * s, INK)
    .text('Product', '{Product}', p, 1 * s, w - 2 * p, 16 * s, 19 * s, { bold: true, font: 'head', color: '#ffffff', align: 'center', hideEmpty: false })
    .text('Ingredients', 'Ingredients: {Ingredients}', p, 21 * s, w - 2 * p, 16 * s, 8 * s, { valign: 'top', color: '#222222' })
    .text('Weight', '{Weight}', p, 38 * s, w / 2 - p, 8 * s, 12 * s, { bold: true })
    .text('Batch', 'Batch {Batch}', w / 2, 38 * s, w / 2 - p, 5 * s, 7.5 * s, { align: 'right', color: GREY })
    .text('Best before', 'Best before {Best before}', w / 2, 43.5 * s, w / 2 - p, 5 * s, 7.5 * s, { align: 'right', color: GREY })
    .line('Divider', p, 51 * s, w - 2 * p)
    .text('Seller', '{Seller}', p, 53 * s, w - 2 * p, 5.5 * s, 8.5 * s, { bold: true })
    .text('Address', '{Address}', p, 58.5 * s, w - 2 * p, 4.5 * s, 6.5 * s, { color: GREY })
    .text('Web', '{Web}', p, 63 * s, w - 2 * p, 4 * s, 6.5 * s, { color: GREY });
  return b.done();
}
function eggLabel(w, h) {
  const b = make(`Egg box label ${r2(w)} × ${r2(h)} mm`, 'table', w, h, ['Product', 'Count', 'Date', 'Seller', 'Address', 'Web']), s = h / 55, p = 3.5;
  b.rect('Side stripe', 0, 0, 7 * s, h, GOLD)
    .text('Product', '{Product}', 11 * s, p, w - 11 * s - p, 14 * s, 20 * s, { bold: true, font: 'head', color: INK, hideEmpty: false })
    .text('Count', '{Count}', 11 * s, 19 * s, w - 11 * s - p, 8 * s, 11 * s, { bold: true })
    .text('Date', 'Packed {Date}', 11 * s, 28 * s, w - 11 * s - p, 6 * s, 8.5 * s, { color: '#222222' })
    .line('Divider', 11 * s, 36 * s, w - 11 * s - p)
    .text('Seller', '{Seller}', 11 * s, 38 * s, w - 11 * s - p, 6 * s, 8.5 * s, { bold: true })
    .text('Address', '{Address}', 11 * s, 44 * s, w - 11 * s - p, 5 * s, 6.5 * s, { color: GREY })
    .text('Web', '{Web}', 11 * s, 49 * s, w - 11 * s - p, 4 * s, 6.5 * s, { color: GREY });
  return b.done();
}
function shelfTag(w, h) {
  const b = make(`Price tag ${r2(w)} × ${r2(h)} mm`, 'table', w, h, ['Product', 'Detail', 'Price', 'Unit']), s = h / 30, p = 2;
  b.text('Product', '{Product}', p, p, w - 2 * p, 8 * s, 10 * s, { bold: true, hideEmpty: false })
    .text('Detail', '{Detail}', p, p + 8 * s, w - 2 * p, 5 * s, 6.5 * s, { color: GREY })
    .text('Price', '{Price}', p, 15 * s, w * 0.6, 13 * s, 20 * s, { bold: true, font: 'head', color: INK, hideEmpty: false })
    .text('Unit', '{Unit}', w * 0.6 + p, 17 * s, w * 0.4 - 2 * p, 9 * s, 7.5 * s, { color: GREY, align: 'right' });
  return b.done();
}
function dateSticker(w, h) {
  const b = make(`Batch and date sticker ${r2(w)} × ${r2(h)} mm`, 'table', w, h, ['Product', 'Batch', 'Best before']), p = 1.5;
  b.text('Product', '{Product}', p, p, w - 2 * p, h * 0.38, 8, { bold: true, hideEmpty: false })
    .text('Batch', 'Batch {Batch}', p, p + h * 0.4, w - 2 * p, h * 0.25, 6.5, { color: '#222222' })
    .text('Best before', 'Best before {Best before}', p, p + h * 0.65, w - 2 * p, h * 0.25, 6.5, { color: '#222222' });
  return b.done();
}

/* ---------- orders and paperwork ---------- */
const ORDER_COLS = ['Name', 'Street', 'Place', 'Country', 'Phone', 'Order', 'Items', 'From', 'From address'];
function packingSlip(w, h) {
  const b = make(`Packing slip ${w} × ${h} mm`, 'table', w, h, ORDER_COLS), p = 12;
  b.text('Heading', 'Packing slip', p, p, w - 2 * p, 14, 24, { bold: true, font: 'head', color: '#000000', hideEmpty: false })
    .text('Order', 'Order {Order}', p, p + 15, w / 2, 7, 10, { color: '#222222' })
    .text('Date', '{today}', w / 2, p + 15, w / 2 - p, 7, 10, { color: '#222222', align: 'right' })
    .line('Divider 1', p, p + 24, w - 2 * p)
    .text('Ship to label', 'Ship to', p, p + 27, 40, 6, 9, { bold: true, color: GREY, hideEmpty: false })
    .text('Name', '{Name}', p, p + 33, w - 2 * p, 8, 13, { bold: true })
    .text('Street', '{Street}', p, p + 41, w - 2 * p, 7, 11)
    .text('Place', '{Place}', p, p + 48, w - 2 * p, 7, 11)
    .text('Country', '{Country}', p, p + 55, w - 2 * p, 7, 11, { bold: true })
    .line('Divider 2', p, p + 66, w - 2 * p)
    .text('Items label', 'In this parcel', p, p + 69, 60, 6, 9, { bold: true, color: GREY, hideEmpty: false })
    .text('Items', '{Items}', p, p + 76, w - 2 * p, 62, 11, { valign: 'top' })
    .text('Thanks', 'Thank you for your order!', p, h - p - 22, w - 2 * p, 8, 12, { bold: true, color: INK, hideEmpty: false })
    .text('From', '{From}', p, h - p - 12, w - 2 * p, 6, 9, { bold: true, color: '#444444' })
    .text('From address', '{From address}', p, h - p - 6, w - 2 * p, 6, 8, { color: '#444444' });
  return b.done();
}
function invoice(w, h) {
  const b = make(`Invoice ${w} × ${h} mm`, 'table', w, h, [...ORDER_COLS, 'Total', 'Payment']), p = 16;
  b.text('Seller', '{From}', p, p, w / 2, 10, 18, { bold: true, font: 'head', hideEmpty: false })
    .text('Seller address', '{From address}', p, p + 11, w / 2, 14, 9, { valign: 'top', color: '#444444' })
    .text('Heading', 'INVOICE', w / 2, p, w / 2 - p, 14, 28, { bold: true, font: 'head', color: INK, align: 'right', hideEmpty: false })
    .text('Number', 'Invoice no. {Order}', w / 2, p + 15, w / 2 - p, 6, 10, { align: 'right' })
    .text('Date', 'Date {today}', w / 2, p + 21, w / 2 - p, 6, 10, { align: 'right' })
    .line('Divider 1', p, p + 34, w - 2 * p, INK, 0.6)
    .text('Bill to label', 'Bill to', p, p + 38, 40, 6, 9, { bold: true, color: GREY, hideEmpty: false })
    .text('Name', '{Name}', p, p + 44, w / 2, 7, 12, { bold: true })
    .text('Street', '{Street}', p, p + 51, w / 2, 6, 10)
    .text('Place', '{Place}', p, p + 57, w / 2, 6, 10)
    .text('Country', '{Country}', p, p + 63, w / 2, 6, 10)
    .rect('Table header', p, p + 76, w - 2 * p, 8, INK)
    .text('Header text', 'Items', p + 3, p + 76, w - 2 * p - 6, 8, 10, { bold: true, color: '#ffffff', hideEmpty: false })
    .text('Items', '{Items}', p + 3, p + 86, w - 2 * p - 6, 110, 10.5, { valign: 'top' })
    .line('Divider 2', p, p + 198, w - 2 * p, INK, 0.6)
    .text('Total', 'Total {Total}', p, p + 201, w - 2 * p, 10, 15, { bold: true, align: 'right' })
    .text('Payment', '{Payment}', p, h - p - 36, w - 2 * p, 22, 9.5, { valign: 'top', color: '#333333' })
    .text('Thanks', 'Thank you for your business.', p, h - p - 10, w - 2 * p, 8, 10, { color: GREY, hideEmpty: false });
  return b.done();
}
function thankYou(w, h) {
  const b = make(`Thank-you card ${w} × ${h} mm`, 'table', w, h, ['Name', 'From']), p = 10;
  b.rect('Border', 4, 4, w - 8, h - 8, '', { stroke: GOLD, sw: 0.8 })
    .text('Thanks', 'Thank you, {Name}!', p, 16, w - 2 * p, 24, 26, { bold: true, font: 'head', color: INK, align: 'center', hideEmpty: false })
    .text('Message', 'Your order has been packed with care. Happy growing, and please tell us how it goes.', p + 6, 44, w - 2 * p - 12, 28, 12, { align: 'center', valign: 'top', color: '#333333', hideEmpty: false })
    .text('From', '{From}', p, h - 26, w - 2 * p, 10, 13, { bold: true, align: 'center', color: INK });
  return b.done();
}

/* ---------- the list ---------- */
export const LIBRARY_GROUPS = [
  { id: 'seed', name: 'Seed packets', desc: 'A front and a back that share one spreadsheet. Print the front on one label and the back on another.' },
  { id: 'id', name: 'Plant and animal ID', desc: 'Tags, cage cards and a breeding card. They fill in from your Lineage Tracker records.' },
  { id: 'pack', name: 'Packaging and product labels', desc: 'Jars, bags, egg boxes, shelf prices and date stickers. Your own name only.' },
  { id: 'orders', name: 'Orders and paperwork', desc: 'Address labels, a packing slip, an invoice and a thank-you card. They fill in from LT-Catalogue orders.' },
];
export const LIBRARY = [
  { id: 'seed-front', group: 'seed', name: 'Seed packet front', desc: 'Seller name, variety, species and pack size.', w: 100, h: 100, build: seedFront, rows: SEED_ROWS },
  { id: 'seed-back', group: 'seed', name: 'Seed packet back', desc: 'Description, when to sow, spacing, harvest, and a QR code to your page.', w: 100, h: 100, build: seedBack, rows: SEED_ROWS },
  { id: 'seed-front-s', group: 'seed', name: 'Seed packet front (small)', desc: 'The same design on a smaller 75 × 75 label.', w: 75, h: 75, build: seedFront, rows: SEED_ROWS },
  { id: 'seed-back-s', group: 'seed', name: 'Seed packet back (small)', desc: 'The same design on a smaller 75 × 75 label.', w: 75, h: 75, build: seedBack, rows: SEED_ROWS },
  { id: 'id-tag', group: 'id', name: 'Plant or animal tag', desc: 'Name, a couple of details and a QR code (75 × 25 mm).', kind: 'individual', build: () => starter('tag', 'individual', 75, 25), w: 75, h: 25 },
  { id: 'id-cage', group: 'id', name: 'Cage or pen card', desc: 'Large and easy to read from a distance (148 × 105 mm).', kind: 'individual', build: () => starter('pen', 'individual', 148, 105), w: 148, h: 105 },
  { id: 'id-breeding', group: 'id', name: 'Breeding card', desc: 'Parents, generation, place, plus ruled lines to write notes by hand (100 × 70 mm).', kind: 'individual', w: 100, h: 70, build: breedingCard },
  { id: 'pack-product', group: 'pack', name: 'Product label', desc: 'Name, weight, batch, date and your name (60 × 40 mm).', w: 60, h: 40, build: productLabel, rows: [{ Product: 'Tomato relish', Detail: 'Mild, made with our own tomatoes', Weight: '250 g', Batch: '12', Date: 'Oct 2026', Seller: 'Your business', Web: 'example.com' }] },
  { id: 'pack-jar', group: 'pack', name: 'Jar or bag label', desc: 'A coloured band, ingredients, weight, best before and your address (99.1 × 67.7 mm, 8 per A4 sheet).', w: 99.1, h: 67.7, sheet: 's8', build: jarLabel, rows: [{ Product: 'Chilli jam', Ingredients: 'Chilli, sugar, apple, vinegar', Weight: '200 g', Batch: '7', 'Best before': 'Oct 2027', Seller: 'Your business', Address: 'Your town, state', Web: 'example.com' }] },
  { id: 'pack-egg', group: 'pack', name: 'Egg box label', desc: 'Count, packed date and your details (90 × 55 mm).', w: 90, h: 55, build: eggLabel, rows: [{ Product: 'Free range eggs', Count: 'One dozen', Date: '20 Oct 2026', Seller: 'Your farm', Address: 'Your town, state', Web: 'example.com' }] },
  { id: 'pack-price', group: 'pack', name: 'Price tag', desc: 'Name, a short line and a big price (50 × 30 mm).', w: 50, h: 30, build: shelfTag, rows: [{ Product: 'Black Cherry Tomato', Detail: 'Seedling, 10 cm pot', Price: '$4.50', Unit: 'each' }] },
  { id: 'pack-date', group: 'pack', name: 'Batch and date sticker', desc: 'Product, batch and best before (38.1 × 21.2 mm, 65 per A4 sheet).', w: 38.1, h: 21.2, sheet: 's65', build: dateSticker, rows: [{ Product: 'Tomato relish', Batch: '12', 'Best before': 'Oct 2027' }] },
  { id: 'ord-address', group: 'orders', name: 'Address label', desc: 'From, then the buyer\'s address in big print (99.1 × 67.7 mm, 8 per A4 sheet).', w: 99.1, h: 67.7, sheet: 's8', build: () => addressStarter(99.1, 67.7, ORDER_COLS), rows: [{ Name: 'Sam Example', Street: '1 Garden Road', Place: 'Townsville QLD 4810', Country: 'Australia', Phone: '0400 000 000', Order: 'A12', Items: '', From: 'Your business', 'From address': 'PO Box 1, Your town' }] },
  { id: 'ord-slip', group: 'orders', name: 'Packing slip', desc: 'Order number, who it is for and what is in the parcel (A5, one per page).', w: 148, h: 210, paper: 'roll', build: packingSlip, rows: [{ Name: 'Sam Example', Street: '1 Garden Road', Place: 'Townsville QLD 4810', Country: 'Australia', Phone: '', Order: 'A12', Items: '2 × Black Cherry Tomato seeds\n1 × Waltham Butternut seeds', From: 'Your business', 'From address': 'PO Box 1, Your town' }] },
  { id: 'ord-invoice', group: 'orders', name: 'Invoice', desc: 'Your details, who it is for, items, total and how to pay (A4, one per page). Check what your country requires on an invoice, such as a tax or business number, and add it as a text box.', w: 210, h: 297, paper: 'roll', build: invoice, rows: [{ Name: 'Sam Example', Street: '1 Garden Road', Place: 'Townsville QLD 4810', Country: 'Australia', Phone: '', Order: 'A12', Items: '2 × Black Cherry Tomato seeds   $8.00\n1 × Waltham Butternut seeds   $4.50\nPostage   $3.00', From: 'Your business', 'From address': 'PO Box 1\nYour town\nBusiness number: add yours', Total: '$15.50', Payment: 'Pay by bank transfer to: add your details here. Please use the invoice number as the reference.' }] },
  { id: 'ord-thanks', group: 'orders', name: 'Thank-you card', desc: 'A short message to tuck in the parcel (A6, landscape, one per page).', w: 148, h: 105, paper: 'roll', build: thankYou, rows: [{ Name: 'Sam', From: 'Your business' }] },
];
export function libraryDesign(e) {
  const t = e.build(e.w, e.h);
  t.kind = e.kind || t.kind;
  return t;
}
/* A small spreadsheet (CSV text) with the headings and a row or two, so people can see what to type */
export function exampleCSV(e) {
  const t = libraryDesign(e), cols = t.columns || [], rows = e.rows || [];
  if (!cols.length) return '';
  const q = v => { v = String(v ?? ''); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  return [cols.map(q).join(','), ...rows.map(r => cols.map(c => q(r[c])).join(','))].join('\r\n') + '\r\n';
}
export const exampleRow = e => (e.rows && e.rows[0]) || null;
