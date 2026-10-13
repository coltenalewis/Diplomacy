// Interface for reputation and pacts: reputation chips and breakdowns, the pacts section of the Diplomacy tab,
// a pact's own page, the founding charter, and the parliamentary session where members vote.
import { G, $, esc, toast, dstr, setHTML } from './ui.js';
import { REP, DOCTRINES, PRESETS, FOUND_COST, repTags, repOpinion, pactsOf, pactById, canJoin, foundPact, leavePact, invite, joinAppeal, joinPact, pactName, openSession, tableMotion, castVote, closeSession, tally, aiVote, earn } from './pacts.js';

// ------------------------------------------------------------------ reputation
export function repChips(N, max = 4) {
  const tags = repTags(N).slice(0, max);
  if (!tags.length) return '';
  return `<span class="rep-chips">${tags.map(r => `<span class="rep-chip ${r.level}" title="${esc(REP[r.tag].name)} (${Math.round(r.v)}): ${esc(REP[r.tag].desc)}">${REP[r.tag].icon} ${esc(REP[r.tag].name)}</span>`).join('')}</span>`;
}
// full reputation section: bars for every reputation building up, with what it means
export function repSection(sim, c, title = 'Reputation') {
  const N = sim.s.nations[c];
  const all = Object.entries(N.rep || {}).filter(([, v]) => v >= 3).sort((a, b) => b[1] - a[1]);
  const rows = all.map(([k, v]) => `<div class="rep-row" title="${esc(REP[k].desc)}"><span>${REP[k].icon} ${esc(REP[k].name)}${v >= 60 ? ' <span class="small gold">renowned</span>' : v >= 25 ? ' <span class="small muted">known</span>' : ' <span class="small muted">rumoured</span>'}</span><span class="rep-bar"><i style="width:${Math.round(v)}%"></i></span></div>`).join('');
  return `<div class="sec"><div class="sec-title">${title}</div>${rows || '<div class="muted small">No reputation yet. The world will judge you by your deeds: keeping or breaking oaths, holy wars, trade, peacemaking, ultimatums.</div>'}<div class="small muted" style="margin-top:4px">Reputations fade unless renewed. Others judge them by their own lights: a zealot is admired by its own faith and feared by all others.</div></div>`;
}

// ------------------------------------------------------------------ Diplomacy tab: pacts list
export function pactsListHTML(sim) {
  const s = sim.s, P = s.player;
  const mine = pactsOf(sim, P), others = (s.pacts || []).filter(x => !x.members.includes(P));
  const row = x => `<div class="row click pact-row" data-pact="${x.id}"><span><span class="flagchip" style="background:${x.color}"></span><span class="hi">${esc(x.name)}</span>${x.chair === P ? ' <span class="vtag">chair</span>' : ''}${x.session ? ' <span class="vtag lord">in session</span>' : ''}<br><span class="small muted">${Object.keys(x.doctrines).map(d => DOCTRINES[d].icon).join(' ')} ${x.members.length} member${x.members.length > 1 ? 's' : ''} · chair: ${x.chair === P ? 'you' : esc(sim.nm(x.chair))}</span></span><span class="small muted">${x.members.slice(0, 7).map(m => `<span class="flagchip" title="${esc(sim.nm(m))}" style="background:${sim.col(m)};margin:0 1px"></span>`).join('')}</span></div>`;
  return `<div class="sec"><div class="sec-title">Pacts</div>
    ${mine.length ? mine.map(row).join('') : '<div class="muted small" style="margin-bottom:6px">You belong to no pact. Found one, or ask to join one below.</div>'}
    <div class="actions" style="margin-top:6px"><button class="btn go" id="pact-found">Found a pact &#9656;</button>${others.length ? `<button class="btn" id="pact-world">${G.showWorldPacts ? 'Hide' : 'Show'} pacts of the world (${others.length})</button>` : ''}</div>
    ${G.showWorldPacts ? `<div style="margin-top:6px">${others.map(row).join('')}</div>` : ''}</div>`;
}
export function bindPactsList(host) {
  host.querySelector('#pact-found')?.addEventListener('click', openFoundDialog);
  host.querySelector('#pact-world')?.addEventListener('click', () => { G.showWorldPacts = !G.showWorldPacts; G.fn.renderPanel(true); });
  for (const b of host.querySelectorAll('[data-pact]')) b.onclick = e => { e.stopPropagation(); G.pact = +b.dataset.pact; G.fn.renderPanel(true); };
}

