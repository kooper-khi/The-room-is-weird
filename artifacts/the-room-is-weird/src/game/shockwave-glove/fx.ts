import * as THREE from 'three';

const V = THREE.Vector3;

export function makeGlowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.7)'); g.addColorStop(0.6, 'rgba(255,255,255,.15)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export const ease = {
  io: (t: number) => t * t * (3 - 2 * t),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  in: (t: number) => t * t * t,
  clamp01: (t: number) => Math.max(0, Math.min(1, t)),
};

// ------------------------------------------------------------------ particles
/** Fixed-size additive particle pool. Fading is done by darkening the colour (additive blending). */
export class Particles {
  readonly points: THREE.Points;
  private n: number;
  private pos: Float32Array; private col: Float32Array;
  private vel: Float32Array; private life: Float32Array; private max: Float32Array; private base: Float32Array;
  private cursor = 0;
  gravity = 0; drag = 0;

  constructor(count: number, size: number, tex: THREE.Texture, additive = true) {
    this.n = count;
    this.pos = new Float32Array(count * 3); this.col = new Float32Array(count * 3);
    this.vel = new Float32Array(count * 3); this.life = new Float32Array(count); this.max = new Float32Array(count); this.base = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) this.pos[i * 3 + 1] = -999;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    const mat = new THREE.PointsMaterial({ size, map: tex, vertexColors: true, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true, toneMapped: false });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
  }

  emit(p: THREE.Vector3, v: THREE.Vector3, life: number, color: THREE.Color, intensity = 1) {
    const i = this.cursor; this.cursor = (this.cursor + 1) % this.n;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.life[i] = life; this.max[i] = life;
    this.base[i * 3] = color.r * intensity; this.base[i * 3 + 1] = color.g * intensity; this.base[i * 3 + 2] = color.b * intensity;
  }

  burst(p: THREE.Vector3, count: number, speed: number, life: number, color: THREE.Color, spread = 1, up = 0) {
    const v = new V();
    for (let k = 0; k < count; k++) {
      v.set(Math.random() * 2 - 1, (Math.random() * 2 - 1) * spread + up, Math.random() * 2 - 1).normalize().multiplyScalar(speed * (0.35 + Math.random() * 0.65));
      this.emit(p, v, life * (0.5 + Math.random() * 0.5), color);
    }
  }

  update(dt: number) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[i * 3 + 1] = -999; this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; continue; }
      const k = Math.max(0, 1 - this.drag * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.gravity * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const f = this.life[i] / this.max[i];
      const fade = f * f * (1.5 - 0.5 * f);
      this.col[i * 3] = this.base[i * 3] * fade; this.col[i * 3 + 1] = this.base[i * 3 + 1] * fade; this.col[i * 3 + 2] = this.base[i * 3 + 2] * fade;
    }
    (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.attributes.color as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() { this.life.fill(0); for (let i = 0; i < this.n; i++) { this.pos[i * 3 + 1] = -999; this.col[i * 3] = this.col[i * 3 + 1] = this.col[i * 3 + 2] = 0; } }
}

// ------------------------------------------------------------------ shockwave rings
export class RingFx {
  readonly group = new THREE.Group();
  private items: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; dur: number; max: number; alive: boolean }[] = [];
  private cursor = 0;
  constructor(pool = 12) {
    const geo = new THREE.RingGeometry(0.86, 1, 56);
    for (let i = 0; i < pool; i++) {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
      const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.frustumCulled = false;
      this.group.add(mesh); this.items.push({ mesh, mat, t: 0, dur: 1, max: 1, alive: false });
    }
  }
  /** normal = direction the ring faces (e.g. (0,1,0) for a floor ring). */
  spawn(pos: THREE.Vector3, normal: THREE.Vector3, color: THREE.ColorRepresentation, maxScale: number, dur: number) {
    const it = this.items[this.cursor]; this.cursor = (this.cursor + 1) % this.items.length;
    it.mesh.position.copy(pos); it.mesh.lookAt(pos.clone().add(normal));
    it.mat.color.set(color); it.t = 0; it.dur = dur; it.max = maxScale; it.alive = true; it.mesh.visible = true; it.mesh.scale.setScalar(0.01);
  }
  update(dt: number) {
    for (const it of this.items) {
      if (!it.alive) continue;
      it.t += dt; const u = it.t / it.dur;
      if (u >= 1) { it.alive = false; it.mesh.visible = false; continue; }
      it.mesh.scale.setScalar(Math.max(0.01, ease.out(u) * it.max));
      it.mat.opacity = (1 - u) * (1 - u) * 0.95;
    }
  }
}

