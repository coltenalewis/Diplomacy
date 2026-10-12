// Pressure on rulers: how many lands their administration can hold, how fast they are expanding, how far their
// provinces lie from the capital, the infamy their conquests earn, and the coalitions that infamy provokes.
import { GOV_TYPES } from './gov.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const kmLL = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };

// ------------------------------------------------------------------ administrative capacity
// lands a realm can govern without strain; institutions, roads and officials extend it
export const ADMIN_TECH = { code_of_laws: 1, census: 2, roads: 2, satrapies: 3, imperialism: 2, bureaucracy: 4, feudalism: 2, cartography: 1, colonial_administration: 4,
  railroad: 4, telegraph: 3, nationalism: 2, public_education: 2, mass_media: 3, mass_transit: 2, computers: 2, internet: 4 };
const ADMIN_GOV = { tribe: -1, chiefdom: 0, despotism: 1, theocracy: 1, monarchy: 2, republic: 1, empire: 5, feudal: 4, merchant: 1, absolute: 3, constmon: 3, parliamentary: 3, democracy: 3, oneparty: 4, junta: 1, technocracy: 4 };
export function adminCap(sim, N) {
  let c = 6 + N.age * 3;
  for (const [t, v] of Object.entries(ADMIN_TECH)) if (N.techs[t]) c += v;
  c += ADMIN_GOV[N.gov?.type] ?? 1;
  c += Math.min(14, Object.keys(N.governors || {}).length * 0.7);
  if (N.formed) c += 4;
  if (N.code !== sim.s.player) c *= 1 + Math.max(0, sim.s.difficulty || 0) * 0.3; // rival rulers on higher difficulty run tighter states
  return Math.round(c);
}
export function adminOver(sim, N) { return Math.max(0, (sim.owned.get(N.code)?.size || 0) - adminCap(sim, N)); }
// how far a capital's writ runs before distance itself breeds disorder
export function reachKm(N) {
  let k = 700;
  for (const [t, v] of [['roads', 400], ['compass', 200], ['navigation', 400], ['railroad', 1200], ['telegraph', 900], ['flight', 1000], ['radio', 700], ['internet', 2500]]) if (N.techs[t]) k += v;
  return k;
}
export const heatLabel = h => h < 3 ? 'Calm' : h < 7 ? 'Brisk' : h < 13 ? 'Rapid' : 'Reckless';
export const infamyLabel = v => v < 5 ? 'Respected' : v < 12 ? 'Distrusted' : v < 22 ? 'Feared' : 'Despised';
export const infamyLimit = (sim, c) => Math.max(6, 14 - (c === sim.s.player ? Math.max(0, sim.s.difficulty || 0) * 6 : 0));

// ------------------------------------------------------------------ unrest causes from expansion (used by society.js)
export function expansionCauses(sim, r, N, out) {
  const s = sim.s;
  const over = N.adminOver ?? 0;
  if (over > 0) out.push([`Overextended (${over} lands beyond what the state can govern)`, Math.min(0.25, over * 0.012) * (r.i === N.capital ? 0.4 : 1)]);
  const h = N.expHeat || 0;
  if (h > 3) out.push([`Rapid expansion (${heatLabel(h).toLowerCase()})`, Math.min(0.3, (h - 3) * 0.03)]);
  if (r.acq != null) {
    const d = (s.t - r.acq) / 24, span = r.acqWar ? 60 : 30;
    if (d < span) out.push([r.acqWar ? 'Recently conquered' : 'Newly settled', (r.acqWar ? 0.3 : 0.1) * (1 - d / span)]);
  }
  if (r.i !== N.capital) {
    const km = kmLL(sim.anchor(N.capital), sim.anchor(r.i)), reach = reachKm(N);
    if (km > reach) out.push(['Far from the capital', Math.min(0.2, (km - reach) / 5000)]);
  }
}

// ------------------------------------------------------------------ hooks
// a land changes hands: expansion heat for the gainer; conquest and coercion also earn infamy
export function onAcquire(sim, r, c, how) {
  const s = sim.s, N = s.nations[c]; if (!N) return;
  r.acq = s.t; r.acqWar = how === 'conquest';
  N.expHeat = (N.expHeat || 0) + ({ settle: 1, subdue: 1.2, conquest: 1.5, cede: 1, return: 0.4 }[how] ?? 1);
  if (how === 'conquest' || how === 'cede') {
    const victim = r.core && r.core !== c && s.nations[r.core]?.alive;
    addInfamy(sim, c, how === 'conquest' ? (victim ? 2.5 : 1.5) : 2);
    const at = sim.anchor(r.i);
    for (const X of Object.values(s.nations)) {
      if (!X.alive || X.code === c || !X.known?.includes(c) || sim.realmOf(X.code) === sim.realmOf(c)) continue;
      const km = kmLL(sim.anchor(X.capital), at);
      if (km < 2600) sim.addOpinion(X.code, c, -(1.2 + (km < 1200 ? 1.8 : 0)));
    }
  }
  if (how === 'subdue') addInfamy(sim, c, 0.3);
}
export function addInfamy(sim, c, v) { const N = sim.s.nations[c]; if (N) N.infamy = Math.min(60, (N.infamy || 0) + v); }

