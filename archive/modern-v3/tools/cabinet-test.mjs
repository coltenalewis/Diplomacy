// Compare advice from a skilled vs an incompetent cabinet in the same situation.
import fs from 'fs';
import { World } from '../public/js/world.js';
import { Sim } from '../public/js/sim.js';
import { AI } from '../public/js/ai.js';
import { convene, execute } from '../public/js/cabinet.js';
const json = JSON.parse(fs.readFileSync(new URL('../public/data/map.json', import.meta.url)));
const geo = JSON.parse(fs.readFileSync(new URL('../public/data/geo.json', import.meta.url)));
const w = new World(json); const sim = new Sim(w, geo, { player: process.argv[2] || 'IND' }); const ai = new AI(sim);
for (let h = 0; h < 24 * 30; h++) { sim.step(); ai.hourly(); sim.shots.length = 0; }
const N = sim.s.nations[sim.s.player];
sim.setRel(N.code, 'PAK', 'peace'); sim.declareWar('PAK', N.code);
for (const skill of [9, 2]) {
  for (const id of Object.values(N.gov.cabinet)) { sim.s.chars[id].skill = skill; sim.s.chars[id].traits = ['Loyalist']; }
  N.lastCabinet = undefined;
  const r = convene(sim, ai, N);
  console.log(`\n===== cabinet with skill ${skill}: ${r.agenda.length} proposals =====`);
  for (const p of r.agenda) console.log(`[${p.role}] ${p.title}${p.cost ? ' ($' + p.cost + 'M)' : ''}\n      ${p.why}`);
  if (skill === 9) { const ok = r.agenda.filter(p => p.kind !== 'info').map(p => execute(sim, ai, N, p)); console.log('\nexecuted:', ok.map(x => (x.ok ? 'OK ' : 'FAIL ') + x.msg).join('\n          ')); }
}
