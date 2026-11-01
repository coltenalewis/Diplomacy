// Reputation and pacts. Every people earns a reputation from what it does (a zealot, an oathbreaker, a steadfast ally,
// a merchant power...), and others judge it by their own lights: a zealot is loved by its own faith and feared by
// every other. Peoples bind themselves into pacts (leagues, assemblies, covenants, unions) whose doctrines decide
// what membership means: an attack on one is an attack on all, no war among members, a common market, shared
// learning, one faith, and parliamentary sessions where the members vote on the questions of the world.
import { addInfamy } from './pressure.js';
import { ageScale } from './eras.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[(Math.random() * a.length) | 0];
const DAY = 24;

// ------------------------------------------------------------------ reputation
export const REP = {
  zealot: { name: 'Religious Zealot', icon: '🔥', desc: 'Wages holy wars and presses its faith on others. Its own faith admires it; every other faith fears it, and rival zealots most of all.' },
  oathbreaker: { name: 'Oathbreaker', icon: '🗡️', desc: 'Breaks treaties and abandons allies. Nobody trusts its word, and pacts hesitate to admit it.' },
  steadfast: { name: 'Steadfast Ally', icon: '🛡️', desc: 'Answers every call to arms. Its word is gold, and peoples are eager to stand beside it.' },
  warmonger: { name: 'Warmonger', icon: '⚔️', desc: 'Starts wars of choice. Cautious peoples keep their distance.' },
  tyrant: { name: 'Tyrant', icon: '⛓️', desc: 'Bleeds its vassals and bullies neighbours with ultimatums. Its subjects most of all resent it.' },
  merchant: { name: 'Merchant Power', icon: '⚖️', desc: 'Its traders are everywhere. Partners value it, and merchant leagues court it.' },
  peacemaker: { name: 'Peacemaker', icon: '🕊️', desc: 'Brokers peace, relieves famine and keeps the councils of the world. Respected by all.' },
  scholar: { name: 'Enlightened', icon: '📜', desc: 'Shares its knowledge freely. Learned peoples admire it.' },
  criminal: { name: 'War Criminal', icon: '☠️', desc: 'Its forces bomb cities, punish civilians and break the laws of war. The world remembers, and the tribunals wait.' },
  liberator: { name: 'Liberator', icon: '🕊️', desc: 'Frees occupied peoples and brings war criminals to justice.' },
};
export function earn(sim, c, tag, v) {
  const N = sim.s.nations[c]; if (!N || !REP[tag]) return;
  N.rep ||= {}; N.rep[tag] = clamp((N.rep[tag] || 0) + v, 0, 100);
  sim._repT = -1; // opinions shift with it
}
export const repLevel = v => (v >= 60 ? 'renowned' : v >= 25 ? 'known' : null);
// the reputations that show: [{ tag, v, level }], strongest first
export function repTags(N) { return Object.entries(N?.rep || {}).filter(([, v]) => v >= 25).sort((a, b) => b[1] - a[1]).map(([tag, v]) => ({ tag, v, level: repLevel(v) })); }

// opinion points viewer v holds toward subject x because of x's reputation and shared pacts; cached per day
export function repOpinion(sim, v, x) {
  if (v === x) return 0;
  const s = sim.s;
  if (sim._repT !== s.t) { sim._repT = s.t; sim._repC = new Map(); }
  const key = v + '|' + x; const c = sim._repC.get(key); if (c !== undefined) return c;
  const V = s.nations[v], X = s.nations[x];
  let o = 0;
  const R = X?.rep;
  if (V && R) {
    const k = t => (R[t] || 0) / 100;
    if (R.zealot) o += V.faith && V.faith === X.faith ? 12 * k('zealot') : -16 * k('zealot') * (1 + (V.rep?.zealot || 0) / 100);
    o -= 22 * k('oathbreaker');
    o += 14 * k('steadfast');
    o -= 12 * k('warmonger') * (0.5 + (V.traits?.caution || 0.5));
    o -= 14 * k('tyrant') * (V.overlord === x ? 1.6 : 1);
    o += 8 * k('merchant');
    o += 10 * k('peacemaker');
    o += 10 * k('scholar') * (0.4 + (V.traits?.science || 0.5));
    o -= 26 * k('criminal') * (1 - (V.brut || 0.1) * 0.7);
    o += 10 * k('liberator');
  }
  for (const P of s.pacts || []) if (P.members.includes(v) && P.members.includes(x)) o += P.doctrines.faith ? 10 : 6;
  o = Math.round(o * 10) / 10;
  sim._repC.set(key, o);
  return o;
}

