// Real-time world simulation, Stone Age to the Information Age. One step = one game hour; the economy ticks daily.
// The world starts as unclaimed wilderness with native peoples. Civilizations claim tiles, work their resources,
// grow settlements, research through ten ages, and fight with units that have physical positions.
import { cold, harvest } from './seasons.js';
import { AGES, NAGES, ageScale, YEARS_PER_DAY, setEconomyScale } from './eras.js';
import { TERRAIN, RES, IMPROVEMENTS, IMP_ORDER, IMP_CAP, LABOR, STRATEGIC, LUXURIES, classify, generateDeposits, rng, known } from './resources.js';
import { pressureDaily, onAcquire, addInfamy } from './pressure.js';
import { crisesDaily, applyScenario } from './crises.js';
import { initPacts, pactsDaily, pactMods, onWar, earn, repOpinion, shares } from './pacts.js';
import { initSociety, buildProvinces, onNewNation, onSettled, onTransfer, societyDaily, fundInsurgents } from './society.js';
import { UNITS, LINES, VARIANTS, bestOf, SETTLEMENTS, BUILDINGS, WONDERS, FOOD_PER_K } from './units.js';
import { TECH, TECHS, available, ageProgress, ADVANCE_SHARE, techsBefore, AGE_TECHS } from './tech.js';
import { initGovernment, computeMods, unitMods, politicsDaily, rollEvent, refreshCandidates, validateLaws, styleName, GOV_TYPES } from './gov.js';
import { FORMABLES, modernFormables, formProgress } from './formables.js';
import { cultureOf, civName, civColor } from './names.js';
import { slerpLL } from './world.js';
import { setupModern, modernFaiths, START_YEAR, fixArticles, worldMarket, MODERN_ECON, budgetMods } from './modern.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pkey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const DEG = Math.PI / 180;
const kmBetween = (a, b) => { const dl = (b[1] - a[1] + 540) % 360 - 180; const x = dl * Math.cos((a[0] + b[0]) / 2 * DEG), y = b[0] - a[0]; return Math.sqrt(x * x + y * y) * 111.2; };
function stepToward(a, b, km) { const d = kmBetween(a, b); if (d <= km || d < 1e-6) return [b[0], b[1]]; return slerpLL(a, b, km / d); }
const COMMERCE = [0.15, 0.4, 0.7, 1, 1.4, 2, 2.8];
const STOCKS = ['food', 'wood', 'stone', 'metal', 'wealth', 'oil'];
export const GOODS = ['food', 'wood', 'stone', 'metal', 'oil'];
const BASE_PRICE = { food: 0.5, wood: 0.6, stone: 0.6, metal: 1.3, oil: 2.2 };
// reference attack of an age's line infantry: garrisons and siege power are measured in these
const refAtk = a => UNITS['INF' + clamp(a, 0, 9)].atk;
const scaleCost = (cost, k) => { const o = {}; for (const [r, v] of Object.entries(cost)) o[r] = Math.round(v * k * 10) / 10; return o; };

export class Sim {
  constructor(world, geo, opts = {}) {
    this.w = world; this.geo = geo;
    this.listeners = []; this.unitById = new Map(); this.shots = []; this.battles = [];
    this.buildStatic();
    if (opts.state) { this.s = opts.state; setEconomyScale(this.s.modern ? MODERN_ECON : 1); this.migrate(); this.rebuildCaches(); initSociety(this); modernFaiths(this); initPacts(this); for (const N of Object.values(this.s.nations)) if (N.alive) { computeMods(this.s, N); this.recalcNation(N.code); } return; }
    this.s = this.initState(opts);
    this.rebuildCaches();
    initSociety(this);
    modernFaiths(this);
    initPacts(this);
    for (const N of Object.values(this.s.nations)) { computeMods(this.s, N); this.recalcNation(N.code); }
  }

  // ---------------------------------------------------------------- static tile data (terrain, fertility, country)
  buildStatic() {
    const w = this.w;
    this.T = w.regions.map((R, i) => {
      if (R.sea) return { sea: true, deep: R.deep, lat: R.lat, lon: R.lon };
      const g = this.geo[i] || { veg: 0.5, desert: 0, ice: 0, elev: 0.1, relief: 0.02, high: 0, area: 50000, lights: 0 };
      const c = classify(R, g);
      return { ...c, coastal: R.coastal, area: g.area, lat: R.lat, lon: R.lon, country: R.country, lights: g.lights, name: R.name };
    });
    this.byCountry = {};
    w.regions.forEach((R, i) => { if (!R.sea && R.country) (this.byCountry[R.country] ||= []).push(i); });
    this.formables = [...FORMABLES, ...modernFormables(Object.fromEntries(Object.entries(this.byCountry).map(([k, v]) => [k, v.length])))];
    this.landIdx = w.regions.filter(r => !r.sea).map(r => r.i);
    buildProvinces(this);
  }
  countryTiles(countries, box) {
    const out = [];
    for (const c of countries) for (const i of this.byCountry[c] || []) { const T = this.T[i]; if (!box || (T.lat >= box[0] && T.lat <= box[1] && T.lon >= box[2] && T.lon <= box[3])) out.push(i); }
    return out;
  }
  migrate() {
    const s = this.s;
    s.chars ||= {}; s.groups ||= []; s.scars ||= []; s.sanctions ||= []; s.guarantees ||= []; s.wonders ||= {}; s.formed ||= {};
    s.movements ||= []; s.coalitions ||= []; s.crises ||= []; s.crisisRate ??= 1;
    s.maxCivs = Math.max(s.maxCivs || 0, 200); s.emergence ??= true; s.nextEmerge ??= s.t + 24 * 3;
    for (const u of s.units) { if (!UNITS[u.type]) { u.dead = true; continue; } u.mhp ||= UNITS[u.type].hp; if (!u.pos) this.placeUnit(u, true); }
    s.units = s.units.filter(u => !u.dead);
  }

