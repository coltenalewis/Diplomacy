// The world of 2025. Builds every real country from countries.js on the map: its territory, people, cities,
// infrastructure, economy, armed forces, nuclear arsenal, government, faith, alliances, rivalries and wars, and the
// blocs of the real world (NATO, the EU, BRICS...) with the United Nations above them.
import { COUNTRIES, REGION_FIXES, TERRITORY_OF, ALLIANCES, WARS, OPINIONS, BLOCS, P5, FAITHS_2025 } from './countries.js';
import { SETTLEMENTS, BUILDINGS, bestOf } from './units.js';
import { IMPROVEMENTS, IMP_CAP } from './resources.js';
import { TECHS, TECH, techsBefore } from './tech.js';
const TECH_AGE = new Proxy({}, { get: (_, id) => TECH[id]?.age });
import { initGovernment, computeMods, GOV_TYPES } from './gov.js';
import { onNewNation } from './society.js';
import { cultureOf, civColor } from './names.js';

export const MODERN_AGE = 9;
export const MODERN_ECON = 0.08; // prices scaled to the GDP-calibrated economy (eras.js setEconomyScale)
export const START_YEAR = 2025;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NUCLEAR_TECHS = ['nuclear_weapons', 'thermonuclear', 'icbm'];
// how much of the frontier a country already commands
const BASELINE = [
  [0, ['internet', 'social_media', 'globalization', 'renewables']],
  [0.35, ['cyber_warfare', 'counter_terrorism', 'precision_munitions', 'electric_vehicles', 'genetic_engineering']],
  [0.55, ['machine_learning', 'robotics', 'network_warfare']],
];
// distinctive character of a few states (0..1); the rest follow from government and might
const TRAITS = {
  'Russia': { aggression: 0.75, caution: 0.35 }, 'North Korea': { aggression: 0.8, caution: 0.3 }, 'Israel': { aggression: 0.6, caution: 0.4 }, 'Iran': { aggression: 0.55 },
  'United States of America': { aggression: 0.45, caution: 0.5, loyalty: 0.8 }, 'China': { aggression: 0.45, caution: 0.65, science: 0.9 }, 'Switzerland': { aggression: 0.02, caution: 0.95 },
  'India': { aggression: 0.35, caution: 0.6 }, 'Pakistan': { aggression: 0.5 }, 'Turkey': { aggression: 0.5 }, 'Azerbaijan': { aggression: 0.6 }, 'Venezuela': { aggression: 0.45 },
  'Saudi Arabia': { aggression: 0.45 }, 'Japan': { aggression: 0.1, caution: 0.85, science: 0.9 }, 'Germany': { aggression: 0.1, caution: 0.85 }, 'South Korea': { science: 0.85 },
  'Ukraine': { aggression: 0.3, loyalty: 0.85 }, 'Taiwan': { aggression: 0.05, caution: 0.9, science: 0.85 }, 'Rwanda': { aggression: 0.55 },
};

export const countryByName = n => COUNTRIES.find(c => c.n === n);
// population growth per year where it differs from what development suggests
const GROWTH = { China: -0.001, Japan: -0.005, Russia: -0.003, 'South Korea': -0.002, Italy: -0.002, Germany: 0, Spain: 0, Poland: -0.002, Ukraine: -0.01, India: 0.008, Pakistan: 0.02,
  Bangladesh: 0.011, Indonesia: 0.008, Brazil: 0.005, Mexico: 0.007, 'United States of America': 0.005, 'United Kingdom': 0.006, France: 0.003, Turkey: 0.006, Iran: 0.007, Egypt: 0.016, Nigeria: 0.024, Ethiopia: 0.026, Taiwan: -0.001 };
// days from 1 January 2025 to the next national election, where known
const ELECTIONS = { Canada: 117, Australia: 122, Poland: 130, 'South Korea': 153, Philippines: 133, Germany: 1520, 'United Kingdom': 1600, Japan: 1300, India: 1580, Brazil: 640, France: 840,
  'United States of America': 1404, Argentina: 1020, Mexico: 1250, Italy: 950, Spain: 940, Turkey: 1210, Israel: 660, 'South Africa': 1580, Indonesia: 1500, Ukraine: 1000, Taiwan: 1105 };
