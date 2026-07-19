import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Sky } from "three/addons/objects/Sky.js";
import type { GameTextures } from "../rendering/textures";
import { createPremiumHuman, createPremiumSlothFriend, markPremiumCharactersDisposed } from "./PremiumCharacter";
import { createAmbientHumanAgent, updateAmbientHumanAgent, type AmbientHumanAgent } from "./characters/AmbientHumanMotion";
import type { SlothVehicleGripTargets } from "../player/SlothRig";
import { CityRoadNetwork, type DriveRoad, type RouteGuidance } from "./CityRoadNetwork";
import { NYC_OSM_BOUNDARY_CLOSURES, NYC_OSM_BUILDINGS, NYC_OSM_ROADS } from "./nycShuttleOsmData";

export type CityBusInput = {
  accelerate: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
  shiftUp: boolean;
  shiftDown: boolean;
};

export type ShuttleMinimapSnapshot = {
  x: number;
  z: number;
  heading: number;
  road: string;
  destinationX: number;
  destinationZ: number;
};

export type ShuttleImpactEvent = {
  kind: "traffic" | "building" | "barrier";
  severity: number;
  damage: number;
  integrity: number;
  label: string;
  disabled: boolean;
  protected: boolean;
};

type StaticCollider = {
  id: string;
  kind: "building" | "barrier";
  label: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  yaw: number;
};

type TrafficVehicle = {
  root: THREE.Group;
  progress: number;
  lane: number;
  targetLane: number;
  speed: number;
  cruise: number;
  phase: number;
  nextLaneChange: number;
  collisionOffset: THREE.Vector3;
};

type LocalTrafficVehicle = {
  root: THREE.Group;
  path: readonly THREE.Vector3[];
  distance: number;
  speed: number;
  laneOffset: number;
  collisionOffset: THREE.Vector3;
};

type TrafficSignalAspect = "RED" | "YELLOW" | "GREEN";

type TrafficSignal = {
  progress: number;
  lenses: Record<TrafficSignalAspect, THREE.MeshStandardMaterial>;
};

type BuiltBus = {
  root: THREE.Group;
  steeringWheel: THREE.Group;
  gripAnchors: readonly [THREE.Object3D, THREE.Object3D];
  damageStages: readonly THREE.Group[];
};

const HIGHWAY_START = 900;
const HIGHWAY_EXIT_START = 2550;
const HIGHWAY_OSM_BLEND_START = 2180;
const HIGHWAY_EXIT_JUNCTION = [-99.762, -2562.723] as const;
type RoutePoint = readonly [number, number];

function cubicRoutePoints(start: RoutePoint, controlA: RoutePoint, controlB: RoutePoint, end: RoutePoint, segments: number) {
  const points: RoutePoint[] = [];
  for (let segment = 0; segment <= segments; segment++) {
    const t = segment / segments, inverse = 1 - t;
    points.push([
      inverse ** 3 * start[0] + 3 * inverse ** 2 * t * controlA[0] + 3 * inverse * t ** 2 * controlB[0] + t ** 3 * end[0],
      inverse ** 3 * start[1] + 3 * inverse ** 2 * t * controlA[1] + 3 * inverse * t ** 2 * controlB[1] + t ** 3 * end[1],
    ]);
  }
  return points;
}

function quadraticRoutePoints(start: RoutePoint, control: RoutePoint, end: RoutePoint, segments: number) {
  const points: RoutePoint[] = [];
  for (let segment = 0; segment <= segments; segment++) {
    const t = segment / segments, inverse = 1 - t;
    points.push([
      inverse ** 2 * start[0] + 2 * inverse * t * control[0] + t ** 2 * end[0],
      inverse ** 2 * start[1] + 2 * inverse * t * control[1] + t ** 2 * end[1],
    ]);
  }
  return points;
}

const addRouteVector = (point: RoutePoint, direction: RoutePoint, distance: number): RoutePoint => [point[0] + direction[0] * distance, point[1] + direction[1] * distance];
// The local Manhattan grid is intentionally authored as an orthogonal basis.
// West 79th runs east with a slight map rotation; Central Park West is its
// exact perpendicular. Raw OSM graph nodes remain available for free-roam,
// but no longer dictate the recommended line's sharp, building-cutting zigzag.
const MANHATTAN_STREET_EAST = [-.95394, -.3] as const;
const MANHATTAN_AVENUE_NORTH = [-.3, .95394] as const;
const WEST_79_MERGE = [-148, -2621] as const;
const CENTRAL_PARK_WEST_INTERSECTION = addRouteVector(WEST_79_MERGE, MANHATTAN_STREET_EAST, 178);
const WEST_79_TURN_IN = addRouteVector(CENTRAL_PARK_WEST_INTERSECTION, MANHATTAN_STREET_EAST, -12);
const CENTRAL_PARK_WEST_TURN_OUT = addRouteVector(CENTRAL_PARK_WEST_INTERSECTION, MANHATTAN_AVENUE_NORTH, 12);
// Leave the southbound parkway with forward momentum. The start derivative is
// due south, matching the highway, and the end derivative is parallel to West
// 79th, so neither the shuttle nor traffic snaps through an artificial elbow.
const HIGHWAY_EXIT_RAMP_POINTS = cubicRoutePoints(
  HIGHWAY_EXIT_JUNCTION,
  [-99.762, -2589],
  addRouteVector(WEST_79_MERGE, MANHATTAN_STREET_EAST, -28),
  WEST_79_MERGE,
  12,
);
const WEST_79_GRID_OFFSETS = [44.5, 89, 133.5] as const;
const WEST_79_GRID_POINTS = [
  ...WEST_79_GRID_OFFSETS.map(distance => addRouteVector(WEST_79_MERGE, MANHATTAN_STREET_EAST, distance)),
  WEST_79_TURN_IN,
] as const;
const CENTRAL_PARK_WEST_TURN_POINTS = quadraticRoutePoints(
  WEST_79_TURN_IN,
  CENTRAL_PARK_WEST_INTERSECTION,
  CENTRAL_PARK_WEST_TURN_OUT,
  7,
);
const CENTRAL_PARK_WEST_POINTS = [
  addRouteVector(CENTRAL_PARK_WEST_INTERSECTION, MANHATTAN_AVENUE_NORTH, 34),
  addRouteVector(CENTRAL_PARK_WEST_INTERSECTION, MANHATTAN_AVENUE_NORTH, 58),
] as const;
const MANHATTAN_PRIMARY_POINTS: readonly RoutePoint[] = [
  ...HIGHWAY_EXIT_RAMP_POINTS,
  ...WEST_79_GRID_POINTS,
  ...CENTRAL_PARK_WEST_TURN_POINTS.slice(1),
  ...CENTRAL_PARK_WEST_POINTS,
];
export const CITY_BUS_MANHATTAN_MINIMAP_POINTS = MANHATTAN_PRIMARY_POINTS;
// The playable Upper West Side is deliberately legible at driving speed:
// three perpendicular local streets end at visible Open Streets barriers,
// while the fourth junction is the only through turn onto Central Park West.
const UWS_LOCAL_ACCESS_LENGTH = 31;
const UWS_LOCAL_ACCESS_CENTERS = WEST_79_GRID_OFFSETS.map(distance => addRouteVector(WEST_79_MERGE, MANHATTAN_STREET_EAST, distance));
export const CITY_BUS_LOCAL_CLOSURE_POINTS = UWS_LOCAL_ACCESS_CENTERS.flatMap(center => [
  addRouteVector(center, MANHATTAN_AVENUE_NORTH, UWS_LOCAL_ACCESS_LENGTH),
  addRouteVector(center, MANHATTAN_AVENUE_NORTH, -UWS_LOCAL_ACCESS_LENGTH),
]);
const UWS_PLAYABILITY_BOUNDS = { minimumX: -370, maximumX: -115, minimumZ: -2725, maximumZ: -2575 } as const;
const insideGuidedUwsDistrict = (x: number, z: number) => x >= UWS_PLAYABILITY_BOUNDS.minimumX && x <= UWS_PLAYABILITY_BOUNDS.maximumX && z >= UWS_PLAYABILITY_BOUNDS.minimumZ && z <= UWS_PLAYABILITY_BOUNDS.maximumZ;
const VISIBLE_OSM_ROADS = NYC_OSM_ROADS.filter(road => {
  const midpointX = (road.start[0] + road.end[0]) * .5, midpointZ = (road.start[1] + road.end[1]) * .5;
  return !insideGuidedUwsDistrict(midpointX, midpointZ) && !insideGuidedUwsDistrict(road.start[0], road.start[1]) && !insideGuidedUwsDistrict(road.end[0], road.end[1]);
});
const MANHATTAN_PRIMARY_LENGTHS = MANHATTAN_PRIMARY_POINTS.slice(1).map((point, index) => Math.hypot(point[0] - MANHATTAN_PRIMARY_POINTS[index][0], point[1] - MANHATTAN_PRIMARY_POINTS[index][1]));
const MANHATTAN_PRIMARY_CUMULATIVE = [0];
for (const length of MANHATTAN_PRIMARY_LENGTHS) MANHATTAN_PRIMARY_CUMULATIVE.push(MANHATTAN_PRIMARY_CUMULATIVE.at(-1)! + length);
const MANHATTAN_PRIMARY_LENGTH = MANHATTAN_PRIMARY_CUMULATIVE.at(-1)!;
const CROSSTOWN_START = HIGHWAY_EXIT_START + MANHATTAN_PRIMARY_CUMULATIVE[HIGHWAY_EXIT_RAMP_POINTS.length - 1];
const CENTRAL_PARK_WEST_TURN_START = HIGHWAY_EXIT_START + MANHATTAN_PRIMARY_CUMULATIVE[HIGHWAY_EXIT_RAMP_POINTS.length + WEST_79_GRID_POINTS.length - 1];
const CENTRAL_PARK_WEST_START = HIGHWAY_EXIT_START + MANHATTAN_PRIMARY_LENGTH;
export const CITY_BUS_ROUTE_LENGTH = CENTRAL_PARK_WEST_START;
export const CITY_BUS_HIGHWAY_REVIEW_PROGRESS = 1450;
export const CITY_BUS_EXIT_REVIEW_PROGRESS = HIGHWAY_EXIT_START - 18;
export const CITY_BUS_CITY_REVIEW_PROGRESS = CROSSTOWN_START + 62;
const LANE_WIDTH = 3.35;
const TRAFFIC_LANES = [-1.5, -.5, .5, 1.5] as const;
// Arcade pace is intentional: the sloth is slow on foot, but the vehicles are
// exhilarating. These caps are roughly 2–2.5× the previous values; traffic
// proximity remains readable, but only player brake/handbrake input takes pace.
const STREET_TOP_SPEED = 48;
const EXIT_RAMP_TOP_SPEED = 40;
const UWS_TOP_SPEED = 30;
const HIGHWAY_TOP_SPEED = 72;
const SHUTTLE_GEARS = [
  { gear: 1, topSpeed: 20 },
  { gear: 2, topSpeed: 36 },
  { gear: 3, topSpeed: 52 },
  { gear: 4, topSpeed: HIGHWAY_TOP_SPEED },
] as const;
const SHUTTLE_MAX_DAMAGE = 100;
const SHUTTLE_COLLISION_RADIUS = 1.08;
const SHUTTLE_COLLISION_OFFSETS = [-2.75, 0, 2.75] as const;
const COLLISION_BUCKET_SIZE = 34;
const SIGNAL_STOPS = [150, 335, 565, ...WEST_79_GRID_OFFSETS.map(distance => CROSSTOWN_START + distance), CENTRAL_PARK_WEST_TURN_START + 36] as const;
const MANHATTAN_GRID_INTERSECTIONS = [...WEST_79_GRID_OFFSETS.map(distance => CROSSTOWN_START + distance), CENTRAL_PARK_WEST_TURN_START] as const;
const SIGNAL_COLORS: Record<TrafficSignalAspect, string> = { RED: "#ff3b2f", YELLOW: "#ffd02f", GREEN: "#37e778" };
const ROUTE_LEGS = [
  { from: 0, to: 100, name: "Jungleworld Road", detail: "Bronx Zoo shuttle gate" },
  { from: 100, to: 245, name: "Boston Road", detail: "local Bronx traffic" },
  { from: 245, to: 355, name: "East Tremont Avenue", detail: "turn toward East 177th Street" },
  { from: 355, to: 445, name: "East 177th Street", detail: "Sheridan Boulevard ahead" },
  { from: 445, to: 560, name: "Sheridan Boulevard", detail: "ramp to the Cross Bronx" },
  { from: 560, to: HIGHWAY_START, name: "Cross Bronx Expressway", detail: "westbound toward the Henry Hudson" },
  { from: HIGHWAY_START, to: HIGHWAY_EXIT_START, name: "Henry Hudson Parkway", detail: "NY 9A south along the Hudson River" },
  { from: HIGHWAY_EXIT_START, to: CROSSTOWN_START, name: "West 79th Street Exit", detail: "exit for the museum" },
  { from: CROSSTOWN_START, to: CENTRAL_PARK_WEST_TURN_START, name: "West 79th Street", detail: "stay straight · Central Park West left in 3 blocks" },
  { from: CENTRAL_PARK_WEST_TURN_START, to: CITY_BUS_ROUTE_LENGTH, name: "Central Park West", detail: "north to the museum shuttle bay" },
] as const;

type CollisionContact = { collider: StaticCollider; normal: THREE.Vector3; penetration: number };

class StaticCollisionIndex {
  private readonly buckets = new Map<string, StaticCollider[]>();

  add(collider: StaticCollider) {
    const radius = Math.hypot(collider.halfX, collider.halfZ);
    const minimumX = Math.floor((collider.x - radius) / COLLISION_BUCKET_SIZE), maximumX = Math.floor((collider.x + radius) / COLLISION_BUCKET_SIZE);
    const minimumZ = Math.floor((collider.z - radius) / COLLISION_BUCKET_SIZE), maximumZ = Math.floor((collider.z + radius) / COLLISION_BUCKET_SIZE);
    for (let x = minimumX; x <= maximumX; x++) for (let z = minimumZ; z <= maximumZ; z++) {
      const key = `${x}:${z}`, bucket = this.buckets.get(key) ?? [];
      if (!this.buckets.has(key)) this.buckets.set(key, bucket);
      bucket.push(collider);
    }
  }

  nearby(position: THREE.Vector3) {
    const bucketX = Math.floor(position.x / COLLISION_BUCKET_SIZE), bucketZ = Math.floor(position.z / COLLISION_BUCKET_SIZE);
    const result = new Set<StaticCollider>();
    for (let x = bucketX - 1; x <= bucketX + 1; x++) for (let z = bucketZ - 1; z <= bucketZ + 1; z++) {
      for (const collider of this.buckets.get(`${x}:${z}`) ?? []) result.add(collider);
    }
    return result;
  }
}

function circleObbContact(center: THREE.Vector3, radius: number, collider: StaticCollider): CollisionContact | null {
  const cosine = Math.cos(-collider.yaw), sine = Math.sin(-collider.yaw), dx = center.x - collider.x, dz = center.z - collider.z;
  const localX = dx * cosine - dz * sine, localZ = dx * sine + dz * cosine;
  const closestX = THREE.MathUtils.clamp(localX, -collider.halfX, collider.halfX), closestZ = THREE.MathUtils.clamp(localZ, -collider.halfZ, collider.halfZ);
  let normalX = localX - closestX, normalZ = localZ - closestZ, distance = Math.hypot(normalX, normalZ), penetration = radius - distance;
  if (penetration <= 0) return null;
  if (distance < .0001) {
    const escapeX = collider.halfX - Math.abs(localX), escapeZ = collider.halfZ - Math.abs(localZ);
    if (escapeX < escapeZ) { normalX = Math.sign(localX || 1); normalZ = 0; penetration = radius + escapeX; }
    else { normalX = 0; normalZ = Math.sign(localZ || 1); penetration = radius + escapeZ; }
    distance = 1;
  }
  normalX /= distance; normalZ /= distance;
  const worldCosine = Math.cos(collider.yaw), worldSine = Math.sin(collider.yaw);
  return { collider, penetration, normal: new THREE.Vector3(normalX * worldCosine - normalZ * worldSine, 0, normalX * worldSine + normalZ * worldCosine) };
}

function signalAspectAt(elapsed: number, stop: number): TrafficSignalAspect {
  const phase = ((elapsed + stop * .07) % 16 + 16) % 16;
  return phase < 6.2 ? "RED" : phase < 12.8 ? "GREEN" : "YELLOW";
}

function signalLensMaterial(aspect: TrafficSignalAspect) {
  return new THREE.MeshStandardMaterial({
    color: "#161a18",
    emissive: SIGNAL_COLORS[aspect],
    emissiveIntensity: .035,
    roughness: .18,
    metalness: .02,
  });
}

function setSignalLens(material: THREE.MeshStandardMaterial, aspect: TrafficSignalAspect, active: boolean) {
  material.color.set(active ? SIGNAL_COLORS[aspect] : "#151a18");
  material.emissive.set(SIGNAL_COLORS[aspect]);
  // Preserve the hue under ACES tone mapping. Very high emissive values clip
  // every active lens to white, making red, amber, and green indistinguishable.
  material.emissiveIntensity = active ? (aspect === "YELLOW" ? 2.85 : 2.45) : .035;
  material.roughness = active ? .1 : .42;
}

