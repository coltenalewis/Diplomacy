// The Second World War: the world of 1 September 1939. Builds the nations, empires and puppet states of 1939 on the
// map (ww2data.js), the Axis, the Allies and the Comintern, and the wars already under way; then runs what makes the
// war the war: capitulation and occupation, blockade and embargo, Lend-Lease, resistance in occupied lands, the conduct
// of the war (and the war crimes a government may order, each recorded and each with its price), tribunals, and the end.
import { WW2_NATIONS, OWNER_1939, REGION_1939, FACTIONS, WARS_1939, OPINIONS_1939, RULER_1939 } from './ww2data.js';
import { COUNTRIES, REGION_FIXES } from './countries.js';
import { makePact, developLand, seedStores, fixArticles } from './modern.js';
import { TECHS, techsBefore } from './tech.js';
import { initGovernment, computeMods, GOV_TYPES } from './gov.js';
import { onNewNation } from './society.js';
import { cultureOf, personName } from './names.js';
import { earn, leavePact, pactsOf } from './pacts.js';
import { UNITS, bestOf } from './units.js';

export const WW2_AGE = 8;
export const WW2_ECON = 0.25, WW2_ECON_FROM = 7; // buildings and thresholds of the 1930s, scaled to the 1939 economy
export const WW2_DOY = 243; // 1 September
export const WW2_YEAR = 1939 + WW2_DOY / 365;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[(Math.random() * a.length) | 0];
const DAY = 24;
// day of the war (0 = 1 September 1939) for a date, on the game's 365-day calendar
const MONTH0 = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
export const warDay = (y, m, d) => (y - 1939) * 365 + MONTH0[m - 1] + d - 1 - WW2_DOY;
export const today = s => Math.floor(s.t / DAY);
// nation code of a 1939 state by key ('Germany'), if it still stands
export function K(sim, key) { const c = sim.s.ww2?.code[key]; return c && sim.s.nations[c]?.alive ? c : null; }
export const keyOf = (sim, c) => sim.s.nations[c]?.key;

// ------------------------------------------------------------------ the map of 1939
export function territories1939(world) {
  for (const R of world.regions) if (!R.sea && REGION_FIXES[R.name]) R.country = REGION_FIXES[R.name];
  const out = new Map();
  for (const R of world.regions) {
    if (R.sea || !R.country) continue;
    const owner = REGION_1939[R.name] || OWNER_1939[R.country] || R.country;
    if (!out.has(owner)) out.set(owner, []);
    out.get(owner).push(R.i);
  }
  return out;
}
// the nations of 1939, including the small independent states the dataset leaves to their modern names
const LATIN = new Set(['Peru', 'Colombia', 'Venezuela', 'Ecuador', 'Honduras', 'Bolivia', 'Uruguay', 'Nicaragua', 'Chile', 'Paraguay', 'Guatemala', 'Cuba', 'Panama', 'Dominican Rep.', 'Costa Rica', 'El Salvador', 'Haiti']);
const SMALL_NAME = { Nepal: 'Kingdom of Nepal', Yemen: 'Mutawakkilite Kingdom of Yemen', Liberia: 'Republic of Liberia', Cuba: 'Republic of Cuba', 'Dominican Rep.': 'Dominican Republic' };
export function nations1939(lands) {
  const out = [];
  for (const d of WW2_NATIONS) if (lands.has(d.k)) out.push(d);
  for (const k of lands.keys()) {
    if (out.some(d => d.k === k)) continue;
    const c = COUNTRIES.find(x => x.n === k);
    const latin = LATIN.has(k);
    const pop = +((c?.pop || 2) * (k === 'Uruguay' || k === 'Cuba' ? 0.45 : 0.22)).toFixed(1);
    out.push({ k, s: c?.s || k, adj: c?.adj || k, f: SMALL_NAME[k] || (latin ? `Republic of ${c?.s || k}` : c?.f || k), cap: c?.cap || null, pop, gdp: +(pop * (latin ? 2.4 : 0.8)).toFixed(1),
      gov: latin ? 'presidential' : 'absolute', mil: latin ? 3 : 2, fa: c?.fa || 'cat', side: null, col: c?.col || null, ideo: latin ? 'authoritarian' : 'monarchy', brut: 0.1, lord: null });
  }
  return out;
}
// development 0..1 from income per head (thousands of 1990 dollars)
export const dev1939 = d => clamp((Math.log10(Math.max(0.2, d.gdp / Math.max(0.05, d.pop))) + 0.5) / 1.43, 0.05, 0.95);

// technologies each power already fields in September 1939, beyond the interwar baseline
const HEAD_START = {
  Germany: ['blitzkrieg', 'dive_bombing', 'airborne_forces', 'war_economy', 'synthetic_fuel', 'codebreaking', 'mobilisation', 'radar'],
  'United Kingdom': ['convoy_system', 'sonar', 'radar', 'codebreaking', 'naval_aviation'], 'United States': ['sonar', 'naval_aviation', 'dive_bombing', 'radar'],
  Japan: ['naval_aviation', 'dive_bombing', 'war_economy', 'mobilisation'], 'Soviet Union': ['airborne_forces', 'war_economy', 'mobilisation'],
  France: ['naval_aviation'], Italy: ['mobilisation'], Poland: ['codebreaking'],
};
const NO_TECH = ['naval_aviation', 'radar']; // only the leading powers start with these
// how each army fought in 1939: training, doctrine, leadership (folded into the modifiers by gov.js computeMods).
// fade: the edge of the early-war Blitzkrieg wears off as the enemy learns (by 1943)
const DOCTRINE = {
  Germany: { atkLand: 0.35, defLand: 0.15, atkAir: 0.2, fade: true }, Japan: { atkLand: 0.2, atkSea: 0.2, atkAir: 0.15, fade: true }, Finland: { defLand: 0.6 },
  'United Kingdom': { atkSea: 0.15, defAir: 0.25, defSea: 0.1 }, 'United States': { prod: 0.15 }, 'Soviet Union': { defLand: 0.15 }, France: { defLand: 0.1 },
  Italy: { atkLand: -0.15, defLand: -0.1 }, China: { atkLand: -0.25, defLand: 0.05 }, Poland: { atkLand: -0.1 }, 'British India': { atkLand: -0.1 },
};
const TRAITS_1939 = {
  Germany: { aggression: 0.9, caution: 0.2, loyalty: 0.3 }, Japan: { aggression: 0.85, caution: 0.3 }, Italy: { aggression: 0.55, caution: 0.45 }, 'Soviet Union': { aggression: 0.6, caution: 0.5 },
  'United States': { aggression: 0.15, caution: 0.75, loyalty: 0.8 }, 'United Kingdom': { aggression: 0.3, caution: 0.6, loyalty: 0.85 }, France: { aggression: 0.2, caution: 0.75, loyalty: 0.75 },
  Switzerland: { aggression: 0.02, caution: 0.95 }, Sweden: { aggression: 0.05, caution: 0.9 }, Spain: { aggression: 0.2, caution: 0.8 }, Turkey: { aggression: 0.15, caution: 0.85 }, Portugal: { aggression: 0.05, caution: 0.9 },
};
// standing forces in September 1939: [land, warships, submarines, carriers, aircraft]; tanks share of the land forces
const FORCES = {
  Germany: [30, 6, 6, 0, 10], Poland: [16, 1, 1, 0, 2], France: [26, 9, 4, 1, 6], 'United Kingdom': [10, 16, 3, 6, 8], Italy: [16, 9, 5, 0, 6], Japan: [20, 12, 3, 6, 8],
  'Soviet Union': [32, 4, 4, 0, 10], 'United States': [6, 14, 4, 5, 6], China: [22, 0, 0, 0, 1], 'British India': [8, 1, 0, 0, 1], Canada: [3, 2, 0, 0, 1], Australia: [3, 2, 0, 0, 1],
  'New Zealand': [1, 1, 0, 0, 0], 'South Africa': [2, 0, 0, 0, 0], Manchukuo: [4, 0, 0, 0, 0], Mongolia: [2, 0, 0, 0, 0], Netherlands: [5, 2, 1, 0, 1], 'Dutch East Indies': [3, 2, 1, 0, 1],
  Belgium: [8, 0, 0, 0, 1], Spain: [8, 2, 1, 0, 1], Turkey: [9, 1, 0, 0, 1], Sweden: [4, 2, 1, 0, 1], Finland: [6, 0, 0, 0, 1], Romania: [8, 1, 0, 0, 1], Yugoslavia: [8, 0, 0, 0, 1],
  Greece: [5, 1, 0, 0, 0], Hungary: [5, 0, 0, 0, 1], Bulgaria: [4, 0, 0, 0, 0], Portugal: [2, 1, 0, 0, 0], Norway: [2, 1, 0, 0, 0], Denmark: [1, 1, 0, 0, 0], Switzerland: [4, 0, 0, 0, 0],
  Brazil: [4, 1, 0, 0, 0], Argentina: [3, 2, 0, 0, 0], Mexico: [3, 0, 0, 0, 0], Thailand: [3, 1, 0, 0, 0], Iran: [3, 0, 0, 0, 0], Egypt: [2, 0, 0, 0, 0], Slovakia: [2, 0, 0, 0, 0],
};
const TANKS = { Germany: 0.25, France: 0.15, 'United Kingdom': 0.2, 'Soviet Union': 0.22, 'United States': 0.15, Italy: 0.08, Japan: 0.08, Poland: 0.06 };
// 1939 calibration of the economy (modern.js seedStores): food self-sufficiency, oil, output per unit of GDP
const FOOD_1939 = { 'United Kingdom': 0.6, Germany: 0.85, Japan: 0.85, Italy: 0.9, Belgium: 0.7, Netherlands: 0.85, Switzerland: 0.6, Norway: 0.7, Greece: 0.8, 'United States': 1.25, Canada: 1.6, Australia: 1.6,
  'New Zealand': 1.7, Argentina: 1.7, 'Soviet Union': 1.05, Romania: 1.3, Hungary: 1.3, Yugoslavia: 1.15, Denmark: 1.4, Poland: 1.1, 'British India': 1.0, China: 0.97, Manchukuo: 1.2, Thailand: 1.3, Brazil: 1.2, France: 1.02 };
