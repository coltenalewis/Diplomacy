import fs from 'fs';
import { World } from '../public/js/world.js';
import { Sim } from '../public/js/sim.js';
import { AI } from '../public/js/ai.js';
const json = JSON.parse(fs.readFileSync(new URL('../public/data/map.json', import.meta.url)));
const geo = JSON.parse(fs.readFileSync(new URL('../public/data/geo.json', import.meta.url)));
const w = new World(json); const sim = new Sim(w, geo, { player: 'DEU' }); const ai = new AI(sim);
sim.setRel('DEU', 'POL', 'peace'); sim.declareWar('DEU', 'POL');
const g = { id: 1, nation: 'DEU', name: '1st Army', general: sim.s.nations.DEU.generals[0], units: sim.unitsOf('DEU').map(u => u.id), order: { type: 'attack', target: 'POL' } };
sim.s.groups.push(g);
const kinds = {}; const phases = {};
for (let h = 0; h < 24 * 14; h++) {
  sim.step(); ai.hourly();
  for (const s of sim.shots) kinds[s.k] = (kinds[s.k] || 0) + 1; sim.shots.length = 0;
  for (const u of sim.s.units) if (u.air) phases[u.air.phase] = (phases[u.air.phase] || 0) + 1;
  if (h % 48 === 47) console.log('day', (h + 1) / 24, 'status:', g.status, '| POL regions', sim.regionsOf('POL').length, 'DEU units', sim.unitsOf('DEU').length, 'POL units', sim.unitsOf('POL').length);
}
console.log('shots', kinds); console.log('air phase-hours', phases);
// nuclear test
sim.s.nations.DEU.warheads = 1; sim.s.nations.DEU.techs.aer3 = 1;
const tgt = sim.regionsOf('POL')[0];
console.log('nuke', tgt && sim.w.regions[tgt.i].name, JSON.stringify(tgt ? sim.nuke('DEU', tgt.i) : null), 'scars', sim.s.scars.length);
console.log(sim.s.events.filter(e => ['nuke', 'capture', 'war', 'treaty'].includes(e.kind)).slice(-12).map(e => e.text).join('\n'));
