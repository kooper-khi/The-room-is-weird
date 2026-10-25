import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type Props = { onBack: () => void; onNext?: () => void; devMode?: boolean; onChapterSelect?: (chapter: 1 | 2 | 3) => void };

export default function SchoolChapter({ onBack, onNext, devMode = false, onChapterSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<'title' | 'playing' | 'complete' | 'dead'>('title');
  const [objective, setObjective] = useState('Find the staff keycard');
  const [message, setMessage] = useState('The bell rang. Nobody else seems to have heard it.');
  const [hasCard, setHasCard] = useState(false);
  const [powerOn, setPowerOn] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const [fear, setFear] = useState(0);
  const [hint, setHint] = useState(false);
  const [interactionPrompt, setInteractionPrompt] = useState('');
  const [wirePuzzle, setWirePuzzle] = useState(false);
  const [wireMatches, setWireMatches] = useState<string[]>([]);
  const stateRef = useRef({ hasCard: false, powerOn: false, escaped: false, active: false });
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const resetSceneRef = useRef<(() => void) | null>(null);
  const wireSequenceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!hostRef.current) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    } catch {
      setMessage('This browser could not start 3D mode. Try enabling hardware acceleration.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
    renderer.setSize(hostRef.current.clientWidth, hostRef.current.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    hostRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#080c13');
    scene.fog = new THREE.FogExp2('#080c13', 0.035);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(72, hostRef.current.clientWidth / hostRef.current.clientHeight, .1, 90);
    camera.position.set(0, 1.65, 12);
    camera.rotation.order = 'YXZ';

    scene.add(new THREE.HemisphereLight('#8a9ab5', '#17151c', 1.1));
    const ambient = new THREE.AmbientLight('#72809c', .32);
    scene.add(ambient);
    // Emergency lighting is a real scene-wide change, not just a HUD message.
    const emergencyGlow = new THREE.PointLight('#d9efff', 0, 26, 1.35);
    emergencyGlow.position.set(0, 3.2, -4);
    scene.add(emergencyGlow);

    const material = (color: string, roughness = .9, emissive = '#000000') => new THREE.MeshStandardMaterial({ color, roughness, emissive, emissiveIntensity: .8 });
    // Procedural surface maps keep the scene self-contained: no external assets or downloads.
    const makeSurface = (base: string, grout: string, seed: number) => {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 512;
      const ctx = canvas.getContext('2d'); if (!ctx) return null;
      ctx.fillStyle = base; ctx.fillRect(0, 0, 512, 512);
      let n = seed >>> 0;
      const rand = () => { n = (n * 1664525 + 1013904223) >>> 0; return n / 4294967296; };
      const tile = 64;
      for (let y = 0; y < 512; y += tile) for (let x = 0; x < 512; x += tile) {
        ctx.fillStyle = `rgba(190,205,220,${rand() * .07})`; ctx.fillRect(x + 2, y + 2, tile - 4, tile - 4);
        ctx.fillStyle = `rgba(0,0,0,${(18 + rand() * 22) / 255})`; ctx.fillRect(x + 3, y + 3, tile - 6, tile - 6);
      }
      ctx.strokeStyle = grout; ctx.lineWidth = 3;
      for (let v = 0; v <= 512; v += tile) { ctx.beginPath(); ctx.moveTo(v, 0); ctx.lineTo(v, 512); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, v); ctx.lineTo(512, v); ctx.stroke(); }
      for (let i = 0; i < 1800; i++) { const a = rand() * .13; ctx.fillStyle = rand() > .5 ? `rgba(220,230,240,${a})` : `rgba(0,0,0,${a})`; ctx.fillRect(rand() * 512, rand() * 512, 1 + rand() * 5, 1 + rand() * 3); }
      const texture = new THREE.CanvasTexture(canvas); texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(2, 5); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
    };
    const addBox = (name: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, target?: string, emissive = '#000000') => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), material(color, .88, emissive));
      mesh.name = name;
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      if (target) mesh.userData.target = target;
      scene.add(mesh);
      return mesh;
    };

    // Worn corridor geometry, damaged architecture and practical fixtures.
    const floor = addBox('floor', 0, -.14, -5, 8, .25, 42, '#343a42');
    const floorMaterial = floor.material as THREE.MeshStandardMaterial;
    floorMaterial.map = makeSurface('#65707b', '#252d36', 82); floorMaterial.color.set('#d0d5da'); floorMaterial.needsUpdate = true;
    addBox('ceiling', 0, 4.1, -5, 8, .2, 42, '#171d26');
    // The left wall is built in sections so the collapsed section is a real opening,
    // not a painted rectangle laid over an intact wall.
    addBox('left wall front', -4.1, 1.95, -1.0, .2, 4, 34, '#606875');
    addBox('left wall far end', -4.1, 1.95, -23.2, .2, 4, 5.6, '#606875');
    addBox('broken wall lintel', -4.1, 3.45, -19.2, .2, .9, 2.4, '#565c63');
    addBox('broken wall lower edge', -4.1, .35, -19.2, .2, .7, 2.4, '#565c63');
    addBox('right wall', 4.1, 1.95, -5, .2, 4, 42, '#606875');
    addBox('left skirting front', -3.96, .12, -1.0, .08, .22, 34, '#252d37');
    addBox('left skirting far', -3.96, .12, -23.2, .08, .22, 5.6, '#252d37');
    addBox('right skirting', 3.96, .12, -5, .08, .22, 41.5, '#252d37');
    addBox('left cable tray', -3.65, 3.72, -5, .12, .12, 41, '#242c37');
    addBox('right cable tray', 3.65, 3.72, -5, .12, .12, 41, '#242c37');
    addBox('ceiling pipe', -2.9, 3.83, -5, .09, .09, 41, '#68717d');
    addBox('ceiling pipe', 2.9, 3.83, -5, .09, .09, 41, '#68717d');
    for (let z = 13; z >= -25; z -= 2) addBox('floor tile seam', 0, -.008, z, 7.8, .012, .025, '#222a33');

    // Four full-depth steel school lockers: open backs, side walls, shelves, vents,
    // rolled edges, hinges, hasps and a real hinged door for each one.
    let cardLockerIndex = Math.floor(Math.random() * 4);
    const lockerPositions = [-2.5, 1.5, -7.5, -11.5];
    const lockerMetal = material('#34434f', .48);
    const lockerEdge = material('#7c8991', .42);
    lockerPositions.forEach((z, i) => {
      const x = i % 2 === 0 ? -3.57 : 3.57;
      const side = x < 0 ? -1 : 1;
      const label = `locker-${i + 1}`;
      const shell = new THREE.Group(); shell.name = `${label}-shell`; shell.position.set(x, 0, z); scene.add(shell);
      const part = (name: string, px: number, py: number, pz: number, sx: number, sy: number, sz: number, mat: THREE.Material) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); m.name = name;
        m.position.set(px, py, pz); m.castShadow = true; m.receiveShadow = true; shell.add(m); return m;
      };
      part(`${label}-back`, 0, .99, -.22, .66, 1.96, .045, lockerMetal);
      part(`${label}-side-left`, -.33, .99, 0, .045, 1.98, .48, lockerMetal);
      part(`${label}-side-right`, .33, .99, 0, .045, 1.98, .48, lockerMetal);
      part(`${label}-top`, 0, 1.98, 0, .68, .045, .5, lockerEdge);
      part(`${label}-base`, 0, .025, 0, .68, .05, .5, lockerEdge);
      part(`${label}-bottom`, 0, .12, 0, .63, .035, .45, lockerMetal);
      for (let shelf = 0; shelf < 3; shelf++) {
        part(`${label}-shelf-${shelf}`, 0, .38 + shelf * .49, -.015, .61, .025, .4, lockerEdge);
        part(`${label}-shelf-lip-${shelf}`, 0, .405 + shelf * .49, .18, .61, .025, .025, lockerMetal);
      }
      // Hinged door is a pivot group, so opening it reveals the actual interior.
      const hinge = new THREE.Group(); hinge.name = `${label}-hinge`;
      hinge.position.set(-.34, .99, .25); shell.add(hinge);
      const door = new THREE.Mesh(new THREE.BoxGeometry(.68, 1.94, .055), material(i === 1 ? '#46535c' : '#2b3d49', .42));
      door.name = `${label}-door`; door.position.set(.34, 0, 0); door.castShadow = true; door.receiveShadow = true;
      door.userData.target = label; door.userData.lockerIndex = i; hinge.add(door);
      const raisedPanel = new THREE.Mesh(new THREE.BoxGeometry(.55, 1.67, .018), material('#263641', .55));
      raisedPanel.position.set(.34, 0, .037); hinge.add(raisedPanel);
      for (let vent = 0; vent < 7; vent++) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(.19, .018, .02), material('#0b1218', .65));
        slot.position.set(.34, .58 - vent * .055, .05); hinge.add(slot);
      }
      for (const yy of [-.78, .78]) {
        const hingeBar = new THREE.Mesh(new THREE.BoxGeometry(.035, .16, .08), lockerEdge);
        hingeBar.position.set(.025, yy, -.01); hinge.add(hingeBar);
      }
      const handle = new THREE.Mesh(new THREE.BoxGeometry(.045, .19, .045), lockerEdge);
      handle.position.set(.57, -.02, .07); handle.name = `${label}-handle`; hinge.add(handle);
      const latch = new THREE.Mesh(new THREE.BoxGeometry(.07, .1, .04), material('#9b794c', .45));
      latch.position.set(.57, -.02, .1); hinge.add(latch);
      // Tiny rust streaks and scratches break up the clean, game-like surfaces.
      for (let mark = 0; mark < 8; mark++) {
        const scratch = new THREE.Mesh(new THREE.BoxGeometry(.008 + (mark % 3) * .005, .035 + (mark % 2) * .025, .006), material(mark % 2 ? '#77818a' : '#5b4339', .9));
        scratch.position.set(-.2 + (mark % 4) * .13, -.68 + Math.floor(mark / 4) * .12, .034); hinge.add(scratch);
      }
      // Every locker can contain the keycard. A new locker is chosen each run.
      if (i === 1) {
        const books = ['#8d3e43', '#c0a06b', '#4b6b65'];
        books.forEach((c, b) => {
          const book = new THREE.Mesh(new THREE.BoxGeometry(.27, .045, .2), material(c, .9));
          book.position.set(-.12 + b * .07, .46 + b * .05, .015); book.rotation.y = (b - 1) * .14; shell.add(book);
        });
      }
      const card = new THREE.Mesh(new THREE.BoxGeometry(.22, .018, .14), new THREE.MeshStandardMaterial({ color:'#d7e3df', metalness:.25, roughness:.3, emissive:'#8bffe0', emissiveIntensity:.9 }));
      card.name = i === cardLockerIndex ? 'staff keycard' : `decoy-card-${i}`;
      card.userData.cardIndex = i;
      card.userData.target = 'keycard';
      card.position.set(i % 2 === 0 ? -.08 : .08, .54, .19); card.rotation.y = -.16; card.visible = false; card.renderOrder = 3; shell.add(card);
      const cardGlow = new THREE.PointLight('#8bffe0', .8, 1.8, 2); cardGlow.position.set(.1, .65, .31); cardGlow.name = i === cardLockerIndex ? 'keycard glow' : `decoy-glow-${i}`; shell.add(cardGlow); cardGlow.visible = false;
      // Locker one is empty; locker three has a bent panel; locker four has coats on a hook.
      if (i === 2) {
        const dent = part(`${label}-dent`, .12, 1.45, .24, .23, .32, .025, material('#263640'));
        dent.rotation.z = .17;
      }
      if (i === 3) {
        for (let coat = 0; coat < 2; coat++) {
          const hanging = new THREE.Mesh(new THREE.BoxGeometry(.2, .52, .12), material(coat ? '#4a3439' : '#35434c'));
          hanging.position.set(-.12 + coat * .2, 1.38, -.04); shell.add(hanging);
        }
      }
    });
    // One locker is bent open, with its door hanging at an angle and dark interior visible.
    const brokenLocker = new THREE.Group(); brokenLocker.position.set(-3.65, .95, -16.5); brokenLocker.rotation.y = -.18; scene.add(brokenLocker);
    const lockerShell = new THREE.Mesh(new THREE.BoxGeometry(.45, 1.9, .7), material('#26343e')); lockerShell.castShadow = true; lockerShell.receiveShadow = true; brokenLocker.add(lockerShell);
    const brokenDoor = new THREE.Mesh(new THREE.BoxGeometry(.48, 1.82, .06), material('#53606a')); brokenDoor.position.set(-.18, -.03, .39); brokenDoor.rotation.y = -.85; brokenDoor.rotation.z = .12; brokenDoor.castShadow = true; brokenLocker.add(brokenDoor);
    const jagged = material('#89919a');
    for (let i = 0; i < 5; i++) { const shard = new THREE.Mesh(new THREE.BoxGeometry(.025, .12, .045), jagged); shard.position.set(-.35 + i * .07, -.78 + (i % 2) * .05, .42); shard.rotation.z = (i % 2 ? -1 : 1) * .3; brokenLocker.add(shard); }
    // Broken wall plaster exposes cracked concrete and dark brick behind it.
    // Keep the centre of the breach open: only jagged plaster edges and exposed brick remain.
    for (let edge = 0; edge < 8; edge++) {
      const shard = new THREE.Mesh(new THREE.BoxGeometry(.075, .18 + (edge % 3) * .09, .12), material('#77736c'));
      shard.position.set(-4.0, .95 + (edge % 4) * .58, -20.25 + Math.floor(edge / 4) * 2.05);
      shard.rotation.z = (edge % 2 ? 1 : -1) * .2; shard.castShadow = true; scene.add(shard);
    }
    for (let i = 0; i < 9; i++) {
      const brick = addBox('exposed brick', -3.92, 1.45 + (i % 4) * .3, -20.05 + Math.floor(i / 4) * .56 + (i % 2) * .12, .07, .18, .48, i % 2 ? '#543c39' : '#634741');
      brick.rotation.x = (i % 3 - 1) * .08;
    }
    for (let i = 0; i < 7; i++) {
      const plaster = new THREE.Mesh(new THREE.ConeGeometry(.13 + (i % 3) * .04, .35 + (i % 2) * .18, 3), material('#8b8982'));
      plaster.position.set(-3.86, 1.4 + (i % 4) * .28, -20.1 + i * .29); plaster.rotation.z = (i % 2 ? 1 : -1) * .5; plaster.castShadow = true; scene.add(plaster);
    }
    // COLLAPSE ZONE: broken concrete slabs, brick rubble, snapped conduit and dangling rebar.
    const rubbleMats = ['#6e7479', '#4c535b', '#8b8982', '#563d38', '#353b43'].map(c => material(c, .98));
    for (let i = 0; i < 42; i++) {
      const size = .12 + ((i * 7) % 9) * .035;
      const chunk = new THREE.Mesh(new THREE.BoxGeometry(size * (1 + (i % 3)), size * .55, size * (.7 + (i % 4) * .18)), rubbleMats[i % rubbleMats.length]);
      chunk.position.set(-3.15 + ((i * 13) % 17) * .19, .03 + (i % 3) * .035, -18.1 - ((i * 11) % 19) * .22);
      chunk.rotation.set((i % 5) * .11, (i % 7) * .24, (i % 4) * .18);
      chunk.castShadow = true; chunk.receiveShadow = true; scene.add(chunk);
    }
    // Torn cables hang from the ceiling and wall cavity.
    for (let i = 0; i < 5; i++) {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(.018, .025, 1.05 + (i % 3) * .3, 6), material(i % 2 ? '#171b20' : '#9b1e2a'));
      cable.position.set(-3.7 + (i % 3) * .13, 2.65 - (i % 2) * .12, -19.0 - i * .22);
      cable.rotation.z = (i % 2 ? 1 : -1) * (.28 + i * .08); cable.rotation.x = .2; cable.castShadow = true; scene.add(cable);
      const copper = new THREE.Mesh(new THREE.ConeGeometry(.045, .11, 5), material('#c77d45', .6, '#4c2010'));
      copper.position.copy(cable.position); copper.position.y -= .58; scene.add(copper);
    }
    // A missing ceiling panel exposes the dark void and bent metal supports.
    addBox('ceiling collapse shadow', -1.4, 3.97, -18.8, 2.5, .035, 3.4, '#05070b');
    for (let i = 0; i < 6; i++) {
      const beam = new THREE.Mesh(new THREE.BoxGeometry(.045, .06, 2.5), material('#59616b', .7));
      beam.position.set(-2.45 + i * .4, 3.82 - (i % 2) * .12, -18.8 + (i % 3) * .4);
      beam.rotation.z = (i % 2 ? .13 : -.09); beam.castShadow = true; scene.add(beam);
    }
    // Spawn-area damage: make the first steps feel like the school has already been torn apart.
    const bloodMat = new THREE.MeshStandardMaterial({ color:'#3b080f', roughness:.28, metalness:.05, emissive:'#190207', emissiveIntensity:.12, side:THREE.DoubleSide });
    for (const stain of [{x:-1.1,y:.018,z:9.1,sx:.72,sz:1.2},{x:1.65,y:.018,z:6.4,sx:.48,sz:.85},{x:-2.55,y:.018,z:2.6,sx:.56,sz:1.05},{x:3.82,y:.018,z:-5.2,sx:.62,sz:1.15},{x:-2.55,y:.019,z:-10.4,sx:.42,sz:.8},{x:1.85,y:.02,z:-22.1,sx:.75,sz:.6}]) {
      const patch = new THREE.Mesh(new THREE.CircleGeometry(1, 11), bloodMat); patch.rotation.x = -Math.PI/2; patch.position.set(stain.x, stain.y, stain.z); patch.scale.set(stain.sx, stain.sz, 1); scene.add(patch);
      for (let drip = 0; drip < 4; drip++) { const drop = new THREE.Mesh(new THREE.SphereGeometry(.035 + drip*.006, 6, 5), bloodMat); drop.scale.set(1,.22,1.8); drop.position.set(stain.x + (drip-1.5)*.16, .025, stain.z + .18 + drip*.13); scene.add(drop); }
    }
    // Broken ceiling panels and wall fragments at the entrance, plus a smashed light cover.
    for(let i=0;i<13;i++){const debris=new THREE.Mesh(new THREE.BoxGeometry(.12+(i%3)*.12,.035+(i%2)*.04,.14+(i%4)*.07),rubbleMats[(i+2)%rubbleMats.length]);debris.position.set(-2.6+((i*7)%13)*.42,.035,-1.5+((i*5)%11)*.9);debris.rotation.set(i*.13,i*.27,i*.19);debris.castShadow=true;scene.add(debris);}
    for(let i=0;i<5;i++){const crack=new THREE.Mesh(new THREE.BoxGeometry(.018,.012,.65+(i%2)*.4),material('#171b20'));crack.position.set(-2.8+i*.42,.008,8.4-i*.78);crack.rotation.y=(i%2?.45:-.35);scene.add(crack);}
    for (let area = 0; area < 3; area++) {
      for (let i = 0; i < 9; i++) {
        const chunk = new THREE.Mesh(new THREE.BoxGeometry(.08+(i%3)*.05,.04+(i%2)*.04,.09+(i%4)*.04), rubbleMats[(i+area)%rubbleMats.length]);
        chunk.position.set((area===0?-2.7:area===1?2.8:0.4) + Math.sin(i*4.3)*.7, .03, -4-area*7-Math.cos(i*2.1)*.8);
        chunk.rotation.set(i*.17,i*.31,i*.13); chunk.castShadow=true; scene.add(chunk);
      }
    }
    // Long cracks radiate away from the impact site, with dark seams beneath broken plaster.
    for (let i = 0; i < 11; i++) {
      const crack = new THREE.Mesh(new THREE.BoxGeometry(.012, .012, 1.1 + (i % 4) * .32), material('#171b20'));
      crack.position.set(-3.72 + (i % 4) * .18, .006, -16.9 - i * .34);
      crack.rotation.y = (i % 2 ? .35 : -.4); scene.add(crack);
    }

    const fluorescentLights: THREE.PointLight[] = [];
    const damagedLights = new Set<THREE.PointLight>();
    for (let i = 0, z = 14; z >= -24; z -= 4, i++) {
      const broken = i === 1 || i === 4 || i === 7;
      const fixture = addBox('fluorescent fixture', 0, 3.96, z, 1.9, .045, .38, broken ? '#55232b' : '#b9d5df', undefined, broken ? '#ff2038' : '#8dbde0');
      if (broken) {
        const red = new THREE.PointLight('#ff142e', 2.5, 8, 2); red.position.set(0, 3.45, z); scene.add(red); fluorescentLights.push(red); damagedLights.add(red);
        addBox('broken light housing', 0, 3.91, z, 2.05, .1, .48, '#27232b');
        for (let shard = 0; shard < 4; shard++) { const glass = addBox('broken fluorescent glass', -.65 + shard * .4, 3.88, z + (shard % 2) * .13, .3, .025, .04, '#ff3347', undefined, '#ff2038'); glass.rotation.z = (shard % 2 ? -.18 : .15); }
      } else {
        const light = new THREE.PointLight('#b5d5ff', 1.25, 9, 2); light.position.set(0, 3.55, z); scene.add(light); fluorescentLights.push(light);
      }
      addBox('noticeboard', -3.96, 2.25, z - 1.1, .06, .9, 1.3, '#8b6247');
      // Heavy classroom doors with recessed dark glass, timber/metal frames and visible handles.
      addBox('right door frame left', 3.91, 1.38, z - 3.02, .16, 2.85, .12, '#77756f');
      addBox('right door frame right', 3.91, 1.38, z - .78, .16, 2.85, .12, '#77756f');
      addBox('right door frame top', 3.91, 2.82, z - 1.9, .16, .12, 2.35, '#77756f');
      addBox('right classroom door', 3.98, 1.35, z - 1.9, .08, 2.7, 2.1, '#423a37');
      addBox('right door window', 3.91, 2.05, z - 1.9, .035, .55, .8, '#1c3440');
      addBox('right door handle', 3.87, 1.22, z - 1.15, .055, .18, .055, '#b6a37c');
      addBox('right door kick plate', 3.91, .35, z - 1.9, .035, .28, 1.1, '#555d63');
    }
    // A distant exit door and readable, luminous EXIT sign.
    addBox('far wall', 0, 2, -26.2, 8.3, 4.2, .25, '#454b55');
    addBox('exit frame left', -.94, 1.48, -25.82, .16, 3.02, .18, '#85847b');
    addBox('exit frame right', .94, 1.48, -25.82, .16, 3.02, .18, '#85847b');
    addBox('exit frame top', 0, 3.0, -25.82, 1.98, .16, .18, '#85847b');
    addBox('exit door', 0, 1.45, -25.95, 1.7, 2.9, .12, '#202d37', 'exit');
    addBox('exit door inset', 0, 1.55, -25.86, 1.35, 2.45, .025, '#293b43');
    addBox('exit door window', 0, 2.35, -25.83, .5, .48, .035, '#10191d');
    addBox('exit handle', .62, 1.3, -25.81, .055, .22, .05, '#b6a37c');
    addBox('exit sign', 0, 3.25, -25.75, 1.35, .36, .1, '#4e141d', undefined, '#ff172f');
    addBox('exit sign cracked panel', 0, 3.25, -25.68, 1.14, .22, .025, '#d8182e', undefined, '#ff2038');
    addBox('exit sign broken half', .38, 3.25, -25.64, .35, .19, .03, '#290a10');
    addBox('exit sign glow', 0, 3.25, -25.58, 1.2, .035, .02, '#ff3b4c', undefined, '#ff2038');
    const exitTextCanvas = document.createElement('canvas'); exitTextCanvas.width = 256; exitTextCanvas.height = 64;
    const exitCtx = exitTextCanvas.getContext('2d');
    if (exitCtx) { exitCtx.fillStyle = '#e6f2e6'; exitCtx.font = 'bold 42px Arial'; exitCtx.textAlign = 'center'; exitCtx.fillText('EXI', 106, 46); }
    const exitTextTexture = new THREE.CanvasTexture(exitTextCanvas); exitTextTexture.colorSpace = THREE.SRGBColorSpace;
    const exitText = new THREE.Mesh(new THREE.PlaneGeometry(.92,.23), new THREE.MeshBasicMaterial({map:exitTextTexture, transparent:true})); exitText.position.set(-.06,3.25,-25.55); scene.add(exitText);
    const exitGlowLight = new THREE.PointLight('#ff182f', 1.8, 5); exitGlowLight.position.set(0,3.05,-25.25); scene.add(exitGlowLight);
    // Hidden clue: an unusual noticeboard reveals the switch location after inspection.
    addBox('maintenance noticeboard', -3.91, 2.15, -4.6, .04, .95, 1.2, '#5a4637', 'notice');
    addBox('notice paper', -3.88, 2.16, -4.6, .025, .76, .91, '#b5a78a');
    addBox('notice red pin', -3.85, 2.42, -4.6, .025, .06, .06, '#a12d36', undefined, '#a12d36');
    // Card is hidden inside locker 2 and is only revealed by opening that locker.
    // The card mesh is created inside locker 2 above and stays hidden until its door opens.
    // The light switch is tucked behind a loose wall panel, not directly marked as an objective.
    addBox('loose maintenance panel', -3.91, 1.65, -17.7, .06, .65, .55, '#777d83', 'panel');
    addBox('panel screw one', -3.87, 1.9, -17.9, .025, .045, .045, '#252a31');
    addBox('panel screw two', -3.87, 1.4, -17.5, .025, .045, .045, '#252a31');
    addBox('red cable to panel', -3.86, 2.35, -17.7, .025, .025, 1.2, '#9b1e2a', undefined, '#b41d30');
    const hiddenSwitch = addBox('hidden light switch', -3.78, 1.65, -17.7, .035, .2, .14, '#252b31', 'switch');
    hiddenSwitch.visible = false;
    addBox('breaker cabinet', 3.85, 1.7, -13.2, .12, .85, .7, '#a3aab2', 'breaker');
    addBox('cabinet indicator', 3.76, 1.8, -13.2, .025, .13, .13, '#d64c43', undefined, '#d64c43');
    // The pursuer is a tall silhouette that waits until the keycard is collected.
    const stalker = new THREE.Group();
    stalker.name = 'stalker';
    stalker.visible = false;
    const creatureSkin = new THREE.MeshStandardMaterial({color:'#050609',roughness:.96,metalness:.04});
    const organicBodyGeometry = new THREE.CapsuleGeometry(.34,1.18,7,14);
    const bodyPositions = organicBodyGeometry.attributes.position as THREE.BufferAttribute;
    for(let v=0;v<bodyPositions.count;v++){const x=bodyPositions.getX(v),y=bodyPositions.getY(v),z=bodyPositions.getZ(v);const ripple=Math.sin(y*13+x*17+z*11)*.035+Math.sin(y*27-z*19)*.018;bodyPositions.setXYZ(v,x+ripple,y,z+ripple*.8);} organicBodyGeometry.computeVertexNormals();
    const body = new THREE.Mesh(organicBodyGeometry, creatureSkin);
    body.position.set(0, 1.08, .02); body.scale.set(.9, 1.12, .72); body.rotation.z = -.08; body.castShadow = true;
    stalker.add(body);
    // Narrow, forward-thrust head and ragged shoulder silhouette; deliberately not a human mannequin.
    const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 10), material('#010204'));
    head.position.set(.025, 1.98, -.08); head.scale.set(.68, 1.28, .76); head.rotation.z = -.22; head.castShadow = true;
    stalker.add(head);
    // Ragged horn growths, exposed rib ridges and trailing tendrils give the shadow a less mannequin-like silhouette.
    for(let horn=0;horn<5;horn++){const spike=new THREE.Mesh(new THREE.ConeGeometry(.065+(horn%2)*.035,.34+(horn%3)*.1,5),creatureSkin);spike.position.set((horn-2)*.105,2.18+(horn%2)*.06,-.03);spike.rotation.z=(horn-2)*.22;spike.castShadow=true;stalker.add(spike);}
    for(let rib=0;rib<5;rib++){const ridge=new THREE.Mesh(new THREE.TorusGeometry(.23+rib*.012,.025,5,10,Math.PI*1.25),material('#11151b',1));ridge.position.set(0,1.26-rib*.14,-.21);ridge.rotation.z=Math.PI;ridge.scale.set(1.1,.72,1);stalker.add(ridge);}
    // Sculptural back-spines and torn hanging mantle break the silhouette away from a plain humanoid.
    for (let spine = 0; spine < 7; spine++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(.055 + (spine % 3) * .018, .3 + (spine % 2) * .16, 5), material('#11151a', .94));
      spike.position.set((spine % 2 ? 1 : -1) * (.22 + (spine % 3) * .035), 1.72 - spine * .19, .22);
      spike.rotation.z = (spine % 2 ? 1 : -1) * .55; spike.rotation.x = -.25; spike.castShadow = true; stalker.add(spike);
    }
    for (let flap = 0; flap < 6; flap++) {
      const shard = new THREE.Mesh(new THREE.ConeGeometry(.11 + (flap % 2) * .05, .48 + (flap % 3) * .12, 4), material('#080a0e', 1));
      shard.position.set((flap - 2.5) * .105, .83 - (flap % 3) * .14, .16);
      shard.rotation.z = (flap - 2.5) * .16; shard.rotation.x = Math.PI; shard.castShadow = true; stalker.add(shard);
    }
    // A narrow split maw with a faint inner glow is visible when the lights hit its face.
    const maw = new THREE.Mesh(new THREE.ConeGeometry(.075, .28, 3), material('#35030d', .4, '#9d001e'));
    maw.position.set(0, 1.78, -.39); maw.rotation.x = -.2; maw.rotation.z = Math.PI; stalker.add(maw);
    const eyeGlow = new THREE.PointLight('#ff173e', .55, 2.2, 2); eyeGlow.position.set(0, 1.98, -.48); stalker.add(eyeGlow);
    for(let tendril=0;tendril<4;tendril++){const tail=new THREE.Mesh(new THREE.ConeGeometry(.055,.75+(tendril%2)*.35,5),creatureSkin);tail.position.set((tendril-1.5)*.16,.8,-.12);tail.rotation.z=(tendril-1.5)*.42;tail.rotation.x=.25;stalker.add(tail);}
    const faceWedge = new THREE.Mesh(new THREE.ConeGeometry(.19, .48, 5), material('#010204'));
    faceWedge.position.set(0, 1.78, -.28); faceWedge.rotation.x = -.32; faceWedge.rotation.z = Math.PI; faceWedge.scale.set(.8, 1, .7); stalker.add(faceWedge);
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.SphereGeometry(.22, 8, 7), material('#020306'));
      shoulder.position.set(side * .31, 1.49, .01); shoulder.scale.set(1.25, .72, .8); shoulder.rotation.z = side * -.18; shoulder.castShadow = true; stalker.add(shoulder);
    }
    for (const x of [-.12, .12]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(.052, 10, 8), material('#ff334c', .25, '#ff0a32'));
      eye.position.set(x, 2, -.27); stalker.add(eye);
    }
    // Unnaturally long arms, hooked fingers and crooked legs make the silhouette read as a creature.
    const limbMat = material('#020306', 1);
    const limb = (name: string, a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
      const direction = new THREE.Vector3().subVectors(b, a);
      const mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(.05, direction.length() - radius * 2), 3, 6), limbMat);
      mesh.name = name; mesh.position.copy(a).add(b).multiplyScalar(.5);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); mesh.castShadow = true; stalker.add(mesh);
    };
    for (const side of [-1, 1]) {
      limb('long upper arm', new THREE.Vector3(side * .25, 1.48, 0), new THREE.Vector3(side * .52, .98, -.03), .13);
      limb('long forearm', new THREE.Vector3(side * .52, .98, -.03), new THREE.Vector3(side * .68, .34, -.12), .095);
      for (let finger = 0; finger < 3; finger++) {
        limb('hooked shadow finger', new THREE.Vector3(side * (.68 + finger * .035), .36, -.12), new THREE.Vector3(side * (.72 + finger * .06), .12, -.22), .025);
      }
      limb('crooked thigh', new THREE.Vector3(side * .2, .58, 0), new THREE.Vector3(side * .27, .28, .02), .14);
      limb('shank', new THREE.Vector3(side * .27, .28, .02), new THREE.Vector3(side * .22, .04, -.08), .08);
    }
    const ragged = new THREE.Mesh(new THREE.ConeGeometry(.39, .75, 7), limbMat);
    ragged.position.set(0, .35, .05); ragged.rotation.x = Math.PI; stalker.add(ragged);
    stalker.position.set(0, 0, -19);
    scene.add(stalker);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(0, 0);
    const keys = new Set<string>();
    let yaw = 0;
    let pitch = 0;
    let lastTime = 0;
    let anim = 0;
    let catchTimer: number | undefined;
    let cutsceneStartedAt = 0;
    let cutsceneActive = false;
    let lastHit = 0;
    let switchFound = false;
    const openedLockers = new Set<number>();
    const interactables: THREE.Object3D[] = [];
    scene.traverse(o => { if (o.userData.target) interactables.push(o); });
    const revealSwitch = () => {
      switchFound = true;
      const panel = scene.getObjectByName('loose maintenance panel'); if (panel) panel.visible = false;
      const one = scene.getObjectByName('panel screw one'); if (one) one.visible = false;
      const two = scene.getObjectByName('panel screw two'); if (two) two.visible = false;
      const sw = scene.getObjectByName('hidden light switch'); if (sw) sw.visible = true;
    };
    wireSequenceRef.current = () => {
      const s = stateRef.current; s.powerOn = true; s.active = false; keys.clear(); setPowerOn(true); setWirePuzzle(false);
      const indicator = scene.getObjectByName('cabinet indicator') as THREE.Mesh | undefined;
      if (indicator) (indicator.material as THREE.MeshStandardMaterial).color.set('#42ff9d');
      // Snap the corridor from sickly emergency red to working fluorescent light.
      ambient.color.set('#d7e7ff'); ambient.intensity = 1.65;
      scene.background = new THREE.Color('#24364a'); if (scene.fog instanceof THREE.FogExp2) { scene.fog.color.set('#24364a'); scene.fog.density = .012; }
      emergencyGlow.intensity = 2.2;
      // Bring every corridor light online, including damaged fixtures, and make the tubes visibly glow.
      fluorescentLights.forEach(light => { light.color.set('#d8efff'); light.intensity = 5.2; light.distance = 15; light.decay = 1.35; });
      scene.traverse(object => { if (object.name === 'fluorescent fixture' && object instanceof THREE.Mesh) { const mat = object.material as THREE.MeshStandardMaterial; mat.color.set('#eaf7ff'); mat.emissive.set('#b8e5ff'); mat.emissiveIntensity = 2.8; mat.needsUpdate = true; } });
      setObjective('RUN to the EXIT door at the end of the corridor'); setMessage('POWER RESTORED. The corridor erupts in light. Something is above youâ€¦'); setFear(2);
      // A short, synthesised creature growl: no external audio asset required.
      try { const AudioCtx = window.AudioContext || (window as any).webkitAudioContext; if (AudioCtx) { const audio = new AudioCtx(); void audio.resume(); const osc = audio.createOscillator(); const sub = audio.createOscillator(); const filter = audio.createBiquadFilter(); const gain = audio.createGain(); osc.type = 'sawtooth'; osc.frequency.setValueAtTime(92, audio.currentTime); osc.frequency.exponentialRampToValueAtTime( 42, audio.currentTime + 1.15); sub.type = 'triangle'; sub.frequency.setValueAtTime(43, audio.currentTime); sub.frequency.exponentialRampToValueAtTime(31, audio.currentTime + 1.3); filter.type = 'lowpass'; filter.frequency.setValueAtTime(520, audio.currentTime); filter.frequency.exponentialRampToValueAtTime(180, audio.currentTime + 1.25); gain.gain.setValueAtTime(.0001, audio.currentTime); gain.gain.exponentialRampToValueAtTime(.16, audio.currentTime + .12); gain.gain.setTargetAtTime(.0001, audio.currentTime + .95, .18); osc.connect(filter); sub.connect(filter); filter.connect(gain); gain.connect(audio.destination); osc.start(); sub.start(); osc.stop(audio.currentTime + 1.5); sub.stop(audio.currentTime + 1.5); window.setTimeout(() => { void audio.close(); }, 1800); } } catch { /* Audio is optional if the browser blocks it. */ }
      // Forced camera turn; the creature drops farther down the corridor to give the player a head start.
      yaw = Math.PI; pitch = 0; camera.rotation.set(0, yaw, 0, 'YXZ');
      stalker.position.set(camera.position.x, 7.2, camera.position.z + 10.5); stalker.visible = true;
      cutsceneStartedAt = performance.now(); cutsceneActive = true;
      void renderer.domElement.requestPointerLock?.(); if (catchTimer !== undefined) window.clearTimeout(catchTimer);
    };
    resetSceneRef.current = () => {
      openedLockers.clear(); switchFound = false;
      for (let i = 1; i <= 4; i++) {
        const hinge = scene.getObjectByName(`locker-${i}-hinge`) as THREE.Group | undefined;
        if (hinge) hinge.rotation.set(0, 0, 0);
      }
      cardLockerIndex = Math.floor(Math.random() * 4);
      for (let i = 0; i < 4; i++) {
        const shell = scene.getObjectByName(`locker-${i + 1}-shell`);
        const oldCard = shell?.children.find(o => o.userData.cardIndex === i);
        const oldGlow = shell?.children.find(o => o instanceof THREE.PointLight && (o.name === 'keycard glow' || o.name.startsWith('decoy-glow-')));
        if (oldCard) { oldCard.name = i === cardLockerIndex ? 'staff keycard' : `decoy-card-${i}`; oldCard.userData.target = i === cardLockerIndex ? 'keycard' : undefined; oldCard.visible = false; }
        if (oldGlow) { oldGlow.name = i === cardLockerIndex ? 'keycard glow' : `decoy-glow-${i}`; oldGlow.visible = false; }
      }
      const card = scene.getObjectByName('staff keycard'); if (card) card.visible = false;
      const cardGlow = scene.getObjectByName('keycard glow'); if (cardGlow) cardGlow.visible = false;
      const panel = scene.getObjectByName('loose maintenance panel'); if (panel) panel.visible = true;
      const one = scene.getObjectByName('panel screw one'); if (one) one.visible = true;
      const two = scene.getObjectByName('panel screw two'); if (two) two.visible = true;
      const sw = scene.getObjectByName('hidden light switch'); if (sw) sw.visible = false;
      const indicator = scene.getObjectByName('cabinet indicator') as THREE.Mesh | undefined;
      if (indicator) (indicator.material as THREE.MeshStandardMaterial).color.set('#d64c43');
      camera.position.set(0, 1.65, 12); yaw = 0; pitch = 0; camera.rotation.set(0, 0, 0, 'YXZ');
      stalker.position.set(0, 0, -19); stalker.visible = false; cutsceneActive = false; cutsceneStartedAt = 0;
      ambient.color.set('#72809c'); ambient.intensity = .32; emergencyGlow.intensity = 0;
      scene.background = new THREE.Color('#080c13'); if (scene.fog instanceof THREE.FogExp2) { scene.fog.color.set('#080c13'); scene.fog.density = .035; }
      scene.traverse(object => { if (object.name === 'fluorescent fixture' && object instanceof THREE.Mesh) { const mat = object.material as THREE.MeshStandardMaterial; mat.color.set('#b9d5df'); mat.emissive.set('#8dbde0'); mat.emissiveIntensity = .45; mat.needsUpdate = true; } });
      fluorescentLights.forEach(light => { light.color.set(damagedLights.has(light) ? '#ff142e' : '#b5d5ff'); light.intensity = damagedLights.has(light) ? 2.5 : .48; });
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (['w','a','s','d','shift','e','arrowup','arrowdown','arrowleft','arrowright'].includes(key)) keys.add(key);
      if (key !== 'e' || !stateRef.current.active) return;
      // Reliable interaction: use the thing the camera is aimed at when possible, then fall back
      // to the nearest reachable target. This avoids tiny locker handles making the keycard impossible to find.
      raycaster.setFromCamera(pointer, camera);
      const candidates = interactables.filter(o => {
        let node: THREE.Object3D | null = o;
        while (node) { if (!node.visible) return false; node = node.parent; }
        return true;
      }).map(o => ({ object: o, distance: camera.position.distanceTo(o.getWorldPosition(new THREE.Vector3())) }))
        .filter(item => item.distance < 3.25);
      const hits = raycaster.intersectObjects(interactables.filter(o => o.visible), false);
      const aimed = hits.find(h => h.distance < 3.25)?.object;
      const visibleCard = scene.getObjectByName('staff keycard');
      const cardDistance = visibleCard ? camera.position.distanceTo(visibleCard.getWorldPosition(new THREE.Vector3())) : Infinity;
      // Once locker two is open, prioritise the card over its door so a second E always collects it.
      const object = visibleCard?.visible && cardDistance < 3.25
        ? visibleCard
        : aimed ?? candidates.sort((a, b) => a.distance - b.distance)[0]?.object;
      const target = object?.userData.target as string | undefined;
      if (!target) { setMessage('Move closer to a locker, noticeboard, damaged panel or EXIT, then press E.'); return; }
      const s = stateRef.current;
      if (target.startsWith('locker-')) {
        const index = Number(target.split('-')[1]) - 1;
        const door = scene.getObjectByName(`locker-${index + 1}-door`) as THREE.Mesh | undefined;
        const hinge = scene.getObjectByName(`locker-${index + 1}-hinge`) as THREE.Group | undefined;
        if (openedLockers.has(index)) { setMessage('This locker is already open.'); return; }
        openedLockers.add(index);
        if (hinge) hinge.rotation.y = index % 2 === 0 ? -1.45 : 1.45;
        if (door) door.material = material('#52616b', .48);
        if (index === cardLockerIndex) {
          const card = scene.getObjectByName('staff keycard'); if (card) card.visible = true;
          const cardGlow = scene.getObjectByName('keycard glow'); if (cardGlow) cardGlow.visible = true;
          setMessage(`KEYCARD FOUND â€” locker ${index + 1}. The glowing card is inside. Press E again to collect it.`);
        } else if (index === 0) setMessage('Empty. A torn timetable and a smell of wet metal.');
        else if (index === 2) setMessage('Jammed shut at first, then it gives. Nothing inside but a broken hinge.');
        else setMessage('Just old coats and a locker mirror cracked down the middle.');
      } else if (target === 'keycard') {
        if (s.hasCard) { setMessage('You already have the staff keycard.'); return; }
        s.hasCard = true; setHasCard(true);
        const card = scene.getObjectByName('staff keycard'); if (card) card.visible = false;
        const glowAfterPickup = scene.getObjectByName('keycard glow'); if (glowAfterPickup) glowAfterPickup.visible = false;
        setObjective('Find a way to restore the corridor lights');
        setMessage('KEYCARD ACQUIRED. The red lights begin to pulse faster.'); setFear(1);
      } else if (target === 'notice') {
        setMessage('A maintenance note: â€œLIGHTS FAILING? CHECK THE LOOSE PANEL BY THE CRACKED WALL. Follow the red wire.â€');
        setObjective(s.hasCard ? 'Find the hidden light switch' : 'Search the lockers for a staff keycard');
      } else if (target === 'panel') {
        if (!s.hasCard) { setMessage('The panel edge is stiff. A staff keycard might slip behind the loose latch.'); return; }
        revealSwitch();
        setMessage('The keycard wedges under the latch. The panel drops open, exposing a hidden switch.');
        setObjective('Find and activate the hidden light switch');
      } else if (target === 'switch') {
        if (!switchFound) { setMessage('The switch is concealed behind the maintenance panel.'); return; }
        if (!s.hasCard) { setMessage('The maintenance panel has a card latch. Find the staff keycard first.'); return; }
        setWireMatches(['', '', '', '']); setWirePuzzle(true); s.active = false; keys.clear(); document.exitPointerLock?.(); setMessage('Match each coloured input to its wire before restoring power.');
      } else if (target === 'breaker') {
        setMessage('This is only a distribution cabinet. The actual light switch is hidden behind a loose panel.');
      } else if (target === 'exit') {
        if (!s.hasCard) { setMessage('ACCESS DENIED â€” find the staff keycard.'); return; }
        if (!s.powerOn) { setMessage('The EXIT door will not release while the corridor power is off. Find the hidden switch.'); return; }
        s.escaped = true; setEscaped(true); s.active = false;
        setObjective('Escape complete'); setMessage('You made it outside. The school bell rings one last time.');
        setScreen('complete'); document.exitPointerLock?.();
      } else {
        setMessage('The classroom window is smeared from the inside. Keep moving.');
      }
    };    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== renderer.domElement || !stateRef.current.active) return;
      yaw -= e.movementX * .0022;
      pitch = THREE.MathUtils.clamp(pitch - e.movementY * .0018, -1.15, 1.15);
      camera.rotation.set(pitch, yaw, 0, 'YXZ');
    };
    const onClick = () => {
      if (stateRef.current.active && document.pointerLockElement !== renderer.domElement) {
        void renderer.domElement.requestPointerLock?.();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
    const onBlur = () => keys.clear();
    renderer.domElement.addEventListener('click', onClick);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    const resize = () => {
      if (!hostRef.current) return;
      camera.aspect = hostRef.current.clientWidth / hostRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(hostRef.current.clientWidth, hostRef.current.clientHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(hostRef.current);

    const tick = (time: number) => {
      anim = requestAnimationFrame(tick);
      const dt = Math.min((time - lastTime) / 1000 || 0, .04);
      lastTime = time;
      const s = stateRef.current;
      if (cutsceneActive) {
        const elapsed = Math.max(0, (time - cutsceneStartedAt) / 1000);
        const drop = THREE.MathUtils.clamp(elapsed / 1.05, 0, 1);
        const easedDrop = 1 - Math.pow(1 - drop, 3);
        stalker.position.y = THREE.MathUtils.lerp(7.2, 0, easedDrop);
        stalker.rotation.z = Math.sin(elapsed * 11) * (drop < 1 ? .09 : .025);
        // A short impact shake sells the landing, then the player regains control.
        if (elapsed > 1.02 && elapsed < 1.32) {
          camera.position.x = Math.sin(elapsed * 95) * .055;
          camera.position.y = 1.65 + Math.sin(elapsed * 120) * .035;
        }
        if (elapsed >= 2.45) {
          cutsceneActive = false;
          camera.position.y = 1.65;
          s.active = true;
          setMessage('RUN! It has landed. Get to the EXIT!');
        }
      }
      if (s.active) {
        raycaster.setFromCamera(pointer, camera);
        const promptHit = raycaster.intersectObjects(interactables.filter(o => { let n: THREE.Object3D | null = o; while(n){if(!n.visible)return false;n=n.parent;} return true;}), false).find(h => h.distance < 3.25);
        const promptTarget = promptHit?.object.userData.target as string | undefined;
        const promptText = promptTarget ? (promptTarget.startsWith('locker-') ? 'E — OPEN LOCKER' : promptTarget === 'keycard' ? 'E — COLLECT KEYCARD' : promptTarget === 'notice' ? 'E — READ NOTICE' : promptTarget === 'panel' ? 'E — OPEN PANEL' : promptTarget === 'switch' ? 'E — USE SWITCH' : promptTarget === 'breaker' ? 'E — INSPECT BREAKER' : promptTarget === 'exit' ? 'E — OPEN EXIT' : 'E — INTERACT') : '';
        setInteractionPrompt(old => old === promptText ? old : promptText);
        const f = Number(keys.has('w') || keys.has('arrowup')) - Number(keys.has('s') || keys.has('arrowdown'));
        const side = Number(keys.has('d') || keys.has('arrowright')) - Number(keys.has('a') || keys.has('arrowleft'));
        const fast = keys.has('shift') ? 1.55 : 1;
        const move = new THREE.Vector3(side, 0, -f).normalize().applyAxisAngle(new THREE.Vector3(0,1,0), yaw);
        const nx = THREE.MathUtils.clamp(camera.position.x + move.x * dt * 3.2 * fast, -3.25, 3.25);
        const nz = THREE.MathUtils.clamp(camera.position.z + move.z * dt * 3.2 * fast, -25.2, 13.8);
        camera.position.x = nx;
        camera.position.z = nz;

        if (s.hasCard && !s.escaped) {
          const target = new THREE.Vector3(camera.position.x, 0, camera.position.z);
          const current = new THREE.Vector3(stalker.position.x, 0, stalker.position.z);
          const dist = current.distanceTo(target);
          if (s.powerOn) {
            stalker.visible = true;
            const chaseDirection = new THREE.Vector3().subVectors(target, current);
            const chaseDistance = chaseDirection.length();
            if (chaseDistance > 0.001) chaseDirection.normalize();
            current.addScaledVector(chaseDirection, Math.min(chaseDistance, dt * (keys.has('shift') ? 2.9 : 2.2)));
            stalker.position.x = current.x;
            stalker.position.z = current.z;
          } else {
            stalker.visible = false;
          }
          stalker.lookAt(camera.position.x, 1.2, camera.position.z);
          const d = stalker.position.distanceTo(camera.position);
          if (s.powerOn && Math.hypot(stalker.position.x-camera.position.x,stalker.position.z-camera.position.z) < 1.25) {
            setMessage('YOU DIED. It caught you.'); s.active=false; keys.clear(); setScreen('dead'); document.exitPointerLock?.();
            s.active = false;
            document.exitPointerLock?.();
            if (catchTimer !== undefined) window.clearTimeout(catchTimer);

          }
        }
      }
      // Broken red tubes stutter in irregular bursts; healthy tubes still hum weakly until power returns.
      let flickerIndex = 0;
      damagedLights.forEach((light) => {
        const i = flickerIndex++;
        const pulse = Math.sin(time * (.017 + i * .003) + i * 2.1);
        light.intensity = s.powerOn ? (pulse > .995 ? 2.6 : 4.2) : (pulse > .52 ? .08 : pulse < -.78 ? .65 : 2.35);
      });
      fluorescentLights.forEach((light) => {
        if (!damagedLights.has(light)) light.intensity = s.powerOn ? 5.2 : (Math.sin(time * .006 + light.position.z) > .995 ? .05 : .48);
      });
      stalker.children.forEach((child) => {
        if (child.name.includes('long') || child.name.includes('crooked') || child.name === 'shank') {
          child.rotation.z = Math.sin(time * .008 + child.position.x * 5) * .035;
        }
      });
      renderer.render(scene, camera);
    };
    anim = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(anim);
      if (catchTimer !== undefined) window.clearTimeout(catchTimer);
      observer.disconnect();
      renderer.domElement.removeEventListener('click', onClick);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.exitPointerLock?.();
      scene.traverse(o => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material) ? o.material : [o.material];
          materials.forEach(m => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      resetSceneRef.current = null;
      sceneRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  useEffect(() => {
    stateRef.current.active = screen === 'playing';
    if (screen !== 'playing') document.exitPointerLock?.();
  }, [screen]);

  const placeWire = (colour: string, terminalIndex: number) => {
    const next = [...wireMatches, '', '', '', ''].slice(0, 4);
    const previous = next.indexOf(colour);
    if (previous >= 0) next[previous] = '';
    next[terminalIndex] = colour;
    setWireMatches(next);
    const correct = ['red', 'blue', 'yellow', 'green'];
    if (next.length === 4 && next.every((value, index) => value === correct[index])) {
      setMessage('CIRCUIT COMPLETE. POWER RESTOREDâ€¦');
      window.setTimeout(() => wireSequenceRef.current?.(), 300);
    } else if (next.every((value, index) => !value || value === correct[index])) {
      setMessage('Wire connected. Keep matching the colours.');
    } else {
      setMessage('That wire is in the wrong terminal. Move it to its matching colour.');
    }
  };
  const clickLooseWire = (colour: string) => {
    const slot = wireMatches.findIndex(value => !value);
    if (slot >= 0) placeWire(colour, slot);
    else setMessage('All terminals are occupied. Drag a wire onto another terminal to move it.');
  };

  const begin = () => {
    stateRef.current = { hasCard: false, powerOn: false, escaped: false, active: true };
    setHasCard(false); setPowerOn(false); setEscaped(false); setFear(0); setWirePuzzle(false); setWireMatches([]);
    setObjective('Find the staff keycard');
    setMessage('Find the staff keycard. Do not follow the footsteps.');
    resetSceneRef.current?.();
    setScreen('playing');
  };

  return (
    <div className="game-shell school-shell cinematic-shell">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">02</span><span>The Room Is Weird <span style={{opacity:.55}}>/ The Endless School</span></span></div>
        <div className="topbar-right"><button className="secondary-button" type="button" onClick={onBack}>Back to chapters</button></div>
      </header>
      <main className="game-main">
        <div className="game-heading"><div><p className="eyebrow">Chapter 02 / The school that never ends</p><h1>The bell already rang.</h1></div><div className="chapter-pill"><b>{screen === 'complete' ? 'ESCAPED' : 'AFTER HOURS'}</b> / Nobody is here</div></div>
        <section className="stage school-stage" aria-label="The endless school 3D scene">
          <div ref={hostRef} className="school-scene-host" />
          {screen === 'playing' && <div className="school-hud">
            <div className="objective"><small>Current objective</small><strong>{objective}</strong></div>
            <div className="school-status"><span className={fear > 0 ? 'danger-dot' : ''} />{fear === 2 ? 'RUN' : fear === 1 ? 'YOU ARE NOT ALONE' : 'QUIET HOURS'}</div>
            <div className="school-message" role="status">{message}</div>
            {interactionPrompt&&<div className="interaction-prompt">{interactionPrompt}</div>}<div className="school-controls"><kbd>W A S D</kbd> MOVE <kbd>MOUSE</kbd> LOOK <kbd>E</kbd> INTERACT <kbd>SHIFT</kbd> SPRINT</div>
            {hint && <div className="school-hint">Inspect all four lockers. Read the maintenance notice, use your keycard to open the loose panel and find the hidden light switch. The EXIT is at the far end.</div>}
            <button className="hint-button school-hint-button" onClick={() => setHint(v => !v)}>{hint ? 'Hide hint' : 'Need a hint?'}</button>
          </div>}
          {wirePuzzle && screen === 'playing' && <div className="overlay school-overlay wire-overlay">
            <div className="dialog-card wire-card">
              <div className="dialog-kicker">EMERGENCY POWER / MANUAL BYPASS</div>
              <h2>Match the wires.</h2>
              <p>Drag each loose wire from the left and plug it into the matching coloured terminal on the right.</p>
              <div className="wire-board" style={{display:'grid',gridTemplateColumns:'1fr 1.1fr 1fr',gap:12,alignItems:'center',padding:'16px 8px',background:'#0b0e13',border:'1px solid #414751',borderRadius:8,boxShadow:'inset 0 0 24px #000'}}>
                <div style={{display:'grid',gap:14}}>
                  <small style={{color:'#9ca6b5',letterSpacing:2}}>LOOSE WIRES</small>
                  {['red','blue','yellow','green'].map((wire,index)=><div key={wire} draggable onDragStart={e=>{e.dataTransfer.setData('text/plain',wire);e.dataTransfer.effectAllowed='move';}} onClick={()=>clickLooseWire(wire)} style={{display:'flex',alignItems:'center',gap:6,cursor:'grab',padding:'9px 5px',border:'1px solid #363c46',borderRadius:5,background:'#171b22',color:'#e9edf2',fontSize:12}}>
                    <span style={{display:'inline-block',width:18,height:5,background:wire,boxShadow:`0 0 9px ${wire}`,borderRadius:4}}/><span>{wire.toUpperCase()}</span><span style={{marginLeft:'auto',color:'#7e8793'}}>â ¿</span>
                  </div>)}
                </div>
                <svg viewBox="0 0 180 220" style={{width:'100%',height:220,overflow:'visible'}}>
                  {[0,1,2,3].map(i=><g key={i}><path d={`M 0 ${38+i*48} C 45 ${38+i*48}, 65 ${38+(wireMatches[i]?i:3-i)*48}, 90 ${38+(wireMatches[i]?i:3-i)*48} S 135 ${38+i*48}, 180 ${38+i*48}`} fill="none" stroke={wireMatches[i]||'#555c66'} strokeWidth="5" strokeLinecap="round" opacity={wireMatches[i]?1:.45}/><circle cx="90" cy={38+i*48} r="7" fill={wireMatches[i]||'#333943'} stroke="#c5cbd3" strokeWidth="1.5"/></g>)}
                </svg>
                <div style={{display:'grid',gap:14}}>
                  <small style={{color:'#9ca6b5',letterSpacing:2}}>INPUT TERMINALS</small>
                  {['red','blue','yellow','green'].map((wire,index)=><div key={wire} onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='move';}} onDrop={e=>{e.preventDefault();const colour=e.dataTransfer.getData('text/plain');if(['red','blue','yellow','green'].includes(colour))placeWire(colour,index);}} style={{minHeight:38,display:'flex',alignItems:'center',gap:6,padding:'7px 5px',border:`2px solid ${wireMatches[index]===wire?wire:'#424954'}`,borderRadius:5,background:wireMatches[index]===wire?`${wire}20`:'#171b22',color:wire,fontSize:11,boxShadow:wireMatches[index]===wire?`0 0 10px ${wire}44`:'none'}}>
                    <span style={{width:12,height:12,borderRadius:'50%',border:`3px solid ${wire}`,background:'#080a0e',boxShadow:`0 0 7px ${wire}`}}/><span>{wire.toUpperCase()} IN</span>{wireMatches[index]&&<span style={{marginLeft:'auto',fontSize:10,color:wireMatches[index]===wire?'#e8edf2':'#ff6b72'}}>{wireMatches[index].toUpperCase()}</span>}
                  </div>)}
                </div>
              </div>
              <small style={{color:'#9ca6b5'}}>Tip: you can drag the wires, or click a wire to connect it to the next empty terminal.</small>
              <div className="dialog-buttons"><button className="primary-button" onClick={()=>{if(wireMatches.length===4&&wireMatches.every((v,i)=>v===['red','blue','yellow','green'][i])&&new Set(wireMatches).size===4){wireSequenceRef.current?.();}else{setWireMatches([]);setMessage('SHORT CIRCUIT. The inputs reset â€” match each colour correctly.');}}}>Connect wires</button><button className="secondary-button" onClick={()=>{setWirePuzzle(false);stateRef.current.active=true;}}>Close panel</button></div>
            </div>
          </div>}
          {screen !== 'playing' && <div className="overlay school-overlay">
            <div className="dialog-card">
              <div className="dialog-kicker">{screen === 'complete' ? 'Chapter complete' : screen === 'dead' ? 'Run terminated / You were caught' : 'CHAPTER 02 / AFTER HOURS'}</div>
              <h2>{screen === 'complete' ? 'You got out.' : screen === 'dead' ? <>YOU DIED.<br/>Try again.</> : <>The school<br/>never ends.</>}</h2>
              <p>{screen === 'complete' ? 'Outside, the sky is dark. The bell rings again from somewhere behind you.' : screen === 'dead' ? 'The creature caught you in the corridor. The school resets, and the keycard will be somewhere different next run.' : 'Search the lockers. Find the maintenance clue, solve the wire puzzle, then reach the EXIT before the thing catches you.'}</p>
              <div className="dialog-buttons">
                <button className="primary-button" onClick={begin}>{screen === 'complete' ? 'Play again' : screen === 'dead' ? 'Try again' : 'Enter the school'}</button>
                {screen === 'complete' && onNext && <button className="secondary-button" onClick={onNext}>Next chapter: The Underground â†’</button>}
                {devMode && onChapterSelect && <><button className="secondary-button" onClick={() => onChapterSelect(1)}>DEV: Chapter 01 â€” Living Room</button><button className="secondary-button" onClick={() => onChapterSelect(3)}>DEV: Chapter 03 â€” Underground</button></>}
                <button className="secondary-button" onClick={onBack}>Back to Chapter 01</button>
              </div>
              <div className="title-controls"><span><kbd>WASD</kbd> move</span><span><kbd>SHIFT</kbd> sprint</span><span><kbd>E</kbd> interact</span></div>
            </div>
          </div>}
        </section>
        <div className="footer-bar"><span><strong>Do not trust the bell.</strong> It rings when it wants you to run.</span><span>{escaped ? 'CHAPTER 02 COMPLETE' : hasCard ? powerOn ? 'GET TO THE EXIT' : 'FIND THE HIDDEN SWITCH' : 'SEARCH THE LOCKERS'}</span></div>
      </main>
    </div>
  );
}