function routeCenter(progress: number) {
  const p = THREE.MathUtils.clamp(progress, 0, CITY_BUS_ROUTE_LENGTH);
  if (p < HIGHWAY_START) {
    const taper = Math.sin(Math.PI * p / HIGHWAY_START);
    return new THREE.Vector3(Math.sin(p / 112) * 15 * taper, Math.sin(p / 145) * 1.15 * taper, -p);
  }
  if (p < HIGHWAY_OSM_BLEND_START) return new THREE.Vector3(0, .4, -p);
  if (p < HIGHWAY_EXIT_START) {
    // Ease the authored long-distance highway onto the checked-in OSM
    // carriageway. The old route stayed at x=0 and then cut diagonally through
    // a Manhattan building podium to reach an unrelated W 79th Street node.
    const t = (p - HIGHWAY_OSM_BLEND_START) / (HIGHWAY_EXIT_START - HIGHWAY_OSM_BLEND_START);
    const eased = THREE.MathUtils.smootherstep(t, 0, 1);
    return new THREE.Vector3(
      HIGHWAY_EXIT_JUNCTION[0] * eased,
      .4,
      THREE.MathUtils.lerp(-HIGHWAY_OSM_BLEND_START, HIGHWAY_EXIT_JUNCTION[1], t),
    );
  }
  let cursor = p - HIGHWAY_EXIT_START;
  for (let index = 0; index < MANHATTAN_PRIMARY_LENGTHS.length; index++) {
    const length = MANHATTAN_PRIMARY_LENGTHS[index];
    if (cursor > length) { cursor -= length; continue; }
    const start = MANHATTAN_PRIMARY_POINTS[index], end = MANHATTAN_PRIMARY_POINTS[index + 1], t = cursor / Math.max(.001, length);
    return new THREE.Vector3(THREE.MathUtils.lerp(start[0], end[0], t), .4, THREE.MathUtils.lerp(start[1], end[1], t));
  }
  const end = MANHATTAN_PRIMARY_POINTS.at(-1)!;
  return new THREE.Vector3(end[0], .4, end[1]);
}

function routeFrame(progress: number) {
  const before = routeCenter(Math.max(0, progress - .5)), after = routeCenter(Math.min(CITY_BUS_ROUTE_LENGTH, progress + .5));
  const tangent = after.sub(before).setY(0).normalize();
  const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
  const yaw = Math.atan2(-tangent.x, -tangent.z);
  return { center: routeCenter(progress), tangent, right, yaw };
}

const AMNH_END_FRAME = routeFrame(CITY_BUS_ROUTE_LENGTH);
// Match the authored curb bay's local transform exactly. Local -Z faces the
// route tangent, so the stop lies ten metres beyond the routing endpoint and
// 6.8 metres toward the museum curb.
const AMNH_BUS_BAY = AMNH_END_FRAME.center.clone()
  .addScaledVector(AMNH_END_FRAME.right, 6.8)
  .addScaledVector(AMNH_END_FRAME.tangent, 10);

function primaryRoadName(progress: number) {
  return ROUTE_LEGS.find(leg => progress >= leg.from && progress < leg.to)?.name ?? "Central Park West";
}

function displayRoadName(name: string) { return name === "Central Park West Turn" ? "Central Park West" : name; }

function buildDriveRoads() {
  const anchors = new Set<number>();
  for (let progress = 0; progress <= CITY_BUS_ROUTE_LENGTH; progress += 18) anchors.add(Math.min(progress, CITY_BUS_ROUTE_LENGTH));
  for (const progress of [0, HIGHWAY_START, HIGHWAY_EXIT_START, ...MANHATTAN_PRIMARY_CUMULATIVE.map(distance => HIGHWAY_EXIT_START + distance), CITY_BUS_ROUTE_LENGTH]) anchors.add(progress);
  const ordered = [...anchors].sort((a, b) => a - b), roads: DriveRoad[] = [];
  for (let index = 0; index < ordered.length - 1; index++) {
    const from = ordered[index], to = ordered[index + 1], middle = (from + to) * .5;
    const exitRamp = middle >= HIGHWAY_EXIT_START && middle < CROSSTOWN_START;
    roads.push({
      id: `recommended-route-${index + 1}`,
      name: primaryRoadName(middle),
      start: routeCenter(from), end: routeCenter(to),
      halfWidth: exitRamp ? 5.1 : middle >= CROSSTOWN_START ? 7.9 : 10.75,
      speedLimit: middle >= HIGHWAY_EXIT_START
        ? exitRamp ? EXIT_RAMP_TOP_SPEED : UWS_TOP_SPEED
        : middle >= 420 ? HIGHWAY_TOP_SPEED : STREET_TOP_SPEED,
      primaryFrom: from, primaryTo: to,
    });
  }
  // A short, exact connector joins the recommended route vertex to the OSM
  // southbound carriageway. From there the full mapped West Side Highway—not
  // a detached straight strip—owns navigation, rendering and collisions.
  roads.push({ id: "missed-w79-highway-osm-connector", name: "Henry Hudson Parkway · Southbound", start: new THREE.Vector3(HIGHWAY_EXIT_JUNCTION[0], .4, HIGHWAY_EXIT_JUNCTION[1]), end: new THREE.Vector3(-97.756, .4, -2560.579), halfWidth: 10.8, speedLimit: HIGHWAY_TOP_SPEED });
  for (const [intersectionIndex, center] of UWS_LOCAL_ACCESS_CENTERS.entries()) for (const direction of [-1, 1]) {
    const end = addRouteVector(center, MANHATTAN_AVENUE_NORTH, direction * UWS_LOCAL_ACCESS_LENGTH);
    roads.push({
      id: `west-79-local-access-dead-end-${intersectionIndex + 1}-${direction < 0 ? "south" : "north"}`,
      name: "West 79th Street local access",
      start: new THREE.Vector3(center[0], .4, center[1]),
      end: new THREE.Vector3(end[0], .4, end[1]),
      halfWidth: 5.4,
      speedLimit: 18,
    });
  }
  for (const road of VISIBLE_OSM_ROADS) roads.push({
    id: road.id,
    name: road.name,
    start: new THREE.Vector3(road.start[0], .4, road.start[1]),
    end: new THREE.Vector3(road.end[0], .4, road.end[1]),
    halfWidth: road.halfWidth,
    speedLimit: /motorway|trunk/.test(road.roadClass) ? HIGHWAY_TOP_SPEED : STREET_TOP_SPEED,
  });
  return roads;
}

const DRIVE_ROADS = buildDriveRoads();
const PRIMARY_DRIVE_ROADS = DRIVE_ROADS.filter(road => road.primaryFrom !== undefined);

function segmentIntersectsExpandedBuilding(road: DriveRoad, building: (typeof NYC_OSM_BUILDINGS)[number], clearance: number) {
  const cosine = Math.cos(-building.yaw), sine = Math.sin(-building.yaw);
  const local = (point: THREE.Vector3) => {
    const dx = point.x - building.x, dz = point.z - building.z;
    return { x: dx * cosine - dz * sine, z: dx * sine + dz * cosine };
  };
  const start = local(road.start), end = local(road.end), halfX = building.width * .46 + clearance, halfZ = building.depth * .46 + clearance;
  // Fast broad phase keeps the thousands of checked-in footprints cheap.
  const roadCenterX = (road.start.x + road.end.x) * .5, roadCenterZ = (road.start.z + road.end.z) * .5;
  if (Math.hypot(building.x - roadCenterX, building.z - roadCenterZ) > road.start.distanceTo(road.end) * .5 + Math.hypot(halfX, halfZ)) return false;
  let minimumT = 0, maximumT = 1;
  for (const [origin, delta, minimum, maximum] of [
    [start.x, end.x - start.x, -halfX, halfX],
    [start.z, end.z - start.z, -halfZ, halfZ],
  ] as const) {
    if (Math.abs(delta) < .00001) {
      if (origin < minimum || origin > maximum) return false;
      continue;
    }
    const first = (minimum - origin) / delta, second = (maximum - origin) / delta;
    minimumT = Math.max(minimumT, Math.min(first, second)); maximumT = Math.min(maximumT, Math.max(first, second));
    if (minimumT > maximumT) return false;
  }
  return true;
}

const VISIBLE_OSM_BUILDINGS = NYC_OSM_BUILDINGS.filter(building => !DRIVE_ROADS.some(road => {
  const exitRamp = road.primaryFrom !== undefined && road.primaryTo !== undefined && road.primaryTo > HIGHWAY_EXIT_START && road.primaryFrom < CROSSTOWN_START;
  const recommendedRoute = road.primaryFrom !== undefined;
  // Clear the full driveable envelope on the authored route, not merely its
  // centerline. This prevents mapped footprints from clipping into the ramp or
  // the Manhattan grid while retaining dense OSM streetwalls at the sidewalks.
  const clearance = exitRamp ? road.halfWidth + 1.4 : recommendedRoute ? road.halfWidth + 1.05 : Math.min(2.6, road.halfWidth * .28);
  return segmentIntersectsExpandedBuilding(road, building, clearance);
}));

const UWS_TRAFFIC_LOOPS = [
  [new THREE.Vector3(-217.844, .4, -2577.899), new THREE.Vector3(-169.934, .4, -2529.773), new THREE.Vector3(-186.126, .4, -2476.918), new THREE.Vector3(-234.265, .4, -2525.14)],
  [new THREE.Vector3(-201.891, .4, -2630.402), new THREE.Vector3(-153.849, .4, -2582.195), new THREE.Vector3(-169.934, .4, -2529.773), new THREE.Vector3(-217.844, .4, -2577.899)],
  [new THREE.Vector3(-162.511, .4, -2760.31), new THREE.Vector3(-155.056, .4, -2752.868), new THREE.Vector3(-177.461, .4, -2606.012), new THREE.Vector3(-201.891, .4, -2630.402)],
  [new THREE.Vector3(-234.265, .4, -2525.14), new THREE.Vector3(-208.088, .4, -2499.015), new THREE.Vector3(-249.817, .4, -2372.077), new THREE.Vector3(-273.769, .4, -2396.222)],
  // Both mapped carriageways keep moving after the W 79th Street split. A
  // missed exit therefore remains a living highway with same-direction cars
  // rather than an empty navigation-only spur.
  [
    new THREE.Vector3(-97.756, .4, -2560.579), new THREE.Vector3(-76.829, .4, -2628.478),
    new THREE.Vector3(-61.107, .4, -2668.028), new THREE.Vector3(-47.809, .4, -2706.793),
    new THREE.Vector3(12.969, .4, -2904.733), new THREE.Vector3(32.18, .4, -2969.145),
    new THREE.Vector3(15.371, .4, -2922.286), new THREE.Vector3(9.435, .4, -2901.923),
    new THREE.Vector3(-48.571, .4, -2712.752), new THREE.Vector3(-76.178, .4, -2639.01),
    new THREE.Vector3(-99.762, .4, -2562.723),
  ],
] as const;

function closedPathFrame(points: readonly THREE.Vector3[], distance: number) {
  const lengths = points.map((point, index) => point.distanceTo(points[(index + 1) % points.length]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let cursor = ((distance % total) + total) % total;
  for (let index = 0; index < points.length; index++) {
    if (cursor > lengths[index]) { cursor -= lengths[index]; continue; }
    const start = points[index], end = points[(index + 1) % points.length], tangent = end.clone().sub(start).setY(0).normalize();
    const center = start.clone().addScaledVector(tangent, cursor), right = new THREE.Vector3(-tangent.z, 0, tangent.x);
    return { center, tangent, right, yaw: Math.atan2(-tangent.x, -tangent.z), total };
  }
  return { center: points[0].clone(), tangent: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), yaw: 0, total };
}

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([24, 36, 42, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("City bus world requires a 2D canvas context");
  draw(context); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

function signTexture(title: string, subtitle: string) {
  return canvasTexture(1024, 384, context => {
    context.fillStyle = "#123f2f"; context.fillRect(0, 0, 1024, 384);
    context.strokeStyle = "#f0f4df"; context.lineWidth = 15; context.strokeRect(18, 18, 988, 348);
    context.fillStyle = "#ffffff"; context.textAlign = "center"; context.textBaseline = "middle";
    const fittedSize = (text: string, start: number, minimum: number, weight: number, maxWidth: number) => {
      let size = start;
      while (size > minimum) {
        context.font = `${weight} ${size}px Helvetica, Arial, sans-serif`;
        if (context.measureText(text).width <= maxWidth) break;
        size -= 2;
      }
      return size;
    };
    const titleSize = fittedSize(title, 78, 38, 700, 880);
    context.font = `700 ${titleSize}px Helvetica, Arial, sans-serif`; context.fillText(title, 512, 145, 880);
    context.fillStyle = "#d3e7d0";
    const subtitleSize = fittedSize(subtitle, 35, 22, 600, 880);
    context.font = `600 ${subtitleSize}px Helvetica, Arial, sans-serif`; context.fillText(subtitle, 512, 252, 880);
  });
}

function streetBladeTexture(label: string) {
  return canvasTexture(512, 128, context => {
    context.fillStyle = "#174c37"; context.fillRect(0, 0, 512, 128);
    context.strokeStyle = "#e6eee3"; context.lineWidth = 7; context.strokeRect(8, 8, 496, 112);
    context.fillStyle = "#fff"; context.textAlign = "center"; context.textBaseline = "middle";
    context.font = "700 44px Helvetica, Arial, sans-serif"; context.fillText(label.toUpperCase(), 256, 66, 460);
  });
}

function windowTexture() {
  return canvasTexture(512, 512, context => {
    context.fillStyle = "#9a8d7f"; context.fillRect(0, 0, 512, 512);
    // A compact prewar masonry façade tile: stone courses, inset bays,
    // lintels/sills, mullions, curtains and a restrained mix of lit rooms.
    // The prior texture was a field of tiny glowing dots, which made every
    // block read as the same generic office tower from the driver's seat.
    context.lineWidth = 1;
    for (let y = 0; y < 512; y += 16) {
      context.strokeStyle = y % 32 ? "rgba(46,40,35,.13)" : "rgba(255,244,224,.13)";
      context.beginPath(); context.moveTo(0, y + .5); context.lineTo(512, y + .5); context.stroke();
      for (let x = y % 32 ? -34 : 0; x < 512; x += 68) {
        context.strokeStyle = "rgba(46,40,35,.085)";
        context.beginPath(); context.moveTo(x + .5, y); context.lineTo(x + .5, y + 16); context.stroke();
      }
    }
    for (let floor = 0; floor < 7; floor++) for (let bay = 0; bay < 4; bay++) {
      const x = 25 + bay * 126, y = 22 + floor * 70;
      const lit = (floor * 11 + bay * 7) % 9 < 3;
      context.fillStyle = "rgba(49,43,39,.5)"; context.fillRect(x - 7, y - 7, 91, 57);
      context.fillStyle = lit ? "#d7b77a" : "#4b6770"; context.fillRect(x, y, 77, 43);
      const windowGradient = context.createLinearGradient(x, y, x + 77, y + 43);
      windowGradient.addColorStop(0, lit ? "rgba(255,236,179,.55)" : "rgba(179,212,219,.28)");
      windowGradient.addColorStop(.48, "rgba(21,34,39,.18)");
      windowGradient.addColorStop(1, "rgba(8,16,20,.48)");
      context.fillStyle = windowGradient; context.fillRect(x, y, 77, 43);
      context.fillStyle = "rgba(40,43,42,.75)"; context.fillRect(x + 37, y, 3, 43);
      context.fillRect(x, y + 21, 77, 3);
      context.fillStyle = "rgba(230,220,199,.72)"; context.fillRect(x - 4, y + 46, 85, 5);
      if ((floor + bay) % 5 === 0) {
        context.fillStyle = "rgba(216,206,186,.46)"; context.fillRect(x + 4, y + 4, 27, 16);
      }
    }
  });
}

function roadSurfaceTexture() {
  return canvasTexture(1024, 1024, context => {
    context.fillStyle = "#4a4f50"; context.fillRect(0, 0, 1024, 1024);
    // Deterministic aggregate, patched seams and tire-darkened lanes keep the
    // road from reading as one flat gray plane at windshield distance.
    for (let index = 0; index < 5200; index++) {
      const x = index * 193 % 1024, y = index * 433 % 1024, value = 45 + index * 17 % 42;
      context.fillStyle = `rgba(${value},${value + 2},${value + 3},${.08 + index % 5 * .018})`;
      context.fillRect(x, y, 1 + index % 3, 1 + index % 2);
    }
    context.strokeStyle = "rgba(24,28,29,.24)"; context.lineWidth = 7;
    for (let index = 0; index < 9; index++) {
      context.beginPath(); context.moveTo(index * 137 - 50, 0);
      context.bezierCurveTo(index * 137 + 40, 260, index * 137 - 70, 710, index * 137 + 26, 1024); context.stroke();
    }
    context.fillStyle = "rgba(23,26,27,.12)";
    for (const x of [268, 756]) context.fillRect(x, 0, 94, 1024);
  });
}

function setShadows(root: THREE.Object3D, enabled: boolean) {
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = enabled; object.receiveShadow = true; } });
}

function addCitySky(root: THREE.Group) {
  const sky = new Sky();
  sky.name = "bronx-manhattan-atmospheric-evening-sky";
  sky.scale.setScalar(720);
  sky.frustumCulled = false;
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld(true);
  };
  sky.material.uniforms.turbidity.value = 8.2;
  sky.material.uniforms.rayleigh.value = 1.75;
  sky.material.uniforms.mieCoefficient.value = .012;
  sky.material.uniforms.mieDirectionalG.value = .88;
  sky.material.uniforms.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(79), THREE.MathUtils.degToRad(236));
  root.add(sky);
}

