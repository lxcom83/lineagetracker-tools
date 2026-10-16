/* Saving and opening designs: this device, Google Drive or Dropbox. Nothing goes to a Lineage Tracker server.
   Drive and Dropbox use the same Google client ID and Dropbox app key as the app, so they see the same files:
   - Google Drive uses the narrow "drive.file" permission: only files made by Lineage Tracker (app or tools) are visible.
   - Dropbox only sees its own app folder (Apps/<app name>).
   The tools' address must be added once in each developer console (see GO_LIVE.md). */
import { CFG, store, uid } from './core.js';

const DRIVE = 'https://www.googleapis.com/drive/v3/files', DRIVE_UP = 'https://www.googleapis.com/upload/drive/v3/files';
const DBX_API = 'https://api.dropboxapi.com/2/', DBX_CONTENT = 'https://content.dropboxapi.com/2/', DBX_TOKEN = 'https://api.dropboxapi.com/oauth2/token';
const err = (msg, extra) => Object.assign(new Error(msg), extra || {});

/* ---------- this device ---------- */
export function downloadText(name, text, mime = 'application/json') {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: mime })); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
export function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = accept; i.style.display = 'none';
    i.addEventListener('change', () => { res(i.files[0] || null); i.remove(); }, { once: true });
    // a cancelled picker fires no event in some browsers; the promise then simply never resolves, which is harmless
    document.body.append(i); i.click();
  });
}

