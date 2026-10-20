/* Planting-guide packs for places where the sowing season is set by the rains or the monsoon, not by frost (India, the Philippines).

   Each zone lists its sowing seasons as month lists, for example Kharif (the monsoon crop) or Dry.  Each crop says which seasons
   suit it.  The months shown for a crop are the months of the seasons it suits in the member's zone.  A zone can also override
   the seasons for one crop (potatoes are a spring crop in the Himalayan hills, a winter crop on the plains).

   These are general guides, typical values set by the planner author from state agriculture department and Philippine Department of
   Agriculture calendars and Corona climate types, for the owner and local growers to review.  Local weather varies by weeks and the planner says "check your local guide".

   India: Kharif is the monsoon crop (sown June to July), Rabi the winter crop (sown October to December), Zaid the short summer crop (sown February to March, with irrigation).
   Philippines: climate type decides when the wet and dry seasons fall (Corona types I to IV). */

const R = (a, b) => { const out = []; for (let m = a; ; m = (m % 12) + 1) { out.push(m); if (m === b) break; } return out; };
const ALL = R(1, 12);

/* zones: [[code, label, {seasons: {name: [months]}, over: {crop: [season names]}, group}], ...]
   seasonOf(crop) -> the season names that suit the crop.  A season missing from a zone is simply not available there. */
export function seasonPack(name, zones, seasonOf) {
  const by = Object.fromEntries(zones.map(([c, , o]) => [c, o]));
  const cache = {};
  return {
    name, zones: zones.map(([c, l, o]) => [c, l, o.group || '']), seasonal: true,
    months: (crop, zone) => {
      const z = by[zone]; if (!z) return [];
      const k = crop + '|' + zone; if (cache[k]) return cache[k];
      const names = (z.over && z.over[crop]) || seasonOf(crop), set = new Set();
      for (const n of names) for (const m of (z.seasons[n] || [])) set.add(m);
      return (cache[k] = [...set].sort((a, b) => a - b));
    },
  };
}

/* ---------- India ---------- */
const IN_CROPS = {
  tomato: ['kharif', 'rabi'], capsicum: ['kharif', 'rabi'], chilli: ['kharif', 'rabi'], eggplant: ['kharif', 'rabi', 'zaid'], potato: ['rabi'],
  pumpkin: ['kharif', 'zaid'], squash: ['kharif', 'zaid'], cucumber: ['kharif', 'zaid'], melon: ['zaid'], bean: ['kharif', 'zaid'],
  pea: ['rabi'], broadbean: ['rabi'], corn: ['kharif', 'zaid'], lettuce: ['rabi'], spinach: ['rabi'], silverbeet: ['rabi'], beetroot: ['rabi'],
  carrot: ['rabi'], radish: ['kharif', 'rabi'], onion: ['kharif', 'rabi'], leek: ['rabi'], garlic: ['rabi'], cabbage: ['rabi'], broccoli: ['rabi'],
  cauliflower: ['rabi'], kale: ['rabi'], basil: ['kharif', 'zaid'], parsley: ['rabi'], herb: ['kharif', 'rabi', 'zaid'], sweetpotato: ['kharif'],
  strawberry: ['rabi'], berry: ['rabi'], fruittree: ['kharif'], other: ['kharif', 'rabi', 'zaid'],
};
export const IN_ZONES = [
  ['in-north', 'North plains: Punjab, Haryana, Delhi, Uttar Pradesh, north Rajasthan', { group: 'By region', seasons: { kharif: R(6, 7), rabi: R(10, 11), zaid: R(2, 3) } }],
  ['in-east', 'East and north-east: Bihar, Bengal, Odisha, Assam', { group: 'By region', seasons: { kharif: R(6, 7), rabi: R(10, 12), zaid: R(2, 3) } }],
  ['in-west', 'West: Maharashtra and Gujarat', { group: 'By region', seasons: { kharif: R(6, 7), rabi: R(10, 11), zaid: R(1, 3) } }],
  ['in-central', 'Central: Madhya Pradesh and Chhattisgarh', { group: 'By region', seasons: { kharif: R(6, 7), rabi: R(10, 11), zaid: R(2, 3) } }],
  ['in-south', 'South: Karnataka, Telangana, Andhra Pradesh, Tamil Nadu, Kerala', { group: 'By region', seasons: { kharif: R(6, 8), rabi: R(10, 12), zaid: R(1, 3) } }],
  ['in-arid', 'Desert and dry west: Rajasthan, Kutch', { group: 'By region', seasons: { kharif: R(7, 8), rabi: R(10, 11), zaid: R(2, 3) } }],
  ['in-hills', 'Himalayan hills and high ground (Himachal, Uttarakhand, Kashmir, Darjeeling, Nilgiris)', { group: 'By region', seasons: { kharif: R(4, 6), rabi: R(9, 10), zaid: R(3, 4) }, over: { potato: ['zaid'], pea: ['zaid', 'rabi'] } }],
];
export const IN_PACK = seasonPack('India', IN_ZONES, crop => IN_CROPS[crop] || IN_CROPS.other);

