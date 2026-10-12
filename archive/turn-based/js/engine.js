// Rules engine: map graph, order validation, adjudication, phase processing.
// Pure logic (no DOM) so it can run in the main thread, a Web Worker or Node.

export class WorldMap {
  constructor(json) {
    this.regions = json.regions.map((r, i) => ({ ...r, i, path: undefined }));
    this.byId = {};
    this.regions.forEach(r => { this.byId[r.id] = r; });
    this.ids = this.regions.map(r => r.id);
    this.W = json.W; this.H = json.H;
    const isSea = id => this.byId[id].type === 'sea';
    this.armyAdj = {}; this.fleetAdj = {};
    for (const r of this.regions) {
      this.armyAdj[r.id] = r.type === 'land' ? r.adj.filter(n => !isSea(n)) : [];
      const fa = [];
      if (r.type === 'sea') {
        for (const n of r.adj) if (isSea(n) || this.byId[n].coastal) fa.push(n);
      } else if (r.coastal) {
        const mySeas = new Set(r.adj.filter(isSea));
        for (const n of r.adj) {
          if (isSea(n)) fa.push(n);
          else if (this.byId[n].coastal && this.byId[n].adj.some(s => isSea(s) && mySeas.has(s))) fa.push(n);
        }
      }
      this.fleetAdj[r.id] = fa;
    }
    this.scIds = this.regions.filter(r => r.sc).map(r => r.id);
    this.homes = {};
    for (const r of this.regions) if (r.home) (this.homes[r.home] ||= []).push(r.id);
    this._dist = null;
  }
  isSea(id) { return this.byId[id].type === 'sea'; }
  adjacent(type, from, to) { return (type === 'A' ? this.armyAdj : this.fleetAdj)[from].includes(to); }
  neighbors(type, from) { return (type === 'A' ? this.armyAdj : this.fleetAdj)[from]; }
  canOccupy(type, id) { const r = this.byId[id]; return type === 'A' ? r.type === 'land' : (r.type === 'sea' || r.coastal); }

  // hop distances: 'A' army graph, 'F' fleet graph, 'X' mixed (armies may be shipped: land+sea edges)
  dist(kind) {
    if (!this._dist) this._dist = {};
    if (this._dist[kind]) return this._dist[kind];
    const n = this.regions.length, D = new Uint8Array(n * n).fill(255);
    const nb = id => kind === 'A' ? this.armyAdj[id] : kind === 'F' ? this.fleetAdj[id] : this.byId[id].adj;
    for (let s = 0; s < n; s++) {
      const q = [s]; D[s * n + s] = 0;
      for (let h = 0; h < q.length; h++) {
        const c = q[h], d = D[s * n + c];
        if (d >= 250) continue;
        for (const nid of nb(this.ids[c])) { const k = this.byId[nid].i; if (D[s * n + k] === 255) { D[s * n + k] = d + 1; q.push(k); } }
      }
    }
    this._dist[kind] = D;
    return D;
  }
  d(kind, a, b) { const n = this.regions.length; return this.dist(kind)[this.byId[a].i * n + this.byId[b].i]; }
}

// ---------------------------------------------------------------- orders
// order: { type:'H'|'M'|'S'|'C', to, from, convoy }
// returns a normalized valid order (invalid -> hold)
export function normalizeOrder(map, unit, o, unitAt) {
  if (!o) return { type: 'H' };
  if (o.type === 'M') {
    if (!o.to || o.to === unit.loc) return { type: 'H' };
    if (!map.canOccupy(unit.type, o.to)) return { type: 'H' };
    const adj = map.adjacent(unit.type, unit.loc, o.to);
    if (unit.type === 'A' && map.byId[unit.loc].coastal && map.byId[o.to].coastal && (o.convoy || !adj))
      return { type: 'M', to: o.to, convoy: true };
    if (adj) return { type: 'M', to: o.to, convoy: false };
    return { type: 'H' };
  }
  if (o.type === 'S') {
    const target = unitAt.get(o.from);
    if (!target || o.from === unit.loc) return { type: 'H' };
    const to = o.to || o.from;
    if (to === unit.loc) return { type: 'H' };
    if (!map.adjacent(unit.type, unit.loc, to)) return { type: 'H' };
    if (!map.canOccupy(target.type, to)) return { type: 'H' };
    return { type: 'S', from: o.from, to };
  }
  if (o.type === 'C') {
    if (unit.type !== 'F' || !map.isSea(unit.loc)) return { type: 'H' };
    const army = unitAt.get(o.from);
    if (!army || army.type !== 'A' || !o.to || !map.byId[o.to].coastal || map.isSea(o.to)) return { type: 'H' };
    return { type: 'C', from: o.from, to: o.to };
  }
  return { type: 'H' };
}

