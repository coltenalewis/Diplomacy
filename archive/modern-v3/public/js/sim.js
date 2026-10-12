// Real-time world simulation. One step = one game hour.
// Units have physical positions; combat is range-based; aircraft fly sorties; governments, research and nuclear arsenals evolve.
import { UNITS, BUILDINGS, OIL_REGIONS, ECON, START_DATE, LAND_TYPES } from './config.js';
import { NATIONS, NATION } from './nations.js';
import { TECH, startingTechs, NUCLEAR_STATES, has, available } from './tech.js';
import { initGovernment, computeMods, unitMods, politicsDaily, rollEvent, lawOpt, refreshCandidates } from './gov.js';
import { slerpLL, haversine } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const pkey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const DEG = Math.PI / 180;
// fast distance (km) good to ~1% at these ranges
const kmBetween = (a, b) => { const dl = (b[1] - a[1] + 540) % 360 - 180; const x = dl * Math.cos((a[0] + b[0]) / 2 * DEG), y = b[0] - a[0]; return Math.sqrt(x * x + y * y) * 111.2; };
// move a lat/lon toward another by km
function stepToward(a, b, km) {
  const d = kmBetween(a, b); if (d <= km || d < 1e-6) return [b[0], b[1]];
  return slerpLL(a, b, km / d);
}

export class Sim {
  constructor(world, geo, opts = {}) {
    this.w = world;
    this.listeners = [];
    this.unitById = new Map();
    this.shots = [];
    this.battles = [];
    if (opts.state) { this.s = opts.state; this.migrate(); this.rebuildCaches(); for (const N of Object.values(this.s.nations)) if (N.alive) computeMods(this.s, N); return; }
    this.s = this.initState(geo, opts);
    this.rebuildCaches();
    for (const n of Object.values(this.s.nations)) this.recalcNation(n.code);
  }
  migrate() {
    const s = this.s;
    s.chars ||= {}; s.cid ||= 1; s.groups ||= []; s.gid ||= 1; s.scars ||= []; s.nukesUsed ||= 0; s.sanctions ||= []; s.guarantees ||= [];
    for (const u of s.units) { u.mhp ||= UNITS[u.type].hp; u.xp ||= 0; if (!u.pos) this.placeUnit(u, true); }
  }

  // ---------------------------------------------------------------- init
  initState(geo, opts) {
    const w = this.w;
    const regions = w.regions.map((r, i) => ({ i, id: r.id, sea: r.sea, owner: null, core: null }));
    for (const n of NATIONS) for (const id of n.regions) { const r = regions[w.byId[id].i]; r.owner = r.core = n.code; }
    for (const n of NATIONS) {
      const ids = n.regions.map(id => w.byId[id].i);
      const wt = ids.map((i, k) => { const g = geo[i]; return (Math.pow(g.lights * 100 + 1, 0.6) + g.area * g.fert * 0.006 + g.area * 0.001) * (k === 0 ? 1.4 : 1); });
      const ewt = ids.map((i, k) => (Math.pow(geo[i].lights * 140 + 1, 0.75) + 0.3) * (k === 0 ? 1.5 : 1));
      const sw = wt.reduce((a, b) => a + b, 0), se = ewt.reduce((a, b) => a + b, 0);
      const perCap = (n.gdp || 50) * 1000 / (n.pop || 10);
      ids.forEach((i, k) => {
        const r = regions[i], g = geo[i], R = w.regions[i];
        r.pop = Math.max(0.2, (n.pop || 10) * wt[k] / sw);
        r.econ = (n.gdp || 50) * ECON.gdpToIncome * ewt[k] / se;
        r.area = g.area; r.arid = g.arid;
        r.fert = g.fert * clamp((64 - Math.abs(R.lat)) / 22, 0.12, 1);
        const density = r.pop / Math.max(20, g.area);
        r.city = clamp(Math.round(0.6 + 2.0 * Math.log10(Math.max(1, perCap / 1500)) + Math.min(1.5, density * 2)), 0, 5);
        r.industry = clamp(Math.round(Math.log10(1 + r.econ) * 1.6 + (perCap > 20000 ? 0.5 : 0)), 0, 4);
        r.city0 = r.city; r.industry0 = r.industry;
        r.hasOil = OIL_REGIONS.has(r.id);
        r.oil = r.hasOil ? 1 + (Math.random() < 0.5 ? 1 : 0) : 0;
        const yieldPer = ECON.farmYield * (0.35 + r.fert);
        r.farm = clamp(Math.round((r.pop * ECON.foodPerPop) / yieldPer * rnd(0.8, 1.4) + 0.3), 0, BUILDINGS.farm.max);
        const eNeed = r.pop * ECON.energyPerPop * (1 + 0.2 * r.city) + r.industry * ECON.industryEnergy - r.oil * ECON.oilYield;
        r.power = clamp(Math.round(eNeed / ECON.powerYield * rnd(0.75, 1.3) + 0.3), 0, BUILDINGS.power.max);
        r.port = R.coastal && (r.city >= 2 || r.econ > 3) ? 1 + (r.econ > 15 ? 1 : 0) : 0;
        r.lab = k === 0 && perCap > 15000 ? 1 + (perCap > 40000 ? 1 : 0) : 0;
        r.datacenter = 0; r.academy = 0; r.nuclear = 0;
        r.fort = 0; r.build = null; r.capture = null; r.unrest = 0; r.damage = 0; r.light = 1;
      });
    }
    const nations = {};
    for (const n of NATIONS) {
      const perCap = (n.gdp || 50) * 1000 / (n.pop || 10);
      nations[n.code] = {
        code: n.code, alive: true, ai: n.code !== opts.player, capital: w.byId[n.regions[0]].i,
        money: 0, food: 0, energy: 0, manpower: 0, queue: [], exhaustion: 0, st: {},
        techs: startingTechs(n, perCap), research: { cur: null, prog: 0, queue: [] },
        warheads: NUCLEAR_STATES[n.code] || 0, warheadProg: 0, opCooldown: {},
        directives: { industry: 'off', defense: 'off', science: 'off', foreign: 'off', budget: 0.35 }, delegateEvents: false,
      };
      const N = nations[n.code];
      if (N.warheads) { N.techs.en4 ||= 1; N.techs.nuc1 = 1; N.techs.nuc2 = 1; }
    }
    const s = {
      t: 0, player: opts.player, winShare: opts.winShare || 0.33, regions, nations, units: [], uid: 1, trades: [], tid: 1,
      rel: {}, opinion: {}, events: [], messages: [], mid: 1, prices: { ...ECON.basePrice }, winner: null, over: false, history: [],
      chars: {}, cid: 1, groups: [], gid: 1, scars: [], nukesUsed: 0, sanctions: [], guarantees: [], nextEventAt: 24 * 12, pendingEvent: null,
    };
    this.s = s;
    // nuclear states keep a facility
    for (const n of NATIONS) if (nations[n.code].warheads) regions[nations[n.code].capital].nuclear = 1;
    for (const n of NATIONS) {
      const N = nations[n.code];
      initGovernment(s, N, n);
      computeMods(s, N);
      this.recalcNation(n.code);
      N.money = Math.max(250, N.st.income * 40);
      N.food = Math.max(0, N.st.foodCons * 45);
      N.energy = Math.max(0, N.st.eCons * 30);
      N.manpower = N.st.pop * 1.2;
      this.seedForces(n);
    }
    refreshCandidates(s, nations[opts.player]);
    for (const a of NATIONS) for (const b of NATIONS) if (a !== b) this.setOpinion(a.code, b.code, rnd(-8, 12));
    this.formBlocs();
    return s;
  }

