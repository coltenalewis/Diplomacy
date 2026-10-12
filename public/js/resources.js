// Terrain, rivers, natural resources and land improvements.
// Every land tile gets a terrain type from satellite imagery and a set of resource deposits placed where they occur on the real Earth.

// ------------------------------------------------------------------ terrain
// food/wood/stone: base potential; hab: how many people the land supports; def: defensive bonus; move: movement cost
export const TERRAIN = {
  floodplain: { name: 'River Valley', food: 1.35, wood: 0.2, stone: 0.1, hab: 1.35, def: 0, move: 1, arable: 1.35, color: '#7fbf6a' },
  grassland: { name: 'Grassland', food: 1.05, wood: 0.3, stone: 0.2, hab: 1.0, def: 0, move: 1, arable: 1.05, color: '#a9c96a' },
  plains: { name: 'Plains', food: 0.9, wood: 0.25, stone: 0.3, hab: 0.9, def: 0, move: 1, arable: 0.9, color: '#c9c27a' },
  forest: { name: 'Forest', food: 0.65, wood: 1.5, stone: 0.3, hab: 0.75, def: 0.25, move: 1.35, arable: 0.75, color: '#4f8a4a' },
  jungle: { name: 'Jungle', food: 0.55, wood: 1.25, stone: 0.15, hab: 0.55, def: 0.3, move: 1.7, arable: 0.5, color: '#2f7a46' },
  hills: { name: 'Hills', food: 0.6, wood: 0.5, stone: 1.1, hab: 0.7, def: 0.4, move: 1.4, arable: 0.6, color: '#b49a6a' },
  mountains: { name: 'Mountains', food: 0.25, wood: 0.35, stone: 1.5, hab: 0.32, def: 0.8, move: 2.1, arable: 0.2, color: '#9a8f86' },
  steppe: { name: 'Steppe', food: 0.6, wood: 0.12, stone: 0.3, hab: 0.6, def: 0, move: 0.9, arable: 0.5, color: '#d2c17f' },
  desert: { name: 'Desert', food: 0.12, wood: 0.03, stone: 0.5, hab: 0.2, def: 0.05, move: 1.3, arable: 0.08, color: '#e3c98e' },
  taiga: { name: 'Taiga', food: 0.32, wood: 1.25, stone: 0.3, hab: 0.38, def: 0.25, move: 1.4, arable: 0.3, color: '#3f6d55' },
  tundra: { name: 'Tundra', food: 0.18, wood: 0.1, stone: 0.3, hab: 0.18, def: 0.05, move: 1.3, arable: 0.05, color: '#9fb0a8' },
  ice: { name: 'Ice Sheet', food: 0, wood: 0, stone: 0.1, hab: 0.03, def: 0.2, move: 2.5, arable: 0, color: '#e8f0f4' },
};

