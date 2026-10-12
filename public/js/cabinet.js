// Council meetings: each minister studies their portfolio and tables proposals the player approves or denies.
// Advice quality scales with skill: able ministers rank options well and estimate accurately; weak ones misjudge.
import { UNITS, LINES, bestOf, SETTLEMENTS, BUILDINGS, WONDERS } from './units.js';
import { RES, IMPROVEMENTS, STRATEGIC, known } from './resources.js';
import { TECH, available, ageProgress } from './tech.js';
import { AGES, ageScale } from './eras.js';
import { LAWS, ROLES, GOV_TYPES, canEnact, enact, lawCost, appoint, hireCost, reform, reformCost, govAvailable, roleTitle } from './gov.js';
import { kmBetween, GOODS } from './sim.js';
import { provincesOf, candidates, officialCost, appointGovernor, canGovern, movementsOf, movementTiles, crackdown, concede, concessionCost, cultureShares, REVOLT_NAME, governorTitle } from './society.js';

const gauss = () => { let u = 0, v = 0; while (!u) u = Math.random(); while (!v) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
const r1 = n => (Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 10) / 10);
export const MEETING_COOLDOWN_DAYS = 7;

function acuity(ch) { let a = (ch.skill - 1) / 9; if (ch.traits.includes('Visionary')) a = Math.min(1, a + 0.2); return a; }
function perceive(score, ch) { return score * (1 + gauss() * (1 - acuity(ch)) * 0.9); }
function estimate(v, ch) { return v * (1 + gauss() * (1 - acuity(ch)) * 0.45); }
function choose(cands, ch, n) {
  const ranked = cands.map(c => ({ ...c, ps: perceive(c.score, ch) })).sort((a, b) => b.ps - a.ps);
  const out = ranked.slice(0, n);
  if (acuity(ch) < 0.45 && ranked.length > n + 2 && Math.random() < 0.5) out[out.length - 1] = ranked[ranked.length - 1 - ((Math.random() * 3) | 0)];
  return out;
}
const howMany = (ch, base = 1) => Math.max(1, Math.min(4, base + Math.floor(ch.skill / 3.5) + (ch.traits.includes('Visionary') ? 1 : 0) - (ch.skill <= 2 ? 1 : 0)));
export function confidence(ch) { const a = acuity(ch); return a >= 0.75 ? 'High confidence' : a >= 0.45 ? 'Moderate confidence' : 'Low confidence'; }
const costTxt = c => Object.entries(c || {}).map(([k, v]) => `${r1(v)} ${k}`).join(', ');

