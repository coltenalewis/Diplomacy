// AI order generation: strategic valuation + greedy plan + simulation-based local search.
import { adjudicate, buildCount, buildSites } from './engine.js';

const SPREAD = [1, 0.38, 0.14, 0.05, 0.02, 0.008];

// ctx: { power, hostility:{P:0..1.5}, banned:[ids], locked:{loc:order}, traits:{aggression,loyalty,caution}, allies:[P] }
export function valueMaps(map, state, ctx) {
  const P = ctx.power;
  const fall = state.season === 'F';
  const base = {};
  const unitAt = new Map(state.units.map(u => [u.loc, u]));
  const aggression = ctx.traits?.aggression ?? 0.5;
  const myCount = state.units.filter(u => u.power === P).length;
  for (const id of map.scIds) {
    const owner = state.sc[id];
    if (owner === P) {
      let threat = 0;
      for (const u of state.units) {
        if (u.power === P) continue;
        const h = ctx.hostility[u.power] ?? 1;
        if (h <= 0.2) continue;
        if (map.adjacent(u.type, u.loc, id)) threat += h;
      }
      base[id] = 3 + threat * (fall ? 6 : 3.5);
    } else if (!owner) {
      base[id] = (fall ? 10 : 8) * (0.8 + aggression * 0.4);
    } else {
      const h = ctx.hostility[owner] ?? 1;
      const occupied = unitAt.get(id);
      const defended = occupied && occupied.power === owner ? 0.75 : 1;
      base[id] = (fall ? 9 : 7) * h * defended * (0.7 + aggression * 0.6);
    }
  }
  const n = map.regions.length;
  const val = { A: new Float32Array(n), F: new Float32Array(n) };
  const DA = map.dist('A'), DF = map.dist('F'), DX = map.dist('X');
  const banned = new Set(ctx.banned || []);
  for (const r of map.regions) {
    let a = 0, f = 0;
    const row = r.i * n;
    for (const id of map.scIds) {
      const b = base[id]; if (!b) continue;
      if (banned.has(id)) continue;
      const k = map.byId[id].i;
      const da = Math.min(DA[row + k], DX[row + k] + 2);
      if (da < SPREAD.length) a += b * SPREAD[da];
      const df = DF[row + k];
      if (df < SPREAD.length) f += b * SPREAD[df];
    }
    val.A[r.i] = r.type === 'land' ? a : -99;
    val.F[r.i] = (r.type === 'sea' || r.coastal) ? f : -99;
  }
  // in fall, vacate unthreatened home centres when we expect to build there
  if (fall) {
    const expected = Object.values(state.sc).filter(o => o === P).length + map.scIds.filter(id => state.sc[id] !== P && state.units.some(u => u.power === P && map.adjacent(u.type, u.loc, id))).length * 0.3 - myCount;
    if (expected >= 1) for (const id of map.homes[P] || []) if (state.sc[id] === P && base[id] <= 3.5) { val.A[map.byId[id].i] -= 2.5; val.F[map.byId[id].i] -= 2.5; }
  }
  // tiny bonus for staying near home when the empire is small and home is empty
  if (myCount <= 2) for (const id of map.homes[P] || []) { val.A[map.byId[id].i] += 1; val.F[map.byId[id].i] += 1; }
  return { val, base };
}

const vOf = (map, val, type, id) => val[type][map.byId[id].i];

function optionsFor(map, u, ctx) {
  const banned = new Set(ctx.banned || []);
  return [u.loc, ...map.neighbors(u.type, u.loc).filter(d => !banned.has(d))];
}

// Greedy plan for one power.
export function heuristicOrders(map, state, ctx, vm, noise = 1, rng = Math.random, allyPlans = null) {
  const P = ctx.power;
  const my = state.units.filter(u => u.power === P);
  const unitAt = new Map(state.units.map(u => [u.loc, u]));
  const orders = {};
  const locked = ctx.locked || {};
  const cands = [];
  for (const u of my) {
    if (locked[u.loc]) { orders[u.loc] = locked[u.loc]; continue; }
    for (const d of optionsFor(map, u, ctx)) {
      let s = vOf(map, vm.val, u.type, d);
      const occ = unitAt.get(d);
      if (d !== u.loc && occ && occ.power !== P) s *= 0.75;
      if (d === u.loc) s += 0.3;
      s += noise * rng() * 1.5;
      cands.push({ u, d, s });
    }
  }
  cands.sort((a, b) => b.s - a.s);
  const taken = new Set(); const dest = new Map();
  for (const c of cands) {
    if (dest.has(c.u) || orders[c.u.loc]) continue;
    if (taken.has(c.d)) continue;
    // don't move into a square an own unit is staying in (we only know about already-assigned ones)
    const occ = unitAt.get(c.d);
    if (c.d !== c.u.loc && occ && occ.power === P && (!dest.has(occ) || dest.get(occ) === occ.loc)) continue;
    dest.set(c.u, c.d); taken.add(c.d);
  }
  for (const u of my) {
    if (orders[u.loc]) continue;
    let d = dest.get(u) || u.loc;
    // if we're blocked by own unit that stays, hold
    if (d !== u.loc) { const occ = unitAt.get(d); if (occ && occ.power === P && (dest.get(occ) || occ.loc) === occ.loc) d = u.loc; }
    orders[u.loc] = d === u.loc ? { type: 'H' } : { type: 'M', to: d };
  }
  addSupports(map, state, ctx, vm, orders, allyPlans);
  addConvoys(map, state, ctx, vm, orders);
  return orders;
}

