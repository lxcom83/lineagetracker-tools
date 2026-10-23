/* Plant traits: the things a member can change on a plant's look (height, leaf colours and pattern, fruit colour and shape ...),
   written once so the editor, the crossing helper and the tests all use the same list.  Pure data and functions, no DOM.
   A "variety" is {id, name, base, spec, mother, father, gen, notes, made}: spec is a complete plant recipe (plants.js), frozen at the
   time it is saved, so improving the default plants later never changes a member's own line. */
import { PRESETS, specToJSON, specFromJSON } from './plants.js';

const get = (o, path) => path.split('.').reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), o);
function set(o, path, v) { const ks = path.split('.'); let a = o; for (let i = 0; i < ks.length - 1; i++) { if (a[ks[i]] === undefined || a[ks[i]] === null || typeof a[ks[i]] !== 'object') a[ks[i]] = {}; a = a[ks[i]]; } a[ks[ks.length - 1]] = v; }

export const SIMPLE_LEAVES = ['ovate', 'oval', 'round', 'heart', 'lanceolate', 'spoon', 'strap', 'lobed'];
export const LEAF_PATTERNS = [['', 'Plain'], ['edge', 'Coloured edge'], ['centre', 'Coloured middle'], ['ring', 'Ring (horseshoe)'], ['speckle', 'Speckles'], ['veins', 'Coloured veins']];
const hasFruit = s => !!(s.fruit && s.fruit.count > 0);
const hasShape = s => hasFruit(s) && !!s.fruit.shape && s.fruit.kind !== 'bunch';
const simpleLeaf = s => SIMPLE_LEAVES.includes(s.leaf && s.leaf.shape);

