import { WorldMap, newGame, processMovement, processRetreats, processBuilds, scCount, unitsOf, buildCount, buildSites, SEASON_NAME, countAll } from './engine.js';
import { valueMaps, heuristicOrders, planOrders, planRetreats, planBuilds, chooseDisbands } from './ai.js';
import { POWERS, POWER_IDS, DIFFICULTY } from './data.js';
import * as D from './diplomacy.js';
import { MapView } from './render.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SAVE_KEY = 'globalcommand.save.v1';

const G = {
  json: null, map: null, view: null, worker: null, workerReady: false,
  state: null, diplo: null, player: null, levelKey: 'veteran',
  orders: {}, retreats: {}, builds: [], disbands: [],
  sel: null, tab: 'orders', dipFocus: null, dipSub: null, intelFilter: 'all',
  scHistory: [], reviewing: false, busy: false,
};

// ======================================================================= boot
async function boot() {
  const json = await fetch('data/map.json').then(r => r.json());
  G.json = json;
  G.map = new WorldMap(json);
  G.view = new MapView($('#map'), json, G.map);
  G.view.handlers.click = onMapClick;
  G.view.handlers.hover = onHover;
  G.view.handlers.rightclick = () => clearSel();
  G.view.onCamera = positionPop;
  G.view.s = G.view.minScale(); G.view.apply();
  initWorker();
  bindChrome();
  setInterval(() => { const d = new Date(); $('#tb-clock').textContent = d.toISOString().slice(11, 19) + ' Z'; }, 1000);
  showSetup();
}

function initWorker() {
  try {
    G.worker = new Worker('js/ai-worker.js', { type: 'module' });
    const slim = { ...G.json, regions: G.json.regions.map(r => ({ ...r, path: '' })), grid: [], landPath: '', countryPath: '', landBorders: '', seaBorders: '', deadLandBorders: '' };
    G.worker.onmessage = e => { if (e.data.type === 'ready') G.workerReady = true; };
    G.worker.onerror = () => { G.workerReady = false; G.worker = null; };
    G.worker.postMessage({ type: 'init', map: slim });
  } catch { G.worker = null; }
}

// ======================================================================= setup / save
function showSetup() {
  let sel = G.player || 'USA', lvl = G.levelKey || 'veteran', win = 'standard';
  const saved = loadSaved();
  const total = G.map.scIds.length;
  const wins = { standard: Math.floor(total / 2) + 1, domination: Math.round(total * 0.38), quick: Math.round(total * 0.27) };
  const homesOf = p => G.map.homes[p] || [];
  const render = () => {
    $('#modal-card').innerHTML = `
      <div class="classified">TOP SECRET // EYES ONLY</div>
      <h1>GLOBAL <span>COMMAND</span></h1>
      <p class="muted">Twelve great powers. ${G.map.regions.length} theaters of operation. ${total} strategic supply centers. Diplomacy rules: orders are simultaneous, every unit has strength one, and only support and alliances win wars.</p>
      <h2>// SELECT YOUR NATION</h2>
      <div class="power-grid">${POWER_IDS.map(p => {
        const P = POWERS[p];
        return `<div class="power-opt ${p === sel ? 'sel' : ''}" data-p="${p}" style="--pc:${P.color}">
          <div class="po-code" style="color:${P.color}">${p}</div>
          <div class="po-name">${P.name.toUpperCase()}</div>
          <div class="po-meta">${P.leader}<br>Home centers: ${homesOf(p).map(h => G.map.byId[h].name).join(', ')}</div>
        </div>`;
      }).join('')}</div>
      <h2>// AI COMMAND DIFFICULTY</h2>
      <div class="opt-row">${Object.entries(DIFFICULTY).map(([k, v]) => `<button class="btn ${k === lvl ? 'on' : ''}" data-lvl="${k}">${v.label}<small>${v.desc}</small></button>`).join('')}</div>
      <h2>// VICTORY CONDITION</h2>
      <div class="opt-row">
        <button class="btn ${win === 'standard' ? 'on' : ''}" data-win="standard">MAJORITY<small>Control ${wins.standard} of ${total} supply centers</small></button>
        <button class="btn ${win === 'domination' ? 'on' : ''}" data-win="domination">HEGEMONY<small>Control ${wins.domination} supply centers</small></button>
        <button class="btn ${win === 'quick' ? 'on' : ''}" data-win="quick">BLITZ<small>Control ${wins.quick} supply centers</small></button>
      </div>
      <div class="modal-foot">
        ${saved ? `<button class="btn" id="st-resume">RESUME SAVED OP (${esc(saved.player)} ${SEASON_NAME[saved.state.season]} ${saved.state.year})</button>` : ''}
        <button class="btn" id="st-help">FIELD MANUAL</button>
        <button class="btn go" id="st-go">COMMENCE OPERATION &#9656;</button>
      </div>`;
    for (const e of document.querySelectorAll('.power-opt')) e.onclick = () => { sel = e.dataset.p; render(); };
    for (const e of document.querySelectorAll('[data-lvl]')) e.onclick = () => { lvl = e.dataset.lvl; render(); };
    for (const e of document.querySelectorAll('[data-win]')) e.onclick = () => { win = e.dataset.win; render(); };
    $('#st-go').onclick = () => startGame(sel, lvl, wins[win]);
    $('#st-help').onclick = () => showManual(true);
    if (saved) $('#st-resume').onclick = () => resume(saved);
  };
  render();
  $('#modal').classList.remove('hidden');
}

function startGame(player, levelKey, winTarget) {
  G.player = player; G.levelKey = levelKey;
  G.state = newGame(G.map, { winTarget });
  G.diplo = D.initDiplomacy(player);
  G.scHistory = [snapshotCounts()];
  G.reviewing = false; G.tab = 'orders'; G.dipFocus = null;
  D.addIntel(G.diplo, G.state, 'info', `Operation commenced. ${POWERS[player].leader} assumes command of ${POWERS[player].name}.`);
  $('#modal').classList.add('hidden');
  startPhase();
  G.view.flyTo(POWERS[player].capital, 3.2);
}

function resume(saved) {
  Object.assign(G, { player: saved.player, levelKey: saved.levelKey, state: saved.state, diplo: saved.diplo, scHistory: saved.scHistory || [] });
  G.orders = saved.orders || {}; G.retreats = {}; G.builds = []; G.disbands = []; G.reviewing = false;
  $('#modal').classList.add('hidden');
  renderAll();
  G.view.flyTo(POWERS[G.player].capital, 3.2);
}

function save(silent) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ player: G.player, levelKey: G.levelKey, state: G.state, diplo: G.diplo, scHistory: G.scHistory, orders: G.orders }));
    if (!silent) toast('SYSTEM', 'Operation state saved to local archive.');
  } catch { if (!silent) toast('SYSTEM', 'Save failed: storage unavailable.', 'warn'); }
}
function loadSaved() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.state ? s : null; } catch { return null; } }

const snapshotCounts = () => ({ t: `${G.state.season}${G.state.year}`, year: G.state.year, c: countAll(G.state) });

// ======================================================================= phases
function alivePowers() { return POWER_IDS.filter(p => scCount(G.state, p) > 0 || unitsOf(G.state, p).length > 0); }

function startPhase() {
  const st = G.state;
  clearSel();
  if (st.winner) return gameOver(st.winner);
  if (!alivePowers().includes(G.player)) return gameOver(null);
  if (st.phase === 'orders') {
    G.orders = {};
    D.expirePending(G.diplo);
    const before = G.diplo.messages.length;
    D.aiDiplomacy(G.map, st, G.diplo);
    refreshForecast();
    const fresh = G.diplo.messages.slice(before).filter(m => m.to === G.player);
    fresh.slice(0, 3).forEach(m => toast(`${POWERS[m.from].name.toUpperCase()} // ${m.kind === 'proposal' ? 'PROPOSAL' : m.kind === 'warning' ? 'WARNING' : 'CABLE'}`, m.text, m.kind === 'proposal' ? 'prop' : m.kind === 'warning' ? 'warn' : '', () => openDossier(m.from)));
  } else if (st.phase === 'retreats') {
    G.retreats = {};
    if (!st.dislodged.some(d => d.unit.power === G.player)) { executeRetreats(); return; }
    toast('COMMAND', 'Units dislodged. Issue retreat orders.', 'warn');
  } else if (st.phase === 'builds') {
    G.builds = []; G.disbands = [];
    const n = buildCount(st, G.player);
    if (n === 0 || (n > 0 && !buildSites(G.map, st, G.player).length)) { executeBuilds(); return; }
  }
  save(true);
  renderAll();
}