// ------------------------------------------------------------------ a pact's own page
export function renderPactPage(host) {
  const sim = G.sim, s = sim.s, Pl = s.player, X = pactById(sim, G.pact);
  if (!X) { G.pact = null; return false; }
  const member = X.members.includes(Pl), chair = X.chair === Pl;
  const days = Math.max(0, Math.ceil((X.nextSession - s.t) / 24));
  let h = `<span class="chip" id="pact-back">&#9666; Diplomacy</span>
    <div class="card" style="margin-top:8px;border-left:3px solid ${X.color}"><div class="big" style="color:${X.color}">${esc(X.name)}</div>
    <div class="sub">${esc(PRESETS[X.preset]?.name || 'Pact')} · founded by the ${esc(sim.nm(X.founder))} · ${X.members.length} members${X.faith ? ` · ${esc(s.faiths?.[X.faith]?.name || '')}` : ''}</div>
    <div class="small" style="margin-top:6px">Chair: <b>${chair ? 'you' : esc(sim.full(X.chair))}</b>${X.doctrines.council ? ` · ${X.session ? '<span class="gold">in session now</span>' : `next session in ${days} days`}` : ''}${X.bonus.trade ? ` · tariffs abolished (+${Math.round(X.bonus.trade * 100)}% wealth)` : ''}${X.bonus.research ? ` · common academy (+${Math.round(X.bonus.research * 100)}% research)` : ''}</div></div>
    <div class="sec"><div class="sec-title">Doctrines</div>${Object.keys(X.doctrines).map(d => `<div class="doc-row"><b>${DOCTRINES[d].icon} ${esc(DOCTRINES[d].name)}</b><div class="small muted">${esc(DOCTRINES[d].desc)}</div></div>`).join('')}</div>
    <div class="sec"><div class="sec-title">Members (${X.members.length})</div>${X.members.map(m => `<div class="row click" data-open="${m}"><span><span class="flagchip" style="background:${sim.col(m)}"></span>${m === Pl ? '<b>You</b>' : esc(sim.full(m))}${m === X.chair ? ' <span class="vtag">chair</span>' : ''}<br>${repChips(s.nations[m], 3)}</span><span class="small ${m === Pl ? 'muted' : sim.opinion(m, Pl) >= 0 ? 'pos' : 'neg'}">${m === Pl ? '' : `opinion ${Math.round(sim.opinion(m, Pl))}`}</span></div>`).join('')}</div>`;
  h += `<div class="sec"><div class="sec-title">Statecraft</div><div class="actions">`;
  if (member) {
    if (X.doctrines.council) h += `<button class="btn go" id="pact-convene" ${X.session || X.members.length < 3 ? 'disabled' : ''} title="${X.members.length < 3 ? 'A session needs at least three members' : 'Call the members to an extraordinary session (15 influence)'}">${X.session ? 'Session in progress' : 'Convene a session (15 influence)'}</button>`;
    if (X.session) h += '<button class="btn go" id="pact-attend">Attend the session</button>';
    h += `<button class="btn" id="pact-invite">Invite a people &#9656;</button><button class="btn danger" id="pact-leave">Leave the pact</button>`;
  } else {
    const can = canJoin(sim, X, Pl);
    h += `<button class="btn go" id="pact-apply" ${can.ok ? '' : `disabled title="${esc(can.why)}"`}>Ask to join</button>${can.ok ? '' : `<span class="small muted">${esc(can.why)}</span>`}`;
  }
  h += `</div><div id="sub-box"></div></div>`;
  if (X.log.length) h += `<div class="sec"><div class="sec-title">Votes of the council</div>${X.log.map(L => `<div class="vote-log ${L.passed ? 'pass' : 'fail'}"><div><b>${L.passed ? 'Passed' : 'Failed'}</b> ${L.yes}–${L.no}${L.abst ? ` (${L.abst} abstained)` : ''} · <span class="muted">${dstr(L.y)}</span>${L.votes[Pl] ? ` · you voted <b>${L.votes[Pl] === 'yes' ? 'for' : L.votes[Pl] === 'no' ? 'against' : 'to abstain'}</b>` : ''}</div><div>${esc(L.text)}</div>${L.passed ? `<div class="small muted">${esc(L.outcome)}</div>` : ''}</div>`).join('')}</div>`;
  if (!setHTML(host, h)) return true;
  $('#pact-back').onclick = () => { G.pact = null; G.fn.renderPanel(true); };
  for (const b of host.querySelectorAll('[data-open]')) b.onclick = () => { if (b.dataset.open !== Pl) { G.pact = null; G.fn.openDossier(b.dataset.open); } };
  const res = r => { toast(X.name, r.why || (r.ok ? 'Done.' : 'Not possible.'), r.ok ? 'good' : 'warn'); G.fn.renderPanel(true); G.fn.refreshWorld(true); };
  $('#pact-leave')?.addEventListener('click', () => { const war = X.doctrines.defense && X.members.some(m => m !== Pl && sim.warsOf(m).length); if (!confirm(`Leave the ${X.name}?${war ? ' Members are at war: deserting them will brand you an oathbreaker.' : ''}`)) return; res(leavePact(sim, X, Pl)); });
  $('#pact-convene')?.addEventListener('click', () => { const N = s.nations[Pl]; if ((N.gov.pc || 0) < 15) return toast(X.name, 'Convening the members takes 15 influence.', 'warn'); N.gov.pc -= 15; openSession(sim, X); });
  $('#pact-attend')?.addEventListener('click', () => openSessionDialog(X.id));
  $('#pact-apply')?.addEventListener('click', () => {
    const C = s.nations[X.chair], ob = s.nations[Pl].rep?.oathbreaker || 0;
    const ok = sim.opinion(X.chair, Pl) + (s.nations[Pl].rep?.steadfast || 0) / 3 - ob / 2 > 5 && (!X.doctrines.faith || s.nations[Pl].faith === X.faith);
    sim.message(Pl, X.chair, `We ask to join the ${X.name}.`).unread = false;
    if (ok) { res(joinPact(sim, X, Pl)); sim.message(X.chair, Pl, `Welcome to the ${X.name}.`); }
    else { sim.message(X.chair, Pl, ob > 25 ? 'Your word is worth little. We will not admit oathbreakers.' : `The ${X.name} is not ready to admit you.`); res({ ok: false, why: `The ${sim.nm(X.chair)}, who chair the ${X.name}, turn you away.` }); void C; }
  });
  $('#pact-invite')?.addEventListener('click', () => {
    const cands = (s.nations[Pl].known || []).filter(c => canJoin(sim, X, c).ok).sort((a, b) => joinAppeal(sim, b, X).score - joinAppeal(sim, a, X).score).slice(0, 18);
    const box = $('#sub-box'); if (!box) return;
    box.innerHTML = `<div class="small muted" style="margin:8px 0 4px">Invite to the ${esc(X.name)} (their likely answer):</div>` + (cands.length ? cands.map(c => { const a = joinAppeal(sim, c, X); return `<button class="btn sm" data-inv="${c}" style="margin:2px">${esc(sim.nm(c))} <span class="${a.ok ? 'pos' : 'neg'}">${a.ok ? '✓' : '✕'}</span></button>`; }).join('') : '<div class="small muted">No known people can join.</div>');
    for (const b of box.querySelectorAll('[data-inv]')) b.onclick = () => res(invite(sim, X, Pl, b.dataset.inv));
    G.pointerDown = true; setTimeout(() => { G.pointerDown = false; }, 5000);
  });
  return true;
}

