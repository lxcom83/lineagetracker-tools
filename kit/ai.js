/* AI helper for the LT tools, with the member's OWN key (Design principles 3 and 8: we run no AI and pay for none; off until the member
   switches it on; every use says in one line what leaves the device and where it goes).

   The key is set up ONCE, in the member's account (locked with their password on their device first, so we only hold locked bytes), and
   every tool uses it.  The unlocked copy lives only in the open tab.  When the member presses an AI button, the photo and a short instruction go straight
   from this device to the provider they chose (Anthropic's Claude or Google's Gemini), the same way the app's smart features work.

   aiReady()            true when switched on with a key
   aiSettings()         open the settings dialog (also in the account menu of every tool)
   askAI({images, text, maxTokens})   -> reply text; images: [{data (base64, no prefix), mime}]
   photoForAI(file)     -> {data, mime, url, w, h}  (scaled to at most 1600 px, JPEG)
   parseReplyJSON(text) -> the first {...} object in a reply
   aiConsent(what)      -> Promise<boolean>: asks once per kind of use before the first photo goes */
import { el, icon, toast, dialog, store, rpc, fnAuthed } from './core.js';
import { lockSecret, openSecret } from './keybox.js';

const KEY = 'lt-tools.ai', OPEN = 'lt-tools.ai.open';
export const PROVIDERS = {
  claude: { name: 'Claude (Anthropic)', model: 'claude-sonnet-5-5', keyHint: 'Starts with sk-ant-', where: 'Anthropic (Claude)', keys: 'https://console.anthropic.com/settings/keys' },
  gemini: { name: 'Gemini (Google)', model: 'gemini-3.8-flash', keyHint: 'From Google AI Studio', where: 'Google (Gemini)', keys: 'https://aistudio.google.com/apikey' }
};
/* Where things live:
   - the key itself: in the member's ACCOUNT, locked with their password on this device first (keybox.js), so we only hold locked bytes;
   - the unlocked copy: in this tab's sessionStorage only (gone when the tab closes or the member signs out);
   - which uses they have said yes to (consent): this browser's localStorage (nothing secret). */
const ses = () => { try { return window.sessionStorage; } catch { return null; } };
const readOpen = () => { try { const o = JSON.parse(ses().getItem(OPEN)); if (o && typeof o.key === 'string' && PROVIDERS[o.provider]) return o; } catch { /* ignore */ } return null; };
const writeOpen = o => { try { ses().setItem(OPEN, JSON.stringify(o)); } catch { /* ignore */ } };
export const clearOpenKey = () => { try { ses().removeItem(OPEN); } catch { /* ignore */ } };
const legacy = () => { let s = store.get(KEY, null) || {}; if (typeof s.key === 'string' && s.key && PROVIDERS[s.provider]) return s; const old = store.get('lt_ai_key', ''); return typeof old === 'string' && old ? { provider: 'claude', key: old, model: '' } : null; };   // keys kept in this browser before accounts held them
const get = () => { const o = readOpen() || legacy() || {}, c = store.get(KEY, null) || {};
  return { provider: PROVIDERS[o.provider] ? o.provider : '', key: typeof o.key === 'string' ? o.key : '', model: typeof o.model === 'string' ? o.model : '', consent: c.consent && typeof c.consent === 'object' ? c.consent : {} }; };
const put = s => { if (s.provider && s.key) writeOpen({ provider: s.provider, key: s.key, model: s.model || '' }); else clearOpenKey(); store.set(KEY, { consent: s.consent || {} }); };
export const aiReady = () => { const s = get(); return !!(s.provider && s.key); };
export const aiProviderName = () => { const s = get(); return s.provider ? PROVIDERS[s.provider].where : ''; };
/* the unlocked Claude key for LT-Catalogue (or '') */
export const openKeyFor = provider => { const s = get(); return s.provider === provider ? s.key : ''; };

