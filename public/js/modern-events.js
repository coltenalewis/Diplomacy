// Decisions of a modern head of government. Each event picks real actors from the state of the world (your rivals,
// allies, neighbours, ministers, provinces) and offers choices with real trade-offs between approval, stability,
// revenue, political capital, foreign opinion and reputation. Amounts are measured in days of the nation's revenue.
import { earn } from './pacts.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[(Math.random() * a.length) | 0];
const inc = N => Math.max(0.3, N.st?.prod?.wealth || 1);
const spend = (N, days) => { const v = inc(N) * days; N.wealth -= v; return v; };
const gain = (N, days) => { const v = inc(N) * days; N.wealth += v; return v; };
const fmtW = v => (v >= 100 ? Math.round(v) : v.toFixed(1));
const alive = sim => Object.values(sim.s.nations).filter(n => n.alive);
const nm = (sim, c) => sim.nm(c);
// actors
function rival(sim, N, max = -20) {
  const c = (N.known || []).filter(o => sim.s.nations[o]?.alive && sim.opinion(N.code, o) < max).sort((a, b) => sim.opinion(N.code, a) - sim.opinion(N.code, b));
  return c[0] || null;
}
function friend(sim, N, min = 25) {
  const c = (N.known || []).filter(o => sim.s.nations[o]?.alive && (sim.opinion(N.code, o) > min || sim.rel(N.code, o) === 'alliance'));
  return c.length ? pick(c) : null;
}
function neighbour(sim, N, filter = () => true) {
  const set = new Set();
  for (const i of sim.owned.get(N.code) || []) for (const j of sim.w.adj[i]) { const o = sim.s.regions[j].owner; if (o && o !== N.code && filter(o)) set.add(o); }
  return set.size ? pick([...set]) : null;
}
const poorFriend = (sim, N) => { const c = (N.known || []).filter(o => { const X = sim.s.nations[o]; return X?.alive && (X.dev ?? 0.5) < 0.35 && sim.opinion(o, N.code) > -10; }); return c.length ? pick(c) : null; };
const province = (sim, N, f = () => true) => { const r = sim.regionsOf(N.code).filter(f); return r.length ? pick(r) : null; };
const democratic = N => ['presidential', 'parliamentary', 'constmon'].includes(N.gov.type);
const rnd = (a, b) => a + Math.random() * (b - a);

const EV = [];
const ev = (id, title, when, text, options) => EV.push({ id, modern: true, title, when, text, options });

// ------------------------------------------------------------------ the economy
ev('inflation', 'Inflation Surges', (sim, N) => ({ v: (4 + Math.random() * 5).toFixed(1) }),
  c => `Consumer prices are up ${c.v}% on the year. Groceries, rent and fuel dominate the evening news, and the central bank is waiting for a signal from you.`,
  [{ label: 'Back the central bank: raise rates (approval −, stability +)', fx: (sim, N) => { N.gov.approval -= 0.05; N.gov.stability += 0.04; spend(N, 4); return 'Borrowing costs climb. Growth cools, but markets trust your resolve.'; } },
   { label: 'Cost-of-living package (revenue −, approval +)', fx: (sim, N) => { const v = spend(N, 18); N.gov.approval += 0.06; return `Energy rebates and food vouchers cost ${fmtW(v)} wealth. Households breathe again.`; } },
   { label: 'Blame foreign speculators (political capital −)', fx: (sim, N) => { N.gov.pc -= 15; N.gov.approval += 0.01; return 'The speeches land well at rallies; economists are unimpressed.'; } }]);
ev('strike', 'General Strike', (sim, N) => democratic(N) && { r: province(sim, N, r => r.pop > 500) },
  c => `Unions have called a general strike over pensions. Ports and railways around ${c.rn || c.cap} have stopped.`,
  [{ label: 'Concede to the unions (revenue −, approval +)', fx: (sim, N) => { spend(N, 15); N.gov.approval += 0.05; N.gov.pc -= 10; return 'The strike ends. The pension reform is shelved.'; } },
   { label: 'Hold firm (approval −, political capital +)', fx: (sim, N, c) => { N.gov.approval -= 0.06; N.gov.stability -= 0.04; N.gov.pc += 25; if (c.r) c.r.unrest = clamp(c.r.unrest + 0.15, 0, 1); return 'Weeks of disruption, but the reform passes. Your party admires your nerve.'; } },
   { label: 'Open talks with a mediator (political capital −)', fx: (sim, N) => { N.gov.pc -= 20; spend(N, 6); N.gov.stability += 0.02; return 'A compromise: a slower reform and a one-off bonus.'; } }]);
