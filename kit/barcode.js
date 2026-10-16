/* Code 128 barcodes, made on the device (no network). Handles letters, numbers and ordinary punctuation
   (ASCII 32 to 126). Long runs of digits are packed two to a symbol (code set C), so number-only codes stay short.
   Checked against an independent decoder in the tests. */
const P = ['11011001100','11001101100','11001100110','10010011000','10010001100','10001001100','10011001000','10011000100','10001100100','11001001000','11001000100','11000100100','10110011100','10011011100','10011001110','10111001100','10011101100','10011100110','11001110010','11001011100','11001001110','11011100100','11001110100','11101101110','11101001100','11100101100','11100100110','11101100100','11100110100','11100110010','11011011000','11011000110','11000110110','10100011000','10001011000','10001000110','10110001000','10001101000','10001100010','11010001000','11000101000','11000100010','10110111000','10110001110','10001101110','10111011000','10111000110','10001110110','11101110110','11010001110','11000101110','11011101000','11011100010','11011101110','11101011000','11101000110','11100010110','11101101000','11101100010','11100011010','11101111010','11001000010','11110001010','10100110000','10100001100','10010110000','10010000110','10000101100','10000100110','10110010000','10110000100','10011010000','10011000010','10000110100','10000110010','11000010010','11001010000','11110111010','11000010100','10001111010','10100111100','10010111100','10010011110','10111100100','10011110100','10011110010','11110100100','11110010100','11110010010','11011011110','11011110110','11110110110','10101111000','10100011110','10001011110','10111101000','10111100010','11110101000','11110100010','10111011110','10111101110','11101011110','11110101110','11010000100','11010010000','11010011100'];   // symbol 0..102, then 103 start A, 104 start B, 105 start C
const STOP = '1100011101011';
const START_B = 104, START_C = 105, TO_C = 99, TO_B = 100;
const digitsAt = (s, i) => { let n = 0; while (i + n < s.length && s.charCodeAt(i + n) >= 48 && s.charCodeAt(i + n) <= 57) n++; return n; };
/* text -> list of symbol values (without checksum and stop) */
export function symbols(text) {
  const s = String(text);
  if (!s.length) throw new Error('empty');
  for (const ch of s) { const c = ch.charCodeAt(0); if (c < 32 || c > 126) throw new Error('unsupported'); }
  const out = []; let set = '', i = 0;
  const lead = digitsAt(s, 0);
  if (lead === s.length && s.length >= 2 && s.length % 2 === 0 || lead >= 4 && lead % 2 === 0) { out.push(START_C); set = 'C'; }
  else { out.push(START_B); set = 'B'; }
  while (i < s.length) {
    const run = digitsAt(s, i);
    if (set === 'C') {
      if (run >= 2) { out.push(+s.slice(i, i + 2)); i += 2; continue; }
      out.push(TO_B); set = 'B'; continue;
    }
    // in set B: switch to C for a long even run of digits (or an even run that ends the text)
    if (run >= 4 && (run % 2 === 0) && (run >= 6 || i + run === s.length)) { out.push(TO_C); set = 'C'; continue; }
    if (run >= 7) { out.push(s.charCodeAt(i) - 32); i++; out.push(TO_C); set = 'C'; continue; }   // odd long run: one digit in B, the rest in C
    out.push(s.charCodeAt(i) - 32); i++;
  }
  return out;
}
/* text -> string of 1 (bar) and 0 (space) modules, including the 10-module quiet zones */
export function modules(text) {
  const sy = symbols(text);
  let sum = sy[0]; for (let k = 1; k < sy.length; k++) sum += sy[k] * k;
  return '0'.repeat(10) + sy.map(v => P[v]).join('') + P[sum % 103] + STOP + '0'.repeat(10);
}
/* An SVG of the bars only; it stretches to fill its box. Throws for text it cannot encode. */
export function svg(text, color = '#000000') {
  const m = modules(text);
  let d = '', x = 0;
  while (x < m.length) { if (m[x] === '1') { let w = 1; while (m[x + w] === '1') w++; d += `M${x} 0h${w}v1h-${w}z`; x += w; } else x++; }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.length} 1" preserveAspectRatio="none" shape-rendering="crispEdges"><path d="${d}" fill="${color}"/></svg>`;
}
