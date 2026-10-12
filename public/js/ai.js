// AI rulers for every non-player civilization, ministers acting on the player's directives, and AI responses to diplomacy.
import { UNITS, LINES, bestOf, BUILDINGS, WONDERS, SETTLEMENTS } from './units.js';
import { RES, IMPROVEMENTS, IMP_ORDER, IMP_CAP, TERRAIN, known } from './resources.js';
import { GOV_TYPES, govAvailable, reform, reformCost, enact, canEnact, LAWS } from './gov.js';
import { TECH } from './tech.js';
import { ageScale } from './eras.js';
import { clamp, kmBetween, GOODS } from './sim.js';
import { aiImperialCourt } from './imperial.js';
import { aiOfficials, aiRevolts, warAffinity, faithShares, cultureShares } from './society.js';

// how far the envoy may go on price, relative to the going rate
export const TRADE_WILL = {
  cheap: { name: 'Bargain hunt', mult: 0.95, desc: 'Only at or below the going rate' },
  fair: { name: 'Fair price', mult: 1.12, desc: 'Up to a little above the going rate' },
  generous: { name: 'Pay well', mult: 1.4, desc: 'Up to 40% above the going rate' },
  any: { name: 'Whatever it takes', mult: 2.2, desc: 'Secure it at almost any price' },
};
// the lowest price the envoy may accept when selling, relative to the going rate
export const TRADE_FLOOR = {
  premium: { name: 'Hold out for a premium', mult: 1.25, desc: 'Only sell well above the going rate' },
  fair: { name: 'Fair price', mult: 1.0, desc: 'No lower than the going rate' },
  quick: { name: 'Sell quickly', mult: 0.82, desc: 'Accept a little below the going rate' },
  clear: { name: 'Clear the stores', mult: 0.55, desc: 'Sell to anyone who will pay' },
};
export function addTradeGoal(N, good, amount, will = 'fair', dir = 'buy') {
  N.tradeGoals ||= []; N.tgid ||= 1;
  const ex = N.tradeGoals.find(g => g.good === good && (g.dir || 'buy') === dir);
  if (ex) { ex.amount = amount; ex.will = will; ex.next = 0; return ex; }
  const g = { id: N.tgid++, good, amount, will, dir, status: dir === 'sell' ? 'Your envoy is looking for buyers.' : 'Your envoy is looking for sellers.', next: 0, ok: false };
  N.tradeGoals.push(g);
  return g;
}
const hash = s => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
const pick = a => a[(Math.random() * a.length) | 0];
const wpick = (items, w) => { const t = w.reduce((a, b) => a + b, 0); let r = Math.random() * t; for (let i = 0; i < items.length; i++) { r -= w[i]; if (r <= 0) return items[i]; } return items[items.length - 1]; };
const affordable = (N, cost, keep = 0, res = null) => Object.entries(cost).every(([k, v]) => (N[k] || 0) - (res?.[k] || 0) - v >= keep * v);

export class AI {
  constructor(sim) { this.sim = sim; this.phase = {}; }

  hourly() {
    const s = this.sim.s;
    for (const N of Object.values(s.nations)) {
      if (!N.alive || !N.ai) continue;
      const h = this.phase[N.code] ??= hash(N.code);
      if ((h + s.t) % 12 === 0) this.think(N.code, (h + s.t) % (24 * 20) < 12);
    }
    const P = s.nations[s.player];
    if (P?.alive) {
      if (s.t % 12 === 6) this.runGroups(P.code);
      if (s.t % 24 === 18) this.delegate(P.code);
    }
    if (s.t % 24 === 12) this.dailyDiplomacy();
  }

  // ------------------------------------------------------------ helpers
  power(c) { return this.sim.power(c); }
  neighbours(c) {
    const { s, w } = this.sim; const out = new Map();
    for (const r of this.sim.regionsOf(c)) for (const j of w.adj[r.i]) {
      const o = s.regions[j].owner;
      if (o && o !== c) out.set(o, (out.get(o) || 0) + 1);
      if (w.regions[j].sea) for (const k of w.adj[j]) { const o2 = s.regions[k].owner; if (o2 && o2 !== c && !out.has(o2)) out.set(o2, 0.3); }
    }
    return out;
  }
  threatTo(c) { let t = 0; for (const [o] of this.neighbours(c)) { if (this.sim.atWar(c, o)) t += 2; else if (this.sim.opinion(c, o) < -20) t += 0.5; } return t; }

  think(c, strategic) {
    if (!this.sim.s.nations[c].alive) return;
    if (this.sim.s.t % 24 < 12) this.develop(c, null, 1.7); // works are planned once a day
    this.production(c);
    if (this.sim.s.t % 24 < 12) aiRevolts(this.sim, c);
    if (strategic) { this.strategy(c); aiOfficials(this.sim, c); }
    this.operations(c);
  }

