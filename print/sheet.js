/* LT-Print print page: takes the prepared pages from the LT-Print tab that opened it, waits for fonts and pictures,
   fits the text, then opens the print window. Nothing is fetched except the fonts. */
import { fitText } from './render.js';

(async function () {
  const wait = document.getElementById('lt-wait');
  let job = null;
  try { job = window.opener && window.opener.__ltPrintJob; } catch { job = null; }
  if (!job || typeof job.html !== 'string') { wait.textContent = 'Nothing to print here. Go back to LT-Print and press Print again.'; return; }
  document.title = String(job.title || 'Labels');
  const st = document.createElement('style'); st.textContent = String(job.css || ''); document.head.append(st);
  const box = document.createElement('div'); box.innerHTML = job.html; document.body.append(box);   // built by LT-Print with every value escaped
  try { window.opener.__ltPrintJob = null; } catch { /* ignore */ }
  try { await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 5000))]); } catch { /* ignore */ }
  await Promise.all([...document.images].map(i => (i.complete ? null : new Promise(r => { i.onload = i.onerror = r; }))));
  fitText(document.body);
  wait.remove();
  showTips(job);
  document.body.dataset.ready = '1';
  setTimeout(() => { try { window.print(); } catch { /* the person can print from the browser menu */ } }, 150);
})();

/* A reminder of the print-window settings, shown on screen only (never printed). It is the first thing people get wrong
   with a label printer: the browser's own headers and footers, and a paper size that is not the label. */
function showTips(job) {
  const bar = document.createElement('aside');
  bar.id = 'lt-tips';
  const h = document.createElement('b');
  h.textContent = 'Each page here is ' + (job.page || 'one label') + '.';
  const p = document.createElement('p');
  p.textContent = job.roll
    ? 'In the print window: choose the paper size that is your label, turn OFF "Headers and footers" (or the date, the title and the web address print on the label), set Margins to None and Scale to 100%. Tick "Background graphics" if your design has colour behind it.'
    : 'In the print window: choose this paper size, set Margins to None and Scale to 100%, and turn OFF "Headers and footers". Tick "Background graphics" if your design has colour behind it.';
  const close = document.createElement('button');
  close.type = 'button'; close.textContent = 'Hide'; close.onclick = () => bar.remove();
  bar.append(h, p, close);
  const st = document.createElement('style');
  st.textContent = '#lt-tips{position:fixed;left:8px;bottom:8px;max-width:22rem;z-index:9;background:#fffbe6;border:1.5px solid #c8b56a;border-radius:10px;padding:10px 12px;font:14px/1.45 Arial,sans-serif;color:#1F3557;box-shadow:0 1px 6px rgba(0,0,0,.18)}#lt-tips p{margin:6px 0}#lt-tips button{font:inherit;padding:4px 10px;border:1.5px solid #1F3557;border-radius:8px;background:#fff;cursor:pointer}@media print{#lt-tips{display:none!important}}';
  document.head.append(st); document.body.append(bar);
}
