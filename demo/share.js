/* LT-Planner: "Share picture". Turns the 3D view into a picture with the plan's name, the date and a small credit, and hands it to the
   device's share sheet (tablet and phone: social media, messages, email) or saves it (computer).  Same idea and the same credit as the
   phone app's share card.  The picture is made on the device; nothing is uploaded by us. */
import { el, icon, toast, dialog } from '../kit/core.js';

/* Growth phase, like the app: the credit is always on.  (Plan printouts and planting-list pages do not use this: no credit there.) */
const CREDIT_LOCKED_ON = true;
const CREDIT = 'Made with Lineage Tracker · lineagetracker.org';

const rr = (x, a, b, w, h, r) => { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); };

/* base: canvas with the picture; labels: [{x, y, text, sub, glow}] in the canvas's pixels (x = middle, y = bottom of the tag) */
export function composePicture({ base, labels = [], title = '', date = '', showTitle = true, scale = 1 }) {
  const W = base.width, H = base.height, foot = showTitle || CREDIT_LOCKED_ON ? Math.round(Math.max(44, H * 0.075)) : 0;
  const out = document.createElement('canvas'); out.width = W; out.height = H + foot; const x = out.getContext('2d');
  x.drawImage(base, 0, 0);
  const f = Math.max(11, 12 * scale), sf = f * 0.85;
  x.textBaseline = 'middle';
  for (const L of labels) {
    x.font = `600 ${f}px system-ui, sans-serif`; const tw = x.measureText(L.text).width; let w = tw, h = f * 1.55;
    let subW = 0; if (L.sub) { x.font = `500 ${sf}px system-ui, sans-serif`; subW = x.measureText(L.sub).width; w = Math.max(tw, subW); h += sf * 1.3; }
    const px = Math.round(L.x - w / 2 - 6 * scale), py = Math.round(L.y - h);
    x.shadowColor = 'rgba(0,0,0,.25)'; x.shadowBlur = 3 * scale; x.fillStyle = L.glow ? '#ffc828' : 'rgba(255,255,255,.88)'; rr(x, px, py, w + 12 * scale, h, 6 * scale); x.fill(); x.shadowBlur = 0;
    x.fillStyle = '#1f2a33'; x.textAlign = 'center'; x.font = `600 ${f}px system-ui, sans-serif`; x.fillText(L.text, px + (w + 12 * scale) / 2, py + f * 0.8);
    if (L.sub) { x.font = `500 ${sf}px system-ui, sans-serif`; x.fillStyle = '#3d4a54'; x.fillText(L.sub, px + (w + 12 * scale) / 2, py + f * 1.55 + sf * 0.55); }
  }
  if (foot) {
    x.fillStyle = '#ffffff'; x.fillRect(0, H, W, foot);
    x.fillStyle = '#e3e8da'; x.fillRect(0, H, W, Math.max(1, foot * 0.03));
    const pad = foot * 0.35, ts = foot * 0.34, cs = foot * 0.25; x.textAlign = 'left';
    if (showTitle && title) { x.fillStyle = '#1f2a33'; x.font = `700 ${ts}px system-ui, sans-serif`; x.fillText(title, pad, H + foot * 0.4, W * 0.6); if (date) { x.fillStyle = '#5b6770'; x.font = `500 ${cs}px system-ui, sans-serif`; x.fillText(date, pad, H + foot * 0.76, W * 0.6); } }
    if (CREDIT_LOCKED_ON) { x.textAlign = 'right'; x.fillStyle = '#7a4a2a'; x.font = `600 ${cs}px system-ui, sans-serif`; x.fillText(CREDIT, W - pad, H + foot * (showTitle && title ? 0.58 : 0.5), W * 0.5); }
  }
  return out;
}

const toBlob = (c, type, q) => new Promise(res => c.toBlob(res, type, q));

/* render(sharp) -> Promise<{ canvas, labels, scale }>  (the 3D view makes one frame, at a larger size and with shadows when sharp) */
export function openShare({ title, date, render }) {
  let blob = null, busy = false, url = '';
  const img = el('img', { alt: 'The picture to share', class: 'sh-img' }), msg = el('p', { class: 'small', role: 'status' });
  const showT = el('input', { type: 'checkbox', checked: true }), sharp = el('select', { 'aria-label': 'Picture quality' }, [el('option', { value: '0', text: 'Standard (quick)' }), el('option', { value: '1', text: 'Sharp render (larger, with shadows, takes a few seconds)' })]);
  const cap = el('textarea', { rows: '3', maxlength: '500', 'aria-label': 'Caption' }); cap.value = title + (CREDIT_LOCKED_ON ? '\n' + CREDIT : '');
  const file = () => new File([blob], ((title || '').replace(/[^\w -]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'plan') + '.jpg', { type: 'image/jpeg' });
  const canShare = () => { try { return !!(navigator.canShare && blob && navigator.canShare({ files: [file()] })); } catch { return false; } };
  const shareB = el('button', { type: 'button', class: 'btn primary', text: 'Share…', disabled: true }), saveB = el('button', { type: 'button', class: 'btn', text: 'Save picture', disabled: true });
  async function make() {
    if (busy) return; busy = true; shareB.disabled = saveB.disabled = true; msg.textContent = sharp.value === '1' ? 'Rendering the sharp picture…' : 'Making the picture…';
    try {
      await new Promise(r => setTimeout(r, 30));
      const s = await render(sharp.value === '1'), out = composePicture({ base: s.canvas, labels: s.labels, title, date, showTitle: showT.checked, scale: s.scale });
      blob = await toBlob(out, 'image/jpeg', 0.92); if (url) URL.revokeObjectURL(url); url = URL.createObjectURL(blob); img.src = url;
      msg.textContent = out.width + ' × ' + out.height + ' px, ' + Math.round(blob.size / 1024) + ' KB'; shareB.disabled = !canShare(); shareB.hidden = !canShare(); saveB.disabled = false;
    } catch (e) { msg.textContent = 'The picture could not be made: ' + (e && e.message ? e.message : 'try again.'); }
    busy = false;
  }
  shareB.addEventListener('click', async () => { try { await navigator.share({ files: [file()], title, text: cap.value }); } catch (e) { if (e && e.name !== 'AbortError') msg.textContent = 'Sharing did not work here. Use Save picture instead.'; } });
  saveB.addEventListener('click', () => { const a = document.createElement('a'); a.href = url; a.download = file().name; document.body.append(a); a.click(); a.remove(); });
  showT.addEventListener('change', make); sharp.addEventListener('change', make);
  const d = dialog('Share a picture of this plan', [
    el('p', { class: 'small muted', text: 'Makes a picture of what you see in 3D, with the plan\'s name and date. On a tablet or phone, Share opens your share sheet (social media, messages, email). The picture is made on this device; nothing is uploaded by us.' }),
    img, msg,
    el('label', { class: 'small pl-check' }, [showT, ' Show the plan name and date']),
    el('label', { class: 'fld' }, [el('span', { text: 'Picture quality' }), sharp]),
    el('label', { class: 'fld' }, [el('span', { text: 'Caption (copy it into your post)' }), cap]),
    el('div', { class: 'actions' }, [shareB, saveB, el('button', { type: 'button', class: 'btn', text: 'Copy caption', onclick: async () => { try { await navigator.clipboard.writeText(cap.value); toast('Caption copied'); } catch { cap.select(); toast('Select and copy the caption'); } } }), el('button', { type: 'button', class: 'btn', text: 'Close', onclick: () => d.close() })])
  ], { wide: true, onClose: () => { if (url) URL.revokeObjectURL(url); } });
  make();
  void icon;
  return d;
}
