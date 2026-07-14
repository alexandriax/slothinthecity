import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";
import { createPremiumHuman } from "./PremiumCharacter";

export const BOW_BRIDGE_CENTER = new THREE.Vector3(-35, 0, -122);
export const BOW_BRIDGE_LENGTH = 28;
export const BOW_BRIDGE_WIDTH = 4.15;
// The span crosses the inlet rather than following it. Keeping this authored
// yaw shared with the water-support code prevents the bridge deck and its
// dry gameplay footprint from drifting apart.
export const BOW_BRIDGE_YAW = -.43;
// The inlet basin terrain sits below The Lake's water plane. The bridge deck
// needs an authored architectural datum instead of inheriting that lake-bed
// height, otherwise both rendering and locomotion place the span underwater.
export const BOW_BRIDGE_DECK_BASE_Y = -1.12;
// The first campaign waypoint lands on the clear east approach, where the
// ticket quest can naturally continue down the nearby rowboat pier.
export const BOW_BRIDGE_TARGET = new THREE.Vector3(-20.45, 0, -115.33);
// The zoo target is the attendant on the public forecourt. The campus itself
// spans roughly x=258..312 / z=-378..-338 and remains visibly complete behind
// its closed conservation gate.
export const ZOO_TARGET = new THREE.Vector3(282, 0, -341);
// The subway is deliberately a landscaped walk southeast of the zoo, rather
// than a prop attached to its entrance plaza.
export const SUBWAY_TARGET = new THREE.Vector3(345, 0, -385);
// GameClient transitions after the player is visibly partway down the stairs.
// It is exported separately so the waypoint can remain at street level.
export const SUBWAY_ENTRY_TRIGGER = new THREE.Vector3(345, 0, -389.35);

export type CampaignObstacle =
  | { id: string; kind: "circle"; x: number; z: number; radius: number; minY: number; maxY: number }
  | { id: string; kind: "aabb"; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };

export type BowBridgeSurface = {
  center: THREE.Vector3;
  yaw: number;
  length: number;
  width: number;
  archHeight: number;
  baseY: number;
  deckHeightAt(worldX: number, worldZ: number): number;
};

export type CampaignLandmarks = {
  root: THREE.Group;
  attendant: THREE.Group;
  bowBridge: THREE.Group;
  bowBridgeSurface: BowBridgeSurface;
  subwayEntrance: THREE.Group;
  subwayEntryTrigger: THREE.Vector3;
  zooGate: THREE.Group;
  obstacles: CampaignObstacle[];
  dispose(): void;
};

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([26, 44, 34, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Campaign landmarks require canvas textures");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

function signTexture(title: string, subtitle: string, accent = "#d9ef8b") {
  return canvasTexture(1024, 384, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, "#10251c"); gradient.addColorStop(1, "#07100d");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(239,238,216,.72)"; context.lineWidth = 12; context.strokeRect(15, 15, width - 30, height - 30);
    context.fillStyle = accent; context.fillRect(52, 48, 12, height - 96);
    context.fillStyle = "#f2f0df"; context.textAlign = "left"; context.textBaseline = "middle";
    context.font = "700 75px Georgia, serif"; context.fillText(title, 100, 142);
    context.fillStyle = "rgba(242,240,223,.72)"; context.font = "700 34px Arial, sans-serif"; context.letterSpacing = "8px"; context.fillText(subtitle, 102, 246);
  });
}

function archedDeckGeometry(length: number, width: number, segments = 36) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const amount = index / segments, x = (amount - .5) * length, y = Math.sin(amount * Math.PI) * 1.15;
    for (const side of [-1, 1]) { positions.push(x, y, side * width / 2); uvs.push(amount * 8, (side + 1) / 2); }
    if (index < segments) { const base = index * 2; indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function parkPathGeometry(points: THREE.Vector3[], width: number, heightAt: (x: number, z: number) => number) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).setY(0).normalize(), normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    for (const side of [-1, 1]) {
      const edge = point.clone().addScaledVector(normal, side * width / 2);
      positions.push(edge.x, heightAt(edge.x, edge.z) + .045, edge.z); uvs.push(index * 2.8, (side + 1) / 2);
    }
    if (index < points.length - 1) { const base = index * 2; indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); }
  });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function sidewalkWithStairOpeningGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-9, -8.2); shape.lineTo(9, -8.2); shape.lineTo(9, 9.8); shape.lineTo(-9, 9.8); shape.closePath();
  // ShapeGeometry is authored in XY then laid onto XZ. Negating local Z keeps
  // the opening aligned with the descending negative-Z stair flight.
  const opening = new THREE.Path();
  opening.moveTo(-2.95, .35); opening.lineTo(-2.95, 9.55); opening.lineTo(2.95, 9.55); opening.lineTo(2.95, .35); opening.closePath();
  shape.holes.push(opening);
  const geometry = new THREE.ShapeGeometry(shape, 4); geometry.rotateX(-Math.PI / 2); geometry.computeVertexNormals(); return geometry;
}

