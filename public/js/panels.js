// Side panel tabs.
import { AGES, ageScale } from './eras.js';
import { UNITS, LINES, LINE_ORDER, bestOf, SETTLEMENTS, BUILDINGS, BUILD_ORDER, WONDERS } from './units.js';
import { TERRAIN, RES, IMPROVEMENTS, IMP_ORDER, IMP_CAP, STRATEGIC, LUXURIES, known } from './resources.js';
import { TECHS, TECH, BRANCHES, canResearch, ageProgress, AGE_TECHS, ADVANCE_SHARE, MODERN_BRANCH } from './tech.js';
import { GOV_TYPES, LAWS, ROLES, CABINET, TRAITS, computeMods, lawOpt, lawVisible, canEnact, enact, reform, reformCost, appoint, hireCost, lawCost, govAvailable, styleName, roleTitle, charTitle } from './gov.js';
import { formProgress } from './formables.js';
import { GOODS } from './sim.js';
import { TRADE_WILL, TRADE_FLOOR, addTradeGoal } from './ai.js';
import { G, $, esc, fmt, sgn, pct, popStr, toast, dstr, dropToast, setHTML, pips, stars, avatar, costStr, STOCK_ICON, STOCK_NAME, ordinal } from './ui.js';
import { openWar, openCabinet, cabinetReady, openTree, queueTech } from './dialogs.js';
import { renderSociety, tileSocietyHTML } from './society-ui.js';
import { plagueStatus } from './crises.js';
import { lineOptions } from './units.js';
import { repChips, repSection, pactsListHTML, bindPactsList, renderPactPage, answeredCall, applyPactProposal } from './pacts-ui.js';
import { repOpinion, pactsOf, canJoin, invite, pactMods } from './pacts.js';
import { BUDGET, BUDGET_BASE, budgetMods } from './modern.js';
import { warHTML, bindWar, ww2RnD } from './ww2-ui.js';

const REL_LABEL = { war: 'At war', peace: 'Peace', nap: 'Non-aggression', alliance: 'Alliance' };
const traitChips = c => c.traits.map(t => `<span class="trait ${['Corrupt', 'Ambitious'].includes(t) ? 'bad' : ''}" title="${esc(TRAITS[t]?.desc || '')}">${t}</span>`).join('');
const btnCost = (chk, label, attrs) => `<button class="btn sm" ${attrs} ${chk.ok ? '' : `disabled title="${esc(chk.why || '')}"`}>${label}${chk.cost ? ` · ${costStr(chk.cost)}` : ''}${chk.days ? ` · ${chk.days}d` : ''}</button>`;
const why = chk => chk.ok ? '' : `<div class="small muted">${esc(chk.why || '')}</div>`;

// ======================================================================= tabs
const TABS = ['tile', 'realm', 'forces', 'command', 'gov', 'society', 'research', 'diplomacy', 'world'];
export function switchTab(t) {
  G.tab = t;
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === t);
  for (const k of TABS) $('#tab-' + k).classList.toggle('hidden', k !== t);
  renderPanel(true);
}
export function renderPanel(force) {
  if (!G.sim) return;
  const host = $('#tab-' + G.tab);
  if (force) host._html = null;
  if (!force) {
    if (G.pointerDown) return;
    const a = document.activeElement;
    if (host.contains(a) && ['INPUT', 'SELECT'].includes(a.tagName)) return;
  }
  const scroll = host.scrollTop;
  ({ tile: renderTile, realm: renderRealm, forces: renderForces, command: renderCommand, gov: renderGov, society: renderSociety, research: renderAges, diplomacy: renderDiplomacy, world: renderWorld })[G.tab](host);
  for (const b of host.querySelectorAll('[data-convene]')) b.onclick = openCabinet;
  for (const b of host.querySelectorAll('[data-openwar]')) b.onclick = () => openWar(b.dataset.region !== undefined ? +b.dataset.region : undefined);
  for (const b of host.querySelectorAll('[data-goto]')) b.onclick = e => { e.stopPropagation(); G.fn.flyTile(+b.dataset.goto); G.fn.selectRegion(+b.dataset.goto); };
  for (const b of host.querySelectorAll('[data-dossier]')) b.onclick = e => { e.stopPropagation(); openDossier(b.dataset.dossier); };
  host.scrollTop = scroll;
  const n = G.sim.s.messages.filter(m => m.to === G.sim.s.player && m.unread).length;
  $('#unread').textContent = n; $('#unread').classList.toggle('hidden', !n);
}
export function renderTicker() {
  const ev = G.sim.s.events.filter(e => !['loss', 'build'].includes(e.kind) && (e.major || e.nations?.includes(G.sim.s.player) || G.sim.s.nations[G.sim.s.player].known.some(c => e.nations?.includes(c)))).slice(-14).reverse();
  $('#tk-text').innerHTML = ev.map(e => `<span><b>${dstr(e.y)}</b>${esc(e.text)}</span>`).join('') || '<span>The world is quiet.</span>';
}

// ======================================================================= land
function renderTile(host) {
  const sim = G.sim, s = sim.s, i = G.region, P = s.player, N = s.nations[P];
  if (i === null || i === undefined) { setHTML(host, '<p class="muted">Select a tile on the globe.</p>'); return; }
  const R = G.world.regions[i], r = s.regions[i], T = sim.T[i];
  let h = '';
  const here = s.units.filter(u => u.loc === i && !G.fn.airborne(u));
  if (R.sea) {
    h += `<div class="card"><div class="big">${esc(R.name)}</div><div class="sub">${R.deep ? 'Deep ocean · only ocean-going ships (Age of Discovery) can cross' : 'Coastal waters · boats and early ships can sail here'}</div></div>`;
    const lanes = s.trades.filter(t => t.path.includes(i));
    h += `<div class="sec"><div class="sec-title">Trade routes</div>${lanes.length ? lanes.map(t => `<div class="row"><span>${esc(sim.nm(t.from))} &rarr; ${esc(sim.nm(t.to))}</span><span class="${t.blockaded ? 'neg' : 'muted'}">${t.good.startsWith('res:') ? RES[t.good.slice(4)].name : fmt(t.amount) + ' ' + t.good}${t.blockaded ? ' · blockaded' : ''}</span></div>`).join('') : '<div class="muted small">No trade passes through these waters.</div>'}</div>`;
  } else {
    const mine = r.owner === P, O = r.owner && s.nations[r.owner];
    const Ter = TERRAIN[T.terrain];
    h += `<div class="card"><div class="big">${esc(R.name)}${O && O.capital === i ? ' <span class="small" style="color:var(--gold)">★ capital</span>' : ''}</div>
      <div class="sub">${O ? `<span class="flagchip" style="background:${O.color}"></span>${esc(sim.full(r.owner))}` : 'Unclaimed wilderness'}${r.core && r.core !== r.owner ? ` · <span class="warn-text">occupied (${esc(sim.nm(r.core))})</span>` : ''}</div>
      <div class="terrain"><span class="tchip" style="--tc:${Ter.color}">${Ter.name}</span>${T.river ? '<span class="tchip" style="--tc:#5aa7e0">River</span>' : ''}${T.coastal ? '<span class="tchip" style="--tc:#5cc8d6">Coast</span>' : ''}<span class="tchip">Fertility ${pct(T.fert)}</span><span class="tchip">Defense +${Math.round(Ter.def * 60)}%</span>${R.country ? `<span class="tchip ghost" title="The modern country here">${esc(R.country)}</span>` : ''}</div></div>`;
    if (r.capture) h += `<div class="card" style="border-color:rgba(255,93,93,.5)"><div class="warn-text">${r.owner ? 'Under siege' : 'Being subdued'} by the ${esc(sim.nm(r.capture.by))}</div><div class="prog"><i style="width:${pct(r.capture.p)};background:var(--red)"></i></div></div>`;
    const siege = siegeStatus(i); if (siege) h += `<div class="sec"><div class="sec-title">Campaign</div>${siege}</div>`;
    // ---- unclaimed land: settle or subdue
    if (!r.owner) {
      h += `<div class="sec"><div class="sec-title">Settle this land</div>`;
      h += `<div class="grid2"><span>Native peoples</span><span>${(r.natives || 0) > 0.05 ? popStr(r.natives) : 'none'}</span><span>Habitability</span><span>${pct(Math.min(1.6, T.hab) / 1.6)}</span></div>`;
      if (r.claim) {
        h += `<div class="row" style="margin-top:6px"><span>Settlers of the ${esc(sim.nm(r.claim.by))} are on their way</span><span class="muted">${Math.ceil(r.claim.left)}d</span></div><div class="prog"><i style="width:${pct(1 - r.claim.left / r.claim.total)}"></i></div>`;
        if (r.claim.by === P) h += `<button class="btn sm danger" data-cancelclaim="1" style="margin-top:6px">Recall settlers</button>`;
      } else {
        const chk = sim.canClaim(P, i);
        h += `<div style="margin-top:8px">${btnCost(chk, `Send settlers (${chk.settlers ?? '?'}k people)`, 'data-claim="1"')}</div>${why(chk)}`;
        if ((r.natives || 0) > 0.25) h += `<div class="small muted" style="margin-top:6px">The natives (${popStr(r.natives)}) join your people when you settle here. Settling costs more where they are numerous.</div>`;
      }
      if ((r.natives || 0) >= 0.25) {
        const marked = (N.subjugate || []).includes(i);
        h += `<div class="row" style="margin-top:8px"><span>Subdue by force <span class="small muted">(tribal strength ${sim.garrison(r).toFixed(1)})</span></span><button class="btn sm ${marked ? 'on' : 'danger'}" data-subdue="1">${marked ? 'Marked for conquest' : 'Mark for conquest'}</button></div><div class="small muted">Marked lands are attacked by any of your troops standing on them. Survivors join your realm with heavy unrest. No settlers or supplies needed.</div>`;
      }
      h += '</div>';
    }
    // ---- deposits
    const deps = r.dep.filter(d => known(N, d.r));
    h += `<div class="sec"><div class="sec-title">Resources</div>${deps.length ? `<div class="deps">${deps.map(d => { const Rs = RES[d.r]; const worked = r.owner && (r.imp[Rs.imp] || 0) > 0; return `<div class="dep ${Rs.kind} ${worked ? 'on' : ''}" title="${Rs.kind}: worked by ${IMPROVEMENTS[Rs.imp].name}"><span class="di">${Rs.icon}</span><span><b>${Rs.name}</b>${'•'.repeat(d.amt)}<br><small>${Rs.kind}${worked ? ' · worked' : ` · needs ${IMPROVEMENTS[Rs.imp].name.toLowerCase()}`}</small></span></div>`; }).join('')}</div>` : '<div class="muted small">No known resources. New technologies reveal hidden deposits.</div>'}</div>`;
    h += tileSocietyHTML(i);
    if (mine) {
      // ---- settlement
      const cap = sim.housing(r, N);
      const y = sim.tileYield(r, N);
      h += `<div class="sec"><div class="sec-title">${SETTLEMENTS[r.lvl].name}</div>
        <div class="grid2"><span>Population</span><span>${popStr(r.pop)} / ${popStr(cap)}</span></div><div class="meter"><i style="width:${pct(Math.min(1, r.pop / cap))};background:var(--teal)"></i></div>
        <div class="yields">${[['food', y.food], ['wood', y.wood], ['stone', y.stone], ['metal', y.metal], ['wealth', y.wealth], ['oil', y.oil]].filter(([, v]) => v > 0.005).map(([k, v]) => `<span title="${STOCK_NAME[k]} per day">${STOCK_ICON[k]} ${fmt(v)}</span>`).join('')}<span title="Learning per day">📜 ${fmt(y.rp)}</span><span title="Food eaten per day" class="neg">🍽 ${fmt(r.pop * 0.05)}</span></div>
        <div class="grid2" style="margin-top:4px"><span>Workers on improvements</span><span class="${y.labor < 0.8 ? 'neg' : ''}">${pct(y.labor)}</span><span>Unrest</span><span class="${r.unrest > 0.3 ? 'neg' : ''}">${pct(r.unrest)}</span>${r.damage > 0.02 ? `<span>War damage</span><span class="neg">${pct(r.damage)}</span>` : ''}<span>Garrison</span><span>${sim.garrison(r).toFixed(1)}</span></div>`;
      if (r.build) h += `<div class="work"><div class="row"><span class="hi">${esc(sim.workName(r.build))}</span><span class="muted">${Math.ceil(r.build.left / Math.max(0.05, sim.buildRate(r, N)))}d</span></div><div class="prog"><i style="width:${pct(1 - r.build.left / r.build.total)}"></i></div><button class="btn sm danger" data-cancelwork="1" style="margin-top:4px">Cancel (75% refund)</button></div>`;
      else if (SETTLEMENTS[r.lvl + 1]) { const chk = sim.canUpgradeSettlement(P, i); h += `<div style="margin-top:8px">${btnCost(chk, `Grow into a ${SETTLEMENTS[r.lvl + 1].name}`, 'data-settle="1"')}</div>${why(chk)}`; }
      h += '</div>';
      // ---- improvements
      h += `<div class="sec"><div class="sec-title">Worked land <span class="muted small">(max level ${IMP_CAP[N.age]} in the ${AGES[N.age].name})</span></div>`;
      const info = sim.tileInfo(i);
      for (const k of IMP_ORDER) {
        const I = IMPROVEMENTS[k]; const lvl = r.imp[k] || 0;
        if (!I.need(info, N) && !lvl) continue;
        const chk = sim.canImprove(P, i, k);
        const locked = I.tech && !N.techs[I.tech];
        h += `<div class="bld"><div><div class="nm">${I.icon} ${I.name}</div><div class="ds">${locked ? `Requires ${TECH[I.tech].name}` : I.desc}</div></div>${pips(lvl, IMP_CAP[N.age])}<div>${locked ? '' : r.build ? '' : lvl >= IMP_CAP[N.age] ? '<span class="muted small">Max</span>' : btnCost(chk, lvl ? 'Expand' : 'Build', `data-imp="${k}"`)}</div></div>`;
      }
      h += '</div>';
      // ---- buildings
      h += `<div class="sec"><div class="sec-title">Buildings</div>`;
      for (const k of BUILD_ORDER) {
        const B = BUILDINGS[k]; const lvl = r.bld[k] || 0;
        if (B.coastal && !T.coastal) continue;
        const next = B.levels[lvl];
        const nextKnown = next && N.techs[next[1]];
        if (!lvl && !nextKnown) continue;
        const chk = next ? sim.canBuild(P, i, k) : null;
        h += `<div class="bld"><div><div class="nm">${lvl ? B.levels[lvl - 1][0] : B.name}</div><div class="ds">${B.desc}</div></div>${pips(lvl, B.levels.length)}<div>${!next ? '<span class="muted small">Complete</span>' : r.build ? '' : nextKnown ? btnCost(chk, lvl ? next[0] : 'Build', `data-bld="${k}"`) : `<span class="muted small" title="Requires ${esc(TECH[next[1]].name)}">${esc(next[0])}: ${esc(TECH[next[1]].name)}</span>`}</div></div>`;
      }
      h += '</div>';
      // ---- wonders
      const wonders = Object.entries(WONDERS).filter(([id, W]) => N.techs[W.tech] && !s.wonders[id]);
      if (wonders.length) {
        h += `<div class="sec"><div class="sec-title">Wonders of the world</div>`;
        for (const [id, W] of wonders) { const chk = sim.canWonder(P, i, id); h += `<div class="bld"><div><div class="nm">🏛️ ${W.name}</div><div class="ds">${W.desc}</div></div><span></span><div>${r.build ? '' : btnCost(chk, 'Build', `data-wonder="${id}"`)}</div></div>`; }
        h += '</div>';
      }
      // ---- military
      h += `<div class="sec"><div class="sec-title">Raise forces here</div><div class="ubtns">`;
      let any = false;
      for (const line of LINE_ORDER) for (const t of lineOptions(N, line)) {
        const U = UNITS[t];
        if (sim.lines(r, U.domain) <= 0 || (U.domain === 'sea' && sim.seaNear(i) < 0)) continue;
        any = true;
        const f = sim.canField(P, t);
        h += `<button class="btn ubtn" data-unit="${t}" ${f.ok ? '' : `disabled title="${esc(f.why)}"`}><span>${U.name}</span><small>${costStr(sim.unitCost(P, t))} · ${U.pop}k men</small></button>`;
      }
      h += `</div>${any ? '' : '<div class="muted small">Ships need a harbor, aircraft an airfield.</div>'}`;
      const q = N.queue.filter(x => x.region === i);
      if (q.length) h += q.map(x => `<div class="row"><span>${UNITS[x.type].name}</span><span class="muted small">${x.status === 'building' ? Math.ceil(x.left / sim.siteRate(P, r)) + 'd' : x.status}</span></div>`).join('');
      h += `<button class="btn" style="margin-top:8px;width:100%" data-openwar="1" data-region="${i}">War council for ${esc(R.name)}…</button></div>`;
    } else if (r.owner) {
      h += `<div class="sec"><div class="grid2"><span>Settlement</span><span>${SETTLEMENTS[r.lvl].name}</span><span>Population</span><span>${popStr(r.pop)}</span><span>Garrison</span><span>${sim.garrison(r).toFixed(1)}</span></div><button class="btn" style="margin-top:8px" data-dossier="${r.owner}">${esc(sim.nm(r.owner))} dossier</button></div>`;
      if (sim.atWar(P, r.owner) && (N.warheads || 0) > 0) {
        const chk = sim.nukeCheck(P, i);
        h += `<div class="card" style="border-color:rgba(255,107,61,.5)"><div class="sec-title" style="color:#ff9a70">Strategic options</div><div class="small muted" style="margin-bottom:8px">${N.warheads} warhead(s).</div><button class="btn nuke" data-nuke="1" ${chk.ok ? '' : 'disabled'}>Authorize nuclear strike</button>${chk.ok ? '' : `<div class="small muted" style="margin-top:6px">${esc(chk.why)}</div>`}</div>`;
      }
    }
  }
  const groups = {}; for (const u of here) (groups[u.nation] ||= []).push(u);
  if (Object.keys(groups).length) {
    h += `<div class="sec"><div class="sec-title">Forces present</div>`;
    for (const [c, us] of Object.entries(groups)) {
      const cnt = {}; for (const u of us) cnt[UNITS[u.type].name] = (cnt[UNITS[u.type].name] || 0) + 1;
      h += `<div class="row ${c === P ? 'click' : ''}" ${c === P ? 'data-selhere="1"' : ''}><span><span class="flagchip" style="background:${sim.col(c)}"></span>${esc(sim.nm(c))}</span><span class="muted small">${Object.entries(cnt).map(([t, n]) => `${n} ${t}`).join(', ')}</span></div>`;
    }
    h += '</div>';
  }
  if (!setHTML(host, h)) return;
  const done = (res, head = 'Works') => { if (res && !res.ok) toast(head, res.why, 'warn'); renderPanel(true); G.fn.refreshWorld(false); };
  const q1 = sel => host.querySelector(sel);
  q1('[data-claim]')?.addEventListener('click', () => done(sim.claim(P, i), 'Settlers'));
  q1('[data-cancelclaim]')?.addEventListener('click', () => { sim.cancelClaim(i); done(); });
  q1('[data-subdue]')?.addEventListener('click', () => { const L = N.subjugate || []; N.subjugate = L.includes(i) ? L.filter(x => x !== i) : [...L, i]; if (N.subjugate.includes(i)) toast('Command', `Send troops to ${R.name} to subdue the natives. Select units and right-click the land.`, 'good'); done(); });
  q1('[data-settle]')?.addEventListener('click', () => done(sim.startWork(P, i, 'settle')));
  q1('[data-cancelwork]')?.addEventListener('click', () => { sim.cancelWork(i); done(); });
  for (const b of host.querySelectorAll('[data-imp]')) b.onclick = () => done(sim.startWork(P, i, 'imp', b.dataset.imp));
  for (const b of host.querySelectorAll('[data-bld]')) b.onclick = () => done(sim.startWork(P, i, 'bld', b.dataset.bld));
  for (const b of host.querySelectorAll('[data-wonder]')) b.onclick = () => done(sim.startWork(P, i, 'wonder', b.dataset.wonder));
  for (const b of host.querySelectorAll('[data-unit]')) b.onclick = () => { const r2 = sim.orderUnits(P, b.dataset.unit, 1, { region: i }); done(r2.ok ? { ok: true } : r2, 'Muster'); };
  for (const b of host.querySelectorAll('[data-selhere]')) b.onclick = () => { G.sel.clear(); for (const u of here) if (u.nation === P) G.sel.add(u.id); G.fn.computeStacks(); G.fn.renderSelbar(); G.fn.updateRings(); switchTab('forces'); };
  const nb = q1('[data-nuke]');
  if (nb) nb.onclick = () => {
    if (!confirm(`Authorize a nuclear strike on ${R.name}? The world will respond.`) || !confirm('Final confirmation: launch?')) return;
    const res = sim.nuke(P, i); if (!res.ok) toast('Strategic command', res.why, 'warn'); renderPanel(true);
  };
}
export function siegeStatus(i) {
  const sim = G.sim, s = sim.s, P = s.player, r = s.regions[i], N = s.nations[P];
  if (r.owner === P) return '';
  const land = u => u.nation === P && UNITS[u.type].domain === 'land' && UNITS[u.type].atk > 0;
  const here = s.units.filter(u => land(u) && u.loc === i && !u.move);
  const coming = s.units.filter(u => land(u) && u.move && u.move.path.at(-1) === i);
  if (!here.length && !coming.length) return '';
  const lines = [];
  if (coming.length) lines.push(`<div class="row"><span>${coming.length} unit(s) on the march</span><span class="muted">arrive in ${Math.min(...coming.map(u => parseInt(G.fn.eta(u))))}d+</span></div>`);
  if (!here.length) return lines.join('');
  const defAge = r.owner ? s.nations[r.owner].age : Math.max(0, N.age - 1);
  const power = sim.siegePower(here, defAge);
  const gar = sim.garrison(r);
  let msg;
  if (!r.owner) {
    if ((r.natives || 0) < 0.25) msg = '<span class="muted">No natives to subdue. Send settlers to claim it.</span>';
    else if (!(N.subjugate || []).includes(i)) msg = '<span class="neg">Not marked for conquest.</span> Use Mark for conquest above.';
    else if (power <= gar) msg = `<span class="neg">Strength ${power.toFixed(1)} is below the tribe's (${gar.toFixed(1)}).</span> Bring more warriors.`;
    else msg = '<span class="pos">Subjugation under way.</span>';
  } else if (!sim.atWar(P, r.owner)) msg = `<span class="neg">Not at war with the ${esc(sim.nm(r.owner))}.</span>`;
  else if (s.units.some(u => u.loc === i && UNITS[u.type].domain === 'land' && !u.move && u.nation === r.owner)) msg = '<span class="neg">Enemy troops still defend.</span> The siege starts when they fall.';
  else if (power <= gar) msg = `<span class="neg">Strength ${power.toFixed(1)} is below the garrison (${gar.toFixed(1)}).</span> Bring more troops or siege engines.`;
  else msg = '<span class="pos">Siege in progress.</span>';
  lines.push(`<div class="row"><span>${here.length} unit(s) here</span><span class="muted">strength ${power.toFixed(1)}</span></div><div class="small" style="margin-top:4px">${msg}</div>`);
  return lines.join('');
}