ev('recession', 'Recession Warning', (sim, N) => (N.st?.net?.wealth || 0) < inc(N) * 0.4 && {},
  () => 'The finance ministry projects two quarters of contraction. Factories are cutting shifts and unemployment is rising.',
  [{ label: 'Stimulus: infrastructure spending (revenue −, approval +)', fx: (sim, N) => { spend(N, 25); N.gov.approval += 0.04; for (const r of sim.regionsOf(N.code).slice(0, 6)) r.unrest = Math.max(0, r.unrest - 0.05); return 'Cranes over every city. Jobs return; the deficit grows.'; } },
   { label: 'Austerity (stability +, approval −)', fx: (sim, N) => { gain(N, 10); N.gov.approval -= 0.07; N.gov.stability += 0.03; return 'Budgets are cut. The bond markets applaud; the streets do not.'; } },
   { label: 'Ride it out', fx: (sim, N) => { N.gov.approval -= 0.03; return 'The downturn runs its course.'; } }]);
ev('energy_shock', 'Energy Price Shock', (sim, N) => (N.st?.net?.oil || 0) < 0 && { x: rival(sim, N, -10) },
  c => `Oil and gas prices have doubled${c.x ? ` after supply cuts blamed on ${c.xn}` : ''}. Heating bills are soaring.`,
  [{ label: 'Subsidise energy bills (revenue −−, approval +)', fx: (sim, N) => { spend(N, 22); N.gov.approval += 0.05; return 'Bills are capped. The treasury bleeds.'; } },
   { label: 'Fast-track renewables and nuclear (revenue −, research +)', fx: (sim, N) => { spend(N, 12); N.research.prog += (N.st.rp || 1) * 12; N.gov.approval -= 0.02; return 'Wind, solar and reactors are approved in record time.'; } },
   { label: 'Let prices rise (approval −)', fx: (sim, N) => { N.gov.approval -= 0.07; gain(N, 4); return 'Demand falls with the price. Voters remember the winter.'; } }]);
ev('downgrade', 'Credit Downgrade', (sim, N) => N.wealth < inc(N) * 5 && {},
  () => 'A ratings agency downgrades the national debt. Borrowing costs jump and the currency slides.',
  [{ label: 'Announce a fiscal rule (approval −, stability +)', fx: (sim, N) => { N.gov.approval -= 0.04; N.gov.stability += 0.04; gain(N, 6); return 'Markets calm. Ministries brace for cuts.'; } },
   { label: 'Seek an IMF programme (revenue +, reputation −)', fx: (sim, N) => { gain(N, 30); N.gov.approval -= 0.06; N.gov.pc -= 15; return 'A bailout arrives with strict conditions.'; } },
   { label: 'Ignore the agencies', fx: (sim, N) => { N.gov.stability -= 0.03; return 'The currency keeps sliding.'; } }]);
ev('tech_boom', 'A National Champion', (sim, N) => N.dev > 0.35 && {},
  c => `A homegrown AI start-up has become the most valuable company in the country. It asks for help building a giant datacentre near ${c.cap}.`,
  [{ label: 'Subsidise it (revenue −, research +)', fx: (sim, N) => { spend(N, 10); N.research.prog += (N.st.rp || 1) * 20; return 'The datacentre rises. Engineers flock to the capital.'; } },
   { label: 'Tax the windfall (revenue +)', fx: (sim, N) => { const v = gain(N, 12); return `The windfall tax raises ${fmtW(v)} wealth. Investors grumble.`; } },
   { label: 'Regulate it first (stability +)', fx: (sim, N) => { N.gov.stability += 0.03; N.gov.approval += 0.02; return 'A new AI safety law passes with broad support.'; } }]);
ev('housing', 'Housing Crisis', (sim, N) => N.dev > 0.4 && { r: sim.s.regions[N.capital] },
  c => `Rents in ${c.cap} have risen 30% in two years. Young families are leaving, and the opposition is campaigning on it.`,
  [{ label: 'Build social housing (revenue −, approval +)', fx: (sim, N) => { spend(N, 14); N.gov.approval += 0.05; return 'A million homes programme begins.'; } },
   { label: 'Rent controls (approval +, revenue −)', fx: (sim, N) => { N.gov.approval += 0.04; spend(N, 4); N.gov.pc -= 10; return 'Tenants cheer; landlords and builders pull back.'; } },
   { label: 'Deregulate planning (political capital −)', fx: (sim, N) => { N.gov.pc -= 15; gain(N, 3); return 'Developers race to build. Local councils protest.'; } }]);

// ------------------------------------------------------------------ society
ev('protests', 'Mass Protests', (sim, N) => N.gov.approval < 0.5 && { r: sim.s.regions[N.capital] },
  c => `Hundreds of thousands march through ${c.cap} demanding your resignation. Riot police are on standby.`,
  [{ label: 'Let them march and listen (approval +, stability −)', fx: (sim, N) => { N.gov.approval += 0.03; N.gov.stability -= 0.03; return 'The protests stay peaceful. Your promise of a national dialogue buys time.'; } },
   { label: 'Disperse them by force (stability +, approval −−, tyrant)', fx: (sim, N) => { N.gov.stability += 0.05; N.gov.approval -= 0.08; earn(sim, N.code, 'tyrant', 10); for (const o of N.known || []) if (democratic(sim.s.nations[o] || { gov: {} })) sim.addOpinion(o, N.code, -6); return 'Tear gas clears the squares. Democracies abroad condemn the crackdown.'; } },
   { label: 'Reshuffle the cabinet (political capital −)', fx: (sim, N) => { N.gov.pc -= 25; N.gov.approval += 0.05; return 'New faces, a new start. The marches thin out.'; } }]);
