import * as THREE from "three";
import type { GameTextures } from "../rendering/textures";
import { createMallard, type ZooAnimalRig } from "./ZooAnimals";
import { THE_LAKE_SURFACE_Y } from "./RealisticWorld";
import { markAuthoredZooAnimalDisposed } from "./animals/AuthoredZooAnimalAssets";

export const CENTRAL_PARK_MALLARD_COMPANION_ID = "central-park-mallard" as const;

export type LakeDuckQuestState =
  | "ROAMING"
  | "SNAG_1"
  | "SNAG_2"
  | "SNAG_3"
  | "FREED"
  | "FOLLOWING";

export type LakeDuckLocomotion = "water" | "land" | "flight" | "rowboat";

export type LakeDuckQuestEvent = {
  kind: "DUCK_CALLED" | "REEDLINE_SNAG_RELEASED" | "DUCK_FREED" | "DUCK_RECRUITED";
  message: string;
  progress: number;
};

export type LakeDuckInteractionHint = {
  label: string;
  target: THREE.Vector3;
  /** Duck interactions intentionally override the normal rowboat-exit prompt. */
  overridesVehicleExit: boolean;
};

export type LakeDuckUpdateContext = {
  player: THREE.Vector3;
  playerYaw?: number;
  locomotion?: LakeDuckLocomotion;
  /** Ground or deck support under a land-following mallard. */
  floorYAt?: (x: number, z: number) => number;
  /** Project a land follower out of authored trees, signs, walls, and props. */
  resolveBody?: (position: THREE.Vector3, velocity: THREE.Vector3, radius: number) => void;
  /** Authored forward-bench pose while the player is rowing. */
  rowboatPassenger?: {
    position: THREE.Vector3;
    quaternion: THREE.Quaternion;
  } | null;
};

export type LakeDuckQuestOptions = {
  /** Stable session seed; randomizes snag order once without mutating it later. */
  sessionSeed?: number;
  encounterRadius?: number;
};

type Snag = {
  root: THREE.Group;
  position: THREE.Vector3;
  ring: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial>;
  released: boolean;
};

const TETHER_ANCHOR = new THREE.Vector3(68, THE_LAKE_SURFACE_Y + .065, -221);
const ROAM_CENTER_X = 69;
const ROAM_CENTER_Z = -222;
const ROAM_X_RADIUS = 7.2;
const ROAM_Z_RADIUS = 8.5;
const SNAG_POSITIONS = [
  new THREE.Vector3(52, THE_LAKE_SURFACE_Y + .045, -202),
  new THREE.Vector3(47, THE_LAKE_SURFACE_Y + .045, -231),
  new THREE.Vector3(66, THE_LAKE_SURFACE_Y + .045, -252),
] as const;

