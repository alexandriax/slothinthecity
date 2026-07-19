import * as THREE from "three";

export type DriveRoad = {
  id: string;
  name: string;
  start: THREE.Vector3;
  end: THREE.Vector3;
  halfWidth: number;
  speedLimit: number;
  primaryFrom?: number;
  primaryTo?: number;
};

export type RoadProjection = {
  road: DriveRoad;
  point: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  distance: number;
  along: number;
  length: number;
  headingYaw: number;
  primaryProgress: number | null;
};

export type RouteGuidance = {
  distance: number;
  current: RoadProjection;
  destination: RoadProjection;
  nextPoint: THREE.Vector3;
  nextRoadName: string;
  pathRoadIds: readonly string[];
  onRecommendedRoute: boolean;
};

type GraphEdge = { to: string; length: number; road: DriveRoad };
type GraphNode = { id: string; point: THREE.Vector3; edges: GraphEdge[] };

const nodeId = (point: THREE.Vector3) => `${Math.round(point.x * 10)}:${Math.round(point.z * 10)}`;

function projectOnRoad(position: THREE.Vector3, road: DriveRoad): RoadProjection {
  const delta = road.end.clone().sub(road.start).setY(0);
  const length = Math.max(.001, delta.length());
  const tangent = delta.multiplyScalar(1 / length);
  const fromStart = position.clone().sub(road.start).setY(0);
  const along = THREE.MathUtils.clamp(fromStart.dot(tangent), 0, length);
  const point = road.start.clone().addScaledVector(tangent, along);
  const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
  const primaryProgress = road.primaryFrom === undefined || road.primaryTo === undefined
    ? null
    : THREE.MathUtils.lerp(road.primaryFrom, road.primaryTo, along / length);
  return {
    road,
    point,
    tangent,
    right,
    distance: Math.hypot(position.x - point.x, position.z - point.z),
    along,
    length,
    headingYaw: Math.atan2(-tangent.x, -tangent.z),
    primaryProgress,
  };
}

/**
 * Small immutable road graph used by the shuttle. Rendering and vehicle
 * physics stay in CityBusWorld; this class owns only spatial projection and
 * shortest-path guidance so free driving never has to snap to a route spline.
 */
export class CityRoadNetwork {
  readonly roads: readonly DriveRoad[];
  private readonly nodes = new Map<string, GraphNode>();

  constructor(roads: readonly DriveRoad[]) {
    this.roads = roads;
    for (const road of roads) {
      const startId = nodeId(road.start), endId = nodeId(road.end);
      const start = this.nodes.get(startId) ?? { id: startId, point: road.start.clone(), edges: [] };
      const end = this.nodes.get(endId) ?? { id: endId, point: road.end.clone(), edges: [] };
      this.nodes.set(startId, start); this.nodes.set(endId, end);
      const length = Math.hypot(road.end.x - road.start.x, road.end.z - road.start.z);
      start.edges.push({ to: endId, length, road });
      end.edges.push({ to: startId, length, road });
    }
  }

  nearest(position: THREE.Vector3, heading?: THREE.Vector3) {
    let nearest: RoadProjection | null = null, nearestScore = Infinity;
    for (const road of this.roads) {
      const candidate = projectOnRoad(position, road);
      const alignment = heading ? Math.abs(candidate.tangent.dot(heading)) : 0;
      const score = candidate.distance - alignment * .45;
      if (!nearest || score < nearestScore) { nearest = candidate; nearestScore = score; }
    }
    if (!nearest) throw new Error("City road network requires at least one road");
    return nearest;
  }

  route(position: THREE.Vector3, destination: THREE.Vector3, heading?: THREE.Vector3): RouteGuidance {
    const current = this.nearest(position, heading), target = this.nearest(destination);
    const directSameRoad = current.road.id === target.road.id ? Math.abs(target.along - current.along) : Infinity;
    const currentStart = nodeId(current.road.start), currentEnd = nodeId(current.road.end);
    const targetStart = nodeId(target.road.start), targetEnd = nodeId(target.road.end);
    const distances = new Map<string, number>([
      [currentStart, current.along],
      [currentEnd, current.length - current.along],
    ]);
    const previous = new Map<string, { node: string; road: DriveRoad }>();
    const unvisited = new Set(this.nodes.keys());

    while (unvisited.size) {
      let active: string | null = null, activeDistance = Infinity;
      for (const id of unvisited) {
        const value = distances.get(id) ?? Infinity;
        if (value < activeDistance) { active = id; activeDistance = value; }
      }
      if (!active || !Number.isFinite(activeDistance)) break;
      unvisited.delete(active);
      for (const edge of this.nodes.get(active)?.edges ?? []) {
        if (!unvisited.has(edge.to)) continue;
        const candidate = activeDistance + edge.length;
        if (candidate >= (distances.get(edge.to) ?? Infinity)) continue;
        distances.set(edge.to, candidate);
        previous.set(edge.to, { node: active, road: edge.road });
      }
    }

    const targetCandidates = [
      { id: targetStart, distance: (distances.get(targetStart) ?? Infinity) + target.along },
      { id: targetEnd, distance: (distances.get(targetEnd) ?? Infinity) + target.length - target.along },
    ];
    let selected = targetCandidates[0];
    if (targetCandidates[1].distance < selected.distance) selected = targetCandidates[1];

    if (directSameRoad <= selected.distance) {
      return {
        distance: directSameRoad + current.distance,
        current,
        destination: target,
        nextPoint: target.point.clone(),
        nextRoadName: current.road.name,
        pathRoadIds: [current.road.id],
        onRecommendedRoute: current.primaryProgress !== null,
      };
    }

    const reversedNodes: string[] = [selected.id], reversedRoads: DriveRoad[] = [];
    let cursor = selected.id;
    while (previous.has(cursor)) {
      const step = previous.get(cursor)!;
      reversedRoads.push(step.road); cursor = step.node; reversedNodes.push(cursor);
      if (cursor === currentStart || cursor === currentEnd) break;
    }
    const pathNodes = reversedNodes.reverse();
    const pathRoads = reversedRoads.reverse();
    const firstNode = this.nodes.get(pathNodes[0]);
    const differentRoadIndex = pathRoads.findIndex(road => road.name !== current.road.name);
    const turnNode = this.nodes.get(pathNodes[differentRoadIndex < 0 ? Math.min(1, pathNodes.length - 1) : differentRoadIndex]);
    const nextPoint = (current.distance > current.road.halfWidth * .8 ? current.point : turnNode?.point ?? firstNode?.point ?? target.point).clone();
    const nextRoad = differentRoadIndex < 0 ? pathRoads[0] ?? current.road : pathRoads[differentRoadIndex];
    return {
      distance: selected.distance + current.distance,
      current,
      destination: target,
      nextPoint,
      nextRoadName: nextRoad.name,
      pathRoadIds: [current.road.id, ...pathRoads.map(road => road.id), target.road.id],
      onRecommendedRoute: current.primaryProgress !== null && pathRoads.every(road => road.primaryFrom !== undefined),
    };
  }
}