// ------------------------------------------------------------------ daily: cooling, infamy and coalitions
export function pressureDaily(sim) {
  const s = sim.s; s.coalitions ||= [];
  for (const N of Object.values(s.nations)) {
    if (!N.alive) continue;
    N.adminCap = adminCap(sim, N);
    N.adminOver = Math.max(0, (sim.owned.get(N.code)?.size || 0) - N.adminCap);
    N.expHeat = (N.expHeat || 0) * 0.985;
    N.infamy = Math.max(0, (N.infamy || 0) - Math.max(0.02, (N.infamy || 0) * 0.008));
    // corruption: an overstretched state leaks its revenue
    N.pfx = N.adminOver > 0 ? { wealth: -Math.min(0.25, N.adminOver * 0.008), research: -Math.min(0.15, N.adminOver * 0.005) } : null;
  }
  if (Math.floor(s.t / 24) % 7 === 0) coalitions(sim);
}
function coalitions(sim) {
  const s = sim.s;
  // dissolve leagues whose purpose is gone
  s.coalitions = s.coalitions.filter(C => {
    const X = s.nations[C.target];
    C.members = C.members.filter(m => s.nations[m]?.alive && sim.realmOf(m) !== sim.realmOf(C.target) && sim.rel(m, C.target) !== 'alliance');
    const atWar = C.members.some(m => sim.atWar(m, C.target));
    if (!X?.alive || C.members.length < 2 || (!atWar && (X.infamy || 0) < infamyLimit(sim, C.target) * 0.45)) {
      if (X?.alive && C.members.length) sim.emit('treaty', `The coalition against the ${sim.nm(C.target)} disbands.`, [C.target, ...C.members], { loc: X.capital, major: C.target === s.player });
      return false;
    }
    return true;
  });
  for (const X of Object.values(s.nations)) {
    if (!X.alive || X.overlord || (X.infamy || 0) < infamyLimit(sim, X.code) || (sim.owned.get(X.code)?.size || 0) < 6) continue;
    const cap = sim.anchor(X.capital);
    const cands = Object.values(s.nations).filter(Y => Y.alive && Y.code !== X.code && !Y.overlord && Y.known?.includes(X.code) && sim.realmOf(Y.code) !== sim.realmOf(X.code)
      && sim.rel(Y.code, X.code) !== 'alliance' && sim.opinion(Y.code, X.code) < -15 && kmLL(sim.anchor(Y.capital), cap) < 3500).map(Y => Y.code);
    let C = s.coalitions.find(k => k.target === X.code);
    if (!C) {
      if (cands.length < 2) continue;
      C = { id: (s.coid = (s.coid || 0) + 1), target: X.code, members: cands.slice(0, 8), since: s.t };
      s.coalitions.push(C);
      sim.emit('war', `A coalition forms against the ${sim.nm(X.code)}: ${C.members.map(m => 'the ' + sim.nm(m)).join(', ')} pledge to stand together against their aggression.`, [X.code, ...C.members], { loc: X.capital, major: true });
    } else for (const m of cands) if (!C.members.includes(m) && C.members.length < 10) { C.members.push(m); if (X.code === s.player) sim.emit('war', `The ${sim.nm(m)} join the coalition against you.`, [X.code, m], { loc: s.nations[m].capital }); }
    // members stand by each other
    for (const a of C.members) for (const b of C.members) if (a < b && !sim.atWar(a, b) && sim.rel(a, b) !== 'alliance') sim.setRel(a, b, 'alliance');
    // and strike when strong enough
    const atWar = C.members.some(m => sim.atWar(m, X.code));
    if (atWar) { C.war = true; for (const m of C.members) if (!sim.atWar(m, X.code) && Math.random() < 0.5) sim.declareWar(m, X.code, true); continue; }
    if (C.war) { C.war = false; C.truce = s.t + 24 * 90; } // a peace is signed: the league rebuilds before marching again
    if (s.t < (C.truce || 0)) continue;
    const theirs = C.members.reduce((a, m) => a + sim.realmPower(m), 0), mine = sim.realmPower(X.code) + 1;
    const need = X.code === s.player ? 0.85 - Math.max(0, s.difficulty || 0) * 0.25 : 1;
    if (theirs >= mine * need && Math.random() < 0.25 + (X.infamy || 0) / 120) {
      const lead = C.members.slice().sort((a, b) => sim.realmPower(b) - sim.realmPower(a))[0];
      sim.declareWar(lead, X.code, true);
      for (const m of C.members) if (m !== lead && !sim.atWar(m, X.code)) sim.declareWar(m, X.code, true);
      sim.emit('war', `The coalition marches! ${C.members.map(m => 'The ' + sim.nm(m)).join(', ')} declare war on the ${sim.nm(X.code)} to break their power.`, [X.code, ...C.members], { loc: X.capital, major: true });
    }
  }
}
export function coalitionAgainst(sim, c) { return (sim.s.coalitions || []).find(C => C.target === c) || null; }
void GOV_TYPES;
