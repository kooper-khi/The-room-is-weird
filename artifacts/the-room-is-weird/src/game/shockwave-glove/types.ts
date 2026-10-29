import type * as THREE from 'three';
import type { Env } from './environment';
import type { Fighter } from './fighters';
import type { Aura, Dragon, Lightning, Particles, RingFx } from './fx';
import type { LevelSfx } from './sfx';
import type { FragmentId } from './levelConfig';

export interface GloveRig {
  group: THREE.Group;                       // positioned/rotated by the level
  model: THREE.Object3D;
  parts: Record<FragmentId, THREE.Object3D>;
  sockets: Record<FragmentId, THREE.Object3D>;
  fistTip: THREE.Object3D;
  debris: THREE.Object3D;
  /** 0 = broken & dark, 1 = fully repaired & glowing. */
  setPower: (amount: number) => void;
  setRepaired: (repaired: boolean) => void;
}

export interface CamState {
  pos: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  roll: number;   // radians
  shake: number;  // 0..1.5
}

export interface Ctx {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  cam: CamState;
  env: Env;
  sfx: LevelSfx;
  fx: { sparks: Particles; dust: Particles; embers: Particles; rings: RingFx; boltCyan: Lightning; boltRed: Lightning };
  lights: { warm: THREE.PointLight; fill: THREE.PointLight; hero: THREE.PointLight; rival: THREE.PointLight };
  hero: Fighter;
  rival: Fighter;
  benchGlove: GloveRig;
  heroGlove: GloveRig;
  viewGlove: GloveRig;
  viewRig: THREE.Group;
  dragons: { hero: Dragon; rival: Dragon };
  auras: { hero: Aura; rival: Aura };
  inventory: Partial<Record<FragmentId, THREE.Object3D>>;
  player: { x: number; z: number; yaw: number; pitch: number };
  state: { fxScale: number; time: number; gloveOn: boolean; fogBoost: number };
  ui: {
    flash: (alpha: number, color?: string) => void;
    invert: () => void;
    speed: (a: number) => void;
    bars: (on: boolean) => void;
    caption: (text: string, sub?: string) => void;
    nameCard: (on: boolean) => void;
    objective: (text: string) => void;
    toast: (text: string) => void;
    win: () => void;
  };
  once: (key: string, fn: () => void) => void;
  onRepairDone: () => void;
}

export type Shot = { dur: number; enter?: () => void; run: (u: number, t: number, dt: number) => void };

export class Timeline {
  private i = -1; private t = 0; done = false;
  constructor(private shots: Shot[], private onDone: () => void) {}
  get index() { return this.i; }
  update(dt: number) {
    if (this.done) return;
    if (this.i < 0) { this.i = 0; this.t = 0; this.shots[0].enter?.(); }
    let shot = this.shots[this.i];
    this.t += dt;
    while (this.t >= shot.dur) {
      shot.run(1, shot.dur, 0);
      this.t -= shot.dur; this.i++;
      if (this.i >= this.shots.length) { this.done = true; this.onDone(); return; }
      shot = this.shots[this.i]; shot.enter?.();
    }
    shot.run(this.t / shot.dur, this.t, dt);
  }
}
