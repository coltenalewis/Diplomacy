// World crises and hard choices: pandemics, natural disasters, depressions and climate shocks, successions and
// civil wars, debts, and the decisions a ruler faces when neighbours threaten and provinces strain. Also start scenarios.
import { ageScale } from './eras.js';
import { GOV_TYPES, EVENTS, computeMods } from './gov.js';
import { techsBefore } from './tech.js';
import { grantAutonomy } from './society.js';
import { reachKm } from './pressure.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[(Math.random() * a.length) | 0];
const RS = (N, k) => Math.round(k * Math.pow(1.75, N.age));
const kmLL = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };
const leadAge = s => { let L = 0; for (const N of Object.values(s.nations)) if (N.alive && N.age > L) L = N.age; return L; };

// put a decision before the player now; if one is already waiting (or events are delegated), the council picks `auto`
function playerEvent(sim, id, ctx, auto = 0) {
  const s = sim.s, N = s.nations[s.player], e = EVENTS.find(x => x.id === id);
  if (!e || !N?.alive) return;
  if (ctx.r) ctx.rn = sim.w.regions[ctx.r.i].name;
  ctx.cap = sim.w.regions[N.capital].name;
  if (s.pendingEvent || N.delegateEvents) { const out = e.options[auto].fx(sim, N, ctx); computeMods(s, N); sim.emit('gov', `${e.title}: ${out}`, [N.code]); return; }
  s.pendingEvent = { id, ctx, title: e.title, text: e.text(ctx, N, sim), options: e.options.map(o => o.label) };
  for (const f of sim.listeners) f({ kind: 'rp', ev: s.pendingEvent });
}

// ------------------------------------------------------------------ daily
export function crisesDaily(sim) {
  const s = sim.s; s.crises ||= [];
  const rate = s.crisisRate || 1, L = leadAge(s);
  s.crises = s.crises.filter(C => { if (s.t < C.until) return true; sim.emit('disaster', `${C.name} is over.`, [], { major: true }); return false; });
  // global shocks fold into every ruler's modifiers
  for (const N of Object.values(s.nations)) {
    if (!N.alive) continue;
    let fx = null;
    for (const C of s.crises) {
      if (C.kind === 'depression' && N.age >= 5) { fx ||= {}; fx.wealth = (fx.wealth || 0) - (N.techs.economics ? 0.18 : 0.25); fx.approval = (fx.approval || 0) - 0.04; }
      if (C.kind === 'ice') { fx ||= {}; fx.food = (fx.food || 0) - (N.age >= 6 ? 0.05 : 0.14); }
    }
    N.cfx = fx;
    // debts fall due
    if (N.debt) {
      N.wealth -= N.debt.perDay;
      if (--N.debt.left <= 0) N.debt = null;
      else if (N.wealth < -12 * ageScale(N.age)) {
        N.debt = null; N.gov.stability = clamp(N.gov.stability - 0.15, 0, 1); N.gov.approval = clamp(N.gov.approval - 0.05, 0, 1);
        sim.emit('econ', `The ${sim.nm(N.code)} default on their debts. Creditors seize what they can; the court is disgraced.`, [N.code], { loc: N.capital, major: N.code === s.player });
      }
    }
  }
  if (L >= 6 && !s.crises.some(C => C.kind === 'depression') && Math.random() < rate / 520) {
    s.crises.push({ kind: 'depression', name: pick(['The Great Depression', 'The Long Depression', 'The Great Crash', 'The Panic']), start: s.t, until: s.t + 24 * 90 });
    sim.emit('disaster', 'Markets crash and banks fail around the world. Industrial economies sink into depression: wealth falls by a quarter for months.', [], { major: true });
  }
  if (L >= 3 && L <= 6 && !s.crises.some(C => C.kind === 'ice') && Math.random() < rate / 800) {
    s.crises.push({ kind: 'ice', name: 'The Little Ice Age', start: s.t, until: s.t + 24 * 160 });
    sim.emit('disaster', 'Winters grow long and summers fail: a little ice age grips the world. Harvests shrink everywhere.', [], { major: true });
  }
  plagueDaily(sim, rate, L);
  if (Math.random() < 0.06 * rate) disaster(sim);
  for (const N of Object.values(s.nations)) if (N.alive && N.age >= 1 && !GOV_TYPES[N.gov.type].democratic && Math.random() < rate / 280) succession(sim, N);
}