// ======================================================================= realm
function renderRealm(host) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], st = N.st;
  let h = `<div class="card"><div class="big">${esc(styleName(N))}</div><div class="sub">${st.tiles} lands · ${popStr(st.pop)} people · ${AGES[N.age].name}</div>${repChips(N)}</div>`;
  h += repSection(sim, P, 'Your reputation');
  h += `<div class="sec"><div class="sec-title">Stores</div><table class="stocks"><tr><th></th><th>Stock</th><th>Made</th><th>Used</th><th>Trade</th><th>Net/day</th><th></th></tr>`;
  for (const k of ['food', 'wood', 'stone', 'metal', 'wealth', 'oil']) {
    if ((k === 'metal' || k === 'wealth') && N.age < 1 && !N[k]) continue;
    if (k === 'oil' && N.age < 6 && !N.oil) continue;
    const used = k === 'food' ? st.foodCons : k === 'wealth' ? st.upkeep.wealth + st.researchSpend + st.training : k === 'oil' ? st.upkeep.oil : 0;
    h += `<tr><td>${STOCK_ICON[k]} ${STOCK_NAME[k]}</td><td>${fmt(N[k] || 0)}${k !== 'wealth' && k !== 'food' ? `<span class="muted small"> / ${fmt(sim.storageCap(N, k))}</span>` : ''}</td><td>${fmt(st.prod[k] || 0)}</td><td>${fmt(used)}</td><td>${sgn(st.trade[k] || 0)}</td><td class="${(st.net[k] || 0) >= 0 ? 'pos' : 'neg'}">${sgn(st.net[k] || 0)}</td><td>${k !== 'wealth' && sellables(N).goods.includes(k) ? ((N.tradeGoals || []).some(g => g.good === k && g.dir === 'sell') ? '<span class="small" style="color:var(--teal)">selling</span>' : `<button class="btn sm" data-sell="${k}" title="Have your envoy sell spare ${k} for wealth">Sell</button>`) : ''}</td></tr>`;
  }
  h += `</table><div class="grid2" style="margin-top:6px"><span>Learning</span><span>${fmt(st.rp)}/day${st.researchSpend ? ` (${fmt(st.researchSpend)} wealth to scholars)` : ''}</span>${N.age >= 6 ? `<span>Energy supply</span><span class="${st.eF < 1 ? 'neg' : 'pos'}">${pct(st.eF)} (${fmt(st.energy)} / ${fmt(st.eCons)})</span>` : ''}${N.famine ? `<span>Famine</span><span class="neg">${pct(N.famine)}</span>` : ''}</div></div>`;
  // strategic resources
  const needs = new Map();
  for (const line of LINE_ORDER) { const t = bestOf(N, line); if (t) for (const k of UNITS[t].needs) needs.set(k, [...(needs.get(k) || []), UNITS[t].name]); }
  h += `<div class="sec"><div class="sec-title">Strategic resources</div>`;
  const strat = STRATEGIC.filter(k => known(N, k));
  h += strat.length ? strat.map(k => { const n = N.access?.[k] || 0; const nd = needs.get(k); const sought = (N.tradeGoals || []).some(g => g.good === 'res:' + k && (g.dir || 'buy') === 'buy'); const selling = (N.tradeGoals || []).some(g => g.good === 'res:' + k && g.dir === 'sell'); const canSell = sellables(N).res.includes(k); return `<div class="row"><span>${RES[k].icon} ${RES[k].name}${nd ? ` <span class="small muted">· needed for ${nd.join(', ')}</span>` : ''}</span><span style="display:flex;gap:6px;align-items:center"><span class="${n ? 'pos' : nd ? 'neg' : 'muted'}">${n ? `${n} source${n > 1 ? 's' : ''}` : nd ? 'missing' : 'none'}</span>${n ? (canSell ? (selling ? '<span class="small" style="color:var(--teal)">selling</span>' : `<button class="btn sm" data-sell="res:${k}" title="Have your envoy lease it to other peoples for wealth">Sell</button>`) : '') : sought ? '<span class="small" style="color:var(--teal)">envoy seeking</span>' : `<button class="btn sm" data-seek="res:${k}" title="Have your envoy find a supplier">Find</button>`}</span></div>`; }).join('') : '<div class="muted small">None known yet. Copper, tin, iron, horses and later coal and oil reveal themselves as you learn.</div>';
  if (N.access?.tin && N.access?.copper) h += `<div class="small pos" style="margin-top:4px">Copper and tin together: bronze alloys give +25% metal.</div>`;
  h += '</div>';
  const lux = LUXURIES.filter(k => N.access?.[k]);
  h += `<div class="sec"><div class="sec-title">Luxuries (${lux.length})</div>${lux.length ? `<div class="deps">${lux.map(k => `<div class="dep luxury on"><span class="di">${RES[k].icon}</span><span><b>${RES[k].name}</b>${sellables(N).res.includes(k) ? ((N.tradeGoals || []).some(g => g.good === 'res:' + k && g.dir === 'sell') ? '<br><small style="color:var(--teal)">selling</small>' : `<br><small class="sellink" data-sell="res:${k}">sell to others</small>`) : ''}</span></div>`).join('')}</div>` : ''}<div class="small muted">Each distinct luxury raises approval (+${Math.round(Math.min(0.15, lux.length * 0.012) * 100)}% now). Trade for ones you lack.</div>${luxWanted(N).length ? `<div class="small" style="margin-top:6px">Sold by peoples you know: ${luxWanted(N).map(k => (N.tradeGoals || []).some(g => g.good === 'res:' + k) ? `<span class="chip on">${RES[k].icon} ${RES[k].name}: seeking</span>` : `<span class="chip" data-seek="res:${k}" title="Have your envoy buy it">${RES[k].icon} ${RES[k].name} +</span>`).join(' ')}</div>` : ''}</div>`;
  const tin = N.tribIn || {}, vs = sim.vassalsOf(P);
  if (vs.length || N.overlord) h += `<div class="sec"><div class="sec-title">Vassals and tribute</div>${vs.length ? `<button class="btn go" style="width:100%;margin-bottom:6px" data-imperial="1">Convene the imperial council (I)</button>` : ''}${N.overlord ? `<div class="row"><span>You pay the ${esc(sim.nm(N.overlord))}</span><span class="neg">${costStr(N.tribOut || {}) || 'nothing'}/day</span></div>` : ''}${vs.map(v => `<div class="row click" data-dossier="${v}"><span><span class="flagchip" style="background:${sim.dispCol(v)}"></span>${esc(sim.full(v))} <span class="small muted">· ${Math.round((s.nations[v].tribute ?? 0.25) * 100)}% · loyalty ${Math.round(sim.opinion(v, P))}</span></span><span class="pos">${costStr(s.nations[v].tribOut || {}) || 'nothing'}/day</span></div>`).join('')}${vs.length ? `<div class="small muted" style="margin-top:4px">Total tribute: ${costStr(tin) || 'none yet'} per day.</div>` : ''}</div>`;
  h += shoppingList(N);
  // trade
  const my = s.trades.filter(t => t.from === P || t.to === P);
  h += `<div class="sec" id="trade-sec"><div class="sec-title">Trade deals (${my.length})${my.length > 1 ? ' <button class="btn sm danger" data-cancelall="1" style="margin-left:auto">Cancel all</button>' : ''}</div>${my.length ? tradeRows(my) : '<div class="muted small">No deals. Propose trade in Diplomacy, accept offers from other peoples, or let your envoys secure supplies.</div>'}<div class="small muted" style="margin-top:4px">Cancelling a deal annoys the other side a little.</div></div>`;
  // works
  const works = sim.regionsOf(P).filter(r => r.build);
  const claims = s.regions.filter(r => r.claim?.by === P);
  h += `<div class="sec"><div class="sec-title">Works and settlers (${works.length + claims.length})</div>${claims.map(r => `<div class="row click" data-goto="${r.i}"><span>⛺ Settlers → ${esc(G.world.regions[r.i].name)}</span><span class="muted">${Math.ceil(r.claim.left)}d</span></div>`).join('')}${works.map(r => `<div class="row click" data-goto="${r.i}"><span>${esc(sim.workName(r.build))} · ${esc(G.world.regions[r.i].name)}</span><span class="muted">${Math.ceil(r.build.left / Math.max(0.05, sim.buildRate(r, N)))}d</span></div>`).join('') || (claims.length ? '' : '<div class="muted small">Nothing under way.</div>')}</div>`;
  h += `<div class="sec"><div class="sec-title">History</div>${chart(s.history.map(r => r.score[P] || 0), N.color)}</div>`;
  const regs = sim.regionsOf(P).sort((a, b) => b.pop - a.pop);
  h += `<div class="sec"><div class="sec-title">Lands (${regs.length})</div>${regs.map(r => `<div class="row click" data-goto="${r.i}"><span>${esc(G.world.regions[r.i].name)}${r.core !== P ? ' <span class="warn-text small">occupied</span>' : ''}${r.build ? ' <span class="small" style="color:var(--teal)">⚒</span>' : ''}</span><span class="muted small">${SETTLEMENTS[r.lvl].name} · ${popStr(r.pop)}</span></div>`).join('')}</div>`;
  if (!setHTML(host, h)) return;
  host.querySelector('[data-imperial]')?.addEventListener('click', () => G.fn.openImperial());
  bindShopping(host, N);
  bindTradeRows(host);
  host.querySelector('[data-cancelall]')?.addEventListener('click', () => { if (!confirm(`Cancel all ${my.length} trade deals?`)) return; for (const t of my) sim.endTrade(P, t.id); toast('Trade', 'All trade deals cancelled.', 'warn'); renderPanel(true); G.fn.refreshWorld(false); });
}
// luxuries some known people works that we lack
function luxWanted(N) {
  const s = G.sim.s;
  return LUXURIES.filter(k => !N.access?.[k] && known(N, k) && (N.known || []).some(c => s.nations[c]?.alive && (s.nations[c].access?.[k] || 0) > 0));
}
// ---------------------------------------------------------------- the envoy's trade orders (buy and sell)
// what we could sell: goods with a surplus or stockpile, and resources we work ourselves
function sellables(N) {
  const sim = G.sim;
  const goods = GOODS.filter(g => (g !== 'oil' || N.age >= 6) && ((N.st.net[g] || 0) > 0.02 || (N[g] || 0) > 5));
  const res = [...STRATEGIC, ...LUXURIES].filter(k => known(N, k) && sim.regionsOf(N.code).some(r => r.dep.some(d => d.r === k && (r.imp[RES[k].imp] || 0) > 0)));
  return { goods, res };
}
function shoppingList(N) {
  const sim = G.sim, s = sim.s, env = s.chars[N.gov.cabinet.foreign];
  const goals = N.tradeGoals || [];
  const dir = G.tgDir || 'buy';
  const sl = sellables(N);
  const opts = dir === 'buy'
    ? [...GOODS.filter(g => g !== 'oil' || N.age >= 6).map(g => [g, `${STOCK_ICON[g]} ${STOCK_NAME[g]}`]), ...[...STRATEGIC, ...LUXURIES].filter(k => known(N, k) && !N.access?.[k]).map(k => ['res:' + k, `${RES[k].icon} ${RES[k].name} (access)`])]
    : [...sl.goods.map(g => [g, `${STOCK_ICON[g]} ${STOCK_NAME[g]} (surplus ${sgn(N.st.net[g] || 0)}/day, ${fmt(N[g] || 0)} stored)`]), ...sl.res.map(k => ['res:' + k, `${RES[k].icon} ${RES[k].name} (lease access)`])];
  const key = dir === 'buy' ? 'tgGood' : 'tgSell';
  const sel = G[key] && opts.some(o => o[0] === G[key]) ? G[key] : opts[0]?.[0];
  const isRes = sel?.startsWith('res:');
  const sugg = dir === 'sell' && !isRes && sel ? Math.max(0.05, +(Math.max(N.st.net[sel] || 0, (N[sel] || 0) / 60) * 0.6).toFixed(2)) : Math.max(0.1, +(0.5 * ageScale(N.age)).toFixed(1));
  const LIM = dir === 'buy' ? TRADE_WILL : TRADE_FLOOR;
  const limSel = (dir === 'buy' ? G.tgWill : G.tgFloor) || 'fair';
  const earn = s.trades.filter(t => t.from === s.player && goals.some(g => g.dir === 'sell' && g.id === t.goal) && !t.blockaded).reduce((a, t) => a + t.amount * t.price, 0);
  const spend = s.trades.filter(t => t.to === s.player && goals.some(g => (g.dir || 'buy') === 'buy' && g.id === t.goal) && !t.blockaded).reduce((a, t) => a + t.amount * t.price, 0);
  let h = `<div class="sec" id="shop-sec"><div class="sec-title">Envoy's trade orders</div>`;
  h += env ? `<div class="person" style="margin-bottom:6px">${avatar(env, N.color)}<div><div class="pn">${esc(env.name)}</div><div class="pr">${esc(roleTitle('foreign', N.age))} · <span class="stars">${stars(env.skill)}</span> ${env.traits.map(t => `<span class="trait ${t === 'Corrupt' ? 'bad' : ''}">${t}</span>`).join('')}</div></div><span class="small muted" style="max-width:140px;text-align:right">${env.skill >= 7 ? 'Shrewd: searches widely, haggles hard' : env.skill >= 4 ? 'Capable negotiator' : 'Inexperienced: overlooks partners, gives ground'}</span></div>` : '<div class="small warn-text">No envoy appointed. Appoint one in Rule.</div>';
  if (goals.length) h += `<div class="small" style="margin-bottom:6px">Orders earn <span class="pos">${fmt(earn)}</span> and spend <span class="neg">${fmt(spend)}</span> wealth a day.</div>`;
  h += goals.length ? goals.map(g => {
    const sell = g.dir === 'sell', res = g.good.startsWith('res:'), k = res ? g.good.slice(4) : g.good;
    const label = res ? `${RES[k].icon} ${RES[k].name} ${sell ? `access to ${g.amount} buyer${g.amount > 1 ? 's' : ''}` : 'access'}` : `${STOCK_ICON[k]} ${g.amount} ${k}/day`;
    const deals = s.trades.filter(t => (sell ? t.from : t.to) === s.player && t.good === g.good && !t.blockaded);
    const have = sell ? (res ? deals.length : deals.reduce((a, t) => a + t.amount, 0)) : res ? (N.access?.[k] || 0) : deals.reduce((a, t) => a + t.amount, 0);
    const frac = res && !sell ? (have ? 1 : 0) : Math.min(1, have / Math.max(0.01, g.amount));
    const L = sell ? TRADE_FLOOR : TRADE_WILL;
    return `<div class="goal ${g.ok ? 'ok' : ''} ${sell ? 'sell' : ''}"><div class="row" style="border:0;padding:0"><span><span class="gtag ${sell ? 'sell' : ''}">${sell ? 'Sell' : 'Buy'}</span> <span class="hi">${label}</span></span><span style="display:flex;gap:4px"><select class="inp sm" data-gwill="${g.id}">${Object.entries(L).map(([w, W]) => `<option value="${w}" ${g.will === w ? 'selected' : ''}>${W.name}</option>`).join('')}</select><button class="btn sm" data-gnow="${g.id}" title="Negotiate now">Negotiate</button><button class="btn sm danger" data-gdel="${g.id}" title="Remove the order (existing deals stay)">✕</button></span></div>
      <div class="prog"><i style="width:${pct(frac)};background:${g.ok ? 'var(--green)' : sell ? 'var(--teal)' : 'var(--gold)'}"></i></div><div class="small ${g.ok ? 'pos' : 'muted'}">${esc(g.status || '')}</div></div>`;
  }).join('') : '<div class="small muted">Tell your envoy what to buy or sell. They search the peoples you know, haggle within your price limit, and replace deals that lapse.</div>';
  h += `<div class="filters" style="margin-top:8px"><span class="chip ${dir === 'buy' ? 'on' : ''}" data-tgdir="buy">Buy for us</span><span class="chip ${dir === 'sell' ? 'on' : ''}" data-tgdir="sell">Sell for wealth</span></div>`;
  if (opts.length) h += `<div class="actions" style="margin-top:6px;grid-template-columns:1.4fr .7fr 1fr"><select class="inp" id="tg-good">${opts.map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
    <input class="inp" id="tg-amt" type="number" min="${isRes ? 1 : 0.05}" step="${isRes ? 1 : 0.1}" value="${isRes ? (dir === 'sell' ? (G.tgCust ?? 3) : 1) : (G.tgAmt ?? sugg)}" title="${isRes ? (dir === 'sell' ? 'How many peoples to lease it to' : '') : 'Amount per day'}" ${isRes && dir === 'buy' ? 'disabled' : ''}>
    <select class="inp" id="tg-will">${Object.entries(LIM).map(([w, W]) => `<option value="${w}" ${limSel === w ? 'selected' : ''} title="${W.desc}">${W.name}</option>`).join('')}</select></div>
    <button class="btn go" id="tg-add" style="margin-top:6px;width:100%">${dir === 'buy' ? 'Send the envoy to get it' : 'Send the envoy to sell it'}</button>
    <div class="small muted" style="margin-top:4px">${dir === 'sell' ? (isRes ? 'Leasing access: each buyer pays a daily fee to use your resource. You keep it too. The number is how many peoples to lease to.' : 'Amount per day. The envoy never sells food your people need, and only spare goods.') : isRes ? 'Access to a resource: a daily fee lets your armies and people use it.' : 'Goods: amount per day.'} Price: ${esc(LIM[limSel].desc.toLowerCase())}.</div>`;
  else if (dir === 'sell') h += '<div class="small muted" style="margin-top:6px">Nothing to sell yet: no surplus goods and no worked strategic resources or luxuries.</div>';
  return h + '</div>';
}
function bindShopping(host, N) {
  const sim = G.sim;
  const go = (g, quiet) => { G.ai.pursueTradeGoals(sim.s.player, g.id, t => N.delegLog?.push({ t: sim.s.t, y: sim.s.year, text: t })); if (!quiet) toast('Envoy', g.ok ? `${g.status}` : `On it. ${g.status}`, g.ok ? 'good' : ''); renderPanel(true); G.fn.refreshWorld(false); };
  for (const b of host.querySelectorAll('[data-seek]')) b.onclick = e => { e.stopPropagation(); go(addTradeGoal(N, b.dataset.seek, 1, 'fair')); };
  for (const b of host.querySelectorAll('[data-sell]')) b.onclick = e => {
    e.stopPropagation();
    const good = b.dataset.sell, res = good.startsWith('res:');
    const amt = res ? 3 : Math.max(0.05, +(Math.max(N.st.net[good] || 0, (N[good] || 0) / 60) * 0.6).toFixed(2));
    go(addTradeGoal(N, good, amt, 'fair', 'sell'));
  };
  for (const c of host.querySelectorAll('[data-tgdir]')) c.onclick = () => { G.tgDir = c.dataset.tgdir; G.tgAmt = null; renderPanel(true); };
  const dir = G.tgDir || 'buy';
  const gs = host.querySelector('#tg-good'); if (gs) gs.onchange = () => { G[dir === 'buy' ? 'tgGood' : 'tgSell'] = gs.value; G.tgAmt = null; renderPanel(true); };
  const ga = host.querySelector('#tg-amt'); if (ga) ga.onchange = () => { if (host.querySelector('#tg-good').value.startsWith('res:')) G.tgCust = Math.max(1, Math.round(+ga.value || 1)); else G.tgAmt = +ga.value; };
  const gw = host.querySelector('#tg-will'); if (gw) gw.onchange = () => { G[dir === 'buy' ? 'tgWill' : 'tgFloor'] = gw.value; renderPanel(true); };
  host.querySelector('#tg-add')?.addEventListener('click', () => {
    const good = host.querySelector('#tg-good').value, res = good.startsWith('res:');
    const raw = +host.querySelector('#tg-amt').value;
    const amt = res ? (dir === 'sell' ? Math.max(1, Math.round(raw || 1)) : 1) : +Math.max(0.05, raw || 0.5).toFixed(2);
    go(addTradeGoal(N, good, amt, host.querySelector('#tg-will').value, dir));
  });
  for (const b of host.querySelectorAll('[data-gnow]')) b.onclick = () => { const g = N.tradeGoals.find(x => x.id === +b.dataset.gnow); if (g) { g.next = 0; go(g); } };
  for (const b of host.querySelectorAll('[data-gdel]')) b.onclick = () => { N.tradeGoals = N.tradeGoals.filter(x => x.id !== +b.dataset.gdel); toast('Envoy', 'Order removed. Deals already made stay in force; cancel them under Trade deals.', ''); renderPanel(true); };
  for (const sl of host.querySelectorAll('[data-gwill]')) sl.onchange = () => { const g = N.tradeGoals.find(x => x.id === +sl.dataset.gwill); if (g) { g.will = sl.value; g.next = 0; go(g, true); } };
}
// one row per deal, written from the player's point of view
export function tradeRows(list) {
  const sim = G.sim, s = sim.s, P = s.player;
  return list.map(t => {
    const exp = t.from === P, o = exp ? t.to : t.from, res = t.good.startsWith('res:');
    const what = res ? `${RES[t.good.slice(4)].icon} ${RES[t.good.slice(4)].name} access` : `${STOCK_ICON[t.good] || ''} ${fmt(t.amount)} ${t.good}/day`;
    const pay = t.amount * t.price;
    const flow = exp ? `you send ${what}, you receive <span class="pos">${fmt(pay)} wealth/day</span>` : `you receive ${what}, you pay <span class="neg">${fmt(pay)} wealth/day</span>`;
    const age = Math.max(0, Math.floor((s.t - t.since) / 24));
    return `<div class="trow ${t.blockaded ? 'blk' : ''}"><div><div><b>${exp ? 'Export to' : 'Import from'}</b> <span style="color:${sim.col(o)}">${esc(sim.nm(o))}</span></div><div class="small">${flow}</div><div class="small muted">${t.blockaded ? `<span class="neg">Blockaded by the ${esc(sim.nm(t.by))}: no goods are moving</span>` : `Active for ${age} day${age === 1 ? '' : 's'}`}</div></div><button class="btn sm danger" data-cancel="${t.id}" title="End this deal">✕ Cancel</button></div>`;
  }).join('');
}
function bindTradeRows(host) {
  const sim = G.sim, P = sim.s.player;
  for (const b of host.querySelectorAll('[data-cancel]')) b.onclick = e => {
    e.stopPropagation();
    const t = sim.s.trades.find(x => x.id === +b.dataset.cancel);
    if (t) { sim.endTrade(P, t.id); toast('Trade', `Deal with the ${sim.nm(t.from === P ? t.to : t.from)} cancelled.`, 'warn'); }
    renderPanel(true); G.fn.refreshWorld(false);
  };
}
function chart(vals, color) {
  if (vals.length < 2) return '<div class="muted small">History is recorded weekly.</div>';
  const W = 400, H = 110, max = Math.max(...vals) * 1.05 || 1, min = Math.min(...vals) * 0.95;
  const pts = vals.map((v, k) => `${(k / (vals.length - 1) * W).toFixed(1)},${(H - (v - min) / (max - min || 1) * H).toFixed(1)}`).join(' ');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
}

