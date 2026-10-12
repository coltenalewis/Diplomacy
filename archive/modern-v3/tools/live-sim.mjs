// Headless real-time simulation run: node tools/live-sim.mjs [days] [player]
import fs from 'fs';
import { World } from '../public/js/world.js';
import { Sim } from '../public/js/sim.js';
import { AI } from '../public/js/ai.js';
import { NATIONS } from '../public/js/nations.js';
const json = JSON.parse(fs.readFileSync(new URL('../public/data/map.json', import.meta.url)));
const geo = JSON.parse(fs.readFileSync(new URL('../public/data/geo.json', import.meta.url)));
const days = +(process.argv[2] || 0), player = process.argv[3] || 'USA';
const w = new World(json);
// coverage check
const owned = new Set(NATIONS.flatMap(n => n.regions));
const missing = w.regions.filter(r => !r.sea && !owned.has(r.id)).map(r => r.id);
const dup = NATIONS.flatMap(n => n.regions).filter((x, i, a) => a.indexOf(x) !== i);
const bad = NATIONS.flatMap(n => n.regions).filter(id => !w.byId[id]);
console.log('nations', NATIONS.length, 'unassigned', missing.join(' ') || 'none', 'dup', dup.join(' ') || 'none', 'bad', bad.join(' ') || 'none');
const sim = new Sim(w, geo, { player });
const ai = new AI(sim);
const show = codes => {
  for (const c of codes) {
    const N = sim.s.nations[c], st = N.st;
    console.log(`${c.padEnd(4)} pop ${st.pop.toFixed(0).padStart(5)}M inc ${st.income.toFixed(0).padStart(5)} upk ${st.upkeep.toFixed(0).padStart(4)} food ${st.foodNet.toFixed(0).padStart(5)} en ${st.energyNet.toFixed(0).padStart(5)} eF ${st.eF.toFixed(2)} $${N.money.toFixed(0).padStart(6)} units ${st.units} regions ${st.regions} wars ${sim.warsOf(c).length}`);
  }
};
const majors = ['USA', 'CHN', 'IND', 'RUS', 'BRA', 'DEU', 'JPN', 'GBR', 'FRA', 'NGA', 'EGY', 'SAU', 'IDN', 'AUS', 'CAN'];
show(majors);
const tot = Object.values(sim.s.nations).reduce((a, n) => a + n.st.pop, 0);
console.log('world pop', tot.toFixed(0), 'units', sim.s.units.length);
const t0 = Date.now();
for (let h = 0; h < days * 24; h++) { sim.step(); ai.hourly(); }
if (days) {
  console.log(`--- after ${days} days (${Date.now() - t0}ms, ${((Date.now() - t0) / (days * 24)).toFixed(2)} ms/hour)`);
  show(majors);
  const kinds = {}; for (const e of sim.s.events) kinds[e.kind] = (kinds[e.kind] || 0) + 1;
  console.log(kinds, 'units', sim.s.units.length, 'trades', sim.s.trades.length, 'wars', Object.values(sim.s.rel).filter(v => v === 'war').length, 'alive', Object.values(sim.s.nations).filter(n => n.alive).length);
  console.log(sim.s.events.filter(e => ['war', 'peace', 'capture', 'treaty'].includes(e.kind)).slice(-25).map(e => `d${(e.t / 24) | 0} ${e.text}`).join('\n'));
}
