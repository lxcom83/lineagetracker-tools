/* The top bar every tool shares: tree logo + "Lineage Tracker · <Tool>", a slot for the tool's own controls,
   the switcher (App, Print, Garden, website) and the account menu. */
import { el, icon, rootUrl, CFG, signOut, TOOLS } from './core.js';

function popMenu(btn, build) {
  let menu = null;
  const close = () => { if (!menu) return; menu.remove(); menu = null; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); };
  const away = e => { if (menu && !menu.contains(e.target) && !btn.contains(e.target)) close(); };
  const key = e => { if (e.key === 'Escape') { close(); btn.focus(); } };
  btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => {
    if (menu) { close(); return; }
    menu = el('div', { class: 'kmenu', role: 'menu' }, build(close));
    btn.parentElement.append(menu); btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', away, true); document.addEventListener('keydown', key, true);
    const f = menu.querySelector('a,button'); f && f.focus();
  });
  return close;
}

/* tool: 'print' | 'planner' | '' (tools home).  slot: element(s) for the middle.  who: {alias, offline} or null */
export function topBar({ tool = '', slot = null, who = null } = {}) {
  const name = TOOLS[tool]?.name.replace('LT-', '') || 'Tools';
  const brand = el('a', { class: 'kbrand', href: rootUrl(''), title: 'LT tools home' }, [
    el('img', { src: rootUrl('brand/logo-icon.svg'), alt: '', class: 'logo-light' }), el('img', { src: rootUrl('brand/logo-icon-dark.svg'), alt: '', class: 'logo-dark' }),
    el('span', { class: 'bname' }, [el('span', { class: 'lt', text: 'Lineage Tracker' }), el('span', { class: 'dot', text: ' · ' }), el('span', { class: 'tool', text: name })])]);
  const swBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Switch tool' }, [icon('grid')]);
  const sw = el('div', { class: 'kswitch' }, [swBtn]);
  popMenu(swBtn, () => [
    ...Object.entries(TOOLS).map(([k, t]) => el('a', { href: rootUrl(t.path), role: 'menuitem', class: k === tool ? 'here' : '' }, [icon(k === 'print' ? 'tag' : 'grid'), el('span', {}, [t.name, el('small', { text: k === 'print' ? 'Label and sticker designer' : 'Garden and farm planner (coming later)' })])])),
    el('div', { class: 'sep' }),
    el('a', { href: CFG.APP, role: 'menuitem', target: '_blank', rel: 'noopener' }, [icon('logo'), el('span', {}, ['Lineage Tracker app', el('small', { text: 'Your records (opens in a new tab)' })])]),
    el('a', { href: CFG.SITE, role: 'menuitem' }, [icon('info'), el('span', { text: 'lineagetracker.org' })]),
  ]);
  const kids = [brand, el('div', { class: 'grow' }, slot ? [].concat(slot) : []), sw];
  if (who) {
    const accBtn = el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Account: ' + who.alias }, [icon('user')]);
    const acc = el('div', { class: 'kswitch' }, [accBtn]);
    popMenu(accBtn, close => [
      el('div', { style: 'padding:6px 10px' }, [el('b', { text: who.alias }), el('small', { text: who.offline ? 'Working offline. Membership last checked ' + new Date(who.checked).toLocaleDateString() : 'Signed in' })]),
      el('div', { class: 'sep' }),
      el('a', { href: CFG.SITE + '/account.html', role: 'menuitem' }, [icon('settings'), el('span', { text: 'Your account (website)' })]),
      el('button', { type: 'button', role: 'menuitem', onclick: async () => { close(); await signOut(); location.href = rootUrl(''); } }, [icon('back'), el('span', {}, ['Sign out', el('small', { text: 'Also forgets the 30-day pass on this device' })])]),
    ]);
    kids.push(acc);
  }
  return el('header', { class: 'kbar' }, kids);
}