// ------------------------------------------------------------------ founding charter
let draft = null;
export function openFoundDialog() {
  const sim = G.sim, s = sim.s, Pl = s.player;
  draft = { preset: 'league', name: pactName(sim, Pl, 'league'), doctrines: new Set(PRESETS.league.doctrines) };
  G.pactResume = G.speed; G.fn.setSpeed(0);
  renderFound();
  $('#pactbox').classList.remove('hidden');
}
function renderFound() {
  const sim = G.sim, s = sim.s, N = s.nations[s.player];
  const card = $('#pact-card');
  card.innerHTML = `<div class="ek">A new charter</div><h2>Found a pact</h2>
    <p class="muted">Choose what kind of pact to found, name it, and decide its doctrines. Founding costs ${FOUND_COST} influence (you have ${Math.floor(N.gov.pc || 0)}). Then invite the peoples you trust.</p>
    <div class="preset-grid">${Object.entries(PRESETS).map(([k, P]) => `<button class="preset ${draft.preset === k ? 'on' : ''}" data-preset="${k}" style="--pc:${P.color}"><b>${P.icon} ${esc(P.name)}</b><span>${esc(P.desc)}</span></button>`).join('')}</div>
    <div class="row" style="margin-top:12px;gap:8px"><input class="inp" id="pf-name" value="${esc(draft.name)}" style="flex:1" maxlength="48"><button class="btn" id="pf-reroll" title="Another name">🎲</button></div>
    <div class="doc-grid">${Object.entries(DOCTRINES).map(([k, D]) => `<label class="doc-opt ${draft.doctrines.has(k) ? 'on' : ''}"><input type="checkbox" data-doc="${k}" ${draft.doctrines.has(k) ? 'checked' : ''}><b>${D.icon} ${esc(D.name)}</b><span>${esc(D.desc)}</span></label>`).join('')}</div>
    <div class="actions sticky-foot"><button class="btn" id="pf-cancel">Cancel</button><button class="btn go" id="pf-go">Found the pact (${FOUND_COST} influence)</button></div>`;
  for (const b of card.querySelectorAll('[data-preset]')) b.onclick = () => { draft.preset = b.dataset.preset; draft.doctrines = new Set(PRESETS[draft.preset].doctrines); draft.name = pactName(sim, s.player, draft.preset); renderFound(); };
  for (const c of card.querySelectorAll('[data-doc]')) c.onchange = () => { if (c.checked) draft.doctrines.add(c.dataset.doc); else draft.doctrines.delete(c.dataset.doc); renderFound(); };
  $('#pf-name').oninput = e => { draft.name = e.target.value; };
  $('#pf-reroll').onclick = () => { draft.name = pactName(sim, s.player, draft.preset); renderFound(); };
  $('#pf-cancel').onclick = closePactBox;
  $('#pf-go').onclick = () => {
    const r = foundPact(sim, s.player, { preset: draft.preset, name: draft.name, doctrines: [...draft.doctrines] });
    if (!r.ok) return toast('Pacts', r.why, 'warn');
    toast(r.pact.name, `You found the ${r.pact.name}. Now invite the peoples you trust from its page.`, 'good');
    closePactBox(); G.pact = r.pact.id; G.dip = null; G.fn.switchTab('diplomacy'); G.fn.renderPanel(true);
  };
}
function closePactBox() {
  $('#pactbox').classList.add('hidden');
  if (G.pactResume) G.fn.setSpeed(G.pactResume); G.pactResume = 0;
  G.pactSession = null;
  G.fn.renderPanel?.(true); G.fn.refreshWorld?.(true);
}

