import fs from 'fs';
import { World } from '../public/js/world.js';
import { Sim } from '../public/js/sim.js';
import { AI } from '../public/js/ai.js';
const json = JSON.parse(fs.readFileSync(new URL('../public/data/map.json', import.meta.url)));
const geo = JSON.parse(fs.readFileSync(new URL('../public/data/geo.json', import.meta.url)));
const w = new World(json); const sim = new Sim(w, geo, { player: 'DEU' }); const ai = new AI(sim);
sim.setRel('DEU', 'POL', 'peace'); sim.declareWar('DEU', 'POL');
const B = w.byId.BER.i, WAR = w.byId.WAR.i;
const bmb = [sim.spawn('DEU', 'BMB', B), sim.spawn('DEU', 'BMB', B)];
const ftrP = [sim.spawn('POL', 'FTR', WAR), sim.spawn('POL', 'FTR', WAR)];
for (const u of bmb) u.mission = { strike: WAR };
for (let h = 0; h < 30; h++) {
  sim.step(); ai.hourly();
  const k = {}; for (const s of sim.shots) k[s.k] = (k[s.k] || 0) + 1; sim.shots.length = 0;
  console.log('h' + h, bmb.map(u => `${u.air.phase}@${u.pos.map(x => x.toFixed(1))} hp${u.hp | 0}`).join(' | '), '||', ftrP.map(u => `${u.air.phase} hp${u.hp | 0}`).join(' '), JSON.stringify(k), 'warsaw dmg', sim.s.regions[WAR].damage.toFixed(2));
}
