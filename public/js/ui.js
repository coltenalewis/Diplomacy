// Shared UI state and helpers.
import { dateStr } from './eras.js';
import { RES } from './resources.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const fmt = n => { const a = Math.abs(n); if (!isFinite(n)) return '–'; return a >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : a >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : a >= 100 ? Math.round(n).toString() : a >= 10 ? n.toFixed(1) : a >= 1 ? n.toFixed(2) : n.toFixed(2); };
export const sgn = n => (n >= 0 ? '+' : '') + fmt(n);
export const pct = v => Math.round(v * 100) + '%';
// population is counted in thousands
export const popStr = k => k >= 1000 ? (k / 1000).toFixed(k >= 1e4 ? 1 : 2) + 'M' : k >= 10 ? Math.round(k) + 'k' : k.toFixed(1) + 'k';
export const STOCK_ICON = { food: '🌾', wood: '🪵', stone: '🪨', metal: '⚒️', wealth: '🪙', oil: '🛢️', rp: '📜', pop: '👥' };
export const STOCK_NAME = { food: 'Food', wood: 'Wood', stone: 'Stone', metal: 'Metal', wealth: 'Wealth', oil: 'Oil' };
export const costStr = c => Object.entries(c || {}).filter(([, v]) => v > 0).map(([k, v]) => `${STOCK_ICON[k] || ''}${fmt(v)}`).join(' ');
export const resIcon = k => RES[k]?.icon || '';
export const hexRGB = h => { const v = parseInt((h || '#888888').slice(1), 16); return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
export const ordinal = n => { const sfx = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (sfx[(v - 20) % 10] || sfx[v] || sfx[0]); };
export const initials = name => name.split(' ').filter(x => !/^the$/i.test(x)).map(x => x[0]).slice(0, 2).join('');

export const G = {
  world: null, json: null, geo: null, globe: null, sim: null, ai: null,
  speed: 0, prevSpeed: 2, acc: 0, sel: new Set(), region: null, hover: null, tab: 'tile',
  dip: null, dipFilter: '', intelFilter: 'all', treeAge: null,
  overlay: 'political', showRoutes: true, showLabels: true, showIcons: true, clouds: true,
  ownerSig: '', lastPanel: 0, lastStacks: 0, lastRings: 0, lastIcons: 0, stacks: [], capMarks: [], markerEls: new Map(), labelEls: new Map(), iconEls: new Map(),
  disp: new Map(), trails: new Map(), scarCount: 0, pauseOnEvents: true, pick: null,
  fn: {}, // cross-module functions registered by main.js
};

// drop any notification for a proposal that has been answered elsewhere
export function dropToast(mid) { for (const el of document.querySelectorAll(`#toasts [data-mid="${mid}"]`)) el.remove(); }
export function dstr(y) { const s = G.sim?.s; const P = s?.nations[s.player]; return dateStr(y ?? s?.year ?? 0, P?.age || 0); }
export function setHTML(host, h) { if (host._html === h) return false; host._html = h; host.innerHTML = h; return true; }
export const pips = (l, max) => `<span class="pips">${Array.from({ length: max }, (_, k) => `<i class="${k < l ? 'f' : ''}"></i>`).join('')}</span>`;
export const stars = n => '★'.repeat(Math.round(n / 2)) + '<span style="opacity:.25">' + '★'.repeat(5 - Math.round(n / 2)) + '</span>';
export const avatar = (c, color) => `<div class="avatar" style="background:linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 55%, #000))">${esc(initials(c.name))}</div>`;

export function toast(head, text, cls = '', onClick, proposal) {
  const t = document.createElement('div');
  t.className = 'toast ' + cls;
  t.innerHTML = `<button class="t-x" title="Dismiss">&times;</button><div class="t-head">${esc(head)} · ${dstr()}</div>${esc(text)}` + (proposal ? `<div class="t-actions"><button class="btn sm go" data-y="1">Accept</button><button class="btn sm danger" data-n="1">Decline</button><button class="btn sm" data-later="1">Later</button></div>` : '');
  if (proposal) t.dataset.mid = proposal.id;
  t.onclick = e => {
    try {
      if (e.target.closest('.t-x') || e.target.dataset.later) return;
      if (e.target.dataset.y) G.fn.answer(proposal, true);
      else if (e.target.dataset.n) G.fn.answer(proposal, false);
      else onClick?.();
    } catch (err) { console.error(err); }
    finally { t.remove(); }
  };
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), proposal ? 25000 : 7000);
  while ($('#toasts').children.length > 5) $('#toasts').firstChild.remove();
}

