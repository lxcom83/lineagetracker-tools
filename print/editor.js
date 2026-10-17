/* LT-Print: the Design step. Canvas (select, drag with snapping, resize, marquee, pinch to zoom), the palette
   (fields, shapes, starters), the feature tree and the properties panel. */
import { el, icon, toast, confirmBox, uid, dialog, promptBox } from '../kit/core.js';
import { featureTree } from '../kit/tree.js';
import { labelHTML, fitText, setLogo, LABEL_CSS } from './render.js';
import { newItem, fieldsFor, find, remove, walk, flat, descendants, isInside, FONTS, TYPES, KINDS, MAX_ASSET, MAX_ASSETS, fill, numberText, usedFields } from './model.js';
import { modules as barcodeModules } from '../kit/barcode.js';
import { starter, starterList, LAYOUTS } from './starters.js';

const PX_MM = 96 / 25.4;
const r2 = v => Math.round(v * 100) / 100;

export function designView(ctx) {
  const { S } = ctx;
  let k = 4;                           // screen pixels per mm
  const view = el('div', { class: 'pr-view design' });
  const left = el('aside', { class: 'pr-left', 'aria-label': 'Add to the design' });
  const right = el('aside', { class: 'pr-right', 'aria-label': 'Feature tree and properties' });
  const stage = el('section', { class: 'pr-stage', 'aria-label': 'Design canvas' });
  view.append(left, stage, right);

  /* ---------- stage ---------- */
  const preview = el('select', { 'aria-label': 'Preview with', onchange: () => { S.preview = preview.value; draw(); } });
  const zoomV = el('span', { class: 'zoomv', 'aria-live': 'polite' });
  const btn = (ic, label, fn, extra = {}) => el('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick: fn, ...extra }, [icon(ic)]);
  const gridBtn = btn('grid', 'Snap to grid and guides', () => { S.snap = !S.snap; gridBtn.setAttribute('aria-pressed', S.snap ? 'true' : 'false'); ctx.savePrefs(); drawOverlay(); });
  gridBtn.setAttribute('aria-pressed', S.snap ? 'true' : 'false');
  const bar = el('div', { class: 'stage-bar' }, [
    el('label', { class: 'small muted hide-xs', for: 'pv-sel', text: 'Preview' }), preview,
    el('span', { class: 'grow' }),
    btn('zoomOut', 'Zoom out', () => setZoom(k / 1.25)), zoomV, btn('zoomIn', 'Zoom in', () => setZoom(k * 1.25)), btn('fit', 'Fit to screen', () => { S.zoomFit = true; fitZoom(); }), gridBtn,
  ]);
  preview.id = 'pv-sel';
  const canvas = el('div', { class: 'pr-canvas', tabindex: '0', 'aria-label': 'Label canvas. Arrow keys move the selection.' });
  const desk = el('div', { class: 'pr-desk' });
  const paper = el('div', { class: 'pr-paper' });
  const scale = el('div', { class: 'pr-scale' });
  const overlay = el('div', { class: 'pr-overlay' });
  paper.append(scale, overlay); desk.append(paper); canvas.append(desk); stage.append(bar, canvas);

  const W = () => S.t.w, H = () => S.t.h;
  function fitZoom() {
    const cw = canvas.clientWidth - 80, ch = canvas.clientHeight - 80;
    const fold = S.t.fold.on ? 2 + S.t.fold.gap / S.t.h : 1;
    if (cw > 0 && ch > 0) k = Math.max(1, Math.min(40, cw / W(), ch / (H() * fold)));
    layout();
  }
  function setZoom(z) { S.zoomFit = false; k = Math.max(1, Math.min(60, z)); layout(); }
  function layout() {
    const s = k / PX_MM, foldH = S.t.fold.on ? (H() * 2 + S.t.fold.gap) : H();
    paper.style.width = W() * k + 'px'; paper.style.height = foldH * k + 'px';
    scale.style.transform = `scale(${s})`;
    zoomV.textContent = Math.round(k / PX_MM * 100) + '%';
    drawOverlay();
  }
  function previewRow() {
    const v = S.preview || 'sample-p';
    if (v === 'none') return {};
    return ctx.rowFor(v);
  }
  function fillPreview() {
    const opts = [['sample-p', 'Sample plant'], ['sample-a', 'Sample animal'], ['none', 'Field names only']];
    const rows = ctx.rowsOfKind(S.t.kind);
    preview.textContent = '';
    if (S.t.kind === 'table') opts.splice(0, 2, ['sample-p', 'Column names']);
    for (const [v, l] of opts) preview.append(el('option', { value: v, text: l }));
    if (S.t.own.on && S.t.own.rows.length) {
      const g = el('optgroup', { label: 'Records typed into this design' });
      const keys = usedFields(S.t);
      S.t.own.rows.slice(0, 300).forEach((r, i) => g.append(el('option', { value: 'own:' + r._id, text: String(keys.map(k => r[k]).find(Boolean) || `Row ${i + 1}`).slice(0, 50) })));
      preview.append(g);
    } else if (rows.length) {
      const g = el('optgroup', { label: 'Your records' });
      rows.slice(0, 300).forEach(r => g.append(el('option', { value: 'rec:' + r._id, text: String(r.title || r._id).slice(0, 50) })));
      preview.append(g);
    }
    if (S.t.own.on && S.t.own.rows.length && (!S.preview || S.preview.startsWith('sample') || S.preview === 'none')) S.preview = 'own:' + S.t.own.rows[0]._id;
    if (![...preview.options].some(o => o.value === S.preview)) S.preview = S.t.own.on && S.t.own.rows.length ? 'own:' + S.t.own.rows[0]._id : rows.length ? 'rec:' + rows[0]._id : 'sample-p';
    preview.value = S.preview;
  }
  function draw() {
    const row = S.preview === 'none' ? fieldNames() : previewRow();
    let html = labelHTML(S.t, row, { editor: true });
    if (S.t.fold.on) {
      html += `<div class="pr-fold" style="top:${S.t.h}mm;height:${S.t.fold.gap}mm">fold here</div>`;
      html += `<div class="pr-back" style="top:${S.t.h + S.t.fold.gap}mm;transform:rotate(180deg)">${labelHTML(S.t, row, {})}</div>`;
    }
    scale.innerHTML = html;
    fitText(scale);
    drawOverlay();
  }
  const fieldNames = () => Object.fromEntries(fieldsFor(S.t.kind, S.t.columns).map(f => [f.key, '{' + f.key + '}']));

  /* ---------- selection overlay ---------- */
  let guides = [];
  function drawOverlay(marq = null) {
    overlay.textContent = '';
    if (S.snap && k >= 6) overlay.append(gridLayer());
    const items = selectedItems();
    for (const it of items) {
      overlay.append(el('div', { class: 'selbox' + (items.length > 1 ? ' multi' : ''), style: `left:${it.x * k}px;top:${it.y * k}px;width:${it.w * k}px;height:${it.h * k}px;${it.rot ? `transform:rotate(${it.rot}deg)` : ''}` }));
    }
    if (items.length === 1 && !items[0].rot && !lockedOf(items[0].id)) {
      const it = items[0], hs = it.type === 'line' ? ['w', 'e'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
      for (const h of hs) {
        const x = it.x + (h.includes('e') ? it.w : h.includes('w') ? 0 : it.w / 2), y = it.y + (h.includes('s') ? it.h : h.includes('n') ? 0 : it.h / 2);
        const d = el('div', { class: 'hdl ' + h, style: `left:${x * k}px;top:${y * k}px`, 'data-h': h, 'aria-hidden': 'true' });
        d.addEventListener('pointerdown', e => startResize(e, it, h));
        overlay.append(d);
      }
    }
    for (const g of guides) overlay.append(el('div', { class: 'guide ' + g.d, style: g.d === 'v' ? `left:${g.v * k}px` : `top:${g.v * k}px` }));
    if (marq) overlay.append(el('div', { class: 'marq', style: `left:${Math.min(marq.x0, marq.x1) * k}px;top:${Math.min(marq.y0, marq.y1) * k}px;width:${Math.abs(marq.x1 - marq.x0) * k}px;height:${Math.abs(marq.y1 - marq.y0) * k}px` }));
  }
  function gridLayer() {
    const g = S.grid, c = document.createElement('canvas'), w = W() * k, h = H() * k;
    c.className = 'gridbg'; c.width = Math.ceil(w); c.height = Math.ceil(h); c.style.width = w + 'px'; c.style.height = h + 'px';
    const x = c.getContext('2d'); x.fillStyle = 'rgba(43,116,135,.35)';
    const step = g * k < 6 ? g * Math.ceil(6 / (g * k)) : g;
    for (let i = step; i < W(); i += step) for (let j = step; j < H(); j += step) x.fillRect(Math.round(i * k), Math.round(j * k), 1, 1);
    return c;
  }
  const flatInfo = () => flat(S.t.items);
  const lockedOf = id => flatInfo().find(f => f.it.id === id)?.locked;
  function selectedItems() { return flatInfo().filter(f => S.sel.has(f.it.id) && !f.off && !f.hidden).map(f => f.it); }

  /* ---------- pointer: select, move, marquee, pan, pinch ---------- */
  const toMM = (cx, cy) => { const b = paper.getBoundingClientRect(); return { x: (cx - b.left) / k, y: (cy - b.top) / k }; };
  function hit(p) {
    for (const f of flatInfo()) {
      if (f.off || f.hidden || f.locked) continue;
      const it = f.it, cx = it.x + it.w / 2, cy = it.y + it.h / 2, a = -(it.rot || 0) * Math.PI / 180;
      const dx = p.x - cx, dy = p.y - cy, lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      const pad = it.type === 'line' ? Math.max(1.5, 8 / k) : 2 / k;
      if (Math.abs(lx) <= it.w / 2 + pad && Math.abs(ly) <= it.h / 2 + pad) return it;
    }
    return null;
  }
  const pointers = new Map();
  let pinch = null;
  canvas.addEventListener('pointerdown', e => {
    if (e.target.closest('.hdl')) return;
    canvas.focus({ preventScroll: true });
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k }; return; }
    const p = toMM(e.clientX, e.clientY), it = hit(p);
    if (it) {
      if (e.shiftKey || e.ctrlKey || e.metaKey) { S.sel.has(it.id) ? S.sel.delete(it.id) : S.sel.add(it.id); selChanged(); return; }
      if (!S.sel.has(it.id)) { S.sel = new Set([it.id]); selChanged(); }
      startMove(e, p);
    } else if (e.pointerType === 'mouse') startMarquee(e, p);
    else startPan(e);
  });
  const endPtr = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; };
  canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
  canvas.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) { const [a, b] = [...pointers.values()]; setZoom(pinch.k * Math.hypot(a.x - b.x, a.y - b.y) / pinch.d); }
  });
  canvas.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); setZoom(k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)); } }, { passive: false });
  canvas.addEventListener('dblclick', e => { const it = hit(toMM(e.clientX, e.clientY)); if (it && it.type === 'text') { S.sel = new Set([it.id]); selChanged(); setTimeout(() => right.querySelector('textarea[name=text]')?.focus(), 0); } });

  function drag(e, onMove, onEnd) {
    const id = e.pointerId; let moved = false;
    const mv = ev => { if (ev.pointerId !== id || pinch) return; moved = true; onMove(ev); };
    const up = ev => { if (ev.pointerId !== id) return; document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up); onEnd(moved, ev); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }
  function startMove(e, p0) {
    const movers = selectedItems().filter(it => !lockedOf(it.id));
    if (!movers.length) return;
    const start = movers.map(it => ({ it, x: it.x, y: it.y }));
    const bb = bounds(movers);
    drag(e, ev => {
      const p = toMM(ev.clientX, ev.clientY);
      let dx = p.x - p0.x, dy = p.y - p0.y;
      [dx, dy] = snapMove(bb, dx, dy, movers, ev.altKey);
      start.forEach(s => { s.it.x = r2(s.x + dx); s.it.y = r2(s.y + dy); });
      draw();
    }, moved => { guides = []; if (moved) { ctx.commit('move'); refreshProps(); } drawOverlay(); });
  }
  function bounds(items) {
    const xs = items.map(i => i.x), ys = items.map(i => i.y), xe = items.map(i => i.x + i.w), ye = items.map(i => i.y + i.h);
    return { x: Math.min(...xs), y: Math.min(...ys), r: Math.max(...xe), b: Math.max(...ye) };
  }
  function snapMove(bb, dx, dy, movers, off) {
    guides = [];
    if (!S.snap || off) return [dx, dy];
    const thr = 7 / k, ids = new Set(movers.map(m => m.id));
    const others = flatInfo().filter(f => !ids.has(f.it.id) && !f.off && !f.hidden).map(f => f.it);
    const xs = [0, W() / 2, W(), ...others.flatMap(o => [o.x, o.x + o.w / 2, o.x + o.w])];
    const ys = [0, H() / 2, H(), ...others.flatMap(o => [o.y, o.y + o.h / 2, o.y + o.h])];
    const best = (cands, edges) => { let hit = null; for (const c of cands) for (const e of edges) { const d = c - e; if (Math.abs(d) < thr && (!hit || Math.abs(d) < Math.abs(hit.d))) hit = { d, v: c }; } return hit; };
    const w = bb.r - bb.x, h = bb.b - bb.y;
    const hx = best(xs, [bb.x + dx, bb.x + dx + w / 2, bb.x + dx + w]);
    const hy = best(ys, [bb.y + dy, bb.y + dy + h / 2, bb.y + dy + h]);
    if (hx) { dx += hx.d; guides.push({ d: 'v', v: hx.v }); } else dx = Math.round((bb.x + dx) / S.grid) * S.grid - bb.x;
    if (hy) { dy += hy.d; guides.push({ d: 'h', v: hy.v }); } else dy = Math.round((bb.y + dy) / S.grid) * S.grid - bb.y;
    return [dx, dy];
  }
  function startResize(e, it, h) {
    e.preventDefault(); e.stopPropagation();
    const s = { x: it.x, y: it.y, w: it.w, h: it.h }, p0 = toMM(e.clientX, e.clientY), ratio = s.w / s.h;
    const square = it.type === 'qr';
    drag(e, ev => {
      const p = toMM(ev.clientX, ev.clientY), snap = v => (S.snap && !ev.altKey ? Math.round(v / S.grid) * S.grid : v);
      let x = s.x, y = s.y, w = s.w, hh = s.h;
      if (h.includes('e')) w = snap(s.x + s.w + p.x - p0.x) - s.x;
      if (h.includes('s')) hh = snap(s.y + s.h + p.y - p0.y) - s.y;
      if (h.includes('w')) { const nx = snap(s.x + p.x - p0.x); w = s.w + s.x - nx; x = nx; }
      if (h.includes('n')) { const ny = snap(s.y + p.y - p0.y); hh = s.h + s.y - ny; y = ny; }
      const minW = 1, minH = it.type === 'line' ? 0.5 : 1;
      if (w < minW) { if (h.includes('w')) x -= minW - w; w = minW; }
      if (hh < minH) { if (h.includes('n')) y -= minH - hh; hh = minH; }
      if (square || (ev.shiftKey && h.length === 2)) {
        const side = square ? Math.max(w, hh) : null;
        if (square) { if (h.includes('w')) x = s.x + s.w - side; if (h.includes('n')) y = s.y + s.h - side; w = hh = side; }
        else { hh = w / ratio; if (h.includes('n')) y = s.y + s.h - hh; }
      }
      Object.assign(it, { x: r2(x), y: r2(y), w: r2(w), h: r2(hh) });
      draw();
    }, moved => { if (moved) { ctx.commit('resize'); refreshProps(); } });
  }
  function startMarquee(e, p0) {
    const m = { x0: p0.x, y0: p0.y, x1: p0.x, y1: p0.y }, add = e.shiftKey || e.ctrlKey || e.metaKey, before = new Set(add ? S.sel : []);
    drag(e, ev => {
      const p = toMM(ev.clientX, ev.clientY); m.x1 = p.x; m.y1 = p.y;
      const x0 = Math.min(m.x0, m.x1), x1 = Math.max(m.x0, m.x1), y0 = Math.min(m.y0, m.y1), y1 = Math.max(m.y0, m.y1);
      S.sel = new Set(before);
      for (const f of flatInfo()) if (!f.off && !f.hidden && !f.locked && f.it.x < x1 && f.it.x + f.it.w > x0 && f.it.y < y1 && f.it.y + f.it.h > y0) S.sel.add(f.it.id);
      drawOverlay(m);
    }, moved => { if (!moved && !add) S.sel = new Set(); selChanged(); });
  }
  function startPan(e) {
    const sx = canvas.scrollLeft, sy = canvas.scrollTop, x0 = e.clientX, y0 = e.clientY;
    drag(e, ev => { canvas.scrollLeft = sx - (ev.clientX - x0); canvas.scrollTop = sy - (ev.clientY - y0); }, moved => { if (!moved) { S.sel = new Set(); selChanged(); } });
  }

  /* ---------- keyboard (canvas and tree) ---------- */
  view.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select,[contenteditable]')) return;
    const mod = e.ctrlKey || e.metaKey;
    const items = selectedItems().filter(it => !lockedOf(it.id));
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key) && !e.altKey && e.target.closest('.pr-canvas')) {
      if (!items.length) return;
      e.preventDefault();
      const st = e.shiftKey ? 5 : e.ctrlKey ? 0.1 : 0.5, dx = e.key === 'ArrowLeft' ? -st : e.key === 'ArrowRight' ? st : 0, dy = e.key === 'ArrowUp' ? -st : e.key === 'ArrowDown' ? st : 0;
      items.forEach(it => { it.x = r2(it.x + dx); it.y = r2(it.y + dy); }); draw(); ctx.commit('nudge'); refreshProps();
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel.size) { e.preventDefault(); deleteSel(); }
    else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
    else if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); S.sel = new Set(flatInfo().filter(f => !f.off && !f.hidden && !f.locked).map(f => f.it.id)); selChanged(); }
    else if (mod && e.key.toLowerCase() === 'c' && S.sel.size) { e.preventDefault(); copySel(); }
    else if (mod && e.key.toLowerCase() === 'v') { e.preventDefault(); paste(); }
    else if (mod && e.key.toLowerCase() === 'g') { e.preventDefault(); e.shiftKey ? ungroup() : group(); }
    else if (e.key === 'Escape' && S.sel.size) { S.sel = new Set(); selChanged(); }
    else if (e.key === ']' || e.key === '[') { e.preventDefault(); order(e.key === ']' ? -1 : 1); }
  });

  /* ---------- edits ---------- */
  function addItem(it) {
    S.t.items.unshift(it); S.sel = new Set([it.id]);
    ctx.commit(); draw(); selChanged();
  }
  function placeAt(it, p) {
    if (p) { it.x = r2(Math.min(Math.max(0, p.x - it.w / 2), Math.max(0, W() - it.w))); it.y = r2(Math.min(Math.max(0, p.y - it.h / 2), Math.max(0, H() - it.h))); }
    if (it.w > W() - 2) it.w = r2(Math.max(1, W() - 2)); if (it.h > H() - 2) it.h = r2(Math.max(1, H() - 2));
    if (!p) {
      // tapped rather than dragged: find the emptiest spot, so it does not land on top of something
      const boxes = flatInfo().filter(f => !f.off && !f.hidden).map(f => f.it), st = Math.max(0.5, Math.min(W(), H()) / 30);
      let best = null;
      for (let y = 1; y <= H() - it.h - 1 + 1e-6; y += st) for (let x = 1; x <= W() - it.w - 1 + 1e-6; x += st) {
        let over = 0; for (const o of boxes) over += Math.max(0, Math.min(x + it.w, o.x + o.w) - Math.max(x, o.x)) * Math.max(0, Math.min(y + it.h, o.y + o.h) - Math.max(y, o.y));
        if (!best || over < best.over - 1e-6) best = { x, y, over };
        if (best.over === 0) break;
      }
      it.x = r2(best ? best.x : 1); it.y = r2(best ? best.y : 1);
    }
    return it;
  }
  function deleteSel() {
    const ids = [...S.sel].filter(id => !lockedOf(id));
    if (!ids.length) { toast('Unlock it first (padlock in the feature tree)'); return; }
    ids.forEach(id => remove(S.t.items, id));
    pruneGroups(); S.sel = new Set(); ctx.commit(); draw(); selChanged();
  }
  function pruneGroups() { const rec = list => { for (let i = list.length - 1; i >= 0; i--) { const it = list[i]; if (it.children) { rec(it.children); if (!it.children.length) list.splice(i, 1); } } }; rec(S.t.items); }
  const clone = it => { const c = JSON.parse(JSON.stringify(it)); walk([c], x => { x.id = uid(); }); return c; };
  function duplicate() {
    const its = selectedItems(); if (!its.length) return;
    const copies = its.map(it => { const c = clone(it); c.x = r2(c.x + 2); c.y = r2(c.y + 2); c.name = it.name + ' copy'; return c; });
    S.t.items.unshift(...copies); S.sel = new Set(copies.map(c => c.id)); ctx.commit(); draw(); selChanged();
  }
  let clip = null;
  function copySel() { clip = selectedItems().map(it => JSON.parse(JSON.stringify(it))); toast(clip.length === 1 ? 'Copied' : `Copied ${clip.length} items`); }
  function paste() {
    if (!clip || !clip.length) return;
    const copies = clip.map(it => { const c = clone(it); c.x = r2(c.x + 2); c.y = r2(c.y + 2); return c; });
    for (const c of copies) if (c.type === 'image' && c.asset !== 'logo' && !S.t.assets[c.asset]) c.asset = 'logo';
    clip = copies.map(c => JSON.parse(JSON.stringify(c)));
    S.t.items.unshift(...copies); S.sel = new Set(copies.map(c => c.id)); ctx.commit(); draw(); selChanged();
  }
  function order(dir) {
    if (S.sel.size !== 1) return;
    const f = find(S.t.items, [...S.sel][0]); if (!f) return;
    const i = f.list.indexOf(f.item), j = i + dir; if (j < 0 || j >= f.list.length) return;
    f.list.splice(i, 1); f.list.splice(j, 0, f.item); ctx.commit(); draw(); refreshTree();
  }
  function group() {
    const ids = [...S.sel]; if (ids.length < 2) { toast('Select two or more items to merge them into a group'); return; }
    const order_ = flat(S.t.items).map(f => f.it.id).filter(id => S.sel.has(id));
    const first = find(S.t.items, order_[0]); const list = first.list, at = list.indexOf(first.item);
    const g = { id: uid(), type: 'group', name: 'Group', open: true, hidden: false, locked: false, off: false, children: [] };
    list.splice(at, 0, g);
    for (const id of order_) { const it = remove(S.t.items, id); if (it) g.children.push(it); }
    pruneGroups(); ctx.commit(); refreshTree(); draw(); refreshProps();
    toast('Merged into a group. Rename it in the feature tree (double-click)');
  }
  function ungroup() {
    const gs = new Set(); for (const id of S.sel) { const f = find(S.t.items, id); if (f?.parent) gs.add(f.parent.id); }
    if (!gs.size) { toast('Nothing selected is in a group'); return; }
    for (const gid of gs) { const f = find(S.t.items, gid); if (!f) continue; const i = f.list.indexOf(f.item); f.list.splice(i, 1, ...f.item.children); }
    ctx.commit(); refreshTree(); draw(); refreshProps();
    toast(gs.size === 1 ? 'Group split into its separate items' : `${gs.size} groups split`);
  }
  const canDemerge = () => [...S.sel].some(id => !!find(S.t.items, id)?.parent);
  function align(how) {
    const its = selectedItems().filter(it => !lockedOf(it.id)); if (!its.length) return;
    const b = its.length > 1 ? bounds(its) : { x: 0, y: 0, r: W(), b: H() };
    for (const it of its) {
      if (how === 'l') it.x = b.x; if (how === 'c') it.x = r2((b.x + b.r) / 2 - it.w / 2); if (how === 'r') it.x = r2(b.r - it.w);
      if (how === 't') it.y = b.y; if (how === 'm') it.y = r2((b.y + b.b) / 2 - it.h / 2); if (how === 'b') it.y = r2(b.b - it.h);
    }
    if ((how === 'dh' || how === 'dv') && its.length > 2) {
      const hz = how === 'dh', s = [...its].sort((a, c) => (hz ? a.x - c.x : a.y - c.y));
      const total = s.reduce((n, it) => n + (hz ? it.w : it.h), 0), span = hz ? b.r - b.x : b.b - b.y, gap = (span - total) / (s.length - 1);
      let pos = hz ? b.x : b.y; for (const it of s) { if (hz) it.x = r2(pos); else it.y = r2(pos); pos += (hz ? it.w : it.h) + gap; }
    }
    ctx.commit(); draw(); refreshProps();
  }

  /* ---------- palette ---------- */
  const palTabs = el('div', { class: 'seg pal-tabs', role: 'group', 'aria-label': 'Palette' });
  const palBody = el('div');
  left.append(palTabs, palBody);
  let palTab = 'add';
  function renderPalette() {
    palTabs.textContent = '';
    for (const [v, l] of [['add', 'Add'], ['starters', 'Starters']]) palTabs.append(el('button', { type: 'button', 'aria-pressed': palTab === v ? 'true' : 'false', text: l, onclick: () => { palTab = v; renderPalette(); } }));
    palBody.textContent = '';
    if (palTab === 'add') {
      palBody.append(el('button', { type: 'button', class: 'btn edit-all', title: 'Change the words on every text box, barcode and QR code in one window', onclick: editAllText }, [icon('text'), 'Edit all text']), el('h3', { text: 'Fields from your records' }), el('p', { class: 'small muted', style: 'margin:-2px 0 8px', text: 'Drag onto the label, or tap to add. Each label fills them in from its record.' }));
      const chips = el('div', { class: 'chips' });
      for (const f of allFields()) chips.append(paletteChip(f.label, 'field', () => newItem(f.key === 'link' ? 'qr' : 'text', f.key === 'link' ? { name: 'QR code', text: '{link}' } : { name: f.label, text: `{${f.key}}` })));
      chips.append(paletteChip('New field…', 'plus', null, async () => {
        const name = await promptBox('New field', 'Name of the field (for example Customer or Order number)', '', { okText: 'Add it', max: 40 });
        const clean = String(name || '').replace(/[{}\n\r]/g, '').trim().slice(0, 40);
        if (!clean) return;
        addItem(placeAt(newItem('text', { name: clean, text: `{${clean}}` }), null)); renderPalette(); document.body.classList.remove('show-left');
        toast('Added. Type its values in step 2, Records, under "Type your own"');
      }));
      palBody.append(chips, el('h3', { text: 'Shapes and more' }));
      const g = el('div', { class: 'addgrid' });
      g.append(
        paletteChip('Text', 'text', () => newItem('text', { text: 'Your text', hideEmpty: false })),
        paletteChip('QR code', 'qr', () => newItem('qr')),
        paletteChip('Barcode', 'barcode', () => newItem('barcode', { text: defaultBarcode() })),
        paletteChip('Date with a sum…', 'calendar', null, async () => { const tok = await dateSumDialog(); if (tok) { addItem(placeAt(newItem('text', { name: 'Date', text: tok }), null)); document.body.classList.remove('show-left'); } }),
        paletteChip('Rectangle', 'rect', () => newItem('rect')),
        paletteChip('Ellipse', 'ellipse', () => newItem('ellipse')),
        paletteChip('Line', 'line', () => newItem('line')),
        paletteChip('Tree logo', 'logo', () => newItem('image', { name: 'Tree logo', asset: 'logo' })),
        paletteChip('Picture…', 'image', null, () => addPicture()),
      );
      palBody.append(g, el('p', { class: 'small muted', style: 'margin-top:12px', text: 'Kinds of record this design is for: ' + KINDS[S.t.kind].name + '. Change it under Label (tap an empty part of the canvas).' }));
    } else {
      palBody.append(el('p', { class: 'small muted', text: 'Start from one of the app\'s sticker layouts. It replaces the current design (you can undo).' }));
      for (const s of starterList(S.t.kind)) {
        const t = starter(s.layout, S.t.kind, s.w, s.h, S.t.columns);
        const thumb = el('div', { class: 'thumb' });
        const sc = Math.min(200 / (t.w * PX_MM), 76 / ((t.fold.on ? t.h * 2 + 5 : t.h) * PX_MM));
        const inner = el('div', { style: `transform:scale(${sc});transform-origin:center;flex:none` });
        inner.innerHTML = labelHTML(t, ctx.rowFor('sample-p'), {});
        thumb.append(inner);
        palBody.append(el('button', { type: 'button', class: 'starter', onclick: () => useStarter(s) }, [thumb, el('b', { text: s.name }), el('small', { text: s.size })]));
        requestAnimationFrame(() => fitText(inner));
      }
    }
  }
  async function useStarter(s) {
    const ok = !S.t.items.length || await confirmBox('Use this starter?', `${s.name}, ${s.size}. This replaces the current design. You can undo it.`, 'Use it');
    if (!ok) return;
    const t = starter(s.layout, S.t.kind, s.w, s.h, S.t.columns);
    S.t = Object.assign(t, { kind: S.t.kind, columns: S.t.columns, own: S.t.own, counter: S.t.counter });
    if (s.sheet) S.print.layout = s.sheet;
    S.sel = new Set(); ctx.commit(); ctx.refreshAll(); S.zoomFit = true; fitZoom();
    document.body.classList.remove('show-left');
  }
  function paletteChip(label, ic, make, onTap) {
    const c = el('button', { type: 'button', class: 'chip', title: onTap ? label : 'Drag onto the label, or tap to add' }, [icon(ic), label]);
    c.addEventListener('pointerdown', e => {
      if (onTap) return;
      if (e.button !== 0) return;
      e.preventDefault();
      let ghost = null; const x0 = e.clientX, y0 = e.clientY;
      drag(e, ev => {
        if (!ghost && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 6) { ghost = el('div', { class: 'ghost', text: label }); document.body.append(ghost); document.body.classList.remove('show-left'); }
        if (ghost) { ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px'; }
      }, (moved, ev) => {
        if (ghost) ghost.remove();
        if (!ghost) { addItem(placeAt(make(), null)); document.body.classList.remove('show-left'); return; }
        const b = paper.getBoundingClientRect();
        if (ev.clientX >= b.left - 20 && ev.clientX <= b.right + 20 && ev.clientY >= b.top - 20 && ev.clientY <= b.bottom + 20) addItem(placeAt(make(), toMM(ev.clientX, ev.clientY)));
      });
    });
    c.addEventListener('click', e => { if (onTap) { onTap(); return; } if (e.detail === 0) addItem(placeAt(make(), null)); });   // keyboard Enter/Space
    return c;
  }
  async function addPicture() {
    const f = await new Promise(res => { const i = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp,image/gif', style: 'display:none' }); i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); }, { once: true }); document.body.append(i); i.click(); });
    if (!f) return;
    try {
      const data = await shrinkImage(f);
      const used = Object.values(S.t.assets).reduce((n, v) => n + v.length, 0);
      if (data.length > MAX_ASSET * 1.37 || used + data.length > MAX_ASSETS * 1.37) { toast('That picture is too big for a design. Try a smaller one'); return; }
      const id = 'a' + uid(); S.t.assets[id] = data;
      const img = new Image(); img.src = data; await img.decode().catch(() => {});
      const ratio = img.naturalWidth && img.naturalHeight ? img.naturalHeight / img.naturalWidth : 1;
      const w = Math.min(20, W() * 0.5);
      addItem(placeAt(newItem('image', { name: f.name.replace(/\.[a-z]+$/i, '').slice(0, 40) || 'Picture', asset: id, w: r2(w), h: r2(Math.min(H(), w * ratio)) }), null));
      document.body.classList.remove('show-left');
    } catch { toast('That picture could not be opened'); }
  }

  /* One window with every piece of text on the label (text boxes, barcodes, QR codes), for typing a packing document or any label
     where the words matter more than the layout. Changes show on the label as you type; Done makes them one undo step. */
  function editAllText() {
    const rows = flat(S.t.items).filter(f => typeof f.it.text === 'string' && ['text', 'qr', 'barcode'].includes(f.it.type));
    if (!rows.length) { toast('There is no text on the label yet. Add a Text box from the palette'); return; }
    let changed = false;
    const list = el('div', { class: 'eat-list' });
    for (const f of rows) {
      const it = f.it, multi = it.type === 'text';
      const inp = el(multi ? 'textarea' : 'input', multi ? { rows: String(Math.min(4, Math.max(1, it.text.split('\n').length))), maxlength: '2000' } : { type: 'text', maxlength: it.type === 'qr' ? '700' : '200' });
      inp.value = it.text;
      const shows = el('small', { class: 'muted eat-shows' });
      const upd = () => { const t = fill(it.text, ctx.rowFor(S.preview || 'sample-p')).text; shows.textContent = /\{[^}]+\}/.test(it.text) ? 'Shows: ' + (t || '(empty for this record)') : ''; };
      inp.addEventListener('input', () => { it.text = inp.value; changed = true; upd(); draw(); });
      upd();
      const nm = it.name || TYPES[it.type], kind = it.type === 'qr' && !/qr/i.test(nm) ? ' (QR code)' : it.type === 'barcode' && !/bar/i.test(nm) ? ' (barcode)' : '';
      const note = f.off ? ' · left out of print' : f.hidden ? ' · hidden' : '';
      list.append(el('label', { class: 'fld eat-row' }, [el('span', { text: nm + kind + note }), inp, shows]));
    }
    const d = dialog('Edit all text', [
      el('p', { class: 'hint', text: 'Type plain words to print the same on every label. A word in curly brackets, like {title}, is filled in from each record. Changes show on the label as you type.' }),
      list,
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Done', onclick: () => d.close() })]),
    ], { wide: true, onClose: () => { if (changed) { ctx.commit('edit-all-text'); refreshTree(); refreshProps(); } } });
  }

  /* ---------- feature tree ---------- */
  const treeBox = el('div');
  const groupBtn = el('button', { type: 'button', class: 'btn sm', title: 'Merge the selected items into one group (Ctrl+G). Select two or more first.', onclick: group }, [icon('group'), 'Merge into group']);
  const ungroupBtn = el('button', { type: 'button', class: 'btn sm', title: 'Split the selected group back into separate items (Ctrl+Shift+G)', onclick: ungroup }, ['Demerge group']);
  const treePane = el('div', { class: 'pane tree-pane' }, [el('div', { class: 'pane-head' }, [el('h3', { text: 'Feature tree' })]), el('div', { class: 'tree-actions' }, [groupBtn, ungroupBtn]), el('p', { class: 'small muted', style: 'margin:0 0 6px', text: 'Top of the list is in front. Eye hides while you design (it still prints). Power leaves it out of the print.' }), treeBox]);
  const propsBox = el('div', { class: 'props' });
  const propsPane = el('div', { class: 'pane props-pane' }, [propsBox]);
  right.append(treePane, propsPane);
  const nodeOf = it => ({ id: it.id, name: it.name, kind: it.type, hidden: it.hidden, locked: it.locked, off: it.off, open: it.open, note: it.type === 'text' ? shortText(it.text) : '', children: it.children ? it.children.map(nodeOf) : undefined });
  const shortText = s => { s = String(s || ''); return s.length > 22 ? s.slice(0, 21) + '…' : s; };
  const tree = featureTree(treeBox, {
    label: 'Feature tree', empty: 'Nothing on the label yet. Add fields or shapes from the palette.',
    nodes: () => S.t.items.map(nodeOf),
    iconFor: n => ({ text: /\{/.test(find(S.t.items, n.id)?.item.text || '') ? 'field' : 'text', qr: 'qr', barcode: 'barcode', rect: 'rect', ellipse: 'ellipse', line: 'line', image: find(S.t.items, n.id)?.item.asset === 'logo' ? 'logo' : 'image', group: 'group' }[n.kind] || 'info'),
    isSelected: id => { const f = find(S.t.items, id); if (!f) return false; if (f.item.children) { const d = descendants(f.item); return d.length > 0 && d.every(x => S.sel.has(x.id)); } return S.sel.has(id); },
    onSelect: (id, add) => {
      const f = find(S.t.items, id); if (!f) return;
      const ids = descendants(f.item).map(x => x.id);
      if (add) { const all = ids.every(x => S.sel.has(x)); ids.forEach(x => (all ? S.sel.delete(x) : S.sel.add(x))); }
      else S.sel = new Set(ids);
      selChanged();
    },
    onToggle: (id, flag) => {
      const f = find(S.t.items, id); if (!f) return;
      f.item[flag] = !f.item[flag];
      if ((flag === 'hidden' || flag === 'off') && f.item[flag]) descendants(f.item).forEach(x => S.sel.delete(x.id));
      ctx.commit(); refreshTree(); draw(); refreshProps();
    },
    onRename: (id, name) => { const f = find(S.t.items, id); if (f) { f.item.name = name.slice(0, 60); ctx.commit(); refreshTree(); refreshProps(); } },
    onOpen: (id, open) => { const f = find(S.t.items, id); if (f) { f.item.open = open; refreshTree(); ctx.autosave(); } },
    onNudge: (id, dir) => { const f = find(S.t.items, id); if (!f) return; const i = f.list.indexOf(f.item), j = i + dir; if (j < 0 || j >= f.list.length) return; f.list.splice(i, 1); f.list.splice(j, 0, f.item); ctx.commit(); refreshTree(); draw(); },
    onMove: (id, target, where) => {
      if (id === target || isInside(S.t.items, target, id)) return;
      const it = remove(S.t.items, id); if (!it) return;
      const tf = find(S.t.items, target);
      if (!tf) { S.t.items.unshift(it); }
      else if (where === 'in' && tf.item.children) { tf.item.children.unshift(it); tf.item.open = true; }
      else { const i = tf.list.indexOf(tf.item); tf.list.splice(where === 'after' ? i + 1 : i, 0, it); }
      pruneGroups(); ctx.commit(); refreshTree(); draw();
    },
  });
  function refreshTree() { tree.render(); groupBtn.disabled = S.sel.size < 2; ungroupBtn.disabled = !canDemerge(); }

  /* ---------- properties ---------- */
  function num(label, val, onIn, { step = 0.5, min = -999, max = 999, unit = 'mm' } = {}) {
    const i = el('input', { type: 'number', inputmode: 'decimal', step: String(step), min: String(min), max: String(max), value: String(val) });
    i.addEventListener('input', () => { const v = parseFloat(i.value); if (Number.isFinite(v)) onIn(Math.min(max, Math.max(min, v))); });
    return el('label', { class: 'fld' }, [el('span', { text: `${label}${unit ? ' (' + unit + ')' : ''}` }), i]);
  }
  function color(label, val, onIn, allowNone = false) {
    const i = el('input', { type: 'color', value: val || '#000000', 'aria-label': label });
    const none = allowNone ? el('label', { class: 'chk swatch-none' }, [el('input', { type: 'checkbox', checked: !val }), 'None']) : null;
    i.addEventListener('input', () => { if (none) none.firstChild.checked = false; onIn(i.value); });
    if (none) none.firstChild.addEventListener('change', () => onIn(none.firstChild.checked ? '' : i.value));
    return el('label', {}, [label, i, none]);
  }
  function check(label, val, onIn) { const i = el('input', { type: 'checkbox', checked: !!val }); i.addEventListener('change', () => onIn(i.checked)); return el('label', { class: 'chk' }, [i, label]); }
  function select(label, val, opts, onIn) {
    const s = el('select', {}, opts.map(([v, l]) => el('option', { value: v, text: l, selected: v === val })));
    s.addEventListener('change', () => onIn(s.value));
    return el('label', { class: 'fld' }, [el('span', { text: label }), s]);
  }
  const live = (it, key) => v => { it[key] = v; draw(); ctx.commit('p:' + it.id + key); };
  function refreshProps() {
    propsBox.textContent = ''; propsBox.oninput = null;
    const items = selectedItems();
    if (!items.length) return labelProps();
    if (items.length > 1) return multiProps(items);
    const it = items[0], locked = lockedOf(it.id);
    const nameIn = el('input', { type: 'text', value: it.name, maxlength: '60' });
    nameIn.addEventListener('input', () => { it.name = nameIn.value.slice(0, 60) || TYPES[it.type]; ctx.commit('name:' + it.id); refreshTree(); });
    propsBox.append(el('div', { class: 'pane-head' }, [el('h3', { text: TYPES[it.type] }),
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Duplicate', title: 'Duplicate (Ctrl+D)', onclick: duplicate }, [icon('copy')]),
      el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': 'Delete', title: 'Delete', onclick: deleteSel }, [icon('trash')])]),
    el('label', { class: 'fld' }, [el('span', { text: 'Name in the tree' }), nameIn]));
    if (locked) propsBox.append(el('p', { class: 'notice warn small', text: 'Locked: unlock it in the feature tree to move or change it.' }));
    const pos = el('div', { class: 'row' }, [num('X', it.x, live(it, 'x')), num('Y', it.y, live(it, 'y'))]);
    const size = el('div', { class: 'row' }, [num('Width', it.w, v => { it.w = Math.max(0.5, v); if (it.type === 'qr') it.h = it.w; draw(); ctx.commit('p:' + it.id + 'w'); drawOverlay(); }, { min: 0.5 }), num('Height', it.h, v => { it.h = Math.max(0.2, v); if (it.type === 'qr') it.w = it.h; draw(); ctx.commit('p:' + it.id + 'h'); }, { min: 0.2 })]);
    const rot = select('Rotate', String([0, 90, 180, 270].includes(((it.rot % 360) + 360) % 360) ? ((it.rot % 360) + 360) % 360 : 'other'), [['0', 'Not rotated'], ['90', '90° (reads downwards)'], ['180', 'Upside down'], ['270', '270° (reads upwards)'], ...(![0, 90, 180, 270].includes(((it.rot % 360) + 360) % 360) ? [['other', it.rot + '°']] : [])], v => { if (v !== 'other') { it.rot = +v; draw(); ctx.commit(); drawOverlay(); } });
    propsBox.append(pos, size, rot);
    if (it.type === 'text') textProps(it);
    if (it.type === 'qr') {
      propsBox.append(el('hr'), contentField(it, 'What the QR code holds', 'Usually {link}, which opens the record in the app when scanned. It can hold any text or web address.'));
      propsBox.append(el('div', { class: 'colors' }, [color('Colour', it.color, live(it, 'color'))]), check('Leave out when empty', it.hideEmpty, live(it, 'hideEmpty')));
    }
    if (it.type === 'barcode') {
      propsBox.append(el('hr'), contentField(it, 'What the barcode holds', 'Code 128: letters, numbers and ordinary punctuation, the barcode most scanners read for stock and shipping. Usually a tag, lot or order number.'));
      const info = el('p', { class: 'hint', 'aria-live': 'polite' });
      const check_ = () => {
        const v = fill(it.text, ctx.rowFor(S.preview || 'sample-p')).text.trim();
        if (!v) { info.textContent = 'Nothing to show for the preview record.'; return; }
        let n; try { n = barcodeModules(v).length; } catch { info.textContent = 'A barcode cannot hold some of these letters (only plain letters, numbers and punctuation).'; info.className = 'notice warn small'; return; }
        const bar = it.w / n;
        info.className = bar < 0.25 ? 'notice warn small' : 'hint';
        info.textContent = bar < 0.25 ? `The thinnest bars are ${bar.toFixed(2)} mm, which many scanners and printers cannot manage. Make it wider (about ${Math.ceil(n * 0.3)} mm) or shorten what it holds.` : `Thinnest bar ${bar.toFixed(2)} mm. Good for most scanners.`;
      };
      check_(); propsBox.oninput = check_;
      propsBox.append(info, el('div', { class: 'colors' }, [color('Colour', it.color, live(it, 'color'))]), check('Show the text under the bars', it.showText, v => { it.showText = v; draw(); ctx.commit(); }), num('Text size', it.textSize, live(it, 'textSize'), { step: 0.5, min: 3, max: 40, unit: 'pt' }), check('Leave out when empty', it.hideEmpty, live(it, 'hideEmpty')), el('p', { class: 'hint', text: 'Black on white scans best. Print a test sheet and try it with your scanner or phone first.' }));
    }
    if (it.type === 'rect' || it.type === 'ellipse') {
      propsBox.append(el('hr'), el('div', { class: 'colors' }, [color('Fill', it.fill, live(it, 'fill'), true), color('Outline', it.stroke, live(it, 'stroke'), true)]), num('Outline width', it.sw, live(it, 'sw'), { step: 0.1, min: 0, max: 10 }));
      if (it.type === 'rect') propsBox.append(num('Rounded corners', it.radius, live(it, 'radius'), { step: 0.5, min: 0, max: 100 }));
    }
    if (it.type === 'line') propsBox.append(el('hr'), el('div', { class: 'colors' }, [color('Colour', it.stroke, live(it, 'stroke'))]), num('Thickness', it.sw, live(it, 'sw'), { step: 0.1, min: 0.05, max: 10 }), check('Dashed', it.dash, live(it, 'dash')), el('p', { class: 'hint', text: 'For an upright line, choose Rotate 90°.' }));
    if (it.type === 'image') propsBox.append(el('hr'), select('Fit', it.fit, [['contain', 'Show all of it'], ['cover', 'Fill the box (may crop)']], v => { it.fit = v; draw(); ctx.commit(); }), check('Black and white', it.gray, live(it, 'gray')));
    propsBox.append(el('hr'), el('div', { class: 'tbtns' }, [
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Bring forward', title: 'Bring forward ( ] )', onclick: () => order(-1) }, [icon('up')]),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Send backward', title: 'Send backward ( [ )', onclick: () => order(1) }, [icon('down')]),
      alignBtn('alignL', 'Align left on the label', 'l'), alignBtn('alignC', 'Centre on the label', 'c'), alignBtn('alignR', 'Align right on the label', 'r')]));
    if (locked) propsBox.querySelectorAll('input,select,textarea,.tbtns button').forEach(x => { if (x !== nameIn) x.disabled = true; });
  }
  const alignBtn = (ic, label, how) => el('button', { type: 'button', class: 'icon-btn', 'aria-label': label, title: label, onclick: () => align(how) }, [icon(ic)]);
  function contentField(it, label, hint) {
    const ta = el('textarea', { name: 'text', rows: '2', maxlength: it.type === 'qr' ? '700' : '2000' }); ta.value = it.text;
    ta.addEventListener('input', () => { it.text = ta.value; draw(); ctx.commit('p:' + it.id + 'text'); refreshTree(); });
    const ins = el('select', { 'aria-label': 'Insert a field' }, [el('option', { value: '', text: 'Insert a field…' }), ...allFields().map(f => el('option', { value: f.key, text: f.label })), el('option', { value: '__date', text: 'A date with a sum (e.g. today + 3 years)…' })]);
    ins.addEventListener('change', async () => {
      if (!ins.value) return;
      const a = ta.selectionStart ?? ta.value.length, b = ta.selectionEnd ?? a;
      const tok = ins.value === '__date' ? await dateSumDialog() : `{${ins.value}}`;
      if (!tok) { ins.value = ''; return; }
      ta.value = ta.value.slice(0, a) + tok + ta.value.slice(b); ins.value = ''; ta.dispatchEvent(new Event('input')); ta.focus(); ta.setSelectionRange(a + tok.length, a + tok.length);
    });
    return el('div', {}, [el('label', { class: 'fld', style: 'margin-bottom:4px' }, [el('span', { text: label }), ta]), el('div', { class: 'insert' }, [ins]), hint ? el('p', { class: 'hint', text: hint }) : null]);
  }
  function textProps(it) {
    propsBox.append(el('hr'), contentField(it, 'Text', 'Words in {curly brackets} are filled in from each record. Type around them, e.g. Sown: {date}.'));
    propsBox.append(select('Font', it.font, Object.entries(FONTS).map(([k2, f]) => [k2, f.name]), v => { it.font = v; draw(); ctx.commit(); }));
    propsBox.append(el('div', { class: 'row' }, [num('Size', it.size, live(it, 'size'), { step: 0.5, min: 3, max: 200, unit: 'pt' }), num('Line spacing', it.lineH, live(it, 'lineH'), { step: 0.05, min: 0.8, max: 3, unit: '' })]));
    const tog = (ic, label, key) => { const b = el('button', { type: 'button', class: 'icon-btn', 'aria-pressed': it[key] ? 'true' : 'false', 'aria-label': label, title: label }, typeof ic === 'string' && ic.length > 2 ? [icon(ic)] : [el('b', { text: ic, style: key === 'italic' ? 'font-style:italic' : '' })]); b.addEventListener('click', () => { it[key] = !it[key]; b.setAttribute('aria-pressed', it[key] ? 'true' : 'false'); draw(); ctx.commit(); }); return b; };
    const alg = (ic, label, v) => { const b = el('button', { type: 'button', class: 'icon-btn', 'aria-pressed': it.align === v ? 'true' : 'false', 'aria-label': label, title: label }, [icon(ic)]); b.addEventListener('click', () => { it.align = v; draw(); ctx.commit(); refreshProps(); }); return b; };
    propsBox.append(el('div', { class: 'tbtns' }, [tog('B', 'Bold', 'bold'), tog('I', 'Italic', 'italic'), tog('AA', 'CAPITALS', 'upper'), alg('alignL', 'Left', 'left'), alg('alignC', 'Centre', 'center'), alg('alignR', 'Right', 'right')]));
    propsBox.append(el('div', { class: 'row' }, [
      select('Up and down', it.valign, [['top', 'Top'], ['middle', 'Middle'], ['bottom', 'Bottom']], v => { it.valign = v; draw(); ctx.commit(); }),
      select('When it is too long', it.fit, [['shrink', 'Shrink to fit'], ['wrap', 'Wrap onto more lines'], ['clip', 'Cut off with …']], v => { it.fit = v; draw(); ctx.commit(); })]));
    propsBox.append(el('div', { class: 'colors' }, [color('Colour', it.color, live(it, 'color'))]), check('Leave out when its fields are empty', it.hideEmpty, live(it, 'hideEmpty')));
  }
  function multiProps(items) {
    propsBox.append(el('h3', { text: `${items.length} items selected` }), el('p', { class: 'hint', text: 'Drag any of them to move them together.' }));
    propsBox.append(el('span', { class: 'lbl', text: 'Line up' }), el('div', { class: 'tbtns' }, [
      alignBtn('alignL', 'Line up left edges', 'l'), alignBtn('alignC', 'Line up centres', 'c'), alignBtn('alignR', 'Line up right edges', 'r'),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Line up tops', title: 'Line up tops', onclick: () => align('t') }, [el('b', { text: 'T' })]),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Line up middles', title: 'Line up middles', onclick: () => align('m') }, [el('b', { text: 'M' })]),
      el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Line up bottoms', title: 'Line up bottoms', onclick: () => align('b') }, [el('b', { text: 'B' })])]));
    if (items.length > 2) propsBox.append(el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Space evenly across', onclick: () => align('dh') }), el('button', { type: 'button', class: 'btn sm', text: 'Space evenly down', onclick: () => align('dv') })]));
    propsBox.append(el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Merge into group', onclick: group }), ...(canDemerge() ? [el('button', { type: 'button', class: 'btn sm', text: 'Demerge group', onclick: ungroup })] : []), el('button', { type: 'button', class: 'btn sm', text: 'Duplicate', onclick: duplicate }), el('button', { type: 'button', class: 'btn sm danger', text: 'Delete', onclick: deleteSel })]));
  }
  function labelProps() {
    const t = S.t;
    propsBox.append(el('h3', { text: 'Label' }), el('p', { class: 'hint', text: 'Nothing selected. These settings are for the whole label.' }));
    const nm = el('input', { type: 'text', value: t.name, maxlength: '80' });
    nm.addEventListener('input', () => { t.name = nm.value.slice(0, 80) || 'Untitled design'; ctx.commit('lname'); ctx.refreshTitle(); });
    propsBox.append(el('label', { class: 'fld' }, [el('span', { text: 'Design name' }), nm]));
    propsBox.append(select('Records it is for', t.kind, Object.entries(KINDS).map(([k2, v]) => [k2, v.name]), v => { t.kind = v; S.preview = ''; ctx.commit(); ctx.refreshAll(); }));
    if (t.kind === 'table') propsBox.append(el('p', { class: 'hint', text: t.columns.length ? 'Columns: ' + t.columns.join(', ') : 'Open your spreadsheet in step 2 (Records) and its columns appear in the palette.' }));
    const sz = (key, v) => { t[key] = Math.min(600, Math.max(key === 'w' ? 10 : 5, v)); ctx.commit('lsize'); layout(); draw(); if (S.zoomFit) fitZoom(); };
    propsBox.append(el('div', { class: 'row' }, [num('Width', t.w, v => sz('w', v), { min: 10, max: 600 }), num('Height', t.h, v => sz('h', v), { min: 5, max: 600 })]));
    const sizes = [];
    for (const L of Object.values(LAYOUTS)) for (const s of L.sizes) if (!sizes.some(x => x[0] === s[0] && x[1] === s[1])) sizes.push(s);
    propsBox.append(select('Common sizes', '', [['', 'Pick a size…'], ...sizes.map(s => [s[0] + 'x' + s[1], `${s[0]} × ${s[1]} mm`])], v => { if (!v) return; const [w, h] = v.split('x').map(Number); t.w = w; t.h = h; ctx.commit(); refreshProps(); layout(); draw(); S.zoomFit = true; fitZoom(); }));
    propsBox.append(el('div', { class: 'colors' }, [color('Background', t.bg, v => { t.bg = v; draw(); ctx.commit('lbg'); })]), num('Rounded corners (preview only)', t.radius, v => { t.radius = v; draw(); ctx.commit('lrad'); }, { min: 0, max: 50 }));
    // numbering
    const c = t.counter, ex = el('p', { class: 'hint' });
    const showEx = () => { ex.textContent = `Labels will be numbered ${numberText(c, 0)}, ${numberText(c, 1)}, ${numberText(c, 2)}… Put {number} in any text box or barcode (it is in the palette as "Number (counts up)").`; };
    const cset = (k, v) => { c[k] = v; showEx(); draw(); ctx.commit('counter' + k); };
    const txt = (label, k) => { const i = el('input', { type: 'text', value: c[k], maxlength: '20' }); i.addEventListener('input', () => cset(k, i.value.replace(/[{}]/g, ''))); return el('label', { class: 'fld' }, [el('span', { text: label }), i]); };
    propsBox.append(el('hr'), el('h3', { text: 'Numbering' }), el('div', { class: 'row' }, [txt('Before', 'prefix'), num('Start at', c.start, v => cset('start', Math.round(v)), { step: 1, min: 0, max: 99999999, unit: '' }), txt('After', 'suffix')]),
      el('div', { class: 'row' }, [num('Digits', c.digits, v => cset('digits', Math.round(v)), { step: 1, min: 1, max: 10, unit: '' }), num('Count by', c.step, v => cset('step', Math.round(v)), { step: 1, min: 1, max: 1000, unit: '' })]),
      check('Each copy gets its own number', c.perCopy, v => cset('perCopy', v)), ex);
    showEx();
    propsBox.append(el('hr'), check('Fold-over: print an upside-down copy below a fold line', t.fold.on, v => { t.fold.on = v; ctx.commit(); refreshProps(); layout(); draw(); if (S.zoomFit) fitZoom(); }));
    if (t.fold.on) propsBox.append(select('Gap for the fold', String(t.fold.gap), [['2', '2 mm (thin wire)'], ['5', '5 mm (stake or tube)'], ['10', '10 mm (thick stake)']], v => { t.fold.gap = +v; ctx.commit(); layout(); draw(); }));
    propsBox.append(el('hr'), select('Grid', String(S.grid), [['0.5', '0.5 mm'], ['1', '1 mm'], ['2', '2 mm'], ['5', '5 mm']], v => { S.grid = +v; ctx.savePrefs(); drawOverlay(); }), el('p', { class: 'hint', text: 'Hold Alt while dragging to place freely. Arrow keys move by 0.5 mm, with Shift by 5 mm.' }));
  }

  /* the record's fields, plus any the person made up by typing {Something} in a text box */
  function allFields() {
    const base = fieldsFor(S.t.kind, S.t.columns), have = new Set(base.map(f => f.key));
    const extra = usedFields(S.t).filter(k => !have.has(k)).map(k => ({ key: k, label: k }));
    const special = base.filter(f => ['today', 'year', 'number'].includes(f.key));
    return [...base.filter(f => !special.includes(f)), ...extra, ...special];
  }
  function defaultBarcode() {
    const keys = fieldsFor(S.t.kind, S.t.columns).map(f => f.key);
    return keys.includes('code') ? '{code}' : keys.includes('batch') ? '{title}' : S.t.kind === 'table' && S.t.columns[0] ? `{${S.t.columns[0]}}` : '{number}';
  }
  /* "A date with a sum": today or a record's date, plus or minus days, weeks, months or years */
  function dateSumDialog() {
    return new Promise(res => {
      let done = false;
      const bases = [['today', 'Today (the day you print)'], ...{ individual: [['date', 'Start date (sown or hatched)']], stock: [['year_packed', 'Packed or bought (year)'], ['best', 'Best before']], place: [], strain: [], table: S.t.columns.map(c2 => [c2, c2 + ' (written like 2026-10-16)']) }[S.t.kind]];
      const base = el('select', {}, bases.map(([v, l]) => el('option', { value: v, text: l })));
      const sign = el('select', { 'aria-label': 'Plus or minus' }, [el('option', { value: '+', text: 'plus' }), el('option', { value: '-', text: 'minus' })]);
      const amt = el('input', { type: 'number', min: '0', max: '9999', step: '1', value: '3', 'aria-label': 'How many' });
      const unit = el('select', { 'aria-label': 'Unit' }, [['y', 'years'], ['m', 'months'], ['w', 'weeks'], ['d', 'days']].map(([v, l]) => el('option', { value: v, text: l })));
      const out = el('p', { class: 'hint' });
      const tok = () => `{${base.value}${sign.value}${Math.max(0, Math.min(9999, parseInt(amt.value, 10) || 0))}${unit.value}}`;
      const show = () => { out.textContent = `Shows: ${fill(tok(), ctx.rowFor(S.preview || 'sample-p')).text || '(empty for this record)'}   ·   Code: ${tok()}`; };
      [base, sign, amt, unit].forEach(x => x.addEventListener('input', show));
      const d = dialog('A date with a sum', [
        el('p', { text: 'For a best-before or sow-by date, or a date to check eggs. It is worked out for each label when you print.' }),
        el('label', { class: 'fld' }, [el('span', { text: 'Start from' }), base]),
        el('div', { class: 'row' }, [el('label', { class: 'fld' }, [el('span', { text: 'Plus or minus' }), sign]), el('label', { class: 'fld' }, [el('span', { text: 'How many' }), amt]), el('label', { class: 'fld' }, [el('span', { text: 'Of' }), unit])]),
        out, el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Add it', onclick: () => { done = true; const v = tok(); d.close(); res(v); } })]),
      ], { onClose: () => { if (!done) res(null); } });
      show();
    });
  }
  function selChanged() {
    // keep only items that still exist and can be selected
    const ok = new Set(flatInfo().filter(f => !f.off && !f.hidden).map(f => f.it.id));
    S.sel = new Set([...S.sel].filter(id => ok.has(id)));
    drawOverlay(); refreshTree(); refreshProps();
  }
  /* shrink a photo to at most 1200 px and re-encode it (removes camera details such as location) */
  async function shrinkImage(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image(); img.src = url; await img.decode();
      const max = 1200, sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const png = file.type === 'image/png' || file.type === 'image/gif';
      let data = c.toDataURL(png ? 'image/png' : 'image/jpeg', 0.86);
      if (png && data.length > MAX_ASSET) data = c.toDataURL('image/jpeg', 0.86);   // a big PNG photo: JPEG is far smaller
      return data;
    } finally { URL.revokeObjectURL(url); }
  }

  const ro = new ResizeObserver(() => { if (S.zoomFit) fitZoom(); });
  ro.observe(canvas);
  return {
    el: view,
    show() { renderPalette(); fillPreview(); refreshTree(); refreshProps(); if (S.zoomFit) fitZoom(); else layout(); draw(); },
    refresh() { renderPalette(); fillPreview(); refreshTree(); refreshProps(); layout(); draw(); },
    redraw: draw, fitZoom, selChanged,
  };
}
export { LABEL_CSS, setLogo };

