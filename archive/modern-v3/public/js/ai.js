// AI commanders for every non-player nation, plus AI responses to player diplomacy.
import { UNITS, BUILDINGS, LAND_TYPES } from './config.js';
import { NATION } from './nations.js';
import { clamp, kmBetween } from './sim.js';

const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const pick = a => a[(Math.random() * a.length) | 0];
const wpick = (items, w) => { const t = w.reduce((a, b) => a + b, 0); let r = Math.random() * t; for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; };

export class AI {
  constructor(sim) { this.sim = sim; this.phase = {}; }

  hourly() {
    const s = this.sim.s;
    for (const N of Object.values(s.nations)) {
      if (!N.alive || !N.ai) continue;
      const h = this.phase[N.code] ??= hash(N.code);
      if ((h + s.t) % 12 === 0) this.think(N.code, (h + s.t) % (24 * 30) < 12);
    }
    const P = s.nations[s.player];
    if (P?.alive) {
      if (s.t % 12 === 6) this.runGroups(P.code);
      if (s.t % 24 === 18) this.delegate(P.code);
    }
    if (s.t % 24 === 12) this.dailyDiplomacy();
  }

  // ------------------------------------------------------------ helpers
  power(c) { let p = 0; for (const u of this.sim.s.units) if (u.nation === c) p += this.sim.strength(u); return p; }
  landPower(c) { let p = 0; for (const u of this.sim.s.units) if (u.nation === c && UNITS[u.type].domain === 'land') p += this.sim.strength(u); return p; }
  neighbours(c) {
    const { s, w } = this.sim; const out = new Map();
    for (const r of s.regions) {
      if (r.owner !== c) continue;
      for (const j of w.adj[r.i]) {
        const o = s.regions[j].owner;
        if (o && o !== c) out.set(o, (out.get(o) || 0) + 1);
        if (w.regions[j].sea) for (const k of w.adj[j]) { const o2 = s.regions[k].owner; if (o2 && o2 !== c && !out.has(o2)) out.set(o2, 0.3); }
      }
    }
    return out;
  }
  threatTo(c) {
    let t = 0;
    for (const [o] of this.neighbours(c)) { if (this.sim.atWar(c, o)) t += 2; else if (this.sim.opinion(c, o) < -20) t += 0.5; }
    return t;
  }

  think(c, strategic) {
    const sim = this.sim;
    if (!sim.s.nations[c].alive) return;
    this.economy(c);
    this.production(c);
    if (strategic) this.strategy(c);
    this.operations(c);
  }

  // ------------------------------------------------------------ economy
  economy(c, focus = null, reserveOverride = null) {
    const sim = this.sim, s = sim.s, N = s.nations[c], st = N.st;
    const reserve = reserveOverride ?? Math.max(80, st.upkeep * 15);
    if (N.money < reserve) return 0;
    const mine = sim.regionsOf(c);
    const active = mine.filter(r => r.build).length;
    const rich = Math.floor(N.money / Math.max(50, st.income * 25));
    if (active >= 1 + Math.floor(mine.length / 4) + Math.min(6, rich)) return;
    const free = mine.filter(r => !r.build && !r.capture);
    if (!free.length) return;
    let type = null, region = null;
    const best = (list, f) => list.reduce((a, b) => (f(b) > f(a) ? b : a), list[0]);
    const W = { industry: 3, city: 2, port: 1.5, farm: 1, power: 1, fort: 2, lab: 0.8, datacenter: 0.6, academy: 0.3 };
    if (focus === 'industry') W.industry = 9; if (focus === 'urban') W.city = 8; if (focus === 'research') { W.lab = 6; W.datacenter = 6; }
    if (focus === 'fortify') W.fort = 9; if (focus === 'food') W.farm = 9; if (focus === 'energy') W.power = 9;
    if (st.foodNet < 0 && N.food < st.foodCons * 60) {
      const cand = free.filter(r => r.farm < BUILDINGS.farm.max);
      if (cand.length) { type = 'farm'; region = best(cand, r => r.fert - r.farm * 0.05); }
    }
    if (!type && st.energyNet < 0 && N.energy < st.eCons * 40) {
      const oil = free.filter(r => r.hasOil && r.oil < BUILDINGS.oil.max);
      if (oil.length) { type = 'oil'; region = oil[0]; }
      else { const cand = free.filter(r => r.power < BUILDINGS.power.max); if (cand.length) { type = 'power'; region = best(cand, r => r.pop - r.power * 5); } }
    }
    if (!type) {
      const atWar = sim.warsOf(c).length > 0;
      const options = [];
      const ind = free.filter(r => r.industry < Math.min(BUILDINGS.industry.max, r.city + 1));
      if (ind.length) options.push(['industry', best(ind, r => r.pop - r.industry * 8), W.industry]);
      const city = free.filter(r => r.city < BUILDINGS.city.max && r.pop > 6 + r.city * 12);
      if (city.length) options.push(['city', best(city, r => r.pop), W.city]);
      const labs = free.filter(r => (r.lab || 0) < BUILDINGS.lab.max && r.city >= 2);
      if (labs.length && st.income > 15) options.push(['lab', best(labs, r => r.city - (r.lab || 0)), W.lab]);
      if (N.techs.cmp2) { const dc = free.filter(r => (r.datacenter || 0) < BUILDINGS.datacenter.max && r.power >= 2); if (dc.length && st.energyNet > 20) options.push(['datacenter', best(dc, r => r.power), W.datacenter]); }
      if (N.techs.soc6 && sim.warsOf(c).length) { const ac = free.filter(r => (r.academy || 0) < BUILDINGS.academy.max); if (ac.length) options.push(['academy', ac[0], W.academy]); }
      if (focus === 'food') { const f = free.filter(r => r.farm < BUILDINGS.farm.max + (N.mods.farmMax || 0)); if (f.length) options.push(['farm', best(f, r => r.fert), W.farm]); }
      if (focus === 'energy') { const p2 = free.filter(r => r.power < BUILDINGS.power.max); if (p2.length) options.push(['power', best(p2, r => r.pop), W.power]); const o2 = free.filter(r => r.hasOil && r.oil < BUILDINGS.oil.max); if (o2.length) options.push(['oil', o2[0], W.power]); }
      if (focus === 'fortify') { const b2 = free.filter(r => r.fort < BUILDINGS.fort.max && sim.w.adj[r.i].some(j => s.regions[j].owner && s.regions[j].owner !== c)); if (b2.length) options.push(['fort', b2[0], W.fort]); }
      if (!mine.some(r => r.port) || Math.random() < 0.1) { const pc = free.filter(r => sim.w.regions[r.i].coastal && r.port < BUILDINGS.port.max); if (pc.length) options.push(['port', best(pc, r => r.pop), 1.5]); }
      if (st.foodNet < st.foodCons * 0.1) { const f = free.filter(r => r.farm < BUILDINGS.farm.max); if (f.length) options.push(['farm', best(f, r => r.fert), 1]); }
      if (st.energyNet < st.eCons * 0.1) { const p = free.filter(r => r.power < BUILDINGS.power.max); if (p.length) options.push(['power', best(p, r => r.pop), 1]); }
      if (atWar) {
        const border = free.filter(r => r.fort < BUILDINGS.fort.max && sim.w.adj[r.i].some(j => s.regions[j].owner && sim.atWar(c, s.regions[j].owner)));
        if (border.length) options.push(['fort', border[0], W.fort]);
      }
      if (!options.length) return 0;
      const o = wpick(options, options.map(x => x[2]));
      type = o[0]; region = o[1];
    }
    if (type && region) { const chk = sim.canBuild(c, region.i, type); if (chk.ok && N.money - chk.cost >= reserve * 0.5) { sim.build(c, region.i, type); return chk.cost; } }
    return 0;
  }

