import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CFG } from './levelConfig';

export type Collider = { minX: number; maxX: number; minZ: number; maxZ: number; enabled: boolean };

// ----------------------------------------------------------------- helpers
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat?: [number, number]) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat); }
  return t;
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Collects boxes/cylinders and merges them into 2 meshes (lit + unlit-glow) so the whole zone is ~2 draw calls. */
class Batch {
  private solid: THREE.BufferGeometry[] = [];
  private glow: THREE.BufferGeometry[] = [];
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler();
  private col = new THREE.Color();
  constructor(private colliders: Collider[]) {}

  private add(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rot: [number, number, number] | undefined, glow: boolean) {
    this.e.set(rot?.[0] ?? 0, rot?.[1] ?? 0, rot?.[2] ?? 0); this.q.setFromEuler(this.e);
    this.m.compose(new THREE.Vector3(x, y, z), this.q, new THREE.Vector3(1, 1, 1)); geo.applyMatrix4(this.m);
    this.col.set(color); if (!glow) { const j = rnd(0.9, 1.08); this.col.multiplyScalar(j); }
    const n = geo.attributes.position.count; const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = this.col.r; arr[i * 3 + 1] = this.col.g; arr[i * 3 + 2] = this.col.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    (glow ? this.glow : this.solid).push(geo);
  }
  box(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, opt: { rot?: [number, number, number]; glow?: boolean; collide?: boolean } = {}) {
    this.add(new THREE.BoxGeometry(sx, sy, sz), color, x, y, z, opt.rot, !!opt.glow);
    if (opt.collide) this.colliders.push({ minX: x - sx / 2, maxX: x + sx / 2, minZ: z - sz / 2, maxZ: z + sz / 2, enabled: true });
  }
  cyl(x: number, y: number, z: number, rt: number, rb: number, h: number, color: string, opt: { seg?: number; rot?: [number, number, number]; glow?: boolean; collide?: boolean } = {}) {
    this.add(new THREE.CylinderGeometry(rt, rb, h, opt.seg ?? 10), color, x, y, z, opt.rot, !!opt.glow);
    if (opt.collide) { const r = Math.max(rt, rb); this.colliders.push({ minX: x - r, maxX: x + r, minZ: z - r, maxZ: z + r, enabled: true }); }
  }
  build(solidMat: THREE.Material, glowMat: THREE.Material): THREE.Group {
    const g = new THREE.Group();
    const mk = (list: THREE.BufferGeometry[], mat: THREE.Material) => {
      if (!list.length) return;
      const merged = mergeGeometries(list, false); list.forEach((x) => x.dispose());
      if (merged) { const mesh = new THREE.Mesh(merged, mat); g.add(mesh); }
    };
    mk(this.solid, solidMat); mk(this.glow, glowMat);
    return g;
  }
}

export type Env = {
  group: THREE.Group;
  colliders: Collider[];
  door: { open: (u: number) => void; setLights: (c: string) => void; setSign: (open: boolean) => void; collider: Collider };
  flicker: { mat: THREE.MeshBasicMaterial; base: THREE.Color; phase: number }[];
  benchRing: THREE.Mesh;
  monitor: (collected: number, repaired: boolean) => void;
  rivalShaft: THREE.Mesh;
  wallCrack: THREE.Mesh;
  arenaGlowMats: THREE.MeshBasicMaterial[];
  clampArena: (x: number, z: number) => { x: number; z: number };
  update: (time: number) => void;
  dispose: () => void;
};

