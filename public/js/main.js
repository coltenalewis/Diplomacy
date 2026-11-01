// UI controller: setup, game loop, map painting, units, labels and icons, input.
import { World, ll2v } from './world.js';
import { Globe } from './globe.js';
import { Sim, kmBetween } from './sim.js';
import { AI } from './ai.js';
import { AGES, ageScale } from './eras.js';
import { UNITS, SPEEDS, SETTLEMENTS } from './units.js';
import { modelFor } from './unitmodels.js';
import { initFloatPanel } from './floatpanel.js';
import { openSessionDialog } from './pacts-ui.js';
import { pactById } from './pacts.js';
import { COUNTRIES, P5, WARS, FAITHS_2025 } from './countries.js';
import { territories, countryByName as countryByName25, devOf, theOfficial } from './modern.js';
import { territories1939, nations1939, dev1939 } from './ww2.js';
import { TERRAIN, RES, classify, generateDeposits, rng, known } from './resources.js';
import { styleName, resolveEvent, GOV_TYPES } from './gov.js';
import { civColor } from './names.js';
import { G, $, esc, fmt, sgn, pct, popStr, toast, dstr, ICON, hexRGB, STOCK_ICON, setHTML } from './ui.js';
import { renderPanel, switchTab, openDossier, answer, renderTicker } from './panels.js';
import { openWar, closeWar, openCabinet, closeCabinet, cabinetReady, showManual, closeTree } from './dialogs.js';
import { openImperial, closeImperial, imperialReady, councilName } from './imperial.js';
import { lensColor, lensLegend } from './society-ui.js';
import { SCENARIOS } from './crises.js';
import { seasonName, SEASON_ICON, cold } from './seasons.js';

const SAVE_KEY = 'agesofcommand.v1';
const SUN25 = Date.UTC(2025, 0, 1, 6, 0, 0); // game hour 0: dawn over Greenwich, 1 January 2025 (or 1 September 1939)
const SUN39 = Date.UTC(1939, 8, 1, 6, 0, 0);
const sun0 = () => (G.sim?.s.ww2 ? SUN39 : SETUP.mode === 'ww2' && !G.sim ? SUN39 : SUN25);
const SETTLE_GLYPH = ['', '⛺', '🛖', '🏘️', '🏛️', '🏙️', '🌆'];

// ======================================================================= boot
async function boot() {
  const [json, geo] = await Promise.all([fetch('data/tiles.json').then(r => r.json()), fetch('data/tilegeo.json').then(r => r.json())]);
  G.json = json; G.geo = geo;
  G.world = new World(json);
  G.mapVersion = G.currentMap = json.version || 1;
  G.globe = new Globe($('#globe'), G.world, json);
  G.globe.initUnits();
  await G.globe.load();
  G.globe.setSunHours(SUN25, 0);
  Object.assign(G.fn, { openImperial, renderPanel, switchTab, answer, openDossier, selectRegion, computeStacks, renderSelbar, updateRings, refreshWorld, setSpeed, orderTo, selectedUnits, airborne, flyTile, showSetup, save, eta, renderTop });
  bindInput();
  bindChrome();
  initFloatPanel();
  requestAnimationFrame(frame);
  showSetup();
}

