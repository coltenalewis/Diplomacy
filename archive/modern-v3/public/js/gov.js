// Government simulation: regime types, laws, cabinet & generals, modifiers, politics and narrative events.
import { TECHS, TECH } from './tech.js';
import { NATION } from './nations.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[(Math.random() * a.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ regimes
export const GOV_TYPES = {
  parliamentary: { name: 'Parliamentary Democracy', pc: 1.0, lawCost: 1.25, election: 4, democratic: true, fx: { research: 0.05, income: 0.03, diplo: 0.1 } },
  presidential: { name: 'Presidential Republic', pc: 1.1, lawCost: 1.15, election: 4, democratic: true, fx: { income: 0.03 } },
  constmon: { name: 'Constitutional Monarchy', pc: 1.0, lawCost: 1.2, election: 5, democratic: true, fx: { stability: 0.01, diplo: 0.05 } },
  absmon: { name: 'Absolute Monarchy', pc: 1.3, lawCost: 0.8, election: 0, fx: { stability: 0.01, research: -0.05 } },
  oneparty: { name: 'One-Party State', pc: 1.4, lawCost: 0.7, election: 0, fx: { prod: 0.08, research: -0.03, covert: 0.15 } },
  autocracy: { name: 'Authoritarian Republic', pc: 1.3, lawCost: 0.75, election: 6, fx: { covert: 0.1, exhaustion: -0.15 } },
  junta: { name: 'Military Junta', pc: 1.2, lawCost: 0.6, election: 0, fx: { atk: 0.08, income: -0.08, xp: 0.3 } },
  technocracy: { name: 'Technocracy', pc: 1.0, lawCost: 1.0, election: 0, fx: { research: 0.2, build: 0.1, stability: -0.01 } },
};
const REGIME = {
  constmon: 'GBR JPN ESP NLD BEL NOR SWE DNK CAN AUS NZL THA MYS MAR',
  absmon: 'SAU ARE OMN',
  oneparty: 'CHN PRK VNM LAO CUB',
  autocracy: 'RUS BLR IRN EGY KAZ UZB TKM TRC SYR AFG DZA',
  junta: 'MMR MLI NER SDN TCD GIN',
  parliamentary: 'DEU ITA IRL ISL GRC PRT CZE AUT HUN HRV SRB ALB BGR ROU FIN BLT LEV IND PAK NPL LKA ZAF BWA NAM ETH',
};
export function regimeOf(code) { for (const [k, v] of Object.entries(REGIME)) if (v.split(' ').includes(code)) return k; return 'presidential'; }