// ---------------------------------------------------------------- adjudicator
// units: [{power,type,loc}], orders: {loc: order}
// returns { orders:[{...order, unit, loc, power, ok}], dislodged:[{unit, by}], contested:Set, moved:{fromLoc: toLoc} }
export function adjudicate(map, units, orders) {
  const unitAt = new Map(units.map(u => [u.loc, u]));
  const O = units.map((u, idx) => ({ ...normalizeOrder(map, u, orders[u.loc], unitAt), unit: u, loc: u.loc, power: u.power, idx }));
  const ordAt = new Map(O.map(o => [o.loc, o]));
  const movesTo = new Map();
  for (const o of O) if (o.type === 'M') { if (!movesTo.has(o.to)) movesTo.set(o.to, []); movesTo.get(o.to).push(o); }
  const supportsOf = new Map(); // key loc -> supports targeting that unit
  for (const o of O) if (o.type === 'S') { if (!supportsOf.has(o.from)) supportsOf.set(o.from, []); supportsOf.get(o.from).push(o); }
  const convoysOf = new Map();
  for (const o of O) if (o.type === 'C') { const k = o.from + '>' + o.to; if (!convoysOf.has(k)) convoysOf.set(k, []); convoysOf.get(k).push(o); }

  const n = O.length;
  const res = new Array(n).fill(false);
  const st = new Uint8Array(n); // 0 unresolved, 1 guessing, 2 resolved
  const dep = [];

  const h2h = o => {
    if (o.type !== 'M' || o.convoy) return null;
    const d = ordAt.get(o.to);
    return d && d.type === 'M' && !d.convoy && d.to === o.loc ? d : null;
  };
  const pathOK = o => {
    if (!o.convoy) return true;
    const fleets = convoysOf.get(o.loc + '>' + o.to);
    if (!fleets) return false;
    const usable = new Set();
    for (const f of fleets) if (resolve(f.idx)) usable.add(f.loc);
    // BFS from seas adjacent to origin over usable convoy fleets
    const start = map.byId[o.loc].adj.filter(s => usable.has(s));
    const seen = new Set(start); const q = [...start];
    while (q.length) {
      const s = q.pop();
      if (map.byId[s].adj.includes(o.to)) return true;
      for (const nx of map.byId[s].adj) if (usable.has(nx) && !seen.has(nx)) { seen.add(nx); q.push(nx); }
    }
    return false;
  };
  const supportCount = (o, exclPower) => {
    let c = 0;
    for (const s of supportsOf.get(o.loc) || []) {
      if (s.to !== (o.type === 'M' ? o.to : o.loc)) continue;
      if (o.type === 'M' ? false : s.to !== s.from) continue;
      if (exclPower && s.power === exclPower) continue;
      if (resolve(s.idx)) c++;
    }
    return c;
  };
  const holdStrength = loc => {
    const d = ordAt.get(loc);
    if (!d) return 0;
    if (d.type === 'M') return resolve(d.idx) ? 0 : 1;
    return 1 + supportCount(d);
  };
  const attackStrength = o => {
    if (!pathOK(o)) return 0;
    const d = ordAt.get(o.to);
    const opp = h2h(o);
    let away = false;
    if (d && d.type === 'M' && !opp) away = resolve(d.idx);
    if (!d || away) return 1 + supportCount(o);
    if (d.power === o.power) return 0;
    return 1 + supportCount(o, d.power);
  };
  const defendStrength = o => 1 + supportCount(o);
  const preventStrength = o => {
    if (!pathOK(o)) return 0;
    const opp = h2h(o);
    if (opp && resolve(opp.idx)) return 0;
    return 1 + supportCount(o);
  };

  function adj1(k) {
    const o = O[k];
    if (o.type === 'M') {
      if (!pathOK(o)) return false;
      const att = attackStrength(o);
      const opp = h2h(o);
      if (opp) { if (att <= defendStrength(opp)) return false; }
      else if (att <= holdStrength(o.to)) return false;
      for (const other of movesTo.get(o.to)) if (other !== o && att <= preventStrength(other)) return false;
      return true;
    }
    if (o.type === 'S') {
      for (const m of movesTo.get(o.loc) || []) {
        if (m.power === o.power) continue;
        if (o.from !== o.to && m.loc === o.to) { if (resolve(m.idx)) return false; continue; }
        if (m.convoy && !pathOK(m)) continue;
        return false;
      }
      for (const m of movesTo.get(o.loc) || []) if (resolve(m.idx)) return false;
      return true;
    }
    if (o.type === 'C') {
      for (const m of movesTo.get(o.loc) || []) if (resolve(m.idx)) return false;
      return true;
    }
    return true;
  }

  function backup(old) {
    const cyc = dep.splice(old);
    const convoyRelated = cyc.some(k => O[k].type === 'C' || (O[k].type === 'M' && O[k].convoy));
    for (const k of cyc) {
      const o = O[k];
      if (convoyRelated) {
        if (o.type === 'M' && o.convoy) { res[k] = false; st[k] = 2; } else st[k] = 0;
      } else {
        if (o.type === 'M') { res[k] = true; st[k] = 2; } else st[k] = 0;
      }
    }
    // safety: if nothing got resolved, force-resolve the cycle as failing
    if (!cyc.some(k => st[k] === 2)) for (const k of cyc) { res[k] = false; st[k] = 2; }
  }

  function resolve(k) {
    if (st[k] === 2) return res[k];
    if (st[k] === 1) { if (!dep.includes(k)) dep.push(k); return res[k]; }
    const old = dep.length;
    res[k] = false; st[k] = 1;
    const r1 = adj1(k);
    if (dep.length === old) { if (st[k] !== 2) { res[k] = r1; st[k] = 2; } return r1; }
    if (dep[old] !== k) { dep.push(k); res[k] = r1; return r1; }
    while (dep.length > old) st[dep.pop()] = 0;
    res[k] = true; st[k] = 1;
    const r2 = adj1(k);
    if (r1 === r2) {
      while (dep.length > old) st[dep.pop()] = 0;
      res[k] = r1; st[k] = 2; return r1;
    }
    backup(old);
    return resolve(k);
  }

  for (let k = 0; k < n; k++) resolve(k);

  const out = O.map(o => ({ ...o, ok: res[o.idx] }));
  const moved = {};
  for (const o of out) if (o.type === 'M' && o.ok) moved[o.loc] = o.to;
  const dislodged = [];
  for (const o of out) {
    if (moved[o.loc]) continue;
    const winner = (movesTo.get(o.loc) || []).find(m => res[m.idx]);
    if (winner) dislodged.push({ unit: o.unit, by: winner.loc, byConvoy: !!winner.convoy, byPower: winner.power });
  }
  const contested = new Set();
  for (const [to, ms] of movesTo) {
    if (ms.some(m => res[m.idx])) continue;
    if (ms.filter(m => pathOK(m)).length >= 2) contested.add(to);
  }
  return { orders: out, dislodged, contested, moved };
}

