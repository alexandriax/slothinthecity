import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";
import {
  BOW_BRIDGE_CENTER,
  BOW_BRIDGE_DECK_BASE_Y,
  BOW_BRIDGE_LENGTH,
  BOW_BRIDGE_TARGET,
  BOW_BRIDGE_WIDTH,
  BOW_BRIDGE_YAW,
  SUBWAY_TARGET,
  SUBWAY_STAIR_CUTOUT,
  ZOO_TARGET,
} from "./CampaignLandmarks";

export const BUDS = [
  new THREE.Vector3(-12, 0, 14), new THREE.Vector3(17, 0, -4),
  new THREE.Vector3(18, 0, -20), new THREE.Vector3(-1, 0, -47),
  new THREE.Vector3(-24, 0, -58), new THREE.Vector3(-45, 0, -28),
];
export const START = new THREE.Vector3(-43, 0, 54);
export const GOAL = BOW_BRIDGE_TARGET;
/**
 * The Lake is an authored southern world sector rather than a decorative
 * puddle.  The ellipse alone is 15.23x the area of the previous 33.2 m
 * circular water body; the Bow Bridge inlet adds a little more playable water.
 */
export const THE_LAKE_CENTER = new THREE.Vector3(90, 0, -220);
export const THE_LAKE_RADII = new THREE.Vector2(150, 112);
export const THE_LAKE_AREA_SCALE = THE_LAKE_RADII.x * THE_LAKE_RADII.y / (33.2 ** 2);
export const THE_LAKE_SURFACE_Y = -1.86;
export const TICKET_ISLAND_RADIUS = 11.4;
export const TICKET_ISLAND_TARGET = new THREE.Vector3(90, 0, -220);
export const TICKET_ISLAND_LANDING_TARGET = new THREE.Vector3(90, 0, -210);
export const TICKET_ISLAND_BOAT_DOCK = new THREE.Vector3(90, 0, -204.7);
export const BOW_BRIDGE_BOAT_DOCK = new THREE.Vector3(-23, 0, -134);
export const BOW_BRIDGE_SHORE_LANDING = new THREE.Vector3(-21, 0, -120);
export const LAKE_SOUTHEAST_BOAT_DOCK = new THREE.Vector3(192, 0, -295);
export const LAKE_SOUTHEAST_SHORE_LANDING = new THREE.Vector3(203.5, 0, -306.2);
export const LAKE_SOUTHEAST_CART_TARGET = new THREE.Vector3(208, 0, -306.8);
export const LAKE_INLET_CENTERLINE = [
  new THREE.Vector3(-40, 0, -113),
  new THREE.Vector3(-35, 0, -124),
  new THREE.Vector3(-28, 0, -140),
  new THREE.Vector3(-16, 0, -155),
  new THREE.Vector3(4, 0, -170),
] as const;

type LakeDockDefinition = {
  land: THREE.Vector3;
  water: THREE.Vector3;
  width: number;
};

const LAKE_DOCK_DEFINITIONS: readonly LakeDockDefinition[] = [
  { land: BOW_BRIDGE_SHORE_LANDING, water: BOW_BRIDGE_BOAT_DOCK, width: 2.7 },
  { land: TICKET_ISLAND_LANDING_TARGET, water: TICKET_ISLAND_BOAT_DOCK, width: 2.25 },
  { land: LAKE_SOUTHEAST_SHORE_LANDING, water: LAKE_SOUTHEAST_BOAT_DOCK, width: 2.5 },
];
/** Backwards-compatible broad-phase values. Prefer `containsLakeWater`. */
export const LAKE_SWIM_RADIUS = THE_LAKE_RADII.x;
export const LAKE_BOAT_RADIUS = THE_LAKE_RADII.x - 2.4;

function pointSegmentDistance2d(x: number, z: number, start: THREE.Vector3, end: THREE.Vector3) {
  const segmentX = end.x - start.x, segmentZ = end.z - start.z;
  const lengthSq = segmentX * segmentX + segmentZ * segmentZ;
  const amount = THREE.MathUtils.clamp(((x - start.x) * segmentX + (z - start.z) * segmentZ) / lengthSq, 0, 1);
  return Math.hypot(x - (start.x + segmentX * amount), z - (start.z + segmentZ * amount));
}

function distanceToLakeInlet(x: number, z: number) {
  let distance = Infinity;
  for (let index = 1; index < LAKE_INLET_CENTERLINE.length; index++) {
    distance = Math.min(distance, pointSegmentDistance2d(x, z, LAKE_INLET_CENTERLINE[index - 1], LAKE_INLET_CENTERLINE[index]));
  }
  return distance;
}

function bowBridgeSupportsPlayer(x: number, z: number) {
  const dx = x - BOW_BRIDGE_CENTER.x, dz = z - BOW_BRIDGE_CENTER.z;
  const localX = Math.cos(BOW_BRIDGE_YAW) * dx - Math.sin(BOW_BRIDGE_YAW) * dz;
  const localZ = Math.sin(BOW_BRIDGE_YAW) * dx + Math.cos(BOW_BRIDGE_YAW) * dz;
  return Math.abs(localX) <= BOW_BRIDGE_LENGTH / 2 + 4.85 && Math.abs(localZ) <= BOW_BRIDGE_WIDTH / 2 + .12;
}

function dockTopAt(definition: LakeDockDefinition, amount: number) {
  const landTop = Math.max(THE_LAKE_SURFACE_Y + .34, baseTerrainY(definition.land.x, definition.land.z) + .16);
  const waterTop = THE_LAKE_SURFACE_Y + .32;
  return THREE.MathUtils.lerp(landTop, waterTop, amount);
}

/** Returns the timber deck height while the point is on a playable pier. */
export function lakeDockSurfaceHeightAt(x: number, z: number) {
  for (const definition of LAKE_DOCK_DEFINITIONS) {
    const dx = definition.water.x - definition.land.x, dz = definition.water.z - definition.land.z;
    const lengthSq = dx * dx + dz * dz;
    const rawAmount = ((x - definition.land.x) * dx + (z - definition.land.z) * dz) / Math.max(.001, lengthSq);
    if (rawAmount < -.035 || rawAmount > 1.035) continue;
    const amount = THREE.MathUtils.clamp(rawAmount, 0, 1);
    const nearestX = THREE.MathUtils.lerp(definition.land.x, definition.water.x, amount);
    const nearestZ = THREE.MathUtils.lerp(definition.land.z, definition.water.z, amount);
    const lateralDistance = Math.hypot(x - nearestX, z - nearestZ), halfWidth = definition.width / 2;
    if (lateralDistance <= halfWidth + 1.35) {
      const terrainTop = baseTerrainY(x, z), deckTop = Math.max(terrainTop, dockTopAt(definition, amount));
      const shoulderBlend = 1 - THREE.MathUtils.smoothstep(lateralDistance, Math.max(.1, halfWidth - .08), halfWidth + 1.35);
      return THREE.MathUtils.lerp(terrainTop, deckTop, shoulderBlend);
    }
  }
  return null;
}

/** Exact gameplay water test shared by swimming, boats, and shoreline logic. */
export function containsLakeWater(x: number, z: number, shoreInset = 0) {
  // Players stand on bridge and pier meshes even though water remains valid
  // underneath them for rowboat navigation. Boat broad-phase calls use a
  // positive inset and therefore deliberately bypass this dry support mask.
  if (shoreInset === 0 && (bowBridgeSupportsPlayer(x, z) || lakeDockSurfaceHeightAt(x, z) !== null)) return false;
  const islandClearance = TICKET_ISLAND_RADIUS + Math.max(0, shoreInset);
  if (Math.hypot(x - TICKET_ISLAND_TARGET.x, z - TICKET_ISLAND_TARGET.z) <= islandClearance) return false;
  const radiusX = Math.max(1, THE_LAKE_RADII.x - shoreInset);
  const radiusZ = Math.max(1, THE_LAKE_RADII.y - shoreInset);
  const dx = (x - THE_LAKE_CENTER.x) / radiusX, dz = (z - THE_LAKE_CENTER.z) / radiusZ;
  const inEllipse = dx * dx + dz * dz <= 1;
  const inletHalfWidth = Math.max(1, 11.5 - shoreInset);
  return inEllipse || distanceToLakeInlet(x, z) <= inletHalfWidth;
}

export type RowboatSpawn = {
  position: THREE.Vector3;
  rotationY: number;
  boatNumber: number;
  name: string;
};

// Hand-authored crown lines give the procedural forest a legible aerial
// structure.  The junctions are deliberately shared so a sloth entering at
// the western start can reach every route without touching the ground.
function canopyPath(controlPoints: ReadonlyArray<readonly [number, number]>, maxSpacing = 8.4) {
  const points: Array<[number, number]> = [];
  for (let segment = 0; segment < controlPoints.length - 1; segment++) {
    const from = controlPoints[segment], to = controlPoints[segment + 1];
    const divisions = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / maxSpacing));
    for (let step = segment === 0 ? 0 : 1; step <= divisions; step++) {
      const amount = step / divisions;
      points.push([
        Number(THREE.MathUtils.lerp(from[0], to[0], amount).toFixed(2)),
        Number(THREE.MathUtils.lerp(from[1], to[1], amount).toFixed(2)),
      ]);
    }
  }
  return points;
}

const CANOPY_CORRIDOR_LAYOUT = [
  {
    id: "ramble-spine",
    name: "Ramble spine",
    points: [[-55, 52], [-57, 43], [-55, 34], [-51, 25], [-46, 17], [-40, 10], [-34, 2], [-29, -7], [-25, -16], [-22, -25], [-19, -34], [-17, -43], [-18, -52], [-22, -61], [-26, -70], [-23, -75]],
  },
  {
    id: "north-crown-loop",
    name: "North crown loop",
    points: [[-55, 52], [-63, 58], [-71, 62], [-79, 58], [-84, 50], [-85, 41], [-82, 32], [-76, 25], [-68, 21], [-59, 20], [-51, 25]],
  },
  {
    id: "east-ridge",
    name: "East ridge",
    points: [[-51, 25], [-43, 29], [-35, 32], [-29, 43], [-20, 43], [-11, 44], [-2, 44], [7, 43], [16, 41], [25, 38], [34, 34], [43, 29], [51, 22]],
  },
  {
    id: "zoo-subway-canopy",
    name: "Zoo to Fifth Avenue canopy",
    // This continuous eastern crown route deliberately skirts The Lake,
    // reaches the zoo forecourt, and ends within one ground hop of the subway
    // stairs. It gives the exposed campaign leg a genuinely arboreal option.
    points: canopyPath([[51, 22], [100, -20], [160, -50], [220, -85], [252, -118], [255, -170], [257, -230], [266, -285], [278, -320], [292, -341], [306, -355], [321, -368], [335, -376]]),
  },
] as const;

function insideSubwayStairClearance(x: number, z: number, padding = 1.5) {
  const localX = Math.abs(x - SUBWAY_TARGET.x), localZ = z - SUBWAY_TARGET.z;
  return localX <= SUBWAY_STAIR_CUTOUT.halfWidth + padding
    && localZ >= SUBWAY_STAIR_CUTOUT.bottomZ - padding
    && localZ <= SUBWAY_STAIR_CUTOUT.topZ + padding;
}

export type ClimbableTree = {
  x: number;
  z: number;
  baseY: number;
  height: number;
  radius: number;
  canopyY: number;
};

export type BranchNode = {
  id: number;
  treeIndex: number;
  position: THREE.Vector3;
  routeIds: number[];
  neighborNodeIds: number[];
};

export type BranchRoute = {
  id: number;
  treeIndex: number;
  startNodeId: number;
  endNodeId: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  adjacentRouteIds: number[];
  crossTreeRouteIds: number[];
  belowRouteIds: number[];
  /** Best routes when locomotion reaches this route's end. */
  forwardRouteIds: number[];
  /** Best routes when locomotion reaches this route's start. */
  backwardRouteIds: number[];
  /** Destination tree for a crown-spanning route; null for ordinary limbs. */
  destinationTreeIndex: number | null;
  /** Hand-authored natural navigation line, or null for ambient branches. */
  corridorId: string | null;
  corridorOrder: number;
};

export type CanopyCorridor = {
  id: string;
  name: string;
  treeIndices: number[];
  routeIds: number[];
};

export type CanopyNetworkStats = {
  corridorCount: number;
  accessibleCorridorCount: number;
  corridorRouteCount: number;
  connectedTreeCount: number;
  longestCorridorTrees: number;
};

export type WorldObstacle =
  | { id: string; kind: "circle"; x: number; z: number; radius: number; minY: number; maxY: number }
  | { id: string; kind: "aabb"; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };

export type BridgeSurface = {
  x: number;
  z: number;
  y: number;
  yaw: number;
  length: number;
  width: number;
  archHeight: number;
};

