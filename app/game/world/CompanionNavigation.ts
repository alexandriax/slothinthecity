import * as THREE from "three";

export type CompanionFormation = "grove" | "open" | "scooter" | "station" | "train";

export type CompanionCollisionBody = {
  id: string;
  root: THREE.Object3D;
  velocity: THREE.Vector3;
  radius: number;
  enabled?: boolean;
};

export type CompanionBodyResolver = (
  position: THREE.Vector3,
  velocity: THREE.Vector3,
  radius: number,
) => void;

export type CompanionNavigationSurface = {
  floorYAt: (x: number, z: number) => number;
  resolveBody?: CompanionBodyResolver;
};

const ROUTE_CAPACITY = 320;
const ROUTE_SAMPLE_DISTANCE = .12;

/**
 * Allocation-free ring buffer containing the route the player actually took.
 * Followers sample this route instead of cutting straight across enclosure
 * walls, museum exhibits, station stairs, or train doors.
 */
export class SharedCompanionRoute {
  private readonly points = Array.from({ length: ROUTE_CAPACITY }, () => new THREE.Vector3());
  private head = 0;
  private size = 0;

  get hasPoints() { return this.size > 0; }

  private point(index: number) {
    return this.points[(this.head + index) % ROUTE_CAPACITY];
  }

  seed(leader: THREE.Vector3, floorY: number, yaw = 0) {
    this.head = 0;
    this.size = Math.min(180, ROUTE_CAPACITY);
    const backwardX = Math.sin(yaw), backwardZ = Math.cos(yaw);
    for (let index = 0; index < this.size; index++) {
      this.points[index].set(
        leader.x + backwardX * index * .14,
        floorY,
        leader.z + backwardZ * index * .14,
      );
    }
  }

  record(leader: THREE.Vector3, floorY: number, maximumLength = 72) {
    if (!this.size) {
      this.seed(leader, floorY);
      return;
    }
    const latest = this.point(0);
    const distance = Math.hypot(leader.x - latest.x, leader.z - latest.z);
    if (distance >= ROUTE_SAMPLE_DISTANCE) {
      this.head = (this.head - 1 + ROUTE_CAPACITY) % ROUTE_CAPACITY;
      this.points[this.head].set(leader.x, floorY, leader.z);
      this.size = Math.min(this.size + 1, ROUTE_CAPACITY);
    } else latest.set(leader.x, floorY, leader.z);

    let accumulated = 0;
    for (let index = 1; index < this.size; index++) {
      const start = this.point(index - 1), end = this.point(index);
      accumulated += Math.hypot(start.x - end.x, start.z - end.z);
      if (accumulated <= maximumLength) continue;
      this.size = index + 1;
      break;
    }
  }

  sample(distance: number, target: THREE.Vector3) {
    if (!this.size) return target.set(0, 0, 0);
    let remaining = Math.max(0, distance);
    for (let index = 1; index < this.size; index++) {
      const start = this.point(index - 1), end = this.point(index);
      const segment = Math.hypot(start.x - end.x, start.z - end.z);
      if (remaining <= segment) return target.copy(start).lerp(end, remaining / Math.max(segment, .0001));
      remaining -= segment;
    }
    return target.copy(this.point(this.size - 1));
  }

  elevationAt(position: THREE.Vector3, fallback: number) {
    if (this.size === 1) return this.point(0).y;
    let nearestDistanceSq = Infinity, elevation = fallback;
    for (let index = 1; index < this.size; index++) {
      const start = this.point(index - 1), end = this.point(index);
      const dx = end.x - start.x, dz = end.z - start.z, lengthSq = dx * dx + dz * dz;
      if (lengthSq < .000001) continue;
      const amount = THREE.MathUtils.clamp(((position.x - start.x) * dx + (position.z - start.z) * dz) / lengthSq, 0, 1);
      const projectedX = start.x + dx * amount, projectedZ = start.z + dz * amount;
      const distanceSq = (position.x - projectedX) ** 2 + (position.z - projectedZ) ** 2;
      if (distanceSq >= nearestDistanceSq) continue;
      nearestDistanceSq = distanceSq;
      elevation = THREE.MathUtils.lerp(start.y, end.y, amount);
    }
    return elevation;
  }
}