function makeBus(quality: number, textures: GameTextures, passengerTextures: THREE.Texture[]): BuiltBus {
  const root = new THREE.Group(); root.name = "bronx-to-amnh-rescue-shuttle-bus";
  const yellow = new THREE.MeshPhysicalMaterial({ color: "#e0ad22", roughness: .48, clearcoat: .5, clearcoatRoughness: .3 });
  const dark = new THREE.MeshStandardMaterial({ color: "#171d1e", roughness: .62 });
  const metal = new THREE.MeshStandardMaterial({ color: "#778184", roughness: .28, metalness: .7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#dce8e7", roughness: .055, transmission: .82, transparent: true, opacity: .11, metalness: .01, clearcoat: .38, depthWrite: false });
  glass.forceSinglePass = true;
  const rubber = new THREE.MeshStandardMaterial({ color: "#101112", roughness: .92 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(3.05, 2.05, 7.8, 8, .22), yellow); body.position.y = 1.65; body.name = "rescue-bus-continuous-coach-body"; root.add(body);
  const lower = new THREE.Mesh(new RoundedBoxGeometry(3.14, .68, 7.9, 6, .16), dark); lower.position.y = .72; root.add(lower);
  // The glass extends beyond the camera frustum: the player sees an unbroken
  // windscreen grade, never a floating panel edge or a fake roof header.
  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), glass); windshield.position.set(0, 2.18, -3.92); windshield.rotation.x = -.035; windshield.name = "rescue-bus-full-cab-windscreen-glare"; root.add(windshield);
  for (const side of [-1, 1]) for (let row = 0; row < 4; row++) {
    const window = new THREE.Mesh(new RoundedBoxGeometry(.07, 1.08, 1.35, 4, .035), glass);
    window.position.set(side * 1.55, 2.05, -2.35 + row * 1.55); root.add(window);
  }
  const wheelGeometry = new THREE.CylinderGeometry(.49, .49, .32, quality > .75 ? 28 : 18);
  for (const side of [-1, 1]) for (const z of [-2.5, 2.45]) {
    const wheel = new THREE.Mesh(wheelGeometry, rubber); wheel.rotation.z = Math.PI / 2; wheel.position.set(side * 1.58, .55, z); wheel.name = "rescue-bus-road-wheel"; root.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .34, 18), metal); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); root.add(hub);
  }
  const dashboard = new THREE.Mesh(new RoundedBoxGeometry(2.7, .5, .72, 5, .08), dark); dashboard.position.set(0, 1.38, -3.48); root.add(dashboard);
  const steeringWheel = new THREE.Group();
  steeringWheel.name = "museum-shuttle-steering-wheel-assembly";
  steeringWheel.position.set(-.82, 1.74, -3.28);
  steeringWheel.rotation.x = -.25;
  const steeringRim = new THREE.Mesh(new THREE.TorusGeometry(.235, .034, 12, 36), rubber);
  steeringRim.name = "museum-shuttle-steering-wheel-rim";
  steeringWheel.add(steeringRim);
  for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const end = new THREE.Vector3(Math.cos(angle) * .19, Math.sin(angle) * .19, 0);
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(.015, .018, end.length(), 9), metal);
    spoke.position.copy(end).multiplyScalar(.5);
    spoke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
    steeringWheel.add(spoke);
  }
  // The wrists sit just camera-side of the rim. Sloth claws project forward
  // from each wrist, so this clearance keeps the digits wrapped visibly over
  // the wheel instead of disappearing behind its silhouette in the cockpit.
  const leftGrip = new THREE.Object3D(); leftGrip.name = "museum-shuttle-steering-wheel-left-paw-grip"; leftGrip.position.set(-.205, .055, .19);
  const rightGrip = new THREE.Object3D(); rightGrip.name = "museum-shuttle-steering-wheel-right-paw-grip"; rightGrip.position.set(.205, .055, .19);
  steeringWheel.add(leftGrip, rightGrip);
  root.add(steeringWheel);

  for (let row = 0; row < 4; row++) for (const side of [-1, 1]) {
    const seat = new THREE.Mesh(new RoundedBoxGeometry(.64, .88, .68, 4, .08), new THREE.MeshStandardMaterial({ color: row % 2 ? "#315b69" : "#3b6d72", roughness: .8 }));
    seat.position.set(side * .78, 1.25, -.9 + row * 1.25); seat.name = "museum-shuttle-passenger-seat"; root.add(seat);
  }
  for (let index = 0; index < 4; index++) {
    const result = createPremiumSlothFriend(textures, quality, index, ["#514536", "#423a31", "#594936", "#443a30"][index]);
    result.root.name = "rescued-sloth-on-museum-shuttle-" + (index + 1);
    result.root.scale.multiplyScalar(.72); result.root.position.set(index % 2 ? .78 : -.78, 1.08, -.28 + Math.floor(index / 2) * 1.32); result.root.rotation.y = Math.PI;
    root.add(result.root); passengerTextures.push(...result.ownedTextures);
  }
  const damageStages = [new THREE.Group(), new THREE.Group(), new THREE.Group()];
  damageStages.forEach((stage, index) => { stage.name = `museum-shuttle-visible-damage-stage-${index + 1}`; stage.visible = false; root.add(stage); });
  const scrapeMaterial = new THREE.MeshStandardMaterial({ color: "#3c332b", roughness: .98, metalness: .18 });
  for (let index = 0; index < 5; index++) {
    const scrape = new THREE.Mesh(new RoundedBoxGeometry(.48 + index % 2 * .24, .055, .035, 2, .012), scrapeMaterial);
    scrape.name = "museum-shuttle-impact-scrape-and-dented-paint"; scrape.position.set(-1.05 + index * .52, .76 + index % 3 * .24, -3.985); scrape.rotation.z = -.24 + index * .11; damageStages[0].add(scrape);
  }
  const crackMaterial = new THREE.LineBasicMaterial({ color: "#d9e5e5", transparent: true, opacity: .72, toneMapped: false });
  for (let branch = 0; branch < 7; branch++) {
    const start = new THREE.Vector3(.62, 2.1, -3.972), angle = -.95 + branch * .31, length = .34 + branch % 3 * .13;
    const points = [start, start.clone().add(new THREE.Vector3(Math.cos(angle) * length, Math.sin(angle) * length, -.004))];
    const crack = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), crackMaterial); crack.name = "museum-shuttle-windshield-radiating-impact-crack"; damageStages[1].add(crack);
  }
  const smokeMaterial = new THREE.MeshStandardMaterial({ color: "#4c4e4c", transparent: true, opacity: .38, roughness: 1, depthWrite: false });
  for (let puff = 0; puff < 5; puff++) {
    const smoke = new THREE.Mesh(new THREE.IcosahedronGeometry(.28 + puff * .045, 1), smokeMaterial);
    smoke.name = "museum-shuttle-disabled-engine-smoke"; smoke.position.set(-.6 + puff * .22, 2.85 + puff * .34, -3 + puff * .13); smoke.userData.phase = puff * 1.37; damageStages[2].add(smoke);
  }
  setShadows(root, quality > .58);
  return { root, steeringWheel, gripAnchors: [leftGrip, rightGrip], damageStages };
}

function makeTrafficCar(index: number, quality: number) {
  const root = new THREE.Group(); root.name = "new-york-stop-and-go-traffic-vehicle-" + (index + 1);
  const palette = ["#c7b329", "#2c5868", "#a8aaa5", "#812e2b", "#242a31", "#e7e4d8"];
  const paint = new THREE.MeshPhysicalMaterial({ color: palette[index % palette.length], roughness: .42, clearcoat: .58 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#75929c", roughness: .14, transparent: true, opacity: .72 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#111212", roughness: .95 });
  const chrome = new THREE.MeshStandardMaterial({ color: "#aeb5b5", roughness: .25, metalness: .78 });
  const headlamp = new THREE.MeshPhysicalMaterial({ color: "#fff3cf", emissive: "#ffd78a", emissiveIntensity: .9, roughness: .18, clearcoat: .65 });
  const tailLamp = new THREE.MeshPhysicalMaterial({ color: "#a91f19", emissive: "#6f0806", emissiveIntensity: .42, roughness: .25, clearcoat: .55 });
  const chassis = new THREE.Mesh(new RoundedBoxGeometry(1.76, .48, 3.82, 6, .14), paint); chassis.position.y = .58; root.add(chassis);
  const hood = new THREE.Mesh(new RoundedBoxGeometry(1.66, .34, 1.38, 5, .12), paint); hood.position.set(0, .84, -1.18); root.add(hood);
  const trunk = new THREE.Mesh(new RoundedBoxGeometry(1.68, .4, 1.02, 5, .12), paint); trunk.position.set(0, .87, 1.43); root.add(trunk);
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.49, .72, 1.88, 6, .16), glass); cabin.position.set(0, 1.18, -.1); root.add(cabin);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.38, .11, 1.35, 4, .05), paint); roof.position.set(0, 1.55, -.08); root.add(roof);
  // Painted pillars and window rails prevent the transparent cabin from
  // reading as a single aquarium block.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(.055, .13, 1.82, 3, .02), paint); rail.position.set(side * .755, 1.16, -.08); root.add(rail);
    for (const z of [-.73, .58]) {
      const pillar = new THREE.Mesh(new RoundedBoxGeometry(.065, .68, .11, 3, .02), paint); pillar.position.set(side * .755, 1.18, z); root.add(pillar);
    }
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(.18, .11, .28, 4, .04), paint); mirror.position.set(side * .95, 1.08, -.72); root.add(mirror);
  }
  const grille = new THREE.Mesh(new RoundedBoxGeometry(1.02, .18, .055, 3, .018), chrome); grille.position.set(0, .62, -1.9); root.add(grille);
  const rearBumper = new THREE.Mesh(new RoundedBoxGeometry(1.45, .13, .08, 3, .025), chrome); rearBumper.position.set(0, .47, 1.96); root.add(rearBumper);
  const licensePlate = new THREE.Mesh(new RoundedBoxGeometry(.42, .18, .035, 3, .012), new THREE.MeshStandardMaterial({ color: "#e7be47", roughness: .48 })); licensePlate.position.set(0, .69, 1.945); root.add(licensePlate);
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(new RoundedBoxGeometry(.32, .2, .07, 3, .025), headlamp); light.position.set(side * .58, .76, -1.91); root.add(light);
    const tail = new THREE.Mesh(new RoundedBoxGeometry(.3, .22, .07, 3, .025), tailLamp); tail.position.set(side * .6, .73, 1.9); root.add(tail);
  }
  if (index % 5 === 0) {
    const roofLight = new THREE.Mesh(new RoundedBoxGeometry(.62, .18, .3, 3, .04), new THREE.MeshStandardMaterial({ color: "#e8c230", emissive: "#a2710c", emissiveIntensity: .2 })); roofLight.position.set(0, 1.55, -.2); root.add(roofLight);
  }
  const wheel = new THREE.CylinderGeometry(.3, .3, .2, quality > .75 ? 20 : 14);
  for (const side of [-1, 1]) for (const z of [-1.2, 1.2]) {
    const tire = new THREE.Mesh(wheel, rubber); tire.rotation.z = Math.PI / 2; tire.position.set(side * .88, .4, z); root.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .22, quality > .75 ? 16 : 10), chrome); hub.rotation.z = Math.PI / 2; hub.position.set(side * .89, .4, z); root.add(hub);
  }
  setShadows(root, quality > .65); return root;
}

function addOsmRoadSurfaces(root: THREE.Group, asphalt: THREE.Material, concrete: THREE.Material, lane: THREE.Material) {
  const roadGeometry = new RoundedBoxGeometry(1, .18, 1, 3, .04), sidewalkGeometry = new RoundedBoxGeometry(1, .28, 1, 3, .05), stripeGeometry = new RoundedBoxGeometry(.09, .025, 1, 2, .01);
  const roads = new THREE.InstancedMesh(roadGeometry, asphalt, VISIBLE_OSM_ROADS.length);
  roads.name = "openstreetmap-authored-upper-west-side-driveable-road-surfaces"; roads.receiveShadow = true;
  const sidewalks = new THREE.InstancedMesh(sidewalkGeometry, concrete, VISIBLE_OSM_ROADS.length * 2);
  sidewalks.name = "openstreetmap-authored-upper-west-side-continuous-sidewalks"; sidewalks.receiveShadow = true;
  const marked = VISIBLE_OSM_ROADS.filter(road => /motorway|trunk|primary|secondary|tertiary/.test(road.roadClass));
  const stripes = new THREE.InstancedMesh(stripeGeometry, lane, marked.length * 2);
  stripes.name = "openstreetmap-authored-upper-west-side-lane-markings"; stripes.receiveShadow = true;
  const dummy = new THREE.Object3D(); let sidewalkIndex = 0, stripeIndex = 0;
  VISIBLE_OSM_ROADS.forEach((road, index) => {
    const start = new THREE.Vector3(road.start[0], 0, road.start[1]), end = new THREE.Vector3(road.end[0], 0, road.end[1]), tangent = end.clone().sub(start), length = tangent.length();
    if (length < .01) return;
    tangent.multiplyScalar(1 / length); const right = new THREE.Vector3(-tangent.z, 0, tangent.x), yaw = Math.atan2(-tangent.x, -tangent.z), center = start.add(end).multiplyScalar(.5);
    dummy.position.set(center.x, .31, center.z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(road.halfWidth * 2, 1, length + .7); dummy.updateMatrix(); roads.setMatrixAt(index, dummy.matrix);
    const openExitMerge = Math.hypot(center.x - HIGHWAY_EXIT_JUNCTION[0], center.z - HIGHWAY_EXIT_JUNCTION[1]) < 92;
    if (length >= 8 && /motorway|trunk/.test(road.roadClass) && !/motorway_link/.test(road.roadClass) && !openExitMerge) for (const side of [-1, 1]) {
      dummy.position.set(center.x + right.x * side * (road.halfWidth + .72), .39, center.z + right.z * side * (road.halfWidth + .72)); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1.18, 1, Math.max(2, length - 3.5)); dummy.updateMatrix(); sidewalks.setMatrixAt(sidewalkIndex++, dummy.matrix);
    }
    if (length >= 12 && /motorway|trunk|primary|secondary|tertiary/.test(road.roadClass)) for (const side of [-1, 1]) {
      dummy.position.set(center.x + right.x * side * 1.8, .43, center.z + right.z * side * 1.8); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1, 1, Math.max(1.2, length * .62)); dummy.updateMatrix(); stripes.setMatrixAt(stripeIndex++, dummy.matrix);
    }
  });
  sidewalks.count = sidewalkIndex; stripes.count = stripeIndex;
  roads.instanceMatrix.needsUpdate = sidewalks.instanceMatrix.needsUpdate = stripes.instanceMatrix.needsUpdate = true;
  root.add(roads, sidewalks, stripes);
}

