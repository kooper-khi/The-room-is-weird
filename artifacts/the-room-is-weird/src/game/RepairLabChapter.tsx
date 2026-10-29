import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

type Props = { onBack: () => void };

const SPAWNS = [
  { x: -20, z: -20, label: 'NORTH-WEST' },
  { x: 20, z: -20, label: 'NORTH-EAST' },
  { x: -20, z: 20, label: 'SOUTH-WEST' },
  { x: 20, z: 20, label: 'SOUTH-EAST' },
];

export default function RepairLabChapter({ onBack }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState('Loading the maze...');
  const [spawnName, setSpawnName] = useState('—');
  const [reachedMiddle, setReachedMiddle] = useState(false);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch {
      setStatus('3D mode could not start. Try enabling browser hardware acceleration.');
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 0.8));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.shadowMap.enabled = false;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#87c9f5');
    scene.fog = new THREE.FogExp2('#a9d9f5', 0.0025);
    const skyDome = new THREE.Mesh(new THREE.SphereGeometry(480, 16, 10), new THREE.MeshBasicMaterial({ color: '#87c9f5', side: THREE.BackSide, depthWrite: false }));
    scene.add(skyDome);
    const camera = new THREE.PerspectiveCamera(74, host.clientWidth / host.clientHeight, 0.08, 110);
    camera.rotation.order = 'YXZ';

    scene.add(new THREE.HemisphereLight('#e0f3ff', '#59616a', 2.0));
    const ambient = new THREE.AmbientLight('#d9eaff', 0.85);
    scene.add(ambient);
    const key = new THREE.DirectionalLight('#fff1cf', 3.0);
    key.position.set(-35, 55, 22);
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(5, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff0b5' }));
    sunDisc.position.set(-90, 105, -140);
    scene.add(sunDisc);
    key.castShadow = false;
    key.shadow.mapSize.set(512, 512);
    scene.add(key);

    // Soft ceiling-style lamps brighten corridors without expensive real-time shadows.
    const mazeLampGroup = new THREE.Group();
    const lampPositions = [
      [-24, 3.2, -24], [-8, 3.2, -24], [8, 3.2, -24], [24, 3.2, -24],
      [-24, 3.2, -8], [0, 3.2, -8], [24, 3.2, -8],
      [-24, 3.2, 8], [0, 3.2, 8], [24, 3.2, 8],
      [-24, 3.2, 24], [-8, 3.2, 24], [8, 3.2, 24], [24, 3.2, 24],
    ];
    lampPositions.forEach(([x, y, z]) => {
      const lamp = new THREE.Mesh(
        new THREE.SphereGeometry(0.16, 8, 6),
        new THREE.MeshBasicMaterial({ color: '#fff4d6' })
      );
      lamp.position.set(x, y, z);
      mazeLampGroup.add(lamp);
      const glow = new THREE.PointLight('#fff0cf', 3.2, 10, 1.8);
      glow.position.set(x, y - 0.18, z);
      mazeLampGroup.add(glow);
    });
    scene.add(mazeLampGroup);

    // Keep the imported maze surfaces clean and readable; no low-resolution fake marble overlay.
    const floorMat = new THREE.MeshStandardMaterial({ color: '#626d74', roughness: 0.96 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.13;
    floor.receiveShadow = true;
    scene.add(floor);

    // A soft-lit ground ring gives the maze a clear silhouette without covering its model.
    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(47, 48, 0.18, 24),
      new THREE.MeshStandardMaterial({ color: '#6a747b', roughness: 0.82, metalness: 0.08 })
    );
    plinth.position.y = -0.25;
    plinth.receiveShadow = true;
    scene.add(plinth);

    const modelRoot = new THREE.Group();
    scene.add(modelRoot);
    const collisionMeshes: THREE.Object3D[] = [];
    const raycaster = new THREE.Raycaster();
    raycaster.near = 0;
    raycaster.far = 1.25;
    const keys = new Set<string>();
    const player = { x: 0, z: 0, yaw: 0, pitch: 0, radius: 0.42, speed: 3.2 };
    let currentSpawn = -1;
    let animationFrame = 0;
    let lastTime = 0;
    let active = false;
    let disposed = false;
    let modelReady = false;
    let pointerDown = false;
    const goal = new THREE.Vector3(0, 0, 0);
    const goalGroup = new THREE.Group();
    scene.add(goalGroup);

    // A layered sci-fi checkpoint: luminous floor rings, a soft vertical energy column and orbiting markers.
    const goalAura = new THREE.Mesh(
      new THREE.TorusGeometry(1.12, 0.018, 5, 40),
      new THREE.MeshBasicMaterial({ color: '#65dfff', transparent: true, opacity: 0.72 })
    );
    goalAura.rotation.x = Math.PI / 2;
    goalAura.position.y = 0.12;
    goalGroup.add(goalAura);
    const goalRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.75, 0.045, 6, 32),
      new THREE.MeshStandardMaterial({ color: '#8bffe0', emissive: '#2aa9ff', emissiveIntensity: 2.0, metalness: 0.12, roughness: 0.28 })
    );
    goalRing.rotation.x = Math.PI / 2;
    goalRing.position.y = 0.24;
    goalGroup.add(goalRing);
    const energyColumn = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.48, 2.8, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: '#61dfff', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false })
    );
    energyColumn.position.y = 1.45;
    goalGroup.add(energyColumn);
    const orbitMarkers = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.12, 0),
        new THREE.MeshStandardMaterial({ color: '#b5fff0', emissive: '#42cfff', emissiveIntensity: 1.8, metalness: 0.1, roughness: 0.25 })
      );
      const angle = (i / 4) * Math.PI * 2;
      marker.position.set(Math.cos(angle) * 0.92, 0.7 + (i % 2) * 0.42, Math.sin(angle) * 0.92);
      orbitMarkers.add(marker);
    }
    goalGroup.add(orbitMarkers);
    const goalLight = new THREE.PointLight('#5ac7ff', 4.0, 12, 1.8);
    goalLight.position.set(0, 1.4, 0);
    goalGroup.add(goalLight);
    const beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, 1.15, 8),
      new THREE.MeshStandardMaterial({ color: '#8bffe0', emissive: '#2aa9ff', emissiveIntensity: 1.1 })
    );
    beacon.position.y = 0.78;
    goalGroup.add(beacon);

    // No checkpoints: each fresh visit or retry starts at a maze entrance.
    const chooseSpawn = (avoidCurrent = true) => {
      let next = 0;
      if (avoidCurrent && SPAWNS.length > 1) {
        next = Math.floor(Math.random() * SPAWNS.length);
        while (next === currentSpawn) next = Math.floor(Math.random() * SPAWNS.length);
      }
      currentSpawn = next;
      const spawn = SPAWNS[next];
      player.x = spawn.x;
      player.z = spawn.z;
      player.yaw = Math.atan2(spawn.x, spawn.z);
      player.pitch = 0;
      camera.position.set(player.x, 1.62, player.z);
      camera.rotation.set(0, player.yaw, 0);
      setSpawnName(spawn.label);
      setReachedMiddle(false);
      setStatus('Reach the middle');
    };

    const collides = (x: number, z: number, dx: number, dz: number) => {
      if (!collisionMeshes.length) return false;
      const length = Math.hypot(dx, dz);
      if (length < 0.0001) return false;
      const direction = new THREE.Vector3(dx / length, 0, dz / length);
      // One centre ray per axis keeps collision checks cheap for this detailed imported GLB.
      raycaster.set(new THREE.Vector3(x, 0.9, z), direction);
      raycaster.far = Math.max(0.18, length + player.radius * 0.48);
      const hits = raycaster.intersectObjects(collisionMeshes, false);
      return hits.some(hit => hit.distance < length + player.radius * 0.32);
    };

    const respawn = () => {
      chooseSpawn(true);
      setStatus('Reach the middle');
    };

    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (['w', 'a', 's', 'd', 'arrowup', 'arrowleft', 'arrowdown', 'arrowright', 'r'].includes(key)) event.preventDefault();
      keys.add(key);
      if (key === 'r' && modelReady) respawn(); // Testable now; monster-death respawn will call this same function later.
      if (key === 'escape') {
        active = false;
        setLocked(false);
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      }
    };
    const onKeyUp = (event: KeyboardEvent) => keys.delete(event.key.toLowerCase());
    const onMouseMove = (event: MouseEvent) => {
      if (!active || document.pointerLockElement !== renderer.domElement) return;
      player.yaw -= event.movementX * 0.0022;
      player.pitch -= event.movementY * 0.0022;
      player.pitch = THREE.MathUtils.clamp(player.pitch, -1.25, 1.25);
    };
    const onPointerLock = () => {
      active = document.pointerLockElement === renderer.domElement;
      setLocked(active);
    };
    const onClick = () => {
      if (!modelReady) return;
      if (document.pointerLockElement !== renderer.domElement) void renderer.domElement.requestPointerLock();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onPointerLock);
    renderer.domElement.addEventListener('click', onClick);

    const loader = new GLTFLoader();
    loader.load('/maze/toy_maze.glb', (gltf) => {
      if (disposed) return;
      modelRoot.add(gltf.scene);
      // Enlarge the tabletop model into a walkable maze with human-scale corridors and walls.
      gltf.scene.scale.set(700, 700, 700);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        obj.castShadow = false;
        obj.receiveShadow = false;
        if (obj.material) {
          const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
          const meshBounds = new THREE.Box3().setFromObject(obj);
          const meshSize = meshBounds.getSize(new THREE.Vector3());
          // Catch named walls plus tall, thin geometry whose imported mesh names are generic.
          const isWall = /wall|maze/i.test(obj.name) ||
            (meshSize.y > 1.2 && meshSize.y > meshSize.x * 0.7 && meshSize.y > meshSize.z * 0.7);
          materials.forEach((original) => {
            if (original instanceof THREE.MeshStandardMaterial || original instanceof THREE.MeshPhysicalMaterial) {
              const mat = original.clone();
              mat.roughness = isWall ? 0.9 : Math.max(mat.roughness, 0.72);
              mat.metalness = Math.min(mat.metalness, 0.04);
              if (isWall) {
                // Neutral mid-grey walls, softly lit with no noisy low-res texture.
                mat.color.set('#858b91');
                mat.map = null;
                mat.emissive.set('#292d31');
                mat.emissiveIntensity = 0.12;
              }
              original.dispose();
              if (Array.isArray(obj.material)) {
                const index = materials.indexOf(original);
                (obj.material as THREE.Material[])[index] = mat;
              } else {
                obj.material = mat;
              }
            }
          });
        }
        collisionMeshes.push(obj);
      });
      // The model's authored origin is the centre; keep the centre objective just above the floor.
      goal.set(0, 0, 0);
      goalGroup.position.copy(goal);
      modelReady = true;
      setLoaded(true);
      chooseSpawn(false);
      setStatus('Reach the middle');
    }, undefined, () => {
      setStatus('Could not load the maze model. Refresh and check the public/maze file.');
    });

    const resize = () => {
      if (!host.clientWidth || !host.clientHeight) return;
      camera.aspect = host.clientWidth / host.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(host.clientWidth, host.clientHeight);
    };
    window.addEventListener('resize', resize);

    const clock = new THREE.Clock();
    const tick = () => {
      if (disposed) return;
      animationFrame = requestAnimationFrame(tick);
      const dt = Math.min(clock.getDelta(), 0.04);
      if (active && modelReady) {
        const forward = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
        const strafe = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
        const magnitude = Math.hypot(forward, strafe) || 1;
        const f = forward / magnitude;
        const s = strafe / magnitude;
        const dx = (-Math.sin(player.yaw) * f + Math.cos(player.yaw) * s) * player.speed * dt;
        const dz = (-Math.cos(player.yaw) * f - Math.sin(player.yaw) * s) * player.speed * dt;
        // Split motion into short substeps and test the whole body at several heights.
        const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.5));
        for (let i = 0; i < steps; i++) {
          const sx = dx / steps;
          const sz = dz / steps;
          if (!collides(player.x + sx, player.z, sx, 0)) player.x += sx;
          if (!collides(player.x, player.z + sz, 0, sz)) player.z += sz;
        }
        camera.position.set(player.x, 1.62, player.z);
        camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
        if (!reachedMiddle && Math.hypot(player.x - goal.x, player.z - goal.z) < 1.35) {
          // Reaching the beacon ends Chapter 04: freeze movement and return the mouse to the victory screen.
          setReachedMiddle(true);
          setStatus('Chapter complete');
          active = false;
          setLocked(false);
          if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
        }
        // Falling or leaving the actual maze bounds counts as a death and changes corner.
        if (Math.abs(player.x) > 46 || Math.abs(player.z) > 46) respawn();
      }
      goalRing.rotation.z += dt * 0.28;
      goalAura.rotation.z -= dt * 0.12;
      orbitMarkers.rotation.y += dt * 0.38;
      energyColumn.material.opacity = 0.09 + (Math.sin(performance.now() * 0.002) + 1) * 0.035;
      beacon.position.y = 0.78 + Math.sin(performance.now() * 0.0018) * 0.08;
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resize);
      document.removeEventListener('pointerlockchange', onPointerLock);
      renderer.domElement.removeEventListener('click', onClick);
      if (document.pointerLockElement === renderer.domElement) document.exitPointerLock();
      renderer.dispose();
      modelRoot.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          mats.forEach((mat) => mat.dispose());
        }
      });
      host.removeChild(renderer.domElement);
    };
  }, []);

  return (
    <div className="game-shell school-shell cinematic-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">04</span><span>The Room Is Weird <span style={{opacity:.55}}>/ The Maze</span></span></div>
        <div className="topbar-right"><button className="secondary-button" type="button" onClick={onBack}>Back to chapters</button></div>
      </header>
      <main className="game-main">
        <div className="game-heading">
          <div><p className="eyebrow">Chapter 04 / The maze</p><h1>{reachedMiddle ? 'You found your way out.' : 'Every turn leads somewhere.'}</h1></div>
          <div className="chapter-pill"><b>{reachedMiddle ? 'CHAPTER COMPLETE' : 'NO EXIT MARKED'}</b> / {reachedMiddle ? 'VICTORY' : 'FIND THE CENTRE'}</div>
        </div>
        <section className="stage school-stage" aria-label="The maze 3D scene">
          <div ref={hostRef} className="school-scene-host" style={{cursor:locked?'none':'crosshair'}} />
          {locked && <div className="school-hud">
            <div className="objective"><small>Current objective</small><strong>{reachedMiddle ? 'Middle reached' : 'Reach the middle'}</strong></div>
            <div className="school-status"><span />{reachedMiddle ? 'OBJECTIVE COMPLETE' : 'YOU ARE NOT LOST. YET.'}</div>
            <div className="school-message" role="status">{loaded ? 'Find your way through. The walls are solid.' : status}</div>
            <div className="school-controls"><kbd>W A S D</kbd> MOVE <kbd>MOUSE</kbd> LOOK <kbd>R</kbd> RESTART MAZE <kbd>ESC</kbd> RELEASE</div>
          </div>}
          {!locked && <div className="overlay school-overlay">
            <div className="dialog-card">
              {reachedMiddle ? <>
                <div className="dialog-kicker">CHAPTER 04 / COMPLETE</div>
                <h2>YOU MADE IT.</h2>
                <p>You crossed the maze, found the centre, and made it out. This level is complete.</p>
                <div style={{display:'flex',gap:10,alignItems:'center',margin:'18px 0',padding:'14px 16px',border:'1px solid rgba(139,255,224,.35)',borderRadius:12,background:'rgba(55,190,170,.09)'}}>
                  <span style={{fontSize:28,color:'#8bffe0'}}>✦</span>
                  <div><strong style={{display:'block',letterSpacing:2}}>VICTORY</strong><span style={{opacity:.72,fontSize:12}}>THE MAZE — CLEARED</span></div>
                </div>
                <div className="dialog-buttons">
                  <button className="primary-button" type="button" onClick={onBack}>Finish / Back to chapters</button>
                </div>
              </> : <>
                <div className="dialog-kicker">CHAPTER 04 / THE MAZE</div>
                <h2>{loaded ? <>Find the<br/>middle.</> : 'Loading the maze…'}</h2>
                <p>{loaded ? 'Four corners. One centre. Find your way through the walls and reach the beacon. Retrying or returning starts you at an entrance.' : status}</p>
                <div className="dialog-buttons">
                  <button className="primary-button" type="button" disabled={!loaded} onClick={() => { const canvas = hostRef.current?.querySelector('canvas'); canvas?.requestPointerLock(); }}>Enter the maze</button>
                  <button className="secondary-button" type="button" onClick={onBack}>Back to Chapter 03</button>
                </div>
                <div className="title-controls"><span><kbd>WASD</kbd> move</span><span><kbd>MOUSE</kbd> look</span><span><kbd>R</kbd> restart</span></div>
              </>}
            </div>
          </div>}
          {locked && <div className="interaction-prompt" style={{left:'50%',top:'50%',transform:'translate(-50%,-50%)',pointerEvents:'none'}}>+</div>}
          {reachedMiddle && locked && <div className="school-message" style={{top:'auto',bottom:28}}>YOU REACHED THE MIDDLE</div>}
          {status.startsWith('Could not') && <div className="school-message" role="alert">{status}</div>}
        </section>
        <div className="footer-bar"><span><strong>Keep your bearings.</strong> The centre is closer than it looks.</span><span>{spawnName} / NO CHECKPOINTS</span></div>
      </main>
    </div>
  );
}
