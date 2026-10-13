// 3D Earth: raised relief, animated surf and sun glint on the seas, relief-shaded day side, simulated city lights, clouds, painted territories and borders, bloom.
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
import { buildModels, MODEL_KEYS } from './unitmodels.js';

// All shaders work in display (sRGB) space; colour management is off so hex colours stay as authored.
THREE.ColorManagement.enabled = false;

const EARTH_VS = `
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main() {
  vUv = uv; vN = normalize(mat3(modelMatrix) * normal); vP = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vP, 1.0);
}`;
// The ground itself: land is lifted along the normal by the elevation map (exaggerated so mountains read from orbit).
// Depth is written as if the vertex still sat on the smooth sphere, so borders, units and routes floating just above
// radius 1 are never swallowed by the mountains they cross.
const TERRAIN_VS = `
uniform sampler2D topoTex; uniform float relief;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
void main() {
  vUv = uv; vN = normalize(mat3(modelMatrix) * normal);
  vec3 base = (modelMatrix * vec4(position, 1.0)).xyz;
  vP = base + vN * pow(texture2D(topoTex, uv).r, 0.85) * relief;
  vec4 clip = projectionMatrix * viewMatrix * vec4(vP, 1.0), smooth0 = projectionMatrix * viewMatrix * vec4(base, 1.0);
  clip.z = smooth0.z / smooth0.w * clip.w;
  gl_Position = clip;
}`;
const EARTH_FS = `
uniform sampler2D dayTex, nightTex, waterTex, topoTex, coastTex, cloudTex, idxTex, palTex, scarTex, priorTex;
uniform vec3 sunDir; uniform float time; uniform float overlay; uniform float cloudShift; uniform float cloudAmt; uniform float season;
varying vec2 vUv; varying vec3 vN; varying vec3 vP;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
// sine-free hash: stays well distributed for the large cell coordinates used by settlement lights
float hash2(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash2(i), hash2(i + vec2(1.0, 0.0)), f.x), mix(hash2(i + vec2(0.0, 1.0)), hash2(i + vec2(1.0, 1.0)), f.x), f.y); }
// rolling swell for the sun glint: two noise layers drifting against each other
float swell(vec2 p, float t) { return vnoise(p + vec2(t * 0.6, t * 0.35)) + 0.5 * vnoise(p * 2.3 - vec2(t * 0.5, -t * 0.4)); }
// The region at a point, voted from the four nearest grid cells by bilinear weight. Boundaries become smooth curves
// at every zoom level instead of the grid's square steps.
uniform vec2 idxSize;
float idAt(vec2 t) { vec4 ix = texture2D(idxTex, t); return floor(ix.r * 255.0 + 0.5) + floor(ix.g * 255.0 + 0.5) * 256.0; }
float regionId(vec2 uv) {
  vec2 p = uv * idxSize - 0.5, b = floor(p), f = p - b;
  vec2 t0 = (b + 0.5) / idxSize, dx = vec2(1.0 / idxSize.x, 0.0), dy = vec2(0.0, 1.0 / idxSize.y);
  float a = idAt(t0), c = idAt(t0 + dx), d = idAt(t0 + dy), e = idAt(t0 + dx + dy);
  if (a == c && a == d && a == e) return a;
  float wa = (1.0 - f.x) * (1.0 - f.y), wc = f.x * (1.0 - f.y), wd = (1.0 - f.x) * f.y, we = f.x * f.y;
  float sa = wa + (c == a ? wc : 0.0) + (d == a ? wd : 0.0) + (e == a ? we : 0.0);
  float sc = wc + (a == c ? wa : 0.0) + (d == c ? wd : 0.0) + (e == c ? we : 0.0);
  float sd = wd + (a == d ? wa : 0.0) + (c == d ? wc : 0.0) + (e == d ? we : 0.0);
  float se = we + (a == e ? wa : 0.0) + (c == e ? wc : 0.0) + (d == e ? wd : 0.0);
  float id = a, best = sa;
  if (sc > best) { best = sc; id = c; }
  if (sd > best) { best = sd; id = d; }
  if (se > best) { id = e; }
  return id;
}
vec4 palOf(float id, float row) { if (id < 0.5) return vec4(0.0); return texture2D(palTex, vec2((id - 0.5) / 4096.0, row)); }
vec4 regionPal(vec2 uv, float row) { return palOf(regionId(uv), row); }
// cheap nearest-cell lookup for the border-band probes
vec4 regionPalN(vec2 uv, float row) { return palOf(idAt(uv), row); }
void main() {
  vec3 n = normalize(vN);
  float water = texture2D(waterTex, vUv).r;
  // relief: perturb the normal with the elevation map
  vec2 px = vec2(1.0 / 2048.0, 1.0 / 1024.0);
  float hL = texture2D(topoTex, vUv - vec2(px.x, 0.0)).r, hR = texture2D(topoTex, vUv + vec2(px.x, 0.0)).r;
  float hD = texture2D(topoTex, vUv - vec2(0.0, px.y)).r, hU = texture2D(topoTex, vUv + vec2(0.0, px.y)).r;
  vec3 east = normalize(cross(vec3(0.0, 1.0, 0.0), n) + vec3(1e-5));
  vec3 north = cross(n, east);
  vec3 nr = normalize(n - (east * (hR - hL) + north * (hU - hD)) * 4.2 * (1.0 - water));
  float ndl = dot(n, sunDir);
  float ndlR = dot(nr, sunDir);
  float dayMix = smoothstep(-0.14, 0.2, ndl);
  // day colour, relief light, cloud shadows
  vec3 day = texture2D(dayTex, vUv).rgb;
  day = mix(day, day * vec3(0.78, 0.92, 1.08), water * 0.45);
  // seasons: the snowline sweeps toward the equator in winter (lower on high ground), forests turn in autumn,
  // pack ice spreads over the polar seas. season = 0 on 1 January.
  float lat = (vUv.y - 0.5) * 180.0, alat = abs(lat);
  float winterN = cos(6.2831853 * (season - 0.97));
  float wint = lat >= 0.0 ? winterN : -winterN; // -1 high summer .. 1 deep winter
  float w01 = 0.5 + 0.5 * wint;
  float elev = texture2D(topoTex, vUv).r;
  float sn = vnoise(vUv * vec2(900.0, 450.0)) * 0.6 + vnoise(vUv * vec2(3600.0, 1800.0)) * 0.4;
  float snowLine = mix(71.0, 42.0, w01 * w01) - elev * 48.0 * (0.4 + 0.6 * w01);
  float snow = smoothstep(snowLine - 2.0, snowLine + 6.0, alat + (sn - 0.5) * 9.0) * (1.0 - smoothstep(0.3, 0.6, water));
  float veg = smoothstep(0.0, 0.05, day.g - max(day.r, day.b) * 0.92) * (1.0 - water);
  float phase = fract(season + (lat < 0.0 ? 0.5 : 0.0));
  float autumn = exp(-pow((phase - 0.8) / 0.075, 2.0)) * smoothstep(28.0, 40.0, alat) * (1.0 - smoothstep(64.0, 72.0, alat));
  float lum0 = dot(day, vec3(0.3, 0.59, 0.11));
  day = mix(day, vec3(lum0 * 1.55, lum0 * 0.95, lum0 * 0.35) + vec3(0.03, 0.0, 0.0) * sn, veg * autumn * 0.75);
  float dormant = max(0.0, wint) * smoothstep(25.0, 45.0, alat) * (1.0 - snow);
  day = mix(day, vec3(lum0 * 1.05, lum0 * 0.98, lum0 * 0.82), veg * dormant * 0.45);
  day = mix(day, day * vec3(0.92, 1.08, 0.9), veg * max(0.0, -wint) * smoothstep(25.0, 45.0, alat) * 0.5);
  day = mix(day, vec3(0.9, 0.93, 0.98) * (0.86 + 0.14 * sn), snow * 0.92);
  float iceLine = mix(80.0, (lat >= 0.0 ? 63.0 : 59.0), w01 * w01);
  float ice = smoothstep(iceLine - 1.5, iceLine + 2.5, alat + (sn - 0.5) * 5.0) * smoothstep(0.3, 0.6, water);
  day = mix(day, vec3(0.82, 0.88, 0.95) * (0.9 + 0.1 * sn), ice * 0.9);
  float relief = 0.55 + 0.75 * max(ndlR, 0.0) / max(0.25, max(ndl, 0.0) + 0.25);
  vec3 dayCol = day * (0.12 + 0.8 * pow(max(ndl, 0.0), 0.7)) * mix(1.0, relief, 0.75 * (1.0 - water));
  dayCol = dayCol / (1.0 + dayCol * 0.35); // soft tone-map
  vec4 cs = texture2D(cloudTex, vec2(vUv.x + cloudShift - 0.0015, vUv.y));
  float shadow = cs.a * max(cs.r, cs.g);
  dayCol *= 1.0 - shadow * 0.32 * cloudAmt;
  // night: city lights driven by the simulation
  float rid = regionId(vUv);
  vec4 pal = palOf(rid, 0.25), pal2 = palOf(rid, 0.75);
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
  // seas: shallows near the shore, surf rolling in to the coast, foam on the beaches, glittering sun glint
  vec3 v = normalize(cameraPosition - vP);
  vec3 h = normalize(sunDir + v);
  float cv = texture2D(coastTex, vUv).r;
  float sea = smoothstep(0.004, 0.03, cv) * (1.0 - ice);
  if (sea > 0.0) {
    float cd = clamp((cv * 255.0 - 8.0) / 247.0, 0.0, 1.0); // 0 at the shore, 1 well offshore
    vec2 wq = vUv * vec2(2048.0, 1024.0);
    float lit = 0.12 + 0.88 * dayMix;
    col = mix(col, col * vec3(0.72, 1.08, 1.1) + vec3(0.0, 0.025, 0.03) * dayMix, pow(1.0 - cd, 3.0) * sea * 0.55);
    // crests travel toward the shore (phase constant where cd shrinks over time), broken up along the coast
    float wph = cd * 52.0 + time * 1.3 + (vnoise(wq * 0.06) - 0.5) * 9.0;
    float crest = pow(0.5 + 0.5 * sin(wph), 10.0);
    float dense = 1.0 - smoothstep(0.4, 1.4, fwidth(wph)); // fade before the bands get too fine to draw
    float patchy = smoothstep(0.35, 0.8, vnoise(wq * 0.25 + vec2(time * 0.07, 0.0)) * 0.7 + vnoise(wq * 0.9 - time * 0.1) * 0.3 + 0.12);
    float waves = crest * (1.0 - smoothstep(0.05, 0.4, cd)) * dense * patchy;
    // foam: a thin breaking line that surges up the beach as each wave lands
    float surge = 0.5 + 0.5 * sin(time * 1.3 + (vnoise(wq * 0.06) - 0.5) * 9.0);
    float foam = (1.0 - smoothstep(0.0, 0.02 + 0.025 * surge, cd)) * (0.5 + 0.5 * vnoise(wq * 1.5 + time * 0.3));
    foam *= 1.0 - smoothstep(0.03, 0.12, fwidth(cd));
    col += vec3(0.86, 0.95, 1.0) * (waves * 0.16 + foam * 0.4) * sea * lit * (1.0 - shadow * 0.4 * cloudAmt);
    // sun glint off a rippling surface
    vec2 gq = wq * 3.5;
    float g0 = swell(gq, time), gx = swell(gq + vec2(0.4, 0.0), time) - g0, gy = swell(gq + vec2(0.0, 0.4), time) - g0;
    // sparkle only while ripple cells are a few pixels across: too fine aliases, too coarse shows the noise grid
    float ripple = (1.0 - smoothstep(0.4, 1.5, fwidth(gq.x))) * smoothstep(0.03, 0.12, fwidth(gq.x));
    vec3 nw = normalize(n - (east * gx + north * gy) * 0.12 * ripple);
    float spec = pow(max(dot(nw, h), 0.0), 400.0) * 0.55 * ripple + pow(max(dot(n, h), 0.0), 90.0) * 0.12;
    col += vec3(1.0, 0.93, 0.8) * spec * sea * dayMix * (1.0 - shadow * 0.7 * cloudAmt);
  }
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
      vec4 q2 = regionPalN(vUv + d * tx * 3.6, 0.25);
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
// 3D unit models: team colour, metal, cloth, waving flags, base plate and wood, lit by the sun with sky fill so
// they stay readable at night.
const UNIT_VS = `
attribute float part; uniform float time;
varying vec3 vCol; varying vec3 vNw; varying vec3 vPw;
void main() {
  vec3 p = position;
  vec3 seed = instanceMatrix[3].xyz;
  if (part > 2.5 && part < 3.5) p.x += sin(time * 7.0 + p.z * 16.0 + p.y * 5.0 + dot(seed, vec3(97.0, 61.0, 43.0))) * 0.035;
  mat4 m = modelMatrix * instanceMatrix;
  vec4 wp = m * vec4(p, 1.0);
  vNw = normalize(mat3(m) * normal); vPw = wp.xyz;
  vec3 c = instanceColor;
  if (part > 0.5 && part < 1.5) c = vec3(0.2, 0.21, 0.23);
  else if (part > 1.5 && part < 2.5) c = vec3(0.86, 0.82, 0.74);
  else if (part > 3.5 && part < 4.5) c = instanceColor * 0.42;
  else if (part > 4.5) c = vec3(0.42, 0.29, 0.17);
  vCol = c;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;
const UNIT_FS = `
uniform vec3 sunDir; varying vec3 vCol; varying vec3 vNw; varying vec3 vPw;
void main() {
  vec3 n = normalize(vNw), up = normalize(vPw);
  float day = smoothstep(-0.15, 0.25, dot(up, sunDir));
  float l = max(dot(n, sunDir), 0.0);
  vec3 v = normalize(cameraPosition - vPw);
  float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float amb = 0.4 + 0.22 * max(dot(n, up), 0.0);
  vec3 c = vCol * (amb + 0.85 * l * day) + (vCol * 0.35 + 0.08) * rim;
  gl_FragColor = vec4(c, 1.0);
}`;
const RING_VS = `varying vec3 vC; void main(){ vC = instanceColor; gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4(position, 1.0); }`;
const RING_FS = `varying vec3 vC; void main(){ gl_FragColor = vec4(vC, 1.0); }`;
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
    c.minDistance = 1.045; c.maxDistance = 6; c.zoomSpeed = 0.7;
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
    if (window.ResizeObserver) new ResizeObserver(() => this.resize()).observe(this.container);
  }

  async load() {
    const L = new THREE.TextureLoader();
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    const get = url => new Promise((res, rej) => L.load(url, t => { t.colorSpace = THREE.NoColorSpace; t.anisotropy = maxAniso; t.wrapS = THREE.RepeatWrapping; res(t); }, undefined, rej));
    const big = this.renderer.capabilities.maxTextureSize >= 8192;
    const files = [big ? 'earth-day-8k.jpg' : 'earth-blue-marble.jpg', big ? 'earth-night-8k.jpg' : 'earth-night.jpg', 'earth-water.png', 'earth-topology.png', 'night-sky.png'];
    const [day, night, water, topo, sky] = await Promise.all(files.map((f, k) => get('textures/' + f).catch(e => k < 2 && big ? get('textures/' + ['earth-blue-marble.jpg', 'earth-night.jpg'][k]) : Promise.reject(e))));
    const u = this.earth.material.uniforms;
    u.dayTex.value = day; u.nightTex.value = night; u.waterTex.value = water; u.topoTex.value = topo;
    this._nightImg = night.image; this._waterImg = water.image;
    try {
      const ti = topo.image, c = document.createElement('canvas'); c.width = ti.width; c.height = ti.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(ti, 0, 0);
      this._topo = { w: c.width, h: c.height, d: x.getImageData(0, 0, c.width, c.height).data };
    } catch (e) { console.warn('height map', e); }
    try { u.priorTex.value = this.buildPrior(night.image, water.image); } catch (e) { console.warn('settlement map', e); }
    try { u.coastTex.value = this.buildCoast(water.image, big ? 4096 : 2048); } catch (e) { console.warn('coast map', e); }
    this.sky.material.map = sky; this.sky.material.needsUpdate = true;
    get('textures/clouds.png').then(cl => { u.cloudTex.value = cl; this.clouds.material.uniforms.cloudTex.value = cl; this.clouds.visible = true; }).catch(() => {});
  }

  // Distance from the shore across the seas, for the surf. 0 = land; water runs from 8/255 at the beach up to 1 about
  // three degrees offshore. Two-pass chamfer distance on the upscaled water mask.
  buildCoast(waterImg, W) {
    const H = W / 2, CAP = W / 128;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.filter = `blur(${W / 1100}px)`; ctx.drawImage(waterImg, 0, 0, W, H); ctx.filter = 'none'; // round off the mask's pixel steps
    const src = ctx.getImageData(0, 0, W, H).data;
    const d = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) d[i] = src[i * 4] > 127 ? 1e9 : 0;
    const A = 1, B = Math.SQRT2;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x; let v = d[i]; if (!v) continue;
      const l = x ? i - 1 : i + W - 1; // wrap across the date line
      v = Math.min(v, d[l] + A);
      if (y) { const u = i - W; v = Math.min(v, d[u] + A, d[x ? u - 1 : u + W - 1] + B, d[x < W - 1 ? u + 1 : u - W + 1] + B); }
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x; let v = d[i]; if (!v) continue;
      const r = x < W - 1 ? i + 1 : i - W + 1;
      v = Math.min(v, d[r] + A);
      if (y < H - 1) { const b = i + W; v = Math.min(v, d[b] + A, d[x ? b - 1 : b + W - 1] + B, d[x < W - 1 ? b + 1 : b - W + 1] + B); }
      d[i] = v;
    }
    const data = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = d[y * W + x];
      data[(H - 1 - y) * W + x] = v ? Math.round(8 + 247 * Math.min(1, v / CAP)) : 0; // texture rows run from the south
    }
    const tex = new THREE.DataTexture(data, W, H, THREE.RedFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter; tex.wrapS = THREE.RepeatWrapping; tex.needsUpdate = true;
    return tex;
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
    const cloudShift = { value: 0 }, cloudAmt = { value: 0.5 }, season = { value: 0.22 };
    this.u = { sunDir, cloudShift, cloudAmt, season };
    const mat = new THREE.ShaderMaterial({
      vertexShader: TERRAIN_VS, fragmentShader: EARTH_FS,
      uniforms: { relief: { value: 0.0065 }, dayTex: { value: blank }, nightTex: { value: blank }, waterTex: { value: blank }, topoTex: { value: blank }, coastTex: { value: blank }, cloudTex: { value: blank }, priorTex: { value: blank },
        idxTex: { value: idxTex }, idxSize: { value: new THREE.Vector2(idxTex.image.width, idxTex.image.height) }, palTex: { value: palTex }, scarTex: { value: this.scarTex }, sunDir, cloudShift, cloudAmt, season, time: { value: 0 }, overlay: { value: 1 } },
    });
    this.earth = new THREE.Mesh(new THREE.SphereGeometry(1, 720, 360), mat);
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
  // Upsampled 4x: each fine pixel takes the region with the greatest bilinear weight among the four nearest grid
  // cells, which turns the grid's stair steps into smooth diagonal edges.
  makeIdxTex() {
    const w = this.world, S = 1, TW = 360 * w.R * S, TH = 180 * w.R * S, G = w.grid, GW = w.W, GH = w.H, R = w.R;
    const idx = new Uint8Array(TW * TH * 2);
    const cell = (i, j) => { if (j < 0 || j >= GH) return -1; i %= GW; if (i < 0) i += GW; return i < GW ? G[j * GW + i] : -1; };
    const ids = [0, 0, 0, 0], ws = [0, 0, 0, 0];
    for (let k = 0; k < TH; k++) {
      const lat = -90 + (k + 0.5) * 180 / TH, gy = (w.latN - lat) * R - 0.5;
      if (gy < -1 || gy > GH) continue;
      const j0 = Math.floor(gy), fy = gy - j0;
      for (let i = 0; i < TW; i++) {
        const lon = -180 + (i + 0.5) * 360 / TW;
        let gx = (lon - w.lon0) * R - 0.5; if (gx < 0) gx += 360 * R;
        const i0 = Math.floor(gx), fx = gx - i0;
        ids[0] = cell(i0, j0); ids[1] = cell(i0 + 1, j0); ids[2] = cell(i0, j0 + 1); ids[3] = cell(i0 + 1, j0 + 1);
        ws[0] = (1 - fx) * (1 - fy); ws[1] = fx * (1 - fy); ws[2] = (1 - fx) * fy; ws[3] = fx * fy;
        let best = ids[0], bw = -1;
        if (ids[0] !== ids[1] || ids[0] !== ids[2] || ids[0] !== ids[3]) for (let a = 0; a < 4; a++) { let t = 0; for (let b = 0; b < 4; b++) if (ids[b] === ids[a]) t += ws[b]; if (t > bw) { bw = t; best = ids[a]; } }
        const v = best + 1, p = (k * TW + i) * 2;
        idx[p] = v & 255; idx[p + 1] = v >> 8;
      }
    }
    const idxTex = new THREE.DataTexture(idx, TW, TH, THREE.RGFormat);
    idxTex.unpackAlignment = 2;
    idxTex.magFilter = idxTex.minFilter = THREE.NearestFilter; idxTex.wrapS = THREE.RepeatWrapping; idxTex.needsUpdate = true;
    return idxTex;
  }
  // Border chains follow the 0.25 degree grid; smooth them so borders read as natural curves, not stair steps.
  smoothChains() {
    const GW = this.world.W;
    const sm = ch => {
      const n = (ch.length - 2) / 2; if (n < 3) return ch;
      let X = [], Y = [];
      for (let k = 0; k < n; k++) { X.push(ch[2 + 2 * k]); Y.push(ch[3 + 2 * k]); }
      const closed = X[0] === X[n - 1] && Y[0] === Y[n - 1];
      const jump = (a, b) => Math.abs(X[a] - X[b]) > GW / 4;
      for (let pass = 0; pass < 3; pass++) {
        const nx = X.slice(), ny = Y.slice();
        for (let k = 0; k < n; k++) {
          let a = k - 1, b = k + 1;
          if (closed) { if (a < 0) a = n - 2; if (b > n - 1) b = 1; } else if (a < 0 || b > n - 1) continue;
          if (jump(a, k) || jump(b, k)) continue;
          nx[k] = X[a] * 0.25 + X[k] * 0.5 + X[b] * 0.25; ny[k] = Y[a] * 0.25 + Y[k] * 0.5 + Y[b] * 0.25;
        }
        X = nx; Y = ny;
      }
      const out = [ch[0], ch[1], X[0], Y[0]];
      for (let k = 0; k + 1 < n; k++) {
        if (jump(k, k + 1)) { out.push(X[k + 1], Y[k + 1]); continue; }
        out.push(X[k] * 0.75 + X[k + 1] * 0.25, Y[k] * 0.75 + Y[k + 1] * 0.25, X[k] * 0.25 + X[k + 1] * 0.75, Y[k] * 0.25 + Y[k + 1] * 0.75);
      }
      out.push(X[n - 1], Y[n - 1]);
      return out;
    };
    this.landChains = this.json.landChains.map(sm);
    this.seaChains = this.json.seaChains.map(sm);
  }
  // coasts, region borders, province borders and sea-zone borders
  buildMapLines() {
    this.smoothChains();
    const scene = this.scene;
    for (const k of ['coast', 'regionBorders', 'provinceBorders', 'seaBorders']) if (this[k]) { scene.remove(this[k]); this[k].geometry.dispose(); this[k].material.dispose(); }
    this.coast = this.fatLines(this.pathToSegs(this.json.landPath, 1.0012), null, 0xbfefff, 1.1, 0.42);
    scene.add(this.coast);
    const rb = [], pb = [], sb = [];
    const R = this.world.regions;
    for (const ch of this.landChains) { this.chainSegs(ch, rb, 1.0013); const a = R[ch[0]], b = R[ch[1]]; if (a && b && a.parent && b.parent && a.parent !== b.parent) this.chainSegs(ch, pb, 1.00135); }
    for (const ch of this.seaChains) this.chainSegs(ch, sb, 1.0011);
    this.regionBorders = this.thinLines(rb, 0xf4ead2, 0.18); scene.add(this.regionBorders);
    this.provinceBorders = this.thinLines(pb, 0xffe7b0, 0.3); scene.add(this.provinceBorders);
    this.seaBorders = this.thinLines(sb, 0x8fd3ff, 0.07); scene.add(this.seaBorders);
  }
  // swap in a different map (used to load games saved on an older map)
  setWorld(world, json) {
    this.world = world; this.json = json;
    const u = this.earth.material.uniforms;
    u.idxTex.value.dispose(); u.idxTex.value = this.makeIdxTex(); u.idxSize.value.set(u.idxTex.value.image.width, u.idxTex.value.image.height);
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
    for (const ch of this.landChains) {
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
    this.u.season.value = ((doy - 1) / 365) % 1;
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
    this.maxUnits = max;
    const geos = buildModels();
    const mat = new THREE.ShaderMaterial({ uniforms: { sunDir: this.u.sunDir, time: { value: 0 } }, vertexShader: UNIT_VS, fragmentShader: UNIT_FS });
    this.unitMat = mat;
    const inst = (geo, material) => {
      const m = new THREE.InstancedMesh(geo, material, max);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3).setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false;
      this.scene.add(m); return m;
    };
    this.models = {};
    for (const k of MODEL_KEYS) { this.models[k] = inst(geos[k], mat); this.models[k].renderOrder = 8; }
    // selection and battle rings on the ground
    this.unitRings = inst(new THREE.RingGeometry(0.66, 0.8, 32).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({ vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.unitRings.renderOrder = 7;
    this.unitState = new Map(); this.ghosts = []; this._uFrame = 0;
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
  // ground height under a point (the same lift the terrain shader applies)
  heightAt(lat, lon) {
    const T = this._topo; if (!T) return 0;
    const x = Math.min(T.w - 1, Math.max(0, Math.floor((((lon + 180) % 360 + 360) % 360) / 360 * T.w))), y = Math.min(T.h - 1, Math.max(0, Math.floor((90 - lat) / 180 * T.h)));
    return Math.pow(T.d[(y * T.w + x) * 4] / 255, 0.85) * this.earth.material.uniforms.relief.value;
  }
  // units: [{id, lat, lon, alt, color:[r,g,b], size, flag, model, moving, form:[k, n], slot}]
  // flag bits: 1 selected, 2 mine, 4 airborne, 8 at sea, 16 fighting.
  // Each unit keeps a smoothed heading from its motion and is animated: marching bob, galloping, ships riding the
  // swell, aircraft banking into turns, recoil in battle, a pop when raised and a topple when destroyed.
  setUnits(list) {
    const t = this.clock.elapsedTime, now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - (this._uT || now)) / 1000)); this._uT = now;
    const frame = ++this._uFrame;
    const cam = this.camera.position, cx = cam.x, cy = cam.y, cz = cam.z;
    const pxK = 2 * Math.tan(this.camera.fov * Math.PI / 360) / Math.max(1, this.container.clientHeight);
    const camD = cam.length(), close = 1 + 0.5 * Math.min(1, Math.max(0, (1.6 - camD) / 0.5));
    const cr = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0); // screen right
    const counts = {}; for (const k of MODEL_KEYS) counts[k] = 0;
    let nr = 0;
    const rings = this.unitRings, RM = rings.instanceMatrix.array, RC = rings.instanceColor.array;
    const write = (model, R, U, F, px, py, pz, sc, col) => {
      const m = this.models[model], i = counts[model]++; if (i >= this.maxUnits) return;
      const e = m.instanceMatrix.array, o = i * 16;
      e[o] = R[0] * sc; e[o + 1] = R[1] * sc; e[o + 2] = R[2] * sc; e[o + 3] = 0;
      e[o + 4] = U[0] * sc; e[o + 5] = U[1] * sc; e[o + 6] = U[2] * sc; e[o + 7] = 0;
      e[o + 8] = F[0] * sc; e[o + 9] = F[1] * sc; e[o + 10] = F[2] * sc; e[o + 11] = 0;
      e[o + 12] = px; e[o + 13] = py; e[o + 14] = pz; e[o + 15] = 1;
      m.instanceColor.array.set(col, i * 3);
    };
    const R = [0, 0, 0], U = [0, 0, 0], F = [0, 0, 0];
    // orient: up, heading, then roll about the heading and pitch about the right axis
    const basis = (up, h, roll, pitch) => {
      let ex = up[2], ez = -up[0]; const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el; // east: (z, 0, -x), the way longitude rises
      const nx = up[1] * ez, ny = up[2] * ex - up[0] * ez, nz = -up[1] * ex; // north = up x east
      const ch = Math.cos(h), sh = Math.sin(h);
      const f0 = nx * ch + ex * sh, f1 = ny * ch, f2 = nz * ch + ez * sh;
      const r0 = up[1] * f2 - up[2] * f1, r1 = up[2] * f0 - up[0] * f2, r2 = up[0] * f1 - up[1] * f0; // right = up x fwd
      const cr = Math.cos(roll), sr = Math.sin(roll), cp = Math.cos(pitch), sp = Math.sin(pitch);
      const u1 = [up[0] * cr + r0 * sr, up[1] * cr + r1 * sr, up[2] * cr + r2 * sr];
      R[0] = r0 * cr - up[0] * sr; R[1] = r1 * cr - up[1] * sr; R[2] = r2 * cr - up[2] * sr;
      F[0] = f0 * cp + u1[0] * sp; F[1] = f1 * cp + u1[1] * sp; F[2] = f2 * cp + u1[2] * sp;
      U[0] = u1[0] * cp - f0 * sp; U[1] = u1[1] * cp - f1 * sp; U[2] = u1[2] * cp - f2 * sp;
      return [ex, ez];
    };
    const FORM = [[[0, 0]], [[-0.55, 0], [0.55, 0]], [[0, 0.5], [-0.6, -0.42], [0.6, -0.42]], [[-0.55, 0.5], [0.55, 0.5], [-0.55, -0.55], [0.55, -0.55]], [[0, 0.75], [-0.68, 0.15], [0.68, 0.15], [-0.42, -0.65], [0.42, -0.65]]];
    for (const u of list) {
      let st = this.unitState.get(u.id);
      if (!st) { st = { h: (u.id * 2.399) % (Math.PI * 2), born: t, bank: 0, ph: (u.id * 1.618) % 6.283, lp: null, last: new Float32Array(16) }; this.unitState.set(u.id, st); }
      st.seen = frame; st.model = u.model;
      const air = u.flag & 4, sea = u.flag & 8, fight = u.flag & 16, sel = u.flag & 1;
      const up = ll2v(u.lat, u.lon, 1);
      // heading follows the direction of travel
      let turn = 0;
      if (st.lp) {
        const dx = up[0] - st.lp[0], dy = up[1] - st.lp[1], dz = up[2] - st.lp[2];
        let ex = up[2], ez = -up[0]; const el = Math.hypot(ex, ez) || 1; ex /= el; ez /= el;
        const de = dx * ex + dz * ez, dn = dx * (up[1] * ez) + dy * (up[2] * ex - up[0] * ez) + dz * (-up[1] * ex);
        if (de * de + dn * dn > 1e-13) {
          let d = Math.atan2(de, dn) - st.h; d = Math.atan2(Math.sin(d), Math.cos(d));
          turn = d * Math.min(1, dt * (air ? 3 : 5)); st.h += turn;
        }
      }
      st.lp = up;
      st.bank += ((air ? Math.max(-0.7, Math.min(0.7, -turn / dt * 0.35)) : 0) - st.bank) * Math.min(1, dt * 4);
      const k = u.form ? u.form[0] : 0, n = u.form ? Math.min(5, u.form[1]) : 1;
      if (k >= 5) continue; // big stacks show five; the tag carries the count
      const r = air ? 1.003 + (u.alt || 0) : sea ? 1.0002 : 1.0002 + this.heightAt(u.lat, u.lon);
      const px0 = up[0] * r, py0 = up[1] * r, pz0 = up[2] * r;
      if (up[0] * cx + up[1] * cy + up[2] * cz < r * 0.995) continue; // behind the horizon
      const D = Math.hypot(cx - px0, cy - py0, cz - pz0);
      const ws = Math.min(0.014, u.size * 2.4 * close * D * pxK);
      // animation
      const ph = st.ph, model = u.model;
      let bob = 0, roll = 0, pitch = 0, fo = 0, sc = 1;
      if (air) { bob = Math.sin(t * 2.2 + ph) * 0.15; roll = st.bank; pitch = Math.sin(t * 1.7 + ph) * 0.05; }
      else if (sea) { roll = Math.sin(t * 1.5 + ph) * 0.09; pitch = Math.sin(t * 1.05 + ph * 1.7) * (u.moving ? 0.07 : 0.04); bob = Math.sin(t * 1.3 + ph) * 0.05 - (model === 'sub' ? 0.06 : 0); }
      else if (u.moving) {
        if (model === 'arm' || model === 'aa' || model === 'art' || model === 'cat') { bob = Math.abs(Math.sin(t * 26 + ph)) * 0.015; pitch = Math.sin(t * 2.6 + ph) * 0.03; }
        else { const cav = model === 'cav', w = Math.sin(t * (cav ? 11 : 8.5) + ph); bob = Math.abs(w) * (cav ? 0.14 : 0.09); pitch = w * (cav ? 0.1 : 0.05); }
      } else roll = Math.sin(t * 1.2 + ph) * 0.015;
      if (fight) { const kk = Math.pow(Math.max(0, Math.sin(t * 12 + ph)), 6); fo -= kk * 0.18; pitch -= kk * 0.12; roll += Math.sin(t * 23 + ph) * 0.03; }
      const age = (t - st.born) / 0.5;
      if (age < 1) { const c1 = 1.70158, a = age - 1; sc = 1 + (c1 + 1) * a * a * a + c1 * a * a; } // ease-out-back pop
      const [ex, ez] = basis(up, st.h, roll, pitch);
      // seen from straight above a figure is just the top of its head: lean it back toward the screen's top so the
      // camera sees it in three-quarter view, the more so the more top-down the view
      const vx = cx - px0, vy = cy - py0, vz = cz - pz0, top = (up[0] * vx + up[1] * vy + up[2] * vz) / D;
      const lean = -0.85 * Math.min(1, Math.max(0, (top - 0.35) / 0.5));
      if (lean) {
        const d = cr.x * up[0] + cr.y * up[1] + cr.z * up[2];
        let ax = cr.x - up[0] * d, ay = cr.y - up[1] * d, az = cr.z - up[2] * d; const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
        const c = Math.cos(lean), s = Math.sin(lean);
        for (const V of [R, U, F]) { // Rodrigues about the in-plane screen-right axis
          const kd = ax * V[0] + ay * V[1] + az * V[2], x0 = ay * V[2] - az * V[1], y0 = az * V[0] - ax * V[2], z0 = ax * V[1] - ay * V[0];
          V[0] = V[0] * c + x0 * s + ax * kd * (1 - c); V[1] = V[1] * c + y0 * s + ay * kd * (1 - c); V[2] = V[2] * c + z0 * s + az * kd * (1 - c);
        }
      }
      const [ox, oz] = FORM[n - 1][k];
      // formation offsets in the unit's own frame, detachments side by side along the east
      const fx = ox * ws * 1.15, fz = oz * ws * 1.15, sl = (u.slot || 0) * ws * 1.8;
      const r0 = R[0], r1 = R[1], r2 = R[2];
      const px = px0 + r0 * fx + F[0] * (fz + fo * ws) + U[0] * bob * ws + ex * sl;
      const py = py0 + r1 * fx + F[1] * (fz + fo * ws) + U[1] * bob * ws;
      const pz = pz0 + r2 * fx + F[2] * (fz + fo * ws) + U[2] * bob * ws + ez * sl;
      write(model, R, U, F, px, py, pz, ws * sc, u.color);
      const L = st.last; L.set(R, 0); L.set(U, 3); L.set(F, 6); L[9] = px; L[10] = py; L[11] = pz; L[12] = ws; L[13] = u.color[0]; L[14] = u.color[1]; L[15] = u.color[2];
      // rings: white for the selection, pulsing red in battle
      if ((sel || fight) && nr < this.maxUnits) {
        basis(up, st.h, 0, 0);
        const q = ws * (air ? 0.9 : 1.05), o = nr * 16;
        RM[o] = R[0] * q; RM[o + 1] = R[1] * q; RM[o + 2] = R[2] * q; RM[o + 3] = 0;
        RM[o + 4] = U[0] * q; RM[o + 5] = U[1] * q; RM[o + 6] = U[2] * q; RM[o + 7] = 0;
        RM[o + 8] = F[0] * q; RM[o + 9] = F[1] * q; RM[o + 10] = F[2] * q; RM[o + 11] = 0;
        RM[o + 12] = px - up[0] * bob * ws * 0.9; RM[o + 13] = py - up[1] * bob * ws * 0.9; RM[o + 14] = pz - up[2] * bob * ws * 0.9; RM[o + 15] = 1;
        const pul = 0.5 + 0.5 * Math.sin(t * (fight && !sel ? 9 : 3));
        if (sel) { RC[nr * 3] = RC[nr * 3 + 1] = 0.7 + 0.3 * pul; RC[nr * 3 + 2] = 0.62 + 0.3 * pul; } else { RC[nr * 3] = 0.9 * pul; RC[nr * 3 + 1] = 0.18 * pul; RC[nr * 3 + 2] = 0.1 * pul; }
        nr++;
      }
    }
    // the fallen topple and sink away
    const gone = [];
    for (const [id, st] of this.unitState) if (st.seen !== frame) { gone.push(st); this.unitState.delete(id); }
    if (gone.length && gone.length < 40) for (const st of gone) if (st.last[12] > 0) this.ghosts.push({ t0: t, model: st.model, L: st.last });
    this.ghosts = this.ghosts.filter(g => t - g.t0 < 0.9);
    for (const g of this.ghosts) {
      const a = (t - g.t0) / 0.9, L = g.L, ws = L[12], tip = a * 1.3, c = Math.cos(tip), s = Math.sin(tip);
      for (let j = 0; j < 3; j++) { R[j] = L[j] * c - L[3 + j] * s; U[j] = L[3 + j] * c + L[j] * s; F[j] = L[6 + j]; }
      const sink = a * a * 0.6 * ws, fade = 1 - a * 0.6;
      const up = [L[9], L[10], L[11]], ul = Math.hypot(...up);
      write(g.model, R, U, F, L[9] - up[0] / ul * sink, L[10] - up[1] / ul * sink, L[11] - up[2] / ul * sink, ws * (1 - a * a * 0.5), [L[13] * fade, L[14] * fade, L[15] * fade]);
    }
    for (const k of MODEL_KEYS) {
      const m = this.models[k]; m.count = Math.min(this.maxUnits, counts[k]);
      if (m.count) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    }
    rings.count = nr; if (nr) { rings.instanceMatrix.needsUpdate = true; rings.instanceColor.needsUpdate = true; }
    this.unitMat.uniforms.time.value = t;
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
