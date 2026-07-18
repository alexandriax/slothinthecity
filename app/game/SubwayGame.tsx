"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { GoalWayfinder } from "./GoalWayfinder";
import { MobileHud } from "./mobile/MobileHud";
import { TouchControls } from "./mobile/TouchControls";
import { createSlothRig, type SlothVehicleGripTargets } from "./player/SlothRig";
import { loadGameTextures } from "./rendering/textures";
import type { AdaptiveQualityManager, PremiumAudioDirector } from "./systems";
import { DEBUG_LOOK_REQUEST_EVENT, isAutomatedQaSession, requestedGameCheckpoint } from "./debugCheckpoints";
import { BronxZooWorld } from "./world/BronxZooWorld";
import { CentralParkReturnWorld } from "./world/CentralParkReturnWorld";
import { CityBusWorld } from "./world/CityBusWorld";
import { NaturalHistoryMuseumWorld } from "./world/NaturalHistoryMuseumWorld";
import { SlothFollowerParty } from "./world/SlothFollowerParty";
import { SubwayWorld, type BoardingOption, type SubwayQuality, type SubwayStationId, type SubwayTravelDirection } from "./world/SubwayWorld";
import { TRAIN_INTERIOR_JOURNEYS, TrainInteriorWorld, type TrainInteriorEvent, type TrainInteriorJourney } from "./world/TrainInteriorWorld";
import { preloadAuthoredZooAnimals } from "./world/animals/AuthoredZooAnimalAssets";

type TransitStage = "FIFTH_AV" | "RIDING" | "LEXINGTON" | "WEST_FARMS" | "BRONX_ZOO" | "BUS_DRIVE" | "MUSEUM" | "RETURN_WEST_FARMS" | "RETURN_LEXINGTON" | "RETURN_FIFTH_AV" | "CENTRAL_PARK" | "COMPLETE";
type TransitHud = { bearing: number; distance: number; motion: string; objective: string; objectiveShort: string; prompt: string; promptKey: string; station: string; status: string; value: string; waypoint: string; wayfinding: boolean };
type SubwayGameProps = { audio: PremiumAudioDirector; quality: AdaptiveQualityManager };

function hasTouchInput() {
  return typeof window !== "undefined" && ((navigator.maxTouchPoints ?? 0) > 0 || "ontouchstart" in window || matchMedia("(pointer: coarse)").matches);
}

function requestLock(canvas: HTMLCanvasElement | null) {
  if (!canvas || typeof canvas.requestPointerLock !== "function" || hasTouchInput() || isAutomatedQaSession(location.search, location.hostname)) return;
  try { Promise.resolve(canvas.requestPointerLock()).catch(() => undefined); } catch {}
}

function worldQuality(level: ReturnType<AdaptiveQualityManager["getSnapshot"]>["activeLevel"]): SubwayQuality {
  return level === "low" || level === "medium" ? "mobile" : level === "ultra" ? "ultra" : "balanced";
}