export type RealisticWorld = {
  buds: THREE.Group[];
  rings: THREE.Mesh[];
  hawk: THREE.Group;
  lake: THREE.Mesh;
  lakeInlet: THREE.Mesh;
  lakeRadius: number;
  boatRadius: number;
  lakeCenter: THREE.Vector3;
  lakeRadii: THREE.Vector2;
  lakeSurfaceY: number;
  rowboatSpawns: RowboatSpawn[];
  ticketIsland: THREE.Group;
  ticket: THREE.Group;
  ticketTarget: THREE.Vector3;
  ticketIslandLanding: THREE.Vector3;
  ticketIslandBoatDock: THREE.Vector3;
  bowBridgeBoatDock: THREE.Vector3;
  bowBridgeShoreLanding: THREE.Vector3;
  southeastBoatDock: THREE.Vector3;
  southeastShoreLanding: THREE.Vector3;
  trailCurve: THREE.CatmullRomCurve3;
  trees: ClimbableTree[];
  branches: BranchRoute[];
  branchNodes: BranchNode[];
  canopyCorridors: CanopyCorridor[];
  canopyNetworkStats: CanopyNetworkStats;
  obstacles: WorldObstacle[];
  bridgeSurface: BridgeSurface;
  containsLakePoint(x: number, z: number, shoreInset?: number): boolean;
  setTicketCollected(collected: boolean): void;
  animate(time: number, player: THREE.Vector3, scent: boolean, collected: Set<number>): void;
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value ^ (value >>> 15), 1 | value), value ^= value + Math.imul(value ^ (value >>> 7), 61 | value), ((value ^ (value >>> 14)) >>> 0) / 4294967296));
}

function baseTerrainY(x: number, z: number) {
  const roll = Math.sin(x * .037) * 1.5 + Math.cos(z * .042) * 1.1 + Math.sin((x + z) * .071) * .45;
  const normalizedLakeDistance = Math.hypot(
    (x - THE_LAKE_CENTER.x) / THE_LAKE_RADII.x,
    (z - THE_LAKE_CENTER.z) / THE_LAKE_RADII.y,
  );
  // Keep the basin floor at water-edge elevation until the exact swim
  // boundary, then rise over a broad exterior shelf. Player support and the
  // rendered bank therefore meet without a one-metre discontinuity.
  const ellipseWeight = 1 - THREE.MathUtils.smoothstep(normalizedLakeDistance, 1, 1.16);
  const inletDistance = distanceToLakeInlet(x, z);
  const inletWeight = 1 - THREE.MathUtils.smoothstep(inletDistance, 10.6, 17.5);
  const basinWeight = Math.max(ellipseWeight, inletWeight);
  const lakeBed = -2.72 + Math.sin(x * .19 - z * .11) * .07 + Math.cos((x + z) * .13) * .045;
  let height = THREE.MathUtils.lerp(roll, Math.min(roll, lakeBed), basinWeight);
  // Grade both bridge approaches up to the authored deck datum. This keeps
  // the visible bank, player support, and masonry threshold on one continuous
  // slope instead of asking the camera to jump from the lake-bed terrain to a
  // floating bridge mesh at the final metre.
  const bridgeDx = x - BOW_BRIDGE_CENTER.x, bridgeDz = z - BOW_BRIDGE_CENTER.z;
  const bridgeLocalX = Math.cos(BOW_BRIDGE_YAW) * bridgeDx - Math.sin(BOW_BRIDGE_YAW) * bridgeDz;
  const bridgeLocalZ = Math.sin(BOW_BRIDGE_YAW) * bridgeDx + Math.cos(BOW_BRIDGE_YAW) * bridgeDz;
  const approachDistance = Math.abs(bridgeLocalX) - BOW_BRIDGE_LENGTH / 2;
  if (approachDistance >= 0 && approachDistance <= 6.4 && Math.abs(bridgeLocalZ) <= BOW_BRIDGE_WIDTH / 2 + 3.4) {
    const alongWeight = 1 - THREE.MathUtils.smoothstep(approachDistance, .25, 6.4);
    const acrossWeight = 1 - THREE.MathUtils.smoothstep(Math.abs(bridgeLocalZ), BOW_BRIDGE_WIDTH / 2 + .35, BOW_BRIDGE_WIDTH / 2 + 3.4);
    const approachDatum = BOW_BRIDGE_DECK_BASE_Y - .08 - approachDistance * .045;
    height = THREE.MathUtils.lerp(height, Math.max(height, approachDatum), alongWeight * acrossWeight);
  }
  // Carve the exterior Fifth Avenue stairwell into the terrain itself. The
  // local sidewalk mesh has a matching aperture, while this depression keeps
  // both rendered ground and player support below each descending tread.
  const subwayLocalX = Math.abs(x - SUBWAY_TARGET.x), subwayLocalZ = z - SUBWAY_TARGET.z;
  if (subwayLocalX <= SUBWAY_STAIR_CUTOUT.halfWidth + .07 && subwayLocalZ <= SUBWAY_STAIR_CUTOUT.topZ - .3 && subwayLocalZ >= SUBWAY_STAIR_CUTOUT.bottomZ - .1) {
    const streetY = Math.sin(SUBWAY_TARGET.x * .037) * 1.5 + Math.cos(SUBWAY_TARGET.z * .042) * 1.1 + Math.sin((SUBWAY_TARGET.x + SUBWAY_TARGET.z) * .071) * .45;
    const descent = THREE.MathUtils.clamp((-subwayLocalZ - .85) / (19 * .43), 0, 1);
    height = streetY - descent * (19 * .165);
  }
  // The ticket island is genuine dry terrain for locomotion, not a prop
  // floating over water. A broad stone shelf provides a forgiving boat exit.
  const islandDistance = Math.hypot(x - TICKET_ISLAND_TARGET.x, z - TICKET_ISLAND_TARGET.z);
  const islandWeight = 1 - THREE.MathUtils.smoothstep(islandDistance, TICKET_ISLAND_RADIUS - 2.1, TICKET_ISLAND_RADIUS + 2.4);
  const islandHeight = -.56 + Math.cos(islandDistance * .31) * .06;
  height = THREE.MathUtils.lerp(height, islandHeight, islandWeight);
  return height;
}

export function terrainY(x: number, z: number) {
  return lakeDockSurfaceHeightAt(x, z) ?? baseTerrainY(x, z);
}