  // ------------------------------------------------------------ development
  // focus: null | 'balanced' | 'growth' | 'food' | 'industry' | 'research' | 'fortify' | 'expand'; reserve: fraction of each stock to keep
  develop(c, focus = null, budget = 1, log = null) {
    const sim = this.sim, s = sim.s, N = s.nations[c];
    let spent = 0;
    // ages and government; save up for the next age once its research is done
    const adv = sim.canAdvance(c);
    let res = !adv.ok && adv.cost ? { ...adv.cost } : null;
    if (N.ai) N.saving = !!res;
    // at war across the water with no harbor: save for one before anything else
    const needHarbor = (N.needLift || 0) > 0 && !sim.regionsOf(c).some(r => r.bld.harbor);
    if (needHarbor) { const site = sim.regionsOf(c).find(r => sim.T[r.i].coastal && r.lvl >= 1); if (site) { res ||= {}; for (const [k, v] of Object.entries(sim.bldCost(N, 'harbor', 1))) res[k] = (res[k] || 0) + v; } }
    // ... and once the harbor stands, for the transports to carry the army
    if (!needHarbor && (N.needLift || 0) > sim.sealift(c) && sim.warsOf(c).length) { const t = sim.bestFieldable(c, 'TRN'); if (t) { res ||= {}; for (const [k, v] of Object.entries(sim.unitCost(c, t))) res[k] = (res[k] || 0) + v; } }
    N.reserve = res;
    if (!focus || focus === 'balanced') {
      if (adv.ok) { sim.advance(c); log?.(`Began the advance to the next age.`); }
      if (N.ai) this.government(c);
    }
    // expansion
    const expandDrive = (N.ai ? N.traits.expansion : focus === 'expand' ? 1 : focus === 'balanced' || !focus ? 0.6 : 0.2);
    if (expandDrive > 0.15 && sim.activeClaims(c) < sim.maxClaims(N)) {
      let reach = [...sim.claimReach(c)];
      if (reach.length && Math.random() < 0.4 + expandDrive * 0.6) {
        if (reach.length > 40) reach = reach.sort(() => Math.random() - 0.5).slice(0, 40); // a scout's survey, not a census
        const scored = reach.map(i => ({ i, v: this.tileValue(c, i) })).sort((a, b) => b.v - a.v);
        for (const t of scored.slice(0, 3)) {
          const chk = sim.canClaim(c, t.i);
          if (!chk.ok) continue;
          if (N.food - chk.cost.food - (res?.food || 0) < N.st.foodCons * 4 * (1 - expandDrive * 0.5)) break;
          if (res && !affordable(N, chk.cost, 0, res)) break;
          sim.claim(c, t.i); spent++; log?.(`Settlers sent to ${sim.w.regions[t.i].name}.`);
          break;
        }
      }
    }
    // works: improvements, settlements, buildings, wonders
    const free = sim.regionsOf(c).filter(r => !r.build && !r.capture);
    if (!free.length) return spent;
    const maxStart = Math.max(1, Math.round((1 + free.length * 0.25) * budget));
    const cands = this.workCandidates(c, free, focus);
    cands.sort((a, b) => b.score - a.score);
    let started = 0;
    const used = new Set();
    let tried = 0;
    for (const cd of cands) {
      if (started >= maxStart || ++tried > 80) break;
      if (used.has(cd.i)) continue;
      const keep = N.ai ? 0.15 : 1 - budget;
      const chk = cd.kind === 'imp' ? sim.canImprove(c, cd.i, cd.type) : cd.kind === 'bld' ? sim.canBuild(c, cd.i, cd.type) : cd.kind === 'settle' ? sim.canUpgradeSettlement(c, cd.i) : sim.canWonder(c, cd.i, cd.type);
      const exempt = cd.kind === 'settle' || (needHarbor && cd.kind === 'bld' && cd.type === 'harbor');
      if (!chk.ok || !affordable(N, chk.cost, keep, exempt ? null : res)) continue;
      sim.startWork(c, cd.i, cd.kind, cd.type);
      used.add(cd.i); started++; spent++;
      log?.(`${cd.label} at ${sim.w.regions[cd.i].name}.`);
    }
    return spent;
  }
  tileValue(c, i) {
    const sim = this.sim, T = sim.T[i], r = sim.s.regions[i], N = sim.s.nations[c];
    let v = T.hab * 2 + T.fert * 1.5 + (T.river ? 1.5 : 0) + (T.coastal ? 0.4 : 0);
    for (const d of r.dep) { const R = RES[d.r]; if (!known(N, d.r)) { v += 0.3; continue; } v += d.amt * (R.kind === 'strategic' ? (N.access?.[d.r] ? 1 : 3) : R.kind === 'luxury' ? (N.access?.[d.r] ? 0.6 : 2) : 0.8); }
    v -= (r.natives || 0) * 0.4;
    const cap = sim.anchor(N.capital), at = sim.anchor(i);
    v -= kmBetween(cap, at) / 900;
    // compact borders: prefer tiles touching several of ours
    v += sim.w.adj[i].filter(j => sim.s.regions[j].owner === c).length * 0.5;
    if (T.terrain === 'ice') v -= 5;
    return v;
  }
  workCandidates(c, free, focus) {
    const sim = this.sim, s = sim.s, N = s.nations[c], st = N.st, a = N.age;
    const out = [];
    const foodShort = st.net.food < st.foodCons * 0.1 || N.food < st.foodCons * 15;
    const woodShort = N.wood < 25 * ageScale(a) ** 0.95, stoneShort = N.stone < 40 * ageScale(a) ** 0.95, metalShort = a >= 1 && N.metal < 15 * ageScale(a) ** 0.9;
    const wars = sim.warsOf(c).length;
    const W = { food: focus === 'food' ? 3 : 1, industry: focus === 'industry' ? 3 : 1, research: focus === 'research' ? 3 : 1, fortify: focus === 'fortify' ? 4 : 1, growth: focus === 'growth' ? 3 : 1 };
    const needRes = this.neededResources(c);
    const hasHarbor = sim.regionsOf(c).some(x => x.bld.harbor);
    for (const r of free) {
      const T = sim.T[r.i], info = sim.tileInfo(r.i);
      const cap = sim.housing(r, N);
      let yl = null;
      // settlement growth
      const sc = sim.canUpgradeSettlement(c, r.i);
      if (sc.ok || /Need /.test(sc.why || '')) out.push({ kind: 'settle', i: r.i, score: 6 * W.growth * (r.i === N.capital ? 1.4 : 1), label: `Growing into a ${SETTLEMENTS[r.lvl + 1]?.name}` });
      // improvements
      for (const k of IMP_ORDER) {
        const I = IMPROVEMENTS[k]; const lvl = r.imp[k] || 0;
        if (lvl >= IMP_CAP[a] || (I.tech && !N.techs[I.tech]) || !I.need(info, N)) continue;
        let sc2 = 1;
        const deps = r.dep.filter(d => RES[d.r].imp === k && known(N, d.r));
        if (k === 'farm') sc2 = (foodShort ? 5 : 2) * W.food * (0.4 + T.fert);
        if (k === 'pasture') sc2 = (foodShort ? 3 : 1.4) * W.food;
        if (k === 'camp') sc2 = (foodShort ? 2.5 : 0.8) * W.food * (a <= 1 ? 1.5 : 0.5);
        if (k === 'fishery') sc2 = (foodShort ? 3.5 : 1.5) * W.food;
        if (k === 'lumber') sc2 = (woodShort ? 4 : 1.2) * W.industry * TERRAIN[T.terrain].wood;
        if (k === 'quarry') sc2 = (stoneShort ? 4 : 1.1) * W.industry * TERRAIN[T.terrain].stone;
        if (k === 'mine') sc2 = (metalShort ? 4 : 1.5) * W.industry + deps.reduce((s2, d) => s2 + (RES[d.r].kind === 'luxury' ? 1.5 : 0), 0);
        if (k === 'plantation') sc2 = 2 + deps.length;
        if (k === 'well') sc2 = 4 * W.industry;
        for (const d of deps) if (needRes.has(d.r) && !N.access?.[d.r]) sc2 += 8;
        sc2 *= lvl === 0 ? 1.4 : 1 / (1 + lvl * 0.25);
        // labour: no point adding levels nobody can work
        yl ||= sim.tileYield(r, N);
        if (yl.labor < 0.7) sc2 *= 0.25;
        out.push({ kind: 'imp', i: r.i, type: k, score: sc2, label: `${I.name} expanded` });
      }
      // buildings
      for (const [k, B] of Object.entries(BUILDINGS)) {
        const lvl = r.bld[k] || 0; if (lvl >= B.levels.length) continue;
        const [, tech, minLvl] = B.levels[lvl];
        if (!N.techs[tech] || r.lvl < minLvl || (B.coastal && !T.coastal)) continue;
        let sc3 = 0;
        if (k === 'granary') sc3 = 2.2 * W.growth;
        if (k === 'temple') sc3 = N.gov.stability < 0.5 ? 3.5 : 1.6;
        if (k === 'walls') { const border = sim.w.adj[r.i].some(j => { const o = s.regions[j].owner; return o && o !== c; }); sc3 = (border ? (wars ? 4 : 1.8) : 0.4) * W.fortify * (r.i === N.capital ? 1.5 : 1); }
        if (k === 'barracks') sc3 = r.i === N.capital || r.lvl >= 3 ? 1.8 + wars : 0.3;
        if (k === 'harbor') sc3 = (r.i === N.capital || r.lvl >= 2 ? 2 : 0.6) + (a >= 2 ? 0.6 : 0) + ((N.needLift || 0) > 0 && !hasHarbor ? 25 : 0);
        if (k === 'market') sc3 = 2.6 * W.industry * (r.lvl / 3 + 0.4);
        if (k === 'library') sc3 = 2.8 * W.research * (r.lvl / 3 + 0.4) * (0.6 + N.traits.science);
        if (k === 'workshop') sc3 = (metalShort ? 5 : 2.6) * W.industry * (r.lvl / 3 + 0.4);
        if (k === 'aqueduct') sc3 = r.pop > cap * 0.8 ? 3.2 * W.growth : 0.5;
        if (k === 'power') sc3 = st.eF < 0.95 ? 6 : 0.8;
        if (k === 'academy') sc3 = wars ? 2 : 0.4;
        if (k === 'airfield') sc3 = r.i === N.capital ? 2 : 0.6;
        if (k === 'datacenter') sc3 = st.eF > 0.9 ? 3 * W.research : 0.4;
        if (k === 'nuclear') sc3 = N.traits.aggression > 0.55 || wars ? 2 : 0.2;
        if (sc3 > 0) out.push({ kind: 'bld', i: r.i, type: k, score: sc3, label: `${B.levels[lvl][0]} built` });
      }
    }
    // wonders: in the capital when rich
    const cap = s.regions[N.capital];
    if (cap && !cap.build && cap.owner === c) {
      for (const [id, Wd] of Object.entries(WONDERS)) {
        if (s.wonders[id] || !N.techs[Wd.tech]) continue;
        if (!affordable(N, Wd.cost, 1.2)) continue;
        out.push({ kind: 'wonder', i: N.capital, type: id, score: Wd.victory ? 50 : 3 + Math.random() * 3, label: `Construction of the ${Wd.name} begun` });
      }
    }
    return out;
  }
  neededResources(c) {
    const N = this.sim.s.nations[c]; const need = new Set();
    for (const line of ['INF', 'RNG', 'CAV', 'SGE', 'NAV', 'TRN', 'FTR', 'BMB', 'SUB', 'CAR']) { const b = bestOf(N, line); if (b) for (const k of UNITS[b].needs) need.add(k); }
    if (N.age >= 1) { need.add('copper'); need.add('tin'); }
    if (N.age >= 6) need.add('coal');
    return need;
  }
  government(c) {
    const sim = this.sim, N = sim.s.nations[c], t = N.traits;
    const cur = GOV_TYPES[N.gov.type];
    if (N.gov.pc < reformCost(N) || (N.gov.stability < 0.4 && !cur.coupOnly)) return;
    const fit = k => { const G = GOV_TYPES[k]; let v = G.age * 2; if (G.democratic) v += (t.science - t.aggression) * 2; if (['empire', 'autocracy', 'feudal', 'despotism', 'chiefdom'].includes(k)) v += t.aggression * 2; if (['monarchy', 'constmon', 'absolute'].includes(k)) v += t.caution * 1.5; if (k === 'theocracy') v += t.caution; if (k === 'technocracy') v += t.science * 3; if (k === 'merchant') v += 1; return v; };
    const opts = Object.keys(GOV_TYPES).filter(k => govAvailable(N, k));
    const best = opts.sort((a, b) => fit(b) - fit(a))[0];
    if (best && best !== N.gov.type && fit(best) > fit(N.gov.type) + 1.5) reform(sim, N, best);
    // a few laws by temperament
    const want = [];
    if (N.techs.writing && N.gov.laws.research === 'standard' && t.science > 0.5) want.push(['research', 'high']);
    if (t.expansion > 0.6 && N.gov.laws.expansion === 'balanced') want.push(['expansion', 'frontier']);
    if (N.techs.colonization && t.expansion > 0.75) want.push(['expansion', 'manifest']);
    if (N.techs.polytheism && N.gov.laws.religion === 'animism') want.push(['religion', 'pantheon']);
    if (N.techs.monotheism && N.gov.laws.religion !== 'state' && t.caution > 0.5) want.push(['religion', 'state']);
    if (N.techs.trade_networks && N.gov.laws.trade === 'managed' && t.aggression < 0.5) want.push(['trade', 'free']);
    if (N.techs.code_of_laws && !N.techs.democracy && t.aggression > 0.7 && N.gov.laws.labor === 'communal') want.push(['labor', 'slavery']);
    if (N.techs.constitution && ['communal', 'slavery', 'serfdom'].includes(N.gov.laws.labor)) want.push(['labor', 'free']);
    // peoples and faiths of the realm
    const cs = cultureShares(sim, c)[N.cul] || 1, fs = faithShares(sim, c)[N.faith] || 1, dem = !!GOV_TYPES[N.gov.type].democratic;
    if (cs < 0.75 && N.gov.laws.culture === 'accommodate') { if (N.techs.citizenship && (dem || t.caution > 0.55)) want.push(['culture', 'pluralism']); else if (N.techs.code_of_laws && t.aggression > 0.55) want.push(['culture', 'assimilate']); }
    if (N.techs.human_rights && dem && cs < 0.8) want.push(['culture', 'multicultural']);
    if (N.techs.humanism && fs < 0.65 && ['animism', 'pantheon', 'state'].includes(N.gov.laws.religion) && t.caution < 0.7) want.push(['religion', 'tolerance']);
    if (N.techs.code_of_laws && N.gov.laws.liberty === 'standard' && !dem && N.st.unrestW > 0.35) want.push(['liberty', 'surveillance']);
    for (const [cat, opt] of want) if (canEnact(sim, N, cat, opt).ok) { enact(sim, N, cat, opt); break; }
  }

