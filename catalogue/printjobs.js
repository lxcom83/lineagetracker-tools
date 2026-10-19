/* LT-Catalogue: Print. Everything you print from this catalogue, in one place. LT-Print makes the pages; this hands it the data. */
import { el } from '../kit/core.js';
import { addressCsv, slipHTML, packingList, statusList } from './orders.js';

export function viewPrint(v, c) {
  const { S, toast, downloadText } = c;
  const sts = statusList(S.opts), posted = sts.findIndex(x => x[0] === 'posted');
  let which = 'waiting';
  const chosen = () => which === 'all' ? S.orders : which === 'waiting' ? S.orders.filter(o => { const i = sts.findIndex(x => x[0] === o.status); return posted < 0 ? true : i < posted; }) : S.orders.filter(o => o.status === which);
  const sel = el('select', { 'aria-label': 'Which orders' }, [el('option', { value: 'waiting', text: 'Orders waiting to be posted' }), el('option', { value: 'all', text: 'All orders' })].concat(sts.map(([k, t]) => el('option', { value: k, text: 'Status: ' + t }))));
  sel.addEventListener('change', () => { which = sel.value; n.textContent = count(); });
  const count = () => { const l = chosen(); return l.length + (l.length === 1 ? ' order' : ' orders') + ' selected'; };
  const n = el('p', { class: 'small muted', 'aria-live': 'polite', text: count() });
  const job = (title, text, label, onclick) => el('div', { class: 'card pjob' }, [el('h3', { text: title }), el('p', { class: 'small muted', text }), el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: label, onclick })])]);
  const labels = () => {
    const l = chosen().filter(o => o.street || o.suburb);
    if (!l.length) { toast('None of the selected orders has an address yet', 5000); return; }
    if (!S.brand.post) toast('Tip: add a return address in Setup and it prints small on each label.', 6000);
    c.toPrintOrders(addressCsv(l, S.brand).text, 'Address labels');
  };
  const slips = () => {
    const l = chosen(); if (!l.length) { toast('No orders selected'); return; }
    const html = slipHTML(l, S.brand, S.cat.items), w = window.open('', '_blank');
    if (!w) { downloadText('packing-slips.html', html, 'text/html'); toast('Saved as a file. Open it and print.', 5000); return; }
    w.document.open(); w.document.write(html); w.document.close(); setTimeout(() => { try { w.focus(); w.print(); } catch { /* print from the window */ } }, 500);
  };
  v.append(
    el('p', { class: 'muted', style: 'margin-top:0', text: 'Each job opens LT-Print with the right data loaded. The pages carry your brand only.' }),
    el('h2', { text: 'From your catalogue' }),
    job('Item labels', 'One label for each item on your page: name, pack, price and a QR code to your page.', 'Print item labels in LT-Print', c.toPrintItems),
    job('QR link sticker', 'A sticker with a QR code that opens your catalogue page. Needs the page link from the Share tab.', 'Make QR stickers in LT-Print', c.toPrintQr),
    el('h2', { text: 'From your orders' }), el('div', { class: 'ofield' }, [el('label', { class: 'fld' }, [el('span', { text: 'Which orders' }), sel])]), n,
    job('Address labels', 'The customer address large, your return address small, and the order number. One label for each order.', 'Print address labels in LT-Print', labels),
    job('Packing slips', 'One page for each order: ship-to address, items, quantities and totals. Opens ready to print.', 'Print packing slips', slips),
    job('Packing list', 'One list for packing a batch, with pick totals. Copied as plain text.', 'Copy the packing list', async () => { const l = chosen(); if (!l.length) { toast('No orders selected'); return; } try { await navigator.clipboard.writeText(packingList(l)); toast('Packing list copied'); } catch { toast('Could not copy'); } }));
}
