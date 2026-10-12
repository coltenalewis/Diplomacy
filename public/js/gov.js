// Governments that evolve through the ages, laws, the cabinet and its era titles, modifiers, politics and narrative events.
import { TECH } from './tech.js';
import { WONDERS } from './units.js';
import { personName } from './names.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[(Math.random() * a.length) | 0];
const rnd = (a, b) => a + Math.random() * (b - a);

// ------------------------------------------------------------------ governments
// fmt: how the civilization is styled. ruler: the head of state's title. election: days between elections (democracies).
export const GOV_TYPES = {
  tribe: { name: 'Tribal Council', age: 0, tech: null, ruler: 'Elder', fmt: '{name} Tribe', pc: 0.8, lawCost: 1, fx: { stability: 0.004 }, desc: 'Elders decide by consensus. Stable but slow.' },
  chiefdom: { name: 'Chiefdom', age: 0, tech: 'leadership', ruler: 'Chief', fmt: 'Chiefdom of {name}', pc: 1.0, lawCost: 0.9, fx: { atkLand: 0.03, pc: 0.1 }, desc: 'A war chief commands the clans.' },
  despotism: { name: 'Despotism', age: 1, tech: 'code_of_laws', ruler: 'Despot', fmt: '{name}', pc: 1.2, lawCost: 0.7, fx: { prod: 0.1, build: 0.05, approval: -0.03 }, desc: 'One ruler, absolute and feared.' },
  theocracy: { name: 'Theocracy', age: 1, tech: 'priesthood', ruler: 'High Priest', fmt: 'Holy Realm of {name}', pc: 1.1, lawCost: 0.9, fx: { stability: 0.008, research: -0.05, approval: 0.02 }, desc: 'Priests rule in the name of the gods.' },
  monarchy: { name: 'Monarchy', age: 2, tech: 'monarchy', ruler: 'King', fmt: 'Kingdom of {name}', pc: 1.15, lawCost: 0.85, fx: { stability: 0.005, pc: 0.1 }, desc: 'A hereditary crown and a royal court.' },
  republic: { name: 'Classical Republic', age: 3, tech: 'the_republic', ruler: 'Consul', fmt: '{adj} Republic', pc: 1.0, lawCost: 1.15, democratic: true, election: 90, fx: { wealth: 0.08, research: 0.05 }, desc: 'Citizens elect magistrates; commerce and learning thrive.' },
  empire: { name: 'Imperial Autocracy', age: 3, tech: 'imperialism', ruler: 'Emperor', fmt: '{adj} Empire', pc: 1.25, lawCost: 0.8, fx: { garrison: 0.15, claimCost: -0.1, approval: -0.02 }, desc: 'An emperor rules many peoples.' },
  feudal: { name: 'Feudal Monarchy', age: 4, tech: 'feudalism', ruler: 'King', fmt: 'Kingdom of {name}', pc: 1.1, lawCost: 0.9, fx: { manpower: 0.25, defLand: 0.05, wealth: -0.05 }, desc: 'Lords and vassals owe service to the crown.' },
  merchant: { name: 'Merchant Republic', age: 4, tech: 'banking', ruler: 'Doge', fmt: 'Most Serene Republic of {name}', pc: 1.0, lawCost: 1.1, democratic: true, election: 90, fx: { wealth: 0.15, tradeBonus: 0.15 }, desc: 'Ruled by merchant princes and banking houses.' },
  absolute: { name: 'Absolute Monarchy', age: 5, tech: 'divine_right', ruler: 'Sovereign', fmt: 'Kingdom of {name}', pc: 1.3, lawCost: 0.8, fx: { pc: 0.2, stability: 0.004, research: -0.04 }, desc: 'L\'état, c\'est moi.' },
  constmon: { name: 'Constitutional Monarchy', age: 5, tech: 'constitution', ruler: 'Prime Minister', fmt: 'Kingdom of {name}', pc: 1.0, lawCost: 1.15, democratic: true, election: 100, fx: { stability: 0.004, diplo: 0.05, wealth: 0.05 }, desc: 'The crown reigns; parliament governs.' },
  parliamentary: { name: 'Parliamentary Democracy', age: 6, tech: 'democracy', ruler: 'Prime Minister', fmt: 'Republic of {name}', pc: 1.0, lawCost: 1.25, democratic: true, election: 80, fx: { research: 0.05, wealth: 0.05, diplo: 0.1 }, desc: 'Coalitions, debates and free elections.' },
  presidential: { name: 'Presidential Republic', age: 6, tech: 'democracy', ruler: 'President', fmt: '{adj} Republic', pc: 1.1, lawCost: 1.15, democratic: true, election: 80, fx: { wealth: 0.06 }, desc: 'A strong elected executive.' },
  oneparty: { name: 'One-Party State', age: 7, tech: 'ideology', ruler: 'General Secretary', fmt: 'People\'s Republic of {name}', pc: 1.4, lawCost: 0.7, fx: { prod: 0.12, research: -0.03, covert: 0.15 }, desc: 'The party is the state.' },
  autocracy: { name: 'Authoritarian State', age: 7, tech: 'totalitarianism', ruler: 'Leader', fmt: '{adj} State', pc: 1.3, lawCost: 0.75, fx: { atk: 0.05, manpower: 0.2, approval: -0.03 }, desc: 'A strongman, a party militia and a cult of personality.' },
  junta: { name: 'Military Junta', age: 1, tech: null, coupOnly: true, ruler: 'Marshal', fmt: '{adj} Military Government', pc: 1.2, lawCost: 0.6, fx: { atk: 0.08, wealth: -0.08, xp: 0.3 }, desc: 'The generals have taken power.' },
  technocracy: { name: 'Technocracy', age: 9, tech: 'technocracy', ruler: 'Director', fmt: '{adj} Technate', pc: 1.0, lawCost: 1.0, fx: { research: 0.2, build: 0.1, stability: -0.002 }, desc: 'Experts and algorithms govern.' },
};
export function govAvailable(N, k) { const G = GOV_TYPES[k]; return !G.coupOnly && G.age <= N.age && (!G.tech || !!N.techs[G.tech]); }
export function styleName(N) {
  if (N.formed) return N.formed.title;
  const G = GOV_TYPES[N.gov?.type || 'tribe'];
  return G.fmt.replace('{name}', N.name).replace('{adj}', N.adj);
}

