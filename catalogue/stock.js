/* LT-Catalogue: Stock & prices. Edit what the page shows without going back to the app.
   Each item remembers what the app's file said (the "base"), so anything changed here is marked and can be reset. */
import { el } from '../kit/core.js';

export const MASTER_TEXT = {
  app: 'The app is in charge. Loading a newer catalogue file replaces the stock and prices here with the app\'s numbers (your orders are kept).',
  site: 'This website is in charge. Your stock and price changes are kept when you load a newer catalogue file. Only names, descriptions and pictures are refreshed.',
};
export const baseOf = cat => { const b = {}; (cat.items || []).forEach(i => { b[i.key] = [String(i.price || ''), typeof i.available === 'number' ? i.available : null]; }); return b; };
export const isChanged = (it, base) => { const b = base && base[it.key]; if (!b) return false; return String(it.price || '') !== b[0] || (typeof it.available === 'number' ? it.available : null) !== b[1]; };
export const changedCount = (cat, base) => (cat.items || []).filter(i => isChanged(i, base)).length;
export const cleanBase = (b, cat) => { const o = {}; if (!b || typeof b !== 'object') return baseOf(cat); (cat.items || []).forEach(i => { const v = b[i.key]; if (Array.isArray(v)) o[i.key] = [String(v[0] == null ? '' : v[0]).slice(0, 40), typeof v[1] === 'number' && v[1] >= 0 ? Math.floor(v[1]) : null]; }); return o; };

/* Load a newer catalogue file into an existing catalogue. Returns { cat, base, kept, replaced }. */
export function mergeIncoming(oldCat, oldBase, incoming, master) {
  const oldBy = new Map((oldCat.items || []).map(i => [i.key, i]));
  const base = baseOf(incoming); let kept = 0, replaced = 0;
  incoming.items.forEach(it => {
    const o = oldBy.get(it.key); if (!o) return;
    it.hide = !!o.hide;
    if (isChanged(o, oldBase)) { if (master === 'site') { it.price = o.price; it.available = o.available; kept++; } else replaced++; }
  });
  return { cat: incoming, base, kept, replaced };
}