// ------------------------------------------------------------------ pandemics
const PLAGUE_DAYS = 18;
function severity(N, L) {
  let k = L <= 4 ? 0.012 : L <= 6 ? 0.008 : 0.005;
  if (!N) return k;
  for (const [t, f] of [['herbalism', 0.9], ['medicine', 0.75], ['sanitation', 0.6], ['antibiotics', 0.5], ['vaccines', 0.45], ['genetic_engineering', 0.7]]) if (N.techs[t]) k *= f;
  return k;
}
function plagueDaily(sim, rate, L) {
  const s = sim.s, w = sim.w;
  if (!s.plague) {
    if (L < 1 || Math.random() > rate / 420) return;
    const cities = sim.landIdx.map(i => s.regions[i]).filter(r => r.owner && r.lvl >= 2 && r.pop > 3);
    if (!cities.length) return;
    let x = Math.random() * cities.reduce((a, r) => a + r.pop, 0), o = cities[0];
    for (const r of cities) { x -= r.pop; if (x <= 0) { o = r; break; } }
    const name = L >= 7 ? pick(['a novel influenza', 'a new respiratory virus', 'a hemorrhagic fever']) : `the ${pick(['Black', 'Grey', 'Red', 'Pale', 'Burning', 'Weeping', 'Great'])} ${pick(['Death', 'Plague', 'Fever', 'Pox', 'Sickness', 'Pestilence'])}`;
    s.plague = { name, start: s.t, origin: o.i, inf: {}, rec: {}, dead: 0, hit: {} };
    infect(sim, o.i);
    sim.emit('disaster', `An outbreak of ${name} begins in ${w.regions[o.i].name}. It spreads along roads and trade routes.`, [o.owner], { loc: o.i, major: true });
    return;
  }
  const P = s.plague, live = Object.keys(P.inf).map(Number);
  if (!live.length || s.t - P.start > 24 * 240) {
    for (const k of Object.keys(P.inf)) s.regions[k].sick = 0;
    const toll = P.dead >= 1000 ? (P.dead / 1000).toFixed(1) + ' million' : Math.round(P.dead) + ' thousand';
    const mine = P.hit[s.player];
    sim.emit('disaster', `The pandemic of ${P.name} has run its course. About ${toll} people died${mine ? `, ${mine >= 1000 ? (mine / 1000).toFixed(1) + ' million' : Math.round(mine) + ' thousand'} of them ours` : ''}.`, [], { major: true });
    s.plague = null; return;
  }
  for (const i of live) {
    const r = s.regions[i];
    if (s.t >= P.inf[i]) { delete P.inf[i]; P.rec[i] = 1; r.sick = 0; continue; }
    r.sick = P.inf[i];
    const O = r.owner && s.nations[r.owner], k = severity(O, L);
    if (r.owner) { const d = r.pop * k; r.pop -= d; P.dead += d; P.hit[r.owner] = (P.hit[r.owner] || 0) + d; } else r.natives = (r.natives || 0) * (1 - k);
    for (const j of w.adj[i]) {
      if (w.regions[j].sea || P.inf[j] || P.rec[j]) continue;
      const q = s.regions[j], qp = q.owner ? q.pop : (q.natives || 0); if (qp < 0.1) continue;
      const Q = q.owner && s.nations[q.owner];
      let p = 0.13; if (Q && (Q.quarantine || 0) > s.t) p *= 0.3; if (Q?.techs.sanitation) p *= 0.7;
      if (Math.random() < p) infect(sim, j);
    }
    // across the sea with merchants
    if (O && Math.random() < 0.035) {
      const t = s.trades.find(t => !t.blockaded && (t.from === O.code || t.to === O.code));
      const X = t && s.nations[t.from === O.code ? t.to : t.from];
      if (X?.alive && (X.quarantine || 0) <= s.t && !P.inf[X.capital] && !P.rec[X.capital]) infect(sim, X.capital);
    }
  }
}
function infect(sim, i) {
  const s = sim.s, P = s.plague, r = s.regions[i];
  P.inf[i] = s.t + 24 * PLAGUE_DAYS; r.sick = P.inf[i];
  const O = r.owner && s.nations[r.owner]; if (!O) return;
  if (!P.warned) P.warned = {};
  if (P.warned[O.code]) return;
  P.warned[O.code] = 1;
  if (O.code === s.player) playerEvent(sim, 'plague', { r, name: P.name }, 0);
  else if (Math.random() < 0.45 + O.traits.caution * 0.3) O.quarantine = s.t + 24 * 30;
}
export function plagueStatus(sim) { const P = sim.s.plague; if (!P) return null; return { name: P.name, lands: Object.keys(P.inf).length, dead: P.dead, days: Math.floor((sim.s.t - P.start) / 24) }; }