function addOsmBuildingsAndClosures(
  root: THREE.Group,
  quality: number,
  textures: GameTextures,
  ownedTextures: THREE.Texture[],
  buildingMaterials: readonly THREE.Material[],
  corniceMaterials: readonly THREE.Material[],
  baseMaterials: readonly THREE.Material[],
  collisionIndex: StaticCollisionIndex,
) {
  const buildingGeometry = new RoundedBoxGeometry(1, 1, 1, 3, .025), corniceGeometry = new RoundedBoxGeometry(1, 1, 1, 3, .02), baseGeometry = new RoundedBoxGeometry(1, 1, 1, 3, .02), sidewalkPadGeometry = new RoundedBoxGeometry(1, .18, 1, 3, .025);
  const sidewalkPadMaterial = new THREE.MeshStandardMaterial({ color: "#797a74", map: textures.stone, roughness: .96 });
  const variants = buildingMaterials.map((material, variant) => {
    // The detailed arrival campus replaces the raw OSM massing immediately
    // around AMNH. Retain the surrounding real footprints so every approach
    // still reads as a continuous city block.
    const buildings = VISIBLE_OSM_BUILDINGS.filter(building => building.variant === variant && Math.hypot(building.x - AMNH_END_FRAME.center.x, building.z - AMNH_END_FRAME.center.z) > 52);
    const mesh = new THREE.InstancedMesh(buildingGeometry, material, buildings.length); mesh.name = `openstreetmap-real-building-footprint-variant-${variant + 1}`; mesh.receiveShadow = true; mesh.castShadow = quality > .84;
    const cornices = new THREE.InstancedMesh(corniceGeometry, corniceMaterials[variant % corniceMaterials.length], buildings.length); cornices.name = "openstreetmap-building-roofline-and-cornice"; cornices.receiveShadow = true;
    const bases = new THREE.InstancedMesh(baseGeometry, baseMaterials[variant % baseMaterials.length], buildings.length); bases.name = "openstreetmap-building-articulated-ground-floor-base"; bases.receiveShadow = true;
    const sidewalkPads = new THREE.InstancedMesh(sidewalkPadGeometry, sidewalkPadMaterial, buildings.length); sidewalkPads.name = "openstreetmap-building-footprint-continuous-block-sidewalk-pad"; sidewalkPads.receiveShadow = true;
    const dummy = new THREE.Object3D();
    buildings.forEach((building, index) => {
      dummy.position.set(building.x, building.height * .5, building.z); dummy.rotation.set(0, building.yaw, 0); dummy.scale.set(building.width, building.height, building.depth); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix);
      dummy.position.set(building.x, building.height + .16, building.z); dummy.scale.set(building.width + .34, .34, building.depth + .34); dummy.updateMatrix(); cornices.setMatrixAt(index, dummy.matrix);
      dummy.position.set(building.x, 1.35, building.z); dummy.scale.set(building.width * .97, 2.7, building.depth * .97); dummy.updateMatrix(); bases.setMatrixAt(index, dummy.matrix);
      dummy.position.set(building.x, .2, building.z); dummy.scale.set(building.width + 3.1, 1, building.depth + 3.1); dummy.updateMatrix(); sidewalkPads.setMatrixAt(index, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = cornices.instanceMatrix.needsUpdate = bases.instanceMatrix.needsUpdate = sidewalkPads.instanceMatrix.needsUpdate = true;
    root.add(sidewalkPads, mesh, bases, cornices); return mesh;
  });
  void variants;

  const roofCount = Math.floor(VISIBLE_OSM_BUILDINGS.length / 7), roof = new THREE.InstancedMesh(new THREE.CylinderGeometry(.75, .9, 1.5, 12), new THREE.MeshStandardMaterial({ color: "#4d3d31", roughness: .94 }), roofCount);
  roof.name = "openstreetmap-building-rooftop-water-tanks-and-mechanical-detail";
  const roofDummy = new THREE.Object3D(); let roofIndex = 0;
  for (const building of VISIBLE_OSM_BUILDINGS) {
    if (building.id % 7 !== 0 || roofIndex >= roofCount || Math.hypot(building.x - AMNH_END_FRAME.center.x, building.z - AMNH_END_FRAME.center.z) <= 52) continue;
    roofDummy.position.set(building.x, building.height + .82, building.z); roofDummy.rotation.set(0, building.yaw, 0); roofDummy.scale.set(1, 1, 1); roofDummy.updateMatrix(); roof.setMatrixAt(roofIndex++, roofDummy.matrix);
  }
  roof.count = roofIndex; roof.instanceMatrix.needsUpdate = true; root.add(roof);

  const blue = new THREE.MeshPhysicalMaterial({ color: "#176aa3", roughness: .42, clearcoat: .4 }), rubber = new THREE.MeshStandardMaterial({ color: "#171b1c", roughness: .95 }), amber = new THREE.MeshStandardMaterial({ color: "#ffb629", emissive: "#9a4c06", emissiveIntensity: .55, roughness: .4 });
  const closureTexture = streetBladeTexture("OPEN STREET · LOCAL ACCESS"); ownedTextures.push(closureTexture);
  const signMaterial = new THREE.MeshBasicMaterial({ map: closureTexture, toneMapped: false });
  // West Side Highway is the intentional recovery corridor after a missed
  // W 79th exit, so its two snapshot-edge records must not become physical
  // walls across live motorway lanes. Other edge streets retain visible DOT
  // closures and the larger building-context buffer behind them.
  NYC_OSM_BOUNDARY_CLOSURES.filter(closure => closure.road !== "West Side Highway" && !insideGuidedUwsDistrict(closure.x, closure.z)).forEach((closure, closureIndex) => {
    const group = new THREE.Group(); group.name = `nyc-blue-open-streets-performance-boundary-${closureIndex + 1}`; group.position.set(closure.x, .35, closure.z); group.rotation.y = closure.heading;
    for (let segment = -2; segment <= 2; segment++) {
      const barrier = new THREE.Mesh(new RoundedBoxGeometry(2.9, .72, .55, 4, .08), blue); barrier.name = "nyc-dot-blue-water-filled-street-closure-barrier"; barrier.position.x = segment * 2.75; group.add(barrier);
      for (const side of [-1, 1]) { const foot = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, .5, 10), rubber); foot.rotation.z = Math.PI / 2; foot.position.set(segment * 2.75 + side * 1.1, -.32, .18); group.add(foot); }
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.09, 10, 7), amber); lamp.position.set(segment * 2.75, .52, -.2); group.add(lamp);
    }
    const sign = new THREE.Mesh(new RoundedBoxGeometry(4.5, 1.1, .11, 4, .035), signMaterial); sign.name = "open-streets-local-access-closure-sign"; sign.position.set(0, 1.55, 0); group.add(sign); root.add(group);
    collisionIndex.add({ id: `osm-closure-${closureIndex}`, kind: "barrier", label: `${closure.road} Open Streets closure`, x: closure.x, z: closure.z, halfX: 7.25, halfZ: .72, yaw: closure.heading });
  });

  // Central Park remains visible east of its OSM-mapped edge; a deep planted
  // continuation prevents clear color behind boundary closures at the park.
  const park = new THREE.Mesh(new RoundedBoxGeometry(330, .16, 1120, 4, .04), new THREE.MeshStandardMaterial({ color: "#3f623d", map: textures.ground, roughness: 1 }));
  park.name = "openstreetmap-central-park-continuous-landscape-context"; park.position.set(-530, .05, -2600); park.rotation.y = -.31; root.add(park);
  const treeCount = quality < .58 ? 54 : quality < .82 ? 88 : 132, treeDummy = new THREE.Object3D();
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .34, 6.1, 8), new THREE.MeshStandardMaterial({ color: "#624b38", map: textures.bark, roughness: .98 }), treeCount);
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.6, quality > .82 ? 2 : 1), new THREE.MeshStandardMaterial({ color: "#436b42", map: textures.foliage, roughness: .96 }), treeCount);
  trunks.name = "openstreetmap-central-park-context-tree-trunks"; crowns.name = "openstreetmap-central-park-context-tree-canopy";
  for (let index = 0; index < treeCount; index++) {
    const x = -402 - index % 8 * 24 - (index * 13 % 17), z = -2180 - Math.floor(index / 8) * 52 - index % 3 * 9;
    treeDummy.position.set(x, 3.2, z); treeDummy.rotation.set(0, index * 1.7, 0); treeDummy.scale.setScalar(.76 + index % 5 * .08); treeDummy.updateMatrix(); trunks.setMatrixAt(index, treeDummy.matrix);
    treeDummy.position.set(x, 7.3, z); treeDummy.scale.set(1.05 + index % 3 * .12, .82 + index % 4 * .06, 1.05 + (index + 1) % 3 * .12); treeDummy.updateMatrix(); crowns.setMatrixAt(index, treeDummy.matrix);
  }
  trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true; root.add(trunks, crowns);
}