// Major rivers as [lat, lon] polylines. River valleys are the cradles of civilization.
export const RIVERS = [
  [[31.4, 30.4], [30, 31.2], [27, 31], [24.1, 32.9], [21.8, 31.3], [19.5, 33], [15.6, 32.5], [12, 32.7], [9.5, 31.6], [4.8, 31.6], [2, 32]], // Nile
  [[37.5, 42.5], [36.3, 43.1], [34.6, 43.7], [33.3, 44.4], [31.9, 46], [31, 47.4], [30, 48.5]], // Tigris
  [[38.5, 39], [36.8, 38.1], [35.3, 40.1], [34.4, 41.0], [33.4, 43.3], [32.5, 44.4], [31.0, 46.2]], // Euphrates
  [[35.5, 75], [34, 73], [33, 71.5], [30.5, 70.8], [28, 69], [25.5, 68.3], [24, 67.5]], // Indus
  [[30, 78.2], [27, 80], [25.4, 82], [25.6, 85.1], [24.8, 88], [23, 89.8], [22, 90.5]], // Ganges
  [[29.3, 90], [27.5, 94.5], [26.2, 91.7], [25, 89.8]], // Brahmaputra
  [[35.5, 101], [36, 103.8], [38.5, 106.3], [40.5, 108], [38.5, 110.5], [35, 110.5], [34.8, 113.5], [35.5, 116], [37.7, 118.9]], // Yellow River
  [[33, 97], [29.5, 104], [29.6, 106.5], [30.8, 111.3], [30.5, 114.3], [29.7, 116], [31, 119], [31.4, 121.6]], // Yangtze
  [[23.5, 108.5], [23.1, 113.3]], // Pearl
  [[30, 97.5], [24, 100], [20.3, 100.3], [17.9, 102.6], [15.1, 105.8], [11.6, 104.9], [10, 106.5]], // Mekong
  [[26, 97.5], [22, 96], [19.7, 95.2], [17, 95.3]], // Irrawaddy
  [[48, 8.5], [48.4, 10.5], [48.2, 16.4], [47.5, 19], [45.2, 19.8], [44.8, 20.5], [43.8, 25], [44.1, 28], [45.2, 29.6]], // Danube
  [[46.6, 9.5], [47.6, 7.6], [49, 8.4], [50.4, 7.6], [51.8, 6.2], [51.9, 4.3]], // Rhine
  [[45, 7.7], [45.1, 9.7], [45, 12.3]], // Po
  [[50.5, 14.5], [51.9, 12], [53.5, 10]], // Elbe
  [[49.9, 19], [52.2, 21], [54.3, 18.9]], // Vistula
  [[57, 35], [57.6, 39.9], [56.3, 44], [55.8, 49], [53.2, 50.1], [51.5, 46], [48.7, 44.5], [46.3, 48]], // Volga
  [[55, 32], [51.5, 30.5], [50.4, 30.5], [48.4, 35], [46.6, 32.6]], // Dnieper
  [[53.5, 38], [51.6, 39.2], [49.5, 40.9], [47.2, 39.7]], // Don
  [[41, 69.3], [44.8, 65.5], [46, 61.5]], [[37.2, 67], [39, 64], [41.5, 60.6], [43.7, 59]], // Syr & Amu Darya
  [[52, 85], [56.5, 84], [61, 76], [61, 69], [66.5, 66.5]], // Ob
  [[51.7, 94.4], [56, 92.9], [60, 90], [66, 87], [69.4, 86.2]], // Yenisei
  [[54, 106], [58, 109], [61, 124], [62, 129.7], [66, 124], [72, 127]], // Lena
  [[53.3, 121.5], [50, 127.5], [48.4, 135], [52.5, 140.5]], // Amur
  [[47.2, -95], [44.9, -93.2], [41.5, -90.6], [38.6, -90.2], [35.1, -90], [32.3, -90.9], [30, -91.2], [29.2, -89.3]], // Mississippi
  [[47.5, -111], [46.8, -100.8], [41.2, -96], [39.1, -94.6], [38.8, -90.1]], // Missouri
  [[40.4, -80], [39.1, -84.5], [38.2, -85.8], [37, -89.1]], // Ohio
  [[44.2, -76.5], [45.5, -73.6], [46.8, -71.2], [48.5, -69]], // St. Lawrence
  [[37, -106.9], [32, -106.5], [29.5, -104.4], [26, -97.6]], // Rio Grande
  [[39, -108], [36.1, -112], [35, -114.6], [32, -115]], // Colorado
  [[49, -117.6], [46.2, -119], [45.6, -121.2], [46.2, -123.8]], // Columbia
  [[19.4, -99.1], [18.5, -97], [17.5, -92.5]], // Valley of Mexico & Usumacinta
  [[9.5, -10.5], [12.6, -8], [14.5, -4.2], [16.8, -3], [16.3, 0], [13.5, 2.1], [11.5, 3.6], [9, 6], [7.8, 6.7], [5, 6.2]], // Niger
  [[12, -9], [14.4, -11.4], [16.5, -15], [15.9, -16.5]], // Senegal
  [[-8, 26], [0.5, 25.2], [2, 22], [0, 18], [-4.3, 15.3], [-6, 12.4]], // Congo
  [[-12, 23], [-15, 23.2], [-17.9, 25.9], [-16, 30], [-16.5, 33.5], [-18.5, 36]], // Zambezi
  [[-4.5, -73.5], [-3.5, -68], [-3.1, -60], [-2.5, -55], [-1.5, -52], [-0.1, -50.5]], // Amazon
  [[-20, -51], [-25.5, -54.6], [-27.3, -56], [-31.6, -60.7], [-34, -58.5]], // Paraná
  [[2.5, -66], [6, -67.5], [7.7, -66], [8.2, -63], [8.6, -61]], // Orinoco
  [[-13.5, -72], [-8, -78.8], [-6.5, -79.8]], // Andean valleys (Urubamba & northern coast)
  [[-36, 147.9], [-34.2, 142], [-34.3, 140], [-35.5, 139.3]], // Murray
];
function nearRiver(lat, lon, deg = 1.35) {
  const c = Math.cos(lat * Math.PI / 180);
  for (const r of RIVERS) for (let k = 0; k + 1 < r.length; k++) {
    const [a1, o1] = r[k], [a2, o2] = r[k + 1];
    const steps = Math.ceil(Math.hypot(a2 - a1, o2 - o1) / 0.5);
    for (let s = 0; s <= steps; s++) {
      const la = a1 + (a2 - a1) * s / steps, lo = o1 + (o2 - o1) * s / steps;
      if (Math.hypot(la - lat, (lo - lon) * c) < deg) return true;
    }
  }
  return false;
}

export function classify(R, g) {
  const lat = Math.abs(R.lat), veg = g.veg, des = g.desert, ice = g.ice, elev = g.elev, rel = g.relief;
  const river = nearRiver(R.lat, R.lon);
  let t;
  if ((ice > 0.55 && lat > 58) || ice > 0.8) t = 'ice';
  else if (elev > 0.44 || g.high > 0.55 || (rel > 0.14 && elev > 0.2)) t = 'mountains';
  else if (des > 0.55) t = river && elev < 0.15 ? 'floodplain' : 'desert';
  else if (lat > 63) t = veg > 0.5 ? 'taiga' : 'tundra';
  else if (elev > 0.19 || rel > 0.09) t = 'hills';
  else if (lat > 55) t = veg > 0.25 || ice > 0.08 ? 'taiga' : 'tundra';
  else if (des > 0.25) t = river ? 'floodplain' : 'steppe';
  else if (lat < 16 && veg > 0.95) t = river ? 'floodplain' : 'jungle';
  else if (river) t = 'floodplain';
  else if (veg > 1.05) t = 'forest';
  else if (veg > 0.5) t = 'grassland';
  else if (veg < 0.15 && lat > 35 && lat < 55) t = 'steppe';
  else t = 'plains';
  const T = TERRAIN[t];
  let fert = T.arable * (0.85 + 0.3 * Math.min(1, veg));
  if (lat > 50) fert *= Math.max(0.35, 1 - (lat - 50) * 0.045);
  return { terrain: t, river, fert: Math.round(fert * 100) / 100, forest: Math.min(1, veg), hab: T.hab * (river ? 1.2 : 1) * (R.coastal ? 1.08 : 1) };
}