// ------------------------------------------------------------------ pacts
export const DOCTRINES = {
  defense: { name: 'An attack on one is an attack on all', short: 'Mutual defence', icon: '🛡️', desc: 'When a member is attacked, every member is called to war. Those who refuse are branded oathbreakers.' },
  nonaggression: { name: 'Peace among members', short: 'No war among members', icon: '🤝', desc: 'Members may not make war on one another. An aggressor is expelled and branded an oathbreaker.' },
  council: { name: 'Parliamentary sessions', short: 'Council votes', icon: '🏛️', desc: 'Every season the members meet to debate and vote on a question of the world: condemnation, sanctions, intervention, peace, relief, membership.' },
  sanctions: { name: 'Collective embargo', short: 'Joint embargoes', icon: '🚫', desc: 'When the council sanctions a people, every member cuts its trade with them.' },
  market: { name: 'Common market', short: 'Common market', icon: '⚖️', desc: 'Members trade freely: more wealth for every member, and goodwill grows between them. Members earn a name as a merchant power.' },
  research: { name: 'Shared learning', short: 'Shared learning', icon: '📜', desc: 'Members pool their scholars: research rises with every member.' },
  faith: { name: 'One faith', short: 'One faith', icon: '🔥', desc: 'Only peoples of the founding faith may join. Members bond closely and grow zealous; other faiths look on with suspicion.' },
};
export const PRESETS = {
  league: { name: 'Defensive League', icon: '🛡️', color: '#e0a83e', doctrines: ['defense', 'nonaggression'], names: ['League of {place}', 'The {adj} League', 'Shield of {place}', 'Iron Pact of {place}', 'Alliance of {place}'], desc: 'Neighbours who swear to defend one another.' },
  assembly: { name: 'Assembly of Nations', icon: '🏛️', color: '#5aa9e6', doctrines: ['council', 'nonaggression', 'sanctions'], names: ['Assembly of Nations', 'Council of Peoples', 'Concord of {place}', 'The United Assembly', 'Parliament of the World', 'League of Peoples'], desc: 'A parliament of peoples that debates and votes on the great questions of the world.' },
  trade: { name: 'Merchant League', icon: '⚖️', color: '#47c08f', doctrines: ['market', 'council'], names: ['The {adj} Merchant League', 'Compact of {place}', 'Hanse of {place}', 'Free Trade Union', 'Guild of {place}'], desc: 'Open markets, shared roads, common prosperity.' },
  covenant: { name: 'Holy Covenant', icon: '🔥', color: '#d0574f', doctrines: ['faith', 'defense', 'council'], names: ['Covenant of {faith}', 'Holy League of {faith}', 'Brotherhood of {faith}', 'Sacred Union of {faith}'], desc: 'The faithful stand together, against all comers.' },
  scholars: { name: "Scholars' Union", icon: '📜', color: '#a88be8', doctrines: ['research', 'nonaggression'], names: ['Union of Learning', 'The {adj} Academy', 'Circle of Sages', 'Republic of Letters'], desc: 'Knowledge shared is knowledge doubled.' },
};
const PACT_COLORS = ['#e0a83e', '#5aa9e6', '#47c08f', '#d0574f', '#a88be8', '#e57fb0', '#62c7c9', '#c8c85a', '#ef8b4f', '#8ea3ff'];
export const FOUND_COST = 30; // influence

export function pactName(sim, founder, preset) {
  const s = sim.s, N = s.nations[founder], P = PRESETS[preset] || PRESETS.league;
  const place = sim.w.regions[N.capital]?.name || N.name;
  const faith = s.faiths?.[N.faith]?.name || 'the Faith';
  const adj = s.cultures?.[N.cul]?.adj || N.adj || N.name;
  const used = new Set((s.pacts || []).map(x => x.name));
  const opts = P.names.map(n => n.replace('{place}', place).replace('{adj}', adj).replace('{faith}', faith));
  const free = opts.filter(n => !used.has(n));
  if (free.length) return pick(free);
  for (let k = 2; ; k++) { const n = `${pick(opts)} ${['', '', 'II', 'III', 'IV', 'V', 'VI'][k] || k}`; if (!used.has(n)) return n; }
}
export const pactsOf = (sim, c) => (sim.s.pacts || []).filter(P => P.members.includes(c));
export const pactById = (sim, id) => (sim.s.pacts || []).find(P => P.id === id);
export const shares = (sim, a, b, doc) => (sim.s.pacts || []).some(P => P.doctrines[doc] && P.members.includes(a) && P.members.includes(b));

export function initPacts(sim) {
  const s = sim.s;
  s.pacts ||= []; s.pactId ||= 1;
  for (const N of Object.values(s.nations)) N.rep ||= {};
  if (!sim._pactHook) {
    sim._pactHook = true;
    // founding a faith marks a people as zealous
    sim.on(e => { if (e.kind === 'faith' && e.major && e.nations?.[0]) earn(sim, e.nations[0], 'zealot', 20); });
  }
}

export function canJoin(sim, P, c) {
  const s = sim.s, N = s.nations[c];
  if (!N?.alive) return { ok: false, why: 'They are gone.' };
  if (P.members.includes(c)) return { ok: false, why: 'Already a member.' };
  if (P.doctrines.faith && N.faith !== P.faith) return { ok: false, why: `Only followers of ${s.faiths?.[P.faith]?.name || 'the founding faith'} may join.` };
  const foe = P.members.find(m => sim.atWar(m, c));
  if (foe) return { ok: false, why: `They are at war with a member, the ${sim.nm(foe)}.` };
  if (pactsOf(sim, c).length >= (s.modern ? 7 : 3)) return { ok: false, why: `They are already bound to ${s.modern ? 'seven' : 'three'} pacts.` };
  return { ok: true };
}

