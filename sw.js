/* LT tools: works offline after the first visit. Same idea as the app: everything the tools need is cached; a new
   version replaces the cache. Sign-in, Drive and Dropbox always go to the network (they are on other addresses). */
const CACHE = 'lt-tools-v1.1.2';
const FILES = ['./', 'index.html', 'signin.html', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png',
  'brand/logo-icon.svg', 'brand/logo-icon-dark.svg',
  'kit/kit.css', 'kit/fonts.css', 'kit/core.js', 'kit/bar.js', 'kit/files.js', 'kit/history.js', 'kit/tree.js', 'kit/qr.js', 'kit/barcode.js', 'kit/signin.js', 'kit/home.js', 'kit/planner.js',
  'print/', 'print/index.html', 'print/print.css', 'print/app.js', 'print/editor.js', 'print/model.js', 'print/render.js', 'print/starters.js', 'print/records.js', 'print/printing.js', 'print/sheet.html', 'print/sheet.js',
  'planner/', 'planner/index.html', 'examples/plants.json', 'examples/animals.json', 'examples/olive.json'];
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