  // ------------------------------------------------------------ military production
  production(c, focus = null, budget = 1) {
    const sim = this.sim, s = sim.s, N = s.nations[c], st = N.st, t = N.traits;
    const wars = sim.warsOf(c);
    const threat = this.threatTo(c);
    const tiles = st.tiles || 1;
    let want = 1 + tiles * (0.35 + 0.45 * t.aggression) * (N.age >= 1 ? 1 : 0.6) + wars.length * (2 + tiles * 0.2) + threat * 1.2;
    if (wars.length) want += N.warNeed || 0;
    if (focus === 'maintain') want = 1 + tiles * 0.4 + wars.length * 2;
    else if (focus === 'total') want = tiles * 1.5 + 6;
    else if (focus) want = tiles * 0.9 + 3;
    const have = st.units + N.queue.length;
    // an overseas war needs boats before anything else
    if (wars.length && (N.needLift || 0) > sim.sealift(c) + N.queue.filter(q => UNITS[q.type].lift).reduce((x, q) => x + UNITS[q.type].lift, 0)) {
      const t = sim.bestFieldable(c, 'TRN');
      if (t && sim.sitesFor(c, t).length && affordable(N, sim.unitCost(c, t), 0)) { const r = sim.orderUnits(c, t, 1, {}); if (r.ok) return 1; }
    }
    if (have >= want || N.queue.length >= 2 + Math.floor(tiles / 3) + (wars.length ? 3 : 0)) return 0;
    // wealth upkeep must stay sustainable
    if (N.age >= 1 && st.net.wealth < 0 && N.wealth < st.upkeep.wealth * 15) return 0;
    const mine = sim.unitsOf(c);
    const count = role => mine.filter(u => UNITS[u.type].role === role).length;
    const land = mine.filter(u => UNITS[u.type].domain === 'land').length;
    const coastal = sim.regionsOf(c).some(r => r.bld.harbor);
    const overseas = wars.length && !wars.some(e => this.landFront(c, e));
    const opts = [];
    const add = (line, w) => { const b = sim.bestFieldable(c, line); if (b && sim.sitesFor(c, b).length) opts.push([b, w]); };
    add('INF', 3); add('RNG', 1.6); add('CAV', st.prod.wealth > 0 ? 1.4 + t.aggression : 0.6); add('SGE', wars.length ? 1.8 : 0.4);
    if (N.age >= 7) add('AA', 0.6);
    if (coastal) {
      const trn = mine.filter(u => UNITS[u.type].lift).length, nav = count('warship');
      const liftShort = (N.needLift || 0) > sim.sealift(c);
      add('TRN', liftShort ? 14 : overseas && trn < 3 ? 4 : trn < 1 && N.age >= 1 ? 1.2 : 0.2);
      add('NAV', nav < land * 0.3 ? 2 : 0.5); add('SUB', 0.6); add('CAR', st.income > 600 ? 0.4 : 0);
    }
    add('FTR', land > 6 ? 1.2 : 0.3); add('BMB', wars.length ? 1 : 0.3);
    if (focus === 'army') for (const o of opts) if (UNITS[o[0]].domain !== 'land') o[1] *= 0.1;
    if (focus === 'navy') for (const o of opts) if (UNITS[o[0]].domain !== 'sea') o[1] *= 0.1;
    if (focus === 'air') for (const o of opts) if (UNITS[o[0]].domain !== 'air') o[1] *= 0.1;
    if (!opts.length) return 0;
    const type = wpick(opts.map(o => o[0]), opts.map(o => o[1]));
    const cost = sim.unitCost(c, type);
    const adv = sim.canAdvance(c);
    const isLift = UNITS[type].lift > 0 && (N.needLift || 0) > sim.sealift(c);
    if (!affordable(N, cost, N.ai ? 0.25 : 1 / Math.max(0.1, budget) - 1, isLift ? null : (!adv.ok && adv.cost && !wars.length ? adv.cost : N.reserve && (N.needLift || 0) > 0 ? N.reserve : null))) return 0;
    const front = wars.length ? this.frontTile(c, wars) : null;
    const r = sim.orderUnits(c, type, 1, { near: front });
    return r.ok ? 1 : 0;
  }
  landFront(c, e) { const { s, w } = this.sim; for (const r of this.sim.regionsOf(c)) for (const j of w.adj[r.i]) if (s.regions[j].owner === e) return true; return false; }
  frontTile(c, wars) { const { s, w } = this.sim; for (const r of this.sim.regionsOf(c)) if (w.adj[r.i].some(j => wars.includes(s.regions[j].owner))) return r.i; return null; }

  // ------------------------------------------------------------ strategy
  strategy(c) {
    const sim = this.sim, s = sim.s, N = s.nations[c], t = N.traits;
    const wars = sim.warsOf(c);
    const myP = sim.realmPower(c) + (N.st.income || 0) * 0.05;
    if (wars.length) { if (N.gov.laws.conscription === 'levy' && N.techs.conscription) N.gov.laws.conscription = 'draft'; if (N.techs.currency) N.gov.laws.tax = 'war'; }
    else { if (N.gov.laws.conscription === 'total') N.gov.laws.conscription = 'levy'; if (N.gov.laws.tax === 'war') N.gov.laws.tax = 'standard'; }
    // nuclear desperation
    if (N.warheads && wars.length && !['disarm', 'nfu'].includes(N.gov.laws.nuclear)) {
      const core = s.regions.filter(r => r.core === c), lost = core.filter(r => r.owner !== c).length;
      if ((lost / Math.max(1, core.length) > 0.35 || s.regions[N.capital].core !== c) && t.aggression > 0.5 && Math.random() < 0.1) {
        const tg = s.regions.filter(r => !r.sea && wars.includes(r.owner)).sort((a, b) => b.pop - a.pop)[0];
        if (tg) sim.nuke(c, tg.i);
      }
    }
    // peace
    for (const e of wars) {
      const theirP = this.power(e) + (s.nations[e].st.income || 0) * 0.05;
      if (N.exhaustion > 0.35 || myP < theirP * 0.55) this.seekPeace(c, e);
    }
    // native peoples to subdue
    if (t.aggression > 0.45 && !wars.length) {
      N.subjugate = (N.subjugate || []).filter(i => !s.regions[i].owner && (s.regions[i].natives || 0) >= 0.25);
      if (N.subjugate.length < 1) {
        const reach = [...sim.claimReach(c)].filter(i => (s.regions[i].natives || 0) > 0.8 && sim.w.adj[i].some(j => s.regions[j].owner === c));
        const best = reach.sort((a, b) => this.tileValue(c, b) - this.tileValue(c, a))[0];
        if (best !== undefined && this.power(c) > 2) N.subjugate.push(best);
      }
    }
    this.vassalPolicy(c);
    if (N.overlord && N.warLicense) {
      const L = N.warLicense, T = s.nations[L.target];
      if (s.t < L.until && T?.alive && !sim.atWar(c, L.target) && sim.realmOf(L.target) !== sim.realmOf(c)) sim.declareWar(c, L.target);
      if (s.t >= L.until || !T?.alive) N.warLicense = null;
    }
    // arm the restless peoples of an enemy
    if (N.age >= 2 && wars.length && N.wealth > sim.covertCost(c, 'insurgents') * 4 && Math.random() < 0.25 + t.aggression * 0.3) {
      const e = wars[(Math.random() * wars.length) | 0];
      if (s.nations[e]?.alive && sim.knows(c, e)) sim.covert(c, e, 'insurgents');
    }
    // war
    const settled = s.t > 24 * 60;
    if (!N.overlord && settled && wars.length === 0 && N.exhaustion < 0.1 && Math.random() < t.aggression * (s.temper || 1) * 0.3) {
      let best = null, bs = 0;
      for (const [o, contact] of this.neighbours(c)) {
        if (!sim.knows(c, o)) continue;
        const rel = sim.rel(c, o);
        if (rel === 'alliance' || rel === 'war' || !s.nations[o].alive) continue;
        const theirP = sim.realmPower(o) + (s.nations[o].st.income || 0) * 0.05;
        if (sim.realmOf(o) === sim.realmOf(c)) continue;
        let allyP = 0; for (const a of sim.alliesOf(o)) if (sim.rel(a, c) !== 'alliance') allyP += this.power(a) * 0.35;
        if (contact < 1 && N.age < 3) continue;
        let sc = t.aggression * (s.temper || 1) * 1.4 * (myP / (theirP + allyP + 2)) * Math.min(1.5, contact * 0.35 + 0.3);
        sc *= contact < 1 ? 0.4 : 1;
        sc -= sim.alliesOf(o).length * 0.15;
        sc -= sim.opinion(c, o) / 45;
        if (rel === 'nap') sc -= 1.2 * t.loyalty;
        if (o === s.player) sc -= 0.1;
        sc += warAffinity(sim, c, o); // holy cities and kin under foreign rule
        if (sc > bs) { bs = sc; best = o; }
      }
      if (best && bs > 2.2) sim.declareWar(c, best);
    }
    // treaties with AI neighbours
    for (const [o] of this.neighbours(c)) {
      if (o === s.player || !s.nations[o].alive || !sim.knows(c, o)) continue;
      const rel = sim.rel(c, o);
      if (rel === 'peace' && sim.opinion(c, o) > 25 && sim.opinion(o, c) > 25 && Math.random() < 0.3) { sim.setRel(c, o, 'nap'); sim.emit('treaty', `The ${sim.nm(c)} and the ${sim.nm(o)} swear a pact of non-aggression.`, [c, o], { loc: s.nations[o].capital }); }
      else if (rel === 'nap' && sim.opinion(c, o) > 55 && sim.opinion(o, c) > 55 && Math.random() < 0.15) { sim.setRel(c, o, 'alliance'); sim.emit('treaty', `The ${sim.nm(c)} and the ${sim.nm(o)} form an alliance.`, [c, o], { loc: s.nations[o].capital }); }
    }
  }
  // vassals weigh their liberty; overlords set tribute, absorb loyal subjects, and bring others to heel
  vassalPolicy(c) {
    const sim = this.sim, s = sim.s, N = s.nations[c], t = N.traits;
    if (N.overlord && N.ai) {
      const O = s.nations[N.overlord];
      const ratio = (this.power(N.overlord) + 1) / (this.power(c) + 1);
      const held = (s.t - (N.vassalSince || 0)) / 24;
      if ((ratio < 1 || (held > 120 && (ratio < 1.3 || sim.opinion(c, N.overlord) < -45))) && !sim.warsOf(c).length && Math.random() < 0.25 + t.aggression * 0.3) sim.declareIndependence(c);
      void O;
      return;
    }
    if (N.ai && sim.vassalsOf(c).length) aiImperialCourt(sim, this, c);
    for (const v of sim.vassalsOf(c)) if (N.ai && sim.canIntegrate(c, v).ok && (sim.owned.get(v)?.size || 0) <= 4 && Math.random() < 0.05 + t.expansion * 0.08) sim.integrateVassal(c, v);
    if (!N.ai) return;
    const wars = sim.warsOf(c);
    const myP = sim.realmPower(c) + 1;
    // winning a war: demand submission rather than fight to the last town
    for (const e of wars) {
      const E = s.nations[e]; if (!E?.alive || E.overlord) continue;
      const core = s.regions.filter(r => r.core === e).length || 1, lost = s.regions.filter(r => r.core === e && r.owner !== e).length / core;
      if (myP > (sim.realmPower(e) + 1) * 1.8 && (E.exhaustion > 0.3 || lost > 0.3) && Math.random() < 0.5) {
        if (e === s.player) { if (!s.messages.some(m => m.from === c && m.status === 'pending' && m.proposal?.type === 'vassalDemand')) sim.message(c, e, 'You cannot win this war. Kneel as our vassal, pay tribute, and the fighting ends.', { type: 'vassalDemand' }); }
        else if (this.evaluate(e, c, { type: 'vassalPeace' }).ok) sim.makeVassal(e, c, 'war');
      }
    }
    // overawe weak neighbours in peacetime
    if (!wars.length && Math.random() < 0.1 + t.aggression * 0.12) {
      const cap = sim.anchor(N.capital);
      const near = (N.known || []).filter(o => { const X = s.nations[o]; return X?.alive && !X.overlord && sim.realmOf(o) === o && kmBetween(cap, sim.anchor(X.capital)) < 2800; });
      for (const o of near.sort(() => Math.random() - 0.5)) {
        const theirP = sim.realmPower(o) + 1;
        if (o === s.player) {
          if (myP > theirP * 5 && t.aggression > 0.5 && Math.random() < 0.2 && !s.messages.some(m => m.from === c && m.status === 'pending')) sim.message(c, o, 'Our power dwarfs yours. Swear fealty to us, pay tribute, and live in peace under our protection. Refuse, and we will remember it.', { type: 'vassalDemand' });
          continue;
        }
        if (myP > theirP * 3 && this.evaluate(o, c, { type: 'vassal' }).ok) { sim.makeVassal(o, c); break; }
      }
    }
  }
  seekPeace(c, e) {
    const sim = this.sim, s = sim.s;
    if (e === s.player) {
      if (!s.messages.some(m => m.from === c && m.status === 'pending' && m.proposal?.type === 'peace'))
        sim.message(c, e, pick(['This war has cost both our peoples enough. Let us make peace.', 'We are ready to lay down our arms. Will you accept peace?']), { type: 'peace' });
      return;
    }
    const E = s.nations[e];
    if (E.exhaustion > 0.25 || this.power(e) < this.power(c) * 1.6 || Math.random() < 0.2) sim.makePeace(c, e);
  }

