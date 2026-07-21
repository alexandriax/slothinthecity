import * as THREE from "three";
import { ZOO_SIDE_QUESTS, type ZooSideQuestId } from "../zooSideQuestLogic";

export type HabitatQuestStationKind =
  | "bird-perch"
  | "buoy-dock"
  | "rope-anchor"
  | "stripe-scanner"
  | "scent-vane"
  | "solar-mirror"
  | "wetland-valve"
  | "seed-plot";

export type HabitatQuestStation = {
  id: string;
  position: readonly [number, number];
  responseBend?: number;
  responseHeight?: number;
  responsePath?: readonly [readonly [number, number], readonly [number, number]];
  action: string;
  confirmation: string;
  kind: HabitatQuestStationKind;
};

export type HabitatQuestOperation = {
  duration: number;
  focusLabel: string;
  objective: string;
};

/**
 * Research equipment is only the starting point. Each station releases a
 * visible response into the enclosure and asks the player to follow its actual
 * path. Progress comes from tracking that moving world object, never from
 * facing a generic enclosure center or waiting out a hidden timer.
 */
export const HABITAT_QUEST_OPERATIONS: Record<HabitatQuestStationKind, HabitatQuestOperation> = {
  "bird-perch": { duration: 3.45, focusLabel: "FOLLOW THE CALL PULSE ACROSS THE PERCHES", objective: "Follow the call pulse across the perches" },
  "buoy-dock": { duration: 3.6, focusLabel: "TRACK THE LIVE BUOY ACROSS THE POOL", objective: "Track the live buoy across the pool" },
  "rope-anchor": { duration: 3.8, focusLabel: "FOLLOW THE LOAD TROLLEY THROUGH THE CANOPY", objective: "Follow the load trolley through the canopy" },
  "stripe-scanner": { duration: 3.55, focusLabel: "KEEP THE MOVING PROFILE SCAN CENTERED", objective: "Keep the moving profile scan centered" },
  "scent-vane": { duration: 3.5, focusLabel: "FOLLOW THE SCENT RIBBON INTO THE CANOPY", objective: "Follow the scent ribbon into the canopy" },
  "solar-mirror": { duration: 3.85, focusLabel: "FOLLOW THE SUN SPOT TO THE BASKING STONE", objective: "Follow the sun spot to the basking stone" },
  "wetland-valve": { duration: 3.7, focusLabel: "FOLLOW THE FLOAT ALONG THE REED SHELF", objective: "Follow the float along the reed shelf" },
  "seed-plot": { duration: 3.4, focusLabel: "TRACK THE SEED ARC INTO THE PRAIRIE", objective: "Track the seed arc into the prairie" },
};

export type InWorldZooQuestDefinition = {
  id: ZooSideQuestId;
  center: readonly [number, number];
  triggerRadius: number;
  startPrompt: string;
  routeLabel: string;
  stations: readonly HabitatQuestStation[];
};

/**
 * Every optional habitat activity is spatial. The trigger radius deliberately
 * covers the whole visitor edge of its enclosure; signs are interpretation,
 * never invisible start buttons. Stations then route the player around real
 * enrichment equipment instead of pausing the world for a detached overlay.
 */