function addRoadNetwork(root: THREE.Group, ownedTextures: THREE.Texture[], quality: number, textures: GameTextures, signals: TrafficSignal[], collisionIndex: StaticCollisionIndex) {
  const roadTexture = roadSurfaceTexture(); roadTexture.wrapS = roadTexture.wrapT = THREE.RepeatWrapping; roadTexture.repeat.set(2, 8); roadTexture.anisotropy = 8; ownedTextures.push(roadTexture);
  const asphalt = new THREE.MeshStandardMaterial({ color: "#5a5e5f", map: roadTexture, bumpMap: roadTexture, bumpScale: .018, roughness: .94 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#8b8980", roughness: .9 });
  const lane = new THREE.MeshStandardMaterial({ color: "#ebe5c5", roughness: .75, emissive: "#4a4632", emissiveIntensity: .06 });
  // Opaque city ground closes the pale void that was visible between detached
  // building footprints. These slabs sit below every driveable surface and
  // establish continuous Bronx blocks and the Manhattan riverbank.
  const cityGround = new THREE.MeshStandardMaterial({ color: "#66665f", map: textures.ground, roughness: 1 });
  const bronxGround = new THREE.Mesh(new RoundedBoxGeometry(250, .28, HIGHWAY_START + 90, 3, .04), cityGround);
  bronxGround.name = "continuous-bronx-neighborhood-ground-plane"; bronxGround.position.set(0, -.27, -HIGHWAY_START * .5); root.add(bronxGround);
  const manhattanGround = new THREE.Mesh(new RoundedBoxGeometry(150, .28, HIGHWAY_EXIT_START - HIGHWAY_START + 120, 3, .04), cityGround);
  manhattanGround.name = "continuous-west-side-manhattan-ground-plane"; manhattanGround.position.set(-84, -.27, -(HIGHWAY_START + HIGHWAY_EXIT_START) * .5); root.add(manhattanGround);
  const upperWestSideGround = new THREE.Mesh(new RoundedBoxGeometry(670, .28, 1240, 3, .04), cityGround);
  upperWestSideGround.name = "finite-no-void-openstreetmap-upper-west-side-district-ground-plane";
  upperWestSideGround.position.set(-225, -.27, -2605); root.add(upperWestSideGround);
  const surfaceAnchors = new Set<number>();
  for (let progress = 0; progress <= CITY_BUS_ROUTE_LENGTH; progress += 18) surfaceAnchors.add(Math.min(progress, CITY_BUS_ROUTE_LENGTH));
  for (const distance of MANHATTAN_PRIMARY_CUMULATIVE) surfaceAnchors.add(HIGHWAY_EXIT_START + distance);
  const orderedSurfaceAnchors = [...surfaceAnchors].sort((a, b) => a - b);
  for (let segment = 0; segment < orderedSurfaceAnchors.length - 1; segment++) {
    const progress = orderedSurfaceAnchors[segment], next = orderedSurfaceAnchors[segment + 1], middle = (progress + next) / 2, a = routeCenter(progress), b = routeCenter(next), frame = routeFrame(middle), length = a.distanceTo(b);
    const exitRamp = middle >= HIGHWAY_EXIT_START && middle < CROSSTOWN_START;
    const upperWestSide = middle >= CROSSTOWN_START, roadWidth = exitRamp ? 10.2 : upperWestSide ? 16.2 : 21.5, sidewalkOffset = roadWidth * .5 + 2.55;
    const curbFreeExitMerge = middle >= HIGHWAY_EXIT_START - 170 && middle < CROSSTOWN_START;
    const curbFreeIntersection = MANHATTAN_GRID_INTERSECTIONS.some(intersection => Math.abs(middle - intersection) < 13.5);
    const road = new THREE.Mesh(new RoundedBoxGeometry(roadWidth, .18, length + .8, 3, .04), asphalt); road.name = exitRamp ? "smooth-two-lane-west-79th-off-ramp-segment" : upperWestSide ? "upper-west-side-narrower-city-street-segment" : "compressed-nyc-road-segment"; road.position.copy(a).add(b).multiplyScalar(.5); road.position.y -= .08; road.rotation.y = frame.yaw; root.add(road);
    // The OSM motorway-link surface already defines the ramp shoulders. Short
    // rectangular sidewalk/curb pieces cannot join cleanly on this compound
    // curve and previously formed diagonal concrete teeth across the exit.
    for (const side of curbFreeExitMerge || curbFreeIntersection ? [] : [-1, 1]) {
      const walk = new THREE.Mesh(new RoundedBoxGeometry(5.2, .28, length + .6, 3, .05), concrete); walk.position.copy(road.position).addScaledVector(frame.right, side * sidewalkOffset); walk.position.y += .07; walk.rotation.y = frame.yaw; root.add(walk);
      const barrier = new THREE.Mesh(new RoundedBoxGeometry(.28, .72, length + .25, 3, .05), concrete); barrier.position.copy(road.position).addScaledVector(frame.right, side * (roadWidth * .5 + .2)); barrier.position.y += .35; barrier.rotation.y = frame.yaw; root.add(barrier);
    }
    const laneDividers = exitRamp ? [0] : [-LANE_WIDTH, 0, LANE_WIDTH];
    for (const offset of laneDividers) {
      const stripe = new THREE.Mesh(new RoundedBoxGeometry(.09, .025, length * .62, 2, .01), lane); stripe.position.copy(road.position).addScaledVector(frame.right, offset); stripe.position.y += .12; stripe.rotation.y = frame.yaw; root.add(stripe);
    }
    for (const side of [-1, 1]) {
      const edgeLine = new THREE.Mesh(new RoundedBoxGeometry(.13, .027, length + .14, 2, .012), lane);
      edgeLine.name = "continuous-painted-road-edge-line";
      edgeLine.position.copy(road.position).addScaledVector(frame.right, side * (roadWidth * .5 - .58)); edgeLine.position.y += .125; edgeLine.rotation.y = frame.yaw; root.add(edgeLine);
    }
  }
  // A single asphalt apron bridges the authored highway, OSM motorway link,
  // and W 79th ramp. It removes the last curb seam without erecting a hidden
  // collision proxy across any of the three driveable branches.
  const exitApron = new THREE.Mesh(new THREE.CircleGeometry(19, 48), asphalt);
  exitApron.name = "seamless-driveable-west-79th-exit-merge-apron";
  exitApron.rotation.x = -Math.PI / 2;
  exitApron.position.set(HIGHWAY_EXIT_JUNCTION[0], .415, HIGHWAY_EXIT_JUNCTION[1]);
  exitApron.receiveShadow = true;
  root.add(exitApron);
  // Continuous paved intersection tables bridge the recommended grid and the
  // surrounding OSM streets. They hide rectangular segment seams while still
  // leaving every wrong-turn branch open to the navigation network.
  for (const progress of MANHATTAN_GRID_INTERSECTIONS) {
    const junction = new THREE.Mesh(new THREE.CircleGeometry(13.2, 40), asphalt);
    junction.name = "manhattan-grid-continuous-driveable-intersection";
    junction.rotation.x = -Math.PI / 2;
    junction.position.copy(routeCenter(progress)); junction.position.y = .416;
    junction.receiveShadow = true; root.add(junction);
  }
  // The imported OSM mesh used to draw several overlapping diagonals through
  // this small gameplay area. Replace them with a readable arcade grid: each
  // early cross street is genuinely driveable, but ends at a visible blue
  // local-access closure so a wrong turn is recoverable rather than a maze.
  const closureBlue = new THREE.MeshPhysicalMaterial({ color: "#176aa3", roughness: .42, clearcoat: .4 });
  const closureAmber = new THREE.MeshStandardMaterial({ color: "#ffb629", emissive: "#9a4c06", emissiveIntensity: .55, roughness: .4 });
  const avenueYaw = Math.atan2(-MANHATTAN_AVENUE_NORTH[0], -MANHATTAN_AVENUE_NORTH[1]);
  UWS_LOCAL_ACCESS_CENTERS.forEach((center, intersectionIndex) => {
    const centerVector = new THREE.Vector3(center[0], .4, center[1]);
    const crossRoad = new THREE.Mesh(new RoundedBoxGeometry(10.8, .18, UWS_LOCAL_ACCESS_LENGTH * 2 + 1.2, 3, .04), asphalt);
    crossRoad.name = `west-79-clear-perpendicular-local-access-street-${intersectionIndex + 1}`;
    crossRoad.position.copy(centerVector); crossRoad.position.y -= .08; crossRoad.rotation.y = avenueYaw; root.add(crossRoad);
    const centerLine = new THREE.Mesh(new RoundedBoxGeometry(.1, .026, UWS_LOCAL_ACCESS_LENGTH * 2 - 7, 2, .01), lane);
    centerLine.name = "west-79-local-access-painted-centerline"; centerLine.position.copy(centerVector); centerLine.position.y += .13; centerLine.rotation.y = avenueYaw; root.add(centerLine);
    for (const direction of [-1, 1]) {
      const endpoint = addRouteVector(center, MANHATTAN_AVENUE_NORTH, direction * UWS_LOCAL_ACCESS_LENGTH);
      const barrier = new THREE.Group(); barrier.name = `west-79-visible-blue-local-access-dead-end-${intersectionIndex + 1}-${direction < 0 ? "south" : "north"}`;
      barrier.position.set(endpoint[0], .45, endpoint[1]); barrier.rotation.y = avenueYaw;
      for (let segment = -1; segment <= 1; segment++) {
        const body = new THREE.Mesh(new RoundedBoxGeometry(3.55, .82, .68, 4, .09), closureBlue); body.position.x = segment * 3.25; barrier.add(body);
        const lamp = new THREE.Mesh(new THREE.SphereGeometry(.1, 10, 7), closureAmber); lamp.position.set(segment * 3.25, .55, -.18); barrier.add(lamp);
      }
      root.add(barrier);
      collisionIndex.add({ id: `west-79-local-access-closure-${intersectionIndex}-${direction}`, kind: "barrier", label: "West 79th Street local access closure", x: endpoint[0], z: endpoint[1], halfX: 5.45, halfZ: .78, yaw: avenueYaw });
    }
  });
  // The trip now begins on actual Bronx surface streets: each controlled
  // intersection has a full cross street, curb returns and lane markings
  // before the expressway ramp. No traffic signals are authored on the river
  // highway itself.
  for (const [index, progress] of [150, 335, 565].entries()) {
    const frame = routeFrame(progress), cross = new THREE.Group(); cross.name = `bronx-surface-street-intersection-${index + 1}`;
    const road = new THREE.Mesh(new RoundedBoxGeometry(14.8, .16, 86, 3, .04), asphalt); road.name = "bronx-driveable-cross-street"; road.position.copy(frame.center); road.position.y -= .07; road.rotation.y = frame.yaw + Math.PI / 2; cross.add(road);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new RoundedBoxGeometry(4.5, .26, 86, 3, .05), concrete); walk.name = "bronx-cross-street-sidewalk-with-curb-return"; walk.position.copy(frame.center).addScaledVector(frame.tangent, side * 9.65); walk.position.y += .06; walk.rotation.y = frame.yaw + Math.PI / 2; cross.add(walk);
    }
    for (const offset of [-LANE_WIDTH * .5, LANE_WIDTH * .5]) {
      const marking = new THREE.Mesh(new RoundedBoxGeometry(.09, .025, 70, 2, .01), lane); marking.position.copy(frame.center).addScaledVector(frame.tangent, offset); marking.position.y += .12; marking.rotation.y = frame.yaw + Math.PI / 2; cross.add(marking);
    }
    root.add(cross);
  }
  addOsmRoadSurfaces(root, asphalt, concrete, lane);
  const signalMetal = new THREE.MeshStandardMaterial({ color: "#26302f", metalness: .7, roughness: .35 });
  const signalHousing = new THREE.MeshStandardMaterial({ color: "#151b19", metalness: .42, roughness: .48 });
  for (const stop of SIGNAL_STOPS) {
    const frame = routeFrame(stop);
    const crossing = new THREE.Group(); crossing.name = "new-york-signalized-crosswalk";
    // NYC ladder crossing: two full-width boundary lines and separated bars
    // across the pedestrian path. The old longitudinal comb collapsed into a
    // single white slab at driving distance.
    for (const longitudinal of [-2.4, 2.4]) {
      const boundary = new THREE.Mesh(new RoundedBoxGeometry(19.2, .026, .2, 2, .012), lane);
      boundary.name = "nyc-crosswalk-full-width-boundary-line";
      boundary.position.copy(frame.center).addScaledVector(frame.tangent, longitudinal);
      boundary.position.y += .132; boundary.rotation.y = frame.yaw; crossing.add(boundary);
    }
    for (let stripe = -3; stripe <= 3; stripe++) {
      const mark = new THREE.Mesh(new RoundedBoxGeometry(18.4, .024, .34, 2, .012), lane);
      mark.name = "nyc-crosswalk-separated-ladder-bar";
      mark.position.copy(frame.center).addScaledVector(frame.tangent, stripe * .62);
      mark.position.y += .134; mark.rotation.y = frame.yaw; crossing.add(mark);
    }
    const lenses = {
      RED: signalLensMaterial("RED"),
      YELLOW: signalLensMaterial("YELLOW"),
      GREEN: signalLensMaterial("GREEN"),
    } satisfies Record<TrafficSignalAspect, THREE.MeshStandardMaterial>;
    // Signals belong on the near side of the intersection. The crosswalk stays
    // centered on the junction while the mast arms and stop logic sit twelve
    // metres upstream in the shuttle's direction of travel.
    const signalAnchor = frame.center.clone().addScaledVector(frame.tangent, -12);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .11, 5.2, 10), signalMetal);
      pole.name = "nyc-near-side-before-intersection-signal-pole"; pole.position.copy(signalAnchor).addScaledVector(frame.right, side * 10.25); pole.position.y += 2.6; crossing.add(pole);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, 4.7, 9), signalMetal);
      arm.position.copy(pole.position).addScaledVector(frame.right, -side * 2.25).add(new THREE.Vector3(0, 2.25, 0)); arm.rotation.z = Math.PI / 2; crossing.add(arm);
      const housing = new THREE.Mesh(new RoundedBoxGeometry(.46, 1.18, .34, 4, .045), signalHousing);
      housing.position.copy(arm.position).addScaledVector(frame.right, -side * 2.15).add(new THREE.Vector3(0, -.42, 0)); housing.rotation.y = frame.yaw; crossing.add(housing);
      (["RED", "YELLOW", "GREEN"] as const).forEach((aspect, lensIndex) => {
        const light = new THREE.Mesh(new THREE.CircleGeometry(.19, 24), lenses[aspect]);
        light.name = `nyc-traffic-signal-${aspect.toLowerCase()}-lens`;
        light.position.copy(housing.position).add(new THREE.Vector3(0, .34 - lensIndex * .34, 0)).addScaledVector(frame.tangent, -.181);
        light.rotation.set(0, frame.yaw, 0); crossing.add(light);
        const visor = new THREE.Mesh(new THREE.TorusGeometry(.2, .028, 8, 24, Math.PI), signalHousing);
        visor.name = "nyc-traffic-signal-lens-visor";
        visor.position.copy(light.position).add(new THREE.Vector3(0, .045, 0)).addScaledVector(frame.tangent, -.012);
        visor.rotation.set(0, frame.yaw, Math.PI); crossing.add(visor);
      });
    }
    signals.push({ progress: stop, lenses });
    root.add(crossing);
  }
  const windows = windowTexture(); windows.wrapS = windows.wrapT = THREE.RepeatWrapping; windows.repeat.set(1, 2.25); ownedTextures.push(windows);
  const buildingMaterials = ["#a99583", "#93877b", "#817d78", "#b39d85", "#77716c"].map(color => new THREE.MeshStandardMaterial({ color, map: windows, emissive: "#493b2a", emissiveIntensity: .08, roughness: .84 }));
  const corniceMaterials = ["#aaa08d", "#6f675e"].map(color => new THREE.MeshStandardMaterial({ color, roughness: .85 }));
  const baseMaterials = ["#403f3b", "#6f6458", "#514b45"].map(color => new THREE.MeshStandardMaterial({ color, map: textures.stone, bumpMap: textures.stone, bumpScale: .025, roughness: .9 }));
  const storefrontMaterials = ["#7fa2a7", "#b49065", "#648b84", "#8e6b82"].map(color => new THREE.MeshPhysicalMaterial({ color, roughness: .2, transmission: .12, transparent: true, opacity: .82, metalness: .06 }));
  const fireEscapeMaterial = new THREE.MeshStandardMaterial({ color: "#242a29", roughness: .56, metalness: .68 });
  // The first nine hundred metres need a close, continuous street edge at
  // driving speed. Two-sided infill closes the large procedural gaps while
  // preserving the three real cross-street openings and their sight lines.
  const bronxInfillStep = quality < .58 ? 21 : quality < .82 ? 17 : 13.5;
  let bronxInfillIndex = 0;
  for (let progress = 8; progress < HIGHWAY_START - 8; progress += bronxInfillStep) {
    if ([150, 335, 565].some(intersection => Math.abs(progress - intersection) < 15)) continue;
    const frame = routeFrame(progress), depth = bronxInfillStep + 1.35;
    for (const side of [-1, 1]) {
      const index = bronxInfillIndex++, width = 8.4 + index % 4 * 1.15, height = 10.5 + index % 7 * 2.35;
      const building = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, .12), buildingMaterials[(index + 1) % buildingMaterials.length]);
      building.name = "bronx-continuous-streetwall-infill";
      building.position.copy(frame.center).addScaledVector(frame.right, side * (16.35 + width * .5)); building.position.y = height * .5 - .04; building.rotation.y = frame.yaw; root.add(building);
      const base = new THREE.Mesh(new RoundedBoxGeometry(width + .08, 2.65, depth + .18, 3, .055), baseMaterials[index % baseMaterials.length]);
      base.name = "bronx-articulated-ground-floor-streetwall"; base.position.copy(building.position); base.position.y = 1.32; base.rotation.y = frame.yaw; root.add(base);
      const cornice = new THREE.Mesh(new RoundedBoxGeometry(width + .42, .34, depth + .42, 3, .04), corniceMaterials[index % corniceMaterials.length]);
      cornice.name = "bronx-continuous-block-cornice"; cornice.position.copy(building.position); cornice.position.y = height + .12; cornice.rotation.y = frame.yaw; root.add(cornice);
      if (index % 3 === 0) {
        const storefront = new THREE.Mesh(new RoundedBoxGeometry(.14, 1.95, depth * .7, 4, .03), storefrontMaterials[index % storefrontMaterials.length]);
        storefront.name = "bronx-local-storefront-glazing-and-awning";
        storefront.position.copy(building.position).addScaledVector(frame.right, -side * (width * .5 + .1)); storefront.position.y = 1.22; storefront.rotation.y = frame.yaw; root.add(storefront);
      }
    }
  }
  const buildingCount = quality < .58 ? 82 : quality < .82 ? 124 : 168;
  for (let index = 0; index < buildingCount; index++) {
    const progress = 18 + index / Math.max(1, buildingCount - 1) * (CITY_BUS_ROUTE_LENGTH - 36), frame = routeFrame(progress), side = index % 2 ? 1 : -1, groundY = frame.center.y;
    const onRiverHighway = progress >= HIGHWAY_START && progress < HIGHWAY_EXIT_START;
    // The OSM motorway link curls back beside the last portion of the long
    // authored approach. Ending procedural massing before that overlap keeps
    // an approach-side tower from sitting across the later ramp segment.
    if (progress >= HIGHWAY_EXIT_START - 170) continue;
    // Southbound, the Hudson is on the driver's right and the Manhattan
    // street wall is on the left. Central Park replaces the left street wall
    // after the second turn, while the museum blocks remain on the right.
    if (onRiverHighway && side === 1) continue;
    const urban = progress > 700, width = 7 + index % 5 * 2.2, depth = 7 + index % 4 * 2.6, height = urban ? 15 + index % 9 * 5.2 : 7 + index % 6 * 3.1;
    const building = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, .16), buildingMaterials[index % buildingMaterials.length]);
    building.name = urban ? "west-side-manhattan-streetwall" : "bronx-neighborhood-building";
    const cityStreet = progress >= CROSSTOWN_START, setback = cityStreet ? 12.3 : 17;
    building.position.copy(frame.center).addScaledVector(frame.right, side * (setback + depth * .5 + index % 3 * (cityStreet ? .8 : 2.5))); building.position.y += height * .5 - .05; building.rotation.y = frame.yaw; root.add(building);
    if (urban || index % 3 === 0) {
      const cornice = new THREE.Mesh(new RoundedBoxGeometry(width + .45, .34, depth + .45, 3, .045), corniceMaterials[index % 2]);
      cornice.name = "new-york-masonry-cornice"; cornice.position.copy(building.position); cornice.position.y += height * .5 + .12; cornice.rotation.y = frame.yaw; root.add(cornice);
    }
    const groundFloor = new THREE.Mesh(new RoundedBoxGeometry(.24, 2.75, depth * .94, 4, .045), baseMaterials[index % baseMaterials.length]);
    groundFloor.name = "new-york-articulated-streetwall-base";
    groundFloor.position.copy(building.position).addScaledVector(frame.right, -side * (width * .5 + .03)); groundFloor.position.y = groundY + 1.37; groundFloor.rotation.y = frame.yaw; root.add(groundFloor);
    if (urban && index % 2 === 0) {
      const storefront = new THREE.Mesh(new RoundedBoxGeometry(.16, 2.18, depth * .72, 4, .035), storefrontMaterials[index % storefrontMaterials.length]);
      storefront.name = "upper-west-side-ground-floor-storefront";
      storefront.position.copy(building.position).addScaledVector(frame.right, -side * (width * .5 + .16)); storefront.position.y = groundY + 1.28; storefront.rotation.y = frame.yaw; root.add(storefront);
    }
    if (urban && index % 4 === 0) {
      for (const y of [5.1, 8.6, 12.1].filter(value => value < height - 1.4)) {
        const landing = new THREE.Mesh(new RoundedBoxGeometry(.62, .08, depth * .48, 2, .018), fireEscapeMaterial);
        landing.name = "upper-west-side-fire-escape-landing";
        landing.position.copy(building.position).addScaledVector(frame.right, -side * (width * .5 + .36)); landing.position.y = groundY + y; landing.rotation.y = frame.yaw; root.add(landing);
        for (const along of [-.22, .22]) {
          const rail = new THREE.Mesh(new RoundedBoxGeometry(.035, .82, depth * .48, 2, .01), fireEscapeMaterial);
          rail.position.copy(landing.position).addScaledVector(frame.right, -side * along); rail.position.y += .42; rail.rotation.y = frame.yaw; root.add(rail);
        }
      }
    }
    if (index % 7 === 0) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 2.1, 14), new THREE.MeshStandardMaterial({ color: "#4e3c2d", roughness: .93 })); tank.position.copy(building.position); tank.position.y += height * .5 + 1.15; root.add(tank);
    }
  }
  // Follow the curving carriageway with short contiguous podium sections and
  // deliberately stop them before the exit gore. The former single 1.7 km
  // OBB stayed straight while the road blended into OSM and physically sealed
  // the signed W 79th Street ramp.
  const highwayStreetwallEnd = HIGHWAY_EXIT_START - 138;
  const podiumGroup = new THREE.Group(); podiumGroup.name = "west-side-highway-continuous-manhattan-streetwall-podium";
  for (let progress = HIGHWAY_START; progress < highwayStreetwallEnd;) {
    const visualStep = progress < HIGHWAY_OSM_BLEND_START ? 22 : 8;
    const next = Math.min(highwayStreetwallEnd, progress + visualStep), a = routeCenter(progress), b = routeCenter(next), frame = routeFrame((progress + next) * .5), length = a.distanceTo(b);
    const podium = new THREE.Mesh(new RoundedBoxGeometry(9.5, 5.2, length + .8, 4, .08), baseMaterials[1]);
    podium.name = "west-side-highway-following-streetwall-podium-section";
    podium.position.copy(a).add(b).multiplyScalar(.5).addScaledVector(frame.right, -15.9); podium.position.y = 2.5; podium.rotation.y = frame.yaw; podiumGroup.add(podium);
    progress = next;
  }
  root.add(podiumGroup);
  // Varied setbacks, roof plant and water towers carry the left-side building
  // canyon into the OSM district without placing massing in the exit corridor.
  const highwayBlockCount = Math.ceil((highwayStreetwallEnd - HIGHWAY_START) / 24);
  for (let index = 0; index < highwayBlockCount; index++) {
    const progress = Math.min(highwayStreetwallEnd - 2, HIGHWAY_START + 12 + index * 24), frame = routeFrame(progress), foregroundHeight = 24 + index % 8 * 5.4;
    const foreground = new THREE.Mesh(new RoundedBoxGeometry(18 + index % 3 * 3.2, foregroundHeight, 25.2, 4, .16), buildingMaterials[(index + 2) % buildingMaterials.length]);
    foreground.name = "dense-west-side-highway-riverfront-building"; foreground.position.copy(frame.center).addScaledVector(frame.right, -25.2 - index % 3 * 1.8); foreground.position.y = foregroundHeight * .5; foreground.rotation.y = frame.yaw; root.add(foreground);
    const cornice = new THREE.Mesh(new RoundedBoxGeometry(18.5 + index % 3 * 3.2, .42, 25.6, 3, .045), corniceMaterials[index % corniceMaterials.length]);
    cornice.position.copy(foreground.position); cornice.position.y += foregroundHeight * .5 + .12; cornice.rotation.y = frame.yaw; root.add(cornice);
    if (index % 2 === 0) {
      const towerHeight = 35 + index % 6 * 8.5;
      const tower = new THREE.Mesh(new RoundedBoxGeometry(23 + index % 4 * 3, towerHeight, 27, 4, .18), buildingMaterials[(index + 4) % buildingMaterials.length]);
      tower.name = "west-side-highway-layered-background-skyline-tower"; tower.position.copy(frame.center).addScaledVector(frame.right, -58 - index % 4 * 8).addScaledVector(frame.tangent, 5); tower.position.y = towerHeight * .5; tower.rotation.y = frame.yaw; root.add(tower);
      if (index % 6 === 0) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.65, 2.4, 14), new THREE.MeshStandardMaterial({ color: "#4b392b", roughness: .94 }));
        tank.name = "west-side-highway-rooftop-water-tank"; tank.position.set(tower.position.x, towerHeight + 1.3, tower.position.z); root.add(tank);
      }
    }
  }
  const highwayLampMaterial = new THREE.MeshStandardMaterial({ color: "#26302f", metalness: .68, roughness: .36 });
  const highwayLampGlow = new THREE.MeshStandardMaterial({ color: "#f7e6b0", emissive: "#ffd279", emissiveIntensity: 1.7, roughness: .22 });
  for (let progress = HIGHWAY_START + 26; progress < HIGHWAY_EXIT_START; progress += 48) {
    const frame = routeFrame(progress);
    for (const offset of [-10.9, 14.8]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.055, .09, 6.4, 9), highwayLampMaterial); pole.name = "west-side-highway-roadway-light-not-traffic-signal"; pole.position.copy(frame.center).addScaledVector(frame.right, offset); pole.position.y = 3.2; root.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), highwayLampGlow); lamp.position.copy(pole.position); lamp.position.y = 6.42; root.add(lamp);
    }
  }
  addOsmBuildingsAndClosures(root, quality, textures, ownedTextures, buildingMaterials, corniceMaterials, baseMaterials, collisionIndex);
  for (const leg of ROUTE_LEGS) {
    const progress = leg.from + 18, frame = routeFrame(progress), texture = signTexture(leg.name.toUpperCase(), leg.detail.toUpperCase()); ownedTextures.push(texture);
    const gantry = new THREE.Group(); gantry.name = "nyc-route-wayfinding-" + leg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const beam = new THREE.Mesh(new RoundedBoxGeometry(20, .24, .24, 3, .04), concrete); beam.position.y = 5.8; gantry.add(beam);
    for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 5.8, 10), concrete); post.position.set(side * 9.2, 2.9, 0); gantry.add(post); }
    const sign = new THREE.Mesh(new RoundedBoxGeometry(7.6, 2.25, .16, 4, .04), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); sign.position.set(0, 4.55, -.18); gantry.add(sign);
    gantry.position.copy(frame.center); gantry.rotation.y = frame.yaw; root.add(gantry);
  }

  const exitFrame = routeFrame(HIGHWAY_EXIT_START - 112), exitTexture = signTexture("AMERICAN MUSEUM OF NATURAL HISTORY", "EXIT W 79 ST · KEEP LEFT · EXIT HERE");
  ownedTextures.push(exitTexture);
  const exitGantry = new THREE.Group(); exitGantry.name = "high-visibility-amnh-west-side-highway-exit-gantry";
  const exitBeam = new THREE.Mesh(new RoundedBoxGeometry(20.5, .28, .28, 3, .045), concrete); exitBeam.position.y = 6.45; exitGantry.add(exitBeam);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, 6.45, 12), concrete); post.position.set(side * 9.45, 3.22, 0); exitGantry.add(post);
  }
  const exitSign = new THREE.Mesh(new RoundedBoxGeometry(12.8, 3.15, .2, 5, .05), new THREE.MeshBasicMaterial({ map: exitTexture, toneMapped: false }));
  exitSign.name = "exit-here-for-american-museum-of-natural-history-sign"; exitSign.position.set(-2.1, 5.05, -.2); exitGantry.add(exitSign);
  exitGantry.position.copy(exitFrame.center); exitGantry.rotation.y = exitFrame.yaw; root.add(exitGantry);

  const hudsonWaterMaterial = new THREE.MeshPhysicalMaterial({ color: "#446d79", normalMap: textures.waterNormal, normalScale: new THREE.Vector2(.32, .32), roughness: .2, metalness: .04, clearcoat: .72 });
  const greenwayStripeMaterial = new THREE.MeshStandardMaterial({ color: "#d6c85f", roughness: .72 });
  const highwayEdgeSegments: Array<{ start: THREE.Vector3; end: THREE.Vector3; halfWidth: number; source: "authored" | "osm" }> = [];
  for (let progress = HIGHWAY_START; progress < HIGHWAY_EXIT_START;) {
    const visualStep = progress < HIGHWAY_OSM_BLEND_START ? 30 : 8;
    const next = Math.min(HIGHWAY_EXIT_START, progress + visualStep);
    highwayEdgeSegments.push({ start: routeCenter(progress), end: routeCenter(next), halfWidth: 10.75, source: "authored" });
    progress = next;
  }
  // Continue the same river edge along the real southbound OSM carriageway.
  // This is the path the shuttle occupies after deliberately skipping W 79th.
  for (const road of NYC_OSM_ROADS.filter(road => /Henry Hudson Parkway|West Side Highway/.test(road.name) && road.oneWay && road.end[1] < road.start[1] && road.end[1] < HIGHWAY_EXIT_JUNCTION[1])) {
    highwayEdgeSegments.push({ start: new THREE.Vector3(road.start[0], .4, road.start[1]), end: new THREE.Vector3(road.end[0], .4, road.end[1]), halfWidth: road.halfWidth, source: "osm" });
  }
  highwayEdgeSegments.forEach((segment, index) => {
    const tangent = segment.end.clone().sub(segment.start).setY(0), length = tangent.length();
    if (length < .05) return;
    tangent.multiplyScalar(1 / length);
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x), yaw = Math.atan2(-tangent.x, -tangent.z), center = segment.start.clone().add(segment.end).multiplyScalar(.5);
    const barrier = new THREE.Mesh(new RoundedBoxGeometry(.52, .72, length + .5, 3, .09), concrete);
    barrier.name = segment.source === "osm" ? "west-side-highway-osm-continuation-hudson-safety-barrier" : "west-side-highway-hudson-safety-barrier";
    barrier.position.copy(center).addScaledVector(right, segment.halfWidth + .42); barrier.position.y = .34; barrier.rotation.y = yaw; root.add(barrier);
    const greenway = new THREE.Mesh(new RoundedBoxGeometry(8.6, .3, length + .6, 3, .05), concrete);
    greenway.name = segment.source === "osm" ? "hudson-river-greenway-mapped-highway-continuation" : "hudson-river-greenway-and-seawall";
    greenway.position.copy(center).addScaledVector(right, segment.halfWidth + 5.05); greenway.position.y = .12; greenway.rotation.y = yaw; root.add(greenway);
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(.12, .035, length + .25, 2, .012), greenwayStripeMaterial);
    stripe.name = "hudson-river-greenway-center-stripe"; stripe.position.copy(greenway.position); stripe.position.y = .3; stripe.rotation.y = yaw; root.add(stripe);
    const water = new THREE.Mesh(new RoundedBoxGeometry(130, .035, length + 1.5, 2, .01), hudsonWaterMaterial);
    water.name = "hudson-river-route-following-surface";
    water.position.copy(center).addScaledVector(right, segment.halfWidth + 74.35); water.position.y = .015; water.rotation.y = yaw; root.add(water);
    if (segment.source === "osm" && index % 3 === 0) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.055, .09, 6.4, 9), highwayLampMaterial); pole.name = "west-side-highway-continuation-roadway-light"; pole.position.copy(center).addScaledVector(right, segment.halfWidth + .9); pole.position.y = 3.2; root.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), highwayLampGlow); lamp.position.copy(pole.position); lamp.position.y = 6.42; root.add(lamp);
    }
  });
  const boatMaterials = ["#ece7d8", "#b74b39", "#315c70"].map(color => new THREE.MeshPhysicalMaterial({ color, roughness: .52, clearcoat: .3 }));
  for (let index = 0; index < 7; index++) {
    const boat = new THREE.Group(); boat.name = `hudson-river-detailed-commuter-and-sail-boat-${index + 1}`;
    const hull = new THREE.Mesh(new RoundedBoxGeometry(2.2 + index % 3, .45, 5.6 + index % 2 * 1.7, 8, .18), boatMaterials[index % boatMaterials.length]); hull.position.y = .28; boat.add(hull);
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.35, .72, 1.8, 6, .12), new THREE.MeshPhysicalMaterial({ color: "#c9d8d8", roughness: .14, transmission: .16, transparent: true, opacity: .82 })); cabin.position.set(0, .82, .35); boat.add(cabin);
    if (index % 2 === 1) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 4.2, 9), new THREE.MeshStandardMaterial({ color: "#d9d4c6", roughness: .48, metalness: .25 })); mast.position.set(0, 2.4, -.3); boat.add(mast);
      const sailGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, .35, 0), new THREE.Vector3(0, 3.9, 0), new THREE.Vector3(1.65, .55, 0)]);
      sailGeometry.setIndex([0, 1, 2]); sailGeometry.computeVertexNormals();
      const sail = new THREE.Mesh(sailGeometry, boatMaterials[0]); sail.position.set(.05, .35, -.3); boat.add(sail);
    }
    boat.position.set(45 + index % 3 * 23, .02, -(HIGHWAY_START + 70 + index * 92)); boat.rotation.y = index % 2 ? Math.PI : 0; root.add(boat);
  }

  // Zebra-striped crossings make the orthogonal grid intersections legible at
  // speed and visually separate the ramp, crosstown street and avenue.
  for (const progress of MANHATTAN_GRID_INTERSECTIONS) {
    const frame = routeFrame(progress);
    for (let stripeIndex = -5; stripeIndex <= 5; stripeIndex++) {
      const stripe = new THREE.Mesh(new RoundedBoxGeometry(1.12, .025, 4.3, 2, .01), lane);
      stripe.name = "upper-west-side-zebra-crosswalk-stripe";
      stripe.position.copy(frame.center).addScaledVector(frame.right, stripeIndex * 1.72); stripe.position.y += .105; stripe.rotation.y = frame.yaw; root.add(stripe);
    }
  }

  const streetscapeCount = quality < .58 ? 34 : quality < .82 ? 52 : 76;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.13, .2, 3.5, quality > .75 ? 10 : 7), new THREE.MeshStandardMaterial({ map: textures.bark, color: "#70543c", roughness: .96 }), streetscapeCount);
  trunk.name = "upper-west-side-street-tree-trunks";
  const crown = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.4, 4.8), new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .24, color: "#57784b", roughness: .9, side: THREE.DoubleSide }), streetscapeCount * 2);
  crown.name = "upper-west-side-layered-street-tree-crowns";
  const lampPost = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .085, 4.8, 8), new THREE.MeshStandardMaterial({ color: "#26302f", metalness: .66, roughness: .38 }), streetscapeCount);
  lampPost.name = "new-york-street-light-posts";
  const lampGlow = new THREE.InstancedMesh(new THREE.SphereGeometry(.18, 12, 8), new THREE.MeshStandardMaterial({ color: "#f4e6b0", emissive: "#ffd077", emissiveIntensity: 1.45, roughness: .24 }), streetscapeCount);
  lampGlow.name = "new-york-street-light-globes";
  const dummy = new THREE.Object3D();
  for (let index = 0; index < streetscapeCount; index++) {
    const progress = 16 + index / Math.max(1, streetscapeCount - 1) * (CITY_BUS_ROUTE_LENGTH - 32);
    const frame = routeFrame(progress), side = index % 2 ? 1 : -1;
    const base = frame.center.clone().addScaledVector(frame.right, side * 13.45);
    dummy.position.copy(base).add(new THREE.Vector3(0, 1.75, 0));
    dummy.rotation.set(0, frame.yaw + index * .37, 0);
    dummy.scale.setScalar(.82 + index % 4 * .08);
    dummy.updateMatrix();
    trunk.setMatrixAt(index, dummy.matrix);
    for (let card = 0; card < 2; card++) {
      dummy.position.copy(base).add(new THREE.Vector3(0, 4.45, 0));
      dummy.rotation.set(0, frame.yaw + card * Math.PI / 2 + index * .21, 0);
      dummy.scale.setScalar(.82 + index % 4 * .08);
      dummy.updateMatrix();
      crown.setMatrixAt(index * 2 + card, dummy.matrix);
    }
    const lampBase = frame.center.clone().addScaledVector(frame.right, -side * 14.25).addScaledVector(frame.tangent, 4.5);
    dummy.position.copy(lampBase).add(new THREE.Vector3(0, 2.4, 0)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); lampPost.setMatrixAt(index, dummy.matrix);
    dummy.position.copy(lampBase).add(new THREE.Vector3(0, 4.82, 0)); dummy.updateMatrix(); lampGlow.setMatrixAt(index, dummy.matrix);
  }
  for (const instanced of [trunk, crown, lampPost, lampGlow]) instanced.instanceMatrix.needsUpdate = true;
  trunk.castShadow = quality > .72; crown.castShadow = quality > .82; trunk.receiveShadow = lampPost.receiveShadow = true;
  root.add(trunk, crown, lampPost, lampGlow);
}