const OIL_1939 = { 'United States': 1.7, 'Soviet Union': 1.4, Venezuela: 6, Iran: 5, Iraq: 4, Romania: 3, 'Dutch East Indies': 3, Mexico: 2, 'Saudi Arabia': 2, Peru: 1.5, Colombia: 1.5, Argentina: 0.6,
  Germany: 0.55, Japan: 0.15, Italy: 0.2, 'United Kingdom': 0.05, France: 0.05, Poland: 0.4, Hungary: 0.3, 'British India': 0.2, Egypt: 0.6 };
const K1939 = { food: FOOD_1939, oil: OIL_1939, wealth: 0.3, metal: 0.2, wood: 0.04, rp: 0.6, treasury: [20, 30] };
// elections due in wartime (days from 1 September 1939); Britain's is postponed until the war in Europe is won
const ELECTIONS_1939 = { 'United States': warDay(1940, 11, 5), Canada: warDay(1940, 3, 26), Australia: warDay(1940, 9, 21), 'New Zealand': warDay(1943, 9, 25), Sweden: warDay(1940, 9, 15),
  'United Kingdom': warDay(1945, 7, 5), Switzerland: warDay(1943, 10, 31), Ireland: warDay(1943, 6, 22), Finland: warDay(1945, 3, 17), 'South Africa': warDay(1943, 7, 7), Mexico: warDay(1940, 7, 7) };

export function setupWW2(sim, opts) {
  const s = sim.s, w = sim.w;
  s.modern = true; // the shared machinery of real nations: calendar, GDP economy, demography, budgets, elections
  s.ww2 = { code: {}, fired: {}, log: [], usTension: 0, lendLease: false, outrage: {}, beaten: [], exiles: [] };
  s.year = s.startYear = WW2_YEAR; s.startAge = WW2_AGE; s.emergence = true;
  s.temper = 0.45;
  const lands = territories1939(w);
  for (const [, tiles] of lands) for (const i of tiles) sim.T[i].country = w.regions[i].country;
  const all = nations1939(lands);
  const chosen = opts.country && lands.has(opts.country) ? opts.country : 'United Kingdom';
  const order = all.sort((a, b) => (b.k === chosen) - (a.k === chosen) || b.gdp - a.gdp);
  order.forEach((d, k) => { s.ww2.code[d.k] = 'C' + k; });
  s.player = s.ww2.code[chosen];
  for (const d of order) createNation(sim, d, lands.get(d.k), s.ww2.code[d.k]);
  sim.rebuildCaches();
  const codes = Object.values(s.ww2.code);
  for (const c of codes) { s.nations[c].known = codes.filter(x => x !== c); s.nations[c].seat = s.nations[c].capital; }
  const at = k => s.ww2.code[k];
  // puppets and the Raj
  for (const d of order) if (d.lord && at(d.lord)) { const V = s.nations[at(d.k)]; V.overlord = at(d.lord); V.tribute = 0.15; V.vassalSince = -DAY * 365 * 5; sim.setRel(at(d.k), at(d.lord), 'alliance'); }
  for (const [a, b, v] of OPINIONS_1939) if (at(a) && at(b)) { sim.setOpinion(at(a), at(b), v); sim.setOpinion(at(b), at(a), v); }
  for (const d of order) if (d.lord && at(d.lord)) { sim.setOpinion(at(d.k), at(d.lord), 30); sim.setOpinion(at(d.lord), at(d.k), 40); }
  // the pact between the dictators, signed eight days ago
  if (at('Germany') && at('Soviet Union')) sim.setRel(at('Germany'), at('Soviet Union'), 'nap');
  // the factions
  s.pacts = []; s.pactId = 1;
  for (const [key, F] of Object.entries(FACTIONS)) {
    const members = order.filter(d => d.side === key).map(d => at(d.k));
    if (members.length < 1) continue;
    const chair = members.slice().sort((a, b) => s.nations[b].gdp - s.nations[a].gdp)[0];
    const P = makePact(s, key, F.name, F.preset, F.doctrines, members, chair, F.col);
    P.faction = key; P.founded = -DAY * 365;
    s.pacts.push(P);
    for (const a of members) for (const b of members) if (a !== b) sim.setOpinion(a, b, Math.max(sim.rawOpinion(a, b), 40));
  }
  // the wars already under way
  for (const [a, b] of WARS_1939) if (at(a) && at(b)) {
    sim.setRel(at(a), at(b), 'war');
    for (const v of sim.vassalsOf(at(a))) if (v !== at(b)) sim.setRel(v, at(b), 'war');
  }
  if (at('Slovakia') && at('Poland')) sim.setRel(at('Slovakia'), at('Poland'), 'war'); // the Slovak army marched with the Wehrmacht
  for (const c of codes) seedStores(sim, s.nations[c], K1939);
  for (const [a, b] of WARS_1939) if (at(a) && at(b)) frontLine(sim, at(a), at(b));
  if (at('China')) s.nations[at('China')].exhaustion = 0.25; // two years of war already
  if (at('Poland') && at('Poland') !== s.player) s.nations[at('Poland')].boosts = [{ until: DAY * 40, fx: { defLand: -0.25 } }]; // cavalry and biplanes against the panzers
  if (at('Japan')) s.nations[at('Japan')].exhaustion = 0.1;
}

