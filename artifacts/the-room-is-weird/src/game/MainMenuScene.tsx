import { useEffect, useRef } from 'react';
import * as THREE from 'three';

function box(parent: THREE.Object3D, size: [number,number,number], pos: [number,number,number], color: string) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshStandardMaterial({color,roughness:.9}));
  mesh.position.set(...pos); mesh.castShadow=true; mesh.receiveShadow=true; parent.add(mesh); return mesh;
}
function room(scene: THREE.Scene, pos: [number,number,number], scale: number, tone: boolean) {
  const g = new THREE.Group(); g.position.set(...pos); g.scale.setScalar(scale); scene.add(g);
  box(g,[7,.3,6],[0,0,0],tone?'#4a4741':'#5c4d3f');
  for(let i=0;i<9;i++) box(g,[.025,.015,5.8],[-3.1+i*.77,.16,0],'#877660');
  box(g,[7.1,3.4,.2],[0,1.8,-2.9],tone?'#77756e':'#b0a18c');
  box(g,[.2,3.4,3],[-3.45,1.8,-1.4],'#5c554c'); box(g,[.2,3.4,3],[3.45,1.8,-1.4],'#71685b');
  box(g,[2.45,2,.1],[-.15,2,-2.77],'#243b44');
  box(g,[2.7,.12,.16],[-.15,3.04,-2.68],'#514437'); box(g,[2.7,.12,.16],[-.15,.96,-2.68],'#514437');
  box(g,[.12,2.1,.16],[-1.5,2,-2.68],'#514437'); box(g,[.12,2.1,.16],[1.2,2,-2.68],'#514437');
  box(g,[2.5,.42,.9],[-.55,.5,.8],'#685042'); box(g,[2.5,.65,.28],[-.55,.92,1.08],'#80634f');
  box(g,[.25,.68,.85],[-1.8,.74,.8],'#544136'); box(g,[.25,.68,.85],[.7,.74,.8],'#544136');
  box(g,[1.4,.1,.8],[.4,.55,-.5],'#4c453c');
  box(g,[1.05,1.25,.07],[2.1,2.1,-2.76],'#39372f'); box(g,[.74,.92,.03],[2.1,2.1,-2.7],'#8c7960');
  const lamp=new THREE.PointLight('#ffd08a',8,8,2); lamp.position.set(2.3,2.4,-.3); g.add(lamp);
  const shade=new THREE.Mesh(new THREE.ConeGeometry(.28,.32,18),new THREE.MeshStandardMaterial({color:'#d0b58a'})); shade.position.set(2.3,2.7,-.3); shade.rotation.x=Math.PI; g.add(shade);
  return g;
}
export default function MainMenuScene() {
 const hostRef=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  const host=hostRef.current; if(!host)return;
  let renderer:THREE.WebGLRenderer;
  const scene=new THREE.Scene(); scene.background=new THREE.Color('#899397'); scene.fog=new THREE.FogExp2('#899397',.016);
  const camera=new THREE.PerspectiveCamera(43,1,.1,180); camera.position.set(11,7,18); camera.lookAt(0,2,-4);
  try { renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'}); } catch { host.classList.add('menu-scene-fallback'); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.6)); renderer.shadowMap.enabled=true; renderer.shadowMap.type=THREE.PCFSoftShadowMap; renderer.outputColorSpace=THREE.SRGBColorSpace; renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.05; host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight('#dbe4e5','#282b2d',1.3));
  const sun=new THREE.DirectionalLight('#ffdfb4',3.2); sun.position.set(-12,18,8); sun.castShadow=true; sun.shadow.mapSize.set(2048,2048); scene.add(sun);
  const fill=new THREE.DirectionalLight('#a6bdc9',1.1); fill.position.set(10,8,-10); scene.add(fill);
  const sunball=new THREE.Mesh(new THREE.SphereGeometry(2.2,28,20),new THREE.MeshBasicMaterial({color:'#ffdbab'})); sunball.position.set(-17,14,-45); scene.add(sunball);
  const sunlight=new THREE.PointLight('#ffc783',80,90,1.8); sunlight.position.copy(sunball.position); scene.add(sunlight);
  const cloudMat=new THREE.MeshStandardMaterial({color:'#b6bfbd',roughness:1,transparent:true,opacity:.16});
  for(let i=0;i<36;i++){const c=new THREE.Mesh(new THREE.IcosahedronGeometry(1+(i%4)*.6,1),cloudMat);c.position.set((i%7-3)*8,-5+(i%5),-18-Math.floor(i/7)*9);c.scale.set(2.8,.7,1.8);scene.add(c);}
  const main=room(scene,[0,2.6,-5],1.05,false); main.rotation.y=-.12;
  for(let i=0;i<19;i++){const s=box(scene,[2.25-i*.035,.16,.58],[-1.5+i*.16,-1.15+i*.25,3.4-i*.58],i%3?'#62584d':'#81715d');s.rotation.z=-.045;}
  const fragments:THREE.Group[]=[];
  const fragmentBaseY:number[]=[];
  const positions:[[number,number,number],number,number,boolean][]=[
   [[-12,1.2,-15],.64,-.2,true],[[12,-1.3,-19],.78,.2,false],[[-5,7.5,-25],.48,.15,true],[[15,5.3,-33],.52,-.3,false],[[-17,-2.8,-31],.56,.3,true]];
  positions.forEach(([p,s,r,t])=>{const f=room(scene,p,s,t);f.rotation.y=r;fragments.push(f);fragmentBaseY.push(p[1]);});
  const debris:THREE.Group[]=[];
  for(let i=0;i<15;i++){const g=new THREE.Group();g.position.set(-18+(i*2.67)%36,-1+(i%5)*2.05,-9-(i%6)*5.7);g.rotation.set(i*.17,i*.41,i*.29);scene.add(g);box(g,[.16,2.5,.16],[-.7,0,0],'#554b40');box(g,[.16,2.5,.16],[.7,0,0],'#554b40');box(g,[1.55,.16,.16],[0,1.2,0],'#554b40');box(g,[1.55,.16,.16],[0,-1.2,0],'#554b40');if(i%3===0){const chair=box(g,[.8,.12,.8],[2,-.3,0],'#5a493a');chair.rotation.z=.35;}debris.push(g);}
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),new THREE.MeshStandardMaterial({color:'#5c676b'}));ground.rotation.x=-Math.PI/2;ground.position.y=-16;scene.add(ground);
  let frame=0,last=0;const resize=()=>{const w=Math.max(1,host.clientWidth),h=Math.max(1,host.clientHeight);camera.aspect=w/h;camera.fov=w<650?49:43;camera.updateProjectionMatrix();renderer.setSize(w,h,false);};resize();const observer=new ResizeObserver(resize);observer.observe(host);
  const animate=(time:number)=>{frame=requestAnimationFrame(animate);const s=time*.00016,d=last?Math.min((time-last)/1000,.05):0;last=time;camera.position.x=11+Math.sin(s)*.55;camera.position.y=7+Math.sin(s*.8)*.18;camera.lookAt(Math.sin(s*.7)*.4,1.5,-2);main.position.y=2.6+Math.sin(s*2.3)*.07;fragments.forEach((f,i)=>{f.position.y=fragmentBaseY[i]+Math.sin(s*2+i)*.07;});debris.forEach((g,i)=>g.rotation.y+=d*(i%2?.009:-.006));renderer.render(scene,camera);};frame=requestAnimationFrame(animate);
  return()=>{cancelAnimationFrame(frame);observer.disconnect();scene.traverse(o=>{if(o instanceof THREE.Mesh){o.geometry.dispose();const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.dispose());}});renderer.dispose();renderer.domElement.remove();};
 },[]);
 return <div className="main-menu-world" ref={hostRef} aria-hidden="true"/>;
}