// ---------------------------------------------------------------- game state
export const SEASON_NAME = { S: 'SPRING', F: 'FALL', W: 'WINTER' };

export function newGame(map, opts = {}) {
  const units = []; const sc = {}; const control = {};
  let uid = 1;
  for (const r of map.regions) {
    if (r.sc) sc[r.id] = r.home || null;
    if (r.home) {
      control[r.id] = r.home;
      if (r.unit) units.push({ id: uid++, power: r.home, type: r.unit, loc: r.id });
    }
  }
  return {
    year: opts.startYear || 2030, season: 'S', phase: 'orders',
    units, sc, control, uid,
    dislodged: [], contested: [],
    winTarget: opts.winTarget || Math.floor(map.scIds.length / 2) + 1,
    winner: null, eliminated: [],
    lastResults: null, history: [],
  };
}

export const scCount = (state, p) => Object.values(state.sc).filter(o => o === p).length;
export const unitsOf = (state, p) => state.units.filter(u => u.power === p);

export function buildCount(state, p) { return scCount(state, p) - unitsOf(state, p).length; }

// legal build sites for power p
export function buildSites(map, state, p) {
  const occ = new Set(state.units.map(u => u.loc));
  return (map.homes[p] || []).filter(id => state.sc[id] === p && !occ.has(id));
}

export function retreatOptions(map, state, d, contested) {
  const occ = new Set(state.units.map(u => u.loc));
  return map.neighbors(d.unit.type, d.unit.loc).filter(n =>
    !occ.has(n) && !contested.has(n) && (n !== d.by || d.byConvoy));
}

// Apply movement orders. orders: {loc: order} for all powers.
export function processMovement(map, state, orders) {
  const r = adjudicate(map, state.units, orders);
  const dislodgedIds = new Set(r.dislodged.map(d => d.unit.id));
  const prevUnits = state.units.map(u => ({ ...u }));
  const units = state.units.filter(u => !dislodgedIds.has(u.id)).map(u => ({ ...u, loc: r.moved[u.loc] || u.loc }));
  const next = { ...state, units, control: { ...state.control } };
  for (const u of units) if (!map.isSea(u.loc)) next.control[u.loc] = u.power;
  next.dislodged = r.dislodged.map(d => ({ unit: { ...d.unit }, by: d.by, byConvoy: d.byConvoy, byPower: d.byPower }));
  next.dislodged.forEach(d => { d.options = retreatOptions(map, next, d, r.contested); });
  next.contested = [...r.contested];
  next.lastResults = { year: state.year, season: state.season, kind: 'moves', orders: r.orders.map(o => ({ power: o.power, type: o.type, utype: o.unit.type, loc: o.loc, to: o.to, from: o.from, convoy: o.convoy, ok: o.ok })), dislodged: next.dislodged.map(d => ({ power: d.unit.power, type: d.unit.type, loc: d.unit.loc, by: d.by })), prevUnits, prevSc: { ...state.sc } };
  next.history = [...state.history, next.lastResults].slice(-40);
  if (next.dislodged.length) { next.phase = 'retreats'; return next; }
  return afterMovementOrRetreat(map, next);
}