// ------------------------------------------------------------------ laws
// Each category: options with modifier deltas; `req` gates availability.
export const LAWS = {
  conscription: { name: 'Conscription', def: 1, opts: [
    { id: 'volunteer', name: 'Volunteer Force', desc: 'Professional military only.', fx: { manpower: -0.4, approval: 0.03, xp: 0.2 } },
    { id: 'selective', name: 'Selective Service', desc: 'Standard peacetime levels.', fx: {} },
    { id: 'draft', name: 'Universal Draft', desc: 'All citizens serve.', fx: { manpower: 0.8, approval: -0.04, income: -0.03 } },
    { id: 'total', name: 'Total Mobilization', desc: 'Every resource to the war effort. Wartime only.', fx: { manpower: 2.0, prod: 0.2, income: -0.12, approval: -0.1 }, req: 'war' }] },
  tax: { name: 'Taxation', def: 1, opts: [
    { id: 'low', name: 'Low Taxes', desc: 'Popular, but the treasury suffers.', fx: { income: -0.12, approval: 0.05 } },
    { id: 'standard', name: 'Standard Taxes', desc: '', fx: {} },
    { id: 'high', name: 'High Taxes', desc: 'More revenue, less goodwill.', fx: { income: 0.12, approval: -0.05 } },
    { id: 'war', name: 'War Economy', desc: 'Emergency levies. Wartime only.', fx: { income: 0.22, approval: -0.08 }, req: 'war' }] },
  research: { name: 'Research Funding', def: 1, opts: [
    { id: 'minimal', name: 'Minimal', desc: '1% of income to research.', fx: { researchShare: 0.01 } },
    { id: 'standard', name: 'Standard', desc: '4% of income to research.', fx: { researchShare: 0.04 } },
    { id: 'high', name: 'High', desc: '9% of income to research.', fx: { researchShare: 0.09, approval: -0.01 } },
    { id: 'moonshot', name: 'Moonshot', desc: '18% of income: a national crusade for science.', fx: { researchShare: 0.18, research: 0.1, approval: -0.03 } }] },
  trade: { name: 'Trade Policy', def: 1, opts: [
    { id: 'free', name: 'Free Trade', desc: 'Better terms abroad, more goodwill.', fx: { tradeBonus: 0.1, diplo: 0.1 } },
    { id: 'managed', name: 'Managed Trade', desc: '', fx: {} },
    { id: 'protect', name: 'Protectionism', desc: 'Shield domestic industry.', fx: { income: 0.03, tradeBonus: -0.2, diplo: -0.1 } }] },
  industry: { name: 'Industrial Policy', def: 0, opts: [
    { id: 'balanced', name: 'Balanced Growth', desc: '', fx: {} },
    { id: 'heavy', name: 'Heavy Industry', desc: 'Steel, shipyards and munitions.', fx: { prod: 0.2, income: -0.04 } },
    { id: 'consumer', name: 'Consumer Economy', desc: 'Prosperity at home.', fx: { income: 0.06, prod: -0.1, approval: 0.03 } },
    { id: 'green', name: 'Green Transition', desc: 'Efficiency and renewables.', fx: { energyCons: -0.15, buildCost: 0.1, approval: 0.02 } },
    { id: 'tech', name: 'Tech Sector', desc: 'Software, chips and AI.', fx: { research: 0.15, income: 0.02, buildCost: 0.05 } }] },
  liberty: { name: 'Civil Liberties', def: 1, opts: [
    { id: 'open', name: 'Open Society', desc: 'Free press, free minds.', fx: { approval: 0.06, stability: -0.01, research: 0.05, covert: -0.2 } },
    { id: 'standard', name: 'Rule of Law', desc: '', fx: {} },
    { id: 'surveillance', name: 'Surveillance State', desc: 'Watch everyone.', fx: { stability: 0.02, approval: -0.06, covert: 0.25 } },
    { id: 'martial', name: 'Martial Law', desc: 'Soldiers in the streets. Requires war or an authoritarian regime.', fx: { stability: 0.05, approval: -0.15, income: -0.12 }, req: 'martial' }] },
  doctrine: { name: 'Military Doctrine', def: 1, opts: [
    { id: 'defensive', name: 'Defense in Depth', desc: '', fx: { defLand: 0.15, def: 0.05 } },
    { id: 'balanced', name: 'Balanced Forces', desc: '', fx: {} },
    { id: 'offensive', name: 'Offensive Spirit', desc: '', fx: { atk: 0.1 } },
    { id: 'maneuver', name: 'Rapid Maneuver', desc: 'Speed is armor.', fx: { speedLand: 0.25, atkLand: 0.05, def: -0.05 } }] },
  nuclear: { name: 'Nuclear Posture', def: 2, opts: [
    { id: 'disarm', name: 'Disarmament', desc: 'No warheads are produced. The world approves.', fx: { diplo: 0.15 } },
    { id: 'nfu', name: 'No First Use', desc: 'Retaliation only.', fx: { diplo: 0.05 } },
    { id: 'deterrence', name: 'Deterrence', desc: 'Ambiguity keeps rivals honest.', fx: {} },
    { id: 'low', name: 'Launch on Warning', desc: 'Guaranteed retaliation, constant tension.', fx: { stability: -0.01, diplo: -0.1 } }] },
  ai: { name: 'AI Governance', def: 1, opts: [
    { id: 'restricted', name: 'Restricted', desc: 'Strict limits on frontier AI.', fx: { stability: 0.01, research: -0.05 } },
    { id: 'regulated', name: 'Regulated', desc: '', fx: {} },
    { id: 'accelerate', name: 'Accelerate', desc: 'Full speed on AI. Datacenters double output.', fx: { research: 0.1, aiBoost: 1, stability: -0.01 } }] },
  welfare: { name: 'Social Welfare', def: 1, opts: [
    { id: 'minimal', name: 'Minimal State', desc: '', fx: { income: 0.04, approval: -0.05 } },
    { id: 'standard', name: 'Standard', desc: '', fx: {} },
    { id: 'generous', name: 'Generous Welfare', desc: '', fx: { approval: 0.07, income: -0.05, popGrowth: 0.3 } }] },
};
export function lawOpt(N, cat) { const L = LAWS[cat]; return L.opts.find(o => o.id === N.gov.laws[cat]) || L.opts[L.def]; }