// names that take the article in English: "the United States", but "France"
const ARTICLE = new Set(['United States', 'United Kingdom', 'Netherlands', 'Philippines', 'UAE', 'Czech Republic', 'Central African Republic', 'Dominican Republic', 'Falkland Islands', 'DR Congo', 'Gambia', 'Bahamas', 'Comoros', 'Maldives']);
// formal names that take the article: "the French Republic", "the Republic of Korea", but "Japan", "Ukraine"
export const officialTakesThe = f => /\bof\b/.test(f) || /^(United|Russian|Swiss|Hellenic|Czech|Slovak|Kyrgyz|Dominican|Central|Hashemite|Federal|Lao|Islamic|Gabonese|Togolese|Argentine|French|Italian|Portuguese|Commonwealth|Co-operative|Oriental|Federative|Plurinational|Bolivarian|Arab|Democratic|Socialist|Sultanate|State|Republic|Kingdom|Swiss|Slovak)\b/.test(f);
export const theOfficial = N => (N.official && officialTakesThe(N.official) ? 'the ' : '') + (N.official || N.name);
export function fixArticles(sim, text) {
  if (!sim._artRe) {
    const names = [...Object.values(sim.s.nations).map(N => N.name).filter(n => !ARTICLE.has(n)), ...Object.values(sim.s.nations).map(N => N.official).filter(f => f && !officialTakesThe(f))].sort((a, b) => b.length - a.length).map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    sim._artRe = names.length ? new RegExp(`\\b[Tt]he (${names.join('|')})(?![\\w-])`, 'g') : null;
  }
  return sim._artRe ? text.replace(sim._artRe, '$1') : text;
}
// importers buy what they lack on the world market: food and fuel, paid from revenue
export function worldMarket(sim, N) {
  const s = sim.s, st = N.st;
  for (const g of ['food', 'oil']) {
    const reserve = g === 'food' ? (st.foodCons || 0) * 20 : 30;
    if ((N[g] || 0) >= reserve) continue;
    const need = Math.max(0, reserve - (N[g] || 0)) * 0.25 + Math.max(0, -(st.net?.[g] || 0));
    const price = (s.prices[g] || 1) * 1.15, afford = Math.max(0, N.wealth || 0) / price;
    const buy = Math.min(need, afford * 0.5);
    if (buy <= 0) continue;
    N[g] = (N[g] || 0) + buy; N.wealth -= buy * price;
    N.imports = N.imports || {}; N.imports[g] = buy;
  }
}
// the map's regions, grouped by the country that governs them in 2025
export function territories(world) {
  for (const R of world.regions) if (!R.sea && REGION_FIXES[R.name]) R.country = REGION_FIXES[R.name];
  const out = new Map();
  for (const R of world.regions) {
    if (R.sea || !R.country) continue;
    const owner = TERRITORY_OF[R.country] || R.country;
    if (!countryByName(owner)) continue;
    if (!out.has(owner)) out.set(owner, []);
    out.get(owner).push(R.i);
  }
  return out;
}
// development 0..1 from income per head (thousands of dollars)
export const devOf = c => clamp((Math.log10(Math.max(0.2, c.gdp / Math.max(0.01, c.pop))) + 0.3) / 2.3, 0, 1);

