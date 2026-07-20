import * as THREE from "three";
import type { GameTextures } from "../rendering/textures";
import { createElectricScooter, rollPersonalMobility, type PersonalMobilityVehicle } from "./PersonalMobility";
import { createGaryPolarBear, type ZooAnimalRig } from "./ZooAnimals";
import { markAuthoredZooAnimalDisposed } from "./animals/AuthoredZooAnimalAssets";

type GaryMotion = "hidden" | "eating" | "climbing" | "following";
type Breadcrumb = { position: THREE.Vector3 };

const GARY_HABITAT_START = new THREE.Vector3(39, 0, -48);
const GARY_FENCE_APPROACH = new THREE.Vector3(34, 0, -42);
const GARY_FENCE_LANDING = new THREE.Vector3(31.5, 0, -39.5);
const GARY_VISITOR_PATH = new THREE.Vector3(28.5, 0, -37.5);

/**
 * Scene-owned Gary state. The companion is deliberately independent from the
 * streamed zoo so his jam markings, follow state, and scooter pose survive the
 * shuttle, museum, subway, and Central Park world transitions.
 */
export class GaryCompanion {
  readonly root = new THREE.Group();
  private readonly animal: ZooAnimalRig;
  private readonly scooter: PersonalMobilityVehicle;
  private readonly jam = new THREE.Group();
  private readonly breadcrumbs: Breadcrumb[] = [];
  private readonly lastLeader = new THREE.Vector3();
  private readonly previous = new THREE.Vector3();
  private motion: GaryMotion = "hidden";
  private motionStarted = 0;
  private scooterMode = false;
  private disposed = false;
  private reviewStaged = false;
  private jamMaterialApplied = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "fed-gary-persistent-companion";
    this.root.visible = false;
    scene.add(this.root);

    this.animal = createGaryPolarBear(textures, quality);
    this.animal.root.name = "fed-gary-authored-follow-and-rider-rig";
    this.root.add(this.animal.root);

    this.jam.name = "gary-persistent-red-jam-splotches";
    this.jam.visible = false;
    // Keep the markings beside the asynchronously hydrated host, not inside
    // it: authored hydration replaces every host child when the GLB is ready.
    // As a sibling, these persistent project-authored markings survive that
    // replacement and still inherit Gary's world transform.
    this.root.add(this.jam);