// Convert idle or low-value units into supports for contested attacks / threatened holds.
function addSupports(map, state, ctx, vm, orders, allyPlans) {
  const P = ctx.power;
  const unitAt = new Map(state.units.map(u => [u.loc, u]));
  const my = state.units.filter(u => u.power === P);
  const threatTo = id => state.units.some(e => e.power !== P && (ctx.hostility[e.power] ?? 1) > 0.2 && map.adjacent(e.type, e.loc, id));
  const moves = my.filter(u => orders[u.loc]?.type === 'M').map(u => ({ u, to: orders[u.loc].to }));
  const supCount = new Map();
  for (const u of my) {
    const o = orders[u.loc];
    if (!o || o.type !== 'H' || (ctx.locked || {})[u.loc]) continue;
    // keep a unit on its own threatened SC in fall
    if (state.season === 'F' && state.sc[u.loc] === P && threatTo(u.loc)) continue;
    let best = null, bestS = 0.5;
    for (const m of moves) {
      if (!map.adjacent(u.type, u.loc, m.to)) continue;
      const occ = unitAt.get(m.to);
      const contested = (occ && occ.power !== P) || threatTo(m.to);
      if (!contested) continue;
      const s = vOf(map, vm.val, m.u.type, m.to) - (supCount.get(m.to) || 0) * 3;
      if (s > bestS) { bestS = s; best = { type: 'S', from: m.u.loc, to: m.to }; }
    }
    // support a threatened neighbour that holds
    for (const v of my) {
      if (v === u || orders[v.loc]?.type === 'M') continue;
      if (!map.adjacent(u.type, u.loc, v.loc) || !threatTo(v.loc)) continue;
      const s = (state.sc[v.loc] ? 6 : 2) - (supCount.get(v.loc) || 0) * 3;
      if (s > bestS) { bestS = s; best = { type: 'S', from: v.loc, to: v.loc }; }
    }
    // support an ally's planned attack
    if (allyPlans) for (const [loc, ao] of Object.entries(allyPlans)) {
      if (ao.type !== 'M' || !map.adjacent(u.type, u.loc, ao.to)) continue;
      const occ = unitAt.get(ao.to);
      if (!occ || occ.power === P || (ctx.hostility[occ.power] ?? 1) < 0.8) continue;
      const s = 3 + (ctx.hostility[occ.power] ?? 1) * 2;
      if (s > bestS) { bestS = s; best = { type: 'S', from: loc, to: ao.to }; }
    }
    if (best) { orders[u.loc] = best; supCount.set(best.to, (supCount.get(best.to) || 0) + 1); }
  }
}

// Single-fleet convoys for idle armies that can reach better coastal targets.
function addConvoys(map, state, ctx, vm, orders) {
  const P = ctx.power;
  const banned = new Set(ctx.banned || []);
  const occ = new Set(state.units.map(u => u.loc));
  const targets = new Set(Object.values(orders).filter(o => o.type === 'M').map(o => o.to));
  for (const a of state.units) {
    if (a.power !== P || a.type !== 'A' || orders[a.loc]?.type !== 'H' || !map.byId[a.loc].coastal) continue;
    if ((ctx.locked || {})[a.loc]) continue;
    const here = vOf(map, vm.val, 'A', a.loc);
    let best = null, bestS = here + 2;
    for (const f of state.units) {
      if (f.power !== P || f.type !== 'F' || !map.isSea(f.loc) || !map.byId[f.loc].adj.includes(a.loc)) continue;
      if (orders[f.loc]?.type === 'S' || (ctx.locked || {})[f.loc]) continue;
      for (const t of map.byId[f.loc].adj) {
        if (t === a.loc || map.isSea(t) || banned.has(t) || targets.has(t)) continue;
        if (occ.has(t) && state.units.find(u => u.loc === t).power === P) continue;
        const s = vOf(map, vm.val, 'A', t);
        if (s > bestS) { bestS = s; best = { f, t }; }
      }
    }
    if (best) {
      orders[a.loc] = { type: 'M', to: best.t, convoy: true };
      orders[best.f.loc] = { type: 'C', from: a.loc, to: best.t };
      targets.add(best.t);
    }
  }
}

