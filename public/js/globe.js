// 3D Earth: relief-shaded day side, simulated city lights, clouds, painted territories and borders, bloom.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ll2v, v2ll, slerpLL } from './world.js';
import { RIVERS } from './resources.js';

// All shaders work in display (sRGB) space; colour management is off so hex colours stay as authored.
THREE.ColorManagement.enabled = false;

const EARTH_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main() {
  vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vP = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0);
}`;
const EARTH_FS = `
uniform sampler2D dayTex, nightTex, waterTex, topoTex, cloudTex, idxTex, palTex, scarTex, priorTex;
uniform vec3 sunDir; uniform float time; uniform float overlay; uniform float cloudShift; uniform float cloudAmt;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// sine-free hash: stays well distributed for the large cell coordinates used by settlement lights
float hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
vec4 regionPal(vec2 uv, float row) {
  vec4 ix = texture2D(idxTex, uv);
  float id = floor(ix.r * 255.0 + 0.5) + floor(ix.g * 255.0 + 0.5) * 256.0;
  if (id < 0.5) return vec4(0.0);
  return texture2D(palTex, vec2((id - 0.5) / 4096.0, row));
}
void main() {
  vec3 n = normalize(vN);
  float water = texture2D(waterTex, vUv).r;
  // relief: perturb the normal with the elevation map
  vec2 px = vec2(1.0 / 2048.0, 1.0 / 1024.0);
  float hL = texture2D(topoTex, vUv - vec2(px.x, 0.0)).r, hR = texture2D(topoTex, vUv + vec2(px.x, 0.0)).r;
  float hD = texture2D(topoTex, vUv - vec2(0.0, px.y)).r, hU = texture2D(topoTex, vUv + vec2(0.0, px.y)).r;
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-5));
  vec3 north = cross(n, east);
  vec3 nr = normalize(n - (east * (hR - hL) + north * (hU - hD)) * 3.2 * (1.0 - water));
  float ndl = dot(n, sunDir);
  float ndlR = dot(nr, sunDir);
  float dayMix = smoothstep(-0.14, 0.2, ndl);
  // day colour, relief light, cloud shadows
  vec3 day = texture2D(dayTex, vUv).rgb;
  day = mix(day, day * vec3(0.78, 0.92, 1.08), water * 0.45);
  float relief = 0.55 + 0.75 * max(ndlR, 0.0) / max(0.25, max(ndl, 0.0) + 0.25);
  vec3 dayCol = day * (0.12 + 0.8 * pow(max(ndl, 0.0), 0.7)) * mix(1.0, relief, 0.75 * (1.0 - water));
  dayCol = dayCol / (1.0 + dayCol * 0.35); // soft tone-map
  vec4 cs = texture2D(cloudTex, vec2(vUv.x + cloudShift - 0.0015, vUv.y));
  float shadow = cs.a * max(cs.r, cs.g);
  dayCol *= 1.0 - shadow * 0.32 * cloudAmt;
  // night: city lights driven by the simulation
  vec4 pal = regionPal(vUv, 0.25), pal2 = regionPal(vUv, 0.75);
  float lightMul = pal2.r * 2.0;
  float elec = clamp(lightMul, 0.0, 1.0);
  vec3 night = texture2D(nightTex, vUv).rgb;
  float lum = dot(night, vec3(0.299, 0.587, 0.114));
  float cityMask = smoothstep(0.09, 0.38, lum);
  vec3 lights = vec3(1.0, 0.78, 0.5) * pow(cityMask, 1.25) * 1.2 * lightMul;
  // where people cluster: city cores, river banks and coasts. Bigger settlements spread further out from the core.
  float prior = texture2D(priorTex, vUv).r;
  float reach = pal2.b * 1.12;
  float dens = clamp((prior - (1.0 - reach)) / 0.32, 0.0, 1.0);
  vec2 g = vUv * vec2(6144.0, 3072.0);
  vec2 cid = floor(g), f = fract(g);
  float h1 = hash2(cid), h2 = hash2(cid + 17.31), h3 = hash2(cid + 43.7);
  float present = h3 < dens * 0.8 ? 1.0 : 0.0;
  float d = length(f - (vec2(h1, h2) * 0.7 + 0.15));
  float pt = present * (1.0 - smoothstep(0.04, 0.34, d)) * (0.45 + 0.9 * h1);
  // far away the points merge into their average glow instead of shimmering
  float far = smoothstep(0.5, 1.6, fwidth(g.x));
  float settle = mix(pt, dens * 0.8 * 0.2, far);
  float haze = dens * dens * pal2.b * 0.35;
  vec3 sc = mix(vec3(1.0, 0.52, 0.2), vec3(1.0, 0.8, 0.52), elec);
  float flick = mix(0.82 + 0.18 * sin(time * 1.9 + h1 * 6.28), 1.0, elec);
  lights += sc * (settle * 1.7 + haze) * flick;
  vec3 moon = day * vec3(0.18, 0.24, 0.36) * 0.22;
  vec3 col = mix(lights * (1.0 - shadow * 0.5 * cloudAmt) + moon, dayCol, dayMix);
  // nuclear scars
  float scar = texture2D(scarTex, vUv).r;
  col = mix(col, vec3(0.16, 0.1, 0.06) * (0.3 + 0.7 * dayMix), scar * 0.75);
  col += vec3(1.0, 0.35, 0.05) * scar * (1.0 - dayMix) * (0.25 + 0.1 * sin(time * 3.0 + vUv.x * 900.0));
  // painted territories: soft interior, saturated inner border band
  if (pal.a > 0.0 && overlay > 0.0) {
    vec2 tx = vec2(1.0 / 1440.0, 1.0 / 720.0);
    float edge = 0.0;
    for (int k = 0; k < 8; k++) {
      float a = float(k) * 0.7853982;
      vec2 d = vec2(cos(a), sin(a));
      vec4 q1 = regionPal(vUv + d * tx * 1.6, 0.25);
      vec4 q2 = regionPal(vUv + d * tx * 3.6, 0.25);
      edge += (distance(q1.rgb, pal.rgb) > 0.02 ? 1.0 : 0.0) + (distance(q2.rgb, pal.rgb) > 0.02 ? 0.5 : 0.0);
    }
    edge = clamp(edge / 6.0, 0.0, 1.0);
    float a = pal.a * overlay * (0.55 + 1.1 * edge);
    vec3 tint = pal.rgb * (0.5 + 0.55 * dayMix);
    col = mix(col, tint, clamp(a, 0.0, 0.85) * (0.6 + 0.4 * dayMix));
  }
  // selection highlight & contested stripes
  col += pal2.g * vec3(1.0, 0.86, 0.5) * (0.28 + 0.07 * sin(time * 3.0));
  float stripes = step(0.5, fract((vUv.x * 2.0 + vUv.y) * 700.0));
  col = mix(col, vec3(1.0, 0.25, 0.22), pal2.a * stripes * (0.3 + 0.2 * sin(time * 4.0)));
  // ocean glint, fresnel, twilight band
  vec3 v = normalize(cameraPosition - vP);
  vec3 h = normalize(sunDir + v);
  col += vec3(1.0, 0.42, 0.12) * exp(-pow(ndl * 9.0, 2.0)) * 0.07;
  gl_FragColor = vec4(col, 1.0);
}`;
const CLOUD_FS = `
uniform sampler2D cloudTex; uniform vec3 sunDir; uniform float cloudShift; uniform float cloudAmt;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main() {
  vec4 c = texture2D(cloudTex, vec2(vUv.x + cloudShift, vUv.y));
  float d = c.a * max(c.r, c.g);
  float ndl = dot(normalize(vN), sunDir);
  float lit = smoothstep(-0.18, 0.3, ndl);
  vec3 col = mix(vec3(0.05, 0.07, 0.12), vec3(0.86), lit);
  col = mix(col, vec3(1.0, 0.62, 0.38), exp(-pow(ndl * 7.0, 2.0)) * 0.55);
  gl_FragColor = vec4(col, d * cloudAmt * (0.15 + 0.6 * lit));
}`;
const ATM_FS = `uniform vec3 sunDir; varying vec3 vN; varying vec3 vP;
void main(){ vec3 v = normalize(cameraPosition - vP); float rim = 1.0 - max(dot(v, vN), 0.0);
  float ndl = dot(vN, sunDir);
  float lit = smoothstep(-0.35, 0.45, ndl);
  vec3 col = mix(vec3(0.18, 0.45, 1.0), vec3(1.0, 0.55, 0.3), exp(-pow(ndl * 4.0, 2.0)) * 0.6);
  float i = pow(rim, 2.4) * 1.25;
  gl_FragColor = vec4(col * i * lit, i * lit); }`;
const HALO_FS = `uniform vec3 sunDir; varying vec3 vN; varying vec3 vP;
void main(){ vec3 v = normalize(cameraPosition - vP); float d = dot(v, vN); float i = pow(max(0.0, 0.64 + d), 4.0);
  float ndl = dot(vN, sunDir);
  float lit = 0.15 + 0.85 * smoothstep(-0.45, 0.5, ndl);
  vec3 col = mix(vec3(0.3, 0.6, 1.0), vec3(1.0, 0.6, 0.35), exp(-pow(ndl * 3.0, 2.0)) * 0.5);
  gl_FragColor = vec4(col * i * lit, i * lit * 0.85); }`;
const FX_FS = `uniform vec3 color; uniform float age; uniform float life; varying vec2 vUv;
void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float k = age / life;
  float ring = smoothstep(0.08, 0.0, abs(r - k)) * (1.0 - k);
  float core = smoothstep(0.5 * (1.0 - k), 0.0, r) * (1.0 - k) * 1.4;
  float a = ring + core; gl_FragColor = vec4(color * (1.0 + core), a); }`;
const FX_VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export class Globe {
  constructor(container, world, json) {
    this.container = container; this.world = world; this.json = json;
    const W = container.clientWidth, H = container.clientHeight;
    const renderer = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setSize(W, H);
    renderer.setClearColor(0x01040a);
    container.appendChild(renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(36, W / H, 0.01, 200);
    this.camera.position.set(0, 0.8, 3.0);
    const c = this.controls = new OrbitControls(this.camera, renderer.domElement);
    c.enableDamping = true; c.dampingFactor = 0.07; c.enablePan = false;
    c.minDistance = 1.1; c.maxDistance = 6; c.zoomSpeed = 0.7;
    c.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: null };
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.35, 0.45, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.clock = new THREE.Clock();
    this.routes = new Map();
    this.lineMats = [];
    this.build();
    window.addEventListener('resize', () => this.resize());
  }

  async load() {
    const L = new THREE.TextureLoader();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const get = url => new Promise((res, rej) => L.load(url, t => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = maxAniso; t.wrapS = THREE.RepeatWrapping; res(t); }, undefined, rej));
    const [day, night, water, topo, sky] = await Promise.all(['earth-blue-marble.jpg', 'earth-night.jpg', 'earth-water.png', 'earth-topology.png', 'night-sky.png'].map(f => get('textures/' + f)));
    const u = this.earth.material.uniforms;
    u.dayTex.value = day; u.nightTex.value = night; u.waterTex.value = water; u.topoTex.value = topo;
    this._nightImg = night.image; this._waterImg = water.image;
    try { u.priorTex.value = this.buildPrior(night.image, water.image); } catch (e) { console.warn('settlement map', e); }
    this.sky.material.map = sky; this.sky.material.needsUpdate = true;
    get('textures/clouds.png').then(cl => { u.cloudTex.value = cl; this.clouds.material.uniforms.cloudTex.value = cl; this.clouds.visible = true; }).catch(() => {});
  }

  // A map of where people naturally gather, used to place settlement lights: blurred real night-light cores,
  // each region's main city, great rivers and coastlines. 0 = empty land, 1 = the heart of a city.
  buildPrior(nightImg, waterImg) {
    const W = 2048, H = 1024;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    const read = () => ctx.getImageData(0, 0, W, H).data;
    const X = lon => (lon + 180) / 360 * W, Y = lat => (90 - lat) / 180 * H;
    ctx.filter = 'blur(2px)'; ctx.drawImage(nightImg, 0, 0, W, H); const night = read();
    ctx.filter = 'blur(3px)'; ctx.drawImage(waterImg, 0, 0, W, H); const waterB = read();
    ctx.filter = 'none'; ctx.drawImage(waterImg, 0, 0, W, H); const water = read();
    // rivers
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.filter = 'blur(3px)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const r of RIVERS) { ctx.beginPath(); r.forEach(([la, lo], k) => (k ? ctx.lineTo(X(lo), Y(la)) : ctx.moveTo(X(lo), Y(la)))); ctx.stroke(); }
    const river = read();
    // cities: each region's namesake city, or its centre
    ctx.filter = 'none'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'lighter';
    for (const R of this.world.regions) {
      if (R.sea) continue;
      const [la, lo] = R.city || [R.lat, R.lon], peak = R.city ? 1 : 0.75, rad = R.city ? 7 : 5;
      const gr = ctx.createRadialGradient(X(lo), Y(la), 0, X(lo), Y(la), rad);
      gr.addColorStop(0, `rgba(255,255,255,${peak})`); gr.addColorStop(0.35, `rgba(255,255,255,${peak * 0.55})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gr; ctx.fillRect(X(lo) - rad, Y(la) - rad, rad * 2, rad * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    const city = read();
    const data = new Uint8Array(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      const wet = water[p] / 255;
      if (wet > 0.5) continue;
      const lum = (night[p] * 0.3 + night[p + 1] * 0.59 + night[p + 2] * 0.11) / 255;
      const lights = Math.min(1, Math.max(0, (lum - 0.04) / 0.32));
      const coast = Math.min(1, (waterB[p] / 255) * 2.2);
      const v = Math.max(lights * 0.95, Math.min(1, city[p] / 255), (river[p] / 255) * 0.62, coast * 0.42);
      const q = ((H - 1 - y) * W + x) * 4; // texture rows run from the south
      data[q] = Math.round(Math.min(1, v) * 255); data[q + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = THREE.RepeatWrapping; tex.needsUpdate = true;
    return tex;
  }

  build() {
    const scene = this.scene;
    const idxTex = this.makeIdxTex();
    this.pal = new Uint8Array(4096 * 2 * 4);
    const palTex = this.palTex = new THREE.DataTexture(this.pal, 4096, 2, THREE.RGBAFormat);
    palTex.magFilter = palTex.minFilter = THREE.NearestFilter; palTex.needsUpdate = true;
    // nuclear scar layer (painted on detonation)
    this.scar = new Uint8Array(720 * 360 * 4);
    this.scarTex = new THREE.DataTexture(this.scar, 720, 360, THREE.RGBAFormat);
    this.scarTex.magFilter = this.scarTex.minFilter = THREE.LinearFilter; this.scarTex.needsUpdate = true;
    const blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); blank.needsUpdate = true;

    const sunDir = { value: new THREE.Vector3(1, 0, 0) };
    const cloudShift = { value: 0 }, cloudAmt = { value: 0.5 };
    this.u = { sunDir, cloudShift, cloudAmt };
    const mat = new THREE.ShaderMaterial({
      vertexShader: EARTH_VS, fragmentShader: EARTH_FS,
      uniforms: { dayTex: { value: blank }, nightTex: { value: blank }, waterTex: { value: blank }, topoTex: { value: blank }, cloudTex: { value: blank }, priorTex: { value: blank },
        idxTex: { value: idxTex }, palTex: { value: palTex }, scarTex: { value: this.scarTex }, sunDir, cloudShift, cloudAmt, time: { value: 0 }, overlay: { value: 1 } },
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 256, 160), mat);
    scene.add(this.earth);
    this.clouds = new THREE.Mesh(new THREE.SphereGeometry(1.006, 160, 100), new THREE.ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: CLOUD_FS,
      uniforms: { cloudTex: { value: blank }, sunDir, cloudShift, cloudAmt }, transparent: true, depthWrite: false }));
    this.clouds.visible = false; this.clouds.renderOrder = 3;
    scene.add(this.clouds);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(1.0, 128, 80), new THREE.ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: ATM_FS, uniforms: { sunDir }, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    atm.scale.setScalar(1.012); atm.renderOrder = 4; scene.add(atm);
    const halo = new THREE.Mesh(new THREE.SphereGeometry(1.0, 128, 80), new THREE.ShaderMaterial({ vertexShader: EARTH_VS, fragmentShader: HALO_FS, uniforms: { sunDir }, side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.scale.setScalar(1.17); scene.add(halo);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(90, 48, 32), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: 0x3a4658 }));
    scene.add(this.sky);
    const g = [];
    for (let lat = -75; lat <= 75; lat += 15) for (let lon = -180; lon < 180; lon += 3) g.push(...ll2v(lat, lon, 1.0015), ...ll2v(lat, lon + 3, 1.0015));
    for (let lon = -180; lon < 180; lon += 15) for (let lat = -84; lat < 84; lat += 3) g.push(...ll2v(lat, lon, 1.0015), ...ll2v(lat + 3, lon, 1.0015));
    this.graticule = this.thinLines(g, 0x9fd8ff, 0.05); scene.add(this.graticule);
    this.buildMapLines();
    this.nationGroup = new THREE.Group(); scene.add(this.nationGroup);
    this.routeGroup = new THREE.Group(); scene.add(this.routeGroup);
    this.pathGroup = new THREE.Group(); scene.add(this.pathGroup);
    this.fxGroup = new THREE.Group(); scene.add(this.fxGroup);
  }

  // region index texture: which region each pixel of the globe belongs to
  makeIdxTex() {
    const w = this.world, TW = 1440, TH = 720;
    const idx = new Uint8Array(TW * TH * 4);
    for (let k = 0; k < TH; k++) {
      const lat = -90 + (k + 0.5) * 180 / TH;
      for (let i = 0; i < TW; i++) {
        const lon = -180 + (i + 0.5) * 360 / TW;
        const l = lat > w.latN || lat < w.latN - w.H / w.R ? -1 : w.regionAtLL(lat, lon);
        const v = l + 1; const p = (k * TW + i) * 4;
        idx[p] = v & 255; idx[p + 1] = v >> 8; idx[p + 3] = 255;
      }
    }
    const idxTex = new THREE.DataTexture(idx, TW, TH, THREE.RGBAFormat);
    idxTex.magFilter = idxTex.minFilter = THREE.NearestFilter; idxTex.wrapS = THREE.RepeatWrapping; idxTex.needsUpdate = true;
    return idxTex;
  }
  // coasts, region borders, province borders and sea-zone borders
  buildMapLines() {
    const scene = this.scene;
    for (const k of ['coast', 'regionBorders', 'provinceBorders', 'seaBorders']) if (this[k]) { scene.remove(this[k]); this[k].geometry.dispose(); this[k].material.dispose(); }
    this.coast = this.fatLines(this.pathToSegs(this.json.landPath, 1.0012), null, 0xbfefff, 1.1, 0.42);
    scene.add(this.coast);
    const rb = [], pb = [], sb = [];
    const R = this.world.regions;
    for (const ch of this.json.landChains) { this.chainSegs(ch, rb, 1.0013); const a = R[ch[0]], b = R[ch[1]]; if (a && b && a.parent && b.parent && a.parent !== b.parent) this.chainSegs(ch, pb, 1.00135); }
    for (const ch of this.json.seaChains) this.chainSegs(ch, sb, 1.0011);
    this.regionBorders = this.thinLines(rb, 0xf4ead2, 0.18); scene.add(this.regionBorders);
    this.provinceBorders = this.thinLines(pb, 0xffe7b0, 0.3); scene.add(this.provinceBorders);
    this.seaBorders = this.thinLines(sb, 0x8fd3ff, 0.07); scene.add(this.seaBorders);
  }
  // swap in a different map (used to load games saved on an older map)
  setWorld(world, json) {
    this.world = world; this.json = json;
    const u = this.earth.material.uniforms;
    u.idxTex.value.dispose(); u.idxTex.value = this.makeIdxTex();
    this.pal.fill(0); this.palTex.needsUpdate = true;
    this.buildMapLines();
    for (const ch of [...this.nationGroup.children]) this.dropLine(this.nationGroup, ch);
    if (this._nightImg) { try { u.priorTex.value = this.buildPrior(this._nightImg, this._waterImg); } catch (e) { console.warn(e); } }
  }
  thinLines(arr, color, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
    return new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false }));
  }
  fatLines(pos, colors, color, width, opacity) {
    const geo = new LineSegmentsGeometry();
    geo.setPositions(pos);
    if (colors) geo.setColors(colors);
    const mat = new LineMaterial({ color: colors ? 0xffffff : color, vertexColors: !!colors, linewidth: width, transparent: true, opacity, depthWrite: false });
    mat.resolution.set(this.container.clientWidth, this.container.clientHeight);
    this.lineMats.push(mat);
    const line = new LineSegments2(geo, mat);
    line.renderOrder = 2;
    return line;
  }
  dropLine(group, line) { group.remove(line); line.geometry.dispose(); this.lineMats = this.lineMats.filter(m => m !== line.material); line.material.dispose(); }
  gridLL(x, y) { let lon = x / this.world.R + this.world.lon0; if (lon > 180) lon -= 360; return [this.world.latN - y / this.world.R, lon]; }
  chainSegs(ch, out, r) {
    for (let k = 2; k + 3 < ch.length; k += 2) {
      const [la1, lo1] = this.gridLL(ch[k], ch[k + 1]), [la2, lo2] = this.gridLL(ch[k + 2], ch[k + 3]);
      if (Math.abs(lo1 - lo2) > 90) continue;
      out.push(...ll2v(la1, lo1, r), ...ll2v(la2, lo2, r));
    }
  }
  pathToSegs(d, r) {
    const out = [];
    for (const part of d.split('M')) {
      if (!part) continue;
      const pts = part.replace('Z', '').split('L').map(p => p.trim().split(/\s+/).map(Number));
      for (let k = 0; k + 1 < pts.length; k++) {
        const [la1, lo1] = this.gridLL(pts[k][0], pts[k][1]), [la2, lo2] = this.gridLL(pts[k + 1][0], pts[k + 1][1]);
        if (Math.abs(lo1 - lo2) > 90) continue;
        out.push(...ll2v(la1, lo1, r), ...ll2v(la2, lo2, r));
      }
    }
    return out;
  }

  // Painted national borders: each side gets a band in its owner's colour, plus a bright core line.
  updateNationBorders(owners, colorOf) {
    for (const ch of [...this.nationGroup.children]) this.dropLine(this.nationGroup, ch);
    const band = [], bandCol = [], core = [];
    const OFF = 0.42, R = 1.0017;
    const hex = c => { const v = parseInt((c || '#888888').slice(1), 16); return [(v >> 16) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255]; };
    for (const ch of this.json.landChains) {
      const a = owners[ch[0]], b = owners[ch[1]];
      if (a === b) continue;
      const ca = a ? hex(colorOf(a)) : null, cb = b ? hex(colorOf(b)) : null;
      for (let k = 2; k + 3 < ch.length; k += 2) {
        const x1 = ch[k], y1 = ch[k + 1], x2 = ch[k + 2], y2 = ch[k + 3];
        let dx = x2 - x1, dy = y2 - y1; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        const nx = dy, ny = -dx;
        const p1 = this.gridLL(x1, y1), p2 = this.gridLL(x2, y2);
        if (Math.abs(p1[1] - p2[1]) > 90) continue;
        if (a && b) core.push(...ll2v(p1[0], p1[1], R + 0.0002), ...ll2v(p2[0], p2[1], R + 0.0002));
        for (const [sg, c] of [[1, ca], [-1, cb]]) {
          if (!c) continue;
          const q1 = this.gridLL(x1 + nx * OFF * sg, y1 + ny * OFF * sg), q2 = this.gridLL(x2 + nx * OFF * sg, y2 + ny * OFF * sg);
          band.push(...ll2v(q1[0], q1[1], R), ...ll2v(q2[0], q2[1], R));
          bandCol.push(...c, ...c);
        }
      }
    }
    if (band.length) this.nationGroup.add(this.fatLines(band, bandCol, 0xffffff, 2.4, 0.62));
    if (core.length) this.nationGroup.add(this.fatLines(core, null, 0xe8e2d0, 1, 0.5));
  }

  setRegion(i, o) {
    const p = this.pal, k = i * 4, k2 = (4096 + i) * 4;
    if (o.color) { const c = parseInt(o.color.slice(1), 16); p[k] = c >> 16; p[k + 1] = (c >> 8) & 255; p[k + 2] = c & 255; }
    p[k + 3] = Math.round((o.alpha ?? 0) * 255);
    p[k2] = Math.round(Math.min(2, o.light ?? 1) / 2 * 255);
    p[k2 + 1] = Math.round((o.highlight ?? 0) * 255);
    p[k2 + 2] = Math.round(Math.min(1, o.glow ?? 0) * 255);
    p[k2 + 3] = Math.round((o.contested ?? 0) * 255);
  }
  commitPalette() { this.palTex.needsUpdate = true; }
  setOverlay(v) { this.earth.material.uniforms.overlay.value = v; }
  setClouds(v) { this.u.cloudAmt.value = v; }

  // paint a scorched crater (nuclear strike) into the scar layer
  scorch(lat, lon, radiusDeg) {
    const W = 720, H = 360;
    const cx = (lon + 180) / 360 * W, cy = (lat + 90) / 180 * H;
    const rx = radiusDeg / 360 * W / Math.max(0.25, Math.cos(lat * Math.PI / 180)), ry = radiusDeg / 180 * H;
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const dd = Math.hypot((x - cx) / rx, (y - cy) / ry); if (dd > 1) continue;
      const xx = ((x % W) + W) % W, yy = Math.min(H - 1, Math.max(0, y));
      const p = (yy * W + xx) * 4;
      this.scar[p] = Math.max(this.scar[p], Math.round(255 * (1 - dd * dd)));
    }
    this.scarTex.needsUpdate = true;
  }
  setScars(list) { this.scar.fill(0); for (const s of list) this.scorch(s.lat, s.lon, s.r); }

  // continuous game time (fractional hours) so the terminator glides smoothly
  // with the day/night cycle off, the sun sits just above the viewer so whatever you look at is lit
  setAlwaysDay(v) { this.alwaysDay = !!v; }
  setSunHours(startMs, hours) {
    const d = new Date(startMs + hours * 3600e3);
    const doy = (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / 864e5;
    const decl = 23.44 * Math.sin(2 * Math.PI * (doy - 81) / 365);
    const utc = (((startMs / 3600e3 + hours) % 24) + 24) % 24;
    if (!this.alwaysDay) this.u.sunDir.value.set(...ll2v(decl, (12 - utc) * 15)).normalize();
    this.u.cloudShift.value = (hours * 0.00035) % 1;
  }

  // ---------------------------------------------------------------- trade routes
  syncRoutes(routes) {
    const seen = new Set();
    for (const r of routes) {
      const key = r.id + ':' + r.blockaded + ':' + r.sig + ':' + r.mine;
      seen.add(key);
      if (this.routes.has(key)) continue;
      const pts = [];
      for (let k = 0; k + 1 < r.latlon.length; k++) {
        const a = r.latlon[k], b = r.latlon[k + 1];
        const A = ll2v(a[0], a[1]), B = ll2v(b[0], b[1]);
        const ang = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2]));
        const steps = Math.max(6, Math.round(ang * 60));
        for (let s = k ? 1 : 0; s <= steps; s++) {
          const ll = slerpLL(a, b, s / steps);
          pts.push(...ll2v(ll[0], ll[1], 1.004 + Math.min(0.05, ang * 0.06) * Math.sin(Math.PI * s / steps)));
        }
      }
      const geo = new LineGeometry(); geo.setPositions(pts);
      const color = r.blockaded ? 0xff4a4a : r.kind === 'food' ? 0x7dffb0 : 0xffc35a;
      const mat = new LineMaterial({ color, linewidth: r.mine ? 2.4 : 1.4, transparent: true, opacity: r.mine ? 0.95 : 0.5, dashed: !r.blockaded, dashSize: 0.012, gapSize: 0.01, depthWrite: false });
      mat.resolution.set(this.container.clientWidth, this.container.clientHeight);
      this.lineMats.push(mat);
      const line = new Line2(geo, mat); line.computeLineDistances(); line.renderOrder = 5;
      this.routeGroup.add(line);
      this.routes.set(key, line);
    }
    for (const [k, line] of this.routes) if (!seen.has(k)) { this.dropLine(this.routeGroup, line); this.routes.delete(k); }
  }
  setRoutesVisible(v) { this.routeGroup.visible = v; }

  // planned movement paths for selected units (arrays of [lat,lon])
  setPaths(paths) {
    for (const ch of [...this.pathGroup.children]) this.dropLine(this.pathGroup, ch);
    for (const p of paths) {
      if (p.length < 2) continue;
      const pts = [];
      for (let k = 0; k + 1 < p.length; k++) for (let s = k ? 1 : 0; s <= 10; s++) { const ll = slerpLL(p[k], p[k + 1], s / 10); pts.push(...ll2v(ll[0], ll[1], 1.0035)); }
      const geo = new LineGeometry(); geo.setPositions(pts);
      const mat = new LineMaterial({ color: 0xffe08a, linewidth: 2, transparent: true, opacity: 0.85, dashed: true, dashSize: 0.008, gapSize: 0.006, depthWrite: false });
      mat.resolution.set(this.container.clientWidth, this.container.clientHeight);
      this.lineMats.push(mat);
      const line = new Line2(geo, mat); line.computeLineDistances(); line.renderOrder = 6;
      this.pathGroup.add(line);
    }
  }

  // ---------------------------------------------------------------- effects
  burst(lat, lon, color = 0xff6a3d, size = 0.02, life = 1.4) {
    const v = ll2v(lat, lon, 1.004);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShaderMaterial({ vertexShader: FX_VS, fragmentShader: FX_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { color: { value: new THREE.Color(color) }, age: { value: 0 }, life: { value: life } } }));
    m.position.set(...v); m.lookAt(0, 0, 0); m.userData = { born: this.clock.elapsedTime, life };
    m.renderOrder = 7;
    this.fxGroup.add(m);
  }
  flash(lat, lon, color) { this.burst(lat, lon, color, 0.03, 1.6); }
  nuke(lat, lon) {
    this.burst(lat, lon, 0xffffff, 0.06, 2.5);
    this.burst(lat, lon, 0xffa040, 0.16, 4.5);
    this.burst(lat, lon, 0xff4020, 0.3, 7);
  }
  // tracer arc between two points (artillery, air strikes, missiles)
  tracer(a, b, color = 0xffd27a, height = 0.02, life = 1.2) {
    const pts = [];
    for (let s = 0; s <= 24; s++) { const ll = slerpLL(a, b, s / 24); pts.push(...ll2v(ll[0], ll[1], 1.003 + height * Math.sin(Math.PI * s / 24))); }
    const geo = new LineGeometry(); geo.setPositions(pts);
    const mat = new LineMaterial({ color, linewidth: 1.6, transparent: true, opacity: 0.9, dashed: true, dashSize: 0.004, gapSize: 0.5, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.resolution.set(this.container.clientWidth, this.container.clientHeight);
    this.lineMats.push(mat);
    const line = new Line2(geo, mat); line.computeLineDistances();
    line.userData = { born: this.clock.elapsedTime, life, tracer: true, len: line.geometry.attributes.instanceDistanceEnd?.array?.at(-1) || 0.1 };
    mat.dashSize = line.userData.len * 0.18; mat.gapSize = line.userData.len * 2;
    line.renderOrder = 7;
    this.fxGroup.add(line);
  }

  // ---------------------------------------------------------------- camera & picking
  resize() {
    const W = this.container.clientWidth, H = this.container.clientHeight;
    this.camera.aspect = W / H; this.camera.updateProjectionMatrix();
    this.renderer.setSize(W, H); this.composer.setSize(W, H);
    for (const m of this.lineMats) m.resolution.set(W, H);
  }
  distance() { return this.camera.position.length(); }
  pickLL(clientX, clientY) {
    const b = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
    const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    const bq = o.dot(d), cq = o.lengthSq() - 1, disc = bq * bq - cq;
    if (disc < 0) return null;
    const p = o.clone().addScaledVector(d, -bq - Math.sqrt(disc));
    return v2ll(p.x, p.y, p.z);
  }
  beginProject() {
    this.camera.updateMatrixWorld();
    this._camDir = this.camera.position.clone().normalize();
    this._camLen = this.camera.position.length();
    this._vp = new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this._W = this.container.clientWidth; this._H = this.container.clientHeight;
  }
  project(lat, lon, r = 1.0) {
    if (!this._vp) this.beginProject();
    const [x, y, z] = ll2v(lat, lon, r);
    const facing = (x * this._camDir.x + y * this._camDir.y + z * this._camDir.z) / r;
    const visible = facing > 1 / this._camLen - 0.02;
    const e = this._vp.elements;
    const w = e[3] * x + e[7] * y + e[11] * z + e[15];
    const px = (e[0] * x + e[4] * y + e[8] * z + e[12]) / w, py = (e[1] * x + e[5] * y + e[9] * z + e[13]) / w;
    return { x: (px + 1) / 2 * this._W, y: (1 - py) / 2 * this._H, visible, facing };
  }
  flyTo(lat, lon, dist) {
    const from = this.camera.position.clone();
    const d0 = from.length(), d1 = dist ?? d0;
    const target = new THREE.Vector3(...ll2v(lat, lon, 1)).normalize();
    const start = from.clone().normalize();
    const t0 = performance.now(), dur = 1200;
    this.anim = now => {
      const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const v = start.clone().lerp(target, e).normalize();
      this.camera.position.copy(v.multiplyScalar(d0 + (d1 - d0) * e));
      if (k >= 1) this.anim = null;
    };
  }

  // ---------------------------------------------------------------- unit dots (GPU points), trails, range rings
  initUnits(max = 8000) {
    const geo = new THREE.BufferGeometry();
    this.uPos = new Float32Array(max * 3); this.uCol = new Float32Array(max * 3); this.uSize = new Float32Array(max); this.uFlag = new Float32Array(max);
    geo.setAttribute('position', new THREE.BufferAttribute(this.uPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.uCol, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.uSize, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('flag', new THREE.BufferAttribute(this.uFlag, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, scale: { value: 1 } },
      vertexShader: `attribute vec3 color; attribute float size; attribute float flag; varying vec3 vC; varying float vF; varying float vFace;
        uniform float scale;
        void main(){ vC = color; vF = flag; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vec3 n = normalize(position); vec3 toCam = normalize(cameraPosition - position); vFace = dot(n, toCam);
          gl_PointSize = clamp(size * scale / -mv.z, 2.0, size * 1.6); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `varying vec3 vC; varying float vF; varying float vFace; uniform float time;
        void main(){ if (vFace < 0.05) discard;
          vec2 p = gl_PointCoord * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
          float sel = mod(vF, 2.0); float mine = mod(floor(vF / 2.0), 2.0); float air = mod(floor(vF / 4.0), 2.0); float sea = mod(floor(vF / 8.0), 2.0); float fight = mod(floor(vF / 16.0), 2.0);
          float core = smoothstep(0.62, 0.5, r);
          float rim = smoothstep(0.78, 0.68, r) - core;
          vec3 col = vC * (0.75 + 0.5 * (1.0 - r));
          if (sea > 0.5) { core = smoothstep(0.62, 0.5, r) * (1.0 - smoothstep(0.3, 0.22, r) * 0.65); }
          float a = core + rim * 0.9;
          vec3 c = mix(vec3(0.02, 0.03, 0.05), col, core / max(a, 0.001));
          float halo = smoothstep(1.0, 0.7, r) * (1.0 - smoothstep(0.75, 0.62, r));
          if (sel > 0.5) { c = mix(c, vec3(1.0), halo); a = max(a, halo); }
          else if (fight > 0.5) { float pul = 0.5 + 0.5 * sin(time * 9.0); c = mix(c, vec3(1.0, 0.25, 0.15), halo * pul); a = max(a, halo * pul); }
          else if (mine > 0.5) { a = max(a, halo * 0.35); c = mix(c, col, halo * 0.35); }
          if (air > 0.5) c += vec3(0.25);
          gl_FragColor = vec4(c, a); }`,
    });
    this.unitPts = new THREE.Points(geo, mat); this.unitPts.renderOrder = 8; this.unitPts.frustumCulled = false;
    this.scene.add(this.unitPts);
    // trails (aircraft & ships)
    const tg = new THREE.BufferGeometry();
    this.trPos = new Float32Array(max * 6 * 3); this.trCol = new Float32Array(max * 6 * 3);
    tg.setAttribute('position', new THREE.BufferAttribute(this.trPos, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setAttribute('color', new THREE.BufferAttribute(this.trCol, 3).setUsage(THREE.DynamicDrawUsage));
    tg.setDrawRange(0, 0);
    this.trails = new THREE.LineSegments(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.trails.frustumCulled = false; this.trails.renderOrder = 7;
    this.scene.add(this.trails);
    this.ringGroup = new THREE.Group(); this.scene.add(this.ringGroup);
  }
  // units: [{lat, lon, alt, color:[r,g,b], size, flag}]
  setUnits(list) {
    const n = Math.min(list.length, this.uSize.length);
    for (let k = 0; k < n; k++) {
      const u = list[k]; const v = ll2v(u.lat, u.lon, 1.003 + (u.alt || 0));
      this.uPos[k * 3] = v[0]; this.uPos[k * 3 + 1] = v[1]; this.uPos[k * 3 + 2] = v[2];
      this.uCol[k * 3] = u.color[0]; this.uCol[k * 3 + 1] = u.color[1]; this.uCol[k * 3 + 2] = u.color[2];
      this.uSize[k] = u.size; this.uFlag[k] = u.flag;
    }
    const g = this.unitPts.geometry;
    g.setDrawRange(0, n);
    for (const a of ['position', 'color', 'size', 'flag']) g.attributes[a].needsUpdate = true;
  }
  // trails: [{pts:[[lat,lon,alt],...], color:[r,g,b]}]
  setTrails(list) {
    let k = 0; const max = this.trPos.length / 6;
    for (const t of list) {
      for (let i = 0; i + 1 < t.pts.length && k < max; i++, k++) {
        const a = ll2v(t.pts[i][0], t.pts[i][1], 1.003 + (t.pts[i][2] || 0)), b = ll2v(t.pts[i + 1][0], t.pts[i + 1][1], 1.003 + (t.pts[i + 1][2] || 0));
        const fa = (i + 1) / t.pts.length * 0.8, fb = (i + 2) / t.pts.length * 0.8;
        this.trPos.set(a, k * 6); this.trPos.set(b, k * 6 + 3);
        this.trCol.set([t.color[0] * fa, t.color[1] * fa, t.color[2] * fa], k * 6); this.trCol.set([t.color[0] * fb, t.color[1] * fb, t.color[2] * fb], k * 6 + 3);
      }
    }
    const g = this.trails.geometry; g.setDrawRange(0, k * 2);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
  }
  // weapon / operating range rings: [{lat, lon, km, color}]
  setRings(list) {
    for (const ch of [...this.ringGroup.children]) this.dropLine(this.ringGroup, ch);
    for (const r of list.slice(0, 40)) {
      const pts = []; const ang = r.km / 6371; const c = ll2v(r.lat, r.lon); const C = new THREE.Vector3(...c);
      const up = Math.abs(C.y) > 0.95 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
      const e1 = new THREE.Vector3().crossVectors(up, C).normalize(), e2 = new THREE.Vector3().crossVectors(C, e1).normalize();
      for (let k = 0; k <= 96; k++) {
        const t = k / 96 * Math.PI * 2;
        const v = C.clone().multiplyScalar(Math.cos(ang)).addScaledVector(e1, Math.sin(ang) * Math.cos(t)).addScaledVector(e2, Math.sin(ang) * Math.sin(t)).multiplyScalar(1.0025);
        pts.push(v.x, v.y, v.z);
      }
      const geo = new LineGeometry(); geo.setPositions(pts);
      const mat = new LineMaterial({ color: r.color || 0xffe08a, linewidth: 1.4, transparent: true, opacity: 0.55, dashed: true, dashSize: 0.01, gapSize: 0.008, depthWrite: false });
      mat.resolution.set(this.container.clientWidth, this.container.clientHeight); this.lineMats.push(mat);
      const line = new Line2(geo, mat); line.computeLineDistances(); line.renderOrder = 6;
      this.ringGroup.add(line);
    }
  }
  setPixelScale() { if (this.unitPts) this.unitPts.material.uniforms.scale.value = this.container.clientHeight * 0.0022 * this.renderer.getPixelRatio(); }

  // update camera (call before projecting markers each frame)
  tick() {
    const dt = Math.min(0.1, this.clock.getDelta());
    const t = this.clock.elapsedTime;
    if (this.anim) this.anim(performance.now());
    const d = this.distance();
    this.controls.rotateSpeed = Math.min(1, (d - 1) * 0.5 + 0.04);
    this.controls.update();
    if (this.alwaysDay) this.u.sunDir.value.copy(this.camera.position).normalize().add(new THREE.Vector3(0, 0.25, 0)).normalize();
    this.earth.material.uniforms.time.value = t;
    if (this.unitPts) { this.unitPts.material.uniforms.time.value = t; this.setPixelScale(); }
    for (const line of this.routeGroup.children) if (line.material.dashed) line.material.dashOffset -= 0.05 * dt;
    for (const line of this.pathGroup.children) line.material.dashOffset -= 0.02 * dt;
    for (const m of [...this.fxGroup.children]) {
      const age = t - m.userData.born;
      if (age > m.userData.life) { this.dropLine(this.fxGroup, m); continue; }
      if (m.userData.tracer) { m.material.dashOffset = -age / m.userData.life * m.userData.len * 1.1; m.material.opacity = 0.95 * (1 - age / m.userData.life) + 0.05; }
      else m.material.uniforms.age.value = age;
    }
    const near = Math.min(1, Math.max(0, (2.6 - d) / 1.2));
    this.regionBorders.material.opacity = 0.04 + 0.16 * near;
    this.provinceBorders.material.opacity = 0.1 + 0.3 * near;
    this.seaBorders.material.opacity = 0.02 + 0.07 * near;
    this.graticule.material.opacity = 0.03 + 0.03 * (1 - near);
    this.bloom.strength = 0.26 + 0.14 * (1 - near);
    this._vp = null;
    this.beginProject();
  }
  render() { this.composer.render(); }
}
