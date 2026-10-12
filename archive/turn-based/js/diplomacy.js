// Diplomacy layer: relations, trust, treaties, proposal evaluation, betrayal detection, AI chatter.
import { POWERS, POWER_IDS } from './data.js';
import { scCount, unitsOf } from './engine.js';

const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
const turnTag = s => `${s.season}${s.year}`;
const pick = arr => arr[(Math.random() * arr.length) | 0];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const nm = p => POWERS[p].name;

export const STATUS_LABEL = { war: 'AT WAR', neutral: 'NEUTRAL', nap: 'NON-AGGRESSION', alliance: 'ALLIANCE' };

export function initDiplomacy(player) {
  const rel = {}, trust = {}, traits = {};
  for (const a of POWER_IDS) {
    trust[a] = {};
    const t = POWERS[a].traits; const j = () => (Math.random() - 0.5) * 0.2;
    traits[a] = { aggression: clamp(t.aggression + j(), 0.1, 0.95), loyalty: clamp(t.loyalty + j(), 0.1, 0.95), caution: clamp(t.caution + j(), 0.1, 0.95) };
    for (const b of POWER_IDS) if (a !== b) {
      trust[a][b] = Math.round(5 + Math.random() * 15);
      rel[key(a, b)] ||= { status: 'neutral', since: null, target: null };
    }
  }
  return { player, rel, trust, traits, dmz: [], commitments: [], messages: [], intel: [], betrayals: [], msgId: 1, lastAttack: {} };
}

export const getRel = (d, a, b) => d.rel[key(a, b)];
export const status = (d, a, b) => (a === b ? 'self' : d.rel[key(a, b)].status);

function setStatus(d, a, b, s, state, target = null) {
  const r = d.rel[key(a, b)];
  r.status = s; r.since = turnTag(state); r.target = s === 'alliance' ? target : null;
  if (s === 'war' || s === 'neutral') d.dmz = d.dmz.filter(z => !(z.a === a && z.b === b) && !(z.a === b && z.b === a));
}

export function addIntel(d, state, kind, text, powers = []) {
  d.intel.push({ t: turnTag(state), year: state.year, season: state.season, kind, text, powers });
  if (d.intel.length > 400) d.intel.shift();
}

function addMsg(d, state, from, to, text, kind = 'info', proposal = null) {
  const m = { id: d.msgId++, from, to, t: turnTag(state), text, kind, proposal, status: proposal ? 'pending' : null, unread: to === d.player };
  d.messages.push(m);
  return m;
}

// ------------------------------------------------------------ strategic measures
function alive(state, p) { return scCount(state, p) > 0 || unitsOf(state, p).length > 0; }

function threat(map, state, from, to) {
  // units of `from` adjacent to centres or units of `to`
  const targets = new Set([...Object.keys(state.sc).filter(k => state.sc[k] === to), ...unitsOf(state, to).map(u => u.loc)]);
  let n = 0;
  for (const u of unitsOf(state, from)) if (map.neighbors(u.type, u.loc).some(x => targets.has(x))) n++;
  return n;
}
function opportunities(map, state, a, b) {
  // b's centres within 2 hops of a's units
  const D = map.dist('X'); const N = map.regions.length;
  const mine = unitsOf(state, a).map(u => map.byId[u.loc].i);
  let n = 0;
  for (const id of Object.keys(state.sc)) if (state.sc[id] === b) {
    const k = map.byId[id].i;
    if (mine.some(m => D[m * N + k] <= 2)) n++;
  }
  return n;
}
function frontier(map, state, a, b) { return opportunities(map, state, a, b) + opportunities(map, state, b, a); }
function leaderFactor(state, b) {
  const counts = POWER_IDS.map(p => scCount(state, p)).filter(c => c > 0);
  const avg = counts.reduce((x, y) => x + y, 0) / Math.max(1, counts.length);
  const c = scCount(state, b);
  return c > 12 && c > avg * 1.6 ? (c / avg - 1.4) : 0;
}
function commonEnemies(map, state, d, a, b) {
  const out = [];
  for (const c of POWER_IDS) {
    if (c === a || c === b || !alive(state, c)) continue;
    const ea = status(d, a, c) === 'war' || threat(map, state, c, a) >= 2;
    const eb = status(d, b, c) === 'war' || threat(map, state, c, b) >= 2;
    if (ea && eb) out.push(c);
  }
  return out.sort((x, y) => scCount(state, y) - scCount(state, x));
}

