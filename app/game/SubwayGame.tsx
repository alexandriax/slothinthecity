"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GoalWayfinder } from "./GoalWayfinder";
import { MobileHud } from "./mobile/MobileHud";
import { TouchControls } from "./mobile/TouchControls";
import { createSlothRig } from "./player/SlothRig";
import { loadGameTextures } from "./rendering/textures";
import { SubwayWorld, type BoardingOption, type SubwayStationId } from "./world/SubwayWorld";

type TransitStage = "FIFTH_AV" | "RIDING" | "LEXINGTON" | "WEST_FARMS" | "COMPLETE";
type TransitHud = { bearing: number; distance: number; motion: string; objective: string; objectiveShort: string; prompt: string; promptKey: string; station: string; status: string; value: string; waypoint: string };

function hasTouchInput() {
  return typeof window !== "undefined" && ((navigator.maxTouchPoints ?? 0) > 0 || "ontouchstart" in window || matchMedia("(pointer: coarse)").matches);
}

function pixelRatio() {
  const budget = Math.sqrt(1_250_000 / Math.max(1, innerWidth * innerHeight)); return Math.max(.72, Math.min(devicePixelRatio, 1.1, budget));
}

function requestLock(canvas: HTMLCanvasElement | null) {
  if (!canvas || typeof canvas.requestPointerLock !== "function" || hasTouchInput()) return;
  try { Promise.resolve(canvas.requestPointerLock()).catch(() => undefined); } catch {}
}

function bronxZooSignTexture() {
  const canvas = document.createElement("canvas"); canvas.width = 1200; canvas.height = 240;
  const context = canvas.getContext("2d"); if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height); gradient.addColorStop(0, "#173d2a"); gradient.addColorStop(1, "#0d261a"); context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#cfe59b"; context.lineWidth = 12; context.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
  context.fillStyle = "#edf3d5"; context.textAlign = "center"; context.textBaseline = "middle"; context.font = "700 82px Georgia, serif"; context.fillText("BRONX ZOO", canvas.width / 2, 96);
  context.fillStyle = "#cfe59b"; context.font = "700 34px Helvetica, Arial, sans-serif"; context.letterSpacing = "9px"; context.fillText("ASIA GATE · WELCOME HOME", canvas.width / 2, 174);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

function bronxZooArrival(scene: THREE.Scene, textures: ReturnType<typeof loadGameTextures>) {
  const root = new THREE.Group(); root.name = "bronx-zoo-mission-arrival";
  const skyFill = new THREE.HemisphereLight("#e5f1d8", "#435641", 1.65), sunset = new THREE.DirectionalLight("#ffe0a8", 2.4); sunset.position.set(-16, 28, 18); root.add(skyFill, sunset);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 45, 8, 8), new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .08, color: "#7f8b68", roughness: .94 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  const stone = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .04, color: "#b8ad95", roughness: .88 }), iron = new THREE.MeshStandardMaterial({ color: "#18211d", metalness: .82, roughness: .32 });
  for (const side of [-1, 1]) { const pillar = new THREE.Mesh(new RoundedBoxGeometry(2.1, 7.6, 2.1, 5, .18), stone); pillar.position.set(side * 6, 3.8, -4); pillar.castShadow = true; root.add(pillar); }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(6, .42, 14, 64, Math.PI), iron); arch.position.set(0, 6.3, -4); root.add(arch);
  const signTexture = bronxZooSignTexture();
  const sign = new THREE.Mesh(new RoundedBoxGeometry(7.4, 1.05, .24, 4, .08), new THREE.MeshBasicMaterial({ color: "#ffffff", map: signTexture, toneMapped: false })); sign.position.set(0, 7.2, -4); root.add(sign);
  for (const x of [-16, -12, 12, 16]) { const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.38, .55, 7, 16), new THREE.MeshStandardMaterial({ map: textures.bark, color: "#8a765f", roughness: .94 })); trunk.position.set(x, 3.5, -2 - Math.abs(x) * .15); root.add(trunk); const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3.5, 2), new THREE.MeshStandardMaterial({ map: textures.foliage, alphaMap: textures.foliage, alphaTest: .25, color: "#59734f", roughness: .84 })); crown.position.set(x, 8, trunk.position.z); root.add(crown); }
  scene.add(root); return root;
}