function createNation(sim, d, tiles, code) {
  const s = sim.s, T = sim.T, w = sim.w;
  const dev = dev1939(d);
  let capital = tiles[0];
  if (d.cap) { let best = Infinity; for (const i of tiles) { const R = w.regions[i]; const x = Math.hypot(R.lat - d.cap[1], (R.lon - d.cap[2]) * Math.cos(d.cap[1] * Math.PI / 180)); if (x < best) { best = x; capital = i; } } }
  const g = GOV_TYPES[d.gov] ? d.gov : 'presidential';
  const auth = !GOV_TYPES[g].democratic;
  const tr = TRAITS_1939[d.k] || {};
  // the interwar baseline, the 1930s according to development, and each power's own lead
  const techs = techsBefore(7);
  const odds = clamp(dev * 1.4 - 0.05, 0.1, 1);
  for (const x of TECHS) if (x.age === 7 && !NO_TECH.includes(x.id) && Math.random() < odds) techs[x.id] = 1;
  for (const id of ['trench_warfare', 'combustion', 'flight', 'radio', 'propaganda']) if (dev > 0.25 || d.mil >= 8) techs[id] = 1;
  if (auth && dev > 0.3) techs.totalitarianism = 1;
  for (const id of HEAD_START[d.k] || []) techs[id] = 1;
  for (let changed = true; changed;) { changed = false; for (const x of TECHS) if (techs[x.id] && x.req.some(r => !techs[r])) { delete techs[x.id]; changed = true; } }
  for (const id of HEAD_START[d.k] || []) techs[id] = 1; // a head start stands even where the tree lags
  const N = {
    code, key: d.k, name: d.s, adj: d.adj, official: d.f, country: d.k, color: d.col || '#8a93a6',
    culture: cultureOf(T[capital]), alive: true, ai: code !== s.player, capital, age: WW2_AGE, ageAdv: null,
    traits: {
      aggression: tr.aggression ?? clamp((d.ideo === 'fascist' ? 0.6 : auth ? 0.3 : 0.12) + Math.random() * 0.15, 0, 0.9),
      caution: tr.caution ?? clamp((auth ? 0.45 : 0.65) + Math.random() * 0.2, 0, 1),
      loyalty: tr.loyalty ?? clamp(0.5 + Math.random() * 0.35, 0, 1), expansion: d.ideo === 'fascist' ? 0.6 : 0.15,
      science: clamp(0.25 + dev * 0.6 + Math.random() * 0.1, 0, 1),
    },
    techs, research: { cur: null, prog: 0, queue: [] },
    food: 0, wood: 0, stone: 0, metal: 0, wealth: 0, oil: 0, queue: [], exhaustion: 0, st: {}, access: {}, known: [],
    warheads: 0, warheadProg: 0, opCooldown: {}, directives: { industry: 'off', defense: 'off', science: 'off', foreign: 'off', budget: 0.35 }, delegateEvents: false,
    aiBonus: code === s.player ? 0 : (s.difficulty || 0), formed: null, born: 0,
    gdp: d.gdp, popM: d.pop, mil: d.mil, blocs: [], dev, faith0: d.fa, homeTiles: tiles.length,
    growth: clamp(0.02 - 0.014 * dev, 0.002, 0.02),
    side: d.side, ideo: d.ideo, brut: d.brut, conduct: {}, crimes: {}, guilt: 0, doctrine: DOCTRINE[d.k] || null,
  };
  s.nations[code] = N;
  for (const i of tiles) { const r = s.regions[i]; r.owner = r.core = code; r.natives = 0; r.unrest = auth ? 0.08 : 0.04; }
  sim.owned ||= new Map(); sim.owned.set(code, new Set(tiles));
  onNewNation(sim, N, { tiles });
  initGovernment(s, N);
  N.gov.type = g;
  N.gov.leaderName = personName(N.culture, WW2_AGE);
  N.gov.title = RULER_1939[d.ideo] || null;
  // war budgets: the dictatorships are already on a war footing
  const df = clamp(0.12 + d.mil / 190 + (auth ? 0.08 : 0), 0.1, 0.6), r = clamp(0.08 + dev * 0.12, 0.06, 0.25), soc = clamp(0.2 + dev * 0.15 - (auth ? 0.08 : 0), 0.08, 0.4);
  const sum = df + r + soc + 0.18; N.budget = { defense: df / sum, social: soc / sum, infra: 0.18 / sum, research: r / sum };
  if (GOV_TYPES[g].democratic) N.gov.nextElection = DAY * (ELECTIONS_1939[d.k] ?? Math.round(500 + Math.random() * 1500));
  N.gov.stability = clamp(0.55 + dev * 0.25 + (auth ? 0.05 : 0), 0.3, 0.9);
  N.gov.approval = clamp(0.5 + Math.random() * 0.12 + (auth ? 0.08 : 0), 0.3, 0.8);
  if (N.gov.laws) N.gov.laws.religion = d.fa === 'sun' || d.fa === 'shi' ? 'state' : dev > 0.5 ? 'secular' : 'tolerance';
  computeMods(s, N);
  developLand(sim, N, { pop: d.pop, mil: d.mil, nk: 0, n: d.k }, tiles, dev);
  computeMods(s, N);
  raiseForces1939(sim, N, d, tiles);
  return N;
}

function raiseForces1939(sim, N, d, tiles) {
  const s = sim.s;
  const [land, ships, subs, cars, air] = FORCES[d.k] || [Math.round(1 + d.mil * 0.3), d.mil >= 6 ? 1 : 0, 0, 0, d.mil >= 8 ? 1 : 0];
  const tank = TANKS[d.k] ?? 0.04;
  const sites = tiles.slice().sort((a, b) => s.regions[b].pop - s.regions[a].pop).slice(0, Math.max(1, Math.ceil(land / 3)));
  for (let k = 0; k < land; k++) {
    const f = k / Math.max(1, land);
    const line = (k + 0.5) / land < tank ? 'CAV' : k % 7 === 3 ? 'SGE' : k % 9 === 5 ? 'RNG' : k % 11 === 8 ? 'AA' : 'INF';
    const t = bestOf(N, line) || bestOf(N, 'INF');
    if (t) sim.spawn(N.code, t, sites[k % sites.length]);
  }
  const coast = tiles.filter(i => sim.T[i].coastal);
  if (coast.length && ships + subs + cars) {
    const port = coast.includes(N.capital) ? N.capital : coast.sort((a, b) => s.regions[b].pop - s.regions[a].pop)[0];
    const sea = sim.seaNear(port);
    // the American Pacific Fleet lies at Pearl Harbor
    const pacific = d.k === 'United States' ? sim.landIdx.find(i => sim.w.regions[i].name === 'Hawaii' || (Math.abs(sim.T[i].lat - 20.8) < 1.5 && Math.abs(sim.T[i].lon + 157) < 2.5)) : null;
    const pSea = pacific != null ? sim.seaNear(pacific) : -1;
    if (sea >= 0) {
      for (let k = 0; k < ships; k++) { const t = bestOf(N, 'NAV'); if (t) sim.spawn(N.code, t, pSea >= 0 && k % 2 ? pSea : sea); }
      for (let k = 0; k < subs; k++) { const t = bestOf(N, 'SUB'); if (t) sim.spawn(N.code, t, sea); }
      for (let k = 0; k < cars; k++) { const t = bestOf(N, 'CAR'); if (t) sim.spawn(N.code, t, pSea >= 0 && k % 2 === 0 ? pSea : sea); }
      if (ships >= 6) { const t = bestOf(N, 'TRN'); if (t) sim.spawn(N.code, t, sea); }
    }
  }
  for (let k = 0; k < air; k++) { const t = bestOf(N, k % 2 ? 'BMB' : 'FTR'); if (t) sim.spawn(N.code, t, N.capital); }
}