// ======================================================================= forces
function renderForces(host) {
  const sim = G.sim, s = sim.s, w = G.world, P = s.player, N = s.nations[P];
  const units = G.fn.selectedUnits();
  const myGroups = s.groups.filter(g => g.nation === P);
  let h = '';
  if (units.length) {
    const avgXp = units.reduce((a, u) => a + (u.xp || 0), 0) / units.length;
    const ups = units.map(u => sim.upgradeCost(P, u)).filter(Boolean);
    const upCost = {}; for (const u of ups) for (const [k, v] of Object.entries(u.cost)) upCost[k] = (upCost[k] || 0) + v;
    h += `<div class="card"><div class="big">${units.length} units selected</div><div class="sub">Average experience ${Math.round(avgXp)}/100. Right-click a tile to move. Aircraft strike enemy land.</div>
      <div class="actions" style="margin-top:10px">
        <button class="btn" data-act="train">Begin drills</button>
        <button class="btn" data-act="stop">Halt</button>
        <button class="btn" data-act="group">Form army group</button>
        ${myGroups.length ? `<select class="inp" id="assign"><option value="">Assign to group...</option>${myGroups.map(g => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select>` : '<span></span>'}
        ${ups.length ? `<button class="btn go" data-act="upgrade" title="Refit to the best equipment of the age">Refit ${ups.length} · ${costStr(upCost)}</button>` : '<span></span>'}
        <button class="btn danger" data-act="disband">Disband</button>
        <button class="btn" data-act="clear">Clear selection</button>
      </div></div>`;
    const types = [...new Set(units.map(u => u.type))];
    h += `<div class="sec"><div class="filters">${types.map(t => `<span class="chip" data-only="${t}">Only ${UNITS[t].name}</span>`).join('')}</div>`;
    for (const u of units.slice(0, 60)) {
      const T = UNITS[u.type];
      const stt = G.fn.airborne(u) ? `airborne (${u.air.phase})` : u.move ? `marching to ${w.regions[u.move.path.at(-1)].name} (${G.fn.eta(u)})` : u.mission?.strike !== undefined ? `strike orders: ${w.regions[u.mission.strike].name}` : u.train ? 'drilling' : w.regions[u.loc].sea && T.domain === 'land' ? 'embarked' : 'holding';
      const g = u.group && s.groups.find(x => x.id === u.group);
      h += `<div class="row"><span><span class="hi">${T.name}</span> <span class="muted small">${AGES[T.age].short} · ${w.regions[u.loc].name}${g ? ' · ' + esc(g.name) : ''}</span><br><span class="small ${u.fighting ? 'neg' : 'muted'}">${u.fighting ? 'In battle · ' : ''}${stt} · XP ${Math.round(u.xp || 0)}</span></span><span class="hpbar"><i style="width:${Math.round(u.hp / u.mhp * 100)}%;background:${u.hp / u.mhp < 0.35 ? 'var(--red)' : 'var(--green)'}"></i></span></div>`;
    }
    h += '</div>';
  }
  const mine = sim.unitsOf(P);
  const old = mine.filter(u => sim.upgradeCost(P, u)).length;
  h += `<div class="sec"><button class="btn go" style="width:100%" data-openwar="1">Open the war council: raise units in bulk (R)</button></div>`;
  h += `<div class="sec"><div class="sec-title">Order of battle</div><div class="grid2">
    <span>Land units</span><span>${mine.filter(u => UNITS[u.type].domain === 'land').length}</span>
    <span>Ships</span><span>${mine.filter(u => UNITS[u.type].domain === 'sea').length}</span>
    ${N.age >= 7 ? `<span>Air groups</span><span>${mine.filter(u => UNITS[u.type].domain === 'air').length}</span>` : ''}
    <span>Sealift (used / capacity)</span><span>${sim.embarked(P)} / ${sim.sealift(P)}</span>
    <span>Upkeep</span><span>${costStr(N.st.upkeep)}/day</span>
    ${old ? `<span>Outdated units</span><span class="warn-text">${old} can be refitted</span>` : ''}
  </div></div>`;
  const byLoc = new Map();
  for (const u of mine) { const k = u.move ? 'moving' : G.fn.airborne(u) ? 'air' : String(u.loc); if (!byLoc.has(k)) byLoc.set(k, []); byLoc.get(k).push(u); }
  h += `<div class="sec"><div class="sec-title">Deployments</div><div class="small muted" style="margin-bottom:4px">Click to select. Shift-drag on the globe to box-select.</div>`;
  for (const [k, us] of [...byLoc].sort((a, b) => b[1].length - a[1].length)) {
    const cnt = {}; for (const u of us) cnt[UNITS[u.type].name] = (cnt[UNITS[u.type].name] || 0) + 1;
    h += `<div class="row click" data-loc="${k}"><span class="hi">${k === 'moving' ? 'On the march' : k === 'air' ? 'Airborne' : w.regions[+k].name}</span><span class="muted small">${Object.entries(cnt).map(([t, n]) => `${n} ${t}`).join(', ')}</span></div>`;
  }
  h += '</div>';
  const lines = LINE_ORDER.map(l => bestOf(N, l)).filter(Boolean);
  h += `<div class="sec"><div class="sec-title">Your best units</div><table class="ut"><tr><th>Unit</th><th>Atk</th><th>Def</th><th>HP</th><th>Range</th><th>Speed</th><th>Needs</th></tr>${lines.map(t => { const T = UNITS[t]; return `<tr><td>${T.name}</td><td>${fmt(T.atk)}</td><td>${fmt(T.def)}</td><td>${T.hp}</td><td>${T.domain === 'air' ? T.radius : T.range} km</td><td>${T.speed}${T.domain === 'air' ? '/h' : '/d'}</td><td>${T.needs.map(k => RES[k].icon).join('') || '–'}</td></tr>`; }).join('')}</table></div>`;
  if (!setHTML(host, h)) return;
  const upd = () => { G.fn.computeStacks(); G.fn.renderSelbar(); G.fn.updateRings(); renderPanel(true); };
  for (const c of host.querySelectorAll('[data-only]')) c.onclick = () => { for (const u of units) if (u.type !== c.dataset.only) G.sel.delete(u.id); upd(); };
  const act = a => host.querySelector(`[data-act="${a}"]`);
  act('train')?.addEventListener('click', () => { for (const u of units) { if (s.regions[u.loc].owner === P && !s.regions[u.loc].sea) { u.train = true; u.move = null; } } toast('Drills', 'Units in friendly lands begin drilling. It costs half their upkeep extra.', 'good'); renderPanel(true); });
  act('stop')?.addEventListener('click', () => { for (const u of units) { u.move = null; u.mission = null; u.train = false; } upd(); });
  act('upgrade')?.addEventListener('click', () => { const r = sim.upgrade(P, units.map(u => u.id)); toast('Armory', r.ok ? `${r.n} units refitted.${r.why ? ' ' + r.why : ''}` : r.why || 'Nothing to refit.', r.ok ? 'good' : 'warn'); upd(); });
  act('group')?.addEventListener('click', () => {
    const name = prompt('Name the new army group:', `${ordinal(myGroups.length + 1)} Host`); if (!name) return;
    const free = N.generals.find(id => !s.groups.some(g => g.general === id)) || null;
    const g = { id: s.gid++, nation: P, name, general: free, units: units.map(u => u.id), order: { type: 'hold' }, status: 'Awaiting orders.' };
    for (const u of units) { for (const og of s.groups) og.units = og.units.filter(id => id !== u.id); u.group = g.id; }
    s.groups.push(g); switchTab('command');
  });
  const asg = host.querySelector('#assign');
  if (asg) asg.onchange = () => { const g = s.groups.find(x => x.id === +asg.value); if (!g) return; for (const u of units) { for (const og of s.groups) og.units = og.units.filter(id => id !== u.id); g.units.push(u.id); u.group = g.id; } toast('Command', `${units.length} units assigned to ${g.name}.`, 'good'); renderPanel(true); };
  act('disband')?.addEventListener('click', () => { if (!confirm(`Disband ${units.length} units? Soldiers in your own lands return home as settlers.`)) return; for (const u of units) { const r = s.regions[u.loc]; if (r && !r.sea && r.owner === P) r.pop += UNITS[u.type].pop * 0.8; sim.removeUnit(u); } G.sel.clear(); upd(); });
  act('clear')?.addEventListener('click', () => { G.sel.clear(); upd(); });
  for (const r of host.querySelectorAll('[data-loc]')) r.onclick = () => {
    const k = r.dataset.loc; G.sel.clear();
    for (const u of mine) if ((k === 'moving' && u.move) || (k === 'air' && G.fn.airborne(u)) || (!u.move && !G.fn.airborne(u) && String(u.loc) === k)) G.sel.add(u.id);
    if (!isNaN(+k)) G.fn.flyTile(+k);
    upd();
  };
}

// ======================================================================= command
const DIRECTIVES = {
  industry: { role: 'industry', label: 'Works and settlement', opts: { off: 'Personal control', balanced: 'Balanced development', expand: 'Settle new lands', growth: 'Grow the towns', food: 'Food security', industry: 'Materials and industry', research: 'Places of learning', fortify: 'Fortify the borders' } },
  defense: { role: 'defense', label: 'Raising forces', opts: { off: 'Personal control', maintain: 'Maintain a garrison', army: 'Build up the army', navy: 'Build up the fleet', air: 'Build up air power', total: 'Total war' } },
  science: { role: 'science', label: 'Learning', opts: { off: 'Personal control', balanced: 'Balanced', military: 'Warfare and seafaring', economy: 'Farming, crafts, commerce', science: 'Pure knowledge', civic: 'Government and society' } },
  foreign: { role: 'foreign', label: 'Envoys', opts: { off: 'Personal control', trade: 'Secure supplies', relations: 'Win friends', alliances: 'Build alliances' } },
};
function renderCommand(host) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], w = G.world;
  let h = `<div class="card"><div class="big">Chain of command</div><div class="sub">Give your council standing orders and they act on their own, within the share of the stores you allow. Leave any area under personal control to handle it yourself, or convene the council and rule on their proposals.</div><div style="margin-top:10px"><button class="btn go" data-convene="1" ${cabinetReady() ? '' : 'disabled'}>${cabinetReady() ? 'Convene the council' : 'The council met recently'}</button></div></div>`;
  h += `<div class="sec"><div class="sec-title">Standing orders</div>`;
  for (const [k, D] of Object.entries(DIRECTIVES)) {
    const c = s.chars[N.gov.cabinet[D.role]];
    h += `<div class="person">${c ? avatar(c, N.color) : '<div></div>'}<div><div class="pn">${D.label}</div><div class="pr">${c ? `${esc(c.name)}, ${roleTitle(D.role, N.age)} · <span class="stars">${stars(c.skill)}</span>` : 'Vacant'}</div></div><select class="inp" data-dir="${k}" style="width:190px">${Object.entries(D.opts).map(([v, l]) => `<option value="${v}" ${N.directives[k] === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  }
  h += `<div style="margin-top:10px"><div class="row"><span>The council may spend up to</span><span class="hi">${pct(N.directives.budget)} of the stores</span></div><input type="range" min="0.1" max="0.9" step="0.05" value="${N.directives.budget}" id="budget"></div>
    <div class="row"><span>The council resolves crises without consulting you</span><input type="checkbox" id="delev" ${N.delegateEvents ? 'checked' : ''}></div>
    <div class="row"><span>Pause the game for council briefings</span><input type="checkbox" id="pauseev" ${G.pauseOnEvents ? 'checked' : ''}></div></div>`;
  const tg = N.tradeGoals || [];
  h += `<div class="sec"><div class="row click" data-shop="1"><span>Envoy's trade orders: ${tg.length ? `${tg.filter(g => g.ok).length} of ${tg.length} fulfilled` : 'none'}</span><span class="small" style="color:var(--teal)">Manage in Realm &rsaquo;</span></div></div>`;
  const log = (N.delegLog || []).slice(-10).reverse();
  if (log.length) h += `<div class="sec"><div class="sec-title">Recent council actions</div>${log.map(l => `<div class="log-item build"><span class="lt">${dstr(l.y)}</span>${esc(l.text)}</div>`).join('')}</div>`;
  const groups = s.groups.filter(g => g.nation === P);
  const gens = N.generals.map(id => s.chars[id]).filter(Boolean);
  const enemies = sim.warsOf(P);
  const others = N.known.filter(c => s.nations[c]?.alive).sort((a, b) => sim.nm(a).localeCompare(sim.nm(b)));
  h += `<div class="sec"><div class="sec-title">Army groups</div>`;
  if (!groups.length) h += `<div class="muted small">Select units, then choose <b>Form army group</b> in Forces. A commander leads them for you.</div>`;
  for (const g of groups) {
    const us = g.units.map(id => sim.unitById.get(id)).filter(Boolean);
    const cnt = {}; for (const u of us) cnt[UNITS[u.type].name] = (cnt[UNITS[u.type].name] || 0) + 1;
    const gen = s.chars[g.general];
    const o = g.order || { type: 'hold' };
    h += `<div class="group"><div class="gh"><span class="gn">${esc(g.name)}</span><span class="muted small">${us.length} units</span></div>
      <div class="small muted">${Object.entries(cnt).map(([t, n]) => `${n} ${t}`).join(' · ') || 'empty'}</div>
      <div class="actions" style="margin-top:8px">
        <select class="inp" data-gen="${g.id}"><option value="">No commander</option>${gens.map(c => `<option value="${c.id}" ${c.id === g.general ? 'selected' : ''} ${s.groups.some(x => x.general === c.id && x.id !== g.id) ? 'disabled' : ''}>${esc(c.name)} (${c.skill})</option>`).join('')}</select>
        <select class="inp" data-ord="${g.id}">${[['hold', 'Hold positions'], ['train', 'Drill'], ['defend', 'Defend selected tile'], ['subdue', 'Subdue natives of selected tile'], ['attack', 'Make war on...']].map(([v, l]) => `<option value="${v}" ${o.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
        ${o.type === 'attack' ? `<select class="inp" data-tgt="${g.id}">${[...enemies, ...others.filter(x => !enemies.includes(x))].map(c => `<option value="${c}" ${o.target === c ? 'selected' : ''}>${sim.atWar(P, c) ? '⚔ ' : ''}${esc(sim.nm(c))}</option>`).join('')}</select>` : ''}
        ${o.type === 'defend' || o.type === 'subdue' ? `<span class="small hi" style="align-self:center">${w.regions[o.region]?.name || '?'}</span>` : ''}
      </div>
      ${gen ? `<div class="small" style="margin-top:6px">${esc(charTitle(gen, N))} ${esc(gen.name)} · <span class="stars">${stars(gen.skill)}</span> ${traitChips(gen)}</div>` : ''}
      <div class="small" style="margin-top:6px;color:var(--teal)">${esc(g.status || 'Awaiting orders.')}</div>
      <div style="display:flex;gap:6px;margin-top:8px"><button class="btn sm" data-gsel="${g.id}">Select units</button><button class="btn sm" data-gadd="${g.id}" ${G.sel.size ? '' : 'disabled'}>Add selected</button><button class="btn sm danger" data-gdis="${g.id}">Dissolve</button></div></div>`;
  }
  h += '</div>';
  h += `<div class="sec"><div class="sec-title">Commanders</div>${gens.map(c => `<div class="person">${avatar(c, '#8fa7c4')}<div><div class="pn">${esc(c.name)}</div><div class="pr">${esc(charTitle(c, N))} · <span class="stars">${stars(c.skill)}</span> · loyalty ${pct(c.loyalty)}<br>${traitChips(c)}</div></div><span class="small muted">${esc((s.groups.find(g => g.general === c.id) || {}).name || 'Unassigned')}</span></div>`).join('')}`;
  const cands = (N.gov.candidates.general || []).map(id => s.chars[id]).filter(Boolean);
  if (cands.length) h += `<div class="small muted" style="margin:8px 0 4px">Warriors seeking command:</div>` + cands.map(c => `<div class="person">${avatar(c, '#5c6f88')}<div><div class="pn">${esc(c.name)}</div><div class="pr"><span class="stars">${stars(c.skill)}</span><br>${traitChips(c)}</div></div><button class="btn sm" data-hire="${c.id}" data-role="general" ${N.gov.pc >= hireCost(c) ? '' : 'disabled'}>Promote · ${hireCost(c)} influence</button></div>`).join('');
  h += '</div>';
  if (!setHTML(host, h)) return;
  host.querySelector('[data-shop]')?.addEventListener('click', () => { switchTab('realm'); setTimeout(() => $('#shop-sec')?.scrollIntoView({ block: 'start' }), 30); });
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
    else if (x.value === 'defend' || x.value === 'subdue') {
      if (G.region === null || G.region === undefined) { toast('Command', 'Select a tile on the globe first.', 'warn'); renderPanel(true); return; }
      if (x.value === 'subdue' && (s.regions[G.region].owner || (s.regions[G.region].natives || 0) < 0.25)) { toast('Command', 'The selected tile has no native peoples to subdue.', 'warn'); renderPanel(true); return; }
      g.order = { type: x.value, region: G.region };
    } else g.order = { type: x.value };
    g.status = 'New orders received.'; G.ai.runGroups(P); renderPanel(true);
  };
  for (const x of host.querySelectorAll('[data-tgt]')) x.onchange = () => { const g = grp(x.dataset.tgt); g.order.target = x.value; if (!sim.atWar(P, x.value) && confirm(`${g.name} cannot attack the ${sim.nm(x.value)} in peacetime. Declare war now?`)) sim.declareWar(P, x.value); G.ai.runGroups(P); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-gsel]')) b.onclick = () => { G.sel = new Set(grp(b.dataset.gsel).units); G.fn.computeStacks(); G.fn.renderSelbar(); G.fn.updateRings(); const u = sim.unitById.get([...G.sel][0]); if (u) G.globe.flyTo(u.pos[0], u.pos[1]); };
  for (const b of host.querySelectorAll('[data-gadd]')) b.onclick = () => { const g = grp(b.dataset.gadd); for (const u of G.fn.selectedUnits()) { if (u.nation !== P) continue; for (const og of s.groups) og.units = og.units.filter(id => id !== u.id); g.units.push(u.id); u.group = g.id; } renderPanel(true); };
  for (const b of host.querySelectorAll('[data-gdis]')) b.onclick = () => { const g = grp(b.dataset.gdis); for (const id of g.units) { const u = sim.unitById.get(id); if (u) { u.group = null; u.train = false; } } s.groups = s.groups.filter(x => x !== g); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-hire]')) b.onclick = () => { const r = appoint(sim, N, b.dataset.role, +b.dataset.hire); if (!r.ok) toast('Court', r.why, 'warn'); renderPanel(true); };
}

// ======================================================================= government
function renderGov(host) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], g = N.gov, GT = GOV_TYPES[g.type];
  const pcRate = 0.5 * GT.pc * (0.5 + g.stability) + (N.mods.pc || 0);
  const ruler = s.chars[g.cabinet.interior];
  let h = `<div class="card"><div class="big">${esc(styleName(N))}</div><div class="sub">${GT.name} · ruled by ${GT.ruler === 'Elder' ? 'a council of elders' : 'the ' + GT.ruler}${GT.democratic && g.nextElection ? ` · next election in ${Math.max(0, Math.ceil((g.nextElection - s.t) / 24))} days` : ''}${s.t < g.hostileUntil ? ' · <span class="warn-text">hostile assembly</span>' : ''}</div>
    <div style="margin-top:10px" class="grid2"><span>Stability</span><span>${pct(g.stability)}</span></div><div class="meter"><i style="width:${pct(g.stability)};background:${g.stability < 0.3 ? 'var(--red)' : g.stability < 0.55 ? 'var(--amber)' : 'var(--green)'}"></i></div>
    <div class="grid2"><span>Approval</span><span>${pct(g.approval)}</span></div><div class="meter"><i style="width:${pct(g.approval)};background:var(--teal)"></i></div>
    <div class="grid2"><span>Influence</span><span>${Math.floor(g.pc)} (+${pcRate.toFixed(2)}/day)</span><span>War weariness</span><span>${pct(N.exhaustion)}</span></div>
    <div style="margin-top:10px"><button class="btn go" data-convene="1" ${cabinetReady() ? '' : 'disabled'}>${cabinetReady() ? 'Convene the council' : 'The council met recently'}</button></div></div>`;
  void ruler;
  if (s.ww2) h += warHTML(sim, N);
  if (s.modern) h += leadershipHTML(sim, N);
  // forms of government (not in the modern world: constitutions do not change by menu)
  if (!s.modern) {
  h += `<div class="sec"><div class="sec-title">Forms of government</div><div class="small muted" style="margin-bottom:6px">Governments evolve as your people learn. Changing costs ${reformCost(N)} influence and shakes stability.</div>`;
  for (const [k, G2] of Object.entries(GOV_TYPES)) {
    if (G2.coupOnly && g.type !== k) continue;
    if (G2.age > N.age + 1) continue;
    const cur = g.type === k, av = govAvailable(N, k);
    const fx = Object.entries(G2.fx).map(([a, v]) => `${a} ${v > 0 ? '+' : ''}${Math.abs(v) < 0.05 ? (v * 100).toFixed(1) : Math.round(v * 100)}%`).join(', ');
    h += `<div class="govrow ${cur ? 'cur' : av ? '' : 'locked'}"><div><div class="nm">${G2.name}${cur ? ' <span class="small" style="color:var(--gold)">current</span>' : ''}</div><div class="ds">${esc(G2.desc)} <span class="muted">${fx}</span></div></div><div>${cur ? '' : av ? `<button class="btn sm" data-reform="${k}" ${g.pc >= reformCost(N) ? '' : 'disabled'}>Adopt</button>` : `<span class="small muted">${G2.age > N.age ? AGES[G2.age].short + ' Age' : TECH[G2.tech]?.name || ''}</span>`}</div></div>`;
  }
  h += '</div>';
  }
  // council
  h += `<div class="sec"><div class="sec-title">Council</div>`;
  for (const role of CABINET) {
    const c = s.chars[g.cabinet[role]];
    h += `<div class="person">${c ? avatar(c, N.color) : '<div></div>'}<div><div class="pn">${c ? esc(c.name) : 'Vacant'}</div><div class="pr">${roleTitle(role, N.age)}${c ? ` · <span class="stars">${stars(c.skill)}</span> · loyalty ${pct(c.loyalty)}<br>${traitChips(c)}` : ''}</div></div><button class="btn sm" data-repl="${role}">${G.replRole === role ? 'Close' : 'Replace'}</button></div>`;
    if (G.replRole === role) {
      const cands = (g.candidates[role] || []).map(id => s.chars[id]).filter(Boolean);
      h += `<div style="padding:4px 0 8px 50px">${cands.length ? cands.map(x => `<div class="person" style="grid-template-columns:32px 1fr auto">${avatar(x, '#5c6f88')}<div><div class="pn">${esc(x.name)}</div><div class="pr"><span class="stars">${stars(x.skill)}</span> ${traitChips(x)}</div></div><button class="btn sm go" data-hire="${x.id}" data-role="${role}" ${g.pc >= hireCost(x) ? '' : 'disabled'}>Appoint · ${hireCost(x)}</button></div>`).join('') : '<span class="muted small">No candidates right now. New ones come forward every 60 days.</span>'}</div>`;
    }
  }
  h += '</div>';
  // laws
  h += `<div class="sec"><div class="sec-title">Laws and customs</div><div class="small muted" style="margin-bottom:4px">Numbers are influence costs. Hover for effects.</div>`;
  for (const [cat, L] of Object.entries(LAWS)) {
    if (!lawVisible(N, cat)) continue;
    const cur = lawOpt(N, cat);
    h += `<div class="lawcat"><div class="lc-head"><span class="lc-name">${L.name}</span><span class="small muted">${esc(cur.desc || '')}</span></div><div class="lawopts">`;
    for (const o of L.opts) {
      if (o.id === cur.id) { h += `<button class="lawopt cur">${o.name}</button>`; continue; }
      if (o.req?.tech && !N.techs[o.req.tech] && TECH[o.req.tech].age > N.age) continue;
      const chk = canEnact(sim, N, cat, o.id);
      const fx = Object.entries(o.fx).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${Math.abs(v) < 0.05 ? (v * 100).toFixed(1) : Math.round(v * 100)}%`).join(', ');
      h += `<button class="lawopt" data-law="${cat}" data-opt="${o.id}" ${chk.ok ? '' : 'disabled'} title="${esc((o.desc ? o.desc + ' ' : '') + fx + (chk.ok ? '' : ' (' + chk.why + ')'))}">${o.name} · ${lawCost(N, o)}</button>`;
    }
    h += '</div></div>';
  }
  h += '</div>';
  // formables
  const forms = sim.formables.filter(F => !s.formed[F.id] && F.minAge <= N.age + 1 && (F.maxAge === undefined || F.maxAge >= N.age)).map(F => ({ F, p: formProgress(sim, N, F) }))
    .filter(x => x.p.ok || x.p.parts.some(pp => pp.have > 0)).sort((a, b) => (b.p.ok - a.p.ok) || (prog(b.p) - prog(a.p))).slice(0, 8);
  h += `<div class="sec"><div class="sec-title">Destinies</div><div class="small muted" style="margin-bottom:6px">Control the right lands in the right age to proclaim a great empire or nation. ${N.formed ? `You rule the ${esc(N.formed.title)}.` : ''}</div>`;
  if (!forms.length) h += '<div class="muted small">Expand your borders. Destinies appear as you hold their heartlands.</div>';
  for (const { F, p } of forms) {
    h += `<div class="form ${p.ok ? 'ready' : ''}"><div class="row"><span class="hi">${esc(F.title)}</span>${p.ok ? `<button class="btn sm go" data-form="${esc(F.id)}">Proclaim</button>` : `<span class="small muted">${AGES[F.minAge].short}${F.maxAge !== undefined ? '–' + AGES[F.maxAge].short : '+'}</span>`}</div><div class="small muted">${esc(F.desc)}</div>${p.parts.map(pp => `<div class="small">${esc(pp.label)}: ${pp.have}/${pp.need}</div><div class="prog"><i style="width:${pct(Math.min(1, pp.have / Math.max(1, pp.need)))}"></i></div>`).join('')}</div>`;
  }
  h += '</div>';
  if (N.techs.nuclear_fission) {
    const fac = sim.regionsOf(P).reduce((a, r) => a + (r.bld.nuclear || 0), 0);
    h += `<div class="sec"><div class="sec-title">Strategic arsenal</div><div class="grid2"><span>Warheads</span><span>${N.warheads || 0}</span><span>Nuclear program levels</span><span>${fac}</span><span>Production</span><span>${N.techs.nuclear_weapons && fac >= 2 && g.laws.nuclear !== 'disarm' ? `1 per ${Math.round(40 / fac)} days` : 'none (needs Nuclear Weapons and a Weapons Complex)'}</span><span>Delivery</span><span>${N.techs.icbm ? 'ICBM (global)' : 'Bombers only'}</span><span>Missile defense</span><span>${pct(N.mods.intercept || 0)}</span></div></div>`;
  }
  if (!setHTML(host, h)) return;
  if (s.modern) bindBudget(host, sim, N);
  if (s.ww2) bindWar(host, sim, N, () => renderPanel(true));
  for (const b of host.querySelectorAll('[data-repl]')) b.onclick = () => { G.replRole = G.replRole === b.dataset.repl ? null : b.dataset.repl; renderPanel(true); };
  for (const b of host.querySelectorAll('[data-hire]')) b.onclick = () => { const r = appoint(sim, N, b.dataset.role, +b.dataset.hire); if (!r.ok) toast('Court', r.why, 'warn'); else toast('Court', `${s.chars[+b.dataset.hire].name} appointed.`, 'good'); G.replRole = null; renderPanel(true); };
  for (const b of host.querySelectorAll('[data-law]')) b.onclick = () => { const r = enact(sim, N, b.dataset.law, b.dataset.opt); if (!r.ok) toast('Laws', r.why, 'warn'); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-reform]')) b.onclick = () => { const k = b.dataset.reform; if (!confirm(`Adopt ${GOV_TYPES[k].name} as your form of government?`)) return; const r = reform(sim, N, k); if (!r.ok) toast('Government', r.why, 'warn'); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-form]')) b.onclick = () => { const r = sim.form(P, b.dataset.form); if (!r.ok) toast('Destiny', r.why, 'warn'); renderPanel(true); G.fn.refreshWorld(true); };
}
const prog = p => p.parts.reduce((a, pp) => a + Math.min(1, pp.have / Math.max(1, pp.need)), 0) / Math.max(1, p.parts.length);