function refreshForecast() {
  // AI forecasts of every power's likely orders (used when allies share intelligence)
  const fc = {};
  for (const p of alivePowers()) {
    const ctx = D.buildCtx(G.map, G.state, G.diplo, p, true);
    fc[p] = heuristicOrders(G.map, G.state, ctx, valueMaps(G.map, G.state, ctx), 0.6);
  }
  G.diplo.forecast = fc;
}

async function executeOrders() {
  if (G.busy) return;
  G.busy = true; clearSel();
  const st = G.state;
  const live = alivePowers();
  const aiPowers = live.filter(p => p !== G.player);
  const ctxs = {};
  for (const p of live) ctxs[p] = D.buildCtx(G.map, st, G.diplo, p, p === G.player);
  showProcessing(aiPowers);
  const level = DIFFICULTY[G.levelKey];
  const slimState = { year: st.year, season: st.season, phase: st.phase, units: st.units, sc: st.sc };
  let planned;
  try {
    planned = await planInWorker({ type: 'plan', state: slimState, ctxs, level, aiPowers, playerOrders: G.orders, player: G.player });
  } catch {
    planned = planOnMain(slimState, ctxs, level, aiPowers);
  }
  const all = {};
  for (const p of aiPowers) Object.assign(all, planned.orders[p] || {});
  Object.assign(all, G.orders);
  await sleep(350);
  const next = processMovement(G.map, st, all);
  D.afterMovement(G.map, next, G.diplo, next.lastResults);
  logMovement(next);
  logSc(next);
  G.state = next;
  hideProcessing();
  G.busy = false;
  G.reviewing = true;
  renderAll();
  showResultsBanner();
}

function planInWorker(payload) {
  return new Promise((resolve, reject) => {
    if (!G.worker || !G.workerReady) return reject(new Error('no worker'));
    const timer = setTimeout(() => reject(new Error('timeout')), 60000);
    G.worker.onmessage = e => {
      const m = e.data;
      if (m.type === 'progress') progress(m.done, m.total, m.power);
      if (m.type === 'plan') { clearTimeout(timer); resolve(m); }
    };
    G.worker.postMessage(payload);
  });
}
function planOnMain(state, ctxs, level, aiPowers) {
  const vms = {}, predicted = {}, byPower = {};
  for (const p of Object.keys(ctxs)) { vms[p] = valueMaps(G.map, state, ctxs[p]); byPower[p] = heuristicOrders(G.map, state, ctxs[p], vms[p], 1); Object.assign(predicted, byPower[p]); }
  const orders = {};
  for (const p of aiPowers) {
    let allyPlans = null;
    for (const a of ctxs[p].allies) allyPlans = { ...(allyPlans || {}), ...(a === G.player ? G.orders : byPower[a]) };
    orders[p] = planOrders(G.map, state, ctxs[p], vms[p], predicted, { ...level, allyPlans });
  }
  return { orders };
}

function continueAfterReview() {
  G.reviewing = false;
  $('#banner').classList.add('hidden');
  startPhase();
}

function executeRetreats() {
  const st = G.state;
  const rt = {};
  for (const p of alivePowers()) {
    if (p === G.player) continue;
    const ctx = D.buildCtx(G.map, st, G.diplo, p);
    Object.assign(rt, planRetreats(G.map, st, ctx, valueMaps(G.map, st, ctx)));
  }
  Object.assign(rt, G.retreats);
  const next = processRetreats(G.map, st, rt);
  for (const r of next.retreatLog || []) {
    if (!r.ok) D.addIntel(G.diplo, next, 'battle', `${POWERS[r.power].adj} ${r.type === 'A' ? 'army' : 'fleet'} in ${G.map.byId[r.loc].name} was destroyed.`, [r.power]);
  }
  logSc(next);
  G.state = next;
  startPhase();
}

function executeBuilds() {
  const st = G.state;
  const builds = {}, disbands = {};
  const ctxOf = p => D.buildCtx(G.map, st, G.diplo, p);
  for (const p of alivePowers()) {
    if (p === G.player) continue;
    const ctx = ctxOf(p);
    const r = planBuilds(G.map, st, ctx, valueMaps(G.map, st, ctx));
    builds[p] = r.builds; disbands[p] = r.disbands;
  }
  builds[G.player] = G.builds; disbands[G.player] = G.disbands;
  const next = processBuilds(G.map, st, builds, disbands, (p, k, chosen) => { const ctx = ctxOf(p); return chooseDisbands(G.map, st, ctx, valueMaps(G.map, st, ctx), k, chosen); });
  const per = {};
  for (const b of next.buildLog) { per[b.power] ||= { build: 0, disband: 0 }; per[b.power][b.kind]++; }
  for (const [p, v] of Object.entries(per)) {
    const parts = []; if (v.build) parts.push(`${v.build} new unit${v.build > 1 ? 's' : ''} mobilized`); if (v.disband) parts.push(`${v.disband} unit${v.disband > 1 ? 's' : ''} demobilized`);
    D.addIntel(G.diplo, next, 'build', `${POWERS[p].name}: ${parts.join(', ')}.`, [p]);
  }
  G.state = next;
  G.scHistory.push(snapshotCounts());
  startPhase();
}

function logMovement(next) {
  const r = next.lastResults;
  for (const d of r.dislodged) {
    const attacker = r.orders.find(o => o.type === 'M' && o.ok && o.to === d.loc);
    D.addIntel(G.diplo, next, 'battle', `${POWERS[attacker.power].adj} forces dislodged the ${POWERS[d.power].adj} ${d.type === 'A' ? 'army' : 'fleet'} in ${G.map.byId[d.loc].name}.`, [attacker.power, d.power]);
  }
  const bounces = {};
  for (const o of r.orders) if (o.type === 'M' && !o.ok) (bounces[o.to] ||= new Set()).add(o.power);
  for (const [loc, ps] of Object.entries(bounces)) if (ps.size >= 2) D.addIntel(G.diplo, next, 'battle', `Standoff in ${G.map.byId[loc].name}: ${[...ps].map(p => POWERS[p].name).join(' vs ')}.`, [...ps]);
}
function logSc(next) {
  if (!next.scChanges) return;
  for (const c of next.scChanges) {
    const reg = G.map.byId[c.id].name;
    D.addIntel(G.diplo, next, 'sc', c.from ? `${POWERS[c.to].name} seized ${reg} from ${POWERS[c.from].name}.` : `${POWERS[c.to].name} secured ${reg}.`, [c.to, c.from].filter(Boolean));
  }
  delete next.scChanges;
}