// ------------------------------------------------------------------ portfolios
function works(sim, ai, N, ch) {
  const free = sim.regionsOf(N.code).filter(r => !r.build && !r.capture);
  const cands = ai.workCandidates(N.code, free, null).map(c => {
    const chk = c.kind === 'imp' ? sim.canImprove(N.code, c.i, c.type) : c.kind === 'bld' ? sim.canBuild(N.code, c.i, c.type) : c.kind === 'settle' ? sim.canUpgradeSettlement(N.code, c.i) : sim.canWonder(N.code, c.i, c.type);
    if (!chk.ok && !/Need /.test(chk.why || '')) return null;
    return { ...c, chk };
  }).filter(Boolean);
  const seen = new Set();
  const picked = choose(cands, ch, howMany(ch, 1) + 1).filter(c => { if (seen.has(c.i)) return false; seen.add(c.i); return true; });
  const corrupt = ch.traits.includes('Corrupt');
  return picked.map(c => {
    const name = c.kind === 'settle' ? `Grow ${sim.w.regions[c.i].name} into a ${SETTLEMENTS[sim.s.regions[c.i].lvl + 1].name}` : c.kind === 'imp' ? `${IMPROVEMENTS[c.type].name} at ${sim.w.regions[c.i].name}` : c.kind === 'bld' ? `${BUILDINGS[c.type].levels[sim.s.regions[c.i].bld[c.type] || 0][0]} at ${sim.w.regions[c.i].name}` : `Build the ${WONDERS[c.type].name}`;
    const reason = c.kind === 'settle' ? 'The people have outgrown their homes. A larger settlement means more people, commerce and learning.'
      : c.kind === 'imp' ? (c.type === 'farm' || c.type === 'fishery' || c.type === 'pasture' || c.type === 'camp' ? 'More food lets our people grow.' : c.type === 'mine' ? 'Ore for tools, weapons and trade.' : c.type === 'lumber' ? 'Timber for building and ships.' : c.type === 'quarry' ? 'Stone for walls, temples and towns.' : 'Valuable goods for trade and comfort.')
      : c.kind === 'bld' ? BUILDINGS[c.type].desc : WONDERS[c.type].desc;
    const extra = corrupt && Math.random() < 0.5 ? 0.15 : 0;
    return { kind: 'work', title: name, cost: c.chk.cost, extra, data: { kind: c.kind, type: c.type, i: c.i }, why: reason + (c.chk.ok ? '' : ` We cannot afford it yet: ${c.chk.why}`) + (extra ? ' The minister\'s cousin will supply the materials.' : '') };
  });
}
function interior(sim, ai, N, ch) {
  const s = sim.s, g = N.gov, cands = [];
  // settlement of new lands
  const reach = [...sim.claimReach(N.code)].map(i => ({ i, v: ai.tileValue(N.code, i) })).sort((a, b) => b.v - a.v).slice(0, 6);
  for (const t of reach) {
    const chk = sim.canClaim(N.code, t.i);
    if (!chk.ok && !/Need /.test(chk.why || '')) continue;
    const r = s.regions[t.i], T = sim.T[t.i];
    const deps = r.dep.filter(d => known(N, d.r)).map(d => RES[d.r].name);
    cands.push({ kind: 'claim', score: t.v, cost: chk.cost, data: { i: t.i }, title: `Settle ${sim.w.regions[t.i].name}`, why: `${T.river ? 'River valley' : T.terrain[0].toUpperCase() + T.terrain.slice(1)}, fertility ${Math.round(estimate(T.fert, ch) * 100)}%${deps.length ? ', with ' + deps.join(', ') : ''}.${(r.natives || 0) > 0.3 ? ` About ${r1(estimate(r.natives, ch))}k natives live there.` : ''}` });
  }
  // government reform
  const cur = GOV_TYPES[g.type];
  for (const k of Object.keys(GOV_TYPES)) if (k !== g.type && govAvailable(N, k) && GOV_TYPES[k].age > cur.age) cands.push({ kind: 'reform', score: 5 + GOV_TYPES[k].age, pc: reformCost(N), data: { type: k }, title: `Adopt ${GOV_TYPES[k].name}`, why: `${GOV_TYPES[k].desc} A form of government fit for our age.` });
  const lawProp = (cat, opt, score, why) => { const o = LAWS[cat].opts.find(x => x.id === opt); if (!o || g.laws[cat] === opt) return; const chk = canEnact(sim, N, cat, opt); if (!chk.ok && !/influence|political capital/.test(chk.why)) return; cands.push({ kind: 'law', score, pc: lawCost(N, o), data: { cat, opt }, title: `${LAWS[cat].name}: ${o.name}`, why }); };
  if (g.stability < 0.5) { if (N.techs.monotheism) lawProp('religion', 'state', 5, 'A single faith would bind the people together.'); else if (N.techs.polytheism) lawProp('religion', 'pantheon', 5, 'Temples to the city gods would calm the people.'); lawProp('expansion', 'consolidate', 3, 'We have grown faster than our institutions. Consolidate.'); }
  if (g.approval < 0.4) lawProp('tax', 'low', 5, `Approval is ${Math.round(g.approval * 100)}%. Lighter tribute is the quickest remedy.`);
  if (N.traits && g.laws.expansion === 'balanced' && sim.claimReach(N.code).size > 3 && g.stability > 0.55) lawProp('expansion', 'frontier', 3.5, 'Open land lies all around us. Encourage settlers.');
  // revolts: march the nearest idle troops in
  for (const r of sim.regionsOf(N.code).filter(x => x.revolt)) {
    const idle = sim.unitsOf(N.code).filter(u => !u.move && !u.fighting && UNITS[u.type].domain === 'land' && u.loc !== r.i && !s.regions[u.loc]?.revolt)
      .sort((a, b) => kmBetween(sim.anchor(a.loc), sim.anchor(r.i)) - kmBetween(sim.anchor(b.loc), sim.anchor(r.i))).slice(0, Math.max(2, Math.ceil(r.revolt.str / 1.2)));
    if (idle.length) cands.push({ kind: 'move', score: 9, data: { units: idle.map(u => u.id), dest: r.i }, title: `Crush the revolt in ${sim.w.regions[r.i].name}`, why: `${REVOLT_NAME[r.revolt.kind]}: rebel strength about ${r1(estimate(r.revolt.str, ch))}. Send ${idle.length} units before the land breaks away.` });
  }
  // governors for the largest ungoverned provinces
  if (canGovern(N)) for (const pv of provincesOf(sim, N.code).filter(x => !N.governors?.[x.id] && x.tiles.length >= 2).sort((a, b) => b.tiles.length - a.tiles.length).slice(0, 2)) {
    const best = candidates(sim, N, 'g:' + pv.id).slice().sort((a, b) => b.skill - a.skill)[0];
    const un = pv.tiles.reduce((a, i) => a + s.regions[i].unrest, 0) / pv.tiles.length;
    if (best) cands.push({ kind: 'governor', score: 3.5 + pv.tiles.length * 0.4 + un * 8, pc: officialCost(N, best, false), data: { pid: pv.id, id: best.id }, title: `Name ${best.name} ${governorTitle(N.age).toLowerCase()} of ${pv.name}`, why: `${pv.tiles.length} lands without a governor (unrest ${Math.round(estimate(un, ch) * 100)}%). ${best.name} is able (skill ${best.skill})${best.traits.length ? ', ' + best.traits.join(', ').toLowerCase() : ''}.` });
  }
  // organized opposition
  for (const M of movementsOf(sim, N.code).filter(x => x.str > 0.3 && s.t >= (x.cd || 0))) {
    const harsh = !GOV_TYPES[g.type].democratic || M.str > 0.6;
    if (harsh) cands.push({ kind: 'movement', score: 4 + M.str * 6, pc: 25, data: { id: M.id, act: 'crack' }, title: `Crack down on the ${M.name}`, why: `They are ${M.str > 0.6 ? 'strong and dangerous' : 'growing'} across ${movementTiles(sim, M).length} lands. Raids and arrests will break them, and anger their people.` });
    else cands.push({ kind: 'movement', score: 3.5 + M.str * 5, cost: { wealth: concessionCost(N) }, data: { id: M.id, act: 'concede' }, title: `Concessions to the ${M.name}`, why: 'Schools, temples and tax relief would take the wind out of their sails.' });
  }
  // a realm of many peoples needs a policy for them
  const own = cultureShares(sim, N.code)[N.cul] || 1;
  if (own < 0.7 && g.laws.culture === 'accommodate') { if (N.techs.citizenship) lawProp('culture', 'pluralism', 4, `Only ${Math.round(own * 100)}% of our people share our ways. Respecting local customs would calm the provinces.`); else lawProp('culture', 'assimilate', 3, `Only ${Math.round(own * 100)}% of our people share our ways. One language and one law would bind them to us.`); }
  // weakest minister
  const weakest = Object.entries(g.cabinet).map(([role, id]) => ({ role, c: s.chars[id] })).filter(x => x.c && x.c.id !== ch.id).sort((a, b) => a.c.skill - b.c.skill)[0];
  if (weakest) {
    const cand = (g.candidates[weakest.role] || []).map(id => s.chars[id]).filter(Boolean).sort((a, b) => b.skill - a.skill)[0];
    if (cand && cand.skill >= weakest.c.skill + 2) cands.push({ kind: 'appoint', score: (cand.skill - weakest.c.skill) * 1.2, pc: hireCost(cand), data: { role: weakest.role, id: cand.id }, title: `Replace ${weakest.c.name} with ${cand.name}`, why: `Our ${roleTitle(weakest.role, N.age)} is not up to the task (skill ${weakest.c.skill}). ${cand.name} rates ${cand.skill}.` });
  }
  return choose(cands, ch, howMany(ch, 1));
}
function defense(sim, ai, N, ch) {
  const s = sim.s, w = sim.w, c = N.code, cands = [];
  const wars = sim.warsOf(c);
  const mine = sim.unitsOf(c);
  const hostile = n => sim.atWar(c, n) || (sim.opinion(c, n) < -30 && sim.rel(c, n) === 'peace');
  const fronts = [];
  for (const r of sim.regionsOf(c)) {
    const near = w.within(r.i, 2);
    let enemy = 0, ours = 0, who = null;
    for (const u of s.units) {
      if (UNITS[u.type].domain !== 'land' || !near.has(u.loc)) continue;
      if (u.nation === c) { if (near.get(u.loc) <= 1) ours += sim.strength(u); }
      else if (hostile(u.nation)) { enemy += sim.strength(u); who = u.nation; }
    }
    if (enemy > 0) fronts.push({ r, enemy: estimate(enemy, ch), ours, who, gap: enemy * 1.2 - ours });
  }
  fronts.sort((a, b) => b.gap - a.gap);
  const lines = ['INF', 'RNG', 'CAV', 'SGE'].map(l => bestOf(N, l)).filter(t => t && sim.canField(c, t).ok);
  for (const f of fronts.slice(0, 3)) {
    if (f.gap <= 0 || !lines.length) continue;
    const type = f.gap > 6 && lines.find(t => UNITS[t].line === 'CAV') ? lines.find(t => UNITS[t].line === 'CAV') : lines[0];
    const n = Math.min(5, Math.max(1, Math.ceil(f.gap / Math.max(1, UNITS[type].atk * 2))));
    cands.push({ kind: 'recruit', score: f.gap * (wars.includes(f.who) ? 2 : 1), data: { type, n, near: f.r.i }, title: `Raise ${n}× ${UNITS[type].name} near ${w.regions[f.r.i].name}`, why: `The ${sim.nm(f.who)} field an estimated strength of ${r1(f.enemy)} near ${w.regions[f.r.i].name} against our ${r1(f.ours)}.` });
  }
  const top = fronts[0];
  if (top && top.gap > 0) {
    const idle = mine.filter(u => UNITS[u.type].domain === 'land' && !u.move && !u.group && !fronts.some(f => f.r.i === u.loc) && s.regions[u.loc]?.owner === c);
    const send = idle.sort((a, b) => kmBetween(a.pos, sim.anchor(top.r.i)) - kmBetween(b.pos, sim.anchor(top.r.i))).slice(0, 6);
    if (send.length) cands.push({ kind: 'move', score: top.gap * 1.5, data: { units: send.map(u => u.id), dest: top.r.i }, title: `Send ${send.length} units to ${w.regions[top.r.i].name}`, why: `Garrisons sit idle while the ${w.regions[top.r.i].name} frontier is outnumbered.` });
  }
  // a modest standing force in peacetime
  if (!wars.length && mine.filter(u => UNITS[u.type].domain === 'land').length < Math.max(2, N.st.tiles * 0.3) && lines.length) {
    const type = lines[0];
    cands.push({ kind: 'recruit', score: 3, data: { type, n: 2, near: N.capital }, title: `Raise 2× ${UNITS[type].name} at ${w.regions[N.capital].name}`, why: `Only ${mine.length} units defend ${N.st.tiles} lands.` });
  }
  // native peoples
  const nat = [...sim.claimReach(c)].filter(i => (s.regions[i].natives || 0) > 0.8 && w.adj[i].some(j => s.regions[j].owner === c)).sort((a, b) => ai.tileValue(c, b) - ai.tileValue(c, a))[0];
  const idle2 = mine.filter(u => UNITS[u.type].domain === 'land' && !u.move && !u.group && UNITS[u.type].atk > 0);
  if (nat !== undefined && idle2.length >= 2 && !wars.length) {
    const gar = sim.garrison(s.regions[nat]); const pw = sim.siegePower(idle2, Math.max(0, N.age - 1));
    if (pw > gar) cands.push({ kind: 'subdue', score: 2.5 + (ch.traits.includes('Hawk') ? 2 : 0), data: { i: nat, units: idle2.slice(0, 6).map(u => u.id) }, title: `Subdue the natives of ${w.regions[nat].name}`, why: `About ${r1(estimate(s.regions[nat].natives, ch))}k tribesfolk. Our warriors (strength ${r1(pw)}) can overcome their ${r1(gar)}. No settlers needed.` });
  }
  // refit
  const old = mine.filter(u => sim.upgradeCost(c, u));
  if (old.length >= 2) { const cost = {}; for (const u of old) for (const [k, v] of Object.entries(sim.upgradeCost(c, u).cost)) cost[k] = (cost[k] || 0) + v; cands.push({ kind: 'upgrade', score: old.length * 0.8 + (wars.length ? 4 : 0), cost, data: { units: old.map(u => u.id) }, title: `Refit ${old.length} outdated units`, why: `They still carry the arms of a past age.` }); }
  // drills
  const green = mine.filter(u => !u.move && !u.train && (u.xp || 0) < 30 && UNITS[u.type].domain === 'land' && s.regions[u.loc]?.owner === c && !fronts.some(f => f.r.i === u.loc));
  if (green.length >= 3 && !wars.length) cands.push({ kind: 'train', score: 2.5, data: { units: green.slice(0, 10).map(u => u.id) }, title: `Drill ${Math.min(10, green.length)} green units`, why: 'Experience wins battles. Drills cost a little upkeep.' });
  const n = howMany(ch, ch.traits.includes('Hawk') ? 2 : 1);
  return choose(cands, ch, n).map(p => { if (p.kind === 'recruit') p.cost = Object.fromEntries(Object.entries(sim.unitCost(c, p.data.type)).map(([k, v]) => [k, v * p.data.n])); return p; });
}
function science(sim, ai, N, ch) {
  const out = [];
  const adv = sim.canAdvance(N.code);
  if (adv.ok) out.push({ kind: 'advance', score: 99, cost: adv.cost, title: `Lead our people into the ${AGES[N.age + 1].name}`, why: `We know enough of the ${AGES[N.age].name}. ${AGES[N.age + 1].blurb}` });
  else if (adv.cost) out.push({ kind: 'info', score: 98, title: `The ${AGES[N.age + 1].name} awaits`, why: `Our scholars are ready, but the passage needs ${costTxt(adv.cost)}. ${adv.why}` });
  const st = N.st, wars = sim.warsOf(N.code).length;
  const need = { food: st.net.food < 0 ? 3 : 1, craft: 1.3, war: wars ? 2.4 : 0.9, sea: 0.8, lore: 1.4, civic: N.gov.stability < 0.45 ? 2 : 1, econ: 1.1 };
  const cands = available(N).filter(t => t.id !== N.research.cur).map(t => ({ t, score: need[t.branch] * 1000 / sim.techCostFor(N, t.id) * (t.age === N.age ? 1.3 : 1) }));
  for (const c of choose(cands, ch, howMany(ch, 0))) out.push({ kind: 'research', data: { id: c.t.id }, title: `Study ${c.t.name}`, why: `${c.t.desc} Roughly ${Math.ceil(sim.techCostFor(N, c.t.id) / Math.max(0.01, estimate(st.rp, ch)))} days.` });
  return out;
}
function treasury(sim, ai, N, ch) {
  const st = N.st, cands = [], g = N.gov;
  const lawProp = (cat, opt, score, why) => { const o = LAWS[cat].opts.find(x => x.id === opt); if (!o || g.laws[cat] === opt) return; const chk = canEnact(sim, N, cat, opt); if (!chk.ok && !/influence|political capital/.test(chk.why)) return; cands.push({ kind: 'law', score, pc: lawCost(N, o), data: { cat, opt }, title: `${LAWS[cat].name}: ${o.name}`, why }); };
  if (N.age >= 1 && st.net.wealth < 0) lawProp('tax', 'high', 8 - g.approval * 4, `We lose ${r1(-st.net.wealth)} wealth a day. Heavier taxes add about ${r1(estimate(st.income * 0.12, ch))}.`);
  if (N.wealth > st.income * 80 && g.laws.research !== 'high' && N.techs.writing) lawProp('research', 'high', 5, `Our treasury of ${r1(N.wealth)} could fund far more scholars.`);
  if (N.techs.code_of_laws && !N.techs.democracy && g.laws.labor === 'communal' && st.net.food > 0) lawProp('labor', 'slavery', 2 + (ch.traits.includes('Corrupt') ? 2 : 0), 'Captive labor would fill the fields and mines. It is cruel and breeds unrest.');
  if (N.techs.constitution && ['slavery', 'serfdom', 'communal'].includes(g.laws.labor)) lawProp('labor', 'free', 4, 'Free labor and wages: a richer, happier people.');
  const pricey = sim.s.trades.filter(t => t.to === N.code && !t.blockaded && !t.good.startsWith('res:')).sort((a, b) => b.amount * b.price - a.amount * a.price)[0];
  if (pricey && (st.net[pricey.good] || 0) > pricey.amount * 0.5) cands.push({ kind: 'cancelTrade', score: 4, data: { id: pricey.id }, title: `Stop buying ${pricey.good} from the ${sim.nm(pricey.from)}`, why: `We pay ${r1(pricey.amount * pricey.price)} a day for a surplus we no longer need.` });
  // stocks running low
  for (const k of ['food', 'wood', 'stone']) if ((st.net[k] || 0) < 0 && N[k] < 10 * ageScale(N.age)) cands.push({ kind: 'info', score: 6, title: `Our ${k} stores are running out`, why: `We use ${r1(-st.net[k])} more ${k} than we make each day. ${k === 'food' ? 'Farms, pastures and fisheries' : k === 'wood' ? 'Lumber mills' : 'Quarries'} would fix it.` });
  return choose(cands, ch, howMany(ch, 0));
}
function envoys(sim, ai, N, ch) {
  const s = sim.s, c = N.code, st = N.st, cands = [];
  for (const g of N.tradeGoals || []) if (!g.ok) cands.push({ kind: 'info', score: 8, title: `${g.dir === 'sell' ? 'Selling' : 'Buying'}: ${g.good.startsWith('res:') ? RES[g.good.slice(4)].name : g.good}`, why: g.status || 'Still negotiating.' });
  const live = Object.values(s.nations).filter(x => x.alive && x.code !== c && sim.knows(c, x.code));
  for (const good of GOODS) {
    const net = st.net[good] || 0;
    if (net >= 0) continue;
    for (const x of live) {
      const sur = x.st.net[good] || 0;
      if (sur < -net * 0.5 || sim.atWar(c, x.code)) continue;
      const p = { type: 'trade', good, amount: +(-net * 1.15).toFixed(2), price: +(s.prices[good] * 1.06).toFixed(2), from: x.code, to: c };
      const real = ai.evaluate(x.code, c, p).ok;
      const believed = acuity(ch) > Math.random() ? real : !real;
      if (believed) cands.push({ kind: 'trade', score: 6 + sur / 10, data: p, title: `Buy ${p.amount} ${good}/day from the ${sim.nm(x.code)}`, why: `Covers our ${good} shortfall for about ${r1(p.amount * p.price)} wealth a day.` });
    }
  }
  for (const k of ai.neededResources(c)) {
    if (N.access?.[k] || !known(N, k)) continue;
    const x = live.find(y => (y.access?.[k] || 0) >= 1 && !sim.atWar(c, y.code));
    if (!x) { cands.push({ kind: 'info', score: 3, title: `No source of ${RES[k].name}`, why: `Our armies need ${RES[k].name}, but we neither hold nor can buy any. Find a deposit or conquer one.` }); continue; }
    const p = { type: 'trade', good: 'res:' + k, amount: 1, price: +(0.06 * ageScale(N.age)).toFixed(2), from: x.code, to: c };
    cands.push({ kind: 'trade', score: 7, data: p, title: `Buy access to ${RES[k].name} from the ${sim.nm(x.code)}`, why: `Our best units need it. ${p.price} wealth a day.` });
  }
  for (const o of N.known) {
    if (!s.nations[o]?.alive) continue;
    const rel = sim.rel(c, o);
    const read = v => (acuity(ch) > Math.random() ? v : Math.random() < 0.5);
    if (rel === 'peace' && read(ai.evaluate(o, c, { type: 'nap' }).ok)) cands.push({ kind: 'treaty', score: 3 + (sim.opinion(c, o) < 0 ? 2 : 0) + (ch.traits.includes('Dove') ? 2 : 0), data: { type: 'nap', with: o }, title: `Pact of non-aggression with the ${sim.nm(o)}`, why: `Their opinion of us: ${Math.round(sim.opinion(o, c))}.` });
    if (rel === 'nap' && read(ai.evaluate(o, c, { type: 'alliance' }).ok)) cands.push({ kind: 'treaty', score: 3.5, data: { type: 'alliance', with: o }, title: `Alliance with the ${sim.nm(o)}`, why: 'Our pact has held. An alliance would deter our rivals.' });
    if (!N.overlord && !s.nations[o].overlord && rel === 'war' && read(ai.evaluate(o, c, { type: 'vassalPeace' }).ok)) cands.push({ kind: 'treaty', score: 7, data: { type: 'vassalPeace', with: o }, title: `Make the ${sim.nm(o)} our vassals`, why: 'They are losing. They may accept vassalage and tribute as the price of peace.' });
    if (!N.overlord && !s.nations[o].overlord && rel !== 'war' && sim.power(c) > sim.power(o) * 3 && read(ai.evaluate(o, c, { type: 'vassal' }).ok)) cands.push({ kind: 'treaty', score: 4 + (ch.traits.includes('Hawk') ? 2 : 0), data: { type: 'vassal', with: o }, title: `Demand the ${sim.nm(o)} swear fealty`, why: `We are far stronger. As vassals they would pay us tribute and fight beside us.` });
    if (rel === 'war' && (N.exhaustion > 0.25 || ch.traits.includes('Dove')) && read(ai.evaluate(o, c, { type: 'peace' }).ok)) cands.push({ kind: 'treaty', score: 5 + N.exhaustion * 10, data: { type: 'peace', with: o }, title: `Make peace with the ${sim.nm(o)}`, why: `War weariness stands at ${Math.round(N.exhaustion * 100)}%.` });
    if (rel === 'peace' && sim.opinion(o, c) < -25 && N.age >= 1) { const amt = Math.round(3 * ageScale(N.age)); cands.push({ kind: 'gift', score: 2.5, cost: { wealth: amt }, data: { to: o, good: 'wealth', amount: amt }, title: `Send gifts to the ${sim.nm(o)}`, why: `They distrust us (opinion ${Math.round(sim.opinion(o, c))}). Gifts would soften them.` }); }
  }
  return choose(cands, ch, howMany(ch, 0));
}
function intel(sim, ai, N, ch) {
  const s = sim.s, c = N.code, cands = [];
  if (N.age < 1) {
    const rivals = N.known.filter(o => s.nations[o]?.alive);
    if (rivals.length) { const o = rivals.sort((a, b) => sim.power(b) - sim.power(a))[0]; cands.push({ kind: 'info', score: 3, title: `Our scouts watch the ${sim.nm(o)}`, why: `They hold ${s.nations[o].st.tiles} lands and field about ${Math.max(1, Math.round(estimate(sim.unitsOf(o).length, ch)))} war bands.` }); }
    else cands.push({ kind: 'info', score: 1, title: 'We have met no other people', why: 'Our scouts find only wild lands and wandering tribes.' });
    return choose(cands, ch, 1);
  }
  const rivals = Object.values(s.nations).filter(x => x.alive && x.code !== c && sim.knows(c, x.code) && (sim.atWar(c, x.code) || sim.opinion(c, x.code) < -15));
  for (const x of rivals) {
    const lack = Object.keys(x.techs).filter(id => !N.techs[id] && TECH[id].age <= N.age && TECH[id].req.every(q => N.techs[q])).length;
    const odds = Math.max(0.08, Math.min(0.9, 0.42 + (N.mods.covert || 0) + (N.spyBonus || 0) - (x.mods.covert || 0) * 0.6));
    const shown = Math.round(Math.max(5, Math.min(95, estimate(odds, ch) * 100)));
    if (lack) cands.push({ kind: 'covert', score: lack * odds, cost: { wealth: sim.covertCost(c, 'steal') }, data: { target: x.code, op: 'steal' }, title: `Steal knowledge from the ${sim.nm(x.code)}`, why: `They know ${lack} things we do not. Estimated success ${shown}%.` });
    if (sim.atWar(c, x.code)) cands.push({ kind: 'covert', score: 3 * odds, cost: { wealth: sim.covertCost(c, 'sabotage') }, data: { target: x.code, op: 'sabotage' }, title: `Sabotage the ${sim.nm(x.code)}`, why: `Estimated success ${shown}%.` });
    if (x.gov.stability < 0.45) cands.push({ kind: 'covert', score: 2.5 * odds, cost: { wealth: sim.covertCost(c, 'unrest') }, data: { target: x.code, op: 'unrest' }, title: `Stir unrest among the ${sim.nm(x.code)}`, why: `Their rule is fragile (stability ${Math.round(estimate(x.gov.stability, ch) * 100)}%).` });
  }
  const massing = rivals.map(x => ({ x, near: s.units.filter(u => u.nation === x.code && UNITS[u.type].domain === 'land' && sim.w.adj[u.loc]?.some(j => s.regions[j].owner === c)).length })).filter(o => o.near >= 3).sort((a, b) => b.near - a.near)[0];
  if (massing) cands.push({ kind: 'info', score: 5, title: `The ${sim.nm(massing.x.code)} mass troops on our border`, why: `About ${Math.max(1, Math.round(estimate(massing.near, ch)))} units.` });
  const ahead = Object.values(s.nations).filter(x => x.alive && sim.knows(c, x.code) && x.age > N.age);
  if (ahead.length) cands.push({ kind: 'info', score: 2, title: `The ${sim.nm(ahead[0].code)} have entered the ${AGES[ahead[0].age].name}`, why: 'Their knowledge outpaces ours. Trade or steal what they know.' });
  return choose(cands, ch, howMany(ch, 0));
}

