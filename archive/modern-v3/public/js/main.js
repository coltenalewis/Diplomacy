import { World, ll2v } from './world.js';
import { Globe } from './globe.js';
import { Sim, kmBetween } from './sim.js';
import { AI } from './ai.js';
import { NATIONS, NATION } from './nations.js';
import { UNITS, BUILDINGS, BUILD_ORDER, SPEEDS, LAND_TYPES, AIR_TYPES, SEA_TYPES, ECON, START_DATE } from './config.js';
import { TECHS, TECH, BRANCHES, canResearch, has } from './tech.js';
import { GOV_TYPES, LAWS, ROLES, CABINET, TRAITS, lawOpt, canEnact, enact, reform, reformCost, appoint, hireCost, resolveEvent, lawCost } from './gov.js';
import { convene, execute, deny, confidence, MEETING_COOLDOWN_DAYS } from './cabinet.js';

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SAVE_KEY = 'globalcommand.live.v2';
const fmt = n => { const a = Math.abs(n); return a >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : a >= 100 ? Math.round(n).toString() : a >= 10 ? n.toFixed(1) : n.toFixed(2); };
const money = n => { const a = Math.abs(n); return (n < 0 ? '-' : '') + '$' + (a >= 1000 ? (a / 1000).toFixed(2) + 'B' : a >= 10 ? Math.round(a) + 'M' : a.toFixed(1) + 'M'); };
const sgn = n => (n >= 0 ? '+' : '') + fmt(n);
const pct = v => Math.round(v * 100) + '%';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const REL_LABEL = { war: 'At war', peace: 'Peace', nap: 'Non-aggression', alliance: 'Alliance' };
const hexRGB = h => { const v = parseInt(h.slice(1), 16); return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
const COL = {}; for (const n of NATIONS) COL[n.code] = hexRGB(n.color);
const initials = name => name.replace(/^(Gen|Adm)\. /, '').split(' ').map(x => x[0]).slice(0, 2).join('');

const G = {
  world: null, json: null, geo: null, globe: null, sim: null, ai: null,
  speed: 0, prevSpeed: 1, acc: 0, sel: new Set(), region: null, hover: null, tab: 'region',
  dip: null, dipFilter: '', dipList: 'relevant', intelFilter: 'all',
  overlay: 'political', showRoutes: true, showLabels: true, clouds: true,
  ownerSig: '', lastPanel: 0, lastStacks: 0, lastRings: 0, stacks: [], capMarks: [], markerEls: new Map(), labelEls: new Map(),
  disp: new Map(), trails: new Map(), scarCount: 0, pauseOnEvents: true,
};

// ======================================================================= boot
async function boot() {
  const [json, geo] = await Promise.all([fetch('data/map.json').then(r => r.json()), fetch('data/geo.json').then(r => r.json())]);
  G.json = json; G.geo = geo;
  G.world = new World(json);
  G.globe = new Globe($('#globe'), G.world, json);
  G.globe.initUnits();
  await G.globe.load();
  G.globe.setSunHours(START_DATE, 0);
  bindInput();
  bindChrome();
  requestAnimationFrame(frame);
  showSetup();
}

// ======================================================================= setup
function showSetup() {
  setSpeed(0);
  const saved = loadSaved();
  let sel = G.sim?.s.player || 'USA', temper = 1, share = 0.33, q = '';
  const majors = NATIONS.filter(n => n.major);
  const gdpTxt = n => '$' + (n.gdp >= 1000 ? (n.gdp / 1000).toFixed(1) + 'T' : n.gdp + 'B');
  const render = () => {
    const list = NATIONS.filter(n => !q || n.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.gdp || 0) - (a.gdp || 0));
    $('#modal-card').innerHTML = `
      <div class="kicker">A living world simulation</div>
      <h1>Global <span>Command</span></h1>
      <p class="muted">Lead one of ${NATIONS.length} nations in real time. Appoint ministers and generals, pass laws, research toward artificial intelligence or the bomb, build cities and industries, trade across the oceans, and fight with armies, fleets and air wings that move and shoot across a living Earth. Command every detail yourself, or delegate and steer.</p>
      <h2>Choose your nation</h2>
      <div class="nat-grid">${majors.map(n => `<div class="nat ${n.code === sel ? 'sel' : ''}" data-n="${n.code}" style="--pc:${n.color}"><div class="nn" style="color:${n.color}">${n.name}</div><div class="nm2">${n.pop}M people &middot; ${gdpTxt(n)} &middot; ${n.regions.length} regions</div></div>`).join('')}</div>
      <input class="inp" id="st-q" placeholder="Search all ${NATIONS.length} nations..." value="${esc(q)}" style="margin-top:8px">
      <div class="nat-list">${list.map(n => `<div class="row ${n.code === sel ? 'sel' : ''}" data-n="${n.code}"><span><span class="flagchip" style="background:${n.color}"></span>${n.name}</span><span class="muted">${n.pop}M &middot; ${gdpTxt(n)} &middot; ${n.regions.length} regions</span></div>`).join('')}</div>
      <h2>World temperament</h2>
      <div class="opt-row">
        <button class="btn ${temper === 0.5 ? 'on' : ''}" data-t="0.5">Stable<small>Governments rarely go to war.</small></button>
        <button class="btn ${temper === 1 ? 'on' : ''}" data-t="1">Realistic<small>Regional conflicts break out over time.</small></button>
        <button class="btn ${temper === 1.7 ? 'on' : ''}" data-t="1.7">Volatile<small>Ambitious powers and frequent wars.</small></button>
      </div>
      <h2>Victory</h2>
      <div class="opt-row">
        <button class="btn ${share === 0.25 ? 'on' : ''}" data-v="0.25">Economic power<small>25% of world income.</small></button>
        <button class="btn ${share === 0.33 ? 'on' : ''}" data-v="0.33">Superpower<small>33% of world income.</small></button>
        <button class="btn ${share === 0.5 ? 'on' : ''}" data-v="0.5">Hegemon<small>50% of world income.</small></button>
      </div>
      <div class="modal-foot">
        ${saved ? `<button class="btn" id="st-resume">Resume ${esc(NATION[saved.s.player].name)} (${dateStr(saved.s.t)})</button>` : ''}
        <button class="btn" id="st-help">Manual</button>
        <button class="btn go" id="st-go">Take office &#9656;</button>
      </div>`;
    for (const e of document.querySelectorAll('[data-n]')) e.onclick = () => { sel = e.dataset.n; render(); const r = G.world.byId[NATION[sel].regions[0]]; G.globe.flyTo(r.lat, r.lon, 2.8); };
    for (const e of document.querySelectorAll('[data-t]')) e.onclick = () => { temper = +e.dataset.t; render(); };
    for (const e of document.querySelectorAll('[data-v]')) e.onclick = () => { share = +e.dataset.v; render(); };
    const qi = $('#st-q'); qi.oninput = () => { q = qi.value; render(); const x = $('#st-q'); x.focus(); x.setSelectionRange(q.length, q.length); };
    $('#st-go').onclick = () => startGame(sel, temper, share);
    $('#st-help').onclick = () => showManual(true);
    if (saved) $('#st-resume').onclick = () => resume(saved);
  };
  render();
  $('#modal').classList.remove('hidden');
}

function startGame(player, temper, share) {
  const sim = new Sim(G.world, G.geo, { player, winShare: share });
  sim.s.temper = temper;
  attach(sim);
  sim.emit('info', `You take office in ${NATION[player].name}.`, [player]);
  $('#modal').classList.add('hidden');
  const cap = G.world.regions[sim.s.nations[player].capital];
  G.globe.flyTo(cap.lat, cap.lon, 2.3);
  selectRegion(sim.s.nations[player].capital);
  setSpeed(1);
}
function resume(saved) {
  const sim = new Sim(G.world, G.geo, { state: saved.s });
  for (const N of Object.values(sim.s.nations)) if (N.alive) sim.recalcNation(N.code);
  attach(sim);
  $('#modal').classList.add('hidden');
  const cap = G.world.regions[sim.s.nations[sim.s.player].capital];
  G.globe.flyTo(cap.lat, cap.lon, 2.3);
  selectRegion(sim.s.nations[sim.s.player].capital);
  setSpeed(0);
}
function attach(sim) {
  G.sim = sim; G.ai = new AI(sim);
  G.sel.clear(); G.dip = null; G.ownerSig = ''; G.disp.clear(); G.trails.clear(); G.scarCount = -1;
  for (const el of G.markerEls.values()) el.remove(); G.markerEls.clear();
  for (const el of G.labelEls.values()) el.remove(); G.labelEls.clear();
  sim.on(onEvent);
  const N = NATION[sim.s.player];
  $('#crest').style.background = N.color; $('#crest').textContent = N.code;
  $('#brand-name').textContent = N.name;
  G.globe.setSunHours(START_DATE, sim.s.t);
  refreshWorld(true);
  computeStacks();
  renderTicker();
  renderPanel(true);
  if (sim.s.pendingEvent) showEvent(sim.s.pendingEvent);
}
function save(silent) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify({ s: G.sim.s })); if (!silent) toast('System', 'Game saved.', 'good'); }
  catch { toast('System', 'Save failed: browser storage unavailable.', 'warn'); }
}
function loadSaved() { try { const v = JSON.parse(localStorage.getItem(SAVE_KEY)); return v?.s?.player ? v : null; } catch { return null; } }

// ======================================================================= main loop
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.25, (now - lastT) / 1000); lastT = now;
  const sim = G.sim;
  if (sim && !sim.s.over) {
    G.acc += dt * SPEEDS[G.speed];
    let steps = 0;
    while (G.acc >= 1 && steps < 40) { sim.step(); G.ai.hourly(); G.acc -= 1; steps++; }
    if (steps >= 40) G.acc = 0;
    if (steps) { refreshWorld(false); if (sim.s.over) gameOver(); }
    if (sim.shots.length) processShots(sim.shots.splice(0));
    G.globe.setSunHours(START_DATE, sim.s.t + G.acc);
  }
  G.globe.tick();
  if (sim) {
    if (now - G.lastStacks > 200) { computeStacks(); G.lastStacks = now; }
    drawUnits();
    placeLabels();
    if (now - G.lastRings > 500) { updateRings(); G.lastRings = now; }
    if (now - G.lastPanel > 500) { renderTop(); renderStanding(); renderPanel(false); G.lastPanel = now; }
  }
  G.globe.render();
  requestAnimationFrame(frame);
}

function dateStr(t) { const d = new Date(START_DATE + t * 3600e3); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; }
function setSpeed(k) {
  G.speed = k;
  for (const b of document.querySelectorAll('#speed button')) b.classList.toggle('on', +b.dataset.s === k);
  $('#paused').classList.toggle('hidden', k !== 0 || !G.sim);
}

// ======================================================================= world visuals
function refreshWorld(force) {
  const sim = G.sim, s = sim.s, globe = G.globe;
  const owners = s.regions.map(r => r.owner);
  const sig = owners.join(',');
  if (force || sig !== G.ownerSig) { G.ownerSig = sig; globe.updateNationBorders(owners, c => c ? NATION[c].color : '#888888'); computeNationLabels(); }
  for (const r of s.regions) {
    const hl = r.i === G.region ? 0.9 : r.i === G.hover ? 0.35 : 0;
    if (r.sea) { globe.setRegion(r.i, { alpha: 0, highlight: hl }); continue; }
    const col = r.owner ? NATION[r.owner].color : null;
    const occupied = r.core && r.owner !== r.core;
    const glow = Math.max(0, (r.city - r.city0) * 0.22) + (r.light > 1 ? (r.light - 1) * 0.5 : 0);
    globe.setRegion(r.i, { color: col, alpha: G.overlay === 'political' ? (r.owner === s.player ? 0.34 : occupied ? 0.42 : 0.24) : 0, light: r.light, highlight: hl, glow, contested: r.capture ? Math.min(1, 0.4 + r.capture.p) : 0 });
  }
  globe.commitPalette();
  if (s.scars.length !== G.scarCount) { G.scarCount = s.scars.length; globe.setScars(s.scars); }
  globe.syncRoutes(s.trades.map(t => ({ id: t.id, sig: t.path.join('-'), kind: t.good, blockaded: t.blockaded, mine: t.from === s.player || t.to === s.player, latlon: t.path.map(i => [G.world.regions[i].lat, G.world.regions[i].lon]) })));
}

function computeNationLabels() {
  const s = G.sim.s, w = G.world, acc = {};
  for (const r of s.regions) {
    if (r.sea || !r.owner) continue;
    const R = w.regions[r.i], v = ll2v(R.lat, R.lon), wgt = Math.sqrt(r.area || 1);
    const a = acc[r.owner] ||= { x: 0, y: 0, z: 0, n: 0 };
    a.x += v[0] * wgt; a.y += v[1] * wgt; a.z += v[2] * wgt; a.n++;
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
    const flag = (G.sel.has(u.id) ? 1 : 0) | (u.nation === s.player ? 2 : 0) | (air ? 4 : 0) | (T.domain === 'sea' ? 8 : 0) | (u.fighting ? 16 : 0);
    const size = (air ? 5.5 : T.domain === 'sea' ? (u.type === 'CAR' ? 9 : 7.5) : u.type === 'ARM' ? 7 : 6.3) * (u.nation === s.player ? 1.1 : 1);
    list.push({ lat: p[0], lon: p[1], alt: air ? 0.014 : 0, color: COL[u.nation], size, flag });
    if (air || (T.domain === 'sea' && u.move)) {
      let h = G.trails.get(u.id);
      if (!h) { h = []; G.trails.set(u.id, h); }
      const last = h[h.length - 1];
      if (!last || now - last.t > 70) { h.push({ p: [p[0], p[1], air ? 0.014 : 0], t: now }); if (h.length > (air ? 14 : 9)) h.shift(); }
      trailList.push({ pts: h.map(x => x.p), color: air ? COL[u.nation] : [0.7, 0.85, 1] });
    } else if (G.trails.has(u.id)) G.trails.delete(u.id);
  }
  if (G.disp.size > s.units.length * 1.5) { const live = new Set(s.units.map(u => u.id)); for (const k of G.disp.keys()) if (!live.has(k)) G.disp.delete(k); }
  g.setUnits(list);
  g.setTrails(trailList);
  placeMarkers();
}

