import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { InteractionTarget, PuzzleState } from './puzzle';

type Props = {
  puzzle: PuzzleState;
  active: boolean;
  onAction: (target: InteractionTarget) => void;
  sensitivity: number;
  onLookAt: (target: InteractionTarget | null) => void;
  onFootstep?: () => void;
  onMove?: (direction: 'forward' | 'back' | 'left' | 'right', pressed: boolean) => void;
};

type HitObject = THREE.Object3D & { userData: { target?: InteractionTarget; label?: string } };

const mat = (color: string, roughness = .82, metalness = 0) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });

function box(parent: THREE.Object3D, name: string, size: [number, number, number], pos: [number, number, number], color: string, target?: InteractionTarget, radius = 0) {
  const bevel = Math.min(radius || .075, size[0] * .2, size[1] * .2, size[2] * .2);
  const geometry = new RoundedBoxGeometry(...size, 3, bevel);
  const mesh = new THREE.Mesh(geometry, mat(color));
  mesh.name = name;
  mesh.position.set(...pos);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (target) mesh.userData = { target, label: name };
  parent.add(mesh);
  return mesh as HitObject;
}

function sphere(parent: THREE.Object3D, pos: [number, number, number], radius: number, color: string) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), mat(color));
  mesh.position.set(...pos);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function makeRoom(scene: THREE.Scene) {
  const room = new THREE.Group();
  scene.add(room);
  const wall = mat('#e8d4ae');
  const floor = new THREE.Mesh(new THREE.BoxGeometry(13, .22, 15), mat('#c88c61'));
  floor.position.set(0, -.12, -1);
  floor.receiveShadow = true;
  room.add(floor);
  const rug = box(room, 'rug', [7.7, .045, 6.2], [0, .02, -1.5], '#6f9b91');
  rug.rotation.y = -.12;
  // Floorboards, deliberately simple and hand-built.
  for (let i = 0; i < 12; i++) {
    const seam = box(room, 'floor seam', [12.8, .012, .025], [0, .012, -7.7 + i * 1.22], '#a97554');
    seam.castShadow = false;
  }
  box(room, 'back wall left', [9.92, 8, .22], [-1.54, 3.9, -8.45], '#e7d1a8');
  box(room, 'back wall right', [1.16, 8, .22], [5.92, 3.9, -8.45], '#e7d1a8');
  box(room, 'left wall', [.22, 8, 15], [-6.5, 3.9, -1], '#e6c99e');
  box(room, 'right wall', [.22, 8, 15], [6.5, 3.9, -1], '#d7bc98');
  box(room, 'ceiling', [13, .18, 15], [0, 7.9, -1], '#f2e2c5');
  // Window and its bright, stylized view.
  box(room, 'window glow', [3.5, 2.7, .08], [-3.4, 4.25, -8.3], '#9bc9ce');
  box(room, 'window frame', [3.8, .12, .16], [-3.4, 5.65, -8.18], '#fbefce');
  box(room, 'window frame', [3.8, .12, .16], [-3.4, 2.85, -8.18], '#fbefce');
  box(room, 'window frame', [.12, 2.9, .16], [-5.3, 4.25, -8.18], '#fbefce');
  box(room, 'window frame', [.12, 2.9, .16], [-1.5, 4.25, -8.18], '#fbefce');
  box(room, 'window mullion', [.09, 2.7, .17], [-3.4, 4.25, -8.08], '#fbefce');
  box(room, 'window mullion', [3.7, .09, .17], [-3.4, 4.25, -8.08], '#fbefce');
  sphere(room, [-4.2, 4.8, -8.12], .42, '#f3c85c');
  // Door, with a pivot for the opening state.
  const doorPivot = new THREE.Group();
  doorPivot.position.set(5.2, 0, -8.27);
  room.add(doorPivot);
  box(room, 'doorway beyond', [1.82, 3.55, .08], [4.38, 1.78, -8.68], '#9bc9c1');
  box(room, 'doorway glow', [1.35, 2.55, .035], [4.38, 1.8, -8.61], '#e9c985');
  box(doorPivot, 'exit door', [1.75, 3.5, .18], [-.8, 1.75, 0], '#627c82', 'exit-door');
  box(doorPivot, 'door inset', [1.35, 2.75, .04], [-.8, 1.8, .11], '#78959a');
  sphere(doorPivot, [-.22, 1.65, .16], .085, '#f4c44a');
  box(room, 'door frame top', [2.05, .16, .25], [4.38, 3.58, -8.24], '#a97d5b');
  box(room, 'door frame left', [.16, 3.7, .25], [3.42, 1.8, -8.24], '#a97d5b');
  box(room, 'door frame right', [.16, 3.7, .25], [5.34, 1.8, -8.24], '#a97d5b');
  // Sofa, visibly soft through broad colored cushions and piping.
  box(room, 'sofa', [4.8, .72, 1.2], [-.25, .72, -3.65], '#dc775e', 'sofa');
  box(room, 'sofa back', [4.8, 1.65, .62], [-.25, 1.55, -4.2], '#e68a6b');
  box(room, 'sofa arm', [.55, 1.25, 1.15], [-2.65, 1.1, -3.65], '#d96e58');
  box(room, 'sofa arm', [.55, 1.25, 1.15], [2.15, 1.1, -3.65], '#d96e58');
  box(room, 'sofa cushion', [1.35, .18, .84], [-1.48, 1.14, -3.6], '#f3b66f');
  box(room, 'sofa cushion', [1.35, .18, .84], [-.02, 1.14, -3.6], '#f0ca77');
  box(room, 'sofa cushion', [1.35, .18, .84], [1.43, 1.14, -3.6], '#e8a988');
  for (const x of [-2.15, 1.65]) box(room, 'sofa foot', [.15, .42, .18], [x, .2, -3.3], '#775944');
  // Coffee table, with the remote as a real interactive mesh.
  box(room, 'coffee table top', [3.3, .18, 1.65], [0, .94, -.2], '#bc8758');
  for (const x of [-1.35, 1.35]) for (const z of [-.77, .77]) box(room, 'coffee table leg', [.13, .87, .13], [x, .43, -.2 + z], '#74553f');
  const remote = box(room, 'remote', [.64, .15, .27], [.42, 1.12, -.08], '#384d57', 'remote');
  remote.rotation.y = -.23;
  sphere(room, [.56, 1.2, -.08], .065, '#ef765f').name = 'remote power button';
  sphere(room, [.75, 1.2, -.08], .045, '#f5c94d').name = 'remote mode button';
  // TV console and TV, opposite side to encourage looking around.
  box(room, 'TV console', [3.25, .65, .68], [-3.65, .4, -7.7], '#a77553');
  box(room, 'TV', [2.5, 1.65, .16], [-3.65, 1.78, -7.7], '#303d45', 'television');
  box(room, 'TV screen', [2.24, 1.37, .025], [-3.65, 1.8, -7.59], '#8fbdba');
  box(room, 'TV stand', [.9, .11, .48], [-3.65, .85, -7.6], '#39434a');
  // Bookshelf and the newly revealed switch (reachable after the room changes).
  box(room, 'bookshelf frame', [2.25, 4.1, .62], [2.25, 2.1, -7.7], '#a46f4e', 'bookshelf');
  for (const y of [.3, 1.25, 2.2, 3.15, 4.1]) box(room, 'bookshelf shelf', [2.38, .12, .72], [2.25, y, -7.65], '#754f3c');
  const bookColors = ['#e7b65a', '#769e8f', '#e27c67', '#65828a', '#dcb18e'];
  for (let row = 0; row < 4; row++) {
    let x = 1.38;
    for (let i = 0; i < 5; i++) {
      const h = .45 + ((i + row * 2) % 3) * .12;
      box(room, 'book', [.24, h, .37], [x, .5 + row * .95 + h / 2, -7.65], bookColors[(i + row) % bookColors.length]);
      x += .34;
    }
  }
  const switchMesh = box(room, 'hidden switch', [.34, .3, .12], [2.25, 5.18, -7.2], '#edc24f', 'hidden-switch');
  box(room, 'switch bezel', [.55, .48, .08], [2.25, 5.18, -7.26], '#758f7d');
  switchMesh.position.z = -7.13;
  sphere(room, [2.25, 5.18, -7.02], .095, '#ef765f').name = 'switch indicator';
  // Painting.
  box(room, 'painting frame', [1.75, 2.05, .18], [-.15, 4.35, -8.25], '#b88955', 'painting');
  box(room, 'painting', [1.45, 1.75, .05], [-.15, 4.35, -8.12], '#e6bd79');
  sphere(room, [-.15, 4.53, -8.06], .35, '#bf745f');
  box(room, 'painting portrait shoulders', [.75, .44, .08], [-.15, 4.02, -8.05], '#597c78');
  // Lamp and shade.
  box(room, 'lamp base', [.62, .12, .62], [-4.5, .96, -4.2], '#e0b853', 'lamp');
  box(room, 'lamp stem', [.11, 1.25, .11], [-4.5, 1.62, -4.2], '#7b8b75');
  const shade = new THREE.Mesh(new THREE.ConeGeometry(.48, .6, 24), mat('#f0c46b'));
  shade.position.set(-4.5, 2.38, -4.2);
  shade.rotation.x = Math.PI;
  room.add(shade);
  // Plant decoration.
  box(room, 'plant pot', [.62, .62, .62], [5.3, .34, -4.2], '#dd8067');
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(.18, .8, 8), mat(i % 2 ? '#688f72' : '#7da276'));
    leaf.position.set(5.3 + Math.sin(i) * .28, .95 + (i % 2) * .15, -4.2 + Math.cos(i) * .26);
    leaf.rotation.z = Math.sin(i) * .4;
    room.add(leaf);
  }
  const ambient = new THREE.HemisphereLight('#fff1d4', '#91705c', 2.15);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight('#fff0d1', 2.5);
  sun.position.set(-4, 9, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  scene.add(sun);
  return { room, doorPivot, switchMesh };
}