export function foundPact(sim, founder, { preset = 'league', name, doctrines } = {}) {
  const s = sim.s, N = s.nations[founder];
  if (pactsOf(sim, founder).length >= (s.modern ? 7 : 3)) return { ok: false, why: `You are already bound to ${s.modern ? 'seven' : 'three'} pacts.` };
  if (founder === s.player && (N.gov.pc || 0) < FOUND_COST) return { ok: false, why: `Founding a pact takes ${FOUND_COST} influence.` };
  const docs = {}; for (const d of doctrines || PRESETS[preset].doctrines) if (DOCTRINES[d]) docs[d] = true;
  if (!Object.keys(docs).length) return { ok: false, why: 'A pact needs at least one doctrine.' };
  if (founder === s.player) N.gov.pc -= FOUND_COST;
  const used = new Set(s.pacts.map(p => p.color));
  const P = {
    id: s.pactId++, name: (name || '').trim() || pactName(sim, founder, preset), preset, founder, chair: founder, members: [founder], doctrines: docs,
    faith: docs.faith ? N.faith : null, color: PRESETS[preset]?.color && !used.has(PRESETS[preset].color) ? PRESETS[preset].color : PACT_COLORS.find(c => !used.has(c)) || pick(PACT_COLORS),
    founded: s.t, nextSession: s.t + DAY * (60 + Math.random() * 30), log: [], bonus: { trade: 0, research: 0 },
  };
  s.pacts.push(P);
  sim.emit('treaty', `The ${sim.nm(founder)} found the ${P.name}.`, [founder], { loc: N.capital, major: founder !== s.player });
  return { ok: true, pact: P };
}

export function joinPact(sim, P, c) {
  const ok = canJoin(sim, P, c); if (!ok.ok) return ok;
  P.members.push(c);
  for (const m of P.members) if (m !== c) { sim.addOpinion(m, c, 6); sim.addOpinion(c, m, 6); }
  if (P.doctrines.faith) earn(sim, c, 'zealot', 6);
  sim.emit('treaty', `The ${sim.nm(c)} join the ${P.name}.`, [c, P.chair]);
  return { ok: true, why: `The ${sim.nm(c)} join the ${P.name}.` };
}

export function leavePact(sim, P, c, how = 'leave') {
  const s = sim.s;
  if (!P.members.includes(c)) return { ok: false, why: 'Not a member.' };
  // walking out on allies in the middle of their war is remembered
  const deserting = how === 'leave' && P.doctrines.defense && P.members.some(m => m !== c && sim.warsOf(m).length);
  P.members = P.members.filter(m => m !== c);
  if (deserting) { earn(sim, c, 'oathbreaker', 20); for (const m of P.members) sim.addOpinion(m, c, -20); }
  else for (const m of P.members) sim.addOpinion(m, c, how === 'expelled' ? -15 : -5);
  if (P.chair === c) P.chair = P.members.slice().sort((a, b) => sim.score(b) - sim.score(a))[0] || null;
  sim.emit('treaty', how === 'expelled' ? `The ${sim.nm(c)} are expelled from the ${P.name}.` : `The ${sim.nm(c)} leave the ${P.name}${deserting ? ', abandoning their allies at war' : ''}.`, [c, ...(P.chair ? [P.chair] : [])]);
  if (P.members.length < 2 && s.t - P.founded > DAY * 30) dissolve(sim, P);
  return { ok: true, why: how === 'expelled' ? 'Expelled.' : `You leave the ${P.name}.` };
}
function dissolve(sim, P) {
  const s = sim.s;
  s.pacts = s.pacts.filter(x => x !== P);
  sim.emit('treaty', `The ${P.name} is dissolved.`, P.members.slice(0, 1));
}

// would an AI people join this pact? { ok, why, score }
export function joinAppeal(sim, ai, P) {
  const s = sim.s, A = s.nations[ai], t = A.traits;
  const can = canJoin(sim, P, ai); if (!can.ok) return { ...can, score: -9 };
  let sc = 0, best = '';
  const ops = P.members.map(m => sim.opinion(ai, m));
  const avg = ops.reduce((a, v) => a + v, 0) / Math.max(1, ops.length), worst = Math.min(...ops);
  sc += avg / 18 + Math.min(0, worst + 30) / 25;
  const chair = s.nations[P.chair];
  sc -= (chair?.rep?.oathbreaker || 0) / 30;
  sc += (chair?.rep?.steadfast || 0) / 40;
  const threat = sim.warsOf(ai).length || (A.known || []).some(o => (s.nations[o]?.infamy || 0) > 12 && sim.power(o) > sim.power(ai));
  if (P.doctrines.defense) { const v = t.caution * 1.2 + (threat ? 1.2 : 0) + (A.st.tiles < 8 ? 0.6 : 0); sc += v; if (v > 1) best = 'Together we are safe.'; }
  if (P.doctrines.nonaggression) sc += t.caution * 0.6 - t.aggression * 0.9;
  if (P.doctrines.market) { const v = (A.rep?.merchant || 0) / 40 + 0.4; sc += v; if (v > 0.9) best ||= 'Our merchants will thrive.'; }
  if (P.doctrines.research) { const v = t.science * 1.2; sc += v; if (v > 0.8) best ||= 'Knowledge shared is knowledge doubled.'; }
  if (P.doctrines.faith) { sc += 1 + (A.rep?.zealot || 0) / 40; best ||= 'The faithful must stand together.'; }
  if (P.doctrines.council) sc += 0.3 + (A.rep?.peacemaker || 0) / 50;
  sc -= pactsOf(sim, ai).length * 0.7;
  sc += Math.min(1, P.members.length * 0.15); // a big pact draws more
  const ok = sc > 1.3;
  return { ok, score: sc, why: ok ? best || 'We will stand with you.' : avg < 0 ? 'We do not trust your company.' : t.aggression > 0.7 && P.doctrines.nonaggression ? 'We will not tie our hands.' : 'The pact does not serve us now.' };
}

