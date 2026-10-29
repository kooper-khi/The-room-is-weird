import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { CFG, MODEL_URLS, type FragmentId } from './levelConfig';
import { buildEnvironment, type Env } from './environment';
import { Fighter, POSES, cloneWithMaterials } from './fighters';
import { Aura, Dragon, Lightning, Particles, RingFx, makeGlowTexture, makeSprite } from './fx';
import { LevelSfx } from './sfx';
import { buildDuelTimeline, buildRepairTimeline } from './cutscenes';
import { Timeline, type CamState, type Ctx, type GloveRig } from './types';

type Props = {
  onBack: () => void;
  /** Called when the player presses "Continue" on the victory card. */
  onComplete?: () => void;
  /** Dev shortcuts: 1 = grab all fragments, 2 = skip to the tunnel, 3 = skip to the arena. */
  devMode?: boolean;
  /** 0..1 master volume. */
  volume?: number;
};

type Phase = 'loading' | 'explore' | 'repair' | 'tunnel' | 'duel';

function makeGloveRig(src: THREE.Object3D): GloveRig {
  const model = cloneWithMaterials(src);
  const group = new THREE.Group(); group.add(model);
  const get = (n: string) => model.getObjectByName(n) as THREE.Object3D;
  const parts = { core: get('part_core'), plate: get('part_plate'), cell: get('part_cell') };
  const sockets = { core: get('SocketCore'), plate: get('SocketPlate'), cell: get('SocketCell') };
  const mats: Record<string, THREE.MeshStandardMaterial> = {};
  model.traverse((o) => { if (o instanceof THREE.Mesh) { const m = o.material as THREE.MeshStandardMaterial; if (m?.name) mats[m.name] = m; } });
  const setPower = (a: number) => {
    if (mats.GloveGlow) mats.GloveGlow.emissiveIntensity = a * 2.4;
    if (mats.CoreGlow) mats.CoreGlow.emissiveIntensity = 0.25 + a * 2.2;
    if (mats.CellGlow) mats.CellGlow.emissiveIntensity = 0.25 + a * 1.8;
  };
  const debris = get('broken_debris');
  const setRepaired = (r: boolean) => { debris.visible = !r; Object.values(parts).forEach((p) => (p.visible = r)); setPower(r ? 1 : 0); };
  setRepaired(false);
  return { group, model, parts, sockets, fistTip: get('FistTip'), debris, setPower, setRepaired };
}