// ------------------------------------------------------------ utilities
function napUtility(map, state, d, a, b) {
  const t = d.traits[a];
  const f = {};
  f.threat = 1.1 * Math.min(3, threat(map, state, b, a));
  f.common = 0.8 * commonEnemies(map, state, d, a, b).length;
  f.trust = d.trust[a][b] / 35;
  f.caution = t.caution * 1.4;
  f.ambition = -t.aggression * 0.45 * Math.min(4, opportunities(map, state, a, b));
  f.leader = -leaderFactor(state, b) * 2.5;
  f.distance = frontier(map, state, a, b) === 0 ? 1.2 : 0;
  f.war = status(d, a, b) === 'war' ? -1 : 0;
  f.opening = state.year <= 2031 ? 0.8 : 0;
  return { u: Object.values(f).reduce((x, y) => x + y, 0), f };
}
function allianceUtility(map, state, d, a, b) {
  const t = d.traits[a];
  const f = {};
  const ce = commonEnemies(map, state, d, a, b);
  f.common = 1.6 * Math.min(2, ce.length);
  f.trust = d.trust[a][b] / 25;
  f.pact = status(d, a, b) === 'nap' ? 1 : status(d, a, b) === 'war' ? -2 : 0;
  f.threat = 0.4 * Math.min(3, threat(map, state, b, a));
  f.ambition = -t.aggression * 0.5 * opportunities(map, state, a, b);
  f.leader = -leaderFactor(state, b) * 3.5;
  f.size = scCount(state, b) > 1.7 * Math.max(1, scCount(state, a)) ? -1.2 : 0;
  f.loyal = t.loyalty * 0.8;
  return { u: Object.values(f).reduce((x, y) => x + y, 0), f, enemy: ce[0] || null };
}
function warUtility(map, state, d, a, b, c) {
  const al = allianceUtility(map, state, d, a, b);
  const f = { ...al.f };
  f.spoils = 0.6 * Math.min(4, opportunities(map, state, a, c));
  f.hostile = status(d, a, c) === 'war' ? 2 : status(d, a, c) === 'nap' || status(d, a, c) === 'alliance' ? -3 : 0;
  f.danger = 0.6 * Math.min(3, threat(map, state, c, a));
  f.ctrust = -d.trust[a][c] / 40;
  return { u: Object.values(f).reduce((x, y) => x + y, 0), f };
}
function peaceUtility(map, state, d, a, b) {
  const t = d.traits[a];
  const f = {};
  f.weaker = scCount(state, b) > scCount(state, a) ? 1.5 : 0;
  f.threat = 0.5 * Math.min(4, threat(map, state, b, a));
  f.caution = t.caution * 2;
  f.trust = d.trust[a][b] / 40;
  f.ambition = -t.aggression * 0.5 * opportunities(map, state, a, b);
  f.otherWars = 0.8 * POWER_IDS.filter(c => c !== b && c !== a && status(d, a, c) === 'war').length;
  return { u: Object.values(f).reduce((x, y) => x + y, 0), f };
}

