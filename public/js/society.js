// Society: peoples and cultures, faiths, provinces and their governors, city mayors, unrest and its causes,
// uprisings, insurgencies in occupied land, separatist and sectarian movements, and terrorism in the modern age.
import { YEARS_PER_DAY, ageScale } from './eras.js';
import { makeChar, hireCost, GOV_TYPES, govAvailable, lawOpt, computeMods, EVENTS } from './gov.js';
import { cultureOf, personName } from './names.js';
import { UNITS } from './units.js';
import { PROV_NAMES } from './provnames.js';
import { expansionCauses, reachKm } from './pressure.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = a => a[(Math.random() * a.length) | 0];
const kmLL = (a, b) => { const R = 6371, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r; const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(h))); };

// ------------------------------------------------------------------ culture groups and their folk faiths
export const GROUP_LABEL = {
  nile: 'Nilotic', semitic: 'Semitic', iranian: 'Iranian', indic: 'Indic', sinitic: 'Sinitic', eastasian: 'East Asian', steppe: 'Steppe', slavic: 'Slavic',
  hellenic: 'Hellenic', anatolian: 'Anatolian', latin: 'Latin', germanic: 'Germanic', celtic: 'Celtic', bantu: 'Bantu', westafrican: 'West African', ethiopic: 'Ethiopic',
  berber: 'Berber', mesoamerican: 'Mesoamerican', andean: 'Andean', amazonian: 'Amazonian', northamerican: 'Plains', austronesian: 'Austronesian', seasian: 'Southeast Asian',
  australian: 'Aboriginal', arctic: 'Arctic',
};
const FOLK = {
  nile: 'Cult of the River', semitic: 'Old Gods of the Two Rivers', iranian: 'Fire Rites', indic: 'Vedic Rites', sinitic: 'Ancestral Rites', eastasian: 'Way of the Kami',
  steppe: 'Eternal Blue Sky', slavic: 'Rod and Perun', hellenic: 'Olympian Rites', anatolian: 'Storm-God Cult', latin: 'Household Gods', germanic: 'Old Norse Rites', celtic: 'Druidry',
  bantu: 'Ancestor Spirits', westafrican: 'Orisha Rites', ethiopic: 'Sky-God Cult', berber: 'Cult of the Sun and Moon', mesoamerican: 'Feathered Serpent Cult', andean: 'Sun and Mountain Cult',
  amazonian: 'Forest Spirits', northamerican: 'Great Spirit', austronesian: 'Mana and Tapu', seasian: 'Spirit Houses', australian: 'The Dreaming', arctic: 'Sea Mother',
};
// how strongly a faith spreads and holds on: tribal beliefs give way to organized religions
export const FAITH_KIND = {
  folk: { name: 'Folk faith', str: 1 },
  pantheon: { name: 'Pantheon', str: 1.8 },
  teaching: { name: 'Philosophy and teaching', str: 2.6 },
  world: { name: 'World religion', str: 3 },
  reformed: { name: 'Reformed church', str: 3 },
};
const fstr = F => FAITH_KIND[F?.kind]?.str || 1;
const hsl = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l); const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
const hashStr = t => { let h = 2166136261; for (let k = 0; k < t.length; k++) { h ^= t.charCodeAt(k); h = Math.imul(h, 16777619); } return h >>> 0; };

// ------------------------------------------------------------------ provinces (static, from the map)
// Tiles inherit the historical region they were cut from; big regions are split into provinces of about nine tiles.
export function buildProvinces(sim) {
  const w = sim.w, T = sim.T;
  const by = new Map();
  for (const i of sim.landIdx) { const p = w.regions[i].parent || 'T' + i; if (!by.has(p)) by.set(p, []); by.get(p).push(i); }
  sim.provOf = new Array(w.regions.length).fill(null); sim.provs = {};
  const used = new Set();
  const DIRS = ['Northern', 'Northeastern', 'Eastern', 'Southeastern', 'Southern', 'Southwestern', 'Western', 'Northwestern'];
  for (const [p, tiles] of [...by.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const base = PROV_NAMES[p] || w.regions[tiles[0]].name;
    const k = Math.max(1, Math.round(tiles.length / 9));
    const ll = i => [T[i].lat, T[i].lon];
    const seeds = [tiles[0]];
    while (seeds.length < k) { let best = -1, bd = -1; for (const i of tiles) { let d = Infinity; for (const j of seeds) d = Math.min(d, kmLL(ll(i), ll(j))); if (d > bd) { bd = d; best = i; } } seeds.push(best); }
    const groups = seeds.map(() => []);
    for (const i of tiles) { let b = 0, bd = Infinity; seeds.forEach((j, n) => { const d = kmLL(ll(i), ll(j)); if (d < bd) { bd = d; b = n; } }); groups[b].push(i); }
    const cLat = tiles.reduce((a, i) => a + T[i].lat, 0) / tiles.length, cLon = tiles.reduce((a, i) => a + T[i].lon, 0) / tiles.length;
    groups.forEach((g, n) => {
      if (!g.length) return;
      const id = k === 1 ? p : `${p}-${n}`;
      let name = base;
      if (k > 1) {
        const la = g.reduce((a, i) => a + T[i].lat, 0) / g.length, lo = g.reduce((a, i) => a + T[i].lon, 0) / g.length;
        const dy = la - cLat, dx = (lo - cLon) * Math.cos(cLat * Math.PI / 180);
        name = Math.hypot(dx, dy) < 1.2 ? `Central ${base}` : `${DIRS[(Math.round(Math.atan2(dx, dy) / (Math.PI / 4)) + 8) % 8]} ${base}`;
        if (used.has(name)) { const big = g.slice().sort((a, b) => (T[b].area || 0) - (T[a].area || 0))[0]; name = `${w.regions[big].name} (${base})`; }
      }
      used.add(name);
      sim.provs[id] = { id, name, tiles: g };
      for (const i of g) sim.provOf[i] = id;
    });
  }
}
// provinces where a nation holds land: [{ id, name, tiles: [owned indices], all }]
export function provincesOf(sim, c) {
  const m = new Map();
  for (const i of sim.owned.get(c) || []) { const p = sim.provOf[i]; if (!p) continue; if (!m.has(p)) m.set(p, []); m.get(p).push(i); }
  return [...m.entries()].map(([id, tiles]) => ({ id, name: sim.provs[id].name, tiles, all: sim.provs[id].tiles.length }));
}

// ------------------------------------------------------------------ state
const civCul = code => 'c:' + code;
export function cultureName(s, id) { return s.cultures?.[id]?.adj || '—'; }
export function faithName(s, id) { return s.faiths?.[id]?.name || '—'; }
// the faith's name as it reads mid-sentence: 'the Andean Pantheon', 'the Way of Ilan', but 'Kaharism'
export function theFaith(s, id) { const F = s.faiths?.[id]; if (!F) return 'the old ways'; return F.kind === 'folk' || F.kind === 'pantheon' || /^(Way|Faith|Teachings) of /.test(F.name) ? 'the ' + F.name : F.name; }
function ensureNation(sim, N, cul) {
  const s = sim.s;
  if (cul && s.cultures[cul]) {
    const C = s.cultures[cul];
    N.cul = cul;
    if (C.nation && !s.nations[C.nation]?.alive && C.nation !== N.code) { // a fallen people rises again under its old name
      N.name = C.name; N.adj = C.adj; C.nation = N.code; N.revived = true;
    } else if (!C.nation) C.nation = N.code;
  } else {
    const id = civCul(N.code);
    s.cultures[id] ||= { id, name: N.name, adj: N.adj || N.name, group: N.culture, col: N.color, nation: N.code };
    N.cul = id;
  }
  if (!N.faith || !s.faiths[N.faith]) N.faith = 'f:' + N.culture;
  N.governors ||= {}; N.socCands ||= {};
  if (N.gov) N.gov.laws.culture ||= 'accommodate';
}
export function initSociety(sim) {
  const s = sim.s;
  if (s.cultures && s.faiths) { for (const N of Object.values(s.nations)) if (!N.cul) ensureNation(sim, N); return; }
  s.cultures = {}; s.faiths = {}; s.movements = []; s.mvid = 1; s.faithCount = { teaching: 0, world: 0, reformed: 0 };
  let n = 0;
  for (const [g, label] of Object.entries(GROUP_LABEL)) {
    s.cultures['g:' + g] = { id: 'g:' + g, name: label + ' peoples', adj: label, group: g, col: hsl((n * 47) % 360, 25, 55), nation: null };
    s.faiths['f:' + g] = { id: 'f:' + g, name: FOLK[g], kind: 'folk', group: g, col: hsl((n * 47 + 20) % 360, 22, 48), holy: null, founder: null };
    n++;
  }
  for (const N of Object.values(s.nations)) ensureNation(sim, N);
  for (const i of sim.landIdx) {
    const r = s.regions[i], g = cultureOf(sim.T[i]);
    const C = r.core && s.nations[r.core] ? s.nations[r.core].cul : r.owner ? s.nations[r.owner].cul : 'g:' + g;
    r.cul = C || 'g:' + g; r.rel = r.owner ? s.nations[r.owner].faith : 'f:' + g; r.assim = 0; r.rev = 0; r.revolt = null; r.mayor = null;
  }
}
// hooks from the simulation
export function onNewNation(sim, N, opts = {}) {
  const s = sim.s; if (!s.cultures) return;
  let cul = opts.cul;
  if (!cul && opts.tiles?.length) { const cnt = {}; for (const i of opts.tiles) cnt[s.regions[i].cul] = (cnt[s.regions[i].cul] || 0) + s.regions[i].pop; cul = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0]; if (cul?.startsWith('g:')) cul = null; }
  // a breakaway of the ruling people shares its culture; minorities rally under their own, and a fallen people may rise again
  ensureNation(sim, N, cul);
  if (opts.tiles?.length) { const cnt = {}; for (const i of opts.tiles) cnt[s.regions[i].rel] = (cnt[s.regions[i].rel] || 0) + s.regions[i].pop; N.faith = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || N.faith; }
  else { N.faith = s.regions[N.capital].rel || N.faith; for (const i of sim.owned.get(N.code) || []) { const r = s.regions[i]; r.cul = N.cul; r.rel = N.faith; } }
}
// natives: the local people outnumber the newcomers and keep their own ways for now
export function onSettled(sim, r, N, natives) {
  if (!sim.s.cultures) return;
  r.assim = 0;
  if (natives) return;
  r.cul = N.cul; r.rel = N.faith;
}
export function onTransfer(sim, r) {
  r.assim = 0; r.rev = 0; r.revolt = null;
  if (r.mayor) { const c = sim.s.chars[r.mayor]; if (c) c.role = null; r.mayor = null; }
}