// ------------------------------------------------------------------ natural disasters
const VOLCANIC = ['Indonesia', 'Japan', 'Philippines', 'Italy', 'Iceland', 'Chile', 'Ecuador', 'Guatemala', 'Mexico', 'Papua New Guinea', 'New Zealand', 'Ethiopia', 'Kenya', 'Nicaragua', 'Costa Rica', 'El Salvador', 'Peru', 'Russia', 'United States of America'];
const SEISMIC = ['Japan', 'Turkey', 'Iran', 'China', 'Chile', 'Peru', 'Indonesia', 'Philippines', 'Nepal', 'Pakistan', 'Mexico', 'Greece', 'Italy', 'Afghanistan', 'United States of America', 'Ecuador', 'Haiti', 'New Zealand', 'Taiwan'];
function disaster(sim) {
  const s = sim.s, w = sim.w;
  let i = -1;
  for (let k = 0; k < 25; k++) { const j = sim.landIdx[(Math.random() * sim.landIdx.length) | 0]; const r = s.regions[j]; if ((r.owner ? r.pop : r.natives || 0) > 0.6) { i = j; break; } }
  if (i < 0) return;
  const r = s.regions[i], T = sim.T[i], O = r.owner && s.nations[r.owner];
  const opts = [];
  if (['mountains', 'hills'].includes(T.terrain) || SEISMIC.includes(T.country)) opts.push('quake', 'quake');
  if (T.terrain === 'floodplain' || T.river) opts.push('flood', 'flood');
  if (['desert', 'steppe', 'plains', 'grassland'].includes(T.terrain)) opts.push('drought');
  if (T.coastal && Math.abs(T.lat) < 32 && Math.abs(T.lat) > 8) opts.push('storm', 'storm');
  if (VOLCANIC.includes(T.country) && Math.random() < 0.35) opts.push('volcano');
  if (!opts.length) return;
  const kind = pick(opts), nm = w.regions[i].name;
  const hit = (q, dmg, pop) => { q.damage = clamp(q.damage + dmg, 0, 0.9); if (q.owner) { q.pop *= 1 - pop; q.unrest = clamp(q.unrest + dmg * 0.5, 0, 1); } else q.natives = (q.natives || 0) * (1 - pop); };
  let text;
  if (kind === 'quake') { hit(r, 0.35, 0.03); for (const j of w.adj[i]) if (!w.regions[j].sea) hit(s.regions[j], 0.1, 0.005); text = `An earthquake shatters ${nm}.`; }
  else if (kind === 'flood') { hit(r, 0.2, 0.015); if (O) O.food *= 0.92; text = `The rivers burst their banks around ${nm}: fields and granaries are swept away.`; }
  else if (kind === 'drought') { r.blight = s.t + 24 * 40; hit(r, 0.05, 0.01); if (O) O.food *= 0.93; text = `Drought withers the fields of ${nm}.`; }
  else if (kind === 'storm') { hit(r, 0.25, 0.01); for (const j of w.adj[i]) if (!w.regions[j].sea && sim.T[j].coastal) hit(s.regions[j], 0.1, 0.003); text = `A great storm from the sea batters ${nm}.`; }
  else {
    hit(r, 0.6, 0.08); for (const j of w.adj[i]) if (!w.regions[j].sea) hit(s.regions[j], 0.2, 0.02);
    text = `A volcano erupts near ${nm}, burying towns under ash.`;
    if (Math.random() < 0.15 && !s.crises.some(C => C.kind === 'ice')) { s.crises.push({ kind: 'ice', name: 'The Year Without a Summer', start: s.t, until: s.t + 24 * 60 }); text += ' Ash darkens the skies of the whole world: harvests fail everywhere.'; }
  }
  const P = s.nations[s.player];
  const seen = !r.owner || r.owner === s.player || P.known.includes(r.owner);
  if (O?.code === s.player) playerEvent(sim, 'disaster', { r, text }, 1);
  else {
    if (O && O.wealth > RS(O, 6) && Math.random() < 0.6) { O.wealth -= RS(O, 3); r.unrest = clamp(r.unrest - 0.15, 0, 1); }
    if (seen) sim.emit('disaster', text, r.owner ? [r.owner] : [], { loc: i, major: kind === 'volcano' });
  }
}