// ------------------------------------------------------------------ characters
const NAMES = {
  anglo: ['James Carter|Sarah Whitfield|Michael Brennan|Emily Hawthorne|Robert Ashford|Laura Kensington|David Mercer|Grace Holloway|Thomas Reid|Olivia Barnes|Daniel Pryce|Hannah Cole'],
  hisp: ['Carlos Medina|Lucia Fernandez|Javier Ortega|Isabel Navarro|Diego Ramirez|Camila Torres|Andres Salazar|Valentina Ruiz|Mateo Herrera|Sofia Castillo'],
  luso: ['Joao Almeida|Ana Ribeiro|Pedro Carvalho|Mariana Costa|Rafael Moreira|Beatriz Lopes|Tiago Martins|Juliana Pereira'],
  fr: ['Antoine Laurent|Claire Dubois|Julien Marchand|Sophie Lefevre|Mathieu Girard|Camille Rousseau|Nicolas Fontaine|Elise Moreau|Amadou Diallo|Fatou Ndiaye'],
  de: ['Klaus Weber|Anna Becker|Stefan Hoffmann|Katrin Schulz|Matthias Richter|Julia Wagner|Lukas Brandt|Hanna Vogel|Pieter de Vries|Sanne Jansen'],
  nord: ['Erik Lindqvist|Ingrid Halvorsen|Lars Nyberg|Astrid Dahl|Mikael Virtanen|Sofie Nielsen|Henrik Berg|Freya Johansson'],
  slav: ['Dmitri Sokolov|Elena Morozova|Pavel Kuznetsov|Irina Volkova|Andrei Petrov|Natalia Orlova|Tomasz Nowak|Katarzyna Wojcik|Oleksandr Bondarenko|Milan Novak'],
  it: ['Marco Rossi|Giulia Bianchi|Luca Ferrari|Francesca Romano|Alessandro Conti|Chiara Esposito|Giorgos Papadakis|Eleni Nikolaou'],
  arab: ['Omar Haddad|Layla Mansour|Khalid Nasser|Yasmin Farouk|Tariq Al-Amin|Nour Saleh|Hassan Karim|Rania Aziz|Faisal Rahman|Samir Khoury'],
  pers: ['Reza Tehrani|Shirin Ahmadi|Kamran Rostami|Parisa Karimi|Dariush Farahani|Leila Moradi'],
  turk: ['Mehmet Yilmaz|Ayse Demir|Emre Kaya|Zeynep Celik|Nurlan Abenov|Aigerim Sadykova|Rustam Karimov|Dilnoza Yusupova'],
  sas: ['Arjun Rao|Priya Sharma|Vikram Singh|Ananya Iyer|Rahul Mehta|Kavya Nair|Imran Qureshi|Ayesha Malik|Suresh Perera'],
  zh: ['Li Wei|Wang Fang|Zhang Hao|Liu Yang|Chen Jie|Zhao Min|Huang Lei|Lin Mei|Xu Bo'],
  kr: ['Kim Min-jun|Park Ji-woo|Lee Seo-yeon|Choi Hyun-woo|Jung Ha-eun|Kang Dong-hyun'],
  jp: ['Takeshi Yamamoto|Yuki Tanaka|Hiroshi Watanabe|Aiko Nakamura|Kenji Kobayashi|Sakura Ito|Daisuke Mori'],
  sea: ['Nguyen Van Minh|Tran Thi Lan|Somchai Wongsa|Siti Rahayu|Budi Santoso|Maria Santos|Jose Reyes|Aung Kyaw|Dewi Lestari'],
  afr: ['Chinedu Okafor|Amara Nwosu|Kwame Mensah|Akosua Boateng|Juma Otieno|Wanjiru Kamau|Sipho Ndlovu|Thandiwe Dlamini|Tesfaye Bekele|Abebe Girma'],
};
const CULTURE = {
  anglo: 'USA CAN GBR IRL AUS NZL', hisp: 'MEX CAM PAN CUB DOM COL VEN ECU PER BOL PRY URY ARG CHL ESP', luso: 'BRA PRT AGO MOZ',
  fr: 'FRA BEL CHE SEN CIV GIN MLI NER TCD CAF GAB MDG MRT', de: 'DEU AUT NLD', nord: 'DNK NOR SWE FIN ISL', slav: 'RUS UKR BLR POL CZE SRB HRV BGR BLT',
  it: 'ITA GRC ALB ROU HUN', arab: 'EGY SAU IRQ SYR LEV ARE OMN YEM LBY TUN DZA MAR SDN SOM', pers: 'IRN AFG', turk: 'TUR KAZ UZB TKM TRC MNG',
  sas: 'IND PAK NPL LKA', zh: 'CHN TWN', kr: 'KOR PRK', jp: 'JPN', sea: 'VNM THA LAO KHM MMR MYS IDN PHL PNG',
};
const cultureOf = c => Object.entries(CULTURE).find(([, v]) => v.split(' ').includes(c))?.[0] || 'afr';

export const ROLES = {
  defense: { name: 'Minister of Defense', short: 'Defense', fx: s => ({ prod: s * 0.025, upkeep: -s * 0.01 }), blurb: 'Military production and procurement.' },
  finance: { name: 'Minister of Finance', short: 'Finance', fx: s => ({ income: s * 0.012 }), blurb: 'Revenue and the treasury.' },
  industry: { name: 'Minister of Industry', short: 'Industry', fx: s => ({ build: s * 0.03, buildCost: -s * 0.01 }), blurb: 'Infrastructure construction.' },
  science: { name: 'Minister of Science', short: 'Science', fx: s => ({ research: s * 0.03 }), blurb: 'Research and technology.' },
  foreign: { name: 'Foreign Minister', short: 'Foreign', fx: s => ({ diplo: s * 0.05 }), blurb: 'Diplomacy and trade deals.' },
  interior: { name: 'Minister of Interior', short: 'Interior', fx: s => ({ stability: s * 0.002, pc: s * 0.06 }), blurb: 'Public order and political capital.' },
  intel: { name: 'Director of Intelligence', short: 'Intelligence', fx: s => ({ covert: s * 0.05 }), blurb: 'Espionage and counter-intelligence.' },
};
export const CABINET = Object.keys(ROLES);

