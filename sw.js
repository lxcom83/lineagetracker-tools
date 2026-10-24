/* LT tools: works offline after the first visit. Same idea as the app: everything the tools need is cached; a new
   version replaces the cache. Sign-in, Drive and Dropbox always go to the network (they are on other addresses). */
const CACHE = 'lt-tools-v1.10.3';
const FILES = ['./', 'index.html', 'signin.html', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'brand/logo-icon.svg', 'brand/logo-icon-dark.svg',
  'kit/kit.css', 'kit/fonts.css', 'kit/core.js', 'kit/bar.js', 'kit/files.js', 'kit/history.js', 'kit/tree.js', 'kit/qr.js', 'kit/barcode.js', 'kit/signin.js', 'kit/home.js', 'kit/planner.js', 'kit/brand.js', 'kit/fold.js', 'kit/plantdb.js', 'kit/ai.js', 'kit/keybox.js',
  'print/', 'print/index.html', 'print/print.css', 'print/app.js', 'print/editor.js', 'print/model.js', 'print/render.js', 'print/starters.js', 'print/library.js', 'print/records.js', 'print/printing.js', 'print/sheet.html', 'print/sheet.js', 'print/scan.js',
  'catalogue/', 'catalogue/index.html', 'catalogue/catalogue.css', 'catalogue/app.js', 'catalogue/template.js', 'catalogue/runtime.js', 'catalogue/orders.js', 'catalogue/ai.js', 'catalogue/stock.js', 'catalogue/printjobs.js', 'catalogue/host-guide.html', 'catalogue/sample.js',
  'planner/', 'planner/index.html', 'planner/planner.css', 'planner/app.js', 'planner/model.js', 'planner/demos.js', 'planner/demo-farm.js', 'planner/guides.js', 'planner/frost.js', 'planner/frost-regions.js', 'planner/seasons.js', 'planner/terrain.js', 'planner/geotiff.js', 'planner/view3d.js', 'planner/surfaces.js', 'planner/plants/plants.js', 'planner/plants/traits.js', 'planner/editor.js', 'planner/share.js', 'planner/scan.js', 'planner/plants/structures.js', 'planner/plants/field.js', 'planner/plants/fieldview.js', 'planner/plants/vendor/three.module.js', 'planner/plants/vendor/three.core.js', 'examples/plants.json', 'examples/animals.json', 'examples/olive.json'];
const FONTS = ['atkinson-hyperlegible-latin-400-normal', 'atkinson-hyperlegible-latin-400-italic', 'atkinson-hyperlegible-latin-700-normal', 'atkinson-hyperlegible-latin-ext-400-normal', 'atkinson-hyperlegible-latin-ext-400-italic', 'atkinson-hyperlegible-latin-ext-700-normal',
  'barlow-condensed-latin-500-normal', 'barlow-condensed-latin-600-normal', 'barlow-condensed-latin-700-normal', 'barlow-condensed-latin-ext-500-normal', 'barlow-condensed-latin-ext-600-normal', 'barlow-condensed-latin-ext-700-normal',
  'barlow-condensed-vietnamese-500-normal', 'barlow-condensed-vietnamese-600-normal', 'barlow-condensed-vietnamese-700-normal'].map(f => `fonts/${f}.woff2`);
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES).then(() => Promise.all(FONTS.map(f => c.add(f).catch(() => {}))))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('lt-tools-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (u.pathname.endsWith('/config.json')) { e.respondWith(fetch(e.request).catch(() => caches.match(e.request).then(r => r || new Response('{}', { headers: { 'Content-Type': 'application/json' } })))); return; }
  // pages: fresh when online (so a new version shows up), cached when offline
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).then(r => { const c = r.clone(); caches.open(CACHE).then(x => x.put(e.request, c)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))); return; }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
