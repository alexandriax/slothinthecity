import * as THREE from "three";
import type { GameTextures } from "../rendering/textures";
import {
  createAldabraTortoise,
  createAmericanBison,
  createAmericanFlamingo,
  createBlueAndGoldMacaw,
  createEasternGraySquirrel,
  createGreenAracari,
  createMallard,
  createRedPanda,
  createScarletIbis,
  createSeaLion,
  createSpiderMonkey,
  createSunConure,
  createZebra,
  type ZooAnimalRig,
} from "./ZooAnimals";
import { markAuthoredZooAnimalsDisposed } from "./animals/AuthoredZooAnimalAssets";
import {
  companionFormationSlot,
  SharedCompanionRoute,
  solveCompanionCollisions,
  type CompanionCollisionBody,
  type CompanionFormation,
  type CompanionNavigationSurface,
} from "./CompanionNavigation";
import { createElectricScooter, rollPersonalMobility, type PersonalMobilityVehicle } from "./PersonalMobility";

export type OptionalCompanionId =
  | "central-park-mallard"
  | "central-park-squirrel"
  | "sun-conure"
  | "blue-and-gold-macaw"
  | "scarlet-ibis"
  | "green-aracari"
  | "california-sea-lion"
  | "spider-monkey"
  | "plains-zebra"
  | "red-panda"
  | "aldabra-tortoise"
  | "american-flamingo"
  | "american-bison";

type CompanionDefinition = {
  id: OptionalCompanionId;
  radius: number;
  scale: number;
  riderScale: number;
  groundOffset: number;
  rideY: number;
  ridePitch: number;
  movingMotion: string;
  idleMotion: string;
  factory: (textures: GameTextures, quality: number) => ZooAnimalRig;
};

const COMPANION_DEFINITIONS: readonly CompanionDefinition[] = [
  { id: "central-park-mallard", radius: .38, scale: 1, riderScale: .88, groundOffset: .03, rideY: 1.39, ridePitch: 0, movingMotion: "walk", idleMotion: "idle", factory: createMallard },
  { id: "central-park-squirrel", radius: .32, scale: 1, riderScale: .84, groundOffset: .02, rideY: 1.42, ridePitch: 0, movingMotion: "walk", idleMotion: "idle", factory: createEasternGraySquirrel },
  { id: "sun-conure", radius: .3, scale: 1.08, riderScale: .92, groundOffset: .72, rideY: 1.39, ridePitch: 0, movingMotion: "short-flight", idleMotion: "perch", factory: createSunConure },
  { id: "blue-and-gold-macaw", radius: .36, scale: 1, riderScale: .82, groundOffset: .78, rideY: 1.37, ridePitch: 0, movingMotion: "short-flight", idleMotion: "perch", factory: createBlueAndGoldMacaw },
  { id: "scarlet-ibis", radius: .34, scale: 1.04, riderScale: .82, groundOffset: .68, rideY: 1.36, ridePitch: 0, movingMotion: "short-flight", idleMotion: "perch", factory: createScarletIbis },
  { id: "green-aracari", radius: .31, scale: 1.08, riderScale: .9, groundOffset: .7, rideY: 1.38, ridePitch: 0, movingMotion: "short-flight", idleMotion: "perch", factory: createGreenAracari },
  { id: "california-sea-lion", radius: .92, scale: .68, riderScale: .54, groundOffset: .03, rideY: .38, ridePitch: -.18, movingMotion: "swim", idleMotion: "surface", factory: (textures, quality) => createSeaLion(textures, quality, 0) },
  { id: "spider-monkey", radius: .52, scale: .9, riderScale: .7, groundOffset: .02, rideY: .3, ridePitch: -.08, movingMotion: "walk", idleMotion: "idle", factory: (textures, quality) => createSpiderMonkey(textures, quality, 0) },
  { id: "plains-zebra", radius: .94, scale: .66, riderScale: .42, groundOffset: .02, rideY: .29, ridePitch: -.05, movingMotion: "walk", idleMotion: "idle", factory: (textures, quality) => createZebra(textures, quality, 0) },
  { id: "red-panda", radius: .54, scale: .88, riderScale: .68, groundOffset: .02, rideY: .3, ridePitch: -.08, movingMotion: "walk", idleMotion: "idle", factory: createRedPanda },
  { id: "aldabra-tortoise", radius: .82, scale: .72, riderScale: .56, groundOffset: .02, rideY: .3, ridePitch: 0, movingMotion: "walk", idleMotion: "idle", factory: createAldabraTortoise },
  { id: "american-flamingo", radius: .58, scale: .7, riderScale: .46, groundOffset: .02, rideY: .3, ridePitch: -.04, movingMotion: "walk", idleMotion: "idle", factory: (textures, quality) => createAmericanFlamingo(textures, quality, 0) },
  { id: "american-bison", radius: 1.08, scale: .58, riderScale: .4, groundOffset: .02, rideY: .28, ridePitch: -.05, movingMotion: "walk", idleMotion: "idle", factory: (textures, quality) => createAmericanBison(textures, quality, 0) },
] as const;