export const TRAITS = {
  Visionary: { desc: 'Role bonus x1.4', mult: 1.4 },
  Corrupt: { desc: '-3% income, +PC', fx: { income: -0.03, pc: 0.15 } },
  Hawk: { desc: '+4% attack, worse diplomacy', fx: { atk: 0.04, diplo: -0.1 } },
  Dove: { desc: 'Better diplomacy, less war-weariness', fx: { diplo: 0.12, exhaustion: -0.1 } },
  Reformer: { desc: 'Laws cost 20% less', fx: { lawCost: -0.2 } },
  Populist: { desc: '+3% approval', fx: { approval: 0.03 } },
  Technocrat: { desc: '+6% research', fx: { research: 0.06 } },
  Loyalist: { desc: 'Never plots against you', loyal: true },
  Ambitious: { desc: 'Talented but may plot a coup', mult: 1.15, ambitious: true },
  Logistician: { desc: 'General: +20% speed', gen: { speed: 0.2 } },
  Aggressive: { desc: 'General: +12% attack', gen: { atk: 0.12 } },
  'Defensive Genius': { desc: 'General: +18% defense', gen: { def: 0.18 } },
  Inspiring: { desc: 'General: +60% training speed', gen: { xp: 0.6 } },
  Cautious: { desc: 'General: +10% defense, slower', gen: { def: 0.1, speed: -0.1 } },
};
const MIN_TRAITS = ['Visionary', 'Corrupt', 'Hawk', 'Dove', 'Reformer', 'Populist', 'Technocrat', 'Loyalist', 'Ambitious'];
const GEN_TRAITS = ['Logistician', 'Aggressive', 'Defensive Genius', 'Inspiring', 'Cautious', 'Ambitious', 'Loyalist'];

export function makeChar(s, nation, kind, skillBias = 0) {
  const pool = NAMES[cultureOf(nation)][0].split('|').map(x => x.split(' '));
  s.usedNames ||= {};
  let name = '';
  for (let k = 0; k < 20; k++) {
    const a = pick(pool), b = pick(pool);
    name = a.slice(0, a.length - 1).join(' ') + ' ' + b[b.length - 1];
    if (a.length === 1) name = a[0];
    if (!s.usedNames[nation + name]) break;
  }
  s.usedNames[nation + name] = 1;
  if (kind !== 'minister') name = (kind === 'admiral' ? 'Adm. ' : 'Gen. ') + name;
  const skill = clamp(Math.round(rnd(2, 8) + skillBias), 1, 10);
  const traitPool = kind === 'minister' ? MIN_TRAITS : GEN_TRAITS;
  const traits = [pick(traitPool)]; if (Math.random() < 0.35) { const t2 = pick(traitPool); if (!traits.includes(t2)) traits.push(t2); }
  const c = { id: s.cid++, name, nation, kind, skill, traits, loyalty: traits.includes('Loyalist') ? 1 : rnd(0.4, 0.95), age: Math.round(rnd(38, 68)), seed: Math.floor(Math.random() * 1e6), role: null };
  s.chars[c.id] = c;
  return c;
}
export function hireCost(c) { return 10 + c.skill * 4 + (c.traits.includes('Visionary') ? 10 : 0); }

// ------------------------------------------------------------------ setup
export function initGovernment(s, N, n) {
  const type = regimeOf(n.code);
  const laws = {}; for (const [k, L] of Object.entries(LAWS)) laws[k] = L.opts[L.def].id;
  const rich = (n.gdp || 50) * 1000 / (n.pop || 10) > 20000;
  if (rich) laws.research = 'high';
  if (type === 'oneparty' || type === 'autocracy') laws.liberty = 'surveillance';
  if (n.traits.aggression > 0.65) laws.doctrine = 'offensive';
  if (n.code === 'CHN' || n.code === 'USA') laws.ai = 'accelerate';
  if (['CHN', 'KOR', 'TWN', 'JPN', 'DEU'].includes(n.code)) laws.industry = 'heavy';
  N.gov = { type, laws, stability: rnd(0.55, 0.8), approval: rnd(0.45, 0.65), pc: 40, cabinet: {}, nextElection: GOV_TYPES[type].election ? Math.round(rnd(0.5, GOV_TYPES[type].election) * 365 * 24) : null, hostileUntil: 0, lawCooldown: {}, candidates: {} };
  const bias = n.major ? 1 : 0;
  for (const role of CABINET) { const ch = makeChar(s, n.code, 'minister', bias); ch.role = role; N.gov.cabinet[role] = ch.id; }
  N.generals = [];
  const gens = n.major ? 3 : 1;
  for (let k = 0; k < gens; k++) { const g = makeChar(s, n.code, k === 2 ? 'admiral' : 'general', bias); g.role = 'general'; N.generals.push(g.id); }
}

export function refreshCandidates(s, N) {
  N.gov.candidates = {};
  for (const role of [...CABINET, 'general']) N.gov.candidates[role] = [0, 1, 2].map(() => makeChar(s, N.code, role === 'general' ? (Math.random() < 0.3 ? 'admiral' : 'general') : 'minister', Math.random() < 0.3 ? 1.5 : 0).id);
  N.gov.candidatesAt = s.t;
}