ev('scandal', 'Corruption Scandal', (sim, N) => { const ids = Object.values(N.gov.cabinet || {}); const ch = ids.length ? sim.s.chars[pick(ids)] : null; return ch && { ch }; },
  c => `Leaked documents show ${c.ch.name}, a senior minister, steered state contracts to a relative's firm. The press smells blood.`,
  [{ label: 'Fire the minister (political capital −, approval +)', fx: (sim, N, c) => { N.gov.pc -= 15; N.gov.approval += 0.04; for (const [r, id] of Object.entries(N.gov.cabinet)) if (id === c.ch.id) { delete N.gov.cabinet[r]; c.ch.role = null; } return `${c.ch.name} resigns in disgrace.`; } },
   { label: 'Stand by them (approval −)', fx: (sim, N) => { N.gov.approval -= 0.06; N.gov.stability -= 0.02; return 'The story runs for weeks.'; } },
   { label: 'Order an independent inquiry (stability +)', fx: (sim, N) => { N.gov.pc -= 8; N.gov.stability += 0.03; return 'The inquiry will take a year. The heat fades for now.'; } }]);
ev('journalist', 'The Critical Journalist', (sim, N) => !democratic(N) && {},
  () => 'An investigative journalist has published a damning exposé on your inner circle. It is spreading fast on social media.',
  [{ label: 'Ignore it', fx: (sim, N) => { N.gov.approval -= 0.03; return 'The article circulates, then fades.'; } },
   { label: 'Arrest the journalist (stability +, tyrant)', fx: (sim, N) => { N.gov.stability += 0.03; earn(sim, N.code, 'tyrant', 8); for (const o of N.known || []) if (democratic(sim.s.nations[o] || { gov: {} })) sim.addOpinion(o, N.code, -4); return 'The journalist is detained. Western governments protest.'; } },
   { label: 'Block the platforms (stability +, approval −)', fx: (sim, N) => { N.gov.stability += 0.02; N.gov.approval -= 0.04; return 'The internet slows to a crawl for a week.'; } }]);
ev('separatists', 'Independence Referendum', (sim, N) => { const r = province(sim, N, r => r.unrest > 0.25 && r.i !== N.capital); return r && { r }; },
  c => `Leaders in ${c.rn} demand a referendum on independence. Unrest is high and the regional parliament is defiant.`,
  [{ label: 'Grant wide autonomy (political capital −, unrest −)', fx: (sim, N, c) => { N.gov.pc -= 25; c.r.unrest = Math.max(0, c.r.unrest - 0.25); return `${c.rn} gains its own tax powers. Tensions ease.`; } },
   { label: 'Refuse: the constitution forbids it (unrest +)', fx: (sim, N, c) => { c.r.unrest = clamp(c.r.unrest + 0.15, 0, 1); N.gov.pc += 10; return 'The courts back you. The streets of the region do not.'; } },
   { label: 'Hold the vote and campaign to stay', fx: (sim, N, c) => { const stay = Math.random() < 0.55 + (N.gov.approval - 0.5); if (stay) { c.r.unrest = Math.max(0, c.r.unrest - 0.3); N.gov.approval += 0.04; return `${c.rn} votes to remain. A crisis averted.`; } c.r.unrest = 1; N.gov.stability -= 0.06; return `${c.rn} votes to leave. Its leaders prepare a declaration of independence.`; } }]);
ev('refugees', 'Refugee Wave', (sim, N) => { const n = neighbour(sim, N, o => sim.warsOf(o).length || (sim.s.nations[o].famine || 0) > 0.1); return n && { n }; },
  c => `Tens of thousands are fleeing ${c.nn} toward our border. Camps are overflowing and aid agencies are pleading for access.`,
  [{ label: 'Open the border (opinion +, approval −)', fx: (sim, N, c) => { N.gov.approval -= 0.03; sim.addOpinion(c.n, N.code, 15); earn(sim, N.code, 'peacemaker', 5); const r = sim.s.regions[N.capital]; r.pop += 50; return `Families from ${c.nn} find shelter. Some voters are uneasy.`; } },
   { label: 'Close the border (approval +, reputation −)', fx: (sim, N, c) => { N.gov.approval += 0.02; sim.addOpinion(c.n, N.code, -10); return 'The fences go up. Aid agencies condemn the decision.'; } },
   { label: 'Fund camps in the region (revenue −)', fx: (sim, N, c) => { spend(N, 8); sim.addOpinion(c.n, N.code, 6); return 'The refugees stay near home, with your money.'; } }]);