// "Worst case" opponents: hostile units adjacent to our SCs/units attack them.
function aggressiveVariant(map, state, P, predicted, hostilityOf, rng) {
  const out = { ...predicted };
  const mine = new Set([...state.units.filter(u => u.power === P).map(u => u.loc), ...Object.keys(state.sc).filter(k => state.sc[k] === P)]);
  for (const u of state.units) {
    if (u.power === P || (hostilityOf(u.power) ?? 1) < 0.3) continue;
    const tgts = map.neighbors(u.type, u.loc).filter(d => mine.has(d));
    if (tgts.length && rng() < 0.7) out[u.loc] = { type: 'M', to: tgts[(rng() * tgts.length) | 0] };
  }
  return out;
}

function scoreOutcome(map, state, P, ctx, vm, res) {
  const fall = state.season === 'F';
  let s = 0;
  const after = new Map();
  const disl = new Set(res.dislodged.map(d => d.unit.loc));
  for (const o of res.orders) {
    if (disl.has(o.loc)) continue;
    const loc = res.moved[o.loc] || o.loc;
    after.set(loc, o.unit);
  }
  for (const o of res.orders) {
    if (o.power !== P) continue;
    if (disl.has(o.loc)) { s -= fall ? 7 : 9; continue; }
    const loc = res.moved[o.loc] || o.loc;
    s += 0.35 * vm.val[o.unit.type][map.byId[loc].i];
  }
  for (const d of res.dislodged) if (d.byPower === P && d.unit.power !== P) s += 2.5 * (ctx.hostility[d.unit.power] ?? 1);
  for (const id of map.scIds) {
    const owner = state.sc[id];
    const occ = after.get(id);
    if (!occ) continue;
    if (occ.power === P && owner !== P) s += fall ? 12 : 4;
    else if (owner === P && occ.power !== P) s -= fall ? 13 : 5;
  }
  return s;
}

function mutate(map, state, ctx, vm, orders, my, rng, allyPlans) {
  const out = { ...orders };
  const free = my.filter(u => !(ctx.locked || {})[u.loc]);
  if (!free.length) return out;
  const u = free[(rng() * free.length) | 0];
  const r = rng();
  const opts = optionsFor(map, u, ctx);
  if (r < 0.45) {
    // move / hold weighted by value
    const ws = opts.map(d => Math.max(0.2, vOf(map, vm.val, u.type, d) + 1));
    let t = rng() * ws.reduce((a, b) => a + b, 0), k = 0;
    while (t > ws[k] && k < ws.length - 1) { t -= ws[k]; k++; }
    out[u.loc] = opts[k] === u.loc ? { type: 'H' } : { type: 'M', to: opts[k] };
  } else if (r < 0.8) {
    // support a friendly unit (own or allied)
    const choices = [];
    for (const v of my) {
      if (v === u) continue;
      const o = out[v.loc];
      if (o?.type === 'M' && o.to !== u.loc && map.adjacent(u.type, u.loc, o.to)) choices.push({ type: 'S', from: v.loc, to: o.to });
      if (o?.type !== 'M' && map.adjacent(u.type, u.loc, v.loc)) choices.push({ type: 'S', from: v.loc, to: v.loc });
    }
    if (allyPlans) for (const [loc, ao] of Object.entries(allyPlans)) if (ao.type === 'M' && ao.to !== u.loc && map.adjacent(u.type, u.loc, ao.to)) choices.push({ type: 'S', from: loc, to: ao.to });
    if (choices.length) out[u.loc] = choices[(rng() * choices.length) | 0];
  } else {
    // coordinated pair: u attacks X, a neighbour supports
    const d = opts[(rng() * opts.length) | 0];
    if (d !== u.loc) {
      out[u.loc] = { type: 'M', to: d };
      const helpers = my.filter(v => v !== u && v.loc !== d && map.adjacent(v.type, v.loc, d) && !(ctx.locked || {})[v.loc]);
      if (helpers.length) { const h = helpers[(rng() * helpers.length) | 0]; out[h.loc] = { type: 'S', from: u.loc, to: d }; }
    }
  }
  return out;
}

