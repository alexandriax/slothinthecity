import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";
import {
  createCampaignLandmarks,
  SUBWAY_ENTRY_TRIGGER,
  type CampaignLandmarks,
} from "./CampaignLandmarks";
import { createParkRowboat, type ParkRowboat } from "./ParkRowboat";
import { createParkUtilityCart, type ParkUtilityCart } from "./ParkUtilityCart";
import {
  addCentralParkLighting,
  buildRealisticWorld,
  LAKE_SOUTHEAST_CART_TARGET,
  START,
  terrainY,
  type RealisticWorld,
  type WorldObstacle,
} from "./RealisticWorld";

export const CENTRAL_PARK_PRESENTATION = Object.freeze({
  background: "#8e9a89",
  fog: "#999e89",
  fogDensity: .00275,
  toneMappingExposure: .96,
  cameraFar: 900,
});

function canvasTexture(
  width: number,
  height: number,
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([21, 54, 35, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Central Park homecoming marker requires canvas textures");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function sanctuarySignTexture() {
  return canvasTexture(1280, 440, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#173d2a");
    gradient.addColorStop(1, "#081d13");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#d9ef8b";
    context.lineWidth = 13;
    context.strokeRect(20, 20, width - 40, height - 40);
    context.fillStyle = "#f4f0dc";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 92px Georgia, serif";
    context.fillText("HOME GROVE", width / 2, 160);
    context.fillStyle = "#d9ef8b";
    context.font = "700 39px Helvetica, Arial, sans-serif";
    context.letterSpacing = "10px";
    context.fillText("SLOTH SANCTUARY  ·  CENTRAL PARK", width / 2, 294);
  });
}

/**
 * Lifecycle adapter for the original Central Park level. It deliberately
 * composes the opening world's exact builders instead of maintaining a second
 * terrain, tree, landmark, lighting, lake, or transit-exit implementation.
 */
export class CentralParkReturnWorld {
  readonly root = new THREE.Scene();
  readonly spawn = SUBWAY_ENTRY_TRIGGER.clone();
  readonly spawnYaw = Math.PI;
  readonly sanctuaryTarget = START.clone();
  readonly cameraPosition = START.clone().add(new THREE.Vector3(11, 6.4, 12));
  readonly cameraTarget = START.clone().add(new THREE.Vector3(0, 2.2, 0));
  readonly environmentSettings = CENTRAL_PARK_PRESENTATION;

  private readonly world: RealisticWorld;
  private readonly campaign: CampaignLandmarks;
  private readonly sun: THREE.DirectionalLight;
  private readonly carts: ParkUtilityCart[];
  private readonly rowboats: ParkRowboat[];
  private readonly homeMarker = new THREE.Group();
  private readonly homeMarkerTexture: THREE.Texture;
  private readonly lastPlayer = this.spawn.clone();
  private readonly collectedBuds = new Set<number>();
  private elapsed = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    const tier = THREE.MathUtils.clamp(quality, .45, 1);
    this.root.name = "central-park-homecoming-original-world";
    this.root.userData.originalWorldReuse = true;
    scene.add(this.root);

    this.world = buildRealisticWorld(this.root, textures, tier);
    this.campaign = createCampaignLandmarks(this.root, textures, terrainY, tier);
    this.world.obstacles.push(...this.campaign.obstacles);
    this.world.setTicketCollected(true);
    const lighting = addCentralParkLighting(this.root, tier > .9 ? 2048 : 1024);
    this.sun = lighting.sun;

    const cartSpawn = new THREE.Vector3(-39.8, terrainY(-39.8, 51.1), 51.1);
    const farShoreCartSpawn = LAKE_SOUTHEAST_CART_TARGET.clone();
    farShoreCartSpawn.y = terrainY(farShoreCartSpawn.x, farShoreCartSpawn.z);
    this.carts = [
      createParkUtilityCart(textures, {
        scene: this.root,
        position: cartSpawn,
        rotationY: -.35,
        quality: tier,
        name: "Ramble field-services cart",
      }),
      createParkUtilityCart(textures, {
        scene: this.root,
        position: farShoreCartSpawn,
        rotationY: -2.28,
        quality: tier,
        name: "Southeast lake field-services cart",
      }),
    ];
    this.rowboats = this.world.rowboatSpawns.map((spawn) => createParkRowboat(textures, {
      scene: this.root,
      ...spawn,
      quality: tier,
    }));

    this.spawn.y = this.surfaceHeightAt(this.spawn.x, this.spawn.z) + 1.48;
    this.lastPlayer.copy(this.spawn);
    this.sanctuaryTarget.y = this.surfaceHeightAt(this.sanctuaryTarget.x, this.sanctuaryTarget.z);
    this.cameraPosition.y = this.surfaceHeightAt(this.cameraPosition.x, this.cameraPosition.z) + 6.4;
    this.cameraTarget.y = this.sanctuaryTarget.y + 2.2;

    let sanctuaryTreeIndex = 0;
    for (let index = 1; index < this.world.trees.length; index++) {
      const candidate = this.world.trees[index];
      const nearest = this.world.trees[sanctuaryTreeIndex];
      if (Math.hypot(candidate.x - START.x, candidate.z - START.z) < Math.hypot(nearest.x - START.x, nearest.z - START.z)) {
        sanctuaryTreeIndex = index;
      }
    }
    const sanctuaryTree = this.world.trees[sanctuaryTreeIndex];
    this.homeMarker.name = "central-park-home-grove-marker";
    this.homeMarker.userData.originalTreeIndex = sanctuaryTree ? sanctuaryTreeIndex : -1;
    this.homeMarker.userData.originalTreePosition = sanctuaryTree
      ? new THREE.Vector2(sanctuaryTree.x, sanctuaryTree.z)
      : new THREE.Vector2(START.x, START.z);
    this.homeMarkerTexture = sanctuarySignTexture();
    this.buildHomeMarker(textures);
    this.root.add(this.homeMarker);
  }

  private buildHomeMarker(textures: GameTextures) {
    const groundY = this.sanctuaryTarget.y;
    this.homeMarker.position.set(this.sanctuaryTarget.x, groundY, this.sanctuaryTarget.z);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: "#d9ef8b",
      transparent: true,
      opacity: .58,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ring = new THREE.Mesh(new THREE.RingGeometry(5.8, 6.08, 72), ringMaterial);
    ring.name = "central-park-home-grove-destination-ring";
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = .06;
    this.homeMarker.add(ring);

    const sign = new THREE.Mesh(
      new RoundedBoxGeometry(5.8, 1.92, .18, 5, .065),
      new THREE.MeshStandardMaterial({ map: this.homeMarkerTexture, roughness: .58 }),
    );
    sign.name = "central-park-sloth-sanctuary-sign";
    sign.position.set(7.3, 2.2, -1.8);
    sign.rotation.y = -.48;
    sign.castShadow = true;
    this.homeMarker.add(sign);

    const postMaterial = new THREE.MeshStandardMaterial({
      map: textures.bark,
      bumpMap: textures.bark,
      bumpScale: .06,
      color: "#69563f",
      roughness: .96,
    });
    for (const x of [5.15, 9.45]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .11, 2.8, 10), postMaterial);
      post.position.set(x, 1.34, -1.82);
      post.castShadow = true;
      this.homeMarker.add(post);
    }
  }

  private surfaceHeightAt(x: number, z: number) {
    const bow = this.campaign.bowBridgeSurface;
    const bowDx = x - bow.center.x;
    const bowDz = z - bow.center.z;
    const bowLocalX = Math.cos(bow.yaw) * bowDx - Math.sin(bow.yaw) * bowDz;
    const bowLocalZ = Math.sin(bow.yaw) * bowDx + Math.cos(bow.yaw) * bowDz;
    if (Math.abs(bowLocalX) <= bow.length / 2 + 2.35 && Math.abs(bowLocalZ) <= bow.width / 2) {
      return bow.deckHeightAt(x, z);
    }

    const bridge = this.world.bridgeSurface;
    const dx = x - bridge.x;
    const dz = z - bridge.z;
    const cosine = Math.cos(bridge.yaw);
    const sine = Math.sin(bridge.yaw);
    const localX = cosine * dx - sine * dz;
    const localZ = sine * dx + cosine * dz;
    if (Math.abs(localX) <= bridge.length / 2 && Math.abs(localZ) <= bridge.width / 2) {
      const amount = localX / bridge.length + .5;
      return bridge.y + Math.sin(Math.PI * amount) * bridge.archHeight;
    }
    return terrainY(x, z);
  }

  floorHeight(x: number, z: number) {
    return this.surfaceHeightAt(x, z);
  }

  sanctuaryNearby(player: THREE.Vector3, distance = 7.5) {
    return Math.hypot(player.x - this.sanctuaryTarget.x, player.z - this.sanctuaryTarget.z) <= distance;
  }

  private resolveObstacle(player: THREE.Vector3, velocity: THREE.Vector3, obstacle: WorldObstacle) {
    const footY = player.y - 1.48;
    if (footY < obstacle.minY - .25 || footY > obstacle.maxY + .3) return;
    if (obstacle.kind === "circle") {
      const dx = player.x - obstacle.x;
      const dz = player.z - obstacle.z;
      const distance = Math.hypot(dx, dz);
      const clearance = obstacle.radius + .48;
      if (distance >= clearance) return;
      const nx = dx / Math.max(distance, .001);
      const nz = dz / Math.max(distance, .001);
      player.x = obstacle.x + nx * clearance;
      player.z = obstacle.z + nz * clearance;
      const inward = velocity.x * nx + velocity.z * nz;
      if (inward < 0) {
        velocity.x -= inward * nx;
        velocity.z -= inward * nz;
      }
      return;
    }
    if (
      player.x <= obstacle.minX - .48
      || player.x >= obstacle.maxX + .48
      || player.z <= obstacle.minZ - .48
      || player.z >= obstacle.maxZ + .48
    ) return;
    const distances = [
      Math.abs(player.x - (obstacle.minX - .48)),
      Math.abs(player.x - (obstacle.maxX + .48)),
      Math.abs(player.z - (obstacle.minZ - .48)),
      Math.abs(player.z - (obstacle.maxZ + .48)),
    ];
    const side = distances.indexOf(Math.min(...distances));
    if (side === 0) {
      player.x = obstacle.minX - .48;
      velocity.x = Math.min(0, velocity.x);
    } else if (side === 1) {
      player.x = obstacle.maxX + .48;
      velocity.x = Math.max(0, velocity.x);
    } else if (side === 2) {
      player.z = obstacle.minZ - .48;
      velocity.z = Math.min(0, velocity.z);
    } else {
      player.z = obstacle.maxZ + .48;
      velocity.z = Math.max(0, velocity.z);
    }
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    this.lastPlayer.copy(player);
    for (const tree of this.world.trees) {
      const dx = player.x - tree.x;
      const dz = player.z - tree.z;
      const distance = Math.hypot(dx, dz);
      const clearance = tree.radius + .55;
      if (distance >= clearance) continue;
      const nx = dx / Math.max(distance, .001);
      const nz = dz / Math.max(distance, .001);
      player.x = tree.x + nx * clearance;
      player.z = tree.z + nz * clearance;
      const inward = velocity.x * nx + velocity.z * nz;
      if (inward < 0) {
        velocity.x -= inward * nx;
        velocity.z -= inward * nz;
      }
    }
    for (const cart of this.carts) {
      const dx = player.x - cart.root.position.x;
      const dz = player.z - cart.root.position.z;
      const clearance = cart.collisionRadius + .48;
      const distance = Math.hypot(dx, dz);
      if (distance >= clearance) continue;
      const nx = dx / Math.max(distance, .001);
      const nz = dz / Math.max(distance, .001);
      player.x = cart.root.position.x + nx * clearance;
      player.z = cart.root.position.z + nz * clearance;
      const inward = velocity.x * nx + velocity.z * nz;
      if (inward < 0) {
        velocity.x -= inward * nx;
        velocity.z -= inward * nz;
      }
    }
    this.world.obstacles.forEach((obstacle) => this.resolveObstacle(player, velocity, obstacle));
    player.x = THREE.MathUtils.clamp(player.x, -326, 486);
    player.z = THREE.MathUtils.clamp(player.z, -546, 266);
    player.y = this.surfaceHeightAt(player.x, player.z) + 1.48;
    this.lastPlayer.copy(player);
  }

  update(elapsed: number) {
    if (this.disposed) return;
    const delta = THREE.MathUtils.clamp(elapsed - this.elapsed, 0, .08);
    this.elapsed = elapsed;
    this.world.animate(elapsed, this.lastPlayer, false, this.collectedBuds);
    this.sun.position.set(this.lastPlayer.x - 35, this.lastPlayer.y + 68, this.lastPlayer.z + 25);
    this.sun.target.position.set(this.lastPlayer.x, this.lastPlayer.y, this.lastPlayer.z - 8);
    this.sun.target.updateMatrixWorld();
    this.campaign.update(elapsed, delta);
    this.carts.forEach((cart) => cart.animate(elapsed));
    this.rowboats.forEach((rowboat) => rowboat.animate(elapsed));
    const ring = this.homeMarker.getObjectByName("central-park-home-grove-destination-ring") as THREE.Mesh | undefined;
    if (ring) {
      const material = ring.material as THREE.MeshBasicMaterial;
      material.opacity = .48 + Math.sin(elapsed * 1.7) * .12;
      ring.scale.setScalar(1 + Math.sin(elapsed * .85) * .025);
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    // These components own generated labels/materials and must release them
    // before the remaining exact-world graph is traversed.
    this.campaign.dispose();
    this.carts.forEach((cart) => cart.dispose());
    this.rowboats.forEach((rowboat) => rowboat.dispose());
    this.homeMarkerTexture.dispose();

    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    });
    this.root.removeFromParent();
    this.root.clear();
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    // Texture maps supplied by GameTextures are shared with the player and
    // streamed levels, so only the marker texture above is owned here.
  }
}
