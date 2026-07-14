"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GoalWayfinder } from "./GoalWayfinder";
import { MobileHud } from "./mobile/MobileHud";
import { TouchControls } from "./mobile/TouchControls";
import { createSlothRig } from "./player/SlothRig";
import { loadGameTextures } from "./rendering/textures";
import type { AdaptiveQualityManager, PremiumAudioDirector } from "./systems";
import { BronxZooWorld } from "./world/BronxZooWorld";
import { SubwayWorld, type BoardingOption, type SubwayQuality, type SubwayStationId } from "./world/SubwayWorld";
import { TRAIN_INTERIOR_JOURNEYS, TrainInteriorWorld, type TrainInteriorEvent, type TrainInteriorJourney } from "./world/TrainInteriorWorld";

type TransitStage = "FIFTH_AV" | "RIDING" | "LEXINGTON" | "WEST_FARMS" | "BRONX_ZOO" | "COMPLETE";
type TransitHud = { bearing: number; distance: number; motion: string; objective: string; objectiveShort: string; prompt: string; promptKey: string; station: string; status: string; value: string; waypoint: string; wayfinding: boolean };
type SubwayGameProps = { audio: PremiumAudioDirector; quality: AdaptiveQualityManager };

function hasTouchInput() {
  return typeof window !== "undefined" && ((navigator.maxTouchPoints ?? 0) > 0 || "ontouchstart" in window || matchMedia("(pointer: coarse)").matches);
}

function requestLock(canvas: HTMLCanvasElement | null) {
  if (!canvas || typeof canvas.requestPointerLock !== "function" || hasTouchInput()) return;
  try { Promise.resolve(canvas.requestPointerLock()).catch(() => undefined); } catch {}
}

function worldQuality(level: ReturnType<AdaptiveQualityManager["getSnapshot"]>["activeLevel"]): SubwayQuality {
  return level === "low" ? "mobile" : level === "ultra" ? "ultra" : "balanced";
}