export function buildEnvironment(): Env {
  const group = new THREE.Group();
  const colliders: Collider[] = [];
  const disposables: { dispose: () => void }[] = [];
  const solidMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, metalness: 0.2 }); disposables.push(solidMat);
  const glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false }); disposables.push(glowMat);
  const flicker: Env['flicker'] = [];
  const C = CFG.cell, T = CFG.tunnel, A = CFG.arena;

  // =========================================================== CONTAINMENT BAY
  {
    const b = new Batch(colliders);
    const wallC = '#3a4048', panelC = '#2b3037', trim = '#1c2025';
    // walls (thick boxes double as collision)
    b.box(-C.halfW - 0.25, C.height / 2, 0, 0.5, C.height, 14.5, wallC, { collide: true });
    b.box(C.halfW + 0.25, C.height / 2, 0, 0.5, C.height, 14.5, wallC, { collide: true });
    b.box(0, C.height / 2, C.halfD + 0.25, 15, C.height, 0.5, wallC, { collide: true });
    const segW = C.halfW + 0.5 - C.doorHalf;
    for (const s of [-1, 1]) b.box(s * (C.doorHalf + segW / 2), C.height / 2, C.doorZ, segW, C.height, 0.5, wallC, { collide: true });
    b.box(0, (C.doorHeight + C.height) / 2, C.doorZ, C.doorHalf * 2 + 0.1, C.height - C.doorHeight, 0.5, wallC);
    b.box(0, C.height + 0.12, 0, 15, 0.25, 15, '#191d22');                       // ceiling slab
    // wall panelling, pillars, ceiling beams
    for (const s of [-1, 1]) {
      b.box(s * (C.halfW - 0.03), 0.65, 0, 0.06, 1.3, 14, panelC);
      b.box(s * (C.halfW - 0.03), 1.33, 0, 0.1, 0.05, 14, '#6d727a');
      for (let z = -6; z <= 6; z += 3) b.box(s * (C.halfW - 0.16), 2.3, z, 0.3, 4.6, 0.36, '#434951');
    }
    b.box(0, 0.65, C.halfD - 0.03, 14, 1.3, 0.06, panelC);
    for (let z = -6; z <= 6; z += 3) { b.box(0, C.height - 0.2, z, 14, 0.24, 0.3, '#2a2f36'); }
    for (let x = -6; x <= 6; x += 3) b.box(x, C.height - 0.1, 0, 0.2, 0.12, 14, '#22262c');
    // ceiling pipes
    b.cyl(-5.8, 4.2, 0, 0.1, 0.1, 14, '#5b4034', { rot: [Math.PI / 2, 0, 0], seg: 8 });
    b.cyl(-5.45, 4.25, 0, 0.07, 0.07, 14, '#3f5a66', { rot: [Math.PI / 2, 0, 0], seg: 8 });
    b.cyl(0, 4.3, 3.5, 0.08, 0.08, 14, '#555b63', { rot: [0, 0, Math.PI / 2], seg: 8 });
    // hazard stripe by the door, door frame
    for (const s of [-1, 1]) {
      b.box(s * (C.doorHalf + 0.12), 1.7, C.doorZ + 0.3, 0.24, 3.4, 0.12, '#14171b');
      b.box(s * (C.doorHalf + 0.1), 1.7, C.doorZ + 0.37, 0.05, 3.3, 0.02, '#c58a26', { glow: true });
    }
    b.box(0, 3.5, C.doorZ + 0.3, C.doorHalf * 2 + 0.5, 0.2, 0.12, '#14171b');
    for (let i = 0; i < 12; i++) b.box(-1.65 + i * 0.3, 0.02, C.doorZ + 0.55, 0.14, 0.02, 0.5, i % 2 ? '#14171b' : '#c58a26', { rot: [0, 0, 0] });

    // --- shelving (west wall) with the Shockwave Core on top
    for (const z of [-0.7, 3.3]) b.box(-6.75, 1.1, z, 0.08, 2.2, 0.08, '#555b63');
    for (const z of [-0.7, 3.3]) b.box(-6.2, 1.1, z, 0.08, 2.2, 0.08, '#555b63');
    for (const y of [0.45, 1.05, 1.65]) b.box(-6.47, y, 1.3, 0.7, 0.05, 4.1, '#6a5a44');
    b.box(-6.47, 1.7, 0.2, 0.3, 0.2, 0.3, '#4c5a46'); b.box(-6.5, 1.1, 2.4, 0.4, 0.22, 0.5, '#7a4a30'); b.box(-6.5, 0.5, 0.4, 0.45, 0.25, 0.4, '#2f3f55'); b.box(-6.5, 1.1, 0.1, 0.25, 0.3, 0.3, '#5c5c64');
    colliders.push({ minX: -6.95, maxX: -6.1, minZ: -0.8, maxZ: 3.4, enabled: true });

    // --- crate stack SE corner with the Knuckle Plate on top
    b.box(5.3, 0.4, 5.4, 0.9, 0.8, 0.9, '#6b5238', { collide: true });
    b.box(5.3, 1.05, 5.4, 0.8, 0.5, 0.8, '#7a5d40', { rot: [0, 0.15, 0] });
    b.box(5.3, 1.3, 5.4, 0.85, 0.03, 0.85, '#4d3a28', { rot: [0, 0.15, 0] });
    b.box(6.2, 0.35, 4.5, 0.7, 0.7, 0.7, '#55432f', { collide: true, rot: [0, -0.2, 0] });
    b.box(4.2, 0.3, 6.3, 0.6, 0.6, 0.6, '#5e4a33', { collide: true });
    for (let i = 0; i < 4; i++) b.box(5.3, 0.15 + i * 0.2, 5.4 - 0.46, 0.8, 0.03, 0.02, '#2e2218');

    // --- table + barrels NW corner with the Power Cell
    b.box(-5.2, 0.8, -5.6, 1.2, 0.07, 0.8, '#59606a', { collide: true });
    for (const [dx, dz] of [[-0.5, -0.32], [0.5, -0.32], [-0.5, 0.32], [0.5, 0.32]]) b.box(-5.2 + dx, 0.38, -5.6 + dz, 0.07, 0.76, 0.07, '#3e434b');
    b.cyl(-6.4, 0.45, -4.4, 0.34, 0.34, 0.9, '#7b2f2a', { collide: true, seg: 12 }); b.cyl(-6.4, 0.92, -4.4, 0.35, 0.35, 0.05, '#3a1512', { seg: 12 });
    b.cyl(-6.3, 0.45, -6.4, 0.34, 0.34, 0.9, '#2f4b5e', { collide: true, seg: 12 }); b.cyl(-4.3, 0.45, -6.5, 0.34, 0.34, 0.9, '#6a6f30', { collide: true, seg: 12 });
    b.box(-5.3, 0.9, -5.8, 0.28, 0.08, 0.2, '#2a2e34');

    // --- workbench (east, centre) — the glove lies here
    const bx = CFG.bench.x, bz = CFG.bench.z, by = CFG.bench.topY;
    b.box(bx, by - 0.06, bz, 2.7, 0.12, 1.2, '#7a6246', { collide: true });
    b.box(bx, by + 0.005, bz, 2.7, 0.02, 1.2, '#2f353c');
    for (const dx of [-1.25, 1.25]) for (const dz of [-0.5, 0.5]) b.box(bx + dx, by / 2 - 0.06, bz + dz, 0.1, by - 0.12, 0.1, '#3a3f46');
    b.box(bx, 0.3, bz, 2.4, 0.04, 1.0, '#4a4f57');
    b.box(bx + 0.9, 0.5, bz + 0.1, 0.55, 0.28, 0.4, '#3d4a38'); b.box(bx - 0.8, 0.5, bz, 0.4, 0.28, 0.35, '#5a3b2b');
    b.box(bx + 1.05, by + 0.12, bz - 0.3, 0.28, 0.16, 0.18, '#3b4048');          // vise
    b.cyl(bx + 1.05, by + 0.06, bz - 0.3, 0.05, 0.05, 0.1, '#6e747c', { seg: 8 });
    b.box(bx - 1.0, by + 0.08, bz + 0.3, 0.3, 0.12, 0.2, '#8a3a2e');             // toolbox
    b.box(bx - 1.0, by + 0.16, bz + 0.3, 0.32, 0.03, 0.22, '#5a2820');
    b.cyl(bx + 0.55, by + 0.04, bz + 0.35, 0.05, 0.05, 0.08, '#bba46a', { seg: 8 });
    // pegboard + tools on the east wall
    b.box(C.halfW - 0.1, 2.0, bz, 0.06, 1.5, 3.2, '#2b3036');
    for (let i = 0; i < 7; i++) b.box(C.halfW - 0.16, 2.1 + ((i % 3) - 1) * 0.3, bz - 1.2 + i * 0.4, 0.05, 0.38 - (i % 2) * 0.1, 0.06, ['#8a8f96', '#a2542c', '#6c7b84'][i % 3]);
    // misc props
    b.box(2.2, 0.35, 5.8, 1.4, 0.7, 0.8, '#434a52', { collide: true }); b.box(2.2, 0.75, 5.8, 1.5, 0.1, 0.9, '#2b3036');
    b.box(-3.2, 0.45, 6.2, 0.9, 0.9, 0.7, '#4a4234', { collide: true });
    b.box(-2.0, 0.015, -2.0, 1.4, 0.01, 1.0, '#101215', { rot: [0, 0.4, 0] });   // oil stain
    b.cyl(2.5, 0.02, 1.5, 0.35, 0.35, 0.02, '#14181c', { seg: 14 });             // drain
    // chains on the south wall
    for (let i = 0; i < 6; i++) b.box(-1.5 + i * 0.002, 3.6 - i * 0.22, C.halfD - 0.1, 0.05, 0.14, 0.03, '#6d727a');
    // cracked patch near the exit
    for (let i = 0; i < 6; i++) b.box(-4.5 + i * 0.1, 2.6 - i * 0.28, C.doorZ + 0.3, 0.04, 0.35, 0.02, '#090a0c', { rot: [0, 0, (i % 2 ? 0.4 : -0.35)] });
    // lamp fittings
    for (const [x, z] of [[-3, -2], [3.2, 0.5], [0.2, 4.2]]) { b.cyl(x, 4.1, z, 0.012, 0.012, 1.0, '#111', { seg: 4 }); b.cyl(x, 3.55, z, 0.22, 0.12, 0.16, '#2a2f36', { seg: 10 }); }
    group.add(b.build(solidMat, glowMat));
  }
  // bulbs (separate so they can flicker)
  for (const [x, z, colr, ph] of [[-3, -2, '#ffd9a0', 0], [3.2, 0.5, '#ffcf8a', 1.7], [0.2, 4.2, '#bcd8ff', 3.1]] as [number, number, string, number][]) {
    const m = new THREE.MeshBasicMaterial({ color: colr, toneMapped: false }); disposables.push(m);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), m); bulb.position.set(x, 3.43, z); group.add(bulb);
    flicker.push({ mat: m, base: new THREE.Color(colr), phase: ph });
  }
  // floor (concrete with stains and tape)
  {
    const tex = canvasTex(512, 512, (g, w, h) => {
      g.fillStyle = '#2a2e33'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 2600; i++) { const v = 30 + Math.random() * 28; g.fillStyle = `rgb(${v},${v + 2},${v + 5})`; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 1 + Math.random() * 3); }
      g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); }
      for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(10,10,12,${rnd(0.15, 0.35)})`; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, rnd(20, 70), rnd(14, 40), Math.random() * 3, 0, 7); g.fill(); }
    }, [3, 3]);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, metalness: 0.1 }); disposables.push(m, tex);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(14.5, 14.5), m); f.rotation.x = -Math.PI / 2; group.add(f);
  }
  // door
  const doorMat = new THREE.MeshStandardMaterial({ color: '#363c44', roughness: 0.5, metalness: 0.8 }); disposables.push(doorMat);
  const doorGroup = new THREE.Group(); doorGroup.position.set(0, 0, C.doorZ);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(C.doorHalf * 2, C.doorHeight, 0.3), doorMat); panel.position.y = C.doorHeight / 2; doorGroup.add(panel);
  const stripeMat = new THREE.MeshBasicMaterial({ color: '#c58a26', toneMapped: false }); disposables.push(stripeMat);
  for (let i = 0; i < 6; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.02), stripeMat); s.position.set(-1.4 + i * 0.56, 0.5 + (i % 2) * 0.06, 0.16); s.rotation.z = 0.5; doorGroup.add(s); }
  const lockMat = new THREE.MeshStandardMaterial({ color: '#23272d', roughness: 0.4, metalness: 0.9 }); disposables.push(lockMat);
  for (const y of [0.8, 1.7, 2.6]) { const bolt = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.2), lockMat); bolt.position.set(0, y, 0.2); doorGroup.add(bolt); }
  group.add(doorGroup);
  const lightMat = new THREE.MeshBasicMaterial({ color: '#ff2a2a', toneMapped: false }); disposables.push(lightMat);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.06), lightMat); l.position.set(s * (C.doorHalf + 0.28), 2.9, C.doorZ + 0.38); group.add(l); }
  const signTex = (open: boolean) => canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#0b0d10'; g.fillRect(0, 0, w, h); g.strokeStyle = open ? '#3cff8c' : '#ff3b3b'; g.lineWidth = 3; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = open ? '#3cff8c' : '#ff3b3b'; g.font = 'bold 30px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(open ? 'EXIT  OPEN' : 'EXIT SEALED', w / 2, h / 2 + 2);
  });
  const signSealed = signTex(false), signOpen = signTex(true);
  const signMat = new THREE.MeshBasicMaterial({ map: signSealed, toneMapped: false }); disposables.push(signMat, signSealed, signOpen);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.45), signMat); sign.position.set(0, 3.95, C.doorZ + 0.27); group.add(sign);
  const doorCollider: Collider = { minX: -C.doorHalf, maxX: C.doorHalf, minZ: C.doorZ - 0.3, maxZ: C.doorZ + 0.3, enabled: true }; colliders.push(doorCollider);
  const door = {
    collider: doorCollider,
    open: (u: number) => { doorGroup.position.y = u * (C.doorHeight + 0.15); doorCollider.enabled = u < 0.55; },
    setLights: (c: string) => lightMat.color.set(c),
    setSign: (open: boolean) => { signMat.map = open ? signOpen : signSealed; signMat.needsUpdate = true; },
  };

  // monitor on the bench
  const monCanvas = document.createElement('canvas'); monCanvas.width = 256; monCanvas.height = 160;
  const monTex = new THREE.CanvasTexture(monCanvas); monTex.colorSpace = THREE.SRGBColorSpace; disposables.push(monTex);
  const monitor = (n: number, ok: boolean) => {
    const g = monCanvas.getContext('2d')!; g.fillStyle = '#031014'; g.fillRect(0, 0, 256, 160);
    g.fillStyle = ok ? '#5fff9a' : '#38d8ff'; g.font = 'bold 15px monospace'; g.fillText('SHOCKWAVE GLOVE SG-01', 12, 24);
    g.fillStyle = '#7fb6c2'; g.font = '13px monospace'; g.fillText('FRAGMENTS  ' + n + ' / 3', 12, 56);
    for (let i = 0; i < 3; i++) { g.strokeStyle = '#38d8ff'; g.strokeRect(12 + i * 40, 70, 32, 18); if (i < n || ok) { g.fillStyle = ok ? '#5fff9a' : '#38d8ff'; g.fillRect(14 + i * 40, 72, 28, 14); } }
    g.fillStyle = ok ? '#5fff9a' : n >= 3 ? '#ffd24a' : '#ff5a4a'; g.font = 'bold 14px monospace';
    g.fillText(ok ? 'STATUS: ONLINE' : n >= 3 ? 'STATUS: READY TO ASSEMBLE' : 'STATUS: DAMAGED', 12, 124);
    monTex.needsUpdate = true;
  };
  monitor(0, false);
  const monMat = new THREE.MeshBasicMaterial({ map: monTex, toneMapped: false }); disposables.push(monMat);
  const monitorMesh = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.39), monMat); monitorMesh.position.set(CFG.bench.x + 0.2, CFG.bench.topY + 0.62, CFG.bench.z - 0.52); monitorMesh.rotation.x = -0.08; group.add(monitorMesh);
  const monFrame = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.47, 0.06), new THREE.MeshStandardMaterial({ color: '#15181c', roughness: 0.6 })); monFrame.position.copy(monitorMesh.position).add(new THREE.Vector3(0, 0, -0.04)); group.add(monFrame); disposables.push(monFrame.material as THREE.Material);
  const standMesh = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.06), monFrame.material as THREE.Material); standMesh.position.set(CFG.bench.x + 0.2, CFG.bench.topY + 0.2, CFG.bench.z - 0.52); group.add(standMesh);

  // bench guide ring
  const benchRing = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.02, 8, 40), new THREE.MeshBasicMaterial({ color: '#ffd24a', toneMapped: false })); disposables.push(benchRing.material as THREE.Material);
  benchRing.rotation.x = Math.PI / 2; benchRing.position.set(CFG.bench.x, CFG.bench.topY + 0.03, CFG.bench.z); benchRing.visible = false; group.add(benchRing);

  // =========================================================== TUNNEL
  {
    const b = new Batch(colliders);
    const len = T.zStart - (T.zEnd - 1.0), cz = (T.zStart + T.zEnd - 1.0) / 2;
    for (const s of [-1, 1]) {
      b.box(s * (T.halfW + 0.25), T.height / 2, cz, 0.5, T.height, len, '#2c3138', { collide: true });
      b.box(s * (T.halfW - 0.03), 0.5, cz, 0.06, 1.0, len, '#23272d');
      b.box(s * (T.halfW - 0.02), 1.02, cz, 0.08, 0.05, len, '#555b63');
    }
    b.box(0, T.height + 0.15, cz, T.halfW * 2 + 1.2, 0.3, len, '#191c21');
    for (let z = T.zStart - 1.5; z > T.zEnd; z -= 3) {
      const k = (T.zStart - z) / (T.zStart - T.zEnd); // 0 -> 1 toward the arena
      const rib = '#3b4148';
      for (const s of [-1, 1]) b.box(s * (T.halfW - 0.08), T.height / 2, z, 0.2, T.height, 0.34, rib);
      b.box(0, T.height - 0.1, z, T.halfW * 2, 0.2, 0.34, rib);
      const c = new THREE.Color('#38d8ff').lerp(new THREE.Color('#ff6a3a'), k).getStyle();
      for (const s of [-1, 1]) b.box(s * (T.halfW - 0.12), 0.18, z + 1.5, 0.06, 0.08, 2.2, c, { glow: true });
      if (Math.round((T.zStart - z) / 3) % 2 === 0) b.box(0, T.height - 0.24, z - 1.5, 0.5, 0.06, 1.6, '#e6f2ff', { glow: true });
    }
    b.cyl(-T.halfW + 0.25, T.height - 0.3, cz, 0.08, 0.08, len, '#4a3a34', { rot: [Math.PI / 2, 0, 0], seg: 8 });
    b.cyl(T.halfW - 0.25, T.height - 0.3, cz, 0.06, 0.06, len, '#3b5663', { rot: [Math.PI / 2, 0, 0], seg: 8 });
    group.add(b.build(solidMat, glowMat));
    const tex = canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#23272c'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 1500; i++) { const v = 24 + Math.random() * 20; g.fillStyle = `rgb(${v},${v},${v + 3})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = '#c58a26'; g.fillRect(w * 0.5 - 3, 0, 6, h);
      g.fillStyle = 'rgba(56,216,255,.55)'; g.beginPath(); g.moveTo(w * 0.5, 40); g.lineTo(w * 0.5 - 38, 120); g.lineTo(w * 0.5 - 14, 120); g.lineTo(w * 0.5 - 14, 190); g.lineTo(w * 0.5 + 14, 190); g.lineTo(w * 0.5 + 14, 120); g.lineTo(w * 0.5 + 38, 120); g.closePath(); g.fill();
    }, [1, 6]);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0.3 }); disposables.push(m, tex);
    const f = new THREE.Mesh(new THREE.PlaneGeometry(T.halfW * 2, len), m); f.rotation.x = -Math.PI / 2; f.position.set(0, 0.001, cz); group.add(f);
  }

  // =========================================================== ARENA
  const arenaGlowMats: THREE.MeshBasicMaterial[] = [];
  let rivalShaft!: THREE.Mesh;
  let wallCrack!: THREE.Mesh;
  {
    const tex = canvasTex(1024, 1024, (g, w, h) => {
      g.fillStyle = '#16191f'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { const v = 18 + Math.random() * 22; g.fillStyle = `rgb(${v},${v + 1},${v + 5})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      const cx = w / 2, cy = h / 2;
      const ring = (r: number, col: string, lw: number) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); };
      ring(500, 'rgba(255,106,58,.35)', 5); ring(470, 'rgba(255,255,255,.1)', 2); ring(300, 'rgba(56,216,255,.35)', 4); ring(180, 'rgba(255,255,255,.22)', 3); ring(150, 'rgba(255,74,58,.55)', 6);
      g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; for (let a = 0; a < 24; a++) { g.beginPath(); g.moveTo(cx + Math.cos(a / 24 * 6.283) * 150, cy + Math.sin(a / 24 * 6.283) * 150); g.lineTo(cx + Math.cos(a / 24 * 6.283) * 470, cy + Math.sin(a / 24 * 6.283) * 470); g.stroke(); }
      g.fillStyle = 'rgba(255,74,58,.16)'; g.beginPath(); for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; g.lineTo(cx + Math.cos(a) * 150, cy + Math.sin(a) * 150); g.lineTo(cx + Math.cos(a + 0.39) * 70, cy + Math.sin(a + 0.39) * 70); } g.closePath(); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.6)'; g.lineWidth = 3; for (let i = 0; i < 14; i++) { let x = cx + rnd(-300, 300), y = cy + rnd(-300, 300); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += rnd(-40, 40); y += rnd(-40, 40); g.lineTo(x, y); } g.stroke(); }
    });
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.4 }); disposables.push(m, tex);
    const f = new THREE.Mesh(new THREE.CircleGeometry(A.radius + 0.5, 72), m); f.rotation.x = -Math.PI / 2; f.position.set(A.cx, 0, A.cz); group.add(f);

    const b = new Batch(colliders);
    const N = 56, mouth = 0.115;
    for (let i = 0; i < N; i++) {
      const phi = (i / N) * Math.PI * 2; const d = Math.min(phi, Math.PI * 2 - phi);
      const x = A.cx + Math.sin(phi) * (A.radius + 1.2), z = A.cz + Math.cos(phi) * (A.radius + 1.2);
      const arc = (Math.PI * 2 * (A.radius + 1.2)) / N + 0.08;
      if (d > mouth) {
        b.box(x, A.wallHeight / 2, z, arc, A.wallHeight, 2.4, '#262a31', { rot: [0, phi, 0] });
        b.box(A.cx + Math.sin(phi) * (A.radius - 0.02), 1.1, A.cz + Math.cos(phi) * (A.radius - 0.02), arc, 0.5, 0.1, '#14171b', { rot: [0, phi, 0] });
        b.box(A.cx + Math.sin(phi) * (A.radius - 0.03), 7.2 + (i % 2) * 0.4, A.cz + Math.cos(phi) * (A.radius - 0.03), arc * 0.8, 0.07, 0.06, i % 3 === 0 ? '#ff6a3a' : '#38d8ff', { rot: [0, phi, 0], glow: true });
      }
      // upper tier
      const x2 = A.cx + Math.sin(phi) * (A.radius + 5), z2 = A.cz + Math.cos(phi) * (A.radius + 5);
      b.box(x2, 9 + (i % 3) * 0.6, z2, arc + 1.2, 18 + (i % 3) * 1.2, 4, '#1b1e24', { rot: [0, phi, 0] });
    }
    // pillars with glowing edges
    for (let i = 0; i < 10; i++) {
      const phi = ((i + 0.5) / 10) * Math.PI * 2; const x = A.cx + Math.sin(phi) * 25.5, z = A.cz + Math.cos(phi) * 25.5;
      b.box(x, 6, z, 1.3, 12, 1.3, '#2e333b', { collide: true, rot: [0, phi, 0] });
      b.box(x - Math.sin(phi) * 0.0, 6, z, 0.12, 11, 0.12, i % 2 ? '#ff6a3a' : '#38d8ff', { glow: true });
      b.box(x, 0.3, z, 1.8, 0.6, 1.8, '#1b1e23', { rot: [0, phi, 0] });
    }
    // hanging lamp rig
    for (let i = 0; i < 14; i++) {
      const phi = (i / 14) * Math.PI * 2; const r = 15 + (i % 2) * 6;
      const x = A.cx + Math.sin(phi) * r, z = A.cz + Math.cos(phi) * r;
      b.box(x, 14.2, z, 1.6, 0.25, 1.6, '#f0f6ff', { glow: true });
      b.cyl(x, 17, z, 0.02, 0.02, 6, '#0a0a0a', { seg: 4 });
    }
    // broken-concrete debris + cage barriers on the approach
    for (let i = 0; i < 18; i++) { const phi = Math.random() * Math.PI * 2, r = rnd(12, 27); b.box(A.cx + Math.sin(phi) * r, 0.15, A.cz + Math.cos(phi) * r, rnd(0.3, 0.9), rnd(0.2, 0.5), rnd(0.3, 0.8), '#2a2d33', { rot: [rnd(0, 1), rnd(0, 3), rnd(0, 1)] }); }
    group.add(b.build(solidMat, glowMat));

    // light shaft on the rival + hero marks
    const shaftMat = new THREE.MeshBasicMaterial({ color: '#cfe2ff', transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }); disposables.push(shaftMat);
    rivalShaft = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 4.2, 14, 24, 1, true), shaftMat); rivalShaft.position.set(CFG.rival.x, 7, CFG.rival.z); group.add(rivalShaft);
    arenaGlowMats.push(shaftMat);
    // crack decal for the finale
    const crackTex = canvasTex(512, 512, (g, w, h) => {
      g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(8,8,10,.95)'; g.lineWidth = 5; g.lineCap = 'round';
      for (let i = 0; i < 16; i++) { let x = w / 2, y = h / 2; const a = (i / 16) * Math.PI * 2 + rnd(-0.2, 0.2); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 9; k++) { const r = 24 + k * rnd(14, 26); x = w / 2 + Math.cos(a + rnd(-0.3, 0.3)) * r; y = h / 2 + Math.sin(a + rnd(-0.3, 0.3)) * r; g.lineTo(x, y); } g.stroke(); }
      const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 140); gr.addColorStop(0, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    const crackMat = new THREE.MeshBasicMaterial({ map: crackTex, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }); disposables.push(crackMat, crackTex);
    wallCrack = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), crackMat);
    wallCrack.position.set(A.cx, 5.5, A.cz - A.radius + 0.12); group.add(wallCrack);
  }

  const clampArena = (x: number, z: number) => {
    if (z > A.cz + A.radius - 0.4) return { x, z };          // still in the tunnel mouth: tunnel walls handle it
    const dx = x - A.cx, dz = z - A.cz; const d = Math.hypot(dx, dz); const max = A.radius - 0.9;
    if (d > max) return { x: A.cx + (dx / d) * max, z: A.cz + (dz / d) * max };
    return { x, z };
  };

  const update = (time: number) => {
    for (const f of flicker) {
      const k = 0.78 + 0.22 * Math.sin(time * 11 + f.phase) * Math.sin(time * 3.3 + f.phase * 2) + (Math.random() < 0.01 ? -0.45 : 0);
      f.mat.color.copy(f.base).multiplyScalar(Math.max(0.25, k));
    }
    benchRing.scale.setScalar(1 + Math.sin(time * 4) * 0.05);
  };

  return {
    group, colliders, door, flicker, benchRing, monitor,
    rivalShaft, wallCrack, arenaGlowMats, clampArena, update,
    dispose: () => {
      group.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      disposables.forEach((d) => d.dispose());
    },
  };
}