// ------------------------------------------------------------------ laws
// req: { tech, age, war, auth (non-democratic), notTech }
export const LAWS = {
  expansion: { name: 'Expansion Policy', def: 1, opts: [
    { id: 'consolidate', name: 'Consolidation', desc: 'Develop what we have.', fx: { claimCost: 0.25, stability: 0.003, build: 0.05 } },
    { id: 'balanced', name: 'Steady Growth', desc: '', fx: {} },
    { id: 'frontier', name: 'Frontier Spirit', desc: 'Settlers push into every valley.', fx: { claimCost: -0.18, claimSpeed: 0.25, stability: -0.002 } },
    { id: 'manifest', name: 'Manifest Destiny', desc: 'Our destiny is to spread across the land.', fx: { claimCost: -0.3, claimSpeed: 0.4, diplo: -0.1 }, req: { tech: 'colonization' } }] },
  conscription: { name: 'Military Service', def: 0, opts: [
    { id: 'levy', name: 'Tribal Levy', desc: 'Every hunter is a warrior when needed.', fx: {} },
    { id: 'volunteer', name: 'Volunteer Force', desc: 'Professionals only.', fx: { manpower: -0.4, approval: 0.03, xp: 0.2 }, req: { tech: 'professional_army' } },
    { id: 'feudal', name: 'Feudal Levy', desc: 'Vassals bring their retinues.', fx: { manpower: 0.3, xp: -0.1 }, req: { tech: 'feudalism' } },
    { id: 'draft', name: 'Universal Draft', desc: 'All citizens serve.', fx: { manpower: 0.8, approval: -0.04, wealth: -0.03 }, req: { tech: 'conscription' } },
    { id: 'total', name: 'Total Mobilization', desc: 'Every resource to the war effort. Wartime only.', fx: { manpower: 2.0, prod: 0.2, wealth: -0.12, approval: -0.1 }, req: { tech: 'conscription', war: true } }] },
  tax: { name: 'Taxation', def: 1, opts: [
    { id: 'low', name: 'Light Tribute', desc: 'Popular, but the stores fill slowly.', fx: { wealth: -0.12, approval: 0.05 } },
    { id: 'standard', name: 'Customary Dues', desc: '', fx: {} },
    { id: 'high', name: 'Heavy Taxes', desc: 'More revenue, less goodwill.', fx: { wealth: 0.12, approval: -0.05 }, req: { tech: 'code_of_laws' } },
    { id: 'war', name: 'War Levies', desc: 'Emergency taxation. Wartime only.', fx: { wealth: 0.22, approval: -0.08 }, req: { war: true, tech: 'currency' } }] },
  labor: { name: 'Labor', def: 0, opts: [
    { id: 'communal', name: 'Communal Labor', desc: 'Everyone works the common land.', fx: {} },
    { id: 'slavery', name: 'Slavery', desc: 'Captives work the fields and mines. Brutal and destabilizing.', fx: { prod: 0.12, labor: -0.15, approval: -0.04, stability: -0.003, diplo: -0.05 }, req: { tech: 'code_of_laws', notTech: 'democracy' } },
    { id: 'serfdom', name: 'Serfdom', desc: 'Peasants bound to the land.', fx: { food: 0.08, approval: -0.03 }, req: { tech: 'feudalism', notTech: 'democracy' } },
    { id: 'free', name: 'Free Labor', desc: 'Wages and contracts.', fx: { wealth: 0.06, approval: 0.02 }, req: { tech: 'constitution' } },
    { id: 'unions', name: 'Labor Unions', desc: 'Organized workers, fair wages.', fx: { approval: 0.05, prod: -0.05 }, req: { tech: 'industrialization' } },
    { id: 'automation', name: 'Automation', desc: 'Machines do the work.', fx: { prod: 0.2, labor: -0.25, approval: -0.03 }, req: { tech: 'robotics' } }] },
  religion: { name: 'Faith', def: 0, opts: [
    { id: 'animism', name: 'Animism', desc: 'Spirits in every rock and river.', fx: {} },
    { id: 'pantheon', name: 'State Pantheon', desc: 'Temples to the city gods.', fx: { stability: 0.004, wealth: -0.02, convert: 0.2 }, req: { tech: 'polytheism' } },
    { id: 'state', name: 'State Religion', desc: 'One church, one faith. Converts the realm faster; other faiths resent it.', fx: { stability: 0.008, research: -0.05, faithUnrest: 0.3 }, req: { tech: 'monotheism' } },
    { id: 'tolerance', name: 'Religious Tolerance', desc: 'All faiths welcome. Far less religious unrest.', fx: { research: 0.05, approval: 0.03, diplo: 0.05, faithUnrest: -0.6 }, req: { tech: 'humanism' } },
    { id: 'secular', name: 'Secularism', desc: 'Church and state apart.', fx: { research: 0.08, stability: -0.002, faithUnrest: -0.5 }, req: { tech: 'democracy' } }] },
  culture: { name: 'Cultural Policy', def: 1, opts: [
    { id: 'assimilate', name: 'Forced Assimilation', desc: 'One language, one people. Minorities assimilate fast but resent it.', fx: { assim: 0.9, cultureUnrest: 0.5, approval: -0.01 }, req: { tech: 'code_of_laws' } },
    { id: 'accommodate', name: 'Accommodation', desc: '', fx: {} },
    { id: 'pluralism', name: 'Pluralism', desc: 'Local customs and languages respected.', fx: { assim: -0.4, cultureUnrest: -0.45 }, req: { tech: 'citizenship' } },
    { id: 'multicultural', name: 'Multiculturalism', desc: 'Every people equal before the law.', fx: { assim: -0.3, cultureUnrest: -0.7, diplo: 0.05 }, req: { tech: 'human_rights' } }] },
  trade: { name: 'Trade Policy', def: 1, opts: [
    { id: 'closed', name: 'Isolation', desc: 'Keep foreigners out.', fx: { diplo: -0.1, wealth: -0.05, stability: 0.003 } },
    { id: 'managed', name: 'Managed Trade', desc: '', fx: {} },
    { id: 'free', name: 'Free Trade', desc: 'Better terms abroad, more goodwill.', fx: { tradeBonus: 0.1, diplo: 0.1 }, req: { tech: 'trade_networks' } },
    { id: 'mercantile', name: 'Mercantilism', desc: 'Export more than you import.', fx: { wealth: 0.08, tradeBonus: -0.1 }, req: { tech: 'mercantilism' } },
    { id: 'protect', name: 'Protectionism', desc: 'Shield domestic industry.', fx: { prod: 0.05, tradeBonus: -0.2, diplo: -0.1 }, req: { tech: 'industrialization' } }] },
  research: { name: 'Learning', def: 1, opts: [
    { id: 'minimal', name: 'Tradition', desc: 'The old ways are enough.', fx: { researchShare: 0.0, stability: 0.002 } },
    { id: 'standard', name: 'Patronage', desc: 'A share of wealth funds scholars.', fx: { researchShare: 0.05 } },
    { id: 'high', name: 'Academies', desc: 'Generous funding for learning.', fx: { researchShare: 0.12, approval: -0.01 }, req: { tech: 'writing' } },
    { id: 'moonshot', name: 'National Science Crusade', desc: 'A quarter of wealth to research.', fx: { researchShare: 0.25, research: 0.1, approval: -0.03 }, req: { tech: 'scientific_method' } }] },
  liberty: { name: 'Civil Liberties', def: 1, opts: [
    { id: 'open', name: 'Open Society', desc: 'Free speech, free minds.', fx: { approval: 0.06, stability: -0.002, research: 0.05, covert: -0.2 }, req: { tech: 'the_republic' } },
    { id: 'standard', name: 'Customary Rights', desc: '', fx: {} },
    { id: 'surveillance', name: 'Informants & Secret Police', desc: 'Watch everyone.', fx: { stability: 0.004, approval: -0.06, covert: 0.25 }, req: { tech: 'code_of_laws' } },
    { id: 'martial', name: 'Martial Law', desc: 'Soldiers in the streets. War or an authoritarian regime.', fx: { stability: 0.01, approval: -0.15, wealth: -0.12 }, req: { auth: true } }] },
  doctrine: { name: 'Military Doctrine', def: 1, opts: [
    { id: 'defensive', name: 'Defense in Depth', desc: '', fx: { defLand: 0.15, def: 0.05 } },
    { id: 'balanced', name: 'Balanced Forces', desc: '', fx: {} },
    { id: 'offensive', name: 'Offensive Spirit', desc: '', fx: { atk: 0.1 } },
    { id: 'maneuver', name: 'Rapid Maneuver', desc: 'Speed is armor.', fx: { speedLand: 0.25, atkLand: 0.05, def: -0.05 }, req: { tech: 'horseback_riding' } }] },
  industry: { name: 'Industrial Policy', def: 0, req: { tech: 'industrialization' }, opts: [
    { id: 'balanced', name: 'Balanced Growth', desc: '', fx: {} },
    { id: 'heavy', name: 'Heavy Industry', desc: 'Steel, shipyards and munitions.', fx: { prod: 0.2, wealth: -0.04 } },
    { id: 'consumer', name: 'Consumer Economy', desc: 'Prosperity at home.', fx: { wealth: 0.06, prod: -0.1, approval: 0.03 } },
    { id: 'green', name: 'Green Transition', desc: 'Efficiency and renewables.', fx: { energyCons: -0.15, buildCost: 0.1, approval: 0.02 }, req: { tech: 'renewables' } },
    { id: 'tech', name: 'Tech Sector', desc: 'Software, chips and AI.', fx: { research: 0.15, wealth: 0.02, buildCost: 0.05 }, req: { tech: 'computers' } }] },
  welfare: { name: 'Social Welfare', def: 1, req: { tech: 'sanitation' }, opts: [
    { id: 'minimal', name: 'Minimal State', desc: '', fx: { wealth: 0.04, approval: -0.05 } },
    { id: 'standard', name: 'Poor Relief', desc: '', fx: {} },
    { id: 'generous', name: 'Welfare State', desc: '', fx: { approval: 0.07, wealth: -0.05, popGrowth: 0.3 } }] },
  nuclear: { name: 'Nuclear Posture', def: 2, req: { tech: 'nuclear_weapons' }, opts: [
    { id: 'disarm', name: 'Disarmament', desc: 'No warheads are produced. The world approves.', fx: { diplo: 0.15 } },
    { id: 'nfu', name: 'No First Use', desc: 'Retaliation only.', fx: { diplo: 0.05 } },
    { id: 'deterrence', name: 'Deterrence', desc: 'Ambiguity keeps rivals honest.', fx: {} },
    { id: 'low', name: 'Launch on Warning', desc: 'Guaranteed retaliation, constant tension.', fx: { stability: -0.002, diplo: -0.1 } }] },
  ai: { name: 'AI Governance', def: 1, req: { tech: 'machine_learning' }, opts: [
    { id: 'restricted', name: 'Restricted', desc: 'Strict limits on frontier AI.', fx: { stability: 0.002, research: -0.05 } },
    { id: 'regulated', name: 'Regulated', desc: '', fx: {} },
    { id: 'accelerate', name: 'Accelerate', desc: 'Full speed on AI. Datacenters double output.', fx: { research: 0.1, aiBoost: 1, stability: -0.002 } }] },
};
export function lawOpt(N, cat) { const L = LAWS[cat]; return L.opts.find(o => o.id === N.gov.laws[cat]) || L.opts[L.def]; }
export function lawVisible(N, cat) { const r = LAWS[cat].req; return !r || !r.tech || !!N.techs[r.tech]; }
function reqOk(sim, N, req) {
  if (!req) return { ok: true };
  if (req.tech && !N.techs[req.tech]) return { ok: false, why: `Requires ${TECH[req.tech]?.name || req.tech}.` };
  if (req.notTech && N.techs[req.notTech]) return { ok: false, why: `Abolished by ${TECH[req.notTech].name}.` };
  if (req.war && !sim.warsOf(N.code).length) return { ok: false, why: 'Only during wartime.' };
  if (req.auth && GOV_TYPES[N.gov.type].democratic && !sim.warsOf(N.code).length) return { ok: false, why: 'Requires war or an authoritarian regime.' };
  return { ok: true };
}

