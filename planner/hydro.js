/* Hydro systems: types, plant-site maths, link rules, the warnings list and the templates. Pure logic, no drawing.
   Numbers are typical figures from extension guides (RESEARCH-indoor-growing.md addendum), shown as typical and editable.
   Everything here is a WARNING or a plain sum: the planner never certifies pumps, wiring, flow or safety. */

export const HYDRO_TYPES = {
  kratky: { name: 'Kratky jars or tub', pumped: false, air: false, note: 'Passive: no pump, no air. The water level drops as the plants drink.' },
  dwc:    { name: 'Deep water culture (raft)', pumped: false, air: true, note: 'Plants float on a raft over aerated nutrient solution.' },
  nft:    { name: 'Nutrient film (NFT channels)', pumped: true, air: false, note: 'A thin film of solution runs down sloped channels and returns to the reservoir.' },
  ebb:    { name: 'Ebb and flow (flood table)', pumped: true, air: false, note: 'A pump floods the table on a timer, then it drains back.' },
};
export const HYDRO_KEYS = Object.keys(HYDRO_TYPES);
export const DRAINS = ['recirculate', 'waste'];
export const MEDIA = ['water', 'air', 'power', 'control'];
export const LIMITS_HYDRO = { hydro: 300, conn: 1500 };
const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

/* typical figures (VT SPES-463, and the grower and extension notes in the research file) */
export const TYPICAL = {
  nftMaxRun: 3.7,            // m, 12 ft channel length
  nftSlopeFlattest: 100,     // 1 in N: flatter than 1 in 100 is too flat
  nftFlow: [0.19, 0.32],     // L/min per channel
  litresPerSite: [1, 3.8],   // reservoir, per plant (1/4 to 1 US gal)
  channelSpacing: 0.2,       // m between channels for leafy greens
};
/* standing water a reservoir item holds (litres), by equipment key; a member can edit the item's own number */
export const RESERVOIR_L = { bucket: 20, reservoir50: 50, reservoir100: 100 };

/* plant sites worked out from the box */
export function sites(h) {
  const sp = Math.max(0.05, +h.spacing || 0.2);
  if (h.type === 'nft') { const ch = Math.max(1, Math.round(+h.channels || 1)); return ch * Math.max(1, Math.floor((h.w + 1e-9) / sp)); }
  return Math.max(1, Math.floor((h.w + 1e-9) / sp)) * Math.max(1, Math.floor((h.h + 1e-9) / sp));
}
/* total NFT flow needed in L/min (channels x flow per channel): the member checks their own pump at their own head height */
export const nftFlow = h => (h.type === 'nft' ? Math.max(1, Math.round(+h.channels || 1)) * (+h.flow || 0.25) : 0);

const isHydro = i => i.kind === 'hydro';
const gearKey = i => (i.kind === 'gear' ? i.item : '');
const isRes = i => i.kind === 'gear' && own(RESERVOIR_L, i.item);
const isPump = i => i.kind === 'gear' && i.item === 'water_pump';
const isAir = i => i.kind === 'gear' && i.item === 'air_pump';
const isBoard = i => i.kind === 'gear' && i.item === 'power_board';
const isTimer = i => i.kind === 'gear' && (i.item === 'timer' || i.item === 'controller' || i.item === 'thermostat');
const wattOf = i => (i.kind === 'gear' ? Math.max(0, +i.watts || 0) : 0);

