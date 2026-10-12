// Builds public/data/tiles.json: ~1300 land tiles (named after real places) + the sea zones.
// Usage: node tools/build-tiles.js
'use strict';
const fs = require('fs');
const path = require('path');
const { regions: BASE_REGIONS, straits, links } = require('./regions');
let regions = BASE_REGIONS;

const R = 4;               // raster cells per degree
const LON0 = -169;         // map seam (Bering Strait)
const LATN = 80, LATS = -58;
const W = 360 * R, H = (LATN - LATS) * R;
const N = W * H;
const ORPHAN_RANGE = 4 * R; // islands/lakes within this many cells join the nearest region

const dataDir = path.join(__dirname, 'data');
const outFile = path.join(__dirname, '..', 'public', 'data', 'tiles.json');

// ---------- TopoJSON decoding ----------
function decodeTopo(topo) {
  const t = topo.transform;
  const arcs = topo.arcs.map(arc => {
    let x = 0, y = 0;
    return arc.map(p => {
      if (t) { x += p[0]; y += p[1]; return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]]; }
      return p;
    });
  });
  const arcPts = i => (i >= 0 ? arcs[i] : arcs[~i].slice().reverse());
  const ring = idxs => {
    const out = [];
    idxs.forEach((i, k) => { const a = arcPts(i); out.push(...(k ? a.slice(1) : a)); });
    return out;
  };
  const polysOf = g => g.type === 'Polygon' ? [g.arcs.map(ring)]
    : g.type === 'MultiPolygon' ? g.arcs.map(p => p.map(ring)) : [];
  return { arcs, polysOf };
}

const shiftLon = lon => (lon < LON0 ? lon + 360 : lon);
const toX = lon => (lon - LON0) * R;
const toY = lat => (LATN - lat) * R;

// shift a whole polygon consistently (decided by its first ring's mean longitude)
function unwrapRing(r) {
  const out = [[r[0][0], r[0][1]]];
  for (let k = 1; k < r.length; k++) {
    let lon = r[k][0]; const prev = out[k - 1][0];
    while (lon - prev > 180) lon -= 360;
    while (lon - prev < -180) lon += 360;
    out.push([lon, r[k][1]]);
  }
  return out;
}
function shiftPoly(poly) {
  return poly.map(unwrapRing).map(r => {
    const mean = r.reduce((s, p) => s + p[0], 0) / r.length;
    const dx = mean < LON0 ? 360 : mean >= LON0 + 360 ? -360 : 0;
    return r.map(p => [p[0] + dx, p[1]]);
  });
}

// ---------- load land ----------
const landTopo = JSON.parse(fs.readFileSync(path.join(dataDir, 'land-50m.json')));
const landDec = decodeTopo(landTopo);
let landPolys = [];
landTopo.objects.land.geometries.forEach(g => landPolys.push(...landDec.polysOf(g)));
landPolys = landPolys.filter(p => p[0].some(q => q[1] > LATS - 2)).map(shiftPoly);
// a polygon crossing the seam also gets a copy on the other side
landPolys = landPolys.flatMap(p => {
  const xs = p[0].map(q => q[0]);
  if (Math.min(...xs) < LON0) return [p, p.map(r => r.map(q => [q[0] + 360, q[1]]))];
  if (Math.max(...xs) > LON0 + 360) return [p, p.map(r => r.map(q => [q[0] - 360, q[1]]))];
  return [p];
});

// ---------- lakes (big ones become holes in the land) ----------
const ringArea = r => { let a = 0; for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return Math.abs(a / 2); };
const lakesGeo = JSON.parse(fs.readFileSync(path.join(dataDir, 'lakes-50m.geojson')));
const lakePolys = [];
for (const f of lakesGeo.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const p of polys) if (ringArea(p[0]) > 0.5) lakePolys.push(shiftPoly([p[0]]));
}

// ---------- rasterize (even-odd scanline) ----------
function rasterize(polys) {
  const mask = new Uint8Array(N);
  const rows = Array.from({ length: H }, () => []);
  for (const poly of polys) for (const ring of poly) {
    for (let k = 0; k < ring.length - 1; k++) {
      const x1 = toX(ring[k][0]), y1 = toY(ring[k][1]), x2 = toX(ring[k + 1][0]), y2 = toY(ring[k + 1][1]);
      if (y1 === y2) continue;
      const e = y1 < y2 ? [y1, x1, y2, x2] : [y2, x2, y1, x1];
      const j0 = Math.max(0, Math.ceil(e[0] - 0.5)), j1 = Math.min(H - 1, Math.floor(e[2] - 0.5));
      for (let j = j0; j <= j1; j++) {
        const y = j + 0.5;
        if (y < e[0] || y >= e[2]) continue;
        rows[j].push(e[1] + (y - e[0]) * (e[3] - e[1]) / (e[2] - e[0]));
      }
    }
  }
  for (let j = 0; j < H; j++) {
    const xs = rows[j].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil(xs[k] - 0.5)), i1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5));
      for (let i = i0; i <= i1; i++) mask[j * W + i] = 1;
    }
  }
  return mask;
}
function rasterizeInto(polys, target, value) {
  const rows = Array.from({ length: H }, () => []);
  for (const poly of polys) for (const ring of poly) {
    for (let k = 0; k < ring.length - 1; k++) {
      const x1 = toX(ring[k][0]), y1 = toY(ring[k][1]), x2 = toX(ring[k + 1][0]), y2 = toY(ring[k + 1][1]);
      if (y1 === y2) continue;
      const e = y1 < y2 ? [y1, x1, y2, x2] : [y2, x2, y1, x1];
      const j0 = Math.max(0, Math.ceil(e[0] - 0.5)), j1 = Math.min(H - 1, Math.floor(e[2] - 0.5));
      for (let j = j0; j <= j1; j++) { const y = j + 0.5; if (y < e[0] || y >= e[2]) continue; rows[j].push(e[1] + (y - e[0]) * (e[3] - e[1]) / (e[2] - e[0])); }
    }
  }
  for (let j = 0; j < H; j++) {
    const xs = rows[j].sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil(xs[k] - 0.5)), i1 = Math.min(W - 1, Math.floor(xs[k + 1] - 0.5)); for (let i = i0; i <= i1; i++) target[j * W + i] = value; }
  }
}
const land = rasterize(landPolys);
const lake = rasterize(lakePolys);
for (let c = 0; c < N; c++) if (lake[c]) land[c] = 0;