const CSS = `
.sgl-root{position:fixed;inset:0;background:#05070a;color:#eef3f6;font-family:Inter,system-ui,sans-serif;overflow:hidden;z-index:50;user-select:none}
.sgl-canvas{position:absolute;inset:0}
.sgl-top{position:absolute;left:0;right:0;top:0;height:56px;padding:0 20px;display:flex;align-items:center;justify-content:space-between;background:linear-gradient(#05070acc,#05070a00);z-index:5;transition:opacity .6s,transform .6s}
.sgl-top.hide{opacity:0;transform:translateY(-20px);pointer-events:none}
.sgl-btn{border:1px solid #3d5560;border-radius:8px;background:#0e171bcc;color:#e6f4f8;padding:9px 14px;cursor:pointer;font-weight:700;font-size:13px}
.sgl-btn:hover{border-color:#38d8ff}
.sgl-btn.primary{background:#38d8ff;color:#04141a;border-color:#38d8ff}
.sgl-eyebrow{font-size:10px;letter-spacing:.23em;color:#38d8ff;font-weight:800}
.sgl-title{font-size:19px;font-weight:800;letter-spacing:-.03em}
.sgl-obj{position:absolute;left:22px;top:70px;pointer-events:none;text-shadow:0 2px 10px #000;transition:opacity .5s}
.sgl-obj small{display:block;font-size:10px;letter-spacing:.2em;color:#38d8ff;font-weight:800}
.sgl-obj b{display:block;margin-top:4px;font-size:20px;letter-spacing:.03em}
.sgl-slots{position:absolute;right:22px;top:70px;display:flex;gap:8px;pointer-events:none;transition:opacity .5s}
.sgl-slot{width:54px;padding:8px 4px;text-align:center;border:1px solid #2c3d45;border-radius:8px;background:#0a1114cc;font-size:9px;letter-spacing:.08em;color:#6c8791;font-weight:800}
.sgl-slot.on{border-color:#38d8ff;color:#bff6ff;box-shadow:0 0 18px #38d8ff55}
.sgl-slot i{display:block;font-style:normal;font-size:18px;margin-bottom:3px}
.sgl-prompt{position:absolute;left:50%;top:60%;transform:translateX(-50%);display:flex;gap:10px;align-items:center;padding:10px 16px;border-radius:10px;border:1px solid #38d8ff88;background:#071218dd;font-weight:800;pointer-events:none}
.sgl-key{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:6px;background:#38d8ff;color:#04141a;font-weight:900}
.sgl-toast{position:absolute;left:50%;bottom:11%;transform:translateX(-50%);padding:11px 18px;border-radius:10px;background:#071218dd;border:1px solid #2c5260;font-weight:700;pointer-events:none;animation:sglfade .35s}
.sgl-cross{position:absolute;left:50%;top:50%;width:6px;height:6px;margin:-3px;border-radius:50%;background:#e8f8ff;opacity:.75;pointer-events:none}
.sgl-bar{position:absolute;left:0;right:0;height:0;background:#000;z-index:6;transition:height 1.1s cubic-bezier(.2,.7,.2,1);pointer-events:none}
.sgl-bar.t{top:0}.sgl-bar.b{bottom:0}
.sgl-root.cine .sgl-bar{height:13vh}
.sgl-root.cine .sgl-obj,.sgl-root.cine .sgl-slots,.sgl-root.cine .sgl-cross,.sgl-root.cine .sgl-prompt{opacity:0}
.sgl-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:8}
.sgl-invert{position:absolute;inset:0;background:#fff;mix-blend-mode:difference;display:none;pointer-events:none;z-index:9}
.sgl-speed{position:absolute;inset:-30%;opacity:0;pointer-events:none;z-index:7;background:repeating-conic-gradient(from 0deg,#fff0 0deg 1.6deg,#ffffffd9 1.6deg 2.2deg,#fff0 2.2deg 5.5deg,#ffffffa6 5.5deg 5.9deg,#fff0 5.9deg 9deg);-webkit-mask-image:radial-gradient(circle,transparent 24%,#000 68%);mask-image:radial-gradient(circle,transparent 24%,#000 68%)}
.sgl-vig{position:absolute;inset:0;pointer-events:none;z-index:4;background:radial-gradient(ellipse at center,transparent 55%,#000a 100%)}
.sgl-caption{position:absolute;left:0;right:0;top:40%;text-align:center;pointer-events:none;z-index:7;animation:sglrise .9s cubic-bezier(.2,.7,.2,1)}
.sgl-caption h2{margin:0;font-size:clamp(34px,7vw,92px);font-weight:900;letter-spacing:.14em;color:#fff;text-shadow:0 0 30px #38d8ff,0 0 80px #38d8ff88}
.sgl-caption p{margin:6px 0 0;font-size:clamp(13px,1.7vw,22px);letter-spacing:.5em;color:#bff6ff;font-weight:700}
.sgl-name{position:absolute;left:8%;bottom:20%;z-index:7;pointer-events:none;animation:sglslide .8s cubic-bezier(.2,.7,.2,1)}
.sgl-name small{display:block;font-size:12px;letter-spacing:.4em;color:#ff4a3a;font-weight:800}
.sgl-name b{display:block;font-size:clamp(40px,7vw,96px);letter-spacing:.12em;font-weight:900;color:#fff;text-shadow:0 0 30px #ff4a3a}
.sgl-center{position:absolute;inset:0;display:grid;place-items:center;z-index:10;background:#05070acc;text-align:center}
.sgl-card{padding:26px 30px;border:1px solid #38d8ff88;border-radius:14px;background:#071218f2;max-width:460px;box-shadow:0 20px 80px #000}
.sgl-card h3{margin:0 0 8px;font-size:26px;letter-spacing:.06em}.sgl-card p{margin:6px 0;color:#9fb8c2;font-size:13px;line-height:1.5}
.sgl-row{display:flex;gap:10px;justify-content:center;margin-top:16px;flex-wrap:wrap}
@keyframes sglfade{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
@keyframes sglrise{from{opacity:0;transform:scale(1.25);letter-spacing:.5em}to{opacity:1;transform:scale(1)}}
@keyframes sglslide{from{opacity:0;transform:translateX(-60px)}to{opacity:1;transform:none}}
`;