// ======================================================================= ages & research
function renderAges(host) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P], R = N.research;
  const A = AGES[N.age], nxt = s.modern ? null : AGES[N.age + 1];
  const have = AGE_TECHS[N.age].filter(t => N.techs[t.id]).length, total = AGE_TECHS[N.age].length, need = Math.ceil(ADVANCE_SHARE * total);
  let h = s.ww2 ? ww2RnD(sim, N) : s.modern ? modernRnD(sim, N) : `<div class="card agecard" style="--ac:${A.color}"><div class="kicker">${dstr()}</div><div class="big">${A.name}</div><div class="sub">${esc(A.blurb)}</div>`;
  if (s.modern) { /* no ages: the frontier summary above */ }
  else if (nxt) {
    h += `<div class="grid2" style="margin-top:10px"><span>${A.short} technologies</span><span>${have} / ${total} (need ${need})</span></div><div class="meter"><i style="width:${pct(have / total)};background:var(--ac)"></i></div>`;
    if (N.ageAdv) h += `<div class="row" style="margin-top:8px"><span class="hi">Entering the ${nxt.name}</span><span class="muted">${N.ageAdv.left}d</span></div><div class="prog"><i style="width:${pct(1 - N.ageAdv.left / N.ageAdv.total)}"></i></div>`;
    else { const chk = sim.canAdvance(P); h += `<div style="margin-top:10px">${btnCost(chk, `Advance to the ${nxt.name}`, 'data-advance="1" class="btn go"')}</div>${why(chk)}`; }
  } else h += '<div class="sub" style="margin-top:8px">The final age. Reach for the stars: research Interstellar Travel and build the Colony Ship.</div>';
  if (!s.modern) h += '</div>';
  const cur = R.cur && TECH[R.cur];
  const cost = cur ? sim.techCostFor(N, R.cur) : 0;
  h += `<div class="card"><div class="kicker">Current research</div><div class="big" style="font-size:18px">${cur ? cur.name : 'Nothing'}</div><div class="sub">${cur ? esc(cur.desc) : 'Choose a technology below or open the tree.'}</div>
    ${cur ? `<div class="prog" style="height:8px;margin-top:10px"><i style="width:${Math.min(100, R.prog / cost * 100)}%"></i></div><div class="small muted" style="margin-top:4px">${fmt(R.prog)} / ${fmt(cost)}${cost < cur.cost ? ` (cheaper: known to neighbours)` : ''} · about ${Math.ceil(Math.max(0, cost - R.prog) / Math.max(0.01, N.st.rp))} days</div>` : ''}
    <div class="grid2" style="margin-top:10px"><span>Learning</span><span>${fmt(N.st.rp)}/day</span><span>Policy</span><span>${lawOpt(N, 'research').name}</span><span>Technologies known</span><span>${Object.keys(N.techs).length} / ${TECHS.length}</span></div>
    <div style="display:flex;gap:6px;margin-top:10px"><button class="btn go" id="opentree">Open the tree of knowledge</button></div></div>`;
  if (R.queue.length) h += `<div class="sec"><div class="sec-title">Queue</div>${R.queue.map((id, k) => `<div class="row"><span>${k + 1}. ${TECH[id].name}</span><button class="btn sm" data-unq="${id}">Remove</button></div>`).join('')}</div>`;
  const av = TECHS.filter(t => canResearch(N, t.id)).sort((a, b) => a.cost - b.cost);
  h += `<div class="sec"><div class="sec-title">Can be studied now</div>${av.map(t => `<div class="row"><span><span class="hi">${t.name}</span> <span class="small muted">${(s.modern && MODERN_BRANCH[t.branch]) || BRANCHES.find(b => b.id === t.branch).name}${t.tier ? ` · tier ${t.tier}` : ''} · ${fmt(sim.techCostFor(N, t.id))}</span><br><span class="small muted">${esc(t.desc)} ${unlockText(t.id)}</span></span><span style="display:flex;gap:4px;flex-direction:column"><button class="btn sm go" data-res="${t.id}">Study</button><button class="btn sm" data-q="${t.id}">Queue</button></span></div>`).join('') || `<div class="muted small">${nxt ? `Every ${A.name} technology you can reach is known. Advance to the ${nxt.name}.` : 'All knowledge is yours.'}</div>`}</div>`;
  if (!setHTML(host, h)) return;
  $('#opentree').onclick = () => openTree();
  host.querySelector('[data-advance]')?.addEventListener('click', () => { const r = sim.advance(P); if (!r.ok) toast('Ages', r.why, 'warn'); else toast('Ages', `Your people begin the passage into the ${nxt.name}.`, 'good'); renderPanel(true); });
  for (const b of host.querySelectorAll('[data-res]')) b.onclick = () => { if (R.cur && R.cur !== b.dataset.res) R.queue.unshift(R.cur); R.cur = b.dataset.res; R.queue = R.queue.filter(x => x !== R.cur); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-q]')) b.onclick = () => { queueTech(N, b.dataset.q); renderPanel(true); };
  for (const b of host.querySelectorAll('[data-unq]')) b.onclick = () => { R.queue = R.queue.filter(x => x !== b.dataset.unq); renderPanel(true); };
}
// the head of government: leader, the polls, the next election and the national budget
function leadershipHTML(sim, N) {
  const g = N.gov, GT = GOV_TYPES[g.type], hist = g.hist || [];
  const left = g.nextElection ? Math.max(0, Math.ceil((g.nextElection - sim.s.t) / 24)) : null;
  const win = Math.max(0.02, Math.min(0.98, (g.approval - 0.48) / 0.16 + 0.5));
  const spark = hist.length > 1 ? (() => { const w = 220, h = 40, pts = hist.slice(-120); const xs = (k) => (k / (pts.length - 1) * w).toFixed(1), ys = v => (h - v / 100 * h).toFixed(1); return `<svg viewBox="0 0 ${w} ${h}" class="spark"><line x1="0" x2="${w}" y1="${ys(50)}" y2="${ys(50)}" stroke="rgba(255,255,255,.15)" stroke-dasharray="3 3"/><polyline fill="none" stroke="var(--teal)" stroke-width="1.6" points="${pts.map((v, k) => xs(k) + ',' + ys(v)).join(' ')}"/></svg>`; })() : '';
  const B = N.budget || BUDGET_BASE;
  return `<div class="sec"><div class="sec-title">Head of government</div>
    <div class="grid2"><span>${esc(GT.ruler)}</span><span><b>${esc(g.leaderName || 'You')}</b></span>
    ${GT.democratic ? `<span>Next election</span><span>${left !== null ? `in ${left} days` : '—'}</span><span>Re-election chances</span><span class="${win > 0.55 ? 'pos' : win < 0.45 ? 'neg' : ''}">${pct(win)}</span>` : '<span>Mandate</span><span class="muted">no elections: watch stability and the generals</span>'}
    ${s_hostile(sim, g) ? '<span>Legislature</span><span class="neg">hostile</span>' : ''}</div>
    ${spark ? `<div class="small muted" style="margin-top:6px">Approval, last ${Math.min(120, hist.length)} days</div>${spark}` : ''}</div>
    <div class="sec"><div class="sec-title">National budget</div><div class="small muted" style="margin-bottom:6px">How discretionary spending is split. Moving one slider rebalances the others.</div>
    ${Object.entries(BUDGET).map(([k, b]) => `<div class="bud-row" title="${esc(b.desc)}"><span>${esc(b.name)}</span><input type="range" min="5" max="60" step="1" value="${Math.round((B[k] || 0) * 100)}" data-bud="${k}"><span class="bud-v">${Math.round((B[k] || 0) * 100)}%</span></div>`).join('')}
    <div class="small muted">${Object.values(BUDGET).map(b => `${b.name}: ${b.desc}`).join(' ')}</div></div>`;
}
const s_hostile = (sim, g) => sim.s.t < (g.hostileUntil || 0);
function bindBudget(host, sim, N) {
  for (const inp of host.querySelectorAll('[data-bud]')) inp.oninput = () => {
    const B = N.budget ||= { ...BUDGET_BASE }, k = inp.dataset.bud, v = +inp.value / 100;
    const others = Object.keys(B).filter(x => x !== k), rest = others.reduce((a, x) => a + B[x], 0) || 1;
    B[k] = v; for (const x of others) B[x] = Math.max(0.03, B[x] / rest * (1 - v));
    const tot = Object.values(B).reduce((a, x) => a + x, 0); for (const x in B) B[x] /= tot;
    for (const el of host.querySelectorAll('[data-bud]')) { el.value = Math.round(B[el.dataset.bud] * 100); el.nextElementSibling.textContent = Math.round(B[el.dataset.bud] * 100) + '%'; }
  };
  for (const inp of host.querySelectorAll('[data-bud]')) inp.onchange = () => { computeMods(sim.s, N); pactMods(sim, N); budgetMods(N); sim.recalcNation(N.code); toast('Budget', 'The new budget passes.', 'good'); };
}
// research & development in the modern world: output, spending and how far along each tier the nation is
function modernRnD(sim, N) {
  const mod = TECHS.filter(x => x.age === 9 && x.tier);
  const NAME = ['', 'Fielded in 2025', 'Near future', 'Next decade', 'Frontier', 'Breakthroughs'];
  const world = Object.values(sim.s.nations).filter(n => n.alive).sort((a, b) => (b.st.rp || 0) - (a.st.rp || 0));
  const rank = world.findIndex(n => n.code === N.code) + 1;
  return `<div class="card"><div class="kicker">${dstr()} · research & development</div><div class="big">${fmt(N.st.rp)} <span class="small muted">research per day</span></div>
    <div class="sub">World rank #${rank} in research output. Spending: ${fmt(N.st.researchSpend || 0)} wealth/day.</div>
    ${[1, 2, 3, 4, 5].map(k => { const L = mod.filter(x => x.tier === k), have = L.filter(x => N.techs[x.id]).length; return `<div class="grid2" style="margin-top:6px"><span>Tier ${k} · ${NAME[k]}</span><span>${have} / ${L.length}</span></div><div class="meter"><i style="width:${pct(have / L.length)}"></i></div>`; }).join('')}</div>`;
}
// what a technology unlocks, as a short string
export function unlockText(id) {
  const out = [];
  for (const U of Object.values(UNITS)) if (U.tech === id) out.push(U.name);
  for (const B of Object.values(BUILDINGS)) for (const L of B.levels) if (L[1] === id) out.push(L[0]);
  for (const [k, I] of Object.entries(IMPROVEMENTS)) if (I.tech === id) out.push(I.name);
  for (const S of SETTLEMENTS) if (S.tech === id) out.push(S.name + 's');
  for (const W of Object.values(WONDERS)) if (W.tech === id) out.push(W.name);
  for (const G2 of Object.values(GOV_TYPES)) if (G2.tech === id) out.push(G2.name);
  for (const [k, R] of Object.entries(RES)) if (R.reveal === id) out.push('reveals ' + R.name);
  for (const L of Object.values(LAWS)) for (const o of L.opts) if (o.req?.tech === id) out.push(o.name);
  if (id === 'rafts') out.push('crossing coastal waters');
  if (id === 'navigation') out.push('crossing the deep ocean');
  return out.length ? '<span style="color:var(--teal)">Unlocks: ' + esc(out.slice(0, 6).join(', ')) + (out.length > 6 ? '…' : '') + '</span>' : '';
}