// ------------------------------------------------------------------ appointment helpers
const T6 = a => (a <= 0 ? 0 : a <= 2 ? 1 : a === 3 ? 2 : a === 4 ? 3 : a === 5 ? 4 : 5);
export const governorTitle = age => ['Headman', 'Governor', 'Satrap', 'Proconsul', 'Governor', 'Governor'][T6(age)];
export const mayorTitle = age => ['Elder', 'Overseer', 'Magistrate', 'Reeve', 'Burgomaster', 'Mayor'][T6(age)];
export const canGovern = N => !!N.techs.code_of_laws;
export const canMayor = N => !!N.techs.urbanism;
export function provinceGovernor(sim, N, pid) { const id = N.governors?.[pid]; return id ? sim.s.chars[id] : null; }
function newOfficial(s, N, role) {
  const c = makeChar(s, N, 'minister', Math.random() < 0.25 ? 1.5 : 0); c.kind = 'governor'; c.office = role; return c;
}
export function candidates(sim, N, key) {
  const s = sim.s;
  const cur = N.socCands[key];
  if (cur && s.t - cur.at < 24 * 60 && cur.ids.every(id => s.chars[id])) return cur.ids.map(id => s.chars[id]);
  if (cur) for (const id of cur.ids) if (s.chars[id] && !s.chars[id].role) delete s.chars[id];
  const ids = [0, 1, 2].map(() => newOfficial(s, N, key.startsWith('m:') ? 'mayor' : 'governor').id);
  N.socCands[key] = { ids, at: s.t };
  return ids.map(id => s.chars[id]);
}
export function officialCost(N, c, mayor) { const G = GOV_TYPES[N.gov.type]; return mayor && G.democratic ? 0 : Math.round(hireCost(c) * (mayor ? 0.5 : 0.8)); }
function retire(s, id) { const c = s.chars[id]; if (c) { c.role = null; delete s.chars[id]; } }
export function appointGovernor(sim, N, pid, charId) {
  const s = sim.s, c = s.chars[charId];
  if (!canGovern(N)) return { ok: false, why: 'Governors require the Code of Laws.' };
  if (!c) return { ok: false, why: 'Unknown candidate.' };
  const cost = officialCost(N, c, false);
  if (N.gov.pc < cost) return { ok: false, why: `Needs ${cost} political capital.` };
  N.gov.pc -= cost;
  if (N.governors[pid]) retire(s, N.governors[pid]);
  N.governors[pid] = c.id; c.role = 'governor'; c.prov = pid;
  const cands = N.socCands['g:' + pid]; if (cands) { for (const id of cands.ids) if (id !== c.id && !s.chars[id]?.role) delete s.chars[id]; delete N.socCands['g:' + pid]; }
  return { ok: true, why: `${c.name} now governs ${sim.provs[pid]?.name || 'the province'}.` };
}
export function dismissGovernor(sim, N, pid) { if (N.governors[pid]) { retire(sim.s, N.governors[pid]); delete N.governors[pid]; N.gov.stability = clamp(N.gov.stability - 0.01, 0, 1); } return { ok: true, why: `The governor of ${sim.provs[pid]?.name || 'the province'} is dismissed.` }; }
export function appointMayor(sim, N, i, charId) {
  const s = sim.s, r = s.regions[i], c = s.chars[charId];
  if (!canMayor(N)) return { ok: false, why: 'Mayors require Urbanism.' };
  if (!c || r.owner !== N.code || r.lvl < 3) return { ok: false, why: 'Only towns and cities have mayors.' };
  const cost = officialCost(N, c, true);
  if (N.gov.pc < cost) return { ok: false, why: `Needs ${cost} political capital.` };
  N.gov.pc -= cost;
  if (r.mayor) retire(s, r.mayor);
  r.mayor = c.id; c.role = 'mayor'; c.city = i;
  const cands = N.socCands['m:' + i]; if (cands) { for (const id of cands.ids) if (id !== c.id && !s.chars[id]?.role) delete s.chars[id]; delete N.socCands['m:' + i]; }
  const dem = GOV_TYPES[N.gov.type].democratic;
  if (dem) N.gov.approval = clamp(N.gov.approval + 0.005, 0, 1);
  return { ok: true, why: `${c.name} ${dem ? 'wins the election' : 'is appointed'} in ${sim.w.regions[i].name}.` };
}

