// Stylized 3D scenery for the close-up map: forests, palms, cacti, boulders and mountain peaks, placed from the real
// biomes (satellite colour, elevation, latitude) and drawn as instanced low-poly models. Props are grouped in map
// cells so only the cells facing the camera are drawn; they grow out of the ground as the camera comes down.
import * as THREE from 'three';
import { ll2v } from './world.js';

const FOLIAGE = 0, WOOD = 1, ROCK = 2, SNOW = 3;
function put(geo, part, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  g.computeVertexNormals(); // flat facets: each face keeps its own normal after toNonIndexed
  g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}
function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), part = new Float32Array(n);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); part.set(g.attributes.part.array, o); o += g.attributes.position.count; }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('part', new THREE.BufferAttribute(part, 1));
  return out;
}
const SPECIES = {
  pine: () => merge([put(new THREE.CylinderGeometry(0.05, 0.07, 0.3, 5), WOOD, { y: 0.15 }), put(new THREE.ConeGeometry(0.34, 0.55, 6), FOLIAGE, { y: 0.5 }), put(new THREE.ConeGeometry(0.25, 0.45, 6), FOLIAGE, { y: 0.8 })]),
  broad: () => merge([put(new THREE.CylinderGeometry(0.06, 0.08, 0.4, 5), WOOD, { y: 0.2 }), put(new THREE.IcosahedronGeometry(0.36, 0), FOLIAGE, { y: 0.68 }), put(new THREE.IcosahedronGeometry(0.22, 0), FOLIAGE, { x: 0.2, y: 0.55, z: 0.1 })]),
  palm: () => merge([
    put(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 5), WOOD, { y: 0.25, rz: 0.08 }), put(new THREE.CylinderGeometry(0.03, 0.035, 0.4, 5), WOOD, { x: 0.035, y: 0.68, rz: 0.18 }),
    ...[0, 1, 2, 3, 4].map(k => put(new THREE.BoxGeometry(0.06, 0.02, 0.42), FOLIAGE, { x: 0.07 + Math.sin(k * 1.2566) * 0.16, y: 0.86, z: Math.cos(k * 1.2566) * 0.16, ry: k * 1.2566, rx: 0.45 }))]),
  cactus: () => merge([put(new THREE.CylinderGeometry(0.07, 0.08, 0.6, 6), FOLIAGE, { y: 0.3 }), put(new THREE.CylinderGeometry(0.045, 0.05, 0.26, 6), FOLIAGE, { x: 0.13, y: 0.42 }), put(new THREE.CylinderGeometry(0.045, 0.05, 0.08, 6), FOLIAGE, { x: 0.08, y: 0.32, rz: Math.PI / 2 })]),
  rock: () => merge([put(new THREE.DodecahedronGeometry(0.3, 0), ROCK, { y: 0.1, sy: 0.6 }), put(new THREE.DodecahedronGeometry(0.17, 0), ROCK, { x: 0.28, y: 0.05, z: 0.1, sy: 0.7 })]),
  peak: () => merge([put(new THREE.ConeGeometry(0.85, 1.0, 5), ROCK, { y: 0.5 }), put(new THREE.ConeGeometry(0.3, 0.36, 5), SNOW, { y: 0.83 }), put(new THREE.ConeGeometry(0.5, 0.6, 5), ROCK, { x: 0.55, y: 0.3, z: 0.2, ry: 0.6 })]),
};
// world height of each kind (the scenery is exaggerated so it reads from orbit)
const SIZE = { pine: 0.0016, broad: 0.0015, palm: 0.0016, cactus: 0.001, rock: 0.001, peak: 0.0024 };

const VS = `
attribute float part; uniform float grow, season, deciduous;
varying vec3 vCol; varying vec3 vNw; varying vec3 vPw;
void main() {
  vec3 p = position * grow;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vNw = normalize(mat3(m) * normal); vPw = wp.xyz;
  vec3 c = instanceColor;
  // broadleaf forests turn in autumn and go bare in winter, in step with the globe's seasons
  if (deciduous > 0.5 && part < 0.5) {
    float lat = asin(clamp(normalize(instanceMatrix[3].xyz).y, -1.0, 1.0)) * 57.2958;
    float ph = fract(season + (lat < 0.0 ? 0.5 : 0.0)), temperate = smoothstep(28.0, 38.0, abs(lat)) * (1.0 - smoothstep(64.0, 70.0, abs(lat)));
    float autumn = exp(-pow((ph - 0.8) / 0.07, 2.0)) * temperate;
    float winter = (1.0 - smoothstep(0.17, 0.25, fract(ph + 0.08))) * temperate; // early December to early March
    c = mix(c, vec3(0.86, 0.45, 0.13) * (0.8 + 0.4 * instanceColor.g), autumn * 0.85);
    c = mix(c, vec3(0.42, 0.34, 0.27), winter * 0.8);
  }
  if (part > 0.5 && part < 1.5) c = vec3(0.4, 0.27, 0.16);
  else if (part > 1.5 && part < 2.5) c = vec3(0.56, 0.52, 0.48) * (0.8 + 0.4 * instanceColor.r);
  else if (part > 2.5) c = vec3(0.95, 0.96, 1.0);
  vCol = c;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FS = `