// ======================================================================= diplomacy
export function openDossier(c) { G.dip = c === G.sim.s.player ? null : c; switchTab('diplomacy'); }
const opBar = v => { const w = Math.abs(v) / 2; return `<span class="opbar" title="Opinion ${Math.round(v)}"><i style="${v >= 0 ? 'left:50%' : `left:${50 - w}%`};width:${w}%;background:${v >= 0 ? 'var(--green)' : 'var(--red)'}"></i></span>`; };
function renderDiplomacy(host) {
  const sim = G.sim, s = sim.s, P = s.player, Me = s.nations[P];
  const inbox = s.messages.filter(m => m.to === P && m.status === 'pending');
  if (G.pact != null && !G.dip && renderPactPage(host)) return;
  if (!G.dip || !Me.known.includes(G.dip)) {
    G.dip = null;
    let list = Me.known.filter(c => s.nations[c]?.alive);
    if (G.dipFilter) list = list.filter(c => sim.nm(c).toLowerCase().includes(G.dipFilter.toLowerCase()));
    list.sort((a, b) => (sim.atWar(P, b) - sim.atWar(P, a)) || (sim.score(b) - sim.score(a)));
    let h = '';
    if (inbox.length) h += `<div class="sec"><div class="sec-title">Proposals awaiting you</div>${inbox.map(m => `<div class="msg"><div class="m-meta">${esc(sim.nm(m.from))} · ${dstr(m.y)}</div>${esc(m.text)}<div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm go" data-ans="${m.id}" data-v="1">Accept</button><button class="btn sm danger" data-ans="${m.id}" data-v="0">Decline</button><button class="btn sm" data-open="${m.from}">Dossier</button></div></div>`).join('')}</div>`;
    h += pactsListHTML(sim);
    h += `<div class="sec"><div class="sec-title">Known peoples (${list.length})</div>`;
    if (!Me.known.length) h += `<div class="muted small">You have met no one yet. Expand your borders, send warriors exploring, or sail the coasts to make contact.</div>`;
    else h += `<input class="inp" id="dip-q" placeholder="Search..." value="${esc(G.dipFilter)}">`;
    h += list.map(c => {
      const r = sim.rel(P, c), N = s.nations[c];
      const unread = s.messages.filter(m => m.from === c && m.to === P && m.unread).length;
      return `<div class="row click" data-open="${c}"><span><span class="flagchip" style="background:${N.color}"></span><span class="hi">${esc(sim.full(c))}</span>${N.overlord === P ? ' <span class="vtag">your vassal</span>' : Me.overlord === c ? ' <span class="vtag lord">your overlord</span>' : N.overlord ? ` <span class="vtag dim">vassal of ${esc(sim.nm(N.overlord))}</span>` : ''}${unread ? ` <b class="badge">${unread}</b>` : ''}<br><span class="small muted">${AGES[N.age].name} · ${N.st.tiles} lands · ${popStr(N.st.pop)}</span></span><span style="text-align:right"><span class="status ${r}">${REL_LABEL[r]}</span><br>${opBar(sim.opinion(c, P))}</span></div>`;
    }).join('');
    h += '</div>';
    if (!setHTML(host, h)) return;
    bindPactsList(host);
    const q = $('#dip-q'); if (q) q.oninput = () => { G.dipFilter = q.value; renderPanel(true); const x = $('#dip-q'); x.focus(); x.setSelectionRange(G.dipFilter.length, G.dipFilter.length); };
    for (const b of host.querySelectorAll('[data-open]')) b.onclick = e => { e.stopPropagation(); openDossier(b.dataset.open); };
    for (const b of host.querySelectorAll('[data-ans]')) b.onclick = e => { e.stopPropagation(); answer(s.messages.find(m => m.id === +b.dataset.ans), b.dataset.v === '1'); };
    return;
  }
  const c = G.dip, N = s.nations[c];
  for (const m of s.messages) if (m.from === c && m.to === P) m.unread = false;
  const r = sim.rel(P, c);
  const allies = sim.alliesOf(c), wars = sim.warsOf(c);
  const msgs = s.messages.filter(m => (m.from === c && m.to === P) || (m.from === P && m.to === c)).slice(-12);
  const embargo = s.sanctions.some(x => x.by === P && x.on === c);
  const guaranteed = s.guarantees.some(x => x.by === P && x.of === c);
  const envoy = s.chars[N.gov.cabinet.foreign];
  let h = `<span class="chip" id="dip-back">&#9666; All peoples</span>
    <div class="card" style="margin-top:8px"><div class="big" style="color:${N.color}">${esc(sim.full(c))}</div>${repChips(N)}<div class="sub">${GOV_TYPES[N.gov.type].name} · ${AGES[N.age].name}${N.alive ? '' : ' · fallen'}${N.overlord ? ` · ${N.overlord === P ? '<span style="color:var(--gold)">your vassal</span>' : `vassal of the ${esc(sim.nm(N.overlord))}`}` : ''}${Me.overlord === c ? ' · <span style="color:var(--gold)">your overlord</span>' : ''}${sim.vassalsOf(c).length ? ` · ${sim.vassalsOf(c).length} vassal${sim.vassalsOf(c).length > 1 ? 's' : ''}` : ''}</div>
    <div class="grid2" style="margin-top:8px">
      <span>Relation</span><span><span class="status ${r}">${REL_LABEL[r]}</span></span>
      <span>Their opinion of you</span><span>${Math.round(sim.opinion(c, P))} ${opBar(sim.opinion(c, P))}${Math.abs(repOpinion(sim, c, P)) >= 1 ? `<br><span class="small muted">${repOpinion(sim, c, P) > 0 ? '+' : ''}${Math.round(repOpinion(sim, c, P))} from your reputation and shared pacts</span>` : ''}</span>
      <span>Pacts</span><span>${pactsOf(sim, c).map(x => `<span class="pact-link" data-pactlink="${x.id}" style="color:${x.color}">${esc(x.name)}</span>`).join(', ') || '<span class="muted">none</span>'}</span>
      <span>Lands / people</span><span>${N.st.tiles} / ${popStr(N.st.pop)}</span>
      <span>Military strength</span><span>${fmt(sim.power(c))} <span class="muted">(you ${fmt(sim.power(P))})</span></span>
      <span>Technologies</span><span>${Object.keys(N.techs).length} <span class="muted">(you ${Object.keys(Me.techs).length})</span></span>
      ${s.cultures ? `<span>People · faith</span><span>${esc(s.cultures[N.cul]?.adj || '?')} · <span style="color:${s.faiths[N.faith]?.col}">${esc(s.faiths[N.faith]?.name || '?')}</span>${N.faith === Me.faith ? ' <span class="pos small">(ours)</span>' : ''}</span>` : ''}
      <span>Stability</span><span>${pct(N.gov.stability)}</span>
      <span>War weariness</span><span>${pct(N.exhaustion)}</span>
      <span>Envoy</span><span>${envoy ? esc(envoy.name) : '—'}</span>
      ${N.warheads ? `<span>Nuclear arsenal</span><span>${(Me.mods.covert || 0) > 0.2 ? N.warheads + ' warheads' : 'confirmed'}</span>` : ''}
    </div>
    <div class="small" style="margin-top:6px"><span class="muted">Strategic goods:</span> ${STRATEGIC.filter(k => N.access?.[k] && known(Me, k)).map(k => RES[k].icon + ' ' + RES[k].name).join(', ') || 'none known'}<br><span class="muted">Allies:</span> ${allies.map(a => `<span style="color:${sim.col(a)}">${a === P ? 'You' : esc(sim.nm(a))}</span>`).join(', ') || 'none'}<br><span class="muted">At war with:</span> ${wars.map(a => `<span style="color:${sim.col(a)}">${a === P ? 'You' : esc(sim.nm(a))}</span>`).join(', ') || 'none'}</div></div>`;
  if (N.alive) {
    const gift = Math.max(1, Math.round(3 * ageScale(Me.age)));
    if (N.overlord === P) {
      const ic = sim.canIntegrate(P, c), out = N.tribOut || {};
      h += `<div class="sec vassal-sec"><div class="sec-title">Your vassal</div>
        <div class="grid2"><span>Vassal for</span><span>${Math.floor((s.t - (N.vassalSince || 0)) / 24)} days</span><span>Their loyalty (opinion)</span><span>${Math.round(sim.opinion(c, P))} ${opBar(sim.opinion(c, P))}</span><span>Tribute received</span><span>${costStr(out) || 'nothing yet'}/day</span></div>
        <div class="row" style="margin-top:6px"><span>Tribute</span><select class="inp sm" id="v-trib">${[[0.1, 'Light (10%): they grow fond of us'], [0.25, 'Standard (25%)'], [0.4, 'Heavy (40%): they resent it']].map(([v, l]) => `<option value="${v}" ${Math.abs((N.tribute ?? 0.25) - v) < 0.01 ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="small muted" style="margin:4px 0 8px">Vassals pay a share of their output and food surplus each day, lend you their strategic resources and luxuries, and fight in your wars. Their land counts half toward dominion. Too much resentment, or too little strength on your part, and they will rise up.</div>
        <div class="actions"><button class="btn go" data-act="integrate" ${ic.ok ? '' : `disabled title="${esc(ic.why)}"`}>Integrate fully (${sim.integrateCost(P, c)} influence)</button><button class="btn" data-act="release">Release them</button></div>${ic.ok ? '' : `<div class="small muted" style="margin-top:4px">${esc(ic.why)}</div>`}</div>`;
    } else if (Me.overlord === c) {
      const out = Me.tribOut || {};
      h += `<div class="sec vassal-sec"><div class="sec-title">Your overlord</div><div class="small">You are a vassal of the ${esc(sim.full(c))}. You pay ${Math.round((Me.tribute ?? 0.25) * 100)}% tribute (${costStr(out) || 'nothing yet'}/day) and must join their wars.</div>
        <div class="actions" style="margin-top:8px"><button class="btn danger" data-act="independence">Declare independence (war)</button></div></div>`;
    }
    const canVass = !Me.overlord && !N.overlord && Me.overlord !== c;
    h += `<div class="sec"><div class="sec-title">Treaties</div><div class="actions">
      ${canVass ? (r === 'war' ? '<button class="btn go" data-act="vassalPeace" title="End the war on condition they become your vassal">Peace: they become our vassal</button>' : '<button class="btn" data-act="vassal" title="Demand they swear fealty: tribute, shared resources, and their armies at your side">Demand vassalage</button>') : '<span></span>'}
      <button class="btn" data-act="nap" ${r !== 'peace' ? 'disabled' : ''}>Non-aggression pact</button>
      <button class="btn" data-act="alliance" ${r === 'alliance' || r === 'war' ? 'disabled' : ''}>Propose alliance</button>
      ${r === 'war' ? '<button class="btn go" data-act="peace">Offer peace</button>' : N.overlord === P || Me.overlord === c ? '<span></span>' : '<button class="btn danger" data-act="war">Declare war</button>'}
      ${N.overlord === P || Me.overlord === c ? '<span></span>' : r === 'alliance' ? '<button class="btn danger" data-act="break">End alliance</button>' : r === 'nap' ? '<button class="btn danger" data-act="break">End pact</button>' : '<span></span>'}
      ${pactsOf(sim, P).some(x => canJoin(sim, x, c).ok) ? '<button class="btn" data-act="pactInvite">Invite to a pact &#9656;</button>' : ''}
    </div></div>
    <div class="sec"><div class="sec-title">Statecraft</div><div class="actions">
      <button class="btn" data-act="gift" data-amt="${gift}" ${Me.age < 1 ? 'data-good="food"' : 'data-good="wealth"'}>Send gifts (${gift} ${Me.age < 1 ? 'food' : 'wealth'})</button>
      <button class="btn" data-act="tribute" ${r === 'war' ? 'disabled' : ''}>Demand tribute &#9656;</button>
      <button class="btn" data-act="demand" ${r === 'war' ? 'disabled' : ''}>Demand land &#9656;</button>
      <button class="btn" data-act="swap">Exchange knowledge &#9656;</button>
      <button class="btn" data-act="share">Gift knowledge &#9656;</button>
      <button class="btn" data-act="guarantee" ${guaranteed || r === 'war' ? 'disabled' : ''}>Guarantee independence</button>
      <button class="btn ${embargo ? '' : 'danger'}" data-act="embargo">${embargo ? 'Lift embargo' : 'Trade embargo'}</button>
      ${wars.filter(x => x !== P).length ? '<button class="btn" data-act="join">Join their war &#9656;</button><button class="btn" data-act="mediate">Mediate peace &#9656;</button>' : ''}
      ${r === 'alliance' && sim.warsOf(P).some(t => !sim.atWar(c, t)) ? '<button class="btn" data-act="joint">Call to arms &#9656;</button>' : ''}
    </div><div id="sub-box"></div></div>`;
    if (Me.age >= 1) h += `<div class="sec"><div class="sec-title">Spies</div><div class="small muted" style="margin-bottom:6px">Success chance about ${pct(Math.max(0.08, Math.min(0.9, 0.42 + (Me.mods.covert || 0) + (Me.spyBonus || 0) - (N.mods.covert || 0) * 0.6)))}. Exposure angers them.</div><div class="actions">
      <button class="btn" data-op="steal">Steal knowledge (${sim.covertCost(P, 'steal')}🪙)</button>
      <button class="btn" data-op="sabotage">Sabotage works (${sim.covertCost(P, 'sabotage')}🪙)</button>
      <button class="btn" data-op="unrest">Stir unrest (${sim.covertCost(P, 'unrest')}🪙)</button>
      <button class="btn" data-op="insurgents" title="Arm and fund a restless people or faction inside their realm">Fund insurgents (${sim.covertCost(P, 'insurgents')}🪙)</button>
      <button class="btn" data-op="cyber" ${Me.techs.cyber_warfare ? '' : 'disabled title="Requires Cyber Warfare"'}>Cyber attack (${sim.covertCost(P, 'cyber')}🪙)</button>
    </div></div>`;
    const resOpts = [...STRATEGIC, ...LUXURIES].filter(k => known(Me, k) && (N.access?.[k] || Me.access?.[k]));
    h += `<div class="sec"><div class="sec-title">Trade</div>
      <div class="actions"><select class="inp" id="tr-dir"><option value="buy">We buy from them</option><option value="sell">We sell to them</option></select>
      <select class="inp" id="tr-good">${GOODS.filter(g => g !== 'oil' || Me.age >= 6).map(g => `<option value="${g}">${STOCK_ICON[g]} ${STOCK_NAME[g]}</option>`).join('')}${resOpts.map(k => `<option value="res:${k}">${RES[k].icon} ${RES[k].name} (access)</option>`).join('')}</select>
      <input class="inp" id="tr-amt" type="number" min="0.1" step="0.1" value="${(0.5 * ageScale(Me.age)).toFixed(1)}" title="Units per day"><input class="inp" id="tr-price" type="number" step="0.01" value="${s.prices.food.toFixed(2)}" title="Wealth per unit"></div>
      <div class="small muted" style="margin:4px 0">Goods: amount per day and price in wealth each. Resource access: a daily fee for the use of a strategic resource or luxury. Their surplus: ${GOODS.map(g => `${STOCK_ICON[g]}${sgn(N.st.net[g] || 0)}`).join(' ')}</div>
      <button class="btn" id="tr-send">Propose trade</button></div>`;
  }
  const deals = s.trades.filter(t => (t.from === P && t.to === c) || (t.from === c && t.to === P));
  if (deals.length) h += `<div class="sec"><div class="sec-title">Deals with them (${deals.length})</div>${tradeRows(deals)}</div>`;
  h += `<div class="sec"><div class="sec-title">Messages</div>${msgs.map(m => `<div class="msg ${m.from === P ? 'out' : ''}"><div class="m-meta">${m.from === P ? 'You' : esc(sim.nm(c))} · ${dstr(m.y)}${m.status && m.status !== 'pending' ? ' · ' + m.status : ''}</div>${esc(m.text)}${m.status === 'pending' && m.from === c ? `<div style="display:flex;gap:6px;margin-top:6px"><button class="btn sm go" data-ans="${m.id}" data-v="1">Accept</button><button class="btn sm danger" data-ans="${m.id}" data-v="0">Decline</button></div>` : ''}</div>`).join('') || '<div class="muted small">No messages.</div>'}</div>`;
  if (!setHTML(host, h)) return;
  $('#dip-back').onclick = () => { G.dip = null; renderPanel(true); };
  for (const l of host.querySelectorAll('[data-pactlink]')) l.onclick = () => { G.dip = null; G.pact = +l.dataset.pactlink; renderPanel(true); };
  for (const b of host.querySelectorAll('[data-ans]')) b.onclick = () => answer(s.messages.find(m => m.id === +b.dataset.ans), b.dataset.v === '1');
  for (const b of host.querySelectorAll('[data-act]')) b.onclick = () => dipAct(c, b.dataset.act, b.dataset);
  host.querySelector('#v-trib')?.addEventListener('change', e => { N.tribute = +e.target.value; toast('Vassals', `Tribute from the ${sim.nm(c)} set to ${Math.round(N.tribute * 100)}%.`, ''); renderPanel(true); });
  bindTradeRows(host);
  for (const b of host.querySelectorAll('[data-op]')) b.onclick = () => { const res = sim.covert(P, c, b.dataset.op); toast('Spies', res.why, res.ok ? 'good' : 'warn'); renderPanel(true); };
  const good = $('#tr-good'); if (good) good.onchange = () => { const g = good.value; if (g.startsWith('res:')) { $('#tr-amt').value = 1; $('#tr-price').value = (0.06 * ageScale(Me.age)).toFixed(2); } else $('#tr-price').value = s.prices[g].toFixed(2); };
  const send = $('#tr-send'); if (send) send.onclick = () => {
    const dir = $('#tr-dir').value, g = $('#tr-good').value, amt = g.startsWith('res:') ? 1 : Math.max(0.05, +$('#tr-amt').value || 0.5), price = Math.max(0.001, +$('#tr-price').value || 0.5);
    propose(c, { type: 'trade', good: g, amount: amt, price, from: dir === 'buy' ? c : P, to: dir === 'buy' ? P : c });
  };
}
function subPick(title, items, onPick) {
  const box = $('#sub-box'); if (!box) return;
  box.innerHTML = `<div class="small muted" style="margin:8px 0 4px">${title}</div>` + (items.length ? items.map(([v, l]) => `<button class="btn sm" data-sp="${esc(v)}" style="margin:2px">${l}</button>`).join('') : '<div class="small muted">Nothing to offer.</div>');
  for (const b of box.querySelectorAll('[data-sp]')) b.onclick = () => onPick(b.dataset.sp);
  G.pointerDown = true; setTimeout(() => { G.pointerDown = false; }, 5000);
}
function dipAct(c, act, data) {
  const sim = G.sim, s = sim.s, P = s.player, Me = s.nations[P], T = s.nations[c];
  const done = () => { renderPanel(true); G.fn.refreshWorld(false); };
  const res = r => { toast('Diplomacy', r.why || (r.ok ? 'Done.' : 'Not possible.'), r.ok ? 'good' : 'warn'); done(); };
  if (act === 'war') { if (!confirm(`Declare war on the ${sim.nm(c)}? Their allies may join them.`)) return; sim.message(P, c, 'We declare war upon you.'); sim.declareWar(P, c); return done(); }
  if (act === 'break') { if (!confirm('End the treaty? This angers them.')) return; sim.setRel(P, c, 'peace'); sim.addOpinion(c, P, -25); sim.emit('treaty', `The ${sim.nm(P)} end their treaty with the ${sim.nm(c)}.`, [P, c]); return done(); }
  if (act === 'gift') return res(sim.gift(P, c, data.good, +data.amt));
  if (act === 'release') { if (!confirm(`Release the ${sim.nm(c)} from vassalage?`)) return; return res(sim.releaseVassal(P, c)); }
  if (act === 'integrate') { if (!confirm(`Fully integrate the ${sim.nm(c)}? Their lands, armies and stores become yours.`)) return; return res(sim.integrateVassal(P, c)); }
  if (act === 'independence') { if (!confirm(`Declare independence from the ${sim.nm(c)}? This means war.`)) return; return res(sim.declareIndependence(P)); }
  if (act === 'guarantee') return res(sim.guarantee(P, c));
  if (act === 'embargo') { const lift = s.sanctions.some(x => x.by === P && x.on === c); return res(sim.sanction(P, c, lift)); }
  if (act === 'tribute') { const a = ageScale(T.age); return subPick('Demand that they pay:', [['food', `${Math.round(10 * a)} food`], ['wood', `${Math.round(8 * a)} wood`], ...(T.age >= 1 ? [['wealth', `${Math.round(8 * a)} wealth`], ['metal', `${Math.round(5 * a)} metal`]] : [])], g => res(sim.tribute(P, c, g, Math.round({ food: 10, wood: 8, wealth: 8, metal: 5 }[g] * a)))); }
  if (act === 'demand') { const regs = sim.regionsOf(c).filter(r => G.world.adj[r.i].some(j => s.regions[j].owner === P)).map(r => [r.i, G.world.regions[r.i].name]); return subPick('Demand that they cede:', regs, v => { if (confirm(`Demand ${G.world.regions[+v].name}?`)) res(sim.demand(P, c, +v)); }); }
  if (act === 'join') return subPick('Declare war on their enemy:', sim.warsOf(c).filter(x => x !== P && !sim.atWar(P, x)).map(x => [x, sim.nm(x)]), v => { if (!confirm(`Join the ${sim.nm(c)} in their war against the ${sim.nm(v)}?`)) return; sim.declareWar(P, v); sim.addOpinion(c, P, 25); done(); });
  if (act === 'mediate') return subPick('Mediate between them and:', sim.warsOf(c).filter(x => x !== P).map(x => [x, sim.nm(x)]), v => res(sim.mediate(P, c, v)));
  if (act === 'share') return subPick('Teach them:', Object.keys(Me.techs).filter(id => !T.techs[id] && TECH[id].age <= T.age && TECH[id].req.every(q => T.techs[q])).map(id => [id, TECH[id].name]), v => res(sim.shareTech(P, c, v)));
  if (act === 'swap') {
    const give = Object.keys(Me.techs).filter(id => !T.techs[id] && TECH[id].age <= T.age && TECH[id].req.every(q => T.techs[q]));
    const get = Object.keys(T.techs).filter(id => !Me.techs[id] && TECH[id].age <= Me.age && TECH[id].req.every(q => Me.techs[q]));
    if (!give.length || !get.length) return toast('Diplomacy', !get.length ? 'They know nothing we could learn.' : 'We have nothing they could learn.', 'warn');
    return subPick('We would like to learn:', get.map(id => [id, TECH[id].name]), want => subPick(`In exchange for ${TECH[want].name}, we teach:`, give.map(id => [id, TECH[id].name]), offer => propose(c, { type: 'techswap', give: offer, get: want })));
  }
  if (act === 'pactInvite') return subPick('Invite them to:', pactsOf(sim, P).filter(x => canJoin(sim, x, c).ok).map(x => [x.id, x.name]), v => res(invite(sim, s.pacts.find(x => x.id === +v), P, c)));
  if (act === 'joint') return subPick('Ask them to join your war against:', sim.warsOf(P).filter(t => !sim.atWar(c, t)).map(x => [x, sim.nm(x)]), v => propose(c, { type: 'joint', target: v }));
  propose(c, { type: act });
}
function propose(c, p) {
  const sim = G.sim, s = sim.s, P = s.player;
  const good = p.good?.startsWith('res:') ? RES[p.good.slice(4)].name + ' access' : p.good;
  const desc = { nap: 'We propose a pact of non-aggression.', alliance: 'We propose an alliance between our peoples.', peace: 'We propose an end to this war.',
    joint: `We ask you to join our war against the ${sim.nm(p.target)}.`, vassal: 'Swear fealty to us. Pay tribute, and we will protect you.', vassalPeace: 'This war ends when you submit as our vassal.', techswap: `We offer the knowledge of ${TECH[p.give]?.name} in exchange for ${TECH[p.get]?.name}.`,
    trade: p.from === P ? `We offer you ${good}${p.good?.startsWith('res:') ? '' : ` (${p.amount}/day)`} at ${p.price} wealth${p.good?.startsWith('res:') ? ' per day' : ' each'}.` : `We wish to buy ${good}${p.good?.startsWith('res:') ? '' : ` (${p.amount}/day)`} at ${p.price} wealth${p.good?.startsWith('res:') ? ' per day' : ' each'}.` }[p.type];
  const sent = sim.message(P, c, desc); sent.unread = false;
  const r = G.ai.evaluate(c, P, p);
  const dip = s.nations[P].mods.diplo || 0;
  if (!r.ok && Math.random() < dip * 0.5) { r.ok = true; r.why = 'Your envoy\'s eloquence wins them over.'; }
  renderPanel(true);
  setTimeout(() => {
    if (r.ok) applyProposal(c, P, p); else sim.addOpinion(c, P, -1);
    sim.message(c, P, (r.ok ? 'Agreed. ' : 'Declined. ') + r.why);
    renderPanel(true); G.fn.refreshWorld(false);
  }, 500 + Math.random() * 600);
}
function applyProposal(a, b, p) {
  const sim = G.sim;
  if (p.type === 'nap') { sim.setRel(a, b, 'nap'); sim.emit('treaty', `The ${sim.nm(a)} and the ${sim.nm(b)} swear a pact of non-aggression.`, [a, b]); }
  if (p.type === 'alliance') { sim.setRel(a, b, 'alliance'); sim.addOpinion(a, b, 10); sim.emit('treaty', `The ${sim.nm(a)} and the ${sim.nm(b)} form an alliance.`, [a, b]); }
  if (p.type === 'peace') sim.makePeace(a, b);
  if (p.type === 'trade') {
    const t = sim.addTrade(p.from, p.to, p.good, p.amount, p.price);
    if (!t) { toast('Trade', `The deal with the ${sim.nm(a === sim.s.player ? b : a)} could not start: no trade route connects you (both peoples need Sailing to trade by sea), or an embargo is in force.`, 'warn'); return false; }
    const P = sim.s.player, exp = p.from === P, other = exp ? p.to : p.from;
    const what = p.good.startsWith('res:') ? RES[p.good.slice(4)].name + ' access' : `${fmt(p.amount)} ${p.good}/day`;
    if (a === P || b === P) toast('Trade deal in force', exp ? `You now send ${what} to the ${sim.nm(other)} for ${fmt(p.amount * p.price)} wealth/day. See Realm, Trade deals.` : `The ${sim.nm(other)} now send you ${what} for ${fmt(p.amount * p.price)} wealth/day. See Realm, Trade deals.`, 'good', () => { switchTab('realm'); setTimeout(() => $('#trade-sec')?.scrollIntoView({ block: 'start' }), 30); });
    sim.emit('trade', `The ${sim.nm(p.from)} will supply ${sim.goodName(p.good)} to the ${sim.nm(p.to)}.`, [p.from, p.to]);
  }
  if (p.type === 'joint') { const ally = a === sim.s.player ? b : a; sim.declareWar(ally, p.target); }
  if (p.type === 'pactInvite' || p.type === 'pactApply') return applyPactProposal(sim, a, b, p);
  // a is the foreign ruler, b the player
  if (p.type === 'vassal' || p.type === 'vassalPeace' || p.type === 'vassalOffer') sim.makeVassal(a, b, p.type === 'vassalPeace' ? 'war' : 'treaty');
  if (p.type === 'vassalDemand') sim.makeVassal(b, a, sim.atWar(a, b) ? 'war' : 'treaty');
  if (p.type === 'techswap') { const A = sim.s.nations[a], B = sim.s.nations[b]; A.techs[p.give] = 1; B.techs[p.get] = 1; sim.addOpinion(a, b, 8); sim.emit('treaty', `The ${sim.nm(a)} and the ${sim.nm(b)} exchange knowledge: ${TECH[p.give].name} for ${TECH[p.get].name}.`, [a, b]); }
  return true;
}
export function answer(m, yes) {
  if (!m || m.status !== 'pending') return;
  const sim = G.sim, P = sim.s.player;
  m.status = yes ? 'accepted' : 'declined'; m.unread = false;
  dropToast(m.id);
  const p = m.proposal;
  answeredCall(sim, m, yes);
  if (yes) {
    if (p.type === 'callToArms') { sim.declareWar(P, p.against); sim.addOpinion(m.from, P, 15); }
    else if (applyProposal(m.from, P, p) === false) { m.status = 'failed'; renderPanel(true); return; }
    sim.addOpinion(m.from, P, 4);
  }
  else {
    sim.addOpinion(m.from, P, p.type === 'callToArms' ? -35 : p.type === 'vassalDemand' ? -15 : -4);
    if (p.type === 'vassalDemand' && !sim.atWar(m.from, P) && Math.random() < (sim.s.nations[m.from].traits.aggression || 0.5) * 0.7) sim.declareWar(m.from, P);
    if (p.type === 'callToArms' && sim.rel(P, m.from) === 'alliance') { sim.setRel(P, m.from, 'peace'); sim.emit('treaty', `The ${sim.nm(m.from)} end their alliance with the ${sim.nm(P)}, feeling betrayed.`, [m.from, P]); }
  }
  renderPanel(true); G.fn.refreshWorld(false);
}

// ======================================================================= world
function renderWorld(host) {
  const sim = G.sim, s = sim.s, P = s.player, Me = s.nations[P];
  const alive = Object.values(s.nations).filter(n => n.alive);
  const ages = AGES.map((A, a) => alive.filter(n => n.age === a).length);
  let h = `<div class="card"><div class="big">${dstr()}</div><div class="sub">${alive.length} of up to ${s.maxCivs || 200} civilizations · ${sim.landIdx.filter(i => s.regions[i].owner).length} of ${sim.landIdx.length} lands claimed</div><div class="row" style="margin-top:6px"><span class="small">New peoples rise and empires break apart</span><button class="btn sm ${s.emergence ? 'on' : ''}" data-emerge="1">${s.emergence ? 'On' : 'Off'}</button></div>
    <div class="agebars">${AGES.map((A, a) => ages[a] ? `<div style="flex:${ages[a]};--ac:${A.color}" title="${A.name}: ${ages[a]}"><span>${A.short} ${ages[a]}</span></div>` : '').join('')}</div></div>`;
  const known = alive.filter(n => n.code === P || Me.known.includes(n.code)).sort((a, b) => sim.score(b.code) - sim.score(a.code));
  h += `<div class="sec"><div class="sec-title">Greatest peoples you know</div>${known.slice(0, 10).map((n, k) => `<div class="row ${n.code === P ? '' : 'click'}" ${n.code === P ? '' : `data-dossier="${n.code}"`}><span>${k + 1}. <span class="flagchip" style="background:${n.color}"></span>${esc(sim.full(n.code))}</span><span class="muted small">${AGES[n.age].short} · ${n.st.tiles} lands · ${sim.score(n.code)}</span></div>`).join('')}</div>`;
  const wonders = Object.entries(s.wonders);
  h += `<div class="sec"><div class="sec-title">Wonders of the world (${wonders.length}/${Object.keys(WONDERS).length})</div>${wonders.map(([id, c]) => `<div class="row"><span>🏛️ ${WONDERS[id].name}</span><span class="small" style="color:${sim.col(c)}">${Me.known.includes(c) || c === P ? esc(sim.nm(c)) : 'a distant people'}</span></div>`).join('') || '<div class="muted small">None yet.</div>'}</div>`;
  const lords = alive.filter(n => sim.vassalsOf(n.code).length && (n.code === P || Me.known.includes(n.code)));
  if (lords.length) h += `<div class="sec"><div class="sec-title">Empires and their subjects</div>${lords.map(n => `<div class="row"><span><span class="flagchip" style="background:${n.color}"></span>${esc(sim.nm(n.code))}</span><span class="small muted">${sim.vassalsOf(n.code).map(v => esc(sim.nm(v))).join(', ')}</span></div>`).join('')}</div>`;
  const formed = Object.entries(s.formed);
  if (formed.length) h += `<div class="sec"><div class="sec-title">Great powers proclaimed</div>${formed.map(([id, c]) => `<div class="row"><span>${esc(sim.formables.find(f => f.id === id)?.title || id)}</span><span class="small" style="color:${sim.col(c)}">${esc(sim.nm(c))}</span></div>`).join('')}</div>`;
  const wars = Object.entries(s.rel).filter(([, v]) => v === 'war').map(([k]) => k.split('|')).filter(([a, b]) => [a, b].some(x => x === P || Me.known.includes(x)));
  h += `<div class="sec"><div class="sec-title">Wars (${wars.length})</div>${wars.map(([a, b]) => `<div class="row"><span><span style="color:${sim.col(a)}">${esc(sim.nm(a))}</span> <span class="muted">vs</span> <span style="color:${sim.col(b)}">${esc(sim.nm(b))}</span></span><span class="muted small">${s.regions.filter(r => r.owner === a && r.core === b).length} / ${s.regions.filter(r => r.owner === b && r.core === a).length} lands taken</span></div>`).join('') || '<div class="muted small">No wars that you know of.</div>'}</div>`;
  const pl = plagueStatus(sim), cr = (s.crises || []).filter(C => s.t < C.until);
  if (pl || cr.length) h += `<div class="sec"><div class="sec-title">World crises</div>${pl ? `<div class="row"><span class="warn-text">Pandemic: ${esc(pl.name)}</span><span class="small muted">${pl.lands} lands sick · day ${pl.days}</span></div>` : ''}${cr.map(C => `<div class="row"><span class="warn-text">${esc(C.name)}</span><span class="small muted">${Math.ceil((C.until - s.t) / 24)} days left</span></div>`).join('')}</div>`;
  const co = (s.coalitions || []).filter(C => C.target === P || Me.known.includes(C.target));
  if (co.length) h += `<div class="sec"><div class="sec-title">Coalitions</div>${co.map(C => `<div class="row"><span>Against <span style="color:${sim.col(C.target)}">${esc(sim.nm(C.target))}</span>${C.members.some(m => sim.atWar(m, C.target)) ? ' <span class="warn-text small">at war</span>' : ''}</span><span class="small muted">${C.members.length} members</span></div>`).join('')}</div>`;
  const F = { all: 'All', vassal: 'Vassals', rise: 'New peoples', age: 'Ages', war: 'War', capture: 'Conquest', treaty: 'Treaties', trade: 'Trade', tech: 'Learning', gov: 'Politics', faith: 'Faith', unrest: 'Unrest', disaster: 'Crises', wonder: 'Wonders' };
  h += `<div class="sec"><div class="sec-title">Chronicle</div><div class="filters">${Object.entries(F).map(([k, v]) => `<span class="chip ${G.intelFilter === k ? 'on' : ''}" data-f="${k}">${v}</span>`).join('')}</div>`;
  const vis = e => e.major || e.nations?.includes(P) || Me.known.some(c => e.nations?.includes(c));
  const items = s.events.filter(e => vis(e) && (G.intelFilter === 'all' ? e.kind !== 'loss' : e.kind === G.intelFilter || (G.intelFilter === 'treaty' && e.kind === 'peace') || (G.intelFilter === 'unrest' && e.kind === 'terror') || (G.intelFilter === 'wonder' && e.kind === 'formed'))).slice(-120).reverse();
  h += items.map((e, k) => `<div class="log-item ${e.kind}" data-ev="${k}"><span class="lt">${dstr(e.y)}</span>${esc(e.text)}</div>`).join('') || '<div class="muted small">Nothing recorded.</div>';
  h += '</div>';
  if (!setHTML(host, h)) return;
  for (const c of host.querySelectorAll('[data-f]')) c.onclick = () => { G.intelFilter = c.dataset.f; renderPanel(true); };
  host.querySelector('[data-emerge]')?.addEventListener('click', () => { s.emergence = !s.emergence; toast('World', s.emergence ? 'New peoples may now rise during the game.' : 'No new civilizations will appear.', ''); renderPanel(true); });
  for (const el of host.querySelectorAll('[data-ev]')) el.onclick = () => { const e = items[+el.dataset.ev]; if (e.loc !== undefined) { G.fn.flyTile(e.loc, 1.9); G.fn.selectRegion(e.loc); } };
}
void ROLES; void lawCost;