ev('ambitious_general', 'An Ambitious General', (sim, N) => N.gov.stability < 0.5 && (N.generals || []).length && { g: sim.s.chars[N.generals[0]] },
  c => `Intelligence warns that ${c.g?.name || 'the chief of staff'} has been meeting opposition figures. The barracks are restless.`,
  [{ label: 'Retire him with honours (political capital −)', fx: (sim, N) => { N.gov.pc -= 20; N.gov.stability += 0.05; return 'A quiet farewell ceremony. The threat passes.'; } },
   { label: 'Purge the officer corps (stability +, military weaker)', fx: (sim, N) => { N.gov.stability += 0.08; earn(sim, N.code, 'tyrant', 6); for (const u of sim.s.units) if (u.nation === N.code) u.xp = Math.max(0, (u.xp || 0) - 20); return 'Dozens of officers are arrested. The army is loyal, and weaker.'; } },
   { label: 'Raise military pay (revenue −)', fx: (sim, N) => { spend(N, 10); N.gov.stability += 0.04; return 'Bonuses all round. The grumbling stops.'; } }]);
ev('campaign', 'The Campaign Trail', (sim, N) => democratic(N) && N.gov.nextElection && N.gov.nextElection - sim.s.t < 24 * 120 && N.gov.nextElection > sim.s.t && { d: Math.ceil((N.gov.nextElection - sim.s.t) / 24) },
  c => `The election is ${c.d} days away and the polls are close. Your strategists want a headline promise.`,
  [{ label: 'Promise tax cuts (approval +, revenue −)', fx: (sim, N) => { N.gov.approval += 0.06; spend(N, 12); return 'The promise dominates the debate.'; } },
   { label: 'Promise more for hospitals and schools (approval +, revenue −)', fx: (sim, N) => { N.gov.approval += 0.05; spend(N, 8); N.gov.stability += 0.02; return 'A popular pledge.'; } },
   { label: 'Run on your record', fx: (sim, N) => { N.gov.approval += N.gov.approval > 0.5 ? 0.03 : -0.02; return 'You stand on what you have done.'; } }]);

// ------------------------------------------------------------------ disasters and security
ev('pandemic', 'A New Virus', (sim, N) => ({}),
  c => `Hospitals in ${c.cap} report clusters of a fast-spreading respiratory virus.${c.vax ? '' : ''}`,
  [{ label: 'Lockdown (revenue −−, saves lives)', fx: (sim, N) => { spend(N, 25); N.gov.approval -= 0.03; return 'Streets empty. The curve flattens.'; } },
   { label: 'Targeted measures (balanced)', fx: (sim, N) => { spend(N, 8); for (const r of sim.regionsOf(N.code)) r.pop *= 0.999; return 'Masks, testing and some closures. Cases rise, then fall.'; } },
   { label: 'Keep everything open (lives lost)', fx: (sim, N) => { for (const r of sim.regionsOf(N.code)) r.pop *= 0.996; N.gov.approval -= 0.06; return 'The economy keeps running. The death toll shocks the nation.'; } },
   { label: 'Rush an mRNA vaccine (needs mRNA vaccines)', fx: (sim, N) => { if (!N.techs.mrna_vaccines) { N.gov.approval -= 0.03; return 'We lack the technology. Precious weeks are lost.'; } spend(N, 10); N.gov.approval += 0.05; return 'Vaccines roll out in weeks. A triumph of science.'; } }]);
ev('disaster', 'Natural Disaster', (sim, N) => { const r = province(sim, N); return r && { r, kind: pick(sim.T[r.i].coastal ? ['flood', 'hurricane', 'earthquake'] : ['earthquake', 'wildfires', 'flood']) }; },
  c => `A devastating ${c.kind} has struck ${c.rn}. Thousands are homeless and roads are cut.`,
  [{ label: 'Massive relief effort (revenue −, approval +)', fx: (sim, N, c) => { spend(N, 12); N.gov.approval += 0.05; c.r.damage = Math.max(0, (c.r.damage || 0) - 0.2); return 'Soldiers and engineers pour in. You visit the ruins.'; } },
   { label: 'Appeal for international aid (opinion +)', fx: (sim, N, c) => { const f = friend(sim, N); c.r.damage = Math.min(1, (c.r.damage || 0) + 0.1); if (f) { sim.addOpinion(N.code, f, 10); gain(N, 6); return `${nm(sim, f)} sends rescue teams and money.`; } return 'Few answer the call.'; } },
   { label: 'Leave it to local authorities', fx: (sim, N, c) => { c.r.damage = Math.min(1, (c.r.damage || 0) + 0.25); c.r.unrest = clamp(c.r.unrest + 0.15, 0, 1); N.gov.approval -= 0.05; return 'The response is slow and chaotic.'; } }]);