// ------------------------------------------------------------------ successions and civil wars
function succession(sim, N) {
  const s = sim.s;
  if (N.code === s.player) { playerEvent(sim, 'succession', {}, 0); return; }
  N.gov.stability = clamp(N.gov.stability - 0.06, 0, 1);
  if (N.gov.stability < 0.45 && (sim.owned.get(N.code)?.size || 0) >= 8 && Math.random() < 0.3) civilWar(sim, N, 'The succession is disputed');
}
export function civilWar(sim, N, why) {
  const s = sim.s, w = sim.w, cap = sim.anchor(N.capital);
  const mine = [...(sim.owned.get(N.code) || [])].filter(i => i !== N.capital);
  if (mine.length < 3) return null;
  mine.sort((a, b) => kmLL(cap, sim.anchor(b)) - kmLL(cap, sim.anchor(a)));
  const n = Math.max(2, Math.round((mine.length + 1) * (0.22 + Math.random() * 0.18)));
  const seed = mine[0], cluster = [seed], q = [seed], set = new Set(mine);
  while (q.length && cluster.length < n) { const i = q.shift(); for (const j of w.adj[i]) if (set.has(j) && !cluster.includes(j) && cluster.length < n) { cluster.push(j); q.push(j); } }
  const R = sim.newCivilization(seed, N.age, { tiles: cluster, techs: N.techs, rebel: true, parent: N.code });
  R.known = [...new Set([N.code, ...N.known.filter(c => s.nations[c]?.alive)])];
  for (const c of R.known) { const X = s.nations[c]; if (X && !X.known.includes(R.code)) X.known.push(R.code); }
  sim.setOpinion(R.code, N.code, -70); sim.setOpinion(N.code, R.code, -60);
  sim.declareWar(R.code, N.code, true);
  sim.emit('rise', `Civil war in the ${sim.nm(N.code)}! ${why}: a pretender seizes ${cluster.length} lands around ${w.regions[seed].name} and proclaims the ${sim.full(R.code)}.`, [R.code, N.code], { loc: seed, major: true });
  return R;
}