/* ---------- the account's locked key ---------- */
export async function accountKey() { const r = await rpc('member_ai_key_get'); return r.ok && r.body && r.body.blob ? r.body : null; }
/* sign-in knows the password: unlock quietly. -> 'ok' | 'none' (nothing saved) | 'wrong' | 'offline' */
export async function unlockAIKey(password) {
  if (readOpen()) return 'ok';
  const r = await rpc('member_ai_key_get'); if (r.status === 0) return 'offline';
  if (!r.ok || !r.body || !r.body.blob) return 'none';
  const k = await openSecret(r.body.blob, password); if (k === null) return 'wrong';
  writeOpen({ provider: r.body.provider, key: k, model: r.body.model || '' }); return 'ok';
}
/* before an AI button: true once a key is unlocked here; asks for the password once per tab, or opens the settings if no key is saved yet */
export async function ensureAI() {
  if (aiReady()) return true;
  const rem = await accountKey();
  if (!rem) return new Promise(res => aiSettings(() => res(aiReady())));
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; d.close(); res(v); };
    const pw = el('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Your password' }), msg = el('p', { class: 'small', role: 'status' });
    const go = async () => { if (!pw.value) return; msg.textContent = 'Unlocking…'; const k = await openSecret(rem.blob, pw.value);
      if (k === null) { msg.textContent = 'That password did not unlock your key. If you changed or reset your password since, choose "Paste my key again".'; return; }
      writeOpen({ provider: rem.provider, key: k, model: rem.model || '' }); fin(true); };
    pw.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    const d = dialog('Unlock your AI helper', [
      el('p', { text: 'Your AI key is saved in your account, locked with your password so we cannot read it. Type your password once to use it in this tab.' }),
      el('label', { class: 'fld' }, [el('span', { text: 'Your password' }), pw]), msg,
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Unlock', onclick: go }),
        el('button', { type: 'button', class: 'btn', text: 'Paste my key again', onclick: () => { fin(false); aiSettings(); } }), el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => fin(false) })])
    ], { onClose: () => { if (!done) { done = true; res(false); } } });
    setTimeout(() => pw.focus(), 50);
  });
}