function addMuseumArrivalCampus(root: THREE.Group, ownedTextures: THREE.Texture[], textures: GameTextures) {
  const frame = routeFrame(CITY_BUS_ROUTE_LENGTH);
  const arrival = new THREE.Group();
  arrival.name = "amnh-visible-city-route-arrival-campus";
  arrival.position.copy(frame.center);
  arrival.rotation.y = frame.yaw;
  const asphalt = new THREE.MeshStandardMaterial({ color: "#4f5354", roughness: .96, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .012 });
  const limestone = new THREE.MeshStandardMaterial({ color: "#c8c0ae", roughness: .84, map: textures.stone, bumpMap: textures.stone, bumpScale: .022 });
  const redStone = new THREE.MeshStandardMaterial({ color: "#765047", roughness: .88, map: textures.stone });
  const bronze = new THREE.MeshStandardMaterial({ color: "#2f3431", roughness: .34, metalness: .72 });
  const warmDark = new THREE.MeshStandardMaterial({ color: "#181c1b", emissive: "#70562d", emissiveIntensity: .3, roughness: .76 });

  // Continue the asphalt beyond the playable stop so the route resolves into
  // a real bus bay instead of ending against fog/clear color like a white wall.
  const apron = new THREE.Mesh(new RoundedBoxGeometry(21.5, .18, 240, 4, .05), asphalt);
  apron.name = "central-park-west-amnh-arrival-asphalt-continuation";
  apron.position.set(0, -.08, -110); arrival.add(apron);
  const baySurface = new THREE.Mesh(new RoundedBoxGeometry(4.6, .035, 25, 3, .015), new THREE.MeshStandardMaterial({ color: "#424748", roughness: .96 }));
  baySurface.name = "amnh-museum-shuttle-signed-curb-bay"; baySurface.position.set(6.8, .032, -10); arrival.add(baySurface);
  const bayStripeMaterial = new THREE.MeshStandardMaterial({ color: "#e4bd25", emissive: "#4f3b04", emissiveIntensity: .08, roughness: .72 });
  for (const x of [4.65, 8.95]) {
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(.12, .045, 24.6, 2, .012), bayStripeMaterial);
    stripe.name = "amnh-shuttle-bay-yellow-perimeter-line"; stripe.position.set(x, .065, -10); arrival.add(stripe);
  }
  for (const z of [-22.2, 2.2]) {
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(4.4, .045, .12, 2, .012), bayStripeMaterial);
    stripe.name = "amnh-shuttle-bay-yellow-perimeter-line"; stripe.position.set(6.8, .065, z); arrival.add(stripe);
  }
  const crossStreet = new THREE.Mesh(new RoundedBoxGeometry(112, .16, 17, 4, .045), asphalt);
  crossStreet.name = "west-77th-street-visible-cross-street-at-route-end"; crossStreet.position.set(0, -.07, -38); arrival.add(crossStreet);
  for (const side of [-1, 1]) {
    const sidewalk = new THREE.Mesh(new RoundedBoxGeometry(5.6, .3, 238, 4, .06), limestone);
    sidewalk.position.set(side * 13.25, .08, -110); arrival.add(sidewalk);
  }
  const parkExtension = new THREE.Mesh(new RoundedBoxGeometry(68, .12, 238, 4, .05), new THREE.MeshStandardMaterial({ color: "#42613b", map: textures.ground, roughness: 1 }));
  parkExtension.name = "central-park-landscape-continuing-beyond-amnh-bus-stop"; parkExtension.position.set(-48, -.02, -110); arrival.add(parkExtension);
  const parkBark = new THREE.MeshStandardMaterial({ color: "#66503b", map: textures.bark, roughness: .98 });
  const parkLeaf = new THREE.MeshStandardMaterial({ color: "#476b41", map: textures.foliage, roughness: .94 });
  for (let index = 0; index < 32; index++) {
    const tree = new THREE.Group(); tree.name = `central-park-visible-arrival-tree-${index + 1}`;
    tree.position.set(-22 - index % 5 * 11.5, 0, 7 - Math.floor(index / 5) * 29 - index % 2 * 5);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.25, .38, 6 + index % 3, 10), parkBark); trunk.position.y = 3; tree.add(trunk);
    for (const [x, y, z, scale] of [[0, 7, 0, 1.15], [-2, 6.6, .4, .78], [1.8, 7.15, -.5, .88]] as const) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3.5, 2), parkLeaf); crown.position.set(x, y, z); crown.scale.set(scale, scale * .78, scale); tree.add(crown);
    }
    arrival.add(tree);
  }

  // Carry the avenue beyond the playable bay with lower-detail, full-volume
  // neighborhood blocks. They close the destination horizon without adding
  // another streamed gameplay district or expensive character simulation.
  for (let block = 0; block < 4; block++) {
    const height = 22 + block % 3 * 7, depth = 34 + block % 2 * 8;
    const building = new THREE.Mesh(new RoundedBoxGeometry(26 + block % 2 * 7, height, depth, 4, .18), block % 2 ? redStone : limestone);
    building.name = "central-park-west-post-museum-horizon-building"; building.position.set(29 + block % 2 * 4, height * .5, -58 - block * 48); arrival.add(building);
    const roofline = new THREE.Mesh(new RoundedBoxGeometry(27 + block % 2 * 7, .45, depth + .6, 3, .055), bronze); roofline.position.copy(building.position); roofline.position.y += height * .5 + .08; arrival.add(roofline);
    for (let floor = 0; floor < 3; floor++) for (let bay = 0; bay < 3; bay++) {
      const window = new THREE.Mesh(new RoundedBoxGeometry(.12, 2.65, 3.8, 4, .04), warmDark); window.name = "central-park-west-post-museum-recessed-window"; window.position.set(15.85, 4.1 + floor * 4.4, building.position.z - 9 + bay * 8.5); arrival.add(window);
    }
  }
  for (let lampIndex = 0; lampIndex < 7; lampIndex++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .085, 4.8, 9), bronze); post.position.set(12.6, 2.4, -42 - lampIndex * 27); arrival.add(post);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 8), new THREE.MeshStandardMaterial({ color: "#f4e6b0", emissive: "#ffd077", emissiveIntensity: 1.45, roughness: .24 })); glow.position.copy(post.position).add(new THREE.Vector3(0, 2.42, 0)); arrival.add(glow);
  }

  // The museum now sits on the curb side of Central Park West. It is no longer
  // a wall directly across the roadway, so the drive resolves as a real avenue
  // with parkland on one side and the AMNH frontage on the other.
  const facade = new THREE.Group(); facade.name = "amnh-route-end-grounded-preview-facade"; facade.position.set(24, 0, -10); facade.rotation.y = -Math.PI / 2;
  const center = new THREE.Mesh(new RoundedBoxGeometry(42, 18, 7, 6, .18), limestone); center.position.y = 9; facade.add(center);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new RoundedBoxGeometry(17, 14, 8.5, 5, .18), redStone); wing.position.set(side * 28, 7, .4); facade.add(wing);
    const annex = new THREE.Mesh(new RoundedBoxGeometry(28, 18, 9.5, 5, .18), redStone);
    annex.name = "amnh-route-end-continuous-masonry-annex"; annex.position.set(side * 49.5, 9, .2); facade.add(annex);
    for (let bayIndex = 0; bayIndex < 4; bayIndex++) for (let floorIndex = 0; floorIndex < 2; floorIndex++) {
      const window = new THREE.Mesh(new RoundedBoxGeometry(3.8, 4.1, .12, 5, .06), warmDark);
      window.name = "amnh-route-end-annex-recessed-window";
      window.position.set(side * (39.5 + bayIndex * 6.5), 5.1 + floorIndex * 5.3, 4.98);
      facade.add(window);
    }
  }
  const porticoFloor = new THREE.Mesh(new RoundedBoxGeometry(28, .6, 7.5, 4, .08), limestone); porticoFloor.position.set(0, .3, 4.2); facade.add(porticoFloor);
  for (const x of [-10.5, -7, -3.5, 3.5, 7, 10.5]) {
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.45, .48, 1.45, 4, .06), limestone); base.position.set(x, .84, 4.25); facade.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(.48, .58, 10.5, 22), limestone); column.position.set(x, 6.32, 4.25); facade.add(column);
    const capital = new THREE.Mesh(new RoundedBoxGeometry(1.55, .48, 1.55, 4, .06), limestone); capital.position.set(x, 11.8, 4.25); facade.add(capital);
  }
  for (const x of [-6, 0, 6]) {
    const portal = new THREE.Mesh(new RoundedBoxGeometry(4.7, 7.4, .18, 6, .08), warmDark); portal.position.set(x, 4.25, 3.58); facade.add(portal);
  }
  const arrivalTexture = signTexture("AMERICAN MUSEUM OF NATURAL HISTORY", "CENTRAL PARK WEST · SHUTTLE ARRIVAL");
  ownedTextures.push(arrivalTexture);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(23, 2.25, .18, 4, .05), new THREE.MeshBasicMaterial({ map: arrivalTexture, toneMapped: false }));
  sign.position.set(0, 14.4, 3.62); facade.add(sign);
  for (const x of [-13.8, 13.8]) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(.32, 18, 12), new THREE.MeshStandardMaterial({ color: "#ffe4a2", emissive: "#ffc65a", emissiveIntensity: 2.8, roughness: .18 }));
    lantern.position.set(x, 4.2, 4.45); facade.add(lantern);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .08, 3.4, 10), bronze); post.position.set(x, 2.4, 4.45); facade.add(post);
  }
  arrival.add(facade); root.add(arrival);
}