  production(c, focus = null, reserveOverride = null) {
    const sim = this.sim, s = sim.s, N = s.nations[c], st = N.st, t = NATION[c].traits;
    const wars = sim.warsOf(c);
    const threat = this.threatTo(c);
    let target = st.income * (0.16 + 0.22 * t.aggression + (wars.length ? 0.3 : 0) + Math.min(0.25, threat * 0.05));
    if (focus === 'maintain') target = st.income * (0.2 + (wars.length ? 0.2 : 0));
    else if (focus === 'total') target = st.income * 0.65;
    else if (focus) target = st.income * 0.4;
    if (st.upkeep >= target || N.queue.length >= 2 + Math.floor(st.income / 60)) return;
    const mine = sim.regionsOf(c);
    const factories = mine.filter(r => r.industry > 0);
    const ports = mine.filter(r => r.port > 0);
    const myUnits = sim.unitsOf(c);
    const nav = myUnits.filter(u => UNITS[u.type].domain === 'sea').length;
    const land = myUnits.filter(u => UNITS[u.type].domain === 'land').length;
    const air = myUnits.filter(u => UNITS[u.type].domain === 'air').length;
    const trn = myUnits.filter(u => u.type === 'TRN').length;
    const overseasWar = wars.length && !wars.some(e => this.landFront(c, e));
    let domain = 'land';
    if (ports.length && (nav < land * 0.35 || (overseasWar && nav < land))) domain = 'sea';
    if (factories.some(r => r.industry >= 2) && air < land * 0.25 && Math.random() < 0.4) domain = 'air';
    if (focus === 'army') domain = 'land'; else if (focus === 'navy' && ports.length) domain = 'sea'; else if (focus === 'air') domain = 'air';
    let type, site;
    if (domain === 'land' && factories.length) {
      type = wpick(['INF', 'ARM', 'ART'], [0.5, st.income > 150 ? 0.35 : 0.15, 0.2]);
      site = this.nearFront(c, factories);
    } else if (domain === 'air' && factories.length) {
      type = Math.random() < 0.55 ? 'FTR' : 'BMB';
      site = this.nearFront(c, factories.filter(r => r.industry >= 2));
    } else if (domain === 'sea' && ports.length) {
      if (overseasWar && trn < 3) type = 'TRN';
      else type = wpick(['DES', 'SUB', 'CRU', 'CAR', 'TRN'], [0.35, 0.25, 0.2, st.income > 500 ? 0.1 : 0, trn < 2 ? 0.2 : 0.05]);
      site = pick(ports);
    }
    if (!type || !site) return;
    const T = UNITS[type];
    if (N.money < T.cost + (reserveOverride ?? Math.max(60, st.upkeep * 10))) return 0;
    return sim.recruit(c, site.i, type).ok ? T.cost : 0;
  }