// ======================================================================= setup
const SETUP = { mode: '2025', c39: 'United Kingdom', country: 'United States of America', grp: 'great', q: '', scenario: 'standard', emerge: 1, civs: 24, age: 0, diff: 0, temper: 1, conquest: 0.5, name: '', color: '#4f8dff', tile: null, seed: Math.floor(Math.random() * 2 ** 31) };
const COLORS = ['#4f8dff', '#e6194b', '#3cb44b', '#ffe119', '#f58231', '#911eb4', '#46f0f0', '#f032e6', '#bcf60c', '#ff9ec4', '#00a6a6', '#c9a0ff', '#b8742a', '#ffffff'];
// ---- the world you play: 2025, or 1 September 1939
const W39 = () => SETUP.mode === 'ww2';
const landsNow = () => (W39() ? (G.lands39 ||= territories1939(G.world)) : (G.lands ||= territories(G.world)));
const nats39 = () => (G.nats39 ||= nations1939(landsNow()));
const countryByName = n => (W39() ? nats39().find(d => d.k === n) : countryByName25(n));
const pickKey = () => (W39() ? SETUP.c39 : SETUP.country);
const setPick = n => { if (W39()) SETUP.c39 = n; else SETUP.country = n; };
const modeTabs = () => `<div class="mode-tabs"><button class="mode-tab ${W39() ? '' : 'on'}" data-mode="2025"><b>The world of 2025</b><small>Lead a real country today: economy, elections, blocs, the UN.</small></button><button class="mode-tab ww2 ${W39() ? 'on' : ''}" data-mode="ww2"><b>The Second World War</b><small>1 September 1939: the Axis, the Allies, total war.</small></button></div>`;
// ---- choose the country you lead (the world of 2025)
const GROUPS = { all: 'All', great: 'Great powers', NATO: 'NATO', EU: 'EU', BRICS: 'BRICS', nuclear: 'Nuclear states', AU: 'Africa', ASEAN: 'ASEAN' };
const GREAT = ['United States of America', 'China', 'Russia', 'India', 'United Kingdom', 'France', 'Germany', 'Japan'];
const fmtPop = m => m >= 1000 ? (m / 1000).toFixed(2) + ' bn' : m >= 1 ? m.toFixed(m < 10 ? 1 : 0) + ' M' : Math.round(m * 1000) + ' k';
const fmtGdp = b => b >= 1000 ? '$' + (b / 1000).toFixed(1) + ' tn' : '$' + Math.round(b) + ' bn';
// the strategic situation of a country in one line
function briefing(c) {
  const war = WARS.find(w => w.includes(c.n)); const foe = war && war.find(x => x !== c.n);
  if (war) return `At war with ${countryByName(foe).s}. Hold the line, keep your allies, and win the peace.`;
  if (P5.includes(c.n)) return 'A permanent member of the UN Security Council, with a veto over the world\'s decisions.';
  if (c.nk) return 'A nuclear power. Deterrence protects you; the world watches every move.';
  if (c.b.includes('NATO')) return 'Sheltered by NATO\'s mutual defence. An attack on one is an attack on all.';
  if (devOf(c) < 0.25) return 'A developing nation: grow the economy, keep the peace at home, and court powerful friends.';
  if (c.gdp > 1000) return 'A major economy with the weight to shape its region.';
  return 'A middle power. Choose your friends carefully.';
}
function showSetup() {
  setSpeed(0); G.pick = null; $('#pickbar').classList.add('hidden');
  if (W39()) return showSetup39();
  const saved = loadSaved();
  const lands = G.lands ||= territories(G.world);
  const opt = (k, v, label, small) => `<button class="btn ${SETUP[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${label}${small ? `<small>${small}</small>` : ''}</button>`;
  const q = (SETUP.q || '').toLowerCase(), grp = SETUP.grp || 'great';
  const list = COUNTRIES.filter(c => lands.has(c.n)).filter(c => grp === 'all' || (grp === 'great' ? GREAT.includes(c.n) : grp === 'nuclear' ? c.nk > 0 : c.b.includes(grp))).filter(c => !q || c.s.toLowerCase().includes(q) || c.n.toLowerCase().includes(q)).sort((a, b) => b.gdp - a.gdp);
  const sel = countryByName(SETUP.country) || countryByName('United States of America');
  const milBar = v => `<span class="milbar"><i style="width:${Math.min(100, v)}%"></i></span>`;
  $('#modal-card').innerHTML = `
    <div class="kicker">1 January 2025 · the world as it is</div>
    <h1>Ages of <span>Command</span></h1>${modeTabs()}
    <p class="muted">Lead a real nation through the world of 2025. Run its economy and its politics, answer crises, win elections or crush dissent, build alliances and blocs, outvote rivals at the United Nations, research the technologies of tomorrow, and decide when, if ever, to go to war.</p>
    <div class="cp-wrap">
      <div class="cp-list">
        <div class="opt-row" style="gap:6px;flex-wrap:wrap">${Object.entries(GROUPS).map(([k, v]) => `<button class="chip ${grp === k ? 'on' : ''}" data-grp="${k}">${v}</button>`).join('')}</div>
        <input class="inp" id="cp-q" placeholder="Search 150 countries..." value="${esc(SETUP.q || '')}" style="width:100%;margin:8px 0">
        <div class="cp-rows">${list.map(c => `<div class="cp-row ${c.n === sel.n ? 'on' : ''}" data-cty="${esc(c.n)}"><span class="flagchip" style="background:${c.col || '#8a93a6'}"></span><span class="cp-n">${esc(c.s)}</span><span class="cp-g">${fmtGdp(c.gdp)}</span></div>`).join('') || '<div class="muted small">No country matches.</div>'}</div>
      </div>
      <div class="cp-detail">
        <div class="cp-flag" style="background:${sel.col || '#8a93a6'}"></div>
        <h2 style="margin:6px 0 2px">${esc(sel.f)}</h2>
        <div class="muted small">${esc(GOV_TYPES[sel.gov]?.name || sel.gov)} · capital ${esc(sel.cap[0])} · ${esc(FAITHS_2025[sel.fa]?.name || '')}</div>
        <div class="grid2" style="margin-top:10px">
          <span>Population</span><span>${fmtPop(sel.pop)}</span>
          <span>Economy (GDP)</span><span>${fmtGdp(sel.gdp)} · $${Math.round(sel.gdp / sel.pop * 1000).toLocaleString('en-US')} per head</span>
          <span>Armed forces</span><span>${milBar(sel.mil)} ${sel.mil >= 60 ? 'world power' : sel.mil >= 35 ? 'strong' : sel.mil >= 15 ? 'capable' : sel.mil >= 5 ? 'modest' : 'token'}</span>
          <span>Nuclear arsenal</span><span>${sel.nk ? `~${sel.nk.toLocaleString('en-US')} warheads` : 'none'}</span>
          <span>Blocs</span><span>${['UN', ...sel.b].join(', ')}${P5.includes(sel.n) ? ' · <b class="gold">UN veto</b>' : ''}</span>
          <span>Territory</span><span>${lands.get(sel.n)?.length || 0} provinces</span>
        </div>
        <p class="small" style="margin-top:10px">${esc(briefing(sel))}</p>
        <button class="btn" id="cp-map" style="margin-top:4px">Choose on the map instead &#9656;</button>
      </div>
    </div>
    <h2>Rival governments</h2>
    <div class="opt-row">${opt('diff', -0.2, 'Forgiving', 'Rivals develop slowly and forgive easily')}${opt('diff', 0, 'Realistic', 'An even contest')}${opt('diff', 0.3, 'Hardball', 'Rivals grow faster and distrust you sooner')}</div>
    <div class="modal-foot">
      ${saved ? `<button class="btn" id="st-resume">Resume: ${esc(saved.name)} (${esc(saved.when)})</button>` : ''}
      <button class="btn" id="st-help">Manual</button>
      <button class="btn go" id="st-go">Lead ${esc(sel.s)} &#9656;</button>
    </div>`;
  const card = $('#modal-card');
  for (const b of card.querySelectorAll('[data-k]')) b.onclick = () => { SETUP[b.dataset.k] = +b.dataset.v; showSetup(); };
  for (const b of card.querySelectorAll('[data-grp]')) b.onclick = () => { SETUP.grp = b.dataset.grp; showSetup(); };
  for (const b of card.querySelectorAll('[data-cty]')) b.onclick = () => { SETUP.country = b.dataset.cty; const sc = card.querySelector('.cp-rows').scrollTop; showSetup(); $('#modal-card .cp-rows').scrollTop = sc; };
  const qi = $('#cp-q'); qi.oninput = () => { SETUP.q = qi.value; if (SETUP.q && SETUP.grp !== 'all') SETUP.grp = 'all'; showSetup(); const x = $('#cp-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); };
  bindSetupCommon(card, saved);
}
function bindSetupCommon(card, saved) {
  for (const b of card.querySelectorAll('[data-mode]')) b.onclick = () => { SETUP.mode = b.dataset.mode; SETUP.q = ''; showSetup(); };
  $('#cp-map').onclick = beginPick;
  $('#st-go').onclick = () => startGame();
  $('#st-help').onclick = () => showManual(true);
  if (saved) $('#st-resume').onclick = () => resume(saved);
  $('#modal').classList.remove('hidden');
}

// ---- choose the nation you lead (1 September 1939)
const GROUPS39 = { great: 'Great powers', Axis: 'Axis', Allies: 'Allies', Comintern: 'Comintern', neutral: 'Neutrals', all: 'All' };
const GREAT39 = ['Germany', 'United Kingdom', 'France', 'Soviet Union', 'United States', 'Japan', 'Italy', 'China'];
const fmtGdp39 = b => '$' + Math.round(b) + ' bn (1990 $)';
const BRIEF39 = {
  Germany: 'Your armies are in Poland. Britain and France have pledged to defend it. Win quickly, before the world can unite against you, or the war will be long, and you will be judged for how you fought it.',
  'United Kingdom': 'Germany has invaded Poland, whose independence you guaranteed. An empire on which the sun never sets, and a navy that rules the waves: but your army is small and the Luftwaffe is near.',
  France: 'Allied to Poland and to Britain. The Maginot Line guards the frontier; the army is large but slow. The question is where the Germans will strike.',
  Poland: 'Attacked from the west at dawn, and soon from the east too. Hold out until Britain and France strike Germany, or fight on from exile.',
  'Soviet Union': 'A pact with Hitler bought you time and a secret share of Eastern Europe. It will not last forever. Build, purge or reform, and prepare.',
  'United States': 'Neutral, isolationist, and the greatest industrial power on Earth. Every belligerent wants your factories. When, and for whom, will you fight?',
  Japan: 'Two years into a war in China that will not end, and dependent on American oil. The resources of the south beckon; so does a war with the United States.',
  Italy: 'Allied to Germany by the Pact of Steel, but not ready for a great war. Wait, and the spoils go to others; strike too early, and Italy pays.',
  China: 'Two years of war against Japan have cost you the coast and the capital. Trade space for time; the world may yet come to your aid.',
  Finland: 'Moscow will soon demand your border lands. Your army is small, your forests deep, and your winters long.',
};
function briefing39(c) {
  if (BRIEF39[c.k]) return BRIEF39[c.k];
  if (c.lord) return `A possession of ${countryByName(c.lord)?.s || c.lord}: its fate is bound to its master's.`;
  if (c.side === 'Allies') return 'Bound to the Allies. Whether you fight is a matter of honour, and of survival.';
  if (c.side === 'Axis') return 'Bound to the Axis. Germany expects you to march when it marches.';
  return 'Neutral, for now. The great powers will court you, threaten you, or invade you.';
}
function showSetup39() {
  const saved = loadSaved();
  const lands = landsNow(), all = nats39();
  const opt = (k, v, label, small) => `<button class="btn ${SETUP[k] === v ? 'on' : ''}" data-k="${k}" data-v="${v}">${label}${small ? `<small>${small}</small>` : ''}</button>`;
  const q = (SETUP.q || '').toLowerCase(), grp = GROUPS39[SETUP.grp39] ? SETUP.grp39 : (SETUP.grp39 = 'great');
  const list = all.filter(d => lands.has(d.k)).filter(d => grp === 'all' || (grp === 'great' ? GREAT39.includes(d.k) : grp === 'neutral' ? !d.side : d.side === grp)).filter(d => !q || d.s.toLowerCase().includes(q) || d.k.toLowerCase().includes(q)).sort((a, b) => b.gdp - a.gdp);
  const sel = countryByName(SETUP.c39) || countryByName('United Kingdom');
  const milBar = v => `<span class="milbar"><i style="width:${Math.min(100, v)}%"></i></span>`;
  const lord = sel.lord ? countryByName(sel.lord) : null;
  $('#modal-card').innerHTML = `
    <div class="kicker">1 September 1939 · the world at war</div>
    <h1>Ages of <span>Command</span></h1>${modeTabs()}
    <p class="muted">Lead a nation through the Second World War. Mobilise the economy and the home front, hold your coalition together, race for radar, jets and the bomb, decide the great choices of the war as they come, and answer for how your forces fight.</p>
    <p class="ww2-note">Governments here can order acts the laws of war forbid: terror bombing, reprisals against civilians, forced labour, poison gas. The game names them as war crimes and makes them costly. It does not portray the Holocaust or other genocides as playable actions; leaders are fictional, and no party symbols are shown.</p>
    <div class="cp-wrap">
      <div class="cp-list">
        <div class="opt-row" style="gap:6px;flex-wrap:wrap">${Object.entries(GROUPS39).map(([k, v]) => `<button class="chip ${grp === k ? 'on' : ''}" data-grp39="${k}">${v}</button>`).join('')}</div>
        <input class="inp" id="cp-q" placeholder="Search ${all.length} nations..." value="${esc(SETUP.q || '')}" style="width:100%;margin:8px 0">
        <div class="cp-rows">${list.map(d => `<div class="cp-row ${d.k === sel.k ? 'on' : ''}" data-cty="${esc(d.k)}"><span class="flagchip" style="background:${d.col || '#8a93a6'}"></span><span class="cp-n">${esc(d.s)}</span><span class="cp-g">${d.side ? esc(d.side) : ''}</span></div>`).join('') || '<div class="muted small">No nation matches.</div>'}</div>
      </div>
      <div class="cp-detail">
        <div class="cp-flag" style="background:${sel.col || '#8a93a6'}"></div>
        <h2 style="margin:6px 0 2px">${esc(sel.f)}</h2>
        <div class="muted small">${esc(GOV_TYPES[sel.gov]?.name || sel.gov)}${sel.cap ? ` · capital ${esc(sel.cap[0])}` : ''}${lord ? ` · under ${esc(lord.s)}` : ''}</div>
        <div class="grid2" style="margin-top:10px">
          <span>Population</span><span>${fmtPop(sel.pop)}</span>
          <span>Economy (GDP)</span><span>${fmtGdp39(sel.gdp)}</span>
          <span>Armed forces</span><span>${milBar(sel.mil)} ${sel.mil >= 60 ? 'great power' : sel.mil >= 25 ? 'strong' : sel.mil >= 10 ? 'capable' : sel.mil >= 4 ? 'modest' : 'token'}</span>
          <span>Coalition</span><span>${sel.side ? esc(sel.side) : 'neutral'}</span>
          <span>Industry</span><span>${dev1939(sel) > 0.75 ? 'industrial power' : dev1939(sel) > 0.5 ? 'industrialising' : 'agrarian'}</span>
          <span>Territory</span><span>${lands.get(sel.k)?.length || 0} provinces</span>
        </div>
        <p class="small" style="margin-top:10px">${esc(briefing39(sel))}</p>
        <button class="btn" id="cp-map" style="margin-top:4px">Choose on the map instead &#9656;</button>
      </div>
    </div>
    <h2>Rival governments</h2>
    <div class="opt-row">${opt('diff', -0.2, 'Forgiving', 'Rivals produce less and forgive easily')}${opt('diff', 0, 'Historical', 'An even contest')}${opt('diff', 0.3, 'Hardball', 'Rivals out-produce you and trust you less')}</div>
    <div class="modal-foot">
      ${saved ? `<button class="btn" id="st-resume">Resume: ${esc(saved.name)} (${esc(saved.when)})</button>` : ''}
      <button class="btn" id="st-help">Manual</button>
      <button class="btn go" id="st-go">Lead ${esc(sel.s)} &#9656;</button>
    </div>`;
  const card = $('#modal-card');
  for (const b of card.querySelectorAll('[data-k]')) b.onclick = () => { SETUP[b.dataset.k] = +b.dataset.v; showSetup(); };
  for (const b of card.querySelectorAll('[data-grp39]')) b.onclick = () => { SETUP.grp39 = b.dataset.grp39; showSetup(); };
  for (const b of card.querySelectorAll('[data-cty]')) b.onclick = () => { SETUP.c39 = b.dataset.cty; const sc = card.querySelector('.cp-rows').scrollTop; showSetup(); $('#modal-card .cp-rows').scrollTop = sc; };
  const qi = $('#cp-q'); qi.oninput = () => { SETUP.q = qi.value; if (SETUP.q && SETUP.grp39 !== 'all') SETUP.grp39 = 'all'; showSetup(); const x = $('#cp-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); };
  bindSetupCommon(card, saved);
}

// ---- or pick the country on the globe
function countryAt(i) { const lands = landsNow(); for (const [n, tiles] of lands) if (tiles.includes(i)) return n; return null; }
function beginPick() {
  $('#modal').classList.add('hidden');
  G.pick = { tile: null, country: pickKey() };
  renderPick();
  $('#pickbar').classList.remove('hidden');
  const c = countryByName(pickKey()); if (c?.cap) G.globe.flyTo(c.cap[1], c.cap[2], 2.2);
}
function renderPick() {
  if (G.pick.tile !== null && G.pick.tile !== undefined) { const n = countryAt(G.pick.tile); if (n) G.pick.country = n; }
  const c = countryByName(G.pick.country);
  $('#pickbar').innerHTML = `<div class="pk-main">${c ? `<b>${esc(c.f)}</b> · ${esc(GOV_TYPES[c.gov]?.name || '')} · ${fmtPop(c.pop)} people · ${W39() ? fmtGdp39(c.gdp) : fmtGdp(c.gdp)} · ${esc(W39() ? briefing39(c) : briefing(c))}` : 'Click a country on the globe.'}</div>
    <div class="pk-btns"><button class="btn" id="pk-back">&#9666; Back</button><button class="btn" id="pk-rand">Random country</button><button class="btn go" id="pk-go" ${c ? '' : 'disabled'}>Lead ${c ? esc(c.s) : 'this country'} &#9656;</button></div>`;
  $('#pk-back').onclick = () => { G.pick = null; paintPick(); showSetup(); };
  $('#pk-rand').onclick = () => { const all = [...landsNow().keys()]; G.pick.country = all[(Math.random() * all.length) | 0]; G.pick.tile = null; const r = countryByName(G.pick.country); if (r?.cap) G.globe.flyTo(r.cap[1], r.cap[2], 2.2); renderPick(); };
  $('#pk-go').onclick = () => { setPick(G.pick.country); G.pick = null; $('#pickbar').classList.add('hidden'); startGame(); };
  paintPick();
}
function paintPick() {
  const g = G.globe, lands = landsNow();
  for (const R of G.world.regions) g.setRegion(R.i, { alpha: 0, highlight: 0 });
  if (G.pick) for (const [n, tiles] of lands) {
    const c = countryByName(n), on = n === G.pick.country;
    for (const i of tiles) g.setRegion(i, { color: c?.col || '#8a93a6', alpha: on ? 0.6 : 0.22, highlight: on ? 0.6 : i === G.hover ? 0.3 : 0 });
  }
  g.commitPalette();
}

// switch the globe and world to another map version (old saves keep the map they were made on)
async function useMap(v) {
  if (G.mapVersion === v) return;
  G.sim = null; G.ai = null; G.region = null; G.hover = null; G.sel.clear();
  const sfx = v === G.currentMap ? '' : '-v' + v;
  const [json, geo] = await Promise.all([fetch(`data/tiles${sfx}.json`).then(r => r.json()), fetch(`data/tilegeo${sfx}.json`).then(r => r.json())]);
  G.json = json; G.geo = geo; G.world = new World(json); G.mapVersion = v;
  G.globe.setWorld(G.world, json);
  for (const m of [G.markerEls, G.labelEls, G.iconEls]) { for (const el of m.values()) el.remove(); m.clear(); }
}
async function startGame() {
  await useMap(G.currentMap);
  const ww2 = W39();
  const sim = new Sim(G.world, G.geo, { country: ww2 ? SETUP.c39 : SETUP.country, scenario: ww2 ? 'ww2' : null, difficulty: SETUP.diff, seed: SETUP.seed });
  SETUP.seed = Math.floor(Math.random() * 2 ** 31);
  attach(sim);
  const N = sim.s.nations[sim.s.player];
  if (ww2) sim.emit('info', `1 September 1939. At dawn, German armies crossed the Polish frontier. You lead ${theOfficial(N)}.`, [N.code], { major: true });
  else sim.emit('info', `You take office as leader of ${theOfficial(N)}. The date is 1 January 2025.`, [N.code]);
  $('#modal').classList.add('hidden');
  const cap = G.world.regions[N.capital];
  G.globe.flyTo(cap.lat, cap.lon, 1.9);
  selectRegion(N.capital);
  setSpeed(1);
}
async function resume(saved) {
  try {
    const st = JSON.parse(localStorage.getItem(SAVE_KEY));
    await useMap(st.s.mapVersion || 1);
    const sim = new Sim(G.world, G.geo, { state: st.s });
    attach(sim);
    $('#modal').classList.add('hidden');
    const cap = G.world.regions[sim.s.nations[sim.s.player].capital];
    G.globe.flyTo(cap.lat, cap.lon, 1.9);
    selectRegion(sim.s.nations[sim.s.player].capital);
    setSpeed(0);
  } catch (e) { console.error(e); toast('System', 'The saved game could not be loaded.', 'warn'); }
}
function attach(sim) {
  G.sim = sim; G.ai = new AI(sim);
  G.sel.clear(); G.dip = null; G.ownerSig = ''; G.disp.clear(); G.trails.clear(); G.scarCount = -1;
  for (const m of [G.markerEls, G.labelEls, G.iconEls]) { for (const el of m.values()) el.remove(); m.clear(); }
  sim.on(onEvent);
  G.globe.setSunHours(sun0(), sim.s.t);
  refreshWorld(true);
  computeStacks();
  renderTicker();
  renderPanel(true);
  if (sim.s.pendingEvent) G.fn.showEvent(sim.s.pendingEvent);
}
function save(silent) {
  try {
    const s = G.sim.s, P = s.nations[s.player];
    localStorage.setItem(SAVE_KEY, JSON.stringify({ s, name: P.name, when: dstr(s.year) }));
    if (!silent) toast('System', 'Game saved.', 'good');
  } catch { toast('System', 'Save failed: browser storage is full or unavailable.', 'warn'); }
}
function loadSaved() { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY)); return v?.s?.player ? { name: v.name, when: v.when } : null; } catch { return null; } }

// ======================================================================= main loop
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  const sim = G.sim;
  if (sim && !sim.s.over) {
    G.acc += dt * SPEEDS[G.speed];
    let steps = 0;
    const cap = G.speed >= 5 ? 120 : 48;
    while (G.acc >= 1 && steps < cap) { sim.step(); G.ai.hourly(); G.acc -= 1; steps++; }
    if (steps >= cap) G.acc = 0;
    if (steps) { refreshWorld(false); if (sim.s.over) G.fn.gameOver(); }
    if (sim.shots.length) processShots(sim.shots.splice(0));
    G.globe.setSunHours(sun0(), sim.s.t + G.acc);
  } else if (!sim) G.globe.setSunHours(sun0(), performance.now() / 1000 * 0.8);
  G.globe.tick();
  if (sim) {
    if (now - G.lastStacks > 200) { computeStacks(); G.lastStacks = now; }
    if (!(now - (G.lastTowns || 0) < 1000)) { G.lastTowns = now; syncTowns(); }
    drawUnits();
    placeLabels();
    placeIcons(now);
    if (now - G.lastRings > 500) { updateRings(); G.lastRings = now; }
    if (now - G.lastPanel > 500) { renderTop(); renderStanding(); renderPanel(false); G.lastPanel = now; }
  }
  G.globe.render();
  requestAnimationFrame(frame);
}
function setSpeed(k) {
  G.speed = k;
  for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', +b.dataset.s === k);
  $('#paused').classList.toggle('hidden', k !== 0 || !G.sim);
}

