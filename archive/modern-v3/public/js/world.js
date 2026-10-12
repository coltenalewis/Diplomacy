// World geometry and graph: regions, real distances, pathfinding, texture-derived geography.

export const DEG = Math.PI / 180;

// Matches three.js SphereGeometry UV layout (u=0 at lon -180, north pole at +Y).
export function ll2v(lat, lon, r = 1) {
  const la = lat * DEG, lo = lon * DEG;
  return [r * Math.cos(la) * Math.cos(lo), r * Math.sin(la), -r * Math.cos(la) * Math.sin(lo)];
}
export function v2ll(x, y, z) {
  const r = Math.hypot(x, y, z);
  return [Math.asin(y / r) / DEG, Math.atan2(-z, x) / DEG];
}
export function haversine(lat1, lon1, lat2, lon2) {
  const a = Math.sin((lat2 - lat1) * DEG / 2) ** 2 + Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin((lon2 - lon1) * DEG / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}
// great-circle interpolation
export function slerpLL(a, b, t) {
  const A = ll2v(a[0], a[1]), B = ll2v(b[0], b[1]);
  const dot = Math.min(1, Math.max(-1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
  const om = Math.acos(dot);
  if (om < 1e-6) return a;
  const s = Math.sin(om), k1 = Math.sin((1 - t) * om) / s, k2 = Math.sin(t * om) / s;
  return v2ll(A[0] * k1 + B[0] * k2, A[1] * k1 + B[1] * k2, A[2] * k1 + B[2] * k2);
}

export class World {
  constructor(json) {
    this.json = json;
    this.W = json.W; this.H = json.H; this.R = json.R; this.lon0 = json.lon0; this.latN = json.latN;
    this.regions = json.regions.map((r, i) => {
      let lon = r.x / json.R + json.lon0; if (lon > 180) lon -= 360;
      return { id: r.id, name: r.name, type: r.type, coastal: r.coastal, adj: r.adj, i, lat: json.latN - r.y / json.R, lon, sea: r.type === 'sea' };
    });
    this.byId = {}; for (const r of this.regions) this.byId[r.id] = r;
    this.n = this.regions.length;
    // adjacency as indices + distances
    this.adj = this.regions.map(r => r.adj.map(id => this.byId[id].i));
    this.km = this.regions.map((r, i) => this.adj[i].map(j => Math.max(120, haversine(r.lat, r.lon, this.regions[j].lat, this.regions[j].lon))));
    this.decodeGrid();
  }
  decodeGrid() {
    const g = new Int16Array(this.W * this.H); let p = 0;
    const rle = this.json.grid;
    for (let k = 0; k < rle.length; k += 2) { g.fill(rle[k], p, p + rle[k + 1]); p += rle[k + 1]; }
    this.grid = g;
  }
  regionAtLL(lat, lon) {
    let x = (lon - this.lon0) * this.R; if (x < 0) x += 360 * this.R; if (x >= this.W) x -= 360 * this.R;
    const y = (this.latN - lat) * this.R;
    const i = Math.floor(x), j = Math.floor(y);
    if (j < 0 || j >= this.H || i < 0 || i >= this.W) return -1;
    return this.grid[j * this.W + i];
  }
  edgeKm(a, b) { const k = this.adj[a].indexOf(b); return k >= 0 ? this.km[a][k] : 1e9; }

  // Dijkstra. passable(j, i) -> bool; cost(i, j, km) -> number
  path(from, to, passable, cost = (i, j, km) => km) {
    if (from === to) return [from];
    const n = this.n, dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
    dist[from] = 0;
    // small n (376): simple O(n^2) is fine and fast
    for (;;) {
      let u = -1, best = Infinity;
      for (let k = 0; k < n; k++) if (!done[k] && dist[k] < best) { best = dist[k]; u = k; }
      if (u < 0 || u === to) break;
      done[u] = 1;
      const A = this.adj[u];
      for (let e = 0; e < A.length; e++) {
        const v = A[e];
        if (done[v] || !passable(v, u)) continue;
        const nd = best + cost(u, v, this.km[u][e]);
        if (nd < dist[v]) { dist[v] = nd; prev[v] = u; }
      }
    }
    if (!isFinite(dist[to])) return null;
    const out = []; for (let v = to; v >= 0; v = prev[v]) out.push(v);
    return out.reverse();
  }
  // all nodes within `hops` (unweighted), filtered
  within(from, hops, passable = () => true) {
    const seen = new Map([[from, 0]]); const q = [from];
    for (let h = 0; h < q.length; h++) {
      const u = q[h], d = seen.get(u); if (d >= hops) continue;
      for (const v of this.adj[u]) if (!seen.has(v) && passable(v)) { seen.set(v, d + 1); q.push(v); }
    }
    return seen;
  }
}

// Derive per-region geography from NASA imagery: night lights (urbanization) and day colors (vegetation/desert/ice).
export async function deriveGeography(world, dayUrl, nightUrl) {
  const load = url => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
  const [day, night] = await Promise.all([load(dayUrl), load(nightUrl)]);
  const TW = 2048, TH = 1024;
  const sample = im => { const c = document.createElement('canvas'); c.width = TW; c.height = TH; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, TW, TH); return x.getImageData(0, 0, TW, TH).data; };
  const D = sample(day), Nn = sample(night);
  const out = world.regions.map(() => ({ cells: 0, area: 0, lights: 0, veg: 0, desert: 0, ice: 0 }));
  for (let ty = 0; ty < TH; ty++) {
    const lat = 90 - (ty + 0.5) / TH * 180;
    if (lat > world.latN || lat < world.latN - world.H / world.R) continue;
    const cl = Math.cos(lat * DEG);
    for (let tx = 0; tx < TW; tx++) {
      const lon = -180 + (tx + 0.5) / TW * 360;
      const l = world.regionAtLL(lat, lon);
      if (l < 0 || world.regions[l].sea) continue;
      const p = (ty * TW + tx) * 4;
      const o = out[l];
      o.cells++; o.area += cl * 0.31;
      // city lights are warm and bright; moonlit desert/ice is dim and grey-blue
      const nr = Nn[p], ng = Nn[p + 1], nb = Nn[p + 2];
      const warm = nr - nb;
      if (warm > 12 && nr > 38) o.lights += ((nr + ng) / 510) * cl * 0.31;
      const r = D[p], g = D[p + 1], b = D[p + 2];
      const bright = (r + g + b) / 3;
      if (bright > 190 && Math.abs(r - b) < 30) o.ice += cl * 0.31;
      else if (g >= r * 0.92 && g > b * 1.05 && bright < 150) o.veg += cl * 0.31;
      else if (r > g * 1.05 && r > b * 1.25 && bright > 110) o.desert += cl * 0.31;
    }
  }
  for (const o of out) {
    o.fert = o.area ? Math.min(1, (o.veg / o.area) * 1.15) * (1 - Math.min(1, o.ice / Math.max(1, o.area))) : 0;
    o.arid = o.area ? o.desert / o.area : 0;
  }
  return out;
}
