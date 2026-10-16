/* LT-Print: draws one label as HTML in millimetres (the canvas, previews and printed sheets all use this), then fits
   the text. All text goes through esc(); colours, fonts and pictures were checked by cleanTemplate(). */
import { esc } from '../kit/core.js';
import { QR } from '../kit/qr.js';
import { svg as barcodeSvg } from '../kit/barcode.js';
import { FONTS, flat, fill } from './model.js';

const PT = 0.3528;   // mm per point
export let LOGO = '';  // the tree logo as a data URL (set once at start, so printed pages need nothing from the network)
export function setLogo(d) { LOGO = d; }

function qrSvg(text, color) {
  try { return QR.svg(text, { dark: color, light: '#ffffff' }); } catch { return ''; }
}
/* t: template, row: values for the fields ({} for a bare design), opts.editor: show hidden items as missing, mark ids */
export function labelHTML(t, row, { editor = false, sel = null } = {}) {
  const parts = [];
  const items = flat(t.items).reverse();   // drawn back to front
  for (const { it, hidden, off } of items) {
    if (off) { if (editor) parts.push(`<div class="it off" data-id="${esc(it.id)}" style="${box(it)}"></div>`); continue; }
    if (hidden && editor) continue;
    let inner = '', cls = 't-' + it.type;
    if (it.type === 'text') {
      const f = fill(it.text, row);
      if (it.hideEmpty && !f.any && !editor) continue;
      const txt = it.upper ? f.text.toUpperCase() : f.text;
      const font = FONTS[it.font]?.css || FONTS.body.css;
      const ai = { top: 'flex-start', middle: 'center', bottom: 'flex-end' }[it.valign];
      inner = `<div class="tx" data-fit="${it.fit}" data-size="${it.size}" style="justify-content:${ai};text-align:${it.align};font-family:${font};font-size:${it.size}pt;font-weight:${it.bold ? 700 : 400};font-style:${it.italic ? 'italic' : 'normal'};color:${it.color};line-height:${it.lineH};letter-spacing:${it.spacing}pt"><span>${esc(txt) || (editor && !f.any ? '<i class="empty">empty</i>' : '')}</span></div>`;
      if (!f.any && editor) cls += ' is-empty';
    } else if (it.type === 'qr') {
      const f = fill(it.text, row);
      if (!f.text.trim()) { if (it.hideEmpty && !editor) continue; inner = editor ? '<div class="qr-ph">QR</div>' : ''; }
      else inner = qrSvg(f.text, it.color);
    } else if (it.type === 'barcode') {
      const f = fill(it.text, row), val = f.text.trim();
      let bars = '';
      if (val) { try { bars = barcodeSvg(val, it.color); } catch { bars = ''; } }
      if (!bars) {
        if (!editor) continue;   // nothing printable (empty, or letters a barcode cannot hold)
        inner = `<div class="qr-ph">${val ? 'Barcode cannot hold these letters' : 'Barcode'}</div>`;
      } else inner = `<div class="bc">${bars}</div>${it.showText ? `<div class="bct" style="font-size:${it.textSize}pt;color:${it.color}">${esc(val)}</div>` : ''}`;
    } else if (it.type === 'rect' || it.type === 'ellipse') {
      inner = `<div class="sh" style="background:${it.fill || 'transparent'};${it.stroke && it.sw ? `border:${it.sw}mm solid ${it.stroke};` : ''}border-radius:${it.type === 'ellipse' ? '50%' : it.radius + 'mm'}"></div>`;
    } else if (it.type === 'line') {
      inner = `<div class="ln" style="border-top:${it.sw}mm ${it.dash ? 'dashed' : 'solid'} ${it.stroke};margin-top:-${it.sw / 2}mm"></div>`;
    } else if (it.type === 'image') {
      const src = it.asset === 'logo' ? LOGO : t.assets[it.asset] || '';
      inner = src ? `<img alt="" src="${esc(src)}" style="object-fit:${it.fit};${it.gray ? 'filter:grayscale(1);' : ''}">` : '';
    }
    parts.push(`<div class="it ${cls}${editor && hidden ? ' hid' : ''}${sel && sel.has(it.id) ? ' sel' : ''}" data-id="${esc(it.id)}" style="${box(it)}">${inner}</div>`);
  }
  return `<div class="lab" style="width:${t.w}mm;height:${t.h}mm;background:${t.bg};border-radius:${t.radius}mm">${parts.join('')}</div>`;
}
const box = it => `left:${it.x}mm;top:${it.y}mm;width:${it.w}mm;height:${it.h}mm;${it.rot ? `transform:rotate(${it.rot}deg);` : ''}`;

/* The CSS every label needs (also copied into printed pages). */
export const LABEL_CSS = `
.lab{position:relative;overflow:hidden;color:#000;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.lab .it{position:absolute;transform-origin:50% 50%;box-sizing:border-box}
.lab .tx{display:flex;flex-direction:column;width:100%;height:100%;overflow:hidden;box-sizing:border-box}
.lab .tx>span{display:block;overflow-wrap:anywhere}
.lab .tx[data-fit="shrink"]>span,.lab .tx[data-fit="clip"]>span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lab .tx[data-fit="wrap"]>span{white-space:pre-wrap}
.lab .t-qr svg{display:block;width:100%;height:100%}
.lab .t-barcode{display:flex;flex-direction:column;background:#fff}.lab .bc{flex:1;min-height:0}.lab .bc svg{display:block;width:100%;height:100%}.lab .bct{text-align:center;font-family:Arial,Helvetica,sans-serif;line-height:1.15;white-space:nowrap;overflow:hidden;letter-spacing:.5pt}
.lab .sh{width:100%;height:100%;box-sizing:border-box}
.lab .t-line{display:flex;align-items:center}.lab .ln{width:100%;height:0}
.lab img{display:block;width:100%;height:100%}`;

/* Fit every text box inside root. Shrink keeps one line and makes the text smaller until it fits; wrap allows several
   lines and only shrinks if they still do not fit; clip cuts the line with "…". Smallest size: half, and never below 4pt. */
export function fitText(root) {
  for (const tx of root.querySelectorAll('.tx[data-fit]')) {
    const mode = tx.dataset.fit, base = +tx.dataset.size || 9, span = tx.firstElementChild;
    if (!span || mode === 'clip') continue;
    tx.style.fontSize = base + 'pt';
    const over = () => span.scrollWidth > tx.clientWidth + 0.5 || tx.scrollHeight > tx.clientHeight + 0.5;
    if (!over()) continue;
    let lo = Math.max(4, base * 0.5), hi = base;
    tx.style.fontSize = lo + 'pt';
    if (over()) continue;   // even the smallest size does not fit; keep it small and let it cut off
    for (let i = 0; i < 8; i++) { const mid = (lo + hi) / 2; tx.style.fontSize = mid + 'pt'; if (over()) hi = mid; else lo = mid; }
    tx.style.fontSize = lo + 'pt';
  }
}
export const mmPerPt = PT;