export function setupModern(sim, opts) {
  const s = sim.s, w = sim.w;
  s.modern = true; s.year = START_YEAR; s.startAge = MODERN_AGE; s.emergence = true;
  s.temper = Math.min(s.temper || 1, 1) * 0.22; // the post-war order: wars of conquest are rare and costly
  const lands = territories(w);
  for (const [, tiles] of lands) for (const i of tiles) sim.T[i].country = w.regions[i].country;
  // the player leads the chosen country (C0); the rest follow, the most powerful first
  const chosen = opts.country && lands.has(opts.country) ? opts.country : 'United States of America';
  const order = COUNTRIES.filter(c => lands.has(c.n)).sort((a, b) => (b.n === chosen) - (a.n === chosen) || b.gdp - a.gdp);
  const codeOf = new Map();
  order.forEach((c, k) => codeOf.set(c.n, 'C' + k));
  s.player = codeOf.get(chosen);
  for (const c of order) createCountry(sim, c, lands.get(c.n), codeOf.get(c.n));
  sim.rebuildCaches();
  const all = [...codeOf.values()];
  for (const code of all) { const N = s.nations[code]; N.known = all.filter(x => x !== code); }
  // relations
  const at = n => codeOf.get(n);
  for (const [a, b, v] of OPINIONS) if (at(a) && at(b)) { sim.setOpinion(at(a), at(b), v); sim.setOpinion(at(b), at(a), v); }
  for (const [a, b] of ALLIANCES) if (at(a) && at(b)) sim.setRel(at(a), at(b), 'alliance');
  // Western aid keeps Ukraine's war economy running (wealth per day)
  if (at('Ukraine')) s.nations[at('Ukraine')].aid = 9;
  for (const [a, b] of WARS) if (at(a) && at(b)) { sim.setRel(at(a), at(b), 'war'); s.nations[at(a)].exhaustion = 0.25; s.nations[at(b)].exhaustion = 0.35; frontLine(sim, at(a), at(b)); }
  // the blocs of the world, and the United Nations over them
  s.pacts = []; s.pactId = 1;
  for (const [key, B] of Object.entries(BLOCS)) {
    const members = order.filter(c => c.b.includes(key)).map(c => at(c.n));
    if (members.length < 2) continue;
    const chair = members.slice().sort((a, b) => s.nations[b].gdp - s.nations[a].gdp)[0];
    s.pacts.push(makePact(s, key, B.name, B.preset, B.doctrines, members, chair, B.col));
    for (const a of members) for (const b of members) if (a !== b) sim.setOpinion(a, b, Math.max(sim.rawOpinion(a, b), 25));
  }
  const un = makePact(s, 'UN', 'United Nations', 'assembly', ['council', 'sanctions'], all, at('United States of America') || all[0], '#5aa9e6');
  un.veto = P5.map(at).filter(Boolean); un.un = true;
  s.pacts.unshift(un);
  // starting stores: a few months of the economy
  for (const code of all) seedStores(sim, s.nations[code]);
}

function makePact(s, key, name, preset, doctrines, members, chair, color) {
  const d = {}; for (const x of doctrines) d[x] = true;
  return { id: s.pactId++, key, name, preset, founder: chair, chair, members: members.slice(), doctrines: d, faith: null, color, founded: -24 * 365 * 30, nextSession: 24 * (30 + Math.round(Math.random() * 60)), log: [], bonus: { trade: 0, research: 0 } };
}

