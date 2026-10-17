// Living 3D settlements: each owned land's town is drawn as a cluster of low-poly buildings with roofs in its
// people's colour. The cluster grows with the settlement (camp, village, town, city, metropolis) and its style follows
// the age: huts, then houses with a keep or a spire at the heart, then tower blocks, then skyscrapers. Windows glow
// at night. Buildings rise out of the ground as the camera comes down.
import * as THREE from 'three';
import { ll2v } from './world.js';

const ROOF = 0, WALL = 1, STONE = 2, GLASS = 3, WOOD = 4;
function put(geo, part, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)));
  g.computeVertexNormals();
  g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}
// a pitched roof: a triangular prism along x
function prism(w, h, d) {
  const x = w / 2, z = d / 2;
  const v = [-x, 0, -z, -x, 0, z, -x, h, 0, x, 0, z, x, 0, -z, x, h, 0, // gable ends
    -x, 0, z, x, 0, z, x, h, 0, -x, 0, z, x, h, 0, -x, h, 0, // south slope
    x, 0, -z, -x, 0, -z, -x, h, 0, x, 0, -z, -x, h, 0, x, h, 0]; // north slope
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
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
const KINDS = {
  hut: () => merge([put(new THREE.CylinderGeometry(0.2, 0.22, 0.18, 7), WOOD, { y: 0.09 }), put(new THREE.ConeGeometry(0.28, 0.32, 7), ROOF, { y: 0.34 })]),
  house: () => merge([put(new THREE.BoxGeometry(0.42, 0.28, 0.32), WALL, { y: 0.14 }), put(prism(0.48, 0.2, 0.38), ROOF, { y: 0.28 }), put(new THREE.BoxGeometry(0.06, 0.12, 0.06), STONE, { x: 0.12, y: 0.4, z: 0.06 })]),
  keep: () => merge([put(new THREE.BoxGeometry(0.42, 0.62, 0.42), STONE, { y: 0.31 }), ...[[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]].map(([a, b]) => put(new THREE.BoxGeometry(0.09, 0.1, 0.09), STONE, { x: a * 0.17, y: 0.67, z: b * 0.17 })), put(new THREE.CylinderGeometry(0.012, 0.012, 0.3, 4), WOOD, { y: 0.85 }), put(new THREE.BoxGeometry(0.01, 0.1, 0.16), ROOF, { y: 0.94, z: -0.08 })]),
  spire: () => merge([put(new THREE.BoxGeometry(0.3, 0.42, 0.46), WALL, { y: 0.21 }), put(prism(0.34, 0.16, 0.5), ROOF, { y: 0.42, ry: Math.PI / 2 }), put(new THREE.CylinderGeometry(0.08, 0.09, 0.5, 6), STONE, { y: 0.45, z: -0.2 }), put(new THREE.ConeGeometry(0.11, 0.38, 6), ROOF, { y: 0.89, z: -0.2 })]),
  tower: () => merge([put(new THREE.BoxGeometry(0.34, 1.0, 0.34), WALL, { y: 0.5 }), put(new THREE.BoxGeometry(0.36, 0.06, 0.36), ROOF, { y: 1.03 })]),
  sky: () => merge([put(new THREE.BoxGeometry(0.3, 1.9, 0.3), GLASS, { y: 0.95 }), put(new THREE.BoxGeometry(0.22, 0.3, 0.22), GLASS, { y: 2.05 }), put(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 4), STONE, { y: 2.35 }), put(new THREE.BoxGeometry(0.31, 0.05, 0.31), ROOF, { y: 1.9 })]),
};
const VS = `
attribute float part; uniform float grow;
varying vec3 vCol; varying vec3 vNw; varying vec3 vPw; varying vec3 vMp; varying float vPart; varying float vSeed;
void main() {
  vec3 p = position * vec3(1.0, grow, 1.0);
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vNw = normalize(mat3(m) * normal); vPw = wp.xyz; vMp = position; vPart = part;
  vSeed = fract(sin(dot(instanceMatrix[3].xyz, vec3(91.7, 47.3, 23.1))) * 4375.85);
  vec3 c = instanceColor;
  if (part > 0.5 && part < 1.5) c = mix(vec3(0.86, 0.8, 0.68), vec3(0.78, 0.68, 0.56), vSeed);
  else if (part > 1.5 && part < 2.5) c = vec3(0.6, 0.58, 0.55);
  else if (part > 2.5 && part < 3.5) c = mix(vec3(0.42, 0.52, 0.6), vec3(0.55, 0.62, 0.66), vSeed);
  else if (part > 3.5) c = vec3(0.45, 0.32, 0.2);
  vCol = c;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const FS = `
