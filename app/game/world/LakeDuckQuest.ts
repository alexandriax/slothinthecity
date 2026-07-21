import * as THREE from "three";
import type { GameTextures } from "../rendering/textures";
import { createMallard, type ZooAnimalRig } from "./ZooAnimals";
import { THE_LAKE_SURFACE_Y } from "./RealisticWorld";
import { markAuthoredZooAnimalDisposed } from "./animals/AuthoredZooAnimalAssets";

export const CENTRAL_PARK_MALLARD_COMPANION_ID = "central-park-mallard" as const;

export type LakeDuckQuestState = "ROAMING" | "WAITING_FOR_YIELD" | "CROSSING" | "HONORED" | "FOLLOWING";
export type LakeDuckLocomotion = "water" | "land" | "flight" | "rowboat";

export type LakeDuckQuestEvent = {
  kind: "DUCK_CALLED" | "DUCKS_CROSSING" | "MANNERS_RESET" | "DUCKS_PASSED" | "DUCK_RECRUITED";
  message: string;
  progress: number;
};

export type LakeDuckInteractionHint = {
  label: string;
  target: THREE.Vector3;
  /** Tanner's greeting intentionally overrides the normal rowboat-exit prompt. */
  overridesVehicleExit: boolean;
};

export type LakeDuckUpdateContext = {
  player: THREE.Vector3;
  playerYaw?: number;
  locomotion?: LakeDuckLocomotion;
  floorYAt?: (x: number, z: number) => number;
  resolveBody?: (position: THREE.Vector3, velocity: THREE.Vector3, radius: number) => void;
  rowboatPosition?: THREE.Vector3 | null;
  rowboatSpeedMetersPerSecond?: number;
  rowboatPassenger?: { position: THREE.Vector3; quaternion: THREE.Quaternion } | null;
};

export type LakeDuckQuestOptions = {
  encounterRadius?: number;
  requiredYieldSeconds?: number;
};

const WATER_Y = THE_LAKE_SURFACE_Y + .065;
const ROAM_CENTER = new THREE.Vector3(55, WATER_Y, -203);
const CROSSING_START = new THREE.Vector3(51, WATER_Y, -202);
const CROSSING_END = new THREE.Vector3(72, WATER_Y, -230);
const CROSSING_MIDPOINT = CROSSING_START.clone().lerp(CROSSING_END, .5);
const CROSSING_DURATION = 5.2;
const FAMILY_OFFSETS = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(-1.05, 0, .78),
  new THREE.Vector3(-2.15, 0, -.18),
  new THREE.Vector3(-3.08, 0, .66),
] as const;

function disposeTree(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.Line)) return;
    geometries.add(object.geometry);
    const surfaces = Array.isArray(object.material) ? object.material : [object.material];
    surfaces.forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

/**
 * Optional lake encounter built around observable boat manners rather than
 * collectible markers. Tanner only introduces himself at close range. The
 * player earns his trust by stopping outside the flock's path, letting every
 * duck pass, and continuing without throwing a wake through the family.
 */
