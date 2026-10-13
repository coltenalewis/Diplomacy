// Modal dialogs: war council, council meetings, tree of knowledge, events, manual, game over.
import { AGES } from './eras.js';
import { UNITS, LINES, LINE_ORDER, bestOf } from './units.js';
import { RES } from './resources.js';
import { TECHS, TECH, BRANCHES, canResearch, AGE_TECHS } from './tech.js';
import { ROLES, CABINET, TRAITS, resolveEvent, roleTitle, styleName } from './gov.js';
import { convene, execute, deny, confidence, MEETING_COOLDOWN_DAYS } from './cabinet.js';
import { G, $, esc, fmt, pct, popStr, toast, dstr, stars, avatar, costStr, ICON } from './ui.js';
import { renderPanel, unlockText } from './panels.js';

const traitChips = c => c.traits.map(t => `<span class="trait ${['Corrupt', 'Ambitious'].includes(t) ? 'bad' : ''}" title="${esc(TRAITS[t]?.desc || '')}">${t}</span>`).join('');

// ======================================================================= war council (bulk musters)
const PACKAGES = [
  { name: 'War host', mix: { INF: 6, RNG: 2, SGE: 1 }, desc: 'Line troops with missile and siege support' },
  { name: 'Cavalry wing', mix: { CAV: 4 }, desc: 'Fast shock troops' },
  { name: 'Siege train', mix: { SGE: 3, INF: 2 }, desc: 'Break walls and fortresses' },
  { name: 'Garrison levy', mix: { INF: 8 }, desc: 'Cheap defenders' },
  { name: 'Skirmish screen', mix: { RNG: 4 }, desc: 'Ranged troops' },
  { name: 'Fleet', mix: { NAV: 3, TRN: 1 }, desc: 'Control the coasts' },
  { name: 'Expedition', mix: { TRN: 3, NAV: 1 }, desc: 'Carry an army across the water' },
  { name: 'Air group', mix: { FTR: 2, BMB: 2 }, desc: 'Air superiority and strike' },
  { name: 'Carrier group', mix: { CAR: 1, NAV: 2, SUB: 1 }, desc: 'Blue-water power projection' },
];
const WAR = { line: 'INF', qty: 6, site: 'auto', rally: null, group: null };
export function openWar(region) {
  if (!G.sim) return;
  if (region !== undefined && region !== null) WAR.site = String(region);
  WAR.resume = G.speed; G.fn.setSpeed(0);
  renderWar();
  $('#warbox').classList.remove('hidden');
}
export function closeWar() { $('#warbox').classList.add('hidden'); if (WAR.resume) G.fn.setSpeed(WAR.resume); WAR.resume = 0; renderPanel(true); }
function warOpts() { return { region: WAR.site !== 'auto' && WAR.site !== 'near' ? +WAR.site : null, near: WAR.site === 'near' ? (G.region ?? null) : null, group: WAR.group ? +WAR.group : null, rally: WAR.rally === 'sel' ? (G.region ?? null) : null }; }
function previewOrder(type, qty) { const sim = G.sim, P = sim.s.player, N = sim.s.nations[P]; const saved = N.queue.slice(); const r = sim.orderUnits(P, type, qty, warOpts()); N.queue = saved; return r; }
function renderWar() {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], w = G.world;
  const lines = LINE_ORDER.filter(l => bestOf(N, l));
  if (!lines.includes(WAR.line)) WAR.line = lines[0];
  const type = bestOf(N, WAR.line), T = UNITS[type];
  const sites = sim.sitesFor(P, type);
  if (WAR.site !== 'auto' && WAR.site !== 'near' && !sites.some(r => String(r.i) === WAR.site)) WAR.site = 'auto';
  const pv = WAR.qty > 0 ? previewOrder(type, WAR.qty) : null;
  const groups = s.groups.filter(g => g.nation === P);
  let h = `<div class="meet-head"><div><div class="kicker">${dstr()} · ${esc(roleTitle('defense', N.age))}</div><h2>War council</h2><div class="small muted">Stores: ${costStr({ food: N.food, wood: N.wood, metal: N.metal, wealth: N.wealth, oil: N.oil })} · upkeep ${costStr(N.st.upkeep)}/day</div></div><button class="btn go" id="w-close">Done</button></div>
  <div class="war-grid"><div>
    <div class="sec-title">Unit</div><div class="utypes">${lines.map(l => {
      const t = bestOf(N, l), U = UNITS[t], f = sim.canField(P, t), ok = f.ok && sim.sitesFor(P, t).length > 0;
      return `<div class="utype ${l === WAR.line ? 'sel' : ''} ${ok ? '' : 'off'}" data-ul="${l}" title="${esc(ok ? '' : f.why || (U.domain === 'sea' ? 'Needs a harbor' : U.domain === 'air' ? 'Needs an airfield' : 'Needs a settlement'))}"><div class="ui">${ICON[U.sym] || ICON.inf}</div><div class="un">${U.name}</div><div class="us">${costStr(sim.unitCost(P, t))}</div><div class="us">${U.pop}k men · ${U.days}d${U.needs.length ? ' · ' + U.needs.map(k => RES[k].icon).join('') : ''}</div></div>`;
    }).join('')}</div>
    <div class="small muted" style="margin-top:6px">${T.name}: attack ${fmt(T.atk)}, defense ${fmt(T.def)}, ${T.hp} hp, range ${T.domain === 'air' ? T.radius : T.range} km, speed ${T.speed}${T.domain === 'air' ? ' km/h' : ' km/day'}.${T.ocean ? ' Ocean-going.' : T.domain === 'sea' ? ' Coastal waters only.' : ''}${T.lift ? ` Carries ${T.lift} units.` : ''}</div>
    <div class="sec-title" style="margin-top:14px">Quantity</div>
    <div class="qty"><button class="btn sm" data-q="-5">−5</button><button class="btn sm" data-q="-1">−1</button><input class="inp" id="w-qty" type="number" min="1" max="200" value="${WAR.qty}"><button class="btn sm" data-q="1">+1</button><button class="btn sm" data-q="5">+5</button>${[3, 6, 10, 20].map(n => `<button class="btn sm ${WAR.qty === n ? 'on' : ''}" data-qs="${n}">${n}</button>`).join('')}</div>
    <div class="sec-title" style="margin-top:14px">Where</div>
    <div class="actions">
      <select class="inp" id="w-site"><option value="auto" ${WAR.site === 'auto' ? 'selected' : ''}>Spread across all sites (fastest)</option><option value="near" ${WAR.site === 'near' ? 'selected' : ''}>Near the selected tile${G.region !== null && G.region !== undefined ? ` (${w.regions[G.region].name})` : ''}</option>${sites.sort((a, b) => w.regions[a.i].name.localeCompare(w.regions[b.i].name)).map(r => `<option value="${r.i}" ${WAR.site === String(r.i) ? 'selected' : ''}>Only at ${w.regions[r.i].name} (${sim.lines(r, T.domain)} line${sim.lines(r, T.domain) > 1 ? 's' : ''}, ${popStr(r.pop)})</option>`).join('')}</select>
      <select class="inp" id="w-rally"><option value="" ${!WAR.rally ? 'selected' : ''}>Stay where raised</option><option value="sel" ${WAR.rally === 'sel' ? 'selected' : ''}>Rally to the selected tile</option></select>
      <select class="inp" id="w-group"><option value="">No army group</option>${groups.map(g => `<option value="${g.id}" ${String(WAR.group) === String(g.id) ? 'selected' : ''}>Join ${esc(g.name)}</option>`).join('')}</select><span></span>
    </div>
    <div class="sumbox" style="margin-top:12px">${pv && pv.ok ? `<div class="big2">${WAR.qty}× ${T.name}</div>
      <div class="grid2" style="margin-top:6px"><span>Total cost</span><span>${costStr(pv.cost)}</span><span>Men drawn from the towns</span><span>${popStr(pv.pop)}</span><span>All ready in about</span><span>${pv.eta} days</span><span>Added upkeep</span><span>${costStr(Object.fromEntries(Object.entries(T.upkeep).map(([k, v]) => [k, v * WAR.qty])))}/day</span></div>
      <div class="small muted" style="margin:6px 0">${Object.entries(pv.per).map(([i, n]) => `${n} at ${w.regions[+i].name}`).join(' · ')}</div>
      <div class="small muted" style="margin-bottom:6px">Each unit is paid for, and its men leave their town, when its production line starts.</div>
      <button class="btn go" id="w-order" style="width:100%;padding:10px">Raise ${WAR.qty} ${T.name}</button>` : `<div class="warn-text">${pv ? esc(pv.why) : 'Choose a quantity.'}</div>`}</div>
    <div class="sec-title" style="margin-top:14px">Formations</div>
    <div class="pkgs">${PACKAGES.map((p, k) => {
      const parts = Object.entries(p.mix).map(([l, n]) => [bestOf(N, l), n]).filter(([t]) => t);
      if (parts.length < Object.keys(p.mix).length) return '';
      const ok = parts.every(([t]) => sim.canField(P, t).ok && sim.sitesFor(P, t).length);
      return `<button class="btn pkg" data-pkg="${k}" ${ok ? '' : 'disabled title="Missing a resource, harbor or airfield"'}>${p.name}<small>${parts.map(([t, n]) => `${n} ${UNITS[t].name}`).join(' + ')} · ${p.desc}</small></button>`;
    }).join('')}</div>
  </div><div>
    <div class="sec-title">Musters</div>`;
  const allSites = sim.regionsOf(P).filter(r => r.lvl >= 1).sort((a, b) => (b.bld.barracks || 0) + (b.bld.harbor || 0) - (a.bld.barracks || 0) - (a.bld.harbor || 0) || b.pop - a.pop).slice(0, 14);
  for (const r of allSites) for (const D of ['land', 'sea', 'air']) {
    const L = sim.lines(r, D); if (!L) continue;
    const qs = N.queue.filter(q => q.region === r.i && UNITS[q.type].domain === D);
    if (D !== 'land' && !qs.length && L < 1) continue;
    const building = qs.filter(q => q.status === 'building').length, stalled = qs.filter(q => q.status !== 'building' && q.status !== 'queued').length;
    h += `<div class="siterow"><span>${w.regions[r.i].name} <span class="muted small">${D === 'land' ? 'muster' : D === 'sea' ? 'shipyard' : 'airfield'}</span></span><span class="lineset">${Array.from({ length: L }, (_, k) => `<i class="${k < building ? 'b' : k < building + stalled ? 'f' : ''}"></i>`).join('')}</span><span class="muted small">${qs.length ? `${qs.length} · ${Math.ceil(sim.siteBacklog(P, r, D))}d` : 'idle'}</span></div>`;
  }
  h += `<div class="small muted" style="margin-top:6px">Barracks add muster lines; harbors build ships; airfields build aircraft.</div><div class="sec-title" style="margin-top:14px">Orders (${N.queue.length})</div>`;
  const shown = N.queue.slice(0, 60);
  const ST = { funds: 'Awaiting supplies', manpower: 'Not enough men', resource: 'Missing resource', queued: 'Queued' };
  h += shown.map((q, k) => `<div class="qitem"><span>${UNITS[q.type].name} <span class="muted small">· ${w.regions[q.region].name}</span></span><span class="st ${q.status === 'building' ? 'building' : q.status === 'queued' ? 'queued' : 'funds'}">${ST[q.status] || Math.ceil(q.left / Math.max(0.05, sim.siteRate(P, s.regions[q.region]))) + 'd'}</span><button class="btn sm danger" data-cq="${k}">✕</button></div>`).join('') || '<div class="muted small">Nothing ordered.</div>';
  if (N.queue.length > 60) h += `<div class="small muted">…and ${N.queue.length - 60} more.</div>`;
  if (N.queue.length) h += `<button class="btn sm danger" id="w-clear" style="margin-top:8px">Cancel all unstarted orders</button>`;
  h += `</div></div>`;
  $('#war-card').innerHTML = h;
  const card = $('#war-card');
  $('#w-close').onclick = closeWar;
  for (const e of card.querySelectorAll('[data-ul]')) e.onclick = () => { WAR.line = e.dataset.ul; renderWar(); };
  for (const e of card.querySelectorAll('[data-q]')) e.onclick = () => { WAR.qty = Math.max(1, Math.min(200, WAR.qty + +e.dataset.q)); renderWar(); };
  for (const e of card.querySelectorAll('[data-qs]')) e.onclick = () => { WAR.qty = +e.dataset.qs; renderWar(); };
  $('#w-qty').onchange = e => { WAR.qty = Math.max(1, Math.min(200, Math.round(+e.target.value || 1))); renderWar(); };
  $('#w-site').onchange = e => { WAR.site = e.target.value; renderWar(); };
  $('#w-rally').onchange = e => { WAR.rally = e.target.value || null; renderWar(); };
  $('#w-group').onchange = e => { WAR.group = e.target.value || null; renderWar(); };
  const ob = $('#w-order');
  if (ob) ob.onclick = () => { const r = sim.orderUnits(P, type, WAR.qty, warOpts()); if (r.ok) toast('War council', `${WAR.qty}× ${T.name} ordered. Ready in about ${r.eta} days.`, 'good'); else toast('War council', r.why, 'warn'); renderWar(); };
  for (const e of card.querySelectorAll('[data-pkg]')) e.onclick = () => {
    const p = PACKAGES[+e.dataset.pkg]; let eta = 0;
    for (const [l, n] of Object.entries(p.mix)) { const r = sim.orderUnits(P, bestOf(N, l), n, warOpts()); if (r.ok) eta = Math.max(eta, r.eta); }
    toast('War council', `${p.name} ordered. Ready in about ${eta} days.`, 'good'); renderWar();
  };
  for (const e of card.querySelectorAll('[data-cq]')) e.onclick = () => { sim.cancelOrder(P, shown[+e.dataset.cq]); renderWar(); };
  const cl = $('#w-clear'); if (cl) cl.onclick = () => { for (const q of [...N.queue]) if (!q.paid) sim.cancelOrder(P, q); renderWar(); };
}

