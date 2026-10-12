// The Imperial Council: an overlord meets its vassals. Vassals bring petitions drawn from their real situation;
// the overlord grants, compromises or refuses, and issues decrees to all. AI overlords run their own courts.
import { AGES, ageScale } from './eras.js';
import { UNITS } from './units.js';
import { TECH } from './tech.js';
import { GOV_TYPES } from './gov.js';
import { G, $, esc, fmt, toast, dstr, costStr, STOCK_ICON } from './ui.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const IMPERIAL_COOLDOWN_DAYS = 15;

export function councilName(N) {
  const k = N.gov?.type || 'tribe';
  if (k === 'tribe' || k === 'chiefdom') return 'Council of Chiefs';
  if (k === 'theocracy') return 'Holy Synod';
  if (k === 'feudal') return 'Royal Diet';
  if (k === 'junta') return 'War Council of the Realm';
  if (k === 'oneparty') return 'Congress of the Union';
  if (k === 'technocracy') return 'Federal Assembly';
  if (GOV_TYPES[k]?.democratic) return 'Imperial Senate';
  return 'Imperial Court';
}
const isSenate = N => /Senate|Congress|Assembly/.test(councilName(N));

// how much the vassal values our goodwill: their opinion of us
const loyalty = (sim, v, o) => Math.round(sim.opinion(v, o));
const shift = (sim, v, o, d) => sim.addOpinion(v, o, d);