// ------------------------------------------------------------------ faiths
function faithColor(s) { const k = Object.keys(s.faiths).length; return hsl((k * 137.5) % 360, 70, 56); }
function rootOf(N) { const w = personName(N.culture, 3).split(' ')[0].replace(/[^A-Za-z]/g, ''); return w.length > 2 ? w : 'Ilan'; }
function foundFaith(sim, N, kind, parent = null) {
  const s = sim.s;
  let name, id;
  if (kind === 'pantheon') { id = 'p:' + N.culture; if (s.faiths[id]) return s.faiths[id]; name = `${GROUP_LABEL[N.culture] || N.adj} Pantheon`; }
  else {
    id = kind[0] + ':' + N.code + ':' + s.t;
    const root = rootOf(N), stem = root.replace(/[aeiouy]+$/i, '') || root;
    if (kind === 'teaching') name = pick([`Way of ${root}`, `${stem}ism`, `Teachings of ${root}`, `${stem}ian Path`]);
    else if (kind === 'world') name = pick([`${stem}ism`, `${stem}ianity`, `Faith of ${root}`, `${stem}ism`]);
    else { const P = s.faiths[parent]; name = `${['Reformed', 'Free', 'Restored', 'Evangelical'][s.faithCount.reformed % 4]} ${P.name.replace(/^(Faith|Way|Teachings) of /, '')}`; }
  }
  const F = { id, name, kind, group: N.culture, col: faithColor(s), holy: N.capital, founder: N.code, founded: s.t, parent };
  s.faiths[id] = F; if (s.faithCount[kind] !== undefined) s.faithCount[kind]++;
  const r = s.regions[N.capital]; r.rel = id;
  N.faith = id;
  const verb = kind === 'pantheon' ? 'organize the old gods into the' : kind === 'teaching' ? 'gather around a sage and found' : kind === 'reformed' ? `break with ${theFaith(s, parent)} and found` : 'proclaim a new revelation:';
  sim.emit('faith', `The ${sim.nm(N.code)} ${verb} ${kind === 'pantheon' ? name : theFaith(s, id)}. Its holy city is ${sim.w.regions[N.capital].name}.`, [N.code], { loc: N.capital, major: kind !== 'pantheon' });
  return F;
}
export function adoptFaith(sim, N, id, free = false) {
  const s = sim.s, F = s.faiths[id];
  if (!F || N.faith === id) return { ok: false, why: 'Already the state faith.' };
  const cost = 80;
  if (!free && N.gov.pc < cost) return { ok: false, why: `Needs ${cost} political capital.` };
  if (!free) N.gov.pc -= cost;
  const share = faithShares(sim, N.code)[id] || 0;
  N.faith = id; N.gov.stability = clamp(N.gov.stability - (0.12 - share * 0.12), 0, 1);
  N.faithSince = s.t;
  sim.emit('faith', `The ${sim.nm(N.code)} embrace ${theFaith(s, id)} as their state faith.`, [N.code], { loc: N.capital, major: N.code === s.player });
  return { ok: true };
}
export function faithShares(sim, c) { const s = sim.s, out = {}; let tot = 0; for (const i of sim.owned.get(c) || []) { const r = s.regions[i]; out[r.rel] = (out[r.rel] || 0) + r.pop; tot += r.pop; } for (const k in out) out[k] /= tot || 1; return out; }
export function cultureShares(sim, c) { const s = sim.s, out = {}; let tot = 0; for (const i of sim.owned.get(c) || []) { const r = s.regions[i]; out[r.cul] = (out[r.cul] || 0) + r.pop; tot += r.pop; } for (const k in out) out[k] /= tot || 1; return out; }
export function missionCost(N) { return +(0.06 * Math.pow(ageScale(N.age), 0.8)).toFixed(2); }
export function canMission(N, target) { return target === 'home' ? !!N.techs.priesthood : !!N.techs.missionaries; }

// ------------------------------------------------------------------ movements
const MOV_KIND = { separatist: 'Separatists', sectarian: 'Sectarian militants', revolutionary: 'Revolutionaries' };
function movementName(s, kind, key, age) {
  if (kind === 'separatist') { const C = s.cultures[key]?.adj || 'Free'; return age >= 6 ? pick([`${C} Liberation Front`, `${C} National Army`, `${C} Independence Movement`, `Free ${C} League`]) : pick([`Sons of the ${C}`, `${C} Brotherhood`, `${C} Rebels`, `Free ${C} Clans`]); }
  if (kind === 'sectarian') { const F = s.faiths[key]?.name || 'the Faith'; return age >= 7 ? pick([`Army of ${F}`, `${F} Vanguard`, `Soldiers of ${F}`]) : pick([`Zealots of ${F}`, `Defenders of ${F}`, `${F} Brethren`]); }
  return age >= 7 ? pick(["People's Front", 'Workers\' Vanguard', 'Popular Liberation Army', 'Red Brigades', 'National Salvation Front']) : age >= 5 ? pick(['Society of the Rights of Man', 'Patriot Clubs', 'Peasant League', 'Levellers']) : pick(['Peasant League', 'Bread Rioters', 'Shepherds\' Crusade']);
}
const movTiles = (sim, M) => { const out = []; for (const i of sim.owned.get(M.nation) || []) { const r = sim.s.regions[i]; if (M.kind === 'separatist' ? r.cul === M.key : M.kind === 'sectarian' ? r.rel === M.key : true) out.push(i); } return out; };
export function movementTiles(sim, M) { return movTiles(sim, M); }
export function movementsOf(sim, c) { return (sim.s.movements || []).filter(M => M.nation === c); }
function newMovement(sim, N, kind, key, sponsor = null) {
  const s = sim.s;
  const M = { id: s.mvid++, kind, key, nation: N.code, name: movementName(s, kind, key, N.age), str: 0.15, born: s.t, sponsor, cd: 0 };
  s.movements.push(M);
  sim.emit('unrest', `${MOV_KIND[kind]} organize in the lands of the ${sim.nm(N.code)}: the ${M.name}.`, [N.code], { loc: N.capital });
  return M;
}
export function crackdown(sim, N, id) {
  const s = sim.s, M = s.movements.find(x => x.id === id);
  if (!M || M.nation !== N.code) return { ok: false, why: 'No such movement.' };
  if (s.t < (M.cd || 0)) return { ok: false, why: `Our forces regroup for ${Math.ceil((M.cd - s.t) / 24)} more days.` };
  const cost = 25; if (N.gov.pc < cost) return { ok: false, why: `Needs ${cost} political capital.` };
  N.gov.pc -= cost; M.cd = s.t + 24 * 20;
  const m = N.mods;
  M.str = clamp(M.str - 0.3 * (1 + (m.suppress || 0) * 0.5), 0, 1);
  const anger = lawOpt(N, 'liberty').id === 'surveillance' || lawOpt(N, 'liberty').id === 'martial' ? 0.03 : 0.08;
  for (const i of movTiles(sim, M)) s.regions[i].unrest = clamp(s.regions[i].unrest + anger, 0, 1);
  N.gov.approval = clamp(N.gov.approval - (GOV_TYPES[N.gov.type].democratic ? 0.04 : 0.015), 0, 1);
  return { ok: true, why: `Arrests and raids break up cells of the ${M.name}.` };
}
export function concessionCost(N) { return Math.round(15 * Math.pow(ageScale(N.age), 0.9)); }
export function concede(sim, N, id) {
  const s = sim.s, M = s.movements.find(x => x.id === id);
  if (!M || M.nation !== N.code) return { ok: false, why: 'No such movement.' };
  if (s.t < (M.cd || 0)) return { ok: false, why: `Talks resume in ${Math.ceil((M.cd - s.t) / 24)} days.` };
  const cost = concessionCost(N); if (N.wealth < cost) return { ok: false, why: `Needs ${cost} wealth.` };
  N.wealth -= cost; M.cd = s.t + 24 * 30;
  M.str = clamp(M.str - 0.4, 0, 1);
  for (const i of movTiles(sim, M)) s.regions[i].unrest = clamp(s.regions[i].unrest - 0.12, 0, 1);
  return { ok: true, why: `Schools, temples and tax relief for the people the ${M.name} claim to speak for.` };
}
// grant a province or a people self-rule: their land becomes an autonomous state, a vassal of the crown
export function grantAutonomy(sim, N, tiles, why) {
  const s = sim.s;
  tiles = tiles.filter(i => s.regions[i].owner === N.code && i !== N.capital);
  if (!tiles.length) return { ok: false, why: 'Nothing to release.' };
  if (tiles.length >= (sim.owned.get(N.code)?.size || 0)) return { ok: false, why: 'We would have nothing left.' };
  const seed = tiles.slice().sort((a, b) => s.regions[b].pop - s.regions[a].pop)[0];
  for (const i of tiles) { const r = s.regions[i]; r.revolt = null; r.rev = 0; r.unrest = Math.max(0, r.unrest - 0.3); }
  const V = sim.newCivilization(seed, N.age, { tiles, techs: N.techs, parent: N.code });
  V.known = [...new Set([N.code, ...N.known.filter(c => s.nations[c]?.alive)])];
  for (const c of V.known) { const X = s.nations[c]; if (X && !X.known.includes(V.code)) X.known.push(V.code); }
  sim.makeVassal(V.code, N.code, 'autonomy');
  V.tribute = 0.15; V.autonomous = true;
  sim.setOpinion(V.code, N.code, 40); sim.setOpinion(N.code, V.code, 30);
  for (const M of s.movements) if (M.nation === N.code && movTiles(sim, M).length === 0) M.str = 0;
  sim.emit('vassal', `${why || 'Self-rule granted.'} ${tiles.length === 1 ? 'One land becomes' : tiles.length + ' lands become'} the autonomous ${sim.full(V.code)}, under the protection of the ${sim.nm(N.code)}.`, [N.code, V.code], { loc: seed, major: true });
  return { ok: true, code: V.code };
}
// covert operation: arm and fund a restive people inside a rival
export function fundInsurgents(sim, by, target) {
  const s = sim.s, B = s.nations[target];
  let M = movementsOf(sim, target).sort((a, b) => b.str - a.str)[0];
  if (!M) {
    const cs = cultureShares(sim, target), fs = faithShares(sim, target);
    const c = Object.entries(cs).filter(([k]) => k !== B.cul).sort((a, b) => b[1] - a[1])[0];
    const f = Object.entries(fs).filter(([k]) => k !== B.faith).sort((a, b) => b[1] - a[1])[0];
    if (c && c[1] > 0.04) M = newMovement(sim, B, 'separatist', c[0], by);
    else if (f && f[1] > 0.04) M = newMovement(sim, B, 'sectarian', f[0], by);
    else if (B.gov.approval < 0.45) M = newMovement(sim, B, 'revolutionary', B.cul, by);
    else return { ok: true, why: `The ${sim.nm(target)} are united; our agents find no one willing to take up arms.` };
  }
  M.sponsor = by; M.str = clamp(M.str + 0.25, 0, 1);
  return { ok: true, why: `Weapons and gold flow to the ${M.name} inside the ${sim.nm(target)}.` };
}