// ======================================================================= world painting
function refreshWorld(force) {
  const sim = G.sim, s = sim.s, globe = G.globe, P = s.player;
  const owners = s.regions.map(r => (r.owner && G.empireView ? sim.realmOf(r.owner) : r.owner));
  const sig = (G.empireView ? 'E' : 'P') + owners.join(',') + '|' + Object.values(s.nations).filter(n => n.alive && n.overlord).map(n => n.code + '>' + n.overlord).join(',');
  if (force || sig !== G.ownerSig) { G.ownerSig = sig; globe.updateNationBorders(owners, c => (G.empireView ? sim.col(c) : sim.borderCol(c))); computeNationLabels(); }
  // nations at war with us glow red along their borders (in empire view, whole realms that include a foe)
  const foes = new Set(Object.keys(s.nations).filter(c => s.nations[c].alive && sim.atWar(P, c)));
  if (G.empireView) for (const c of [...foes]) foes.add(sim.realmOf(c));
  const warSig = sig + '#' + [...foes].sort().join(',');
  if (force || warSig !== G.warSig) { G.warSig = warSig; globe.updateWarBorders(owners, c => !!c && foes.has(c), G.empireView ? sim.realmOf(P) : P); }
  for (const r of s.regions) {
    const hl = r.i === G.region ? 0.9 : r.i === G.hover ? 0.35 : 0;
    if (r.sea) { globe.setRegion(r.i, { alpha: 0, highlight: hl, light: 0, glow: 0 }); continue; }
    if (G.lens && (r.owner || (r.natives || 0) > 0.05) && !((G.lens === 'unrest' || G.lens === 'pacts') && !r.owner)) {
      globe.setRegion(r.i, { color: lensColor(r), alpha: r.owner ? 0.55 : 0.3, highlight: hl, light: 0, glow: r.owner ? Math.min(0.95, 0.1 + r.lvl * 0.12) * (1 - r.damage) : 0.05, contested: r.revolt ? 0.9 : r.capture ? Math.min(1, 0.4 + r.capture.p) : 0 });
      continue;
    }
    if (!r.owner) {
      const claimBy = r.claim?.by;
      globe.setRegion(r.i, { color: claimBy ? sim.col(claimBy) : '#000000', alpha: claimBy && G.overlay === 'political' ? 0.14 : 0, highlight: hl, light: 0, glow: (r.natives || 0) > 0.6 ? 0.05 : 0, contested: r.capture ? Math.min(1, 0.3 + r.capture.p) : claimBy ? 0.25 : 0 });
      continue;
    }
    const N = s.nations[r.owner];
    const occupied = r.core && r.owner !== r.core;
    const electric = N.age >= 6 ? Math.min(1.6, (0.35 + (N.age - 6) * 0.3) * (0.4 + r.lvl * 0.2)) * (1 - r.damage) * (N.st.eF ?? 1) : 0;
    const fire = Math.min(0.95, 0.1 + r.lvl * 0.12 + Math.log10(1 + r.pop) * 0.05);
    const realm = G.empireView ? sim.realmOf(r.owner) : null;
    globe.setRegion(r.i, { color: realm ? sim.col(realm) : sim.dispCol(r.owner), alpha: G.overlay === 'political' ? ((realm || r.owner) === P ? 0.36 : occupied ? 0.42 : 0.27) : 0, light: electric, highlight: hl, glow: fire * (1 - r.damage), contested: r.capture ? Math.min(1, 0.4 + r.capture.p) : 0 });
  }
  globe.commitPalette();
  const lg = $('#lens-legend'); if (G.lens) { if (force || !G._lgAt || performance.now() - G._lgAt > 3000) { lg.innerHTML = lensLegend(); G._lgAt = performance.now(); } lg.classList.remove('hidden'); } else lg.classList.add('hidden');
  if (s.scars.length !== G.scarCount) { G.scarCount = s.scars.length; globe.setScars(s.scars); }
  globe.syncRoutes(s.trades.map(t => ({ id: t.id, sig: t.path.join('-'), kind: t.good === 'food' ? 'food' : 'goods', blockaded: t.blockaded, mine: t.from === P || t.to === P, latlon: t.path.map(i => [G.world.regions[i].lat, G.world.regions[i].lon]) })));
}
function computeNationLabels() {
  const s = G.sim.s, w = G.world, acc = {};
  for (const r of s.regions) {
    if (r.sea || !r.owner) continue;
    const R = w.regions[r.i], v = ll2v(R.lat, R.lon);
    const k = G.empireView ? G.sim.realmOf(r.owner) : r.owner;
    const a = acc[k] ||= { x: 0, y: 0, z: 0, n: 0 };
    a.x += v[0]; a.y += v[1]; a.z += v[2]; a.n++;
  }
  G.nationLabels = Object.entries(acc).map(([c, a]) => { const L = Math.hypot(a.x, a.y, a.z) || 1; return { c, lat: Math.asin(a.y / L) * 180 / Math.PI, lon: Math.atan2(-a.z, a.x) * 180 / Math.PI, n: a.n }; });
}