// ------------------------------------------------------------------ resources
// kind: food | material | strategic | luxury.  imp: the improvement that works it.  reveal: technology needed to see/use it.
export const RES = {
  wheat: { name: 'Wheat', kind: 'food', imp: 'farm', icon: '🌾' },
  rice: { name: 'Rice', kind: 'food', imp: 'farm', icon: '🍚' },
  maize: { name: 'Maize', kind: 'food', imp: 'farm', icon: '🌽' },
  millet: { name: 'Millet', kind: 'food', imp: 'farm', icon: '🌿' },
  potatoes: { name: 'Potatoes', kind: 'food', imp: 'farm', icon: '🥔' },
  cattle: { name: 'Cattle', kind: 'food', imp: 'pasture', icon: '🐄' },
  sheep: { name: 'Sheep', kind: 'food', imp: 'pasture', icon: '🐑' },
  game: { name: 'Game', kind: 'food', imp: 'camp', icon: '🦌' },
  fish: { name: 'Fish', kind: 'food', imp: 'fishery', icon: '🐟' },
  bananas: { name: 'Bananas', kind: 'food', imp: 'plantation', icon: '🍌' },
  timber: { name: 'Timber', kind: 'material', imp: 'lumber', icon: '🪵' },
  stone: { name: 'Stone', kind: 'material', imp: 'quarry', icon: '🪨' },
  marble: { name: 'Marble', kind: 'luxury', imp: 'quarry', icon: '🏛️', reveal: 'masonry' },
  horses: { name: 'Horses', kind: 'strategic', imp: 'pasture', icon: '🐎', reveal: 'animal_husbandry' },
  copper: { name: 'Copper', kind: 'strategic', imp: 'mine', icon: '🟤', reveal: 'copper_working', metal: 1 },
  tin: { name: 'Tin', kind: 'strategic', imp: 'mine', icon: '⚪', reveal: 'bronze_working', metal: 0.6 },
  iron: { name: 'Iron', kind: 'strategic', imp: 'mine', icon: '⚙️', reveal: 'iron_working', metal: 1.4 },
  coal: { name: 'Coal', kind: 'strategic', imp: 'mine', icon: '⚫', reveal: 'coal_mining', energy: 1 },
  saltpeter: { name: 'Saltpeter', kind: 'strategic', imp: 'mine', icon: '🧂', reveal: 'gunpowder' },
  oil: { name: 'Oil', kind: 'strategic', imp: 'well', icon: '🛢️', reveal: 'oil_drilling' },
  rubber: { name: 'Rubber', kind: 'strategic', imp: 'plantation', icon: '🌳', reveal: 'vulcanization' },
  aluminum: { name: 'Aluminum', kind: 'strategic', imp: 'mine', icon: '🔩', reveal: 'electricity' },
  uranium: { name: 'Uranium', kind: 'strategic', imp: 'mine', icon: '☢️', reveal: 'atomic_theory' },
  rareearth: { name: 'Rare Earths', kind: 'strategic', imp: 'mine', icon: '💠', reveal: 'semiconductors' },
  gold: { name: 'Gold', kind: 'luxury', imp: 'mine', icon: '🥇', reveal: 'copper_working', wealth: 1 },
  silver: { name: 'Silver', kind: 'luxury', imp: 'mine', icon: '🥈', reveal: 'copper_working', wealth: 0.7 },
  gems: { name: 'Gems', kind: 'luxury', imp: 'mine', icon: '💎', reveal: 'mining', wealth: 0.8 },
  salt: { name: 'Salt', kind: 'luxury', imp: 'mine', icon: '🧊', reveal: 'pottery', wealth: 0.4 },
  spices: { name: 'Spices', kind: 'luxury', imp: 'plantation', icon: '🌶️', wealth: 0.9 },
  silk: { name: 'Silk', kind: 'luxury', imp: 'plantation', icon: '🧵', reveal: 'weaving', wealth: 0.9 },
  wine: { name: 'Wine', kind: 'luxury', imp: 'plantation', icon: '🍷', reveal: 'horticulture', wealth: 0.7 },
  incense: { name: 'Incense', kind: 'luxury', imp: 'plantation', icon: '🕯️', wealth: 0.8 },
  dyes: { name: 'Dyes', kind: 'luxury', imp: 'plantation', icon: '🎨', reveal: 'weaving', wealth: 0.6 },
  cotton: { name: 'Cotton', kind: 'luxury', imp: 'plantation', icon: '☁️', reveal: 'weaving', wealth: 0.5 },
  sugar: { name: 'Sugar', kind: 'luxury', imp: 'plantation', icon: '🍬', reveal: 'horticulture', wealth: 0.6 },
  tea: { name: 'Tea', kind: 'luxury', imp: 'plantation', icon: '🍵', reveal: 'horticulture', wealth: 0.6 },
  coffee: { name: 'Coffee', kind: 'luxury', imp: 'plantation', icon: '☕', reveal: 'horticulture', wealth: 0.6 },
  tobacco: { name: 'Tobacco', kind: 'luxury', imp: 'plantation', icon: '🍂', reveal: 'horticulture', wealth: 0.5 },
  furs: { name: 'Furs', kind: 'luxury', imp: 'camp', icon: '🦊', wealth: 0.6 },
  ivory: { name: 'Ivory', kind: 'luxury', imp: 'camp', icon: '🐘', wealth: 0.7 },
  pearls: { name: 'Pearls', kind: 'luxury', imp: 'fishery', icon: '🦪', wealth: 0.7 },
  whales: { name: 'Whales', kind: 'luxury', imp: 'fishery', icon: '🐋', reveal: 'sailing', wealth: 0.5 },
  // map v2 additions
  olives: { name: 'Olives', kind: 'food', imp: 'plantation', icon: '🫒', reveal: 'horticulture', wealth: 0.3 },
  dates: { name: 'Date Palms', kind: 'food', imp: 'plantation', icon: '🌴', reveal: 'horticulture', wealth: 0.2 },
  llamas: { name: 'Llamas', kind: 'food', imp: 'pasture', icon: '🦙', reveal: 'animal_husbandry' },
  clay: { name: 'Clay', kind: 'material', imp: 'quarry', icon: '🧱', reveal: 'pottery' },
  obsidian: { name: 'Obsidian', kind: 'strategic', imp: 'quarry', icon: '🔪', desc: 'Razor-sharp blades: Stone and Bronze Age armies fight harder.' },
  camels: { name: 'Camels', kind: 'strategic', imp: 'pasture', icon: '🐪', reveal: 'camel_domestication', desc: 'Camel riders and desert caravans.' },
  elephants: { name: 'Elephants', kind: 'strategic', imp: 'camp', icon: '🐘', reveal: 'war_elephants', desc: 'War elephants.' },
  natural_gas: { name: 'Natural Gas', kind: 'strategic', imp: 'well', icon: '🔥', reveal: 'refining', energy: 1.2, desc: 'Fuel for power plants and fertilizer.' },
  phosphate: { name: 'Phosphate', kind: 'strategic', imp: 'mine', icon: '🧪', reveal: 'fertilizer', desc: 'Fertilizer: +10% food from the Industrial Age.' },
  lithium: { name: 'Lithium', kind: 'strategic', imp: 'mine', icon: '🔋', reveal: 'batteries', wealth: 0.4, desc: 'Batteries for drones and electric vehicles.' },
  cobalt: { name: 'Cobalt', kind: 'strategic', imp: 'mine', icon: '🔷', reveal: 'batteries', wealth: 0.4, metal: 0.3, desc: 'Battery cathodes and superalloys.' },
  jade: { name: 'Jade', kind: 'luxury', imp: 'mine', icon: '🟩', reveal: 'mining', wealth: 0.8 },
  lapis: { name: 'Lapis Lazuli', kind: 'luxury', imp: 'mine', icon: '🔵', reveal: 'mining', wealth: 0.7 },
  amber: { name: 'Amber', kind: 'luxury', imp: 'quarry', icon: '🟠', wealth: 0.6 },
  cocoa: { name: 'Cocoa', kind: 'luxury', imp: 'plantation', icon: '🍫', reveal: 'horticulture', wealth: 0.7 },
  citrus: { name: 'Citrus', kind: 'luxury', imp: 'plantation', icon: '🍊', reveal: 'horticulture', wealth: 0.5 },
  saffron: { name: 'Saffron', kind: 'luxury', imp: 'plantation', icon: '🌸', reveal: 'horticulture', wealth: 0.9 },
};
export const STRATEGIC = Object.keys(RES).filter(k => RES[k].kind === 'strategic');
export const LUXURIES = Object.keys(RES).filter(k => RES[k].kind === 'luxury');

