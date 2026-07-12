import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

export const BUDS = [
  new THREE.Vector3(-12, 0, 14), new THREE.Vector3(17, 0, -4),
  new THREE.Vector3(18, 0, -20), new THREE.Vector3(-1, 0, -47),
  new THREE.Vector3(-24, 0, -58), new THREE.Vector3(-45, 0, -28),
];
export const START = new THREE.Vector3(-43, 0, 54);
export const GOAL = new THREE.Vector3(-10, 0, -78);

// Hand-authored crown lines give the procedural forest a legible aerial
// structure.  The junctions are deliberately shared so a sloth entering at
// the western start can reach every route without touching the ground.
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
] as const;

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
  trailCurve: THREE.CatmullRomCurve3;
  trees: ClimbableTree[];
  branches: BranchRoute[];
  branchNodes: BranchNode[];
  canopyCorridors: CanopyCorridor[];
  canopyNetworkStats: CanopyNetworkStats;
  obstacles: WorldObstacle[];
  bridgeSurface: BridgeSurface;
  animate(time: number, player: THREE.Vector3, scent: boolean, collected: Set<number>): void;
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value ^ (value >>> 15), 1 | value), value ^= value + Math.imul(value ^ (value >>> 7), 61 | value), ((value ^ (value >>> 14)) >>> 0) / 4294967296));
}