function FallbackRoom({ puzzle, onAction, onLookAt }: Pick<Props, 'puzzle' | 'onAction' | 'onLookAt'>) {
  return (
    <div className={`fallback-diorama${puzzle.roomFlipped ? ' flipped' : ''}`} aria-label="Illustrated living room fallback">
      <div className="fallback-wall" />
      <div className="fallback-floor" />
      <div className="fallback-window"><i /><b /></div>
      <button className="fallback-object fallback-picture" type="button" aria-label="Inspect the portrait" onMouseEnter={() => onLookAt('painting')} onMouseLeave={() => onLookAt(null)} onClick={() => onAction('painting')}><i /><b /></button>
      <button className="fallback-object fallback-door" type="button" aria-label="Try the exit" onMouseEnter={() => onLookAt('exit-door')} onMouseLeave={() => onLookAt(null)} onClick={() => onAction('exit-door')}><i /></button>
      <button className="fallback-object fallback-books" type="button" aria-label="Inspect the bookshelf" onMouseEnter={() => onLookAt('bookshelf')} onMouseLeave={() => onLookAt(null)} onClick={() => onAction('bookshelf')}><i /><b /><em /></button>
      {puzzle.roomFlipped && <button className="fallback-object fallback-switch" type="button" aria-label="Flip the hidden switch" onMouseEnter={() => onLookAt('hidden-switch')} onMouseLeave={() => onLookAt(null)} onClick={() => onAction('hidden-switch')}><i /></button>}
      <button className="fallback-object fallback-tv" type="button" aria-label="Inspect the television" onMouseEnter={() => onLookAt('television')} onMouseLeave={() => onLookAt(null)} onClick={() => onAction('television')}><i /></button>
      <button className="fallback-object fallback-sofa" type="button" aria-label="Inspect the sofa" onMouseEnter={() => onLookAt('sofa')} onMouseLeave={() => onLookAt(null)} onClick={() => onAction('sofa')}><i /><b /><em /></button>
      <button className="fallback-object fallback-lamp" type="button" aria-label="Inspect the lamp" onMouseEnter={() => onLookAt('lamp')} onMouseLeave={() => onLookAt(null)} onClick={() => onAction('lamp')}><i /><b /></button>
      <div className="fallback-rug" />
      <div className="fallback-table"><i /><b /><em /></div>
      {!puzzle.hasRemote && <button className="fallback-object fallback-remote" type="button" aria-label="Pick up the remote" onMouseEnter={() => onLookAt('remote')} onMouseLeave={() => onLookAt(null)} onClick={() => onAction('remote')}><i /></button>}
      <div className="fallback-plant"><i /><b /><em /></div>
    </div>
  );
}