export class LakeDuckQuest {
  readonly root = new THREE.Group();
  readonly companionId = CENTRAL_PARK_MALLARD_COMPANION_ID;
  readonly duck: ZooAnimalRig;
  readonly family: readonly ZooAnimalRig[];
  private readonly events: LakeDuckQuestEvent[] = [];
  private readonly encounterRadius: number;
  private readonly requiredYieldSeconds: number;
  private readonly previous = new THREE.Vector3();
  private readonly followTarget = new THREE.Vector3();
  private readonly followVelocity = new THREE.Vector3();
  private readonly passengerFrom = new THREE.Vector3();
  private readonly passengerFromQuaternion = new THREE.Quaternion();
  private readonly honoredFrom = new THREE.Vector3();
  private readonly honoredFromQuaternion = new THREE.Quaternion();
  private readonly targetQuaternion = new THREE.Quaternion();
  private stateValue: LakeDuckQuestState = "ROAMING";
  private stateStartedAt = 0;
  private yieldedSeconds = 0;
  private lastWakeWarningAt = -Infinity;
  private passengerSeated = false;
  private passengerBoardingStartedAt = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1, options: LakeDuckQuestOptions = {}) {
    this.root.name = "central-park-tanner-right-of-way-quest";
    this.root.userData.sideQuest = "tanner-right-of-way";
    this.root.userData.companionId = CENTRAL_PARK_MALLARD_COMPANION_ID;
    this.root.userData.discovery = "local-only-no-global-waypoint";
    scene.add(this.root);
    this.encounterRadius = options.encounterRadius ?? 12.5;
    this.requiredYieldSeconds = options.requiredYieldSeconds ?? 1.35;

    const family = FAMILY_OFFSETS.map(() => createMallard(textures, quality));
    this.family = Object.freeze(family);
    this.duck = family[0];
    family.forEach((member, index) => {
      const name = index === 0 ? "Tanner" : `Tanner family duck ${index}`;
      member.root.name = index === 0 ? "central-park-tanner-mallard" : `central-park-tanner-family-${index}`;
      member.root.userData.animalName = name;
      member.root.userData.questRole = index === 0 ? "manners-mentor-and-companion" : "family-crossing-duck";
      member.root.userData.speciesLabel = "Mallard";
      if (index === 0) member.root.userData.logicalId = CENTRAL_PARK_MALLARD_COMPANION_ID;
      else member.root.scale.setScalar(.82 + index * .045);
      this.root.add(member.root);
    });
    this.placeFamily(new THREE.Vector3(ROAM_CENTER.x + 3.6, WATER_Y, ROAM_CENTER.z), 0, -Math.PI / 2);
    this.previous.copy(this.duck.root.position);

    // Natural, non-glowing environmental storytelling: Tanner's family waits
    // beside a small reed shelf where their route intersects the boat lane.
    const reedMaterial = new THREE.MeshStandardMaterial({ color: "#66784d", roughness: .96 });
    const reedGeometry = new THREE.CylinderGeometry(.018, .032, 1, 6);
    for (let index = 0; index < 18; index++) {
      const reed = new THREE.Mesh(reedGeometry, reedMaterial);
      reed.name = "tanner-crossing-bank-reed";
      reed.position.set(CROSSING_START.x - 2.6 + (index % 6) * .42, WATER_Y + .38, CROSSING_START.z + 2.2 + Math.floor(index / 6) * .38);
      reed.rotation.z = Math.sin(index * 2.1) * .07;
      reed.scale.y = .72 + (index % 4) * .16;
      this.root.add(reed);
    }
  }

  get state() { return this.stateValue; }
  get progress() { return Math.round(THREE.MathUtils.clamp(this.yieldedSeconds / this.requiredYieldSeconds, 0, 1) * 100); }
  get isComplete() { return this.stateValue === "FOLLOWING"; }
  get isMannersActive() { return this.stateValue === "WAITING_FOR_YIELD" || this.stateValue === "CROSSING" || this.stateValue === "HONORED"; }
  get duckPosition() { return this.duck.root.position; }
  get currentTarget() { return this.stateValue === "ROAMING" ? this.duck.root.position : CROSSING_MIDPOINT; }
  get instruction() {
    if (this.stateValue === "WAITING_FOR_YIELD") return "HOLD SPACE · LET TANNER'S FAMILY PASS";
    if (this.stateValue === "CROSSING") return "HOLD POSITION · DUCKS HAVE RIGHT OF WAY";
    if (this.stateValue === "HONORED") return "THANK YOU · TANNER NOTICED YOUR MANNERS";
    return "";
  }

  consumeEvent() { return this.events.shift() ?? null; }

  interactionHint(actor: THREE.Vector3): LakeDuckInteractionHint | null {
    if (this.disposed || this.stateValue !== "ROAMING") return null;
    if (Math.hypot(actor.x - this.duck.root.position.x, actor.z - this.duck.root.position.z) > this.encounterRadius) return null;
    return { label: "GREET TANNER · ASK TO CROSS", target: this.duck.root.position.clone(), overridesVehicleExit: true };
  }

  /** Returns an event only when Tanner consumed the interaction. */
  interact(actor: THREE.Vector3, elapsed = this.stateStartedAt): LakeDuckQuestEvent | null {
    if (!this.interactionHint(actor)) return null;
    this.stateValue = "WAITING_FOR_YIELD";
    this.stateStartedAt = elapsed;
    this.yieldedSeconds = 0;
    this.placeFamily(CROSSING_START, elapsed);
    const event: LakeDuckQuestEvent = {
      kind: "DUCK_CALLED",
      progress: 0,
      message: "Tanner waits with his family at the boat lane. Stop outside their path and let every duck pass before you row through.",
    };
    this.events.push(event);
    return event;
  }

  setRecruited(player: THREE.Vector3, floorY = WATER_Y) {
    this.stateValue = "FOLLOWING";
    this.stateStartedAt = 0;
    this.yieldedSeconds = this.requiredYieldSeconds;
    this.passengerSeated = false;
    this.passengerBoardingStartedAt = 0;
    this.family.slice(1).forEach(member => { member.root.visible = false; });
    this.duck.root.visible = true;
    this.duck.root.position.set(player.x + 1.7, floorY, player.z + 2.6);
    this.duck.root.rotation.set(0, 0, 0);
    this.previous.copy(this.duck.root.position);
    this.duck.root.userData.animationState = "swim";
  }

  update(elapsed: number, delta: number, context: LakeDuckUpdateContext) {
    if (this.disposed) return;
    if (this.stateValue === "ROAMING") this.updateRoaming(elapsed);
    else if (this.stateValue === "WAITING_FOR_YIELD") this.updateWaiting(elapsed, delta, context);
    else if (this.stateValue === "CROSSING") this.updateCrossing(elapsed, context);
    else if (this.stateValue === "HONORED") this.updateHonored(elapsed, context);
    else this.updateFollowing(elapsed, delta, context);
    this.family.forEach(member => { if (member.root.visible) member.update(elapsed, delta); });
  }

  private updateRoaming(elapsed: number) {
    const phase = elapsed * .19;
    const center = new THREE.Vector3(
      ROAM_CENTER.x + Math.cos(phase) * 3.6,
      WATER_Y,
      ROAM_CENTER.z + Math.sin(phase) * 2.9,
    );
    this.placeFamily(center, elapsed, Math.atan2(-Math.sin(phase), Math.cos(phase)) - Math.PI / 2);
  }

  private updateWaiting(elapsed: number, delta: number, context: LakeDuckUpdateContext) {
    this.placeFamily(CROSSING_START, elapsed, Math.atan2(-(CROSSING_END.x - CROSSING_START.x), -(CROSSING_END.z - CROSSING_START.z)));
    const boat = context.rowboatPosition;
    if (!boat) { this.yieldedSeconds = Math.max(0, this.yieldedSeconds - delta * .5); return; }
    const distance = Math.hypot(boat.x - CROSSING_MIDPOINT.x, boat.z - CROSSING_MIDPOINT.z);
    const speed = Math.abs(context.rowboatSpeedMetersPerSecond ?? 0);
    const respectfulApproach = distance >= 4.5 && distance <= 16;
    if (respectfulApproach && speed <= .2) this.yieldedSeconds = Math.min(this.requiredYieldSeconds, this.yieldedSeconds + delta);
    else this.yieldedSeconds = Math.max(0, this.yieldedSeconds - delta * (speed > .75 ? 1.2 : .35));

    if (distance < 4.5 && speed > .62 && elapsed - this.lastWakeWarningAt > 2.8) {
      this.lastWakeWarningAt = elapsed;
      this.events.push({ kind: "MANNERS_RESET", progress: this.progress, message: "Tanner turns the family from your wake. Back off, brake, and give the ducks the right of way." });
    }
    if (this.yieldedSeconds >= this.requiredYieldSeconds) {
      this.stateValue = "CROSSING";
      this.stateStartedAt = elapsed;
      this.events.push({ kind: "DUCKS_CROSSING", progress: 100, message: "Your oars settle. Tanner leads the family safely across your bow." });
    }
  }

  private updateCrossing(elapsed: number, context: LakeDuckUpdateContext) {
    const raw = THREE.MathUtils.clamp((elapsed - this.stateStartedAt) / CROSSING_DURATION, 0, 1);
    const eased = raw * raw * (3 - 2 * raw);
    this.family.forEach((member, index) => {
      const stagger = index * .055;
      const amount = THREE.MathUtils.clamp((eased - stagger) / (1 - stagger), 0, 1);
      member.root.position.lerpVectors(CROSSING_START, CROSSING_END, amount).add(FAMILY_OFFSETS[index]);
      member.root.position.y = WATER_Y + Math.sin(elapsed * 2.2 + index) * .007;
      member.root.rotation.y = Math.atan2(-(CROSSING_END.x - CROSSING_START.x), -(CROSSING_END.z - CROSSING_START.z));
      member.root.userData.animationState = amount > 0 && amount < 1 ? "swim" : "idle";
    });
    const boat = context.rowboatPosition;
    if (boat) {
      const speed = Math.abs(context.rowboatSpeedMetersPerSecond ?? 0);
      const closestDuck = Math.min(...this.family.map(member => Math.hypot(boat.x - member.root.position.x, boat.z - member.root.position.z)));
      if (closestDuck < 3.5 && speed > .72) {
        this.stateValue = "WAITING_FOR_YIELD";
        this.stateStartedAt = elapsed;
        this.yieldedSeconds = 0;
        this.placeFamily(CROSSING_START, elapsed);
        this.events.push({ kind: "MANNERS_RESET", progress: 0, message: "A wake breaks the crossing. Tanner circles back—good manners mean waiting until the last tail feather is clear." });
        return;
      }
    }
    if (raw >= 1) {
      this.stateValue = "HONORED";
      this.stateStartedAt = elapsed;
      this.honoredFrom.copy(this.duck.root.position);
      this.honoredFromQuaternion.copy(this.duck.root.quaternion);
      this.events.push({ kind: "DUCKS_PASSED", progress: 100, message: "The whole family clears your bow. Tanner gives one approving quack and turns back toward you." });
    }
  }

  private updateHonored(elapsed: number, context: LakeDuckUpdateContext) {
    const amount = THREE.MathUtils.clamp((elapsed - this.stateStartedAt) / 1.65, 0, 1);
    const eased = amount * amount * (3 - 2 * amount);
    this.resolveFollowTarget(context, this.followTarget);
    this.duck.root.position.lerpVectors(this.honoredFrom, this.followTarget, eased);
    this.duck.root.position.y += Math.sin(amount * Math.PI) * (context.rowboatPassenger ? 1.08 : .64);
    if (context.rowboatPassenger) {
      this.targetQuaternion.copy(context.rowboatPassenger.quaternion);
      this.duck.root.quaternion.copy(this.honoredFromQuaternion).slerp(this.targetQuaternion, eased);
    }
    this.duck.root.userData.animationState = amount < .82 ? "short-flight" : "landing-settle";
    this.family.slice(1).forEach((member, index) => {
      member.root.position.x += (CROSSING_END.x + 4 + index * 1.2 - member.root.position.x) * .018;
      member.root.position.z += (CROSSING_END.z - 5 - index * .8 - member.root.position.z) * .018;
      member.root.userData.animationState = "swim";
    });
    if (amount >= 1) {
      this.stateValue = "FOLLOWING";
      this.stateStartedAt = elapsed;
      this.family.slice(1).forEach(member => { member.root.visible = false; });
      this.passengerSeated = Boolean(context.rowboatPassenger);
      this.passengerBoardingStartedAt = elapsed - .72;
      this.events.push({ kind: "DUCK_RECRUITED", progress: 100, message: "Tanner joins you. He'll follow the rest of the journey—and expects the same good manners everywhere." });
    }
  }

  private placeFamily(center: THREE.Vector3, elapsed: number, yaw = 0) {
    const cosine = Math.cos(yaw), sine = Math.sin(yaw);
    this.family.forEach((member, index) => {
      const offset = FAMILY_OFFSETS[index];
      member.root.position.set(
        center.x + offset.x * cosine - offset.z * sine,
        WATER_Y + Math.sin(elapsed * 2.1 + index * .9) * .007,
        center.z + offset.x * sine + offset.z * cosine,
      );
      member.root.rotation.y = yaw;
      member.root.userData.animationState = index === 0 || this.stateValue === "ROAMING" ? "swim" : "idle";
    });
  }

  private updateFollowing(elapsed: number, delta: number, context: LakeDuckUpdateContext) {
    if (context.rowboatPassenger) {
      if (!this.passengerSeated) {
        this.passengerSeated = true;
        this.passengerBoardingStartedAt = elapsed;
        this.passengerFrom.copy(this.duck.root.position);
        this.passengerFromQuaternion.copy(this.duck.root.quaternion);
      }
      const boarding = THREE.MathUtils.clamp((elapsed - this.passengerBoardingStartedAt) / .72, 0, 1);
      const eased = boarding * boarding * (3 - 2 * boarding);
      this.duck.root.position.lerpVectors(this.passengerFrom, context.rowboatPassenger.position, eased);
      this.duck.root.position.y += Math.sin(boarding * Math.PI) * .46;
      this.duck.root.quaternion.copy(this.passengerFromQuaternion).slerp(context.rowboatPassenger.quaternion, eased);
      this.duck.root.userData.animationState = boarding < .82 ? "short-flight" : boarding < 1 ? "landing-settle" : "idle";
      this.duck.root.userData.followingPlayer = true;
      this.duck.root.userData.followMode = "rowboat";
      return;
    }
    this.passengerSeated = false;
    const yaw = context.playerYaw ?? 0;
    const locomotion = context.locomotion === "rowboat" ? "water" : context.locomotion ?? "water";
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const target = context.player.clone().addScaledVector(forward, -2.8).addScaledVector(right, 1.65);
    const distance = Math.hypot(target.x - this.duck.root.position.x, target.z - this.duck.root.position.z);
    const flight = locomotion === "flight" || distance > 10;
    const mode: LakeDuckLocomotion = flight ? "flight" : locomotion;
    const speed = mode === "flight" ? 6.8 : mode === "water" ? 3.8 : 2.55;
    const dx = target.x - this.duck.root.position.x, dz = target.z - this.duck.root.position.z;
    this.previous.copy(this.duck.root.position);
    this.followVelocity.set(0, 0, 0);
    if (distance > .04) {
      const step = Math.min(distance, speed * delta * THREE.MathUtils.clamp(distance * .55, .72, 2.2));
      this.followVelocity.set(dx / distance * step / Math.max(delta, .001), 0, dz / distance * step / Math.max(delta, .001));
      this.duck.root.position.addScaledVector(this.followVelocity, delta);
    }
    if (mode === "land") context.resolveBody?.(this.duck.root.position, this.followVelocity, .38);
    const support = mode === "water"
      ? WATER_Y
      : (context.floorYAt?.(this.duck.root.position.x, this.duck.root.position.z) ?? context.player.y - 1.48) + (mode === "flight" ? 1.2 : 0);
    this.duck.root.position.y += (support - this.duck.root.position.y) * (1 - Math.exp(-delta * (mode === "flight" ? 3.2 : 10)));
    const movedX = this.duck.root.position.x - this.previous.x, movedZ = this.duck.root.position.z - this.previous.z;
    if (Math.hypot(movedX, movedZ) > .001) {
      const desiredYaw = Math.atan2(-movedX, -movedZ);
      const error = Math.atan2(Math.sin(desiredYaw - this.duck.root.rotation.y), Math.cos(desiredYaw - this.duck.root.rotation.y));
      this.duck.root.rotation.y += error * (1 - Math.exp(-delta * 7));
    }
    const upright = 1 - Math.exp(-delta * 9);
    this.duck.root.rotation.x += (0 - this.duck.root.rotation.x) * upright;
    this.duck.root.rotation.z += (0 - this.duck.root.rotation.z) * upright;
    this.duck.root.userData.animationState = mode === "flight" ? "short-flight" : mode === "water" ? "swim" : distance > .18 ? "walk" : "idle";
    this.duck.root.userData.followingPlayer = true;
    this.duck.root.userData.followMode = mode;
    this.duck.root.position.y += mode === "water" ? Math.sin(elapsed * 2.4) * .005 : 0;
  }

  private resolveFollowTarget(context: LakeDuckUpdateContext, target: THREE.Vector3) {
    if (context.rowboatPassenger) return target.copy(context.rowboatPassenger.position);
    const yaw = context.playerYaw ?? 0;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    target.copy(context.player).addScaledVector(forward, -2.8).addScaledVector(right, 1.65);
    const locomotion = context.locomotion ?? "water";
    target.y = locomotion === "water" ? WATER_Y : context.floorYAt?.(target.x, target.z) ?? context.player.y - 1.48;
    return target;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.family.forEach(member => {
      markAuthoredZooAnimalDisposed(member.root);
      member.ownedTextures?.forEach(texture => texture.dispose());
    });
    this.root.removeFromParent();
    disposeTree(this.root);
  }
}
