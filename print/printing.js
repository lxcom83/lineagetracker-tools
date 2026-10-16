/* LT-Print: the Print step.
   - Paper and layout: the app's sticker sheets, as many as fit, your own sheet (rows, columns, margins, gaps), or one
     label per page for label printers.
   - Where to start on a part-used sheet, a printer nudge for printers that print slightly off, and cut guides.
   - Numbering ({number}) runs across the labels of one print; the next print can carry on from where this one stopped.
   - With no records, a small form fills in the design's fields, for one-off labels.
   - A preview, then the browser's print window (which can also save a PDF). */
import { el, icon, toast, rootUrl } from '../kit/core.js';
import { labelHTML, fitText, LABEL_CSS } from './render.js';
import { commonValues, KINDS, numberText, usedFields, fieldsFor, flat } from './model.js';
import { SHEETS } from './starters.js';

const PAPER = { a4: { name: 'A4', w: 210, h: 297, css: 'A4' }, letter: { name: 'US Letter', w: 215.9, h: 279.4, css: 'letter' } };
const MAX = 3000;
const PX_MM = 96 / 25.4;
const clampN = (v, lo, hi, d) => { v = parseFloat(v); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };

export function printView(ctx) {
  const { S } = ctx;
  const view = el('div', { class: 'pr-view' });
  const page = el('div', { class: 'pr-page' }), inner = el('div', { class: 'inner' });
  page.append(inner); view.append(page);
  let pvPage = 0, pv = null, pagesLine = null, numLine = null;

  const P = () => S.print;
  function cellSize() { const t = S.t; return { w: t.w, h: t.fold.on ? t.h * 2 + t.fold.gap : t.h }; }
  function grid() {
    const p = P(), c = cellSize();
    const nx = clampN(p.nudgeX, -10, 10, 0), ny = clampN(p.nudgeY, -10, 10, 0);
    if (p.paper === 'roll') return { roll: true, cols: 1, rows: 1, per: 1, pw: c.w, ph: c.h, top: ny, left: nx, gx: 0, gy: 0, css: `${c.w}mm ${c.h}mm`, cw: c.w, ch: c.h };
    const pp = PAPER[p.paper] || PAPER.a4;
    const sh = SHEETS[p.layout];
    if (sh && p.paper === 'a4') return { ...sh, top: sh.top + ny, left: sh.left + nx, per: sh.cols * sh.rows, pw: pp.w, ph: pp.h, css: pp.css, sheet: sh, cw: sh.w, ch: sh.h };
    if (p.layout === 'custom') {
      const k = p.custom || {}, cols = Math.round(clampN(k.cols, 1, 30, 2)), rows = Math.round(clampN(k.rows, 1, 60, 5)), top = clampN(k.top, 0, 100, 10), left = clampN(k.left, 0, 100, 10), gx = clampN(k.gx, 0, 50, 2), gy = clampN(k.gy, 0, 50, 2);
      return { cols, rows, per: cols * rows, pw: pp.w, ph: pp.h, top: top + ny, left: left + nx, gx, gy, css: pp.css, cw: c.w, ch: c.h, custom: true, tooBig: left + cols * c.w + (cols - 1) * gx > pp.w + 0.5 || top + rows * c.h + (rows - 1) * gy > pp.h + 0.5 };
    }
    const m = Math.max(0, +p.margin || 0), g = Math.max(0, +p.gap || 0);
    const cols = Math.max(1, Math.floor((pp.w - 2 * m + g) / (c.w + g))), rows = Math.max(1, Math.floor((pp.h - 2 * m + g) / (c.h + g)));
    const left = Math.max(m, (pp.w - (cols * c.w + (cols - 1) * g)) / 2);
    return { cols, rows, per: cols * rows, pw: pp.w, ph: pp.h, top: m + ny, left: left + nx, gx: g, gy: g, css: pp.css, cw: c.w, ch: c.h, tooBig: c.w > pp.w - 2 * m || c.h > pp.h - 2 * m };
  }
  const usesNumber = () => flat(S.t.items).some(f => !f.off && /\{\s*number\s*\}/.test(f.it.text || ''));
  /* the labels to print, in order: typed records, ticked records, or the fill-in form; copies and numbers added */
  function jobs() {
    const t = S.t, kind = t.kind, base = commonValues(), src = [];
    let mode;
    if (t.own.on) { mode = 'own'; const keys = usedFields(t); for (const r of t.own.rows) if (r._on && keys.some(k => String(r[k] || '').trim())) src.push([r, r._copies || 1]); }   // completely empty rows are left out
    else {
      const rows = S.data?.rows?.[kind] || [], ids = S.chosen?.[kind] || [], byId = new Map(rows.map(r => [r._id, r]));
      for (const id of ids) { const r = byId.get(id); if (r) src.push([r, S.copies[id] || 1]); }
      mode = src.length ? 'records' : 'fill';
      if (!src.length) src.push([P().fill || {}, Math.max(1, Math.min(MAX, +P().blank || 1))]);
    }
    const out = []; let n = 0, rec = 0, over = false;
    for (const [r, copies] of src) {
      for (let i = 0; i < copies; i++) {
        if (out.length >= MAX) { over = true; break; }
        out.push({ ...base, number: numberText(t.counter, t.counter.perCopy ? n : rec), ...r }); n++;
      }
      rec++;
      if (over) break;
    }
    const next = t.counter.start + (t.counter.perCopy ? n : rec) * t.counter.step;
    return { list: out, mode, over, next, first: out[0]?.number, last: out[out.length - 1]?.number };
  }
  function cellHTML(row) {
    const t = S.t;
    if (!t.fold.on) return labelHTML(t, row);
    return `<div class="fold-cell" style="width:${t.w}mm;height:${t.h * 2 + t.fold.gap}mm">${labelHTML(t, row)}<div class="fold-gap" style="height:${t.fold.gap}mm"><i>fold here</i></div><div class="fold-back">${labelHTML(t, row)}</div></div>`;
  }
  function pagesHTML(list, g, onlyPage = -1) {
    const skip = g.roll ? 0 : Math.min(g.per - 1, Math.max(0, +P().skip || 0));
    const cells = [...Array(skip).fill(null), ...list];
    const pages = [];
    for (let i = 0; i < cells.length; i += g.per) pages.push(cells.slice(i, i + g.per));
    const draw = cs => `<div class="pg" style="width:${g.pw}mm;height:${g.ph}mm;padding:${Math.max(0, g.top)}mm 0 0 ${Math.max(0, g.left)}mm;${g.top < 0 || g.left < 0 ? `--nx:${Math.min(0, g.left)}mm;--ny:${Math.min(0, g.top)}mm;` : ''}grid-template-columns:repeat(${g.cols},${g.cw}mm);grid-auto-rows:${g.ch}mm;column-gap:${g.gx}mm;row-gap:${g.gy}mm">${cs.map(r => `<div class="cell">${r ? cellHTML(r) : ''}</div>`).join('')}</div>`;
    return { count: pages.length, html: onlyPage >= 0 ? (pages[onlyPage] ? draw(pages[onlyPage]) : '') : pages.map(draw).join('') };
  }
  const PAGE_CSS = () => `${LABEL_CSS}
.pg{display:grid;box-sizing:border-box;overflow:hidden;background:#fff;align-content:start;justify-content:start}
.pg .cell{position:relative;overflow:hidden;transform:translate(var(--nx,0),var(--ny,0))}
.fold-cell{position:relative}.fold-gap{display:flex;align-items:center;justify-content:center;border-top:0.25mm dashed #777;border-bottom:0.25mm dashed #777;box-sizing:border-box}.fold-gap i{font:normal 4pt Arial;color:#888}.fold-back{transform:rotate(180deg)}
${P().guides ? '.cell .lab{outline:0.2mm solid #bbb;outline-offset:-0.2mm}' : ''}`;

  function render() {
    inner.textContent = '';
    inner.append(el('h1', { text: 'Print' }));
    const g = grid(), t = S.t, p = P(), j = jobs();
    const wrap = el('div', { class: 'print-wrap' });
    const set = el('div', { class: 'card' });
    pv = el('div', { class: 'pv', 'aria-label': 'Preview' });
    wrap.append(set, pv); inner.append(wrap);
    const sel = (label, val, opts, fn) => { const s = el('select', {}, opts.map(([v, l]) => el('option', { value: v, text: l, selected: v === val }))); s.addEventListener('change', () => fn(s.value)); return el('label', { class: 'fld' }, [el('span', { text: label }), s]); };
    const upd = (key, v) => { p[key] = v; ctx.savePrefs(); render(); };
    const numIn = (label, val, fn, { min = 0, max = 100, step = 0.5 } = {}) => { const i = el('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(val) }); i.addEventListener('change', () => fn(clampN(i.value, min, max, val))); return el('label', { class: 'fld' }, [el('span', { text: label }), i]); };
    set.append(el('p', { class: 'small muted', text: `${t.name}${t.name.includes(`${t.w} × ${t.h}`) ? '' : `: ${t.w} × ${t.h} mm`}${t.fold.on ? ', fold-over' : ''}.` }));
    set.append(sel('Paper', p.paper, [['a4', 'A4 sheets'], ['letter', 'US Letter sheets'], ['roll', 'One label per page (label printers, or a full-page design)']], v => upd('paper', v)));
    if (p.paper !== 'roll') {
      const opts = [['auto', 'As many as fit'], ['custom', 'My own sheet (from the box it came in)']];
      if (p.paper === 'a4') for (const [k, s] of Object.entries(SHEETS)) opts.push([k, s.name + (Math.abs(s.w - t.w) < 0.6 && Math.abs(s.h - cellSize().h) < 0.6 ? '  ✓ matches' : '')]);
      const cur = p.layout === 'custom' ? 'custom' : SHEETS[p.layout] && p.paper === 'a4' ? p.layout : 'auto';
      set.append(sel('Layout', cur, opts, v => upd('layout', v)));
      if (g.sheet && (Math.abs(g.sheet.w - t.w) > 0.6 || Math.abs(g.sheet.h - cellSize().h) > 0.6)) set.append(el('p', { class: 'notice warn small', text: `This sheet is for ${g.sheet.w} × ${g.sheet.h} mm labels, and your design is ${t.w} × ${cellSize().h} mm. Change the label size in the design, or pick another layout.` }));
      if (g.custom) {
        const k = p.custom = Object.assign({ cols: 2, rows: 5, top: 10, left: 10, gx: 2, gy: 2 }, p.custom || {});
        const cu = (key, v) => { k[key] = v; ctx.savePrefs(); render(); };
        set.append(el('p', { class: 'small muted', text: `The label size comes from the design (${t.w} × ${cellSize().h} mm). The rest is on the box, or measure a sheet with a ruler.` }),
          el('div', { class: 'row' }, [numIn('Across', k.cols, v => cu('cols', Math.round(v)), { min: 1, max: 30, step: 1 }), numIn('Down', k.rows, v => cu('rows', Math.round(v)), { min: 1, max: 60, step: 1 })]),
          el('div', { class: 'row' }, [numIn('Top margin (mm)', k.top, v => cu('top', v)), numIn('Left margin (mm)', k.left, v => cu('left', v))]),
          el('div', { class: 'row' }, [numIn('Gap across (mm)', k.gx, v => cu('gx', v), { max: 50 }), numIn('Gap down (mm)', k.gy, v => cu('gy', v), { max: 50 })]));
        if (g.tooBig) set.append(el('p', { class: 'notice warn small', text: 'These labels do not fit on the paper. Check the numbers on the box.' }));
      } else if (!g.sheet) {
        set.append(el('div', { class: 'row' }, [numIn('Margin (mm)', p.margin, v => upd('margin', v), { max: 40 }), numIn('Gap (mm)', p.gap, v => upd('gap', v), { max: 20 })]));
        if (g.tooBig) set.append(el('p', { class: 'notice warn small', text: 'The label is bigger than the paper. Make it smaller, or choose one label per page.' }));
      }
      set.append(el('p', { class: 'small', style: 'margin:4px 0' }, [el('b', { text: `${g.per} per page` }), ` (${g.cols} across, ${g.rows} down)`]));
      if (g.per > 1 && g.per <= 80) {
        const ar = (g.cw || 1) / (g.ch || 1), sgw = Math.round(Math.min(180, 150 / g.rows * g.cols * ar));
        const sg = el('div', { class: 'startgrid', style: `grid-template-columns:repeat(${g.cols},1fr);--ar:${ar};width:${Math.max(60, sgw)}px`, role: 'group', 'aria-label': 'Start at label' });
        const skip = Math.min(g.per - 1, +p.skip || 0);
        for (let i = 0; i < g.per; i++) sg.append(el('button', { type: 'button', class: i < skip ? 'used' : i === skip ? 'first' : '', 'aria-label': `Start at label ${i + 1}`, 'aria-pressed': i === skip ? 'true' : 'false', onclick: () => upd('skip', i) }));
        set.append(el('span', { class: 'lbl', text: 'Part-used sheet? Tap where to start' }), sg);
        if (skip) set.append(el('button', { type: 'button', class: 'btn sm', text: 'Start at the first label', onclick: () => upd('skip', 0) }));
      }
    } else set.append(el('p', { class: 'small muted', text: `Each label prints on its own page of ${cellSize().w} × ${cellSize().h} mm. In the print window, pick your label printer and the matching label size. For a full-page document, make the design 210 × 297 mm (A4).` }));
    const gd = el('input', { type: 'checkbox', checked: !!p.guides }); gd.addEventListener('change', () => upd('guides', gd.checked));
    set.append(el('label', { class: 'chk' }, [gd, 'Cutting outline round each label']));
    const nd = el('details', { class: 'nudge' }, [el('summary', { text: 'Printer prints slightly off?' }),
      el('p', { class: 'small muted', text: 'Print one sheet on plain paper, hold it against a label sheet up to the light, then move everything by the difference.' }),
      el('div', { class: 'row' }, [numIn('Move right (mm)', clampN(p.nudgeX, -10, 10, 0), v => upd('nudgeX', v), { min: -10, max: 10 }), numIn('Move down (mm)', clampN(p.nudgeY, -10, 10, 0), v => upd('nudgeY', v), { min: -10, max: 10 })]),
      el('p', { class: 'small muted', text: 'Use minus numbers to move left or up.' })]);
    if (+p.nudgeX || +p.nudgeY) nd.open = true;
    set.append(nd, el('hr', { style: 'border:0;border-top:1px solid var(--line);margin:12px 0' }));
    // what prints
    if (j.mode === 'own') set.append(el('p', {}, [el('span', { class: 'bigcount', text: String(j.list.length) }), ` label${j.list.length === 1 ? '' : 's'} from the records typed into this design. `, el('button', { type: 'button', class: 'btn sm', text: 'Change', onclick: () => ctx.go('records') })]));
    else if (j.mode === 'records') set.append(el('p', {}, [el('span', { class: 'bigcount', text: String(j.list.length) }), ` label${j.list.length === 1 ? '' : 's'} from your ticked ${KINDS[t.kind].name.toLowerCase()}. `, el('button', { type: 'button', class: 'btn sm', text: 'Change', onclick: () => ctx.go('records') })]));
    else set.append(fillForm());
    if (j.over) set.append(el('p', { class: 'notice warn small', text: `Only the first ${MAX} labels print at once. Print the rest in a second go.` }));
    if (usesNumber()) {
      numLine = el('p', { class: 'small' });
      const nextBtn = el('button', { type: 'button', class: 'btn sm', onclick: () => { const nj = jobs(); t.counter.start = nj.next; ctx.commit(); render(); toast(`The next print starts at ${numberText(t.counter, 0)}`); } });
      set.append(numLine, nextBtn);
      const showNum = () => { const nj = jobs(); numLine.textContent = `Numbers in this print: ${nj.first}${nj.list.length > 1 ? ` to ${nj.last}` : ''}.`; nextBtn.textContent = `After printing: start the next print at ${numberText({ ...t.counter, start: nj.next }, 0)}`; };
      showNum(); set._showNum = showNum;
    }
    pagesLine = el('p', { class: 'small' });
    set.append(pagesLine);
    set.append(el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', onclick: () => doPrint() }, [icon('print'), 'Print…'])]));
    set.append(el('p', { class: 'small muted', text: 'In the print window, set the scale to 100% (or "Actual size"), not "Fit to page". To make a PDF, choose Save as PDF as the printer.' }));
    drawPreview(set);
  }
  /* no records: one box per field the design uses, and how many copies */
  function fillForm() {
    const p = P(), keys = usedFields(S.t), names = Object.fromEntries(fieldsFor(S.t.kind, S.t.columns).map(f => [f.key, f.label]));
    p.fill = p.fill && typeof p.fill === 'object' ? p.fill : {};
    const box = el('div', { class: 'fillform' });
    box.append(el('h3', { text: keys.length ? 'Fill in and print' : 'Print the design as it is' }),
      el('p', { class: 'small muted', text: keys.length ? 'No records ticked, so fill in the fields here for a one-off label. These boxes are remembered on this device.' : 'This design has no fields, so every label is the same.' }));
    for (const k of keys) {
      const i = el('input', { type: 'text', value: String(p.fill[k] ?? ''), maxlength: '500' });
      i.addEventListener('input', () => { p.fill[k] = i.value; ctx.savePrefs(); clearTimeout(box._t); box._t = setTimeout(() => drawPreview(), 250); });
      box.append(el('label', { class: 'fld' }, [el('span', { text: names[k] || k }), i]));
    }
    const n = el('input', { type: 'number', min: '1', max: String(MAX), value: String(p.blank || 1), style: 'width:100px' });
    n.addEventListener('change', () => { p.blank = Math.max(1, Math.min(MAX, parseInt(n.value, 10) || 1)); n.value = String(p.blank); ctx.savePrefs(); drawPreview(); });
    box.append(el('label', { class: 'fld' }, [el('span', { text: 'How many' }), n]), el('button', { type: 'button', class: 'btn sm', text: 'Use records instead', onclick: () => ctx.go('records') }));
    return box;
  }
  function drawPreview(set) {
    const g = grid(), j = jobs();
    const pages = pagesHTML(j.list, g, -1).count;
    if (pagesLine) pagesLine.textContent = `${pages} page${pages === 1 ? '' : 's'}.`;
    const s = set || inner.querySelector('.print-wrap .card');
    if (s && s._showNum) s._showNum();
    pvPage = Math.max(0, Math.min(pvPage, pages - 1));
    const one = pagesHTML(j.list, g, pvPage);
    pv.textContent = '';
    const avail = Math.max(240, Math.min(pv.clientWidth || 640, 760) - 32);
    const sc = Math.min(avail / (g.pw * PX_MM), 1.6);
    const box = el('div', { class: 'pv-page', style: `width:${g.pw * PX_MM * sc}px;height:${g.ph * PX_MM * sc}px` });
    const scl = el('div', { class: 'pv-scale', style: `transform:scale(${sc})` });
    scl.innerHTML = `<style>${PAGE_CSS()}</style>${one.html}`;
    box.append(scl);
    const nav = pages > 1 ? el('div', { class: 'row', style: 'align-items:center' }, [
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Previous page', disabled: pvPage === 0, onclick: () => { pvPage--; drawPreview(); } }, [icon('back')]),
      el('span', { class: 'small', text: `Page ${pvPage + 1} of ${pages}` }),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Next page', disabled: pvPage >= pages - 1, onclick: () => { pvPage++; drawPreview(); } }, [icon('chevR')])]) : el('span', { class: 'small muted', text: 'Preview' });
    pv.append(nav, box);
    requestAnimationFrame(() => fitText(scl));
  }

  function doPrint() {
    const g = grid(), j = jobs();
    if (g.tooBig) { toast('The labels do not fit on the paper'); return; }
    // the print page (sheet.html) picks this up from window.opener, so nothing leaves the device
    window.__ltPrintJob = { title: S.t.name, css: `@page{size:${g.css};margin:0}\n${PAGE_CSS()}\n.pg{page-break-after:always;break-after:page}.pg:last-child{page-break-after:auto;break-after:auto}\n@media screen{body{background:#e8e8e8}.pg{margin:10px auto;box-shadow:0 1px 6px rgba(0,0,0,.2)}}`, html: pagesHTML(j.list, g).html };
    const w = window.open(new URL('sheet.html', import.meta.url).href, '_blank');
    if (!w) { window.__ltPrintJob = null; toast('The print window was blocked. Allow pop-ups for this site and try again'); }
  }
  return { el: view, show: render, refresh: render };
}
export { rootUrl };