// ------------------------------------------------------------------ petitions
function petitionsFor(sim, ai, P, v) {
  const s = sim.s, w = sim.w, V = s.nations[v], O = s.nations[P], out = [];
  const a = ageScale(V.age), op = loyalty(sim, v, P), ruler = GOV_TYPES[V.gov.type].ruler;
  const vn = sim.nm(v);
  // 1) shortages: ask for aid
  for (const k of ['food', 'wood', 'stone', 'metal', 'wealth']) {
    if ((k === 'metal' || k === 'wealth') && V.age < 1) continue;
    if ((V.st.net?.[k] || 0) < 0 && (V[k] || 0) < 12 * a) {
      const amt = Math.round((k === 'food' ? 25 : 15) * Math.pow(a, 0.9));
      out.push({ v, kind: 'aid', score: 6, data: { k, amt }, title: `The ${vn} ask for ${k}`, text: `"Our stores of ${k} are failing. Send us ${amt} ${k} and we will not forget it."`,
        opts: [{ label: `Send ${amt} ${STOCK_ICON[k]}`, disabled: (O[k] || 0) < amt, why: `You have ${fmt(O[k] || 0)}.` }, { label: 'Waive their tribute for 30 days' }, { label: 'Refuse', cls: 'danger' }] });
      break;
    }
  }
  // 2) tribute relief
  if (((V.tribute ?? 0.25) > 0.3 && op < 15) || ((V.tribute ?? 0.25) >= 0.25 && (V.famine || op < -10)))
    out.push({ v, kind: 'relief', score: 5 + ((V.tribute ?? 0.25) > 0.3 ? 3 : 0), title: `The ${vn} plead for lighter tribute`, text: `"${Math.round((V.tribute ?? 0.25) * 100)}% of all we make flows to your treasury. Our people grumble. Lighten the burden."`,
      opts: [{ label: 'Lower it to 10%' }, ...((V.tribute ?? 0.25) > 0.3 ? [{ label: 'Compromise at 25%' }] : []), { label: 'The tribute stands', cls: 'danger' }] });
  // 3) territorial claims against another vassal
  for (const u of sim.vassalsOf(P)) {
    if (u === v) continue;
    const disputed = sim.regionsOf(u).find(r => r.core === v) || (V.traits.aggression > 0.5 && sim.opinion(v, u) < 0 ? sim.regionsOf(u).find(r => r.i !== s.nations[u].capital && w.adj[r.i].filter(j => s.regions[j].owner === v).length >= 2) : null);
    if (disputed) {
      const name = w.regions[disputed.i].name;
      out.push({ v, kind: 'dispute', score: 7, data: { i: disputed.i, holder: u }, title: `The ${vn} claim ${name} from the ${sim.nm(u)}`, text: `"${name} ${disputed.core === v ? 'was ours before the ' + sim.nm(u) + ' took it' : 'lies within our natural borders'}. We ask our liege to judge."`,
        opts: [{ label: `Award it to the ${vn}` }, { label: `Uphold the ${sim.nm(u)}` }, { label: 'Take it under the crown' }] });
      break;
    }
  }
  // 4) a grant of crown land on their border
  const grant = sim.regionsOf(P).filter(r => r.i !== O.capital && r.lvl <= 2 && w.adj[r.i].filter(j => s.regions[j].owner === v).length >= 2).sort((x, y) => x.pop - y.pop)[0];
  if (grant && op > -10) out.push({ v, kind: 'grant', score: 3, data: { i: grant.i }, title: `The ${vn} ask for ${w.regions[grant.i].name}`, text: `"Grant us the lands of ${w.regions[grant.i].name}, which border our own, and our gratitude will be boundless."`,
    opts: [{ label: 'Grant the land' }, { label: 'Refuse', cls: 'danger' }] });
  // 5) permission to conquer
  if (!sim.warsOf(v).length && V.traits.aggression > 0.4) {
    const myP = sim.power(v) + 1;
    const tgt = [...new Set(sim.regionsOf(v).flatMap(r => w.adj[r.i].map(j => s.regions[j].owner)))].filter(x => x && x !== v && x !== P && s.nations[x]?.alive && s.nations[x].overlord !== P && !sim.friendly(P, x) && sim.realmOf(x) !== P)
      .map(x => ({ x, r: (sim.power(x) + 1) / myP })).sort((p, q) => p.r - q.r)[0];
    if (tgt && tgt.r < 1.3) out.push({ v, kind: 'conquest', score: 6 + V.traits.aggression * 3, data: { x: tgt.x }, title: `The ${vn} seek leave to make war on the ${sim.nm(tgt.x)}`, text: `"The ${sim.nm(tgt.x)} are weak and their lands are rich. Give us your blessing, and we will add them to your realm."`,
      opts: [{ label: 'Grant permission' }, { label: 'Grant it, and join the war', disabled: sim.atWar(P, tgt.x) }, { label: 'Forbid it', cls: 'danger' }] });
  }
  // 6) protection
  for (const e of sim.warsOf(v)) {
    if (sim.atWar(P, e) || e === P || sim.realmOf(e) === P) continue;
    if (sim.power(e) > sim.power(v) * 0.9) {
      const gift = Math.round(8 * a);
      out.push({ v, kind: 'protect', score: 9, data: { e, gift }, title: `The ${vn} beg protection from the ${sim.nm(e)}`, text: `"The ${sim.nm(e)} are upon us. You swore to protect us. Will you?"`,
        opts: [{ label: `Declare war on the ${sim.nm(e)}` }, { label: `Send ${gift} wealth for their defense`, disabled: O.wealth < gift, why: `You have ${fmt(O.wealth)}.` }, { label: 'They must fend for themselves', cls: 'danger' }] });
      break;
    }
  }
  // 7) knowledge
  const know = Object.keys(O.techs).filter(id => !V.techs[id] && TECH[id].age <= V.age && TECH[id].req.every(q => V.techs[q])).sort((x, y) => TECH[x].cost - TECH[y].cost)[0];
  if (know) out.push({ v, kind: 'tech', score: 3, data: { id: know }, title: `The ${vn} ask to learn ${TECH[know].name}`, text: `"Your scholars know the secrets of ${TECH[know].name}. Share them, and our tribute will grow with our skill."`,
    opts: [{ label: 'Share the knowledge' }, { label: 'Refuse', cls: 'danger' }] });
  // 8) honors for a loyal house
  if (op > 25) out.push({ v, kind: 'honors', score: 2, title: `The ${ruler} of the ${vn} seeks an honor`, text: `"We have served faithfully. A title from our liege would bind our houses closer still."`,
    opts: [{ label: 'Bestow a title (20 influence)', disabled: O.gov.pc < 20, why: 'Not enough influence.' }, { label: 'Not now' }] });
  // 9) autonomy for the long-serving
  const held = (s.t - (V.vassalSince || 0)) / 24;
  if (held > 200 && op > 35) out.push({ v, kind: 'autonomy', score: 4, title: `The ${vn} ask for their freedom`, text: `"For ${Math.floor(held)} days we have served. Release us as friends, and we will remain your allies."`,
    opts: [{ label: 'Release them as allies' }, { label: 'Grant autonomy: tribute 10%' }, { label: 'Refuse', cls: 'danger' }] });
  // 10) grievances of the resentful
  if (op < -25) out.push({ v, kind: 'grievance', score: 8, title: `The ${vn} voice their grievances`, text: `"We are bled dry and treated with contempt. Things cannot go on like this."`,
    opts: [{ label: 'Apologize and lower tribute to 10%' }, { label: 'Promise reform (15 influence)', disabled: O.gov.pc < 15, why: 'Not enough influence.' }, { label: 'Remind them who rules', cls: 'danger' }] });
  return out.sort((x, y) => y.score - x.score);
}