// ---------- helpers ----------
const cosLat = new Float32Array(H);
for (let j = 0; j < H; j++) cosLat[j] = Math.max(0.2, Math.cos((LATN - (j + 0.5) / R) * Math.PI / 180));
const wrapI = i => (i + W) % W;

class Heap {
  constructor() { this.k = []; this.v = []; }
  push(key, val) {
    const k = this.k, v = this.v; let n = k.length; k.push(key); v.push(val);
    while (n > 0) { const p = (n - 1) >> 1; if (k[p] <= key) break; k[n] = k[p]; v[n] = v[p]; n = p; }
    k[n] = key; v[n] = val;
  }
  pop() {
    const k = this.k, v = this.v; const top = v[0], topK = k[0]; const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let n = 0; const len = k.length;
      for (;;) { let c = 2 * n + 1; if (c >= len) break; if (c + 1 < len && k[c + 1] < k[c]) c++; if (k[c] >= lk) break; k[n] = k[c]; v[n] = v[c]; n = c; }
      k[n] = lk; v[n] = lv;
    }
    this.lastKey = topK; return top;
  }
  get size() { return this.k.length; }
}

// Multi-source Dijkstra. sources: [[cell,label]], passable(cell) -> bool. Writes into lab/dist.
function grow(sources, passable, lab, dist, maxDist = Infinity) {
  const h = new Heap();
  for (const [c, l] of sources) { dist[c] = 0; lab[c] = l; h.push(0, c); }
  while (h.size) {
    const c = h.pop(); const d = h.lastKey;
    if (d > dist[c]) continue;
    const i = c % W, j = (c / W) | 0; const cx = cosLat[j];
    for (let dj = -1; dj <= 1; dj++) {
      const nj = j + dj; if (nj < 0 || nj >= H) continue;
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const n = nj * W + wrapI(i + di);
        if (!passable(n, c)) continue;
        const step = di && dj ? Math.sqrt(cx * cx + 1) : di ? cx : 1;
        const nd = d + step;
        if (nd < dist[n] && nd <= maxDist) { dist[n] = nd; lab[n] = lab[c]; h.push(nd, n); }
      }
    }
  }
}

// ---------- seeds ----------
const idx = {}; regions.forEach((r, k) => { if (r.id in idx) throw new Error('dup id ' + r.id); idx[r.id] = k; });
const cellOf = (lat, lon) => {
  const i = Math.floor(toX(shiftLon(lon))), j = Math.floor(toY(lat));
  return Math.min(H - 1, Math.max(0, j)) * W + wrapI(i);
};
function snap(cell, wantLand, maxR = 14) {
  if (!!land[cell] === wantLand) return cell;
  const i0 = cell % W, j0 = (cell / W) | 0;
  for (let r = 1; r <= maxR; r++) {
    let best = -1, bd = 1e9;
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const j = j0 + dj; if (j < 0 || j >= H) continue;
      const c = j * W + wrapI(i0 + di);
      if (!!land[c] === wantLand) { const d = di * di + dj * dj; if (d < bd) { bd = d; best = c; } }
    }
    if (best >= 0) return best;
  }
  return -1;
}
const warnings = [];
let seeds = regions.map((r, k) => {
  let c = cellOf(r.lat, r.lon);
  const s = snap(c, r.type === 'land');
  if (s < 0) {
    // tiny island lost in raster: force a land cell
    if (r.type === 'land') { land[c] = 1; warnings.push(`forced land cell for ${r.id}`); return c; }
    throw new Error('cannot place sea seed ' + r.id);
  }
  if (s !== c) warnings.push(`snapped ${r.id}`);
  return s;
});

// ---------- sea ----------
const label = new Int16Array(N).fill(-1);
const dist = new Float32Array(N).fill(Infinity);
grow(regions.map((r, k) => [seeds[k], k]).filter(([, k]) => regions[k].type === 'sea'), c => !land[c], label, dist);
// orphan seas (lakes, enclosed bits): attach to nearby sea region or convert to land
{
  const l2 = new Int16Array(N).fill(-1), d2 = new Float32Array(N).fill(Infinity);
  const src = []; for (let c = 0; c < N; c++) if (!land[c] && label[c] >= 0) src.push([c, label[c]]);
  grow(src, () => true, l2, d2, ORPHAN_RANGE);
  let conv = 0, att = 0;
  for (let c = 0; c < N; c++) if (!land[c] && label[c] < 0) {
    if (l2[c] >= 0 && !lake[c]) { label[c] = l2[c]; att++; } else { land[c] = 2; conv++; } // 2 = lake treated as land
  }
  warnings.push(`orphan sea cells: attached ${att}, lakes->land ${conv}`);
}
// ---------- land ----------
dist.fill(Infinity);
grow(regions.map((r, k) => [seeds[k], k]).filter(([, k]) => regions[k].type === 'land'), c => !!land[c], label, dist);
{
  const l2 = new Int16Array(N).fill(-1), d2 = new Float32Array(N).fill(Infinity);
  const src = []; for (let c = 0; c < N; c++) if (land[c] && label[c] >= 0) src.push([c, label[c]]);
  grow(src, () => true, l2, d2, ORPHAN_RANGE);
  let att = 0, dead = 0;
  for (let c = 0; c < N; c++) if (land[c] && label[c] < 0) {
    if (l2[c] >= 0 && regions[l2[c]].type === 'land') { label[c] = l2[c]; att++; } else { label[c] = -2; dead++; }
  }
  warnings.push(`orphan land cells: attached ${att}, dead ${dead}`);
}