// ------------------------------------------------------------------ revolts
const revoltKind = (sim, r, N) => r.core && r.core !== r.owner && sim.s.nations[r.core]?.alive ? 'insurgency' : r.cul !== N.cul ? 'separatist' : r.rel !== N.faith ? 'sectarian' : 'peasant';
export const REVOLT_NAME = { insurgency: 'Insurgency', separatist: 'Separatist uprising', sectarian: 'Religious revolt', peasant: 'Popular uprising' };
function startRevolt(sim, r, N) {
  const kind = revoltKind(sim, r, N);
  r.revolt = { kind, str: 1 + Math.min(2.5, Math.sqrt(Math.max(0, r.pop)) * 0.15), since: sim.s.t };
  r.rev = 0;
  const nm = sim.w.regions[r.i].name;
  const txt = { insurgency: `Insurgents rise against the ${sim.nm(N.code)} occupation of ${nm}.`, separatist: `The ${cultureName(sim.s, r.cul)} people of ${nm} rise up against ${sim.nm(N.code)} rule.`, sectarian: `Followers of ${theFaith(sim.s, r.rel)} in ${nm} take up arms against the ${sim.nm(N.code)}.`, peasant: `Revolt in ${nm}! The people of the ${sim.nm(N.code)} rise against their rulers.` }[kind];
  sim.emit('unrest', txt + ' Send troops to restore order.', [N.code], { loc: r.i, major: N.code === sim.s.player });
}
function revoltOutcome(sim, r, N) {
  const s = sim.s, w = sim.w, kind = r.revolt.kind;
  r.revolt = null; r.rev = 0;
  if (kind === 'insurgency') {
    const to = r.core; r.unrest = 0.3;
    sim.transfer(r, to, true, 'return');
    sim.emit('unrest', `Insurgents drive the ${sim.nm(N.code)} out of ${w.regions[r.i].name}; it returns to the ${sim.nm(to)}.`, [N.code, to], { loc: r.i, major: true });
    return;
  }
  if (r.i === N.capital) { revolution(sim, N); return; }
  // most risings win concessions rather than countries
  const far = kmLL(sim.anchor(N.capital), sim.anchor(r.i)) > reachKm(N);
  if ((kind === 'peasant' && !far) || (kind === 'sectarian' && Math.random() < 0.5)) {
    r.unrest = 0.3; N.gov.stability = clamp(N.gov.stability - 0.06, 0, 1); N.gov.approval = clamp(N.gov.approval - 0.04, 0, 1); N.wealth -= 4 * ageScale(N.age);
    let what;
    if (kind === 'sectarian') {
      if (N.techs.humanism && N.gov.laws.religion !== 'tolerance' && N.gov.laws.religion !== 'secular') { N.gov.laws.religion = 'tolerance'; computeMods(s, N); what = 'religious tolerance is proclaimed'; }
      else what = 'their temples are restored and their clergy freed';
      for (const x of sim.regionsOf(N.code)) if (x.rel === r.rel) x.unrest = Math.max(0, x.unrest - 0.15);
    } else {
      const pid = sim.provOf[r.i]; if (pid && N.governors?.[pid]) { retire(s, N.governors[pid]); delete N.governors[pid]; }
      what = 'taxes are cut and the governor recalled';
    }
    sim.emit('unrest', `The rebels of ${w.regions[r.i].name} force the ${sim.nm(N.code)} to terms: ${what}.`, [N.code], { loc: r.i, major: N.code === s.player });
    return;
  }
  // the revolt spreads to restless neighbours of the same people and breaks away
  const cluster = [r.i], q = [r.i];
  while (q.length && cluster.length < 8) {
    const i = q.shift();
    for (const j of w.adj[i]) { const x = s.regions[j]; if (x.owner === N.code && j !== N.capital && !cluster.includes(j) && x.unrest > 0.45 && (kind === 'peasant' || x.cul === r.cul || x.rel === r.rel)) { cluster.push(j); q.push(j); } }
  }
  if (cluster.length >= (sim.owned.get(N.code)?.size || 0)) { revolution(sim, N); return; }
  const R = sim.newCivilization(r.i, N.age, { tiles: cluster, techs: N.techs, rebel: true, parent: N.code });
  R.known = [...new Set([N.code, ...N.known.filter(c => s.nations[c]?.alive)])];
  for (const c of R.known) { const X = s.nations[c]; if (X && !X.known.includes(R.code)) X.known.push(R.code); }
  for (const i of cluster) { const x = s.regions[i]; x.unrest = 0.15; x.revolt = null; x.rev = 0; }
  sim.setOpinion(R.code, N.code, -60); sim.setOpinion(N.code, R.code, -50);
  sim.declareWar(R.code, N.code, true);
  N.lastSecession = s.t;
  sim.emit('rise', `${REVOLT_NAME[kind]} triumphs: ${cluster.length === 1 ? 'the land' : cluster.length + ' lands'} around ${w.regions[r.i].name} throw off the ${sim.nm(N.code)} and form the ${R.revived ? 'restored ' : ''}${sim.full(R.code)}.`, [R.code, N.code], { loc: r.i, major: true });
}
function revolution(sim, N) {
  const s = sim.s, g = N.gov;
  const opts = Object.keys(GOV_TYPES).filter(k => govAvailable(N, k) && k !== g.type && !GOV_TYPES[k].coupOnly);
  const pref = N.age >= 6 ? opts.filter(k => GOV_TYPES[k].democratic) : opts;
  const nt = pick(pref.length ? pref : opts.length ? opts : [g.type]);
  g.type = nt; g.pc = 10; g.stability = 0.45; g.approval = 0.6; g.nextElection = GOV_TYPES[nt].democratic ? s.t + (GOV_TYPES[nt].election || 90) * 24 : null;
  for (const i of sim.owned.get(N.code) || []) { const r = s.regions[i]; r.unrest = Math.min(r.unrest, 0.3); r.rev = 0; r.revolt = null; }
  for (const M of s.movements) if (M.nation === N.code && M.kind === 'revolutionary') M.str = 0;
  computeMods(s, N);
  sim.emit('gov', `REVOLUTION in the ${sim.nm(N.code)}! The old regime falls and a ${GOV_TYPES[nt].name} takes power.`, [N.code], { loc: N.capital, major: true });
}

