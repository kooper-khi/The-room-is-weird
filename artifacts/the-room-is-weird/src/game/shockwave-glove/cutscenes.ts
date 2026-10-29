import * as THREE from 'three';
import { CFG, type FragmentId } from './levelConfig';
import { ease } from './fx';
import { POSES, type Pose } from './fighters';
import { Timeline, type Ctx, type Shot } from './types';

const V = THREE.Vector3;
const v = (x: number, y: number, z: number) => new V(x, y, z);
const lerp = THREE.MathUtils.lerp;
const CYAN = new THREE.Color('#38d8ff');
const ICE = new THREE.Color('#bff6ff');
const WHITE = new THREE.Color('#ffffff');
const RED = new THREE.Color('#ff4a3a');
const ORANGE = new THREE.Color('#ff9a3c');

type CamKey = { p: [number, number, number]; l: [number, number, number]; f: number; r?: number };
function camLerp(c: Ctx, a: CamKey, b: CamKey, k: number) {
  c.cam.pos.set(lerp(a.p[0], b.p[0], k), lerp(a.p[1], b.p[1], k), lerp(a.p[2], b.p[2], k));
  c.cam.look.set(lerp(a.l[0], b.l[0], k), lerp(a.l[1], b.l[1], k), lerp(a.l[2], b.l[2], k));
  c.cam.fov = lerp(a.f, b.f, k); c.cam.roll = lerp(a.r ?? 0, b.r ?? 0, k) * (Math.PI / 180);
}
const rv = (s: number) => v((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);

// =====================================================================================
//  1) REPAIR + DOOR
// =====================================================================================
export function buildRepairTimeline(c: Ctx): Timeline {
  const B = CFG.bench;
  const A: CamKey = { p: [3.55, 1.95, -1.85], l: [B.x - 0.1, B.topY + 0.22, B.z], f: 50 };
  const B2: CamKey = { p: [4.05, 1.5, -2.7], l: [B.x - 0.05, B.topY + 0.22, B.z], f: 42 };
  const ids: FragmentId[] = ['core', 'plate', 'cell'];
  const flights = ids.map((id, i) => ({ id, t0: 0.55 + i * 1.25, dur: 0.95, from: new V(), mesh: c.inventory[id] }));
  const g = c.benchGlove;
  const startP = new V(), startL = new V(), tmp = new V(), tmp2 = new V();
  const baseY = B.topY + 0.19;
  let arrived = 0, kick = 0, bump = 0, spin = 0, ringT = 0, orbit0 = 0, spinFrom = 0;
  g.group.rotation.order = 'YZX';

  const arrive = (i: number) => {
    const f = flights[i];
    const p = g.sockets[f.id].getWorldPosition(new V());
    if (f.mesh) f.mesh.visible = false;
    g.parts[f.id].visible = true; arrived++;
    c.fx.sparks.burst(p, 46, 4.2, 0.9, CYAN, 1); c.fx.sparks.burst(p, 22, 2.6, 0.6, WHITE, 1);
    c.fx.rings.spawn(p, v(0, 1, 0), '#7defff', 1.5, 0.6); c.fx.rings.spawn(p, v(1, 0, 0), '#ffffff', 1.0, 0.45);
    c.sfx.zap(); c.sfx.clank(); kick = 0.55; bump = 1; c.ui.flash(0.3, '#bff6ff');
    c.env.monitor(arrived, false); g.setPower(0.12 + arrived * 0.16);
    c.ui.toast(arrived < 3 ? `${arrived} / 3 parts fitted` : 'All parts fitted');
  };

  const shots: Shot[] = [
    { // glide to the bench
      dur: 1.5,
      enter() { c.ui.bars(true); c.ui.objective('Repair the glove'); startP.copy(c.camera.position); c.camera.getWorldDirection(tmp); startL.copy(c.camera.position).addScaledVector(tmp, 5); c.sfx.interact(); c.env.benchRing.visible = false; },
      run(u) { const k = ease.io(u); c.cam.pos.lerpVectors(startP, v(...A.p), k); c.cam.look.lerpVectors(startL, v(...A.l), k); c.cam.fov = lerp(72, A.f, k); c.cam.roll = 0; c.cam.shake = 0; },
    },
    { // fragments fly in and snap on
      dur: 4.6,
      enter() { for (const f of flights) if (f.mesh) { f.mesh.visible = false; c.scene.add(f.mesh); } },
      run(u, t, dt) {
        camLerp(c, A, B2, ease.io(u));
        kick = Math.max(0, kick - dt * 2); bump = Math.max(0, bump - dt * 2.2);
        c.cam.shake = kick;
        c.lights.fill.position.set(B.x, B.topY + 0.6, B.z); c.lights.fill.color.set('#7defff'); c.lights.fill.intensity = bump * 26;
        flights.forEach((f, i) => {
          const l = (t - f.t0) / f.dur;
          if (!f.mesh) { if (l >= 1) c.once('arrive' + i, () => arrive(i)); return; }
          if (l >= 0 && l < 1) {
            c.once('fly' + i, () => { f.from.copy(c.cam.pos).add(v((i - 1) * 0.55, -0.45, 0)); f.mesh!.visible = true; c.sfx.whoosh(0.5, 0.16); });
            const sock = g.sockets[f.id].getWorldPosition(tmp2);
            const k = ease.io(l);
            f.mesh.position.lerpVectors(f.from, sock, k); f.mesh.position.y += Math.sin(Math.PI * l) * 0.55;
            f.mesh.rotation.y += dt * 9; f.mesh.rotation.x += dt * 5; f.mesh.scale.setScalar(lerp(2.2, 1.5, k));
            c.fx.sparks.emit(f.mesh.position, rv(0.8), 0.35, CYAN);
          } else if (l >= 1) c.once('arrive' + i, () => arrive(i));
        });
      },
    },
    { // power-up: debris falls away, glove lifts and spins
      dur: 2.7,
      enter() {
        g.debris.visible = false; g.setRepaired(true); c.ui.flash(0.85, '#bff6ff'); c.sfx.powerUp(); c.env.monitor(3, true); c.env.benchRing.visible = false;
        spin = g.group.rotation.y; c.fx.boltCyan.active = true; ringT = 0;
        orbit0 = Math.atan2(B2.p[0] - B.x, B2.p[2] - B.z); kick = 0.4;
      },
      run(u, t, dt) {
        g.setPower(lerp(0.5, 1.25, ease.io(u)));
        spin += dt * (1.2 + u * 3.5);
        g.group.rotation.set(0, spin, -Math.PI / 2); g.group.position.set(B.x, baseY + ease.io(u) * 0.42, B.z);
        const gp = g.group.position;
        const a = orbit0 + u * 0.9;
        c.cam.pos.set(gp.x + Math.sin(a) * 1.45, gp.y + 0.45 + u * 0.15, gp.z + Math.cos(a) * 1.45); c.cam.look.set(gp.x, gp.y, gp.z); c.cam.fov = lerp(42, 36, u); c.cam.roll = 0;
        kick = Math.max(0, kick - dt * 1.4); c.cam.shake = 0.12 + kick;
        ringT += dt; if (ringT > 0.4) { ringT = 0; c.fx.rings.spawn(gp, v(0, 1, 0), '#7defff', 2.4, 0.9); c.fx.sparks.burst(gp, 12, 2.2, 0.7, CYAN, 1); }
        c.fx.boltCyan.origin.copy(gp); c.fx.boltCyan.radius = 0.9; c.fx.boltCyan.height = 0.7; c.fx.boltCyan.strength = 0.8;
        c.lights.fill.position.set(gp.x, gp.y + 0.3, gp.z); c.lights.fill.intensity = 16 + Math.sin(t * 14) * 4;
        if (u > 0.3) c.once('cap1', () => c.ui.caption('SHOCKWAVE GLOVE', 'ONLINE'));
      },
    },
    { // test-fire, then the glove slides onto the player's hand
      dur: 1.9,
      enter() { c.ui.caption('', ''); spinFrom = spin % (Math.PI * 2); },
      run(u, t, dt) {
        const gp = g.group.position;
        const k = ease.io(Math.min(1, u / 0.3));
        spin = lerp(spinFrom, -Math.PI / 2, k);
        g.group.rotation.set(0, spin, -Math.PI / 2);
        kick = Math.max(0, kick - dt * 1.5); c.cam.shake = kick;
        if (u > 0.35) c.once('fire', () => {
          c.fx.rings.spawn(gp, v(0, 1, 0), '#bff6ff', 17, 1.0); c.fx.rings.spawn(gp, v(0, 0, 1), '#ffffff', 9, 0.8); c.fx.rings.spawn(gp, v(0, 1, 0), '#38d8ff', 11, 1.3);
          c.ui.flash(0.9, '#ffffff'); kick = 1.2; c.sfx.boom(0.7); c.sfx.whoosh(0.9, 0.35);
          for (let i = 0; i < 70; i++) c.fx.dust.emit(v(rnd(-6, 6), 4.4, rnd(-6, 6)), v(0, -rnd(0.5, 2), 0), rnd(1.5, 3), new THREE.Color('#9aa3ad'), 0.5);
          c.fx.sparks.burst(gp, 60, 7, 1, ICE, 1);
        });
        if (u > 0.62) {
          const kk = ease.io((u - 0.62) / 0.38);
          tmp.copy(c.cam.pos).sub(gp); const target = tmp2.copy(c.cam.pos).add(c.cam.look.clone().sub(c.cam.pos).normalize().multiplyScalar(0.4)).add(v(0.1, -0.25, 0));
          gp.lerp(target, kk * 0.35 + 0.0); g.group.scale.setScalar(lerp(1.5, 0.5, kk));
        }
        c.fx.boltCyan.origin.copy(gp);
        if (u > 0.93) c.once('wear', () => { c.fx.boltCyan.active = false; g.group.visible = false; c.state.gloveOn = true; c.ui.flash(0.9, '#bff6ff'); c.sfx.pickup(); c.ui.toast('The glove is on.'); });
      },
    },
    { // the door
      dur: 6.2,
      enter() {
        c.player.x = 0; c.player.z = -1.2; c.player.yaw = 0; c.player.pitch = 0; c.ui.objective('Go through the door');
        c.lights.fill.position.set(0, 2.2, -8.2); c.lights.fill.color.set('#38d8ff'); c.lights.fill.intensity = 0; kick = 0;
      },
      run(u, t, dt) {
        const eye = CFG.eyeHeight;
        const fin = ease.io(Math.max(0, (t - 5.2) / 1.0));
        c.cam.pos.set(0, eye, -1.2); c.cam.look.set(0, lerp(2.15, eye, fin), lerp(-7.25, -9, fin)); c.cam.fov = lerp(58, 72, fin); c.cam.roll = 0;
        kick = Math.max(0, kick - dt * 1.6);
        if (t > 0.4) c.once('b1', () => { c.sfx.lockBeep(); c.env.door.setLights('#ff2a2a'); });
        if (t > 0.65) c.once('b1o', () => c.env.door.setLights('#500000'));
        if (t > 0.9) c.once('b2', () => { c.sfx.lockBeep(); c.env.door.setLights('#ff2a2a'); });
        if (t > 1.15) c.once('b2o', () => c.env.door.setLights('#500000'));
        if (t > 1.4) c.once('b3', () => { c.sfx.lockBeep(true); c.env.door.setLights('#ffb14a'); });
        if (t > 1.9) c.once('bolts', () => { c.sfx.clank(); c.sfx.clank(); kick = 0.6; c.fx.sparks.burst(v(0, 1.7, -7), 30, 3, 0.7, ORANGE, 1); });
        const o = ease.io(Math.min(1, Math.max(0, (t - 2.5) / 2.7)));
        if (t > 2.5) c.once('rumble', () => { c.sfx.doorRumble(2.8); c.env.door.setSign(true); });
        c.env.door.open(o);
        if (o > 0 && o < 1) {
          kick = Math.max(kick, 0.22);
          for (let i = 0; i < 3; i++) c.fx.dust.emit(v(rnd(-1.7, 1.7), 0.1, -6.9), v(rnd(-0.3, 0.3), rnd(0.4, 1.4), rnd(0.2, 0.8)), rnd(1.4, 2.4), new THREE.Color('#aab4bf'), 0.45);
        }
        c.lights.fill.intensity = o * 38;
        if (t > 5.3) c.once('open', () => { c.env.door.setLights('#3cff8c'); c.sfx.lockBeep(true); c.ui.toast('The way is open.'); });
        c.cam.shake = kick;
      },
    },
  ];
  return new Timeline(shots, () => { c.ui.bars(false); c.cam.shake = 0; c.onRepairDone(); });
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

// =====================================================================================
//  2) THE DUEL
// =====================================================================================
export function buildDuelTimeline(c: Ctx): Timeline {
  const H0 = v(CFG.hero.x, 0, CFG.hero.z), R0 = v(CFG.rival.x, 0, CFG.rival.z);
  const RS = 1.1;
  c.rival.root.scale.setScalar(RS);

  // ---- work out exactly where the two bodies must be so the fist lands on the face
  c.hero.root.position.set(0, 0, 0); c.hero.root.rotation.set(0, Math.PI, 0); c.hero.pose(POSES.strike); c.hero.root.updateMatrixWorld(true);
  const fistRel = c.heroGlove.fistTip.getWorldPosition(new V());
  c.rival.root.position.set(0, 0, 0); c.rival.root.rotation.set(0, 0, 0); c.rival.pose(POSES.windup); c.rival.root.updateMatrixWorld(true);
  const skullRel = (c.rival.root.getObjectByName('skull') as THREE.Object3D).getWorldPosition(new V());
  const heroEnd = v(-0.12, 3.4, -60.8);
  const fistEnd = fistRel.clone().add(heroEnd);
  const rivalEnd = fistEnd.clone().add(v(0, 0, -0.2)).sub(skullRel);
  const impactPoint = fistEnd.clone().add(v(0, 0, -0.1));
  const wallHit = v(0, 5.4, CFG.arena.cz - CFG.arena.radius + 1.6);
  c.hero.pose(POSES.idle); c.rival.pose(POSES.crossed);

  let kick = 0, ringT = 0, aT = 0, heroAmt = 0, rivalAmt = 0, launchFrom = new V();
  const heroFist = new V(), rivalFist = new V(), mid = new V(), tmp = new V();

  const place = (gp: number) => {
    const h = 0.75 * gp + 0.25 * (1 - Math.pow(1 - gp, 2));
    const y = 1 - Math.pow(1 - gp, 2.4);
    c.hero.root.position.set(lerp(H0.x, heroEnd.x, h), heroEnd.y * y, lerp(H0.z, heroEnd.z, h));
    c.rival.root.position.set(lerp(R0.x, rivalEnd.x, h), rivalEnd.y * y, lerp(R0.z, rivalEnd.z, h));
  };
  const blendPose = (who: 'hero' | 'rival', gp: number) => {
    const f = c[who]; const lag = who === 'rival' ? 0.5 : 1;
    let a: Pose = POSES.leap, b: Pose | undefined; let k = 0;
    if (gp < 0.1) { a = POSES.crouch; b = POSES.leap; k = gp / 0.1; }
    else if (gp < 0.4) { a = POSES.leap; }
    else if (gp < 0.58) { a = POSES.leap; b = POSES.windup; k = (gp - 0.4) / 0.18; }
    else if (gp < 0.84) { a = POSES.windup; }
    else { a = POSES.windup; b = POSES.strike; k = ((gp - 0.84) / 0.16) * lag; }
    f.pose(a, b, ease.io(k));
  };
  const updateDragons = (dt: number, grow: number, alpha = 1) => {
    c.hero.root.updateMatrixWorld(true); c.rival.root.updateMatrixWorld(true);
    c.heroGlove.fistTip.getWorldPosition(heroFist); (c.rival.hand ?? c.rival.root).getWorldPosition(rivalFist);
    const ddt = dt * Math.max(0.3, c.state.fxScale);
    c.dragons.hero.update(ddt, heroFist, v(0, 0, -1), grow, alpha); c.dragons.rival.update(ddt, rivalFist, v(0, 0, 1), grow, alpha);
  };
  const lights = () => {
    c.lights.hero.position.copy(c.hero.root.position).add(v(1.2, 2.2, 1.2)); c.lights.rival.position.copy(c.rival.root.position).add(v(-1.2, 2.4, -1.2));
  };
  const auras = (dt: number) => {
    aT += dt;
    c.auras.hero.group.position.copy(c.hero.root.position); c.auras.rival.group.position.copy(c.rival.root.position);
    c.auras.hero.update(aT, heroAmt); c.auras.rival.update(aT, rivalAmt);
  };
  const rivalPower = (amt: number, dt: number) => {
    rivalAmt = amt;
    c.rival.glow('#ff3a1a', amt * 0.8); c.rival.eyeGlow(Math.min(1, amt * 1.6), '#ff3b2a'); c.rival.flare(amt);
    c.lights.rival.intensity = amt * 55; c.lights.rival.color.set('#ff4a2a'); c.lights.rival.position.set(0, 2.4, R0.z + 1.4);
    c.fx.boltRed.active = amt > 0.25; c.fx.boltRed.origin.set(R0.x, 0.2, R0.z); c.fx.boltRed.radius = 1.3 + amt; c.fx.boltRed.height = 2.6; c.fx.boltRed.strength = amt;
    const n = Math.floor(amt * 5);
    for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, r = rnd(0.2, 1.1); c.fx.embers.emit(v(R0.x + Math.cos(a) * r, 0.05, R0.z + Math.sin(a) * r), v(rnd(-0.4, 0.4), rnd(2, 5.5), rnd(-0.4, 0.4)), rnd(1, 2), Math.random() < 0.5 ? RED : ORANGE, 1.2); }
    ringT += dt; if (amt > 0.15 && ringT > lerp(0.7, 0.3, amt)) { ringT = 0; c.fx.rings.spawn(v(R0.x, 0.06, R0.z), v(0, 1, 0), '#ff4a3a', lerp(3, 8, amt), 0.9); }
  };

  const shots: Shot[] = [
    { // 0 — walk to the mark
      dur: 1.4,
      enter() { c.ui.bars(true); c.ui.objective(''); c.hero.root.visible = false; c.sfx.stopAmbience(); c.sfx.startAmbience('arena'); c.hero.root.position.copy(H0); c.hero.root.rotation.set(0, Math.PI, 0); c.hero.pose(POSES.idle); c.rival.root.position.copy(R0); c.rival.root.rotation.set(0, 0, 0); c.rival.pose(POSES.crossed); },
      run(u) {
        const k = ease.io(u);
        c.player.x = lerp(c.player.x, H0.x, k * 0.2); c.player.z = lerp(c.player.z, H0.z, Math.min(1, k * 0.2 + 0.03));
        c.cam.pos.set(c.player.x, CFG.eyeHeight, c.player.z); c.cam.look.set(0, 1.5, R0.z); c.cam.fov = lerp(72, 62, k); c.cam.roll = 0; c.cam.shake = 0;
      },
    },
    { // 1 — boots, cracks, dust
      dur: 2.4,
      enter() { c.sfx.charge(7.5); c.sfx.heartbeat(); },
      run(u, t, dt) {
        camLerp(c, { p: [1.7, 0.22, -66.3], l: [0, 0.25, R0.z], f: 58, r: -4 }, { p: [0.75, 0.95, -67.6], l: [0, 1.25, R0.z], f: 46, r: 2 }, ease.io(u));
        rivalPower(lerp(0.1, 0.4, u), dt); c.cam.shake = 0.05 + u * 0.25;
        if (t > 0.1) c.once('nm', () => c.ui.nameCard(true));
        if (t > 1.1) c.once('hb2', () => c.sfx.heartbeat());
        for (let i = 0; i < 2; i++) c.fx.dust.emit(v(R0.x + rnd(-1.5, 1.5), 0.05, R0.z + rnd(-1.5, 1.5)), v(rnd(-0.3, 0.3), rnd(0.2, 0.9), rnd(-0.3, 0.3)), rnd(1.5, 2.5), new THREE.Color('#8a8f98'), 0.45);
        auras(dt); lights();
      },
    },
    { // 2 — face close-up, eyes ignite
      dur: 2.5,
      enter() { c.sfx.heartbeat(); },
      run(u, t, dt) {
        camLerp(c, { p: [0.55, 1.93, -68.0], l: [0, 1.93, R0.z], f: 40, r: -3 }, { p: [0.22, 1.95, -68.85], l: [0, 1.95, R0.z], f: 28, r: 4 }, ease.io(u));
        rivalPower(lerp(0.4, 0.85, ease.io(u)), dt); c.cam.shake = 0.3 + u * 0.5;
        const k = ease.io(Math.max(0, (u - 0.5) / 0.3)); c.rival.pose(POSES.crossed, POSES.powerup, k);
        if (t > 1.0) c.once('hb3', () => c.sfx.heartbeat());
        if (t > 1.6) c.once('pu', () => c.sfx.powerUp());
        auras(dt); lights();
      },
    },
    { // 3 — orbit the powered-up rival
      dur: 1.6,
      enter() { c.ui.nameCard(false); },
      run(u, t, dt) {
        const a = lerp(-0.9, 0.3, ease.io(u)); const r = lerp(5.2, 4.4, u);
        c.cam.pos.set(R0.x + Math.sin(a) * r, lerp(1.0, 2.1, u), R0.z + Math.cos(a) * r); c.cam.look.set(0, 1.35, R0.z); c.cam.fov = 52; c.cam.roll = lerp(-4, 3, u) * (Math.PI / 180);
        rivalPower(lerp(0.85, 1, u), dt); c.cam.shake = 0.7; c.rival.pose(POSES.powerup); c.rival.root.position.y = 0;
        auras(dt); lights();
      },
    },
    { // 4 — burst, then pull back to reveal them both
      dur: 1.5,
      enter() {
        c.ui.flash(1, '#ffffff'); c.sfx.boom(0.9); c.sfx.whoosh(1.0, 0.35); kick = 1.4;
        c.fx.rings.spawn(v(R0.x, 0.08, R0.z), v(0, 1, 0), '#ff6a3a', 34, 1.4); c.fx.rings.spawn(v(R0.x, 0.1, R0.z), v(0, 1, 0), '#ffffff', 20, 1.0); c.fx.rings.spawn(v(R0.x, 1.4, R0.z), v(0, 0, 1), '#ff4a3a', 14, 0.9);
        c.fx.embers.burst(v(R0.x, 1, R0.z), 120, 12, 1.8, ORANGE, 1);
        c.hero.root.visible = true; c.hero.root.position.copy(H0); c.hero.pose(POSES.idle); c.heroGlove.setPower(1);
      },
      run(u, t, dt) {
        camLerp(c, { p: [0.5, 1.9, -67.8], l: [0, 1.9, R0.z], f: 70, r: 0 }, { p: [18, 3.4, -62], l: [0, 2.2, -62], f: 46, r: 0 }, ease.io(u));
        kick = Math.max(0, kick - dt * 1.2); c.cam.shake = kick;
        rivalPower(1, dt); c.rival.pose(POSES.powerup, POSES.guard, ease.io(u));
        c.hero.pose(POSES.idle, POSES.guard, ease.io(Math.max(0, u - 0.4) / 0.6));
        auras(dt); lights();
      },
    },
    { // 5 — face-off
      dur: 1.7,
      enter() { c.sfx.heartbeat(); },
      run(u, t, dt) {
        camLerp(c, { p: [18, 3.4, -62], l: [0, 2.2, -62], f: 46 }, { p: [15.5, 2.6, -62], l: [0, 2.0, -62], f: 42 }, ease.io(u));
        c.cam.shake = 0.12; heroAmt = ease.io(u) * 0.6;
        c.heroGlove.setPower(1 + u * 0.8); c.hero.eyeGlow(u, '#38d8ff'); c.hero.glow('#38d8ff', u * 0.35);
        c.lights.hero.intensity = u * 36; c.lights.hero.color.set('#38d8ff');
        rivalPower(1, dt);
        if (Math.random() < 0.5) c.fx.sparks.emit(c.heroGlove.fistTip.getWorldPosition(tmp), rv(2), 0.6, CYAN);
        c.hero.pose(POSES.guard); c.rival.pose(POSES.guard);
        auras(dt); lights();
        if (t > 0.9) c.once('hb4', () => c.sfx.heartbeat());
      },
    },
    { // 6 — crouch
      dur: 1.1,
      enter() { c.fx.rings.spawn(v(0, 0.08, H0.z), v(0, 1, 0), '#38d8ff', 5, 0.8); c.fx.rings.spawn(v(0, 0.08, R0.z), v(0, 1, 0), '#ff4a3a', 5, 0.8); c.sfx.whoosh(0.9, 0.3); },
      run(u, t, dt) {
        camLerp(c, { p: [15.5, 2.6, -62], l: [0, 2.0, -62], f: 42 }, { p: [11.5, 1.1, -62], l: [0, 1.5, -62], f: 38, r: 3 }, ease.io(u));
        const k = ease.io(Math.min(1, u / 0.85));
        c.hero.pose(POSES.guard, POSES.crouch, k); c.rival.pose(POSES.guard, POSES.crouch, k);
        c.hero.root.position.y = 0; c.rival.root.position.y = 0;
        rivalPower(1, dt); heroAmt = 0.7; c.cam.shake = 0.2 + u * 0.3;
        auras(dt); lights();
      },
    },
    { // 7 — launch (slow motion) and the arms pull back with the dragons
      dur: 4.6,
      enter() {
        c.state.fxScale = 0.3; c.sfx.whoosh(2.0, 0.3); c.sfx.boom(0.5);
        c.fx.rings.spawn(v(0, 0.1, H0.z), v(0, 1, 0), '#ffffff', 9, 0.8); c.fx.rings.spawn(v(0, 0.1, R0.z), v(0, 1, 0), '#ff4a3a', 9, 0.8);
        c.fx.dust.burst(v(0, 0.2, H0.z), 40, 5, 1.4, new THREE.Color('#aab4bf'), 0.3, 0.6); c.fx.dust.burst(v(0, 0.2, R0.z), 40, 5, 1.4, new THREE.Color('#aab4bf'), 0.3, 0.6);
      },
      run(u, t, dt) {
        const gp = 0.72 * u; place(gp); blendPose('hero', gp); blendPose('rival', gp);
        c.hero.root.updateMatrixWorld(true); c.rival.root.updateMatrixWorld(true);
        mid.copy(c.hero.root.position).add(c.rival.root.position).multiplyScalar(0.5);
        const grow = ease.clamp01((gp - 0.4) / 0.3);
        updateDragons(dt, grow);
        heroAmt = lerp(0.7, 1, u); rivalAmt = 1; c.fx.boltRed.active = true; c.fx.boltRed.origin.copy(c.rival.root.position); c.fx.boltRed.radius = 1.4; c.fx.boltRed.height = 2.6;
        c.rival.glow('#ff3a1a', 0.8);
        if (u > 0.36) c.once('roar1', () => c.sfx.roar()); if (u > 0.6) c.once('roar2', () => c.sfx.roar());
        c.fx.sparks.emit(heroFist, rv(1.5), 0.7, CYAN); c.fx.embers.emit(rivalFist, rv(1.5), 0.7, RED);
        if (u < 0.32) { const k = u / 0.32; c.cam.pos.set(lerp(15.5, 12.5, k), lerp(2.8, 3.6, k), mid.z + 2); c.cam.look.copy(mid).add(v(0, 1.4, 0)); c.cam.fov = 46; c.cam.roll = 0; }
        else if (u < 0.58) { const k = (u - 0.32) / 0.26; c.cam.pos.copy(heroFist).add(v(lerp(2.1, 1.6, k), 0.55, 0.9)); c.cam.look.copy(heroFist).add(v(0, 0, 0.7)); c.cam.fov = 34; c.cam.roll = -0.07; }
        else if (u < 0.82) { const k = (u - 0.58) / 0.24; c.cam.pos.copy(rivalFist).add(v(lerp(-2.1, -1.6, k), 0.55, -0.9)); c.cam.look.copy(rivalFist).add(v(0, 0, -0.7)); c.cam.fov = 34; c.cam.roll = 0.07; }
        else { const k = (u - 0.82) / 0.18; c.cam.pos.copy(mid).add(v(lerp(9, 8, k), 2.2, 5.5)); c.cam.look.copy(mid).add(v(0, 0.2, 0)); c.cam.fov = 48; c.cam.roll = 0; }
        c.cam.shake = 0.12; auras(dt); lights();
        c.lights.hero.intensity = 40; c.lights.rival.intensity = 40;
      },
    },
    { // 8 — the approach: slower and slower
      dur: 1.9,
      enter() { c.state.fxScale = 0.12; c.sfx.charge(1.6); },
      run(u, t, dt) {
        const gp = 0.72 + 0.28 * ease.io(u); place(gp); blendPose('hero', gp); blendPose('rival', gp);
        c.hero.root.updateMatrixWorld(true); c.rival.root.updateMatrixWorld(true);
        mid.copy(c.hero.root.position).add(c.rival.root.position).multiplyScalar(0.5);
        updateDragons(dt, 1);
        c.dragons.hero.group.scale.setScalar(1); c.dragons.rival.group.scale.setScalar(1);
        c.cam.pos.set(lerp(8.2, 5.4, ease.io(u)), mid.y + 0.4, mid.z); c.cam.look.copy(mid).add(v(0, 0.35, 0)); c.cam.fov = lerp(40, 28, ease.io(u)); c.cam.roll = 0;
        c.cam.shake = 0.1 + u * 0.4; c.fx.sparks.emit(heroFist, rv(2), 0.6, WHITE); c.fx.embers.emit(rivalFist, rv(2), 0.6, ORANGE);
        auras(dt); lights(); c.ui.speed(u * 0.5);
        if (u > 0.2) c.once('roar3', () => { c.sfx.roar(); c.sfx.roar(); });
      },
    },
    { // 9 — IMPACT: freeze, flash, fist into face
      dur: 1.3,
      enter() {
        c.state.fxScale = 0.07; place(1); c.hero.pose(POSES.strike); c.rival.pose(POSES.windup, POSES.strike, 0.5);
        c.hero.root.updateMatrixWorld(true); c.rival.root.updateMatrixWorld(true);
        c.ui.invert(); c.ui.flash(1, '#ffffff'); c.sfx.impact(); kick = 1.6; c.ui.speed(1);
        c.fx.rings.spawn(impactPoint, v(0, 0, 1), '#ffffff', 5.5, 0.7); c.fx.rings.spawn(impactPoint, v(0, 0, 1), '#38d8ff', 9, 1.0); c.fx.rings.spawn(impactPoint, v(0, 1, 0), '#bff6ff', 12, 0.9);
        c.fx.sparks.burst(impactPoint, 150, 9, 1.1, ICE, 1); c.fx.sparks.burst(impactPoint, 70, 5, 1.0, CYAN, 1); c.fx.embers.burst(impactPoint, 50, 6, 1.0, ORANGE, 1);
        c.dragons.hero.group.scale.setScalar(1.15);
      },
      run(u, t, dt) {
        place(1); kick = Math.max(0, kick - dt * 0.9);
        const push = ease.out(Math.max(0, (u - 0.12) / 0.88)) * 0.7;
        c.hero.root.position.z -= push; c.rival.root.position.z -= push;
        c.hero.pose(POSES.strike);
        const k = ease.out(Math.max(0, (u - 0.1) / 0.5));
        c.rival.pose(POSES.windup, POSES.hit, k * 0.6);
        c.rival.joints.head.scale.set(1 + 0.18 * k, 1 - 0.08 * k, 1 - 0.34 * k);
        c.hero.root.updateMatrixWorld(true); c.rival.root.updateMatrixWorld(true);
        updateDragons(dt, 1, 1 - u * 0.4);
        const cp = impactPoint.clone(); cp.z -= push;
        c.cam.pos.set(cp.x + lerp(1.2, 0.85, u), cp.y + 0.12, cp.z + 0.45); c.cam.look.set(cp.x, cp.y, cp.z - 0.05); c.cam.fov = lerp(30, 21, ease.io(u)); c.cam.roll = lerp(0, -0.06, u);
        c.cam.shake = kick; c.ui.speed(1 - u * 0.5);
        c.fx.sparks.emit(cp, rv(6), 0.5, WHITE); c.fx.sparks.emit(cp, rv(6), 0.5, ICE);
        c.lights.hero.position.copy(cp).add(v(0.8, 0.6, 0.8)); c.lights.hero.intensity = lerp(120, 30, u); c.lights.hero.color.set('#bff6ff');
        auras(dt);
        if (u > 0.86) c.state.fxScale = 0.25;
      },
    },
    { // 10 — he is launched across the arena into the wall
      dur: 2.4,
      enter() {
        launchFrom.copy(c.rival.root.position); c.state.fxScale = 0.55; c.ui.flash(0.6, '#ffffff'); c.sfx.whoosh(1.2, 0.45);
        c.rival.joints.head.scale.set(1, 1, 1); c.rival.pose(POSES.hit);
        c.fx.rings.spawn(c.rival.root.position.clone().add(v(0, 1.5, 0)), v(0, 0, 1), '#ffffff', 10, 0.8);
      },
      run(u, t, dt) {
        const crashAt = 0.62; const tt = Math.min(1, u / crashAt);
        const e = 0.15 * tt + 0.85 * ease.in(tt);
        const rp = c.rival.root;
        if (u < crashAt) {
          rp.position.lerpVectors(launchFrom, wallHit, e); rp.position.y += Math.sin(Math.PI * tt) * 1.2;
          rp.rotation.set(-1.3 * tt, 0, 3.0 * tt);
          for (let i = 0; i < 5; i++) { c.fx.embers.emit(rp.position.clone().add(v(0, 1, 0)).add(rv(0.8)), rv(2), 0.8, i % 2 ? RED : WHITE); c.fx.sparks.emit(rp.position.clone().add(v(0, 1, 0)), rv(1.4), 0.6, ORANGE); }
          c.ui.speed(1 - tt * 0.6);
        } else {
          const k = (u - crashAt) / (1 - crashAt);
          rp.position.set(wallHit.x, lerp(wallHit.y, 0.55, ease.in(k)), wallHit.z + k * 0.3); rp.rotation.set(-Math.PI / 2 + 0.2 - k * 0.2, 0, lerp(3.0, 3.3, k));
          c.ui.speed(0);
        }
        if (u >= crashAt) c.once('crash', () => {
          (c.env.wallCrack.material as THREE.MeshBasicMaterial).opacity = 1; c.env.wallCrack.position.set(0, wallHit.y, wallHit.z - 1.5);
          c.ui.flash(0.8, '#ffffff'); c.sfx.crash(); kick = 1.6; c.state.fxScale = 0.5;
          c.fx.rings.spawn(v(0, wallHit.y, wallHit.z - 1.35), v(0, 0, 1), '#ffffff', 11, 0.9); c.fx.rings.spawn(v(0, wallHit.y, wallHit.z - 1.3), v(0, 0, 1), '#ff6a3a', 16, 1.2);
          for (let i = 0; i < 160; i++) c.fx.dust.emit(v(rnd(-4, 4), wallHit.y + rnd(-3, 3), wallHit.z - 1.2), v(rnd(-3, 3), rnd(-1, 3), rnd(2, 9)), rnd(1.5, 3.5), new THREE.Color('#b4bcc6'), 0.55);
          c.fx.embers.burst(v(0, wallHit.y, wallHit.z - 1.2), 90, 8, 1.6, ORANGE, 1);
        });
        // hero: carried forward, falling
        const lam = u * 0.55; c.hero.root.position.set(heroEnd.x, heroEnd.y * (1 - ease.io(lam)), heroEnd.z - 0.7 - lam * 1.6);
        c.hero.pose(POSES.strike, POSES.land, ease.io(Math.min(1, u * 1.4)));
        c.rival.eyeGlow(Math.max(0, 1 - u * 1.6), '#ff3b2a'); c.rival.glow('#ff3a1a', Math.max(0, 0.8 - u)); c.rival.flare(Math.max(0, 1 - u * 1.4));
        rivalAmt = Math.max(0, 1 - u * 2.2); heroAmt = Math.max(0, 1 - u * 0.6); c.fx.boltRed.active = false;
        updateDragons(dt, Math.max(0, 1 - u * 1.3), Math.max(0, 1 - u * 1.2));
        c.dragons.rival.group.visible = false;
        // camera: track him, then cut to the wide of the crash
        if (u < crashAt + 0.02) { c.cam.pos.set(rp.position.x + 7.5, rp.position.y + 0.8, rp.position.z + 4.5); c.cam.look.copy(rp.position).add(v(0, 1, 0)); c.cam.fov = 40; c.cam.roll = 0; }
        else { const k = (u - crashAt) / (1 - crashAt); c.cam.pos.set(lerp(12, 9, k), lerp(5, 4.4, k), lerp(-78, -80, k)); c.cam.look.set(0, 4.2, wallHit.z); c.cam.fov = 46; c.cam.roll = 0; }
        kick = Math.max(0, kick - dt * 1.1); c.cam.shake = kick; auras(dt); lights();
        c.lights.rival.intensity = Math.max(0, 30 - u * 40); c.lights.hero.intensity = lerp(30, 10, u);
      },
    },
    { // 11 — victory
      dur: 3.8,
      enter() { c.state.fxScale = 0.6; c.dragons.hero.group.visible = false; },
      run(u, t, dt) {
        const lam = 0.55 + u * 0.45;
        c.hero.root.position.set(heroEnd.x, heroEnd.y * (1 - ease.io(Math.min(1, lam * 1.15))), heroEnd.z - 0.7 - 0.9 - lam * 0.6);
        if (u < 0.3) c.hero.pose(POSES.land); else c.hero.pose(POSES.land, POSES.victory, ease.io((u - 0.3) / 0.45));
        c.hero.root.rotation.y = Math.PI;
        const hp = c.hero.root.position;
        if (u > 0.12) c.once('thud', () => { c.sfx.boom(0.35); c.fx.rings.spawn(v(hp.x, 0.08, hp.z), v(0, 1, 0), '#38d8ff', 8, 1.0); c.fx.dust.burst(v(hp.x, 0.2, hp.z), 50, 4, 1.6, new THREE.Color('#aab4bf'), 0.2, 0.5); });
        const a = lerp(0.9, -0.25, ease.io(u));
        c.cam.pos.set(hp.x + Math.sin(a) * 3.2, lerp(0.8, 1.5, u), hp.z - Math.cos(a) * 3.2); c.cam.look.set(hp.x, 1.55, hp.z); c.cam.fov = lerp(44, 36, u); c.cam.roll = 0; c.cam.shake = 0.04;
        heroAmt = lerp(0.9, 0.35, u); c.hero.glow('#38d8ff', 0.3);
        c.lights.hero.position.set(hp.x + 1.5, 2.6, hp.z - 2); c.lights.hero.intensity = 25; c.lights.hero.color.set('#38d8ff');
        for (let i = 0; i < 2; i++) c.fx.sparks.emit(c.heroGlove.fistTip.getWorldPosition(tmp), rv(1.2), 0.9, CYAN);
        auras(dt); lights();
        if (u > 0.3) c.once('victory', () => { c.ui.caption('VICTORY', 'You wore the glove.'); c.sfx.pickup(); });
      },
    },
  ];
  return new Timeline(shots, () => { c.state.fxScale = 1; c.ui.win(); });
}
