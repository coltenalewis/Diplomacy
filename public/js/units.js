// Military units by line and age, settlement levels, buildings and wonders.
import { ageScale } from './eras.js';

// ------------------------------------------------------------------ unit lines
// Each line upgrades through the ages: [age, name, tech, overrides]. Stats scale with age.
// needs: strategic resources required to build. ocean: may cross deep ocean. indirect: fires over others.
export const LINES = {
  INF: { name: 'Infantry', domain: 'land', role: 'melee', sym: 'inf', base: { atk: 2, def: 3, hp: 60, speed: 95, range: 22 }, cost: { food: 3, wood: 1, metal: 1.2, wealth: 0.9 }, pop: 0.22, days: 7,
    tiers: [[0, 'Warband', null], [1, 'Spearmen', 'bronze_working'], [2, 'Swordsmen', 'iron_working', { needs: ['iron'] }], [3, 'Legionaries', 'professional_army', { needs: ['iron'] }], [4, 'Men-at-Arms', 'chivalry', { needs: ['iron'] }],
      [5, 'Musketeers', 'gunpowder', { needs: ['saltpeter'] }], [6, 'Riflemen', 'conscription'], [7, 'Infantry', 'trench_warfare'], [8, 'Mechanized Infantry', 'mechanization', { needs: ['oil'], speed: 220 }], [9, 'Special Forces', 'network_warfare', { speed: 240 }]] },
  RNG: { name: 'Ranged', domain: 'land', role: 'ranged', sym: 'rng', base: { atk: 2.6, def: 1.8, hp: 45, speed: 95, range: 45 }, cost: { food: 2.5, wood: 2, metal: 0.8, wealth: 1 }, pop: 0.15, days: 7,
    tiers: [[0, 'Slingers', 'stone_tools'], [1, 'Archers', 'archery'], [2, 'Composite Bowmen', 'composite_bow'], [3, 'Skirmishers', 'tactics'], [4, 'Crossbowmen', 'machinery'],
      [5, 'Grenadiers', 'gunpowder', { needs: ['saltpeter'] }], [6, 'Machine Gunners', 'machine_gun', { range: 55 }], [7, 'Anti-Tank Team', 'combined_arms', { antiArmor: true }], [8, 'Missile Team', 'guided_missiles', { antiArmor: true, aa: true, range: 70 }], [9, 'Drone Team', 'autonomous_systems', { antiArmor: true, aa: true, range: 120 }]] },
  CAV: { name: 'Mounted', domain: 'land', role: 'mounted', sym: 'cav', base: { atk: 3.4, def: 2.2, hp: 65, speed: 170, range: 22 }, cost: { food: 4, wood: 1.5, metal: 1.4, wealth: 1.6 }, pop: 0.18, days: 9,
    tiers: [[1, 'Chariots', 'the_wheel', { needs: ['horses'] }], [2, 'Horsemen', 'horseback_riding', { needs: ['horses'] }], [3, 'Cataphracts', 'stirrup', { needs: ['horses', 'iron'] }], [4, 'Knights', 'chivalry', { needs: ['horses', 'iron'] }],
      [5, 'Cuirassiers', 'cavalry_tactics', { needs: ['horses'] }], [6, 'Cavalry', 'conscription', { needs: ['horses'] }], [7, 'Tanks', 'combustion', { needs: ['oil'], armor: true, speed: 200, sym: 'arm' }], [8, 'Main Battle Tanks', 'composites', { needs: ['oil'], armor: true, speed: 240, sym: 'arm' }], [9, 'Modern Armor', 'robotics', { needs: ['oil', 'rareearth'], armor: true, speed: 260, sym: 'arm' }]] },
  SGE: { name: 'Siege', domain: 'land', role: 'siege', sym: 'art', base: { atk: 3.2, def: 1.2, hp: 45, speed: 70, range: 30 }, cost: { food: 2, wood: 4, metal: 1.4, wealth: 1.4 }, pop: 0.12, days: 10, indirect: true,
    tiers: [[1, 'Battering Rams', 'the_wheel', { indirect: false, range: 20 }], [2, 'Catapults', 'mathematics', { range: 55 }], [3, 'Ballistae', 'engineering', { range: 60 }], [4, 'Trebuchets', 'physics', { range: 70 }],
      [5, 'Bombards', 'metal_casting', { needs: ['saltpeter'], range: 85 }], [6, 'Field Artillery', 'rifling', { range: 120 }], [7, 'Howitzers', 'ballistics', { range: 160 }], [8, 'Self-Propelled Guns', 'mechanization', { needs: ['oil'], range: 190, speed: 160 }], [9, 'Rocket Artillery', 'precision_munitions', { needs: ['oil'], range: 300, speed: 170 }]] },
  AA: { name: 'Air Defense', domain: 'land', role: 'aa', sym: 'aa', base: { atk: 1.2, def: 1.5, hp: 40, speed: 90, range: 80 }, cost: { food: 1, wood: 1, metal: 2, wealth: 2 }, pop: 0.1, days: 9, aa: true,
    tiers: [[7, 'Flak Battery', 'flight', { range: 60 }], [8, 'SAM Battery', 'guided_missiles', { range: 140 }], [9, 'Integrated Air Defense', 'directed_energy', { range: 260, intercept: true }]] },
  TRN: { name: 'Transports', domain: 'sea', role: 'transport', sym: 'trn', base: { atk: 0, def: 1, hp: 40, speed: 260, range: 0 }, cost: { food: 1, wood: 4, metal: 0.4, wealth: 1 }, pop: 0.05, days: 8,
    tiers: [[0, 'Rafts', 'rafts', { lift: 2 }], [1, 'Reed Boats', 'sailing', { lift: 2, speed: 340 }], [2, 'Merchant Galleys', 'shipbuilding', { lift: 3, speed: 380 }], [3, 'Merchantmen', 'navigation_stars', { lift: 3, speed: 420 }], [4, 'Cogs', 'compass', { lift: 4, speed: 460 }],
      [5, 'Carracks', 'navigation', { lift: 4, speed: 560, ocean: true }], [6, 'Steamships', 'steam_engine', { lift: 5, speed: 700, ocean: true, needs: ['coal'] }], [7, 'Troopships', 'combustion', { lift: 6, speed: 780, ocean: true }], [8, 'Amphibious Ships', 'amphibious_warfare', { lift: 6, speed: 820, ocean: true }], [9, 'Assault Ships', 'network_warfare', { lift: 8, speed: 880, ocean: true }]] },
  NAV: { name: 'Warships', domain: 'sea', role: 'warship', sym: 'des', base: { atk: 3, def: 3, hp: 70, speed: 360, range: 28 }, cost: { food: 2, wood: 6, metal: 1.5, wealth: 2 }, pop: 0.12, days: 12,
    tiers: [[1, 'Galleys', 'sailing'], [2, 'Biremes', 'shipbuilding'], [3, 'Triremes', 'navigation_stars', { range: 32 }], [4, 'Dromons', 'compass', { range: 40 }],
      [5, 'Frigates', 'navigation', { ocean: true, range: 90, speed: 600 }], [6, 'Ironclads', 'steam_engine', { ocean: true, needs: ['coal', 'iron'], range: 120, speed: 700 }], [7, 'Battleships', 'dreadnought', { ocean: true, needs: ['oil'], range: 260, speed: 800, indirect: true }],
      [8, 'Destroyers', 'radar', { ocean: true, needs: ['oil'], range: 180, speed: 1000, antisub: true, aa: true }], [9, 'Guided-Missile Destroyers', 'guided_missiles', { ocean: true, needs: ['oil'], range: 420, speed: 1000, antisub: true, aa: true, indirect: true }]] },
  SUB: { name: 'Submarines', domain: 'sea', role: 'sub', sym: 'sub', base: { atk: 4.2, def: 1.6, hp: 50, speed: 700, range: 100 }, cost: { food: 1, wood: 1, metal: 3, wealth: 3 }, pop: 0.06, days: 14, stealth: true,
    tiers: [[7, 'U-Boats', 'submarine_warfare', { ocean: true, needs: ['oil'] }], [8, 'Nuclear Submarines', 'nuclear_power', { ocean: true, needs: ['uranium'], speed: 850 }], [9, 'Attack Submarines', 'stealth_tech', { ocean: true, needs: ['uranium'], speed: 900, range: 300 }]] },
  CAR: { name: 'Carriers', domain: 'sea', role: 'carrier', sym: 'car', base: { atk: 5, def: 2.5, hp: 140, speed: 800, range: 650 }, cost: { food: 2, wood: 2, metal: 8, wealth: 9 }, pop: 0.3, days: 30, airwing: true,
    tiers: [[7, 'Aircraft Carriers', 'naval_aviation', { ocean: true, needs: ['oil'] }], [8, 'Supercarriers', 'nuclear_power', { ocean: true, needs: ['uranium'], range: 900 }], [9, 'Drone Carriers', 'autonomous_systems', { ocean: true, needs: ['uranium'], range: 1200 }]] },
  FTR: { name: 'Fighters', domain: 'air', role: 'fighter', sym: 'ftr', base: { atk: 3.5, def: 3, hp: 45, speed: 520, range: 40, radius: 800 }, cost: { food: 1, wood: 1, metal: 4, wealth: 5 }, pop: 0.03, days: 16,
    tiers: [[7, 'Fighter Squadrons', 'flight', { needs: ['oil'] }], [8, 'Jet Fighters', 'jet_propulsion', { needs: ['oil', 'aluminum'], speed: 900, radius: 1100 }], [9, 'Stealth Fighters', 'stealth_tech', { needs: ['oil', 'aluminum', 'rareearth'], speed: 1100, radius: 1400 }]] },
  BMB: { name: 'Bombers', domain: 'air', role: 'bomber', sym: 'bmb', base: { atk: 5, def: 1.2, hp: 45, speed: 420, range: 25, radius: 1300 }, cost: { food: 1, wood: 1, metal: 5, wealth: 6 }, pop: 0.04, days: 20,
    tiers: [[7, 'Bomber Squadrons', 'flight', { needs: ['oil'] }], [8, 'Strategic Bombers', 'jet_propulsion', { needs: ['oil', 'aluminum'], speed: 800, radius: 2600 }], [9, 'Stealth Bombers', 'stealth_tech', { needs: ['oil', 'aluminum', 'rareearth'], speed: 900, radius: 3600 }]] },
};
export const LINE_ORDER = ['INF', 'RNG', 'CAV', 'SGE', 'AA', 'TRN', 'NAV', 'SUB', 'CAR', 'FTR', 'BMB'];
// regional alternatives that join a line without replacing its main upgrade path: [id, line, age, name, tech, overrides, stat multipliers]
export const VARIANTS = [
  ['CAVE2', 'CAV', 2, 'War Elephants', 'war_elephants', { needs: ['elephants'], speed: 120, sym: 'cav' }, { atk: 1.3, def: 1.25, hp: 1.35, cost: 1.4 }],
  ['CAVE4', 'CAV', 4, 'Armored Elephants', 'war_elephants', { needs: ['elephants', 'iron'], speed: 125, sym: 'cav' }, { atk: 1.25, def: 1.3, hp: 1.35, cost: 1.4 }],
  ['CAVC2', 'CAV', 2, 'Camel Riders', 'camel_domestication', { needs: ['camels'], speed: 165 }, { atk: 0.95, def: 1.05, hp: 1.05, cost: 0.95 }],
  ['CAVC5', 'CAV', 5, 'Camel Corps', 'camel_domestication', { needs: ['camels', 'saltpeter'], speed: 180 }, { atk: 0.95, def: 1.05, hp: 1.05, cost: 0.95 }],
  ['INFO0', 'INF', 0, 'Obsidian Warriors', 'stone_tools', { needs: ['obsidian'] }, { atk: 1.3, def: 1.1, hp: 1, cost: 1.15 }],
  ['CAVH8', 'CAV', 8, 'Heavy Tanks', 'heavy_tanks', { needs: ['oil'], speed: 165, sym: 'arm' }, { atk: 0.92, def: 0.95, hp: 1, cost: 1.1 }],
  ['RNGL9', 'RNG', 9, 'Loitering Drone Team', 'batteries', { needs: ['lithium', 'cobalt'], antiArmor: true, aa: true, range: 160 }, { atk: 1.2, def: 1, hp: 1, cost: 1.2 }],
];