// ------------------------------------------------------------------ the session
export function openSessionDialog(id) {
  const sim = G.sim, X = pactById(sim, id);
  if (!X?.session) return;
  if (!G.pactSession) { G.pactResume = G.speed || G.pactResume; G.fn.setSpeed(0); }
  G.pactSession = { id, result: null };
  renderSession();
  $('#pactbox').classList.remove('hidden');
}
const VOTE = { yes: ['For', 'pos'], no: ['Against', 'neg'], abstain: ['Abstain', 'muted'] };
// the chamber: a semicircle of seats, one per member, lit by its vote
function chamberSVG(sim, X, votes) {
  const n = X.members.length, R = 120, cx = 160, cy = 140;
  const seats = X.members.map((m, k) => {
    const a = Math.PI * (n === 1 ? 0.5 : k / (n - 1)), x = cx - Math.cos(a) * R, y = cy - Math.sin(a) * R * 0.85;
    const v = votes[m], ring = v === 'yes' ? '#5ee39a' : v === 'no' ? '#ff6b6b' : v === 'abstain' ? '#8a93a6' : '#e9c46a';
    return `<g><circle cx="${x}" cy="${y}" r="15" fill="${sim.col(m)}" stroke="${ring}" stroke-width="3"/><text x="${x}" y="${y + 28}" text-anchor="middle" font-size="9.5" fill="#cfd6e4">${esc(sim.nm(m).slice(0, 12))}</text></g>`;
  }).join('');
  return `<svg class="chamber-svg" viewBox="0 0 320 175"><path d="M40 140 A120 102 0 0 1 280 140" fill="none" stroke="rgba(255,255,255,.08)" stroke-width="26"/>${seats}<text x="160" y="150" text-anchor="middle" font-size="11" fill="#e9c46a">${esc(X.name)}</text></svg>`;
}
function renderSession() {
  const sim = G.sim, s = sim.s, Pl = s.player, ses = G.pactSession, X = pactById(sim, ses.id);
  const card = $('#pact-card');
  if (ses.result) {
    const L = ses.result;
    card.innerHTML = `<div class="ek">${esc(X?.name || 'The council')}</div><h2>${L.passed ? 'The motion passes' : 'The motion fails'}</h2>
      ${X ? chamberSVG(sim, X, L.votes) : ''}
      <p><b>${esc(L.text)}</b></p><p class="big2 ${L.passed ? 'pos' : 'neg'}">${L.yes} for · ${L.no} against${L.abst ? ` · ${L.abst} abstained` : ''}</p>
      <p>${esc(L.outcome)}</p>
      <div class="actions" style="justify-content:flex-end"><button class="btn go" id="ps-close">Adjourn</button></div>`;
    $('#ps-close').onclick = closePactBox;
    return;
  }
  if (!X?.session) { closePactBox(); return; }
  const S = X.session, chair = X.chair === Pl;
  if (!S.motion) {
    card.innerHTML = `<div class="ek">${esc(X.name)} · session of ${dstr()}</div><h2>You chair the session</h2>
      <p class="muted">As chair you decide which question the members debate. Choose a motion to table.</p>
      ${S.options.map((o, i) => `<button class="motion-opt" data-table="${i}"><b>${esc(o.text)}</b><span>${esc(o.fx)}</span><span class="small muted">Expected: ${X.members.filter(m => m !== Pl).map(m => aiVote(sim, m, X, o)).filter(v => v === 'yes').length} for, ${X.members.filter(m => m !== Pl).map(m => aiVote(sim, m, X, o)).filter(v => v === 'no').length} against</span></button>`).join('')}
      <div class="actions" style="justify-content:flex-end;margin-top:10px"><button class="btn" id="ps-skip">Adjourn without a vote</button></div>`;
    for (const b of card.querySelectorAll('[data-table]')) b.onclick = () => { tableMotion(sim, X, +b.dataset.table); renderSession(); };
    $('#ps-skip').onclick = () => { X.session = null; closePactBox(); };
    return;
  }
  const mo = S.motion;
  const others = X.members.filter(m => m !== Pl);
  const t = tally({ ...X, session: { ...S, votes: Object.fromEntries(others.map(m => [m, S.votes[m]])) } });
  card.innerHTML = `<div class="ek">${esc(X.name)} · session of ${dstr()}${chair ? ' · you chair' : ` · chaired by the ${esc(sim.nm(X.chair))}`}</div>
    <h2>${esc(mo.text)}</h2>
    <p class="muted">${esc(mo.fx)}${mo.super ? '' : ' Passes with a simple majority of the votes cast.'}</p>
    ${chamberSVG(sim, X, S.votes)}
    <div class="vote-list">${others.map(m => { const v = S.votes[m] || 'abstain'; return `<div class="row"><span><span class="flagchip" style="background:${sim.col(m)}"></span>${esc(sim.nm(m))} ${repChips(s.nations[m], 2)}</span><span class="${VOTE[v][1]}">${VOTE[v][0]}</span></div>`; }).join('')}</div>
    <p class="small">Before your vote: <b class="pos">${t.yes} for</b>, <b class="neg">${t.no} against</b>${t.abst ? `, ${t.abst} abstaining` : ''}. Members remember who voted with them and who against.</p>
    <div class="vote-actions"><button class="btn danger" data-vote="no">Vote against</button><button class="btn" data-vote="abstain">Abstain</button><button class="btn go" data-vote="yes">Vote for</button></div>`;
  for (const b of card.querySelectorAll('[data-vote]')) b.onclick = () => {
    castVote(sim, X, Pl, b.dataset.vote);
    ses.result = closeSession(sim, X);
    renderSession();
  };
}
// the player's answer to a pact's call to arms is remembered
export function answeredCall(sim, m, yes) {
  const p = m.proposal; if (p?.type !== 'callToArms') return;
  const bound = p.pact || sim.rel(sim.s.player, m.from) === 'alliance';
  if (yes) earn(sim, sim.s.player, 'steadfast', 10);
  else if (bound) { earn(sim, sim.s.player, 'oathbreaker', 15); const X = p.pact && pactById(sim, p.pact); if (X) for (const x of X.members) if (x !== sim.s.player) sim.addOpinion(x, sim.s.player, -12); }
}
export function applyPactProposal(sim, a, b, p) {
  const X = pactById(sim, p.pact);
  if (!X) { toast('Pacts', 'That pact no longer exists.', 'warn'); return false; }
  const r = p.type === 'pactInvite' ? joinPact(sim, X, b) : joinPact(sim, X, a);
  if (!r.ok) { toast(X.name, r.why, 'warn'); return false; }
  toast(X.name, r.why, 'good');
  return true;
}
export function lensPactColor(sim, owner) {
  const X = (sim.s.pacts || []).filter(p => p.members.includes(owner)).sort((a, b) => b.members.length - a.members.length)[0];
  return X ? X.color : '#3b4352';
}
export function pactsLegend(sim) {
  const list = (sim.s.pacts || []).slice().sort((a, b) => b.members.length - a.members.length).slice(0, 10);
  return `<b>Pacts of the world</b>${list.map(x => `<div class="lg-item"><i style="background:${x.color}"></i><span>${esc(x.name)}</span><span class="muted">${x.members.length}</span></div>`).join('') || '<div class="muted small">No pacts yet.</div>'}<div class="lg-item"><i style="background:#3b4352"></i><span>No pact</span><span></span></div>`;
}
export { repOpinion };