function gameOver(winner) {
  save(true);
  const counts = countAll(G.state);
  const rows = POWER_IDS.map(p => [p, counts[p] || 0]).sort((a, b) => b[1] - a[1]);
  const won = winner === G.player;
  $('#modal-card').innerHTML = `
    <div class="classified">${won ? 'VICTORY' : winner ? 'OPERATION FAILED' : 'COMMAND LOST'}</div>
    <h1>${winner ? `<span>${POWERS[winner].name.toUpperCase()}</span> ACHIEVES HEGEMONY` : `${POWERS[G.player].name.toUpperCase()} HAS FALLEN`}</h1>
    <p class="muted">${G.state.year} &middot; ${won ? 'The world bends to your strategy.' : winner ? 'Another power has seized control of the global order.' : 'Your last supply center has been lost.'}</p>
    <h2>// FINAL STANDINGS</h2>
    ${rows.map(([p, c], i) => `<div class="rank-row"><span class="muted">#${i + 1}</span><span style="width:10px;height:10px;background:${POWERS[p].color}"></span><span class="hi">${POWERS[p].name}${p === G.player ? ' (YOU)' : ''}</span><span>${c} SC</span></div>`).join('')}
    <div class="modal-foot">${winner && !won ? '<button class="btn" id="go-cont">CONTINUE OBSERVING</button>' : ''}<button class="btn go" id="go-new">NEW OPERATION</button></div>`;
  $('#modal').classList.remove('hidden');
  $('#go-new').onclick = () => { localStorage.removeItem(SAVE_KEY); showSetup(); };
  if ($('#go-cont')) $('#go-cont').onclick = () => { G.state.winner = null; G.state.winTarget = 999; $('#modal').classList.add('hidden'); startPhase(); };
}

// ======================================================================= map interaction
const unitAt = loc => G.state.units.find(u => u.loc === loc);

function seaChainTargets(armyLoc) {
  // coastal regions reachable by convoy through seas that contain fleets
  const fleetsAt = new Set(G.state.units.filter(u => u.type === 'F' && G.map.isSea(u.loc)).map(u => u.loc));
  const out = new Set();
  const start = G.map.byId[armyLoc].adj.filter(s => fleetsAt.has(s));
  const seen = new Set(start), q = [...start];
  while (q.length) {
    const s = q.pop();
    for (const n of G.map.byId[s].adj) {
      if (G.map.isSea(n)) { if (fleetsAt.has(n) && !seen.has(n)) { seen.add(n); q.push(n); } }
      else if (n !== armyLoc && G.map.byId[n].coastal) out.add(n);
    }
  }
  return out;
}

function moveTargets(u) {
  const t = new Set(G.map.neighbors(u.type, u.loc));
  if (u.type === 'A' && G.map.byId[u.loc].coastal) for (const x of seaChainTargets(u.loc)) t.add(x);
  return t;
}

function select(u, mode = 'move') {
  G.sel = { unit: u, mode };
  if (mode === 'move') G.sel.targets = moveTargets(u);
  if (mode === 'support') {
    const reach = new Set(G.map.neighbors(u.type, u.loc));
    G.sel.candidates = new Set(G.state.units.filter(v => v !== u && (reach.has(v.loc) || G.map.neighbors(v.type, v.loc).some(d => reach.has(d)) || (v.type === 'A' && [...seaChainTargets(v.loc)].some(d => reach.has(d))))).map(v => v.loc));
  }
  if (mode === 'convoy') {
    G.sel.candidates = new Set(G.state.units.filter(v => v.type === 'A' && G.map.byId[u.loc].adj.includes(v.loc)).map(v => v.loc));
  }
  G.view.selectUnit(u.loc);
  updateHighlights();
  showPop();
  renderOrdersTab();
}

function clearSel() {
  G.sel = null;
  G.view?.selectUnit(null);
  $('#order-pop')?.classList.add('hidden');
  if (G.view) updateHighlights();
  if (G.state) renderOrdersTab();
}

function updateHighlights() {
  const s = G.sel; const sets = { 'hl-target': new Set(), 'hl-support': new Set(), 'hl-sel': new Set(), 'hl-dmz': new Set() };
  if (G.diplo) for (const z of G.diplo.dmz) if (z.a === G.player || z.b === G.player) sets['hl-dmz'].add(z.region);
  if (s) {
    sets['hl-sel'].add(s.unit.loc);
    if (s.mode === 'move') s.targets.forEach(t => sets['hl-target'].add(t));
    if (s.mode === 'support') (s.supported ? s.dests : s.candidates).forEach(t => sets[s.supported ? 'hl-target' : 'hl-support'].add(t));
    if (s.mode === 'convoy') (s.army ? s.dests : s.candidates).forEach(t => sets[s.army ? 'hl-target' : 'hl-support'].add(t));
    if (s.mode === 'retreat') s.targets.forEach(t => sets['hl-target'].add(t));
  }
  if (G.state?.phase === 'builds' && !G.reviewing && buildCount(G.state, G.player) > 0) buildSites(G.map, G.state, G.player).forEach(t => sets['hl-target'].add(t));
  G.view.setHighlights(sets);
}

function setOrder(u, o) {
  G.orders[u.loc] = o;
  G.view.pulse(o.to || u.loc, POWERS[G.player].color);
  renderMapOrders();
  renderOrdersTab();
}

function onMapClick(id) {
  if (!G.state || G.busy) return;
  if (G.reviewing) { if (id) G.view.pulse(id); return; }
  const st = G.state;
  if (st.phase === 'orders') return clickOrders(id);
  if (st.phase === 'retreats') return clickRetreat(id);
  if (st.phase === 'builds') return clickBuild(id);
}

function clickOrders(id) {
  const s = G.sel;
  const unit = id ? unitAt(id) : null;
  if (!id) return clearSel();
  if (!s) { if (unit && unit.power === G.player) select(unit, 'move'); return; }
  const u = s.unit;
  if (s.mode === 'move') {
    if (id === u.loc) { setOrder(u, { type: 'H' }); return clearSel(); }
    if (s.targets.has(id)) { setOrder(u, { type: 'M', to: id, convoy: !G.map.adjacent(u.type, u.loc, id) }); return clearSel(); }
    if (unit && unit.power === G.player) return select(unit, 'move');
    return clearSel();
  }
  if (s.mode === 'support') {
    if (!s.supported) {
      if (unit && unit !== u && s.candidates.has(id)) {
        s.supported = unit;
        const reach = new Set(G.map.neighbors(u.type, u.loc));
        const dests = new Set([...moveTargets(unit)].filter(d => reach.has(d) && d !== u.loc));
        if (reach.has(unit.loc)) dests.add(unit.loc);
        s.dests = dests;
        updateHighlights(); showPop(); return;
      }
      if (unit && unit.power === G.player && unit !== u) return select(unit, 'move');
      return clearSel();
    }
    if (s.dests.has(id)) { setOrder(u, { type: 'S', from: s.supported.loc, to: id }); return clearSel(); }
    return clearSel();
  }
  if (s.mode === 'convoy') {
    if (!s.army) {
      if (unit && s.candidates.has(id)) { s.army = unit; s.dests = seaChainTargets(unit.loc); updateHighlights(); showPop(); return; }
      return clearSel();
    }
    if (s.dests.has(id)) { setOrder(u, { type: 'C', from: s.army.loc, to: id }); return clearSel(); }
    return clearSel();
  }
}

function clickRetreat(id) {
  const mine = G.state.dislodged.filter(d => d.unit.power === G.player);
  const s = G.sel;
  if (s && s.mode === 'retreat' && id && s.targets.has(id)) { G.retreats[s.d.unit.id] = id; clearSel(); renderOrdersTab(); return; }
  const d = mine.find(x => x.unit.loc === id);
  if (d) { G.sel = { mode: 'retreat', unit: d.unit, d, targets: new Set(d.options) }; updateHighlights(); renderOrdersTab(); return; }
  clearSel();
}

function clickBuild(id) {
  const n = buildCount(G.state, G.player);
  if (n > 0 && id && buildSites(G.map, G.state, G.player).includes(id)) {
    const cur = G.builds.find(b => b.loc === id);
    const coastal = G.map.byId[id].coastal;
    if (!cur) { if (G.builds.length < n) G.builds.push({ loc: id, type: 'A' }); }
    else if (cur.type === 'A' && coastal) cur.type = 'F';
    else G.builds = G.builds.filter(b => b !== cur);
    renderAll();
  } else if (n < 0 && id) {
    const u = unitAt(id);
    if (u && u.power === G.player) {
      if (G.disbands.includes(id)) G.disbands = G.disbands.filter(x => x !== id);
      else if (G.disbands.length < -n) G.disbands.push(id);
      renderAll();
    }
  }
}

function onHover(id, e, ll) {
  const tt = $('#tooltip');
  if (!id || !e) { tt.classList.add('hidden'); $('#ro-region').textContent = '--'; return; }
  const r = G.map.byId[id];
  const st = G.state;
  if (ll) $('#ro-coords').textContent = `${Math.abs(ll[1]).toFixed(2)}°${ll[1] >= 0 ? 'N' : 'S'}  ${Math.abs(ll[0]).toFixed(2)}°${ll[0] >= 0 ? 'E' : 'W'}`;
  $('#ro-region').textContent = `${r.id} // ${r.name.toUpperCase()}`;
  if (!st) return;
  const u = unitAt(id);
  const owner = r.sc ? st.sc[id] : null;
  const kind = r.type === 'sea' ? 'MARITIME ZONE' : r.coastal ? 'COASTAL TERRITORY' : 'INLAND TERRITORY';
  let h = `<div class="tt-name">${r.name.toUpperCase()} <span class="muted">${r.id}</span></div><div class="tt-sub">${kind}${r.sc ? ' &middot; SUPPLY CENTER' : ''}${r.home ? ' (HOME)' : ''}</div>`;
  if (r.sc) h += `<div class="tt-row"><span class="muted">CONTROL</span><span style="color:${owner ? POWERS[owner].color : '#8fb3c4'}">${owner ? POWERS[owner].name : 'Neutral'}</span></div>`;
  if (u) h += `<div class="tt-row"><span class="muted">FORCE</span><span style="color:${POWERS[u.power].color}">${POWERS[u.power].adj} ${u.type === 'A' ? 'Army' : 'Fleet'}</span></div>`;
  if (u && u.power !== G.player) h += `<div class="tt-row"><span class="muted">RELATION</span><span>${D.STATUS_LABEL[D.status(G.diplo, G.player, u.power)]}</span></div>`;
  if (G.diplo?.dmz.some(z => z.region === id && (z.a === G.player || z.b === G.player))) h += `<div class="tt-row warn-text">DEMILITARIZED ZONE</div>`;
  tt.innerHTML = h;
  const b = $('#stage').getBoundingClientRect();
  let x = e.clientX - b.left + 16, y = e.clientY - b.top + 16;
  if (x > b.width - 200) x -= 220; if (y > b.height - 120) y -= 130;
  tt.style.left = x + 'px'; tt.style.top = y + 'px';
  tt.classList.remove('hidden');
}

