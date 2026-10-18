/* Turns a catalogue (the app's .lineage-list.json) plus the seller's brand and choices into one web page file. */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/* JSON that is safe inside a <script> tag */
const safeJSON = o => JSON.stringify(o).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const hex = (v, d) => (/^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
const IMG = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export const FORMAT = 'catalogue';
/* Read and check a catalogue file. Throws a plain message when it is not one. */
export function readCatalogue(text) {
  let j; try { j = JSON.parse(text); } catch { throw new Error('That file could not be read. Choose a catalogue file saved from the Lineage Tracker app (it ends in .lineage-list.json).'); }
  if (!j || j.app !== 'lineage' || j.format !== FORMAT || !Array.isArray(j.items)) throw new Error('That is not a catalogue file. In the app, open a list, press Share, then Catalogue file.');
  const t = (v, n) => String(v ?? '').slice(0, n);
  const items = j.items.slice(0, 1500).map((it, i) => ({
    key: t(it.key || 'i' + i, 60), name: t(it.name || it.variety, 140), variety: t(it.variety, 140), kind: it.kind === 'animal' || it.kind === 'product' ? it.kind : 'plant', group: t(it.group, 60), species: t(it.species, 140),
    hybrid: !!it.hybrid, form: t(it.form, 40), description: t(it.description, 600), bag: it.bag === '' || it.bag == null ? '' : t(it.bag, 12), per: t(it.per, 80), offer: t(it.offer, 40), price: t(it.price, 40),
    available: typeof it.available === 'number' && isFinite(it.available) ? Math.max(0, Math.floor(it.available)) : null, note: t(it.note, 300), photo: typeof it.photo === 'string' && it.photo.length < 400000 && IMG.test(it.photo) ? it.photo : '',
    hide: false,
  })).filter(it => it.name);
  const s = j.sender || {}, l = j.list || {};
  return { id: t(j.catalogueId, 60), sender: { name: t(s.name, 80), contact: t(s.contact, 160), area: t(s.area, 80) }, list: { name: t(l.name, 120), notes: t(l.notes, 800), type: t(l.type, 20), postage: t(l.postage, 200), postsTo: t(l.postsTo, 120) }, items, updated: t(j.updated, 10) };
}

const CSS = a => `:root{--accent:${a.accent};--accent2:${a.accent2};--hero:${a.ink};--herot:${a.herot};--ink:${a.ink};--bg:#fbf9f5;--card:#fff;--line:#e3dccf;--muted:#5d6470;--text:#1f2b40;color-scheme:light dark}
@media(prefers-color-scheme:dark){:root{--bg:#141a24;--card:#1c2433;--line:#2c3546;--muted:#a3a9b3;--text:#ece8e1;--ink:#ece8e1}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
.wrap{max-width:1100px;margin:0 auto;padding:0 16px}
.hero{background:linear-gradient(135deg,var(--hero),color-mix(in srgb,var(--hero) 78%,var(--accent)));color:var(--herot);border-bottom:5px solid var(--accent)}
#lt-head{display:flex;gap:22px;align-items:center;padding:34px 0 16px}
.brand-logo{width:104px;height:104px;object-fit:contain;flex:none;background:#fff;border-radius:22px;padding:8px;box-shadow:0 6px 22px rgba(0,0,0,.25)}
.eyebrow{margin:0 0 4px;font-size:.85rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;opacity:.85}
h1{margin:0 0 6px;font-size:clamp(1.9rem,5.5vw,3rem);line-height:1.05;color:inherit}
.tag{margin:0;font-size:1.1rem;font-weight:600;opacity:.95}.meta,.intro{margin:8px 0 0;max-width:70ch;opacity:.92}
#lt-links{display:flex;flex-wrap:wrap;gap:8px;padding:6px 0 22px}
#lt-links a{display:inline-flex;gap:8px;align-items:center;min-height:40px;padding:0 16px;border-radius:999px;background:rgba(255,255,255,.14);border:1.5px solid rgba(255,255,255,.55);color:inherit;text-decoration:none;font-weight:700;font-size:.95rem}
#lt-links a.main{background:var(--accent);border-color:var(--accent);color:var(--accent2)}#lt-links a:hover,#lt-links a:focus-visible{background:rgba(255,255,255,.28);outline:2px solid var(--accent2);outline-offset:2px}#lt-links a.main:hover{background:var(--accent);filter:brightness(1.08)}
#lt-links svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#lt-chips{display:flex;gap:8px;flex-wrap:wrap;padding:14px 0 0}
.chip{min-height:38px;padding:0 16px;border-radius:999px;border:1.5px solid var(--line);background:var(--card);color:var(--text);font:inherit;font-weight:700;font-size:.92rem;cursor:pointer}.chip[aria-pressed=true]{background:var(--accent);border-color:var(--accent);color:var(--accent2)}
.pnote{margin:4px 0 0;color:var(--muted);font-size:.9rem}
#lt-tools{display:flex;flex-wrap:wrap;gap:10px;align-items:center;padding:14px 0;position:sticky;top:0;background:var(--bg);z-index:5}
.f{display:block}.f.grow{flex:1 1 220px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
input[type=search],select,.fl input,.fl textarea{width:100%;min-height:42px;padding:8px 12px;border:1.5px solid var(--line);border-radius:10px;background:var(--card);color:inherit;font:inherit}
.chk{display:flex;gap:6px;align-items:center}.count{margin:0 0 0 auto;color:var(--muted);font-size:.92rem}
#lt-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:16px;padding:6px 0 110px}
.card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:18px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 2px rgba(0,0,0,.04);transition:transform .15s,box-shadow .15s}.card:hover{transform:translateY(-2px);box-shadow:0 10px 26px rgba(0,0,0,.12)}.ribbon.inl{position:static;align-self:flex-start;margin-bottom:4px}.ribbon{position:absolute;top:10px;left:10px;padding:3px 10px;border-radius:999px;background:var(--accent);color:var(--accent2);font-size:.78rem;font-weight:800;letter-spacing:.03em}.card.out{opacity:.65}
.ph{width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--line)}
.body{padding:14px;display:flex;flex-direction:column;gap:4px;flex:1}.body h2{margin:0;font-size:1.15rem;color:var(--ink)}
.sp{margin:0;font-style:italic;color:var(--muted);font-size:.9rem}.ds{margin:4px 0 0;font-size:.95rem}.fa{margin:2px 0 0;color:var(--muted);font-size:.9rem}.nt{margin:2px 0 0;font-size:.9rem;color:color-mix(in srgb,var(--accent) 55%,var(--text));font-weight:600}
.foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:auto;padding-top:10px}.price{font-weight:800;font-size:1.05rem;color:var(--accent2);background:var(--accent);padding:2px 12px;border-radius:999px}
.badge{font-size:.8rem;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--line)}.badge.bad{background:#a23b2a;color:#fff}
.step{display:inline-flex;align-items:center;margin-left:auto;border:1.5px solid var(--line);border-radius:10px;overflow:hidden}
.step button{width:40px;height:40px;border:0;background:var(--card);color:inherit;font-size:1.3rem;cursor:pointer}.step output{min-width:32px;text-align:center;font-weight:700}
.none{grid-column:1/-1;color:var(--muted)}
#lt-order{position:fixed;left:0;right:0;bottom:0;display:flex;gap:12px;justify-content:space-between;align-items:center;padding:12px 18px;background:var(--ink);color:var(--bg);z-index:10;font-weight:700}
.go,.acts button{min-height:42px;padding:0 18px;border-radius:10px;border:1.5px solid var(--accent);background:var(--card);color:var(--text);font:inherit;font-weight:700;cursor:pointer}#lt-order .go,.acts .go{background:var(--accent);color:#fff;border-color:var(--accent)}
dialog{max-width:520px;width:calc(100% - 24px);border:1px solid var(--line);border-radius:18px;background:var(--card);color:var(--text);padding:20px}dialog::backdrop{background:rgba(0,0,0,.5)}
dialog h2{margin:0 0 8px;color:var(--ink)}.ol{list-style:none;margin:0 0 8px;padding:0}.ol li{display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-bottom:1px solid var(--line)}.tot{font-weight:700}
.fl{display:block;margin:0 0 10px}.fl span{display:block;font-weight:700;font-size:.9rem;margin-bottom:3px}.hint{color:var(--muted);font-size:.9rem;margin:6px 0}.acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
#terms{scroll-margin-top:70px}footer{border-top:1px solid var(--line);padding:18px 0 36px;color:var(--muted);font-size:.92rem}footer p{margin:0 0 6px;max-width:80ch}.flinks{font-weight:700}footer a{color:color-mix(in srgb,var(--accent) 55%,var(--text))}
@media print{#lt-tools,#lt-order,.step,#lt-links,#lt-chips{display:none}.hero{background:none!important;color:#000!important;border-bottom:3px solid #000}.card{box-shadow:none}#lt-grid{grid-template-columns:repeat(2,1fr);padding-bottom:0}.card{break-inside:avoid}}`;

/* opts: {title, intro, order:'email'|'none', prices, photos, terms, accent, ink}  brand: from kit/brand.js
   inline: the runtime script text to put inside the page (a downloaded page), or '' to load runtime.js beside it (the preview) */
export function buildPage(cat, brand, opts, inline) {
  const o = { title: String(opts.title || cat.list.name || 'Catalogue').slice(0, 120), intro: String(opts.intro || '').slice(0, 800), order: opts.order === 'none' ? 'none' : 'email',
    prices: opts.prices !== false, photos: opts.photos !== false, links: opts.links !== false, jump: opts.jump !== false, stockMode: ['limited', 'exact', 'off'].includes(opts.stockMode) ? opts.stockMode : (opts.stock === false ? 'off' : 'limited'), lowAt: Math.max(1, Math.min(50, Math.round(+opts.lowAt || 5))), total: opts.total !== false, priceNote: String(opts.priceNote || '').slice(0, 160), pay: String(opts.pay || '').slice(0, 600) };
  ['search', 'sort', 'filter', 'instock', 'species', 'desc', 'notes', 'facts', 'offers'].forEach(k => { o[k] = opts[k] !== false; });
  const a = { accent: hex(brand.accent, '#C8794A'), ink: hex(brand.ink, '#1F3557') };
  a.herot = lum(a.ink) > 0.5 ? '#1b1b1b' : '#ffffff'; a.accent2 = lum(a.accent) > 0.55 ? '#1b1b1b' : '#ffffff';
  /* Exact stock numbers stay out of the page unless the seller chooses to show them: the page only learns "sold out" and "limited". */
  const items = cat.items.filter(i => !i.hide).map(i => { const c = { ...i }; delete c.hide; if (!o.photos) c.photo = '';
    const n = typeof i.available === 'number' ? i.available : null;
    c.stock = n === 0 ? 'out' : (n != null && n <= o.lowAt ? 'low' : '');
    if (o.stockMode !== 'exact') c.available = n === 0 ? 0 : null;
    return c; });
  const b = { name: brand.name || cat.sender.name || '', tagline: brand.tagline || '', logo: brand.logo || '', email: brand.email || '', phone: brand.phone || '', web: brand.web || '', area: brand.area || cat.sender.area || '', social: brand.social || '' };
  const data = { v: 1, brand: b, opts: o, list: cat.list, sender: cat.sender, items, updated: cat.updated };
  const terms = [cat.list.postage, cat.list.postsTo, o.pay ? 'How to pay: ' + o.pay : '', opts.terms, brand.note].map(s => String(s || '').trim()).filter(Boolean);
  const desc = (o.intro || `${items.length} items${b.name ? ' from ' + b.name : ''}`).slice(0, 160);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer">
<title>${esc(o.title)}${b.name ? ' | ' + esc(b.name) : ''}</title><meta name="description" content="${esc(desc)}"><meta property="og:title" content="${esc(o.title)}"><meta property="og:description" content="${esc(desc)}">
<style>${CSS(a)}</style></head><body>
<div class="hero"><div class="wrap"><header id="lt-head"></header><nav id="lt-links" aria-label="Quick links"></nav></div></div>
<div class="wrap"><div id="lt-tools"></div><main id="lt-grid" aria-label="Catalogue"></main>
<footer id="terms">${terms.map(t => `<p>${esc(t)}</p>`).join('')}<p>${cat.updated ? 'Updated ' + esc(cat.updated) + '. ' : ''}Powered by <a href="https://lineagetracker.org" rel="noopener">Lineage Tracker</a>, free at lineagetracker.org.</p></footer></div>
<div id="lt-order" hidden></div><dialog id="lt-dlg"></dialog>
<script type="application/json" id="lt-data">${safeJSON(data)}</script>
${inline ? `<script>${inline.replace(/<\/script/gi, '<\\/script')}</script>` : '<script src="runtime.js"></script>'}
</body></html>`;
}

export function csvRows(cat, brand) {
  const q = v => { v = String(v ?? '').replace(/\r?\n/g, ' '); return /[",\t]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const src = cat.items.filter(i => !i.hide);
  /* Goods have no species and no seed-style offer label, so those columns are left out and the label lines pick up the pack and price instead. */
  const cols = [['Name', i => i.name], ['Species', i => i.species, src.some(i => i.species)], ['Pack', i => i.per || (i.bag ? i.bag + ' per pack' : '')], ['Price', i => i.price], ['Offer', i => i.offer, src.some(i => i.offer && i.offer !== 'Products')],
    ['Available', i => (i.available == null ? '' : i.available)], ['Description', i => i.description], ['Seller', () => brand.name || cat.sender.name], ['Contact', () => brand.email || brand.phone || cat.sender.contact], ['Web', () => brand.web], ['Area', () => brand.area || cat.sender.area]]
    .filter(c => c[2] === undefined || c[2]);
  const rows = src.map(i => cols.map(c => q(c[1](i))).join(','));
  return { text: [cols.map(c => c[0]).join(','), ...rows].join('\n'), count: rows.length };
}