  // ------------------------------------------------------------ operations
  operations(c) {
    const sim = this.sim, s = sim.s, w = sim.w, N = s.nations[c];
    const wars = sim.warsOf(c);
    const units = sim.unitsOf(c);
    const idle = units.filter(u => !u.move && !u.group);
    const land = idle.filter(u => UNITS[u.type].domain === 'land' && !w.regions[u.loc].sea && UNITS[u.type].atk > 0);
    const sea = idle.filter(u => UNITS[u.type].domain === 'sea');
    const air = idle.filter(u => UNITS[u.type].domain === 'air');
    if (!wars.length) { N.campaigns = []; N.warNeed = 0; N.needLift = 0; this.peacetime(c, land, sea); return; }
    const enemyStrAt = this.warOps(c, wars);
    if (!(N.campaigns || []).length) this.invasion(c, wars, land.filter(u => !u.move));
    this.navy(c, wars, sea);
    for (const u of air) {
      const T = UNITS[u.type];
      if (T.role === 'bomber') {
        const tgt = s.regions.filter(r => !r.sea && wars.includes(r.owner) && kmBetween(sim.anchor(u.loc), sim.anchor(r.i)) <= T.radius).sort((a, b) => (enemyStrAt.get(b.i) || 0) + (b.bld.workshop || 0) - (enemyStrAt.get(a.i) || 0) - (a.bld.workshop || 0))[0];
        u.mission = tgt ? { strike: tgt.i } : null;
      }
      const stage = (N.campaigns || [])[0]?.stage;
      if ((T.role === 'fighter' || !u.mission) && stage !== undefined && stage !== u.loc && s.regions[stage]?.owner === c) sim.order([u.id], stage);
    }
  }
  // ------------------------------------------------------------ war: defend, then campaign with concentrated armies
  // Returns enemy land strength by tile (used for air strikes).
  warOps(c, wars) {
    const sim = this.sim, s = sim.s, w = sim.w, N = s.nations[c];
    const isLand = u => UNITS[u.type].domain === 'land' && UNITS[u.type].atk > 0;
    const str = u => sim.strength(u);
    const mine = sim.unitsOf(c).filter(u => isLand(u) && !u.group && !w.regions[u.loc].sea);
    const enemyAt = new Map(), enemyHeading = new Map();
    for (const u of s.units) {
      if (!wars.includes(u.nation) || !isLand(u)) continue;
      enemyAt.set(u.loc, (enemyAt.get(u.loc) || 0) + str(u));
      if (u.move) { const d = u.move.path.at(-1); enemyHeading.set(d, (enemyHeading.get(d) || 0) + str(u)); }
    }
    const assigned = new Set();
    const dest = u => (u.move ? u.move.path.at(-1) : u.loc);
    const send = (us, to) => {
      const ids = []; for (const u of us) { assigned.add(u.id); if (dest(u) !== to) ids.push(u.id); }
      if (!ids.length) return;
      const r = sim.order(ids, to);
      if (!r.ok && /sealift/i.test(r.reason || '')) for (const id of ids) if (!sim.order([id], to).ok) break;
    };
    const distTo = (u, i) => kmBetween(u.pos, sim.anchor(i));
    // 1) hold sieges and battles we are winning; never abandon a town about to fall
    const byTile = new Map(); for (const u of mine) if (!u.move) { if (!byTile.has(u.loc)) byTile.set(u.loc, []); byTile.get(u.loc).push(u); }
    for (const [loc, here] of byTile) {
      const r = s.regions[loc];
      if (!r.owner || !wars.includes(r.owner)) continue;
      const ours = here.reduce((a, u) => a + str(u), 0), theirs = enemyAt.get(loc) || 0;
      const power = sim.siegePower(here, s.nations[r.owner].age), gar = sim.garrison(r);
      const winning = theirs ? ours > theirs * 1.05 : power > gar || (r.capture?.by === c && r.capture.p > 0.3);
      if (winning) for (const u of here) assigned.add(u.id);
    }
    // 2) badly hurt units fall back to friendly land to recover
    const homeNear = u => sim.regionsOf(c).reduce((b, r) => (!b || distTo(u, r.i) < distTo(u, b.i) ? r : b), null);
    for (const u of mine) if (!assigned.has(u.id) && u.hp < u.mhp * 0.3 && s.regions[u.loc].owner !== c) { const h = homeNear(u); if (h) send([u], h.i); }
    // 3) defense: meet enemies in or marching on our lands, the capital first
    const threats = [];
    for (const r of sim.regionsOf(c)) {
      let t = (enemyAt.get(r.i) || 0) * 1.2 + (enemyHeading.get(r.i) || 0);
      for (const j of w.adj[r.i]) if (!w.regions[j].sea) t += (enemyAt.get(j) || 0) * 0.5;
      if (t > 0) threats.push({ i: r.i, raw: t, pri: t * (r.i === N.capital ? 1.8 : 1) * (1 + (r.lvl || 0) * 0.12) });
    }
    threats.sort((a, b) => b.pri - a.pri);
    for (const th of threats.slice(0, 4)) {
      let have = 0;
      for (const u of mine) if (dest(u) === th.i) { have += str(u); assigned.add(u.id); }
      const need = th.raw * 1.15;
      if (have >= need) continue;
      const pool = mine.filter(u => !assigned.has(u.id) && distTo(u, th.i) < 1500).sort((a, b) => distTo(a, th.i) - distTo(b, th.i));
      const go = [];
      for (const u of pool) { if (have >= need) break; go.push(u); have += str(u); }
      if (go.length) send(go, th.i);
    }
    // 4) offense: one or more campaigns against enemy towns, armies massed before they strike
    const avail = () => mine.filter(u => !assigned.has(u.id) && u.hp > u.mhp * 0.45);
    N.campaigns = (N.campaigns || []).filter(cp => { const o = s.regions[cp.target]?.owner; return o && wars.includes(o) && s.t - cp.since < 24 * 45; });
    let free = avail();
    if (!free.length) { N.warNeed = threats.length ? 3 : 1; return enemyAt; }
    const maxCamps = Math.min(3, 1 + Math.floor(free.length / 10));
    const refStr = UNITS['INF' + N.age] ? (UNITS['INF' + N.age].atk + UNITS['INF' + N.age].def) / 2 : 2;
    // what it takes to win a tile: beat its defenders in battle, then out-power its garrison
    const need = j => { const r = s.regions[j]; const dA = s.nations[r.owner].age; const T = UNITS['INF' + dA]; return { fight: (enemyAt.get(j) || 0) * 1.3 + (enemyHeading.get(j) || 0) * 0.6, siege: sim.garrison(r) * 1.25, defAge: dA, gref: (T.atk + T.def) / 2 }; };
    const centroid = us => { let la = 0, lo = 0; for (const u of us) { la += u.pos[0]; lo += u.pos[1]; } return [la / us.length, lo / us.length]; };
    let needUnits = 0;
    const freeSiege = dA => sim.siegePower(avail(), dA);
    while (N.campaigns.length < maxCamps && free.length) {
      const base = centroid(free);
      const rep = free[0];
      const cand = [];
      for (const e of wars) for (const r of sim.regionsOf(e)) {
        const km = kmBetween(base, sim.anchor(r.i));
        if (km > 4500) continue;
        const n = need(r.i);
        const value = 2 + Math.sqrt(r.pop || 0) * 0.35 + (r.lvl || 0) * 1.5 + (s.nations[e].capital === r.i ? 6 : 0) + (r.core === c ? 8 : 0) + (w.adj[r.i].some(j => s.regions[j].owner === c) ? 3 : 0);
        cand.push({ i: r.i, score: value / (1 + km / 700) / (1 + n.fight / (refStr * free.length + 1)) / (0.4 + n.siege / (freeSiege(n.defAge) + 0.3)) });
      }
      cand.sort((a, b) => b.score - a.score);
      let pick = null;
      for (const cd of cand.slice(0, 6)) {
        if (N.campaigns.some(cp => cp.target === cd.i)) continue;
        const p = sim.planPath([rep], cd.i);
        if (p.path && !p.blockers?.size) { pick = cd.i; break; }
      }
      if (pick === null) {
        // enemies only reachable by water: build boats and gather on the coast
        const probe = cand.slice(0, 3).map(cd => sim.planPath([rep], cd.i)).find(p => /sealift/i.test(p.reason || ''));
        if (probe) {
          N.needLift = Math.min(8, Math.max(3, Math.ceil(free.length * 0.7)));
          const coast = sim.regionsOf(c).filter(r => sim.T[r.i].coastal).sort((x, y) => kmBetween(sim.anchor(x.i), base) - kmBetween(sim.anchor(y.i), base))[0];
          if (coast) send(free, coast.i);
        }
        break;
      }
      N.needLift = 0;
      const own = sim.regionsOf(c).sort((a, b) => kmBetween(sim.anchor(a.i), sim.anchor(pick)) - kmBetween(sim.anchor(b.i), sim.anchor(pick)))[0];
      N.campaigns.push({ target: pick, stage: own ? own.i : rep.loc, since: s.t });
      if (free.length < 12) break;
    }
    for (const cp of N.campaigns) {
      free = avail();
      if (!free.length) break;
      const n = need(cp.target);
      // share forces between campaigns: the first gets what it needs plus a margin
      const pool = free.sort((a, b) => distTo(a, cp.target) - distTo(b, cp.target));
      const army = []; let st = 0;
      const wantStr = Math.max(n.fight * 1.6, n.siege * n.gref * 1.6, refStr * 3);
      for (const u of pool) { army.push(u); st += str(u); if (N.campaigns.length > 1 && st > wantStr * 1.4) break; }
      const siege = sim.siegePower(army, n.defAge);
      const ready = st > n.fight && siege > n.siege;
      const there = army.filter(u => u.loc === cp.target && !u.move);
      const holdField = there.length && !(enemyAt.get(cp.target) > 0) && there.reduce((a, u) => a + str(u), 0) > 0;
      if (ready || holdField) {
        send(army, cp.target);
        cp.status = ready ? 'attacking' : 'besieging';
        if (!ready) needUnits += Math.ceil(Math.max(0, (n.siege - siege) * n.gref) / refStr) + 1;
      } else {
        // mass at the staging town nearest the objective until strong enough
        send(army, cp.stage);
        cp.status = 'massing';
        const shortStr = Math.max(n.fight - st, (n.siege - siege) * n.gref);
        needUnits += Math.ceil(Math.max(0, shortStr) / refStr) + 1;
      }
    }
    N.warNeed = Math.min(12, needUnits + (threats.length ? 2 : 0));
    // anything still unassigned and away from home joins the nearest campaign staging point
    for (const u of avail()) { const cp = N.campaigns[0]; if (cp) send([u], cp.stage); }
    return enemyAt;
  }
  peacetime(c, land, sea) {
    const sim = this.sim, s = sim.s, w = sim.w, N = s.nations[c];
    if ((s.t + (this.phase[c] || 0)) % 48 >= 12) return;
    // subdue natives
    const sub = (N.subjugate || [])[0];
    if (sub !== undefined && land.length >= 2) {
      const gar = sim.garrison(s.regions[sub]);
      const force = [];
      let p = 0;
      for (const u of land.sort((a, b) => kmBetween(a.pos, sim.anchor(sub)) - kmBetween(b.pos, sim.anchor(sub)))) {
        if (u.loc === N.capital && land.filter(x => x.loc === N.capital).length <= 1) continue;
        force.push(u); p += sim.siegePower([u], Math.max(0, N.age - 1));
        if (p > gar * 1.4) break;
      }
      if (p > gar * 1.1) { const movers = force.filter(u => u.loc !== sub).map(u => u.id); if (movers.length) sim.order(movers, sub); return; }
    }
    // garrison exposed borders
    const nb = this.neighbours(c);
    const worried = [...nb.keys()].filter(o => sim.opinion(c, o) < -10 && sim.rel(c, o) !== 'alliance');
    const border = sim.regionsOf(c).filter(r => w.adj[r.i].some(j => worried.includes(s.regions[j].owner)));
    const home = land.filter(u => s.regions[u.loc].owner === c);
    if (border.length) {
      const counts = new Map(); for (const u of home) counts.set(u.loc, (counts.get(u.loc) || 0) + 1);
      for (const u of home) {
        if (border.some(b => b.i === u.loc) || (counts.get(u.loc) || 0) <= 1) continue;
        const b = border.reduce((a, x) => ((counts.get(x.i) || 0) < (counts.get(a.i) || 0) ? x : a));
        counts.set(u.loc, counts.get(u.loc) - 1); counts.set(b.i, (counts.get(b.i) || 0) + 1);
        sim.order([u.id], b.i);
      }
    }
    // units stranded abroad come home
    for (const u of land) if (s.regions[u.loc].owner !== c && !(N.subjugate || []).includes(u.loc)) sim.order([u.id], N.capital);
    const hs = sim.seaNear(N.capital);
    if (hs >= 0) for (const u of sea) if (kmBetween(u.pos, sim.anchor(hs)) > 1500) sim.order([u.id], hs);
  }
  invasion(c, wars, land) {
    const sim = this.sim, s = sim.s, w = sim.w;
    if (!land.length || Math.random() > 0.35) return;
    const lift = sim.sealift(c) - sim.embarked(c);
    if (lift < 2) return;
    const byLoc = new Map(); for (const u of land) { if (!byLoc.has(u.loc)) byLoc.set(u.loc, []); byLoc.get(u.loc).push(u); }
    let best = null;
    for (const [loc, us] of byLoc) {
      if (!w.regions[loc].coastal || us.length < 2) continue;
      const near = w.within(loc, 5, j => w.regions[j].sea || wars.includes(s.regions[j].owner));
      for (const [j, d] of near) {
        if (w.regions[j].sea || !wars.includes(s.regions[j].owner)) continue;
        const def = s.units.filter(u => u.loc === j && wars.includes(u.nation)).reduce((a, u) => a + sim.strength(u), 0);
        const str = us.slice(0, lift).reduce((a, u) => a + sim.strength(u), 0);
        if (str < def * 1.5 + 1) continue;
        const sc = ((s.regions[j].pop || 0) ** 0.5 + 5) / (d + 1) / (def + 1);
        if (!best || sc > best.sc) best = { sc, j, us: us.slice(0, Math.min(lift, us.length - 1)) };
      }
    }
    if (best && best.us.length) {
      const r = sim.order(best.us.map(u => u.id), best.j);
      if (r.ok && s.regions[best.j].owner === s.player) sim.emit('war', `SCOUTS: a ${sim.nm(c)} fleet carrying troops is heading for ${w.regions[best.j].name}.`, [c, s.player], { loc: best.j });
    }
  }
  navy(c, wars, sea) {
    const sim = this.sim, s = sim.s, w = sim.w;
    if (!sea.length) return;
    const enemyNav = new Map();
    for (const u of s.units) if (UNITS[u.type].domain === 'sea' && wars.includes(u.nation)) enemyNav.set(u.loc, (enemyNav.get(u.loc) || 0) + sim.strength(u));
    const groups = new Map(); for (const u of sea) { if (UNITS[u.type].lift) continue; if (!groups.has(u.loc)) groups.set(u.loc, []); groups.get(u.loc).push(u); }
    for (const [loc, us] of groups) {
      const ocean = us.every(u => UNITS[u.type].ocean);
      const reach = w.within(loc, 6, j => w.regions[j].sea && (!w.regions[j].deep || ocean));
      const subs = us.filter(u => UNITS[u.type].role === 'sub'), surface = us.filter(u => UNITS[u.type].role !== 'sub');
      if (subs.length) { const lanes = s.trades.filter(t => wars.includes(t.from) || wars.includes(t.to)).flatMap(t => t.path.filter(j => w.regions[j].sea && reach.has(j))); const tgt = lanes.length ? pick(lanes) : null; if (tgt !== null && tgt !== loc) sim.order(subs.map(u => u.id), tgt); }
      if (!surface.length) continue;
      const str = surface.reduce((a, u) => a + sim.strength(u), 0);
      let tgt = null, bs = 0;
      for (const [j, d] of reach) {
        const e = enemyNav.get(j) || 0; let sc = 0;
        if (e > 0 && str > e * 1.3) sc = 10 / (d + 1);
        else if (!e && w.adj[j].some(k => wars.includes(s.regions[k].owner))) sc = 3 / (d + 1);
        if (sc > bs) { bs = sc; tgt = j; }
      }
      if (tgt !== null && tgt !== loc) sim.order(surface.map(u => u.id), tgt);
    }
  }