function terrainGeometryWithSubwayCutout(width: number, depth: number, segments: number, centerX: number, centerZ: number) {
  const minX = centerX - width / 2, maxX = centerX + width / 2, minZ = centerZ - depth / 2, maxZ = centerZ + depth / 2;
  const xCoordinates = Array.from({ length: segments + 1 }, (_, index) => THREE.MathUtils.lerp(minX, maxX, index / segments));
  const zCoordinates = Array.from({ length: segments + 1 }, (_, index) => THREE.MathUtils.lerp(minZ, maxZ, index / segments));
  xCoordinates.push(SUBWAY_TARGET.x - SUBWAY_STAIR_CUTOUT.halfWidth, SUBWAY_TARGET.x + SUBWAY_STAIR_CUTOUT.halfWidth);
  zCoordinates.push(SUBWAY_TARGET.z + SUBWAY_STAIR_CUTOUT.bottomZ, SUBWAY_TARGET.z + SUBWAY_STAIR_CUTOUT.topZ);
  const uniqueSorted = (values: number[]) => [...new Set(values.map(value => Math.round(value * 10000) / 10000))].sort((a, b) => a - b);
  const xs = uniqueSorted(xCoordinates), zs = uniqueSorted(zCoordinates), positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (const z of zs) for (const x of xs) {
    positions.push(x, terrainY(x, z), z);
    uvs.push((x - minX) / width, (z - minZ) / depth);
  }
  const stride = xs.length;
  for (let zIndex = 0; zIndex < zs.length - 1; zIndex++) for (let xIndex = 0; xIndex < xs.length - 1; xIndex++) {
    const midpointX = (xs[xIndex] + xs[xIndex + 1]) / 2, midpointZ = (zs[zIndex] + zs[zIndex + 1]) / 2;
    const insideSubwayCutout = Math.abs(midpointX - SUBWAY_TARGET.x) < SUBWAY_STAIR_CUTOUT.halfWidth
      && midpointZ > SUBWAY_TARGET.z + SUBWAY_STAIR_CUTOUT.bottomZ
      && midpointZ < SUBWAY_TARGET.z + SUBWAY_STAIR_CUTOUT.topZ;
    if (insideSubwayCutout) continue;
    const near = zIndex * stride + xIndex, far = near + stride;
    indices.push(near, far, near + 1, near + 1, far, far + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function trailRibbon(curve: THREE.CatmullRomCurve3) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const segments = 120, width = 1.65;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, point = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const edgeNoise = Math.sin(i * 1.71) * .16 + Math.sin(i * .37) * .1;
    for (const edge of [-1, 1]) {
      positions.push(point.x + side.x * (width + edgeNoise) * edge, point.y + .035, point.z + side.z * (width + edgeNoise) * edge);
      uvs.push((edge + 1) / 2, t * 30);
    }
    if (i < segments) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function alignCylinder(object: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, radius: number) {
  const direction = end.clone().sub(start), length = direction.length();
  object.position.copy(start).add(end).multiplyScalar(.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  object.scale.set(radius, length, radius); object.updateMatrix();
}

function distanceToTrail(x: number, z: number, samples: THREE.Vector3[]) {
  let nearestSq = Infinity;
  for (let index = 1; index < samples.length; index++) {
    const start = samples[index - 1], end = samples[index];
    const segmentX = end.x - start.x, segmentZ = end.z - start.z;
    const lengthSq = segmentX * segmentX + segmentZ * segmentZ;
    const amount = THREE.MathUtils.clamp(((x - start.x) * segmentX + (z - start.z) * segmentZ) / lengthSq, 0, 1);
    const offsetX = x - (start.x + segmentX * amount), offsetZ = z - (start.z + segmentZ * amount);
    nearestSq = Math.min(nearestSq, offsetX * offsetX + offsetZ * offsetZ);
  }
  return Math.sqrt(nearestSq);
}

function pointToSegmentDistanceSq(point: THREE.Vector3, start: THREE.Vector3, end: THREE.Vector3) {
  const segmentX = end.x - start.x, segmentY = end.y - start.y, segmentZ = end.z - start.z;
  const lengthSq = segmentX * segmentX + segmentY * segmentY + segmentZ * segmentZ;
  const amount = THREE.MathUtils.clamp(((point.x - start.x) * segmentX + (point.y - start.y) * segmentY + (point.z - start.z) * segmentZ) / lengthSq, 0, 1);
  const offsetX = point.x - (start.x + segmentX * amount), offsetY = point.y - (start.y + segmentY * amount), offsetZ = point.z - (start.z + segmentZ * amount);
  return offsetX * offsetX + offsetY * offsetY + offsetZ * offsetZ;
}

function branchDropScore(source: BranchRoute, target: BranchRoute) {
  const sourceX = (source.start.x + source.end.x) * .5, sourceY = (source.start.y + source.end.y) * .5, sourceZ = (source.start.z + source.end.z) * .5;
  const targetX = target.end.x - target.start.x, targetZ = target.end.z - target.start.z;
  const lengthSq = targetX * targetX + targetZ * targetZ;
  const amount = THREE.MathUtils.clamp(((sourceX - target.start.x) * targetX + (sourceZ - target.start.z) * targetZ) / lengthSq, 0, 1);
  const landingX = target.start.x + targetX * amount, landingY = THREE.MathUtils.lerp(target.start.y, target.end.y, amount), landingZ = target.start.z + targetZ * amount;
  const horizontal = Math.hypot(sourceX - landingX, sourceZ - landingZ), drop = sourceY - landingY;
  return horizontal < 3.1 && drop > .55 && drop < 7.5 ? horizontal + drop * .16 : Infinity;
}

function buildBranchGraph(routes: BranchRoute[], nodes: BranchNode[]) {
  const routeIdsByTree = new Map<number, number[]>();
  for (const route of routes) {
    const ids = routeIdsByTree.get(route.treeIndex) ?? [];
    ids.push(route.id); routeIdsByTree.set(route.treeIndex, ids);
  }
  for (const ids of routeIdsByTree.values()) {
    for (const routeId of ids) {
      routes[routeId].adjacentRouteIds = ids.filter((candidate) => candidate !== routeId);
      const startNode = nodes[routes[routeId].startNodeId];
      startNode.neighborNodeIds = [routes[routeId].endNodeId, ...ids.filter((candidate) => candidate !== routeId).map((candidate) => routes[candidate].startNodeId)];
    }
  }

  const crossCandidates: Array<Array<{ id: number; score: number }>> = routes.map(() => []);
  const belowCandidates: Array<Array<{ id: number; score: number }>> = routes.map(() => []);
  const reachSq = 2.65 * 2.65;
  const evaluatePair = (first: number, second: number) => {
    const routeA = routes[first], routeB = routes[second];
    if (routeA.treeIndex !== routeB.treeIndex) {
      const gapSq = Math.min(
        pointToSegmentDistanceSq(routeA.start, routeB.start, routeB.end),
        pointToSegmentDistanceSq(routeA.end, routeB.start, routeB.end),
        pointToSegmentDistanceSq(routeB.start, routeA.start, routeA.end),
        pointToSegmentDistanceSq(routeB.end, routeA.start, routeA.end),
      );
      if (gapSq < reachSq) {
        crossCandidates[first].push({ id: second, score: gapSq });
        crossCandidates[second].push({ id: first, score: gapSq });
      }
    }
    const aToB = branchDropScore(routeA, routeB), bToA = branchDropScore(routeB, routeA);
    if (Number.isFinite(aToB)) belowCandidates[first].push({ id: second, score: aToB });
    if (Number.isFinite(bToA)) belowCandidates[second].push({ id: first, score: bToA });
  };
  const cellSize = 5, cells = new Map<string, number[]>();
  const spatial = routes.map((route) => ({
    x: (route.start.x + route.end.x) * .5,
    z: (route.start.z + route.end.z) * .5,
    halfLength: Math.hypot(route.end.x - route.start.x, route.end.z - route.start.z) * .5,
  }));
  const maxHalfLength = Math.max(...spatial.map((entry) => entry.halfLength));
  for (const route of routes) {
    const entry = spatial[route.id], key = `${Math.floor(entry.x / cellSize)}:${Math.floor(entry.z / cellSize)}`, ids = cells.get(key) ?? [];
    ids.push(route.id); cells.set(key, ids);
  }
  for (let first = 0; first < routes.length; first++) {
    const entryA = spatial[first], searchRadius = Math.ceil((entryA.halfLength + maxHalfLength + 3.2) / cellSize);
    const centerCellX = Math.floor(entryA.x / cellSize), centerCellZ = Math.floor(entryA.z / cellSize);
    for (let offsetX = -searchRadius; offsetX <= searchRadius; offsetX++) for (let offsetZ = -searchRadius; offsetZ <= searchRadius; offsetZ++) {
      const ids = cells.get(`${centerCellX + offsetX}:${centerCellZ + offsetZ}`);
      if (!ids) continue;
      for (const second of ids) {
        if (second <= first) continue;
        const entryB = spatial[second], threshold = entryA.halfLength + entryB.halfLength + 3.2;
        if ((entryA.x - entryB.x) ** 2 + (entryA.z - entryB.z) ** 2 <= threshold * threshold) evaluatePair(first, second);
      }
    }
  }

  for (const route of routes) {
    route.crossTreeRouteIds = crossCandidates[route.id].sort((a, b) => a.score - b.score).slice(0, 6).map((candidate) => candidate.id);
    route.belowRouteIds = belowCandidates[route.id].sort((a, b) => a.score - b.score).slice(0, 4).map((candidate) => candidate.id);
  }
  for (const route of routes) for (const neighborRouteId of route.crossTreeRouteIds) {
    const neighbor = routes[neighborRouteId];
    if (!neighbor.crossTreeRouteIds.includes(route.id)) neighbor.crossTreeRouteIds.push(route.id);
  }
  for (const route of routes) {
    for (const neighborRouteId of route.crossTreeRouteIds) {
      const neighbor = routes[neighborRouteId];
      const endpointPairs: Array<[number, number, number]> = [
        [route.startNodeId, neighbor.startNodeId, route.start.distanceToSquared(neighbor.start)],
        [route.startNodeId, neighbor.endNodeId, route.start.distanceToSquared(neighbor.end)],
        [route.endNodeId, neighbor.startNodeId, route.end.distanceToSquared(neighbor.start)],
        [route.endNodeId, neighbor.endNodeId, route.end.distanceToSquared(neighbor.end)],
      ];
      endpointPairs.sort((a, b) => a[2] - b[2]);
      const [fromNodeId, toNodeId] = endpointPairs[0];
      if (!nodes[fromNodeId].neighborNodeIds.includes(toNodeId)) nodes[fromNodeId].neighborNodeIds.push(toNodeId);
      if (!nodes[toNodeId].neighborNodeIds.includes(fromNodeId)) nodes[toNodeId].neighborNodeIds.push(fromNodeId);
    }
  }
}

function connectRoutes(routes: BranchRoute[], nodes: BranchNode[], firstId: number, secondId: number) {
  const first = routes[firstId], second = routes[secondId];
  if (!first || !second || firstId === secondId) return;
  if (!first.crossTreeRouteIds.includes(secondId)) first.crossTreeRouteIds.push(secondId);
  if (!second.crossTreeRouteIds.includes(firstId)) second.crossTreeRouteIds.push(firstId);
  const endpointPairs: Array<[number, number, number]> = [
    [first.startNodeId, second.startNodeId, first.start.distanceToSquared(second.start)],
    [first.startNodeId, second.endNodeId, first.start.distanceToSquared(second.end)],
    [first.endNodeId, second.startNodeId, first.end.distanceToSquared(second.start)],
    [first.endNodeId, second.endNodeId, first.end.distanceToSquared(second.end)],
  ];
  endpointPairs.sort((a, b) => a[2] - b[2]);
  const [firstNodeId, secondNodeId] = endpointPairs[0];
  if (!nodes[firstNodeId].neighborNodeIds.includes(secondNodeId)) nodes[firstNodeId].neighborNodeIds.push(secondNodeId);
  if (!nodes[secondNodeId].neighborNodeIds.includes(firstNodeId)) nodes[secondNodeId].neighborNodeIds.push(firstNodeId);
}

function routeEndpointScore(source: BranchRoute, target: BranchRoute, forward: boolean) {
  const endpoint = forward ? source.end : source.start;
  const startGap = endpoint.distanceTo(target.start), endGap = endpoint.distanceTo(target.end);
  const targetDirection = (startGap <= endGap ? target.end.clone().sub(target.start) : target.start.clone().sub(target.end)).normalize();
  const travelDirection = (forward ? source.end.clone().sub(source.start) : source.start.clone().sub(source.end)).normalize();
  return Math.min(startGap, endGap) * 1.7 - travelDirection.dot(targetDirection) * 2.4;
}

function finalizeCanopyNetwork(corridors: CanopyCorridor[], routes: BranchRoute[], nodes: BranchNode[], trees: ClimbableTree[]) {
  const corridorRoutesFromTree = new Map<number, number[]>();
  for (const corridor of corridors) for (const routeId of corridor.routeIds) {
    const route = routes[routeId], ids = corridorRoutesFromTree.get(route.treeIndex) ?? [];
    ids.push(routeId); corridorRoutesFromTree.set(route.treeIndex, ids);
  }

  // A route grown from tree A ends at tree B.  Explicitly wire that endpoint
  // to every authored limb leaving B so junctions survive the ambient graph's
  // nearest-six pruning even in extremely dense crowns.
  for (const corridor of corridors) for (let index = 0; index < corridor.routeIds.length; index++) {
    const route = routes[corridor.routeIds[index]];
    for (const nextRouteId of corridorRoutesFromTree.get(route.destinationTreeIndex ?? -1) ?? []) connectRoutes(routes, nodes, route.id, nextRouteId);
    const previousRouteId = corridor.routeIds[index - 1], nextRouteId = corridor.routeIds[index + 1];
    if (previousRouteId !== undefined) connectRoutes(routes, nodes, route.id, previousRouteId);
    if (nextRouteId !== undefined) connectRoutes(routes, nodes, route.id, nextRouteId);
  }

  for (const route of routes) {
    const candidates = [...new Set([...route.crossTreeRouteIds, ...route.adjacentRouteIds])];
    route.forwardRouteIds = candidates.slice().sort((a, b) => routeEndpointScore(route, routes[a], true) - routeEndpointScore(route, routes[b], true)).slice(0, 8);
    route.backwardRouteIds = candidates.slice().sort((a, b) => routeEndpointScore(route, routes[a], false) - routeEndpointScore(route, routes[b], false)).slice(0, 8);
  }
  for (const corridor of corridors) for (let index = 0; index < corridor.routeIds.length; index++) {
    const route = routes[corridor.routeIds[index]], previousRouteId = corridor.routeIds[index - 1], nextRouteId = corridor.routeIds[index + 1];
    if (previousRouteId !== undefined) route.backwardRouteIds = [previousRouteId, ...route.backwardRouteIds.filter((id) => id !== previousRouteId)];
    if (nextRouteId !== undefined) route.forwardRouteIds = [nextRouteId, ...route.forwardRouteIds.filter((id) => id !== nextRouteId)];
  }

  if (corridors.length < 3) throw new Error("Canopy network requires at least three authored corridors.");
  for (const corridor of corridors) {
    if (corridor.treeIndices.length < 8 || corridor.routeIds.length !== corridor.treeIndices.length - 1) throw new Error(`Canopy corridor ${corridor.id} is incomplete.`);
    for (let index = 1; index < corridor.routeIds.length; index++) {
      const previous = routes[corridor.routeIds[index - 1]], current = routes[corridor.routeIds[index]];
      if (!previous.crossTreeRouteIds.includes(current.id)) throw new Error(`Canopy corridor ${corridor.id} breaks between routes ${previous.id} and ${current.id}.`);
    }
  }

  const accessibleRouteIds = corridors.flatMap((corridor) => {
    const firstTree = trees[corridor.treeIndices[0]], surfaceDistance = Math.hypot(firstTree.x - START.x, firstTree.z - START.z) - firstTree.radius;
    return surfaceDistance < 15 ? corridor.routeIds.slice(0, 1) : [];
  });
  const reachable = new Set<number>(), frontier = [...accessibleRouteIds];
  while (frontier.length) {
    const routeId = frontier.pop()!;
    if (reachable.has(routeId)) continue;
    reachable.add(routeId);
    const route = routes[routeId];
    for (const neighbor of [...route.adjacentRouteIds, ...route.crossTreeRouteIds]) if (!reachable.has(neighbor)) frontier.push(neighbor);
  }
  const accessibleCorridorCount = corridors.filter((corridor) => corridor.routeIds.every((routeId) => reachable.has(routeId))).length;
  if (accessibleCorridorCount !== corridors.length) throw new Error(`Only ${accessibleCorridorCount} of ${corridors.length} canopy corridors are reachable from the start grove.`);
  const connectedTrees = new Set<number>();
  for (const corridor of corridors) for (const treeIndex of corridor.treeIndices) if (corridor.routeIds.some((routeId) => reachable.has(routeId))) connectedTrees.add(treeIndex);
  return {
    corridorCount: corridors.length,
    accessibleCorridorCount,
    corridorRouteCount: corridors.reduce((total, corridor) => total + corridor.routeIds.length, 0),
    connectedTreeCount: connectedTrees.size,
    longestCorridorTrees: Math.max(...corridors.map((corridor) => corridor.treeIndices.length)),
  } satisfies CanopyNetworkStats;
}

function addTrees(scene: THREE.Scene, textures: GameTextures, quality: number, trailCurve: THREE.CatmullRomCurve3) {
  const random = seeded(7331);
  // Extra density is delivered through the same instanced trunk/limb/leaf
  // draw calls, so the Ramble reads as woodland without multiplying mobile
  // draw calls. Low tiers receive a smaller proportional increase.
  const treeCount = Math.round(210 + 330 * THREE.MathUtils.clamp(quality, .45, 1));
  const trees: ClimbableTree[] = [];
  const branchRoutes: BranchRoute[] = [], branchNodes: BranchNode[] = [];
  const heroPositions: Array<[number, number]> = [];
  const heroPositionKeys = new Set<string>();
  for (const corridor of CANOPY_CORRIDOR_LAYOUT) for (const point of corridor.points) {
    const key = `${point[0]}:${point[1]}`;
    if (!heroPositionKeys.has(key)) { heroPositionKeys.add(key); heroPositions.push([point[0], point[1]]); }
  }
  const trailSamples = Array.from({ length: 81 }, (_, index) => trailCurve.getPoint(index / 80));
  const campaignTrailSamples = [BOW_BRIDGE_TARGET, new THREE.Vector3(45, 0, -69), ZOO_TARGET, SUBWAY_TARGET];
  const trunkGeometry = new THREE.CylinderGeometry(.2, 1, 1, 18, 8);
  const branchGeometry = new THREE.CylinderGeometry(.36, 1, 1, 12, 3);
  const barkMaterial = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .11, color: "#afa18e", roughness: .95 });
  const trunks = new THREE.InstancedMesh(trunkGeometry, barkMaterial, treeCount);
  const primaryBranches = quality > .86 ? 8 : 6;
  const secondaryPerPrimary = 2, tertiaryPerSecondary = quality > .86 ? 1 : 0, terminalForks = 3;
  const branchesPerTree = primaryBranches * (1 + secondaryPerPrimary + secondaryPerPrimary * tertiaryPerSecondary) + terminalForks;
  const branches = new THREE.InstancedMesh(branchGeometry, barkMaterial, treeCount * branchesPerTree);
  const foliageMaterial = new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .38, side: THREE.DoubleSide, roughness: .78, metalness: 0, color: "#d8e0c6" });
  const shrubMaterial = new THREE.MeshStandardMaterial({ map: textures.foliage, alphaTest: .38, side: THREE.DoubleSide, roughness: .8, color: "#d2dbc2" });
  const leafGeometry = new THREE.PlaneGeometry(1, 1, 2, 2);
  const crownClusters = quality > .86 ? 8 : 6;
  const foliageClustersPerTree = primaryBranches * 2 + primaryBranches * secondaryPerPrimary * (1 + tertiaryPerSecondary) + terminalForks + crownClusters;
  const cardsPerCluster = 2;
  const leaves = new THREE.InstancedMesh(leafGeometry, foliageMaterial, treeCount * foliageClustersPerTree * cardsPerCluster);
  trunks.castShadow = trunks.receiveShadow = true; branches.castShadow = true; leaves.castShadow = quality > .97;
  const treeArchetypes = [
    { crownStart: .37, spread: 1.14, rise: .085, asymmetry: .12 },
    { crownStart: .42, spread: .84, rise: .17, asymmetry: .06 },
    { crownStart: .35, spread: 1.02, rise: .12, asymmetry: .52 },
  ];
  const dummy = new THREE.Object3D(), start = new THREE.Vector3(), end = new THREE.Vector3(), secondaryStart = new THREE.Vector3(), secondaryEnd = new THREE.Vector3(), tertiaryStart = new THREE.Vector3(), tertiaryEnd = new THREE.Vector3();
  const leafTint = new THREE.Color();
  const randomWorldX = () => random() * 670 - 260;
  const randomWorldZ = () => random() * 680 - 480;
  let tree = 0, hero = 0, attempts = 0;
  while (tree < treeCount && attempts < treeCount * 80) {
    const forced = hero < heroPositions.length ? heroPositions[hero++] : undefined;
    const x = forced ? forced[0] : randomWorldX(), z = forced ? forced[1] : randomWorldZ();
    attempts++;
    const height = 8.5 + random() * 7.5, radius = .38 + random() * .34;
    const trailDistance = distanceToTrail(x, z, trailSamples), campaignTrailDistance = distanceToTrail(x, z, campaignTrailSamples);
    // Preserve a readable, dry bank around the entire lake and inlet.  A
    // trunk technically outside the water mesh could still have its flared
    // base and crown read as growing out of the lake, especially at dusk.
    // Island sycamores are authored separately below and remain intentional.
    const blocked = containsLakeWater(x, z, -radius - 6.5)
      || Math.hypot(x - TICKET_ISLAND_TARGET.x, z - TICKET_ISLAND_TARGET.z) < TICKET_ISLAND_RADIUS + 4 + radius
      || Math.hypot(x - START.x, z - START.z) < 9.5 + radius
      || Math.hypot(x - BOW_BRIDGE_TARGET.x, z - BOW_BRIDGE_TARGET.z) < 10 + radius
      || (!forced && Math.hypot(x - ZOO_TARGET.x, z - ZOO_TARGET.z) < 15 + radius)
      || (!forced && Math.hypot(x - SUBWAY_TARGET.x, z - SUBWAY_TARGET.z) < 8 + radius)
      || Math.hypot(x - LAKE_SOUTHEAST_CART_TARGET.x, z - LAKE_SOUTHEAST_CART_TARGET.z) < 7 + radius
      || (!forced && trailDistance < 3.15 + radius)
      || (!forced && campaignTrailDistance < 3.3 + radius)
      || Math.hypot(x, z) < 8
      || trees.some((other) => Math.hypot(x - other.x, z - other.z) < radius + other.radius + 1.28);
    if (blocked) continue;
    const archetype = treeArchetypes[Math.floor(random() * treeArchetypes.length)];
    const baseY = terrainY(x, z), canopyY = baseY + height * (archetype.crownStart + .03);
    const visibleTrunkHeight = height * (.78 + random() * .075);
    dummy.position.set(x, baseY + visibleTrunkHeight / 2, z); dummy.rotation.set(0, random() * Math.PI * 2, 0); dummy.scale.set(radius, visibleTrunkHeight, radius); dummy.updateMatrix(); trunks.setMatrixAt(tree, dummy.matrix);
    trees.push({ x, z, baseY, height, radius: radius * 1.08, canopyY });

    const foliageAnchors: THREE.Vector3[] = [];
    let branchInstance = tree * branchesPerTree;
    const crownRotation = random() * Math.PI * 2;
    for (let branch = 0; branch < primaryBranches; branch++) {
      const normalizedBranch = branch / Math.max(1, primaryBranches - 1);
      const angle = crownRotation + branch / primaryBranches * Math.PI * 2 + Math.sin(branch * 1.73) * archetype.asymmetry + (random() - .5) * .42;
      const level = archetype.crownStart + normalizedBranch * .3 + random() * .045;
      const length = (2.7 + random() * 2.55) * archetype.spread * (1 - normalizedBranch * .12);
      start.set(x, baseY + height * level, z);
      end.set(x + Math.cos(angle) * length, baseY + height * Math.min(.9, level + archetype.rise + random() * .075), z + Math.sin(angle) * length);
      const primaryRadius = radius * (.43 - normalizedBranch * .07 + random() * .065);
      alignCylinder(dummy, start, end, primaryRadius); branches.setMatrixAt(branchInstance++, dummy.matrix);
      const routeId = branchRoutes.length, startNodeId = branchNodes.length, endNodeId = startNodeId + 1;
      branchNodes.push(
        { id: startNodeId, treeIndex: tree, position: start.clone(), routeIds: [routeId], neighborNodeIds: [endNodeId] },
        { id: endNodeId, treeIndex: tree, position: end.clone(), routeIds: [routeId], neighborNodeIds: [startNodeId] },
      );
      branchRoutes.push({
        id: routeId, treeIndex: tree, startNodeId, endNodeId, start: start.clone(), end: end.clone(), radius: primaryRadius,
        adjacentRouteIds: [], crossTreeRouteIds: [], belowRouteIds: [], forwardRouteIds: [], backwardRouteIds: [],
        destinationTreeIndex: null, corridorId: null, corridorOrder: -1,
      });
      foliageAnchors.push(end.clone());
      const limbCluster = start.clone().lerp(end, .56 + random() * .12); limbCluster.y += .28 + random() * .42; foliageAnchors.push(limbCluster);

      for (let secondary = 0; secondary < secondaryPerPrimary; secondary++) {
        secondaryStart.copy(start).lerp(end, .43 + secondary * .17 + random() * .09);
        const fan = (secondary - (secondaryPerPrimary - 1) / 2) * (.78 + random() * .24) + (random() - .5) * .25;
        const secondaryAngle = angle + fan;
        const secondaryLength = (1.75 + random() * 1.85) * (.88 + archetype.spread * .16);
        secondaryEnd.set(
          secondaryStart.x + Math.cos(secondaryAngle) * secondaryLength,
          Math.min(baseY + height * .96, secondaryStart.y + .55 + random() * 1.35),
          secondaryStart.z + Math.sin(secondaryAngle) * secondaryLength,
        );
        const secondaryRadius = primaryRadius * (.43 + random() * .13);
        alignCylinder(dummy, secondaryStart, secondaryEnd, secondaryRadius); branches.setMatrixAt(branchInstance++, dummy.matrix);
        foliageAnchors.push(secondaryEnd.clone());

        if (tertiaryPerSecondary) {
          tertiaryStart.copy(secondaryStart).lerp(secondaryEnd, .55 + random() * .16);
          const tertiaryAngle = secondaryAngle + (secondary === 0 ? -1 : 1) * (.42 + random() * .38);
          const tertiaryLength = 1.15 + random() * 1.45;
          tertiaryEnd.set(
            tertiaryStart.x + Math.cos(tertiaryAngle) * tertiaryLength,
            Math.min(baseY + height, tertiaryStart.y + .35 + random() * .9),
            tertiaryStart.z + Math.sin(tertiaryAngle) * tertiaryLength,
          );
          alignCylinder(dummy, tertiaryStart, tertiaryEnd, secondaryRadius * (.42 + random() * .1)); branches.setMatrixAt(branchInstance++, dummy.matrix);
          foliageAnchors.push(tertiaryEnd.clone());
        }
      }
    }

    for (let fork = 0; fork < terminalForks; fork++) {
      const forkAngle = crownRotation + fork / terminalForks * Math.PI * 2 + (random() - .5) * .34;
      start.set(x, baseY + height * (.62 + fork * .035), z);
      const forkLength = (1.35 + random() * 1.1) * archetype.spread;
      end.set(x + Math.cos(forkAngle) * forkLength, baseY + height * (.89 + random() * .095), z + Math.sin(forkAngle) * forkLength);
      alignCylinder(dummy, start, end, radius * (.19 + random() * .055)); branches.setMatrixAt(branchInstance++, dummy.matrix);
      foliageAnchors.push(end.clone());
    }

    for (let crown = 0; crown < crownClusters; crown++) {
      const crownAngle = crownRotation + crown / crownClusters * Math.PI * 2 + (random() - .5) * .5;
      const orbit = crown < 2 ? random() * .65 : (1.05 + random() * 2.25) * archetype.spread;
      foliageAnchors.push(new THREE.Vector3(
        x + Math.cos(crownAngle) * orbit,
        baseY + height * (.7 + random() * .285),
        z + Math.sin(crownAngle) * orbit,
      ));
    }
    for (let cluster = 0; cluster < foliageClustersPerTree; cluster++) {
      const clusterPosition = foliageAnchors[cluster];
      const angle = Math.atan2(clusterPosition.z - z, clusterPosition.x - x);
      const scale = (2.45 + random() * 1.85) * (.94 + archetype.spread * .08);
      for (let card = 0; card < cardsPerCluster; card++) {
        dummy.position.set(clusterPosition.x + (random() - .5) * .55, clusterPosition.y + (random() - .5) * .5, clusterPosition.z + (random() - .5) * .55);
        dummy.rotation.set((random() - .5) * .16, angle + card * Math.PI / cardsPerCluster, (random() - .5) * .12);
        dummy.scale.set(scale, scale * (.46 + random() * .14), 1); dummy.updateMatrix();
        const leafIndex = (tree * foliageClustersPerTree + cluster) * cardsPerCluster + card;
        leaves.setMatrixAt(leafIndex, dummy.matrix);
        leafTint.setHSL(.245 + (random() - .5) * .035, .2 + random() * .13, .72 + random() * .14); leaves.setColorAt(leafIndex, leafTint);
      }
    }
    tree++;
  }
  if (tree !== treeCount) throw new Error(`Unable to place realistic forest: placed ${tree} of ${treeCount} trees.`);

  const corridorLinkCount = CANOPY_CORRIDOR_LAYOUT.reduce((total, corridor) => total + corridor.points.length - 1, 0);
  const corridorBranches = new THREE.InstancedMesh(branchGeometry, barkMaterial, corridorLinkCount * 2);
  const corridorMossMaterial = new THREE.MeshStandardMaterial({ map: textures.moss, bumpMap: textures.moss, bumpScale: .045, color: "#b1c995", emissive: "#2f4825", emissiveMap: textures.moss, emissiveIntensity: .36, roughness: 1, transparent: true, opacity: .94, alphaTest: .27 });
  const corridorMossGeometry = new THREE.CylinderGeometry(.42, 1, 1, 10, 2);
  const corridorMoss = new THREE.InstancedMesh(corridorMossGeometry, corridorMossMaterial, corridorLinkCount * 4);
  const treeIndexByPosition = new Map(trees.map((placedTree, index) => [`${placedTree.x}:${placedTree.z}`, index]));
  const canopyCorridors: CanopyCorridor[] = [];
  const corridorStart = new THREE.Vector3(), corridorEnd = new THREE.Vector3(), corridorMidpoint = new THREE.Vector3(), corridorDirection = new THREE.Vector3();
  const sourceTip = new THREE.Vector3(), destinationTip = new THREE.Vector3(), mossStart = new THREE.Vector3(), mossEnd = new THREE.Vector3();
  let corridorLimbInstance = 0, corridorMossInstance = 0;
  for (const corridor of CANOPY_CORRIDOR_LAYOUT) {
    const treeIndices = corridor.points.map((point) => {
      const treeIndex = treeIndexByPosition.get(`${point[0]}:${point[1]}`);
      if (treeIndex === undefined) throw new Error(`Canopy anchor ${point[0]},${point[1]} was not placed.`);
      return treeIndex;
    });
    const routeIds: number[] = [];
    for (let index = 0; index < treeIndices.length - 1; index++) {
      const sourceTreeIndex = treeIndices[index], destinationTreeIndex = treeIndices[index + 1];
      const sourceTree = trees[sourceTreeIndex], destinationTree = trees[destinationTreeIndex];
      const sourceY = Math.min(sourceTree.baseY + sourceTree.height * .76, Math.max(sourceTree.canopyY + .52, sourceTree.baseY + sourceTree.height * .58));
      const destinationY = Math.min(destinationTree.baseY + destinationTree.height * .76, Math.max(destinationTree.canopyY + .52, destinationTree.baseY + destinationTree.height * .58));
      corridorStart.set(sourceTree.x, sourceY, sourceTree.z); corridorEnd.set(destinationTree.x, destinationY, destinationTree.z);
      const routeId = branchRoutes.length, startNodeId = branchNodes.length, endNodeId = startNodeId + 1;
      const corridorRadius = Math.max(.24, Math.min(sourceTree.radius, destinationTree.radius) * .48);
      branchNodes.push(
        { id: startNodeId, treeIndex: sourceTreeIndex, position: corridorStart.clone(), routeIds: [routeId], neighborNodeIds: [endNodeId] },
        { id: endNodeId, treeIndex: destinationTreeIndex, position: corridorEnd.clone(), routeIds: [routeId], neighborNodeIds: [startNodeId] },
      );
      branchRoutes.push({
        id: routeId, treeIndex: sourceTreeIndex, startNodeId, endNodeId, start: corridorStart.clone(), end: corridorEnd.clone(), radius: corridorRadius,
        adjacentRouteIds: [], crossTreeRouteIds: [], belowRouteIds: [], forwardRouteIds: [], backwardRouteIds: [],
        destinationTreeIndex, corridorId: corridor.id, corridorOrder: index,
      });
      routeIds.push(routeId);

      corridorDirection.copy(corridorEnd).sub(corridorStart).normalize();
      corridorMidpoint.copy(corridorStart).add(corridorEnd).multiplyScalar(.5);
      sourceTip.copy(corridorMidpoint).addScaledVector(corridorDirection, .58);
      destinationTip.copy(corridorMidpoint).addScaledVector(corridorDirection, -.58);
      alignCylinder(dummy, corridorStart, sourceTip, corridorRadius); corridorBranches.setMatrixAt(corridorLimbInstance++, dummy.matrix);
      mossStart.lerpVectors(corridorStart, sourceTip, .18).add(new THREE.Vector3(0, corridorRadius * .72, 0));
      mossEnd.lerpVectors(corridorStart, sourceTip, .9).add(new THREE.Vector3(0, corridorRadius * .72, 0));
      alignCylinder(dummy, mossStart, mossEnd, .082 + corridorRadius * .06); corridorMoss.setMatrixAt(corridorMossInstance++, dummy.matrix);
      mossStart.lerpVectors(corridorStart, sourceTip, .22).add(new THREE.Vector3(0, -corridorRadius * 1.02, 0));
      mossEnd.lerpVectors(corridorStart, sourceTip, .94).add(new THREE.Vector3(0, -corridorRadius * 1.02, 0));
      alignCylinder(dummy, mossStart, mossEnd, .034 + corridorRadius * .025); corridorMoss.setMatrixAt(corridorMossInstance++, dummy.matrix);
      alignCylinder(dummy, corridorEnd, destinationTip, corridorRadius * .94); corridorBranches.setMatrixAt(corridorLimbInstance++, dummy.matrix);
      mossStart.lerpVectors(corridorEnd, destinationTip, .18).add(new THREE.Vector3(0, corridorRadius * .68, 0));
      mossEnd.lerpVectors(corridorEnd, destinationTip, .9).add(new THREE.Vector3(0, corridorRadius * .68, 0));
      alignCylinder(dummy, mossStart, mossEnd, .078 + corridorRadius * .055); corridorMoss.setMatrixAt(corridorMossInstance++, dummy.matrix);
      mossStart.lerpVectors(corridorEnd, destinationTip, .22).add(new THREE.Vector3(0, -corridorRadius * .98, 0));
      mossEnd.lerpVectors(corridorEnd, destinationTip, .94).add(new THREE.Vector3(0, -corridorRadius * .98, 0));
      alignCylinder(dummy, mossStart, mossEnd, .032 + corridorRadius * .024); corridorMoss.setMatrixAt(corridorMossInstance++, dummy.matrix);
    }
    canopyCorridors.push({ id: corridor.id, name: corridor.name, treeIndices, routeIds });
  }

  buildBranchGraph(branchRoutes, branchNodes);
  const canopyNetworkStats = finalizeCanopyNetwork(canopyCorridors, branchRoutes, branchNodes, trees);
  trunks.instanceMatrix.needsUpdate = branches.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true; if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  corridorBranches.instanceMatrix.needsUpdate = corridorMoss.instanceMatrix.needsUpdate = true;
  corridorBranches.castShadow = corridorBranches.receiveShadow = true; corridorMoss.receiveShadow = true;
  scene.add(trunks, branches, leaves, corridorBranches, corridorMoss);

  // Understory detail: rocks, shrubs, and fallen bark-covered logs in a handful of draw calls.
  const scatterCount = Math.round(620 * quality);
  const shrubs = new THREE.InstancedMesh(leafGeometry, shrubMaterial, scatterCount * 2);
  const fernMaterial = new THREE.MeshStandardMaterial({ map: textures.fern, alphaTest: .34, side: THREE.DoubleSide, roughness: .84, color: "#c5d0b2" });
  const fernCount = Math.round(1120 * quality);
  const ferns = new THREE.InstancedMesh(leafGeometry, fernMaterial, fernCount * 2);
  const rockMaterial = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .1, color: "#777a69", roughness: .96 });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.55, 1), rockMaterial, Math.round(90 * quality));
  const understoryAnchors: Array<[number,number]> = [[-47,51],[-39,50],[-49,59],[-36,53],[-31,41],[-27,34],[-18,22],[-5,16],[10,4],[16,-11],[-1,-50],[-17,-60],[0,-43],[8,-66],[18,-75],[34,-78],[55,-71],[68,-43],[58,-18],[34,-8]];
  for (let i = 0; i < scatterCount; i++) {
    const anchor = understoryAnchors[i];
    let x = anchor ? anchor[0] : randomWorldX(), z = anchor ? anchor[1] : randomWorldZ();
    while ((!anchor && containsLakeWater(x, z, -1.5)) || insideSubwayStairClearance(x, z)) { x = randomWorldX(); z = randomWorldZ(); }
    const scale = anchor ? .78 + random() * .35 : .32 + random() * .66;
    const y = terrainY(x, z) + scale * .48, angle = random() * Math.PI;
    for (let card = 0; card < 2; card++) { dummy.position.set(x, y, z); dummy.rotation.set((random() - .5) * .16, angle + card * Math.PI / 2, 0); dummy.scale.set(scale, scale * (.7 + random() * .45), 1); dummy.updateMatrix(); shrubs.setMatrixAt(i * 2 + card, dummy.matrix); }
  }
  for (let i = 0; i < rocks.count; i++) {
    let x = randomWorldX(), z = randomWorldZ();
    while (containsLakeWater(x, z, -.8) || insideSubwayStairClearance(x, z)) { x = randomWorldX(); z = randomWorldZ(); }
    const scale = .35 + random() * 1.15;
    dummy.position.set(x, terrainY(x, z) + scale * .22, z); dummy.rotation.set(random(), random() * Math.PI, random()); dummy.scale.set(scale, scale * (.45 + random() * .32), scale); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  shrubs.instanceMatrix.needsUpdate = rocks.instanceMatrix.needsUpdate = true; rocks.castShadow = rocks.receiveShadow = true;
  for (let i = 0; i < fernCount; i++) {
    const anchor = understoryAnchors[i % understoryAnchors.length], clustered = i < understoryAnchors.length * 5;
    let x = clustered ? anchor[0] + (random() - .5) * 7 : randomWorldX(), z = clustered ? anchor[1] + (random() - .5) * 7 : randomWorldZ();
    while ((!clustered && containsLakeWater(x, z, -1.2)) || insideSubwayStairClearance(x, z)) { x = randomWorldX(); z = randomWorldZ(); }
    const scale = .48 + random() * 1.08, y = terrainY(x, z) + scale * .5, angle = random() * Math.PI;
    for (let card = 0; card < 2; card++) { dummy.position.set(x, y, z); dummy.rotation.set(0, angle + card * Math.PI / 2, 0); dummy.scale.set(scale, scale * 1.2, 1); dummy.updateMatrix(); ferns.setMatrixAt(i * 2 + card, dummy.matrix); }
  }
  ferns.instanceMatrix.needsUpdate = true;
  scene.add(shrubs, ferns, rocks);

  // Thousands of cheap, individually tinted leaves break up the ground plane at eye level.
  const litterCount = Math.round(2400 * quality);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -.12); leafShape.quadraticCurveTo(.09, -.025, 0, .14); leafShape.quadraticCurveTo(-.09, -.025, 0, -.12);
  const litterMaterial = new THREE.MeshStandardMaterial({ vertexColors:true, color:"#b5a989", roughness:1, side:THREE.DoubleSide });
  const litter = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape), litterMaterial, litterCount);
  const litterPalette = [new THREE.Color("#51442d"),new THREE.Color("#6e5830"),new THREE.Color("#38422b"),new THREE.Color("#8a6b39"),new THREE.Color("#433725")];
  for (let i = 0; i < litterCount; i++) {
    let x = randomWorldX(), z = randomWorldZ();
    if (i < 280) { x = -43 + (random() - .5) * 34; z = 54 + (random() - .5) * 32; }
    if (containsLakeWater(x, z, -.65) || insideSubwayStairClearance(x, z)) { i--; continue; }
    const scale = .48 + random() * 1.05;
    dummy.position.set(x, terrainY(x,z) + .035 + random() * .018, z);
    dummy.rotation.set(-Math.PI / 2 + (random() - .5) * .16, random() * Math.PI * 2, (random() - .5) * .12);
    dummy.scale.set(scale * (.72 + random() * .45),scale,scale); dummy.updateMatrix(); litter.setMatrixAt(i,dummy.matrix);
    const tint = litterPalette[Math.floor(random() * litterPalette.length)].clone().offsetHSL((random() - .5) * .025,0,(random() - .5) * .06);
    litter.setColorAt(i,tint);
  }
  litter.instanceMatrix.needsUpdate = true; if (litter.instanceColor) litter.instanceColor.needsUpdate = true; litter.receiveShadow = true; scene.add(litter);
  for (let i = 0; i < 12; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(.24 + random() * .18, .34 + random() * .2, 3 + random() * 3, 12), barkMaterial);
    let x = randomWorldX(), z = randomWorldZ();
    while (containsLakeWater(x, z, -2) || insideSubwayStairClearance(x, z)) { x = randomWorldX(); z = randomWorldZ(); }
    log.rotation.set(Math.PI / 2 + (random() - .5) * .15, random() * Math.PI, 0); log.position.set(x, terrainY(x, z) + .3, z); log.castShadow = log.receiveShadow = true; scene.add(log);
  }
  return { trees, branchRoutes, branchNodes, canopyCorridors, canopyNetworkStats };
}