    this.scooter = createElectricScooter(5);
    this.scooter.root.name = "fed-gary-sixth-ridden-electric-scooter";
    this.scooter.root.visible = false;
    this.root.add(this.scooter.root);
  }

  get isFed() { return this.motion !== "hidden"; }
  get isFollowing() { return this.motion === "following"; }
  get isScooterMode() { return this.scooterMode; }

  feed(elapsed: number, floorY: number) {
    if (this.isFed) return;
    this.motion = "eating";
    this.motionStarted = elapsed;
    this.reviewStaged = false;
    this.root.visible = true;
    this.root.position.set(GARY_HABITAT_START.x, floorY, GARY_HABITAT_START.z);
    this.root.rotation.set(0, -.72, 0);
    this.previous.copy(this.root.position);
    this.animal.root.userData.animationState = "forage";
    this.seedBreadcrumbs(this.root.position);
  }

  setVisible(visible: boolean) {
    this.root.visible = visible && this.isFed;
  }

  setScooterMode(active: boolean) {
    this.scooterMode = active && this.isFed;
    this.scooter.root.visible = this.scooterMode;
    this.root.userData.ridingElectricScooter = this.scooterMode;
    if (this.scooterMode) {
      // Gary balances from his hind paws with his chest pitched toward the
      // real handlebars; the walk clip remains off while the scooter rolls.
      this.animal.root.position.set(0, .9, .3);
      this.animal.root.rotation.set(.94, 0, 0);
      this.animal.root.scale.setScalar(.72);
      this.jam.position.set(0, .9, .3);
      this.jam.rotation.set(.94, 0, 0);
      this.jam.scale.setScalar(.72);
      this.animal.root.userData.animationState = "idle";
    } else {
      this.animal.root.position.set(0, 0, 0);
      this.animal.root.rotation.set(0, 0, 0);
      this.animal.root.scale.setScalar(1);
      this.jam.position.set(0, 0, 0);
      this.jam.rotation.set(0, 0, 0);
      this.jam.scale.setScalar(1);
    }
  }

  reset(leader: THREE.Vector3, floorY: number) {
    if (!this.isFed) return;
    this.motion = "following";
    this.reviewStaged = false;
    this.root.visible = true;
    this.root.position.set(leader.x + 2.3, floorY, leader.z + 4.6);
    this.previous.copy(this.root.position);
    this.seedBreadcrumbs(new THREE.Vector3(leader.x, floorY, leader.z));
  }

  stageQualityReview(viewer: THREE.Vector3, viewerYaw: number, floorYAt: (x: number, z: number) => number, scooter = false) {
    if (!this.isFed) this.feed(0, floorYAt(viewer.x, viewer.z));
    this.motion = "following";
    this.jam.visible = true;
    this.reviewStaged = true;
    this.root.visible = true;
    this.setScooterMode(scooter);
    this.animal.root.userData.animationState = "idle";
    const forward = new THREE.Vector3(-Math.sin(viewerYaw), 0, -Math.cos(viewerYaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    this.root.position.copy(viewer).addScaledVector(forward, scooter ? 7 : 7.2).addScaledVector(right, scooter ? 4 : .65);
    this.root.position.y = floorYAt(this.root.position.x, this.root.position.z);
    this.root.rotation.set(0, viewerYaw + Math.PI - .22, 0);
    this.previous.copy(this.root.position);
    this.seedBreadcrumbs(viewer);
    this.syncScooter(0);
  }

  private seedBreadcrumbs(leader: THREE.Vector3) {
    this.breadcrumbs.length = 0;
    for (let index = 0; index < 72; index++) this.breadcrumbs.push({ position: new THREE.Vector3(leader.x, leader.y, leader.z + index * .14) });
    this.lastLeader.copy(leader);
  }

  private recordLeader(leader: THREE.Vector3, floorY: number) {
    const distance = Math.hypot(leader.x - this.lastLeader.x, leader.z - this.lastLeader.z);
    if (distance >= .12) {
      this.breadcrumbs.unshift({ position: new THREE.Vector3(leader.x, floorY, leader.z) });
      this.lastLeader.set(leader.x, floorY, leader.z);
      if (this.breadcrumbs.length > 160) this.breadcrumbs.length = 160;
    } else if (this.breadcrumbs[0]) this.breadcrumbs[0].position.set(leader.x, floorY, leader.z);
  }

  private pointBehind(distance: number, target: THREE.Vector3) {
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

  update(elapsed: number, delta: number, leader: THREE.Vector3, floorYAt: (x: number, z: number) => number, scooter = false) {
    if (!this.isFed || this.disposed || !this.root.visible) return;
    const sinceFed = elapsed - this.motionStarted;
    if (this.motion === "eating") {
      this.jam.visible = sinceFed >= .48;
      if (this.jam.visible) this.applyJamMaterial();
      this.animal.root.userData.animationState = "forage";
      if (sinceFed >= 1.65) this.motion = "climbing";
    }
    if (this.motion === "climbing") {
      const climbTime = sinceFed - 1.65;
      let from = GARY_HABITAT_START, to = GARY_FENCE_APPROACH, amount = THREE.MathUtils.clamp(climbTime / 1.45, 0, 1), lift = 0;
      if (climbTime > 1.45 && climbTime <= 2.85) {
        from = GARY_FENCE_APPROACH; to = GARY_FENCE_LANDING; amount = THREE.MathUtils.clamp((climbTime - 1.45) / 1.4, 0, 1); lift = Math.sin(amount * Math.PI) * 2.7;
      } else if (climbTime > 2.85) {
        from = GARY_FENCE_LANDING; to = GARY_VISITOR_PATH; amount = THREE.MathUtils.clamp((climbTime - 2.85) / 1.05, 0, 1);
      }
      this.previous.copy(this.root.position);
      this.root.position.lerpVectors(from, to, amount);
      this.root.position.y = floorYAt(this.root.position.x, this.root.position.z) + lift;
      const movedX = this.root.position.x - this.previous.x, movedZ = this.root.position.z - this.previous.z;
      if (Math.hypot(movedX, movedZ) > .001) this.root.rotation.y = Math.atan2(-movedX, -movedZ);
      this.root.rotation.x = lift > .05 ? -.16 * Math.sin(amount * Math.PI) : 0;
      this.animal.root.userData.animationState = "walk";
      this.root.userData.motion = lift > .05 ? "authored-bear-climb-over-enclosure" : "authored-bear-walk-to-fence";
      if (climbTime >= 3.9) {
        this.motion = "following";
        this.root.rotation.x = 0;
        this.seedBreadcrumbs(new THREE.Vector3(leader.x, floorYAt(leader.x, leader.z), leader.z));
      }
    } else if (this.motion === "following" && !this.reviewStaged) {
      const leaderFloor = floorYAt(leader.x, leader.z);
      if (Math.hypot(leader.x - this.lastLeader.x, leader.z - this.lastLeader.z) > 18) this.reset(leader, leaderFloor);
      this.recordLeader(leader, leaderFloor);
      const target = this.pointBehind(scooter ? 6.4 : 5.2, new THREE.Vector3());
      const tangent = this.pointBehind(scooter ? 6.75 : 5.55, new THREE.Vector3()).sub(target).setY(0);
      if (tangent.lengthSq() < .0001) tangent.set(0, 0, 1); else tangent.normalize();
      const side = new THREE.Vector3(-tangent.z, 0, tangent.x);
      target.addScaledVector(side, scooter ? 2.35 : 1.7);
      const dx = target.x - this.root.position.x, dz = target.z - this.root.position.z, distance = Math.hypot(dx, dz);
      const speed = THREE.MathUtils.clamp(distance * 2, 0, scooter ? 9 : 2.45);
      this.previous.copy(this.root.position);
      if (distance > .015) {
        this.root.position.x += dx / distance * speed * delta;
        this.root.position.z += dz / distance * speed * delta;
      }
      this.root.position.y = floorYAt(this.root.position.x, this.root.position.z);
      const movedX = this.root.position.x - this.previous.x, movedZ = this.root.position.z - this.previous.z, locomoting = Math.hypot(movedX, movedZ) > .001;
      if (locomoting) {
        const desiredYaw = Math.atan2(-movedX, -movedZ);
        const yawError = Math.atan2(Math.sin(desiredYaw - this.root.rotation.y), Math.cos(desiredYaw - this.root.rotation.y));
        this.root.rotation.y += yawError * (1 - Math.exp(-delta * 7));
      }
      this.animal.root.userData.animationState = scooter ? "idle" : locomoting ? "walk" : "idle";
      this.root.userData.motion = scooter ? "gary-balanced-on-sixth-scooter" : locomoting ? "gary-following-player" : "gary-idle-with-jam";
    }
    this.setScooterMode(scooter);
    if (this.jam.visible) this.applyJamMaterial();
    this.animal.update(elapsed, delta);
    this.syncScooter(Math.hypot(this.root.position.x - this.previous.x, this.root.position.z - this.previous.z));
  }

  private applyJamMaterial() {
    if (this.jamMaterialApplied || this.animal.root.userData.authoredZooAnimalStatus !== "ready") return;
    let applied = false;
    this.animal.root.traverse(object => {
      if (!(object instanceof THREE.SkinnedMesh) || !/body|continuousanatomicalskin/i.test(`${object.name} ${object.geometry.name}`)) return;
      const surfaces = Array.isArray(object.material) ? object.material : [object.material];
      surfaces.forEach(surface => {
        if (!(surface instanceof THREE.MeshStandardMaterial) || !surface.map) return;
        surface.onBeforeCompile = shader => {
          shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
            vec2 garyJamA = (vMapUv - vec2(.16, .28)) / vec2(.038, .055);
            vec2 garyJamB = (vMapUv - vec2(.37, .62)) / vec2(.047, .034);
            vec2 garyJamC = (vMapUv - vec2(.58, .23)) / vec2(.031, .061);
            vec2 garyJamD = (vMapUv - vec2(.76, .52)) / vec2(.052, .037);
            vec2 garyJamE = (vMapUv - vec2(.9, .78)) / vec2(.029, .046);
            float garyJamMask = max(max(1.0 - smoothstep(.68, 1.0, dot(garyJamA, garyJamA)), 1.0 - smoothstep(.67, 1.0, dot(garyJamB, garyJamB))), max(max(1.0 - smoothstep(.7, 1.0, dot(garyJamC, garyJamC)), 1.0 - smoothstep(.66, 1.0, dot(garyJamD, garyJamD))), 1.0 - smoothstep(.68, 1.0, dot(garyJamE, garyJamE))));
            float garyJamField = sin(vMapUv.x * 31.0 + sin(vMapUv.y * 17.0) * 1.7) * sin(vMapUv.y * 27.0 - cos(vMapUv.x * 19.0) * 1.4);
            garyJamMask = max(garyJamMask, smoothstep(.86, .965, garyJamField));
            float garyJamEdge = fract(sin(dot(vMapUv * 173.0, vec2(12.9898, 78.233))) * 43758.5453);
            garyJamMask *= .74 + garyJamEdge * .26;
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.38, .004, .012), garyJamMask * .96);`);
        };
        surface.customProgramCacheKey = () => "gary-persistent-jam-splotches-v4";
        surface.userData.garyPersistentJamSplotches = true;
        surface.needsUpdate = true;
        applied = true;
      });
    });
    this.jamMaterialApplied = applied;
  }

  private syncScooter(distance: number) {
    this.scooter.root.position.set(0, 0, 0);
    this.scooter.root.rotation.set(0, 0, 0);
    if (this.scooterMode) rollPersonalMobility(this.scooter, distance, .19);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    markAuthoredZooAnimalDisposed(this.animal.root);
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material));
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.animal.ownedTextures?.forEach(texture => texture.dispose());
  }
}