// Full AI move planning for one power.
// predicted: {loc: order} for every unit on the board (other powers' expected orders)
export function planOrders(map, state, ctx, vm, predicted, opts = {}, rng = Math.random) {
  const P = ctx.power;
  const my = state.units.filter(u => u.power === P);
  if (!my.length) return {};
  const noise = opts.noise ?? 1;
  let best = heuristicOrders(map, state, ctx, vm, noise, rng, opts.allyPlans);
  const iters = (opts.search ?? 0) * my.length;
  if (!iters) return best;

  // only simulate units near our forces
  const DX = map.dist('X'); const n = map.regions.length;
  const near = state.units.filter(u => u.power === P || my.some(m => DX[map.byId[m.loc].i * n + map.byId[u.loc].i] <= 3));
  const hostilityOf = p => ctx.hostility[p];
  const scen = [predicted];
  for (let k = 1; k < (opts.scenarios ?? 2); k++) scen.push(aggressiveVariant(map, state, P, predicted, hostilityOf, rng));
  const caution = ctx.traits?.caution ?? 0.5;
  const evaluate = mine => {
    let sum = 0, min = Infinity;
    for (const sc of scen) {
      const merged = { ...sc, ...mine };
      const res = adjudicate(map, near, merged);
      const v = scoreOutcome(map, state, P, ctx, vm, res);
      sum += v; if (v < min) min = v;
    }
    return (1 - caution * 0.6) * (sum / scen.length) + caution * 0.6 * min;
  };
  let bestScore = evaluate(best);
  // also try a pure-hold baseline and a fresh noisy plan as restarts
  for (const alt of [heuristicOrders(map, state, ctx, vm, noise + 1.5, rng, opts.allyPlans)]) {
    const s = evaluate(alt); if (s > bestScore) { best = alt; bestScore = s; }
  }
  for (let it = 0; it < iters; it++) {
    let cand = mutate(map, state, ctx, vm, best, my, rng, opts.allyPlans);
    if (rng() < 0.3) cand = mutate(map, state, ctx, vm, cand, my, rng, opts.allyPlans);
    const s = evaluate(cand);
    if (s >= bestScore) { best = cand; bestScore = s; }
  }
  return best;
}

export function planRetreats(map, state, ctx, vm) {
  const out = {};
  const used = new Set();
  for (const d of state.dislodged) {
    if (d.unit.power !== ctx.power) continue;
    let best = null, bs = -Infinity;
    for (const o of d.options) {
      if (used.has(o)) continue;
      const s = vOf(map, vm.val, d.unit.type, o);
      if (s > bs) { bs = s; best = o; }
    }
    // disband if we are over the limit anyway
    out[d.unit.id] = best;
    if (best) used.add(best);
  }
  return out;
}

export function planBuilds(map, state, ctx, vm) {
  const P = ctx.power;
  const n = buildCount(state, P);
  if (n > 0) {
    const sites = buildSites(map, state, P);
    const fleets = state.units.filter(u => u.power === P && u.type === 'F').length;
    const armies = state.units.filter(u => u.power === P && u.type === 'A').length;
    const scored = sites.map(id => {
      const r = map.byId[id];
      const nbA = map.armyAdj[id].reduce((s, x) => s + vOf(map, vm.val, 'A', x), 0) / Math.max(1, map.armyAdj[id].length);
      const nbF = r.coastal ? map.fleetAdj[id].reduce((s, x) => s + vOf(map, vm.val, 'F', x), 0) / Math.max(1, map.fleetAdj[id].length) : -99;
      let a = vOf(map, vm.val, 'A', id) + nbA, f = r.coastal ? vOf(map, vm.val, 'F', id) + nbF : -99;
      if (!map.armyAdj[id].length) a -= 50; // island: armies are stuck
      // keep a sensible mix
      if (fleets > armies * 1.5) f -= 3; if (armies > fleets * 2.5 && r.coastal) a -= 3;
      return { id, type: f > a ? 'F' : 'A', s: Math.max(a, f) };
    }).sort((x, y) => y.s - x.s);
    return { builds: scored.slice(0, n).map(x => ({ loc: x.id, type: x.type })), disbands: [] };
  }
  if (n < 0) return { builds: [], disbands: chooseDisbands(map, state, ctx, vm, -n, []) };
  return { builds: [], disbands: [] };
}

export function chooseDisbands(map, state, ctx, vm, k, already = []) {
  return state.units.filter(u => u.power === ctx.power && !already.includes(u.loc))
    .map(u => ({ loc: u.loc, s: vOf(map, vm.val, u.type, u.loc) + (state.sc[u.loc] === ctx.power ? 4 : 0) }))
    .sort((a, b) => a.s - b.s).slice(0, k).map(x => x.loc);
}