function createCountry(sim, c, tiles, code) {
  const s = sim.s, T = sim.T, w = sim.w;
  const dev = devOf(c);
  // the capital: the region nearest the real capital
  let capital = tiles[0], best = Infinity;
  for (const i of tiles) { const R = w.regions[i]; const d = Math.hypot(R.lat - c.cap[1], (R.lon - c.cap[2]) * Math.cos(c.cap[1] * Math.PI / 180)); if (d < best) { best = d; capital = i; } }
  const g = GOV_TYPES[c.gov] ? c.gov : 'presidential';
  const auth = ['autocracy', 'oneparty', 'junta', 'theocracy', 'absolute'].includes(g);
  const tr = TRAITS[c.n] || {};
  const techs = techsBefore(MODERN_AGE);
  for (const [min, list] of BASELINE) if (dev >= min) for (const id of list) techs[id] = 1;
  if (c.mil >= 45) { techs.stealth_tech = 1; techs.missile_defense = 1; techs.autonomous_systems = 1; }
  if (auth && dev > 0.3) techs.mass_surveillance = 1;
  // the frontier: a share of each tier according to development and the scale of the economy
  const reach = dev * 0.6 + Math.min(1, c.gdp / 5000) * 0.5;
  const odds = [0, clamp(reach * 1.2 - 0.15, 0, 1), clamp(reach - 0.45, 0, 1), clamp(reach - 0.85, 0, 1) * 0.6, 0, 0];
  for (const x of TECHS) if (x.age === MODERN_AGE && x.tier && Math.random() < odds[x.tier]) techs[x.id] = 1;
  if (!c.nk) for (const id of NUCLEAR_TECHS) delete techs[id];
  for (let changed = true; changed;) { changed = false; for (const x of TECHS) if (techs[x.id] && x.req.some(r => !techs[r])) { delete techs[x.id]; changed = true; } } // keep the tree consistent
  const N = {
    code, name: c.s, adj: c.adj, official: c.f, country: c.n, color: c.col || civColor(parseInt(code.slice(1), 10) * 7 + 3),
    culture: cultureOf(T[capital]), alive: true, ai: code !== s.player, capital, age: MODERN_AGE, ageAdv: null,
    traits: {
      aggression: tr.aggression ?? clamp((auth ? 0.45 : 0.18) + c.mil / 400 + Math.random() * 0.15, 0, 0.9),
      caution: tr.caution ?? clamp((auth ? 0.4 : 0.6) + Math.random() * 0.25, 0, 1),
      loyalty: tr.loyalty ?? clamp(0.45 + Math.random() * 0.4, 0, 1), expansion: auth ? 0.4 + Math.random() * 0.3 : 0.15 + Math.random() * 0.2,
      science: tr.science ?? clamp(0.25 + dev * 0.6 + Math.random() * 0.15, 0, 1),
    },
    techs, research: { cur: null, prog: 0, queue: [] },
    food: 0, wood: 0, stone: 0, metal: 0, wealth: 0, oil: 0, queue: [], exhaustion: 0, st: {}, access: {}, known: [],
    warheads: Math.round((c.nk || 0) / 25), warheadProg: 0, opCooldown: {}, directives: { industry: 'off', defense: 'off', science: 'off', foreign: 'off', budget: 0.35 }, delegateEvents: false,
    aiBonus: code === s.player ? 0 : (s.difficulty || 0), formed: null, born: 0,
    gdp: c.gdp, popM: c.pop, mil: c.mil, blocs: c.b, dev, faith0: c.fa, homeTiles: tiles.length, proliferator: c.n === 'Iran',
    growth: GROWTH[c.n] ?? clamp(0.026 - 0.025 * dev, -0.002, 0.026), // population growth per year
  };
  s.nations[code] = N;
  for (const i of tiles) { const r = s.regions[i]; r.owner = r.core = code; r.natives = 0; r.unrest = auth ? 0.08 : 0.04; }
  sim.owned ||= new Map(); sim.owned.set(code, new Set(tiles));
  onNewNation(sim, N, { tiles });
  initGovernment(s, N);
  N.gov.type = g;
  if (GOV_TYPES[g].democratic) N.gov.nextElection = 24 * (ELECTIONS[c.n] ?? Math.round(60 + Math.random() * 1400));
  N.gov.stability = clamp(0.55 + dev * 0.3 - (g === 'junta' ? 0.15 : 0), 0.3, 0.92);
  N.gov.approval = clamp(0.45 + Math.random() * 0.15 + (auth ? 0.1 : 0), 0.3, 0.75);
  if (N.gov.laws) {
    N.gov.laws.religion = g === 'theocracy' ? 'state' : (c.fa === 'sun' || c.fa === 'shi') && auth ? 'state' : dev > 0.5 ? 'secular' : 'tolerance';
    N.gov.laws.nuclear = 1;
  }
  computeMods(s, N);
  developLand(sim, N, c, tiles, dev);
  computeMods(s, N);
  raiseForces(sim, N, c, tiles);
  return N;
}

// people, cities, infrastructure and land improvements, according to population and development
function developLand(sim, N, c, tiles, dev) {
  const s = sim.s, T = sim.T;
  const weights = tiles.map(i => Math.max(0.03, T[i].hab) * (1 + Math.min(4, (T[i].lights || 0) * 20)) * (T[i].river ? 1.3 : 1) * (T[i].coastal ? 1.15 : 1) * (i === N.capital ? 3 : 1));
  const tot = weights.reduce((a, b) => a + b, 0) || 1;
  tiles.forEach((i, k) => {
    const r = s.regions[i];
    const want = c.pop * 1000 * weights[k] / tot; // thousands of people
    r.lvl = 1;
    while (r.lvl < SETTLEMENTS.length - 1 && sim.housing(r, N) < want * 1.05) r.lvl++;
    const minLvl = dev > 0.75 ? 3 : dev > 0.45 ? 2 : 1;
    r.lvl = Math.max(r.lvl, i === N.capital ? Math.max(4, minLvl) : minLvl);
    for (const [k2, B] of Object.entries(BUILDINGS)) {
      if (k2 === 'nuclear') continue;
      if (B.coastal && !T[i].coastal) continue;
      const share = { market: 0.3 + dev, library: dev, workshop: 0.4 + dev * 0.7, aqueduct: 0.5 + dev * 0.6, power: 0.3 + dev, granary: 0.7, temple: 0.5, harbor: 0.9, walls: 0.3,
        barracks: i === N.capital ? 1 : 0.15, academy: i === N.capital && c.mil > 10 ? 1 : 0, airfield: i === N.capital && c.mil > 8 ? 1 : c.mil > 40 ? 0.15 : 0, datacenter: dev > 0.6 ? dev - 0.4 : 0 }[k2] ?? 0.3;
      // the older stages of every building stand already (a modern city has its walls, temples and markets);
      // the modern stages depend on development
      let lv = 0;
      for (const L of B.levels) {
        const old = (TECH_AGE[L[1]] ?? 9) <= 6;
        if (N.techs[L[1]] && r.lvl >= L[2] && (old ? share > 0.25 || Math.random() < share * 2 : Math.random() < share)) lv++; else break;
      }
      if (lv) r.bld[k2] = lv;
    }
    for (const [k3, I] of Object.entries(IMPROVEMENTS)) {
      if ((I.tech && !N.techs[I.tech]) || !I.need(sim.tileInfo(i), N)) continue;
      if (Math.random() < 0.75) r.imp[k3] = Math.max(1, Math.round(IMP_CAP[MODERN_AGE] * (0.25 + dev * 0.45) * (0.6 + Math.random() * 0.6)));
    }
    r.pop = Math.min(want, sim.housing(r, N) * 0.97);
  });
  if (c.nk) { const r = s.regions[N.capital]; r.bld.nuclear = BUILDINGS.nuclear.levels.filter(L => N.techs[L[1]]).length; }
}

