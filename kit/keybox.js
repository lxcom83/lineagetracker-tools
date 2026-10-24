/* Locks a small secret (the member's AI key) with their account password, in the browser, so only a locked copy ever leaves the device.
   PBKDF2-SHA-256 (310 000 rounds, random salt) -> AES-256-GCM (random iv).  lockSecret / openSecret never throw: openSecret gives null
   for a wrong password or damaged data.  The website has the same code (lineage-handover/keybox.js) so either side can open the other's. */
const ITER = 310000, enc = new TextEncoder(), dec = new TextDecoder();
const b64 = u8 => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const unb64 = s => Uint8Array.from(atob(String(s)), c => c.charCodeAt(0));
const norm = p => { try { return String(p).normalize('NFKC'); } catch { return String(p); } };
async function derive(password, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(norm(password)), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function lockSecret(secret, password) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt, ITER);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(String(secret))));
  return { v: 1, iter: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
}
export async function openSecret(blob, password) {
  try {
    if (!blob || blob.v !== 1 || !(blob.iter >= 100000 && blob.iter <= 2000000)) return null;
    const key = await derive(password, unb64(blob.salt), blob.iter);
    return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct)));
  } catch { return null; }
}