function computeStacks() {
  const s = G.sim.s, w = G.world;
  const m = new Map();
  for (const u of s.units) {
    if (airborne(u)) continue;
    const T = UNITS[u.type];
    const key = u.move ? `${u.nation}|${u.move.path[u.move.seg]}>${u.move.path[u.move.seg + 1]}|${u.move.path.at(-1)}|${T.domain}` : `${u.nation}|${u.loc}|${T.domain}`;
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
  G.stacks = stacks;
  G.capMarks = s.regions.filter(r => r.capture).map(r => ({ key: 'c' + r.i, lat: w.regions[r.i].lat, lon: w.regions[r.i].lon, p: r.capture.p }));
  syncMarkerEls();
}

const ICON = {
  inf: '<svg viewBox="0 0 24 24"><path d="M4 15a8 8 0 0 1 16 0z"/><rect x="2" y="15.5" width="20" height="2.6" rx="1.3"/><path d="M8 18.5h2.2l.8 3h2l.8-3H16" fill="none" stroke="#fff" stroke-width="1.4"/></svg>',
  arm: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="6" rx="3"/><rect x="7" y="7" width="8" height="5" rx="1.5"/><rect x="14" y="8.3" width="8" height="2" rx="1"/></svg>',
  art: '<svg viewBox="0 0 24 24"><circle cx="9" cy="16" r="4"/><path d="M10 13L21 5l1.4 1.8L12 15z"/><rect x="2" y="19" width="14" height="2" rx="1"/></svg>',
  ftr: '<svg viewBox="0 0 24 24"><path d="M12 2l2 7 8 4v2l-8-2-.5 5 2.5 2v1.5l-4-1-4 1V20l2.5-2-.5-5-8 2v-2l8-4z"/></svg>',
  bmb: '<svg viewBox="0 0 24 24"><path d="M12 2l1.6 6L23 11v2.4l-9.4-1.6-.4 6.2 3 2.2V22l-4.2-1L7.8 22v-1.8l3-2.2-.4-6.2L1 13.4V11l9.4-3z"/></svg>',
  des: '<svg viewBox="0 0 24 24"><path d="M2 14h20l-3 5H5z"/><path d="M9 9h5v5H9zM11 6h1.5v3H11z"/></svg>',
  cru: '<svg viewBox="0 0 24 24"><path d="M1 14h22l-3 5.5H4z"/><path d="M6 9h4v5H6zM12 7h5v7h-5zM14 4h1.5v3H14z"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="M1 12h22v2.5H1z"/><path d="M3 14.5h18l-2 4.5H5z"/><path d="M16 7h3v5h-3z"/></svg>',
  sub: '<svg viewBox="0 0 24 24"><path d="M2 15c4-4 16-4 20 0-4 3-16 3-20 0z"/><path d="M10 9h4v4h-4z"/></svg>',
  trn: '<svg viewBox="0 0 24 24"><path d="M2 14h20l-3 5H5z"/><path d="M5 9h4v5H5zM10 9h4v5h-4zM15 9h4v5h-4z"/></svg>',
};
function syncMarkerEls() {
  const host = $('#markers'); const s = G.sim.s;
  const seen = new Set();
  const make = (key, cls) => { let el = G.markerEls.get(key); if (!el) { el = document.createElement('div'); el.className = cls; host.appendChild(el); G.markerEls.set(key, el); } seen.add(key); return el; };
  for (const st of G.stacks) {
    const el = make('u' + st.key, 'tok');
    const col = NATION[st.nation].color;
    const C = 2 * Math.PI * 13;
    const xs = st.xp >= 75 ? '★★★' : st.xp >= 50 ? '★★' : st.xp >= 25 ? '★' : '';
    const html = `<svg class="ring" viewBox="0 0 30 30"><circle class="bg" cx="15" cy="15" r="13"/><circle class="hp" cx="15" cy="15" r="13" stroke="${st.hp < 0.35 ? '#ff5d5d' : st.hp < 0.7 ? '#ffb547' : '#5ee39a'}" stroke-dasharray="${(C * st.hp).toFixed(1)} ${C.toFixed(1)}"/></svg><div class="disc">${ICON[UNITS[st.main].sym]}</div>${st.units.length > 1 ? `<b class="n">${st.units.length}</b>` : ''}${xs ? `<span class="xp">${xs}</span>` : ''}${st.moving ? '<span class="dir"><i></i></span>' : ''}`;
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.style.setProperty('--c', col);
    const cls = `tok${st.nation === s.player ? ' mine' : ' small'}${st.sel ? ' sel' : ''}${st.moving ? ' moving' : ''}${st.fight ? ' fight' : ''}`;
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
    const sz = st ? (st.nation === s.player ? 30 : 24) : 40;
    const oy = st ? (st.domain === 'air' ? -38 : -26) : 12;
    el.style.transform = `translate3d(${(p.x - sz / 2).toFixed(1)}px,${(p.y + oy - sz / 2).toFixed(1)}px,0)`;
    if (st?.moving && st.toward) {
      const q = g.project(st.toward[0], st.toward[1], 1.01);
      const d = el.querySelector('.dir'); if (d) d.style.transform = `rotate(${(Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI + 90).toFixed(0)}deg)`;
    }
  }
}

function placeLabels() {
  const g = G.globe, dist = g.distance();
  const host = $('#labels'); const seen = new Set();
  if (G.showLabels && G.nationLabels) {
    if (dist > 1.55) for (const nl of G.nationLabels) {
      const N = NATION[nl.c];
      if (dist > 3.3 && !N.major && nl.n < 4) continue;
      if (dist > 2.4 && nl.n < 2 && !N.major) continue;
      const p = g.project(nl.lat, nl.lon, 1.0); if (!p.visible || p.facing < 0.35) continue;
      const k = 'n' + nl.c; seen.add(k);
      let el = G.labelEls.get(k);
      if (!el) { el = document.createElement('div'); el.className = 'lab nation' + (N.major ? ' major' : ''); el.textContent = N.name; el.style.color = N.color; host.appendChild(el); G.labelEls.set(k, el); el._w = 0; }
      if (!el._w) el._w = el.offsetWidth;
      el.style.transform = `translate3d(${(p.x - el._w / 2).toFixed(1)}px,${(p.y - 9).toFixed(1)}px,0)`; el.style.opacity = Math.min(0.92, (p.facing - 0.3) * 2).toFixed(2);
    }
    if (dist < 1.9) {
      let n = 0;
      const caps = new Set(Object.values(G.sim.s.nations).filter(N => N.alive).map(N => N.capital));
      for (const R of G.world.regions) {
        if (R.sea && dist > 1.5) continue;
        const p = g.project(R.lat, R.lon, 1.0); if (!p.visible || p.facing < 0.8) continue;
        if (++n > 140) break;
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

function updateRings() {
  const units = selectedUnits(), rings = [], paths = [];
  const seen = new Set();
  for (const u of units) {
    const T = UNITS[u.type];
    const p = G.disp.get(u.id) || u.pos;
    const km = T.domain === 'air' ? T.radius : T.range;
    const key = u.type + ':' + (u.move ? 'm' + u.id : u.loc);
    if (km > 60 && !seen.has(key)) { seen.add(key); const base = T.domain === 'air' ? G.sim.anchor(u.loc) : p; rings.push({ lat: base[0], lon: base[1], km, color: T.domain === 'air' ? 0x9fd8ff : T.domain === 'sea' ? 0x5cc8d6 : 0xe9c46a }); }
    if (u.move && !seen.has('p' + u.move.path.join('-'))) {
      seen.add('p' + u.move.path.join('-'));
      paths.push([p, ...u.move.path.slice(u.move.seg + 1).map(i => G.sim.anchor(i))]);
    }
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
  const tt = $('#tooltip'); const cnt = {};
  for (const u of st.units) cnt[u.type] = (cnt[u.type] || 0) + 1;
  const grp = st.units[0].group && G.sim.s.groups.find(x => x.id === st.units[0].group);
  tt.innerHTML = `<div class="tt-name" style="color:${NATION[st.nation].color}">${NATION[st.nation].name} ${st.domain} group</div>` +
    Object.entries(cnt).map(([t, n]) => `<div class="tt-row"><span>${UNITS[t].name}</span><span>${n}</span></div>`).join('') +
    `<div class="tt-row"><span class="muted">Strength</span><span>${pct(st.hp)}</span></div><div class="tt-row"><span class="muted">Experience</span><span>${Math.round(st.xp)}/100</span></div>` +
    (grp ? `<div class="tt-row"><span class="muted">Army group</span><span>${esc(grp.name)}</span></div>` : '') +
    (st.dest !== null ? `<div class="tt-row"><span class="muted">Heading to</span><span>${G.world.regions[st.dest].name}</span></div>` : '') +
    (st.fight ? '<div class="tt-row" style="color:var(--red)"><span>Engaged in combat</span></div>' : '');
  const b = $('#stage').getBoundingClientRect(), e = el.getBoundingClientRect();
  tt.style.left = (e.right - b.left + 8) + 'px'; tt.style.top = (e.top - b.top) + 'px';
  tt.classList.remove('hidden');
}

// ======================================================================= input
function bindInput() {
  const cv = G.globe.renderer.domElement;
  let down = null, box = null;
  cv.addEventListener('pointerdown', e => {
    down = { x: e.clientX, y: e.clientY, b: e.button };
    if (e.button === 0 && e.shiftKey && G.sim) { box = { x: e.clientX, y: e.clientY }; G.globe.controls.enabled = false; }
  });
  window.addEventListener('pointermove', e => {
    if (!box) return;
    const st = $('#stage').getBoundingClientRect(), el = $('#boxsel');
    el.style.left = (Math.min(box.x, e.clientX) - st.left) + 'px'; el.style.top = (Math.min(box.y, e.clientY) - st.top) + 'px';
    el.style.width = Math.abs(e.clientX - box.x) + 'px'; el.style.height = Math.abs(e.clientY - box.y) + 'px';
    el.classList.remove('hidden');
  });
  window.addEventListener('pointerup', e => {
    if (!box) return;
    const st = $('#stage').getBoundingClientRect();
    const x1 = Math.min(box.x, e.clientX) - st.left, x2 = Math.max(box.x, e.clientX) - st.left, y1 = Math.min(box.y, e.clientY) - st.top, y2 = Math.max(box.y, e.clientY) - st.top;
    $('#boxsel').classList.add('hidden'); G.globe.controls.enabled = true; box = null;
    if (x2 - x1 > 6 && y2 - y1 > 6) {
      G.sel.clear();
      for (const u of G.sim.s.units) {
        if (u.nation !== G.sim.s.player) continue;
        const p = G.disp.get(u.id) || u.pos; const q = G.globe.project(p[0], p[1], 1.003);
        if (q.visible && q.x >= x1 && q.x <= x2 && q.y >= y1 && q.y <= y2) G.sel.add(u.id);
      }
      computeStacks(); renderSelbar(); updateRings(); if (G.sel.size) switchTab('forces');
      down = null;
    }
  });
  cv.addEventListener('pointerup', e => {
    if (!down || !G.sim) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5;
    const b = down.b; down = null;
    if (moved) return;
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
    if (!G.sim) return;
    const ll = G.globe.pickLL(e.clientX, e.clientY);
    const i = ll ? G.world.regionAtLL(ll[0], ll[1]) : -1;
    if (ll) $('#ro-coords').textContent = `${Math.abs(ll[0]).toFixed(2)}°${ll[0] >= 0 ? 'N' : 'S'}  ${Math.abs(ll[1]).toFixed(2)}°${ll[1] >= 0 ? 'E' : 'W'}`;
    const h = i >= 0 ? i : null;
    if (h !== G.hover) { G.hover = h; refreshWorld(false); }
    regionTip(h, e);
  });
  cv.addEventListener('pointerleave', () => { $('#tooltip').classList.add('hidden'); G.hover = null; });
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
  const tt = $('#tooltip');
  if (i === null) { tt.classList.add('hidden'); $('#ro-region').textContent = '--'; return; }
  const R = G.world.regions[i], r = G.sim.s.regions[i];
  $('#ro-region').textContent = R.name;
  let h = `<div class="tt-name">${R.name}</div>`;
  if (R.sea) h += `<div class="muted">Open water</div>`;
  else {
    h += `<div class="tt-row"><span class="muted">Controlled by</span><span style="color:${NATION[r.owner].color}">${NATION[r.owner].name}</span></div>`;
    if (r.core !== r.owner) h += `<div class="tt-row"><span class="muted">Occupied from</span><span>${NATION[r.core].name}</span></div>`;
    h += `<div class="tt-row"><span class="muted">Population</span><span>${fmt(r.pop)}M</span></div><div class="tt-row"><span class="muted">City / Industry</span><span>${r.city} / ${r.industry}</span></div>`;
    if (r.capture) h += `<div class="tt-row" style="color:var(--red)"><span>Siege by ${NATION[r.capture.by].name}</span><span>${pct(r.capture.p)}</span></div>`;
  }
  if (G.sel.size) h += `<div class="muted" style="margin-top:4px">Right-click to send selected forces</div>`;
  tt.innerHTML = h;
  const b = $('#stage').getBoundingClientRect();
  let x = e.clientX - b.left + 16, y = e.clientY - b.top + 16;
  if (x > b.width - 230) x -= 250; if (y > b.height - 130) y -= 140;
  tt.style.left = x + 'px'; tt.style.top = y + 'px'; tt.classList.remove('hidden');
}

function selectRegion(i) { G.region = i; refreshWorld(false); if (G.tab !== 'region') switchTab('region'); else renderPanel(true); }
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
  const sim = G.sim, s = sim.s;
  const units = selectedUnits().filter(u => u.nation === s.player);
  if (!units.length) return;
  const r = s.regions[i], R = G.world.regions[i];
  const air = units.filter(u => UNITS[u.type].domain === 'air');
  const rest = units.filter(u => UNITS[u.type].domain !== 'air');
  if (air.length && !R.sea && r.owner && sim.atWar(s.player, r.owner)) {
    let n = 0;
    for (const u of air) if (kmBetween(sim.anchor(u.loc), sim.anchor(i)) <= UNITS[u.type].radius) { u.mission = { strike: i }; n++; }
    toast('Air command', n ? `${n} air wing(s) will fly strike missions against ${R.name}.` : `${R.name} is beyond the operating radius of the selected air wings.`, n ? 'good' : 'warn');
  } else if (air.length) {
    const res = sim.order(air.map(u => u.id), i);
    if (!res.ok) toast('Air command', res.reason || 'Cannot rebase there.', 'warn');
  }
  if (rest.length) {
    let res = sim.order(rest.map(u => u.id), i);
    if (res.needWar) {
      const names = res.needWar.map(c => NATION[c].name).join(', ');
      if (!confirm(`This route enters ${names}. Declare war on ${names}?`)) return;
      res = sim.order(rest.map(u => u.id), i, { declare: true });
    }
    if (!res.ok) toast('Command', res.reason || 'Order not possible.', 'warn');
  }
  G.globe.flash(R.lat, R.lon, 0xe9c46a);
  computeStacks(); updateRings(); renderPanel(true);
}

// ======================================================================= events, toasts, ticker
function onEvent(e) {
  const s = G.sim.s;
  if (e.kind === 'message') {
    const m = e.msg;
    toast(`${NATION[m.from].name} · ${m.proposal ? 'Proposal' : 'Cable'}`, m.text, m.proposal ? 'prop' : '', () => openDossier(m.from), m.proposal ? m : null);
    return;
  }
  if (e.kind === 'rp') { showEvent(e.ev); return; }
  const mine = e.nations?.includes(s.player);
  if (e.loc !== undefined && ['capture', 'war'].includes(e.kind)) { const R = G.world.regions[e.loc]; G.globe.flash(R.lat, R.lon, e.kind === 'war' ? 0xff3344 : 0xff8a3d); }
  const go = () => { if (e.loc !== undefined) { const R = G.world.regions[e.loc]; G.globe.flyTo(R.lat, R.lon); selectRegion(e.loc); } };
  if (e.kind === 'nuke') toast('Nuclear detonation', e.text, 'nuke', go);
  else if (mine && ['war', 'capture', 'peace', 'treaty', 'trade', 'econ', 'gov'].includes(e.kind)) {
    const bad = e.kind === 'war' || e.kind === 'econ' || (e.kind === 'capture' && e.nations[1] === s.player) || (e.kind === 'trade' && e.text.includes('blockad'));
    toast(e.kind === 'gov' ? 'Government' : e.kind[0].toUpperCase() + e.kind.slice(1), e.text, bad ? 'warn' : 'good', go);
  } else if (mine && (e.kind === 'build' || e.kind === 'tech')) toast(e.kind === 'tech' ? 'Research' : 'Logistics', e.text, '', go);
  else if (e.major) toast('World', e.text, 'warn', go);
  renderTicker();
}

function toast(head, text, cls = '', onClick, proposal) {
  const t = document.createElement('div');
  t.className = 'toast ' + cls;
  t.innerHTML = `<div class="t-head">${esc(head)} · ${dateStr(G.sim?.s.t || 0)}</div>${esc(text)}` + (proposal ? `<div class="t-actions"><button class="btn sm go" data-y="1">Accept</button><button class="btn sm danger" data-n="1">Decline</button></div>` : '');
  t.onclick = e => { if (e.target.dataset.y) answer(proposal, true); else if (e.target.dataset.n) answer(proposal, false); else onClick?.(); t.remove(); };
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), proposal ? 20000 : 8000);
  while ($('#toasts').children.length > 4) $('#toasts').firstChild.remove();
}

function renderTicker() {
  const ev = G.sim.s.events.filter(e => !['loss', 'build'].includes(e.kind)).slice(-14).reverse();
  $('#tk-text').innerHTML = ev.map(e => `<span><b>${dateStr(e.t)}</b>${esc(e.text)}</span>`).join('') || '<span>All quiet.</span>';
}

function showEvent(ev) {
  const sim = G.sim, N = sim.s.nations[sim.s.player];
  if (N.delegateEvents) {
    const k = N.money < 600 ? ev.options.length - 1 : 0;
    const out = resolveEvent(sim, N, ev, k); sim.s.pendingEvent = null;
    toast('Cabinet decision', `${ev.title}: ${ev.options[k]}. ${out}`, '');
    return;
  }
  if (G.pauseOnEvents && G.speed) { G.prevSpeed = G.speed; setSpeed(0); G.resumeAfterEvent = true; }
  $('#event-card').innerHTML = `<div class="ek">${dateStr(sim.s.t)} · Cabinet briefing</div><h3>${esc(ev.title)}</h3><p>${esc(ev.text)}</p><div class="eo">${ev.options.map((o, k) => `<button class="btn" data-o="${k}">${esc(o)}</button>`).join('')}</div>`;
  $('#eventbox').classList.remove('hidden');
  for (const b of document.querySelectorAll('#event-card [data-o]')) b.onclick = () => {
    const out = resolveEvent(sim, N, ev, +b.dataset.o);
    sim.s.pendingEvent = null;
    $('#eventbox').classList.add('hidden');
    toast(ev.title, out, 'good');
    if (G.resumeAfterEvent) { setSpeed(G.prevSpeed || 1); G.resumeAfterEvent = false; }
    renderPanel(true);
  };
}



// ======================================================================= War Department (bulk procurement)
const PACKAGES = [
  { name: 'Infantry Division', mix: { INF: 6, ART: 2, ARM: 1 }, desc: 'Line infantry with fire support' },
  { name: 'Armored Corps', mix: { ARM: 5, INF: 2, ART: 1 }, desc: 'Breakthrough force' },
  { name: 'Artillery Brigade', mix: { ART: 4 }, desc: '160 km of indirect fire' },
  { name: 'Garrison Levy', mix: { INF: 10 }, desc: 'Cheap mass infantry' },
  { name: 'Air Group', mix: { FTR: 2, BMB: 2 }, desc: 'Air superiority and strike' },
  { name: 'Carrier Strike Group', mix: { CAR: 1, DES: 2, CRU: 1, SUB: 1 }, desc: 'Blue-water power projection' },
  { name: 'Submarine Pack', mix: { SUB: 4 }, desc: 'Raid enemy shipping' },
  { name: 'Amphibious Lift', mix: { TRN: 3, DES: 1 }, desc: '+12 sealift with escort' },
];
const WAR = { type: 'INF', qty: 10, site: 'auto', near: null, rally: null, group: null };
function openWar(region) {
  if (!G.sim) return;
  if (region !== undefined) { WAR.site = String(region); const r = G.sim.s.regions[region]; if (!r.industry && r.port) WAR.type = 'DES'; }
  WAR.resume = G.speed; setSpeed(0);
  renderWar();
  $('#warbox').classList.remove('hidden');
}
function closeWar() { $('#warbox').classList.add('hidden'); if (WAR.resume) setSpeed(WAR.resume); WAR.resume = 0; renderPanel(true); }
function warOpts() {
  return { region: WAR.site !== 'auto' && WAR.site !== 'near' ? +WAR.site : null, near: WAR.site === 'near' ? (G.region ?? null) : null, group: WAR.group ? +WAR.group : null, rally: WAR.rally === 'sel' ? (G.region ?? null) : WAR.rally === 'group' && WAR.group ? groupCenter(+WAR.group) : null };
}
function groupCenter(gid) {
  const g = G.sim.s.groups.find(x => x.id === gid); const u = g && g.units.map(id => G.sim.unitById.get(id)).find(x => x && UNITS[x.type].domain === 'land');
  return u ? u.loc : null;
}
// simulate where an order would go without committing it
function previewOrder(type, qty) {
  const sim = G.sim, P = sim.s.player, N = sim.s.nations[P];
  const saved = N.queue.slice();
  const r = sim.orderUnits(P, type, qty, warOpts());
  N.queue = saved;
  return r;
}
function renderWar() {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], w = G.world;
  const T = UNITS[WAR.type], sea = T.domain === 'sea';
  const sites = sim.sitesFor(P, WAR.type);
  if (WAR.site !== 'auto' && WAR.site !== 'near' && !sites.some(r => String(r.i) === WAR.site)) WAR.site = 'auto';
  const pv = WAR.qty > 0 ? previewOrder(WAR.type, WAR.qty) : null;
  const groups = s.groups.filter(g => g.nation === P);
  const affordNow = Math.floor(N.money / T.cost), manNow = Math.floor(N.manpower / T.man);
  let h = `<div class="meet-head"><div><div class="kicker">${dateStr(s.t)} · Ministry of Defense</div><h2>War Department</h2><div class="small muted">Treasury ${money(N.money)} · Manpower ${fmt(N.manpower)}K · upkeep ${money(N.st.upkeep)}/day · income ${money(N.st.net)}/day net</div></div><button class="btn go" id="w-close">Done</button></div>
  <div class="war-grid"><div>
    <div class="sec-title">Unit type</div><div class="utypes">${Object.entries(UNITS).map(([k, U]) => {
      const ok = sim.sitesFor(P, k).length > 0;
      return `<div class="utype ${k === WAR.type ? 'sel' : ''} ${ok ? '' : 'off'}" data-ut="${k}" title="${ok ? '' : U.domain === 'sea' ? 'Needs a port' : 'Needs industry'}"><div class="ui">${ICON[U.sym]}</div><div class="un">${U.name}</div><div class="us">${money(U.cost)} · ${U.man}K · ${U.days}d</div></div>`;
    }).join('')}</div>
    <div class="sec-title" style="margin-top:14px">Quantity</div>
    <div class="qty"><button class="btn sm" data-q="-10">−10</button><button class="btn sm" data-q="-1">−1</button><input class="inp" id="w-qty" type="number" min="1" max="200" value="${WAR.qty}"><button class="btn sm" data-q="1">+1</button><button class="btn sm" data-q="10">+10</button>
      ${[5, 10, 25, 50].map(n => `<button class="btn sm ${WAR.qty === n ? 'on' : ''}" data-qs="${n}">${n}</button>`).join('')}
      <span class="small muted">Affordable now: ${Math.min(affordNow, manNow)}</span></div>
    <div class="sec-title" style="margin-top:14px">Production & deployment</div>
    <div class="actions">
      <select class="inp" id="w-site"><option value="auto" ${WAR.site === 'auto' ? 'selected' : ''}>Spread across all ${sea ? 'shipyards' : 'factories'} (fastest)</option><option value="near" ${WAR.site === 'near' ? 'selected' : ''}>Prefer sites near the selected region${G.region !== null && G.region !== undefined ? ` (${w.regions[G.region].name})` : ''}</option>${sites.sort((a, b) => w.regions[a.i].name.localeCompare(w.regions[b.i].name)).map(r => `<option value="${r.i}" ${WAR.site === String(r.i) ? 'selected' : ''}>Only at ${w.regions[r.i].name} (${sea ? 'port' : 'industry'} ${sea ? r.port : r.industry})</option>`).join('')}</select>
      <select class="inp" id="w-rally"><option value="" ${!WAR.rally ? 'selected' : ''}>Stay at the factory</option><option value="sel" ${WAR.rally === 'sel' ? 'selected' : ''}>Rally to selected region${G.region !== null && G.region !== undefined ? ` (${w.regions[G.region].name})` : ''}</option><option value="group" ${WAR.rally === 'group' ? 'selected' : ''}>Rally to the army group's position</option></select>
      <select class="inp" id="w-group"><option value="">No army group</option>${groups.map(g => `<option value="${g.id}" ${String(WAR.group) === String(g.id) ? 'selected' : ''}>Assign to ${esc(g.name)}</option>`).join('')}</select>
      <span></span>
    </div>
    <div class="sumbox" style="margin-top:12px">${pv && pv.ok ? `<div class="big2">${WAR.qty}× ${T.name}</div>
      <div class="grid2" style="margin-top:6px"><span>Total cost</span><span class="${pv.cost > N.money ? 'warn-text' : ''}">${money(pv.cost)}</span><span>Manpower</span><span class="${pv.man > N.manpower ? 'warn-text' : ''}">${fmt(pv.man)}K</span><span>All delivered in about</span><span>${pv.eta} days</span><span>Added upkeep</span><span>${money(T.upkeep * WAR.qty)}/day</span></div>
      <div class="small muted" style="margin:6px 0">${Object.entries(pv.per).map(([i, n]) => `${n} at ${w.regions[+i].name}`).join(' · ')}</div>
      ${pv.cost > N.money ? '<div class="small warn-text" style="margin-bottom:6px">Not enough money for the whole order now. Units are paid for as each production line starts work, so the rest will wait for funds.</div>' : ''}
      <button class="btn go" id="w-order" style="width:100%;padding:10px">Order ${WAR.qty} ${T.name}</button>` : `<div class="warn-text">${pv ? pv.why : 'Choose a quantity.'}</div>`}</div>
    <div class="sec-title" style="margin-top:14px">Formation packages</div>
    <div class="pkgs">${PACKAGES.map((p, k) => {
      const cost = Object.entries(p.mix).reduce((a, [t, n]) => a + UNITS[t].cost * n, 0);
      const ok = Object.keys(p.mix).every(t => sim.sitesFor(P, t).length);
      return `<button class="btn pkg" data-pkg="${k}" ${ok ? '' : 'disabled title="Missing industry or port"'}>${p.name} · ${money(cost)}<small>${Object.entries(p.mix).map(([t, n]) => `${n} ${UNITS[t].short}`).join(' + ')} · ${p.desc}</small></button>`;
    }).join('')}</div>
  </div><div>
    <div class="sec-title">Production lines</div>`;
  const allSites = sim.regionsOf(P).filter(r => r.industry > 0 || r.port > 0).sort((a, b) => (b.industry + b.port) - (a.industry + a.port));
  for (const r of allSites) for (const sea2 of [false, true]) {
    if (sea2 ? !r.port : !r.industry) continue;
    const qs = N.queue.filter(q => q.region === r.i && (UNITS[q.type].domain === 'sea') === sea2);
    const lines = sim.lines(r, sea2);
    const building = qs.filter(q => q.status === 'building').length, stalled = qs.filter(q => q.status === 'funds').length;
    h += `<div class="siterow"><span>${w.regions[r.i].name} <span class="muted small">${sea2 ? 'shipyard' : 'factory'}</span></span><span class="lineset">${Array.from({ length: lines }, (_, k) => `<i class="${k < building ? 'b' : k < building + stalled ? 'f' : ''}"></i>`).join('')}</span><span class="muted small">${qs.length ? `${qs.length} queued · ${Math.ceil(sim.siteBacklog(P, r, sea2))}d` : 'idle'}</span></div>`;
  }
  h += `<div class="small muted" style="margin-top:6px">Build Industry (land and air) or Ports (naval) for more production lines.</div>
    <div class="sec-title" style="margin-top:14px">Order book (${N.queue.length})</div>`;
  const shown = N.queue.slice(0, 60);
  h += shown.map((q, k) => `<div class="qitem"><span>${UNITS[q.type].name} <span class="muted small">· ${w.regions[q.region].name}${q.group ? ' · ' + esc((s.groups.find(g => g.id === q.group) || {}).name || '') : ''}</span></span><span class="st ${q.status || 'building'}">${q.status === 'funds' ? 'Awaiting funds' : q.status === 'queued' ? 'Queued' : Math.ceil(q.left / Math.max(0.05, sim.siteRate(P, s.regions[q.region], UNITS[q.type].domain === 'sea'))) + 'd'}</span><button class="btn sm danger" data-cq="${k}">✕</button></div>`).join('') || '<div class="muted small">No units on order.</div>';
  if (N.queue.length > 60) h += `<div class="small muted">…and ${N.queue.length - 60} more.</div>`;
  if (N.queue.length) h += `<button class="btn sm danger" id="w-clear" style="margin-top:8px">Cancel all queued (unpaid) orders</button>`;
  h += `</div></div>`;
  $('#war-card').innerHTML = h;
  const card = $('#war-card');
  $('#w-close').onclick = closeWar;
  for (const e of card.querySelectorAll('[data-ut]')) e.onclick = () => { if (e.classList.contains('off')) return; WAR.type = e.dataset.ut; renderWar(); };
  for (const e of card.querySelectorAll('[data-q]')) e.onclick = () => { WAR.qty = Math.max(1, Math.min(200, WAR.qty + +e.dataset.q)); renderWar(); };
  for (const e of card.querySelectorAll('[data-qs]')) e.onclick = () => { WAR.qty = +e.dataset.qs; renderWar(); };
  $('#w-qty').onchange = e => { WAR.qty = Math.max(1, Math.min(200, Math.round(+e.target.value || 1))); renderWar(); };
  $('#w-site').onchange = e => { WAR.site = e.target.value; renderWar(); };
  $('#w-rally').onchange = e => { WAR.rally = e.target.value || null; renderWar(); };
  $('#w-group').onchange = e => { WAR.group = e.target.value || null; renderWar(); };
  const ob = $('#w-order');
  if (ob) ob.onclick = () => {
    const r = sim.orderUnits(P, WAR.type, WAR.qty, warOpts());
    if (r.ok) toast('War Department', `${WAR.qty}× ${UNITS[WAR.type].name} ordered. All delivered in about ${r.eta} days.`, 'good'); else toast('War Department', r.why, 'warn');
    renderWar();
  };
  for (const e of card.querySelectorAll('[data-pkg]')) e.onclick = () => {
    const p = PACKAGES[+e.dataset.pkg]; let eta = 0;
    for (const [t, n] of Object.entries(p.mix)) { const r = sim.orderUnits(P, t, n, warOpts()); if (r.ok) eta = Math.max(eta, r.eta); }
    toast('War Department', `${p.name} ordered. Full strength in about ${eta} days.`, 'good');
    renderWar();
  };
  for (const e of card.querySelectorAll('[data-cq]')) e.onclick = () => { sim.cancelOrder(P, shown[+e.dataset.cq]); renderWar(); };
  const cl = $('#w-clear'); if (cl) cl.onclick = () => { for (const q of [...N.queue]) if (q.paid === false) sim.cancelOrder(P, q); renderWar(); };
}

// ======================================================================= cabinet meetings
function cabinetReady() { const N = G.sim?.s.nations[G.sim.s.player]; return !!N && (N.lastCabinet === undefined || G.sim.s.t - N.lastCabinet >= MEETING_COOLDOWN_DAYS * 24); }
function openCabinet() {
  if (!G.sim) return;
  const sim = G.sim, N = sim.s.nations[sim.s.player];
  const r = convene(sim, G.ai, N);
  if (!r.ok) { toast('Cabinet', r.why, 'warn'); return; }
  G.meeting = { agenda: r.agenda, t: sim.s.t };
  G.meetResume = G.speed; setSpeed(0);
  renderMeeting();
  $('#cabinetbox').classList.remove('hidden');
}
function closeCabinet() {
  $('#cabinetbox').classList.add('hidden');
  const a = G.meeting?.agenda || [];
  const ok = a.filter(p => p.status === 'approved' && p.kind !== 'info').length, no = a.filter(p => p.status === 'denied').length;
  if (a.length) G.sim.emit('gov', `Cabinet meeting adjourned: ${ok} proposal(s) approved, ${no} denied.`, [G.sim.s.player]);
  G.meeting = null;
  if (G.meetResume) setSpeed(G.meetResume);
  renderPanel(true); refreshWorld(false); computeStacks();
}
function decide(p, yes) {
  const sim = G.sim, N = sim.s.nations[sim.s.player];
  if (!p || p.status !== 'pending') return;
  if (yes) { const r = execute(sim, G.ai, N, p); p.status = r.ok ? 'approved' : 'failed'; p.result = r.msg; }
  else { deny(sim, N, p); p.status = 'denied'; p.result = 'Denied.'; }
}
function renderMeeting() {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P];
  const a = G.meeting.agenda;
  const pend = a.filter(p => p.status === 'pending' && p.kind !== 'info').length;
  let h = `<div class="meet-head"><div><div class="kicker">${dateStr(G.meeting.t)} · Cabinet room</div><h2>Cabinet meeting</h2><div class="small muted">Each minister presents proposals from their own analysis, and the advice is only as good as the minister. Treasury ${money(N.money)} · political capital ${Math.floor(N.gov.pc)}.</div></div>
    <div style="display:flex;gap:8px"><button class="btn" id="m-all" ${pend ? '' : 'disabled'}>Approve all (${pend})</button><button class="btn go" id="m-close">Adjourn</button></div></div><div class="meet-grid">`;
  for (const role of CABINET) {
    const ch = s.chars[N.gov.cabinet[role]]; if (!ch) continue;
    const props = a.filter(p => p.role === role);
    const conf = confidence(ch);
    h += `<div class="minister"><div class="mh">${avatar(ch, NATION[P].color)}<div><div class="mn">${esc(ch.name)}</div><div class="mr">${ROLES[role].name} · <span class="stars">${stars(ch.skill)}</span> ${traitChips(ch)}</div></div><span class="conf ${conf.split(' ')[0]}">${conf}</span></div>`;
    if (!props.length) h += `<div class="none">“Nothing in my portfolio requires your attention.”</div>`;
    for (const p of props) {
      const cost = [p.cost ? money(p.cost) : '', p.pc ? `${p.pc} political capital` : ''].filter(Boolean).join(' · ');
      h += `<div class="prop ${p.status}"><div class="pt">${p.kind === 'info' ? 'Briefing: ' : ''}${esc(p.title)}</div><div class="pw">${esc(p.why)}</div>${cost ? `<div class="pc">Cost: ${cost}</div>` : ''}`;
      if (p.status === 'pending') h += p.kind === 'info' ? `<div class="pa"><button class="btn sm" data-ack="${p.id}">Acknowledge</button></div>` : `<div class="pa"><button class="btn sm go" data-yes="${p.id}">Approve</button><button class="btn sm danger" data-no="${p.id}">Deny</button></div>`;
      else h += `<div class="res ${p.status === 'approved' ? 'pos' : p.status === 'failed' ? 'neg' : 'muted'}">${p.status === 'approved' ? '✓ ' : p.status === 'failed' ? '✕ ' : ''}${esc(p.result || '')}</div>`;
      h += '</div>';
    }
    h += '</div>';
  }
  h += '</div>';
  $('#meet-card').innerHTML = h;
  const find = id => a.find(p => p.id === +id);
  for (const b of document.querySelectorAll('#meet-card [data-yes]')) b.onclick = () => { decide(find(b.dataset.yes), true); renderMeeting(); };
  for (const b of document.querySelectorAll('#meet-card [data-no]')) b.onclick = () => { decide(find(b.dataset.no), false); renderMeeting(); };
  for (const b of document.querySelectorAll('#meet-card [data-ack]')) b.onclick = () => { const p = find(b.dataset.ack); p.status = 'approved'; p.result = 'Acknowledged.'; renderMeeting(); };
  $('#m-all').onclick = () => { for (const p of a) if (p.status === 'pending' && p.kind !== 'info') decide(p, true); renderMeeting(); };
  $('#m-close').onclick = closeCabinet;
}

// ======================================================================= top bar & standing
function renderTop() {
  const sim = G.sim, s = sim.s, N = s.nations[s.player], st = N.st;
  const d = new Date(START_DATE + (s.t + G.acc) * 3600e3);
  $('#tb-date').textContent = dateStr(s.t);
  $('#tb-time').textContent = `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
  $('#brand-sub').textContent = GOV_TYPES[N.gov.type].name;
  const days = (v, c) => c > 0 ? ` · ${Math.round(v / c)}d` : '';
  const items = [
    ['Treasury', money(N.money), st.net, money(st.net) + '/d'],
    ['Food' + days(N.food, st.foodCons), fmt(N.food), st.foodNet, sgn(st.foodNet)],
    ['Energy' + days(N.energy, st.eCons), fmt(N.energy), st.energyNet, sgn(st.energyNet)],
    ['Research', fmt(st.rp) + '/d', null, ''],
    ['Stability', pct(N.gov.stability), N.gov.stability - 0.35, ''],
    ['Approval', pct(N.gov.approval), N.gov.approval - 0.35, ''],
    ['Pol. capital', Math.floor(N.gov.pc), null, ''],
  ];
  if (N.warheads) items.push(['Warheads', N.warheads, null, '']);
  $('#res').innerHTML = items.map(([k, v, delta, dtxt]) => `<div class="r"><div class="k">${k}</div><div class="v ${delta !== null && delta < 0 && !dtxt ? 'neg' : ''}">${v}${dtxt ? `<span class="d ${delta >= 0 ? 'pos' : 'neg'}">${dtxt}</span>` : ''}</div></div>`).join('');
  $('#paused').classList.toggle('hidden', G.speed !== 0);
  $('#btn-cabinet').disabled = !cabinetReady();
}

function renderStanding() {
  const sim = G.sim, s = sim.s;
  const share = sim.worldShare(s.player);
  $('#st-goal').textContent = `Goal ${Math.round(Math.min(1, s.winShare) * 100)}%`;
  const ranks = Object.values(s.nations).filter(n => n.alive).map(n => ({ c: n.code, v: sim.worldShare(n.code) })).sort((a, b) => b.v - a.v);
  const myRank = ranks.findIndex(r => r.c === s.player) + 1;
  const wars = Object.values(s.rel).filter(v => v === 'war').length;
  $('#standing-body').innerHTML = `<div class="muted">Your share of world income · #${myRank}</div>
    <div class="goal-bar"><i style="width:${Math.min(100, share / Math.min(1, s.winShare) * 100)}%"></i></div>` +
    ranks.slice(0, 7).map(r => `<div class="rank ${r.c === s.player ? 'me' : ''}" data-c="${r.c}"><span class="dot" style="background:${NATION[r.c].color}"></span><span>${NATION[r.c].name}</span><span class="n">${(r.v * 100).toFixed(1)}%</span></div>`).join('') +
    (myRank > 7 ? `<div class="rank me"><span class="dot" style="background:${NATION[s.player].color}"></span><span>${NATION[s.player].name}</span><span class="n">${(share * 100).toFixed(2)}%</span></div>` : '') +
    `<div class="muted" style="margin-top:6px">${ranks.length} nations · ${wars} wars${s.nukesUsed ? ` · <span style="color:#ff8a65">${s.nukesUsed} nuclear detonations</span>` : ''}</div>`;
  for (const e of document.querySelectorAll('.rank[data-c]')) e.onclick = () => openDossier(e.dataset.c);
}

function renderSelbar() {
  const units = selectedUnits(); const bar = $('#selbar');
  if (!units.length) { bar.classList.add('hidden'); return; }
  const cnt = {}; for (const u of units) cnt[u.type] = (cnt[u.type] || 0) + 1;
  bar.innerHTML = `<span class="hi"><b>${units.length}</b> selected</span><span>${Object.entries(cnt).map(([t, n]) => `${n} ${UNITS[t].short}`).join(' · ')}</span><span class="hint">Right-click to move · aircraft strike enemy land · Shift-drag to box-select · Esc clears</span>`;
  bar.classList.remove('hidden');
}

// ======================================================================= panel tabs
const TABS = ['region', 'forces', 'command', 'gov', 'research', 'economy', 'diplomacy', 'intel'];
function switchTab(t) {
  G.tab = t;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === t);
  for (const k of TABS) $('#tab-' + k).classList.toggle('hidden', k !== t);
  renderPanel(true);
}
function renderPanel(force) {
  if (!G.sim) return;
  const host = $('#tab-' + G.tab);
  if (force) host._html = null;
  if (!force) {
    if (G.pointerDown) return;
    const a = document.activeElement;
    if (host.contains(a) && ['INPUT', 'SELECT'].includes(a.tagName)) return;
  }
  const scroll = host.scrollTop;
  ({ region: renderRegion, forces: renderForces, command: renderCommand, gov: renderGov, research: renderResearch, economy: renderEconomy, diplomacy: renderDiplomacy, intel: renderIntel })[G.tab](host);
  for (const b of host.querySelectorAll('[data-convene]')) b.onclick = openCabinet;
  for (const b of host.querySelectorAll('[data-openwar]')) b.onclick = () => openWar(+b.dataset.openwar >= 0 && b.dataset.region ? +b.dataset.region : undefined);
  host.scrollTop = scroll;
  renderUnread();
}
function renderUnread() {
  const n = G.sim.s.messages.filter(m => m.to === G.sim.s.player && m.unread).length;
  $('#unread').textContent = n; $('#unread').classList.toggle('hidden', !n);
}
function setHTML(host, h) { if (host._html === h) return false; host._html = h; host.innerHTML = h; return true; }
const pips = (l, max) => `<span class="pips">${Array.from({ length: max }, (_, k) => `<i class="${k < l ? 'f' : ''}"></i>`).join('')}</span>`;
const stars = n => '★'.repeat(Math.round(n / 2)) + '<span style="opacity:.25">' + '★'.repeat(5 - Math.round(n / 2)) + '</span>';
const avatar = (c, color) => `<div class="avatar" style="background:linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))">${esc(initials(c.name))}</div>`;
const traitChips = c => c.traits.map(t => `<span class="trait ${['Corrupt', 'Ambitious'].includes(t) ? 'bad' : ''}" title="${esc(TRAITS[t]?.desc || '')}">${t}</span>`).join('');

// ---------------------------------------------------------------- region
function renderRegion(host) {
  const sim = G.sim, s = sim.s, i = G.region, P = s.player, N = s.nations[P];
  if (i === null || i === undefined) { setHTML(host, '<p class="muted">Select a region on the globe.</p>'); return; }
  const R = G.world.regions[i], r = s.regions[i];
  let h = '';
  const here = s.units.filter(u => u.loc === i && !airborne(u));
  const groups = {}; for (const u of here) (groups[u.nation] ||= []).push(u);
  if (R.sea) {
    h += `<div class="card"><div class="big">${R.name}</div><div class="sub">Open water</div></div>`;
    const lanes = s.trades.filter(t => t.path.includes(i));
    h += `<div class="sec"><div class="sec-title">Shipping lanes</div>${lanes.length ? lanes.map(t => `<div class="row"><span>${NATION[t.from].name} &rarr; ${NATION[t.to].name}</span><span class="${t.blockaded ? 'neg' : 'muted'}">${fmt(t.amount)} ${t.good}${t.blockaded ? ' · blockaded' : ''}</span></div>`).join('') : '<div class="muted small">No trade passes through these waters.</div>'}</div>`;
  } else {
    const O = NATION[r.owner]; const mine = r.owner === P;
    h += `<div class="card"><div class="big">${R.name}</div><div class="sub"><span class="flagchip" style="background:${O.color}"></span>${O.name}${r.core !== r.owner ? ` · <span class="warn-text">occupied (${NATION[r.core].name})</span>` : ''}${s.nations[r.owner].capital === i ? ' · capital' : ''} · ${R.coastal ? 'coastal' : 'inland'}</div></div>`;
    if (r.capture) h += `<div class="card" style="border-color:rgba(255,93,93,.5)"><div class="warn-text">Under siege by ${NATION[r.capture.by].name}</div><div class="prog"><i style="width:${pct(r.capture.p)};background:var(--red)"></i></div></div>`;
    const siege = siegeStatus(i); if (siege) h += `<div class="sec"><div class="sec-title">Siege status</div>${siege}</div>`;
    if (!mine && sim.atWar(P, r.owner) && (N.warheads || 0) > 0) {
      const chk = sim.nukeCheck(P, i);
      h += `<div class="card" style="border-color:rgba(255,107,61,.5)"><div class="sec-title" style="color:#ff9a70">Strategic options</div><div class="small muted" style="margin-bottom:8px">${N.warheads} warhead(s) available. A nuclear strike devastates the region, kills millions, and will be answered by the world.</div><button class="btn nuke" data-nuke="1" ${chk.ok ? '' : 'disabled'}>Authorize nuclear strike</button>${chk.ok ? '' : `<div class="small muted" style="margin-top:6px">${esc(chk.why)}</div>`}</div>`;
    }
    h += `<div class="sec"><div class="sec-title">Profile</div><div class="grid2">
      <span>Population</span><span>${fmt(r.pop)}M</span>
      <span>Food output / demand</span><span>${fmt(r.farm * ECON.farmYield * (0.35 + r.fert))} / ${fmt(r.pop)}</span>
      <span>Energy output</span><span>${fmt(r.power * ECON.powerYield + r.oil * ECON.oilYield)}/d</span>
      <span>Soil fertility</span><span>${pct(r.fert)}</span>
      <span>Oil reserves</span><span>${r.hasOil ? 'Yes' : 'None'}</span>
      <span>Unrest</span><span class="${r.unrest > 0.3 ? 'neg' : ''}">${pct(r.unrest)}</span>
      <span>War damage</span><span class="${r.damage > 0.2 ? 'neg' : ''}">${pct(r.damage)}</span>
      <span>City lights</span><span>${pct(r.light)}</span>
      <span>Garrison</span><span>${sim.garrison(r).toFixed(1)}</span>
    </div></div>`;
    h += `<div class="sec"><div class="sec-title">Infrastructure</div>`;
    for (const k of BUILD_ORDER) {
      const B = BUILDINGS[k]; const lvl = r[k] || 0;
      if (k === 'oil' && !r.hasOil) continue;
      if (k === 'port' && !R.coastal) continue;
      if (B.tech && !lvl && !(mine && has(N, B.tech))) continue;
      const building = r.build?.type === k;
      let btn = '';
      const max = B.max + (k === 'farm' ? N.mods?.farmMax || 0 : 0);
      if (mine && !building) {
        const chk = sim.canBuild(P, i, k);
        btn = lvl >= max ? '<span class="muted small">Max</span>' : `<button class="btn sm" data-build="${k}" ${chk.ok ? '' : `disabled title="${esc(chk.why)}"`}>${money(Math.round(B.cost(lvl + 1) * (1 + (N.mods?.buildCost || 0))))} · ${B.days(lvl + 1)}d</button>`;
      }
      h += `<div class="bld"><div><div class="nm">${B.name}</div><div class="ds">${B.desc}</div>${building ? `<div class="prog"><i style="width:${Math.round((1 - r.build.left / r.build.total) * 100)}%"></i></div><div class="ds">Building level ${r.build.level}: ${Math.ceil(r.build.left)} days left</div>` : ''}</div>${pips(lvl, max)}<div>${btn}</div></div>`;
    }
    h += '</div>';
    if (mine) {
      h += `<div class="sec"><div class="sec-title">Military production</div>`;
      if (!r.industry && !r.port) h += `<div class="muted small">Requires industry (land and air units) or a port (warships).</div>`;
      else {
        h += '<div class="ubtns">';
        for (const t of [...LAND_TYPES, ...AIR_TYPES, ...SEA_TYPES]) {
          const T = UNITS[t];
          if ((T.domain === 'sea' && !r.port) || (T.domain !== 'sea' && !r.industry)) continue;
          const chk = sim.canRecruit(P, i, t);
          h += `<button class="btn ubtn" data-unit="${t}" ${chk.ok ? '' : `disabled title="${esc(chk.why)}"`}><span>${T.name}</span><small>${money(T.cost)} · ${T.man}K · ${T.days}d</small></button>`;
        }
        h += '</div>';
        const q = N.queue.filter(x => x.region === i);
        if (q.length) h += q.map(x => `<div class="row"><span>${UNITS[x.type].name}</span><span class="muted">${Math.ceil(x.left)}d</span></div><div class="prog"><i style="width:${Math.round((1 - x.left / x.total) * 100)}%"></i></div>`).join('');
      }
      if (r.industry || r.port) h += `<button class="btn" style="margin-top:8px;width:100%" data-openwar="1" data-region="${i}">Bulk order at ${R.name}…</button>`;
      h += '</div>';
    } else h += `<div class="sec"><button class="btn" data-dossier="${r.owner}">Open ${O.name} dossier</button></div>`;
  }
  if (Object.keys(groups).length) {
    h += `<div class="sec"><div class="sec-title">Forces present</div>`;
    for (const [c, us] of Object.entries(groups)) {
      const cnt = {}; for (const u of us) cnt[u.type] = (cnt[u.type] || 0) + 1;
      h += `<div class="row ${c === P ? 'click' : ''}" ${c === P ? 'data-selhere="1"' : ''}><span><span class="flagchip" style="background:${NATION[c].color}"></span>${NATION[c].name}</span><span class="muted">${Object.entries(cnt).map(([t, n]) => `${n} ${UNITS[t].short}`).join(' ')}</span></div>`;
    }
    h += '</div>';
  }
  if (!setHTML(host, h)) return;
  for (const b of host.querySelectorAll('[data-build]')) b.onclick = () => { const r2 = sim.build(P, i, b.dataset.build); if (!r2.ok) toast('Engineering', r2.why, 'warn'); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-unit]')) b.onclick = () => { const r2 = sim.recruit(P, i, b.dataset.unit); if (!r2.ok) toast('Production', r2.why, 'warn'); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-dossier]')) b.onclick = () => openDossier(b.dataset.dossier);
  for (const b of host.querySelectorAll('[data-selhere]')) b.onclick = () => { G.sel.clear(); for (const u of here) if (u.nation === P) G.sel.add(u.id); computeStacks(); renderSelbar(); updateRings(); switchTab('forces'); };
  const nb = host.querySelector('[data-nuke]');
  if (nb) nb.onclick = () => {
    if (!confirm(`Authorize a nuclear strike on ${R.name}? Millions will die. The world will respond.`)) return;
    if (!confirm('Final confirmation: launch?')) return;
    const res = sim.nuke(P, i); if (!res.ok) toast('Strategic command', res.why, 'warn');
    renderPanel(true);
  };
}

function siegeStatus(i) {
  const sim = G.sim, s = sim.s, P = s.player, r = s.regions[i];
  if (r.owner === P) return '';
  const land = u => u.nation === P && UNITS[u.type].domain === 'land';
  const here = s.units.filter(u => land(u) && u.loc === i && !u.move);
  const coming = s.units.filter(u => land(u) && u.move && u.move.path.at(-1) === i);
  if (!here.length && !coming.length) return '';
  const lines = [];
  if (coming.length) lines.push(`<div class="row"><span>${coming.length} unit(s) en route</span><span class="muted">arrive in ${Math.min(...coming.map(u => parseInt(eta(u))))}d+</span></div>`);
  if (!here.length) return lines.join('');
  const power = here.reduce((a, u) => a + u.hp / u.mhp, 0);
  const gar = sim.garrison(r);
  const defenders = s.units.filter(u => u.loc === i && UNITS[u.type].domain === 'land' && !u.move && (u.nation === r.owner || sim.friendly(u.nation, r.owner)) && u.nation !== P);
  let why;
  if (!sim.atWar(P, r.owner)) why = `<span class="neg">Not at war with ${NATION[r.owner].name}.</span> Declare war in Diplomacy to besiege.`;
  else if (defenders.length) why = `<span class="neg">${defenders.length} enemy unit(s) still defending.</span> The siege begins once they are destroyed.`;
  else if (power <= gar) why = `<span class="neg">Force strength ${power.toFixed(1)} is below the local garrison (${gar.toFixed(1)}).</span> Bring more troops.`;
  else { const rate = Math.min(4, power - gar) / (110 * (1 + r.fort * 0.5)) * 24; const left = r.capture && r.capture.by === P ? 1 - r.capture.p : 1; why = `<span class="pos">Siege in progress.</span> About ${Math.ceil(left / rate)} day(s) to capture.`; }
  lines.push(`<div class="row"><span>${here.length} unit(s) in region</span><span class="muted">strength ${power.toFixed(1)}</span></div><div class="small" style="margin-top:4px">${why}</div>`);
  return lines.join('');
}

// ---------------------------------------------------------------- forces
function renderForces(host) {
  const sim = G.sim, s = sim.s, w = G.world, P = s.player;
  const units = selectedUnits();
  const myGroups = s.groups.filter(g => g.nation === P);
  let h = '';
  if (units.length) {
    const avgXp = units.reduce((a, u) => a + (u.xp || 0), 0) / units.length;
    h += `<div class="card"><div class="big">${units.length} units selected</div><div class="sub">Average experience ${Math.round(avgXp)}/100. Right-click a region to move. Aircraft fly strike missions against enemy land.</div>
      <div class="actions" style="margin-top:10px">
        <button class="btn" data-act="train">Begin training</button>
        <button class="btn" data-act="stop">Halt</button>
        <button class="btn" data-act="group">Form army group</button>
        ${myGroups.length ? `<select class="inp" id="assign"><option value="">Assign to group...</option>${myGroups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>` : '<span></span>'}
        <button class="btn danger" data-act="disband">Disband</button>
        <button class="btn" data-act="clear">Clear selection</button>
      </div></div>`;
    const types = [...new Set(units.map(u => u.type))];
    h += `<div class="sec"><div class="filters">${types.map(t => `<span class="chip" data-only="${t}">Only ${UNITS[t].name}</span>`).join('')}</div>`;
    for (const u of units.slice(0, 60)) {
      const T = UNITS[u.type];
      const st = airborne(u) ? `airborne (${u.air.phase})` : u.move ? `moving to ${w.regions[u.move.path.at(-1)].name} (${eta(u)})` : u.mission?.strike !== undefined ? `strike orders: ${w.regions[u.mission.strike].name}` : u.train ? 'training' : w.regions[u.loc].sea && T.domain === 'land' ? 'embarked' : 'holding';
      const g = u.group && s.groups.find(x => x.id === u.group);
      h += `<div class="row"><span><span class="hi">${T.name}</span> <span class="muted small">#${u.id} · ${w.regions[u.loc].name}${g ? ' · ' + esc(g.name) : ''}</span><br><span class="small ${u.fighting ? 'neg' : 'muted'}">${u.fighting ? 'Engaged · ' : ''}${st} · XP ${Math.round(u.xp || 0)}</span></span><span class="hpbar"><i style="width:${Math.round(u.hp / u.mhp * 100)}%;background:${u.hp / u.mhp < 0.35 ? 'var(--red)' : 'var(--green)'}"></i></span></div>`;
    }
    h += '</div>';
  }
  const mine = sim.unitsOf(P);
  h += `<div class="sec"><button class="btn go" style="width:100%" data-openwar="1">Open War Department: recruit units in bulk (R)</button></div>`;
  h += `<div class="sec"><div class="sec-title">Order of battle</div><div class="grid2">
    <span>Land units</span><span>${mine.filter(u => UNITS[u.type].domain === 'land').length}</span>
    <span>Air wings</span><span>${mine.filter(u => UNITS[u.type].domain === 'air').length}</span>
    <span>Warships</span><span>${mine.filter(u => UNITS[u.type].domain === 'sea').length}</span>
    <span>Sealift (used / capacity)</span><span>${sim.embarked(P)} / ${sim.sealift(P)}</span>
    <span>Military upkeep</span><span>${money(s.nations[P].st.upkeep)}/d</span>
  </div></div>`;
  const byLoc = new Map();
  for (const u of mine) { const k = u.move ? 'moving' : airborne(u) ? 'air' : String(u.loc); if (!byLoc.has(k)) byLoc.set(k, []); byLoc.get(k).push(u); }
  h += `<div class="sec"><div class="sec-title">Deployments</div><div class="small muted" style="margin-bottom:4px">Click to select. Shift-drag on the globe to box-select.</div>`;
  for (const [k, us] of [...byLoc].sort((a, b) => b[1].length - a[1].length)) {
    const cnt = {}; for (const u of us) cnt[u.type] = (cnt[u.type] || 0) + 1;
    h += `<div class="row click" data-loc="${k}"><span class="hi">${k === 'moving' ? 'In transit' : k === 'air' ? 'Airborne' : w.regions[+k].name}</span><span class="muted small">${Object.entries(cnt).map(([t, n]) => `${n} ${UNITS[t].short}`).join(' ')}</span></div>`;
  }
  h += '</div>';
  h += `<div class="sec"><div class="sec-title">Unit reference</div><table class="ut"><tr><th>Type</th><th>Cost</th><th>Atk</th><th>Def</th><th>HP</th><th>Range</th><th>Speed</th></tr>${Object.values(UNITS).map(T => `<tr><td>${T.name}</td><td>${T.cost}</td><td>${T.atk}</td><td>${T.def}</td><td>${T.hp}</td><td>${T.domain === 'air' ? T.radius : T.range} km</td><td>${T.speed}${T.domain === 'air' ? '/h' : '/d'}</td></tr>`).join('')}</table></div>`;
  if (!setHTML(host, h)) return;
  for (const c of host.querySelectorAll('[data-only]')) c.onclick = () => { for (const u of units) if (u.type !== c.dataset.only) G.sel.delete(u.id); computeStacks(); renderSelbar(); updateRings(); renderPanel(true); };
  const act = a => host.querySelector(`[data-act="${a}"]`);
  act('train')?.addEventListener('click', () => { for (const u of units) { if (s.regions[u.loc].owner === P && !s.regions[u.loc].sea) { u.train = true; u.move = null; } } toast('Training', 'Units in friendly territory begin drills ($0.3M per unit per day).', 'good'); renderPanel(true); });
  act('stop')?.addEventListener('click', () => { for (const u of units) { u.move = null; u.mission = null; u.train = false; } computeStacks(); updateRings(); renderPanel(true); });
  act('group')?.addEventListener('click', () => {
    const name = prompt('Name the new army group:', `${ordinal(myGroups.length + 1)} Army Group`); if (!name) return;
    const free = s.nations[P].generals.find(id => !s.groups.some(g => g.general === id)) || null;
    const g = { id: s.gid++, nation: P, name, general: free, units: units.map(u => u.id), order: { type: 'hold' }, status: 'Awaiting orders.' };
    for (const u of units) { for (const og of s.groups) og.units = og.units.filter(id => id !== u.id); u.group = g.id; }
    s.groups.push(g); switchTab('command');
  });
  const asg = host.querySelector('#assign');
  if (asg) asg.onchange = () => { const g = s.groups.find(x => x.id === +asg.value); if (!g) return; for (const u of units) { for (const og of s.groups) og.units = og.units.filter(id => id !== u.id); g.units.push(u.id); u.group = g.id; } toast('Command', `${units.length} units assigned to ${g.name}.`, 'good'); renderPanel(true); };
  act('disband')?.addEventListener('click', () => { if (!confirm(`Disband ${units.length} units?`)) return; for (const u of units) sim.removeUnit(u); G.sel.clear(); computeStacks(); renderSelbar(); renderPanel(true); });
  act('clear')?.addEventListener('click', () => { G.sel.clear(); computeStacks(); renderSelbar(); updateRings(); renderPanel(true); });
  for (const r of host.querySelectorAll('[data-loc]')) r.onclick = () => {
    const k = r.dataset.loc; G.sel.clear();
    for (const u of mine) if ((k === 'moving' && u.move) || (k === 'air' && airborne(u)) || (!u.move && !airborne(u) && String(u.loc) === k)) G.sel.add(u.id);
    if (!isNaN(+k)) { const R = w.regions[+k]; G.globe.flyTo(R.lat, R.lon); }
    computeStacks(); renderSelbar(); updateRings(); renderPanel(true);
  };
}
const ordinal = n => { const sfx = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]); };
function eta(u) {
  const m = u.move, w = G.world; let km = w.edgeKm(m.path[m.seg], m.path[m.seg + 1]) - m.prog;
  for (let k = m.seg + 1; k < m.path.length - 1; k++) km += w.edgeKm(m.path[k], m.path[k + 1]);
  return Math.ceil(km / UNITS[u.type].speed) + 'd';
}

