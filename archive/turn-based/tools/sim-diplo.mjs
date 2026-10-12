import fs from 'fs';
import { WorldMap, newGame, processMovement, processRetreats, processBuilds, countAll } from '../public/js/engine.js';
import { valueMaps, heuristicOrders, planOrders, planRetreats, planBuilds, chooseDisbands } from '../public/js/ai.js';
import { POWER_IDS, DIFFICULTY } from '../public/js/data.js';
import * as D from '../public/js/diplomacy.js';
const map = new WorldMap(JSON.parse(fs.readFileSync(new URL('../public/data/map.json', import.meta.url))));
const level = DIFFICULTY.veteran;
let s = newGame(map);
const d = D.initDiplomacy('GER');
let toPlayer = 0;
while (s.year < 2042 && !s.winner) {
  if (s.phase === 'orders') {
    D.expirePending(d);
    const before = d.messages.length;
    D.aiDiplomacy(map, s, d);
    const fresh = d.messages.slice(before).filter(m => m.to === 'GER');
    toPlayer += fresh.length;
    // the "player" accepts every proposal
    for (const m of fresh) if (m.status === 'pending') D.answerProposal(map, s, d, m.id, true);
    const ctxs = {}, vms = {}, predicted = {};
    const live = POWER_IDS.filter(p => s.units.some(u => u.power === p));
    for (const p of live) { ctxs[p] = D.buildCtx(map, s, d, p); vms[p] = valueMaps(map, s, ctxs[p]); Object.assign(predicted, heuristicOrders(map, s, ctxs[p], vms[p], 1)); }
    const orders = {};
    for (const p of live) Object.assign(orders, planOrders(map, s, ctxs[p], vms[p], predicted, level));
    s = processMovement(map, s, orders);
    D.afterMovement(map, s, d, s.lastResults);
  } else if (s.phase === 'retreats') {
    const rt = {}; for (const p of POWER_IDS) { const c = D.buildCtx(map, s, d, p); Object.assign(rt, planRetreats(map, s, c, valueMaps(map, s, c))); }
    s = processRetreats(map, s, rt);
  } else {
    const b = {}, ds = {};
    for (const p of POWER_IDS) { const c = D.buildCtx(map, s, d, p); const r = planBuilds(map, s, c, valueMaps(map, s, c)); b[p] = r.builds; ds[p] = r.disbands; }
    s = processBuilds(map, s, b, ds, (p, k, ch) => { const c = D.buildCtx(map, s, d, p); return chooseDisbands(map, s, c, valueMaps(map, s, c), k, ch); });
    const rel = Object.values(d.rel);
    const c = countAll(s);
    console.log(`${s.year - 1}: war ${rel.filter(r => r.status === 'war').length} nap ${rel.filter(r => r.status === 'nap').length} ally ${rel.filter(r => r.status === 'alliance').length} betray ${d.betrayals.length} toPlayer ${toPlayer} | ` + POWER_IDS.map(p => `${p}:${c[p] || 0}`).join(' '));
  }
}
const kinds = {}; for (const i of d.intel) kinds[i.kind] = (kinds[i.kind] || 0) + 1;
console.log(kinds);
console.log(d.intel.filter(i => i.kind === 'treaty' || i.kind === 'war' || i.kind === 'betrayal').slice(0, 30).map(i => i.t + ' ' + i.text).join('\n'));