ev('heatwave', 'Record Heatwave and Drought', (sim, N) => Math.abs(sim.w.regions[N.capital].lat) < 50 && {},
  () => 'Temperatures break records for a third week. Rivers are low, crops are failing and power stations are overheating.',
  [{ label: 'Import food and ration water (revenue −)', fx: (sim, N) => { spend(N, 10); N.food += (N.st.foodCons || 1) * 5; return 'Shelves stay stocked. Hosepipe bans everywhere.'; } },
   { label: 'Emergency climate plan (revenue −, reputation +)', fx: (sim, N) => { spend(N, 14); earn(sim, N.code, 'peacemaker', 3); N.gov.approval += 0.03; return 'A green investment drive is announced.'; } },
   { label: 'Wait for the rain', fx: (sim, N) => { N.food -= (N.st.foodCons || 1) * 6; N.gov.approval -= 0.04; return 'The harvest is poor.'; } }]);
ev('cyberattack', 'Cyberattack on the Grid', (sim, N) => { const r = rival(sim, N, -25); return r && { x: r }; },
  c => `Blackouts hit ${c.cap}. Investigators trace the malware to hackers linked to ${c.xn}.`,
  [{ label: `Retaliate in cyberspace (opinion −−)`, fx: (sim, N, c) => { if (!N.techs.offensive_cyber && !N.techs.cyber_warfare) return 'We lack the tools to strike back.'; sim.addOpinion(c.x, N.code, -20); const X = sim.s.nations[c.x]; X.wealth -= Math.max(0.3, X.st?.prod?.wealth || 1) * 4; return `Our hackers take down banking systems in ${c.xn}.`; } },
   { label: 'Sanctions and public attribution (opinion −)', fx: (sim, N, c) => { sim.sanction(N.code, c.x); N.gov.approval += 0.03; return `We name ${c.xn} and impose sanctions.`; } },
   { label: 'Patch quietly (stability −)', fx: (sim, N) => { N.gov.stability -= 0.02; spend(N, 4); return 'The grid is restored. The attackers remain at large.'; } }]);
ev('terror', 'Terror Attack', (sim, N) => ({ r: sim.s.regions[N.capital] }),
  c => `A bomb has exploded at a busy station in ${c.cap}. The nation is in mourning.`,
  [{ label: 'National unity and resilience (approval +)', fx: (sim, N) => { N.gov.approval += 0.04; return 'Vigils across the country. The nation refuses to be divided.'; } },
   { label: 'Emergency security laws (stability +, liberties −)', fx: (sim, N) => { N.gov.stability += 0.05; N.gov.approval += 0.02; if (democratic(N)) earn(sim, N.code, 'tyrant', 3); return 'Surveillance powers expand. Civil liberties groups object.'; } },
   { label: 'Blame a foreign rival (opinion −)', fx: (sim, N) => { const x = rival(sim, N, -30); if (x) { sim.addOpinion(x, N.code, -15); N.gov.approval += 0.03; return `You point the finger at ${nm(sim, x)}. They deny everything.`; } return 'There is no one obvious to blame.'; } }]);

// ------------------------------------------------------------------ foreign affairs
ev('arms_deal', 'Arms Deal Request', (sim, N) => { const f = friend(sim, N, 15); return N.mil >= 15 && f && { f }; },
  c => `${c.fn} wants to buy fighter jets and air-defence systems from our industry.`,
  [{ label: 'Sell (revenue +, opinion +, their rivals −)', fx: (sim, N, c) => { const v = gain(N, 15); sim.addOpinion(c.f, N.code, 12); const x = rival(sim, sim.s.nations[c.f], -30); if (x) sim.addOpinion(x, N.code, -8); return `A ${fmtW(v)} wealth contract is signed.`; } },
   { label: 'Refuse: it could fuel conflict (reputation +)', fx: (sim, N, c) => { sim.addOpinion(c.f, N.code, -6); earn(sim, N.code, 'peacemaker', 3); return 'The deal goes to a competitor.'; } }]);
ev('aid_request', 'Appeal for Aid', (sim, N) => { const p = poorFriend(sim, N); return N.dev > 0.45 && p && { p }; },
  c => `${c.pn} is facing drought and debt default. Its president appeals for help.`,
  [{ label: 'Generous aid package (revenue −, opinion ++)', fx: (sim, N, c) => { const v = spend(N, 8); const P = sim.s.nations[c.p]; P.wealth += v; sim.addOpinion(c.p, N.code, 25); earn(sim, N.code, 'peacemaker', 6); return `${fmtW(v)} wealth in aid. ${c.pn} will remember.`; } },
   { label: 'Loans with conditions (opinion +)', fx: (sim, N, c) => { sim.addOpinion(c.p, N.code, 8); return 'A loan, with reforms attached.'; } },
   { label: 'Decline', fx: (sim, N, c) => { sim.addOpinion(c.p, N.code, -8); return `${c.pn} turns to others for help.`; } }]);
