/* Expandable sections for the side panels of every tool. Open or closed is remembered on this device (per tool). */
import { el, store } from './core.js';

const KEY = scope => 'lt_fold_' + scope;
const wasOpen = (scope, key, dflt) => { const s = store.get(KEY(scope), {}) || {}; return Object.prototype.hasOwnProperty.call(s, key) ? !!s[key] : dflt; };
const remember = (scope, key, open) => { const s = store.get(KEY(scope), {}) || {}; if (s[key] === open) return; s[key] = open; store.set(KEY(scope), s); };

/* A section with a title. Returns { box, body }: put box in the panel and the content in body. */
export function fold(scope, title, open = true, key = title) {
  const box = el('details', { class: 'fold' });
  box.open = wasOpen(scope, key, open);
  const body = el('div', { class: 'fold-body' });
  box.append(el('summary', { text: title }), body);
  let first = true;
  box.addEventListener('toggle', () => { if (first) { first = false; if (box.open === wasOpen(scope, key, open)) return; } remember(scope, key, box.open); });
  return { box, body };
}

/* Turn a panel built with <h3> headings into sections: everything after a heading, up to the next heading, goes inside it.
   closed: titles that start folded (unless the person has opened them before). */
export function foldHeadings(root, scope, { closed = [] } = {}) {
  const kids = [...root.children];
  let cur = null;
  for (const k of kids) {
    if (k.tagName === 'H3' && k.textContent.trim()) {
      const t = k.textContent.trim();
      cur = fold(scope, t, !closed.includes(t));
      root.insertBefore(cur.box, k); k.remove();
    } else if (cur) cur.body.append(k);
  }
  return root;
}