/* ---------- settings (the same key for every tool and, on the website, the account page) ---------- */
export function aiSettings(onDone) {
  const s = get();
  const prov = el('select', { 'aria-label': 'AI provider' }, [el('option', { value: '', text: 'Off (no AI)' }), ...Object.entries(PROVIDERS).map(([k, p]) => el('option', { value: k, text: p.name }))]); prov.value = s.provider;
  const key = el('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', value: s.key, placeholder: 'Paste your API key' });
  const model = el('input', { type: 'text', spellcheck: 'false', value: s.model, placeholder: '' });
  const pw = el('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Your password' }), pw2 = el('input', { type: 'password', autocomplete: 'current-password', 'aria-label': 'Your password again' });
  const hint = el('p', { class: 'small muted' }), msg = el('p', { class: 'small', role: 'status' });
  const keyRow = el('div', {}, [el('label', { class: 'fld' }, [el('span', { text: 'Your API key' }), key]), el('label', { class: 'fld' }, [el('span', { text: 'Model (leave empty for the standard one)' }), model]), hint,
    el('label', { class: 'fld' }, [el('span', { text: 'Your password (locks the key)' }), pw]), el('label', { class: 'fld' }, [el('span', { text: 'Your password again' }), pw2])]);
  const sync = () => { const p = PROVIDERS[prov.value]; keyRow.hidden = !p; if (p) { model.placeholder = p.model; hint.textContent = ''; hint.append(p.keyHint + '. Get one at ', el('a', { href: p.keys, target: '_blank', rel: 'noopener', text: p.keys.replace('https://', '') }), '. The provider charges you for what you use (usually a few cents per photo).'); } };
  prov.addEventListener('change', sync); sync();
  const apply = () => { const p = prov.value; put({ provider: p, key: p ? key.value.trim() : '', model: p ? model.value.trim() : '', consent: p === s.provider ? s.consent : {} }); };
  let busy = false;
  const save = async () => {
    if (busy) return; const p = prov.value;
    if (!p) { busy = true; const r = await rpc('member_ai_key_delete'); busy = false; if (!r.ok) { msg.textContent = 'We could not reach your account. Try again.'; return; } put({ consent: s.consent }); store.del('lt_ai_key'); d.close(); toast('AI helper off'); onDone && onDone(); return; }
    if (!key.value.trim()) { msg.textContent = 'Paste your key first, or choose Off.'; return; }
    if (!pw.value) { msg.textContent = 'Type your password to lock the key.'; return; }
    if (pw.value !== pw2.value) { msg.textContent = 'The two passwords are not the same.'; return; }
    busy = true; msg.textContent = 'Checking your password…';
    try {
      // the key must be locked with the REAL account password, or the app, the website and a password change could never open it again
      const c = await fnAuthed('account', { action: 'password_check', current: pw.value });
      if (!(c.ok && c.body && c.body.ok)) { busy = false; msg.textContent = c.status === 0 ? 'No connection. Your key was not saved.' : c.status === 429 ? 'Too many tries. Wait a few minutes and try again.' : c.status === 400 ? 'That is not your account password. The key is locked with it, so it must be the real one.' : 'We could not check your password right now. Try again in a moment.'; return; }
      msg.textContent = 'Locking and saving…';
      const blob = await lockSecret(key.value.trim(), pw.value);
      const r = await rpc('member_ai_key_set', { p_provider: p, p_model: model.value.trim(), p_blob: blob });
      if (!(r.ok && r.body === true)) { msg.textContent = r.status === 0 ? 'No connection. Your key was not saved.' : 'We could not save it to your account. Try again in a moment.'; busy = false; return; }
      apply(); store.del('lt_ai_key'); busy = false; d.close(); toast('AI helper on (' + PROVIDERS[p].name + '), saved to your account'); onDone && onDone();
    } catch { msg.textContent = 'Something went wrong locking the key. Try again.'; busy = false; }
  };
  const unlockRow = el('div', { hidden: true }, [el('p', { class: 'small', text: 'A key is saved in your account. Type your password above and press Unlock to use it here, or paste a new one.' }),
    el('button', { type: 'button', class: 'btn', text: 'Unlock it here', onclick: async () => { const rem = await accountKey(); if (!rem) { msg.textContent = 'No saved key found.'; return; } const k = pw.value ? await openSecret(rem.blob, pw.value) : null;
      if (k === null) { msg.textContent = 'That password did not unlock it. If you reset your password, paste your key again.'; return; } prov.value = rem.provider; key.value = k; model.value = rem.model || ''; sync(); writeOpen({ provider: rem.provider, key: k, model: rem.model || '' }); msg.textContent = 'Unlocked.'; } })]);
  if (!s.key) accountKey().then(rem => { if (rem) unlockRow.hidden = false; });
  const d = dialog('AI helper (your own key)', [
    el('p', { text: 'Optional. Lets LT-Print read a photo of a label, and LT-Planner read a drawing of your garden, and lay them out for you. Set it up once here and every LT tool uses it. It is your own account with an AI provider, so Lineage Tracker runs and pays for nothing.' }),
    el('label', { class: 'fld' }, [el('span', { text: 'Provider' }), prov]), unlockRow, keyRow,
    el('p', { class: 'small muted', text: 'Your key is locked with your password on this device before it is saved to your account, so we cannot read it and neither can anyone else. If you reset your password, paste the key again. When you use an AI button, the photo and a short instruction go straight from this device to the provider you chose, and nothing else.' }),
    msg,
    el('div', { class: 'actions' }, [
      el('button', { type: 'button', class: 'btn primary', text: 'Save', onclick: save }),
      el('button', { type: 'button', class: 'btn', text: 'Test the key', onclick: async () => { if (!prov.value || !key.value.trim()) { msg.textContent = 'Choose a provider and paste your key first.'; return; } apply(); msg.textContent = 'Checking…'; try { const r = await askAI({ text: 'Reply with the single word OK.', maxTokens: 10 }); msg.textContent = /ok/i.test(r) ? 'The key works. Press Save to keep it.' : 'The provider answered, but not as expected: ' + r.slice(0, 80); } catch (e) { msg.textContent = e.message; } } }),
      el('button', { type: 'button', class: 'btn danger', text: 'Remove my key', onclick: async () => { const r = await rpc('member_ai_key_delete'); if (!r.ok) { msg.textContent = 'We could not reach your account. Try again.'; return; } put({ consent: s.consent }); store.del('lt_ai_key'); d.close(); toast('Key removed from your account'); onDone && onDone(); } })
    ])
  ]);
  return d;
}