// unit badge icons
export const ICON = {
  inf: '<svg viewBox="0 0 24 24"><path d="M4 15a8 8 0 0 1 16 0z"/><rect x="2" y="15.5" width="20" height="2.6" rx="1.3"/><path d="M8 18.5h2.2l.8 3h2l.8-3H16" fill="none" stroke="#fff" stroke-width="1.4"/></svg>',
  rng: '<svg viewBox="0 0 24 24"><path d="M6 3c7 3 7 15 0 18" fill="none" stroke="#fff" stroke-width="2"/><path d="M6 3v18" stroke="#fff" stroke-width="1"/><path d="M4 12h15l-3-2.5M19 12l-3 2.5" fill="none" stroke="#fff" stroke-width="1.8"/></svg>',
  cav: '<svg viewBox="0 0 24 24"><path d="M6 21h12v-1.5c0-2.6-.8-4.6-2.6-6.6l.9-2.6c1-.2 1.9-1 1.9-2.1l-2.7-2.9-1.8.8-4.6 2.7-2.9 4.6 1.9 1.9 3-1.8.9 1.8-4.2 5.5z"/><circle cx="13.3" cy="7.6" r=".9" fill="#1d2a3d"/></svg>',
  arm: '<svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="6" rx="3"/><rect x="7" y="7" width="8" height="5" rx="1.5"/><rect x="14" y="8.3" width="8" height="2" rx="1"/></svg>',
  art: '<svg viewBox="0 0 24 24"><circle cx="9" cy="16" r="4"/><path d="M10 13L21 5l1.4 1.8L12 15z"/><rect x="2" y="19" width="14" height="2" rx="1"/></svg>',
  aa: '<svg viewBox="0 0 24 24"><rect x="4" y="15" width="16" height="5" rx="2"/><path d="M9 15l5-10 1.6.8-4.6 9.2zM13 15l5-8 1.5 1-4.4 7z"/></svg>',
  ftr: '<svg viewBox="0 0 24 24"><path d="M12 2l2 7 8 4v2l-8-2-.5 5 2.5 2v1.5l-4-1-4 1V20l2.5-2-.5-5-8 2v-2l8-4z"/></svg>',
  bmb: '<svg viewBox="0 0 24 24"><path d="M12 2l1.6 6L23 11v2.4l-9.4-1.6-.4 6.2 3 2.2V22l-4.2-1L7.8 22v-1.8l3-2.2-.4-6.2L1 13.4V11l9.4-3z"/></svg>',
  des: '<svg viewBox="0 0 24 24"><path d="M2 14h20l-3 5H5z"/><path d="M9 9h5v5H9zM11 6h1.5v3H11z"/></svg>',
  car: '<svg viewBox="0 0 24 24"><path d="M1 12h22v2.5H1z"/><path d="M3 14.5h18l-2 4.5H5z"/><path d="M16 7h3v5h-3z"/></svg>',
  sub: '<svg viewBox="0 0 24 24"><path d="M2 15c4-4 16-4 20 0-4 3-16 3-20 0z"/><path d="M10 9h4v4h-4z"/></svg>',
  trn: '<svg viewBox="0 0 24 24"><path d="M2 14h20l-3 5H5z"/><path d="M11 3v11M11 4l7 7h-7z"/></svg>',
};
