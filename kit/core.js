/* LT tools kit: settings, small DOM helpers, sign-in and the membership gate.
   Nothing secret lives here. The Supabase "publishable" key is public by design: the tables are locked and every
   action is checked on the server.

   Sign-in works like lineagetracker.org (same accounts, same rules), but this is a different web address, so you sign
   in here separately:
   - The sign-in token is kept in this tab only, unless "keep me signed in" is ticked. Staff are always tab-only.
   - Passwords are only typed into the page and sent over HTTPS to Supabase Auth. They are never stored or logged.

   The membership gate. The tools need a free account (owner decision 2026-10-16):
   - A successful check is remembered on this device for the number of days the server says (30), so a tool still
     opens in a shed with no signal.
   - It is a door, not a lock. Designs never touch our server (they are saved to your own Drive, Dropbox or device),
     and the tools' code is public. */
/* These pages must not be shown inside another website's frame (a meta policy cannot forbid that, so we do it here). */
if (window.top !== window.self) { try { document.documentElement.style.display = 'none'; window.top.location = window.self.location.href; } catch { /* ignore */ } }
export const CFG = {
  SUPABASE_URL: 'https://zlekqqzvkstdcrrupzfs.supabase.co',
  PUBLISHABLE_KEY: 'sb_publishable_rkMTn3vFh8y77G9Lj5peAA_pN1tS_Fs',
  TURNSTILE_SITE_KEY: '0x4AAAAAAAFVX_SnEoyXnA85N',
  SITE: 'https://lineagetracker.org',
  APP: 'https://app.lineagetracker.org/',
  // Same Google client ID and Dropbox app key as the app (config.json can override, like the app's config.json).
  googleClientId: '',
  dropboxAppKey: '',
};
const ROOT = new URL('..', import.meta.url).href;            // the tools site root, wherever it is served from
export const rootUrl = (p = '') => ROOT + p;

let cfgLoaded = null;
export function loadConfig() {
  if (!cfgLoaded) cfgLoaded = fetch(rootUrl('config.json'), { cache: 'no-cache' }).then(r => (r.ok ? r.json() : {})).catch(() => ({})).then(j => {
    for (const k of ['googleClientId', 'dropboxAppKey', 'APP', 'SITE']) if (typeof j[k] === 'string' && j[k].trim()) CFG[k] = j[k].trim();
    return CFG;
  });
  return cfgLoaded;
}

/* ---------- DOM ---------- */
export const $ = (s, root = document) => root.querySelector(s);
export const $$ = (s, root = document) => [...root.querySelectorAll(s)];
export function el(tag, attrs = {}, kids = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'text') e.textContent = v;
    else if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'value') e[k] = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(kids)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/* Small message at the bottom of the screen; also read out by screen readers. */
let toastTimer = 0;
export function toast(msg, ms = 3200) {
  let t = $('#kit-toast');
  if (!t) { t = el('div', { id: 'kit-toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}

/* A simple modal dialog. Returns {box, close}. Escape and the close button close it; focus returns to where it was. */
export function dialog(title, body, { wide = false, onClose } = {}) {
  const back = document.activeElement;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', key, true); if (back && back.focus) back.focus(); onClose && onClose(); };
  const key = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  const head = el('div', { class: 'dlg-head' }, [el('h2', { id: 'dlg-t', text: title }), el('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Close', onclick: close }, [icon('x')])]);
  const box = el('div', { class: 'dlg' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'dlg-t' }, [head, el('div', { class: 'dlg-body' }, body)]);
  const wrap = el('div', { class: 'dlg-wrap', onmousedown: e => { if (e.target === wrap) close(); } }, [box]);
  document.body.append(wrap); document.addEventListener('keydown', key, true);
  setTimeout(() => { const f = box.querySelector('input,select,textarea,button:not(.icon-btn)') || box.querySelector('button'); f && f.focus(); }, 0);
  return { box, close };
}
export function confirmBox(title, text, okText = 'OK', { danger = false } = {}) {
  return new Promise(res => {
    let done = false;
    const finish = v => { if (done) return; done = true; d.close(); res(v); };
    const d = dialog(title, [el('p', { text }), el('div', { class: 'actions' }, [
      el('button', { type: 'button', class: 'btn' + (danger ? ' danger' : ' primary'), text: okText, onclick: () => finish(true) }),
      el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => finish(false) })])], { onClose: () => { if (!done) { done = true; res(false); } } });
  });
}
export function promptBox(title, label, value = '', { okText = 'OK', max = 80 } = {}) {
  return new Promise(res => {
    let done = false;
    const inp = el('input', { type: 'text', value, maxlength: String(max) });
    const finish = v => { if (done) return; done = true; d.close(); res(v); };
    const form = el('form', { onsubmit: e => { e.preventDefault(); finish(inp.value.trim()); } }, [
      el('label', { class: 'fld' }, [el('span', { text: label }), inp]),
      el('div', { class: 'actions' }, [el('button', { type: 'submit', class: 'btn primary', text: okText }), el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => finish(null) })])]);
    const d = dialog(title, [form], { onClose: () => { if (!done) { done = true; res(null); } } });
    setTimeout(() => inp.select(), 0);
  });
}