// ------------------------------------------------------------------ cabinet
// titles by age bracket: [Stone, Bronze-Iron, Classical, Medieval, Discovery, Industrial+]
const T6 = a => (a <= 0 ? 0 : a <= 2 ? 1 : a === 3 ? 2 : a === 4 ? 3 : a === 5 ? 4 : 5);
export const ROLES = {
  defense: { titles: ['War Chief', 'Commander of the Host', 'Strategos', 'Marshal', 'Captain-General', 'Minister of Defense'], short: 'Defense', fx: s => ({ prod: s * 0.025, upkeep: -s * 0.01 }), blurb: 'Warriors, arms and the order of battle.' },
  finance: { titles: ['Keeper of Stores', 'Royal Steward', 'Quaestor', 'Lord Treasurer', 'Chancellor of the Exchequer', 'Minister of Finance'], short: 'Treasury', fx: s => ({ wealth: s * 0.012 }), blurb: 'Stores, tribute and the treasury.' },
  industry: { titles: ['Master Toolmaker', 'Master of Works', 'Aedile', 'Master Mason', 'Superintendent of Works', 'Minister of Industry'], short: 'Works', fx: s => ({ build: s * 0.03, buildCost: -s * 0.01 }), blurb: 'Settlements, fields, mines and buildings.' },
  science: { titles: ['Shaman', 'Royal Scribe', 'Philosopher', 'Court Scholar', 'Royal Astronomer', 'Minister of Science'], short: 'Learning', fx: s => ({ research: s * 0.03 }), blurb: 'Lore, learning and research.' },
  foreign: { titles: ['Envoy', 'Royal Emissary', 'Legate', 'Chancellor', 'Secretary of State', 'Foreign Minister'], short: 'Envoys', fx: s => ({ diplo: s * 0.05 }), blurb: 'Contacts, treaties and trade.' },
  interior: { titles: ['Elder', 'Vizier', 'Praetor', 'Lord Chamberlain', 'Chancellor of the Realm', 'Minister of the Interior'], short: 'Interior', fx: s => ({ stability: s * 0.0006, pc: s * 0.06, claimCost: -s * 0.01 }), blurb: 'Order, settlement and political capital.' },
  intel: { titles: ['Scout Master', 'Watcher of the Roads', 'Frumentarius', 'Spymaster', 'Master of Intelligencers', 'Director of Intelligence'], short: 'Intelligence', fx: s => ({ covert: s * 0.05 }), blurb: 'Scouts, spies and counter-intelligence.' },
};
export const CABINET = Object.keys(ROLES);
export const roleTitle = (role, age) => ROLES[role]?.titles[T6(age)] || role;
export const generalTitle = (age, naval) => naval ? ['Chief of Canoes', 'Admiral of the Fleet', 'Navarch', 'Admiral', 'Admiral', 'Adm.'][T6(age)] : ['Warleader', 'General', 'Legatus', 'Marshal', 'General', 'Gen.'][T6(age)];

