// Low-poly unit models, built from primitives so nothing has to be downloaded.
// Model space: y is up, +z is forward, about one unit tall, standing on y = 0.
// Every vertex carries a `part` that the unit shader colours:
//   0 team colour   1 dark metal   2 cloth / skin / glass   3 waving flag (team colour)   5 wood / hide
import * as THREE from 'three';

const TEAM = 0, METAL = 1, CLOTH = 2, FLAG = 3, WOOD = 5;

function put(geo, part, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, s = 1 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));
  g.applyMatrix4(m);
  g.setAttribute('part', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count).fill(part), 1));
  return g;
}
function merge(list) {
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), part = new Float32Array(n);
  let o = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); part.set(g.attributes.part.array, o);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('part', new THREE.BufferAttribute(part, 1));
  out.computeBoundingSphere();
  return out;
}
const box = (w, h, d, part, o) => put(new THREE.BoxGeometry(w, h, d), part, o);
const cyl = (rt, rb, h, part, o, seg = 8) => put(new THREE.CylinderGeometry(rt, rb, h, seg), part, o);
const ball = (r, part, o) => put(new THREE.SphereGeometry(r, 8, 6), part, o);
// a pennant flying back from the top of a pole at (x, z)
const banner = (x, y, z, w = 0.3, h = 0.2) => [cyl(0.014, 0.014, y + 0.02, WOOD, { x, y: (y + 0.02) / 2, z }, 5), box(0.012, h, w, FLAG, { x, y: y - h / 2, z: z - w / 2 })];

function soldier(x, z, s, kit) {
  const o = (dx, dy, dz) => ({ x: x + dx * s, y: dy * s, z: z + dz * s, s });
  const g = [
    box(0.1, 0.3, 0.11, METAL, o(-0.07, 0.15, 0)), box(0.1, 0.3, 0.11, METAL, o(0.07, 0.15, 0)),
    box(0.3, 0.34, 0.19, TEAM, o(0, 0.47, 0)),
    ball(0.1, CLOTH, o(0, 0.73, 0)), cyl(0.11, 0.115, 0.06, METAL, o(0, 0.79, 0)),
  ];
  if (kit === 'spear') g.push(cyl(0.016, 0.016, 1.0, WOOD, o(0.2, 0.55, 0.06)), box(0.05, 0.3, 0.22, TEAM, o(-0.19, 0.46, 0.05)));
  if (kit === 'bow') g.push(put(new THREE.TorusGeometry(0.24, 0.016, 3, 10, Math.PI), WOOD, { ...o(0.2, 0.5, 0.08), rz: -Math.PI / 2, ry: Math.PI / 2 }), box(0.08, 0.26, 0.08, WOOD, o(-0.06, 0.55, -0.13)));
  if (kit === 'rifle') g.push(cyl(0.017, 0.017, 0.62, METAL, { ...o(0.15, 0.55, 0.1), rx: 0.6 }), box(0.18, 0.14, 0.08, WOOD, o(0, 0.36, -0.12)));
  return g;
}