  landFront(c, e) {
    const { s, w } = this.sim;
    for (const r of s.regions) if (r.owner === c) for (const j of w.adj[r.i]) if (s.regions[j].owner === e) return true;
    return false;
  }
  nearFront(c, list) {
    if (!list.length) return null;
    const { s, w } = this.sim;
    const wars = this.sim.warsOf(c);
    if (!wars.length) return list.reduce((a, b) => (b.industry > a.industry ? b : a));
    return list.reduce((a, b) => {
      const fa = w.adj[a.i].some(j => wars.includes(s.regions[j].owner)) ? 1 : 0;
      const fb = w.adj[b.i].some(j => wars.includes(s.regions[j].owner)) ? 1 : 0;
      return fb > fa || (fb === fa && b.industry > a.industry) ? b : a;
    });
  }

  // ------------------------------------------------------------ strategy
  strategy(c) {
    const sim = this.sim, s = sim.s, N = s.nations[c], t = NATION[c].traits;
    const wars = sim.warsOf(c);
    const myP = this.power(c) + N.st.income * 0.05;
    // wartime laws (AI governments simply decree them)
    if (wars.length && N.gov) { if (N.gov.laws.conscription === 'selective' && t.aggression > 0.35) N.gov.laws.conscription = 'draft'; if (N.exhaustion > 0.3 && N.gov.laws.tax !== 'war') N.gov.laws.tax = 'war'; }
    else if (N.gov) { if (N.gov.laws.conscription === 'draft' || N.gov.laws.conscription === 'total') N.gov.laws.conscription = 'selective'; if (N.gov.laws.tax === 'war') N.gov.laws.tax = 'standard'; }
    // nuclear desperation
    if (N.warheads && wars.length && N.gov && !['disarm', 'nfu'].includes(N.gov.laws.nuclear)) {
      const core = s.regions.filter(r => r.core === c), lost = core.filter(r => r.owner !== c).length;
      const desperate = lost / Math.max(1, core.length) > 0.35 || s.regions[N.capital].core !== c;
      if (desperate && t.aggression > 0.5 && Math.random() < 0.1) {
        const tg = s.regions.filter(r => !r.sea && wars.includes(r.owner)).sort((a, b) => (b.core === c ? 50 : 0) + b.pop - (a.core === c ? 50 : 0) - a.pop)[0];
        if (tg) sim.nuke(c, tg.i);
      }
    }
    // peace
    for (const e of wars) {
      const theirP = this.power(e) + s.nations[e].st.income * 0.05;
      if (N.exhaustion > 0.35 || myP < theirP * 0.55) this.seekPeace(c, e);
    }
    // war
    if (s.t > 24 * 45 && wars.length === 0 && N.exhaustion < 0.1 && Math.random() < t.aggression * (s.temper || 1) * 0.35) {
      let best = null, bs = 0;
      for (const [o, contact] of this.neighbours(c)) {
        const rel = sim.rel(c, o);
        if (rel === 'alliance' || rel === 'war' || !s.nations[o].alive) continue;
        const theirP = this.power(o) + s.nations[o].st.income * 0.05;
        let allyP = 0; for (const a of sim.alliesOf(o)) if (sim.rel(a, c) !== 'alliance') allyP += this.power(a) * 0.35;
        if (contact < 1 && !NATION[c].major) continue; // minor powers only fight neighbours
        const reach = contact < 1 ? 0.4 : 1;
        let sc = t.aggression * (s.temper || 1) * 1.4 * (myP / (theirP + allyP + 5)) * Math.min(1.5, contact * 0.35 + 0.3);
        sc *= reach;
        sc -= sim.alliesOf(o).length * 0.15;
        sc -= sim.opinion(c, o) / 45;
        if (rel === 'nap') sc -= 1.2 * t.loyalty;
        if (NATION[o].major && NATION[c].major) sc -= 0.6;
        if (o === s.player) sc -= 0.15;
        if (sc > bs) { bs = sc; best = o; }
      }
      if (best && bs > 2.2) sim.declareWar(c, best);
    }
    // treaties with AI neighbours
    for (const [o] of this.neighbours(c)) {
      if (o === s.player || !s.nations[o].alive) continue;
      const rel = sim.rel(c, o);
      if (rel === 'peace' && sim.opinion(c, o) > 25 && sim.opinion(o, c) > 25 && Math.random() < 0.3) {
        sim.setRel(c, o, 'nap');
        sim.emit('treaty', `${NATION[c].name} and ${NATION[o].name} sign a non-aggression pact.`, [c, o], { loc: s.nations[o].capital });
      } else if (rel === 'nap' && sim.opinion(c, o) > 55 && sim.opinion(o, c) > 55 && Math.random() < 0.15) {
        sim.setRel(c, o, 'alliance');
        sim.emit('treaty', `${NATION[c].name} and ${NATION[o].name} form a military alliance.`, [c, o], { loc: s.nations[o].capital });
      }
    }
  }

  seekPeace(c, e) {
    const sim = this.sim, s = sim.s;
    if (e === s.player) {
      if (!s.messages.some(m => m.from === c && m.status === 'pending' && m.proposal?.type === 'peace'))
        sim.message(c, e, pick(['This war has cost both our nations enough. We propose an immediate peace.', 'We are prepared to end hostilities. Do you accept a ceasefire?']), { type: 'peace' });
      return;
    }
    const E = s.nations[e];
    const myP = this.power(c), theirP = this.power(e);
    if (E.exhaustion > 0.25 || theirP < myP * 1.6 || Math.random() < 0.2) sim.makePeace(c, e);
  }

