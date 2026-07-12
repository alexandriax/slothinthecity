"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { createSlothRig } from "./player/SlothRig";
import { loadGameTextures } from "./rendering/textures";
import { buildRealisticWorld, GOAL, START, terrainY } from "./world/RealisticWorld";

type Phase = "intro" | "playing" | "paused" | "complete";
type MotionState = "READY" | "TRAVERSING" | "GRIP BURST" | "RECOVERING" | "WINDED" | "PATH BLOCKED";
type HudState = { energy: number; alert: number; buds: number; objective: string; prompt: string; heading: string; motion: MotionState; hint: string; x: number; z: number };

function startAudio() {
  const Audio = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const context = new Audio(), master = context.createGain(); master.gain.value = .13; master.connect(context.destination);
  const hum = context.createOscillator(), filter = context.createBiquadFilter(), gain = context.createGain();
  hum.type = "sine"; hum.frequency.value = 58; filter.type = "lowpass"; filter.frequency.value = 180; gain.gain.value = .045;
  hum.connect(filter).connect(gain).connect(master); hum.start();
  const interval = window.setInterval(() => {
    const bird = context.createOscillator(), birdGain = context.createGain(); bird.type = "sine"; bird.frequency.value = 1100 + Math.random() * 1700;
    birdGain.gain.setValueAtTime(0, context.currentTime); birdGain.gain.linearRampToValueAtTime(.035, context.currentTime + .02); birdGain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .12);
    bird.connect(birdGain).connect(master); bird.start(); bird.stop(context.currentTime + .14);
  }, 2800);
  return { context, master, interval };
}

function qualityTier() {
  if (new URLSearchParams(location.search).has("qa")) return .66;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || innerWidth < 760) return .66;
  return (navigator.hardwareConcurrency ?? 4) >= 8 ? 1 : .8;
}