export const TRAITS = {
  Visionary: { desc: 'Role bonus x1.4', mult: 1.4 },
  Corrupt: { desc: '-3% wealth, +political capital', fx: { wealth: -0.03, pc: 0.15 } },
  Hawk: { desc: '+4% attack, worse diplomacy', fx: { atk: 0.04, diplo: -0.1 } },
  Dove: { desc: 'Better diplomacy, less war-weariness', fx: { diplo: 0.12, exhaustion: -0.1 } },
  Reformer: { desc: 'Laws cost 20% less', fx: { lawCost: -0.2 } },
  Populist: { desc: '+3% approval', fx: { approval: 0.03 } },
  Scholar: { desc: '+6% research', fx: { research: 0.06 } },
  Loyalist: { desc: 'Never plots against you', loyal: true },
  Ambitious: { desc: 'Talented but may plot a coup', mult: 1.15, ambitious: true },
  Pathfinder: { desc: 'Claims 15% cheaper', fx: { claimCost: -0.15 } },
  Logistician: { desc: 'General: +20% speed', gen: { speed: 0.2 } },
  Aggressive: { desc: 'General: +12% attack', gen: { atk: 0.12 } },
  'Defensive Genius': { desc: 'General: +18% defense', gen: { def: 0.18 } },
  Inspiring: { desc: 'General: +60% training speed', gen: { xp: 0.6 } },
  Cautious: { desc: 'General: +10% defense, slower', gen: { def: 0.1, speed: -0.1 } },
};
const MIN_TRAITS = ['Visionary', 'Corrupt', 'Hawk', 'Dove', 'Reformer', 'Populist', 'Scholar', 'Loyalist', 'Ambitious', 'Pathfinder'];
const GEN_TRAITS = ['Logistician', 'Aggressive', 'Defensive Genius', 'Inspiring', 'Cautious', 'Ambitious', 'Loyalist'];

export function makeChar(s, N, kind, skillBias = 0) {
  s.usedNames ||= {};
  let name = '';
  for (let k = 0; k < 20; k++) { name = personName(N.culture, N.age); if (!s.usedNames[N.code + name]) break; }
  s.usedNames[N.code + name] = 1;
  const skill = clamp(Math.round(rnd(2, 8) + skillBias), 1, 10);
  const traitPool = kind === 'minister' ? MIN_TRAITS : GEN_TRAITS;
  const traits = [pick(traitPool)]; if (Math.random() < 0.35) { const t2 = pick(traitPool); if (!traits.includes(t2)) traits.push(t2); }
  const c = { id: s.cid++, name, nation: N.code, kind, skill, traits, loyalty: traits.includes('Loyalist') ? 1 : rnd(0.4, 0.95), age: Math.round(rnd(28, 60)), seed: Math.floor(Math.random() * 1e6), role: null };
  s.chars[c.id] = c;
  return c;
}
export function hireCost(c) { return 10 + c.skill * 4 + (c.traits.includes('Visionary') ? 10 : 0); }
export function charTitle(c, N) {
  if (c.kind === 'governor') return c.office === 'mayor' ? 'Mayor' : 'Governor';
  if (c.kind === 'minister') return c.role ? roleTitle(c.role, N.age) : 'Candidate';
  return generalTitle(N.age, c.kind === 'admiral');
}