/* type: num | int | color | pick | optcolor (a colour that can be switched off).  path: where it lives in the recipe.  when(spec): does it apply. */
export const TRAITS = [
  // size and habit
  { id: 'height', group: 'Size', label: 'Height (m)', type: 'num', path: 'height', min: 0.05, max: 40, step: 0.05, when: s => s.height !== undefined },
  { id: 'length', group: 'Size', label: 'Vine length (m)', type: 'num', path: 'length', min: 0.2, max: 30, step: 0.1, when: s => s.length !== undefined },
  { id: 'spread', group: 'Size', label: 'Spread (m)', type: 'num', path: 'spread', min: 0.1, max: 40, step: 0.05, when: s => s.spread !== undefined },
  { id: 'trunk', group: 'Size', label: 'Trunk thickness (m)', type: 'num', path: 'trunk', min: 0.005, max: 1, step: 0.005, when: s => s.kind === 'tree' && s.trunk !== undefined },
  { id: 'stem', group: 'Size', label: 'Stem thickness (m)', type: 'num', path: 'stem', min: 0.004, max: 0.12, step: 0.002, when: s => s.stem !== undefined && s.kind !== 'tree' },
  { id: 'bark', group: 'Size', label: 'Trunk colour', type: 'color', path: 'bark', def: '#6b4a2b', when: s => s.kind === 'tree' },
  { id: 'angle', group: 'Size', label: 'Branch angle (degrees)', type: 'int', path: 'angle', min: 15, max: 85, step: 1, when: s => s.kind === 'tree' && s.angle !== undefined },
  { id: 'droop', group: 'Size', label: 'Branch droop', type: 'num', path: 'droop', min: 0, max: 1, step: 0.05, when: s => s.kind === 'tree' && s.droop !== undefined },
  // leaves
  { id: 'leafShape', group: 'Leaves', label: 'Leaf shape', type: 'pick', path: 'leaf.shape', options: SIMPLE_LEAVES.map(k => [k, k[0].toUpperCase() + k.slice(1)]), when: simpleLeaf },
  { id: 'leafSize', group: 'Leaves', label: 'Leaf size', type: 'num', path: 'leaf.size', min: 0.02, max: 1.5, step: 0.01, when: () => true },
  { id: 'leafWide', group: 'Leaves', label: 'Leaf width', type: 'num', path: 'leaf.wide', min: 0.1, max: 1.1, step: 0.05, when: s => simpleLeaf(s) && s.leaf.wide !== undefined },
  { id: 'lobes', group: 'Leaves', label: 'Lobes', type: 'int', path: 'leaf.lobes', min: 3, max: 9, step: 1, when: s => s.leaf && s.leaf.shape === 'palmate' },
  { id: 'sinus', group: 'Leaves', label: 'How deep the lobes cut in', type: 'num', path: 'leaf.sinus', min: 0, max: 0.8, step: 0.05, when: s => s.leaf && s.leaf.shape === 'palmate' },
  { id: 'leafColor', group: 'Leaves', label: 'Leaf colour', type: 'color', path: 'leaf.color', def: '#4d8a35', when: () => true },
  { id: 'leafColor2', group: 'Leaves', label: 'Second leaf colour (leaves vary between the two)', type: 'color', path: 'leaf.color2', def: '#6aa845', when: () => true },
  { id: 'midrib', group: 'Leaves', label: 'Midrib colour (the middle vein)', type: 'optcolor', path: 'leaf.midrib', def: '#e8e4c8', when: () => true },
  { id: 'patKind', group: 'Leaves', label: 'Leaf pattern', type: 'pick', path: 'leaf.pattern.kind', options: LEAF_PATTERNS, when: () => true },
  { id: 'patColor', group: 'Leaves', label: 'Pattern colour', type: 'color', path: 'leaf.pattern.color', def: '#f0ecc8', when: s => !!get(s, 'leaf.pattern.kind') },
  { id: 'patAmount', group: 'Leaves', label: 'How strong the pattern is', type: 'num', path: 'leaf.pattern.amount', min: 0.1, max: 1, step: 0.05, def: 0.85, when: s => !!get(s, 'leaf.pattern.kind') },
  // fruit
  { id: 'fruitCount', group: 'Fruit', label: 'How many fruit', type: 'int', path: 'fruit.count', min: 1, max: 200, step: 1, when: hasFruit },
  { id: 'fruitSize', group: 'Fruit', label: 'Fruit size', type: 'num', path: 'fruit.size', min: 0.005, max: 1.5, step: 0.005, when: hasFruit },
  { id: 'fruitWidth', group: 'Fruit', label: 'Fatness', type: 'num', path: 'fruit.shape.width', min: 0.2, max: 2, step: 0.05, when: hasShape },
  { id: 'fruitHeight', group: 'Fruit', label: 'Tallness', type: 'num', path: 'fruit.shape.height', min: 0.1, max: 3, step: 0.05, when: hasShape },
  { id: 'fullness', group: 'Fruit', label: 'Fullness (belly low or high)', type: 'num', path: 'fruit.shape.fullness', min: 0.2, max: 1, step: 0.05, when: s => hasShape(s) && s.fruit.shape.fullness !== undefined },
  { id: 'taperTop', group: 'Fruit', label: 'Narrow at the stem end', type: 'num', path: 'fruit.shape.taperTop', min: 0, max: 0.9, step: 0.05, when: s => hasShape(s) && s.fruit.shape.taperTop !== undefined },
  { id: 'taperBottom', group: 'Fruit', label: 'Narrow at the far end', type: 'num', path: 'fruit.shape.taperBottom', min: 0, max: 0.9, step: 0.05, when: s => hasShape(s) && s.fruit.shape.taperBottom !== undefined },
  { id: 'ribs', group: 'Fruit', label: 'Ribs', type: 'int', path: 'fruit.shape.ribs', min: 0, max: 24, step: 1, when: s => hasShape(s) && s.fruit.shape.ribs !== undefined },
  { id: 'ribDepth', group: 'Fruit', label: 'How deep the ribs are', type: 'num', path: 'fruit.shape.ribDepth', min: 0, max: 0.3, step: 0.01, when: s => hasShape(s) && s.fruit.shape.ribs > 0 },
  { id: 'dimple', group: 'Fruit', label: 'Dip at the stem', type: 'num', path: 'fruit.shape.dimple', min: 0, max: 3, step: 0.1, when: s => hasShape(s) && s.fruit.shape.dimple !== undefined },
  { id: 'warts', group: 'Fruit', label: 'Bumps and warts', type: 'num', path: 'fruit.shape.warts', min: 0, max: 0.3, step: 0.01, def: 0, when: hasShape },
  { id: 'colorUnripe', group: 'Fruit', label: 'Colour when unripe', type: 'color', path: 'fruit.colorUnripe', def: '#6a9a3a', when: hasFruit },
  { id: 'colorRipe', group: 'Fruit', label: 'Colour when ripe', type: 'color', path: 'fruit.colorRipe', def: '#d6281d', when: hasFruit },
  { id: 'colorSecondary', group: 'Fruit', label: 'Second colour (blush, stripes, ribs)', type: 'color', path: 'fruit.colorSecondary', def: '#e8602a', when: hasFruit },
  { id: 'colorCured', group: 'Fruit', label: 'Colour after curing (squash)', type: 'optcolor', path: 'fruit.colorCured', def: '#b58a52', when: s => hasFruit(s) && s.fruit.colorCured !== undefined }
];
export const GROUPS = ['Size', 'Leaves', 'Fruit'];
export const applicable = spec => TRAITS.filter(t => { try { return t.when(spec); } catch { return false; } });