type OptionalCompanion = {
  definition: CompanionDefinition;
  root: THREE.Group;
  rig: ZooAnimalRig;
  scooter: PersonalMobilityVehicle;
  velocity: THREE.Vector3;
  previous: THREE.Vector3;
  groundY: number;
  recruitmentOrder: number;
  recruited: boolean;
  collisionBody: CompanionCollisionBody;
};

const NO_COLLISION_BODIES: readonly CompanionCollisionBody[] = Object.freeze([]);

/**
 * Persistent optional-animal party. Habitat worlds only own their display
 * animals; these authored instances belong to the campaign scene and therefore
 * survive zoo, shuttle, museum, subway, and Central Park streaming transitions.
 */
export class AnimalMenagerie {
  readonly root = new THREE.Group();
  private readonly route = new SharedCompanionRoute();
  private readonly definitions = new Map<OptionalCompanionId, CompanionDefinition>();
  private readonly companions = new Map<OptionalCompanionId, OptionalCompanion>();
  private readonly recruited: OptionalCompanion[] = [];
  private readonly activeCollisionBodies: CompanionCollisionBody[] = [];
  private readonly solverBodies: CompanionCollisionBody[] = [];
  private readonly ownedTextures = new Set<THREE.Texture>();
  private readonly target = new THREE.Vector3();
  private readonly tangent = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private readonly toTarget = new THREE.Vector3();
  private readonly side = new THREE.Vector3();
  private readonly slot = new THREE.Vector2();
  private readonly lastLeader = new THREE.Vector3();
  private readonly textures: GameTextures;
  private readonly quality: number;
  private active = true;
  private worldVisible = true;
  private scooterMode = false;
  private finaleStaged = false;
  private disposed = false;
  private nextRecruitmentOrder = 0;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.textures = textures;
    this.quality = quality;
    this.root.name = "persistent-optional-animal-menagerie";
    this.root.userData.sceneOwnedCompanionParty = true;
    scene.add(this.root);
    COMPANION_DEFINITIONS.forEach(definition => this.definitions.set(definition.id, definition));
  }

  get isActive() { return this.active; }
  get isScooterMode() { return this.scooterMode; }
  get count() { return this.recruited.length; }
  get riderCount() { return this.count + 1; }
  get recruitedIds(): readonly OptionalCompanionId[] { return this.recruited.map(companion => companion.definition.id); }
  get collisionBodies(): readonly CompanionCollisionBody[] {
    return this.active && this.worldVisible ? this.activeCollisionBodies : NO_COLLISION_BODIES;
  }

  has(id: OptionalCompanionId) { return this.companions.get(id)?.recruited ?? false; }

  private createCompanion(definition: CompanionDefinition) {
    const anchor = new THREE.Group();
    anchor.name = `${definition.id}-persistent-companion-anchor`;
    anchor.visible = false;
    anchor.userData.logicalId = definition.id;
    anchor.userData.followingPlayer = true;

    const rig = definition.factory(this.textures, this.quality);
    rig.root.name = `${definition.id}-authored-persistent-companion-rig`;
    rig.root.scale.setScalar(definition.scale);
    rig.root.position.y = definition.groundOffset;
    anchor.add(rig.root);
    rig.ownedTextures?.forEach(texture => this.ownedTextures.add(texture));

    const scooterIndex = COMPANION_DEFINITIONS.findIndex(candidate => candidate.id === definition.id);
    const scooter = createElectricScooter(scooterIndex + 6);
    scooter.root.name = `${definition.id}-ridden-electric-scooter`;
    scooter.root.visible = false;
    anchor.add(scooter.root);

    const velocity = new THREE.Vector3();
    const companion: OptionalCompanion = {
      definition,
      root: anchor,
      rig,
      scooter,
      velocity,
      previous: new THREE.Vector3(),
      groundY: 0,
      recruitmentOrder: -1,
      recruited: false,
      collisionBody: { id: definition.id, root: anchor, velocity, radius: definition.radius },
    };
    this.companions.set(definition.id, companion);
    this.root.add(anchor);
    return companion;
  }

  recruit(id: OptionalCompanionId, position?: THREE.Vector3, floorY?: number) {
    const definition = this.definitions.get(id);
    if (!definition || this.has(id) || this.disposed) return false;
    const companion = this.companions.get(id) ?? this.createCompanion(definition);
    companion.recruited = true;
    companion.recruitmentOrder = this.nextRecruitmentOrder++;
    this.recruited.push(companion);
    this.recruited.sort((left, right) => left.recruitmentOrder - right.recruitmentOrder);
    this.activeCollisionBodies.push(companion.collisionBody);
    const y = floorY ?? position?.y ?? 0;
    if (position) companion.root.position.set(position.x, y, position.z);
    else if (this.route.hasPoints) {
      companionFormationSlot(this.recruited.length - 1, "open", this.slot);
      this.route.sample(this.slot.y, companion.root.position);
      companion.root.position.y = y || companion.root.position.y;
    } else companion.root.position.set(this.lastLeader.x, y, this.lastLeader.z + 1.8 + this.recruited.length * 1.1);
    companion.groundY = companion.root.position.y;
    companion.previous.copy(companion.root.position);
    companion.velocity.set(0, 0, 0);
    companion.root.visible = this.active && this.worldVisible;
    companion.root.userData.motion = "quest-complete-joining-menagerie";
    this.applyRiderPose(companion);
    return true;
  }

  setActive(active: boolean, leader?: THREE.Vector3, floorY = 0) {
    this.active = active;
    this.finaleStaged = false;
    this.root.visible = active && this.worldVisible;
    this.recruited.forEach(companion => { companion.root.visible = active && this.worldVisible; });
    if (active && leader) this.reset(leader, floorY);
  }

  setVisible(visible: boolean) {
    this.worldVisible = visible;
    this.root.visible = this.active && visible;
    this.recruited.forEach(companion => { companion.root.visible = this.active && visible; });
  }

  setScooterMode(active: boolean) {
    this.scooterMode = active;
    this.recruited.forEach(companion => this.applyRiderPose(companion));
  }

  private applyRiderPose(companion: OptionalCompanion) {
    const definition = companion.definition;
    companion.scooter.root.visible = companion.recruited && this.scooterMode;
    companion.root.userData.ridingElectricScooter = this.scooterMode;
    if (this.scooterMode) {
      companion.rig.root.scale.setScalar(definition.scale * definition.riderScale);
      companion.rig.root.position.set(0, definition.rideY, .08);
      companion.rig.root.rotation.set(definition.ridePitch, 0, 0);
    } else {
      companion.rig.root.scale.setScalar(definition.scale);
      companion.rig.root.position.set(0, definition.groundOffset, 0);
      companion.rig.root.rotation.set(0, 0, 0);
    }
  }

  reset(leader: THREE.Vector3, floorY: number, yaw = 0) {
    this.finaleStaged = false;
    this.lastLeader.set(leader.x, floorY, leader.z);
    this.route.seed(leader, floorY, yaw);
    this.recruited.forEach((companion, index) => {
      companionFormationSlot(index, "open", this.slot);
      const sideX = Math.cos(yaw), sideZ = -Math.sin(yaw);
      const backX = Math.sin(yaw), backZ = Math.cos(yaw);
      companion.root.position.set(
        leader.x + sideX * this.slot.x + backX * this.slot.y,
        floorY,
        leader.z + sideZ * this.slot.x + backZ * this.slot.y,
      );
      companion.groundY = floorY;
      companion.previous.copy(companion.root.position);
      companion.velocity.set(0, 0, 0);
    });
  }

  allWithin(point: THREE.Vector3, radius: number) {
    return this.active && this.recruited.every(companion => Math.hypot(companion.root.position.x - point.x, companion.root.position.z - point.z) <= radius);
  }

  stageFinale(point: THREE.Vector3, floorYAt: (x: number, z: number) => number, slotOffset = 4) {
    this.active = true;
    this.worldVisible = true;
    this.root.visible = true;
    this.finaleStaged = true;
    this.setScooterMode(false);
    this.lastLeader.copy(point);
    this.recruited.forEach((companion, index) => {
      companionFormationSlot(index + slotOffset, "grove", this.slot);
      const x = point.x + this.slot.x, z = point.z + this.slot.y;
      companion.groundY = floorYAt(x, z);
      companion.root.position.set(x, companion.groundY, z);
      companion.root.rotation.set(0, Math.atan2(point.x - x, point.z - z), 0);
      companion.velocity.set(0, 0, 0);
      companion.previous.copy(companion.root.position);
      companion.root.visible = true;
      companion.root.userData.motion = "menagerie-finale-idle";
      companion.rig.root.userData.animationState = companion.definition.idleMotion;
    });
  }

  /**
   * Call after the legacy sloth/Gary controllers have updated. Their body
   * references can be supplied in `externalBodies`; the final solve then owns
   * cross-party separation and world projection for the complete menagerie.
   */
  update(
    elapsed: number,
    delta: number,
    leader: THREE.Vector3,
    navigation: CompanionNavigationSurface,
    formation: CompanionFormation = "open",
    externalBodies: readonly CompanionCollisionBody[] = NO_COLLISION_BODIES,
  ) {
    if (!this.active || this.disposed) return;
    const step = THREE.MathUtils.clamp(delta, 0, .08);
    if (this.finaleStaged) {
      this.recruited.forEach((companion, index) => {
        companion.rig.root.userData.animationState = companion.definition.idleMotion;
        companion.rig.update(elapsed, step);
        companion.root.position.y = companion.groundY + Math.sin(elapsed * 1.15 + index * 1.7) * .006;
      });
      return;
    }

    const leaderFloor = navigation.floorYAt(leader.x, leader.z);
    if (!this.route.hasPoints || Math.hypot(leader.x - this.lastLeader.x, leader.z - this.lastLeader.z) > 18 || Math.abs(leaderFloor - this.lastLeader.y) > 7) {
      this.reset(leader, leaderFloor);
    }
    this.route.record(leader, leaderFloor);
    this.lastLeader.set(leader.x, leaderFloor, leader.z);

    let formationOffset = 0;
    for (const body of externalBodies) if (body.enabled !== false) formationOffset++;
    this.recruited.forEach((companion, index) => {
      companionFormationSlot(index + formationOffset, formation, this.slot);
      this.route.sample(this.slot.y, this.target);
      this.route.sample(this.slot.y + .36, this.tangent).sub(this.target).setY(0);
      if (this.tangent.lengthSq() < .0001) this.tangent.set(0, 0, 1); else this.tangent.normalize();
      this.side.set(-this.tangent.z, 0, this.tangent.x);
      this.desired.copy(this.target).addScaledVector(this.side, this.slot.x);
      this.desired.y = formation === "station" || formation === "train"
        ? this.target.y
        : navigation.floorYAt(this.desired.x, this.desired.z);
      this.toTarget.set(this.desired.x - companion.root.position.x, 0, this.desired.z - companion.root.position.z);
      const distance = this.toTarget.length();
      const catchingUp = distance > (formation === "scooter" ? 4.2 : 3.2);
      const maximumSpeed = formation === "scooter" ? catchingUp ? 10.8 : 9.05 : catchingUp ? 3.45 : formation === "train" ? 1.7 : 2.48;
      const speed = THREE.MathUtils.clamp(distance * (catchingUp ? 1.55 : 2.3), 0, maximumSpeed);
      if (distance > .015) companion.velocity.lerp(this.toTarget.multiplyScalar(speed / distance), 1 - Math.exp(-step * 7));
      else companion.velocity.multiplyScalar(Math.exp(-step * 8));
      companion.velocity.y = 0;
      companion.previous.copy(companion.root.position);

      const travel = companion.velocity.length() * step;
      const substeps = Math.max(1, Math.ceil(travel / .24));
      for (let substep = 0; substep < substeps; substep++) {
        companion.root.position.addScaledVector(companion.velocity, step / substeps);
        navigation.resolveBody?.(companion.root.position, companion.velocity, companion.definition.radius);
      }

      const sampledFloor = navigation.floorYAt(companion.root.position.x, companion.root.position.z);
      const elevation = formation === "station" || formation === "train"
        ? this.route.elevationAt(companion.root.position, this.desired.y)
        : sampledFloor;
      const planarStep = Math.hypot(companion.root.position.x - companion.previous.x, companion.root.position.z - companion.previous.z);
      const maximumVerticalStep = Math.max(step * .28, planarStep * 1.25);
      companion.groundY += THREE.MathUtils.clamp(elevation - companion.groundY, -maximumVerticalStep, maximumVerticalStep);
      companion.root.position.y = companion.groundY;

      const movedX = companion.root.position.x - companion.previous.x, movedZ = companion.root.position.z - companion.previous.z;
      const moved = Math.hypot(movedX, movedZ), locomoting = moved > .001;
      if (locomoting) {
        const desiredYaw = Math.atan2(-movedX, -movedZ);
        const yawError = Math.atan2(Math.sin(desiredYaw - companion.root.rotation.y), Math.cos(desiredYaw - companion.root.rotation.y));
        companion.root.rotation.y += yawError * (1 - Math.exp(-step * 8));
      }
      companion.rig.root.userData.animationState = this.scooterMode
        ? companion.definition.idleMotion
        : locomoting ? companion.definition.movingMotion : companion.definition.idleMotion;
      companion.root.userData.motion = this.scooterMode
        ? locomoting ? "ride-electric-scooter-with-menagerie" : "balance-on-electric-scooter-with-menagerie"
        : locomoting ? "follow-player" : "companion-idle";
      companion.rig.update(elapsed, step);
      if (!this.scooterMode && companion.definition.groundOffset > .2) {
        companion.rig.root.position.y = companion.definition.groundOffset + Math.sin(elapsed * 4.4 + index * 1.3) * .035;
      }
      if (this.scooterMode) rollPersonalMobility(companion.scooter, moved, .19);
    });

    this.solverBodies.length = 0;
    for (const body of externalBodies) this.solverBodies.push(body);
    for (const body of this.activeCollisionBodies) this.solverBodies.push(body);
    solveCompanionCollisions(this.solverBodies, {
      leader,
      resolveBody: navigation.resolveBody,
      scooter: formation === "scooter",
    });
    this.recruited.forEach(companion => {
      companion.groundY = formation === "station" || formation === "train"
        ? this.route.elevationAt(companion.root.position, companion.groundY)
        : navigation.floorYAt(companion.root.position.x, companion.root.position.z);
      companion.root.position.y = companion.groundY;
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    markAuthoredZooAnimalsDisposed(this.root);
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

export const OPTIONAL_COMPANION_IDS = Object.freeze(COMPANION_DEFINITIONS.map(definition => definition.id));