  // ------------------------------------------------------------ operations
  operations(c) {
    const sim = this.sim, s = sim.s, w = sim.w;
    const wars = sim.warsOf(c);
    const units = sim.unitsOf(c);
    const idle = units.filter(u => !u.move);
    const land = idle.filter(u => UNITS[u.type].domain === 'land' && !w.regions[u.loc].sea);
    const sea = idle.filter(u => UNITS[u.type].domain === 'sea');
    const air = idle.filter(u => UNITS[u.type].domain === 'air');
    const enemyStrAt = new Map(); const myAt = new Map();
    for (const u of s.units) {
      if (UNITS[u.type].domain !== 'land') continue;
      if (wars.includes(u.nation)) enemyStrAt.set(u.loc, (enemyStrAt.get(u.loc) || 0) + sim.strength(u));
      if (u.nation === c && !u.move) { if (!myAt.has(u.loc)) myAt.set(u.loc, []); myAt.get(u.loc).push(u); }
    }
    if (!wars.length) { this.peacetime(c, land, sea); return; }

    // ---- land offensives & defence
    const used = new Set();
    const targets = new Set();
    for (const [loc] of myAt) for (const j of w.adj[loc]) { const o = s.regions[j].owner; if (!w.regions[j].sea && wars.includes(o)) targets.add(j); }
    for (const r of s.regions) if (r.owner === c && enemyStrAt.get(r.i)) targets.add(r.i); // liberate own soil
    const scored = [...targets].map(j => {
      const r = s.regions[j];
      const def = (enemyStrAt.get(j) || 0) * (1 + 0.3 * (r.fort || 0)) + 0.5;
      const value = (r.pop || 0) * 0.05 + (r.industry || 0) + (r.owner === c ? 5 : 0) + (j === s.nations[r.owner]?.capital ? 4 : 0);
      return { j, def, value };
    }).sort((a, b) => b.value / b.def - a.value / a.def);
    for (const tg of scored) {
      const near = [];
      for (const k of [tg.j, ...w.adj[tg.j]]) for (const u of myAt.get(k) || []) if (!used.has(u.id) && UNITS[u.type].domain === 'land') near.push(u);
      const str = near.reduce((a, u) => a + sim.strength(u), 0);
      if (str > tg.def * 1.25 + 1) {
        const go = [];
        let acc = 0;
        for (const u of near.sort((a, b) => sim.strength(b) - sim.strength(a))) {
          if (acc > tg.def * 2 + 4) break;
          // leave a garrison where enemies are adjacent to our own soil
          const here = myAt.get(u.loc) || [];
          if (u.loc !== tg.j && s.regions[u.loc].owner === c && here.filter(x => !used.has(x.id)).length <= 1 && w.adj[u.loc].some(j => enemyStrAt.get(j))) continue;
          go.push(u); used.add(u.id); acc += sim.strength(u);
        }
        const movers = go.filter(u => u.loc !== tg.j).map(u => u.id);
        if (movers.length) sim.order(movers, tg.j);
      }
    }
    // reinforce the front with idle units deep in the interior
    const front = sim.regionsOf(c).filter(r => w.adj[r.i].some(j => wars.includes(s.regions[j].owner)));
    if (front.length) {
      for (const u of land) {
        if (used.has(u.id)) continue;
        if (front.some(f => f.i === u.loc)) continue;
        if ((myAt.get(u.loc) || []).length <= 1 && u.loc === s.nations[c].capital) continue;
        const f = front.reduce((a, b) => (w.within(u.loc, 6).get(b.i) ?? 99) < (w.within(u.loc, 6).get(a.i) ?? 99) ? b : a);
        if (Math.random() < 0.5) sim.order([u.id], f.i);
      }
    } else this.invasion(c, wars, land.filter(u => !used.has(u.id)));

    // ---- navy
    this.navy(c, wars, sea);
    // ---- air
    for (const u of air) {
      const T = UNITS[u.type];
      const inRange = [...w.within(u.loc, T.range).keys()];
      if (u.type === 'BMB') {
        const tgt = inRange.filter(j => !w.regions[j].sea && wars.includes(s.regions[j].owner)).sort((a, b) => (enemyStrAt.get(b) || 0) + s.regions[b].industry - (enemyStrAt.get(a) || 0) - s.regions[a].industry)[0];
        u.mission = tgt !== undefined ? { strike: tgt } : null;
      }
      if (u.type === 'FTR' || (u.type === 'BMB' && !u.mission)) {
        if (!front.length) continue;
        const f = front.find(r => r.i === u.loc) || front[0];
        if (f.i !== u.loc && Math.random() < 0.3) sim.order([u.id], f.i);
      }
    }
  }

  peacetime(c, land, sea) {
    const sim = this.sim, s = sim.s, w = sim.w;
    if ((s.t + (this.phase[c] || 0)) % 96 >= 12) return;
    // garrison the most exposed borders
    const nb = this.neighbours(c);
    const worried = [...nb.keys()].filter(o => sim.opinion(c, o) < -10 && sim.rel(c, o) !== 'alliance');
    const border = sim.regionsOf(c).filter(r => w.adj[r.i].some(j => worried.includes(s.regions[j].owner)));
    if (border.length) {
      const counts = new Map(); for (const u of land) counts.set(u.loc, (counts.get(u.loc) || 0) + 1);
      for (const u of land) {
        if (border.some(b => b.i === u.loc)) continue;
        if ((counts.get(u.loc) || 0) <= 1) continue;
        const b = border.reduce((a, x) => ((counts.get(x.i) || 0) < (counts.get(a.i) || 0) ? x : a));
        counts.set(u.loc, counts.get(u.loc) - 1); counts.set(b.i, (counts.get(b.i) || 0) + 1);
        sim.order([u.id], b.i);
      }
    }
    // keep fleets near home waters
    const home = sim.seaNear(s.nations[c].capital) >= 0 ? sim.seaNear(s.nations[c].capital) : sim.regionsOf(c).map(r => sim.seaNear(r.i)).find(x => x >= 0);
    if (home !== undefined && home >= 0) for (const u of sea) if ((w.within(u.loc, 3).get(home) ?? 9) > 2) sim.order([u.id], home);
  }