// Flattened unit table: UNITS['INF3'] = Legionaries, etc.
export const UNITS = {};
for (const [line, L] of Object.entries(LINES)) {
  for (const [age, name, tech, o = {}] of L.tiers) {
    const sc = ageScale(age), st = Math.pow(1.32, age), hp = Math.pow(1.12, age);
    const T = {
      id: line + age, line, age, name, tech, domain: L.domain, role: L.role, sym: o.sym || L.sym,
      atk: +(L.base.atk * st).toFixed(2), def: +(L.base.def * st).toFixed(2), hp: Math.round(L.base.hp * hp),
      speed: o.speed || Math.round(L.base.speed * (1 + age * 0.045)), range: o.range ?? L.base.range, radius: o.radius || L.base.radius || 0,
      pop: +(L.pop * Math.pow(1.7, age)).toFixed(2), days: Math.round(L.days + age * 1.3),
      needs: o.needs || [], ocean: !!o.ocean, indirect: o.indirect ?? !!L.indirect, lift: o.lift || 0,
      aa: !!(o.aa || L.aa), antisub: !!o.antisub, stealth: !!L.stealth, airwing: !!L.airwing, armor: !!o.armor, antiArmor: !!o.antiArmor, intercept: !!o.intercept,
    };
    T.cost = {};
    for (const [k, v] of Object.entries(L.cost)) {
      if (k === 'metal' && age < 1) continue;
      if (k === 'wealth' && age < 1) continue;
      // later armies are paid for in metal and money rather than grain and timber
      const f = k === 'food' ? (age >= 5 ? 0.25 : 0.8) : k === 'wood' ? (age >= 6 ? 0.3 : age >= 5 ? 0.6 : 1) : k === 'metal' ? (age >= 6 ? 1.6 : 1) : k === 'wealth' ? (age <= 4 ? 0.4 : age === 5 ? 0.7 : 1) : 1;
      T.cost[k] = +(v * sc * f).toFixed(1);
    }
    if (T.needs.includes('oil')) T.cost.oil = +(2 * sc / 30).toFixed(1);
    T.upkeep = { wealth: age === 0 ? 0 : +(0.012 * sc * (L.domain === 'land' ? 1 : 1.6)).toFixed(3), food: +(T.pop * 0.05).toFixed(3) };
    if (T.needs.includes('oil') || age >= 7 && L.domain !== 'land') T.upkeep.oil = +(0.01 * sc).toFixed(3);
    UNITS[T.id] = T;
  }
}
for (const [id, line, age, name, tech, o, k] of VARIANTS) {
  const B = UNITS[line + age] || UNITS[line + (age - 1)];
  const T = { ...B, id, name, tech, variant: true, needs: o.needs || [], speed: o.speed || B.speed, range: o.range ?? B.range, sym: o.sym || B.sym, antiArmor: !!(o.antiArmor || B.antiArmor), aa: !!(o.aa || B.aa),
    atk: +(B.atk * k.atk).toFixed(2), def: +(B.def * k.def).toFixed(2), hp: Math.round(B.hp * k.hp), cost: {}, upkeep: { ...B.upkeep } };
  for (const [r, v] of Object.entries(B.cost)) T.cost[r] = +(v * k.cost).toFixed(1);
  UNITS[id] = T;
}
// main tier and regional alternatives of a line a nation knows, newest first
export function lineOptions(N, line) {
  const out = [];
  const b = bestOf(N, line); if (b) out.push(b);
  for (const [id, l, age, , tech] of VARIANTS) if (l === line && age <= N.age && N.techs[tech] && (!b || age >= UNITS[b].age - 1)) out.push(id);
  return out;
}
export const LINE_OF = id => UNITS[id]?.line;
// best unit of a line a nation can field, given techs (ignores resources)
export function bestOf(N, line) {
  const L = LINES[line]; let best = null;
  for (const [age, , tech] of L.tiers) if (age <= N.age && (!tech || N.techs[tech])) best = line + age;
  return best;
}

