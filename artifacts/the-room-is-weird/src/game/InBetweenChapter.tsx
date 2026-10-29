import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

type Props = { onBack: () => void; onComplete?: () => void; devMode?: boolean };

export default function InBetweenChapter({ onBack, onComplete, devMode = false }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<'title'|'playing'|'complete'>('title');
  const [objective, setObjective] = useState('Find what changes each time you return');
  const [clues, setClues] = useState(0);
  const [message, setMessage] = useState('The facility map shows a room that does not exist.');
  const [prompt, setPrompt] = useState('');
  const screenRef = useRef(screen);
  const cluesRef = useRef(clues);
  screenRef.current = screen;
  cluesRef.current = clues;

  useEffect(() => {
    const el = host.current; if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' }); }
    catch { setMessage('3D could not start. Enable browser hardware acceleration.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#10151d');
    scene.fog = new THREE.Fog('#10151d', 16, 66);
    const camera = new THREE.PerspectiveCamera(74, el.clientWidth / el.clientHeight, .1, 120);
    camera.rotation.order = 'YXZ';
    scene.add(new THREE.HemisphereLight('#c5d5e8', '#28212a', 1.15));
    const light = new THREE.DirectionalLight('#dce7f3', 1.4); light.position.set(-5, 12, 4); scene.add(light);
    const lamps: THREE.PointLight[] = [];
    const mat = (color:string, metal=.05, rough=.78, emissive='#000000', intensity=1) => new THREE.MeshStandardMaterial({color,metalness:metal,roughness:rough,emissive,emissiveIntensity:intensity});
    const box = (x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,em='#000000') => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat(color,.08,.72,em,1));
      m.position.set(x,y,z); scene.add(m); return m;
    };
    // An ordinary, almost boring research facility. The unsettling part is what the architecture does.
    box(0,-.25,-28,18,.5,78,'#666a6d');
    box(0,5.8,-28,18,.35,78,'#3d4247');
    for(const s of [-1,1]) {
      box(s*8.7,2.7,-28,.45,5.5,78,'#777a79');
      for(let z=8;z>-65;z-=5) {
        box(s*8.43,2.7,z,.08,5,.18,'#a7a9a4');
        box(s*8.38,1.2,z,.08,.06,1.4,'#c1c2ba');
      }
    }
    for(let z=7;z>-65;z-=6) {
      box(0,5.55,z,17,.12,.16,'#858984');
      box(-6.4,5.35,z,.12,.08,1.5,'#d1d2c7');
      box(6.4,5.35,z,.12,.08,1.5,'#d1d2c7');
    }
    // Repeated doorframes make the hallway feel familiar; the room at the end is impossible.
    const frames: THREE.Group[]=[];
    for(const z of [-8,-23,-39,-53]) {
      box(-3.5,2.6,z,.25,5.2,.35,'#a3a7a6');
      box(3.5,2.6,z,.25,5.2,.35,'#a3a7a6');
      box(0,5.15,z,7.2,.22,.35,'#a3a7a6');
      const g=new THREE.Group();g.position.set(0,0,z);scene.add(g);
      const slab=new THREE.Mesh(new THREE.BoxGeometry(6.7,4.8,.18),mat('#42484b',.12,.62));slab.position.y=2.4;g.add(slab);
      const window=new THREE.Mesh(new THREE.BoxGeometry(1.15,1.2,.04),mat('#18272c',.1,.3,'#8ba8a7',.35));window.position.set(0,3.2,.12);g.add(window);
      frames.push(g);
    }
    // The repeating details: identical clocks, chairs and numbered signs, with tiny wrong differences.
    const clueObjects: THREE.Group[]=[];
    const makeClock=(x:number,y:number,z:number,index:number)=>{
      const g=new THREE.Group();g.position.set(x,y,z);scene.add(g);
      const rim=new THREE.Mesh(new THREE.CylinderGeometry(.48,.48,.12,32),mat('#c6c3b8',.45,.4));rim.rotation.x=Math.PI/2;g.add(rim);
      const face=new THREE.Mesh(new THREE.CircleGeometry(.41,32),mat('#d8d4c8'));face.position.z=.071;g.add(face);
      for(let i=0;i<12;i++){const tick=new THREE.Mesh(new THREE.BoxGeometry(.025,.09,.018),mat('#303438'));const a=i/12*Math.PI*2;tick.position.set(Math.sin(a)*.32,Math.cos(a)*.32,.09);tick.rotation.z=-a;g.add(tick);}
      const hand=new THREE.Mesh(new THREE.BoxGeometry(.025,.27,.02),mat(index===1?'#c45e4e':'#303438'));hand.position.set(.05,.04,.105);hand.rotation.z=index===1?1.6:.4;g.add(hand);
      clueObjects.push(g);
    };
    makeClock(-8.32,3.8,-3,0);makeClock(8.32,3.8,-30,1);makeClock(-8.32,3.8,-46,2);
    const picture=(x:number,z:number,wrong:boolean)=>{
      const g=new THREE.Group();g.position.set(x,2.8,z);scene.add(g);
      const frame=new THREE.Mesh(new THREE.BoxGeometry(1.55,1.8,.14),mat('#5b4b3c',.3,.5));g.add(frame);
      const canvas=new THREE.Mesh(new THREE.BoxGeometry(1.28,1.52,.04),mat(wrong?'#283c40':'#9a9a88'));canvas.position.z=.1;g.add(canvas);
      const shape=new THREE.Mesh(new THREE.CircleGeometry(.31,24),mat(wrong?'#c2a18b':'#7a8a82'));shape.position.set(wrong?.23:-.18,.18,.13);g.add(shape);
      return g;
    };
    picture(-8.32,-13,false);picture(8.32,-36,true);picture(-8.32,-49,false);
    const chair=(x:number,z:number,rot:number)=>{
      const g=new THREE.Group();g.position.set(x,0,z);g.rotation.y=rot;scene.add(g);
      const seat=box(x,.65,z,.95,.14,.88,'#777a78');seat.position.set(x,.65,z);g.add(seat); // parented seat is intentionally reused as furniture geometry
      const back=new THREE.Mesh(new THREE.BoxGeometry(.95,1,.13),mat('#686d6c'));back.position.set(0,1.18,-.35);g.add(back);
      for(const dx of [-.37,.37])for(const dz of [-.3,.3]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.09,.62,.09),mat('#4b5051'));leg.position.set(dx,.31,dz);g.add(leg);}
      return g;
    };
    // Chairs sit in each bay. The third one faces the wall, even when the room is reset.
    chair(-4.8,-16,0);chair(4.8,-32,Math.PI);chair(-4.8,-48,Math.PI/2);
    // A corridor that appears to terminate at a wall. The real passage is hidden behind the fake wall.
    box(0,2.7,-62,17,5.4,.35,'#767a78');
    const falseWall=box(0,2.7,-61.72,5.6,4.8,.08,'#777a77');
    for(let i=0;i<5;i++)box(-2+i,-.08,-60.9,.8,.08,.55,'#d0d0c6');
    const hiddenDoor=box(0,2.6,-64.2,3.2,4.9,.16,'#1b272b','#344e50');
    const exitSign=box(0,4.85,-64.08,1.2,.25,.08,'#23413d','#53c2a2');
    // Impossible room: the same corridor model stands sideways and upside down behind a portal.
    const portal=new THREE.Group();portal.position.set(0,2.7,-68);scene.add(portal);
    const portalFrame=new THREE.Mesh(new THREE.BoxGeometry(6.2,5.5,.35),mat('#292f33',.2,.45));portal.add(portalFrame);
    const portalGlass=new THREE.Mesh(new THREE.PlaneGeometry(5.7,5),new THREE.MeshBasicMaterial({color:'#8db7b0',transparent:true,opacity:.24,side:THREE.DoubleSide}));portalGlass.position.z=.2;portal.add(portalGlass);
    const upside=new THREE.Group();upside.position.set(0,2.7,-69.2);upside.rotation.z=Math.PI;scene.add(upside);
    const upsideFloor=new THREE.Mesh(new THREE.BoxGeometry(7,.2,13),mat('#747b79'));upside.add(upsideFloor);
    for(let i=0;i<4;i++){const desk=new THREE.Mesh(new THREE.BoxGeometry(1.4,.16,.8),mat('#535b5b'));desk.position.set(-2.3+i*1.5,-1.3,-2);upside.add(desk);}
    const interactables: THREE.Object3D[]=[...clueObjects,falseWall,hiddenDoor,portal];
    const state={seen:[false,false,false],loop:0,wallMoved:false,portalOpened:false,complete:false};
    let yaw=0,pitch=0,active=false,elapsed=0,bob=0,jumpV=0,jump=0,last=performance.now();
    const keys=new Set<string>(),raycaster=new THREE.Raycaster();
    const onMove=(e:MouseEvent)=>{if(!active||document.pointerLockElement!==renderer.domElement)return;yaw-=e.movementX*.0022;pitch=THREE.MathUtils.clamp(pitch-e.movementY*.0022,-1.2,1.2);};
    const onLock=()=>{active=document.pointerLockElement===renderer.domElement;};
    const click=()=>{if(document.pointerLockElement!==renderer.domElement)void renderer.domElement.requestPointerLock();};
    const onDown=(e:KeyboardEvent)=>{const k=e.key.toLowerCase();keys.add(k);if([' ','arrowup','arrowdown','arrowleft','arrowright'].includes(k))e.preventDefault();if(k==='e'&&!e.repeat)interact();if(k===' '&&!e.repeat&&active&&jump<=0)jumpV=5.5;if(devMode&&k==='9'){state.seen=[true,true,true];setClues(3);}};
    const onUp=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
    function interact(){
      raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
      const hit=raycaster.intersectObjects(interactables,true).find(h=>h.distance<4);
      if(!hit){setMessage('Nothing here. Look closer at the details that repeat.');return;}
      let obj:THREE.Object3D|null=hit.object;while(obj&&!interactables.includes(obj))obj=obj.parent;if(!obj)return;
      const idx=clueObjects.indexOf(obj as THREE.Group);
      if(idx>=0){
        if(state.seen[idx]){setMessage('You already noticed this one. Something else is wrong.');return;}
        state.seen[idx]=true;setClues(state.seen.filter(Boolean).length);
        const lines=['The clock is seven minutes ahead. It was not ahead before.','This clock runs backwards. You can hear it ticking.','The third clock has no hands. The second hand is still ticking.'];
        setMessage(lines[idx]);
        if(state.seen.every(Boolean)){setObjective('The room is repeating. Find the seam in the end wall.');setMessage('All three clocks disagree. The building is looping, not you.');}
        else setObjective('Inspect the clocks and find what is wrong');
        return;
      }
      if(obj===falseWall){
        if(!state.seen.every(Boolean)){setMessage('A painted wall. The clocks might tell you why it feels familiar.');return;}
        state.wallMoved=true;falseWall.visible=false;setObjective('Follow the passage and inspect the impossible doorway');setMessage('The wall slides sideways without making a sound. Behind it: a corridor that should be outside the building.');return;
      }
      if(obj===hiddenDoor){
        if(!state.wallMoved){setMessage('There is no handle. This door is not meant to be found yet.');return;}
        state.portalOpened=true;portalGlass.material instanceof THREE.Material && ((portalGlass.material as THREE.MeshBasicMaterial).opacity=.8);
        setObjective('Enter the impossible room');setMessage('The room beyond is upside down. The EXIT sign is on the wrong side of the glass.');return;
      }
      if(obj===portal){
        if(!state.portalOpened){setMessage('The glass feels warm. There is a door behind the false wall.');return;}
        state.loop++;camera.position.set(0,1.68,-57.5);yaw=0;pitch=0;
        if(state.loop===1){setMessage('You returned to the same corridor. The chairs have all turned to face you.');setObjective('The corridor changed. Find the only door that is different.');}
        else {state.complete=true;setScreen('complete');setMessage('You escaped the loop. The facility map finally has one less room.');document.exitPointerLock?.();}
        return;
      }
    }
    const resize=()=>{if(!el.clientWidth)return;renderer.setSize(el.clientWidth,el.clientHeight);camera.aspect=el.clientWidth/el.clientHeight;camera.updateProjectionMatrix();};
    window.addEventListener('resize',resize);window.addEventListener('mousemove',onMove);window.addEventListener('keydown',onDown);window.addEventListener('keyup',onUp);document.addEventListener('pointerlockchange',onLock);renderer.domElement.addEventListener('click',click);
    camera.position.set(0,1.68,5.5);
    let raf=0;
    const tick=(now:number)=>{raf=requestAnimationFrame(tick);const dt=Math.min(.04,(now-last)/1000||0);last=now;elapsed+=dt;
      clueObjects.forEach((g,i)=>{g.rotation.y=Math.sin(elapsed*.25+i)*.018;});
      lamps.forEach(l=>{l.intensity=1.1+Math.sin(elapsed*2.1)*.08;});
      if(screenRef.current==='playing'&&active){
        const f=(keys.has('w')?1:0)-(keys.has('s')?1:0),s=(keys.has('d')?1:0)-(keys.has('a')?1:0),len=Math.hypot(f,s)||1,speed=keys.has('shift')?6.1:4.1;
        const nx=camera.position.x+(-Math.sin(yaw)*f+Math.cos(yaw)*s)/len*speed*dt,nz=camera.position.z+(-Math.cos(yaw)*f-Math.sin(yaw)*s)/len*speed*dt;
        camera.position.x=THREE.MathUtils.clamp(nx,-7.8,7.8);
        camera.position.z=THREE.MathUtils.clamp(nz,-70,8);
        jumpV-=14*dt;jump=Math.max(0,jump+jumpV*dt);if(jump===0)jumpV=0;bob+=dt*speed;
        camera.position.y=1.68+jump+Math.sin(bob*8)*.02;camera.rotation.set(pitch,yaw,0,'YXZ');
        raycaster.setFromCamera(new THREE.Vector2(0,0),camera);
        const hit=raycaster.intersectObjects(interactables,true).find(h=>h.distance<4);
        let p='';if(hit){let o:THREE.Object3D|null=hit.object;while(o&&!interactables.includes(o))o=o.parent;
          if(o&&clueObjects.includes(o as THREE.Group))p='E — INSPECT THE CLOCK';
          else if(o===falseWall)p='E — TEST THE WALL';
          else if(o===hiddenDoor)p='E — OPEN THE DOOR';
          else if(o===portal)p='E — ENTER THE ROOM';
        }setPrompt(old=>old===p?old:p);
      }
      renderer.render(scene,camera);
    };
    raf=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(raf);window.removeEventListener('resize',resize);window.removeEventListener('mousemove',onMove);window.removeEventListener('keydown',onDown);window.removeEventListener('keyup',onUp);document.removeEventListener('pointerlockchange',onLock);renderer.domElement.removeEventListener('click',click);document.exitPointerLock?.();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(x=>x.dispose());}});renderer.dispose();renderer.domElement.remove();};
  },[]);

  const start=()=>{setScreen('playing');setObjective('Inspect the clocks and find what is wrong');setMessage('Three clocks. One corridor. None of the clocks agree.');setClues(0);};
  return <div className="game-shell cinematic-shell school-shell" style={{position:'fixed',inset:0,background:'#10151d',color:'#f4f4ef'}}>
    <header className="topbar"><div className="brand"><span className="brand-mark">06</span><span>The Room Is Weird / The Impossible Facility</span></div><div className="topbar-right"><button className="secondary-button" onClick={()=>{document.exitPointerLock?.();onBack();}}>Back to chapters</button></div></header>
    <section className="stage school-stage" style={{position:'fixed',inset:0,width:'100vw',height:'100dvh',maxWidth:'none',maxHeight:'none',border:0,borderRadius:0,background:'#10151d'}} aria-label="The Impossible Facility"><div ref={host} className="school-scene-host"/>
      {screen==='playing'&&<div className="school-hud"><div className="objective"><small>Current objective</small><strong>{objective}</strong></div><div className="school-status"><span className={clues===3?'':'danger-dot'}/>{clues}/3 DETAILS NOTICED</div><div className="school-message" role="status">{message}</div>{prompt&&<div className="interaction-prompt">{prompt}</div>}<div className="school-controls"><kbd>W A S D</kbd> MOVE <kbd>SHIFT</kbd> SPRINT <kbd>SPACE</kbd> JUMP <kbd>MOUSE</kbd> LOOK <kbd>E</kbd> INSPECT</div></div>}
      {screen!=='playing'&&<div className="overlay school-overlay" style={{zIndex:20}}><div className="dialog-card" style={{maxWidth:570,borderColor:'#a8b6b166',background:'rgba(13,18,24,.95)'}}><div className="dialog-kicker" style={{color:'#b6c9c5'}}>CHAPTER 06 / ARCHITECTURE ERROR</div><h2 style={{textTransform:'uppercase',letterSpacing:'.04em'}}>{screen==='complete'?<>LOOP<br/>BROKEN.</>:<>THE IMPOSSIBLE<br/>FACILITY.</>}</h2><p>{screen==='complete'?'The corridor finally stays still. On the map, the impossible room disappears. Somewhere behind you, a clock starts ticking normally.':'A research facility with one impossible flaw: the corridor keeps repeating. Inspect the clocks, discover the hidden passage, and escape the room that keeps putting itself back together.'}</p><div className="dialog-buttons"><button className="primary-button" style={{background:'#c6d3cf',color:'#111820',borderColor:'#c6d3cf'}} onClick={()=>{if(screen==='complete'){onComplete?.();onBack();}else start();}}>{screen==='complete'?'Return to chapters':'ENTER THE FACILITY'}</button><button className="secondary-button" onClick={()=>{document.exitPointerLock?.();onBack();}}>Back to chapters</button></div><div className="title-controls"><span><kbd>WASD</kbd> move</span><span><kbd>SPACE</kbd> jump</span><span><kbd>E</kbd> inspect</span></div></div></div>}
    </section>
  </div>;
}