// the armies of two warring states face each other along their border
export function frontLine(sim, a, b) {
  const s = sim.s, w = sim.w;
  for (const [x, y] of [[a, b], [b, a]]) {
    const border = [...sim.owned.get(x)].filter(i => w.adj[i].some(j => s.regions[j].owner === y));
    if (!border.length) continue;
    const army = s.units.filter(u => u.nation === x && !w.regions[u.loc].sea && UNITS[u.type].domain === 'land' && u.loc !== s.nations[x].capital);
    army.slice(0, Math.ceil(army.length * 0.75)).forEach((u, k) => { u.loc = border[k % border.length]; u.pos = null; sim.placeUnit(u, true); });
  }
}

// one side's army redeploys to its border with another (the player moves their own armies)
export function frontOne(sim, x, y) {
  const s = sim.s, w = sim.w;
  if (!x || !y || x === s.player || !sim.owned.get(x)) return;
  const border = [...sim.owned.get(x)].filter(i => w.adj[i].some(j => s.regions[j].owner === y));
  if (!border.length) return;
  const others = new Set(sim.warsOf(x).filter(e => e !== y));
  const army = s.units.filter(u => u.nation === x && !w.regions[u.loc].sea && UNITS[u.type].domain === 'land' && !u.partisan && u.loc !== s.nations[x].capital && !w.adj[u.loc].some(j => others.has(s.regions[j].owner)));
  army.slice(0, Math.ceil(army.length * 0.6)).forEach((u, k) => { u.loc = border[k % border.length]; u.move = null; u.pos = null; sim.placeUnit(u, true); });
}

// ------------------------------------------------------------------ entering the war
// a declaration of war that does not cascade through every treaty (the timeline decides who follows whom)
export function enterWar(sim, a, b, text = null, follow = true) {
  if (!a || !b || a === b || sim.atWar(a, b)) return;
  const prev = sim.rel(a, b);
  sim.setRel(a, b, 'war');
  sim.addOpinion(b, a, -60);
  if (prev === 'nap' || prev === 'alliance') earn(sim, a, 'oathbreaker', 35);
  sim.s.trades = sim.s.trades.filter(t => !((t.from === a && t.to === b) || (t.from === b && t.to === a)));
  if (follow) for (const v of sim.vassalsOf(a)) if (v !== b && !sim.atWar(v, b) && !sim.s.nations[v].occupied) sim.setRel(v, b, 'war');
  for (const v of sim.vassalsOf(b)) if (v !== a && !sim.atWar(v, a) && !sim.s.nations[v].occupied) sim.setRel(v, a, 'war'); // an empire's possessions are at war with it
  sim.emit('war', text || `The ${sim.nm(a)} declare war on the ${sim.nm(b)}${prev === 'nap' ? ', tearing up their pact' : ''}.`, [a, b], { loc: sim.s.nations[b].capital, major: true });
  sim.s.nations[a].ww2Fought = true; sim.s.nations[b].ww2Fought = true;
}
export function faction(sim, c) { return (sim.s.pacts || []).find(P => P.faction && P.members.includes(c)) || null; }
export function factionPact(sim, key) { return (sim.s.pacts || []).find(P => P.faction === key) || null; }
export function joinFaction(sim, c, key) {
  const s = sim.s; let P = factionPact(sim, key);
  if (!P) { const F = FACTIONS[key]; P = makePact(s, key, F.name, F.preset, F.doctrines, [c], c, F.col); P.faction = key; s.pacts.push(P); }
  for (const Q of pactsOf(sim, c)) if (Q.faction && Q !== P) leavePact(sim, Q, c, 'leave');
  if (!P.members.includes(c)) P.members.push(c);
  s.nations[c].side = key;
  for (const m of P.members) if (m !== c) { sim.addOpinion(m, c, 20); sim.addOpinion(c, m, 20); }
  sim.emit('treaty', `The ${sim.nm(c)} join the ${P.name}.`, [c, P.chair], { loc: s.nations[c].capital, major: true });
}
// enemies of a faction's members (for 'they are at war with the Axis')
export function atWarWithSide(sim, c, key) { const P = factionPact(sim, key); return !!P && P.members.some(m => sim.atWar(c, m)); }

// ------------------------------------------------------------------ capitulation and occupation
// share of a nation's own provinces held by its enemies
// (the homeland, not the empire: France falls when France falls, whatever it still holds in Africa)
export function lostShare(sim, c) {
  const s = sim.s, N = s.nations[c]; if (!N) return 0;
  const seat = N.seat ?? N.capital, home = sim.T[seat]?.country; // the provinces of the same (modern) country as the capital
  let core = 0, lost = 0;
  for (const r of s.regions) {
    if (r.core !== c || (home && sim.T[r.i].country !== home)) continue;
    core++; if (r.owner !== c && r.owner && sim.atWar(c, r.owner)) lost++;
  }
  return core ? lost / core : 0;
}
function capitalLost(sim, c) { const r = sim.s.regions.find(x => x.core === c && sim.s.nations[c].seat === x.i); return r ? r.owner !== c : false; }
function checkCapitulation(sim) {
  const s = sim.s;
  for (const N of Object.values(s.nations)) {
    if (!N.alive || N.occupied || !sim.warsOf(N.code).length) continue;
    N.seat ??= N.capital;
    const lost = lostShare(sim, N.code), cap = capitalLost(sim, N.code);
    const big = N.key === 'Soviet Union' || N.key === 'China' || N.key === 'United States'; // the vast states fight on long after their capitals fall
    const breaking = big ? lost >= 0.6 && (cap || N.exhaustion > 0.7) : (cap && lost >= 0.35) || lost >= 0.6 || (N.exhaustion > 0.85 && lost >= 0.2);
    if (breaking) capitulate(sim, N.code);
  }
}
export function capitulate(sim, c) {
  const s = sim.s, N = s.nations[c];
  // the victor: the enemy holding the most of its land
  const held = {};
  for (const r of s.regions) if (r.core === c && r.owner && r.owner !== c && sim.atWar(c, r.owner)) held[r.owner] = (held[r.owner] || 0) + 1;
  const victor = Object.entries(held).sort((a, b) => b[1] - a[1])[0]?.[0] || sim.warsOf(c)[0];
  if (!victor) return;
  const lost = lostShare(sim, c);
  const foes = sim.warsOf(c);
  const fallen = N.key || N.name;
  s.ww2.beaten.push({ c, by: victor, t: s.t });
  // a war-crimes tribunal awaits a beaten government with blood on its hands
  if (N.guilt >= 20) tribunal(sim, c, victor);
  if (lost >= 0.8 || sim.regionsOf(c).length <= 1) {
    // nothing is left to govern: the last provinces are annexed, the government flees into exile
    const emit = sim.emit; sim.emit = () => {}; // one announcement, not one per province
    try { for (const r of sim.regionsOf(c)) sim.transfer(r, victor, true, 'conquest'); } finally { sim.emit = emit; }
    if (s.nations[c]?.alive === false || !sim.regionsOf(c).length) s.ww2.exiles.push({ c, name: fallen, t: s.t });
    sim.emit('war', `${sim.full(c)} has fallen. Its government escapes into exile; its people live under occupation.`, [c, victor], { major: true, loc: N.capital });
    return;
  }
  // an armistice: the occupier keeps what it holds; a client government administers the rest
  for (const e of foes) sim.makePeace(c, e, true);
  for (const P of pactsOf(sim, c)) leavePact(sim, P, c, 'leave');
  for (const P of pactsOf(sim, c)) P.members = P.members.filter(m => m !== c);
  sim._vmap = null;
  N.overlord = victor; N.tribute = 0.35; N.vassalSince = s.t; N.occupied = { by: victor, since: s.t }; N.exhaustion = 0.3;
  sim._vmap = null;
  sim.setRel(c, victor, 'nap');
  N.gov.leaderName = personName(N.culture, WW2_AGE); N.gov.title = 'Chief of State';
  N.gov.approval = 0.25; N.gov.stability = 0.35;
  // the army is demobilised under the armistice
  const army = sim.unitsOf(c);
  army.forEach((u, k) => { if (k % 4) sim.removeUnit(u); });
  sim.emit('war', `${sim.full(c)} capitulates. The ${sim.nm(victor)} occupy ${Math.round(lost * 100)}% of the country; a client government under ${N.gov.leaderName} signs the armistice.`, [c, victor], { major: true, loc: N.capital });
  if (c === s.player) sim.emit('info', 'Your country is occupied. The war goes on without you, for now: rebuild, wait, and when the occupier weakens, rise.', [c], { major: true });
}
// the beaten government's crimes are judged
function tribunal(sim, c, victor) {
  const s = sim.s, N = s.nations[c];
  const kinds = Object.entries(N.crimes || {}).filter(([, v]) => v > 0).map(([k]) => CRIMES[k]?.law).filter(Boolean);
  s.ww2.log.push({ t: s.t, c, kind: 'tribunal', text: `Tribunal: the leaders of the ${sim.nm(c)} are tried for ${kinds.join(', ') || 'war crimes'}.` });
  sim.emit('war', `War crimes tribunal: the ${sim.nm(victor)} put the leaders of the ${sim.nm(c)} on trial for ${kinds.slice(0, 3).join(', ') || 'war crimes'}. The record of the war is read out before the world.`, [c, victor], { major: true });
  N.gov.leaderName = personName(N.culture, WW2_AGE);
  N.guilt = Math.round(N.guilt * 0.3);
  earn(sim, victor, 'liberator', 12);
}