function resolve(sim, ai, P, pet, k) {
  const s = sim.s, w = sim.w, v = pet.v, V = s.nations[v], O = s.nations[P], d = pet.data || {}, vn = sim.nm(v);
  if (!V?.alive || V.overlord !== P) return 'They are no longer your vassal.';
  switch (pet.kind) {
    case 'aid':
      if (k === 0) { O[d.k] -= d.amt; V[d.k] = (V[d.k] || 0) + d.amt; shift(sim, v, P, 9); return `${d.amt} ${d.k} sent. The ${vn} are grateful.`; }
      if (k === 1) { V.tribReliefUntil = s.t + 30 * 24; shift(sim, v, P, 6); return `The ${vn} pay no tribute for 30 days.`; }
      shift(sim, v, P, -5); return `The ${vn} leave empty-handed and bitter.`;
    case 'relief':
      if (k === 0) { V.tribute = 0.1; shift(sim, v, P, 12); return `Tribute lowered to 10%. The ${vn} rejoice.`; }
      if (pet.opts.length === 3 && k === 1) { V.tribute = 0.25; shift(sim, v, P, 5); return 'Tribute set to 25%. A fair compromise.'; }
      shift(sim, v, P, -9); return `The tribute stands. The ${vn} seethe.`;
    case 'dispute': {
      const r = s.regions[d.i], u = d.holder;
      if (r.owner !== u) return 'The dispute has resolved itself.';
      const move = to => { sim.owned.get(r.owner)?.delete(r.i); sim.owned.get(to)?.add(r.i); r.owner = to; r.capture = null; if (r.build?.kind !== 'settle') r.build = null; };
      if (k === 0) { move(v); shift(sim, v, P, 10); shift(sim, u, P, -12); sim.emit('vassal', `By imperial decree, ${w.regions[r.i].name} passes from the ${sim.nm(u)} to the ${vn}.`, [P, v, u], { loc: r.i }); return `${w.regions[r.i].name} is awarded to the ${vn}.`; }
      if (k === 1) { shift(sim, v, P, -8); shift(sim, u, P, 5); return `The ${sim.nm(u)} keep ${w.regions[r.i].name}.`; }
      move(P); shift(sim, v, P, -6); shift(sim, u, P, -8); sim.emit('vassal', `${w.regions[r.i].name} is taken under the crown of the ${sim.nm(P)}.`, [P, v, u], { loc: r.i }); return `${w.regions[r.i].name} now belongs to the crown. Neither vassal is pleased.`;
    }
    case 'grant': {
      const r = s.regions[d.i];
      if (r.owner !== P) return 'That land is no longer yours to give.';
      if (k === 0) { sim.owned.get(P).delete(r.i); sim.owned.get(v).add(r.i); r.owner = v; r.core = v; if (r.build?.kind !== 'settle') r.build = null; O.queue = O.queue.filter(q => q.region !== r.i); shift(sim, v, P, 15); return `${w.regions[r.i].name} is granted to the ${vn}.`; }
      shift(sim, v, P, -5); return 'The request is refused.';
    }
    case 'conquest':
      if (k === 0 || k === 1) {
        V.warLicense = { target: d.x, until: s.t + 60 * 24 }; shift(sim, v, P, k === 1 ? 12 : 8);
        if (k === 1) { sim.declareWar(P, d.x); }
        if (!sim.atWar(v, d.x)) sim.declareWar(v, d.x);
        return k === 1 ? `Together with the ${vn}, you march on the ${sim.nm(d.x)}.` : `The ${vn} go to war against the ${sim.nm(d.x)} with your blessing.`;
      }
      shift(sim, v, P, -7); return `The ${vn} sheathe their swords, resentfully.`;
    case 'protect':
      if (k === 0) { sim.declareWar(P, d.e); shift(sim, v, P, 16); return `You declare war on the ${sim.nm(d.e)} to defend the ${vn}.`; }
      if (k === 1) { sim.gift(P, v, 'wealth', d.gift); shift(sim, v, P, 4); return 'Gold for their defense is on its way.'; }
      shift(sim, v, P, -14); return `The ${vn} feel abandoned.`;
    case 'tech': if (k === 0) { const r = sim.shareTech(P, v, d.id); shift(sim, v, P, 6); return r.ok ? `The ${vn} learn ${TECH[d.id].name}.` : r.why; } shift(sim, v, P, -2); return 'Our secrets stay ours.';
    case 'honors': if (k === 0) { O.gov.pc -= 20; shift(sim, v, P, 12); return `A title is bestowed. The ${vn} are honored.`; } return 'Perhaps another time.';
    case 'autonomy':
      if (k === 0) { sim.releaseVassal(P, v); sim.setRel(P, v, 'alliance'); return `The ${vn} go free, as allies.`; }
      if (k === 1) { V.tribute = 0.1; shift(sim, v, P, 10); return 'Greater autonomy, lighter tribute.'; }
      shift(sim, v, P, -12); return `The ${vn} are refused. Whispers of rebellion begin.`;
    case 'grievance':
      if (k === 0) { V.tribute = 0.1; shift(sim, v, P, 18); return 'Your apology and lighter tribute calm them.'; }
      if (k === 1) { O.gov.pc -= 15; shift(sim, v, P, 10); return 'They will hold you to your promise.'; }
      shift(sim, v, P, -10); if (sim.power(P) > sim.power(v) * 3) return 'They bow, for now. Your strength is undeniable.'; return 'They glare in silence.';
  }
  return '';
}