// ---------------------------------------------------------------- command: delegation & army groups
const DIRECTIVES = {
  industry: { role: 'industry', label: 'Infrastructure', opts: { off: 'Personal control', balanced: 'Balanced development', industry: 'Industrial expansion', urban: 'Urbanization', food: 'Food security', energy: 'Energy independence', research: 'Research infrastructure', fortify: 'Fortify the borders' } },
  defense: { role: 'defense', label: 'Military procurement', opts: { off: 'Personal control', maintain: 'Maintain readiness', army: 'Build up the army', navy: 'Build up the navy', air: 'Build up the air force', total: 'Total war production' } },
  science: { role: 'science', label: 'Research agenda', opts: { off: 'Personal control', balanced: 'Balanced science', military: 'Military technology', economy: 'Economic technology', ai: 'Artificial intelligence', nuclear: 'Nuclear program' } },
  foreign: { role: 'foreign', label: 'Foreign affairs', opts: { off: 'Personal control', trade: 'Secure supply lines', relations: 'Improve relations', alliances: 'Build alliances' } },
};
function renderCommand(host) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], w = G.world;
  let h = `<div class="card"><div class="big">Chain of command</div><div class="sub">Give your cabinet standing directives and they will act on their own, within the budget you allow. Set any area to personal control to handle it yourself, or convene the cabinet and rule on their recommendations one by one.</div><div style="margin-top:10px"><button class="btn go" data-convene="1" ${cabinetReady() ? '' : 'disabled'}>${cabinetReady() ? 'Convene cabinet meeting' : 'Cabinet met recently'}</button></div></div>`;
  h += `<div class="sec"><div class="sec-title">Cabinet directives</div>`;
  for (const [k, D] of Object.entries(DIRECTIVES)) {
    const c = s.chars[N.gov.cabinet[D.role]];
    h += `<div class="person">${c ? avatar(c, NATION[P].color) : '<div></div>'}<div><div class="pn">${D.label}</div><div class="pr">${c ? `${esc(c.name)} · <span class="stars">${stars(c.skill)}</span>` : 'Vacant'}</div></div><select class="inp" data-dir="${k}" style="width:180px">${Object.entries(D.opts).map(([v, l]) => `<option value="${v}" ${N.directives[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  }
  h += `<div style="margin-top:10px"><div class="row"><span>Ministers may spend up to</span><span class="hi">${pct(N.directives.budget)} of the treasury</span></div><input type="range" min="0.1" max="0.9" step="0.05" value="${N.directives.budget}" id="budget"></div>
    <div class="row"><span>Cabinet resolves crises without consulting you</span><input type="checkbox" id="delev" ${N.delegateEvents ? 'checked' : ''}></div>
    <div class="row"><span>Pause the game for cabinet briefings</span><input type="checkbox" id="pauseev" ${G.pauseOnEvents ? 'checked' : ''}></div></div>`;
  const log = (N.delegLog || []).slice(-8).reverse();
  if (log.length) h += `<div class="sec"><div class="sec-title">Recent ministry actions</div>${log.map(l => `<div class="log-item build"><span class="lt">${dateStr(l.t)}</span>${esc(l.text)}</div>`).join('')}</div>`;
  const groups = s.groups.filter(g => g.nation === P);
  const gens = N.generals.map(id => s.chars[id]).filter(Boolean);
  const enemies = sim.warsOf(P);
  const others = Object.values(s.nations).filter(n => n.alive && n.code !== P).map(n => n.code).sort((a, b) => NATION[a].name.localeCompare(NATION[b].name));
  h += `<div class="sec"><div class="sec-title">Army groups</div>`;
  if (!groups.length) h += `<div class="muted small">Select units, then choose <b>Form army group</b> in the Forces tab. A general will command them for you.</div>`;
  for (const g of groups) {
    const us = g.units.map(id => sim.unitById.get(id)).filter(Boolean);
    const cnt = {}; for (const u of us) cnt[u.type] = (cnt[u.type] || 0) + 1;
    const gen = s.chars[g.general];
    const o = g.order || { type: 'hold' };
    h += `<div class="group"><div class="gh"><span class="gn">${esc(g.name)}</span><span class="muted small">${us.length} units</span></div>
      <div class="small muted">${Object.entries(cnt).map(([t, n]) => `${n} ${UNITS[t].short}`).join(' · ') || 'empty'}</div>
      <div class="actions" style="margin-top:8px">
        <select class="inp" data-gen="${g.id}"><option value="">No commander</option>${gens.map(c => `<option value="${c.id}" ${c.id === g.general ? 'selected' : ''} ${s.groups.some(x => x.general === c.id && x.id !== g.id) ? 'disabled' : ''}>${esc(c.name)} (${c.skill})</option>`).join('')}</select>
        <select class="inp" data-ord="${g.id}">${[['hold', 'Hold positions'], ['train', 'Train'], ['defend', 'Defend selected region'], ['attack', 'Attack nation...']].map(([v, l]) => `<option value="${v}" ${o.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${o.type === 'attack' ? `<select class="inp" data-tgt="${g.id}">${[...enemies, ...others.filter(x => !enemies.includes(x))].map(c => `<option value="${c}" ${o.target === c ? 'selected' : ''}>${sim.atWar(P, c) ? '⚔ ' : ''}${NATION[c].name}</option>`).join('')}</select>` : ''}
        ${o.type === 'defend' ? `<span class="small hi" style="align-self:center">${w.regions[o.region]?.name || '?'}</span>` : ''}
      </div>
      ${gen ? `<div class="small" style="margin-top:6px">${esc(gen.name)} · <span class="stars">${stars(gen.skill)}</span> ${traitChips(gen)}</div>` : ''}
      <div class="small" style="margin-top:6px;color:var(--teal)">${esc(g.status || 'Awaiting orders.')}</div>
      <div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm" data-gsel="${g.id}">Select units</button><button class="btn sm" data-gadd="${g.id}" ${G.sel.size ? '' : 'disabled'}>Add selected</button><button class="btn sm danger" data-gdis="${g.id}">Dissolve</button></div></div>`;
  }
  h += '</div>';
  h += `<div class="sec"><div class="sec-title">General staff</div>${gens.map(c => `<div class="person">${avatar(c, '#8fa7c4')}<div><div class="pn">${esc(c.name)}</div><div class="pr"><span class="stars">${stars(c.skill)}</span> · age ${c.age} · loyalty ${pct(c.loyalty)}<br>${traitChips(c)}</div></div><span class="small muted">${esc((s.groups.find(g => g.general === c.id) || {}).name || 'Unassigned')}</span></div>`).join('')}`;
  const cands = (N.gov.candidates.general || []).map(id => s.chars[id]).filter(Boolean);
  if (cands.length) h += `<div class="small muted" style="margin:8px 0 4px">Officers available for promotion:</div>` + cands.map(c => `<div class="person">${avatar(c, '#5c6f88')}<div><div class="pn">${esc(c.name)}</div><div class="pr"><span class="stars">${stars(c.skill)}</span><br>${traitChips(c)}</div></div><button class="btn sm" data-hire="${c.id}" data-role="general" ${N.gov.pc >= hireCost(c) ? '' : 'disabled'}>Promote · ${hireCost(c)} PC</button></div>`).join('');
  h += '</div>';
  if (!setHTML(host, h)) return;
  for (const sel of host.querySelectorAll('[data-dir]')) sel.onchange = () => { N.directives[sel.dataset.dir] = sel.value; renderPanel(true); };
  $('#budget').oninput = e => { N.directives.budget = +e.target.value; };
  $('#budget').onchange = () => renderPanel(true);
  $('#delev').onchange = e => { N.delegateEvents = e.target.checked; };
  $('#pauseev').onchange = e => { G.pauseOnEvents = e.target.checked; };
  const grp = id => s.groups.find(g => g.id === +id);
  for (const x of host.querySelectorAll('[data-gen]')) x.onchange = () => { grp(x.dataset.gen).general = x.value ? +x.value : null; renderPanel(true); };
  for (const x of host.querySelectorAll('[data-ord]')) x.onchange = () => {
    const g = grp(x.dataset.ord);
    if (x.value === 'attack') g.order = { type: 'attack', target: enemies[0] || others[0] };
    else if (x.value === 'defend') { if (G.region === null) { toast('Command', 'Select a region on the globe first.', 'warn'); renderPanel(true); return; } g.order = { type: 'defend', region: G.region }; }
    else g.order = { type: x.value };
    g.status = 'New orders received.'; G.ai.runGroups(P); renderPanel(true);
  };
  for (const x of host.querySelectorAll('[data-tgt]')) x.onchange = () => { const g = grp(x.dataset.tgt); g.order.target = x.value; if (!sim.atWar(P, x.value) && confirm(`${g.name} cannot attack ${NATION[x.value].name} while you are at peace. Declare war now?`)) sim.declareWar(P, x.value); G.ai.runGroups(P); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-gsel]')) b.onclick = () => { G.sel = new Set(grp(b.dataset.gsel).units); computeStacks(); renderSelbar(); updateRings(); const u = sim.unitById.get([...G.sel][0]); if (u) G.globe.flyTo(u.pos[0], u.pos[1]); };
  for (const b of host.querySelectorAll('[data-gadd]')) b.onclick = () => { const g = grp(b.dataset.gadd); for (const u of selectedUnits()) { if (u.nation !== P) continue; for (const og of s.groups) og.units = og.units.filter(id => id !== u.id); g.units.push(u.id); u.group = g.id; } renderPanel(true); };
  for (const b of host.querySelectorAll('[data-gdis]')) b.onclick = () => { const g = grp(b.dataset.gdis); for (const id of g.units) { const u = sim.unitById.get(id); if (u) { u.group = null; u.train = false; } } s.groups = s.groups.filter(x => x !== g); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-hire]')) b.onclick = () => { const r = appoint(sim, N, b.dataset.role, +b.dataset.hire); if (!r.ok) toast('Government', r.why, 'warn'); renderPanel(true); };
}

// ---------------------------------------------------------------- government
function renderGov(host) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], g = N.gov, GT = GOV_TYPES[g.type];
  const pcRate = 0.55 * GT.pc * (0.5 + g.stability) + (N.mods.pc || 0);
  let h = `<div class="card"><div class="big">${GT.name}</div><div class="sub">${GT.election ? `Next election ${g.nextElection ? dateStr(g.nextElection) : '—'}` : 'No elections'}${s.t < g.hostileUntil ? ` · <span class="warn-text">hostile legislature until ${dateStr(g.hostileUntil)}</span>` : ''}</div>
    <div style="margin-top:10px" class="grid2"><span>Stability</span><span>${pct(g.stability)}</span></div><div class="meter"><i style="width:${pct(g.stability)};background:${g.stability < 0.3 ? 'var(--red)' : g.stability < 0.55 ? 'var(--amber)' : 'var(--green)'}"></i></div>
    <div class="grid2"><span>Public approval</span><span>${pct(g.approval)}</span></div><div class="meter"><i style="width:${pct(g.approval)};background:var(--teal)"></i></div>
    <div class="grid2"><span>Political capital</span><span>${Math.floor(g.pc)} (+${pcRate.toFixed(2)}/day)</span><span>War exhaustion</span><span>${pct(N.exhaustion)}</span></div><div style="margin-top:10px"><button class="btn go" data-convene="1" ${cabinetReady() ? '' : 'disabled'}>${cabinetReady() ? 'Convene cabinet meeting' : 'Cabinet met recently'}</button></div></div>`;
  h += `<div class="sec"><div class="sec-title">Cabinet</div>`;
  for (const role of CABINET) {
    const c = s.chars[g.cabinet[role]];
    h += `<div class="person">${c ? avatar(c, NATION[P].color) : '<div></div>'}<div><div class="pn">${c ? esc(c.name) : 'Vacant'}</div><div class="pr">${ROLES[role].name}${c ? ` · <span class="stars">${stars(c.skill)}</span> · loyalty ${pct(c.loyalty)}<br>${traitChips(c)}` : ''}</div></div><button class="btn sm" data-repl="${role}">${G.replRole === role ? 'Close' : 'Replace'}</button></div>`;
    if (G.replRole === role) {
      const cands = (g.candidates[role] || []).map(id => s.chars[id]).filter(Boolean);
      h += `<div style="padding:4px 0 8px 50px">${cands.length ? cands.map(x => `<div class="person" style="grid-template-columns:32px 1fr auto">${avatar(x, '#5c6f88')}<div><div class="pn">${esc(x.name)}</div><div class="pr"><span class="stars">${stars(x.skill)}</span> ${traitChips(x)}</div></div><button class="btn sm go" data-hire="${x.id}" data-role="${role}" ${g.pc >= hireCost(x) ? '' : 'disabled'}>Appoint · ${hireCost(x)} PC</button></div>`).join('') : '<span class="muted small">No candidates right now. New candidates appear every 60 days.</span>'}</div>`;
    }
  }
  h += '</div>';
  h += `<div class="sec"><div class="sec-title">Laws &amp; policies</div><div class="small muted" style="margin-bottom:4px">Numbers are political capital costs. Hover for effects.</div>`;
  for (const [cat, L] of Object.entries(LAWS)) {
    const cur = lawOpt(N, cat);
    h += `<div class="lawcat"><div class="lc-head"><span class="lc-name">${L.name}</span><span class="small muted">${esc(cur.desc || '')}</span></div><div class="lawopts">`;
    for (const o of L.opts) {
      if (o.id === cur.id) { h += `<button class="lawopt cur">${o.name}</button>`; continue; }
      const chk = canEnact(sim, N, cat, o.id);
      const fx = Object.entries(o.fx).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${Math.round(v * 100)}%`).join(', ');
      h += `<button class="lawopt" data-law="${cat}" data-opt="${o.id}" ${chk.ok ? '' : 'disabled'} title="${esc((o.desc ? o.desc + ' ' : '') + fx + (chk.ok ? '' : ' — ' + chk.why))}">${o.name} · ${lawCost(N, o)}</button>`;
    }
    h += '</div></div>';
  }
  h += '</div>';
  h += `<div class="sec"><div class="sec-title">Constitution</div><div class="small muted" style="margin-bottom:6px">Reforming the regime costs ${reformCost()} political capital and shakes stability.</div><div class="actions"><select class="inp" id="regime">${Object.entries(GOV_TYPES).map(([k, v]) => `<option value="${k}" ${k === g.type ? 'selected' : ''}>${v.name}</option>`).join('')}</select><button class="btn" id="reform" ${g.pc >= reformCost() ? '' : 'disabled'}>Reform government</button></div></div>`;
  const fac = s.regions.reduce((a, r) => a + (r.owner === P ? r.nuclear || 0 : 0), 0);
  h += `<div class="sec"><div class="sec-title">Strategic arsenal</div><div class="grid2"><span>Warheads</span><span>${N.warheads || 0}</span><span>Nuclear facilities</span><span>${fac}</span><span>Production</span><span>${N.techs.nuc2 && fac && g.laws.nuclear !== 'disarm' ? `1 per ${Math.round(40 / fac)} days` : 'none'}</span><span>Delivery</span><span>${has(N, 'icbm') ? 'ICBM (global)' : 'Bombers only'}</span><span>Missile defense</span><span>${pct(N.mods.intercept || 0)}</span><span>Posture</span><span>${lawOpt(N, 'nuclear').name}</span></div><div class="small muted" style="margin-top:6px">To strike, select an enemy region and use Strategic options in the Region tab.</div></div>`;
  if (!setHTML(host, h)) return;
  for (const b of host.querySelectorAll('[data-repl]')) b.onclick = () => { G.replRole = G.replRole === b.dataset.repl ? null : b.dataset.repl; renderPanel(true); };
  for (const b of host.querySelectorAll('[data-hire]')) b.onclick = () => { const r = appoint(sim, N, b.dataset.role, +b.dataset.hire); if (!r.ok) toast('Government', r.why, 'warn'); else toast('Government', `${s.chars[+b.dataset.hire].name} appointed.`, 'good'); G.replRole = null; renderPanel(true); };
  for (const b of host.querySelectorAll('[data-law]')) b.onclick = () => { const r = enact(sim, N, b.dataset.law, b.dataset.opt); if (!r.ok) toast('Legislature', r.why, 'warn'); renderPanel(true); };
  $('#reform').onclick = () => { const t = $('#regime').value; if (!confirm(`Adopt a new constitution as a ${GOV_TYPES[t].name}?`)) return; const r = reform(sim, N, t); if (!r.ok) toast('Government', r.why, 'warn'); renderPanel(true); };
}

// ---------------------------------------------------------------- research
function renderResearch(host) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], R = N.research;
  const cur = R.cur && TECH[R.cur];
  let h = `<div class="card"><div class="big">${cur ? cur.name : 'No active project'}</div><div class="sub">${cur ? esc(cur.desc) : 'Choose a technology below or open the tree.'}</div>
    ${cur ? `<div class="prog" style="height:8px;margin-top:10px"><i style="width:${Math.min(100, R.prog / cur.cost * 100)}%"></i></div><div class="small muted" style="margin-top:4px">${Math.floor(R.prog)} / ${cur.cost} · about ${Math.ceil(Math.max(0, cur.cost - R.prog) / Math.max(0.1, N.st.rp))} days</div>` : ''}
    <div class="grid2" style="margin-top:10px"><span>Research output</span><span>${fmt(N.st.rp)}/day</span><span>Funding</span><span>${lawOpt(N, 'research').name} (${money(N.st.researchCost)}/d)</span><span>Technologies</span><span>${Object.keys(N.techs).length} / ${TECHS.length}</span></div>
    <div style="display:flex;gap:6px;margin-top:10px"><button class="btn go" id="opentree">Open technology tree</button></div></div>`;
  if (R.queue.length) h += `<div class="sec"><div class="sec-title">Queue</div>${R.queue.map((id, k) => `<div class="row"><span>${k + 1}. ${TECH[id].name}</span><button class="btn sm" data-unq="${id}">Remove</button></div>`).join('')}</div>`;
  const av = TECHS.filter(t => canResearch(N, t.id)).sort((a, b) => a.cost - b.cost);
  h += `<div class="sec"><div class="sec-title">Available now</div>${av.map(t => `<div class="row"><span><span class="hi">${t.name}</span> <span class="small muted">${BRANCHES.find(b => b.id === t.branch).name} · ${t.cost} RP</span><br><span class="small muted">${esc(t.desc)}</span></span><span style="display:flex;gap:4px;flex-direction:column"><button class="btn sm go" data-res="${t.id}">Research</button><button class="btn sm" data-q="${t.id}">Queue</button></span></div>`).join('') || '<div class="muted small">Every available technology is researched.</div>'}</div>`;
  if (!setHTML(host, h)) return;
  $('#opentree').onclick = openTree;
  for (const b of host.querySelectorAll('[data-res]')) b.onclick = () => { if (R.cur && R.cur !== b.dataset.res) R.queue.unshift(R.cur); R.cur = b.dataset.res; R.queue = R.queue.filter(x => x !== R.cur); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-q]')) b.onclick = () => { queueTech(N, b.dataset.q); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-unq]')) b.onclick = () => { R.queue = R.queue.filter(x => x !== b.dataset.unq); renderPanel(true); };
}
function queueTech(N, id) {
  const R = N.research, out = [];
  const add = x => { if (N.techs[x] || out.includes(x) || R.queue.includes(x) || R.cur === x) return; for (const q of TECH[x].req) add(q); out.push(x); };
  add(id); R.queue.push(...out);
  if (!R.cur && R.queue.length) R.cur = R.queue.shift();
}
function openTree() {
  const sim = G.sim, N = sim.s.nations[sim.s.player], R = N.research;
  const render = () => {
    let h = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><div><div class="kicker">Technology</div><div style="font-size:22px;font-weight:800;color:var(--text-hi)">National research programs</div><div class="small muted">${fmt(N.st.rp)} research per day. Click an available technology to research it, or a locked one to queue it with its prerequisites.</div></div><button class="btn" id="closetree">Close</button></div><div class="tree">`;
    for (const b of BRANCHES) {
      h += `<div><div class="col-h" style="background:color-mix(in srgb, ${b.color} 18%, transparent);color:${b.color}">${b.name}</div>`;
      for (const t of TECHS.filter(x => x.branch === b.id).sort((x, y) => x.tier - y.tier || x.cost - y.cost)) {
        const st = N.techs[t.id] ? 'done' : canResearch(N, t.id) ? 'avail' : 'locked';
        h += `<div class="tnode ${st} ${R.cur === t.id ? 'cur' : ''} ${R.queue.includes(t.id) ? 'queued' : ''}" style="--bc:${b.color}" data-t="${t.id}" title="${esc(t.desc + (t.req.length ? ' Requires: ' + t.req.map(q => TECH[q].name).join(', ') : ''))}"><span class="tc">${t.cost}</span><div class="tn">${t.name}</div><div class="td">${esc(t.desc)}</div>${R.cur === t.id ? `<div class="prog"><i style="width:${Math.min(100, R.prog / t.cost * 100)}%"></i></div>` : ''}</div>`;
      }
      h += '</div>';
    }
    h += '</div>';
    $('#tree-card').innerHTML = h;
    $('#closetree').onclick = () => { $('#techtree').classList.add('hidden'); renderPanel(true); };
    for (const n of document.querySelectorAll('.tnode')) n.onclick = () => {
      const id = n.dataset.t; if (N.techs[id]) return;
      if (canResearch(N, id)) { if (R.cur && R.cur !== id) R.queue.unshift(R.cur); R.cur = id; R.queue = R.queue.filter(x => x !== id); }
      else queueTech(N, id);
      render();
    };
  };
  render();
  $('#techtree').classList.remove('hidden');
}

// ---------------------------------------------------------------- economy
function renderEconomy(host) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], st = N.st;
  const bal = (label, prod, cons, trade, stock) => {
    const max = Math.max(prod + Math.max(0, trade), cons, 1);
    return `<div class="row"><span class="hi">${label}</span><span class="${prod + trade - cons >= 0 ? 'pos' : 'neg'}">${sgn(prod + trade - cons)}/d · stock ${fmt(stock)}</span></div>
      <div class="small muted">Production ${fmt(prod)} · Trade ${sgn(trade)} · Consumption ${fmt(cons)}</div>
      <div class="bar2"><i style="left:0;width:${prod / max * 100}%;background:var(--teal)"></i><i style="left:${prod / max * 100}%;width:${Math.max(0, trade) / max * 100}%;background:var(--gold)"></i></div>`;
  };
  const sanc = s.sanctions.filter(x => x.on === P);
  let h = `<div class="card"><div class="big">${money(N.money)}</div><div class="sub">Income ${money(st.income)} · Upkeep ${money(st.upkeep)} · Research ${money(st.researchCost)} · Training ${money(st.training)} · Trade ${money(st.tradeMoney)} · <span class="${st.net >= 0 ? 'pos' : 'neg'}">Net ${money(st.net)} per day</span></div></div>`;
  if (sanc.length) h += `<div class="card" style="border-color:rgba(255,93,93,.4)"><div class="warn-text">Under sanctions from ${sanc.map(x => NATION[x.by].name).join(', ')}</div><div class="small muted">Income reduced by ${pct(1 - sim.sanctionMult(P))}.</div></div>`;
  h += `<div class="sec"><div class="sec-title">Resources</div>${bal('Food', st.foodProd, st.foodCons, st.tradeFood, N.food)}${bal('Energy', st.eProd, st.eCons, st.tradeEnergy, N.energy)}
    <div class="grid2"><span>Power supply</span><span class="${st.eF < 1 ? 'neg' : 'pos'}">${pct(st.eF)}</span><span>Manpower</span><span>${fmt(N.manpower)}K</span><span>Population</span><span>${fmt(st.pop)}M</span><span>Food price</span><span>$${s.prices.food.toFixed(3)}M</span><span>Energy price</span><span>$${s.prices.energy.toFixed(3)}M</span><span>Share of world income</span><span>${(sim.worldShare(P) * 100).toFixed(2)}%</span></div></div>`;
  const myTrades = s.trades.filter(t => t.from === P || t.to === P);
  h += `<div class="sec"><div class="sec-title">Trade agreements</div>${myTrades.length ? myTrades.map(t => {
    const exp = t.from === P; const other = exp ? t.to : t.from;
    return `<div class="row"><span>${exp ? 'Export' : 'Import'} ${fmt(t.amount)} ${t.good}/d ${exp ? '&rarr;' : '&larr;'} <span style="color:${NATION[other].color}">${NATION[other].name}</span><br><span class="small muted">@ $${t.price.toFixed(3)} = ${money(t.amount * t.price)}/d${t.blockaded ? ' · <span class="neg">blockaded by ' + NATION[t.by].name + '</span>' : ''}</span></span><button class="btn sm danger" data-cancel="${t.id}">Cancel</button></div>`;
  }).join('') : '<div class="muted small">No agreements. Negotiate trade in Diplomacy, or let your Foreign Minister secure supply lines.</div>'}</div>`;
  const builds = s.regions.filter(r => r.owner === P && r.build);
  h += `<div class="sec"><div class="sec-title">Construction</div>${builds.length ? builds.map(r => `<div class="row click" data-reg="${r.i}"><span>${BUILDINGS[r.build.type].name} L${r.build.level} · ${G.world.regions[r.i].name}</span><span class="muted">${Math.ceil(r.build.left)}d</span></div>`).join('') : '<div class="muted small">No projects under way.</div>'}</div>`;
  h += `<div class="sec"><div class="sec-title">Military production</div>${N.queue.length ? N.queue.map(q => `<div class="row"><span>${UNITS[q.type].name} · ${G.world.regions[q.region].name}</span><span class="muted">${Math.ceil(q.left)}d</span></div>`).join('') : '<div class="muted small">Nothing in production.</div>'}</div>`;
  h += `<div class="sec"><div class="sec-title">Income history</div>${chart(s.history.map(r => r.gdp[P] || 0), NATION[P].color)}</div>`;
  const regs = s.regions.filter(r => r.owner === P).sort((a, b) => b.pop - a.pop);
  h += `<div class="sec"><div class="sec-title">Regions (${regs.length})</div>${regs.map(r => `<div class="row click" data-reg="${r.i}"><span>${G.world.regions[r.i].name}${r.core !== P ? ' <span class="warn-text small">occupied</span>' : ''}</span><span class="muted small">${fmt(r.pop)}M · C${r.city} I${r.industry} F${r.farm} P${r.power}${r.lab ? ' L' + r.lab : ''}${r.datacenter ? ' AI' + r.datacenter : ''}</span></div>`).join('')}</div>`;
  if (!setHTML(host, h)) return;
  for (const b of host.querySelectorAll('[data-cancel]')) b.onclick = () => { const t = s.trades.find(x => x.id === +b.dataset.cancel); if (t) { sim.cancelTrade(t.id); sim.addOpinion(t.from === P ? t.to : t.from, P, -8); } renderPanel(true); refreshWorld(false); };
  for (const r of host.querySelectorAll('[data-reg]')) r.onclick = () => { const R = G.world.regions[+r.dataset.reg]; G.globe.flyTo(R.lat, R.lon); selectRegion(+r.dataset.reg); };
}
function chart(vals, color) {
  if (vals.length < 2) return '<div class="muted small">Data accumulates weekly.</div>';
  const W = 400, H = 110, max = Math.max(...vals) * 1.05 || 1, min = Math.min(...vals) * 0.95;
  const pts = vals.map((v, k) => `${(k / (vals.length - 1) * W).toFixed(1)},${(H - (v - min) / (max - min || 1) * H).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

// ---------------------------------------------------------------- diplomacy
function openDossier(c) { G.dip = c === G.sim.s.player ? null : c; switchTab('diplomacy'); }
function opBar(v) { const w = Math.abs(v) / 2; return `<span class="opbar" title="Opinion ${Math.round(v)}"><i style="${v >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%;background:${v >= 0 ? 'var(--green)' : 'var(--red)'}"></i></span>`; }

function renderDiplomacy(host) {
  const sim = G.sim, s = sim.s, P = s.player;
  const inbox = s.messages.filter(m => m.to === P && m.status === 'pending');
  if (!G.dip) {
    const neighbours = new Set();
    for (const r of s.regions) if (r.owner === P) for (const j of G.world.adj[r.i]) {
      const o = s.regions[j].owner; if (o && o !== P) neighbours.add(o);
      if (G.world.regions[j].sea) for (const k of G.world.adj[j]) { const o2 = s.regions[k].owner; if (o2 && o2 !== P) neighbours.add(o2); }
    }
    let list = Object.values(s.nations).filter(n => n.alive && n.code !== P).map(n => n.code);
    if (G.dipFilter) list = list.filter(c => NATION[c].name.toLowerCase().includes(G.dipFilter.toLowerCase()));
    else if (G.dipList === 'relevant') list = list.filter(c => neighbours.has(c) || NATION[c].major || sim.rel(P, c) !== 'peace' || s.trades.some(t => (t.from === c && t.to === P) || (t.to === c && t.from === P)));
    else if (G.dipList === 'war') list = list.filter(c => sim.atWar(P, c));
    else if (G.dipList === 'allies') list = list.filter(c => ['alliance', 'nap'].includes(sim.rel(P, c)));
    list.sort((a, b) => (sim.atWar(P, b) - sim.atWar(P, a)) || (s.nations[b].st.income - s.nations[a].st.income));
    let h = '';
    if (inbox.length) h += `<div class="sec"><div class="sec-title">Pending proposals</div>${inbox.map(m => `<div class="msg"><div class="m-meta">${NATION[m.from].name} · ${dateStr(m.t)}</div>${esc(m.text)}<div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm go" data-ans="${m.id}" data-v="1">Accept</button><button class="btn sm danger" data-ans="${m.id}" data-v="0">Decline</button><button class="btn sm" data-open="${m.from}">Dossier</button></div></div>`).join('')}</div>`;
    h += `<div class="sec"><div class="sec-title">Foreign governments</div><input class="inp" id="dip-q" placeholder="Search nations..." value="${esc(G.dipFilter)}">
      <div class="filters" style="margin-top:6px">${['relevant', 'all', 'war', 'allies'].map(k => `<span class="chip ${G.dipList === k ? 'on' : ''}" data-list="${k}">${k[0].toUpperCase() + k.slice(1)}</span>`).join('')}</div>`;
    h += list.map(c => {
      const r = sim.rel(P, c), N = s.nations[c];
      const unread = s.messages.filter(m => m.from === c && m.to === P && m.unread).length;
      return `<div class="row click" data-open="${c}"><span><span class="flagchip" style="background:${NATION[c].color}"></span><span class="hi">${NATION[c].name}</span>${unread ? ` <b class="badge">${unread}</b>` : ''}<br><span class="small muted">${GOV_TYPES[N.gov.type].name} · ${money(N.st.income)}/d · ${N.st.units} units</span></span><span style="text-align:right"><span class="status ${r}">${REL_LABEL[r]}</span><br>${opBar(sim.opinion(c, P))}</span></div>`;
    }).join('') || '<div class="muted small">No nations match.</div>';
    h += '</div>';
    if (!setHTML(host, h)) return;
    const q = $('#dip-q'); q.oninput = () => { G.dipFilter = q.value; renderPanel(true); const x = $('#dip-q'); x.focus(); x.setSelectionRange(G.dipFilter.length, G.dipFilter.length); };
    for (const c of host.querySelectorAll('[data-list]')) c.onclick = () => { G.dipList = c.dataset.list; renderPanel(true); };
    for (const b of host.querySelectorAll('[data-open]')) b.onclick = e => { e.stopPropagation(); openDossier(b.dataset.open); };
    for (const b of host.querySelectorAll('[data-ans]')) b.onclick = e => { e.stopPropagation(); answer(s.messages.find(m => m.id === +b.dataset.ans), b.dataset.v === '1'); };
    return;
  }
  const c = G.dip, N = s.nations[c], n = NATION[c], Me = s.nations[P];
  for (const m of s.messages) if (m.from === c && m.to === P) m.unread = false;
  const r = sim.rel(P, c);
  const allies = sim.alliesOf(c), wars = sim.warsOf(c);
  const msgs = s.messages.filter(m => (m.from === c && m.to === P) || (m.from === P && m.to === c)).slice(-12);
  const sanctioned = s.sanctions.some(x => x.by === P && x.on === c);
  const guaranteed = s.guarantees.some(x => x.by === P && x.of === c);
  const head = s.chars[N.gov.cabinet.foreign];
  let h = `<span class="chip" id="dip-back">&#9666; All governments</span>
    <div class="card" style="margin-top:8px"><div class="big" style="color:${n.color}">${n.name}</div><div class="sub">${GOV_TYPES[N.gov.type].name}${n.leader.startsWith('Government') ? '' : ' · ' + n.leader}${N.alive ? '' : ' · collapsed'}</div>
    <div class="grid2" style="margin-top:8px">
      <span>Relation</span><span><span class="status ${r}">${REL_LABEL[r]}</span></span>
      <span>Opinion of you</span><span>${Math.round(sim.opinion(c, P))} ${opBar(sim.opinion(c, P))}</span>
      <span>Population</span><span>${fmt(N.st.pop)}M</span>
      <span>Income</span><span>${money(N.st.income)}/d</span>
      <span>Military strength</span><span>${fmt(sim.power(c))} <span class="muted">(you ${fmt(sim.power(P))})</span></span>
      <span>Stability</span><span>${pct(N.gov.stability)}</span>
      <span>Technologies</span><span>${Object.keys(N.techs).length}</span>
      <span>Nuclear arsenal</span><span>${N.warheads ? ((Me.mods.covert || 0) > 0.2 ? N.warheads + ' warheads' : 'confirmed') : 'none known'}</span>
      <span>War exhaustion</span><span>${pct(N.exhaustion)}</span>
      <span>Foreign minister</span><span>${head ? esc(head.name) : '—'}</span>
    </div>
    <div class="small" style="margin-top:6px"><span class="muted">Allies:</span> ${allies.map(a => `<span style="color:${NATION[a].color}">${a === P ? 'You' : NATION[a].name}</span>`).join(', ') || 'none'}<br><span class="muted">At war with:</span> ${wars.map(a => `<span style="color:${NATION[a].color}">${a === P ? 'You' : NATION[a].name}</span>`).join(', ') || 'none'}</div></div>`;
  if (N.alive) {
    h += `<div class="sec"><div class="sec-title">Diplomacy</div><div class="actions">
      <button class="btn" data-act="nap" ${r !== 'peace' ? 'disabled' : ''}>Non-aggression pact</button>
      <button class="btn" data-act="alliance" ${r === 'alliance' || r === 'war' ? 'disabled' : ''}>Propose alliance</button>
      ${r === 'war' ? '<button class="btn go" data-act="peace">Propose peace</button>' : '<button class="btn danger" data-act="war">Declare war</button>'}
      ${r === 'alliance' ? '<button class="btn danger" data-act="break">End alliance</button>' : r === 'nap' ? '<button class="btn danger" data-act="break">End pact</button>' : '<span></span>'}
    </div></div>
    <div class="sec"><div class="sec-title">Intervention</div><div class="actions">
      <button class="btn" data-act="guarantee" ${guaranteed || r === 'war' ? 'disabled' : ''}>Guarantee independence</button>
      <button class="btn" data-act="aid">Military aid ($250M)</button>
      <button class="btn ${sanctioned ? '' : 'danger'}" data-act="sanction">${sanctioned ? 'Lift sanctions' : 'Impose sanctions'}</button>
      <button class="btn" data-act="demand" ${r === 'war' ? 'disabled' : ''}>Territorial ultimatum &#9656;</button>
      ${wars.filter(x => x !== P).length ? '<button class="btn" data-act="join">Join their war &#9656;</button><button class="btn" data-act="mediate">Mediate peace &#9656;</button>' : ''}
      ${['alliance', 'nap'].includes(r) ? '<button class="btn" data-act="share">Share technology &#9656;</button>' : ''}
      ${r === 'alliance' && sim.warsOf(P).some(t => !sim.atWar(c, t)) ? '<button class="btn" data-act="joint">Request joint war &#9656;</button>' : ''}
    </div><div id="sub-box"></div></div>
    <div class="sec"><div class="sec-title">Intelligence operations</div><div class="small muted" style="margin-bottom:6px">Success chance about ${pct(Math.max(0.08, Math.min(0.9, 0.42 + (Me.mods.covert || 0) + (Me.spyBonus || 0) - (N.mods.covert || 0) * 0.6)))}. Exposure damages relations.</div><div class="actions">
      <button class="btn" data-op="steal">Steal technology ($150M)</button>
      <button class="btn" data-op="sabotage">Sabotage industry ($200M)</button>
      <button class="btn" data-op="unrest">Incite unrest ($120M)</button>
      <button class="btn" data-op="cyber" ${has(Me, 'cyber') ? '' : 'disabled title="Requires Cyber Warfare"'}>Cyber attack ($250M)</button>
    </div></div>
    <div class="sec"><div class="sec-title">Trade proposal</div>
      <div class="actions"><select class="inp" id="tr-dir"><option value="buy">We buy from them</option><option value="sell">We sell to them</option></select><select class="inp" id="tr-good"><option value="food">Food</option><option value="energy">Energy</option></select>
      <input class="inp" id="tr-amt" type="number" min="1" value="20" title="Units per day"><input class="inp" id="tr-price" type="number" step="0.001" value="${s.prices.food.toFixed(3)}" title="$M per unit"></div>
      <div class="small muted" style="margin:4px 0">Units per day · price per unit ($M). Their balance: food ${sgn(N.st.foodNet)}, energy ${sgn(N.st.energyNet)}.</div>
      <button class="btn" id="tr-send">Propose trade</button></div>`;
  }
  h += `<div class="sec"><div class="sec-title">Diplomatic cables</div>${msgs.map(m => `<div class="msg ${m.from === P ? 'out' : ''}"><div class="m-meta">${m.from === P ? 'You' : n.name} · ${dateStr(m.t)}${m.status && m.status !== 'pending' ? ' · ' + m.status : ''}</div>${esc(m.text)}${m.status === 'pending' && m.from === c ? `<div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm go" data-ans="${m.id}" data-v="1">Accept</button><button class="btn sm danger" data-ans="${m.id}" data-v="0">Decline</button></div>` : ''}</div>`).join('') || '<div class="muted small">No traffic.</div>'}</div>`;
  if (!setHTML(host, h)) return;
  $('#dip-back').onclick = () => { G.dip = null; renderPanel(true); };
  for (const b of host.querySelectorAll('[data-ans]')) b.onclick = () => answer(s.messages.find(m => m.id === +b.dataset.ans), b.dataset.v === '1');
  for (const b of host.querySelectorAll('[data-act]')) b.onclick = () => dipAct(c, b.dataset.act);
  for (const b of host.querySelectorAll('[data-op]')) b.onclick = () => { const res = sim.covert(P, c, b.dataset.op); toast('Intelligence', res.why, res.ok ? 'good' : 'warn'); renderPanel(true); };
  const good = $('#tr-good'); if (good) good.onchange = () => { $('#tr-price').value = s.prices[good.value].toFixed(3); };
  const send = $('#tr-send'); if (send) send.onclick = () => {
    const dir = $('#tr-dir').value, g = $('#tr-good').value, amt = Math.max(1, Math.round(+$('#tr-amt').value || 1)), price = Math.max(0.001, +$('#tr-price').value || s.prices[g]);
    propose(c, { type: 'trade', good: g, amount: amt, price, from: dir === 'buy' ? c : P, to: dir === 'buy' ? P : c });
  };
}

function subPick(title, items, onPick) {
  const box = $('#sub-box'); if (!box) return;
  box.innerHTML = `<div class="small muted" style="margin:8px 0 4px">${title}</div>` + (items.length ? items.map(([v, l]) => `<button class="btn sm" data-sp="${v}" style="margin:2px">${l}</button>`).join('') : '<div class="small muted">No options.</div>');
  for (const b of box.querySelectorAll('[data-sp]')) b.onclick = () => onPick(b.dataset.sp);
  G.pointerDown = true; setTimeout(() => { G.pointerDown = false; }, 4000); // keep the picker open briefly
}
function dipAct(c, act) {
  const sim = G.sim, s = sim.s, P = s.player;
  const done = () => { renderPanel(true); refreshWorld(false); };
  const res = r => { toast('Diplomacy', r.why || (r.ok ? 'Done.' : 'Not possible.'), r.ok ? 'good' : 'warn'); done(); };
  if (act === 'war') { if (!confirm(`Declare war on ${NATION[c].name}? Their allies and guarantors may join.`)) return; sim.message(P, c, 'Formal declaration of war.'); sim.declareWar(P, c); return done(); }
  if (act === 'break') { if (!confirm('End the treaty? This damages relations.')) return; sim.setRel(P, c, 'peace'); sim.addOpinion(c, P, -25); sim.emit('treaty', `${NATION[P].name} terminates its treaty with ${NATION[c].name}.`, [P, c]); return done(); }
  if (act === 'guarantee') return res(sim.guarantee(P, c));
  if (act === 'aid') return res(sim.militaryAid(P, c, 250));
  if (act === 'sanction') { const lift = s.sanctions.some(x => x.by === P && x.on === c); return res(sim.sanction(P, c, lift)); }
  if (act === 'demand') {
    const regs = s.regions.filter(r => r.owner === c && G.world.adj[r.i].some(j => s.regions[j].owner === P)).map(r => [r.i, G.world.regions[r.i].name]);
    return subPick('Demand that they cede:', regs, v => { if (confirm(`Issue an ultimatum demanding ${G.world.regions[+v].name}?`)) res(sim.demand(P, c, +v)); });
  }
  if (act === 'join') return subPick('Declare war on their enemy:', sim.warsOf(c).filter(x => x !== P && !sim.atWar(P, x)).map(x => [x, NATION[x].name]), v => { if (!confirm(`Join ${NATION[c].name}'s war against ${NATION[v].name}?`)) return; sim.declareWar(P, v); sim.addOpinion(c, P, 25); done(); });
  if (act === 'mediate') return subPick('Mediate between them and:', sim.warsOf(c).filter(x => x !== P).map(x => [x, NATION[x].name]), v => res(sim.mediate(P, c, v)));
  if (act === 'share') return subPick('Share a technology they lack:', Object.keys(s.nations[P].techs).filter(id => !s.nations[c].techs[id] && TECH[id].req.every(q => s.nations[c].techs[q])).map(id => [id, TECH[id].name]), v => res(sim.shareTech(P, c, v)));
  if (act === 'joint') return subPick('Ask them to join your war against:', sim.warsOf(P).filter(t => !sim.atWar(c, t)).map(x => [x, NATION[x].name]), v => propose(c, { type: 'joint', target: v }));
  propose(c, { type: act });
}

function propose(c, p) {
  const sim = G.sim, s = sim.s, P = s.player;
  const desc = { nap: 'We propose a mutual non-aggression pact.', alliance: 'We propose a military alliance between our nations.', peace: 'We propose an immediate end to hostilities.',
    joint: `We ask that you join our war against ${NATION[p.target]?.name}.`,
    trade: p.from === P ? `We offer to sell you ${p.amount} ${p.good}/day at $${p.price}M per unit.` : `We wish to buy ${p.amount} ${p.good}/day at $${p.price}M per unit.` }[p.type];
  const sent = sim.message(P, c, desc); sent.unread = false;
  const r = G.ai.evaluate(c, P, p);
  const dip = s.nations[P].mods.diplo || 0;
  if (!r.ok && Math.random() < dip * 0.5) { r.ok = true; r.why = 'Your foreign minister\'s persuasion carries the day.'; }
  renderPanel(true);
  setTimeout(() => {
    if (r.ok) applyProposal(c, P, p); else sim.addOpinion(c, P, -1);
    sim.message(c, P, (r.ok ? 'Agreed. ' : 'Declined. ') + r.why);
    renderPanel(true); refreshWorld(false);
  }, 600 + Math.random() * 600);
}
function applyProposal(a, b, p) {
  const sim = G.sim;
  if (p.type === 'nap') { sim.setRel(a, b, 'nap'); sim.emit('treaty', `${NATION[a].name} and ${NATION[b].name} sign a non-aggression pact.`, [a, b]); }
  if (p.type === 'alliance') { sim.setRel(a, b, 'alliance'); sim.addOpinion(a, b, 10); sim.emit('treaty', `${NATION[a].name} and ${NATION[b].name} form a military alliance.`, [a, b]); }
  if (p.type === 'peace') sim.makePeace(a, b);
  if (p.type === 'trade') { const t = sim.addTrade(p.from, p.to, p.good, p.amount, p.price); if (t) sim.emit('trade', `${NATION[p.from].name} will export ${p.amount} ${p.good}/day to ${NATION[p.to].name}.`, [p.from, p.to]); else toast('Trade', 'No viable shipping route (or sanctions in force).', 'warn'); }
  if (p.type === 'joint') { const ally = a === sim.s.player ? b : a; sim.declareWar(ally, p.target); }
}
function answer(m, yes) {
  if (!m || m.status !== 'pending') return;
  const sim = G.sim, P = sim.s.player;
  m.status = yes ? 'accepted' : 'declined'; m.unread = false;
  const p = m.proposal;
  if (yes) { if (p.type === 'callToArms') { sim.declareWar(P, p.against); sim.addOpinion(m.from, P, 15); } else applyProposal(m.from, P, p); sim.addOpinion(m.from, P, 4); }
  else {
    sim.addOpinion(m.from, P, p.type === 'callToArms' ? -35 : -4);
    if (p.type === 'callToArms' && sim.rel(P, m.from) === 'alliance') { sim.setRel(P, m.from, 'peace'); sim.emit('treaty', `${NATION[m.from].name} dissolves its alliance with ${NATION[P].name} after being abandoned.`, [m.from, P]); }
  }
  renderPanel(true); refreshWorld(false);
}

// ---------------------------------------------------------------- intel
function renderIntel(host) {
  const sim = G.sim, s = sim.s;
  const wars = Object.entries(s.rel).filter(([, v]) => v === 'war').map(([k]) => k.split('|'));
  let h = `<div class="sec"><div class="sec-title">Active conflicts (${wars.length})</div>${wars.map(([a, b]) => `<div class="row"><span><span style="color:${NATION[a].color}">${NATION[a].name}</span> <span class="muted">vs</span> <span style="color:${NATION[b].color}">${NATION[b].name}</span></span><span class="muted small">${s.regions.filter(r => r.owner === a && r.core === b).length} / ${s.regions.filter(r => r.owner === b && r.core === a).length} regions taken</span></div>`).join('') || '<div class="muted small">The world is at peace.</div>'}</div>`;
  const top = Object.values(s.nations).filter(n => n.alive).map(n => ({ c: n.code, p: sim.power(n.code), t: Object.keys(n.techs).length })).sort((a, b) => b.p - a.p).slice(0, 8);
  h += `<div class="sec"><div class="sec-title">Military power</div>${top.map(x => `<div class="row"><span><span class="flagchip" style="background:${NATION[x.c].color}"></span>${NATION[x.c].name}</span><span class="muted">${fmt(x.p)} · ${x.t} techs${s.nations[x.c].warheads ? ' · ☢' : ''}</span></div>`).join('')}</div>`;
  if (s.sanctions.length) h += `<div class="sec"><div class="sec-title">Sanctions regimes</div>${[...new Set(s.sanctions.map(x => x.on))].map(on => `<div class="row"><span>${NATION[on].name}</span><span class="muted small">${s.sanctions.filter(x => x.on === on).length} nations</span></div>`).join('')}</div>`;
  const F = { all: 'All', war: 'War', capture: 'Territory', battle: 'Combat', trade: 'Trade', econ: 'Economy', treaty: 'Treaties', tech: 'Science', gov: 'Politics', nuke: 'Nuclear' };
  h += `<div class="sec"><div class="sec-title">Event log</div><div class="filters">${Object.entries(F).map(([k, v]) => `<span class="chip ${G.intelFilter === k ? 'on' : ''}" data-f="${k}">${v}</span>`).join('')}</div>`;
  const items = s.events.filter(e => G.intelFilter === 'all' ? e.kind !== 'loss' : e.kind === G.intelFilter || (G.intelFilter === 'treaty' && e.kind === 'peace') || (G.intelFilter === 'battle' && e.kind === 'loss')).slice(-120).reverse();
  h += items.map((e, k) => `<div class="log-item ${e.kind}" data-ev="${k}"><span class="lt">${dateStr(e.t)}</span>${esc(e.text)}</div>`).join('') || '<div class="muted small">No events.</div>';
  h += '</div>';
  if (!setHTML(host, h)) return;
  for (const c of host.querySelectorAll('[data-f]')) c.onclick = () => { G.intelFilter = c.dataset.f; renderPanel(true); };
  for (const el of host.querySelectorAll('[data-ev]')) el.onclick = () => { const e = items[+el.dataset.ev]; if (e.loc !== undefined) { const R = G.world.regions[e.loc]; G.globe.flyTo(R.lat, R.lon, 1.9); selectRegion(e.loc); } };
}

// ======================================================================= chrome
function gameOver() {
  setSpeed(0);
  const s = G.sim.s; const won = s.winner === s.player;
  $('#modal-card').innerHTML = `<div class="kicker">${won ? 'Victory' : 'Defeat'}</div>
    <h1>${s.winner ? `<span>${NATION[s.winner].name}</span> dominates the world economy` : `${NATION[s.player].name} has fallen`}</h1>
    <p class="muted">${dateStr(s.t)}</p>
    <div class="modal-foot">${s.nations[s.player].alive ? '<button class="btn" id="go-cont">Keep playing</button>' : ''}<button class="btn go" id="go-new">New game</button></div>`;
  $('#modal').classList.remove('hidden');
  $('#go-new').onclick = () => { localStorage.removeItem(SAVE_KEY); showSetup(); };
  if ($('#go-cont')) $('#go-cont').onclick = () => { s.over = false; s.winShare = 2; $('#modal').classList.add('hidden'); };
}

function showManual(fromSetup) {
  $('#modal-card').innerHTML = `<div class="kicker">Briefing</div><h1>Field <span>manual</span></h1><div class="manual">
    <h3>A living world</h3><p>Time runs continuously. Pause or change speed with the controls, <b>Space</b>, or <b>1</b>–<b>4</b>. The sun crosses the Earth in real time. City lights grow with your cities and dim with blackouts or bombing.</p>
    <h3>Governing</h3><p>The <b>Government</b> tab holds your cabinet, laws and constitution. Ministers have skills and traits that shape the whole nation. Passing laws and appointing people costs <b>political capital</b>, which you earn daily, faster when stable. Democracies hold elections. Low stability brings protests, plots and coups.</p>
    <h3>War Department</h3><p>Press <b>R</b> or <b>Recruit</b> to order units in bulk: pick a type and quantity, or a ready-made formation such as an Infantry Division or a Carrier Strike Group. Orders spread across your factories and shipyards to finish fastest. You can rally new units to a region or hand them straight to an army group. Backlogged orders are paid for only when production starts.</p>
    <h3>Cabinet meetings</h3><p>Convene the cabinet once a week from the top bar or with <b>C</b>. Each minister tables proposals from their portfolio: what to build and where, which units to raise at which factory or port, redeployments, research priorities, laws, trade deals, treaties and covert operations. Approve or deny each one. Skilled ministers rank options well and estimate their effects accurately. Weak ones misjudge things, and corrupt ones pad budgets.</p>
    <h3>Delegating</h3><p>In <b>Command</b>, give ministers standing directives (industrial expansion, a naval build-up, an AI research agenda, securing supply lines) with a spending limit, and they act on their own. Form <b>army groups</b> from selected units, give each a general, and order it to attack a nation, defend a region, hold, or train. You can take direct control of any unit at any time.</p>
    <h3>Research</h3><p>Over 45 technologies across nine branches, from mechanized farming to artificial general intelligence, fusion power and thermonuclear weapons. Funding comes from your research law, labs and AI datacenters.</p>
    <h3>Economy</h3><p>Feed your people (farms), keep the lights on (power plants and oil), and grow income (cities, industry). Trade along shipping lanes that enemy fleets can blockade.</p>
    <h3>Forces in motion</h3><ul><li>Every unit is a dot with a real position. Badges summarize groups, with a health ring and experience stars.</li><li>Weapons have real ranges: cruisers shell coasts from 320 km, carriers strike at 700 km, and artillery fires 160 km. Destroyers hunt submarines, and submarines ambush shipping.</li><li>Aircraft fly sorties: bombers to the target and back, and fighters scramble to intercept within 1,100 km.</li><li>Units gain experience in combat and training. Generals add their skill to their army group.</li></ul>
    <h3>Controls</h3><ul><li>Left-drag rotates and scroll zooms. Click a region to inspect it, and click a unit or badge to select it.</li><li><b>Shift-drag</b> box-selects. <b>Right-click</b> moves. With aircraft selected, right-click enemy land to order strikes.</li><li><b>Esc</b> clears the selection. <b>H</b> returns to your capital.</li></ul>
    <h3>The bomb</h3><p>Research enrichment and nuclear weapons, build a Nuclear Program, then deliver warheads by bomber or ICBM. A strike is devastating, condemned worldwide, and invites retaliation. Repeated detonations bring nuclear winter.</p>
    <h3>Statecraft</h3><p>Guarantee small nations, send military aid, mediate wars, impose sanctions, issue ultimatums, share technology, or run covert operations: steal technology, sabotage industry, incite unrest, or launch cyber attacks.</p>
  </div><div class="modal-foot"><button class="btn go" id="man-close">${fromSetup ? '&#9666; Back' : 'Close'}</button></div>`;
  $('#modal').classList.remove('hidden');
  $('#man-close').onclick = () => fromSetup ? showSetup() : $('#modal').classList.add('hidden');
}

function bindChrome() {
  for (const b of document.querySelectorAll('.tabs button')) b.onclick = () => switchTab(b.dataset.tab);
  $('#panel').addEventListener('pointerdown', () => { G.pointerDown = true; });
  window.addEventListener('pointerup', () => { setTimeout(() => { G.pointerDown = false; }, 0); });
  for (const b of document.querySelectorAll('#speed button')) b.onclick = () => { setSpeed(+b.dataset.s); if (+b.dataset.s) G.prevSpeed = +b.dataset.s; };
  $('#btn-save').onclick = () => G.sim && save();
  $('#btn-cabinet').onclick = openCabinet;
  $('#btn-war').onclick = openWar;
  $('#btn-load').onclick = () => { const s = loadSaved(); if (s) resume(s); else toast('System', 'No saved game.', 'warn'); };
  $('#btn-new').onclick = () => showSetup();
  $('#btn-help').onclick = () => { setSpeed(0); showManual(false); };
  for (const b of document.querySelectorAll('#mapbar button')) b.onclick = () => {
    const m = b.dataset.m;
    if (m === 'political' || m === 'realistic') { G.overlay = m; for (const x of document.querySelectorAll('#mapbar [data-m=political],#mapbar [data-m=realistic]')) x.classList.toggle('on', x.dataset.m === m); G.globe.setOverlay(m === 'political' ? 1 : 0); if (G.sim) refreshWorld(false); }
    if (m === 'clouds') { G.clouds = !G.clouds; b.classList.toggle('on', G.clouds); G.globe.setClouds(G.clouds ? 0.5 : 0); }
    if (m === 'routes') { G.showRoutes = !G.showRoutes; b.classList.toggle('on', G.showRoutes); G.globe.setRoutesVisible(G.showRoutes); }
    if (m === 'labels') { G.showLabels = !G.showLabels; b.classList.toggle('on', G.showLabels); }
    if (m === 'home' && G.sim) { const R = G.world.regions[G.sim.s.nations[G.sim.s.player].capital]; G.globe.flyTo(R.lat, R.lon, 2.0); }
  };
  document.addEventListener('keydown', e => {
    if (!G.sim || ['INPUT', 'SELECT'].includes(e.target.tagName) || !$('#modal').classList.contains('hidden') || !$('#eventbox').classList.contains('hidden')) return;
    if (e.key === 'Escape' && !$('#techtree').classList.contains('hidden')) { $('#techtree').classList.add('hidden'); return; }
    if (!$('#cabinetbox').classList.contains('hidden')) { if (e.key === 'Escape') closeCabinet(); return; }
    if (!$('#warbox').classList.contains('hidden')) { if (e.key === 'Escape') closeWar(); return; }
    if (e.key.toLowerCase() === 'r') { openWar(); return; }
    if (e.key.toLowerCase() === 'c') { openCabinet(); return; }
    if (e.code === 'Space') { e.preventDefault(); setSpeed(G.speed ? 0 : G.prevSpeed || 1); }
    else if (/^[1-4]$/.test(e.key)) { setSpeed(+e.key); G.prevSpeed = +e.key; }
    else if (e.key === 'Escape') { G.sel.clear(); computeStacks(); renderSelbar(); updateRings(); renderPanel(true); }
    else if (e.key.toLowerCase() === 'h') { const R = G.world.regions[G.sim.s.nations[G.sim.s.player].capital]; G.globe.flyTo(R.lat, R.lon, 2.0); }
  });
  setInterval(() => { if (G.sim && G.speed && $('#modal').classList.contains('hidden')) save(true); }, 60000);
}

window.GC = G;
boot().catch(err => { $('#modal-card').innerHTML = `<div class="boot" style="color:var(--red)">Startup failed: ${esc(err.message)}</div>`; console.error(err); });