export function SubwayGame({ audio, quality }: SubwayGameProps) {
  const mount = useRef<HTMLDivElement>(null), [stage, setStage] = useState<TransitStage>("FIFTH_AV"), [toast, setToast] = useState("Walk down to the mezzanine and collect a MetroCard before entering the platform");
  const [transition, setTransition] = useState("");
  const [zooPhase, setZooPhase] = useState("OUTBOUND");
  const [ticketHeld, setTicketHeld] = useState(false);
  const [followerCount, setFollowerCount] = useState(0);
  const [returnLeg, setReturnLeg] = useState("OUTBOUND");
  const [vehicleSpeed, setVehicleSpeed] = useState(0);
  const [touchCapable, setTouchCapable] = useState(false), toastTimer = useRef<number | null>(null);
  const [mouseCaptured, setMouseCaptured] = useState(false);
  const [pointerLockAvailable] = useState(() => typeof window !== "undefined" && !hasTouchInput() && typeof HTMLCanvasElement.prototype.requestPointerLock === "function" && matchMedia("(pointer: fine)").matches && !isAutomatedQaSession(location.search, location.hostname));
  const [hud, setHud] = useState<TransitHud>({ bearing: 0, distance: 20, motion: "STREET LEVEL", objective: "Collect a MetroCard from the fare machine", objectiveShort: "METROCARD", prompt: "", promptKey: "", station: "5 AV / 59 ST · 7:12 PM", status: "FARE UNPAID", value: "CARD", waypoint: "Fare machine", wayfinding: true });
  const showToast = useCallback((message: string, duration = 3200) => { if (toastTimer.current !== null) clearTimeout(toastTimer.current); setToast(message); toastTimer.current = window.setTimeout(() => { setToast(""); toastTimer.current = null; }, duration); }, []);

  useEffect(() => {
    const host = mount.current; if (!host) return;
    let transitStage: TransitStage = "FIFTH_AV", currentStation: SubwayStationId = "FIFTH_AV", travelDirection: SubwayTravelDirection = "OUTBOUND", stationClock = 0, gameTime = 0, actionRequested = false;
    let boarded: BoardingOption | null = null, interiorWorld: TrainInteriorWorld | null = null, zooWorld: BronxZooWorld | null = null, cityBusWorld: CityBusWorld | null = null, museumWorld: NaturalHistoryMuseumWorld | null = null, parkReturnWorld: CentralParkReturnWorld | null = null;
    let lastHud = 0, lastFootstep = 0, yaw = 0, pitch = -.04, dragging = false, lastTouchX = 0, lastTouchY = 0, transitionTimer: number | null = null;
    let previousTrainPhase = "AWAY", previousDoorsOpen = false, previousStreetMix = 1;
    let museumCompletionArmed = true;
    const budget = quality.getRenderBudget(), scene = new THREE.Scene(), interiorColor = new THREE.Color("#303936"), streetColor = new THREE.Color("#8aa9ad"), fogInterior = new THREE.Color("#303936"), fogStreet = new THREE.Color("#b7c7c1"); scene.background = interiorColor.clone(); scene.fog = new THREE.FogExp2("#303936", .009);
    const camera = new THREE.PerspectiveCamera(67, innerWidth / innerHeight, .07, 480); camera.rotation.order = "YXZ";
    const renderer = new THREE.WebGLRenderer({ antialias: budget.antialias, powerPreference: "high-performance" }); renderer.setPixelRatio(budget.pixelRatio); renderer.setSize(innerWidth, innerHeight); renderer.shadowMap.enabled = budget.shadows; renderer.shadowMap.type = THREE.PCFShadowMap; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.18; renderer.outputColorSpace = THREE.SRGBColorSpace; host.appendChild(renderer.domElement);
    let composer: EffectComposer | null = null;
    if (budget.postProcessing && innerWidth * innerHeight < 1_750_000) {
      composer = new EffectComposer(renderer);
      composer.setPixelRatio(budget.pixelRatio);
      composer.addPass(new RenderPass(scene, camera));
      const gtao = new GTAOPass(scene, camera, innerWidth, innerHeight);
      gtao.blendIntensity = .58;
      composer.addPass(gtao);
      composer.addPass(new OutputPass());
    }
    const renderFrame = () => { if (composer) composer.render(); else renderer.render(scene, camera); };
    const textures = loadGameTextures(renderer, () => undefined), subwayDetail = worldQuality(quality.getSnapshot().activeLevel);
    const createStationWorld = (initialStation: SubwayStationId = "FIFTH_AV", direction: SubwayTravelDirection = travelDirection) => new SubwayWorld(scene, textures, { quality: subwayDetail, initialStation, travelDirection: direction });
    let stationWorld: SubwayWorld | null = createStationWorld();
    let subwayProgress = stationWorld.progressState;
    const player = stationWorld.spawn.clone(), playerBeforeMovement = new THREE.Vector3(), velocity = new THREE.Vector3(), keys = new Set<string>(); previousStreetMix = stationWorld.streetEnvironmentMix(player);
    const sloth = createSlothRig(textures.fur); const layoutSloth = () => { const mobile = innerWidth < 760; sloth.root.scale.setScalar(mobile ? .54 : .72); sloth.left.position.x = mobile ? -.55 : -.84; sloth.right.position.x = mobile ? .55 : .84; sloth.left.position.y = sloth.right.position.y = -.8; }; layoutSloth(); camera.add(sloth.root); scene.add(camera);
    const busGripWorld: SlothVehicleGripTargets = { left: new THREE.Vector3(), right: new THREE.Vector3() };
    const busGripCamera: SlothVehicleGripTargets = { left: new THREE.Vector3(), right: new THREE.Vector3() };
    const rescuedParty = new SlothFollowerParty(scene, textures, quality.getSnapshot().profile.foliageDensity);
    const timer = new THREE.Timer(); timer.connect(document); audio.setScene("subway-station", { transitionSeconds: 1.4, intensity: .58 });
    const showTransition = (message: string) => { setTransition(message); if (transitionTimer !== null) clearTimeout(transitionTimer); transitionTimer = window.setTimeout(() => { setTransition(""); transitionTimer = null; }, 880); };
    const setTransitStage = (next: TransitStage) => { transitStage = next; setStage(next); };
    const reflectRescueState = (phase: "ESCORT_TO_BUS" | "BUS_DRIVE" | "MUSEUM" | "RETURN_TRANSIT") => { setFollowerCount(rescuedParty.count); setTicketHeld(true); setZooPhase(phase); };
    const clearReviewToast = () => showToast("", 0);
    const reflectZooReviewState = (world: BronxZooWorld) => {
      const target = world.objectiveTarget, dx = target.x - player.x, dz = target.z - player.z, distance = Math.hypot(dx, dz), hint = world.interactionHint(player), quest = world.questState, released = world.friendsReleased;
      setZooPhase(quest); setTicketHeld(world.hasTicket); setFollowerCount(released ? rescuedParty.count : 0);
      const objective = released ? "Lead all four friends out of the zoo and board the museum shuttle" : world.objectiveLabel;
      setHud({ bearing: THREE.MathUtils.radToDeg(Math.atan2(dx * Math.cos(yaw) - dz * Math.sin(yaw), dx * -Math.sin(yaw) + dz * -Math.cos(yaw))), distance, motion: released ? "SLOTH RESCUE" : "ZOO EXPLORATION", objective, objectiveShort: quest === "NEED_TICKET" ? "FIND TICKET" : quest === "ENTER_ZOO" ? "ENTER ZOO" : quest === "FIND_SLOTHS" ? "FIND SLOTHS" : "SHUTTLE BUS", prompt: hint?.label ?? "", promptKey: hint ? "E" : "", station: released ? "BRONX ZOO · MUSEUM SHUTTLE STOP" : "BRONX ZOO · WILDLIFE CONSERVATION CAMPUS", status: quest === "NEED_TICKET" ? "ADMISSION REQUIRED" : quest === "ENTER_ZOO" ? "EXTRA TICKET READY" : quest === "FIND_SLOTHS" ? "EXPLORE THE HABITATS" : "FOUR FRIENDS · BOARD TOGETHER", value: `${Math.round(distance)}M`, waypoint: quest === "NEED_TICKET" ? "Visitor with extra ticket" : quest === "ENTER_ZOO" ? "Asia Gate" : quest === "FIND_SLOTHS" ? "Sloth conservation habitat" : "Natural History Museum shuttle", wayfinding: true });
    };
    const touchLook = (event: Event) => { const detail = (event as CustomEvent<{ dx: number; dy: number }>).detail; if (!detail) return; yaw -= detail.dx * .006; pitch = THREE.MathUtils.clamp(pitch - detail.dy * .005, -1.2, 1.12); };
    const keyDown = (event: KeyboardEvent) => { keys.add(event.code); if (event.code === "KeyE" && !event.repeat) actionRequested = true; if (event.code === "KeyM" && !event.repeat) audio.toggleMuted(); };
    const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const pointerDown = (event: PointerEvent) => { if (event.pointerType === "touch") { dragging = true; lastTouchX = event.clientX; lastTouchY = event.clientY; try { renderer.domElement.setPointerCapture(event.pointerId); } catch {} } else requestLock(renderer.domElement); };
    const pointerMove = (event: PointerEvent) => { if (dragging && event.pointerType === "touch") { yaw -= (event.clientX - lastTouchX) * .006; pitch = THREE.MathUtils.clamp(pitch - (event.clientY - lastTouchY) * .005, -1.2, 1.12); lastTouchX = event.clientX; lastTouchY = event.clientY; } };
    const pointerUp = () => { dragging = false; };
    const mouseMove = (event: MouseEvent) => { if (document.pointerLockElement === renderer.domElement) { yaw -= event.movementX * .0018; pitch = THREE.MathUtils.clamp(pitch - event.movementY * .00155, -1.2, 1.12); } };
    const release = () => { keys.clear(); velocity.set(0, 0, 0); actionRequested = false; dragging = false; };
    const pointerLockChanged = () => { const captured = document.pointerLockElement === renderer.domElement; setMouseCaptured(captured); if (!captured) release(); };
    const requestDebugLook = () => requestLock(renderer.domElement);
    const visibilityChange = () => { if (document.hidden) release(); };
    const applyBudget = () => { const next = quality.getRenderBudget(); renderer.setPixelRatio(next.pixelRatio); renderer.shadowMap.enabled = next.shadows; renderer.shadowMap.type = THREE.PCFShadowMap; if (composer) { composer.setPixelRatio(next.pixelRatio); composer.setSize(innerWidth, innerHeight); } };
    const unsubscribeQuality = quality.subscribe(applyBudget);
    const resize = () => { quality.refreshDeviceProfile(); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyBudget(); renderer.setSize(innerWidth, innerHeight); composer?.setSize(innerWidth, innerHeight); layoutSloth(); };
    renderer.domElement.addEventListener("pointerdown", pointerDown); renderer.domElement.addEventListener("pointermove", pointerMove); renderer.domElement.addEventListener("pointerup", pointerUp); renderer.domElement.addEventListener("pointercancel", pointerUp); document.addEventListener("mousemove", mouseMove); document.addEventListener("keydown", keyDown); document.addEventListener("keyup", keyUp); document.addEventListener("sloth-look", touchLook); document.addEventListener(DEBUG_LOOK_REQUEST_EVENT, requestDebugLook); document.addEventListener("pointerlockchange", pointerLockChanged); document.addEventListener("visibilitychange", visibilityChange); window.addEventListener("blur", release); window.addEventListener("resize", resize);

    function disposeInterior() { interiorWorld?.dispose(); interiorWorld = null; }
    function checkpoint(station: SubwayStationId, message: string, waitForNextTrain = false, preserveAnnouncements = false, resumeAtPlatform = false) {
      disposeInterior(); if (stationWorld) subwayProgress = stationWorld.progressState; stationWorld ??= createStationWorld(station, travelDirection); currentStation = station; stationWorld.setStation(station, travelDirection).restoreProgressState(subwayProgress); player.copy(stationWorld.checkpointSpawn(resumeAtPlatform)); velocity.set(0, 0, 0); yaw = 0; pitch = -.04; stationClock = waitForNextTrain ? 18 : 0; boarded = null; stationWorld.update(stationClock); previousTrainPhase = stationWorld.trainPhase; previousDoorsOpen = stationWorld.doorsOpen; previousStreetMix = stationWorld.streetEnvironmentMix(player);
      const nextStage: TransitStage = travelDirection === "RETURN"
        ? station === "FIFTH_AV" ? "RETURN_FIFTH_AV" : station === "LEXINGTON" ? "RETURN_LEXINGTON" : "RETURN_WEST_FARMS"
        : station === "FIFTH_AV" ? "FIFTH_AV" : station === "LEXINGTON" ? "LEXINGTON" : "WEST_FARMS";
      setTransitStage(nextStage); setReturnLeg(travelDirection === "RETURN" ? station : "OUTBOUND");
      // Publish the checkpoint's real service immediately. Debug jumps and
      // streamed station arrivals must never flash the previous leg's route
      // while the first animation frame and texture uploads are settling.
      const fifth = station === "FIFTH_AV", lex = station === "LEXINGTON", returning = travelDirection === "RETURN", fareObjective = stationWorld.fareObjective, arrivingRoute = stationWorld.arrivingService.route;
      const target = stationWorld.waypoint, targetX = target.x - player.x, targetZ = target.z - player.z, distance = Math.hypot(targetX, targetZ);
      const objective = fareObjective ?? (returning ? fifth ? "Exit at Fifth Avenue and lead your friends into Central Park" : lex ? `Transfer here to a downtown ${arrivingRoute} train for Fifth Avenue` : "Take the downtown 5 to Lexington Av; transfer to N / R there" : fifth ? `Take the Queens-bound ${arrivingRoute} train one stop` : lex ? "Choose the uptown 5 platform from the paid concourse" : "Exit toward the Bronx Zoo");
      const waypoint = fareObjective ? (fareObjective.startsWith("Collect") ? "Fare machine" : "MetroCard turnstiles") : returning ? fifth ? "Central Park street exit" : lex ? `Separate Broadway platform · downtown ${arrivingRoute}` : "Downtown 5 platform · opposite arrival side" : fifth ? `Queens-bound ${arrivingRoute}` : lex ? "Lexington Line platform · uptown 5" : "Bronx Zoo exit";
      const routeStatus = `${arrivingRoute} TRAIN`, status = fareObjective ? (fareObjective.startsWith("Collect") ? "FARE UNPAID · GET CARD" : "METROCARD READY · SWIPE") : returning && fifth ? "CENTRAL PARK · STREET EXIT" : !returning && station === "WEST_FARMS" ? "ANIMAL TRACKS · NORTH EXIT" : stationWorld.doorsOpen ? `${routeStatus} · DOORS OPEN` : stationWorld.trainPhase === "APPROACHING" ? `${routeStatus} APPROACHING` : stationWorld.trainPhase === "BOARDING" ? `${routeStatus} ARRIVED` : `NEXT ${routeStatus} · ${stationWorld.secondsToTrain}s`;
      setHud({ bearing: 0, distance, motion: returning && fifth ? "ASCENDING" : "IN STATION", objective, objectiveShort: fareObjective ? (fareObjective.startsWith("Collect") ? "METROCARD" : "SWIPE") : returning ? fifth ? "PARK EXIT" : lex ? "TRANSFER" : "DOWNTOWN 5" : fifth ? arrivingRoute : lex ? "TRANSFER" : "EXIT", prompt: "", promptKey: "", station: fifth ? returning ? "5 AV / 59 ST · RETURN" : "5 AV / 59 ST · UPTOWN TRIP" : lex ? "LEXINGTON AV / 59 ST · PAID CONCOURSE" : "WEST FARMS SQ · E TREMONT AV", status, value: fareObjective ? (fareObjective.startsWith("Collect") ? "CARD" : "SWIPE") : returning && fifth || !returning && station === "WEST_FARMS" ? `${Math.round(distance)}M` : stationWorld.doorsOpen ? "OPEN" : `${stationWorld.secondsToTrain}S`, waypoint, wayfinding: true });
      if (rescuedParty.isActive) rescuedParty.reset(player, player.y - 1.48);
      if (!preserveAnnouncements) audio.cancelTransitAnnouncements(); audio.setScene(station === "WEST_FARMS" ? "west-farms" : "subway-station", { transitionSeconds: 1.15, intensity: travelDirection === "RETURN" ? .72 : .62 }); if (station !== "FIFTH_AV" && travelDirection === "OUTBOUND") audio.playTransitAnnouncement(station === "LEXINGTON" ? "lex_5_platform" : "west_farms_arrival", { delaySeconds: .45, dedupeSeconds: 0 }); showTransition(station === "FIFTH_AV" ? "5 Av / 59 St" : station === "LEXINGTON" ? "Lexington Av / 59 St" : "West Farms Sq · E Tremont Av"); showToast(message, 4600);
    }
    function finishRide() {
      if (!boarded?.destination) return;
      audio.playQuestComplete();
      const destination = boarded.destination;
      const message = destination === "LEXINGTON"
        ? travelDirection === "RETURN"
          ? "Lexington Av / 59 St — keep your friends close and take a downtown N or R train for Fifth Avenue"
          : "Lexington Av / 59 St — take the uptown 5 for the Bronx, or a downtown N / R to ride back to Fifth Avenue"
        : destination === "WEST_FARMS"
          ? travelDirection === "RETURN"
            ? "West Farms Sq–E Tremont Av — the downtown 5 returns to Manhattan whenever you are ready"
            : "West Farms Sq–E Tremont Av — follow the north exit toward the Bronx Zoo, or ride the downtown 5 back"
          : travelDirection === "RETURN"
            ? "5 Av / 59 St — lead the rescued sloths up the street stairs and back into Central Park"
            : "5 Av / 59 St — take a Queens-bound N or R to continue toward the Bronx"
      checkpoint(destination, message, false, true, destination !== "LEXINGTON");
    }
    function failRide(event: Extract<TrainInteriorEvent, { type: "PUSHED_OUT" | "MISSED_STOP" }>) {
      audio.playFailure(); const message = event.type === "PUSHED_OUT" ? `The crowd carried you and the rescued group onto the platform at ${event.stop}. Checkpoint restored — wait for the next train.` : `You missed ${event.stop}. Checkpoint restored — wait for the next train.`; checkpoint(currentStation, message, true, false, true);
    }
    function startInterior(option: BoardingOption) {
      if (!stationWorld || !option.journeyKey || !option.destination) return;
      if (option.journeyKey === "LEXINGTON_TO_WEST_FARMS") {
        const animalQuality = quality.getSnapshot().profile.foliageDensity;
        void preloadAuthoredZooAnimals([
          { species: "gary-polar-bear", quality: animalQuality },
          { species: "spider-monkey", quality: animalQuality },
          { species: "california-sea-lion", quality: animalQuality },
          { species: "sun-conure", quality: animalQuality },
        ]).catch(() => undefined);
      }
      const base = TRAIN_INTERIOR_JOURNEYS[option.journeyKey];
      const journey: TrainInteriorJourney = { ...base, route: option.route as TrainInteriorJourney["route"] };
      subwayProgress = stationWorld.progressState; stationWorld.dispose(); stationWorld = null; interiorWorld = new TrainInteriorWorld(scene, textures, journey, quality.getSnapshot().activeLevel === "low" || quality.getSnapshot().activeLevel === "medium" ? "mobile" : "desktop"); player.copy(interiorWorld.spawn); velocity.set(0, 0, 0); yaw = 0; pitch = -.035; keys.clear(); setTransitStage("RIDING"); audio.setScene("moving-train", { transitionSeconds: .7, intensity: .78 }); audio.playTrainChime("doors-closing"); audio.playTrainDoors("close"); audio.playTransitAnnouncement("stand_clear_doors", { delaySeconds: .35, dedupeSeconds: 4 }); showTransition(`${option.route} train · ${option.direction}`);
      const rideMessage = option.journeyKey === "FIFTH_TO_LEXINGTON"
        ? "Ride one stop to Lexington Avenue. Use any illuminated platform-side door when it appears."
        : option.journeyKey === "LEXINGTON_TO_WEST_FARMS"
          ? "Stay clear at 86 St, 125 St, and E 180 St. Exit at West Farms for the Bronx Zoo."
          : option.journeyKey === "WEST_FARMS_TO_LEXINGTON"
            ? "Keep the rescued sloths together through E 180 St, 125 St, and 86 St, then exit at Lexington Avenue."
            : "Ride one stop downtown and exit with every friend at Fifth Avenue for Central Park.";
      const nextStop = journey.intermediateStops[0]?.name ?? journey.destination.name;
      setHud({ bearing: 0, distance: 0, motion: "RIDING", objective: rideMessage, objectiveShort: "ON TRAIN", prompt: "", promptKey: "", station: `${option.route} · NEXT ${nextStop.toUpperCase()}`, status: `NEXT STOP · ${nextStop.toUpperCase()}`, value: "ONBOARD", waypoint: "Center aisle", wayfinding: false });
      showToast(rideMessage, 6200);
      if (rescuedParty.isActive) rescuedParty.reset(player, 0);
    }
    function boardThroughOpenDoor(option: BoardingOption) {
      if (transitStage === "RIDING") return;
      if (!option.journeyKey || !option.destination) {
        player.copy(playerBeforeMovement); velocity.set(0, 0, 0);
        showToast(`${option.route} ${option.direction.toLowerCase()} continues beyond this playable route. Cross to the signed platform for the next in-city stop.`, 4200);
        return;
      }
      boarded = option; velocity.set(0, 0, 0); startInterior(option);
    }
    function enterBronxZoo() {
      if (!stationWorld || transitStage === "BRONX_ZOO" || transitStage === "COMPLETE") return null;
      subwayProgress = stationWorld.progressState; stationWorld.dispose(); stationWorld = null; scene.background = new THREE.Color("#8fa694"); scene.fog = new THREE.FogExp2("#a9bba6", .0045); zooWorld = new BronxZooWorld(scene, textures, quality.getSnapshot().profile.foliageDensity); player.copy(zooWorld.spawn); velocity.set(0, 0, 0); yaw = 0; pitch = -.04; sloth.root.visible = true; sloth.setVehiclePose("none"); setTransitStage("BRONX_ZOO"); setZooPhase("NEED_TICKET"); audio.cancelTransitAnnouncements(); audio.setScene("finale", { transitionSeconds: 1.5, intensity: .74 }); showTransition("Bronx Zoo · Asia Gate"); showToast("The entrance is ticketed. Find the visitor outside who mentioned having a spare admission ticket.", 6200);
      const target = zooWorld.objectiveTarget, distance = Math.hypot(target.x - player.x, target.z - player.z);
      setTicketHeld(false); setFollowerCount(0); setHud({ bearing: 0, distance, motion: "ZOO EXPLORATION", objective: zooWorld.objectiveLabel, objectiveShort: "FIND TICKET", prompt: "", promptKey: "", station: "BRONX ZOO · WILDLIFE CONSERVATION CAMPUS", status: "ADMISSION REQUIRED", value: `${Math.round(distance)}M`, waypoint: "Visitor with extra ticket", wayfinding: true });
      return zooWorld;
    }
    function startBusDrive(startProgress = 0) {
      if (!rescuedParty.isActive || transitStage === "COMPLETE") return null;
      if (zooWorld) { zooWorld.dispose(); zooWorld = null; }
      if (stationWorld) { subwayProgress = stationWorld.progressState; stationWorld.dispose(); stationWorld = null; }
      disposeInterior();
      cityBusWorld?.dispose();
      cityBusWorld = new CityBusWorld(scene, textures, quality.getSnapshot().profile.foliageDensity, startProgress);
      scene.background = new THREE.Color("#91a6aa"); scene.fog = new THREE.FogExp2("#8d9c9e", .0032); renderer.toneMappingExposure = 1.28; camera.far = 540; camera.updateProjectionMatrix();
      player.copy(cityBusWorld.cameraPosition); velocity.set(0, 0, 0); yaw = 0; pitch = -.04; keys.clear(); rescuedParty.root.visible = false; sloth.root.visible = true;
      setTransitStage("BUS_DRIVE"); setReturnLeg("MUSEUM_SHUTTLE"); reflectRescueState("BUS_DRIVE"); setVehicleSpeed(0);
      audio.cancelTransitAnnouncements(); audio.setScene("moving-train", { transitionSeconds: 1.2, intensity: .8 }); audio.setCartMotor(true, 0);
      showTransition("Museum shuttle · Bronx to Manhattan"); showToast("All four sloths are aboard. W drives forward; S brakes, then reverses once stopped. A / D steer, Space is the handbrake, and the dashboard repeats the active traffic light.", 8200);
      setHud({ bearing: 0, distance: cityBusWorld.remainingMeters, motion: "DRIVING", objective: cityBusWorld.navigationInstruction, objectiveShort: "DRIVE TO AMNH", prompt: "", promptKey: "", station: "SOUTHERN BOULEVARD · MUSEUM SHUTTLE", status: "ALL FOUR FRIENDS ABOARD", value: `${Math.round(cityBusWorld.remainingMeters)}M`, waypoint: cityBusWorld.navigationInstruction, wayfinding: true });
      return cityBusWorld;
    }
    function enterMuseum(review: "entry" | "rotunda" | "megatherium" = "entry") {
      if (transitStage === "COMPLETE") return null;
      if (cityBusWorld) { cityBusWorld.dispose(); cityBusWorld = null; }
      if (stationWorld) { subwayProgress = stationWorld.progressState; stationWorld.dispose(); stationWorld = null; }
      if (zooWorld) { zooWorld.dispose(); zooWorld = null; }
      disposeInterior(); audio.setCartMotor(false); setVehicleSpeed(0); sloth.setVehiclePose("none");
      museumWorld?.dispose(); museumWorld = new NaturalHistoryMuseumWorld(scene, textures, quality.getSnapshot().profile.foliageDensity);
      const presentation = museumWorld.environmentSettings;
      scene.background = new THREE.Color(presentation.background); scene.fog = new THREE.FogExp2(presentation.fog, presentation.fogDensity); renderer.toneMappingExposure = presentation.toneMappingExposure; camera.far = presentation.cameraFar; camera.updateProjectionMatrix();
      player.copy(museumWorld.spawn);
      if (review === "rotunda") player.set(0, 1.48, 15);
      else if (review === "megatherium") player.set(12, 1.48, -178);
      museumCompletionArmed = review !== "megatherium";
      velocity.set(0, 0, 0); yaw = review === "megatherium" ? .52 : museumWorld.spawnYaw; pitch = review === "megatherium" ? .18 : -.04; rescuedParty.root.visible = true; rescuedParty.reset(player, museumWorld.floorHeight()); sloth.root.visible = true;
      setTransitStage("MUSEUM"); setReturnLeg("NATURAL_HISTORY_MUSEUM"); reflectRescueState("MUSEUM"); audio.setScene("finale", { transitionSeconds: 1.5, intensity: .82 });
      showTransition(review === "megatherium" ? "Fossil Mammal Halls · Floor 4" : "American Museum of Natural History");
      showToast("Bring every friend through the museum and find Megatherium americanum, the giant ground sloth, in the Fossil Mammal Halls.", 7200);
      const distance = Math.hypot(museumWorld.megatheriumTarget.x - player.x, museumWorld.megatheriumTarget.z - player.z);
      setHud({ bearing: 0, distance, motion: "MUSEUM EXPLORATION", objective: museumWorld.objectiveLabel, objectiveShort: "MEGATHERIUM", prompt: "", promptKey: "", station: "AMNH · THEODORE ROOSEVELT ROTUNDA", status: "FOUR FRIENDS FOLLOWING", value: `${Math.round(distance)}M`, waypoint: "Megatherium · Fossil Mammal Halls", wayfinding: true });
      return museumWorld;
    }
    function completeMission() {
      if (!museumCompletionArmed || !museumWorld || transitStage !== "MUSEUM" || !museumWorld.megatheriumNearby(player) || !rescuedParty.allWithin(museumWorld.megatheriumTarget, 9.5)) return;
      setTransitStage("COMPLETE"); setZooPhase("COMPLETE"); velocity.set(0, 0, 0); rescuedParty.stageFinale(museumWorld.megatheriumTarget, () => museumWorld?.floorHeight() ?? 0); camera.position.copy(museumWorld.cameraPosition); camera.lookAt(museumWorld.cameraTarget); sloth.root.visible = false; audio.setScene("finale", { transitionSeconds: .8, intensity: .98 }); audio.playQuestComplete(); showTransition("Megatherium · Friends reunited with history"); if (document.pointerLockElement) { try { document.exitPointerLock(); } catch {} }
    }
    function enterCentralPark() {
      if (!stationWorld || travelDirection !== "RETURN" || currentStation !== "FIFTH_AV") return null;
      stationWorld.dispose(); stationWorld = null; parkReturnWorld = new CentralParkReturnWorld(scene, textures, quality.getSnapshot().profile.foliageDensity);
      const presentation = parkReturnWorld.environmentSettings;
      scene.background = new THREE.Color(presentation.background); scene.fog = new THREE.FogExp2(presentation.fog, presentation.fogDensity); renderer.toneMappingExposure = presentation.toneMappingExposure; camera.far = presentation.cameraFar; camera.updateProjectionMatrix();
      player.copy(parkReturnWorld.spawn); velocity.set(0, 0, 0); yaw = parkReturnWorld.spawnYaw; pitch = -.04; rescuedParty.reset(player, parkReturnWorld.floorHeight(player.x, player.z)); setTransitStage("CENTRAL_PARK"); setReturnLeg("CENTRAL_PARK"); setZooPhase("HOME_GROVE"); audio.setScene("central-park", { transitionSeconds: 1.5, intensity: .82 }); showTransition("Central Park · Home Grove"); showToast("You made it back. Bring every rescued sloth to the grove beside the trees where your journey began.", 6200);
      const distance = Math.hypot(parkReturnWorld.sanctuaryTarget.x - player.x, parkReturnWorld.sanctuaryTarget.z - player.z);
      setHud({ bearing: 0, distance, motion: "HOMEWARD", objective: "Bring all four rescued sloths to the Home Grove", objectiveShort: "HOME GROVE", prompt: "", promptKey: "", station: "CENTRAL PARK · HOME GROVE", status: "FOUR FRIENDS FOLLOWING", value: `${Math.round(distance)}M`, waypoint: "Home Grove sanctuary", wayfinding: true });
      return parkReturnWorld;
    }
    function completeHomeMission() {
      if (!parkReturnWorld || transitStage !== "CENTRAL_PARK" || !rescuedParty.allWithin(parkReturnWorld.sanctuaryTarget, 9.5)) return;
      setTransitStage("COMPLETE"); setZooPhase("COMPLETE"); velocity.set(0, 0, 0); rescuedParty.stageFinale(parkReturnWorld.sanctuaryTarget, (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0); camera.position.copy(parkReturnWorld.cameraPosition); camera.lookAt(parkReturnWorld.cameraTarget); sloth.root.visible = false; audio.setScene("finale", { transitionSeconds: .8, intensity: .96 }); audio.playQuestComplete(); showTransition("Central Park · Friends home"); if (document.pointerLockElement) { try { document.exitPointerLock(); } catch {} }
    }
    function handleInteriorEvent(event: TrainInteriorEvent | null) {
      if (!event) return;
      if (event.type === "PUSHED_OUT" || event.type === "MISSED_STOP") { failRide(event); return; }
      if (event.type === "INTERMEDIATE_STOP") {
        audio.playTrainChime("arrival"); audio.playTrainDoors("open"); audio.playCrowdBed(.9, 3.2);
        const returnCue = event.stop.startsWith("86") ? "southbound_5_86" : event.stop.startsWith("125") ? "southbound_5_125" : "southbound_5_e180";
        const outboundCue = event.stop.startsWith("86") ? "stop_86" : event.stop.startsWith("125") ? "stop_125" : "stop_e180";
        audio.playTransitAnnouncement(boarded?.journeyKey === "WEST_FARMS_TO_LEXINGTON" ? returnCue : outboundCue, { delaySeconds: .25, dedupeSeconds: 4 });
        showToast(`${event.stop} — next stop ${event.nextStop}. Stand back while passengers exit.`, 4200);
      }
      else if (event.type === "DESTINATION_READY") {
        audio.playTrainChime("transfer"); audio.playTrainDoors("open");
        let destinationCallout = `${event.stop} — use any illuminated platform-side door and make sure every sloth exits with you`;
        if (boarded?.journeyKey === "FIFTH_TO_LEXINGTON") audio.playTransitAnnouncement("lex_arrival_transfer", { delaySeconds: .2, dedupeSeconds: 4 });
        else if (boarded?.journeyKey === "LEXINGTON_TO_WEST_FARMS") audio.playTransitAnnouncement("west_farms_arrival", { delaySeconds: .2, dedupeSeconds: 4 });
        else if (boarded?.journeyKey === "WEST_FARMS_TO_LEXINGTON") { audio.playTransitAnnouncement("southbound_5_lexington_transfer", { delaySeconds: .2, dedupeSeconds: 4 }); destinationCallout = `${event.stop} — exit with every sloth, then transfer here to a downtown N or R train for 5 Av / 59 St`; }
        else if (boarded?.journeyKey === "LEXINGTON_TO_FIFTH") { audio.playTransitAnnouncement("downtown_nr_fifth_arrival", { delaySeconds: .2, dedupeSeconds: 4 }); destinationCallout = `${event.stop} — exit with every sloth and follow the signed street stairs to Central Park`; }
        showToast(destinationCallout, 4300);
      }
      else if (event.type === "WRONG_DOOR") showToast("That is not the platform side — follow the illuminated doorway", 2600);
      else if (event.type === "ARRIVED") finishRide();
    }

    const qaInput = requestedGameCheckpoint(location.search, location.hostname);
    if (qaInput === "lexingtontransfer") checkpoint("LEXINGTON", "QA checkpoint · paid-area transfer platform", false, false, true);
    else if (qaInput === "lexington" || qaInput === "trainride5") checkpoint("LEXINGTON", "QA checkpoint · Lexington Av / 59 St");
    else if (["westfarms", "bronxentry", "bronxpolar", "bronxbirds", "bronxmonkeys", "bronxsloths", "rescuefollowers"].includes(qaInput ?? "")) checkpoint("WEST_FARMS", "QA checkpoint · West Farms Sq–E Tremont Av");
    if (["subway", "subwayplatform", "lexington"].includes(qaInput ?? "") && stationWorld) { stationClock = 6; stationWorld.update(stationClock); }
    if (["subwayplatform", "lexington"].includes(qaInput ?? "")) {
      // Stand opposite the center doorway so visual QA captures the open,
      // illuminated vestibule instead of the blank side of an adjacent car.
      player.set(-3.72, 1.48, -10); yaw = -Math.PI / 2;
    }
    if (qaInput === "trainride" && stationWorld) startInterior({ correct: true, destination: "LEXINGTON", direction: "QUEENS-BOUND", journeyKey: "FIFTH_TO_LEXINGTON", route: "N", station: "FIFTH_AV" });
    if (qaInput === "trainride5" && stationWorld) startInterior({ correct: true, destination: "WEST_FARMS", direction: "UPTOWN / BRONX", journeyKey: "LEXINGTON_TO_WEST_FARMS", route: "5", station: "LEXINGTON" });
    if (["bronxentry", "bronxpolar", "bronxbirds", "bronxmonkeys", "bronxsloths", "rescuefollowers"].includes(qaInput ?? "") && stationWorld) {
      const reviewWorld = enterBronxZoo();
      if (reviewWorld) {
        if (qaInput !== "bronxentry") reviewWorld.setTicketCollected(true);
        if (qaInput === "bronxentry") player.copy(reviewWorld.ticketReviewSpawn);
        // Start on the authored overlook, centered between glazing mullions.
        // The old spawn sat directly behind the west fence post and turned the
        // polar-bear review into a pair of screen-height black bars.
        else if (qaInput === "bronxpolar") { player.set(25, reviewWorld.floorHeight(25, -39) + 1.48, -39); yaw = -.98; }
        else if (qaInput === "bronxbirds") { player.set(-29.5, reviewWorld.floorHeight(-29.5, -39) + 1.48, -39); yaw = .84; }
        else if (qaInput === "bronxmonkeys") { player.set(-24, reviewWorld.floorHeight(-24, -98) + 1.48, -98); yaw = 1.4; }
        else player.copy(reviewWorld.habitatReviewSpawn);
        if (qaInput === "rescuefollowers") { reviewWorld.setFriendsReleased(true); rescuedParty.setActive(true, player, reviewWorld.floorHeight(player.x, player.z)); reflectRescueState("ESCORT_TO_BUS"); }
        reviewWorld.update(0, 0, player);
        reflectZooReviewState(reviewWorld);
        if (qaInput !== "bronxentry") clearReviewToast();
      }
    }
    if (["busdrive", "busarrival", "museumentry", "museumrotunda", "museummegatherium", "museumfinale"].includes(qaInput ?? "") && stationWorld) {
      rescuedParty.setActive(true, player, player.y - 1.48);
      if (qaInput === "busdrive" || qaInput === "busarrival") startBusDrive(qaInput === "busarrival" ? 1168 : 760);
      else {
        const reviewMuseum = enterMuseum(qaInput === "museumentry" ? "entry" : qaInput === "museumrotunda" ? "rotunda" : "megatherium");
        if (qaInput === "museumfinale" && reviewMuseum) { museumCompletionArmed = true; player.copy(reviewMuseum.megatheriumTarget); rescuedParty.reset(player, reviewMuseum.floorHeight()); completeMission(); }
      }
    }
    if (["returnwestfarms", "returntrain5", "returnlexington", "returntrainnr", "homecoming", "finale"].includes(qaInput ?? "") && stationWorld) {
      travelDirection = "RETURN";
      const station: SubwayStationId = qaInput === "returnwestfarms" || qaInput === "returntrain5" ? "WEST_FARMS" : "LEXINGTON";
      checkpoint(station, "QA checkpoint · rescued friends return journey", false, false, true);
      rescuedParty.setActive(true, player, player.y - 1.48); reflectRescueState("RETURN_TRANSIT");
      if (qaInput === "returntrain5" && stationWorld) startInterior({ correct: true, destination: "LEXINGTON", direction: "DOWNTOWN / MANHATTAN", journeyKey: "WEST_FARMS_TO_LEXINGTON", route: "5", station: "WEST_FARMS" });
      else if (qaInput === "returntrainnr" && stationWorld) startInterior({ correct: true, destination: "FIFTH_AV", direction: "DOWNTOWN / BROOKLYN", journeyKey: "LEXINGTON_TO_FIFTH", route: "N", station: "LEXINGTON" });
      else if (qaInput === "homecoming" || qaInput === "finale") {
        checkpoint("FIFTH_AV", "QA checkpoint · Fifth Avenue return exit", false, false, true); const reviewPark = enterCentralPark();
        if (qaInput === "finale" && reviewPark) { player.copy(reviewPark.sanctuaryTarget).setY(reviewPark.floorHeight(reviewPark.sanctuaryTarget.x, reviewPark.sanctuaryTarget.z) + 1.48); rescuedParty.reset(player, reviewPark.floorHeight(player.x, player.z)); completeHomeMission(); }
      }
    }

    let raf = 0;
    function frame(timestamp?: number) {
      raf = requestAnimationFrame(frame); if (timestamp !== undefined) quality.reportFrame(timestamp); timer.update(timestamp); const delta = Math.min(timer.getDelta(), .05); gameTime += delta;
      if (transitStage === "RIDING" && interiorWorld) {
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0; if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(1.82), 1 - Math.exp(-delta * (moving ? 10 : 7))); player.addScaledVector(velocity, delta);
        const snapshot = interiorWorld.update(delta, player, velocity); handleInteriorEvent(snapshot.event); if (transitStage !== "RIDING" || !interiorWorld) { renderFrame(); return; }
        if (actionRequested) { handleInteriorEvent(interiorWorld.interact(player)); actionRequested = false; }
        const target = snapshot.exitWaypoint, dx = target.x - player.x, dz = target.z - player.z, distance = Math.hypot(dx, dz), ahead = dx * -Math.sin(yaw) + dz * -Math.cos(yaw), side = dx * Math.cos(yaw) - dz * Math.sin(yaw), bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        if (rescuedParty.isActive) rescuedParty.update(gameTime, delta, player, () => 0, "train");
        camera.position.copy(player).add(snapshot.cameraOffset); camera.rotation.set(THREE.MathUtils.clamp(pitch, -.74, .74), yaw, snapshot.cameraRoll); sloth.animate(gameTime, velocity.length(), false);
        if (moving && gameTime - lastFootstep > .46) { lastFootstep = gameTime; audio.playFootstep("metal", Math.min(1, velocity.length() / 1.82)); }
        if (gameTime - lastHud > .1) { lastHud = gameTime; const destinationPhase = snapshot.objective.includes("illuminated"); setHud({ bearing, distance, motion: snapshot.phase === "DWELL" ? "DOORS OPEN" : snapshot.phase === "APPROACHING" ? "BRAKING" : "RIDING", objective: snapshot.objective, objectiveShort: destinationPhase ? "EXIT" : "ON TRAIN", prompt: snapshot.prompt, promptKey: snapshot.prompt ? "E" : "", station: `${boarded?.route ?? interiorWorld.journey.route} · NEXT ${snapshot.stop.toUpperCase()}`, status: snapshot.phase === "DWELL" ? `${snapshot.stop.toUpperCase()} · DOORS OPEN` : snapshot.phase === "APPROACHING" ? `APPROACHING ${snapshot.stop.toUpperCase()}` : `NEXT STOP · ${snapshot.stop.toUpperCase()}`, value: `${snapshot.secondsRemaining}S`, waypoint: destinationPhase ? `${snapshot.destination} exit` : "Center aisle", wayfinding: destinationPhase }); }
      } else if (transitStage !== "COMPLETE" && stationWorld) {
        stationClock += delta; stationWorld.update(stationClock);
        if (stationWorld.trainPhase !== previousTrainPhase && stationWorld.trainPhase === "APPROACHING") {
          audio.playTrainArrival(.82);
          if (travelDirection === "RETURN" && currentStation !== "FIFTH_AV") {
            if (currentStation === "WEST_FARMS") audio.playTransitAnnouncement("west_farms_downtown_5_platform", { delaySeconds: .25, dedupeSeconds: 14 });
            else {
              const route = stationWorld.arrivingService.route.toLowerCase() as "n" | "r";
              audio.playTransitAnnouncement(`lex_downtown_${route}_platform`, { delaySeconds: .25, dedupeSeconds: 14 });
            }
            showToast(`A ${stationWorld.arrivingService.direction.toLowerCase()} ${stationWorld.arrivingService.route} train is approaching. Keep the sloths together at the platform edge.`, 4200);
          }
          else if (currentStation === "FIFTH_AV") {
            const route = stationWorld.arrivingService.route.toLowerCase() as "n" | "r";
            audio.playTransitAnnouncement(`fifth_${route}_platform`, { delaySeconds: .25, dedupeSeconds: 14 });
            showToast(`An uptown ${stationWorld.arrivingService.route} train is approaching the station.`, 3800);
          }
          else if (currentStation !== "WEST_FARMS") audio.playTransitAnnouncement("lex_5_platform", { delaySeconds: .55, dedupeSeconds: 14 });
        }
        if (stationWorld.doorsOpen !== previousDoorsOpen) {
          audio.playTrainDoors(stationWorld.doorsOpen ? "open" : "close");
          if (stationWorld.doorsOpen) {
            audio.playTrainChime("arrival");
            if (travelDirection === "RETURN" && currentStation !== "FIFTH_AV") {
              if (currentStation === "WEST_FARMS") audio.playTransitAnnouncement("west_farms_downtown_5_boarding", { delaySeconds: .2, dedupeSeconds: 12 });
              else {
                const route = stationWorld.arrivingService.route.toLowerCase() as "n" | "r";
                audio.playTransitAnnouncement(`lex_downtown_${route}_boarding`, { delaySeconds: .2, dedupeSeconds: 12 });
              }
              showToast(`${stationWorld.arrivingService.route} ${stationWorld.arrivingService.direction.toLowerCase()} · doors open · board with all four friends.`, 4200);
            }
            else if (currentStation === "FIFTH_AV") {
              const route = stationWorld.arrivingService.route.toLowerCase() as "n" | "r";
              audio.playTransitAnnouncement(`fifth_${route}_boarding`, { delaySeconds: .2, dedupeSeconds: 12 });
              showToast(`${stationWorld.arrivingService.route} train · doors open · board through any open doorway.`, 3800);
            }
            else if (currentStation !== "WEST_FARMS") audio.playTransitAnnouncement("lex_5_boarding", { delaySeconds: .2, dedupeSeconds: 12 });
          } else audio.playTrainChime("doors-closing");
        }
        previousTrainPhase = stationWorld.trainPhase; previousDoorsOpen = stationWorld.doorsOpen;
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        playerBeforeMovement.copy(player);
        const moving = wish.lengthSq() > 0; if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(2.65), 1 - Math.exp(-delta * (moving ? 9 : 6))); player.addScaledVector(velocity, delta); stationWorld.resolvePlayer(player, velocity);
        const streetMix = stationWorld.streetEnvironmentMix(player); (scene.background as THREE.Color).copy(interiorColor).lerp(streetColor, streetMix); if (scene.fog instanceof THREE.FogExp2) { scene.fog.color.copy(fogInterior).lerp(fogStreet, streetMix); scene.fog.density = THREE.MathUtils.lerp(.009, .0048, streetMix); } renderer.toneMappingExposure = THREE.MathUtils.lerp(1.18, 1.32, streetMix);
        if (travelDirection === "OUTBOUND" && currentStation === "FIFTH_AV" && previousStreetMix >= .55 && streetMix < .55) { showTransition("5 Av / 59 St mezzanine"); showToast("Fare control ahead — collect a MetroCard at the blue machine, then swipe at a turnstile.", 5200); }
        previousStreetMix = streetMix;
        if (moving && gameTime - lastFootstep > .48) { lastFootstep = gameTime; audio.playFootstep("stone", Math.min(1, velocity.length() / 2.65)); }
        const option = stationWorld.boardingOption(player, playerBeforeMovement), boardingHint = stationWorld.boardingHint(player), fareInteraction = stationWorld.interactionHint(player), target = stationWorld.waypoint, targetX = target.x - player.x, targetZ = target.z - player.z, distance = Math.hypot(targetX, targetZ), ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw), side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw), bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        let prompt = "", promptKey = ""; if (fareInteraction) { prompt = fareInteraction.label; promptKey = "E"; } else if (boardingHint) prompt = `WALK THROUGH OPEN ${boardingHint.route} DOORS · ${boardingHint.direction}`; else if (travelDirection === "OUTBOUND" && currentStation === "WEST_FARMS" && distance < 4.4) prompt = "WALK UP TO THE BRONX ZOO EXIT"; else if (travelDirection === "RETURN" && currentStation === "FIFTH_AV" && distance < 4.4) prompt = "WALK UP TO CENTRAL PARK";
        // Boarding and the final street exit are spatial actions: once the sloth
        // crosses a physically open doorway, the streamed world changes without
        // an extra button press. E remains available only inside the train as an
        // accessibility fallback for the destination-door timing challenge.
        if (actionRequested && fareInteraction) { const fareEvent = stationWorld.interact(player); if (fareEvent) showToast(fareEvent.message, 4800); }
        if (option) boardThroughOpenDoor(option);
        else if (travelDirection === "OUTBOUND" && currentStation === "WEST_FARMS" && distance < 1.45) enterBronxZoo();
        else if (travelDirection === "RETURN" && currentStation === "FIFTH_AV" && distance < 1.45) enterCentralPark();
        actionRequested = false; if (!stationWorld) { renderFrame(); return; }
        if (rescuedParty.isActive) rescuedParty.update(gameTime, delta, player, () => player.y - 1.48, "station");
        camera.position.copy(player); camera.rotation.set(pitch, yaw, 0); sloth.animate(gameTime, velocity.length(), false);
        if (gameTime - lastHud > .12) { lastHud = gameTime; const fifth = currentStation === "FIFTH_AV", lex = currentStation === "LEXINGTON", returning = travelDirection === "RETURN", fareObjective = stationWorld.fareObjective, arrivingRoute = stationWorld.arrivingService.route;
          const objective = fareObjective ?? (returning ? fifth ? "Exit at Fifth Avenue and lead your friends into Central Park" : lex ? `Transfer here to a downtown ${arrivingRoute} train for Fifth Avenue` : "Take the downtown 5 to Lexington Av; transfer to N / R there" : fifth ? `Take the Queens-bound ${arrivingRoute} train one stop` : lex ? "Choose the uptown 5 platform from the paid concourse" : "Exit toward the Bronx Zoo");
          const waypoint = fareObjective ? (fareObjective.startsWith("Collect") ? "Fare machine" : "MetroCard turnstiles") : returning ? fifth ? "Central Park street exit" : lex ? `Separate Broadway platform · downtown ${arrivingRoute}` : "Downtown 5 platform · opposite arrival side" : fifth ? `Queens-bound ${arrivingRoute}` : lex ? "Lexington Line platform · uptown 5" : "Bronx Zoo exit";
          const routeStatus = `${arrivingRoute} TRAIN`, status = fareObjective ? (fareObjective.startsWith("Collect") ? "FARE UNPAID · GET CARD" : "METROCARD READY · SWIPE") : returning && fifth ? "CENTRAL PARK · STREET EXIT" : !returning && currentStation === "WEST_FARMS" ? "ANIMAL TRACKS · NORTH EXIT" : stationWorld.doorsOpen ? `${routeStatus} · DOORS OPEN` : stationWorld.trainPhase === "APPROACHING" ? `${routeStatus} APPROACHING` : stationWorld.trainPhase === "BOARDING" ? `${routeStatus} ARRIVED` : `NEXT ${routeStatus} · ${stationWorld.secondsToTrain}s`;
          setHud({ bearing, distance, motion: streetMix > .62 ? returning ? "ASCENDING" : "DESCENDING" : moving ? "WALKING" : "IN STATION", objective, objectiveShort: fareObjective ? (fareObjective.startsWith("Collect") ? "METROCARD" : "SWIPE") : returning ? fifth ? "PARK EXIT" : lex ? "TRANSFER" : "DOWNTOWN 5" : fifth ? arrivingRoute : lex ? "TRANSFER" : "EXIT", prompt, promptKey, station: fifth ? returning ? "5 AV / 59 ST · RETURN" : "5 AV / 59 ST · UPTOWN TRIP" : lex ? "LEXINGTON AV / 59 ST · PAID CONCOURSE" : "WEST FARMS SQ · E TREMONT AV", status, value: fareObjective ? (fareObjective.startsWith("Collect") ? "CARD" : "SWIPE") : returning && fifth || !returning && currentStation === "WEST_FARMS" ? `${Math.round(distance)}M` : stationWorld.doorsOpen ? "OPEN" : `${stationWorld.secondsToTrain}S`, waypoint, wayfinding: true }); }
      } else if (transitStage === "BRONX_ZOO" && zooWorld) {
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0; if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(2.5), 1 - Math.exp(-delta * (moving ? 9 : 6))); player.addScaledVector(velocity, delta); zooWorld.resolvePlayer(player, velocity); zooWorld.update(gameTime, delta, player);
        if (rescuedParty.isActive) rescuedParty.update(gameTime, delta, player, (x, z) => zooWorld?.floorHeight(x, z) ?? 0, Math.abs(player.x) < 9 ? "station" : "open");
        if (moving && gameTime - lastFootstep > .5) { lastFootstep = gameTime; audio.playFootstep("stone", Math.min(1, velocity.length() / 2.5)); }
        const target = zooWorld.objectiveTarget, targetX = target.x - player.x, targetZ = target.z - player.z, distance = Math.hypot(targetX, targetZ), ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw), side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw), bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        const hint = zooWorld.interactionHint(player), prompt = hint?.label ?? "";
        if (actionRequested && hint?.kind === "BUS_BOARDING") {
          actionRequested = false;
          if (rescuedParty.allWithin(zooWorld.busBoardingPosition, 9.5)) { startBusDrive(); renderFrame(); return; }
          showToast("Wait in the marked loading zone until all four rescued sloths reach the shuttle door.", 4600);
        } else if (actionRequested && hint) {
          const event = zooWorld.interact(player);
          if (event) {
            showToast(event.message, event.kind === "SLOTHS_RELEASED" ? 6200 : 5000);
            if (event.kind === "TICKET_RECEIVED") { setTicketHeld(true); audio.playQuestComplete(); }
            if (event.kind === "SLOTHS_RELEASED") { rescuedParty.setActive(true, player, zooWorld.floorHeight(player.x, player.z)); setFollowerCount(rescuedParty.count); audio.playQuestComplete(); }
          }
        }
        setZooPhase(zooWorld.questState); setTicketHeld(zooWorld.hasTicket); actionRequested = false;
        camera.position.copy(player); camera.rotation.set(pitch, yaw, 0); sloth.animate(gameTime, velocity.length(), false);
        if (gameTime - lastHud > .12) { lastHud = gameTime; const quest = zooWorld.questState, released = zooWorld.friendsReleased, status = quest === "NEED_TICKET" ? "ADMISSION REQUIRED" : quest === "ENTER_ZOO" ? "EXTRA TICKET READY" : quest === "FIND_SLOTHS" ? "EXPLORE THE HABITATS" : "FOUR FRIENDS · BOARD TOGETHER", objective = released ? "Lead all four friends out of the zoo and board the museum shuttle" : zooWorld.objectiveLabel; setHud({ bearing, distance, motion: moving ? "WALKING" : released ? "SLOTH RESCUE" : "ZOO EXPLORATION", objective, objectiveShort: quest === "NEED_TICKET" ? "FIND TICKET" : quest === "ENTER_ZOO" ? "ENTER ZOO" : quest === "FIND_SLOTHS" ? "FIND SLOTHS" : "SHUTTLE BUS", prompt, promptKey: prompt ? "E" : "", station: released ? "BRONX ZOO · MUSEUM SHUTTLE STOP" : "BRONX ZOO · WILDLIFE CONSERVATION CAMPUS", status, value: `${Math.round(distance)}M`, waypoint: quest === "NEED_TICKET" ? "Visitor with extra ticket" : quest === "ENTER_ZOO" ? "Asia Gate" : quest === "FIND_SLOTHS" ? "Sloth conservation habitat" : "Natural History Museum shuttle", wayfinding: true }); }
      } else if (transitStage === "BUS_DRIVE" && cityBusWorld) {
        const input = { accelerate: keys.has("KeyW") || keys.has("ArrowUp"), brake: keys.has("KeyS") || keys.has("ArrowDown"), steerLeft: keys.has("KeyA") || keys.has("ArrowLeft"), steerRight: keys.has("KeyD") || keys.has("ArrowRight"), handbrake: keys.has("Space") };
        cityBusWorld.update(delta, gameTime, input); player.copy(cityBusWorld.cameraPosition); const speed = cityBusWorld.speedMetersPerSecond, signedSpeed = cityBusWorld.signedSpeedMetersPerSecond; audio.setCartMotor(true, speed);
        const parked = cityBusWorld.parkingReached, prompt = parked ? "OPEN THE BUS DOOR · ENTER THE NATURAL HISTORY MUSEUM" : "";
        if (actionRequested && parked) { actionRequested = false; enterMuseum(); renderFrame(); return; }
        actionRequested = false; camera.position.copy(player); camera.rotation.set(THREE.MathUtils.clamp(pitch, -.7, .62), cityBusWorld.headingYaw + yaw, 0);
        cityBusWorld.getWorldGripPositions(busGripWorld); camera.updateMatrixWorld(true);
        busGripCamera.left.copy(busGripWorld.left); camera.worldToLocal(busGripCamera.left);
        busGripCamera.right.copy(busGripWorld.right); camera.worldToLocal(busGripCamera.right);
        sloth.setVehiclePose("cart", cityBusWorld.steeringAmount, 0, 0, busGripCamera); sloth.animate(gameTime, speed, false);
        if (gameTime - lastHud > .1) { lastHud = gameTime; const instruction = cityBusWorld.navigationInstruction; setVehicleSpeed(speed); setHud({ bearing: 0, distance: cityBusWorld.remainingMeters, motion: signedSpeed < -.1 ? "REVERSING" : speed > .35 ? "DRIVING" : parked ? "PARKED" : "IN TRAFFIC", objective: parked ? "Park the bus and bring the sloths inside the museum" : instruction, objectiveShort: parked ? "ENTER AMNH" : "DRIVE TO AMNH", prompt, promptKey: prompt ? "E" : "", station: `${cityBusWorld.currentRoad.toUpperCase()} · MUSEUM SHUTTLE`, status: cityBusWorld.congestionStatus, value: parked ? "PARKED" : `${Math.round(cityBusWorld.remainingMeters)}M`, waypoint: parked ? "Central Park West entrance" : instruction, wayfinding: true }); }
      } else if (transitStage === "MUSEUM" && museumWorld) {
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0; if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(2.55), 1 - Math.exp(-delta * (moving ? 9 : 6))); player.addScaledVector(velocity, delta); museumWorld.resolvePlayer(player, velocity); museumWorld.update(gameTime, delta); rescuedParty.update(gameTime, delta, player, () => museumWorld?.floorHeight() ?? 0, "open");
        if (moving && gameTime - lastFootstep > .5) { lastFootstep = gameTime; audio.playFootstep("stone", Math.min(1, velocity.length() / 2.55)); }
        const target = museumWorld.megatheriumTarget, targetX = target.x - player.x, targetZ = target.z - player.z, distance = Math.hypot(targetX, targetZ), ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw), side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw), bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        if (museumCompletionArmed && museumWorld.megatheriumNearby(player) && rescuedParty.allWithin(target, 9.5)) { completeMission(); renderFrame(); return; }
        camera.position.copy(player); camera.rotation.set(pitch, yaw, 0); sloth.animate(gameTime, velocity.length(), false); actionRequested = false;
        if (gameTime - lastHud > .12) { lastHud = gameTime; const gathering = museumWorld.megatheriumNearby(player, 13); setHud({ bearing, distance, motion: moving ? "WALKING" : "MUSEUM EXPLORATION", objective: "Find Megatherium and bring all four sloths to the giant ground sloth", objectiveShort: "MEGATHERIUM", prompt: gathering ? "GATHER ALL FOUR FRIENDS AT THE EXHIBIT" : "", promptKey: "", station: player.z > 20 ? "AMNH · CENTRAL PARK WEST ENTRANCE" : player.z > -35 ? "AMNH · THEODORE ROOSEVELT ROTUNDA" : player.z > -155 ? "AMNH · PERMANENT EXHIBITION HALLS" : "AMNH · FOSSIL MAMMAL HALLS · FLOOR 4", status: gathering ? "MEGATHERIUM FOUND · FRIENDS GATHERING" : "FOUR FRIENDS FOLLOWING", value: `${Math.round(distance)}M`, waypoint: "Megatherium · Giant Ground Sloth", wayfinding: true }); }
      } else if (transitStage === "CENTRAL_PARK" && parkReturnWorld) {
        const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), wish = new THREE.Vector3();
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward); if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward); if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right); if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0; if (moving) wish.normalize(); velocity.lerp(wish.multiplyScalar(2.6), 1 - Math.exp(-delta * (moving ? 9 : 6))); player.addScaledVector(velocity, delta); parkReturnWorld.resolvePlayer(player, velocity); parkReturnWorld.update(gameTime); rescuedParty.update(gameTime, delta, player, (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0, parkReturnWorld.sanctuaryNearby(player, 16) ? "grove" : "open");
        if (moving && gameTime - lastFootstep > .5) { lastFootstep = gameTime; audio.playFootstep("earth", Math.min(1, velocity.length() / 2.6)); }
        const target = parkReturnWorld.sanctuaryTarget, targetX = target.x - player.x, targetZ = target.z - player.z, distance = Math.hypot(targetX, targetZ), ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw), side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw), bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        if (parkReturnWorld.sanctuaryNearby(player) && rescuedParty.allWithin(target, 9.5)) { completeHomeMission(); renderFrame(); return; }
        camera.position.copy(player); camera.rotation.set(pitch, yaw, 0); sloth.animate(gameTime, velocity.length(), false); actionRequested = false;
        if (gameTime - lastHud > .12) { lastHud = gameTime; const friendsReady = rescuedParty.allWithin(target, 9.5); setHud({ bearing, distance, motion: moving ? "WALKING" : "HOMEWARD", objective: "Bring all four rescued sloths to the Home Grove", objectiveShort: "HOME GROVE", prompt: friendsReady ? "FRIENDS GATHERING BENEATH THE TREES" : "", promptKey: "", station: "CENTRAL PARK · HOME GROVE", status: friendsReady ? "ALL FRIENDS HOME" : "FOUR FRIENDS FOLLOWING", value: `${Math.round(distance)}M`, waypoint: "Home Grove sanctuary", wayfinding: true }); }
      } else if (transitStage === "COMPLETE" && museumWorld) { museumWorld.update(gameTime, delta); rescuedParty.update(gameTime, delta, museumWorld.megatheriumTarget, () => museumWorld?.floorHeight() ?? 0, "grove"); }
      else if (transitStage === "COMPLETE" && parkReturnWorld) { parkReturnWorld.update(gameTime); rescuedParty.update(gameTime, delta, parkReturnWorld.sanctuaryTarget, (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0, "grove"); }
      renderFrame();
    }
    frame();
    return () => { cancelAnimationFrame(raf); audio.cancelTransitAnnouncements(); audio.setCartMotor(false); if (transitionTimer !== null) clearTimeout(transitionTimer); renderer.domElement.removeEventListener("pointerdown", pointerDown); renderer.domElement.removeEventListener("pointermove", pointerMove); renderer.domElement.removeEventListener("pointerup", pointerUp); renderer.domElement.removeEventListener("pointercancel", pointerUp); document.removeEventListener("mousemove", mouseMove); document.removeEventListener("keydown", keyDown); document.removeEventListener("keyup", keyUp); document.removeEventListener("sloth-look", touchLook); document.removeEventListener(DEBUG_LOOK_REQUEST_EVENT, requestDebugLook); document.removeEventListener("pointerlockchange", pointerLockChanged); document.removeEventListener("visibilitychange", visibilityChange); window.removeEventListener("blur", release); window.removeEventListener("resize", resize); unsubscribeQuality(); timer.dispose(); disposeInterior(); stationWorld?.dispose(); zooWorld?.dispose(); cityBusWorld?.dispose(); museumWorld?.dispose(); parkReturnWorld?.dispose(); rescuedParty.dispose(); composer?.dispose(); renderer.dispose(); if (host.contains(renderer.domElement)) host.removeChild(renderer.domElement); };
  }, [audio, quality, showToast]);

  useEffect(() => { const frame = requestAnimationFrame(() => setTouchCapable(hasTouchInput())); return () => cancelAnimationFrame(frame); }, []);
  useEffect(() => () => { if (toastTimer.current !== null) clearTimeout(toastTimer.current); }, []);
  return <main className="game-shell subway-shell" data-game-state={stage === "COMPLETE" ? "complete" : "playing"} data-touch-capable={touchCapable ? "true" : "false"} data-motion={hud.motion} data-buds="5" data-level={stage === "BRONX_ZOO" ? "bronx-zoo" : stage === "BUS_DRIVE" ? "city-bus" : stage === "MUSEUM" || stage === "COMPLETE" ? "natural-history-museum" : stage === "CENTRAL_PARK" ? "central-park" : "subway"} data-station={stage} data-campaign-phase={zooPhase} data-zoo-phase={zooPhase} data-ticket-held={ticketHeld ? "true" : "false"} data-follower-count={followerCount} data-return-leg={returnLeg} data-loaded-world={stage === "RIDING" ? "train-interior" : stage === "BRONX_ZOO" ? "bronx-zoo" : stage === "BUS_DRIVE" ? "bronx-manhattan-bus-route" : stage === "MUSEUM" || stage === "COMPLETE" ? "american-museum-of-natural-history" : stage === "CENTRAL_PARK" ? "central-park-homecoming" : "subway-station"} data-goal-distance={hud.distance.toFixed(1)} data-goal-bearing={hud.bearing.toFixed(1)}>
    <div ref={mount} className="viewport" aria-label="3D subway game viewport"/><div className="world-grade"/><div className="world-vignette"/><div className="grain"/>
    {transition && <div className="world-transition" role="status"><span>Now entering</span><strong>{transition}</strong><i/></div>}
    {stage !== "COMPLETE" && <div className="hud desktop-hud"><section className="mission"><div className="eyebrow">Current objective</div><h2>{hud.objective}</h2><p>{hud.station}</p></section><div className="compass"><div className="eyebrow">Journey · {hud.station}</div><div className="compass-line"><span>FROM</span><span className="active">{hud.motion}</span><span>TO</span></div></div><div className="status"><div className="eyebrow">Campaign status</div><strong>{hud.status}</strong></div><div className="meters"><div className="motion-state"><span>{hud.motion}</span><small>{stage === "RIDING" ? "Follow the onboard display · keep the group clear of doors · exit together at the lit side" : stage === "BRONX_ZOO" ? followerCount > 0 ? "Lead the rescued sloths along the visitor paths and board the museum shuttle together" : "Explore every habitat · E talks, presents the ticket, and opens the sloth keeper door" : stage === "BUS_DRIVE" ? "W forward · S brake then reverse · A / D steer · Space handbrake · dashboard repeats active signal" : stage === "MUSEUM" ? "Explore the permanent halls · keep all four friends together · follow signs for Fossil Mammals" : stage === "CENTRAL_PARK" ? "Keep moving toward Home Grove · the rescued sloths follow your exact path" : "Follow black signs · stairs connect every playable level · board only the signed service"}</small></div><div className="meter-row"><span>{stage === "RIDING" ? "Stop" : stage === "BUS_DRIVE" ? "Route" : stage === "BRONX_ZOO" || stage === "MUSEUM" || stage === "CENTRAL_PARK" ? "Goal" : "Train"}</span><div className="meter-track"><div className="meter-fill" style={{ width: hud.value === "OPEN" || hud.value === "PARKED" ? "100%" : "42%" }}/></div><span>{hud.value}</span></div></div>{hud.prompt && <div className="interaction">{hud.promptKey && <span className="key">{hud.promptKey}</span>}{hud.prompt}</div>}<div className="controls-strip"><span>{stage === "BUS_DRIVE" ? "W Forward · S Brake / Reverse" : "W / A / S / D Walk"}</span><span>{stage === "BUS_DRIVE" ? "A / D Steer · Space handbrake" : stage === "RIDING" ? "Any lit platform-side exit · E fallback" : "E interact · walk through open doors"}</span><span>{stage === "BUS_DRIVE" ? "E unload at the museum" : stage === "RIDING" ? "Clear doors until your stop" : "Follow the active waypoint"}</span><span>M Sound</span></div></div>}
    {stage !== "COMPLETE" && <MobileHud alert={stage === "RIDING" || stage === "BUS_DRIVE" ? 0 : 8} buds={5} driving={stage === "BUS_DRIVE"} energy={100} hawkPhase="PATROL" motion={hud.motion} objectiveShort={hud.objectiveShort} objectiveValue={hud.value} showMotion={stage === "BUS_DRIVE"} speed={vehicleSpeed} swimming={false}/>}
    {stage !== "COMPLETE" && <GoalWayfinder active={hud.wayfinding} bearing={hud.bearing} distance={hud.distance} label={hud.waypoint}/>}
    {stage !== "COMPLETE" && <div className={`crosshair ${hud.prompt ? "targeted" : ""}`}/>} {toast && stage !== "COMPLETE" && <div className="toast" role="status" aria-live="polite">{toast}</div>}
    {stage !== "COMPLETE" && pointerLockAvailable && !mouseCaptured && <button className="mouse-resume" type="button" onClick={() => requestLock(mount.current?.querySelector("canvas") ?? null)}><span>Mouse free</span>Click to look</button>}
    {stage !== "COMPLETE" && <TouchControls arboreal={false} prompt={hud.prompt} promptKey={hud.promptKey} showSense={false} vehicle={stage === "BUS_DRIVE" ? "bus" : null}/>}
    {stage === "COMPLETE" && <section className="screen finale-screen"><div className="pause-card"><div className="eyebrow">AMNH · Fossil Mammal Halls</div><h2>Your friends found a giant ancestor.</h2><p>You freed the sloths at the Bronx Zoo, drove them through New York traffic, and crossed the museum together. Before Megatherium—the giant ground sloth—the whole rescue party finally sees how immense sloth history can be.</p><div className="actions"><button className="primary" onClick={() => location.reload()}>Play again <b>↻</b></button></div></div></section>}
  </main>;
}
