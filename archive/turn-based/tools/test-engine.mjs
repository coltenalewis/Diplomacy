import fs from 'fs';
import { WorldMap, adjudicate } from '../public/js/engine.js';
const map = new WorldMap(JSON.parse(fs.readFileSync(new URL('../public/data/map.json', import.meta.url))));
let pass = 0, fail = 0;
function t(name, units, orders, expect) {
  const U = units.map(s => { const [power, type, loc] = s.split(' '); return { power, type, loc }; });
  const O = {};
  for (const s of orders) {
    const p = s.split(' ');
    if (p[1] === '-') O[p[0]] = { type: 'M', to: p[2], convoy: p[3] === 'VIA' };
    else if (p[1] === 'S') O[p[0]] = { type: 'S', from: p[2], to: p[4] || p[2] };
    else if (p[1] === 'C') O[p[0]] = { type: 'C', from: p[2], to: p[4] };
    else O[p[0]] = { type: 'H' };
  }
  const r = adjudicate(map, U, O);
  const got = {};
  for (const o of r.orders) got[o.loc] = o.type === 'M' ? (o.ok ? 'ok' : 'fail') : (r.dislodged.some(d => d.unit.loc === o.loc) ? 'dislodged' : 'stay');
  for (const d of r.dislodged) if (got[d.unit.loc] === 'fail') got[d.unit.loc] = 'dislodged';
  const bad = Object.entries(expect).filter(([k, v]) => got[k] !== v);
  if (bad.length) { fail++; console.log('FAIL', name, JSON.stringify(got), 'expected', JSON.stringify(expect)); } else pass++;
}
// adjacency sanity
for (const [a, b, ty] of [['PAR', 'BUR', 'A'], ['BRE', 'ENG', 'F'], ['LON', 'NTH', 'F'], ['MUN', 'BER', 'A'], ['KIE', 'HOL', 'F']]) if (!map.adjacent(ty, a, b)) console.log('not adjacent', a, b);
t('simple move', ['FRA A PAR'], ['PAR - BUR'], { PAR: 'ok' });
t('bounce', ['FRA A PAR', 'GER A RUH'], ['PAR - BUR', 'RUH - BUR'], { PAR: 'fail', RUH: 'fail' });
t('supported attack dislodges', ['FRA A PAR', 'FRA A MAR', 'GER A BUR'], ['PAR - BUR', 'MAR S PAR - BUR', 'BUR H'], { PAR: 'ok', BUR: 'dislodged' });
t('support cut', ['FRA A PAR', 'FRA A MAR', 'GER A BUR', 'GER A PIE'], ['PAR - BUR', 'MAR S PAR - BUR', 'BUR H', 'PIE - MAR'], { PAR: 'fail', BUR: 'stay' });
t('head to head equal', ['FRA A PAR', 'GER A BUR'], ['PAR - BUR', 'BUR - PAR'], { PAR: 'fail', BUR: 'fail' });
t('head to head supported', ['FRA A PAR', 'FRA A BEL', 'GER A BUR'], ['PAR - BUR', 'BEL S PAR - BUR', 'BUR - PAR'], { PAR: 'ok', BUR: 'dislodged' });
t('no self dislodge', ['FRA A PAR', 'FRA A MAR', 'FRA A BUR'], ['PAR - BUR', 'MAR S PAR - BUR', 'BUR H'], { PAR: 'fail', BUR: 'stay' });
t('three-way rotation', ['FRA A PAR', 'FRA A BUR', 'FRA A BEL'], ['PAR - BUR', 'BUR - BEL', 'BEL - PAR'], { PAR: 'ok', BUR: 'ok', BEL: 'ok' });
t('swap without convoy fails', ['FRA A PAR', 'FRA A BUR'], ['PAR - BUR', 'BUR - PAR'], { PAR: 'fail', BUR: 'fail' });
t('convoy', ['GBR A LON', 'GBR F ENG'], ['LON - BRE VIA', 'ENG C LON - BRE'], { LON: 'ok' });
t('convoy disrupted', ['GBR A LON', 'GBR F ENG', 'FRA F BIS', 'FRA F IRS'], ['LON - BRE VIA', 'ENG C LON - BRE', 'BIS - ENG', 'IRS S BIS - ENG'], { LON: 'fail', ENG: 'dislodged' });
t('attacker from target does not cut support unless dislodging', ['FRA A PAR', 'FRA A BEL', 'GER A BUR'], ['BEL S PAR - BUR', 'PAR - BUR', 'BUR - BEL'], { PAR: 'ok', BUR: 'dislodged' });
t('beleaguered garrison', ['FRA A PAR', 'FRA A BEL', 'GER A RUH', 'GER A SWI', 'ITA A BUR'], ['PAR - BUR', 'BEL S PAR - BUR', 'RUH - BUR', 'SWI S RUH - BUR', 'BUR H'], { PAR: 'fail', RUH: 'fail', BUR: 'stay' });
t('support hold defends', ['FRA A PAR', 'FRA A MAR', 'GER A BUR', 'GER A BEL'], ['PAR - BUR', 'MAR S PAR - BUR', 'BUR H', 'BEL S BUR'], { PAR: 'fail', BUR: 'stay' });
t('dislodged supporter loses support', ['FRA A PAR', 'FRA A BEL', 'FRA A MAR', 'GER A BUR', 'GER A RUH'], ['PAR - BUR', 'MAR S PAR - BUR', 'BEL S PAR - BUR', 'BUR - BEL', 'RUH S BUR - BEL'], { PAR: 'ok', BUR: 'ok', BEL: 'dislodged' });
t('circular with convoy-free swap blocked', ['FRA A PAR', 'GER A BUR', 'GER A BEL'], ['PAR - BUR', 'BUR - BEL', 'BEL - PAR'], { PAR: 'ok', BUR: 'ok', BEL: 'ok' });
console.log(`${pass} passed, ${fail} failed`);
