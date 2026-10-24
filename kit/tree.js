/* The feature tree (SolidWorks-style), shared by the LT tools.
   Each row: drag handle, open/close for groups, icon, name, then three switches:
     eye   = Hide: hidden while you design, still used in the result (to reach things underneath)
     lock  = Lock: cannot be moved or changed on the canvas
     power = Disable: switched off, left out of the result, kept in the design
   Rows can be renamed (double-click, or F2), dragged to reorder or dropped onto a group, and moved with
   Alt+Up / Alt+Down from the keyboard. Up/Down move between rows; Enter or Space selects; Shift or Ctrl adds.

   nodes: [{id, name, kind, hidden, locked, off, children?: [...], open?}]  (top of the list = front) */
import { el, icon } from './core.js';

export function featureTree(root, o) {
  let dragging = null, lastClick = { id: '', t: 0 };
  const flagBtn = (n, flag, on, ic, label) => {
    const b = el('button', { type: 'button', class: 'icon-btn sm' + (on ? (flag === 'off' ? ' warn' : ' on') : ''), 'aria-pressed': on ? 'true' : 'false', 'aria-label': label + ': ' + n.name, title: label });
    b.append(icon(ic));
    b.addEventListener('click', e => { e.stopPropagation(); o.onToggle(n.id, flag); });
    return b;
  };
  function row(n, depth) {
    const isGroup = Array.isArray(n.children);
    const sel = o.isSelected(n.id);
    const r = el('div', { class: 'trow' + (sel ? ' sel' : '') + (n.glow ? ' glow' : '') + (n.off ? ' off' : '') + (n.hidden ? ' hid' : ''), role: 'treeitem', tabindex: '-1', 'aria-selected': sel ? 'true' : 'false', 'aria-level': String(depth + 1), 'data-id': n.id });
    if (isGroup) r.setAttribute('aria-expanded', n.open === false ? 'false' : 'true');
    const handle = el('span', { class: 'tw handle', title: 'Drag to reorder', 'aria-hidden': 'true' }, [icon('drag')]);
    const tw = isGroup ? el('button', { type: 'button', class: 'tw', 'aria-label': (n.open === false ? 'Open ' : 'Close ') + n.name, tabindex: '-1' }, [icon(n.open === false ? 'chevR' : 'chevD')]) : el('span', { class: 'tw' });
    if (isGroup) tw.addEventListener('click', e => { e.stopPropagation(); o.onOpen(n.id, n.open === false); });
    const name = el('span', { class: 'tname' }, [n.name, n.note ? el('small', { text: n.note }) : null]);
    r.append(handle, tw, el('span', { class: 'tw', 'aria-hidden': 'true' }, [icon(o.iconFor(n))]), name,
      el('span', { class: 'flags' }, [flagBtn(n, 'hidden', n.hidden, n.hidden ? 'eyeOff' : 'eye', n.hidden ? 'Show' : 'Hide while designing'), flagBtn(n, 'locked', n.locked, n.locked ? 'lock' : 'unlock', n.locked ? 'Unlock' : 'Lock'), flagBtn(n, 'off', n.off, 'power', n.off ? 'Switch back on' : 'Disable (leave out)')]));
    // a second click on the same row soon after renames it (the first click redraws the tree, so dblclick cannot be used)
    r.addEventListener('click', e => {
      if (e.target.closest('.flags')) return;
      const t = Date.now(), again = lastClick.id === n.id && t - lastClick.t < 450 && !(e.shiftKey || e.ctrlKey || e.metaKey);
      lastClick = { id: n.id, t: again ? 0 : t };
      o.onSelect(n.id, e.shiftKey || e.ctrlKey || e.metaKey);
      const now = root.querySelector(`.trow[data-id="${CSS.escape(n.id)}"]`);
      if (again && now) rename(n, now.querySelector('.tname')); else (now || r).focus();
    });
    r.addEventListener('keydown', e => key(e, n, r, name));
    handle.addEventListener('pointerdown', e => startDrag(e, n, r));
    return r;
  }
  function rename(n, nameEl) {
    const inp = el('input', { type: 'text', class: 'rename', value: n.name, maxlength: '60', 'aria-label': 'New name' });
    nameEl.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const finish = ok => { if (done) return; done = true; const v = inp.value.trim(); if (ok && v && v !== n.name) o.onRename(n.id, v); else render(); };
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('click', e => e.stopPropagation());
  }
  function key(e, n, r, nameEl) {
    if (e.target !== r) return;
    const rows = [...root.querySelectorAll('.trow')], i = rows.indexOf(r);
    if (e.key === 'ArrowDown' && !e.altKey) { e.preventDefault(); rows[Math.min(rows.length - 1, i + 1)]?.focus(); }
    else if (e.key === 'ArrowUp' && !e.altKey) { e.preventDefault(); rows[Math.max(0, i - 1)]?.focus(); }
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && e.altKey) { e.preventDefault(); o.onNudge(n.id, e.key === 'ArrowUp' ? -1 : 1); focusId(n.id); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.onSelect(n.id, e.shiftKey || e.ctrlKey || e.metaKey); focusId(n.id); }
    else if (e.key === 'F2') { e.preventDefault(); rename(n, nameEl); }
    else if (e.key === 'ArrowRight' && n.children && n.open === false) { e.preventDefault(); o.onOpen(n.id, true); focusId(n.id); }
    else if (e.key === 'ArrowLeft' && n.children && n.open !== false) { e.preventDefault(); o.onOpen(n.id, false); focusId(n.id); }
  }
  const focusId = id => setTimeout(() => { if (root.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return; root.querySelector(`.trow[data-id="${CSS.escape(id)}"]`)?.focus(); }, 0);
  /* dragging by the handle: works with mouse, pen and touch */
  function startDrag(e, n, r) {
    e.preventDefault(); e.stopPropagation();
    dragging = { id: n.id, target: null, where: null };
    r.style.opacity = '.5';
    const clear = () => root.querySelectorAll('.drop-before,.drop-after,.drop-in').forEach(x => x.classList.remove('drop-before', 'drop-after', 'drop-in'));
    const move = ev => {
      clear(); dragging.target = null;
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.trow');
      if (!over || !root.contains(over) || over.dataset.id === n.id) return;
      const b = over.getBoundingClientRect(), y = (ev.clientY - b.top) / b.height, isGroup = over.hasAttribute('aria-expanded');
      const where = isGroup && y > 0.3 && y < 0.7 ? 'in' : y < 0.5 ? 'before' : 'after';
      over.classList.add('drop-' + where); dragging.target = over.dataset.id; dragging.where = where;
    };
    const up = () => {
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
      r.style.opacity = ''; clear();
      const d = dragging; dragging = null;
      if (d && d.target) o.onMove(d.id, d.target, d.where);
    };
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
  }
  function build(nodes, depth) {
    const ul = el(depth ? 'ul' : 'div', depth ? { role: 'group' } : { class: 'tree', role: 'tree', 'aria-label': o.label || 'Feature tree' });
    for (const n of nodes) {
      const li = el(depth ? 'li' : 'div', {}, [row(n, depth)]);
      if (n.children && n.open !== false && n.children.length) li.append(build(n.children, depth + 1));
      ul.append(li);
    }
    return ul;
  }
  function render() {
    const had = document.activeElement && root.contains(document.activeElement) ? document.activeElement.closest('.trow')?.dataset.id : null;
    root.textContent = '';
    const nodes = o.nodes();
    if (!nodes.length) { root.append(el('p', { class: 'muted small', text: o.empty || 'Nothing here yet.' })); return; }
    root.append(build(nodes, 0));
    const rows = root.querySelectorAll('.trow');
    const first = root.querySelector('.trow.sel') || rows[0]; if (first) first.tabIndex = 0;
    if (had) focusId(had);
  }
  render();
  return { render };
}