export function GameClient() {
  const mount = useRef<HTMLDivElement>(null), phaseRef = useRef<Phase>("intro"), collected = useRef(new Set<number>()), scentRef = useRef(false);
  const [phase, setPhaseState] = useState<Phase>("intro"), [ready, setReady] = useState(false), [exiting, setExiting] = useState(false);
  const [muted, setMuted] = useState(false), [scent, setScent] = useState(false), [toast, setToast] = useState("");
  const [hud, setHud] = useState<HudState>({ energy: 100, alert: 6, buds: 0, objective: "Follow the old bridle trail", prompt: "", heading: "N", motion: "READY", hint: "Movement always available", x: START.x, z: START.z });
  const setPhase = (next: Phase) => { phaseRef.current = next; setPhaseState(next); };

  useEffect(() => {
    if (!mount.current) return;
    const host = mount.current, tier = qualityTier(); let disposed = false;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#8e9a89"); scene.fog = new THREE.FogExp2("#999e89", .0048);
    const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, .08, 500); camera.rotation.order = "YXZ";
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, tier > .85 ? 1.6 : 1.15)); renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .96; renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const textures = loadGameTextures(renderer, () => { if (!disposed) setReady(true); });
    const world = buildRealisticWorld(scene, textures, tier);
    const hemisphere = new THREE.HemisphereLight("#dce3d2", "#3b3329", .62); scene.add(hemisphere);
    const sun = new THREE.DirectionalLight("#ffd49a", 2.65); sun.position.set(-35, 68, 25); sun.castShadow = true;
    sun.shadow.mapSize.set(tier > .85 ? 2048 : 1024, tier > .85 ? 2048 : 1024); sun.shadow.camera.left = sun.shadow.camera.bottom = -42; sun.shadow.camera.right = sun.shadow.camera.top = 42;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 150; sun.shadow.normalBias = .035; sun.shadow.bias = -.00008; scene.add(sun, sun.target);

    let composer: EffectComposer | null = null;
    if (tier > .85) {
      composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
      const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight); gtao.blendIntensity = .58; composer.addPass(gtao); composer.addPass(new OutputPass());
    }

    const timer = new THREE.Timer(); timer.connect(document);
    const keys = new Set<string>(), velocity = new THREE.Vector3(), player = START.clone();
    const qaInput = location.hostname === "localhost" ? new URLSearchParams(location.search).get("qa") : null;
    if (qaInput === "autowalk" || qaInput === "autogrip") keys.add("KeyW");
    if (qaInput === "autogrip") keys.add("ShiftLeft");
    player.y = terrainY(player.x, player.z) + 1.48; camera.position.copy(player);
    const sloth = createSlothRig(textures.fur); sloth.root.scale.setScalar(innerWidth < 760 ? .54 : .78); camera.add(sloth.root); scene.add(camera);
    let yaw = -.35, pitch = -.04, energy = 100, alert = 5, lastHud = 0, gameTime = 0, dragging = false, lastTouchX = 0, lastTouchY = 0, blocked = false;

    const requestLock = () => { if (phaseRef.current !== "playing" || new URLSearchParams(location.search).has("qa")) return; renderer.domElement.requestPointerLock()?.catch(() => undefined); };
    const pointer = (event: PointerEvent) => { if (event.pointerType === "touch") { dragging = true; lastTouchX = event.clientX; lastTouchY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); } else requestLock(); };
    const pointerMove = (event: PointerEvent) => { if (dragging && event.pointerType === "touch") { yaw -= (event.clientX - lastTouchX) * .006; pitch = Math.max(-1.3, Math.min(1.2, pitch - (event.clientY - lastTouchY) * .005)); lastTouchX = event.clientX; lastTouchY = event.clientY; } };
    const pointerUp = () => { dragging = false; };
    const mouse = (event: MouseEvent) => { if (document.pointerLockElement === renderer.domElement && phaseRef.current === "playing") { yaw -= event.movementX * .0018; pitch = Math.max(-1.3, Math.min(1.2, pitch - event.movementY * .00155)); } };
    const collectNearby = () => world.buds.forEach((bud, index) => {
      if (!collected.current.has(index) && bud.visible && bud.position.distanceTo(camera.position) < 3.2) {
        collected.current.add(index); bud.visible = false; energy = Math.min(100, energy + 22); setToast(`Tender bud ${collected.current.size} of 5 — energy restored`);
        setTimeout(() => setToast(""), 2100); if (collected.current.size >= 5) setToast("Sanctuary scent acquired — head south");
      }
    });
    const keyDown = (event: KeyboardEvent) => { keys.add(event.code); if (event.code === "Escape" && phaseRef.current === "playing") setPhase("paused"); if (event.code === "KeyC") { scentRef.current = !scentRef.current; setScent(scentRef.current); } if (event.code === "KeyM") setMuted(value => !value); if (event.code === "KeyE") collectNearby(); };
    const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const pauseOnFocusLoss = () => { keys.clear(); velocity.set(0, 0, 0); if (phaseRef.current === "playing" && !new URLSearchParams(location.search).has("qa")) setPhase("paused"); };
    const pointerLockChanged = () => { if (document.pointerLockElement !== renderer.domElement) pauseOnFocusLoss(); };
    renderer.domElement.addEventListener("pointerdown", pointer); renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerup", pointerUp);
    document.addEventListener("mousemove", mouse); document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp);
    document.addEventListener("pointerlockchange", pointerLockChanged); window.addEventListener("blur", pauseOnFocusLoss);
    const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); composer?.setSize(innerWidth, innerHeight); sloth.root.scale.setScalar(innerWidth < 760 ? .54 : .78); };
    addEventListener("resize", resize);

    let raf = 0;
    function nearestTreeShade(position: THREE.Vector3) { const anchors = [[-43, 54], [-30, 35], [-12, 14], [17, -4], [8, -48], [-24, -58], [-10, -78]]; return Math.min(...anchors.map(anchor => Math.hypot(position.x - anchor[0], position.z - anchor[1]))); }
    function frame(timestamp?: number) {
      raf = requestAnimationFrame(frame); timer.update(timestamp); const delta = Math.min(timer.getDelta(), .05); gameTime += delta;
      if (phaseRef.current === "playing") {
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0, gripHeld = keys.has("ShiftLeft") || keys.has("ShiftRight"), gripBurst = moving && gripHeld && energy > 8;
        const walkingSpeed = THREE.MathUtils.lerp(2.35, 3.3, energy / 100), speed = gripBurst ? 5.9 : walkingSpeed;
        if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(speed), 1 - Math.exp(-delta * (moving ? 8 : 5)));
        player.addScaledVector(velocity, delta); blocked = false;
        const lakeX = player.x - 34, lakeZ = player.z + 43, lakeDistance = Math.hypot(lakeX, lakeZ), shoreline = 24.25;
        if (lakeDistance < shoreline) { const safeDistance = Math.max(lakeDistance, .001); player.x = 34 + lakeX / safeDistance * shoreline; player.z = -43 + lakeZ / safeDistance * shoreline; blocked = moving; velocity.multiplyScalar(.72); }
        const clampedX = THREE.MathUtils.clamp(player.x, -111.5, 111.5), clampedZ = THREE.MathUtils.clamp(player.z, -111.5, 111.5);
        if (clampedX !== player.x || clampedZ !== player.z) { blocked = moving; player.x = clampedX; player.z = clampedZ; velocity.multiplyScalar(.35); }
        player.y = terrainY(player.x, player.z) + 1.48 + Math.sin(gameTime * 5.5) * Math.min(.025, velocity.length() * .006); camera.position.copy(player); camera.rotation.set(pitch, yaw, 0);
        const energyRate = moving ? (gripBurst ? -13.5 : -1.35) : 9.5;
        energy = Math.max(0, Math.min(100, energy + energyRate * delta));
        const exposed = Math.max(0, 1 - Math.min(1, nearestTreeShade(player) / 18)); alert = Math.max(2, Math.min(100, alert + (exposed * 4.4 - (1 - exposed) * 5.5) * delta));
        sloth.animate(gameTime, velocity.length(), gripBurst); world.animate(gameTime, player, scentRef.current, collected.current);
        sun.position.set(player.x - 35, player.y + 68, player.z + 25); sun.target.position.set(player.x, player.y, player.z - 8); sun.target.updateMatrixWorld();
        if (collected.current.size >= 5 && player.distanceTo(GOAL) < 7) { setPhase("complete"); document.exitPointerLock(); }
        if (gameTime - lastHud > .12) {
          lastHud = gameTime; let prompt = ""; world.buds.forEach(bud => { if (bud.visible && bud.position.distanceTo(player) < 3.2) prompt = "FORAGE TENDER BUD"; });
          const head = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), directions = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
          const motion: MotionState = blocked ? "PATH BLOCKED" : moving ? (gripBurst ? "GRIP BURST" : energy < 12 ? "WINDED" : "TRAVERSING") : energy < 99 ? "RECOVERING" : "READY";
          const hint = blocked ? "Waterline ahead · turn or move sideways" : energy < 12 ? "Normal movement continues · release Shift to recover" : gripBurst ? "Exertion drains energy" : moving ? "Hold Shift for a short grip burst" : energy < 99 ? "Resting restores energy quickly" : "Movement always available";
          setHud({ energy, alert, buds: Math.min(collected.current.size, 5), objective: collected.current.size >= 5 ? "Reach the stone sanctuary gate" : "Follow the old bridle trail", prompt, heading: directions[Math.round(head / (Math.PI / 4)) % 8], motion, hint, x: player.x, z: player.z });
        }
      } else world.animate(gameTime, player, scentRef.current, collected.current);
      if (composer) composer.render(); else renderer.render(scene, camera);
    }
    frame();
    return () => {
      disposed = true; cancelAnimationFrame(raf); renderer.domElement.removeEventListener("pointerdown", pointer); renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerup", pointerUp);
      document.removeEventListener("mousemove", mouse); document.removeEventListener("keydown", keyDown); document.removeEventListener("keyup", keyUp); document.removeEventListener("pointerlockchange", pointerLockChanged); window.removeEventListener("blur", pauseOnFocusLoss); removeEventListener("resize", resize);
      timer.dispose(); composer?.dispose(); renderer.dispose(); if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, []);

  const audioRef = useRef<ReturnType<typeof startAudio> | null>(null);
  const safeLock = () => { if (new URLSearchParams(location.search).has("qa")) return; mount.current?.querySelector("canvas")?.requestPointerLock()?.catch(() => undefined); };
  const begin = useCallback(() => {
    if (!ready || exiting) return; if (!audioRef.current) audioRef.current = startAudio(); setExiting(true); safeLock();
    window.setTimeout(() => { setPhase("playing"); setExiting(false); }, 850);
  }, [ready, exiting]);
  const resume = () => { setPhase("playing"); safeLock(); };
  useEffect(() => { if (audioRef.current) audioRef.current.master.gain.value = muted ? 0 : .13; }, [muted]);
  useEffect(() => () => { if (audioRef.current) { clearInterval(audioRef.current.interval); audioRef.current.context.close().catch(() => undefined); audioRef.current = null; } }, []);
  const mobileKey = (code: string, down: boolean) => document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));

  return <main className="game-shell" data-game-state={phase} data-motion={hud.motion} data-energy={Math.round(hud.energy)} data-position={`${hud.x.toFixed(2)},${hud.z.toFixed(2)}`}>
    <div ref={mount} className="viewport" aria-label="3D game viewport" />
    <div className="world-grade"/><div className="world-vignette"/><div className="grain"/>
    {phase !== "intro" && <div className="hud" aria-live="polite">
      <section className="mission"><div className="eyebrow">Current objective</div><h2>{hud.objective}</h2><p>{hud.buds} / 5 tender buds foraged</p></section>
      <div className="compass"><div className="eyebrow">The Ramble · 6:42 PM</div><div className="compass-line"><span>W</span><span className="active">{hud.heading}</span><span>E</span></div></div>
      <div className="status"><div className="eyebrow">Canopy cover</div><strong>{Math.max(0, 100 - Math.round(hud.alert))}%</strong></div>
      <div className="meters"><div className={`motion-state ${hud.motion === "PATH BLOCKED" || hud.motion === "WINDED" ? "warning" : ""}`}><span>{hud.motion}</span><small>{hud.hint}</small></div><div className="meter-row"><span>Energy</span><div className="meter-track"><div className="meter-fill" style={{ width: `${hud.energy}%` }}/></div><span>{Math.round(hud.energy)}</span></div><div className="meter-row"><span>Threat</span><div className="meter-track"><div className="meter-fill alert" style={{ width: `${hud.alert}%` }}/></div><span>{Math.round(hud.alert)}</span></div></div>
      <div className="crosshair"/>{hud.prompt && <div className="interaction"><span className="key">E</span>{hud.prompt}</div>}
      <div className="controls-strip"><span>WASD Move</span><span>Shift Grip</span><span>C Scent</span><span>M {muted ? "Unmute" : "Mute"}</span></div>
      <div className={`scent-overlay ${scent ? "on" : ""}`}/>{toast && <div className="toast">{toast}</div>}
    </div>}
    {phase === "intro" && <section className={`screen intro-screen ${exiting ? "exiting" : ""}`}>
      <Image className="intro-art" src="/game/splash.webp" alt="" aria-hidden="true" fill priority sizes="100vw" unoptimized/>
      <div className="intro-scrim"/><div className="intro-location">THE RAMBLE · CENTRAL PARK · 6:42 PM</div>
      <div className="intro-ui"><h1 className="sr-only">SLOTH / PARK</h1><div className="mobile-wordmark" aria-hidden="true">SLOTH <i>/</i> PARK</div>
        <p>A storm broke the route home. Cross Manhattan’s wild heart beneath the canopy and reach sanctuary before the last light leaves the park.</p>
        <button className="cinematic-cta" onClick={begin} disabled={!ready}>{ready ? "ENTER THE RAMBLE" : "PREPARING THE PARK"}<b>→</b><span/></button>
        <small>Headphones recommended · Mouse + keyboard</small>
      </div>
    </section>}
    {phase === "paused" && <section className="screen"><div className="pause-card"><div className="eyebrow">Field session paused</div><h2>Listen to the park.</h2><p>Your progress is safe. The hawk will keep circling, but the canopy is patient.</p><div className="actions"><button className="primary" onClick={resume}>Return to trail <b>→</b></button><button className="secondary" onClick={() => setMuted(value => !value)}>{muted ? "Enable sound" : "Mute sound"}</button></div></div></section>}
    {phase === "complete" && <section className="screen"><div className="pause-card"><div className="eyebrow">Sanctuary reached</div><h2>You made the impossible crossing.</h2><p>Five buds, one old trail, and a city’s wildest mile. The wildlife team finds your trail at first light.</p><div className="actions"><button className="primary" onClick={() => location.reload()}>Begin again <b>↻</b></button></div></div></section>}
    {phase === "playing" && <div className="mobile-controls"><button aria-label="Move forward" className="move" onPointerDown={() => mobileKey("KeyW", true)} onPointerUp={() => mobileKey("KeyW", false)} onPointerCancel={() => mobileKey("KeyW", false)}>Move</button><button aria-label="Grip burst" className="grip" onPointerDown={() => mobileKey("ShiftLeft", true)} onPointerUp={() => mobileKey("ShiftLeft", false)} onPointerCancel={() => mobileKey("ShiftLeft", false)}>Grip</button><button aria-label="Toggle scent vision" className="sense" onClick={() => mobileKey("KeyC", true)}>Sense</button></div>}
  </main>;
}