export function viewStock(v, c) {
  const { S, toast, save } = c;
  const cat = S.cat, items = cat.items; let q = '', only = false;
  const root = el('div', {});
  const commit = () => { save(false); };
  const sel = el('select', { 'aria-label': 'Who is in charge of stock and prices' }, [el('option', { value: 'app', text: 'The app is in charge' }), el('option', { value: 'site', text: 'This website is in charge' })]);
  sel.value = S.opts.master === 'site' ? 'site' : 'app';
  const why = el('p', { class: 'small muted', text: MASTER_TEXT[sel.value] });
  sel.addEventListener('change', () => { S.opts.master = sel.value; why.textContent = MASTER_TEXT[sel.value]; commit(); });
  const tbody = el('tbody', {}), count = el('p', { class: 'small muted', 'aria-live': 'polite' });
  const reset = it => { const b = S.base && S.base[it.key]; if (!b) return; it.price = b[0]; it.available = b[1]; };
  function rows() {
    tbody.textContent = '';
    const list = items.filter(i => (!q || (i.name + ' ' + (i.group || '')).toLowerCase().includes(q)) && (!only || isChanged(i, S.base)));
    list.forEach(it => {
      const changed = isChanged(it, S.base);
      const price = el('input', { type: 'text', value: it.price || '', maxlength: '40', placeholder: 'Price', 'aria-label': 'Price for ' + it.name, style: 'max-width:110px' });
      price.addEventListener('change', () => { it.price = price.value.trim().slice(0, 40); commit(); rows(); });
      const stock = el('input', { type: 'number', min: '0', max: '99999', step: '1', value: typeof it.available === 'number' ? String(it.available) : '', placeholder: 'Not counted', 'aria-label': 'In stock: ' + it.name, style: 'max-width:96px' });
      const setStock = n => { it.available = n; commit(); rows(); };
      stock.addEventListener('change', () => { const t = stock.value.trim(); setStock(t === '' ? null : Math.max(0, Math.min(99999, Math.floor(+t) || 0))); });
      const step = d => el('button', { type: 'button', class: 'btn sm', text: d < 0 ? '−1' : '+1', 'aria-label': (d < 0 ? 'One less ' : 'One more ') + it.name, onclick: () => setStock(Math.max(0, (typeof it.available === 'number' ? it.available : 0) + d)) });
      const show = el('input', { type: 'checkbox', 'aria-label': 'Show ' + it.name + ' on the page' }); show.checked = !it.hide; show.addEventListener('change', () => { it.hide = !show.checked; commit(); });
      tbody.append(el('tr', { class: changed ? 'chg' : '' }, [
        el('td', {}, [el('b', { text: it.name }), it.group ? el('small', { class: 'muted', text: ' ' + it.group }) : null]),
        el('td', {}, [price]), el('td', { class: 'stk' }, [step(-1), stock, step(1)]), el('td', {}, [show]),
        el('td', {}, [changed ? el('span', { class: 'chip', text: 'Differs from the app' }) : null, changed ? el('button', { type: 'button', class: 'btn sm', text: 'Match the app', onclick: () => { reset(it); commit(); rows(); } }) : null])]));
    });
    const n = changedCount(cat, S.base);
    count.textContent = (n ? n + (n === 1 ? ' item differs' : ' items differ') + ' from the app. ' : 'Everything matches the app. ') + (list.length < items.length ? 'Showing ' + list.length + ' of ' + items.length + '.' : '');
  }
  const find = el('input', { type: 'search', placeholder: 'Find an item', 'aria-label': 'Find an item' }); find.addEventListener('input', () => { q = find.value.trim().toLowerCase(); rows(); });
  const onlyBox = el('input', { type: 'checkbox' }); onlyBox.addEventListener('change', () => { only = onlyBox.checked; rows(); });
  root.append(...[
    el('p', { class: 'muted', style: 'margin-top:0', text: 'Change what is in stock and what things cost. The page you download shows these numbers. Blank stock means the item is not counted.' }),
    el('label', { class: 'fld' }, [el('span', { text: 'Who is in charge of stock and prices' }), sel]), why,
    el('div', { class: 'actions' }, [find, el('label', { class: 'chk' }, [onlyBox, el('span', { text: 'Only items that differ from the app' })]),
      el('button', { type: 'button', class: 'btn sm', text: 'Match the app for everything', onclick: () => { const n = changedCount(cat, S.base); if (!n) { toast('Everything already matches the app'); return; } if (!confirm('Put ' + n + (n === 1 ? ' item' : ' items') + ' back to the app\'s numbers?')) return; items.forEach(reset); commit(); rows(); } })]),
    el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn', text: 'Send changes to the app', onclick: () => {
      const ch = items.filter(i => isChanged(i, S.base));
      if (!ch.length) { toast('No changes to send. Everything matches the app.', 5000); return; }
      const file = { app: 'lt-update', v: 1, catalogueId: String(cat.id || ''), at: new Date().toISOString().slice(0, 10), items: ch.map(i => ({ key: i.key, price: String(i.price || ''), available: typeof i.available === 'number' ? i.available : null })) };
      c.downloadText('stock-and-price-update.lt-update.json', JSON.stringify(file), 'application/json');
      toast('Update file saved. In the app, open the list and press Import changes from LT-Catalogue.', 7000);
    } }), el('span', { class: 'small muted', text: 'Makes a small file with only your changes. In the app, tick "I manage this list on the website" on the list, then import it.' })]),
    count,
    el('div', { class: 'tbl-wrap' }, [el('table', { class: 'stocktbl' }, [el('thead', {}, [el('tr', {}, ['Item', 'Price', 'In stock', 'On page', ''].map(t => el('th', { scope: 'col', text: t })))]), tbody])])].filter(x => x != null && x !== false));
  rows(); v.append(root);
}
