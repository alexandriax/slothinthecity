"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { EducationOverlay } from "./EducationOverlay";
import { GoalWayfinder } from "./GoalWayfinder";
import { AdaptiveRenderPipeline } from "./rendering/AdaptiveRenderPipeline";
import { SlothLockPick } from "./SlothLockPick";
import { ZOO_SIDE_QUESTS, type ZooSideQuestId } from "./zooSideQuestLogic";
import { ShuttleMinimap } from "./ShuttleMinimap";
import { MobileHud } from "./mobile/MobileHud";
import { TouchControls, type TouchControlOption } from "./mobile/TouchControls";
import {
  createSlothRig,
  layoutCanonicalSlothViewmodel,
  type SlothVehicleGripTargets,
} from "./player/SlothRig";
import { loadGameTextures } from "./rendering/textures";
import type { AdaptiveQualityManager, PremiumAudioDirector } from "./systems";
import {
  DEBUG_LOOK_REQUEST_EVENT,
  isAutomatedQaSession,
  requestedGameCheckpoint,
} from "./debugCheckpoints";
import { BronxZooWorld, type BronxZooEvent } from "./world/BronxZooWorld";
import { CentralParkReturnWorld } from "./world/CentralParkReturnWorld";
import {
  CITY_BUS_CITY_REVIEW_PROGRESS,
  CITY_BUS_EXIT_REVIEW_PROGRESS,
  CITY_BUS_HIGHWAY_REVIEW_PROGRESS,
  CITY_BUS_ROUTE_LENGTH,
  CityBusWorld,
  type ShuttleMinimapSnapshot,
} from "./world/CityBusWorld";
import { NaturalHistoryMuseumWorld } from "./world/NaturalHistoryMuseumWorld";
import { GaryCompanion } from "./world/GaryCompanion";
import {
  AnimalMenagerie,
  type OptionalCompanionId,
} from "./world/AnimalMenagerie";
import type { CompanionCollisionBody } from "./world/CompanionNavigation";
import { SlothFollowerParty } from "./world/SlothFollowerParty";
import {
  SubwayWorld,
  type BoardingOption,
  type SubwayQuality,
  type SubwayStationId,
  type SubwayTravelDirection,
} from "./world/SubwayWorld";
import {
  TRAIN_INTERIOR_JOURNEYS,
  TrainInteriorWorld,
  type TrainInteriorEvent,
  type TrainInteriorJourney,
} from "./world/TrainInteriorWorld";
import { preloadAuthoredZooAnimals } from "./world/animals/AuthoredZooAnimalAssets";
import {
  animalCountLabel,
  companionStatus,
  friendCountLabel,
  riderCountLabel,
} from "./campaign/companionCopy";
import { educationContextForTransitStage } from "./educationFacts";

type TransitStage =
  | "FIFTH_AV"
  | "RIDING"
  | "LEXINGTON"
  | "WEST_FARMS"
  | "BRONX_ZOO"
  | "BUS_DRIVE"
  | "MUSEUM"
  | "RETURN_WEST_FARMS"
  | "RETURN_LEXINGTON"
  | "RETURN_FIFTH_AV"
  | "CENTRAL_PARK"
  | "COMPLETE";

export function shuttleBoardingRadiusFor(friendCount: number) {
  const safeCount = Math.max(0, Math.floor(friendCount));
  return Math.min(28, Math.max(18, 14 + safeCount * .75));
}

type TransitHud = {
  bearing: number;
  distance: number;
  fieldControls?: readonly TouchControlOption[];
  fieldStatus?: string;
  motion: string;
  objective: string;
  objectiveShort: string;
  prompt: string;
  promptKey: string;
  progress?: number;
  station: string;
  status: string;
  value: string;
  waypoint: string;
  wayfinding: boolean;
};
type SubwayGameProps = {
  audio: PremiumAudioDirector;
  quality: AdaptiveQualityManager;
  initialCompanionIds?: readonly string[];
};

const QA_ZOO_SIDE_QUESTS: Partial<Record<string, { focusCenter?: [number, number]; focusPitch?: number; questId: ZooSideQuestId; position: [number, number]; yaw: number }>> = {
  bronxquestbirds: { questId: "aviary-voices", position: [-26, -40], yaw: 1 },
  bronxquestbirdsfocus: { focusCenter: [-43, -51], questId: "aviary-voices", position: [-26, -40], yaw: 1 },
  bronxquestsealion: { questId: "sea-lion-current", position: [0, -63], yaw: 0 },
  bronxquestsealionfocus: { focusCenter: [0, -76], questId: "sea-lion-current", position: [0, -63], yaw: 0 },
  bronxquestmonkey: { questId: "monkey-canopy-rig", position: [-24, -98], yaw: 1.4 },
  bronxquestmonkeyfocus: { focusCenter: [-36.5, -100.7], focusPitch: .14, questId: "monkey-canopy-rig", position: [-24, -98], yaw: 1.4 },
  bronxquestzebra: { questId: "zebra-stripe-scan", position: [26, -98], yaw: -1.2 },
  bronxquestzebrafocus: { focusCenter: [43, -101], questId: "zebra-stripe-scan", position: [26, -98], yaw: -1.2 },
  bronxquestredpanda: { questId: "red-panda-scent-wind", position: [-24, -135], yaw: 1.816 },
  bronxquestredpandafocus: { focusCenter: [-36, -132], questId: "red-panda-scent-wind", position: [-24, -135], yaw: 1.816 },
  bronxquesttortoise: { questId: "tortoise-sun-trail", position: [24, -135], yaw: -1.816 },
  bronxquesttortoisefocus: { focusCenter: [36, -132], questId: "tortoise-sun-trail", position: [24, -135], yaw: -1.816 },
  bronxquestflamingo: { questId: "flamingo-wetland-balance", position: [-71, -67], yaw: Math.PI },
  bronxquestflamingofocus: { focusCenter: [-71, -55], questId: "flamingo-wetland-balance", position: [-71, -67], yaw: Math.PI },
  bronxquestbison: { questId: "bison-prairie-seeding", position: [59, -107], yaw: -1.723 },
  bronxquestbisonfocus: { focusCenter: [72, -105], questId: "bison-prairie-seeding", position: [59, -107], yaw: -1.723 },
};

const IN_WORLD_QUEST_CUES = {
  "aviary-voices": "bird-call",
  "sea-lion-current": "water",
  "monkey-canopy-rig": "latch",
  "zebra-stripe-scan": "scan",
  "red-panda-scent-wind": "wind",
  "tortoise-sun-trail": "sun",
  "flamingo-wetland-balance": "valve",
  "bison-prairie-seeding": "launch",
} as const;

function hasTouchInput() {
  return (
    typeof window !== "undefined" &&
    ((navigator.maxTouchPoints ?? 0) > 0 ||
      "ontouchstart" in window ||
      matchMedia("(pointer: coarse)").matches)
  );
}

function requestLock(canvas: HTMLCanvasElement | null) {
  if (
    !canvas ||
    typeof canvas.requestPointerLock !== "function" ||
    hasTouchInput() ||
    isAutomatedQaSession(location.search, location.hostname)
  )
    return;
  try {
    Promise.resolve(canvas.requestPointerLock()).catch(() => undefined);
  } catch {}
}

function worldQuality(
  level: ReturnType<AdaptiveQualityManager["getSnapshot"]>["activeLevel"],
): SubwayQuality {
  return level === "low" || level === "medium"
    ? "mobile"
    : level === "ultra"
      ? "ultra"
      : "balanced";
}

function fieldInputLabel(code: string) {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  return code;
}