// invite a people into a pact: the player gets a proposal, AI peoples decide at once
export function invite(sim, P, from, to) {
  const s = sim.s;
  const can = canJoin(sim, P, to); if (!can.ok) return can;
  if (to === s.player) {
    if (s.messages.some(m => m.status === 'pending' && m.proposal?.type === 'pactInvite' && m.proposal.pact === P.id)) return { ok: false, why: 'Invitation already sent.' };
    sim.message(from, to, `We invite you to join the ${P.name} (${Object.keys(P.doctrines).map(d => DOCTRINES[d].short).join(', ')}).`, { type: 'pactInvite', pact: P.id });
    return { ok: true, why: 'Invitation sent.' };
  }
  const r = joinAppeal(sim, to, P);
  if (r.ok) { joinPact(sim, P, to); return { ok: true, why: `The ${sim.nm(to)} accept: "${r.why}"` }; }
  sim.addOpinion(to, from, -1);
  return { ok: false, why: `The ${sim.nm(to)} decline: "${r.why}"` };
}

// ------------------------------------------------------------------ war hooks (called from Sim.declareWar)
export function onWar(sim, a, b, prev) {
  const s = sim.s;
  if (prev === 'nap' || prev === 'alliance') earn(sim, a, 'oathbreaker', 35);
  const A = s.nations[a], B = s.nations[b];
  if (A && B && A.faith && B.faith && A.faith !== B.faith && (A.gov?.type === 'theocracy' || A.gov?.laws?.religion === 'state' || (A.rep?.zealot || 0) > 20)) earn(sim, a, 'zealot', 6);
  // peace among members: the aggressor is thrown out
  for (const P of [...(s.pacts || [])]) {
    if (P.doctrines.nonaggression && P.members.includes(a) && P.members.includes(b)) {
      earn(sim, a, 'oathbreaker', 30);
      for (const m of P.members) if (m !== a) sim.addOpinion(m, a, -25);
      leavePact(sim, P, a, 'expelled');
    }
  }
  // an attack on one is an attack on all
  for (const P of s.pacts || []) {
    if (!P.doctrines.defense || !P.members.includes(b) || P.members.includes(a)) continue;
    const called = [];
    for (const m of P.members) {
      if (m === b || sim.atWar(m, a) || sim.rel(m, a) === 'alliance' || !s.nations[m]?.alive) continue;
      if (m === s.player) { sim.message(b, m, `The ${sim.nm(a)} have attacked us. By the ${P.name}, an attack on one is an attack on all: we call on you to march.`, { type: 'callToArms', against: a, pact: P.id }); continue; }
      const M = s.nations[m];
      const p = 0.4 + M.traits.loyalty * 0.45 + sim.opinion(m, b) / 250 - M.traits.caution * 0.15 - (sim.power(a) > sim.power(m) * 3 ? 0.25 : 0) + (M.rep?.steadfast || 0) / 300;
      if (Math.random() < p) { sim.setRel(m, a, 'war'); sim.addOpinion(a, m, -35); earn(sim, m, 'steadfast', 8); called.push(m); }
      else { earn(sim, m, 'oathbreaker', 12); for (const x of P.members) if (x !== m) sim.addOpinion(x, m, -12); sim.emit('treaty', `The ${sim.nm(m)} fail to answer the ${P.name}'s call to defend the ${sim.nm(b)}.`, [m, b]); }
    }
    if (called.length) sim.emit('war', `The ${P.name} answers: ${called.map(c => 'the ' + sim.nm(c)).join(', ')} declare war on the ${sim.nm(a)} in defence of the ${sim.nm(b)}.`, [...called, a], { loc: s.nations[a].capital, major: true });
  }
}

// ------------------------------------------------------------------ daily
// pact bonuses ride on the national modifiers (called after computeMods)
export function pactMods(sim, N) {
  for (const P of pactsOf(sim, N.code)) {
    const n = Math.min(6, P.members.length - 1);
    if (P.doctrines.research) N.mods.research = (N.mods.research || 0) + 0.025 * n + P.bonus.research;
    if (P.doctrines.market) N.mods.wealth = (N.mods.wealth || 0) + 0.02 * n + P.bonus.trade;
  }
}