// ---------------------------------------------------------------- units: smooth dots, trails, medallion badges
const lerpLL = (a, b, t) => { const dl = ((b[1] - a[1] + 540) % 360) - 180; return [a[0] + (b[0] - a[0]) * t, a[1] + dl * t]; };
function airborne(u) { return u.air && u.air.phase !== 'base'; }
function drawUnits() {
  const s = G.sim.s, g = G.globe, alpha = Math.min(1, G.acc);
  const list = [], trailList = [];
  const now = performance.now();
  for (const u of s.units) {
    const p = lerpLL(u.ppos || u.pos, u.pos, alpha);
    const air = airborne(u);
    G.disp.set(u.id, p);
    const T = UNITS[u.type];
    const col = hexRGB(G.sim.col(u.nation));
    const flag = (G.sel.has(u.id) ? 1 : 0) | (u.nation === s.player ? 2 : 0) | (air ? 4 : 0) | (T.domain === 'sea' ? 8 : 0) | (u.fighting ? 16 : 0);
    const size = (air ? 5.5 : T.domain === 'sea' ? (T.role === 'carrier' ? 9 : 7.5) : T.role === 'mounted' ? 7 : 6.3) * (u.nation === s.player ? 1.1 : 1);
    const f = G.formOf?.get(u.id);
    list.push({ id: u.id, lat: p[0], lon: p[1], alt: air ? 0.014 : 0, color: col, size, flag, model: modelFor(T), moving: !!u.move, form: f, slot: f?.[2] || 0 });
    if (air || (T.domain === 'sea' && u.move)) {
      let h = G.trails.get(u.id);
      if (!h) { h = []; G.trails.set(u.id, h); }
      const last = h[h.length - 1];
      if (!last || now - last.t > 70) { h.push({ p: [p[0], p[1], air ? 0.014 : 0], t: now }); if (h.length > (air ? 14 : 9)) h.shift(); }
      trailList.push({ pts: h.map(x => x.p), color: air ? col : [0.7, 0.85, 1] });
    } else if (G.trails.has(u.id)) G.trails.delete(u.id);
  }
  if (G.disp.size > s.units.length * 1.5) { const live = new Set(s.units.map(u => u.id)); for (const k of G.disp.keys()) if (!live.has(k)) G.disp.delete(k); }
  g.setUnits(list);
  g.setTrails(trailList);
  placeMarkers();
}
// 3D settlements: every owned land with a settlement, styled by its people's age
function syncTowns() {
  const sim = G.sim, s = sim.s, list = [];
  for (const r of s.regions) {
    if (!r.owner || !r.lvl) continue;
    const R = G.world.regions[r.i], N = s.nations[r.owner]; if (!N) continue;
    const [lat, lon] = R.city || [R.lat, R.lon];
    list.push({ i: r.i, lat, lon, lvl: r.lvl, age: N.age, color: hexRGB(sim.col(r.owner)), cap: N.capital === r.i });
  }
  G.globe.towns.sync(list);
}
function computeStacks() {
  const s = G.sim.s, w = G.world;
  const m = new Map();
  for (const u of s.units) {
    if (airborne(u)) continue;
    const T = UNITS[u.type];
    const key = (u.move ? `${u.nation}|${u.move.path[u.move.seg]}>${u.move.path[u.move.seg + 1]}|${u.move.path.at(-1)}|${T.domain}` : `${u.nation}|${u.loc}|${T.domain}`) + '|' + (u.det || 0);
    let st = m.get(key);
    if (!st) { st = { key, nation: u.nation, loc: u.loc, units: [], domain: T.domain, moving: !!u.move, fight: false, dest: u.move ? u.move.path.at(-1) : null }; m.set(key, st); }
    st.units.push(u); if (u.fighting) st.fight = true;
  }
  const stacks = [...m.values()];
  for (const st of stacks) {
    const cnt = {}; for (const u of st.units) cnt[u.type] = (cnt[u.type] || 0) + 1;
    st.main = Object.entries(cnt).sort((x, y) => y[1] - x[1])[0][0];
    st.hp = st.units.reduce((a, u) => a + u.hp / u.mhp, 0) / st.units.length;
    st.xp = st.units.reduce((a, u) => a + (u.xp || 0), 0) / st.units.length;
    st.sel = st.units.some(u => G.sel.has(u.id));
    if (st.moving) { const R = w.regions[st.dest]; st.toward = [R.lat, R.lon]; }
  }
  // detachments sharing a tile sit side by side
  const byTile = new Map();
  for (const st of stacks) { if (st.moving) continue; const k = st.nation + '|' + st.loc + '|' + st.domain; if (!byTile.has(k)) byTile.set(k, []); byTile.get(k).push(st); }
  for (const list of byTile.values()) list.sort((a, b) => (a.units[0].det || 0) - (b.units[0].det || 0)).forEach((st, k) => { st.slot = k - (list.length - 1) / 2; });
  G.stacks = stacks;
  // each unit's place in its stack's formation
  G.formOf = new Map();
  for (const st of stacks) st.units.forEach((u, k) => G.formOf.set(u.id, [k, st.units.length, st.slot || 0]));
  G.capMarks = s.regions.filter(r => r.capture).map(r => ({ key: 'c' + r.i, lat: w.regions[r.i].lat, lon: w.regions[r.i].lon, p: r.capture.p }));
  syncMarkerEls();
}
function syncMarkerEls() {
  const host = $('#markers'); const s = G.sim.s;
  const seen = new Set();
  const make = (key, cls) => { let el = G.markerEls.get(key); if (!el) { el = document.createElement('div'); el.className = cls; host.appendChild(el); G.markerEls.set(key, el); } seen.add(key); return el; };
  for (const st of G.stacks) {
    const el = make('u' + st.key, 'tok');
    const xs = st.xp >= 75 ? '★★★' : st.xp >= 50 ? '★★' : st.xp >= 25 ? '★' : '';
    const hp = Math.round(st.hp * 100);
    const html = `<i class="ic">${ICON[UNITS[st.main].sym] || ICON.inf}</i>${st.units.length > 1 ? `<b class="n">${st.units.length}</b>` : ''}${xs ? `<span class="xp">${xs}</span>` : ''}<span class="hp"><i style="width:${hp}%;background:${st.hp < 0.35 ? '#ff5d5d' : st.hp < 0.7 ? '#ffb547' : '#5ee39a'}"></i></span>`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.style.setProperty('--c', G.sim.col(st.nation));
    const cls = `tok${st.nation === s.player ? ' mine' : ' small'}${st.sel ? ' sel' : ''}${st.moving ? ' moving' : ''}${st.fight ? ' fight' : ''}${G.boxHits && st.units.some(u => G.boxHits.has(u.id)) ? ' boxhit' : ''}`;
    if (el.className !== cls) el.className = cls;
    el._st = st;
    if (!el._bound) {
      el._bound = true;
      el.addEventListener('pointerdown', e => e.stopPropagation());
      el.addEventListener('click', e => { e.stopPropagation(); clickStack(el._st, e.shiftKey || e.ctrlKey); });
      el.addEventListener('contextmenu', e => { e.preventDefault(); e.stopPropagation(); orderTo(el._st.loc); });
      el.addEventListener('mouseenter', () => showStackTip(el._st, el));
      el.addEventListener('mouseleave', () => $('#tooltip').classList.add('hidden'));
    }
  }
  for (const c of G.capMarks) { const el = make(c.key, 'cap'); el.innerHTML = `<i style="width:${Math.round(c.p * 100)}%"></i>`; el._ll = c; }
  for (const [k, el] of G.markerEls) if (!seen.has(k)) { el.remove(); G.markerEls.delete(k); }
}
function placeMarkers() {
  const g = G.globe, dist = g.distance(), s = G.sim.s;
  const showOthers = dist < 2.35;
  for (const el of G.markerEls.values()) {
    let lat, lon; const st = el._st;
    if (st) {
      let x = 0, y = 0, z = 0;
      for (const u of st.units) { const p = G.disp.get(u.id) || u.pos; const v = ll2v(p[0], p[1]); x += v[0]; y += v[1]; z += v[2]; }
      const L = Math.hypot(x, y, z) || 1; lat = Math.asin(y / L) * 180 / Math.PI; lon = Math.atan2(-z, x) * 180 / Math.PI;
    } else { lat = el._ll.lat; lon = el._ll.lon; }
    const p = g.project(lat, lon, 1.01);
    let hide = !p.visible || p.facing < 0.12;
    if (st && !showOthers && st.nation !== s.player && !st.fight) hide = true;
    if (hide) { if (el.style.display !== 'none') el.style.display = 'none'; continue; }
    if (el.style.display === 'none') el.style.display = '';
    if (!st) { el.style.transform = `translate3d(${(p.x - 20).toFixed(1)}px,${(p.y + 12 - 20).toFixed(1)}px,0)`; continue; }
    // a slim tag floating over the models
    const ox = st.slot ? st.slot * 30 : 0, oy = st.domain === 'air' ? -42 : -24;
    el.style.transform = `translate3d(${(p.x + ox).toFixed(1)}px,${(p.y + oy).toFixed(1)}px,0) translate(-50%,-100%)`;
  }
}
function placeLabels() {
  const g = G.globe, dist = g.distance(), sim = G.sim, s = sim.s;
  const host = $('#labels'); const seen = new Set();
  if (G.showLabels && G.nationLabels) {
    if (dist > 1.45) for (const nl of G.nationLabels) {
      if (dist > 3.2 && nl.n < 6) continue;
      if (dist > 2.3 && nl.n < 2) continue;
      const p = g.project(nl.lat, nl.lon, 1.0); if (!p.visible || p.facing < 0.35) continue;
      const k = 'n' + nl.c; seen.add(k);
      let el = G.labelEls.get(k);
      const nv = G.empireView ? sim.vassalsOf(nl.c).length : 0;
      const txt = sim.nm(nl.c) + (nv ? ` +${nv}` : '');
      if (!el) { el = document.createElement('div'); el.className = 'lab nation'; host.appendChild(el); G.labelEls.set(k, el); }
      if (el.textContent !== txt) { el.textContent = txt; el._w = 0; }
      el.classList.toggle('major', nl.n >= 12);
      el.style.color = G.empireView ? sim.col(nl.c) : sim.borderCol(nl.c);
      if (!el._w) el._w = el.offsetWidth;
      el.style.transform = `translate3d(${(p.x - el._w / 2).toFixed(1)}px,${(p.y - 9).toFixed(1)}px,0)`; el.style.opacity = Math.min(0.92, (p.facing - 0.3) * 2).toFixed(2);
    }
    if (dist < 1.75) {
      let n = 0;
      const caps = new Set(Object.values(s.nations).filter(N => N.alive).map(N => N.capital));
      for (const R of G.world.regions) {
        if (R.sea && dist > 1.4) continue;
        const p = g.project(R.lat, R.lon, 1.0); if (!p.visible || p.facing < 0.82) continue;
        if (++n > 160) break;
        const k = 'r' + R.i; seen.add(k);
        let el = G.labelEls.get(k);
        if (!el) { el = document.createElement('div'); el.textContent = R.name; el.className = 'lab region' + (caps.has(R.i) ? ' capital' : ''); if (R.sea) el.style.color = 'rgba(140,210,255,.55)'; host.appendChild(el); G.labelEls.set(k, el); el._w = 0; }
        if (!el._w) el._w = el.offsetWidth;
        el.style.transform = `translate3d(${(p.x - el._w / 2).toFixed(1)}px,${(p.y + 14).toFixed(1)}px,0)`;
      }
    }
  }
  for (const [k, el] of G.labelEls) if (!seen.has(k)) { el.remove(); G.labelEls.delete(k); }
}
// settlement glyphs and known deposits on tiles when zoomed in
function placeIcons(now) {
  const g = G.globe, dist = g.distance(), s = G.sim.s, P = s.nations[s.player];
  const host = $('#icons'); const seen = new Set();
  const refresh = now - G.lastIcons > 400; if (refresh) G.lastIcons = now;
  if (G.showIcons && dist < 1.95) {
    let n = 0;
    for (const R of G.world.regions) {
      if (R.sea) continue;
      const p = g.project(R.lat, R.lon, 1.0); if (!p.visible || p.facing < 0.78) continue;
      if (++n > 180) break;
      const k = 'i' + R.i; seen.add(k);
      let el = G.iconEls.get(k);
      if (!el) { el = document.createElement('div'); el.className = 'ticon'; host.appendChild(el); G.iconEls.set(k, el); el._i = R.i; el.onclick = e => { e.stopPropagation(); selectRegion(R.i); }; }
      if (refresh || !el._h) {
        const r = s.regions[R.i];
        const deps = r.dep.filter(d => known(P, d.r)).slice(0, dist < 1.5 ? 4 : 2).map(d => `<i title="${RES[d.r].name}">${RES[d.r].icon}</i>`).join('');
        const st = r.owner ? `<b class="sg" style="--c:${G.sim.col(r.owner)}" title="${SETTLEMENTS[r.lvl].name}">${SETTLE_GLYPH[r.lvl] || ''}${r.owner && s.nations[r.owner].capital === R.i ? '<s>★</s>' : ''}</b>` : (r.natives || 0) > 0.6 ? '<b class="sg wild" title="Native peoples">🔥</b>' : '';
        const work = r.build ? `<u style="width:${Math.round((1 - r.build.left / r.build.total) * 100)}%"></u>` : r.claim ? `<u class="cl" style="width:${Math.round((1 - r.claim.left / r.claim.total) * 100)}%"></u>` : '';
        const h = `${st}<span class="dp">${deps}</span>${work ? `<em>${work}</em>` : ''}`;
        if (el._h !== h) { el.innerHTML = h; el._h = h; }
      }
      el.style.transform = `translate3d(${(p.x - 24).toFixed(1)}px,${(p.y - 22).toFixed(1)}px,0)`;
    }
  }
  for (const [k, el] of G.iconEls) if (!seen.has(k)) { el.remove(); G.iconEls.delete(k); }
}
function updateRings() {
  const units = selectedUnits(), rings = [], paths = [];
  const seen = new Set();
  for (const u of units) {
    const T = UNITS[u.type];
    const p = G.disp.get(u.id) || u.pos;
    const km = T.domain === 'air' ? T.radius : T.range;
    const key = u.type + ':' + (u.move ? 'm' + u.id : u.loc);
    if (km > 40 && !seen.has(key)) { seen.add(key); const base = T.domain === 'air' ? G.sim.anchor(u.loc) : p; rings.push({ lat: base[0], lon: base[1], km, color: T.domain === 'air' ? 0x9fd8ff : T.domain === 'sea' ? 0x5cc8d6 : 0xe9c46a }); }
    if (u.move && !seen.has('p' + u.move.path.join('-'))) { seen.add('p' + u.move.path.join('-')); paths.push([p, ...u.move.path.slice(u.move.seg + 1).map(i => G.sim.anchor(i))]); }
  }
  G.globe.setRings(rings); G.globe.setPaths(paths);
}
function processShots(list) {
  const g = G.globe;
  if (list.length > 40) list = list.sort(() => Math.random() - 0.5).slice(0, 40);
  for (const sh of list) {
    const pa = g.project(sh.a[0], sh.a[1]), pb = g.project(sh.b[0], sh.b[1]);
    if (!pa.visible && !pb.visible && !['icbm', 'nukebomb'].includes(sh.k)) continue;
    const km = kmBetween(sh.a, sh.b);
    const later = (ms, f) => setTimeout(f, ms);
    switch (sh.k) {
      case 'melee': g.burst(sh.b[0] + (Math.random() - 0.5) * 0.2, sh.b[1] + (Math.random() - 0.5) * 0.2, 0xffd9a0, 0.007, 0.5); break;
      case 'arrow': g.tracer(sh.a, sh.b, 0xf3e3c0, 0.003, 0.6); break;
      case 'stone': g.tracer(sh.a, sh.b, 0xc8a878, Math.min(0.02, 0.004 + km / 6371 * 0.5), 1.1); later(1000, () => g.burst(sh.b[0], sh.b[1], 0xd9b98a, 0.012, 0.8)); break;
      case 'gun': g.tracer(sh.a, sh.b, 0xffe9a8, 0.0015, 0.45); later(380, () => g.burst(sh.b[0], sh.b[1], 0xffc070, 0.008, 0.6)); break;
      case 'art': g.tracer(sh.a, sh.b, 0xffa040, Math.min(0.03, 0.004 + km / 6371 * 0.6), 1.1); later(1000, () => g.burst(sh.b[0], sh.b[1], 0xff7a30, 0.015, 0.9)); break;
      case 'torp': g.tracer(sh.a, sh.b, 0x9ff6ff, 0.0004, 1.5); later(1400, () => g.burst(sh.b[0], sh.b[1], 0xbff7ff, 0.016, 1)); break;
      case 'aa': g.tracer(sh.a, sh.b, 0xfff0a0, 0.004, 0.5); break;
      case 'air': g.tracer(sh.a, sh.b, 0xff7070, 0.003, 0.5); later(450, () => g.burst(sh.b[0], sh.b[1], 0xff9060, 0.01, 0.7)); break;
      case 'wing': g.tracer(sh.a, sh.b, 0xffffff, Math.min(0.04, km / 6371 * 0.5), 1.6); later(1500, () => g.burst(sh.b[0], sh.b[1], 0xff9a50, 0.016, 0.9)); break;
      case 'bomb': for (let k = 0; k < 3; k++) later(k * 160, () => g.burst(sh.b[0] + (Math.random() - 0.5) * 0.5, sh.b[1] + (Math.random() - 0.5) * 0.5, 0xff8a3d, 0.014, 1)); break;
      case 'kill': g.burst(sh.a[0], sh.a[1], 0xff4020, 0.035, 1.5); break;
      case 'icbm': g.tracer(sh.a, sh.b, 0xffffff, 0.3, 3.6); later(3400, () => { g.nuke(sh.b[0], sh.b[1]); G.scarCount = -1; refreshWorld(false); }); break;
      case 'nukebomb': g.nuke(sh.b[0], sh.b[1]); break;
    }
  }
}
function showStackTip(st, el) {
  const tt = $('#tooltip'); const cnt = {}; const sim = G.sim;
  for (const u of st.units) cnt[u.type] = (cnt[u.type] || 0) + 1;
  const grp = st.units[0].group && sim.s.groups.find(x => x.id === st.units[0].group);
  tt.innerHTML = `<div class="tt-name" style="color:${sim.col(st.nation)}">${esc(sim.nm(st.nation))} ${st.domain === 'sea' ? 'fleet' : st.domain === 'air' ? 'air group' : 'host'}</div>` +
    Object.entries(cnt).map(([t, n]) => `<div class="tt-row"><span>${UNITS[t].name}</span><span>${n}</span></div>`).join('') +
    `<div class="tt-row"><span class="muted">Strength</span><span>${pct(st.hp)}</span></div><div class="tt-row"><span class="muted">Experience</span><span>${Math.round(st.xp)}/100</span></div>` +
    (grp ? `<div class="tt-row"><span class="muted">Army group</span><span>${esc(grp.name)}</span></div>` : '') +
    (st.dest !== null ? `<div class="tt-row"><span class="muted">Heading to</span><span>${G.world.regions[st.dest].name}</span></div>` : '') +
    (st.fight ? '<div class="tt-row" style="color:var(--red)"><span>Engaged in battle</span></div>' : '');
  const b = $('#stage').getBoundingClientRect(), e = el.getBoundingClientRect();
  tt.style.left = (e.right - b.left + 8) + 'px'; tt.style.top = (e.top - b.top) + 'px';
  tt.classList.remove('hidden');
}