const PORTFOLIO = { industry: works, interior, defense, science, finance: treasury, foreign: envoys, intel };

export function convene(sim, ai, N) {
  const s = sim.s;
  if (N.lastCabinet !== undefined && s.t - N.lastCabinet < MEETING_COOLDOWN_DAYS * 24) return { ok: false, why: `The council met recently. It can meet again in ${Math.ceil((MEETING_COOLDOWN_DAYS * 24 - (s.t - N.lastCabinet)) / 24)} days.` };
  N.lastCabinet = s.t;
  sim.recalcNation(N.code);
  const agenda = []; let id = 1;
  for (const [role, fn] of Object.entries(PORTFOLIO)) {
    const ch = s.chars[N.gov.cabinet[role]]; if (!ch) continue;
    let props = [];
    try { props = fn(sim, ai, N, ch); } catch (e) { console.warn('council', role, e); }
    for (const p of props) agenda.push({ ...p, id: id++, role, minister: ch.id, status: 'pending' });
  }
  return { ok: true, agenda };
}
export function execute(sim, ai, N, p) {
  const s = sim.s, c = N.code, d = p.data || {};
  const ch = s.chars[p.minister]; if (ch) ch.loyalty = Math.min(1, ch.loyalty + 0.01);
  switch (p.kind) {
    case 'work': { const r = sim.startWork(c, d.i, d.kind, d.type); if (r.ok && p.extra) for (const [k, v] of Object.entries(r.cost)) N[k] -= v * p.extra; return { ok: r.ok, msg: r.ok ? `Work begins: ${p.title}.` : r.why }; }
    case 'claim': { const r = sim.claim(c, d.i); return { ok: r.ok, msg: r.ok ? 'Settlers set out.' : r.why }; }
    case 'reform': { const r = reform(sim, N, d.type); return { ok: r.ok, msg: r.ok ? 'The new order is proclaimed.' : r.why }; }
    case 'advance': { const r = sim.advance(c); return { ok: r.ok, msg: r.ok ? 'The passage to a new age begins.' : r.why }; }
    case 'recruit': { const r = sim.orderUnits(c, d.type, d.n, { near: d.near }); return { ok: r.ok, msg: r.ok ? `${d.n}× ${UNITS[d.type].name} ordered, ready in about ${r.eta} days.` : r.why }; }
    case 'move': { const r = sim.order(d.units, d.dest); return { ok: r.ok, msg: r.ok ? 'The units march.' : (r.reason || 'Route blocked.') }; }
    case 'subdue': { N.subjugate = [...new Set([...(N.subjugate || []), d.i])]; const r = sim.order(d.units.filter(id => sim.unitById.get(id)), d.i); return { ok: r.ok, msg: r.ok ? 'The war bands march against the tribes.' : (r.reason || 'No route.') }; }
    case 'upgrade': { const r = sim.upgrade(c, d.units); return { ok: r.ok, msg: r.ok ? `${r.n} units refitted.` : r.why || 'Nothing refitted.' }; }
    case 'train': { let n = 0; for (const id of d.units) { const u = sim.unitById.get(id); if (u && !u.move) { u.train = true; n++; } } return { ok: n > 0, msg: `${n} units begin drilling.` }; }
    case 'research': { const R = N.research; if (R.cur && R.cur !== d.id) R.queue.unshift(R.cur); R.cur = d.id; R.queue = R.queue.filter(x => x !== d.id); return { ok: true, msg: `Scholars turn to ${TECH[d.id].name}.` }; }
    case 'law': { const r = enact(sim, N, d.cat, d.opt); return { ok: r.ok, msg: r.ok ? `${p.title} proclaimed.` : r.why }; }
    case 'appoint': { const r = appoint(sim, N, d.role, d.id); return { ok: r.ok, msg: r.ok ? `${s.chars[d.id].name} appointed.` : r.why }; }
    case 'governor': { const r = appointGovernor(sim, N, d.pid, d.id); return { ok: r.ok, msg: r.why }; }
    case 'movement': { const r = d.act === 'crack' ? crackdown(sim, N, d.id) : concede(sim, N, d.id); return { ok: r.ok, msg: r.why }; }
    case 'cancelTrade': sim.cancelTrade(d.id); return { ok: true, msg: 'Agreement ended.' };
    case 'gift': { const r = sim.gift(c, d.to, d.good, d.amount); return { ok: r.ok, msg: r.ok ? 'The gifts are received warmly.' : r.why }; }
    case 'trade': {
      const r = ai.evaluate(d.from, c, d);
      if (!r.ok) { sim.addOpinion(d.from, c, -1); return { ok: false, msg: `The ${sim.nm(d.from)} declined: ${r.why}` }; }
      const t = sim.addTrade(d.from, c, d.good, d.amount, d.price);
      return { ok: !!t, msg: t ? `The ${sim.nm(d.from)} agree.` : 'No trade route connects us.' };
    }
    case 'treaty': {
      const r = ai.evaluate(d.with, c, { type: d.type });
      if (!r.ok) { sim.addOpinion(d.with, c, -1); return { ok: false, msg: `The ${sim.nm(d.with)} declined: ${r.why}` }; }
      if (d.type === 'peace') sim.makePeace(c, d.with);
      else if (d.type === 'vassal' || d.type === 'vassalPeace') sim.makeVassal(d.with, c, d.type === 'vassalPeace' ? 'war' : 'treaty');
      else { sim.setRel(c, d.with, d.type); sim.emit('treaty', `The ${sim.nm(c)} and the ${sim.nm(d.with)} ${d.type === 'nap' ? 'swear a pact of non-aggression' : 'form an alliance'}.`, [c, d.with]); }
      return { ok: true, msg: `The ${sim.nm(d.with)} accept.` };
    }
    case 'covert': { const r = sim.covert(c, d.target, d.op); return { ok: r.ok, msg: r.why }; }
    case 'info': return { ok: true, msg: 'Noted.' };
  }
  return { ok: false, msg: 'Unknown proposal.' };
}
export function deny(sim, N, p) { const ch = sim.s.chars[p.minister]; if (ch) ch.loyalty = Math.max(0, ch.loyalty - (ch.traits.includes('Ambitious') ? 0.03 : 0.01)); }
void LINES; void STRATEGIC; void ROLES; void ageProgress; void hireCost;