export function SubwayGame({
  audio,
  quality,
  initialCompanionIds = [],
}: SubwayGameProps) {
  const mount = useRef<HTMLDivElement>(null),
    [stage, setStage] = useState<TransitStage>("FIFTH_AV"),
    [toast, setToast] = useState(
      "Walk down to the mezzanine and collect a MetroCard before entering the platform",
    );
  const [transition, setTransition] = useState("");
  const [zooPhase, setZooPhase] = useState("OUTBOUND");
  const [ticketHeld, setTicketHeld] = useState(true);
  const [followerCount, setFollowerCount] = useState(initialCompanionIds.length);
  const [garyFed, setGaryFed] = useState(false);
  const [returnLeg, setReturnLeg] = useState("OUTBOUND");
  const [vehicleSpeed, setVehicleSpeed] = useState(0);
  const [busMap, setBusMap] = useState<ShuttleMinimapSnapshot | null>(null);
  const [busIntegrity, setBusIntegrity] = useState(100);
  const [busGear, setBusGear] = useState("2");
  const [busGearLimit, setBusGearLimit] = useState(36);
  const [busImpactStatus, setBusImpactStatus] = useState("none");
  const [busReviewMode, setBusReviewMode] = useState("standard");
  const [mobilityMode, setMobilityMode] = useState<
    "skateboard" | "scooter" | null
  >(null);
  const [lockPicking, setLockPicking] = useState(false);
  const lockPickingRef = useRef(false),
    completeLockPickRef = useRef<() => void>(() => undefined),
    cancelLockPickRef = useRef<() => void>(() => undefined);
  const initialCompanionIdsRef = useRef(initialCompanionIds);
  const [touchCapable, setTouchCapable] = useState(false),
    toastTimer = useRef<number | null>(null);
  const [mouseCaptured, setMouseCaptured] = useState(false);
  const [pointerLockAvailable] = useState(
    () =>
      typeof window !== "undefined" &&
      !hasTouchInput() &&
      typeof HTMLCanvasElement.prototype.requestPointerLock === "function" &&
      matchMedia("(pointer: fine)").matches &&
      !isAutomatedQaSession(location.search, location.hostname),
  );
  const [hud, setHud] = useState<TransitHud>({
    bearing: 0,
    distance: 20,
    motion: "STREET LEVEL",
    objective: "Collect a MetroCard from the fare machine",
    objectiveShort: "METROCARD",
    prompt: "",
    promptKey: "",
    station: "5 AV / 59 ST · 7:12 PM",
    status: "FARE UNPAID",
    value: "CARD",
    waypoint: "Fare machine",
    wayfinding: true,
  });
  const showToast = useCallback((message: string, duration = 3200) => {
    if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => {
      setToast("");
      toastTimer.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let transitStage: TransitStage = "FIFTH_AV",
      currentStation: SubwayStationId = "FIFTH_AV",
      travelDirection: SubwayTravelDirection = "OUTBOUND",
      stationClock = 0,
      gameTime = 0,
      actionRequested = false,
      trickRequested = false,
      shiftUpRequested = false,
      shiftDownRequested = false;
    let skateboarding = false,
      scooterRiding = false;
    let boarded: BoardingOption | null = null,
      interiorWorld: TrainInteriorWorld | null = null,
      zooWorld: BronxZooWorld | null = null,
      cityBusWorld: CityBusWorld | null = null,
      museumWorld: NaturalHistoryMuseumWorld | null = null,
      parkReturnWorld: CentralParkReturnWorld | null = null;
    let museumPreloadScene: THREE.Scene | null = null,
      museumPreloadHandle: number | null = null,
      museumPreloadStarted = false;
    let lastHud = 0,
      lastFootstep = 0,
      yaw = 0,
      pitch = -0.04,
      dragging = false,
      lastTouchX = 0,
      lastTouchY = 0,
      transitionTimer: number | null = null,
      busFailureAt: number | null = null;
    let previousTrainPhase = "AWAY",
      previousDoorsOpen = false,
      previousStreetMix = 1,
      previousBusRouteStatus = "";
    let museumCompletionArmed = true;
    const budget = quality.getRenderBudget(),
      scene = new THREE.Scene(),
      interiorColor = new THREE.Color("#303936"),
      streetColor = new THREE.Color("#8aa9ad"),
      fogInterior = new THREE.Color("#303936"),
      fogStreet = new THREE.Color("#b7c7c1");
    scene.background = interiorColor.clone();
    scene.fog = new THREE.FogExp2("#303936", 0.009);
    const camera = new THREE.PerspectiveCamera(
      67,
      innerWidth / innerHeight,
      0.07,
      480,
    );
    camera.rotation.order = "YXZ";
    const renderer = new THREE.WebGLRenderer({
      antialias: budget.antialias,
      powerPreference: "high-performance",
    });
    renderer.setPixelRatio(budget.pixelRatio);
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = budget.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const renderPipeline = new AdaptiveRenderPipeline({ renderer, scene, camera });
    const museumRendering = () =>
      transitStage === "MUSEUM" ||
      (transitStage === "COMPLETE" && Boolean(museumWorld));
    // Museum materials retain authored lighting and shadow maps without the
    // full-screen GTAO pass. On high-DPI displays that pass was the dominant
    // frame cost and made walking and scooter travel visibly choppy.
    const renderFrame = () => {
      renderPipeline.render(!museumRendering());
    };
    const textures = loadGameTextures(renderer, () => undefined),
      subwayDetail = worldQuality(quality.getSnapshot().activeLevel);
    const createStationWorld = (
      initialStation: SubwayStationId = "FIFTH_AV",
      direction: SubwayTravelDirection = travelDirection,
    ) =>
      new SubwayWorld(scene, textures, {
        quality: subwayDetail,
        initialStation,
        travelDirection: direction,
      });
    let stationWorld: SubwayWorld | null = createStationWorld();
    let subwayProgress = stationWorld.progressState;
    const player = stationWorld.spawn.clone(),
      playerBeforeMovement = new THREE.Vector3(),
      velocity = new THREE.Vector3(),
      movementForward = new THREE.Vector3(),
      movementRight = new THREE.Vector3(),
      movementWish = new THREE.Vector3(),
      keys = new Set<string>();
    previousStreetMix = stationWorld.streetEnvironmentMix(player);
    const sloth = createSlothRig(textures.fur);
    const layoutSloth = () => layoutCanonicalSlothViewmodel(sloth, innerWidth);
    layoutSloth();
    camera.add(sloth.root);
    scene.add(camera);
    const busGripWorld: SlothVehicleGripTargets = {
      left: new THREE.Vector3(),
      right: new THREE.Vector3(),
    };
    const busGripCamera: SlothVehicleGripTargets = {
      left: new THREE.Vector3(),
      right: new THREE.Vector3(),
    };
    const museumGatheringTarget = new THREE.Vector3();
    const rescuedParty = new SlothFollowerParty(
      scene,
      textures,
      quality.getSnapshot().profile.foliageDensity,
    );
    const garyCompanion = new GaryCompanion(
      scene,
      textures,
      quality.getSnapshot().profile.foliageDensity,
    );
    const animalMenagerie = new AnimalMenagerie(
      scene,
      textures,
      quality.getSnapshot().profile.foliageDensity,
    );
    for (const id of initialCompanionIdsRef.current)
      animalMenagerie.recruit(
        id as OptionalCompanionId,
        player,
        player.y - 1.48,
      );
    const timer = new THREE.Timer();
    timer.connect(document);
    audio.setScene("subway-station", {
      transitionSeconds: 1.4,
      intensity: 0.58,
    });
    const showTransition = (message: string) => {
      setTransition(message);
      if (transitionTimer !== null) clearTimeout(transitionTimer);
      transitionTimer = window.setTimeout(() => {
        setTransition("");
        transitionTimer = null;
      }, 880);
    };
    const setTransitStage = (next: TransitStage) => {
      transitStage = next;
      setStage(next);
    };
    const totalFollowerCount = () =>
      (rescuedParty.isActive ? rescuedParty.count : 0) +
      (garyCompanion.isFed ? 1 : 0) +
      animalMenagerie.count;
    const publishFollowerCount = () => setFollowerCount(totalFollowerCount());
    const reflectRescueState = (
      phase: "ESCORT_TO_BUS" | "BUS_DRIVE" | "MUSEUM" | "RETURN_TRANSIT",
    ) => {
      publishFollowerCount();
      setTicketHeld(true);
      setZooPhase(phase);
    };
    const reflectGaryFed = () => {
      setGaryFed(true);
      publishFollowerCount();
    };
    const allFollowersWithin = (target: THREE.Vector3, radius: number) =>
      (!rescuedParty.isActive || rescuedParty.allWithin(target, radius)) &&
      (!garyCompanion.isFed ||
        (garyCompanion.isFollowing &&
          Math.hypot(
            garyCompanion.root.position.x - target.x,
            garyCompanion.root.position.z - target.z,
          ) <= radius)) &&
      animalMenagerie.allWithin(target, radius);
    const externalCollisionBodies: CompanionCollisionBody[] = [];
    const collisionBodies = () => {
      externalCollisionBodies.length = 0;
      externalCollisionBodies.push(
        ...rescuedParty.collisionBodies,
        ...garyCompanion.collisionBodies,
      );
      return externalCollisionBodies;
    };
    const clearReviewToast = () => showToast("", 0);
    const reflectZooReviewState = (world: BronxZooWorld) => {
      const target = world.objectiveTarget,
        dx = target.x - player.x,
        dz = target.z - player.z,
        distance = Math.hypot(dx, dz),
        hint = world.interactionHint(player),
        quest = world.questState,
        released = world.friendsReleased,
        activeHabitatQuest = world.activeSideQuestId,
        habitatProgress = world.activeSideQuestProgress;
      setZooPhase(activeHabitatQuest ? `IN_WORLD_QUEST_${activeHabitatQuest.toUpperCase()}` : quest);
      setTicketHeld(world.hasTicket);
      publishFollowerCount();
      const count = totalFollowerCount();
      const objective = released
        ? `Lead ${friendCountLabel(count)} out of the zoo and board the museum shuttle`
        : world.objectiveLabel;
      setHud({
        bearing: THREE.MathUtils.radToDeg(
          Math.atan2(
            dx * Math.cos(yaw) - dz * Math.sin(yaw),
            dx * -Math.sin(yaw) + dz * -Math.cos(yaw),
          ),
        ),
        distance,
        fieldControls: habitatProgress?.control?.options,
        fieldStatus: habitatProgress?.control?.status,
        motion: released ? "MENAGERIE ESCORT" : "ZOO EXPLORATION",
        objective,
        objectiveShort:
          activeHabitatQuest
            ? "HABITAT ROUTE"
            : quest === "ENTER_ZOO"
            ? "ENTER ZOO"
            : quest === "FIND_SLOTHS"
              ? "PICK LOCK"
              : "SHUTTLE BUS",
        prompt: hint?.label ?? "",
        promptKey: hint && hint.kind !== "ANIMAL_QUEST_FOCUS" ? "E" : "",
        station: released
          ? "BRONX ZOO · MUSEUM SHUTTLE STOP"
          : "BRONX ZOO · WILDLIFE CONSERVATION CAMPUS",
        status:
          activeHabitatQuest && habitatProgress
            ? `LIVE HABITAT RESPONSE · ${habitatProgress.current} / ${habitatProgress.total}${habitatProgress.operationActive ? !habitatProgress.tracking ? " · FOLLOW IT" : !habitatProgress.calibrated ? ` · ${habitatProgress.control?.status ?? "CALIBRATE"}` : " · CALIBRATED" : ""} · STREAK ${world.researchStreak}`
            : quest === "ENTER_ZOO"
            ? companionStatus(count)
            : quest === "FIND_SLOTHS"
              ? "KEEPER LOCK SECURED"
              : `${friendCountLabel(count).toUpperCase()} · BOARD TOGETHER`,
        value: `${Math.round(distance)}M`,
        waypoint:
          activeHabitatQuest
            ? "Active habitat research station"
            : quest === "ENTER_ZOO"
            ? "Asia Gate"
            : quest === "FIND_SLOTHS"
              ? "Sloth conservation habitat"
              : "Natural History Museum shuttle",
        wayfinding: true,
      });
    };
    const touchLook = (event: Event) => {
      const detail = (event as CustomEvent<{ dx: number; dy: number }>).detail;
      if (!detail) return;
      yaw -= detail.dx * 0.006;
      pitch = THREE.MathUtils.clamp(pitch - detail.dy * 0.005, -1.2, 1.12);
    };
    const keyDown = (event: KeyboardEvent) => {
      if (lockPickingRef.current) return;
      if (!event.repeat && transitStage === "BRONX_ZOO" && zooWorld?.handleHabitatControl(event.code)) {
        event.preventDefault();
        keys.delete(event.code);
        velocity.multiplyScalar(.35);
        audio.playUiConfirm();
        return;
      }
      keys.add(event.code);
      if (event.code === "KeyE" && !event.repeat) actionRequested = true;
      if (event.code === "KeyR" && !event.repeat) shiftUpRequested = true;
      if (event.code === "KeyF" && !event.repeat) shiftDownRequested = true;
      if (event.code === "Space" && !event.repeat && skateboarding) {
        event.preventDefault();
        trickRequested = true;
      }
      if (event.code === "KeyM" && !event.repeat) audio.toggleMuted();
    };
    const keyUp = (event: KeyboardEvent) => keys.delete(event.code);
    const pointerDown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        dragging = true;
        lastTouchX = event.clientX;
        lastTouchY = event.clientY;
        try {
          renderer.domElement.setPointerCapture(event.pointerId);
        } catch {}
      } else requestLock(renderer.domElement);
    };
    const pointerMove = (event: PointerEvent) => {
      if (dragging && event.pointerType === "touch") {
        yaw -= (event.clientX - lastTouchX) * 0.006;
        pitch = THREE.MathUtils.clamp(
          pitch - (event.clientY - lastTouchY) * 0.005,
          -1.2,
          1.12,
        );
        lastTouchX = event.clientX;
        lastTouchY = event.clientY;
      }
    };
    const pointerUp = () => {
      dragging = false;
    };
    const mouseMove = (event: MouseEvent) => {
      if (document.pointerLockElement === renderer.domElement) {
        yaw -= event.movementX * 0.0018;
        pitch = THREE.MathUtils.clamp(
          pitch - event.movementY * 0.00155,
          -1.2,
          1.12,
        );
      }
    };
    const release = () => {
      keys.clear();
      velocity.set(0, 0, 0);
      actionRequested = false;
      trickRequested = false;
      shiftUpRequested = false;
      shiftDownRequested = false;
      dragging = false;
    };
    const pointerLockChanged = () => {
      const captured = document.pointerLockElement === renderer.domElement;
      setMouseCaptured(captured);
      if (!captured) release();
    };
    const requestDebugLook = () => requestLock(renderer.domElement);
    const visibilityChange = () => {
      if (document.hidden) release();
    };
    const applyBudget = () => {
      const next = quality.getRenderBudget();
      const pixelRatio = museumRendering()
        ? Math.min(next.pixelRatio, 1.25)
        : next.pixelRatio;
      renderPipeline.apply(next, innerWidth, innerHeight, pixelRatio);
    };
    const unsubscribeQuality = quality.subscribe(applyBudget);
    applyBudget();
    const resize = () => {
      quality.refreshDeviceProfile();
      camera.aspect = innerWidth / innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
      applyBudget();
      layoutSloth();
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerUp);
    document.addEventListener("mousemove", mouseMove);
    document.addEventListener("keydown", keyDown);
    document.addEventListener("keyup", keyUp);
    document.addEventListener("sloth-look", touchLook);
    document.addEventListener(DEBUG_LOOK_REQUEST_EVENT, requestDebugLook);
    document.addEventListener("pointerlockchange", pointerLockChanged);
    document.addEventListener("visibilitychange", visibilityChange);
    window.addEventListener("blur", release);
    window.addEventListener("resize", resize);

    function disposeInterior() {
      interiorWorld?.dispose();
      interiorWorld = null;
    }
    function cancelMuseumPreload() {
      if (museumPreloadHandle === null) return;
      if (typeof window.cancelIdleCallback === "function")
        window.cancelIdleCallback(museumPreloadHandle);
      else window.clearTimeout(museumPreloadHandle);
      museumPreloadHandle = null;
    }
    function scheduleMuseumPreload() {
      if (
        museumWorld ||
        museumPreloadStarted ||
        museumPreloadHandle !== null ||
        transitStage !== "BUS_DRIVE"
      )
        return;
      const prepare = () => {
        museumPreloadHandle = null;
        if (museumWorld || transitStage !== "BUS_DRIVE") return;
        museumPreloadStarted = true;
        // Build into an off-screen scene so the city renderer never traverses
        // museum draw calls. Compile from the real entrance camera to upload
        // nearby geometry and shaders before the bus door interaction.
        museumPreloadScene = new THREE.Scene();
        museumWorld = new NaturalHistoryMuseumWorld(
          museumPreloadScene,
          textures,
          quality.getSnapshot().profile.foliageDensity,
          totalFollowerCount() + 1,
        );
        const preloadCamera = new THREE.PerspectiveCamera(
          67,
          innerWidth / innerHeight,
          0.07,
          museumWorld.environmentSettings.cameraFar,
        );
        preloadCamera.position.copy(museumWorld.spawn);
        preloadCamera.rotation.order = "YXZ";
        preloadCamera.rotation.y = museumWorld.spawnYaw;
        // Parallel shader compilation avoids a long main-thread stall during
        // the shuttle drive. A failed warm-up safely falls through to Three's
        // normal first render rather than blocking the active scene.
        void renderer.compileAsync(museumPreloadScene, preloadCamera).catch(() => undefined);
      };
      museumPreloadHandle =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(prepare, { timeout: 2400 })
          : window.setTimeout(prepare, 32);
    }
    function checkpoint(
      station: SubwayStationId,
      message: string,
      waitForNextTrain = false,
      preserveAnnouncements = false,
      resumeAtPlatform = false,
    ) {
      disposeInterior();
      if (stationWorld) subwayProgress = stationWorld.progressState;
      stationWorld ??= createStationWorld(station, travelDirection);
      currentStation = station;
      stationWorld
        .setStation(station, travelDirection)
        .restoreProgressState(subwayProgress);
      player.copy(stationWorld.checkpointSpawn(resumeAtPlatform));
      velocity.set(0, 0, 0);
      yaw = 0;
      pitch = -0.04;
      stationClock = waitForNextTrain ? 18 : 0;
      boarded = null;
      stationWorld.update(stationClock);
      previousTrainPhase = stationWorld.trainPhase;
      previousDoorsOpen = stationWorld.doorsOpen;
      previousStreetMix = stationWorld.streetEnvironmentMix(player);
      const nextStage: TransitStage =
        travelDirection === "RETURN"
          ? station === "FIFTH_AV"
            ? "RETURN_FIFTH_AV"
            : station === "LEXINGTON"
              ? "RETURN_LEXINGTON"
              : "RETURN_WEST_FARMS"
          : station === "FIFTH_AV"
            ? "FIFTH_AV"
            : station === "LEXINGTON"
              ? "LEXINGTON"
              : "WEST_FARMS";
      setTransitStage(nextStage);
      applyBudget();
      setReturnLeg(travelDirection === "RETURN" ? station : "OUTBOUND");
      // Publish the checkpoint's real service immediately. Debug jumps and
      // streamed station arrivals must never flash the previous leg's route
      // while the first animation frame and texture uploads are settling.
      const fifth = station === "FIFTH_AV",
        lex = station === "LEXINGTON",
        returning = travelDirection === "RETURN",
        fareObjective = stationWorld.fareObjective,
        arrivingRoute = stationWorld.arrivingService.route;
      const target = stationWorld.waypoint,
        targetX = target.x - player.x,
        targetZ = target.z - player.z,
        distance = Math.hypot(targetX, targetZ);
      const objective =
        fareObjective ??
        (returning
          ? fifth
            ? "Exit at Fifth Avenue and lead your friends into Central Park"
            : lex
              ? `Transfer here to a downtown ${arrivingRoute} train for Fifth Avenue`
              : "Take the downtown 5 to Lexington Av; transfer to N / R there"
          : fifth
            ? `Take the Queens-bound ${arrivingRoute} train one stop`
            : lex
              ? "Choose the uptown 5 platform from the paid concourse"
              : "Exit toward the Bronx Zoo");
      const waypoint = fareObjective
        ? fareObjective.startsWith("Collect")
          ? "Fare machine"
          : "MetroCard turnstiles"
        : returning
          ? fifth
            ? "Central Park street exit"
            : lex
              ? `Separate Broadway platform · downtown ${arrivingRoute}`
              : "Downtown 5 platform · opposite arrival side"
          : fifth
            ? `Queens-bound ${arrivingRoute}`
            : lex
              ? "Lexington Line platform · uptown 5"
              : "Bronx Zoo exit";
      const routeStatus = `${arrivingRoute} TRAIN`,
        status = fareObjective
          ? fareObjective.startsWith("Collect")
            ? "FARE UNPAID · GET CARD"
            : "METROCARD READY · SWIPE"
          : returning && fifth
            ? "CENTRAL PARK · STREET EXIT"
            : !returning && station === "WEST_FARMS"
              ? "ANIMAL TRACKS · NORTH EXIT"
              : stationWorld.doorsOpen
                ? `${routeStatus} · DOORS OPEN`
                : stationWorld.trainPhase === "APPROACHING"
                  ? `${routeStatus} APPROACHING`
                  : stationWorld.trainPhase === "BOARDING"
                    ? `${routeStatus} ARRIVED`
                    : `NEXT ${routeStatus} · ${stationWorld.secondsToTrain}s`;
      setHud({
        bearing: 0,
        distance,
        motion: returning && fifth ? "ASCENDING" : "IN STATION",
        objective,
        objectiveShort: fareObjective
          ? fareObjective.startsWith("Collect")
            ? "METROCARD"
            : "SWIPE"
          : returning
            ? fifth
              ? "PARK EXIT"
              : lex
                ? "TRANSFER"
                : "DOWNTOWN 5"
            : fifth
              ? arrivingRoute
              : lex
                ? "TRANSFER"
                : "EXIT",
        prompt: "",
        promptKey: "",
        station: fifth
          ? returning
            ? "5 AV / 59 ST · RETURN"
            : "5 AV / 59 ST · UPTOWN TRIP"
          : lex
            ? "LEXINGTON AV / 59 ST · PAID CONCOURSE"
            : "WEST FARMS SQ · E TREMONT AV",
        status,
        value: fareObjective
          ? fareObjective.startsWith("Collect")
            ? "CARD"
            : "SWIPE"
          : (returning && fifth) || (!returning && station === "WEST_FARMS")
            ? `${Math.round(distance)}M`
            : stationWorld.doorsOpen
              ? "OPEN"
              : `${stationWorld.secondsToTrain}S`,
        waypoint,
        wayfinding: true,
      });
      if (rescuedParty.isActive) rescuedParty.reset(player, player.y - 1.48);
      if (garyCompanion.isFed) {
        garyCompanion.setVisible(true);
        garyCompanion.reset(player, player.y - 1.48);
      }
      if (animalMenagerie.isActive) {
        animalMenagerie.reset(player, player.y - 1.48, yaw);
      }
      if (!preserveAnnouncements) audio.cancelTransitAnnouncements();
      audio.setScene(
        station === "WEST_FARMS" ? "west-farms" : "subway-station",
        {
          transitionSeconds: 1.15,
          intensity: travelDirection === "RETURN" ? 0.72 : 0.62,
        },
      );
      if (station !== "FIFTH_AV" && travelDirection === "OUTBOUND")
        audio.playTransitAnnouncement(
          station === "LEXINGTON" ? "lex_5_platform" : "west_farms_arrival",
          { delaySeconds: 0.45, dedupeSeconds: 0 },
        );
      showTransition(
        station === "FIFTH_AV"
          ? "5 Av / 59 St"
          : station === "LEXINGTON"
            ? "Lexington Av / 59 St"
            : "West Farms Sq · E Tremont Av",
      );
      showToast(message, 4600);
    }
    function finishRide() {
      if (!boarded?.destination) return;
      audio.playQuestComplete();
      const destination = boarded.destination;
      const message =
        destination === "LEXINGTON"
          ? travelDirection === "RETURN"
            ? "Lexington Av / 59 St — keep your friends close and take a downtown N or R train for Fifth Avenue"
            : "Lexington Av / 59 St — take the uptown 5 for the Bronx, or a downtown N / R to ride back to Fifth Avenue"
          : destination === "WEST_FARMS"
            ? travelDirection === "RETURN"
              ? "West Farms Sq–E Tremont Av — the downtown 5 returns to Manhattan whenever you are ready"
              : "West Farms Sq–E Tremont Av — follow the north exit toward the Bronx Zoo, or ride the downtown 5 back"
            : travelDirection === "RETURN"
              ? `5 Av / 59 St — lead ${friendCountLabel(totalFollowerCount())} up the street stairs and back into Central Park`
              : "5 Av / 59 St — take a Queens-bound N or R to continue toward the Bronx";
      checkpoint(
        destination,
        message,
        false,
        true,
        destination !== "LEXINGTON",
      );
    }
    function failRide(
      event: Extract<
        TrainInteriorEvent,
        { type: "PUSHED_OUT" | "MISSED_STOP" }
      >,
    ) {
      audio.playFailure();
      const message =
        event.type === "PUSHED_OUT"
          ? `The crowd carried you and the rescued group onto the platform at ${event.stop}. Checkpoint restored — wait for the next train.`
          : `You missed ${event.stop}. Checkpoint restored — wait for the next train.`;
      checkpoint(currentStation, message, true, false, true);
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
          ...(animalMenagerie.has("central-park-mallard")
            ? [{ species: "mallard-duck" as const, quality: animalQuality }]
            : []),
          ...(animalMenagerie.has("central-park-squirrel")
            ? [{ species: "eastern-gray-squirrel" as const, quality: animalQuality }]
            : []),
        ]).catch(() => undefined);
      }
      const base = TRAIN_INTERIOR_JOURNEYS[option.journeyKey];
      const journey: TrainInteriorJourney = {
        ...base,
        route: option.route as TrainInteriorJourney["route"],
      };
      subwayProgress = stationWorld.progressState;
      stationWorld.dispose();
      stationWorld = null;
      interiorWorld = new TrainInteriorWorld(
        scene,
        textures,
        journey,
        quality.getSnapshot().activeLevel === "low" ||
          quality.getSnapshot().activeLevel === "medium"
          ? "mobile"
          : "desktop",
      );
      player.copy(interiorWorld.spawn);
      velocity.set(0, 0, 0);
      yaw = 0;
      pitch = -0.035;
      keys.clear();
      setTransitStage("RIDING");
      audio.setScene("moving-train", {
        transitionSeconds: 0.7,
        intensity: 0.78,
      });
      audio.playTrainChime("doors-closing");
      audio.playTrainDoors("close");
      audio.playTransitAnnouncement("stand_clear_doors", {
        delaySeconds: 0.35,
        dedupeSeconds: 4,
      });
      showTransition(`${option.route} train · ${option.direction}`);
      const rideMessage =
        option.journeyKey === "FIFTH_TO_LEXINGTON"
          ? "Ride one stop to Lexington Avenue. Use any illuminated platform-side door when it appears."
          : option.journeyKey === "LEXINGTON_TO_WEST_FARMS"
            ? "Stay clear at 86 St, 125 St, and E 180 St. Exit at West Farms for the Bronx Zoo."
            : option.journeyKey === "WEST_FARMS_TO_LEXINGTON"
              ? `Keep ${friendCountLabel(totalFollowerCount())} together through E 180 St, 125 St, and 86 St, then exit at Lexington Avenue.`
              : "Ride one stop downtown and exit with every friend at Fifth Avenue for Central Park.";
      const nextStop =
        journey.intermediateStops[0]?.name ?? journey.destination.name;
      setHud({
        bearing: 0,
        distance: 0,
        motion: "RIDING",
        objective: rideMessage,
        objectiveShort: "ON TRAIN",
        prompt: "",
        promptKey: "",
        station: `${option.route} · NEXT ${nextStop.toUpperCase()}`,
        status: `NEXT STOP · ${nextStop.toUpperCase()}`,
        value: "ONBOARD",
        waypoint: "Center aisle",
        wayfinding: false,
      });
      showToast(rideMessage, 6200);
      if (rescuedParty.isActive) rescuedParty.reset(player, 0);
      if (garyCompanion.isFed) {
        garyCompanion.setVisible(true);
        garyCompanion.reset(player, 0);
      }
      animalMenagerie.setVisible(true);
      animalMenagerie.reset(player, 0, yaw);
    }
    function boardThroughOpenDoor(option: BoardingOption) {
      if (transitStage === "RIDING") return;
      if (!option.journeyKey || !option.destination) {
        player.copy(playerBeforeMovement);
        velocity.set(0, 0, 0);
        showToast(
          `${option.route} ${option.direction.toLowerCase()} continues beyond this playable route. Cross to the signed platform for the next in-city stop.`,
          4200,
        );
        return;
      }
      boarded = option;
      velocity.set(0, 0, 0);
      startInterior(option);
    }
    function enterBronxZoo(sessionSeed?: number) {
      if (
        !stationWorld ||
        transitStage === "BRONX_ZOO" ||
        transitStage === "COMPLETE"
      )
        return null;
      subwayProgress = stationWorld.progressState;
      stationWorld.dispose();
      stationWorld = null;
      zooWorld = new BronxZooWorld(
        scene,
        textures,
        quality.getSnapshot().profile.foliageDensity,
        sessionSeed,
      );
      const zooPresentation = zooWorld.environmentSettings;
      scene.background = new THREE.Color(zooPresentation.background);
      scene.fog = new THREE.FogExp2(zooPresentation.background, zooPresentation.fogDensity);
      camera.far = zooPresentation.cameraFar;
      camera.updateProjectionMatrix();
      player.copy(zooWorld.spawn);
      velocity.set(0, 0, 0);
      yaw = 0;
      pitch = -0.04;
      sloth.root.visible = true;
      sloth.setVehiclePose("none");
      setTransitStage("BRONX_ZOO");
      setZooPhase("ENTER_ZOO");
      audio.cancelTransitAnnouncements();
      audio.setScene("finale", { transitionSeconds: 1.5, intensity: 0.74 });
      showTransition("Bronx Zoo · Asia Gate");
      showToast(
        "Your island ticket is valid here. Enter the zoo and find the sloth conservation habitat.",
        6200,
      );
      const target = zooWorld.objectiveTarget,
        distance = Math.hypot(target.x - player.x, target.z - player.z);
      animalMenagerie.setVisible(true);
      animalMenagerie.reset(
        player,
        zooWorld.floorHeight(player.x, player.z),
        yaw,
      );
      publishFollowerCount();
      setTicketHeld(true);
      setHud({
        bearing: 0,
        distance,
        motion: "ZOO EXPLORATION",
        objective: zooWorld.objectiveLabel,
        objectiveShort: "ENTER ZOO",
        prompt: "",
        promptKey: "",
        station: "BRONX ZOO · WILDLIFE CONSERVATION CAMPUS",
        status: totalFollowerCount()
          ? companionStatus(totalFollowerCount())
          : "ISLAND TICKET READY",
        value: `${Math.round(distance)}M`,
        waypoint: "Asia Gate",
        wayfinding: true,
      });
      return zooWorld;
    }
    const closeLockPicking = () => {
      lockPickingRef.current = false;
      setLockPicking(false);
      keys.clear();
      velocity.set(0, 0, 0);
      actionRequested = false;
    };
    completeLockPickRef.current = () => {
      if (!lockPickingRef.current || !zooWorld) return;
      const event = zooWorld.completeLockPicking();
      closeLockPicking();
      rescuedParty.setActive(
        true,
        player,
        zooWorld.floorHeight(player.x, player.z),
      );
      publishFollowerCount();
      setZooPhase(zooWorld.questState);
      audio.playQuestComplete();
      showToast(event.message, 6800);
    };
    cancelLockPickRef.current = () => {
      if (!lockPickingRef.current) return;
      closeLockPicking();
      setZooPhase(zooWorld?.questState ?? "FIND_SLOTHS");
      showToast(
        "You ease off the plug without damaging the lock. Press E when you are ready to try again.",
        4200,
      );
    };
    const recruitHabitatQuestAnimals = (questId: ZooSideQuestId) => {
      if (!zooWorld) return [];
      const recruited = ZOO_SIDE_QUESTS[questId].recruitedSpecies;
      const floorY = zooWorld.floorHeight(player.x, player.z);
      recruited.forEach((id, index) => {
        const spawn = player
          .clone()
          .add(
            new THREE.Vector3(
              (index % 2 ? 1 : -1) * (1.2 + index * 0.24),
              -1.48,
              2.4 + index * 0.72,
            ),
          );
        animalMenagerie.recruit(id, spawn, floorY);
      });
      publishFollowerCount();
      setZooPhase(zooWorld.questState);
      audio.playQuestComplete();
      return recruited;
    };
    const reflectHabitatQuestEvent = (event: BronxZooEvent) => {
      if (!event.questId || !event.kind.startsWith("ANIMAL_QUEST_")) return;
      if (event.kind === "ANIMAL_QUEST_FOCUS_REQUIRED") {
        showToast(event.message, 3600);
        return;
      }
      if (event.kind === "ANIMAL_QUEST_OPERATION_STARTED") {
        audio.playZooQuestCue(IN_WORLD_QUEST_CUES[event.questId], (event.step ?? 1) - 1);
        setZooPhase(`IN_WORLD_QUEST_${event.questId.toUpperCase()}`);
        showToast(event.message, 4200);
        return;
      }
      audio.playZooQuestCue(
        event.kind === "ANIMAL_QUEST_COMPLETED" ? "success" : IN_WORLD_QUEST_CUES[event.questId],
        (event.step ?? 1) - 1,
      );
      if (event.kind === "ANIMAL_QUEST_COMPLETED") {
        if (event.firstCompletion !== false) {
          const recruited = recruitHabitatQuestAnimals(event.questId);
          showToast(
            `${event.message} ${recruited.length === 1 ? "A new animal ambassador joins" : `${recruited.length} new animal ambassadors join`} your menagerie.`,
            7600,
          );
        } else {
          setZooPhase(zooWorld?.questState ?? "FIND_SLOTHS");
          audio.playQuestComplete();
          showToast(event.message, 6800);
        }
      } else {
        setZooPhase(`IN_WORLD_QUEST_${event.questId.toUpperCase()}`);
        showToast(event.message, event.kind === "ANIMAL_QUEST_STARTED" ? 5800 : 4600);
      }
    };
    function startBusDrive(
      startProgress = 0,
      reviewSpawn?:
        | "missed-exit"
        | "uws-reroute"
        | "traffic-impact"
        | "rear-impact"
        | "building-impact"
        | "failure-impact",
    ) {
      if (!rescuedParty.isActive || transitStage === "COMPLETE") return null;
      if (zooWorld) {
        zooWorld.dispose();
        zooWorld = null;
      }
      skateboarding = false;
      scooterRiding = false;
      rescuedParty.setScooterMode(false);
      garyCompanion.setScooterMode(false);
      animalMenagerie.setScooterMode(false);
      animalMenagerie.setVisible(false);
      setMobilityMode(null);
      if (stationWorld) {
        subwayProgress = stationWorld.progressState;
        stationWorld.dispose();
        stationWorld = null;
      }
      disposeInterior();
      cityBusWorld?.dispose();
      cityBusWorld = new CityBusWorld(
        scene,
        textures,
        quality.getSnapshot().profile.foliageDensity,
        startProgress,
        reviewSpawn,
      );
      void preloadAuthoredZooAnimals([
        { species: "whiskers-cat", quality: quality.getSnapshot().profile.foliageDensity },
      ]).catch(() => undefined);
      busFailureAt = null;
      setBusIntegrity(Math.round(cityBusWorld.integrity * 100));
      setBusGear(cityBusWorld.gearDisplay);
      setBusGearLimit(cityBusWorld.gearTopSpeedMetersPerSecond);
      setBusImpactStatus("none");
      setBusReviewMode(reviewSpawn ?? "standard");
      setBusMap(cityBusWorld.minimapSnapshot);
      previousBusRouteStatus = cityBusWorld.routeStatus;
      scene.background = new THREE.Color("#91a6aa");
      scene.fog = new THREE.FogExp2("#8d9c9e", 0.0032);
      renderer.toneMappingExposure = 1.28;
      camera.far = 540;
      camera.updateProjectionMatrix();
      player.copy(cityBusWorld.cameraPosition);
      velocity.set(0, 0, 0);
      yaw = 0;
      pitch = -0.04;
      keys.clear();
      rescuedParty.root.visible = false;
      garyCompanion.setVisible(false);
      sloth.root.visible = true;
      setTransitStage("BUS_DRIVE");
      setReturnLeg("MUSEUM_SHUTTLE");
      reflectRescueState("BUS_DRIVE");
      setVehicleSpeed(0);
      renderer.shadowMap.autoUpdate = true;
      applyBudget();
      audio.cancelTransitAnnouncements();
      audio.setScene("moving-train", {
        transitionSeconds: 1.2,
        intensity: 0.8,
      });
      audio.setCartMotor(true, 0);
      const aboard = totalFollowerCount();
      showTransition("Museum shuttle · Bronx to Manhattan");
      showToast(
        `${animalCountLabel(aboard)} are aboard for a continuous free-driving trip. Shift between four speed bands with R / F, then dodge traffic through the connected city route. W accelerates, S brakes or reverses, A / D steer, and Space is the handbrake.`,
        9200,
      );
      setHud({
        bearing: 0,
        distance: cityBusWorld.remainingMeters,
        motion: "DRIVING",
        objective: cityBusWorld.navigationInstruction,
        objectiveShort: "DRIVE TO AMNH",
        prompt: "",
        promptKey: "",
        progress: cityBusWorld.routeCompletion,
        station: `${cityBusWorld.currentRoad.toUpperCase()} · MUSEUM SHUTTLE`,
        status:
          cityBusWorld.routeStatus === "AUTHORED ROUTE · FREE STEERING"
            ? `${friendCountLabel(aboard).toUpperCase()} ABOARD`
            : cityBusWorld.routeStatus,
        value: `${Math.round(cityBusWorld.remainingMeters)}M`,
        waypoint: cityBusWorld.navigationInstruction,
        wayfinding: true,
      });
      return cityBusWorld;
    }
    function enterMuseum(
      review:
        | "entry"
        | "rotunda"
        | "collections"
        | "african"
        | "megatherium" = "entry",
    ) {
      if (transitStage === "COMPLETE") return null;
      cancelMuseumPreload();
      if (cityBusWorld) {
        cityBusWorld.dispose();
        cityBusWorld = null;
      }
      setBusMap(null);
      if (stationWorld) {
        subwayProgress = stationWorld.progressState;
        stationWorld.dispose();
        stationWorld = null;
      }
      if (zooWorld) {
        zooWorld.dispose();
        zooWorld = null;
      }
      disposeInterior();
      audio.setCartMotor(false);
      setVehicleSpeed(0);
      sloth.setVehiclePose("none");
      skateboarding = false;
      scooterRiding = false;
      rescuedParty.setScooterMode(false);
      garyCompanion.setScooterMode(false);
      animalMenagerie.setScooterMode(false);
      setMobilityMode(null);
      if (!museumWorld)
        museumWorld = new NaturalHistoryMuseumWorld(
          scene,
          textures,
          quality.getSnapshot().profile.foliageDensity,
          totalFollowerCount() + 1,
        );
      else scene.add(museumWorld.root);
      museumPreloadScene = null;
      museumWorld.root.visible = true;
      const presentation = museumWorld.environmentSettings;
      scene.background = new THREE.Color(presentation.background);
      scene.fog = new THREE.FogExp2(presentation.fog, presentation.fogDensity);
      renderer.toneMappingExposure = presentation.toneMappingExposure;
      camera.fov = 67;
      camera.far = presentation.cameraFar;
      camera.updateProjectionMatrix();
      player.copy(museumWorld.spawn);
      if (review === "rotunda") player.set(0, 1.48, 15);
      else if (review === "collections") player.set(0, 1.48, -72);
      else if (review === "african") player.set(19, 1.48, -80);
      else if (review === "megatherium") player.set(12, 1.48, -178);
      museumCompletionArmed = review !== "megatherium";
      velocity.set(0, 0, 0);
      yaw =
        review === "megatherium"
          ? 0.52
          : review === "african"
            ? -2.3
            : museumWorld.spawnYaw;
      pitch =
        review === "megatherium" ? 0.18 : review === "african" ? 0.08 : -0.04;
      rescuedParty.root.visible = true;
      rescuedParty.reset(player, museumWorld.floorHeight());
      if (garyCompanion.isFed) {
        garyCompanion.setVisible(true);
        garyCompanion.reset(player, museumWorld.floorHeight());
      }
      animalMenagerie.setVisible(true);
      animalMenagerie.reset(player, museumWorld.floorHeight(), yaw);
      sloth.root.visible = true;
      setTransitStage("MUSEUM");
      setReturnLeg("NATURAL_HISTORY_MUSEUM");
      reflectRescueState("MUSEUM");
      audio.setScene("finale", { transitionSeconds: 1.5, intensity: 0.82 });
      applyBudget();
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.needsUpdate = true;
      showTransition(
        review === "megatherium"
          ? "Fossil Mammal Halls · Floor 4"
          : "American Museum of Natural History",
      );
      showToast(
        "Bring every friend through the museum and find Megatherium americanum. A tan and white resident cat named Whiskers has left a brass pawprint trail from the rotunda.",
        8200,
      );
      museumWorld.nearestMegatheriumViewingTarget(
        player,
        museumGatheringTarget,
      );
      const distance = Math.hypot(
        museumGatheringTarget.x - player.x,
        museumGatheringTarget.z - player.z,
      );
      setHud({
        bearing: 0,
        distance,
        motion: "MUSEUM EXPLORATION",
        objective: museumWorld.objectiveLabel,
        objectiveShort: "MEGATHERIUM",
        prompt: "",
        promptKey: "",
        station: "AMNH · THEODORE ROOSEVELT ROTUNDA",
        status: companionStatus(totalFollowerCount()),
        value: `${Math.round(distance)}M`,
        waypoint: "Megatherium · Fossil Mammal Halls",
        wayfinding: true,
      });
      return museumWorld;
    }
    function museumMissionReady() {
      if (
        !museumCompletionArmed ||
        !museumWorld ||
        transitStage !== "MUSEUM" ||
        !museumWorld.megatheriumNearby(player)
      )
        return false;
      return allFollowersWithin(
        museumWorld.megatheriumGatheringTarget,
        museumWorld.megatheriumGatheringRadius + (scooterRiding ? 2 : 0),
      );
    }
    function completeMission() {
      if (!museumMissionReady() || !museumWorld) return;
      setTransitStage("COMPLETE");
      scooterRiding = false;
      museumWorld.setScooterConvoyActive(false, player, yaw);
      rescuedParty.setScooterMode(false);
      garyCompanion.setScooterMode(false);
      animalMenagerie.setScooterMode(false);
      setMobilityMode(null);
      setZooPhase("COMPLETE");
      velocity.set(0, 0, 0);
      rescuedParty.stageFinale(
        museumWorld.megatheriumTarget,
        (x, z) => museumWorld?.floorHeight(x, z) ?? 0,
      );
      garyCompanion.stageFinale(
        museumWorld.megatheriumTarget,
        (x, z) => museumWorld?.floorHeight(x, z) ?? 0,
      );
      animalMenagerie.stageFinale(
        museumWorld.megatheriumTarget,
        (x, z) => museumWorld?.floorHeight(x, z) ?? 0,
        garyCompanion.isFed ? 5 : 4,
      );
      camera.position.copy(museumWorld.cameraPosition);
      camera.lookAt(museumWorld.cameraTarget);
      sloth.root.visible = false;
      audio.setScene("finale", { transitionSeconds: 0.8, intensity: 0.98 });
      audio.playQuestComplete();
      showTransition("Megatherium · Friends reunited with history");
      if (document.pointerLockElement) {
        try {
          document.exitPointerLock();
        } catch {}
      }
    }
    function enterCentralPark() {
      if (
        !stationWorld ||
        travelDirection !== "RETURN" ||
        currentStation !== "FIFTH_AV"
      )
        return null;
      stationWorld.dispose();
      stationWorld = null;
      parkReturnWorld = new CentralParkReturnWorld(
        scene,
        textures,
        quality.getSnapshot().profile.foliageDensity,
      );
      const presentation = parkReturnWorld.environmentSettings;
      scene.background = new THREE.Color(presentation.background);
      scene.fog = new THREE.FogExp2(presentation.fog, presentation.fogDensity);
      renderer.toneMappingExposure = presentation.toneMappingExposure;
      camera.far = presentation.cameraFar;
      camera.updateProjectionMatrix();
      player.copy(parkReturnWorld.spawn);
      velocity.set(0, 0, 0);
      yaw = parkReturnWorld.spawnYaw;
      pitch = -0.04;
      rescuedParty.reset(
        player,
        parkReturnWorld.floorHeight(player.x, player.z),
      );
      if (garyCompanion.isFed) {
        garyCompanion.setVisible(true);
        garyCompanion.reset(
          player,
          parkReturnWorld.floorHeight(player.x, player.z),
        );
      }
      animalMenagerie.setVisible(true);
      animalMenagerie.reset(
        player,
        parkReturnWorld.floorHeight(player.x, player.z),
        yaw,
      );
      setTransitStage("CENTRAL_PARK");
      applyBudget();
      setReturnLeg("CENTRAL_PARK");
      setZooPhase("HOME_GROVE");
      audio.setScene("central-park", {
        transitionSeconds: 1.5,
        intensity: 0.82,
      });
      showTransition("Central Park · Home Grove");
      showToast(
        "You made it back. Bring the whole menagerie to the grove beside the trees where your journey began.",
        6200,
      );
      const distance = Math.hypot(
        parkReturnWorld.sanctuaryTarget.x - player.x,
        parkReturnWorld.sanctuaryTarget.z - player.z,
      );
      setHud({
        bearing: 0,
        distance,
        motion: "HOMEWARD",
        objective: `Bring ${friendCountLabel(totalFollowerCount())} to the Home Grove`,
        objectiveShort: "HOME GROVE",
        prompt: "",
        promptKey: "",
        station: "CENTRAL PARK · HOME GROVE",
        status: companionStatus(totalFollowerCount()),
        value: `${Math.round(distance)}M`,
        waypoint: "Home Grove sanctuary",
        wayfinding: true,
      });
      return parkReturnWorld;
    }
    function completeHomeMission() {
      if (
        !parkReturnWorld ||
        transitStage !== "CENTRAL_PARK" ||
        !allFollowersWithin(parkReturnWorld.sanctuaryTarget, 11.5)
      )
        return;
      setTransitStage("COMPLETE");
      setZooPhase("COMPLETE");
      velocity.set(0, 0, 0);
      rescuedParty.stageFinale(
        parkReturnWorld.sanctuaryTarget,
        (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0,
      );
      garyCompanion.stageFinale(
        parkReturnWorld.sanctuaryTarget,
        (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0,
      );
      animalMenagerie.stageFinale(
        parkReturnWorld.sanctuaryTarget,
        (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0,
        garyCompanion.isFed ? 5 : 4,
      );
      camera.position.copy(parkReturnWorld.cameraPosition);
      camera.lookAt(parkReturnWorld.cameraTarget);
      sloth.root.visible = false;
      audio.setScene("finale", { transitionSeconds: 0.8, intensity: 0.96 });
      audio.playQuestComplete();
      showTransition("Central Park · Friends home");
      if (document.pointerLockElement) {
        try {
          document.exitPointerLock();
        } catch {}
      }
    }
    function handleInteriorEvent(event: TrainInteriorEvent | null) {
      if (!event) return;
      if (event.type === "PUSHED_OUT" || event.type === "MISSED_STOP") {
        failRide(event);
        return;
      }
      if (event.type === "INTERMEDIATE_STOP") {
        audio.playTrainChime("arrival");
        audio.playTrainDoors("open");
        audio.playCrowdBed(0.9, 3.2);
        const returnCue = event.stop.startsWith("86")
          ? "southbound_5_86"
          : event.stop.startsWith("125")
            ? "southbound_5_125"
            : "southbound_5_e180";
        const outboundCue = event.stop.startsWith("86")
          ? "stop_86"
          : event.stop.startsWith("125")
            ? "stop_125"
            : "stop_e180";
        audio.playTransitAnnouncement(
          boarded?.journeyKey === "WEST_FARMS_TO_LEXINGTON"
            ? returnCue
            : outboundCue,
          { delaySeconds: 0.25, dedupeSeconds: 4 },
        );
        showToast(
          `${event.stop} — next stop ${event.nextStop}. Stand back while passengers exit.`,
          4200,
        );
      } else if (event.type === "DESTINATION_READY") {
        audio.playTrainChime("transfer");
        audio.playTrainDoors("open");
        let destinationCallout = `${event.stop} — use any illuminated platform-side door and make sure ${friendCountLabel(totalFollowerCount())} exit with you`;
        if (boarded?.journeyKey === "FIFTH_TO_LEXINGTON")
          audio.playTransitAnnouncement("lex_arrival_transfer", {
            delaySeconds: 0.2,
            dedupeSeconds: 4,
          });
        else if (boarded?.journeyKey === "LEXINGTON_TO_WEST_FARMS")
          audio.playTransitAnnouncement("west_farms_arrival", {
            delaySeconds: 0.2,
            dedupeSeconds: 4,
          });
        else if (boarded?.journeyKey === "WEST_FARMS_TO_LEXINGTON") {
          audio.playTransitAnnouncement("southbound_5_lexington_transfer", {
            delaySeconds: 0.2,
            dedupeSeconds: 4,
          });
          destinationCallout = `${event.stop} — exit with ${friendCountLabel(totalFollowerCount())}, then transfer here to a downtown N or R train for 5 Av / 59 St`;
        } else if (boarded?.journeyKey === "LEXINGTON_TO_FIFTH") {
          audio.playTransitAnnouncement("downtown_nr_fifth_arrival", {
            delaySeconds: 0.2,
            dedupeSeconds: 4,
          });
          destinationCallout = `${event.stop} — exit with ${friendCountLabel(totalFollowerCount())} and follow the signed street stairs to Central Park`;
        }
        showToast(destinationCallout, 4300);
      } else if (event.type === "WRONG_DOOR")
        showToast(
          "That is not the platform side — follow the illuminated doorway",
          2600,
        );
      else if (event.type === "ARRIVED") finishRide();
    }

    const qaInput = requestedGameCheckpoint(location.search, location.hostname);
    const qaZooSideQuest = qaInput ? QA_ZOO_SIDE_QUESTS[qaInput] : undefined;
    if (qaInput === "lexingtontransfer")
      checkpoint(
        "LEXINGTON",
        "QA checkpoint · paid-area transfer platform",
        false,
        false,
        true,
      );
    else if (qaInput === "lexington" || qaInput === "trainride5")
      checkpoint("LEXINGTON", "QA checkpoint · Lexington Av / 59 St");
    else if (
      [
        "westfarms",
        "bronxentry",
        "bronxcitynorth",
        "bronxcityeast",
        "bronxcitywest",
        "bronxpolar",
        "bronxgaryfed",
        "bronxbirds",
        "bronxmonkeys",
        ...Object.keys(QA_ZOO_SIDE_QUESTS),
        "bronxsloths",
        "rescuefollowers",
      ].includes(qaInput ?? "")
    )
      checkpoint("WEST_FARMS", "QA checkpoint · West Farms Sq–E Tremont Av");
    if (
      ["subway", "subwayplatform", "lexington"].includes(qaInput ?? "") &&
      stationWorld
    ) {
      stationClock = 6;
      stationWorld.update(stationClock);
    }
    if (["subwayplatform", "lexington"].includes(qaInput ?? "")) {
      // Stand opposite the center doorway so visual QA captures the open,
      // illuminated vestibule instead of the blank side of an adjacent car.
      player.set(-3.72, 1.48, -10);
      yaw = -Math.PI / 2;
    }
    if (qaInput === "trainride" && stationWorld)
      startInterior({
        correct: true,
        destination: "LEXINGTON",
        direction: "QUEENS-BOUND",
        journeyKey: "FIFTH_TO_LEXINGTON",
        route: "N",
        station: "FIFTH_AV",
      });
    if (qaInput === "trainride5" && stationWorld)
      startInterior({
        correct: true,
        destination: "WEST_FARMS",
        direction: "UPTOWN / BRONX",
        journeyKey: "LEXINGTON_TO_WEST_FARMS",
        route: "5",
        station: "LEXINGTON",
      });
    if (
      [
        "bronxentry",
        "bronxcitynorth",
        "bronxcityeast",
        "bronxcitywest",
        "bronxpolar",
        "bronxgaryfed",
        "bronxbirds",
        "bronxmonkeys",
        ...Object.keys(QA_ZOO_SIDE_QUESTS),
        "bronxsloths",
        "rescuefollowers",
        "busboarding",
      ].includes(qaInput ?? "") &&
      stationWorld
    ) {
      // The contact-focused monkey review opens on the north anchor, the
      // shortest clear visitor sightline to the measured canopy support rig.
      // Other review routes keep the long-standing deterministic seed.
      const reviewWorld = enterBronxZoo(qaInput === "bronxquestmonkeyfocus" ? 73002 : 73021);
      if (reviewWorld) {
        if (qaZooSideQuest) {
          const [x, z] = qaZooSideQuest.position;
          player.set(x, reviewWorld.floorHeight(x, z) + 1.48, z);
          yaw = qaZooSideQuest.yaw;
        } else if (qaInput === "bronxentry") {
          player.copy(reviewWorld.entryReviewSpawn);
          // Frame the grounded donor, parked skateboard, and already-open
          // admission gate together so the direct debug route reviews the
          // complete arrival interaction instead of pointing into the kiosk.
          yaw = -.98;
          pitch = -.045;
        }
        else if (["bronxcitynorth", "bronxcityeast", "bronxcitywest"].includes(qaInput ?? "")) {
          player.set(0, reviewWorld.floorHeight(0, 24) + 1.48, 24);
          yaw = qaInput === "bronxcitynorth" ? Math.PI : qaInput === "bronxcityeast" ? -Math.PI / 2 : Math.PI / 2;
          pitch = -.025;
        }
        // Start on the authored overlook, centered between glazing mullions.
        // The old spawn sat directly behind the west fence post and turned the
        // polar-bear review into a pair of screen-height black bars.
        else if (qaInput === "bronxpolar") {
          player.set(25, reviewWorld.floorHeight(25, -39) + 1.48, -39);
          yaw = -0.98;
        } else if (qaInput === "bronxgaryfed") {
          player.set(20, reviewWorld.floorHeight(20, -30) + 1.48, -30);
          yaw = 0;
          reviewWorld.setGaryFed(true);
          garyCompanion.feed(0, reviewWorld.floorHeight(39, -48));
          garyCompanion.stageQualityReview(player, yaw, (x, z) =>
            reviewWorld.floorHeight(x, z),
          );
          reflectGaryFed();
          sloth.root.visible = false;
        } else if (qaInput === "bronxbirds") {
          player.set(-26, reviewWorld.floorHeight(-26, -40) + 1.48, -40);
          yaw = 1;
        } else if (qaInput === "bronxmonkeys") {
          player.set(-24, reviewWorld.floorHeight(-24, -98) + 1.48, -98);
          yaw = 1.4;
        } else if (qaInput === "busboarding") {
          player.set(17.35, reviewWorld.floorHeight(17.35, 18.7) + 1.48, 18.7);
          yaw = Math.PI;
        } else player.copy(reviewWorld.habitatReviewSpawn);
        if (qaInput === "rescuefollowers" || qaInput === "busboarding") {
          reviewWorld.setFriendsReleased(true);
          rescuedParty.setActive(
            true,
            player,
            reviewWorld.floorHeight(player.x, player.z),
          );
          if (qaInput === "rescuefollowers") {
            yaw = 0;
            rescuedParty.stageQualityReview(player, yaw, (x, z) =>
              reviewWorld.floorHeight(x, z),
            );
            sloth.root.visible = false;
          }
          reflectRescueState("ESCORT_TO_BUS");
        }
        reviewWorld.update(0, 0, player);
        if (qaZooSideQuest) {
          const event = reviewWorld.beginAnimalQuest(qaZooSideQuest.questId);
          if (event?.kind === "ANIMAL_QUEST_STARTED") {
            if (qaZooSideQuest.focusCenter) {
              const focusTarget = reviewWorld.objectiveTarget;
              const focusDirection = new THREE.Vector3(
                qaZooSideQuest.focusCenter[0] - focusTarget.x,
                0,
                qaZooSideQuest.focusCenter[1] - focusTarget.z,
              ).normalize();
              const focusSide = new THREE.Vector3(-focusDirection.z, 0, focusDirection.x);
              player.copy(focusTarget)
                .addScaledVector(focusDirection, -1.72)
                .addScaledVector(focusSide, 1.52);
              player.y = reviewWorld.floorHeight(player.x, player.z) + 1.48;
              const viewDirection = new THREE.Vector3(
                qaZooSideQuest.focusCenter[0] - player.x,
                0,
                qaZooSideQuest.focusCenter[1] - player.z,
              ).normalize();
              yaw = Math.atan2(-viewDirection.x, -viewDirection.z);
              reviewWorld.update(0, 0, player, yaw);
            }
            // Standard review checkpoints remain staged at a clear visitor
            // overlook inside the enclosure-wide trigger. Teleporting onto
            // objectiveTarget placed the camera at the exact centre of the
            // first physical research station, so its post and equipment
            // filled the frame before the player could read the habitat.
            // Keep that authored overlook and let the waypoint lead naturally
            // to the first station. The local-only focus checkpoint above is
            // deliberately offset from the equipment for interaction QA.
            pitch = qaZooSideQuest.focusPitch ?? -.035;
            setZooPhase(`IN_WORLD_QUEST_${qaZooSideQuest.questId.toUpperCase()}`);
            showToast(event.message, 5200);
          }
        }
        // Publish after deterministic review setup so the very first rendered
        // frame already names the live station route instead of briefly
        // showing the unrelated sloth-lock objective.
        reflectZooReviewState(reviewWorld);
        if (qaInput !== "bronxentry") clearReviewToast();
      }
    }
    if (
      [
        "busbronx",
        "busdrive",
        "busexit",
        "busmissedexit",
        "buscity",
        "busreroute",
        "buscollision",
        "busrearimpact",
        "busbuilding",
        "busfailure",
        "busarrival",
        "museumentry",
        "museumwhiskers",
        "museumwhiskerstrail",
        "museumwhiskerstrust",
        "museumscooters",
        "museumgaryscooter",
        "museumrotunda",
        "museumcollections",
        "museumafrican",
        "museummegatherium",
        "museumfinale",
      ].includes(qaInput ?? "") &&
      stationWorld
    ) {
      rescuedParty.setActive(true, player, player.y - 1.48);
      if (qaInput === "museumgaryscooter") {
        garyCompanion.feed(0, player.y - 1.48);
        reflectGaryFed();
      }
      if (
        [
          "busbronx",
          "busdrive",
          "busexit",
          "busmissedexit",
          "buscity",
          "busreroute",
          "buscollision",
          "busrearimpact",
          "busbuilding",
          "busfailure",
          "busarrival",
        ].includes(qaInput ?? "")
      ) {
        const reviewProgress =
          qaInput === "busbronx"
            ? 18
            : qaInput === "busarrival"
              ? CITY_BUS_ROUTE_LENGTH - 12
              : qaInput === "busexit"
                ? CITY_BUS_EXIT_REVIEW_PROGRESS
                : qaInput === "buscity"
                  ? CITY_BUS_CITY_REVIEW_PROGRESS
                  : CITY_BUS_HIGHWAY_REVIEW_PROGRESS;
        startBusDrive(
          reviewProgress,
          qaInput === "busmissedexit"
            ? "missed-exit"
            : qaInput === "busreroute"
              ? "uws-reroute"
              : qaInput === "buscollision"
                ? "traffic-impact"
                : qaInput === "busrearimpact"
                  ? "rear-impact"
                  : qaInput === "busbuilding"
                    ? "building-impact"
                    : qaInput === "busfailure"
                      ? "failure-impact"
                      : undefined,
        );
      } else {
        const reviewMuseum = enterMuseum(
          qaInput === "museumentry" ||
            qaInput === "museumwhiskers" ||
            qaInput === "museumwhiskerstrail" ||
            qaInput === "museumwhiskerstrust" ||
            qaInput === "museumscooters" ||
            qaInput === "museumgaryscooter"
            ? "entry"
            : qaInput === "museumrotunda"
              ? "rotunda"
              : qaInput === "museumcollections"
                ? "collections"
                : qaInput === "museumafrican"
                  ? "african"
                  : "megatherium",
        );
        if ((qaInput === "museumwhiskers" || qaInput === "museumwhiskerstrail" || qaInput === "museumwhiskerstrust") && reviewMuseum) {
          // This authored rotunda sightline is collision-clear and keeps the
          // cat, architecture, entrance sign, and interaction prompt in view.
          // The former target-offset fallback could place the camera inside a
          // dinosaur plinth, producing a fog-gray void in the review scene.
          if (qaInput === "museumwhiskerstrust") reviewMuseum.stageWhiskersTrustMoment();
          const whiskersTarget = reviewMuseum.whiskersObjectiveTarget;
          if (qaInput === "museumwhiskerstrust") {
            player.copy(whiskersTarget).add(new THREE.Vector3(4.2, 0, 1.8));
            player.y = reviewMuseum.floorHeight(player.x, player.z) + 1.48;
            reviewMuseum.resolvePlayer(player, velocity);
          } else {
            player.set(-1.9, reviewMuseum.floorHeight(-1.9, 15) + 1.48, 15);
          }
          const whiskersDirection = whiskersTarget.clone().sub(player);
          yaw = Math.atan2(-whiskersDirection.x, -whiskersDirection.z);
          // Keep Whiskers visible at the edge of the trust-review frame without
          // auto-solving the gaze condition while the reviewer is still
          // waiting for the world to compile. A small deliberate look brings
          // her to centre and proves the live interaction.
          if (qaInput === "museumwhiskerstrust") yaw += innerWidth <= 600 ? .4 : .58;
          pitch = -0.16;
          if (qaInput === "museumwhiskerstrail") {
            const whiskersEvent = reviewMuseum.beginWhiskersTrail(gameTime);
            if (whiskersEvent) showToast(whiskersEvent.message, 5200);
            // enterMuseum has just published its Megatherium overview. Force
            // the next animation frame to replace that staging copy with the
            // live trail objective instead of waiting on the shared HUD clock.
            lastHud = Number.NEGATIVE_INFINITY;
          }
          if (qaInput === "museumwhiskerstrust") lastHud = Number.NEGATIVE_INFINITY;
        }
        if (
          (qaInput === "museumscooters" || qaInput === "museumgaryscooter") &&
          reviewMuseum
        ) {
          player.set(-10, reviewMuseum.floorHeight(-10, 39) + 1.48, 39);
          yaw = 0;
          rescuedParty.stageQualityReview(
            player,
            yaw,
            (x, z) => reviewMuseum.floorHeight(x, z),
            true,
          );
          if (qaInput === "museumgaryscooter")
            garyCompanion.stageQualityReview(
              player,
              yaw,
              (x, z) => reviewMuseum.floorHeight(x, z),
              true,
            );
          scooterRiding = true;
          reviewMuseum.setScooterConvoyActive(true, player, yaw);
          setMobilityMode("scooter");
          sloth.root.visible = false;
        }
        if (qaInput === "museumafrican") sloth.root.visible = false;
        if (qaInput === "museumfinale" && reviewMuseum) {
          museumCompletionArmed = true;
          player.copy(reviewMuseum.megatheriumTarget);
          rescuedParty.reset(player, reviewMuseum.floorHeight());
          completeMission();
        }
      }
    }
    if (
      [
        "returnwestfarms",
        "returntrain5",
        "returnlexington",
        "returntrainnr",
        "homecoming",
        "finale",
      ].includes(qaInput ?? "") &&
      stationWorld
    ) {
      travelDirection = "RETURN";
      const station: SubwayStationId =
        qaInput === "returnwestfarms" || qaInput === "returntrain5"
          ? "WEST_FARMS"
          : "LEXINGTON";
      checkpoint(
        station,
        "QA checkpoint · rescued friends return journey",
        false,
        false,
        true,
      );
      rescuedParty.setActive(true, player, player.y - 1.48);
      reflectRescueState("RETURN_TRANSIT");
      if (qaInput === "returntrain5" && stationWorld)
        startInterior({
          correct: true,
          destination: "LEXINGTON",
          direction: "DOWNTOWN / MANHATTAN",
          journeyKey: "WEST_FARMS_TO_LEXINGTON",
          route: "5",
          station: "WEST_FARMS",
        });
      else if (qaInput === "returntrainnr" && stationWorld)
        startInterior({
          correct: true,
          destination: "FIFTH_AV",
          direction: "DOWNTOWN / BROOKLYN",
          journeyKey: "LEXINGTON_TO_FIFTH",
          route: "N",
          station: "LEXINGTON",
        });
      else if (qaInput === "homecoming" || qaInput === "finale") {
        checkpoint(
          "FIFTH_AV",
          "QA checkpoint · Fifth Avenue return exit",
          false,
          false,
          true,
        );
        const reviewPark = enterCentralPark();
        if (qaInput === "finale" && reviewPark) {
          player
            .copy(reviewPark.sanctuaryTarget)
            .setY(
              reviewPark.floorHeight(
                reviewPark.sanctuaryTarget.x,
                reviewPark.sanctuaryTarget.z,
              ) + 1.48,
            );
          rescuedParty.reset(
            player,
            reviewPark.floorHeight(player.x, player.z),
          );
          completeHomeMission();
        }
      }
    }

    let raf = 0;
    let lockBackdropRendered = false;
    function frame(timestamp?: number) {
      raf = requestAnimationFrame(frame);
      if (document.hidden) { timer.update(timestamp); return; }
      const zooOverlayPaused = transitStage === "BRONX_ZOO" && lockPickingRef.current;
      if (timestamp !== undefined && !zooOverlayPaused) quality.reportFrame(timestamp);
      timer.update(timestamp);
      const delta = Math.min(timer.getDelta(), 0.05);
      if (!zooOverlayPaused) gameTime += delta;
      // Lock picking is the sole modal zoo mechanic. Habitat research remains
      // spatial and keeps the zoo, crowds, animals, audio, and wayfinding live.
      if (zooOverlayPaused) {
        if (!lockBackdropRendered) {
          renderFrame();
          lockBackdropRendered = true;
        }
        return;
      }
      lockBackdropRendered = false;
      if (transitStage === "RIDING" && interiorWorld) {
        const forward = movementForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)),
          right = movementRight.set(Math.cos(yaw), 0, -Math.sin(yaw)),
          wish = movementWish.set(0, 0, 0);
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward);
        if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward);
        if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right);
        if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0;
        if (moving) wish.normalize();
        velocity.lerp(
          wish.multiplyScalar(1.82),
          1 - Math.exp(-delta * (moving ? 10 : 7)),
        );
        player.addScaledVector(velocity, delta);
        const snapshot = interiorWorld.update(delta, player, velocity);
        handleInteriorEvent(snapshot.event);
        if (transitStage !== "RIDING" || !interiorWorld) {
          renderFrame();
          return;
        }
        if (actionRequested) {
          handleInteriorEvent(interiorWorld.interact(player));
          actionRequested = false;
        }
        const target = snapshot.exitWaypoint,
          dx = target.x - player.x,
          dz = target.z - player.z,
          distance = Math.hypot(dx, dz),
          ahead = dx * -Math.sin(yaw) + dz * -Math.cos(yaw),
          side = dx * Math.cos(yaw) - dz * Math.sin(yaw),
          bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        if (rescuedParty.isActive)
          rescuedParty.update(gameTime, delta, player, () => 0, "train");
        if (garyCompanion.isFed)
          garyCompanion.update(gameTime, delta, player, () => 0);
        animalMenagerie.update(
          gameTime,
          delta,
          player,
          {
            floorYAt: () => 0,
            resolveBody: (position, bodyVelocity, radius) =>
              interiorWorld?.resolveCompanion(position, bodyVelocity, radius),
          },
          "train",
          collisionBodies(),
        );
        camera.position.copy(player).add(snapshot.cameraOffset);
        camera.rotation.set(
          THREE.MathUtils.clamp(pitch, -0.74, 0.74),
          yaw,
          snapshot.cameraRoll,
        );
        sloth.animate(gameTime, velocity.length(), false);
        if (moving && gameTime - lastFootstep > 0.46) {
          lastFootstep = gameTime;
          audio.playFootstep("metal", Math.min(1, velocity.length() / 1.82));
        }
        if (gameTime - lastHud > 0.1) {
          lastHud = gameTime;
          const destinationPhase = snapshot.objective.includes("illuminated");
          setHud({
            bearing,
            distance,
            motion:
              snapshot.phase === "DWELL"
                ? "DOORS OPEN"
                : snapshot.phase === "APPROACHING"
                  ? "BRAKING"
                  : "RIDING",
            objective: snapshot.objective,
            objectiveShort: destinationPhase ? "EXIT" : "ON TRAIN",
            prompt: snapshot.prompt,
            promptKey: snapshot.prompt ? "E" : "",
            station: `${boarded?.route ?? interiorWorld.journey.route} · NEXT ${snapshot.stop.toUpperCase()}`,
            status:
              snapshot.phase === "DWELL"
                ? `${snapshot.stop.toUpperCase()} · DOORS OPEN`
                : snapshot.phase === "APPROACHING"
                  ? `APPROACHING ${snapshot.stop.toUpperCase()}`
                  : `NEXT STOP · ${snapshot.stop.toUpperCase()}`,
            value: `${snapshot.secondsRemaining}S`,
            waypoint: destinationPhase
              ? `${snapshot.destination} exit`
              : "Center aisle",
            wayfinding: destinationPhase,
          });
        }
      } else if (transitStage !== "COMPLETE" && stationWorld) {
        stationClock += delta;
        stationWorld.update(stationClock);
        if (
          stationWorld.trainPhase !== previousTrainPhase &&
          stationWorld.trainPhase === "APPROACHING"
        ) {
          audio.playTrainArrival(0.82);
          if (travelDirection === "RETURN" && currentStation !== "FIFTH_AV") {
            if (currentStation === "WEST_FARMS")
              audio.playTransitAnnouncement("west_farms_downtown_5_platform", {
                delaySeconds: 0.25,
                dedupeSeconds: 14,
              });
            else {
              const route = stationWorld.arrivingService.route.toLowerCase() as
                "n" | "r";
              audio.playTransitAnnouncement(`lex_downtown_${route}_platform`, {
                delaySeconds: 0.25,
                dedupeSeconds: 14,
              });
            }
            showToast(
              `A ${stationWorld.arrivingService.direction.toLowerCase()} ${stationWorld.arrivingService.route} train is approaching. Keep the sloths together at the platform edge.`,
              4200,
            );
          } else if (currentStation === "FIFTH_AV") {
            const route = stationWorld.arrivingService.route.toLowerCase() as
              "n" | "r";
            audio.playTransitAnnouncement(`fifth_${route}_platform`, {
              delaySeconds: 0.25,
              dedupeSeconds: 14,
            });
            showToast(
              `An uptown ${stationWorld.arrivingService.route} train is approaching the station.`,
              3800,
            );
          } else if (currentStation !== "WEST_FARMS")
            audio.playTransitAnnouncement("lex_5_platform", {
              delaySeconds: 0.55,
              dedupeSeconds: 14,
            });
        }
        if (stationWorld.doorsOpen !== previousDoorsOpen) {
          audio.playTrainDoors(stationWorld.doorsOpen ? "open" : "close");
          if (stationWorld.doorsOpen) {
            audio.playTrainChime("arrival");
            if (travelDirection === "RETURN" && currentStation !== "FIFTH_AV") {
              if (currentStation === "WEST_FARMS")
                audio.playTransitAnnouncement(
                  "west_farms_downtown_5_boarding",
                  { delaySeconds: 0.2, dedupeSeconds: 12 },
                );
              else {
                const route =
                  stationWorld.arrivingService.route.toLowerCase() as "n" | "r";
                audio.playTransitAnnouncement(
                  `lex_downtown_${route}_boarding`,
                  { delaySeconds: 0.2, dedupeSeconds: 12 },
                );
              }
              showToast(
                `${stationWorld.arrivingService.route} ${stationWorld.arrivingService.direction.toLowerCase()} · doors open · board with ${friendCountLabel(totalFollowerCount())}.`,
                4200,
              );
            } else if (currentStation === "FIFTH_AV") {
              const route = stationWorld.arrivingService.route.toLowerCase() as
                "n" | "r";
              audio.playTransitAnnouncement(`fifth_${route}_boarding`, {
                delaySeconds: 0.2,
                dedupeSeconds: 12,
              });
              showToast(
                `${stationWorld.arrivingService.route} train · doors open · board through any open doorway.`,
                3800,
              );
            } else if (currentStation !== "WEST_FARMS")
              audio.playTransitAnnouncement("lex_5_boarding", {
                delaySeconds: 0.2,
                dedupeSeconds: 12,
              });
          } else audio.playTrainChime("doors-closing");
        }
        previousTrainPhase = stationWorld.trainPhase;
        previousDoorsOpen = stationWorld.doorsOpen;
        const forward = movementForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)),
          right = movementRight.set(Math.cos(yaw), 0, -Math.sin(yaw)),
          wish = movementWish.set(0, 0, 0);
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward);
        if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward);
        if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right);
        if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        playerBeforeMovement.copy(player);
        const moving = wish.lengthSq() > 0;
        if (moving) wish.normalize();
        velocity.lerp(
          wish.multiplyScalar(2.65),
          1 - Math.exp(-delta * (moving ? 9 : 6)),
        );
        player.addScaledVector(velocity, delta);
        stationWorld.resolvePlayer(player, velocity);
        const streetMix = stationWorld.streetEnvironmentMix(player);
        (scene.background as THREE.Color)
          .copy(interiorColor)
          .lerp(streetColor, streetMix);
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.copy(fogInterior).lerp(fogStreet, streetMix);
          scene.fog.density = THREE.MathUtils.lerp(0.009, 0.0048, streetMix);
        }
        renderer.toneMappingExposure = THREE.MathUtils.lerp(
          1.18,
          1.32,
          streetMix,
        );
        if (
          travelDirection === "OUTBOUND" &&
          currentStation === "FIFTH_AV" &&
          previousStreetMix >= 0.55 &&
          streetMix < 0.55
        ) {
          showTransition("5 Av / 59 St mezzanine");
          showToast(
            "Fare control ahead — collect a MetroCard at the blue machine, then swipe at a turnstile.",
            5200,
          );
        }
        previousStreetMix = streetMix;
        if (moving && gameTime - lastFootstep > 0.48) {
          lastFootstep = gameTime;
          audio.playFootstep("stone", Math.min(1, velocity.length() / 2.65));
        }
        const option = stationWorld.boardingOption(
            player,
            playerBeforeMovement,
          ),
          boardingHint = stationWorld.boardingHint(player),
          fareInteraction = stationWorld.interactionHint(player),
          target = stationWorld.waypoint,
          targetX = target.x - player.x,
          targetZ = target.z - player.z,
          distance = Math.hypot(targetX, targetZ),
          ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw),
          side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw),
          bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        let prompt = "",
          promptKey = "";
        if (fareInteraction) {
          prompt = fareInteraction.label;
          promptKey = "E";
        } else if (boardingHint)
          prompt = `WALK THROUGH OPEN ${boardingHint.route} DOORS · ${boardingHint.direction}`;
        else if (
          travelDirection === "OUTBOUND" &&
          currentStation === "WEST_FARMS" &&
          distance < 4.4
        )
          prompt = "WALK UP TO THE BRONX ZOO EXIT";
        else if (
          travelDirection === "RETURN" &&
          currentStation === "FIFTH_AV" &&
          distance < 4.4
        )
          prompt = "WALK UP TO CENTRAL PARK";
        // Boarding and the final street exit are spatial actions: once the sloth
        // crosses a physically open doorway, the streamed world changes without
        // an extra button press. E remains available only inside the train as an
        // accessibility fallback for the destination-door timing challenge.
        if (actionRequested && fareInteraction) {
          const fareEvent = stationWorld.interact(player);
          if (fareEvent) showToast(fareEvent.message, 4800);
        }
        if (option) boardThroughOpenDoor(option);
        else if (
          travelDirection === "OUTBOUND" &&
          currentStation === "WEST_FARMS" &&
          distance < 1.45
        )
          enterBronxZoo();
        else if (
          travelDirection === "RETURN" &&
          currentStation === "FIFTH_AV" &&
          distance < 1.45
        )
          enterCentralPark();
        actionRequested = false;
        if (!stationWorld) {
          renderFrame();
          return;
        }
        if (rescuedParty.isActive)
          rescuedParty.update(
            gameTime,
            delta,
            player,
            () => player.y - 1.48,
            "station",
          );
        if (garyCompanion.isFed)
          garyCompanion.update(gameTime, delta, player, () => player.y - 1.48);
        animalMenagerie.update(
          gameTime,
          delta,
          player,
          {
            floorYAt: (x, z) => stationWorld?.floorHeight(x, z) ?? 0,
            resolveBody: (position, bodyVelocity, radius) =>
              stationWorld?.resolveCompanion(position, bodyVelocity, radius),
          },
          "station",
          collisionBodies(),
        );
        camera.position.copy(player);
        camera.rotation.set(pitch, yaw, 0);
        sloth.animate(gameTime, velocity.length(), false);
        if (gameTime - lastHud > 0.12) {
          lastHud = gameTime;
          const fifth = currentStation === "FIFTH_AV",
            lex = currentStation === "LEXINGTON",
            returning = travelDirection === "RETURN",
            fareObjective = stationWorld.fareObjective,
            arrivingRoute = stationWorld.arrivingService.route;
          const objective =
            fareObjective ??
            (returning
              ? fifth
                ? "Exit at Fifth Avenue and lead your friends into Central Park"
                : lex
                  ? `Transfer here to a downtown ${arrivingRoute} train for Fifth Avenue`
                  : "Take the downtown 5 to Lexington Av; transfer to N / R there"
              : fifth
                ? `Take the Queens-bound ${arrivingRoute} train one stop`
                : lex
                  ? "Choose the uptown 5 platform from the paid concourse"
                  : "Exit toward the Bronx Zoo");
          const waypoint = fareObjective
            ? fareObjective.startsWith("Collect")
              ? "Fare machine"
              : "MetroCard turnstiles"
            : returning
              ? fifth
                ? "Central Park street exit"
                : lex
                  ? `Separate Broadway platform · downtown ${arrivingRoute}`
                  : "Downtown 5 platform · opposite arrival side"
              : fifth
                ? `Queens-bound ${arrivingRoute}`
                : lex
                  ? "Lexington Line platform · uptown 5"
                  : "Bronx Zoo exit";
          const routeStatus = `${arrivingRoute} TRAIN`,
            status = fareObjective
              ? fareObjective.startsWith("Collect")
                ? "FARE UNPAID · GET CARD"
                : "METROCARD READY · SWIPE"
              : returning && fifth
                ? "CENTRAL PARK · STREET EXIT"
                : !returning && currentStation === "WEST_FARMS"
                  ? "ANIMAL TRACKS · NORTH EXIT"
                  : stationWorld.doorsOpen
                    ? `${routeStatus} · DOORS OPEN`
                    : stationWorld.trainPhase === "APPROACHING"
                      ? `${routeStatus} APPROACHING`
                      : stationWorld.trainPhase === "BOARDING"
                        ? `${routeStatus} ARRIVED`
                        : `NEXT ${routeStatus} · ${stationWorld.secondsToTrain}s`;
          setHud({
            bearing,
            distance,
            motion:
              streetMix > 0.62
                ? returning
                  ? "ASCENDING"
                  : "DESCENDING"
                : moving
                  ? "WALKING"
                  : "IN STATION",
            objective,
            objectiveShort: fareObjective
              ? fareObjective.startsWith("Collect")
                ? "METROCARD"
                : "SWIPE"
              : returning
                ? fifth
                  ? "PARK EXIT"
                  : lex
                    ? "TRANSFER"
                    : "DOWNTOWN 5"
                : fifth
                  ? arrivingRoute
                  : lex
                    ? "TRANSFER"
                    : "EXIT",
            prompt,
            promptKey,
            station: fifth
              ? returning
                ? "5 AV / 59 ST · RETURN"
                : "5 AV / 59 ST · UPTOWN TRIP"
              : lex
                ? "LEXINGTON AV / 59 ST · PAID CONCOURSE"
                : "WEST FARMS SQ · E TREMONT AV",
            status,
            value: fareObjective
              ? fareObjective.startsWith("Collect")
                ? "CARD"
                : "SWIPE"
              : (returning && fifth) ||
                  (!returning && currentStation === "WEST_FARMS")
                ? `${Math.round(distance)}M`
                : stationWorld.doorsOpen
                  ? "OPEN"
                  : `${stationWorld.secondsToTrain}S`,
            waypoint,
            wayfinding: true,
          });
        }
      } else if (transitStage === "BRONX_ZOO" && zooWorld) {
        if (lockPickingRef.current) {
          velocity.set(0, 0, 0);
          actionRequested = false;
          trickRequested = false;
          // The overlay is fully opaque and owns its own lightweight animation.
          // Preserve the last rendered zoo frame instead of spending the lock
          // session updating crowds, animals, shadows, and post-processing.
          return;
        }
        const forward = movementForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)),
          right = movementRight.set(Math.cos(yaw), 0, -Math.sin(yaw)),
          wish = movementWish.set(0, 0, 0);
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward);
        if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward);
        if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right);
        if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0,
          travelSpeed = skateboarding ? 8.8 : 2.5;
        if (moving) wish.normalize();
        velocity.lerp(
          wish.multiplyScalar(travelSpeed),
          1 - Math.exp(-delta * (moving ? (skateboarding ? 5.8 : 9) : 6)),
        );
        player.addScaledVector(velocity, delta);
        zooWorld.resolvePlayer(player, velocity);
        zooWorld.update(gameTime, delta, player, yaw);
        let habitatEvent = zooWorld.consumeHabitatEvent();
        while (habitatEvent) {
          reflectHabitatQuestEvent(habitatEvent);
          habitatEvent = zooWorld.consumeHabitatEvent();
        }
        let garyEvent = zooWorld.consumeGaryEvent();
        while (garyEvent) {
          if (garyEvent.kind === "GARY_FED") {
            garyCompanion.feed(gameTime, zooWorld.floorHeight(39, -48));
            reflectGaryFed();
            audio.playQuestComplete();
          }
          showToast(
            garyEvent.message,
            garyEvent.kind === "GARY_FED" ? 6800 : 4600,
          );
          garyEvent = zooWorld.consumeGaryEvent();
        }
        const movementYaw =
          velocity.lengthSq() > 0.02
            ? Math.atan2(-velocity.x, -velocity.z)
            : yaw;
        if (trickRequested) zooWorld.triggerSkateboardKickflip(gameTime);
        zooWorld.updateSkateboard(gameTime, player, movementYaw);
        if (skateboarding) player.y += zooWorld.skateboardRideLift + 0.2;
        trickRequested = false;
        if (rescuedParty.isActive)
          rescuedParty.update(
            gameTime,
            delta,
            player,
            (x, z) => zooWorld?.floorHeight(x, z) ?? 0,
            Math.abs(player.x) < 9 ? "station" : "open",
          );
        if (garyCompanion.isFed)
          garyCompanion.update(
            gameTime,
            delta,
            player,
            (x, z) => zooWorld?.floorHeight(x, z) ?? 0,
          );
        animalMenagerie.update(
          gameTime,
          delta,
          player,
          {
            floorYAt: (x, z) => zooWorld?.floorHeight(x, z) ?? 0,
            resolveBody: (position, bodyVelocity, radius) =>
              zooWorld?.resolveCompanion(position, bodyVelocity, radius),
          },
          Math.abs(player.x) < 9 ? "station" : "open",
          collisionBodies(),
        );
        if (!skateboarding && moving && gameTime - lastFootstep > 0.5) {
          lastFootstep = gameTime;
          audio.playFootstep("stone", Math.min(1, velocity.length() / 2.5));
        }
        const target = zooWorld.objectiveTarget,
          targetX = target.x - player.x,
          targetZ = target.z - player.z,
          distance = Math.hypot(targetX, targetZ),
          ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw),
          side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw),
          bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        const hint = zooWorld.interactionHint(player),
          skateboardNear = zooWorld.skateboardNearby(player),
          shuttleReady = hint?.kind === "BUS_BOARDING";
        const prompt = shuttleReady
          ? hint.label
          : skateboarding
            ? "STEP OFF ZOO SKATEBOARD"
            : skateboardNear
              ? "RIDE ZOO SKATEBOARD · SPACE KICKFLIP"
              : (hint?.label ?? "");
        if (actionRequested && shuttleReady) {
          actionRequested = false;
          const boardingRadius = shuttleBoardingRadiusFor(totalFollowerCount());
          if (allFollowersWithin(zooWorld.busBoardingPosition, boardingRadius)) {
            startBusDrive();
            renderFrame();
            return;
          }
          showToast(
            `Gather all ${animalCountLabel(totalFollowerCount())} anywhere inside the broad yellow shuttle apron.`,
            4600,
          );
        } else if (actionRequested && skateboarding) {
          skateboarding = false;
          zooWorld.setSkateboardMounted(false, player, yaw);
          setMobilityMode(null);
          setVehicleSpeed(0);
          velocity.multiplyScalar(0.35);
          showToast("Skateboard parked beside you.", 2400);
        } else if (actionRequested && skateboardNear) {
          skateboarding = true;
          zooWorld.setSkateboardMounted(true, player, movementYaw);
          setMobilityMode("skateboard");
          showToast(
            "Skateboard ready — W / A / S / D ride fast, Space kickflips, E steps off.",
            4600,
          );
        } else if (actionRequested && hint) {
          const event = zooWorld.interact(player, yaw);
          if (event) {
            if (event.kind === "LOCK_PICKING_STARTED") {
              lockPickingRef.current = true;
              setLockPicking(true);
              setZooPhase("LOCK_PICKING");
              keys.clear();
              velocity.set(0, 0, 0);
              if (document.pointerLockElement) {
                try {
                  document.exitPointerLock();
                } catch {}
              }
            } else if (event.questId && event.kind.startsWith("ANIMAL_QUEST_")) reflectHabitatQuestEvent(event);
            else showToast(event.message, 5000);
          }
        }
        if (!lockPickingRef.current && !zooWorld.activeSideQuestId) setZooPhase(zooWorld.questState);
        setTicketHeld(zooWorld.hasTicket);
        actionRequested = false;
        camera.position.copy(player);
        camera.rotation.set(pitch, yaw, 0);
        sloth.animate(gameTime, velocity.length(), false);
        if (gameTime - lastHud > 0.12) {
          lastHud = gameTime;
          const quest = zooWorld.questState,
            released = zooWorld.friendsReleased,
            activeHabitatQuest = zooWorld.activeSideQuestId,
            habitatProgress = zooWorld.activeSideQuestProgress,
            count = totalFollowerCount(),
            status = skateboarding
              ? "SKATEBOARD · SPACE KICKFLIP"
              : activeHabitatQuest && habitatProgress
                ? `LIVE HABITAT RESPONSE · ${habitatProgress.current} / ${habitatProgress.total}${habitatProgress.operationActive ? !habitatProgress.tracking ? " · FOLLOW IT" : !habitatProgress.calibrated ? ` · ${habitatProgress.control?.status ?? "CALIBRATE"}` : " · CALIBRATED" : ""} · STREAK ${zooWorld.researchStreak}`
              : quest === "ENTER_ZOO"
                ? count
                  ? companionStatus(count)
                  : "ISLAND TICKET READY"
                : quest === "FIND_SLOTHS"
                  ? `${companionStatus(count)} · KEEPER LOCK SECURED`
                  : `${friendCountLabel(count).toUpperCase()} · BOARD TOGETHER`,
            objective = released
              ? `Lead ${friendCountLabel(count)} out of the zoo and board the museum shuttle`
              : zooWorld.objectiveLabel;
          setVehicleSpeed(skateboarding ? velocity.length() : 0);
          setHud({
            bearing,
            distance,
            fieldControls: habitatProgress?.control?.options,
            fieldStatus: habitatProgress?.control?.status,
            motion: skateboarding
              ? moving
                ? "SKATEBOARDING"
                : "ON SKATEBOARD"
              : moving
                ? "WALKING"
                : released
                  ? "MENAGERIE ESCORT"
                  : "ZOO EXPLORATION",
            objective,
            objectiveShort:
              activeHabitatQuest
                ? "HABITAT WORK"
                : quest === "ENTER_ZOO"
                ? "ENTER ZOO"
                : quest === "FIND_SLOTHS"
                  ? "PICK LOCK"
                  : "SHUTTLE BUS",
            prompt,
            promptKey: prompt && hint?.kind !== "ANIMAL_QUEST_FOCUS" ? "E" : "",
            station: released
              ? "BRONX ZOO · MUSEUM SHUTTLE STOP"
              : "BRONX ZOO · WILDLIFE CONSERVATION CAMPUS",
            status,
            value: `${Math.round(distance)}M`,
            waypoint:
              activeHabitatQuest
                ? "Active habitat research station"
                : quest === "ENTER_ZOO"
                ? "Asia Gate"
                : quest === "FIND_SLOTHS"
                  ? "Sloth conservation habitat"
                  : "Natural History Museum shuttle",
            wayfinding: true,
          });
        }
      } else if (transitStage === "BUS_DRIVE" && cityBusWorld) {
        if (busFailureAt !== null && gameTime >= busFailureAt) {
          const restarted = startBusDrive(0);
          if (restarted) {
            showTransition("Museum shuttle · Bronx checkpoint");
            showToast(
              "Shuttle restored at the Bronx Zoo boarding checkpoint. Reach the museum before integrity reaches zero.",
              5600,
            );
          }
          renderFrame();
          return;
        }
        const input = {
          accelerate: keys.has("KeyW") || keys.has("ArrowUp"),
          brake: keys.has("KeyS") || keys.has("ArrowDown"),
          steerLeft: keys.has("KeyA") || keys.has("ArrowLeft"),
          steerRight: keys.has("KeyD") || keys.has("ArrowRight"),
          handbrake: keys.has("Space"),
          shiftUp: shiftUpRequested,
          shiftDown: shiftDownRequested,
        };
        const previousGear = cityBusWorld.selectedForwardGear;
        cityBusWorld.update(delta, gameTime, input);
        shiftUpRequested = false;
        shiftDownRequested = false;
        if (cityBusWorld.selectedForwardGear !== previousGear) {
          setBusGear(cityBusWorld.gearDisplay);
          setBusGearLimit(cityBusWorld.gearTopSpeedMetersPerSecond);
          showToast(
            `Gear ${cityBusWorld.selectedForwardGear} selected · ${cityBusWorld.gearTopSpeedMetersPerSecond} m/s speed band`,
            1900,
          );
        }
        player.copy(cityBusWorld.cameraPosition);
        const speed = cityBusWorld.speedMetersPerSecond,
          signedSpeed = cityBusWorld.signedSpeedMetersPerSecond,
          liveRouteStatus = cityBusWorld.routeStatus;
        audio.setCartMotor(true, speed);
        const impact = cityBusWorld.consumeImpactEvent();
        if (impact) {
          audio.playVehicleImpact(impact.severity);
          setBusIntegrity(Math.round(impact.integrity * 100));
          setBusImpactStatus(impact.protected ? "rear-protected" : impact.kind);
          if (impact.disabled && busFailureAt === null) {
            busFailureAt = gameTime + 1.75;
            audio.playFailure();
            audio.setCartMotor(false);
            keys.clear();
            showTransition("Shuttle disabled");
            showToast(
              "The shuttle took too much damage. Returning to the Bronx Zoo boarding checkpoint…",
              3600,
            );
          } else if (impact.protected)
            showToast(
              "Rear impact absorbed · traffic pushed the shuttle forward · no integrity lost",
              2600,
            );
          else if (!impact.disabled)
            showToast(
              `${impact.label} impact · −${Math.round(impact.damage)} integrity · ${Math.round(impact.integrity * 100)}% remaining`,
              2200,
            );
        }
        if (liveRouteStatus !== previousBusRouteStatus) {
          if (liveRouteStatus === "OPEN-WORLD REROUTE ACTIVE")
            showToast(
              "Wrong turn — this local-access block ends at the blue barriers. Reverse to West 79th Street and continue straight toward Central Park West.",
              5200,
            );
          else if (liveRouteStatus === "OFF STREET · RETURN TO ROAD")
            showToast(
              "The shuttle is beyond the curb line. Steer back toward the highlighted street; throttle remains fully yours.",
              4200,
            );
          else if (previousBusRouteStatus !== "")
            showToast(
              "Recommended route reacquired — you can stay on it or keep exploring the street network.",
              3600,
            );
          previousBusRouteStatus = liveRouteStatus;
        }
        if (cityBusWorld.remainingMeters < 720) scheduleMuseumPreload();
        const parked = cityBusWorld.parkingReached,
          disabled = cityBusWorld.disabled,
          prompt = parked
            ? "OPEN THE BUS DOOR · ENTER THE NATURAL HISTORY MUSEUM"
            : "";
        if (actionRequested && parked) {
          actionRequested = false;
          enterMuseum();
          renderFrame();
          return;
        }
        actionRequested = false;
        camera.position.copy(player);
        camera.rotation.set(
          THREE.MathUtils.clamp(pitch, -0.7, 0.62),
          cityBusWorld.headingYaw + yaw,
          -cityBusWorld.steeringAmount *
            THREE.MathUtils.clamp(speed / 72, 0, 1) *
            0.07,
        );
        const speedFov = 67 + THREE.MathUtils.clamp(speed / 72, 0, 1) * 15;
        if (Math.abs(camera.fov - speedFov) > 0.02) {
          camera.fov = THREE.MathUtils.lerp(
            camera.fov,
            speedFov,
            1 - Math.exp(-delta * 6.5),
          );
          camera.updateProjectionMatrix();
        }
        cityBusWorld.getWorldGripPositions(busGripWorld);
        camera.updateMatrixWorld(true);
        busGripCamera.left.copy(busGripWorld.left);
        camera.worldToLocal(busGripCamera.left);
        busGripCamera.right.copy(busGripWorld.right);
        camera.worldToLocal(busGripCamera.right);
        sloth.setVehiclePose(
          "cart",
          cityBusWorld.steeringAmount,
          0,
          0,
          busGripCamera,
        );
        sloth.animate(gameTime, speed, false);
        if (gameTime - lastHud > 0.1) {
          lastHud = gameTime;
          const instruction = cityBusWorld.navigationInstruction,
            routeStatus = cityBusWorld.routeStatus;
          setVehicleSpeed(speed);
          setBusMap(cityBusWorld.minimapSnapshot);
          setBusGear(cityBusWorld.gearDisplay);
          setBusGearLimit(cityBusWorld.gearTopSpeedMetersPerSecond);
          setBusImpactStatus(cityBusWorld.impactStatus);
          setHud({
            bearing: cityBusWorld.navigationBearingDegrees,
            distance: cityBusWorld.remainingMeters,
            motion: disabled
              ? "DISABLED"
              : signedSpeed < -0.1
                ? "REVERSING"
                : routeStatus.includes("REROUTE")
                  ? "REROUTING"
                  : speed > 0.35
                    ? "DRIVING"
                    : parked
                      ? "PARKED"
                      : "IN TRAFFIC",
            objective: disabled
              ? "Shuttle disabled — returning to the Bronx Zoo checkpoint"
              : parked
                ? `Park the bus and bring ${friendCountLabel(totalFollowerCount())} inside the museum`
                : instruction,
            objectiveShort: disabled
              ? "BUS DAMAGED"
              : parked
                ? "ENTER AMNH"
                : "DRIVE TO AMNH",
            prompt,
            promptKey: prompt ? "E" : "",
            progress: parked ? 1 : cityBusWorld.routeCompletion,
            station: `${cityBusWorld.currentRoad.toUpperCase()} · MUSEUM SHUTTLE`,
            status: disabled
              ? "INTEGRITY EXHAUSTED"
              : routeStatus === "AUTHORED ROUTE · FREE STEERING"
                ? cityBusWorld.congestionStatus
                : routeStatus,
            value: parked
              ? "PARKED"
              : `${Math.round(cityBusWorld.remainingMeters)}M`,
            waypoint: parked ? "Central Park West entrance" : instruction,
            wayfinding: !disabled,
          });
        }
      } else if (transitStage === "MUSEUM" && museumWorld) {
        const forward = movementForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)),
          right = movementRight.set(Math.cos(yaw), 0, -Math.sin(yaw)),
          wish = movementWish.set(0, 0, 0);
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward);
        if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward);
        if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right);
        if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0,
          scooterBrake = scooterRiding && keys.has("Space"),
          travelSpeed = scooterRiding ? (scooterBrake ? 0 : 8.6) : 2.55;
        if (moving) wish.normalize();
        velocity.lerp(
          wish.multiplyScalar(travelSpeed),
          1 -
            Math.exp(
              -delta *
                (moving && !scooterBrake
                  ? scooterRiding
                    ? 6.4
                    : 9
                  : scooterBrake
                    ? 14
                    : 6),
            ),
        );
        player.addScaledVector(velocity, delta);
        museumWorld.resolvePlayer(player, velocity);
        museumWorld.update(gameTime, delta, player, yaw, velocity.length());
        const movementYaw =
            velocity.lengthSq() > 0.02
              ? Math.atan2(-velocity.x, -velocity.z)
              : yaw,
          scooterNear = museumWorld.scooterDockNearby(player),
          whiskersHint = museumWorld.whiskersInteractionHint(player);
        if (actionRequested && scooterRiding) {
          scooterRiding = false;
          museumWorld.setScooterConvoyActive(false, player, movementYaw);
          rescuedParty.setScooterMode(false);
          garyCompanion.setScooterMode(false);
          animalMenagerie.setScooterMode(false);
          setMobilityMode(null);
          sloth.setVehiclePose("none");
          velocity.multiplyScalar(0.3);
          showToast(
            "The scooter convoy is parked. Walk back up and press E to ride again.",
            3000,
          );
        } else if (actionRequested && whiskersHint) {
          const event = museumWorld.interactWhiskers(player, gameTime);
          if (event) {
            audio.playUiConfirm();
            if (event.kind === "WHISKERS_FOUND") audio.playQuestComplete();
            showToast(event.message, event.kind === "WHISKERS_FOUND" ? 6800 : 5200);
          }
        } else if (actionRequested && scooterNear) {
          scooterRiding = true;
          museumWorld.setScooterConvoyActive(true, player, movementYaw);
          rescuedParty.setScooterMode(true);
          garyCompanion.setScooterMode(garyCompanion.isFed);
          animalMenagerie.setScooterMode(true);
          setMobilityMode("scooter");
          showToast(
            `${riderCountLabel(totalFollowerCount())} deploy together — one scooter for you and one for every animal in your menagerie. Space brakes; E steps off.`,
            5600,
          );
        }
        actionRequested = false;
        const whiskersEvent = museumWorld.consumeWhiskersEvent();
        if (whiskersEvent) {
          if (whiskersEvent.kind === "WHISKERS_FOUND") audio.playQuestComplete();
          else audio.playUiConfirm();
          showToast(whiskersEvent.message, whiskersEvent.kind === "WHISKERS_FOUND" ? 6800 : 5200);
        }
        museumWorld.updateScooter(player, movementYaw);
        if (scooterRiding) player.y += 0.22;
        rescuedParty.update(
          gameTime,
          delta,
          player,
          (x, z) => museumWorld?.floorHeight(x, z) ?? 0,
          scooterRiding ? "scooter" : "open",
        );
        if (garyCompanion.isFed)
          garyCompanion.update(
            gameTime,
            delta,
            player,
            (x, z) => museumWorld?.floorHeight(x, z) ?? 0,
            scooterRiding,
          );
        animalMenagerie.update(
          gameTime,
          delta,
          player,
          {
            floorYAt: (x, z) => museumWorld?.floorHeight(x, z) ?? 0,
            resolveBody: (position, bodyVelocity, radius) =>
              museumWorld?.resolveCompanion(position, bodyVelocity, radius),
          },
          scooterRiding ? "scooter" : "open",
          collisionBodies(),
        );
        if (!scooterRiding && moving && gameTime - lastFootstep > 0.5) {
          lastFootstep = gameTime;
          audio.playFootstep("stone", Math.min(1, velocity.length() / 2.55));
        }
        const pursuingWhiskers = museumWorld.isWhiskersQuestActive,
          gathering = museumWorld.megatheriumNearby(player, 13),
          whiskersStoryVisible = (pursuingWhiskers || Boolean(whiskersHint)) && !gathering,
          whiskersTrust = museumWorld.whiskersTrust,
          whiskersTrustVisible = whiskersStoryVisible && whiskersTrust.active,
          target = whiskersStoryVisible
            ? museumWorld.whiskersObjectiveTarget
            : museumWorld.nearestMegatheriumViewingTarget(player, museumGatheringTarget),
          targetX = target.x - player.x,
          targetZ = target.z - player.z,
          distance = Math.hypot(targetX, targetZ),
          ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw),
          side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw),
          bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        if (museumMissionReady()) {
          completeMission();
          renderFrame();
          return;
        }
        camera.position.copy(player);
        camera.rotation.set(pitch, yaw, 0);
        if (scooterRiding) {
          museumWorld.getScooterGripPositions(busGripWorld);
          camera.updateMatrixWorld(true);
          busGripCamera.left.copy(busGripWorld.left);
          camera.worldToLocal(busGripCamera.left);
          busGripCamera.right.copy(busGripWorld.right);
          camera.worldToLocal(busGripCamera.right);
          sloth.setVehiclePose("cart", 0, 0, 0, busGripCamera);
        }
        sloth.animate(gameTime, velocity.length(), false);
        if (gameTime - lastHud > 0.12) {
          lastHud = gameTime;
          const count = totalFollowerCount(),
            whiskersProgress = museumWorld.whiskersProgress,
            prompt = whiskersHint
              ? whiskersHint.label
              : whiskersTrustVisible
                ? `${whiskersTrust.instruction} · ${Math.round(whiskersTrust.progress * 100)}%`
              : gathering
              ? `GATHER ${friendCountLabel(count).toUpperCase()} AT THE EXHIBIT`
              : scooterRiding
                ? "STEP OFF ELECTRIC SCOOTER CONVOY"
                : scooterNear
                  ? `RIDE ${riderCountLabel(count).toUpperCase()} · WHOLE MENAGERIE`
                  : "";
          setVehicleSpeed(scooterRiding ? velocity.length() : 0);
          setHud({
            bearing,
            distance,
            fieldStatus: whiskersTrustVisible
              ? `${whiskersTrust.instruction} · ${Math.round(whiskersTrust.progress * 100)}%`
              : undefined,
            motion: scooterRiding
              ? moving
                ? "SCOOTER CONVOY"
                : "ON SCOOTER"
              : moving
                ? "WALKING"
                : "MUSEUM EXPLORATION",
            objective: whiskersStoryVisible
              ? museumWorld.whiskersObjectiveLabel
              : `Find Megatherium and bring ${friendCountLabel(count)} to the giant ground sloth`,
            objectiveShort: whiskersStoryVisible ? "WHISKERS" : "MEGATHERIUM",
            prompt,
            promptKey: whiskersHint ? "E" : whiskersTrustVisible || gathering ? "" : scooterRiding || scooterNear ? "E" : "",
            station:
              player.z > 20
                ? "AMNH · CENTRAL PARK WEST ENTRANCE"
                : player.z > -35
                  ? "AMNH · THEODORE ROOSEVELT ROTUNDA"
                  : player.z > -155
                    ? "AMNH · PERMANENT EXHIBITION HALLS"
                    : "AMNH · FOSSIL MAMMAL HALLS · FLOOR 4",
            status: scooterRiding
              ? `${riderCountLabel(count).toUpperCase()} · ELECTRIC SCOOTER CONVOY`
              : whiskersStoryVisible
                ? museumWorld.isWhiskersWaitingForPlayer
                  ? "WHISKERS WAITING · FOLLOW THE FRESH PRINTS"
                  : whiskersTrustVisible
                    ? `QUIET TRUST · ${Math.round(whiskersTrust.progress * 100)}% · ${whiskersTrust.instruction}`
                  : `WHISKERS TRAIL · ${whiskersProgress.current} / ${whiskersProgress.total}`
                : whiskersHint
                  ? "WHISKERS NEARBY · OPTIONAL STORY"
              : gathering
                ? "MEGATHERIUM FOUND · MENAGERIE GATHERING"
                : companionStatus(count),
            value: whiskersTrustVisible ? `${Math.round(whiskersTrust.progress * 100)}%` : `${Math.round(distance)}M`,
            waypoint: whiskersTrustVisible ? "Whiskers · quiet gallery moment" : whiskersStoryVisible ? "Whiskers · moving gallery trail" : "Megatherium · Giant Ground Sloth",
            wayfinding: whiskersStoryVisible ? !whiskersTrustVisible : true,
          });
        }
      } else if (transitStage === "CENTRAL_PARK" && parkReturnWorld) {
        const forward = movementForward.set(-Math.sin(yaw), 0, -Math.cos(yaw)),
          right = movementRight.set(Math.cos(yaw), 0, -Math.sin(yaw)),
          wish = movementWish.set(0, 0, 0);
        if (keys.has("KeyW") || keys.has("ArrowUp")) wish.add(forward);
        if (keys.has("KeyS") || keys.has("ArrowDown")) wish.sub(forward);
        if (keys.has("KeyD") || keys.has("ArrowRight")) wish.add(right);
        if (keys.has("KeyA") || keys.has("ArrowLeft")) wish.sub(right);
        const moving = wish.lengthSq() > 0;
        if (moving) wish.normalize();
        velocity.lerp(
          wish.multiplyScalar(2.6),
          1 - Math.exp(-delta * (moving ? 9 : 6)),
        );
        player.addScaledVector(velocity, delta);
        parkReturnWorld.resolvePlayer(player, velocity);
        parkReturnWorld.update(gameTime);
        rescuedParty.update(
          gameTime,
          delta,
          player,
          (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0,
          parkReturnWorld.sanctuaryNearby(player, 16) ? "grove" : "open",
        );
        if (garyCompanion.isFed)
          garyCompanion.update(
            gameTime,
            delta,
            player,
            (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0,
          );
        animalMenagerie.update(
          gameTime,
          delta,
          player,
          {
            floorYAt: (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0,
            resolveBody: (position, bodyVelocity, radius) =>
              parkReturnWorld?.resolveCompanion(position, bodyVelocity, radius),
          },
          parkReturnWorld.sanctuaryNearby(player, 16) ? "grove" : "open",
          collisionBodies(),
        );
        if (moving && gameTime - lastFootstep > 0.5) {
          lastFootstep = gameTime;
          audio.playFootstep("earth", Math.min(1, velocity.length() / 2.6));
        }
        const target = parkReturnWorld.sanctuaryTarget,
          targetX = target.x - player.x,
          targetZ = target.z - player.z,
          distance = Math.hypot(targetX, targetZ),
          ahead = targetX * -Math.sin(yaw) + targetZ * -Math.cos(yaw),
          side = targetX * Math.cos(yaw) - targetZ * Math.sin(yaw),
          bearing = THREE.MathUtils.radToDeg(Math.atan2(side, ahead));
        if (
          parkReturnWorld.sanctuaryNearby(player) &&
          allFollowersWithin(target, 9.5)
        ) {
          completeHomeMission();
          renderFrame();
          return;
        }
        camera.position.copy(player);
        camera.rotation.set(pitch, yaw, 0);
        sloth.animate(gameTime, velocity.length(), false);
        actionRequested = false;
        if (gameTime - lastHud > 0.12) {
          lastHud = gameTime;
          const count = totalFollowerCount(),
            friendsReady = allFollowersWithin(target, 9.5);
          setHud({
            bearing,
            distance,
            motion: moving ? "WALKING" : "HOMEWARD",
            objective: `Bring ${friendCountLabel(count)} to the Home Grove`,
            objectiveShort: "HOME GROVE",
            prompt: friendsReady
              ? "WHOLE MENAGERIE GATHERING BENEATH THE TREES"
              : "",
            promptKey: "",
            station: "CENTRAL PARK · HOME GROVE",
            status: friendsReady
              ? `${friendCountLabel(count).toUpperCase()} HOME`
              : companionStatus(count),
            value: `${Math.round(distance)}M`,
            waypoint: "Home Grove sanctuary",
            wayfinding: true,
          });
        }
      } else if (transitStage === "COMPLETE" && museumWorld) {
        museumWorld.update(gameTime, delta, museumWorld.megatheriumTarget);
        rescuedParty.update(
          gameTime,
          delta,
          museumWorld.megatheriumTarget,
          (x, z) => museumWorld?.floorHeight(x, z) ?? 0,
          "grove",
        );
        if (garyCompanion.isFed)
          garyCompanion.update(
            gameTime,
            delta,
            museumWorld.megatheriumTarget,
            (x, z) => museumWorld?.floorHeight(x, z) ?? 0,
          );
        animalMenagerie.update(
          gameTime,
          delta,
          museumWorld.megatheriumTarget,
          { floorYAt: (x, z) => museumWorld?.floorHeight(x, z) ?? 0 },
          "grove",
          collisionBodies(),
        );
      } else if (transitStage === "COMPLETE" && parkReturnWorld) {
        parkReturnWorld.update(gameTime);
        rescuedParty.update(
          gameTime,
          delta,
          parkReturnWorld.sanctuaryTarget,
          (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0,
          "grove",
        );
        if (garyCompanion.isFed)
          garyCompanion.update(
            gameTime,
            delta,
            parkReturnWorld.sanctuaryTarget,
            (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0,
          );
        animalMenagerie.update(
          gameTime,
          delta,
          parkReturnWorld.sanctuaryTarget,
          { floorYAt: (x, z) => parkReturnWorld?.floorHeight(x, z) ?? 0 },
          "grove",
          collisionBodies(),
        );
      }
      renderFrame();
    }
    frame();
    return () => {
      lockPickingRef.current = false;
      completeLockPickRef.current = () => undefined;
      cancelLockPickRef.current = () => undefined;
      cancelAnimationFrame(raf);
      cancelMuseumPreload();
      audio.cancelTransitAnnouncements();
      audio.setCartMotor(false);
      if (transitionTimer !== null) clearTimeout(transitionTimer);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", pointerUp);
      document.removeEventListener("mousemove", mouseMove);
      document.removeEventListener("keydown", keyDown);
      document.removeEventListener("keyup", keyUp);
      document.removeEventListener("sloth-look", touchLook);
      document.removeEventListener(DEBUG_LOOK_REQUEST_EVENT, requestDebugLook);
      document.removeEventListener("pointerlockchange", pointerLockChanged);
      document.removeEventListener("visibilitychange", visibilityChange);
      window.removeEventListener("blur", release);
      window.removeEventListener("resize", resize);
      unsubscribeQuality();
      timer.dispose();
      disposeInterior();
      stationWorld?.dispose();
      zooWorld?.dispose();
      cityBusWorld?.dispose();
      museumWorld?.dispose();
      parkReturnWorld?.dispose();
      rescuedParty.dispose();
      garyCompanion.dispose();
      animalMenagerie.dispose();
      renderPipeline.dispose();
      renderer.dispose();
      if (host.contains(renderer.domElement))
        host.removeChild(renderer.domElement);
    };
  }, [audio, quality, showToast]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setTouchCapable(hasTouchInput()));
    return () => cancelAnimationFrame(frame);
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current !== null) clearTimeout(toastTimer.current);
    },
    [],
  );
  const educationContext = educationContextForTransitStage(
    stage,
    `${hud.objective} ${hud.prompt} ${hud.status} ${hud.waypoint}`,
  );
  return (
    <main
      className="game-shell subway-shell"
      data-game-state={stage === "COMPLETE" ? "complete" : "playing"}
      data-touch-capable={touchCapable ? "true" : "false"}
      data-motion={hud.motion}
      data-mobility-mode={mobilityMode ?? "on-foot"}
      data-lock-picking={lockPicking ? "true" : "false"}
      data-side-quest="in-world"
      data-buds={garyFed ? "6" : "5"}
      data-gary-fed={garyFed ? "true" : "false"}
      data-bus-integrity={busIntegrity}
      data-bus-gear={busGear}
      data-bus-gear-limit={busGearLimit}
      data-bus-impact={busImpactStatus}
      data-bus-review={busReviewMode}
      data-bus-speed={vehicleSpeed.toFixed(1)}
      data-level={
        stage === "BRONX_ZOO"
          ? "bronx-zoo"
          : stage === "BUS_DRIVE"
            ? "city-bus"
            : stage === "MUSEUM" || stage === "COMPLETE"
              ? "natural-history-museum"
              : stage === "CENTRAL_PARK"
                ? "central-park"
                : "subway"
      }
      data-station={stage}
      data-campaign-phase={zooPhase}
      data-zoo-phase={zooPhase}
      data-ticket-held={ticketHeld ? "true" : "false"}
      data-follower-count={followerCount}
      data-return-leg={returnLeg}
      data-loaded-world={
        stage === "RIDING"
          ? "train-interior"
          : stage === "BRONX_ZOO"
            ? "bronx-zoo"
            : stage === "BUS_DRIVE"
              ? "bronx-manhattan-bus-route"
              : stage === "MUSEUM" || stage === "COMPLETE"
                ? "american-museum-of-natural-history"
                : stage === "CENTRAL_PARK"
                  ? "central-park-homecoming"
                  : "subway-station"
      }
      data-goal-distance={hud.distance.toFixed(1)}
      data-goal-bearing={hud.bearing.toFixed(1)}
    >
      <div
        ref={mount}
        className="viewport"
        aria-label="3D subway game viewport"
      />
      <div className="world-grade" />
      <div className="world-vignette" />
      <div className="grain" />
      {transition && !lockPicking && (
        <div className="world-transition" role="status">
          <span>Now entering</span>
          <strong>{transition}</strong>
          <i />
        </div>
      )}
      {stage !== "COMPLETE" && !lockPicking && (
        <div className="hud desktop-hud">
          <section className="mission">
            <div className="eyebrow">Current objective</div>
            <h2>{hud.objective}</h2>
            <p>{hud.station}</p>
          </section>
          {stage !== "BUS_DRIVE" && (
            <div className="compass">
              <div className="eyebrow">Journey · {hud.station}</div>
              <div className="compass-line">
                <span>FROM</span>
                <span className="active">{hud.motion}</span>
                <span>TO</span>
              </div>
            </div>
          )}
          {stage !== "BUS_DRIVE" && (
            <div className="status">
              <div className="eyebrow">Campaign status</div>
              <strong>{hud.status}</strong>
            </div>
          )}
          <div className="meters">
            {stage !== "BUS_DRIVE" && (
              <div className="motion-state">
                <span>{hud.motion}</span>
                <small>
                  {stage === "RIDING"
                    ? "Follow the onboard display · keep the group clear of doors · exit together at the lit side"
                    : mobilityMode === "skateboard"
                      ? "Ride at full pace · Space performs a kickflip · E steps off"
                      : mobilityMode === "scooter"
                        ? `${riderCountLabel(followerCount)} travel together · Space brakes · E parks the convoy`
                        : stage === "BRONX_ZOO"
                          ? hud.fieldControls?.length
                            ? "Operate the physical station while keeping its live habitat response in view"
                            : followerCount > 0
                            ? "Lead your growing menagerie along the visitor paths and board the museum shuttle together"
                            : "Explore every habitat · E talks, presents the island ticket, and starts animal quests"
                          : stage === "MUSEUM"
                            ? "Explore dense permanent halls · the scooter corral scales to your whole menagerie"
                            : stage === "CENTRAL_PARK"
                              ? "Keep moving toward Home Grove · every rescued animal follows your route"
                              : "Follow black signs · stairs connect every playable level · board only the signed service"}
                </small>
              </div>
            )}
            <div className="meter-row">
              <span>
                {stage === "RIDING"
                  ? "Stop"
                  : stage === "BUS_DRIVE"
                    ? "Route"
                    : mobilityMode
                      ? "Ride"
                      : stage === "BRONX_ZOO" ||
                          stage === "MUSEUM" ||
                          stage === "CENTRAL_PARK"
                        ? "Goal"
                        : "Train"}
              </span>
              <div className="meter-track">
                <div
                  className="meter-fill"
                  style={{
                    width:
                      hud.value === "OPEN" || hud.value === "PARKED"
                        ? "100%"
                        : hud.progress !== undefined
                          ? `${Math.round(hud.progress * 100)}%`
                          : "42%",
                  }}
                />
              </div>
              <span>{hud.value}</span>
            </div>
          </div>
          {hud.prompt && (
            <div className="interaction">
              {hud.promptKey && <span className="key">{hud.promptKey}</span>}
              {hud.prompt}
            </div>
          )}
          <div className="controls-strip">
            <span>
              {stage === "BUS_DRIVE"
                ? "W Forward · S Brake / Reverse"
                : hud.fieldControls?.length
                  ? "Hold position at the live field station"
                : mobilityMode
                  ? "W / A / S / D Ride"
                  : "W / A / S / D Walk"}
            </span>
            <span>
              {stage === "BUS_DRIVE"
                ? "A / D Steer · Space handbrake"
                : hud.fieldControls?.length
                  ? hud.fieldControls.map(control => `${fieldInputLabel(control.code)} ${control.label}`).join(" · ")
                : mobilityMode === "skateboard"
                  ? "Space kickflip"
                  : mobilityMode === "scooter"
                    ? "Space brake"
                    : stage === "RIDING"
                      ? "Any lit platform-side exit · E fallback"
                      : "E interact · walk through open doors"}
            </span>
            <span>
              {stage === "BUS_DRIVE"
                ? "R Gear up · F Gear down"
                : hud.fieldControls?.length
                  ? "Keep the moving animal response centered"
                : mobilityMode
                  ? "E step off"
                  : stage === "RIDING"
                    ? "Clear doors until your stop"
                    : "Follow the active waypoint"}
            </span>
            <span>{stage === "BUS_DRIVE" ? "E Unload" : "M Sound"}</span>
          </div>
        </div>
      )}
      {stage !== "COMPLETE" && !lockPicking && (
        <MobileHud
          alert={
            stage === "RIDING" || stage === "BUS_DRIVE" || Boolean(mobilityMode)
              ? 0
              : 8
          }
          buds={garyFed ? 6 : 5}
          driving={stage === "BUS_DRIVE" || Boolean(mobilityMode)}
          energy={stage === "BUS_DRIVE" ? busIntegrity : 100}
          hawkPhase="PATROL"
          motion={stage === "MUSEUM" && hud.fieldStatus ? hud.fieldStatus : hud.motion}
          objectiveShort={hud.objectiveShort}
          objectiveValue={hud.value}
          showMotion={stage === "BUS_DRIVE" || Boolean(mobilityMode) || (stage === "MUSEUM" && Boolean(hud.fieldStatus))}
          speed={vehicleSpeed}
          swimming={false}
        />
      )}
      {stage !== "COMPLETE" && !lockPicking && (
        <GoalWayfinder
          active={hud.wayfinding}
          bearing={hud.bearing}
          distance={hud.distance}
          label={hud.waypoint}
        />
      )}
      {stage === "BUS_DRIVE" && <ShuttleMinimap snapshot={busMap} />}
      {stage === "BUS_DRIVE" && (
        <aside
          className={`shuttle-integrity ${busIntegrity <= 25 ? "critical" : busIntegrity <= 55 ? "damaged" : ""}`}
          aria-label={`Shuttle integrity ${busIntegrity} percent`}
        >
          <div>
            <span>Shuttle integrity</span>
            <strong>{busIntegrity}%</strong>
          </div>
          <div className="shuttle-integrity-track">
            <i style={{ width: `${busIntegrity}%` }} />
          </div>
          <small>
            Your impacts cause damage · rear traffic hits do not · zero restarts
          </small>
        </aside>
      )}
      {stage === "BUS_DRIVE" && (
        <aside
          className="shuttle-transmission"
          data-shuttle-transmission="true"
          aria-label={`Shuttle gear ${busGear}, speed band ${busGearLimit} meters per second`}
        >
          <span>Gear</span>
          <strong>{busGear}</strong>
          <small>{busGearLimit} m/s band</small>
          <em>R + · F −</em>
        </aside>
      )}
      {stage !== "COMPLETE" &&
        stage !== "BUS_DRIVE" &&
        !lockPicking &&
        (
        <div className={`crosshair ${hud.prompt ? "targeted" : ""}`} />
      )}{" "}
      {toast && stage !== "COMPLETE" && !lockPicking && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
      {stage !== "COMPLETE" && !lockPicking && !transition && (
        <EducationOverlay
          key={educationContext}
          context={educationContext}
          viewportRef={mount}
        />
      )}
      {stage !== "COMPLETE" &&
        pointerLockAvailable &&
        !mouseCaptured &&
        !lockPicking &&
        (
          <button
            className="mouse-resume"
            type="button"
            onClick={() =>
              requestLock(mount.current?.querySelector("canvas") ?? null)
            }
          >
            <span>Mouse free</span>Click to look
          </button>
        )}
      {stage !== "COMPLETE" && !lockPicking && (
        <TouchControls
          arboreal={false}
          fieldControls={hud.fieldControls}
          fieldStatus={hud.fieldStatus}
          prompt={hud.prompt}
          promptKey={hud.promptKey}
          showSense={false}
          vehicle={stage === "BUS_DRIVE" ? "bus" : mobilityMode}
        />
      )}
      {lockPicking && (
        <SlothLockPick
          onCancel={() => cancelLockPickRef.current()}
          onComplete={() => completeLockPickRef.current()}
        />
      )}
      {stage === "COMPLETE" && (
        <section className="screen finale-screen">
          <div className="pause-card">
            <div className="eyebrow">AMNH · Fossil Mammal Halls</div>
            <h2>Your friends found a giant ancestor.</h2>
            <p>
              You freed the sloths at the Bronx Zoo, drove them through New York
              traffic, and crossed the museum together. Before Megatherium—the
              giant ground sloth—the whole rescue party finally sees how immense
              sloth history can be.
            </p>
            <div className="actions">
              <button className="primary" onClick={() => location.reload()}>
                Play again <b>↻</b>
              </button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