// ======================================================================= input
function bindInput() {
  const cv = G.globe.renderer.domElement;
  let down = null, box = null;
  // box select: drag with Shift (or anything in select mode, B) to select every force of yours inside the box;
  // hold Ctrl as well to add to the selection. Runs in the capture phase so the globe never starts rotating.
  cv.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, b: e.button };
    if (e.button === 0 && (e.shiftKey || G.boxMode) && G.sim && !G.pick) {
      box = { x: e.clientX, y: e.clientY, add: e.ctrlKey || e.metaKey, hits: new Set() };
      G.globe.controls.enabled = false; e.stopImmediatePropagation();
    }
  }, { capture: true });
  const inBox = (x1, y1, x2, y2) => {
    const hits = new Set(), s = G.sim.s;
    for (const u of s.units) {
      if (u.nation !== s.player) continue;
      const p = G.disp.get(u.id) || u.pos, air = airborne(u);
      const q = G.globe.project(p[0], p[1], air ? 1.017 : 1.003 + G.globe.heightAt(p[0], p[1]));
      if (q.visible && q.x >= x1 && q.x <= x2 && q.y >= y1 && q.y <= y2) hits.add(u.id);
    }
    return hits;
  };
  const boxRect = e => { const st = $('#stage').getBoundingClientRect(); return [Math.min(box.x, e.clientX) - st.left, Math.min(box.y, e.clientY) - st.top, Math.max(box.x, e.clientX) - st.left, Math.max(box.y, e.clientY) - st.top]; };
  window.addEventListener('pointermove', e => {
    if (!box) return;
    const [x1, y1, x2, y2] = boxRect(e), el = $('#boxsel');
    el.style.left = x1 + 'px'; el.style.top = y1 + 'px'; el.style.width = (x2 - x1) + 'px'; el.style.height = (y2 - y1) + 'px';
    el.classList.remove('hidden');
    // live preview: light up the tags of stacks that would be picked
    box.hits = inBox(x1, y1, x2, y2);
    el.dataset.n = box.hits.size ? `${box.hits.size} unit${box.hits.size > 1 ? 's' : ''}` : '';
    G.boxHits = box.hits;
    for (const t of G.markerEls.values()) if (t._st) t.classList.toggle('boxhit', t._st.units.some(u => box.hits.has(u.id)));
  });
  window.addEventListener('pointerup', e => {
    if (!box) return;
    const [x1, y1, x2, y2] = boxRect(e), add = box.add || e.ctrlKey || e.metaKey;
    $('#boxsel').classList.add('hidden'); G.globe.controls.enabled = true; box = null;
    G.boxHits = null;
    for (const t of G.markerEls.values()) t.classList.remove('boxhit');
    if (x2 - x1 > 6 && y2 - y1 > 6) {
      const hits = inBox(x1, y1, x2, y2);
      if (!add) G.sel.clear();
      for (const id of hits) G.sel.add(id);
      computeStacks(); renderSelbar(); updateRings(); if (G.sel.size) { if (G.tab !== 'forces') switchTab('forces'); else renderPanel(true); }
      down = null;
    }
  });
  // double-click one of your stacks (its models, its tag, or through a settlement icon): select every force of
  // that kind in view
  $('#stage').addEventListener('dblclick', e => {
    if (!G.sim || G.pick || !e.target.closest('canvas, .tok, .ticon')) return;
    const s = G.sim.s, tag = e.target.closest('.tok');
    const hit = tag?._st ? tag._st.units[0] : pickUnit(e.clientX, e.clientY);
    if (!hit || hit.nation !== s.player) return;
    const sym = UNITS[hit.type].sym, b = $('#stage').getBoundingClientRect();
    const hits = [...inBox(0, 0, b.width, b.height)].map(id => G.sim.unitById.get(id)).filter(u => u && UNITS[u.type].sym === sym);
    if (!e.ctrlKey && !e.metaKey) G.sel.clear();
    for (const u of hits) G.sel.add(u.id);
    computeStacks(); renderSelbar(); updateRings(); if (G.tab !== 'forces') switchTab('forces'); else renderPanel(true);
  });
  cv.addEventListener('pointerup', e => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
    const b = down.b; down = null;
    if (moved) return;
    if (G.pick) {
      const ll = G.globe.pickLL(e.clientX, e.clientY); if (!ll) return;
      const i = G.world.regionAtLL(ll[0], ll[1]);
      if (i >= 0 && !G.world.regions[i].sea) { G.pick.tile = i; renderPick(); }
      return;
    }
    if (!G.sim) return;
    if (b === 0) {
      const hit = pickUnit(e.clientX, e.clientY);
      if (hit && !airborne(hit)) { const st = G.stacks.find(x => x.units.includes(hit)); if (st) { clickStack(st, e.ctrlKey); return; } }
      if (hit && airborne(hit) && hit.nation === G.sim.s.player) { if (!e.ctrlKey) G.sel.clear(); G.sel.add(hit.id); computeStacks(); renderSelbar(); updateRings(); switchTab('forces'); return; }
    }
    const ll = G.globe.pickLL(e.clientX, e.clientY); if (!ll) return;
    const i = G.world.regionAtLL(ll[0], ll[1]);
    if (b === 0) { if (i >= 0) selectRegion(i); }
    else if (b === 2 && i >= 0) orderTo(i);
  });
  cv.addEventListener('contextmenu', e => e.preventDefault());
  cv.addEventListener('pointermove', e => {
    if (box) { $('#tooltip').classList.add('hidden'); return; } // no region tips while drawing a selection box
    const ll = G.globe.pickLL(e.clientX, e.clientY);
    const i = ll ? G.world.regionAtLL(ll[0], ll[1]) : -1;
    if (ll) $('#ro-coords').textContent = `${Math.abs(ll[0]).toFixed(2)}°${ll[0] >= 0 ? 'N' : 'S'}  ${Math.abs(ll[1]).toFixed(2)}°${ll[1] >= 0 ? 'E' : 'W'}`;
    const h = i >= 0 ? i : null;
    if (G.pick) { if (h !== G.hover) { G.hover = h; paintPick(); } pickTip(h, e); return; }
    if (!G.sim) return;
    if (h !== G.hover) { G.hover = h; refreshWorld(false); }
    regionTip(h, e);
  });
  cv.addEventListener('pointerleave', () => { $('#tooltip').classList.add('hidden'); G.hover = null; });
}
function placeTip(tt, e) {
  const b = $('#stage').getBoundingClientRect();
  let x = e.clientX - b.left + 16, y = e.clientY - b.top + 16;
  if (x > b.width - 250) x -= 270; if (y > b.height - 150) y -= 160;
  tt.style.left = x + 'px'; tt.style.top = y + 'px'; tt.classList.remove('hidden');
}
function pickTip(i, e) {
  const tt = $('#tooltip');
  if (i === null || G.world.regions[i].sea) { tt.classList.add('hidden'); $('#ro-region').textContent = i === null ? '--' : G.world.regions[i].name; return; }
  const R = G.world.regions[i], c = countryByName(countryAt(i));
  $('#ro-region').textContent = R.name;
  tt.innerHTML = `<div class="tt-name">${esc(R.name)}</div>${c ? `<div class="tt-row"><span class="muted">Country</span><span>${esc(c.s)}</span></div><div class="tt-row"><span class="muted">People</span><span>${fmtPop(c.pop)}</span></div><div class="tt-row"><span class="muted">Economy</span><span>${W39() ? fmtGdp39(c.gdp) : fmtGdp(c.gdp)}</span></div>${W39() && c.side ? `<div class="tt-row"><span class="muted">Side</span><span>${esc(c.side)}</span></div>` : ''}` : ''}`;
  placeTip(tt, e);
}
function pickUnit(cx, cy) {
  const st = $('#stage').getBoundingClientRect(); const x = cx - st.left, y = cy - st.top;
  let best = null, bd = 14;
  for (const u of G.sim.s.units) {
    const p = G.disp.get(u.id) || u.pos; const q = G.globe.project(p[0], p[1], airborne(u) ? 1.017 : 1.003);
    if (!q.visible) continue;
    const d = Math.hypot(q.x - x, q.y - y) - (u.nation === G.sim.s.player ? 3 : 0);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}
function regionTip(i, e) {
  const tt = $('#tooltip'), sim = G.sim;
  if (i === null) { tt.classList.add('hidden'); $('#ro-region').textContent = '--'; return; }
  const R = G.world.regions[i], r = sim.s.regions[i], T = sim.T[i], P = sim.s.nations[sim.s.player];
  $('#ro-region').textContent = R.name;
  let h = `<div class="tt-name">${esc(R.name)}</div>`;
  if (R.sea) h += `<div class="muted">${R.deep ? 'Deep ocean: needs ocean-going ships' : 'Coastal waters'}</div>`;
  else {
    h += `<div class="tt-row"><span class="muted">Land</span><span>${TERRAIN[T.terrain].name}${T.river ? ' · river' : ''}</span></div>`;
    if (r.owner) {
      h += `<div class="tt-row"><span class="muted">Held by</span><span style="color:${sim.col(r.owner)}">${esc(sim.nm(r.owner))}</span></div>`;
      if (sim.realmOf(r.owner) !== r.owner) h += `<div class="tt-row"><span class="muted">Vassal of</span><span style="color:${sim.col(sim.realmOf(r.owner))}">${esc(sim.nm(sim.realmOf(r.owner)))}</span></div>`;
      h += `<div class="tt-row"><span class="muted">${SETTLEMENTS[r.lvl].name}</span><span>${popStr(r.pop)}</span></div>`;
    } else {
      h += `<div class="tt-row"><span class="muted">Unclaimed</span><span>${(r.natives || 0) > 0.05 ? `natives ${popStr(r.natives)}` : 'empty wilds'}</span></div>`;
      if (r.claim) h += `<div class="tt-row"><span class="muted">Being settled by</span><span style="color:${sim.col(r.claim.by)}">${esc(sim.nm(r.claim.by))}</span></div>`;
    }
    if (sim.s.cultures && (r.owner || (r.natives || 0) > 0.05)) {
      const C = sim.s.cultures[r.cul], F = sim.s.faiths[r.rel];
      h += `<div class="tt-row"><span class="muted">People</span><span>${esc(C?.adj || '?')} · ${esc(F?.name || '?')}</span></div>`;
      if (r.owner && (G.lens === 'unrest' || r.unrest > 0.3 || r.revolt)) h += `<div class="tt-row" style="${r.revolt || r.unrest > 0.5 ? 'color:var(--red)' : ''}"><span class="muted">Unrest</span><span>${r.revolt ? 'IN REVOLT · ' : ''}${pct(r.unrest)}</span></div>`;
    }
    const deps = r.dep.filter(d => known(P, d.r));
    if (deps.length) h += `<div class="small" style="margin-top:3px">${deps.map(d => RES[d.r].icon + ' ' + RES[d.r].name).join(' · ')}</div>`;
    if (r.capture) h += `<div class="tt-row" style="color:var(--red)"><span>${r.owner ? 'Siege' : 'Subjugation'} by ${esc(sim.nm(r.capture.by))}</span><span>${pct(r.capture.p)}</span></div>`;
  }
  if (G.sel.size) h += `<div class="muted" style="margin-top:4px">Right-click to send selected forces</div>`;
  tt.innerHTML = h;
  placeTip(tt, e);
}
function selectRegion(i) { G.region = i; refreshWorld(false); if (G.tab !== 'tile') switchTab('tile'); else renderPanel(true); }
function flyTile(i, d) { const R = G.world.regions[i]; G.globe.flyTo(R.lat, R.lon, d); }
function setStylized(on) {
  G.globe.setStylized(on);
  $('#mapbar [data-m=stylized]')?.classList.toggle('on', !!on);
}
function setBoxMode(on) {
  G.boxMode = !!on;
  $('#mapbar [data-m=box]')?.classList.toggle('on', G.boxMode);
  $('#stage').classList.toggle('boxmode', G.boxMode);
}
function clickStack(st, add) {
  const s = G.sim.s;
  if (st.nation !== s.player) { selectRegion(st.loc); return; }
  if (!add) G.sel.clear();
  for (const u of st.units) G.sel.add(u.id);
  computeStacks(); renderSelbar(); updateRings();
  if (G.tab !== 'forces') switchTab('forces'); else renderPanel(true);
}
function selectedUnits() { const s = G.sim; return [...G.sel].map(id => s.unitById.get(id)).filter(Boolean); }
function orderTo(i) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P];
  const units = selectedUnits().filter(u => u.nation === P);
  if (!units.length) return;
  if (new Set(units.map(u => u.det || 0)).size > 1) { const d = units[0].det || 0; for (const u of units) u.det = d; }
  const r = s.regions[i], R = G.world.regions[i];
  const air = units.filter(u => UNITS[u.type].domain === 'air');
  const rest = units.filter(u => UNITS[u.type].domain !== 'air');
  if (air.length && !R.sea && r.owner && sim.atWar(P, r.owner)) {
    let n = 0;
    for (const u of air) if (kmBetween(sim.anchor(u.loc), sim.anchor(i)) <= UNITS[u.type].radius) { u.mission = { strike: i }; n++; }
    toast('Air command', n ? `${n} air group(s) will strike ${R.name}.` : `${R.name} is beyond their operating radius.`, n ? 'good' : 'warn');
  } else if (air.length) { const res = sim.order(air.map(u => u.id), i); if (!res.ok) toast('Air command', res.reason || 'Cannot rebase there.', 'warn'); }
  if (rest.length) {
    if (!R.sea && !r.owner && (r.natives || 0) >= 0.25 && rest.some(u => UNITS[u.type].domain === 'land') && !(N.subjugate || []).includes(i)) {
      if (confirm(`${R.name} is home to native peoples (${popStr(r.natives)}). Subdue them by force? Your troops will besiege them on arrival; survivors join your realm with unrest.`)) N.subjugate = [...(N.subjugate || []), i];
    }
    let res = sim.order(rest.map(u => u.id), i);
    if (res.needWar) {
      const names = res.needWar.map(c => sim.nm(c)).join(', ');
      if (!confirm(`This route enters the lands of the ${names}. Declare war?`)) return;
      res = sim.order(rest.map(u => u.id), i, { declare: true });
    }
    if (!res.ok) toast('Command', res.reason || 'Order not possible.', 'warn');
  }
  G.globe.flash(R.lat, R.lon, 0xe9c46a);
  computeStacks(); updateRings(); renderPanel(true);
}
function eta(u) {
  const m = u.move, w = G.world; let km = w.edgeKm(m.path[m.seg], m.path[m.seg + 1]) - m.prog;
  for (let k = m.seg + 1; k < m.path.length - 1; k++) km += w.edgeKm(m.path[k], m.path[k + 1]);
  return Math.ceil(km / UNITS[u.type].speed) + 'd';
}