function addSouthboundParkPath(root: THREE.Group, textures: GameTextures, heightAt: (x: number, z: number) => number) {
  const points = [
    BOW_BRIDGE_TARGET.clone(), new THREE.Vector3(-18, 0, -105), new THREE.Vector3(38, 0, -96), new THREE.Vector3(105, 0, -98),
    new THREE.Vector3(178, 0, -116), new THREE.Vector3(232, 0, -157), new THREE.Vector3(257, 0, -220), new THREE.Vector3(266, 0, -288),
    new THREE.Vector3(275, 0, -329), ZOO_TARGET.clone(), new THREE.Vector3(306, 0, -359), new THREE.Vector3(327, 0, -374), SUBWAY_TARGET.clone(),
  ];
  const material = new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .075, color: "#a8997e", roughness: .98 });
  const path = new THREE.Mesh(parkPathGeometry(points, 4.4, heightAt), material); path.name = "bow-bridge-to-zoo-and-subway-landscaped-path"; path.receiveShadow = true; root.add(path);
}

function addBowBridge(root: THREE.Group, textures: GameTextures, heightAt: (x: number, z: number) => number, ownedTextures: THREE.Texture[]) {
  const bridge = new THREE.Group(); bridge.name = "bow-bridge-northwest-inlet-span";
  const rotation = BOW_BRIDGE_YAW, length = BOW_BRIDGE_LENGTH, width = BOW_BRIDGE_WIDTH;
  const west = new THREE.Vector3(-length / 2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation).add(BOW_BRIDGE_CENTER);
  const east = new THREE.Vector3(length / 2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation).add(BOW_BRIDGE_CENTER);
  const bridgeY = Math.max(BOW_BRIDGE_DECK_BASE_Y, heightAt(west.x, west.z) + .16, heightAt(east.x, east.z) + .16);
  bridge.position.set(BOW_BRIDGE_CENTER.x, bridgeY, BOW_BRIDGE_CENTER.z); bridge.rotation.y = rotation;
  const iron = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .012, color: "#ded7c5", roughness: .38, metalness: .68 });
  const deckMaterial = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .035, color: "#a98f70", roughness: .84 });
  const stone = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .055, color: "#b9aa8d", roughness: .9 });
  const deck = new THREE.Mesh(archedDeckGeometry(length, width, 54), deckMaterial); deck.castShadow = deck.receiveShadow = true; bridge.add(deck);
  const postCount = 25, postGeometry = new THREE.CylinderGeometry(.052, .072, 1, 12), postDummy = new THREE.Object3D(), posts = new THREE.InstancedMesh(postGeometry, iron, postCount * 2);
  for (const side of [-1, 1]) for (let index = 0; index < postCount; index++) {
    const amount = index / (postCount - 1), x = (amount - .5) * (length - .7), deckY = Math.sin(amount * Math.PI) * 1.15;
    postDummy.position.set(x, deckY + .73, side * width / 2); postDummy.scale.set(1, 1.46, 1); postDummy.updateMatrix(); posts.setMatrixAt((side < 0 ? 0 : postCount) + index, postDummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true; posts.castShadow = true; bridge.add(posts);
  for (const side of [-1, 1]) {
    const points = Array.from({ length: 55 }, (_, index) => { const amount = index / 54; return new THREE.Vector3((amount - .5) * (length - .55), 1.46 + Math.sin(amount * Math.PI) * 1.15, side * width / 2); });
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 108, .07, 12, false), iron); rail.castShadow = true; bridge.add(rail);
    for (let motif = 0; motif < 7; motif++) {
      const amount = (motif + .5) / 7, x = (amount - .5) * (length - 3.2), deckY = Math.sin(amount * Math.PI) * 1.15;
      const scroll = new THREE.Mesh(new THREE.TorusGeometry(.38, .038, 10, 32), iron); scroll.scale.y = .68; scroll.position.set(x, deckY + .83, side * (width / 2 + .015)); scroll.rotation.y = Math.PI / 2; bridge.add(scroll);
    }
  }
  for (const end of [-1, 1]) {
    // Bow Bridge's masonry terminates beside the path. A single full-width
    // abutment here used to form an accidental wall across the playable deck.
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(new RoundedBoxGeometry(2.25, 2.65, .96, 7, .2), stone);
      pier.name = "bow-bridge-side-abutment";
      pier.position.set(end * (length / 2 + .6), .74, side * (width / 2 + .46));
      pier.castShadow = pier.receiveShadow = true;
      bridge.add(pier);
      const cap = new THREE.Mesh(new RoundedBoxGeometry(2.55, .27, 1.22, 5, .09), iron);
      cap.position.set(end * (length / 2 + .6), 2.08, side * (width / 2 + .46));
      bridge.add(cap);
    }
    const approach = new THREE.Mesh(new RoundedBoxGeometry(4.4, .16, width, 4, .06), deckMaterial);
    approach.name = "bow-bridge-clear-walkable-approach";
    approach.position.set(end * (length / 2 + 2.6), .02, 0);
    approach.receiveShadow = true;
    bridge.add(approach);
  }
  const bridgePlaqueTexture = signTexture("BOW BRIDGE", "THE LAKE  ·  CENTRAL PARK  ·  1862", "#e5c46c"); ownedTextures.push(bridgePlaqueTexture);
  for (const end of [-1, 1]) {
    const plaque = new THREE.Mesh(new RoundedBoxGeometry(2.9, .74, .12, 4, .045), new THREE.MeshStandardMaterial({ map: bridgePlaqueTexture, roughness: .48 })); plaque.name = "bow-bridge-abutment-mounted-plaque"; plaque.position.set(end * (length / 2 + 1.82), 1.16, -width / 2 - .46); plaque.rotation.y = end < 0 ? Math.PI / 2 : -Math.PI / 2; bridge.add(plaque);
  }
  const surface: BowBridgeSurface = {
    center: new THREE.Vector3(BOW_BRIDGE_CENTER.x, bridgeY, BOW_BRIDGE_CENTER.z), yaw: rotation, length: length + 5.2, width, archHeight: 1.15, baseY: bridgeY,
    deckHeightAt(worldX: number, worldZ: number) {
      const deltaX = worldX - BOW_BRIDGE_CENTER.x, deltaZ = worldZ - BOW_BRIDGE_CENTER.z;
      const localX = deltaX * Math.cos(rotation) - deltaZ * Math.sin(rotation), amount = THREE.MathUtils.clamp(localX / length + .5, 0, 1);
      return bridgeY + Math.sin(amount * Math.PI) * 1.15;
    },
  };
  bridge.userData.walkableSurface = surface; root.add(bridge); return { bridge, surface };
}