/* quick fruit shapes: set several shape numbers together (only the ones the plant's fruit already has) */
export const FRUIT_STYLES = [
  ['Round', { width: 1, height: 1, fullness: 0.8, taperTop: 0, taperBottom: 0 }],
  ['Flat', { width: 1.25, height: 0.62, fullness: 0.6, taperTop: 0, taperBottom: 0 }],
  ['Tall', { width: 0.85, height: 1.4, fullness: 0.75, taperTop: 0.1, taperBottom: 0.05 }],
  ['Pear', { width: 0.85, height: 1.3, fullness: 0.45, taperTop: 0.55, taperBottom: 0 }],
  ['Long', { width: 0.4, height: 2.6, fullness: 0.85, taperTop: 0.2, taperBottom: 0.1 }],
  ['Pointed', { width: 0.8, height: 1.5, fullness: 0.7, taperTop: 0.1, taperBottom: 0.6 }]
];
export function applyFruitStyle(spec, name) {
  const st = FRUIT_STYLES.find(x => x[0] === name); if (!st || !spec.fruit || !spec.fruit.shape) return spec;
  for (const [k, v] of Object.entries(st[1])) if (spec.fruit.shape[k] !== undefined || k === 'width' || k === 'height') spec.fruit.shape[k] = v;
  return spec;
}

export const getTrait = (spec, t) => get(spec, t.path);
/* set one trait; an empty value switches an optional one off.  Returns the same spec object. */
export function setTrait(spec, t, v) {
  if (t.type === 'optcolor' && !v) { const ks = t.path.split('.'), last = ks.pop(), o = ks.length ? get(spec, ks.join('.')) : spec; if (o) delete o[last]; return spec; }
  if (t.id === 'patKind') { if (!v) { if (spec.leaf) delete spec.leaf.pattern; return spec; } if (!get(spec, 'leaf.pattern')) set(spec, 'leaf.pattern', { kind: v, color: '#f0ecc8', amount: 0.85 }); }
  if (t.type === 'num' || t.type === 'int') { v = +v; if (!Number.isFinite(v)) return spec; v = Math.max(t.min, Math.min(t.max, v)); if (t.type === 'int') v = Math.round(v); }
  set(spec, t.path, v); return spec;
}
export const clone = o => JSON.parse(JSON.stringify(o));
/* a recipe checked and clamped by the plant generator; throws a plain sentence if it cannot be built */
export const cleanSpec = spec => specFromJSON(specToJSON(spec));