  seedForces(n) {
    const s = this.s, w = this.w;
    const N = s.nations[n.code];
    const gdp = N.st.income;
    const budget = gdp * 0.22;
    let spent = 0;
    const regs = n.regions.map(id => w.byId[id].i).sort((a, b) => s.regions[b].pop - s.regions[a].pop);
    const coastal = regs.filter(i => w.regions[i].coastal);
    const mix = ['INF', 'INF', 'ARM', 'INF', 'ART', 'INF', 'ARM', 'FTR', 'INF', 'BMB'];
    const navMix = ['DES', 'SUB', 'DES', 'CRU', 'TRN', 'CAR', 'SUB', 'DES'];
    let k = 0, kn = 0;
    const add = (type, loc) => { this.spawn(n.code, type, loc); spent += UNITS[type].upkeep; };
    add('INF', regs[0]);
    while (spent < budget && k < 60) {
      const type = mix[k % mix.length];
      if ((type === 'FTR' || type === 'BMB') && gdp < 120) { k++; continue; }
      add(type, regs[k % regs.length]); k++;
      if (coastal.length && gdp > 60 && k % 3 === 0) {
        const nt = navMix[kn % navMix.length];
        if (nt === 'CAR' && gdp < 400) { kn++; continue; }
        const sea = this.seaNear(coastal[kn % coastal.length]);
        if (sea >= 0) add(nt, sea);
        kn++;
      }
    }
    for (const u of this.unitsOf(n.code)) u.xp = Math.round(rnd(5, 25));
  }

  formBlocs() {
    const blocs = [
      ['USA', 'CAN', 'GBR', 'FRA', 'DEU', 'ITA', 'ESP', 'NLD', 'BEL', 'NOR', 'DNK', 'POL', 'PRT', 'TUR', 'GRC', 'ROU', 'BGR', 'CZE', 'HUN', 'BLT', 'HRV', 'ALB', 'ISL', 'FIN', 'SWE'],
      ['USA', 'JPN', 'KOR', 'AUS', 'NZL', 'PHL'], ['RUS', 'BLR'], ['CHN', 'PRK'], ['SAU', 'ARE'],
    ];
    for (const b of blocs) for (const x of b) for (const y of b) if (x < y) { this.setRel(x, y, 'alliance'); this.addOpinion(x, y, 35); this.addOpinion(y, x, 35); }
    for (const [x, y] of [['RUS', 'UKR'], ['IND', 'PAK'], ['PRK', 'KOR'], ['CHN', 'TWN'], ['IRN', 'SAU'], ['IRN', 'USA'], ['RUS', 'POL'], ['CHN', 'IND'], ['RUS', 'USA']]) { this.addOpinion(x, y, -35); this.addOpinion(y, x, -35); }
  }

  rebuildCaches() { this.unitById = new Map(this.s.units.map(u => [u.id, u])); }

