// The side panel as a floating window over the globe: drag it by its header, resize it from its edges and corners,
// collapse it to its tabs, or snap it back to the right edge. Its place and size are remembered between sessions.
// Right-anchored map overlays (notifications, map modes) slide left to stay clear of it.
const KEY = 'aoc.panel.v1';
const MIN_W = 300, MIN_H = 180, SNAP = 14;

export function initFloatPanel() {
  const panel = document.getElementById('panel'), stage = document.getElementById('stage');
  panel.classList.add('floating');
  panel.insertAdjacentHTML('afterbegin', `<div class="pn-head" title="Drag to move"><span class="pn-grip"></span><span class="pn-title">Command</span>
    <button class="pn-btn" data-pn="dock" title="Snap back to the right edge">&#8677;</button><button class="pn-btn" data-pn="min" title="Collapse to tabs">&#8211;</button></div>`);
  for (const d of ['l', 'r', 'b', 'bl', 'br']) panel.insertAdjacentHTML('beforeend', `<i class="pn-rz pn-rz-${d}" data-rz="${d}"></i>`);

  const top = () => stage.getBoundingClientRect().top, bottom = () => stage.getBoundingClientRect().bottom;
  const docked = () => { const w = Math.min(420, Math.max(MIN_W, Math.round(innerWidth * 0.3))); return { x: innerWidth - w - 10, y: top() + 10, w, h: bottom() - top() - 20, min: false }; };
  let S = docked();
  try { const saved = JSON.parse(localStorage.getItem(KEY) || 'null'); if (saved && saved.w) S = { ...S, ...saved }; } catch (e) { /* storage unavailable: use the default */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* ignore */ } };

  const apply = () => {
    const t = top(), b = bottom();
    S.w = Math.max(MIN_W, Math.min(S.w, innerWidth - 20));
    S.h = Math.max(MIN_H, Math.min(S.h, b - t));
    S.x = Math.max(0, Math.min(S.x, innerWidth - S.w));
    S.y = Math.max(t, Math.min(S.y, b - (S.min ? 40 : Math.min(S.h, 80))));
    if (!S.min && S.y + S.h > b) S.h = Math.max(MIN_H, b - S.y);
    panel.style.left = S.x + 'px'; panel.style.top = S.y + 'px'; panel.style.width = S.w + 'px';
    panel.style.height = S.min ? '' : S.h + 'px';
    panel.classList.toggle('collapsed', !!S.min);
    // keep right-anchored overlays clear of the panel where it covers them
    const P = panel.getBoundingClientRect(), St = stage.getBoundingClientRect();
    const clear = (y0, y1) => (P.bottom > y0 && P.top < y1 && P.right > St.right - 60 ? Math.max(0, St.right - P.left + 6) : 0);
    const root = document.documentElement.style;
    root.setProperty('--dock-top', clear(St.top, St.top + 240) + 'px');
    root.setProperty('--dock-bot', clear(St.bottom - 70, St.bottom) + 'px');
  };

  // drag by the header, snapping to the stage edges
  const head = panel.querySelector('.pn-head');
  head.addEventListener('pointerdown', e => {
    if (e.button !== 0 || e.target.closest('.pn-btn')) return;
    e.preventDefault(); head.setPointerCapture(e.pointerId);
    const ox = e.clientX - S.x, oy = e.clientY - S.y;
    panel.classList.add('moving');
    const move = ev => {
      let x = ev.clientX - ox, y = ev.clientY - oy;
      if (Math.abs(x) < SNAP) x = 0; if (Math.abs(innerWidth - (x + S.w)) < SNAP) x = innerWidth - S.w;
      if (Math.abs(y - top()) < SNAP) y = top();
      S.x = x; S.y = y; apply();
    };
    const up = () => { head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); panel.classList.remove('moving'); save(); };
    head.addEventListener('pointermove', move); head.addEventListener('pointerup', up);
  });
  // resize from the edges and corners
  for (const h of panel.querySelectorAll('.pn-rz')) h.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); h.setPointerCapture(e.pointerId);
    const d = h.dataset.rz, x0 = e.clientX, y0 = e.clientY, s0 = { ...S };
    if (S.min) { S.min = false; s0.min = false; }
    panel.classList.add('moving');
    const move = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (d.includes('r')) S.w = s0.w + dx;
      if (d.includes('l')) { const w = Math.max(MIN_W, s0.w - dx); S.x = s0.x + s0.w - w; S.w = w; }
      if (d.includes('b')) S.h = s0.h + dy;
      apply();
    };
    const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); panel.classList.remove('moving'); save(); };
    h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
  });
  panel.querySelector('[data-pn="min"]').addEventListener('click', () => { S.min = !S.min; apply(); save(); });
  panel.querySelector('[data-pn="dock"]').addEventListener('click', () => { S = docked(); apply(); save(); });
  head.addEventListener('dblclick', e => { if (!e.target.closest('.pn-btn')) { S.min = !S.min; apply(); save(); } });
  // picking a tab opens a collapsed panel
  panel.querySelector('.tabs').addEventListener('click', e => { if (S.min && e.target.closest('button')) { S.min = false; apply(); save(); } });
  addEventListener('resize', apply);
  apply();
}