// ------------------------------------------------------------------ setup
export function initGovernment(s, N) {
  const type = N.age >= 6 ? 'parliamentary' : N.age >= 5 ? 'absolute' : N.age >= 4 ? 'feudal' : N.age >= 3 ? 'empire' : N.age >= 2 ? 'monarchy' : N.age >= 1 ? 'despotism' : 'tribe';
  const laws = {}; for (const [k, L] of Object.entries(LAWS)) laws[k] = L.opts[L.def].id;
  if (N.traits.aggression > 0.7 && N.age >= 2) laws.doctrine = 'offensive';
  if (N.traits.expansion > 0.6) laws.expansion = 'frontier';
  N.gov = { type, laws, stability: rnd(0.6, 0.8), approval: rnd(0.5, 0.65), pc: 30, cabinet: {}, nextElection: null, hostileUntil: 0, lawCooldown: {}, candidates: {} };
  for (const role of CABINET) { const ch = makeChar(s, N, 'minister', 0); ch.role = role; N.gov.cabinet[role] = ch.id; }
  N.generals = [];
  const g = makeChar(s, N, 'general', 0); g.role = 'general'; N.generals.push(g.id);
}
export function refreshCandidates(s, N) {
  N.gov.candidates = {};
  for (const role of [...CABINET, 'general']) N.gov.candidates[role] = [0, 1, 2].map(() => makeChar(s, N, role === 'general' ? (Math.random() < 0.3 && N.age >= 1 ? 'admiral' : 'general') : 'minister', Math.random() < 0.3 ? 1.5 : 0).id);
  N.gov.candidatesAt = s.t;
}

// ------------------------------------------------------------------ modifiers
const BASE = () => ({ atk: 0, def: 0, atkLand: 0, defLand: 0, atkAir: 0, defAir: 0, atkSea: 0, defSea: 0, speedLand: 0, speedSea: 0, speedAir: 0, hpLand: 0,
  prod: 0, build: 0, buildCost: 0, wealth: 0, food: 0, wood: 0, stone: 0, metal: 0, oil: 0, energy: 0, energyCons: 0, research: 0, manpower: 0, popGrowth: 0, housing: 0, labor: 0,
  upkeep: 0, xp: 0, exhaustion: 0, covert: 0, intercept: 0, pierce: 0, yield: 0, shelter: 0, diplo: 0, tradeBonus: 0, researchShare: 0, stability: 0, approval: 0, pc: 0, lawCost: 0, aiBoost: 0,
  claimCost: 0, claimSpeed: 0, garrison: 0, siege: 0, warheads: 0, assim: 0, convert: 0, suppress: 0, terror: 0, govSkill: 0, unrestMin: 0, faithUnrest: 0, cultureUnrest: 0 });
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
  for (const [id, owner] of Object.entries(s.wonders || {})) if (owner === N.code) addFx(m, WONDERS[id].fx);
  if (N.formed?.fx) addFx(m, N.formed.fx);
  if (N.soc) addFx(m, N.soc); // holy cities and pilgrims
  if (N.pfx) addFx(m, N.pfx); // corruption in an overstretched state
  if (N.cfx) addFx(m, N.cfx); // world crises
  // luxuries: each distinct luxury the people enjoy lifts spirits
  const lux = N.luxCount || 0;
  m.approval += Math.min(0.15, lux * 0.012); m.stability += Math.min(0.006, lux * 0.0006);
  if (s.nukesUsed > 6) m.food -= Math.min(0.4, (s.nukesUsed - 6) * 0.04); // nuclear winter
  if (N.aiBonus) { m.food += N.aiBonus * 0.15; m.wealth += N.aiBonus * 0.15; m.research += N.aiBonus * 0.12; m.prod += N.aiBonus * 0.1; }
  N.mods = m;
  return m;
}
// combat multipliers for a unit
export function unitMods(s, u, domain) {
  const N = s.nations[u.nation]; const m = N?.mods || BASE();
  let atk = 1 + m.atk + (domain === 'land' ? m.atkLand : domain === 'air' ? m.atkAir : m.atkSea);
  let def = 1 + m.def + (domain === 'land' ? m.defLand : domain === 'air' ? m.defAir : m.defSea);
  let speed = 1 + (domain === 'land' ? m.speedLand : domain === 'air' ? m.speedAir : m.speedSea);
  const xp = 1 + (u.xp || 0) / 250;
  atk *= xp; def *= xp;
  if (N && N.age <= 1 && N.access?.obsidian && domain === 'land') atk *= 1.08; // obsidian blades
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
  if (N.wealth < 0) target -= 0.08;
  target -= N.exhaustion * (G.democratic ? 0.5 : 0.25);
  if (wars && N.exhaustion < 0.1) target += 0.04; // rally round the flag
  // an empire too large for its institutions grows restless
  const over = N.adminOver ?? Math.max(0, st.tiles - (6 + N.age * 5));
  target -= Math.min(0.22, over * 0.008) + Math.min(0.1, Math.max(0, (N.expHeat || 0) - 6) * 0.008);
  g.approval = clamp(g.approval + (clamp(target, 0.05, 0.95) - g.approval) * 0.03, 0, 1);
  const unrest = st.unrestW || 0;
  const sTarget = (G.democratic ? 0.25 + 0.6 * g.approval : 0.45 + 0.3 * g.approval) + m.stability * 6 - unrest * 0.5;
  g.stability = clamp(g.stability + (clamp(sTarget, 0.02, 0.98) - g.stability) * 0.02, 0, 1);
  const hostile = s.t < g.hostileUntil ? 0.6 : 1;
  g.pc = Math.min(400, g.pc + (0.5 * G.pc * (0.5 + g.stability) + m.pc) * hostile);
  // elections
  if (G.democratic) {
    if (!g.nextElection) g.nextElection = s.t + (G.election || 90) * 24;
    if (s.t >= g.nextElection) {
      g.nextElection = s.t + (G.election || 90) * 24;
      const won = g.approval + rnd(-0.08, 0.08) >= 0.48;
      if (won) { g.pc += 60; g.stability = clamp(g.stability + 0.08, 0, 1); }
      else { g.hostileUntil = s.t + 40 * 24; g.stability = clamp(g.stability - 0.05, 0, 1); }
      if (N.code === s.player) sim.emit('gov', won ? `Election victory! Your faction keeps its majority (approval ${Math.round(g.approval * 100)}%).` : `Election setback. The opposition controls the assembly for a season: political capital gain is reduced.`, [N.code]);
    }
  } else g.nextElection = null;
  // instability: revolts and coups
  if (g.stability < 0.2 && Math.random() < 0.02 && N.age >= 1) {
    const plotters = [...(N.generals || []), ...Object.values(g.cabinet)].map(id => s.chars[id]).filter(c => c && c.loyalty < 0.6 && c.traits.includes('Ambitious'));
    if (plotters.length || (!G.democratic && Math.random() < 0.3)) {
      const leader = plotters[0];
      g.type = 'junta'; g.pc = 0; g.stability = 0.45; g.approval = 0.3;
      sim.emit('gov', `COUP in ${sim.nm(N.code)}! ${leader ? leader.name : 'The army'} seizes power and rules by the sword.`, [N.code], { major: true, loc: N.capital });
      computeMods(s, N);
    }
  }
}

