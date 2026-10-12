// Technology tree. Effects are folded into a nation's modifiers (see gov.js computeMods).
// cost: research points. req: prerequisite tech ids. fx: modifier deltas. unlock: features.
export const BRANCHES = [
  { id: 'agr', name: 'Agriculture', color: '#7ed957' },
  { id: 'en', name: 'Energy', color: '#ffc35a' },
  { id: 'ind', name: 'Industry', color: '#e8955a' },
  { id: 'soc', name: 'Society', color: '#c49bff' },
  { id: 'cmp', name: 'Computing & AI', color: '#57d2ff' },
  { id: 'mil', name: 'Land Warfare', color: '#ff7a6b' },
  { id: 'nav', name: 'Naval', color: '#5aa2ff' },
  { id: 'aer', name: 'Aerospace', color: '#9fe3ff' },
  { id: 'nuc', name: 'Nuclear', color: '#ffe14d' },
];

const T = [];
const t = (id, branch, tier, name, cost, req, fx, desc, unlock) => T.push({ id, branch, tier, name, cost, req, fx: fx || {}, desc, unlock: unlock || null });

// Agriculture
t('agr1', 'agr', 1, 'Mechanized Farming', 300, [], { food: 0.1 }, 'Tractors and combines everywhere. +10% food.');
t('agr2', 'agr', 2, 'Fertilizer Synthesis', 650, ['agr1'], { food: 0.12 }, 'Industrial nitrogen. +12% food.');
t('agr3', 'agr', 3, 'Precision Irrigation', 1100, ['agr2', 'cmp1'], { food: 0.12, energyCons: -0.03 }, 'Sensor-driven water use. +12% food.');
t('agr4', 'agr', 4, 'Engineered Crops', 1900, ['agr3', 'soc2'], { food: 0.18 }, 'Drought- and pest-resistant crops. +18% food.');
t('agr5', 'agr', 5, 'Vertical Farming', 3200, ['agr4', 'cmp3'], { food: 0.2, farmMax: 2 }, 'Food towers in every city. +20% food, farms up to level 10.');
// Energy
t('en1', 'en', 1, 'Smart Grid', 350, [], { energyCons: -0.08 }, 'Demand balancing. -8% energy use.');
t('en2', 'en', 2, 'Advanced Solar', 700, ['en1'], { power: 0.15 }, 'High-efficiency panels. +15% power plant output.');
t('en3', 'en', 2, 'Unconventional Extraction', 650, ['en1'], { oil: 0.25 }, 'Shale and deep-water fields. +25% oil output.');
t('en4', 'en', 3, 'Fission Reactors', 1300, ['en2'], { power: 0.25 }, 'Next-generation reactors. +25% power.');
t('en5', 'en', 4, 'Grid-Scale Storage', 2000, ['en4', 'ind2'], { power: 0.1, energyCons: -0.08 }, 'Batteries smooth supply. +10% power, -8% use.');
t('en6', 'en', 5, 'Fusion Power', 5000, ['en5', 'cmp4'], { power: 0.6 }, 'Limitless clean energy. +60% power.');
// Industry
t('ind1', 'ind', 1, 'Automation', 500, [], { prod: 0.1, build: 0.05 }, '+10% military production, +5% construction speed.');
t('ind2', 'ind', 2, 'Advanced Materials', 900, ['ind1'], { buildCost: -0.1 }, 'Composites and alloys. -10% construction cost.');
t('ind3', 'ind', 3, 'Robotics', 1700, ['ind2', 'cmp2'], { prod: 0.2, manpower: 0.15 }, 'Robot assembly lines. +20% production, +15% manpower.');
t('ind4', 'ind', 4, 'Additive Manufacturing', 2600, ['ind3'], { build: 0.25, upkeep: -0.08 }, '3D-printed everything. +25% construction speed, -8% upkeep.');
t('ind5', 'ind', 5, 'Nanofabrication', 4200, ['ind4', 'cmp4'], { prod: 0.3, income: 0.08 }, 'Molecular manufacturing. +30% production, +8% income.');
// Society
t('soc1', 'soc', 1, 'Mass Higher Education', 400, [], { research: 0.1 }, '+10% research.');
t('soc2', 'soc', 2, 'Universal Healthcare', 700, ['soc1'], { popGrowth: 0.4, stability: 0.02 }, 'Healthier, happier people. Faster population growth.');
t('soc3', 'soc', 2, 'Financial Markets', 700, ['soc1'], { income: 0.06 }, '+6% income.');
t('soc4', 'soc', 3, 'Information Operations', 900, ['soc1'], { stability: 0.03, exhaustion: -0.25 }, 'Shape the narrative. Higher stability, less war-weariness.');
t('soc5', 'soc', 4, 'Social Safety Net', 1800, ['soc2', 'soc3'], { stability: 0.04, approval: 0.05 }, 'Unrest rarely boils over.');
t('soc6', 'soc', 3, 'Military Academies', 800, ['soc1'], { xp: 0.5 }, '+50% training speed. Unlocks the Military Academy building.', 'academy');
// Computing & AI
t('cmp1', 'cmp', 1, 'Supercomputing', 500, [], { research: 0.1 }, '+10% research.');
t('cmp2', 'cmp', 2, 'Machine Learning', 1000, ['cmp1'], { research: 0.15 }, '+15% research. Unlocks AI Datacenters.', 'datacenter');
t('cmp3', 'cmp', 3, 'Autonomous Systems', 1800, ['cmp2'], { atk: 0.08, upkeep: -0.1 }, 'Drone swarms. +8% attack, -10% upkeep.');
t('cmp4', 'cmp', 4, 'Artificial General Intelligence', 5500, ['cmp3', 'soc1'], { research: 0.4, income: 0.1, build: 0.15 }, 'A national AGI program. +40% research, +10% income.');
t('cmp5', 'cmp', 3, 'Cyber Warfare', 1400, ['cmp2'], { covert: 0.25 }, 'Unlocks cyber attacks against rival infrastructure.', 'cyber');
t('cmp6', 'cmp', 5, 'Superintelligence Alignment', 7000, ['cmp4'], { research: 0.5, stability: 0.04 }, 'Safe recursive self-improvement. +50% research.');
// Land warfare
t('mil1', 'mil', 1, 'Modern Doctrine', 400, [], { atkLand: 0.08 }, '+8% land attack.');
t('mil2', 'mil', 2, 'Combined Arms', 850, ['mil1'], { defLand: 0.1, atkLand: 0.05 }, '+10% land defense, +5% attack.');
t('mil3', 'mil', 3, 'Precision Munitions', 1300, ['mil2', 'cmp1'], { atk: 0.1 }, '+10% attack for all forces.');
t('mil4', 'mil', 3, 'Mechanized Logistics', 1100, ['mil2'], { speedLand: 0.2 }, '+20% land movement speed.');
t('mil5', 'mil', 4, 'Powered Exoskeletons', 2400, ['mil3', 'ind3'], { hpLand: 0.25 }, 'Infantry hit points +25%.');
t('mil6', 'mil', 4, 'Missile Defense', 2800, ['mil3', 'aer2'], { intercept: 0.4 }, '40% chance to intercept incoming nuclear strikes.');
// Naval
t('nav1', 'nav', 1, 'Blue Water Navy', 500, [], { speedSea: 0.15 }, '+15% naval speed.');
t('nav2', 'nav', 2, 'Aegis Combat Systems', 1100, ['nav1'], { defSea: 0.2 }, '+20% naval defense.');
t('nav3', 'nav', 2, 'Silent Running', 1100, ['nav1'], { subAtk: 0.25 }, 'Submarines +25% attack.');
t('nav4', 'nav', 3, 'Supercarriers', 2300, ['nav2'], { atkSea: 0.15 }, '+15% naval attack.');
t('nav5', 'nav', 4, 'Railguns', 3200, ['nav4', 'en4'], { atkSea: 0.25 }, '+25% naval attack.');
// Aerospace
t('aer1', 'aer', 1, 'Fifth-Generation Fighters', 550, [], { atkAir: 0.1 }, '+10% air attack.');
t('aer2', 'aer', 2, 'Satellite Reconnaissance', 950, ['aer1'], { atk: 0.04, covert: 0.1 }, 'Eyes in orbit. +4% attack, better intelligence.');
t('aer3', 'aer', 3, 'Ballistic Missiles', 1700, ['aer2'], {}, 'ICBMs: deliver warheads anywhere on Earth.', 'icbm');
t('aer4', 'aer', 3, 'Stealth Airframes', 2000, ['aer1', 'ind2'], { defAir: 0.3 }, '+30% air defense.');
t('aer5', 'aer', 4, 'Hypersonic Weapons', 3200, ['aer3', 'mil3'], { atk: 0.08, pierce: 0.5 }, 'Halves enemy missile-defense effectiveness.');
// Nuclear
t('nuc1', 'nuc', 2, 'Uranium Enrichment', 1500, ['en4'], {}, 'Unlocks the Nuclear Program facility.', 'nuclear');
t('nuc2', 'nuc', 3, 'Nuclear Weapons', 2600, ['nuc1'], {}, 'Nuclear Program facilities produce warheads.', 'warheads');
t('nuc3', 'nuc', 4, 'Thermonuclear Weapons', 4200, ['nuc2'], { yield: 0.6 }, 'Hydrogen bombs: far greater destruction.');
t('nuc4', 'nuc', 3, 'Civil Defense', 1200, ['nuc1'], { shelter: 0.4 }, 'Shelters reduce nuclear casualties by 40%.');

