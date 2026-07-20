import * as THREE from "three";
import type { GameTextures } from "../rendering/textures";
import { createPremiumScooterSlothFriend, createPremiumSlothFriend } from "./PremiumCharacter";
import { cloneZooAnimalAtlasCell } from "./ZooAnimals";
import { createElectricScooter, rollPersonalMobility, type PersonalMobilityVehicle } from "./PersonalMobility";

export type SlothPartyFormation = "grove" | "open" | "station" | "train";
type SlothPartyMovementFormation = SlothPartyFormation | "scooter";

type Breadcrumb = {
  position: THREE.Vector3;
};

type Follower = {
  root: THREE.Group;
  walkingRig: THREE.Group;
  riderRig: THREE.Group;
  velocity: THREE.Vector3;
  previous: THREE.Vector3;
  gaitPhase: number;
  groundY: number;
  trailingDistance: number;
  formationJoined: boolean;
  scooter: PersonalMobilityVehicle;
};

// Match the authored enclosure animals so opening the keeper door is a
// continuous character handoff instead of a visible model/color swap.
const FOLLOWER_TINTS = ["#514536", "#423a31", "#594936", "#443a30"] as const;
const FORMATION_OFFSETS: Record<SlothPartyMovementFormation, readonly THREE.Vector2[]> = {
  open: [new THREE.Vector2(-.72, 0), new THREE.Vector2(.72, -.25), new THREE.Vector2(-.48, -.6), new THREE.Vector2(.5, -.9)],
  scooter: [new THREE.Vector2(-1.18, -.1), new THREE.Vector2(1.18, -.32), new THREE.Vector2(-1.18, -1.02), new THREE.Vector2(1.18, -1.24)],
  station: [new THREE.Vector2(-.42, 0), new THREE.Vector2(.42, -.18), new THREE.Vector2(-.35, -.48), new THREE.Vector2(.35, -.72)],
  train: [new THREE.Vector2(-.26, 0), new THREE.Vector2(.26, -.22), new THREE.Vector2(-.24, -.56), new THREE.Vector2(.24, -.82)],
  grove: [new THREE.Vector2(-1.35, .2), new THREE.Vector2(1.25, -.1), new THREE.Vector2(-.7, -1.1), new THREE.Vector2(.8, -1.35)],
};

/**
 * A scene-owned rescue party that deliberately outlives streamed zoo, station,
 * and train worlds. Breadcrumb following keeps every sloth on the route the
 * player actually walked instead of cutting through enclosure walls or train
 * doors while formations compress for narrow interiors.
 */
