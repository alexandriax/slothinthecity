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
type MotionState = "ON GROUND" | "CLIMBING" | "ON BRANCH" | "REACHING" | "LOWERING" | "DESCENDING" | "CAUGHT" | "PATH BLOCKED";
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
  const [mouseCaptured, setMouseCaptured] = useState(false);
  const [pointerLockAvailable] = useState(() => typeof window !== "undefined" && matchMedia("(pointer: fine)").matches && !new URLSearchParams(location.search).has("qa"));
  const [hud, setHud] = useState<HudState>({ energy: 100, alert: 6, buds: 0, objective: "Follow the old bridle trail", prompt: "", promptKey: "", heading: "N", motion: "ON GROUND", hint: "E climbs a nearby trunk · W / S moves · Shift grips", x: START.x, y: 0, z: START.z, branchId: -1, branchProgress: 0, arboreal: false });
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
    const markerGeometry = new THREE.RingGeometry(.17, .25, 28);
    const actionMarkerMaterial = new THREE.MeshBasicMaterial({ color: "#d9ef8b", transparent: true, opacity: .92, side: THREE.DoubleSide, depthTest: false });
    const dropMarkerMaterial = new THREE.MeshBasicMaterial({ color: "#e6a85e", transparent: true, opacity: .78, side: THREE.DoubleSide, depthTest: false });
    const actionMarker = new THREE.Mesh(markerGeometry, actionMarkerMaterial), dropMarker = new THREE.Mesh(markerGeometry, dropMarkerMaterial);
    actionMarker.visible = dropMarker.visible = false; actionMarker.renderOrder = dropMarker.renderOrder = 100; scene.add(actionMarker, dropMarker);
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
    let branchRoute: BranchRoute | null = null, branchProgress = 0, actionRequested = false, dropRequested = false, gripHintUntil = 0, dropVelocity = 0, controlledDescent = false, descentIgnoreRouteId = -1, qaPrepared = false, qaStage = 0, caughtUntil = 0;
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
      if (event.code === "KeyP" && !event.repeat) {
        if (phaseRef.current === "playing") { setPhase("paused"); document.exitPointerLock(); }
        else if (phaseRef.current === "paused") { setPhase("playing"); requestLock(); }
        return;
      }
      keys.add(event.code);
      if (event.code === "KeyE" && !event.repeat) actionRequested = true;
      if ((event.code === "ControlLeft" || event.code === "ControlRight" || event.code === "Space" || event.code === "KeyQ") && !event.repeat) { event.preventDefault(); dropRequested = true; }
      if (event.code === "KeyC") { scentRef.current = !scentRef.current; setScent(scentRef.current); }
      if (event.code === "KeyM") setMuted(value => !value);
    };
    const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const releaseInput = () => { keys.clear(); velocity.set(0, 0, 0); };
    const pointerLockChanged = () => { const captured = document.pointerLockElement === renderer.domElement; setMouseCaptured(captured); if (!captured) releaseInput(); };
    renderer.domElement.addEventListener("pointerdown", pointer); renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerup", pointerUp);
    document.addEventListener("mousemove", mouse); document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp);
    document.addEventListener("pointerlockchange", pointerLockChanged); window.addEventListener("blur", releaseInput);
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
      const view = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)).normalize();
      let selected: { route: BranchRoute; amount: number; point: THREE.Vector3; score: number } | null = null;
      for (const route of routes) {
        // Offer a stable hold beyond the trunk collar. Route starts sit at the
        // trunk centre and made the old target ring fill the whole viewport.
        const amount = .24 + (route.id % 3) * .025, point = branchPose(route, amount);
        const direction = point.clone().sub(player), distance = direction.length();
        if (distance > 5.4) continue;
        const facing = distance < .01 ? 1 : direction.normalize().dot(view);
        const score = facing * 2.2 - distance * .16;
        if (!selected || score > selected.score) selected = { route, amount, point, score };
      }
      return selected ?? (routes[0] ? { route: routes[0], amount: .26, point: branchPose(routes[0], .26), score: 0 } : null);
    }
    function groundHeight(x: number, z: number) {
      const bridge = world.bridgeSurface, dx = x - bridge.x, dz = z - bridge.z, cosine = Math.cos(bridge.yaw), sine = Math.sin(bridge.yaw);
      const localX = cosine * dx - sine * dz, localZ = sine * dx + cosine * dz;
      if (Math.abs(localX) <= bridge.length / 2 && Math.abs(localZ) <= bridge.width / 2) {
        const amount = localX / bridge.length + .5; return bridge.y + Math.sin(Math.PI * amount) * bridge.archHeight + 1.48;
      }
      return terrainY(x, z) + 1.48;
    }
    function catchFallingBranch(previousY: number, excludedRouteId = -1) {
      let caught: { route: BranchRoute; amount: number; height: number } | null = null;
      for (const route of world.branches) {
        if (route.id === excludedRouteId) continue;
        const dx = route.end.x - route.start.x, dz = route.end.z - route.start.z, lengthSq = dx * dx + dz * dz;
        const amount = THREE.MathUtils.clamp(((player.x - route.start.x) * dx + (player.z - route.start.z) * dz) / Math.max(lengthSq, .001), 0, 1);
        const branchX = THREE.MathUtils.lerp(route.start.x, route.end.x, amount), branchZ = THREE.MathUtils.lerp(route.start.z, route.end.z, amount), branchY = THREE.MathUtils.lerp(route.start.y, route.end.y, amount) - .72;
        const horizontal = Math.hypot(player.x - branchX, player.z - branchZ);
        if (horizontal <= route.radius + .82 && previousY >= branchY && player.y <= branchY + .08 && (!caught || branchY > caught.height)) caught = { route, amount, height: branchY };
      }
      if (!caught) return false;
      branchRoute = caught.route; branchProgress = caught.amount; climbingTree = null; dropVelocity = 0; controlledDescent = false; descentIgnoreRouteId = -1; transfer = null; caughtUntil = gameTime + 1.4;
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
          } else if (qaInput === "autotransfer") {
            const transferRoute = world.branches.find((route) => route.crossTreeRouteIds.length > 0);
            if (transferRoute) { branchRoute = transferRoute; branchProgress = .62; branchPose(transferRoute, branchProgress, player); keys.add("KeyW"); qaPrepared = true; qaStage = 1; }
          } else if (qaInput === "bridgewalk") {
            const bridge = world.bridgeSurface, cosine = Math.cos(bridge.yaw), sine = Math.sin(bridge.yaw), localX = -bridge.length / 2 + .65;
            player.set(bridge.x + cosine * localX, bridge.y + 1.48, bridge.z - sine * localX); yaw = bridge.yaw - Math.PI / 2; keys.add("KeyW"); qaPrepared = true;
          } else if (qaInput === "watercollision") {
            player.set(34, terrainY(34, -15) + 1.48, -15); yaw = 0; keys.add("KeyW"); qaPrepared = true;
          } else if (testTree) {
            const climbTest = ["autoclimb", "autobranch", "autotransfer"].includes(qaInput ?? "");
            player.set(testTree.x + testTree.radius + (climbTest ? .72 : 1.35), testTree.baseY + 1.48, testTree.z);
            keys.add("KeyW"); yaw = Math.PI / 2;
            if (climbTest) {
              climbingTree = testTree;
              climbAngle = 0;
              climbHeight = 1.48;
            }
            qaPrepared = true;
          }
        }
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        const forwardHeld = keys.has("KeyW") || keys.has("ArrowUp"), backHeld = keys.has("KeyS") || keys.has("ArrowDown"), leftHeld = keys.has("KeyA") || keys.has("ArrowLeft"), rightHeld = keys.has("KeyD") || keys.has("ArrowRight");
        const gripping = keys.has("ShiftLeft") || keys.has("ShiftRight");
        let moving = false, groundTreeTarget: ClimbableTree | null = null, branchTarget: { route: BranchRoute; amount: number; point: THREE.Vector3; score: number } | null = null, lowerTarget: { route: BranchRoute; amount: number; point: THREE.Vector3; score: number } | null = null, traversalSpeed = 0;

        if (actionRequested && collectNearby()) actionRequested = false;

        if (actionRequested && !transfer && !climbingTree && !branchRoute && !controlledDescent && dropVelocity === 0) {
          groundTreeTarget = nearestTree(player, 1.35);
          if (groundTreeTarget) {
            climbingTree = groundTreeTarget; climbAngle = Math.atan2(player.z - groundTreeTarget.z, player.x - groundTreeTarget.x);
            climbHeight = THREE.MathUtils.clamp(player.y - groundTreeTarget.baseY, 1.48, groundTreeTarget.height - .65); velocity.set(0, 0, 0); dropVelocity = 0;
          } else gripHintUntil = gameTime + 2.2;
          actionRequested = false;
        }

        if (dropRequested && transfer) {
          descentIgnoreRouteId = branchRoute?.id ?? transfer.route.id; transfer = null; branchRoute = null; climbingTree = null;
          controlledDescent = true; dropVelocity = -.82;
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
          const climbSpeed = THREE.MathUtils.lerp(.72, 1.48, energy / 100) * (gripping ? .62 : 1);
          climbHeight = THREE.MathUtils.clamp(climbHeight + climbInput * climbSpeed * delta, 1.48, climbingTree.height - .65);
          const orbitDelta = orbitInput * .72 * delta;
          climbAngle += orbitDelta; yaw -= orbitDelta; moving = climbInput !== 0 || orbitInput !== 0; traversalSpeed = moving ? climbSpeed : 0;
          // Give the camera enough room to read the trunk, hands and branch
          // choices without clipping into a dark wall of bark.
          const gripRadius = climbingTree.radius + 1.18;
          player.set(climbingTree.x + Math.cos(climbAngle) * gripRadius, climbingTree.baseY + climbHeight, climbingTree.z + Math.sin(climbAngle) * gripRadius);
          const inCanopy = player.y >= climbingTree.canopyY - .8; branchTarget = inCanopy ? branchFromTree(climbingTree) : null;
          if (["autobranch", "autotransfer", "autodrop"].includes(qaInput ?? "") && qaStage === 0 && branchTarget) { actionRequested = true; qaStage = 1; }
          if (actionRequested && branchTarget) transfer = { from: player.clone(), to: branchTarget.point.clone(), route: branchTarget.route, progress: branchTarget.amount, started: gameTime, duration: .82, kind: "REACH" };
          if (dropRequested) { climbingTree = null; controlledDescent = true; descentIgnoreRouteId = -1; dropVelocity = -.82; }
          energy = Math.max(0, energy - (moving ? (gripping ? 2.2 : 3.25) : gripping ? .3 : .72) * delta);
        } else if (branchRoute) {
          if (qaInput === "autodrop" && qaStage === 1 && branchRoute.belowRouteIds.length === 0) {
            const dropRoute = world.branches.find((route) => route.belowRouteIds.length > 0);
            if (dropRoute) { branchRoute = dropRoute; branchProgress = .56; branchPose(branchRoute, branchProgress, player); }
          }
          const branchInput = (forwardHeld ? 1 : 0) - (backHeld ? 1 : 0), length = branchRoute.start.distanceTo(branchRoute.end), branchSpeed = THREE.MathUtils.lerp(.62, 1.14, energy / 100) * (gripping ? .58 : 1);
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
            else { descentIgnoreRouteId = branchRoute.id; branchRoute = null; controlledDescent = true; dropVelocity = -.82; }
          } else if (branchProgress <= .001 && backHeld) {
            const tree = world.trees[branchRoute.treeIndex]; branchRoute = null; climbingTree = tree; climbHeight = THREE.MathUtils.clamp(player.y - tree.baseY, 1.48, tree.height - .65); climbAngle = Math.atan2(player.z - tree.z, player.x - tree.x);
          }
          energy = Math.max(0, energy - (moving ? (gripping ? .92 : 1.35) : gripping ? .2 : .38) * delta);
        } else {
          const groundY = groundHeight(player.x, player.z);
          if (dropVelocity !== 0 || player.y > groundY + .04) {
            const previousY = player.y;
            if (controlledDescent) dropVelocity = gripping ? -.72 : -1.15;
            else dropVelocity -= 6.2 * delta;
            player.y += dropVelocity * delta; velocity.multiplyScalar(.9);
            if (!catchFallingBranch(previousY, controlledDescent ? descentIgnoreRouteId : -1) && player.y <= groundY) { player.y = groundY; dropVelocity = 0; controlledDescent = false; descentIgnoreRouteId = -1; }
          } else {
            if (forwardHeld) wish.add(forward); if (backHeld) wish.sub(forward); if (rightHeld) wish.add(right); if (leftHeld) wish.sub(right);
            moving = wish.lengthSq() > 0; const walkingSpeed = THREE.MathUtils.lerp(2.25, 3.05, energy / 100);
            if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(walkingSpeed), 1 - Math.exp(-delta * (moving ? 8 : 5)));
            player.addScaledVector(velocity, delta); resolveGroundCollisions(moving);
            player.y = groundHeight(player.x, player.z) + Math.sin(gameTime * 5.5) * Math.min(.025, velocity.length() * .006); traversalSpeed = velocity.length();
            energy = Math.min(100, energy + (moving ? 2.4 : 8.5) * delta);
            groundTreeTarget = nearestTree(player, 1.35);
          }
        }
        actionRequested = false; dropRequested = false; camera.position.copy(player); camera.rotation.set(pitch, yaw, 0);
        actionMarker.visible = false; dropMarker.visible = false;
        const pulse = 1 + Math.sin(gameTime * 4.2) * .09;
        if (branchTarget) { actionMarker.visible = true; actionMarker.position.copy(branchTarget.point); }
        else if (groundTreeTarget) {
          const outward = new THREE.Vector3(player.x - groundTreeTarget.x, 0, player.z - groundTreeTarget.z).normalize().multiplyScalar(groundTreeTarget.radius + .08);
          actionMarker.visible = true; actionMarker.position.set(groundTreeTarget.x + outward.x, groundTreeTarget.baseY + 2.15, groundTreeTarget.z + outward.z); actionMarker.scale.setScalar(1.35);
        }
        if (lowerTarget) { dropMarker.visible = true; dropMarker.position.copy(lowerTarget.point); }
        for (const marker of [actionMarker, dropMarker]) if (marker.visible) {
          marker.quaternion.copy(camera.quaternion);
          // World-space rings otherwise balloon when a grip point is close.
          // Scaling with distance keeps them a restrained, constant screen size.
          const distance = marker.position.distanceTo(camera.position);
          const angularScale = marker === actionMarker && groundTreeTarget && !branchTarget ? .075 : .06;
          marker.scale.setScalar(THREE.MathUtils.clamp(distance * angularScale * pulse, .018, .92));
        }
        const shadeTree = nearestTree(player), shadeDistance = shadeTree ? Math.max(0, Math.hypot(player.x - shadeTree.x, player.z - shadeTree.z) - shadeTree.radius) : 18;
        const exposed = Math.min(1, shadeDistance / 13); alert = Math.max(2, Math.min(100, alert + (exposed * 4.4 - (1 - exposed) * 5.5) * delta));
        sloth.animate(gameTime, traversalSpeed, Boolean(climbingTree || branchRoute || transfer)); world.animate(gameTime, player, scentRef.current, collected.current);
        sun.position.set(player.x - 35, player.y + 68, player.z + 25); sun.target.position.set(player.x, player.y, player.z - 8); sun.target.updateMatrixWorld();
        if (collected.current.size >= 5 && player.distanceTo(GOAL) < 7) { setPhase("complete"); document.exitPointerLock(); }
        if (gameTime - lastHud > .12) {
          lastHud = gameTime; let prompt = "", promptKey = "";
          world.buds.forEach(bud => { if (bud.visible && bud.position.distanceTo(player) < 3.2) { prompt = "FORAGE TENDER BUD"; promptKey = "E"; } });
          const nearbyTree = climbingTree || branchRoute || controlledDescent ? null : (groundTreeTarget ?? nearestTree(player, 1.35));
          if (!prompt && nearbyTree) { prompt = "CLIMB TRUNK"; promptKey = "E"; }
          if (climbingTree && !prompt) { prompt = branchTarget ? "STEP ONTO BRANCH" : "W / S CLIMB · SHIFT GRIP · CTRL DESCEND"; promptKey = branchTarget ? "E" : ""; }
          if (branchRoute && !prompt) {
            if (branchTarget) { prompt = branchTarget.route.treeIndex === branchRoute.treeIndex ? "TAKE THIS BRANCH" : "REACH ACROSS"; promptKey = "E"; }
            else if (lowerTarget) { prompt = "DROP TO LOWER BRANCH"; promptKey = "CTRL"; }
            else { prompt = "LOWER SAFELY TO GROUND"; promptKey = "CTRL"; }
          }
          if (controlledDescent && !prompt) { prompt = gripping ? "LOWERING WITH SECURE GRIP" : "HOLD SHIFT FOR A SLOWER DESCENT"; promptKey = gripping ? "" : "SHIFT"; }
          const head = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), directions = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
          const motion: MotionState = gameTime < caughtUntil ? "CAUGHT" : transfer ? (transfer.kind === "DROP" ? "LOWERING" : "REACHING") : branchRoute ? "ON BRANCH" : climbingTree ? "CLIMBING" : controlledDescent ? "DESCENDING" : blockedBy ? "PATH BLOCKED" : "ON GROUND";
          const hint = gameTime < caughtUntil ? "Lower branch caught · grip secure" : transfer ? (transfer.kind === "DROP" ? "Lowering to the highlighted branch" : "Reaching hand-over-hand") : branchRoute ? "W / S crawl · E takes the highlighted branch · Ctrl or Space descends" : climbingTree ? (energy < 10 ? "Hold Shift to rest your grip · Ctrl descends" : "W / S climb · E enters a branch · Ctrl descends") : controlledDescent ? "A safe descent is active · Shift slows the lowering motion" : blockedBy === "WATER" ? "Water begins here · move sideways along the shore" : blockedBy === "TREE" ? "Solid trunk · face its marker and press E to climb" : blockedBy === "LANDMARK" ? "Solid bridge structure · use the deck or walk around" : gameTime < gripHintUntil ? "Move within arm’s reach of a marked trunk, then press E" : energy < 99 ? "Ground movement restores grip energy" : "E climbs marked trunks · Shift grips · Ctrl or Space descends";
          setHud({ energy, alert, buds: Math.min(collected.current.size, 5), objective: collected.current.size >= 5 ? "Reach the stone sanctuary gate" : "Forage five buds across trail and canopy", prompt, promptKey, heading: directions[Math.round(head / (Math.PI / 4)) % 8], motion, hint, x: player.x, y: player.y, z: player.z, branchId: branchRoute?.id ?? -1, branchProgress, arboreal: Boolean(climbingTree || branchRoute || transfer || controlledDescent || dropVelocity < 0) });
        }
      } else world.animate(gameTime, player, scentRef.current, collected.current);
      if (composer) composer.render(); else renderer.render(scene, camera);
    }
    frame();
    return () => {
      disposed = true; cancelAnimationFrame(raf); renderer.domElement.removeEventListener("pointerdown", pointer); renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerup", pointerUp);
      document.removeEventListener("mousemove", mouse); document.removeEventListener("keydown", keyDown); document.removeEventListener("keyup", keyUp); document.removeEventListener("pointerlockchange", pointerLockChanged); window.removeEventListener("blur", releaseInput); removeEventListener("resize", resize);
      markerGeometry.dispose(); actionMarkerMaterial.dispose(); dropMarkerMaterial.dispose(); timer.dispose(); composer?.dispose(); renderer.dispose(); if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, []);

  const audioRef = useRef<ReturnType<typeof startAudio> | null>(null);
  const safeLock = () => { if (new URLSearchParams(location.search).has("qa")) return; mount.current?.querySelector("canvas")?.requestPointerLock()?.catch(() => undefined); };
  const begin = useCallback(() => {
    if (!ready || exiting) return; if (!audioRef.current) audioRef.current = startAudio(); setExiting(true); safeLock();
    window.setTimeout(() => {
      setPhase("playing"); setExiting(false); setToast("Canopy route: E climbs marked trunks · W / S moves · Shift grips · Ctrl or Space descends");
      window.setTimeout(() => setToast(""), 5200);
    }, 850);
  }, [ready, exiting]);
  const resume = () => { setPhase("playing"); safeLock(); };
  useEffect(() => { if (audioRef.current) audioRef.current.master.gain.value = muted ? 0 : .13; }, [muted]);
  useEffect(() => () => { if (audioRef.current) { clearInterval(audioRef.current.interval); audioRef.current.context.close().catch(() => undefined); audioRef.current = null; } }, []);
  const mobileKey = (code: string, down: boolean) => document.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
  const mobileAction = hud.prompt.includes("FORAGE") ? "Forage" : hud.prompt.includes("CLIMB") ? "Climb" : hud.prompt.includes("STEP") || hud.prompt.includes("TAKE") ? "Transfer" : hud.prompt.includes("REACH") ? "Reach" : "Action";

  return <main className="game-shell" data-game-state={phase} data-motion={hud.motion} data-energy={Math.round(hud.energy)} data-position={`${hud.x.toFixed(2)},${hud.z.toFixed(2)}`} data-altitude={hud.y.toFixed(2)} data-branch={hud.branchId} data-branch-progress={hud.branchProgress.toFixed(3)}>
    <div ref={mount} className="viewport" aria-label="3D game viewport" />
    <div className="world-grade"/><div className="world-vignette"/><div className="grain"/>
    {phase !== "intro" && <div className="hud" aria-live="polite">
      <section className="mission"><div className="eyebrow">Current objective</div><h2>{hud.objective}</h2><p>{hud.buds} / 5 tender buds foraged</p></section>
      <div className="compass"><div className="eyebrow">The Ramble · 6:42 PM</div><div className="compass-line"><span>W</span><span className="active">{hud.heading}</span><span>E</span></div></div>
      <div className="status"><div className="eyebrow">Canopy cover</div><strong>{Math.max(0, 100 - Math.round(hud.alert))}%</strong></div>
      <div className="meters"><div className={`motion-state ${hud.motion === "PATH BLOCKED" ? "warning" : ""}`}><span>{hud.motion}</span><small>{hud.hint}</small></div><div className="meter-row"><span>Energy</span><div className="meter-track"><div className="meter-fill" style={{ width: `${hud.energy}%` }}/></div><span>{Math.round(hud.energy)}</span></div><div className="meter-row"><span>Threat</span><div className="meter-track"><div className="meter-fill alert" style={{ width: `${hud.alert}%` }}/></div><span>{Math.round(hud.alert)}</span></div></div>
      <div className={`crosshair ${hud.promptKey === "E" ? "targeted" : hud.promptKey === "CTRL" ? "drop-targeted" : ""}`}/>{hud.prompt && <div className="interaction">{hud.promptKey && <span className="key">{hud.promptKey}</span>}{hud.prompt}</div>}
      <div className="controls-strip"><span>W / S Move / Climb</span><span>Shift Hold Grip</span><span>E Interact / Transfer</span><span>Ctrl / Space Descend</span><span>P Pause</span><span>C Scent</span><span>M {muted ? "Unmute" : "Mute"}</span></div>
      <div className={`scent-overlay ${scent ? "on" : ""}`}/>{toast && <div className="toast">{toast}</div>}
    </div>}
    {phase === "playing" && pointerLockAvailable && !mouseCaptured && <button className="mouse-resume" onClick={safeLock}><span>Mouse free</span>Click to look</button>}
    {phase === "intro" && <section className={`screen intro-screen ${exiting ? "exiting" : ""}`}>
      <Image className="intro-art" src="/game/splash.webp" alt="" aria-hidden="true" fill priority sizes="100vw" unoptimized/>
      <div className="intro-scrim"/><div className="intro-location">THE RAMBLE · CENTRAL PARK · 6:42 PM</div>
      <div className="intro-ui"><h1 className="sr-only">SLOTH / PARK</h1><div className="mobile-wordmark" aria-hidden="true">SLOTH <i>/</i> PARK</div>
        <p>A storm broke the route home. Cross Manhattan’s wild heart beneath the canopy and reach sanctuary before the last light leaves the park.</p>
        <button className="cinematic-cta" onClick={begin} disabled={!ready}>{ready ? "ENTER THE RAMBLE" : "PREPARING THE PARK"}<b>→</b><span/></button>
        <small>Headphones recommended · Mouse + keyboard</small>
      </div>
    </section>}
    {phase === "paused" && <section className="screen"><div className="pause-card"><div className="eyebrow">Field session paused · P</div><h2>Listen to the park.</h2><p>Your progress is safe. The hawk will keep circling, but the canopy is patient.</p><div className="actions"><button className="primary" onClick={resume}>Return to trail <b>→</b></button><button className="secondary" onClick={() => setMuted(value => !value)}>{muted ? "Enable sound" : "Mute sound"}</button></div></div></section>}
    {phase === "complete" && <section className="screen"><div className="pause-card"><div className="eyebrow">Sanctuary reached</div><h2>You made the impossible crossing.</h2><p>Five buds, one old trail, and a city’s wildest mile. The wildlife team finds your trail at first light.</p><div className="actions"><button className="primary" onClick={() => location.reload()}>Begin again <b>↻</b></button></div></div></section>}
    {phase === "playing" && <div className="mobile-controls"><button aria-label="Move forward or climb" className="move" onPointerDown={() => mobileKey("KeyW", true)} onPointerUp={() => mobileKey("KeyW", false)} onPointerCancel={() => mobileKey("KeyW", false)}>Move</button><button aria-label="Hold grip" className="grip" onPointerDown={() => mobileKey("ShiftLeft", true)} onPointerUp={() => mobileKey("ShiftLeft", false)} onPointerCancel={() => mobileKey("ShiftLeft", false)}>Grip</button><button aria-label="Context action" className="reach" onClick={() => { mobileKey("KeyE", true); mobileKey("KeyE", false); }}>{mobileAction}</button>{hud.arboreal && <button aria-label="Descend or drop to a lower branch" className="down" onClick={() => { mobileKey("ControlLeft", true); mobileKey("ControlLeft", false); }}>Down</button>}<button aria-label="Toggle scent vision" className="sense" onClick={() => mobileKey("KeyC", true)}>Sense</button></div>}
  </main>;
}
