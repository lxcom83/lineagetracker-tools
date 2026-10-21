/* LT-Planner: a small GeoTIFF reader for ground height files (the form most free LiDAR ground models come in).  No DOM, own code.
   Reads: classic TIFF (not BigTIFF), one band, 8/16/32-bit integer or 32/64-bit float, strips or tiles, no compression, LZW or Deflate,
   with or without a predictor.  Position comes from the file's tie point and pixel size (the usual north-up layout).
   Returns the same shape as parseAscii in terrain.js, plus crs: { kind: 'utm' | 'latlon' | 'unknown', zone, south, epsg }. */

const TYPES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 16: 8 };

export async function parseGeoTiff(buf) {
  const dv = new DataView(buf), bom = dv.getUint16(0), le = bom === 0x4949;
  if (!(le || bom === 0x4d4d)) throw new Error('This is not a TIFF file.');
  const u16 = o => dv.getUint16(o, le), u32 = o => dv.getUint32(o, le);
  if (u16(2) === 43) throw new Error('This is a BigTIFF file, which is not supported yet. Save it as an ASCII grid (.asc) or an ordinary GeoTIFF.');
  if (u16(2) !== 42) throw new Error('This is not a TIFF file.');
  const tags = {}, ifd = u32(4), n = u16(ifd);
  for (let i = 0; i < n; i++) {
    const o = ifd + 2 + i * 12, tag = u16(o), type = u16(o + 2), count = u32(o + 4), size = (TYPES[type] || 1) * count, at = size <= 4 ? o + 8 : u32(o + 8), vals = [];
    for (let k = 0; k < count && k < 100000; k++) {
      const p = at + k * (TYPES[type] || 1);
      vals.push(type === 3 ? u16(p) : type === 4 ? u32(p) : type === 12 ? dv.getFloat64(p, le) : type === 11 ? dv.getFloat32(p, le) : type === 5 ? u32(p) / (u32(p + 4) || 1) : type === 2 ? dv.getUint8(p) : dv.getUint8(p));
    }
    tags[tag] = type === 2 ? String.fromCharCode(...vals).replace(/\0.*$/, '') : vals;
  }
  const g = t => (tags[t] ? tags[t][0] : undefined), W = g(256), H = g(257), bits = g(258) || 8, comp = g(259) || 1, spp = g(277) || 1, fmt = g(339) || 1, pred = g(317) || 1;
  if (!(W >= 2 && H >= 2)) throw new Error('The TIFF has no image size.');
  if (W * H > 80000000) throw new Error('This image is too big to open here. Cut it down to your property first.');
  if (spp !== 1) throw new Error('A height file has one band; this has ' + spp + '.');
  if (![1, 8, 32, 5, 7, 8].includes(comp) && comp !== 32946) throw new Error('This TIFF uses a compression that is not supported (' + comp + '). Save it as an ASCII grid (.asc).');
  const bps = bits / 8, read = (v, o) => fmt === 3 ? (bits === 32 ? v.getFloat32(o, le) : v.getFloat64(o, le)) : fmt === 2 ? (bits === 8 ? v.getInt8(o) : bits === 16 ? v.getInt16(o, le) : v.getInt32(o, le)) : (bits === 8 ? v.getUint8(o) : bits === 16 ? v.getUint16(o, le) : v.getUint32(o, le));
  if (![8, 16, 32, 64].includes(bits) || (fmt === 3 && bits !== 32 && bits !== 64)) throw new Error('Unsupported sample size.');
  const out = new Float32Array(W * H);
  const blocks = [];   // { offset, length, x, y, w, h }
  if (tags[322]) {
    const tw = g(322), th = g(323), offs = tags[324], lens = tags[325], across = Math.ceil(W / tw);
    offs.forEach((o, i) => blocks.push({ o, l: lens[i], x: (i % across) * tw, y: Math.floor(i / across) * th, w: tw, h: th }));
  } else {
    const rps = g(278) || H, offs = tags[273], lens = tags[279];
    offs.forEach((o, i) => blocks.push({ o, l: lens[i], x: 0, y: i * rps, w: W, h: Math.min(rps, H - i * rps) }));
  }
  const nodata = tags[42113] ? parseFloat(tags[42113]) : NaN;
  for (const b of blocks) {
    let bytes = new Uint8Array(buf, b.o, b.l);
    if (comp === 5) bytes = lzw(bytes, b.w * b.h * bps); else if (comp === 8 || comp === 32946) bytes = await inflate(bytes);
    if (pred === 2 && fmt !== 3) { const rowB = b.w * bps; for (let r = 0; r < b.h; r++) for (let c = 1; c < b.w; c++) { if (bps === 1) bytes[r * rowB + c] = (bytes[r * rowB + c] + bytes[r * rowB + c - 1]) & 255; else { const o = r * rowB + c * bps, v = new DataView(bytes.buffer, bytes.byteOffset), s = (bits === 16 ? v.getUint16(o, le) + v.getUint16(o - 2, le) : v.getUint32(o, le) + v.getUint32(o - 4, le)); if (bits === 16) v.setUint16(o, s & 0xffff, le); else v.setUint32(o, s >>> 0, le); } } }
    if (pred === 3) { const rowB = b.w * bps; for (let r = 0; r < b.h; r++) { const row = bytes.subarray(r * rowB, (r + 1) * rowB); for (let c = bps; c < rowB; c++) row[c] = (row[c] + row[c - bps]) & 255; const tmp = new Uint8Array(rowB), cols = b.w; for (let c = 0; c < cols; c++) for (let k = 0; k < bps; k++) tmp[c * bps + (le ? bps - 1 - k : k)] = row[k * cols + c]; row.set(tmp); } }
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let r = 0; r < b.h; r++) { const y = b.y + r; if (y >= H) break; for (let c = 0; c < b.w; c++) { const x = b.x + c; if (x >= W) break; const o = (r * b.w + c) * bps; if (o + bps <= bytes.length) out[y * W + x] = read(v, o); } }
  }
  // no-data values become NaN (the file's own marker, or the very large negative numbers some tools write)
  for (let i = 0; i < out.length; i++) { const v = out[i]; if (v === nodata || v < -1e6 || v > 1e7 || v !== v) out[i] = NaN; }
  const scale = tags[33550], tie = tags[33922];
  if (!scale || !tie || tie.length < 6) throw new Error('The TIFF has no map position (it is not a GeoTIFF).');
  const cs = scale[0], csy = scale[1];
  if (Math.abs(cs - csy) > cs * 0.01) throw new Error('The pixels are not square, which is not supported.');
  // tie point = map position of image position (i, j); raster-pixel-is-point files (key 1025 = 2) refer to cell centres
  const keys = tags[34735] || [], gk = {}; for (let i = 4; i + 3 < keys.length; i += 4) gk[keys[i]] = keys[i + 1] === 0 ? keys[i + 3] : null;   // [key, where the value is (0 = right here), count, value]
  const cornerOrCentre = gk[1025] === 2 ? 0.5 : 0, xll = tie[3] - (tie[0] + cornerOrCentre) * cs, yTop = tie[4] + (tie[1] + cornerOrCentre) * cs, yll = yTop - H * cs;
  return { ncols: W, nrows: H, cs, xll, yll, data: out, kind: 'grid', crs: crsFrom(gk) };
}
function crsFrom(gk) {
  const proj = gk[3072], geo = gk[2048];
  if (proj) {
    if (proj >= 28348 && proj <= 28358) return { kind: 'utm', zone: proj - 28300, south: true, epsg: proj };     // GDA94 MGA
    if (proj >= 7846 && proj <= 7859) return { kind: 'utm', zone: proj - 7800, south: true, epsg: proj };         // GDA2020 MGA
    if (proj >= 32701 && proj <= 32760) return { kind: 'utm', zone: proj - 32700, south: true, epsg: proj };      // WGS 84 UTM south
    if (proj >= 32601 && proj <= 32660) return { kind: 'utm', zone: proj - 32600, south: false, epsg: proj };     // WGS 84 UTM north
    return { kind: 'unknown', epsg: proj };
  }
  if (geo === 4326 || geo === 4283 || geo === 7844) return { kind: 'latlon', epsg: geo };
  return { kind: 'unknown', epsg: geo || null };
}
async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open compressed TIFF files. Use an ASCII grid (.asc) instead.');
  const ds = new DecompressionStream('deflate'), w = ds.writable.getWriter(); w.write(bytes); w.close();
  return new Uint8Array(await new Response(ds.readable).arrayBuffer());
}
/* TIFF LZW (most-significant bit first, "early change" code width) */
function lzw(input, expect) {
  const out = new Uint8Array(expect + 16); let o = 0, bitBuf = 0, bitCnt = 0, ip = 0, width = 9, next = 258; const dict = [];
  const reset = () => { dict.length = 0; for (let i = 0; i < 256; i++) dict[i] = [i]; dict[256] = null; dict[257] = null; width = 9; next = 258; };
  const get = () => { while (bitCnt < width) { if (ip >= input.length) return 257; bitBuf = (bitBuf << 8) | input[ip++]; bitCnt += 8; } const c = (bitBuf >> (bitCnt - width)) & ((1 << width) - 1); bitCnt -= width; bitBuf &= (1 << bitCnt) - 1; return c; };
  reset(); let prev = null;
  for (;;) {
    const c = get(); if (c === 257) break; if (c === 256) { reset(); prev = null; continue; }
    let entry; if (c < next && dict[c]) entry = dict[c]; else if (prev) entry = prev.concat(prev[0]); else break;
    for (const b of entry) { if (o < out.length) out[o++] = b; }
    if (prev) { dict[next++] = prev.concat(entry[0]); if (next + 1 === 512) width = 10; else if (next + 1 === 1024) width = 11; else if (next + 1 === 2048) width = 12; }
    prev = entry; if (o >= expect) break;
  }
  return out.subarray(0, expect);
}