export class SlothFollowerParty {
  readonly root = new THREE.Group();
  readonly count = FOLLOWER_TINTS.length;
  private readonly followers: Follower[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly breadcrumbs: Breadcrumb[] = [];
  private lastLeader = new THREE.Vector3();
  private active = false;
  private disposed = false;
  private finaleStaged = false;
  private scooterMode = false;
  private qualityReviewStaged = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "rescued-sloth-follower-party";
    this.root.visible = false;
    scene.add(this.root);
    // This clone shares the app-owned atlas source, not the zoo world's
    // disposable captive texture. The party therefore keeps identical sloth
    // surfaces throughout station, train, and park streaming transitions.
    const persistentSlothSurface = cloneZooAnimalAtlasCell(textures, 2, 2, "rescued-sloth-friends");
    this.ownedTextures.push(persistentSlothSurface);
    FOLLOWER_TINTS.forEach((tint, index) => {
      const walking = createPremiumSlothFriend(textures, quality, index, tint);
      const rider = createPremiumScooterSlothFriend(textures, quality, index, tint);
      const anchor = new THREE.Group();
      anchor.name = `rescued-sloth-follower-${index + 1}`;
      anchor.userData.followingPlayer = true;
      anchor.userData.logicalId = `sloth-friend-${index + 1}`;
      walking.root.name = `rescued-sloth-follower-${index + 1}-quadrupedal-rig`;
      rider.root.name = `rescued-sloth-follower-${index + 1}-scooter-rider-rig`;
      rider.root.visible = false;
      anchor.add(walking.root, rider.root);
      anchor.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !/(sloth-(?:torso|head|forelimb|hindlimb)|anatomical-sloth)/.test(object.name)) return;
        const surfaces = Array.isArray(object.material) ? object.material : [object.material];
        surfaces.forEach(surface => {
          if (!(surface instanceof THREE.MeshStandardMaterial)) return;
          surface.map = persistentSlothSurface;
          surface.needsUpdate = true;
        });
      });
      this.root.add(anchor);
      const scooter = createElectricScooter(index + 1);
      scooter.root.name = `rescued-sloth-friend-${index + 1}-ridden-electric-scooter`;
      scooter.root.visible = false;
      this.root.add(scooter.root);
      this.ownedTextures.push(...walking.ownedTextures, ...rider.ownedTextures);
      this.followers.push({
        root: anchor,
        walkingRig: walking.root,
        riderRig: rider.root,
        velocity: new THREE.Vector3(),
        previous: new THREE.Vector3(),
        gaitPhase: index * 1.47,
        groundY: 0,
        trailingDistance: 1.55 + index * 1.22,
        formationJoined: false,
        scooter,
      });
    });
  }

  get isActive() { return this.active; }
  get isScooterMode() { return this.scooterMode; }

  setScooterMode(active: boolean) {
    this.scooterMode = active;
    this.followers.forEach(follower => {
      follower.scooter.root.visible = active;
      follower.root.userData.ridingElectricScooter = active;
      follower.walkingRig.visible = !active;
      follower.riderRig.visible = active;
    });
  }

  setActive(active: boolean, leader?: THREE.Vector3, floorY = 0) {
    const wasActive = this.active;
    this.active = active;
    this.finaleStaged = false;
    this.qualityReviewStaged = false;
    this.root.visible = active;
    if (!active || !leader) return;
    // On the real rescue, inherit the authored animals' transforms before the
    // zoo world is disposed. Debug checkpoints that begin in transit have no
    // enclosure meshes and intentionally fall back to a local-world reset.
    if (!wasActive && this.releaseFromEnclosure(leader, floorY)) return;
    this.reset(leader, floorY);
  }

  private releaseFromEnclosure(leader: THREE.Vector3, floorY: number) {
    const scene = this.root.parent;
    if (!scene) return false;
    const enclosureSloths = this.followers.map((_, index) => scene.getObjectByName(`captive-sloth-friend-${index + 1}-on-real-branch`));
    if (enclosureSloths.some(sloth => !sloth)) return false;
    this.lastLeader.set(leader.x, floorY, leader.z);
    this.seedBreadcrumbs(leader, floorY);
    enclosureSloths.forEach((enclosureSloth, index) => {
      const follower = this.followers[index];
      enclosureSloth!.getWorldPosition(follower.root.position);
      enclosureSloth!.getWorldQuaternion(follower.root.quaternion);
      follower.groundY = follower.root.position.y;
      follower.previous.copy(follower.root.position);
      follower.velocity.set(0, 0, 0);
      follower.formationJoined = false;
      follower.root.userData.motion = "release-catch-up";
    });
    return true;
  }

  private seedBreadcrumbs(leader: THREE.Vector3, floorY: number) {
    this.breadcrumbs.length = 0;
    for (let index = 0; index < 54; index++) {
      this.breadcrumbs.push({ position: new THREE.Vector3(leader.x, floorY, leader.z + index * .13) });
    }
  }

  reset(leader: THREE.Vector3, floorY: number) {
    this.finaleStaged = false;
    this.qualityReviewStaged = false;
    this.lastLeader.set(leader.x, floorY, leader.z);
    this.seedBreadcrumbs(leader, floorY);
    this.followers.forEach((follower, index) => {
      const offset = FORMATION_OFFSETS.open[index];
      follower.root.position.set(leader.x + offset.x, floorY, leader.z + 1.55 + index * .72);
      follower.groundY = floorY;
      follower.previous.copy(follower.root.position);
      follower.velocity.set(0, 0, 0);
      follower.formationJoined = true;
    });
  }

  /**
   * Deterministic fixed-angle staging for the repository's visual review
   * checkpoints. It uses the shipping rigs, materials, scooters and collision
   * spacing while placing every subject inside one reproducible camera frame.
   */
  stageQualityReview(viewer: THREE.Vector3, viewerYaw: number, floorYAt: (x: number, z: number) => number, scooter = false) {
    this.active = true;
    this.finaleStaged = false;
    this.root.visible = true;
    this.setScooterMode(scooter);
    const forward = new THREE.Vector3(-Math.sin(viewerYaw), 0, -Math.cos(viewerYaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const placements = scooter ? [
      { side: -1.45, depth: 3.6 },
      { side: 1.45, depth: 3.9 },
      { side: -1.35, depth: 5.8 },
      { side: 1.35, depth: 6.1 },
    ] as const : [
      { side: -1.25, depth: 3.05 },
      { side: 1.25, depth: 3.3 },
      { side: -1.2, depth: 5.05 },
      { side: 1.2, depth: 5.3 },
    ] as const;
    this.lastLeader.copy(viewer);
    this.qualityReviewStaged = true;
    this.seedBreadcrumbs(viewer, floorYAt(viewer.x, viewer.z));
    this.followers.forEach((follower, index) => {
      const placement = placements[index];
      follower.root.position.copy(viewer).addScaledVector(forward, placement.depth).addScaledVector(right, placement.side);
      follower.groundY = floorYAt(follower.root.position.x, follower.root.position.z);
      follower.root.position.y = follower.groundY;
      const reviewYaw = viewerYaw + Math.PI + (scooter ? Math.sign(placement.side) * .28 : 0);
      follower.root.rotation.set(0, reviewYaw, 0);
      follower.velocity.set(0, 0, 0);
      follower.previous.copy(follower.root.position);
      follower.formationJoined = true;
      follower.scooter.root.position.set(follower.root.position.x, follower.groundY, follower.root.position.z);
      follower.scooter.root.rotation.set(0, follower.root.rotation.y, 0);
    });
  }

  stageFinale(point: THREE.Vector3, floorYAt: (x: number, z: number) => number) {
    this.setScooterMode(false);
    const positions = [new THREE.Vector2(-2.25, 2.5), new THREE.Vector2(-.7, 3.05), new THREE.Vector2(1.05, 2.35), new THREE.Vector2(2.65, 1.55)];
    this.active = true;
    this.finaleStaged = true;
    this.qualityReviewStaged = false;
    this.root.visible = true;
    this.breadcrumbs.length = 0;
    this.lastLeader.copy(point);
    this.followers.forEach((follower, index) => {
      const offset = positions[index], x = point.x + offset.x, z = point.z + offset.y;
      follower.groundY = floorYAt(x, z); follower.root.position.set(x, follower.groundY, z);
      follower.root.rotation.set(0, Math.PI, 0);
      follower.velocity.set(0, 0, 0);
      follower.previous.copy(follower.root.position);
      follower.formationJoined = true;
      follower.root.traverse(object => { if (object instanceof THREE.Mesh) object.frustumCulled = false; });
    });
  }

  private recordLeader(leader: THREE.Vector3, floorY: number) {
    const planarDistance = Math.hypot(leader.x - this.lastLeader.x, leader.z - this.lastLeader.z);
    if (!this.breadcrumbs.length || planarDistance >= .12) {
      this.breadcrumbs.unshift({ position: new THREE.Vector3(leader.x, floorY, leader.z) });
      this.lastLeader.set(leader.x, floorY, leader.z);
      let accumulated = 0;
      for (let index = 1; index < this.breadcrumbs.length; index++) {
        const start = this.breadcrumbs[index - 1].position, end = this.breadcrumbs[index].position;
        accumulated += Math.hypot(start.x - end.x, start.z - end.z);
        if (accumulated > 18) { this.breadcrumbs.length = index + 1; break; }
      }
    } else if (this.breadcrumbs[0]) {
      this.breadcrumbs[0].position.set(leader.x, floorY, leader.z);
    }
  }

  private pointBehind(distance: number, target = new THREE.Vector3()) {
    if (!this.breadcrumbs.length) return target.copy(this.lastLeader);
    let remaining = distance;
    for (let index = 1; index < this.breadcrumbs.length; index++) {
      const start = this.breadcrumbs[index - 1].position, end = this.breadcrumbs[index].position;
      const segment = Math.hypot(start.x - end.x, start.z - end.z);
      if (remaining <= segment) return target.copy(start).lerp(end, remaining / Math.max(segment, .001));
      remaining -= segment;
    }
    return target.copy(this.breadcrumbs[this.breadcrumbs.length - 1].position);
  }

  /**
   * Project a follower back onto the walked route in X/Z and interpolate the
   * breadcrumb elevation there. Staircases are narrow, so sampling the world's
   * floor under a formation's lateral offset can otherwise select the floor
   * above or below the stair opening and make a sloth pop vertically.
   */
  private routeElevationAt(position: THREE.Vector3, fallback: number) {
    if (this.breadcrumbs.length === 1) return this.breadcrumbs[0].position.y;
    let closestDistanceSq = Infinity, elevation = fallback;
    for (let index = 1; index < this.breadcrumbs.length; index++) {
      const start = this.breadcrumbs[index - 1].position, end = this.breadcrumbs[index].position;
      const dx = end.x - start.x, dz = end.z - start.z, lengthSq = dx * dx + dz * dz;
      if (lengthSq < .000001) continue;
      const amount = THREE.MathUtils.clamp(((position.x - start.x) * dx + (position.z - start.z) * dz) / lengthSq, 0, 1);
      const projectedX = start.x + dx * amount, projectedZ = start.z + dz * amount;
      const distanceSq = (position.x - projectedX) ** 2 + (position.z - projectedZ) ** 2;
      if (distanceSq >= closestDistanceSq) continue;
      closestDistanceSq = distanceSq; elevation = THREE.MathUtils.lerp(start.y, end.y, amount);
    }
    return elevation;
  }

  update(
    elapsed: number,
    delta: number,
    leader: THREE.Vector3,
    floorYAt: (x: number, z: number) => number,
    formation: SlothPartyMovementFormation = "open",
  ) {
    if (!this.active || this.disposed) return;
    if (this.qualityReviewStaged) {
      if (Math.hypot(leader.x - this.lastLeader.x, leader.z - this.lastLeader.z) > .15) this.qualityReviewStaged = false;
      else return;
    }
    if (this.finaleStaged) {
      this.followers.forEach(follower => {
        const idle = Math.sin(elapsed * 1.25 + follower.gaitPhase);
        follower.root.position.y = floorYAt(follower.root.position.x, follower.root.position.z) + idle * .009;
        follower.root.rotation.z = idle * .009;
        follower.root.userData.motion = "idle";
      });
      return;
    }
    const leaderFloor = floorYAt(leader.x, leader.z);
    if (Math.hypot(leader.x - this.lastLeader.x, leader.z - this.lastLeader.z) > 14 || Math.abs(leaderFloor - this.lastLeader.y) > 6) {
      this.reset(leader, leaderFloor);
    }
    this.recordLeader(leader, leaderFloor);
    const offsets = FORMATION_OFFSETS[formation], target = new THREE.Vector3(), tangent = new THREE.Vector3(), desired = new THREE.Vector3(), toTarget = new THREE.Vector3();
    this.followers.forEach((follower, index) => {
      const compressedDistance = follower.trailingDistance * (formation === "train" ? .72 : formation === "station" ? .9 : formation === "scooter" ? 1.12 : 1);
      const catchingUp = !follower.formationJoined;
      const targetDistance = catchingUp ? 1.35 + index * 1.08 : compressedDistance;
      this.pointBehind(targetDistance, target);
      this.pointBehind(targetDistance + .34, tangent).sub(target).setY(0);
      if (tangent.lengthSq() < .0001) tangent.set(0, 0, 1); else tangent.normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x), offset = offsets[index];
      desired.copy(target);
      // Released sloths first converge on the walked route. Formation offsets
      // are introduced only after each animal has physically caught up.
      // Separation begins immediately during enclosure release. Waiting until
      // every friend joined formation sent all four animals toward one point
      // and allowed the exact-overlap blob captured in zoo QA.
      desired.addScaledVector(side, offset.x * (catchingUp ? .62 : 1)).addScaledVector(tangent, offset.y);
      desired.y = formation === "station" || formation === "train" ? target.y : floorYAt(desired.x, desired.z);
      toTarget.set(desired.x - follower.root.position.x, 0, desired.z - follower.root.position.z);
      const distance = toTarget.length();
      if (catchingUp && distance <= 2.15) follower.formationJoined = true;
      const maximumSpeed = catchingUp ? 3.25 : formation === "train" ? 1.65 : 2.35;
      const mobilityMaximumSpeed = formation === "scooter" ? catchingUp ? 10.5 : 9.1 : maximumSpeed;
      const speed = THREE.MathUtils.clamp(distance * (catchingUp ? 1.45 : 2.25), 0, mobilityMaximumSpeed);
      if (distance > .02) follower.velocity.lerp(toTarget.normalize().multiplyScalar(speed), 1 - Math.exp(-delta * 7));
      else follower.velocity.multiplyScalar(Math.exp(-delta * 8));
      follower.velocity.y = 0;
      follower.previous.copy(follower.root.position);
      follower.root.position.addScaledVector(follower.velocity, delta);
      const sampledFloor = floorYAt(follower.root.position.x, follower.root.position.z);
      const elevation = formation === "station" || formation === "train"
        ? this.routeElevationAt(follower.root.position, desired.y)
        : sampledFloor;
      const planarStep = Math.hypot(follower.root.position.x - follower.previous.x, follower.root.position.z - follower.previous.z);
      const maximumVerticalStep = Math.max(delta * .18, planarStep * 1.35);
      const releaseVerticalStep = catchingUp
        ? Math.max(delta * .72, planarStep * .58)
        : maximumVerticalStep;
      follower.groundY += THREE.MathUtils.clamp(elevation - follower.groundY, -releaseVerticalStep, releaseVerticalStep);
      follower.root.position.y = follower.groundY;
      const movedX = follower.root.position.x - follower.previous.x, movedZ = follower.root.position.z - follower.previous.z, locomoting = Math.hypot(movedX, movedZ) > .0012;
      if (locomoting) {
        const desiredYaw = Math.atan2(-movedX, -movedZ);
        const yawError = Math.atan2(Math.sin(desiredYaw - follower.root.rotation.y), Math.cos(desiredYaw - follower.root.rotation.y));
        follower.root.rotation.y += yawError * (1 - Math.exp(-delta * 8));
      }
      const gait = locomoting ? Math.sin(elapsed * 6.2 + follower.gaitPhase) : Math.sin(elapsed * 1.35 + follower.gaitPhase) * .18;
      follower.root.position.y += this.scooterMode ? Math.sin(elapsed * 4.2 + follower.gaitPhase) * .006 : locomoting ? Math.abs(gait) * .018 : gait * .008;
      follower.root.rotation.z = THREE.MathUtils.lerp(follower.root.rotation.z, this.scooterMode ? -follower.velocity.x * .008 : gait * (locomoting ? .018 : .008), 1 - Math.exp(-delta * 5));
      // Scooter mode swaps to an authored rider whose hind paws and foreclaws
      // are built around the real deck and grip coordinates. The shared world
      // anchor stays upright for collision and path-following in every mode.
      follower.root.rotation.x = THREE.MathUtils.lerp(follower.root.rotation.x, locomoting && !this.scooterMode ? -.025 : 0, 1 - Math.exp(-delta * 7));
      follower.root.userData.motion = this.scooterMode ? locomoting ? "ride-electric-scooter-upright" : "balance-on-electric-scooter-upright" : catchingUp ? locomoting ? "release-climb-down" : "release-catch-up" : locomoting ? "walk" : "idle";
    });
    const minimumSpacing = formation === "train" ? .86 : formation === "station" ? 1.05 : formation === "scooter" ? 1.78 : 1.34;
    // Iterative circle separation is deterministic even for identical
    // positions. A single pass skipped exact overlaps and could be undone by
    // the next target integration; four passes make the collision invariant
    // hold while the group turns or catches up.
    for (let iteration = 0; iteration < 4; iteration++) for (let left = 0; left < this.followers.length; left++) for (let right = left + 1; right < this.followers.length; right++) {
      const first = this.followers[left], second = this.followers[right], a = first.root.position, b = second.root.position;
      let dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
      if (distance >= minimumSpacing) continue;
      if (distance <= .001) { const angle = (left * 2.17 + right * 1.31) % (Math.PI * 2); dx = Math.cos(angle); dz = Math.sin(angle); distance = 1; }
      const correction = (minimumSpacing - distance) * .5 / distance; a.x -= dx * correction; a.z -= dz * correction; b.x += dx * correction; b.z += dz * correction;
      first.velocity.addScaledVector(new THREE.Vector3(-dx, 0, -dz).normalize(), .08);
      second.velocity.addScaledVector(new THREE.Vector3(dx, 0, dz).normalize(), .08);
    }
    for (const follower of this.followers) {
      let dx = follower.root.position.x - leader.x, dz = follower.root.position.z - leader.z, distance = Math.hypot(dx, dz);
      const clearance = formation === "train" ? .68 : formation === "scooter" ? 1.72 : 1.15;
      if (distance < clearance) {
        if (distance <= .001) { dx = Math.cos(follower.gaitPhase); dz = Math.sin(follower.gaitPhase); distance = 1; }
        const correction = (clearance - distance) / distance; follower.root.position.x += dx * correction; follower.root.position.z += dz * correction;
      }
      // Synchronize vehicle transforms after collision resolution so neither
      // the scooters nor their riders can visually drift back into a pile.
      follower.scooter.root.position.set(follower.root.position.x, follower.groundY, follower.root.position.z);
      follower.scooter.root.rotation.set(0, follower.root.rotation.y, 0);
      if (this.scooterMode) rollPersonalMobility(follower.scooter, Math.hypot(follower.root.position.x - follower.previous.x, follower.root.position.z - follower.previous.z), .19);
    }
  }

  allWithin(point: THREE.Vector3, radius: number) {
    return this.active && this.followers.every(follower => Math.hypot(follower.root.position.x - point.x, follower.root.position.z - point.z) <= radius);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.ownedTextures.forEach(texture => texture.dispose());
  }
}