// ------------------------------------------------------------------ improvements (worked land)
// yields per level before technology multipliers. tech: required to build. need(tile): where it can go.
export const IMPROVEMENTS = {
  camp: { name: 'Hunting Camps', icon: '🏹', tech: null, desc: 'Hunt game; trade furs and ivory.', need: t => ['forest', 'taiga', 'tundra', 'jungle', 'steppe', 'grassland', 'hills', 'plains', 'floodplain'].includes(t.terrain) || t.dep.some(d => RES[d.r].imp === 'camp') },
  farm: { name: 'Farms', icon: '🌾', tech: 'agriculture', desc: 'Cultivated fields. Output follows soil fertility.', need: t => t.fert >= 0.25 || t.dep.some(d => RES[d.r].imp === 'farm') },
  pasture: { name: 'Pastures', icon: '🐄', tech: 'animal_husbandry', desc: 'Herds of cattle, sheep and horses.', need: t => ['grassland', 'plains', 'steppe', 'hills', 'floodplain'].includes(t.terrain) || t.dep.some(d => RES[d.r].imp === 'pasture') },
  fishery: { name: 'Fisheries', icon: '🐟', tech: 'fishing', desc: 'Boats and nets on the coast and rivers.', need: t => t.coastal || t.river },
  lumber: { name: 'Lumber Mills', icon: '🪵', tech: null, desc: 'Fell timber for building and ships.', need: t => TERRAIN[t.terrain].wood >= 0.45 || t.dep.some(d => d.r === 'timber') },
  quarry: { name: 'Quarries', icon: '🪨', tech: 'masonry', desc: 'Cut stone for walls, temples and roads.', need: t => TERRAIN[t.terrain].stone >= 0.45 || t.dep.some(d => RES[d.r].imp === 'quarry') },
  mine: { name: 'Mines', icon: '⛏️', tech: 'mining', desc: 'Dig ore: metal, precious stones, coal and more.', need: (t, N) => t.dep.some(d => RES[d.r].imp === 'mine' && known(N, d.r)) },
  plantation: { name: 'Plantations', icon: '🌿', tech: 'horticulture', desc: 'Cash crops and luxuries for trade.', need: (t, N) => t.dep.some(d => RES[d.r].imp === 'plantation' && known(N, d.r)) },
  well: { name: 'Oil & Gas Wells', icon: '🛢️', tech: 'oil_drilling', desc: 'Pump crude oil and natural gas for fuel and energy.', need: (t, N) => t.dep.some(d => RES[d.r].imp === 'well' && known(N, d.r)) },
};
export const IMP_ORDER = ['farm', 'pasture', 'camp', 'fishery', 'lumber', 'quarry', 'mine', 'plantation', 'well'];
// maximum improvement level by age
export const IMP_CAP = [2, 3, 4, 4, 5, 6, 7, 8, 9, 10];
// people (thousands) needed to work one improvement level, by age
export const LABOR = a => 0.45 * Math.pow(1.35, a);