// ======================================================================= council meetings
export function cabinetReady() { const N = G.sim?.s.nations[G.sim.s.player]; return !!N && (N.lastCabinet === undefined || G.sim.s.t - N.lastCabinet >= MEETING_COOLDOWN_DAYS * 24); }
export function openCabinet() {
  if (!G.sim) return;
  const sim = G.sim, N = sim.s.nations[sim.s.player];
  const r = convene(sim, G.ai, N);
  if (!r.ok) { toast('Council', r.why, 'warn'); return; }
  G.meeting = { agenda: r.agenda, y: sim.s.year };
  G.meetResume = G.speed; G.fn.setSpeed(0);
  renderMeeting();
  $('#cabinetbox').classList.remove('hidden');
}
export function closeCabinet() {
  $('#cabinetbox').classList.add('hidden');
  const a = G.meeting?.agenda || [];
  const ok = a.filter(p => p.status === 'approved' && p.kind !== 'info').length, no = a.filter(p => p.status === 'denied').length;
  if (a.length) G.sim.emit('gov', `The council adjourns: ${ok} proposal(s) approved, ${no} denied.`, [G.sim.s.player]);
  G.meeting = null;
  if (G.meetResume) G.fn.setSpeed(G.meetResume);
  renderPanel(true); G.fn.refreshWorld(false); G.fn.computeStacks();
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
  let h = `<div class="meet-head"><div><div class="kicker">${dstr(G.meeting.y)} · ${esc(styleName(N))}</div><h2>The council meets</h2><div class="small muted">Each counsellor brings proposals from their own judgment. Their advice is only as good as they are. Stores ${costStr({ food: N.food, wood: N.wood, stone: N.stone, metal: N.metal, wealth: N.wealth })} · influence ${Math.floor(N.gov.pc)}.</div></div>
    <div style="display:flex;gap:8px"><button class="btn" id="m-all" ${pend ? '' : 'disabled'}>Approve all (${pend})</button><button class="btn go" id="m-close">Adjourn</button></div></div><div class="meet-grid">`;
  for (const role of CABINET) {
    const ch = s.chars[N.gov.cabinet[role]]; if (!ch) continue;
    const props = a.filter(p => p.role === role);
    const conf = confidence(ch);
    h += `<div class="minister"><div class="mh">${avatar(ch, N.color)}<div><div class="mn">${esc(ch.name)}</div><div class="mr">${esc(roleTitle(role, N.age))} · <span class="stars">${stars(ch.skill)}</span> ${traitChips(ch)}</div></div><span class="conf ${conf.split(' ')[0]}">${conf}</span></div>`;
    if (!props.length) h += `<div class="none">“Nothing in my charge needs your word.”</div>`;
    for (const p of props) {
      const cost = [p.cost ? costStr(p.cost) : '', p.pc ? `${p.pc} influence` : ''].filter(Boolean).join(' · ');
      h += `<div class="prop ${p.status}"><div class="pt">${p.kind === 'info' ? 'Report: ' : ''}${esc(p.title)}</div><div class="pw">${esc(p.why)}</div>${cost ? `<div class="pc">Cost: ${cost}</div>` : ''}`;
      if (p.status === 'pending') h += p.kind === 'info' ? `<div class="pa"><button class="btn sm" data-ack="${p.id}">Noted</button></div>` : `<div class="pa"><button class="btn sm go" data-yes="${p.id}">Approve</button><button class="btn sm danger" data-no="${p.id}">Deny</button></div>`;
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
  for (const b of document.querySelectorAll('#meet-card [data-ack]')) b.onclick = () => { const p = find(b.dataset.ack); p.status = 'approved'; p.result = 'Noted.'; renderMeeting(); };
  $('#m-all').onclick = () => { for (const p of a) if (p.status === 'pending' && p.kind !== 'info') decide(p, true); renderMeeting(); };
  $('#m-close').onclick = closeCabinet;
}

// ======================================================================= tree of knowledge
export function queueTech(N, id) {
  const R = N.research, out = [];
  const add = x => { if (N.techs[x] || out.includes(x) || R.queue.includes(x) || R.cur === x) return; for (const q of TECH[x].req) add(q); out.push(x); };
  add(id); R.queue.push(...out.filter(x => TECH[x].age <= N.age));
  if (!R.cur && R.queue.length) R.cur = R.queue.shift();
}
export function closeTree() { $('#techtree').classList.add('hidden'); renderPanel(true); }
export function openTree() {
  const sim = G.sim, N = sim.s.nations[sim.s.player], R = N.research;
  if (G.treeAge === null || G.treeAge === undefined) G.treeAge = N.age;
  const render = () => {
    const a = G.treeAge;
    let h = `<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:12px"><div><div class="kicker">Tree of knowledge · ${Object.keys(N.techs).length} of ${TECHS.length} known</div><div style="font-size:22px;font-weight:800;color:var(--text-hi)">${AGES[a].name}</div><div class="small muted">${esc(AGES[a].blurb)} ${fmt(N.st.rp)} learning per day. Click a technology to study it, or a locked one to queue it with its prerequisites.</div></div><button class="btn" id="closetree">Close</button></div>
      <div class="agetabs">${AGES.map((A, k) => { const L = AGE_TECHS[k]; const have = L.filter(x => N.techs[x.id]).length; return `<button class="agetab ${k === a ? 'on' : ''} ${k > N.age ? 'future' : ''}" data-age="${k}" style="--ac:${A.color}">${A.short}<small>${have}/${L.length}</small></button>`; }).join('')}</div><div class="tree">`;
    for (const b of BRANCHES) {
      const list = TECHS.filter(x => x.branch === b.id && x.age === a);
      h += `<div><div class="col-h" style="background:color-mix(in srgb, ${b.color} 18%, transparent);color:${b.color}">${b.name}</div>`;
      for (const t of list) {
        const st = N.techs[t.id] ? 'done' : canResearch(N, t.id) ? 'avail' : 'locked';
        const cost = sim.techCostFor(N, t.id);
        h += `<div class="tnode ${st} ${R.cur === t.id ? 'cur' : ''} ${R.queue.includes(t.id) ? 'queued' : ''}" style="--bc:${b.color}" data-t="${t.id}" title="${esc(t.desc + (t.req.length ? ' Requires: ' + t.req.map(q => TECH[q].name).join(', ') : ''))}"><span class="tc">${fmt(cost)}</span><div class="tn">${t.name}</div><div class="td">${esc(t.desc)}</div><div class="td">${unlockText(t.id)}</div>${R.cur === t.id ? `<div class="prog"><i style="width:${Math.min(100, R.prog / cost * 100)}%"></i></div>` : ''}</div>`;
      }
      h += '</div>';
    }
    h += '</div>';
    $('#tree-card').innerHTML = h;
    $('#closetree').onclick = closeTree;
    for (const b of document.querySelectorAll('.agetab')) b.onclick = () => { G.treeAge = +b.dataset.age; render(); };
    for (const n of document.querySelectorAll('.tnode')) n.onclick = () => {
      const id = n.dataset.t; if (N.techs[id]) return;
      if (TECH[id].age > N.age) { toast('Learning', `${TECH[id].name} belongs to the ${AGES[TECH[id].age].name}. Advance first.`, 'warn'); return; }
      if (canResearch(N, id)) { if (R.cur && R.cur !== id) R.queue.unshift(R.cur); R.cur = id; R.queue = R.queue.filter(x => x !== id); }
      else queueTech(N, id);
      render();
    };
  };
  render();
  $('#techtree').classList.remove('hidden');
}

// ======================================================================= narrative events
G.fn.showEvent = function showEvent(ev) {
  const sim = G.sim, N = sim.s.nations[sim.s.player];
  if (N.delegateEvents) {
    const k = ev.options.length - 1;
    const out = resolveEvent(sim, N, ev, k); sim.s.pendingEvent = null;
    toast('Council decision', `${ev.title}: ${ev.options[k]}. ${out}`, '');
    return;
  }
  if (G.pauseOnEvents && G.speed) { G.prevSpeed = G.speed; G.fn.setSpeed(0); G.resumeAfterEvent = true; }
  $('#event-card').innerHTML = `<div class="ek">${dstr()} · ${esc(roleTitle('interior', N.age))}'s report</div><h3>${esc(ev.title)}</h3><p>${esc(ev.text)}</p><div class="eo">${ev.options.map((o, k) => `<button class="btn" data-o="${k}">${esc(o)}</button>`).join('')}</div>`;
  $('#eventbox').classList.remove('hidden');
  for (const b of document.querySelectorAll('#event-card [data-o]')) b.onclick = () => {
    const out = resolveEvent(sim, N, ev, +b.dataset.o);
    sim.s.pendingEvent = null;
    $('#eventbox').classList.add('hidden');
    toast(ev.title, out, 'good');
    if (G.resumeAfterEvent) { G.fn.setSpeed(G.prevSpeed || 2); G.resumeAfterEvent = false; }
    renderPanel(true);
  };
};

// ======================================================================= game over
G.fn.gameOver = function gameOver() {
  G.fn.setSpeed(0);
  const sim = G.sim, s = sim.s; const won = s.winner === s.player;
  const how = { conquest: 'rules the world', science: 'reaches the stars', score: 'is judged the greatest civilization in history', defeat: '' }[s.winType] || 'prevails';
  $('#modal-card').innerHTML = `<div class="kicker">${won ? 'Victory' : 'The end of an era'}</div>
    <h1>${s.winner ? `The <span>${esc(sim.full(s.winner))}</span> ${how}` : `The ${esc(sim.full(s.player))} has fallen`}</h1>
    <p class="muted">${dstr()} · your score ${sim.score(s.player)}</p>
    <div class="modal-foot">${s.nations[s.player].alive ? '<button class="btn" id="go-cont">Keep playing</button>' : ''}<button class="btn go" id="go-new">New world</button></div>`;
  $('#modal').classList.remove('hidden');
  $('#go-new').onclick = () => G.fn.showSetup();
  if ($('#go-cont')) $('#go-cont').onclick = () => { s.over = false; s.victory.conquest = 0; s.victory.score = false; s.victory.science = false; $('#modal').classList.add('hidden'); };
};

// ======================================================================= manual
export function showManual(fromSetup) {
  $('#modal-card').innerHTML = `<div class="kicker">The chronicler's guide</div><h1>How to <span>rule</span></h1><div class="manual">
    <h3>An empty world</h3><p>You begin as one tribe among many on an unclaimed Earth. Every land tile has a terrain, a fertility, and resource deposits placed where they really are: tin in Cornwall and Malaya, horses on the steppe, silk in China. Hidden deposits (copper, iron, coal, oil, uranium, rare earths) reveal themselves as you learn. Native peoples live in the wilds.</p>
    <h3>Claiming land</h3><p>Select an unclaimed tile next to your lands and <b>Send settlers</b>. It costs food and wood, and people leave your nearest town. Natives on the tile join your people. With <b>Rafts</b> you can settle across coastal waters, and with <b>Navigation</b> across the deep ocean. Or mark native lands for conquest and march warriors in to subdue them.</p>
    <h3>Working the land</h3><p>Every tile gathers a little by itself. Build <b>improvements</b> to work it: farms, pastures, hunting camps, fisheries, lumber mills, quarries, mines, plantations and oil wells. Each level needs workers, so a tile's population limits what it can work. Strategic resources (obsidian, horses, camels, elephants, copper, tin, iron, saltpeter, coal, oil, natural gas, aluminum, phosphate, uranium, rare earths, lithium, cobalt) count only when a worked improvement taps them, and many units need them. Luxuries make your people happier. Trade for what you lack.</p>
    <h3>Settlements</h3><p>Camps grow into villages, towns, cities, metropolises and megalopolises as your people learn and multiply. Bigger settlements house more people, make more wealth and learning, and allow greater buildings: granaries, temples, walls, barracks, harbors, markets, libraries, workshops and much more. Wonders of the world can be built only once.</p>
    <h3>Ten ages</h3><p>From the <b>Stone Age</b> to the <b>Information Age</b>, ${TECHS.length} technologies in seven branches. Once you know about two thirds of an age's technologies, pay the cost to advance to the next. Knowledge spreads: technologies your neighbours know are cheaper. Each age brings new units, buildings, laws and governments. Your armies keep their old weapons until you refit them.</p>
    <h3>Rule</h3><p>Governments evolve from the Tribal Council to Chiefdoms, Theocracies, Monarchies, Republics, Empires, feudal kingdoms, democracies, one-party states and technocracies. Laws, counsellors and their titles change with the age. Hold the right lands to proclaim a <b>Destiny</b>: Egypt, Akkad, Persia, Rome, Han China, the Caliphate, the Mongols, the Inca, the British Empire, or any modern nation.</p>
    <h3>Peoples and faiths</h3><p>Every land has a <b>people</b> and a <b>faith</b>. Conquered and native peoples keep their own ways and slowly assimilate; governors, schools and your <b>Cultural Policy</b> speed this up. Folk beliefs give way to organized pantheons, philosophies and world religions, which rulers found as they learn (Organized Religion, Philosophy, Monotheism, the Reformation) and which spread from land to land. Each faith has a holy city. Lands of another people or faith are restless; faith also colors diplomacy, and holy cities held by unbelievers can start holy wars. See the <b>Society</b> tab and the <b>Culture</b>, <b>Faith</b> and <b>Unrest</b> map lenses.</p>
    <h3>Provinces, governors and mayors</h3><p>Your lands fall into historical provinces. With the Code of Laws you can appoint a <b>governor</b> to each: skilled governors calm unrest and raise output, corrupt ones skim the taxes, and ambitious ones in a failing state may crown themselves. Towns and cities take <b>mayors</b>; democracies elect them. You can grant a province <b>autonomy</b>: it becomes a self-ruling vassal state under your protection.</p>
    <h3>Unrest, revolts and movements</h3><p>Famine, blackouts, unpopular rule, foreign peoples, other faiths and occupation all push unrest up; governors, garrisons and the police push it down. Sustained high unrest breaks into open <b>revolt</b>: station land units on the tile to crush it, or within a month the land breaks away, or returns to its old rulers if it was occupied (an <b>insurgency</b>). Restless minorities organize <b>separatist</b> and <b>sectarian</b> movements, and unpopular regimes breed <b>revolutionaries</b>; a revolution in the capital topples the government. Answer them with a crackdown, concessions or autonomy. In the Modern Age, militants strike cities with <b>terror attacks</b>; intelligence agencies and counter-terrorism reduce them. Rivals can fund insurgents against you, and you against them.</p>
    <h3>Reputation and pacts</h3><p>The world remembers what you do. Break a treaty or abandon an ally and you become an <b>oathbreaker</b>; answer every call to arms and you are a <b>steadfast ally</b>. Holy wars and state religion make a <b>religious zealot</b>, admired by your own faith and feared by every other. Trade, peacemaking, ultimatums, sharing knowledge and wars of choice all earn reputations too (see Realm), and every people judges them by its own lights. Reputations fade unless renewed.</p><p>From the Diplomacy tab you can <b>found a pact</b>: a defensive league, an assembly of nations, a merchant league, a holy covenant or a scholars' union, under a name of your choosing. Its <b>doctrines</b> decide what membership means: an attack on one is an attack on all; no war among members; a common market; shared learning; one faith; collective embargoes; and <b>parliamentary sessions</b>, where every season the members vote on the questions of the world (condemning or sanctioning an aggressor, collective intervention, calls for peace, famine relief, admitting or expelling members). As chair you choose the motion; as a member you cast your vote, and members remember who voted with them. Other peoples found pacts of their own and may invite you. The Pacts map mode shows who stands with whom.</p><h3>The strain of empire</h3><p>Your state can only govern so many lands. <b>Administrative capacity</b> grows with laws, roads, bureaucracy, the form of government and every governor you appoint; beyond it, unrest, corruption and falling approval spread through the realm. Every land you gain also raises your <b>pace of expansion</b>, which cools over months: blitz across a continent and every province grows restless at once. New lands, conquered lands and lands far from the capital stay restless for a while. Conquest, ultimatums and wars of choice earn <b>infamy</b>; when it runs high, frightened neighbours form a <b>coalition</b> and march together. Vassals let you rule more without the strain.</p>
    <h3>Crises</h3><p>Pandemics spread from city to city and along trade routes (quarantine slows them). Earthquakes, floods, droughts, storms and eruptions strike real-world hotspots. Industrial economies can crash into depression, and a little ice age can shrink harvests. When a monarch dies the succession may be disputed, and a civil war can split the realm. Choose a <b>scenario</b> at the start for a harder world: Rising Empires, Underdog, or the Age of Chaos.</p>
    <h3>Armies</h3><p>Select an army and use <b>Split ½ ⅓ ¼</b> on the selection bar to divide it into even detachments, each with a fair share of every unit type. Click a detachment's badge to command it on its own; <b>Merge</b> rejoins everything on the tile.</p>
    <h3>Council and war council</h3><p>Press <b>C</b> to convene your council for proposals, or give them standing orders in Command. Press <b>R</b> to raise units in bulk. Units cost resources and men from your towns.</p>
    <h3>Time</h3><p>Time flows continuously. Pause with <b>Space</b> and change speed with <b>1</b>–<b>5</b>. Speed 5 lets centuries fly by. Each age takes much longer to master than the last.</p>
    <h3>Victory</h3><p>Rule the chosen share of the world's land, be the first to launch the Interstellar Colony Ship, or be the greatest civilization when the year 2100 arrives.</p>
    <h3>Controls</h3><ul><li>Left-drag rotates and scroll zooms. Zoom in to see settlements and resources.</li><li>Click a tile or unit. <b>Shift-drag</b> box-selects your units, and <b>right-click</b> moves them.</li><li><b>Esc</b> clears the selection. <b>H</b> returns to your capital. <b>N</b> (or Day/Night on the map bar) turns the day and night cycle on or off.</li></ul>
  </div><div class="modal-foot"><button class="btn go" id="man-close">${fromSetup ? '&#9666; Back' : 'Close'}</button></div>`;
  $('#modal').classList.remove('hidden');
  $('#man-close').onclick = () => fromSetup ? G.fn.showSetup() : $('#modal').classList.add('hidden');
}
void LINES; void ROLES; void pct;