// ------------------------------------------------------------ voice
const VOICE = {
  accept: {
    hawk: ['Agreed. Do not make us regret it.', 'Acceptable. Our generals will be informed.', 'Very well. The arrangement stands, for now.'],
    dove: ['We gladly accept. May this be the start of a lasting friendship.', 'Agreed. Our nations are stronger together.', 'Accepted, with pleasure.'],
  },
  decline: {
    hawk: ['Rejected. You offer nothing we cannot take.', 'No. Our interests lie elsewhere.', 'We decline. Choose your next words carefully.'],
    dove: ['We regret that we cannot agree at this time.', 'Our cabinet is not prepared to accept this.', 'Respectfully, we must decline.'],
  },
};
function voice(d, a, kind) {
  const hawk = d.traits[a].aggression > 0.6;
  return pick(VOICE[kind][hawk ? 'hawk' : 'dove']);
}
function reasonText(f, ctx = {}) {
  const sorted = Object.entries(f).sort((x, y) => Math.abs(y[1]) - Math.abs(x[1]));
  const [k, v] = sorted[0] || [];
  const R = {
    threat: v > 0 ? 'Your forces on our frontier make peace the prudent course.' : '',
    common: v > 0 ? `We share a common adversary${ctx.enemy ? ' in ' + nm(ctx.enemy) : ''}.` : '',
    trust: v > 0 ? 'You have proven a reliable partner.' : 'Frankly, we do not trust you.',
    caution: 'Stability serves our people.',
    opening: 'These are uncertain early days; we prefer friends to enemies.',
    ambition: 'Our strategic interests and yours collide.',
    leader: 'Your growing power alarms our analysts.',
    distance: 'Our nations have little reason to quarrel.',
    war: 'Blood has been spilled between us.',
    pact: v > 0 ? 'Our existing pact has held firm.' : 'We are at war.',
    size: 'You are too powerful to be a safe partner.',
    loyal: 'We honour our commitments.',
    spoils: 'The spoils are tempting.',
    hostile: v > 0 ? 'They are already our enemy.' : 'We have an agreement with them.',
    danger: 'They threaten us directly.',
    ctrust: 'We have no quarrel with them.',
    weaker: 'Continued war is costly.',
    otherWars: 'We are stretched on other fronts.',
  };
  return R[k] || '';
}

// ------------------------------------------------------------ player proposals -> AI
// proposal: {type:'nap'|'alliance'|'war'|'peace'|'support'|'dmz'|'intel'|'declare', target?, region?, unit?, from?, to?}
export function evaluateProposal(map, state, d, ai, from, p) {
  const st = status(d, ai, from);
  let r = { accept: false, reason: '' };
  if (p.type === 'nap') {
    if (st === 'nap' || st === 'alliance') return { accept: false, reason: 'We already have an agreement.' };
    const { u, f } = napUtility(map, state, d, ai, from);
    r = { accept: u >= 1.6, reason: reasonText(f) };
  } else if (p.type === 'alliance') {
    if (st === 'alliance') return { accept: false, reason: 'We are already allied.' };
    const { u, f, enemy } = allianceUtility(map, state, d, ai, from);
    r = { accept: u >= 3 && d.trust[ai][from] >= 0, reason: reasonText(f, { enemy }) };
  } else if (p.type === 'war') {
    if (!p.target || p.target === ai) return { accept: false, reason: 'An absurd request.' };
    const { u, f } = warUtility(map, state, d, ai, from, p.target);
    r = { accept: u >= 3.2 && st !== 'war', reason: reasonText(f) };
  } else if (p.type === 'peace') {
    if (st !== 'war') return { accept: false, reason: 'We are not at war.' };
    const { u, f } = peaceUtility(map, state, d, ai, from);
    r = { accept: u >= 2.4, reason: reasonText(f) };
  } else if (p.type === 'support') {
    const unit = state.units.find(x => x.loc === p.unit && x.power === ai);
    const occ = state.units.find(x => x.loc === p.to);
    if (!unit || !map.adjacent(unit.type, unit.loc, p.to)) return { accept: false, reason: 'That unit cannot reach the objective.' };
    if (st === 'war') return { accept: false, reason: 'You expect our help while we are at war?' };
    let u = st === 'alliance' ? 3 : st === 'nap' ? 1.5 + d.trust[ai][from] / 40 : d.trust[ai][from] / 25;
    const victim = occ && occ.power !== from ? occ.power : (state.sc[p.to] && state.sc[p.to] !== from ? state.sc[p.to] : null);
    if (victim === ai) return { accept: false, reason: 'You ask us to help attack ourselves?' };
    if (victim) {
      const vs = status(d, ai, victim);
      if (vs === 'nap' || vs === 'alliance') return { accept: false, reason: `We have an agreement with ${nm(victim)}.` };
      if (vs === 'war') u += 2; else u += d.trust[ai][victim] < 0 ? 0.5 : -0.5;
    }
    if (state.season === 'F' && state.sc[unit.loc] === ai && threat(map, state, victim || from, ai) > 0) u -= 1.5;
    r = { accept: u >= 2.5, reason: u >= 2.5 ? 'Our forces will move in concert with yours.' : 'We cannot spare that unit.' };
    if (r.accept) d.commitments.push({ by: ai, for: from, unit: unit.loc, from: p.from, to: p.to, t: turnTag(state) });
  } else if (p.type === 'dmz') {
    const reg = map.byId[p.region];
    if (state.units.some(x => x.loc === p.region && x.power === ai)) return { accept: false, reason: 'Our forces already hold that ground.' };
    let u = 1.8 + d.trust[ai][from] / 40 - (reg.sc ? 1.5 : 0) - (state.sc[p.region] === ai ? 2 : 0);
    if (st === 'war') u -= 2;
    r = { accept: u >= 1.5, reason: u >= 1.5 ? 'A buffer zone serves us both.' : 'That ground is too important to us.' };
    if (r.accept) d.dmz.push({ a: ai, b: from, region: p.region, since: turnTag(state) });
  } else if (p.type === 'intel') {
    const ok = st === 'alliance' || (st === 'nap' && d.trust[ai][from] >= 40);
    r = { accept: ok, reason: ok ? 'Our intelligence services will share what they know.' : 'Our intelligence is not for sale.' };
  }
  return r;
}