export const newId = () => Math.random().toString(36).slice(2, 10);
/* a new variety from a default plant (key in PRESETS) or from another variety's recipe */
export function newVariety({ name, base, spec, mother = '', father = '', gen = '', notes = '' }) {
  const sp = clone(spec || PRESETS[base]);
  return { id: newId(), name: String(name || 'My plant').slice(0, 60), base: String(base || '').slice(0, 40), spec: cleanSpec(sp), mother: String(mother).slice(0, 60), father: String(father).slice(0, 60), gen: String(gen).slice(0, 20), notes: String(notes).slice(0, 600), made: new Date().toISOString().slice(0, 10) };
}
/* a variety from a file or storage: checked; null if it is not usable */
export function cleanVariety(v) {
  try {
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !/^[a-z0-9]{4,12}$/.test(v.id)) return null;
    const t = x => String(x == null ? '' : x).replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    return { id: v.id, name: t(v.name).slice(0, 60) || 'My plant', base: t(v.base).slice(0, 40), spec: cleanSpec(v.spec), mother: t(v.mother).slice(0, 60), father: t(v.father).slice(0, 60), gen: t(v.gen).slice(0, 20), notes: t(v.notes).slice(0, 600), made: /^\d{4}-\d{2}-\d{2}$/.test(v.made) ? v.made : '' };
  } catch { return null; }
}

/* ---------- crossing: a picture of a likely offspring, NOT a genetics prediction ----------
   F1: every trait roughly midway (colours blended).  F2: each trait is shuffled between the parents, with a little room beyond them,
   like the spread you see in a second generation.  The two plants must be built the same way (same kind).  The result is an ordinary
   recipe to adjust by hand. */
const mixHex = (a, b, w) => { const p = x => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16)), A = p(a), B = p(b); return '#' + A.map((c, i) => Math.round(Math.max(0, Math.min(255, c + (B[i] - c) * w))).toString(16).padStart(2, '0')).join(''); };
export function crossSpecs(a, b, { mode = 'f1', rand = Math.random } = {}) {
  if (a.kind !== b.kind) throw new Error('These two are built differently (' + a.kind + ' and ' + b.kind + '), so they cannot be crossed here. Cross two of the same kind.');
  const out = clone(a);
  if (!hasFruit(out) && hasFruit(b)) out.fruit = clone(b.fruit);
  const f2 = mode === 'f2';
  for (const t of TRAITS) {
    let ta = false, tb = false; try { ta = t.when(a); tb = t.when(b); } catch { /* skip */ }
    const A = ta ? get(a, t.path) : undefined, B = tb ? get(b, t.path) : undefined;
    if (A === undefined && B === undefined) continue;
    if (B === undefined) continue;                                        // only the first parent has it: keep it
    if (A === undefined) { if (!f2 || rand() < 0.5) set(out, t.path, B); continue; }   // only the second has it: it comes through (always at F1, half the time at F2)
    const w = f2 ? -0.15 + rand() * 1.3 : 0.5 + (rand() - 0.5) * 0.08;
    if (t.type === 'num' || t.type === 'int') { let v = A + (B - A) * w; v = Math.max(t.min, Math.min(t.max, v)); set(out, t.path, t.type === 'int' ? Math.round(v) : +v.toFixed(4)); }
    else if (t.type === 'color' || t.type === 'optcolor') { const ww = f2 ? (rand() < 0.3 ? (rand() < 0.5 ? 0 : 1) : rand()) : 0.5; set(out, t.path, mixHex(A, B, ww)); }
    else set(out, t.path, rand() < 0.5 ? A : B);
  }
  if (get(out, 'leaf.pattern.kind')) { const p = out.leaf.pattern; if (!p.color) p.color = '#f0ecc8'; if (p.amount === undefined) p.amount = 0.85; }
  out.seed = 1 + Math.floor(rand() * 900000);
  return cleanSpec(out);
}
