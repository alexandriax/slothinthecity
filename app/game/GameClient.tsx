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
import { buildRealisticWorld, GOAL, START, terrainY, type ClimbableTree } from "./world/RealisticWorld";

type Phase = "intro" | "playing" | "paused" | "complete";
type MotionState = "READY" | "TRAVERSING" | "SEEKING TRUNK" | "GRIPPING" | "CLIMBING" | "CANOPY REACH" | "RECOVERING" | "WINDED" | "PATH BLOCKED";
type HudState = { energy: number; alert: number; buds: number; objective: string; prompt: string; promptKey: string; heading: string; motion: MotionState; hint: string; x: number; y: number; z: number };

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

function renderPixelRatio(tier: number) {
  const pixelBudget = tier > .85 ? 2_250_000 : 1_250_000;
  const budgetRatio = Math.sqrt(pixelBudget / Math.max(1, innerWidth * innerHeight));
  return Math.max(.72, Math.min(devicePixelRatio, tier > .85 ? 1.5 : 1.1, budgetRatio));
}

export function GameClient() {
  const mount = useRef<HTMLDivElement>(null), phaseRef = useRef<Phase>("intro"), collected = useRef(new Set<number>()), scentRef = useRef(false);
  const [phase, setPhaseState] = useState<Phase>("intro"), [ready, setReady] = useState(false), [exiting, setExiting] = useState(false);
  const [muted, setMuted] = useState(false), [scent, setScent] = useState(false), [toast, setToast] = useState("");
  const [hud, setHud] = useState<HudState>({ energy: 100, alert: 6, buds: 0, objective: "Follow the old bridle trail", prompt: "", promptKey: "", heading: "N", motion: "READY", hint: "Shift grips a nearby trunk · climb with W / S", x: START.x, y: 0, z: START.z });
  const setPhase = (next: Phase) => { phaseRef.current = next; setPhaseState(next); };

  useEffect(() => {
    if (!mount.current) return;
    const host = mount.current, tier = qualityTier(); let disposed = false;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#8e9a89"); scene.fog = new THREE.FogExp2("#999e89", .0048);
    const camera = new THREE.PerspectiveCamera(64, innerWidth / innerHeight, .08, 500); camera.rotation.order = "YXZ";
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: false });
    renderer.setPixelRatio(renderPixelRatio(tier)); renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .96; renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const textures = loadGameTextures(renderer, () => { if (!disposed) setReady(true); });
    const world = buildRealisticWorld(scene, textures, tier);
    const hemisphere = new THREE.HemisphereLight("#dce3d2", "#3b3329", .62); scene.add(hemisphere);
    const sun = new THREE.DirectionalLight("#ffd49a", 2.65); sun.position.set(-35, 68, 25); sun.castShadow = true;
    sun.shadow.mapSize.set(tier > .85 ? 2048 : 1024, tier > .85 ? 2048 : 1024); sun.shadow.camera.left = sun.shadow.camera.bottom = -42; sun.shadow.camera.right = sun.shadow.camera.top = 42;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 150; sun.shadow.normalBias = .035; sun.shadow.bias = -.00008; scene.add(sun, sun.target);

    let composer: EffectComposer | null = null;
    if (tier > .85 && innerWidth * innerHeight < 1_750_000) {
      composer = new EffectComposer(renderer); composer.addPass(new RenderPass(scene, camera));
      const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight); gtao.blendIntensity = .58; composer.addPass(gtao); composer.addPass(new OutputPass());
    }

    const timer = new THREE.Timer(); timer.connect(document);
    const keys = new Set<string>(), velocity = new THREE.Vector3(), player = START.clone();
    const qaInput = location.hostname === "localhost" ? new URLSearchParams(location.search).get("qa") : null;
    if (qaInput === "autowalk") keys.add("KeyW");
    player.y = terrainY(player.x, player.z) + 1.48; camera.position.copy(player);
    const sloth = createSlothRig(textures.fur);
    const layoutSloth = () => {
      const portrait = innerWidth < 760;
      sloth.root.scale.setScalar(portrait ? .54 : .78);
      sloth.left.position.x = portrait ? -.27 : -.38; sloth.right.position.x = portrait ? .27 : .38;
      sloth.left.position.y = sloth.right.position.y = portrait ? -.76 : -.8;
    };
    layoutSloth(); camera.add(sloth.root); scene.add(camera);
    let yaw = -.35, pitch = -.04, energy = 100, alert = 5, lastHud = 0, gameTime = 0, dragging = false, lastTouchX = 0, lastTouchY = 0;
    let blockedBy: "" | "WATER" | "TREE" = "", climbingTree: ClimbableTree | null = null, climbAngle = 0, climbHeight = 1.48;
    let gripRequested = false, transferRequested = false, gripHintUntil = 0, dropVelocity = 0, qaPrepared = false;
    let transfer: { from: THREE.Vector3; to: THREE.Vector3; tree: ClimbableTree; started: number; duration: number } | null = null;

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
    const keyDown = (event: KeyboardEvent) => {
      keys.add(event.code);
      if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) gripRequested = true;
      if (event.code === "Space" && !event.repeat) transferRequested = true;
      if (event.code === "Escape" && phaseRef.current === "playing") setPhase("paused");
      if (event.code === "KeyC") { scentRef.current = !scentRef.current; setScent(scentRef.current); }
      if (event.code === "KeyM") setMuted(value => !value);
      if (event.code === "KeyE") collectNearby();
    };
    const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const pauseOnFocusLoss = () => { keys.clear(); velocity.set(0, 0, 0); if (phaseRef.current === "playing" && !new URLSearchParams(location.search).has("qa")) setPhase("paused"); };
    const pointerLockChanged = () => { if (document.pointerLockElement !== renderer.domElement) pauseOnFocusLoss(); };
    renderer.domElement.addEventListener("pointerdown", pointer); renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerup", pointerUp);
    document.addEventListener("mousemove", mouse); document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp);
    document.addEventListener("pointerlockchange", pointerLockChanged); window.addEventListener("blur", pauseOnFocusLoss);
    const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(renderPixelRatio(tier)); renderer.setSize(innerWidth, innerHeight); composer?.setSize(innerWidth, innerHeight); layoutSloth(); };
    addEventListener("resize", resize);

    let raf = 0;
    function nearestTree(position: THREE.Vector3, maxSurfaceDistance = Infinity, excluded?: ClimbableTree) {
      let result: ClimbableTree | null = null, best = maxSurfaceDistance;
      for (const tree of world.trees) {
        if (tree === excluded) continue;
        const surfaceDistance = Math.hypot(position.x - tree.x, position.z - tree.z) - tree.radius - .55;
        if (surfaceDistance < best) { best = surfaceDistance; result = tree; }
      }
      return result;
    }
    function canopyTargetFor(tree: ClimbableTree) {
      let target: ClimbableTree | null = null, best = 13.5;
      for (const candidate of world.trees) {
        if (candidate === tree || Math.abs(candidate.canopyY - player.y) > 5.5) continue;
        const distance = Math.hypot(candidate.x - tree.x, candidate.z - tree.z);
        if (distance > 4.5 && distance < best) { best = distance; target = candidate; }
      }
      return target;
    }
    function resolveGroundCollisions(moving: boolean) {
      blockedBy = "";
      const lakeX = player.x - 34, lakeZ = player.z + 43, lakeDistance = Math.hypot(lakeX, lakeZ), shoreline = 25.55;
      if (lakeDistance < shoreline) {
        const nx = lakeX / Math.max(lakeDistance, .001), nz = lakeZ / Math.max(lakeDistance, .001);
        player.x = 34 + nx * shoreline; player.z = -43 + nz * shoreline;
        const inward = velocity.x * nx + velocity.z * nz;
        if (inward < 0) { velocity.x -= inward * nx; velocity.z -= inward * nz; blockedBy = moving ? "WATER" : ""; }
      }
      for (const tree of world.trees) {
        const dx = player.x - tree.x, dz = player.z - tree.z, distance = Math.hypot(dx, dz), clearance = tree.radius + .55;
        if (distance >= clearance) continue;
        const nx = dx / Math.max(distance, .001), nz = dz / Math.max(distance, .001);
        player.x = tree.x + nx * clearance; player.z = tree.z + nz * clearance;
        const inward = velocity.x * nx + velocity.z * nz;
        if (inward < 0) { velocity.x -= inward * nx; velocity.z -= inward * nz; blockedBy = moving ? "TREE" : blockedBy; }
      }
      const clampedX = THREE.MathUtils.clamp(player.x, -111.5, 111.5), clampedZ = THREE.MathUtils.clamp(player.z, -111.5, 111.5);
      if (clampedX !== player.x || clampedZ !== player.z) { blockedBy = moving ? "TREE" : blockedBy; player.x = clampedX; player.z = clampedZ; velocity.multiplyScalar(.35); }
    }
    function frame(timestamp?: number) {
      raf = requestAnimationFrame(frame); timer.update(timestamp); const delta = Math.min(timer.getDelta(), .05); gameTime += delta;
      if (phaseRef.current === "playing") {
        if (!qaPrepared && (qaInput === "autoclimb" || qaInput === "treecollision" || qaInput === "watercollision")) {
          const testTree = nearestTree(player);
          if (qaInput === "watercollision") {
            player.set(34, terrainY(34, -15) + 1.48, -15); yaw = 0; keys.add("KeyW"); qaPrepared = true;
          } else if (testTree) {
            player.set(testTree.x + testTree.radius + (qaInput === "autoclimb" ? .72 : 1.35), testTree.baseY + 1.48, testTree.z);
            keys.add("KeyW"); yaw = Math.PI / 2; gripRequested = qaInput === "autoclimb"; qaPrepared = true;
          }
        }
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        const forwardHeld = keys.has("KeyW") || keys.has("ArrowUp"), backHeld = keys.has("KeyS") || keys.has("ArrowDown"), leftHeld = keys.has("KeyA") || keys.has("ArrowLeft"), rightHeld = keys.has("KeyD") || keys.has("ArrowRight");
        let moving = false, canopyTarget: ClimbableTree | null = null, traversalSpeed = 0;

        if (gripRequested) {
          if (climbingTree) {
            climbingTree = null; transfer = null; dropVelocity = player.y > terrainY(player.x, player.z) + 1.65 ? -.35 : 0;
          } else {
            const grippable = nearestTree(player, 1.35);
            if (grippable) {
              climbingTree = grippable; climbAngle = Math.atan2(player.z - grippable.z, player.x - grippable.x);
              climbHeight = THREE.MathUtils.clamp(player.y - grippable.baseY, 1.48, grippable.height - .65); velocity.set(0, 0, 0); dropVelocity = 0;
            } else gripHintUntil = gameTime + 2.2;
          }
          gripRequested = false;
        }

        if (transfer) {
          const progress = THREE.MathUtils.clamp((gameTime - transfer.started) / transfer.duration, 0, 1), eased = progress * progress * (3 - 2 * progress);
          player.lerpVectors(transfer.from, transfer.to, eased); player.y += Math.sin(progress * Math.PI) * .72; moving = true; traversalSpeed = 2.4;
          energy = Math.max(0, energy - 3.4 * delta);
          if (progress >= 1) {
            climbingTree = transfer.tree; climbAngle = Math.atan2(player.z - climbingTree.z, player.x - climbingTree.x); climbHeight = player.y - climbingTree.baseY; transfer = null;
          }
        } else if (climbingTree) {
          const climbInput = (forwardHeld ? 1 : 0) - (backHeld ? 1 : 0), orbitInput = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
          const climbSpeed = THREE.MathUtils.lerp(.72, 1.48, energy / 100);
          climbHeight = THREE.MathUtils.clamp(climbHeight + climbInput * climbSpeed * delta, 1.48, climbingTree.height - .65);
          climbAngle += orbitInput * .72 * delta; moving = climbInput !== 0 || orbitInput !== 0; traversalSpeed = moving ? climbSpeed : 0;
          const gripRadius = climbingTree.radius + .56;
          player.set(climbingTree.x + Math.cos(climbAngle) * gripRadius, climbingTree.baseY + climbHeight, climbingTree.z + Math.sin(climbAngle) * gripRadius);
          const inCanopy = player.y >= climbingTree.canopyY - .8; canopyTarget = inCanopy ? canopyTargetFor(climbingTree) : null;
          if (transferRequested && canopyTarget) {
            const arrivalAngle = Math.atan2(climbingTree.z - canopyTarget.z, climbingTree.x - canopyTarget.x), arrivalRadius = canopyTarget.radius + .58;
            const destination = new THREE.Vector3(canopyTarget.x + Math.cos(arrivalAngle) * arrivalRadius, canopyTarget.canopyY, canopyTarget.z + Math.sin(arrivalAngle) * arrivalRadius);
            transfer = { from: player.clone(), to: destination, tree: canopyTarget, started: gameTime, duration: 1.65 };
          }
          energy = Math.max(0, energy - (moving ? 3.25 : .72) * delta);
        } else {
          const groundY = terrainY(player.x, player.z) + 1.48;
          if (dropVelocity !== 0 || player.y > groundY + .04) {
            dropVelocity -= 6.2 * delta; player.y += dropVelocity * delta; velocity.multiplyScalar(.9);
            if (player.y <= groundY) { player.y = groundY; dropVelocity = 0; }
          } else {
            if (forwardHeld) wish.add(forward); if (backHeld) wish.sub(forward); if (rightHeld) wish.add(right); if (leftHeld) wish.sub(right);
            moving = wish.lengthSq() > 0; const walkingSpeed = THREE.MathUtils.lerp(2.25, 3.05, energy / 100);
            if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(walkingSpeed), 1 - Math.exp(-delta * (moving ? 8 : 5)));
            player.addScaledVector(velocity, delta); resolveGroundCollisions(moving);
            player.y = terrainY(player.x, player.z) + 1.48 + Math.sin(gameTime * 5.5) * Math.min(.025, velocity.length() * .006); traversalSpeed = velocity.length();
            energy = Math.min(100, energy + (moving ? 2.4 : 8.5) * delta);
          }
        }
        transferRequested = false; camera.position.copy(player); camera.rotation.set(pitch, yaw, 0);
        const shadeTree = nearestTree(player), shadeDistance = shadeTree ? Math.max(0, Math.hypot(player.x - shadeTree.x, player.z - shadeTree.z) - shadeTree.radius) : 18;
        const exposed = Math.min(1, shadeDistance / 13); alert = Math.max(2, Math.min(100, alert + (exposed * 4.4 - (1 - exposed) * 5.5) * delta));
        sloth.animate(gameTime, traversalSpeed, Boolean(climbingTree || transfer)); world.animate(gameTime, player, scentRef.current, collected.current);
        sun.position.set(player.x - 35, player.y + 68, player.z + 25); sun.target.position.set(player.x, player.y, player.z - 8); sun.target.updateMatrixWorld();
        if (collected.current.size >= 5 && player.distanceTo(GOAL) < 7) { setPhase("complete"); document.exitPointerLock(); }
        if (gameTime - lastHud > .12) {
          lastHud = gameTime; let prompt = "", promptKey = "";
          world.buds.forEach(bud => { if (bud.visible && bud.position.distanceTo(player) < 3.2) { prompt = "FORAGE TENDER BUD"; promptKey = "E"; } });
          const nearbyTree = climbingTree ? null : nearestTree(player, 1.35);
          if (!prompt && nearbyTree) { prompt = "GRIP TRUNK"; promptKey = "SHIFT"; }
          if (climbingTree) { prompt = canopyTarget ? "REACH TO NEXT CANOPY" : "W / S CLIMB · A / D ORBIT · SHIFT RELEASE"; promptKey = canopyTarget ? "SPACE" : ""; }
          const head = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), directions = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
          const motion: MotionState = transfer ? "CANOPY REACH" : climbingTree ? (moving ? (energy < 10 ? "WINDED" : "CLIMBING") : "GRIPPING") : blockedBy ? "PATH BLOCKED" : gameTime < gripHintUntil ? "SEEKING TRUNK" : moving ? "TRAVERSING" : energy < 99 ? "RECOVERING" : "READY";
          const hint = transfer ? "Crossing branch to branch" : climbingTree ? (energy < 10 ? "Grip holds · climbing slows until you rest" : "W / S climb · A / D orbit · Shift releases") : blockedBy === "WATER" ? "Water begins here · move sideways along the shore" : blockedBy === "TREE" ? "Solid trunk · Shift to grip and climb" : gameTime < gripHintUntil ? "Move within arm’s reach of a trunk, then press Shift" : energy < 99 ? "Ground movement restores grip energy" : "Shift grips a nearby trunk · Space reaches between canopies";
          setHud({ energy, alert, buds: Math.min(collected.current.size, 5), objective: collected.current.size >= 5 ? "Reach the stone sanctuary gate" : "Forage five buds across trail and canopy", prompt, promptKey, heading: directions[Math.round(head / (Math.PI / 4)) % 8], motion, hint, x: player.x, y: player.y, z: player.z });
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
    window.setTimeout(() => {
      setPhase("playing"); setExiting(false); setToast("Claw grip: approach a trunk and press Shift · W / S climbs · Space reaches across the canopy");
      window.setTimeout(() => setToast(""), 5200);
    }, 850);
  }, [ready, exiting]);
  const resume = () => { setPhase("playing"); safeLock(); };
  useEffect(() => { if (audioRef.current) audioRef.current.master.gain.value = muted ? 0 : .13; }, [muted]);
  useEffect(() => () => { if (audioRef.current) { clearInterval(audioRef.current.interval); audioRef.current.context.close().catch(() => undefined); audioRef.current = null; } }, []);
  const mobileKey = (code: string, down: boolean) => document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));

  return <main className="game-shell" data-game-state={phase} data-motion={hud.motion} data-energy={Math.round(hud.energy)} data-position={`${hud.x.toFixed(2)},${hud.z.toFixed(2)}`} data-altitude={hud.y.toFixed(2)}>
    <div ref={mount} className="viewport" aria-label="3D game viewport" />
    <div className="world-grade"/><div className="world-vignette"/><div className="grain"/>
    {phase !== "intro" && <div className="hud" aria-live="polite">
      <section className="mission"><div className="eyebrow">Current objective</div><h2>{hud.objective}</h2><p>{hud.buds} / 5 tender buds foraged</p></section>
      <div className="compass"><div className="eyebrow">The Ramble · 6:42 PM</div><div className="compass-line"><span>W</span><span className="active">{hud.heading}</span><span>E</span></div></div>
      <div className="status"><div className="eyebrow">Canopy cover</div><strong>{Math.max(0, 100 - Math.round(hud.alert))}%</strong></div>
      <div className="meters"><div className={`motion-state ${hud.motion === "PATH BLOCKED" || hud.motion === "WINDED" ? "warning" : ""}`}><span>{hud.motion}</span><small>{hud.hint}</small></div><div className="meter-row"><span>Energy</span><div className="meter-track"><div className="meter-fill" style={{ width: `${hud.energy}%` }}/></div><span>{Math.round(hud.energy)}</span></div><div className="meter-row"><span>Threat</span><div className="meter-track"><div className="meter-fill alert" style={{ width: `${hud.alert}%` }}/></div><span>{Math.round(hud.alert)}</span></div></div>
      <div className="crosshair"/>{hud.prompt && <div className="interaction">{hud.promptKey && <span className="key">{hud.promptKey}</span>}{hud.prompt}</div>}
      <div className="controls-strip"><span>WASD Move / Climb</span><span>Shift Grip / Release</span><span>Space Canopy Reach</span><span>C Scent</span><span>M {muted ? "Unmute" : "Mute"}</span></div>
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
    {phase === "playing" && <div className="mobile-controls"><button aria-label="Move forward or climb" className="move" onPointerDown={() => mobileKey("KeyW", true)} onPointerUp={() => mobileKey("KeyW", false)} onPointerCancel={() => mobileKey("KeyW", false)}>Move</button><button aria-label="Grip or release tree" className="grip" onClick={() => { mobileKey("ShiftLeft", true); mobileKey("ShiftLeft", false); }}>Grip</button><button aria-label="Reach to next canopy" className="reach" onClick={() => { mobileKey("Space", true); mobileKey("Space", false); }}>Reach</button><button aria-label="Toggle scent vision" className="sense" onClick={() => mobileKey("KeyC", true)}>Sense</button></div>}
  </main>;
}
