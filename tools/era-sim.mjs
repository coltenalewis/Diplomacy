// Headless world run: node tools/era-sim.mjs [days] [civs] [startAge]
// Every civilization (including C0) is AI-controlled. Prints progress through the ages.
import fs from 'fs';
import { World } from '../public/js/world.js';
import { Sim } from '../public/js/sim.js';
import { AI } from '../public/js/ai.js';
import { AGES, yearStr } from '../public/js/eras.js';
import { TECHS, TECH } from '../public/js/tech.js';
import { UNITS, BUILDINGS, WONDERS, SETTLEMENTS } from '../public/js/units.js';
import { IMPROVEMENTS } from '../public/js/resources.js';
import { GOV_TYPES, LAWS } from '../public/js/gov.js';

const json = JSON.parse(fs.readFileSync(new URL('../public/data/tiles.json', import.meta.url)));
const geo = JSON.parse(fs.readFileSync(new URL('../public/data/tilegeo.json', import.meta.url)));
const days = +(process.argv[2] || 200), civs = +(process.argv[3] || 24), startAge = +(process.argv[4] || 0);

// ---- data integrity: every referenced technology exists
const ids = new Set(TECHS.map(t => t.id));
const refs = [];
for (const t of TECHS) for (const r of t.req) refs.push([r, 'req of ' + t.id]);
for (const U of Object.values(UNITS)) if (U.tech) refs.push([U.tech, 'unit ' + U.id]);
for (const [k, B] of Object.entries(BUILDINGS)) for (const L of B.levels) refs.push([L[1], 'building ' + k]);
for (const [k, W] of Object.entries(WONDERS)) refs.push([W.tech, 'wonder ' + k]);
for (const S of SETTLEMENTS) if (S.tech) refs.push([S.tech, 'settlement ' + S.name]);
for (const [k, I] of Object.entries(IMPROVEMENTS)) if (I.tech) refs.push([I.tech, 'improvement ' + k]);
for (const [k, G] of Object.entries(GOV_TYPES)) if (G.tech) refs.push([G.tech, 'gov ' + k]);
for (const [k, L] of Object.entries(LAWS)) { if (L.req?.tech) refs.push([L.req.tech, 'law ' + k]); for (const o of L.opts) { if (o.req?.tech) refs.push([o.req.tech, 'law ' + k + '.' + o.id]); if (o.req?.notTech) refs.push([o.req.notTech, 'law ' + k + '.' + o.id]); } }
const missing = refs.filter(([r]) => !ids.has(r));
for (const t of TECHS) for (const r of t.req) if (TECH[r] && TECH[r].age > t.age) missing.push([r, `prereq from a later age for ${t.id}`]);
console.log(`techs ${TECHS.length}, per age: ${AGES.map((_, a) => TECHS.filter(t => t.age === a).length).join('/')}; missing refs: ${missing.length ? missing.map(m => m.join(' <- ')).join(', ') : 'none'}`);