  invasion(c, wars, land) {
    const sim = this.sim, s = sim.s, w = sim.w;
    if (!land.length || Math.random() > 0.35) return;
    const lift = sim.sealift(c) - sim.embarked(c);
    if (lift < 2) return;
    // find closest enemy coastal region reachable by sea from a region where we have troops
    const byLoc = new Map(); for (const u of land) { if (!byLoc.has(u.loc)) byLoc.set(u.loc, []); byLoc.get(u.loc).push(u); }
    let best = null;
    for (const [loc, us] of byLoc) {
      if (!w.regions[loc].coastal || us.length < 2) continue;
      const near = w.within(loc, 5, j => w.regions[j].sea || wars.includes(s.regions[j].owner));
      for (const [j, d] of near) {
        if (w.regions[j].sea || !wars.includes(s.regions[j].owner)) continue;
        const def = s.units.filter(u => u.loc === j && wars.includes(u.nation)).reduce((a, u) => a + sim.strength(u), 0);
        const str = us.slice(0, lift).reduce((a, u) => a + sim.strength(u), 0);
        if (str < def * 1.5 + 2) continue;
        const sc = (s.regions[j].pop + 5) / (d + 1) / (def + 1);
        if (!best || sc > best.sc) best = { sc, j, us: us.slice(0, Math.min(lift, us.length - 1)) };
      }
    }
    if (best && best.us.length) {
      const r = sim.order(best.us.map(u => u.id), best.j);
      if (r.ok && s.regions[best.j].owner === s.player) sim.emit('war', `INTELLIGENCE: ${NATION[c].name} amphibious task force sighted, heading for ${w.regions[best.j].name}.`, [c, s.player], { loc: best.j });
    }
  }

  navy(c, wars, sea) {
    const sim = this.sim, s = sim.s, w = sim.w;
    if (!sea.length) return;
    const enemyNav = new Map();
    for (const u of s.units) if (UNITS[u.type].domain === 'sea' && wars.includes(u.nation)) enemyNav.set(u.loc, (enemyNav.get(u.loc) || 0) + sim.strength(u));
    const groups = new Map(); for (const u of sea) { if (u.type === 'TRN') continue; if (!groups.has(u.loc)) groups.set(u.loc, []); groups.get(u.loc).push(u); }
    for (const [loc, us] of groups) {
      const subs = us.filter(u => u.type === 'SUB'), surface = us.filter(u => u.type !== 'SUB');
      const reach = w.within(loc, 6, j => w.regions[j].sea);
      // subs raid enemy trade lanes
      if (subs.length) {
        const lanes = s.trades.filter(t => wars.includes(t.from) || wars.includes(t.to)).flatMap(t => t.path.filter(j => w.regions[j].sea && reach.has(j)));
        const tgt = lanes.length ? pick(lanes) : null;
        if (tgt !== null && tgt !== loc) sim.order(subs.map(u => u.id), tgt);
      }
      if (!surface.length) continue;
      const str = surface.reduce((a, u) => a + sim.strength(u), 0);
      let tgt = null, bs = 0;
      for (const [j, d] of reach) {
        const e = enemyNav.get(j) || 0;
        let sc = 0;
        if (e > 0 && str > e * 1.3) sc = 10 / (d + 1);
        else if (!e && w.adj[j].some(k => wars.includes(s.regions[k].owner))) sc = 3 / (d + 1);
        if (sc > bs) { bs = sc; tgt = j; }
      }
      if (tgt !== null && tgt !== loc) sim.order(surface.map(u => u.id), tgt);
    }
  }