// standing forces sized to real military strength
function raiseForces(sim, N, c, tiles) {
  const s = sim.s, w = sim.w;
  const land = Math.round(1 + c.mil * 0.32);
  const mix = ['INF', 'CAV', 'INF', 'SGE', 'INF', 'AA', 'CAV', 'RNG'];
  // garrison the capital and the larger cities
  const sites = tiles.slice().sort((a, b) => s.regions[b].pop - s.regions[a].pop).slice(0, Math.max(1, Math.ceil(land / 3)));
  for (let k = 0; k < land; k++) { const t = bestOf(N, mix[k % mix.length]) || bestOf(N, 'INF'); if (t) sim.spawn(N.code, t, sites[k % sites.length]); }
  const coast = tiles.filter(i => sim.T[i].coastal);
  if (coast.length && c.mil >= 6) {
    const sea = sim.seaNear(coast.includes(N.capital) ? N.capital : coast[0]);
    if (sea >= 0) {
      const ships = Math.round(c.mil * 0.12);
      for (let k = 0; k < ships; k++) { const t = bestOf(N, k % 4 === 3 && c.mil > 30 ? 'SUB' : 'NAV'); if (t) sim.spawn(N.code, t, sea); }
      const carriers = { 'United States of America': 6, China: 3, 'United Kingdom': 2, India: 2, France: 1, Italy: 1, Russia: 1, Spain: 1 }[c.n] || 0;
      for (let k = 0; k < carriers; k++) { const t = bestOf(N, 'CAR'); if (t) sim.spawn(N.code, t, sea); }
      if (c.mil > 30) { const t = bestOf(N, 'TRN'); if (t) sim.spawn(N.code, t, sea); }
    }
  }
  const air = Math.round(c.mil * 0.07);
  for (let k = 0; k < air; k++) { const t = bestOf(N, k % 3 === 2 && c.mil >= 50 ? 'BMB' : 'FTR'); if (t) sim.spawn(N.code, t, N.capital); }
  void w;
}

// two countries at war face each other along their border
function frontLine(sim, a, b) {
  const s = sim.s, w = sim.w;
  for (const [x, y] of [[a, b], [b, a]]) {
    const border = [...sim.owned.get(x)].filter(i => w.adj[i].some(j => s.regions[j].owner === y));
    const army = s.units.filter(u => u.nation === x && !w.regions[u.loc].sea && u.loc !== s.nations[x].capital);
    army.slice(0, Math.ceil(army.length * 0.7)).forEach((u, k) => { if (border.length) { u.loc = border[k % border.length]; u.pos = null; sim.placeUnit(u, true); } });
  }
}

// oil production as a multiple of the country's own needs
const OIL = { 'Saudi Arabia': 6, Russia: 3, Iraq: 5, 'United Arab Emirates': 5, Kuwait: 6, Iran: 3, Qatar: 4, Norway: 4, Kazakhstan: 3, Canada: 2.5, 'United States of America': 1.3, Brazil: 1.2,
  Mexico: 1.2, Nigeria: 3, Angola: 4, Algeria: 3, Libya: 4, Venezuela: 3, Oman: 4, China: 0.4, India: 0.15, 'United Kingdom': 0.6, Azerbaijan: 4, Colombia: 1.5, Ecuador: 2, Egypt: 0.8,
  Malaysia: 1.2, Indonesia: 0.6, Argentina: 1.1, Gabon: 3, Congo: 3, Turkmenistan: 3, 'S. Sudan': 3, Chad: 2, Guyana: 4, Syria: 0.5 };
