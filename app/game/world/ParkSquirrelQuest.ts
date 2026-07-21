import * as THREE from "three";
import type { GameTextures } from "../rendering/textures";
import type { BranchRoute, ClimbableTree, RealisticWorld } from "./RealisticWorld";
import { createEasternGraySquirrel, type ZooAnimalRig } from "./ZooAnimals";
import { markAuthoredZooAnimalDisposed } from "./animals/AuthoredZooAnimalAssets";

export const CENTRAL_PARK_SQUIRREL_COMPANION_ID = "central-park-squirrel" as const;

export type ParkSquirrelQuestState = "AVAILABLE" | "SEEKING_ACORN" | "LOOSENING_ACORN" | "ACORN_FALLING" | "REUNITING" | "FOLLOWING";
export type ParkSquirrelQuestEvent = {
  kind: "ZAP_NOTICED" | "BRANCH_GRIPPED" | "ACORN_DISLODGED" | "ACORN_LANDED" | "ZAP_RECRUITED";
  message: string;
};
export type ParkSquirrelInteractionHint = { label: string; target: THREE.Vector3 };
export type ParkSquirrelUpdateContext = {
  player: THREE.Vector3;
  playerYaw?: number;
  playerArboreal?: boolean;
  onFavoriteBranch?: boolean;
  branchRockDirection?: -1 | 0 | 1;
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
  readonly acornLight = new THREE.PointLight("#f2c67e", 0, 2.35, 2);
  readonly discoveryKey = new THREE.PointLight("#f1c98c", 2.35, 7.4, 2);
  readonly branchFlex = new THREE.Group();
  readonly acornPosition = new THREE.Vector3();
  readonly treePosition = new THREE.Vector3();
  private readonly events: ParkSquirrelQuestEvent[] = [];
  private readonly previous = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();
  private readonly followTarget = new THREE.Vector3();
  private readonly acornLanding = new THREE.Vector3();
  private readonly branchSide = new THREE.Vector3();
  private stateValue: ParkSquirrelQuestState = "AVAILABLE";
  private fallVelocity = 0;
  private bounceCount = 0;
  private reunionPause = 0;
  private rockProgressValue = 0;
  private lastRockDirection: -1 | 0 | 1 = 0;
  private rockImpulse = 0;
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
    const branchDirection = this.branch.end.clone().sub(this.branch.start).setY(0).normalize();
    this.branchSide.set(-branchDirection.z, 0, branchDirection.x);
    // Seat the shell against the upper shoulder of the limb instead of on its
    // centerline. From the climb approach the silhouette now reads beside the
    // branch while remaining physically wedged against its bark.
    this.acornPosition.addScaledVector(this.branchSide, .22);
    this.acornPosition.y += this.branch.radius + .13;

    this.squirrel = createEasternGraySquirrel(textures, quality);
    this.squirrel.root.name = "zap-eastern-gray-squirrel-quest-hero";
    this.squirrel.root.userData.animalName = "Zap";
    this.squirrel.root.userData.questRole = "favorite-acorn-owner-and-companion";
    this.squirrel.root.userData.logicalId = CENTRAL_PARK_SQUIRREL_COMPANION_ID;
    const outward = new THREE.Vector3(this.branch.end.x - this.tree.x, 0, this.branch.end.z - this.tree.z).normalize();
    const rootSide = new THREE.Vector3(-outward.z, 0, outward.x);
    this.squirrel.root.position.set(
      this.tree.x + outward.x * (this.tree.radius + .96) + rootSide.x * .62,
      this.tree.baseY + .02,
      this.tree.z + outward.z * (this.tree.radius + .96) + rootSide.z * .62,
    );
    this.squirrel.root.rotation.y = Math.atan2(-(this.acornPosition.x - this.squirrel.root.position.x), -(this.acornPosition.z - this.squirrel.root.position.z));
    this.squirrel.root.userData.animationState = "forage";
    this.previous.copy(this.squirrel.root.position);
    this.root.add(this.squirrel.root);
    this.discoveryKey.name = "zap-natural-root-stage-dappled-key-light";
    this.discoveryKey.position.copy(this.squirrel.root.position).add(new THREE.Vector3(-.8, 2.5, 1.1));
    this.root.add(this.discoveryKey);

    const shell = new THREE.Mesh(
      new THREE.SphereGeometry(.105, 22, 16),
      new THREE.MeshStandardMaterial({ color: "#98663a", emissive: "#3a1d0c", emissiveIntensity: .22, roughness: .79, metalness: 0 }),
    );
    shell.name = "zap-favorite-acorn-shell";
    shell.scale.set(.84, 1.25, .84);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(.082, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: "#5c3b22", roughness: .96 }),
    );
    cap.name = "zap-favorite-acorn-textured-cap";
    cap.position.y = .078;
    cap.scale.set(1.04, .58, 1.04);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(.011, .014, .085, 8),
      new THREE.MeshStandardMaterial({ color: "#3b2a1d", roughness: 1 }),
    );
    stem.name = "zap-favorite-acorn-stem";
    stem.position.set(.014, .145, 0);
    stem.rotation.z = -.22;
    this.acorn.name = "zap-favorite-acorn-lod0-prop";
    this.acorn.add(shell, cap, stem);
    this.acorn.position.copy(this.acornPosition);
    this.acorn.rotation.set(.28, .7, -.22);
    this.acorn.userData.questObject = "favorite-acorn";
    this.acornLight.name = "zap-favorite-acorn-warm-canopy-glint";
    this.acornLight.position.copy(this.acornPosition).add(new THREE.Vector3(0, .12, 0));
    this.root.add(this.acorn, this.acornLight);

    // The acorn sits in a project-authored fork of fine twigs.
    // This gives the player a readable contact point from the traversal line
    // and provides a physical element that can flex instead of making E feel
    // like an abstract pickup button.
    this.branchFlex.name = "zap-favorite-acorn-physical-flexing-twig-cradle";
    this.branchFlex.position.copy(this.acornPosition);
    const twigMaterial = new THREE.MeshStandardMaterial({ color: "#795238", roughness: .97 });
    const branchAxis = this.branch.end.clone().sub(this.branch.start).normalize();
    const up = new THREE.Vector3(0, 1, 0);
    const twigDirections = [
      branchAxis.clone().multiplyScalar(.8).addScaledVector(this.branchSide, .34).addScaledVector(up, .22),
      branchAxis.clone().multiplyScalar(-.58).addScaledVector(this.branchSide, -.46).addScaledVector(up, .32),
      branchAxis.clone().multiplyScalar(.42).addScaledVector(this.branchSide, -.52).addScaledVector(up, .46),
    ];
    twigDirections.forEach(direction => {
      const length = direction.length();
      const twig = new THREE.Mesh(new THREE.CylinderGeometry(.025, .042, length, 8), twigMaterial);
      twig.name = "zap-acorn-cradle-flexing-natural-twig";
      twig.position.copy(direction).multiplyScalar(.5);
      twig.quaternion.setFromUnitVectors(up, direction.clone().normalize());
      this.branchFlex.add(twig);
    });
    this.root.add(this.branchFlex);

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
  get isActive() { return this.stateValue === "SEEKING_ACORN" || this.stateValue === "LOOSENING_ACORN" || this.stateValue === "ACORN_FALLING" || this.stateValue === "REUNITING"; }
  get isComplete() { return this.stateValue === "FOLLOWING"; }
  get isRockingAcorn() { return this.stateValue === "LOOSENING_ACORN"; }
  get rockProgress() { return Math.round(this.rockProgressValue / 4 * 100); }
  get instruction() {
    if (this.stateValue === "SEEKING_ACORN") return "CLIMB ZAP'S TREE · REACH THE FAVORITE ACORN";
    if (this.stateValue === "LOOSENING_ACORN") return `ROCK THE LIVING BRANCH · ALTERNATE FORWARD / BACK · ${this.rockProgress}%`;
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
      return { label: "GRIP THE BRANCH BESIDE ZAP'S ACORN", target: this.acorn.position.clone() };
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
    this.stateValue = "LOOSENING_ACORN";
    this.rockProgressValue = 0;
    this.lastRockDirection = 0;
    this.rockImpulse = 0;
    const event: ParkSquirrelQuestEvent = { kind: "BRANCH_GRIPPED", message: "Your claws settle beside the acorn. Alternate W and S to rock the living branch until the twig fork releases it." };
    this.events.push(event);
    return event;
  }

  setRecruited(player: THREE.Vector3, floorY: number) {
    this.stateValue = "FOLLOWING";
    this.acorn.visible = false;
    this.branchFlex.visible = false;
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
    } else if (this.stateValue === "LOOSENING_ACORN") this.updateLoosening(elapsed, delta, context);
    else if (this.stateValue === "ACORN_FALLING") this.updateFalling(delta, context);
    else if (this.stateValue === "REUNITING") this.updateReunion(delta, context);
    else this.updateFollowing(delta, context);
    const acornFocused = this.acorn.visible && this.stateValue !== "AVAILABLE" && this.stateValue !== "FOLLOWING";
    this.acornLight.position.copy(this.acorn.position).add(new THREE.Vector3(0, .12, 0));
    this.acornLight.intensity = acornFocused ? 3.2 + Math.sin(elapsed * 2.7) * .45 : 0;
    const rootStoryVisible = this.stateValue === "AVAILABLE" || this.stateValue === "SEEKING_ACORN";
    this.discoveryKey.intensity += ((rootStoryVisible ? 2.35 : this.stateValue === "LOOSENING_ACORN" ? 1.05 : 0) - this.discoveryKey.intensity) * (1 - Math.exp(-delta * 4));
    this.squirrel.update(elapsed, delta);
  }

  private updateLoosening(elapsed: number, delta: number, context: ParkSquirrelUpdateContext) {
    if (!context.onFavoriteBranch || context.player.distanceTo(this.acornPosition) > 2.3) {
      this.stateValue = "SEEKING_ACORN";
      this.rockProgressValue = 0;
      this.lastRockDirection = 0;
      this.rockImpulse = 0;
      this.branchFlex.rotation.set(0, 0, 0);
      this.acorn.position.copy(this.acornPosition);
      return;
    }
    const direction = context.branchRockDirection ?? 0;
    if (direction !== 0 && direction !== this.lastRockDirection) {
      this.lastRockDirection = direction;
      this.rockProgressValue = Math.min(4, this.rockProgressValue + 1);
      this.rockImpulse = direction;
    }
    this.rockImpulse *= Math.exp(-delta * 4.2);
    const flex = this.rockImpulse * .095 + Math.sin(elapsed * 9.5) * .006 * this.rockProgressValue;
    this.branchFlex.rotation.z += (flex - this.branchFlex.rotation.z) * (1 - Math.exp(-delta * 12));
    this.branchFlex.rotation.x = Math.sin(elapsed * 7.1) * .012 * this.rockProgressValue;
    this.acorn.position.copy(this.acornPosition).addScaledVector(this.branchSide, flex * 1.25);
    this.acorn.position.y = this.acornPosition.y + Math.abs(flex) * .18;
    this.acorn.rotation.x += direction * delta * 2.2;
    this.acorn.rotation.z = -.22 + flex * 2.4;
    if (this.rockProgressValue >= 4) this.beginAcornFall();
  }

  private beginAcornFall() {
    this.stateValue = "ACORN_FALLING";
    this.fallVelocity = .35;
    this.bounceCount = 0;
    this.branchFlex.visible = false;
    this.acornLanding.set(this.acorn.position.x + .55, this.tree.baseY + .17, this.acorn.position.z + .34);
    this.events.push({ kind: "ACORN_DISLODGED", message: "The living branch flexes through the final rock. Zap's acorn rattles free and drops through the leaves." });
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
