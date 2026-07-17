import * as THREE from "three";
import type { GameTextures } from "../rendering/textures";
import { createPremiumSlothFriend } from "./PremiumCharacter";

export type SlothPartyFormation = "grove" | "open" | "station" | "train";

type Breadcrumb = {
  position: THREE.Vector3;
};

type Follower = {
  root: THREE.Group;
  velocity: THREE.Vector3;
  previous: THREE.Vector3;
  gaitPhase: number;
  trailingDistance: number;
};

const FOLLOWER_TINTS = ["#7b6d56", "#675e50", "#806d52", "#706354"] as const;
const FORMATION_OFFSETS: Record<SlothPartyFormation, readonly THREE.Vector2[]> = {
  open: [new THREE.Vector2(-.72, 0), new THREE.Vector2(.72, -.25), new THREE.Vector2(-.48, -.6), new THREE.Vector2(.5, -.9)],
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

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "rescued-sloth-follower-party";
    this.root.visible = false;
    scene.add(this.root);
    FOLLOWER_TINTS.forEach((tint, index) => {
      const result = createPremiumSlothFriend(textures, quality, index, tint);
      result.root.name = `rescued-sloth-follower-${index + 1}`;
      result.root.userData.followingPlayer = true;
      result.root.userData.logicalId = `sloth-friend-${index + 1}`;
      result.root.scale.multiplyScalar(.88);
      this.root.add(result.root);
      this.ownedTextures.push(...result.ownedTextures);
      this.followers.push({
        root: result.root,
        velocity: new THREE.Vector3(),
        previous: new THREE.Vector3(),
        gaitPhase: index * 1.47,
        trailingDistance: 1.55 + index * 1.22,
      });
    });
  }

  get isActive() { return this.active; }

  setActive(active: boolean, leader?: THREE.Vector3, floorY = 0) {
    this.active = active;
    this.finaleStaged = false;
    this.root.visible = active;
    if (active && leader) this.reset(leader, floorY);
  }

  reset(leader: THREE.Vector3, floorY: number) {
    this.finaleStaged = false;
    this.lastLeader.copy(leader);
    this.breadcrumbs.length = 0;
    for (let index = 0; index < 54; index++) {
      this.breadcrumbs.push({ position: new THREE.Vector3(leader.x, floorY, leader.z + index * .13) });
    }
    this.followers.forEach((follower, index) => {
      const offset = FORMATION_OFFSETS.open[index];
      follower.root.position.set(leader.x + offset.x, floorY, leader.z + 1.55 + index * .72);
      follower.previous.copy(follower.root.position);
      follower.velocity.set(0, 0, 0);
    });
  }

  stageFinale(point: THREE.Vector3, floorYAt: (x: number, z: number) => number) {
    const positions = [new THREE.Vector2(-2.25, 2.5), new THREE.Vector2(-.7, 3.05), new THREE.Vector2(1.05, 2.35), new THREE.Vector2(2.65, 1.55)];
    this.active = true;
    this.finaleStaged = true;
    this.root.visible = true;
    this.breadcrumbs.length = 0;
    this.lastLeader.copy(point);
    this.followers.forEach((follower, index) => {
      const offset = positions[index], x = point.x + offset.x, z = point.z + offset.y;
      follower.root.position.set(x, floorYAt(x, z), z);
      follower.root.rotation.set(0, Math.PI, 0);
      follower.velocity.set(0, 0, 0);
      follower.previous.copy(follower.root.position);
      follower.root.traverse(object => { if (object instanceof THREE.Mesh) object.frustumCulled = false; });
    });
  }

  private recordLeader(leader: THREE.Vector3, floorY: number) {
    const planarDistance = Math.hypot(leader.x - this.lastLeader.x, leader.z - this.lastLeader.z);
    if (!this.breadcrumbs.length || planarDistance >= .12) {
      this.breadcrumbs.unshift({ position: new THREE.Vector3(leader.x, floorY, leader.z) });
      this.lastLeader.copy(leader);
      let accumulated = 0;
      for (let index = 1; index < this.breadcrumbs.length; index++) {
        accumulated += this.breadcrumbs[index - 1].position.distanceTo(this.breadcrumbs[index].position);
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
      const segment = start.distanceTo(end);
      if (remaining <= segment) return target.copy(start).lerp(end, remaining / Math.max(segment, .001));
      remaining -= segment;
    }
    return target.copy(this.breadcrumbs[this.breadcrumbs.length - 1].position);
  }

  update(
    elapsed: number,
    delta: number,
    leader: THREE.Vector3,
    floorYAt: (x: number, z: number) => number,
    formation: SlothPartyFormation = "open",
  ) {
    if (!this.active || this.disposed) return;
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
    const offsets = FORMATION_OFFSETS[formation], target = new THREE.Vector3(), tangent = new THREE.Vector3(), desired = new THREE.Vector3();
    this.followers.forEach((follower, index) => {
      const compressedDistance = follower.trailingDistance * (formation === "train" ? .54 : formation === "station" ? .78 : 1);
      this.pointBehind(compressedDistance, target);
      this.pointBehind(compressedDistance + .34, tangent).sub(target).setY(0);
      if (tangent.lengthSq() < .0001) tangent.set(0, 0, 1); else tangent.normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x), offset = offsets[index];
      desired.copy(target).addScaledVector(side, offset.x).addScaledVector(tangent, offset.y);
      desired.y = floorYAt(desired.x, desired.z);
      const toTarget = desired.clone().sub(follower.root.position), distance = toTarget.length();
      const speed = THREE.MathUtils.clamp(distance * 2.25, 0, formation === "train" ? 1.65 : 2.35);
      if (distance > .02) follower.velocity.lerp(toTarget.normalize().multiplyScalar(speed), 1 - Math.exp(-delta * 7));
      else follower.velocity.multiplyScalar(Math.exp(-delta * 8));
      follower.previous.copy(follower.root.position);
      follower.root.position.addScaledVector(follower.velocity, delta);
      follower.root.position.y = THREE.MathUtils.lerp(follower.root.position.y, floorYAt(follower.root.position.x, follower.root.position.z), 1 - Math.exp(-delta * 14));
      const movedX = follower.root.position.x - follower.previous.x, movedZ = follower.root.position.z - follower.previous.z, locomoting = Math.hypot(movedX, movedZ) > .0012;
      if (locomoting) {
        const desiredYaw = Math.atan2(-movedX, -movedZ);
        const yawError = Math.atan2(Math.sin(desiredYaw - follower.root.rotation.y), Math.cos(desiredYaw - follower.root.rotation.y));
        follower.root.rotation.y += yawError * (1 - Math.exp(-delta * 8));
      }
      const gait = locomoting ? Math.sin(elapsed * 6.2 + follower.gaitPhase) : Math.sin(elapsed * 1.35 + follower.gaitPhase) * .18;
      follower.root.position.y += locomoting ? Math.abs(gait) * .018 : gait * .008;
      follower.root.rotation.z = THREE.MathUtils.lerp(follower.root.rotation.z, gait * (locomoting ? .018 : .008), 1 - Math.exp(-delta * 5));
      follower.root.rotation.x = THREE.MathUtils.lerp(follower.root.rotation.x, locomoting ? -.025 : 0, 1 - Math.exp(-delta * 5));
      follower.root.userData.motion = locomoting ? "walk" : "idle";
    });
    const minimumSpacing = formation === "train" ? .52 : formation === "station" ? .68 : .82;
    for (let left = 0; left < this.followers.length; left++) for (let right = left + 1; right < this.followers.length; right++) {
      const a = this.followers[left].root.position, b = this.followers[right].root.position, dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
      if (distance <= .001 || distance >= minimumSpacing) continue;
      const correction = (minimumSpacing - distance) * .5 / distance; a.x -= dx * correction; a.z -= dz * correction; b.x += dx * correction; b.z += dz * correction;
    }
    for (const follower of this.followers) {
      const dx = follower.root.position.x - leader.x, dz = follower.root.position.z - leader.z, distance = Math.hypot(dx, dz), clearance = formation === "train" ? .48 : .72;
      if (distance <= .001 || distance >= clearance) continue;
      const correction = (clearance - distance) / distance; follower.root.position.x += dx * correction; follower.root.position.z += dz * correction;
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