export function pactsDaily(sim) {
  const s = sim.s;
  initPacts(sim);
  // reputations fade unless renewed; zealous governments keep theirs burning
  for (const N of Object.values(s.nations)) {
    if (!N.alive) continue;
    const R = N.rep;
    for (const k in R) { R[k] *= 0.996; if (R[k] < 0.5) delete R[k]; }
    if (N.gov?.type === 'theocracy') earn(sim, N.code, 'zealot', 0.14); else if (N.gov?.laws?.religion === 'state') earn(sim, N.code, 'zealot', 0.11);
    if (N.gov?.laws?.religion === 'tolerance' || N.gov?.laws?.religion === 'secular') { if (R.zealot) R.zealot *= 0.99; }
    if (N.infamy > 12) earn(sim, N.code, 'warmonger', 0.04 * (N.infamy - 12));
    for (const v of sim.vassalsOf(N.code)) if ((s.nations[v].tribute ?? 0.25) >= 0.4) earn(sim, N.code, 'tyrant', 0.05);
  }
  const deals = new Map(); for (const t of s.trades) { deals.set(t.from, (deals.get(t.from) || 0) + 1); deals.set(t.to, (deals.get(t.to) || 0) + 1); }
  for (const [c, n] of deals) earn(sim, c, 'merchant', 0.028 * Math.min(8, n));
  for (const P of [...s.pacts]) {
    P.members = P.members.filter(m => s.nations[m]?.alive);
    if (!P.members.length || (P.members.length < 2 && s.t - P.founded > DAY * 60)) { dissolve(sim, P); continue; }
    if (!P.members.includes(P.chair)) P.chair = P.members.slice().sort((a, b) => sim.score(b) - sim.score(a))[0];
    if (P.doctrines.market) for (const a of P.members) for (const b of P.members) if (a !== b) sim.addOpinion(a, b, 0.05);
    if (P.doctrines.market) for (const m of P.members) earn(sim, m, 'merchant', 0.03);
    if (P.doctrines.faith) for (const m of P.members) { if (s.nations[m].faith !== P.faith) { leavePact(sim, P, m, 'expelled'); } else earn(sim, m, 'zealot', 0.03); }
    if (P.doctrines.council && P.members.length >= 3 && s.t >= P.nextSession && !P.session) openSession(sim, P);
    if (P.session && s.t > P.session.deadline) closeSession(sim, P);
  }
  aiPacts(sim);
}

// AI peoples found pacts, recruit, and court the player
function aiPacts(sim) {
  if (sim.s.ww2) return; // the wartime coalitions grow by events and diplomacy, not by AI leagues
  const s = sim.s, live = Object.values(s.nations).filter(n => n.alive && n.ai);
  if (s.t % (DAY * 5)) return;
  for (const N of live) {
    const c = N.code, t = N.traits;
    if (Math.random() > 0.15) continue;
    const mine = pactsOf(sim, c);
    const led = mine.find(P => P.chair === c);
    // found a pact when well regarded by several neighbours
    if (!led && mine.length < 2 && N.age >= 1 && s.pacts.length < 6 + Object.keys(s.nations).length / 15) {
      const friends = (N.known || []).filter(o => s.nations[o]?.alive && !sim.atWar(c, o) && (['alliance', 'nap'].includes(sim.rel(c, o)) || (sim.opinion(o, c) > 12 && sim.opinion(c, o) > 8)));
      if (friends.length >= 2 && Math.random() < 0.4) {
        const preset = s.faiths?.[N.faith]?.kind !== 'folk' && ((N.rep?.zealot || 0) > 25 || N.gov.type === 'theocracy') ? 'covenant'
          : t.science > 0.7 ? 'scholars' : (N.rep?.merchant || 0) > 30 ? 'trade' : N.age >= 3 && t.caution > 0.6 ? 'assembly' : 'league';
        const r = foundPact(sim, c, { preset });
        if (r.ok) for (const f of friends.slice(0, 4)) invite(sim, r.pact, c, f);
      }
      continue;
    }
    // recruit: neighbours who like us; occasionally the player
    if (led && led.members.length < 10) {
      const cands = (N.known || []).filter(o => o !== c && canJoin(sim, led, o).ok && sim.opinion(o, c) > 5);
      const o = pick(cands);
      if (o && (o !== s.player || Math.random() < 0.35)) invite(sim, led, c, o);
    }
  }
  // AI peoples ask to join pacts the player leads
  for (const P of s.pacts) {
    if (P.chair !== s.player || Math.random() > 0.2) continue;
    const cand = live.filter(n => canJoin(sim, P, n.code).ok && sim.knows(n.code, s.player) && joinAppeal(sim, n.code, P).ok);
    const n = pick(cand);
    if (n && !s.messages.some(m => m.status === 'pending' && m.proposal?.type === 'pactApply' && m.from === n.code)) sim.message(n.code, s.player, `We ask to join the ${P.name}.`, { type: 'pactApply', pact: P.id });
  }
}