// ======================================================================= events
function onEvent(e) {
  const sim = G.sim, s = sim.s;
  if (e.kind === 'message') { const m = e.msg; toast(`${sim.nm(m.from)} · ${m.proposal ? 'Proposal' : 'Envoy'}`, m.text, m.proposal ? 'prop' : '', () => openDossier(m.from), m.proposal ? m : null); return; }
  if (e.kind === 'rp') { G.fn.showEvent(e.ev); return; }
  if (e.kind === 'pactSession') {
    const X = pactById(sim, e.pact); if (!X) return;
    const busy = [...document.querySelectorAll('.modal')].some(m => !m.classList.contains('hidden'));
    if (!busy) openSessionDialog(X.id);
    else toast(X.name, `The ${X.name} convenes. Your vote is awaited.`, 'prop', () => openSessionDialog(X.id));
    return;
  }
  const mine = e.nations?.includes(s.player);
  if (e.loc !== undefined && ['capture', 'war', 'terror'].includes(e.kind)) { const R = G.world.regions[e.loc]; G.globe.flash(R.lat, R.lon, e.kind === 'capture' ? 0xff8a3d : 0xff3344); }
  const go = () => { if (e.loc !== undefined) { flyTile(e.loc); selectRegion(e.loc); } };
  if (e.kind === 'nuke') toast('Nuclear detonation', e.text, 'nuke', go);
  else if (e.kind === 'age' && mine) toast('A new age', e.text, 'age', go);
  else if (mine && ['war', 'capture', 'peace', 'treaty', 'trade', 'econ', 'gov', 'contact', 'formed', 'wonder', 'claim', 'rise', 'vassal', 'faith', 'unrest', 'terror', 'disaster'].includes(e.kind)) {
    const bad = e.kind === 'war' || e.kind === 'econ' || e.kind === 'unrest' || e.kind === 'terror' || e.kind === 'disaster' || (e.kind === 'capture' && e.nations[1] === s.player) || (e.kind === 'trade' && e.text.includes('blockad'));
    toast({ gov: 'Government', contact: 'Explorers', formed: 'Empire', wonder: 'Wonder', claim: 'Settlers', rise: 'A new people', vassal: 'Vassals', faith: 'Faith', unrest: 'Unrest', terror: 'Terror', disaster: 'Crisis' }[e.kind] || e.kind[0].toUpperCase() + e.kind.slice(1), e.text, bad ? 'warn' : 'good', go);
  } else if (mine && (e.kind === 'build' || e.kind === 'tech')) toast(e.kind === 'tech' ? 'Discovery' : 'Works', e.text, '', go);
  else if (e.major) toast('World', e.text, 'warn', go);
  renderTicker();
}