export function applyAcceptedTreaty(d, state, a, b, p) {
  if (p.type === 'nap') { setStatus(d, a, b, 'nap', state); addIntel(d, state, 'treaty', `${nm(a)} and ${nm(b)} sign a non-aggression pact.`, [a, b]); }
  if (p.type === 'alliance') { setStatus(d, a, b, 'alliance', state, p.target || null); addIntel(d, state, 'treaty', `${nm(a)} and ${nm(b)} form an alliance.`, [a, b]); d.trust[a][b] += 5; d.trust[b][a] += 5; }
  if (p.type === 'war') {
    setStatus(d, a, b, 'alliance', state, p.target);
    for (const x of [a, b]) if (status(d, x, p.target) !== 'war') { setStatus(d, x, p.target, 'war', state); d.trust[p.target][x] -= 30; }
    addIntel(d, state, 'war', `${nm(a)} and ${nm(b)} declare joint war on ${nm(p.target)}.`, [a, b, p.target]);
  }
  if (p.type === 'peace') {
    // a ceasefire is a truce: breaking it counts as betrayal
    setStatus(d, a, b, 'nap', state); addIntel(d, state, 'treaty', `${nm(a)} and ${nm(b)} agree to a ceasefire.`, [a, b]);
    d.trust[a][b] = Math.max(d.trust[a][b], -10); d.trust[b][a] = Math.max(d.trust[b][a], -10);
  }
  if (p.type === 'dmz') addIntel(d, state, 'treaty', `${nm(a)} and ${nm(b)} establish a demilitarized zone.`, [a, b]);
}