  // ------------------------------------------------------------ daily diplomacy: trade, opinions, outreach
  dailyDiplomacy() {
    const sim = this.sim, s = sim.s;
    const live = Object.values(s.nations).filter(n => n.alive);
    for (const a of live) {
      const op = s.opinion[a.code] || {};
      for (const b in op) { let v = op[b] * 0.997; const r = sim.rel(a.code, b); if (r === 'alliance') v += 0.08; if (r === 'war') v -= 0.15; op[b] = clamp(v, -100, 100); }
    }
    for (const t of s.trades) { sim.addOpinion(t.from, t.to, 0.05); sim.addOpinion(t.to, t.from, 0.05); }
    const P = s.nations[s.player];
    for (const N of live) {
      if (!N.ai || s.t % 72 !== (this.phase[N.code] || 0) % 3 * 24 + 12) continue;
      // goods
      for (const good of GOODS) {
        const net = N.st.net[good] || 0, stock = N[good] || 0;
        const need = good === 'food' ? (net < 0 && stock < N.st.foodCons * 20) : (net <= 0 && stock < 8 * ageScale(N.age) && (good !== 'oil' || N.age >= 7) && (good !== 'metal' || N.age >= 1));
        if (!need || s.trades.some(t => t.to === N.code && t.good === good && t.since > s.t - 24 * 20)) continue;
        const amt = +(Math.max(-net, 0.02 * ageScale(N.age)) * 1.15).toFixed(2);
        const sellers = live.filter(x => x.code !== N.code && sim.knows(N.code, x.code) && (x.st.net[good] || 0) > amt * 0.5 && !sim.atWar(x.code, N.code) && sim.opinion(x.code, N.code) > -30)
          .sort((a, b) => (b.st.net[good] || 0) - (a.st.net[good] || 0));
        const seller = sellers[0]; if (!seller) continue;
        const price = +(s.prices[good] * 1.05).toFixed(2);
        if (N.wealth < amt * price * 20 && N.age >= 1) continue;
        if (seller.code === s.player) { if (!s.messages.some(m => m.from === N.code && m.status === 'pending' && m.proposal?.type === 'trade')) sim.message(N.code, s.player, `We wish to buy ${amt} ${good} per day from you at ${price} wealth each.`, { type: 'trade', good, amount: amt, price, from: s.player, to: N.code }); }
        else sim.addTrade(seller.code, N.code, good, amt, price);
      }
      // strategic resources the war machine needs
      for (const k of this.neededResources(N.code)) {
        if (N.access?.[k] || s.trades.some(t => t.to === N.code && t.good === 'res:' + k)) continue;
        if (!known(N, k)) continue;
        const sellers = live.filter(x => x.code !== N.code && sim.knows(N.code, x.code) && (x.access?.[k] || 0) >= 1 && !sim.atWar(x.code, N.code) && sim.opinion(x.code, N.code) > -20 && sim.regionsOf(x.code).some(r => r.dep.some(d => d.r === k && (r.imp[RES[k].imp] || 0) > 0)));
        const seller = sellers.sort((a, b) => sim.opinion(b.code, N.code) - sim.opinion(a.code, N.code))[0];
        if (!seller) continue;
        const price = +(0.06 * ageScale(Math.max(N.age, seller.age))).toFixed(2);
        if (seller.code === s.player) { if (!s.messages.some(m => m.from === N.code && m.status === 'pending')) sim.message(N.code, s.player, `We seek access to your ${RES[k].name}. We offer ${price} wealth per day.`, { type: 'trade', good: 'res:' + k, amount: 1, price, from: s.player, to: N.code }); }
        else if (this.evaluate(seller.code, N.code, { type: 'trade', good: 'res:' + k, amount: 1, price, from: seller.code, to: N.code }).ok) sim.addTrade(seller.code, N.code, 'res:' + k, 1, price);
      }
    }
    if (P.alive && Math.random() < 0.2) {
      for (const good of ['food', 'wood', 'stone', 'metal']) {
        const net = P.st.net[good] || 0; if (net >= 0 || P[good] > 10 * ageScale(P.age)) continue;
        const seller = live.filter(x => x.ai && sim.knows(x.code, P.code) && (x.st.net[good] || 0) > -net && !sim.atWar(x.code, s.player) && sim.opinion(x.code, s.player) > -20)[0];
        if (seller && !s.messages.some(m => m.from === seller.code && m.status === 'pending')) {
          const amount = +(-net * 1.1).toFixed(2), price = +(s.prices[good] * 1.1).toFixed(2);
          sim.message(seller.code, s.player, `Our merchants hear you are short of ${good}. We can supply ${amount} ${good} per day at ${price} wealth each.`, { type: 'trade', good, amount, price, from: seller.code, to: s.player });
        }
      }
      for (const [o] of this.neighbours(s.player)) {
        if (!s.nations[o].alive || !s.nations[o].ai || !sim.knows(o, s.player)) continue;
        const r = sim.rel(o, s.player);
        if (r === 'peace' && sim.opinion(o, s.player) > 20 && Math.random() < 0.08) sim.message(o, s.player, 'Our peoples share a border and, we hope, an interest in peace. We propose a pact of non-aggression.', { type: 'nap' });
        if (r === 'peace' && sim.opinion(o, s.player) < -40 && Math.random() < 0.05) sim.message(o, s.player, 'We are watching you closely. Any hostile move will be answered.');
      }
    }
    for (const m of s.messages) if (m.status === 'pending' && s.t - m.t > 24 * 20) m.status = 'expired';
  }

