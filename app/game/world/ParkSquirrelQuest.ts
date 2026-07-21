import * as THREE from "three";
import type { GameTextures } from "../rendering/textures";
import type { BranchRoute, ClimbableTree, RealisticWorld } from "./RealisticWorld";
import { createEasternGraySquirrel, type ZooAnimalRig } from "./ZooAnimals";
import { markAuthoredZooAnimalDisposed } from "./animals/AuthoredZooAnimalAssets";

export const CENTRAL_PARK_SQUIRREL_COMPANION_ID = "central-park-squirrel" as const;

export type ParkSquirrelQuestState = "AVAILABLE" | "SEEKING_ACORN" | "ACORN_FALLING" | "REUNITING" | "FOLLOWING";
export type ParkSquirrelQuestEvent = {
  kind: "ZAP_NOTICED" | "ACORN_DISLODGED" | "ACORN_LANDED" | "ZAP_RECRUITED";
  message: string;
};
export type ParkSquirrelInteractionHint = { label: string; target: THREE.Vector3 };
export type ParkSquirrelUpdateContext = {
  player: THREE.Vector3;
  playerYaw?: number;
  playerArboreal?: boolean;
  floorYAt: (x: number, z: number) => number;
  resolveBody?: (position: THREE.Vector3, velocity: THREE.Vector3, radius: number) => void;
};

const DISCOVERY_RADIUS = 5.2;
const ACORN_REACH = 1.58;
const SEARCH_POINT = new THREE.Vector3(-29, 0, -7);

function closestTree(world: RealisticWorld) {
  let selected = world.trees[0], distance = Infinity;
  world.trees.forEach(tree => {
    const candidate = Math.hypot(tree.x - SEARCH_POINT.x, tree.z - SEARCH_POINT.z);
    if (candidate < distance) { selected = tree; distance = candidate; }
  });
  return selected;
}

