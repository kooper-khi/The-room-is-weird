import * as THREE from 'three';

export type JointName =
  | 'hips' | 'torso' | 'head'
  | 'shoulderL' | 'shoulderR' | 'elbowL' | 'elbowR'
  | 'hipL' | 'hipR' | 'kneeL' | 'kneeR';

/** Degrees, [x, y, z]. `hipsY` lowers/raises the whole body. */
export type Pose = Partial<Record<JointName, [number, number, number]>> & { hipsY?: number };

const NODE: Record<JointName, string> = {
  hips: 'Hips', torso: 'Torso', head: 'Head',
  shoulderL: 'ShoulderL', shoulderR: 'ShoulderR', elbowL: 'ElbowL', elbowR: 'ElbowR',
  hipL: 'HipL', hipR: 'HipR', kneeL: 'KneeL', kneeR: 'KneeR',
};
const JOINTS = Object.keys(NODE) as JointName[];
const HIPS_BASE_Y = 0.96;
const D = Math.PI / 180;

/*
 * Rotation cheat-sheet (fighter faces +Z):
 *  shoulder x:  negative = arm swings FORWARD, positive = arm swings BACK. z: + outward for the left arm.
 *  elbow x:     negative = forearm bends forward/up.
 *  hip x:       negative = thigh lifts forward.   knee x: positive = shin folds back.
 *  torso y:     negative twists the right shoulder BACK (wind-up for the right fist).
 */
export const POSES: Record<string, Pose> = {
  idle: { hipsY: 0.96, shoulderL: [-4, 0, 7], shoulderR: [-4, 0, -7], elbowL: [-14, 0, 0], elbowR: [-14, 0, 0], torso: [2, 0, 0], head: [0, 0, 0] },
  crossed: { hipsY: 0.955, shoulderL: [-38, 0, -22], shoulderR: [-38, 0, 22], elbowL: [-112, 0, 0], elbowR: [-112, 0, 0], torso: [-2, 0, 0], head: [-4, 0, 0], hipL: [0, 0, 5], hipR: [0, 0, -5] },
  powerup: { hipsY: 0.88, shoulderL: [8, 0, 24], shoulderR: [8, 0, -24], elbowL: [-26, 0, 0], elbowR: [-26, 0, 0], torso: [10, 0, 0], head: [-16, 0, 0], hipL: [-4, 0, 16], hipR: [-4, 0, -16], kneeL: [12, 0, 0], kneeR: [12, 0, 0] },
  guard: { hipsY: 0.9, shoulderL: [-46, 0, 4], shoulderR: [-52, 0, -4], elbowL: [-96, 0, 0], elbowR: [-98, 0, 0], torso: [-6, -10, 0], head: [0, 0, 0], hipL: [-18, 0, 10], hipR: [10, 0, -10], kneeL: [28, 0, 0], kneeR: [22, 0, 0] },
  crouch: { hipsY: 0.58, shoulderL: [-30, 0, 8], shoulderR: [24, 0, -8], elbowL: [-80, 0, 0], elbowR: [-60, 0, 0], torso: [-30, -8, 0], head: [8, 0, 0], hipL: [-72, 0, 10], hipR: [-72, 0, -10], kneeL: [108, 0, 0], kneeR: [108, 0, 0] },
  leap: { hipsY: 0.96, shoulderL: [-70, 0, 4], shoulderR: [-30, 0, -6], elbowL: [-85, 0, 0], elbowR: [-70, 0, 0], torso: [-22, -6, 0], head: [8, 0, 0], hipL: [-62, 0, 6], hipR: [18, 0, -6], kneeL: [92, 0, 0], kneeR: [34, 0, 0] },
  windup: { hipsY: 0.96, shoulderL: [-84, 0, 6], shoulderR: [108, 0, -14], elbowL: [-76, 0, 0], elbowR: [-8, 0, 0], torso: [-18, -42, 0], head: [6, 22, 0], hipL: [-52, 0, 8], hipR: [26, 0, -8], kneeL: [72, 0, 0], kneeR: [34, 0, 0] },
  strike: { hipsY: 0.96, shoulderL: [34, 0, 12], shoulderR: [-96, 0, -4], elbowL: [-62, 0, 0], elbowR: [-3, 0, 0], torso: [-20, 36, 0], head: [8, -14, 0], hipL: [-48, 0, 8], hipR: [30, 0, -8], kneeL: [78, 0, 0], kneeR: [38, 0, 0] },
  hit: { hipsY: 0.96, shoulderL: [48, 0, 78], shoulderR: [40, 0, -82], elbowL: [-24, 0, 0], elbowR: [-24, 0, 0], torso: [34, 6, 0], head: [38, 14, 8], hipL: [24, 0, 12], hipR: [32, 0, -12], kneeL: [26, 0, 0], kneeR: [10, 0, 0] },
  land: { hipsY: 0.64, shoulderL: [-20, 0, 18], shoulderR: [-10, 0, -18], elbowL: [-40, 0, 0], elbowR: [-30, 0, 0], torso: [-26, 0, 0], head: [10, 0, 0], hipL: [-66, 0, 12], hipR: [-66, 0, -12], kneeL: [100, 0, 0], kneeR: [100, 0, 0] },
  victory: { hipsY: 0.94, shoulderL: [-6, 0, 10], shoulderR: [-142, 0, -8], elbowL: [-18, 0, 0], elbowR: [-6, 0, 0], torso: [6, 0, 0], head: [-10, 0, 0], hipL: [-4, 0, 6], hipR: [4, 0, -6] },
};