/* ---------- Philippines ---------- */
const PH_CROPS = {
  tomato: ['dry'], capsicum: ['dry'], chilli: ['dry', 'wet'], eggplant: ['dry', 'wet'], potato: ['cool'], pumpkin: ['wet', 'dry'], squash: ['wet', 'dry'],
  cucumber: ['dry', 'wet'], melon: ['dry'], bean: ['wet', 'dry'], pea: ['cool'], broadbean: ['cool'], corn: ['wet', 'dry'], lettuce: ['dry', 'cool'],
  spinach: ['dry', 'cool'], silverbeet: ['dry', 'cool'], beetroot: ['cool'], carrot: ['cool', 'dry'], radish: ['dry', 'cool'], onion: ['dry'],
  leek: ['cool'], garlic: ['dry'], cabbage: ['dry', 'cool'], broccoli: ['dry', 'cool'], cauliflower: ['dry', 'cool'], kale: ['dry', 'cool'],
  basil: ['dry', 'wet'], parsley: ['dry', 'cool'], herb: ['dry', 'wet'], sweetpotato: ['wet'], strawberry: ['cool'], berry: ['cool'], fruittree: ['wet'],
  other: ['dry', 'wet'],
};
/* "cool" crops are only for the cool highlands; on the lowlands the season list has no "cool" months, so they show "not usually grown here". */
export const PH_ZONES = [
  ['ph-t1', 'Type I: dry season November to April (Ilocos, Pangasinan, Metro Manila, Mindoro, Palawan, Panay and Negros west)', { group: 'By climate type', seasons: { dry: R(11, 2), wet: R(5, 8) } }],
  ['ph-t2', 'Type II: no dry season, wettest November to January (Cagayan east, Bicol east, Samar, Surigao, eastern Mindanao)', { group: 'By climate type', seasons: { dry: R(2, 5), wet: R(6, 9) } }],
  ['ph-t3', 'Type III: short dry season (Central Luzon east, Bicol west, Cebu, Negros east, Bohol, Zamboanga)', { group: 'By climate type', seasons: { dry: R(11, 2), wet: R(6, 9) } }],
  ['ph-t4', 'Type IV: rain through the year (Davao, Cotabato, Bukidnon lowlands, Palawan east, Camarines)', { group: 'By climate type', seasons: { dry: R(1, 4), wet: R(5, 10) } }],
  ['ph-highland', 'Cool highlands: Benguet, Baguio, Mountain Province, Bukidnon plateau, Tagaytay', { group: 'By climate type', seasons: { dry: R(10, 3), wet: R(5, 7), cool: ALL }, over: { tomato: ['dry', 'wet'], capsicum: ['dry', 'wet'] } }],
];
export const PH_PACK = seasonPack('Philippines', PH_ZONES, crop => PH_CROPS[crop] || PH_CROPS.other);