export const IN_WORLD_ZOO_QUESTS: Record<ZooSideQuestId, InWorldZooQuestDefinition> = {
  "aviary-voices": {
    id: "aviary-voices",
    center: [-43, -51],
    triggerRadius: 20.5,
    startPrompt: "LISTEN FOR MANGO'S CANOPY CHORUS",
    routeLabel: "Mango's canopy chorus",
    stations: [
      { id: "mango", position: [-29.6, -43.5], responsePath: [[-46, -49], [-39, -52]], responseBend: .7, responseHeight: 4.7, action: "ECHO MANGO'S SUN CONURE CALL", confirmation: "Mango answers from the high contact perch.", kind: "bird-perch" },
      { id: "ibis", position: [-37.5, -66.1], responsePath: [[-45, -56], [-46, -49]], responseBend: .85, responseHeight: 3.6, action: "ANSWER THE IBIS WETLAND CALL", confirmation: "The ibis folds its long call into the chorus.", kind: "bird-perch" },
      { id: "aracari", position: [-55.8, -39.9], responsePath: [[-40, -45], [-47, -46.5]], responseBend: 1.1, responseHeight: 4.55, action: "COMPLETE THE ARACARI CANOPY PHRASE", confirmation: "The aracari crosses the aviary and lands on cue.", kind: "bird-perch" },
    ],
  },
  "sea-lion-current": {
    id: "sea-lion-current",
    center: [0, -76],
    triggerRadius: 17.8,
    startPrompt: "BEGIN THE SEA LION CURRENT RUN",
    routeLabel: "Sea lion enrichment current",
    stations: [
      { id: "west", position: [-12.6, -72.4], responsePath: [[-2.4, -70.2], [2.1, -81.1]], responseBend: 1.15, action: "RELEASE THE WEST CURRENT BUOY", confirmation: "The first buoy catches the current and the sea lions turn with it.", kind: "buoy-dock" },
      { id: "south", position: [0, -90.1], responsePath: [[-6.1, -77.4], [6.1, -74.6]], responseBend: 1.05, action: "SEND THE SOUTH BUOY ACROSS THE POOL", confirmation: "A sea lion surfaces beside the moving buoy.", kind: "buoy-dock" },
      { id: "east", position: [12.5, -77.2], responsePath: [[2.2, -81.8], [-2.1, -70.9]], responseBend: 1.1, action: "FINISH THE ENRICHMENT CURRENT", confirmation: "The pair completes the current circuit together.", kind: "buoy-dock" },
    ],
  },
  "monkey-canopy-rig": {
    id: "monkey-canopy-rig",
    center: [-43, -101],
    triggerRadius: 20.8,
    startPrompt: "INSPECT THE MONKEY CANOPY RIG",
    routeLabel: "Monkey canopy rig",
    stations: [
      { id: "north", position: [-42.2, -84.9], action: "TENSION THE NORTH CANOPY ANCHOR", confirmation: "The upper hand line settles without lifting the foot rung.", kind: "rope-anchor" },
      { id: "west", position: [-59.7, -101.3], action: "SECURE THE WEST SWING ANCHOR", confirmation: "The swing line takes load and the tail support stays planted.", kind: "rope-anchor" },
      { id: "south", position: [-42.5, -117.4], action: "LOCK THE CLIMBING-RIG TURNBUCKLE", confirmation: "All three contact lines hold a quiet, even tension.", kind: "rope-anchor" },
    ],
  },
  "zebra-stripe-scan": {
    id: "zebra-stripe-scan",
    center: [43, -101],
    triggerRadius: 21.8,
    startPrompt: "BEGIN THE ZEBRA WALKAROUND SCAN",
    routeLabel: "Zebra conservation scan",
    stations: [
      { id: "shoulder", position: [27.5, -91.7], action: "CAPTURE THE SHOULDER STRIPE PROFILE", confirmation: "The scanner records a clean shoulder-band signature.", kind: "stripe-scanner" },
      { id: "flank", position: [60.1, -100.3], action: "CAPTURE THE FLANK STRIPE PROFILE", confirmation: "The flank pattern aligns with the live identity record.", kind: "stripe-scanner" },
      { id: "haunch", position: [43.8, -118.5], action: "VERIFY THE HAUNCH STRIPE PROFILE", confirmation: "Three viewing angles resolve one individual zebra.", kind: "stripe-scanner" },
    ],
  },
  "red-panda-scent-wind": {
    id: "red-panda-scent-wind",
    center: [-36, -132],
    triggerRadius: 14.6,
    startPrompt: "FOLLOW THE RED PANDA SCENT TRAIL",
    routeLabel: "Red panda scent trail",
    stations: [
      { id: "cedar", position: [-47.1, -124.4], action: "TURN THE CEDAR SCENT VANE", confirmation: "Cedar scent drifts beneath the first climbing branch.", kind: "scent-vane" },
      { id: "bamboo", position: [-47.2, -139.2], action: "TURN THE BAMBOO SCENT VANE", confirmation: "The enrichment trail bends toward the shaded perch.", kind: "scent-vane" },
      { id: "nest", position: [-27.1, -142], action: "COMPLETE THE SCENT TRAIL AT THE NEST BOX", confirmation: "The red panda follows the completed canopy scent route.", kind: "scent-vane" },
    ],
  },
  "tortoise-sun-trail": {
    id: "tortoise-sun-trail",
    center: [36, -132],
    triggerRadius: 14.6,
    startPrompt: "ALIGN THE TORTOISE SUN TRAIL",
    routeLabel: "Tortoise warming trail",
    stations: [
      { id: "east", position: [47.1, -124.2], responsePath: [[43.2, -126.1], [40, -128.5]], responseBend: .28, responseHeight: .48, action: "AIM THE EAST WARMING MIRROR", confirmation: "A warm beam reaches the first stone shelf.", kind: "solar-mirror" },
      { id: "south", position: [36.5, -145.4], responsePath: [[39.1, -139.2], [38, -136]], responseBend: .25, responseHeight: .48, action: "AIM THE SOUTH WARMING MIRROR", confirmation: "The second reflection carries light across the yard.", kind: "solar-mirror" },
      { id: "west", position: [25.3, -139.1], responsePath: [[28.7, -136.2], [31.8, -132.5]], responseBend: .3, responseHeight: .48, action: "LIGHT THE FINAL BASKING STONE", confirmation: "The basking trail now warms gradually from end to end.", kind: "solar-mirror" },
    ],
  },
  "flamingo-wetland-balance": {
    id: "flamingo-wetland-balance",
    center: [-71, -55],
    triggerRadius: 13.2,
    startPrompt: "RESTORE THE FLAMINGO WETLAND FLOW",
    routeLabel: "Flamingo wetland flow",
    stations: [
      { id: "intake", position: [-60.6, -48.8], action: "OPEN THE FRESH-WATER INTAKE", confirmation: "Fresh water enters slowly without flooding the reed shelf.", kind: "wetland-valve" },
      { id: "reedbed", position: [-79.9, -45.9], action: "ROUTE FLOW THROUGH THE REED BED", confirmation: "The planted filter clears the shallow feeding edge.", kind: "wetland-valve" },
      { id: "outflow", position: [-81.8, -61.4], action: "SET THE WETLAND OUTFLOW", confirmation: "Depth and salinity settle into the habitat band.", kind: "wetland-valve" },
    ],
  },
  "bison-prairie-seeding": {
    id: "bison-prairie-seeding",
    center: [72, -105],
    triggerRadius: 13.5,
    startPrompt: "WALK THE BISON PRAIRIE SEED LINE",
    routeLabel: "Bison prairie restoration",
    stations: [
      { id: "bluestem", position: [61.9, -96.4], action: "PLANT THE BIG BLUESTEM POCKET", confirmation: "Big bluestem seed settles behind the browse barrier.", kind: "seed-plot" },
      { id: "grama", position: [64.1, -115.7], action: "PLANT THE BLUE GRAMA POCKET", confirmation: "Blue grama fills the dry edge beside the rubbing log.", kind: "seed-plot" },
      { id: "switchgrass", position: [81.5, -115.2], action: "PLANT THE SWITCHGRASS POCKET", confirmation: "The restored prairie now links all three forage patches.", kind: "seed-plot" },
    ],
  },
};