  // ------------------------------------------------------------ daily diplomacy (trade, opinions, outreach)
  dailyDiplomacy() {
    const sim = this.sim, s = sim.s;
    const live = Object.values(s.nations).filter(n => n.alive);
    // opinion drift
    for (const a of live) {
      const op = s.opinion[a.code] || {};
      for (const b in op) {
        let v = op[b] * 0.997;
        const r = sim.rel(a.code, b);
        if (r === 'alliance') v += 0.08; if (r === 'war') v -= 0.15;
        op[b] = clamp(v, -100, 100);
      }
    }
    for (const t of s.trades) { sim.addOpinion(t.from, t.to, 0.05); sim.addOpinion(t.to, t.from, 0.05); }
    // trade matching
    for (const N of live) {
      if (!N.ai) continue;
      for (const good of ['food', 'energy']) {
        const net = good === 'food' ? N.st.foodNet : N.st.energyNet;
        const stock = good === 'food' ? N.food : N.energy;
        const cons = good === 'food' ? N.st.foodCons : N.st.eCons;
        if (net >= 0 || stock > cons * 50) continue;
        if (s.trades.some(t => t.to === N.code && t.good === good && !t.blockaded && t.since > s.t - 24 * 20)) continue;
        const need = -net * 1.15;
        const sellers = live.filter(x => x.code !== N.code && (good === 'food' ? x.st.foodNet : x.st.energyNet) > need * 0.5 && !sim.atWar(x.code, N.code) && sim.opinion(x.code, N.code) > -30)
          .sort((a, b) => (good === 'food' ? b.st.foodNet - a.st.foodNet : b.st.energyNet - a.st.energyNet));
        const seller = sellers[0]; if (!seller) continue;
        const price = +(s.prices[good] * 1.05).toFixed(2);
        const amount = Math.round(Math.min(need, (good === 'food' ? seller.st.foodNet : seller.st.energyNet) * 0.8));
        if (amount < 2) continue;
        if (seller.code === s.player) {
          if (!s.messages.some(m => m.from === N.code && m.status === 'pending' && m.proposal?.type === 'trade'))
            sim.message(N.code, s.player, `We wish to import ${amount} ${good} per day from you at $${price} per unit ($${(amount * price).toFixed(0)}M/day).`, { type: 'trade', good, amount, price, from: s.player, to: N.code });
        } else {
          const t = sim.addTrade(seller.code, N.code, good, amount, price);
          if (t && NATION[N.code].major && NATION[seller.code].major && Math.random() < 0.15) sim.emit('trade', `${NATION[seller.code].name} begins exporting ${good} to ${NATION[N.code].name}.`, [seller.code, N.code], { loc: s.nations[N.code].capital });
        }
      }
    }
    // offers to the player
    const P = s.nations[s.player];
    if (P.alive && Math.random() < 0.25) {
      for (const good of ['food', 'energy']) {
        const net = good === 'food' ? P.st.foodNet : P.st.energyNet;
        if (net >= 0) continue;
        const seller = live.filter(x => x.ai && (good === 'food' ? x.st.foodNet : x.st.energyNet) > -net && !sim.atWar(x.code, s.player) && sim.opinion(x.code, s.player) > -20)[0];
        if (seller && !s.messages.some(m => m.from === seller.code && m.status === 'pending')) {
          const amount = Math.round(-net * 1.1), price = +(s.prices[good] * 1.1).toFixed(2);
          sim.message(seller.code, s.player, `Our analysts note your ${good} shortfall. We can supply ${amount} ${good}/day at $${price} per unit.`, { type: 'trade', good, amount, price, from: seller.code, to: s.player });
        }
      }
      // treaty outreach from friendly neighbours
      for (const [o] of this.neighbours(s.player)) {
        if (!s.nations[o].alive || !s.nations[o].ai) continue;
        const r = sim.rel(o, s.player);
        if (r === 'peace' && sim.opinion(o, s.player) > 20 && Math.random() < 0.08) sim.message(o, s.player, 'Our nations share a border and, we believe, an interest in stability. We propose a non-aggression pact.', { type: 'nap' });
        if (r === 'peace' && sim.opinion(o, s.player) < -40 && Math.random() < 0.05) sim.message(o, s.player, 'Your behaviour is being watched closely. Any hostile move will be answered with force.');
      }
    }
    // expire stale proposals
    for (const m of s.messages) if (m.status === 'pending' && s.t - m.t > 24 * 20) m.status = 'expired';
  }

  // ------------------------------------------------------------ player delegation (ministers act on directives)
  delegate(c) {
    const sim = this.sim, s = sim.s, N = s.nations[c], D = N.directives;
    const reserve = Math.max(80, N.money * (1 - D.budget));
    N.delegLog ||= [];
    const log = t => { N.delegLog.push({ t: s.t, text: t }); if (N.delegLog.length > 40) N.delegLog.shift(); };
    if (D.industry !== 'off') {
      for (let k = 0; k < 2; k++) {
        const spent = this.economy(c, D.industry === 'balanced' ? null : D.industry, reserve);
        if (!spent) break;
        const r = s.regions.find(x => x.owner === c && x.build && x.build.total === x.build.left);
        if (r) log(`Industry: began ${r.build.type} L${r.build.level} in ${sim.w.regions[r.i].name}.`);
      }
    }
    if (D.defense !== 'off') {
      const spent = this.production(c, D.defense, reserve);
      if (spent) { const q = N.queue[N.queue.length - 1]; log(`Defense: ordered ${UNITS[q.type].name} at ${sim.w.regions[q.region].name}.`); }
    }
    if (D.foreign !== 'off') this.foreignDirective(c, D.foreign, log);
  }
  foreignDirective(c, mode, log) {
    const sim = this.sim, s = sim.s, N = s.nations[c];
    const live = Object.values(s.nations).filter(n => n.alive && n.code !== c);
    for (const good of ['food', 'energy']) {
      const net = good === 'food' ? N.st.foodNet : N.st.energyNet;
      if (net >= 0 || s.trades.some(t => t.to === c && t.good === good && t.since > s.t - 24 * 15)) continue;
      const seller = live.filter(x => (good === 'food' ? x.st.foodNet : x.st.energyNet) > -net * 0.6 && !sim.atWar(x.code, c) && sim.opinion(x.code, c) > -30).sort((a, b) => sim.opinion(b.code, c) - sim.opinion(a.code, c))[0];
      if (!seller) continue;
      const p = { type: 'trade', good, amount: Math.round(-net * 1.15), price: +(s.prices[good] * 1.08).toFixed(3), from: seller.code, to: c };
      if (this.evaluate(seller.code, c, p).ok && sim.addTrade(seller.code, c, good, p.amount, p.price)) log(`Foreign: secured ${p.amount} ${good}/day from ${NATION[seller.code].name}.`);
    }
    if (mode === 'relations' || mode === 'alliances') {
      const nb = [...this.neighbours(c).keys()].filter(o => s.nations[o].alive && sim.rel(c, o) === 'peace');
      const worst = nb.sort((a, b) => sim.opinion(a, c) - sim.opinion(b, c))[0];
      if (worst && N.money > 600 && Math.random() < 0.3) { N.money -= 60; sim.addOpinion(worst, c, 4); log(`Foreign: aid and cultural exchange with ${NATION[worst].name}.`); }
      const cand = nb.find(x => this.evaluate(x, c, { type: 'nap' }).ok);
      if (cand && Math.random() < 0.25) { sim.setRel(c, cand, 'nap'); sim.emit('treaty', `${NATION[c].name} and ${NATION[cand].name} sign a non-aggression pact.`, [c, cand]); log(`Foreign: non-aggression pact with ${NATION[cand].name}.`); }
    }
    if (mode === 'alliances') {
      const cand = live.map(n => n.code).find(x => sim.rel(c, x) === 'nap' && this.evaluate(x, c, { type: 'alliance' }).ok);
      if (cand && Math.random() < 0.2) { sim.setRel(c, cand, 'alliance'); sim.emit('treaty', `${NATION[c].name} and ${NATION[cand].name} form a military alliance.`, [c, cand]); log(`Foreign: alliance with ${NATION[cand].name}.`); }
    }
  }