// ------------------------------------------------------------------ decrees to all vassals
export const DECREES = [
  { id: 'tribute', label: 'Set tribute for all vassals', desc: 'Light tribute builds loyalty; heavy tribute fills the treasury and breeds resentment.' },
  { id: 'levies', label: 'Call the levies', desc: 'Every vassal joins one of your wars and raises troops. They resent the demand a little.' },
  { id: 'extra', label: 'Extraordinary levy', desc: 'Each vassal pays ten days of tribute at once. Unpopular.' },
  { id: 'games', label: 'Hold imperial games', desc: 'Feasts and games for the vassal courts. Costs wealth; every vassal warms to you.' },
];
function gamesCost(sim, P) { return Math.round(5 * ageScale(sim.s.nations[P].age) * sim.vassalsOf(P).length); }
function decree(sim, P, id, arg) {
  const s = sim.s, O = s.nations[P], vs = sim.vassalsOf(P);
  if (id === 'tribute') { for (const v of vs) { const V = s.nations[v]; const old = V.tribute ?? 0.25; V.tribute = arg; shift(sim, v, P, arg < old ? 6 : arg > old ? -6 : 0); } return `Tribute for all vassals set to ${Math.round(arg * 100)}%.`; }
  if (id === 'levies') {
    if (!arg) return 'Choose a war.';
    let n = 0;
    for (const v of vs) {
      const V = s.nations[v];
      if (!sim.atWar(v, arg) && v !== arg && s.nations[arg]?.overlord !== v) sim.declareWar(v, arg, true);
      const t = sim.bestFieldable(v, 'INF');
      if (t) { const r = sim.orderUnits(v, t, 2, { near: O.capital }); if (r.ok) n += 2; }
      shift(sim, v, P, -4); void V;
    }
    sim.emit('war', `The vassals of the ${sim.nm(P)} answer the call to arms against the ${sim.nm(arg)}.`, [P, arg], { major: true, loc: s.nations[arg].capital });
    return `${vs.length} vassal${vs.length === 1 ? '' : 's'} march against the ${sim.nm(arg)}, raising ${n} new units.`;
  }
  if (id === 'extra') {
    const got = {};
    for (const v of vs) { const V = s.nations[v]; for (const [k, x] of Object.entries(V.tribOut || {})) { const amt = Math.min(x * 10, Math.max(0, V[k] || 0)); V[k] -= amt; O[k] = (O[k] || 0) + amt; got[k] = (got[k] || 0) + amt; } shift(sim, v, P, -9); }
    return `Collected ${costStr(got) || 'nothing'} from the vassal courts.`;
  }
  if (id === 'games') { const c = gamesCost(sim, P); if (O.wealth < c) return `The games would cost ${c} wealth.`; O.wealth -= c; for (const v of vs) shift(sim, v, P, 7); return 'The games are a triumph. The vassal courts toast your name.'; }
  return '';
}

