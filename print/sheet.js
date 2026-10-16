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
  document.body.dataset.ready = '1';
  setTimeout(() => { try { window.print(); } catch { /* the person can print from the browser menu */ } }, 150);
})();