uniform vec3 sunDir; varying vec3 vCol; varying vec3 vNw; varying vec3 vPw;
void main() {
  vec3 n = normalize(vNw), up = normalize(vPw);
  float day = smoothstep(-0.15, 0.25, dot(up, sunDir));
  float l = max(dot(n, sunDir), 0.0);
  l = (floor(l * 3.0) + smoothstep(0.35, 0.65, fract(l * 3.0))) / 3.0; // toon bands
  vec3 c = vCol * (0.36 + 0.2 * max(dot(n, up), 0.0) + 0.75 * l) * mix(0.14, 1.0, day);
  gl_FragColor = vec4(c, 1.0);
}`;

// classify the land under each point of a Fibonacci lattice and decide what grows there
export function buildProps(globe, dayImg, waterImg) {
  const W = 2048, H = 1024;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(dayImg, 0, 0, W, H); const day = ctx.getImageData(0, 0, W, H).data;
  ctx.drawImage(waterImg, 0, 0, W, H); const wet = ctx.getImageData(0, 0, W, H).data;
  const px = (lat, lon) => (Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / 180 * H))) * W + Math.min(W - 1, Math.max(0, Math.floor((lon + 180) / 360 * W)))) * 4;
  let seed = 12345; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const CELL = 12, cells = new Map(); // `${ci}|${cj}` -> { species -> [lat, lon, scale, yaw, r, g, b] }
  const add = (sp, lat, lon, k, col) => {
    const key = Math.floor((lat + 90) / CELL) + '|' + Math.floor((lon + 180) / CELL);
    let c = cells.get(key); if (!c) { c = {}; cells.set(key, c); }
    (c[sp] ||= []).push(lat, lon, k, rand() * 6.283, col[0], col[1], col[2]);
  };
  const N = 750000, GA = Math.PI * (3 - Math.sqrt(5)), spread = 0.26; // jitter inside each lattice cell, degrees
  for (let i = 0; i < N; i++) {
    const y = 1 - (i + 0.5) / N * 2, lat0 = Math.asin(y) * 180 / Math.PI, lon0 = ((i * GA * 180 / Math.PI) % 360) - 180;
    const p = px(lat0, lon0);
    if (wet[p] > 110) continue;
    const r = day[p] / 255, g = day[p + 1] / 255, b = day[p + 2] / 255, lum = 0.3 * r + 0.59 * g + 0.11 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b), alat = Math.abs(lat0);
    const elev = globe._topo ? globe._topo.d[(Math.min(globe._topo.h - 1, Math.floor((90 - lat0) / 180 * globe._topo.h)) * globe._topo.w + Math.min(globe._topo.w - 1, Math.floor((lon0 + 180) / 360 * globe._topo.w))) * 4] / 255 : 0;
    const snow = lum > 0.62 && sat < 0.08 && (elev > 0.3 || alat > 58), desert = lum > 0.3 && r - g > 0.03, forest = lum < 0.2 && g - r > -0.03, grass = !forest && g - r > -0.02;
    const jit = () => [lat0 + (rand() - 0.5) * spread, lon0 + (rand() - 0.5) * spread / Math.max(0.2, Math.cos(lat0 * Math.PI / 180))];
    // mountains: rocky peaks where the land rises, snow-capped up high
    if (elev > 0.4 && rand() < Math.min(0.55, (elev - 0.4) * 2.4)) { const [la, lo] = jit(); add('peak', la, lo, 0.75 + elev * 0.8 + rand() * 0.3, [0.6 + rand() * 0.4, 0, 0]); }
    if (snow || elev > 0.6) continue;
    const tree = () => {
      const u = rand();
      if (alat < 18) return u < 0.3 ? 'palm' : 'broad';
      if (alat > 52 || elev > 0.32) return 'pine';
      if (alat > 38) return u < 0.45 ? 'pine' : 'broad';
      return u < 0.2 ? 'pine' : 'broad';
    };
    const green = sp => sp === 'pine' ? [0.12 + rand() * 0.05, 0.3 + rand() * 0.08, 0.17 + rand() * 0.05] : sp === 'palm' ? [0.2 + rand() * 0.08, 0.5 + rand() * 0.1, 0.15] : [0.18 + rand() * 0.1, 0.42 + rand() * 0.12, 0.12 + rand() * 0.06];
    if (forest) { const n = rand() < 0.85 ? 6 : 2; for (let k = 0; k < n; k++) { const sp = tree(), [la, lo] = jit(); add(sp, la, lo, 0.75 + rand() * 0.5, green(sp)); } }
    else if (grass) { if (rand() < 0.4) { const sp = tree(), [la, lo] = jit(); add(sp, la, lo, 0.7 + rand() * 0.4, green(sp)); } if (rand() < 0.03) { const [la, lo] = jit(); add('rock', la, lo, 0.7 + rand() * 0.6, [rand(), 0, 0]); } }
    else if (desert) { const u = rand(); if (u < 0.035 && alat < 38) { const [la, lo] = jit(); add('cactus', la, lo, 0.8 + rand() * 0.4, [0.25 + rand() * 0.05, 0.48 + rand() * 0.08, 0.22]); } else if (u < 0.08) { const [la, lo] = jit(); add('rock', la, lo, 0.7 + rand() * 0.8, [rand(), 0, 0]); } }
    else if (rand() < 0.06) { const sp = rand() < 0.5 ? 'rock' : tree(), [la, lo] = jit(); add(sp, la, lo, 0.7 + rand() * 0.4, sp === 'rock' ? [rand(), 0, 0] : green(sp)); }
  }
  // build one instanced mesh per (cell, species)
  const uniforms = { sunDir: globe.u.sunDir, season: globe.u.season, grow: { value: 0 } };
  const mats = { plain: new THREE.ShaderMaterial({ uniforms: { ...uniforms, deciduous: { value: 0 } }, vertexShader: VS, fragmentShader: FS }), decid: new THREE.ShaderMaterial({ uniforms: { ...uniforms, deciduous: { value: 1 } }, vertexShader: VS, fragmentShader: FS }) };
  const geos = {}; for (const k in SPECIES) geos[k] = SPECIES[k]();
  const group = new THREE.Group(), list = [];
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), V = new THREE.Vector3(), S = new THREE.Vector3(), Qy = new THREE.Quaternion();
  let total = 0;
  for (const [key, c] of cells) {
    const [ci, cj] = key.split('|').map(Number);
    const cLat = ci * CELL - 90 + CELL / 2, cLon = cj * CELL - 180 + CELL / 2;
    const cellGroup = new THREE.Group(); cellGroup.userData.center = new THREE.Vector3(...ll2v(cLat, cLon, 1));
    for (const sp in c) {
      const a = c[sp], n = a.length / 7;
      for (let k = n - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); for (let f = 0; f < 7; f++) { const t = a[k * 7 + f]; a[k * 7 + f] = a[j * 7 + f]; a[j * 7 + f] = t; } } // random order: thinning by count stays even
      const mesh = new THREE.InstancedMesh(geos[sp], sp === 'broad' ? mats.decid : mats.plain, n);
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
      for (let k = 0; k < n; k++) {
        const lat = a[k * 7], lon = a[k * 7 + 1], sc = a[k * 7 + 2] * SIZE[sp], yaw = a[k * 7 + 3];
        const up = V.set(...ll2v(lat, lon, 1));
        Q.setFromUnitVectors(Y, up); Qy.setFromAxisAngle(Y, yaw); Q.multiply(Qy);
        const r = 1 + globe.heightAt(lat, lon) - sc * 0.04;
        M.compose(up.clone().multiplyScalar(r), Q, S.set(sc, sc, sc));
        mesh.setMatrixAt(k, M);
        mesh.instanceColor.setXYZ(k, a[k * 7 + 4], a[k * 7 + 5], a[k * 7 + 6]);
      }
      mesh.computeBoundingSphere(); mesh.userData.n = n;
      cellGroup.add(mesh); total += n;
    }
    group.add(cellGroup); list.push(cellGroup);
  }
  globe.scene.add(group);
  return { group, cells: list, uniforms, total, mats };
}

// per frame: grow the scenery in as the camera descends, draw only cells on the near side of the globe
export function updateProps(P, camera) {
  if (!P || !P.group.visible) return;
  const d = camera.position.length();
  // grow in from 1.42 out; draw a thinning share of each forest farther out so the cost stays flat
  const grow = Math.min(1, Math.max(0, (1.42 - d) / 0.12)), share = Math.min(1, Math.max(0.15, (1.42 - d) / 0.3));
  P.uniforms.grow.value = grow;
  const show = grow > 0.01;
  if (show && P.share !== share) { P.share = share; for (const c of P.cells) for (const m of c.children) m.count = Math.max(1, Math.ceil(m.userData.n * share)); }
  const dir = camera.position.clone().normalize();
  const reach = Math.acos(Math.min(1, 1 / d)) + 0.16; // horizon plus a cell's half-width
  const cosReach = Math.cos(Math.min(Math.PI, reach));
  for (const c of P.cells) c.visible = show && c.userData.center.dot(dir) > cosReach;
}