// Player sends a proposal. Returns the reply message.
export function playerPropose(map, state, d, ai, p) {
  const player = d.player;
  addMsg(d, state, player, ai, describeProposal(map, p, player), 'proposal-out', p);
  if (p.type === 'declare') {
    setStatus(d, player, ai, 'war', state);
    d.trust[ai][player] -= 40;
    addIntel(d, state, 'war', `${nm(player)} declares war on ${nm(ai)}.`, [player, ai]);
    return addMsg(d, state, ai, player, pick(['So be it. You will regret this.', 'Your aggression is noted. We will answer it.', 'Then let the guns speak.']), 'reply');
  }
  const r = evaluateProposal(map, state, d, ai, player, p);
  if (r.accept) applyAcceptedTreaty(d, state, ai, player, p);
  let text = (r.accept ? voice(d, ai, 'accept') : voice(d, ai, 'decline')) + (r.reason ? ' ' + r.reason : '');
  if (r.accept && p.type === 'intel') text += '\n' + intelReport(map, state, d, ai, p.target);
  const m = addMsg(d, state, ai, player, text, 'reply');
  m.accepted = r.accept;
  if (!r.accept) d.trust[ai][player] -= 1; // mild annoyance at rejected asks
  return m;
}

export function describeProposal(map, p, from) {
  switch (p.type) {
    case 'nap': return 'Proposal: a mutual non-aggression pact.';
    case 'alliance': return 'Proposal: a formal military alliance.';
    case 'war': return `Proposal: joint war against ${nm(p.target)}.`;
    case 'peace': return 'Proposal: ceasefire and an end to hostilities.';
    case 'support': return `Request: your unit in ${map.byId[p.unit].name} supports our move ${map.byId[p.from].name} -> ${map.byId[p.to].name}.`;
    case 'dmz': return `Proposal: demilitarize ${map.byId[p.region].name}.`;
    case 'intel': return `Request: intelligence on ${nm(p.target)}'s intentions.`;
    case 'declare': return 'Formal declaration of war.';
  }
  return '';
}

// Uses the AI's own forecast of another power's orders (set on d.forecast by the game controller).
function intelReport(map, state, d, ai, target) {
  const fc = d.forecast?.[target];
  if (!fc) return 'Our sources are silent.';
  const lines = [];
  for (const u of unitsOf(state, target)) {
    const o = fc[u.loc]; if (!o || o.type !== 'M') continue;
    lines.push(`${u.type} ${map.byId[u.loc].name} -> ${map.byId[o.to].name}`);
  }
  if (!lines.length) return `INTEL: ${nm(target)} appears to be digging in. No offensive movement expected.`;
  return `INTEL on ${nm(target)} (confidence moderate):\n- ` + lines.slice(0, 8).join('\n- ');
}

// ------------------------------------------------------------ AI contexts
export function hostility(map, state, d, a, b) {
  const st = status(d, a, b);
  let h = st === 'war' ? 1.35 : st === 'nap' ? 0.12 : st === 'alliance' ? 0 : 1;
  if (st === 'neutral') h *= clamp(1.1 - d.trust[a][b] / 200, 0.6, 1.6);
  for (const c of POWER_IDS) {
    if (c === a || c === b) continue;
    const r = getRel(d, a, c);
    if (r.status === 'alliance' && r.target === b) h = Math.max(h, 1.5);
  }
  if (st !== 'alliance' && st !== 'nap') h += leaderFactor(state, b) * 0.3;
  return h;
}

// Build the order-planning context for power a. Decides betrayals for this turn.
export function buildCtx(map, state, d, a, isPlayer = false) {
  const ctx = { power: a, hostility: {}, banned: [], locked: {}, traits: d.traits[a], allies: [], betray: [] };
  const banned = new Set();
  for (const b of POWER_IDS) {
    if (b === a) continue;
    let h = hostility(map, state, d, a, b);
    const st = status(d, a, b);
    if (st === 'alliance') ctx.allies.push(b);
    if ((st === 'nap' || st === 'alliance') && !isPlayer) {
      // temptation to betray
      const opp = opportunities(map, state, a, b);
      const t = d.traits[a];
      let p = opp > 0 ? (1 - t.loyalty) * 0.12 * Math.min(4, opp) * (1 - d.trust[a][b] / 150) : 0;
      p *= 1 + leaderFactor(state, b);
      if (state.year === 2030) p *= 0.3;
      if (Math.random() < clamp(p, 0, 0.5)) { ctx.betray.push(b); h = 1.4; continue; }
    }
    ctx.hostility[b] = h;
    if (st === 'nap' || st === 'alliance') {
      for (const u of unitsOf(state, b)) banned.add(u.loc);
      for (const [id, o] of Object.entries(state.sc)) if (o === b) banned.add(id);
    }
  }
  for (const b of ctx.betray) ctx.hostility[b] = 1.4;
  for (const z of d.dmz) if ((z.a === a || z.b === a) && !ctx.betray.includes(z.a === a ? z.b : z.a)) banned.add(z.region);
  ctx.banned = [...banned];
  for (const c of d.commitments) {
    if (c.by !== a || c.t !== turnTag(state) || ctx.betray.includes(c.for)) continue;
    if (state.units.some(u => u.loc === c.unit && u.power === a)) ctx.locked[c.unit] = { type: 'S', from: c.from, to: c.to };
  }
  return ctx;
}