function archedBridgeGeometry(length: number, width: number, segments = 36) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const amount = index / segments, x = (amount - .5) * length;
    const top = .38 + Math.sin(amount * Math.PI) * 1.2, bottom = top - .5;
    positions.push(x, top, -width / 2, x, top, width / 2, x, bottom, -width / 2, x, bottom, width / 2);
    uvs.push(amount * 8, 0, amount * 8, 1, amount * 8, 0, amount * 8, 1);
    if (index < segments) {
      const offset = index * 4, next = offset + 4;
      indices.push(offset, next, offset + 1, offset + 1, next, next + 1);
      indices.push(offset + 2, offset + 3, next + 2, offset + 3, next + 3, next + 2);
      indices.push(offset, offset + 2, next, offset + 2, next + 2, next);
      indices.push(offset + 1, next + 1, offset + 3, offset + 3, next + 1, next + 3);
    }
  }
  indices.push(0, 1, 2, 1, 3, 2);
  const last = segments * 4; indices.push(last, last + 2, last + 1, last + 1, last + 2, last + 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function addLandmarks(scene: THREE.Scene, textures: GameTextures, trailCurve: THREE.CatmullRomCurve3) {
  const obstacles: WorldObstacle[] = [];
  const stoneMaterial = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .07, color: "#b9ad92", roughness: .82 });
  const iron = new THREE.MeshStandardMaterial({ color: "#17221d", roughness: .35, metalness: .78 });
  const bridgeWood = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .045, color: "#8b765b", roughness: .9 });
  const bridge = new THREE.Group();
  const bridgeLength = 24, bridgeWidth = 5.2, bridgeSegments = 36;
  const deck = new THREE.Mesh(archedBridgeGeometry(bridgeLength, bridgeWidth, bridgeSegments), bridgeWood); deck.castShadow = deck.receiveShadow = true; bridge.add(deck);
  const bridgePostGeometry = new THREE.CylinderGeometry(.075, .095, 1, 10, 2);
  const postCount = 13, bridgePosts = new THREE.InstancedMesh(bridgePostGeometry, iron, postCount * 2);
  const braceGeometry = new THREE.CylinderGeometry(.042, .042, 1, 8, 1), braces = new THREE.InstancedMesh(braceGeometry, iron, (postCount - 1) * 2);
  const bridgeDummy = new THREE.Object3D(), postStart = new THREE.Vector3(), postEnd = new THREE.Vector3();
  for (const side of [-1, 1]) for (let index = 0; index < postCount; index++) {
    const amount = index / (postCount - 1), x = (amount - .5) * bridgeLength * .92;
    const deckY = .38 + Math.sin(amount * Math.PI) * 1.2;
    postStart.set(x, deckY, side * bridgeWidth * .48); postEnd.set(x, deckY + 1.35, side * bridgeWidth * .48);
    alignCylinder(bridgeDummy, postStart, postEnd, 1); bridgePosts.setMatrixAt((side === -1 ? 0 : postCount) + index, bridgeDummy.matrix);
    if (index < postCount - 1) {
      const nextAmount = (index + 1) / (postCount - 1), nextX = (nextAmount - .5) * bridgeLength * .92;
      const nextY = .38 + Math.sin(nextAmount * Math.PI) * 1.2;
      postStart.set(x, deckY + .22, side * bridgeWidth * .48); postEnd.set(nextX, nextY + 1.08, side * bridgeWidth * .48);
      alignCylinder(bridgeDummy, postStart, postEnd, 1); braces.setMatrixAt((side === -1 ? 0 : postCount - 1) + index, bridgeDummy.matrix);
    }
  }
  bridgePosts.instanceMatrix.needsUpdate = braces.instanceMatrix.needsUpdate = true; bridgePosts.castShadow = braces.castShadow = true; bridge.add(bridgePosts, braces);
  for (const side of [-1, 1]) {
    const railPoints = Array.from({ length: 25 }, (_, index) => {
      const amount = index / 24;
      return new THREE.Vector3((amount - .5) * bridgeLength * .92, 1.73 + Math.sin(amount * Math.PI) * 1.2, side * bridgeWidth * .48);
    });
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints), 48, .085, 8, false), iron); rail.castShadow = true; bridge.add(rail);
    const stoneArch = new THREE.Mesh(new THREE.TorusGeometry(1, .075, 12, 48, Math.PI), stoneMaterial); stoneArch.position.set(0, -.13, side * bridgeWidth * .5); stoneArch.scale.set(6.3, 1.45, 1); stoneArch.castShadow = true; bridge.add(stoneArch);
  }
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const pier = new THREE.Mesh(new RoundedBoxGeometry(1.75, 2.8, 1.75, 4, .16), stoneMaterial);
    pier.position.set(end * bridgeLength * .47, .58, side * bridgeWidth * .49); pier.castShadow = pier.receiveShadow = true; bridge.add(pier);
  }
  const bridgePoint = trailCurve.getPoint(.5), bridgeTangent = trailCurve.getTangent(.5).normalize();
  const bridgeYaw = Math.atan2(-bridgeTangent.z, bridgeTangent.x);
  bridge.position.copy(bridgePoint); bridge.position.y = terrainY(bridgePoint.x, bridgePoint.z) + .06; bridge.rotation.y = bridgeYaw; bridge.updateMatrixWorld(true); scene.add(bridge);
  const bridgeSurface: BridgeSurface = { x: bridge.position.x, z: bridge.position.z, y: bridge.position.y + .38, yaw: bridgeYaw, length: bridgeLength, width: bridgeWidth, archHeight: 1.2 };
  for (const side of [-1, 1]) for (const end of [-1, 1]) {
    const world = bridge.localToWorld(new THREE.Vector3(end * bridgeLength * .47, 0, side * bridgeWidth * .49));
    obstacles.push({ id: `bridge-pier-${end}-${side}`, kind: "circle", x: world.x, z: world.z, radius: 1.08, minY: bridge.position.y - .45, maxY: bridge.position.y + 2.1 });
  }

  for (let i = 0; i < 18; i++) {
    const point = trailCurve.getPoint(i / 17), side = i % 2 ? 3.15 : -3.15;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.065, .105, 4, 12), iron); pole.position.set(point.x, point.y + 2, point.z + side); pole.castShadow = true; scene.add(pole);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), new THREE.MeshStandardMaterial({ color: "#f6dc9b", emissive: "#ffcb6b", emissiveIntensity: 1.8, roughness: .18 })); lantern.position.copy(pole.position).add(new THREE.Vector3(0, 2, 0)); scene.add(lantern);
  }
  return { obstacles, bridgeSurface };
}