// order popup near the selected unit
function showPop() {
  const s = G.sel; const pop = $('#order-pop');
  if (!s || G.state.phase !== 'orders') return pop.classList.add('hidden');
  const u = s.unit; const r = G.map.byId[u.loc];
  const canConvoy = u.type === 'F' && G.map.isSea(u.loc);
  let hint = 'Click a highlighted region to move. Click the unit again to hold.';
  if (s.mode === 'support') hint = s.supported ? `Click the destination to support (or the unit itself to support its hold).` : 'Click the unit you want to support.';
  if (s.mode === 'convoy') hint = s.army ? 'Click the coastal destination.' : 'Click the army to convoy.';
  pop.innerHTML = `<div class="op-title">${u.type === 'A' ? 'ARMY' : 'FLEET'} &middot; ${r.name.toUpperCase()}</div>
    <div class="op-btns">
      <button class="btn sm ${s.mode === 'move' ? 'on' : ''}" data-m="move">MOVE <kbd>M</kbd></button>
      <button class="btn sm" data-m="hold">HOLD <kbd>H</kbd></button>
      <button class="btn sm ${s.mode === 'support' ? 'on' : ''}" data-m="support">SUPPORT <kbd>S</kbd></button>
      <button class="btn sm ${s.mode === 'convoy' ? 'on' : ''}" data-m="convoy" ${canConvoy ? '' : 'disabled'}>CONVOY <kbd>C</kbd></button>
    </div><div class="op-hint">${hint}</div>`;
  for (const b of pop.querySelectorAll('[data-m]')) b.onclick = e => { e.stopPropagation(); modeKey(b.dataset.m); };
  pop.classList.remove('hidden');
  positionPop();
}
function positionPop() { /* docked at the bottom of the map; nothing to do */ }
function modeKey(m) {
  const s = G.sel;
  if (!s || G.state.phase !== 'orders') return;
  if (m === 'hold') { setOrder(s.unit, { type: 'H' }); return clearSel(); }
  if (m === 'convoy' && !(s.unit.type === 'F' && G.map.isSea(s.unit.loc))) return;
  select(s.unit, m);
}

// ======================================================================= rendering
function renderAll() {
  renderTop();
  renderTheater();
  renderMap();
  renderOrdersTab();
  renderDiploTab();
  renderIntelTab();
  renderTicker();
  updateHighlights();
}

function renderMap() {
  const st = G.state;
  G.view.setState(st, { player: G.player, dislodged: st.phase === 'retreats' ? st.dislodged : [] });
  renderMapOrders();
}
function renderMapOrders() {
  const st = G.state;
  if (G.reviewing && st.lastResults) {
    G.view.drawOrders(st.lastResults.orders.filter(o => o.type !== 'H').map(o => ({ ...o, mine: o.power === G.player })), { results: true });
    return;
  }
  if (st.phase !== 'orders') return G.view.drawOrders([]);
  const list = [];
  for (const u of unitsOf(st, G.player)) {
    const o = G.orders[u.loc]; if (!o) continue;
    list.push({ ...o, loc: u.loc, power: G.player, mine: true });
  }
  G.view.drawOrders(list);
}

function renderTop() {
  const st = G.state;
  const shown = G.reviewing && st.lastResults ? st.lastResults : st;
  $('#tb-date').textContent = `${SEASON_NAME[shown.season]} ${shown.year}`;
  $('#tb-phase').textContent = G.reviewing ? 'AFTER-ACTION REVIEW' : { orders: 'ISSUE ORDERS', retreats: 'RETREATS', builds: 'MOBILIZATION' }[st.phase];
  $('#defcon').dataset.level = D.defcon(G.diplo, st);
  const P = POWERS[G.player];
  $('#tb-power').innerHTML = `<span class="swatch" style="background:${P.color};color:${P.color}"></span><span class="hi">${P.name.toUpperCase()}</span><span class="muted">${scCount(st, G.player)}/${st.winTarget} SC</span>`;
}

function renderTheater() {
  const st = G.state; const counts = countAll(st);
  $('#theater-target').textContent = `WIN ${st.winTarget}`;
  const rows = POWER_IDS.map(p => ({ p, c: counts[p] || 0, u: unitsOf(st, p).length })).sort((a, b) => b.c - a.c || b.u - a.u);
  const stCode = { war: ['W', 'var(--red)'], nap: ['P', '#7fd8ff'], alliance: ['A', 'var(--green)'], neutral: ['', ''] };
  $('#theater-list').innerHTML = rows.map(({ p, c, u }) => {
    const dead = c === 0 && u === 0;
    const s = p === G.player ? ['YOU', 'var(--cyan)'] : stCode[D.status(G.diplo, G.player, p)];
    return `<div class="th-row ${p === G.player ? 'me' : ''} ${dead ? 'dead' : ''}" data-p="${p}" title="${POWERS[p].name}: ${c} centers, ${u} units">
      <span class="dot" style="background:${POWERS[p].color};color:${POWERS[p].color}"></span>
      <span>${p}<span class="st" style="color:${s[1]}"> ${s[0]}</span></span>
      <span class="bar"><i style="width:${Math.min(100, c / st.winTarget * 100)}%;background:${POWERS[p].color}"></i></span>
      <span class="n">${c}</span></div>`;
  }).join('');
  for (const e of document.querySelectorAll('.th-row')) e.onclick = () => { if (e.dataset.p !== G.player) openDossier(e.dataset.p); else G.view.flyTo(POWERS[G.player].capital, 3.2); };
}

function orderText(u, o) {
  const N = id => G.map.byId[id].name;
  if (!o || o.type === 'H') return { t: 'Hold', hold: true };
  if (o.type === 'M') return { t: `&rarr; ${N(o.to)}${o.convoy ? ' (convoy)' : ''}` };
  if (o.type === 'S') return { t: o.from === o.to ? `supports ${N(o.from)} (hold)` : `supports ${N(o.from)} &rarr; ${N(o.to)}` };
  if (o.type === 'C') return { t: `convoys ${N(o.from)} &rarr; ${N(o.to)}` };
  return { t: '?' };
}