// ------------------------------------------------------------------ the conduct of the war
// What a government may order. The ones the laws of war forbid are recorded as war crimes, and every one has a cost:
// world opinion, the victims' resolve, partisans in occupied lands, neutrals drawn toward the war, and the tribunal.
export const CRIMES = {
  terror: { name: 'Terror bombing', law: 'the deliberate bombing of civilians', crime: true, guilt: 8, icon: '💥', kind: 'act',
    desc: 'Send the bombers against an enemy city, not its armies, to break the people\'s will.', fx: 'The city burns: its industry is wrecked and its people flee. But a bombed people rarely breaks; it hardens.' },
  reprisals: { name: 'Reprisals', law: 'the collective punishment of civilians', crime: true, guilt: 1.5, icon: '⛓️', kind: 'policy',
    desc: 'Answer every act of resistance in occupied lands by punishing whole towns.', fx: 'Unrest is crushed for now, but every reprisal breeds the next generation of partisans.' },
  forced_labour: { name: 'Forced labour', law: 'the deportation of civilians for slave labour', crime: true, guilt: 1.2, icon: '⚒️', kind: 'policy',
    desc: 'Conscript the men and women of occupied lands for the war factories.', fx: 'Occupied provinces yield metal and wealth for the war effort, while their people dwindle and resentment grows.' },
  subs: { name: 'Unrestricted submarine warfare', law: 'sinking merchant ships without warning', crime: true, guilt: 0.4, icon: '🌊', kind: 'policy',
    desc: 'Order the submarines to sink every ship bound for the enemy, neutral or not, without warning.', fx: 'Enemy imports and trade wither; neutral nations, and the United States above all, turn against you.' },
  gas: { name: 'Poison gas', law: 'the use of chemical weapons (Geneva Protocol, 1925)', crime: true, guilt: 10, icon: '☣️', kind: 'act',
    desc: 'Release gas on the front against one enemy for a month.', fx: 'Your armies strike far harder for thirty days. The world is appalled, and the enemy may answer in kind.' },
  plunder: { name: 'Plunder', law: 'pillage of occupied territory', crime: true, guilt: 4, icon: '💰', kind: 'act',
    desc: 'Strip an occupied city of its treasuries, gold reserves and art.', fx: 'A windfall of wealth now; lasting hatred in the province.' },
  scorched: { name: 'Scorched earth', law: 'wanton destruction not justified by military necessity', crime: false, guilt: 0, icon: '🔥', kind: 'act',
    desc: 'Destroy the factories, farms and bridges of a province before the enemy takes it.', fx: 'The enemy gains nothing there, but your own people lose their homes and livelihoods.' },
};
export const CRIME_ORDER = ['subs', 'terror', 'gas', 'reprisals', 'forced_labour', 'plunder', 'scorched'];

// regions a nation occupies (held by it, but another nation's core)
export const occupiedBy = (sim, c) => sim.regionsOf(c).filter(r => r.core && r.core !== c);
// enemy cities a nation's bombers can reach
export function bomberTargets(sim, c) {
  const s = sim.s, bmb = s.units.filter(u => u.nation === c && UNITS[u.type].line === 'BMB');
  if (!bmb.length) return [];
  const R = Math.max(...bmb.map(u => UNITS[u.type].radius || 1300));
  const out = [];
  for (const r of s.regions) {
    if (r.sea || !r.owner || r.lvl < 3 || !sim.atWar(c, r.owner)) continue;
    const near = bmb.some(u => sim.kmTo ? sim.kmTo(u.loc, r.i) <= R : kmLL(sim, u.loc, r.i) <= R);
    if (near) out.push(r);
  }
  return out.sort((a, b) => b.pop - a.pop).slice(0, 12);
}
function kmLL(sim, i, j) { const a = sim.T[i], b = sim.T[j]; const R = 6371, d = Math.PI / 180; const h = Math.sin((b.lat - a.lat) * d / 2) ** 2 + Math.cos(a.lat * d) * Math.cos(b.lat * d) * Math.sin((b.lon - a.lon) * d / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); }

// can c do this (now, against target)?
export function canConduct(sim, c, kind, target = null) {
  const s = sim.s, N = s.nations[c], X = CRIMES[kind];
  if (!N?.alive || !X) return { ok: false, why: 'Not possible.' };
  N.conduct ||= {}; N.crimes ||= {};
  if (N.occupied) return { ok: false, why: 'Your armistice forbids it.' };
  const wars = sim.warsOf(c);
  if (!wars.length && kind !== 'scorched') return { ok: false, why: 'You are not at war.' };
  if (kind === 'subs') { if (!s.units.some(u => u.nation === c && UNITS[u.type].line === 'SUB')) return { ok: false, why: 'You have no submarines.' }; return { ok: true }; }
  if (kind === 'reprisals' || kind === 'forced_labour') { if (!occupiedBy(sim, c).length) return { ok: false, why: 'You occupy no foreign provinces.' }; return { ok: true }; }
  if (kind === 'terror') { const t = bomberTargets(sim, c); if (!t.length) return { ok: false, why: 'No enemy city lies within reach of your bombers.' }; if (target != null && !t.some(r => r.i === target)) return { ok: false, why: 'Out of range.' }; return { ok: true, targets: t }; }
  if (kind === 'gas') { if (!N.techs.chemistry) return { ok: false, why: 'Needs Chemistry.' }; if ((N.gasUntil || 0) > s.t) return { ok: false, why: 'Gas is already in use on the front.' }; return { ok: true, targets: wars }; }
  if (kind === 'plunder') { const t = occupiedBy(sim, c).filter(r => r.lvl >= 3 && !(r.plundered > s.t - DAY * 365)); if (!t.length) return { ok: false, why: 'No occupied city is left to plunder.' }; return { ok: true, targets: t.sort((a, b) => b.pop - a.pop).slice(0, 10) }; }
  if (kind === 'scorched') { const t = sim.regionsOf(c).filter(r => sim.w.adj[r.i].some(j => { const o = s.regions[j].owner; return o && sim.atWar(c, o); }) && Object.values(r.bld || {}).some(v => v > 0)); if (!t.length) return { ok: false, why: 'No province of yours is on the front line.' }; return { ok: true, targets: t.slice(0, 12) }; }
  return { ok: false, why: 'Not possible.' };
}