/* what each end of a link may be, for each medium; returns '' when fine or a short reason */
export function linkProblem(c, a, b) {
  if (!a || !b) return 'One end of this link is missing.';
  if (a === b || (a.id != null && a.id === b.id)) return 'A link cannot start and end on the same item.';
  const pair = (f, g) => (f(a) && g(b)) || (f(b) && g(a));
  const waterEnd = i => isHydro(i) || isRes(i) || isPump(i);
  if (c.medium === 'water') {
    if (isAir(a) || isAir(b)) return 'A water link has an air pump on one end.';
    if (!waterEnd(a) || !waterEnd(b)) return 'A water link needs water equipment at both ends (system, reservoir or pump).';
    if (isHydro(a) && isHydro(b)) return '';          // one system draining into another is allowed
  } else if (c.medium === 'air') {
    if (!pair(isAir, i => isHydro(i) || isRes(i))) return 'An air link goes from an air pump to a system or reservoir.';
    const h = isHydro(a) ? a : isHydro(b) ? b : null; if (h && !HYDRO_TYPES[h.type].air) return 'This system type does not use air.';
  } else if (c.medium === 'power') {
    if (isHydro(a) || isHydro(b) || a.kind !== 'gear' || b.kind !== 'gear') return 'A power link goes between two pieces of equipment.';
    if (!(isBoard(a) || isBoard(b) || wattOf(a) === 0 || wattOf(b) === 0)) return 'A power link usually has a power board or a plug on one end.';
  } else if (c.medium === 'control') {
    if (!pair(isTimer, i => i.kind === 'gear')) return 'A control link goes from a timer or controller to equipment.';
  }
  return '';
}

/* connection maps */
function index(items) {
  const byId = new Map(items.map(i => [i.id, i]));
  const conns = items.filter(i => i.kind === 'conn');
  const ends = c => [byId.get(c.from), byId.get(c.to)];
  return { byId, conns, ends };
}

/* everything joined to `id` by links of one medium (a pump between a system and its reservoir still joins them) */
export function reach(id, items, medium = 'water') {
  const byId = new Map(items.map(i => [i.id, i])), conns = items.filter(i => i.kind === 'conn' && i.medium === medium);
  const seen = new Set([id]), q = [id], out = [];
  while (q.length) { const cur = q.shift();
    for (const c of conns) { if (c.from !== cur && c.to !== cur) continue; const o = c.from === cur ? c.to : c.from; if (seen.has(o) || !byId.has(o)) continue; seen.add(o); out.push(byId.get(o)); q.push(o); } }
  return out;
}
/* One pass over the water links: everything joined to one another, in groups. This replaces a search per system, which on a
   big linked plan was the slowest thing in the planner (1.7 s on 300 systems; now about 17 ms). */