function renderOrdersTab() {
  const st = G.state; if (!st) return;
  const el = $('#tab-orders');
  const P = POWERS[G.player];
  const my = unitsOf(st, G.player);
  let h = '';
  if (G.reviewing && st.lastResults) {
    const r = st.lastResults;
    const mine = r.orders.filter(o => o.power === G.player);
    h += `<div class="phase-card"><div class="pc-big">${SEASON_NAME[r.season]} ${r.year} &middot; RESULTS</div><div class="pc-sub">Review the arrows on the map. Dashed arrows with &times; failed.</div></div>`;
    h += `<div class="sec"><div class="sec-title">YOUR ORDERS</div>${mine.map(o => {
      const t = orderText({ loc: o.loc }, o);
      const failed = o.type === 'M' && !o.ok;
      const lost = r.dislodged.some(d => d.loc === o.loc && d.power === G.player);
      return `<div class="unit-row"><span class="ut" style="color:${P.color}">${o.utype}</span><span><span class="hi">${G.map.byId[o.loc].name}</span> <span class="${failed ? 'warn-text' : 'ord-text'}">${t.t}</span></span><span class="${failed || lost ? 'warn-text' : 'muted'}">${lost ? 'DISLODGED' : failed ? 'FAILED' : 'OK'}</span></div>`;
    }).join('')}</div>`;
    const events = G.diplo.intel.filter(i => i.t === `${r.season}${r.year}` && i.kind !== 'info').slice(-14).reverse();
    if (events.length) h += `<div class="sec"><div class="sec-title">SITUATION REPORT</div>${events.map(logItem).join('')}</div>`;
    h += `<button class="btn go execute" id="btn-cont">CONTINUE &#9656;</button>`;
    el.innerHTML = h;
    $('#btn-cont').onclick = continueAfterReview;
    return;
  }
  if (st.phase === 'orders') {
    const given = my.filter(u => G.orders[u.loc]).length;
    h += `<div class="phase-card"><div class="pc-big">${SEASON_NAME[st.season]} ${st.year}</div><div class="pc-sub">${my.length} units &middot; ${scCount(st, G.player)} centers &middot; ${given}/${my.length} orders issued${st.season === 'F' ? ' &middot; <span class="warn-text">centers change hands after this turn</span>' : ''}</div></div>`;
    h += `<div class="sec"><div class="sec-title">FORCES</div>`;
    for (const u of my) {
      const o = G.orders[u.loc]; const t = orderText(u, o);
      h += `<div class="unit-row ${G.sel?.unit === u ? 'sel' : ''}" data-loc="${u.loc}"><span class="ut" style="color:${P.color}">${u.type}</span><span><span class="hi">${G.map.byId[u.loc].name}</span> <span class="ord-text ${t.hold ? 'hold' : ''}">${t.t}</span></span><span class="x" data-x="${u.loc}" title="Reset to hold">&times;</span></div>`;
    }
    h += `</div><div class="btn-row"><button class="btn sm" id="btn-allhold">RESET ALL</button><button class="btn sm" id="btn-cycle">NEXT UNIT</button></div>`;
    h += `<button class="btn go execute" id="btn-exec">EXECUTE ORDERS &#9656;</button>`;
    h += `<div class="kbd-help">Click a unit, then a highlighted region to move. <b>M</b> move <b>H</b> hold <b>S</b> support <b>C</b> convoy <b>Esc</b> cancel <b>Tab</b> next unit. Armies may target coastal regions across seas held by fleets (convoy). Drag to pan, scroll to zoom.</div>`;
    el.innerHTML = h;
    for (const r of el.querySelectorAll('.unit-row')) r.onclick = e => {
      if (e.target.dataset.x) { delete G.orders[e.target.dataset.x]; renderMapOrders(); renderOrdersTab(); return; }
      const u = unitAt(r.dataset.loc); select(u, 'move'); G.view.flyTo(u.loc);
    };
    $('#btn-allhold').onclick = () => { G.orders = {}; renderMapOrders(); renderOrdersTab(); };
    $('#btn-cycle').onclick = cycleUnit;
    $('#btn-exec').onclick = executeOrders;
  } else if (st.phase === 'retreats') {
    const mine = st.dislodged.filter(d => d.unit.power === G.player);
    h += `<div class="phase-card"><div class="pc-big">RETREATS</div><div class="pc-sub">Dislodged units must retreat to an adjacent empty region or be destroyed.</div></div>`;
    for (const d of mine) {
      const cur = G.retreats[d.unit.id];
      h += `<div class="sec"><div class="sec-title">${d.unit.type === 'A' ? 'ARMY' : 'FLEET'} &middot; ${G.map.byId[d.unit.loc].name.toUpperCase()}</div><div class="btn-row">`;
      h += d.options.map(o => `<button class="btn sm ${cur === o ? 'on' : ''}" data-rt="${d.unit.id}" data-to="${o}">${G.map.byId[o].name}</button>`).join('');
      h += `<button class="btn sm danger ${!cur ? 'on' : ''}" data-rt="${d.unit.id}" data-to="">DISBAND</button></div></div>`;
    }
    h += `<button class="btn go execute" id="btn-exec">CONFIRM RETREATS &#9656;</button>`;
    el.innerHTML = h;
    for (const b of el.querySelectorAll('[data-rt]')) b.onclick = () => { G.retreats[b.dataset.rt] = b.dataset.to || null; renderOrdersTab(); };
    $('#btn-exec').onclick = executeRetreats;
  } else if (st.phase === 'builds') {
    const n = buildCount(st, G.player);
    h += `<div class="phase-card"><div class="pc-big">WINTER ${st.year} &middot; MOBILIZATION</div><div class="pc-sub">${scCount(st, G.player)} centers, ${my.length} units.</div></div>`;
    if (n > 0) {
      const sites = buildSites(G.map, st, G.player);
      h += `<div class="sec"><div class="sec-title">BUILD ${n} UNIT${n > 1 ? 'S' : ''} (${G.builds.length} SELECTED)</div><p class="muted small">New units appear in unoccupied home centers you control. Click sites here or on the map.</p>`;
      for (const s of sites) {
        const cur = G.builds.find(b => b.loc === s); const coastal = G.map.byId[s].coastal;
        h += `<div class="unit-row"><span class="ut" style="color:${P.color}">${cur ? cur.type : '-'}</span><span class="hi">${G.map.byId[s].name}</span><span class="btn-row" style="margin:0"><button class="btn sm ${cur?.type === 'A' ? 'on' : ''}" data-b="${s}" data-t="A">ARMY</button><button class="btn sm ${cur?.type === 'F' ? 'on' : ''}" data-b="${s}" data-t="F" ${coastal ? '' : 'disabled'}>FLEET</button></span></div>`;
      }
      h += `</div>`;
    } else if (n < 0) {
      h += `<div class="sec"><div class="sec-title warn-text">DISBAND ${-n} UNIT${n < -1 ? 'S' : ''} (${G.disbands.length} SELECTED)</div><p class="muted small">You have more units than centers. Unselected disbands are chosen automatically.</p>`;
      for (const u of my) h += `<div class="unit-row ${G.disbands.includes(u.loc) ? 'sel' : ''}" data-d="${u.loc}"><span class="ut" style="color:${P.color}">${u.type}</span><span class="hi">${G.map.byId[u.loc].name}</span><span class="${G.disbands.includes(u.loc) ? 'warn-text' : 'muted'}">${G.disbands.includes(u.loc) ? 'DISBAND' : ''}</span></div>`;
      h += `</div>`;
    }
    h += `<button class="btn go execute" id="btn-exec">CONFIRM MOBILIZATION &#9656;</button>`;
    el.innerHTML = h;
    for (const b of el.querySelectorAll('[data-b]')) b.onclick = () => {
      const cur = G.builds.find(x => x.loc === b.dataset.b);
      if (cur && cur.type === b.dataset.t) G.builds = G.builds.filter(x => x !== cur);
      else if (cur) cur.type = b.dataset.t;
      else if (G.builds.length < n) G.builds.push({ loc: b.dataset.b, type: b.dataset.t });
      renderAll();
    };
    for (const r of el.querySelectorAll('[data-d]')) r.onclick = () => clickBuild(r.dataset.d);
    $('#btn-exec').onclick = executeBuilds;
  }
}