// order it. Returns { ok, text }
export function conduct(sim, c, kind, target = null) {
  const chk = canConduct(sim, c, kind, target); if (!chk.ok) return chk;
  const s = sim.s, N = s.nations[c], X = CRIMES[kind], w = sim.w;
  let text = '', victim = null;
  if (X.kind === 'policy') {
    N.conduct[kind] = !N.conduct[kind];
    if (!N.conduct[kind]) { sim.emit('gov', `The ${sim.nm(c)} rescind the order: ${X.name.toLowerCase()} ends.`, [c]); return { ok: true, text: `${X.name} ends.` }; }
    text = kind === 'subs' ? `The ${sim.nm(c)} declare unrestricted submarine warfare: any ship bound for their enemies will be sunk without warning.` : kind === 'reprisals' ? `The ${sim.nm(c)} order reprisals in the occupied territories: for every attack, a town will pay.` : `The ${sim.nm(c)} begin deporting the people of the occupied territories for forced labour.`;
    victim = kind === 'subs' ? sim.warsOf(c)[0] : mostOccupied(sim, c);
    record(sim, c, kind, victim, text, X.guilt * 4);
    return { ok: true, text };
  }
  if (kind === 'terror') {
    const r = s.regions[target ?? chk.targets[0].i]; victim = r.owner;
    const V = s.nations[victim];
    r.damage = clamp((r.damage || 0) + 0.35, 0, 0.9); r.pop *= 0.95; r.unrest = clamp(r.unrest + 0.15, 0, 1);
    for (const k of Object.keys(r.bld)) if (r.bld[k] > 0 && Math.random() < 0.35) r.bld[k]--;
    V.gov.approval = clamp(V.gov.approval + 0.03, 0, 1); V.exhaustion = Math.max(0, V.exhaustion - 0.03); // a bombed people hardens
    for (const u of s.units.filter(u => u.nation === c && UNITS[u.type].line === 'BMB')) { u.hp = Math.max(1, u.hp - u.mhp * 0.12); }
    text = `${sim.nm(c)} bombers set ${w.regions[r.i].name} ablaze in a night of terror bombing.`;
    const bu = s.units.find(u => u.nation === c && UNITS[u.type].line === 'BMB');
    if (bu?.pos) sim.shots.push({ a: bu.pos, b: sim.slot({ id: (Math.random() * 1e6) | 0, type: 'INF0' }, r.i), k: 'bomb', n: c });
    record(sim, c, kind, victim, text, X.guilt, r.i);
  } else if (kind === 'gas') {
    victim = target && sim.atWar(c, target) ? target : chk.targets[0];
    N.gasUntil = s.t + DAY * 30; N.gasOn = victim;
    text = `The ${sim.nm(c)} release poison gas against the ${sim.nm(victim)} on the front.`;
    record(sim, c, kind, victim, text, X.guilt);
    // retaliation in kind
    const V = s.nations[victim];
    if (V?.alive && V.techs.chemistry && !V.gasUntil && Math.random() < 0.5) { V.gasUntil = s.t + DAY * 20; V.gasOn = c; sim.emit('war', `The ${sim.nm(victim)} answer gas with gas.`, [victim, c], { major: true }); }
  } else if (kind === 'plunder') {
    const r = s.regions[target ?? chk.targets[0].i]; victim = r.core;
    const v = (N.st.prod?.wealth || 1) * (6 + r.lvl * 4);
    N.wealth += v; r.plundered = s.t; r.resent = clamp((r.resent || 0) + 0.4, 0, 1); r.unrest = clamp(r.unrest + 0.25, 0, 1); r.damage = clamp((r.damage || 0) + 0.1, 0, 0.9);
    text = `The ${sim.nm(c)} strip ${w.regions[r.i].name} of its gold, treasuries and art (${Math.round(v)} wealth).`;
    record(sim, c, kind, victim, text, X.guilt, r.i);
  } else if (kind === 'scorched') {
    const r = s.regions[target ?? chk.targets[0].i];
    for (const k of Object.keys(r.bld)) r.bld[k] = Math.max(0, r.bld[k] - 2);
    for (const k of Object.keys(r.imp || {})) r.imp[k] = Math.max(0, Math.floor(r.imp[k] / 3));
    r.pop *= 0.9; r.unrest = clamp(r.unrest + 0.2, 0, 1); N.gov.approval = clamp(N.gov.approval - 0.02, 0, 1);
    text = `The ${sim.nm(c)} burn the factories, farms and bridges of ${w.regions[r.i].name} ahead of the enemy.`;
    const crime = r.core !== c; // on someone else's land it is plain destruction
    if (crime) record(sim, c, kind, r.core, text, 4, r.i, true); else sim.emit('war', text, [c], { loc: r.i });
  }
  return { ok: true, text };
}
function mostOccupied(sim, c) { const n = {}; for (const r of occupiedBy(sim, c)) n[r.core] = (n[r.core] || 0) + 1; return Object.entries(n).sort((a, b) => b[1] - a[1])[0]?.[0] || null; }
// the record, and its consequences
function record(sim, c, kind, victim, text, guilt, loc = null, forceCrime = false) {
  const s = sim.s, N = s.nations[c], X = CRIMES[kind];
  N.crimes[kind] = (N.crimes[kind] || 0) + 1;
  N.guilt = (N.guilt || 0) + guilt;
  if (X.crime || forceCrime) earn(sim, c, 'criminal', guilt * 1.2);
  s.ww2.log.push({ t: s.t, c, kind, victim, text: fixArticles(sim, text) });
  if (s.ww2.log.length > 200) s.ww2.log.shift();
  sim.emit('war', `${text} The world calls it a war crime.`, [c, ...(victim ? [victim] : [])], { major: guilt >= 4, loc: loc ?? (victim ? s.nations[victim]?.capital : undefined) });
  // world opinion: neutrals and the victims' friends most of all; fellow brutal regimes shrug
  for (const X2 of Object.values(s.nations)) {
    if (!X2.alive || X2.code === c) continue;
    const shrug = 1 - (X2.brut || 0.1) * 0.8;
    const fv = victim && faction(sim, victim), k = X2.code === victim ? 2 : victim && (sim.friendly(X2.code, victim) || (fv && faction(sim, X2.code) === fv)) ? 1.2 : !sim.warsOf(X2.code).length ? 0.8 : 0.5;
    sim.addOpinion(X2.code, c, -guilt * 0.9 * k * shrug);
  }
  // democracies at home are shaken by it; the victims fight harder
  if (GOV_TYPES[N.gov.type]?.democratic) N.gov.approval = clamp(N.gov.approval - guilt * 0.004, 0, 1);
  if (victim && s.nations[victim]) s.nations[victim].exhaustion = Math.max(0, s.nations[victim].exhaustion - guilt * 0.003);
  // America watches
  const us = K(sim, 'United States');
  if (us && us !== c && !sim.atWar(us, c) && faction(sim, c)?.faction !== 'Allies') s.ww2.usTension += guilt * (kind === 'subs' ? 3 : 1);
}