// ------------------------------------------------------------------ decisions
const never = () => null; // forced by a crisis, never rolled at random
const borderTile = (sim, N, other) => sim.regionsOf(N.code).filter(r => r.i !== N.capital && sim.w.adj[r.i].some(j => sim.s.regions[j].owner === other)).sort((a, b) => a.pop - b.pop)[0];
const neighbours = (sim, N) => { const out = new Set(); for (const r of sim.regionsOf(N.code)) for (const j of sim.w.adj[r.i]) { const o = sim.s.regions[j].owner; if (o && o !== N.code && sim.s.nations[o]?.alive && N.known.includes(o)) out.add(o); } return [...out]; };
EVENTS.push(
  { id: 'plague', when: never, title: 'Plague!',
    text: c => `${c.name[0].toUpperCase() + c.name.slice(1)} has reached ${c.rn}. The sick fill the streets and the healers cannot keep up.`,
    options: [
      { label: 'Quarantine: close the borders and the ports', fx: (sim, N) => { N.quarantine = sim.s.t + 24 * 30; N.gov.approval -= 0.04; N.wealth -= RS(N, 3); return 'Gates are shut and ships turned away. Commerce suffers, but the sickness spreads far more slowly.'; } },
      { label: 'Keep the markets open', fx: () => 'Life goes on, and so does the plague.' }] },
  { id: 'disaster', when: never, title: 'Catastrophe',
    text: c => `${c.text} The survivors look to the capital.`,
    options: [
      { label: 'Send relief: grain, coin and builders', fx: (sim, N, c) => { N.wealth -= RS(N, 4); N.food -= RS(N, 3); c.r.unrest = Math.max(0, c.r.unrest - 0.2); c.r.damage = Math.max(0, c.r.damage - 0.15); N.gov.approval += 0.02; return 'Relief columns reach the stricken land. The people will remember it.'; } },
      { label: 'They must fend for themselves', fx: (sim, N, c) => { c.r.unrest = Math.min(1, c.r.unrest + 0.15); N.gov.approval -= 0.02; return 'The treasury is spared. Bitterness spreads.'; } }] },
  { id: 'succession', when: never, title: 'The Ruler Is Dead',
    text: (c, N, sim) => `The ${GOV_TYPES[N.gov.type].ruler.toLowerCase()} of the ${sim.nm(N.code)} has died. Factions at court gather around rival heirs.`,
    options: [
      { label: 'Crown the rightful heir', fx: (sim, N) => { N.gov.stability -= 0.05; N.gov.approval += 0.02; if (N.gov.stability < 0.3 && Math.random() < 0.4 && civilWar(sim, N, 'A rival heir refuses to kneel')) return 'The heir is crowned, but a rival raises the banner of revolt!'; return 'The heir is crowned. The court grumbles but obeys.'; } },
      { label: "Buy the great lords' loyalty", fx: (sim, N) => { N.wealth -= RS(N, 8); N.gov.pc -= 20; N.gov.stability += 0.03; return 'Gold and titles change hands. The succession passes quietly.'; } },
      { label: 'Purge the rival claimants', fx: (sim, N) => { N.gov.stability += 0.02; N.gov.approval -= 0.06; if (Math.random() < 0.25 && civilWar(sim, N, 'Surviving claimants flee to the provinces')) return 'Blood flows in the palace, and the provinces rise in revolt!'; return 'The rivals vanish in the night. No one dares speak of it.'; } }] },
  { id: 'ultimatum', minAge: 1, when: (sim, N) => {
      const mp = sim.realmPower(N.code) + 1;
      const X = neighbours(sim, N).filter(o => !sim.atWar(o, N.code) && sim.realmPower(o) > mp * 2.5 && sim.opinion(o, N.code) < 10 && sim.realmOf(o) !== sim.realmOf(N.code))[0];
      const r = X && borderTile(sim, N, X); return r && { r, from: X }; }, title: 'An Ultimatum',
    text: (c, N, sim) => `Envoys of the mighty ${sim.full(c.from)} arrive with an ultimatum: cede ${c.rn} to them, or face war.`,
    options: [
      { label: `Yield the land`, fx: (sim, N, c) => { if (c.r.owner === N.code) sim.transfer(c.r, c.from, true); sim.addOpinion(c.from, N.code, 15); N.gov.approval -= 0.05; return 'The land is surrendered. Our people burn with shame.'; } },
      { label: 'Refuse. Let them come', fx: (sim, N, c) => { sim.addOpinion(c.from, N.code, -25); N.gov.approval += 0.03; if (Math.random() < 0.55) { sim.declareWar(c.from, N.code); return 'They make good on their threat. War!'; } return 'They bluster, but do not march. For now.'; } }] },
  { id: 'border', minAge: 1, when: (sim, N) => { const X = pick(neighbours(sim, N).filter(o => !sim.atWar(o, N.code))); const r = X && borderTile(sim, N, X); return r && { r, from: X }; }, title: 'Border Incident',
    text: (c, N, sim) => `Our soldiers and those of the ${sim.nm(c.from)} have clashed near ${c.rn}. There are dead on both sides.`,
    options: [
      { label: 'Demand reparations', fx: (sim, N, c) => { const X = sim.s.nations[c.from]; if (Math.random() < 0.4 && X.wealth > RS(N, 5)) { X.wealth -= RS(N, 5); N.wealth += RS(N, 5); sim.addOpinion(c.from, N.code, -8); return 'They pay, through clenched teeth.'; } sim.addOpinion(c.from, N.code, -15); N.gov.approval += 0.03; return 'They refuse. Our people cheer our firmness; relations sour.'; } },
      { label: 'Smooth it over', fx: (sim, N, c) => { sim.addOpinion(c.from, N.code, 6); N.gov.approval -= 0.02; return 'Apologies are exchanged. Some call it weakness.'; } }] },
  { id: 'refugees', minAge: 2, when: (sim, N) => { const X = pick(neighbours(sim, N).filter(o => sim.warsOf(o).length || sim.s.nations[o].famine > 0.05 || (sim.s.nations[o].st.unrestW || 0) > 0.3)); const r = X && borderTile(sim, N, X); return r && { r, from: X }; }, title: 'Refugees',
    text: (c, N, sim) => `Thousands of refugees fleeing the turmoil in the lands of the ${sim.nm(c.from)} are crossing into ${c.rn}.`,
    options: [
      { label: 'Take them in', fx: (sim, N, c) => { const X = sim.s.nations[c.from]; c.r.pop *= 1.08; c.r.unrest = Math.min(1, c.r.unrest + 0.12); if (X && Math.random() < 0.5) c.r.cul = X.cul; sim.addOpinion(c.from, N.code, 8); return 'Camps become villages. New hands, new tensions.'; } },
      { label: 'Close the border', fx: (sim, N) => { N.gov.approval += 0.01; return 'Soldiers turn the columns back.'; } }] },
  { id: 'taxrevolt', minAge: 2, when: (sim, N) => { if (N.gov.approval > 0.5 && N.gov.laws.tax !== 'high' && N.gov.laws.tax !== 'war') return null; const r = sim.regionsOf(N.code).filter(x => x.i !== N.capital && x.lvl >= 2).sort((a, b) => b.unrest - a.unrest)[0]; return r && { r }; }, title: 'The Tax Revolt',
    text: c => `The landowners and townsfolk of ${c.rn} refuse to pay this year's taxes. Collectors have been driven out with stones.`,
    options: [
      { label: 'Collect with soldiers', fx: (sim, N, c) => { N.wealth += RS(N, 4); c.r.unrest = Math.min(1, c.r.unrest + 0.25); return 'The taxes are collected at spearpoint.'; } },
      { label: 'Grant an exemption', fx: (sim, N, c) => { c.r.unrest = Math.max(0, c.r.unrest - 0.12); N.gov.approval += 0.02; N.gov.pc -= 10; return 'The exemption calms them, and other towns take note.'; } }] },
  { id: 'loan', minAge: 4, when: (sim, N) => (N.wealth < RS(N, 10) && !N.debt ? {} : null), title: 'The Bankers Call',
    text: (c, N) => `A great banking house offers the crown a loan of ${RS(N, 30)} wealth, to be repaid with interest over the next four months.`,
    options: [
      { label: 'Take the loan', fx: (sim, N) => { const L = RS(N, 30); N.wealth += L; N.debt = { perDay: +(L * 1.35 / 120).toFixed(2), left: 120 }; return `The coffers fill. We owe ${Math.round(L * 1.35)} over 120 days; default would disgrace us.`; } },
      { label: 'Decline', fx: () => 'We will live within our means.' }] },
  { id: 'selfrule', minAge: 3, when: (sim, N) => {
      const cap = sim.anchor(N.capital), reach = reachKm(N);
      const r = sim.regionsOf(N.code).filter(x => x.i !== N.capital && x.unrest > 0.25 && sim.provOf[x.i] !== sim.provOf[N.capital] && kmLL(cap, sim.anchor(x.i)) > reach).sort((a, b) => b.unrest - a.unrest)[0];
      return r && { r, pid: sim.provOf[r.i] }; }, title: 'A Demand for Self-Rule',
    text: (c, N, sim) => `Leaders of distant ${sim.provs[c.pid]?.name || c.rn} send a petition: they will govern themselves, under our crown but by their own councils.`,
    options: [
      { label: 'Grant autonomy', fx: (sim, N, c) => { const tiles = (sim.provs[c.pid]?.tiles || [c.r.i]).filter(i => sim.s.regions[i].owner === N.code); const r = grantAutonomy(sim, N, tiles, 'You grant the petition.'); return r.ok ? 'A new autonomous state is born under our protection.' : r.why; } },
      { label: 'Refuse', fx: (sim, N, c) => { for (const i of sim.provs[c.pid]?.tiles || []) { const q = sim.s.regions[i]; if (q.owner === N.code) q.unrest = Math.min(1, q.unrest + 0.2); } return 'The petitioners go home angry. Agitators fill the taverns.'; } }] },
  { id: 'overreach', minAge: 1, when: (sim, N) => ((N.adminOver || 0) > 3 ? {} : null), title: 'The Administration Buckles',
    text: (c, N) => `Our officials cannot keep up: we rule ${N.adminOver} more lands than the state can properly govern. Taxes go uncollected, orders unanswered, and the provinces drift.`,
    options: [
      { label: 'Reorganize the administration', fx: (sim, N) => { N.gov.pc -= 40; N.wealth -= RS(N, 4); N.expHeat = (N.expHeat || 0) * 0.4; for (const r of sim.regionsOf(N.code)) r.unrest = Math.max(0, r.unrest - 0.06); return 'New offices, new clerks, new roads. It will hold, for a while. Appoint governors to extend our reach.'; } },
      { label: 'Press on regardless', fx: (sim, N) => { N.gov.stability -= 0.05; return 'The cracks widen.'; } }] },
  { id: 'triumph', minAge: 2, when: (sim, N) => { const g = (N.generals || []).map(id => sim.s.chars[id]).filter(Boolean).sort((a, b) => b.skill - a.skill)[0]; return g && sim.warsOf(N.code).length ? { g } : null; }, title: 'A Triumph Demanded',
    text: c => `${c.g.name}, our most celebrated commander, demands a triumph through the capital and a seat among the great of the realm.`,
    options: [
      { label: 'Grant the triumph', fx: (sim, N, c) => { N.gov.pc -= 20; N.gov.approval += 0.03; c.g.loyalty = Math.min(1, c.g.loyalty + 0.25); return 'Crowds cheer the victorious army. The general is grateful, for now.'; } },
      { label: 'Keep the general in their place', fx: (sim, N, c) => { c.g.loyalty = Math.max(0, c.g.loyalty - 0.3); N.gov.stability -= 0.02; return 'The general bows stiffly. Officers mutter in the barracks.'; } }] },
  { id: 'conspiracy', minAge: 1, when: (sim, N) => (N.gov.stability < 0.6 ? {} : null), title: 'A Conspiracy Uncovered',
    text: (c, N, sim) => `Our agents have uncovered a plot against the ${GOV_TYPES[N.gov.type].ruler.toLowerCase()}. Powerful names are on the list.`,
    options: [
      { label: 'Purge the conspirators', fx: (sim, N) => { N.gov.stability += 0.06; N.gov.approval -= 0.04; N.gov.pc += 10; return 'Arrests at dawn, trials by noon. Fear restores order.'; } },
      { label: 'Show clemency', fx: (sim, N) => { N.gov.approval += 0.03; N.gov.stability -= 0.04; return 'Mercy wins hearts, and leaves enemies alive.'; } }] },
  { id: 'monopoly', minAge: 3, when: () => ({}), title: 'The Merchant Princes',
    text: () => 'A consortium of great merchants offers a fortune for a royal monopoly on the realm\'s most profitable trade.',
    options: [
      { label: 'Sell the charter', fx: (sim, N) => { N.wealth += RS(N, 7); N.gov.approval -= 0.03; return 'Gold pours in. Prices rise, and so does resentment.'; } },
      { label: 'Keep the markets free', fx: (sim, N) => { N.gov.approval += 0.01; return 'Small traders bless your name.'; } }] },
);

