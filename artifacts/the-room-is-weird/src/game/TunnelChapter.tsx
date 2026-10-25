import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { playFeedback } from './feedback';

type Props = { onBack: () => void; devMode?: boolean; onChapterSelect?: (chapter: 1 | 2 | 3) => void };

export default function TunnelChapter({ onBack, devMode = false, onChapterSelect }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [screen, setScreen] = useState<'title'|'playing'|'dead'|'complete'>('title');
  const [objective, setObjective] = useState('Find the three ticket fragments');
  const [message, setMessage] = useState('The station closed seventeen years ago. So why is the departure board updating?');
  const [tickets, setTickets] = useState<string[]>([]);
  const [power, setPower] = useState(false);
  const [panel, setPanel] = useState(false);
  const [code, setCode] = useState<string[]>([]);
  const [fear, setFear] = useState(0);
  const [interactionPrompt, setInteractionPrompt] = useState('');
  const state = useRef({active:false,power:false,tickets:[] as string[],dead:false,escape:false});
  const sceneRef = useRef<THREE.Scene|null>(null);
  const resetRef = useRef<(()=>void)|null>(null);
  const powerRef = useRef<(()=>void)|null>(null);
  const escapeRef = useRef<(()=>void)|null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({antialias:true, alpha:false}); }
    catch { setMessage('3D mode could not start. Try enabling browser hardware acceleration.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.7));
    renderer.setSize(host.clientWidth,host.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene(); scene.background = new THREE.Color('#03070d'); scene.fog = new THREE.FogExp2('#071019',.022); sceneRef.current=scene;
    const camera = new THREE.PerspectiveCamera(72,host.clientWidth/host.clientHeight,.1,180);
    camera.position.set(0,1.68,16); camera.rotation.order='YXZ';
    scene.add(new THREE.HemisphereLight('#9caebf','#11121a',.8));
    const ambient = new THREE.AmbientLight('#71849a',.34); scene.add(ambient);
    const mat=(color:string,roughness=.82,metalness=0,emissive='#000000')=>new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity:.7});
    const box=(name:string,x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string,emissive='#000000')=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat(color,.8,.18,emissive));m.name=name;m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;scene.add(m);return m;
    };
    const cylinder=(x:number,y:number,z:number,r:number,h:number,color:string,rot=0)=>{
      const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,h,12),mat(color,.65,.25));m.position.set(x,y,z);m.rotation.z=rot;m.castShadow=true;scene.add(m);return m;
    };
    // Two raised platform edges leave a genuinely open track trench down the middle.
    // The train wheels and rails sit visibly below the platform, not buried under a floor slab.
    for(const side of [-1,1]) {
      box('raised concrete platform',side*4.05,-.18,-27,4.9,.42,94,'#41464a');
      box('worn platform coping',side*1.62,.035,-27,.18,.09,94,'#88847a');
      box('platform underside',side*4.05,-.43,-27,4.9,.12,94,'#252b30');
    }
    box('deep track trench',0,-.72,-27,3.05,.16,94,'#080d12');
    for(const x of [-1.12,1.12]) {
      box('steel rail',x,-.51,-27,.13,.2,94,'#8b969c');
      box('rail inner shine',x,-.405,-27,.045,.025,94,'#c0c7ca');
    }
    for(let z=16;z>-74;z-=1.15) {
      box('wooden rail sleeper',0,-.58,z,2.95,.13,.34,'#39332d');
      for(const x of [-1.12,1.12]) box('rail fastening',x,-.49,z,.3,.055,.2,'#535a5e');
    }
    // Third rail, ballast, drainage channels and oily puddles beneath the train.
    box('third rail',0,-.48,-27,.07,.12,94,'#555c61');
    for(let z=15;z>-73;z-=.42) for(const x of [-1.42,-.98,.98,1.42]) {
      const stone=new THREE.Mesh(new THREE.BoxGeometry(.16,.07,.12),mat('#252a2e'));stone.position.set(x,-.61,z);scene.add(stone);
    }
    // tiled walls, pillars, ceiling ribs and cable conduits.
    for(const side of [-1,1]){
      box('station wall',side*6.5,2.25,-27,.35,4.7,94,'#333b43');
      for(let z=12;z>-71;z-=5){
        box('structural pillar',side*5.7,2.2,z,.62,4.4,.72,'#50565b');
        box('pillar warning band',side*5.36,1.15,z,.06,.22,.75,'#d2a94e');
        cylinder(side*6.15,4.05,z,.075,5.1,'#242d36',Math.PI/2);
      }
      box('cable tray',side*5.9,4.25,-27,.12,.16,90,'#141b24');
      for(let z=12;z>-72;z-=8) box('wall lamp',side*6.18,3.6,z,.12,.18,1.1,'#c1cbd0',power?'#5ac7ff':'#000000');
    }
    box('ceiling',0,4.8,-27,13,.25,94,'#151b23');
    // Repeating steel roof ribs, sagging conduits and stained maintenance access panels.
    for(let z=13;z>-72;z-=3.4){
      box('roof crossbeam',0,4.58,z,12.8,.12,.2,'#343b41');
      for(const side of [-1,1]){
        box('rusted pipe',side*5.95,4.47,z,.09,.09,3.2,'#4b3931');
        box('pipe clamp',side*5.95,4.39,z,.17,.055,.12,'#73736b');
      }
    }
    // Wall stains, cracked tile patches, warning plates and dangling electrical cable.
    for(const side of [-1,1]) for(let z=10;z>-69;z-=7){
      box('damp wall stain',side*6.305,2.25,z,.018,1.7,1.25,'#202b30');
      box('old hazard plate',side*6.29,1.55,z-1.25,.025,.42,.8,'#7d4b32');
      box('hazard plate stripe',side*6.27,1.55,z-1.25,.03,.055,.72,'#d0a14d');
    }
    // Extra environmental storytelling: shattered tile cavities, exposed brick, cracks and old blood.
    // These are individual 3D meshes placed on the existing walls/floor, not flat reference images.
    for(const side of [-1,1]){
      for(const z of [-4,-15,-29,-42,-57,-66]){
        const patch=box('broken wall tile cavity',side*6.275,2.2,z,.045,1.15,.95,'#171b1e');
        patch.rotation.z=(z%2?-.08:.06);
        for(let row=0;row<4;row++) for(let col=0;col<3;col++){
          const bx=side*6.235, by=1.78+row*.22, bz=z-.3+col*.28;
          const brick=box('exposed old brick',bx,by,bz,.045,.16,.23,(row+col)%2?'#694338':'#50342e');
          brick.rotation.z=((row+col)%2?-.035:.025);
        }
      }
      for(const [z,y] of [[7,2.1],[-11,1.75],[-32,2.55],[-51,1.9]] as [number,number][]){
        // Jagged branching cracks made from narrow dark stone segments.
        for(let n=0;n<5;n++){
          const crack=box('deep wall crack',side*6.245,y-n*.19,z+n*.16,.035,.28,.045,'#080b0d');
          crack.rotation.y=(n%2?-.22:.17);crack.rotation.z=(n%2?.13:-.09);
        }
      }
      for(const [z,y] of [[-7,1.12],[-26,1.38],[-47,1.02]] as [number,number][]){
        const smear=box('dried blood smear',side*6.235,y,z,.026,.62,.78,'#42191d');
        smear.rotation.z=.08;
        for(let i=0;i<5;i++){
          const drip=box('dried blood drip',side*6.215,y-.28-i*.09,z-.24+i*.12,.018,.22,.055,'#2b0d12');
          drip.rotation.z=(i%2?.025:-.035);
        }
        for(let i=0;i<4;i++){
          const splatter=new THREE.Mesh(new THREE.SphereGeometry(.045+(i%2)*.025,7,6),mat('#3a1116',.95));
          splatter.scale.set(.5,1.6,.8);splatter.position.set(side*6.21,y+.12+(i%2)*.12,z-.36+i*.22);scene.add(splatter);
        }
      }
    }
    // Bloody drag marks and muddy shoe prints across the concrete, kept subtle in the low light.
    for(const [x,z] of [[-2.25,1],[-2.05,.45],[-1.9,-.1],[2.4,-14],[2.2,-14.55],[2.05,-15.1],[-2.5,-36]] as [number,number][]){
      const print=new THREE.Mesh(new THREE.CircleGeometry(.13,9),mat('#241316',.98));print.rotation.x=-Math.PI/2;print.position.set(x,.045,z);print.scale.set(.7,1.35,.7);scene.add(print);
    }
    for(const [x,z] of [[-2.1,-20],[2.3,-33],[-2.5,-54]] as [number,number][]){
      const trail=box('dark blood drag trail',x,.047,z,.13,.008,1.45,'#301317');trail.rotation.y=.14;
      for(let i=0;i<6;i++){
        const drop=new THREE.Mesh(new THREE.CircleGeometry(.055+(i%3)*.02,8),mat('#3c1117',.98));drop.rotation.x=-Math.PI/2;drop.position.set(x+(i%2)*.16,.052,z-.65+i*.23);scene.add(drop);
      }
    }
    // Broken fluorescent tubes, loose ceiling panels and dangling chain details.
    for(const z of [-6,-23,-41,-60]){
      box('missing ceiling panel',0,4.64,z,2.4,.025,1.35,'#05080b');
      box('broken fluorescent tube',-1.2,4.39,z,.95,.045,.07,'#c3d7df');
      box('dead fluorescent tube',1.15,4.39,z,.72,.045,.07,'#59666e');
      for(let i=0;i<4;i++) cylinder(5.65,3.8-i*.45,z+.25,.025,.52,'#4c4a43',.04);
    }
    const cable=new THREE.Mesh(new THREE.CatmullRomCurve3([new THREE.Vector3(-5.9,4.3,7),new THREE.Vector3(-5.7,3.2,4),new THREE.Vector3(-5.8,2.4,1)]).getPoints(24).length>0?new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(-5.9,4.3,7),new THREE.Vector3(-5.7,3.2,4),new THREE.Vector3(-5.8,2.4,1)]),24,.035,6,false):new THREE.BoxGeometry(.05,.05,1),mat('#171b1f'));
    scene.add(cable);
    // Added station damage pass: dried blood marks, fractured tile seams and a collapsed wall bay.
    // These are actual shallow 3D meshes attached to the station walls, not pasted reference images.
    for(const side of [-1,1]) for(const z of [-7,-29,-52]){
      const wallX=side*6.305;
      const stainMat=new THREE.MeshStandardMaterial({color:'#351416',roughness:1,metalness:0});
      const smear=new THREE.Mesh(new THREE.BoxGeometry(.025,.48,.72),stainMat);
      smear.position.set(wallX,1.72,z);smear.rotation.y=side*Math.PI/2;smear.rotation.z=(z%2?-.14:.11);scene.add(smear);
      for(let i=0;i<4;i++){
        const drip=new THREE.Mesh(new THREE.BoxGeometry(.03,.18+(i%2)*.14,.055),stainMat);
        drip.position.set(wallX,1.43-i*.035,z-.23+i*.14);drip.rotation.z=(i%2?-.035:.025);scene.add(drip);
        const drop=new THREE.Mesh(new THREE.SphereGeometry(.045,7,6),stainMat);
        drop.scale.y=1.5;drop.position.set(wallX,1.29-i*.035,z-.23+i*.14);scene.add(drop);
      }
    }
    // Cracked grout and chipped tile edges create irregular damage along the tiled walls.
    for(const side of [-1,1]) for(const z of [-14,-15,-36,-37,-60]){
      for(let i=0;i<5;i++){
        const crack=box('fractured tile crack',side*6.285,2.65-i*.22,z+(i%2)*.13,.025,.025,.36-(i%3)*.06,'#11181d');
        crack.rotation.x=(i%2?-.2:.16);crack.rotation.z=(i%2?.3:-.24);
      }
      for(let i=0;i<4;i++){
        const chip=box('exposed broken brick',side*6.22,1.1+i*.18,z+(i%2)*.24,.12,.15,.22,i%2?'#67483b':'#514039');
        chip.rotation.y=(i%2?.18:-.22);chip.rotation.z=(i%2?.16:-.1);
      }
    }
    // A visibly collapsed wall bay: dark recess, broken lintel and jagged concrete/brick chunks.
    // The recess reads as a breach in the station wall; the debris spills onto the platform.
    box('collapsed wall recess',-6.285,1.75,-40,.035,2.25,2.45,'#090d12');
    for(let i=0;i<12;i++){
      const angle=i*2.399;
      const chunk=box('jagged collapsed masonry',-6.05+(i%3)*.16,.72+(i%5)*.36,-40+Math.sin(angle)*1.18,.18+(i%3)*.08,.13+(i%4)*.08,.18+(i%2)*.12,i%3?'#5a5148':'#77736b');
      chunk.rotation.set(angle*.12,angle*.3,angle*.2);
    }
    // Small dark-red hand-like smears and long drips beside the damaged opening.
    const redMark=mat('#45191a',1,0);
    for(let i=0;i<5;i++){
      const finger=new THREE.Mesh(new THREE.BoxGeometry(.025,.27,.065),redMark);
      finger.position.set(-6.265,2.05,-38.95+i*.18);finger.rotation.z=(i-2)*.055;scene.add(finger);
    }

    // A collapsed service trolley and scattered debris make the platform feel abandoned.
    const trolley=box('abandoned service trolley',-3.2,.35,-28,1.1,.12,.62,'#252d33');trolley.rotation.y=.16;trolley.rotation.z=.04;
    for(const x of [-3.65,-2.75]) for(const z of [-28.2,-27.8]) cylinder(x,.18,z,.1,.08,'#11161a');
    for(const z of [-12,-26,-34,-49,-61]){
      for(let i=0;i<4;i++){const debris=box('broken tile debris',-2.7+i*.23,.08,z+(i%2)*.16,.16,.05,.12,i%2?'#41474a':'#5a5147');debris.rotation.y=i*.3;}
    }
    // Tactile warning lines run along the platform edge, not across the track.
    for(const side of [-1,1]) box('yellow safety line',side*1.78,.055,-27,.055,.025,92,'#d6b54f');
    for(let z=13;z>-70;z-=.65) for(let x of [-1.98,-1.7,1.7,1.98]) {
      const bump=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.018,8),mat('#e0c56b'));bump.position.set(x,.075,z);scene.add(bump);
    }
    // Ticket machines and benches on platform island.
    for(const z of [8,-2,-13,-24]){
      box('ticket machine',-4.85,1.15,z,.75,2.25,.65,'#252e38');
      box('ticket screen',-4.84,1.62,z+.34,.48,.52,.035,'#1d6176',power?'#1c9ec4':'#02090d');
      box('machine slot',-4.84,.92,z+.35,.3,.08,.035,'#080b0e');
    }
    for(const z of [4,-9,-22,-39]){
      box('bench seat',4.75,.72,z,1.45,.12,.48,'#30383e');
      for(const x of [4.15,5.3]) box('bench leg',x,.36,z,.09,.65,.1,'#161b20');
      box('bench back',4.75,1.13,z-.19,1.45,.7,.12,'#39434a');
    }
    // Timetable board, torn posters, puddles and broken station furniture.
    box('departure board frame',0,3.75,5,4.8,1.25,.2,'#12171e');
    box('departure board glass',0,3.78,4.87,4.5,.92,.035,'#14313a',power?'#0b7d94':'#000000');
    for(let i=0;i<7;i++) box('board text',-1.55+(i%2)*.9,4.04-Math.floor(i/2)*.22,4.83,.55,.035,.025,power?'#8be8f5':'#20252a',power?'#4bd7ff':'#000000');
    for(const z of [9,-5,-17,-31,-46]) {
      const puddle=new THREE.Mesh(new THREE.CircleGeometry(.6+(Math.abs(z)%3)*.12,24),new THREE.MeshStandardMaterial({color:'#182c37',roughness:.18,metalness:.72,transparent:true,opacity:.8}));
      puddle.rotation.x=-Math.PI/2;puddle.position.set(z%2?2.4:-2.2,.026,z);scene.add(puddle);
      box('torn poster',z%2?-6.29:6.29,2.1,z, .025,1.25,.72,'#6d6256');
    }
    // Office booth and maintenance control room.
    box('station office',-3.9,1.65,-36,3.6,3.3,4.8,'#343c44');
    box('office window',-2.06,2.15,-36,.03,.85,2.6,'#102b38');
    box('office door',-3.8,1.1,-33.55,1.05,2.2,.12,'#242a30');
    // The maintenance cabinet below is the interactive control point; no blank black wall.
    // Hidden ticket fragments are placed inside believable hiding spots; none floats in open space.
    const fragments:THREE.Mesh[]=[];
    const addTicket=(x:number,y:number,z:number,id:string,spot:string)=>{
      const m=new THREE.Mesh(new THREE.BoxGeometry(.28,.018,.17),mat('#d8c99d',.95));m.position.set(x,y,z);m.rotation.y=.25;m.name='ticket-'+id;m.userData.action='ticket';m.userData.id=id;m.userData.spot=spot;scene.add(m);fragments.push(m); const glow=new THREE.PointLight('#78f5cf',.48,2.8,2);glow.position.set(0,.12,0);m.add(glow); const halo=new THREE.Mesh(new THREE.RingGeometry(.16,.23,24),new THREE.MeshBasicMaterial({color:'#78f5cf',transparent:true,opacity:.55,side:THREE.DoubleSide}));halo.rotation.x=-Math.PI/2;halo.position.y=.025;m.add(halo);
      // Subtle cyan-green glow makes fragments findable without removing the exploration.
    };
    // A: clearly visible on the bench; B: easy to spot on the bin rim; C: on the platform beside the damaged wall.
    addTicket(4.72,.81,-9,'A','on the bench seat');
    // Realistic metal station bin with a hollow rim, reinforced sides and visible inner cavity.
    const bin=box('steel station litter bin',-4.65,.48,-18,.66,.9,.62,'#38434a');
    box('bin front reinforcing rib',-4.65,.48,-17.675,.48,.65,.035,'#59636a');
    box('bin top rim',-4.65,.94,-18,.72,.09,.68,'#778188');
    box('bin dark opening',-4.65,.99,-18,.48,.025,.43,'#080c10');
    box('bin side seam',-4.985,.48,-18,.025,.68,.5,'#1a242a');
    addTicket(-4.65,1.28,-18,'B','on the bin rim');
    // Railway maintenance cabinet: layered steel housing, recessed controls, conduit and drawer.
    box('control cabinet',4.55,1.55,-44,1.85,2.85,.72,'#303b43');
    box('maintenance cabinet recessed face',4.55,1.58,-43.615,1.55,2.45,.055,'#151e25');
    box('maintenance cabinet door',4.55,1.57,-43.57,1.38,2.28,.07,'#39464d');
    box('maintenance cabinet upper control panel',4.55,2.22,-43.515,1.05,.72,.035,'#10191f');
    box('maintenance cabinet status screen',4.55,2.34,-43.49,.72,.28,.025,'#20343a',power?'#b7dbe0':'#000000');
    for(const [x,c] of [[4.2,'#d54d3e'],[4.45,'#c7a54e'],[4.7,'#4d8c70']] as [number,string][]){
      const led=box('maintenance cabinet status LED',x,2.02,-43.48,.075,.075,.025,c,c);led.material.emissiveIntensity=.25;
    }
    for(let i=0;i<3;i++){
      box('maintenance breaker switch',4.22+i*.3,1.77,-43.48,.11,.18,.045,'#9aa2a5');
      box('maintenance breaker label',4.22+i*.3,1.61,-43.48,.18,.035,.025,'#c4c8c5');
    }
    box('maintenance cabinet lower door',4.55,1.05,-43.49,1.25,.55,.06,'#28353c');
    box('maintenance drawer',4.55,.92,-43.43,1.02,.2,.18,'#65727a');
    box('drawer handle',4.55,.93,-43.31,.25,.045,.035,'#c0c5c5');
    for(const x of [3.58,5.52]){
      box('cabinet side conduit',x,2.5,-44,.09,.09,1.35,'#5b5a50');
      for(let y=1.2;y<3.5;y+=.55) box('cabinet conduit clamp',x,y,-43.91,.16,.07,.07,'#8b8a7e');
    }
    box('cabinet warning plate',4.55,3.12,-43.51,.8,.2,.035,'#b99a4e');
    addTicket(4.55,1.7,-39,'C','on the platform beside the damaged wall');
    // Platform watcher: long-limbed silhouette, mask, glowing eyes; distinct from school creature.
    const watcher=new THREE.Group();watcher.position.set(2.3,0,-55);scene.add(watcher);
    const body=new THREE.Mesh(new THREE.CapsuleGeometry(.32,1.4,5,8),mat('#090c11',.98));body.position.y=1.45;watcher.add(body);
    const head=new THREE.Mesh(new THREE.SphereGeometry(.36,14,12),mat('#11161b',.95));head.position.y=2.55;head.scale.set(.8,1.15,.75);watcher.add(head);
    for(const x of [-.14,.14]){const eye=new THREE.Mesh(new THREE.SphereGeometry(.055,8,8),new THREE.MeshBasicMaterial({color:'#ff3428'}));eye.position.set(x,2.59,.29);watcher.add(eye);}
    for(const side of [-1,1]){
      const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.105,.95,4,6),mat('#0a0d12'));arm.position.set(side*.47,1.55,.02);arm.rotation.z=side*.17;watcher.add(arm);
      const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.13,1.15,4,6),mat('#080b10'));leg.position.set(side*.2,.45,0);watcher.add(leg);
    }
    const watcherLight=new THREE.PointLight('#ff261b',.8,4);watcherLight.position.set(0,2.5,.35);watcher.add(watcherLight);
    // Train is built away in a tunnel and hidden until power is restored.
    const train=new THREE.Group();scene.add(train);train.position.set(0,0,-68);train.visible=false;
    boxTrain();
    function boxTrain(){
      const panel=(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string)=>{const p=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),mat(color,.32,.7));p.position.set(x,y,z);p.castShadow=true;p.receiveShadow=true;train.add(p);return p;};
      panel(0,.38,0,4.2,.18,12.7,'#26343e'); panel(0,3.62,0,4.4,.2,13,'#18232d'); panel(-2.15,1.95,0,.12,3.1,12.7,'#26343e');
      // Sealed cab ends: no hollow, open-through front or rear of the carriage.
      panel(0,1.98,-6.38,4.25,3.05,.22,'#202d37');
      panel(0,1.98,6.38,4.25,3.05,.22,'#202d37');
      panel(0,2.05,6.51,1.25,2.55,.045,'#34434d');
      panel(0,2.05,-6.51,1.25,2.55,.045,'#34434d');
      panel(2.15,1.95,-3.7,.12,3.1,5.3,'#26343e'); panel(2.15,1.95,3.7,.12,3.1,5.3,'#26343e');
      for(const z of [-5.2,-3.5,-2.1,2.1,3.5,5.2]){const win=new THREE.Mesh(new THREE.BoxGeometry(.035,1.05,1.25),new THREE.MeshStandardMaterial({color:'#112e3a',metalness:.5,roughness:.2,emissive:'#07151d',emissiveIntensity:1.4}));win.position.set(2.225,2.45,z);train.add(win);}
      const leftDoor=panel(2.17,1.95,-.52,.08,2.7,.9,'#34434e');const rightDoor=panel(2.17,1.95,.52,.08,2.7,.9,'#34434e');train.userData.doors=[leftDoor,rightDoor];
      for(const x of [-1.25,1.25]) for(const z of [-4.2,4.2]){const wheel=new THREE.Mesh(new THREE.CylinderGeometry(.38,.38,.22,16),mat('#111417',.5,.8));wheel.rotation.z=Math.PI/2;wheel.position.set(x,.55,z);train.add(wheel);}
      const headlamp=new THREE.PointLight('#c5f2ff',0,26,1.4);headlamp.position.set(0,2.1,6.4);train.add(headlamp);train.userData.headlamp=headlamp;
      const doorGlow=new THREE.PointLight('#54dfff',0,8);doorGlow.position.set(0,2.3,6.5);train.add(doorGlow);train.userData.doorGlow=doorGlow;
    }
    // Outdoor crimson-sunset finale environment is staged in a hidden group and revealed by the escape cutscene.
    const finale = new THREE.Group(); finale.visible = false; scene.add(finale);
    const fmat=(color:string,roughness=.9,metalness=0,emissive='#000000')=>new THREE.MeshStandardMaterial({color,roughness,metalness,emissive,emissiveIntensity:.8});
    const fbox=(x:number,y:number,z:number,sx:number,sy:number,sz:number,color:string)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz),fmat(color));m.position.set(x,y,z);m.receiveShadow=true;finale.add(m);return m;};
    const fmesh=(geo:THREE.BufferGeometry,mat:THREE.Material,x:number,y:number,z:number)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.receiveShadow=true;finale.add(m);return m;};
    const sky=new THREE.Mesh(new THREE.SphereGeometry(240,32,20),new THREE.MeshBasicMaterial({color:'#641d46',side:THREE.BackSide}));sky.position.set(0,0,-160);finale.add(sky);
    const sun=new THREE.Mesh(new THREE.SphereGeometry(13,32,24),new THREE.MeshBasicMaterial({color:'#ff744f'}));sun.position.set(-48,39,-210);finale.add(sun);
    const sunGlow=new THREE.PointLight('#ff684b',3,240,1.1);sunGlow.position.copy(sun.position);finale.add(sunGlow);
    const water=fmesh(new THREE.PlaneGeometry(360,300,48,40),fmat('#263f59',.22,.42,'#10283e'),0,-5,-190);water.rotation.x=-Math.PI/2;
    for(let layer=0;layer<3;layer++)for(let i=0;i<13;i++){const x=(i-6)*24+(layer%2?9:0),z=-145-layer*25,h=25+((i*17+layer*13)%35),w=18+((i*7)%12);fmesh(new THREE.ConeGeometry(w,h,5,1),fmat(layer===0?'#29283e':layer===1?'#34273d':'#453044'),x,h/2-1,z);fmesh(new THREE.ConeGeometry(w*.48,h*.56,5,1),fmat(layer===0?'#784052':'#63394c'),x-w*.12,h*.29,z+1.5);}
    fbox(0,5,-126,102,1.15,5.5,'#292c3a');
    for(const x of [-39,39]){fbox(x,18,-126,2.3,27,2.8,'#4b3548');fbox(x,31,-126,3.4,1.2,4.2,'#9b4b5a');for(let y=7;y<31;y+=3)fbox(x,y,-126,3.5,.24,3.6,'#8a4655');}
    for(let i=0;i<30;i++){const x=-49+i*3.35;fbox(x,9,-126,.16,8+Math.sin(i*.4)*2,.16,'#b36a70');}
    fbox(0,6.2,-112,3.1,.24,44,'#4c4549');for(const x of [-1.05,1.05])fbox(x,6.42,-112,.12,.12,45,'#d2a9a0');for(let z=-91;z>-135;z-=1.8)fbox(0,6.31,z,2.9,.12,.38,'#55404a');
    const dustGeo=new THREE.BufferGeometry(),dustPoints:number[]=[];for(let i=0;i<500;i++)dustPoints.push((Math.random()-.5)*150,Math.random()*42-2,-105-Math.random()*125);dustGeo.setAttribute('position',new THREE.Float32BufferAttribute(dustPoints,3));finale.add(new THREE.Points(dustGeo,new THREE.PointsMaterial({color:'#ffad91',size:.55,transparent:true,opacity:.68})));
    const lights:THREE.PointLight[]=[];
    for(const z of [12,2,-8,-18,-28,-38,-48,-58,-68]){
      const l=new THREE.PointLight('#e7f2f7',.48,12,1.55);l.position.set(0,3.72,z);scene.add(l);lights.push(l);
      const tube=box('dim cool-white platform fluorescent',0,4.38,z,1.65,.045,.18,'#d9e5e9','#aabec8');
      tube.material.emissiveIntensity=.32;
    }
    const keys=new Set<string>();let yaw=0,pitch=0,anim=0,last=0,elapsed=0,flash=0,blackout=0,trainArriving=false,boarding=false,doorOpen=0,cutscene=false,cutTimer=0,dead=false;let jumpHeight=0,jumpVelocity=0,impactShake=0,wasAirborne=false;
    const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();
    const onMouse=(e:MouseEvent)=>{if(document.pointerLockElement===renderer.domElement&&state.current.active&&!panel){yaw-=e.movementX*.0022;pitch-=e.movementY*.0018;pitch=Math.max(-1.25,Math.min(1.25,pitch));}};
    const onKeyDown=(e:KeyboardEvent)=>{if(['w','a','s','d','Shift','e','E',' '].includes(e.key))e.preventDefault();keys.add(e.key.toLowerCase());if(e.key===' '&&state.current.active&&!panel&&!cutscene&&jumpHeight<=.001){jumpVelocity=5.2;playFeedback('jump');}if((e.key==='e'||e.key==='E')&&state.current.active&&!panel)interact();};
    const onKeyUp=(e:KeyboardEvent)=>keys.delete(e.key.toLowerCase());
    const onBlur=()=>keys.clear();
    const onClick=(e:MouseEvent)=>{if(!state.current.active||panel||cutscene)return;if(document.pointerLockElement!==renderer.domElement){renderer.domElement.requestPointerLock?.();return;}pointer.x=(e.clientX/renderer.domElement.clientWidth)*2-1;pointer.y=-(e.clientY/renderer.domElement.clientHeight)*2+1;raycaster.setFromCamera(pointer,camera);const hits=raycaster.intersectObjects(scene.children,true);const hit=hits.find(h=>h.object.userData.action||h.object.name==='control cabinet');if(hit){if(hit.object.userData.action==='ticket')collect(String(hit.object.userData.id));else if(hit.object.userData.action==='drawer'){setMessage('You pull open the jammed maintenance drawer. It is empty. Keep searching the platform.');}else if(hit.object.name==='control cabinet'){if(state.current.tickets.length===3)setPanel(true);else setMessage('The control room needs all three ticket fragments as an access token.');}}};
    function collect(id:string){if(state.current.tickets.includes(id))return;state.current.tickets=[...state.current.tickets,id];const fragment=fragments.find(f=>String(f.userData.id)===id);if(fragment)fragment.visible=false;playFeedback('collect');setTickets(state.current.tickets);setMessage('Ticket fragment recovered. A message is printed on the reverse.');if(state.current.tickets.length===3){setObjective('Reach the maintenance control cabinet');setMessage('All fragments recovered. The torn message reads: WHEN THE LAST TRAIN COMES, DO NOT LOOK BACK.');}}
    function interact(){
      raycaster.setFromCamera(new THREE.Vector2(0,0),camera);const hits=raycaster.intersectObjects(scene.children,true);const hit=hits.find(h=>h.object.userData.action||h.object.name==='control cabinet'||h.object.name==='platform gate');
      if(!hit){setMessage('Search low and close: beneath benches, inside the bin, and in the maintenance drawer.');return;}
      if(hit.object.userData.action==='ticket')collect(String(hit.object.userData.id));
      else if(hit.object.userData.action==='drawer'){setMessage('You pull open the jammed drawer. It is empty. Keep searching the platform.');}
      else if(hit.object.name==='control cabinet'){if(state.current.tickets.length===3)setPanel(true);else setMessage('Three ticket fragments are required to open the maintenance panel.');}
      else if(hit.object.name==='platform gate'){if(state.current.power)escapeRef.current?.();else setMessage('The gate lock has no power.');}
    }
    function reset(){jumpHeight=0;jumpVelocity=0;impactShake=0;wasAirborne=false;state.current={active:false,power:false,tickets:[],dead:false,escape:false};fragments.forEach(fragment=>{fragment.visible=true;});camera.position.set(0,1.68,16);yaw=0;pitch=0;elapsed=0;flash=0;blackout=0;trainArriving=false;boarding=false;doorOpen=0;cutscene=false;cutTimer=0;dead=false;train.visible=false;finale.visible=false;scene.background.set('#03070d');const doors=train.userData.doors as THREE.Mesh[];if(doors?.length===2){doors[0].position.z=-.52;doors[1].position.z=.52;}watcher.visible=true;watcher.position.set(2.3,0,-55);watcher.scale.setScalar(1);watcherLight.intensity=.8;watcher.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){o.material.color.set('#090c11');o.material.emissive.set('#000000');o.material.emissiveIntensity=.7;}});lights.forEach(l=>l.intensity=.48);setTickets([]);setPower(false);setCode([]);setPanel(false);setFear(0);setObjective('Find the three ticket fragments');setMessage('The station closed seventeen years ago. So why is the departure board updating?');}
    resetRef.current=reset;
    powerRef.current=()=>{if(state.current.power)return;state.current.power=true;setPower(true);setPanel(false);watcher.position.set(2.3,0,-18);setObjective('Reach the train before the Watcher');setMessage('POWER RESTORED. Something heavy is moving in the tunnel.');train.visible=true;train.position.set(0,0,-76);trainArriving=true;train.userData.headlamp.intensity=8;train.userData.doorGlow.intensity=2;lights.forEach(l=>l.intensity=.82);};
    escapeRef.current=()=>{if(!state.current.power||boarding)return;boarding=true;setObjective('Board the train');setMessage('The doors are opening! Get to the train.');};
    function finish(){cutscene=true;cutTimer=0;doorOpen=1;camera.position.set(1.55,2.12,train.position.z+.3);setObjective('Escape the station');setMessage('The doors seal shut. Something is waiting on the platform outside your window.');}
    const resize=new ResizeObserver(()=>{if(!host.isConnected)return;renderer.setSize(host.clientWidth,host.clientHeight);camera.aspect=host.clientWidth/host.clientHeight;camera.updateProjectionMatrix();});resize.observe(host);
    const tick=(now:number)=>{anim=requestAnimationFrame(tick);const dt=Math.min(.05,(now-last)/1000||0);last=now;if(!state.current.active){renderer.render(scene,camera);return;}elapsed+=dt;
      // Lighting physically flickers. The Watcher advances only during blackouts.
      blackout=Math.max(0,blackout-dt);if(!state.current.power&&blackout<=0&&Math.sin(elapsed*1.05)>0.985){blackout=.62;lights.forEach(l=>l.intensity=.015);watcher.position.z=Math.min(camera.position.z-4,watcher.position.z+2.6);setFear(1);setMessage('LIGHTS OUT. DO NOT MOVE.');}
      else if(blackout<=0&&!state.current.power)lights.forEach((l,i)=>l.intensity=.6+.25*Math.sin(elapsed*3+i));
      if(!state.current.power){watcher.lookAt(camera.position.x,1.5,camera.position.z);if(watcher.position.distanceTo(camera.position)<2.1&&!dead){dead=true;state.current.dead=true;state.current.active=false;setScreen('dead');setMessage('The Watcher found you. The station resets.');}}
      if(state.current.power&&trainArriving&&!cutscene){train.position.z=Math.min(-24,train.position.z+dt*12);if(train.position.z>=-24){trainArriving=false;boarding=true;setMessage('The train has stopped. Its side doors are unlocking. Get aboard.');setObjective('Board the train');}}
      if(boarding&&!cutscene&&train.position.z>=-24){doorOpen=Math.min(1,doorOpen+dt*1.8);const doors=train.userData.doors as THREE.Mesh[];if(doors?.length===2){doors[0].position.z=-.52-doorOpen*.72;doors[1].position.z=.52+doorOpen*.72;}const dist=camera.position.distanceTo(new THREE.Vector3(2.5,1.7,-24));if(doorOpen>=1&&dist<3.4){finish();}}
      if(cutscene){
        cutTimer+=dt;
        const doors=train.userData.doors as THREE.Mesh[];
        // First seal the doors while the player watches the platform through the side window.
        if(cutTimer<.9&&doors?.length===2){doorOpen=Math.max(0,1-cutTimer/0.9);doors[0].position.z=-.52-doorOpen*.72;doors[1].position.z=.52+doorOpen*.72;}
        if(cutTimer<3.35){
          camera.position.x+=(1.62-camera.position.x)*Math.min(1,dt*2.8);
          camera.position.y+=(2.38-camera.position.y)*Math.min(1,dt*2.8);
          camera.position.z+=(train.position.z+.3-camera.position.z)*Math.min(1,dt*2.8);
          camera.lookAt(watcher.position.x,1.9,watcher.position.z);
        }
        // The Watcher burns only after the doors have sealed; the train remains stopped until it vanishes.
        if(cutTimer>1.05&&cutTimer<3.5){
          if(cutTimer<1.1)setMessage('THE WATCHER SCREAMS as its body ignites outside the window.');
          watcher.traverse(o=>{if(o instanceof THREE.Mesh&&o.material instanceof THREE.MeshStandardMaterial){o.material.emissive.set('#ff3a12');o.material.emissiveIntensity=Math.min(5,(cutTimer-1)*2.1);o.material.color.lerp(new THREE.Color('#ff6a16'),Math.min(1,dt*.8));}});
          watcherLight.color.set('#ff6a18');watcherLight.intensity=5+Math.sin(cutTimer*28)*2.5;
          watcher.scale.setScalar(Math.max(.12,1-(cutTimer-1.05)*.46));
        }
        if(cutTimer>=3.5&&watcher.visible){watcher.visible=false;watcherLight.intensity=0;setMessage('The Watcher screams and burns away. The train finally begins to move.');}
        // Only after the Watcher is gone does the train accelerate into the tunnel.
        if(cutTimer>=3.5&&cutTimer<6.1){train.position.z-=dt*13;camera.position.x+=(2.45-camera.position.x)*Math.min(1,dt*2);camera.position.y+=(2.35-camera.position.y)*Math.min(1,dt*2);camera.position.z+=(train.position.z+.1-camera.position.z)*Math.min(1,dt*2);camera.lookAt(2.3,2.1,train.position.z-5);}
        // Pull out of the carriage into a wide final shot of the train disappearing into darkness.
        if(cutTimer>=6.1){
          // The train bursts out of the tunnel into a vast crimson sunset valley.
          finale.visible=true;
          const reveal=Math.min(1,(cutTimer-6.1)/2.8);
          train.position.z=Math.max(-116,train.position.z-dt*(cutTimer<8.9?17:5));
          camera.position.x+=(Math.sin(cutTimer*.22)*1.4-camera.position.x)*Math.min(1,dt*1.1);
          camera.position.y+=(THREE.MathUtils.lerp(7.5,19,reveal)-camera.position.y)*Math.min(1,dt*.8);
          camera.position.z+=(-88-camera.position.z)*Math.min(1,dt*(cutTimer<8.9?1.25:.65));
          camera.lookAt(-9,12,-171);
          scene.background.set('#641d46');
          if(cutTimer>8.9){train.position.z=-116;camera.lookAt(-12,17,-174);}
        }
        if(cutTimer>14.2){state.current.active=false;state.current.escape=true;setScreen('complete');setObjective('MISSION COMPLETED');setMessage('The train crosses the bridge beneath a burning crimson sky. Beyond the water, the mountains go on forever. You escaped.');}
      }
      else {
        // Movement follows the direction the camera faces. W always moves forward relative to view,
        // even after turning around; A/D strafe relative to that same view direction.
        const forward=(keys.has('w')?1:0)-(keys.has('s')?1:0);
        const strafe=(keys.has('d')?1:0)-(keys.has('a')?1:0);
        if(forward||strafe){
          const len=Math.hypot(forward,strafe)||1;const speed=keys.has('shift')?5.0:3.2;const f=forward/len*dt*speed;const s=strafe/len*dt*speed;
          camera.position.x+=(-Math.sin(yaw))*f+Math.cos(yaw)*s;
          camera.position.z+=(-Math.cos(yaw))*f-Math.sin(yaw)*s;
        }
        camera.position.x=Math.max(-5.35,Math.min(5.35,camera.position.x));camera.position.z=Math.max(-65,Math.min(16,camera.position.z));
        const grounded=jumpHeight<=0;jumpVelocity-=13.5*dt;jumpHeight=Math.max(0,jumpHeight+jumpVelocity*dt);if(jumpHeight===0){if(wasAirborne){impactShake=.065;playFeedback('land');}jumpVelocity=0;wasAirborne=false;}else wasAirborne=true;impactShake*=Math.exp(-12*dt);camera.position.y=1.68+jumpHeight+(impactShake?Math.sin(now*.08)*impactShake:0);camera.rotation.set(pitch,yaw,0,'YXZ');
      }
      // Trigger the boarding cinematic near the train. Move train, camera and watcher together.
      if(boarding&&!cutscene&&doorOpen>=1&&train.position.z>=-24&&camera.position.z<-18&&camera.position.z>-30&&camera.position.x>1.2&&camera.position.x<4.5){finish();}
      if(!state.current.power&&elapsed>7&&Math.floor(elapsed*2)%13===0)setFear(1);
      if(state.current.active&&!panel&&!cutscene){raycaster.setFromCamera(new THREE.Vector2(0,0),camera);const targetHit=raycaster.intersectObjects(scene.children,true).find(h=>h.distance<3.25&&(h.object.userData.action||h.object.name==='control cabinet'||h.object.name==='platform gate'));const o=targetHit?.object;let prompt='';if(o?.userData.action==='ticket')prompt=state.current.tickets.includes(String(o.userData.id))?'':'E — COLLECT FRAGMENT';else if(o?.userData.action==='drawer')prompt='E — OPEN DRAWER';else if(o?.name==='control cabinet')prompt=state.current.tickets.length===3?'E — OPEN CONTROL CABINET':'E — INSPECT CONTROL CABINET';else if(o?.name==='platform gate')prompt=state.current.power?'E — OPEN GATE':'E — GATE HAS NO POWER';setInteractionPrompt(old=>old===prompt?old:prompt);}
      renderer.render(scene,camera);
    };
    renderer.domElement.addEventListener('click',onClick);
    window.addEventListener('mousemove',onMouse);
    window.addEventListener('keydown',onKeyDown);
    window.addEventListener('keyup',onKeyUp);
    window.addEventListener('blur',onBlur);
    anim=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(anim);resize.disconnect();renderer.domElement.removeEventListener('click',onClick);window.removeEventListener('mousemove',onMouse);window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',onBlur);document.exitPointerLock?.();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});renderer.dispose();renderer.domElement.remove();};
  },[]);

  useEffect(()=>{state.current.active=screen==='playing';if(screen!=='playing')document.exitPointerLock?.();},[screen,panel]);
  const begin=()=>{resetRef.current?.();state.current.active=true;setScreen('playing');};
  const connect=(wire:string,index:number)=>{const next=[...code];next[index]=wire;setCode(next);};
  return <div className="game-shell school-shell tunnel-shell cinematic-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">03</span><span>The Room Is Weird <span style={{opacity:.55}}>/ The Underground</span></span></div><div className="topbar-right"><button className="secondary-button" onClick={onBack}>Back to chapters</button></div></header>
    <main className="game-main"><div className="game-heading"><div><p className="eyebrow">Chapter 03 / The underground</p><h1>The last train left 17 years ago.</h1></div><div className="chapter-pill"><b>{screen==='complete'?'ESCAPED':power?'POWER RESTORED':'LAST SERVICE'}</b> / PLATFORM 0</div></div>
      <section className="stage school-stage tunnel-stage" aria-label="The Underground 3D scene"><div ref={hostRef} className="school-scene-host"/>
        {screen==='playing'&&<div className="school-hud"><div className="objective"><small>Current objective</small><strong>{objective}</strong></div><div className="school-status"><span className={fear?'danger-dot':''}/>{power?'TRAIN APPROACHING':fear?'LIGHTS ARE UNSTABLE':'NO SERVICE'}</div><div className="school-message" role="status">{message}</div>{interactionPrompt&&<div className="interaction-prompt">{interactionPrompt}</div>}<div className="school-controls"><kbd>W A S D</kbd> MOVE <kbd>SHIFT</kbd> SPRINT <kbd>SPACE</kbd> JUMP <kbd>MOUSE</kbd> LOOK <kbd>E</kbd> INTERACT</div><div className="school-hint">TICKETS {tickets.length}/3 Â· {power?'BOARD THE TRAIN':'WATCH THE LIGHTS'}</div><button className="hint-button school-hint-button" onClick={()=>setMessage('Fragments glow faintly near the ticket machines, station office and maintenance cabinet.')}>Need a hint?</button></div>}
        {panel&&screen==='playing'&&<div className="overlay school-overlay"><div className="dialog-card"><div className="dialog-kicker">MAINTENANCE / EMERGENCY BYPASS</div><h2>Restore the line.</h2><p>Reconnect the three numbered relays in order: 2 â†’ 4 â†’ 1. The train is not supposed to be running.</p><div style={{display:'flex',gap:10,justifyContent:'center',margin:'22px 0'}}>{[1,2,3].map((v,i)=><button key={v} className={code[i]?'primary-button':'secondary-button'} onClick={()=>connect(String((Number(code[i]||v)%4)+1),i)}>{code[i]?`RELAY ${code[i]}`:['RELAY 1','RELAY 2','RELAY 3'][i]}</button>)}</div><div className="dialog-buttons"><button className="primary-button" onClick={()=>{if(code.join(',')==='2,4,1')powerRef.current?.();else{setCode([]);setMessage('Relay overload. Resetting the sequence.');}}}>Restore power</button><button className="secondary-button" onClick={()=>setPanel(false)}>Close panel</button></div></div></div>}
        {screen!=='playing'&&<div className="overlay school-overlay"><div className="dialog-card"><div className="dialog-kicker">{screen==='complete'?'ESCAPED / RECORD 001':screen==='dead'?'RUN TERMINATED':'CHAPTER 03 / PLATFORM 0'}</div><h2>{screen==='complete'?<>ESCAPED.<br/>MISSION COMPLETED.</>:screen==='dead'?<>THE WATCHER<br/>FOUND YOU.</>:<>The Underground<br/>has no last stop.</>}</h2><p>{screen==='complete'?'The train pulls away. Through the window, the platform shrinks into darkness. Behind you, the Watcher screams as its body ignites and vanishes. The rule was real: anyone who escapes it causes its death. You are the first.':'Find all three ticket fragments. Reach the maintenance cabinet, restore the power, and board the train before the Watcher reaches you.'}</p><div className="dialog-buttons"><button className="primary-button" onClick={begin}>{screen==='complete'?'Ride again':screen==='dead'?'Try again':'Enter Platform 0'}</button>{devMode&&onChapterSelect&&<><button className="secondary-button" onClick={()=>onChapterSelect(1)}>DEV: Chapter 01 â€” Living Room</button><button className="secondary-button" onClick={()=>onChapterSelect(2)}>DEV: Chapter 02 â€” School</button></>}<button className="secondary-button" onClick={onBack}>Back to Chapter 02</button></div><div className="title-controls"><span><kbd>WASD</kbd> move</span><span><kbd>MOUSE</kbd> look</span><span><kbd>E</kbd> interact</span></div></div></div>}
      </section><div className="footer-bar"><span><strong>Mind the gap.</strong> Something is standing in it.</span><span>{screen==='complete'?'WATCHER STATUS: DECEASED':power?'TRAIN INBOUND':'PLATFORM 0 / NO SERVICE'}</span></div>
    </main>
  </div>;
}