// ------------------------------------------------------------------ the daily war
export function ww2Daily(sim) {
  const s = sim.s, W = s.ww2; if (!W) return;
  checkCapitulation(sim);
  const us = K(sim, 'United States');
  for (const N of Object.values(s.nations)) {
    if (!N.alive) continue;
    N.conduct ||= {}; N.crimes ||= {}; N.guilt ||= 0; // nations born in the war (revolutions, independence)
    const c = N.code, wars = sim.warsOf(c);
    if (wars.length) N.ww2Fought = true;
    // blockade: at war with a great navy, imports come through only in part
    let block = 0;
    for (const e of wars) { const navy = s.units.filter(u => u.nation === e && UNITS[u.type].domain === 'sea' && UNITS[u.type].role !== 'transport').length; block = Math.max(block, clamp(navy / 40, 0, 0.7)); }
    N.blockade = block;
    // occupation policies
    const occ = occupiedBy(sim, c);
    if (N.conduct.forced_labour && occ.length) {
      let yieldW = 0;
      for (const r of occ) { const k = Math.min(1, r.pop / 400); yieldW += k; r.pop *= 0.9995; r.resent = clamp((r.resent || 0) + 0.004, 0, 1); r.unrest = clamp(r.unrest + 0.002, 0, 1); }
      N.wealth += (N.st.prod?.wealth || 1) * 0.01 * yieldW; N.metal += (N.st.prod?.metal || 1) * 0.015 * yieldW;
      if (today(s) % 30 === 0) record(sim, c, 'forced_labour', mostOccupied(sim, c), `Deportations for forced labour continue in the lands occupied by the ${sim.nm(c)}.`, CRIMES.forced_labour.guilt);
    }
    if (N.conduct.reprisals && occ.length) {
      for (const r of occ) { r.unrest = Math.max(0, r.unrest - 0.02); r.resent = clamp((r.resent || 0) + 0.003, 0, 1); }
      if (today(s) % 30 === 0) record(sim, c, 'reprisals', mostOccupied(sim, c), `Hostages are shot and villages burned in reprisal in the lands occupied by the ${sim.nm(c)}.`, CRIMES.reprisals.guilt);
    }
    if (N.conduct.subs && wars.length) {
      for (const e of wars) { const E = s.nations[e]; E.wealth -= (E.st.prod?.wealth || 0) * 0.02 * Math.min(1, sim.unitsOf(c).filter(u => UNITS[u.type].line === 'SUB').length / 6); }
      if (us && us !== c && !sim.atWar(us, c)) { W.usTension += 0.05; sim.addOpinion(us, c, -0.05); }
      if (today(s) % 45 === 0) record(sim, c, 'subs', wars[0], `${N.adj} submarines sink merchant ships without warning.`, CRIMES.subs.guilt);
    }
    if (N.gasUntil && N.gasUntil < s.t) { N.gasUntil = 0; N.gasOn = null; computeMods(s, N); }
    if (N.occupied && N.overlord !== N.occupied.by) { N.occupied = null; sim.emit('war', `The ${sim.nm(c)} throw off the occupation and take up arms again.`, [c], { major: true, loc: N.capital }); }
    // the guilty slowly lose the benefit of the doubt; the guiltless regain it
    N.guilt = Math.max(0, (N.guilt || 0) * 0.9995);
    // the occupied: a client regime's people endure and resist
    if (N.occupied && !s.nations[N.occupied.by]?.alive) { N.occupied = null; N.overlord = null; sim._vmap = null; sim.emit('war', `The occupation of the ${sim.nm(c)} ends with the fall of their occupier.`, [c], { major: true }); }
  }
  partisans(sim);
  lendLease(sim);
  // the United States is drawn into the war when Axis outrages accumulate
  if (us && W.usTension >= 250 && !W.usIn && today(s) > warDay(1941, 1, 1)) {
    const foe = ['Germany', 'Japan', 'Italy'].map(k => K(sim, k)).find(x => x && !sim.atWar(us, x) && (s.nations[x].guilt > 15 || s.nations[x].conduct.subs));
    if (foe) { W.usIn = true; usEntersWar(sim, foe, 'Outrage upon outrage: Congress declares war.'); }
  }
  if (us) W.usTension = Math.max(0, W.usTension - 0.03);
  aiConduct(sim);
  checkEnd(sim);
}
export function usEntersWar(sim, foe, why) {
  const s = sim.s, us = K(sim, 'United States'); if (!us || !foe) return;
  if (us === s.player) { sim.emit('war', `${why} The nation demands war with the ${sim.nm(foe)}.`, [us, foe], { major: true }); s.nations[us].gov.approval = clamp(s.nations[us].gov.approval + 0.1, 0, 1); return; }
  enterWar(sim, us, foe, `${why} The United States declare war on the ${sim.nm(foe)}.`);
  if (!faction(sim, us)) joinFaction(sim, us, 'Allies');
  s.nations[us].budget = { defense: 0.5, social: 0.2, infra: 0.15, research: 0.15 };
}
// resistance in occupied lands: unrest, sabotage, and partisan bands for governments that fight on
function partisans(sim) {
  const s = sim.s;
  for (const r of s.regions) {
    if (r.sea || !r.owner || !r.core || r.core === r.owner) continue;
    const C = s.nations[r.core]; if (!C) continue;
    const resent = r.resent || 0;
    r.unrest = clamp(r.unrest + 0.0015 * (1 + resent * 3), 0, 1);
    const fighting = C.alive && sim.atWar(r.core, r.owner);
    if (Math.random() < 0.0012 * (1 + resent * 4) * (0.5 + r.unrest)) {
      if (fighting && !s.units.some(u => u.loc === r.i && u.nation === r.core)) {
        const t = bestOf(C, 'INF'); if (t) { const u = sim.spawn(r.core, t, r.i); if (u) u.partisan = true; }
        if (r.core === s.player || r.owner === s.player) sim.emit('battle', `Partisans of the ${sim.nm(r.core)} rise in ${sim.w.regions[r.i].name}.`, [r.core, r.owner], { loc: r.i });
      } else {
        r.damage = clamp((r.damage || 0) + 0.08, 0, 0.8);
        if (r.owner === s.player) sim.emit('battle', `Resistance fighters sabotage the railways and factories of ${sim.w.regions[r.i].name}.`, [r.owner], { loc: r.i });
      }
    }
  }
}
// the arsenal of democracy: American aid to the nations fighting the Axis
function lendLease(sim) {
  const s = sim.s, W = s.ww2, us = K(sim, 'United States');
  for (const N of Object.values(s.nations)) if (N.alive && N.lendLease) N.aid = 0;
  if (!W.lendLease || !us) return;
  const US = s.nations[us];
  const axis = ['Germany', 'Japan', 'Italy'].map(k => K(sim, k)).filter(Boolean);
  const rec = Object.values(s.nations).filter(N => N.alive && N.code !== us && !N.occupied && axis.some(a => sim.atWar(N.code, a)) && sim.opinion(us, N.code) > -20);
  if (!rec.length) return;
  const budget = (US.st.prod?.wealth || 0) * 0.12;
  const tot = rec.reduce((a, N) => a + Math.sqrt(N.gdp || 1), 0);
  US.wealth -= budget;
  for (const N of rec) { N.aid = budget * Math.sqrt(N.gdp || 1) / tot; N.lendLease = true; N.metal += N.aid * 0.5; N.oil = (N.oil || 0) + N.aid * 0.05; }
}
// AI governments wage the war as their character dictates, crimes included
function aiConduct(sim) {
  const s = sim.s; if (today(s) % 7) return;
  for (const N of Object.values(s.nations)) {
    if (!N.alive || !N.ai || N.occupied || !sim.warsOf(N.code).length) continue;
    const b = N.brut || 0, c = N.code, years = (s.t / DAY) / 365;
    const occ = occupiedBy(sim, c).length;
    if (!N.conduct.subs && b > 0.4 && atWarWithNavy(sim, c) && canConduct(sim, c, 'subs').ok && Math.random() < 0.3) conduct(sim, c, 'subs');
    if (!N.conduct.subs && N.key === 'United States' && K(sim, 'Japan') && sim.atWar(c, K(sim, 'Japan')) && canConduct(sim, c, 'subs').ok) conduct(sim, c, 'subs'); // as ordered on 7 December 1941
    if (!N.conduct.reprisals && b > 0.55 && occ >= 2 && Math.random() < 0.25) conduct(sim, c, 'reprisals');
    if (!N.conduct.forced_labour && b > 0.6 && occ >= 4 && Math.random() < 0.2) conduct(sim, c, 'forced_labour');
    if (b > 0.5 && Math.random() < b * 0.12 && canConduct(sim, c, 'terror').ok) conduct(sim, c, 'terror');
    else if (b <= 0.5 && years > 2.5 && N.techs.strategic_bombing && Math.random() < 0.05 && canConduct(sim, c, 'terror').ok) conduct(sim, c, 'terror'); // the area bombing of the war's last years
    if (b > 0.7 && occ && Math.random() < 0.05 && canConduct(sim, c, 'plunder').ok) conduct(sim, c, 'plunder');
    if (N.exhaustion > 0.3 && (N.key === 'Soviet Union' || b > 0.6) && Math.random() < 0.15 && canConduct(sim, c, 'scorched').ok) conduct(sim, c, 'scorched');
  }
}
function atWarWithNavy(sim, c) { return sim.warsOf(c).some(e => sim.unitsOf(e).filter(u => UNITS[u.type].domain === 'sea').length >= 8); }