/* Icons: simple strokes, drawn here so nothing loads from elsewhere. */
const ICONS = {
  x: 'M6 6l12 12M18 6L6 18', eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z', eyeOff: 'M3 3l18 18M10.6 5.1A10.4 10.4 0 0112 5c6.4 0 10 7 10 7a17 17 0 01-3.2 4.1M6.6 6.6C3.9 8.3 2 12 2 12s3.6 7 10 7c1.8 0 3.3-.5 4.6-1.2M9.9 9.9a3 3 0 004.2 4.2',
  lock: 'M6 11h12v10H6zM8 11V7a4 4 0 018 0v4', unlock: 'M6 11h12v10H6zM8 11V7a4 4 0 017.7-1.5', power: 'M12 3v9M6.3 6.3a8 8 0 1011.4 0',
  text: 'M5 6V4h14v2M12 4v16M9 20h6', field: 'M4 7h16v10H4zM8 11h4M8 14h8', qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2', rect: 'M4 6h16v12H4z',
  ellipse: 'M12 5c4.4 0 8 3.1 8 7s-3.6 7-8 7-8-3.1-8-7 3.6-7 8-7z', line: 'M4 18L20 6', image: 'M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9.5a1.5 1.5 0 100-.01', logo: 'M12 3v18M12 8l-4-3M12 8l4-3M12 13l-5-3M12 13l5-3M8 21h8',
  group: 'M3 7h7l2 2h9v10H3z', chevR: 'M9 6l6 6-6 6', chevD: 'M6 9l6 6 6-6', up: 'M12 19V5M6 11l6-6 6 6', down: 'M12 5v14M6 13l6 6 6-6', plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3', copy: 'M8 8h12v12H8zM4 16V4h12', undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3', redo: 'M15 14l5-5-5-5M20 9H9a5 5 0 000 10h3',
  zoomIn: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5M11 8v6M8 11h6', zoomOut: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5M8 11h6', fit: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  menu: 'M4 7h16M4 12h16M4 17h16', save: 'M5 4h11l3 3v13H5zM8 4v5h7V4M8 20v-6h8v6', folder: 'M3 6h7l2 2h9v11H3z', print: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0', grid: 'M4 4h16v16H4zM4 10h16M4 16h16M10 4v16M16 4v16', drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  cloud: 'M7 18a5 5 0 01-.6-10A6 6 0 0118 9a4.5 4.5 0 01-.5 9z', download: 'M12 4v11M7 10l5 5 5-5M5 20h14', upload: 'M12 20V9M7 14l5-5 5 5M5 4h14', table: 'M4 5h16v14H4zM4 10h16M4 15h16M10 5v14',
  alignL: 'M4 6h16M4 10h10M4 14h16M4 18h10', alignC: 'M4 6h16M7 10h10M4 14h16M7 18h10', alignR: 'M4 6h16M10 10h10M4 14h16M10 18h10', tag: 'M3 12V4h8l10 10-8 8zM7.5 8.5h.01',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z',
  check: 'M5 12l5 5 9-10', barcode: 'M4 5v14M7 5v14M9 5v14M12 5v14M15 5v14M16.5 5v14M20 5v14', calendar: 'M4 6h16v14H4zM4 10h16M9 3v4M15 3v4', hash: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16', info: 'M12 22a10 10 0 100-20 10 10 0 000 20zM12 11v6M12 7h.01', back: 'M15 6l-6 6 6 6',
};
export function icon(name, cls = '') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', 'ic ' + cls);
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', ICONS[name] || ICONS.info); s.append(p);
  return s;
}

/* ---------- Storage that never throws ---------- */
export const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ignore */ } },
};

