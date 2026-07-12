"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Phase = "intro" | "playing" | "paused" | "complete";
type HudState = { energy: number; alert: number; buds: number; objective: string; prompt: string; heading: string };

const BUDS = [
  new THREE.Vector3(-12, 0, 14), new THREE.Vector3(17, 0, -4),
  new THREE.Vector3(38, 0, -26), new THREE.Vector3(8, 0, -48),
  new THREE.Vector3(-24, 0, -58), new THREE.Vector3(-45, 0, -28),
];
const START = new THREE.Vector3(-43, 0, 54);
const GOAL = new THREE.Vector3(-10, 0, -78);

function seeded(seed: number) {
  let v = seed >>> 0;
  return () => ((v = Math.imul(v ^ (v >>> 15), 1 | v), v ^= v + Math.imul(v ^ (v >>> 7), 61 | v), ((v ^ (v >>> 14)) >>> 0) / 4294967296));
}
function terrainY(x: number, z: number) {
  const roll = Math.sin(x * .037) * 1.5 + Math.cos(z * .042) * 1.1 + Math.sin((x + z) * .071) * .45;
  const lake = Math.max(0, 1 - Math.hypot(x - 34, z + 43) / 27) * 3.6;
  return roll - lake;
}
function canvasTexture(kind: "ground" | "bark") {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const ctx = c.getContext("2d")!; const rnd = seeded(kind === "ground" ? 31 : 87);
  ctx.fillStyle = kind === "ground" ? "#31432b" : "#4c3825"; ctx.fillRect(0,0,256,256);
  for(let i=0;i<2400;i++){
    const a = kind === "ground" ? 0.035 + rnd()*.1 : .06 + rnd()*.1;
    ctx.fillStyle = kind === "ground" ? `rgba(${70+rnd()*45},${80+rnd()*50},${36+rnd()*25},${a})` : `rgba(${30+rnd()*70},${18+rnd()*35},${8+rnd()*20},${a})`;
    const x=rnd()*256,y=rnd()*256,w=kind==="ground"?rnd()*4+1:rnd()*2+1,h=kind==="ground"?rnd()*4+1:rnd()*28+5;
    ctx.fillRect(x,y,w,h);
  }
  const tex = new THREE.CanvasTexture(c); tex.wrapS=tex.wrapT=THREE.RepeatWrapping; tex.repeat.set(kind === "ground" ? 34 : 2, kind === "ground" ? 34 : 8); tex.colorSpace=THREE.SRGBColorSpace; tex.anisotropy=8; return tex;
}
function makeSky() {
  const g = new THREE.SphereGeometry(420, 32, 18);
  return new THREE.Mesh(g, new THREE.ShaderMaterial({side:THREE.BackSide, uniforms:{top:{value:new THREE.Color("#5d8277")},bottom:{value:new THREE.Color("#d6c69c")}}, vertexShader:`varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,fragmentShader:`varying vec3 v;uniform vec3 top;uniform vec3 bottom;void main(){float h=normalize(v).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.1,.72,h)),1.);}`}));
}
function leafMaterial(color: string) { return new THREE.MeshStandardMaterial({color,roughness:.88,metalness:0,flatShading:true}); }

function trailRibbon(curve: THREE.CatmullRomCurve3) {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[]; const segments=90,width=1.7;
  for(let i=0;i<=segments;i++){
    const t=i/segments,p=curve.getPoint(t),tan=curve.getTangent(t).normalize(),side=new THREE.Vector3(-tan.z,0,tan.x).normalize();
    for(const edge of [-1,1]){positions.push(p.x+side.x*width*edge,p.y+.035,p.z+side.z*width*edge);uvs.push((edge+1)/2,t*18)}
    if(i<segments){const n=i*2;indices.push(n,n+2,n+1,n+1,n+2,n+3)}
  }
  const g=new THREE.BufferGeometry();g.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));g.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));g.setIndex(indices);g.computeVertexNormals();return g;
}

function buildWorld(scene: THREE.Scene, quality: number) {
  const terrain = new THREE.PlaneGeometry(240,240,90,90); terrain.rotateX(-Math.PI/2);
  const pos=terrain.attributes.position as THREE.BufferAttribute;
  for(let i=0;i<pos.count;i++) pos.setY(i,terrainY(pos.getX(i),pos.getZ(i)));
  terrain.computeVertexNormals();
  const ground=new THREE.Mesh(terrain,new THREE.MeshStandardMaterial({map:canvasTexture("ground"),color:"#617349",roughness:.95}));
  ground.receiveShadow=true; scene.add(ground);
  const rnd=seeded(7331); const treeCount=Math.round(145*quality);
  const trunkGeo=new THREE.CylinderGeometry(.32,.58,7,7); const trunkMat=new THREE.MeshStandardMaterial({map:canvasTexture("bark"),color:"#765b3a",roughness:1});
  const trunks=new THREE.InstancedMesh(trunkGeo,trunkMat,treeCount); trunks.castShadow=trunks.receiveShadow=true;
  const crownGeo=new THREE.IcosahedronGeometry(2.8,1); const crowns=new THREE.InstancedMesh(crownGeo,leafMaterial("#3f6739"),treeCount*2); crowns.castShadow=true;
  const dummy=new THREE.Object3D(); let count=0;
  while(count<treeCount){
    const x=rnd()*220-110,z=rnd()*220-110; if(Math.hypot(x-34,z+43)<34||Math.hypot(x,z)<10||Math.hypot(x+43,z-54)<8)continue;
    const scale=.72+rnd()*.8,y=terrainY(x,z);
    dummy.position.set(x,y+3.5*scale,z); dummy.scale.set(scale,scale,scale); dummy.rotation.y=rnd()*Math.PI; dummy.updateMatrix(); trunks.setMatrixAt(count,dummy.matrix);
    for(let j=0;j<2;j++){dummy.position.set(x+(rnd()-.5)*2.3*scale,y+(7+j*.8)*scale,z+(rnd()-.5)*2.3*scale);dummy.scale.set(scale*(.72+rnd()*.36),scale*(.7+rnd()*.38),scale*(.72+rnd()*.36));dummy.rotation.set(rnd(),rnd()*Math.PI,rnd()*.3);dummy.updateMatrix();crowns.setMatrixAt(count*2+j,dummy.matrix)} count++;
  }
  scene.add(trunks,crowns);
  const lake=new THREE.Mesh(new THREE.CircleGeometry(25,48),new THREE.MeshPhysicalMaterial({color:"#456b64",roughness:.22,metalness:.05,transparent:true,opacity:.78})); lake.rotation.x=-Math.PI/2;lake.position.set(34,terrainY(34,-43)+.8,-43);scene.add(lake);
  // Ramble trail: a ribbon of stone winding through the scene.
  const trailPts=[new THREE.Vector3(-50,0,62),new THREE.Vector3(-28,0,35),new THREE.Vector3(-4,0,18),new THREE.Vector3(18,0,-4),new THREE.Vector3(12,0,-34),new THREE.Vector3(-8,0,-62),new THREE.Vector3(-10,0,-82)];
  for(const p of trailPts)p.y=terrainY(p.x,p.z)+.06;
  const trailCurve=new THREE.CatmullRomCurve3(trailPts); const trail=new THREE.Mesh(trailRibbon(trailCurve),new THREE.MeshStandardMaterial({color:"#8d856c",roughness:1})); trail.receiveShadow=true; scene.add(trail);
  // Bow Bridge inspired stone arch and sanctuary gate.
  const stone=new THREE.MeshStandardMaterial({color:"#b5ad94",roughness:.78});
  const bridge=new THREE.Group(); const deck=new THREE.Mesh(new THREE.BoxGeometry(18,.8,4),stone); deck.position.y=1.5;bridge.add(deck);
  for(const x of [-8,-4,0,4,8]){const post=new THREE.Mesh(new THREE.BoxGeometry(.35,1.5,.35),stone);post.position.set(x,2.55,-1.7);bridge.add(post);const post2=post.clone();post2.position.z=1.7;bridge.add(post2)}
  bridge.position.set(18,terrainY(18,-4),-4);bridge.rotation.y=-.45;scene.add(bridge);
  const gate=new THREE.Group();
  for(const x of [-3.8,3.8]){const pillar=new THREE.Mesh(new THREE.BoxGeometry(1.2,5,1.2),stone);pillar.position.set(x,2.5,0);pillar.castShadow=true;gate.add(pillar)}
  const arch=new THREE.Mesh(new THREE.TorusGeometry(3.8,.62,8,24,Math.PI),stone);arch.rotation.z=Math.PI;arch.position.y=4.5;gate.add(arch);gate.position.set(GOAL.x,terrainY(GOAL.x,GOAL.z),GOAL.z);scene.add(gate);
  // Park furniture and lights.
  const metal=new THREE.MeshStandardMaterial({color:"#1e2b25",roughness:.45,metalness:.6});
  for(let i=0;i<18;i++){const t=i/17,p=trailCurve.getPoint(t),pole=new THREE.Mesh(new THREE.CylinderGeometry(.07,.1,4,7),metal);pole.position.set(p.x,p.y+2,p.z+(i%2?3.1:-3.1));scene.add(pole);const bulb=new THREE.Mesh(new THREE.SphereGeometry(.2,10,8),new THREE.MeshBasicMaterial({color:"#ffe4a1"}));bulb.position.copy(pole.position).add(new THREE.Vector3(0,2,0));scene.add(bulb)}
  // Forage buds and scent beacons.
  const buds:THREE.Group[]=[]; const rings:THREE.Mesh[]=[];
  BUDS.forEach((bp,i)=>{bp.y=terrainY(bp.x,bp.z)+1;const g=new THREE.Group();for(let j=0;j<5;j++){const leaf=new THREE.Mesh(new THREE.SphereGeometry(.28,8,6),leafMaterial(j===0?"#d9ef8b":"#7da553"));leaf.scale.set(.45,1,.35);leaf.position.set(Math.cos(j*1.25)*.25,Math.sin(j*.8)*.12,Math.sin(j*1.25)*.25);g.add(leaf)}g.position.copy(bp);g.userData.index=i;scene.add(g);buds.push(g);const ring=new THREE.Mesh(new THREE.TorusGeometry(1.2,.035,6,36),new THREE.MeshBasicMaterial({color:"#d9ef8b",transparent:true,opacity:0}));ring.rotation.x=Math.PI/2;ring.position.copy(bp);ring.position.y+=.2;scene.add(ring);rings.push(ring)});
  // Low-poly red-tailed hawk silhouette.
  const hawk=new THREE.Group(), hawkMat=new THREE.MeshStandardMaterial({color:"#3a281c",roughness:.8});
  const body=new THREE.Mesh(new THREE.ConeGeometry(.42,1.8,6),hawkMat);body.rotation.z=Math.PI/2;hawk.add(body);
  for(const s of [-1,1]){const wing=new THREE.Mesh(new THREE.ConeGeometry(.55,3.3,3),hawkMat);wing.rotation.z=s*.92;wing.rotation.x=Math.PI/2;wing.position.z=s*1.25;hawk.add(wing)} scene.add(hawk);
  return {buds,rings,hawk,lake,trailCurve};
}

function startAudio() {
  const A = window.AudioContext || (window as unknown as {webkitAudioContext:typeof AudioContext}).webkitAudioContext; const ctx=new A();
  const master=ctx.createGain(); master.gain.value=.13; master.connect(ctx.destination);
  const hum=ctx.createOscillator(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();hum.type="sine";hum.frequency.value=58;filter.type="lowpass";filter.frequency.value=180;gain.gain.value=.045;hum.connect(filter).connect(gain).connect(master);hum.start();
  const interval=window.setInterval(()=>{const o=ctx.createOscillator(),g=ctx.createGain();o.type="sine";o.frequency.value=1100+Math.random()*1700;g.gain.setValueAtTime(0,ctx.currentTime);g.gain.linearRampToValueAtTime(.035,ctx.currentTime+.02);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+.12);o.connect(g).connect(master);o.start();o.stop(ctx.currentTime+.14)},2800);
  return {ctx,master,interval};
}

export function GameClient() {
  const mount=useRef<HTMLDivElement>(null); const phaseRef=useRef<Phase>("intro"); const collected=useRef(new Set<number>()); const scentRef=useRef(false);
  const [phase,setPhaseState]=useState<Phase>("intro"); const [muted,setMuted]=useState(false); const [scent,setScent]=useState(false); const [toast,setToast]=useState("");
  const [hud,setHud]=useState<HudState>({energy:100,alert:6,buds:0,objective:"Follow the old bridle trail",prompt:"",heading:"N"});
  const setPhase=(p:Phase)=>{phaseRef.current=p;setPhaseState(p)};

  useEffect(()=>{
    if(!mount.current)return; const host=mount.current;
    const scene=new THREE.Scene();scene.background=new THREE.Color("#7d9a83");scene.fog=new THREE.FogExp2("#8eaa8b",.0082);scene.add(makeSky());
    const camera=new THREE.PerspectiveCamera(68,innerWidth/innerHeight,.08,500); camera.rotation.order="YXZ";
    const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:"high-performance"}); renderer.setPixelRatio(Math.min(devicePixelRatio,1.65));renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;renderer.outputColorSpace=THREE.SRGBColorSpace;host.appendChild(renderer.domElement);
    const hemi=new THREE.HemisphereLight("#dfe9c9","#253225",1.55);scene.add(hemi);const sun=new THREE.DirectionalLight("#ffdfad",3.3);sun.position.set(-45,85,26);sun.castShadow=true;sun.shadow.mapSize.set(qualityTier()>0.75?2048:1024,qualityTier()>0.75?2048:1024);sun.shadow.camera.left=sun.shadow.camera.bottom=-90;sun.shadow.camera.right=sun.shadow.camera.top=90;scene.add(sun);
    const world=buildWorld(scene,qualityTier()); const clock=new THREE.Clock(), keys=new Set<string>(), velocity=new THREE.Vector3(), player=START.clone();player.y=terrainY(player.x,player.z)+1.65;camera.position.copy(player);
    let yaw=-.35,pitch=-.05,energy=100,alert=5,lastHud=0,gameTime=0; const armMat=new THREE.MeshStandardMaterial({color:"#604b38",roughness:1});
    const arms=new THREE.Group();for(const s of [-1,1]){const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.12,.72,5,7),armMat);arm.rotation.z=s*.22;arm.rotation.x=-.45;arm.position.set(s*.44,-.42,-.62);arms.add(arm);for(let c=0;c<3;c++){const claw=new THREE.Mesh(new THREE.ConeGeometry(.022,.18,6),new THREE.MeshStandardMaterial({color:"#d4cbb5",roughness:.55}));claw.rotation.x=-Math.PI/2;claw.position.set(s*(.38+c*.055),-.72,-.96);arms.add(claw)}}camera.add(arms);scene.add(camera);
    let dragging=false,lastTouchX=0,lastTouchY=0;
    const requestLock=()=>{if(phaseRef.current!=="playing")return;const lock=renderer.domElement.requestPointerLock();lock?.catch(()=>undefined)};
    const pointer=(e:PointerEvent)=>{if(e.pointerType==="touch"){dragging=true;lastTouchX=e.clientX;lastTouchY=e.clientY;renderer.domElement.setPointerCapture(e.pointerId)}else requestLock()};
    const pointerMove=(e:PointerEvent)=>{if(dragging&&e.pointerType==="touch"){yaw-=(e.clientX-lastTouchX)*.006;pitch=Math.max(-1.3,Math.min(1.2,pitch-(e.clientY-lastTouchY)*.005));lastTouchX=e.clientX;lastTouchY=e.clientY}};
    const pointerUp=()=>{dragging=false};
    const mouse=(e:MouseEvent)=>{if(document.pointerLockElement===renderer.domElement&&phaseRef.current==="playing"){yaw-=e.movementX*.0018;pitch=Math.max(-1.3,Math.min(1.2,pitch-e.movementY*.00155))}};
    const keyDown=(e:KeyboardEvent)=>{keys.add(e.code);if(e.code==="Escape"&&phaseRef.current==="playing")setPhase("paused");if(e.code==="KeyC"){scentRef.current=!scentRef.current;setScent(scentRef.current)}if(e.code==="KeyM")setMuted(v=>!v);if(e.code==="KeyE")collectNearby()}; const keyUp=(e:KeyboardEvent)=>keys.delete(e.code);
    const collectNearby=()=>{world.buds.forEach((bud,i)=>{if(!collected.current.has(i)&&bud.visible&&bud.position.distanceTo(camera.position)<3.2){collected.current.add(i);bud.visible=false;energy=Math.min(100,energy+22);setToast(`Tender bud ${collected.current.size} of 5 — energy restored`);setTimeout(()=>setToast(""),2100);if(collected.current.size>=5)setToast("Sanctuary scent acquired — head south")}})};
    renderer.domElement.addEventListener("pointerdown",pointer);renderer.domElement.addEventListener("pointermove",pointerMove);renderer.domElement.addEventListener("pointerup",pointerUp);document.addEventListener("mousemove",mouse);document.addEventListener("keydown",keyDown);document.addEventListener("keyup",keyUp);
    const resize=()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)};addEventListener("resize",resize);
    let raf=0;
    function frame(){raf=requestAnimationFrame(frame);const dt=Math.min(clock.getDelta(),.05);gameTime+=dt;
      if(phaseRef.current==="playing"){
        const forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw)),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),wish=new THREE.Vector3();if(keys.has("KeyW")||keys.has("ArrowUp"))wish.add(forward);if(keys.has("KeyS")||keys.has("ArrowDown"))wish.sub(forward);if(keys.has("KeyD")||keys.has("ArrowRight"))wish.add(right);if(keys.has("KeyA")||keys.has("ArrowLeft"))wish.sub(right);
        const gripping=keys.has("ShiftLeft")||keys.has("ShiftRight");const speed=gripping&&energy>1?6.7:3.45;if(wish.lengthSq()>0)wish.normalize();velocity.lerp(wish.multiplyScalar(speed),1-Math.exp(-dt*7));const before=player.clone();player.addScaledVector(velocity,dt);if(Math.hypot(player.x-34,player.z+43)<23||Math.abs(player.x)>112||Math.abs(player.z)>112)player.copy(before);player.y=terrainY(player.x,player.z)+1.65+Math.sin(gameTime*5.5)*Math.min(.035,velocity.length()*.008);camera.position.copy(player);camera.rotation.set(pitch,yaw,0);
        energy=Math.max(0,Math.min(100,energy+(gripping&&wish.lengthSq()>0?-17:5.2)*dt));const exposed=Math.max(0,1-Math.min(1,nearestTreeShade(player)/18));alert=Math.max(2,Math.min(100,alert+(exposed*4.4-(1-exposed)*5.5)*dt));
        arms.rotation.z=Math.sin(gameTime*2.8)*.02;arms.position.y=Math.sin(gameTime*5.4)*Math.min(.035,velocity.length()*.01);
        world.hawk.position.set(player.x+Math.cos(gameTime*.42)*24,18+Math.sin(gameTime*.7)*2,player.z+Math.sin(gameTime*.42)*24);world.hawk.rotation.y=-gameTime*.42;world.hawk.children.forEach((w,i)=>{if(i>0)w.rotation.z=(i===1?1:-1)*(.92+Math.sin(gameTime*3)*.12)});
        world.buds.forEach((b,i)=>{if(!b.visible)return;b.rotation.y+=dt*.7;b.position.y=terrainY(b.position.x,b.position.z)+1+Math.sin(gameTime*2+i)*.14});world.rings.forEach((r,i)=>{(r.material as THREE.MeshBasicMaterial).opacity=scentRef.current&&!collected.current.has(i)?.58:0;r.scale.setScalar(1+(gameTime*.6+i*.17)%2.5)});
        if(collected.current.size>=5&&player.distanceTo(GOAL)<7){setPhase("complete");document.exitPointerLock();}
        if(gameTime-lastHud>.12){lastHud=gameTime;let near="";world.buds.forEach((b)=>{if(b.visible&&b.position.distanceTo(player)<3.2)near="FORAGE TENDER BUD"});const head=((yaw%(Math.PI*2))+Math.PI*2)%(Math.PI*2),dirs=["N","NW","W","SW","S","SE","E","NE"];setHud({energy,alert,buds:Math.min(collected.current.size,5),objective:collected.current.size>=5?"Reach the stone sanctuary gate":"Follow the old bridle trail",prompt:near,heading:dirs[Math.round(head/(Math.PI/4))%8]})}
      }
      renderer.render(scene,camera)} frame();
    function nearestTreeShade(p:THREE.Vector3){const anchors=[[-43,54],[-30,35],[-12,14],[17,-4],[8,-48],[-24,-58],[-10,-78]];return Math.min(...anchors.map(a=>Math.hypot(p.x-a[0],p.z-a[1])))}
    function qualityTier(){return matchMedia("(prefers-reduced-motion: reduce)").matches?.72:(navigator.hardwareConcurrency??4)>=8?1:.78}
    return()=>{cancelAnimationFrame(raf);renderer.domElement.removeEventListener("pointerdown",pointer);renderer.domElement.removeEventListener("pointermove",pointerMove);renderer.domElement.removeEventListener("pointerup",pointerUp);document.removeEventListener("mousemove",mouse);document.removeEventListener("keydown",keyDown);document.removeEventListener("keyup",keyUp);removeEventListener("resize",resize);renderer.dispose();if(host.contains(renderer.domElement))host.removeChild(renderer.domElement)};
  },[]);

  const audioRef=useRef<ReturnType<typeof startAudio>|null>(null);
  const safeLock=()=>{const lock=mount.current?.querySelector("canvas")?.requestPointerLock();lock?.catch(()=>undefined)};
  const begin=useCallback(()=>{if(!audioRef.current)audioRef.current=startAudio();setPhase("playing");setTimeout(safeLock,30)},[]);
  const resume=()=>{setPhase("playing");safeLock()};
  useEffect(()=>{if(audioRef.current)audioRef.current.master.gain.value=muted?0:.13},[muted]);
  useEffect(()=>()=>{if(audioRef.current){clearInterval(audioRef.current.interval);audioRef.current.ctx.close().catch(()=>undefined);audioRef.current=null}},[]);
  const mobileKey=(code:string,down:boolean)=>window.dispatchEvent(new KeyboardEvent(down?"keydown":"keyup",{code}));

  return <main className="game-shell" data-game-state={phase}>
    <div ref={mount} className="viewport" aria-label="3D game viewport" />
    <div className="world-grade"/><div className="world-vignette"/><div className="grain"/>
    {phase!=="intro"&&<div className="hud" aria-live="polite">
      <section className="mission"><div className="eyebrow">Current objective</div><h2>{hud.objective}</h2><p>{hud.buds} / 5 tender buds foraged</p></section>
      <div className="compass"><div className="eyebrow">The Ramble · 6:42 PM</div><div className="compass-line"><span>W</span><span className="active">{hud.heading}</span><span>E</span></div></div>
      <div className="status"><div className="eyebrow">Canopy cover</div><strong>{Math.max(0,100-Math.round(hud.alert))}%</strong></div>
      <div className="meters"><div className="meter-row"><span>Energy</span><div className="meter-track"><div className="meter-fill" style={{width:`${hud.energy}%`}}/></div><span>{Math.round(hud.energy)}</span></div><div className="meter-row"><span>Threat</span><div className="meter-track"><div className="meter-fill alert" style={{width:`${hud.alert}%`}}/></div><span>{Math.round(hud.alert)}</span></div></div>
      <div className="crosshair"/>{hud.prompt&&<div className="interaction"><span className="key">E</span>{hud.prompt}</div>}
      <div className="controls-strip"><span>WASD Move</span><span>Shift Grip</span><span>C Scent</span><span>M {muted?"Unmute":"Mute"}</span></div>
      <div className={`scent-overlay ${scent?"on":""}`}/>{toast&&<div className="toast">{toast}</div>}
    </div>}
    {phase==="intro"&&<section className="screen"><div className="screen-content"><div><div className="brand-mark">NORTHWOOD FIELD STUDIES · 01</div><h1 className="hero-title">SLOTH<span>PARK</span></h1><p className="hero-copy">A storm. A broken transport crate. One impossible night in Manhattan’s wild heart. Stay beneath the canopy, forage for strength, and follow the old paths to sanctuary before the city turns dark.</p><button className="primary" onClick={begin}>Enter Central Park <b>→</b></button></div><aside className="briefing"><div className="eyebrow">Field briefing</div><dl><div><dt>Location</dt><dd>The Ramble, NYC</dd></div><div><dt>Species</dt><dd>Brown-throated sloth</dd></div><div><dt>Conditions</dt><dd>Rain clearing</dd></div><div><dt>Window</dt><dd>18 minutes of light</dd></div></dl></aside></div><div className="field-note">“Slow is not helpless. In the canopy, stillness is a kind of camouflage.”</div></section>}
    {phase==="paused"&&<section className="screen"><div className="pause-card"><div className="eyebrow">Field session paused</div><h2>Listen to the park.</h2><p>Your progress is safe. The hawk will keep circling, but the canopy is patient.</p><div className="actions"><button className="primary" onClick={resume}>Return to trail <b>→</b></button><button className="secondary" onClick={()=>setMuted(v=>!v)}>{muted?"Enable sound":"Mute sound"}</button></div></div></section>}
    {phase==="complete"&&<section className="screen"><div className="pause-card"><div className="eyebrow">Sanctuary reached</div><h2>You made the impossible crossing.</h2><p>Five buds, one old trail, and a city’s wildest mile. The wildlife team finds your trail at first light.</p><div className="actions"><button className="primary" onClick={()=>location.reload()}>Begin again <b>↻</b></button></div></div></section>}
    {phase==="playing"&&<div className="mobile-controls"><button aria-label="Move forward" className="move" onPointerDown={()=>mobileKey("KeyW",true)} onPointerUp={()=>mobileKey("KeyW",false)} onPointerCancel={()=>mobileKey("KeyW",false)}>Move</button><button aria-label="Grip burst" className="grip" onPointerDown={()=>mobileKey("ShiftLeft",true)} onPointerUp={()=>mobileKey("ShiftLeft",false)} onPointerCancel={()=>mobileKey("ShiftLeft",false)}>Grip</button><button aria-label="Toggle scent vision" className="sense" onClick={()=>mobileKey("KeyC",true)}>Sense</button></div>}
  </main>;
}