export class CityBusWorld {
  readonly root = new THREE.Group();
  readonly arrivalTarget = AMNH_BUS_BAY.clone();
  readonly routeMilestones = ROUTE_LEGS;
  private readonly bus: BuiltBus;
  private readonly traffic: TrafficVehicle[] = [];
  private readonly localTraffic: LocalTrafficVehicle[] = [];
  private readonly signals: TrafficSignal[] = [];
  private readonly pedestrians: AmbientHumanAgent[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly sun: THREE.DirectionalLight;
  private readonly roadNetwork = new CityRoadNetwork(DRIVE_ROADS);
  private readonly primaryRoadNetwork = new CityRoadNetwork(PRIMARY_DRIVE_ROADS);
  private readonly staticCollisionIndex = new StaticCollisionIndex();
  private readonly collisionCooldowns = new Map<string, number>();
  private readonly busPosition = new THREE.Vector3();
  private busHeading = 0;
  private guidance: RouteGuidance;
  private progress = 0;
  private speed = 0;
  private forwardGear = 2;
  private steerAmount = 0;
  private roadSurfaceMessage = "ON AUTHORED ROUTE";
  private guidanceRefreshAt = -Infinity;
  private initialRouteDistance = CITY_BUS_ROUTE_LENGTH;
  private completionHighWater = 0;
  private trafficMessage = "Zoo shuttle loading zone";
  private onRecommendedRoute = true;
  private damage = 0;
  private lastImpact: ShuttleImpactEvent | null = null;
  private latestImpactStatus = "none";
  private impactRoll = 0;
  private collisionArmedAt: number | null = null;
  private disposed = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1, startProgress = 0, reviewSpawn?: "missed-exit" | "uws-reroute" | "traffic-impact" | "rear-impact" | "building-impact" | "failure-impact") {
    this.root.name = "bronx-to-natural-history-museum-driving-level"; scene.add(this.root);
    this.progress = THREE.MathUtils.clamp(startProgress, 0, CITY_BUS_ROUTE_LENGTH - .5);
    const spawnFrame = routeFrame(this.progress);
    this.busPosition.copy(spawnFrame.center).addScaledVector(spawnFrame.right, -LANE_WIDTH * .5);
    this.busHeading = spawnFrame.yaw;
    if (reviewSpawn === "missed-exit") { this.busPosition.set(-76.829, .4, -2628.478); this.busHeading = -.29; this.progress = HIGHWAY_EXIT_START; }
    if (reviewSpawn === "uws-reroute") { this.busPosition.set(-169.934, .4, -2529.773); this.busHeading = -2.36; this.progress = CROSSTOWN_START + 80; }
    if (reviewSpawn === "traffic-impact" || reviewSpawn === "failure-impact") { this.progress = CITY_BUS_HIGHWAY_REVIEW_PROGRESS; this.busPosition.copy(routeFrame(this.progress).center); this.busHeading = routeFrame(this.progress).yaw; this.speed = 36; }
    if (reviewSpawn === "rear-impact") { this.progress = CITY_BUS_HIGHWAY_REVIEW_PROGRESS; this.busPosition.copy(routeFrame(this.progress).center); this.busHeading = routeFrame(this.progress).yaw; this.speed = 12; }
    if (reviewSpawn === "building-impact") { this.busPosition.set(12, .4, -CITY_BUS_HIGHWAY_REVIEW_PROGRESS); this.busHeading = Math.PI / 2; this.progress = CITY_BUS_HIGHWAY_REVIEW_PROGRESS; this.speed = 28; }
    const spawnHeading = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    this.guidance = this.roadNetwork.route(this.busPosition, AMNH_BUS_BAY, spawnHeading);
    const recommendedSpawn = this.primaryRoadNetwork.nearest(this.busPosition, spawnHeading);
    this.onRecommendedRoute = recommendedSpawn.distance < recommendedSpawn.road.halfWidth + 3;
    if (this.onRecommendedRoute && recommendedSpawn.primaryProgress !== null) this.progress = recommendedSpawn.primaryProgress;
    this.initialRouteDistance = Math.max(1, this.guidance.distance);
    this.roadSurfaceMessage = this.onRecommendedRoute ? "AUTHORED ROUTE · FREE STEERING" : "OPEN-WORLD REROUTE ACTIVE";
    addCitySky(this.root);
    addRoadNetwork(this.root, this.ownedTextures, quality, textures, this.signals, this.staticCollisionIndex);
    addMuseumArrivalCampus(this.root, this.ownedTextures, textures);
    this.bus = makeBus(quality, textures, this.ownedTextures); this.root.add(this.bus.root);
    if (reviewSpawn === "failure-impact") {
      this.damage = 97; this.bus.damageStages[0].visible = true; this.bus.damageStages[1].visible = true; this.bus.damageStages[2].visible = true;
    }
    const trafficCount = quality < .58 ? 36 : quality < .82 ? 52 : 68;
    for (let index = 0; index < trafficCount; index++) {
      const lane = TRAFFIC_LANES[index % TRAFFIC_LANES.length];
      // Seed a readable near-field pack at every review/start point. The rest
      // remains distributed across the route so traffic keeps arriving rather
      // than appearing as a one-time set piece.
      const trafficOffset = index < 12
        ? 20 + index * 17
        : 220 + (index - 12) * (CITY_BUS_ROUTE_LENGTH - 245) / Math.max(1, trafficCount - 12);
      const car = makeTrafficCar(index, quality), vehicle: TrafficVehicle = {
        root: car,
        progress: (this.progress + trafficOffset) % CITY_BUS_ROUTE_LENGTH,
        lane,
        targetLane: lane,
        speed: 28 + index % 5 * 2.4,
        cruise: 38 + index % 7 * 2.65,
        phase: index * 1.83,
        nextLaneChange: 3.8 + index % 7 * 1.32,
        collisionOffset: new THREE.Vector3(),
      };
      if ((reviewSpawn === "traffic-impact" || reviewSpawn === "failure-impact") && index === 0) {
        vehicle.progress = this.progress + 26; vehicle.lane = 0; vehicle.targetLane = 0; vehicle.speed = 0; vehicle.cruise = 0; vehicle.nextLaneChange = Infinity;
        vehicle.root.name = "qa-solid-stationary-traffic-collision-target";
      }
      if (reviewSpawn === "rear-impact" && index === 0) {
        vehicle.progress = this.progress - 5; vehicle.lane = 0; vehicle.targetLane = 0; vehicle.speed = 48; vehicle.cruise = 48; vehicle.nextLaneChange = Infinity;
        vehicle.root.name = "qa-rear-impact-integrity-protection-target";
      }
      this.traffic.push(vehicle); this.root.add(car);
    }
    const localTrafficCount = quality < .58 ? 6 : quality < .82 ? 10 : 14;
    for (let index = 0; index < localTrafficCount; index++) {
      const path = UWS_TRAFFIC_LOOPS[index % UWS_TRAFFIC_LOOPS.length], frame = closedPathFrame(path, 0);
      const vehicle: LocalTrafficVehicle = {
        root: makeTrafficCar(100 + index, quality), path,
        distance: index / Math.max(1, localTrafficCount) * frame.total + index % 3 * 17,
        speed: 22 + index % 5 * 2.1,
        laneOffset: index % 2 ? -1.8 : 1.8,
        collisionOffset: new THREE.Vector3(),
      };
      vehicle.root.name = `upper-west-side-open-world-loop-traffic-${index + 1}`;
      this.localTraffic.push(vehicle); this.root.add(vehicle.root);
    }
    const skins = ["#b77859", "#704936", "#d0a17d", "#926047", "#573c32", "#c28b6b"];
    const pedestrianCount = quality < .58 ? 6 : quality < .82 ? 10 : 14;
    for (let index = 0; index < pedestrianCount; index++) {
      const progress = 16 + index / Math.max(1, pedestrianCount - 1) * (CITY_BUS_ROUTE_LENGTH - 32), atMuseum = progress > CROSSTOWN_START, frame = routeFrame(progress), side = index % 2 ? 1 : -1;
      const result = createPremiumHuman({ role: "visitor", quality, variant: 40 + index, faceVariant: 7 + index, coat: ["#476779", "#8a5143", "#596846", "#7a668c"][index % 4], trousers: "#30363c", skin: skins[index % skins.length], outfit: index % 2 ? "knit-chinos" : "cotton-denim", accessory: index % 3 === 1 ? "tote" : "backpack", pose: "neutral" });
      result.root.name = atMuseum ? "central-park-west-pedestrian-" + index : "southern-boulevard-pedestrian-" + index;
      result.root.position.copy(frame.center).addScaledVector(frame.right, side * 13.2); result.root.position.y += .2; this.root.add(result.root); this.ownedTextures.push(...result.ownedTextures);
      this.pedestrians.push(createAmbientHumanAgent(result.root, { axis: frame.tangent, travel: 3.5 + index % 3, speed: .76 + index % 2 * .08, pauseSeconds: 2.2 + index % 3, phase: index * 2.4 }));
    }
    this.sun = new THREE.DirectionalLight("#fff0cf", 2.75); this.sun.castShadow = quality > .58; this.sun.shadow.mapSize.set(quality > .82 ? 2048 : 1024, quality > .82 ? 2048 : 1024); this.root.add(this.sun, this.sun.target);
    const ambient = new THREE.HemisphereLight("#c7dde3", "#45493c", 1.72); ambient.name = "city-evening-hemisphere-light"; this.root.add(ambient);
    if (reviewSpawn === "traffic-impact" || reviewSpawn === "rear-impact" || reviewSpawn === "building-impact" || reviewSpawn === "failure-impact") this.collisionArmedAt = 0;
    this.updateTransforms(0, 0);
  }