// ------------------------------------------------------------------ the daily pass
// years per game day under the leading civilization: faster calendars mean faster conversion and assimilation
function pace(sim) { let L = 0; for (const N of Object.values(sim.s.nations)) if (N.alive && N.age > L) L = N.age; return YEARS_PER_DAY[L]; }
// why a tile is restless, as [label, amount] pairs; also its target unrest
export function unrestCauses(sim, r, N, ctx) {
  const s = sim.s, m = N.mods, g = N.gov, out = [];
  if (N.famine > 0.02) out.push(['Famine', N.famine * 0.6]);
  if ((N.st.eF ?? 1) < 0.7) out.push(['Blackouts', 0.15]);
  if (g.stability < 0.3) out.push(['Unstable government', 0.12]);
  if (g.approval < 0.4) out.push(['Unpopular rulers', (0.4 - g.approval) * 0.5]);
  if (r.cul !== N.cul) { const C = s.cultures[r.cul], same = C && C.group === N.culture; out.push([`Foreign people (${C?.adj || '?'})`, (same ? 0.1 : 0.26) * Math.max(0.1, 1 + (m.cultureUnrest || 0))]); }
  if (r.rel !== N.faith) { const F = s.faiths[r.rel]; out.push([`Other faith (${F?.name || '?'})`, 0.2 * Math.max(0.1, 1 + (m.faithUnrest || 0)) * (F?.kind === 'folk' && fstr(s.faiths[N.faith]) > 1.5 ? 0.6 : 1) * (N.age >= 8 ? 0.45 : N.age >= 6 ? 0.65 : 1)]); } // faith matters less in secular ages
  if (r.core && r.core !== r.owner) { const C = s.nations[r.core]; out.push([C?.alive ? `Occupied land of the ${C.name}` : 'Conquered land', C?.alive ? 0.32 + (C.techs?.guerrilla_warfare ? 0.08 : 0) : 0.1]); }
  const gv = ctx.gov.get(r.i);
  if (gv) { const k = gv.skill + (m.govSkill || 0) - 3; out.push([`Governor ${gv.name}`, -0.03 * k - (gv.traits.includes('Populist') ? 0.05 : 0) + (gv.traits.includes('Corrupt') ? 0.03 : 0)]); }
  else if (ctx.far.has(r.i)) out.push(['No governor in a distant province', 0.07]);
  const my = r.mayor && s.chars[r.mayor]; if (my) out.push([`Mayor ${my.name}`, -0.02 * (my.skill - 3)]);
  const gar = ctx.garrison.get(r.i) || 0; if (gar) out.push(['Garrison', -Math.min(0.22, gar * 0.05) * (1 + (m.suppress || 0) * 0.5)]);
  const lib = lawOpt(N, 'liberty').id; if (lib === 'surveillance') out.push(['Secret police', -0.05]); else if (lib === 'martial') out.push(['Martial law', -0.15]); else if (lib === 'open') out.push(['Free press', 0.03]);
  if (m.unrestMin) out.push([m.unrestMin > 0 ? 'Social media outrage' : 'Census and policing', m.unrestMin]);
  const mv = ctx.mov.get(r.i); if (mv) out.push([mv.name, 0.25 * mv.str]);
  if (r.revolt) out.push(['Open revolt', 0.2]);
  if ((r.sick || 0) > s.t) out.push(['Plague', 0.15]);
  expansionCauses(sim, r, N, out);
  const target = clamp(out.reduce((a, x) => a + x[1], 0), 0, 0.95);
  return { causes: out, target };
}
function garrisons(s) {
  const all = new Map();
  for (const u of s.units) { if (u.move || UNITS[u.type].domain !== 'land') continue; let g = all.get(u.nation); if (!g) all.set(u.nation, g = new Map()); g.set(u.loc, (g.get(u.loc) || 0) + 1); }
  return all;
}
function context(sim, N, gar) {
  const s = sim.s, ctx = { gov: new Map(), far: new Set(), garrison: (gar || garrisons(s)).get(N.code) || new Map(), mov: new Map() };
  const cap = sim.anchor(N.capital);
  for (const p of provincesOf(sim, N.code)) {
    const c = provinceGovernor(sim, N, p.id);
    if (c) for (const i of p.tiles) ctx.gov.set(i, c);
    else if (!p.tiles.includes(N.capital) && kmLL(cap, sim.anchor(p.tiles[0])) > 1400) for (const i of p.tiles) ctx.far.add(i);
  }
  for (const M of s.movements) if (M.nation === N.code && M.str > 0) for (const i of movTiles(sim, M)) { const o = ctx.mov.get(i); if (!o || o.str < M.str) ctx.mov.set(i, M); }
  return ctx;
}
export function societyContext(sim, N) { return context(sim, N); }

export function societyDaily(sim) {
  const s = sim.s; if (!s.cultures) return;
  const ypd = pace(sim), day = Math.floor(s.t / 24);
  sim.socOut ||= new Float32Array(s.regions.length).fill(1);
  const sp = clamp(ypd / 3, 0.2, 3), gar = garrisons(s);
  const holyAt = new Map(); for (const F of Object.values(s.faiths)) if (F.holy != null && F.kind !== 'folk') holyAt.set(F.holy, [...(holyAt.get(F.holy) || []), F.id]);
  // 1) each nation: unrest, assimilation, revolts, officials, holy places
  for (const N of Object.values(s.nations)) {
    if (!N.alive) continue;
    if (!N.cul) ensureNation(sim, N);
    const m = N.mods, ctx = context(sim, N, gar);
    const assimK = 0.006 * clamp(ypd / 2.6, 0.25, 4) * Math.max(0.1, 1 + (m.assim || 0));
    let holy = 0;
    for (const i of [...(sim.owned.get(N.code) || [])]) {
      const r = s.regions[i];
      if (r.owner !== N.code || !N.alive) continue; // lost to a revolt earlier in this pass
      const { target } = unrestCauses(sim, r, N, ctx);
      r.unrest = clamp(r.unrest + (target - r.unrest) * 0.05, 0, 1);
      // assimilation toward the ruling people
      if (r.cul !== N.cul && r.pop > 0.05 && !r.revolt) {
        const C = s.cultures[r.cul], gv = ctx.gov.get(i);
        let k = assimK * (C?.group === N.culture ? 2 : 1) * (1 + 0.12 * r.lvl) * (r.core === r.owner ? 1 : 0.3) * (gv ? 1 + 0.08 * (gv.skill - 4) + (gv.traits.includes('Reformer') ? 0.3 : 0) : 1);
        r.assim = (r.assim || 0) + k;
        if (r.assim >= 1) { r.assim = 0; r.cul = N.cul; if (N.code === s.player && r.lvl >= 3) sim.emit('info', `The people of ${sim.w.regions[i].name} now count themselves ${s.cultures[N.cul].adj}.`, [N.code], { loc: i }); }
      }
      // output: governors, mayors, revolts and foreign peoples
      let out = 1;
      const gv = ctx.gov.get(i); if (gv) out *= 1 + 0.02 * (gv.skill + (m.govSkill || 0) - 4) - (gv.traits.includes('Corrupt') ? 0.08 : 0) + (gv.traits.includes('Scholar') ? 0.02 : 0);
      const my = r.mayor && s.chars[r.mayor]; if (my) out *= 1 + 0.03 * (my.skill - 4) - (my.traits.includes('Corrupt') ? 0.05 : 0);
      if (r.revolt) out *= 0.45;
      if ((r.sick || 0) > s.t) out *= 0.85;
      if ((r.blight || 0) > s.t) out *= 0.7;
      if (r.cul !== N.cul && s.cultures[r.cul]?.group !== N.culture) out *= 0.93;
      sim.socOut[i] = out;
      // simmering anger becomes revolt
      if (!r.revolt) {
        if (r.unrest > 0.6 && r.pop > 0.2 && N.age >= 1) r.rev = (r.rev || 0) + (r.unrest - 0.55) * 0.06;
        else r.rev = Math.max(0, (r.rev || 0) - 0.02);
        if (r.rev >= 1) startRevolt(sim, r, N);
      } else {
        const R = r.revolt, us = s.units.filter(u => u.loc === i && u.nation === N.code && !u.move && UNITS[u.type].domain === 'land');
        let sup = 0;
        for (const u of us) { const ageK = clamp(1 + (UNITS[u.type].age - N.age) * 0.25, 0.3, 1.2); sup += 0.12 * (u.hp / u.mhp) * ageK * (1 + (m.suppress || 0)); u.hp -= u.mhp * 0.012 * R.str / (R.str + us.length); }
        for (const u of us) if (u.hp <= 0) sim.removeUnit(u);
        R.str = R.str * (1 + 0.02 * (r.unrest + 0.3)) - sup;
        if (R.str <= 0.05) {
          r.revolt = null; r.rev = 0; r.unrest = clamp(r.unrest - 0.25, 0, 1); r.pop *= 0.97;
          sim.emit('unrest', `Order is restored in ${sim.w.regions[i].name}: the ${REVOLT_NAME[R.kind].toLowerCase()} is crushed.`, [N.code], { loc: i });
        } else if (R.str > 8 || (s.t - R.since > 24 * 30 && R.str > 1.5)) revoltOutcome(sim, r, N);
      }
      if (r.i === N.capital) continue;
      for (const f of holyAt.get(i) || []) if (N.faith === f) holy++;
    }
    if (!N.alive) continue;
    // holy cities of our faith bring pilgrims and prestige
    N.soc = { stability: holy * 0.002, pc: holy * 0.05, wealth: holy && N.techs.pilgrimage ? holy * 0.03 : 0 };
    for (const F of Object.values(s.faiths)) if (F.holy === N.capital && F.id === N.faith && F.kind !== 'folk') { N.soc.stability += 0.002; N.soc.pc += 0.05; }
    // officials: salaries, loyalty, and ambitious governors who reach for a crown
    let sal = 0;
    for (const [pid, id] of Object.entries(N.governors || {})) {
      const c = s.chars[id], tiles = (sim.provs[pid]?.tiles || []).filter(i => s.regions[i].owner === N.code);
      if (!c || !tiles.length) { if (c) retire(s, id); delete N.governors[pid]; continue; }
      sal += 1;
      c.loyalty = clamp(c.loyalty + (N.gov.approval > 0.5 ? 0.001 : -0.0015) + (c.traits.includes('Loyalist') ? 0.01 : 0), 0, 1);
      if (c.traits.includes('Ambitious') && c.loyalty < 0.45 && N.gov.stability < 0.35 && tiles.length >= 3 && !tiles.includes(N.capital) && Math.random() < 0.006) {
        delete N.governors[pid]; c.role = null;
        const R = sim.newCivilization(tiles[0], N.age, { tiles, techs: N.techs, rebel: true, parent: N.code });
        R.known = [...new Set([N.code, ...N.known.filter(x => s.nations[x]?.alive)])];
        for (const x of R.known) { const X = s.nations[x]; if (X && !X.known.includes(R.code)) X.known.push(R.code); }
        sim.setOpinion(R.code, N.code, -60); sim.declareWar(R.code, N.code, true);
        sim.emit('rise', `${governorTitle(N.age)} ${c.name} of ${sim.provs[pid].name} rebels against the ${sim.nm(N.code)} and proclaims the independent ${sim.full(R.code)}.`, [R.code, N.code], { loc: tiles[0], major: true });
        continue;
      }
    }
    for (const i of sim.owned.get(N.code) || []) { const r = s.regions[i]; if (r.mayor) { if (!s.chars[r.mayor] || r.lvl < 3) { retire(s, r.mayor); r.mayor = null; } else sal += 0.5; } }
    N.wealth -= sal * 0.01 * Math.pow(ageScale(N.age), 0.8);
    if (N.missions) { if (N.missions !== 'home' && !s.nations[N.missions]?.alive) N.missions = null; else N.wealth -= missionCost(N); }
    // the state faith follows its people; religions are founded
    faithEvents(sim, N, day);
  }
  // 2) faith spreads over a quarter of the land each day
  spreadFaith(sim, sp, day);
  // 3) movements rise and fall; modern militants strike
  movementsDaily(sim, day);
  // 4) faith colors diplomacy
  if (day % 15 === 0) faithDiplomacy(sim);
}