function favoriteBranch(world: RealisticWorld, tree: ClimbableTree) {
  const treeIndex = world.trees.indexOf(tree);
  const routes = world.branches.filter(route => route.treeIndex === treeIndex && route.destinationTreeIndex === null);
  return routes.reduce<BranchRoute | null>((best, route) => {
    if (!best) return route;
    const heightBias = route.end.y - tree.canopyY;
    const bestHeightBias = best.end.y - tree.canopyY;
    const score = route.start.distanceTo(route.end) + heightBias * .35;
    const bestScore = best.start.distanceTo(best.end) + bestHeightBias * .35;
    return score > bestScore ? route : best;
  }, null) ?? world.branches.find(route => route.treeIndex === treeIndex) ?? world.branches[0];
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

/** A quiet, local park story that uses the normal canopy traversal verb. */
export class ParkSquirrelQuest {
  readonly root = new THREE.Group();
  readonly companionId = CENTRAL_PARK_SQUIRREL_COMPANION_ID;
  readonly squirrel: ZooAnimalRig;
  readonly tree: ClimbableTree;
  readonly branch: BranchRoute;
  readonly acorn = new THREE.Group();
  readonly acornPosition = new THREE.Vector3();
  readonly treePosition = new THREE.Vector3();
  private readonly events: ParkSquirrelQuestEvent[] = [];
  private readonly previous = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly followTarget = new THREE.Vector3();
  private readonly acornLanding = new THREE.Vector3();
  private stateValue: ParkSquirrelQuestState = "AVAILABLE";
  private fallVelocity = 0;
  private bounceCount = 0;
  private reunionPause = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, textures: GameTextures, world: RealisticWorld, quality = 1) {
    this.root.name = "central-park-zap-favorite-acorn-quest";
    this.root.userData.sideQuest = "zap-favorite-acorn";
    this.root.userData.discovery = "local-only-no-global-waypoint";
    this.root.userData.companionId = CENTRAL_PARK_SQUIRREL_COMPANION_ID;
    scene.add(this.root);

    this.tree = closestTree(world);
    this.branch = favoriteBranch(world, this.tree);
    this.treePosition.set(this.tree.x, this.tree.baseY, this.tree.z);
    this.acornPosition.lerpVectors(this.branch.start, this.branch.end, .72);
    this.acornPosition.y += this.branch.radius + .12;

    this.squirrel = createEasternGraySquirrel(textures, quality);
    this.squirrel.root.name = "zap-eastern-gray-squirrel-quest-hero";
    this.squirrel.root.userData.animalName = "Zap";
    this.squirrel.root.userData.questRole = "favorite-acorn-owner-and-companion";
    this.squirrel.root.userData.logicalId = CENTRAL_PARK_SQUIRREL_COMPANION_ID;
    const outward = new THREE.Vector3(this.branch.end.x - this.tree.x, 0, this.branch.end.z - this.tree.z).normalize();
    this.squirrel.root.position.set(
      this.tree.x + outward.x * (this.tree.radius + .78),
      this.tree.baseY + .02,
      this.tree.z + outward.z * (this.tree.radius + .78),
    );
    this.squirrel.root.rotation.y = Math.atan2(-(this.acornPosition.x - this.squirrel.root.position.x), -(this.acornPosition.z - this.squirrel.root.position.z));
    this.squirrel.root.userData.animationState = "forage";
    this.previous.copy(this.squirrel.root.position);
    this.root.add(this.squirrel.root);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(.16, 20, 14),
      new THREE.MeshStandardMaterial({ color: "#80512c", roughness: .79, metalness: 0 }),
    );
    shell.name = "zap-favorite-acorn-shell";
    shell.scale.set(.84, 1.25, .84);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(.125, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#49311f", roughness: .96 }),
    );
    cap.name = "zap-favorite-acorn-textured-cap";
    cap.position.y = .115;
    cap.scale.set(1.04, .58, 1.04);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(.018, .024, .14, 8),
      new THREE.MeshStandardMaterial({ color: "#3b2a1d", roughness: 1 }),
    );
    stem.name = "zap-favorite-acorn-stem";
    stem.position.set(.025, .225, 0);
    stem.rotation.z = -.22;
    this.acorn.name = "zap-favorite-acorn-lod0-prop";
    this.acorn.add(shell, cap, stem);
    this.acorn.position.copy(this.acornPosition);
    this.acorn.rotation.set(.28, .7, -.22);
    this.acorn.userData.questObject = "favorite-acorn";
    this.root.add(this.acorn);

    // A few broken cup fragments at the roots hint at Zap's habit without a
    // quest beacon or explanatory sign.
    for (let index = 0; index < 5; index++) {
      const fragment = new THREE.Mesh(
        new THREE.SphereGeometry(.07, 10, 6, 0, Math.PI * 1.45, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: index % 2 ? "#5a3b24" : "#6d4728", roughness: 1, side: THREE.DoubleSide }),
      );
      fragment.name = "zap-acorn-cup-trace";
      fragment.position.set(
        this.squirrel.root.position.x + Math.cos(index * 2.3) * (.38 + index * .08),
        this.tree.baseY + .025,
        this.squirrel.root.position.z + Math.sin(index * 2.3) * (.38 + index * .08),
      );
      fragment.rotation.set(-Math.PI / 2, index * .8, 0);
      this.root.add(fragment);
    }
  }

  get state() { return this.stateValue; }
  get isActive() { return this.stateValue === "SEEKING_ACORN" || this.stateValue === "ACORN_FALLING" || this.stateValue === "REUNITING"; }
  get isComplete() { return this.stateValue === "FOLLOWING"; }
  get instruction() {
    if (this.stateValue === "SEEKING_ACORN") return "CLIMB ZAP'S TREE · REACH THE FAVORITE ACORN";
    if (this.stateValue === "ACORN_FALLING") return "THE ACORN IS FALLING";
    if (this.stateValue === "REUNITING") return "ZAP IS RETRIEVING HIS ACORN";
    return "";
  }

  consumeEvent() { return this.events.shift() ?? null; }

  interactionHint(player: THREE.Vector3): ParkSquirrelInteractionHint | null {
    if (this.disposed) return null;
    if (this.stateValue === "AVAILABLE") {
      if (player.distanceTo(this.squirrel.root.position) > DISCOVERY_RADIUS) return null;
      return { label: "NOTICE WHAT ZAP IS WATCHING", target: this.squirrel.root.position.clone().add(new THREE.Vector3(0, .32, 0)) };
    }
    if (this.stateValue === "SEEKING_ACORN" && player.distanceTo(this.acorn.position) <= ACORN_REACH) {
      return { label: "DISLODGE ZAP'S FAVORITE ACORN", target: this.acorn.position.clone() };
    }
    return null;
  }

  interact(player: THREE.Vector3): ParkSquirrelQuestEvent | null {
    const hint = this.interactionHint(player);
    if (!hint) return null;
    if (this.stateValue === "AVAILABLE") {
      this.stateValue = "SEEKING_ACORN";
      this.squirrel.root.userData.animationState = "idle";
      const event: ParkSquirrelQuestEvent = {
        kind: "ZAP_NOTICED",
        message: "Zap chatters at one particular branch. His favorite acorn is wedged above—use the trunk and real branches to reach it.",
      };
      this.events.push(event);
      return event;
    }
    this.stateValue = "ACORN_FALLING";
    this.fallVelocity = .35;
    this.bounceCount = 0;
    this.acornLanding.set(this.acorn.position.x + .55, this.tree.baseY + .17, this.acorn.position.z + .34);
    const event: ParkSquirrelQuestEvent = { kind: "ACORN_DISLODGED", message: "The branch flexes. Zap's acorn rattles loose and drops through the leaves." };
    this.events.push(event);
    return event;
  }

  setRecruited(player: THREE.Vector3, floorY: number) {
    this.stateValue = "FOLLOWING";
    this.acorn.visible = false;
    this.squirrel.root.position.set(player.x + 1.35, floorY + .02, player.z + 2.1);
    this.squirrel.root.userData.animationState = "walk";
    this.previous.copy(this.squirrel.root.position);
  }

  update(elapsed: number, delta: number, context: ParkSquirrelUpdateContext) {
    if (this.disposed) return;
    if (this.stateValue === "AVAILABLE" || this.stateValue === "SEEKING_ACORN") {
      const look = this.acorn.position.clone().sub(this.squirrel.root.position);
      const desiredYaw = Math.atan2(-look.x, -look.z);
      const error = Math.atan2(Math.sin(desiredYaw - this.squirrel.root.rotation.y), Math.cos(desiredYaw - this.squirrel.root.rotation.y));
      this.squirrel.root.rotation.y += error * (1 - Math.exp(-delta * 4));
      this.squirrel.root.userData.animationState = this.stateValue === "AVAILABLE" ? "forage" : "idle";
      this.acorn.rotation.z = -.22 + Math.sin(elapsed * 1.8) * .012;
    } else if (this.stateValue === "ACORN_FALLING") this.updateFalling(delta, context);
    else if (this.stateValue === "REUNITING") this.updateReunion(delta, context);
    else this.updateFollowing(delta, context);
    this.squirrel.update(elapsed, delta);
  }

  private updateFalling(delta: number, context: ParkSquirrelUpdateContext) {
    this.fallVelocity -= 9.4 * delta;
    this.acorn.position.y += this.fallVelocity * delta;
    this.acorn.position.x += (this.acornLanding.x - this.acorn.position.x) * delta * .55;
    this.acorn.position.z += (this.acornLanding.z - this.acorn.position.z) * delta * .55;
    this.acorn.rotation.x += delta * 5.8;
    this.acorn.rotation.z += delta * 3.7;
    const floor = context.floorYAt(this.acorn.position.x, this.acorn.position.z) + .17;
    if (this.acorn.position.y > floor) return;
    this.acorn.position.y = floor;
    if (this.bounceCount < 2 && Math.abs(this.fallVelocity) > .8) {
      this.fallVelocity = Math.abs(this.fallVelocity) * (this.bounceCount === 0 ? .28 : .16);
      this.bounceCount++;
      return;
    }
    this.fallVelocity = 0;
    this.stateValue = "REUNITING";
    this.reunionPause = .2;
    this.events.push({ kind: "ACORN_LANDED", message: "The acorn lands intact. Zap bounds from the roots to reclaim it." });
  }

  private updateReunion(delta: number, context: ParkSquirrelUpdateContext) {
    if (this.reunionPause > 0) { this.reunionPause -= delta; return; }
    const dx = this.acorn.position.x - this.squirrel.root.position.x, dz = this.acorn.position.z - this.squirrel.root.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance > .25) {
      const step = Math.min(distance, delta * 3.4);
      this.squirrel.root.position.x += dx / distance * step;
      this.squirrel.root.position.z += dz / distance * step;
      this.squirrel.root.position.y = context.floorYAt(this.squirrel.root.position.x, this.squirrel.root.position.z) + .02;
      this.squirrel.root.rotation.y = Math.atan2(-dx, -dz);
      this.squirrel.root.userData.animationState = "walk";
      return;
    }
    this.acorn.visible = false;
    this.stateValue = "FOLLOWING";
    this.squirrel.root.userData.animationState = "forage";
    this.events.push({ kind: "ZAP_RECRUITED", message: "Zap hugs the acorn to his chest, then falls into step beside you. He's coming for the rest of the journey." });
  }

  private updateFollowing(delta: number, context: ParkSquirrelUpdateContext) {
    const yaw = context.playerYaw ?? 0;
    const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    this.followTarget.copy(context.player).addScaledVector(forward, -2.05).addScaledVector(right, -1.15);
    const arboreal = Boolean(context.playerArboreal);
    this.followTarget.y = arboreal
      ? context.player.y - .68
      : context.floorYAt(this.followTarget.x, this.followTarget.z) + .02;
    const distance = this.squirrel.root.position.distanceTo(this.followTarget);
    const speed = distance > 12 ? 7.2 : arboreal ? 3.1 : 4.35;
    this.previous.copy(this.squirrel.root.position);
    this.velocity.set(0, 0, 0);
    if (distance > .12) {
      const step = Math.min(distance, speed * delta * THREE.MathUtils.clamp(distance * .52, .65, 2));
      this.velocity.copy(this.followTarget).sub(this.squirrel.root.position).multiplyScalar(step / Math.max(distance * delta, .001));
      this.squirrel.root.position.addScaledVector(this.velocity, delta);
    }
    if (!arboreal) {
      context.resolveBody?.(this.squirrel.root.position, this.velocity, .32);
      const floor = context.floorYAt(this.squirrel.root.position.x, this.squirrel.root.position.z) + .02;
      this.squirrel.root.position.y += (floor - this.squirrel.root.position.y) * (1 - Math.exp(-delta * 12));
    }
    const moved = this.squirrel.root.position.clone().sub(this.previous);
    if (Math.hypot(moved.x, moved.z) > .001) {
      const desiredYaw = Math.atan2(-moved.x, -moved.z);
      const error = Math.atan2(Math.sin(desiredYaw - this.squirrel.root.rotation.y), Math.cos(desiredYaw - this.squirrel.root.rotation.y));
      this.squirrel.root.rotation.y += error * (1 - Math.exp(-delta * 9));
    }
    this.squirrel.root.userData.animationState = arboreal && distance > .18 ? "climb" : distance > .18 ? "walk" : "idle";
    this.squirrel.root.userData.followingPlayer = true;
    this.squirrel.root.userData.followMode = arboreal ? "canopy" : "ground";
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    markAuthoredZooAnimalDisposed(this.squirrel.root);
    this.root.removeFromParent();
    disposeTree(this.root);
    this.squirrel.ownedTextures?.forEach(texture => texture.dispose());
  }
}