/* asked once for each use (label photos, garden drawings) before the first photo goes; switching provider asks again */
export function aiConsent(kind, what) {
  const s = get(); if (s.consent[kind] === s.provider) return Promise.resolve(true);
  return new Promise(res => {
    let done = false; const fin = v => { if (done) return; done = true; d.close(); res(v); };
    const d = dialog('Send this photo to ' + PROVIDERS[s.provider].where + '?', [
      el('p', { text: what + ' The photo goes straight from this device to ' + PROVIDERS[s.provider].where + ' under your own account, to be read. Lineage Tracker never sees it. Their own terms decide what they keep.' }),
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Send', onclick: () => { const t = get(); t.consent[kind] = t.provider; put(t); fin(true); } }), el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => fin(false) })])
    ], { onClose: () => { if (!done) { done = true; res(false); } } });
  });
}

/* ---------- photos ---------- */
export function photoForAI(file, max = 1600) {
  return new Promise((res, rej) => {
    if (!file || !/^image\//.test(file.type || 'image/')) { rej(new Error('Choose a photo (JPEG, PNG or similar).')); return; }
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight)), w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h);
      const du = c.toDataURL('image/jpeg', 0.86); URL.revokeObjectURL(url); res({ data: du.split(',')[1], mime: 'image/jpeg', url: du, w, h }); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('That photo could not be opened.')); };
    img.src = url;
  });
}