// ------------------------------------------------------------------ parliamentary sessions
// the questions a session can put to the vote, most pressing first
export function motions(sim, P) {
  const s = sim.s, out = [], mem = new Set(P.members);
  const known = new Set(P.members.flatMap(m => s.nations[m].known || []));
  // aggressors at war with a member, or the infamous
  const foes = new Map();
  for (const m of P.members) for (const e of sim.warsOf(m)) if (!mem.has(e)) foes.set(e, (foes.get(e) || 0) + 2);
  for (const c of known) { const X = s.nations[c]; if (X?.alive && !mem.has(c) && (X.infamy || 0) >= 10) foes.set(c, (foes.get(c) || 0) + X.infamy / 10); }
  const ranked = [...foes.entries()].sort((a, b) => b[1] - a[1]).map(x => x[0]).slice(0, 2);
  for (const x of ranked) {
    out.push({ kind: 'condemn', target: x, text: `Condemn the aggression of the ${sim.nm(x)}`, fx: `Every member thinks less of them, and their infamy grows.` });
    if (P.doctrines.sanctions && !P.members.every(m => s.sanctions.some(z => z.by === m && z.on === x))) out.push({ kind: 'sanction', target: x, text: `Impose a collective embargo on the ${sim.nm(x)}`, fx: 'Every member cuts its trade with them.' });
    if (!P.un && P.members.some(m => sim.atWar(m, x))) out.push({ kind: 'intervene', target: x, text: `Collective intervention against the ${sim.nm(x)}`, fx: 'Every member goes to war with them. Needs two thirds of the votes cast.', super: true });
  }
  // members at war with outsiders: a call for peace
  for (const m of P.members) { const e = sim.warsOf(m).find(e => !mem.has(e)); if (e) { out.push({ kind: 'peace', target: e, a: m, text: `Call for peace between the ${sim.nm(m)} and the ${sim.nm(e)}`, fx: 'The chair mediates, with the weight of the pact behind it.' }); break; } }
  // a member in famine or plague
  const needy = P.members.find(m => (s.nations[m].famine || 0) > 0.1 || (s.nations[m].exhaustion > 0.45 && sim.warsOf(m).length));
  if (needy) out.push({ kind: 'relief', target: needy, text: `Send relief to the ${sim.nm(needy)}, ${(s.nations[needy].famine || 0) > 0.1 ? 'stricken by famine' : 'ravaged by war'}`, fx: 'Every other member sends wealth and food; givers are remembered as peacemakers.' });
  // membership
  const bad = P.members.find(m => (s.nations[m].rep?.oathbreaker || 0) >= 35 || P.members.some(o => sim.atWar(m, o)));
  if (bad) out.push({ kind: 'expel', target: bad, text: `Expel the ${sim.nm(bad)} from the ${P.name}`, fx: 'They lose all the benefits of membership. Needs two thirds of the votes cast.', super: true });
  const appl = [...known].find(c => !mem.has(c) && canJoin(sim, P, c).ok && sim.opinion(c, P.chair) > 20 && Math.random() < 0.5);
  if (appl) out.push({ kind: 'admit', target: appl, text: `Admit the ${sim.nm(appl)} to the ${P.name}`, fx: 'They become a member with full rights.' });
  // doctrine business
  if (P.doctrines.market && P.bonus.trade < 0.2) out.push({ kind: 'tariffs', text: 'Abolish tariffs between members', fx: 'Members earn more from trade.' });
  if (P.doctrines.research && P.bonus.research < 0.2) out.push({ kind: 'academy', text: 'Found a common academy', fx: 'Each member pays wealth; research rises for all.' });
  if (P.doctrines.faith) { const F = s.faiths?.[P.faith]; const h = F?.holy != null ? s.regions[F.holy]?.owner : null; if (h && !mem.has(h) && s.nations[h]?.faith !== P.faith) out.push({ kind: 'crusade', target: h, text: `Proclaim a holy war on the ${sim.nm(h)}, who hold the holy city`, fx: 'Every member goes to war; the faithful grow zealous. Needs two thirds of the votes cast.', super: true }); }
  if (P.members.some(m => s.nations[m].age >= 8) && P.members.some(m => s.nations[m].warheads)) out.push({ kind: 'nukes', text: 'Treaty to reduce nuclear arsenals', fx: 'Members with warheads destroy half of them.' });
  if (!out.length) out.push({ kind: 'concord', text: 'Reaffirm the friendship of the members', fx: 'Goodwill between members grows.' });
  // the United Nations condemns, sanctions, mediates and relieves; it does not go to war or police its membership
  if (P.un) return out.filter(m => ['condemn', 'sanction', 'peace', 'relief', 'nukes', 'concord'].includes(m.kind));
  if (P.faction) return out.filter(m => !['peace', 'nukes', 'expel'].includes(m.kind)); // a wartime coalition does not negotiate with the enemy
  return out;
}

