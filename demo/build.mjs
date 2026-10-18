// Builds demo/fluffy-lemon-seeds.html (a live example catalogue page) from the invented seller. Run: node demo/build.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { buildPage, readCatalogue } = await import('../catalogue/template.js');
const { SAMPLE, SAMPLE_BRAND, SAMPLE_GOODS, SAMPLE_GOODS_BRAND } = await import('../catalogue/sample.js');
const runtime = readFileSync(join(here, '../catalogue/runtime.js'), 'utf8');
const noindex = h => h.replace('<meta name="referrer" content="no-referrer">', '<meta name="referrer" content="no-referrer"><meta name="robots" content="noindex">');
const pages = [
  ['fluffy-lemon-seeds.html', SAMPLE, SAMPLE_BRAND, { title: 'Spring seed catalogue', intro: 'An example catalogue made with LT-Catalogue. Fluffy Lemon Seeds is an invented seller and nothing here can be ordered.', priceNote: 'Prices in AUD (example only)', terms: 'Example page for demonstration. No real seeds are sold here.' }],
  ['bramble-hill-homestead.html', SAMPLE_GOODS, SAMPLE_GOODS_BRAND, { title: 'Homestead goods', intro: 'An example catalogue made with LT-Catalogue, for someone who sells things they make rather than seeds. Bramble Hill Homestead is an invented seller and nothing here can be ordered.', priceNote: 'Prices in AUD (example only)', terms: 'Example page for demonstration. Nothing is sold here.' }],
];
for (const [file, sample, brand, o] of pages) {
  const cat = readCatalogue(JSON.stringify(sample));
  const html = noindex(buildPage(cat, brand, { order: 'email', prices: true, photos: true, ...o }, runtime));
  writeFileSync(join(here, file), html);
  console.log('wrote demo/' + file, html.length, 'bytes');
}