// ================================================================ TILE SUBDIVISION
// The hand-made regions above give us coasts, seas and a per-region climate summary (geo.json).
// Now we scatter ~1300 land tiles over the continents and grow them over the land cells.
const OLD_SEED = {}; regions.forEach((r, k) => { OLD_SEED[r.id] = seeds[k]; });
const oldLabel = Int16Array.from(label);
const oldRegions = regions;
const geoOld = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'geo.json')));
const cellLL = c => { const i = c % W, j = (c / W) | 0; let lon = LON0 + (i + 0.5) / R; if (lon > 180) lon -= 360; return [LATN - (j + 0.5) / R, lon]; };
const kmLL = (a, b) => { const dl = ((b[1] - a[1] + 540) % 360) - 180; const x = dl * Math.cos((a[0] + b[0]) / 2 * Math.PI / 180), y = b[0] - a[0]; return Math.sqrt(x * x + y * y) * 111.2; };
let rngState = 1234567;
const rand = () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; };
const DENSE = [
  [36, 60, -10, 40, 150], [28, 42, -10, 60, 145], [22, 32, 29, 34, 120], [29, 38, 34, 50, 125], [8, 32, 68, 92, 170],
  [20, 42, 102, 123, 165], [30, 45, 125, 146, 150], [13, 22, -105, -86, 150], [-20, -2, -82, -68, 165], [8, 24, 95, 110, 175],
  [50, 60, -11, 2, 140], [25, 40, -100, -75, 200],
];
function spacingFor(c) {
  const l = oldLabel[c]; const g = l >= 0 ? geoOld[l] : null; const lat = cellLL(c)[0];
  let r = 250;
  if (g) { const dens = g.lights / Math.max(1, g.area) * 1000; if (g.fert > 0.55 || dens > 2) r = 215; else if (g.fert < 0.12 || g.arid > 0.6) r = 370; }
  // historic heartlands get finer tiles
  const lon = cellLL(c)[1];
  const dry = g && (g.arid > 0.55 || g.fert < 0.1);
  for (const [la0, la1, lo0, lo1, sp] of DENSE) if (lat >= la0 && lat <= la1 && lon >= lo0 && lon <= lo1) { r = Math.min(r, dry ? Math.max(sp * 1.6, 240) : sp); }
  if (Math.abs(lat) > 58) r *= 1.3;
  if (Math.abs(lat) > 66) r *= 1.3;
  return r * 0.78; // map v2: finer regions everywhere
}
const cand = [];
const interior = c => { const i = c % W, j = (c / W) | 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const nj = j + dj; if (nj < 0 || nj >= H) return false; const n = nj * W + wrapI(i + di); if (!land[n] || oldLabel[n] !== oldLabel[c]) return false; } return true; };
for (let c = 0; c < N; c++) if (land[c] === 1 && oldLabel[c] >= 0 && oldRegions[oldLabel[c]].type === 'land' && interior(c)) cand.push(c);
for (let k = cand.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [cand[k], cand[j]] = [cand[j], cand[k]]; }
const BIN = 2; // degrees
const bins = new Map();
const binKey = (lat, lon) => Math.floor((lat + 90) / BIN) * 1000 + Math.floor((lon + 180) / BIN);
const tileSeeds = [];
function tooClose(ll, r) {
  const db = Math.ceil(r / 111 / BIN) + 1, dlon = Math.min(180 / BIN, Math.ceil(db / Math.max(0.15, Math.cos(ll[0] * Math.PI / 180))));
  const bl = Math.floor((ll[0] + 90) / BIN), bo = Math.floor((ll[1] + 180) / BIN), nb = 360 / BIN;
  for (let i = -db; i <= db; i++) for (let j = -dlon; j <= dlon; j++) {
    const arr = bins.get((bl + i) * 1000 + (((bo + j) % nb) + nb) % nb); if (!arr) continue;
    for (const s2 of arr) if (kmLL(ll, s2.ll) < Math.min(r, s2.r)) return true;
  }
  return false;
}
function addSeed(c) { const ll = cellLL(c), r = spacingFor(c); const k = binKey(...ll); if (!bins.has(k)) bins.set(k, []); bins.get(k).push({ ll, r }); tileSeeds.push(c); }
for (const c of cand) { if (!tooClose(cellLL(c), spacingFor(c))) addSeed(c); }
// every old land region (islands included) keeps at least one tile
const seedCount = new Map();
for (const c of tileSeeds) seedCount.set(oldLabel[c], (seedCount.get(oldLabel[c]) || 0) + 1);
oldRegions.forEach((r, k) => { if (r.type === 'land' && !seedCount.get(k)) addSeed(OLD_SEED[r.id]); });
warnings.push(`tile seeds: ${tileSeeds.length}`);