  // ------------------------------------------------------------ army groups led by generals
  runGroups(c) {
    const sim = this.sim, s = sim.s, w = sim.w;
    for (const g of s.groups) {
      if (g.nation !== c) continue;
      const units = g.units.map(id => sim.unitById.get(id)).filter(Boolean);
      g.units = units.map(u => u.id);
      for (const u of units) u.group = g.id;
      if (!units.length) { g.status = 'No units assigned.'; continue; }
      const o = g.order || { type: 'hold' };
      const idle = units.filter(u => !u.move);
      const land = idle.filter(u => UNITS[u.type].domain === 'land' && !w.regions[u.loc].sea);
      const sea = idle.filter(u => UNITS[u.type].domain === 'sea');
      const air = units.filter(u => UNITS[u.type].domain === 'air');
      if (o.type !== 'train') for (const u of units) u.train = false;
      if (o.type === 'hold') { g.status = 'Holding positions.'; continue; }
      if (o.type === 'train') {
        for (const u of idle) { const r = s.regions[u.loc]; if (r.owner === c && !r.sea) u.train = true; else if (UNITS[u.type].domain === 'land') sim.order([u.id], s.nations[c].capital); }
        const avg = units.reduce((a, u) => a + (u.xp || 0), 0) / units.length;
        g.status = `Training. Average experience ${avg.toFixed(0)}/100.`;
        continue;
      }
      if (o.type === 'defend') {
        const tgt = o.region, at = sim.anchor(tgt);
        const enemies = s.units.filter(e => sim.atWar(c, e.nation) && kmBetween(e.pos, at) < 600);
        const movers = land.filter(u => u.loc !== tgt);
        if (movers.length && !w.regions[tgt].sea) sim.order(movers.map(u => u.id), tgt);
        for (const u of sea) if (kmBetween(u.pos, at) > 500) { const sn = w.regions[tgt].sea ? tgt : sim.seaNear(tgt); if (sn >= 0) sim.order([u.id], sn); }
        const le = enemies.find(x => UNITS[x.type].domain === 'land' && !w.regions[x.loc].sea);
        for (const u of air) if (u.type === 'BMB') u.mission = le ? { strike: le.loc } : null;
        g.status = enemies.length ? `Defending ${w.regions[tgt].name}: ${enemies.length} hostile units within 600 km.` : `Defending ${w.regions[tgt].name}. Sector quiet.`;
        continue;
      }
      if (o.type === 'attack') {
        const e = o.target;
        if (!s.nations[e]?.alive) { g.status = 'Target nation no longer exists.'; continue; }
        if (!sim.atWar(c, e)) { g.status = `Awaiting a declaration of war on ${NATION[e].name}.`; continue; }
        const enemyStr = new Map();
        for (const x of s.units) if (x.nation === e && UNITS[x.type].domain === 'land') enemyStr.set(x.loc, (enemyStr.get(x.loc) || 0) + sim.strength(x));
        const eRegions = s.regions.filter(r => r.owner === e);
        g.status = `Conducting operations against ${NATION[e].name}.`;
        if (land.length) {
          const locs = [...new Set(land.map(u => u.loc))];
          const adjT = [...new Set(locs.flatMap(l => [l, ...w.adj[l]]).filter(j => s.regions[j].owner === e))];
          const myStr = land.reduce((a, u) => a + sim.strength(u), 0);
          const defOf = j => (enemyStr.get(j) || 0) * (1 + s.regions[j].fort * 0.3) + sim.garrison(s.regions[j]);
          let tgt;
          if (adjT.length) tgt = adjT.sort((a, b) => (defOf(a) - s.regions[a].pop * 0.02) - (defOf(b) - s.regions[b].pop * 0.02))[0];
          else tgt = eRegions.sort((a, b) => kmBetween(land[0].pos, sim.anchor(a.i)) - kmBetween(land[0].pos, sim.anchor(b.i)))[0].i;
          const def = defOf(tgt);
          if (myStr > def * 1.15 || !adjT.length) {
            const movers = land.filter(u => u.loc !== tgt).map(u => u.id);
            const r = movers.length ? sim.order(movers, tgt) : { ok: true };
            g.status = r.ok ? `Advancing on ${w.regions[tgt].name} (strength ${myStr.toFixed(0)} vs ${def.toFixed(0)}).` : `Cannot advance: ${r.reason || 'route blocked'}.`;
          } else g.status = `Massing forces: need more strength to take ${w.regions[tgt].name} (${myStr.toFixed(0)} vs ${def.toFixed(0)}).`;
        }
        if (sea.length) {
          const fleets = s.units.filter(x => x.nation === e && UNITS[x.type].domain === 'sea');
          const nearest = fleets.sort((a, b) => kmBetween(sea[0].pos, a.pos) - kmBetween(sea[0].pos, b.pos))[0];
          const coast = eRegions.filter(r => w.regions[r.i].coastal).sort((a, b) => kmBetween(sea[0].pos, sim.anchor(a.i)) - kmBetween(sea[0].pos, sim.anchor(b.i)))[0];
          const dest = nearest && kmBetween(sea[0].pos, nearest.pos) < 4000 ? nearest.loc : coast ? sim.seaNear(coast.i) : -1;
          if (dest >= 0 && dest !== sea[0].loc) sim.order(sea.map(u => u.id), dest);
        }
        for (const u of air) {
          if (u.type !== 'BMB') continue;
          const tg = eRegions.filter(r => kmBetween(sim.anchor(u.loc), sim.anchor(r.i)) <= UNITS.BMB.radius).sort((a, b) => ((enemyStr.get(b.i) || 0) + b.industry * 2) - ((enemyStr.get(a.i) || 0) + a.industry * 2))[0];
          u.mission = tg ? { strike: tg.i } : null;
        }
      }
    }
  }