  // ---------------------------------------------------------------- new world
  initState(opts) {
    const w = this.w, T = this.T;
    const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31);
    const R = rng(seed);
    const startAge = clamp(opts.startAge || 0, 0, 7);
    const regions = w.regions.map((Rg, i) => {
      const t = T[i];
      const r = { i, sea: Rg.sea, owner: null, core: null };
      if (Rg.sea) return r;
      r.dep = generateDeposits(t, rng(seed + i * 7919));
      r.natives = t.terrain === 'ice' ? 0 : +(t.hab * rnd(0.6, 1.8) * (t.river ? 1.4 : 1)).toFixed(2);
      r.pop = 0; r.lvl = 0; r.imp = {}; r.bld = {}; r.build = null; r.claim = null; r.capture = null; r.unrest = 0; r.damage = 0; r.light = 0;
      return r;
    });
    const s = {
      t: 0, seed, mapVersion: this.w.json.version || 1, year: AGES[startAge].from, player: opts.player || 'C0', startAge,
      victory: { conquest: opts.conquest ?? 0.5, science: opts.science ?? true, score: opts.score ?? true },
      temper: opts.temper || 1, difficulty: opts.difficulty ?? 0,
      regions, nations: {}, units: [], uid: 1, trades: [], tid: 1, rel: {}, opinion: {}, events: [], messages: [], mid: 1,
      prices: { ...BASE_PRICE }, winner: null, over: false, history: [], chars: {}, cid: 1, groups: [], gid: 1, scars: [], nukesUsed: 0,
      sanctions: [], guarantees: [], nextEventAt: 24 * 20, pendingEvent: null, wonders: {}, formed: {},
      maxCivs: Math.max(opts.maxCivs || 200, clamp(opts.civs || 16, 2, 200)), emergence: opts.emergence ?? true, nextEmerge: 24 * 30,
    };
    this.s = s;
    // the present day: the real countries of 2025 (modern.js)
    if (!opts.legacy) {
      setEconomyScale(MODERN_ECON);
      setupModern(this, opts);
      this.rebuildCaches();
      for (const N of Object.values(s.nations)) { computeMods(s, N); this.recalcNation(N.code); }
      refreshCandidates(s, s.nations[s.player]);
      return s;
    }
    // place civilizations: the player's chosen tile first, then random habitable tiles spaced apart
    const nCiv = clamp(opts.civs || 16, 2, 200);
    const starts = [];
    const score = i => { const t = T[i]; return t.hab * (t.river ? 1.6 : 1) * (0.5 + t.fert) * (t.coastal ? 1.1 : 1); };
    if (opts.startTile !== undefined && opts.startTile !== null) starts.push(opts.startTile);
    const pool = this.landIdx.filter(i => T[i].terrain !== 'ice' && score(i) > 0.35);
    const minKm = clamp(5200 / Math.sqrt(nCiv), 300, 2600);
    for (let tries = 0; starts.length < nCiv && tries < 20000; tries++) {
      const i = pool[Math.floor(R() * pool.length)];
      if (R() > score(i) / 1.8) continue;
      const far = minKm * (tries > 8000 ? 0.6 : tries > 4000 ? 0.8 : 1);
      if (starts.some(j => kmBetween([T[i].lat, T[i].lon], [T[j].lat, T[j].lon]) < far)) continue;
      starts.push(i);
    }
    const used = new Set();
    starts.forEach((i, k) => {
      const code = 'C' + k;
      const culture = cultureOf(T[i]);
      const nm = k === 0 && opts.playerName ? { name: opts.playerName, adj: opts.playerAdj || opts.playerName } : civName(culture, R, used);
      used.add(nm.name);
      const N = {
        code, name: nm.name, adj: nm.adj, color: k === 0 && opts.playerColor ? opts.playerColor : civColor(k),
        culture, alive: true, ai: code !== s.player, capital: i, age: startAge, ageAdv: null,
        traits: { aggression: R(), caution: R(), loyalty: 0.3 + 0.6 * R(), expansion: 0.3 + 0.7 * R(), science: R() },
        techs: techsBefore(startAge), research: { cur: null, prog: 0, queue: [] },
        food: 0, wood: 0, stone: 0, metal: 0, wealth: 0, oil: 0, queue: [], exhaustion: 0, st: {}, access: {}, known: [],
        warheads: 0, warheadProg: 0, opCooldown: {}, directives: { industry: 'off', defense: 'off', science: 'off', foreign: 'off', budget: 0.35 }, delegateEvents: false,
        aiBonus: code === s.player ? 0 : (s.difficulty || 0), formed: null,
      };
      s.nations[code] = N;
      this.settle(N, i, startAge);
      initGovernment(s, N);
    });
    this.rebuildCaches();
    for (const N of Object.values(s.nations)) {
      computeMods(s, N); this.recalcNation(N.code);
      const sc = ageScale(startAge);
      N.food = 6 * sc; N.wood = 6 * sc; N.stone = 3 * sc; N.metal = startAge ? 4 * sc : 0; N.wealth = startAge ? 6 * sc : 0;
      this.seedForces(N);
    }
    applyScenario(this, opts.scenario);
    refreshCandidates(s, s.nations[s.player]);
    this.updateContacts();
    return s;
  }
  // ---------------------------------------------------------------- new peoples arise during the game
  // Create a civilization mid-game: either founded on a tile (settle) or taking over a set of tiles (a breakaway).
  newCivilization(tile, age, opts = {}) {
    const s = this.s;
    let k = Object.keys(s.nations).length; while (s.nations['C' + k]) k++;
    const code = 'C' + k, R = Math.random;
    const culture = cultureOf(this.T[tile]);
    const used = new Set(Object.values(s.nations).map(n => n.name));
    const nm = civName(culture, R, used);
    const N = {
      code, name: nm.name, adj: nm.adj, color: civColor(k), culture, alive: true, ai: true, capital: tile, age, ageAdv: null,
      traits: { aggression: opts.rebel ? 0.5 + 0.4 * R() : R(), caution: R(), loyalty: 0.3 + 0.6 * R(), expansion: 0.4 + 0.6 * R(), science: R() },
      techs: opts.techs ? { ...opts.techs } : techsBefore(age), research: { cur: null, prog: 0, queue: [] },
      food: 0, wood: 0, stone: 0, metal: 0, wealth: 0, oil: 0, queue: [], exhaustion: 0, st: {}, access: {}, known: [],
      warheads: 0, warheadProg: 0, opCooldown: {}, directives: { industry: 'off', defense: 'off', science: 'off', foreign: 'off', budget: 0.35 }, delegateEvents: false,
      aiBonus: s.difficulty || 0, formed: null, born: s.t,
    };
    s.nations[code] = N;
    if (opts.tiles) {
      for (const i of opts.tiles) {
        const r = s.regions[i], from = r.owner;
        if (from) { this.owned.get(from)?.delete(i); const F = s.nations[from]; if (F) F.queue = F.queue.filter(q => q.region !== i); }
        r.owner = r.core = code; r.unrest = 0.1; r.capture = null; r.claim = null; if (r.build?.kind !== 'settle') r.build = null;
        onTransfer(this, r);
      }
    } else this.settle(N, tile, age);
    this.rebuildCaches();
    onNewNation(this, N, opts);
    initGovernment(s, N);
    computeMods(s, N); this.recalcNation(code);
    const sc = ageScale(age);
    N.food = 8 * sc; N.wood = 6 * sc; N.stone = 3 * sc; N.metal = age ? 5 * sc : 0; N.wealth = age ? 6 * sc : 0;
    this.seedForces(N);
    if (opts.rebel) this.seedForces(N);
    return N;
  }
  emergence() {
    const s = this.s, w = this.w;
    if (!s.emergence || s.t < (s.nextEmerge || 0)) return;
    s.nextEmerge = s.t + 24 * Math.round(rnd(10, 20));
    const alive = Object.values(s.nations).filter(n => n.alive);
    if (alive.length >= (s.maxCivs || 200)) return;
    const ages = alive.map(n => n.age).sort((a, b) => a - b);
    const median = ages[Math.floor(ages.length / 2)] || 0;
    // 1) wandering tribes unite into a new people, far from existing borders
    if (Math.random() < 0.45) {
      const cand = [];
      for (const i of this.landIdx) {
        const r = s.regions[i], T = this.T[i];
        if (r.owner || r.claim || (r.natives || 0) < 0.9 || T.terrain === 'ice') continue;
        let near = false;
        for (const [j] of w.within(i, 2, x => !w.regions[x].sea)) if (s.regions[j].owner) { near = true; break; }
        if (!near) cand.push(i);
      }
      if (cand.length) {
        let tot = 0; const wt = cand.map(i => { const v = (s.regions[i].natives || 0) * this.T[i].hab * (this.T[i].river ? 1.5 : 1); tot += v; return v; });
        let x = Math.random() * tot, pick = cand[0];
        for (let k = 0; k < cand.length; k++) { x -= wt[k]; if (x <= 0) { pick = cand[k]; break; } }
        const age = Math.max(0, Math.min(7, median - 1));
        const N = this.newCivilization(pick, age);
        this.emit('rise', `A new people arises: the tribes of ${w.regions[pick].name} unite as the ${this.full(N.code)} (${AGES[age].name}).`, [N.code], { loc: pick, major: true });
        return;
      }
    }
    // 2) restless provinces of a troubled empire break away
    for (const P of alive.sort(() => Math.random() - 0.5)) {
      const tiles = this.owned.get(P.code)?.size || 0;
      const limit = P.code === s.player ? 0.2 : 0.27;
      if (tiles < 10 || P.gov.stability > limit || (P.lastSecession && s.t - P.lastSecession < 24 * 60) || Math.random() > 0.35) continue;
      const cap = this.anchor(P.capital);
      const pool = this.regionsOf(P.code).filter(r => r.i !== P.capital && r.unrest > 0.45 && kmBetween(this.anchor(r.i), cap) > 700).sort((a, b) => b.unrest - a.unrest);
      if (!pool.length) continue;
      const seed = pool[0].i, cluster = [seed], q = [seed];
      const maxN = Math.min(6, Math.floor(tiles / 4));
      while (q.length && cluster.length < maxN) {
        const i = q.shift();
        for (const j of w.adj[i]) { const r = s.regions[j]; if (r.owner === P.code && j !== P.capital && !cluster.includes(j) && r.unrest > 0.25 && cluster.length < maxN) { cluster.push(j); q.push(j); } }
      }
      const N = this.newCivilization(seed, P.age, { tiles: cluster, techs: P.techs, rebel: true, parent: P.code });
      N.known = [...new Set([P.code, ...P.known.filter(c => s.nations[c]?.alive)])];
      for (const c of N.known) { const X = s.nations[c]; if (X && !X.known.includes(N.code)) X.known.push(N.code); }
      P.lastSecession = s.t; P.gov.stability = clamp(P.gov.stability + 0.12, 0, 1);
      this.setOpinion(N.code, P.code, -60); this.setOpinion(P.code, N.code, -50);
      this.declareWar(N.code, P.code, true);
      this.emit('rise', `Rebellion! ${cluster.length} provinces of the ${this.nm(P.code)} around ${w.regions[seed].name} declare independence as the ${this.full(N.code)}.`, [N.code, P.code], { loc: seed, major: true });
      return;
    }
  }
  // found a civilization's homeland; later starting ages get a developed core
  settle(N, i, age) {
    const s = this.s, r = s.regions[i];
    r.owner = r.core = N.code; r.lvl = Math.min(SETTLEMENTS.length - 1, 1 + Math.floor(age * 0.6)); r.pop = Math.min(this.housing(r, N) * 0.85, this.housing(r, N) * 0.6 + r.natives); r.natives = 0;
    if (age >= 1) { r.bld.temple = 1; r.imp.farm = Math.min(IMP_CAP[age], 1 + Math.floor(age / 2)); }
    if (age >= 2) r.bld.walls = 1;
    if (age >= 3) { r.bld.market = 1; r.bld.library = 1; r.bld.barracks = 1; }
    if (age >= 5) { r.bld.workshop = 2; r.bld.harbor = this.T[i].coastal ? 2 : 0; }
    // later starts: claim the neighbourhood
    const extra = age === 0 ? 0 : Math.round(age * 1.6);
    const ring = [...this.w.within(i, 3, j => !this.w.regions[j].sea).keys()].filter(j => j !== i && !s.regions[j].owner).slice(0, extra);
    for (const j of ring) {
      const q = s.regions[j]; q.owner = q.core = N.code; q.lvl = Math.max(1, Math.floor(age * 0.45)); q.pop = this.housing(q, N) * 0.5 + q.natives; q.natives = 0;
      if (age >= 1 && IMPROVEMENTS.farm.need(this.tileInfo(j), N)) q.imp.farm = Math.min(IMP_CAP[age], 1 + Math.floor(age / 3));
    }
  }
  seedForces(N) {
    const L = ['INF', 'RNG', 'INF', 'CAV', 'SGE'];
    const n = 2 + Math.floor(N.age * 0.8);
    for (let k = 0; k < n; k++) { const t = bestOf(N, L[k % L.length]) || bestOf(N, 'INF'); this.spawn(N.code, t, N.capital); }
    if (N.age >= 2 && this.T[N.capital].coastal) { const sea = this.seaNear(N.capital); const nv = bestOf(N, 'NAV'); if (sea >= 0 && nv) this.spawn(N.code, nv, sea); }
  }
  rebuildCaches() {
    this.unitById = new Map(this.s.units.map(u => [u.id, u]));
    this.owned = new Map(); for (const c of Object.keys(this.s.nations)) this.owned.set(c, new Set());
    for (const r of this.s.regions) if (r.owner) this.owned.get(r.owner)?.add(r.i);
  }

  // ---------------------------------------------------------------- helpers
  on(fn) { this.listeners.push(fn); }
  emit(kind, text, nations = [], extra = {}) {
    if (this.s.modern) text = fixArticles(this, text);
    const e = { t: this.s.t, y: this.s.year, kind, text, nations, ...extra };
    this.s.events.push(e); if (this.s.events.length > 500) this.s.events.shift();
    for (const f of this.listeners) f(e);
  }
  nm(c) { const N = this.s.nations[c]; return N ? (N.formed && N.formed.short ? N.formed.short : N.name) : 'Natives'; }
  full(c) { const N = this.s.nations[c]; return N ? styleName(N) : 'Natives'; }
  col(c) { return this.s.nations[c]?.color || '#888'; }
  rel(a, b) { return a === b ? 'self' : (this.s.rel[pkey(a, b)] || 'peace'); }
  setRel(a, b, st) { this._rx = null; if (st === 'peace') delete this.s.rel[pkey(a, b)]; else this.s.rel[pkey(a, b)] = st; }
  atWar(a, b) { return a !== b && this.s.rel[pkey(a, b)] === 'war'; }
  friendly(a, b) { if (a === b) return true; return this.rel(a, b) === 'alliance'; }
  // right of passage: armies may march through, base in and help defend the lands of allies, of every people in
  // their realm (vassals, overlord, fellow vassals) and of fellow members of a mutual-defence pact
  mayPass(a, b) {
    if (!a || !b) return false;
    if (a === b || this.rel(a, b) === 'alliance') return true;
    if (this.realmOf(a) === this.realmOf(b)) return true;
    return !!this.s.pacts?.length && shares(this, a, b, 'defense');
  }
  // what a thinks of b: memory of past deeds, coloured by b's reputation as a judges it (pacts.js)
  opinion(a, b) { const raw = this.s.opinion[a]?.[b] ?? 0; return this.s.pacts ? clamp(raw + repOpinion(this, a, b), -100, 100) : raw; }
  rawOpinion(a, b) { return this.s.opinion[a]?.[b] ?? 0; }
  setOpinion(a, b, v) { (this.s.opinion[a] ||= {})[b] = clamp(v, -100, 100); }
  addOpinion(a, b, d) { this.setOpinion(a, b, this.rawOpinion(a, b) + d); }
  knows(a, b) { return a === b || !!this.s.nations[a]?.known?.includes(b); }
  regionsOf(c) { const set = this.owned.get(c); return set ? [...set].map(i => this.s.regions[i]) : []; }
  unitsOf(c) { return this.s.units.filter(u => u.nation === c); }
  anchor(i) { const R = this.w.regions[i]; return [R.lat, R.lon]; }
  tileInfo(i) { const t = this.T[i], r = this.s.regions[i]; return { ...t, dep: r.dep || [] }; }
  seaNear(i) { const w = this.w; let best = -1, bk = Infinity; w.adj[i].forEach((j, k) => { if (w.regions[j].sea && w.km[i][k] < bk) { bk = w.km[i][k]; best = j; } }); return best; }
  canOcean(c) { return !!this.s.nations[c]?.techs.navigation; }
  // deterministic formation slot around a tile anchor
  slot(u, i) {
    const [lat, lon] = this.anchor(i);
    const sea = this.w.regions[i].sea, air = UNITS[u.type]?.domain === 'air';
    const a = u.id * 2.39996, rr = (sea ? 1.2 : air ? 0.4 : 0.6) * (0.25 + 0.75 * Math.sqrt(((u.id * 0.6180339) % 1)));
    return [lat + Math.sin(a) * rr, lon + Math.cos(a) * rr / Math.max(0.3, Math.cos(lat * DEG))];
  }
  placeUnit(u, snap) {
    let p;
    if (u.air && u.air.phase !== 'base') p = u.air.pos;
    else if (u.move) {
      const m = u.move, a = m.path[m.seg], b = m.path[m.seg + 1];
      const t = clamp(m.prog / this.w.edgeKm(a, b), 0, 1);
      p = slerpLL(this.slot(u, a), this.slot(u, b), t);
    } else p = this.slot(u, u.loc);
    if (snap || !u.pos) u.ppos = p;
    u.pos = p;
  }
  spawn(nation, type, loc) {
    const T = UNITS[type];
    const u = { id: this.s.uid++, nation, type, hp: T.hp, mhp: T.hp, loc, move: null, mission: null, fighting: 0, xp: 0 };
    if (T.domain === 'air') u.air = { phase: 'base', cd: 0 };
    this.s.units.push(u); this.unitById.set(u.id, u);
    this.placeUnit(u, true);
    return u;
  }
  removeUnit(u) {
    const k = this.s.units.indexOf(u); if (k >= 0) this.s.units.splice(k, 1);
    this.unitById.delete(u.id);
    for (const g of this.s.groups) g.units = g.units.filter(id => id !== u.id);
  }
  strength(u) { const t = UNITS[u.type]; return (t.atk + t.def) / 2 * (u.hp / (u.mhp || t.hp)) * (1 + (u.xp || 0) / 250); }
  sealift(c) { let n = 0; for (const u of this.s.units) if (u.nation === c && UNITS[u.type].lift) n += UNITS[u.type].lift; return n; }
  embarked(c) { return this.s.units.filter(u => u.nation === c && UNITS[u.type].domain === 'land' && (this.w.regions[u.loc].sea || (u.move && u.move.path.some(p => this.w.regions[p].sea)))).length; }

  // ---------------------------------------------------------------- movement
  canEnter(c, domain, j, T) {
    const R = this.w.regions[j], r = this.s.regions[j];
    if (domain === 'sea') return R.sea && (!R.deep || !!T?.ocean);
    if (domain === 'land') { if (R.sea) return !R.deep || this.canOcean(c); const o = r.owner; return !o || this.mayPass(c, o) || this.atWar(c, o); }
    if (R.sea) return false;
    return this.mayPass(c, r.owner);
  }
  planPath(units, dest) {
    const w = this.w, c = units[0].nation;
    const T = UNITS[units[0].type], domain = T.domain;
    const from = units[0].loc;
    const blockers = new Set();
    let path;
    if (domain === 'air') {
      if (!this.canEnter(c, 'air', dest)) return { path: null, reason: 'Aircraft can only rebase to your own or allied territory.' };
      return { path: [from, dest], air: true };
    }
    if (domain === 'sea') {
      const ocean = units.every(u => UNITS[u.type].ocean);
      path = w.path(from, dest, j => w.regions[j].sea && (!w.regions[j].deep || ocean));
      return { path, reason: path ? null : ocean ? 'No sea route.' : 'No coastal route. These ships cannot cross the deep ocean.' };
    }
    const canSea = !!this.s.nations[c].techs.rafts, ocean = this.canOcean(c);
    path = w.path(from, dest, j => {
      const R = w.regions[j];
      if (R.sea) return canSea && (!R.deep || ocean);
      const o = this.s.regions[j].owner;
      return !o || this.mayPass(c, o) || this.atWar(c, o) || j === dest;
    }, (i, j, km) => km * (w.regions[j].sea ? 2.4 : TERRAIN[this.T[j].terrain]?.move || 1));
    if (!path) return { path: null, reason: canSea ? 'No route.' : 'No land route. Research Rafts to cross water.' };
    for (const j of path) { const o = this.s.regions[j].owner; if (!w.regions[j].sea && o && !this.mayPass(c, o) && !this.atWar(c, o)) blockers.add(o); }
    if (path.some(j => w.regions[j].sea) && this.embarked(c) + units.length > this.sealift(c)) return { path: null, reason: `Insufficient sealift (${this.sealift(c)} capacity). Build boats or transports.` };
    return { path, blockers };
  }
  order(unitIds, dest, opts = {}) {
    const units = unitIds.map(id => this.unitById.get(id)).filter(Boolean);
    if (!units.length) return { ok: false, reason: 'No units.' };
    const groups = new Map();
    for (const u of units) { const k = UNITS[u.type].domain + ':' + u.loc + ':' + (UNITS[u.type].ocean ? 1 : 0); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); }
    let res = { ok: true };
    for (const g of groups.values()) {
      const d = UNITS[g[0].type].domain;
      if (d === 'air') {
        if (opts.strike) { for (const u of g) u.mission = { strike: dest }; continue; }
        if (!this.canEnter(g[0].nation, 'air', dest)) { res = { ok: false, reason: 'Aircraft can only rebase to your own or allied territory.' }; continue; }
        for (const u of g) { u.mission = null; u.loc = dest; u.air.phase = 'ferry'; u.air.pos ||= u.pos; u.air.tgt = this.slot(u, dest); }
        continue;
      }
      const p = this.planPath(g, dest);
      if (!p.path) { res = { ok: false, reason: p.reason }; continue; }
      if (p.blockers?.size && !opts.declare) return { ok: false, needWar: [...p.blockers] };
      if (p.blockers?.size) for (const b of p.blockers) this.declareWar(g[0].nation, b);
      for (const u of g) { u.train = false; u.move = p.path.length > 1 ? { path: p.path, seg: 0, prog: 0 } : null; }
    }
    return res;
  }

  // ---------------------------------------------------------------- main loop
  step() {
    const s = this.s;
    s.t += 1;
    for (const u of s.units) u.ppos = u.pos;
    this.moveUnits();
    this.airOps();
    this.combat();
    this.captures();
    if (s.t % 24 === 0) this.daily();
  }
  moveUnits() {
    const w = this.w, s = this.s;
    for (const u of s.units) {
      const T = UNITS[u.type];
      if (T.domain === 'air') continue;
      if (u.move) {
        const m = u.move, N = s.nations[u.nation];
        const um = unitMods(s, u, T.domain);
        const a = m.path[m.seg], b = m.path[m.seg + 1];
        let speed = T.speed / 24 * (N.st.eF < 0.6 ? 0.7 : 1) * um.speed;
        if (T.domain === 'land') {
          if (w.regions[a].sea || w.regions[b].sea) speed = Math.max(speed, (N.techs.navigation ? 600 : N.techs.sailing ? 380 : 220) / 24);
          else speed /= TERRAIN[this.T[b].terrain]?.move || 1;
          speed *= 1 - 0.3 * cold(w.regions[b].lat, s.t); // snow and mud
        }
        if (u.fighting > 0 && T.domain === 'land') speed *= 0.45;
        m.prog += speed;
        if (m.prog >= w.edgeKm(a, b)) {
          if (T.domain === 'land' && !w.regions[b].sea && !this.canEnter(u.nation, 'land', b)) u.move = null;
          else { u.loc = b; m.seg++; m.prog = 0; if (m.seg >= m.path.length - 1) u.move = null; }
        }
      }
      this.placeUnit(u);
    }
  }

  // ---- aircraft: scramble, fly out, attack, return, rearm
  airOps() {
    const s = this.s, w = this.w;
    let airborne = null;
    for (const u of s.units) {
      if (!u.air) continue;
      const T = UNITS[u.type], A = u.air;
      const fly = T.speed * unitMods(s, u, 'air').speed;
      const baseOwner = s.regions[u.loc].owner;
      if (!w.regions[u.loc].sea && !this.mayPass(u.nation, baseOwner)) {
        const home = this.regionsOf(u.nation).sort((a, b) => kmBetween(this.anchor(a.i), u.pos) - kmBetween(this.anchor(b.i), u.pos))[0];
        if (home) { u.loc = home.i; A.phase = 'ferry'; A.pos ||= u.pos; A.tgt = this.slot(u, home.i); }
      }
      const basePos = this.slot(u, u.loc);
      if (A.phase === 'base') {
        A.pos = basePos;
        if (A.cd > 0) { A.cd--; this.placeUnit(u); continue; }
        if (u.hp < u.mhp * 0.3) { u.hp = Math.min(u.mhp, u.hp + u.mhp * 0.01); this.placeUnit(u); continue; }
        let tgt = null;
        if (T.role === 'fighter') {
          airborne ||= s.units.filter(e => e.air && e.air.phase !== 'base');
          const foe = airborne.filter(e => this.atWar(u.nation, e.nation) && kmBetween(basePos, e.pos) < T.radius).sort((a, b) => kmBetween(basePos, a.pos) - kmBetween(basePos, b.pos))[0];
          if (foe) tgt = { track: foe.id, pos: foe.pos };
        }
        if (!tgt && u.mission?.strike !== undefined) {
          const r = s.regions[u.mission.strike];
          if (!r || r.sea || !r.owner || !this.atWar(u.nation, r.owner)) u.mission = null;
          else if (kmBetween(basePos, this.anchor(r.i)) <= T.radius) tgt = { region: r.i, pos: this.anchor(r.i) };
        }
        if (!tgt && this.battles.length) {
          const b = this.battles.filter(b => b.nations.some(n => n === u.nation || this.friendly(n, u.nation)) && kmBetween(basePos, b.pos) < T.radius * 0.8).sort((x, y) => kmBetween(basePos, x.pos) - kmBetween(basePos, y.pos))[0];
          if (b) tgt = { region: b.loc, pos: b.pos };
        }
        if (tgt) { A.phase = 'out'; A.tgt = tgt.pos; A.track = tgt.track || null; A.region = tgt.region ?? null; A.pos = basePos; A.timer = 0; }
      } else if (A.phase === 'out') {
        if (A.track) { const e = this.unitById.get(A.track); if (!e || e.air?.phase === 'base') A.phase = 'back'; else A.tgt = e.pos; }
        A.pos = stepToward(A.pos, A.tgt, fly);
        if (kmBetween(A.pos, A.tgt) < 30) { A.phase = 'engage'; A.timer = T.role === 'bomber' ? 2 : 3; }
        if (kmBetween(A.pos, basePos) > T.radius * 1.1) A.phase = 'back';
      } else if (A.phase === 'engage') {
        if (A.track) { const e = this.unitById.get(A.track); if (e && e.air?.phase !== 'base') A.pos = stepToward(A.pos, e.pos, fly); }
        else A.pos = [A.tgt[0] + rnd(-0.3, 0.3), A.tgt[1] + rnd(-0.3, 0.3)];
        if (T.role === 'bomber' && A.region !== null) this.bombRegion(u, A.region);
        if (--A.timer <= 0) A.phase = 'back';
      } else if (A.phase === 'back' || A.phase === 'ferry') {
        const dest = A.phase === 'ferry' ? A.tgt : basePos;
        A.pos = stepToward(A.pos, dest, fly);
        if (kmBetween(A.pos, dest) < 15) { A.cd = A.phase === 'ferry' ? 0 : 4; A.phase = 'base'; A.track = null; }
      }
      this.placeUnit(u);
    }
  }
  bombRegion(u, i) {
    const r = this.s.regions[i];
    if (!r || !r.owner || !this.atWar(u.nation, r.owner)) return;
    r.damage = clamp(r.damage + 0.02, 0, 0.85);
    this.shots.push({ a: u.pos, b: this.slot({ id: (Math.random() * 1e6) | 0, type: 'INF0' }, i), k: 'bomb', n: u.nation });
    if (Math.random() < 0.05) {
      const keys = Object.keys(r.bld).filter(k => r.bld[k] > 0);
      if (keys.length) { const k = keys[(Math.random() * keys.length) | 0]; r.bld[k]--; this.emit('battle', `${this.nm(u.nation)} bombers destroyed part of the ${BUILDINGS[k].name.toLowerCase()} in ${this.w.regions[i].name}.`, [u.nation, r.owner], { loc: i }); }
    }
  }

  // ---- range-based combat with spatial buckets
  combat() {
    const s = this.s, w = this.w;
    const CELL = 4;
    const buckets = new Map();
    const key = (la, lo) => Math.floor((la + 90) / CELL) * 1000 + Math.floor((((lo + 180) % 360) + 360) % 360 / CELL);
    let any = false;
    for (const u of s.units) {
      u.fighting = Math.max(0, u.fighting - 1);
      if (u.air && u.air.phase === 'base') continue;
      const k = key(u.pos[0], u.pos[1]);
      if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(u);
    }
    if (!Object.values(s.rel).includes('war')) { this.battles = []; return; }
    const near = (u, R) => {
      const out = []; const [la, lo] = u.pos;
      const kl = Math.ceil(R / (CELL * 111)), ko = Math.min(45, Math.ceil(R / (CELL * 111 * Math.max(0.2, Math.cos(la * DEG)))));
      const bl = Math.floor((la + 90) / CELL), bo = Math.floor((((lo + 180) % 360) + 360) % 360 / CELL);
      for (let dl = -kl; dl <= kl; dl++) for (let dO = -ko; dO <= ko; dO++) {
        const arr = buckets.get((bl + dl) * 1000 + ((bo + dO + 90) % 90)); if (!arr) continue;
        for (const e of arr) if (e !== u && e.nation !== u.nation) out.push(e);
      }
      return out;
    };
    const dmg = new Map();
    const hit = (t, v) => dmg.set(t, (dmg.get(t) || 0) + v);
    const battleAt = new Map();
    for (const u of s.units) {
      const T = UNITS[u.type];
      if (!T.atk) continue;
      if (!this.warsOf(u.nation).length) continue;
      const airborne = u.air && u.air.phase !== 'base';
      if (u.air && !airborne) continue;
      if (T.domain === 'land' && w.regions[u.loc].sea) continue; // embarked
      let R = T.range;
      if (u.air) R = u.air.phase === 'engage' ? 140 : 45;
      let best = null, bd = Infinity;
      for (const e of near(u, Math.max(R, 30))) {
        if (!this.atWar(u.nation, e.nation)) continue;
        const ET = UNITS[e.type];
        const eAir = e.air && e.air.phase !== 'base';
        const eSea = ET.domain === 'sea';
        const eEmb = ET.domain === 'land' && w.regions[e.loc].sea;
        if (T.domain === 'land') {
          if (eSea && !T.indirect) continue;
          if (eAir && !T.aa && !(T.age >= 7 && (T.role === 'melee' || T.role === 'mounted'))) continue;
          if (!eAir && T.role === 'aa') continue;
        }
        if (T.role === 'sub' && !(eSea || eEmb)) continue;
        if (T.role === 'warship' && !eSea && !eEmb && !(eAir && T.aa) && T.range < 80) continue;
        if (T.role === 'transport') continue;
        if (u.air && u.air.phase !== 'engage' && !eAir) continue;
        if (T.role === 'bomber' && eAir) continue;
        if (ET.stealth && !T.antisub && Math.random() > 0.25) continue;
        const d = kmBetween(u.pos, e.pos);
        const sameTile = T.domain === 'land' && ET.domain === 'land' && e.loc === u.loc && !eEmb;
        if (d > R && !sameTile) continue;
        let score = d * rnd(0.7, 1.3);
        if (T.role === 'sub' && (ET.role === 'transport' || eEmb || ET.role === 'carrier')) score *= 0.3;
        if (T.antisub && ET.role === 'sub') score *= 0.2;
        if (T.role === 'fighter' && eAir) score *= 0.1;
        if (T.antiArmor && ET.armor) score *= 0.3;
        if (score < bd) { bd = score; best = e; }
      }
      if (!best) continue;
      any = true;
      const t = best, TT = UNITS[t.type];
      const um = unitMods(s, u, T.domain), tm = unitMods(s, t, TT.domain);
      let A = T.atk * um.atk * (T.antisub && TT.role === 'sub' ? 3 : 1) * (T.antiArmor && TT.armor ? 2 : 1) * (1 + (s.nations[u.nation].bonusAtk || 0));
      if (T.role === 'fighter' && !(t.air && t.air.phase !== 'base')) A *= 0.55;
      if (T.domain === 'land' && TT.domain === 'air') A *= T.aa ? 1.2 : 0.4;
      if (T.role === 'mounted' && !T.armor && TT.role === 'melee' && TT.age >= 1 && TT.age <= 5) A *= 0.75; // spears and pikes blunt cavalry
      const tr = s.regions[t.loc];
      let D = TT.def * tm.def;
      if (TT.domain === 'land' && !w.regions[t.loc].sea) {
        D *= 1 + (TERRAIN[this.T[t.loc].terrain]?.def || 0) * 0.6;
        if (tr && t.nation === tr.owner) D *= 1.1 + 0.3 * (tr.bld.walls || 0);
      }
      if (TT.domain === 'land' && w.regions[t.loc].sea) D = Math.min(D, 1);
      const hpf = 0.5 + 0.5 * u.hp / u.mhp;
      hit(t, 2.2 * A * (A / (A + D)) * hpf * rnd(0.7, 1.3));
      u.fighting = 3; t.fighting = 3;
      u.xp = Math.min(100, (u.xp || 0) + 0.06);
      if (this.shots.length < 600) {
        const k = u.air ? (T.role === 'bomber' ? 'bomb' : 'air') : T.role === 'sub' ? 'torp' : T.airwing ? 'wing' : T.indirect ? (T.age <= 4 ? 'stone' : 'art') : TT.domain === 'air' ? 'aa' : T.role === 'ranged' && T.age <= 4 ? 'arrow' : T.age <= 4 ? 'melee' : 'gun';
        this.shots.push({ a: u.pos, b: t.pos, k, n: u.nation });
      }
      const bl = TT.domain === 'air' ? u.loc : t.loc;
      if (!battleAt.has(bl)) battleAt.set(bl, new Set()); battleAt.get(bl).add(u.nation).add(t.nation);
    }
    this.battles = [...battleAt].map(([loc, ns]) => ({ loc, nations: [...ns], pos: this.anchor(loc) }));
    if (!any) return;
    const lost = [];
    for (const [u, d] of dmg) {
      u.hp -= d;
      const N = s.nations[u.nation]; if (N) N.exhaustion = clamp(N.exhaustion + d / (UNITS[u.type].hp * 60) * (1 + (N.mods?.exhaustion || 0)), 0, 1);
      if (u.hp <= 0) lost.push(u);
    }
    for (const u of lost) {
      this.shots.push({ a: u.pos, b: u.pos, k: 'kill', n: u.nation });
      this.removeUnit(u);
      if (Math.random() < 0.5 || UNITS[u.type].domain !== 'land') this.emit('loss', `The ${this.nm(u.nation)} lost ${/^[aeiou]/i.test(UNITS[u.type].name) ? 'an' : 'a'} ${UNITS[u.type].name.toLowerCase().replace(/s$/, '')} unit near ${w.regions[u.loc].name}.`, [u.nation], { loc: u.loc });
    }
  }

  // ---- sieges of enemy settlements, and subjugation of native peoples
  siegePower(units, defAge) { let p = 0; for (const u of units) { const T = UNITS[u.type]; p += (u.hp / u.mhp) * (T.atk / refAtk(defAge)) * (T.role === 'siege' ? 1.6 : 1) * (1 + (this.s.nations[u.nation].mods?.siege || 0)); } return p; }
  garrison(r) {
    if (!r.owner) return 0.4 + 0.45 * Math.sqrt(r.natives || 0);
    const N = this.s.nations[r.owner];
    return (0.6 + 0.3 * r.lvl + 0.8 * (r.bld.walls || 0) + (N?.capital === r.i ? 0.8 : 0)) * (1 + (N?.mods?.garrison || 0));
  }
  captures() {
    const s = this.s, w = this.w;
    if (s.t % 2) return;
    const landAt = new Map();
    for (const u of s.units) if (UNITS[u.type].domain === 'land' && !w.regions[u.loc].sea && !u.move && UNITS[u.type].atk > 0) { if (!landAt.has(u.loc)) landAt.set(u.loc, []); landAt.get(u.loc).push(u); }
    for (const r of s.regions) {
      if (r.sea) continue;
      if (!r.capture && !landAt.has(r.i)) continue;
      const us = landAt.get(r.i);
      if (!us) { r.capture.p = Math.max(0, r.capture.p - 0.04); if (r.capture.p <= 0) r.capture = null; continue; }
      let hostile, defenders = [], defAge;
      if (r.owner) {
        defenders = us.filter(u => u.nation === r.owner || (this.mayPass(u.nation, r.owner) && !us.some(e => this.atWar(e.nation, u.nation) && e.nation !== r.owner)));
        hostile = us.filter(u => this.atWar(u.nation, r.owner));
        defAge = s.nations[r.owner].age;
      } else {
        if ((r.natives || 0) < 0.25) { r.capture = null; continue; }
        hostile = us.filter(u => r.subjugate === u.nation || s.nations[u.nation].subjugate?.includes(r.i));
        defAge = Math.max(0, Math.min(...hostile.map(u => s.nations[u.nation].age)) - 1);
      }
      if (!hostile.length || defenders.length) { if (r.capture) { r.capture.p = Math.max(0, r.capture.p - 0.1); if (r.capture.p <= 0) r.capture = null; } continue; }
      const by = {}; for (const u of hostile) by[u.nation] = (by[u.nation] || 0) + 1;
      const lead = Object.entries(by).sort((a, b) => b[1] - a[1])[0][0];
      const power = this.siegePower(hostile.filter(u => u.nation === lead), defAge);
      if (!r.capture || r.capture.by !== lead) r.capture = { by: lead, p: 0 };
      const gar = this.garrison(r);
      for (const u of hostile) if (Math.random() < 0.25) u.hp = Math.max(1, u.hp - u.mhp * 0.004 * gar / hostile.length);
      if (power > gar) r.capture.p += Math.min(4, power - gar) / (55 * (1 + (r.bld?.walls || 0) * 0.5));
      if (r.capture.p >= 1) {
        if (r.owner) this.transfer(r, lead);
        else this.subjugate(r, lead);
      }
    }
  }
  subjugate(r, c) {
    const N = this.s.nations[c];
    r.owner = r.core = c; r.capture = null; r.claim = null;
    r.pop = (r.natives || 0) * 0.6; r.natives = 0; r.lvl = Math.max(r.lvl, 1); r.unrest = 0.5;
    this.owned.get(c).add(r.i);
    onSettled(this, r, N, true);
    onAcquire(this, r, c, 'subdue');
    N.subjugate = (N.subjugate || []).filter(i => i !== r.i);
    this.emit('capture', `The ${this.nm(c)} subdue the native peoples of ${this.w.regions[r.i].name}.`, [c], { loc: r.i });
  }
  transfer(r, to, peaceful = false, how = null) {
    const s = this.s, w = this.w;
    const from = r.owner;
    r.owner = to; r.capture = null; r.claim = null;
    this.owned.get(from)?.delete(r.i); this.owned.get(to)?.add(r.i);
    onTransfer(this, r);
    onAcquire(this, r, to, how || (peaceful ? 'cede' : 'conquest'));
    if (!peaceful) { r.bld.walls = Math.max(0, (r.bld.walls || 0) - 1); r.damage = clamp(r.damage + 0.25, 0, 0.8); r.pop *= 0.92; r.unrest = clamp(r.unrest + 0.5, 0, 1); }
    if (r.build && r.build.kind !== 'wonder') r.build = null;
    if (r.build?.kind === 'wonder') { r.build = null; }
    const N = s.nations[from];
    N.queue = N.queue.filter(q => q.region !== r.i);
    if (!peaceful) N.exhaustion = clamp(N.exhaustion + 0.04, 0, 1);
    for (const [id, o] of Object.entries(s.wonders)) if (o === from && s.wonderAt?.[id] === r.i) s.wonders[id] = to;
    this.emit('capture', peaceful ? `The ${this.nm(from)} cede ${w.regions[r.i].name} to the ${this.nm(to)}.` : `The ${this.nm(to)} captured ${w.regions[r.i].name} from the ${this.nm(from)}.`, [to, from], { loc: r.i });
    const left = this.regionsOf(from);
    if (!left.length) {
      N.alive = false; N.overlord = null; this._vmap = null;
      for (const v of this.vassalsOf(from)) this.s.nations[v].overlord = null;
      this._vmap = null;
      for (const u of this.unitsOf(from)) this.removeUnit(u);
      s.trades = s.trades.filter(t => t.from !== from && t.to !== from);
      for (const k of Object.keys(s.rel)) if (k.split('|').includes(from)) delete s.rel[k];
      this._rx = null;
      this.emit('war', `The ${this.full(from)} has fallen. Its last lands belong to the ${this.nm(to)}.`, [from, to], { loc: r.i, major: true });
    } else if (N.capital === r.i) {
      N.capital = left.sort((a, b) => b.pop - a.pop)[0].i;
      this.emit('war', `The ${this.nm(from)} move their capital to ${w.regions[N.capital].name}.`, [from], { loc: N.capital });
    }
    for (const t of s.trades) if (t.path.includes(r.i)) t.path = this.tradePath(t.from, t.to) || t.path;
  }

  // ---------------------------------------------------------------- land: claims, improvements, settlements, buildings
  housing(r, N) {
    const t = this.T[r.i]; const m = N?.mods || {};
    return SETTLEMENTS[r.lvl].housing * Math.max(0.15, t.hab) * (1 + (m.housing || 0) + 0.25 * (r.bld?.aqueduct || 0) + 0.1 * (r.bld?.granary || 0)) + (r.imp?.farm || 0) * 0.15 * Math.pow(1.5, N?.age || 0);
  }
  claimReach(c) {
    // tiles a civilization can reach to claim: land neighbours, plus coasts reachable by boat (cached for the hour)
    if (this._reachT !== this.s.t) { this._reach = new Map(); this._reachT = this.s.t; }
    const hit = this._reach.get(c); if (hit) return hit;
    const s = this.s, w = this.w, N = s.nations[c];
    const out = new Set();
    this._reach.set(c, out);
    const boat = !!N.techs.rafts, ocean = this.canOcean(c);
    const seas = new Set();
    for (const i of this.owned.get(c) || []) for (const j of w.adj[i]) {
      if (w.regions[j].sea) { if (boat && (!w.regions[j].deep || ocean)) seas.add(j); continue; }
      if (!s.regions[j].owner) out.add(j);
    }
    if (seas.size) {
      const hops = ocean ? 3 : N.techs.sailing ? 2 : 1;
      const reach = new Set(seas);
      let frontier = [...seas];
      for (let h = 1; h < hops; h++) { const nf = []; for (const z of frontier) for (const j of w.adj[z]) if (w.regions[j].sea && !reach.has(j) && (!w.regions[j].deep || ocean)) { reach.add(j); nf.push(j); } frontier = nf; }
      for (const z of reach) for (const j of w.adj[z]) if (!w.regions[j].sea && !s.regions[j].owner) out.add(j);
    }
    return out;
  }
  claimCost(c, i) {
    const N = this.s.nations[c], r = this.s.regions[i], m = N.mods || {};
    const n = this.owned.get(c)?.size || 1;
    const k = Math.pow(ageScale(N.age), 0.8) * (1 + 0.035 * n) * (1 + 0.06 * (N.expHeat || 0)) * Math.max(0.3, 1 + (m.claimCost || 0)) * (1 + Math.min(2, (r.natives || 0) * 0.35));
    const cost = { food: +(4 * k).toFixed(1), wood: +(2 * k).toFixed(1) };
    if (N.age >= 1) cost.wealth = +(2.5 * k).toFixed(1);
    const settlers = +(0.35 * Math.pow(1.5, N.age)).toFixed(2);
    const days = Math.round((7 + Math.min(12, (r.natives || 0) * 3)) * Math.max(0.35, 1 - (m.claimSpeed || 0)));
    return { cost, settlers, days };
  }
  canClaim(c, i) {
    const s = this.s, N = s.nations[c], r = s.regions[i];
    if (!r || r.sea) return { ok: false, why: 'Cannot settle the sea.' };
    if (r.owner) return { ok: false, why: 'Already claimed.' };
    if (this.T[i].terrain === 'ice' && !N.techs.refrigeration) return { ok: false, why: 'The ice sheet cannot be settled yet.' };
    if (r.claim?.by === c) return { ok: false, why: 'Settlers are already on the way.' };
    if (!this.claimReach(c).has(i)) return { ok: false, why: N.techs.rafts ? 'Out of reach. Claim land next to your territory or along coasts your boats can reach.' : 'Out of reach. Claim land next to your territory (Rafts unlock coastal crossings).' };
    const active = this.activeClaims(c);
    const maxC = this.maxClaims(N);
    if (active >= maxC) return { ok: false, why: `Your people can found ${maxC} settlement${maxC > 1 ? 's' : ''} at a time.` };
    const cc = this.claimCost(c, i);
    for (const [k, v] of Object.entries(cc.cost)) if ((N[k] || 0) < v) return { ok: false, why: `Need ${v} ${k}.`, ...cc };
    const src = this.settlerSource(c, i);
    if (!src) return { ok: false, why: `No settlement has ${(cc.settlers + 0.6).toFixed(1)}k people to spare.`, ...cc };
    return { ok: true, ...cc, src };
  }
  maxClaims(N) { return 1 + Math.floor(N.age / 2) + (N.gov.laws.expansion === 'frontier' || N.gov.laws.expansion === 'manifest' ? 1 : 0); }
  activeClaims(c) {
    if (this._clT !== this.s.t) { this._cl = new Map(); for (const x of this.s.regions) if (x.claim) this._cl.set(x.claim.by, (this._cl.get(x.claim.by) || 0) + 1); this._clT = this.s.t; }
    return this._cl.get(c) || 0;
  }
  settlerSource(c, i) {
    const cc = this.claimCost(c, i), at = this.anchor(i);
    return this.regionsOf(c).filter(r => r.pop > cc.settlers + 0.6).sort((a, b) => kmBetween(this.anchor(a.i), at) - kmBetween(this.anchor(b.i), at))[0] || null;
  }
  claim(c, i) {
    const chk = this.canClaim(c, i); if (!chk.ok) return chk;
    this._clT = -1;
    const N = this.s.nations[c], r = this.s.regions[i];
    for (const [k, v] of Object.entries(chk.cost)) N[k] -= v;
    chk.src.pop -= chk.settlers;
    r.claim = { by: c, left: chk.days, total: chk.days, settlers: chk.settlers };
    return chk;
  }
  cancelClaim(i) {
    this._clT = -1; const r = this.s.regions[i]; if (r.claim) { const N = this.s.nations[r.claim.by]; this.regionsOf(r.claim.by)[0] && (this.s.regions[N.capital].pop += r.claim.settlers || 0); r.claim = null; } }
  completeClaim(r) {
    this._clT = -1; this._reachT = -1;
    const c = r.claim.by, N = this.s.nations[c];
    if (r.owner) { r.claim = null; return; }
    const natives = (r.natives || 0) > (r.claim.settlers || 0.3) * 2;
    r.owner = r.core = c; r.lvl = 1; r.pop = (r.claim.settlers || 0.3) + (r.natives || 0) * 0.85; r.natives = 0; r.unrest = r.pop > 1.5 ? 0.15 : 0;
    r.claim = null; this.owned.get(c).add(r.i);
    onSettled(this, r, N, natives);
    onAcquire(this, r, c, 'settle');
    for (const x of this.s.regions) if (x.claim && x.i === r.i) x.claim = null;
    if (c === this.s.player) this.emit('claim', `Settlers found a new camp at ${this.w.regions[r.i].name}.`, [c], { loc: r.i });
  }

  // improvement and building costs scale with the age of the work
  impCost(N, type, level) {
    const k = Math.pow(ageScale(N.age), 0.9) * (1 + 0.3 * (level - 1)) * (1 + (N.mods?.buildCost || 0));
    const late = N.age >= 5 ? 0.45 : 1;
    const c = { wood: 2.2 * k * late };
    if (['quarry', 'mine', 'well'].includes(type)) c.stone = 1.2 * k * late;
    if (N.age >= 1) c.wealth = 1 * k;
    if (N.age >= 5) c.metal = 1.3 * k;
    return scaleCost(c, 1);
  }
  canImprove(c, i, type) {
    const s = this.s, N = s.nations[c], r = s.regions[i], I = IMPROVEMENTS[type];
    if (r.owner !== c) return { ok: false, why: 'Not your land.' };
    if (r.build) return { ok: false, why: 'Work already under way here.' };
    if (I.tech && !N.techs[I.tech]) return { ok: false, why: `Requires ${TECH[I.tech].name}.` };
    if (!I.need(this.tileInfo(i), N)) return { ok: false, why: 'Not possible on this land.' };
    const lvl = r.imp[type] || 0;
    if (lvl >= IMP_CAP[N.age]) return { ok: false, why: `Maximum level for the ${AGES[N.age].name}.` };
    if (r.capture) return { ok: false, why: 'Under siege.' };
    const cost = this.impCost(N, type, lvl + 1);
    for (const [k, v] of Object.entries(cost)) if ((N[k] || 0) < v) return { ok: false, why: `Need ${v} ${k}.`, cost };
    return { ok: true, cost, days: 5 + 2 * lvl };
  }
  bldCost(N, type, level) {
    const B = BUILDINGS[type]; const L = B.levels[level - 1];
    const a = TECH[L[1]]?.age ?? N.age;
    const k = 2 * ageScale(a) * (1 + 0.25 * (level - 1)) * (1 + (N.mods?.buildCost || 0));
    const c = {};
    for (const [r, v] of Object.entries(B.cost)) { if ((r === 'wealth' || r === 'metal') && a === 0) continue; if (a >= 5 && (r === 'wood' || r === 'stone')) { c[r] = v * k * 0.4; c.metal = (c.metal || 0) + v * k * 0.5; continue; } c[r] = (c[r] || 0) + v * k; }
    return scaleCost(c, 1);
  }
  canBuild(c, i, type) {
    const s = this.s, N = s.nations[c], r = s.regions[i], B = BUILDINGS[type];
    if (r.owner !== c) return { ok: false, why: 'Not your land.' };
    if (r.build) return { ok: false, why: 'Work already under way here.' };
    const lvl = r.bld[type] || 0;
    if (lvl >= B.levels.length) return { ok: false, why: 'Fully built.' };
    const [name, tech, minLvl] = B.levels[lvl];
    if (!N.techs[tech]) return { ok: false, why: `${name} requires ${TECH[tech].name}.`, locked: true };
    if (r.lvl < minLvl) return { ok: false, why: `${name} needs a ${SETTLEMENTS[minLvl].name}.` };
    if (B.coastal && !this.T[i].coastal) return { ok: false, why: 'Requires a coastline.' };
    if (r.capture) return { ok: false, why: 'Under siege.' };
    const cost = this.bldCost(N, type, lvl + 1);
    for (const [k, v] of Object.entries(cost)) if ((N[k] || 0) < v) return { ok: false, why: `Need ${v} ${k}.`, cost };
    return { ok: true, cost, days: Math.round(B.days * (1 + 0.2 * lvl)), name };
  }
  canUpgradeSettlement(c, i) {
    const s = this.s, N = s.nations[c], r = s.regions[i];
    if (r.owner !== c) return { ok: false, why: 'Not your land.' };
    if (r.build) return { ok: false, why: 'Work already under way here.' };
    const next = r.lvl + 1; const S = SETTLEMENTS[next];
    if (!S) return { ok: false, why: 'Largest possible settlement.' };
    if (S.tech && !N.techs[S.tech]) return { ok: false, why: `A ${S.name} requires ${TECH[S.tech].name}.`, locked: true };
    const cap = this.housing(r, N);
    if (r.pop < cap * 0.55) return { ok: false, why: `Needs ${(cap * 0.55).toFixed(1)}k people (has ${r.pop.toFixed(1)}k).` };
    const cost = scaleCost(S.cost, 1 + (N.mods?.buildCost || 0));
    for (const [k, v] of Object.entries(cost)) if ((N[k] || 0) < v) return { ok: false, why: `Need ${v} ${k}.`, cost };
    return { ok: true, cost, days: S.days, name: S.name };
  }
  canWonder(c, i, id) {
    const s = this.s, N = s.nations[c], r = s.regions[i], W = WONDERS[id];
    if (s.wonders[id]) return { ok: false, why: `Already built by the ${this.nm(s.wonders[id])}.` };
    if (r.owner !== c) return { ok: false, why: 'Not your land.' };
    if (r.build) return { ok: false, why: 'Work already under way here.' };
    if (!N.techs[W.tech]) return { ok: false, why: `Requires ${TECH[W.tech].name}.`, locked: true };
    const minLvl = TECH[W.tech].age === 0 ? 1 : TECH[W.tech].age === 1 ? 2 : 3;
    if (r.lvl < minLvl) return { ok: false, why: `Must be built in a ${SETTLEMENTS[minLvl].name} or larger.` };
    if (s.regions.some(x => x.build?.kind === 'wonder' && x.build.type === id && x.owner === c)) return { ok: false, why: 'Already under construction.' };
    const cost = scaleCost(W.cost, 1 + (N.mods?.buildCost || 0));
    for (const [k, v] of Object.entries(cost)) if ((N[k] || 0) < v) return { ok: false, why: `Need ${v} ${k}.`, cost };
    return { ok: true, cost, days: W.days };
  }
  startWork(c, i, kind, type) {
    const chk = kind === 'imp' ? this.canImprove(c, i, type) : kind === 'bld' ? this.canBuild(c, i, type) : kind === 'settle' ? this.canUpgradeSettlement(c, i) : this.canWonder(c, i, type);
    if (!chk.ok) return chk;
    const N = this.s.nations[c], r = this.s.regions[i];
    for (const [k, v] of Object.entries(chk.cost)) N[k] -= v;
    const level = kind === 'imp' ? (r.imp[type] || 0) + 1 : kind === 'bld' ? (r.bld[type] || 0) + 1 : kind === 'settle' ? r.lvl + 1 : 1;
    r.build = { kind, type: type || 'settle', level, left: chk.days, total: chk.days, cost: chk.cost };
    return chk;
  }
  cancelWork(i) {
    const r = this.s.regions[i]; if (!r.build) return;
    const N = this.s.nations[r.owner];
    for (const [k, v] of Object.entries(r.build.cost || {})) N[k] += v * 0.75;
    r.build = null;
  }
  workName(b) {
    if (b.kind === 'imp') return `${IMPROVEMENTS[b.type].name} ${b.level}`;
    if (b.kind === 'bld') return BUILDINGS[b.type].levels[b.level - 1][0];
    if (b.kind === 'settle') return `Grow into a ${SETTLEMENTS[b.level].name}`;
    return WONDERS[b.type].name;
  }
  buildRate(r, N) { return (0.5 + 0.12 * r.lvl + 0.1 * (r.bld.workshop || 0)) * (0.4 + 0.6 * (N.st.eF ?? 1)) * (1 + (N.mods?.build || 0)); }
  finishWork(r, N) {
    const b = r.build, s = this.s;
    if (b.kind === 'imp') r.imp[b.type] = b.level;
    else if (b.kind === 'bld') r.bld[b.type] = b.level;
    else if (b.kind === 'settle') { r.lvl = b.level; if (N.code === s.player || b.level >= 4) this.emit('build', `${this.w.regions[r.i].name} has grown into a ${SETTLEMENTS[b.level].name}.`, [N.code], { loc: r.i, major: b.level >= 5 && N.code !== s.player ? false : false }); }
    else if (b.kind === 'wonder') {
      s.wonders[b.type] = N.code; (s.wonderAt ||= {})[b.type] = r.i;
      for (const x of s.regions) if (x !== r && x.build?.kind === 'wonder' && x.build.type === b.type) { const O = s.nations[x.owner]; for (const [k, v] of Object.entries(x.build.cost || {})) O[k] += v * 0.5; if (x.owner === s.player) this.emit('build', `The ${this.nm(N.code)} finished the ${WONDERS[b.type].name} first. Half our materials are recovered.`, [x.owner], { loc: x.i }); x.build = null; }
      this.emit('wonder', `The ${this.nm(N.code)} complete the ${WONDERS[b.type].name} in ${this.w.regions[r.i].name}.`, [N.code], { loc: r.i, major: true });
      if (WONDERS[b.type].victory && s.victory.science) { s.over = true; s.winner = N.code; s.winType = 'science'; this.emit('wonder', `The ${this.nm(N.code)} launch the first interstellar colony ship. A new chapter of history begins among the stars.`, [N.code], { major: true }); }
      computeMods(s, N);
    }
    if (N.code === s.player && b.kind !== 'settle' && b.kind !== 'wonder') this.emit('build', `${this.workName(b)} completed at ${this.w.regions[r.i].name}.`, [N.code], { loc: r.i });
    r.build = null;
  }

  // ---------------------------------------------------------------- age advancement
  advanceCost(N) {
    const a = N.age + 1, k = ageScale(a) * 3.2;
    const c = a === 1 ? { food: 4 * k, wood: 2.5 * k, stone: 2 * k } : a === 2 ? { food: 1.2 * k, wood: 2.5 * k, stone: 2 * k } : a <= 5 ? { wood: 1.5 * k, stone: 1.2 * k } : { wood: 0.5 * k, stone: 0.5 * k };
    // early kingdoms earn little coin: the first metal ages ask less of the treasury
    if (a >= 2) { c.metal = (a >= 6 ? 2.8 : 2) * k; c.wealth = (a === 2 ? 1.4 : a === 3 ? 2.2 : 3) * k; }
    return scaleCost(c, 1);
  }
  canAdvance(c) {
    const N = this.s.nations[c];
    if (N.age >= NAGES - 1) return { ok: false, why: 'The final age.' };
    if (N.ageAdv) return { ok: false, why: 'Already advancing.' };
    const p = ageProgress(N);
    if (p < ADVANCE_SHARE) return { ok: false, why: `Know ${Math.ceil(ADVANCE_SHARE * AGE_TECHS[N.age].length)} of the ${AGE_TECHS[N.age].length} ${AGES[N.age].name} technologies (${Math.round(p * AGE_TECHS[N.age].length)} so far).`, progress: p };
    const cost = this.advanceCost(N);
    for (const [k, v] of Object.entries(cost)) if ((N[k] || 0) < v) return { ok: false, why: `Need ${v} ${k}.`, cost };
    return { ok: true, cost, days: 10 + 2 * N.age };
  }
  advance(c) {
    const chk = this.canAdvance(c); if (!chk.ok) return chk;
    const N = this.s.nations[c];
    for (const [k, v] of Object.entries(chk.cost)) N[k] -= v;
    N.ageAdv = { left: chk.days, total: chk.days };
    return chk;
  }
  finishAdvance(N) {
    N.age++; N.ageAdv = null;
    computeMods(this.s, N);
    const first = !Object.values(this.s.nations).some(x => x !== N && x.alive && x.age >= N.age);
    this.emit('age', first ? `The ${this.full(N.code)} is the first civilization to enter the ${AGES[N.age].name}.` : `The ${this.nm(N.code)} enter the ${AGES[N.age].name}.`, [N.code], { loc: N.capital, major: first || N.code === this.s.player });
    if (N.code === this.s.player) refreshCandidates(this.s, N);
  }

  // ---------------------------------------------------------------- economy
  sanctionMult(c) { let w = 0; for (const x of this.s.sanctions) if (x.on === c && this.s.nations[x.by]?.alive) w += this.worldShare(x.by); return 1 - Math.min(0.35, w * 0.8); }
  // per-tile output for a nation; returns { food, wood, stone, metal, wealth, oil, rp, energy, eCons, labor, need }
  tileYield(r, N) {
    const t = this.T[r.i], Ter = TERRAIN[t.terrain], m = N.mods, a = N.age;
    const o = { food: 0, wood: 0, stone: 0, metal: 0, wealth: 0, oil: 0, rp: 0, energy: 0, eCons: 0 };
    let levels = 0; for (const k of IMP_ORDER) levels += r.imp[k] || 0;
    const lab = LABOR(a) * Math.max(0.4, 1 + (m.labor || 0));
    const lr = levels ? clamp(r.pop * 0.6 / (levels * lab), 0.1, 1) : 1;
    const ok = (1 - r.damage * 0.6) * (1 - r.unrest * 0.35) * (this.socOut ? this.socOut[r.i] || 1 : 1);
    const dep = imp => { let s = 0; for (const d of r.dep) if (RES[d.r].imp === imp && known(N, d.r)) s += d.amt; return s; };
    const depOf = (imp, f) => { let s = 0; for (const d of r.dep) if (RES[d.r].imp === imp && known(N, d.r)) s += f(d, RES[d.r]); return s; };
    // foraging and gathering around every settlement
    o.food += Ter.food * 0.15 * (t.river ? 1.25 : 1) + (t.coastal ? 0.04 : 0);
    o.wood += Ter.wood * 0.12 + 0.02; o.stone += Ter.stone * 0.09 + 0.015;
    const I = r.imp;
    if (I.farm) o.food += I.farm * 0.26 * Math.max(0.2, t.fert) * (1 + 0.3 * depOf('farm', d => RES[d.r].kind === 'food' ? d.amt : 0)) * lr;
    if (I.pasture) o.food += I.pasture * 0.15 * (1 + 0.3 * depOf('pasture', d => d.amt)) * lr;
    if (I.camp) { o.food += I.camp * 0.11 * (0.5 + 0.5 * Math.min(1, t.forest)) * (1 + 0.35 * depOf('camp', d => d.r === 'game' ? d.amt : 0)) * lr; o.wealth += I.camp * 0.02 * depOf('camp', (d, R) => (R.wealth || 0) * d.amt) * lr; }
    if (I.fishery) { o.food += I.fishery * 0.2 * (1 + 0.35 * depOf('fishery', d => d.r === 'fish' ? d.amt : 0)) * lr; o.wealth += I.fishery * 0.02 * depOf('fishery', (d, R) => (R.wealth || 0) * d.amt) * lr; }
    if (I.lumber) o.wood += I.lumber * 0.32 * Math.max(0.3, Ter.wood) * (1 + 0.4 * dep('lumber')) * lr;
    if (I.quarry) { o.stone += I.quarry * 0.36 * Math.max(0.3, Ter.stone) * (1 + 0.4 * dep('quarry')) * lr; o.wealth += I.quarry * 0.02 * depOf('quarry', (d, R) => (R.wealth || 0) * d.amt) * lr; }
    if (I.mine) {
      o.metal += I.mine * 0.22 * depOf('mine', (d, R) => (R.metal || 0) * d.amt) * lr;
      o.wealth += I.mine * 0.035 * depOf('mine', (d, R) => (R.wealth || 0) * d.amt) * lr;
      if (a >= 6) o.energy += I.mine * 0.8 * depOf('mine', (d, R) => (R.energy || 0) * d.amt) * lr;
    }
    if (I.plantation) { o.wealth += I.plantation * 0.035 * depOf('plantation', (d, R) => (R.wealth || 0) * d.amt) * lr; o.food += I.plantation * 0.12 * depOf('plantation', (d, R) => R.kind === 'food' ? d.amt : 0) * lr; }
    if (I.well) { const oil = depOf('well', d => d.r === 'oil' ? d.amt : 0), gas = depOf('well', d => d.r === 'natural_gas' ? d.amt : 0); o.oil += I.well * 0.3 * oil * lr; o.energy += I.well * (0.4 * oil + 0.55 * gas) * lr; o.wealth += I.well * 0.02 * gas * lr; }
    // people: commerce, learning, buildings
    const pop = Math.max(0, r.pop);
    o.wealth += 0.004 * Math.pow(pop, 0.9) * COMMERCE[r.lvl] * (1 + 0.3 * (r.bld.market || 0)) + 0.05 * (r.bld.workshop || 0) * Math.pow(ageScale(a), 0.8);
    o.metal += 0.06 * (r.bld.workshop || 0) * Math.pow(ageScale(a), 0.7) + (a >= 1 && r.lvl >= 2 ? 0.015 * r.lvl * Math.pow(ageScale(a), 0.6) : 0); // smiths, scrap and bog iron
    o.rp += 0.22 + 0.08 * r.lvl + 0.06 * Math.pow(pop, 0.6) + 0.08 * (r.bld.temple || 0) + (r.bld.library || 0) * 0.3 * Math.pow(ageScale(a), 0.55) * (0.5 + r.lvl / 4) + (r.bld.datacenter || 0) * 0.6 * Math.pow(ageScale(a), 0.6) * (1 + (m.aiBoost || 0));
    if (a >= 6) {
      o.energy += (r.bld.power || 0) * 3;
      o.eCons += pop * 0.002 * (a - 5) + (r.bld.workshop || 0) * 0.6 + (r.bld.datacenter || 0) * 2.5 + (r.bld.aqueduct || 0) * 0.3;
    }
    // technology multipliers
    const mech = 1 + 0.3 * a; // saws, cranes and machines multiply what each worker cuts and quarries
    o.food *= (1 + m.food) * (1 + 0.2 * Math.max(0, a - 5)) * ok * harvest(this.w.regions[r.i].lat, this.s.t) * (N.agri || 1); o.wood *= (1 + m.wood) * mech * ok; o.stone *= (1 + m.stone) * mech * ok; o.metal *= (1 + m.metal) * ok;
    o.wealth *= (1 + m.wealth) * ok; o.oil *= (1 + m.oil) * ok; o.rp *= ok; o.energy *= (1 + m.energy) * ok;
    o.labor = lr; o.levels = levels;
    return o;
  }
  // strategic and luxury access: tiles with a worked deposit
  computeAccess(N) {
    const acc = {};
    for (const i of this.owned.get(N.code) || []) {
      const r = this.s.regions[i];
      for (const d of r.dep) { const R = RES[d.r]; if (R.kind !== 'strategic' && R.kind !== 'luxury') continue; if (!known(N, d.r)) continue; if ((r.imp[R.imp] || 0) > 0) acc[d.r] = (acc[d.r] || 0) + 1; }
    }
    for (const t of this.s.trades) if (!t.blockaded && t.good.startsWith('res:')) { const k = t.good.slice(4); if (t.to === N.code) acc[k] = (acc[k] || 0) + 1; }
    for (const v of this.vassalsOf(N.code)) for (const i of this.owned.get(v) || []) {
      const r = this.s.regions[i];
      for (const d of r.dep) { const R = RES[d.r]; if ((R.kind === 'strategic' || R.kind === 'luxury') && known(N, d.r) && (r.imp[R.imp] || 0) > 0) acc[d.r] = (acc[d.r] || 0) + 1; }
    }
    N.access = acc;
    N.luxCount = LUXURIES.filter(k => acc[k]).length;
    return acc;
  }
  hasRes(c, k) { return (this.s.nations[c].access?.[k] || 0) > 0; }
  recalcNation(c) {
    const s = this.s, N = s.nations[c];
    const m = N.mods || computeMods(s, N);
    this.computeAccess(N);
    const y = { food: 0, wood: 0, stone: 0, metal: 0, wealth: 0, oil: 0, rp: 0, energy: 0, eCons: 0 };
    let pop = 0, tiles = 0, unrestW = 0;
    for (const i of this.owned.get(c) || []) {
      const r = s.regions[i];
      const o = this.tileYield(r, N);
      for (const k in y) y[k] += o[k];
      pop += r.pop; tiles++; unrestW += r.unrest * r.pop;
    }
    // the modern world's calibration: national power grids and oil fields (modern.js)
    if (N.power) y.energy *= N.power;
    if (N.powerAdd) y.energy += N.powerAdd;
    if (N.oilBase) y.oil += N.oilBase;
    // output in proportion to the real economy; new works raise it with diminishing returns (doubling the raw
    // output adds about a quarter), so economies grow over years rather than weeks
    const rawY = { wealth: y.wealth, metal: y.metal, wood: y.wood, stone: y.stone, rp: y.rp };
    if (N.econ0) for (const k in N.econ0) { const E = N.econ0[k]; y[k] = E.want * Math.pow(Math.max(1e-6, y[k]) / E.raw, 0.32); }
    else if (N.econ) for (const k in N.econ) y[k] *= N.econ[k];
    if (N.aid) y.wealth += N.aid; // foreign aid received
    // tin alloys copper into bronze
    if (N.access.tin && N.access.copper) y.metal *= 1.25;
    if (N.access.phosphate && N.age >= 6) y.food *= 1.1; // fertilizer
    if (N.access.lithium && N.access.cobalt && N.age >= 8) y.energy *= 1.1; // grid batteries
    if (N.access.clay) y.stone *= 1.06; // fired brick
    let upkeep = { wealth: 0, food: 0, oil: 0 }, units = 0, training = 0;
    for (const u of s.units) if (u.nation === c) { const U = UNITS[u.type].upkeep; upkeep.wealth += U.wealth; upkeep.food += U.food; upkeep.oil += U.oil || 0; units++; if (u.train) training += U.wealth * 0.5; }
    upkeep.wealth *= (1 + m.upkeep) * (s.modern ? 0.16 : 1);
    const trade = { food: 0, wood: 0, stone: 0, metal: 0, oil: 0, wealth: 0 };
    for (const t of s.trades) {
      if (t.blockaded) continue;
      const sign = t.from === c ? -1 : t.to === c ? 1 : 0; if (!sign) continue;
      if (!t.good.startsWith('res:')) trade[t.good] += sign * t.amount;
      trade.wealth -= sign * t.amount * t.price * (sign < 0 ? 1 + m.tradeBonus : 1);
    }
    const eF = N.age >= 6 && y.eCons > 0 ? clamp((y.energy + 1) / (y.eCons * (1 + m.energyCons)), 0.2, 1) : 1;
    const wealthIn = y.wealth * (0.4 + 0.6 * eF) * this.sanctionMult(c);
    // rulers with idle treasuries endow scholars
    const endow = N.ai && !s.modern && N.wealth > Math.max(50, wealthIn * 120) ? N.wealth * 0.01 : 0;
    const researchSpend = N.ai && N.saving ? 0 : Math.max(0, wealthIn) * m.researchShare + endow;
    const rp = (y.rp + researchSpend * 1.6) * (1 + m.research) * (0.5 + 0.5 * eF);
    const foodCons = pop * FOOD_PER_K + upkeep.food;
    N.st = { pop, tiles, units, unrestW: pop ? unrestW / pop : 0, eF, rp, researchSpend, training, upkeep, raw: rawY,
      prod: { food: y.food, wood: y.wood, stone: y.stone, metal: y.metal * (0.5 + 0.5 * eF), wealth: wealthIn, oil: y.oil }, energy: y.energy, eCons: y.eCons, foodCons, trade,
      net: { food: y.food + trade.food - foodCons, wood: y.wood + trade.wood, stone: y.stone + trade.stone, metal: y.metal * (0.5 + 0.5 * eF) + trade.metal, wealth: wealthIn - upkeep.wealth - researchSpend - training + trade.wealth, oil: y.oil + trade.oil - upkeep.oil },
      income: wealthIn };
    return N.st;
  }
  storageCap(N, k) {
    const st = N.st, a = ageScale(N.age);
    if (k === 'food') return Math.max(30 * a, (st.foodCons || 0) * 120);
    return 60 * a + Math.max(0, st.prod?.[k] || 0) * 200;
  }

  daily() {
    const s = this.s;
    this.updateTrades();
    for (const N of Object.values(s.nations)) {
      if (!N.alive) continue;
      computeMods(s, N);
      pactMods(this, N);
      budgetMods(N);
      if (s.modern && N.code === s.player) { const h = (N.gov.hist ||= []); h.push(Math.round(N.gov.approval * 100)); if (h.length > 365) h.shift(); }
      const st = this.recalcNation(N.code);
      const m = N.mods;
      for (const k of STOCKS) {
        N[k] = (N[k] || 0) + st.net[k];
        if (k !== 'wealth' && k !== 'food') N[k] = clamp(N[k], 0, this.storageCap(N, k));
      }
      if (s.modern) worldMarket(this, N);
      if (N.food < 0) { N.famine = clamp(-N.food / Math.max(0.1, st.foodCons), 0, 1); N.food = 0; } else N.famine = 0;
      N.food = Math.min(N.food, this.storageCap(N, 'food') * (1 + 0.3 * this.regionsOf(N.code).reduce((a, r) => a + (r.bld.granary || 0), 0) / Math.max(1, st.tiles)));
      if (N.oil < 0) N.oil = 0;
      if (N.wealth < -5 * ageScale(N.age) && N.ai) this.disbandWeakest(N.code);
      N.exhaustion = Math.max(0, N.exhaustion - (this.warsOf(N.code).length ? 0.001 : 0.006));
      const growing = (N.food > st.foodCons * 8 && st.net.food > 0) || N.food > st.foodCons * 30;
      for (const i of this.owned.get(N.code) || []) {
        const r = s.regions[i];
        const cap = this.housing(r, N);
        if (s.modern) { r.pop = Math.min(cap * 1.02, r.pop * (1 + (N.famine ? -0.004 * N.famine : (N.growth ?? 0.005) / 365))); } // modern demography: slow, by the country's real rate
        else if (N.famine) r.pop *= 1 - 0.01 * N.famine;
        else if (growing && r.pop < cap) r.pop += r.pop * 0.012 * (1 + m.popGrowth + 0.15 * (r.bld.granary || 0)) * (1 - r.pop / cap) + 0.01;
        else if (r.pop > cap) r.pop -= (r.pop - cap) * 0.02;
        r.damage = Math.max(0, r.damage - 0.002);
        if (r.build) { r.build.left -= this.buildRate(r, N); if (r.build.left <= 0) this.finishWork(r, N); }
      }
      if (N.famine > 0.15 && Math.random() < 0.08) this.emit('econ', `Famine stalks the lands of the ${this.nm(N.code)}.`, [N.code], { loc: N.capital });
      if (N.age >= 6 && st.eF < 0.6 && Math.random() < 0.06) this.emit('econ', `Blackouts across the ${this.nm(N.code)}: not enough energy.`, [N.code], { loc: N.capital });
      this.production(N, st);
      // training
      for (const u of s.units) {
        if (u.nation !== N.code || !u.train || u.move || (u.air?.phase && u.air.phase !== 'base')) continue;
        const r = s.regions[u.loc]; if (!r || r.sea || r.owner !== N.code) continue;
        const g = u.group && s.groups.find(x => x.id === u.group); const gen = g && s.chars[g.general];
        const gx = gen?.traits.includes('Inspiring') ? 0.6 : 0;
        u.xp = Math.min(100, (u.xp || 0) + 0.7 * (1 + m.xp + gx) * (1 + 0.7 * (r.bld.academy || 0) + 0.2 * (r.bld.barracks || 0)));
        u.hp = Math.min(u.mhp, u.hp + u.mhp * 0.02);
      }
      // heal units at home
      for (const u of s.units) if (u.nation === N.code && !u.fighting && u.hp < u.mhp && s.regions[u.loc]?.owner === N.code) u.hp = Math.min(u.mhp, u.hp + u.mhp * 0.03);
      // armies wintering away from home suffer the cold (never fatal on its own)
      for (const u of s.units) {
        if (u.nation !== N.code || UNITS[u.type].domain !== 'land' || this.mayPass(N.code, s.regions[u.loc]?.owner)) continue;
        const c = cold(this.w.regions[u.loc]?.lat || 0, s.t);
        if (c > 0.35) u.hp = Math.max(u.mhp * 0.25, u.hp - u.mhp * 0.015 * c);
      }
      this.researchDaily(N);
      if (N.ageAdv && --N.ageAdv.left <= 0) this.finishAdvance(N);
      // warheads
      const fac = this.regionsOf(N.code).reduce((a, r) => a + (r.bld.nuclear || 0), 0);
      if (fac >= 2 && N.techs.nuclear_weapons && N.gov.laws.nuclear !== 'disarm') {
        N.warheadProg += fac / 40 * (1 + (m.warheads || 0));
        const c = 20 * ageScale(8);
        if (N.warheadProg >= 1 && N.wealth > c) { N.warheadProg -= 1; N.wealth -= c; N.warheads++; if (N.code === s.player) this.emit('build', 'A new nuclear warhead has entered the arsenal.', [N.code]); }
      }
      validateLaws(this, N);
      politicsDaily(this, N);
    }
    // claims in progress
    for (const r of s.regions) if (r.claim) {
      const N = s.nations[r.claim.by];
      if (!N?.alive || r.owner) { r.claim = null; continue; }
      if (--r.claim.left <= 0) this.completeClaim(r);
    }
    pressureDaily(this);
    societyDaily(this);
    crisesDaily(this);
    pactsDaily(this);
    // native peoples grow slowly
    if (s.t % (24 * 5) === 0) for (const i of this.landIdx) { const r = s.regions[i]; if (!r.owner) { const cap = 2.2 * this.T[i].hab * (this.T[i].river ? 1.4 : 1); r.natives = Math.min(cap, (r.natives || 0) + 0.02 * cap); } }
    this.emergence();
    this.updateContacts();
    this.calendar();
    this.formablesDaily();
    // player narrative events
    const P = s.nations[s.player];
    if (P.alive && !s.pendingEvent && s.t >= s.nextEventAt) {
      s.nextEventAt = s.t + Math.round(s.modern ? rnd(7, 14) : rnd(16, 34)) * 24;
      const ev = rollEvent(this, P);
      if (ev) { s.pendingEvent = ev; for (const f of this.listeners) f({ kind: 'rp', ev }); }
    }
    if (P.alive && (!P.gov.candidatesAt || s.t - P.gov.candidatesAt > 24 * 60)) refreshCandidates(s, P);
    this.tributeDaily();
    this.updatePrices();
    if (s.t % (24 * 7) === 0) this.snapshot();
    this.checkVictory();
  }
  calendar() {
    const s = this.s;
    if (s.modern) { s.year = START_YEAR + s.t / 24 / 365; return; } // one day is a day
    let L = 0, lead = null;
    for (const N of Object.values(s.nations)) if (N.alive && N.age >= L) { if (N.age > L || !lead || ageProgress(N) > ageProgress(lead)) lead = N; L = N.age; }
    if (!lead) return;
    const A = AGES[L], ypd = YEARS_PER_DAY[L];
    const target = A.from + (A.to - A.from) * Math.min(1, ageProgress(lead) / 0.9);
    const k = clamp(0.5 + (target - s.year) / (ypd * 25), 0.2, 3);
    s.year = Math.min(L < NAGES - 1 ? A.to - 1 : 1e9, s.year + ypd * k);
    if (s.year < A.from) s.year = A.from;
  }
  updatePrices() {
    const s = this.s;
    for (const g of GOODS) {
      let sup = 0, dem = 0;
      for (const N of Object.values(s.nations)) { if (!N.alive) continue; const v = N.st.net?.[g] || 0; if (v > 0) sup += v; else dem -= v; }
      s.prices[g] = clamp(BASE_PRICE[g] * Math.pow((dem + 1) / (sup + 1), 0.4), BASE_PRICE[g] * 0.4, BASE_PRICE[g] * 4);
    }
  }
  // who knows whom: neighbours within two steps (including across a sea zone) and units in foreign lands
  updateContacts() {
    const s = this.s, w = this.w;
    const add = (a, b) => { if (!a || !b || a === b) return; const A = s.nations[a], B = s.nations[b]; if (!A || !B) return; if (!A.known.includes(b)) { A.known.push(b); if (a === s.player) this.emit('contact', `First contact: we have met the ${this.full(b)}.`, [a, b], { loc: B.capital }); } if (!B.known.includes(a)) { B.known.push(a); if (b === s.player) this.emit('contact', `First contact: we have met the ${this.full(a)}.`, [b, a], { loc: A.capital }); } };
    for (const N of Object.values(s.nations)) {
      if (!N.alive) continue;
      for (const i of this.owned.get(N.code) || []) for (const j of w.adj[i]) {
        const o = s.regions[j].owner; if (o && o !== N.code) add(N.code, o);
        if (w.regions[j].sea && N.techs.sailing) for (const k of w.adj[j]) { const o2 = s.regions[k].owner; if (o2 && o2 !== N.code) add(N.code, o2); }
        else if (!w.regions[j].sea) for (const k of w.adj[j]) { const o2 = s.regions[k].owner; if (o2 && o2 !== N.code) add(N.code, o2); }
      }
    }
    for (const u of s.units) { const o = s.regions[u.loc]?.owner; if (o && o !== u.nation) add(u.nation, o); }
  }
  formablesDaily() {
    if (this.s.modern) return; // the real countries already exist
    const s = this.s;
    if (s.t % (24 * 3)) return;
    for (const N of Object.values(s.nations)) {
      if (!N.alive) continue;
      N.formReady = [];
      const have = new Set(); for (const i of this.owned.get(N.code) || []) have.add(this.T[i].country);
      for (const F of this.formables) {
        if (F.minAge > N.age || s.formed[F.id]) continue;
        if (!F.sets.some(set => set.countries && set.countries.some(c => have.has(c)))) continue; // holds none of the lands it needs
        const p = formProgress(this, N, F);
        if (p.ok) { if (N.ai) { if (!F.modern || this.owned.get(N.code).size < 40) this.form(N.code, F.id); } else N.formReady.push(F.id); }
      }
    }
  }
  form(c, id) {
    const s = this.s, N = s.nations[c], F = this.formables.find(x => x.id === id);
    if (!F || !formProgress(this, N, F).ok) return { ok: false, why: 'Requirements not met.' };
    s.formed[id] = c;
    N.formed = { id, title: F.title, fx: F.fx, maxAge: F.maxAge };
    N.name = F.name.replace(/^the /, ''); N.adj = F.adj;
    N.gov.pc += 60; N.gov.stability = clamp(N.gov.stability + 0.1, 0, 1);
    computeMods(s, N);
    this.emit('formed', `The ${F.title} is proclaimed! ${F.desc}`, [c], { loc: N.capital, major: true });
    return { ok: true };
  }

  // ---------------------------------------------------------------- research
  // knowledge spreads: technologies known to civilizations you have met are cheaper; laggards catch up
  techCostFor(N, id) {
    const s = this.s, kn = (N.known || []).filter(c => s.nations[c]?.alive);
    const share = kn.length ? kn.filter(c => s.nations[c].techs[id]).length / Math.max(3, kn.length) : 0;
    let lead = 0; for (const x of Object.values(s.nations)) if (x.alive && x.age > lead) lead = x.age;
    const behind = Math.max(0, lead - N.age - 1);
    return Math.round(TECH[id].cost * (1 - 0.4 * share) / (1 + 0.3 * behind));
  }
  researchDaily(N) {
    const R = N.research;
    if (!R.cur || N.techs[R.cur] || TECH[R.cur]?.age > N.age) {
      R.cur = null;
      while (R.queue.length && !R.cur) { const id = R.queue.shift(); if (!N.techs[id] && TECH[id].age <= N.age && TECH[id].req.every(q => N.techs[q])) R.cur = id; }
      if (!R.cur && (N.ai || N.directives.science !== 'off')) R.cur = pickTech(N, N.ai ? null : N.directives.science);
    }
    R.prog += N.st.rp;
    const cost = R.cur ? this.techCostFor(N, R.cur) : Infinity;
    if (R.cur && R.prog >= cost) {
      R.prog -= cost;
      N.techs[R.cur] = 1;
      if (N.code === this.s.player) this.emit('tech', `Discovery: ${TECH[R.cur].name}. ${TECH[R.cur].desc}`, [N.code]);
      R.cur = null;
      computeMods(this.s, N);
    }
    if (!R.cur) R.prog = Math.min(R.prog, TECH[TECHS.find(x => x.age === N.age).id].cost * 2);
  }

  // ---------------------------------------------------------------- military production
  // production lines at a tile for a domain
  lines(r, domain) {
    if (domain === 'sea') return r.bld.harbor || 0;
    if (domain === 'air') return r.bld.airfield || 0;
    return r.lvl >= 1 ? 1 + (r.bld.barracks || 0) : 0;
  }
  siteRate(c, r) { const N = this.s.nations[c]; return (0.6 + 0.12 * r.lvl + 0.15 * (r.bld.workshop || 0)) * (0.4 + 0.6 * (N.st.eF ?? 1)) * (1 + (N.mods?.prod || 0)); }
  sitesFor(c, type) { const D = UNITS[type].domain; return this.regionsOf(c).filter(r => this.lines(r, D) > 0 && (D !== 'sea' || this.seaNear(r.i) >= 0)); }
  siteBacklog(c, r, domain) {
    const N = this.s.nations[c];
    const work = N.queue.filter(q => q.region === r.i && UNITS[q.type].domain === domain).reduce((a, q) => a + q.left, 0);
    return work / Math.max(1, this.lines(r, domain)) / this.siteRate(c, r);
  }
  canField(c, type) {
    const N = this.s.nations[c], T = UNITS[type];
    if (!T) return { ok: false, why: 'Unknown unit.' };
    if (T.age > N.age) return { ok: false, why: `Requires the ${AGES[T.age].name}.` };
    if (T.tech && !N.techs[T.tech]) return { ok: false, why: `Requires ${TECH[T.tech].name}.` };
    for (const k of T.needs) if (!this.hasRes(c, k)) return { ok: false, why: `Requires ${RES[k].name}: work a deposit or import it.`, res: k };
    return { ok: true };
  }
  bestFieldable(c, line) {
    const N = this.s.nations[c], L = LINES[line];
    let main = null;
    for (let k = L.tiers.length - 1; k >= 0; k--) { const id = line + L.tiers[k][0]; if (UNITS[id].age <= N.age && this.canField(c, id).ok) { main = id; break; } }
    // a regional alternative (elephants, camels, obsidian) wins when it is at least as modern and stronger
    let best = main, bs = main ? UNITS[main].atk + UNITS[main].def : 0;
    for (const [id, l, age] of VARIANTS) if (l === line && age <= N.age && (!main || age >= UNITS[main].age) && this.canField(c, id).ok) { const v = UNITS[id].atk + UNITS[id].def; if (v > bs) { best = id; bs = v; } }
    return best;
  }
  unitCost(c, type) { const N = this.s.nations[c]; return scaleCost(UNITS[type].cost, 1 + (N.mods?.buildCost || 0) * 0.5); }
  orderUnits(c, type, count, opts = {}) {
    const T = UNITS[type], N = this.s.nations[c];
    const f = this.canField(c, type); if (!f.ok) return { ok: false, why: f.why };
    let sites = this.sitesFor(c, type);
    if (opts.region !== undefined && opts.region !== null) sites = sites.filter(r => r.i === opts.region);
    if (!sites.length) return { ok: false, why: T.domain === 'sea' ? 'You need a harbor to build ships.' : T.domain === 'air' ? 'You need an airfield.' : 'You need a settlement.' };
    const load = new Map(sites.map(r => [r.i, this.siteBacklog(c, r, T.domain)]));
    const per = {}; let eta = 0;
    for (let k = 0; k < count; k++) {
      let best = null, bt = Infinity;
      for (const r of sites) {
        let tt = load.get(r.i) + T.days / this.lines(r, T.domain) / this.siteRate(c, r);
        if (opts.near !== undefined && opts.near !== null) tt += kmBetween(this.anchor(r.i), this.anchor(opts.near)) / 600;
        if (tt < bt) { bt = tt; best = r; }
      }
      load.set(best.i, load.get(best.i) + T.days / this.lines(best, T.domain) / this.siteRate(c, best));
      eta = Math.max(eta, load.get(best.i));
      N.queue.push({ type, region: best.i, left: T.days, total: T.days, group: opts.group ?? null, rally: opts.rally ?? null, paid: false, status: 'queued' });
      per[best.i] = (per[best.i] || 0) + 1;
    }
    const cost = scaleCost(this.unitCost(c, type), count);
    return { ok: true, per, eta: Math.ceil(eta), cost, pop: +(T.pop * count).toFixed(1) };
  }
  cancelOrder(c, q) {
    const N = this.s.nations[c]; const k = N.queue.indexOf(q); if (k < 0) return;
    N.queue.splice(k, 1);
    if (q.paid) { for (const [r, v] of Object.entries(q.paidCost || {})) N[r] += v * 0.75; const reg = this.s.regions[q.region]; if (reg.owner === c) reg.pop += UNITS[q.type].pop; }
  }
  production(N, st) {
    const s = this.s, lineUse = {};
    for (const q of N.queue) {
      const r = s.regions[q.region], T = UNITS[q.type];
      if (r.owner !== N.code) { q.dead = true; continue; }
      const key = q.region + T.domain;
      lineUse[key] ||= 0;
      if (lineUse[key] >= this.lines(r, T.domain)) { q.status = 'queued'; continue; }
      lineUse[key]++;
      if (!q.paid) {
        const f = this.canField(N.code, q.type);
        if (!f.ok) { q.status = 'resource'; continue; }
        const cost = this.unitCost(N.code, q.type);
        if (Object.entries(cost).some(([k, v]) => (N[k] || 0) < v)) { q.status = 'funds'; continue; }
        if (r.pop < T.pop + 0.4) { q.status = 'manpower'; continue; }
        for (const [k, v] of Object.entries(cost)) N[k] -= v;
        r.pop -= T.pop * Math.max(0.4, 1 - 0.3 * (N.mods.manpower || 0));
        q.paid = true; q.paidCost = cost;
      }
      q.status = 'building';
      q.left -= this.siteRate(N.code, r);
    }
    N.queue = N.queue.filter(q => !q.dead);
    const done = N.queue.filter(q => q.left <= 0);
    N.queue = N.queue.filter(q => q.left > 0);
    for (const q of done) {
      const T = UNITS[q.type];
      let loc = q.region;
      if (T.domain === 'sea') loc = this.seaNear(q.region);
      if (loc < 0) continue;
      const u = this.spawn(N.code, q.type, loc);
      if (q.group) { const g = s.groups.find(x => x.id === q.group); if (g) { g.units.push(u.id); u.group = g.id; } }
      if (q.rally !== undefined && q.rally !== null) {
        let dest = q.rally;
        if (T.domain === 'sea' && !this.w.regions[dest].sea) dest = this.seaNear(dest);
        if (dest >= 0 && dest !== u.loc) this.order([u.id], dest);
      }
      if (N.code === s.player) this.emit('build', `${T.name} raised at ${this.w.regions[q.region].name}.`, [N.code], { loc });
    }
  }
  // refit old units to the best of their line
  upgradeCost(c, u) {
    const N = this.s.nations[c], T = UNITS[u.type], best = bestOf(N, T.line);
    if (!best || best === u.type || UNITS[best].age <= T.age) return null;
    const a = this.unitCost(c, best), b = this.unitCost(c, u.type), cost = {};
    for (const [k, v] of Object.entries(a)) cost[k] = Math.max(0, Math.round((v - (b[k] || 0) * 0.5) * 10) / 10);
    return { to: best, cost };
  }
  upgrade(c, ids) {
    const N = this.s.nations[c]; let n = 0, why = '';
    for (const id of ids) {
      const u = this.unitById.get(id); if (!u || u.nation !== c) continue;
      const r = this.s.regions[u.loc];
      if (!r || r.sea || r.owner !== c) { why = 'Units must be in your own territory to refit.'; continue; }
      const up = this.upgradeCost(c, u); if (!up) continue;
      const f = this.canField(c, up.to); if (!f.ok) { why = f.why; continue; }
      if (Object.entries(up.cost).some(([k, v]) => (N[k] || 0) < v)) { why = 'Not enough resources.'; break; }
      for (const [k, v] of Object.entries(up.cost)) N[k] -= v;
      const frac = u.hp / u.mhp; u.type = up.to; u.mhp = UNITS[up.to].hp; u.hp = u.mhp * frac; n++;
      if (UNITS[up.to].domain === 'air' && !u.air) u.air = { phase: 'base', cd: 0 };
    }
    return { ok: n > 0, n, why };
  }

  // ---------------------------------------------------------------- trade
  sanctioned(a, b) { return this.s.sanctions.some(x => (x.by === a && x.on === b) || (x.by === b && x.on === a)); }
  tradePath(a, b) {
    const w = this.w, s = this.s;
    const A = s.nations[a], B = s.nations[b];
    const boats = A.techs.sailing && B.techs.sailing, ocean = A.techs.navigation && B.techs.navigation;
    return w.path(A.capital, B.capital, j => {
      const R = w.regions[j];
      if (R.sea) return boats && (!R.deep || ocean);
      const o = s.regions[j].owner;
      return !o || !(this.atWar(o, a) || this.atWar(o, b));
    }, (i, j, km) => km * (w.regions[j].sea ? 0.5 : 1.3));
  }
  addTrade(from, to, good, amount, price) {
    const s = this.s;
    if (this.sanctioned(from, to)) return null;
    const path = this.tradePath(from, to);
    if (!path) return null;
    const ex = s.trades.find(t => t.from === from && t.to === to && t.good === good);
    if (ex) { ex.amount = amount; ex.price = price; return ex; }
    const t = { id: s.tid++, from, to, good, amount, price, path, blockaded: false, since: s.t };
    s.trades.push(t);
    this.addOpinion(from, to, 6); this.addOpinion(to, from, 6);
    return t;
  }
  cancelTrade(id) { this.s.trades = this.s.trades.filter(t => t.id !== id); }
  // a ruler tears up a deal: the partner is told and resents it
  endTrade(by, id) {
    const t = this.s.trades.find(x => x.id === id); if (!t) return;
    const other = t.from === by ? t.to : t.from;
    this.cancelTrade(id); this.addOpinion(other, by, -6);
    this.message(by, other, `We are ending our agreement on ${this.goodName(t.good)}.`).unread = false;
  }
  goodName(g) { return g.startsWith('res:') ? RES[g.slice(4)].name + ' access' : g; }
  lapse(t, why) { this.cancelTrade(t.id); if (t.from === this.s.player || t.to === this.s.player) this.emit('trade', `Trade deal ended: ${this.goodName(t.good)} between the ${this.nm(t.from)} and the ${this.nm(t.to)}. ${why}`, [t.from, t.to]); }
  updateTrades() {
    const s = this.s, w = this.w;
    const navyAt = new Map();
    for (const u of s.units) if (UNITS[u.type].domain === 'sea' && UNITS[u.type].atk > 0) { if (!navyAt.has(u.loc)) navyAt.set(u.loc, new Set()); navyAt.get(u.loc).add(u.nation); }
    for (const t of [...s.trades]) {
      if (!s.nations[t.from].alive || !s.nations[t.to].alive || this.atWar(t.from, t.to) || this.sanctioned(t.from, t.to)) { this.cancelTrade(t.id); continue; }
      const was = t.blockaded;
      t.blockaded = false; t.by = null;
      for (const j of t.path) {
        const ns = navyAt.get(j); if (!ns) continue;
        for (const n of ns) if (this.atWar(n, t.from) || this.atWar(n, t.to)) { t.blockaded = true; t.by = n; t.at = j; break; }
        if (t.blockaded) break;
      }
      if (t.blockaded && !was) this.emit('trade', `${this.nm(t.by)} warships are blockading trade between the ${this.nm(t.from)} and the ${this.nm(t.to)} in the ${w.regions[t.at].name}.`, [t.by, t.from, t.to], { loc: t.at });
      const ex = s.nations[t.from];
      if (t.good.startsWith('res:')) { const k = t.good.slice(4); const own = this.regionsOf(t.from).some(r => r.dep.some(d => d.r === k && (r.imp[RES[k].imp] || 0) > 0)); if (!own) this.lapse(t, `The ${this.nm(t.from)} no longer work any ${RES[k].name}.`); continue; }
      if ((ex[t.good] || 0) < t.amount * 3 && (ex.st.net?.[t.good] || 0) < 0) t.amount = Math.max(0, t.amount * 0.8);
      if (t.amount < 0.05) this.lapse(t, `The ${this.nm(t.from)} ran out of ${t.good} to send.`);
    }
  }

  // ---------------------------------------------------------------- diplomacy
  // wars and alliances by nation, rebuilt only when a relation changes
  relIndex() {
    if (this._rx && this._rxRel === this.s.rel) return this._rx;
    const ix = new Map(), get = c => { let e = ix.get(c); if (!e) ix.set(c, e = { war: [], alliance: [] }); return e; };
    for (const k in this.s.rel) { const v = this.s.rel[k]; if (v !== 'war' && v !== 'alliance') continue; const [a, b] = k.split('|'); get(a)[v].push(b); get(b)[v].push(a); }
    this._rx = ix; this._rxRel = this.s.rel;
    return ix;
  }
  warsOf(c) { return [...(this.relIndex().get(c)?.war || [])]; }
  alliesOf(c) { return [...(this.relIndex().get(c)?.alliance || [])]; }
  declareWar(a, b, quiet = false) {
    if (this.atWar(a, b) || a === b) return;
    const prev = this.rel(a, b);
    this.setRel(a, b, 'war');
    this.addOpinion(b, a, -60);
    if (!quiet) { addInfamy(this, a, 1); earn(this, a, 'warmonger', 6); } // wars of choice are remembered
    for (const c of this.s.nations[b].known || []) if (c !== a && c !== b) this.addOpinion(c, a, prev === 'alliance' || prev === 'nap' ? -20 : -5);
    this.s.trades = this.s.trades.filter(t => !((t.from === a && t.to === b) || (t.from === b && t.to === a)));
    if (!quiet) this.emit('war', `The ${this.nm(a)} declare war on the ${this.nm(b)}${prev === 'nap' || prev === 'alliance' ? ', breaking their treaty' : ''}.`, [a, b], { loc: this.s.nations[b].capital });
    const callers = new Set([...this.alliesOf(b), ...this.s.guarantees.filter(g => g.of === b).map(g => g.by)]);
    for (const ally of callers) {
      if (ally === a || !this.s.nations[ally]?.alive || this.atWar(ally, a) || this.rel(ally, a) === 'alliance') continue;
      if (ally === this.s.player) { this.message(b, ally, `We are under attack by the ${this.nm(a)}. We call on you to honour your oath and join the war.`, { type: 'callToArms', against: a }); continue; }
      const guar = this.s.guarantees.some(g => g.by === ally && g.of === b);
      const bound = this.s.nations[ally].overlord === b ? 1.5 : this.s.nations[b].overlord === ally ? 0.9 : 0;
      if (Math.random() < (bound || (guar ? 0.75 : this.s.nations[ally].traits.loyalty * 0.8)) + this.opinion(ally, b) / 300) {
        this.setRel(ally, a, 'war'); this.addOpinion(a, ally, -40);
        this.emit('war', `The ${this.nm(ally)} ${bound > 1 ? 'answer their overlord\'s call' : bound ? 'defend their vassal' : guar ? 'honour their guarantee' : 'honour their alliance'} and declare war on the ${this.nm(a)}.`, [ally, a], { loc: this.s.nations[a].capital });
        earn(this, ally, 'steadfast', 8);
      } else if (!bound) earn(this, ally, 'oathbreaker', 6); // left a friend to fight alone
    }
    // an overlord's vassals march with it
    for (const v of this.vassalsOf(a)) {
      if (v === b || this.atWar(v, b) || this.s.nations[b].overlord === v) continue;
      if (v === this.s.player) { this.message(a, v, `Our liege commands: join our war against the ${this.nm(b)}.`, { type: 'callToArms', against: b }); continue; }
      this.setRel(v, b, 'war');
      this.emit('war', `The ${this.nm(v)} follow their overlord into war against the ${this.nm(b)}.`, [v, b], { loc: this.s.nations[b].capital });
    }
    onWar(this, a, b, prev); // reputation, and the pacts: peace among members, an attack on one is an attack on all
  }
  makePeace(a, b, quiet = false) {
    this.setRel(a, b, 'peace');
    if (!quiet) this.emit('peace', `The ${this.nm(a)} and the ${this.nm(b)} make peace.`, [a, b], { loc: this.s.nations[b].capital });
    // peace binds their vassals too
    for (const [x, y] of [[a, b], [b, a]]) for (const v of this.vassalsOf(x)) if (this.atWar(v, y)) this.setRel(v, y, 'peace');
    for (const u of [...this.s.units]) {
      if (UNITS[u.type].domain !== 'land') continue;
      const o = this.s.regions[u.loc].owner;
      if ((u.nation === a && o === b) || (u.nation === b && o === a)) { const p = this.planPath([u], this.s.nations[u.nation].capital); if (p.path) u.move = { path: p.path, seg: 0, prog: 0 }; else this.removeUnit(u); }
    }
  }
  // ---------------------------------------------------------------- vassals
  // an overlord's strength counts its vassals' armies
  realmPower(c) { let p = this.power(c); for (const v of this.vassalsOf(c)) p += this.power(v) * 0.6; return p; }
  // who serves whom, rebuilt at most once per game hour (or when vassalage changes)
  vassalsOf(c) {
    if (!this._vmap || this._vt !== this.s.t) {
      this._vmap = new Map(); this._vt = this.s.t;
      for (const N of Object.values(this.s.nations)) if (N.alive && N.overlord) { if (!this._vmap.has(N.overlord)) this._vmap.set(N.overlord, []); this._vmap.get(N.overlord).push(N.code); }
    }
    return this._vmap.get(c) || [];
  }
  // map colour: a vassal is painted in the colour of the empire it belongs to; the border line between them still shows
  borderCol(c) { return this.dispCol(c); }
  // the top of a chain of overlords: the empire a people ultimately belongs to
  realmOf(c) { let x = c; for (let k = 0; k < 6; k++) { const o = this.s.nations[x]?.overlord; if (!o || !this.s.nations[o]?.alive) break; x = o; } return x; }
  dispCol(c) { const N = this.s.nations[c]; if (!N) return '#888888'; return this.s.nations[this.realmOf(c)]?.color || N.color; }
  makeVassal(v, o, how = 'treaty') {
    this._vmap = null;
    const s = this.s, V = s.nations[v], O = s.nations[o];
    if (!V?.alive || !O?.alive || v === o || V.overlord === o) return { ok: false, why: 'Not possible.' };
    if (O.overlord === v) O.overlord = null;
    if (this.atWar(v, o)) this.makePeace(v, o, true);
    for (const x of this.vassalsOf(v)) s.nations[x].overlord = o; // their subjects pass to the new overlord
    V.overlord = o; V.tribute ??= 0.25; V.vassalSince = s.t; this._vmap = null;
    this.setOpinion(v, o, Math.max(this.opinion(v, o), -15)); // submission settles the old grudge, for now
    this.setRel(v, o, 'alliance');
    if (!V.known.includes(o)) V.known.push(o); if (!O.known.includes(v)) O.known.push(v);
    for (const e of this.warsOf(v)) if (this.friendly(o, e) || s.nations[e]?.overlord === o) this.makePeace(v, e, true);
    for (const e of this.warsOf(o)) if (e !== v && !this.atWar(v, e)) this.setRel(v, e, 'war');
    this.emit('vassal', how === 'war' ? `The ${this.nm(v)} sue for peace and submit as vassals of the ${this.nm(o)}.` : `The ${this.nm(v)} swear fealty to the ${this.nm(o)} and become their vassals.`, [v, o], { loc: V.capital, major: true });
    return { ok: true };
  }
  releaseVassal(o, v) {
    this._vmap = null;
    const V = this.s.nations[v]; if (!V || V.overlord !== o) return { ok: false, why: 'Not your vassal.' };
    V.overlord = null; this._vmap = null; this.setRel(v, o, 'peace'); this.addOpinion(v, o, 30);
    this.emit('vassal', `The ${this.nm(o)} release the ${this.nm(v)} from vassalage.`, [o, v], { loc: V.capital });
    return { ok: true };
  }
  declareIndependence(v) {
    this._vmap = null;
    const V = this.s.nations[v], o = V?.overlord; if (!o) return { ok: false, why: 'You serve no overlord.' };
    V.overlord = null; this._vmap = null; this.setRel(v, o, 'peace');
    this.emit('vassal', `The ${this.nm(v)} declare independence from the ${this.nm(o)}!`, [v, o], { loc: V.capital, major: true });
    this.declareWar(v, o, true);
    this.addOpinion(o, v, -40);
    return { ok: true };
  }
  integrateCost(o, v) { return Math.round(25 + (this.owned.get(v)?.size || 0) * 8); }
  canIntegrate(o, v) {
    const s = this.s, V = s.nations[v], O = s.nations[o];
    if (!V || V.overlord !== o) return { ok: false, why: 'Not your vassal.' };
    const held = Math.floor((s.t - (V.vassalSince || 0)) / 24);
    if (held < 60) return { ok: false, why: `They must be your vassal for 60 days first (${held} so far).` };
    if (this.opinion(v, o) < -10) return { ok: false, why: 'They resent you too much. Raise their opinion of you first.' };
    const cost = this.integrateCost(o, v);
    if (O.gov.pc < cost) return { ok: false, why: `Needs ${cost} influence.`, cost };
    return { ok: true, cost };
  }
  integrateVassal(o, v) {
    this._vmap = null;
    const chk = this.canIntegrate(o, v); if (!chk.ok) return chk;
    const s = this.s, V = s.nations[v], O = s.nations[o];
    O.gov.pc -= chk.cost;
    for (const i of [...(this.owned.get(v) || [])]) { const r = s.regions[i]; r.owner = r.core = o; r.claim = null; r.capture = null; this.owned.get(v).delete(i); this.owned.get(o).add(i); }
    for (const u of s.units) if (u.nation === v) { u.nation = o; u.group = null; }
    for (const k of STOCKS) O[k] = (O[k] || 0) + Math.max(0, V[k] || 0);
    s.trades = s.trades.filter(t => t.from !== v && t.to !== v);
    for (const k of Object.keys(s.rel)) if (k.split('|').includes(v)) delete s.rel[k];
    this._rx = null;
    V.alive = false; V.overlord = null; V.queue = []; this._vmap = null;
    this.emit('vassal', `The ${this.nm(v)} are fully integrated into the ${this.full(o)}.`, [o, v], { loc: V.capital, major: true });
    return { ok: true };
  }
  // vassals pay a share of what they produce (and of their food surplus) every day
  tributeDaily() {
    this._vmap = null;
    const s = this.s;
    for (const N of Object.values(s.nations)) if (N.alive) { N.tribIn = {}; if (!N.overlord) N.tribOut = null; }
    for (const V of Object.values(s.nations)) {
      if (!V.alive || !V.overlord) continue;
      const O = s.nations[V.overlord];
      if (!O?.alive) { V.overlord = null; this._vmap = null; continue; }
      if ((V.tribReliefUntil || 0) > s.t) { V.tribOut = {}; continue; }
      const r = V.tribute ?? 0.25, out = {};
      for (const k of STOCKS) {
        const base = k === 'food' ? Math.max(0, V.st.net?.food || 0) * 1.5 : Math.max(0, V.st.prod?.[k] || 0);
        const paid = Math.min(base * r, Math.max(0, V[k] || 0));
        if (paid <= 0.0005) continue;
        V[k] -= paid; O[k] = (O[k] || 0) + paid; out[k] = paid; O.tribIn[k] = (O.tribIn[k] || 0) + paid;
      }
      V.tribOut = out;
      this.addOpinion(V.code, O.code, r >= 0.4 ? -0.12 : r <= 0.1 ? 0.06 : -0.02);
      V.gov.approval = clamp(V.gov.approval - r * 0.002, 0, 1);
    }
  }
  message(from, to, text, proposal = null) {
    if (this.s.modern) text = fixArticles(this, text);
    const m = { id: this.s.mid++, t: this.s.t, y: this.s.year, from, to, text, proposal, status: proposal ? 'pending' : null, unread: true };
    this.s.messages.push(m); if (this.s.messages.length > 400) this.s.messages.shift();
    if (to === this.s.player) for (const f of this.listeners) f({ kind: 'message', msg: m });
    return m;
  }
  guarantee(by, of) {
    if (this.s.guarantees.some(g => g.by === by && g.of === of)) return { ok: false, why: 'Already guaranteed.' };
    this.s.guarantees.push({ by, of }); this.addOpinion(of, by, 20); earn(this, by, 'steadfast', 3); earn(this, by, 'peacemaker', 3);
    this.emit('treaty', `The ${this.nm(by)} guarantee the independence of the ${this.nm(of)}.`, [by, of]);
    return { ok: true };
  }
  gift(by, to, good, amount) {
    const A = this.s.nations[by]; if ((A[good] || 0) < amount) return { ok: false, why: `Not enough ${good}.` };
    A[good] -= amount; this.s.nations[to][good] = (this.s.nations[to][good] || 0) + amount;
    const value = amount * (this.s.prices[good] || 1) / Math.max(0.5, ageScale(A.age));
    this.addOpinion(to, by, Math.min(25, value * 1.5));
    if (this.warsOf(to).length && good === 'wealth') this.s.nations[to].exhaustion = Math.max(0, this.s.nations[to].exhaustion - value / 400);
    this.emit('treaty', `The ${this.nm(by)} send ${Math.round(amount)} ${good} to the ${this.nm(to)}.`, [by, to]);
    return { ok: true };
  }
  mediate(by, a, b, bonus = 0) {
    const s = this.s, A = s.nations[a], B = s.nations[b], m = s.nations[by].mods;
    const p = clamp(0.2 + (this.opinion(a, by) + this.opinion(b, by)) / 400 + (A.exhaustion + B.exhaustion) * 0.6 + (m.diplo || 0) * 0.5 + bonus, 0.05, 0.9);
    if (Math.random() < p) { this.makePeace(a, b); this.addOpinion(a, by, 10); this.addOpinion(b, by, 10); earn(this, by, 'peacemaker', 12); return { ok: true, why: `Talks succeed. The ${this.nm(a)} and the ${this.nm(b)} make peace.` }; }
    this.addOpinion(a, by, -2); this.addOpinion(b, by, -2);
    return { ok: false, why: 'Talks collapse. Neither side is ready to stop fighting.' };
  }
  sanction(by, on, lift = false) {
    const s = this.s;
    if (lift) { s.sanctions = s.sanctions.filter(x => !(x.by === by && x.on === on)); this.addOpinion(on, by, 10); this.emit('treaty', `The ${this.nm(by)} lift their embargo on the ${this.nm(on)}.`, [by, on]); return { ok: true }; }
    if (s.sanctions.some(x => x.by === by && x.on === on)) return { ok: false, why: 'Already under embargo.' };
    s.sanctions.push({ by, on }); this.addOpinion(on, by, -30);
    s.trades = s.trades.filter(t => !((t.from === by && t.to === on) || (t.from === on && t.to === by)));
    this.emit('treaty', `The ${this.nm(by)} impose a trade embargo on the ${this.nm(on)}.`, [by, on]);
    return { ok: true };
  }
  power(c) { let p = 0; for (const u of this.s.units) if (u.nation === c) p += this.strength(u); return p; }
  demand(by, from, i) {
    const s = this.s, r = s.regions[i];
    if (r.owner !== from) return { ok: false, why: 'They do not hold that land.' };
    if (s.nations[from].capital === i) return { ok: false, why: 'No ruler will surrender their capital.' };
    const ratio = this.power(by) / (this.power(from) + 1);
    const t = s.nations[from].traits;
    const p = clamp((ratio - 2.5) / 4 + t.caution * 0.2 - t.aggression * 0.2, 0, 0.85);
    earn(this, by, 'tyrant', 4);
    if (Math.random() < p) { this.transfer(r, by, true); this.addOpinion(from, by, -45); earn(this, by, 'tyrant', 4); return { ok: true, why: `The ${this.nm(from)} yield ${this.w.regions[i].name} under pressure.` }; }
    this.addOpinion(from, by, -20);
    return { ok: false, why: `The ${this.nm(from)} reject the ultimatum.` };
  }
  tribute(by, from, good, amount) {
    const s = this.s, F = s.nations[from];
    const ratio = this.power(by) / (this.power(from) + 1);
    const p = clamp((ratio - 1.8) / 3 + F.traits.caution * 0.25 - F.traits.aggression * 0.2 - this.opinion(from, by) / -300, 0, 0.9);
    if ((F[good] || 0) < amount) return { ok: false, why: `They do not have ${Math.round(amount)} ${good}.` };
    if (Math.random() < p) { F[good] -= amount; s.nations[by][good] += amount; this.addOpinion(from, by, -25); earn(this, by, 'tyrant', 5); this.emit('treaty', `The ${this.nm(from)} pay tribute of ${Math.round(amount)} ${good} to the ${this.nm(by)}.`, [by, from]); return { ok: true, why: `The ${this.nm(from)} pay the tribute.` }; }
    this.addOpinion(from, by, -12);
    return { ok: false, why: `The ${this.nm(from)} refuse to pay.` };
  }
  shareTech(by, to, id) {
    const T = this.s.nations[to]; if (T.techs[id]) return { ok: false, why: 'They already know it.' };
    if (!TECH[id].req.every(q => T.techs[q]) || TECH[id].age > T.age) return { ok: false, why: 'They are not ready for it.' };
    T.techs[id] = 1; computeMods(this.s, T); this.addOpinion(to, by, 15); earn(this, by, 'scholar', 6);
    this.emit('treaty', `The ${this.nm(by)} share the secrets of ${TECH[id].name} with the ${this.nm(to)}.`, [by, to]);
    return { ok: true };
  }

  // ---------------------------------------------------------------- covert operations
  covertCost(by, op) { const a = ageScale(this.s.nations[by].age); return Math.round({ steal: 6, sabotage: 8, unrest: 5, cyber: 10, insurgents: 7 }[op] * a); }
  covert(by, target, op) {
    const s = this.s, A = s.nations[by], B = s.nations[target];
    if (op === 'cyber' && !A.techs.cyber_warfare) return { ok: false, why: 'Requires Cyber Warfare.' };
    if (A.age < 1) return { ok: false, why: 'Espionage needs at least the Bronze Age.' };
    const ck = target + ':' + op;
    if ((A.opCooldown[ck] || 0) > s.t) return { ok: false, why: `Agents are lying low for ${Math.ceil((A.opCooldown[ck] - s.t) / 24)} more days.` };
    const cost = this.covertCost(by, op);
    if (A.wealth < cost) return { ok: false, why: `Needs ${cost} wealth.` };
    A.wealth -= cost; A.opCooldown[ck] = s.t + 20 * 24;
    const p = clamp(0.42 + (A.mods.covert || 0) + (A.spyBonus || 0) - (B.mods.covert || 0) * 0.6, 0.08, 0.9);
    if (Math.random() > p) {
      this.addOpinion(target, by, -25);
      this.message(target, by, 'We caught your spies red-handed. This will not be forgotten.');
      return { ok: false, why: 'The operation was exposed.' };
    }
    if (op === 'steal') {
      const cand = Object.keys(B.techs).filter(id => !A.techs[id] && TECH[id].age <= A.age && TECH[id].req.every(q => A.techs[q]));
      if (!cand.length) return { ok: true, why: 'Agents found nothing we do not already know.' };
      const id = cand[(Math.random() * cand.length) | 0]; A.techs[id] = 1; computeMods(s, A);
      return { ok: true, why: `Stolen: ${TECH[id].name}.` };
    }
    if (op === 'sabotage') {
      const r = this.regionsOf(target).sort((x, y) => (y.bld.workshop || 0) + (y.bld.nuclear || 0) * 3 - (x.bld.workshop || 0) - (x.bld.nuclear || 0) * 3)[0];
      const k = ['nuclear', 'workshop', 'power', 'datacenter', 'market'].find(k => r.bld[k] > 0);
      if (k) r.bld[k]--; r.damage = clamp(r.damage + 0.15, 0, 0.85);
      return { ok: true, why: `Saboteurs struck ${this.w.regions[r.i].name}${k ? ', wrecking part of its ' + BUILDINGS[k].name.toLowerCase() : ''}.` };
    }
    if (op === 'unrest') { for (const r of this.regionsOf(target)) r.unrest = clamp(r.unrest + 0.2, 0, 1); B.gov.stability = clamp(B.gov.stability - 0.08, 0, 1); return { ok: true, why: `Riots break out across the lands of the ${this.nm(target)}.` }; }
    if (op === 'insurgents') return fundInsurgents(this, by, target);
    if (op === 'cyber') { B.cyberUntil = s.t + 15 * 24; B.wealth *= 0.7; return { ok: true, why: `Grids and banks of the ${this.nm(target)} go dark.` }; }
  }

  // ---------------------------------------------------------------- nuclear weapons
  nukeCheck(by, i) {
    const s = this.s, A = s.nations[by], r = s.regions[i];
    if (!A.warheads) return { ok: false, why: 'No warheads in the arsenal.' };
    if (A.gov.laws.nuclear === 'disarm') return { ok: false, why: 'Your Disarmament law forbids nuclear use.' };
    if (!r || r.sea || !r.owner || !this.atWar(by, r.owner)) return { ok: false, why: 'Only lands of nations you are at war with.' };
    if (A.gov.laws.nuclear === 'nfu' && !s.nukedBy?.[by]) return { ok: false, why: 'Your No First Use posture forbids a first strike.' };
    const icbm = !!A.techs.icbm;
    const target = this.anchor(i);
    const bomber = s.units.find(u => u.nation === by && UNITS[u.type].role === 'bomber' && kmBetween(u.pos, target) <= UNITS[u.type].radius);
    if (!icbm && !bomber) return { ok: false, why: 'No delivery system in range. Research Ballistic Missiles or position bombers.' };
    return { ok: true, from: icbm ? this.anchor(A.capital) : bomber.pos, icbm };
  }
  nuke(by, i) {
    const chk = this.nukeCheck(by, i); if (!chk.ok) return chk;
    const s = this.s, w = this.w, A = s.nations[by], r = s.regions[i], victim = r.owner, V = s.nations[victim];
    A.warheads--;
    const target = this.anchor(i);
    this.shots.push({ a: chk.from, b: target, k: chk.icbm ? 'icbm' : 'nukebomb', n: by });
    s.nukedBy ||= {}; s.nukedBy[victim] = true;
    for (const c of Object.keys(s.nations)) if (c !== by) this.addOpinion(c, by, this.friendly(c, by) ? -30 : -60);
    const ic = (V.mods.intercept || 0) * (1 - (A.mods.pierce || 0));
    if (Math.random() < ic) {
      this.emit('nuke', `The ${this.nm(by)} launched a nuclear strike on ${w.regions[i].name}. ${this.nm(victim)} missile defenses INTERCEPTED it.`, [by, victim], { loc: i, major: true });
      this.retaliate(victim, by);
      return { ok: true, intercepted: true };
    }
    const yieldK = 1 + (A.mods.yield || 0);
    const loss = Math.min(0.85, 0.35 * yieldK * (1 - (V.mods.shelter || 0)));
    const dead = r.pop * loss;
    r.pop -= dead;
    r.lvl = Math.max(1, r.lvl - Math.round(1.5 * yieldK));
    for (const k of Object.keys(r.bld)) r.bld[k] = Math.max(0, r.bld[k] - Math.round(2 * yieldK));
    for (const k of Object.keys(r.imp)) r.imp[k] = Math.max(0, r.imp[k] - Math.round(1 * yieldK));
    r.damage = 0.95; r.unrest = 1; r.light = 0.02;
    for (const j of w.adj[i]) { const q = s.regions[j]; if (!q.sea) { q.damage = clamp(q.damage + 0.3, 0, 0.9); q.pop *= 0.96; q.unrest = clamp(q.unrest + 0.4, 0, 1); } }
    for (const u of [...s.units]) if (kmBetween(u.pos, target) < 280 * yieldK) { u.hp -= u.mhp * 0.9; if (u.hp <= 0) this.removeUnit(u); }
    s.scars.push({ lat: target[0], lon: target[1], r: 2.2 * yieldK });
    s.nukesUsed++;
    V.exhaustion = clamp(V.exhaustion + 0.3, 0, 1);
    A.gov.stability = clamp(A.gov.stability - (GOV_TYPES[A.gov.type].democratic ? 0.2 : 0.08), 0, 1);
    this.emit('nuke', `NUCLEAR DETONATION: the ${this.nm(by)} destroyed ${w.regions[i].name}. An estimated ${dead >= 1000 ? (dead / 1000).toFixed(1) + ' million' : Math.round(dead) + ' thousand'} dead.`, [by, victim], { loc: i, major: true });
    this.retaliate(victim, by);
    return { ok: true, dead };
  }
  retaliate(victim, attacker) {
    const s = this.s;
    const responders = [victim, ...this.alliesOf(victim).filter(c => s.nations[c].warheads)];
    for (const c of responders) {
      const N = s.nations[c]; if (!N?.alive || !N.warheads || c === s.player) continue;
      const p = c === victim ? ({ disarm: 0, nfu: 0.85, deterrence: 0.75, low: 1 }[N.gov.laws.nuclear] ?? 0.7) : 0.25;
      if (Math.random() >= p) continue;
      if (!this.atWar(c, attacker)) this.declareWar(c, attacker);
      const tgt = this.regionsOf(attacker).sort((a, b) => b.pop - a.pop)[0];
      if (tgt) setTimeout(() => this.nuke(c, tgt.i), 0);
    }
  }

  // ---------------------------------------------------------------- scoring & victory
  score(c) {
    const N = this.s.nations[c]; if (!N?.alive) return 0;
    if (this.s.modern) { // national power: economy, armed forces, frontier research, people, the bomb, a veto
      const frontier = Object.keys(N.techs).filter(id => TECH[id]?.age >= 9).length;
      const veto = (this.s.pacts || []).some(P => P.veto?.includes(c)) ? 150 : 0;
      return Math.round((N.st.prod?.wealth || 0) * 4 + this.power(c) * 1.2 + frontier * 25 + Math.sqrt(N.st.pop || 0) * 0.8 + Math.sqrt(N.warheads || 0) * 15 + veto);
    }
    return Math.round(Object.keys(N.techs).length * 10 + (N.st.pop || 0) ** 0.5 * 3 + (this.owned.get(c)?.size || 0) * 8 + Object.values(this.s.wonders).filter(x => x === c).length * 60 + N.age * 40);
  }
  snapshot() {
    const s = this.s; const row = { t: s.t, y: s.year, score: {}, pop: {} };
    for (const N of Object.values(s.nations)) if (N.alive) { row.score[N.code] = this.score(N.code); row.pop[N.code] = Math.round(N.st.pop); }
    s.history.push(row); if (s.history.length > 400) s.history.shift();
  }
  worldShare(c) { let tot = 0, mine = 0; for (const N of Object.values(this.s.nations)) if (N.alive) { tot += N.st.income || 0; if (N.code === c) mine += N.st.income || 0; } return tot ? mine / tot : 0; }
  // vassal lands count half toward dominion
  landShare(c) { let n = this.owned.get(c)?.size || 0; for (const v of this.vassalsOf(c)) n += (this.owned.get(v)?.size || 0) * 0.5; return n / this.landIdx.length; }
  checkVictory() {
    const s = this.s; if (s.over) return;
    const P = s.nations[s.player];
    if (!P.alive) { s.over = true; s.winner = null; s.winType = 'defeat'; this.emit('war', 'Your civilization has fallen.', [s.player], { major: true }); return; }
    const alive = Object.values(s.nations).filter(n => n.alive);
    for (const N of alive) {
      if (s.victory.conquest && this.landShare(N.code) >= s.victory.conquest) { s.over = true; s.winner = N.code; s.winType = 'conquest'; this.emit('war', `The ${this.full(N.code)} rules ${Math.round(this.landShare(N.code) * 100)}% of the world's lands.`, [N.code], { major: true }); return; }
    }
    if (alive.length === 1) { s.over = true; s.winner = alive[0].code; s.winType = 'conquest'; return; }
    if (s.victory.score && s.year >= 2100) { const best = alive.sort((a, b) => this.score(b.code) - this.score(a.code))[0]; s.over = true; s.winner = best.code; s.winType = 'score'; this.emit('age', `The year 2100 arrives. History judges the ${this.full(best.code)} the greatest civilization.`, [best.code], { major: true }); }
  }
  disbandWeakest(c) { const us = this.unitsOf(c).sort((a, b) => UNITS[b.type].upkeep.wealth - UNITS[a.type].upkeep.wealth); if (us.length > 1) this.removeUnit(us[0]); }
}

// AI / science-minister tech choice
const BOMB = ['nuclear_weapons', 'thermonuclear', 'icbm'];
export function pickTech(N, focus) {
  // states without the bomb do not reach for it, unless they are among the would-be proliferators
  const av = available(N).filter(x => !(N.age >= 9 && N.ai && BOMB.includes(x.id) && !N.techs.nuclear_weapons && !N.proliferator));
  if (!av.length) return null;
  const pref = { military: ['war', 'sea', 'intel'], economy: ['food', 'craft', 'econ'], science: ['lore'], civic: ['civic'], balanced: null }[focus || 'balanced'];
  const sci = N.traits?.science ?? 0.5;
  const score = x => x.cost * (pref && !pref.includes(x.branch) ? 2.5 : 1) * (x.branch === 'lore' ? 1.1 - sci * 0.3 : 1) * (0.75 + Math.random() * 0.5);
  return av.sort((a, b) => score(a) - score(b))[0].id;
}

export { clamp, rnd, pkey, kmBetween };
