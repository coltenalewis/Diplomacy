// Headless check of reputation and pacts: node tools/pact-sim.mjs [days] [civs] [startAge]
import fs from 'fs';
import { World } from '../public/js/world.js';
import { Sim } from '../public/js/sim.js';
import { AI } from '../public/js/ai.js';
import { REP, DOCTRINES, repTags } from '../public/js/pacts.js';

const json = JSON.parse(fs.readFileSync(new URL('../public/data/tiles.json', import.meta.url)));
const geo = JSON.parse(fs.readFileSync(new URL('../public/data/tilegeo.json', import.meta.url)));
const days = +(process.argv[2] || 500), civs = +(process.argv[3] || 40), startAge = +(process.argv[4] || 3);
const sim = new Sim(new World(json), geo, { civs, startAge, seed: 11 });
const ai = new AI(sim);
sim.s.nations.C0.ai = true;
const t0 = Date.now();
let wars = 0; sim.on(e => { if (e.kind === 'war') wars++; });
for (let h = 0; h < days * 24; h++) { sim.step(); ai.hourly(); }
const s = sim.s;
console.log(`${days} days in ${((Date.now() - t0) / 1000).toFixed(1)}s, ${wars} war events, ${Object.values(s.nations).filter(n => n.alive).length} alive`);
console.log(`pacts: ${s.pacts.length}`);
for (const P of s.pacts) {
  console.log(`- ${P.name} [${P.preset}] chair ${sim.nm(P.chair)}; ${P.members.length} members; ${Object.keys(P.doctrines).map(d => DOCTRINES[d].short).join(', ')}`);
  for (const L of P.log.slice(0, 4)) console.log(`    ${L.passed ? 'PASSED' : 'failed'} ${L.yes}-${L.no}-${L.abst}: ${L.text} -> ${L.outcome}`);
}
const reps = {}; for (const N of Object.values(s.nations)) for (const r of repTags(N)) reps[r.tag] = (reps[r.tag] || 0) + 1;
console.log('reputations held:', Object.entries(reps).map(([k, v]) => `${REP[k].name} ${v}`).join(', ') || 'none');
const ex = Object.values(s.nations).filter(n => n.alive && repTags(n).length).slice(0, 5);
for (const N of ex) console.log(`  ${sim.nm(N.code)}: ${repTags(N).map(r => `${REP[r.tag].name} ${Math.round(r.v)}`).join(', ')}`);
// how reputation colours opinion: a sample of the largest effects
const fx = [];
for (const a of Object.values(s.nations)) for (const b of Object.values(s.nations)) if (a.alive && b.alive && a !== b) { const raw = sim.rawOpinion(a.code, b.code), full = sim.opinion(a.code, b.code); if (Math.abs(full - raw) > 8) fx.push(`${sim.nm(a.code)}->${sim.nm(b.code)} ${raw.toFixed(0)}=>${full.toFixed(0)}`); }
console.log(`opinion pairs shifted >8 by reputation/pacts: ${fx.length}; e.g. ${fx.slice(0, 4).join('; ')}`);