function waterGroups(items) {
  const byId = new Map(items.map(i => [i.id, i])), adj = new Map(), push = (a, b) => { const l = adj.get(a); if (l) l.push(b); else adj.set(a, [b]); };
  for (const c of items) if (c.kind === 'conn' && c.medium === 'water' && byId.has(c.from) && byId.has(c.to)) { push(c.from, c.to); push(c.to, c.from); }
  const where = new Map(), groups = [];
  for (const it of items) {
    if (where.has(it.id) || !adj.has(it.id)) continue;
    const g = groups.length, list = [], q = [it.id]; where.set(it.id, g);
    while (q.length) { const cur = q.shift(), node = byId.get(cur); if (node) list.push(node); for (const o of adj.get(cur) || []) if (!where.has(o) && byId.has(o)) { where.set(o, g); q.push(o); } }
    groups.push(list);
  }
  return { of: id => (where.has(id) ? groups[where.get(id)] : []) };
}
/* the warnings list. Each: { level 'warn'|'info', code, text, ids }. Never blocks anything. */
export function checks(items) {
  const out = [], { byId, conns, ends } = index(items);
  const add = (level, code, text, ids) => out.push({ level, code, text, ids: ids || [] });
  const links = (id, medium) => conns.filter(c => (c.from === id || c.to === id) && (!medium || c.medium === medium)).map(c => byId.get(c.from === id ? c.to : c.from)).filter(Boolean);
  const name = i => i.name || (isHydro(i) ? HYDRO_TYPES[i.type].name : i.item || i.kind);
  const hydros = items.filter(i => isHydro(i) && !i.off), W = waterGroups(items), wet = new Map(hydros.map(h => [h.id, W.of(h.id).filter(x => x !== h)]));   // a system switched off is left out of the panel, so it raises no warnings either
  const litresOf = r => Math.max(0, +r.litres || RESERVOIR_L[r.item] || 0);
  // a reservoir shared by several systems is shared, not counted twice: its litres are spread over every plant site it feeds
  const perSiteFrom = new Map();
  for (const r of items.filter(isRes)) {
    const fed = W.of(r.id).filter(isHydro), total = fed.reduce((n, h) => n + sites(h), 0);
    if (!total || !litresOf(r)) continue;
    for (const h of fed) perSiteFrom.set(h.id, (perSiteFrom.get(h.id) || 0) + litresOf(r) / total);
  }
  for (const c of conns) {
    const [a, b] = ends(c), p = linkProblem(c, a, b);
    if (p) add('warn', 'link', p, [c.id, c.from, c.to].filter(Boolean));
  }
  for (const h of hydros) {
    const T = HYDRO_TYPES[h.type]; if (!T) continue;
    const joined = wet.get(h.id) || [], res = joined.filter(isRes), pumps = joined.filter(isPump);
    if (T.pumped) {
      if (h.drain !== 'waste' && !res.length) add('warn', 'noReservoir', name(h) + ': this ' + T.name.toLowerCase() + ' recirculates, but no reservoir is linked to it (straight to it, or through its pump).', [h.id]);
      if (!pumps.length) add('warn', 'noPump', name(h) + ': a ' + T.name.toLowerCase() + ' needs a pump, and none is linked to it or to its reservoir.', [h.id]);
      if (h.drain === 'waste' && res.length > 1) add('info', 'drainReturn', name(h) + ': set to run to waste, but more than one reservoir is linked. Check which way the water goes.', [h.id]);
    }
    if (T.air && !links(h.id, 'air').some(isAir)) add('info', 'noAir', name(h) + ': no air pump linked. Deep water culture normally needs aeration.', [h.id]);
    if (h.type === 'nft') {
      const run = h.w;   // channels run along the length, whichever way the bench is turned
      if (run > TYPICAL.nftMaxRun + 1e-9) add('warn', 'nftLong', name(h) + ': a channel run of ' + (Math.round(run * 100) / 100) + ' m is long. Guides suggest keeping NFT channels to about ' + TYPICAL.nftMaxRun + ' m (12 ft) so the far end is not starved.', [h.id]);
      if (+h.slope > TYPICAL.nftSlopeFlattest) add('warn', 'nftSlope', name(h) + ': a slope of 1 in ' + h.slope + ' is flatter than the 1 in 100 guides give as the least that drains.', [h.id]);
      const f = +h.flow || 0.25;
      if (f < TYPICAL.nftFlow[0] || f > TYPICAL.nftFlow[1]) add('warn', 'nftFlow', name(h) + ': ' + f + ' L/min per channel is outside the typical ' + TYPICAL.nftFlow[0] + ' to ' + TYPICAL.nftFlow[1] + '.', [h.id]);
      add('info', 'nftTotal', name(h) + ': the pump has to deliver about ' + (Math.round(nftFlow(h) * 100) / 100) + ' L/min across ' + Math.round(h.channels || 1) + ' channels. Check your pump\'s own flow at your lift height.', [h.id]);
    }
    const n = sites(h), perSite = T.pumped ? (perSiteFrom.get(h.id) || 0) : (n ? (+h.volume || 0) / n : 0);
    const shared = T.pumped && res.some(r => W.of(r.id).filter(isHydro).length > 1);
    if (n && perSite && perSite < TYPICAL.litresPerSite[0]) add('warn', 'smallRes', name(h) + ': ' + (Math.round(perSite * 10) / 10) + ' L of solution per plant site' + (shared ? ' (the reservoir is shared with another system)' : '') + ' is under the ' + TYPICAL.litresPerSite[0] + ' L guides suggest (typically ' + TYPICAL.litresPerSite[0] + ' to ' + TYPICAL.litresPerSite[1] + ' L per plant). Small volumes swing in EC and pH quickly.', [h.id, ...res.map(r => r.id)]);
  }
  for (const r of items.filter(isRes)) if (!links(r.id, 'water').length) add('info', 'idleRes', name(r) + ' is not linked to any system or pump.', [r.id]);
  for (const g of items.filter(i => i.kind === 'gear' && (isPump(i) || isAir(i)))) if (!links(g.id, 'power').length) add('info', 'noPower', name(g) + ' has no power link. It is only a drawing note until you add one.', [g.id]);
  for (const bd of items.filter(isBoard)) {
    const on = links(bd.id, 'power').filter(g => g.id !== bd.id), w = on.reduce((s, g) => s + wattOf(g), 0), more = on.filter(g => isBoard(g) || isTimer(g));
    if (on.length) add('info', 'boardLoad', name(bd) + ': the equipment linked straight to it adds up to ' + w + ' W as typed' + (more.length ? ', and ' + more.map(name).join(' and ') + ' may carry more behind ' + (more.length === 1 ? 'it' : 'them') : '') + '. This is a plain sum, not a check of any circuit or board rating.', [bd.id]);
  }
  return out;
}