/* ---------- Google Drive ---------- */
let gis = null, gTok = null, gExp = 0;
try { const t = JSON.parse(sessionStorage.getItem('lt_tools_gtok') || 'null'); if (t && t.exp > Date.now() + 60000) { gTok = t.tok; gExp = t.exp; } } catch { /* ignore */ }
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (gis) return gis;
  gis = new Promise((res, rej) => {
    const s = document.createElement('script'); s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => (window.google?.accounts?.oauth2 ? res() : rej(err('Google sign-in did not load')));
    s.onerror = () => { gis = null; rej(err('Google sign-in could not load. Check your internet connection')); };
    document.head.append(s);
  });
  return gis;
}
async function gToken() {
  if (gTok && gExp > Date.now() + 60000) return gTok;
  if (!CFG.googleClientId) throw err('Google Drive is not set up for the tools yet');
  await loadGis();
  return new Promise((res, rej) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CFG.googleClientId, scope: 'https://www.googleapis.com/auth/drive.file',
      callback: r => {
        if (r.error || !r.access_token) { rej(err(r.error_description || 'Google sign-in was cancelled')); return; }
        gTok = r.access_token; gExp = Date.now() + (+r.expires_in || 3600) * 1000;
        try { sessionStorage.setItem('lt_tools_gtok', JSON.stringify({ tok: gTok, exp: gExp })); } catch { /* ignore */ }
        res(gTok);
      },
      error_callback: e => rej(err(e?.type === 'popup_closed' ? 'Google sign-in was closed before finishing' : 'Google sign-in could not open. Allow pop-ups for this site and try again')),
    });
    client.requestAccessToken({ prompt: store.get('lt_tools_gseen') ? '' : 'consent' });
    store.set('lt_tools_gseen', true);
  });
}
async function gApi(method, url, { body, headers = {}, raw = false } = {}) {
  const tok = await gToken();
  let r;
  try { r = await fetch(url, { method, body, headers: { Authorization: 'Bearer ' + tok, ...headers } }); } catch { throw err('No connection to Google Drive', { offline: true }); }
  if (r.status === 401) { gTok = null; gExp = 0; throw err('Your Google sign-in expired. Please try again'); }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw err(j?.error?.message || `Google Drive returned an error (${r.status})`); }
  if (raw) return r;
  return r.status === 204 ? null : r.json();
}
async function gList(q, fields = 'files(id,name,modifiedTime,appProperties)') {
  const out = []; let page = '';
  do {
    const j = await gApi('GET', `${DRIVE}?q=${encodeURIComponent(q)}&spaces=drive&pageSize=200&orderBy=modifiedTime desc&fields=${encodeURIComponent('nextPageToken,' + fields)}${page ? '&pageToken=' + encodeURIComponent(page) : ''}`);
    out.push(...(j.files || [])); page = j.nextPageToken || '';
  } while (page && out.length < 1000);
  return out;
}
const roleQ = (role, parent) => `${parent ? `'${parent}' in parents and ` : ''}appProperties has { key='lineageRole' and value='${role}' } and trashed = false`;
async function gFolder(role, name) {
  const f = await gList(roleQ(role), 'files(id,name)');
  if (f.length) return f[0].id;
  const j = await gApi('POST', `${DRIVE}?fields=id`, { body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', appProperties: { lineageRole: role } }), headers: { 'Content-Type': 'application/json' } });
  return j.id;
}
async function gUpload({ id, name, parents, appProperties, mime, data }) {
  const meta = id ? { name } : { name, parents, appProperties, mimeType: mime };
  const b = 'ltt' + uid();
  const body = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`, data, `\r\n--${b}--`]);
  return gApi(id ? 'PATCH' : 'POST', `${DRIVE_UP}${id ? '/' + id : ''}?uploadType=multipart&fields=id,name,modifiedTime`, { body, headers: { 'Content-Type': `multipart/related; boundary=${b}` } });
}

/* ---------- Dropbox (sign-in comes back to this page) ---------- */
const DBX = 'lt_tools_dbx';
const dbxRedirect = () => location.origin + location.pathname.replace(/index\.html$/, '');
const b64u = bytes => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = n => b64u(crypto.getRandomValues(new Uint8Array(n))).slice(0, n);
export async function dropboxSignIn(returnState = {}) {
  if (!CFG.dropboxAppKey) throw err('Dropbox is not set up for the tools yet');
  const verifier = rand(64), state = rand(16);
  const challenge = b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  store.set('lt_tools_dbx_pkce', { verifier, state, at: Date.now(), ret: returnState });
  location.href = `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(CFG.dropboxAppKey)}&response_type=code&code_challenge=${challenge}&code_challenge_method=S256&token_access_type=offline&redirect_uri=${encodeURIComponent(dbxRedirect())}&state=${state}`;
}
/* Call once on page load. Resolves null (no redirect), {ok:true, ret} or {ok:false, msg}. */
export async function dropboxHandleRedirect() {
  const q = new URLSearchParams(location.search); const code = q.get('code'), state = q.get('state');
  if (!code || !state) return null;
  history.replaceState(null, '', location.pathname + location.hash);
  const pk = store.get('lt_tools_dbx_pkce'); store.del('lt_tools_dbx_pkce');
  if (!pk || pk.state !== state || Date.now() - pk.at > 30 * 60000) return { ok: false, msg: 'Dropbox sign-in could not be confirmed. Please try again' };
  try {
    const r = await fetch(DBX_TOKEN, { method: 'POST', body: new URLSearchParams({ code, grant_type: 'authorization_code', code_verifier: pk.verifier, client_id: CFG.dropboxAppKey, redirect_uri: dbxRedirect() }) });
    const j = await r.json();
    if (!r.ok || !j.access_token) return { ok: false, msg: 'Dropbox sign-in did not finish. Please try again' };
    store.set(DBX, { access: j.access_token, exp: Date.now() + (+j.expires_in || 14400) * 1000, refresh: j.refresh_token || '' });
    return { ok: true, ret: pk.ret || {} };
  } catch { return { ok: false, msg: 'No connection to Dropbox. Please try again' }; }
}
export const dropboxConnected = () => !!(store.get(DBX)?.refresh || store.get(DBX)?.access);
export function dropboxForget() { store.del(DBX); }
async function dbxFetch(url, opts, retry = true) {
  const t = store.get(DBX); if (!t) throw err('Connect Dropbox first', { needsAuth: true });
  if (t.exp < Date.now() + 60000 && t.refresh && retry) { await dbxRefresh(); return dbxFetch(url, opts, false); }
  let r;
  try { r = await fetch(url, { ...opts, headers: { Authorization: 'Bearer ' + t.access, ...(opts.headers || {}) } }); } catch { throw err('No connection to Dropbox', { offline: true }); }
  if (r.status === 401) { if (retry && t.refresh) { await dbxRefresh(); return dbxFetch(url, opts, false); } store.del(DBX); throw err('Your Dropbox sign-in expired. Please connect again', { needsAuth: true }); }
  return r;
}
async function dbxRefresh() {
  const t = store.get(DBX) || {};
  let r, j;
  try { r = await fetch(DBX_TOKEN, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: CFG.dropboxAppKey }) }); j = await r.json().catch(() => ({})); }
  catch { throw err('No connection to Dropbox', { offline: true }); }
  if (!r.ok || !j.access_token) { store.del(DBX); throw err('Your Dropbox sign-in expired. Please connect again', { needsAuth: true }); }
  store.set(DBX, { ...t, access: j.access_token, exp: Date.now() + (+j.expires_in || 14400) * 1000 });
}
async function dbxRpc(ep, body) {
  const r = await dbxFetch(DBX_API + ep, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (r.status === 409) { const j = await r.json().catch(() => ({})); throw err(j.error_summary || 'Dropbox error', { dbx409: j.error_summary || '' }); }
  if (!r.ok) throw err(`Dropbox returned an error (${r.status})`);
  return r.json();
}
async function dbxDownload(path) {
  const r = await dbxFetch(DBX_CONTENT + 'files/download', { method: 'POST', headers: { 'Dropbox-API-Arg': JSON.stringify({ path }) } });
  if (r.status === 409) return null;
  if (!r.ok) throw err(`Dropbox returned an error (${r.status})`);
  return r.text();
}
async function dbxUpload(path, text) {
  const r = await dbxFetch(DBX_CONTENT + 'files/upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', mute: true }).replace(/[\u007f-￿]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')) }, body: text });
  if (!r.ok) throw err(`Dropbox returned an error (${r.status})`);
  return r.json();
}

/* ---------- one interface for the three places ----------
   folder: {driveRole, driveName, dbxPath}  ext: file ending, e.g. '.ltprint' */
const safeName = s => String(s || 'Untitled').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-').trim().slice(0, 80) || 'Untitled';
export function storageFor({ driveRole, driveName, dbxPath, ext }) {
  return {
    drive: {
      name: 'Google Drive', ready: () => !!CFG.googleClientId,
      async list() { const f = await gFolder(driveRole, driveName); return (await gList(`'${f}' in parents and trashed = false`)).filter(x => x.name.endsWith(ext)).map(x => ({ id: x.id, name: x.name.slice(0, -ext.length), modified: Date.parse(x.modifiedTime) || 0 })); },
      async load(id) { return (await gApi('GET', `${DRIVE}/${id}?alt=media`, { raw: true })).text(); },
      async save(name, text, id) {
        const f = await gFolder(driveRole, driveName);
        if (!id) { const same = (await gList(`'${f}' in parents and name = '${(safeName(name) + ext).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}' and trashed = false`, 'files(id)'))[0]; if (same) id = same.id; }
        const r = await gUpload({ id, name: safeName(name) + ext, parents: [f], appProperties: { lineageRole: driveRole + '-file' }, mime: 'application/json', data: text });
        return { id: r.id };
      },
    },
    dropbox: {
      name: 'Dropbox', ready: () => !!CFG.dropboxAppKey, connected: dropboxConnected,
      async list() {
        let j;
        try { j = await dbxRpc('files/list_folder', { path: dbxPath, limit: 500 }); } catch (e) { if (e.dbx409 && /not_found/.test(e.dbx409)) return []; throw e; }
        return (j.entries || []).filter(x => x['.tag'] === 'file' && x.name.endsWith(ext)).map(x => ({ id: x.path_lower, name: x.name.slice(0, -ext.length), modified: Date.parse(x.server_modified) || 0 })).sort((a, b) => b.modified - a.modified);
      },
      load: id => dbxDownload(id),
      async save(name, text) { const r = await dbxUpload(`${dbxPath}/${safeName(name)}${ext}`, text); return { id: r.path_lower }; },
    },
  };
}

/* ---------- the app's synced records (read only) ---------- */
export async function readSyncedRecords(provider) {
  if (provider === 'drive') {
    const roots = await gList(roleQ('root'), 'files(id)');
    if (!roots.length) return null;
    const rec = await gList(roleQ('records', roots[0].id), 'files(id,modifiedTime)');
    if (!rec.length) return null;
    return JSON.parse(await (await gApi('GET', `${DRIVE}/${rec[0].id}?alt=media`, { raw: true })).text());
  }
  const t = await dbxDownload('/lineage-records.json');
  return t ? JSON.parse(t) : null;
}
/* The app's optional passphrase protection: PBKDF2 (310,000 rounds, SHA-256) then AES-GCM, IV first. */
const b64d = s => { const b = atob(s); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
export async function openProtected(wrapper, pass) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64d(wrapper.salt), iterations: 310000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
  const u = b64d(wrapper.data);
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: u.slice(0, 12) }, key, u.slice(12))));
}

/* ---------- the app's backup zip (lineage.json inside) ---------- */
async function inflateRaw(u8) {
  if (typeof DecompressionStream === 'undefined') throw err('This browser cannot open compressed backups. Try a recent Chrome, Edge, Safari or Firefox');
  return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
}
export async function readZipEntry(blob, wanted) {
  const tailLen = Math.min(blob.size, 65557);
  const tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
  let eocd = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw err('This zip file looks damaged or incomplete');
  const count = tail.getUint16(eocd + 10, true), cdSize = tail.getUint32(eocd + 12, true), cdOff = tail.getUint32(eocd + 16, true);
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer());
  const dec = new TextDecoder();
  let p = 0;
  for (let i = 0; i < count; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw err('This zip file looks damaged');
    const method = cd.getUint16(p + 10, true), csize = cd.getUint32(p + 20, true), nlen = cd.getUint16(p + 28, true), xlen = cd.getUint16(p + 30, true), clen = cd.getUint16(p + 32, true), off = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nlen));
    if (name === wanted) {
      const lh = new DataView(await blob.slice(off, off + 30).arrayBuffer());
      const start = off + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
      const data = new Uint8Array(await blob.slice(start, start + csize).arrayBuffer());
      if (method === 0) return dec.decode(data);
      if (method === 8) return dec.decode(await inflateRaw(data));
      throw err('This backup uses a compression this browser cannot read');
    }
    p += 46 + nlen + xlen + clen;
  }
  return null;
}