export function terrainY(x: number, z: number) {
  const roll = Math.sin(x * .037) * 1.5 + Math.cos(z * .042) * 1.1 + Math.sin((x + z) * .071) * .45;
  const lake = Math.max(0, 1 - Math.hypot(x - 34, z + 43) / 27) * 3.6;
  return roll - lake;
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
  const treeCount = Math.round(120 + 240 * THREE.MathUtils.clamp(quality, .45, 1));
  const trees: ClimbableTree[] = [];
  const branchRoutes: BranchRoute[] = [], branchNodes: BranchNode[] = [];
  const heroPositions: Array<[number, number]> = [];
  const heroPositionKeys = new Set<string>();
  for (const corridor of CANOPY_CORRIDOR_LAYOUT) for (const point of corridor.points) {
    const key = `${point[0]}:${point[1]}`;
    if (!heroPositionKeys.has(key)) { heroPositionKeys.add(key); heroPositions.push([point[0], point[1]]); }
  }
  const trailSamples = Array.from({ length: 81 }, (_, index) => trailCurve.getPoint(index / 80));
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
  let tree = 0, hero = 0, attempts = 0;
  while (tree < treeCount && attempts < treeCount * 80) {
    const forced = hero < heroPositions.length ? heroPositions[hero++] : undefined;
    const x = forced ? forced[0] : random() * 220 - 110, z = forced ? forced[1] : random() * 220 - 110;
    attempts++;
    const height = 8.5 + random() * 7.5, radius = .38 + random() * .34;
    const trailDistance = distanceToTrail(x, z, trailSamples);
    const blocked = Math.hypot(x - 34, z + 43) < 32 + radius
      || Math.hypot(x - START.x, z - START.z) < 9.5 + radius
      || Math.hypot(x - GOAL.x, z - GOAL.z) < 8 + radius
      || trailDistance < 3.15 + radius
      || Math.hypot(x, z) < 8
      || trees.some((other) => Math.hypot(x - other.x, z - other.z) < radius + other.radius + 1.55);
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
  const scatterCount = Math.round(360 * quality);
  const shrubs = new THREE.InstancedMesh(leafGeometry, shrubMaterial, scatterCount * 2);
  const fernMaterial = new THREE.MeshStandardMaterial({ map: textures.fern, alphaTest: .34, side: THREE.DoubleSide, roughness: .84, color: "#c5d0b2" });
  const fernCount = Math.round(720 * quality);
  const ferns = new THREE.InstancedMesh(leafGeometry, fernMaterial, fernCount * 2);
  const rockMaterial = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .1, color: "#777a69", roughness: .96 });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.55, 1), rockMaterial, Math.round(90 * quality));
  const understoryAnchors: Array<[number,number]> = [[-47,51],[-39,50],[-49,59],[-36,53],[-31,41],[-27,34],[-18,22],[-5,16],[10,4],[16,-11],[-1,-50],[-17,-60]];
  for (let i = 0; i < scatterCount; i++) {
    const anchor = understoryAnchors[i];
    const x = anchor ? anchor[0] : random() * 210 - 105, z = anchor ? anchor[1] : random() * 210 - 105, scale = anchor ? .78 + random() * .35 : .32 + random() * .66;
    const y = terrainY(x, z) + scale * .48, angle = random() * Math.PI;
    for (let card = 0; card < 2; card++) { dummy.position.set(x, y, z); dummy.rotation.set((random() - .5) * .16, angle + card * Math.PI / 2, 0); dummy.scale.set(scale, scale * (.7 + random() * .45), 1); dummy.updateMatrix(); shrubs.setMatrixAt(i * 2 + card, dummy.matrix); }
  }
  for (let i = 0; i < rocks.count; i++) {
    const x = random() * 200 - 100, z = random() * 200 - 100, scale = .35 + random() * 1.15;
    dummy.position.set(x, terrainY(x, z) + scale * .22, z); dummy.rotation.set(random(), random() * Math.PI, random()); dummy.scale.set(scale, scale * (.45 + random() * .32), scale); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  shrubs.instanceMatrix.needsUpdate = rocks.instanceMatrix.needsUpdate = true; rocks.castShadow = rocks.receiveShadow = true;
  for (let i = 0; i < fernCount; i++) {
    const anchor = understoryAnchors[i % understoryAnchors.length], clustered = i < understoryAnchors.length * 5;
    const x = clustered ? anchor[0] + (random() - .5) * 7 : random() * 205 - 102.5, z = clustered ? anchor[1] + (random() - .5) * 7 : random() * 205 - 102.5;
    const scale = .48 + random() * 1.08, y = terrainY(x, z) + scale * .5, angle = random() * Math.PI;
    for (let card = 0; card < 2; card++) { dummy.position.set(x, y, z); dummy.rotation.set(0, angle + card * Math.PI / 2, 0); dummy.scale.set(scale, scale * 1.2, 1); dummy.updateMatrix(); ferns.setMatrixAt(i * 2 + card, dummy.matrix); }
  }
  ferns.instanceMatrix.needsUpdate = true;
  scene.add(shrubs, ferns, rocks);

  // Thousands of cheap, individually tinted leaves break up the ground plane at eye level.
  const litterCount = Math.round(1500 * quality);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -.12); leafShape.quadraticCurveTo(.09, -.025, 0, .14); leafShape.quadraticCurveTo(-.09, -.025, 0, -.12);
  const litterMaterial = new THREE.MeshStandardMaterial({ vertexColors:true, color:"#b5a989", roughness:1, side:THREE.DoubleSide });
  const litter = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape), litterMaterial, litterCount);
  const litterPalette = [new THREE.Color("#51442d"),new THREE.Color("#6e5830"),new THREE.Color("#38422b"),new THREE.Color("#8a6b39"),new THREE.Color("#433725")];
  for (let i = 0; i < litterCount; i++) {
    let x = random() * 214 - 107, z = random() * 214 - 107;
    if (i < 280) { x = -43 + (random() - .5) * 34; z = 54 + (random() - .5) * 32; }
    if (Math.hypot(x - 34, z + 43) < 27.5) { i--; continue; }
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
    log.rotation.set(Math.PI / 2 + (random() - .5) * .15, random() * Math.PI, 0); log.position.set(random() * 160 - 80, 0, random() * 160 - 80); log.position.y = terrainY(log.position.x, log.position.z) + .3; log.castShadow = log.receiveShadow = true; scene.add(log);
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

  const gate = new THREE.Group();
  for (const x of [-3.8, 3.8]) { const pillar = new THREE.Mesh(new RoundedBoxGeometry(1.3, 5, 1.3, 4, .12), stoneMaterial); pillar.position.set(x, 2.5, 0); pillar.castShadow = pillar.receiveShadow = true; gate.add(pillar); }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.8, .64, 16, 48, Math.PI), stoneMaterial); arch.rotation.z = Math.PI; arch.position.y = 4.5; arch.castShadow = true; gate.add(arch);
  gate.position.set(GOAL.x, terrainY(GOAL.x, GOAL.z), GOAL.z); scene.add(gate);
  for (const x of [-3.8, 3.8]) obstacles.push({ id: `gate-pillar-${x}`, kind: "circle", x: GOAL.x + x, z: GOAL.z, radius: .78, minY: gate.position.y, maxY: gate.position.y + 5 });

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
  const sky = new Sky(); sky.scale.setScalar(450); scene.add(sky);
  sky.material.uniforms.turbidity.value = 7.4; sky.material.uniforms.rayleigh.value = 2.05;
  sky.material.uniforms.mieCoefficient.value = .009; sky.material.uniforms.mieDirectionalG.value = .86;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(86), THREE.MathUtils.degToRad(224));
  sky.material.uniforms.sunPosition.value.copy(sun);
}