function inferredLandmarkQuality() {
  if (typeof window === "undefined" || typeof navigator === "undefined") return .78;
  const compact = Math.min(window.innerWidth, window.innerHeight) < 720, cores = navigator.hardwareConcurrency || 4;
  return compact ? (cores >= 6 ? .62 : .48) : cores >= 10 ? 1 : cores >= 6 ? .82 : .68;
}

function texturedShrub(root: THREE.Group, textures: GameTextures, x: number, z: number, scale: number, quality: number) {
  const shrub = new THREE.Group(); shrub.position.set(x, 0, z);
  const material = new THREE.MeshStandardMaterial({ map: textures.foliage, alphaMap: textures.foliage, alphaTest: .2, color: "#789761", roughness: .9, side: THREE.DoubleSide });
  const count = quality > .7 ? 6 : 3;
  for (let index = 0; index < count; index++) {
    const leaf = new THREE.Mesh(new THREE.PlaneGeometry(1.35 * scale, 1.05 * scale), material); leaf.position.set(Math.cos(index * 2.4) * .28 * scale, .58 * scale + index % 2 * .2, Math.sin(index * 2.4) * .28 * scale); leaf.rotation.set(-.12 + index * .07, index * 2.4, index % 2 ? .12 : -.08); leaf.castShadow = quality > .75; shrub.add(leaf);
  }
  root.add(shrub);
}

