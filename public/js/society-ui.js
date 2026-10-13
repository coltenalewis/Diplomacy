// Society tab, the "People" section of the land panel, and the culture / faith / unrest map lenses.
import { lensPactColor, pactsLegend } from './pacts-ui.js';
import { SETTLEMENTS } from './units.js';
import { GOV_TYPES, LAWS, lawOpt, TRAITS } from './gov.js';
import { G, esc, pct, popStr, toast, setHTML, fmt } from './ui.js';
import {
  FAITH_KIND, REVOLT_NAME, provincesOf, provinceGovernor, candidates, officialCost, appointGovernor, dismissGovernor, appointMayor, canGovern, canMayor,
  governorTitle, mayorTitle, cultureShares, faithShares, adoptFaith, missionCost, canMission, movementsOf, movementTiles, crackdown, concede, concessionCost,
  grantAutonomy, unrestCauses, societyContext, cultureName, faithName,
} from './society.js';
import { adminCap, heatLabel, infamyLabel, infamyLimit, coalitionAgainst, reachKm } from './pressure.js';

const traitChips = c => c.traits.map(t => `<span class="trait ${['Corrupt', 'Ambitious'].includes(t) ? 'bad' : ''}" title="${esc(TRAITS[t]?.desc || '')}">${t}</span>`).join('');
const MOV_LABEL = { separatist: 'Separatists', sectarian: 'Sectarian militants', revolutionary: 'Revolutionaries' };
const bar = (v, col) => `<div class="meter"><i style="width:${pct(Math.max(0, Math.min(1, v)))};background:${col}"></i></div>`;
const unrestCol = u => u > 0.6 ? 'var(--red)' : u > 0.35 ? 'var(--orange, #ffb547)' : 'var(--teal)';
const hslHex = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l); const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join(''); };
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

// ---------------------------------------------------------------- land panel: who lives here
export function tileSocietyHTML(i) {
  const sim = G.sim, s = sim.s, r = s.regions[i], P = s.player;
  if (!s.cultures || r.sea) return '';
  const O = r.owner && s.nations[r.owner];
  const C = s.cultures[r.cul], F = s.faiths[r.rel];
  let h = `<div class="sec"><div class="sec-title">People</div><div class="grid2">`;
  h += `<span>People</span><span><span class="flagchip" style="background:${C?.col || '#888'}"></span>${esc(C?.adj || '—')}${O && r.cul !== O.cul && r.pop > 0.05 ? ` <span class="small muted">· assimilating ${pct(r.assim || 0)}</span>` : ''}</span>`;
  h += `<span>Faith</span><span><span class="flagchip" style="background:${F?.col || '#888'}"></span>${esc(F?.name || '—')}${F && F.holy === i ? ' <span class="small" style="color:var(--gold)">✦ holy city</span>' : ''}</span>`;
  const pid = sim.provOf[i];
  if (pid) {
    const gv = O && provinceGovernor(sim, O, pid);
    h += `<span>Province</span><span>${esc(sim.provs[pid].name)}</span>`;
    if (O) h += `<span>${governorTitle(O.age)}</span><span>${gv ? `${esc(gv.name)} <span class="small muted">skill ${gv.skill}</span>` : '<span class="muted">none</span>'}</span>`;
  }
  if (O && r.lvl >= 3) { const my = r.mayor && s.chars[r.mayor]; h += `<span>${mayorTitle(O.age)}</span><span>${my ? `${esc(my.name)} <span class="small muted">skill ${my.skill}</span>` : '<span class="muted">none</span>'}</span>`; }
  h += '</div>';
  if (r.revolt) {
    const ours = s.units.filter(u => u.loc === i && u.nation === r.owner && !u.move).length;
    h += `<div class="card" style="border-color:rgba(255,93,93,.55);margin-top:8px"><div class="warn-text">${REVOLT_NAME[r.revolt.kind]} · day ${Math.floor((s.t - r.revolt.since) / 24)}</div>
      <div class="grid2 small"><span>Rebel strength</span><span>${r.revolt.str.toFixed(1)}</span><span>Troops holding the town</span><span>${ours}</span></div>
      <div class="small muted">${r.owner === P ? 'Station land units here to crush the revolt. Left alone for about a month, it wins: the land breaks away or returns to its old rulers.' : ''}</div></div>`;
  } else if (O && (r.rev || 0) > 0.15) h += `<div class="small warn-text" style="margin-top:6px">Revolt brewing: ${pct(r.rev)}</div>`;
  if (O && O.code === P) {
    const { causes, target } = unrestCauses(sim, r, O, societyContext(sim, O));
    const shown = causes.filter(c => Math.abs(c[1]) >= 0.01).sort((a, b) => b[1] - a[1]);
    if (shown.length) h += `<div class="small" style="margin-top:6px"><div class="muted">Unrest is heading toward ${pct(target)}:</div>${shown.map(([k, v]) => `<div class="row"><span>${esc(k)}</span><span class="${v > 0 ? 'neg' : 'pos'}">${v > 0 ? '+' : ''}${Math.round(v * 100)}</span></div>`).join('')}</div>`;
  }
  return h + '</div>';
}