export function known(N, r) { const rv = RES[r].reveal; return !rv || !N || !!N.techs[rv]; }

// ------------------------------------------------------------------ deposit placement
const C = (t, ...names) => names.includes(t.country);
const box = (t, la0, la1, lo0, lo1) => t.lat >= la0 && t.lat <= la1 && t.lon >= lo0 && t.lon <= lo1;
const terr = (t, ...k) => k.includes(t.terrain);
const AMERICAS = t => t.lon < -30;
const AFRICA = t => t.lon > -20 && t.lon < 52 && t.lat < 35 && !(t.lat > 12 && t.lon > 36);
const EUROPE = t => t.lat > 35 && t.lon > -12 && t.lon < 45;
const MIDEAST = t => t.lat > 12 && t.lat < 42 && t.lon > 32 && t.lon < 63;

const RULES = [
  ['wheat', t => (EUROPE(t) || MIDEAST(t) || box(t, 25, 55, 45, 125)) && terr(t, 'plains', 'grassland', 'floodplain', 'steppe') ? 0.55 : 0],
  ['rice', t => box(t, -10, 40, 70, 145) && terr(t, 'floodplain', 'grassland', 'plains', 'jungle') && t.fert > 0.6 ? 0.6 : 0],
  ['maize', t => AMERICAS(t) && t.lat > -35 && t.lat < 47 && terr(t, 'plains', 'grassland', 'floodplain', 'hills', 'forest') ? 0.55 : 0],
  ['potatoes', t => box(t, -25, 5, -82, -65) && terr(t, 'hills', 'mountains', 'grassland') ? 0.6 : 0],
  ['millet', t => AFRICA(t) && t.lat > -20 && t.lat < 17 && terr(t, 'plains', 'grassland', 'steppe', 'floodplain') ? 0.45 : 0],
  ['bananas', t => Math.abs(t.lat) < 18 && terr(t, 'jungle', 'floodplain', 'grassland') ? 0.25 : 0],
  ['cattle', t => terr(t, 'grassland', 'plains', 'steppe', 'floodplain') && !box(t, -60, 60, -170, -30) ? 0.35 : terr(t, 'grassland', 'plains') ? 0.12 : 0],
  ['sheep', t => terr(t, 'hills', 'steppe', 'mountains') && !AMERICAS(t) ? 0.3 : 0],
  ['game', t => terr(t, 'forest', 'taiga', 'tundra', 'jungle', 'grassland', 'steppe') ? 0.45 : 0.1],
  ['fish', t => t.coastal ? 0.55 : 0],
  ['whales', t => t.coastal && Math.abs(t.lat) > 42 ? 0.22 : 0],
  ['pearls', t => t.coastal && (box(t, 22, 30, 47, 57) || box(t, 5, 10, 78, 82) || box(t, 30, 36, 130, 140) || box(t, 5, 15, 115, 127) || box(t, -20, -8, 140, 155)) ? 0.5 : 0],
  ['timber', t => t.forest > 0.85 && terr(t, 'forest', 'taiga', 'jungle', 'hills') ? 0.55 : 0],
  ['stone', t => terr(t, 'hills', 'mountains') ? 0.55 : terr(t, 'desert', 'plains') ? 0.12 : 0],
  ['marble', t => C(t, 'Italy', 'Greece', 'Turkey', 'India', 'Spain', 'Egypt', 'China', 'Portugal') && terr(t, 'hills', 'mountains', 'plains') ? 0.35 : 0],
  ['horses', t => !AMERICAS(t) && !box(t, -50, -10, 110, 180) && (terr(t, 'steppe') ? 0.5 : terr(t, 'grassland', 'plains') && (t.lat > 25 || t.lat < -25 || MIDEAST(t)) ? 0.16 : 0)],
  ['copper', t => (C(t, 'Chile', 'Peru', 'Zambia', 'Dem. Rep. Congo', 'Iran', 'Mongolia', 'Kazakhstan', 'Cyprus', 'Turkey', 'Jordan', 'Israel', 'Spain', 'Poland', 'Australia', 'Canada', 'Mexico') || box(t, 31, 37, -114, -107) || box(t, 27, 31, 33, 35)) ? 0.4 : terr(t, 'hills', 'mountains') ? 0.07 : 0.01],
  ['tin', t => (C(t, 'Malaysia', 'Indonesia', 'Bolivia', 'Thailand', 'Myanmar', 'Nigeria', 'Dem. Rep. Congo', 'Rwanda') || box(t, 49.5, 51, -6, -3.5) || box(t, 22, 26, 100, 105) || box(t, 40, 43, -9, -6) || box(t, 49, 51, 12, 14)) ? 0.4 : terr(t, 'hills', 'mountains') ? 0.02 : 0],
  ['iron', t => (C(t, 'Sweden', 'Brazil', 'Ukraine', 'India', 'France', 'Spain', 'United Kingdom', 'Germany', 'Liberia', 'Mauritania') || box(t, -30, -15, 113, 125) || box(t, 45, 49, -95, -85) || box(t, 50, 60, 55, 62) || box(t, 34, 42, 110, 124)) ? 0.4 : terr(t, 'hills', 'mountains') ? 0.1 : terr(t, 'forest', 'taiga', 'plains') ? 0.03 : 0],
  ['coal', t => (C(t, 'United Kingdom', 'Germany', 'Poland', 'Ukraine', 'South Africa', 'Colombia') || box(t, 35.5, 41.5, -88, -77) || box(t, 41, 46, -110, -104) || box(t, 51, 57, 82, 92) || box(t, 33, 42, 105, 120) || box(t, 20, 25, 82, 88) || box(t, -33, -22, 145, 152) || box(t, 47, 52, 66, 78)) ? 0.5 : terr(t, 'hills', 'forest', 'plains') && Math.abs(t.lat) > 30 ? 0.06 : 0],
  ['saltpeter', t => (C(t, 'Chile', 'India', 'China', 'Iran', 'Egypt', 'Spain')) ? 0.25 : terr(t, 'desert', 'steppe') ? 0.05 : 0.006],
  ['oil', t => C(t, 'Saudi Arabia', 'Iraq', 'Kuwait', 'United Arab Emirates', 'Qatar', 'Oman', 'Libya', 'Algeria', 'Nigeria', 'Angola', 'Venezuela', 'Azerbaijan', 'Turkmenistan', 'Brunei', 'Ecuador', 'Gabon') ? 0.6
    : (C(t, 'Iran') && t.lon < 56) || box(t, 25.5, 37, -104, -93) || box(t, 49, 60, -120, -110) || box(t, 68, 72, -160, -140) || box(t, 55, 68, 60, 90) || box(t, 43, 48, 46, 56) || box(t, 18, 23, -98, -90)
      || box(t, 45, 48, 120, 127) || box(t, 37, 46, 80, 90) || box(t, 2, 7, 100, 119) || box(t, -46, -36, -71, -64) || box(t, 56, 62, 2, 8) || box(t, 4, 12, 28, 33) ? 0.5 : terr(t, 'desert') ? 0.02 : 0.003],
  ['rubber', t => (box(t, -10, 4, -75, -48) || box(t, -5, 5, 12, 28) || box(t, -8, 13, 95, 115)) && terr(t, 'jungle', 'floodplain', 'forest') ? 0.45 : 0],
  ['aluminum', t => C(t, 'Australia', 'Guinea', 'Jamaica', 'Brazil', 'China', 'India', 'Indonesia', 'Russia', 'Kazakhstan', 'Guyana', 'Suriname') ? 0.16 : 0.006],
  ['uranium', t => C(t, 'Kazakhstan', 'Namibia', 'Niger', 'Uzbekistan', 'Dem. Rep. Congo', 'South Africa', 'Ukraine') || box(t, 55, 60, -110, -102) || box(t, -32, -10, 120, 140) || box(t, 36, 40, -112, -106) ? 0.35 : C(t, 'Russia', 'China', 'Canada', 'Australia') ? 0.04 : 0.003],
  ['rareearth', t => box(t, 39, 44, 108, 114) || box(t, 22, 27, 110, 117) || box(t, 34, 36, -116, -115) ? 0.6 : C(t, 'Australia', 'Myanmar', 'Brazil', 'India', 'Vietnam', 'Russia', 'Malaysia') ? 0.06 : 0.003],
  ['gold', t => (C(t, 'Ghana', 'Mali', 'South Africa', 'Sudan', 'Peru', 'Colombia', 'Zimbabwe') || box(t, 36, 42, -123, -118) || box(t, 60, 66, -142, -130) || box(t, -34, -27, 115, 123) || box(t, -38, -36, 143, 145) || box(t, 55, 65, 110, 140) || box(t, -21, -18, -45, -42) || box(t, 22, 26, 32, 35)) ? 0.4 : terr(t, 'mountains', 'hills') ? 0.04 : 0.005],
  ['silver', t => (C(t, 'Mexico', 'Peru', 'Bolivia', 'Spain') || box(t, 37.5, 38.5, 23.5, 24.5) || box(t, 50, 51, 12, 14)) ? 0.35 : terr(t, 'mountains', 'hills') ? 0.04 : 0],
  ['gems', t => (C(t, 'India', 'Sri Lanka', 'Myanmar', 'South Africa', 'Botswana', 'Colombia', 'Afghanistan', 'Dem. Rep. Congo', 'Angola', 'Namibia', 'Brazil') || box(t, 62, 68, 110, 120)) ? 0.25 : terr(t, 'mountains') ? 0.03 : 0],
  ['salt', t => C(t, 'Mali', 'Ethiopia', 'Bolivia', 'Austria', 'Poland') || box(t, 22, 30, -8, 0) ? 0.4 : terr(t, 'desert') ? 0.1 : t.coastal ? 0.05 : 0.01],
  ['spices', t => (box(t, 6, 16, 73, 80) || C(t, 'Sri Lanka', 'Indonesia', 'Malaysia') || box(t, -8, -4, 38, 40)) ? 0.55 : Math.abs(t.lat) < 15 && t.lon > 60 && t.lon < 150 ? 0.08 : 0],
  ['silk', t => C(t, 'China') && t.lat < 36 && t.lon > 102 ? 0.4 : C(t, 'Japan', 'Uzbekistan') ? 0.15 : 0],
  ['wine', t => C(t, 'France', 'Italy', 'Spain', 'Portugal', 'Greece', 'Georgia', 'Hungary', 'Syria', 'Lebanon', 'Israel', 'Armenia') || (C(t, 'Turkey') && t.lon < 36) || (C(t, 'Germany') && t.lat < 51) || box(t, -36, -30, -72, -68) || box(t, -35, -33, 18, 20) ? 0.45 : 0],
  ['incense', t => C(t, 'Oman', 'Yemen', 'Somalia', 'Somaliland', 'Djibouti', 'Eritrea') || (C(t, 'Saudi Arabia') && t.lat < 21) || (C(t, 'Ethiopia') && t.lat > 8) ? 0.55 : 0],
  ['dyes', t => C(t, 'India', 'Lebanon', 'Guatemala', 'Belize') || box(t, 16, 21, -100, -92) || box(t, 32, 35, 34, 37) ? 0.3 : 0],
  ['cotton', t => C(t, 'India', 'Egypt', 'Uzbekistan', 'Pakistan', 'Peru', 'Sudan', 'Turkmenistan') || box(t, 30, 36, -100, -78) ? 0.35 : 0],
  ['sugar', t => Math.abs(t.lat) < 25 && (AMERICAS(t) || box(t, -10, 30, 70, 125)) && terr(t, 'jungle', 'floodplain', 'grassland', 'plains') ? 0.2 : 0],
  ['tea', t => (C(t, 'China') && t.lat < 32 && t.lon > 100) || box(t, 25, 28, 89, 96) || C(t, 'Sri Lanka', 'Japan') || box(t, -2, 2, 34, 38) ? 0.35 : 0],
  ['coffee', t => C(t, 'Ethiopia', 'Yemen', 'Colombia', 'Vietnam', 'Kenya', 'Guatemala', 'Costa Rica', 'Honduras') || box(t, -24, -14, -52, -40) ? 0.35 : 0],
  ['tobacco', t => AMERICAS(t) && Math.abs(t.lat) < 38 && terr(t, 'plains', 'grassland', 'floodplain', 'hills', 'forest') ? 0.14 : 0],
  ['furs', t => t.lat > 50 && terr(t, 'forest', 'taiga', 'tundra') ? 0.4 : 0],
  ['olives', t => (box(t, 30, 44, -10, 37) || box(t, 31, 38, 35, 46)) && terr(t, 'hills', 'plains', 'grassland', 'steppe') && t.coastal ? 0.4 : 0],
  ['dates', t => (box(t, 15, 34, -10, 60)) && terr(t, 'desert', 'floodplain', 'steppe') && (t.river || t.coastal) ? 0.45 : terr(t, 'desert') && box(t, 15, 34, -10, 60) ? 0.08 : 0],
  ['llamas', t => box(t, -35, 2, -80, -63) && terr(t, 'hills', 'mountains', 'steppe', 'grassland') ? 0.5 : 0],
  ['clay', t => terr(t, 'floodplain') ? 0.35 : t.river && terr(t, 'plains', 'grassland') ? 0.12 : 0],
  ['obsidian', t => (C(t, 'Turkey', 'Armenia', 'Ethiopia', 'Kenya', 'Mexico', 'Guatemala', 'Japan', 'Iceland', 'New Zealand', 'Italy', 'Indonesia', 'Papua New Guinea') || box(t, 37, 45, -122, -110)) && terr(t, 'mountains', 'hills', 'steppe', 'plains') ? 0.25 : 0],
  ['camels', t => (box(t, 12, 45, -15, 75) || box(t, 36, 50, 75, 112)) && terr(t, 'desert', 'steppe') ? 0.3 : 0],
  ['elephants', t => (AFRICA(t) && t.lat < 15 && t.lat > -25 && terr(t, 'grassland', 'plains', 'jungle', 'floodplain')) || (box(t, 5, 30, 72, 108) && terr(t, 'jungle', 'forest', 'grassland', 'floodplain')) ? 0.16 : 0],
  ['natural_gas', t => C(t, 'Russia') && t.lat > 55 && t.lon > 60 ? 0.3 : C(t, 'Iran', 'Qatar', 'Turkmenistan', 'Algeria', 'Norway', 'Netherlands', 'Saudi Arabia', 'United Arab Emirates', 'Egypt', 'Uzbekistan', 'Azerbaijan', 'Nigeria', 'Trinidad and Tobago', 'Malaysia', 'Indonesia', 'Australia', 'Mozambique') ? 0.22 : box(t, 28, 42, -105, -76) || box(t, 49, 58, -122, -110) ? 0.3 : 0.004],
  ['phosphate', t => C(t, 'Morocco', 'W. Sahara', 'Tunisia', 'Jordan', 'Nauru', 'Togo', 'Senegal') || box(t, 26, 31, -83, -80) || box(t, 42, 44, -113, -110) || box(t, 67, 68, 33, 35) ? 0.45 : C(t, 'China', 'Russia', 'Brazil', 'Saudi Arabia', 'Egypt', 'Algeria') ? 0.04 : 0.003],
  ['lithium', t => box(t, -27, -18, -71, -65) || box(t, -34, -18, 114, 122) || box(t, 34, 42, -119, -113) ? 0.45 : C(t, 'China', 'Zimbabwe', 'Portugal', 'Brazil', 'Canada') ? 0.05 : 0.002],
  ['cobalt', t => C(t, 'Dem. Rep. Congo', 'Zambia') && t.lat < -5 ? 0.6 : C(t, 'Russia', 'Australia', 'Philippines', 'Cuba', 'Canada', 'Madagascar', 'Papua New Guinea', 'New Caledonia', 'Morocco') ? 0.05 : 0.002],
  ['jade', t => C(t, 'Myanmar', 'Guatemala') || (C(t, 'China') && t.lon < 90) || box(t, 37, 41, 78, 84) || box(t, -46, -40, 168, 172) ? 0.4 : 0],
  ['lapis', t => box(t, 34, 38, 68, 73) || box(t, -34, -30, -71, -69) || box(t, 50, 53, 102, 106) ? 0.5 : 0],
  ['amber', t => box(t, 53, 60, 9, 28) && t.coastal ? 0.45 : C(t, 'Dominican Rep.', 'Myanmar') ? 0.15 : 0],
  ['cocoa', t => ((AMERICAS(t) && Math.abs(t.lat) < 18) || box(t, 3, 10, -10, 12)) && terr(t, 'jungle', 'forest', 'floodplain', 'grassland') ? 0.3 : 0],
  ['citrus', t => (box(t, 18, 34, 95, 122) || box(t, 25, 40, -10, 40)) && terr(t, 'plains', 'hills', 'floodplain', 'grassland') ? 0.18 : 0],
  ['saffron', t => C(t, 'Iran', 'Afghanistan') || box(t, 33, 35, 74, 76) || box(t, 38, 40, -4, -1) || box(t, 37, 40, 21, 24) ? 0.3 : 0],
  ['ivory', t => (AFRICA(t) && t.lat < 15 && t.lat > -25 && terr(t, 'grassland', 'plains', 'jungle', 'floodplain', 'steppe')) || C(t, 'India', 'Sri Lanka', 'Thailand', 'Myanmar') ? 0.22 : 0],
];

// seeded RNG (mulberry32)
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// t: { lat, lon, terrain, fert, forest, coastal, country }
// Deposits are sparse, as on the real Earth: most land holds one or two notable resources and many hold none.
// Common staples (game, fish, timber, stone) are thinned hardest; the regional riches keep most of their odds.
const SPARSE = { food: 0.5, material: 0.45, luxury: 0.7, strategic: 0.75 };
export function generateDeposits(t, rand) {
  const out = [];
  for (const [r, f] of RULES) {
    const p = f(t) * SPARSE[RES[r].kind];
    if (p > 0 && rand() < p) out.push({ r, amt: 1 + (rand() < 0.3 ? 1 : 0) + (rand() < 0.08 ? 1 : 0) });
  }
  // keep the richest few: strategic and luxury first, then food and materials
  const rank = d => ({ strategic: 3, luxury: 2, material: 1, food: 1.2 })[RES[d.r].kind] + d.amt * 0.2 + rand() * 0.5;
  return out.sort((a, b) => rank(b) - rank(a)).slice(0, 3);
}