function createHawk() {
  const hawk = new THREE.Group(), wings: THREE.Group[] = [];
  const upper = new THREE.MeshStandardMaterial({ color: "#3a2a1e", roughness: .88, side: THREE.DoubleSide });
  const darkFeather = new THREE.MeshStandardMaterial({ color: "#211915", roughness: .92, side: THREE.DoubleSide });
  const chest = new THREE.MeshStandardMaterial({ color: "#8b6a45", roughness: .9 });
  const tailColor = new THREE.MeshStandardMaterial({ color: "#8f3f25", roughness: .9, side: THREE.DoubleSide });
  const beakMaterial = new THREE.MeshStandardMaterial({ color: "#d3a34e", roughness: .62 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), upper); body.scale.set(.38, .34, 1.08); body.position.z = .02; body.castShadow = true; hawk.add(body);
  const breast = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), chest); breast.scale.set(.31, .275, .7); breast.position.set(0, -.16, -.18); hawk.add(breast);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, 20, 14), upper); head.scale.set(1, .88, 1.08); head.position.set(0, .06, -1.02); head.castShadow = true; hawk.add(head);
  const brow = new THREE.Mesh(new THREE.SphereGeometry(.18, 16, 10), darkFeather); brow.scale.set(1.25, .42, .78); brow.position.set(0, .19, -1.19); hawk.add(brow);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.12, .34, 12), beakMaterial); beak.rotation.x = -Math.PI / 2; beak.position.set(0, -.015, -1.34); hawk.add(beak);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: "#f2bd43" }), pupilMaterial = new THREE.MeshBasicMaterial({ color: "#050403" });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.042, 10, 8), eyeMaterial); eye.position.set(side * .205, .09, -1.23); hawk.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(.024, 8, 6), pupilMaterial); pupil.position.set(side * .225, .09, -1.258); hawk.add(pupil);
  }

  const tailShape = new THREE.Shape();
  tailShape.moveTo(-.26, .05); tailShape.lineTo(-.62, -1.45); tailShape.lineTo(-.18, -1.27); tailShape.lineTo(0, -1.62); tailShape.lineTo(.18, -1.27); tailShape.lineTo(.62, -1.45); tailShape.lineTo(.26, .05); tailShape.closePath();
  const tail = new THREE.Mesh(new THREE.ShapeGeometry(tailShape, 8), tailColor); tail.rotation.x = -Math.PI / 2; tail.position.set(0, -.025, .8); tail.castShadow = true; hawk.add(tail);

  for (const side of [-1, 1]) {
    const wingRoot = new THREE.Group(); wingRoot.scale.x = side; wingRoot.userData.side = side;
    const wingShape = new THREE.Shape();
    wingShape.moveTo(.05, .04);
    wingShape.bezierCurveTo(.8, -.22, 2.15, -.48, 4.25, -.72);
    wingShape.lineTo(3.72, -.36); wingShape.lineTo(4.12, -.18); wingShape.lineTo(3.48, -.04);
    wingShape.lineTo(3.86, .18); wingShape.lineTo(3.12, .2); wingShape.lineTo(3.38, .46);
    wingShape.lineTo(2.55, .37); wingShape.lineTo(2.68, .67);
    wingShape.bezierCurveTo(1.55, .48, .68, .3, .05, .04); wingShape.closePath();
    const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape, 12), darkFeather); wing.rotation.x = -Math.PI / 2; wing.castShadow = true; wingRoot.add(wing);
    const covert = new THREE.Mesh(new THREE.SphereGeometry(1, 18, 10), upper); covert.scale.set(1.5, .11, .48); covert.position.set(1.18, .045, .02); covert.rotation.y = -.12; covert.castShadow = true; wingRoot.add(covert);
    hawk.add(wingRoot); wings.push(wingRoot);
  }
  hawk.scale.setScalar(.82); return { hawk, wings };
}