// ------------------------------------------------------------------ AI overlords hold court too
export function aiImperialCourt(sim, ai, c) {
  const s = sim.s, N = s.nations[c], t = N.traits;
  for (const v of sim.vassalsOf(c)) {
    const V = s.nations[v], op = sim.opinion(v, c);
    // keep restless subjects in line, squeeze loyal ones
    V.tribute = op < -25 ? 0.1 : op > 25 && t.aggression > 0.5 ? 0.4 : t.aggression < 0.3 ? 0.1 : 0.25;
    if (op < -25) shift(sim, v, c, 4);
    // defend vassals under attack
    for (const e of sim.warsOf(v)) if (!sim.atWar(c, e) && e !== c && sim.realmOf(e) !== c && Math.random() < 0.4 + t.loyalty * 0.4) { sim.declareWar(c, e); shift(sim, v, c, 10); break; }
    // license ambitious vassals to expand the empire
    if (!sim.warsOf(v).length && V.traits.aggression > 0.35 && Math.random() < 0.3 + t.aggression * 0.4) {
      const myP = sim.power(v) + 1;
      const tgt = [...new Set(sim.regionsOf(v).flatMap(r => sim.w.adj[r.i].map(j => s.regions[j].owner)))].filter(x => x && x !== c && x !== v && s.nations[x]?.alive && sim.realmOf(x) !== c && !sim.friendly(c, x))
        .map(x => ({ x, r: (sim.power(x) + 1) / myP })).sort((p, q) => p.r - q.r)[0];
      if (tgt && tgt.r < 1.4) { V.warLicense = { target: tgt.x, until: s.t + 60 * 24 }; shift(sim, v, c, 6); }
    }
  }
}