export function buildRealisticWorld(scene: THREE.Scene, textures: GameTextures, quality: number): RealisticWorld {
  addSky(scene);
  const terrain = new THREE.PlaneGeometry(240, 240, 120, 120); terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) positions.setY(i, terrainY(positions.getX(i), positions.getZ(i)));
  terrain.computeVertexNormals();
  const groundMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .14, color: "#d0c6b5", roughness: .95, metalness: 0 });
  const ground = new THREE.Mesh(terrain, groundMaterial); ground.receiveShadow = true; scene.add(ground);

  const trailPoints = [new THREE.Vector3(-50, 0, 62), new THREE.Vector3(-28, 0, 35), new THREE.Vector3(-4, 0, 18), new THREE.Vector3(18, 0, -4), new THREE.Vector3(12, 0, -34), new THREE.Vector3(-8, 0, -62), new THREE.Vector3(-10, 0, -82)];
  for (const point of trailPoints) point.y = terrainY(point.x, point.z) + .06;
  const trailCurve = new THREE.CatmullRomCurve3(trailPoints);
  const trail = new THREE.Mesh(trailRibbon(trailCurve), new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .09, color: "#a59678", roughness: .98 })); trail.receiveShadow = true; scene.add(trail);

  const { trees, branchRoutes: branches, branchNodes, canopyCorridors, canopyNetworkStats } = addTrees(scene, textures, quality, trailCurve);
  const { obstacles, bridgeSurface } = addLandmarks(scene, textures, trailCurve);
  const lakeMaterial = new THREE.MeshPhysicalMaterial({ color: "#345d59", normalMap: textures.waterNormal, normalScale: new THREE.Vector2(.32, .32), roughness: .16, metalness: .08, transmission: .08, transparent: true, opacity: .9, clearcoat: .72, clearcoatRoughness: .18, envMapIntensity: 1.4 });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(25, 96), lakeMaterial); lake.rotation.x = -Math.PI / 2; lake.position.set(34, terrainY(34, -43) + .82, -43); lake.receiveShadow = true; scene.add(lake);
  // Shoreline breaks the mathematically perfect circle.
  const shoreMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .1, color: "#545a42", roughness: 1 });
  const shore = new THREE.Mesh(new THREE.RingGeometry(23.8, 27, 96), shoreMaterial); shore.rotation.x = -Math.PI / 2; shore.position.copy(lake.position).add(new THREE.Vector3(0, -.05, 0)); scene.add(shore);

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
    buds, rings, hawk, lake, trailCurve, trees, branches, branchNodes, canopyCorridors, canopyNetworkStats, obstacles, bridgeSurface,
    animate(time, player, scent, collected) {
      textures.waterNormal.offset.set(time * .008, time * -.011);
      hawk.position.set(player.x + Math.cos(time * .42) * 24, 18 + Math.sin(time * .7) * 2, player.z + Math.sin(time * .42) * 24);
      hawk.rotation.set(0, Math.PI - time * .42, Math.sin(time * .42) * .06);
      const flap = .025 + Math.sin(time * 3.1) * .09;
      hawkWings.forEach((wing) => { wing.rotation.z = wing.userData.side * flap; });
      buds.forEach((bud, index) => { if (!bud.visible) return; bud.rotation.y += .008; bud.position.y = bud.userData.anchorY + Math.sin(time * 2 + index) * .1; });
      rings.forEach((ring, index) => { (ring.material as THREE.MeshBasicMaterial).opacity = scent && !collected.has(index) ? .48 : 0; ring.scale.setScalar(1 + (time * .6 + index * .17) % 2.5); });
    },
  };
}