  // ---------------------------------------------------------------- helpers
  on(fn) { this.listeners.push(fn); }
  emit(kind, text, nations = [], extra = {}) {
    const e = { t: this.s.t, kind, text, nations, ...extra };
    this.s.events.push(e); if (this.s.events.length > 500) this.s.events.shift();
    for (const f of this.listeners) f(e);
  }
  date() { return new Date(START_DATE + this.s.t * 3600e3); }
  rel(a, b) { return a === b ? 'self' : (this.s.rel[pkey(a, b)] || 'peace'); }
  setRel(a, b, st) { if (st === 'peace') delete this.s.rel[pkey(a, b)]; else this.s.rel[pkey(a, b)] = st; }
  atWar(a, b) { return a !== b && this.s.rel[pkey(a, b)] === 'war'; }
  friendly(a, b) { if (a === b) return true; return this.rel(a, b) === 'alliance'; }
  opinion(a, b) { return this.s.opinion[a]?.[b] ?? 0; }
  setOpinion(a, b, v) { (this.s.opinion[a] ||= {})[b] = clamp(v, -100, 100); }
  addOpinion(a, b, d) { this.setOpinion(a, b, this.opinion(a, b) + d); }
  regionsOf(c) { return this.s.regions.filter(r => r.owner === c); }
  unitsOf(c) { return this.s.units.filter(u => u.nation === c); }
  anchor(i) { const R = this.w.regions[i]; return [R.lat, R.lon]; }
  seaNear(i) {
    const w = this.w; let best = -1, bk = Infinity;
    w.adj[i].forEach((j, k) => { if (w.regions[j].sea && w.km[i][k] < bk) { bk = w.km[i][k]; best = j; } });
    return best;
  }
  // deterministic formation slot around a region anchor
  slot(u, i) {
    const [lat, lon] = this.anchor(i);
    const sea = this.w.regions[i].sea, air = UNITS[u.type].domain === 'air';
    const a = u.id * 2.39996, rr = (sea ? 1.4 : air ? 0.5 : 0.85) * (0.25 + 0.75 * Math.sqrt(((u.id * 0.6180339) % 1)));
    return [lat + Math.sin(a) * rr, lon + Math.cos(a) * rr / Math.max(0.3, Math.cos(lat * DEG))];
  }
  placeUnit(u, snap) {
    let p;
    if (u.air && u.air.phase !== 'base') p = u.air.pos;
    else if (u.move) {
      const m = u.move, a = m.path[m.seg], b = m.path[m.seg + 1];
      const t = clamp(m.prog / this.w.edgeKm(a, b), 0, 1);
      const sa = this.slot(u, a), sb = this.slot(u, b);
      p = slerpLL(sa, sb, t);
    } else p = this.slot(u, u.loc);
    if (snap || !u.pos) u.ppos = p;
    u.pos = p;
  }
  spawn(nation, type, loc) {
    const N = this.s.nations[nation];
    const mhp = Math.round(UNITS[type].hp * (1 + (UNITS[type].domain === 'land' ? N?.mods?.hpLand || 0 : 0)));
    const u = { id: this.s.uid++, nation, type, hp: mhp, mhp, loc, move: null, mission: null, fighting: 0, xp: 0 };
    if (UNITS[type].domain === 'air') u.air = { phase: 'base', cd: 0 };
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
  sealift(c) { return 2 + this.s.units.filter(u => u.nation === c && u.type === 'TRN').length * UNITS.TRN.lift; }
  embarked(c) { return this.s.units.filter(u => u.nation === c && UNITS[u.type].domain === 'land' && (this.w.regions[u.loc].sea || (u.move && u.move.path.some(p => this.w.regions[p].sea)))).length; }

  canEnter(c, domain, j) {
    const R = this.w.regions[j], r = this.s.regions[j];
    if (domain === 'sea') return R.sea;
    if (domain === 'land') { if (R.sea) return true; const o = r.owner; return !o || o === c || this.friendly(c, o) || this.atWar(c, o); }
    if (R.sea) return false;
    return r.owner === c || this.friendly(c, r.owner);
  }

  planPath(units, dest) {
    const w = this.w, c = units[0].nation;
    const domain = UNITS[units[0].type].domain;
    const from = units[0].loc;
    const blockers = new Set();
    let path;
    if (domain === 'air') {
      if (!this.canEnter(c, 'air', dest)) return { path: null, reason: 'Aircraft can only rebase to your own or allied territory.' };
      return { path: [from, dest], air: true };
    }
    if (domain === 'sea') { path = w.path(from, dest, j => w.regions[j].sea); return { path, reason: path ? null : 'No sea route.' }; }
    path = w.path(from, dest, j => {
      if (w.regions[j].sea) return true;
      const o = this.s.regions[j].owner;
      return !o || o === c || this.friendly(c, o) || this.atWar(c, o) || j === dest;
    }, (i, j, km) => km * (w.regions[j].sea ? 2.2 : 1));
    if (!path) return { path: null, reason: 'No route.' };
    for (const j of path) { const o = this.s.regions[j].owner; if (!w.regions[j].sea && o && o !== c && !this.friendly(c, o) && !this.atWar(c, o)) blockers.add(o); }
    if (path.some(j => w.regions[j].sea) && this.embarked(c) + units.length > this.sealift(c)) return { path: null, reason: `Insufficient sealift (${this.sealift(c)} capacity). Build transports.` };
    return { path, blockers };
  }

  order(unitIds, dest, opts = {}) {
    const units = unitIds.map(id => this.unitById.get(id)).filter(Boolean);
    if (!units.length) return { ok: false, reason: 'No units.' };
    const groups = new Map();
    for (const u of units) { const k = UNITS[u.type].domain + ':' + u.loc; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); }
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
        const m = u.move;
        const N = s.nations[u.nation];
        const um = unitMods(s, u, T.domain);
        let speed = T.speed / 24 * (N.st.eF < 0.6 ? 0.7 : 1) * um.speed;
        if (T.domain === 'land' && w.regions[m.path[m.seg]].sea) speed = Math.max(speed, 650 / 24);
        if (u.fighting > 0 && T.domain === 'land') speed *= 0.45;
        m.prog += speed;
        const a = m.path[m.seg], b = m.path[m.seg + 1];
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
    const airborneEnemy = c => s.units.filter(e => e.air && e.air.phase !== 'base' && this.atWar(c, e.nation));
    for (const u of s.units) {
      if (!u.air) continue;
      const T = UNITS[u.type], A = u.air;
      const um = unitMods(s, u, 'air');
      const fly = T.speed * um.speed;
      // base lost? rebase to nearest friendly land
      const baseOwner = s.regions[u.loc].owner;
      if (!w.regions[u.loc].sea && baseOwner !== u.nation && !this.friendly(u.nation, baseOwner)) {
        const home = this.regionsOf(u.nation).sort((a, b) => kmBetween(this.anchor(a.i), u.pos) - kmBetween(this.anchor(b.i), u.pos))[0];
        if (home) { u.loc = home.i; A.phase = 'ferry'; A.pos ||= u.pos; A.tgt = this.slot(u, home.i); }
      }
      const basePos = this.slot(u, u.loc);
      if (A.phase === 'base') {
        A.pos = basePos;
        if (A.cd > 0) { A.cd--; this.placeUnit(u); continue; }
        if (u.hp < u.mhp * 0.3) { u.hp = Math.min(u.mhp, u.hp + u.mhp * 0.01); this.placeUnit(u); continue; } // repairs
        let tgt = null;
        // fighters intercept enemy aircraft inside their radius
        if (u.type === 'FTR') {
          const foe = airborneEnemy(u.nation).filter(e => kmBetween(basePos, e.pos) < T.radius).sort((a, b) => kmBetween(basePos, a.pos) - kmBetween(basePos, b.pos))[0];
          if (foe) tgt = { track: foe.id, pos: foe.pos };
        }
        // ordered strike
        if (!tgt && u.mission?.strike !== undefined) {
          const r = s.regions[u.mission.strike];
          if (!r || r.sea || !r.owner || !this.atWar(u.nation, r.owner)) u.mission = null;
          else if (kmBetween(basePos, this.anchor(r.i)) <= T.radius) tgt = { region: r.i, pos: this.anchor(r.i) };
        }
        // close air support for nearby battles
        if (!tgt && this.battles.length) {
          const b = this.battles.filter(b => b.nations.some(n => n === u.nation || this.friendly(n, u.nation)) && kmBetween(basePos, b.pos) < T.radius * 0.8)
            .sort((x, y) => kmBetween(basePos, x.pos) - kmBetween(basePos, y.pos))[0];
          if (b) tgt = { region: b.loc, pos: b.pos };
        }
        if (tgt) { A.phase = 'out'; A.tgt = tgt.pos; A.track = tgt.track || null; A.region = tgt.region ?? null; A.pos = basePos; A.timer = 0; }
      } else if (A.phase === 'out') {
        if (A.track) { const e = this.unitById.get(A.track); if (!e || e.air?.phase === 'base') { A.phase = 'back'; } else A.tgt = e.pos; }
        A.pos = stepToward(A.pos, A.tgt, fly);
        if (kmBetween(A.pos, A.tgt) < 30) { A.phase = 'engage'; A.timer = u.type === 'BMB' ? 2 : 3; }
        if (kmBetween(A.pos, basePos) > T.radius * 1.1) A.phase = 'back';
      } else if (A.phase === 'engage') {
        if (A.track) { const e = this.unitById.get(A.track); if (e && e.air?.phase !== 'base') A.pos = stepToward(A.pos, e.pos, fly); }
        else A.pos = [A.tgt[0] + rnd(-0.3, 0.3), A.tgt[1] + rnd(-0.3, 0.3)];
        if (u.type === 'BMB' && A.region !== null) this.bombRegion(u, A.region);
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
    this.shots.push({ a: u.pos, b: this.slot({ id: (Math.random() * 1e6) | 0, type: 'INF' }, i), k: 'bomb', n: u.nation });
    if (Math.random() < 0.06) {
      const keys = ['industry', 'power', 'oil', 'port', 'fort', 'datacenter', 'nuclear'].filter(k => r[k] > 0);
      if (keys.length) { const k = keys[(Math.random() * keys.length) | 0]; r[k]--; this.emit('battle', `${NATION[u.nation].name} bombers destroyed ${BUILDINGS[k].name.toLowerCase()} in ${this.w.regions[i].name}.`, [u.nation, r.owner], { loc: i }); }
    }
  }

  // ---- range-based combat with spatial buckets
  combat() {
    const s = this.s, w = this.w;
    const CELL = 4;
    const buckets = new Map();
    const key = (la, lo) => Math.floor((la + 90) / CELL) * 1000 + Math.floor((((lo + 180) % 360) + 360) % 360 / CELL);
    for (const u of s.units) {
      u.fighting = Math.max(0, u.fighting - 1);
      if (u.air && u.air.phase === 'base') continue; // parked aircraft are sheltered
      const k = key(u.pos[0], u.pos[1]);
      if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(u);
    }
    const near = (u, R) => {
      const out = [];
      const [la, lo] = u.pos;
      const kl = Math.ceil(R / (CELL * 111)) + 0, ko = Math.min(45, Math.ceil(R / (CELL * 111 * Math.max(0.2, Math.cos(la * DEG)))));
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
      const airborne = u.air && u.air.phase !== 'base';
      if (u.air && !airborne) continue;
      const embarked = T.domain === 'land' && w.regions[u.loc].sea;
      if (embarked) continue;
      let R = T.range;
      if (u.air) R = u.air.phase === 'engage' ? 140 : 45;
      const cands = near(u, R);
      let best = null, bd = Infinity;
      for (const e of cands) {
        if (!this.atWar(u.nation, e.nation)) continue;
        const ET = UNITS[e.type];
        const eAir = e.air && e.air.phase !== 'base';
        const eSea = ET.domain === 'sea';
        const eEmb = ET.domain === 'land' && w.regions[e.loc].sea;
        // what can engage what
        if (T.domain === 'land') {
          if (eSea && !(T.indirect)) continue;
          if (eAir && u.type !== 'INF' && u.type !== 'ARM') continue;
        }
        if (u.type === 'SUB' && !(eSea || eEmb)) continue;
        if (u.type === 'DES' && !(eSea || eEmb || eAir)) continue;
        if (u.air && u.air.phase !== 'engage' && !eAir) continue;
        if (u.type === 'BMB' && eAir) continue;
        if (e.type === 'SUB' && u.type !== 'DES' && Math.random() > 0.25) continue;
        let d = kmBetween(u.pos, e.pos);
        const sameRegionLand = T.domain === 'land' && ET.domain === 'land' && e.loc === u.loc && !eEmb;
        if (d > R && !sameRegionLand) continue;
        // targeting priority
        let score = d * rnd(0.7, 1.3);
        if (u.type === 'SUB' && (e.type === 'TRN' || eEmb || e.type === 'CAR')) score *= 0.3;
        if (u.type === 'DES' && e.type === 'SUB') score *= 0.2;
        if (u.type === 'FTR' && eAir) score *= 0.1;
        if (score < bd) { bd = score; best = e; }
      }
      if (!best) continue;
      const t = best, TT = UNITS[t.type];
      const um = unitMods(s, u, T.domain), tm = unitMods(s, t, TT.domain);
      let A = T.atk * um.atk * (u.type === 'DES' && t.type === 'SUB' ? T.antisub : 1) * (1 + (s.nations[u.nation].bonusAtk || 0));
      if (u.type === 'FTR' && !(t.air && t.air.phase !== 'base')) A *= 0.55;
      if (u.type === 'CRU' && TT.domain === 'land') A *= 0.8;
      const tr = s.regions[t.loc];
      let D = TT.def * tm.def * (TT.domain === 'land' && tr && t.nation === tr.owner ? 1.15 + 0.35 * (tr.fort || 0) : 1);
      if (TT.domain === 'land' && w.regions[t.loc].sea) D = 1;
      const hpf = 0.5 + 0.5 * u.hp / u.mhp;
      hit(t, 2.2 * A * (A / (A + D)) * hpf * rnd(0.7, 1.3));
      u.fighting = 3; t.fighting = 3;
      u.xp = Math.min(100, (u.xp || 0) + 0.06);
      // the visible shot
      if (this.shots.length < 600) {
        const k = u.air ? (u.type === 'BMB' ? 'bomb' : 'air') : u.type === 'SUB' ? 'torp' : u.type === 'CAR' ? 'wing' : T.indirect ? 'art' : TT.domain === 'air' ? 'aa' : 'gun';
        this.shots.push({ a: u.pos, b: t.pos, k, n: u.nation });
      }
      const bl = TT.domain === 'air' ? u.loc : t.loc;
      if (!battleAt.has(bl)) battleAt.set(bl, new Set()); battleAt.get(bl).add(u.nation).add(t.nation);
    }
    this.battles = [...battleAt].map(([loc, ns]) => ({ loc, nations: [...ns], pos: this.anchor(loc) }));
    const lost = [];
    for (const [u, d] of dmg) {
      u.hp -= d;
      const N = s.nations[u.nation]; if (N) N.exhaustion = clamp(N.exhaustion + d / 6000 * (1 + (N.mods?.exhaustion || 0)), 0, 1);
      if (u.hp <= 0) lost.push(u);
    }
    for (const u of lost) {
      this.shots.push({ a: u.pos, b: u.pos, k: 'kill', n: u.nation });
      this.removeUnit(u);
      if (Math.random() < 0.5 || UNITS[u.type].domain !== 'land') this.emit('loss', `${NATION[u.nation].name} lost ${/^[aeiou]/i.test(UNITS[u.type].name) ? 'an' : 'a'} ${UNITS[u.type].name.toLowerCase()} near ${w.regions[u.loc].name}.`, [u.nation], { loc: u.loc });
    }
  }

  captures() {
    const s = this.s, w = this.w;
    const landAt = new Map();
    for (const u of s.units) if (UNITS[u.type].domain === 'land' && !w.regions[u.loc].sea && !u.move) { if (!landAt.has(u.loc)) landAt.set(u.loc, []); landAt.get(u.loc).push(u); }
    for (const r of s.regions) {
      if (r.sea || !r.owner) continue;
      const us = landAt.get(r.i);
      if (!us) { if (r.capture) r.capture.p = Math.max(0, r.capture.p - 0.02); if (r.capture && r.capture.p <= 0) r.capture = null; continue; }
      const defenders = us.filter(u => u.nation === r.owner || (this.friendly(u.nation, r.owner) && !us.some(e => this.atWar(e.nation, u.nation) && e.nation !== r.owner)));
      const hostile = us.filter(u => this.atWar(u.nation, r.owner));
      if (!hostile.length || defenders.length) { if (r.capture) r.capture.p = Math.max(0, r.capture.p - 0.05); if (r.capture?.p <= 0) r.capture = null; continue; }
      const by = {}; for (const u of hostile) by[u.nation] = (by[u.nation] || 0) + u.hp / u.mhp;
      const [lead, power] = Object.entries(by).sort((a, b) => b[1] - a[1])[0];
      if (!r.capture || r.capture.by !== lead) r.capture = { by: lead, p: 0 };
      const garrison = this.garrison(r);
      for (const u of hostile) if (Math.random() < 0.25) u.hp = Math.max(1, u.hp - 0.4 * garrison / hostile.length);
      if (power > garrison) r.capture.p += Math.min(4, power - garrison) / (110 * (1 + r.fort * 0.5));
      if (r.capture.p >= 1) this.transfer(r, lead);
    }
  }

  garrison(r) { return 0.6 + 0.25 * r.city + 0.8 * r.fort + (this.s.nations[r.owner]?.capital === r.i ? 0.8 : 0); }

  transfer(r, to, peaceful = false) {
    const s = this.s, w = this.w;
    const from = r.owner;
    r.owner = to; r.capture = null;
    if (!peaceful) { r.fort = Math.max(0, r.fort - 1); r.damage = clamp(r.damage + 0.25, 0, 0.8); r.pop *= 0.96; r.unrest = clamp(r.unrest + 0.5, 0, 1); }
    if (r.build) r.build = null;
    const N = s.nations[from];
    N.queue = N.queue.filter(q => q.region !== r.i);
    if (!peaceful) N.exhaustion = clamp(N.exhaustion + 0.06, 0, 1);
    this.emit('capture', peaceful ? `${NATION[from].name} cedes ${w.regions[r.i].name} to ${NATION[to].name}.` : `${NATION[to].name} captured ${w.regions[r.i].name} from ${NATION[from].name}.`, [to, from], { loc: r.i });
    const left = this.regionsOf(from);
    if (!left.length) {
      N.alive = false;
      for (const u of this.unitsOf(from)) this.removeUnit(u);
      s.trades = s.trades.filter(t => t.from !== from && t.to !== from);
      for (const k of Object.keys(s.rel)) if (k.split('|').includes(from)) delete s.rel[k];
      this.emit('war', `${NATION[from].name} has collapsed. Its government has surrendered to ${NATION[to].name}.`, [from, to], { loc: r.i, major: true });
    } else if (N.capital === r.i) {
      N.capital = left.sort((a, b) => b.pop - a.pop)[0].i;
      this.emit('war', `${NATION[from].name} relocates its capital to ${w.regions[N.capital].name}.`, [from], { loc: N.capital });
    }
    for (const t of s.trades) if (t.path.includes(r.i)) t.path = this.tradePath(t.from, t.to) || t.path;
  }

  // ---------------------------------------------------------------- economy
  sanctionMult(c) {
    const s = this.s; let w = 0;
    for (const x of s.sanctions) if (x.on === c && s.nations[x.by]?.alive) w += this.worldShare(x.by);
    return 1 - Math.min(0.35, w * 0.8);
  }
  recalcNation(c) {
    const s = this.s, N = s.nations[c];
    const m = N.mods || computeMods(s, N);
    let pop = 0, foodProd = 0, foodCons = 0, eProd = 0, eCons = 0, tax = 0, regions = 0, labs = 0, dcs = 0;
    for (const r of s.regions) {
      if (r.owner !== c) continue;
      regions++;
      const ok = 1 - r.damage * 0.6;
      pop += r.pop;
      foodProd += r.farm * ECON.farmYield * (0.35 + r.fert) * ok;
      foodCons += r.pop * ECON.foodPerPop;
      eProd += (r.power * ECON.powerYield * (1 + m.power) + r.oil * ECON.oilYield * (1 + m.oil)) * ok;
      eCons += r.pop * ECON.energyPerPop * (1 + 0.2 * r.city) + r.industry * ECON.industryEnergy + (r.datacenter || 0) * 15;
      const growth = 1 + 0.1 * (r.city - r.city0) + 0.12 * (r.industry - r.industry0);
      tax += (r.econ * growth + 0.25 * r.city + 0.35 * r.industry + 2 * (r.datacenter || 0)) * (1 - r.unrest * 0.5) * ok;
      labs += (r.lab || 0) * ok; dcs += (r.datacenter || 0) * ok;
    }
    foodProd *= 1 + m.food;
    eCons *= 1 + m.energyCons;
    let upkeep = 0, fuel = 0, units = 0, training = 0;
    for (const u of s.units) if (u.nation === c) { upkeep += UNITS[u.type].upkeep; fuel += UNITS[u.type].fuel; units++; if (u.train) training += 0.3; }
    upkeep *= 1 + m.upkeep;
    eCons += fuel;
    let tradeMoney = 0, tradeFood = 0, tradeEnergy = 0;
    for (const t of s.trades) {
      if (t.blockaded) continue;
      const sign = t.from === c ? -1 : t.to === c ? 1 : 0; if (!sign) continue;
      if (t.good === 'food') tradeFood += sign * t.amount; else tradeEnergy += sign * t.amount;
      tradeMoney -= sign * t.amount * t.price * (sign < 0 ? 1 + m.tradeBonus : 1);
    }
    const eAvail = eProd + tradeEnergy + N.energy;
    const eF = eCons > 0 ? clamp(eAvail / eCons, 0.15, 1) : 1;
    const income = tax * (0.4 + 0.6 * eF) * (1 + m.income) * this.sanctionMult(c);
    const researchCost = income * m.researchShare;
    const rp = (income * m.researchShare * 0.9 + labs * 4 + dcs * 10 * (1 + m.aiBoost) + 1) * (1 + m.research) * (0.4 + 0.6 * eF);
    N.st = { pop, foodProd, foodCons, eProd, eCons, eF, income, upkeep, tradeMoney, tradeFood, tradeEnergy, regions, units, researchCost, rp, training,
      net: income - upkeep - researchCost - training + tradeMoney, foodNet: foodProd + tradeFood - foodCons, energyNet: eProd + tradeEnergy - eCons };
    return N.st;
  }

  daily() {
    const s = this.s;
    this.updateTrades();
    for (const N of Object.values(s.nations)) {
      if (!N.alive) continue;
      computeMods(s, N);
      const st = this.recalcNation(N.code);
      const m = N.mods;
      N.money += st.net;
      N.food += st.foodNet; N.energy += st.energyNet;
      const starving = N.food < 0;
      if (N.food < 0) { N.famine = clamp(-N.food / Math.max(1, st.foodCons), 0, 1); N.food = 0; } else N.famine = 0;
      if (N.energy < 0) N.energy = 0;
      N.food = Math.min(N.food, st.foodCons * 120 + 200);
      N.energy = Math.min(N.energy, st.eCons * 90 + 200);
      N.manpower = Math.min(N.manpower + st.pop * 0.02 * (1 + m.manpower), st.pop * 3 * (1 + m.manpower) + 20);
      if (N.money < -200 && N.ai) this.disbandWeakest(N.code);
      N.exhaustion = Math.max(0, N.exhaustion - (this.warsOf(N.code).length ? 0.001 : 0.006));
      for (const r of s.regions) {
        if (r.owner !== N.code) continue;
        const cap = 8 + 14 * r.city + r.farm * 3;
        if (starving) r.pop *= 1 - ECON.famineLoss * N.famine;
        else if (r.pop < cap * 6) r.pop *= 1 + ECON.popGrowth * (1 + 0.2 * r.city) * (1 + m.popGrowth);
        r.unrest = clamp(r.unrest + (starving ? 0.01 : -0.004) + (st.eF < 0.7 ? 0.004 : 0) + (N.gov.stability < 0.3 ? 0.003 : 0), 0, 1);
        r.damage = Math.max(0, r.damage - 0.002);
        const growth = 1 + 0.18 * (r.city - (r.city0 ?? r.city));
        r.light = clamp((0.15 + 0.85 * st.eF) * (1 - r.damage) * growth * (N.cyberUntil > s.t ? 0.5 : 1), 0.05, 2);
        if (r.build) {
          r.build.left -= (0.4 + 0.6 * st.eF) * (1 + m.build);
          if (r.build.left <= 0) {
            r[r.build.type] = r.build.level;
            if (r.build.type === 'city') r.pop *= 1.04;
            if (r.build.type === 'nuclear' && r.build.level === 1) {
              for (const c of Object.keys(s.nations)) if (c !== N.code) this.addOpinion(c, N.code, -8);
              this.emit('war', `Satellite imagery reveals a new nuclear facility in ${NATION[N.code].name}.`, [N.code], { loc: r.i, major: NATION[N.code].major });
            }
            if (N.code === s.player) this.emit('build', `${BUILDINGS[r.build.type].name} level ${r.build.level} completed in ${this.w.regions[r.i].name}.`, [N.code], { loc: r.i });
            r.build = null;
          }
        }
      }
      if (N.famine > 0.15 && Math.random() < 0.1) this.emit('econ', `Famine spreads in ${NATION[N.code].name}: food stocks exhausted.`, [N.code], { loc: N.capital });
      if (st.eF < 0.6 && Math.random() < 0.08) this.emit('econ', `Rolling blackouts across ${NATION[N.code].name}.`, [N.code], { loc: N.capital });
      // military production: each site works on as many orders as it has lines; the rest wait.
      // Backlogged orders are paid for when work starts.
      const lineUse = {};
      for (const q of N.queue) {
        const r = s.regions[q.region]; const T = UNITS[q.type];
        if (r.owner !== N.code) { q.dead = true; continue; }
        const sea = T.domain === 'sea';
        const key = q.region + (sea ? 's' : 'l');
        lineUse[key] ||= 0;
        if (lineUse[key] >= this.lines(r, sea)) { q.status = 'queued'; continue; }
        lineUse[key]++;
        if (q.paid === false) {
          if (N.money >= T.cost && N.manpower >= T.man) { N.money -= T.cost; N.manpower -= T.man; q.paid = true; }
          else { q.status = 'funds'; continue; }
        }
        q.status = 'building';
        const lvl = sea ? r.port : r.industry;
        q.left -= (0.5 + 0.25 * lvl) * (0.4 + 0.6 * st.eF) * (1 + m.prod);
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
        if (N.code === s.player) this.emit('build', `${T.name} commissioned at ${this.w.regions[q.region].name}.`, [N.code], { loc });
      }
      // training
      for (const u of s.units) {
        if (u.nation !== N.code || !u.train || u.move || u.air?.phase && u.air.phase !== 'base') continue;
        const r = s.regions[u.loc]; if (!r || r.sea || r.owner !== N.code) continue;
        let gx = 0; const g = u.group && s.groups.find(x => x.id === u.group); const gen = g && s.chars[g.general];
        if (gen) gx = gen.traits.includes('Inspiring') ? 0.6 : 0;
        u.xp = Math.min(100, (u.xp || 0) + 0.7 * (1 + m.xp + gx) * (1 + 0.7 * (r.academy || 0)));
        u.hp = Math.min(u.mhp, u.hp + u.mhp * 0.02);
      }
      // research
      this.researchDaily(N);
      // warheads
      const fac = s.regions.reduce((a, r) => a + (r.owner === N.code ? r.nuclear || 0 : 0), 0);
      if (fac && N.techs.nuc2 && N.gov.laws.nuclear !== 'disarm') {
        N.warheadProg += fac / 40;
        if (N.warheadProg >= 1 && N.money > 400) { N.warheadProg -= 1; N.money -= 300; N.warheads++; if (N.code === s.player) this.emit('build', 'A new nuclear warhead has entered the arsenal.', [N.code]); }
      }
      politicsDaily(this, N);
    }
    // player narrative events
    const P = s.nations[s.player];
    if (P.alive && !s.pendingEvent && s.t >= s.nextEventAt) {
      s.nextEventAt = s.t + Math.round(rnd(16, 34)) * 24;
      const ev = rollEvent(this, P);
      if (ev) { s.pendingEvent = ev; for (const f of this.listeners) f({ kind: 'rp', ev }); }
    }
    if (P.alive && (!P.gov.candidatesAt || s.t - P.gov.candidatesAt > 24 * 60)) refreshCandidates(s, P);
    let fs = 0, fd = 0, es = 0, ed = 0;
    for (const N of Object.values(s.nations)) { if (!N.alive) continue; const st = N.st; if (st.foodProd > st.foodCons) fs += st.foodProd - st.foodCons; else fd += st.foodCons - st.foodProd; if (st.eProd > st.eCons) es += st.eProd - st.eCons; else ed += st.eCons - st.eProd; }
    s.prices.food = clamp(ECON.basePrice.food * Math.pow((fd + 50) / (fs + 50), 0.5), ECON.basePrice.food * 0.3, ECON.basePrice.food * 5);
    s.prices.energy = clamp(ECON.basePrice.energy * Math.pow((ed + 50) / (es + 50), 0.5), ECON.basePrice.energy * 0.3, ECON.basePrice.energy * 5);
    if (s.t % (24 * 7) === 0) this.snapshot();
    this.checkVictory();
  }

  researchDaily(N) {
    const R = N.research;
    if (!R.cur || N.techs[R.cur]) {
      R.cur = null;
      while (R.queue.length && !R.cur) { const id = R.queue.shift(); if (!N.techs[id] && TECH[id].req.every(q => N.techs[q])) R.cur = id; }
      if (!R.cur && (N.ai || N.directives.science !== 'off')) R.cur = pickTech(N, N.ai ? null : N.directives.science);
    }
    R.prog += N.st.rp;
    if (R.cur && R.prog >= TECH[R.cur].cost) {
      R.prog -= TECH[R.cur].cost;
      N.techs[R.cur] = 1;
      if (N.code === this.s.player) this.emit('tech', `Research complete: ${TECH[R.cur].name}. ${TECH[R.cur].desc}`, [N.code]);
      else if (['cmp4', 'nuc2', 'cmp6', 'en6'].includes(R.cur)) this.emit('tech', `${NATION[N.code].name} has achieved ${TECH[R.cur].name}.`, [N.code], { major: true });
      R.cur = null;
      computeMods(this.s, N);
    }
    if (!R.cur) R.prog = Math.min(R.prog, 2000);
  }

  snapshot() {
    const s = this.s; const row = { t: s.t, gdp: {}, mil: {} };
    for (const N of Object.values(s.nations)) if (N.alive) row.gdp[N.code] = Math.round(N.st.income);
    for (const u of s.units) row.mil[u.nation] = (row.mil[u.nation] || 0) + 1;
    s.history.push(row); if (s.history.length > 260) s.history.shift();
  }
  worldShare(c) {
    let tot = 0, mine = 0;
    for (const N of Object.values(this.s.nations)) if (N.alive) { tot += N.st.income || 0; if (N.code === c) mine += N.st.income || 0; }
    return tot ? mine / tot : 0;
  }
  checkVictory() {
    const s = this.s; if (s.over) return;
    const P = s.nations[s.player];
    if (!P.alive) { s.over = true; s.winner = null; this.emit('war', 'Your government has fallen.', [s.player], { major: true }); return; }
    for (const N of Object.values(s.nations)) if (N.alive && this.worldShare(N.code) >= s.winShare) { s.over = true; s.winner = N.code; this.emit('war', `${NATION[N.code].name} has achieved global economic hegemony.`, [N.code], { major: true }); return; }
  }
  disbandWeakest(c) { const us = this.unitsOf(c).sort((a, b) => UNITS[b.type].upkeep - UNITS[a.type].upkeep); if (us.length > 1) this.removeUnit(us[0]); }

  // ---------------------------------------------------------------- construction & production
  canBuild(c, i, type) {
    const r = this.s.regions[i], B = BUILDINGS[type], R = this.w.regions[i], N = this.s.nations[c];
    if (r.owner !== c) return { ok: false, why: 'Not your territory.' };
    if (r.build) return { ok: false, why: 'Construction already under way here.' };
    if (B.tech && !has(N, B.tech)) return { ok: false, why: 'Requires research.' };
    const lvl = r[type] || 0;
    const max = B.max + (type === 'farm' ? N.mods?.farmMax || 0 : 0);
    if (lvl >= max) return { ok: false, why: 'Maximum level.' };
    if (B.needsOil && !r.hasOil) return { ok: false, why: 'No oil reserves in this region.' };
    if (B.coastal && !R.coastal) return { ok: false, why: 'Requires a coastline.' };
    if (r.capture) return { ok: false, why: 'Region is contested.' };
    const cost = Math.round(B.cost(lvl + 1) * (1 + (N.mods?.buildCost || 0)));
    if (N.money < cost) return { ok: false, why: `Need $${cost}M.`, cost };
    return { ok: true, cost, days: B.days(lvl + 1) };
  }
  build(c, i, type) {
    const chk = this.canBuild(c, i, type); if (!chk.ok) return chk;
    const r = this.s.regions[i];
    this.s.nations[c].money -= chk.cost;
    r.build = { type, level: (r[type] || 0) + 1, left: chk.days, total: chk.days };
    return chk;
  }
  lines(r, sea) { return sea ? (r.port || 0) : Math.max(1, Math.ceil((r.industry || 0) / 2)); }
  siteRate(c, r, sea) { const N = this.s.nations[c]; const lvl = sea ? r.port : r.industry; return (0.5 + 0.25 * lvl) * (0.4 + 0.6 * (N.st.eF ?? 1)) * (1 + (N.mods?.prod || 0)); }
  // production sites able to build a unit type
  sitesFor(c, type) { const sea = UNITS[type].domain === 'sea'; return this.regionsOf(c).filter(r => sea ? r.port > 0 : r.industry > 0); }
  // projected days until a site clears its current backlog for a production class
  siteBacklog(c, r, sea) {
    const N = this.s.nations[c];
    const work = N.queue.filter(q => q.region === r.i && (UNITS[q.type].domain === 'sea') === sea).reduce((a, q) => a + q.left, 0);
    return work / this.lines(r, sea) / this.siteRate(c, r, sea);
  }
  // Bulk order: spread `count` units over the sites that will finish them soonest.
  // opts: { region (force a site), near (prefer sites near a region), group, rally }
  orderUnits(c, type, count, opts = {}) {
    const T = UNITS[type], sea = T.domain === 'sea', N = this.s.nations[c];
    let sites = this.sitesFor(c, type);
    if (opts.region !== undefined && opts.region !== null) sites = sites.filter(r => r.i === opts.region);
    if (!sites.length) return { ok: false, why: sea ? 'You need a port to build warships.' : 'You need industry to build land and air units.' };
    const load = new Map(sites.map(r => [r.i, this.siteBacklog(c, r, sea)]));
    const per = {}; let eta = 0;
    for (let k = 0; k < count; k++) {
      let best = null, bt = Infinity;
      for (const r of sites) {
        let tt = load.get(r.i) + T.days / this.lines(r, sea) / this.siteRate(c, r, sea);
        if (opts.near !== undefined && opts.near !== null) tt += kmBetween(this.anchor(r.i), this.anchor(opts.near)) / 600;
        if (tt < bt) { bt = tt; best = r; }
      }
      load.set(best.i, load.get(best.i) + T.days / this.lines(best, sea) / this.siteRate(c, best, sea));
      eta = Math.max(eta, load.get(best.i));
      N.queue.push({ type, region: best.i, left: T.days, total: T.days, group: opts.group ?? null, rally: opts.rally ?? null, paid: false, status: 'queued' });
      per[best.i] = (per[best.i] || 0) + 1;
    }
    return { ok: true, per, eta: Math.ceil(eta), cost: T.cost * count, man: T.man * count };
  }
  cancelOrder(c, q) {
    const N = this.s.nations[c]; const k = N.queue.indexOf(q); if (k < 0) return;
    N.queue.splice(k, 1);
    if (q.paid !== false) { const T = UNITS[q.type]; N.money += Math.round(T.cost * 0.75); N.manpower += T.man; }
  }
  canRecruit(c, i, type) {
    const r = this.s.regions[i], T = UNITS[type], N = this.s.nations[c];
    if (r.owner !== c) return { ok: false, why: 'Not your territory.' };
    if (T.domain === 'sea') { if (!r.port) return { ok: false, why: 'Requires a port.' }; }
    else if (!r.industry) return { ok: false, why: 'Requires industry.' };
    const slots = T.domain === 'sea' ? r.port : Math.max(1, Math.ceil(r.industry / 2));
    const busy = N.queue.filter(q => q.region === i && (UNITS[q.type].domain === 'sea') === (T.domain === 'sea')).length;
    if (busy >= slots) return { ok: false, why: 'Production lines full.' };
    if (N.money < T.cost) return { ok: false, why: `Need $${T.cost}M.` };
    if (N.manpower < T.man) return { ok: false, why: `Need ${T.man}K manpower.` };
    return { ok: true };
  }
  recruit(c, i, type, group = null) {
    const chk = this.canRecruit(c, i, type); if (!chk.ok) return chk;
    const N = this.s.nations[c], T = UNITS[type];
    N.money -= T.cost; N.manpower -= T.man;
    N.queue.push({ type, region: i, left: T.days, total: T.days, group });
    return chk;
  }

  // ---------------------------------------------------------------- trade
  sanctioned(a, b) { return this.s.sanctions.some(x => (x.by === a && x.on === b) || (x.by === b && x.on === a)); }
  tradePath(a, b) {
    const w = this.w, s = this.s;
    return w.path(s.nations[a].capital, s.nations[b].capital, j => {
      if (w.regions[j].sea) return true;
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
      if (t.blockaded && !was) this.emit('trade', `${NATION[t.by].name} naval forces are blockading the ${t.good} route ${NATION[t.from].name} → ${NATION[t.to].name} in the ${w.regions[t.at].name}.`, [t.by, t.from, t.to], { loc: t.at });
      const ex = s.nations[t.from];
      const stock = t.good === 'food' ? ex.food : ex.energy;
      if (stock < t.amount * 3 && (t.good === 'food' ? ex.st.foodNet : ex.st.energyNet) < 0) t.amount = Math.max(0, t.amount * 0.8);
      if (t.amount < 1) this.cancelTrade(t.id);
    }
  }

  // ---------------------------------------------------------------- diplomacy
  warsOf(c) { const out = []; for (const k in this.s.rel) if (this.s.rel[k] === 'war') { const [a, b] = k.split('|'); if (a === c) out.push(b); else if (b === c) out.push(a); } return out; }
  alliesOf(c) { const out = []; for (const k in this.s.rel) if (this.s.rel[k] === 'alliance') { const [a, b] = k.split('|'); if (a === c) out.push(b); else if (b === c) out.push(a); } return out; }
  declareWar(a, b, quiet = false) {
    if (this.atWar(a, b) || a === b) return;
    const prev = this.rel(a, b);
    this.setRel(a, b, 'war');
    this.addOpinion(b, a, -60);
    for (const c of Object.keys(this.s.nations)) if (c !== a && c !== b) this.addOpinion(c, a, prev === 'alliance' || prev === 'nap' ? -20 : -6);
    this.s.trades = this.s.trades.filter(t => !((t.from === a && t.to === b) || (t.from === b && t.to === a)));
    if (!quiet) this.emit('war', `${NATION[a].name} declares war on ${NATION[b].name}${prev === 'nap' || prev === 'alliance' ? ', breaking their treaty' : ''}.`, [a, b], { loc: this.s.nations[b].capital, major: NATION[a].major || NATION[b].major });
    const callers = new Set([...this.alliesOf(b), ...this.s.guarantees.filter(g => g.of === b).map(g => g.by)]);
    for (const ally of callers) {
      if (ally === a || !this.s.nations[ally]?.alive || this.atWar(ally, a) || this.rel(ally, a) === 'alliance') continue;
      if (ally === this.s.player) { this.message(b, ally, `We are under attack by ${NATION[a].name}. We call on you to honour your commitment and join the war.`, { type: 'callToArms', against: a }); continue; }
      const guar = this.s.guarantees.some(g => g.by === ally && g.of === b);
      if (Math.random() < (guar ? 0.75 : NATION[ally].traits.loyalty * 0.8) + this.opinion(ally, b) / 300) {
        this.setRel(ally, a, 'war'); this.addOpinion(a, ally, -40);
        this.emit('war', `${NATION[ally].name} ${guar ? 'honours its guarantee' : 'honours its alliance'} and declares war on ${NATION[a].name}.`, [ally, a], { loc: this.s.nations[a].capital });
      }
    }
  }
  makePeace(a, b) {
    this.setRel(a, b, 'peace');
    this.emit('peace', `${NATION[a].name} and ${NATION[b].name} sign a peace treaty.`, [a, b], { loc: this.s.nations[b].capital });
    for (const u of [...this.s.units]) {
      if (UNITS[u.type].domain !== 'land') continue;
      const o = this.s.regions[u.loc].owner;
      if ((u.nation === a && o === b) || (u.nation === b && o === a)) { const p = this.planPath([u], this.s.nations[u.nation].capital); if (p.path) u.move = { path: p.path, seg: 0, prog: 0 }; else this.removeUnit(u); }
    }
  }
  message(from, to, text, proposal = null) {
    const m = { id: this.s.mid++, t: this.s.t, from, to, text, proposal, status: proposal ? 'pending' : null, unread: true };
    this.s.messages.push(m); if (this.s.messages.length > 400) this.s.messages.shift();
    if (to === this.s.player) for (const f of this.listeners) f({ kind: 'message', msg: m });
    return m;
  }

  // ---------------------------------------------------------------- interventions
  guarantee(by, of) {
    if (this.s.guarantees.some(g => g.by === by && g.of === of)) return { ok: false, why: 'Already guaranteed.' };
    this.s.guarantees.push({ by, of }); this.addOpinion(of, by, 20);
    this.emit('treaty', `${NATION[by].name} guarantees the independence of ${NATION[of].name}.`, [by, of]);
    return { ok: true };
  }
  militaryAid(by, to, amount) {
    const A = this.s.nations[by]; if (A.money < amount) return { ok: false, why: 'Insufficient funds.' };
    A.money -= amount; this.s.nations[to].money += amount; this.addOpinion(to, by, amount / 15);
    if (this.warsOf(to).length) this.s.nations[to].exhaustion = Math.max(0, this.s.nations[to].exhaustion - amount / 4000);
    this.emit('treaty', `${NATION[by].name} sends ${amount >= 1000 ? '$' + (amount / 1000).toFixed(1) + 'B' : '$' + amount + 'M'} in military aid to ${NATION[to].name}.`, [by, to]);
    return { ok: true };
  }
  mediate(by, a, b) {
    const s = this.s, A = s.nations[a], B = s.nations[b], m = s.nations[by].mods;
    const p = clamp(0.2 + (this.opinion(a, by) + this.opinion(b, by)) / 400 + (A.exhaustion + B.exhaustion) * 0.6 + (m.diplo || 0) * 0.5, 0.05, 0.9);
    if (Math.random() < p) { this.makePeace(a, b); this.addOpinion(a, by, 10); this.addOpinion(b, by, 10); for (const c of Object.keys(s.nations)) if (c !== by) this.addOpinion(c, by, 3); return { ok: true, why: `Talks succeed. ${NATION[a].name} and ${NATION[b].name} sign a peace treaty.` }; }
    this.addOpinion(a, by, -2); this.addOpinion(b, by, -2);
    return { ok: false, why: 'Talks collapse. Neither side is ready to stop fighting.' };
  }
  sanction(by, on, lift = false) {
    const s = this.s;
    if (lift) { s.sanctions = s.sanctions.filter(x => !(x.by === by && x.on === on)); this.addOpinion(on, by, 10); this.emit('treaty', `${NATION[by].name} lifts sanctions on ${NATION[on].name}.`, [by, on]); return { ok: true }; }
    if (s.sanctions.some(x => x.by === by && x.on === on)) return { ok: false, why: 'Already sanctioned.' };
    s.sanctions.push({ by, on }); this.addOpinion(on, by, -30);
    s.trades = s.trades.filter(t => !((t.from === by && t.to === on) || (t.from === on && t.to === by)));
    this.emit('treaty', `${NATION[by].name} imposes economic sanctions on ${NATION[on].name}.`, [by, on], { major: NATION[by].major && NATION[on].major });
    return { ok: true };
  }
  power(c) { let p = 0; for (const u of this.s.units) if (u.nation === c) p += this.strength(u); return p; }
  demand(by, from, i) {
    const s = this.s, r = s.regions[i];
    if (r.owner !== from) return { ok: false, why: 'They do not hold that region.' };
    if (s.nations[from].capital === i) return { ok: false, why: 'No government will surrender its capital.' };
    const ratio = this.power(by) / (this.power(from) + 1);
    const p = clamp((ratio - 2.5) / 4 + NATION[from].traits.caution * 0.2 - NATION[from].traits.aggression * 0.2, 0, 0.85);
    if (Math.random() < p) { this.transfer(r, by, true); this.addOpinion(from, by, -45); return { ok: true, why: `${NATION[from].name} yields ${this.w.regions[i].name} under pressure.` }; }
    this.addOpinion(from, by, -20);
    return { ok: false, why: `${NATION[from].name} rejects the ultimatum.` };
  }
  shareTech(by, to, id) {
    const T = this.s.nations[to]; if (T.techs[id]) return { ok: false, why: 'They already have it.' };
    if (!TECH[id].req.every(q => T.techs[q])) return { ok: false, why: 'They lack the prerequisites.' };
    T.techs[id] = 1; computeMods(this.s, T); this.addOpinion(to, by, 15);
    this.emit('treaty', `${NATION[by].name} shares ${TECH[id].name} technology with ${NATION[to].name}.`, [by, to]);
    return { ok: true };
  }

  // ---------------------------------------------------------------- covert operations
  covert(by, target, op) {
    const s = this.s, A = s.nations[by], B = s.nations[target];
    const COST = { steal: 150, sabotage: 200, unrest: 120, cyber: 250 };
    if (op === 'cyber' && !has(A, 'cyber')) return { ok: false, why: 'Requires Cyber Warfare research.' };
    const ck = target + ':' + op;
    if ((A.opCooldown[ck] || 0) > s.t) return { ok: false, why: `Assets are lying low for ${Math.ceil((A.opCooldown[ck] - s.t) / 24)} more days.` };
    if (A.money < COST[op]) return { ok: false, why: `Needs $${COST[op]}M.` };
    A.money -= COST[op]; A.opCooldown[ck] = s.t + 20 * 24;
    const p = clamp(0.42 + (A.mods.covert || 0) + (A.spyBonus || 0) - (B.mods.covert || 0) * 0.6, 0.08, 0.9);
    if (Math.random() > p) {
      this.addOpinion(target, by, -25);
      this.message(target, by, `Our counter-intelligence caught your operatives red-handed. This act of espionage will not be forgotten.`);
      return { ok: false, why: 'The operation was exposed.' };
    }
    if (op === 'steal') {
      const cand = Object.keys(B.techs).filter(id => !A.techs[id] && TECH[id].req.every(q => A.techs[q]));
      if (!cand.length) return { ok: true, why: 'Agents found nothing we do not already know.' };
      const id = cand[(Math.random() * cand.length) | 0]; A.techs[id] = 1; computeMods(s, A);
      return { ok: true, why: `Stolen: ${TECH[id].name}.` };
    }
    if (op === 'sabotage') {
      const r = this.regionsOf(target).sort((x, y) => (y.industry + y.power + y.nuclear * 3) - (x.industry + x.power + x.nuclear * 3))[0];
      const k = ['nuclear', 'industry', 'power', 'datacenter'].find(k => r[k] > 0);
      if (k) r[k]--; r.damage = clamp(r.damage + 0.15, 0, 0.85);
      return { ok: true, why: `Saboteurs struck ${this.w.regions[r.i].name}${k ? ', destroying a level of ' + BUILDINGS[k].name.toLowerCase() : ''}.` };
    }
    if (op === 'unrest') {
      for (const r of this.regionsOf(target)) r.unrest = clamp(r.unrest + 0.2, 0, 1);
      B.gov.stability = clamp(B.gov.stability - 0.08, 0, 1);
      return { ok: true, why: `Protests erupt across ${NATION[target].name}.` };
    }
    if (op === 'cyber') {
      B.cyberUntil = s.t + 15 * 24; B.energy *= 0.4;
      return { ok: true, why: `Power grids across ${NATION[target].name} go dark.` };
    }
  }

  // ---------------------------------------------------------------- nuclear weapons
  nukeCheck(by, i) {
    const s = this.s, A = s.nations[by], r = s.regions[i];
    if (!A.warheads) return { ok: false, why: 'No warheads in the arsenal.' };
    if (A.gov.laws.nuclear === 'disarm') return { ok: false, why: 'Your Disarmament law forbids nuclear use.' };
    if (!r || r.sea || !r.owner || !this.atWar(by, r.owner)) return { ok: false, why: 'Only regions of nations you are at war with.' };
    if (A.gov.laws.nuclear === 'nfu' && !s.nukedBy?.[by]) return { ok: false, why: 'Your No First Use posture forbids a first strike.' };
    const icbm = has(A, 'icbm');
    const target = this.anchor(i);
    const bomber = s.units.find(u => u.nation === by && u.type === 'BMB' && kmBetween(u.pos, target) <= UNITS.BMB.radius);
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
    s.defconUntil = s.t + 60 * 24;
    // interception
    const ic = (V.mods.intercept || 0) * (1 - (A.mods.pierce || 0));
    if (Math.random() < ic) {
      this.emit('nuke', `${NATION[by].name} launched a nuclear strike on ${w.regions[i].name}. ${NATION[victim].name} missile defenses INTERCEPTED it.`, [by, victim], { loc: i, major: true });
      this.retaliate(victim, by);
      return { ok: true, intercepted: true };
    }
    const yieldK = 1 + (A.mods.yield || 0);
    const shelter = V.mods.shelter || 0;
    const loss = Math.min(0.85, 0.35 * yieldK * (1 - shelter));
    const dead = r.pop * loss;
    r.pop -= dead;
    for (const k of ['city', 'industry', 'power', 'farm', 'port', 'fort', 'lab', 'datacenter', 'academy', 'nuclear', 'oil']) r[k] = Math.max(0, (r[k] || 0) - Math.round(2 * yieldK));
    r.damage = 0.95; r.unrest = 1; r.light = 0.02;
    for (const j of w.adj[i]) { const q = s.regions[j]; if (!q.sea) { q.damage = clamp(q.damage + 0.3, 0, 0.9); q.pop *= 0.96; q.unrest = clamp(q.unrest + 0.4, 0, 1); } }
    for (const u of [...s.units]) if (kmBetween(u.pos, target) < 280 * yieldK) { u.hp -= u.mhp * 0.9; if (u.hp <= 0) this.removeUnit(u); }
    s.scars.push({ lat: target[0], lon: target[1], r: 2.2 * yieldK });
    s.nukesUsed++;
    V.exhaustion = clamp(V.exhaustion + 0.3, 0, 1);
    A.gov.stability = clamp(A.gov.stability - (A.gov.type.match(/parliament|presidential|constmon/) ? 0.2 : 0.08), 0, 1);
    this.emit('nuke', `NUCLEAR DETONATION: ${NATION[by].name} destroyed ${w.regions[i].name}. An estimated ${dead.toFixed(1)} million dead.`, [by, victim], { loc: i, major: true });
    for (const c of Object.keys(s.nations)) if (NATION[c].major && c !== by && !this.friendly(c, by) && Math.random() < 0.6) this.sanction(c, by);
    this.retaliate(victim, by);
    return { ok: true, dead };
  }
  retaliate(victim, attacker) {
    const s = this.s;
    const responders = [victim, ...this.alliesOf(victim).filter(c => s.nations[c].warheads)];
    for (const c of responders) {
      const N = s.nations[c]; if (!N?.alive || !N.warheads || c === s.player) continue;
      const posture = N.gov.laws.nuclear;
      const p = c === victim ? ({ disarm: 0, nfu: 0.85, deterrence: 0.75, low: 1 }[posture] ?? 0.7) : 0.25;
      if (Math.random() >= p) continue;
      if (!this.atWar(c, attacker)) this.declareWar(c, attacker);
      const tgt = this.regionsOf(attacker).filter(r => s.nations[attacker].capital !== r.i || Math.random() < 0.5).sort((a, b) => b.pop - a.pop)[0];
      if (tgt) setTimeout(() => this.nuke(c, tgt.i), 0);
    }
    if (victim === s.player && s.nations[victim].warheads) this.message(attacker, victim, 'Our strike was a necessary measure. Any retaliation will be met with overwhelming force.');
  }
}

// AI / science-minister tech choice
export function pickTech(N, focus) {
  const av = available(N);
  if (!av.length) return null;
  const pref = { military: ['mil', 'nav', 'aer'], economy: ['agr', 'en', 'ind', 'soc'], ai: ['cmp'], nuclear: ['nuc', 'en', 'aer'], balanced: null }[focus || 'balanced'];
  const score = x => x.cost * (pref && !pref.includes(x.branch) ? 2.5 : 1) * (x.branch === 'nuc' && !focus ? 3 : 1) * (0.8 + Math.random() * 0.4);
  return av.sort((a, b) => score(a) - score(b))[0].id;
}

export { clamp, rnd, pkey, kmBetween };
export const isLand = t => LAND_TYPES.includes(t);
void haversine;