// relabel: tiles first, then the original sea zones
const seaOld = oldRegions.map((r, k) => k).filter(k => oldRegions[k].type === 'sea');
const tiles = tileSeeds.map((c, k) => { const [lat, lon] = cellLL(c); return { id: 't' + k, name: null, lat, lon, type: 'land' }; });
const seaMap = new Map(seaOld.map((k, n) => [k, tiles.length + n]));
const label2 = new Int16Array(N).fill(-1);
for (let c = 0; c < N; c++) { const l = oldLabel[c]; if (l >= 0 && oldRegions[l].type === 'sea') label2[c] = seaMap.get(l); }
{
  // tiles grow only inside their parent region, so they nest within the hand-made (roughly national) regions
  const tileOld = tileSeeds.map(c => oldLabel[c]);
  const isLandRegion = c => oldLabel[c] >= 0 && oldRegions[oldLabel[c]].type === 'land';
  const d2 = new Float32Array(N).fill(Infinity);
  grow(tileSeeds.map((c, k) => [c, k]), (n, c) => !!land[n] && isLandRegion(n) && oldLabel[n] === tileOld[label2[c]], label2, d2);
  // detached islands of a region join the nearest tile of the same region across water
  const l3 = new Int16Array(N).fill(-1), d3 = new Float32Array(N).fill(Infinity);
  const src = []; for (let c = 0; c < N; c++) if (label2[c] >= 0 && label2[c] < tiles.length) src.push([c, label2[c]]);
  grow(src, (n, c) => !land[n] || oldLabel[n] === tileOld[l3[c]], l3, d3, ORPHAN_RANGE * 3);
  for (let c = 0; c < N; c++) if (land[c] && label2[c] < 0 && isLandRegion(c) && l3[c] >= 0) label2[c] = l3[c];
  // anything left falls to whichever tile is closest
  const l4 = new Int16Array(N).fill(-1), d4 = new Float32Array(N).fill(Infinity);
  const src2 = []; for (let c = 0; c < N; c++) if (label2[c] >= 0 && label2[c] < tiles.length) src2.push([c, label2[c]]);
  grow(src2, () => true, l4, d4, ORPHAN_RANGE);
  for (let c = 0; c < N; c++) if (land[c] && label2[c] < 0) label2[c] = l4[c] >= 0 && oldLabel[c] !== -2 ? l4[c] : -2;
}
label.set(label2);
regions = [...tiles, ...seaOld.map(k => ({ ...oldRegions[k] }))];
seeds = [...tileSeeds, ...seaOld.map(k => seeds[k])];

// per-tile metadata: parent region, modern country, cell counts
const CELLS = new Int32Array(regions.length);
const parentVotes = tiles.map(() => new Map());
for (let c = 0; c < N; c++) {
  const l = label[c]; if (l < 0) continue; CELLS[l]++;
  if (l < tiles.length && oldLabel[c] >= 0) parentVotes[l].set(oldLabel[c], (parentVotes[l].get(oldLabel[c]) || 0) + 1);
}
tiles.forEach((t, k) => { const best = [...parentVotes[k]].sort((a, b) => b[1] - a[1])[0]; t.parent = best ? oldRegions[best[0]].id : null; t.parentName = best ? oldRegions[best[0]].name : null; });
{
  const cty = JSON.parse(fs.readFileSync(path.join(dataDir, 'countries-50m.json')));
  const dec = decodeTopo(cty);
  const geoms = cty.objects.countries.geometries;
  const cgrid = new Int16Array(N).fill(-1);
  geoms.forEach((g, gi) => {
    let polys = dec.polysOf(g).filter(p => p[0].some(q => q[1] > LATS - 2)).map(shiftPoly);
    polys = polys.flatMap(p => { const xs = p[0].map(q => q[0]); if (Math.min(...xs) < LON0) return [p, p.map(r => r.map(q => [q[0] + 360, q[1]]))]; if (Math.max(...xs) > LON0 + 360) return [p, p.map(r => r.map(q => [q[0] - 360, q[1]]))]; return [p]; });
    rasterizeInto(polys, cgrid, gi);
  });
  const votes = tiles.map(() => new Map());
  for (let c = 0; c < N; c++) { const l = label[c]; if (l >= 0 && l < tiles.length && cgrid[c] >= 0) votes[l].set(cgrid[c], (votes[l].get(cgrid[c]) || 0) + 1); }
  tiles.forEach((t, k) => { const best = [...votes[k]].sort((a, b) => b[1] - a[1])[0]; t.country = best ? geoms[best[0]].properties.name : null; });
}
// names from real places: the most populous place inside the tile, else the province of the nearest place
{
  const places = JSON.parse(fs.readFileSync(path.join(dataDir, 'places-10m.geojson'))).features.map(f => f.properties);
  const best = tiles.map(() => null);
  const near = [];
  for (const p of places) {
    const c = cellOf(p.latitude, p.longitude); let l = label[c];
    if (!(l >= 0 && l < tiles.length)) { const i0 = c % W, j0 = (c / W) | 0; l = -1; for (let r = 1; r <= 3 && l < 0; r++) for (let dj = -r; dj <= r && l < 0; dj++) for (let di = -r; di <= r; di++) { const j = j0 + dj; if (j < 0 || j >= H) continue; const q = label[j * W + wrapI(i0 + di)]; if (q >= 0 && q < tiles.length) { l = q; break; } } }
    if (l < 0) continue;
    const score = (p.pop_max || 0) * (p.adm0cap ? 3 : 1) * (p.worldcity ? 2 : 1);
    if (!best[l] || score > best[l].score) best[l] = { name: p.name, score, adm1: p.adm1name, lat: p.latitude, lon: p.longitude };
    near.push({ ll: [p.latitude, p.longitude], adm1: p.adm1name, name: p.name });
  }
  const used = new Map();
  const uniq = n => { const k = used.get(n) || 0; used.set(n, k + 1); return k ? `${n} ${['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII'][k] || k + 1}` : n; };
  tiles.forEach((t, k) => { if (best[k]) { t.name = uniq(best[k].name); t.city = [best[k].lat, best[k].lon]; } });
  const compass = (t) => {
    const p = BASE_REGIONS.find(r => r.id === t.parent); if (!p) return '';
    const dy = t.lat - p.lat, dx = (((t.lon - p.lon + 540) % 360) - 180) * Math.cos(t.lat * Math.PI / 180);
    if (Math.hypot(dx, dy) < 2) return 'Central ';
    const a = Math.atan2(dy, dx) * 180 / Math.PI;
    return a > 135 || a < -135 ? 'West ' : a > 45 ? 'North ' : a > -45 ? 'East ' : 'South ';
  };
  tiles.forEach(t => {
    if (t.name) return;
    let cand2 = null, bd = 500;
    for (const p of near) { const d = kmLL([t.lat, t.lon], p.ll); if (d < bd && p.adm1 && !used.has(p.adm1)) { bd = d; cand2 = p.adm1; } }
    t.name = uniq(cand2 || (compass(t) + (t.parentName || 'Wilds')));
  });
}
// deep ocean: sea zones mostly far from any coast (early ships cannot cross them)
{
  const dl = new Int16Array(N).fill(-1); const q = [];
  for (let c = 0; c < N; c++) if (land[c]) { dl[c] = 0; q.push(c); }
  for (let h = 0; h < q.length; h++) { const c = q[h]; if (dl[c] >= 12) continue; const i = c % W, j = (c / W) | 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nj = j + dj; if (nj < 0 || nj >= H) continue; const n = nj * W + wrapI(i + di); if (dl[n] < 0) { dl[n] = dl[c] + 1; q.push(n); } } }
  const near2 = new Int32Array(regions.length);
  for (let c = 0; c < N; c++) { const l = label[c]; if (l >= tiles.length && dl[c] >= 0 && dl[c] <= 10) near2[l]++; }
  regions.forEach((r, k) => { if (r.type === 'sea') r.deep = near2[k] / Math.max(1, CELLS[k]) < 0.42; });
}