export default function RoomScene({ puzzle, active, onAction, sensitivity, onLookAt, onFootstep, onMove }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const engineRef = useRef<{ renderer: THREE.WebGLRenderer; camera: THREE.PerspectiveCamera; scene: THREE.Scene; targets: THREE.Object3D[]; resetView: () => void; cleanup: () => void } | null>(null);
  const actionRef = useRef(onAction);
  const lookRef = useRef(onLookAt);
  const sensitivityRef = useRef(sensitivity);
  const activeRef = useRef(active);
  const puzzleRef = useRef(puzzle);
  const flipFrameRef = useRef(0);
  const lastPuzzleRef = useRef(puzzle);
  actionRef.current = onAction;
  lookRef.current = onLookAt;
  sensitivityRef.current = sensitivity;
  activeRef.current = active;
  puzzleRef.current = puzzle;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#accdca');
    scene.fog = new THREE.Fog('#accdca', 15, 28);
    const camera = new THREE.PerspectiveCamera(58, 1, .1, 60);
    camera.position.set(0, 1.68, 5.9);
    camera.rotation.order = 'YXZ';
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!context) {
      setWebglUnavailable(true);
      return;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true, alpha: false });
    } catch {
      setWebglUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.7));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.domElement.className = 'scene-canvas';
    renderer.domElement.setAttribute('aria-label', 'First-person view of a peculiar living room. Click an object to interact.');
    renderer.domElement.tabIndex = 0;
    host.appendChild(renderer.domElement);
    const { room, doorPivot } = makeRoom(scene);
    const targets: THREE.Object3D[] = [];
    room.traverse((child) => { if (child.userData.target) targets.push(child); });
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pressed = new Set<string>();
    let yaw = 0;
    let pitch = 0;
    let locked = false;
    let hovered: InteractionTarget | null = null;
    let previous = performance.now();
    let animationFrame = 0;
    let footstepClock = 0;
    const velocity = new THREE.Vector3();
    const direction = new THREE.Vector3();
    const colliders = [
      { minX: -1.82, maxX: 1.82, minZ: -1.18, maxZ: .78 },
      { minX: -3.05, maxX: 2.58, minZ: -4.95, maxZ: -2.92 },
      { minX: -5.45, maxX: -1.85, minZ: -8.25, maxZ: -7.05 },
      { minX: 1.02, maxX: 3.48, minZ: -8.35, maxZ: -6.98 },
      { minX: -4.96, maxX: -4.02, minZ: -4.68, maxZ: -3.74 },
      { minX: 4.82, maxX: 5.78, minZ: -4.68, maxZ: -3.72 },
    ];
    const canStandAt = (x: number, z: number) => {
      if (puzzleRef.current.roomFlipped) return true;
      const radius = .3;
      return !colliders.some((collider) =>
        x + radius > collider.minX && x - radius < collider.maxX &&
        z + radius > collider.minZ && z - radius < collider.maxZ,
      );
    };
    let touchLook: { x: number; y: number } | null = null;
    const resize = () => {
      const width = host.clientWidth || 960;
      const height = host.clientHeight || 540;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();
    const checkHit = (x: number, y: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(targets, false)[0]?.object as HitObject | undefined;
      const target = hit?.userData.target ?? null;
      if (target !== hovered) {
        hovered = target;
        lookRef.current(target);
      }
      return target;
    };
    const onPointerMove = (event: PointerEvent) => {
      if (locked) {
        yaw -= event.movementX * .0022 * sensitivityRef.current;
        pitch -= event.movementY * .0022 * sensitivityRef.current;
        pitch = THREE.MathUtils.clamp(pitch, -1.05, 1.05);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        pointer.set(0, 0);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(targets, false)[0]?.object as HitObject | undefined;
        const nextTarget = hit?.userData.target ?? null;
        if (nextTarget !== hovered) {
          hovered = nextTarget;
          lookRef.current(nextTarget);
        }
        return;
      }
      if (event.pointerType === 'touch' && touchLook) {
        yaw -= (event.clientX - touchLook.x) * .005 * sensitivityRef.current;
        pitch -= (event.clientY - touchLook.y) * .005 * sensitivityRef.current;
        pitch = THREE.MathUtils.clamp(pitch, -1.05, 1.05);
        camera.rotation.set(pitch, yaw, 0, 'YXZ');
        touchLook = { x: event.clientX, y: event.clientY };
        pointer.set(0, 0);
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(targets, false)[0]?.object as HitObject | undefined;
        const nextTarget = hit?.userData.target ?? null;
        if (nextTarget !== hovered) {
          hovered = nextTarget;
          lookRef.current(nextTarget);
        }
        return;
      }
      checkHit(event.clientX, event.clientY);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType === 'touch') {
        touchLook = { x: event.clientX, y: event.clientY };
        renderer.domElement.setPointerCapture(event.pointerId);
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerType === 'touch') touchLook = null;
    };
    const onClick = (event: MouseEvent) => {
      if (!activeRef.current) return;
      const rect = renderer.domElement.getBoundingClientRect();
      const target = locked
        ? checkHit(rect.left + rect.width / 2, rect.top + rect.height / 2)
        : checkHit(event.clientX, event.clientY);
      if (target) {
        actionRef.current(target);
        return;
      }
      renderer.domElement.requestPointerLock?.();
    };
    const onLockChange = () => {
      locked = document.pointerLockElement === renderer.domElement;
      if (locked) {
        const rect = renderer.domElement.getBoundingClientRect();
        checkHit(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (!activeRef.current) return;
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
        pressed.add(key);
        event.preventDefault();
      }
      if (key === 'e' && hovered) {
        actionRef.current(hovered);
        event.preventDefault();
      }
      if (key === 'escape' && locked) document.exitPointerLock();
    };
    const onKeyUp = (event: KeyboardEvent) => pressed.delete(event.key.toLowerCase());
    const onMobileMove = (event: Event) => {
      const custom = event as CustomEvent<{ direction: 'forward' | 'back' | 'left' | 'right'; pressed: boolean }>;
      if (custom.detail.pressed) pressed.add(`mobile-${custom.detail.direction}`);
      else pressed.delete(`mobile-${custom.detail.direction}`);
    };
    const onBlur = () => pressed.clear();
    const resetView = () => {
      yaw = 0;
      pitch = 0;
      camera.position.set(0, 1.68, 5.9);
      camera.rotation.set(0, 0, 0, 'YXZ');
      hovered = null;
      lookRef.current(null);
    };
    renderer.domElement.addEventListener('pointermove', onPointerMove);
    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('click', onClick);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('room-move', onMobileMove);
    const animate = (now: number) => {
      animationFrame = requestAnimationFrame(animate);
      const dt = Math.min((now - previous) / 1000, .04);
      previous = now;
      const fwd = Number(pressed.has('w') || pressed.has('arrowup') || pressed.has('mobile-forward')) - Number(pressed.has('s') || pressed.has('arrowdown') || pressed.has('mobile-back'));
      const side = Number(pressed.has('d') || pressed.has('arrowright') || pressed.has('mobile-right')) - Number(pressed.has('a') || pressed.has('arrowleft') || pressed.has('mobile-left'));
      if (activeRef.current && (fwd || side)) {
        direction.set(side, 0, -fwd).normalize().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        velocity.lerp(direction.multiplyScalar(3.1), 1 - Math.exp(-12 * dt));
        const nextX = THREE.MathUtils.clamp(camera.position.x + velocity.x * dt, -5.7, 5.7);
        const nextZ = THREE.MathUtils.clamp(camera.position.z + velocity.z * dt, -7.6, 5.6);
        if (canStandAt(nextX, camera.position.z)) camera.position.x = nextX;
        else velocity.x = 0;
        if (canStandAt(camera.position.x, nextZ)) camera.position.z = nextZ;
        else velocity.z = 0;
        footstepClock += dt;
        if (footstepClock > .42) {
          footstepClock = 0;
          onFootstep?.();
        }
      } else {
        velocity.multiplyScalar(Math.exp(-10 * dt));
      }
      camera.position.y = 1.68 + ((fwd || side) && activeRef.current ? Math.sin(now * .009) * .025 : 0);
      if (doorPivot.userData.opening) doorPivot.rotation.y = THREE.MathUtils.lerp(doorPivot.rotation.y, -1.25, .045);
      const portrait = scene.getObjectByName('painting portrait shoulders');
      if (portrait) portrait.rotation.z = Math.sin(now * .0007) * .025;
      const tvScreen = scene.getObjectByName('TV screen') as THREE.Mesh | undefined;
      if (tvScreen && tvScreen.material instanceof THREE.MeshStandardMaterial) {
        tvScreen.material.emissive.setHSL(.47 + Math.sin(now * .00025) * .035, .2, .035);
      }
      renderer.render(scene, camera);
    };
    animationFrame = requestAnimationFrame(animate);
    engineRef.current = {
      renderer, camera, scene, targets, resetView,
      cleanup: () => {
        cancelAnimationFrame(animationFrame);
        cancelAnimationFrame(flipFrameRef.current);
        resizeObserver.disconnect();
        document.exitPointerLock?.();
        renderer.dispose();
        scene.traverse((obj) => {
          const mesh = obj as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => material.dispose());
        });
        renderer.domElement.remove();
      },
    };
    return () => {
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('click', onClick);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('room-move', onMobileMove);
      engineRef.current?.cleanup();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!active) document.exitPointerLock?.();
  }, [active]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) {
      lastPuzzleRef.current = puzzle;
      return;
    }
    const previousPuzzle = lastPuzzleRef.current;
    const freshStart = !puzzle.hasRemote && !puzzle.roomFlipped && !puzzle.switchActivated && !puzzle.doorOpened && puzzle.inspected.length === 0;
    const hadProgress = previousPuzzle.hasRemote || previousPuzzle.roomFlipped || previousPuzzle.switchActivated || previousPuzzle.doorOpened || previousPuzzle.inspected.length > 0;
    if (freshStart && hadProgress) engine.resetView();
    lastPuzzleRef.current = puzzle;
    const remote = engine.scene.getObjectByName('remote');
    if (remote) remote.visible = !puzzle.hasRemote;
    for (const name of ['remote power button', 'remote mode button']) {
      const button = engine.scene.getObjectByName(name);
      if (button) button.visible = !puzzle.hasRemote;
    }
    const switchVisible = puzzle.roomFlipped || puzzle.switchActivated;
    for (const name of ['hidden switch', 'switch bezel', 'switch indicator']) {
      const element = engine.scene.getObjectByName(name);
      if (element) element.visible = switchVisible;
    }
    const door = engine.scene.getObjectByName('exit door');
    if (door) {
      const pivot = door.parent;
      if (pivot) {
        pivot.userData.opening = puzzle.doorOpened;
        if (!puzzle.doorOpened) pivot.rotation.y = 0;
      }
    }
    const switchButton = engine.scene.getObjectByName('hidden switch') as THREE.Mesh | undefined;
    if (switchButton) {
      const material = switchButton.material as THREE.MeshStandardMaterial;
      material.color.set(puzzle.switchActivated ? '#8bd0a3' : '#edc24f');
      material.emissive.set(puzzle.switchActivated ? '#316b48' : '#000000');
    }
    const room = engine.scene.children.find((child) => child.type === 'Group');
    if (room && !puzzle.roomFlipped) {
      cancelAnimationFrame(flipFrameRef.current);
      room.rotation.z = 0;
      room.position.y = 0;
      room.userData.flipped = false;
    }
    if (room && puzzle.roomFlipped && !room.userData.flipped) {
      room.userData.flipped = true;
      const start = performance.now();
      const pivotFrom = room.rotation.z;
      // A playful gravity hiccup: furniture tumbles and settles inverted without hiding the room.
      const frame = () => {
        const t = Math.min((performance.now() - start) / 1250, 1);
        const eased = t * t * (3 - 2 * t);
        room.rotation.z = pivotFrom + Math.PI * eased;
        room.position.y = 8 * eased;
        if (t < 1) flipFrameRef.current = requestAnimationFrame(frame);
      };
      flipFrameRef.current = requestAnimationFrame(frame);
    }
    if (puzzle.switchActivated) {
      const material = (engine.scene.getObjectByName('hidden switch') as THREE.Mesh | undefined)?.material as THREE.MeshStandardMaterial | undefined;
      if (material) material.emissive.set('#316b48');
    }
  }, [puzzle]);

  const mobileControl = useCallback((direction: 'forward' | 'back' | 'left' | 'right', pressed: boolean) => {
    onMove?.(direction, pressed);
    window.dispatchEvent(new CustomEvent('room-move', { detail: { direction, pressed } }));
  }, [onMove]);

  if (webglUnavailable) {
    return (
      <div className="scene-host fallback-host" data-testid="game-scene">
        <FallbackRoom puzzle={puzzle} onAction={onAction} onLookAt={onLookAt} />
        <div className="fallback-note" role="status">Illustrated mode · WebGL is unavailable in this browser preview</div>
      </div>
    );
  }

  return (
    <div ref={hostRef} className="scene-host" data-testid="game-scene">
      <div className="mobile-controls">
        <button type="button" aria-label="Move left" onPointerDown={() => mobileControl('left', true)} onPointerUp={() => mobileControl('left', false)} onPointerLeave={() => mobileControl('left', false)}>LEFT</button>
        <button type="button" aria-label="Move forward" onPointerDown={() => mobileControl('forward', true)} onPointerUp={() => mobileControl('forward', false)} onPointerLeave={() => mobileControl('forward', false)}>FORWARD</button>
        <button type="button" aria-label="Move back" onPointerDown={() => mobileControl('back', true)} onPointerUp={() => mobileControl('back', false)} onPointerLeave={() => mobileControl('back', false)}>BACK</button>
        <button type="button" aria-label="Move right" onPointerDown={() => mobileControl('right', true)} onPointerUp={() => mobileControl('right', false)} onPointerLeave={() => mobileControl('right', false)}>RIGHT</button>
      </div>
    </div>
  );
}