/* ---------- Sign-in (the same Supabase Auth as the website) ---------- */
const KEY = 'lt_session';
let mem = null, where = '', inflight = null;
const now = () => Math.floor(Date.now() / 1000);
const ses = () => { try { return window.sessionStorage; } catch { return null; } };
const loc = () => { try { return window.localStorage; } catch { return null; } };
const readS = st => { try { const j = st && st.getItem(KEY); if (j) { const o = JSON.parse(j); if (o && o.access_token) return o; } } catch { /* ignore */ } return null; };
export function getSession() {
  let s = readS(ses()); if (s) { where = 'session'; return s; }
  s = readS(loc()); if (s) { where = 'local'; return s; }
  where = ''; return mem;
}
function setSession(x, persist) {
  if (x) x = { access_token: x.access_token, refresh_token: x.refresh_token, expires_at: x.expires_at || (now() + (x.expires_in || 3600)) };
  if (x && persist === undefined) { getSession(); persist = where === 'local'; }
  mem = x;
  for (const st of [ses(), loc()]) { try { st && st.removeItem(KEY); } catch { /* ignore */ } }
  where = '';
  if (x) { const st = persist ? loc() : ses(); try { if (st) { st.setItem(KEY, JSON.stringify(x)); where = persist ? 'local' : 'session'; } } catch { /* ignore */ } }
}
function keepInTab() { const s = getSession(); if (s && where === 'local') setSession(s, false); }
async function raw(path, method, body, token) {
  const h = { apikey: CFG.PUBLISHABLE_KEY, 'Content-Type': 'application/json' }; if (token) h.Authorization = 'Bearer ' + token;
  try {
    const r = await fetch(CFG.SUPABASE_URL + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, body: j };
  } catch { return { ok: false, status: 0, body: { error: 'network' } }; }
}
function refresh() {
  if (inflight) return inflight;
  const s = getSession(); if (!s || !s.refresh_token) return Promise.resolve(false);
  inflight = raw('/auth/v1/token?grant_type=refresh_token', 'POST', { refresh_token: s.refresh_token }).then(r => {
    inflight = null;
    if (r.ok && r.body.access_token) { setSession(r.body); return true; }
    if (r.status >= 400 && r.status < 500) setSession(null);
    return r.status === 0 ? 'offline' : false;
  });
  return inflight;
}
async function accessToken() {
  const s = getSession(); if (!s) return null;
  if (s.expires_at - now() > 60) return s.access_token;
  const ok = await refresh();
  if (ok === 'offline') return 'offline';
  return ok ? getSession().access_token : null;
}
async function authed(path, method, body) {
  const t = await accessToken();
  if (t === 'offline') return { ok: false, status: 0, body: { error: 'network' } };
  if (!t) return { ok: false, status: 401, body: { error: 'signed_out' } };
  let r = await raw(path, method, body, t);
  if (r.status === 401 && await refresh() === true) r = await raw(path, method, body, getSession().access_token);
  return r;
}
export const rpc = (name, args) => authed('/rest/v1/rpc/' + name, 'POST', args || {});
const np = s => { try { return String(s).normalize('NFKC'); } catch { return s; } };
export async function signIn(email, password, captcha, stay) {
  const r = await raw('/auth/v1/token?grant_type=password', 'POST', { email, password: np(password), gotrue_meta_security: { captcha_token: captcha || '' } });
  if (r.ok && r.body.access_token) setSession(r.body, !!stay);
  return r;
}
export async function signOut() {
  const s = getSession(); setSession(null); clearPasses();
  if (s) await raw('/auth/v1/logout?scope=local', 'POST', {}, s.access_token);
  return true;
}
export const authUser = () => authed('/auth/v1/user', 'GET');
export function verifiedFactor(u) { return ((u && u.factors) || []).find(f => f.factor_type === 'totp' && f.status === 'verified') || null; }
export async function challengeVerify(factorId, code) {
  const c = await authed('/auth/v1/factors/' + factorId + '/challenge', 'POST', {});
  if (!c.ok) return c;
  const v = await authed('/auth/v1/factors/' + factorId + '/verify', 'POST', { challenge_id: c.body.id, code: String(code).replace(/\s+/g, '') });
  if (v.ok && v.body.access_token) setSession(v.body);
  return v;
}
/* {state:'out'|'pending'|'suspended'|'active'|'none'|'error', me} */
export async function whoAmI() {
  const r = await rpc('member_me');
  if (r.status === 401) return { state: 'out' };
  if (!r.ok) return { state: r.status === 0 ? 'offline' : 'error' };
  if (r.body === null) return { state: 'none' };
  if (r.body.status && r.body.status !== 'active') return { state: r.body.status };
  if (r.body.role) keepInTab();
  return { state: 'active', me: r.body };
}