const w = new World(json);
const t0 = Date.now();
const sim = new Sim(w, geo, { civs, startAge, seed: 7 });
const ai = new AI(sim);
sim.s.nations.C0.ai = true;
console.log(`init ${Date.now() - t0}ms; civs ${Object.keys(sim.s.nations).length}; land tiles ${sim.landIdx.length}`);
const terr = {}; for (const i of sim.landIdx) terr[sim.T[i].terrain] = (terr[sim.T[i].terrain] || 0) + 1;
console.log('terrain', JSON.stringify(terr));
const depc = {}; for (const i of sim.landIdx) for (const d of sim.s.regions[i].dep) depc[d.r] = (depc[d.r] || 0) + 1;
console.log('deposits', Object.entries(depc).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + v).join(' '));
let events = {};
sim.on(e => { events[e.kind] = (events[e.kind] || 0) + 1; if (['age', 'wonder', 'formed', 'war', 'gov', 'rise', 'vassal', 'faith', 'terror', 'disaster'].includes(e.kind) && (e.major || e.kind !== 'gov')) console.log(`   [${yearStr(e.y)}] ${e.text}`); });
const show = d => {
  const N = Object.values(sim.s.nations).filter(n => n.alive);
  const ages = {}; for (const n of N) ages[n.age] = (ages[n.age] || 0) + 1;
  const top = N.sort((a, b) => sim.score(b.code) - sim.score(a.code)).slice(0, 4);
  console.log(`day ${d} ${yearStr(sim.s.year)} | alive ${N.length} ages ${JSON.stringify(ages)} | claimed ${sim.landIdx.filter(i => sim.s.regions[i].owner).length}/${sim.landIdx.length} | units ${sim.s.units.length} wars ${Object.values(sim.s.rel).filter(v => v === 'war').length} trades ${sim.s.trades.length}`);
  for (const n of top) {
    const st = n.st;
    console.log(`   ${sim.full(n.code).padEnd(34)} ${AGES[n.age].short.padEnd(11)} tiles ${String(st.tiles).padStart(3)} pop ${st.pop.toFixed(1).padStart(8)}k techs ${Object.keys(n.techs).length} rp ${st.rp.toFixed(2)} | food ${n.food.toFixed(0)} (${st.net.food.toFixed(2)}) wood ${n.wood.toFixed(0)} stone ${n.stone.toFixed(0)} metal ${n.metal.toFixed(0)} wealth ${n.wealth.toFixed(0)} (${st.net.wealth.toFixed(2)}) units ${st.units} q ${n.queue.length} lvls ${sim.regionsOf(n.code).map(r => r.lvl).join('')}`);
  }
};
const t1 = Date.now();
for (let d = 1; d <= days; d++) {
  for (let h = 0; h < 24; h++) { sim.step(); ai.hourly(); }
  if (d % Math.max(1, Math.floor(days / 12)) === 0 || d === days) show(d);
  if (sim.s.over && sim.s.winType === 'defeat') { const alive = Object.values(sim.s.nations).filter(n => n.alive); sim.s.player = alive[0].code; sim.s.over = false; console.log('   (observer civilization fell; now watching', alive[0].name + ')'); }
  if (sim.s.over) { console.log('GAME OVER', sim.s.winType, sim.s.winner); break; }
}
console.log(`ran ${days} days in ${Date.now() - t1}ms (${((Date.now() - t1) / days / 24).toFixed(2)} ms/hour)`);
console.log('events', JSON.stringify(events));
const C0 = sim.s.nations.C0;
console.log('C0 buildings', JSON.stringify(sim.regionsOf('C0').map(r => ({ n: w.regions[r.i].name, lvl: r.lvl, pop: +r.pop.toFixed(1), imp: r.imp, bld: r.bld }))).slice(0, 1500));
for (const n of Object.values(sim.s.nations).filter(n => n.alive).sort((a, b) => b.age - a.age).slice(0, 5)) { const ch = sim.canAdvance(n.code); console.log('ADV', n.name, n.age, ch.ok, ch.why, JSON.stringify(ch.cost || {}), 'stock', ['food','wood','stone','metal','wealth','oil'].map(k => k + ':' + Math.round(n[k])).join(' '), 'prod', JSON.stringify(Object.fromEntries(Object.entries(n.st.prod).map(([k, v]) => [k, +v.toFixed(1)]))), 'access', Object.keys(n.access).join(',')); }
console.log('C0 techs', Object.keys(C0.techs).join(' '));
console.log('C0 queue', C0.queue.map(q => q.type + ':' + q.status).join(' '), 'access', JSON.stringify(C0.access), 'gov', C0.gov.type);
const vass = Object.values(sim.s.nations).filter(n => n.alive && n.overlord);
console.log('vassals alive:', vass.map(v => `${v.name}->${sim.s.nations[v.overlord].name} (${Math.round((v.tribute ?? 0.25) * 100)}%, pays ${Object.entries(v.tribOut || {}).map(([k, x]) => k + ' ' + x.toFixed(2)).join(' ')})`).join('; ') || 'none');
const realms = Object.values(sim.s.nations).filter(n => n.alive && !n.overlord).map(n => { const vs = sim.vassalsOf(n.code); return { n, vs, tiles: (sim.owned.get(n.code)?.size || 0) + vs.reduce((a, v) => a + (sim.owned.get(v)?.size || 0), 0) }; }).sort((a, b) => b.tiles - a.tiles).slice(0, 6);
console.log('largest empires:'); for (const r of realms) console.log(`   ${sim.full(r.n.code).padEnd(32)} ${String(r.tiles).padStart(4)} lands (${r.vs.length} vassals: ${r.vs.map(v => sim.nm(v)).join(', ')}) wars: ${sim.warsOf(r.n.code).map(e => sim.nm(e)).join(', ') || '-'}`);
const lic = Object.values(sim.s.nations).filter(n => n.alive && n.warLicense).length;
console.log('vassals at war under license:', lic);
// ---- society
{
  const s = sim.s, fc = {}, cc = {};
  for (const i of sim.landIdx) { const r = s.regions[i]; const p = r.owner ? r.pop : (r.natives || 0); fc[r.rel] = (fc[r.rel] || 0) + p; if (r.owner) cc[r.cul === s.nations[r.owner].cul ? 'own' : 'minority'] = (cc[r.cul === s.nations[r.owner].cul ? 'own' : 'minority'] || 0) + 1; }
  const top = Object.entries(fc).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${s.faiths[k]?.name} [${s.faiths[k]?.kind}] ${v.toFixed(0)}k`);
  console.log('faiths', Object.keys(s.faiths).length, '| top:', top.join('; '));
  console.log('owned tiles by culture', JSON.stringify(cc), '| movements', s.movements.length, s.movements.slice(0, 6).map(M => `${M.name} (${M.kind}, ${sim.nm(M.nation)}, ${M.str.toFixed(2)}${M.sponsor ? ', backed by ' + sim.nm(M.sponsor) : ''})`).join('; '));
  const rev = s.regions.filter(r => r.revolt);
  const alive = Object.values(s.nations).filter(n => n.alive);
  console.log('revolts now', rev.length, '| governors', alive.reduce((a, n) => a + Object.keys(n.governors || {}).length, 0), '| mayors', s.regions.filter(r => r.mayor).length, '| chars', Object.keys(s.chars).length, '| avg unrest', (alive.reduce((a, n) => a + (n.st.unrestW || 0), 0) / alive.length).toFixed(3));
}
// ---- pressure and crises
{
  const s = sim.s, alive = Object.values(s.nations).filter(n => n.alive);
  const over = alive.filter(n => (n.adminOver || 0) > 0);
  console.log('overextended', over.length, '/', alive.length, '| max over', Math.max(0, ...alive.map(n => n.adminOver || 0)), '| infamous (>12)', alive.filter(n => (n.infamy || 0) > 12).map(n => n.name + ' ' + Math.round(n.infamy)).join(', '));
  console.log('coalitions', (s.coalitions || []).map(C => `vs ${sim.nm(C.target)}: ${C.members.length} members`).join('; ') || 'none', '| crises', (s.crises || []).map(C => C.name).join(', ') || 'none', '| plague', s.plague ? s.plague.name + ' ' + Object.keys(s.plague.inf).length + ' lands' : 'none');
}