/** Stable lane/trailing slot. Values are calculated, never randomized. */
export function companionFormationSlot(
  index: number,
  formation: CompanionFormation,
  target: THREE.Vector2,
) {
  if (formation === "train") return target.set(index % 2 ? .15 : -.15, 1.45 + index * 1.18);
  if (formation === "station") return target.set(index % 2 ? .36 : -.36, 1.65 + Math.floor(index / 2) * 1.38);
  if (formation === "scooter") return target.set(index % 2 ? 1.18 : -1.18, 2.15 + Math.floor(index / 2) * 2.12);
  if (formation === "grove") {
    const angle = index * 2.399963229728653;
    const radius = 2.15 + Math.sqrt(index + .5) * 1.06;
    return target.set(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  const lane = index % 3 - 1;
  return target.set(lane * 1.22, 1.85 + Math.floor(index / 3) * 1.72 + Math.abs(lane) * .2);
}

export type CompanionSeparationOptions = {
  iterations?: number;
  leader?: THREE.Vector3;
  leaderRadius?: number;
  resolveBody?: CompanionBodyResolver;
  scooter?: boolean;
};

function deterministicSeparationDirection(left: CompanionCollisionBody, right: CompanionCollisionBody) {
  let hash = 2166136261;
  const value = `${left.id}|${right.id}`;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff * Math.PI * 2;
}

/**
 * One final collision pass for every active party. Positions and velocities are
 * references owned by their controllers, so no per-frame body/vector objects
 * are created. World projection runs after every separation iteration because
 * resolving one overlap must never push the other animal through a wall.
 */
export function solveCompanionCollisions(
  bodies: readonly CompanionCollisionBody[],
  options: CompanionSeparationOptions = {},
) {
  const iterations = options.iterations ?? 5;
  const padding = options.scooter ? .18 : .06;
  for (let iteration = 0; iteration < iterations; iteration++) {
    for (let leftIndex = 0; leftIndex < bodies.length; leftIndex++) {
      const left = bodies[leftIndex], a = left.root.position;
      if (left.enabled === false) continue;
      for (let rightIndex = leftIndex + 1; rightIndex < bodies.length; rightIndex++) {
        const right = bodies[rightIndex], b = right.root.position;
        if (right.enabled === false) continue;
        let dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
        const clearance = left.radius + right.radius + padding;
        if (distance >= clearance) continue;
        if (distance <= .0001) {
          const angle = deterministicSeparationDirection(left, right);
          dx = Math.cos(angle); dz = Math.sin(angle); distance = 1;
        }
        const correction = (clearance - distance) * .5 / distance;
        a.x -= dx * correction; a.z -= dz * correction;
        b.x += dx * correction; b.z += dz * correction;
        const nx = dx / distance, nz = dz / distance;
        left.velocity.x -= nx * .08; left.velocity.z -= nz * .08;
        right.velocity.x += nx * .08; right.velocity.z += nz * .08;
      }
    }

    if (options.leader) {
      const leaderRadius = options.leaderRadius ?? .48;
      for (let index = 0; index < bodies.length; index++) {
        const body = bodies[index], position = body.root.position;
        if (body.enabled === false) continue;
        let dx = position.x - options.leader.x, dz = position.z - options.leader.z, distance = Math.hypot(dx, dz);
        const clearance = body.radius + leaderRadius;
        if (distance >= clearance) continue;
        if (distance <= .0001) {
          const angle = (index + 1) * 2.399963229728653;
          dx = Math.cos(angle); dz = Math.sin(angle); distance = 1;
        }
        const correction = (clearance - distance) / distance;
        position.x += dx * correction; position.z += dz * correction;
      }
    }

    if (options.resolveBody) {
      for (const body of bodies) {
        if (body.enabled === false) continue;
        // The shared pass owns planar separation only. Legacy controllers keep
        // authoritative branch/climb/stair elevation and would visibly snap to
        // the floor if a streamed world's body resolver overwrote Y here.
        const elevation = body.root.position.y;
        options.resolveBody(body.root.position, body.velocity, body.radius);
        body.root.position.y = elevation;
      }
    }
  }
}