// how an AI member votes: 'yes' | 'no' | 'abstain'
export function aiVote(sim, m, P, mo) {
  const s = sim.s, M = s.nations[m], t = M.traits, x = mo.target;
  let sc = 0;
  if (x && (mo.kind === 'condemn' || mo.kind === 'sanction' || mo.kind === 'intervene' || mo.kind === 'crusade')) {
    if (x === m) return 'no';
    sc = -sim.opinion(m, x) / 30 + (sim.atWar(m, x) ? 3 : 0) + (s.nations[x].infamy || 0) / 15;
    if (sim.rel(m, x) === 'alliance' || s.nations[x].overlord === m || M.overlord === x) sc -= 5;
    if (mo.kind === 'sanction' && s.trades.some(tr => (tr.from === m && tr.to === x) || (tr.from === x && tr.to === m))) sc -= 1;
    if (mo.kind === 'intervene' || mo.kind === 'crusade') sc += t.aggression - t.caution * 1.2 - (sim.power(x) > sim.power(m) * 2 ? 1.5 : 0) - M.exhaustion * 3 - (s.modern ? 1.5 : 0) - (s.nations[x].warheads ? 4 : 0); // nobody wants war with a nuclear power
    if (mo.kind === 'crusade') sc += (M.rep?.zealot || 0) / 30;
  } else if (mo.kind === 'peace') {
    if (m === mo.a || m === x) sc = s.nations[m].exhaustion * 4 - 1 + t.caution - t.aggression;
    else sc = 0.6 + t.caution - t.aggression * 0.5 + (M.rep?.peacemaker || 0) / 40;
  } else if (mo.kind === 'relief') sc = m === x ? 3 : 0.4 + sim.opinion(m, x) / 30 - (M.wealth < 20 * ageScale(M.age) ? 1.5 : 0);
  else if (mo.kind === 'admit') sc = sim.opinion(m, x) / 20 - (sim.atWar(m, x) ? 5 : 0) + (s.nations[x].faith === M.faith ? 0.4 : 0) - (s.nations[x].rep?.oathbreaker || 0) / 25;
  else if (mo.kind === 'expel') sc = x === m ? -5 : -sim.opinion(m, x) / 20 + (s.nations[x].rep?.oathbreaker || 0) / 25 + (sim.atWar(m, x) ? 3 : 0) - 0.5;
  else if (mo.kind === 'tariffs') sc = 0.5 + (M.rep?.merchant || 0) / 40 - t.aggression * 0.3;
  else if (mo.kind === 'academy') sc = t.science * 1.5 - 0.3 - (M.wealth < 10 * ageScale(M.age) ? 1 : 0);
  else if (mo.kind === 'nukes') sc = M.warheads ? -1 - t.aggression : 1 + t.caution;
  else sc = 1;
  sc += sim.opinion(m, P.chair) / 120; // loyalty to the chair who tabled it
  return sc > 0.5 ? 'yes' : sc < -0.5 ? 'no' : 'abstain';
}

export function openSession(sim, P, motion = null) {
  const s = sim.s;
  const list = motions(sim, P);
  P.session = { opened: s.t, deadline: s.t + DAY * 3, options: list.slice(0, 3), motion: motion || null, votes: {} };
  P.nextSession = s.t + DAY * (80 + Math.random() * 30);
  if (P.chair !== s.player) P.session.motion = P.session.motion || P.session.options[0];
  for (const m of P.members) if (m !== s.player && P.session.motion) P.session.votes[m] = aiVote(sim, m, P, P.session.motion);
  if (P.members.includes(s.player)) for (const f of sim.listeners) f({ kind: 'pactSession', pact: P.id });
  else closeSession(sim, P);
}
// the chair (the player) chooses what to table
export function tableMotion(sim, P, i) {
  if (!P.session) return;
  P.session.motion = P.session.options[i] || P.session.options[0];
  for (const m of P.members) if (m !== sim.s.player) P.session.votes[m] = aiVote(sim, m, P, P.session.motion);
}
export function castVote(sim, P, c, v) { if (P.session) P.session.votes[c] = v; }

export function tally(P) {
  const v = Object.values(P.session?.votes || {});
  const yes = v.filter(x => x === 'yes').length, no = v.filter(x => x === 'no').length, abst = v.filter(x => x === 'abstain').length;
  const sup = !!P.session?.motion?.super;
  const vetoed = (P.veto || []).find(m => P.session?.votes?.[m] === 'no') || null; // a permanent member's veto
  const passed = !vetoed && yes > 0 && (sup ? yes >= (yes + no) * 2 / 3 : yes > no) && yes >= Math.ceil(P.members.length / 3);
  return { yes, no, abst, passed, sup, vetoed };
}