// ---------- adjacency ----------
const pairCount = new Map();
const addPair = (a, b) => {
  if (a < 0 || b < 0 || a === b) return;
  const key = a < b ? a * 4096 + b : b * 4096 + a;
  pairCount.set(key, (pairCount.get(key) || 0) + 1);
};
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const a = label[j * W + i];
  addPair(a, label[j * W + wrapI(i + 1)]);
  if (j + 1 < H) addPair(a, label[(j + 1) * W + i]);
}
const adj = regions.map(() => new Set());
for (const [key, cnt] of pairCount) {
  const a = Math.floor(key / 4096), b = key % 4096;
  const ta = regions[a].type, tb = regions[b].type;
  const need = ta === tb ? 2 : 1;
  if (cnt >= need) { adj[a].add(b); adj[b].add(a); }
}
function regionNear(lat, lon) {
  const c0 = cellOf(lat, lon); const i0 = c0 % W, j0 = (c0 / W) | 0;
  for (let r = 0; r < 10; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
    const j = j0 + dj; if (j < 0 || j >= H) continue;
    const l = label[j * W + wrapI(i0 + di)];
    if (l >= 0 && regions[l].type === 'sea') return l;
  }
  return -1;
}
for (const [p, q] of straits) {
  const a = regionNear(...p), b = regionNear(...q);
  if (a < 0 || b < 0) { warnings.push('strait probe failed ' + JSON.stringify([p, q])); continue; }
  if (a !== b) { adj[a].add(b); adj[b].add(a); }
}

for (const [a, b] of links) { const la = label[OLD_SEED[a]], lb = label[OLD_SEED[b]]; if (la >= 0 && lb >= 0 && la !== lb) { adj[la].add(lb); adj[lb].add(la); } }

// ---------- region label points (distance transform) ----------
const anchor = regions.map(() => ({ d: -1, c: -1 }));
{
  const dt = new Int16Array(N).fill(-1); const q = [];
  for (let c = 0; c < N; c++) {
    if (label[c] < 0) continue;
    const i = c % W, j = (c / W) | 0; let edge = j === 0 || j === H - 1;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nj = j + dj; if (nj < 0 || nj >= H) continue;
      if (label[nj * W + wrapI(i + di)] !== label[c]) edge = true;
    }
    if (edge) { dt[c] = 0; q.push(c); }
  }
  for (let h = 0; h < q.length; h++) {
    const c = q[h]; const i = c % W, j = (c / W) | 0;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nj = j + dj; if (nj < 0 || nj >= H) continue;
      const n = nj * W + wrapI(i + di);
      if (dt[n] < 0 && label[n] === label[c]) { dt[n] = dt[c] + 1; q.push(n); }
    }
  }
  for (let c = 0; c < N; c++) {
    const l = label[c]; if (l < 0) continue;
    const i = c % W, j = (c / W) | 0;
    // prefer cells near the seed among similarly deep cells
    const sc = seeds[l]; const si = sc % W, sj = (sc / W) | 0;
    let dx = Math.abs(i - si); dx = Math.min(dx, W - dx);
    const score = dt[c] * 1.0 - Math.hypot(dx, j - sj) * 0.04;
    if (score > anchor[l].d) anchor[l] = { d: score, c };
  }
}

