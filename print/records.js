/* LT-Print: the Records step. Load records (the app's backup file, the app's synced copy on Drive or Dropbox, a
   spreadsheet, or an example), then tick which ones to print and how many of each.
   Records stay on this device: they are kept in this browser so they are still here next time, and "Forget" removes them. */
import { el, icon, toast, dialog, confirmBox, CFG, uid } from '../kit/core.js';
import { pickFile, readZipEntry, readSyncedRecords, openProtected, dropboxConnected, dropboxSignIn, downloadText } from '../kit/files.js';
import { rowsFromApp, parseTable, KINDS, usedFields, fieldsFor, MAX_OWN } from './model.js';

export function recordsView(ctx) {
  const { S } = ctx;
  const view = el('div', { class: 'pr-view' });
  const page = el('div', { class: 'pr-page' }), inner = el('div', { class: 'inner' });
  page.append(inner); view.append(page);
  let q = '', status = '';

  async function fromFile() {
    const f = await pickFile('.zip,.json,application/zip,application/json');
    if (!f) return;
    try {
      let text;
      if (/\.zip$/i.test(f.name) || f.type.includes('zip')) { text = await readZipEntry(f, 'lineage.json'); if (!text) throw new Error('This zip is not a Lineage Tracker backup (there is no lineage.json inside)'); }
      else text = await f.text();
      let data = JSON.parse(text);
      if (data && data.format === 'sync-encrypted') data = await askPass(data);
      if (!data) return;
      if (!Array.isArray(data.records)) throw new Error('This file has no Lineage Tracker records in it');
      useApp(data, f.name);
    } catch (e) { toast(e.message && e.message.length < 140 ? e.message : 'That file could not be read'); }
  }
  async function fromSync(provider) {
    try {
      if (provider === 'dropbox' && !dropboxConnected()) { await dropboxSignIn({ step: 'records', sync: 'dropbox' }); return; }
      toast('Fetching your synced records…');
      let data = await readSyncedRecords(provider);
      if (!data) { toast('No synced Lineage Tracker records were found there. Is sync switched on in the app?'); return; }
      if (data.format === 'sync-encrypted') data = await askPass(data);
      if (!data) return;
      useApp(data, provider === 'drive' ? 'your synced copy on Google Drive' : 'your synced copy on Dropbox');
    } catch (e) { toast(e.message || 'That did not work. Please try again'); }
  }
  ctx.fromSync = fromSync;
  function askPass(wrapper) {
    return new Promise(res => {
      let done = false;
      const inp = el('input', { type: 'password', autocomplete: 'off', maxlength: '200' }), msg = el('p', { class: 'err', role: 'alert' });
      const d = dialog('Protected records', [
        el('p', { text: 'These records are protected with your sync passphrase. Type it to open them here. It is only used on this device and is not kept.' }),
        el('form', { onsubmit: async e => {
          e.preventDefault(); msg.textContent = 'Opening…';
          try { const data = await openProtected(wrapper, inp.value); done = true; d.close(); res(data); }
          catch { msg.textContent = 'That passphrase did not open them. Check it and try again.'; }
        } }, [el('label', { class: 'fld' }, [el('span', { text: 'Sync passphrase' }), inp]), msg, el('div', { class: 'actions' }, [el('button', { type: 'submit', class: 'btn primary', text: 'Open' })])]),
      ], { onClose: () => { if (!done) res(null); } });
    });
  }
  function useApp(data, label) {
    const rows = rowsFromApp(data, S.appUrl);
    const n = Object.values(rows).reduce((a, l) => a + l.length, 0);
    if (!n) { toast('No plants, animals, lots, places or varieties found in it'); return; }
    S.data = { source: 'app', label, raw: null, rows, columns: [] };
    S.t.own.on = false;
    S.appData = data;   // kept in memory so QR links can be rebuilt when the address changes
    S.chosen = {}; S.copies = {};
    if (S.t.kind === 'table') { S.t.kind = rows.individual.length ? 'individual' : 'stock'; ctx.commit(); }
    else if (!rows[S.t.kind].length) { const best = Object.keys(rows).find(k => rows[k].length); if (best) { S.t.kind = best; ctx.commit(); toast(`This design now uses ${KINDS[best].name.toLowerCase()}`); } }
    ctx.saveData(); ctx.refreshAll(); toast(`${n} records loaded from ${label}`);
  }
  async function fromCSV() {
    const f = await pickFile('.csv,.tsv,.txt,text/csv,text/plain');
    if (!f) return;
    useTable(await f.text(), f.name);
  }
  function fromPaste() {
    const ta = el('textarea', { rows: '10', placeholder: 'Variety\tYear\tSource\nBlack Cherry\t2026\tSaved', style: 'font-family:monospace;font-size:.9rem' });
    const d = dialog('Paste from a spreadsheet', [
      el('p', { text: 'Copy the cells in your spreadsheet (including the heading row) and paste them here. Each row becomes one label; each heading becomes a field.' }),
      ta, el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Use these rows', onclick: () => { if (useTable(ta.value, 'pasted rows')) d.close(); } })]),
    ], { wide: true });
  }
  function useTable(text, label) {
    const { columns, rows } = parseTable(text);
    if (!columns.length || !rows.length) { toast('No rows found. The first row should be the headings'); return false; }
    S.data = { source: 'table', label, rows: { table: rows }, columns };
    S.t.own.on = false;
    S.appData = null; S.chosen = {}; S.copies = {};
    S.t.kind = 'table'; S.t.columns = columns; ctx.commit();
    ctx.saveData(); ctx.refreshAll(); toast(`${rows.length} rows loaded, with ${columns.length} columns`);
    return true;
  }
  async function fromExample(name) {
    try { const r = await fetch(new URL(`../examples/${name}.json`, import.meta.url)); useApp(await r.json(), `the ${name === 'olive' ? 'olive egger' : name} example`); }
    catch { toast('The example could not be loaded'); }
  }
  async function forget() { S.data = null; S.appData = null; S.chosen = {}; S.copies = {}; ctx.saveData(); ctx.refreshAll(); toast('Records forgotten on this device'); }

  function render() {
    inner.textContent = '';
    inner.append(el('h1', { text: 'Choose records' }), el('p', { class: 'muted', text: 'Each record you tick becomes a label, with its fields filled in. Records stay on this device; nothing is uploaded.' }));
    const card = (title, txt, btns) => el('div', { class: 'card' }, [el('h3', { text: title }), el('p', { class: 'small muted', text: txt }), ...btns]);
    const b = (ic, label, fn) => el('button', { type: 'button', class: 'btn sm', onclick: fn }, [icon(ic), label]);
    inner.append(el('div', { class: 'src-grid' }, [
      card('From the Lineage Tracker app', 'In the app: Settings, Backup, then open the backup file here. Or read your synced copy.', [b('upload', 'Open a backup file', fromFile), CFG.googleClientId ? b('cloud', 'My synced copy on Google Drive', () => fromSync('drive')) : null, CFG.dropboxAppKey ? b('cloud', 'My synced copy on Dropbox', () => fromSync('dropbox')) : null]),
      card('From a spreadsheet', 'Any list works: a seed library catalogue, a club\'s stock list. The first row must be the headings.', [b('table', 'Open a CSV file', fromCSV), b('copy', 'Paste from a spreadsheet', fromPaste)]),
      card('Type your own', 'No app or spreadsheet needed. Type the records straight in; they are saved with this design, ready for next time.', [b('table', S.t.own.on ? 'Typing records (shown below)' : 'Type records into this design', startOwn)]),
      card('Try it with an example', 'The same examples as the app.', [b('tag', 'Plants (pumpkin breeding)', () => fromExample('plants')), b('tag', 'Animals (chickens)', () => fromExample('animals')), b('tag', 'Olive egger chickens', () => fromExample('olive'))]),
    ]));
    if (S.t.own.on) { renderOwn(); return; }
    if (!S.data) {
      inner.append(el('div', { class: 'notice' }, ['No records loaded yet. You can still print the design as it is from step 3, for labels that are the same every time.']));
      return;
    }
    const total = Object.values(S.data.rows).reduce((a, l) => a + l.length, 0);
    inner.append(el('div', { class: 'loaded notice' }, [el('span', {}, [el('b', { text: `${total} records` }), ` from ${S.data.label}.`]), el('button', { type: 'button', class: 'btn sm', text: 'Forget them', onclick: forget })]));
    if (S.data.source === 'app') {
      const au = el('input', { type: 'text', value: S.appUrl, inputmode: 'url', maxlength: '200' });
      au.addEventListener('change', () => { const v = au.value.trim(); if (v && !/^https?:\/\//i.test(v)) { toast('The address should start with https://'); au.value = S.appUrl; return; } S.appUrl = v; ctx.savePrefs(); if (S.appData) { S.data.rows = rowsFromApp(S.appData, S.appUrl); ctx.saveData(); toast('QR codes updated'); } else toast('Saved. Open the records again to use the new address in their QR codes'); });
      inner.append(el('label', { class: 'fld', style: 'max-width:520px' }, [el('span', { text: 'QR codes open the record at' }), au, el('small', { text: 'Change this if you use a club\'s own version of the app.' })]));
    }
    // which kind of record
    const kinds = Object.entries(S.data.rows).filter(([, l]) => l.length);
    if (S.data.source === 'app') {
      const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Records' });
      for (const [k] of kinds) seg.append(el('button', { type: 'button', 'aria-pressed': S.t.kind === k ? 'true' : 'false', onclick: async () => { if (S.t.kind === k) return; S.t.kind = k; S.preview = ''; ctx.commit(); ctx.refreshAll(); toast(`This design is now for ${KINDS[k].name.toLowerCase()}. Its fields have changed in the palette`); } }, [KINDS[k].name, el('span', { class: 'num', text: String(S.data.rows[k].length), style: 'width:auto;padding:0 6px;border-radius:10px' })]));
      inner.append(el('p', { class: 'small muted', style: 'margin:6px 0' , text: 'This design is for:' }), seg);
    }
    const kind = S.t.kind, rows = S.data.rows[kind] || [];
    if (!rows.length) { inner.append(el('p', { class: 'notice warn', text: `There are no ${KINDS[kind].name.toLowerCase()} in these records. Pick another kind above.` })); return; }
    const chosen = S.chosen[kind] || (S.chosen[kind] = []);
    const set = new Set(chosen);
    // tools
    const search = el('input', { type: 'search', placeholder: 'Search', value: q, 'aria-label': 'Search the records' });
    search.addEventListener('input', () => { q = search.value; drawTable(); });
    const statuses = [...new Set(rows.map(r => r._status).filter(Boolean))];
    const st = statuses.length > 1 ? el('select', { 'aria-label': 'Status' }, [el('option', { value: '', text: 'Any status' }), ...statuses.map(s => el('option', { value: s, text: s, selected: s === status }))]) : null;
    if (st) st.addEventListener('change', () => { status = st.value; drawTable(); });
    const count = el('span', { class: 'small', 'aria-live': 'polite' });
    const tools = el('div', { class: 'rec-tools' }, [search, st,
      el('button', { type: 'button', class: 'btn sm', text: 'Tick all shown', onclick: () => { shown().forEach(r => set.add(r._id)); save(); drawTable(); } }),
      el('button', { type: 'button', class: 'btn sm', text: 'Untick all', onclick: () => { set.clear(); save(); drawTable(); } }), count]);
    const wrap = el('div', { class: 'tbl-wrap' });
    inner.append(tools, wrap, el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', onclick: () => ctx.go('print') }, ['Next: print', icon('chevR')]), el('button', { type: 'button', class: 'btn', onclick: () => ctx.go('design') }, [icon('back'), 'Back to the design'])]));
    const cols = kind === 'table' ? S.data.columns.slice(0, 5).map(c => [c, c]) : { individual: [['title', 'Tag or name'], ['strain', 'Variety or breed'], ['started', 'Started'], ['place', 'Place'], ['status', 'Status']], stock: [['title', 'Lot'], ['source', 'Source'], ['year_packed', 'Year'], ['qty', 'Quantity'], ['where', 'Stored']], place: [['title', 'Place'], ['method', 'Method'], ['details', 'Details']], strain: [['title', 'Variety or breed'], ['group', 'Group'], ['species', 'Species']] }[kind];
    const shown = () => rows.filter(r => (!status || r._status === status) && (!q || Object.entries(r).some(([k2, v]) => !k2.startsWith('_') && k2 !== 'link' && String(v).toLowerCase().includes(q.toLowerCase()))));
    function save() { S.chosen[kind] = rows.filter(r => set.has(r._id)).map(r => r._id); ctx.saveData(); updateCount(); }
    function updateCount() { const n = S.chosen[kind].length, labels = S.chosen[kind].reduce((a, id) => a + (S.copies[id] || 1), 0); count.textContent = n ? `${n} ticked, ${labels} label${labels === 1 ? '' : 's'}` : 'Nothing ticked yet'; }
    function drawTable() {
      wrap.textContent = '';
      const list = shown();
      const all = el('input', { type: 'checkbox', 'aria-label': 'Tick all shown', checked: list.length > 0 && list.every(r => set.has(r._id)) });
      all.addEventListener('change', () => { list.forEach(r => (all.checked ? set.add(r._id) : set.delete(r._id))); save(); drawTable(); });
      const tb = el('tbody');
      for (const r of list.slice(0, 1000)) {
        const cb = el('input', { type: 'checkbox', checked: set.has(r._id), 'aria-label': 'Print ' + (r.title || r._id) });
        const tr = el('tr', { class: set.has(r._id) ? 'on' : '' });
        cb.addEventListener('change', () => { cb.checked ? set.add(r._id) : set.delete(r._id); tr.className = cb.checked ? 'on' : ''; save(); });
        const cp = el('input', { type: 'number', min: '1', max: '99', value: String(S.copies[r._id] || 1), 'aria-label': 'How many labels for ' + (r.title || r._id) });
        cp.addEventListener('input', () => { const v = Math.max(1, Math.min(99, parseInt(cp.value, 10) || 1)); if (v === 1) delete S.copies[r._id]; else S.copies[r._id] = v; if (!set.has(r._id)) { set.add(r._id); cb.checked = true; tr.className = 'on'; } save(); });
        tr.append(el('td', {}, [cb]), ...cols.map(([k2]) => el('td', { text: String(r[k2] ?? ''), title: String(r[k2] ?? '') })), el('td', { class: 'num' }, [cp]));
        tb.append(tr);
      }
      wrap.append(el('table', { class: 'recs' }, [el('thead', {}, [el('tr', {}, [el('th', {}, [all]), ...cols.map(([, l]) => el('th', { scope: 'col', text: l })), el('th', { scope: 'col', text: 'How many' })])]), tb]));
      if (list.length > 1000) wrap.append(el('p', { class: 'small muted', style: 'padding:8px', text: `Showing the first 1000 of ${list.length}. Search to narrow it down.` }));
      if (!list.length) wrap.append(el('p', { class: 'small muted', style: 'padding:8px', text: 'Nothing matches.' }));
      updateCount();
    }
    drawTable();
  }
  /* ---------- records typed into the design ---------- */
  const blankRow = keys => Object.assign({ _id: 'own' + uid(), _on: true, _copies: 1 }, Object.fromEntries(keys.map(k => [k, ''])));
  function startOwn() {
    const keys = usedFields(S.t);
    S.t.own.on = true;
    if (!S.t.own.rows.length && keys.length) for (let i = 0; i < 3; i++) S.t.own.rows.push(blankRow(keys));
    ctx.commit(); render();
    setTimeout(() => view.querySelector('table.own input[type=text]')?.focus(), 0);
  }
  function renderOwn() {
    const keys = usedFields(S.t), names = Object.fromEntries(fieldsFor(S.t.kind, S.t.columns).map(f => [f.key, f.label]));
    const label = k => names[k] || k;
    inner.append(el('div', { class: 'loaded notice' }, [el('span', {}, [el('b', { text: 'Records typed into this design.' }), ' They are saved with it, so they come back when you open the design again.']),
      S.data ? el('button', { type: 'button', class: 'btn sm', text: `Use the loaded records instead (${S.data.label})`, onclick: () => { S.t.own.on = false; ctx.commit(); ctx.refreshAll(); } }) : el('button', { type: 'button', class: 'btn sm', text: 'Stop typing records', onclick: () => { S.t.own.on = false; ctx.commit(); ctx.refreshAll(); } })]));
    if (!keys.length) {
      inner.append(el('p', { class: 'notice warn', text: 'This design has no fields yet, so there is nothing to type. In the design, drag a field from the palette, or type a word in curly brackets into a text box, such as {Customer} or {Order number}. Each one becomes a column here.' }),
        el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', onclick: () => ctx.go('design') }, [icon('back'), 'Back to the design'])]));
      return;
    }
    const rows = S.t.own.rows;
    const count = el('span', { class: 'small', 'aria-live': 'polite' });
    const upd = () => { const on = rows.filter(r => r._on && keys.some(k => String(r[k] || '').trim())), n = on.reduce((a, r) => a + (r._copies || 1), 0); count.textContent = `${rows.length} row${rows.length === 1 ? '' : 's'}, ${on.length} ticked to print, ${n} label${n === 1 ? '' : 's'} (empty rows are left out)`; };
    const tools = el('div', { class: 'rec-tools' }, [
      el('button', { type: 'button', class: 'btn sm', onclick: () => addRows(1) }, [icon('plus'), 'Add a row']),
      el('button', { type: 'button', class: 'btn sm', onclick: pasteOwn }, [icon('copy'), 'Paste rows']),
      el('button', { type: 'button', class: 'btn sm', onclick: () => downloadText((S.t.name || 'records') + '.csv', toCSV(keys, rows, label), 'text/csv') }, [icon('download'), 'Download as a spreadsheet']),
      el('button', { type: 'button', class: 'btn sm danger', text: 'Clear all', onclick: async () => { if (!rows.length || !await confirmBox('Clear all rows?', 'Every typed record in this design will be removed. You can undo it.', 'Clear all', { danger: true })) return; S.t.own.rows = []; ctx.commit(); render(); } }), count]);
    const wrap = el('div', { class: 'tbl-wrap' });
    const tb = el('tbody');
    const all = el('input', { type: 'checkbox', 'aria-label': 'Tick all rows', checked: rows.length > 0 && rows.every(r => r._on) });
    all.addEventListener('change', () => { rows.forEach(r => { r._on = all.checked; }); ctx.commit(); render(); });
    rows.slice(0, 500).forEach((r, i) => {
      const tr = el('tr', { class: r._on ? 'on' : '' });
      const cb = el('input', { type: 'checkbox', checked: r._on, 'aria-label': `Print row ${i + 1}` });
      cb.addEventListener('change', () => { r._on = cb.checked; tr.className = cb.checked ? 'on' : ''; ctx.commit(); upd(); });
      tr.append(el('td', {}, [cb]));
      for (const k of keys) {
        const inp = el('input', { type: 'text', value: r[k] || '', maxlength: '500', 'aria-label': `${label(k)}, row ${i + 1}` });
        inp.addEventListener('input', () => { r[k] = inp.value; ctx.commit('own:' + r._id + ':' + k); upd(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (i === rows.length - 1) addRows(1, k); else tb.rows[i + 1]?.querySelector(`input[aria-label^="${CSS.escape(label(k))},"]`)?.focus(); } });
        tr.append(el('td', { class: 'cell-in' }, [inp]));
      }
      const cp = el('input', { type: 'number', min: '1', max: '99', value: String(r._copies || 1), 'aria-label': `How many labels for row ${i + 1}` });
      cp.addEventListener('input', () => { r._copies = Math.max(1, Math.min(99, parseInt(cp.value, 10) || 1)); ctx.commit('own:' + r._id + ':copies'); upd(); });
      const del = el('button', { type: 'button', class: 'icon-btn sm', 'aria-label': `Delete row ${i + 1}`, onclick: () => { rows.splice(rows.indexOf(r), 1); ctx.commit(); render(); } }, [icon('trash')]);
      tr.append(el('td', { class: 'num' }, [cp]), el('td', {}, [del]));
      tb.append(tr);
    });
    wrap.append(el('table', { class: 'recs own' }, [el('thead', {}, [el('tr', {}, [el('th', {}, [all]), ...keys.map(k => el('th', { scope: 'col', text: label(k) })), el('th', { scope: 'col', text: 'How many' }), el('th', { scope: 'col' }, [el('span', { class: 'sr-only', text: 'Delete' })])])]), tb]));
    if (rows.length > 500) wrap.append(el('p', { class: 'small muted', style: 'padding:8px', text: `Showing the first 500 of ${rows.length} rows. They all print.` }));
    if (!rows.length) wrap.append(el('p', { class: 'small muted', style: 'padding:8px', text: 'No rows yet. Add a row, or paste them from a spreadsheet.' }));
    inner.append(el('p', { class: 'small muted', text: 'The columns are the fields your design uses. Press Enter to go down a row (a new row is added at the bottom).' }), tools, wrap,
      el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', onclick: () => ctx.go('print') }, ['Next: print', icon('chevR')]), el('button', { type: 'button', class: 'btn', onclick: () => ctx.go('design') }, [icon('back'), 'Back to the design'])]));
    upd();
    function addRows(n, focusKey) {
      if (rows.length + n > MAX_OWN) { toast(`A design can hold up to ${MAX_OWN} typed rows. Use a spreadsheet for more`); return; }
      for (let j = 0; j < n; j++) rows.push(blankRow(keys));
      ctx.commit(); render();
      setTimeout(() => { const last = view.querySelector('table.own tbody tr:last-child'); (focusKey ? last?.querySelector(`input[aria-label^="${CSS.escape(label(focusKey))},"]`) : last?.querySelector('input[type=text]'))?.focus(); }, 0);
    }
    function pasteOwn() {
      const ta = el('textarea', { rows: '8', style: 'font-family:monospace;font-size:.9rem', placeholder: keys.map(label).join('\t') });
      const d = dialog('Paste rows', [
        el('p', { text: `Copy the cells in your spreadsheet, including a heading row, and paste them here. Columns whose heading matches a field (${keys.map(label).join(', ')}) are filled in; others are left out.` }), ta,
        el('div', { class: 'actions' }, [el('button', { type: 'button', class: 'btn primary', text: 'Add these rows', onclick: () => {
          const { columns, rows: got } = parseTable(ta.value);
          if (!got.length) { toast('No rows found. The first row should be the headings'); return; }
          const map = {}; for (const c of columns) { const k = keys.find(x => x.toLowerCase() === c.toLowerCase() || label(x).toLowerCase() === c.toLowerCase()); if (k) map[c] = k; }
          if (!Object.keys(map).length) { toast('None of the headings match the fields in this design'); return; }
          const room = MAX_OWN - rows.length, take = got.slice(0, room);
          for (const g of take) { const r = blankRow(keys); for (const [c, k] of Object.entries(map)) r[k] = g[c] || ''; rows.push(r); }
          ctx.commit(); d.close(); render(); toast(`${take.length} rows added${got.length > take.length ? ` (the limit is ${MAX_OWN})` : ''}`);
        } })]),
      ], { wide: true });
    }
  }
  const csvCell = v => { const x = String(v ?? ''); return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
  const toCSV = (keys, rows, label) => '\ufeff' + [keys.map(label), ...rows.map(r => keys.map(k => r[k] || ''))].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  return { el: view, show: render, refresh: render };
}
