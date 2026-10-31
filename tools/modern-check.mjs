// Headless check of the 2025 world: node tools/modern-check.mjs [country] [days]
import fs from 'fs';
import { World } from '../public/js/world.js';
import { Sim } from '../public/js/sim.js';
import { AI } from '../public/js/ai.js';
import { dateStr } from '../public/js/eras.js';
const json = JSON.parse(fs.readFileSync(new URL('../public/data/tiles.json', import.meta.url)));
const geo = JSON.parse(fs.readFileSync(new URL('../public/data/tilegeo.json', import.meta.url)));
const country = process.argv[2] || 'France', days = +(process.argv[3] || 0);
const t0 = Date.now();
const sim = new Sim(new World(json), geo, { country, seed: 3 });
const s = sim.s, P = s.player;
console.log(`built in ${Date.now() - t0}ms; ${Object.keys(s.nations).length} nations; player ${sim.full(P)}; ${dateStr(s.year)}; units ${s.units.length}; pacts ${s.pacts.length}`);
const row = c => { const N = s.nations[c], st = N.st; return `${sim.nm(c).padEnd(15)} pop ${(st.pop / 1000).toFixed(0).padStart(5)}M (real ${N.popM}M) lands ${String(st.tiles).padStart(3)} lvl ${Math.max(...sim.regionsOf(c).map(r => r.lvl))} units ${s.units.filter(u => u.nation === c).length} nukes ${N.warheads} wealth+${(st.net?.wealth || 0).toFixed(1)}/d rp ${(st.rp || 0).toFixed(0)} gov ${N.gov.type} faith ${s.faiths[N.faith]?.name}`; };
for (const n of ['United States', 'China', 'Russia', 'India', 'France', 'Germany', 'Japan', 'Brazil', 'Nigeria', 'Israel', 'Singapore', 'Ukraine']) { const c = Object.keys(s.nations).find(k => s.nations[k].name === n); if (c) console.log(row(c)); else console.log('MISSING', n); }
console.log('wars:', Object.entries(s.rel).filter(([, v]) => v === 'war').map(([k]) => k.split('|').map(c => sim.nm(c)).join(' vs ')).join('; '));
console.log('pacts:', s.pacts.map(p => `${p.key}(${p.members.length})${p.veto ? ' veto:' + p.veto.map(c => sim.nm(c)).join('/') : ''}`).join(' '));
if (days) {
  const ai = new AI(sim); const t1 = Date.now(); let wars = 0; sim.on(e => { if (e.kind === 'war') wars++; });
  s.nations[P].ai = true;
  for (let h = 0; h < days * 24; h++) { sim.step(); ai.hourly(); }
  console.log(`${days} days in ${((Date.now() - t1) / 1000).toFixed(1)}s -> ${dateStr(s.year)}; ${wars} war events; alive ${Object.values(s.nations).filter(n => n.alive).length}`);
  for (const n of ['United States', 'China', 'Russia', 'France', 'Ukraine']) { const c = Object.keys(s.nations).find(k => s.nations[k].name === n); if (c) console.log(row(c)); }
  console.log('recent:', s.events.slice(-8).map(e => e.text).join(' | ').slice(0, 900));
}