// retreats: {unitId: regionId|null}
export function processRetreats(map, state, retreats) {
  const want = {};
  for (const d of state.dislodged) {
    const t = retreats[d.unit.id];
    if (t && d.options.includes(t)) (want[t] ||= []).push(d);
  }
  const units = [...state.units];
  const log = [];
  for (const [to, ds] of Object.entries(want)) {
    if (ds.length === 1) { units.push({ ...ds[0].unit, loc: to }); log.push({ power: ds[0].unit.power, type: ds[0].unit.type, loc: ds[0].unit.loc, to, ok: true }); }
    else ds.forEach(d => log.push({ power: d.unit.power, type: d.unit.type, loc: d.unit.loc, to, ok: false }));
  }
  for (const d of state.dislodged) if (!retreats[d.unit.id] || !d.options.includes(retreats[d.unit.id])) log.push({ power: d.unit.power, type: d.unit.type, loc: d.unit.loc, to: null, ok: false });
  const next = { ...state, units, dislodged: [], contested: [], control: { ...state.control } };
  for (const u of units) if (!map.isSea(u.loc)) next.control[u.loc] = u.power;
  next.retreatLog = log;
  return afterMovementOrRetreat(map, next);
}

function afterMovementOrRetreat(map, state) {
  if (state.season === 'S') return { ...state, season: 'F', phase: 'orders' };
  // fall: update supply centres
  const sc = { ...state.sc };
  const changes = [];
  for (const u of state.units) if (u.loc in sc && sc[u.loc] !== u.power) { changes.push({ id: u.loc, from: sc[u.loc], to: u.power }); sc[u.loc] = u.power; }
  const next = { ...state, sc, scChanges: changes, season: 'W', phase: 'builds' };
  markEliminated(next);
  const top = Object.entries(countAll(next)).sort((a, b) => b[1] - a[1])[0];
  if (top && top[1] >= next.winTarget) next.winner = top[0];
  const powers = new Set([...Object.values(sc).filter(Boolean), ...next.units.map(u => u.power)]);
  const needs = [...powers].some(p => buildCount(next, p) !== 0 && (buildCount(next, p) < 0 || buildSites(map, next, p).length));
  if (!needs) return { ...next, season: 'S', phase: 'orders', year: next.year + 1 };
  return next;
}

export function countAll(state) {
  const c = {};
  for (const o of Object.values(state.sc)) if (o) c[o] = (c[o] || 0) + 1;
  return c;
}

function markEliminated(state) {
  const alive = new Set([...Object.values(state.sc).filter(Boolean), ...state.units.map(u => u.power)]);
  state.alive = [...alive];
}

// builds: {power: [{loc,type}]}, disbands: {power: [loc]}; powers missing required disbands get auto disbands via autoDisband(power, n)
export function processBuilds(map, state, builds, disbands, autoDisband) {
  let units = [...state.units];
  let uid = state.uid;
  const log = [];
  const powers = new Set([...Object.values(state.sc).filter(Boolean), ...units.map(u => u.power)]);
  for (const p of powers) {
    const n = buildCount(state, p);
    if (n > 0) {
      const sites = new Set(buildSites(map, state, p));
      let made = 0;
      for (const b of builds[p] || []) {
        if (made >= n || !sites.has(b.loc)) continue;
        if (b.type === 'F' && !map.byId[b.loc].coastal) continue;
        sites.delete(b.loc);
        units.push({ id: uid++, power: p, type: b.type, loc: b.loc }); made++;
        log.push({ power: p, kind: 'build', type: b.type, loc: b.loc });
      }
    } else if (n < 0) {
      let need = -n;
      const chosen = (disbands[p] || []).filter(l => units.some(u => u.loc === l && u.power === p)).slice(0, need);
      const extra = need - chosen.length > 0 ? autoDisband(p, need - chosen.length, chosen) : [];
      for (const l of [...chosen, ...extra]) {
        const u = units.find(x => x.loc === l && x.power === p);
        if (!u) continue;
        units = units.filter(x => x !== u);
        log.push({ power: p, kind: 'disband', type: u.type, loc: l });
      }
    }
  }
  return { ...state, units, uid, buildLog: log, season: 'S', phase: 'orders', year: state.year + 1 };
}