// ======================================================================= top bar & standing
function renderTop() {
  const sim = G.sim, s = sim.s, N = s.nations[s.player], st = N.st;
  $('#tb-date').textContent = dstr();
  const A = AGES[N.age];
  const ab = $('#tb-age');
  if (s.modern) { const GT = GOV_TYPES[N.gov.type]; ab.textContent = GT.name; ab.style.setProperty('--ac', GT.democratic ? '#7fb4e8' : '#e0a83e'); }
  else { ab.textContent = N.ageAdv ? `${A.short} → ${AGES[N.age + 1].short}` : A.name; ab.style.setProperty('--ac', A.color); }
  const capR = G.world.regions[N.capital];
  if (capR) {
    const sn = seasonName(capR.lat, s.t), c = cold(capR.lat, s.t);
    const se = $('#tb-season'), txt = `${SEASON_ICON[sn]} ${sn}`;
    if (se.textContent !== txt) { se.textContent = txt; se.title = sn === 'Winter' ? `Winter at your capital${c > 0.35 ? ': armies march slower, and those camped outside your lands suffer the cold' : ''}. Harvests are lean.` : sn === 'Summer' ? 'Summer at your capital: harvests are rich.' : sn === 'Wet' || sn === 'Dry' ? 'The tropics know only wet and dry seasons.' : `${sn} at your capital.`; }
  }
  $('#brand-name').textContent = styleName(N);
  $('#brand-sub').textContent = s.modern ? `${GOV_TYPES[N.gov.type].ruler} · ${N.gov.leaderName || 'you'}` : `${N.name} · ${AGES[N.age].name}`;
  $('#crest').style.background = N.color; $('#crest').textContent = N.name.slice(0, 2).toUpperCase();
  const stock = k => { const net = st.net[k] || 0; return [STOCK_ICON[k] + ' ' + k[0].toUpperCase() + k.slice(1), fmt(N[k] || 0), net, sgn(net)]; };
  const items = [stock('food'), stock('wood'), stock('stone')];
  if (N.age >= 1 || N.metal > 0) items.push(stock('metal'));
  if (N.age >= 1 || N.wealth > 0) items.push(stock('wealth'));
  if (N.age >= 6 || N.oil > 0) items.push(stock('oil'));
  items.push(['📜 Learning', fmt(st.rp) + '/d', null, ''], ['👥 People', popStr(st.pop), null, ''], ['Stability', pct(N.gov.stability), N.gov.stability - 0.35, ''], ['Approval', pct(N.gov.approval), N.gov.approval - 0.35, ''], ['Influence', Math.floor(N.gov.pc), null, '']);
  const deals = sim.s.trades.filter(t => t.from === sim.s.player || t.to === sim.s.player);
  items.push(['⚖ Trade', `${deals.length} deal${deals.length === 1 ? '' : 's'}`, deals.length ? st.trade.wealth : null, deals.length ? sgn(st.trade.wealth) : '']);
  if (N.age >= 6 && st.eCons > 0) items.push(['⚡ Energy', pct(st.eF), st.eF - 0.9, '']);
  if (N.warheads) items.push(['☢ Warheads', N.warheads, null, '']);
  const h = items.map(([k, v, delta, dtxt]) => `<div class="r${k.startsWith('⚖') ? ' click' : ''}" ${k.startsWith('⚖') ? 'data-trades="1" title="Your trade deals (click to manage)"' : ''}><div class="k">${k}</div><div class="v ${delta !== null && delta < 0 && !dtxt ? 'neg' : ''}">${v}${dtxt ? `<span class="d ${delta >= 0 ? 'pos' : 'neg'}">${dtxt}</span>` : ''}</div></div>`).join('');
  setHTML($('#res'), h);
  $('#paused').classList.toggle('hidden', G.speed !== 0);
  $('#btn-cabinet').disabled = !cabinetReady();
  const nv = sim.vassalsOf(s.player).length, ib = $('#btn-imperial');
  ib.classList.toggle('hidden', !nv); ib.disabled = !imperialReady(); ib.textContent = nv ? councilName(N).replace(/^(Imperial|Royal|Holy|Federal) /, '') : 'Court';
  ib.title = `Convene the ${councilName(N)} with your ${nv} vassal${nv === 1 ? '' : 's'} (I)`;
}
function renderStanding() {
  const sim = G.sim, s = sim.s;
  if (s.modern) return renderPowerRanking(sim, s);
  const goal = s.victory.conquest;
  $('#st-goal').textContent = goal ? `Dominion ${Math.round(goal * 100)}%` : 'No conquest victory';
  const ranks = Object.values(s.nations).filter(n => n.alive && (n.code === s.player || s.nations[s.player].known.includes(n.code))).map(n => ({ c: n.code, v: sim.score(n.code), a: n.age })).sort((a, b) => b.v - a.v);
  const myRank = ranks.findIndex(r => r.c === s.player) + 1;
  const share = sim.landShare(s.player);
  const alive = Object.values(s.nations).filter(n => n.alive).length;
  const h = `<div class="muted">${goal ? `Your share of the world's land: ${(share * 100).toFixed(1)}%` : `Score rank #${myRank}`}</div>
    ${goal ? `<div class="goal-bar"><i style="width:${Math.min(100, share / goal * 100)}%"></i></div>` : ''}` +
    ranks.slice(0, 7).map(r => `<div class="rank ${r.c === s.player ? 'me' : ''}" data-c="${r.c}"><span class="dot" style="background:${sim.col(r.c)}"></span><span>${esc(sim.nm(r.c))} <i class="agechip" style="--ac:${AGES[r.a].color}">${AGES[r.a].short}</i></span><span class="n">${r.v}</span></div>`).join('') +
    `<div class="muted" style="margin-top:6px">${alive} civilizations · ${Object.values(s.rel).filter(v => v === 'war').length} wars · ${ranks.length - 1} known to you</div>`;
  if (setHTML($('#standing-body'), h)) for (const e of document.querySelectorAll('.rank[data-c]')) e.onclick = () => openDossier(e.dataset.c);
}
// the modern world: a ranking of national power (economy, military, research, influence)
function renderPowerRanking(sim, s) {
  $('#st-goal').textContent = 'World power';
  const ranks = Object.values(s.nations).filter(n => n.alive).map(n => ({ c: n.code, v: sim.score(n.code) })).sort((a, b) => b.v - a.v);
  const me = ranks.findIndex(r => r.c === s.player);
  const rows = ranks.slice(0, 8); if (me >= 8) rows.push(ranks[me]);
  const top = ranks[0]?.v || 1;
  const h = `<div class="muted">You rank <b class="gold">#${me + 1}</b> of ${ranks.length} nations</div>` +
    rows.map(r => `<div class="rank ${r.c === s.player ? 'me' : ''}" data-c="${r.c}"><span class="dot" style="background:${sim.col(r.c)}"></span><span>${esc(sim.nm(r.c))}<span class="rk-bar"><i style="width:${Math.round(r.v / top * 100)}%;background:${sim.col(r.c)}"></i></span></span><span class="n">${ranks.indexOf(r) + 1}</span></div>`).join('') +
    `<div class="muted" style="margin-top:6px">${Object.values(s.rel).filter(v => v === 'war').length} wars under way</div>`;
  if (setHTML($('#standing-body'), h)) for (const e of document.querySelectorAll('.rank[data-c]')) e.onclick = () => openDossier(e.dataset.c);
}
// split the selected army into k detachments with an even mix of unit types and strength
function splitSelection(k) {
  const sim = G.sim, s = sim.s;
  const units = selectedUnits().filter(u => u.nation === s.player && !u.move);
  if (units.length < k) return toast('Command', `Need at least ${k} units to split ${k} ways.`, 'warn');
  const sorted = units.slice().sort((a, b) => (a.type < b.type ? -1 : a.type > b.type ? 1 : b.hp / b.mhp - a.hp / a.mhp));
  const ids = [units[0].det || 0]; for (let j = 1; j < k; j++) ids.push(s.detId = (s.detId || 0) + 1);
  sorted.forEach((u, n) => { u.det = ids[n % k]; });
  G.sel.clear(); for (const u of units) if (u.det === ids[0]) G.sel.add(u.id);
  computeStacks(); renderSelbar(); updateRings(); renderPanel(true);
  toast('Command', `The army divides into ${k} detachments of about ${Math.round(units.length / k)} units. Click each badge to command it.`, 'good');
}
// rejoin every detachment of ours on the selected units' tiles
function mergeHere() {
  const sim = G.sim, s = sim.s, sel = selectedUnits().filter(u => u.nation === s.player);
  const locs = new Set(sel.map(u => u.loc)); let n = 0;
  for (const u of s.units) if (u.nation === s.player && !u.move && locs.has(u.loc) && UNITS[u.type].domain !== 'air') { if ((u.det || 0) !== (sel[0]?.det || 0)) n++; u.det = sel[0]?.det || 0; G.sel.add(u.id); }
  computeStacks(); renderSelbar(); updateRings(); renderPanel(true);
  toast('Command', n ? 'The detachments rejoin the main army.' : 'Nothing to merge here.', n ? 'good' : '');
}
function renderSelbar() {
  const units = selectedUnits(); const bar = $('#selbar');
  if (!units.length) { bar.classList.add('hidden'); return; }
  const cnt = {}; for (const u of units) cnt[UNITS[u.type].name] = (cnt[UNITS[u.type].name] || 0) + 1;
  bar.innerHTML = `<span class="hi"><b>${units.length}</b> selected</span><span>${Object.entries(cnt).map(([t, n]) => `${n} ${t}`).join(' · ')}</span><span class="hint">Right-click to move · right-click native lands to subdue them · Shift-drag to box-select · Esc clears</span>`;
  const mine = units.filter(u => u.nation === G.sim.s.player && !u.move);
  if (mine.length >= 2) bar.insertAdjacentHTML('beforeend', `<span class="split">Split <button class="btn sm" data-split="2" title="Two even detachments">½</button><button class="btn sm" data-split="3" title="Three even detachments">⅓</button><button class="btn sm" data-split="4" title="Four even detachments">¼</button></span>`);
  const here = new Set(mine.map(u => u.loc));
  if (mine.length && G.sim.s.units.some(u => u.nation === G.sim.s.player && !u.move && here.has(u.loc) && (u.det || 0) !== (mine[0].det || 0) && UNITS[u.type].domain !== 'air')) bar.insertAdjacentHTML('beforeend', '<button class="btn sm" data-merge="1" title="Rejoin all detachments on this tile">Merge</button>');
  for (const b of bar.querySelectorAll('[data-split]')) b.onclick = () => splitSelection(+b.dataset.split);
  bar.querySelector('[data-merge]')?.addEventListener('click', mergeHere);
  bar.classList.remove('hidden');
}

