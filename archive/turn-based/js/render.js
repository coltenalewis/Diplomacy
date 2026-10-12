// SVG map view: static geography, territory tint, units, orders, highlights, pan/zoom with horizontal wrap.
import { POWERS } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
};

export class MapView {
  constructor(svg, json, map) {
    this.svg = svg; this.json = json; this.map = map;
    this.W = json.W; this.H = json.H; this.R = json.R; this.lon0 = json.lon0; this.latN = json.latN;
    this.handlers = { click: () => {}, hover: () => {}, rightclick: () => {} };
    this.s = 1; this.tx = 0; this.ty = 0;
    this.decodeGrid();
    this.build();
    this.bindInput();
  }

  decodeGrid() {
    const g = new Int16Array(this.W * this.H); let p = 0;
    const rle = this.json.grid;
    for (let k = 0; k < rle.length; k += 2) { g.fill(rle[k], p, p + rle[k + 1]); p += rle[k + 1]; }
    this.grid = g;
  }

  regionAt(mx, my) {
    const i = Math.floor(((mx % this.W) + this.W) % this.W), j = Math.floor(my);
    if (j < 0 || j >= this.H) return null;
    const l = this.grid[j * this.W + i];
    return l >= 0 ? this.map.regions[l].id : null;
  }

  build() {
    const svg = this.svg, W = this.W, H = this.H, j = this.json;
    svg.innerHTML = '';
    const defs = el('defs', {}, svg);
    const clip = el('clipPath', { id: 'landclip', clipPathUnits: 'userSpaceOnUse' }, defs);
    el('path', { d: j.landPath, 'clip-rule': 'evenodd' }, clip);
    const og = el('radialGradient', { id: 'oceanGrad', cx: '50%', cy: '45%', r: '75%' }, defs);
    el('stop', { offset: '0%', 'stop-color': 'var(--ocean-hi)' }, og);
    el('stop', { offset: '100%', 'stop-color': 'var(--ocean-lo)' }, og);
    const pat = el('pattern', { id: 'hatch', width: 3, height: 3, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' }, defs);
    el('line', { x1: 0, y1: 0, x2: 0, y2: 3, stroke: 'rgba(255,80,90,.55)', 'stroke-width': 1 }, pat);
    const glow = el('filter', { id: 'uglow', x: '-50%', y: '-50%', width: '200%', height: '200%' }, defs);
    el('feGaussianBlur', { stdDeviation: 1.2, result: 'b' }, glow);
    const fm = el('feMerge', {}, glow); el('feMergeNode', { in: 'b' }, fm); el('feMergeNode', { in: 'SourceGraphic' }, fm);

    this.vp = el('g', { id: 'viewport' }, svg);
    const world = this.world = el('g', { id: 'world' }, this.vp);
    el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#oceanGrad)' }, world);

    // graticule
    const grat = el('g', { class: 'graticule' }, world);
    let d = '', dMajor = '';
    for (let lat = -50; lat <= 75; lat += 5) { const y = (this.latN - lat) * this.R; (lat % 15 === 0 ? (dMajor += `M0 ${y}H${W}`) : (d += `M0 ${y}H${W}`)); }
    for (let lon = -165; lon <= 190; lon += 5) { const x = (lon - this.lon0) * this.R; (lon % 15 === 0 ? (dMajor += `M${x} 0V${H}`) : (d += `M${x} 0V${H}`)); }
    el('path', { d, class: 'grat-minor' }, grat);
    el('path', { d: dMajor, class: 'grat-major' }, grat);
    el('path', { d: `M0 ${this.latN * this.R}H${W}`, class: 'grat-equator' }, grat);
    for (const t of [23.44, -23.44]) el('path', { d: `M0 ${(this.latN - t) * this.R}H${W}`, class: 'grat-tropic' }, grat);

    // seas
    this.regionEls = {};
    const seas = el('g', { class: 'seas' }, world);
    for (const r of j.regions) if (r.type === 'sea') this.regionEls[r.id] = el('path', { d: r.path, class: 'region sea', 'data-id': r.id }, seas);
    el('path', { d: j.seaBorders, class: 'sea-borders' }, world);

    // land
    el('path', { d: j.landPath, class: 'land-glow', 'fill-rule': 'evenodd' }, world);
    el('path', { d: j.landPath, class: 'land-base', 'fill-rule': 'evenodd' }, world);
    const landClip = el('g', { 'clip-path': 'url(#landclip)' }, world);
    const lands = el('g', { class: 'lands' }, landClip);
    for (const r of j.regions) if (r.type === 'land') this.regionEls[r.id] = el('path', { d: r.path, class: 'region land', 'data-id': r.id }, lands);
    el('path', { d: j.countryBorders || j.countryPath, class: 'country-borders' }, landClip);
    el('path', { d: j.landBorders, class: 'land-borders' }, landClip);
    el('path', { d: j.landPath, class: 'coast', 'fill-rule': 'evenodd' }, world);

    this.scLayer = el('g', { class: 'sc-layer' }, world);
    this.labelLayer = el('g', { class: 'label-layer' }, world);
    this.orderLayer = el('g', { class: 'order-layer' }, world);
    this.unitLayer = el('g', { class: 'unit-layer' }, world);
    this.fxLayer = el('g', { class: 'fx-layer' }, world);

    // labels
    for (const r of j.regions) {
      const g = el('g', { class: `lbl ${r.type}${r.sc ? ' sc' : ''}`, transform: `translate(${r.x},${r.y})` }, this.labelLayer);
      const t = el('text', { y: r.type === 'sea' ? 0 : 7.6, class: 'lbl-id' }, g); t.textContent = r.id;
      const n = el('text', { y: r.type === 'sea' ? 3 : 10.2, class: 'lbl-name' }, g); n.textContent = r.name.toUpperCase();
    }
    // clones for wrap-around
    el('use', { href: '#world', x: -W }, this.vp);
    el('use', { href: '#world', x: W }, this.vp);
  }

  // --------------------------------------------------------- state rendering
  setState(state, opts = {}) {
    this.state = state;
    const control = state.control || {};
    for (const r of this.map.regions) {
      const e = this.regionEls[r.id]; if (!e) continue;
      if (r.type === 'land') {
        const owner = r.sc ? state.sc[r.id] : control[r.id];
        e.style.fill = owner ? POWERS[owner].color : '';
        e.classList.toggle('owned', !!owner);
      }
    }
    // supply centres
    this.scLayer.innerHTML = '';
    for (const id of this.map.scIds) {
      const r = this.map.byId[id]; const owner = state.sc[id];
      const g = el('g', { class: 'sc' + (owner ? '' : ' neutral') + (r.home ? ' home' : ''), transform: `translate(${r.x},${r.y + 4.6})` }, this.scLayer);
      const c = owner ? POWERS[owner].color : '#8fb3c4';
      el('circle', { r: 1.7, fill: 'none', stroke: c, 'stroke-width': 0.55 }, g);
      el('circle', { r: 0.65, fill: c }, g);
      if (r.home) el('path', { d: 'M-2.6 0H-1.9M1.9 0H2.6M0 -2.6V-1.9M0 1.9V2.6', stroke: c, 'stroke-width': 0.4 }, g);
    }
    this.drawUnits(state.units, opts);
  }

  drawUnits(units, opts = {}) {
    this.unitLayer.innerHTML = '';
    const dis = opts.dislodged || [];
    for (const u of units) this.unitGlyph(u, this.map.byId[u.loc], false, opts.player);
    for (const d of dis) this.unitGlyph(d.unit, this.map.byId[d.unit.loc], true, opts.player);
  }

  unitGlyph(u, r, dislodged, player) {
    const col = POWERS[u.power].color;
    const ox = dislodged ? 3.5 : 0, oy = dislodged ? -3.5 : 0;
    const g = el('g', { class: `unit${dislodged ? ' dislodged' : ''}${u.power === player ? ' mine' : ''}`, transform: `translate(${r.x + ox},${r.y + oy}) scale(0.82)`, 'data-loc': u.loc }, this.unitLayer);
    el('circle', { r: 4.6, class: 'u-halo', fill: col }, g);
    el('rect', { x: -3.4, y: -2.3, width: 6.8, height: 4.6, rx: 0.5, class: 'u-frame', stroke: col }, g);
    if (u.type === 'A') el('path', { d: 'M-3.4 -2.3L3.4 2.3M-3.4 2.3L3.4 -2.3', stroke: col, class: 'u-sym' }, g);
    else el('path', { d: 'M-2.6 0.3H2.6L1.7 1.6H-1.7Z M0 0.3V-1.7 M0 -1.6L1.6 -0.3', stroke: col, class: 'u-sym', fill: 'none' }, g);
    if (u.power === player) el('rect', { x: -4.2, y: -3.1, width: 8.4, height: 6.2, rx: 0.9, class: 'u-mine', stroke: col }, g);
    return g;
  }

  // --------------------------------------------------------- orders
  anchor(id) { const r = this.map.byId[id]; return [r.x, r.y]; }
  near(from, to) {
    // pick the wrapped copy of `to` nearest to `from`
    let [x, y] = this.anchor(to); const [fx] = this.anchor(from);
    if (x - fx > this.W / 2) x -= this.W; else if (fx - x > this.W / 2) x += this.W;
    return [x, y];
  }

  drawOrders(list, opts = {}) {
    this.orderLayer.innerHTML = '';
    const byLoc = new Map(list.map(o => [o.loc, o]));
    for (const o of list) {
      const col = POWERS[o.power].color;
      const failed = opts.results && o.ok === false && o.type === 'M';
      const cls = `ord ${o.type}${failed ? ' failed' : ''}${o.mine ? ' mine' : ''}`;
      const [x1, y1] = this.anchor(o.loc);
      if (o.type === 'H') {
        el('rect', { x: x1 - 5, y: y1 - 3.9, width: 10, height: 7.8, rx: 1, class: cls, stroke: col }, this.orderLayer);
      } else if (o.type === 'M') {
        const [x2, y2] = this.near(o.loc, o.to);
        this.arrow(x1, y1, x2, y2, col, cls, o.convoy);
        if (failed) { const mx = x2 - (x2 - x1) * 0.25, my = y2 - (y2 - y1) * 0.25; el('path', { d: `M${mx - 1.6} ${my - 1.6}L${mx + 1.6} ${my + 1.6}M${mx - 1.6} ${my + 1.6}L${mx + 1.6} ${my - 1.6}`, class: 'ord-x' }, this.orderLayer); }
      } else if (o.type === 'S') {
        const target = byLoc.get(o.from);
        let [x2, y2] = this.near(o.loc, o.from);
        if (o.to !== o.from && target && target.type === 'M' && target.to === o.to) {
          const [tx, ty] = this.near(o.loc, o.to);
          x2 = (x2 + tx) / 2 + (tx - x2) * 0.12; y2 = (y2 + ty) / 2 + (ty - y2) * 0.12;
        } else if (o.to !== o.from) { const [tx, ty] = this.near(o.loc, o.to); x2 = tx; y2 = ty; }
        const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
        el('path', { d: `M${x1 + dx / L * 3.5} ${y1 + dy / L * 3.5}L${x2 - dx / L * (o.to === o.from ? 5 : 0.5)} ${y2 - dy / L * (o.to === o.from ? 5 : 0.5)}`, class: cls, stroke: col }, this.orderLayer);
        el('circle', { cx: x2 - dx / L * (o.to === o.from ? 5 : 0.5), cy: y2 - dy / L * (o.to === o.from ? 5 : 0.5), r: 0.9, fill: col }, this.orderLayer);
      } else if (o.type === 'C') {
        const [ax, ay] = this.near(o.loc, o.from);
        el('path', { d: `M${x1} ${y1}L${ax} ${ay}`, class: cls, stroke: col }, this.orderLayer);
      }
    }
  }

  arrow(x1, y1, x2, y2, col, cls, curved) {
    const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1;
    const ux = dx / L, uy = dy / L;
    const sx = x1 + ux * 3.6, sy = y1 + uy * 3.6, ex = x2 - ux * 4.2, ey = y2 - uy * 4.2;
    const g = el('g', { class: cls }, this.orderLayer);
    let d;
    if (curved) { const cx = (sx + ex) / 2 - uy * L * 0.25, cy = (sy + ey) / 2 + ux * L * 0.25; d = `M${sx} ${sy}Q${cx} ${cy} ${ex} ${ey}`; }
    else d = `M${sx} ${sy}L${ex} ${ey}`;
    el('path', { d, stroke: col, class: 'shaft' }, g);
    const hx = ex + ux * 2.4, hy = ey + uy * 2.4;
    el('path', { d: `M${hx} ${hy}L${ex - uy * 1.6} ${ey + ux * 1.6}L${ex + uy * 1.6} ${ey - ux * 1.6}Z`, fill: col, class: 'head' }, g);
  }

  // --------------------------------------------------------- highlights
  setHighlights(sets) {
    // sets: {cls: Set(ids)}
    for (const e of Object.values(this.regionEls)) e.classList.remove('hl-target', 'hl-sel', 'hl-support', 'hl-dmz');
    for (const [cls, ids] of Object.entries(sets)) for (const id of ids) this.regionEls[id]?.classList.add(cls);
  }
  setHover(id) {
    if (this.hoverId === id) return;
    if (this.hoverId) this.regionEls[this.hoverId]?.classList.remove('hover');
    this.hoverId = id;
    if (id) this.regionEls[id]?.classList.add('hover');
  }
  selectUnit(loc) {
    for (const g of this.unitLayer.querySelectorAll('.unit.selected')) g.classList.remove('selected');
    if (loc) this.unitLayer.querySelector(`.unit[data-loc="${loc}"]`)?.classList.add('selected');
  }
  pulse(id, color = '#39d5ff') {
    const [x, y] = this.anchor(id);
    const c = el('circle', { cx: x, cy: y, r: 2, class: 'pulse', stroke: color }, this.fxLayer);
    setTimeout(() => c.remove(), 1600);
  }

  // --------------------------------------------------------- camera
  viewSize() { const b = this.svg.getBoundingClientRect(); return [b.width, b.height]; }
  minScale() { const [, h] = this.viewSize(); return h / this.H; }
  apply() {
    const [vw, vh] = this.viewSize();
    this.s = Math.max(this.minScale(), Math.min(14, this.s));
    const ws = this.W * this.s;
    while (this.tx > 0) this.tx -= ws;
    while (this.tx < -ws) this.tx += ws;
    this.ty = Math.min(0, Math.max(vh - this.H * this.s, this.ty));
    this.vp.setAttribute('transform', `translate(${this.tx},${this.ty}) scale(${this.s})`);
    const z = this.s / this.minScale();
    this.svg.classList.toggle('z-mid', z >= 2.2);
    this.svg.classList.toggle('z-high', z >= 4.2);
    this.svg.classList.toggle('z-low', z < 2.2);
    this.svg.style.setProperty('--zs', this.s);
    this.onCamera?.();
  }
  centerOn(id, zoom) {
    const [vw, vh] = this.viewSize();
    if (zoom) this.s = this.minScale() * zoom;
    const [x, y] = this.anchor(id);
    this.tx = vw / 2 - x * this.s; this.ty = vh / 2 - y * this.s;
    this.apply();
  }
  flyTo(id, zoom) {
    const [vw, vh] = this.viewSize();
    const s0 = this.s, tx0 = this.tx, ty0 = this.ty;
    const s1 = zoom ? this.minScale() * zoom : this.s;
    const [x, y] = this.anchor(id);
    let tx1 = vw / 2 - x * s1; const ty1 = vh / 2 - y * s1;
    // choose wrapped target closest to current
    const ws = this.W * s1;
    const curCenter = (vw / 2 - tx0) / s0;
    let best = x, bd = Infinity;
    for (const xx of [x - this.W, x, x + this.W]) { const dd = Math.abs(xx - curCenter); if (dd < bd) { bd = dd; best = xx; } }
    tx1 = vw / 2 - best * s1;
    const t0 = performance.now(), dur = 650;
    const step = now => {
      const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      this.s = s0 + (s1 - s0) * e; this.tx = tx0 + (tx1 - tx0) * e; this.ty = ty0 + (ty1 - ty0) * e;
      this.vp.setAttribute('transform', `translate(${this.tx},${this.ty}) scale(${this.s})`);
      if (k < 1) requestAnimationFrame(step); else this.apply();
    };
    requestAnimationFrame(step);
    void ws;
  }
  toMap(cx, cy) {
    const b = this.svg.getBoundingClientRect();
    return [(cx - b.left - this.tx) / this.s, (cy - b.top - this.ty) / this.s];
  }
  lonLat(mx, my) {
    let lon = ((mx % this.W) + this.W) % this.W / this.R + this.lon0; if (lon > 180) lon -= 360;
    return [lon, this.latN - my / this.R];
  }

  bindInput() {
    const svg = this.svg;
    let drag = null;
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const b = svg.getBoundingClientRect();
      const px = e.clientX - b.left, py = e.clientY - b.top;
      const k = Math.exp(-e.deltaY * 0.0015);
      const ns = Math.max(this.minScale(), Math.min(14, this.s * k));
      const kk = ns / this.s;
      this.tx = px - (px - this.tx) * kk; this.ty = py - (py - this.ty) * kk; this.s = ns;
      this.apply();
    }, { passive: false });
    svg.addEventListener('pointerdown', e => {
      if (e.button === 2) return;
      drag = { x: e.clientX, y: e.clientY, tx: this.tx, ty: this.ty, moved: false };
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener('pointermove', e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        if (drag.moved) { this.tx = drag.tx + dx; this.ty = drag.ty + dy; this.apply(); svg.classList.add('dragging'); }
      }
      const [mx, my] = this.toMap(e.clientX, e.clientY);
      const id = this.regionAt(mx, my);
      this.setHover(id);
      this.handlers.hover(id, e, this.lonLat(mx, my));
    });
    svg.addEventListener('pointerup', e => {
      svg.classList.remove('dragging');
      if (drag && !drag.moved && e.button === 0) {
        const [mx, my] = this.toMap(e.clientX, e.clientY);
        this.handlers.click(this.regionAt(mx, my), e);
      }
      drag = null;
    });
    svg.addEventListener('pointerleave', () => { this.setHover(null); this.handlers.hover(null); });
    svg.addEventListener('contextmenu', e => { e.preventDefault(); this.handlers.rightclick(e); });
    window.addEventListener('resize', () => this.apply());
  }
}
