// Headless check of the 1939 scenario: node tools/ww2-check.mjs [nation] [days]
import fs from 'fs';
import { World } from '../public/js/world.js';
import { Sim } from '../public/js/sim.js';
import { AI } from '../public/js/ai.js';
import { dateStr } from '../public/js/eras.js';
import { UNITS } from '../public/js/units.js';
const json = JSON.parse(fs.readFileSync(new URL('../public/data/tiles.json', import.meta.url)));
const geo = JSON.parse(fs.readFileSync(new URL('../public/data/tilegeo.json', import.meta.url)));
const country = process.argv[2] || 'United Kingdom', days = +(process.argv[3] || 0);
const t0 = Date.now();
const sim = new Sim(new World(json), geo, { country, seed: 3, scenario: 'ww2' });
const s = sim.s, P = s.player;
console.log(`built in ${Date.now() - t0}ms; ${Object.keys(s.nations).length} nations; player ${sim.full(P)}; ${dateStr(s.year)}; units ${s.units.length}; pacts ${s.pacts.map(p => p.name + '(' + p.members.length + ')').join(' ')}`);
const row = c => { const N = s.nations[c], st = N.st; const us = s.units.filter(u => u.nation === c); return `${sim.nm(c).padEnd(15)} pop ${(st.pop / 1000).toFixed(0).padStart(4)}M (${N.popM}) lands ${String(st.tiles).padStart(3)} units ${String(us.length).padStart(3)} [${[...new Set(us.map(u => UNITS[u.type].name))].slice(0, 5).join(',')}] w ${(N.wealth).toFixed(0)} +${(st.net?.wealth || 0).toFixed(1)}/d metal +${(st.net?.metal || 0).toFixed(1)} food +${(st.net?.food || 0).toFixed(1)} oil ${(N.oil||0).toFixed(0)} +${(st.net?.oil || 0).toFixed(1)} rp ${(st.rp || 0).toFixed(0)} exh ${N.exhaustion.toFixed(2)} guilt ${(N.guilt||0).toFixed(0)}${N.occupied ? ' OCCUPIED' : ''}${N.alive ? '' : ' DEAD'}`; };
const KEYS = ['Germany', 'United Kingdom', 'France', 'Poland', 'Soviet Union', 'Italy', 'Japan', 'China', 'United States', 'Finland'];
const code = k => s.ww2.code[k];
for (const k of KEYS) console.log(row(code(k)));
console.log('wars:', Object.entries(s.rel).filter(([, v]) => v === 'war').map(([k]) => k.split('|').map(c => sim.nm(c)).join('-')).join('; '));
if (days) {
  const ai = new AI(sim); const t1 = Date.now();
  s.nations[P].ai = true;
  const seen = new Set();
  for (let h = 0; h < days * 24; h++) {
    sim.step(); ai.hourly();
    if (s.pendingEvent) { const { resolveEvent } = await import('../public/js/gov.js'); resolveEvent(sim, s.nations[P], s.pendingEvent, 0); s.pendingEvent = null; }
    if (h % (24 * 30) === 0) { const ws = Object.entries(s.rel).filter(([, v]) => v === 'war').length; process.stdout.write(`${dateStr(s.year)} wars ${ws} | `); }
  }
  console.log(`\n${days} days in ${((Date.now() - t1) / 1000).toFixed(1)}s -> ${dateStr(s.year)}`);
  for (const k of KEYS) console.log(row(code(k)));
  console.log('fired:', Object.entries(s.ww2.fired).map(([k, v]) => `${k}:${v}`).join(' '));
  console.log('beaten:', s.ww2.beaten.map(b => `${sim.nm(b.c)} by ${sim.nm(b.by)} ${dateStr(s.startYear + b.t / 24 / 365)}`).join('; '));
  console.log('crimes:', s.ww2.log.slice(-10).map(l => l.text).join(' | '));
  console.log('major:', s.events.filter(e => e.major).slice(-25).map(e => e.text).join('\n  '));
}