// ------------------------------------------------------------ turn hooks
// After a movement phase: detect attacks / betrayals, broken promises, update trust.
export function afterMovement(map, state, d, results) {
  const prev = new Map(results.prevUnits.map(u => [u.loc, u]));
  const prevSc = results.prevSc || state.sc;
  const attacks = new Map(); // "a>b" -> [regions]
  const note = (a, b, reg) => { if (!b || a === b) return; const k = a + '>' + b; if (!attacks.has(k)) attacks.set(k, []); attacks.get(k).push(reg); };
  const ordAt = new Map(results.orders.map(o => [o.loc, o]));
  for (const o of results.orders) {
    let dest = null;
    if (o.type === 'M') dest = o.to;
    if (o.type === 'S' && o.from !== o.to && ordAt.get(o.from)?.type === 'M' && ordAt.get(o.from)?.to === o.to) dest = o.to;
    if (!dest) continue;
    const occ = prev.get(dest);
    if (occ && occ.power !== o.power) note(o.power, occ.power, dest);
    else if (prevSc[dest] && prevSc[dest] !== o.power) note(o.power, prevSc[dest], dest);
    for (const z of d.dmz) if (z.region === dest && o.type === 'M' && (z.a === o.power || z.b === o.power)) {
      const other = z.a === o.power ? z.b : z.a;
      d.trust[other][o.power] -= 35;
      addIntel(d, state, 'betrayal', `${nm(o.power)} violated the demilitarized zone in ${map.byId[dest].name}.`, [o.power, other]);
      z.broken = true;
    }
  }
  d.dmz = d.dmz.filter(z => !z.broken);
  const T = `${results.season}${results.year}`;
  const attacked = new Set();
  for (const [k, regs] of attacks) {
    const [a, b] = k.split('>');
    attacked.add(key(a, b));
    const st = status(d, a, b);
    const where = map.byId[regs[0]].name;
    if (st === 'nap' || st === 'alliance') {
      setStatus(d, a, b, 'war', state);
      d.trust[b][a] -= 60;
      for (const c of POWER_IDS) if (c !== a && c !== b) d.trust[c][a] -= 8;
      d.betrayals.push({ t: T, by: a, victim: b, where: regs[0] });
      addIntel(d, state, 'betrayal', `BETRAYAL: ${nm(a)} broke its ${st === 'nap' ? 'non-aggression pact' : 'alliance'} with ${nm(b)} and struck ${where}.`, [a, b]);
      if (b !== d.player && a === d.player) addMsg(d, state, b, a, pick(['Treachery! You will pay for this betrayal.', 'We trusted you. That was our mistake, and it will be your last.', 'The pact is void. Every one of our divisions now marches against you.']), 'warning');
      if (a !== d.player && b === d.player) addMsg(d, state, a, b, pick(['Circumstances have changed. Our pact is dissolved.', 'Nothing personal. Strategic necessity.', 'You should have seen this coming.']), 'warning');
    } else if (st === 'neutral') {
      d.trust[b][a] -= 15;
      if (b !== d.player && (d.trust[b][a] < -15 || d.traits[b].aggression > 0.7)) {
        setStatus(d, a, b, 'war', state);
        addIntel(d, state, 'war', `${nm(b)} declares war on ${nm(a)} after attacks on ${where}.`, [a, b]);
        if (a === d.player) addMsg(d, state, b, a, pick(['Your attack on ' + where + ' is an act of war. We respond in kind.', 'You chose war. We accept.']), 'warning');
      } else if (a === d.player && b !== d.player) addMsg(d, state, b, a, `Your forces moved against ${where}. Explain yourselves, or face consequences.`, 'warning');
    } else d.trust[b][a] -= 3;
  }
  // promises
  for (const c of d.commitments) {
    if (c.t !== T) continue;
    const o = results.orders.find(x => x.loc === c.unit && x.power === c.by);
    const kept = o && o.type === 'S' && o.from === c.from && o.to === c.to;
    if (kept) { d.trust[c.for][c.by] += 6; if (c.by !== d.player) addIntel(d, state, 'info', `${nm(c.by)} delivered promised support near ${map.byId[c.to].name}.`, [c.by, c.for]); }
    else {
      d.trust[c.for][c.by] -= 25;
      addIntel(d, state, 'betrayal', `${nm(c.by)} failed to deliver promised support to ${nm(c.for)}.`, [c.by, c.for]);
      if (c.for === d.player) addMsg(d, state, c.by, c.for, pick(['Our forces were... unavoidably delayed.', 'Plans changed. Do not take it personally.']), 'info');
    }
  }
  d.commitments = d.commitments.filter(c => c.t !== T);
  // kept pacts build trust, open wars erode it
  for (const a of POWER_IDS) for (const b of POWER_IDS) {
    if (a === b) continue;
    const st = status(d, a, b);
    if ((st === 'nap' || st === 'alliance') && !attacked.has(key(a, b))) d.trust[a][b] = Math.min(100, d.trust[a][b] + (st === 'alliance' ? 3 : 2));
    if (st === 'neutral') d.trust[a][b] += d.trust[a][b] < 0 ? 1 : 0;
    d.trust[a][b] = clamp(Math.round(d.trust[a][b]), -100, 100);
  }
}