function seededOrder(seed: number) {
  const order = [0, 1, 2];
  let value = seed >>> 0;
  const random = () => {
    value = Math.imul(value ^ value >>> 15, 1 | value);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
  for (let index = order.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [order[index], order[swap]] = [order[swap], order[index]];
  }
  return order;
}

function lilyPadGeometry() {
  const shape = new THREE.Shape();
  const segments = 34, notch = .26;
  shape.moveTo(0, 0);
  for (let index = 0; index <= segments; index++) {
    const angle = notch + (Math.PI * 2 - notch * 2) * index / segments;
    shape.lineTo(Math.cos(angle) * 1.05, Math.sin(angle) * .88);
  }
  shape.lineTo(0, 0);
  return new THREE.ShapeGeometry(shape, 1);
}

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
 * Lake-local optional quest and presentation layer for Reedline Rescue.
 *
 * The class owns the swimming encounter, physical line/lily visuals, stable
 * three-snag sequence, and the mallard's park follow handoff. Campaign state
 * remains outside this class; consumers recruit `central-park-mallard` after
 * consuming `DUCK_RECRUITED`, then the shared menagerie owns later worlds.
 */
export class LakeDuckQuest {
  readonly root = new THREE.Group();
  readonly companionId = CENTRAL_PARK_MALLARD_COMPANION_ID;
  readonly duck: ZooAnimalRig;
  readonly snagOrder: readonly number[];
  private readonly snags: Snag[] = [];
  private readonly events: LakeDuckQuestEvent[] = [];
  private readonly line: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  private readonly looseCoil: THREE.Group;
  private readonly encounterRadius: number;
  private readonly previous = new THREE.Vector3();
  private readonly tetherAnchor = TETHER_ANCHOR.clone();
  private readonly freedFrom = new THREE.Vector3();
  private readonly freedFromQuaternion = new THREE.Quaternion();
  private readonly followTarget = new THREE.Vector3();
  private readonly followVelocity = new THREE.Vector3();
  private readonly targetQuaternion = new THREE.Quaternion();
  private readonly passengerFrom = new THREE.Vector3();
  private readonly passengerFromQuaternion = new THREE.Quaternion();
  private passengerSeated = false;
  private passengerBoardingStartedAt = 0;
  private stateValue: LakeDuckQuestState = "ROAMING";
  private releasedCount = 0;
  private stateStartedAt = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1, options: LakeDuckQuestOptions = {}) {
    this.root.name = "central-park-reedline-rescue-quest";
    this.root.userData.sideQuest = "reedline-rescue";
    this.root.userData.companionId = CENTRAL_PARK_MALLARD_COMPANION_ID;
    scene.add(this.root);
    this.encounterRadius = options.encounterRadius ?? 11.5;
    this.snagOrder = Object.freeze(seededOrder(options.sessionSeed ?? Math.floor(Math.random() * 0xffffffff)));
    this.root.userData.stableSnagOrder = [...this.snagOrder];

    this.duck = createMallard(textures, quality);
    this.duck.root.name = "central-park-mallard-reedline-hero";
    this.duck.root.userData.logicalId = CENTRAL_PARK_MALLARD_COMPANION_ID;
    // Match the first procedural swim pose so the mallard never flashes at a
    // distant construction position before its first update.
    this.duck.root.position.set(ROAM_CENTER_X + ROAM_X_RADIUS, THE_LAKE_SURFACE_Y + .065, ROAM_CENTER_Z);
    this.previous.copy(this.duck.root.position);
    this.root.add(this.duck.root);

    const padGeometry = lilyPadGeometry();
    SNAG_POSITIONS.forEach((position, index) => {
      const snagRoot = new THREE.Group();
      snagRoot.name = `reedline-lily-snag-${index + 1}`;
      snagRoot.position.copy(position);
      const pad = new THREE.Mesh(padGeometry.clone(), new THREE.MeshStandardMaterial({ color: index % 2 ? "#6f8848" : "#799652", roughness: .82, side: THREE.DoubleSide }));
      pad.name = "physical-notched-lily-pad";
      pad.rotation.x = -Math.PI / 2;
      pad.scale.setScalar(.82 + index * .08);
      const float = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .2, 5, 10), new THREE.MeshStandardMaterial({ color: "#b58b5c", roughness: .94 }));
      float.name = "discarded-line-cork-float";
      float.position.set(.22, .06, -.12);
      float.rotation.z = .42;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.35, .035, 10, 56), new THREE.MeshBasicMaterial({ color: "#f2c76a", transparent: true, opacity: 0, depthWrite: false }));
      ring.name = "active-reedline-water-ripple";
      ring.rotation.x = Math.PI / 2;
      ring.position.y = .025;
      ring.renderOrder = 16;
      snagRoot.add(pad, float, ring);
      this.root.add(snagRoot);
      this.snags.push({ root: snagRoot, position: position.clone(), ring, released: false });
    });
    padGeometry.dispose();

    this.line = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: "#d5d0bd", transparent: true, opacity: .72, depthWrite: false }),
    );
    this.line.name = "physical-discarded-monofilament-reedline";
    this.line.renderOrder = 15;
    this.root.add(this.line);

    this.looseCoil = new THREE.Group();
    this.looseCoil.name = "freed-reedline-loose-coil";
    this.looseCoil.visible = false;
    for (let loop = 0; loop < 3; loop++) {
      const strand = new THREE.Mesh(
        new THREE.TorusGeometry(.32 + loop * .1, .009, 6, 42),
        new THREE.MeshBasicMaterial({ color: "#d8d2be", transparent: true, opacity: .62 }),
      );
      strand.rotation.x = Math.PI / 2;
      strand.position.y = loop * .007;
      this.looseCoil.add(strand);
    }
    this.looseCoil.position.copy(TETHER_ANCHOR).add(new THREE.Vector3(.7, .02, .55));
    this.root.add(this.looseCoil);
    this.updateLineGeometry();
  }

  get state() { return this.stateValue; }
  get progress() { return this.releasedCount; }
  get isComplete() { return this.stateValue === "FOLLOWING"; }
  get isFreed() { return this.stateValue === "FREED" || this.stateValue === "FOLLOWING"; }
  get isRescueActive() { return this.stateValue.startsWith("SNAG_") || this.stateValue === "FREED"; }
  get activeSnagIndex() { return this.releasedCount < this.snagOrder.length ? this.snagOrder[this.releasedCount] : null; }
  get duckPosition() { return this.duck.root.position; }
  get currentTarget() {
    const active = this.activeSnagIndex;
    return active === null ? this.duck.root.position : this.snags[active].position;
  }

  consumeEvent() { return this.events.shift() ?? null; }

  interactionHint(player: THREE.Vector3): LakeDuckInteractionHint | null {
    if (this.disposed || this.stateValue === "FREED" || this.stateValue === "FOLLOWING") return null;
    if (this.stateValue === "ROAMING") {
      if (Math.hypot(player.x - this.duck.root.position.x, player.z - this.duck.root.position.z) > this.encounterRadius) return null;
      return { label: "HELP THE TANGLED DUCK", target: this.duck.root.position.clone(), overridesVehicleExit: true };
    }
    const active = this.activeSnagIndex;
    if (active === null) return null;
    const target = this.snags[active].position;
    if (Math.hypot(player.x - target.x, player.z - target.z) > 4.4) return null;
    return { label: `LIFT REEDLINE SNAG ${this.releasedCount + 1} / 3`, target: target.clone(), overridesVehicleExit: true };
  }

  /** Returns an event only when this quest consumed the interaction. */
  interact(player: THREE.Vector3, elapsed = this.stateStartedAt): LakeDuckQuestEvent | null {
    if (this.disposed || this.stateValue === "FREED" || this.stateValue === "FOLLOWING") return null;
    if (this.stateValue === "ROAMING") {
      if (Math.hypot(player.x - this.duck.root.position.x, player.z - this.duck.root.position.z) > this.encounterRadius) return null;
      this.beginRescue(elapsed);
      return this.events.at(-1) ?? null;
    }
    const active = this.activeSnagIndex;
    if (active === null) return null;
    const snag = this.snags[active];
    if (Math.hypot(player.x - snag.position.x, player.z - snag.position.z) > 4.4) return null;
    snag.released = true;
    snag.ring.visible = true;
    snag.ring.material.color.set("#7fe49a");
    snag.ring.material.opacity = .9;
    this.releasedCount++;
    this.stateStartedAt = elapsed;
    if (this.releasedCount >= this.snagOrder.length) {
      this.stateValue = "FREED";
      this.line.visible = false;
      this.looseCoil.visible = true;
      this.duck.root.userData.animationState = "short-flight";
      this.freedFrom.copy(this.duck.root.position);
      this.freedFromQuaternion.copy(this.duck.root.quaternion);
      const event: LakeDuckQuestEvent = { kind: "DUCK_FREED", progress: 3, message: "The last loop slips free. The mallard shakes out his wings and circles back to you." };
      this.events.push(event);
      return event;
    }
    this.stateValue = `SNAG_${this.releasedCount + 1}` as LakeDuckQuestState;
    this.updateLineGeometry();
    const event: LakeDuckQuestEvent = { kind: "REEDLINE_SNAG_RELEASED", progress: this.releasedCount, message: `Reedline snag ${this.releasedCount} of 3 released. Follow the taut line to the next lily pad.` };
    this.events.push(event);
    return event;
  }

  private beginRescue(elapsed: number) {
    if (this.stateValue !== "ROAMING") return;
    this.stateValue = "SNAG_1";
    this.stateStartedAt = elapsed;
    this.tetherAnchor.copy(this.duck.root.position);
    this.looseCoil.position.copy(this.tetherAnchor).add(new THREE.Vector3(.7, .02, .55));
    this.duck.root.userData.animationState = "swim";
    this.updateLineGeometry();
    this.events.push({ kind: "DUCK_CALLED", progress: 0, message: "A mallard paddles close, trailing discarded line. Follow each taut strand and lift it from the lily pads." });
  }

  setRecruited(player: THREE.Vector3, floorY = THE_LAKE_SURFACE_Y + .065) {
    this.releasedCount = 3;
    this.snags.forEach(snag => { snag.released = true; snag.root.visible = false; });
    this.stateValue = "FOLLOWING";
    this.stateStartedAt = 0;
    this.line.visible = false;
    this.looseCoil.visible = false;
    this.passengerSeated = false;
    this.passengerBoardingStartedAt = 0;
    this.duck.root.position.set(player.x + 1.7, floorY, player.z + 2.6);
    this.duck.root.rotation.set(0, 0, 0);
    this.previous.copy(this.duck.root.position);
    this.duck.root.userData.animationState = "swim";
  }

  update(elapsed: number, delta: number, context: LakeDuckUpdateContext) {
    if (this.disposed) return;
    if (this.stateValue === "ROAMING") {
      const phase = elapsed * .22;
      this.previous.copy(this.duck.root.position);
      this.duck.root.position.set(
        ROAM_CENTER_X + Math.cos(phase) * (ROAM_X_RADIUS + Math.sin(phase * 2) * 1.1),
        THE_LAKE_SURFACE_Y + .065 + Math.sin(elapsed * 2.1) * .008,
        ROAM_CENTER_Z + Math.sin(phase) * ROAM_Z_RADIUS,
      );
      const moved = this.duck.root.position.clone().sub(this.previous);
      if (moved.lengthSq() > .000001) this.duck.root.rotation.y = Math.atan2(-moved.x, -moved.z);
      this.duck.root.userData.animationState = "swim";
    } else if (this.stateValue.startsWith("SNAG_")) {
      this.previous.copy(this.duck.root.position);
      this.duck.root.position.set(this.tetherAnchor.x + Math.sin(elapsed * .42) * 1.8, this.tetherAnchor.y + Math.sin(elapsed * 2.4) * .007, this.tetherAnchor.z + Math.cos(elapsed * .42) * 1.1);
      this.duck.root.rotation.y = -.35 + Math.sin(elapsed * .55) * .22;
      this.duck.root.userData.animationState = "swim";
      this.updateLineGeometry();
    } else if (this.stateValue === "FREED") {
      const sinceFreed = elapsed - this.stateStartedAt;
      const amount = THREE.MathUtils.clamp(sinceFreed / 1.65, 0, 1);
      this.previous.copy(this.duck.root.position);
      this.resolveFollowTarget(context, this.followTarget);
      const eased = amount * amount * (3 - 2 * amount);
      this.duck.root.position.lerpVectors(this.freedFrom, this.followTarget, eased);
      this.duck.root.position.y += Math.sin(amount * Math.PI) * (context.rowboatPassenger ? 1.15 : .72);
      if (context.rowboatPassenger) {
        this.targetQuaternion.copy(context.rowboatPassenger.quaternion);
        this.duck.root.quaternion.copy(this.freedFromQuaternion).slerp(this.targetQuaternion, eased);
      } else {
        const moved = this.duck.root.position.clone().sub(this.previous);
        if (moved.lengthSq() > .00001) this.duck.root.rotation.y = Math.atan2(-moved.x, -moved.z);
      }
      this.duck.root.userData.animationState = "short-flight";
      if (amount >= 1) {
        this.stateValue = "FOLLOWING";
        this.stateStartedAt = elapsed;
        this.passengerSeated = Boolean(context.rowboatPassenger);
        this.passengerBoardingStartedAt = elapsed - .72;
        this.events.push({ kind: "DUCK_RECRUITED", progress: 3, message: "Reedline Rescue complete — the freed mallard joins your menagerie." });
      }
    }

    if (this.stateValue === "FOLLOWING") this.updateFollowing(elapsed, delta, context);
    const active = this.activeSnagIndex;
    this.snags.forEach((snag, index) => {
      const isActive = index === active && this.stateValue.startsWith("SNAG_");
      snag.ring.visible = isActive || snag.released;
      if (isActive) {
        snag.ring.material.color.set("#f2c76a");
        snag.ring.material.opacity = .42 + Math.sin(elapsed * 3.2) * .16;
        snag.ring.scale.setScalar(.82 + (elapsed * .44 % 1) * .56);
      } else if (snag.released) {
        snag.ring.material.color.set("#7fe49a");
        snag.ring.material.opacity = Math.max(0, snag.ring.material.opacity - delta * .34);
        snag.ring.scale.lerp(new THREE.Vector3(1, 1, 1), 1 - Math.exp(-delta * 5));
      }
      snag.root.position.y = snag.position.y + Math.sin(elapsed * 1.35 + index * 1.7) * .012;
    });
    this.duck.update(elapsed, delta);
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
      ? THE_LAKE_SURFACE_Y + .065
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
    target.y = locomotion === "water"
      ? THE_LAKE_SURFACE_Y + .065
      : context.floorYAt?.(target.x, target.z) ?? context.player.y - 1.48;
    return target;
  }

  private updateLineGeometry() {
    if (!this.line) return;
    const positions: number[] = [this.duck.root.position.x, this.duck.root.position.y + .28, this.duck.root.position.z];
    for (let progress = this.releasedCount; progress < this.snagOrder.length; progress++) {
      const point = this.snags[this.snagOrder[progress]].position;
      positions.push(point.x, point.y + .035, point.z);
    }
    this.line.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.line.geometry.computeBoundingSphere();
    this.line.visible = this.stateValue.startsWith("SNAG_");
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    markAuthoredZooAnimalDisposed(this.duck.root);
    this.root.removeFromParent();
    disposeTree(this.root);
    this.duck.ownedTextures?.forEach(texture => texture.dispose());
  }
}