function addZoo(root: THREE.Group, textures: GameTextures, heightAt: (x: number, z: number) => number, ownedTextures: THREE.Texture[], quality: number) {
  const gate = new THREE.Group(); gate.name = "central-park-zoo-exterior-campus"; gate.position.set(285, heightAt(285, -350), -350);
  const high = quality > .7, brick = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .055, color: "#a48369", roughness: .9 });
  const iron = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .01, color: "#242b27", metalness: .78, roughness: .32 });
  const limestone = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .035, color: "#d8ceb6", roughness: .75 });
  const copper = new THREE.MeshStandardMaterial({ map: textures.moss, bumpMap: textures.moss, bumpScale: .025, color: "#617b69", metalness: .46, roughness: .57 });
  const paving = new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .04, color: "#b8aa90", roughness: .92 });
  const water = new THREE.MeshPhysicalMaterial({ map: textures.waterNormal, normalMap: textures.waterNormal, normalScale: new THREE.Vector2(.3, .3), color: "#508785", roughness: .22, transmission: .16, clearcoat: .75 });
  const glass = new THREE.MeshPhysicalMaterial({ map: textures.stone, color: "#8eb4ae", roughness: .12, metalness: .08, transparent: true, opacity: .66, transmission: .18, clearcoat: .78 });
  const zooTexture = signTexture("CENTRAL PARK ZOO", "WILDLIFE CONSERVATION · EAST 64TH", "#e5c46c");
  const welcomeTexture = signTexture("SEA LION POOL", "CENTRAL GARDEN  ·  TROPIC ZONE", "#9fc96d");
  const conservationTexture = signTexture("WILDLIFE CENTER", "TICKETS  ·  MEMBER SERVICES  ·  CONSERVATION", "#d6a760"); ownedTextures.push(zooTexture, welcomeTexture, conservationTexture);

  const plaza = new THREE.Mesh(new RoundedBoxGeometry(38, .14, 27, 7, .22), paving); plaza.name = "central-park-zoo-public-forecourt"; plaza.position.set(0, -.035, 9); plaza.receiveShadow = true; gate.add(plaza);
  const innerCourt = new THREE.Mesh(new RoundedBoxGeometry(52, .16, 39, 8, .28), paving); innerCourt.position.set(0, -.03, -20); innerCourt.receiveShadow = true; gate.add(innerCourt);

  // A complete, layered campus skyline stays visible behind the closed gate.
  const addBuilding = (name: string, x: number, z: number, width: number, height: number, depth: number, material: THREE.Material, roof: "hip" | "glass" | "flat") => {
    const building = new THREE.Group(); building.name = name; building.position.set(x, 0, z);
    const body = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, high ? 7 : 4, .16), material); body.position.y = height / 2; body.castShadow = body.receiveShadow = true; building.add(body);
    const base = new THREE.Mesh(new RoundedBoxGeometry(width + .35, .38, depth + .35, 4, .06), limestone); base.position.y = .19; building.add(base);
    const cornice = new THREE.Mesh(new RoundedBoxGeometry(width + .45, .35, depth + .45, 4, .07), limestone); cornice.position.y = height - .15; building.add(cornice);
    const windowCount = Math.max(3, Math.floor(width / 2.7));
    for (let index = 0; index < windowCount; index++) {
      const window = new THREE.Mesh(new RoundedBoxGeometry(1.18, 1.8, .08, 4, .04), glass); window.position.set((index - (windowCount - 1) / 2) * (width - 2) / Math.max(1, windowCount - 1), height * .55, depth / 2 + .055); building.add(window);
      const sill = new THREE.Mesh(new RoundedBoxGeometry(1.38, .12, .22, 3, .025), limestone); sill.position.set(window.position.x, height * .55 - .98, depth / 2 + .08); building.add(sill);
    }
    if (roof === "hip") { const roofMesh = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * .7, 2.3, 4), copper); roofMesh.position.y = height + 1.05; roofMesh.rotation.y = Math.PI / 4; roofMesh.scale.z = depth / width; building.add(roofMesh); }
    else if (roof === "glass") {
      for (const side of [-1, 1]) { const roofPane = new THREE.Mesh(new RoundedBoxGeometry(width * .72, .14, depth * .76, 3, .035), glass); roofPane.position.set(side * width * .19, height + 1.15, 0); roofPane.rotation.z = side * .31; building.add(roofPane); }
      for (let rib = -2; rib <= 2; rib++) { const ribMesh = new THREE.Mesh(new RoundedBoxGeometry(.1, 2.5, depth * .82, 2, .02), iron); ribMesh.position.set(rib * width * .14, height + 1.05, 0); ribMesh.rotation.z = rib < 0 ? -.31 : .31; building.add(ribMesh); }
    } else { const roofMesh = new THREE.Mesh(new RoundedBoxGeometry(width + .7, .48, depth + .7, 4, .09), copper); roofMesh.position.y = height + .18; building.add(roofMesh); }
    gate.add(building); return building;
  };
  addBuilding("tropic-zone-glasshouse", -18.5, -24, 14, 8.4, 13, brick, "glass");
  addBuilding("zoo-administration-pavilion", 18.5, -23, 15, 9.2, 12, brick, "hip");
  addBuilding("sea-lion-support-building", 0, -37, 22, 7.2, 9, limestone, "flat");
  if (high) { addBuilding("polar-circle-gallery", -24, -39, 11, 6.2, 9, brick, "hip"); addBuilding("conservation-education-wing", 25, -39, 12, 6.6, 9, brick, "flat"); }

  // The landmark sea-lion pool is centered in the garden and visible through
  // the entrance ironwork, but the public route remains intentionally closed.
  const pool = new THREE.Group(); pool.name = "central-park-zoo-sea-lion-pool"; pool.position.set(0, 0, -17);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(6.9, 7.25, 1.05, high ? 72 : 42), limestone); basin.scale.z = .68; basin.position.y = .35; basin.receiveShadow = true; pool.add(basin);
  const poolWater = new THREE.Mesh(new THREE.CylinderGeometry(6.45, 6.45, .14, high ? 72 : 42), water); poolWater.scale.z = .68; poolWater.position.y = .84; pool.add(poolWater);
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.55, high ? 2 : 1), new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .06, color: "#858070", roughness: .88 })); rock.scale.set(1.6, .72, 1); rock.position.set(0, 1.12, 0); rock.castShadow = true; pool.add(rock);
  for (const side of [-1, 1]) {
    const seal = new THREE.Group(); seal.position.set(side * 1.2, 1.55, -.15 + side * .15); seal.rotation.z = side * -.22;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(.34, 1.05, 10, high ? 22 : 14), new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .025, color: "#4d5857", roughness: .48, metalness: .32 })); body.rotation.z = side * .58; seal.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.4, high ? 24 : 16, 14), body.material); head.position.set(side * -.5, .54, 0); seal.add(head); pool.add(seal);
  }
  for (let jet = 0; jet < (high ? 8 : 4); jet++) { const angle = jet / (high ? 8 : 4) * Math.PI * 2, curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(angle) * 5.2, .92, Math.sin(angle) * 3.5), new THREE.Vector3(Math.cos(angle) * 3.2, 3.3, Math.sin(angle) * 2.1), new THREE.Vector3(Math.cos(angle) * 1.3, 1.2, Math.sin(angle) * .8)); pool.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, .025, 6, false), water)); }
  gate.add(pool);

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(2.1, 6.6, 2.1, 7, .18), brick); pillar.position.set(side * 7.2, 3.3, 0); pillar.castShadow = pillar.receiveShadow = true; gate.add(pillar);
    for (const y of [.8, 2.25, 3.7, 5.15]) { const band = new THREE.Mesh(new RoundedBoxGeometry(2.2, .13, 2.2, 3, .04), limestone); band.position.set(side * 7.2, y, 0); gate.add(band); }
    const cap = new THREE.Mesh(new RoundedBoxGeometry(2.45, .38, 2.45, 5, .1), limestone); cap.position.set(side * 7.2, 6.72, 0); gate.add(cap);
    const sideWall = new THREE.Mesh(new RoundedBoxGeometry(10.6, 2.45, .85, 5, .11), brick); sideWall.position.set(side * 12.9, 1.23, .08); sideWall.castShadow = sideWall.receiveShadow = true; gate.add(sideWall);
    const banner = new THREE.Mesh(new RoundedBoxGeometry(2.9, 1.65, .12, 4, .06), new THREE.MeshStandardMaterial({ map: welcomeTexture, roughness: .5 })); banner.position.set(side * 4.95, 3.75, -.53); gate.add(banner);
  }
  const header = new THREE.Mesh(new RoundedBoxGeometry(12.7, 1.48, .4, 7, .12), new THREE.MeshStandardMaterial({ map: zooTexture, roughness: .46 })); header.position.set(0, 5.73, 0); header.castShadow = true; gate.add(header);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(6.25, .14, 14, high ? 96 : 64, Math.PI), iron); arch.position.set(0, 3.62, -.04); gate.add(arch);
  for (let index = -8; index <= 8; index++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(.052, .065, 4.05, 10), iron); bar.position.set(index * .68, 2.03, 0); gate.add(bar); const spear = new THREE.Mesh(new THREE.ConeGeometry(.1, .34, 9), iron); spear.position.set(index * .68, 4.22, 0); gate.add(spear); }
  const fenceSpacing = high ? 1.05 : 1.55;
  for (const side of [-1, 1]) {
    for (let x = 18.4; x <= 31; x += fenceSpacing) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.045, .058, 4.25, 9), iron); post.position.set(side * x, 2.13, 0); gate.add(post); const finial = new THREE.Mesh(new THREE.ConeGeometry(.09, .3, 8), iron); finial.position.set(side * x, 4.4, 0); gate.add(finial); }
    for (let z = -1; z >= -50; z -= fenceSpacing) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.045, .058, 4.25, 9), iron); post.position.set(side * 31, 2.13, z); gate.add(post); }
    const frontRail = new THREE.Mesh(new RoundedBoxGeometry(13.2, .09, .09, 2, .025), iron); frontRail.position.set(side * 24.7, 3.42, 0); gate.add(frontRail);
    const sideRail = new THREE.Mesh(new RoundedBoxGeometry(.09, .09, 50, 2, .025), iron); sideRail.position.set(side * 31, 3.42, -25); gate.add(sideRail);
  }

  for (const side of [-1, 1]) {
    const kiosk = new THREE.Group(); kiosk.name = "central-park-zoo-ticket-kiosk"; kiosk.position.set(side * 10.4, 0, 5.1);
    const body = new THREE.Mesh(new RoundedBoxGeometry(3.2, 3.55, 2.4, 6, .13), brick); body.position.y = 1.78; body.castShadow = body.receiveShadow = true; kiosk.add(body);
    const window = new THREE.Mesh(new RoundedBoxGeometry(2.15, 1.25, .06, 5, .04), glass); window.position.set(0, 2.1, -1.23); kiosk.add(window);
    const awning = new THREE.Mesh(new RoundedBoxGeometry(3.55, .2, 2.75, 4, .055), copper); awning.position.y = 3.66; kiosk.add(awning);
    const kioskSign = new THREE.Mesh(new RoundedBoxGeometry(2.45, .62, .08, 4, .035), new THREE.MeshStandardMaterial({ map: conservationTexture, roughness: .5 })); kioskSign.position.set(0, 3.05, -1.25); kiosk.add(kioskSign); gate.add(kiosk);
  }

  const lampMaterial = new THREE.MeshStandardMaterial({ map: textures.stone, color: "#1d2722", metalness: .74, roughness: .32 });
  for (const x of [-15, -7.5, 7.5, 15]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .095, 4.5, 12), lampMaterial); post.position.set(x, 2.25, 13.5); gate.add(post);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.25, 22, 14), new THREE.MeshPhysicalMaterial({ map: textures.stone, color: "#fff0c0", emissive: "#ffd47c", emissiveIntensity: 1.8, roughness: .18 })); globe.position.set(x, 4.65, 13.5); gate.add(globe);
  }
  for (const x of [-15.5, -5.2, 5.2, 15.5]) texturedShrub(gate, textures, x, 6.8 + Math.abs(x) * .15, .9 + Math.abs(x % 3) * .08, quality);

  const attendantResult = createPremiumHuman({ role: "attendant", quality, variant: 0, faceVariant: 14, coat: "#2e503c", trousers: "#17211d", skin: "#9c6c4e", accessory: "radio", pose: "neutral" });
  const attendant = attendantResult.root; ownedTextures.push(...attendantResult.ownedTextures); attendant.position.set(-3, .06, 9); attendant.rotation.y = Math.PI + .05; gate.add(attendant);
  const visitorData = [
    [-.2, 8.7, -.24, "#8d6549", "#303d43", "#c28e69", "camera", "photographing", 12], [3.8, 11.6, 2.72, "#426475", "#343a3c", "#79503d", "backpack", "checking-map", 15],
    [-8.6, 12.9, .4, "#727c4c", "#3d3937", "#d0a27f", "tote", "neutral", 16], [9.1, 9.8, -2.8, "#7f4b55", "#273a43", "#8f6048", "backpack", "waving", 17],
    [13.4, 15.5, 2.9, "#4e6371", "#302f31", "#b87f5f", "camera", "neutral", 18], [-13, 17, .2, "#9a754f", "#37433d", "#704937", "tote", "checking-map", 19],
  ] as const;
  visitorData.slice(0, quality < .58 ? 3 : quality < .82 ? 4 : 6).forEach((data, index) => {
    const result = createPremiumHuman({ role: "visitor", quality, variant: index + 1, faceVariant: data[8], coat: data[3], trousers: data[4], skin: data[5], accessory: data[6], pose: data[7] });
    result.root.position.set(data[0], .04, data[1]); result.root.rotation.y = data[2]; gate.add(result.root); ownedTextures.push(...result.ownedTextures);
  });

  const benchWood = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .025, color: "#795b43", roughness: .83 });
  for (const side of [-1, 1]) { const bench = new THREE.Group(); bench.position.set(side * 14.5, .42, 18.5); bench.rotation.y = side * -.16; for (let slat = 0; slat < 5; slat++) { const board = new THREE.Mesh(new RoundedBoxGeometry(3.4, .11, .22, 3, .03), benchWood); board.position.set(0, slat < 3 ? slat * .15 : .5 + (slat - 3) * .2, slat < 3 ? (slat - 1) * .24 : .38); if (slat >= 3) board.rotation.x = -.15; bench.add(board); } for (const x of [-1.35, 1.35]) { const leg = new THREE.Mesh(new RoundedBoxGeometry(.1, .7, .1, 2, .02), iron); leg.position.set(x, -.18, 0); bench.add(leg); } gate.add(bench); }
  root.add(gate); return { gate, attendant };
}