ev('border_incident', 'Border Incident', (sim, N) => { const x = neighbour(sim, N, o => sim.opinion(N.code, o) < -10); return x && { x }; },
  c => `Soldiers from ${c.xn} crossed the border overnight and fired on a patrol. Two of our soldiers are dead.`,
  [{ label: 'De-escalate through diplomats (political capital −)', fx: (sim, N, c) => { N.gov.pc -= 15; sim.addOpinion(c.x, N.code, 5); return 'A hotline call and a joint investigation calm things.'; } },
   { label: 'Mobilise along the border (opinion −−, approval +)', fx: (sim, N, c) => { N.gov.approval += 0.04; sim.addOpinion(c.x, N.code, -20); sim.addOpinion(N.code, c.x, -15); return 'Tanks roll to the frontier. The world urges restraint.'; } },
   { label: 'Demand an apology at the UN', fx: (sim, N, c) => { sim.addOpinion(c.x, N.code, -8); N.gov.approval += 0.02; return 'The Security Council debates. Nothing is resolved.'; } }]);
ev('spy_scandal', 'Spy Ring Exposed', (sim, N) => { const x = rival(sim, N, -15); return x && { x }; },
  c => `Counter-intelligence has arrested a ring of agents working for ${c.xn} inside our defence ministry.`,
  [{ label: 'Expel their diplomats (opinion −, approval +)', fx: (sim, N, c) => { sim.addOpinion(c.x, N.code, -12); N.gov.approval += 0.03; return 'Twenty diplomats are given 72 hours to leave.'; } },
   { label: 'Turn the spies into double agents', fx: (sim, N) => { N.spyBonus = (N.spyBonus || 0) + 0.1; return 'They will feed their masters what we choose.'; } },
   { label: 'Trade them for our own detained agents', fx: (sim, N, c) => { sim.addOpinion(c.x, N.code, 4); return 'A quiet exchange on a bridge at dawn.'; } }]);
ev('summit', 'Leaders’ Summit', (sim, N) => { const P = (sim.s.pacts || []).filter(p => p.members.includes(N.code) && !p.un); const p = P.length ? pick(P) : null; return p && { p: p.id, pn: p.name }; },
  c => `The leaders of the ${c.pn} meet this week. Attendance would cost time, but the host is counting on you.`,
  [{ label: 'Attend and lead (political capital +, members’ opinion +)', fx: (sim, N, c) => { const P = sim.s.pacts.find(x => x.id === c.p); if (P) for (const m of P.members) if (m !== N.code) sim.addOpinion(m, N.code, 4); N.gov.pc += 15; return 'You dominate the photographs and the communiqué.'; } },
   { label: 'Send a minister', fx: (sim, N) => { N.gov.pc += 3; return 'Business as usual.'; } },
   { label: 'Skip it to focus at home (approval +)', fx: (sim, N, c) => { const P = sim.s.pacts.find(x => x.id === c.p); if (P) for (const m of P.members) if (m !== N.code) sim.addOpinion(m, N.code, -3); N.gov.approval += 0.02; return 'Allies notice your absence.'; } }]);
ev('trade_war', 'Trade War', (sim, N) => { const x = (N.known || []).filter(o => sim.s.nations[o]?.alive && (sim.s.nations[o].gdp || 0) > (N.gdp || 0) * 0.5 && sim.opinion(o, N.code) < 15); const o = x.length ? pick(x) : null; return o && { x: o }; },
  c => `${c.xn} has slapped 25% tariffs on our exports, accusing us of unfair subsidies.`,
  [{ label: 'Retaliate in kind (revenue −, approval +)', fx: (sim, N, c) => { spend(N, 6); N.gov.approval += 0.03; sim.addOpinion(c.x, N.code, -12); return 'Tit-for-tat tariffs. Both economies suffer.'; } },
   { label: 'Negotiate a deal (political capital −)', fx: (sim, N, c) => { N.gov.pc -= 20; sim.addOpinion(c.x, N.code, 8); return 'A compromise trims the tariffs.'; } },
   { label: 'Take it to the trade courts', fx: (sim, N) => { spend(N, 3); return 'A ruling may come in two years.'; } }]);
ev('join_sanctions', 'A Call for Sanctions', (sim, N) => { const f = friend(sim, N, 20); if (!f) return null; const x = rival(sim, sim.s.nations[f], -40); return x && x !== N.code && !sim.s.sanctions.some(z => z.by === N.code && z.on === x) && { f, x }; },
  c => `${c.fn} asks us to join sanctions against ${c.xn}: a ban on finance, technology and energy trade.`,
  [{ label: 'Join the sanctions (ally +, revenue −)', fx: (sim, N, c) => { sim.sanction(N.code, c.x); sim.addOpinion(c.f, N.code, 12); spend(N, 4); return `We cut ties with ${c.xn}.`; } },
   { label: 'Stay neutral (keep trade)', fx: (sim, N, c) => { sim.addOpinion(c.f, N.code, -8); sim.addOpinion(c.x, N.code, 6); return 'We keep our options open, and our trade.'; } }]);
