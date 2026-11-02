/* LT-Planner: indoor growing, the drawing and the panels (rooms, shelves, trays, batches, occupancy, succession).
   app.js hands this module a small context so it does not need to know how the rest of the planner works. */
import * as I from './indoor.js';
import * as H from './hydro.js';
import * as H3 from './hydro3d.js';   // ports: where a hose or cable joins an item

const GROUP_FILL = { Microgreens: '#a8d67c', Seedlings: '#86c36f' }, STATUS_STROKE = { late: '#d9822b', ready: '#2f7d32', growing: '#3f6b2d', planned: '#8a9a8a', cleared: '#8a9a8a', empty: '#7a8a6a' };
const SIDE = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
const todayCrop = k => (I.CYCLES[k] ? I.CYCLES[k].name : '');

export function make(ctx) {
  const { el, sv, label, S, M, put, field, pickF, commit, toast, drawAll, byId, items, add } = ctx;
  const units = () => (S.plan.site.units === 'ft' ? 'ft' : 'm');
  const L = m => I.fmtLen(m, units());
  /* a length the member can type the way they think: 125, 125cm, 4'1", 49in */
  const lenF = (labelText, it, key, lo, hi) => {
    const inp = el('input', { value: L(it[key]), inputmode: 'text', 'aria-label': labelText, title: units() === 'ft' ? 'Type feet and inches, like 4\' 1", or 49 in, or 125 cm' : 'Type metres or centimetres, like 1.25 m or 125 cm' });
    inp.addEventListener('change', () => {
      let v = I.parseLen(inp.value, units()), note = '';
      /* a plain number is metres (or feet), so "30" for a light height is 30 m and is refused. Small fields are nearly always meant in centimetres (or inches): try that before giving up. */
      if (v != null && v > hi && /^\s*\d+(?:[.,]\d+)?\s*$/.test(inp.value) && (Number.isInteger(+inp.value.trim().replace(',', '.')) || +inp.value.trim().replace(',', '.') >= 10)) { /* only a number over the top, and only a whole number or 10 and up: 1.2 or 3.5 was meant as metres and is refused, 30 or 30.5 was meant as centimetres */ const alt = I.parseLen(inp.value.trim() + (units() === 'ft' ? ' in' : ' cm'), units()); if (alt != null && alt >= lo && alt <= hi) { v = alt; note = 'Taken as ' + inp.value.trim() + (units() === 'ft' ? ' inches' : ' cm') + '.'; } }
      if (v == null || v < lo || v > hi) { toast('Type a length between ' + L(lo) + ' and ' + L(hi) + ', like ' + L(Math.min(hi, Math.max(lo, units() === 'ft' ? 0.3048 : 0.3))) + '.'); inp.value = L(it[key]); return; }
      it[key] = Math.round(v * 1000) / 1000; commit(); if (note) toast(note);
    });
    return el('label', { class: 'small pl-field' }, [labelText, inp]);
  };
  /* looking down on a shelf the tiers sit on top of each other: pick one tier to work on, the others fade back and cannot be clicked */
  const tierViewF = (maxTiers) => {
    const sl = el('select', { 'aria-label': 'Show tier', onchange: e => { S.tierView = +e.target.value || 0; drawAll(); } }, [el('option', { value: '0', text: 'All tiers (they overlap from above)' }), ...Array.from({ length: maxTiers }, (_, i) => el('option', { value: String(i + 1), text: 'Only tier ' + (i + 1) }))]);
    sl.value = String(S.tierView || 0);
    return el('label', { class: 'small pl-field' }, ['Show on the plan', sl]);
  };
  const roomsOf = list => list.filter(i => i.kind === 'room' && !i.off);
  const shelvesOf = list => list.filter(i => i.kind === 'shelf' && !i.off);
  const traysOf = list => list.filter(i => i.kind === 'tray' && !i.off);
  const gearOf = list => list.filter(i => i.kind === 'gear' && !i.off);
  const GEAR_FILL = { Lights: '#ffe27a', Heat: '#f3a37a', Air: '#9fd0e8', Humidity: '#a9c6f0', Control: '#cfc7e6', Water: '#8cc3dc', Covers: '#d8d2c0' }, GEAR_LETTER = { Lights: 'L', Heat: 'H', Air: 'F', Humidity: 'M', Control: 'C', Water: 'W', Covers: 'B' };

  /* ---------- 2D drawing ---------- */
  function draw(grp, it, plan, faded, within) {
    const tf = `translate(${it.x} ${it.y}) rotate(${it.rot})`, px = S.view.scale;
    const wrap = n => { n.setAttribute('transform', tf); grp.append(n); return n; };
    if (it.kind === 'hydro') { drawHydro(grp, it, plan, wrap); return; }
    if (it.kind === 'conn') { drawConn(grp, it, within); return; }
    if (it.kind === 'room') {
      const t = Math.max(it.style === 'tent' ? 0.03 : 0.1, 1.5 / px), wc = it.style === 'tent' ? '#2f3438' : '#8d877a';
      wrap(sv('rect', { x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, fill: it.floorColour, 'fill-opacity': 0.5 }));
      wrap(sv('rect', { x: -it.w / 2 + t / 2, y: -it.h / 2 + t / 2, width: it.w - t, height: it.h - t, fill: 'none', stroke: wc, 'stroke-width': t, 'stroke-linejoin': 'miter' }));
      if (!it.noDoor) {
        const [sx, sy] = SIDE[it.door.side], horiz = sy !== 0, len = horiz ? it.w : it.h, dw = Math.min(it.door.w, len - 2 * t), c = -len / 2 + t + dw / 2 + it.door.pos * Math.max(0, len - 2 * t - dw);
        const cx = horiz ? c : sx * (it.w / 2 - t / 2), cy = horiz ? sy * (it.h / 2 - t / 2) : c;
        wrap(sv('rect', { x: cx - (horiz ? dw / 2 : t / 2 + 0.002), y: cy - (horiz ? t / 2 + 0.002 : dw / 2), width: horiz ? dw : t + 0.004, height: horiz ? t + 0.004 : dw, fill: it.floorColour }));
        if (it.style === 'tent') wrap(sv('line', { x1: horiz ? cx - dw / 2 : cx, y1: horiz ? cy : cy - dw / 2, x2: horiz ? cx + dw / 2 : cx, y2: horiz ? cy : cy + dw / 2, stroke: '#9aa3a8', 'stroke-width': 1.5, 'stroke-dasharray': '4 3', 'vector-effect': 'non-scaling-stroke' }));
        else {   // the door leaf and its swing, opening into the room
          const hx = horiz ? cx - dw / 2 : cx, hy = horiz ? cy : cy - dw / 2, ix = -sx, iy = -sy, ex = horiz ? hx : hx + ix * dw, ey = horiz ? hy + iy * dw : hy, ax = horiz ? hx + dw : hx, ay = horiz ? hy : hy + dw;
          wrap(sv('path', { d: `M${hx} ${hy}L${ex} ${ey}M${ax} ${ay}A${dw} ${dw} 0 0 ${horiz ? (iy > 0 ? 0 : 1) : (ix > 0 ? 1 : 0)} ${ex} ${ey}`, fill: 'none', stroke: '#8d877a', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
        }
      }
      grp.append(label(it.name, it.x, it.y + it.h / 2 + 0.05, false));
      if (S.show && it.w * px > 70) { const l2 = label(L(it.w) + ' × ' + L(it.h) + ' · ' + L(it.ceilH) + ' high', it.x, it.y + it.h / 2 + 0.05 + 14 / px, false); l2.setAttribute('class', 'pl-label pl-sub'); grp.append(l2); }
      return;
    }
    if (it.kind === 'shelf') {
      wrap(sv('rect', { x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, fill: '#d3d8de', 'fill-opacity': 0.85, stroke: '#59636e', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
      const post = Math.max(0.03, 2.5 / px), pp = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => `M${a * (it.w / 2 - post / 2) - post / 2} ${b * (it.h / 2 - post / 2) - post / 2}h${post}v${post}h${-post}z`).join('');
      wrap(sv('path', { d: pp, fill: '#3f4852' }));
      const n = traysOf(items()).filter(t => t.shelf === it.id).length;
      grp.append(label(it.name, it.x, it.y + it.h / 2 + 0.05, false));
      if (S.show && it.w * px > 50) { const l2 = label(it.tiers + (it.tiers === 1 ? ' tier' : ' tiers') + (n ? ' · ' + n + (n === 1 ? ' tray' : ' trays') : ''), it.x, it.y + it.h / 2 + 0.05 + 14 / px, false); l2.setAttribute('class', 'pl-label pl-sub'); grp.append(l2); }
      return;
    }
    if (it.kind === 'gear') {
      const e = I.EQUIP[it.item] || I.EQUIP.led_bar, all = items(), cv = (S.sel.has(it.id) || S.showCover) ? I.coverage(it) : null, idle = I.matUnused(it, all);
      if (cv) { const r = sv('rect', { x: -cv.w / 2, y: -cv.h / 2, width: cv.w, height: cv.h, fill: '#ffe27a', 'fill-opacity': 0.14, stroke: '#d9a400', 'stroke-width': 1, 'stroke-dasharray': '5 4', 'vector-effect': 'non-scaling-stroke' }); wrap(r); }
      wrap(sv('rect', { x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, fill: GEAR_FILL[e.group] || '#ddd', stroke: idle ? '#d9822b' : '#5a5a5a', 'stroke-width': idle ? 2.2 : 1, 'vector-effect': 'non-scaling-stroke', rx: Math.min(0.02, it.h / 4) }));
      if (S.tierView && it.tier && it.tier !== S.tierView) { grp.setAttribute('opacity', 0.12); grp.setAttribute('pointer-events', 'none'); }
      const sz = Math.max(it.w, it.h) * px;
      if (sz > 16) grp.append(label(GEAR_LETTER[e.group] || '?', it.x, it.y, true));
      if (sz > 70) grp.append(label(it.name, it.x, it.y + it.h / 2 + 0.03, false));
      return;
    }
    if (it.kind === 'tray') {
      const cy = I.cycleOf(it.crop), st = I.status(it, plan.date), all = items(), bad = ctxClash(all).has(it.id), sh = it.shelf && all.find(x => x.id === it.shelf);
      const fill = cy ? GROUP_FILL[cy.group] : '#e3ecd5';
      if (st === 'planned') grp.setAttribute('opacity', 0.45);
      if (S.tierView && it.tier && it.tier !== S.tierView) { grp.setAttribute('opacity', 0.12); grp.setAttribute('pointer-events', 'none'); }   // looking at one tier: the others fade back
      wrap(sv('rect', { x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, rx: Math.min(0.02, it.w / 12), fill, 'fill-opacity': st === 'cleared' ? 0.35 : 0.95, stroke: bad ? '#c4372b' : STATUS_STROKE[st], 'stroke-width': bad || st === 'late' || st === 'ready' ? 2.5 : 1.2, 'vector-effect': 'non-scaling-stroke' }));
      const pr = I.TRAY_PRESETS[it.kind2];
      if (pr && pr.cells > 1 && it.w * px > 40) { const cols = pr.cells === 72 ? 12 : pr.cells === 128 ? 16 : 0, rows = cols ? pr.cells / cols : 0; if (cols) { let d = ''; for (let i = 1; i < cols; i++) d += `M${-it.w / 2 + it.w * i / cols} ${-it.h / 2}v${it.h}`; for (let j = 1; j < rows; j++) d += `M${-it.w / 2} ${-it.h / 2 + it.h * j / rows}h${it.w}`; wrap(sv('path', { d, stroke: '#3f6b2d', 'stroke-opacity': 0.35, 'stroke-width': 0.6, 'vector-effect': 'non-scaling-stroke', fill: 'none' })); } }
      if (it.w * px > 46) { const txt = (cy ? cy.name : it.name) + (sh && it.tier ? ' · T' + it.tier : ''); grp.append(label(txt, it.x, it.y, true)); }
      else if (it.w * px > 18 && it.tier) grp.append(label('T' + it.tier, it.x, it.y, true));
      return;
    }
  }
  let clashMemo = null, depMemo = null;
  /* select a pump or reservoir and the systems it feeds are outlined */
  const fedSet = () => depMemo || (depMemo = new Set([...S.sel].flatMap(id => { const x = byId(id); return x && x.kind === 'gear' ? H.dependsOn(id, items()) : []; })));
  const frame = () => { clashMemo = null; depMemo = null; if (S.tierView) { const mx = Math.max(0, ...items().filter(i => i.kind === 'shelf').map(i => i.tiers || 0)); if (S.tierView > mx) S.tierView = 0; } };   // app.js calls this at the start of every redraw, so the overlap list is worked out once per redraw
  function ctxClash(all) { if (clashMemo && clashMemo.all === all) return clashMemo.ids; const ids = new Set(); for (const [a, b] of I.clashes(all)) { ids.add(a); ids.add(b); } clashMemo = { all, ids }; return ids; }

  /* ---------- placing: a new tray lands on the shelf under it, on the first free tier; a new room goes under shelves ---------- */
  function newTray(base, kind2) {
    const all = items(), pr = I.TRAY_PRESETS[kind2] || I.TRAY_PRESETS.flat1020, cx = base.x, cy = base.y;
    const on = shelvesOf(all).slice().reverse().find(sh => { const g = I.inShelf({ x: cx, y: cy, w: 0.01, h: 0.01, rot: sh.rot }, sh); return Math.abs(g.x) <= sh.w / 2 && Math.abs(g.y) <= sh.h / 2; });
    const o = Object.assign({}, base, { kind: 'tray', kind2: I.TRAY_PRESETS[kind2] ? kind2 : 'flat1020', w: pr.w, h: pr.h, name: 'Tray', rot: 0 });
    if (on) {
      const trays = traysOf(all), tier = S.tierView && S.tierView <= on.tiers ? S.tierView : I.pickTier(on, cx, cy, pr.w, pr.h, trays), spots = I.freeSpots(on, tier, pr.w, pr.h, trays), near = spots.sort((a, b) => Math.hypot(a.x - cx, a.y - cy) - Math.hypot(b.x - cx, b.y - cy))[0];
      Object.assign(o, { shelf: on.id, tier, rot: on.rot }); if (near) { o.x = near.x; o.y = near.y; }
    }
    return o;
  }
  function addRoomBelow(raw) {   // rooms draw first so shelves and trays stay clickable on top of them
    const list = items(), first = list.findIndex(i => i.kind === 'shelf' || i.kind === 'tray' || i.kind === 'gear');
    add(raw);
    if (first >= 0) { const n = list.pop(); list.splice(first, 0, n); }
  }

  /* ---------- panels ---------- */
  const presetOpts = (map, extra) => [...Object.entries(map).map(([k, v]) => [k, v.name]), ...(extra || [])];
  const applyRoomPreset = (it, key) => { const p = I.ROOM_PRESETS[key]; if (!p) return; Object.assign(it, { style: p.style, w: p.w, h: p.h, ceilH: p.ceilH }); commit(); };
  const colourF = (labelText, it, key) => field(labelText, it[key], v => { if (/^#[0-9a-f]{6}$/i.test(v)) it[key] = v; }, { type: 'color' });
  function roomPanel(it) {
    const sel = el('select', { 'aria-label': 'Start from a preset size', onchange: e => { if (e.target.value) applyRoomPreset(it, e.target.value); } }, [el('option', { value: '', text: 'Choose a size…' }), ...Object.entries(I.ROOM_PRESETS).map(([k, v]) => el('option', { value: k, text: v.name }))]);
    const cnt = traysOf(items()).filter(t => { const sh = items().find(x => x.id === t.shelf); return sh && inRoom(it, sh); }).length;
    put(el('label', { class: 'small pl-field' }, ['Preset', sel]),
      pickF('Type', it, 'style', [['room', 'Room (walls)'], ['tent', 'Grow tent (fabric walls)']]),
      el('div', { class: 'pl-row' }, [lenF('Width', it, 'w', 0.3, 60), lenF('Depth', it, 'h', 0.3, 60)]),
      lenF('Ceiling height', it, 'ceilH', 0.5, 8),
      el('p', { class: 'small muted', text: 'Floor area ' + I.fmtArea(it.w * it.h, units()) + (cnt ? ' · ' + cnt + (cnt === 1 ? ' tray' : ' trays') + ' inside' : '') + '. Move shelves inside it; the room is drawn under them.' }),
      tentWarn(it),
      (() => { const cb = el('input', { type: 'checkbox', checked: !it.noDoor, onchange: e => { if (e.target.checked) delete it.noDoor; else it.noDoor = true; commit(); } }); return el('label', { class: 'small pl-check' }, [cb, it.style === 'tent' ? ' Zip door' : ' Door']); })(),
      it.noDoor ? null : pickF('Door on the', it.door, 'side', [['s', 'Bottom wall'], ['n', 'Top wall'], ['w', 'Left wall'], ['e', 'Right wall']]),
      it.noDoor ? null : field('Door position along the wall (0 to 100%)', Math.round(it.door.pos * 100), v => { if (Number.isFinite(v)) it.door.pos = Math.min(100, Math.max(0, Math.round(v))) / 100; }, { type: 'number', step: '5', min: '0', max: '100', inputmode: 'numeric' }),
      it.noDoor ? null : lenF('Door width', it.door, 'w', 0.2, 3),
      el('div', { class: 'pl-row' }, [colourF('Walls', it, 'wallColour'), colourF('Floor', it, 'floorColour')]),
      hydroPicker(() => [it.x, it.y]),
      el('p', { class: 'small muted', text: 'The planner lays out space. It does not check ventilation, power, fire or structure: ask a qualified person about those.' }));
  }
  const tentWarn = it => (it.style === 'tent' && it.ceilH < 1.2 ? el('p', { class: 'small pl-warn', text: 'A very low tent: check there is room for your tallest crop plus a light above it.' }) : null);
  const inRoom = (room, it) => { const g = I.inShelf({ x: it.x, y: it.y, w: 0.01, h: 0.01, rot: room.rot }, room); return Math.abs(g.x) <= room.w / 2 && Math.abs(g.y) <= room.h / 2; };

  /* A `title` is help a mouse finds by hovering; a finger never sees it.  Where the text is real help rather
     than a repeat of the label, this puts it on the page as well when the planner is in touch mode. */
  const touch = () => document.body.classList.contains('ctl-touch');
  const alsoSay = t => (touch() && t ? el('p', { class: 'small muted', text: t }) : null);
  function shelfPanel(it) {
    const all = items(), trays = traysOf(all).filter(t => t.shelf === it.id), sel = el('select', { 'aria-label': 'Start from a preset', onchange: e => { const p = I.SHELF_PRESETS[e.target.value]; if (p) { Object.assign(it, { w: p.w, h: p.h, tiers: p.tiers, tierGap: p.tierGap }); commit(); } } }, [el('option', { value: '', text: 'Choose a shelf…' }), ...Object.entries(I.SHELF_PRESETS).map(([k, v]) => el('option', { value: k, text: v.name }))]);
    const topH = it.base + (it.tiers - 1) * it.tierGap, kinds = Object.entries(I.TRAY_PRESETS).map(([k, v]) => [k, v.name]);
    const fillKind = el('select', { 'aria-label': 'Tray size to add' }, kinds.map(([v, l]) => el('option', { value: v, text: l }))), fillTier = el('select', { 'aria-label': 'Tier to fill' }, Array.from({ length: it.tiers }, (_, i) => el('option', { value: String(i + 1), text: 'Tier ' + (i + 1) })));
    put(el('label', { class: 'small pl-field' }, ['Preset', sel]),
      el('div', { class: 'pl-row' }, [lenF('Width', it, 'w', 0.1, 10), lenF('Depth', it, 'h', 0.1, 10)]),
      field('Tiers', it.tiers, v => {
        if (!Number.isFinite(v)) return;
        it.tiers = Math.min(6, Math.max(1, Math.round(v)));
        // everything standing on this shelf comes down together: lights left on a tier that no longer exists
        // used to hang in mid air in the 3D view and never light anything
        let moved = 0;
        for (const t of all) if ((t.kind === 'tray' || t.kind === 'gear') && t.shelf === it.id && t.tier > it.tiers) { t.tier = it.tiers; moved++; }
        if (moved) toast(moved + (moved === 1 ? ' thing was' : ' things were') + ' on a tier that has gone, so ' + (moved === 1 ? 'it is' : 'they are') + ' now on the top tier.', 5000);
      }, { type: 'number', step: '1', min: '1', max: '6', inputmode: 'numeric' }),
      el('div', { class: 'pl-row' }, [lenF('Gap between tiers', it, 'tierGap', 0.1, 1.5), lenF('Lowest tier is', it, 'base', 0, 1)]),
      el('p', { class: 'small muted', text: 'Top tier about ' + L(topH + it.tierT) + ' above the floor. Space above a tray on a tier: about ' + L(Math.max(0, it.tierGap - it.tierT)) + ' (for the plant and its light). An estimate from the sizes you typed.' }),
      el('p', { class: 'small', text: trays.length + (trays.length === 1 ? ' tray' : ' trays') + ' on this shelf. A tier takes about ' + I.capacity(it, 0.543, 0.279) + ' full flats (estimate).' }),
      tierViewF(it.tiers),
      el('div', { class: 'pl-row' }, [el('label', { class: 'small pl-field' }, ['Fill with', fillKind]), el('label', { class: 'small pl-field' }, ['Which tier', fillTier])]),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Fill the tier with trays', onclick: () => fillTierWith(it, +fillTier.value, fillKind.value) }), el('button', { type: 'button', class: 'btn sm', text: 'Fill every tier', onclick: () => { for (let n = 1; n <= it.tiers; n++) fillTierWith(it, n, fillKind.value, true); commit(); } })]));
  }
  function fillTierWith(shelf, tier, kind, quiet) {
    const pr = I.TRAY_PRESETS[kind] || I.TRAY_PRESETS.flat1020, spots = I.freeSpots(shelf, tier, pr.w, pr.h, traysOf(items())), room = I.LIMITS.trays - items().filter(i => i.kind === 'tray').length;
    if (!spots.length) { if (!quiet) toast(I.capacity(shelf, pr.w, pr.h) ? 'That tier is already full.' : 'That tray is bigger than the shelf.'); return; }
    const use = spots.slice(0, Math.max(0, room)); if (!use.length) { toast('That is the most trays a plan can hold.'); return; }
    const n = traysOf(items()).length;
    use.forEach((s, i) => { const t = M.cleanPlan({ format: M.FORMAT, version: 1, items: [{ id: M.newId(), kind: 'tray', name: 'Tray ' + (n + i + 1), kind2: kind, x: s.x, y: s.y, rot: s.rot }] }).items[0]; t.shelf = shelf.id; t.tier = tier; items().push(t); });
    if (!quiet) commit();
  }

  const fmtD = d => { if (!d) return ''; const [y, m, dd] = d.split('-'); return +dd + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][+m - 1]; };
  function trayPanel(it) {
    const all = items(), shelves = shelvesOf(all), cy = I.cycleOf(it.crop), tl = cy && it.sow ? I.timeline(cy, it.sow, it.actual, it.reset) : null;
    const kindSel = el('select', { 'aria-label': 'Tray size', onchange: e => { it.kind2 = e.target.value; S.trayKind = it.kind2; const p = I.TRAY_PRESETS[it.kind2]; if (p) { it.w = p.w; it.h = p.h; } commit(); } }, [...Object.entries(I.TRAY_PRESETS).map(([k, v]) => el('option', { value: k, text: v.name })), el('option', { value: 'custom', text: 'Custom size' })]); kindSel.value = it.kind2;
    const shelfSel = el('select', { 'aria-label': 'Which shelf', onchange: e => { const v = e.target.value; if (!v) { delete it.shelf; delete it.tier; } else { it.shelf = v; it.tier = Math.min(it.tier || 1, shelves.find(s => s.id === v).tiers); } commit(); } }, [el('option', { value: '', text: 'Not on a shelf' }), ...shelves.map(s => el('option', { value: s.id, text: s.name }))]); shelfSel.value = it.shelf || '';
    const sh = it.shelf && shelves.find(s => s.id === it.shelf), cropSel = el('select', { 'aria-label': 'Crop', onchange: e => { if (e.target.value) it.crop = e.target.value; else { delete it.crop; delete it.actual; } commit(); } }, [el('option', { value: '', text: 'No crop yet' }), ...['Microgreens', 'Seedlings'].map(g => el('optgroup', { label: g }, Object.entries(I.CYCLES).filter(([, c]) => c.group === g).map(([k, c]) => el('option', { value: k, text: c.name }))))]); cropSel.value = it.crop || '';
    put(el('label', { class: 'small pl-field' }, ['Tray size', kindSel]),
      it.kind2 === 'custom' ? el('div', { class: 'pl-row' }, [lenF('Length', it, 'w', 0.03, 3), lenF('Width', it, 'h', 0.03, 3)]) : el('p', { class: 'small muted', text: L(it.w) + ' × ' + L(it.h) + (I.TRAY_PRESETS[it.kind2] && I.TRAY_PRESETS[it.kind2].cells > 1 ? ' · ' + I.TRAY_PRESETS[it.kind2].cells + ' cells' : '') }),
      el('label', { class: 'small pl-field' }, ['Shelf', shelfSel]),
      sh ? field('Tier (1 = lowest)', it.tier || 1, v => { if (Number.isFinite(v)) it.tier = Math.min(sh.tiers, Math.max(1, Math.round(v))); }, { type: 'number', step: '1', min: '1', max: String(sh.tiers), inputmode: 'numeric' }) : null,
      sh && I.overhangs(it, sh) ? el('p', { class: 'small pl-warn', text: 'This tray hangs over the edge of its shelf. Move it back on, or make the shelf deeper.' }) : null,
      ctxClash(all).has(it.id) ? el('p', { class: 'small pl-warn', text: 'This tray overlaps another one on the same tier' + (clashKind(all, it.id) === 'time' ? ' while both are growing. Move one, or sow it after the other is cleared.' : '.') }) : null,
      ctx.sec && ctx.sec('Batch (what is growing here)'),
      el('label', { class: 'small pl-field' }, ['Crop', cropSel]),
      cy ? field('Sown on', it.sow || '', v => { it.sow = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }, { type: 'date' }) : null,
      cy && cy.soakH ? el('p', { class: 'small muted', text: 'Typical: soak the seed about ' + cy.soakH + ' hours first.' }) : null,
      cy && cy.seedG ? el('p', { class: 'small muted', text: 'Typical seed for a full 1020 flat: about ' + I.fmtMass(cy.seedG, units()) + (cy.group === 'Microgreens' ? ' (varies with seed size and your method).' : '.') }) : null,
      cy && cy.cell ? el('p', { class: 'small muted', text: 'Typical cells: ' + cy.cell + '. Germination about ' + (units() === 'ft' ? Math.round(cy.temp[0] * 1.8 + 32) + '–' + Math.round(cy.temp[1] * 1.8 + 32) + ' °F' : cy.temp[0] + '–' + cy.temp[1] + ' °C') + (cy.light === 'dark' ? '; this seed needs light to germinate, so do not bury it.' : '.') }) : null,
      tl ? timelineBlock(it, cy, tl) : null,
      cy ? field('Seed used (' + (units() === 'ft' ? 'oz' : 'g') + ')', units() === 'ft' ? Math.round(it.qty / 28.3495 * 10) / 10 : it.qty, v => { if (Number.isFinite(v) && v >= 0) it.qty = Math.round((units() === 'ft' ? v * 28.3495 : v) * 10) / 10; }, { type: 'number', step: '1', min: '0', inputmode: 'decimal' }) : null,
      field('Notes', it.note, v => { it.note = String(v).slice(0, 200); }, { maxlength: '200' }),
      cy ? learnedLine(all, it.crop) : null,
      trayToSystemBlock(it),
      cy && it.sow ? el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: it.cleared ? 'Start the next batch' : 'Harvested: clear the tray', title: 'Keeps this batch in the tray history and empties the tray', onclick: () => { const d = S.plan.date < it.sow ? it.sow : S.plan.date; if (it.cleared) { I.nextBatch(it, it.cleared, it.crop, ''); } else { it.cleared = d; } commit(); } })]) : null,
      alsoSay(cy && it.sow ? 'Keeps this batch in the tray\u2019s history and empties it for the next sowing.' : ''),
      it.history && it.history.length ? el('details', { class: 'pl-sides' }, [el('summary', { class: 'small', text: 'Earlier batches in this tray (' + it.history.length + ')' }), el('div', {}, it.history.slice().reverse().map(h => el('p', { class: 'small', text: todayCrop(h.crop) + ' · sown ' + fmtD(h.sow) + (h.cleared ? ', cleared ' + fmtD(h.cleared) + ' (' + I.daysBetween(h.sow, h.cleared) + ' days)' : '') + (h.note ? ' · ' + h.note : '') })))]) : null,
      el('p', { class: 'small muted', text: 'Typical numbers from extension and grower guides. Your room, seed and light will differ: log what happens and the planner shows your own averages.' }));
  }
  const clashKind = (all, id) => { const c = I.clashes(all).find(x => x[0] === id || x[1] === id); return c ? c[2] : ''; };
  function learnedLine(all, crop) {
    const l = I.learned(all, crop), cy = I.cycleOf(crop); if (!l) return null;
    const typ = cy.stages.reduce((n, s) => n + s[3], 0);
    return el('p', { class: 'small', text: 'Your ' + cy.name.toLowerCase() + ': ' + l.n + (l.n === 1 ? ' batch' : ' batches') + ', cleared after ' + l.avg + ' days on average (' + l.min + '–' + l.max + '). Typical is ' + typ + '.' });
  }
  function timelineBlock(it, cy, tl) {
    const rows = tl.stages.map(s => {
      const inp = el('input', { type: 'date', value: it.actual && it.actual[s.key] || '', 'aria-label': 'Done on: ' + s.label, onchange: e => { if (e.target.value && /^\d{4}-\d{2}-\d{2}$/.test(e.target.value)) { it.actual = Object.assign(it.actual || {}, { [s.key]: e.target.value }); } else if (it.actual) { delete it.actual[s.key]; if (!Object.keys(it.actual).length) delete it.actual; } commit(); } });
      return el('div', { class: 'pl-stage' }, [el('b', { class: 'small', text: s.label }), el('span', { class: 'small', text: s.actual ? ' done ' + fmtD(s.endExp) : ' ends ' + fmtD(s.endEarly) + ' / ' + fmtD(s.endExp) + ' / ' + fmtD(s.endLate) }), el('label', { class: 'small pl-field' }, ['Done on (log it)', inp])]);
    });
    return el('div', { class: 'pl-timeline' }, [el('p', { class: 'small', text: 'Early / expected / late' }), ...rows,
      el('p', { class: 'small', text: (cy.group === 'Seedlings' ? 'Ready to plant out ' : 'Ready to harvest ') + fmtD(tl.readyEarly) + ' / ' + fmtD(tl.readyExp) + ' / ' + fmtD(tl.readyLate) + '. Space free again about ' + fmtD(tl.freeExp) + ' (' + tl.reset + ' days to clean and reset).' }),
      field('Days to clean and reset', it.reset != null ? it.reset : cy.reset, v => { if (Number.isFinite(v)) it.reset = Math.min(30, Math.max(0, Math.round(v))); }, { type: 'number', step: '1', min: '0', max: '30', inputmode: 'numeric' }),
      field('Cleared on', it.cleared || '', v => { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) it.cleared = v; else delete it.cleared; }, { type: 'date' })]);
  }


  /* ---------- hydro systems and the links between equipment ---------- */
  const MEDIUM = { water: { col: '#2a7fbf', dash: '', ch: 'W', name: 'Water' }, air: { col: '#6f757b', dash: '7 4', ch: 'A', name: 'Air' }, power: { col: '#e08a1e', dash: '7 4', ch: 'P', name: 'Power' }, control: { col: '#7b4bb0', dash: '2 4', ch: 'C', name: 'Control' } };
  const STATUS_FILL = { growing: '#86c36f', ready: '#2f7d32', late: '#d9822b', planned: '#d6d6d6', cleared: '#eeeeee', empty: '#ffffff' };
  const itemName = i => (i ? i.name || (i.kind === 'hydro' ? H.HYDRO_TYPES[i.type].name : i.kind) : '');
  const r2 = v => Math.round(v * 100) / 100;
  function drawHydro(grp, it, plan, wrap) {
    const px = S.view.scale, st = I.status(it, plan.date), cy = I.cycleOf(it.crop), fill = STATUS_FILL[st] || '#fff', sp = Math.max(0.05, it.spacing), dots = [];
    wrap(sv('rect', { x: -it.w / 2, y: -it.h / 2, width: it.w, height: it.h, fill: '#d4e8f4', 'fill-opacity': 0.92, stroke: fedSet().has(it.id) ? '#e08a1e' : '#2f6f94', 'stroke-width': fedSet().has(it.id) ? 4 : 1.6, 'vector-effect': 'non-scaling-stroke', rx: Math.min(0.03, it.h / 8) }));
    let r = Math.min(0.06, sp * 0.32);
    if (it.type === 'nft') {
      const pitch = it.h / it.channels, strip = Math.min(0.1, pitch * 0.5); r = Math.min(r, pitch * 0.3);
      for (let c = 0; c < it.channels; c++) { const y = -it.h / 2 + pitch * (c + 0.5); wrap(sv('rect', { x: -it.w / 2 + 0.02, y: y - strip / 2, width: Math.max(0.01, it.w - 0.04), height: strip, fill: '#8fbfdc', stroke: '#2f6f94', 'stroke-width': 0.6, 'vector-effect': 'non-scaling-stroke' })); const n = Math.max(1, Math.floor(it.w / sp)); for (let k = 0; k < n && dots.length < 400; k++) dots.push([-it.w / 2 + (k + 0.5) * it.w / n, y]); }
    } else if (it.type === 'tower') {
      const n = H.sites(it), rr = Math.min(it.w, it.h) * 0.34; r = Math.min(0.03, rr * 0.4);
      for (let k = 0; k < n && dots.length < 400; k++) { const a = k / n * Math.PI * 2 * Math.max(1, Math.round(n / 8)); dots.push([Math.cos(a) * rr * (0.55 + 0.45 * ((k % 4) / 3)), Math.sin(a) * rr * (0.55 + 0.45 * ((k % 4) / 3))]); }
    } else {
      const cols = Math.max(1, Math.floor(it.w / sp)), rows = Math.max(1, Math.floor(it.h / sp));
      for (let a = 0; a < rows; a++) for (let b = 0; b < cols; b++) if (dots.length < 400) dots.push([-it.w / 2 + (b + 0.5) * it.w / cols, -it.h / 2 + (a + 0.5) * it.h / rows]);
    }
    r = Math.max(0.01, r);
    wrap(sv('path', { d: dots.map(([x, y]) => `M${x - r} ${y}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`).join(''), fill, stroke: '#3f6b2d', 'stroke-width': 0.8, 'vector-effect': 'non-scaling-stroke' }));
    grp.append(label(it.name, it.x, it.y + it.h / 2 + 0.05, false));
    if (S.show && it.w * px > 70) { const l2 = label(H.HYDRO_TYPES[it.type].name + ' · ' + H.sites(it) + ' sites' + (cy ? ' · ' + cy.name : ''), it.x, it.y + it.h / 2 + 0.05 + 14 / px, false); l2.setAttribute('class', 'pl-label pl-sub'); grp.append(l2); }
  }
  const connProblem = (c, within) => { const find = id => (within ? within.find(x => x.id === id) : byId(id)); return H.linkProblem(c, find(c.from), find(c.to)); };
  function drawConn(grp, it, within) {
    const m = MEDIUM[it.medium] || MEDIUM.water, [a, b] = it.pts, bad = connProblem(it, within), px = S.view.scale;
    grp.append(sv('line', { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: bad ? '#c4372b' : m.col, 'stroke-width': 3, 'stroke-dasharray': m.dash || null, 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', opacity: 0.9 }));
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, free = it.free === true;
    if (free) { const ln = grp.lastChild; ln.setAttribute('stroke', '#d0432f'); ln.setAttribute('stroke-dasharray', '3 5'); }   // unlocked: the line stays where it was left, drawn stretched and red
    for (const q of [a, b]) grp.append(sv('circle', { cx: q[0], cy: q[1], r: 5 / px, fill: free ? '#fff' : '#3f9b4a', stroke: free ? '#d0432f' : '#fff', 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));   // green end = locked on, white end = loose
    grp.append(sv('circle', { cx: mx, cy: my, r: 8 / px, fill: '#fff', stroke: bad ? '#c4372b' : free ? '#d0432f' : m.col, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
    grp.append(label(bad ? '!' : free ? '~' : m.ch, mx, my, true));
  }
  /* ---- ports: dots on an item where a hose or cable joins ---- */
  const linkable = i => (i.kind === 'gear' || i.kind === 'hydro') && !i.off && !i.hidden;
  const portName = (it, pid) => { const P = H3.portsOf(it).find(q => q.id === pid); return P ? P.label : pid; };
  const portUsed = (it, pid) => items().some(c => c.kind === 'conn' && !c.free && ((c.from === it.id && c.fp === pid) || (c.to === it.id && c.tp === pid)));
  /* The dots show on a picked item, and on every item while connecting.  While a hose is being pulled, ports it can join glow and the rest fade. */
  /* where a port's dot is drawn: just outside the item's edge and spread apart, so the dots on a small pump or timer can each be hit with a finger */
  function dotAt(it, P, pos, r, plist, gap) {
    const same = (plist || H3.portsOf(it)).filter(q => q.side === P.side), i = same.findIndex(q => q.id === P.id), n = same.length, step = Math.max(0.09, gap || 2.4 * r), t = [-pos.out[1], pos.out[0]];
    const fixed = it.kind === 'hydro' && (it.type === 'nft' || it.type === 'dutch') && (P.id === 'feed' || P.id === 'return'), extra = fixed ? 0 : (i - (n - 1) / 2) * step - (i - (n - 1) / 2) * 0.09;
    return [pos.p[0] + t[0] * extra + pos.out[0] * r * 1.3, pos.p[1] + t[1] * extra + pos.out[1] * r * 1.3];
  }
  function drawPorts(world) {
    const px = S.view.scale, touch = document.body.classList.contains('ctl-touch'), r = Math.max((touch ? 11 : 7) / px, 0.03);
    const src = S.connDrag ? S.connDrag.from : S.portFrom, srcIt = src && byId(src.itemId), srcPort = srcIt && H3.portsOf(srcIt).find(q => q.id === src.portId);
    if (S.connDrag && !srcPort) { S.connDrag = null; S.portFrom = null; }   // the item it started from is gone (an undo, say)
    const linking = S.tool === 'conn' || !!src, hit = touch ? 22 / px : r * 1.7, gap = touch ? 0.09 + 46 / px : undefined;
    const used = new Set(); for (const c of items()) if (c.kind === 'conn' && !c.free) { if (c.fp) used.add(c.from + '|' + c.fp); if (c.tp) used.add(c.to + '|' + c.tp); }   // once, not per dot
    for (const it of items()) {
      if (!linkable(it)) continue;
      if (!linking && !S.sel.has(it.id)) continue;
      const plist = H3.portsOf(it), dps = plist.map(P => dotAt(it, P, H3.portPos(it, P), r, plist, gap));
      let near = Infinity; for (let i = 0; i < dps.length; i++) for (let j = i + 1; j < dps.length; j++) near = Math.min(near, Math.hypot(dps[i][0] - dps[j][0], dps[i][1] - dps[j][1]));
      const hitIt = Math.max(r, Math.min(hit, near / 2));   // never reaches over a neighbouring dot
      for (const P of plist) {
        const pos = H3.portPos(it, P), dp = dps[plist.indexOf(P)], isUsed = used.has(it.id + '|' + P.id), m = MEDIUM[P.medium] || MEDIUM.water, isSrc = src && src.itemId === it.id && src.portId === P.id;
        const ok = !srcPort || isSrc || (it.id !== src.itemId && H3.portCompatible(srcPort, P));
        const g = sv('g', { opacity: ok ? 1 : 0.22 });
        if (srcPort && ok && !isSrc) g.append(sv('circle', { cx: dp[0], cy: dp[1], r: r * 1.9, fill: m.col, 'fill-opacity': 0.25, stroke: m.col, 'stroke-width': 1.5, 'vector-effect': 'non-scaling-stroke' }));
        g.append(sv('circle', { cx: dp[0], cy: dp[1], r, fill: m.col, stroke: isUsed ? '#3f9b4a' : '#fff', 'stroke-width': isUsed ? 3 : 1.5, 'vector-effect': 'non-scaling-stroke', class: 'pl-port', 'pointer-events': 'none' }));
        g.append(sv('circle', { cx: dp[0], cy: dp[1], r: hitIt, fill: 'transparent', stroke: 'none', class: 'pl-port', 'data-port': it.id + '|' + P.id, style: 'cursor:crosshair' }));   // an easy-to-hit area round the dot
        if ((linking && ok) || (S.sel.size === 1 && S.sel.has(it.id) && !src)) { const t = label(P.label, dp[0] + pos.out[0] * (r + 0.02) * 2.4, dp[1] + pos.out[1] * (r + 0.02) * 2.4, true); t.setAttribute('class', 'pl-label pl-sub'); t.setAttribute('pointer-events', 'none'); g.append(t); }
        world.append(g);
      }
    }
    if (S.connDrag) {   // the hose being pulled: from its port to the finger or pointer, with what it would join
      const cd = S.connDrag, it = byId(cd.from.itemId); if (!it) return;
      const A = H3.portPos(it, H3.portsOf(it).find(q => q.id === cd.from.portId) || H3.portsOf(it)[0]), m = MEDIUM[(srcPort || {}).medium] || MEDIUM.water, hov = cd.hover && byId(cd.hover);
      let tgt = null, can = false;
      if (hov && linkable(hov) && hov.id !== it.id) { const pr = H3.pickPair(it, hov, srcPort.medium, null, { from: srcPort.id }); can = !!pr; tgt = pr && H3.portPos(hov, pr.to); }
      const to = tgt ? tgt.p : cd.to;
      world.append(sv('line', { x1: A.p[0], y1: A.p[1], x2: to[0], y2: to[1], stroke: hov && !can ? '#c4372b' : m.col, 'stroke-width': 3, 'stroke-dasharray': '6 4', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' }));
      if (hov && linkable(hov) && hov.id !== it.id) { const b = M.bounds(hov, S.plan); world.append(sv('rect', { x: b[0] - 0.05, y: b[1] - 0.05, width: b[2] - b[0] + 0.1, height: b[3] - b[1] + 0.1, fill: 'none', stroke: can ? '#3f9b4a' : '#c4372b', 'stroke-width': 3, 'vector-effect': 'non-scaling-stroke', 'pointer-events': 'none' })); }
      const tx = label(hov && linkable(hov) && hov.id !== it.id ? (can ? 'Joins ' + portName(hov, H3.pickPair(it, hov, srcPort.medium, null, { from: srcPort.id }).to.id) : 'Cannot join: no matching port') : 'Drop on an item with a matching port', to[0], to[1] - 0.3, true); tx.setAttribute('pointer-events', 'none'); world.append(tx);
    }
  }
  /* join a port on one item to an item (or a chosen port on it); returns a message to show */
  function connectPort(fromId, fromPort, toId, toPort, at) {
    const list = items(), a = list.find(i => i.id === fromId), b = list.find(i => i.id === toId), P = a && H3.portsOf(a).find(q => q.id === fromPort);
    if (!a || !b || !P) return 'Nothing to connect.';
    if (list.filter(i => i.kind === 'conn').length >= H.LIMITS_HYDRO.conn) return 'That is the most links a plan can hold.';
    if (toPort) { const T = H3.portsOf(b).find(q => q.id === toPort); if (T && !H3.portCompatible(P, T)) return 'That port does not match: ' + itemName(a) + ' ' + P.label.toLowerCase() + ' cannot join ' + itemName(b) + ' ' + T.label.toLowerCase() + '.'; }
    let want = { from: fromPort, to: toPort || undefined };
    if (!toPort && at) { const cs = H3.portsOf(b).filter(q => H3.portCompatible(P, q)).map(q => [Math.hypot(...[0, 1].map(k => H3.portPos(b, q).p[k] - at[k])), q]).sort((x, y) => x[0] - y[0]); if (cs.length && cs[0][0] < 0.3) want.to = cs[0][1].id; }
    const taker = H3.ROLE_DIR[P.role] === 'dst';   // a link runs from the giving port to the taking port, whichever end was dragged
    const c = taker ? M.makeConn(list, toId, fromId, P.medium, { from: want.to, to: want.from }) : M.makeConn(list, fromId, toId, P.medium, want);
    if (!c) { const ok = H3.portsOf(b).some(q => H3.portCompatible(P, q)); return ok ? 'Those two are already joined that way.' : 'That port does not match: ' + itemName(a) + ' ' + P.label.toLowerCase() + ' has no matching port on ' + itemName(b) + '.'; }
    list.push(c); S.sel = new Set([c.id]); commit();
    const A = taker ? b : a, B = taker ? a : b, pa = H3.portsOf(A).find(q => q.id === c.fp), pb = H3.portsOf(B).find(q => q.id === c.tp), pr = H.linkProblem(c, A, B);
    return 'Connected ' + itemName(A) + ' (' + (pa ? pa.label.toLowerCase() : 'port') + ') to ' + itemName(B) + ' (' + (pb ? pb.label.toLowerCase() : 'port') + '). Locked: it follows when you move them.' + (pr ? ' Note: ' + pr : '');
  }
  /* a new link between two items (the Link tool and the panels); returns a message to show, or '' */
  function link(fromId, toId, medium) {
    const list = items(), a = list.find(i => i.id === fromId), b = list.find(i => i.id === toId);
    if (list.filter(i => i.kind === 'conn').length >= H.LIMITS_HYDRO.conn) return 'That is the most links a plan can hold.';
    const c = M.makeConn(list, fromId, toId, medium || H.guessMedium(a, b));
    if (!c) return 'Those two are already linked that way, or cannot be linked.';
    list.push(c); S.sel = new Set([c.id]); commit();
    const p = H.linkProblem(c, a, b); return p ? 'Linked, but: ' + p : '';
  }
  function linksBlock(it) {
    const all = items(), mine = all.filter(c => c.kind === 'conn' && (c.from === it.id || c.to === it.id));
    const rows = mine.map(c => { const o = all.find(x => x.id === (c.from === it.id ? c.to : c.from)); return el('div', { class: 'pl-row' }, [el('span', { class: 'small', text: (MEDIUM[c.medium] || MEDIUM.water).name + ' link to ' + itemName(o) }), el('button', { type: 'button', class: 'btn sm', text: 'Remove', 'aria-label': 'Remove the ' + c.medium + ' link to ' + itemName(o), onclick: () => { all.splice(all.indexOf(c), 1); commit(); } })]); });
    const targets = all.filter(x => x.id !== it.id && (x.kind === 'hydro' || x.kind === 'gear') && !x.off);
    const tSel = el('select', { 'aria-label': 'Link to' }, targets.map(x => el('option', { value: x.id, text: itemName(x) }))), mSel = el('select', { 'aria-label': 'What the link carries' }, [el('option', { value: '', text: 'Choose for me' }), ...H.MEDIA.map(k => el('option', { value: k, text: MEDIUM[k].name }))]);
    return el('div', { class: 'pl-links' }, [el('h4', { class: 'pl-h', text: 'Links (water, air, power, control)' }), ...rows,
      targets.length ? el('div', { class: 'pl-row' }, [el('label', { class: 'small pl-field' }, ['Link to', tSel]), el('label', { class: 'small pl-field' }, ['Carries', mSel]), el('button', { type: 'button', class: 'btn sm', text: 'Add link', onclick: () => { const msg = link(it.id, tSel.value, mSel.value); if (msg) toast(msg, 5000); } })]) : el('p', { class: 'small muted', text: 'Add equipment or another system to link to.' })]);
  }
  function connPanel(it) {
    const a = byId(it.from), b = byId(it.to), bad = connProblem(it);
    const pa = a && H3.portsOf(a), pb = b && H3.portsOf(b), P = (list, id) => (list || []).find(q => q.id === id), free = it.free === true;
    let len = null; try { if (a && b) len = H3.linkLength(it, a, b, null); } catch (e) { /* no estimate */ }
    const portSel = (lab, owner, list, key) => el('label', { class: 'small pl-field' }, [lab, (() => {
      const otherKey = key === 'fp' ? 'tp' : 'fp', otherList = key === 'fp' ? pb : pa, mine = (list || []).filter(q => q.medium === it.medium), keep = P(otherList, it[otherKey]);
      const ok = mine.filter(q => !keep || H3.portCompatible(q, keep));   // only ports that can join the port at the other end
      const sel = el('select', { 'aria-label': lab }, (ok.length ? ok : mine).map(q => el('option', { value: q.id, text: q.label })));
      sel.value = it[key] || '';
      sel.addEventListener('change', () => {
        it[key] = sel.value; const mineP = P(list, it[key]), oth = P(otherList, it[otherKey]);
        if (mineP && oth && !H3.portCompatible(mineP, oth)) { const cand = (otherList || []).filter(q => q.medium === it.medium && H3.portCompatible(mineP, q)); if (cand.length) it[otherKey] = cand[0].id; else delete it[otherKey]; }   // the other end moves to a port that fits
        commit();
      });
      return sel; })()]);
    put(el('p', { class: 'small', text: itemName(a) + (P(pa, it.fp) ? ' (' + P(pa, it.fp).label.toLowerCase() + ')' : '') + ' to ' + itemName(b) + (P(pb, it.tp) ? ' (' + P(pb, it.tp).label.toLowerCase() + ')' : '') }),
      pickF('Carries', it, 'medium', H.MEDIA.map(k => [k, MEDIUM[k].name])),
      el('div', { class: 'pl-row' }, [portSel('Port on first item', a, pa, 'fp'), portSel('Port on second item', b, pb, 'tp')]),
      el('p', { class: 'small ' + (free ? 'pl-warn' : 'muted'), text: free ? 'Unlocked: it stays where you left it and will look stretched when you move an item. Tap Lock to snap it back on.' : 'Locked: it follows the two items when you move them.' }),
      len != null ? el('p', { class: 'small muted', text: 'About ' + (Math.round(len * 10) / 10) + ' m of ' + (it.medium === 'water' || it.medium === 'air' ? 'hose' : 'cable') + ' (an estimate: out of one fitting, along the floor, into the other).' }) : null,
      bad ? el('p', { class: 'small pl-warn', text: bad }) : null,
      el('div', { class: 'actions' }, [
        el('button', { type: 'button', class: 'btn sm', text: free ? 'Lock and reconnect' : 'Unlock', 'aria-label': free ? 'Lock the link and reconnect it to both items' : 'Unlock the link so it stays where it is', onclick: () => { if (free) { delete it.free; toast('Locked and reconnected.', 2500); } else { it.free = true; toast('Unlocked. It stays where it is when you move an item.', 3500); } commit(); } }),
        el('button', { type: 'button', class: 'btn sm', text: 'Disconnect', 'aria-label': 'Disconnect and remove this link', onclick: () => { const l = items(), i = l.findIndex(x => x.id === it.id); if (i >= 0) { l.splice(i, 1); S.sel = new Set([a ? a.id : '']); toast('Disconnected. Undo brings it back.', 3500); commit(); } } }),
        el('button', { type: 'button', class: 'btn sm', text: 'Turn it around', onclick: () => { [it.from, it.to] = [it.to, it.from]; [it.fp, it.tp] = [it.tp, it.fp]; if (!it.fp) delete it.fp; if (!it.tp) delete it.tp; commit(); } })]),
      field('Note', it.note, v => { it.note = String(v).slice(0, 120); }, { maxlength: '120' }),
      el('p', { class: 'small muted', text: 'A link is a drawing aid. The planner does not check pipe sizes, pump curves or wiring: ask a qualified person.' }));
  }
  function hydroPanel(it) {
    const all = items(), T = H.HYDRO_TYPES[it.type], cy = I.cycleOf(it.crop), tl = cy && it.sow ? I.timeline(cy, it.sow, it.actual, it.reset) : null, mine = H.checks(all).filter(c => c.ids.includes(it.id) && c.code !== 'link');
    const typeSel = el('select', { 'aria-label': 'System type', onchange: e => { it.type = e.target.value; S.hydroKind = it.type; commit(); } }, H.HYDRO_KEYS.map(k => el('option', { value: k, text: H.HYDRO_TYPES[k].name }))); typeSel.value = it.type;
    const cropSel = el('select', { 'aria-label': 'Crop', onchange: e => { if (e.target.value) it.crop = e.target.value; else { delete it.crop; delete it.actual; } commit(); } }, [el('option', { value: '', text: 'No crop yet' }), ...Object.entries(I.CYCLES).filter(([, c]) => c.group === 'Hydro').map(([k, c]) => el('option', { value: k, text: c.name }))]); cropSel.value = it.crop || '';
    const gal = l => (units() === 'ft' ? ' (about ' + r2(l / 3.785) + ' US gal)' : '');
    put(el('label', { class: 'small pl-field' }, ['Type', typeSel]), el('p', { class: 'small muted', text: T.note }),
      field('Name', it.name, v => { it.name = String(v).slice(0, 60) || T.name; }, { maxlength: '60' }),
      el('div', { class: 'pl-row' }, [lenF('Length', it, 'w', 0.1, 12), lenF('Width', it, 'h', 0.1, 12)]),
      lenF('Between plant sites', it, 'spacing', 0.05, 1),
      el('p', { class: 'small', text: H.sites(it) + ' plant sites (worked out from the sizes).' }),
      it.type === 'tower' ? field('Plant pockets', it.pockets, v => { if (Number.isFinite(v)) it.pockets = Math.min(60, Math.max(4, Math.round(v))); }, { type: 'number', step: '1', min: '4', max: '60', inputmode: 'numeric' }) : null,
      it.type === 'nft' ? el('div', {}, [
        field('Channels', it.channels, v => { if (Number.isFinite(v)) it.channels = Math.min(24, Math.max(1, Math.round(v))); }, { type: 'number', step: '1', min: '1', max: '24', inputmode: 'numeric' }),
        lenF('Between channels', it, 'channelSpacing', 0.1, 1),
        field('Slope: 1 in', it.slope, v => { if (Number.isFinite(v)) it.slope = Math.min(500, Math.max(10, Math.round(v))); }, { type: 'number', step: '5', min: '10', max: '500', inputmode: 'numeric' }),
        field('Flow per channel (L/min)', it.flow, v => { if (Number.isFinite(v) && v > 0) it.flow = Math.min(2, Math.round(v * 100) / 100); }, { type: 'number', step: '0.01', min: '0.05', max: '2', inputmode: 'decimal' }),
        el('p', { class: 'small muted', text: 'Guides give about ' + H.TYPICAL.nftFlow[0] + ' to ' + H.TYPICAL.nftFlow[1] + ' L/min per channel, channels up to about ' + L(H.TYPICAL.nftMaxRun) + ', and a slope of 1 in 30 to 1 in 100. Pump total about ' + r2(H.nftFlow(it)) + ' L/min.' })]) : null,
      !H.HYDRO_TYPES[it.type].pumped ? field('Solution held (litres)', it.volume, v => { if (Number.isFinite(v) && v >= 0) it.volume = Math.min(5000, Math.round(v * 10) / 10); }, { type: 'number', step: '1', min: '0', max: '5000', inputmode: 'decimal' }) : null,
      !H.HYDRO_TYPES[it.type].pumped && it.volume ? el('p', { class: 'small muted', text: r2(it.volume / H.sites(it)) + ' L per plant site' + gal(it.volume) + '. Guides suggest ' + H.TYPICAL.litresPerSite[0] + ' to ' + H.TYPICAL.litresPerSite[1] + ' L.' }) : null,
      H.HYDRO_TYPES[it.type].pumped ? pickF('Drain', it, 'drain', [['recirculate', 'Back to the reservoir'], ['waste', 'Run to waste']]) : null,
      ...mine.map(c => fixRow(c, 'small ' + (c.level === 'warn' ? 'pl-warn' : 'muted'))),
      ctx.sec && ctx.sec('Batch (what is growing here)'),
      el('label', { class: 'small pl-field' }, ['Crop', cropSel]),
      cy ? field('Sown on', it.sow || '', v => { it.sow = /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : ''; }, { type: 'date' }) : null,
      targetLine(cy),
      cy && cy.verify ? el('p', { class: 'small muted', text: 'The grow-out days for this crop are a typical range we have not been able to check against a published figure. Log your own batches and the planner will show your averages.' }) : null,
      cy && cy.note ? el('p', { class: 'small muted', text: cy.note }) : null,
      transplantBlock(it, all),
      tl ? timelineBlock(it, cy, tl) : null,
      cy ? learnedLine(all, it.crop) : null,
      cy && it.sow ? el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: it.cleared ? 'Start the next batch' : 'Harvested: clear the system', title: 'Keeps this batch in the history and empties the system', onclick: () => { const d = S.plan.date < it.sow ? it.sow : S.plan.date; if (it.cleared) { I.nextBatch(it, it.cleared, it.crop, ''); } else { it.cleared = d; } commit(); } })]) : null,
      alsoSay(cy && it.sow ? 'Keeps this batch in the system\u2019s history and empties it for the next sowing.' : ''),
      field('Notes', it.note, v => { it.note = String(v).slice(0, 120); }, { maxlength: '120' }),
      linksBlock(it),
      el('p', { class: 'small muted', text: 'Typical figures from extension guides. The planner lays out the system and adds up what you typed. It does not check pumps, plumbing, wiring or safety: ask a qualified person, and follow your own product labels.' }));
  }
  /* some warnings can be put right from the warning itself: the missing piece is added beside the item and linked to it */
  const FIXES = {
    noReservoir: { item: 'reservoir100', medium: 'water', label: 'Add a reservoir and link it' },
    noPump: { item: 'water_pump', medium: 'water', label: 'Add a pump and link it' },
    noAir: { item: 'air_pump', medium: 'air', label: 'Add an air pump and link it' },
    noPower: { item: 'power_board', medium: 'power', label: 'Add a power board and link it' },
  };
  function addAndLink(target, key, medium) {
    const all = items(), e = I.EQUIP[key];
    if (!e || !target) return;
    if (all.filter(i => i.kind === 'gear').length >= I.LIMITS_GEAR) { toast('That is the most equipment a plan can hold.'); return; }
    const site = S.plan.site, gap = 0.25;
    let x = target.x + target.w / 2 + e.w / 2 + gap, y = target.y;
    if (x + e.w / 2 > site.w) { x = Math.max(e.w / 2, target.x - target.w / 2 - e.w / 2 - gap); y = Math.min(site.h - e.h / 2, target.y + target.h / 2 + e.h / 2 + gap); }
    y = Math.min(Math.max(e.h / 2, y), Math.max(e.h / 2, site.h - e.h / 2));
    const raw = Object.assign({ id: M.newId(), kind: 'gear', folder: 'indoor', item: key, name: e.name, x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, w: e.w, h: e.h, rot: 0 }, e.litres ? { litres: e.litres } : {});
    const made = M.cleanPlan({ format: M.FORMAT, version: 1, items: [raw] }).items[0]; if (!made) return;
    all.push(made);
    const c = M.makeConn(all, target.id, made.id, medium); if (c) all.push(c);
    S.sel = new Set([made.id]); S.pending = null; commit();
    toast(e.name + ' added and linked. Change its size and rating to match yours.', 5000);
  }
  const fixRow = (c, cls) => {
    const f = FIXES[c.code], target = f && c.ids && c.ids.length ? byId(c.ids[0]) : null;
    const line = el('p', { class: cls, text: c.text });
    if (!f || !target) return line;
    return el('div', {}, [line, el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: f.label, onclick: () => addAndLink(target, f.item, f.medium) })])]);
  };
  /* a reservoir: what it feeds, how much solution each plant has, when to change it, and a hand-over to LT-Nutrients */
  function reservoirBlock(it) {
    const all = items(), info = H.reservoirInfo(it, all), gal = l => (units() === 'ft' ? ' (' + (Math.round(l / 3.785411784 * 10) / 10) + ' US gal)' : '');
    const next = it.lastChange && it.changeEvery ? I.addDays(it.lastChange, it.changeEvery) : '';
    const crops = info.crops.map(k => I.CYCLES[k]).filter(Boolean);
    const kids = [el('h4', { class: 'pl-h', text: 'What it feeds' })];
    if (info.systems.length) {
      kids.push(el('p', { class: 'small', text: info.systems.map(h => h.name).join(', ') + ' · ' + info.sites + ' plant sites · about ' + info.perSite + ' L per plant site' + gal(info.litres) + '.' }));
      if (info.perSite && info.perSite < H.TYPICAL.litresPerSite[0]) kids.push(el('p', { class: 'small pl-warn', text: 'Under the ' + H.TYPICAL.litresPerSite[0] + ' L per plant guides suggest' + (info.shared ? ', and this reservoir is shared by ' + info.systems.length + ' systems' : '') + '. Small volumes swing in EC and pH quickly.' }));
      for (const c of crops) kids.push(targetLine(c));
    } else kids.push(el('p', { class: 'small muted', text: 'Not linked to a system yet. Add a water link below and the planner will work out the litres per plant.' }));
    kids.push(el('h4', { class: 'pl-h', text: 'Changing the solution' }),
      field('Change it every (days)', it.changeEvery || 14, v => { if (Number.isFinite(v)) it.changeEvery = Math.min(120, Math.max(1, Math.round(v))); }, { type: 'number', step: '1', min: '1', max: '120', inputmode: 'numeric' }),
      field('Last changed', it.lastChange || '', v => { if (/^\d{4}-\d{2}-\d{2}$/.test(v)) it.lastChange = v; else delete it.lastChange; }, { type: 'date' }),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Changed today', onclick: () => { it.lastChange = S.plan.date; commit(); } })]),
      next ? el('p', { class: 'small', text: 'Next change about ' + fmtD(next) + (next <= S.plan.date ? ' (due).' : '.') }) : null,
      (() => { const cb = el('input', { type: 'checkbox', checked: !!it.remind, onchange: ev => { if (ev.target.checked) it.remind = true; else delete it.remind; commit(); } }); return el('label', { class: 'small pl-check' }, [cb, ' Put the changes and a weekly pH and EC check on the plan calendar']); })(),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Work out the mix in LT-Nutrients', title: 'Opens the nutrient tool with this reservoir\'s size and crop already filled in', onclick: () => toNutrients(it, info) })]),
      alsoSay('Opens the nutrient tool in a new tab, with this reservoir\u2019s size and crop already filled in.'),
      el('p', { class: 'small muted', text: 'The planner never chooses a product or a dose. LT-Nutrients does the sums from the numbers on your own label.' }));
    return el('div', { class: 'pl-res' }, kids.filter(Boolean));
  }
  /* hand this reservoir to LT-Nutrients: the two tools share one address, so a small note in this device's storage is enough */
  function toNutrients(it, info) {
    const band = (info.crops.map(k => I.CYCLES[k]).find(c => c && c.band) || {}).band || 'greens';
    try { localStorage.setItem('lt_tools_handoff_nutrients', JSON.stringify({ v: 1, at: Date.now(), name: it.name, litres: it.litres || 0, band, units: units() })); } catch { /* storage off: the tool still opens */ }
    window.open('../nutrients/', '_blank', 'noopener');
  }
  /* the typical EC and pH band for a crop, always named as typical and with its source */
  function targetLine(cy) {
    if (!cy || (!cy.ec && !cy.ph)) return null;
    const bits = [];
    if (cy.ec) bits.push('EC about ' + cy.ec[0] + ' to ' + cy.ec[1] + ' mS/cm');
    if (cy.ph) bits.push('pH about ' + cy.ph[0] + ' to ' + cy.ph[1] + (cy.phBest ? ' (best about ' + cy.phBest + ')' : ''));
    return el('p', { class: 'small', text: 'Typical for this crop: ' + bits.join(', ') + '. Source: ' + cy.src + '. Your water and system may want different numbers, so measure.' });
  }
  /* the move itself: the system takes the batch with its real sowing date, today is logged as the day it went in, and the tray is emptied */
  function moveTrayIn(it, t) {
    if (!it || !t) return;
    const to = I.TO_HYDRO[t.crop] || (it.crop || ''), d = S.plan.date < t.sow ? t.sow : S.plan.date;
    if (!to || !I.CYCLES[to] || I.CYCLES[to].group !== 'Hydro') { toast('There is no hydro cycle for ' + I.CYCLES[t.crop].name.toLowerCase() + ' yet. Choose the crop on the system by hand, then clear the tray.', 6000); return; }
    if (it.crop && it.sow && !it.cleared) { toast((it.name || 'That system') + ' already has a batch in it. Clear it first (Harvested: clear the system).', 5000); return; }
    if (it.crop && it.sow && it.cleared) I.nextBatch(it, it.cleared, '', '');   // the system's own finished batch goes to its history first
    it.crop = to; it.sow = t.sow; it.actual = { germ: d };
    delete it.cleared;
    I.nextBatch(t, d, '', '');   // the tray keeps the batch in its history and is left empty
    commit(); toast('Moved ' + I.CYCLES[to].name.toLowerCase() + ' into ' + (it.name || 'the system') + ' on ' + fmtD(d) + '. ' + t.name + ' is empty again, with the batch kept in its history.', 6000);
  }
  /* from the tray's own panel: which system to move it into */
  function trayToSystemBlock(t) {
    if (!t.crop || !t.sow || t.cleared || !I.CYCLES[t.crop] || I.CYCLES[t.crop].group === 'Hydro') return null;
    const all = items(), systems = all.filter(i => i.kind === 'hydro' && !i.off);
    if (!systems.length) return null;
    const pick = el('select', { 'aria-label': 'System to move these into' }, systems.map(h => el('option', { value: h.id, text: (h.name || H.HYDRO_TYPES[h.type].name) + (h.crop && !h.cleared ? ' (in use)' : '') })));
    const to = I.TO_HYDRO[t.crop];
    return el('details', { class: 'pl-sides' }, [el('summary', { class: 'small', text: 'Move these plugs into a hydro system' }),
      el('label', { class: 'small pl-field' }, ['System', pick]),
      el('p', { class: 'small muted', text: to ? 'It goes in as ' + I.CYCLES[to].name.toLowerCase() + ', keeping this sowing date, and this tray is emptied with the batch kept in its history.' : 'There is no hydro cycle for this crop yet: choose the crop on the system by hand first.' }),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Move them in', onclick: () => moveTrayIn(all.find(x => x.id === pick.value), t) })])]);
  }
  /* seedlings are raised in plugs on a shelf and then moved into the system: this carries the batch across and empties the tray */
  function transplantBlock(it, all) {
    const ready = traysOf(all).filter(t => t.crop && t.sow && !t.cleared && I.CYCLES[t.crop] && I.CYCLES[t.crop].group !== 'Hydro');
    if (!ready.length) return null;
    const pick = el('select', { 'aria-label': 'Tray of seedlings to move in' }, ready.map(t => { const sh = all.find(x => x.id === t.shelf); return el('option', { value: t.id, text: (I.CYCLES[t.crop].name) + ' · ' + t.name + (sh ? ' (' + sh.name + ' T' + t.tier + ')' : '') }); }));
    const go = () => moveTrayIn(it, ready.find(x => x.id === pick.value));
    return el('details', { class: 'pl-sides' }, [el('summary', { class: 'small', text: 'Move a tray of seedlings in here' }),
      el('label', { class: 'small pl-field' }, ['Tray', pick]),
      el('p', { class: 'small muted', text: 'The system takes the batch with its real sowing date, today becomes the day it went in, and the tray is emptied with the batch kept in its history.' }),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Move it in', onclick: go })])]);
  }
  /* "Add a hydro system": a system, its reservoir and pump, already linked */
  function addTemplate(key, cx, cy, opts) {
    const t = H.template(key, opts || {}); if (!t.items.length) return false;
    const list = items(); if (list.filter(i => i.kind === 'hydro').length >= H.LIMITS_HYDRO.hydro || list.filter(i => i.kind === 'gear').length + t.items.length > I.LIMITS_GEAR || list.filter(i => i.kind === 'conn').length + t.conns.length > H.LIMITS_HYDRO.conn) { toast('That is the most a plan can hold.'); return false; }
    const ids = t.items.map(() => M.newId());
    const raws = t.items.map((s, i) => Object.assign({ id: ids[i], rot: 0 }, s, { x: r2(cx + s.dx), y: r2(cy + s.dy), name: s.name || (s.kind === 'gear' && I.EQUIP[s.item] ? I.EQUIP[s.item].name : '') }));
    const conns = t.conns.map(c => ({ id: M.newId(), kind: 'conn', from: ids[c.a], to: ids[c.b], medium: c.medium }));
    const made = M.cleanPlan({ format: M.FORMAT, version: 1, items: [...raws, ...conns] }).items, body = made.filter(i => i.kind !== 'conn');
    const x0 = Math.min(...body.map(i => i.x - i.w / 2)), x1 = Math.max(...body.map(i => i.x + i.w / 2)), y0 = Math.min(...body.map(i => i.y - i.h / 2)), y1 = Math.max(...body.map(i => i.y + i.h / 2));
    const sx = x0 < 0 ? -x0 : x1 > S.plan.site.w ? Math.min(0, S.plan.site.w - x1) : 0, sy = y0 < 0 ? -y0 : y1 > S.plan.site.h ? Math.min(0, S.plan.site.h - y1) : 0;
    if (sx || sy) for (const i of body) M.moveItem(i, sx, sy);
    list.push(...made); S.sel = new Set([made[0].id]); S.pending = null; commit(); return true;
  }
  /* "Add a hydro system": pick the kind and its size, and the planner draws the system, its reservoir and pump, already linked */
  function hydroPicker(where) {
    const st = S.hydroOpts || (S.hydroOpts = { channels: 6, run: 2.4, sites: 12, cols: 6, rows: 2 });
    const sel = el('select', { 'aria-label': 'Kind of hydro system' }, Object.entries(H.TEMPLATES).map(([k, v]) => el('option', { value: k, text: v.name }))); sel.value = S.hydroKind && H.TEMPLATES[S.hydroKind] ? S.hydroKind : 'nft';
    const note = el('p', { class: 'small muted' }), sizes = el('div', { class: 'pl-row' }), sum = el('p', { class: 'small' });
    const numF = (key, lo, hi, lab) => { const i = el('input', { type: 'number', value: st[key], min: lo, max: hi, step: key === 'run' ? 0.1 : 1, 'aria-label': lab, inputmode: 'decimal' }); i.addEventListener('change', () => { const v = key === 'run' ? +i.value : Math.round(+i.value); st[key] = Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo; i.value = st[key]; fill(); }); return el('label', { class: 'small pl-field' }, [lab, i]); };
    const runF = () => { const i = el('input', { value: L(st.run), 'aria-label': 'Channel length', inputmode: 'text' }); i.addEventListener('change', () => { const v = I.parseLen(i.value, units()); st.run = v == null ? st.run : Math.min(H.TYPICAL.nftMaxRun, Math.max(0.6, Math.round(v * 100) / 100)); i.value = L(st.run); fill(); }); return el('label', { class: 'small pl-field' }, ['Channel length', i]); };
    function fill() {
      const k = sel.value; note.textContent = H.TEMPLATES[k].note; sizes.textContent = '';
      if (k === 'nft') sizes.append(numF('channels', 1, 24, 'Channels'), runF());
      else if (k === 'dwc') sizes.append(numF('sites', 2, 36, 'Plant sites'));
      else if (k === 'kratky') sizes.append(numF('cols', 1, 12, 'Jars across'), numF('rows', 1, 6, 'Jars deep'));
      else if (k === 'dutch' || k === 'drip' || k === 'wick') sizes.append(numF('cols', 1, 12, k === 'dutch' ? 'Buckets across' : 'Pots across'), numF('rows', 1, 6, k === 'dutch' ? 'Buckets deep' : 'Pots deep'));
      else if (k === 'tower') sizes.append(numF('sites', 4, 60, 'Plant pockets'));
      const t = H.template(k, st), h = t.items[0];
      const res = t.items.find(i => i.item && /reservoir|bucket/.test(i.item));
      sum.textContent = h ? H.sites(Object.assign({ w: 0, h: 0, spacing: 0.2 }, h)) + ' plant sites, ' + L(h.w) + ' × ' + L(h.h) + (res ? ', with a ' + Math.round(res.litres || 0) + ' L reservoir and a pump' : h.volume ? ', holding about ' + Math.round(h.volume) + ' L' : '') + '.' : '';
    }
    sel.addEventListener('change', () => { S.hydroKind = sel.value; fill(); }); fill();
    return el('details', { class: 'pl-sides' }, [el('summary', { class: 'small', text: 'Add a hydro system' }), el('label', { class: 'small pl-field' }, ['Kind', sel]), note, sizes, sum,
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Add it', onclick: () => { const [x, y] = where(); addTemplate(sel.value, x, y, st); } })])]);
  }
  /* a plain list of what the indoor part of the plan is made of: counts only, no brands and no prices */
  function partsBlock(all) {
    const p = H.partsList(all, I.EQUIP);
    const lines = [];
    if (p.systems) lines.push(p.systems + (p.systems === 1 ? ' hydro system' : ' hydro systems') + (p.channels ? ', ' + p.channels + ' NFT channels' : '') + ', ' + p.sites + ' plant sites');
    if (p.litres) lines.push(p.litres + ' L of reservoir in all');
    if (p.rooms || p.shelves || p.trays) lines.push([p.rooms && p.rooms + (p.rooms === 1 ? ' room or tent' : ' rooms or tents'), p.shelves && p.shelves + (p.shelves === 1 ? ' shelf' : ' shelves'), p.trays && p.trays + (p.trays === 1 ? ' tray' : ' trays')].filter(Boolean).join(', '));
    for (const [nm, n] of p.byItem) lines.push(n + ' × ' + nm);
    if (p.links) lines.push(p.links + (p.links === 1 ? ' link drawn' : ' links drawn') + ' (water, air, power, control)');
    if (p.watts) lines.push('About ' + p.watts + ' W of powered equipment, as typed');
    { let hose = 0, cable = 0; const by = new Map(all.map(i => [i.id, i]));   // lengths are estimates: out of one fitting, along the floor, into the other, with no spare
      for (const c of all.filter(i => i.kind === 'conn' && !i.off)) { const a = by.get(c.from), b = by.get(c.to); if (!a || !b) continue; try { const L = H3.linkLength(c, a, b, null); if (c.medium === 'water' || c.medium === 'air') hose += L; else cable += L; } catch (e) { /* no estimate for this one */ } }
      if (hose > 0 || cable > 0) lines.push('About ' + (hose > 0 ? Math.ceil(hose * 10) / 10 + ' m of hose or pipe' : '') + (hose > 0 && cable > 0 ? ' and ' : '') + (cable > 0 ? Math.ceil(cable * 10) / 10 + ' m of cable' : '') + ' (an estimate, with no spare: add some)'); }
    if (!lines.length) return null;
    const text = lines.join('\n');
    return el('details', { class: 'pl-sides' }, [el('summary', { class: 'small', text: 'What this plan is made of' }),
      ...lines.map(l => el('p', { class: 'small', text: l })),
      el('p', { class: 'small muted', text: 'Counts from your own plan, to take to the shop or compare with what you have. The planner names no brands and no prices.' }),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm', text: 'Copy the list', onclick: e => { const done = () => toast('Copied.'); if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, () => toast('Select and copy the list above.')); else toast('Select and copy the list above.'); e.target.blur(); } })])]);
  }
  function hydroSection(all) {
    const hs = all.filter(i => i.kind === 'hydro' && !i.off), cs = H.checks(all), box = el('div', { class: 'pl-hydro' });
    box.append(el('h3', { text: 'Hydro systems' }));
    box.append(el('details', { class: 'pl-sides' }, [el('summary', { class: 'small', text: 'How this works' }),
      el('p', { class: 'small', text: '1. Raise the seedlings in plugs on a shelf. 2. Add a hydro system: it comes with its reservoir and pump, already linked. 3. When the plugs are ready, open the system and use "Move a tray of seedlings in here". 4. The planner counts the days and draws the batch; the reservoir can put solution changes and a weekly pH and EC check on the calendar.' }),
      el('p', { class: 'small muted', text: 'You measure EC and pH yourself. LT-Nutrients does the mixing sums from the numbers on your own product label. The planner never checks pumps, plumbing, wiring or safety.' })]));
    if (hs.length) {
      box.append(el('p', { class: 'small', text: hs.length + (hs.length === 1 ? ' system' : ' systems') + ', ' + hs.reduce((n, h) => n + H.sites(h), 0) + ' plant sites in all.' }));
      const warns = cs.filter(c => c.level === 'warn'), infos = cs.filter(c => c.level === 'info');
      for (const c of warns.slice(0, 20)) box.append(fixRow(c, 'small pl-warn'));
      for (const c of infos.slice(0, 20)) box.append(fixRow(c, 'small muted'));
      if (warns.length > 20 || infos.length > 20) box.append(el('p', { class: 'small muted', text: 'More notes are hidden: select a system to see its own.' }));
      box.append(el('p', { class: 'small muted', text: 'These are warnings and sums from the numbers you typed. The planner does not check pumps, plumbing, wiring or safety: ask a qualified person.' }));
    }
    box.append(hydroPicker(() => [S.plan.site.w / 2, S.plan.site.h / 2]));
    box.append(partsBlock(all));
    return box;
  }
  /* ---------- plan-level: occupancy chart and succession planner (shown when nothing is selected) ---------- */
  function planSection() {
    const all = items(), trays = traysOf(all), shelves = shelvesOf(all);
    if (!shelves.length && !trays.length && !all.some(i => i.kind === 'room' || i.kind === 'gear' || i.kind === 'hydro')) return null;
    const box = el('div', { class: 'pl-indoor' });
    box.append(el('h3', { text: 'Indoor growing' }));
    const hyd = all.filter(i => i.kind === 'hydro' && !i.off);
    const batches = [...trays, ...hyd].filter(t => t.crop && t.sow);
    const bad = I.clashes(all);
    box.append(el('p', { class: 'small', text: trays.length + (trays.length === 1 ? ' tray' : ' trays') + ' on ' + shelves.length + (shelves.length === 1 ? ' shelf' : ' shelves') + ', ' + batches.length + (batches.length === 1 ? ' batch' : ' batches') + ' planned or growing.' + (bad.length ? ' ' + bad.length + (bad.length === 1 ? ' overlap' : ' overlaps') + ' to look at.' : '') }));
    if (shelves.length) box.append(tierViewF(Math.max(...shelves.map(x => x.tiers))));
    if (bad.length) box.append(el('p', { class: 'small pl-warn', text: 'Trays that overlap are outlined red on the plan. Move one, or sow it after the other is cleared.' }));
    const ld = I.loadSummary(all);
    if (ld.items) {
      box.append(el('p', { class: 'small', text: ld.items + ' equipment items, ' + ld.powered + ' powered: about ' + ld.watts + ' W together if all are on, roughly ' + ld.kwhDay + ' kWh a day at their set hours (estimates from the plug ratings).' }));
      box.append(el('p', { class: 'small muted', text: 'The planner adds up what you typed. It does not check circuits, ventilation or fire safety: ask a qualified person.' }));
      const idle = gearOf(all).filter(g => I.matUnused(g, all)).length; if (idle) box.append(el('p', { class: 'small pl-warn', text: idle + (idle === 1 ? ' heat mat has no tray on it.' : ' heat mats have no tray on them.') }));
      const tight = gearOf(all).filter(g => { const shf = g.shelf && shelves.find(x => x.id === g.shelf); const f = shf && I.lightFit(g, shf, trays); return f && !f.ok; }).length; if (tight) box.append(el('p', { class: 'small pl-warn', text: tight + (tight === 1 ? ' light does' : ' lights do') + ' not fit above its tier at that height (an estimate from typical plant heights).' }));
    }
    if (batches.length) box.append(occupancy(batches, all));
    if (shelves.length) box.append(successionForm(all, shelves, trays));
    box.append(hydroSection(all));
    return box;
  }
  function occupancy(batches, all) {
    const start = I.addDays(S.plan.date, -7), days = 84, W = 300, rowH = 14, shown = batches.slice().sort((a, b) => (a.shelf || '').localeCompare(b.shelf || '') || (a.tier || 0) - (b.tier || 0) || (a.sow < b.sow ? -1 : 1)).slice(0, 40);
    const x = d => Math.max(0, Math.min(W, (I.daysBetween(start, d) / days) * W));
    const svg = sv('svg', { viewBox: `0 0 ${W + 104} ${shown.length * rowH + 18}`, width: '100%', role: 'img', 'aria-label': 'Which trays are busy over the next twelve weeks', class: 'pl-occ' });
    for (let w = 0; w <= 12; w += 2) { const gx = 90 + (w * 7 / days) * W; svg.append(sv('line', { x1: gx, y1: 12, x2: gx, y2: shown.length * rowH + 14, stroke: '#cfd5cf', 'stroke-width': 0.5 })); const t = sv('text', { x: gx, y: 9, 'font-size': 7, fill: '#667', 'text-anchor': 'middle' }); t.textContent = fmtD(I.addDays(start, w * 7)); svg.append(t); }
    const tx = x(S.plan.date) + 90; svg.append(sv('line', { x1: tx, y1: 12, x2: tx, y2: shown.length * rowH + 14, stroke: '#2a6fb0', 'stroke-width': 1 }));
    shown.forEach((t, i) => {
      const b = I.busy(t); if (!b) return; const sh = all.find(s => s.id === t.shelf), y = 14 + i * rowH, tl = b.tl, c = I.cycleOf(t.crop);
      const lab = sv('text', { x: 2, y: y + 9, 'font-size': 7.5, fill: '#223' }); lab.textContent = ((sh ? sh.name + ' T' + t.tier + ' ' : t.kind === 'hydro' ? t.name + ' ' : '') + c.name).slice(0, 22); svg.append(lab);
      const seg = (a, e, fill, op) => { const xa = 90 + x(a), xe = 90 + x(e); if (xe > xa) svg.append(sv('rect', { x: xa, y, width: xe - xa, height: rowH - 4, fill, 'fill-opacity': op, rx: 2 })); };
      seg(t.sow, tl.stages[0].endExp, '#5d7a3a', 0.9); seg(tl.stages[0].endExp, tl.readyExp, '#86c36f', 0.9); seg(tl.readyExp, tl.readyLate, '#d9b24a', 0.8); seg(tl.readyLate, b.to, '#b5b5b5', 0.6);
    });
    return el('div', {}, [el('p', { class: 'small', text: 'Busy time, twelve weeks. Dark: germination or blackout. Green: growing. Gold: ready window. Grey: clean and reset. Blue line: the day on the timeline.' }), svg]);
  }
  function successionForm(all, shelves, trays) {
    const st = S.succ || (S.succ = { crop: 'mg_radish', every: 3, count: 6, shelf: '' });
    const cropSel = el('select', { 'aria-label': 'Crop to sow in succession' }, ['Microgreens', 'Seedlings'].map(g => el('optgroup', { label: g }, Object.entries(I.CYCLES).filter(([, c]) => c.group === g).map(([k, c]) => el('option', { value: k, text: c.name }))))); cropSel.value = st.crop;
    const shelfSel = el('select', { 'aria-label': 'Shelf to fill' }, [el('option', { value: '', text: 'All shelves' }), ...shelves.map(s => el('option', { value: s.id, text: s.name }))]); shelfSel.value = st.shelf;
    const out = el('div', { class: 'pl-succ-out' });
    const num = (key, lo, hi, lab) => { const i = el('input', { type: 'number', value: st[key], min: lo, max: hi, step: 1, 'aria-label': lab, inputmode: 'numeric' }); i.addEventListener('change', () => { st[key] = Math.min(hi, Math.max(lo, Math.round(+i.value) || lo)); i.value = st[key]; run(); }); return el('label', { class: 'small pl-field' }, [lab, i]); };
    const startIn = el('input', { type: 'date', value: S.plan.date, 'aria-label': 'First sowing' });
    function run() {
      st.crop = cropSel.value; st.shelf = shelfSel.value; out.textContent = '';
      const cur = items(), tr = traysOf(cur).filter(t => !st.shelf || t.shelf === st.shelf);
      const slots = tr.map(t => ({ id: t.id })), taken = {}; for (const t of tr) { const b = t.cleared && t.crop ? null : I.busy(t); if (b) taken[t.id] = [b]; }
      if (!slots.length) { out.append(el('p', { class: 'small muted', text: 'Add trays to a shelf first (select a shelf, then Fill the tier with trays).' })); return; }
      const plan = I.succession(st.crop, startIn.value || S.plan.date, st.every, st.count, slots, taken), first = new Set(), apply = [];
      for (const p of plan) if (p.slot && !first.has(p.slot) && !(tr.find(t => t.id === p.slot).crop && !tr.find(t => t.id === p.slot).cleared)) { first.add(p.slot); apply.push(p); }
      const name = id => { const t = cur.find(x => x.id === id); return t ? t.name + (t.shelf && t.tier ? ' (' + (cur.find(s => s.id === t.shelf) || { name: 'shelf' }).name + ' T' + t.tier + ')' : '') : ''; };
      const none = plan.filter(p => !p.slot).length;
      out.append(el('p', { class: 'small', text: plan.length - none + ' of ' + plan.length + ' sowings have a tray' + (none ? '; ' + none + ' need more trays or a later start' : '') + '.' }),
        ...plan.slice(0, 30).map(p => el('p', { class: 'small', text: fmtD(p.sow) + ' → ' + (p.slot ? name(p.slot) : 'no free tray') + (p.slot ? ' · ready ' + fmtD(p.ready) : '') })),
        apply.length ? el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn sm primary', text: 'Put ' + apply.length + (apply.length === 1 ? ' sowing' : ' sowings') + ' on the trays', title: 'Gives each empty tray its crop and sowing date. Later sowings of the same tray are not stored: start the next batch when the tray is cleared.', onclick: () => { for (const p of apply) { const t = cur.find(x => x.id === p.slot); if (t) { t.crop = st.crop; t.sow = p.sow; delete t.cleared; delete t.actual; } } commit(); } })]) : null);
    }
    cropSel.addEventListener('change', run); shelfSel.addEventListener('change', run); startIn.addEventListener('change', run);
    const d = el('details', { class: 'pl-sides' }, [el('summary', { class: 'small', text: 'Succession planner (sow one tray every few days)' }), el('label', { class: 'small pl-field' }, ['Crop', cropSel]), el('label', { class: 'small pl-field' }, ['First sowing', startIn]), el('div', { class: 'pl-row' }, [num('every', 1, 60, 'Every (days)'), num('count', 1, 60, 'How many')]), el('label', { class: 'small pl-field' }, ['Use trays on', shelfSel]), out]);
    d.addEventListener('toggle', () => { if (d.open) run(); });
    if (S.succOpen) { d.open = true; run(); } d.addEventListener('toggle', () => { S.succOpen = d.open; });
    return d;
  }

  /* equipment: lands on the shelf under the click (on the tray under it for mats and domes), or on the floor */
  function newGear(base, key) {
    const all = items(), e = I.EQUIP[key] || I.EQUIP.led_bar, o = Object.assign({}, base, { kind: 'gear', item: I.EQUIP[key] ? key : 'led_bar', name: e.name, w: e.w, h: e.h, rot: 0 }), cx = base.x, cy = base.y;
    const on = shelvesOf(all).slice().reverse().find(sh => { const g = I.inShelf({ x: cx, y: cy, w: 0.01, h: 0.01, rot: sh.rot }, sh); return Math.abs(g.x) <= sh.w / 2 && Math.abs(g.y) <= sh.h / 2; });
    if (on && e.mount !== 'floor') {
      const tier = Math.min(on.tiers, S.tierView || 1); Object.assign(o, { shelf: on.id, tier, rot: on.rot });
      const tr = traysOf(all).find(t => t.shelf === on.id && t.tier === tier && Math.abs(t.x - cx) <= t.w / 2 && Math.abs(t.y - cy) <= t.h / 2);
      if (tr && e.mount === 'tier') { o.x = tr.x; o.y = tr.y; o.rot = tr.rot; } else { const g = I.inShelf({ x: cx, y: cy, w: o.w, h: o.h, rot: on.rot }, on); const lx = Math.max(-on.w / 2 + o.w / 2, Math.min(on.w / 2 - o.w / 2, g.x)), ly = e.mount === 'above' ? 0 : Math.max(-on.h / 2 + o.h / 2, Math.min(on.h / 2 - o.h / 2, g.y)), a = on.rot * Math.PI / 180; o.x = Math.round((on.x + lx * Math.cos(a) - ly * Math.sin(a)) * 1000) / 1000; o.y = Math.round((on.y + lx * Math.sin(a) + ly * Math.cos(a)) * 1000) / 1000; }
    }
    return o;
  }
  function gearPanel(it) {
    const all = items(), e = I.EQUIP[it.item] || I.EQUIP.led_bar, shelves = shelvesOf(all), isLight = e.group === 'Lights';
    const typeSel = el('select', { 'aria-label': 'Equipment type', onchange: e2 => {
      const k = e2.target.value, ne = I.EQUIP[k], was = I.EQUIP[it.item] || I.EQUIP.led_bar;
      // Anything the member typed themselves is kept.  Changing the type used to wipe a name like "Fan by the
      // door" and the watts off the member's own label, replacing both with the catalogue figures.
      const ownName = !!it.name && it.name !== was.name;
      const ownSize = it.w !== was.w || it.h !== was.h;
      const ownPower = (Number.isFinite(it.watts) && it.watts !== was.watts) || (Number.isFinite(it.hours) && it.hours !== was.hours);
      it.item = k; S.gearKind = k;
      if (!ownName) it.name = ne.name;
      if (!ownSize) { it.w = ne.w; it.h = ne.h; }
      if (!ownPower) { it.watts = ne.watts; it.hours = ne.hours; }
      if (ne.litres) { if (!it.litres) it.litres = ne.litres; } else { delete it.litres; delete it.remind; delete it.lastChange; delete it.changeEvery; }
      if (ne.spread) { if (!it.spread) it.spread = ne.spread; } else delete it.spread;
      const kept = [ownName && 'name', ownSize && 'size', ownPower && 'watts and hours'].filter(Boolean);
      if (kept.length) toast('Changed to ' + ne.name + ', and kept the ' + kept.join(', ') + ' you typed. Clear a box to go back to the usual figure.', 6000);
      commit();
    } }, I.EQUIP_GROUPS.map(g => el('optgroup', { label: g }, Object.entries(I.EQUIP).filter(([, v]) => v.group === g).map(([k, v]) => el('option', { value: k, text: v.name }))))); typeSel.value = it.item;
    const shelfSel = el('select', { 'aria-label': 'Which shelf', onchange: e2 => { const v = e2.target.value; if (!v) { delete it.shelf; delete it.tier; } else { it.shelf = v; it.tier = Math.min(it.tier || 1, shelves.find(x => x.id === v).tiers); } commit(); } }, [el('option', { value: '', text: 'Not on a shelf' }), ...shelves.map(x => el('option', { value: x.id, text: x.name }))]); shelfSel.value = it.shelf || '';
    const sh = it.shelf && shelves.find(x => x.id === it.shelf), en = I.energy(it), fit = isLight && sh ? I.lightFit(it, sh, traysOf(all)) : null, lit = isLight ? I.litTrays(it, traysOf(all)) : null;
    put(el('label', { class: 'small pl-field' }, ['Type', typeSel]),
      field('Name', it.name, v => { it.name = String(v).slice(0, 60) || e.name; }, { maxlength: '60' }),
      el('div', { class: 'pl-row' }, [lenF('Length', it, 'w', 0.02, 3), lenF('Width', it, 'h', 0.02, 3)]),
      el('label', { class: 'small pl-field' }, ['Shelf', shelfSel]),
      sh ? field('Tier (1 = lowest)', it.tier || 1, v => { if (Number.isFinite(v)) it.tier = Math.min(sh.tiers, Math.max(1, Math.round(v))); }, { type: 'number', step: '1', min: '1', max: String(sh.tiers), inputmode: 'numeric' }) : null,
      e.watts > 0 || it.watts > 0 ? el('div', { class: 'pl-row' }, [field('Power (W, on its plug)', it.watts, v => { if (Number.isFinite(v)) it.watts = Math.min(5000, Math.max(0, Math.round(v))); }, { type: 'number', step: '1', min: '0', max: '5000', inputmode: 'numeric' }), field('Hours on per day', it.hours, v => { if (Number.isFinite(v)) it.hours = Math.min(24, Math.max(0, Math.round(v * 2) / 2)); }, { type: 'number', step: '0.5', min: '0', max: '24', inputmode: 'decimal' })]) : null,
      e.litres ? field(units() === 'ft' ? 'Holds (US gallons of solution)' : 'Holds (litres of solution)', units() === 'ft' ? Math.round((it.litres || e.litres) / 3.785411784 * 10) / 10 : (it.litres || e.litres), v => { if (Number.isFinite(v) && v > 0) it.litres = Math.min(5000, Math.max(1, Math.round((units() === 'ft' ? v * 3.785411784 : v) * 10) / 10)); }, { type: 'number', step: '1', min: '0.3', max: '5000', inputmode: 'decimal' }) : null,
      e.litres ? reservoirBlock(it) : null,
      en.watts > 0 ? el('p', { class: 'small', text: 'About ' + en.kwhDay + ' kWh a day at those hours (an estimate from the plug rating).' }) : null,
      isLight ? lenF('Height above the tray', it, 'above', 0.03, 3) : null,
      isLight ? field('Beam angle (degrees, your assumption)', it.spread, v => { if (Number.isFinite(v)) it.spread = Math.min(170, Math.max(20, Math.round(v))); }, { type: 'number', step: '5', min: '20', max: '170', inputmode: 'numeric' }) : null,
      isLight && lit ? el('p', { class: 'small', text: 'Estimated cover ' + L(I.coverage(it).w) + ' × ' + L(I.coverage(it).h) + ' at that height. ' + lit.length + (lit.length === 1 ? ' tray is' : ' trays are') + ' under it. A guess from the size, height and beam angle: it is not a light measurement, and watts do not tell you how much light plants get.' }) : null,
      fit && !fit.ok ? el('p', { class: 'small pl-warn', text: 'Estimate: this light at this height needs about ' + L(fit.need) + ' above the tier, and the gap is about ' + L(fit.room) + '. Lower the light, remove a tier or use a bigger gap.' }) : null,
      I.matUnused(it, all) ? el('p', { class: 'small pl-warn', text: 'No tray is on this mat. Move the mat under a tray, or a tray onto it.' }) : null,
      isLight ? (() => { const cb = el('input', { type: 'checkbox', checked: !!S.showCover, onchange: ev => { S.showCover = ev.target.checked; drawAll(); } }); return el('label', { class: 'small pl-check' }, [cb, ' Show the cover of every light']); })() : null,
      field('Notes', it.note, v => { it.note = String(v).slice(0, 200); }, { maxlength: '200' }),
      e.group === 'Water' || e.group === 'Air' || e.group === 'Control' || e.watts > 0 ? linksBlock(it) : null,
      e.note ? el('p', { class: 'small muted', text: e.note }) : null,
      el('p', { class: 'small muted', text: 'Typical sizes and ratings for a generic item: change them to match yours. The planner never checks electrical, ventilation or fire safety: ask a qualified person.' }));
  }
  /* things that travel with another: a room carries the shelves inside it, a shelf carries its trays */
  function kids(it, all) {
    if (it.kind === 'room') { const sh = shelvesOf(all).filter(x => inRoom(it, x)), ids = new Set(sh.map(x => x.id)); return [...roomsOf(all).filter(r => r.id !== it.id && r.w * r.h < it.w * it.h && inRoom(it, r)), ...all.filter(h => h.kind === 'hydro' && !h.off && inRoom(it, h)), ...sh, ...traysOf(all).filter(t => ids.has(t.shelf) || (!t.shelf && inRoom(it, t))), ...gearOf(all).filter(t => ids.has(t.shelf) || (!t.shelf && inRoom(it, t)))]; }
    if (it.kind === 'shelf') return [...traysOf(all).filter(t => t.shelf === it.id), ...gearOf(all).filter(t => t.shelf === it.id)];
    return [];
  }
  function withKids(list, all) { const seen = new Set(list.map(x => x.id)), out = list.slice(); for (const it of list) for (const k of kids(it, all)) if (!seen.has(k.id) && !k.locked) { seen.add(k.id); out.push(k); } return out; }
  function turnKids(it, deg, all) { for (const k of kids(it, all)) { if (k.locked) continue; const [x, y] = M.rotPt([k.x, k.y], deg, it.x, it.y); k.x = Math.round(x * 1000) / 1000; k.y = Math.round(y * 1000) / 1000; k.rot = (((k.rot + deg) % 360) + 360) % 360; } }
  /* copies of a shelf bring their trays, pointing at the copy */
  function copyKids(copies, all) {
    const out = [];
    for (const c of copies) { const orig = all.find(x => x.id === c.src); if (!orig || orig.kind === 'tray' || orig.kind === 'gear') continue; for (const k of kids(orig, all)) { if (copies.some(x => x.src === k.id) || out.some(x => x.src === k.id)) continue; const n = Object.assign(JSON.parse(JSON.stringify(k)), { id: M.newId(), locked: false, src: k.id }); delete n.history; M.moveItem(n, c.x - orig.x, c.y - orig.y); out.push(n); } }
    const map = new Map([...copies, ...out].map(x => [x.src, x.id]));
    for (const c of all) if (c.kind === 'conn' && map.has(c.from) && map.has(c.to)) out.push(Object.assign(JSON.parse(JSON.stringify(c)), { id: M.newId(), locked: false, from: map.get(c.from), to: map.get(c.to) }));   // a link is copied when both its ends are
    for (const x of [...copies, ...out]) if ((x.kind === 'tray' || x.kind === 'gear') && x.shelf && map.has(x.shelf)) x.shelf = map.get(x.shelf);
    return out;
  }
  const panel = it => { if (it.kind === 'room') roomPanel(it); else if (it.kind === 'shelf') shelfPanel(it); else if (it.kind === 'tray') trayPanel(it); else if (it.kind === 'gear') gearPanel(it); else if (it.kind === 'hydro') hydroPanel(it); else if (it.kind === 'conn') connPanel(it); };
  return { draw, drawPorts, connectPort, frame, kids, withKids, turnKids, copyKids, panel, planSection, newTray, newGear, addRoomBelow, addTemplate, link, lenF, units, DEFS: { room: [3, 3], shelf: [1.2, 0.45], tray: [0.543, 0.279] } };
}