// ------------------------------------------------------------------ the end of the war
function checkEnd(sim) {
  const s = sim.s, W = s.ww2, P = s.nations[s.player];
  if (s.over || !P) return;
  const great = ['Germany', 'Japan', 'Italy', 'United Kingdom', 'France', 'Soviet Union', 'United States', 'China'];
  // victory: you fought, and every great power at war with you has been beaten
  if (P.alive && !P.occupied && P.ww2Fought && today(s) > 60) {
    // the war is over for your whole coalition, and at least one enemy great power has been beaten by it
    const F = faction(sim, s.player);
    const side = new Set([s.player, ...(F ? F.members : []), ...sim.alliesOf(s.player)]);
    const fighting = [...side].some(c => s.nations[c]?.alive && !s.nations[c].occupied && sim.warsOf(c).some(e => great.includes(s.nations[e]?.key) && !s.nations[e].occupied));
    const beat = W.beaten.filter(b => great.includes(s.nations[b.c]?.key) && side.has(b.by));
    if (!fighting && beat.length && !sim.warsOf(s.player).length) {
      s.over = true; s.winner = s.player; s.winType = 'victory';
      sim.emit('war', `Victory. The guns fall silent; the ${sim.full(s.player)} stands among the victors. ${P.guilt > 20 ? 'But the record of what was done in your name will outlive you.' : 'History will remember how you won as well as that you won.'}`, [s.player], { major: true });
      return;
    }
  }
  if (!P.alive) { s.over = true; s.winner = null; s.winType = 'defeat'; sim.emit('war', 'Your nation has been conquered. Its government lives on in exile; the war is lost.', [s.player], { major: true }); return; }
  if (s.year >= 1948) {
    const best = Object.values(s.nations).filter(n => n.alive).sort((a, b) => sim.score(b.code) - sim.score(a.code))[0];
    s.over = true; s.winner = best.code; s.winType = 'score';
    sim.emit('war', `1948: the war is over, or has burned itself out. History judges the ${sim.full(best.code)} the strongest power left standing.`, [best.code], { major: true });
  }
}

// how large an army an AI government wants: the economy decides, and total war multiplies it
export function ww2Want(sim, N, wars, base) {
  const s = sim.s, k = Math.max(2, (N.gdp || 10) / 6) * (N.occupied ? 0.3 : 1), aggr = N.traits?.aggression ?? 0.3;
  let want = wars.length ? k * (1.6 + 0.6 * aggr) + (N.warNeed || 0) : k * (0.45 + 0.4 * aggr);
  // the Soviet Union and the United States rearm as the war comes closer
  const de = K(sim, 'Germany'), jp = K(sim, 'Japan');
  if (N.key === 'Soviet Union' && de && !sim.atWar(N.code, de) && today(s) > 300) want += k * 0.6;
  if (N.key === 'United States' && !wars.length && today(s) > 280) want += k * 0.3 * Math.min(1, (today(s) - 280) / 400);
  if (N.key === 'Japan' && jp && N.embargo) want += k * 0.3;
  return Math.max(base * 0.5, want);
}

// AI restraint for the 1939 world: who may start a war of choice
// the Phoney War: the Allies sit behind the Maginot Line, and the Germans behind the West Wall, until Germany strikes west
const WEST = ['France', 'United Kingdom', 'Canada', 'Australia', 'New Zealand', 'South Africa', 'British India', 'Belgium', 'Netherlands'];
export function ww2Offensive(sim, c, e) {
  const s = sim.s, A = s.nations[c], E = s.nations[e];
  if (!A?.ai || !E) return true;
  if (s.ww2.fired.w_fall_gelb !== undefined || today(s) > warDay(1940, 6, 1)) return true;
  const west = k => WEST.includes(k);
  if (A.key === 'Germany' && west(E.key)) return false;
  if (E.key === 'Germany' && west(A.key)) return lostShare(sim, c) > 0;
  return true;
}
// puppets and colonies do not rise while their masters stand; the occupied rise when the occupier falters
export function ww2MayRise(sim, c) {
  const s = sim.s, N = s.nations[c], O = s.nations[N.overlord];
  if (!O?.alive || O.occupied) return true;
  if (N.occupied) return lostShare(sim, N.overlord) > 0.3 || O.exhaustion > 0.75 || sim.power(N.overlord) < sim.power(c) * 0.8;
  return false;
}
export function ww2MayAttack(sim, c, o) {
  const s = sim.s, A = s.nations[c], B = s.nations[o];
  if (!A || !B || A.occupied || B.occupied) return false;
  const fa = faction(sim, c), fb = faction(sim, o);
  if (fa && fb && fa === fb) return false;
  if (A.ideo !== 'fascist' && A.ideo !== 'communist') return false; // the democracies and the old monarchies do not start wars
  if (A.key === 'Germany' || A.key === 'Japan' || A.key === 'Soviet Union' || A.key === 'Italy') return false; // the great aggressors keep to the timeline (ww2-events.js)
  return sim.opinion(c, o) < -30;
}
// AI peace between the great coalitions is unconditional surrender; side wars may end by treaty
export function ww2MayMakePeace(sim, c, e) {
  const fa = faction(sim, c)?.faction, fb = faction(sim, e)?.faction;
  const main = new Set(['Axis', 'Allies']);
  if (fa && fb && main.has(fa) && main.has(fb) && fa !== fb) return false;
  const A = sim.s.nations[c], B = sim.s.nations[e];
  if ((A.key === 'Japan' && B.key === 'China') || (A.key === 'China' && B.key === 'Japan')) return false;
  if ((A.key === 'Germany' && B.key === 'Soviet Union') || (A.key === 'Soviet Union' && B.key === 'Germany')) return false;
  return true;
}