ev('nuclear_program', 'A Rival’s Bomb', (sim, N) => { const x = Object.values(sim.s.nations).find(X => X.alive && X.research?.cur === 'nuclear_weapons' && X.code !== N.code); return x && { x: x.code }; },
  c => `Intelligence agencies report ${c.xn} is enriching uranium close to weapons grade. The world is waiting to see who acts.`,
  [{ label: 'Push for UN sanctions (opinion −)', fx: (sim, N, c) => { sim.sanction(N.code, c.x); for (const o of N.known || []) if (sim.opinion(o, c.x) < 0) sim.addOpinion(o, N.code, 3); return 'A sanctions resolution is tabled.'; } },
   { label: 'Sabotage the programme (covert)', fx: (sim, N, c) => { const X = sim.s.nations[c.x]; if (Math.random() < 0.55 + (N.mods.covert || 0)) { X.research.prog = 0; return 'A computer worm wrecks the centrifuges. Years of work are lost.'; } sim.addOpinion(c.x, N.code, -25); return 'The operation is exposed.'; } },
   { label: 'Offer a deal: sanctions relief for inspections', fx: (sim, N, c) => { N.gov.pc -= 15; if (Math.random() < 0.5) { const X = sim.s.nations[c.x]; X.research.cur = null; X.proliferator = false; earn(sim, N.code, 'peacemaker', 10); return 'Inspectors return. The programme is frozen.'; } return 'The talks collapse.'; } }]);
ev('maritime', 'Standoff at Sea', (sim, N) => { const x = rival(sim, N, -20); return x && sim.T[N.capital]?.coastal && { x }; },
  c => `Coast guard ships from ${c.xn} are blockading a reef our fishermen have used for generations.`,
  [{ label: 'Send the navy (opinion −−)', fx: (sim, N, c) => { sim.addOpinion(c.x, N.code, -15); N.gov.approval += 0.04; return 'Warships face off. Nobody blinks first.'; } },
   { label: 'Seek international arbitration', fx: (sim, N) => { N.gov.pc -= 10; earn(sim, N.code, 'peacemaker', 3); return 'The tribunal will rule in our favour. Whether they listen is another matter.'; } },
   { label: 'Back down (approval −)', fx: (sim, N, c) => { N.gov.approval -= 0.04; sim.addOpinion(c.x, N.code, 6); return 'The fishermen are furious.'; } }]);
ev('hostages', 'Citizens Detained Abroad', (sim, N) => { const x = rival(sim, N, -25); return x && { x }; },
  c => `Three of our citizens have been arrested in ${c.xn} on espionage charges. Their families say they are tourists.`,
  [{ label: 'Negotiate a quiet exchange (political capital −)', fx: (sim, N) => { N.gov.pc -= 15; N.gov.approval += 0.03; return 'They land home to cheering crowds.'; } },
   { label: 'Pay what they ask (revenue −)', fx: (sim, N) => { spend(N, 6); N.gov.approval += 0.02; return 'They come home. Critics say we invite more hostage-taking.'; } },
   { label: 'Refuse to bargain (approval −)', fx: (sim, N, c) => { N.gov.approval -= 0.03; sim.addOpinion(N.code, c.x, -10); return 'They face a long sentence.'; } }]);
ev('defector', 'A High-Level Defector', (sim, N) => { const x = rival(sim, N, -30); return x && { x }; },
  c => `A senior officer from ${c.xn} has walked into our embassy with a hard drive of secrets.`,
  [{ label: 'Grant asylum (intelligence +, opinion −)', fx: (sim, N, c) => { N.spyBonus = (N.spyBonus || 0) + 0.15; N.research.prog += (N.st.rp || 1) * 10; sim.addOpinion(c.x, N.code, -12); return 'A windfall of secrets.'; } },
   { label: 'Hand him back (opinion +)', fx: (sim, N, c) => { sim.addOpinion(c.x, N.code, 10); return 'A gesture of goodwill.'; } }]);
ev('energy_offer', 'Cheap Energy on Offer', (sim, N) => { const x = rival(sim, N, -5); return x && (sim.s.nations[x].st?.net?.oil || 0) > 0 && (N.st?.net?.oil || 0) <= 0 && { x }; },
  c => `${c.xn} offers us oil and gas at a deep discount, on a twenty-year contract.`,
  [{ label: 'Accept (energy +, allies uneasy)', fx: (sim, N, c) => { N.oil += 80; N.oilBase = (N.oilBase || 0) + 3; sim.addOpinion(c.x, N.code, 10); const f = friend(sim, N, 30); if (f) sim.addOpinion(f, N.code, -8); return 'Cheap energy flows. Some allies call it dependence.'; } },
   { label: 'Refuse (allies +)', fx: (sim, N) => { const f = friend(sim, N, 30); if (f) sim.addOpinion(f, N.code, 5); return 'We look elsewhere for our energy.'; } }]);
