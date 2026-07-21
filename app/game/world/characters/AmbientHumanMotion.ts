import * as THREE from "three";
import { prepareAuthoredHumanLocomotion, updateAuthoredHumanMotion } from "./AuthoredHumanAssets";

export type AmbientHumanAgent = {
  root: THREE.Group;
  origin: THREE.Vector3;
  axis: THREE.Vector3;
  travel: number;
  speed: number;
  walkSeconds: number;
  pauseSeconds: number;
  phase: number;
  previous: THREE.Vector3;
  initialized: boolean;
  route?: THREE.CatmullRomCurve3;
  routeLength: number;
  closedRoute: boolean;
  lookAround: number;
};

export type AmbientHumanAgentOptions = {
  axis?: THREE.Vector3;
  travel?: number;
  speed?: number;
  walkSeconds?: number;
  pauseSeconds?: number;
  phase?: number;
  /** World-space waypoints create a smooth promenade loop instead of a patrol line. */
  waypoints?: readonly THREE.Vector3[];
  closedRoute?: boolean;
  /** Small head-and-shoulder orientation changes during deliberate pauses. */
  lookAround?: number;
};

/**
 * Creates a deterministic out-and-back pedestrian route. The two explicit
 * pause windows matter: the authored idle clip replaces the walk clip while
 * the character is stationary, so feet never continue stepping in place.
 */
export function createAmbientHumanAgent(
  root: THREE.Group,
  options: AmbientHumanAgentOptions = {},
): AmbientHumanAgent {
  prepareAuthoredHumanLocomotion(root);
  const axis = (options.axis ?? new THREE.Vector3(0, 0, 1)).clone().setY(0);
  if (axis.lengthSq() < .0001) axis.set(0, 0, 1);
  axis.normalize();
  const travel = options.travel ?? 1.8;
  const speed = options.speed ?? .82;
  const closedRoute = options.closedRoute ?? true;
  const route = options.waypoints && options.waypoints.length >= 3
    ? new THREE.CatmullRomCurve3(options.waypoints.map(point => point.clone()), closedRoute, "catmullrom", .42)
    : undefined;
  const routeLength = route?.getLength() ?? 0;
  return {
    root,
    origin: root.position.clone(),
    axis,
    travel,
    speed,
    walkSeconds: options.walkSeconds ?? Math.max(1.6, route ? routeLength / speed : travel / speed),
    pauseSeconds: options.pauseSeconds ?? 2.6,
    phase: options.phase ?? 0,
    previous: root.position.clone(),
    initialized: false,
    route,
    routeLength,
    closedRoute,
    lookAround: options.lookAround ?? .18,
  };
}

/** Advance one ambient route and select walk/idle from actual translation. */
export function updateAmbientHumanAgent(agent: AmbientHumanAgent, elapsed: number, delta: number) {
  const { walkSeconds, pauseSeconds } = agent;
  const cycleSeconds = (walkSeconds + pauseSeconds) * 2;
  const cycle = ((elapsed + agent.phase) % cycleSeconds + cycleSeconds) % cycleSeconds;
  let amount = 0;
  let moving = false;
  let direction = 1;
  if (cycle < walkSeconds) {
    amount = cycle / walkSeconds;
    moving = true;
  } else if (cycle < walkSeconds + pauseSeconds) {
    amount = 1;
  } else if (cycle < walkSeconds * 2 + pauseSeconds) {
    amount = 1 - (cycle - walkSeconds - pauseSeconds) / walkSeconds;
    moving = true;
    direction = -1;
  }

  // Closed promenade routes retain pace through bends and pause at a real
  // overlook. Legacy two-point patrols keep eased endpoints for compatibility.
  const facing = agent.axis.clone().multiplyScalar(direction);
  if (agent.route) {
    const routeAmount = agent.closedRoute ? THREE.MathUtils.euclideanModulo(amount, 1) : amount;
    agent.route.getPointAt(routeAmount, agent.root.position);
    agent.route.getTangentAt(Math.min(.9999, routeAmount), facing).setY(0).normalize();
  } else {
    const eased = amount * amount * (3 - 2 * amount);
    agent.root.position.copy(agent.origin).addScaledVector(agent.axis, eased * agent.travel);
  }
  if (!agent.initialized) {
    // Establish the phase position before deriving velocity. This prevents a
    // visible origin-to-route teleport and a one-frame maximum-speed walk pose.
    agent.previous.copy(agent.root.position);
    agent.initialized = true;
  }
  if (moving || agent.route) {
    // Authored humans face local -Z at the host level. Aim that axis along
    // the route velocity; the former +Z formula made every pedestrian play a
    // forward walk while visually travelling backward.
    const pauseLook = moving ? 0 : Math.sin((elapsed + agent.phase) * .62) * agent.lookAround;
    const targetYaw = Math.atan2(-facing.x, -facing.z) + pauseLook;
    const yawDelta = Math.atan2(
      Math.sin(targetYaw - agent.root.rotation.y),
      Math.cos(targetYaw - agent.root.rotation.y),
    );
    // Turn over several frames instead of snapping 180 degrees at a route end.
    // That snap read as a one-frame arm flick even though the walk clip itself
    // was stable, especially in the tightly framed character laboratory.
    agent.root.rotation.y += yawDelta * (1 - Math.exp(-delta * 7));
  }
  const distance = agent.previous.distanceTo(agent.root.position);
  const actualSpeed = distance / Math.max(delta, .001);
  const walking = moving && distance > .00008;
  updateAuthoredHumanMotion(
    agent.root,
    delta,
    walking ? "walk" : "idle",
    THREE.MathUtils.clamp(actualSpeed / Math.max(agent.speed, .01), .55, 1.35),
  );
  agent.previous.copy(agent.root.position);
}

export function idleAuthoredHuman(root: THREE.Group, delta: number) {
  updateAuthoredHumanMotion(root, delta, "idle", 1);
}