// ------------------------------------------------------------------ modifiers
const BASE = () => ({ atk: 0, def: 0, atkLand: 0, defLand: 0, atkAir: 0, defAir: 0, atkSea: 0, defSea: 0, speedLand: 0, speedSea: 0, speedAir: 0, hpLand: 0, subAtk: 0,
  prod: 0, build: 0, buildCost: 0, income: 0, food: 0, power: 0, oil: 0, energyCons: 0, research: 0, manpower: 0, popGrowth: 0, upkeep: 0, xp: 0, exhaustion: 0,
  covert: 0, intercept: 0, pierce: 0, yield: 0, shelter: 0, farmMax: 0, diplo: 0, tradeBonus: 0, researchShare: 0, stability: 0, approval: 0, pc: 0, lawCost: 0, aiBoost: 0 });
const addFx = (m, fx, k = 1) => { for (const [a, v] of Object.entries(fx || {})) m[a] = (m[a] || 0) + v * k; };

export function computeMods(s, N) {
  const m = BASE();
  for (const id of Object.keys(N.techs || {})) addFx(m, TECH[id]?.fx);
  if (N.gov) {
    addFx(m, GOV_TYPES[N.gov.type].fx);
    for (const cat of Object.keys(LAWS)) addFx(m, lawOpt(N, cat).fx);
    for (const role of CABINET) {
      const ch = s.chars[N.gov.cabinet[role]]; if (!ch) continue;
      let k = 1; for (const t of ch.traits) if (TRAITS[t]?.mult) k *= TRAITS[t].mult;
      addFx(m, ROLES[role].fx((ch.skill - 4) * k));
      for (const t of ch.traits) addFx(m, TRAITS[t]?.fx);
    }
  }
  if (s.nukesUsed > 6) m.food -= Math.min(0.4, (s.nukesUsed - 6) * 0.04); // nuclear winter
  N.mods = m;
  return m;
}
// combat multipliers for a unit
export function unitMods(s, u, domain) {
  const N = s.nations[u.nation]; const m = N?.mods || BASE();
  let atk = 1 + m.atk + (domain === 'land' ? m.atkLand : domain === 'air' ? m.atkAir : m.atkSea) + (u.type === 'SUB' ? m.subAtk : 0);
  let def = 1 + m.def + (domain === 'land' ? m.defLand : domain === 'air' ? m.defAir : m.defSea);
  let speed = 1 + (domain === 'land' ? m.speedLand : domain === 'air' ? m.speedAir : m.speedSea);
  const xp = 1 + (u.xp || 0) / 250;
  atk *= xp; def *= xp;
  if (u.group) {
    const g = s.groups.find(x => x.id === u.group); const gen = g && s.chars[g.general];
    if (gen) {
      atk *= 1 + (gen.skill - 4) * 0.025; def *= 1 + (gen.skill - 4) * 0.02;
      for (const t of gen.traits) { const e = TRAITS[t]?.gen; if (e) { atk *= 1 + (e.atk || 0); def *= 1 + (e.def || 0); speed *= 1 + (e.speed || 0); } }
    }
  }
  return { atk, def, speed };
}

// ------------------------------------------------------------------ politics (daily)
export function politicsDaily(sim, N) {
  const s = sim.s, g = N.gov, m = N.mods, st = N.st, G = GOV_TYPES[g.type];
  const wars = sim.warsOf(N.code).length;
  let target = 0.55 + m.approval;
  if (N.famine > 0.05) target -= 0.2 * Math.min(1, N.famine * 3);
  if (st.eF < 0.8) target -= (0.8 - st.eF) * 0.5;
  if (st.net < 0 && N.money < 0) target -= 0.1;
  target -= N.exhaustion * (G.democratic ? 0.5 : 0.25);
  if (wars && N.exhaustion < 0.1) target += 0.04; // rally round the flag
  g.approval = clamp(g.approval + (clamp(target, 0.05, 0.95) - g.approval) * 0.03, 0, 1);
  const unrest = s.regions.filter(r => r.owner === N.code).reduce((a, r) => a + r.unrest * r.pop, 0) / Math.max(1, st.pop);
  let sTarget = (G.democratic ? 0.25 + 0.6 * g.approval : 0.45 + 0.3 * g.approval) + m.stability * 6 - unrest * 0.5;
  g.stability = clamp(g.stability + (clamp(sTarget, 0.02, 0.98) - g.stability) * 0.02, 0, 1);
  const hostile = s.t < g.hostileUntil ? 0.6 : 1;
  g.pc = Math.min(400, g.pc + (0.55 * G.pc * (0.5 + g.stability) + m.pc) * hostile);
  // elections
  if (g.nextElection && s.t >= g.nextElection) {
    g.nextElection = s.t + (G.election || 4) * 365 * 24;
    const won = g.approval + rnd(-0.08, 0.08) >= 0.48;
    if (won) { g.pc += 60; g.stability = clamp(g.stability + 0.08, 0, 1); }
    else { g.hostileUntil = s.t + 2 * 365 * 24; g.stability = clamp(g.stability - 0.05, 0, 1); }
    if (N.code === s.player) sim.emit('gov', won ? `Election victory! Your coalition retains a working majority (approval ${Math.round(g.approval * 100)}%).` : `Election setback. The opposition controls the legislature for two years: political capital gain is reduced.`, [N.code]);
  }
  // instability: protests and coups
  if (g.stability < 0.2 && Math.random() < 0.02) {
    const plotters = [...(N.generals || []), ...Object.values(g.cabinet)].map(id => s.chars[id]).filter(c => c && c.loyalty < 0.6 && c.traits.includes('Ambitious'));
    if (plotters.length || (!G.democratic && Math.random() < 0.3)) {
      const leader = plotters[0];
      g.type = 'junta'; g.pc = 0; g.stability = 0.45; g.approval = 0.3;
      sim.emit('gov', `COUP in ${NATION[N.code].name}! ${leader ? leader.name : 'Army officers'} seize power and impose military rule.`, [N.code], { major: true, loc: N.capital });
      computeMods(s, N);
    }
  }
}