function Level({ onBack, onComplete, devMode = false, volume = 0.6, replay }: Props & { replay: () => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const flashRef = useRef<HTMLDivElement>(null);
  const invertRef = useRef<HTMLDivElement>(null);
  const speedRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Loading level…');
  const [ready, setReady] = useState(false);
  const [locked, setLocked] = useState(false);
  const [objective, setObjective] = useState('Find the three glove fragments');
  const [got, setGot] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [toast, setToast] = useState('');
  const [cine, setCine] = useState(false);
  const [caption, setCaption] = useState<{ text: string; sub?: string }>({ text: '' });
  const [nameCard, setNameCard] = useState(false);
  const [won, setWon] = useState(false);
  const lockRef = useRef<() => void>(() => {});
  const volRef = useRef(volume);
  volRef.current = volume;

  useEffect(() => {
    const host = hostRef.current; if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' }); }
    catch { setStatus('3D mode could not start. Try enabling browser hardware acceleration.'); return; }
    let disposed = false;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = false;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bg = new THREE.Color('#06080c'); scene.background = bg;
    const fog = new THREE.FogExp2('#06080c', 0.04); scene.fog = fog;
    const camera = new THREE.PerspectiveCamera(72, host.clientWidth / host.clientHeight, 0.05, 240);
    camera.rotation.order = 'YXZ'; scene.add(camera);

    const hemi = new THREE.HemisphereLight('#9db4d0', '#20232b', 0.5); scene.add(hemi);
    const moon = new THREE.DirectionalLight('#aebfe0', 0); moon.position.set(8, 30, -50); scene.add(moon);
    const warm = new THREE.PointLight('#ffc27a', 34, 15, 2); warm.position.set(1.5, 3.2, -1.0); scene.add(warm);
    const fill = new THREE.PointLight('#38d8ff', 0, 14, 2); scene.add(fill);
    const heroL = new THREE.PointLight('#38d8ff', 0, 40, 2); scene.add(heroL);
    const rivalL = new THREE.PointLight('#ff4a2a', 0, 40, 2); scene.add(rivalL);
    rivalL.position.set(0, 9, CFG.rival.z + 2);

    const env: Env = buildEnvironment(); scene.add(env.group);
    const sfx = new LevelSfx(); sfx.setVolume(volRef.current);
    const tex = makeGlowTexture();
    const fx = {
      sparks: new Particles(500, 0.12, tex), dust: new Particles(420, 0.34, tex), embers: new Particles(420, 0.22, tex),
      rings: new RingFx(14), boltCyan: new Lightning('#9fefff'), boltRed: new Lightning('#ff6a4a'),
    };
    fx.dust.drag = 0.8; fx.embers.gravity = -1.2; fx.sparks.gravity = 3;
    scene.add(fx.sparks.points, fx.dust.points, fx.embers.points, fx.rings.group, fx.boltCyan.lines, fx.boltRed.lines);
    const dragons = { hero: new Dragon('#4de1ff'), rival: new Dragon('#ff4a3a') };
    const auras = { hero: new Aura('#38d8ff', 3.4, 0.85), rival: new Aura('#ff4a3a', 4.0, 1.0) };
    scene.add(dragons.hero.group, dragons.rival.group, auras.hero.group, auras.rival.group);

    // ambient dust motes in the arena
    const motes = new Particles(120, 0.1, tex); scene.add(motes.points);
    for (let i = 0; i < 120; i++) motes.emit(new THREE.Vector3((Math.random() - 0.5) * 50, Math.random() * 12, CFG.arena.cz + (Math.random() - 0.5) * 50), new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.05, (Math.random() - 0.5) * 0.2), 9999, new THREE.Color('#8793a3'), 0.5);

    // ------------------------------------------------------------- runtime state
    let phase: Phase = 'loading';
    let camMode: 'player' | 'cut' = 'player';
    let timeline: Timeline | null = null; let duelTL: Timeline | null = null;
    const player: Ctx['player'] = { x: CFG.cell.spawn.x, z: CFG.cell.spawn.z, yaw: 0, pitch: 0 };
    const cam: CamState = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 72, roll: 0, shake: 0 };
    const state = { fxScale: 1, time: 0, gloveOn: false, fogBoost: 0 };
    const inventory: Ctx['inventory'] = {};
    const keys = new Set<string>();
    let active = false; let ready2 = false; let flashLevel = 0; let lastPrompt = ''; let toastTimer = 0; let stepT = 0; let bobT = 0; let speedT = 0; let speedA = 0;
    const onceSet = new Set<string>();
    const once = (k: string, fn: () => void) => { if (onceSet.has(k)) return; onceSet.add(k); fn(); };
    const pickups: { id: FragmentId; group: THREE.Group; obj: THREE.Object3D; beam: THREE.Mesh; taken: boolean; label: string }[] = [];
    let ctx: Ctx; let hero: Fighter, rival: Fighter, benchGlove: GloveRig, heroGlove: GloveRig, viewGlove: GloveRig; const viewRig = new THREE.Group();

    const ui: Ctx['ui'] = {
      flash: (a, color = '#ffffff') => { flashLevel = Math.max(flashLevel, a); if (flashRef.current) flashRef.current.style.background = color; },
      invert: () => { const e = invertRef.current; if (!e) return; e.style.display = 'block'; window.setTimeout(() => { e.style.display = 'none'; }, 110); },
      speed: (a) => { speedA = a; },
      bars: (on) => setCine(on),
      caption: (text, sub) => setCaption({ text, sub }),
      nameCard: (on) => setNameCard(on),
      objective: (t) => setObjective(t),
      toast: (t) => { setToast(t); window.clearTimeout(toastTimer); toastTimer = window.setTimeout(() => setToast(''), 2600); },
      win: () => { setWon(true); if (document.pointerLockElement) document.exitPointerLock(); },
    };

    // ------------------------------------------------------------- input
    const blocked = (x: number, z: number) => {
      const r = CFG.playerRadius;
      for (const c of env.colliders) if (c.enabled && x + r > c.minX && x - r < c.maxX && z + r > c.minZ && z - r < c.maxZ) return true;
      return false;
    };
    const lockPointer = () => { if (ready2 && document.pointerLockElement !== renderer.domElement) void renderer.domElement.requestPointerLock(); };
    lockRef.current = () => { sfx.start(); lockPointer(); };
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', ' '].includes(k)) e.preventDefault();
      keys.add(k);
      if (k === 'e' && !e.repeat) interact();
      if (devMode && !e.repeat && ready2) {
        if (k === '1' && phase === 'explore') CFG.fragments.forEach((f) => pick(f.id, true));
        if (k === '2' && phase === 'explore') { env.door.open(1); env.door.setSign(true); env.door.setLights('#3cff8c'); player.x = 0; player.z = -9; goTunnel(); }
        if (k === '3' && (phase === 'explore' || phase === 'tunnel')) { env.door.open(1); player.x = 0; player.z = -41; if (phase !== 'tunnel') goTunnel(); }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const onMove = (e: MouseEvent) => {
      if (!active || camMode !== 'player' || document.pointerLockElement !== renderer.domElement) return;
      player.yaw -= e.movementX * 0.0022; player.pitch = THREE.MathUtils.clamp(player.pitch - e.movementY * 0.0022, -1.35, 1.35);
    };
    const onLockChange = () => { active = document.pointerLockElement === renderer.domElement; setLocked(active); };
    const onClick = () => { if (!active) lockRef.current(); };
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('mousemove', onMove);
    document.addEventListener('pointerlockchange', onLockChange); renderer.domElement.addEventListener('click', onClick);
    const onResize = () => { if (!host.clientWidth) return; camera.aspect = host.clientWidth / host.clientHeight; camera.updateProjectionMatrix(); renderer.setSize(host.clientWidth, host.clientHeight); };
    window.addEventListener('resize', onResize);

    // ------------------------------------------------------------- gameplay actions
    const target = () => {
      if (phase !== 'explore' || camMode !== 'player') return null;
      const fwd = new THREE.Vector3(-Math.sin(player.yaw) * Math.cos(player.pitch), Math.sin(player.pitch), -Math.cos(player.yaw) * Math.cos(player.pitch));
      const eye = new THREE.Vector3(player.x, CFG.eyeHeight, player.z);
      let best: { kind: 'frag' | 'bench'; id?: FragmentId; score: number; label: string } | null = null;
      const d = new THREE.Vector3();
      for (const p of pickups) {
        if (p.taken) continue; d.copy(p.group.position).sub(eye); const dist = d.length(); if (dist > CFG.interactDistance) continue;
        const dot = d.normalize().dot(fwd); if (dot < CFG.interactCone) continue;
        if (!best || dot > best.score) best = { kind: 'frag', id: p.id, score: dot, label: `Pick up ${p.label}` };
      }
      d.set(CFG.bench.x, CFG.bench.topY + 0.2, CFG.bench.z).sub(eye); const bd = d.length();
      if (bd < 4.2) { const dot = d.normalize().dot(fwd); if (dot > 0.9 && (!best || dot > best.score + 0.02)) best = { kind: 'bench', score: dot, label: Object.keys(inventory).length >= 3 ? 'Repair the glove' : 'Inspect the broken glove' }; }
      return best;
    };
    const pick = (id: FragmentId, silent = false) => {
      const p = pickups.find((q) => q.id === id); if (!p || p.taken) return;
      p.taken = true; scene.remove(p.group); inventory[id] = p.obj; p.obj.removeFromParent(); p.obj.position.set(0, 0, 0);
      setGot(Object.keys(inventory)); const n = Object.keys(inventory).length; env.monitor(n, false);
      if (!silent) { sfx.pickup(); ui.toast(`${p.label} collected  (${n}/3)`); }
      if (n >= 3) { setObjective('Repair the glove at the workbench'); env.benchRing.visible = true; if (!silent) ui.toast('All fragments found. Go to the workbench.'); }
      else setObjective(`Find the glove fragments  (${n}/3)`);
    };
    function interact() {
      const t = target(); if (!t) return;
      if (t.kind === 'frag' && t.id) pick(t.id);
      else if (t.kind === 'bench') {
        if (Object.keys(inventory).length < 3) { sfx.denied(); ui.toast('The glove is missing parts. Find all three fragments.'); return; }
        phase = 'repair'; camMode = 'cut'; setPrompt('');
        timeline = buildRepairTimeline(ctx);
      }
    }
    const goTunnel = () => { phase = 'tunnel'; camMode = 'player'; timeline = null; setCine(false); setObjective('Follow the tunnel'); sfx.startAmbience('tunnel'); setCaption({ text: '' }); };
    ctx = null as unknown as Ctx;

    // ------------------------------------------------------------- load models, then build the actors
    const loader = new GLTFLoader();
    Promise.all([loader.loadAsync(MODEL_URLS.glove), loader.loadAsync(MODEL_URLS.hero), loader.loadAsync(MODEL_URLS.rival)]).then(([g, h, r]) => {
      if (disposed) return;
      benchGlove = makeGloveRig(g.scene); heroGlove = makeGloveRig(g.scene); viewGlove = makeGloveRig(g.scene);
      heroGlove.setRepaired(true); viewGlove.setRepaired(true);
      benchGlove.group.rotation.order = 'YZX'; benchGlove.group.rotation.set(0, 0, -Math.PI / 2); benchGlove.group.scale.setScalar(1.5);
      benchGlove.group.position.set(CFG.bench.x, CFG.bench.topY + 0.19, CFG.bench.z); scene.add(benchGlove.group);

      hero = new Fighter(cloneWithMaterials(h.scene)); rival = new Fighter(cloneWithMaterials(r.scene));
      hero.joints.elbowR.add(heroGlove.group); heroGlove.group.position.set(0, -0.26, 0); if (hero.hand) hero.hand.visible = false;
      hero.root.position.set(CFG.hero.x, 0, CFG.hero.z); hero.root.rotation.y = Math.PI; hero.pose(POSES.idle); hero.root.visible = false;
      rival.root.position.set(CFG.rival.x, 0, CFG.rival.z); rival.root.scale.setScalar(1.1); rival.pose(POSES.crossed);
      scene.add(hero.root, rival.root);

      // first-person glove
      const inner = new THREE.Group(); inner.rotation.x = Math.PI / 2; inner.add(viewGlove.group);
      viewRig.add(inner); viewRig.rotation.z = -Math.PI / 2 + 0.25; viewRig.rotation.y = 0.12; viewRig.position.set(0.3, -0.3, -0.5); viewRig.scale.setScalar(0.85); viewRig.visible = false; camera.add(viewRig);

      // fragment pickups
      for (const f of CFG.fragments) {
        const obj = cloneWithMaterials(benchGlove.parts[f.id]); obj.visible = true; obj.position.set(0, 0, 0); obj.scale.setScalar(2.2);
        const group = new THREE.Group(); group.position.set(f.x, f.y, f.z); group.add(obj);
        group.add(makeSprite(tex, '#38d8ff', 0.9));
        const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 6, 8, 1, true), new THREE.MeshBasicMaterial({ color: '#38d8ff', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
        beam.position.y = 3 - 0.0; group.add(beam);
        scene.add(group); pickups.push({ id: f.id, group, obj, beam, taken: false, label: f.label });
      }

      ctx = { scene, camera, cam, env, sfx, fx, lights: { warm, fill, hero: heroL, rival: rivalL }, hero, rival, benchGlove, heroGlove, viewGlove, viewRig, dragons, auras, inventory, player, state, ui, once,
        onRepairDone: () => { goTunnel(); } };
      ready2 = true; phase = 'explore'; setReady(true);
    }).catch(() => setStatus('Could not load the level models. Check that public/shockwave-glove/models/ was copied into your project.'));

    // ------------------------------------------------------------- main loop
    const clock = new THREE.Clock(); let raf = 0; const tmpV = new THREE.Vector3();
    const tick = () => {
      if (disposed) return; raf = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.05); state.time += dt; const T = state.time;
      if (ready2) {
        // --- gameplay
        if (camMode === 'player' && active && (phase === 'explore' || phase === 'tunnel')) {
          const f = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
          const s = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
          const m = Math.hypot(f, s) || 1; const spd = CFG.walkSpeed * (keys.has('shift') ? 1.35 : 1);
          const dx = ((-Math.sin(player.yaw) * f + Math.cos(player.yaw) * s) / m) * spd * dt, dz = ((-Math.cos(player.yaw) * f - Math.sin(player.yaw) * s) / m) * spd * dt;
          if (!blocked(player.x + dx, player.z)) player.x += dx; if (!blocked(player.x, player.z + dz)) player.z += dz;
          const c = env.clampArena(player.x, player.z); player.x = c.x; player.z = c.z;
          if (f || s) { bobT += dt * 8; stepT += dt; if (stepT > 0.46) { stepT = 0; sfx.footstep(); } }
          if (phase === 'tunnel' && player.z < CFG.duelTriggerZ) {
            phase = 'duel'; camMode = 'cut'; setObjective(''); setPrompt('');
            duelTL = buildDuelTimeline(ctx); timeline = duelTL;
          }
        }
        // --- prompt
        const tg = target(); const text = tg && active ? tg.label : '';
        if (text !== lastPrompt) { lastPrompt = text; setPrompt(text); }
        // --- cutscene
        if (timeline) timeline.update(dt);
        if (duelTL && duelTL.index >= 1) viewRig.visible = false; else viewRig.visible = state.gloveOn && camMode === 'player' || (state.gloveOn && phase === 'repair') || (state.gloveOn && phase === 'duel');
        // --- atmosphere (smooth zone blending)
        const zref = camMode === 'cut' && phase !== 'repair' ? cam.pos.z : player.z;
        const inCell = zref > -7.2, inTunnel = zref > -37 && !inCell;
        const tFog = inCell ? 0.05 : inTunnel ? 0.062 : 0.011, tHemi = inCell ? 0.55 : inTunnel ? 0.5 : 0.85, tMoon = inCell || inTunnel ? 0 : 1.3;
        const k = 1 - Math.exp(-dt * 2.2);
        fog.density += (tFog - fog.density) * k; hemi.intensity += (tHemi - hemi.intensity) * k; moon.intensity += (tMoon - moon.intensity) * k;
        // zone lights
        if (phase === 'tunnel' && camMode === 'player') { fill.position.set(player.x, 2.9, player.z - 0.8); fill.color.set(player.z < -26 ? '#ff8a5a' : '#8fe8ff'); fill.intensity = 16; }
        if (phase === 'tunnel' || (phase === 'duel' && duelTL && duelTL.index <= 0)) { const near = THREE.MathUtils.clamp((-30 - player.z) / 8, 0, 1); rivalL.color.set('#dfe9ff'); rivalL.position.set(0, 10, CFG.rival.z + 4); rivalL.intensity = near * 120; heroL.position.set(0, 8, CFG.hero.z); heroL.intensity = near * 50; heroL.color.set('#cfe2ff'); }
        if (phase === 'explore' && !timeline) { fill.intensity = 0; }
        warm.intensity = phase === 'explore' || phase === 'repair' ? 34 + Math.sin(T * 13) * 1.2 : 0;
        // idle breathing for the waiting rival
        if (phase !== 'duel') { rival.pose(POSES.crossed); rival.joints.torso.rotation.x += Math.sin(T * 1.6) * 0.012; }
        // pickups
        for (const p of pickups) { if (p.taken) continue; p.obj.rotation.y = T * 1.6; p.group.position.y = (CFG.fragments.find((f) => f.id === p.id)?.y ?? 1.5) + Math.sin(T * 2 + p.group.position.x) * 0.06; (p.beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(T * 3) * 0.06; }
        if (benchGlove && phase === 'explore') { benchGlove.group.position.y = CFG.bench.topY + 0.19; }
        env.update(T);
        // --- fx
        const edt = dt * state.fxScale;
        fx.sparks.update(edt); fx.dust.update(edt); fx.embers.update(edt); fx.rings.update(edt); motes.update(dt * 0.4);
        fx.boltCyan.tick(dt); fx.boltRed.tick(dt);
        // auras/dragons are updated by the director; make sure they hide when idle
        if (!timeline) { dragons.hero.group.visible = false; dragons.rival.group.visible = false; }
        // --- camera
        if (camMode === 'cut') {
          const sh = cam.shake; tmpV.copy(cam.pos);
          if (sh > 0.001) tmpV.add(new THREE.Vector3((Math.random() - 0.5) * 0.09 * sh, (Math.random() - 0.5) * 0.09 * sh, (Math.random() - 0.5) * 0.09 * sh));
          camera.position.copy(tmpV); camera.up.set(0, 1, 0); camera.lookAt(cam.look); camera.rotateZ(cam.roll + (Math.random() - 0.5) * 0.012 * sh);
          if (Math.abs(camera.fov - cam.fov) > 0.01) { camera.fov = cam.fov; camera.updateProjectionMatrix(); }
        } else {
          const bob = Math.sin(bobT) * 0.025;
          camera.position.set(player.x, CFG.eyeHeight + bob, player.z); camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
          if (Math.abs(camera.fov - 72) > 0.01) { camera.fov = 72; camera.updateProjectionMatrix(); }
        }
        if (viewRig.visible) { viewRig.position.set(0.3 + Math.sin(bobT * 0.5) * 0.008, -0.3 + Math.sin(bobT) * 0.01 + Math.sin(T * 1.7) * 0.003, -0.5); }
      }
      // --- overlays (direct DOM, no React churn)
      flashLevel *= Math.exp(-dt * 3.4); if (flashLevel < 0.01) flashLevel = 0;
      if (flashRef.current) flashRef.current.style.opacity = String(Math.min(1, flashLevel));
      if (speedRef.current) { speedRef.current.style.opacity = String(speedA); speedT += dt; if (speedA > 0.02 && speedT > 0.05) { speedT = 0; speedRef.current.style.transform = `rotate(${Math.random() * 360}deg) scale(${1.5 + Math.random() * 0.3})`; } }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true; cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('mousemove', onMove); window.removeEventListener('resize', onResize);
      document.removeEventListener('pointerlockchange', onLockChange); renderer.domElement.removeEventListener('click', onClick);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      window.clearTimeout(toastTimer);
      sfx.dispose(); env.dispose(); dragons.hero.dispose(); dragons.rival.dispose(); auras.hero.dispose(); auras.rival.dispose(); tex.dispose();
      scene.traverse((o) => { if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) { o.geometry?.dispose(); const m = o.material; (Array.isArray(m) ? m : [m]).forEach((x) => x?.dispose()); } });
      renderer.dispose(); if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { /* volume is read at start; live updates are cheap via ref */ }, [volume]);

  const slots = [{ id: 'core', label: 'CORE', icon: '◆' }, { id: 'plate', label: 'PLATE', icon: '▬' }, { id: 'cell', label: 'CELL', icon: '▮' }];
  return (
    <div className={`sgl-root${cine ? ' cine' : ''}`}>
      <style>{CSS}</style>
      <div ref={hostRef} className="sgl-canvas" style={{ cursor: locked ? 'none' : 'pointer' }} />
      <div className="sgl-vig" />
      <div className={`sgl-top${cine ? ' hide' : ''}`}>
        <div><div className="sgl-eyebrow">THE ROOM IS WEIRD / SHOCKWAVE GLOVE</div><div className="sgl-title">THE GAUNTLET</div></div>
        <button className="sgl-btn" onClick={onBack}>Back</button>
      </div>
      <div className="sgl-obj"><small>CURRENT OBJECTIVE</small><b>{objective}</b></div>
      <div className="sgl-slots">{slots.map((s) => <div key={s.id} className={`sgl-slot${got.includes(s.id) ? ' on' : ''}`}><i>{s.icon}</i>{s.label}</div>)}</div>
      {locked && !cine && <div className="sgl-cross" />}
      {prompt && locked && <div className="sgl-prompt"><span className="sgl-key">E</span>{prompt}</div>}
      {toast && <div className="sgl-toast">{toast}</div>}
      {nameCard && <div className="sgl-name"><small>ARENA CHAMPION</small><b>VANTA</b></div>}
      {caption.text && <div className="sgl-caption"><h2>{caption.text}</h2>{caption.sub && <p>{caption.sub}</p>}</div>}
      <div className="sgl-bar t" /><div className="sgl-bar b" />
      <div ref={speedRef} className="sgl-speed" /><div ref={flashRef} className="sgl-flash" /><div ref={invertRef} className="sgl-invert" />
      {!ready && <div className="sgl-center"><div className="sgl-card"><h3>{status}</h3></div></div>}
      {ready && !locked && !cine && !won && (
        <div className="sgl-center" onClick={() => lockRef.current()}>
          <div className="sgl-card"><div className="sgl-eyebrow">CHAPTER — THE GAUNTLET</div><h3>You are locked in.</h3>
            <p>Somewhere in this room is a broken shockwave glove, and the parts to fix it. Whatever is waiting beyond that door, you will need it.</p>
            <p>WASD move · Mouse look · E interact · Shift sprint · Esc release mouse</p>
            <div className="sgl-row"><button className="sgl-btn primary">Click to play</button></div></div>
        </div>
      )}
      {won && (
        <div className="sgl-center">
          <div className="sgl-card"><div className="sgl-eyebrow">LEVEL COMPLETE</div><h3>The gauntlet is yours.</h3><p>One punch. One arena. One very surprised champion.</p>
            <div className="sgl-row"><button className="sgl-btn" onClick={replay}>Replay level</button>{onComplete && <button className="sgl-btn primary" onClick={onComplete}>Continue</button>}<button className="sgl-btn" onClick={onBack}>Back</button></div></div>
        </div>
      )}
    </div>
  );
}

export default function ShockwaveGloveLevel(props: Props) {
  const [run, setRun] = useState(0);
  return <Level key={run} {...props} replay={() => setRun((r) => r + 1)} />;
}