export function SubwayGame({ audio, quality }: SubwayGameProps) {
  const mount = useRef<HTMLDivElement>(null), [stage, setStage] = useState<TransitStage>("FIFTH_AV"), [toast, setToast] = useState("Walk down to the mezzanine and collect a MetroCard before entering the platform");
  const [transition, setTransition] = useState("");
  const [touchCapable, setTouchCapable] = useState(false), toastTimer = useRef<number | null>(null);
  const [hud, setHud] = useState<TransitHud>({ bearing: 0, distance: 20, motion: "STREET LEVEL", objective: "Collect a MetroCard from the fare machine", objectiveShort: "METROCARD", prompt: "", promptKey: "", station: "5 AV / 59 ST · 7:12 PM", status: "FARE UNPAID", value: "CARD", waypoint: "Fare machine", wayfinding: true });
  const showToast = useCallback((message: string, duration = 3200) => { if (toastTimer.current !== null) clearTimeout(toastTimer.current); setToast(message); toastTimer.current = window.setTimeout(() => { setToast(""); toastTimer.current = null; }, duration); }, []);

  useEffect(() => {
    const host = mount.current; if (!host) return;
    let transitStage: TransitStage = "FIFTH_AV", currentStation: SubwayStationId = "FIFTH_AV", stationClock = 0, gameTime = 0, actionRequested = false;
    let rideStartedAt = 0, rideUntil = 0, boarded: BoardingOption | null = null, interiorWorld: TrainInteriorWorld | null = null, zooWorld: BronxZooWorld | null = null;
    let lastHud = 0, lastFootstep = 0, yaw = 0, pitch = -.04, dragging = false, lastTouchX = 0, lastTouchY = 0, transitionTimer: number | null = null;
    let previousTrainPhase = "AWAY", previousDoorsOpen = false, previousStreetMix = 1;
    const budget = quality.getRenderBudget(), scene = new THREE.Scene(), interiorColor = new THREE.Color("#303936"), streetColor = new THREE.Color("#8aa9ad"), fogInterior = new THREE.Color("#303936"), fogStreet = new THREE.Color("#b7c7c1"); scene.background = interiorColor.clone(); scene.fog = new THREE.FogExp2("#303936", .009);
    const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, .07, 180); camera.rotation.order = "YXZ";
    const renderer = new THREE.WebGLRenderer({ antialias: budget.antialias, powerPreference: "high-performance" }); renderer.setPixelRatio(budget.pixelRatio); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = budget.shadows; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18; renderer.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(renderer.domElement);
    const textures = loadGameTextures(renderer, () => undefined), subwayDetail = worldQuality(quality.getSnapshot().activeLevel);
    const createStationWorld = () => new SubwayWorld(scene, textures, { quality: subwayDetail });
    let stationWorld: SubwayWorld | null = createStationWorld();
    const player = stationWorld.spawn.clone(), velocity = new THREE.Vector3(), keys = new Set<string>(); previousStreetMix = stationWorld.streetEnvironmentMix(player);
    const sloth = createSlothRig(textures.fur); const layoutSloth = () => { const mobile = innerWidth < 760; sloth.root.scale.setScalar(mobile ? .54 : .72); sloth.left.position.x = mobile ? -.55 : -.84; sloth.right.position.x = mobile ? .55 : .84; sloth.left.position.y = sloth.right.position.y = -.8; }; layoutSloth(); camera.add(sloth.root); scene.add(camera);
    const timer = new THREE.Timer(); timer.connect(document); audio.setScene("subway-station", { transitionSeconds: 1.4, intensity: .58 }); audio.playTransitAnnouncement("fifth_nr_platform", { delaySeconds: .65, dedupeSeconds: 0 });
    const showTransition = (message: string) => { setTransition(message); if (transitionTimer !== null) clearTimeout(transitionTimer); transitionTimer = window.setTimeout(() => { setTransition(""); transitionTimer = null; }, 880); };
    const setTransitStage = (next: TransitStage) => { transitStage = next; setStage(next); };
    const touchLook = (event: Event) => { const detail = (event as CustomEvent<{ dx: number; dy: number }>).detail; if (!detail) return; yaw -= detail.dx * .006; pitch = THREE.MathUtils.clamp(pitch - detail.dy * .005, -1.2, 1.12); };
    const keyDown = (event: KeyboardEvent) => { keys.add(event.code); if (event.code === "KeyE" && !event.repeat) actionRequested = true; if (event.code === "KeyM" && !event.repeat) audio.toggleMuted(); };
    const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const pointerDown = (event: PointerEvent) => { if (event.pointerType === "touch") { dragging = true; lastTouchX = event.clientX; lastTouchY = event.clientY; try { renderer.domElement.setPointerCapture(event.pointerId); } catch {} } else requestLock(renderer.domElement); };
    const pointerMove = (event: PointerEvent) => { if (dragging && event.pointerType === "touch") { yaw -= (event.clientX - lastTouchX) * .006; pitch = THREE.MathUtils.clamp(pitch - (event.clientY - lastTouchY) * .005, -1.2, 1.12); lastTouchX = event.clientX; lastTouchY = event.clientY; } };
    const pointerUp = () => { dragging = false; };
    const mouseMove = (event: MouseEvent) => { if (document.pointerLockElement === renderer.domElement) { yaw -= event.movementX * .0018; pitch = THREE.MathUtils.clamp(pitch - event.movementY * .00155, -1.2, 1.12); } };
    const release = () => { keys.clear(); velocity.set(0, 0, 0); actionRequested = false; dragging = false; };
    const visibilityChange = () => { if (document.hidden) release(); };
    const applyBudget = () => { const next = quality.getRenderBudget(); renderer.setPixelRatio(next.pixelRatio); renderer.shadowMap.enabled = next.shadows; renderer.shadowMap.type = THREE.PCFShadowMap; };
    const unsubscribeQuality = quality.subscribe(applyBudget);
    const resize = () => { quality.refreshDeviceProfile(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyBudget(); renderer.setSize(innerWidth, innerHeight); layoutSloth(); };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerup", pointerUp); renderer.domElement.addEventListener("pointercancel", pointerUp); document.addEventListener("mousemove", mouseMove); document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp); document.addEventListener("sloth-look", touchLook); document.addEventListener("visibilitychange", visibilityChange); window.addEventListener("blur", release); window.addEventListener("resize", resize);

    function disposeInterior() { interiorWorld?.dispose(); interiorWorld = null; }
    function checkpoint(station: SubwayStationId, message: string, waitForNextTrain = false, preserveAnnouncements = false) {
      disposeInterior(); stationWorld ??= createStationWorld(); currentStation = station; stationWorld.setStation(station); player.copy(stationWorld.spawn); velocity.set(0, 0, 0); yaw = 0; pitch = -.04; stationClock = waitForNextTrain ? 18 : 0; boarded = null; previousStreetMix = stationWorld.streetEnvironmentMix(player);
      setTransitStage(station === "FIFTH_AV" ? "FIFTH_AV" : station === "LEXINGTON" ? "LEXINGTON" : "WEST_FARMS"); if (!preserveAnnouncements) audio.cancelTransitAnnouncements(); audio.setScene(station === "WEST_FARMS" ? "west-farms" : "subway-station", { transitionSeconds: 1.15, intensity: .62 }); audio.playTransitAnnouncement(station === "FIFTH_AV" ? "fifth_nr_platform" : station === "LEXINGTON" ? "lex_5_platform" : "west_farms_arrival", { delaySeconds: .45, dedupeSeconds: 0 }); showTransition(station === "FIFTH_AV" ? "5 Av / 59 St" : station === "LEXINGTON" ? "Lexington Av / 59 St" : "West Farms Sq · E Tremont Av"); showToast(message, 4600);
    }
    function finishRide() {
      if (!boarded) return;
      if (!boarded.correct) { audio.playFailure(); checkpoint(currentStation, `Wrong train — checkpoint restored at ${currentStation === "FIFTH_AV" ? "5 Av / 59 St" : "Lexington Av / 59 St"}. Wait for the next correct service.`, true); return; }
      audio.playQuestComplete();
      if (currentStation === "FIFTH_AV") checkpoint("LEXINGTON", "Lexington Av / 59 St — transfer down to the uptown 5 express platform", false, true);
      else checkpoint("WEST_FARMS", "West Farms Sq–E Tremont Av — follow the north exit toward the Bronx Zoo", false, true);
    }
    function failRide(event: Extract<TrainInteriorEvent, { type: "PUSHED_OUT" | "MISSED_STOP" }>) {
      audio.playFailure(); const message = event.type === "PUSHED_OUT" ? `The crowd carried you onto the platform at ${event.stop}. Checkpoint restored — wait for the next train.` : `You missed ${event.stop}. Checkpoint restored — wait for the next train.`; checkpoint(currentStation, message, true);
    }
    function startInterior(option: BoardingOption) {
      if (!stationWorld) return; const base = currentStation === "FIFTH_AV" ? TRAIN_INTERIOR_JOURNEYS.FIFTH_TO_LEXINGTON : TRAIN_INTERIOR_JOURNEYS.LEXINGTON_TO_WEST_FARMS;
      const journey: TrainInteriorJourney = { ...base, route: option.route as TrainInteriorJourney["route"] };
      stationWorld.dispose(); stationWorld = null; interiorWorld = new TrainInteriorWorld(scene, textures, journey, hasTouchInput() || quality.getSnapshot().activeLevel === "low" ? "mobile" : "desktop"); player.copy(interiorWorld.spawn); velocity.set(0, 0, 0); yaw = 0; pitch = -.035; keys.clear(); setTransitStage("RIDING"); audio.setScene("moving-train", { transitionSeconds: .7, intensity: .78 }); audio.playTrainChime("doors-closing"); audio.playTrainDoors("close"); audio.playTransitAnnouncement("stand_clear_doors", { delaySeconds: .35, dedupeSeconds: 4 }); showTransition(`${option.route} train · ${option.direction}`); showToast(currentStation === "FIFTH_AV" ? "Stay clear until Lexington Av. Use any illuminated platform-side door when it appears." : "Stay clear at 86 St, 125 St, and E 180 St. Use any illuminated platform-side door at West Farms.", 6200);
    }
    function boardThroughOpenDoor(option: BoardingOption) {
      if (transitStage === "RIDING") return;
      boarded = option; velocity.set(0, 0, 0);
      if (option.correct) { startInterior(option); return; }
      rideStartedAt = gameTime; rideUntil = gameTime + 5.8; yaw = 0; pitch = -.03; keys.clear(); setTransitStage("RIDING"); audio.setScene("moving-train", { transitionSeconds: .6, intensity: .8 }); showTransition(`${option.route} train · ${option.direction}`); showToast(`Boarded ${option.route} ${option.direction.toLowerCase()} — this is the wrong service`, 3600);
    }
    function enterBronxZoo() {
      if (!stationWorld || transitStage === "BRONX_ZOO" || transitStage === "COMPLETE") return;
      stationWorld.dispose(); stationWorld = null; scene.background = new THREE.Color("#9bb5a0"); scene.fog = new THREE.FogExp2("#b9c7b2", .012); zooWorld = new BronxZooWorld(scene, textures, quality.getSnapshot().profile.foliageDensity); player.copy(zooWorld.spawn); velocity.set(0, 0, 0); yaw = 0; pitch = -.04; sloth.root.visible = true; setTransitStage("BRONX_ZOO"); audio.cancelTransitAnnouncements(); audio.setScene("finale", { transitionSeconds: 1.5, intensity: .74 }); showTransition("Bronx Zoo · Asia Gate"); showToast("Walk through the arrival plaza and speak with the Bronx Zoo attendant to meet your friends.", 5600);
    }
    function completeMission() {
      if (!zooWorld || transitStage !== "BRONX_ZOO") return;
      setTransitStage("COMPLETE"); velocity.set(0, 0, 0); camera.position.copy(zooWorld.cameraPosition); camera.lookAt(zooWorld.cameraTarget); sloth.root.visible = false; audio.setScene("finale", { transitionSeconds: .8, intensity: .92 }); audio.playQuestComplete(); showTransition("Welcome to the Bronx Zoo"); if (document.pointerLockElement) { try { document.exitPointerLock(); } catch {} }
    }
    function handleInteriorEvent(event: TrainInteriorEvent | null) {
      if (!event) return;
      if (event.type === "PUSHED_OUT" || event.type === "MISSED_STOP") { failRide(event); return; }
      if (event.type === "INTERMEDIATE_STOP") { audio.playTrainChime("arrival"); audio.playTrainDoors("open"); audio.playCrowdBed(.9, 3.2); const cue = event.stop.startsWith("86") ? "stop_86" : event.stop.startsWith("125") ? "stop_125" : "stop_e180"; audio.playTransitAnnouncement(cue, { delaySeconds: .25, dedupeSeconds: 4 }); showToast(`${event.stop} — stand back from the doors while passengers exit`, 3600); }
      else if (event.type === "DESTINATION_READY") { audio.playTrainChime("transfer"); audio.playTrainDoors("open"); audio.playTransitAnnouncement(currentStation === "FIFTH_AV" ? "lex_arrival_transfer" : "west_farms_arrival", { delaySeconds: .2, dedupeSeconds: 4 }); showToast(`${event.stop} — use any illuminated platform-side door before it closes`, 4300); }
      else if (event.type === "WRONG_DOOR") showToast("That is not the platform side — follow the illuminated doorway", 2600);
      else if (event.type === "ARRIVED") finishRide();
    }

    const qaInput = ["localhost", "127.0.0.1"].includes(location.hostname) ? new URLSearchParams(location.search).get("qa") : null;
    if (qaInput === "lexington" || qaInput === "trainride5") checkpoint("LEXINGTON", "QA checkpoint · Lexington Av / 59 St");
    else if (["westfarms", "finale"].includes(qaInput ?? "")) checkpoint("WEST_FARMS", "QA checkpoint · West Farms Sq–E Tremont Av");
    if (["subway", "subwayplatform", "lexington"].includes(qaInput ?? "") && stationWorld) { stationClock = 6; stationWorld.update(stationClock); }
    if (["subwayplatform", "lexington"].includes(qaInput ?? "")) {
      // Stand opposite the center doorway so visual QA captures the open,
      // illuminated vestibule instead of the blank side of an adjacent car.
      player.set(-3.72, 1.48, -10); yaw = -Math.PI / 2;
    }
    if (qaInput === "trainride" && stationWorld) startInterior({ correct: true, direction: "QUEENS-BOUND", route: "N", station: "FIFTH_AV" });
    if (qaInput === "trainride5" && stationWorld) startInterior({ correct: true, direction: "UPTOWN / BRONX", route: "5", station: "LEXINGTON" });
    if (qaInput === "finale" && stationWorld) { player.copy(stationWorld.waypoint); actionRequested = true; }

    let raf = 0;
    function frame(timestamp?: number) {
      raf = requestAnimationFrame(frame); if (timestamp !== undefined) quality.reportFrame(timestamp); timer.update(timestamp); const delta = Math.min(timer.getDelta(), .05); gameTime += delta;
      if (transitStage === "RIDING" && interiorWorld) {
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0; if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(1.82), 1 - Math.exp(-delta * (moving ? 10 : 7))); player.addScaledVector(velocity, delta);
        const snapshot = interiorWorld.update(delta, player, velocity); handleInteriorEvent(snapshot.event); if (transitStage !== "RIDING" || !interiorWorld) { renderer.render(scene, camera); return; }
        if (actionRequested) { handleInteriorEvent(interiorWorld.interact(player)); actionRequested = false; }
        const target = snapshot.exitWaypoint, dx = target.x - player.x, dz = target.z - player.z, distance = Math.hypot(dx, dz), ahead = dx * -Math.sin(yaw) + dz * -Math.cos(yaw), side = dx * Math.cos(yaw) - dz * Math.sin(yaw), bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        camera.position.copy(player).add(snapshot.cameraOffset); camera.rotation.set(THREE.MathUtils.clamp(pitch, -.74, .74), yaw, snapshot.cameraRoll); sloth.animate(gameTime, velocity.length(), false);
        if (moving && gameTime - lastFootstep > .46) { lastFootstep = gameTime; audio.playFootstep("metal", Math.min(1, velocity.length() / 1.82)); }
        if (gameTime - lastHud > .1) { lastHud = gameTime; const destinationPhase = snapshot.objective.includes("illuminated"); setHud({ bearing, distance, motion: snapshot.phase === "DWELL" ? "DOORS OPEN" : snapshot.phase === "APPROACHING" ? "BRAKING" : "RIDING", objective: snapshot.objective, objectiveShort: destinationPhase ? "EXIT" : "ON TRAIN", prompt: snapshot.prompt, promptKey: snapshot.prompt ? "E" : "", station: `${boarded?.route ?? interiorWorld.journey.route} · NEXT ${snapshot.stop.toUpperCase()}`, status: snapshot.phase === "DWELL" ? `${snapshot.stop.toUpperCase()} · DOORS OPEN` : snapshot.phase === "APPROACHING" ? `APPROACHING ${snapshot.stop.toUpperCase()}` : `NEXT STOP · ${snapshot.stop.toUpperCase()}`, value: `${snapshot.secondsRemaining}S`, waypoint: destinationPhase ? `${snapshot.destination} exit` : "Center aisle", wayfinding: destinationPhase }); }
      } else if (transitStage === "RIDING" && boarded && stationWorld) {
        const rideDuration = Math.max(.001, rideUntil - rideStartedAt), rideProgress = THREE.MathUtils.clamp((gameTime - rideStartedAt) / rideDuration, 0, 1); stationWorld.updateRide(boarded, rideProgress, gameTime);
        const train = boarded.correct ? stationWorld.correctTrain : stationWorld.wrongTrain, interior = new THREE.Vector3(0, 1.5, .2); train.root.localToWorld(interior); camera.position.copy(interior); camera.rotation.set(THREE.MathUtils.clamp(pitch, -.68, .68), yaw, Math.sin(gameTime * 9) * .003); sloth.animate(gameTime, .2, false);
        if (gameTime - lastHud > .12) { lastHud = gameTime; setHud({ bearing: 0, distance: 0, motion: "WRONG TRAIN", objective: "This service is headed the wrong way", objectiveShort: "WRONG TRAIN", prompt: "", promptKey: "", station: `${boarded.route} · ${boarded.direction}`, status: "CHECKPOINT READY", value: `${Math.max(0, Math.ceil(rideUntil - gameTime))}S`, waypoint: "Return to platform", wayfinding: false }); }
        if (gameTime >= rideUntil) finishRide();
      } else if (transitStage !== "COMPLETE" && stationWorld) {
        stationClock += delta; stationWorld.update(stationClock);
        if (stationWorld.trainPhase !== previousTrainPhase && stationWorld.trainPhase === "APPROACHING") { audio.playTrainArrival(.82); if (currentStation !== "WEST_FARMS") audio.playTransitAnnouncement(currentStation === "FIFTH_AV" ? "fifth_nr_platform" : "lex_5_platform", { delaySeconds: .55, dedupeSeconds: 14 }); }
        if (stationWorld.doorsOpen !== previousDoorsOpen) { audio.playTrainDoors(stationWorld.doorsOpen ? "open" : "close"); if (stationWorld.doorsOpen) { audio.playTrainChime("arrival"); if (currentStation !== "WEST_FARMS") audio.playTransitAnnouncement(currentStation === "FIFTH_AV" ? "fifth_nr_boarding" : "lex_5_boarding", { delaySeconds: .2, dedupeSeconds: 12 }); } else audio.playTrainChime("doors-closing"); }
        previousTrainPhase = stationWorld.trainPhase; previousDoorsOpen = stationWorld.doorsOpen;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0; if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(2.65), 1 - Math.exp(-delta * (moving ? 9 : 6))); player.addScaledVector(velocity, delta); stationWorld.resolvePlayer(player, velocity);
        const streetMix = stationWorld.streetEnvironmentMix(player); (scene.background as THREE.Color).copy(interiorColor).lerp(streetColor, streetMix); if (scene.fog instanceof THREE.FogExp2) { scene.fog.color.copy(fogInterior).lerp(fogStreet, streetMix); scene.fog.density = THREE.MathUtils.lerp(.009, .0048, streetMix); } renderer.toneMappingExposure = THREE.MathUtils.lerp(1.18, 1.32, streetMix);
        if (currentStation === "FIFTH_AV" && previousStreetMix >= .55 && streetMix < .55) { showTransition("5 Av / 59 St mezzanine"); showToast("Fare control ahead — collect a MetroCard at the blue machine, then swipe at a turnstile.", 5200); }
        previousStreetMix = streetMix;
        if (moving && gameTime - lastFootstep > .48) { lastFootstep = gameTime; audio.playFootstep("stone", Math.min(1, velocity.length() / 2.65)); }
        const option = stationWorld.boardingOption(player), boardingHint = stationWorld.boardingHint(player), fareInteraction = stationWorld.interactionHint(player), target = stationWorld.waypoint, targetX = target.x - player.x, targetZ = target.z - player.z, distance = Math.hypot(targetX, targetZ), ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw), side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw), bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        let prompt = "", promptKey = ""; if (fareInteraction) { prompt = fareInteraction.label; promptKey = "E"; } else if (boardingHint) prompt = `WALK THROUGH OPEN ${boardingHint.route} DOORS · ${boardingHint.direction}`; else if (currentStation === "WEST_FARMS" && distance < 4.4) prompt = "WALK UP TO THE BRONX ZOO EXIT";
        // Boarding and the final street exit are spatial actions: once the sloth
        // crosses a physically open doorway, the streamed world changes without
        // an extra button press. E remains available only inside the train as an
        // accessibility fallback for the destination-door timing challenge.
        if (actionRequested && fareInteraction) { const fareEvent = stationWorld.interact(player); if (fareEvent) showToast(fareEvent.message, 4800); }
        if (option) boardThroughOpenDoor(option);
        else if (currentStation === "WEST_FARMS" && distance < 1.45) enterBronxZoo();
        actionRequested = false; if (!stationWorld) { renderer.render(scene, camera); return; }
        camera.position.copy(player); camera.rotation.set(pitch, yaw, 0); sloth.animate(gameTime, velocity.length(), false);
        if (gameTime - lastHud > .12) { lastHud = gameTime; const fifth = currentStation === "FIFTH_AV", lex = currentStation === "LEXINGTON", fareObjective = stationWorld.fareObjective, objective = fareObjective ?? (fifth ? "Take a Queens-bound N or R train one stop" : lex ? "Transfer down to the uptown 5 platform" : "Exit toward the Bronx Zoo"), waypoint = fareObjective ? (fareObjective.startsWith("Collect") ? "Fare machine" : "MetroCard turnstiles") : fifth ? "Queens-bound N / R" : lex ? "Uptown 5 platform" : "Bronx Zoo exit", status = fareObjective ? (fareObjective.startsWith("Collect") ? "FARE UNPAID · GET CARD" : "METROCARD READY · SWIPE") : currentStation === "WEST_FARMS" ? "ANIMAL TRACKS · NORTH EXIT" : stationWorld.doorsOpen ? "DOORS OPEN" : stationWorld.trainPhase === "APPROACHING" ? "TRAIN APPROACHING" : stationWorld.trainPhase === "BOARDING" ? "TRAIN ARRIVED" : `NEXT TRAIN · ${stationWorld.secondsToTrain}s`; setHud({ bearing, distance, motion: streetMix > .62 ? "DESCENDING" : moving ? "WALKING" : "IN STATION", objective, objectiveShort: fareObjective ? (fareObjective.startsWith("Collect") ? "METROCARD" : "SWIPE") : fifth ? "PLATFORM" : lex ? "TRANSFER" : "EXIT", prompt, promptKey, station: fifth ? "5 AV / 59 ST · 7:12 PM" : lex ? "LEXINGTON AV / 59 ST · B4" : "WEST FARMS SQ · E TREMONT AV", status, value: fareObjective ? (fareObjective.startsWith("Collect") ? "CARD" : "SWIPE") : currentStation === "WEST_FARMS" ? `${Math.round(distance)}M` : stationWorld.doorsOpen ? "OPEN" : `${stationWorld.secondsToTrain}S`, waypoint, wayfinding: true }); }
      } else if (transitStage === "BRONX_ZOO" && zooWorld) {
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0; if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(2.5), 1 - Math.exp(-delta * (moving ? 9 : 6))); player.addScaledVector(velocity, delta); zooWorld.resolvePlayer(player, velocity); zooWorld.update(gameTime);
        if (moving && gameTime - lastFootstep > .5) { lastFootstep = gameTime; audio.playFootstep("stone", Math.min(1, velocity.length() / 2.5)); }
        const target = zooWorld.attendantPosition, targetX = target.x - player.x, targetZ = target.z - player.z, distance = Math.hypot(targetX, targetZ), ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw), side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw), bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        const nearby = zooWorld.attendantNearby(player), prompt = nearby ? "SPEAK WITH BRONX ZOO ATTENDANT" : "";
        if (actionRequested && nearby) { completeMission(); actionRequested = false; renderer.render(scene, camera); return; } actionRequested = false;
        camera.position.copy(player); camera.rotation.set(pitch, yaw, 0); sloth.animate(gameTime, velocity.length(), false);
        if (gameTime - lastHud > .12) { lastHud = gameTime; setHud({ bearing, distance, motion: moving ? "WALKING" : "ZOO ARRIVAL", objective: "Meet the Bronx Zoo attendant at Asia Gate", objectiveShort: "WELCOME", prompt, promptKey: prompt ? "E" : "", station: "BRONX ZOO · ASIA GATE", status: nearby ? "ATTENDANT READY" : "FRIENDS AHEAD", value: `${Math.round(distance)}M`, waypoint: "Zoo welcome attendant", wayfinding: true }); }
      } else if (transitStage === "COMPLETE" && zooWorld) zooWorld.update(gameTime);
      renderer.render(scene, camera);
    }
    frame();
    return () => { cancelAnimationFrame(raf); audio.cancelTransitAnnouncements(); if (transitionTimer !== null) clearTimeout(transitionTimer); renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerup", pointerUp); renderer.domElement.removeEventListener("pointercancel", pointerUp); document.removeEventListener("mousemove", mouseMove); document.removeEventListener("keydown", keyDown); document.removeEventListener("keyup", keyUp); document.removeEventListener("sloth-look", touchLook); document.removeEventListener("visibilitychange", visibilityChange); window.removeEventListener("blur", release); window.removeEventListener("resize", resize); unsubscribeQuality(); timer.dispose(); disposeInterior(); stationWorld?.dispose(); zooWorld?.dispose(); renderer.dispose(); if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement); };
  }, [audio, quality, showToast]);

  useEffect(() => { const frame = requestAnimationFrame(() => setTouchCapable(hasTouchInput())); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => () => { if (toastTimer.current !== null) clearTimeout(toastTimer.current); }, []);
  return <main className="game-shell subway-shell" data-game-state={stage === "COMPLETE" ? "complete" : "playing"} data-touch-capable={touchCapable ? "true" : "false"} data-motion={hud.motion} data-buds="5" data-level="subway" data-station={stage} data-loaded-world={stage === "RIDING" ? "train-interior" : stage === "BRONX_ZOO" || stage === "COMPLETE" ? "bronx-zoo" : "subway-station"} data-goal-distance={hud.distance.toFixed(1)} data-goal-bearing={hud.bearing.toFixed(1)}>
    <div ref={mount} className="viewport" aria-label="3D subway game viewport"/><div className="world-grade"/><div className="world-vignette"/><div className="grain"/>
    {transition && <div className="world-transition" role="status"><span>Now entering</span><strong>{transition}</strong><i/></div>}
    {stage !== "COMPLETE" && <div className="hud desktop-hud"><section className="mission"><div className="eyebrow">Current objective</div><h2>{hud.objective}</h2><p>{hud.station}</p></section><div className="compass"><div className="eyebrow">Transit · {hud.station}</div><div className="compass-line"><span>N</span><span className="active">{hud.motion}</span><span>R</span></div></div><div className="status"><div className="eyebrow">Service status</div><strong>{hud.status}</strong></div><div className="meters"><div className="motion-state"><span>{hud.motion}</span><small>{stage === "RIDING" ? "Follow the onboard display · clear doors early · use any illuminated platform-side exit at your stop" : "Follow black signs · collect and swipe your fare card · stairs connect every playable level"}</small></div><div className="meter-row"><span>{stage === "RIDING" ? "Stop" : "Train"}</span><div className="meter-track"><div className="meter-fill" style={{ width: hud.value === "OPEN" ? "100%" : "42%" }}/></div><span>{hud.value}</span></div></div>{hud.prompt && <div className="interaction">{hud.promptKey && <span className="key">{hud.promptKey}</span>}{hud.prompt}</div>}<div className="controls-strip"><span>W / A / S / D Walk</span><span>{stage === "RIDING" ? "Any lit platform-side exit · E fallback" : "E interact · walk through open doors"}</span><span>{stage === "RIDING" ? "Clear doors until your stop" : "Read route + direction"}</span><span>M Sound</span></div></div>}
    {stage !== "COMPLETE" && <MobileHud alert={stage === "RIDING" ? 0 : 8} buds={5} driving={false} energy={100} hawkPhase="PATROL" motion={hud.motion} objectiveShort={hud.objectiveShort} objectiveValue={hud.value} showMotion={false} speed={0} swimming={false}/>}
    {stage !== "COMPLETE" && <GoalWayfinder active={hud.wayfinding} bearing={hud.bearing} distance={hud.distance} label={hud.waypoint}/>}
    {stage !== "COMPLETE" && <div className={`crosshair ${hud.prompt ? "targeted" : ""}`}/>} {toast && stage !== "COMPLETE" && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    {stage !== "COMPLETE" && <TouchControls arboreal={false} prompt={hud.prompt} showSense={false} vehicle={null}/>}
    {stage === "COMPLETE" && <section className="screen finale-screen"><div className="pause-card"><div className="eyebrow">Bronx Zoo · Asia Gate</div><h2>Mission complete.</h2><p>You crossed the Ramble, rowed The Lake, navigated two subway stations, emerged into the Bronx, and checked in with the attendant before reuniting with your friends.</p><div className="actions"><button className="primary" onClick={() => location.reload()}>Play again <b>↻</b></button></div></div></section>}
  </main>;
}