/* ---------- calling the provider ---------- */
export async function askAI({ images = [], text, maxTokens = 2000 }) {
  const s = get();
  if (!s.provider || !s.key) throw new Error('Switch on the AI helper first (your own key).');
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('No internet connection. The AI helper needs one; everything else works offline.');
  return s.provider === 'gemini' ? gemini(s, images, text, maxTokens) : claude(s, images, text, maxTokens);
}
async function claude(s, images, text, maxTokens) {
  const content = [...images.map(i => ({ type: 'image', source: { type: 'base64', media_type: i.mime, data: i.data } })), { type: 'text', text }];
  let r; try {
    r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': s.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model: s.model || PROVIDERS.claude.model, max_tokens: maxTokens, messages: [{ role: 'user', content }] }) });
  } catch { throw new Error('No connection to Claude. Check your internet.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw friendly('Claude', r.status, j && j.error && j.error.message);
  return (j.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}
async function gemini(s, images, text, maxTokens, retried = false) {
  const model = s.model || PROVIDERS.gemini.model;
  const body = { contents: [{ role: 'user', parts: [...images.map(i => ({ inline_data: { mime_type: i.mime, data: i.data } })), { text }] }], generationConfig: { maxOutputTokens: maxTokens, temperature: 0.2 } };
  let r; try { r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent', { method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': s.key }, body: JSON.stringify(body) }); }
  catch { throw new Error('No connection to Gemini. Check your internet.'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const m = (j && j.error && j.error.message) || '', next = /use (?:models\/)?(gemini-[\w.-]+)/i.exec(m);
    if (!retried && next && /no longer available|deprecated|not found|retired|not supported/i.test(m)) { const t = get(); t.model = next[1].replace(/[.,;]+$/, ''); put(t); return gemini(t, images, text, maxTokens, true); }   // Google names the replacement for a retired model
    throw friendly('Gemini', r.status, m);
  }
  const out = ((j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []).map(p => p.text || '').join('\n');
  if (!out) throw new Error('Gemini sent an empty reply. Try again, or a clearer photo.');
  return out;
}
function friendly(who, status, m) {
  const e = new Error(status === 401 || status === 403 ? who + ' did not accept the key. Check it in the AI helper settings.' : status === 429 ? who + ' says you have reached your limit for now. Try again a little later.' : status >= 500 || status === 529 ? who + ' is busy right now. Try again in a minute.' : (m ? who + ': ' + m : who + ' returned an error (' + status + ').'));
  e.status = status; return e;
}
export function parseReplyJSON(text) {
  const s = String(text || ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('The AI reply did not contain a layout. Try again, or a clearer photo.');
  try { return JSON.parse(s.slice(a, b + 1)); } catch { throw new Error('The AI reply could not be read. Try again.'); }
}

/* a small "AI helper" chip for menus: shows on or off and opens the settings */
export function aiMenuItem(close) {
  return el('button', { type: 'button', role: 'menuitem', onclick: () => { close && close(); aiSettings(); } }, [icon('cloud'), el('span', {}, ['AI helper (your own key)', el('small', { text: aiReady() ? 'On: ' + aiProviderName() : 'Off' })])]);
}

/* ---------- a "scan a photo" dialog shared by the tools ----------
   The member picks or takes a photo, gives the real overall size, and presses the button; onGo(photo, w, h) does the work and returns
   a short message for the toast.  The other side of the size is suggested from the photo's shape (it can be changed). */
export function scanDialog({ title, intro, unit = 'mm', labels = ['Width', 'Height'], start = [60, 30], min = 1, max = 1000, step = 1, consentKind, consentText, goText = 'Lay it out', extra = null, onGo }) {
  if (!aiReady()) { const again = arguments[0]; ensureAI().then(ok => { if (ok) scanDialog(again); else toast('The AI helper needs your key first.'); }); return; }
  let photo = null, auto = true;
  const file = el('input', { type: 'file', accept: 'image/*', capture: 'environment', hidden: true });
  const pick = el('button', { type: 'button', class: 'btn', onclick: () => file.click() }, [icon('image'), 'Take or choose a photo']);
  const shot = el('img', { alt: 'The photo', class: 'ai-shot', hidden: true, style: 'max-width:100%;max-height:220px;display:block;margin:8px 0;border-radius:6px' });
  const num = v => el('input', { type: 'number', min: String(min), max: String(max), step: String(step), value: String(v), inputmode: 'decimal' });
  const w = num(start[0]), h = num(start[1]);
  const suggest = () => { if (photo && auto) h.value = String(Math.round((+w.value || start[0]) * photo.h / photo.w / step) * step || start[1]); };
  w.addEventListener('input', suggest); h.addEventListener('input', () => { auto = false; });
  const msg = el('p', { class: 'small', role: 'status' });
  const go = el('button', { type: 'button', class: 'btn primary', text: goText, disabled: true });
  file.addEventListener('change', async () => { const f = file.files && file.files[0]; if (!f) return; try { photo = await photoForAI(f); shot.src = photo.url; shot.hidden = false; go.disabled = false; suggest(); msg.textContent = ''; } catch (e) { msg.textContent = e.message; } });
  go.addEventListener('click', async () => {
    const W = +w.value, H = +h.value; if (!(W >= min && W <= max && H >= min && H <= max)) { msg.textContent = 'Give the real size, between ' + min + ' and ' + max + ' ' + unit + '.'; return; }
    if (!(await aiConsent(consentKind, consentText))) return;
    go.disabled = true; msg.textContent = 'Reading the photo with ' + aiProviderName() + '… (usually 10 to 40 seconds)';
    try { const done = await onGo(photo, W, H); d.close(); toast(done || 'Done', 6000); }
    catch (e) { msg.textContent = e.message || 'That did not work. Try again.'; go.disabled = false; }
  });
  const d = dialog(title, [el('p', { text: intro }), file, pick, shot,
    el('div', { class: 'row' }, [el('label', { class: 'fld' }, [el('span', { text: labels[0] + ' (' + unit + ')' }), w]), el('label', { class: 'fld' }, [el('span', { text: labels[1] + ' (' + unit + ')' }), h])]),
    extra, el('p', { class: 'small muted', text: 'Uses your AI helper (' + aiProviderName() + '). The photo goes straight from this device to them; Lineage Tracker never sees it. Check the result: AI can misread things.' }),
    msg, el('div', { class: 'actions' }, [go, el('button', { type: 'button', class: 'btn', text: 'Cancel', onclick: () => d.close() })])], { wide: true });
  return d;
}