// ---------- boundary tracing into shared chains ----------
const OUT = -9;
function trace(G) {
  const lab = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? OUT : G[j * W + i]);
  // horizontal edge (i,j)->(i+1,j) between pixel (i,j-1) above and (i,j) below; id = j*W+i, j in [0,H]
  // vertical edge (i,j)->(i,j+1) between pixel (i-1,j) left and (i,j) right; id = HE + j*(W+1)+i
  const HE = (H + 1) * W;
  const hasH = (i, j) => i >= 0 && i < W && j >= 0 && j <= H && lab(i, j - 1) !== lab(i, j);
  const hasV = (i, j) => i >= 0 && i <= W && j >= 0 && j < H && lab(i - 1, j) !== lab(i, j);
  const visited = new Uint8Array(HE + H * (W + 1));
  // incident edges of corner (i,j): returns [{id, to:[i,j]}]
  const inc = (i, j) => {
    const r = [];
    if (hasH(i, j)) r.push({ id: j * W + i, to: [i + 1, j] });
    if (hasH(i - 1, j)) r.push({ id: j * W + i - 1, to: [i - 1, j] });
    if (hasV(i, j)) r.push({ id: HE + j * (W + 1) + i, to: [i, j + 1] });
    if (hasV(i, j - 1)) r.push({ id: HE + (j - 1) * (W + 1) + i, to: [i, j - 1] });
    return r;
  };
  const isJunction = (i, j) => inc(i, j).length > 2;
  // labels left/right for a directed step from a to b
  const sides = (a, b) => {
    const [i, j] = a;
    if (b[0] === i + 1) return [lab(i, j - 1), lab(i, j)];
    if (b[0] === i - 1) return [lab(i - 1, j), lab(i - 1, j - 1)];
    if (b[1] === j + 1) return [lab(i, j), lab(i - 1, j)];
    return [lab(i - 1, j - 1), lab(i, j - 1)];
  };
  const chains = [];
  const walk = (start, first) => {
    const pts = [start, first.to]; visited[first.id] = 1;
    const [left, right] = sides(start, first.to);
    let cur = first.to;
    while (!(cur[0] === start[0] && cur[1] === start[1]) && !isJunction(cur[0], cur[1])) {
      const nx = inc(cur[0], cur[1]).find(e => !visited[e.id]);
      if (!nx) break;
      visited[nx.id] = 1; pts.push(nx.to); cur = nx.to;
    }
    chains.push({ pts, left, right });
  };
  for (let j = 0; j <= H; j++) for (let i = 0; i <= W; i++) {
    const es = inc(i, j); if (es.length <= 2) continue;
    for (const e of es) if (!visited[e.id]) walk([i, j], e);
  }
  for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) {
    if (hasH(i, j) && !visited[j * W + i]) walk([i, j], { id: j * W + i, to: [i + 1, j] });
  }
  return chains;
}

// Douglas-Peucker
function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let md = -1, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b]; const dx = bx - ax, dy = by - ay; const L2 = dx * dx + dy * dy;
    for (let k = a + 1; k < b; k++) {
      const [px, py] = pts[k];
      const d = L2 === 0 ? Math.hypot(px - ax, py - ay) : Math.abs(dy * px - dx * py + bx * ay - by * ax) / Math.sqrt(L2);
      if (d > md) { md = d; mi = k; }
    }
    if (md > eps) { keep[mi] = 1; stack.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, k) => keep[k]);
}
function chaikin(pts, iters) {
  for (let it = 0; it < iters; it++) {
    if (pts.length < 3) return pts;
    const out = [pts[0]];
    for (let k = 0; k < pts.length - 1; k++) {
      const [ax, ay] = pts[k], [bx, by] = pts[k + 1];
      out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25], [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75]);
    }
    out.push(pts[pts.length - 1]); pts = out;
  }
  return pts;
}
const smooth = pts => {
  // close loops keep start fixed; that is fine visually
  let s = rdp(pts, 0.75);
  if (s.length < 3 && pts.length > 4) s = [pts[0], pts[(pts.length / 2) | 0], pts[pts.length - 1]];
  return chaikin(s, 2);
};
const fmt = v => Math.round(v * 10) / 10;
const key = p => p[0] + ',' + p[1];