// ------------------------------------------------------------------ settlements
export const SETTLEMENTS = [
  { name: 'Wilderness', housing: 0.8, tech: null },
  { name: 'Camp', housing: 3, tech: null },
  { name: 'Village', housing: 12, tech: 'agriculture', cost: { food: 8, wood: 6 }, days: 10 },
  { name: 'Town', housing: 45, tech: 'urbanism', cost: { food: 25, wood: 25, stone: 25, wealth: 10 }, days: 18 },
  { name: 'City', housing: 200, tech: 'civil_engineering', cost: { food: 120, wood: 120, stone: 180, metal: 40, wealth: 120 }, days: 30 },
  { name: 'Metropolis', housing: 1300, tech: 'railroad', cost: { food: 900, wood: 300, stone: 600, metal: 1600, wealth: 2400 }, days: 45 },
  { name: 'Megalopolis', housing: 7000, tech: 'mass_transit', cost: { food: 4000, stone: 2500, metal: 14000, wealth: 25000 }, days: 60 },
];

// ------------------------------------------------------------------ buildings
// levels: [name, tech, minimum settlement level]. cost: base resources (scaled by the age of the level's technology).
export const BUILDINGS = {
  granary: { name: 'Granary', cat: 'growth', levels: [['Granary', 'pottery', 1], ['Storehouses', 'preservation', 2], ['Grain Silos', 'refrigeration', 4]], cost: { wood: 5, stone: 3 }, days: 8, desc: 'Faster growth and protection against famine.' },
  temple: { name: 'Temple', cat: 'faith', levels: [['Shrine', 'mysticism', 1], ['Temple', 'priesthood', 2], ['Great Temple', 'monotheism', 3]], cost: { wood: 4, stone: 6, wealth: 2 }, days: 10, desc: 'Stability, culture and a little learning.' },
  walls: { name: 'Fortifications', cat: 'defense', levels: [['Palisade', 'palisades', 1], ['Stone Walls', 'masonry', 2], ['Castle', 'castles', 3], ['Star Fort', 'fortification', 3], ['Bunkers', 'trench_warfare', 3]], cost: { wood: 5, stone: 7 }, days: 12, desc: 'Defense, garrison strength and slower sieges.' },
  barracks: { name: 'Barracks', cat: 'military', levels: [['War Lodge', 'warrior_code', 1], ['Barracks', 'professional_army', 2], ['Garrison Depot', 'conscription', 3], ['Training Command', 'combined_arms', 3]], cost: { wood: 6, stone: 2, wealth: 2 }, days: 9, desc: 'More land production lines and faster training.' },
  harbor: { name: 'Harbor', cat: 'naval', levels: [['Landing', 'rafts', 1], ['Harbor', 'sailing', 2], ['Port', 'navigation', 3], ['Naval Base', 'steam_engine', 3]], cost: { wood: 8, stone: 3 }, days: 10, coastal: true, desc: 'Shipbuilding lines, fisheries and trade.' },
  market: { name: 'Market', cat: 'economy', levels: [['Bazaar', 'trade', 2], ['Market', 'currency', 2], ['Bank', 'banking', 3], ['Stock Exchange', 'corporations', 4]], cost: { wood: 5, stone: 5, wealth: 4 }, days: 10, desc: 'Wealth from commerce.' },
  library: { name: 'Learning', cat: 'science', levels: [['Library', 'writing', 2], ['Academy of Scholars', 'philosophy', 3], ['University', 'education', 3], ['Research Lab', 'scientific_method', 4], ['Research Institute', 'computers', 4]], cost: { wood: 4, stone: 6, wealth: 5 }, days: 14, desc: 'Knowledge and research.' },
  workshop: { name: 'Industry', cat: 'industry', levels: [['Workshops', 'bronze_working', 2], ['Guild Halls', 'guilds', 3], ['Manufactories', 'printing_press', 3], ['Factories', 'industrialization', 4], ['Assembly Lines', 'mass_production', 4], ['Automated Plants', 'robotics', 5]], cost: { wood: 6, stone: 4, metal: 2, wealth: 3 }, days: 14, desc: 'Production speed, materials and wealth. Factories draw energy.' },
  aqueduct: { name: 'Water & Sanitation', cat: 'growth', levels: [['Aqueduct', 'engineering', 3], ['Sewers', 'sanitation', 4], ['Utilities Grid', 'electricity', 4]], cost: { stone: 10, wealth: 4 }, days: 16, desc: 'Raises the population ceiling.' },
  power: { name: 'Power Plants', cat: 'energy', levels: [['Coal Plant', 'electricity', 3], ['Hydroelectric Dam', 'electricity', 3], ['Oil Plant', 'refining', 3], ['Nuclear Plant', 'nuclear_power', 4], ['Solar Farms', 'renewables', 3], ['Fusion Reactor', 'fusion', 4]], cost: { stone: 4, metal: 6, wealth: 6 }, days: 20, desc: 'Electricity for cities and industry.' },
  academy: { name: 'Military Academy', cat: 'military', levels: [['War College', 'military_science', 3], ['Staff College', 'combined_arms', 4]], cost: { stone: 6, wealth: 8 }, days: 18, desc: 'Units trained here gain experience far faster.' },
  airfield: { name: 'Airfield', cat: 'military', levels: [['Airstrip', 'flight', 2], ['Air Base', 'radar', 3], ['Air Command', 'jet_propulsion', 4]], cost: { stone: 6, metal: 6, wealth: 8 }, days: 18, desc: 'Aircraft production lines and basing.' },
  datacenter: { name: 'AI Datacenter', cat: 'science', levels: [['Server Farm', 'computers', 4], ['Datacenter', 'internet', 4], ['AI Cluster', 'machine_learning', 5], ['Superintelligence Lab', 'artificial_intelligence', 5]], cost: { metal: 8, wealth: 12 }, days: 24, desc: 'Massive research output. Draws heavy power.' },
  nuclear: { name: 'Nuclear Program', cat: 'strategic', levels: [['Enrichment Site', 'nuclear_fission', 4], ['Weapons Complex', 'nuclear_weapons', 4], ['Thermonuclear Plant', 'thermonuclear', 4]], cost: { metal: 10, wealth: 18 }, days: 40, desc: 'Produces nuclear warheads.' },
};
export const BUILD_ORDER = ['granary', 'temple', 'walls', 'barracks', 'harbor', 'market', 'library', 'workshop', 'aqueduct', 'power', 'academy', 'airfield', 'datacenter', 'nuclear'];