export type ActiveInWorldZooQuest = {
  id: ZooSideQuestId;
  order: readonly number[];
  replay: boolean;
  step: number;
};

function hashQuest(id: ZooSideQuestId, seed: number) {
  let value = seed >>> 0;
  for (let index = 0; index < id.length; index++) value = Math.imul(value ^ id.charCodeAt(index), 16777619);
  return value >>> 0;
}

/** Rotate and sometimes reverse each spatial route so repeat visits differ. */
export function createInWorldZooQuestOrder(id: ZooSideQuestId, sessionSeed: number) {
  const count = IN_WORLD_ZOO_QUESTS[id].stations.length;
  const hash = hashQuest(id, sessionSeed);
  const order = Array.from({ length: count }, (_, index) => index);
  const rotation = hash % count;
  const rotated = [...order.slice(rotation), ...order.slice(0, rotation)];
  return hash & 1 ? rotated.reverse() : rotated;
}

export function habitatQuestAt(player: THREE.Vector3, completed: ReadonlySet<ZooSideQuestId>) {
  let nearestNew: { definition: InWorldZooQuestDefinition; distance: number; replay: false } | null = null;
  let nearestReplay: { definition: InWorldZooQuestDefinition; distance: number; replay: true } | null = null;
  for (const definition of Object.values(IN_WORLD_ZOO_QUESTS)) {
    const distance = Math.hypot(player.x - definition.center[0], player.z - definition.center[1]);
    if (distance > definition.triggerRadius) continue;
    if (completed.has(definition.id)) {
      if (!nearestReplay || distance < nearestReplay.distance) nearestReplay = { definition, distance, replay: true };
    } else if (!nearestNew || distance < nearestNew.distance) {
      nearestNew = { definition, distance, replay: false };
    }
  }
  return nearestNew ?? nearestReplay;
}

export function activeQuestStation(active: ActiveInWorldZooQuest) {
  const definition = IN_WORLD_ZOO_QUESTS[active.id];
  return definition.stations[active.order[active.step]];
}

export function activeQuestObjective(active: ActiveInWorldZooQuest) {
  const definition = IN_WORLD_ZOO_QUESTS[active.id];
  const station = activeQuestStation(active);
  return {
    label: `${definition.routeLabel} · ${active.step + 1} / ${active.order.length}`,
    objective: `${ZOO_SIDE_QUESTS[active.id].title}: ${station.action.toLowerCase()}`,
    position: new THREE.Vector3(station.position[0], 1.48, station.position[1]),
  };
}