// ======================================================================= chrome
// day/night cycle on or off (remembered on this device)
function setNight(on) {
  G.nightCycle = on;
  G.globe.setAlwaysDay(!on);
  $('#mapbar [data-m=night]')?.classList.toggle('on', on);
  try { localStorage.setItem('agesofcommand.night', on ? '1' : '0'); } catch {}
}
function bindChrome() {
  let night = true; try { night = localStorage.getItem('agesofcommand.night') !== '0'; G.empireView = localStorage.getItem('agesofcommand.empire') === '1'; } catch {}
  $('#mapbar [data-m=empire]')?.classList.toggle('on', !!G.empireView);
  setNight(night);
  for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => switchTab(b.dataset.tab);
  $('#panel').addEventListener('pointerdown', () => { G.pointerDown = true; });
  window.addEventListener('pointerup', () => { setTimeout(() => { G.pointerDown = false; }, 0); });
  for (const b of document.querySelectorAll('#speed button')) b.onclick = () => { setSpeed(+b.dataset.s); if (+b.dataset.s) G.prevSpeed = +b.dataset.s; };
  // delegated so a redraw of the bar between press and release never swallows the click
  $('#res').addEventListener('wheel', e => { const el = e.currentTarget; if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; el.scrollLeft += e.deltaY; e.preventDefault(); }, { passive: false });
  $('#res').addEventListener('click', e => { if (!G.sim || !e.target.closest('[data-trades]')) return; switchTab('realm'); setTimeout(() => $('#trade-sec')?.scrollIntoView({ block: 'start' }), 30); });
  $('#btn-save').onclick = () => G.sim && save();
  $('#btn-cabinet').onclick = openCabinet;
  $('#btn-imperial').onclick = openImperial;
  $('#btn-war').onclick = () => openWar();
  $('#btn-load').onclick = () => { const s = loadSaved(); if (s) resume(s); else toast('System', 'No saved game.', 'warn'); };
  $('#btn-new').onclick = () => showSetup();
  $('#btn-help').onclick = () => { setSpeed(0); showManual(false); };
  for (const b of document.querySelectorAll('#mapbar button')) b.onclick = () => {
    const m = b.dataset.m;
    if (m === 'box') { setBoxMode(!G.boxMode); return; }
    if (m === 'stylized') { setStylized(!G.globe.stylized); return; }
    if (m === 'political' || m === 'realistic') { G.overlay = m; for (const x of document.querySelectorAll('#mapbar [data-m=political],#mapbar [data-m=realistic]')) x.classList.toggle('on', x.dataset.m === m); G.globe.setOverlay(m === 'political' ? 1 : 0); if (G.sim) refreshWorld(false); }
    if (m === 'night') setNight(!G.nightCycle);
    if (m.startsWith('lens-')) { const k = m.slice(5); G.lens = G.lens === k ? null : k; for (const x of document.querySelectorAll('#mapbar [data-m^=lens-]')) x.classList.toggle('on', x.dataset.m === 'lens-' + G.lens); if (G.sim) refreshWorld(true); }
    if (m === 'empire') { G.empireView = !G.empireView; b.classList.toggle('on', G.empireView); try { localStorage.setItem('agesofcommand.empire', G.empireView ? '1' : '0'); } catch {} if (G.sim) refreshWorld(true); }
    if (m === 'clouds') { G.clouds = !G.clouds; b.classList.toggle('on', G.clouds); G.globe.setClouds(G.clouds ? 0.5 : 0); }
    if (m === 'routes') { G.showRoutes = !G.showRoutes; b.classList.toggle('on', G.showRoutes); G.globe.setRoutesVisible(G.showRoutes); }
    if (m === 'labels') { G.showLabels = !G.showLabels; b.classList.toggle('on', G.showLabels); }
    if (m === 'resources') { G.showIcons = !G.showIcons; b.classList.toggle('on', G.showIcons); }
    if (m === 'home' && G.sim) flyTile(G.sim.s.nations[G.sim.s.player].capital, 1.8);
  };
  document.addEventListener('keydown', e => {
    if (!G.sim || ['INPUT', 'SELECT'].includes(e.target.tagName) || !$('#modal').classList.contains('hidden') || !$('#eventbox').classList.contains('hidden')) return;
    if (e.key === 'Escape' && !$('#techtree').classList.contains('hidden')) { closeTree(); return; }
    if (!$('#cabinetbox').classList.contains('hidden')) { if (e.key === 'Escape') closeCabinet(); return; }
    if (!$('#warbox').classList.contains('hidden')) { if (e.key === 'Escape') closeWar(); return; }
    if (!$('#imperialbox').classList.contains('hidden')) { if (e.key === 'Escape') closeImperial(); return; }
    if (e.key.toLowerCase() === 'i') { openImperial(); return; }
    if (e.key.toLowerCase() === 'r') { openWar(); return; }
    if (e.key.toLowerCase() === 'c') { openCabinet(); return; }
    if (e.code === 'Space') { e.preventDefault(); setSpeed(G.speed ? 0 : G.prevSpeed || 2); }
    else if (/^[1-5]$/.test(e.key)) { setSpeed(+e.key); G.prevSpeed = +e.key; }
    else if (e.key === 'Escape' && G.boxMode) setBoxMode(false);
    else if (e.key === 'Escape') { G.sel.clear(); computeStacks(); renderSelbar(); updateRings(); renderPanel(true); }
    else if (e.key.toLowerCase() === 'b') setBoxMode(!G.boxMode);
    else if (e.key.toLowerCase() === 't') setStylized(!G.globe.stylized);
    else if (e.key.toLowerCase() === 'n') setNight(!G.nightCycle);
    else if (e.key.toLowerCase() === 'h') flyTile(G.sim.s.nations[G.sim.s.player].capital, 1.8);
  });
  setInterval(() => { if (G.sim && G.speed && $('#modal').classList.contains('hidden')) save(true); }, 60000);
}

window.GC = G;
boot().catch(err => { $('#modal-card').innerHTML = `<div class="boot" style="color:var(--red)">Startup failed: ${esc(err.message)}</div>`; console.error(err); });
void ageScale; void civColor; void resolveEvent; void answer;