export class Fighter {
  readonly root: THREE.Group;
  readonly joints = {} as Record<JointName, THREE.Object3D>;
  readonly eyes: THREE.Mesh[] = [];
  readonly spikes: THREE.Object3D[] = [];
  readonly materials: THREE.MeshStandardMaterial[] = [];
  readonly hand: THREE.Object3D | null;
  /** Meshes' original emissive (for restoring after a power-up glow). */
  private baseEmissive = new Map<THREE.MeshStandardMaterial, { c: THREE.Color; i: number }>();
  private tmp = new THREE.Euler();

  constructor(scene: THREE.Object3D) {
    this.root = new THREE.Group();
    this.root.add(scene);
    for (const j of JOINTS) {
      const n = scene.getObjectByName(NODE[j]);
      if (!n) throw new Error(`Fighter model is missing joint ${NODE[j]}`);
      this.joints[j] = n;
    }
    this.hand = scene.getObjectByName('HandR') ?? null;
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (o.name === 'EyeL' || o.name === 'EyeR') this.eyes.push(o);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m instanceof THREE.MeshStandardMaterial && !this.materials.includes(m)) { this.materials.push(m); this.baseEmissive.set(m, { c: m.emissive.clone(), i: m.emissiveIntensity }); } });
        o.frustumCulled = true;
      }
      if (o.name.startsWith('HairSpike')) this.spikes.push(o);
    });
    this.spikes.forEach((s) => s.userData.baseScale = s.scale.clone());
  }

  /** Blend two named poses (b optional). k = 0..1 */
  pose(a: Pose, b?: Pose, k = 0) {
    const kk = THREE.MathUtils.clamp(k, 0, 1);
    for (const j of JOINTS) {
      const pa = a[j] ?? [0, 0, 0]; const pb = b ? (b[j] ?? [0, 0, 0]) : pa;
      this.tmp.set(
        THREE.MathUtils.lerp(pa[0], pb[0], kk) * D,
        THREE.MathUtils.lerp(pa[1], pb[1], kk) * D,
        THREE.MathUtils.lerp(pa[2], pb[2], kk) * D,
      );
      this.joints[j].rotation.copy(this.tmp);
    }
    const ya = a.hipsY ?? HIPS_BASE_Y; const yb = b ? (b.hipsY ?? HIPS_BASE_Y) : ya;
    this.joints.hips.position.y = THREE.MathUtils.lerp(ya, yb, kk);
  }

  /** Add a tinted emissive glow to the whole body (power-up). 0 = off. */
  glow(color: THREE.ColorRepresentation, amount: number) {
    const c = new THREE.Color(color);
    for (const m of this.materials) {
      const base = this.baseEmissive.get(m)!;
      m.emissive.copy(base.c).lerp(c, Math.min(1, amount)); m.emissiveIntensity = base.i + amount * 0.7;
    }
  }

  eyeGlow(amount: number, color: THREE.ColorRepresentation) {
    for (const e of this.eyes) { const m = e.material as THREE.MeshStandardMaterial; m.emissive.set(color); m.emissiveIntensity = amount * 3; m.color.set(amount > 0.05 ? color : '#f4f4f4'); }
  }

  flare(amount: number) { for (const s of this.spikes) { const b = s.userData.baseScale as THREE.Vector3; s.scale.set(b.x * (1 + amount * 0.5), b.y * (1 + amount * 1.2), b.z * (1 + amount * 0.5)); } }

  worldPos(joint: JointName | 'root', out = new THREE.Vector3()) { (joint === 'root' ? this.root : this.joints[joint]).getWorldPosition(out); return out; }

  dispose() {
    this.root.traverse((o) => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); } });
    this.materials.forEach((m) => m.dispose());
  }
}

/** Clone a loaded GLTF scene so each use has its own materials (so tinting one never affects another). */
export function cloneWithMaterials(src: THREE.Object3D): THREE.Object3D {
  const c = src.clone(true);
  const cache = new Map<THREE.Material, THREE.Material>();
  c.traverse((o) => {
    if (o instanceof THREE.Mesh) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const out: THREE.Material[] = mats.map((m) => { const hit = cache.get(m); if (hit) return hit; const n = m.clone(); cache.set(m, n); return n; });
      o.material = Array.isArray(o.material) ? out : out[0];
    }
  });
  return c;
}