export const TECHS = T;
export const TECH = Object.fromEntries(T.map(x => [x.id, x]));

export function canResearch(N, id) {
  const x = TECH[id];
  if (!x || N.techs[id]) return false;
  return x.req.every(r => N.techs[r]);
}
export function available(N) { return T.filter(x => canResearch(N, x.id)); }
export function has(N, unlock) { return T.some(x => x.unlock === unlock && N.techs[x.id]); }

// starting techs by development level (tier reached in each branch)
export function startingTechs(n, perCap) {
  const techs = {};
  let tier = perCap > 45000 ? 3 : perCap > 20000 ? 2 : perCap > 8000 ? 1 : perCap > 3000 ? 1 : 0;
  if (n.major && tier < 2) tier++;
  const giveTier = (lim, branches) => { for (const x of T) if (x.tier <= lim && (!branches || branches.includes(x.branch)) && x.branch !== 'nuc' && x.id !== 'cmp4' && x.id !== 'cmp6') techs[x.id] = 1; };
  if (tier) giveTier(tier);
  // prune: keep only those whose prerequisites are also present
  let changed = true;
  while (changed) { changed = false; for (const id of Object.keys(techs)) if (!TECH[id].req.every(r => techs[r])) { delete techs[id]; changed = true; } }
  return techs;
}
// Present-day nuclear states (warheads are scaled game units, not real counts)
export const NUCLEAR_STATES = { USA: 40, RUS: 44, CHN: 12, GBR: 6, FRA: 7, IND: 4, PAK: 4, PRK: 2, LEV: 2 };