// AI <-> AI diplomacy and AI -> player outreach at the start of an orders phase.
export function aiDiplomacy(map, state, d) {
  const live = POWER_IDS.filter(p => alive(state, p));
  const ais = live.filter(p => p !== d.player);
  const spring = state.season === 'S';
  for (let i = 0; i < ais.length; i++) for (let j = i + 1; j < ais.length; j++) {
    const a = ais[i], b = ais[j];
    const st = status(d, a, b);
    const front = frontier(map, state, a, b);
    if (st === 'neutral' && Math.random() < (spring ? 0.25 : 0.1)) {
      if (front > 0 && napUtility(map, state, d, a, b).u >= 2.0 && napUtility(map, state, d, b, a).u >= 2.0) applyAcceptedTreaty(d, state, a, b, { type: 'nap' });
      else if (d.trust[a][b] < -40 || (d.traits[a].aggression > 0.7 && opportunities(map, state, a, b) >= 3 && Math.random() < 0.12)) {
        setStatus(d, a, b, 'war', state); d.trust[b][a] -= 20;
        addIntel(d, state, 'war', `${nm(a)} declares war on ${nm(b)}.`, [a, b]);
      }
    } else if (st === 'nap' && spring && Math.random() < 0.3) {
      const ua = allianceUtility(map, state, d, a, b), ub = allianceUtility(map, state, d, b, a);
      if (ua.u >= 2.8 && ub.u >= 2.8) applyAcceptedTreaty(d, state, a, b, { type: 'alliance', target: ua.enemy });
    } else if (st === 'war' && Math.random() < 0.3) {
      if (peaceUtility(map, state, d, a, b).u >= 2.2 && peaceUtility(map, state, d, b, a).u >= 2.2) applyAcceptedTreaty(d, state, a, b, { type: 'peace' });
    } else if (st === 'nap' && !spring && d.traits[a].aggression > 0.6 && opportunities(map, state, a, b) >= 2 && napUtility(map, state, d, a, b).u < 0.5 && Math.random() < 0.25) {
      setStatus(d, a, b, 'neutral', state);
      addIntel(d, state, 'treaty', `${nm(a)} withdraws from its non-aggression pact with ${nm(b)}.`, [a, b]);
    } else if (st === 'alliance' && d.trust[a][b] < -10) {
      setStatus(d, a, b, 'neutral', state);
      addIntel(d, state, 'treaty', `The alliance between ${nm(a)} and ${nm(b)} has collapsed.`, [a, b]);
    }
  }
  // outreach to the player
  if (!alive(state, d.player)) return;
  let sent = 0;
  const P = d.player;
  for (const a of ais.sort(() => Math.random() - 0.5)) {
    if (sent >= 3) break;
    const st = status(d, a, P);
    if (st === 'neutral' && Math.random() < 0.4) {
      const u = napUtility(map, state, d, a, P).u;
      if (u >= 1.8 && frontier(map, state, a, P) > 0) { addMsg(d, state, a, P, pick(['We see no reason for our nations to come to blows. We propose a non-aggression pact.', 'Peace on our shared frontier would free both our hands. Will you sign a pact?', 'Let us agree not to strike one another. Our generals have other concerns.']), 'proposal', { type: 'nap' }); sent++; continue; }
      if (threat(map, state, P, a) >= 2 && Math.random() < 0.5) { addMsg(d, state, a, P, pick(['We are watching your build-up on our border. Any move against us will be met with force.', 'Your forces are uncomfortably close. We advise restraint.']), 'warning'); sent++; continue; }
    }
    if (st === 'nap' && Math.random() < 0.2) {
      const al = allianceUtility(map, state, d, a, P);
      if (al.u >= 3.5 && al.enemy) { addMsg(d, state, a, P, `${nm(al.enemy)} threatens us both. We propose an alliance to contain them.`, 'proposal', { type: 'war', target: al.enemy }); sent++; continue; }
    }
    if (st === 'war' && Math.random() < 0.35 && peaceUtility(map, state, d, a, P).u >= 2.2) {
      addMsg(d, state, a, P, pick(['This war profits neither of us. We offer a ceasefire.', 'Enough. We propose an end to hostilities.']), 'proposal', { type: 'peace' }); sent++;
    }
  }
}