export function canEnact(sim, N, cat, optId) {
  const opt = LAWS[cat].opts.find(o => o.id === optId);
  if (!opt || N.gov.laws[cat] === optId) return { ok: false, why: 'Already in force.' };
  if (opt.req === 'war' && !sim.warsOf(N.code).length) return { ok: false, why: 'Only during wartime.' };
  if (opt.req === 'martial' && !sim.warsOf(N.code).length && GOV_TYPES[N.gov.type].democratic) return { ok: false, why: 'Requires war or an authoritarian regime.' };
  const cd = N.gov.lawCooldown[cat] || 0;
  if (sim.s.t < cd) return { ok: false, why: `Recently changed. ${Math.ceil((cd - sim.s.t) / 24)} days until it can be revisited.` };
  const cost = lawCost(N, opt);
  if (N.gov.pc < cost) return { ok: false, why: `Needs ${cost} political capital.`, cost };
  if (GOV_TYPES[N.gov.type].democratic && (opt.fx.approval || 0) < 0 && N.gov.approval < 0.3) return { ok: false, why: 'The legislature will not pass unpopular laws while approval is this low.' };
  return { ok: true, cost };
}
export function lawCost(N, opt) {
  const base = 35 + Math.abs(opt.fx.approval || 0) * 300 + (opt.req ? 20 : 0);
  return Math.round(base * GOV_TYPES[N.gov.type].lawCost * (1 + (N.mods?.lawCost || 0)));
}
export function enact(sim, N, cat, optId) {
  const chk = canEnact(sim, N, cat, optId); if (!chk.ok) return chk;
  N.gov.pc -= chk.cost; N.gov.laws[cat] = optId; N.gov.lawCooldown[cat] = sim.s.t + 30 * 24;
  computeMods(sim.s, N);
  if (N.code === sim.s.player) sim.emit('gov', `New law enacted: ${LAWS[cat].name} set to ${LAWS[cat].opts.find(o => o.id === optId).name}.`, [N.code]);
  return chk;
}
export function reformCost() { return 150; }
export function reform(sim, N, type) {
  if (N.gov.pc < reformCost() || N.gov.type === type) return { ok: false, why: `Needs ${reformCost()} political capital.` };
  N.gov.pc -= reformCost(); N.gov.type = type; N.gov.stability = clamp(N.gov.stability - 0.2, 0, 1);
  N.gov.nextElection = GOV_TYPES[type].election ? sim.s.t + GOV_TYPES[type].election * 365 * 24 : null;
  computeMods(sim.s, N);
  sim.emit('gov', `${NATION[N.code].name} adopts a new constitution: ${GOV_TYPES[type].name}.`, [N.code], { major: NATION[N.code].major });
  return { ok: true };
}
export function appoint(sim, N, role, charId) {
  const s = sim.s, c = s.chars[charId]; if (!c) return { ok: false, why: 'Unknown candidate.' };
  const cost = hireCost(c);
  if (N.gov.pc < cost) return { ok: false, why: `Needs ${cost} political capital.` };
  N.gov.pc -= cost;
  if (role === 'general') { N.generals.push(c.id); c.role = 'general'; }
  else {
    const old = s.chars[N.gov.cabinet[role]];
    if (old) { old.role = null; if (old.loyalty > 0.7) N.gov.stability = clamp(N.gov.stability - 0.02, 0, 1); }
    N.gov.cabinet[role] = c.id; c.role = role;
  }
  N.gov.candidates[role] = (N.gov.candidates[role] || []).filter(id => id !== c.id);
  computeMods(s, N);
  return { ok: true };
}