function cycleUnit() {
  const my = unitsOf(G.state, G.player); if (!my.length) return;
  const idx = G.sel ? my.indexOf(G.sel.unit) : -1;
  const pending = my.filter(u => !G.orders[u.loc]);
  const next = pending.find(u => my.indexOf(u) > idx) || pending[0] || my[(idx + 1) % my.length];
  select(next, 'move'); G.view.flyTo(next.loc);
}

function showResultsBanner() {
  const r = G.state.lastResults;
  const mv = r.orders.filter(o => o.type === 'M');
  const b = $('#banner');
  b.innerHTML = `<div><div class="bn-title">${SEASON_NAME[r.season]} ${r.year} // ORDERS RESOLVED</div><div class="bn-stats">${mv.filter(o => o.ok).length} advances &middot; ${mv.filter(o => !o.ok).length} repulsed &middot; ${r.dislodged.length} units dislodged</div></div><button class="btn go" id="bn-cont">CONTINUE &#9656;</button>`;
  b.classList.remove('hidden');
  $('#bn-cont').onclick = continueAfterReview;
}

// ======================================================================= diplomacy tab
function trustLabel(t) { return t <= -50 ? 'HOSTILE' : t < -10 ? 'WARY' : t < 20 ? 'NEUTRAL' : t < 55 ? 'CORDIAL' : 'TRUSTED'; }
function trustBar(t) {
  const w = Math.abs(t) / 2; const col = t >= 0 ? 'var(--green)' : 'var(--red)';
  return `<span class="trust" title="Their trust in you: ${t}"><i style="${t >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%;background:${col}"></i></span>`;
}
function traitWords(t) {
  const w = [];
  w.push(t.aggression > 0.65 ? 'Aggressive' : t.aggression < 0.45 ? 'Defensive' : 'Opportunistic');
  w.push(t.loyalty > 0.65 ? 'Loyal' : t.loyalty < 0.4 ? 'Treacherous' : 'Pragmatic');
  w.push(t.caution > 0.55 ? 'Cautious' : t.caution < 0.4 ? 'Reckless' : 'Calculating');
  return w.join(' / ');
}
function openDossier(p) {
  G.dipFocus = p; G.dipSub = null;
  switchTab('diplomacy');
}

function renderDiploTab() {
  const el = $('#tab-diplomacy'); const st = G.state; const d = G.diplo;
  const unread = d.messages.filter(m => m.to === G.player && m.unread).length;
  $('#unread').textContent = unread; $('#unread').classList.toggle('hidden', !unread);
  if (!G.dipFocus) {
    const counts = countAll(st);
    const list = POWER_IDS.filter(p => p !== G.player).map(p => ({ p, c: counts[p] || 0, u: unitsOf(st, p).length, pend: d.messages.filter(m => m.from === p && m.status === 'pending').length, unread: d.messages.filter(m => m.from === p && m.to === G.player && m.unread).length }))
      .sort((a, b) => b.pend - a.pend || b.unread - a.unread || b.c - a.c);
    el.innerHTML = `<div class="sec"><div class="sec-title">FOREIGN POWERS</div><p class="muted small">Your reputation: <span class="hi">${trustLabel(D.reputation(d, G.player))} (${D.reputation(d, G.player)})</span>. Breaking agreements damages trust with every nation watching.</p>` +
      list.map(({ p, c, u, pend, unread }) => {
        const s = D.status(d, G.player, p); const dead = !c && !u;
        return `<div class="pw-card ${dead ? 'dead' : ''}" data-p="${p}"><span class="stripe" style="background:${POWERS[p].color};color:${POWERS[p].color}"></span>
          <div><div class="pw-name">${POWERS[p].name.toUpperCase()}</div><div class="pw-leader">${POWERS[p].leader}</div></div>
          <div class="pw-right"><span class="status ${s}">${D.STATUS_LABEL[s]}</span>${trustBar(d.trust[p][G.player])}<span class="muted">${c} SC &middot; ${u} units</span></div>
          ${pend || unread ? `<b class="badge unread">${pend ? 'PROPOSAL' : unread}</b>` : ''}</div>`;
      }).join('') + '</div>';
    for (const c of el.querySelectorAll('.pw-card')) c.onclick = () => openDossier(c.dataset.p);
    return;
  }
  const p = G.dipFocus; const P = POWERS[p];
  const s = D.status(d, G.player, p);
  const myTrust = d.trust[p][G.player];
  for (const m of d.messages) if (m.from === p && m.to === G.player) m.unread = false;
  const treaties = POWER_IDS.filter(x => x !== p && x !== G.player && ['nap', 'alliance'].includes(D.status(d, p, x)));
  const wars = POWER_IDS.filter(x => x !== p && D.status(d, p, x) === 'war');
  const dead = !scCount(st, p) && !unitsOf(st, p).length;
  const msgs = d.messages.filter(m => (m.from === p && m.to === G.player) || (m.from === G.player && m.to === p)).filter(m => !m._hidden).slice(-40);
  let h = `<span class="back" id="dip-back">&#9666; ALL POWERS</span>
    <div class="dossier"><div class="d-head"><div class="d-flag" style="color:${P.color};border-color:${P.color}">${p}</div><div><div class="d-name">${P.name.toUpperCase()}</div><div class="muted small">${P.leader} &middot; CODENAME ${P.codename}</div></div></div>
    <div class="d-grid">
      <span>STATUS</span><span><span class="status ${s}">${D.STATUS_LABEL[s]}</span></span>
      <span>TRUST IN YOU</span><span>${trustLabel(myTrust)} (${myTrust})</span>
      <span>STRENGTH</span><span>${scCount(st, p)} centers, ${unitsOf(st, p).length} units</span>
      <span>ASSESSMENT</span><span>${traitWords(d.traits[p])}</span>
      <span>PACTS</span><span>${treaties.map(x => `<span style="color:${POWERS[x].color}">${x}</span>`).join(' ') || '<span class="muted">none</span>'}</span>
      <span>AT WAR WITH</span><span>${wars.map(x => `<span style="color:${POWERS[x].color}">${x === G.player ? 'YOU' : x}</span>`).join(' ') || '<span class="muted">none</span>'}</span>
    </div></div>
    <div class="sec-title">SECURE CHANNEL</div>
    <div class="chat" id="chat">${msgs.length ? msgs.map(m => msgHtml(m, p)).join('') : '<div class="muted small">No traffic on this channel.</div>'}</div>`;
  if (dead) h += `<p class="muted">This government has collapsed. No one answers.</p>`;
  else if (st.phase !== 'orders' || G.reviewing) h += `<p class="muted small">Negotiations resume during the next orders phase.</p>`;
  else {
    h += `<div class="sec-title">PROPOSALS</div><div class="actions-grid">
      <button class="btn" data-a="nap" ${s === 'nap' || s === 'alliance' || s === 'war' ? 'disabled' : ''}>NON-AGGRESSION PACT</button>
      <button class="btn" data-a="alliance" ${s === 'alliance' || s === 'war' ? 'disabled' : ''}>MILITARY ALLIANCE</button>
      <button class="btn" data-a="war" ${s === 'war' ? 'disabled' : ''}>JOINT WAR &#9656;</button>
      <button class="btn" data-a="support" ${s === 'war' ? 'disabled' : ''}>REQUEST SUPPORT &#9656;</button>
      <button class="btn" data-a="dmz">DEMILITARIZED ZONE &#9656;</button>
      <button class="btn" data-a="intel">REQUEST INTEL &#9656;</button>
      ${s === 'war' ? '<button class="btn" data-a="peace">OFFER CEASEFIRE</button>' : '<button class="btn danger" data-a="declare">DECLARE WAR</button>'}
    </div><div id="dip-sub"></div>`;
  }
  el.innerHTML = h;
  const chat = $('#chat'); chat.scrollTop = chat.scrollHeight;
  $('#dip-back').onclick = () => { G.dipFocus = null; renderDiploTab(); };
  for (const b of el.querySelectorAll('[data-ans]')) b.onclick = () => { D.answerProposal(G.map, st, d, +b.dataset.id, b.dataset.ans === 'y'); renderAll(); };
  for (const b of el.querySelectorAll('[data-a]')) b.onclick = () => dipAction(p, b.dataset.a);
  renderDipSub(p);
}