// ------------------------------------------------------------------ wonders (one of each in the world)
export const WONDERS = {
  stonehenge: { name: 'Stonehenge', tech: 'mysticism', cost: { stone: 30, wood: 20, food: 20 }, days: 40, fx: { stability: 0.01, research: 0.08 }, desc: '+8% research, +stability. The sky-calendar of the ancients.' },
  pyramids: { name: 'Great Pyramid', tech: 'masonry_monuments', cost: { stone: 160, wood: 40, food: 80, wealth: 30 }, days: 80, fx: { build: 0.25 }, desc: 'Construction 25% faster.' },
  gardens: { name: 'Hanging Gardens', tech: 'irrigation', cost: { stone: 90, wood: 60, food: 120, wealth: 40 }, days: 70, fx: { popGrowth: 0.3, food: 0.06 }, desc: 'Faster population growth, +6% food.' },
  colossus: { name: 'Colossus', tech: 'bronze_casting', cost: { metal: 60, stone: 60, wealth: 80 }, days: 70, fx: { wealth: 0.1, tradeBonus: 0.1 }, desc: '+10% wealth and better trade terms.' },
  library_alex: { name: 'Great Library', tech: 'literature', cost: { stone: 180, wood: 90, wealth: 220 }, days: 90, fx: { research: 0.15 }, desc: '+15% research.' },
  great_wall: { name: 'Great Wall', tech: 'construction', cost: { stone: 450, wood: 120, wealth: 160 }, days: 120, fx: { garrison: 0.5, defLand: 0.08 }, desc: 'Every settlement garrison is 50% stronger. +8% land defense.' },
  colosseum: { name: 'Colosseum', tech: 'construction', cost: { stone: 300, wealth: 250 }, days: 90, fx: { stability: 0.012, approval: 0.05 }, desc: 'Bread and circuses: stability and approval.' },
  hagia_sophia: { name: 'Hagia Sophia', tech: 'theology', cost: { stone: 700, metal: 120, wealth: 600 }, days: 110, fx: { stability: 0.012, pc: 0.25 }, desc: 'Stability and political capital.' },
  forbidden_city: { name: 'Forbidden City', tech: 'feudalism', cost: { stone: 800, wood: 400, wealth: 800 }, days: 120, fx: { pc: 0.35, lawCost: -0.2 }, desc: 'Laws are cheaper; political capital flows.' },
  notre_dame: { name: 'Notre-Dame', tech: 'monotheism', cost: { stone: 900, wealth: 700 }, days: 120, fx: { approval: 0.06, stability: 0.008 }, desc: 'Approval and stability.' },
  taj_mahal: { name: 'Taj Mahal', tech: 'humanism', cost: { stone: 2600, wealth: 3000 }, days: 120, fx: { approval: 0.06, pc: 0.3 }, desc: 'Approval and political capital.' },
  versailles: { name: 'Versailles', tech: 'divine_right', cost: { stone: 3000, wealth: 4200 }, days: 130, fx: { diplo: 0.2, pc: 0.3 }, desc: 'Diplomatic prestige and political capital.' },
  eiffel: { name: 'Eiffel Tower', tech: 'steel', cost: { metal: 9000, wealth: 12000 }, days: 120, fx: { diplo: 0.15, wealth: 0.06 }, desc: 'Diplomatic prestige and tourism wealth.' },
  liberty: { name: 'Statue of Liberty', tech: 'democracy', cost: { metal: 7000, wealth: 14000 }, days: 120, fx: { approval: 0.06, popGrowth: 0.25 }, desc: 'Immigrants flock to your shores: growth and approval.' },
  manhattan: { name: 'Manhattan Project', tech: 'nuclear_fission', cost: { metal: 60000, wealth: 120000 }, days: 140, fx: { warheads: 1 }, desc: 'Doubles warhead production.' },
  apollo: { name: 'Apollo Program', tech: 'space_flight', cost: { metal: 120000, wealth: 260000 }, days: 160, fx: { research: 0.15, diplo: 0.1 }, desc: '+15% research and world prestige.' },
  internet: { name: 'World Wide Web', tech: 'internet', cost: { metal: 200000, wealth: 500000 }, days: 150, fx: { research: 0.2, wealth: 0.08 }, desc: '+20% research, +8% wealth.' },
  colony_ship: { name: 'Interstellar Colony Ship', tech: 'interstellar_travel', cost: { metal: 160000, wealth: 320000 }, days: 200, fx: {}, victory: true, desc: 'Humanity leaves the cradle. Completing it wins a science victory.' },
};

// game speeds: game hours per real second
export const SPEEDS = [0, 2, 6, 16, 40, 96];
export const FOOD_PER_K = 0.05; // food eaten per thousand people per day
