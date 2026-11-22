/* Tools home page: the shared top bar, and who is signed in. */
import { loadConfig, $, getSession, store, signInUrl, el, registerSW } from './core.js';
import { topBar } from './bar.js';

(async function () {
  registerSW();
  await loadConfig();
  const passes = ['print', 'catalogue', 'planner', 'nutrients'].map(t => store.get('lt_tool_pass_' + t)).filter(x => x && x.until > Date.now());
  const pass = passes.sort((a, b) => b.until - a.until)[0];
  const who = pass && pass.until > Date.now() ? { alias: pass.alias, offline: !getSession(), checked: pass.checked } : null;
  $('#bar').replaceWith(topBar({ tool: '', who }));
  const p = $('#who');
  p.hidden = false;
  if (who) p.append('Signed in as ', el('b', { text: who.alias }), '.');
  else p.append('Not signed in on this device. ', el('a', { href: signInUrl('print/'), text: 'Sign in' }), ' or ', el('a', { href: 'https://lineagetracker.org/register.html', text: 'create a free account' }), '.');
})();