  // ------------------------------------------------------------ player delegation
  delegate(c) {
    const sim = this.sim, s = sim.s, N = s.nations[c], D = N.directives;
    N.delegLog ||= [];
    const log = t => { N.delegLog.push({ t: s.t, y: s.year, text: t }); if (N.delegLog.length > 40) N.delegLog.shift(); };
    if (D.industry !== 'off') {
      if (sim.canAdvance(c).ok && D.industry === 'balanced') { sim.advance(c); log('Works: the realm begins its advance into a new age.'); }
      this.develop(c, D.industry, D.budget, t => log('Works: ' + t));
    }
    if (D.defense !== 'off') { const n = this.production(c, D.defense, D.budget); if (n) { const q = N.queue[N.queue.length - 1]; log(`Defense: ordered ${UNITS[q.type].name} at ${sim.w.regions[q.region].name}.`); } }
    if (D.foreign !== 'off') this.foreignDirective(c, D.foreign, log);
    this.pursueTradeGoals(c, null, log);
  }
  // would a ruler buy this good? short of it (or running low) and able to pay, or rich enough to stockpile
  wantsGood(X, k, amt, price) {
    const st = X.st, a = ageScale(X.age);
    const cost = amt * price;
    const canPay = (X.wealth || 0) > cost * 10 || (st.net?.wealth || 0) > cost * 1.2;
    if (!canPay) return false;
    if (k === 'oil' && X.age < 6) return false;
    if (k === 'metal' && X.age < 1) return false;
    const low = k === 'food' ? (X.food || 0) < (st.foodCons || 0) * 20 : (X[k] || 0) < 25 * Math.pow(a, 0.9);
    return (st.net?.[k] || 0) < 0 || low || (X.wealth || 0) > cost * 40;
  }
  // A sell order: find peoples who want what we have, open high and come down no lower than the ruler's floor.
  sellGoal(c, g, env, skill, say) {
    const sim = this.sim, s = sim.s, N = s.nations[c];
    const res = g.good.startsWith('res:'), k = res ? g.good.slice(4) : g.good, name = res ? RES[k].name : k;
    const live = s.trades.filter(t => t.from === c && t.good === g.good && !t.blockaded);
    const have = res ? live.length : live.reduce((a, t) => a + t.amount, 0);
    const income = () => s.trades.filter(t => t.from === c && t.good === g.good && !t.blockaded).reduce((a, t) => a + t.amount * t.price, 0);
    let need = res ? g.amount - have : +(g.amount - have).toFixed(2);
    const done = () => res ? `Leasing ${name} to ${s.trades.filter(t => t.from === c && t.good === g.good).length} people for ${income().toFixed(2)} wealth/day.` : `Selling ${s.trades.filter(t => t.from === c && t.good === g.good && !t.blockaded).reduce((a, t) => a + t.amount, 0).toFixed(2)} ${name}/day for ${income().toFixed(2)} wealth/day.`;
    if (need <= (res ? 0 : g.amount * 0.05)) { g.ok = true; g.status = done(); return; }
    g.ok = false;
    if (res) {
      if (!sim.regionsOf(c).some(r => r.dep.some(d => d.r === k && (r.imp[RES[k].imp] || 0) > 0))) { g.status = `We do not work any ${name} ourselves. Build ${IMPROVEMENTS[RES[k].imp].name.toLowerCase()} on a ${name} deposit first.`; return; }
    } else {
      // never sell what we need: only the daily surplus plus a slice of the stockpile
      const spare = Math.max(0, (N.st.net[k] || 0) + have) + Math.max(0, (N[k] || 0) - (k === 'food' ? N.st.foodCons * 15 : 0)) / 40;
      const room = +(spare - have).toFixed(2);
      if (room < 0.02) { g.status = have ? `${done()} We have no more spare ${name}.` : `We have no spare ${name} to sell.`; return; }
      need = Math.min(need, room);
    }
    const known = (N.known || []).filter(x => s.nations[x]?.alive && !sim.atWar(c, x) && !sim.sanctioned(c, x));
    if (!known.length) { g.status = 'We have not met any people to trade with yet.'; return; }
    let buyers = known.map(x => s.nations[x]).filter(X => {
      if (s.trades.some(t => t.from === c && t.to === X.code && t.good === g.good)) return false;
      if (res) return !(X.access?.[k] > 0);
      return this.wantsGood(X, k, Math.max(0.05, need * 0.5), s.prices[k]);
    });
    // those who need it most come first
    const want = X => res ? (this.neededResources(X.code).has(k) ? 3 : RES[k].kind === 'luxury' ? 1 : 0) : -(X.st.net[k] || 0) / Math.max(0.05, X.st.foodCons || 1);
    buyers.sort((A, B) => want(B) - want(A) + (sim.opinion(B.code, c) - sim.opinion(A.code, c)) / 60);
    buyers = buyers.slice(0, Math.max(1, Math.ceil(buyers.length * Math.min(1, 0.35 + skill * 0.08))));
    if (!buyers.length) { g.status = have ? `${done()} No other buyers right now.` : `None of the peoples we know needs ${name} or can pay for it right now. Your envoy will keep asking.`; return; }
    const floorK = (TRADE_FLOOR[g.will] || TRADE_FLOOR.fair).mult * (env?.traits.includes('Corrupt') ? 0.94 : 1);
    const rounds = 1 + Math.floor(skill / 3);
    let why = '', got = 0;
    for (const X of buyers) {
      if (need <= (res ? 0 : g.amount * 0.05)) break;
      if (!sim.tradePath(c, X.code)) { why = `No trade route to the ${sim.nm(X.code)} (by sea, both peoples need Sailing).`; continue; }
      const amt = res ? 1 : +Math.max(0.02, Math.min(need, (X.st.net[k] || 0) < 0 ? -(X.st.net[k]) * 1.2 : need)).toFixed(2);
      const fair = res ? 0.05 * ageScale(Math.max(N.age, X.age)) : s.prices[k];
      const floor = fair * floorK;
      let price = Math.max(floor, fair * (1.3 + skill * 0.025));
      let deal = null;
      for (let r = 0; r < rounds; r++) {
        const p = { type: 'trade', good: g.good, amount: amt, price: +price.toFixed(3), from: c, to: X.code };
        if (this.evaluate(X.code, c, p).ok) { deal = p; break; }
        if (price <= floor) break;
        price = Math.max(floor, price - (price - floor) / Math.max(1, rounds - r - 1) - fair * 0.02);
      }
      if (!deal) { why = `The ${sim.nm(X.code)} will not pay our price.`; continue; }
      const t = sim.addTrade(c, X.code, g.good, deal.amount, deal.price);
      if (!t) { why = `No trade route to the ${sim.nm(X.code)}.`; continue; }
      t.goal = g.id; got++;
      need = res ? need - 1 : +(need - deal.amount).toFixed(2);
      const what = res ? `${name} access` : `${deal.amount} ${name}/day`;
      say(`sold ${what} to the ${sim.nm(X.code)} for ${(deal.amount * deal.price).toFixed(2)} wealth a day.`);
      if (c === s.player) sim.emit('trade', `${env ? env.name + ', our envoy, ' : 'Our envoy '}sold ${what} to the ${sim.nm(X.code)} for ${(deal.amount * deal.price).toFixed(2)} wealth a day.`, [c, X.code]);
    }
    g.ok = need <= (res ? 0 : g.amount * 0.05);
    g.status = g.ok ? done() : got || have ? `${done()} Looking for more buyers. ${why}` : (why || 'No buyers yet. Still looking.');
  }
  // The envoy works through the ruler's shopping list: finds sellers among known peoples, haggles, and keeps supplies flowing.
  // Skill decides how many partners they think of, how many rounds they haggle, and how low they open.
  pursueTradeGoals(c, force = null, log = null) {
    const sim = this.sim, s = sim.s, N = s.nations[c];
    const goals = N.tradeGoals || []; if (!goals.length) return;
    const env = s.chars[N.gov.cabinet.foreign];
    const skill = env ? env.skill * (env.traits.includes('Visionary') ? 1.3 : 1) : 2;
    const corrupt = env?.traits.includes('Corrupt') ? 1.06 : 1;
    const say = t => { log?.('Envoys: ' + t); };
    for (const g of goals) {
      if (force !== null && g.id !== force) continue;
      if (force === null && (g.next || 0) > s.t) continue;
      g.next = s.t + 24 * (skill >= 7 ? 2 : skill >= 4 ? 3 : 5);
      if (g.dir === 'sell') { this.sellGoal(c, g, env, skill, say); continue; }
      const res = g.good.startsWith('res:'), k = res ? g.good.slice(4) : g.good;
      const name = res ? RES[k].name : k;
      const imports = s.trades.filter(t => t.to === c && t.good === g.good);
      const flowing = imports.filter(t => !t.blockaded);
      const have = res ? (N.access?.[k] || 0) : flowing.reduce((a, t) => a + t.amount, 0);
      let need = res ? (have > 0 ? 0 : 1) : +(g.amount - have).toFixed(2);
      if (res ? need <= 0 : need <= g.amount * 0.05) {
        g.ok = true;
        g.status = res ? (flowing.length ? `Supplied by the ${flowing.map(t => sim.nm(t.from)).join(' and the ')}.` : `We work our own ${name}.`) : `Target met: ${have.toFixed(2)} of ${g.amount} per day.`;
        continue;
      }
      g.ok = false;
      const known = (N.known || []).filter(x => s.nations[x]?.alive && !sim.atWar(c, x) && !sim.sanctioned(c, x));
      if (!known.length) { g.status = 'We have not met any people to trade with yet.'; continue; }
      let sellers = known.map(x => s.nations[x]).filter(X => {
        if (imports.some(t => t.from === X.code)) return false;
        if (res) return (X.access?.[k] || 0) >= 1 && sim.regionsOf(X.code).some(r => r.dep.some(d => d.r === k && (r.imp[RES[k].imp] || 0) > 0));
        return (X.st.net?.[k] || 0) > 0.03;
      });
      sellers.sort((A, B) => (res ? 0 : (B.st.net[k] || 0) - (A.st.net[k] || 0)) + (sim.opinion(B.code, c) - sim.opinion(A.code, c)) / 50);
      const reach = Math.max(1, Math.ceil(sellers.length * Math.min(1, 0.35 + skill * 0.08)));
      sellers = sellers.slice(0, reach);
      if (!sellers.length) { g.status = res ? `None of the peoples we know can spare ${name}.` : `No people we know has spare ${name} right now.`; continue; }
      const cap = (TRADE_WILL[g.will] || TRADE_WILL.fair).mult;
      const rounds = 1 + Math.floor(skill / 3);
      let why = '', got = 0;
      for (const X of sellers) {
        if (need <= (res ? 0 : g.amount * 0.05)) break;
        if (!sim.tradePath(X.code, c)) { why = `No trade route to the ${sim.nm(X.code)} (by sea, both peoples need Sailing).`; continue; }
        const amt = res ? 1 : +Math.max(0.01, Math.min(need, (X.st.net[k] || 0) * 0.8)).toFixed(2);
        const fair = res ? 0.05 * ageScale(Math.max(N.age, X.age)) : s.prices[k];
        const maxP = fair * cap * corrupt;
        let price = fair * Math.max(0.7, 0.92 - skill * 0.012) * corrupt;
        let deal = null;
        for (let r = 0; r < rounds; r++) {
          const p = { type: 'trade', good: g.good, amount: amt, price: +price.toFixed(3), from: X.code, to: c };
          if (this.evaluate(X.code, c, p).ok) { deal = p; break; }
          if (price >= maxP) break;
          price = Math.min(maxP, price + (maxP - price) / Math.max(1, rounds - r - 1) + fair * 0.02);
        }
        if (!deal) { why = `The ${sim.nm(X.code)} want more than we are willing to pay.`; continue; }
        const daily = deal.amount * deal.price;
        if (N.age >= 1 && N.wealth < daily * 10 && (N.st.net.wealth || 0) < daily) { why = `Our treasury cannot sustain ${daily.toFixed(2)} wealth a day more.`; break; }
        const t = sim.addTrade(X.code, c, g.good, deal.amount, deal.price);
        if (!t) { why = `No trade route to the ${sim.nm(X.code)}.`; continue; }
        t.goal = g.id; got++;
        sim.computeAccess(N);
        need = res ? 0 : +(need - deal.amount).toFixed(2);
        const what = res ? `${name} access` : `${deal.amount} ${name}/day`;
        say(`secured ${what} from the ${sim.nm(X.code)} at ${deal.price.toFixed(2)} wealth${res ? ' a day' : ' each'}.`);
        if (c === s.player) sim.emit('trade', `${env ? env.name + ', our envoy, ' : 'Our envoy '}secured ${what} from the ${sim.nm(X.code)} for ${daily.toFixed(2)} wealth a day.`, [c, X.code]);
      }
      const nowHave = res ? (got ? 1 : 0) : have + (g.amount - have - need);
      g.ok = res ? got > 0 : need <= g.amount * 0.05;
      g.status = g.ok ? (res ? `Secured.` : `Target met: ${nowHave.toFixed(2)} of ${g.amount} per day.`) : got ? `Partly secured: ${nowHave.toFixed(2)} of ${g.amount} per day. Still looking. ${why}` : (why || 'No deal yet. Still looking.');
    }
  }
  foreignDirective(c, mode, log) {
    const sim = this.sim, s = sim.s, N = s.nations[c];
    const live = Object.values(s.nations).filter(n => n.alive && n.code !== c && sim.knows(c, n.code));
    for (const good of GOODS) {
      const net = N.st.net[good] || 0;
      if (net >= 0 || s.trades.some(t => t.to === c && t.good === good && t.since > s.t - 24 * 15)) continue;
      const seller = live.filter(x => (x.st.net[good] || 0) > -net * 0.6 && !sim.atWar(x.code, c) && sim.opinion(x.code, c) > -30).sort((a, b) => sim.opinion(b.code, c) - sim.opinion(a.code, c))[0];
      if (!seller) continue;
      const p = { type: 'trade', good, amount: +(-net * 1.15).toFixed(2), price: +(s.prices[good] * 1.08).toFixed(2), from: seller.code, to: c };
      if (this.evaluate(seller.code, c, p).ok && sim.addTrade(seller.code, c, good, p.amount, p.price)) log(`Envoys: secured ${p.amount} ${good}/day from the ${sim.nm(seller.code)}.`);
    }
    for (const k of this.neededResources(c)) {
      if (N.access?.[k] || !known(N, k)) continue;
      const seller = live.find(x => (x.access?.[k] || 0) >= 1 && !sim.atWar(x.code, c));
      if (!seller) continue;
      const p = { type: 'trade', good: 'res:' + k, amount: 1, price: +(0.06 * ageScale(N.age)).toFixed(2), from: seller.code, to: c };
      if (this.evaluate(seller.code, c, p).ok && sim.addTrade(seller.code, c, p.good, 1, p.price)) log(`Envoys: the ${sim.nm(seller.code)} will supply us with ${RES[k].name}.`);
    }
    if (mode === 'relations' || mode === 'alliances') {
      const nb = [...this.neighbours(c).keys()].filter(o => s.nations[o].alive && sim.rel(c, o) === 'peace' && sim.knows(c, o));
      const worst = nb.sort((a, b) => sim.opinion(a, c) - sim.opinion(b, c))[0];
      const gift = 2 * ageScale(N.age);
      if (worst && N.wealth > gift * 8 && Math.random() < 0.3) { sim.gift(c, worst, 'wealth', gift); log(`Envoys: gifts sent to the ${sim.nm(worst)}.`); }
      const cand = nb.find(x => this.evaluate(x, c, { type: 'nap' }).ok);
      if (cand && Math.random() < 0.25) { sim.setRel(c, cand, 'nap'); sim.emit('treaty', `The ${sim.nm(c)} and the ${sim.nm(cand)} swear a pact of non-aggression.`, [c, cand]); log(`Envoys: non-aggression pact with the ${sim.nm(cand)}.`); }
    }
    if (mode === 'alliances') {
      const cand = live.map(n => n.code).find(x => sim.rel(c, x) === 'nap' && this.evaluate(x, c, { type: 'alliance' }).ok);
      if (cand && Math.random() < 0.2) { sim.setRel(c, cand, 'alliance'); sim.emit('treaty', `The ${sim.nm(c)} and the ${sim.nm(cand)} form an alliance.`, [c, cand]); log(`Envoys: alliance with the ${sim.nm(cand)}.`); }
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
        g.status = `Drilling. Average experience ${(units.reduce((a, u) => a + (u.xp || 0), 0) / units.length).toFixed(0)}/100.`;
        continue;
      }
      if (o.type === 'subdue') {
        const r = s.regions[o.region];
        if (!r || r.owner) { g.status = r?.owner === c ? `${w.regions[o.region].name} is ours.` : 'Target no longer holds natives.'; g.order = { type: 'hold' }; continue; }
        const N = s.nations[c]; N.subjugate = [...new Set([...(N.subjugate || []), o.region])];
        const movers = land.filter(u => u.loc !== o.region).map(u => u.id);
        if (movers.length) sim.order(movers, o.region);
        g.status = r.capture?.by === c ? `Subduing ${w.regions[o.region].name}: ${Math.round(r.capture.p * 100)}%.` : `Marching on the natives of ${w.regions[o.region].name}.`;
        continue;
      }
      if (o.type === 'defend') {
        const tgt = o.region, at = sim.anchor(tgt);
        const enemies = s.units.filter(e => sim.atWar(c, e.nation) && kmBetween(e.pos, at) < 600);
        const movers = land.filter(u => u.loc !== tgt);
        if (movers.length && !w.regions[tgt].sea) sim.order(movers.map(u => u.id), tgt);
        for (const u of sea) if (kmBetween(u.pos, at) > 500) { const sn = w.regions[tgt].sea ? tgt : sim.seaNear(tgt); if (sn >= 0) sim.order([u.id], sn); }
        const le = enemies.find(x => UNITS[x.type].domain === 'land' && !w.regions[x.loc].sea);
        for (const u of air) if (UNITS[u.type].role === 'bomber') u.mission = le ? { strike: le.loc } : null;
        g.status = enemies.length ? `Defending ${w.regions[tgt].name}: ${enemies.length} hostile units within 600 km.` : `Defending ${w.regions[tgt].name}. All quiet.`;
        continue;
      }
      if (o.type === 'attack') {
        const e = o.target;
        if (!s.nations[e]?.alive) { g.status = 'The enemy no longer exists.'; continue; }
        if (!sim.atWar(c, e)) { g.status = `Awaiting a declaration of war on the ${sim.nm(e)}.`; continue; }
        const enemyStr = new Map();
        for (const x of s.units) if (x.nation === e && UNITS[x.type].domain === 'land') enemyStr.set(x.loc, (enemyStr.get(x.loc) || 0) + sim.strength(x));
        const eRegions = sim.regionsOf(e);
        g.status = `Campaigning against the ${sim.nm(e)}.`;
        if (land.length) {
          const locs = [...new Set(land.map(u => u.loc))];
          const adjT = [...new Set(locs.flatMap(l => [l, ...w.adj[l]]).filter(j => s.regions[j].owner === e))];
          const myStr = land.reduce((a, u) => a + sim.strength(u), 0);
          const refA = UNITS['INF' + s.nations[e].age].atk;
          const defOf = j => (enemyStr.get(j) || 0) * (1 + (s.regions[j].bld.walls || 0) * 0.3) + sim.garrison(s.regions[j]) * refA;
          let tgt;
          const sieging = land.find(u => s.regions[u.loc].owner === e && (s.regions[u.loc].capture?.by === c || !enemyStr.get(u.loc)));
          if (sieging) tgt = sieging.loc;
          else if (adjT.length) tgt = adjT.sort((a, b) => (defOf(a) - (s.regions[a].pop || 0) ** 0.5 * 0.1) - (defOf(b) - (s.regions[b].pop || 0) ** 0.5 * 0.1))[0];
          else tgt = eRegions.sort((a, b) => kmBetween(land[0].pos, sim.anchor(a.i)) - kmBetween(land[0].pos, sim.anchor(b.i)))[0]?.i;
          if (tgt === undefined) continue;
          const def = defOf(tgt);
          if (myStr > def * 1.15 || !adjT.length) {
            const movers = land.filter(u => u.loc !== tgt).map(u => u.id);
            const r = movers.length ? sim.order(movers, tgt) : { ok: true };
            g.status = r.ok ? `Advancing on ${w.regions[tgt].name} (strength ${myStr.toFixed(0)} vs ${def.toFixed(0)}).` : `Cannot advance: ${r.reason || 'route blocked'}.`;
          } else g.status = `Massing: need more strength to take ${w.regions[tgt].name} (${myStr.toFixed(0)} vs ${def.toFixed(0)}).`;
        }
        if (sea.length) {
          const fleets = s.units.filter(x => x.nation === e && UNITS[x.type].domain === 'sea');
          const nearest = fleets.sort((a, b) => kmBetween(sea[0].pos, a.pos) - kmBetween(sea[0].pos, b.pos))[0];
          const coast = eRegions.filter(r => w.regions[r.i].coastal).sort((a, b) => kmBetween(sea[0].pos, sim.anchor(a.i)) - kmBetween(sea[0].pos, sim.anchor(b.i)))[0];
          const dest = nearest && kmBetween(sea[0].pos, nearest.pos) < 4000 ? nearest.loc : coast ? sim.seaNear(coast.i) : -1;
          if (dest >= 0 && dest !== sea[0].loc) sim.order(sea.map(u => u.id), dest);
        }
        for (const u of air) {
          if (UNITS[u.type].role !== 'bomber') continue;
          const tg = eRegions.filter(r => kmBetween(sim.anchor(u.loc), sim.anchor(r.i)) <= UNITS[u.type].radius).sort((a, b) => ((enemyStr.get(b.i) || 0) + (b.bld.workshop || 0) * 2) - ((enemyStr.get(a.i) || 0) + (a.bld.workshop || 0) * 2))[0];
          u.mission = tg ? { strike: tg.i } : null;
        }
      }
    }
  }

  // ------------------------------------------------------------ proposals to AI rulers
  evaluate(ai, from, p) {
    const sim = this.sim, s = sim.s, A = s.nations[ai], t = A.traits;
    if (!sim.knows(ai, from)) return { ok: false, why: 'They have never heard of us.' };
    const op = sim.opinion(ai, from), rel = sim.rel(ai, from);
    const myP = this.power(ai) + 1, theirP = this.power(from) + 1;
    const commonEnemy = sim.warsOf(ai).some(e => sim.atWar(from, e));
    let ok = false, why = '';
    if (p.type === 'nap') {
      if (rel !== 'peace') return { ok: false, why: rel === 'war' ? 'We are at war. Offer peace first.' : 'We already have a treaty.' };
      const sc = op / 20 + t.caution * 1.5 + (theirP > myP ? 1 : 0) - t.aggression;
      ok = sc > 0.6; why = ok ? (theirP > myP ? 'Peace with a strong neighbour is wise.' : 'Peace serves us both.') : 'We see no need to tie our hands.';
    } else if (p.type === 'alliance') {
      if (rel === 'war') return { ok: false, why: 'We are at war with you.' };
      if (rel === 'alliance') return { ok: false, why: 'We are already allies.' };
      const sc = op / 15 + (commonEnemy ? 2.5 : 0) + t.loyalty - (theirP > myP * 6 ? 1 : 0) + (rel === 'nap' ? 0.8 : 0);
      ok = sc > 3; why = ok ? (commonEnemy ? 'Together we will crush our common enemy.' : 'Our friendship has earned this.') : op < 20 ? 'We do not yet trust you enough.' : 'An alliance does not serve us now.';
    } else if (p.type === 'peace') {
      if (rel !== 'war') return { ok: false, why: 'We are not at war.' };
      const sc = A.exhaustion * 4 + (theirP > myP ? 1.5 : -0.5) + t.caution + op / 50 - t.aggression;
      ok = sc > 1; why = ok ? 'Enough blood has been shed.' : 'We are winning. No peace.';
    } else if (p.type === 'trade') {
      if (sim.atWar(ai, from)) return { ok: false, why: 'We do not trade with enemies.' };
      const aiSells = p.from === ai;
      if (p.good.startsWith('res:')) {
        const k = p.good.slice(4);
        const fair = 0.05 * ageScale(Math.max(A.age, s.nations[from].age));
        if (aiSells) { const has = (A.access?.[k] || 0) >= 1; ok = has && p.price >= fair * (1 - op / 200) && !(t.aggression > 0.7 && op < 0); why = !has ? `We have no ${RES[k].name} to spare.` : ok ? 'Agreed.' : 'Your offer is too low.'; }
        else { ok = !A.access?.[k] && p.price <= fair * 1.6; why = ok ? 'We will take it.' : 'We have no need of it.'; }
      } else {
        const net = A.st.net[p.good] || 0, fair = s.prices[p.good];
        if (aiSells) { ok = net > p.amount * 0.6 && p.price >= fair * (0.9 - op / 400); why = ok ? 'The terms are acceptable.' : net <= p.amount * 0.6 ? 'We cannot spare that much.' : 'Your price is too low.'; }
        else { const w = this.wantsGood(A, p.good, p.amount, p.price); ok = w && p.price <= fair * (1.15 + op / 300); why = ok ? 'We will take the shipment.' : !w ? 'We have no need of it, or cannot afford it.' : 'Your price is too high.'; }
      }
    } else if (p.type === 'joint') {
      if (rel !== 'alliance') return { ok: false, why: 'Only allies fight our wars with us.' };
      if (sim.rel(ai, p.target) === 'alliance') return { ok: false, why: `The ${sim.nm(p.target)} are our allies.` };
      const sc = t.aggression * 2 + op / 30 - sim.opinion(ai, p.target) / 30 + (this.power(ai) > this.power(p.target) ? 1 : -0.5) - sim.warsOf(ai).length;
      ok = sc > 1.6; why = ok ? `We march with you against the ${sim.nm(p.target)}.` : 'We are not ready for that war.';
    } else if (p.type === 'vassal' || p.type === 'vassalPeace') {
      if (A.overlord) return { ok: false, why: `We already serve the ${sim.nm(A.overlord)}.` };
      if (s.nations[from].overlord) return { ok: false, why: 'A vassal cannot take vassals of its own.' };
      const ratio = myP > 0 ? theirP / myP : 9;
      const tilesR = (sim.owned.get(from)?.size || 1) / Math.max(1, sim.owned.get(ai)?.size || 1);
      const core = s.regions.filter(r => r.core === ai).length || 1, lost = s.regions.filter(r => r.core === ai && r.owner !== ai).length / core;
      if (p.type === 'vassalPeace') {
        if (rel !== 'war') return { ok: false, why: 'We are not at war.' };
        const sc = A.exhaustion * 4 + lost * 4 + Math.log2(Math.max(0.25, ratio)) + (s.regions[A.capital]?.core !== ai ? 2 : 0) + t.caution - t.aggression - 2.2;
        ok = sc > 0; why = ok ? 'We cannot win this war. We submit.' : 'We will fight on rather than kneel.';
      } else {
        if (rel === 'war') return { ok: false, why: 'We are at war. Demand it as the price of peace.' };
        const threatened = sim.warsOf(ai).some(e => this.power(e) > this.power(ai) * 1.3);
        const sc = Math.log2(Math.max(0.25, ratio)) * 0.9 + Math.log2(Math.max(0.25, tilesR)) * 0.5 + op / 40 + (threatened ? 1.5 : 0) + t.caution - t.aggression * 1.2 - 2.4;
        ok = sc > 0; why = ok ? (threatened ? 'We need your protection. We accept.' : 'Your might is beyond dispute. We will serve.') : ratio < 2 ? 'You are not strong enough to demand that.' : 'We value our independence.';
      }
    } else if (p.type === 'techswap') {
      const give = TECH[p.give], get = TECH[p.get];
      if (!give || !get || A.techs[p.give] || !s.nations[from].techs[p.give]) return { ok: false, why: 'That offer makes no sense.' };
      const sc = give.cost / get.cost + op / 100 - (t.aggression > 0.7 ? 0.2 : 0);
      ok = sc >= 0.95 && give.age <= A.age && give.req.every(q => A.techs[q]); why = ok ? 'A fair exchange of knowledge.' : 'What you offer is worth less than what you ask.';
    }
    return { ok, why };
  }
}