const MODELS = {
  // a small company behind its standard
  inf: () => [...soldier(0, 0.12, 1, 'spear'), ...soldier(-0.24, -0.2, 0.82, 'spear'), ...soldier(0.24, -0.2, 0.82, 'spear'), ...banner(-0.05, 1.12, -0.32)],
  rng: () => [...soldier(0, 0.12, 1, 'bow'), ...soldier(-0.25, -0.2, 0.82, 'bow'), ...soldier(0.25, -0.2, 0.82, 'bow'), ...banner(-0.05, 1.1, -0.32)],
  rifle: () => [...soldier(0, 0.14, 1, 'rifle'), ...soldier(-0.26, -0.18, 0.86, 'rifle'), ...soldier(0.26, -0.18, 0.86, 'rifle'), ...soldier(0, -0.4, 0.8, 'rifle')],
  cav: () => {
    const g = [box(0.26, 0.26, 0.62, WOOD, { y: 0.52 }),
      ...[[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.22], [0.09, -0.22]].map(([x, z]) => box(0.07, 0.4, 0.07, WOOD, { x, y: 0.2, z })),
      box(0.13, 0.32, 0.14, WOOD, { y: 0.74, z: 0.3, rx: 0.55 }), box(0.12, 0.13, 0.27, WOOD, { y: 0.88, z: 0.44 }),
      box(0.04, 0.16, 0.04, METAL, { y: 0.55, z: -0.36, rx: -0.5 }), // tail
      box(0.24, 0.32, 0.17, TEAM, { y: 0.84, z: -0.04 }), ball(0.095, CLOTH, { y: 1.07, z: -0.04 }), cyl(0.1, 0.105, 0.05, METAL, { y: 1.13, z: -0.04 }),
      cyl(0.015, 0.015, 1.05, WOOD, { x: 0.17, y: 0.95, z: 0.25, rx: 1.15 }),
    ];
    return [...g, ...banner(-0.16, 1.3, -0.1, 0.24, 0.16)];
  },
  arm: () => [box(0.15, 0.18, 0.92, METAL, { x: -0.27, y: 0.12 }), box(0.15, 0.18, 0.92, METAL, { x: 0.27, y: 0.12 }),
    box(0.44, 0.17, 0.84, TEAM, { y: 0.24 }), box(0.34, 0.15, 0.38, TEAM, { y: 0.39, z: -0.06 }),
    cyl(0.032, 0.036, 0.6, METAL, { y: 0.4, z: 0.4, rx: Math.PI / 2 }), cyl(0.05, 0.05, 0.04, METAL, { x: 0.1, y: 0.48, z: -0.12 }),
  ],
  art: () => [cyl(0.2, 0.2, 0.05, WOOD, { x: -0.22, y: 0.22, rz: Math.PI / 2 }, 12), cyl(0.2, 0.2, 0.05, WOOD, { x: 0.22, y: 0.22, rz: Math.PI / 2 }, 12),
    cyl(0.025, 0.025, 0.46, METAL, { y: 0.22, rz: Math.PI / 2 }),
    box(0.1, 0.08, 0.62, TEAM, { y: 0.16, z: -0.27, rx: 0.25 }),
    cyl(0.05, 0.08, 0.72, METAL, { y: 0.36, z: 0.12, rx: Math.PI / 2 - 0.35 }),
  ],
  // catapult for the early ages
  cat: () => [box(0.38, 0.08, 0.7, WOOD, { y: 0.1 }), box(0.06, 0.4, 0.06, WOOD, { x: -0.15, y: 0.32 }), box(0.06, 0.4, 0.06, WOOD, { x: 0.15, y: 0.32 }),
    box(0.36, 0.06, 0.06, WOOD, { y: 0.5 }), box(0.06, 0.06, 0.82, WOOD, { y: 0.5, z: -0.05, rx: 0.65 }), box(0.14, 0.08, 0.14, METAL, { y: 0.75, z: -0.32 }),
    ...[[-0.2, 0.25], [0.2, 0.25], [-0.2, -0.25], [0.2, -0.25]].map(([x, z]) => cyl(0.08, 0.08, 0.04, TEAM, { x, y: 0.08, z, rz: Math.PI / 2 }, 10)),
  ],
  aa: () => [box(0.4, 0.18, 0.72, TEAM, { y: 0.2 }),
    ...[[-0.18, 0.24], [0.18, 0.24], [-0.18, -0.24], [0.18, -0.24]].map(([x, z]) => cyl(0.09, 0.09, 0.06, METAL, { x, y: 0.1, z, rz: Math.PI / 2 }, 10)),
    cyl(0.14, 0.15, 0.1, METAL, { y: 0.34, z: -0.08 }),
    cyl(0.022, 0.022, 0.55, METAL, { x: -0.05, y: 0.55, z: 0.06, rx: 0.6 }), cyl(0.022, 0.022, 0.55, METAL, { x: 0.05, y: 0.55, z: 0.06, rx: 0.6 }),
  ],
  ftr: () => [
    cyl(0.055, 0.085, 0.95, TEAM, { rx: Math.PI / 2 }), put(new THREE.ConeGeometry(0.055, 0.22, 8), METAL, { z: 0.58, rx: Math.PI / 2 }),
    ball(0.06, CLOTH, { y: 0.06, z: 0.2, s: 1 }),
    box(0.5, 0.025, 0.28, TEAM, { x: -0.25, z: -0.02, ry: -0.45 }), box(0.5, 0.025, 0.28, TEAM, { x: 0.25, z: -0.02, ry: 0.45 }),
    box(0.3, 0.02, 0.12, TEAM, { z: -0.42 }), box(0.02, 0.2, 0.16, FLAG, { y: 0.1, z: -0.42 }),
  ],
  bmb: () => [
    cyl(0.08, 0.1, 1.15, TEAM, { rx: Math.PI / 2 }), ball(0.09, CLOTH, { z: 0.57 }),
    box(1.5, 0.03, 0.22, TEAM, { z: 0.05 }),
    ...[-0.5, -0.28, 0.28, 0.5].map(x => cyl(0.04, 0.045, 0.24, METAL, { x, y: -0.03, z: 0.08, rx: Math.PI / 2 })),
    box(0.52, 0.025, 0.13, TEAM, { z: -0.52 }), box(0.025, 0.24, 0.17, FLAG, { y: 0.12, z: -0.52 }),
  ],
};