function faithEvents(sim, N, day) {
  const s = sim.s, F = s.faiths[N.faith];
  if (!F) { N.faith = 'f:' + N.culture; return; }
  if (N.techs.polytheism && F.kind === 'folk') {
    const P = s.faiths['p:' + N.culture];
    if (P) { if (Math.random() < 0.05) adoptFaith(sim, N, P.id, true); }
    else if (Math.random() < 0.08) foundFaith(sim, N, 'pantheon');
  }
  if (N.techs.philosophy && fstr(F) < 2.6 && s.faithCount.teaching < 3 && Math.random() < 0.004) foundFaith(sim, N, 'teaching');
  if (N.techs.monotheism && fstr(F) < 3 && s.faithCount.world < 4 && Math.random() < 0.006) foundFaith(sim, N, 'world');
  if (N.techs.reformation && (F.kind === 'world') && F.founder !== N.code && s.faithCount.reformed < 3 && N.gov.stability > 0.3 && Math.random() < 0.003) foundFaith(sim, N, 'reformed', F.id);
  // the ruling house follows the faith of its people, or the faith of powerful friends
  if (N.ai && (day + (N.code.charCodeAt(1) || 0)) % 30 === 0 && (!N.faithSince || s.t - N.faithSince > 24 * 120)) {
    const sh = faithShares(sim, N.code);
    const top = Object.entries(sh).sort((a, b) => b[1] - a[1])[0];
    if (top && top[0] !== N.faith && top[1] > 0.55 && fstr(s.faiths[top[0]]) >= fstr(F)) { adoptFaith(sim, N, top[0], true); return; }
    if (fstr(F) < 2.6 && Math.random() < 0.12) {
      const near = {}; for (const c of N.known || []) { const X = s.nations[c]; if (!X?.alive || sim.atWar(c, N.code)) continue; const XF = s.faiths[X.faith]; if (fstr(XF) > fstr(F) + 0.5) near[X.faith] = (near[X.faith] || 0) + 1 + Math.max(0, sim.opinion(N.code, c)) / 30; }
      const b = Object.entries(near).sort((a, b) => b[1] - a[1])[0];
      if (b) { adoptFaith(sim, N, b[0], true); N.missions = 'home'; }
    }
    if (N.saving || N.wealth < 10 * ageScale(N.age)) N.missions = null; // the treasury comes first
    else if (!N.missions && N.techs.priesthood && (sh[N.faith] || 0) < 0.7 && N.wealth > 30 * ageScale(N.age)) N.missions = 'home';
    else if (N.missions === 'home' && (sh[N.faith] || 0) > 0.9) N.missions = null;
    if (!N.missions && !N.saving && N.techs.missionaries && N.traits.caution < 0.5 && N.wealth > 60 * ageScale(N.age)) {
      const tgt = (N.known || []).filter(c => s.nations[c]?.alive && s.nations[c].faith !== N.faith && fstr(s.faiths[s.nations[c].faith]) < fstr(F));
      if (tgt.length) N.missions = pick(tgt);
    }
  }
}
function spreadFaith(sim, sp, day) {
  const s = sim.s, w = sim.w, ph = day % 4;
  const missions = new Map(); // target nation -> [[faith, k]]
  for (const N of Object.values(s.nations)) if (N.alive && N.missions && N.missions !== 'home') { const a = missions.get(N.missions) || []; a.push([N.faith, 1 + (N.mods?.convert || 0)]); missions.set(N.missions, a); }
  for (const i of sim.landIdx) {
    if (i % 4 !== ph) continue;
    const r = s.regions[i], pop = r.owner ? r.pop : (r.natives || 0);
    if (pop < 0.05) continue;
    const own = s.faiths[r.rel]; if (!own) { r.rel = 'f:' + cultureOf(sim.T[i]); continue; }
    const press = {};
    for (const j of w.adj[i]) {
      const q = s.regions[j]; if (q.sea || q.rel === r.rel) continue;
      const qp = q.owner ? q.pop : (q.natives || 0); if (qp < 0.05) continue;
      const F = s.faiths[q.rel]; if (!F) continue;
      press[q.rel] = (press[q.rel] || 0) + fstr(F) * Math.min(1.5, 0.3 + Math.sqrt(qp) / 4) * (F.holy === j ? 2 : 1) * (1 + 0.2 * (q.bld?.temple || 0));
    }
    const N = r.owner && s.nations[r.owner];
    if (N && N.faith !== r.rel && s.faiths[N.faith]) {
      const lw = lawOpt(N, 'religion').id;
      press[N.faith] = (press[N.faith] || 0) + fstr(s.faiths[N.faith]) * 0.8 * (1 + (N.mods?.convert || 0) + (lw === 'state' ? 0.5 : lw === 'tolerance' || lw === 'secular' ? -0.4 : 0) + (N.missions === 'home' ? 0.8 : 0));
    }
    if (N) for (const [f, k] of missions.get(N.code) || []) if (f !== r.rel && s.faiths[f]) press[f] = (press[f] || 0) + fstr(s.faiths[f]) * 0.6 * k;
    let best = null, bv = 0; for (const f in press) if (press[f] > bv) { bv = press[f]; best = f; }
    if (!best) continue;
    const resist = fstr(own) * (1 + 0.25 * (r.bld?.temple || 0)) * (own.holy === i ? 4 : 1) * (N && N.faith === r.rel ? 1.6 : 1);
    if (Math.random() < 0.08 * sp * bv / (bv + resist * 2.5)) r.rel = best;
  }
}
function movementsDaily(sim, day) {
  const s = sim.s;
  for (const M of s.movements) {
    const N = s.nations[M.nation];
    if (!N?.alive) { M.str = 0; continue; }
    const tiles = movTiles(sim, M);
    if (!tiles.length) { M.str = 0; continue; }
    if (M.sponsor && !s.nations[M.sponsor]?.alive) M.sponsor = null;
    const avg = tiles.reduce((a, i) => a + s.regions[i].unrest, 0) / tiles.length;
    M.str = clamp(M.str + (avg - 0.32) * 0.02 + (M.sponsor ? 0.005 : 0) + (M.kind === 'revolutionary' ? (0.4 - N.gov.approval) * 0.01 : 0), 0, 1);
    // strong movements spark open revolt
    if (M.str > 0.55 && N.age >= 1 && Math.random() < 0.03 * M.str) {
      const r = tiles.map(i => s.regions[i]).filter(r => !r.revolt && r.i !== N.capital && r.pop > 0.2).sort((a, b) => b.unrest - a.unrest)[0];
      if (r && r.unrest > 0.45) r.rev = 1;
    }
    // in the modern age, militants strike at cities
    if (N.age >= 7 && M.str > 0.2 && Math.random() < 0.03 * M.str * (1 - clamp(N.mods?.terror || 0, 0, 0.85))) terrorAttack(sim, N, M);
    // AI rulers respond
    if (N.ai && (day + M.id) % 10 === 0) aiMovement(sim, N, M, tiles);
  }
  s.movements = s.movements.filter(M => M.str > 0.005);
  // new movements form among restless minorities (each nation checked every ten days)
  for (const N of Object.values(s.nations)) {
    if (!N.alive || N.age < 1 || (day + (N.code.charCodeAt(1) || 0)) % 10) continue;
    const by = {};
    for (const i of sim.owned.get(N.code) || []) {
      const r = s.regions[i];
      if (r.cul !== N.cul) { const k = 'separatist|' + r.cul; (by[k] ||= []).push(r.unrest); }
      if (r.rel !== N.faith && s.faiths[r.rel]?.kind !== 'folk') { const k = 'sectarian|' + r.rel; (by[k] ||= []).push(r.unrest); }
    }
    for (const [k, us] of Object.entries(by)) {
      if (us.length < 3) continue;
      const avg = us.reduce((a, b) => a + b, 0) / us.length;
      const [kind, key] = k.split('|');
      if (avg > 0.38 && !s.movements.some(M => M.nation === N.code && M.kind === kind && M.key === key) && Math.random() < 0.5) newMovement(sim, N, kind, key);
    }
    if (N.age >= 4 && N.gov.approval < 0.3 && N.gov.stability < 0.4 && !s.movements.some(M => M.nation === N.code && M.kind === 'revolutionary') && Math.random() < 0.3) newMovement(sim, N, 'revolutionary', N.cul);
  }
}
function terrorAttack(sim, N, M) {
  const s = sim.s;
  const cities = [...(sim.owned.get(N.code) || [])].map(i => s.regions[i]).filter(r => r.lvl >= 3);
  if (!cities.length) return;
  const r = cities.sort((a, b) => b.pop * Math.random() - a.pop * Math.random())[0];
  r.damage = clamp(r.damage + 0.1, 0, 0.8); r.pop *= 0.997; r.unrest = clamp(r.unrest + 0.1, 0, 1);
  N.gov.stability = clamp(N.gov.stability - 0.015, 0, 1);
  if (GOV_TYPES[N.gov.type].democratic) N.gov.approval = clamp(N.gov.approval - 0.01, 0, 1);
  M.str = clamp(M.str - 0.04, 0, 1); M.attacks = (M.attacks || 0) + 1;
  const nm = sim.w.regions[r.i].name;
  sim.emit('terror', `Terror attack in ${nm}: the ${M.name} claim responsibility. The ${sim.nm(N.code)} mourn their dead.`, [N.code], { loc: r.i, major: N.code === s.player });
  if (M.sponsor && Math.random() < 0.25) {
    sim.addOpinion(N.code, M.sponsor, -35); for (const c of N.known || []) if (c !== M.sponsor && s.nations[c]?.alive) sim.addOpinion(c, M.sponsor, -6);
    sim.emit('terror', `Investigators trace the ${M.name} to agents of the ${sim.nm(M.sponsor)}. Outrage spreads around the world.`, [N.code, M.sponsor], { loc: r.i, major: true });
    M.exposed = true;
  }
}
function aiMovement(sim, N, M, tiles) {
  const s = sim.s, auth = !GOV_TYPES[N.gov.type].democratic;
  if (M.kind === 'separatist' && M.str > 0.75 && tiles.length >= 2 && tiles.length < (sim.owned.get(N.code)?.size || 0) * 0.25 && (N.techs.self_determination || N.traits.caution > 0.6) && Math.random() < 0.3) {
    grantAutonomy(sim, N, tiles, `Facing the ${M.name}, the ${sim.nm(N.code)} grant self-rule.`); M.str = 0; return;
  }
  if (M.str > 0.35) {
    if ((auth || M.str > 0.6) && N.gov.pc > 40) crackdown(sim, N, M.id);
    else if (N.wealth > concessionCost(N) * 3) concede(sim, N, M.id);
  }
  void s;
}
function faithDiplomacy(sim) {
  const s = sim.s;
  for (const A of Object.values(s.nations)) {
    if (!A.alive) continue;
    const FA = s.faiths[A.faith]; if (!FA || FA.kind === 'folk') continue;
    const tolA = ['tolerance', 'secular'].includes(lawOpt(A, 'religion').id);
    for (const c of A.known || []) {
      const B = s.nations[c]; if (!B?.alive) continue;
      const FB = s.faiths[B.faith]; if (!FB || FB.kind === 'folk') continue;
      const op = sim.opinion(A.code, c);
      if (A.faith === B.faith) { if (op < 30) sim.addOpinion(A.code, c, 1.5); }
      else if (!tolA && op > -30) sim.addOpinion(A.code, c, FA.parent === FB.id || FB.parent === FA.id ? -2 : -1);
      // a holy city held by unbelievers
      if (FA.holy != null && s.regions[FA.holy]?.owner === c && B.faith !== A.faith && op > -45) sim.addOpinion(A.code, c, -2);
    }
  }
}
// how much an AI ruler's faith and people push it toward war with a neighbour
export function warAffinity(sim, c, o) {
  const s = sim.s, A = s.nations[c], B = s.nations[o]; if (!A?.faith || !B) return 0;
  let v = 0;
  const FA = s.faiths[A.faith];
  if (FA && FA.kind !== 'folk' && FA.holy != null && s.regions[FA.holy]?.owner === o && B.faith !== A.faith) v += A.techs.holy_war ? 1.3 : 0.5;
  if (FA && FA.kind !== 'folk' && A.faith === B.faith) v -= 0.3;
  let kin = 0; for (const i of sim.owned.get(o) || []) if (s.regions[i].cul === A.cul) kin++;
  v += Math.min(0.8, kin * 0.2); // our people live under their rule
  return v;
}