export function canEnact(sim, N, cat, optId) {
  const L = LAWS[cat]; const opt = L.opts.find(o => o.id === optId);
  if (!opt || N.gov.laws[cat] === optId) return { ok: false, why: 'Already in force.' };
  if (!lawVisible(N, cat)) return { ok: false, why: `Requires ${TECH[L.req.tech].name}.` };
  const rq = reqOk(sim, N, opt.req); if (!rq.ok) return rq;
  const cd = N.gov.lawCooldown[cat] || 0;
  if (sim.s.t < cd) return { ok: false, why: `Recently changed. ${Math.ceil((cd - sim.s.t) / 24)} days until it can be revisited.` };
  const cost = lawCost(N, opt);
  if (N.gov.pc < cost) return { ok: false, why: `Needs ${cost} political capital.`, cost };
  if (GOV_TYPES[N.gov.type].democratic && (opt.fx.approval || 0) < 0 && N.gov.approval < 0.3) return { ok: false, why: 'The assembly will not pass unpopular laws while approval is this low.' };
  return { ok: true, cost };
}
export function lawCost(N, opt) {
  const base = 30 + Math.abs(opt.fx.approval || 0) * 300 + (opt.req?.war ? 20 : 0);
  return Math.round(base * GOV_TYPES[N.gov.type].lawCost * (1 + (N.mods?.lawCost || 0)));
}
export function enact(sim, N, cat, optId) {
  const chk = canEnact(sim, N, cat, optId); if (!chk.ok) return chk;
  N.gov.pc -= chk.cost; N.gov.laws[cat] = optId; N.gov.lawCooldown[cat] = sim.s.t + 30 * 24;
  computeMods(sim.s, N);
  if (N.code === sim.s.player) sim.emit('gov', `New law: ${LAWS[cat].name} set to ${LAWS[cat].opts.find(o => o.id === optId).name}.`, [N.code]);
  return chk;
}
// laws that become illegal (e.g. slavery after democracy) revert to the default
export function validateLaws(sim, N) {
  for (const [cat, L] of Object.entries(LAWS)) {
    const o = lawOpt(N, cat);
    if (o.req?.notTech && N.techs[o.req.notTech]) { N.gov.laws[cat] = L.opts.find(x => !x.req || reqOk(sim, N, x.req).ok)?.id || L.opts[0].id; if (N.code === sim.s.player) sim.emit('gov', `${o.name} has been abolished.`, [N.code]); }
    if (o.req?.war && !sim.warsOf(N.code).length) N.gov.laws[cat] = L.opts[L.def].id;
  }
}
export function reformCost(N) { return N && GOV_TYPES[N.gov.type].coupOnly ? 80 : 120; }
export function reform(sim, N, type) {
  if (!govAvailable(N, type)) return { ok: false, why: 'Not available yet.' };
  if (N.gov.pc < reformCost(N) || N.gov.type === type) return { ok: false, why: `Needs ${reformCost(N)} political capital.` };
  N.gov.pc -= reformCost(N); N.gov.type = type; N.gov.stability = clamp(N.gov.stability - 0.18, 0, 1);
  N.gov.nextElection = GOV_TYPES[type].democratic ? sim.s.t + GOV_TYPES[type].election * 24 : null;
  computeMods(sim.s, N);
  sim.emit('gov', `${N.name} adopts a new form of government: ${GOV_TYPES[type].name}. It is now the ${styleName(N)}.`, [N.code], { major: N.code === sim.s.player });
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
// minAge/maxAge gate events to fitting eras.
const R = (N, k) => Math.round(k * Math.pow(1.75, N.age)); // resource amounts scaled to the age
export const EVENTS = [
  { id: 'hunt', maxAge: 1, when: (sim, N) => { const r = pick(sim.regionsOf(N.code)); return r && { r }; }, title: 'The Great Herd',
    text: c => `Scouts report a vast herd migrating past ${c.rn}. The hunters are eager.`,
    options: [
      { label: 'Call a great hunt', fx: (sim, N) => { N.food += R(N, 20); return 'The hunt is a triumph. The stores are full.'; } },
      { label: 'Let them pass in peace', fx: (sim, N) => { N.gov.stability += 0.03; return 'The elders call it a sign of balance with the spirits.'; } }] },
  { id: 'comet', maxAge: 3, when: () => ({}), title: 'Fire in the Sky', text: () => 'A great comet burns across the night sky. The people are afraid.',
    options: [
      { label: 'Declare it a blessing', fx: (sim, N) => { N.gov.approval += 0.05; N.gov.pc += 15; return 'The priests proclaim a golden age.'; } },
      { label: 'Hold sacrifices to the gods', fx: (sim, N) => { N.food -= R(N, 6); N.gov.stability += 0.06; return 'The rites calm the people.'; } }] },
  { id: 'migrants', maxAge: 4, when: (sim, N) => { const r = pick(sim.regionsOf(N.code)); return r && { r }; }, title: 'Wanderers at the Gate',
    text: c => `A band of migrants arrives at ${c.rn}, fleeing drought. They ask to settle among us.`,
    options: [
      { label: 'Welcome them', fx: (sim, N, c) => { c.r.pop += 0.6 * Math.pow(1.6, N.age); N.gov.stability -= 0.02; return 'New hands for the fields, new mouths to feed.'; } },
      { label: 'Turn them away', fx: () => 'They move on into the wilderness.' }] },
  { id: 'plague', minAge: 1, maxAge: 6, when: (sim, N) => { const r = sim.regionsOf(N.code).sort((a, b) => b.pop - a.pop)[0]; return r && r.lvl >= 2 && { r }; }, title: 'Pestilence',
    text: c => `A sickness spreads through ${c.rn}. The healers are overwhelmed.`,
    options: [
      { label: 'Quarantine the town', fx: (sim, N, c) => { c.r.unrest = Math.min(1, c.r.unrest + 0.25); c.r.pop *= 0.97; return 'The disease is contained, at the cost of much anger.'; } },
      { label: 'Pray and carry on', fx: (sim, N, c) => { for (const r of sim.regionsOf(N.code)) r.pop *= 0.985; c.r.pop *= 0.93; return 'The plague burns through the land before it fades.'; } }] },
  { id: 'raiders', maxAge: 5, when: (sim, N) => { const r = sim.regionsOf(N.code).find(x => sim.w.adj[x.i].some(j => !sim.w.regions[j].sea && !sim.s.regions[j].owner)); return r && { r }; }, title: 'Raiders from the Wilds',
    text: c => `Tribesmen from the wilderness raided the outskirts of ${c.rn}, carrying off grain and livestock.`,
    options: [
      { label: 'Pay them off', fx: (sim, N) => { N.food -= R(N, 8); return 'The raiders accept gifts and promise peace.'; } },
      { label: 'Punitive expedition', fx: (sim, N, c) => { c.r.unrest = Math.min(1, c.r.unrest + 0.1); for (const u of sim.unitsOf(N.code)) u.xp = Math.min(100, (u.xp || 0) + 4); return 'Our warriors burn their camps. The frontier is quiet, for now.'; } }] },
  { id: 'prophet', minAge: 1, maxAge: 5, when: () => ({}), title: 'A Prophet Preaches', text: () => 'A charismatic prophet draws great crowds, preaching against the wealthy and the powerful.',
    options: [
      { label: 'Embrace the movement', fx: (sim, N) => { N.gov.approval += 0.06; N.gov.pc -= 15; return 'The prophet blesses your rule.'; } },
      { label: 'Silence the prophet', fx: (sim, N) => { N.gov.stability += 0.04; N.gov.approval -= 0.05; return 'The prophet vanishes. The crowds whisper.'; } }] },
  { id: 'harvest', when: () => ({}), title: 'Bountiful Harvest', text: () => 'Perfect rains and sun: the granaries overflow.',
    options: [
      { label: 'Store it all', fx: (sim, N) => { N.food += R(N, 15); return 'Reserves swell.'; } },
      { label: 'Hold a festival', fx: (sim, N) => { N.food += R(N, 5); N.gov.approval += 0.05; return 'Feasting and dancing for days.'; } }] },
  { id: 'scandal', minAge: 1, when: (sim, N) => { const ids = Object.values(N.gov.cabinet); const ch = sim.s.chars[pick(ids)]; return ch && { ch }; },
    title: 'Corruption at Court', text: (c, N) => `${c.ch.name} (${roleTitle(c.ch.role, N.age)}) is accused of skimming from the stores.`,
    options: [
      { label: 'Disgrace them publicly', fx: (sim, N, c) => { N.gov.approval += 0.04; c.ch.skill = Math.max(1, c.ch.skill - 2); c.ch.traits = c.ch.traits.filter(t => t !== 'Loyalist'); return `${c.ch.name} keeps the post, humiliated and diminished.`; } },
      { label: 'Stand by them', fx: (sim, N, c) => { N.gov.approval -= 0.06; c.ch.loyalty = 1; return `${c.ch.name} is grateful and fiercely loyal now.`; } }] },
  { id: 'general', when: (sim, N) => { const g = sim.s.chars[pick(N.generals || [])]; return g && { g }; },
    title: 'The Commander\'s Request', text: c => `${c.g.name} asks for more resources to drill the warriors, warning that our forces are unready.`,
    options: [
      { label: 'Grant the request', fx: (sim, N, c) => { N.wealth -= R(N, 6); N.food -= R(N, 4); c.g.skill = Math.min(10, c.g.skill + 1); c.g.loyalty = Math.min(1, c.g.loyalty + 0.15); for (const u of sim.unitsOf(N.code)) u.xp = Math.min(100, (u.xp || 0) + 6); return 'Readiness improves across the host.'; } },
      { label: 'Refuse', fx: (sim, N, c) => { c.g.loyalty = Math.max(0, c.g.loyalty - 0.2); return `${c.g.name} leaves tight-lipped.`; } }] },
  { id: 'breakthrough', when: (sim, N) => N.research?.cur && { tech: N.research.cur }, title: 'Flash of Insight', text: c => `Our scholars report an unexpected insight into ${TECH[c.tech].name}.`,
    options: [
      { label: 'Fund it generously', fx: (sim, N) => { N.wealth -= R(N, 5); N.research.prog += TECH[N.research.cur || 'stone_tools'].cost * 0.35; return 'The work leaps ahead.'; } },
      { label: 'Share it with neighbours', fx: (sim, N) => { N.research.prog += TECH[N.research.cur || 'stone_tools'].cost * 0.15; for (const c of N.known || []) sim.addOpinion(c, N.code, 4); return 'Neighbours admire our generosity.'; } }] },
  { id: 'protests', minAge: 2, when: (sim, N) => N.gov.stability < 0.4 && {}, title: 'Unrest in the Streets', text: c => `Angry crowds gather in ${c.cap}. Stability is fragile.`,
    options: [
      { label: 'Offer concessions (40 PC)', fx: (sim, N) => { N.gov.pc -= 40; N.gov.approval += 0.08; N.gov.stability += 0.05; return 'The crowds disperse peacefully.'; } },
      { label: 'Crack down', fx: (sim, N) => { N.gov.stability += 0.1; N.gov.approval -= 0.1; for (const c of N.known || []) sim.addOpinion(c, N.code, -3); return 'Order is restored by force.'; } }] },
  { id: 'disaster', when: (sim, N) => { const r = pick(sim.regionsOf(N.code)); return r && { r }; }, title: 'Natural Disaster',
    text: c => `A devastating ${pick(['earthquake', 'flood', 'storm', 'wildfire', 'drought'])} strikes ${c.rn}.`,
    options: [
      { label: 'Full relief effort', fx: (sim, N) => { N.wealth -= R(N, 6); N.food -= R(N, 6); N.gov.approval += 0.06; return 'Your response is praised.'; } },
      { label: 'Let them fend for themselves', fx: (sim, N, c) => { c.r.pop *= 0.96; c.r.damage = Math.min(0.8, c.r.damage + 0.15); N.gov.approval -= 0.06; return 'Survivors feel abandoned.'; } }] },
  { id: 'spies', minAge: 2, when: (sim, N) => { const rivals = (N.known || []).filter(c => sim.s.nations[c]?.alive && sim.opinion(N.code, c) < 0); return rivals.length && { rival: pick(rivals) }; },
    title: 'Spies Uncovered', text: (c, N, sim) => `Our watchers caught agents of the ${sim.nm(c.rival)} among the court.`,
    options: [
      { label: 'Expel their envoys', fx: (sim, N, c) => { sim.addOpinion(N.code, c.rival, -15); sim.addOpinion(c.rival, N.code, -15); N.gov.stability += 0.02; return 'A diplomatic row erupts.'; } },
      { label: 'Feed them false reports', fx: (sim, N) => { N.spyBonus = (N.spyBonus || 0) + 0.25; return 'A priceless channel into their councils.'; } }] },
  { id: 'weary', when: (sim, N) => N.exhaustion > 0.35 && sim.warsOf(N.code).length && {}, title: 'War Weariness', text: () => 'The dead are many. The people question the war.',
    options: [
      { label: 'Rally the people (30 PC)', fx: (sim, N) => { N.gov.pc -= 30; N.exhaustion = Math.max(0, N.exhaustion - 0.12); return 'Your words steady the home front.'; } },
      { label: 'Ignore the grumbling', fx: (sim, N) => { N.gov.approval -= 0.05; return 'Approval slides.'; } }] },
  { id: 'coupplot', minAge: 1, when: (sim, N) => { const g = (N.generals || []).map(id => sim.s.chars[id]).find(c => c && c.traits.includes('Ambitious') && c.loyalty < 0.7); return g && N.gov.stability < 0.55 && { g }; },
    title: 'A Plot in the Ranks', text: c => `Whispers say ${c.g.name} is sounding out the officers about "restoring order".`,
    options: [
      { label: 'Arrest them', fx: (sim, N, c) => { N.generals = N.generals.filter(id => id !== c.g.id); for (const gp of sim.s.groups) if (gp.general === c.g.id) gp.general = null; N.gov.stability -= 0.04; return `${c.g.name} is seized at dawn.`; } },
      { label: 'Buy their loyalty (50 PC)', fx: (sim, N, c) => { N.gov.pc -= 50; c.g.loyalty = 0.95; c.g.traits = c.g.traits.filter(t => t !== 'Ambitious'); return 'Land, titles and honours settle the matter.'; } }] },
  { id: 'ai', minAge: 9, when: (sim, N) => N.techs.machine_learning && {}, title: 'Emergent AI Capabilities', text: () => 'A government AI system has begun proposing policies nobody asked for. Several are brilliant. Some are unsettling.',
    options: [
      { label: 'Deploy it across ministries', fx: (sim, N) => { N.gov.pc += 40; N.research.prog += TECH[N.research.cur || 'internet'].cost * 0.2; N.gov.stability -= 0.04; return 'Bureaucracy accelerates. Civil-liberties groups protest.'; } },
      { label: 'Pause and audit', fx: (sim, N) => { N.gov.stability += 0.03; return 'The system is sandboxed pending review.'; } }] },
];

export function rollEvent(sim, N) {
  const order = [...EVENTS].sort(() => Math.random() - 0.5);
  for (const e of order) {
    if (N.lastEvents?.includes(e.id)) continue;
    if ((e.minAge ?? 0) > N.age || (e.maxAge ?? 99) < N.age) continue;
    const ctx = e.when(sim, N); if (!ctx) continue;
    if (ctx.r) ctx.rn = sim.w.regions[ctx.r.i].name;
    ctx.cap = sim.w.regions[N.capital].name;
    N.lastEvents = [...(N.lastEvents || []), e.id].slice(-6);
    return { id: e.id, ctx, title: e.title, text: e.text(ctx, N, sim), options: e.options.map(o => o.label) };
  }
  return null;
}
export function resolveEvent(sim, N, ev, k) {
  const e = EVENTS.find(x => x.id === ev.id); if (!e) return '';
  if (ev.ctx.r && typeof ev.ctx.r === 'object' && ev.ctx.r.i !== undefined) ev.ctx.r = sim.s.regions[ev.ctx.r.i];
  if (ev.ctx.ch) ev.ctx.ch = sim.s.chars[ev.ctx.ch.id] || ev.ctx.ch;
  if (ev.ctx.g) ev.ctx.g = sim.s.chars[ev.ctx.g.id] || ev.ctx.g;
  const out = e.options[k].fx(sim, N, ev.ctx);
  N.gov.approval = clamp(N.gov.approval, 0, 1); N.gov.stability = clamp(N.gov.stability, 0, 1); N.gov.pc = Math.max(0, N.gov.pc);
  N.food = Math.max(0, N.food); N.wealth = Math.max(-50, N.wealth);
  computeMods(sim.s, N);
  sim.emit('gov', `${e.title}: ${out}`, [N.code]);
  return out;
}
