"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { TouchControls } from "./mobile/TouchControls";
import { createSlothRig } from "./player/SlothRig";
import { loadGameTextures } from "./rendering/textures";
import { createParkUtilityCart } from "./world/ParkUtilityCart";
import { buildRealisticWorld, GOAL, START, terrainY, type BranchRoute, type ClimbableTree } from "./world/RealisticWorld";

type Phase = "intro" | "playing" | "paused" | "complete";
type MotionState = "ON GROUND" | "SWIMMING" | "DRIVING" | "CLIMBING" | "ON BRANCH" | "REACHING" | "LOWERING" | "DESCENDING" | "CAUGHT" | "HAWK DIVE" | "SNATCHED" | "PATH BLOCKED";
type HawkPhase = "PATROL" | "WATCHING" | "DIVING" | "SNATCHED" | "RECOVERING";
type HudState = { energy: number; alert: number; buds: number; objective: string; prompt: string; promptKey: string; heading: string; motion: MotionState; hint: string; threat: string; hawkPhase: HawkPhase; swimming: boolean; driving: boolean; speed: number; x: number; y: number; z: number; branchId: number; branchProgress: number; arboreal: boolean };
type HawkEvent = { kind: "DIVE" | "SNATCH"; started: number; duration: number; from: THREE.Vector3; target: THREE.Vector3; rescue: THREE.Vector3; willSnatch: boolean };

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
  const mount = useRef<HTMLDivElement>(null), phaseRef = useRef<Phase>("intro"), collected = useRef(new Set<number>()), scentRef = useRef(false), toastTimerRef = useRef<number | null>(null);
  const [phase, setPhaseState] = useState<Phase>("intro"), [ready, setReady] = useState(false), [exiting, setExiting] = useState(false);
  const [muted, setMuted] = useState(false), [scent, setScent] = useState(false), [toast, setToast] = useState("");
  const [mouseCaptured, setMouseCaptured] = useState(false);
  const [pointerLockAvailable] = useState(() => typeof window !== "undefined" && matchMedia("(pointer: fine)").matches && !new URLSearchParams(location.search).has("qa"));
  const [hud, setHud] = useState<HudState>({ energy: 100, alert: 6, buds: 0, objective: "Follow the old bridle trail", prompt: "", promptKey: "", heading: "N", motion: "ON GROUND", hint: "E climbs a nearby trunk · W / S moves · Shift grips", threat: "PATROL DISTANT", hawkPhase: "PATROL", swimming: false, driving: false, speed: 0, x: START.x, y: 0, z: START.z, branchId: -1, branchProgress: 0, arboreal: false });
  const setPhase = (next: Phase) => { phaseRef.current = next; setPhaseState(next); };
  const showToast = useCallback((message: string, duration = 2600) => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    setToast(message);
    toastTimerRef.current = window.setTimeout(() => { setToast(""); toastTimerRef.current = null; }, duration);
  }, []);

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
    // Park beside the opening trail rather than across its first sightline, so
    // W always begins as walking while the driver's door remains within reach.
    const cartSpawn = new THREE.Vector3(-39.8, terrainY(-39.8, 51.1), 51.1);
    const cart = createParkUtilityCart(textures, { scene, position: cartSpawn, rotationY: -.35, quality: tier, name: "Central Park field-services cart" });
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
    let blockedBy: "" | "TREE" | "LANDMARK" = "", climbingTree: ClimbableTree | null = null, climbAngle = 0, climbHeight = 1.48;
    let branchRoute: BranchRoute | null = null, branchProgress = 0, branchForwardSign: 1 | -1 = 1, actionRequested = false, dropRequested = false, gripHintUntil = 0, dropVelocity = 0, controlledDescent = false, descentIgnoreRouteId = -1, qaPrepared = false, qaStage = 0, caughtUntil = 0;
    let transfer: { from: THREE.Vector3; to: THREE.Vector3; route: BranchRoute; progress: number; forwardSign: 1 | -1; started: number; duration: number; kind: "REACH" | "DROP" } | null = null;
    let swimming = false, wasSwimming = false, hawkPhase: HawkPhase = "PATROL", hawkEvent: HawkEvent | null = null, hawkPasses = 0, nextHawkPassAt = 8, recoveryUntil = 0;
    let drivingCart = false, vehicleLookYaw = 0, cartWasBlocked = false;
    const cartEntry = new THREE.Vector3(), cartCamera = new THREE.Vector3(), cartQuaternion = new THREE.Quaternion(), cartPrevious = new THREE.Vector3();

    const requestLock = () => { if (phaseRef.current !== "playing" || new URLSearchParams(location.search).has("qa")) return; renderer.domElement.requestPointerLock()?.catch(() => undefined); };
    const pointer = (event: PointerEvent) => { if (event.pointerType === "touch") { dragging = true; lastTouchX = event.clientX; lastTouchY = event.clientY; renderer.domElement.setPointerCapture(event.pointerId); } else requestLock(); };
    const applyLook = (dx: number, dy: number, xScale: number, yScale: number) => {
      if (drivingCart) vehicleLookYaw = THREE.MathUtils.clamp(vehicleLookYaw - dx * xScale, -1.5, 1.5);
      else yaw -= dx * xScale;
      pitch = THREE.MathUtils.clamp(pitch - dy * yScale, -1.3, 1.2);
    };
    const pointerMove = (event: PointerEvent) => { if (dragging && event.pointerType === "touch") { applyLook(event.clientX - lastTouchX, event.clientY - lastTouchY, .006, .005); lastTouchX = event.clientX; lastTouchY = event.clientY; } };
    const pointerUp = () => { dragging = false; };
    const mouse = (event: MouseEvent) => { if (document.pointerLockElement === renderer.domElement && phaseRef.current === "playing") applyLook(event.movementX, event.movementY, .0018, .00155); };
    const touchLook = (event: Event) => { const detail = (event as CustomEvent<{ dx: number; dy: number }>).detail; if (detail) applyLook(detail.dx, detail.dy, .006, .005); };
    const collectNearby = () => {
      let collectedBud = false;
      world.buds.forEach((bud, index) => {
      if (!collected.current.has(index) && bud.visible && bud.position.distanceTo(camera.position) < 3.2) {
        collected.current.add(index); bud.visible = false; energy = Math.min(100, energy + 30);
        collectedBud = true;
        showToast(collected.current.size >= 5 ? "Tender bud 5 of 5 — +30 energy · sanctuary scent acquired" : `Tender bud ${collected.current.size} of 5 — +30 energy`, collected.current.size >= 5 ? 3400 : 2100);
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
    const releaseInput = () => { if (qaInput) return; keys.clear(); velocity.set(0, 0, 0); };
    const pointerLockChanged = () => { const captured = document.pointerLockElement === renderer.domElement; setMouseCaptured(captured); if (!captured) releaseInput(); };
    renderer.domElement.addEventListener("pointerdown", pointer); renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerup", pointerUp);
    document.addEventListener("mousemove", mouse); document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp);
    document.addEventListener("sloth-look", touchLook);
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
    function preferredBranch(routeIds: number[], maxDistance: number) {
      for (const id of routeIds) {
        const route = world.branches[id]; if (!route || route === branchRoute) continue;
        const closest = closestBranchPoint(route, player);
        if (closest.distance <= maxDistance) return { route, amount: closest.amount, point: closest.point, score: 1 };
      }
      return null;
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
    const lakeRadius = 24.72, waterSurfaceY = world.lake.position.y;
    function isSwimmableWater(x: number, z: number) {
      // The mesh is a circle, but much of its outer edge sits beneath the
      // sculpted bank. Requiring terrain below the rendered water plane makes
      // the gameplay shoreline match the shoreline the player can actually see.
      return Math.hypot(x - world.lake.position.x, z - world.lake.position.z) <= lakeRadius && terrainY(x, z) <= waterSurfaceY + .08;
    }
    const cartHullSamples = [[-.42, -1.42], [.42, -1.42], [-.42, 0], [.42, 0], [-.42, 1.42], [.42, 1.42]] as const;
    const cartPlayerHalfX = Math.max(Math.abs(cart.collisionBounds.min.x), Math.abs(cart.collisionBounds.max.x)) + .48;
    const cartPlayerHalfZ = Math.max(Math.abs(cart.collisionBounds.min.z), Math.abs(cart.collisionBounds.max.z)) + .48;
    type CartBlockReason = "" | "WATER" | "OBSTACLE";
    function cartSampleBlockReason(x: number, z: number, radius = .5): CartBlockReason {
      if (Math.abs(x) > 110 - radius || Math.abs(z) > 110 - radius) return "OBSTACLE";
      if (isSwimmableWater(x, z)) return "WATER";
      for (const tree of world.trees) if (Math.hypot(x - tree.x, z - tree.z) < tree.radius + radius + .24) return "OBSTACLE";
      for (const obstacle of world.obstacles) {
        if (obstacle.kind === "circle") {
          if (Math.hypot(x - obstacle.x, z - obstacle.z) < obstacle.radius + radius) return "OBSTACLE";
        } else if (x > obstacle.minX - radius && x < obstacle.maxX + radius && z > obstacle.minZ - radius && z < obstacle.maxZ + radius) return "OBSTACLE";
      }
      return "";
    }
    function cartHullBlockReason(position: THREE.Vector3, rotationY: number): CartBlockReason {
      const cosine = Math.cos(rotationY), sine = Math.sin(rotationY);
      let result: CartBlockReason = "";
      for (const [localX, localZ] of cartHullSamples) {
        const reason = cartSampleBlockReason(position.x + cosine * localX + sine * localZ, position.z - sine * localX + cosine * localZ);
        if (reason === "OBSTACLE") return reason;
        if (reason === "WATER") result = reason;
      }
      return result;
    }
    function safeHawkDrop(position: THREE.Vector3) {
      const tree = nearestTree(position);
      if (!tree) return new THREE.Vector3(START.x, groundHeight(START.x, START.z), START.z);
      const baseAngle = Math.atan2(position.z - tree.z, position.x - tree.x);
      for (let step = 0; step < 8; step++) {
        const angle = baseAngle + step * Math.PI / 4, radius = tree.radius + 1.15;
        const x = tree.x + Math.cos(angle) * radius, z = tree.z + Math.sin(angle) * radius;
        if (!isSwimmableWater(x, z)) return new THREE.Vector3(x, groundHeight(x, z), z);
      }
      return new THREE.Vector3(START.x, groundHeight(START.x, START.z), START.z);
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
      branchRoute = caught.route; branchProgress = caught.amount;
      const routeX = caught.route.end.x - caught.route.start.x, routeZ = caught.route.end.z - caught.route.start.z;
      branchForwardSign = routeX * -Math.sin(yaw) + routeZ * -Math.cos(yaw) >= 0 ? 1 : -1;
      climbingTree = null; dropVelocity = 0; controlledDescent = false; descentIgnoreRouteId = -1; transfer = null; caughtUntil = gameTime + 1.4;
      branchPose(caught.route, caught.amount, player); return true;
    }
    function resolveGroundCollisions(moving: boolean) {
      blockedBy = "";
      for (const tree of world.trees) {
        const dx = player.x - tree.x, dz = player.z - tree.z, distance = Math.hypot(dx, dz), clearance = tree.radius + .55;
        if (distance >= clearance) continue;
        const nx = dx / Math.max(distance, .001), nz = dz / Math.max(distance, .001);
        player.x = tree.x + nx * clearance; player.z = tree.z + nz * clearance;
        const inward = velocity.x * nx + velocity.z * nz;
        if (inward < 0) { velocity.x -= inward * nx; velocity.z -= inward * nz; blockedBy = moving ? "TREE" : blockedBy; }
      }
      if (!drivingCart) {
        const dx = player.x - cart.root.position.x, dz = player.z - cart.root.position.z, cosine = Math.cos(cart.root.rotation.y), sine = Math.sin(cart.root.rotation.y);
        let localX = cosine * dx - sine * dz, localZ = sine * dx + cosine * dz;
        if (Math.abs(localX) < cartPlayerHalfX && Math.abs(localZ) < cartPlayerHalfZ) {
          const pushAlongX = cartPlayerHalfX - Math.abs(localX) < cartPlayerHalfZ - Math.abs(localZ);
          const localNx = pushAlongX ? (localX >= 0 ? 1 : -1) : 0, localNz = pushAlongX ? 0 : (localZ >= 0 ? 1 : -1);
          if (pushAlongX) localX = localNx * cartPlayerHalfX; else localZ = localNz * cartPlayerHalfZ;
          player.x = cart.root.position.x + cosine * localX + sine * localZ; player.z = cart.root.position.z - sine * localX + cosine * localZ;
          const nx = cosine * localNx + sine * localNz, nz = -sine * localNx + cosine * localNz;
          const inward = velocity.x * nx + velocity.z * nz; if (inward < 0) { velocity.x -= inward * nx; velocity.z -= inward * nz; }
          blockedBy = moving ? "LANDMARK" : blockedBy;
        }
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
      raf = requestAnimationFrame(frame); timer.update(timestamp); const delta = Math.min(timer.getDelta(), .05);
      if (phaseRef.current === "playing") {
        gameTime += delta;
        if (!qaPrepared && (["autoclimb", "autobranch", "autotransfer", "autodrop", "autoflow", "cart", "treecollision", "watercollision", "swim", "energy", "rest", "hawk", "bridgewalk"].includes(qaInput ?? ""))) {
          const testTree = nearestTree(player);
          if (qaInput === "autoflow") {
            const flowRoute = world.canopyCorridors[0]?.routeIds[0] !== undefined ? world.branches[world.canopyCorridors[0].routeIds[0]] : undefined;
            if (flowRoute) { branchRoute = flowRoute; branchProgress = .72; branchPose(flowRoute, branchProgress, player); keys.add("KeyW"); qaPrepared = true; }
          } else if (qaInput === "cart") {
            cart.getWorldEntryPosition(cartEntry); player.copy(cartEntry); player.y = groundHeight(player.x, player.z); actionRequested = true; keys.add("KeyW"); qaPrepared = true;
          } else if (qaInput === "autodrop") {
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
          } else if (qaInput === "swim") {
            player.set(world.lake.position.x, waterSurfaceY + .58, world.lake.position.z); yaw = 0; keys.add("KeyW"); energy = 72; qaPrepared = true;
          } else if (qaInput === "energy") {
            energy = 72; keys.add("KeyW"); qaPrepared = true;
          } else if (qaInput === "rest") {
            energy = 38; qaPrepared = true;
          } else if (qaInput === "hawk") {
            const clearing = player.clone(); let bestShade = -1;
            for (let x = -90; x <= 90; x += 15) for (let z = -90; z <= 90; z += 15) {
              if (isSwimmableWater(x, z)) continue;
              const tree = nearestTree(new THREE.Vector3(x, 0, z));
              const shade = tree ? Math.hypot(x - tree.x, z - tree.z) - tree.radius : 99;
              if (shade > bestShade) { bestShade = shade; clearing.set(x, groundHeight(x, z), z); }
            }
            player.copy(clearing); alert = 98; nextHawkPassAt = 0; qaPrepared = true;
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
        let moving = false, cartNearby = false, groundTreeTarget: ClimbableTree | null = null, branchTarget: { route: BranchRoute; amount: number; point: THREE.Vector3; score: number } | null = null, lowerTarget: { route: BranchRoute; amount: number; point: THREE.Vector3; score: number } | null = null, traversalSpeed = 0;

        cart.getWorldEntryPosition(cartEntry);
        cartNearby = !drivingCart && !climbingTree && !branchRoute && !transfer && !controlledDescent && !swimming && player.distanceTo(cartEntry) < 4.1;
        // Keep the interaction shown by the HUD and the interaction that fires
        // on E identical when a forage pickup sits beside the parked cart.
        if (actionRequested && hawkEvent?.kind !== "SNATCH" && !drivingCart && collectNearby()) actionRequested = false;
        if (actionRequested && hawkEvent?.kind !== "SNATCH" && drivingCart) {
          drivingCart = false; cart.stop(); cart.getWorldEntryPosition(player); player.y = groundHeight(player.x, player.z);
          yaw = cart.root.rotation.y; vehicleLookYaw = 0; velocity.set(0, 0, 0); actionRequested = false;
          showToast("Back on the trail — the field cart is parked", 2200);
        } else if (actionRequested && hawkEvent?.kind !== "SNATCH" && cartNearby) {
          drivingCart = true; branchRoute = null; climbingTree = null; transfer = null; controlledDescent = false; dropVelocity = 0; swimming = false;
          cart.stop(); vehicleLookYaw = 0; pitch = -.055; velocity.set(0, 0, 0); actionRequested = false;
          showToast("Field cart engaged — W / S drive · A / D steer · Space brake · E exit", 3600);
        }

        if (actionRequested && hawkEvent?.kind !== "SNATCH" && !drivingCart && !transfer && !climbingTree && !branchRoute && !controlledDescent && dropVelocity === 0) {
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

        if (drivingCart) {
          cartPrevious.copy(cart.root.position); const previousYaw = cart.root.rotation.y;
          cart.update(delta, {
            throttle: (forwardHeld ? 1 : 0) - (backHeld ? 1 : 0),
            steering: (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0),
            brake: keys.has("Space") ? 1 : 0,
            handbrake: gripping,
          }, (x, z) => groundHeight(x, z) - 1.48);
          const cartBlockReason = cartHullBlockReason(cart.root.position, cart.root.rotation.y);
          if (cartBlockReason) {
            cart.setPose(cartPrevious, previousYaw).stop();
            if (!cartWasBlocked) {
              showToast(cartBlockReason === "WATER" ? "The field cart cannot enter the lake — exit to swim" : "Cart path blocked — steer around the obstacle", 2200);
            }
            cartWasBlocked = true;
          } else cartWasBlocked = false;
          cart.getWorldCameraTransform(cartCamera, cartQuaternion); player.copy(cartCamera);
          yaw = cart.root.rotation.y + vehicleLookYaw; swimming = false; moving = Math.abs(cart.speedMetersPerSecond) > .08; traversalSpeed = Math.abs(cart.speedMetersPerSecond);
          energy = Math.min(100, energy + 4.8 * delta); alert = Math.max(2, alert - 8 * delta);
        } else if (hawkEvent?.kind === "SNATCH") {
          const snatch = hawkEvent;
          const progress = THREE.MathUtils.clamp((gameTime - snatch.started) / snatch.duration, 0, 1), eased = progress * progress * (3 - 2 * progress);
          player.lerpVectors(snatch.from, snatch.rescue, eased); player.y += Math.sin(progress * Math.PI) * 5.4;
          velocity.set(0, 0, 0); swimming = false;
          if (progress >= 1) {
            player.copy(snatch.rescue); energy = Math.max(34, energy); alert = 18; hawkEvent = null; hawkPasses = 0;
            hawkPhase = "RECOVERING"; recoveryUntil = gameTime + 6; nextHawkPassAt = gameTime + 12;
            showToast("The hawk dropped you beneath cover — shaken, but safe", 3200);
          }
        } else if (transfer) {
          swimming = false;
          const progress = THREE.MathUtils.clamp((gameTime - transfer.started) / transfer.duration, 0, 1), eased = progress * progress * (3 - 2 * progress);
          player.lerpVectors(transfer.from, transfer.to, eased); player.y += Math.sin(progress * Math.PI) * (transfer.kind === "REACH" ? .48 : -.18); moving = true; traversalSpeed = 2.1;
          energy = Math.max(0, energy - (transfer.kind === "REACH" ? 2.8 : 1.2) * delta);
          if (progress >= 1) {
            branchRoute = transfer.route; branchProgress = transfer.progress; branchForwardSign = transfer.forwardSign; climbingTree = null; branchPose(branchRoute, branchProgress, player); transfer = null;
          }
        } else if (climbingTree) {
          swimming = false;
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
          if (actionRequested && branchTarget) transfer = { from: player.clone(), to: branchTarget.point.clone(), route: branchTarget.route, progress: branchTarget.amount, forwardSign: branchTarget.amount <= .5 ? 1 : -1, started: gameTime, duration: .82, kind: "REACH" };
          if (dropRequested) { climbingTree = null; controlledDescent = true; descentIgnoreRouteId = -1; dropVelocity = -.82; }
          energy = THREE.MathUtils.clamp(energy + (moving ? -(gripping ? 2.2 : 3.25) : gripping ? 4.6 : 2.8) * delta, 0, 100);
        } else if (branchRoute) {
          swimming = false;
          if (qaInput === "autodrop" && qaStage === 1 && branchRoute.belowRouteIds.length === 0) {
            const dropRoute = world.branches.find((route) => route.belowRouteIds.length > 0);
            if (dropRoute) { branchRoute = dropRoute; branchProgress = .56; branchPose(branchRoute, branchProgress, player); }
          }
          const branchInput = (forwardHeld ? 1 : 0) - (backHeld ? 1 : 0), signedBranchInput = branchInput * branchForwardSign, length = branchRoute.start.distanceTo(branchRoute.end);
          const branchSpeed = (branchRoute.corridorId ? THREE.MathUtils.lerp(.9, 1.8, energy / 100) : THREE.MathUtils.lerp(.62, 1.14, energy / 100)) * (gripping ? .58 : 1);
          branchProgress = THREE.MathUtils.clamp(branchProgress + signedBranchInput * branchSpeed * delta / Math.max(length, .1), 0, 1);
          branchPose(branchRoute, branchProgress, player); moving = branchInput !== 0; traversalSpeed = moving ? branchSpeed : 0;
          if (branchRoute.corridorId && moving && !leftHeld && !rightHeld) {
            const directionSign = signedBranchInput >= 0 ? 1 : -1;
            const desiredYaw = Math.atan2(-(branchRoute.end.x - branchRoute.start.x) * directionSign, -(branchRoute.end.z - branchRoute.start.z) * directionSign);
            const yawError = Math.atan2(Math.sin(desiredYaw - yaw), Math.cos(desiredYaw - yaw));
            yaw += yawError * (1 - Math.exp(-delta * 1.65));
          }
          const forwardIds = branchForwardSign > 0 ? branchRoute.forwardRouteIds : branchRoute.backwardRouteIds;
          const backwardIds = branchForwardSign > 0 ? branchRoute.backwardRouteIds : branchRoute.forwardRouteIds;
          const preferredIds = backHeld && !forwardHeld ? backwardIds : forwardIds;
          const candidateIds = [...new Set([...preferredIds, ...forwardIds, ...backwardIds, ...branchRoute.crossTreeRouteIds, ...branchRoute.adjacentRouteIds])];
          branchTarget = preferredBranch(preferredIds, branchRoute.corridorId ? 8.5 : 5.4) ?? bestBranch(candidateIds, branchRoute.corridorId ? 8.5 : branchProgress < .25 ? 5.2 : 4.2);
          lowerTarget = bestBranch(branchRoute.belowRouteIds, 8.2);
          if (qaInput === "autotransfer" && qaStage === 1 && branchProgress > .72 && branchTarget) { actionRequested = true; qaStage = 2; }
          if (qaInput === "autodrop" && qaStage === 1 && branchProgress >= .48 && lowerTarget) { dropRequested = true; qaStage = 2; }
          if (dropRequested) {
            if (lowerTarget) transfer = { from: player.clone(), to: lowerTarget.point.clone(), route: lowerTarget.route, progress: lowerTarget.amount, forwardSign: lowerTarget.amount <= .5 ? 1 : -1, started: gameTime, duration: .78, kind: "DROP" };
            else { descentIgnoreRouteId = branchRoute.id; branchRoute = null; controlledDescent = true; dropVelocity = -.82; }
          } else {
            const atForwardExit = branchForwardSign > 0 ? branchProgress >= .985 : branchProgress <= .015;
            const atBackwardExit = branchForwardSign > 0 ? branchProgress <= .015 : branchProgress >= .985;
            const autoTarget = forwardHeld && atForwardExit
              ? preferredBranch(forwardIds, 9)
              : backHeld && atBackwardExit
                ? preferredBranch(backwardIds, 9)
                : null;
            if (autoTarget) {
              const gap = autoTarget.point.distanceTo(player);
              const awaySign: 1 | -1 = autoTarget.amount <= .5 ? 1 : -1;
              transfer = { from: player.clone(), to: autoTarget.point.clone(), route: autoTarget.route, progress: autoTarget.amount, forwardSign: forwardHeld ? awaySign : awaySign === 1 ? -1 : 1, started: gameTime, duration: THREE.MathUtils.clamp(.32 + gap * .12, .38, .95), kind: "REACH" };
            } else if (actionRequested && branchTarget) {
              const awaySign: 1 | -1 = branchTarget.amount <= .5 ? 1 : -1;
              transfer = { from: player.clone(), to: branchTarget.point.clone(), route: branchTarget.route, progress: branchTarget.amount, forwardSign: backHeld && !forwardHeld ? (awaySign === 1 ? -1 : 1) : awaySign, started: gameTime, duration: branchTarget.route.treeIndex === branchRoute.treeIndex ? .68 : 1.05, kind: "REACH" };
            }
            if (!transfer && atBackwardExit && backHeld) {
              const treeIndex = branchProgress <= .5 ? branchRoute.treeIndex : (branchRoute.destinationTreeIndex ?? branchRoute.treeIndex), tree = world.trees[treeIndex];
              branchRoute = null; climbingTree = tree; climbHeight = THREE.MathUtils.clamp(player.y - tree.baseY, 1.48, tree.height - .65); climbAngle = Math.atan2(player.z - tree.z, player.x - tree.x);
            }
          }
          energy = THREE.MathUtils.clamp(energy + (moving ? -(gripping ? .92 : 1.35) : gripping ? 4.8 : 3.2) * delta, 0, 100);
        } else {
          const overWater = isSwimmableWater(player.x, player.z), supportY = overWater ? waterSurfaceY + .58 : groundHeight(player.x, player.z);
          if (dropVelocity !== 0 || player.y > supportY + .04) {
            const previousY = player.y;
            if (controlledDescent) dropVelocity = gripping ? -.72 : -1.15;
            else dropVelocity -= 6.2 * delta;
            player.y += dropVelocity * delta; velocity.multiplyScalar(.9);
            if (!catchFallingBranch(previousY, controlledDescent ? descentIgnoreRouteId : -1) && player.y <= supportY) { player.y = supportY; dropVelocity = 0; controlledDescent = false; descentIgnoreRouteId = -1; swimming = overWater; }
          } else {
            if (forwardHeld) wish.add(forward); if (backHeld) wish.sub(forward); if (rightHeld) wish.add(right); if (leftHeld) wish.sub(right);
            moving = wish.lengthSq() > 0; swimming = overWater;
            const movementSpeed = swimming ? THREE.MathUtils.lerp(.92, 1.62, energy / 100) : THREE.MathUtils.lerp(1.55, 3.05, energy / 100);
            if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(movementSpeed), 1 - Math.exp(-delta * (moving ? 8 : 5)));
            player.addScaledVector(velocity, delta); resolveGroundCollisions(moving);
            swimming = isSwimmableWater(player.x, player.z);
            if (swimming) {
              const swimBob = Math.sin(gameTime * 3.2) * .07 + Math.sin(gameTime * 1.7) * .025;
              player.y = THREE.MathUtils.lerp(player.y, waterSurfaceY + .58 + swimBob, 1 - Math.exp(-delta * 5));
              energy = THREE.MathUtils.clamp(energy + (moving ? -2.35 : 2.4) * delta, 0, 100);
            } else {
              player.y = groundHeight(player.x, player.z) + Math.sin(gameTime * 5.5) * Math.min(.025, velocity.length() * .006);
              energy = THREE.MathUtils.clamp(energy + (moving ? -1.65 : 6.2) * delta, 0, 100);
              groundTreeTarget = nearestTree(player, 1.35);
            }
            traversalSpeed = velocity.length();
          }
        }
        if (swimming !== wasSwimming && hawkEvent?.kind !== "SNATCH") {
          showToast(swimming ? "Swimming — slower strokes, but the hawk will not dive at the water" : "Back on solid ground", 2600); wasSwimming = swimming;
        }
        actionRequested = false; dropRequested = false; camera.position.copy(player); camera.rotation.set(pitch, yaw, 0);
        actionMarker.visible = false; dropMarker.visible = false;
        const pulse = 1 + Math.sin(gameTime * 4.2) * .09;
        if (cartNearby) { actionMarker.visible = true; actionMarker.position.copy(cartEntry); actionMarker.position.y += 1.05; }
        else if (branchTarget) { actionMarker.visible = true; actionMarker.position.copy(branchTarget.point); }
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
          const angularScale = marker === actionMarker && (cartNearby || groundTreeTarget && !branchTarget) ? .075 : .06;
          marker.scale.setScalar(THREE.MathUtils.clamp(distance * angularScale * pulse, .018, .92));
        }
        const shadeTree = nearestTree(player), shadeDistance = shadeTree ? Math.max(0, Math.hypot(player.x - shadeTree.x, player.z - shadeTree.z) - shadeTree.radius) : 18;
        const rawExposure = Math.min(1, shadeDistance / 13), arborealCover = Boolean(climbingTree || branchRoute || transfer);
        // Water is open visually, but the hawk refuses to commit to a strike
        // over it. Canopy travel likewise converts proximity to branches into
        // real safety instead of making the threat meter cosmetic.
        const exposed = drivingCart ? .04 : swimming ? .08 : arborealCover ? rawExposure * .24 : rawExposure;
        if (hawkEvent?.kind === "SNATCH") alert = 100;
        else if (gameTime < recoveryUntil) alert = Math.max(8, alert - 5.5 * delta);
        else alert = THREE.MathUtils.clamp(alert + (exposed * 5 - (1 - exposed) * 7) * delta, 2, 100);

        sloth.animate(gameTime, traversalSpeed, Boolean(climbingTree || branchRoute || transfer)); cart.animate(gameTime); world.animate(gameTime, player, scentRef.current, collected.current);

        if (hawkEvent?.kind === "DIVE" && (drivingCart || swimming || (exposed < .3 && qaInput !== "hawk"))) {
          hawkEvent = null; alert = Math.max(24, alert - 24); hawkPhase = alert >= 55 ? "WATCHING" : "PATROL"; nextHawkPassAt = gameTime + 5;
          showToast(drivingCart ? "The cart roof breaks the hawk's line of attack" : swimming ? "The hawk breaks off at the waterline" : "The canopy breaks the hawk's line of sight", 2400);
        }
        if (!hawkEvent) {
          if (gameTime < recoveryUntil) hawkPhase = "RECOVERING";
          else {
            const nextThreshold = hawkPasses === 0 ? 68 : hawkPasses === 1 ? 84 : 96;
            if (alert >= nextThreshold && (exposed > .55 || qaInput === "hawk") && gameTime >= nextHawkPassAt) {
              const willSnatch = alert >= 97 || hawkPasses >= 2, target = player.clone().addScaledVector(forward, 1.25);
              target.y = player.y + .45;
              hawkEvent = { kind: "DIVE", started: gameTime, duration: willSnatch ? 1.75 : 2.35, from: world.hawk.position.clone(), target, rescue: safeHawkDrop(player), willSnatch };
              hawkPhase = "DIVING";
              showToast(willSnatch ? "HAWK COMMITTED — reach canopy or water" : hawkPasses === 0 ? "Hawk warning pass — find cover" : "Hawk diving lower — find cover now", 2700);
            } else {
              const previousPhase = hawkPhase; hawkPhase = alert >= 55 ? "WATCHING" : "PATROL";
              if (previousPhase === "PATROL" && hawkPhase === "WATCHING") {
                showToast("The hawk has noticed you — move beneath canopy or into water", 2800);
              }
            }
          }
        }
        if (hawkEvent?.kind === "DIVE") {
          const dive = hawkEvent, progress = THREE.MathUtils.clamp((gameTime - dive.started) / dive.duration, 0, 1);
          dive.target.x = THREE.MathUtils.lerp(dive.target.x, player.x, 1 - Math.exp(-delta * 2.8));
          dive.target.z = THREE.MathUtils.lerp(dive.target.z, player.z, 1 - Math.exp(-delta * 2.8)); dive.target.y = player.y + .45;
          if (dive.willSnatch) {
            const eased = progress * progress * (3 - 2 * progress); world.hawk.position.lerpVectors(dive.from, dive.target, eased);
          } else {
            const strikeAt = .68;
            if (progress <= strikeAt) {
              const amount = progress / strikeAt, eased = amount * amount * (3 - 2 * amount); world.hawk.position.lerpVectors(dive.from, dive.target, eased);
            } else {
              const retreatDirection = dive.from.clone().sub(dive.target).setY(0).normalize();
              const retreat = dive.target.clone().addScaledVector(retreatDirection, 22); retreat.y += 10;
              const amount = (progress - strikeAt) / (1 - strikeAt); world.hawk.position.lerpVectors(dive.target, retreat, amount * amount * (3 - 2 * amount));
            }
          }
          world.hawk.lookAt(dive.target); world.hawk.rotateY(Math.PI); camera.rotation.z = Math.sin(gameTime * 48) * Math.sin(progress * Math.PI) * .012;
          if (progress >= 1) {
            if (dive.willSnatch) {
              transfer = null; branchRoute = null; climbingTree = null; controlledDescent = false; dropVelocity = 0; velocity.set(0, 0, 0); swimming = false; wasSwimming = false;
              hawkEvent = { ...dive, kind: "SNATCH", started: gameTime, duration: 2.75, from: player.clone() }; hawkPhase = "SNATCHED"; alert = 100;
              showToast("SNATCHED — the hawk is carrying you toward the canopy", 2800);
            } else {
              hawkPasses += 1; alert = Math.max(38, alert - 24); energy = Math.max(8, energy - 10); hawkEvent = null; hawkPhase = "WATCHING"; nextHawkPassAt = gameTime + 5;
              showToast("Close pass — 10 energy lost. Stay under cover.", 2600);
            }
          }
        } else if (hawkEvent?.kind === "SNATCH") {
          world.hawk.position.copy(player).addScaledVector(forward, 1.55); world.hawk.position.y += .72;
          world.hawk.lookAt(player); world.hawk.rotateY(Math.PI); camera.rotation.z = Math.sin(gameTime * 32) * .028;
        }
        sun.position.set(player.x - 35, player.y + 68, player.z + 25); sun.target.position.set(player.x, player.y, player.z - 8); sun.target.updateMatrixWorld();
        if (collected.current.size >= 5 && player.distanceTo(GOAL) < 7) { setPhase("complete"); document.exitPointerLock(); }
        if (gameTime - lastHud > .12) {
          lastHud = gameTime; let prompt = "", promptKey = "";
          world.buds.forEach(bud => { if (bud.visible && bud.position.distanceTo(player) < 3.2) { prompt = "FORAGE TENDER BUD"; promptKey = "E"; } });
          if (drivingCart) { prompt = "EXIT FIELD-SERVICES CART"; promptKey = "E"; }
          else if (!prompt && cartNearby) { prompt = "DRIVE FIELD-SERVICES CART"; promptKey = "E"; }
          const nearbyTree = drivingCart || climbingTree || branchRoute || controlledDescent || swimming || hawkEvent?.kind === "SNATCH" ? null : (groundTreeTarget ?? nearestTree(player, 1.35));
          if (!prompt && nearbyTree) { prompt = "CLIMB TRUNK"; promptKey = "E"; }
          if (climbingTree && !prompt) { prompt = branchTarget ? "STEP ONTO BRANCH" : "W / S CLIMB · SHIFT GRIP · CTRL DESCEND"; promptKey = branchTarget ? "E" : ""; }
          if (branchRoute && !prompt) {
            if (branchTarget && (branchRoute.corridorId || branchProgress > .72)) { prompt = branchRoute.corridorId ? "KEEP W HELD · FOLLOW THE GUIDE RING" : "KEEP W HELD · AUTO-GRAB AHEAD"; }
            else if (branchTarget) { prompt = branchTarget.route.treeIndex === branchRoute.treeIndex ? "TAKE THIS BRANCH" : "REACH ACROSS"; promptKey = "E"; }
            else if (lowerTarget) { prompt = "DROP TO LOWER BRANCH"; promptKey = "CTRL"; }
            else { prompt = "LOWER SAFELY TO GROUND"; promptKey = "CTRL"; }
          }
          if (controlledDescent && !prompt) { prompt = gripping ? "LOWERING WITH SECURE GRIP" : "HOLD SHIFT FOR A SLOWER DESCENT"; promptKey = gripping ? "" : "SHIFT"; }
          if (swimming && !prompt) prompt = "W / A / S / D  SWIM";
          const head = ((yaw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), directions = ["N", "NW", "W", "SW", "S", "SE", "E", "NE"];
          const motion: MotionState = drivingCart ? "DRIVING" : hawkEvent?.kind === "SNATCH" ? "SNATCHED" : hawkEvent?.kind === "DIVE" ? "HAWK DIVE" : gameTime < caughtUntil ? "CAUGHT" : transfer ? (transfer.kind === "DROP" ? "LOWERING" : "REACHING") : branchRoute ? "ON BRANCH" : climbingTree ? "CLIMBING" : controlledDescent ? "DESCENDING" : swimming ? "SWIMMING" : blockedBy ? "PATH BLOCKED" : "ON GROUND";
          const hint = drivingCart ? `${Math.round(Math.abs(cart.speedMetersPerSecond) * 3.6)} km/h · W / S drive · A / D steer · Space brake · E exit` : hawkEvent?.kind === "SNATCH" ? "Recoverable snatch · the hawk will drop you beneath nearby cover" : hawkEvent?.kind === "DIVE" ? "Break its line of sight: reach canopy or enter the water" : gameTime < caughtUntil ? "Lower branch caught · grip secure" : transfer ? (transfer.kind === "DROP" ? "Lowering to the highlighted branch" : "Reaching hand-over-hand") : branchRoute ? (branchRoute.corridorId ? "Hold W for continuous tree-to-tree travel · look or steer at junctions" : "W / S crawl · endpoint branches auto-grab · Ctrl or Space descends") : climbingTree ? (energy < 18 ? "Rest in place to recover energy · Ctrl descends" : "W / S climb · E enters a branch · Ctrl descends") : controlledDescent ? "A safe descent is active · Shift slows the lowering motion" : swimming ? (energy < 20 ? "Rest on the surface to recover · swimming never stops completely" : "Slower strokes · water cools hawk awareness · rest to recover energy") : blockedBy === "TREE" ? "Solid trunk · face its marker and press E to climb" : blockedBy === "LANDMARK" ? "Solid park structure · use or steer around it" : gameTime < gripHintUntil ? "Move within arm’s reach of a marked trunk, then press E" : energy < 20 ? (moving ? "Low energy slows you, but never freezes movement" : "Resting — energy recovering quickly") : moving ? "Walking drains energy · stop to recover or forage a bud" : "Resting restores energy · tender buds restore 30";
          const threat = hawkPhase === "SNATCHED" ? "SNATCHED · RECOVERING" : hawkPhase === "DIVING" ? "DIVE PASS INBOUND" : hawkPhase === "RECOVERING" ? "DISORIENTED · SAFE" : drivingCart ? "CART ROOF COVER" : swimming ? "WATER SHELTER" : alert >= 85 ? "DANGER · FIND COVER" : hawkPhase === "WATCHING" ? "HAWK WATCHING" : "PATROL DISTANT";
          setHud({ energy, alert, buds: Math.min(collected.current.size, 5), objective: collected.current.size >= 5 ? "Reach the stone sanctuary gate" : "Forage five buds across trail and canopy", prompt, promptKey, heading: directions[Math.round(head / (Math.PI / 4)) % 8], motion, hint, threat, hawkPhase, swimming, driving: drivingCart, speed: cart.speedMetersPerSecond, x: player.x, y: player.y, z: player.z, branchId: branchRoute?.id ?? -1, branchProgress, arboreal: Boolean(climbingTree || branchRoute || transfer || controlledDescent || dropVelocity < 0) });
        }
      } else { cart.animate(gameTime); world.animate(gameTime, player, scentRef.current, collected.current); }
      if (composer) composer.render(); else renderer.render(scene, camera);
    }
    frame();
    return () => {
      disposed = true; cancelAnimationFrame(raf); renderer.domElement.removeEventListener("pointerdown", pointer); renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerup", pointerUp);
      document.removeEventListener("mousemove", mouse); document.removeEventListener("keydown", keyDown); document.removeEventListener("keyup", keyUp); document.removeEventListener("sloth-look", touchLook); document.removeEventListener("pointerlockchange", pointerLockChanged); window.removeEventListener("blur", releaseInput); removeEventListener("resize", resize);
      cart.dispose(); markerGeometry.dispose(); actionMarkerMaterial.dispose(); dropMarkerMaterial.dispose(); timer.dispose(); composer?.dispose(); renderer.dispose(); if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement);
    };
  }, [showToast]);

  const audioRef = useRef<ReturnType<typeof startAudio> | null>(null);
  const safeLock = () => { if (new URLSearchParams(location.search).has("qa")) return; mount.current?.querySelector("canvas")?.requestPointerLock()?.catch(() => undefined); };
  const begin = useCallback(() => {
    if (!ready || exiting) return; if (!audioRef.current) audioRef.current = startAudio(); setExiting(true); safeLock();
    window.setTimeout(() => {
      setPhase("playing"); setExiting(false); showToast("E drives the marked field cart · hold W to follow ring-marked canopy routes", 5200);
    }, 850);
  }, [ready, exiting, showToast]);
  const resume = () => { setPhase("playing"); safeLock(); };
  useEffect(() => { if (audioRef.current) audioRef.current.master.gain.value = muted ? 0 : .13; }, [muted]);
  useEffect(() => () => {
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    if (audioRef.current) { clearInterval(audioRef.current.interval); audioRef.current.context.close().catch(() => undefined); audioRef.current = null; }
  }, []);
  return <main className="game-shell" data-game-state={phase} data-motion={hud.motion} data-energy={hud.energy.toFixed(1)} data-threat={hud.alert.toFixed(1)} data-hawk-phase={hud.hawkPhase} data-swimming={hud.swimming ? "true" : "false"} data-driving={hud.driving ? "true" : "false"} data-speed={hud.speed.toFixed(2)} data-position={`${hud.x.toFixed(2)},${hud.z.toFixed(2)}`} data-altitude={hud.y.toFixed(2)} data-branch={hud.branchId} data-branch-progress={hud.branchProgress.toFixed(3)}>
    <div ref={mount} className="viewport" aria-label="3D game viewport" />
    <div className="world-grade"/><div className="world-vignette"/><div className="grain"/>
    {phase !== "intro" && <div className="hud" aria-live="polite">
      <section className="mission"><div className="eyebrow">Current objective</div><h2>{hud.objective}</h2><p>{hud.buds} / 5 tender buds foraged</p></section>
      <div className="compass"><div className="eyebrow">The Ramble · 6:42 PM</div><div className="compass-line"><span>W</span><span className="active">{hud.heading}</span><span>E</span></div></div>
      <div className="status"><div className="eyebrow">Hawk status · {Math.round(hud.alert)}%</div><strong>{hud.threat}</strong></div>
      <div className="meters"><div className={`motion-state ${hud.motion === "PATH BLOCKED" || hud.motion === "HAWK DIVE" || hud.motion === "SNATCHED" ? "warning" : ""}`}><span>{hud.motion}</span><small>{hud.hint}</small></div><div className="meter-row"><span>Energy</span><div className="meter-track"><div className="meter-fill" style={{ width: `${hud.energy}%` }}/></div><span>{Math.round(hud.energy)}</span></div><div className="meter-row"><span>Threat</span><div className="meter-track"><div className="meter-fill alert" style={{ width: `${hud.alert}%` }}/></div><span>{Math.round(hud.alert)}</span></div></div>
      <div className={`crosshair ${hud.promptKey === "E" ? "targeted" : hud.promptKey === "CTRL" ? "drop-targeted" : ""}`}/>{hud.prompt && <div className="interaction">{hud.promptKey && <span className="key">{hud.promptKey}</span>}{hud.prompt}</div>}
      <div className="controls-strip">{hud.driving ? <><span>W / S Drive</span><span>A / D Steer</span><span>Space Brake</span><span>E Exit</span></> : <><span>W / S Move / Auto-flow</span><span>Shift Hold Grip</span><span>E Interact</span><span>Ctrl / Space Descend</span></>}<span>P Pause</span><span>C Scent</span><span>M {muted ? "Unmute" : "Mute"}</span></div>
      <div className={`scent-overlay ${scent ? "on" : ""}`}/>{toast && <div className="toast">{toast}</div>}
    </div>}
    {phase === "playing" && pointerLockAvailable && !mouseCaptured && <button className="mouse-resume" onClick={safeLock}><span>Mouse free</span>Click to look</button>}
    {phase === "intro" && <section className={`screen intro-screen ${exiting ? "exiting" : ""}`}>
      <Image className="intro-art" src="/game/splash.webp" alt="" aria-hidden="true" fill priority sizes="100vw" unoptimized/>
      <div className="intro-scrim"/><div className="intro-location">THE RAMBLE · CENTRAL PARK · 6:42 PM</div>
      <div className="intro-ui"><h1 className="sr-only">SLOTH / PARK</h1><div className="mobile-wordmark" aria-hidden="true">SLOTH <i>/</i> PARK</div>
        <p>A storm broke the route home. Cross Manhattan’s wild heart beneath the canopy and reach sanctuary before the last light leaves the park.</p>
        <button className="cinematic-cta" onClick={begin} disabled={!ready}>{ready ? "ENTER THE RAMBLE" : "PREPARING THE PARK"}<b>→</b><span/></button>
        <small>Headphones recommended · Mouse, keyboard &amp; touch</small>
      </div>
    </section>}
    {phase === "paused" && <section className="screen"><div className="pause-card"><div className="eyebrow">Field session paused · P</div><h2>Listen to the park.</h2><p>Your progress is safe. The hawk will keep circling, but the canopy is patient.</p><div className="actions"><button className="primary" onClick={resume}>Return to trail <b>→</b></button><button className="secondary" onClick={() => setMuted(value => !value)}>{muted ? "Enable sound" : "Mute sound"}</button></div></div></section>}
    {phase === "complete" && <section className="screen"><div className="pause-card"><div className="eyebrow">Sanctuary reached</div><h2>You made the impossible crossing.</h2><p>Five buds, one old trail, and a city’s wildest mile. The wildlife team finds your trail at first light.</p><div className="actions"><button className="primary" onClick={() => location.reload()}>Begin again <b>↻</b></button></div></div></section>}
    {phase === "playing" && <TouchControls arboreal={hud.arboreal} driving={hud.driving} prompt={hud.prompt} />}
  </main>;
}