  get speedMetersPerSecond() { return Math.abs(this.speed); }
  get signedSpeedMetersPerSecond() { return this.speed; }
  get selectedForwardGear() { return this.forwardGear; }
  get gearDisplay() { return this.speed < -.25 ? "R" : `${this.forwardGear}`; }
  get gearTopSpeedMetersPerSecond() { return SHUTTLE_GEARS[this.forwardGear - 1].topSpeed; }
  get steeringAmount() { return this.steerAmount; }
  get integrity() { return THREE.MathUtils.clamp(1 - this.damage / SHUTTLE_MAX_DAMAGE, 0, 1); }
  get damagePercent() { return Math.round((1 - this.integrity) * 100); }
  get disabled() { return this.damage >= SHUTTLE_MAX_DAMAGE; }
  get remainingMeters() { return Math.max(0, this.guidance.distance); }
  get routeCompletion() { return this.parkingReached ? 1 : this.completionHighWater; }
  get minimapSnapshot(): ShuttleMinimapSnapshot {
    return {
      x: this.busPosition.x,
      z: this.busPosition.z,
      heading: this.busHeading,
      road: this.currentRoad,
      destinationX: AMNH_BUS_BAY.x,
      destinationZ: AMNH_BUS_BAY.z,
    };
  }
  get currentRoad() {
    // The primary-route progress is the authoritative leg label. Route search
    // can temporarily select a geometrically close connector at a wide merge,
    // which previously made the highway HUD jump back to Southern Boulevard.
    return displayRoadName(this.onRecommendedRoute ? primaryRoadName(this.progress) : this.guidance.current.road.name);
  }
  get congestionStatus() { return this.trafficMessage; }
  get routeStatus() { return this.roadSurfaceMessage; }
  get impactStatus() { return this.latestImpactStatus; }
  consumeImpactEvent() { const event = this.lastImpact; this.lastImpact = null; return event; }
  get navigationBearingDegrees() {
    const forward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading)), right = new THREE.Vector3(-forward.z, 0, forward.x);
    // On the recommended line, follow a stable route look-ahead instead of a
    // graph node selected from adjacent imported streets. This keeps the HUD
    // arrow straight after the ramp and progressively bends it into the CPW
    // turn only when that maneuver is actually approaching.
    const target = this.onRecommendedRoute
      ? routeCenter(Math.min(CITY_BUS_ROUTE_LENGTH, this.progress + (this.progress < CROSSTOWN_START ? 38 : 30)))
      : this.guidance.nextPoint;
    const direction = target.clone().sub(this.busPosition).setY(0).normalize();
    return THREE.MathUtils.radToDeg(Math.atan2(direction.dot(right), direction.dot(forward)));
  }
  get navigationInstruction() {
    const remaining = this.guidance.distance;
    if (remaining <= 45) return `BRAKE FOR MARKED MUSEUM SHUTTLE BAY · ${Math.max(0, Math.round(remaining))} M`;
    if (this.guidance.current.distance > this.guidance.current.road.halfWidth + 1.5) return `RETURN TO ${displayRoadName(this.guidance.current.road.name).toUpperCase()} · ${Math.round(this.guidance.current.distance)} M OFF ROAD`;
    const forward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const toWaypoint = this.guidance.nextPoint.clone().sub(this.busPosition).setY(0);
    const waypointDistance = toWaypoint.length();
    if (waypointDistance > .01) toWaypoint.multiplyScalar(1 / waypointDistance);
    const turn = Math.atan2(toWaypoint.dot(right), toWaypoint.dot(forward));
    const rerouting = this.onRecommendedRoute ? "" : "REROUTING · ";
    if (this.onRecommendedRoute) {
      if (this.progress >= HIGHWAY_EXIT_START - 170 && this.progress < HIGHWAY_EXIT_START) return `EXIT HERE FOR AMERICAN MUSEUM OF NATURAL HISTORY · KEEP LEFT`;
      if (this.progress < CROSSTOWN_START) return `FOLLOW THE CURVED WEST 79TH STREET EXIT · STAY IN LANE`;
      if (this.progress < CENTRAL_PARK_WEST_TURN_START) {
        const turnDistance = Math.max(0, CENTRAL_PARK_WEST_TURN_START - this.progress);
        if (turnDistance > 120) return `STAY STRAIGHT ON WEST 79TH STREET · CENTRAL PARK WEST LEFT IN ${Math.round(turnDistance)} M`;
        if (turnDistance > 65) return `LEFT TURN AHEAD · CENTRAL PARK WEST IN ${Math.round(turnDistance)} M · MOVE LEFT`;
        if (turnDistance > 22) return `BRAKE · TURN LEFT ONTO CENTRAL PARK WEST IN ${Math.round(turnDistance)} M`;
        return `TURN LEFT NOW · CENTRAL PARK WEST`;
      }
      return `CONTINUE ON CENTRAL PARK WEST · MUSEUM SHUTTLE BAY AHEAD`;
    }
    if (waypointDistance < 92 && Math.abs(turn) > .3) return `${rerouting}TURN ${turn > 0 ? "RIGHT" : "LEFT"} ONTO ${displayRoadName(this.guidance.nextRoadName).toUpperCase()}`;
    return `${rerouting}CONTINUE ON ${this.currentRoad.toUpperCase()} · NEXT ${displayRoadName(this.guidance.nextRoadName).toUpperCase()}`;
  }
  get parkingReached() { return this.busPosition.distanceTo(AMNH_BUS_BAY) < 5.2 && Math.abs(this.speed) < .6; }
  get headingYaw() { return this.busHeading; }
  get cameraPosition() {
    const forward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading)), right = new THREE.Vector3(-forward.z, 0, forward.x);
    return this.busPosition.clone().addScaledVector(right, -.72).addScaledVector(forward, 2.15).add(new THREE.Vector3(0, 2.27, 0));
  }

  getWorldGripPositions(target: SlothVehicleGripTargets) {
    this.bus.root.updateMatrixWorld(true);
    this.bus.gripAnchors[0].getWorldPosition(target.left);
    this.bus.gripAnchors[1].getWorldPosition(target.right);
    return target;
  }

  update(delta: number, elapsed: number, input: CityBusInput) {
    if (this.disposed) return;
    this.collisionArmedAt ??= elapsed + .45;
    const headingVector = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    let road = this.roadNetwork.nearest(this.busPosition, headingVector);
    if (input.shiftUp !== input.shiftDown) this.forwardGear = THREE.MathUtils.clamp(this.forwardGear + (input.shiftUp ? 1 : -1), 1, SHUTTLE_GEARS.length);
    if (elapsed >= this.guidanceRefreshAt) {
      this.guidance = this.roadNetwork.route(this.busPosition, AMNH_BUS_BAY, headingVector);
      this.completionHighWater = Math.max(this.completionHighWater, THREE.MathUtils.clamp(1 - this.guidance.distance / this.initialRouteDistance, 0, 1));
      this.guidanceRefreshAt = elapsed + .18;
    }
    const steerInput = (input.steerRight ? 1 : 0) - (input.steerLeft ? 1 : 0);
    this.steerAmount += (steerInput - this.steerAmount) * (1 - Math.exp(-delta * 8.5));
    const travelDirection = Math.abs(this.speed) > .08 ? Math.sign(this.speed) : input.brake && !input.accelerate ? -1 : 1;
    const speedRatio = THREE.MathUtils.clamp(Math.abs(this.speed) / HIGHWAY_TOP_SPEED, 0, 1);
    const steeringRate = (.42 + speedRatio * .78) * (input.handbrake ? 1.42 : 1);
    this.busHeading -= this.steerAmount * travelDirection * steeringRate * delta;
    const driveInput = this.disabled ? 0 : input.accelerate ? 1 : input.brake ? -1 : 0;
    // Road signals and junction proximity never take throttle authority from
    // the player. Off-route guidance remains visible, but the arcade shuttle
    // keeps its full commanded pace until the player brakes or handbrakes.
    const forwardTopSpeed = Math.min(road.road.speedLimit, this.gearTopSpeedMetersPerSecond);
    if (driveInput !== 0) {
      if (this.speed * driveInput < -.05) {
        this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - delta * 38);
      } else {
        const targetSpeed = driveInput > 0 ? forwardTopSpeed : -11;
        this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-delta * (driveInput > 0 ? 2.55 : 2.1)));
      }
    } else {
      const resistance = .38 + Math.abs(this.speed) * .035;
      this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - resistance * delta);
    }
    if (this.speed > forwardTopSpeed) this.speed = Math.max(forwardTopSpeed, this.speed - delta * 12);
    if (input.handbrake || this.disabled) this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - delta * (this.disabled ? 74 : 52));
    this.speed = THREE.MathUtils.clamp(this.speed, -11, HIGHWAY_TOP_SPEED);
    let driveForward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    // Substep at less than one tyre radius so a 70+ m/s arcade run cannot
    // tunnel through a sedan, blue closure, or building between frames.
    const movement = this.speed * delta, movementSteps = Math.max(1, Math.ceil(Math.abs(movement) / .62));
    for (let step = 0; step < movementSteps; step++) {
      driveForward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
      this.busPosition.addScaledVector(driveForward, movement / movementSteps);
      this.resolveRoadBoundaryCollision(elapsed);
      this.resolveStaticCollisions(elapsed);
      this.resolveTrafficCollisions(elapsed);
    }
    driveForward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    road = this.roadNetwork.nearest(this.busPosition, driveForward);
    const recommendedRoad = this.primaryRoadNetwork.nearest(this.busPosition, driveForward);
    this.onRecommendedRoute = recommendedRoad.distance < recommendedRoad.road.halfWidth + 3;
    this.busPosition.y = THREE.MathUtils.lerp(this.busPosition.y, road.point.y, 1 - Math.exp(-delta * 9));
    if (this.onRecommendedRoute && recommendedRoad.primaryProgress !== null) this.progress = recommendedRoad.primaryProgress;
    this.roadSurfaceMessage = road.distance > road.road.halfWidth + 1.4
      ? "OFF STREET · RETURN TO ROAD"
      : this.onRecommendedRoute ? "AUTHORED ROUTE · FREE STEERING" : "OPEN-WORLD REROUTE ACTIVE";
    const onPrimaryRoad = this.onRecommendedRoute;
    // Hold the authored traffic tableau during the level card. Cars begin
    // flowing as soon as the player takes control, so a debug/load transition
    // cannot silently drain the nearest vehicles out of the opening view.
    const trafficDelta = input.accelerate || input.brake || Math.abs(this.speed) > .05 ? delta : 0;
    const driveRight = new THREE.Vector3(-driveForward.z, 0, driveForward.x);
    const busLaneOffset = this.busPosition.clone().sub(road.point).dot(road.right);
    let nearestGap = Infinity;
    for (let index = 0; index < this.traffic.length; index++) {
      const vehicle = this.traffic[index];
      const wave = .78 + .3 * (Math.sin(elapsed * .52 + vehicle.phase) * .5 + .5);
      if (elapsed >= vehicle.nextLaneChange && vehicle.progress < CITY_BUS_ROUTE_LENGTH - 90) {
        const currentIndex = TRAFFIC_LANES.reduce((best, lane, laneIndex) => Math.abs(lane - vehicle.targetLane) < Math.abs(TRAFFIC_LANES[best] - vehicle.targetLane) ? laneIndex : best, 0);
        const passingBus = onPrimaryRoad && vehicle.progress > this.progress - 20 && vehicle.progress < this.progress + 12 && Math.abs(vehicle.lane * LANE_WIDTH - busLaneOffset) < 2.5;
        const direction = passingBus ? (currentIndex < TRAFFIC_LANES.length - 1 ? 1 : -1) : (Math.sin(vehicle.phase + elapsed * .19) >= 0 ? 1 : -1);
        const nextIndex = THREE.MathUtils.clamp(currentIndex + direction, 0, TRAFFIC_LANES.length - 1);
        vehicle.targetLane = TRAFFIC_LANES[nextIndex];
        vehicle.nextLaneChange = elapsed + 3.1 + (index * 1.37 % 4.8);
      }
      vehicle.lane += (vehicle.targetLane - vehicle.lane) * (1 - Math.exp(-trafficDelta * (Math.abs(vehicle.targetLane - vehicle.lane) > .08 ? 1.65 : 4)));
      const target = vehicle.cruise * wave;
      vehicle.speed += (target - vehicle.speed) * (1 - Math.exp(-trafficDelta * 1.65));
      vehicle.progress = Math.min(CITY_BUS_ROUTE_LENGTH + 24, vehicle.progress + vehicle.speed * trafficDelta);
      if (vehicle.progress < this.progress - 70 && this.progress < CITY_BUS_ROUTE_LENGTH - 260) {
        vehicle.progress = Math.min(CITY_BUS_ROUTE_LENGTH + 20, this.progress + 115 + (index * 47 % 520));
        vehicle.speed = Math.max(vehicle.speed, vehicle.cruise * .82);
        vehicle.root.visible = true;
      } else vehicle.root.visible = vehicle.progress <= CITY_BUS_ROUTE_LENGTH + 7;
      const vehicleFrame = routeFrame(vehicle.progress), vehiclePosition = vehicleFrame.center.clone().addScaledVector(vehicleFrame.right, vehicle.lane * LANE_WIDTH);
      const toVehicle = vehiclePosition.sub(this.busPosition);
      if (driveForward.dot(toVehicle) > 0 && driveForward.dot(vehicleFrame.tangent) > .25 && Math.abs(driveRight.dot(toVehicle)) < 2.35 && toVehicle.length() < 62) nearestGap = Math.min(nearestGap, toVehicle.length());
    }
    for (const vehicle of this.localTraffic) {
      vehicle.distance += vehicle.speed * trafficDelta;
      const frame = closedPathFrame(vehicle.path, vehicle.distance);
      vehicle.root.position.copy(frame.center).addScaledVector(frame.right, vehicle.laneOffset); vehicle.root.position.y += .02; vehicle.root.rotation.y = frame.yaw;
      const toVehicle = vehicle.root.position.clone().sub(this.busPosition);
      const headingAgreement = driveForward.dot(frame.tangent);
      if (driveForward.dot(toVehicle) > 0 && headingAgreement > .25 && Math.abs(driveRight.dot(toVehicle)) < 2.35 && toVehicle.length() < 58) nearestGap = Math.min(nearestGap, toVehicle.length());
    }
    if (this.disabled) this.trafficMessage = "SHUTTLE DISABLED · RETURNING TO ZOO CHECKPOINT";
    else if (this.speed < -.08) this.trafficMessage = "REVERSING · CHECK MIRRORS";
    else if (input.handbrake && this.speed > 8) this.trafficMessage = "HANDBRAKE TURN · REAR WEIGHT TRANSFER";
    else if (nearestGap < 28) this.trafficMessage = nearestGap < 10 ? "DODGE NOW · VEHICLE AHEAD" : "CHANGE LANES TO PASS";
    else if (!onPrimaryRoad) this.trafficMessage = "REROUTING THROUGH LIVE UPPER WEST SIDE TRAFFIC";
    else this.trafficMessage = this.speed > 42 ? "HIGH-SPEED RUN · WEST SIDE HIGHWAY" : Math.abs(this.speed) < 2 && input.accelerate ? "TRAFFIC OPENING AHEAD" : "FAST CITY TRAFFIC · ALL LANES SOUTHBOUND";
    this.updateSignalVisuals(elapsed);
    this.updateTransforms(elapsed, delta);
    this.pedestrians.forEach(agent => updateAmbientHumanAgent(agent, elapsed, delta));
    this.sun.position.copy(this.busPosition).add(new THREE.Vector3(-40, 58, 30)); this.sun.target.position.copy(this.busPosition);
  }

  private shuttleCollisionCenters() {
    const forward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    return SHUTTLE_COLLISION_OFFSETS.map(offset => this.busPosition.clone().addScaledVector(forward, offset));
  }

  private applyBounce(normal: THREE.Vector3, severity: number) {
    const forward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    const cross = forward.x * normal.z - forward.z * normal.x;
    const frontal = Math.abs(forward.dot(normal));
    this.busHeading += THREE.MathUtils.clamp(cross * (.1 + severity * .24), -.32, .32);
    this.impactRoll = THREE.MathUtils.clamp(this.impactRoll - cross * (.045 + severity * .07), -.11, .11);
    if (frontal > .42) this.speed = -Math.sign(this.speed || 1) * Math.min(9, Math.abs(this.speed) * (.08 + severity * .1));
    else this.speed *= .32 + (1 - severity) * .18;
  }

  private recordImpact(kind: ShuttleImpactEvent["kind"], label: string, severity: number, damage: number, protectedImpact = false) {
    if (protectedImpact) {
      this.latestImpactStatus = "rear-protected";
      this.lastImpact = { kind, severity, damage: 0, integrity: this.integrity, label, disabled: this.disabled, protected: true };
      return;
    }
    const appliedDamage = Math.min(damage, SHUTTLE_MAX_DAMAGE - this.damage);
    if (appliedDamage <= 0) return;
    this.damage += appliedDamage;
    this.latestImpactStatus = kind;
    this.bus.damageStages[0].visible = this.damage >= 8;
    this.bus.damageStages[1].visible = this.damage >= 48;
    this.bus.damageStages[2].visible = this.damage >= 76;
    this.lastImpact = { kind, severity, damage: appliedDamage, integrity: this.integrity, label, disabled: this.disabled, protected: false };
  }

  private resolveRoadBoundaryCollision(elapsed: number) {
    // Buildings and long highway walls are visual scenery, not independent
    // rectangular hitboxes. The road union is the authoritative collision
    // envelope, so every rendered street remains clear—even after a missed
    // turn—while leaving the pavement still produces a visible edge bounce.
    const heading = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    const road = this.roadNetwork.nearest(this.busPosition, heading);
    // The extra apron covers curb returns and the triangular paved gore where
    // multiple mapped centerlines meet. A player must leave the whole visible
    // roadway before this boundary can fire.
    const allowedDistance = road.road.halfWidth + 5.5;
    if (road.distance <= allowedDistance) return;
    const normal = road.point.clone().sub(this.busPosition).setY(0);
    if (normal.lengthSq() < .0001) return;
    normal.normalize();
    this.busPosition.addScaledVector(normal, road.distance - allowedDistance + .025);
    const cooldown = this.collisionCooldowns.get("road-envelope") ?? -Infinity;
    if (elapsed < cooldown) return;
    this.collisionCooldowns.set("road-envelope", elapsed + .7);
    const severity = THREE.MathUtils.clamp(Math.abs(this.speed) / 48, .12, 1);
    this.applyBounce(normal, severity);
    if (elapsed >= this.collisionArmedAt!) this.recordImpact("building", `${displayRoadName(road.road.name)} street edge`, severity, 1.25 + severity * 4.5);
  }

  private resolveStaticCollisions(elapsed: number) {
    const centers = this.shuttleCollisionCenters();
    for (const center of centers) {
      for (const collider of this.staticCollisionIndex.nearby(center)) {
        const contact = circleObbContact(center, SHUTTLE_COLLISION_RADIUS, collider);
        if (!contact) continue;
        this.busPosition.addScaledVector(contact.normal, contact.penetration + .025);
        const cooldown = this.collisionCooldowns.get(collider.id) ?? -Infinity;
        if (elapsed < cooldown) continue;
        this.collisionCooldowns.set(collider.id, elapsed + .42);
        const severity = THREE.MathUtils.clamp(Math.abs(this.speed) / (collider.kind === "barrier" ? 52 : 44), .12, 1);
        this.applyBounce(contact.normal, severity);
        if (elapsed >= this.collisionArmedAt!) this.recordImpact(collider.kind, collider.label, severity, (collider.kind === "barrier" ? 1.5 : 3) + severity * (collider.kind === "barrier" ? 4.5 : 9));
      }
    }
  }

  private resolveTrafficCollisions(elapsed: number) {
    const centers = this.shuttleCollisionCenters();
    const collide = (id: string, label: string, position: THREE.Vector3, vehicleSpeed: number, collisionOffset: THREE.Vector3, vehicleHeading: THREE.Vector3) => {
      for (const center of centers) {
        const separation = center.clone().sub(position).setY(0), distance = separation.length(), minimumDistance = SHUTTLE_COLLISION_RADIUS + 1.18;
        if (distance >= minimumDistance) continue;
        const shuttleForward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
        const vehicleForwardSpeed = vehicleSpeed * shuttleForward.dot(vehicleHeading);
        const relativeAlongShuttle = position.clone().sub(this.busPosition).dot(shuttleForward);
        const rearTrafficCatch = relativeAlongShuttle < -.6 && this.speed >= -.05 && shuttleForward.dot(vehicleHeading) > .35 && vehicleSpeed > .5 && vehicleForwardSpeed - this.speed > .35;
        const normal = distance > .001 ? separation.multiplyScalar(1 / distance) : new THREE.Vector3(1, 0, 0);
        this.busPosition.addScaledVector(normal, minimumDistance - distance + .035);
        collisionOffset.addScaledVector(normal, -(minimumDistance - distance + .4));
        const cooldown = this.collisionCooldowns.get(id) ?? -Infinity;
        if (elapsed < cooldown) return;
        this.collisionCooldowns.set(id, elapsed + .48);
        this.latestImpactStatus = rearTrafficCatch ? "rear-protected" : "traffic-contact";
        const closingSpeed = Math.abs(this.speed - vehicleForwardSpeed);
        const severity = THREE.MathUtils.clamp(closingSpeed / 58, .16, 1);
        if (rearTrafficCatch) {
          this.speed = Math.min(HIGHWAY_TOP_SPEED, Math.max(this.speed, this.speed + (vehicleForwardSpeed - this.speed) * (.16 + severity * .12)));
          this.impactRoll = THREE.MathUtils.clamp(this.impactRoll + (normal.x * shuttleForward.z - normal.z * shuttleForward.x) * .035, -.08, .08);
        } else this.applyBounce(normal, severity);
        if (elapsed >= this.collisionArmedAt!) this.recordImpact("traffic", rearTrafficCatch ? "traffic from behind" : label, severity, rearTrafficCatch ? 0 : 2 + severity * 7, rearTrafficCatch);
        return;
      }
    };
    this.traffic.forEach((vehicle, index) => {
      if (!vehicle.root.visible) return;
      const frame = routeFrame(vehicle.progress), position = frame.center.clone().addScaledVector(frame.right, vehicle.lane * LANE_WIDTH).add(vehicle.collisionOffset);
      collide(`traffic-main-${index}`, "city traffic", position, vehicle.speed, vehicle.collisionOffset, frame.tangent);
    });
    this.localTraffic.forEach((vehicle, index) => {
      const frame = closedPathFrame(vehicle.path, vehicle.distance), position = frame.center.clone().addScaledVector(frame.right, vehicle.laneOffset).add(vehicle.collisionOffset);
      collide(`traffic-local-${index}`, "Upper West Side traffic", position, vehicle.speed, vehicle.collisionOffset, frame.tangent);
    });
  }

  private updateTransforms(elapsed: number, delta: number) {
    this.bus.root.position.copy(this.busPosition); this.bus.root.rotation.y = this.busHeading;
    this.impactRoll *= Math.exp(-delta * 4.8);
    this.bus.root.rotation.z = -this.steerAmount * THREE.MathUtils.clamp(Math.abs(this.speed) / HIGHWAY_TOP_SPEED, 0, 1) * .035 + this.impactRoll;
    this.bus.root.position.y += Math.sin(elapsed * 5.5) * Math.min(.018, Math.abs(this.speed) * .0015);
    this.bus.steeringWheel.rotation.z = -this.steerAmount * .9;
    this.bus.root.traverse(object => { if (object.name === "rescue-bus-road-wheel") object.rotation.x -= this.speed * delta / .49; });
    this.bus.damageStages[2].children.forEach((smoke, index) => {
      const phase = elapsed * (.65 + index * .035) + Number(smoke.userData.phase ?? 0);
      const cycle = ((phase % 1.8) + 1.8) % 1.8;
      smoke.position.y = 2.75 + cycle * .95; smoke.position.x = -.65 + Math.sin(phase * 1.7) * .28; smoke.scale.setScalar(.65 + cycle * .32);
    });
    for (const vehicle of this.traffic) {
      vehicle.collisionOffset.multiplyScalar(Math.exp(-delta * 2.7));
      const frame = routeFrame(vehicle.progress); vehicle.root.position.copy(frame.center).addScaledVector(frame.right, vehicle.lane * LANE_WIDTH).add(vehicle.collisionOffset); vehicle.root.position.y += .02; vehicle.root.rotation.y = frame.yaw;
    }
    for (const vehicle of this.localTraffic) {
      vehicle.collisionOffset.multiplyScalar(Math.exp(-delta * 2.7));
      const frame = closedPathFrame(vehicle.path, vehicle.distance); vehicle.root.position.copy(frame.center).addScaledVector(frame.right, vehicle.laneOffset).add(vehicle.collisionOffset); vehicle.root.position.y += .02; vehicle.root.rotation.y = frame.yaw;
    }
  }

  private updateSignalVisuals(elapsed: number) {
    for (const signal of this.signals) {
      const active = signalAspectAt(elapsed, signal.progress);
      for (const aspect of ["RED", "YELLOW", "GREEN"] as const) setSignalLens(signal.lenses[aspect], aspect, aspect === active);
    }
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; markPremiumCharactersDisposed(this.root); this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(surface => materials.add(surface)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(surface => surface.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