/* ---------- Turnstile (spam check on the sign-in form) ---------- */
let tsLoaded = false; const tsQueue = [];
export function turnstile(box) {
  const h = { token: '', widget: null, reset() { h.token = ''; if (window.turnstile && h.widget !== null) window.turnstile.reset(h.widget); } };
  if (!CFG.TURNSTILE_SITE_KEY || !box) return h;
  const draw = () => { h.widget = window.turnstile.render(box, { sitekey: CFG.TURNSTILE_SITE_KEY, callback: t => { h.token = t; }, 'expired-callback': () => { h.token = ''; }, 'error-callback': () => { h.token = ''; } }); };
  if (window.turnstile) draw();
  else {
    tsQueue.push(draw);
    if (!tsLoaded) {
      tsLoaded = true; window.ltTsReady = () => tsQueue.splice(0).forEach(f => f());
      const s = document.createElement('script'); s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=ltTsReady'; s.async = true; s.defer = true; document.head.append(s);
    }
  }
  return h;
}

/* ---------- The membership gate ---------- */
const PASS = t => 'lt_tool_pass_' + t;
export const TOOLS = { print: { name: 'LT-Print', path: 'print/' }, garden: { name: 'LT-Garden', path: 'garden/' } };
function clearPasses() { for (const t of Object.keys(TOOLS)) store.del(PASS(t)); }
export const REASONS = {
  closed: 'This tool is not open to members yet. It will open soon.',
  not_member: 'We could not find a member account for this sign-in.',
  not_active: 'This account cannot use the tools right now. If it is new, open the link in the email we sent you first.',
  needs_terms: 'The website terms were updated. Please read and accept them on your account page, then come back.',
  signed_out: 'Please sign in with your free Lineage Tracker account.',
  error: 'We could not check your account just now. Please try again in a few minutes.',
  offline: 'You are offline, and this device has not been signed in to the tools yet. Connect once to sign in; after that the tool opens without a connection for 30 days.',
  bad_tool: 'We could not check your account just now. Please try again in a few minutes.',
};
/* Resolves {ok:true, alias, offline, checked} or {ok:false, reason}. Never throws. */
export async function gate(tool) {
  const pass = store.get(PASS(tool));
  const valid = pass && pass.until > Date.now();
  if (!getSession()) {
    // signed out: a pass remembered from an earlier sign-in still opens the tool until it runs out
    return valid ? { ok: true, alias: pass.alias, offline: true, checked: pass.checked } : { ok: false, reason: 'signed_out' };
  }
  const r = await rpc('member_tool_open', { p_tool: tool });
  if (r.ok && r.body && r.body.ok) {
    const p = { alias: r.body.alias, checked: Date.now(), until: Date.now() + Math.min(60, Math.max(1, +r.body.days || 30)) * 86400000, preview: r.body.open_to_all === false };
    store.set(PASS(tool), p);
    return { ok: true, alias: p.alias, offline: false, checked: p.checked, preview: p.preview };
  }
  if (r.status === 0 || r.status >= 500) return valid ? { ok: true, alias: pass.alias, offline: true, checked: pass.checked } : { ok: false, reason: r.status === 0 ? 'offline' : 'error' };
  if (r.status === 401) { setSession(null); return valid ? { ok: true, alias: pass.alias, offline: true, checked: pass.checked } : { ok: false, reason: 'signed_out' }; }
  // a clear "no" from the server takes back the remembered pass
  store.del(PASS(tool));
  if (r.ok && r.body && r.body.reason) return { ok: false, reason: r.body.reason };
  // the server has not been set up for the tools yet (13_tools.sql not run)
  return { ok: false, reason: r.status === 404 ? 'closed' : 'error' };
}
export function signInUrl(next) { return rootUrl('signin.html?next=' + encodeURIComponent(next)); }
export const fmtDay = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
/* Offline: the tools keep working without a connection after the first visit (sw.js). */
export function registerSW() {
  if (!('serviceWorker' in navigator) || !/^https:$|^http:$/.test(location.protocol)) return;
  if (location.protocol === 'http:' && !/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;
  navigator.serviceWorker.register(rootUrl('sw.js'), { scope: rootUrl('') }).catch(() => {});
}