ev('climate_summit', 'Climate Summit', (sim, N) => ({}),
  () => 'World leaders gather to agree new emissions targets. Our pledge will set the tone.',
  [{ label: 'Ambitious pledge (revenue −, reputation +)', fx: (sim, N) => { spend(N, 10); earn(sim, N.code, 'peacemaker', 6); for (const o of N.known || []) sim.addOpinion(o, N.code, 2); N.gov.approval += 0.02; return 'You are hailed as a climate leader.'; } },
   { label: 'Modest pledge', fx: (sim, N) => { spend(N, 3); return 'A middle course.'; } },
   { label: 'Refuse to commit (revenue +, reputation −)', fx: (sim, N) => { for (const o of N.known || []) sim.addOpinion(o, N.code, -2); return 'Industry is relieved; the world is not.'; } }]);
ev('olympics', 'An Olympic Bid', (sim, N) => N.dev > 0.45 && {},
  c => `The Olympic committee invites ${c.cap} to bid for the Games.`,
  [{ label: 'Bid (revenue −−, approval +, prestige)', fx: (sim, N) => { spend(N, 20); N.gov.approval += 0.05; earn(sim, N.code, 'peacemaker', 3); for (const o of N.known || []) sim.addOpinion(o, N.code, 1); return 'We win! Seven years of construction begin.'; } },
   { label: 'Pass', fx: () => 'Perhaps next time.' }]);
ev('space_race', 'The New Space Race', (sim, N) => N.dev > 0.5 && (N.gdp || 0) > 500 && {},
  () => 'A rival power has landed a rover on the far side of the Moon. Our space agency asks for a bigger budget.',
  [{ label: 'Fund a lunar programme (revenue −, research +)', fx: (sim, N) => { spend(N, 15); N.research.prog += (N.st.rp || 1) * 15; N.gov.approval += 0.02; return 'Rockets roll out. A national project is born.'; } },
   { label: 'Partner with allies', fx: (sim, N) => { spend(N, 6); const f = friend(sim, N, 30); if (f) sim.addOpinion(f, N.code, 6); return 'A joint mission shares the cost and the glory.'; } },
   { label: 'Space can wait', fx: () => 'Budgets go elsewhere.' }]);
ev('peace_feeler', 'Peace Feelers', (sim, N) => { const w = sim.warsOf(N.code); return w.length && { x: w[0] }; },
  c => `Through intermediaries, ${c.xn} signals it might accept a ceasefire on current lines.`,
  [{ label: 'Accept a ceasefire (approval ±)', fx: (sim, N, c) => { sim.makePeace(N.code, c.x); N.gov.approval += N.exhaustion > 0.3 ? 0.06 : -0.04; earn(sim, N.code, 'peacemaker', 8); return 'The guns fall silent.'; } },
   { label: 'Fight on for total victory', fx: (sim, N) => { N.gov.approval += N.exhaustion < 0.2 ? 0.03 : -0.05; return 'The war continues.'; } }]);
ev('war_aid', 'A Nation at War Asks for Help', (sim, N) => { const v = (N.known || []).find(o => sim.s.nations[o]?.alive && sim.warsOf(o).some(e => sim.opinion(N.code, e) < -20) && sim.opinion(N.code, o) > 10); return v && { v, e: sim.warsOf(v).find(e => sim.opinion(N.code, e) < -20) }; },
  c => `${c.vn} is fighting for its survival against ${c.en} and asks for weapons and money.`,
  [{ label: 'Send weapons and aid (revenue −, opinion ++)', fx: (sim, N, c) => { const v = spend(N, 12); const V = sim.s.nations[c.v]; V.wealth += v; V.aid = (V.aid || 0) + inc(N) * 0.05; sim.addOpinion(c.v, N.code, 20); sim.addOpinion(c.e, N.code, -15); earn(sim, N.code, 'steadfast', 5); return `Aid worth ${fmtW(v)} wealth is on its way, with more to follow each month.`; } },
   { label: 'Humanitarian aid only', fx: (sim, N, c) => { spend(N, 3); sim.addOpinion(c.v, N.code, 4); return 'Medicine and food, not guns.'; } },
   { label: 'Stay out of it', fx: (sim, N, c) => { sim.addOpinion(c.v, N.code, -10); sim.addOpinion(c.e, N.code, 4); return 'We stay neutral.'; } }]);

// context names for the text
export const MODERN_EVENTS = EV.map(e => ({ ...e, id: 'm_' + e.id, when: (sim, N) => {
  const c = e.when(sim, N); if (!c) return null;
  for (const k of ['x', 'f', 'p', 'n', 'v', 'e']) if (c[k] && typeof c[k] === 'string') c[k + 'n'] = sim.nm(c[k]);
  return c;
} }));