function msgHtml(m, p) {
  const inbound = m.from === p;
  const col = POWERS[m.from].color;
  let extra = '';
  if (m.status === 'pending' && inbound) extra = `<div class="m-actions"><button class="btn sm go" data-ans="y" data-id="${m.id}">ACCEPT</button><button class="btn sm danger" data-ans="n" data-id="${m.id}">DECLINE</button></div>`;
  else if (m.status && m.status !== 'pending') extra = `<div class="m-state ${m.status === 'accepted' ? '' : 'muted'}">${m.status.toUpperCase()}</div>`;
  if (m.accepted === true) extra += `<div class="m-state" style="color:var(--green)">AGREEMENT REACHED</div>`;
  if (m.accepted === false) extra += `<div class="m-state muted">REJECTED</div>`;
  return `<div class="msg ${inbound ? 'in' : 'out'} ${m.kind === 'warning' ? 'warning' : ''}" style="--msg-color:${col}"><div class="m-meta">${inbound ? POWERS[m.from].leader.toUpperCase() : 'YOU'} &middot; ${m.t}</div>${esc(m.text)}${extra}</div>`;
}

function dipAction(p, a) {
  if (['war', 'support', 'dmz', 'intel'].includes(a)) { G.dipSub = G.dipSub === a ? null : a; renderDipSub(p); return; }
  if (a === 'declare' && !confirm(`Declare war on ${POWERS[p].name}? Every power will take note.`)) return;
  sendProposal(p, { type: a });
}

function sendProposal(p, prop) {
  const d = G.diplo;
  D.playerPropose(G.map, G.state, d, p, prop);
  // the reply was generated instantly; reveal it after a short "transmission" delay
  const reply = d.messages[d.messages.length - 1];
  reply._hidden = true;
  G.dipSub = null;
  renderDiploTab();
  const chat = $('#chat');
  if (chat) { const t = document.createElement('div'); t.className = 'msg in muted small'; t.textContent = 'Encrypted channel open... awaiting response'; chat.appendChild(t); chat.scrollTop = chat.scrollHeight; }
  setTimeout(() => { delete reply._hidden; renderAll(); }, 700 + Math.random() * 700);
}

function renderDipSub(p) {
  const box = $('#dip-sub'); if (!box) return;
  const st = G.state; const d = G.diplo;
  const a = G.dipSub;
  if (!a) { box.innerHTML = ''; return; }
  let h = '<div class="sub-pick">';
  if (a === 'war' || a === 'intel') {
    const opts = alivePowers().filter(x => x !== p && x !== G.player);
    h += `<div class="muted small" style="margin-bottom:6px">${a === 'war' ? 'Joint war against:' : 'Intelligence on:'}</div>`;
    h += opts.map(x => `<button class="btn sm opt" data-t="${x}"><span style="color:${POWERS[x].color}">&#9632;</span> ${POWERS[x].name} <span class="muted">(${scCount(st, x)} SC)</span></button>`).join('');
  } else if (a === 'support') {
    const theirs = unitsOf(st, p);
    const opts = [];
    for (const u of unitsOf(st, G.player)) {
      const o = G.orders[u.loc];
      const dest = o?.type === 'M' ? o.to : u.loc;
      for (const v of theirs) if (v.loc !== dest && G.map.adjacent(v.type, v.loc, dest)) opts.push({ unit: v.loc, utype: v.type, from: u.loc, to: dest });
    }
    h += `<div class="muted small" style="margin-bottom:6px">Based on your current orders. Their unit &rarr; supports &rarr; your move:</div>`;
    h += opts.length ? opts.slice(0, 14).map((o, i) => `<button class="btn sm opt" data-i="${i}">${o.utype} ${G.map.byId[o.unit].name} &rArr; ${o.from === o.to ? `hold ${G.map.byId[o.to].name}` : `${G.map.byId[o.from].name} &rarr; ${G.map.byId[o.to].name}`}</button>`).join('')
      : '<div class="muted small">None of their units can reach your objectives. Issue move orders first.</div>';
    box._opts = opts;
  } else if (a === 'dmz') {
    const mine = new Set([...unitsOf(st, G.player).map(u => u.loc), ...Object.keys(st.sc).filter(k => st.sc[k] === G.player)]);
    const theirs = new Set([...unitsOf(st, p).map(u => u.loc), ...Object.keys(st.sc).filter(k => st.sc[k] === p)]);
    const near = set => { const s = new Set(); for (const id of set) for (const n of G.map.byId[id].adj) s.add(n); return s; };
    const nm = near(mine), nt = near(theirs);
    const regs = G.map.regions.filter(r => nm.has(r.id) && nt.has(r.id) && !mine.has(r.id) && !theirs.has(r.id) && !d.dmz.some(z => z.region === r.id)).slice(0, 14);
    h += `<div class="muted small" style="margin-bottom:6px">Neither side may enter the zone. Violations are acts of war.</div>`;
    h += regs.length ? regs.map(r => `<button class="btn sm opt" data-r="${r.id}">${r.name} <span class="muted">${r.type === 'sea' ? 'sea' : r.sc ? 'SC' : ''}</span></button>`).join('') : '<div class="muted small">No shared frontier regions.</div>';
  }
  h += '</div>';
  box.innerHTML = h;
  for (const b of box.querySelectorAll('[data-t]')) b.onclick = () => sendProposal(p, { type: a, target: b.dataset.t });
  for (const b of box.querySelectorAll('[data-i]')) b.onclick = () => { const o = box._opts[+b.dataset.i]; sendProposal(p, { type: 'support', unit: o.unit, from: o.from, to: o.to }); };
  for (const b of box.querySelectorAll('[data-r]')) b.onclick = () => sendProposal(p, { type: 'dmz', region: b.dataset.r });
}

// ======================================================================= intel tab
function logItem(i) { return `<div class="log-item ${i.kind}"><span class="lt">${i.t}</span>${esc(i.text)}</div>`; }

function renderIntelTab() {
  const el = $('#tab-intel'); const d = G.diplo; const st = G.state;
  const live = POWER_IDS;
  let h = `<div class="sec"><div class="sec-title">RELATIONS MATRIX</div><div class="matrix" style="grid-template-columns:repeat(${live.length + 1},1fr)"><div class="h"></div>`;
  h += live.map(p => `<div class="h" style="color:${POWERS[p].color}">${p}</div>`).join('');
  for (const a of live) {
    h += `<div class="h" style="color:${POWERS[a].color}">${a}</div>`;
    for (const b of live) { const s = D.status(d, a, b); h += `<div class="c-${s}" title="${POWERS[a].name} / ${POWERS[b].name}: ${s === 'self' ? '' : D.STATUS_LABEL[s]}"></div>`; }
  }
  h += `</div><div class="legend"><span><i style="background:rgba(61,255,160,.55)"></i>ALLIANCE</span><span><i style="background:rgba(57,213,255,.35)"></i>PACT</span><span><i style="background:rgba(255,77,94,.55)"></i>WAR</span><span><i style="background:rgba(255,255,255,.05)"></i>NEUTRAL</span></div></div>`;
  h += `<div class="sec"><div class="sec-title">SUPPLY CENTER TREND</div>${chartSvg()}</div>`;
  const F = { all: 'ALL', battle: 'BATTLES', sc: 'TERRITORY', treaty: 'TREATIES', war: 'WARS', betrayal: 'BETRAYALS' };
  h += `<div class="sec"><div class="sec-title">EVENT LOG</div><div class="filters">${Object.entries(F).map(([k, v]) => `<button class="btn sm ${G.intelFilter === k ? 'on' : ''}" data-f="${k}">${v}</button>`).join('')}</div>`;
  const items = d.intel.filter(i => G.intelFilter === 'all' || i.kind === G.intelFilter).slice(-150).reverse();
  h += items.map(logItem).join('') || '<div class="muted small">No events.</div>';
  h += '</div>';
  el.innerHTML = h;
  for (const b of el.querySelectorAll('[data-f]')) b.onclick = () => { G.intelFilter = b.dataset.f; renderIntelTab(); };
  void st;
}