function regionPaths(chains, wanted) {
  // chains get smoothed once (shared between neighbours)
  chains.forEach(ch => { ch.sm = smooth(ch.pts); });
  const per = new Map();
  for (const ch of chains) {
    for (const [lab, rev] of [[ch.left, false], [ch.right, true]]) {
      if (lab < 0 || !wanted(lab)) continue;
      if (!per.has(lab)) per.set(lab, []);
      per.get(lab).push(rev ? { a: ch.pts[ch.pts.length - 1], b: ch.pts[0], sm: ch.sm.slice().reverse() } : { a: ch.pts[0], b: ch.pts[ch.pts.length - 1], sm: ch.sm });
    }
  }
  const out = {};
  for (const [lab, segs] of per) {
    const byStart = new Map();
    segs.forEach((s, k) => { const kk = key(s.a); if (!byStart.has(kk)) byStart.set(kk, []); byStart.get(kk).push(k); });
    const used = new Uint8Array(segs.length); let d = '';
    for (let s0 = 0; s0 < segs.length; s0++) {
      if (used[s0]) continue;
      let ring = []; let k = s0; const startKey = key(segs[s0].a);
      while (k >= 0 && !used[k]) {
        used[k] = 1; ring.push(...(ring.length ? segs[k].sm.slice(1) : segs[k].sm));
        const endKey = key(segs[k].b); if (endKey === startKey) break;
        const cands = byStart.get(endKey) || []; k = cands.find(c => !used[c]); if (k === undefined) k = -1;
      }
      if (ring.length < 3) continue;
      d += 'M' + ring.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L') + 'Z';
    }
    out[lab] = d;
  }
  return out;
}
function chainPath(chains, pred) {
  let d = '';
  for (const ch of chains) if (pred(ch.left, ch.right)) {
    const pts = ch.sm || smooth(ch.pts);
    d += 'M' + pts.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L');
  }
  return d;
}
// dilate labels from cells matching `src` into cells matching `into`, up to r steps (BFS, no wrap needed)
function dilate(G, src, into, r) {
  const out = Int16Array.from(G); let frontier = [];
  for (let c = 0; c < N; c++) if (src(G[c])) frontier.push(c);
  for (let step = 0; step < r; step++) {
    const next = [];
    for (const c of frontier) {
      const i = c % W, j = (c / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const n = nj * W + ni;
        if (into(out[n]) && !src(out[n])) { out[n] = out[c]; next.push(n); }
      }
    }
    frontier = next;
  }
  return out;
}
const isLandLab = l => l === -2 || (l >= 0 && regions[l].type === 'land');
const isSeaLab = l => l >= 0 && regions[l].type === 'sea';

// grid A: land regions dilated into sea
const gridA = new Int16Array(N);
for (let c = 0; c < N; c++) gridA[c] = isLandLab(label[c]) ? label[c] : -1;
const gA = dilate(gridA, isLandLab, l => l === -1, 3);
const chainsA = trace(gA);
chainsA.forEach(ch => { ch.sm = smooth(ch.pts); });
const landShapes = {};
const landBorders = chainPath(chainsA, (a, b) => a >= 0 && b >= 0);
const deadLandBorders = chainPath(chainsA, (a, b) => (a === -2 && b >= 0) || (b === -2 && a >= 0));

// grid B: sea regions dilated into land
const gridB = new Int16Array(N);
for (let c = 0; c < N; c++) gridB[c] = isSeaLab(label[c]) ? label[c] : -1;
const gB = dilate(gridB, isSeaLab, l => l === -1, 4);
const chainsB = trace(gB);
chainsB.forEach(ch => { ch.sm = smooth(ch.pts); });
const seaShapes = {};
const seaBorders = chainPath(chainsB, (a, b) => a >= 0 && b >= 0);

// ---------- vector coastline ----------
function polyPath(polys, simplifyEps) {
  let d = '';
  for (const poly of polys) for (const ring of poly) {
    let pts = ring.map(p => [toX(p[0]), toY(p[1])]);
    pts = rdp(pts, simplifyEps);
    if (pts.length < 3) continue;
    d += 'M' + pts.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L') + 'Z';
  }
  return d;
}
const landPath = polyPath(landPolys, 0.12) + polyPath(lakePolys, 0.12);

// country borders (internal arcs only)
const ctyTopo = JSON.parse(fs.readFileSync(path.join(dataDir, 'countries-50m.json')));
const ctyDec = decodeTopo(ctyTopo);
let countryPath = '';
{
  const counts = new Map();
  const visit = (arcsArr, gi) => {
    for (const a of arcsArr) { if (Array.isArray(a)) visit(a, gi); else { const k = a < 0 ? ~a : a; if (!counts.has(k)) counts.set(k, new Set()); counts.get(k).add(gi); } }
  };
  ctyTopo.objects.countries.geometries.forEach((g, gi) => g.arcs && visit(g.arcs, gi));
  for (const [k, set] of counts) {
    if (set.size < 2) continue;
    let pts = ctyDec.arcs[k];
    const mean = pts.reduce((s, p) => s + p[0], 0) / pts.length;
    const dx = mean < LON0 ? 360 : 0;
    pts = rdp(pts.map(p => [toX(p[0] + dx), toY(p[1])]), 0.15);
    countryPath += 'M' + pts.map(p => fmt(p[0]) + ' ' + fmt(p[1])).join('L');
  }
}

// ---------- hit grid (RLE) ----------
const rle = [];
{
  let cur = label[0], run = 0;
  for (let c = 0; c < N; c++) { const l = label[c] < 0 ? -1 : label[c]; if (l === cur) run++; else { rle.push(cur, run); cur = l; run = 1; } }
  rle.push(cur, run);
}

// ---------- assemble ----------
const coastal = regions.map((r, k) => r.type === 'land' && [...adj[k]].some(n => regions[n].type === 'sea'));
const out = { version: 2,
  W, H, R, lon0: LON0, latN: LATN,
  regions: regions.map((r, k) => {
    const c = anchor[k].c >= 0 ? anchor[k].c : seeds[k];
    return {
      id: r.id, name: r.name, type: r.type, coastal: coastal[k],
      x: (c % W) + 0.5, y: ((c / W) | 0) + 0.5,
      adj: [...adj[k]].map(n => regions[n].id).sort(),
      parent: r.parent || null, country: r.country || null, deep: !!r.deep, cells: CELLS[k] || 0, city: r.city ? [+r.city[0].toFixed(2), +r.city[1].toFixed(2)] : null,
    };
  }),
  landPath, countryPath, landBorders, seaBorders, deadLandBorders,
  landChains: chainsA.filter(ch => ch.left >= 0 && ch.right >= 0).map(ch => [ch.left, ch.right, ...(ch.sm || smooth(ch.pts)).flatMap(p => [fmt(p[0]), fmt(p[1])])]),
  seaChains: chainsB.filter(ch => ch.left >= 0 && ch.right >= 0).map(ch => [ch.left, ch.right, ...(ch.sm || smooth(ch.pts)).flatMap(p => [fmt(p[0]), fmt(p[1])])]),
  grid: rle,
};