// ------------------------------------------------------------------ the chamber (UI)
export function imperialReady() { const N = G.sim?.s.nations[G.sim.s.player]; return !!N && G.sim.vassalsOf(N.code).length > 0 && (N.lastImperial === undefined || G.sim.s.t - N.lastImperial >= IMPERIAL_COOLDOWN_DAYS * 24); }
export function openImperial() {
  if (!G.sim) return;
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P];
  const vs = sim.vassalsOf(P);
  if (!vs.length) { toast('Imperial Council', 'You have no vassals to summon.', 'warn'); return; }
  if (N.lastImperial !== undefined && s.t - N.lastImperial < IMPERIAL_COOLDOWN_DAYS * 24) { toast('Imperial Council', `The vassal courts can be summoned again in ${Math.ceil((IMPERIAL_COOLDOWN_DAYS * 24 - (s.t - N.lastImperial)) / 24)} days.`, 'warn'); return; }
  N.lastImperial = s.t;
  let id = 1;
  // a varied agenda: each vassal speaks at most twice, and the same kind of request rarely repeats
  const all = vs.flatMap(v => petitionsFor(sim, G.ai, P, v).map(p => ({ ...p, jitter: Math.random() * 2 })));
  const picked = [], byKind = {}, byV = {};
  const cap = Math.min(10, vs.length * 2);
  while (picked.length < cap) {
    let best = null, bs = -Infinity;
    for (const p of all) { if (picked.includes(p) || (byV[p.v] || 0) >= 2) continue; const sc = p.score + p.jitter - (byKind[p.kind] || 0) * 5; if (sc > bs) { bs = sc; best = p; } }
    if (!best) break;
    picked.push(best); byKind[best.kind] = (byKind[best.kind] || 0) + 1; byV[best.v] = (byV[best.v] || 0) + 1;
  }
  const pets = picked.map(p => ({ ...p, id: id++, status: 'pending' }));
  G.imperial = { pets, y: s.year, decreeLog: [] };
  G.impResume = G.speed; G.fn.setSpeed(0);
  renderImperial();
  $('#imperialbox').classList.remove('hidden');
}
export function closeImperial() {
  $('#imperialbox').classList.add('hidden');
  const ok = (G.imperial?.pets || []).filter(p => p.status === 'done').length;
  if (G.imperial) G.sim.emit('vassal', `The ${councilName(G.sim.s.nations[G.sim.s.player])} adjourns. ${ok} petition${ok === 1 ? '' : 's'} answered.`, [G.sim.s.player]);
  G.imperial = null;
  if (G.impResume) G.fn.setSpeed(G.impResume);
  G.fn.refreshWorld(true); G.fn.renderPanel?.(true);
}
// semicircular chamber: seats in arcs, each vassal's block coloured, faded by disloyalty
function chamber(sim, P, vs) {
  const seatsOf = v => Math.max(3, Math.round(Math.sqrt(sim.owned.get(v)?.size || 1) * 3));
  const blocks = vs.map(v => ({ v, n: seatsOf(v) }));
  const total = blocks.reduce((a, b) => a + b.n, 0);
  const rows = total > 60 ? 5 : total > 30 ? 4 : 3;
  const radii = Array.from({ length: rows }, (_, k) => 70 + k * 22);
  const sumR = radii.reduce((a, b) => a + b, 0);
  const perRow = radii.map(r => Math.max(3, Math.round(total * r / sumR)));
  let diff = total - perRow.reduce((a, b) => a + b, 0); perRow[rows - 1] += diff;
  const seats = [];
  radii.forEach((r, k) => { for (let i = 0; i < perRow[k]; i++) { const ang = Math.PI * (1 - (i + 0.5) / perRow[k]); seats.push({ x: 180 + Math.cos(ang) * r, y: 175 - Math.sin(ang) * r, ang }); } });
  seats.sort((a, b) => b.ang - a.ang);
  let h = `<svg viewBox="0 0 360 190" class="chamber">`;
  let k = 0;
  for (const b of blocks) {
    const op = sim.opinion(b.v, P), alpha = clamp(0.35 + (op + 50) / 100, 0.3, 1);
    for (let i = 0; i < b.n && k < seats.length; i++, k++) h += `<circle cx="${seats[k].x.toFixed(1)}" cy="${seats[k].y.toFixed(1)}" r="5.2" fill="${sim.s.nations[b.v].color}" fill-opacity="${alpha.toFixed(2)}" stroke="#0b1220" stroke-width="1"><title>${esc(sim.full(b.v))}: loyalty ${Math.round(op)}</title></circle>`;
  }
  const O = sim.s.nations[P];
  h += `<circle cx="180" cy="170" r="17" fill="${O.color}" stroke="#e9c46a" stroke-width="2"/><text x="180" y="176" text-anchor="middle" font-size="17" fill="#fff">${isSenate(O) ? '⚖' : '♛'}</text></svg>`;
  return h;
}
function renderImperial() {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], I = G.imperial;
  const vs = sim.vassalsOf(P);
  const wars = sim.warsOf(P);
  const name = councilName(N);
  let h = `<div class="meet-head"><div><div class="kicker">${dstr(I.y)} · ${esc(sim.full(P))}</div><h2>The ${name} convenes</h2><div class="small muted">${vs.length} vassal${vs.length === 1 ? '' : 's'} answer the summons. ${isSenate(N) ? 'Senators of the subject peoples take their seats.' : 'The lords of the realm bend the knee before the throne.'} Every answer shapes their loyalty.</div></div><button class="btn go" id="imp-close">Adjourn</button></div>
  <div class="imp-grid"><div>${chamber(sim, P, vs)}
    <div class="imp-roll">${vs.map(v => { const V = s.nations[v], op = Math.round(sim.opinion(v, P)); return `<div class="row"><span><span class="flagchip" style="background:${V.color}"></span><b>${esc(sim.full(v))}</b> <span class="small muted">· ${sim.owned.get(v)?.size || 0} lands · ${Math.round((V.tribute ?? 0.25) * 100)}% tribute</span></span><span class="small ${op >= 20 ? 'pos' : op <= -20 ? 'neg' : 'muted'}">${op >= 40 ? 'devoted' : op >= 15 ? 'loyal' : op > -15 ? 'wary' : op > -40 ? 'resentful' : 'mutinous'} (${op})</span></div>`; }).join('')}</div>
    <div class="sec-title" style="margin-top:12px">Decrees to all vassals</div>
    <div class="decree"><div><b>${DECREES[0].label}</b><div class="small muted">${DECREES[0].desc}</div></div><div class="actions" style="grid-template-columns:repeat(3,1fr)">${[[0.1, 'Light 10%'], [0.25, 'Standard 25%'], [0.4, 'Heavy 40%']].map(([v, l]) => `<button class="btn sm" data-dec="tribute" data-arg="${v}">${l}</button>`).join('')}</div></div>
    <div class="decree"><div><b>${DECREES[1].label}</b><div class="small muted">${DECREES[1].desc}</div></div>${wars.length ? `<div class="actions" style="grid-template-columns:1fr auto"><select class="inp sm" id="imp-war">${wars.map(e => `<option value="${e}">against the ${esc(sim.nm(e))}</option>`).join('')}</select><button class="btn sm" data-dec="levies">Call them</button></div>` : '<div class="small muted">You are at peace.</div>'}</div>
    <div class="decree"><div><b>${DECREES[2].label}</b><div class="small muted">${DECREES[2].desc}</div></div><button class="btn sm" data-dec="extra">Demand it</button></div>
    <div class="decree"><div><b>${DECREES[3].label}</b><div class="small muted">${DECREES[3].desc} (${gamesCost(sim, P)} wealth)</div></div><button class="btn sm" data-dec="games" ${N.wealth >= gamesCost(sim, P) ? '' : 'disabled'}>Hold the games</button></div>
    ${I.decreeLog.map(x => `<div class="small pos" style="margin-top:4px">✓ ${esc(x)}</div>`).join('')}
  </div><div>
    <div class="sec-title">Petitions (${I.pets.filter(p => p.status === 'pending').length} awaiting your word)</div>
    ${I.pets.length ? I.pets.map(p => { const V = s.nations[p.v]; return `<div class="petition ${p.status}" style="--vc:${V.color}"><div class="pt-head"><span class="flagchip" style="background:${V.color}"></span><b>${esc(p.title)}</b></div><div class="pt-text">${esc(p.text)}</div>${p.status === 'pending' ? `<div class="pa">${p.opts.map((o, k) => `<button class="btn sm ${o.cls || (k === 0 ? 'go' : '')}" data-pet="${p.id}" data-opt="${k}" ${o.disabled ? `disabled title="${esc(o.why || '')}"` : ''}>${esc(o.label)}</button>`).join('')}</div>` : `<div class="res muted">${esc(p.result || '')}</div>`}</div>`; }).join('') : '<div class="muted small">No vassal brings a petition today. All is quiet in the realm.</div>'}
  </div></div>`;
  $('#imperial-card').innerHTML = h;
  $('#imp-close').onclick = closeImperial;
  for (const b of document.querySelectorAll('#imperial-card [data-pet]')) b.onclick = () => {
    const p = I.pets.find(x => x.id === +b.dataset.pet); if (!p || p.status !== 'pending') return;
    p.result = resolve(sim, G.ai, P, p, +b.dataset.opt); p.status = 'done'; renderImperial();
  };
  for (const b of document.querySelectorAll('#imperial-card [data-dec]')) b.onclick = () => {
    const id = b.dataset.dec; const arg = id === 'tribute' ? +b.dataset.arg : id === 'levies' ? $('#imp-war')?.value : null;
    const r = decree(sim, P, id, arg); I.decreeLog.push(r); toast(name, r, 'good'); renderImperial();
  };
}
void UNITS; void AGES;