function addSubwayEntrance(root: THREE.Group, textures: GameTextures, heightAt: (x: number, z: number) => number, ownedTextures: THREE.Texture[], quality: number) {
  const entrance = new THREE.Group(); entrance.name = "5-av-59-st-full-stair-subway-entrance"; entrance.position.set(SUBWAY_TARGET.x, heightAt(SUBWAY_TARGET.x, SUBWAY_TARGET.z), SUBWAY_TARGET.z);
  entrance.userData.entryTrigger = SUBWAY_ENTRY_TRIGGER.clone(); entrance.userData.transitionAtMidDescent = true;
  const high = quality > .7;
  const iron = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .012, color: "#202725", metalness: .82, roughness: .3 });
  const stone = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .045, color: "#b6ad9c", roughness: .88 });
  const tile = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .025, color: "#dedbd0", roughness: .75 });
  const street = new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .035, color: "#948b7d", roughness: .94 });
  const green = new THREE.MeshPhysicalMaterial({ map: textures.stone, color: "#69a271", emissive: "#7fd18a", emissiveIntensity: 1.3, roughness: .2, clearcoat: .7 });
  const subwayTexture = signTexture("SUBWAY", "5 AV / 59 ST   ·   N  R  W", "#f0c94c");
  const directionTexture = signTexture("N  R  W TRAINS", "UPTOWN  ·  DOWNTOWN  ·  QUEENS  VIA CONCOURSE", "#f0c94c"); ownedTextures.push(subwayTexture, directionTexture);
  const sidewalk = new THREE.Mesh(sidewalkWithStairOpeningGeometry(), street); sidewalk.name = "subway-sidewalk-with-true-stairwell-cutout"; sidewalk.position.y = .018; sidewalk.receiveShadow = true; entrance.add(sidewalk);
  const stairwellDark = new THREE.MeshStandardMaterial({ map: textures.stone, color: "#090d0c", roughness: .98 });
  const bottomLanding = new THREE.Mesh(new RoundedBoxGeometry(5.6, .14, 1.15, 3, .035), stairwellDark); bottomLanding.position.set(0, -3.23, -9.25); bottomLanding.receiveShadow = true; entrance.add(bottomLanding);
  const stairwellBack = new THREE.Mesh(new RoundedBoxGeometry(5.78, 3.55, .14, 3, .035), stairwellDark); stairwellBack.position.set(0, -1.48, -9.78); entrance.add(stairwellBack);
  for (let step = 0; step < 20; step++) {
    const stair = new THREE.Mesh(new RoundedBoxGeometry(5.45, .17, .52, 3, .028), stone);
    stair.name = step === 8 ? "subway-mid-descent-transition-step" : "subway-descending-step";
    stair.position.set(0, -.085 - step * .165, -.85 - step * .43);
    stair.receiveShadow = true;
    entrance.add(stair);
  }
  for (const side of [-1, 1]) {
    const curb = new THREE.Mesh(new RoundedBoxGeometry(.6, .38, 10.9, 5, .08), stone); curb.position.set(side * 3.18, .19, -4.55); curb.castShadow = curb.receiveShadow = true; entrance.add(curb);
    const innerTile = new THREE.Mesh(new RoundedBoxGeometry(.18, 3.6, 9.7, 3, .04), tile); innerTile.position.set(side * 2.86, -1.72, -4.55); entrance.add(innerTile);
    for (let index = 0; index < 12; index++) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.038, .05, 1.05, 10), iron); post.position.set(side * 3.22, .84, -.3 - index * .78); entrance.add(post); }
    const topRail = new THREE.Mesh(new RoundedBoxGeometry(.1, .1, 10.2, 3, .025), iron); topRail.position.set(side * 3.22, 1.38, -4.55); entrance.add(topRail);
    const handrailStart = new THREE.Vector3(side * 2.68, 1.08, -.55), handrailEnd = new THREE.Vector3(side * 2.68, -2.58, -9.15), direction = handrailEnd.clone().sub(handrailStart);
    const handrail = new THREE.Mesh(new THREE.CylinderGeometry(.047, .047, direction.length(), 11), iron); handrail.position.copy(handrailStart).add(handrailEnd).multiplyScalar(.5); handrail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); entrance.add(handrail);
    const globePost = new THREE.Mesh(new THREE.CylinderGeometry(.085, .105, 2.55, 14), iron); globePost.position.set(side * 3.7, 1.28, .5); entrance.add(globePost);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.31, high ? 28 : 18, 16), green); globe.position.set(side * 3.7, 2.7, .5); entrance.add(globe);
  }
  const canopy = new THREE.Mesh(new RoundedBoxGeometry(7.6, .28, 5.1, 7, .1), iron); canopy.position.set(0, 3.35, -1.7); canopy.castShadow = true; entrance.add(canopy);
  for (const x of [-3.25, 3.25]) for (const z of [-.15, -3.45]) { const support = new THREE.Mesh(new THREE.CylinderGeometry(.075, .095, 3.25, 12), iron); support.position.set(x, 1.68, z); entrance.add(support); }
  const subwaySign = new THREE.Mesh(new RoundedBoxGeometry(6.7, 1.3, .25, 5, .08), new THREE.MeshStandardMaterial({ map: subwayTexture, roughness: .48 })); subwaySign.position.set(0, 2.7, .62); entrance.add(subwaySign);
  const directionSign = new THREE.Mesh(new RoundedBoxGeometry(4.8, 1.02, .14, 4, .055), new THREE.MeshStandardMaterial({ map: directionTexture, roughness: .5 })); directionSign.position.set(0, 2.56, -4.15); directionSign.rotation.x = -.045; entrance.add(directionSign);
  const lightMaterial = new THREE.MeshPhysicalMaterial({ map: textures.stone, color: "#fff1c8", emissive: "#ffe8a8", emissiveIntensity: 2.1, roughness: .2 });
  for (let index = 0; index < (high ? 5 : 3); index++) { const light = new THREE.Mesh(new RoundedBoxGeometry(3.7, .07, .18, 3, .025), lightMaterial); light.position.set(0, 2.7 - index * .48, -2.8 - index * 1.45); light.rotation.x = -.16; entrance.add(light); }
  const newsbox = new THREE.Mesh(new RoundedBoxGeometry(1.05, 1.45, .72, 5, .09), new THREE.MeshStandardMaterial({ map: directionTexture, roughness: .66 })); newsbox.position.set(5.65, .74, 2.3); newsbox.rotation.y = -.12; entrance.add(newsbox);
  texturedShrub(entrance, textures, -6.4, 3, .95, quality); texturedShrub(entrance, textures, 6.8, -.2, .8, quality);
  root.add(entrance); return entrance;
}