// Player answers an AI proposal.
export function answerProposal(map, state, d, msgId, accept) {
  const m = d.messages.find(x => x.id === msgId);
  if (!m || m.status !== 'pending') return;
  m.status = accept ? 'accepted' : 'declined';
  if (accept) {
    // the AI re-checks quickly that it still wants this
    applyAcceptedTreaty(d, state, m.from, d.player, m.proposal);
    d.trust[m.from][d.player] += 4;
    addMsg(d, state, m.from, d.player, pick(['Excellent. We look forward to working together.', 'Good. The agreement is in force.']), 'reply');
  } else {
    d.trust[m.from][d.player] -= 4;
    addMsg(d, state, m.from, d.player, pick(['Noted. We will remember this.', 'A pity. Our offer will not be repeated soon.']), 'reply');
  }
}

export function expirePending(d) {
  for (const m of d.messages) if (m.status === 'pending') m.status = 'expired';
}

export function defcon(d, state) {
  let wars = 0;
  for (const [k, r] of Object.entries(d.rel)) { const [a, b] = k.split('|'); if (r.status === 'war' && alive(state, a) && alive(state, b)) wars++; }
  const recent = d.betrayals.filter(b => b.t === `${state.season === 'S' ? 'F' : 'S'}${state.season === 'S' ? state.year - 1 : state.year}`).length;
  return clamp(5 - Math.floor(wars / 3) - recent, 1, 5);
}

export function reputation(d, p) {
  const others = POWER_IDS.filter(x => x !== p);
  return Math.round(others.reduce((s, x) => s + d.trust[x][p], 0) / others.length);
}