export function closeSession(sim, P) {
  const s = sim.s, S = P.session; if (!S) return null;
  P.session = null;
  const mo = S.motion; if (!mo) return null;
  for (const m of P.members) if (!S.votes[m]) S.votes[m] = m === s.player ? 'abstain' : aiVote(sim, m, P, mo);
  const r = tally({ ...P, session: S });
  const ayes = P.members.filter(m => S.votes[m] === 'yes'), nays = P.members.filter(m => S.votes[m] === 'no');
  const x = mo.target, Pl = s.player;
  let outcome = '';
  if (r.passed) {
    if (mo.kind === 'condemn') { for (const m of P.members) sim.addOpinion(m, x, -15); for (const m of ayes) sim.addOpinion(x, m, -10); addInfamy(sim, x, 3); outcome = `The ${P.name} condemns the ${sim.nm(x)}.`; }
    else if (mo.kind === 'sanction') { for (const m of P.members) if (!s.sanctions.some(z => z.by === m && z.on === x)) { s.sanctions.push({ by: m, on: x }); sim.addOpinion(x, m, -15); } s.trades = s.trades.filter(t => !(P.members.includes(t.from) && t.to === x) && !(P.members.includes(t.to) && t.from === x)); outcome = `Every member of the ${P.name} embargoes the ${sim.nm(x)}.`; }
    else if (mo.kind === 'intervene' || mo.kind === 'crusade') {
      const go = [];
      for (const m of P.members) {
        if (m === x || sim.atWar(m, x)) continue;
        if (m === Pl) { sim.message(P.chair === Pl ? (P.members.find(o => o !== Pl) || Pl) : P.chair, Pl, `The ${P.name} has voted for war on the ${sim.nm(x)}. Will you march with us?`, { type: 'callToArms', against: x, pact: P.id }); continue; }
        sim.setRel(m, x, 'war'); sim.addOpinion(x, m, -40); go.push(m);
        if (mo.kind === 'crusade') earn(sim, m, 'zealot', 10);
      }
      outcome = `The ${P.name} goes to war with the ${sim.nm(x)}${go.length ? `: ${go.map(c => 'the ' + sim.nm(c)).join(', ')} march` : ''}.`;
    }
    else if (mo.kind === 'peace') { const by = P.chair === mo.a || P.chair === x ? P.members.find(m => m !== mo.a && m !== x) || P.chair : P.chair; const res = sim.mediate(by, mo.a, x, 0.25); outcome = res.ok ? `At the urging of the ${P.name}, the ${sim.nm(mo.a)} and the ${sim.nm(x)} make peace.` : `The ${P.name} calls for peace, but the fighting goes on.`; }
    else if (mo.kind === 'relief') {
      const T = s.nations[x];
      for (const m of P.members) { if (m === x) continue; const M = s.nations[m], amt = Math.min(Math.max(0, M.wealth || 0) * 0.1, 6 * ageScale(M.age)); if (amt > 0.1) { M.wealth -= amt; T.wealth = (T.wealth || 0) + amt; T.food = (T.food || 0) + amt * 2; sim.addOpinion(x, m, 10); if (ayes.includes(m)) earn(sim, m, 'peacemaker', 4); } }
      outcome = `The members of the ${P.name} send relief to the ${sim.nm(x)}.`;
    }
    else if (mo.kind === 'admit') { joinPact(sim, P, x); outcome = `The ${sim.nm(x)} are admitted to the ${P.name}.`; }
    else if (mo.kind === 'expel') { leavePact(sim, P, x, 'expelled'); outcome = `The ${sim.nm(x)} are expelled from the ${P.name}.`; }
    else if (mo.kind === 'tariffs') { P.bonus.trade = Math.min(0.25, P.bonus.trade + 0.05); outcome = `The ${P.name} abolishes tariffs between its members.`; }
    else if (mo.kind === 'academy') { for (const m of P.members) { const M = s.nations[m]; M.wealth -= Math.min(Math.max(0, M.wealth || 0) * 0.08, 5 * ageScale(M.age)); earn(sim, m, 'scholar', 5); } P.bonus.research = Math.min(0.2, P.bonus.research + 0.04); outcome = `The ${P.name} founds a common academy.`; }
    else if (mo.kind === 'nukes') { for (const m of P.members) { const M = s.nations[m]; if (M.warheads) { M.warheads = Math.floor(M.warheads / 2); earn(sim, m, 'peacemaker', 6); } } outcome = `The members of the ${P.name} halve their nuclear arsenals.`; }
    else { for (const a of P.members) for (const b of P.members) if (a !== b) sim.addOpinion(a, b, 5); outcome = `The members of the ${P.name} reaffirm their friendship.`; }
    for (const m of ayes) earn(sim, m, 'peacemaker', mo.kind === 'intervene' || mo.kind === 'crusade' ? 0 : 1.5);
  } else outcome = r.vetoed ? `${sim.nm(r.vetoed)} vetoes the motion "${mo.text}" in the ${P.name}.` : `The motion "${mo.text}" fails in the ${P.name}.`;
  // members remember who voted with them and against them
  for (const a of P.members) for (const b of P.members) if (a !== b && S.votes[a] !== 'abstain' && S.votes[b] !== 'abstain') sim.addOpinion(a, b, S.votes[a] === S.votes[b] ? 2 : -2);
  const rec = { t: s.t, y: s.year, text: mo.text, kind: mo.kind, passed: r.passed, vetoed: r.vetoed, yes: r.yes, no: r.no, abst: r.abst, votes: { ...S.votes }, outcome };
  P.log.unshift(rec); if (P.log.length > 20) P.log.pop();
  sim.emit('treaty', `${P.name}: ${outcome} (${r.yes} for, ${r.no} against${r.abst ? `, ${r.abst} abstaining` : ''})`, [P.chair, ...(x ? [x] : [])], { major: P.members.length >= 4 && r.passed && ['intervene', 'crusade', 'sanction'].includes(mo.kind) });
  void nays;
  return rec;
}