function addSky(scene: THREE.Scene) {
  const sky = new Sky();
  // The playable park is larger than the original fixed 450 m sky dome. Once
  // the player crossed The Lake the camera could leave that sphere, exposing a
  // hard bright/dark hemisphere seam. Keep the atmospheric dome centered on
  // the active camera so every streamed corner of the park shares one sky.
  sky.scale.setScalar(760);
  sky.frustumCulled = false;
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld(true);
  };
  scene.add(sky);
  sky.material.uniforms.turbidity.value = 7.4; sky.material.uniforms.rayleigh.value = 2.05;
  sky.material.uniforms.mieCoefficient.value = .009; sky.material.uniforms.mieDirectionalG.value = .86;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(86), THREE.MathUtils.degToRad(224));
  sky.material.uniforms.sunPosition.value.copy(sun);
}

function ellipseDiscGeometry(radiusX: number, radiusZ: number, segments = 160) {
  const positions: number[] = [0, 0, 0], uvs: number[] = [.5, .5], indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const angle = index / segments * Math.PI * 2;
    positions.push(Math.cos(angle) * radiusX, 0, Math.sin(angle) * radiusZ);
    uvs.push(.5 + Math.cos(angle) * .5, .5 + Math.sin(angle) * .5);
    if (index < segments) indices.push(0, index + 2, index + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function irregularShoreGeometry(radiusX: number, radiusZ: number, width: number, segments = 160) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const amount = index / segments, angle = amount * Math.PI * 2;
    const ripple = Math.sin(angle * 5 + .7) * .65 + Math.sin(angle * 11 - .4) * .32 + Math.sin(angle * 19) * .16;
    for (const outer of [false, true]) {
      const offset = ripple + (outer ? width + Math.sin(angle * 7) * .42 : 0);
      positions.push(Math.cos(angle) * (radiusX + offset), 0, Math.sin(angle) * (radiusZ + offset * .76));
      uvs.push(amount * 28, outer ? 1 : 0);
    }
    if (index < segments) { const base = index * 2; indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function waterRibbonGeometry(points: readonly THREE.Vector3[], halfWidth: number, segmentsPerSpan = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => point.clone()), false, "centripetal");
  const segments = Math.max(8, (points.length - 1) * segmentsPerSpan), positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const amount = index / segments, point = curve.getPoint(amount), tangent = curve.getTangent(amount).setY(0).normalize();
    const sideX = -tangent.z, sideZ = tangent.x;
    const edgeNoise = Math.sin(amount * Math.PI * 9) * .35 + Math.sin(amount * Math.PI * 17) * .12;
    for (const side of [-1, 1]) {
      positions.push(point.x + sideX * (halfWidth + edgeNoise) * side, 0, point.z + sideZ * (halfWidth + edgeNoise) * side);
      uvs.push((side + 1) / 2, amount * 12);
    }
    if (index < segments) { const base = index * 2; indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function addLakeDocks(scene: THREE.Scene, textures: GameTextures, quality: number) {
  const dockWood = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .055, color: "#ad9574", roughness: .9 });
  const dockIron = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .025, color: "#515b56", metalness: .68, roughness: .42 });
  const buildDock = (name: string, land: THREE.Vector3, water: THREE.Vector3, width: number) => {
    const dock = new THREE.Group(); dock.name = name;
    const dx = water.x - land.x, dz = water.z - land.z, length = Math.hypot(dx, dz), plankCount = Math.max(7, Math.ceil(length / .42));
    const yaw = Math.atan2(dx, dz), definition = { land, water, width } satisfies LakeDockDefinition;
    const waterY = dockTopAt(definition, 1);
    const plankGeometry = new RoundedBoxGeometry(width, .105, .38, quality > .72 ? 3 : 2, .026);
    const planks = new THREE.InstancedMesh(plankGeometry, dockWood, plankCount), dummy = new THREE.Object3D();
    for (let index = 0; index < plankCount; index++) {
      const amount = (index + .5) / plankCount;
      dummy.position.lerpVectors(land, water, amount); dummy.position.y = dockTopAt(definition, amount) - .0525;
      dummy.rotation.set(0, yaw, 0); dummy.updateMatrix(); planks.setMatrixAt(index, dummy.matrix);
    }
    planks.instanceMatrix.needsUpdate = true; planks.castShadow = planks.receiveShadow = true; dock.add(planks);
    const pilingCount = Math.max(4, Math.ceil(length / 5) * 2), pilingGeometry = new THREE.CylinderGeometry(.12, .17, 2.8, quality > .72 ? 14 : 9);
    const pilings = new THREE.InstancedMesh(pilingGeometry, dockWood, pilingCount);
    for (let index = 0; index < pilingCount / 2; index++) for (const side of [-1, 1]) {
      const amount = (index + .35) / Math.max(1, pilingCount / 2 - .3), center = land.clone().lerp(water, amount);
      const sideX = Math.cos(yaw) * width * .48, sideZ = -Math.sin(yaw) * width * .48;
      dummy.position.set(center.x + sideX * side, THE_LAKE_SURFACE_Y - .72, center.z + sideZ * side); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pilings.setMatrixAt(index * 2 + (side < 0 ? 0 : 1), dummy.matrix);
    }
    pilings.instanceMatrix.needsUpdate = true; pilings.castShadow = true; dock.add(pilings);
    for (const side of [-1, 1]) {
      const cleat = new THREE.Mesh(new THREE.TorusGeometry(.12, .025, 8, 20, Math.PI), dockIron);
      cleat.name = "bronze-mooring-cleat"; cleat.position.copy(water); cleat.position.y = waterY + .11; cleat.rotation.set(Math.PI / 2, yaw, side < 0 ? 0 : Math.PI); cleat.position.x += Math.cos(yaw) * width * .31 * side; cleat.position.z -= Math.sin(yaw) * width * .31 * side; dock.add(cleat);
    }
    scene.add(dock); return dock;
  };
  return {
    bow: buildDock("bow-bridge-rowboat-pier", LAKE_DOCK_DEFINITIONS[0].land, LAKE_DOCK_DEFINITIONS[0].water, LAKE_DOCK_DEFINITIONS[0].width),
    island: buildDock("ticket-island-stone-and-timber-landing", LAKE_DOCK_DEFINITIONS[1].land, LAKE_DOCK_DEFINITIONS[1].water, LAKE_DOCK_DEFINITIONS[1].width),
    southeast: buildDock("southeast-lake-zoo-route-pier", LAKE_DOCK_DEFINITIONS[2].land, LAKE_DOCK_DEFINITIONS[2].water, LAKE_DOCK_DEFINITIONS[2].width),
  };
}