export function SubwayGame() {
  const mount = useRef<HTMLDivElement>(null), [stage, setStage] = useState<TransitStage>("FIFTH_AV"), [toast, setToast] = useState("Enter at 60th Street · follow signs for Queens-bound N / R service");
  const [touchCapable, setTouchCapable] = useState(false), toastTimer = useRef<number | null>(null);
  const [hud, setHud] = useState<TransitHud>({ bearing: 0, distance: 20, motion: "IN STATION", objective: "Take a Queens-bound N or R train one stop", objectiveShort: "PLATFORM", prompt: "", promptKey: "", station: "5 AV / 59 ST · 7:12 PM", status: "TRAIN APPROACHING", value: "4S", waypoint: "Queens-bound N / R" });
  const showToast = useCallback((message: string, duration = 3200) => { if (toastTimer.current !== null) clearTimeout(toastTimer.current); setToast(message); toastTimer.current = window.setTimeout(() => { setToast(""); toastTimer.current = null; }, duration); }, []);

  useEffect(() => {
    const host = mount.current; if (!host) return;
    let transitStage: TransitStage = "FIFTH_AV", currentStation: SubwayStationId = "FIFTH_AV", stationClock = 0, gameTime = 0, actionRequested = false;
    let rideStartedAt = 0, rideUntil = 0, boarded: BoardingOption | null = null, lastHud = 0, yaw = 0, pitch = -.04, dragging = false, lastTouchX = 0, lastTouchY = 0;
    const scene = new THREE.Scene(); scene.background = new THREE.Color("#303936"); scene.fog = new THREE.FogExp2("#303936", .009);
    const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, .07, 180); camera.rotation.order = "YXZ";
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18; renderer.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(renderer.domElement);
    const textures = loadGameTextures(renderer, () => undefined), world = new SubwayWorld(scene, textures), player = world.spawn.clone(), velocity = new THREE.Vector3(), keys = new Set<string>();
    const sloth = createSlothRig(textures.fur); sloth.root.scale.setScalar(innerWidth < 760 ? .54 : .72); sloth.left.position.x = innerWidth < 760 ? -.55 : -.84; sloth.right.position.x = innerWidth < 760 ? .55 : .84; sloth.left.position.y = sloth.right.position.y = -.8; camera.add(sloth.root); scene.add(camera);
    const timer = new THREE.Timer(); timer.connect(document);
    const setTransitStage = (next: TransitStage) => { transitStage = next; setStage(next); };
    const touchLook = (event: Event) => { const detail = (event as CustomEvent<{ dx: number; dy: number }>).detail; if (!detail) return; yaw -= detail.dx * .006; pitch = THREE.MathUtils.clamp(pitch - detail.dy * .005, -1.2, 1.12); };
    const keyDown = (event: KeyboardEvent) => { keys.add(event.code); if (event.code === "KeyE" && !event.repeat) actionRequested = true; };
    const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const pointerDown = (event: PointerEvent) => { if (event.pointerType === "touch") { dragging = true; lastTouchX = event.clientX; lastTouchY = event.clientY; try { renderer.domElement.setPointerCapture(event.pointerId); } catch {} } else requestLock(renderer.domElement); };
    const pointerMove = (event: PointerEvent) => { if (dragging && event.pointerType === "touch") { yaw -= (event.clientX - lastTouchX) * .006; pitch = THREE.MathUtils.clamp(pitch - (event.clientY - lastTouchY) * .005, -1.2, 1.12); lastTouchX = event.clientX; lastTouchY = event.clientY; } };
    const pointerUp = () => { dragging = false; };
    const mouseMove = (event: MouseEvent) => { if (document.pointerLockElement === renderer.domElement) { yaw -= event.movementX * .0018; pitch = THREE.MathUtils.clamp(pitch - event.movementY * .00155, -1.2, 1.12); } };
    const release = () => { keys.clear(); velocity.set(0, 0, 0); actionRequested = false; dragging = false; };
    const visibilityChange = () => { if (document.hidden) release(); };
    const resize = () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setPixelRatio(pixelRatio()); renderer.setSize(innerWidth, innerHeight); };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerup", pointerUp); renderer.domElement.addEventListener("pointercancel", pointerUp); document.addEventListener("mousemove", mouseMove); document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp); document.addEventListener("sloth-look", touchLook); document.addEventListener("visibilitychange", visibilityChange); window.addEventListener("blur", release); window.addEventListener("resize", resize);

    let raf = 0;
    function checkpoint(station: SubwayStationId, message: string) {
      currentStation = station; world.setStation(station); player.copy(world.spawn); velocity.set(0, 0, 0); yaw = 0; pitch = -.04; stationClock = 0; boarded = null; setTransitStage(station === "FIFTH_AV" ? "FIFTH_AV" : station === "LEXINGTON" ? "LEXINGTON" : "WEST_FARMS"); showToast(message, 4200);
    }
    function finishRide() {
      if (!boarded) return;
      if (!boarded.correct) { checkpoint(currentStation, `Wrong train — checkpoint restored at ${currentStation === "FIFTH_AV" ? "5 Av / 59 St" : "Lexington Av / 59 St"}.`); return; }
      if (currentStation === "FIFTH_AV") checkpoint("LEXINGTON", "Lexington Av / 59 St — transfer down to the uptown 5 express platform");
      else checkpoint("WEST_FARMS", "West Farms Sq–E Tremont Av — follow the north exit toward the Bronx Zoo");
    }
    const qaInput = ["localhost", "127.0.0.1"].includes(location.hostname) ? new URLSearchParams(location.search).get("qa") : null;
    if (qaInput === "lexington") checkpoint("LEXINGTON", "QA checkpoint · Lexington Av / 59 St");
    else if (["westfarms", "finale"].includes(qaInput ?? "")) checkpoint("WEST_FARMS", "QA checkpoint · West Farms Sq–E Tremont Av");
    if (["subway", "subwayplatform", "lexington"].includes(qaInput ?? "")) {
      // Hold a train at the platform for deterministic visual regression passes.
      stationClock = 6; world.update(stationClock);
    }
    if (["subwayplatform", "lexington"].includes(qaInput ?? "")) { player.set(-5, 1.48, -5.2); yaw = -Math.PI / 2; }
    if (qaInput === "finale") { player.copy(world.waypoint); actionRequested = true; }
    function frame(timestamp?: number) {
      raf = requestAnimationFrame(frame); timer.update(timestamp); const delta = Math.min(timer.getDelta(), .05); gameTime += delta;
      if (transitStage === "RIDING") {
        const rideDuration = Math.max(.001, rideUntil - rideStartedAt), rideProgress = THREE.MathUtils.clamp((gameTime - rideStartedAt) / rideDuration, 0, 1);
        if (boarded) world.updateRide(boarded, rideProgress, gameTime);
        const train = boarded?.correct ? world.correctTrain : world.wrongTrain, interior = new THREE.Vector3(0, 1.5, .2); train?.root.localToWorld(interior); camera.position.copy(interior); camera.rotation.set(THREE.MathUtils.clamp(pitch, -.68, .68), yaw, Math.sin(gameTime * 9) * .003); sloth.animate(gameTime, .2, false);
        if (gameTime - lastHud > .12) {
          lastHud = gameTime;
          const seconds = Math.max(0, Math.ceil(rideUntil - gameTime)), destination = currentStation === "FIFTH_AV" ? "Lexington Av / 59 St" : "West Farms Sq / E Tremont Av";
          setHud({ bearing: 0, distance: 0, motion: "RIDING", objective: `Ride to ${destination}`, objectiveShort: "ON TRAIN", prompt: "", promptKey: "", station: `${boarded?.route ?? "TRAIN"} · ${boarded?.direction ?? "IN SERVICE"}`, status: rideProgress < .2 ? "DOORS CLOSING" : "TRAIN IN MOTION", value: `${seconds}S`, waypoint: destination });
        }
        if (gameTime >= rideUntil) finishRide();
      } else if (transitStage !== "COMPLETE") {
        stationClock += delta; world.update(stationClock);
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0; if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(2.65), 1 - Math.exp(-delta * (moving ? 9 : 6))); player.addScaledVector(velocity, delta); world.resolvePlayer(player, velocity);
        const option = world.boardingOption(player), target = world.waypoint, targetX = target.x - player.x, targetZ = target.z - player.z, distance = Math.hypot(targetX, targetZ);
        const ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw), side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw), bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        let prompt = "", promptKey = "";
        if (option) { prompt = `BOARD ${option.route} · ${option.direction}`; promptKey = "E"; }
        else if (currentStation === "WEST_FARMS" && distance < 3.1) { prompt = "EXIT TO BRONX ZOO"; promptKey = "E"; }
        if (actionRequested && option) { boarded = option; rideStartedAt = gameTime; rideUntil = gameTime + 5.8; yaw = 0; pitch = -.03; velocity.set(0, 0, 0); keys.clear(); setTransitStage("RIDING"); showToast(option.correct ? option.station === "FIFTH_AV" ? `${option.route} train eastbound — next stop Lexington Av / 59 St` : "Uptown 5 — Bronx-bound express service" : `Boarded ${option.route} ${option.direction.toLowerCase()} — doors closing`, 3600); }
        else if (actionRequested && currentStation === "WEST_FARMS" && distance < 3.1) {
          setTransitStage("COMPLETE"); world.root.visible = false; scene.background = new THREE.Color("#9bb5a0"); scene.fog = new THREE.FogExp2("#b9c7b2", .012); bronxZooArrival(scene, textures); camera.position.set(0, 2.15, 10); camera.lookAt(0, 3.2, -4); sloth.root.visible = false; if (document.pointerLockElement) { try { document.exitPointerLock(); } catch {} }
        }
        actionRequested = false; camera.position.copy(player); camera.rotation.set(pitch, yaw, 0); sloth.animate(gameTime, velocity.length(), false);
        if (gameTime - lastHud > .12) {
          lastHud = gameTime;
          const fifth = currentStation === "FIFTH_AV", lex = currentStation === "LEXINGTON";
          const objective = fifth ? "Take a Queens-bound N or R train one stop" : lex ? "Transfer down to the uptown 5 platform" : "Exit toward the Bronx Zoo";
          const waypoint = fifth ? "Queens-bound N / R" : lex ? "Uptown 5 platform" : "Bronx Zoo exit";
          const status = currentStation === "WEST_FARMS" ? "ANIMAL TRACKS · NORTH EXIT" : world.doorsOpen ? "DOORS OPEN" : world.trainPhase === "APPROACHING" ? "TRAIN APPROACHING" : world.trainPhase === "BOARDING" ? "TRAIN ARRIVED" : `NEXT TRAIN · ${world.secondsToTrain}s`;
          setHud({ bearing, distance, motion: moving ? "WALKING" : "IN STATION", objective, objectiveShort: fifth ? "PLATFORM" : lex ? "TRANSFER" : "EXIT", prompt, promptKey, station: fifth ? "5 AV / 59 ST · 7:12 PM" : lex ? "LEXINGTON AV / 59 ST · B4" : "WEST FARMS SQ · E TREMONT AV", status, value: currentStation === "WEST_FARMS" ? `${Math.round(distance)}M` : world.doorsOpen ? "OPEN" : `${world.secondsToTrain}S`, waypoint });
        }
      }
      renderer.render(scene, camera);
    }
    frame();
    return () => { cancelAnimationFrame(raf); renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerup", pointerUp); renderer.domElement.removeEventListener("pointercancel", pointerUp); document.removeEventListener("mousemove", mouseMove); document.removeEventListener("keydown", keyDown); document.removeEventListener("keyup", keyUp); document.removeEventListener("sloth-look", touchLook); document.removeEventListener("visibilitychange", visibilityChange); window.removeEventListener("blur", release); window.removeEventListener("resize", resize); timer.dispose(); world.dispose(); renderer.dispose(); if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement); };
  }, [showToast]);

  useEffect(() => { const frame = requestAnimationFrame(() => setTouchCapable(hasTouchInput())); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => () => { if (toastTimer.current !== null) clearTimeout(toastTimer.current); }, []);
  return <main className="game-shell subway-shell" data-game-state={stage === "COMPLETE" ? "complete" : "playing"} data-touch-capable={touchCapable ? "true" : "false"} data-motion={hud.motion} data-buds="5" data-level="subway" data-station={stage} data-goal-distance={hud.distance.toFixed(1)} data-goal-bearing={hud.bearing.toFixed(1)}>
    <div ref={mount} className="viewport" aria-label="3D subway game viewport"/><div className="world-grade"/><div className="world-vignette"/><div className="grain"/>
    {stage !== "COMPLETE" && <div className="hud desktop-hud"><section className="mission"><div className="eyebrow">Current objective</div><h2>{hud.objective}</h2><p>{hud.station}</p></section><div className="compass"><div className="eyebrow">MTA · {hud.station}</div><div className="compass-line"><span>N</span><span className="active">{hud.motion}</span><span>R</span></div></div><div className="status"><div className="eyebrow">Service status</div><strong>{hud.status}</strong></div><div className="meters"><div className="motion-state"><span>{hud.motion}</span><small>Follow black signs · stairs connect every playable level</small></div><div className="meter-row"><span>Train</span><div className="meter-track"><div className="meter-fill" style={{ width: hud.value === "OPEN" ? "100%" : "42%" }}/></div><span>{hud.value}</span></div></div>{hud.prompt && <div className="interaction"><span className="key">{hud.promptKey}</span>{hud.prompt}</div>}<div className="controls-strip"><span>W / A / S / D Walk</span><span>E Interact / Board</span><span>Mouse Look</span></div></div>}
    {stage !== "COMPLETE" && <MobileHud alert={0} buds={5} driving={false} energy={100} hawkPhase="PATROL" motion={hud.motion} objectiveShort={hud.objectiveShort} objectiveValue={`${Math.round(hud.distance)}M`} showMotion={!toast} speed={0} statusLabel="TRAIN" statusValue={hud.value} swimming={false}/>} 
    {stage !== "COMPLETE" && <GoalWayfinder active={stage !== "RIDING"} bearing={hud.bearing} distance={hud.distance} label={hud.waypoint}/>} 
    {stage !== "COMPLETE" && <div className={`crosshair ${hud.prompt ? "targeted" : ""}`}/>} {toast && stage !== "COMPLETE" && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    {stage !== "COMPLETE" && stage !== "RIDING" && <TouchControls arboreal={false} prompt={hud.prompt} showSense={false} vehicle={null}/>} 
    {stage === "COMPLETE" && <section className="screen finale-screen"><div className="pause-card"><div className="eyebrow">Bronx Zoo · Asia Gate</div><h2>Mission complete.</h2><p>You crossed the Ramble, rowed The Lake, navigated two subway stations, and found your friends at the Bronx Zoo.</p><div className="actions"><button className="primary" onClick={() => location.reload()}>Play again <b>↻</b></button></div></div></section>}
  </main>;
}