// ------------------------------------------------------------------ start scenarios
export const SCENARIOS = {
  standard: { name: 'Open World', desc: 'The classic start: tribes scattered across an empty Earth.' },
  empires: { name: 'Rising Empires', desc: 'Four rival peoples start an age ahead with wide lands and hungry rulers.' },
  underdog: { name: 'Underdog', desc: 'You start poor beside a powerful, hostile neighbour. Survive, then surpass.' },
  chaos: { name: 'Age of Chaos', desc: 'Plagues, disasters, successions and wars come two and a half times as often.' },
};
export function applyScenario(sim, sc) {
  const s = sim.s; s.scenario = SCENARIOS[sc] ? sc : 'standard';
  s.crisisRate = s.scenario === 'chaos' ? 2.5 : 1;
  if (s.scenario === 'chaos') s.temper = (s.temper || 1) * 1.4;
  const P = s.nations[s.player];
  const grow = (N, n) => {
    const q = [N.capital], seen = new Set(q); let got = 0;
    while (q.length && got < n) { const i = q.shift(); for (const j of sim.w.adj[i]) { if (seen.has(j) || sim.w.regions[j].sea) continue; seen.add(j); const r = s.regions[j]; if (r.owner || sim.T[j].terrain === 'ice') continue; r.owner = r.core = N.code; r.lvl = Math.max(1, Math.floor(N.age * 0.6)); r.pop = sim.housing(r, N) * 0.55 + (r.natives || 0); r.natives = 0; got++; q.push(j); if (got >= n) break; } }
  };
  const boost = (N, n) => {
    N.age = Math.min(9, N.age + 1); N.techs = { ...techsBefore(N.age), ...N.techs };
    N.traits.aggression = Math.max(N.traits.aggression, 0.75); N.traits.expansion = 0.95;
    grow(N, n); sim.rebuildCaches();
    computeMods(s, N); sim.recalcNation(N.code);
    const k = ageScale(N.age); N.food = 20 * k; N.wood = 15 * k; N.stone = 10 * k; N.metal = 8 * k; N.wealth = 12 * k;
    sim.seedForces(N); sim.seedForces(N);
  };
  const ais = Object.values(s.nations).filter(N => N.alive && N.code !== s.player);
  const pcap = sim.anchor(P.capital);
  if (s.scenario === 'empires') for (const N of ais.filter(N => kmLL(sim.anchor(N.capital), pcap) > 1500).sort(() => Math.random() - 0.5).slice(0, 4)) boost(N, 10);
  if (s.scenario === 'underdog') {
    const near = ais.sort((a, b) => kmLL(sim.anchor(a.capital), pcap) - kmLL(sim.anchor(b.capital), pcap));
    if (near[0]) { boost(near[0], 12); sim.setOpinion(near[0].code, P.code, -35); near[0].traits.aggression = 0.9; }
    if (near[1]) boost(near[1], 5);
    P.food *= 0.5; P.wood *= 0.5; P.stone *= 0.5; P.wealth *= 0.5;
  }
}
