// Game balance constants: units, buildings, economy.

// domain: land | air | sea
// speed: km per day. atk/def per hour of combat. range: hops for ranged/air support.
// domain: land | air | sea.  speed: km/day (air: km/h in flight).  range: weapon reach in km.
// atk/def per hour of combat.  radius (air): operating radius in km.
export const UNITS = {
  INF: { name: 'Infantry', short: 'INF', domain: 'land', cost: 60, man: 10, days: 18, speed: 110, atk: 4, def: 6, hp: 100, upkeep: 0.5, fuel: 0.2, range: 45, sym: 'inf' },
  ARM: { name: 'Armor', short: 'ARM', domain: 'land', cost: 150, man: 6, days: 30, speed: 220, atk: 10, def: 6, hp: 120, upkeep: 1.3, fuel: 1.0, range: 60, sym: 'arm' },
  ART: { name: 'Artillery', short: 'ART', domain: 'land', cost: 100, man: 5, days: 26, speed: 100, atk: 8, def: 3, hp: 70, upkeep: 0.9, fuel: 0.4, range: 160, sym: 'art', indirect: true },
  FTR: { name: 'Fighter Wing', short: 'FTR', domain: 'air', cost: 170, man: 2, days: 35, speed: 650, atk: 7, def: 6, hp: 80, upkeep: 1.5, fuel: 1.4, range: 40, radius: 1100, sym: 'ftr' },
  BMB: { name: 'Bomber Wing', short: 'BMB', domain: 'air', cost: 240, man: 2, days: 45, speed: 520, atk: 11, def: 2, hp: 80, upkeep: 2.0, fuel: 1.8, range: 25, radius: 1800, sym: 'bmb' },
  DES: { name: 'Destroyer', short: 'DD', domain: 'sea', cost: 200, man: 3, days: 40, speed: 1000, atk: 6, def: 6, hp: 120, upkeep: 1.4, fuel: 0.9, range: 180, sym: 'des', antisub: 3 },
  SUB: { name: 'Submarine', short: 'SS', domain: 'sea', cost: 180, man: 2, days: 40, speed: 750, atk: 10, def: 3, hp: 80, upkeep: 1.1, fuel: 0.4, range: 110, sym: 'sub', stealth: true, raider: true },
  CRU: { name: 'Cruiser', short: 'CG', domain: 'sea', cost: 330, man: 4, days: 55, speed: 900, atk: 10, def: 9, hp: 200, upkeep: 2.2, fuel: 1.4, range: 320, sym: 'cru', indirect: true },
  CAR: { name: 'Carrier', short: 'CV', domain: 'sea', cost: 650, man: 6, days: 80, speed: 850, atk: 14, def: 6, hp: 260, upkeep: 3.6, fuel: 2.2, range: 700, sym: 'car', airwing: true },
  TRN: { name: 'Transport', short: 'AP', domain: 'sea', cost: 80, man: 1, days: 20, speed: 800, atk: 0, def: 2, hp: 80, upkeep: 0.5, fuel: 0.5, range: 0, sym: 'trn', lift: 4 },
};
export const LAND_TYPES = ['INF', 'ARM', 'ART'];
export const AIR_TYPES = ['FTR', 'BMB'];
export const SEA_TYPES = ['DES', 'SUB', 'CRU', 'CAR', 'TRN'];

// Buildings: levels 0..max. cost scales with target level.
export const BUILDINGS = {
  city: { name: 'City', max: 6, cost: l => 300 + 260 * l, days: l => 50 + 8 * l, desc: 'Population cap, tax income and manpower. Brightens city lights.' },
  farm: { name: 'Farms', max: 8, cost: l => 90 + 70 * l, days: () => 28, desc: 'Food production. Output scales with soil fertility.' },
  power: { name: 'Power Plant', max: 8, cost: l => 160 + 110 * l, days: () => 40, desc: 'Electricity for cities and industry.' },
  oil: { name: 'Oil Field', max: 4, cost: l => 220 + 120 * l, days: () => 38, desc: 'Large energy output. Only in oil-bearing regions.', needsOil: true },
  industry: { name: 'Industry', max: 6, cost: l => 260 + 180 * l, days: l => 45 + 5 * l, desc: 'Income and military production speed. Level 1+ builds land & air units.' },
  port: { name: 'Port', max: 3, cost: l => 200 + 160 * l, days: () => 40, desc: 'Builds warships, hubs trade, raises sealift.', coastal: true },
  fort: { name: 'Fortifications', max: 3, cost: l => 120 + 120 * l, days: () => 30, desc: 'Defense bonus and slower enemy capture.' },
  lab: { name: 'Research Lab', max: 5, cost: l => 220 + 180 * l, days: () => 45, desc: '+4 research per day per level.' },
  datacenter: { name: 'AI Datacenter', max: 4, cost: l => 500 + 350 * l, days: () => 60, desc: '+10 research and +2 income per level. Draws heavy power.', tech: 'datacenter' },
  academy: { name: 'Military Academy', max: 3, cost: l => 200 + 150 * l, days: () => 40, desc: 'Units training here gain experience much faster.', tech: 'academy' },
  nuclear: { name: 'Nuclear Program', max: 3, cost: l => 900 + 600 * l, days: () => 120, desc: 'Enrichment and weapons assembly. Produces warheads once Nuclear Weapons is researched.', tech: 'nuclear' },
};
export const BUILD_ORDER = ['city', 'farm', 'power', 'oil', 'industry', 'port', 'fort', 'lab', 'datacenter', 'academy', 'nuclear'];

// Oil- and gas-bearing regions (real major producing areas).
export const OIL_REGIONS = new Set(['TEX', 'ALA', 'ABT', 'DIX', 'VEN', 'COL', 'ECU', 'RIO', 'PAT', 'NWY', 'EDI', 'NCA', 'YAM', 'OMS', 'KOM', 'SAK',
  'KZW', 'TUK', 'IRQ', 'KHU', 'FAR', 'HAS', 'RIY', 'EMI', 'OMA', 'LIB', 'ALG', 'LAG', 'ANG', 'SUD', 'SUM', 'BOR', 'XIN', 'HEI', 'NTR', 'PIL', 'MEX', 'YUC', 'EGY', 'TAB']);

export const ECON = {
  foodPerPop: 1.0,          // food units per million people per day
  energyPerPop: 0.45,       // energy per million people per day, scaled by city level
  farmYield: 50,            // per farm level, times (0.35 + fertility)
  powerYield: 22,
  oilYield: 40,
  taxPerPop: 0.11,          // $M per million people per day at city level 0
  taxCityBonus: 0.06,       // extra per city level
  industryIncome: 5,        // $M per level per day
  industryEnergy: 3.5,
  popGrowth: 0.00004,       // per day with food security (~1.5%/yr)
  famineLoss: 0.0012,       // per day when starving
  manpowerRate: 0.00045,    // thousand-man units per million pop per day... (scaled below)
  basePrice: { food: 0.06, energy: 0.09 },
  gdpToIncome: 0.011,       // $M of state budget per day per $B of GDP
};

export const SPEEDS = [0, 1.5, 4, 12, 30]; // game hours per real second
export const START_DATE = Date.UTC(2030, 2, 20, 6, 0, 0);