// ------------------------------------------------------------------ narrative events (player)
// Each: when(sim,N) -> context|null, text(ctx), options [{label, fx(sim,N,ctx) -> string}]
export const EVENTS = [
  { id: 'strike', when: (sim, N) => { const r = sim.regionsOf(N.code).sort((a, b) => b.industry - a.industry)[0]; return r && { r }; },
    title: 'Labor Unrest', text: c => `Industrial unions in ${c.rn} have walked out over wages. Factories are idle.`,
    options: [
      { label: 'Negotiate a settlement ($250M)', fx: (sim, N) => { N.money -= 250; N.gov.approval += 0.03; return 'Workers return with a new contract.'; } },
      { label: 'Break the strike', fx: (sim, N, c) => { N.gov.approval -= 0.05; N.gov.stability += 0.03; c.r.unrest = Math.min(1, c.r.unrest + 0.2); return 'Police clear the picket lines. Resentment simmers.'; } },
      { label: 'Wait it out', fx: (sim, N, c) => { c.r.damage = Math.min(0.8, c.r.damage + 0.1); return 'Output falls for weeks.'; } }] },
  { id: 'scandal', when: (sim, N) => { const ids = Object.values(N.gov.cabinet); const ch = sim.s.chars[pick(ids)]; return ch && { ch }; },
    title: 'Ministerial Scandal', text: c => `Leaked documents implicate ${c.ch.name} (${ROLES[c.ch.role]?.name}) in a procurement kickback scheme.`,
    options: [
      { label: 'Demand their resignation', fx: (sim, N, c) => { N.gov.approval += 0.04; c.ch.skill = Math.max(1, c.ch.skill - 2); c.ch.traits = c.ch.traits.filter(t => t !== 'Loyalist'); return `${c.ch.name} stays on in a diminished role, their influence gutted.`; } },
      { label: 'Stand by them', fx: (sim, N, c) => { N.gov.approval -= 0.06; c.ch.loyalty = 1; return `${c.ch.name} is grateful and fiercely loyal now.`; } }] },
  { id: 'budget', when: (sim, N) => { const g = sim.s.chars[pick(N.generals || [])]; return g && { g }; },
    title: 'The General\'s Request', text: c => `${c.g.name} requests an expanded training and readiness budget, warning that the army is unprepared.`,
    options: [
      { label: 'Approve ($300M)', fx: (sim, N, c) => { N.money -= 300; c.g.skill = Math.min(10, c.g.skill + 1); c.g.loyalty = Math.min(1, c.g.loyalty + 0.15); for (const u of sim.unitsOf(N.code)) u.xp = Math.min(100, (u.xp || 0) + 6); return 'Readiness improves across the force.'; } },
      { label: 'Deny', fx: (sim, N, c) => { c.g.loyalty = Math.max(0, c.g.loyalty - 0.2); return `${c.g.name} leaves the meeting tight-lipped.`; } }] },
  { id: 'breakthrough', when: (sim, N) => N.research?.cur && { tech: N.research.cur },
    title: 'Laboratory Breakthrough', text: c => `National labs report an unexpected result relevant to ${TECH[c.tech].name}.`,
    options: [
      { label: 'Fast-track it ($200M)', fx: (sim, N) => { N.money -= 200; N.research.prog += 400; return 'The program leaps ahead.'; } },
      { label: 'Publish openly', fx: (sim, N) => { N.research.prog += 150; for (const c of Object.keys(sim.s.nations)) if (c !== N.code) sim.addOpinion(c, N.code, 2); return 'Scientists worldwide applaud.'; } }] },
  { id: 'ai', when: (sim, N) => N.techs.cmp2 && { },
    title: 'Emergent AI Capabilities', text: () => 'A government AI system has begun proposing policy solutions no one asked for. Several are brilliant. Some are unsettling.',
    options: [
      { label: 'Deploy it across ministries', fx: (sim, N) => { N.gov.pc += 40; N.research.prog += 300; N.gov.stability -= 0.04; return 'Bureaucracy accelerates. Unions and civil-liberties groups protest.'; } },
      { label: 'Pause and audit', fx: (sim, N) => { N.gov.stability += 0.03; return 'The system is sandboxed pending review.'; } }] },
  { id: 'protests', when: (sim, N) => N.gov.stability < 0.4 && { },
    title: 'Mass Protests', text: c => `Hundreds of thousands march on ${c.cap}. Stability is fragile.`,
    options: [
      { label: 'Offer concessions (40 PC)', fx: (sim, N) => { N.gov.pc -= 40; N.gov.approval += 0.08; N.gov.stability += 0.05; return 'Crowds disperse peacefully.'; } },
      { label: 'Crack down', fx: (sim, N) => { N.gov.stability += 0.1; N.gov.approval -= 0.1; for (const c of Object.keys(sim.s.nations)) if (c !== N.code) sim.addOpinion(c, N.code, -4); return 'Order is restored. The world watches in dismay.'; } }] },
  { id: 'disaster', when: (sim, N) => { const r = pick(sim.regionsOf(N.code)); return r && { r }; },
    title: 'Natural Disaster', text: c => `A devastating ${pick(['earthquake', 'flood', 'hurricane', 'wildfire'])} strikes ${c.rn}.`,
    options: [
      { label: 'Full relief effort ($350M)', fx: (sim, N) => { N.money -= 350; N.gov.approval += 0.06; return 'Your response is praised.'; } },
      { label: 'Minimal response', fx: (sim, N, c) => { c.r.pop *= 0.985; c.r.damage = Math.min(0.8, c.r.damage + 0.15); N.gov.approval -= 0.06; return 'Survivors feel abandoned.'; } }] },
  { id: 'spies', when: (sim, N) => { const rivals = Object.keys(sim.s.nations).filter(c => c !== N.code && sim.s.nations[c].alive && sim.opinion(N.code, c) < 0 && sim.s.nations[c].st.income > 20); return rivals.length && { rival: pick(rivals) }; },
    title: 'Spy Ring Uncovered', text: c => `Counter-intelligence has exposed a ${NATION[c.rival].name} espionage network inside your defense ministry.`,
    options: [
      { label: 'Expel their diplomats', fx: (sim, N, c) => { sim.addOpinion(N.code, c.rival, -15); sim.addOpinion(c.rival, N.code, -15); N.gov.stability += 0.02; return 'A diplomatic row erupts.'; } },
      { label: 'Turn them into double agents', fx: (sim, N, c) => { N.spyBonus = (N.spyBonus || 0) + 0.25; return 'Your intelligence service gains a priceless channel.'; } }] },
  { id: 'contractor', when: (sim, N) => N.st.income > 40 && { },
    title: 'Defense Prototype', text: () => 'A domestic defense contractor demonstrates a next-generation weapons system and seeks a launch order.',
    options: [
      { label: 'Place the order ($500M)', fx: (sim, N) => { N.money -= 500; N.bonusAtk = (N.bonusAtk || 0) + 0.04; return 'Frontline units receive the new system. +4% attack.'; } },
      { label: 'Decline', fx: () => 'The contractor courts foreign buyers instead.' }] },
  { id: 'weary', when: (sim, N) => N.exhaustion > 0.35 && sim.warsOf(N.code).length && { },
    title: 'War Weariness', text: () => 'Casualty lists grow longer. Editorials question the war.',
    options: [
      { label: 'Address the nation (30 PC)', fx: (sim, N) => { N.gov.pc -= 30; N.exhaustion = Math.max(0, N.exhaustion - 0.12); return 'Your speech steadies the home front.'; } },
      { label: 'Ignore the critics', fx: (sim, N) => { N.gov.approval -= 0.05; return 'Approval slides.'; } }] },
  { id: 'coupplot', when: (sim, N) => { const g = (N.generals || []).map(id => sim.s.chars[id]).find(c => c && c.traits.includes('Ambitious') && c.loyalty < 0.7); return g && N.gov.stability < 0.55 && { g }; },
    title: 'Plot in the High Command', text: c => `Intelligence warns that ${c.g.name} has been sounding out officers about "restoring order".`,
    options: [
      { label: 'Purge them', fx: (sim, N, c) => { N.generals = N.generals.filter(id => id !== c.g.id); for (const gp of sim.s.groups) if (gp.general === c.g.id) gp.general = null; N.gov.stability -= 0.04; return `${c.g.name} is arrested at dawn.`; } },
      { label: 'Buy their loyalty (50 PC)', fx: (sim, N, c) => { N.gov.pc -= 50; c.g.loyalty = 0.95; c.g.traits = c.g.traits.filter(t => t !== 'Ambitious'); return 'A promotion and a villa settle the matter.'; } }] },
  { id: 'refugees', when: (sim, N) => { const w = Object.entries(sim.s.rel).find(([k, v]) => v === 'war' && !k.split('|').includes(N.code)); if (!w) return null; const [a, b] = w[0].split('|'); return { a, b }; },
    title: 'Refugee Crisis', text: c => `War between ${NATION[c.a].name} and ${NATION[c.b].name} has displaced millions. Many seek safety in your country.`,
    options: [
      { label: 'Open the borders', fx: (sim, N) => { const r = sim.s.regions[N.capital]; r.pop += 2; N.gov.approval -= 0.02; for (const c of Object.keys(sim.s.nations)) if (c !== N.code) sim.addOpinion(c, N.code, 3); return 'The world praises your humanity.'; } },
      { label: 'Close the borders', fx: (sim, N) => { N.gov.approval += 0.02; return 'Border patrols are reinforced.'; } }] },
];

export function rollEvent(sim, N) {
  const order = [...EVENTS].sort(() => Math.random() - 0.5);
  for (const e of order) {
    if (N.lastEvents?.includes(e.id)) continue;
    const ctx = e.when(sim, N); if (!ctx) continue;
    if (ctx.r) ctx.rn = sim.w.regions[ctx.r.i].name;
    ctx.cap = sim.w.regions[N.capital].name;
    N.lastEvents = [...(N.lastEvents || []), e.id].slice(-5);
    return { id: e.id, ctx, title: e.title, text: e.text(ctx), options: e.options.map(o => o.label) };
  }
  return null;
}
export function resolveEvent(sim, N, ev, k) {
  const e = EVENTS.find(x => x.id === ev.id); if (!e) return '';
  const out = e.options[k].fx(sim, N, ev.ctx);
  N.gov.approval = clamp(N.gov.approval, 0, 1); N.gov.stability = clamp(N.gov.stability, 0, 1); N.gov.pc = Math.max(0, N.gov.pc);
  computeMods(sim.s, N);
  sim.emit('gov', `${e.title}: ${out}`, [N.code]);
  return out;
}

export { TECHS };
