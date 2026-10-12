import fs from 'fs';
import { WorldMap, newGame, processMovement, processRetreats, processBuilds, countAll } from '../public/js/engine.js';
import { valueMaps, heuristicOrders, planOrders, planRetreats, planBuilds, chooseDisbands } from '../public/js/ai.js';
import { POWERS, POWER_IDS, DIFFICULTY } from '../public/js/data.js';
const map = new WorldMap(JSON.parse(fs.readFileSync(new URL('../public/data/map.json', import.meta.url))));
const level = DIFFICULTY[process.argv[2] || 'veteran'];
const years = +(process.argv[3] || 10);
let s = newGame(map);
const ctxOf = p => ({ power: p, hostility: Object.fromEntries(POWER_IDS.map(q => [q, 1])), banned: [], locked: {}, traits: POWERS[p].traits });
const t0 = Date.now();
let phases = 0;
while (s.year < 2030 + years && !s.winner) {
  phases++;
  const tp = Date.now();
  if (s.phase === 'orders') {
    const vms = {}, predicted = {};
    for (const p of POWER_IDS) { vms[p] = valueMaps(map, s, ctxOf(p)); Object.assign(predicted, heuristicOrders(map, s, ctxOf(p), vms[p], 1)); }
    const orders = {};
    for (const p of POWER_IDS) Object.assign(orders, planOrders(map, s, ctxOf(p), vms[p], predicted, level));
    s = processMovement(map, s, orders);
    const r = s.lastResults; const mv = r.orders.filter(o => o.type === 'M'); const sup = r.orders.filter(o => o.type === 'S').length; const cv = r.orders.filter(o => o.type === 'C').length;
    console.log(`${r.season}${r.year} moves ${mv.filter(o => o.ok).length}/${mv.length} sup ${sup} conv ${cv} disl ${r.dislodged.length}  ${Date.now() - tp}ms`);
  } else if (s.phase === 'retreats') {
    const rt = {};
    for (const p of POWER_IDS) Object.assign(rt, planRetreats(map, s, ctxOf(p), valueMaps(map, s, ctxOf(p))));
    s = processRetreats(map, s, rt);
  } else {
    const b = {}, d = {};
    for (const p of POWER_IDS) { const r = planBuilds(map, s, ctxOf(p), valueMaps(map, s, ctxOf(p))); b[p] = r.builds; d[p] = r.disbands; }
    s = processBuilds(map, s, b, d, (p, k, ch) => chooseDisbands(map, s, ctxOf(p), valueMaps(map, s, ctxOf(p)), k, ch));
    const c = countAll(s);
    console.log(`  WINTER ${s.year - 1}: ` + POWER_IDS.map(p => `${p}:${c[p] || 0}/${s.units.filter(u => u.power === p).length}`).join(' ') + `  neutral:${Object.values(s.sc).filter(x => !x).length}`);
  }
}
console.log('done', phases, 'phases', (Date.now() - t0) + 'ms', 'winner', s.winner);