export function createCampaignLandmarks(scene: THREE.Scene, textures: GameTextures, heightAt: (x: number, z: number) => number, quality = inferredLandmarkQuality()): CampaignLandmarks {
  const root = new THREE.Group(); root.name = "central-park-south-campaign-landmarks"; scene.add(root);
  const ownedTextures: THREE.Texture[] = [], obstacles: CampaignObstacle[] = [];
  addSouthboundParkPath(root, textures, heightAt);
  const { bridge: bowBridge, surface: bowBridgeSurface } = addBowBridge(root, textures, heightAt, ownedTextures);
  const { gate: zooGate, attendant } = addZoo(root, textures, heightAt, ownedTextures, quality);
  const subwayEntrance = addSubwayEntrance(root, textures, heightAt, ownedTextures, quality);
  bowBridge.updateMatrixWorld(true);
  zooGate.updateMatrixWorld(true);
  const zooWestPillar = zooGate.localToWorld(new THREE.Vector3(-7.2, 0, 0));
  const zooEastPillar = zooGate.localToWorld(new THREE.Vector3(7.2, 0, 0));
  const zooWestBooth = zooGate.localToWorld(new THREE.Vector3(-10.4, 0, 5.1));
  const zooEastBooth = zooGate.localToWorld(new THREE.Vector3(10.4, 0, 5.1));
  for (const end of [-1, 1]) for (const side of [-1, 1]) {
    const abutment = bowBridge.localToWorld(new THREE.Vector3(end * (BOW_BRIDGE_LENGTH / 2 + .6), 0, side * (BOW_BRIDGE_WIDTH / 2 + .46)));
    obstacles.push({ id: `bow-bridge-abutment-${end}-${side}`, kind: "circle", x: abutment.x, z: abutment.z, radius: .68, minY: -5, maxY: 8 });
  }
  obstacles.push(
    { id: "zoo-gate-west", kind: "circle", x: zooWestPillar.x, z: zooWestPillar.z, radius: 1.08, minY: -5, maxY: 8 },
    { id: "zoo-gate-east", kind: "circle", x: zooEastPillar.x, z: zooEastPillar.z, radius: 1.08, minY: -5, maxY: 8 },
    { id: "zoo-booth-west", kind: "circle", x: zooWestBooth.x, z: zooWestBooth.z, radius: 1.45, minY: -5, maxY: 5 },
    { id: "zoo-booth-east", kind: "circle", x: zooEastBooth.x, z: zooEastBooth.z, radius: 1.45, minY: -5, maxY: 5 },
    { id: "zoo-closed-interior-gate", kind: "aabb", minX: 278, maxX: 292, minZ: -350.7, maxZ: -349.3, minY: -5, maxY: 7 },
    { id: "zoo-west-perimeter-fence", kind: "aabb", minX: 254, maxX: 278, minZ: -350.7, maxZ: -349.3, minY: -5, maxY: 7 },
    { id: "zoo-east-perimeter-fence", kind: "aabb", minX: 292, maxX: 316, minZ: -350.7, maxZ: -349.3, minY: -5, maxY: 7 },
    { id: "subway-railing-west", kind: "aabb", minX: SUBWAY_TARGET.x - 3.55, maxX: SUBWAY_TARGET.x - 2.85, minZ: SUBWAY_TARGET.z - 10, maxZ: SUBWAY_TARGET.z + .7, minY: -5, maxY: 4 },
    { id: "subway-railing-east", kind: "aabb", minX: SUBWAY_TARGET.x + 2.85, maxX: SUBWAY_TARGET.x + 3.55, minZ: SUBWAY_TARGET.z - 10, maxZ: SUBWAY_TARGET.z + .7, minY: -5, maxY: 4 },
  );
  return { root, attendant, bowBridge, bowBridgeSurface, subwayEntrance, subwayEntryTrigger: SUBWAY_ENTRY_TRIGGER.clone(), zooGate, obstacles, dispose() {
    scene.remove(root); root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); }); ownedTextures.forEach(texture => texture.dispose());
  } };
}