// ------------------------------------------------------------------ lightning
export class Lightning {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private bolts: number; private segs: number;
  private acc = 0;
  active = false;
  origin = new V(); radius = 1.2; height = 2.4; strength = 1;
  constructor(color: THREE.ColorRepresentation, bolts = 8, segs = 7) {
    this.bolts = bolts; this.segs = segs;
    this.pos = new Float32Array(bolts * segs * 2 * 3);
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.lines.frustumCulled = false; this.lines.visible = false;
  }
  tick(dt: number) { this.update(dt, this.origin, this.radius, this.height, this.strength); }
  update(dt: number, origin: THREE.Vector3, radius: number, height: number, strength = 1) {
    this.lines.visible = this.active;
    if (!this.active) return;
    this.acc += dt; if (this.acc < 0.045) return; this.acc = 0;
    let o = 0; const p = new V(); const q = new V();
    for (let b = 0; b < this.bolts; b++) {
      const a = Math.random() * Math.PI * 2; const r = radius * (0.4 + Math.random() * 0.6);
      p.set(origin.x + Math.cos(a) * r * 0.3, origin.y + Math.random() * height * 0.4, origin.z + Math.sin(a) * r * 0.3);
      const tx = origin.x + Math.cos(a) * r, ty = origin.y + Math.random() * height, tz = origin.z + Math.sin(a) * r;
      for (let s = 0; s < this.segs; s++) {
        const k = (s + 1) / this.segs; const jit = 0.35 * strength;
        q.set(THREE.MathUtils.lerp(p.x, tx, 0.35) + (Math.random() - 0.5) * jit, THREE.MathUtils.lerp(p.y, ty, 0.35) + (Math.random() - 0.5) * jit, THREE.MathUtils.lerp(p.z, tz, 0.35) + (Math.random() - 0.5) * jit);
        if (k >= 1) q.set(tx, ty, tz);
        this.pos[o++] = p.x; this.pos[o++] = p.y; this.pos[o++] = p.z; this.pos[o++] = q.x; this.pos[o++] = q.y; this.pos[o++] = q.z;
        p.copy(q);
      }
    }
    (this.lines.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }
}

// ------------------------------------------------------------------ hologram material
export function makeHoloMaterial(color: THREE.ColorRepresentation): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uAlpha: { value: 1 } },
    vertexShader: `
      varying vec3 vN; varying vec3 vView; varying vec2 vUv; varying vec3 vW;
      void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(normalMatrix * normal);
        vec4 mv = viewMatrix * w; vView = -mv.xyz; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uTime; uniform float uAlpha;
      varying vec3 vN; varying vec3 vView; varying vec2 vUv; varying vec3 vW;
      void main(){
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.0);
        float scan = 0.55 + 0.45 * sin(vW.y * 34.0 - uTime * 9.0);
        float scales = 0.65 + 0.35 * sin(vUv.x * 140.0) * sin(vUv.y * 18.85);
        float a = (f * 1.25 + 0.28 * scales) * scan * uAlpha;
        vec3 col = uColor * (0.7 + f * 1.6) + vec3(1.0) * f * 0.4;
        gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
        #include <colorspace_fragment>
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
}

// ------------------------------------------------------------------ holographic dragon
/**
 * A corkscrewing hologram dragon. The head leads just ahead of the fist, the tapered body trails behind
 * in a widening spiral (the "Blue Lock" aura-beast look). One draw call for the body + a handful for the head.
 */
export class Dragon {
  readonly group = new THREE.Group();
  readonly mat: THREE.ShaderMaterial;
  private body: THREE.Mesh;
  private head = new THREE.Group();
  private jaw: THREE.Mesh;
  private R = 30; private S = 10;
  private posAttr: THREE.BufferAttribute; private norAttr: THREE.BufferAttribute;
  private centers: THREE.Vector3[] = [];
  private tmpT = new V(); private tmpN = new V(); private tmpB = new V(); private tmpP = new V(); private tmpQ = new V();
  private time = Math.random() * 10;

  constructor(color: THREE.ColorRepresentation) {
    this.mat = makeHoloMaterial(color);
    const { R, S } = this;
    const verts = R * (S + 1);
    const pos = new Float32Array(verts * 3), nor = new Float32Array(verts * 3), uv = new Float32Array(verts * 2);
    const idx: number[] = [];
    for (let i = 0; i < R; i++) for (let j = 0; j <= S; j++) {
      uv[(i * (S + 1) + j) * 2] = i / (R - 1); uv[(i * (S + 1) + j) * 2 + 1] = j / S;
      if (i < R - 1 && j < S) { const a = i * (S + 1) + j, b = a + S + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    }
    for (let i = 0; i < R; i++) this.centers.push(new V());
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3); this.norAttr = new THREE.BufferAttribute(nor, 3);
    this.posAttr.setUsage(THREE.DynamicDrawUsage); this.norAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr); geo.setAttribute('normal', this.norAttr); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.setIndex(idx);
    this.body = new THREE.Mesh(geo, this.mat); this.body.frustumCulled = false;
    this.group.add(this.body);

    // Head, built facing +Z
    const skull = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.8, 6), this.mat); skull.rotation.x = Math.PI / 2; skull.position.z = 0.28; skull.scale.set(1, 1, 0.8);
    this.jaw = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.62, 5), this.mat); this.jaw.rotation.x = Math.PI / 2; this.jaw.position.set(0, -0.1, 0.22);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), this.mat); brow.position.set(0, 0.16, 0.0);
    this.head.add(skull, this.jaw, brow);
    for (const s of [-1, 1]) {
      const horn = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.7, 5), this.mat); horn.position.set(0.2 * s, 0.3, -0.25); horn.rotation.set(-1.15, 0, -0.35 * s);
      const horn2 = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.45, 4), this.mat); horn2.position.set(0.3 * s, 0.1, -0.1); horn2.rotation.set(-0.5, 0, -1.2 * s);
      const fang = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.18, 4), this.mat); fang.position.set(0.1 * s, -0.04, 0.52); fang.rotation.x = Math.PI;
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.1, 4), this.mat); whisker.position.set(0.28 * s, -0.02, -0.25); whisker.rotation.set(1.3, 0, 0.5 * s);
      this.head.add(horn, horn2, fang, whisker);
    }
    this.group.add(this.head);
    this.group.visible = false;
  }

  /** anchor = fist, dir = punch direction (unit), grow 0..1 materialises the beast. */
  update(dt: number, anchor: THREE.Vector3, dir: THREE.Vector3, grow: number, alpha = 1, length = 9) {
    this.time += dt;
    this.group.visible = grow > 0.01 && alpha > 0.01;
    if (!this.group.visible) return;
    this.mat.uniforms.uTime.value = this.time; this.mat.uniforms.uAlpha.value = alpha;
    const { R, S } = this;
    const F = this.tmpT.copy(dir).normalize();
    const up = Math.abs(F.y) > 0.95 ? this.tmpP.set(1, 0, 0) : this.tmpP.set(0, 1, 0);
    const P = this.tmpQ.copy(F).cross(up).normalize();   // perpendicular 1
    const Q = this.tmpB.copy(F).cross(P).normalize();    // perpendicular 2
    const L = length * ease.io(Math.min(1, grow));
    const lead = 0.55;
    for (let i = 0; i < R; i++) {
      const s = i / (R - 1);
      const ang = s * Math.PI * 5.5 - this.time * 6.5;
      const amp = 0.14 + 1.15 * Math.sin(Math.min(1, s * 1.5) * Math.PI * 0.5) * (0.4 + 0.6 * grow) + Math.sin(this.time * 3 + s * 9) * 0.1 * s;
      const c = this.centers[i];
      c.copy(anchor).addScaledVector(F, lead - s * L).addScaledVector(P, Math.cos(ang) * amp).addScaledVector(Q, Math.sin(ang) * amp);
    }
    // parallel-transport frames
    const T = new V(), N = new V(), B = new V(), pN = new V();
    pN.copy(P);
    const pos = this.posAttr.array as Float32Array, nor = this.norAttr.array as Float32Array;
    for (let i = 0; i < R; i++) {
      const a = this.centers[i], b = this.centers[Math.min(R - 1, i + 1)], z = this.centers[Math.max(0, i - 1)];
      T.copy(i === R - 1 ? a : b).sub(i === R - 1 ? z : a).normalize();
      if (T.lengthSq() < 0.5) T.copy(F).negate();
      N.copy(pN).addScaledVector(T, -pN.dot(T)); if (N.lengthSq() < 1e-6) N.copy(P); N.normalize(); pN.copy(N);
      B.copy(T).cross(N).normalize();
      const s = i / (R - 1);
      const r = THREE.MathUtils.lerp(0.3, 0.025, Math.pow(s, 0.65)) * ease.out(Math.min(1, grow * 1.6)) * (i === R - 1 ? 0.2 : 1);
      for (let j = 0; j <= S; j++) {
        const th = (j / S) * Math.PI * 2; const cx = Math.cos(th), sy = Math.sin(th);
        const nx = N.x * cx + B.x * sy, ny = N.y * cx + B.y * sy, nz = N.z * cx + B.z * sy;
        const o = (i * (S + 1) + j) * 3;
        pos[o] = a.x + nx * r; pos[o + 1] = a.y + ny * r; pos[o + 2] = a.z + nz * r;
        nor[o] = nx; nor[o + 1] = ny; nor[o + 2] = nz;
      }
    }
    this.posAttr.needsUpdate = true; this.norAttr.needsUpdate = true;
    // head sits on the first ring and looks along the punch
    this.head.position.copy(this.centers[0]).addScaledVector(F, 0.35);
    this.head.quaternion.setFromUnitVectors(new V(0, 0, 1), F);
    const hs = ease.out(Math.min(1, grow * 2.4)) * 1.15; this.head.scale.setScalar(Math.max(0.001, hs));
    this.jaw.rotation.x = Math.PI / 2 + 0.15 + (0.5 + 0.5 * Math.sin(this.time * 5)) * 0.35;
  }

  dispose() { this.body.geometry.dispose(); this.mat.dispose(); this.head.traverse((o) => { if (o instanceof THREE.Mesh) o.geometry.dispose(); }); }
}

// ------------------------------------------------------------------ aura column (power-up flame)
export class Aura {
  readonly group = new THREE.Group();
  private shells: { mesh: THREE.Mesh; mat: THREE.ShaderMaterial; speed: number }[] = [];
  constructor(color: THREE.ColorRepresentation, height = 3.6, radius = 0.9) {
    for (let i = 0; i < 3; i++) {
      const mat = makeHoloMaterial(color);
      const geo = new THREE.CylinderGeometry(radius * (0.55 + i * 0.1), radius * (1.05 + i * 0.12), height * (0.85 + i * 0.12), 16, 6, true);
      const mesh = new THREE.Mesh(geo, mat); mesh.position.y = height * 0.5; mesh.frustumCulled = false;
      this.group.add(mesh); this.shells.push({ mesh, mat, speed: 1.3 + i * 0.55 });
    }
    this.group.visible = false;
  }
  update(time: number, amount: number) {
    this.group.visible = amount > 0.01;
    this.shells.forEach((s, i) => {
      s.mat.uniforms.uTime.value = time * s.speed; s.mat.uniforms.uAlpha.value = amount * (0.5 - i * 0.1);
      s.mesh.scale.set(1 + Math.sin(time * 7 + i) * 0.05, 0.4 + amount * 0.65 + Math.sin(time * 5 + i * 2) * 0.05, 1 + Math.cos(time * 6 + i) * 0.05);
      s.mesh.rotation.y = time * (0.6 + i * 0.3);
    });
  }
  dispose() { this.shells.forEach((s) => { s.mesh.geometry.dispose(); s.mat.dispose(); }); }
}

export function makeSprite(tex: THREE.Texture, color: THREE.ColorRepresentation, scale: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  s.scale.setScalar(scale); return s;
}