/* everything fed by this item through water links (follows pump to reservoir to system, and system to system) */
export function dependsOn(id, items) {
  const { byId, conns } = index(items), seen = new Set([id]), out = [], q = [id];
  while (q.length) {
    const cur = q.shift();
    for (const c of conns) {
      if (c.medium !== 'water' || (c.from !== cur && c.to !== cur)) continue;
      const other = c.from === cur ? c.to : c.from; if (seen.has(other)) continue; seen.add(other);
      const it = byId.get(other); if (!it) continue;
      if (isHydro(it)) out.push(other);
      q.push(other);
    }
  }
  return out;
}

/* ---------- templates: what "Add a hydro system" makes ----------
   Returns { items:[spec...], conns:[{a,b,medium}] } with a/b as indexes into items. Positions are offsets (m) from the click.
   The app gives each item an id, cleans it, and draws the links. */
export const TEMPLATES = {
  kratky: { name: 'Kratky jar tray', note: 'A tray of jars, no pump.' },
  dwc: { name: 'DWC tub (raft)', note: 'A tub with a raft, an air pump and a power link.' },
  nft: { name: 'NFT bench', note: 'Channels 20 cm apart, a reservoir and a pump.' },
  ebb: { name: 'Ebb and flow table', note: 'A flood table, a reservoir, a pump and a timer.' },
};
export function template(key, rawOpts = {}) {
  const opts = Object.assign(Object.create(null), rawOpts && typeof rawOpts === 'object' ? rawOpts : {});   // a copy: the caller's own object is not written into
  const items = [], conns = [], link = (a, b, medium) => conns.push({ a, b, medium });
  const num = (v, d, lo, hi) => { v = +v; return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d; };
  if (key === 'kratky') {
    const cols = Math.round(num(opts.cols, 6, 1, 12)), rows = Math.round(num(opts.rows, 2, 1, 6)), sp = 0.15;
    opts.sites = cols * rows;
    items.push({ kind: 'hydro', type: 'kratky', dx: 0, dy: 0, w: cols * sp * 1.0, h: rows * sp, spacing: sp, volume: Math.round(cols * rows * 1.5 * 10) / 10, drain: 'recirculate', name: 'Kratky tray' });
  } else if (key === 'dwc') {
    const n = Math.round(num(opts.sites, 12, 2, 36)), cols = Math.min(6, n), rows = Math.ceil(n / cols), sp = 0.2;
    items.push({ kind: 'hydro', type: 'dwc', dx: 0, dy: 0, w: cols * sp, h: rows * sp, spacing: sp, volume: Math.round(n * 2 * 10) / 10, drain: 'recirculate', name: 'DWC tub' });
    items.push({ kind: 'gear', item: 'air_pump', dx: cols * sp / 2 + 0.3, dy: 0 });
    items.push({ kind: 'gear', item: 'power_board', dx: cols * sp / 2 + 0.3, dy: 0.35 });
    link(1, 0, 'air'); link(2, 1, 'power');
  } else if (key === 'nft') {
    const ch = Math.round(num(opts.channels, 6, 1, 24)), sp = 0.2, run = num(opts.run, 2.4, 0.6, TYPICAL.nftMaxRun);
    items.push({ kind: 'hydro', type: 'nft', dx: 0, dy: 0, w: run, h: ch * TYPICAL.channelSpacing, spacing: sp, channels: ch, channelSpacing: TYPICAL.channelSpacing, slope: 60, flow: 0.25, drain: 'recirculate', name: 'NFT bench' });
    const nSites = ch * Math.max(1, Math.floor((run + 1e-9) / sp));
    items.push({ kind: 'gear', item: nSites > 33 ? 'reservoir100' : 'reservoir50', litres: Math.min(5000, Math.max(50, Math.ceil(nSites * 1.5))), dx: run / 2 + 0.5, dy: 0 });   // about 1.5 L a plant, inside the 1 to 3.8 L guide
    items.push({ kind: 'gear', item: 'water_pump', dx: run / 2 + 0.5, dy: 0.5 });
    items.push({ kind: 'gear', item: 'power_board', dx: run / 2 + 0.5, dy: 0.9 });
    link(0, 1, 'water'); link(1, 2, 'water'); link(3, 2, 'power');
  } else if (key === 'ebb') {
    items.push({ kind: 'hydro', type: 'ebb', dx: 0, dy: 0, w: 0.8, h: 0.6, spacing: 0.2, drain: 'recirculate', name: 'Flood table' });
    items.push({ kind: 'gear', item: 'reservoir50', dx: 0.9, dy: 0 });
    items.push({ kind: 'gear', item: 'water_pump', dx: 0.9, dy: 0.5 });
    items.push({ kind: 'gear', item: 'timer', dx: 0.9, dy: 0.9 });
    items.push({ kind: 'gear', item: 'power_board', dx: 1.3, dy: 0.9 });
    link(0, 1, 'water'); link(1, 2, 'water'); link(3, 2, 'control'); link(4, 3, 'power'); link(4, 2, 'power');
  } else return { items: [], conns: [] };
  return { items, conns };
}