// ------------------------------------------------------------------ AI officials (called from the AI's strategic pass)
export function aiOfficials(sim, c) {
  const s = sim.s, N = s.nations[c];
  if (!canGovern(N)) return;
  let n = 0;
  for (const p of provincesOf(sim, c).sort((a, b) => b.tiles.length - a.tiles.length)) {
    if (n >= 2) break;
    if (N.governors[p.id] || (p.tiles.length < 2 && !p.tiles.includes(N.capital))) continue;
    const ch = newOfficial(s, N, 'governor');
    const cost = officialCost(N, ch, false);
    if (N.gov.pc < cost + 20) { delete s.chars[ch.id]; break; }
    N.gov.pc -= cost; N.governors[p.id] = ch.id; ch.role = 'governor'; ch.prov = p.id; n++;
  }
  if (!canMayor(N)) return;
  for (const i of sim.owned.get(c) || []) {
    const r = s.regions[i]; if (r.lvl < 3 || r.mayor) continue;
    const ch = newOfficial(s, N, 'mayor'), cost = officialCost(N, ch, true);
    if (N.gov.pc < cost + 20) { delete s.chars[ch.id]; break; }
    N.gov.pc -= cost; r.mayor = ch.id; ch.role = 'mayor'; ch.city = i;
    if (++n >= 3) break;
  }
}
// send troops to put down revolts (called often)
export function aiRevolts(sim, c) {
  const s = sim.s;
  for (const i of sim.owned.get(c) || []) {
    const r = s.regions[i]; if (!r.revolt && (r.rev || 0) < 0.5) continue;
    const here = s.units.filter(u => u.nation === c && (u.loc === i || u.move?.path.at(-1) === i) && UNITS[u.type].domain === 'land').length;
    if (here >= (r.revolt ? Math.ceil(r.revolt.str / 1.5) : 1)) continue; // brewing trouble gets a garrison too
    const idle = s.units.filter(u => u.nation === c && !u.move && !u.fighting && UNITS[u.type].domain === 'land' && u.loc !== i && !s.regions[u.loc]?.revolt && !u.group).slice(0, 3);
    if (idle.length) sim.order(idle.map(u => u.id), i);
  }
}