// boat hull from a pointed top-view outline, extruded downward from the deck
function hull(w, l, h, part) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -l / 2); s.lineTo(w / 2, -l / 2); s.lineTo(w / 2, l * 0.18);
  s.quadraticCurveTo(w * 0.36, l * 0.42, 0, l / 2); s.quadraticCurveTo(-w * 0.36, l * 0.42, -w / 2, l * 0.18); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  return put(g, part, { rx: Math.PI / 2, y: h });
}
Object.assign(MODELS, {
  // sailing ships, galleys and cogs before the age of steam
  sail: () => [hull(0.36, 1.0, 0.2, WOOD), box(0.37, 0.04, 0.82, TEAM, { y: 0.2, z: -0.06 }),
    cyl(0.02, 0.025, 0.9, WOOD, { y: 0.62, z: 0.05 }), box(0.5, 0.42, 0.02, CLOTH, { y: 0.66, z: 0.07 }),
    cyl(0.015, 0.02, 0.6, WOOD, { y: 0.5, z: -0.28 }), box(0.32, 0.26, 0.02, CLOTH, { y: 0.58, z: -0.27 }),
    box(0.012, 0.1, 0.22, FLAG, { y: 1.02, z: -0.06 })],
  des: () => [hull(0.34, 1.15, 0.16, METAL), box(0.35, 0.035, 1.0, TEAM, { y: 0.16, z: -0.07 }),
    box(0.22, 0.16, 0.34, CLOTH, { y: 0.26, z: -0.05 }), box(0.14, 0.12, 0.16, CLOTH, { y: 0.4, z: -0.02 }),
    cyl(0.05, 0.06, 0.2, TEAM, { y: 0.4, z: -0.2 }),
    cyl(0.07, 0.08, 0.07, METAL, { y: 0.21, z: 0.3 }), cyl(0.016, 0.016, 0.24, METAL, { y: 0.24, z: 0.44, rx: Math.PI / 2 }),
    cyl(0.012, 0.012, 0.3, METAL, { y: 0.6, z: -0.02 })],
  trn: () => [hull(0.38, 1.05, 0.18, METAL), box(0.39, 0.035, 0.92, TEAM, { y: 0.18, z: -0.06 }),
    box(0.15, 0.13, 0.22, TEAM, { x: -0.08, y: 0.26, z: 0.12 }), box(0.15, 0.13, 0.22, CLOTH, { x: 0.08, y: 0.26, z: 0.12 }), box(0.15, 0.13, 0.22, CLOTH, { x: -0.08, y: 0.26, z: -0.12 }),
    box(0.26, 0.2, 0.14, CLOTH, { y: 0.3, z: -0.38 })],
  car: () => [hull(0.42, 1.5, 0.15, METAL), box(0.5, 0.04, 1.45, METAL, { y: 0.17, z: -0.04 }), box(0.04, 0.005, 1.2, CLOTH, { y: 0.195, z: -0.05 }),
    box(0.1, 0.22, 0.26, TEAM, { x: 0.2, y: 0.3, z: -0.1 }), cyl(0.01, 0.01, 0.2, METAL, { x: 0.2, y: 0.5, z: -0.1 })],
  sub: () => [cyl(0.1, 0.1, 0.9, METAL, { y: 0.06, rx: Math.PI / 2 }, 10), ball(0.1, METAL, { y: 0.06, z: 0.45 }), put(new THREE.ConeGeometry(0.1, 0.24, 10), METAL, { y: 0.06, z: -0.56, rx: -Math.PI / 2 }),
    box(0.07, 0.17, 0.22, TEAM, { y: 0.22, z: 0.12 }), box(0.22, 0.02, 0.08, TEAM, { y: 0.06, z: -0.5 })],
});

export const MODEL_KEYS = Object.keys(MODELS);
export function buildModels() { const out = {}; for (const k of MODEL_KEYS) out[k] = merge(MODELS[k]()); return out; }
// which model a unit type wears
export function modelFor(T) {
  const a = T.age ?? 0;
  if (T.sym === 'des' || T.sym === 'trn') return a < 6 ? 'sail' : T.sym;
  if (T.sym === 'art') return a < 5 ? 'cat' : 'art';
  if (T.sym === 'inf' || T.sym === 'rng') return a >= 5 ? 'rifle' : T.sym;
  return MODELS[T.sym] ? T.sym : 'inf';
}