function createTicketIsland(scene: THREE.Scene, textures: GameTextures, quality: number) {
  const island = new THREE.Group(); island.name = "central-zoo-ticket-island"; island.position.set(TICKET_ISLAND_TARGET.x, THE_LAKE_SURFACE_Y, TICKET_ISLAND_TARGET.z);
  const stone = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .1, color: "#9b9a83", roughness: .96 });
  const soil = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .12, color: "#b5a789", roughness: .98 });
  const bark = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .08, color: "#b6a58e", roughness: .95 });
  const foliage = new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .34, side: THREE.DoubleSide, color: "#d5ddc2", roughness: .82 });
  const foundation = new THREE.Mesh(new THREE.CylinderGeometry(TICKET_ISLAND_RADIUS * .82, TICKET_ISLAND_RADIUS * 1.08, 1.55, quality > .72 ? 64 : 36, 4), stone);
  foundation.name = "ticket-island-rock-shelf"; foundation.position.y = .52; foundation.scale.z = .88; foundation.castShadow = foundation.receiveShadow = true; island.add(foundation);
  const top = new THREE.Mesh(new THREE.CircleGeometry(TICKET_ISLAND_RADIUS * .93, quality > .72 ? 64 : 36), soil);
  top.name = "ticket-island-dry-ground"; top.rotation.x = -Math.PI / 2; top.position.y = 1.32; top.scale.y = .88; top.receiveShadow = true; island.add(top);

  const random = seeded(0x7151a), treeCount = quality > .72 ? 8 : 5;
  for (let index = 0; index < treeCount; index++) {
    const angle = index / treeCount * Math.PI * 2 + .35, radius = 5.8 + random() * 2.2;
    if (Math.abs(Math.sin(angle)) > .86 && Math.cos(angle) > 0) continue;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .34, 4.8 + random() * 2.2, quality > .72 ? 14 : 9, 4), bark);
    trunk.name = "ticket-island-sycamore"; trunk.position.set(Math.cos(angle) * radius, 3.55, Math.sin(angle) * radius * .82); trunk.rotation.z = (random() - .5) * .08; trunk.castShadow = true; island.add(trunk);
    for (let card = 0; card < 4; card++) {
      const crown = new THREE.Mesh(new THREE.PlaneGeometry(4.4 + random() * 1.4, 2.5 + random()), foliage);
      crown.name = "ticket-island-textured-canopy"; crown.position.copy(trunk.position).add(new THREE.Vector3((random() - .5) * 1.8, 2.1 + random() * 1.1, (random() - .5) * 1.8)); crown.rotation.y = card * Math.PI / 4; crown.castShadow = quality > .9; island.add(crown);
    }
  }

  const stand = new THREE.Group(); stand.name = "zoo-ticket-interpretive-stand"; stand.position.set(0, 1.35, 0);
  const pedestal = new THREE.Mesh(new RoundedBoxGeometry(1.55, 1.12, .86, 6, .1), stone); pedestal.position.y = .56; pedestal.castShadow = pedestal.receiveShadow = true; stand.add(pedestal);
  const ticket = new THREE.Group(); ticket.name = "collectible-central-park-zoo-ticket"; ticket.position.set(0, 1.28, -.49); ticket.rotation.x = -.18;
  const ticketMaterial = new THREE.MeshStandardMaterial({ color: "#eee1bd", roughness: .58, side: THREE.DoubleSide, emissive: "#5f6d3e", emissiveIntensity: .08 });
  const ticketBacking = new THREE.Mesh(new RoundedBoxGeometry(1.58, .055, .88, 5, .045), stone); ticketBacking.name = "zoo-ticket-brass-edged-backing"; ticketBacking.castShadow = true; ticket.add(ticketBacking);
  const ticketCard = new THREE.Mesh(new THREE.PlaneGeometry(1.46, .77), ticketMaterial); ticketCard.name = "imagegen-zoo-admission-ticket"; ticketCard.rotation.x = -Math.PI / 2; ticketCard.position.y = .031; ticketCard.renderOrder = 3; ticket.add(ticketCard);
  if (typeof document !== "undefined") new THREE.TextureLoader().load("/game/props/central-park-zoo-island-ticket.webp", (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = quality > .72 ? 8 : 4; ticketMaterial.map = texture; ticketMaterial.color.set("#ffffff"); ticketMaterial.needsUpdate = true;
  });
  const glow = new THREE.Mesh(new THREE.TorusGeometry(.94, .035, 10, 56), new THREE.MeshBasicMaterial({ color: "#d9ef8b", transparent: true, opacity: .62, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.name = "ticket-quest-glow"; glow.rotation.x = Math.PI / 2; glow.position.y = .08; ticket.add(glow); stand.add(ticket); island.add(stand);
  scene.add(island);
  return { island, ticket };
}

function addLakeEcology(scene: THREE.Scene, textures: GameTextures, quality: number, lake: THREE.Mesh) {
  const random = seeded(0x1a6e), dummy = new THREE.Object3D();
  const shorePlantCount = Math.round(260 + quality * 320);
  const shoreCard = new THREE.PlaneGeometry(1, 1, 2, 2);
  const shorePlants = new THREE.InstancedMesh(shoreCard, new THREE.MeshStandardMaterial({
    map: textures.fern, alphaMap: textures.fern, alphaTest: .3, side: THREE.DoubleSide, color: "#8c9d64", roughness: .9,
  }), shorePlantCount * 2);
  for (let index = 0; index < shorePlantCount; index++) {
    const angle = random() * Math.PI * 2;
    const offset = -1 + random() * 5.2, x = lake.position.x + Math.cos(angle) * (THE_LAKE_RADII.x + offset), z = lake.position.z + Math.sin(angle) * (THE_LAKE_RADII.y + offset * .72);
    if ([BOW_BRIDGE_BOAT_DOCK, LAKE_SOUTHEAST_BOAT_DOCK].some((dock) => Math.hypot(x - dock.x, z - dock.z) < 12)) { index--; continue; }
    const scale = .55 + random() * 1.05, y = Math.max(lake.position.y - .12, terrainY(x, z)) + scale * .46;
    for (let card = 0; card < 2; card++) {
      dummy.position.set(x, y, z); dummy.rotation.set(0, angle + card * Math.PI / 2, (random() - .5) * .1);
      dummy.scale.set(scale * (.62 + random() * .28), scale, 1); dummy.updateMatrix(); shorePlants.setMatrixAt(index * 2 + card, dummy.matrix);
    }
  }
  shorePlants.instanceMatrix.needsUpdate = true; shorePlants.name = "the-lake-instanced-shore-vegetation"; scene.add(shorePlants);

  const lilyCount = Math.round(75 + quality * 105);
  const lilyGeometry = new THREE.CircleGeometry(.44, quality > .8 ? 16 : 10);
  const lilyMaterial = new THREE.MeshStandardMaterial({ map: textures.foliage, color: "#718d55", roughness: .76, side: THREE.DoubleSide });
  const lilies = new THREE.InstancedMesh(lilyGeometry, lilyMaterial, lilyCount);
  const lilyTint = new THREE.Color();
  for (let index = 0; index < lilyCount; index++) {
    const angle = random() * Math.PI * 2, radius = .16 + Math.sqrt(random()) * .8;
    const x = lake.position.x + Math.cos(angle) * THE_LAKE_RADII.x * radius, z = lake.position.z + Math.sin(angle) * THE_LAKE_RADII.y * radius;
    if (!containsLakeWater(x, z, 2.4)) { index--; continue; }
    dummy.position.set(x, lake.position.y + .025 + random() * .012, z);
    dummy.rotation.set(-Math.PI / 2, random() * Math.PI * 2, 0); const scale = .48 + random() * .72; dummy.scale.set(scale * (1 + random() * .3), scale, scale); dummy.updateMatrix(); lilies.setMatrixAt(index, dummy.matrix);
    lilyTint.setHSL(.24 + random() * .035, .29 + random() * .12, .36 + random() * .12); lilies.setColorAt(index, lilyTint);
  }
  lilies.instanceMatrix.needsUpdate = true; if (lilies.instanceColor) lilies.instanceColor.needsUpdate = true; lilies.name = "the-lake-lily-pads"; scene.add(lilies);

  const stoneCount = Math.round(70 + quality * 95);
  const shoreStones = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.58, 1), new THREE.MeshStandardMaterial({
    map: textures.stone, bumpMap: textures.stone, bumpScale: .08, color: "#777b6c", roughness: .96,
  }), stoneCount);
  for (let index = 0; index < stoneCount; index++) {
    const angle = random() * Math.PI * 2, offset = 1 + random() * 4.2, scale = .35 + random() * .75;
    const x = lake.position.x + Math.cos(angle) * (THE_LAKE_RADII.x + offset), z = lake.position.z + Math.sin(angle) * (THE_LAKE_RADII.y + offset * .74);
    dummy.position.set(x, Math.max(lake.position.y - .18, terrainY(x, z)) + scale * .18, z); dummy.rotation.set(random(), angle, random()); dummy.scale.set(scale, scale * (.38 + random() * .3), scale); dummy.updateMatrix(); shoreStones.setMatrixAt(index, dummy.matrix);
  }
  shoreStones.instanceMatrix.needsUpdate = true; shoreStones.castShadow = shoreStones.receiveShadow = true; shoreStones.name = "the-lake-shore-boulders"; scene.add(shoreStones);

  // A dense perimeter canopy extends the Ramble around the enlarged shore in
  // three draw calls. This adds hundreds of textured trees without turning
  // the mobile tier into hundreds of individual scene objects.
  const rimTreeCount = Math.round(150 + quality * 230), trunkGeometry = new THREE.CylinderGeometry(.18, .62, 1, quality > .72 ? 12 : 8, 4);
  const barkMaterial = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .09, color: "#b1a18b", roughness: .96 });
  const rimTrunks = new THREE.InstancedMesh(trunkGeometry, barkMaterial, rimTreeCount);
  const crownGeometry = new THREE.PlaneGeometry(1, 1, 2, 2), crownMaterial = new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .35, side: THREE.DoubleSide, color: "#d2dbc0", roughness: .82 });
  const rimCrowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, rimTreeCount * 4), crownTint = new THREE.Color();
  let placed = 0, attempts = 0;
  while (placed < rimTreeCount && attempts++ < rimTreeCount * 30) {
    const angle = random() * Math.PI * 2, offset = 16 + random() * 28;
    const x = lake.position.x + Math.cos(angle) * (THE_LAKE_RADII.x + offset), z = lake.position.z + Math.sin(angle) * (THE_LAKE_RADII.y + offset);
    if (containsLakeWater(x, z, -8)) continue;
    if ([BOW_BRIDGE_BOAT_DOCK, LAKE_SOUTHEAST_SHORE_LANDING].some((dock) => Math.hypot(x - dock.x, z - dock.z) < 18)) continue;
    const height = 8 + random() * 7, radius = .36 + random() * .35, baseY = terrainY(x, z);
    dummy.position.set(x, baseY + height * .42, z); dummy.rotation.set(0, random() * Math.PI * 2, (random() - .5) * .025); dummy.scale.set(radius, height * .84, radius); dummy.updateMatrix(); rimTrunks.setMatrixAt(placed, dummy.matrix);
    for (let card = 0; card < 4; card++) {
      const crownIndex = placed * 4 + card, scale = 4.2 + random() * 2.8;
      dummy.position.set(x + (random() - .5) * 2.3, baseY + height * (.72 + random() * .2), z + (random() - .5) * 2.3); dummy.rotation.set((random() - .5) * .14, card * Math.PI / 4 + random() * .3, 0); dummy.scale.set(scale, scale * (.48 + random() * .15), 1); dummy.updateMatrix(); rimCrowns.setMatrixAt(crownIndex, dummy.matrix);
      crownTint.setHSL(.24 + (random() - .5) * .035, .22 + random() * .14, .7 + random() * .14); rimCrowns.setColorAt(crownIndex, crownTint);
    }
    placed++;
  }
  rimTrunks.count = placed; rimCrowns.count = placed * 4; rimTrunks.instanceMatrix.needsUpdate = rimCrowns.instanceMatrix.needsUpdate = true; if (rimCrowns.instanceColor) rimCrowns.instanceColor.needsUpdate = true;
  rimTrunks.castShadow = rimTrunks.receiveShadow = true; rimCrowns.castShadow = quality > .94; rimTrunks.name = "the-lake-instanced-rim-trunks"; rimCrowns.name = "the-lake-instanced-rim-canopies"; scene.add(rimTrunks, rimCrowns);
}