  // ------------------------------------------------------------ player -> AI proposals
  evaluate(ai, from, p) {
    const sim = this.sim, s = sim.s, t = NATION[ai].traits;
    const op = sim.opinion(ai, from);
    const rel = sim.rel(ai, from);
    const myP = this.power(ai) + 1, theirP = this.power(from) + 1;
    const commonEnemy = sim.warsOf(ai).some(e => sim.atWar(from, e));
    let ok = false, why = '';
    if (p.type === 'nap') {
      if (rel !== 'peace') return { ok: false, why: rel === 'war' ? 'We are at war. Propose peace first.' : 'We already have a treaty.' };
      const sc = op / 20 + t.caution * 1.5 + (theirP > myP ? 1 : 0) - t.aggression;
      ok = sc > 0.6; why = ok ? (theirP > myP ? 'Peace with a strong neighbour is wise.' : 'Stability serves us both.') : 'We see no need to tie our hands.';
    } else if (p.type === 'alliance') {
      if (rel === 'war') return { ok: false, why: 'We are at war with you.' };
      if (rel === 'alliance') return { ok: false, why: 'We are already allied.' };
      const sc = op / 15 + (commonEnemy ? 2.5 : 0) + t.loyalty - (theirP > myP * 6 ? 1 : 0) + (rel === 'nap' ? 0.8 : 0);
      ok = sc > 3; why = ok ? (commonEnemy ? 'Together we will defeat our common enemy.' : 'Our friendship has earned this.') : op < 20 ? 'We do not yet trust you enough.' : 'An alliance does not serve our interests now.';
    } else if (p.type === 'peace') {
      if (rel !== 'war') return { ok: false, why: 'We are not at war.' };
      const E = s.nations[ai];
      const sc = E.exhaustion * 4 + (theirP > myP ? 1.5 : -0.5) + t.caution + op / 50 - t.aggression;
      ok = sc > 1; why = ok ? 'Enough blood has been shed.' : 'We are winning this war. No peace.';
    } else if (p.type === 'trade') {
      // p.from sells to p.to
      if (sim.atWar(ai, from)) return { ok: false, why: 'We do not trade with enemies.' };
      const aiSells = p.from === ai;
      const N = s.nations[ai];
      const net = p.good === 'food' ? N.st.foodNet : N.st.energyNet;
      const fair = s.prices[p.good];
      if (aiSells) { ok = net > p.amount * 0.6 && p.price >= fair * (0.9 - op / 400); why = ok ? 'The terms are acceptable.' : net <= p.amount * 0.6 ? 'We cannot spare that much.' : 'Your price is too low.'; }
      else { ok = (net < 0 || N.money > 500) && p.price <= fair * (1.15 + op / 300); why = ok ? 'We will take the shipment.' : 'We have no need at that price.'; }
    } else if (p.type === 'joint') {
      if (rel !== 'alliance') return { ok: false, why: 'Only allies fight our wars with us.' };
      if (sim.rel(ai, p.target) === 'alliance') return { ok: false, why: `${NATION[p.target].name} is our ally.` };
      const sc = t.aggression * 2 + op / 30 - sim.opinion(ai, p.target) / 30 + (this.power(ai) > this.power(p.target) ? 1 : -0.5) - sim.warsOf(ai).length;
      ok = sc > 1.6; why = ok ? `We march with you against ${NATION[p.target].name}.` : 'We are not ready for that war.';
    }
    return { ok, why };
  }
}

export const ALL_LAND = LAND_TYPES;