function chartSvg() {
  const hist = [...G.scHistory];
  const cur = snapshotCounts(); if (!hist.length || hist[hist.length - 1].t !== cur.t) hist.push(cur);
  if (hist.length < 2) return '<div class="muted small">Trend data accumulates each winter.</div>';
  const W = 360, H = 150, pad = 4;
  const maxV = Math.max(G.state.winTarget * 0.5, ...hist.flatMap(s => Object.values(s.c)));
  const x = i => pad + i / (hist.length - 1) * (W - pad * 2);
  const y = v => H - pad - v / maxV * (H - pad * 2);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">`;
  for (let g = 0; g <= 4; g++) s += `<line x1="0" x2="${W}" y1="${y(maxV * g / 4)}" y2="${y(maxV * g / 4)}" stroke="rgba(57,213,255,.08)"/>`;
  for (const p of POWER_IDS) {
    const pts = hist.map((h, i) => `${x(i)},${y(h.c[p] || 0)}`).join(' ');
    s += `<polyline points="${pts}" fill="none" stroke="${POWERS[p].color}" stroke-width="${p === G.player ? 2.4 : 1.2}" opacity="${p === G.player ? 1 : 0.75}" vector-effect="non-scaling-stroke"/>`;
  }
  return s + '</svg>';
}

function renderTicker() {
  const items = G.diplo.intel.slice(-14).reverse();
  $('#tk-text').innerHTML = items.map(i => `<span><b>[${i.t}]</b>${esc(i.text)}</span>`).join('') || '<span>All stations reporting. Awaiting orders.</span>';
}

// ======================================================================= chrome
function switchTab(t) {
  G.tab = t;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === t);
  for (const k of ['orders', 'diplomacy', 'intel']) $('#tab-' + k).classList.toggle('hidden', k !== t);
  if (t === 'diplomacy') renderDiploTab();
  if (t === 'intel') renderIntelTab();
}

function toast(head, text, cls = '', onClick) {
  const t = document.createElement('div');
  t.className = 'toast ' + cls;
  t.innerHTML = `<div class="t-head">${esc(head)}</div>${esc(text)}`;
  t.onclick = () => { t.remove(); onClick?.(); };
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 7000);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}

function showProcessing(aiPowers) {
  $('#processing').classList.remove('hidden');
  $('#proc-title').textContent = 'ADJUDICATING';
  $('#proc-lines').innerHTML = `Intercepting orders from ${aiPowers.length} foreign commands...`;
  $('#proc-bar').style.width = '4%';
}
function progress(done, total, p) {
  $('#proc-bar').style.width = `${Math.round(done / total * 100)}%`;
  $('#proc-lines').innerHTML = `DECRYPTED: ${POWERS[p].codename} COMMAND (${POWERS[p].name})<br>${done}/${total} foreign commands analysed`;
}
function hideProcessing() { $('#processing').classList.add('hidden'); }
const sleep = ms => new Promise(r => setTimeout(r, ms));

function showManual(fromSetup) {
  const back = fromSetup ? showSetup : () => $('#modal').classList.add('hidden');
  $('#modal-card').innerHTML = `<h1>FIELD <span>MANUAL</span></h1><div class="manual">
    <h3>OBJECTIVE</h3><p>Control the target number of supply centers (circled markers). Centers change hands only at the end of a Fall turn, when a unit occupies them.</p>
    <h3>TURNS</h3><p>Each year has a Spring and Fall orders phase. All powers move at the same time. After each phase, dislodged units retreat. In Winter, each power builds or disbands units so it has one unit per supply center. Builds appear only in your empty, still-owned home centers.</p>
    <h3>UNITS</h3><ul><li><b>Armies</b> move on land. They can cross seas if fleets convoy them.</li><li><b>Fleets</b> move through seas and along coasts. Two coastal regions are fleet-adjacent only if they share a sea.</li></ul>
    <h3>COMBAT</h3><p>Every unit has strength 1. A move succeeds if it is stronger than the defender and every rival move into the same region. Equal strength means a standoff and nobody moves. Strength comes only from <b>support</b>.</p>
    <h3>SUPPORT</h3><p>A unit can support another unit's move or hold into a region it could itself move to. Support is <b>cut</b> if the supporting unit is attacked from any region other than the one it is supporting into. You can support other nations' units.</p>
    <h3>CONVOY</h3><p>Fleets in sea zones can carry an army across a chain of seas. Disrupt a convoy by dislodging a fleet in the chain.</p>
    <h3>CONTROLS</h3><ul><li>Click your unit, then a highlighted region: move.</li><li><b>H</b> hold, <b>S</b> support (click unit, then destination), <b>C</b> convoy (fleet: army, then destination).</li><li>Drag to pan (the world wraps), scroll to zoom, <b>Tab</b> next unit, <b>Esc</b> cancel.</li></ul>
    <h3>DIPLOMACY</h3><p>Every AI leader has a personality and tracks how much they trust each nation. Propose pacts, alliances and joint wars; request support for a specific move; agree demilitarized zones; or ask allies for intelligence on a rival's plans.</p>
    <p>AIs honour agreements by refusing to attack their partners, but disloyal leaders may betray you when the prize is large. Allied AIs see your submitted orders and will often support your attacks. Breaking your own word is remembered by everyone.</p>
    <h3>DEFCON</h3><p>The threat indicator rises with active wars and recent betrayals.</p>
  </div><div class="modal-foot"><button class="btn go" id="man-close">${fromSetup ? '&#9666; BACK' : 'CLOSE'}</button></div>`;
  $('#modal').classList.remove('hidden');
  $('#man-close').onclick = back;
}

function bindChrome() {
  for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => switchTab(b.dataset.tab);
  $('#btn-save').onclick = () => G.state && save();
  $('#btn-load').onclick = () => { const s = loadSaved(); if (s) { resume(s); toast('SYSTEM', 'Saved operation restored.'); } else toast('SYSTEM', 'No saved operation found.', 'warn'); };
  $('#btn-new').onclick = () => showSetup();
  $('#btn-help').onclick = () => showManual(false);
  for (const b of document.querySelectorAll('#zoombar button')) b.onclick = () => {
    const v = G.view; const [vw, vh] = v.viewSize();
    if (b.dataset.z === 'home') return G.player && v.flyTo(POWERS[G.player].capital, 3.2);
    const k = b.dataset.z === 'in' ? 1.5 : 1 / 1.5;
    const ns = Math.max(v.minScale(), Math.min(14, v.s * k)); const kk = ns / v.s;
    v.tx = vw / 2 - (vw / 2 - v.tx) * kk; v.ty = vh / 2 - (vh / 2 - v.ty) * kk; v.s = ns; v.apply();
  };
  document.addEventListener('keydown', e => {
    if (!G.state || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || !$('#modal').classList.contains('hidden')) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') clearSel();
    else if (k === 'tab') { e.preventDefault(); if (G.state.phase === 'orders' && !G.reviewing) cycleUnit(); }
    else if (G.sel && k === 'h') modeKey('hold');
    else if (G.sel && k === 'm') modeKey('move');
    else if (G.sel && k === 's') modeKey('support');
    else if (G.sel && k === 'c') modeKey('convoy');
  });
}

window.GC = G; // debug handle
boot();