// ---------- validation ----------
const problems = [];
out.regions.forEach((r, k) => {
  if (!r.adj.length) problems.push(`${r.id}: no neighbours`);
  let cells = 0; for (let c = 0; c < N; c++) if (label[c] === k) cells++;
  r.cells = cells;
  if (cells < 3) problems.push(`${r.id} ${r.name}: tiny (${cells} cells)`);
});
// connected components of each region (wrap-aware) to flag split regions
{
  const seen = new Uint8Array(N); const comps = regions.map(() => []);
  for (let c = 0; c < N; c++) {
    if (seen[c] || label[c] < 0) continue;
    const l = label[c]; let size = 0; const q = [c]; seen[c] = 1;
    while (q.length) {
      const x = q.pop(); size++; const i = x % W, j = (x / W) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nj = j + dj; if (nj < 0 || nj >= H) continue; const n = nj * W + wrapI(i + di);
        if (!seen[n] && label[n] === l) { seen[n] = 1; q.push(n); }
      }
    }
    comps[l].push(size);
  }
  comps.forEach((cs, k) => {
    cs.sort((a, b) => b - a);
    if (cs.length > 1 && cs[1] > Math.max(40, cs[0] * 0.15)) problems.push(`${regions[k].id}: split into parts ${cs.slice(0, 4).join('/')}`);
  });
}
out.regions.forEach(r => delete r.cells);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(warnings.join('\n'));
console.log('PROBLEMS:\n' + (problems.join('\n') || 'none'));
console.log(`regions: ${regions.length} (land tiles ${regions.filter(r => r.type === 'land').length}, sea ${regions.filter(r => r.type === 'sea').length}, deep ocean ${regions.filter(r => r.deep).length})`);
console.log(`size: ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB  (land ${(landPath.length / 1024) | 0}K, countries ${(countryPath.length / 1024) | 0}K)`);

if (process.argv.includes('--ascii')) {
  // coarse ASCII preview, every 4th cell
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let s = '';
  for (let j = 0; j < H; j += 6) { for (let i = 0; i < W; i += 3) { const l = label[j * W + i]; s += l === -2 ? '#' : l < 0 ? ' ' : regions[l].type === 'sea' ? '.' : chars[l % chars.length]; } s += '\n'; }
  fs.writeFileSync(path.join(__dirname, 'preview.txt'), s);
}
if (process.argv.includes('--adj')) {
  out.regions.forEach(r => console.log(r.id.padEnd(4), r.adj.join(' ')));
}

if (process.argv.includes('--png')) {
  const zlib = require('zlib');
  const S = 1; // scale
  const raw = Buffer.alloc((W * S * 3 + 1) * H * S);
  const col = l => {
    if (l === -2) return [60, 60, 60];
    if (l < 0) return [0, 0, 0];
    const h = (l * 137.508) % 360; const sea = regions[l].type === 'sea';
    const f = (n) => { const k = (n + h / 30) % 12; const a = (sea ? 0.35 : 0.6) * Math.min(0.5, 1 - 0.5);
      return Math.round(255 * ((sea ? 0.25 : 0.55) - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)))); };
    return [f(0), f(8), f(4)];
  };
  for (let j = 0; j < H; j++) {
    const row = j * (W * 3 + 1); raw[row] = 0;
    for (let i = 0; i < W; i++) {
      const c = j * W + i; let rgb = col(label[c]);
      const edge = (i + 1 < W && label[c + 1] !== label[c]) || (j + 1 < H && label[c + W] !== label[c]);
      if (edge) rgb = [255, 255, 255];
      regions.forEach((r, k) => {});
      raw.set(rgb, row + 1 + i * 3);
    }
  }
  // mark anchors
  out.regions.forEach(r => { const i = Math.floor(r.x), j = Math.floor(r.y); for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) { const ii = i + d, jj = j + e; if (ii >= 0 && ii < W && jj >= 0 && jj < H) raw.set([255, 0, 0], jj * (W * 3 + 1) + 1 + ii * 3); } });
  const crcT = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0; }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(path.join(__dirname, 'preview-tiles.png'), png);
  // also crops
  const crop = (name, x0, y0, w, h) => {
    const r2 = Buffer.alloc((w * 3 + 1) * h);
    for (let j = 0; j < h; j++) { r2[j * (w * 3 + 1)] = 0; raw.copy(r2, j * (w * 3 + 1) + 1, (y0 + j) * (W * 3 + 1) + 1 + x0 * 3, (y0 + j) * (W * 3 + 1) + 1 + (x0 + w) * 3); }
    const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
    fs.writeFileSync(path.join(__dirname, name), Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(r2)), chunk('IEND', Buffer.alloc(0))]));
  };
  crop('crop-tiles-europe.png', Math.round(toX(-15)), Math.round(toY(72)), 70 * R, 40 * R);
}
