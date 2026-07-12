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
import { buildRealisticWorld, GOAL, START, terrainY, type BranchRoute, type ClimbableTree } from "./world/RealisticWorld";

type Phase = "intro" | "playing" | "paused" | "complete";
type MotionState = "READY" | "TRAVERSING" | "SEEKING TRUNK" | "GRIPPING" | "CLIMBING" | "ON BRANCH" | "REACHING" | "DROPPING" | "CAUGHT" | "RECOVERING" | "WINDED" | "PATH BLOCKED";
type HudState = { energy: number; alert: number; buds: number; objective: string; prompt: string; promptKey: string; heading: string; motion: MotionState; hint: string; x: number; y: number; z: number; branchId: number; branchProgress: number; arboreal: boolean };

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
  const [hud, setHud] = useState<HudState>({ energy: 100, alert: 6, buds: 0, objective: "Follow the old bridle trail", prompt: "", promptKey: "", heading: "N", motion: "READY", hint: "Shift grips a nearby trunk · climb with W / S", x: START.x, y: 0, z: START.z, branchId: -1, branchProgress: 0, arboreal: false });
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
      sloth.left.position.x = portrait ? -.55 : -.94; sloth.right.position.x = portrait ? .55 : .94;
      sloth.left.position.y = sloth.right.position.y = portrait ? -.74 : -.86;
      sloth.left.rotation.z = portrait ? -.48 : -.74; sloth.right.rotation.z = portrait ? .48 : .74;
      sloth.left.userData.layoutZ = sloth.left.rotation.z; sloth.right.userData.layoutZ = sloth.right.rotation.z;
    };
    layoutSloth(); camera.add(sloth.root); scene.add(camera);
    let yaw = -.35, pitch = -.04, energy = 100, alert = 5, lastHud = 0, gameTime = 0, dragging = false, lastTouchX = 0, lastTouchY = 0;
    let blockedBy: "" | "WATER" | "TREE" | "LANDMARK" = "", climbingTree: ClimbableTree | null = null, climbAngle = 0, climbHeight = 1.48;
    let branchRoute: BranchRoute | null = null, branchProgress = 0, gripRequested = false, actionRequested = false, dropRequested = false, gripHintUntil = 0, dropVelocity = 0, qaPrepared = false, qaStage = 0, caughtUntil = 0;
    let transfer: { from: THREE.Vector3; to: THREE.Vector3; route: BranchRoute; progress: number; started: number; duration: number; kind: "REACH" | "DROP" } | null = null;

    const requestLock = () => { if (phaseRef.current !== "playing" || new URLSearchParams(location.search).has("qa")) return; renderer.domElement.requestPointerLock()?.catch(() => undefined); };
    const pointer = (event: PointerEvent) => { if (event.pointerType === "touch") { dragging = true; lastTouchX = event.clientX; lastTouchY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); } else requestLock(); };
    const pointerMove = (event: PointerEvent) => { if (dragging && event.pointerType === "touch") { yaw -= (event.clientX - lastTouchX) * .006; pitch = Math.max(-1.3, Math.min(1.2, pitch - (event.clientY - lastTouchY) * .005)); lastTouchX = event.clientX; lastTouchY = event.clientY; } };
    const pointerUp = () => { dragging = false; };
    const mouse = (event: MouseEvent) => { if (document.pointerLockElement === renderer.domElement && phaseRef.current === "playing") { yaw -= event.movementX * .0018; pitch = Math.max(-1.3, Math.min(1.2, pitch - event.movementY * .00155)); } };
    const collectNearby = () => {
      let collectedBud = false;
      world.buds.forEach((bud, index) => {
      if (!collected.current.has(index) && bud.visible && bud.position.distanceTo(camera.position) < 3.2) {
        collected.current.add(index); bud.visible = false; energy = Math.min(100, energy + 22); setToast(`Tender bud ${collected.current.size} of 5 — energy restored`);
        collectedBud = true; setTimeout(() => setToast(""), 2100); if (collected.current.size >= 5) setToast("Sanctuary scent acquired — head south");
      }
      });
      return collectedBud;
    };
    const keyDown = (event: KeyboardEvent) => {
      keys.add(event.code);
      if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && !event.repeat) gripRequested = true;
      if ((event.code === "Space" || event.code === "KeyE") && !event.repeat) actionRequested = true;
      if ((event.code === "ControlLeft" || event.code === "ControlRight" || event.code === "KeyQ") && !event.repeat) dropRequested = true;
      if (event.code === "Escape" && phaseRef.current === "playing") setPhase("paused");
      if (event.code === "KeyC") { scentRef.current = !scentRef.current; setScent(scentRef.current); }
      if (event.code === "KeyM") setMuted(value => !value);
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
    function branchPose(route: BranchRoute, amount: number, target = new THREE.Vector3()) {
      target.lerpVectors(route.start, route.end, THREE.MathUtils.clamp(amount, 0, 1)); target.y -= .72; return target;
    }
    function closestBranchPoint(route: BranchRoute, position: THREE.Vector3) {
      const direction = route.end.clone().sub(route.start), lengthSq = direction.lengthSq();
      const amount = THREE.MathUtils.clamp(position.clone().sub(route.start).dot(direction) / Math.max(lengthSq, .001), 0, 1);
      const point = branchPose(route, amount); return { amount, point, distance: point.distanceTo(position) };
    }
    function bestBranch(routeIds: number[], maxDistance: number) {
      const view = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
      let selected: { route: BranchRoute; amount: number; point: THREE.Vector3; score: number } | null = null;
      for (const id of routeIds) {
        const route = world.branches[id]; if (!route || route === branchRoute) continue;
        const closest = closestBranchPoint(route, player); if (closest.distance > maxDistance) continue;
        const direction = closest.point.clone().sub(player), facing = direction.lengthSq() < .01 ? 1 : direction.normalize().dot(view);
        const score = facing * 2.2 - closest.distance * .16;
        if (!selected || score > selected.score) selected = { route, amount: closest.amount, point: closest.point, score };
      }
      return selected;
    }
    function branchFromTree(tree: ClimbableTree) {
      const treeIndex = world.trees.indexOf(tree), routes = world.branches.filter((route) => route.treeIndex === treeIndex);
      return bestBranch(routes.map((route) => route.id), 4.8) ?? (routes[0] ? { route: routes[0], amount: .06, point: branchPose(routes[0], .06), score: 0 } : null);
    }
    function groundHeight(x: number, z: number) {
      const bridge = world.bridgeSurface, dx = x - bridge.x, dz = z - bridge.z, cosine = Math.cos(bridge.yaw), sine = Math.sin(bridge.yaw);
      const localX = cosine * dx - sine * dz, localZ = sine * dx + cosine * dz;
      if (Math.abs(localX) <= bridge.length / 2 && Math.abs(localZ) <= bridge.width / 2) {
        const amount = localX / bridge.length + .5; return bridge.y + Math.sin(Math.PI * amount) * bridge.archHeight + 1.48;
      }
      return terrainY(x, z) + 1.48;
    }
    function catchFallingBranch(previousY: number) {
      let caught: { route: BranchRoute; amount: number; height: number } | null = null;
      for (const route of world.branches) {
        const dx = route.end.x - route.start.x, dz = route.end.z - route.start.z, lengthSq = dx * dx + dz * dz;
        const amount = THREE.MathUtils.clamp(((player.x - route.start.x) * dx + (player.z - route.start.z) * dz) / Math.max(lengthSq, .001), 0, 1);
        const branchX = THREE.MathUtils.lerp(route.start.x, route.end.x, amount), branchZ = THREE.MathUtils.lerp(route.start.z, route.end.z, amount), branchY = THREE.MathUtils.lerp(route.start.y, route.end.y, amount) - .72;
        const horizontal = Math.hypot(player.x - branchX, player.z - branchZ);
        if (horizontal <= route.radius + .82 && previousY >= branchY && player.y <= branchY + .08 && (!caught || branchY > caught.height)) caught = { route, amount, height: branchY };
      }
      if (!caught) return false;
      branchRoute = caught.route; branchProgress = caught.amount; climbingTree = null; dropVelocity = 0; transfer = null; caughtUntil = gameTime + 1.4;
      branchPose(caught.route, caught.amount, player); return true;
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
      const footY = player.y - 1.48;
      for (const obstacle of world.obstacles) {
        if (footY < obstacle.minY - .25 || footY > obstacle.maxY + .3) continue;
        if (obstacle.kind === "circle") {
          const dx = player.x - obstacle.x, dz = player.z - obstacle.z, distance = Math.hypot(dx, dz), clearance = obstacle.radius + .48;
          if (distance >= clearance) continue;
          const nx = dx / Math.max(distance, .001), nz = dz / Math.max(distance, .001);
          player.x = obstacle.x + nx * clearance; player.z = obstacle.z + nz * clearance;
          const inward = velocity.x * nx + velocity.z * nz; if (inward < 0) { velocity.x -= inward * nx; velocity.z -= inward * nz; }
          blockedBy = moving ? "LANDMARK" : blockedBy;
        } else if (player.x > obstacle.minX - .48 && player.x < obstacle.maxX + .48 && player.z > obstacle.minZ - .48 && player.z < obstacle.maxZ + .48) {
          const distances = [Math.abs(player.x - (obstacle.minX - .48)), Math.abs(player.x - (obstacle.maxX + .48)), Math.abs(player.z - (obstacle.minZ - .48)), Math.abs(player.z - (obstacle.maxZ + .48))];
          const side = distances.indexOf(Math.min(...distances));
          if (side === 0) { player.x = obstacle.minX - .48; velocity.x = Math.min(0, velocity.x); }
          else if (side === 1) { player.x = obstacle.maxX + .48; velocity.x = Math.max(0, velocity.x); }
          else if (side === 2) { player.z = obstacle.minZ - .48; velocity.z = Math.min(0, velocity.z); }
          else { player.z = obstacle.maxZ + .48; velocity.z = Math.max(0, velocity.z); }
          blockedBy = moving ? "LANDMARK" : blockedBy;
        }
      }
      const clampedX = THREE.MathUtils.clamp(player.x, -111.5, 111.5), clampedZ = THREE.MathUtils.clamp(player.z, -111.5, 111.5);
      if (clampedX !== player.x || clampedZ !== player.z) { blockedBy = moving ? "TREE" : blockedBy; player.x = clampedX; player.z = clampedZ; velocity.multiplyScalar(.35); }
    }
    function frame(timestamp?: number) {
      raf = requestAnimationFrame(frame); timer.update(timestamp); const delta = Math.min(timer.getDelta(), .05); gameTime += delta;
      if (phaseRef.current === "playing") {
        if (!qaPrepared && (["autoclimb", "autobranch", "autotransfer", "autodrop", "treecollision", "watercollision", "bridgewalk"].includes(qaInput ?? ""))) {
          const testTree = nearestTree(player);
          if (qaInput === "autodrop") {
            const dropRoute = world.branches.find((route) => route.belowRouteIds.length > 0);
            if (dropRoute) { branchRoute = dropRoute; branchProgress = .5; branchPose(dropRoute, branchProgress, player); qaPrepared = true; qaStage = 1; }
          } else if (qaInput === "bridgewalk") {
            const bridge = world.bridgeSurface, cosine = Math.cos(bridge.yaw), sine = Math.sin(bridge.yaw), localX = -bridge.length / 2 + .65;
            player.set(bridge.x + cosine * localX, bridge.y + 1.48, bridge.z - sine * localX); yaw = bridge.yaw - Math.PI / 2; keys.add("KeyW"); qaPrepared = true;
          } else if (qaInput === "watercollision") {
            player.set(34, terrainY(34, -15) + 1.48, -15); yaw = 0; keys.add("KeyW"); qaPrepared = true;
          } else if (testTree) {
            const climbTest = ["autoclimb", "autobranch", "autotransfer"].includes(qaInput ?? "");
            player.set(testTree.x + testTree.radius + (climbTest ? .72 : 1.35), testTree.baseY + 1.48, testTree.z);
            keys.add("KeyW"); yaw = Math.PI / 2; gripRequested = climbTest; qaPrepared = true;
          }
        }
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        const forwardHeld = keys.has("KeyW") || keys.has("ArrowUp"), backHeld = keys.has("KeyS") || keys.has("ArrowDown"), leftHeld = keys.has("KeyA") || keys.has("ArrowLeft"), rightHeld = keys.has("KeyD") || keys.has("ArrowRight");
        let moving = false, branchTarget: { route: BranchRoute; amount: number; point: THREE.Vector3; score: number } | null = null, lowerTarget: { route: BranchRoute; amount: number; point: THREE.Vector3; score: number } | null = null, traversalSpeed = 0;

        if (actionRequested && collectNearby()) actionRequested = false;

        if (gripRequested) {
          if (branchRoute) {
            branchRoute = null; transfer = null; dropVelocity = -.35;
          } else if (climbingTree) {
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
          player.lerpVectors(transfer.from, transfer.to, eased); player.y += Math.sin(progress * Math.PI) * (transfer.kind === "REACH" ? .48 : -.18); moving = true; traversalSpeed = 2.1;
          energy = Math.max(0, energy - (transfer.kind === "REACH" ? 2.8 : 1.2) * delta);
          if (progress >= 1) {
            branchRoute = transfer.route; branchProgress = transfer.progress; climbingTree = null; branchPose(branchRoute, branchProgress, player); transfer = null;
          }
        } else if (climbingTree) {
          const climbInput = (forwardHeld ? 1 : 0) - (backHeld ? 1 : 0), orbitInput = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
          const climbSpeed = THREE.MathUtils.lerp(.72, 1.48, energy / 100);
          climbHeight = THREE.MathUtils.clamp(climbHeight + climbInput * climbSpeed * delta, 1.48, climbingTree.height - .65);
          climbAngle += orbitInput * .72 * delta; moving = climbInput !== 0 || orbitInput !== 0; traversalSpeed = moving ? climbSpeed : 0;
          const gripRadius = climbingTree.radius + .56;
          player.set(climbingTree.x + Math.cos(climbAngle) * gripRadius, climbingTree.baseY + climbHeight, climbingTree.z + Math.sin(climbAngle) * gripRadius);
          const inCanopy = player.y >= climbingTree.canopyY - .8; branchTarget = inCanopy ? branchFromTree(climbingTree) : null;
          if (["autobranch", "autotransfer", "autodrop"].includes(qaInput ?? "") && qaStage === 0 && branchTarget) { actionRequested = true; qaStage = 1; }
          if (actionRequested && branchTarget) transfer = { from: player.clone(), to: branchTarget.point.clone(), route: branchTarget.route, progress: branchTarget.amount, started: gameTime, duration: .82, kind: "REACH" };
          if (dropRequested) { climbingTree = null; dropVelocity = -.35; }
          energy = Math.max(0, energy - (moving ? 3.25 : .72) * delta);
        } else if (branchRoute) {
          if (qaInput === "autodrop" && qaStage === 1 && branchRoute.belowRouteIds.length === 0) {
            const dropRoute = world.branches.find((route) => route.belowRouteIds.length > 0);
            if (dropRoute) { branchRoute = dropRoute; branchProgress = .56; branchPose(branchRoute, branchProgress, player); }
          }
          const branchInput = (forwardHeld ? 1 : 0) - (backHeld ? 1 : 0), length = branchRoute.start.distanceTo(branchRoute.end), branchSpeed = THREE.MathUtils.lerp(.62, 1.14, energy / 100);
          branchProgress = THREE.MathUtils.clamp(branchProgress + branchInput * branchSpeed * delta / Math.max(length, .1), 0, 1);
          branchPose(branchRoute, branchProgress, player); moving = branchInput !== 0; traversalSpeed = moving ? branchSpeed : 0;
          const candidateIds = [...branchRoute.crossTreeRouteIds, ...(branchProgress < .25 ? branchRoute.adjacentRouteIds : [])];
          branchTarget = bestBranch(candidateIds, branchProgress < .25 ? 5.2 : 3.8);
          lowerTarget = bestBranch(branchRoute.belowRouteIds, 8.2);
          if (qaInput === "autotransfer" && qaStage === 1 && branchProgress > .72 && branchTarget) { actionRequested = true; qaStage = 2; }
          if (qaInput === "autodrop" && qaStage === 1 && branchProgress >= .48 && lowerTarget) { dropRequested = true; qaStage = 2; }
          if (actionRequested && branchTarget) transfer = { from: player.clone(), to: branchTarget.point.clone(), route: branchTarget.route, progress: branchTarget.amount, started: gameTime, duration: branchTarget.route.treeIndex === branchRoute.treeIndex ? .68 : 1.05, kind: "REACH" };
          if (dropRequested) {
            if (lowerTarget) transfer = { from: player.clone(), to: lowerTarget.point.clone(), route: lowerTarget.route, progress: lowerTarget.amount, started: gameTime, duration: .78, kind: "DROP" };
            else { branchRoute = null; dropVelocity = -.45; }
          } else if (branchProgress <= .001 && backHeld) {
            const tree = world.trees[branchRoute.treeIndex]; branchRoute = null; climbingTree = tree; climbHeight = THREE.MathUtils.clamp(player.y - tree.baseY, 1.48, tree.height - .65); climbAngle = Math.atan2(player.z - tree.z, player.x - tree.x);
          }
          energy = Math.max(0, energy - (moving ? 1.35 : .38) * delta);
        } else {
          const groundY = groundHeight(player.x, player.z);
          if (dropVelocity !== 0 || player.y > groundY + .04) {
            const previousY = player.y; dropVelocity -= 6.2 * delta; player.y += dropVelocity * delta; velocity.multiplyScalar(.9);
            if (!catchFallingBranch(previousY) && player.y <= groundY) { player.y = groundY; dropVelocity = 0; }
          } else {
            if (forwardHeld) wish.add(forward); if (backHeld) wish.sub(forward); if (rightHeld) wish.add(right); if (leftHeld) wish.sub(right);
            moving = wish.lengthSq() > 0; const walkingSpeed = THREE.MathUtils.lerp(2.25, 3.05, energy / 100);
            if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(walkingSpeed), 1 - Math.exp(-delta * (moving ? 8 : 5)));
            player.addScaledVector(velocity, delta); resolveGroundCollisions(moving);
            player.y = groundHeight(player.x, player.z) + Math.sin(gameTime * 5.5) * Math.min(.025, velocity.length() * .006); traversalSpeed = velocity.length();
            energy = Math.min(100, energy + (moving ? 2.4 : 8.5) * delta);
          }
        }
        actionRequested = false; dropRequested = false; camera.position.copy(player); camera.rotation.set(pitch, yaw, 0);
        const shadeTree = nearestTree(player), shadeDistance = shadeTree ? Math.max(0, Math.hypot(player.x - shadeTree.x, player.z - shadeTree.z) - shadeTree.radius) : 18;
        const exposed = Math.min(1, shadeDistance / 13); alert = Math.max(2, Math.min(100, alert + (exposed * 4.4 - (1 - exposed) * 5.5) * delta));
        sloth.animate(gameTime, traversalSpeed, Boolean(climbingTree || branchRoute || transfer)); world.animate(gameTime, player, scentRef.current, collected.current);
        sun.position.set(player.x - 35, player.y + 68, player.z + 25); sun.target.position.set(player.x, player.y, player.z - 8); sun.target.updateMatrixWorld();
        if (collected.current.size >= 5 && player.distanceTo(GOAL) < 7) { setPhase("complete"); document.exitPointerLock(); }
        if (gameTime - lastHud > .12) {
          lastHud = gameTime; let prompt = "", promptKey = "";
          world.buds.forEach(bud => { if (bud.visible && bud.position.distanceTo(player) < 3.2) { prompt = "FORAGE TENDER BUD"; promptKey = "E"; } });
          const nearbyTree = climbingTree || branchRoute ? null : nearestTree(player, 1.35);
          if (!prompt && nearbyTree) { prompt = "GRIP TRUNK"; promptKey = "SHIFT"; }
          if (climbingTree && !prompt) { prompt = branchTarget ? "STEP ONTO BRANCH" : "W / S CLIMB · A / D ORBIT · SHIFT RELEASE"; promptKey = branchTarget ? "E" : ""; }
          if (branchRoute && !prompt) {
            if (branchTarget) { prompt = branchTarget.route.treeIndex === branchRoute.treeIndex ? "TAKE THIS BRANCH" : "GRAB NEARBY TREE"; promptKey = "E"; }
            else if (lowerTarget) { prompt = "DROP TO LOWER BRANCH"; promptKey = "CTRL"; }
            else { prompt = "W / S MOVE ALONG BRANCH · CTRL DROP"; promptKey = ""; }
          }
          const head = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), directions = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
          const motion: MotionState = gameTime < caughtUntil ? "CAUGHT" : transfer ? (transfer.kind === "DROP" ? "DROPPING" : "REACHING") : branchRoute ? (energy < 10 ? "WINDED" : "ON BRANCH") : climbingTree ? (moving ? (energy < 10 ? "WINDED" : "CLIMBING") : "GRIPPING") : dropVelocity < 0 ? "DROPPING" : blockedBy ? "PATH BLOCKED" : gameTime < gripHintUntil ? "SEEKING TRUNK" : moving ? "TRAVERSING" : energy < 99 ? "RECOVERING" : "READY";
          const hint = gameTime < caughtUntil ? "Lower branch caught · grip secure" : transfer ? (transfer.kind === "DROP" ? "Dropping to a lower hold" : "Reaching hand-over-hand") : branchRoute ? "W / S crawl · E grabs a selected branch · Ctrl drops" : climbingTree ? (energy < 10 ? "Grip holds · climbing slows until you rest" : "W / S climb · E enters a branch · Shift releases") : blockedBy === "WATER" ? "Water begins here · move sideways along the shore" : blockedBy === "TREE" ? "Solid trunk · Shift to grip and climb" : blockedBy === "LANDMARK" ? "Solid bridge structure · use the deck or walk around" : gameTime < gripHintUntil ? "Move within arm’s reach of a trunk, then press Shift" : energy < 99 ? "Ground movement restores grip energy" : "Shift grips trunks · E grabs branches · Ctrl drops";
          setHud({ energy, alert, buds: Math.min(collected.current.size, 5), objective: collected.current.size >= 5 ? "Reach the stone sanctuary gate" : "Forage five buds across trail and canopy", prompt, promptKey, heading: directions[Math.round(head / (Math.PI / 4)) % 8], motion, hint, x: player.x, y: player.y, z: player.z, branchId: branchRoute?.id ?? -1, branchProgress, arboreal: Boolean(climbingTree || branchRoute || transfer || dropVelocity < 0) });
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
      setPhase("playing"); setExiting(false); setToast("Canopy route: Shift grips trunks · W / S moves · E grabs branches · Ctrl drops to a lower hold");
      window.setTimeout(() => setToast(""), 5200);
    }, 850);
  }, [ready, exiting]);
  const resume = () => { setPhase("playing"); safeLock(); };
  useEffect(() => { if (audioRef.current) audioRef.current.master.gain.value = muted ? 0 : .13; }, [muted]);
  useEffect(() => () => { if (audioRef.current) { clearInterval(audioRef.current.interval); audioRef.current.context.close().catch(() => undefined); audioRef.current = null; } }, []);
  const mobileKey = (code: string, down: boolean) => document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));

  return <main className="game-shell" data-game-state={phase} data-motion={hud.motion} data-energy={Math.round(hud.energy)} data-position={`${hud.x.toFixed(2)},${hud.z.toFixed(2)}`} data-altitude={hud.y.toFixed(2)} data-branch={hud.branchId} data-branch-progress={hud.branchProgress.toFixed(3)}>
    <div ref={mount} className="viewport" aria-label="3D game viewport" />
    <div className="world-grade"/><div className="world-vignette"/><div className="grain"/>
    {phase !== "intro" && <div className="hud" aria-live="polite">
      <section className="mission"><div className="eyebrow">Current objective</div><h2>{hud.objective}</h2><p>{hud.buds} / 5 tender buds foraged</p></section>
      <div className="compass"><div className="eyebrow">The Ramble · 6:42 PM</div><div className="compass-line"><span>W</span><span className="active">{hud.heading}</span><span>E</span></div></div>
      <div className="status"><div className="eyebrow">Canopy cover</div><strong>{Math.max(0, 100 - Math.round(hud.alert))}%</strong></div>
      <div className="meters"><div className={`motion-state ${hud.motion === "PATH BLOCKED" || hud.motion === "WINDED" ? "warning" : ""}`}><span>{hud.motion}</span><small>{hud.hint}</small></div><div className="meter-row"><span>Energy</span><div className="meter-track"><div className="meter-fill" style={{ width: `${hud.energy}%` }}/></div><span>{Math.round(hud.energy)}</span></div><div className="meter-row"><span>Threat</span><div className="meter-track"><div className="meter-fill alert" style={{ width: `${hud.alert}%` }}/></div><span>{Math.round(hud.alert)}</span></div></div>
      <div className="crosshair"/>{hud.prompt && <div className="interaction">{hud.promptKey && <span className="key">{hud.promptKey}</span>}{hud.prompt}</div>}
      <div className="controls-strip"><span>W / S Move / Climb</span><span>Shift Grip / Release</span><span>E Grab / Forage</span><span>Ctrl Drop</span><span>C Scent</span><span>M {muted ? "Unmute" : "Mute"}</span></div>
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
    {phase === "playing" && <div className="mobile-controls"><button aria-label="Move forward or climb" className="move" onPointerDown={() => mobileKey("KeyW", true)} onPointerUp={() => mobileKey("KeyW", false)} onPointerCancel={() => mobileKey("KeyW", false)}>Move</button><button aria-label="Grip or release tree" className="grip" onClick={() => { mobileKey("ShiftLeft", true); mobileKey("ShiftLeft", false); }}>Grip</button><button aria-label="Grab branch or forage" className="reach" onClick={() => { mobileKey("KeyE", true); mobileKey("KeyE", false); }}>{hud.prompt.includes("FORAGE") ? "Forage" : hud.prompt.includes("BRANCH") || hud.prompt.includes("TREE") ? "Grab" : "Action"}</button>{hud.arboreal && <button aria-label="Drop to a lower branch" className="down" onClick={() => { mobileKey("ControlLeft", true); mobileKey("ControlLeft", false); }}>Down</button>}<button aria-label="Toggle scent vision" className="sense" onClick={() => mobileKey("KeyC", true)}>Sense</button></div>}
  </main>;
}
