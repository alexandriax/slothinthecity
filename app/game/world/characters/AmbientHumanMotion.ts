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
};

export type AmbientHumanAgentOptions = {
  axis?: THREE.Vector3;
  travel?: number;
  speed?: number;
  walkSeconds?: number;
  pauseSeconds?: number;
  phase?: number;
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
  return {
    root,
    origin: root.position.clone(),
    axis,
    travel,
    speed,
    walkSeconds: options.walkSeconds ?? Math.max(1.6, travel / speed),
    pauseSeconds: options.pauseSeconds ?? 2.6,
    phase: options.phase ?? 0,
    previous: root.position.clone(),
    initialized: false,
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

  // Ease only the route position. Clip speed is derived from measured motion,
  // so the gait naturally settles before each full stop.
  const eased = amount * amount * (3 - 2 * amount);
  agent.root.position.copy(agent.origin).addScaledVector(agent.axis, eased * agent.travel);
  if (!agent.initialized) {
    // Establish the phase position before deriving velocity. This prevents a
    // visible origin-to-route teleport and a one-frame maximum-speed walk pose.
    agent.previous.copy(agent.root.position);
    agent.initialized = true;
  }
  if (moving) {
    const facing = agent.axis.clone().multiplyScalar(direction);
    const targetYaw = Math.atan2(facing.x, facing.z);
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