// ------------------------------------------------------------------ narrative events about peoples, faiths and officials
const RS = (N, k) => Math.round(k * Math.pow(1.75, N.age));
EVENTS.push(
  { id: 'petition', minAge: 2, when: (sim, N) => { const r = pick(sim.regionsOf(N.code).filter(x => x.cul !== N.cul && x.pop > 0.3)); return r && { r, cul: r.cul }; }, title: 'A Petition from the Provinces',
    text: (c, N, sim) => `Elders of the ${cultureName(sim.s, c.cul)} people in ${c.rn} petition the throne for the right to keep their language, their courts and their customs.`,
    options: [
      { label: 'Grant their rights', fx: (sim, N, c) => { for (const r of sim.regionsOf(N.code)) if (r.cul === c.cul) { r.unrest = Math.max(0, r.unrest - 0.15); r.assim = (r.assim || 0) * 0.5; } N.gov.approval += 0.01; return 'The provinces rejoice. They will stay themselves a while longer.'; } },
      { label: 'One realm, one people', fx: (sim, N, c) => { for (const r of sim.regionsOf(N.code)) if (r.cul === c.cul) { r.unrest = Math.min(1, r.unrest + 0.12); r.assim = (r.assim || 0) + 0.2; } return 'Their schools now teach our tongue. Resentment smolders.'; } }] },
  { id: 'heresy', minAge: 3, when: (sim, N) => { const F = sim.s.faiths[N.faith]; if (!F || F.kind === 'folk') return null; const r = pick(sim.regionsOf(N.code).filter(x => x.lvl >= 2)); return r && { r }; }, title: 'Heresy',
    text: (c, N, sim) => `A preacher in ${c.rn} teaches that the priests of ${theFaith(sim.s, N.faith)} have betrayed the true faith. Crowds gather to listen.`,
    options: [
      { label: 'Let them debate', fx: (sim, N, c) => { c.r.unrest = Math.min(1, c.r.unrest + 0.05); N.research.prog += 5; return 'The disputation sharpens minds on both sides.'; } },
      { label: 'Silence the heretics', fx: (sim, N, c) => { N.gov.stability += 0.03; N.gov.approval -= 0.03; c.r.unrest = Math.min(1, c.r.unrest + 0.1); return 'The preacher is condemned. Order is kept; trust is not.'; } }] },
  { id: 'relic', minAge: 2, maxAge: 7, when: (sim, N) => { const F = sim.s.faiths[N.faith]; return F && !['folk', 'pantheon'].includes(F.kind) && {}; }, title: 'A Holy Relic',
    text: (c, N, sim) => `Pilgrims arrive at ${c.cap} bearing a relic of the founders of ${theFaith(sim.s, N.faith)}. They ask that a shrine be raised for it.`,
    options: [
      { label: 'Raise a great shrine', fx: (sim, N) => { N.wealth -= RS(N, 5); N.gov.stability += 0.04; N.gov.pc += 12; return 'The shrine draws pilgrims from far lands.'; } },
      { label: 'Sell it to a foreign court', fx: (sim, N) => { N.wealth += RS(N, 9); N.gov.approval -= 0.03; return 'The treasury is richer; the faithful are scandalized.'; } }] },
  { id: 'riots', minAge: 5, when: (sim, N) => { const r = sim.regionsOf(N.code).filter(x => x.lvl >= 3 && x.unrest > 0.3).sort((a, b) => b.unrest - a.unrest)[0]; return r && { r }; }, title: 'Riots in the Streets',
    text: c => `Bread prices and angry speeches have brought crowds into the streets of ${c.rn}. Shops burn.`,
    options: [
      { label: 'Send in the troops', fx: (sim, N, c) => { c.r.unrest = Math.max(0, c.r.unrest - 0.2); c.r.pop *= 0.995; N.gov.approval -= 0.03; return 'The square is cleared by nightfall. Names of the dead are whispered.'; } },
      { label: 'Hear their grievances', fx: (sim, N, c) => { N.wealth -= RS(N, 4); c.r.unrest = Math.max(0, c.r.unrest - 0.12); N.gov.approval += 0.01; return 'Grain is distributed and a commission is promised.'; } }] },
  { id: 'govscandal', minAge: 1, when: (sim, N) => { const e = pick(Object.entries(N.governors || {})); if (!e) return null; const c = sim.s.chars[e[1]]; return c && { pid: e[0], gname: c.name, pname: sim.provs[e[0]]?.name || 'a province' }; }, title: 'Scandal in the Provinces',
    text: c => `Auditors report that ${c.gname}, who governs ${c.pname}, has filled their own coffers from the provincial taxes.`,
    options: [
      { label: 'Dismiss and prosecute', fx: (sim, N, c) => { dismissGovernor(sim, N, c.pid); N.gov.approval += 0.02; N.wealth += RS(N, 3); return 'The stolen gold is recovered. The province needs a new governor.'; } },
      { label: 'Keep them; demand a share', fx: (sim, N) => { N.gov.pc += 12; N.gov.approval -= 0.03; return 'A quiet arrangement. The court is richer, and so is the governor.'; } }] },
  { id: 'missionaries', minAge: 3, when: (sim, N) => { const fs = Object.values(sim.s.nations).filter(x => x.alive && x.code !== N.code && N.known.includes(x.code) && x.faith !== N.faith && (sim.s.faiths[x.faith]?.kind || 'folk') !== 'folk'); const X = pick(fs); const r = X && pick(sim.regionsOf(N.code)); return r && { r, from: X.code, faith: X.faith }; }, title: 'Foreign Missionaries',
    text: (c, N, sim) => `Missionaries of ${theFaith(sim.s, c.faith)}, sent by the ${sim.nm(c.from)}, are preaching in ${c.rn} and winning converts.`,
    options: [
      { label: 'Let them preach', fx: (sim, N, c) => { c.r.rel = c.faith; sim.addOpinion(c.from, N.code, 12); return 'A new congregation grows. The faithful abroad think well of us.'; } },
      { label: 'Expel them', fx: (sim, N, c) => { sim.addOpinion(c.from, N.code, -12); N.gov.stability += 0.02; return 'The missionaries are escorted to the border.'; } }] },
);
