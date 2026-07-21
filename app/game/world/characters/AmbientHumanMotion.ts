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
  pauseCount: number;
  paceVariation: number;
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
  /** Number of distinct overlook/conversation pauses around a closed route. */
  pauseCount?: number;
  /** Gentle stride-rate variance; zero is a mechanically constant pace. */
  paceVariation?: number;
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
    pauseCount: Math.max(1, Math.floor(options.pauseCount ?? Math.min(3, options.waypoints?.length ?? 1))),
    paceVariation: THREE.MathUtils.clamp(options.paceVariation ?? .1, 0, .22),
  };
}

/** Advance one ambient route and select walk/idle from actual translation. */
export function updateAmbientHumanAgent(agent: AmbientHumanAgent, elapsed: number, delta: number) {
  const { walkSeconds, pauseSeconds } = agent;
  let amount = 0;
  let moving = false;
  let direction = 1;
  let pauseProgress = 0;
  let stopIndex = 0;
  if (agent.route && agent.closedRoute) {
    // A closed promenade advances in one direction and pauses at several
    // authored points. Reversing the complete loop at one origin made crowds
    // double back in formation and gather robotically at the same spot.
    const segmentWalkSeconds = walkSeconds / agent.pauseCount;
    const segmentSeconds = segmentWalkSeconds + pauseSeconds;
    const cycleSeconds = segmentSeconds * agent.pauseCount;
    const cycle = THREE.MathUtils.euclideanModulo(elapsed + agent.phase, cycleSeconds);
    stopIndex = Math.min(agent.pauseCount - 1, Math.floor(cycle / segmentSeconds));
    const segmentTime = cycle - stopIndex * segmentSeconds;
    if (segmentTime < segmentWalkSeconds) {
      const linearProgress = segmentTime / Math.max(segmentWalkSeconds, .001);
      // Preserve exact endpoints while varying the middle of each leg. The
      // phase-derived sign prevents a whole crowd from accelerating together.
      const variationDirection = Math.sin(agent.phase * 1.71 + stopIndex * 2.13) < 0 ? -1 : 1;
      const organicProgress = linearProgress
        + variationDirection * agent.paceVariation * Math.sin(linearProgress * Math.PI * 2) / (Math.PI * 2);
      amount = (stopIndex + organicProgress) / agent.pauseCount;
      moving = true;
    } else {
      amount = (stopIndex + 1) / agent.pauseCount;
      pauseProgress = THREE.MathUtils.clamp((segmentTime - segmentWalkSeconds) / Math.max(pauseSeconds, .001), 0, 1);
    }
  } else {
    const cycleSeconds = (walkSeconds + pauseSeconds) * 2;
    const cycle = ((elapsed + agent.phase) % cycleSeconds + cycleSeconds) % cycleSeconds;
    if (cycle < walkSeconds) {
      amount = cycle / walkSeconds;
      moving = true;
    } else if (cycle < walkSeconds + pauseSeconds) {
      amount = 1;
      pauseProgress = (cycle - walkSeconds) / Math.max(pauseSeconds, .001);
    } else if (cycle < walkSeconds * 2 + pauseSeconds) {
      amount = 1 - (cycle - walkSeconds - pauseSeconds) / walkSeconds;
      moving = true;
      direction = -1;
    } else {
      pauseProgress = (cycle - walkSeconds * 2 - pauseSeconds) / Math.max(pauseSeconds, .001);
    }
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
    const lookDirection = Math.sin(agent.phase * 2.37 + stopIndex * 1.91) < 0 ? -1 : 1;
    const pauseLook = moving ? 0 : Math.sin(pauseProgress * Math.PI) * agent.lookAround * lookDirection;
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