export function buildRealisticWorld(scene: THREE.Scene, textures: GameTextures, quality: number): RealisticWorld {
  addSky(scene);
  // Shorelines need enough tessellation to agree with the analytic movement
  // surface on mobile. The non-uniform grid also inserts exact stairwell
  // boundaries, then omits those cells so the exterior station is excavated.
  const terrainSegments = quality > .72 ? 248 : 184;
  const terrain = terrainGeometryWithSubwayCutout(820, 820, terrainSegments, 80, -140);
  const groundMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .14, color: "#d0c6b5", roughness: .95, metalness: 0 });
  const ground = new THREE.Mesh(terrain, groundMaterial); ground.receiveShadow = true; scene.add(ground);

  const trailPoints = [new THREE.Vector3(-50, 0, 62), new THREE.Vector3(-28, 0, 35), new THREE.Vector3(-4, 0, 18), new THREE.Vector3(18, 0, -4), new THREE.Vector3(12, 0, -34), new THREE.Vector3(-8, 0, -62), new THREE.Vector3(-10, 0, -82)];
  for (const point of trailPoints) point.y = terrainY(point.x, point.z) + .06;
  const trailCurve = new THREE.CatmullRomCurve3(trailPoints);
  const trail = new THREE.Mesh(trailRibbon(trailCurve), new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .09, color: "#a59678", roughness: .98 })); trail.receiveShadow = true; scene.add(trail);

  const { trees, branchRoutes: branches, branchNodes, canopyCorridors, canopyNetworkStats } = addTrees(scene, textures, quality, trailCurve);
  const { obstacles, bridgeSurface } = addLandmarks(scene, textures, trailCurve);
  const lakeMaterial = new THREE.MeshPhysicalMaterial({ color: "#315d58", normalMap: textures.waterNormal, normalScale: new THREE.Vector2(.38, .38), roughness: .12, metalness: .06, transmission: .12, transparent: true, opacity: .91, clearcoat: .86, clearcoatRoughness: .13, envMapIntensity: 1.6, side: THREE.DoubleSide });
  const waterSegments = quality > .72 ? 192 : 112;
  const lake = new THREE.Mesh(ellipseDiscGeometry(THE_LAKE_RADII.x, THE_LAKE_RADII.y, waterSegments), lakeMaterial); lake.name = "the-lake-playable-water"; lake.position.set(THE_LAKE_CENTER.x, THE_LAKE_SURFACE_Y, THE_LAKE_CENTER.z); lake.receiveShadow = true; lake.renderOrder = 1; scene.add(lake);
  const shoreMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .1, color: "#545a42", roughness: 1 });
  const shore = new THREE.Mesh(irregularShoreGeometry(THE_LAKE_RADII.x - .2, THE_LAKE_RADII.y - .15, 5.8, waterSegments), shoreMaterial); shore.name = "the-lake-irregular-bank"; shore.position.copy(lake.position).add(new THREE.Vector3(0, -.055, 0)); shore.receiveShadow = true; scene.add(shore);
  const inletBank = new THREE.Mesh(waterRibbonGeometry(LAKE_INLET_CENTERLINE, 17.4), shoreMaterial); inletBank.name = "bow-bridge-inlet-textured-bank"; inletBank.position.y = THE_LAKE_SURFACE_Y - .06; inletBank.receiveShadow = true; scene.add(inletBank);
  const lakeInlet = new THREE.Mesh(waterRibbonGeometry(LAKE_INLET_CENTERLINE, 11.65, quality > .72 ? 12 : 7), lakeMaterial); lakeInlet.name = "bow-bridge-playable-water-inlet"; lakeInlet.position.y = THE_LAKE_SURFACE_Y; lakeInlet.receiveShadow = true; lakeInlet.renderOrder = 1; scene.add(lakeInlet);
  addLakeEcology(scene, textures, quality, lake);
  addLakeDocks(scene, textures, quality);
  const { island: ticketIsland, ticket } = createTicketIsland(scene, textures, quality);
  const ticketTarget = new THREE.Vector3(TICKET_ISLAND_TARGET.x, THE_LAKE_SURFACE_Y + 2.63, TICKET_ISLAND_TARGET.z);
  ticket.userData.anchorY = ticket.position.y;

  const rowboatSpawns: RowboatSpawn[] = [
    { position: new THREE.Vector3(-23.8, THE_LAKE_SURFACE_Y - .04, -134.7), rotationY: .08, boatNumber: 5, name: "Bow Bridge checkpoint rowboat 5" },
    { position: new THREE.Vector3(-20.1, THE_LAKE_SURFACE_Y - .04, -138.2), rotationY: -.18, boatNumber: 7, name: "Bow Bridge rowboat 7" },
    { position: new THREE.Vector3(-17.15, THE_LAKE_SURFACE_Y - .04, -140.4), rotationY: -.28, boatNumber: 12, name: "Bow Bridge rowboat 12" },
    { position: new THREE.Vector3(190.2, THE_LAKE_SURFACE_Y - .04, -293.2), rotationY: 2.36, boatNumber: 18, name: "Southeast shore rowboat 18" },
    { position: new THREE.Vector3(194.7, THE_LAKE_SURFACE_Y - .04, -295.8), rotationY: 2.48, boatNumber: 23, name: "Southeast shore rowboat 23" },
  ];

  const buds: THREE.Group[] = [], rings: THREE.Mesh[] = [];
  const budMaterial = new THREE.MeshPhysicalMaterial({ color: "#9ec55c", roughness: .65, clearcoat: .12 });
  const budPlacements = BUDS.map((point) => point.clone());
  for (const index of [2, 4]) {
    const point = budPlacements[index];
    const hostTree = trees.reduce((nearest, tree) => Math.hypot(point.x - tree.x, point.z - tree.z) < Math.hypot(point.x - nearest.x, point.z - nearest.z) ? tree : nearest, trees[0]);
    const outward = Math.atan2(point.z - hostTree.z, point.x - hostTree.x);
    point.set(hostTree.x + Math.cos(outward) * (hostTree.radius + .72), hostTree.canopyY + .18, hostTree.z + Math.sin(outward) * (hostTree.radius + .72));
  }
  budPlacements.forEach((point, index) => {
    if (point.y === 0) point.y = terrainY(point.x, point.z) + 1;
    const group = new THREE.Group();
    for (let j = 0; j < 5; j++) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 9), budMaterial); leaf.scale.set(.48, 1, .24); leaf.rotation.z = j * 1.26; leaf.position.set(Math.cos(j * 1.25) * .24, Math.sin(j * .8) * .1, Math.sin(j * 1.25) * .24); group.add(leaf); }
    group.position.copy(point); group.userData.index = index; group.userData.anchorY = point.y; scene.add(group); buds.push(group);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, .028, 8, 48), new THREE.MeshBasicMaterial({ color: "#d9ef8b", transparent: true, opacity: 0 })); ring.rotation.x = Math.PI / 2; ring.position.copy(point).add(new THREE.Vector3(0, .2, 0)); scene.add(ring); rings.push(ring);
  });

  const { hawk, wings: hawkWings } = createHawk(); scene.add(hawk);

  return {
    buds, rings, hawk, lake, lakeInlet, lakeRadius: LAKE_SWIM_RADIUS, boatRadius: LAKE_BOAT_RADIUS,
    lakeCenter: THE_LAKE_CENTER.clone(), lakeRadii: THE_LAKE_RADII.clone(), lakeSurfaceY: THE_LAKE_SURFACE_Y,
    rowboatSpawns, ticketIsland, ticket, ticketTarget,
    ticketIslandLanding: TICKET_ISLAND_LANDING_TARGET.clone().setY(terrainY(TICKET_ISLAND_LANDING_TARGET.x, TICKET_ISLAND_LANDING_TARGET.z)),
    ticketIslandBoatDock: TICKET_ISLAND_BOAT_DOCK.clone().setY(THE_LAKE_SURFACE_Y),
    bowBridgeBoatDock: BOW_BRIDGE_BOAT_DOCK.clone().setY(THE_LAKE_SURFACE_Y),
    bowBridgeShoreLanding: BOW_BRIDGE_SHORE_LANDING.clone().setY(terrainY(BOW_BRIDGE_SHORE_LANDING.x, BOW_BRIDGE_SHORE_LANDING.z)),
    southeastBoatDock: LAKE_SOUTHEAST_BOAT_DOCK.clone().setY(THE_LAKE_SURFACE_Y),
    southeastShoreLanding: LAKE_SOUTHEAST_SHORE_LANDING.clone().setY(terrainY(LAKE_SOUTHEAST_SHORE_LANDING.x, LAKE_SOUTHEAST_SHORE_LANDING.z)),
    trailCurve, trees, branches, branchNodes, canopyCorridors, canopyNetworkStats, obstacles, bridgeSurface,
    containsLakePoint: containsLakeWater,
    setTicketCollected(collected) { ticket.visible = !collected; },
    animate(time, player, scent, collected) {
      textures.waterNormal.offset.set(time * .008, time * -.011);
      hawk.position.set(player.x + Math.cos(time * .42) * 24, 18 + Math.sin(time * .7) * 2, player.z + Math.sin(time * .42) * 24);
      hawk.rotation.set(0, Math.PI - time * .42, Math.sin(time * .42) * .06);
      const flap = .025 + Math.sin(time * 3.1) * .09;
      hawkWings.forEach((wing) => { wing.rotation.z = wing.userData.side * flap; });
      buds.forEach((bud, index) => { if (!bud.visible) return; bud.rotation.y += .008; bud.position.y = bud.userData.anchorY + Math.sin(time * 2 + index) * .1; });
      rings.forEach((ring, index) => { (ring.material as THREE.MeshBasicMaterial).opacity = scent && !collected.has(index) ? .48 : 0; ring.scale.setScalar(1 + (time * .6 + index * .17) % 2.5); });
      if (ticket.visible) {
        ticket.position.y = ticket.userData.anchorY + Math.sin(time * 1.7) * .045;
        const glow = ticket.getObjectByName("ticket-quest-glow"); if (glow) { glow.rotation.z = time * .42; glow.scale.setScalar(1 + Math.sin(time * 2.1) * .08); }
      }
    },
  };
}