/* what a new link between two items most likely carries */
export function guessMedium(a, b) {
  if (!a || !b) return 'water';
  const has = f => f(a) || f(b);
  if (has(isAir)) return 'air';
  if (has(isBoard)) return 'power';
  if (has(isTimer) || has(i => i.kind === 'gear' && i.item === 'thermostat')) return 'control';
  return 'water';
}

/* What one reservoir feeds: the systems, their plant sites, and the litres each site has. Everything here is the member's own numbers. */
export function reservoirInfo(r, items) {
  const litres = Math.max(0, +r.litres || RESERVOIR_L[r.item] || 0);
  const fed = waterGroups(items).of(r.id).filter(isHydro);
  const total = fed.reduce((n, h) => n + sites(h), 0);
  const crops = [...new Set(fed.map(h => h.crop).filter(Boolean))];
  return { litres, systems: fed, sites: total, perSite: total ? Math.round(litres / total * 100) / 100 : 0, crops, shared: fed.length > 1 };
}
/* A plain list of what the indoor part of this plan is made of: counts only, never a price and never a brand. */
export function partsList(items, equip = {}) {
  const live = items.filter(i => !i.off), hyd = live.filter(isHydro), gear = live.filter(i => i.kind === 'gear');
  const byType = {}; for (const h of hyd) byType[HYDRO_TYPES[h.type].name] = (byType[HYDRO_TYPES[h.type].name] || 0) + 1;
  const byItem = {}; for (const g of gear) { const nm = (equip[g.item] && equip[g.item].name) || g.item; byItem[nm] = (byItem[nm] || 0) + 1; }
  return {
    systems: hyd.length, sites: hyd.reduce((n, h) => n + sites(h), 0),
    channels: hyd.filter(h => h.type === 'nft').reduce((n, h) => n + Math.round(h.channels || 0), 0),
    litres: Math.round(gear.filter(isRes).reduce((n, g) => n + (+g.litres || RESERVOIR_L[g.item] || 0), 0)),
    pumps: gear.filter(isPump).length, airPumps: gear.filter(isAir).length, boards: gear.filter(isBoard).length,
    links: live.filter(i => i.kind === 'conn').length,
    rooms: live.filter(i => i.kind === 'room').length, shelves: live.filter(i => i.kind === 'shelf').length, trays: live.filter(i => i.kind === 'tray').length,
    watts: gear.reduce((n, g) => n + wattOf(g), 0),
    byType: Object.entries(byType).sort(), byItem: Object.entries(byItem).sort(),
  };
}