// how far each country feeds itself in 2025 (1 = self-sufficient): exporters run a surplus, importers must trade
const FOOD_SELF = { 'United States of America': 1.3, Brazil: 1.45, Argentina: 1.6, Canada: 1.45, Australia: 1.5, Russia: 1.25, Ukraine: 1.5, France: 1.25, Kazakhstan: 1.2, Thailand: 1.25,
  Vietnam: 1.15, 'New Zealand': 1.5, Uruguay: 1.4, Paraguay: 1.4, India: 1.05, Indonesia: 1.0, China: 1.0, Japan: 0.75, 'South Korea': 0.65, 'United Kingdom': 0.75, Netherlands: 1.1,
  Egypt: 0.7, 'Saudi Arabia': 0.7, 'United Arab Emirates': 0.45, Qatar: 0.4, Kuwait: 0.45, Oman: 0.55, Singapore: 0.35, Israel: 0.75, Algeria: 0.7, Libya: 0.6, Yemen: 0.55, Jordan: 0.6, Taiwan: 0.65 };
function seedStores(sim, N) {
  sim.recalcNation(N.code);
  // modern agriculture: scale farm output so the country starts near its real self-sufficiency
  const wantFood = (N.st.foodCons || 0) * (FOOD_SELF[N.country] ?? 1.02);
  N.agri = clamp(wantFood / Math.max(0.01, N.st.prod?.food || 0.01), 1, 400);
  // power grids that roughly meet demand, and the oil fields of the producers
  N.power = clamp((N.st.eCons || 0) * (1.02 + N.dev * 0.08) / Math.max(1, N.st.energy || 1), 1, 300);
  N.oilBase = ((N.st.upkeep?.oil || 0) + 2 + (N.st.eCons || 0) * 0.004) * (OIL[N.country] || 0);
  if (N.st.energy < N.st.eCons * 0.05) { N.power = 1; N.powerAdd = N.st.eCons * (0.6 + 0.45 * N.dev); } // grids without big plants: imports, diesel, hydro
  sim.recalcNation(N.code);
  // output in proportion to the real economy: revenue, industry, materials and research scale with GDP
  const P = N.st.raw || {}, ind = 0.45 + 0.55 * N.dev;
  const want = { wealth: N.gdp * 0.015, metal: N.gdp * 0.011 * ind, wood: N.gdp * 0.005 + 0.4, stone: N.gdp * 0.005 + 0.4 };
  // remember the raw output each target corresponds to; recalcNation maps raw output to real output from there
  N.econ0 = {};
  for (const k in want) N.econ0[k] = { raw: Math.max(0.001, P[k] || 0.001), want: want[k] };
  sim.recalcNation(N.code);
  const rpWant = N.gdp * 0.07 * (0.3 + 0.7 * N.dev); // research in proportion to the economy and its development
  N.econ0.rp = { raw: Math.max(1e-3, N.st.raw.rp), want: Math.max(0.5, rpWant / (1 + (N.mods.research || 0)) - N.st.researchSpend * 1.6) };
  sim.recalcNation(N.code);
  const st = N.st, cap = k => sim.storageCap(N, k);
  N.food = Math.max(20, (st.foodCons || 1) * 45);
  for (const k of ['wood', 'stone', 'metal']) N[k] = cap(k) * 0.55;
  N.oil = cap('oil') * (N.blocs?.includes('OPEC') ? 0.85 : 0.35);
  N.wealth = Math.max(50, (st.prod?.wealth || 0) * (30 + 50 * N.dev)); // a few months of revenue: debt-laden states start leaner
}

// faiths of the real world, replacing the generated ones (called once society has been initialised)
export function modernFaiths(sim) {
  const s = sim.s;
  if (!s.modern || s.faiths2025) return;
  s.faiths2025 = true;
  for (const [k, F] of Object.entries(FAITHS_2025)) s.faiths['m:' + k] = { id: 'm:' + k, name: F.name, kind: 'world', group: null, col: F.col, holy: null, founder: null };
  for (const N of Object.values(s.nations)) {
    if (!N.faith0) continue;
    N.faith = 'm:' + N.faith0;
    for (const i of sim.owned.get(N.code) || []) s.regions[i].rel = N.faith;
  }
}
