// Cabinet meetings: each minister analyses their portfolio and tables proposals the player approves or denies.
// Advice quality scales with skill: better ministers rank options correctly and estimate effects accurately;
// weak ones misjudge, overlook things and occasionally recommend poor options. Traits colour the advice.
import { UNITS, BUILDINGS, ECON } from './config.js';
import { NATION } from './nations.js';
import { TECH, available, has } from './tech.js';
import { LAWS, ROLES, lawOpt, canEnact, enact, lawCost, appoint, hireCost } from './gov.js';
import { kmBetween } from './sim.js';

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const fmtM = n => (Math.abs(n) >= 1000 ? '$' + (n / 1000).toFixed(1) + 'B' : '$' + Math.round(n) + 'M');
const r1 = n => (Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
export const MEETING_COOLDOWN_DAYS = 7;

// how clearly a minister sees: 0 (clueless) .. 1 (perfect)
function acuity(ch) {
  let a = (ch.skill - 1) / 9;
  if (ch.traits.includes('Visionary')) a = Math.min(1, a + 0.2);
  return a;
}
function perceive(score, ch) { return score * (1 + gauss() * (1 - acuity(ch)) * 0.9); }
function estimate(v, ch) { return v * (1 + gauss() * (1 - acuity(ch)) * 0.45); }
function choose(cands, ch, n) {
  // rank by perceived (noisy) value; poor ministers sometimes slip in a bad option
  const ranked = cands.map(c => ({ ...c, ps: perceive(c.score, ch) })).sort((a, b) => b.ps - a.ps);
  let out = ranked.slice(0, n);
  if (acuity(ch) < 0.45 && ranked.length > n + 2 && Math.random() < 0.5) out[out.length - 1] = ranked[ranked.length - 1 - ((Math.random() * 3) | 0)];
  return out;
}
const howMany = (ch, base = 1) => Math.max(1, Math.min(4, base + Math.floor(ch.skill / 3.5) + (ch.traits.includes('Visionary') ? 1 : 0) - (ch.skill <= 2 ? 1 : 0)));
export function confidence(ch) { const a = acuity(ch); return a >= 0.75 ? 'High confidence' : a >= 0.45 ? 'Moderate confidence' : 'Low confidence'; }

// ------------------------------------------------------------------ portfolio analyses
function industryProposals(sim, ai, N, ch) {
  const s = sim.s, st = N.st, m = N.mods, out = [];
  const corrupt = ch.traits.includes('Corrupt');
  const fp = s.prices.food, ep = s.prices.energy;
  // a unit of food/energy is worth far more when we are short of it than when it only adds to an export surplus
  const urg = (net, cons) => (net < 0 ? 30 : net < cons * 0.1 ? 8 : net < cons * 0.3 ? 3 : 0.8);
  const foodUrg = urg(st.foodNet, st.foodCons) / 25, enUrg = urg(st.energyNet, st.eCons) / 25;
  const wars = sim.warsOf(N.code);
  const cands = [];
  for (const r of sim.regionsOf(N.code)) {
    if (r.build || r.capture) continue;
    const R = sim.w.regions[r.i];
    const add = (type, daily, why) => {
      const chk = sim.canBuild(N.code, r.i, type);
      if (!chk.ok && !/Need \$/.test(chk.why || '')) return;
      const cost = Math.round(BUILDINGS[type].cost((r[type] || 0) + 1) * (1 + (m.buildCost || 0)));
      if (daily <= 0) return;
      cands.push({ type, region: r.i, cost, daily, why, score: daily / cost * 100, rname: R.name });
    };
    const ok = 1 - r.damage * 0.6;
    add('farm', ECON.farmYield * (0.35 + r.fert) * (1 + m.food) * ok * fp * foodUrg * 25, `adds ~${r1(ECON.farmYield * (0.35 + r.fert) * (1 + m.food))} food/day (fertility ${Math.round(r.fert * 100)}%)`);
    add('power', ECON.powerYield * (1 + m.power) * ok * ep * enUrg * 25, `adds ~${r1(ECON.powerYield * (1 + m.power))} energy/day`);
    if (r.hasOil) add('oil', ECON.oilYield * (1 + m.oil) * ok * ep * enUrg * 25, `adds ~${r1(ECON.oilYield * (1 + m.oil))} energy/day from oil reserves`);
    if (r.industry < r.city + 1) add('industry', (r.econ * 0.12 + 0.35) * (1 + m.income) * st.eF + (wars.length ? 1.5 : 0.4), `raises income ~${fmtM((r.econ * 0.12 + 0.35) * (1 + m.income))}/day and military output`);
    if (r.pop > 6 + r.city * 12) add('city', (r.econ * 0.1 + 0.25) * (1 + m.income) + 0.3, `${r1(r.pop)}M people are outgrowing the city; adds ~${fmtM(r.econ * 0.1 + 0.25)}/day`);
    if (r.city >= 2) add('lab', 4 * (1 + m.research) * 0.35, `adds ~${r1(4 * (1 + m.research))} research/day`);
    if (has(N, 'datacenter') && r.power >= 2) add('datacenter', (10 * (1 + m.aiBoost) * (1 + m.research) * 0.35 + 2) - (st.energyNet < 30 ? 6 : 0), `adds ~${r1(10 * (1 + m.aiBoost) * (1 + m.research))} research and $2M/day, but draws heavy power`);
    if (R.coastal && !sim.regionsOf(N.code).some(x => x.port)) add('port', 3, 'we have no port: no navy and weak trade');
    const exposed = sim.w.adj[r.i].some(j => { const o = s.regions[j].owner; return o && o !== N.code && (sim.atWar(N.code, o) || sim.opinion(N.code, o) < -25); });
    if (exposed) add('fort', (wars.length ? 4 : 1.2) * (1 + r.city * 0.2), 'a frontier region facing a hostile neighbour');
    if (has(N, 'academy') && wars.length) add('academy', 1.5, 'wartime training doubles as experience');
  }
  const pick = choose(cands, ch, howMany(ch, ch.traits.includes('Hawk') ? 0 : 1));
  if (corrupt && cands.length > 3 && Math.random() < 0.6) {
    const crony = cands.sort((a, b) => a.score - b.score)[0];
    pick[pick.length - 1] = { ...crony, ps: 0, crony: true };
  }
  for (const c of pick) {
    const cost = Math.round(c.cost * (corrupt ? 1.15 : 1));
    const payback = Math.round(c.cost / Math.max(0.05, estimate(c.daily, ch)));
    out.push({ kind: 'build', title: `Build ${BUILDINGS[c.type].name} in ${c.rname}`, cost, data: { region: c.region, type: c.type, extra: cost - c.cost },
      why: `${c.why[0].toUpperCase() + c.why.slice(1)}. ${['fort', 'academy', 'port'].includes(c.type) ? 'A strategic priority.' : payback < 2000 ? `Estimated payback about ${payback} days.` : 'A long-term investment.'}${c.crony ? ' The contractor is a close associate of the minister.' : ''}` });
  }
  return out;
}

function defenseProposals(sim, ai, N, ch) {
  const s = sim.s, w = sim.w, out = [], c = N.code;
  const wars = sim.warsOf(c);
  const mine = sim.unitsOf(c);
  const factories = sim.regionsOf(c).filter(r => r.industry > 0);
  const ports = sim.regionsOf(c).filter(r => r.port > 0);
  // threat assessment per own region: hostile land strength within 2 hops vs ours
  const hostile = n => sim.atWar(c, n) || (sim.opinion(c, n) < -30 && sim.rel(c, n) === 'peace');
  const fronts = [];
  for (const r of sim.regionsOf(c)) {
    const near = w.within(r.i, 2);
    let enemy = 0, ours = 0; let who = null;
    for (const u of s.units) {
      if (UNITS[u.type].domain !== 'land' || !near.has(u.loc)) continue;
      if (u.nation === c) { if (near.get(u.loc) <= 1) ours += sim.strength(u); }
      else if (hostile(u.nation)) { enemy += sim.strength(u); who = u.nation; }
    }
    if (enemy > 0) fronts.push({ r, enemy: estimate(enemy, ch), ours, who, gap: enemy * 1.2 - ours });
  }
  fronts.sort((a, b) => b.gap - a.gap);
  const cands = [];
  const nearestSite = (list, i) => list.slice().sort((a, b) => kmBetween(sim.anchor(a.i), sim.anchor(i)) - kmBetween(sim.anchor(b.i), sim.anchor(i)))[0];
  for (const f of fronts.slice(0, 4)) {
    if (f.gap <= 0) continue;
    const site = nearestSite(factories, f.r.i); if (!site) continue;
    const type = f.gap > 12 && site.industry >= 2 ? 'ARM' : f.gap > 6 ? 'ART' : 'INF';
    cands.push({ kind: 'recruit', score: f.gap * (wars.includes(f.who) ? 2 : 1), data: { region: site.i, type, n: Math.min(4, Math.ceil(f.gap / 8)) },
      title: `Raise ${Math.min(4, Math.ceil(f.gap / 8))}× ${UNITS[type].name} at ${w.regions[site.i].name}`, why: `${NATION[f.who].name} fields an estimated ${r1(f.enemy)} strength near ${w.regions[f.r.i].name} against our ${r1(f.ours)}.` });
  }
  // idle interior units -> threatened border
  const top = fronts[0];
  if (top && top.gap > 0) {
    const idle = mine.filter(u => UNITS[u.type].domain === 'land' && !u.move && !u.group && !fronts.some(f => f.r.i === u.loc) && s.regions[u.loc]?.owner === c);
    const send = idle.sort((a, b) => kmBetween(a.pos, sim.anchor(top.r.i)) - kmBetween(b.pos, sim.anchor(top.r.i))).slice(0, Math.min(6, Math.ceil(top.gap / 5)));
    if (send.length) cands.push({ kind: 'move', score: top.gap * 1.5, data: { units: send.map(u => u.id), dest: top.r.i }, title: `Redeploy ${send.length} units to ${w.regions[top.r.i].name}`, why: `Interior garrisons sit idle while the ${w.regions[top.r.i].name} frontier is outnumbered.` });
  }
  // naval balance
  const navPow = mine.filter(u => UNITS[u.type].domain === 'sea').reduce((a, u) => a + sim.strength(u), 0);
  const rivalNav = Math.max(0, ...[...ai.neighbours(c).keys()].filter(hostile).map(o => sim.unitsOf(o).filter(u => UNITS[u.type].domain === 'sea').reduce((a, u) => a + sim.strength(u), 0)));
  const blockaded = s.trades.filter(t => t.blockaded && (t.from === c || t.to === c)).length;
  if (ports.length && (rivalNav > navPow * 1.2 || blockaded)) {
    const type = blockaded || sim.unitsOf(c).some(u => u.type === 'SUB') ? 'DES' : 'CRU';
    cands.push({ kind: 'recruit', score: (rivalNav - navPow) * 0.6 + blockaded * 8, data: { region: ports.sort((a, b) => b.port - a.port)[0].i, type, n: 2 },
      title: `Commission 2× ${UNITS[type].name}`, why: blockaded ? `${blockaded} of our trade lanes are blockaded; we need escorts.` : `Hostile fleets (≈${r1(estimate(rivalNav, ch))}) outgun our navy (${r1(navPow)}).` });
  }
  // air power
  const air = mine.filter(u => UNITS[u.type].domain === 'air').length, land = mine.filter(u => UNITS[u.type].domain === 'land').length;
  const airSite = factories.filter(r => r.industry >= 2).sort((a, b) => b.industry - a.industry)[0];
  if (airSite && air < land * 0.2) cands.push({ kind: 'recruit', score: (wars.length ? 10 : 3) + (land * 0.2 - air), data: { region: airSite.i, type: wars.length ? 'BMB' : 'FTR', n: 1 },
    title: `Build a ${wars.length ? 'Bomber' : 'Fighter'} Wing at ${w.regions[airSite.i].name}`, why: `Only ${air} air wings for ${land} land units; ${wars.length ? 'bombers would break enemy defences' : 'fighters protect our skies'}.` });
  // training
  const green = mine.filter(u => !u.move && !u.train && (u.xp || 0) < 30 && UNITS[u.type].domain === 'land' && s.regions[u.loc]?.owner === c && !fronts.some(f => f.r.i === u.loc));
  if (green.length >= 3 && !wars.length) cands.push({ kind: 'train', score: 4, data: { units: green.slice(0, 10).map(u => u.id) }, title: `Begin training ${Math.min(10, green.length)} inexperienced units`, why: `Average experience is low. Drills cost $0.3M per unit per day.` });
  // demobilise if broke
  if (N.st.net < 0 && N.money < N.st.upkeep * 20 && mine.length > 4) {
    const cut = mine.filter(u => !u.fighting).sort((a, b) => (a.xp || 0) - (b.xp || 0) + UNITS[b.type].upkeep - UNITS[a.type].upkeep).slice(0, 3);
    cands.push({ kind: 'disband', score: 6, data: { units: cut.map(u => u.id) }, title: `Demobilise ${cut.length} costly units`, why: `The treasury is running dry; this saves ${fmtM(cut.reduce((a, u) => a + UNITS[u.type].upkeep, 0))}/day.` });
  }
  const n = howMany(ch, ch.traits.includes('Hawk') ? 2 : 1);
  for (const p of choose(cands, ch, n)) {
    if (p.kind === 'recruit') p.cost = UNITS[p.data.type].cost * p.data.n;
    out.push(p);
  }
  return out;
}

const BRANCH_NEED = (sim, N) => {
  const st = N.st, wars = sim.warsOf(N.code).length;
  return { agr: st.foodNet < 0 ? 3 : 0.8, en: st.energyNet < 0 ? 3 : 0.9, ind: 1.3, soc: N.gov.stability < 0.45 ? 2 : 1, cmp: N.gov.laws.ai === 'accelerate' ? 2 : 1.2,
    mil: wars ? 2.5 : 0.9, nav: wars ? 1.4 : 0.7, aer: wars ? 1.6 : 0.8, nuc: N.warheads || NATION[N.code].traits.aggression > 0.6 ? 1 : 0.35 };
};
function scienceProposals(sim, ai, N, ch) {
  const need = BRANCH_NEED(sim, N);
  const cands = available(N).filter(t => t.id !== N.research.cur).map(t => ({ t, score: need[t.branch] * 1000 / t.cost }));
  return choose(cands, ch, howMany(ch, 0)).map(c => ({ kind: 'research', data: { id: c.t.id }, title: `Prioritise ${c.t.name}`,
    why: `${c.t.desc} Roughly ${Math.ceil(c.t.cost / Math.max(0.1, estimate(N.st.rp, ch)))} days at current funding.` }));
}

function financeProposals(sim, ai, N, ch) {
  const st = N.st, out = [], cands = [];
  const lawProp = (cat, opt, score, why) => { const o = LAWS[cat].opts.find(x => x.id === opt); if (!o || N.gov.laws[cat] === opt) return; const chk = canEnact(sim, N, cat, opt); if (!chk.ok && !/political capital/.test(chk.why)) return; cands.push({ kind: 'law', score, pc: lawCost(N, o), data: { cat, opt }, title: `${LAWS[cat].name}: ${o.name}`, why }); };
  if (st.net < 0) {
    lawProp('tax', 'high', 8 - N.gov.approval * 4, `We lose ${fmtM(-st.net)}/day. Higher taxes add ~${fmtM(estimate(st.income * 0.12, ch))}/day at some cost to approval.`);
    const pricey = sim.s.trades.filter(t => t.to === N.code && !t.blockaded).sort((a, b) => b.amount * b.price - a.amount * a.price)[0];
    if (pricey && (pricey.good === 'food' ? st.foodNet : st.energyNet) > pricey.amount * 0.5) cands.push({ kind: 'cancelTrade', score: 5, data: { id: pricey.id }, title: `Cancel ${pricey.good} imports from ${NATION[pricey.from].name}`, why: `We pay ${fmtM(pricey.amount * pricey.price)}/day for a surplus we no longer need.` });
  }
  if (N.money > st.income * 90 && N.gov.laws.tax === 'high') lawProp('tax', 'standard', 4, `The treasury is flush (${fmtM(N.money)}). Easing taxes would help approval.`);
  if (N.money > st.income * 60 && ['minimal', 'standard'].includes(N.gov.laws.research)) lawProp('research', 'high', 5, `Reserves of ${fmtM(N.money)} could fund ~${r1(estimate(st.income * 0.05 * 0.9, ch))} more research per day.`);
  if (N.money > st.income * 120) lawProp('industry', 'heavy', 2.5, 'Idle capital would be better spent on heavy industry.');
  if (st.net < 0 && N.gov.laws.welfare === 'generous') lawProp('welfare', 'standard', 4, 'Generous welfare costs about 5% of income.');
  return choose(cands, ch, howMany(ch, 0));
}

function foreignProposals(sim, ai, N, ch) {
  const s = sim.s, c = N.code, st = N.st, cands = [];
  const live = Object.values(s.nations).filter(x => x.alive && x.code !== c);
  for (const good of ['food', 'energy']) {
    const net = good === 'food' ? st.foodNet : st.energyNet;
    if (net >= 0) continue;
    for (const x of live) {
      const sur = good === 'food' ? x.st.foodNet : x.st.energyNet;
      if (sur < -net * 0.5 || sim.atWar(c, x.code)) continue;
      const p = { type: 'trade', good, amount: Math.round(-net * 1.15), price: +(s.prices[good] * 1.06).toFixed(3), from: x.code, to: c };
      const real = ai.evaluate(x.code, c, p).ok;
      const believed = acuity(ch) > Math.random() ? real : !real; // weak diplomats misread partners
      if (believed) cands.push({ kind: 'trade', score: 6 + sur / 50, data: p, title: `Import ${p.amount} ${good}/day from ${NATION[x.code].name}`, why: `Covers our ${good} deficit at about ${fmtM(p.amount * p.price)}/day. ${real ? 'They should accept.' : 'They seem receptive.'}` });
    }
  }
  for (const [o] of ai.neighbours(c)) {
    if (!s.nations[o]?.alive) continue;
    const rel = sim.rel(c, o);
    const nap = ai.evaluate(o, c, { type: 'nap' }).ok, all = ai.evaluate(o, c, { type: 'alliance' }).ok;
    const read = v => (acuity(ch) > Math.random() ? v : Math.random() < 0.5);
    if (rel === 'peace' && read(nap)) cands.push({ kind: 'treaty', score: 3 + (sim.opinion(c, o) < 0 ? 2 : 0) + (ch.traits.includes('Dove') ? 2 : 0), data: { type: 'nap', with: o }, title: `Non-aggression pact with ${NATION[o].name}`, why: `Secures our shared border. Their opinion of us: ${Math.round(sim.opinion(o, c))}.` });
    if (rel === 'nap' && read(all)) cands.push({ kind: 'treaty', score: 3.5, data: { type: 'alliance', with: o }, title: `Alliance with ${NATION[o].name}`, why: `Our pact has held, and an alliance would deter our rivals.` });
    if (rel === 'war' && (N.exhaustion > 0.25 || ch.traits.includes('Dove')) && read(ai.evaluate(o, c, { type: 'peace' }).ok)) cands.push({ kind: 'treaty', score: 5 + N.exhaustion * 10, data: { type: 'peace', with: o }, title: `Sue for peace with ${NATION[o].name}`, why: `War exhaustion stands at ${Math.round(N.exhaustion * 100)}%. ${NATION[o].name} may be willing to talk.` });
    if (ch.traits.includes('Hawk') && rel === 'peace' && sim.power(c) > sim.power(o) * 2.5 && sim.opinion(c, o) < -10) {
      const r = s.regions.find(x => x.owner === o && sim.w.adj[x.i].some(j => s.regions[j].owner === c) && s.nations[o].capital !== x.i);
      if (r) cands.push({ kind: 'demand', score: 4, data: { from: o, region: r.i }, title: `Ultimatum: demand ${sim.w.regions[r.i].name} from ${NATION[o].name}`, why: `We outgun them ${r1(sim.power(c) / Math.max(1, sim.power(o)))} to 1. They may yield without a fight.` });
    }
  }
  return choose(cands, ch, howMany(ch, 0));
}

function interiorProposals(sim, ai, N, ch) {
  const g = N.gov, cands = [];
  const lawProp = (cat, opt, score, why) => { const o = LAWS[cat].opts.find(x => x.id === opt); if (!o || g.laws[cat] === opt) return; const chk = canEnact(sim, N, cat, opt); if (!chk.ok && !/political capital/.test(chk.why)) return; cands.push({ kind: 'law', score, pc: lawCost(N, o), data: { cat, opt }, title: `${LAWS[cat].name}: ${o.name}`, why }); };
  if (g.stability < 0.5) {
    lawProp('welfare', 'generous', 6 * (0.6 - g.stability) * 4, `Stability is ${Math.round(g.stability * 100)}%. Welfare spending would calm the streets.`);
    if (!['parliamentary', 'presidential', 'constmon'].includes(g.type)) lawProp('liberty', 'surveillance', 5, 'Tighter surveillance would root out agitators.');
  }
  if (g.approval < 0.4) lawProp('tax', 'low', 5, `Approval is ${Math.round(g.approval * 100)}%. Tax relief is the fastest remedy.`);
  if (N.exhaustion > 0.35 && sim.warsOf(N.code).length) cands.push({ kind: 'info', score: 4, title: 'The home front is wavering', why: `War exhaustion stands at ${Math.round(N.exhaustion * 100)}%. Consider peace talks or a national address.` });
  // weakest minister replacement
  const weakest = Object.entries(g.cabinet).map(([role, id]) => ({ role, c: sim.s.chars[id] })).filter(x => x.c && x.c.id !== ch.id).sort((a, b) => a.c.skill - b.c.skill)[0];
  if (weakest) {
    const cand = (g.candidates[weakest.role] || []).map(id => sim.s.chars[id]).filter(Boolean).sort((a, b) => b.skill - a.skill)[0];
    if (cand && cand.skill >= weakest.c.skill + 2) cands.push({ kind: 'appoint', score: (cand.skill - weakest.c.skill) * 1.2, pc: hireCost(cand), data: { role: weakest.role, id: cand.id }, title: `Replace ${weakest.c.name} with ${cand.name}`, why: `${ROLES[weakest.role].name} is underperforming (skill ${weakest.c.skill}). ${cand.name} rates ${cand.skill}.` });
  }
  return choose(cands, ch, howMany(ch, 0));
}

function intelProposals(sim, ai, N, ch) {
  const s = sim.s, c = N.code, cands = [];
  const rivals = Object.values(s.nations).filter(x => x.alive && x.code !== c && (sim.atWar(c, x.code) || sim.opinion(c, x.code) < -15));
  for (const x of rivals) {
    const lack = Object.keys(x.techs).filter(id => !N.techs[id] && TECH[id].req.every(q => N.techs[q])).length;
    const odds = Math.max(0.08, Math.min(0.9, 0.42 + (N.mods.covert || 0) + (N.spyBonus || 0) - (x.mods.covert || 0) * 0.6));
    const shown = Math.round(Math.max(5, Math.min(95, estimate(odds, ch) * 100)));
    if (lack) cands.push({ kind: 'covert', score: lack * odds, cost: 150, data: { target: x.code, op: 'steal' }, title: `Steal technology from ${NATION[x.code].name}`, why: `They hold ${lack} technologies we could use. Estimated success ${shown}%.` });
    const nuke = s.regions.some(r => r.owner === x.code && r.nuclear);
    if (sim.atWar(c, x.code)) cands.push({ kind: 'covert', score: (nuke ? 6 : 3) * odds, cost: 200, data: { target: x.code, op: 'sabotage' }, title: `Sabotage ${NATION[x.code].name}'s ${nuke ? 'nuclear program' : 'industry'}`, why: `Estimated success ${shown}%.` });
    if (x.gov.stability < 0.45) cands.push({ kind: 'covert', score: 2.5 * odds, cost: 120, data: { target: x.code, op: 'unrest' }, title: `Fan unrest in ${NATION[x.code].name}`, why: `Their government is fragile (stability ${Math.round(estimate(x.gov.stability, ch) * 100)}%).` });
  }
  // threat briefing (intel only)
  const massing = rivals.map(x => {
    const near = s.units.filter(u => u.nation === x.code && UNITS[u.type].domain === 'land' && sim.w.adj[u.loc]?.some(j => s.regions[j].owner === c)).length;
    return { x, near };
  }).filter(o => o.near >= 3).sort((a, b) => b.near - a.near)[0];
  if (massing) cands.push({ kind: 'info', score: 5, title: `${NATION[massing.x.code].name} is massing troops`, why: `Approximately ${Math.max(1, Math.round(estimate(massing.near, ch)))} units are positioned on our border.` });
  return choose(cands, ch, howMany(ch, 0));
}

const PORTFOLIO = { industry: industryProposals, defense: defenseProposals, science: scienceProposals, finance: financeProposals, foreign: foreignProposals, interior: interiorProposals, intel: intelProposals };

export function convene(sim, ai, N) {
  const s = sim.s;
  if (N.lastCabinet !== undefined && s.t - N.lastCabinet < MEETING_COOLDOWN_DAYS * 24) return { ok: false, why: `The cabinet met recently. The next meeting is possible in ${Math.ceil((MEETING_COOLDOWN_DAYS * 24 - (s.t - N.lastCabinet)) / 24)} days.` };
  N.lastCabinet = s.t;
  sim.recalcNation(N.code);
  const agenda = [];
  let id = 1;
  for (const [role, fn] of Object.entries(PORTFOLIO)) {
    const ch = s.chars[N.gov.cabinet[role]];
    if (!ch) continue;
    let props = [];
    try { props = fn(sim, ai, N, ch); } catch (e) { console.warn('cabinet', role, e); }
    for (const p of props) agenda.push({ ...p, id: id++, role, minister: ch.id, status: 'pending' });
  }
  return { ok: true, agenda };
}

// carry out an approved proposal; returns {ok, msg}
export function execute(sim, ai, N, p) {
  const s = sim.s, c = N.code, d = p.data || {};
  const ch = s.chars[p.minister];
  if (ch) ch.loyalty = Math.min(1, ch.loyalty + 0.01);
  switch (p.kind) {
    case 'build': {
      const r = sim.build(c, d.region, d.type);
      if (r.ok && d.extra) N.money -= d.extra;
      return { ok: r.ok, msg: r.ok ? `Construction begins: ${p.title.replace(/^Build /, '')}.` : r.why };
    }
    case 'recruit': {
      let made = 0, why = '';
      for (let k = 0; k < (d.n || 1); k++) { const r = sim.recruit(c, d.region, d.type); if (r.ok) made++; else { why = r.why; break; } }
      return { ok: made > 0, msg: made ? `${made}× ${UNITS[d.type].name} ordered${made < d.n ? ` (stopped: ${why})` : ''}.` : why };
    }
    case 'move': { const r = sim.order(d.units, d.dest); return { ok: r.ok, msg: r.ok ? 'Units are redeploying.' : (r.reason || 'Route blocked.') }; }
    case 'train': { let n = 0; for (const id of d.units) { const u = sim.unitById.get(id); if (u && !u.move) { u.train = true; n++; } } return { ok: n > 0, msg: `${n} units begin training.` }; }
    case 'disband': { let n = 0; for (const id of d.units) { const u = sim.unitById.get(id); if (u) { sim.removeUnit(u); n++; } } return { ok: true, msg: `${n} units demobilised.` }; }
    case 'research': { const R = N.research; if (R.cur && R.cur !== d.id) R.queue.unshift(R.cur); R.cur = d.id; R.queue = R.queue.filter(x => x !== d.id); return { ok: true, msg: `Research redirected to ${TECH[d.id].name}.` }; }
    case 'law': { const r = enact(sim, N, d.cat, d.opt); return { ok: r.ok, msg: r.ok ? `${p.title} enacted.` : r.why }; }
    case 'appoint': { const r = appoint(sim, N, d.role, d.id); return { ok: r.ok, msg: r.ok ? `${s.chars[d.id].name} appointed.` : r.why }; }
    case 'cancelTrade': { sim.cancelTrade(d.id); return { ok: true, msg: 'Trade agreement cancelled.' }; }
    case 'trade': {
      const r = ai.evaluate(d.from, c, d);
      if (!r.ok) { sim.addOpinion(d.from, c, -1); return { ok: false, msg: `${NATION[d.from].name} declined: ${r.why}` }; }
      const t = sim.addTrade(d.from, c, d.good, d.amount, d.price);
      return { ok: !!t, msg: t ? `${NATION[d.from].name} agrees to supply ${d.amount} ${d.good}/day.` : 'No viable shipping route.' };
    }
    case 'treaty': {
      const r = ai.evaluate(d.with, c, { type: d.type });
      if (!r.ok) { sim.addOpinion(d.with, c, -1); return { ok: false, msg: `${NATION[d.with].name} declined: ${r.why}` }; }
      if (d.type === 'peace') sim.makePeace(c, d.with);
      else { sim.setRel(c, d.with, d.type); sim.emit('treaty', `${NATION[c].name} and ${NATION[d.with].name} ${d.type === 'nap' ? 'sign a non-aggression pact' : 'form a military alliance'}.`, [c, d.with]); }
      return { ok: true, msg: `${NATION[d.with].name} accepts.` };
    }
    case 'demand': { const r = sim.demand(c, d.from, d.region); return { ok: r.ok, msg: r.why }; }
    case 'covert': { const r = sim.covert(c, d.target, d.op); return { ok: r.ok, msg: r.why }; }
    case 'info': return { ok: true, msg: 'Noted.' };
  }
  return { ok: false, msg: 'Unknown proposal.' };
}
export function deny(sim, N, p) {
  const ch = sim.s.chars[p.minister];
  if (ch) ch.loyalty = Math.max(0, ch.loyalty - (ch.traits.includes('Ambitious') ? 0.03 : 0.01));
}