uniform vec3 sunDir;
varying vec3 vCol; varying vec3 vNw; varying vec3 vPw; varying vec3 vMp; varying float vPart; varying float vSeed;
void main() {
  vec3 n = normalize(vNw), up = normalize(vPw);
  float day = smoothstep(-0.12, 0.22, dot(up, sunDir));
  float l = max(dot(n, sunDir), 0.0);
  l = (floor(l * 3.0) + smoothstep(0.35, 0.65, fract(l * 3.0))) / 3.0;
  vec3 c = vCol * (0.38 + 0.2 * max(dot(n, up), 0.0) + 0.72 * l) * mix(0.3, 1.0, day); // at night the town's own glow keeps it from going black
  // windows: a grid on the walls, lit warm at night (some rooms dark)
  if ((vPart > 0.5 && vPart < 1.5) || (vPart > 2.5 && vPart < 3.5)) {
    float side = 1.0 - abs(n.y);
    vec2 g = vec2(fract((vMp.x + vMp.z) * 14.0), fract(vMp.y * (vPart > 2.5 ? 16.0 : 9.0)));
    float win = step(0.3, g.x) * step(g.x, 0.7) * step(0.35, g.y) * step(g.y, 0.75) * side * step(0.06, vMp.y);
    float on = step(0.25, fract(vSeed * 7.13 + floor((vMp.x + vMp.z) * 14.0) * 0.37 + floor(vMp.y * 9.0) * 0.61));
    c = mix(c, c * 0.7, win * day * 0.5);
    c += vec3(1.0, 0.76, 0.42) * win * on * (1.0 - day) * 1.7;
  }
  gl_FragColor = vec4(c, 1.0);
}`;

export class Towns {
  constructor(globe) {
    this.globe = globe;
    this.group = new THREE.Group(); globe.scene.add(this.group);
    this.uniforms = { sunDir: globe.u.sunDir, grow: { value: 0 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: VS, fragmentShader: FS });
    this.geos = {}; for (const k in KINDS) this.geos[k] = KINDS[k]();
    this.meshes = {}; this.sig = '';
  }
  // list: [{ i, lat, lon, lvl, age, color: [r, g, b], cap }]
  sync(list) {
    const sig = list.map(t => `${t.i}:${t.lvl}:${t.age > 5 ? (t.age > 7 ? 2 : 1) : t.age > 1 ? 0 : -1}:${t.cap ? 1 : 0}:${t.color.join(',')}`).join('|');
    if (sig === this.sig) return;
    this.sig = sig;
    const COUNT = [0, 3, 6, 10, 16, 26, 40];
    const out = {}; for (const k in KINDS) out[k] = [];
    const g = this.globe;
    for (const t of list) {
      const n = COUNT[t.lvl] || 0; if (!n) continue;
      let seed = t.i * 9301 + 49297; const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const spacing = 0.00085 * (t.age >= 6 ? 0.85 : 1);
      const up = new THREE.Vector3(...ll2v(t.lat, t.lon, 1)).normalize();
      const east = new THREE.Vector3(up.z, 0, -up.x).normalize(), north = new THREE.Vector3().crossVectors(up, east);
      for (let k = 0; k < n; k++) {
        const a = k * 2.39996 + rand() * 0.4, r = spacing * Math.sqrt(k + (k ? 0.6 : 0)) * (0.85 + rand() * 0.3);
        const inner = 1 - k / n; // 1 at the heart, 0 at the edge
        let kind;
        if (t.age <= 1) kind = k === 0 && t.cap ? 'house' : 'hut';
        else if (t.age <= 5) kind = k === 0 ? (t.cap ? 'keep' : t.lvl >= 3 ? 'spire' : 'house') : (t.lvl >= 4 && k < 4 ? (k % 2 ? 'keep' : 'spire') : 'house');
        else if (t.age <= 7) kind = k === 0 && t.cap ? 'keep' : inner > 0.6 && t.lvl >= 3 ? 'tower' : 'house';
        else kind = inner > 0.75 && t.lvl >= 4 ? 'sky' : inner > 0.4 && t.lvl >= 3 ? 'tower' : 'house';
        const size = 0.0011 * (kind === 'keep' ? 1.25 : kind === 'sky' ? 1.0 : 1) * (0.85 + rand() * 0.3);
        const tall = kind === 'tower' || kind === 'sky' ? 0.6 + inner * 0.8 + rand() * 0.4 : 1;
        const dir = east.clone().multiplyScalar(Math.cos(a) * r).addScaledVector(north, Math.sin(a) * r);
        const p = up.clone().add(dir).normalize();
        const lat = Math.asin(p.y) * 180 / Math.PI, lon = Math.atan2(-p.z, p.x) * 180 / Math.PI;
        out[kind].push(p.multiplyScalar(1 + g.heightAt(lat, lon) - size * 0.03), size, tall, a + Math.PI / 2 + (rand() - 0.5) * 0.5, t.color);
      }
    }
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Qy = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), S = new THREE.Vector3();
    for (const k in KINDS) {
      const a = out[k], n = a.length / 5;
      let m = this.meshes[k];
      if (!m || m.instanceMatrix.count < n) {
        if (m) { this.group.remove(m); m.dispose(); }
        const cap = Math.max(16, Math.ceil(n * 1.3));
        m = new THREE.InstancedMesh(this.geos[k], this.mat, cap);
        m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
        m.frustumCulled = false; this.meshes[k] = m; this.group.add(m);
      }
      for (let j = 0; j < n; j++) {
        const pos = a[j * 5], size = a[j * 5 + 1], tall = a[j * 5 + 2], yaw = a[j * 5 + 3], col = a[j * 5 + 4];
        Q.setFromUnitVectors(Y, pos.clone().normalize()); Qy.setFromAxisAngle(Y, yaw); Q.multiply(Qy);
        M.compose(pos, Q, S.set(size, size * tall, size)); m.setMatrixAt(j, M);
        m.instanceColor.setXYZ(j, col[0], col[1], col[2]);
      }
      m.count = n; m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true;
    }
  }
  // grow the towns in as the camera comes down
  update(camera) {
    const d = camera.position.length();
    const grow = Math.min(1, Math.max(0, (1.62 - d) / 0.16));
    this.uniforms.grow.value = grow;
    this.group.visible = grow > 0.01;
  }
}
