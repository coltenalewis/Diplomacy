// The War section of the Rule tab in the 1939 scenario: the coalition, the home front, blockade and Lend-Lease, the
// atomic programme, the conduct of the war (with every order the laws of war forbid marked as a war crime, and its
// price spelled out), and the record of the war that the tribunals will read.
import { G, esc, pct, fmt, toast, dstr } from './ui.js';
import { CRIMES, CRIME_ORDER, canConduct, conduct, faction, occupiedBy, K, lostShare } from './ww2.js';
import { TECHS, WW2_TIER } from './tech.js';
import { dateStr } from './eras.js';

const guiltName = g => (g < 5 ? ['Clean hands', 'pos'] : g < 20 ? ['Questioned', ''] : g < 50 ? ['Accused', 'warn-text'] : ['Indicted before the world', 'neg']);

export function warHTML(sim, N) {
  const s = sim.s, W = s.ww2, P = N.code;
  const F = faction(sim, P), wars = sim.warsOf(P);
  const us = K(sim, 'United States');
  let h = `<div class="sec war-sec"><div class="sec-title">The war</div><div class="grid2">
    <span>Coalition</span><span>${F ? `<b style="color:${F.color}">${esc(F.name)}</b>${F.chair === P ? ' (you lead it)' : ` · led by the ${esc(sim.nm(F.chair))}`}` : '<span class="muted">none: you stand alone</span>'}</span>
    <span>At war with</span><span>${wars.length ? wars.map(c => esc(sim.nm(c))).join(', ') : '<span class="muted">nobody</span>'}</span>
    <span>War support</span><span>${pct(N.gov.approval)}</span>
    <span>War weariness</span><span class="${N.exhaustion > 0.5 ? 'neg' : ''}">${pct(N.exhaustion)}</span>`;
  if (N.occupied) h += `<span>Status</span><span class="neg">Occupied by the ${esc(sim.nm(N.occupied.by))} under an armistice</span>`;
  const lost = lostShare(sim, P); if (lost > 0) h += `<span>Homeland occupied</span><span class="neg">${pct(lost)}</span>`;
  const occ = occupiedBy(sim, P);
  if (occ.length) h += `<span>Provinces you occupy</span><span>${occ.length} · unrest ${pct(occ.reduce((a, r) => a + r.unrest, 0) / occ.length)}</span>`;
  if (N.blockade > 0.02) h += `<span>Blockade</span><span class="warn-text">${pct(N.blockade)} of imports cut off</span>`;
  if (N.embargo) h += '<span>Oil</span><span class="neg">under embargo: no oil can be bought</span>';
  if (N.lendLease && N.aid) h += `<span>Lend-Lease</span><span class="pos">+${fmt(N.aid)} wealth/day from America</span>`;
  if (P === us && W.lendLease) h += '<span>Lend-Lease</span><span>the arsenal of democracy: 12% of revenue to the nations fighting the Axis</span>';
  if (us && P !== us && !sim.atWar(us, P)) h += `<span>American mood</span><span>${W.usIn || sim.warsOf(us).length ? 'at war' : W.usTension > 70 ? 'on the brink of war' : W.usTension > 35 ? 'turning against the Axis' : 'isolationist'}</span>`;
  const B = W.bomb?.[P];
  if (B) h += `<span>Atomic programme</span><span>${B.done ? '<b class="gold">the bomb is ready</b>' : pct(B.prog / B.need)}</span>`;
  h += '</div>';
  if (B && !B.done) h += `<div class="prog" style="margin-top:6px"><i style="width:${pct(B.prog / B.need)}"></i></div>`;
  h += '</div>';
  // the conduct of the war
  const [gn, gc] = guiltName(N.guilt || 0);
  h += `<div class="sec"><div class="sec-title">Conduct of the war</div>
    <div class="small muted" style="margin-bottom:8px">Orders the laws of war forbid are <b class="neg">war crimes</b>. Each is recorded. The world turns against you, neutrals edge toward your enemies, the victims fight harder, occupied peoples resist, and if you lose the war your leaders will stand before a tribunal.</div>
    <div class="grid2" style="margin-bottom:8px"><span>Your record</span><span class="${gc}">${gn}${N.guilt >= 1 ? ` · ${Object.entries(N.crimes || {}).filter(([, v]) => v).map(([k, v]) => `${esc(CRIMES[k]?.name || 'prisoners worked to death')} ×${v}`).join(', ')}` : ''}</span></div>`;
  for (const k of CRIME_ORDER) {
    const X = CRIMES[k], chk = canConduct(sim, P, k), on = !!N.conduct?.[k];
    const targets = chk.targets || [];
    const tSel = X.kind === 'act' && targets.length ? `<select class="inp sm" data-ct="${k}">${targets.map(t => typeof t === 'string' ? `<option value="${t}">${esc(sim.nm(t))}</option>` : `<option value="${t.i}">${esc(sim.w.regions[t.i].name)} (${esc(sim.nm(t.owner))})</option>`).join('')}</select>` : '';
    h += `<div class="crime ${X.crime ? 'is-crime' : ''} ${on ? 'on' : ''}"><div class="cr-head"><span class="cr-ic">${X.icon}</span><span class="hi">${esc(X.name)}</span>${X.crime ? '<span class="cr-badge">war crime</span>' : ''}${on ? '<span class="cr-on">in force</span>' : ''}</div>
      <div class="small">${esc(X.desc)}</div><div class="small muted">${esc(X.fx)}${X.crime ? ` <i>Forbidden: ${esc(X.law)}.</i>` : ''}</div>
      <div class="cr-ctl">${tSel}${X.kind === 'policy' ? `<button class="btn sm ${on ? '' : 'warn'}" data-cr="${k}" ${on || chk.ok ? '' : 'disabled'}>${on ? 'Rescind the order' : 'Give the order'}</button>` : `<button class="btn sm warn" data-cr="${k}" ${chk.ok ? '' : 'disabled'}>Give the order</button>`}${!chk.ok && !on ? `<span class="small muted">${esc(chk.why)}</span>` : ''}</div></div>`;
  }
  h += '</div>';
  // the record
  const log = (W.log || []).slice(-10).reverse();
  h += `<div class="sec"><div class="sec-title">The record of the war</div>${log.length ? log.map(l => `<div class="small rec-row"><span class="muted">${dateStr(s.startYear + l.t / 24 / 365)}</span> ${esc(l.text)}</div>`).join('') : '<div class="small muted">No war crimes have been recorded.</div>'}</div>`;
  return h;
}