// ---------------------------------------------------------------- the Society tab
export function renderSociety(host) {
  const sim = G.sim, s = sim.s, P = s.player, N = s.nations[P];
  if (!s.cultures) { setHTML(host, '<p class="muted">No society data.</p>'); return; }
  const C = s.cultures[N.cul], F = s.faiths[N.faith];
  const cs = cultureShares(sim, P), fs = faithShares(sim, P);
  const revolts = [...(sim.owned.get(P) || [])].map(i => s.regions[i]).filter(r => r.revolt);
  const movs = movementsOf(sim, P);
  let h = `<div class="card"><div class="big">The ${esc(C?.adj || N.name)} people</div>
    <div class="sub">State faith: <span class="flagchip" style="background:${F?.col}"></span>${esc(F?.name || '—')} <span class="muted">(${FAITH_KIND[F?.kind]?.name || ''})</span></div>
    <div class="grid2" style="margin-top:6px"><span>Stability</span><span>${pct(N.gov.stability)}</span><span>Approval</span><span>${pct(N.gov.approval)}</span><span>Average unrest</span><span class="${(N.st.unrestW || 0) > 0.3 ? 'neg' : ''}">${pct(N.st.unrestW || 0)}</span><span>Revolts · movements</span><span class="${revolts.length ? 'neg' : ''}">${revolts.length} · ${movs.length}</span></div>`;
  if (F && F.kind !== 'folk' && F.holy != null) { const ho = s.regions[F.holy]?.owner; h += `<div class="small" style="margin-top:6px">Holy city: <b>${esc(G.world.regions[F.holy].name)}</b> ${ho === P ? '<span class="pos">(ours)</span>' : ho ? `<span class="warn-text">held by the ${esc(sim.nm(ho))}</span>` : '<span class="muted">(wilderness)</span>'}</div>`; }
  h += '</div>';
  // the strain of empire
  const cap = N.adminCap ?? adminCap(sim, N), held = sim.owned.get(P)?.size || 0, heat = N.expHeat || 0, inf = N.infamy || 0, lim = infamyLimit(sim, P);
  const C2 = coalitionAgainst(sim, P);
  h += `<div class="sec"><div class="sec-title">The strain of empire</div>
    <div class="row"><span>Administration</span><span class="${held > cap ? 'neg' : ''}">${held} of ${cap} lands</span></div>${bar(held / Math.max(1, cap), held > cap ? 'var(--red)' : held > cap * 0.85 ? '#ffb547' : 'var(--teal)')}
    <div class="small muted" style="margin-bottom:6px">${held > cap ? `<span class="warn-text">${held - cap} lands beyond what the state can govern:</span> unrest everywhere, lost revenue and research, falling approval. ` : ''}Capacity grows with laws, roads, bureaucracy, the form of government and every governor you appoint. Vassals do not count against it.</div>
    <div class="row"><span>Pace of expansion</span><span class="${heat > 7 ? 'neg' : ''}">${heatLabel(heat)} (${heat.toFixed(1)})</span></div>${bar(heat / 16, heat > 13 ? 'var(--red)' : heat > 7 ? '#ffb547' : 'var(--teal)')}
    <div class="small muted" style="margin-bottom:6px">Every land gained heats the realm; it cools over months. Above "calm", all lands grow restless and settlers cost more. Newly settled and conquered lands, and lands beyond ${Math.round(reachKm(N))} km of the capital, are restless too.</div>
    <div class="row"><span>Infamy</span><span class="${inf > lim ? 'neg' : ''}">${infamyLabel(inf)} (${inf.toFixed(1)} / ${lim})</span></div>${bar(inf / (lim * 1.5), inf > lim ? 'var(--red)' : inf > lim * 0.6 ? '#ffb547' : 'var(--teal)')}
    <div class="small muted">Conquest, ultimatums and wars of choice earn infamy. Past ${lim}, neighbours who fear you may form a coalition and attack together.</div>
    ${C2 ? `<div class="card" style="border-color:rgba(255,93,93,.55);margin-top:8px"><div class="warn-text">Coalition against you${C2.members.some(m => sim.atWar(m, P)) ? ' · AT WAR' : ''}</div><div class="small">${C2.members.map(m => `<span class="click" data-dossier="${m}" style="color:${sim.col(m)}">${esc(sim.nm(m))}</span>`).join(', ')}</div><div class="small muted">Let your infamy cool, win them over with gifts and treaties, or break them in the field.</div></div>` : ''}
  </div>`;
  // revolts first: they need troops now
  if (revolts.length) h += `<div class="sec"><div class="sec-title">Revolts (${revolts.length})</div>${revolts.map(r => { const ours = s.units.filter(u => u.loc === r.i && u.nation === P && !u.move).length; return `<div class="row click" data-goto="${r.i}"><span><span class="warn-text">${REVOLT_NAME[r.revolt.kind]}</span> · ${esc(G.world.regions[r.i].name)}<br><span class="small muted">rebels ${r.revolt.str.toFixed(1)} · our troops ${ours} · day ${Math.floor((s.t - r.revolt.since) / 24)} of ~30</span></span><span class="small">Send troops ›</span></div>`; }).join('')}</div>`;
  // movements
  h += `<div class="sec"><div class="sec-title">Movements (${movs.length})</div>`;
  if (!movs.length) h += '<div class="muted small">No organized opposition. Restless minorities, other faiths and unpopular rule breed separatists, sectarian militants and revolutionaries.</div>';
  for (const M of movs) {
    const tiles = movementTiles(sim, M), cd = s.t < (M.cd || 0);
    h += `<div class="mov"><div class="row"><span class="hi">${esc(M.name)}</span><span class="small muted">${MOV_LABEL[M.kind]}</span></div>${bar(M.str, M.str > 0.55 ? 'var(--red)' : '#ffb547')}
      <div class="small muted">${plural(tiles.length, 'land')}${M.kind === 'separatist' ? ` · ${esc(cultureName(s, M.key))}` : M.kind === 'sectarian' ? ` · ${esc(faithName(s, M.key))}` : ''}${M.exposed && M.sponsor ? ` · <span class="warn-text">backed by the ${esc(sim.nm(M.sponsor))}</span>` : ''}${M.attacks ? ` · ${plural(M.attacks, 'attack')}` : ''}</div>
      <div class="actions" style="margin-top:4px"><button class="btn sm danger" data-mcrack="${M.id}" ${cd || N.gov.pc < 25 ? 'disabled' : ''} title="Arrests and raids. Angers their people.">Crackdown · 25 PC</button><button class="btn sm" data-mconc="${M.id}" ${cd || N.wealth < concessionCost(N) ? 'disabled' : ''} title="Schools, temples and tax relief.">Concessions · ${concessionCost(N)}🪙</button>${M.kind === 'separatist' && tiles.length ? `<button class="btn sm" data-mauto="${M.id}" title="Their lands become an autonomous vassal state.">Grant autonomy</button>` : ''}</div></div>`;
  }
  h += '</div>';
  // peoples and faiths
  const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n);
  const cl = lawOpt(N, 'culture');
  h += `<div class="sec"><div class="sec-title">Peoples of the realm</div>${top(cs, 7).map(([k, v]) => `<div class="share"><span><span class="flagchip" style="background:${s.cultures[k]?.col}"></span>${esc(s.cultures[k]?.adj || k)}${k === N.cul ? ' <span class="small muted">(ruling)</span>' : ''}</span><span>${pct(v)}</span>${bar(v, s.cultures[k]?.col || '#888')}</div>`).join('')}
    <div class="small muted" style="margin-top:4px">Cultural policy: <b>${esc(cl.name)}</b>. Other peoples slowly adopt your ways; governors, schools and the law speed it up. Change it under Rule.</div></div>`;
  const known = new Set([N.faith, ...Object.keys(fs), ...N.known.map(c => s.nations[c]?.faith).filter(Boolean)]);
  const adoptable = [...known].filter(k => k !== N.faith && s.faiths[k] && ((fs[k] || 0) >= 0.03 || N.known.some(c => s.nations[c]?.faith === k)));
  h += `<div class="sec"><div class="sec-title">Faiths</div>${top(fs, 7).map(([k, v]) => `<div class="share"><span><span class="flagchip" style="background:${s.faiths[k]?.col}"></span>${esc(s.faiths[k]?.name || k)}${k === N.faith ? ' <span class="small muted">(state)</span>' : ''}</span><span>${pct(v)}</span>${bar(v, s.faiths[k]?.col || '#888')}</div>`).join('')}
    <div class="small muted" style="margin:4px 0 6px">Religious law: <b>${esc(lawOpt(N, 'religion').name)}</b>. Faiths spread from land to land; organized religions overwhelm folk beliefs.</div>`;
  if (adoptable.length) h += `<div class="actions"><select class="inp" id="soc-faith">${adoptable.map(k => `<option value="${k}">${esc(s.faiths[k].name)} (${pct(fs[k] || 0)})</option>`).join('')}</select><button class="btn sm" data-sadopt="1" ${N.gov.pc < 80 ? 'disabled' : ''}>Make state faith · 80 PC</button></div>`;
  const misOpts = [['', 'No missionaries'], ...(canMission(N, 'home') ? [['home', 'Convert our own people']] : []), ...(canMission(N, 'x') ? N.known.filter(c => s.nations[c]?.alive && s.nations[c].faith !== N.faith).map(c => [c, 'Preach among the ' + sim.nm(c)]) : [])];
  h += `<div class="actions" style="margin-top:6px"><select class="inp" id="soc-mis">${misOpts.map(([v, l]) => `<option value="${v}" ${(N.missions || '') === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><span class="small muted">${N.missions ? `costs ${fmt(missionCost(N))}🪙/day` : canMission(N, 'home') ? '' : 'Requires Priesthood'}</span></div></div>`;
  // provinces
  const provs = provincesOf(sim, P).sort((a, b) => b.tiles.length - a.tiles.length);
  h += `<div class="sec"><div class="sec-title">Provinces and ${governorTitle(N.age).toLowerCase()}s (${provs.length})</div>`;
  if (!canGovern(N)) h += '<div class="small muted">Appointing governors requires the Code of Laws.</div>';
  for (const p of provs) {
    const gv = provinceGovernor(sim, N, p.id), un = p.tiles.reduce((a, i) => a + s.regions[i].unrest, 0) / p.tiles.length;
    const capP = p.tiles.includes(N.capital);
    h += `<div class="prov"><div class="row"><span class="hi">${esc(p.name)}${capP ? ' <span class="small" style="color:var(--gold)">★</span>' : ''} <span class="small muted">${p.tiles.length}/${p.all} lands</span></span><span class="small ${un > 0.35 ? 'neg' : 'muted'}">unrest ${pct(un)}</span></div>`;
    if (gv) h += `<div class="row small"><span>${governorTitle(N.age)} <b>${esc(gv.name)}</b> · skill ${gv.skill} ${traitChips(gv)}</span><button class="btn sm" data-gdismiss="${p.id}">Dismiss</button></div>`;
    else if (canGovern(N)) h += `<div class="row small"><span class="muted">No ${governorTitle(N.age).toLowerCase()}</span><span><button class="btn sm" data-gpick="${p.id}">Appoint…</button>${!capP ? ` <button class="btn sm" data-gauto="${p.id}" title="Release this province as an autonomous vassal state">Autonomy</button>` : ''}</span></div>`;
    if (G.socPick === 'g:' + p.id && !gv) h += candidates(sim, N, 'g:' + p.id).map(c => `<div class="cand"><span><b>${esc(c.name)}</b> · skill ${c.skill} ${traitChips(c)}</span><button class="btn sm go" data-gappoint="${p.id}:${c.id}" ${N.gov.pc < officialCost(N, c, false) ? 'disabled' : ''}>Appoint · ${officialCost(N, c, false)} PC</button></div>`).join('');
    h += '</div>';
  }
  h += '</div>';
  // cities and mayors
  const cities = [...(sim.owned.get(P) || [])].map(i => s.regions[i]).filter(r => r.lvl >= 3).sort((a, b) => b.pop - a.pop);
  if (cities.length) {
    const dem = !!GOV_TYPES[N.gov.type].democratic;
    h += `<div class="sec"><div class="sec-title">Cities and ${mayorTitle(N.age).toLowerCase()}s (${cities.length})</div>${!canMayor(N) ? '<div class="small muted">Requires Urbanism.</div>' : ''}`;
    for (const r of cities) {
      const my = r.mayor && s.chars[r.mayor];
      h += `<div class="prov"><div class="row"><span class="hi click" data-goto="${r.i}">${esc(G.world.regions[r.i].name)} <span class="small muted">${SETTLEMENTS[r.lvl].name} · ${popStr(r.pop)}</span></span>${my ? `<span class="small">${esc(my.name)} · skill ${my.skill}</span>` : canMayor(N) ? `<button class="btn sm" data-mpick="${r.i}">${dem ? 'Hold election…' : 'Appoint…'}</button>` : ''}</div>`;
      if (G.socPick === 'm:' + r.i && !my) h += candidates(sim, N, 'm:' + r.i).map(c => `<div class="cand"><span><b>${esc(c.name)}</b> · skill ${c.skill} ${traitChips(c)}</span><button class="btn sm go" data-mappoint="${r.i}:${c.id}" ${N.gov.pc < officialCost(N, c, true) ? 'disabled' : ''}>${dem ? 'Back' : 'Appoint'}${officialCost(N, c, true) ? ' · ' + officialCost(N, c, true) + ' PC' : ''}</button></div>`).join('');
      h += '</div>';
    }
    h += '</div>';
  }
  // hotspots
  const hot = [...(sim.owned.get(P) || [])].map(i => s.regions[i]).filter(r => r.unrest > 0.15).sort((a, b) => b.unrest - a.unrest).slice(0, 8);
  if (hot.length) {
    const ctx = societyContext(sim, N);
    h += `<div class="sec"><div class="sec-title">Unrest hotspots</div>${hot.map(r => { const c = unrestCauses(sim, r, N, ctx).causes.filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]).join(', '); return `<div class="row click" data-goto="${r.i}"><span>${esc(G.world.regions[r.i].name)}<br><span class="small muted">${esc(c)}</span></span><span style="color:${unrestCol(r.unrest)}">${pct(r.unrest)}${r.revolt ? ' ⚔' : (r.rev || 0) > 0.3 ? ' !' : ''}</span></div>`; }).join('')}</div>`;
  }
  if (!setHTML(host, h)) return;
  const done = res => { toast('Society', res.why || (res.ok ? 'Done.' : 'Not possible.'), res.ok ? 'good' : 'warn'); G.socPick = null; G.fn.renderPanel(true); };
  for (const b of host.querySelectorAll('[data-mcrack]')) b.onclick = () => done(crackdown(sim, N, +b.dataset.mcrack));
  for (const b of host.querySelectorAll('[data-mconc]')) b.onclick = () => done(concede(sim, N, +b.dataset.mconc));
  for (const b of host.querySelectorAll('[data-mauto]')) b.onclick = () => { const M = s.movements.find(x => x.id === +b.dataset.mauto); if (M && confirm(`Grant self-rule to the lands the ${M.name} claim? They become an autonomous vassal state.`)) done(grantAutonomy(sim, N, movementTiles(sim, M), `Bowing to the ${M.name}, you grant self-rule.`)); };
  for (const b of host.querySelectorAll('[data-gpick]')) b.onclick = () => { G.socPick = 'g:' + b.dataset.gpick; G.fn.renderPanel(true); };
  for (const b of host.querySelectorAll('[data-mpick]')) b.onclick = () => { G.socPick = 'm:' + b.dataset.mpick; G.fn.renderPanel(true); };
  for (const b of host.querySelectorAll('[data-gappoint]')) b.onclick = () => { const [pid, id] = b.dataset.gappoint.split(':'); done(appointGovernor(sim, N, pid, +id)); };
  for (const b of host.querySelectorAll('[data-mappoint]')) b.onclick = () => { const [i, id] = b.dataset.mappoint.split(':'); done(appointMayor(sim, N, +i, +id)); };
  for (const b of host.querySelectorAll('[data-gdismiss]')) b.onclick = () => done(dismissGovernor(sim, N, b.dataset.gdismiss));
  for (const b of host.querySelectorAll('[data-gauto]')) b.onclick = () => { const p = sim.provs[b.dataset.gauto]; if (confirm(`Release ${p.name} as an autonomous vassal state?`)) done(grantAutonomy(sim, N, p.tiles.filter(i => s.regions[i].owner === P), `You grant ${p.name} self-rule.`)); };
  host.querySelector('[data-sadopt]')?.addEventListener('click', () => { const k = host.querySelector('#soc-faith').value; if (confirm(`Make ${s.faiths[k].name} the state faith? Converting the court costs stability.`)) done(adoptFaith(sim, N, k)); });
  host.querySelector('#soc-mis')?.addEventListener('change', e => { N.missions = e.target.value || null; G.fn.renderPanel(true); });
  void LAWS;
}

// ---------------------------------------------------------------- map lenses
export function lensColor(r) {
  const s = G.sim.s;
  if (G.lens === 'pacts') return lensPactColor(G.sim, r.owner);
  if (G.lens === 'culture') return s.cultures[r.cul]?.col || '#777777';
  if (G.lens === 'faith') return s.faiths[r.rel]?.col || '#777777';
  const u = r.revolt ? 1 : r.unrest; // unrest: green to amber to red
  return hslHex(120 * (1 - Math.min(1, u / 0.75)), 85, r.revolt ? 52 : 45);
}
export function lensLegend() {
  const sim = G.sim, s = sim.s;
  if (!G.lens) return '';
  if (G.lens === 'pacts') return pactsLegend(sim);
  if (G.lens === 'unrest') return '<b>Unrest</b><div class="lg-grad"></div><div class="lg-row"><span>calm</span><span>restless</span><span>revolt</span></div>';
  const cnt = {};
  for (const i of sim.landIdx) { const r = s.regions[i]; const p = r.owner ? r.pop : (r.natives || 0); if (p < 0.05) continue; const k = G.lens === 'culture' ? r.cul : r.rel; cnt[k] = (cnt[k] || 0) + p; }
  const tot = Object.values(cnt).reduce((a, b) => a + b, 0) || 1;
  const list = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const D = G.lens === 'culture' ? s.cultures : s.faiths;
  return `<b>${G.lens === 'culture' ? 'Peoples' : 'Faiths'} of the world</b>${list.map(([k, v]) => `<div class="lg-item"><i style="background:${D[k]?.col}"></i><span>${esc(G.lens === 'culture' ? D[k]?.adj || k : D[k]?.name || k)}</span><span class="muted">${pct(v / tot)}</span></div>`).join('')}`;
}