export function bindWar(host, sim, N, rerender) {
  for (const b of host.querySelectorAll('[data-cr]')) b.onclick = () => {
    const k = b.dataset.cr, X = CRIMES[k], sel = host.querySelector(`[data-ct="${k}"]`);
    const on = !!N.conduct?.[k];
    if (X.crime && !on && !confirm(`${X.name} is a war crime: ${X.law}.\n\nIt will be recorded against you, the world will turn against you, and if you lose the war your leaders will answer for it.\n\nGive the order?`)) return;
    const tv = sel ? sel.value : null;
    const target = tv == null ? null : /^\d+$/.test(tv) ? +tv : tv;
    const r = conduct(sim, N.code, k, target);
    if (!r.ok) toast('War', r.why, 'warn'); else toast('War', r.text, X.crime ? 'warn' : 'good');
    rerender();
  };
}

// research in 1939: the interwar basics still missing and the wartime race by year
export function ww2RnD(sim, N) {
  const tierOf = x => x.ww2 || (x.age === 7 ? 0 : null);
  const mod = TECHS.filter(x => tierOf(x) != null);
  const world = Object.values(sim.s.nations).filter(n => n.alive).sort((a, b) => (b.st.rp || 0) - (a.st.rp || 0));
  const rank = world.findIndex(n => n.code === N.code) + 1;
  return `<div class="card"><div class="kicker">${dstr()} · the war of the laboratories</div><div class="big">${fmt(N.st.rp)} <span class="small muted">research per day</span></div>
    <div class="sub">World rank #${rank} in research output. Radar, jets, codebreakers and the bomb: the war is also a race between scientists.</div>
    ${[0, 1, 2, 3, 4].map(k => { const L = mod.filter(x => tierOf(x) === k), have = L.filter(x => N.techs[x.id]).length; return `<div class="grid2" style="margin-top:6px"><span>${WW2_TIER[k]}</span><span>${have} / ${L.length}</span></div><div class="meter"><i style="width:${pct(have / Math.max(1, L.length))}"></i></div>`; }).join('')}</div>`;
}
void G;
