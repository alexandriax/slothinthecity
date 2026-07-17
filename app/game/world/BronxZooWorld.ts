import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";
import {
  createPremiumHuman,
  createPremiumSlothFriend,
  markPremiumCharactersDisposed,
  type PremiumHumanOutfit,
} from "./PremiumCharacter";
import {
  createAmbientHumanAgent,
  idleAuthoredHuman,
  updateAmbientHumanAgent,
  type AmbientHumanAgent,
} from "./characters/AmbientHumanMotion";
import {
  createAldabraTortoise,
  createBlueAndGoldMacaw,
  createGaryPolarBear,
  createGreenAracari,
  createRedPanda,
  createScarletIbis,
  createSeaLion,
  createSpiderMonkey,
  createSunConure,
  createZebra,
  type ZooAnimalRig,
} from "./ZooAnimals";

export type BronxZooQuestState = "NEED_TICKET" | "ENTER_ZOO" | "FIND_SLOTHS" | "ESCORT_TO_STATION";

export type BronxZooEvent = {
  kind: "TICKET_RECEIVED" | "ENTRY_DENIED" | "SLOTHS_RELEASED";
  message: string;
};

export type BronxZooInteractionHint = {
  kind: "TICKET_DONOR" | "ENTRY_GATE" | "SLOTH_HABITAT";
  label: string;
  target: THREE.Vector3;
  distance: number;
};

type CircleObstacle = { kind: "circle"; x: number; z: number; radius: number; enabled?: () => boolean };
type BoxObstacle = { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number; enabled?: () => boolean };
type Obstacle = CircleObstacle | BoxObstacle;

type ZooMaterials = {
  bark: THREE.MeshStandardMaterial;
  earth: THREE.MeshStandardMaterial;
  glass: THREE.MeshPhysicalMaterial;
  iron: THREE.MeshStandardMaterial;
  leaf: THREE.MeshStandardMaterial;
  path: THREE.MeshStandardMaterial;
  stone: THREE.MeshStandardMaterial;
  water: THREE.MeshPhysicalMaterial;
  wood: THREE.MeshStandardMaterial;
};

const UP = new THREE.Vector3(0, 1, 0);

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([22, 56, 38, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Bronx Zoo requires a 2D canvas context");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

function signTexture(title: string, subtitle: string, accent = "#d7e9a6") {
  return canvasTexture(1536, 448, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#173d2a");
    gradient.addColorStop(1, "#071b12");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = accent;
    context.lineWidth = 15;
    context.strokeRect(22, 22, width - 44, height - 44);
    context.fillStyle = "#fff8e5";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 112px Georgia, serif";
    context.fillText(title, width / 2, 160);
    context.fillStyle = accent;
    context.font = "700 38px Helvetica, Arial, sans-serif";
    context.fillText(subtitle, width / 2, 305);
  });
}

function plaqueTexture() {
  return canvasTexture(1024, 640, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#2a2416");
    gradient.addColorStop(.52, "#544521");
    gradient.addColorStop(1, "#1c180e");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#d9bd70";
    context.lineWidth = 22;
    context.strokeRect(28, 28, width - 56, height - 56);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillStyle = "#f8e8b1";
    context.font = "700 126px Georgia, serif";
    context.fillText("GARY", width / 2, 145);
    context.font = "700 52px Helvetica, Arial, sans-serif";
    context.fillText("POLAR BEAR", width / 2, 252);
    context.fillStyle = "#e5d29b";
    context.font = "500 35px Helvetica, Arial, sans-serif";
    context.fillText("Provided thanks to generous support by", width / 2, 380);
    context.fillStyle = "#fff0b7";
    context.font = "700 94px Georgia, serif";
    context.fillText("TOGYL", width / 2, 505);
  });
}

function setShadow<T extends THREE.Mesh>(mesh: T, cast = true, receive = false) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value ^ (value >>> 15), 1 | value), value ^= value + Math.imul(value ^ (value >>> 7), 61 | value), ((value ^ (value >>> 14)) >>> 0) / 4294967296));
}

function distanceToSegmentXZ(x: number, z: number, start: [number, number], end: [number, number]) {
  const dx = end[0] - start[0], dz = end[1] - start[1];
  const lengthSquared = dx * dx + dz * dz;
  const amount = lengthSquared > 0 ? THREE.MathUtils.clamp(((x - start[0]) * dx + (z - start[1]) * dz) / lengthSquared, 0, 1) : 0;
  return Math.hypot(x - (start[0] + dx * amount), z - (start[1] + dz * amount));
}

function terrainHeight(x: number, z: number) {
  if (z > -10) return 0;
  const deep = THREE.MathUtils.smoothstep(-z, 10, 35);
  return deep * (Math.sin(x * .071 + z * .021) * .24 + Math.sin(z * .055 - x * .023) * .16);
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, radialSegments = 10) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * .86, radius, direction.length(), radialSegments, 2), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  return mesh;
}

function addTerrain(root: THREE.Group, textures: GameTextures) {
  const geometry = new THREE.PlaneGeometry(180, 220, 72, 88);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), z = positions.getZ(index) - 58;
    positions.setXYZ(index, x, terrainHeight(x, z), z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({
    map: textures.ground,
    bumpMap: textures.ground,
    bumpScale: .1,
    color: "#64794f",
    roughness: .98,
  });
  const ground = setShadow(new THREE.Mesh(geometry, material), false, true);
  ground.name = "bronx-zoo-textured-undulating-parkland";
  root.add(ground);
}

function addPathRibbon(root: THREE.Group, points: Array<[number, number]>, width: number, material: THREE.Material, name: string) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let cumulativeLength = 0;
  for (let index = 0; index < points.length; index++) {
    const [x, z] = points[index];
    if (index > 0) cumulativeLength += Math.hypot(x - points[index - 1][0], z - points[index - 1][1]);
    const previous = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)];
    const tangent = new THREE.Vector2(next[0] - previous[0], next[1] - previous[1]).normalize();
    const normal = new THREE.Vector2(-tangent.y, tangent.x);
    for (const side of [-1, 1]) {
      const px = x + normal.x * width * .5 * side, pz = z + normal.y * width * .5 * side;
      positions.push(px, terrainHeight(px, pz) + .035, pz);
      uvs.push(side < 0 ? 0 : 1, cumulativeLength / 50);
    }
    if (index < points.length - 1) {
      const base = index * 2;
      indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const path = setShadow(new THREE.Mesh(geometry, material), false, true);
  path.name = name;
  root.add(path);
}

function addStationExit(root: THREE.Group, materials: ZooMaterials, textures: GameTextures, ownedTextures: THREE.Texture[], quality: number) {
  const exit = new THREE.Group();
  exit.name = "west-farms-station-exit-approach";
  for (let step = 0; step < 12; step++) {
    const stair = setShadow(new THREE.Mesh(new RoundedBoxGeometry(8.1, .13, .72, 2, .025), materials.stone), false, true);
    stair.position.set(0, .08 + step * .085, 10.4 + step * .69);
    exit.add(stair);
  }
  for (const side of [-1, 1]) {
    const wall = setShadow(new THREE.Mesh(new RoundedBoxGeometry(.42, 1.65, 9.2, 4, .07), materials.stone), true, true);
    wall.position.set(side * 4.28, .62, 14.55);
    wall.rotation.x = -.075;
    exit.add(wall);
    const rail = cylinderBetween(new THREE.Vector3(side * 4.05, 1.15, 10.3), new THREE.Vector3(side * 4.05, 2.1, 18.8), .055, materials.iron, 10);
    exit.add(rail);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.075, .095, 2.2, 12), materials.iron);
    post.position.set(side * 4.7, 1.1, 18.7);
    exit.add(post);
  }
  const sidewalk = setShadow(new THREE.Mesh(new RoundedBoxGeometry(37, .16, 14, 6, .16), materials.stone), false, true);
  sidewalk.position.set(0, .94, 23.2);
  exit.add(sidewalk);
  const roadMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .025, color: "#414640", roughness: .98 });
  const road = setShadow(new THREE.Mesh(new RoundedBoxGeometry(176, .12, 12, 5, .1), roadMaterial), false, true);
  road.position.set(0, .83, 34.8);
  exit.add(road);
  for (let stripe = -4; stripe <= 4; stripe++) {
    const crossing = new THREE.Mesh(new RoundedBoxGeometry(1.15, .035, 9.5, 2, .015), materials.stone);
    crossing.position.set(stripe * 1.65, .91, 34.3);
    exit.add(crossing);
  }
  const exitTexture = signTexture("WEST FARMS SQ", "2  ·  5   BRONX ZOO / BOSTON ROAD");
  ownedTextures.push(exitTexture);
  const canopy = setShadow(new THREE.Mesh(new RoundedBoxGeometry(10.3, .38, 5.2, 6, .12), materials.iron));
  canopy.position.set(0, 4.15, 19.5);
  exit.add(canopy);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(7.7, 1.28, .22, 5, .08), new THREE.MeshBasicMaterial({ map: exitTexture, toneMapped: false }));
  sign.name = "west-farms-return-station-sign";
  // Keep the station identity legible without blocking the player's first
  // view of the donor, admission gate, and tree-lined zoo beyond it.
  sign.position.set(0, 5.18, 20.2);
  exit.add(sign);
  for (const x of [-4.35, 4.35]) for (const z of [18.2, 21.3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.085, .11, 3.25, quality > .72 ? 14 : 9), materials.iron);
    post.position.set(x, 2.5, z);
    exit.add(post);
  }
  root.add(exit);
}

function addArrivalFountain(root: THREE.Group, materials: ZooMaterials, quality: number) {
  const fountain = new THREE.Group();
  fountain.name = "bronx-zoo-arrival-fountain";
  fountain.position.set(-12, 0, -1);
  const basin = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(3.7, 4.05, .7, quality > .72 ? 56 : 32), materials.stone), true, true);
  basin.position.y = .35;
  fountain.add(basin);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.35, .1, quality > .72 ? 56 : 32), materials.water);
  water.position.y = .7;
  fountain.add(water);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(.45, .75, 2.2, 22), materials.stone);
  pedestal.position.y = 1.52;
  fountain.add(pedestal);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(.58, 24, 16), materials.stone);
  globe.position.y = 2.82;
  fountain.add(globe);
  root.add(fountain);
}

function addCampusBuilding(
  root: THREE.Group,
  materials: ZooMaterials,
  ownedTextures: THREE.Texture[],
  name: string,
  label: string,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
  color: string,
) {
  const building = new THREE.Group();
  building.name = name;
  building.position.set(x, terrainHeight(x, z), z);
  const facade = new THREE.MeshStandardMaterial({ color, map: materials.stone.map, bumpMap: materials.stone.bumpMap, bumpScale: .045, roughness: .9 });
  const body = setShadow(new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 6, .18), facade), true, true);
  body.position.y = height / 2;
  building.add(body);
  const cornice = new THREE.Mesh(new RoundedBoxGeometry(width + .55, .38, depth + .55, 4, .06), materials.stone);
  cornice.position.y = height - .15;
  building.add(cornice);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * .71, 2.5, 4), materials.iron);
  roof.position.y = height + 1.1;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = depth / width;
  building.add(roof);
  const windows = Math.max(3, Math.floor(width / 3));
  for (let index = 0; index < windows; index++) {
    const pane = new THREE.Mesh(new RoundedBoxGeometry(1.25, 1.85, .08, 3, .035), materials.glass);
    pane.position.set((index - (windows - 1) / 2) * (width - 2) / Math.max(1, windows - 1), height * .55, depth / 2 + .055);
    building.add(pane);
  }
  const texture = signTexture(label, "BRONX ZOO");
  ownedTextures.push(texture);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(Math.min(width - 1, 7.5), 1.05, .16, 4, .05), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  sign.position.set(0, height - .65, depth / 2 + .18);
  building.add(sign);
  root.add(building);
}

function addHabitatLabel(root: THREE.Group, ownedTextures: THREE.Texture[], materials: ZooMaterials, title: string, subtitle: string, x: number, z: number, yaw = 0) {
  const texture = signTexture(title, subtitle);
  ownedTextures.push(texture);
  const group = new THREE.Group();
  group.name = `${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-habitat-sign`;
  group.position.set(x, terrainHeight(x, z), z);
  group.rotation.y = yaw;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.08, .11, 2.25, 10), materials.iron);
  post.position.y = 1.12;
  group.add(post);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(4.5, 1.15, .18, 4, .05), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  sign.position.y = 2.25;
  group.add(sign);
  root.add(group);
}

function addCircularFence(root: THREE.Group, materials: ZooMaterials, x: number, z: number, radius: number, segments: number, glass = false) {
  const fence = new THREE.Group();
  fence.name = glass ? "bronx-zoo-glass-habitat-barrier" : "bronx-zoo-conservation-habitat-fence";
  for (let index = 0; index < segments; index++) {
    const angle = index / segments * Math.PI * 2;
    const nextAngle = (index + 1) / segments * Math.PI * 2;
    const px = x + Math.cos(angle) * radius, pz = z + Math.sin(angle) * radius;
    const nx = x + Math.cos(nextAngle) * radius, nz = z + Math.sin(nextAngle) * radius;
    const baseY = terrainHeight(px, pz);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.065, .085, glass ? 3.1 : 2.2, 9), materials.iron);
    post.position.set(px, baseY + (glass ? 1.55 : 1.1), pz);
    fence.add(post);
    if (glass) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(nx - px, nz - pz), 2.75), materials.glass);
      panel.position.set((px + nx) * .5, baseY + 1.42, (pz + nz) * .5);
      panel.rotation.y = -Math.atan2(nz - pz, nx - px);
      fence.add(panel);
    } else for (const y of [.55, 1.65]) {
      const rail = cylinderBetween(new THREE.Vector3(px, baseY + y, pz), new THREE.Vector3(nx, terrainHeight(nx, nz) + y, nz), .045, materials.iron, 8);
      fence.add(rail);
    }
  }
  root.add(fence);
}

function addLandscape(root: THREE.Group, materials: ZooMaterials, textures: GameTextures, quality: number, obstacles: Obstacle[]) {
  const random = seeded(12031966);
  const treeCount = Math.round(86 + quality * 68);
  const trunkGeometry = new THREE.CylinderGeometry(.32, .52, 7.1, quality > .75 ? 12 : 8, 3);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.bark, treeCount);
  trunks.name = "bronx-zoo-instanced-landscape-trunks";
  trunks.castShadow = quality > .65;
  trunks.receiveShadow = true;
  const canopyGeometry = new THREE.PlaneGeometry(6.2, 6.9);
  const canopies = new THREE.InstancedMesh(canopyGeometry, materials.leaf, treeCount * 3);
  canopies.name = "bronx-zoo-instanced-foliage-branch-canopies";
  canopies.castShadow = quality > .82;
  const dummy = new THREE.Object3D();
  let placed = 0, attempts = 0;
  const habitatClearings = [
    [-43, -51, 18], [43, -51, 18], [0, -76, 13], [-43, -101, 18], [43, -101, 19],
    [-36, -132, 12], [36, -132, 12], [0, -144, 21],
    [-68, -26, 13], [68, -28, 14], [-68, -82, 14], [69, -82, 15], [-66, -128, 14], [66, -129, 14],
  ];
  const clearRoutes: Array<Array<[number, number]>> = [
    [[0, 10], [0, -27], [-30, -43], [-39, -79], [-34, -118], [0, -139], [34, -118], [39, -79], [30, -43], [0, -27]],
    [[0, -27], [0, -66], [0, -112], [0, -130]],
  ];
  while (placed < treeCount && attempts++ < treeCount * 30) {
    const x = (random() * 2 - 1) * 84, z = -157 + random() * 164;
    const nearMainAxis = Math.abs(x) < 9 && z > -145;
    const nearRoute = clearRoutes.some(route => route.slice(1).some((end, index) => distanceToSegmentXZ(x, z, route[index], end) < 6.5));
    const inClearing = habitatClearings.some(([cx, cz, radius]) => Math.hypot(x - cx, z - cz) < radius);
    if (nearMainAxis || nearRoute || inClearing || (z > -15 && Math.abs(x) < 28)) continue;
    const scale = .72 + random() * .58, y = terrainHeight(x, z);
    dummy.position.set(x, y + 3.55 * scale, z);
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.scale.set(scale, scale, scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);
    for (let card = 0; card < 3; card++) {
      dummy.position.set(x + (random() - .5) * 1.7, y + (6.5 + random() * 1.5) * scale, z + (random() - .5) * 1.7);
      dummy.rotation.set(0, card * Math.PI / 3 + random() * .2, (random() - .5) * .09);
      dummy.scale.set(scale * (1 + random() * .22), scale, scale);
      dummy.updateMatrix();
      canopies.setMatrixAt(placed * 3 + card, dummy.matrix);
    }
    if (placed % 4 === 0) obstacles.push({ kind: "circle", x, z, radius: .44 * scale });
    placed++;
  }
  trunks.count = placed;
  canopies.count = placed * 3;
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  root.add(trunks, canopies);

  const fernCount = Math.round(160 + quality * 150);
  const ferns = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.45, 1.5), new THREE.MeshStandardMaterial({ map: textures.fern, alphaTest: .23, color: "#527a49", roughness: .9, side: THREE.DoubleSide }), fernCount);
  ferns.name = "bronx-zoo-instanced-fern-understory";
  let placedFerns = 0, fernAttempts = 0;
  while (placedFerns < fernCount && fernAttempts++ < fernCount * 20) {
    const x = (random() * 2 - 1) * 82, z = -154 + random() * 155, scale = .55 + random() * .72;
    const nearRoute = clearRoutes.some(route => route.slice(1).some((end, index) => distanceToSegmentXZ(x, z, route[index], end) < 4.7));
    const inClearing = habitatClearings.some(([cx, cz, radius]) => Math.hypot(x - cx, z - cz) < radius - 1);
    if (nearRoute || inClearing || (z > -15 && Math.abs(x) < 25)) continue;
    dummy.position.set(x, terrainHeight(x, z) + scale * .7, z);
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    ferns.setMatrixAt(placedFerns++, dummy.matrix);
  }
  ferns.count = placedFerns;
  ferns.instanceMatrix.needsUpdate = true;
  root.add(ferns);
}

function placeAnimal(root: THREE.Group, animals: ZooAnimalRig[], rig: ZooAnimalRig, x: number, z: number, yaw = 0, yOffset = 0) {
  rig.root.position.set(x, terrainHeight(x, z) + yOffset, z);
  rig.root.rotation.y = yaw;
  root.add(rig.root);
  animals.push(rig);
}

export class BronxZooWorld {
  readonly root = new THREE.Group();
  readonly spawn = new THREE.Vector3(0, 2.5, 25.5);
  readonly friendReviewSpawn = new THREE.Vector3(0, 1.48, -124.5);
  readonly ticketReviewSpawn = new THREE.Vector3(-8.5, 1.48, 7.8);
  readonly habitatReviewSpawn = new THREE.Vector3(0, 1.48, -125.8);
  readonly attendantPosition = new THREE.Vector3(3.5, 1.48, -16);
  readonly ticketDonorPosition = new THREE.Vector3(-8.5, 1.48, 6.2);
  readonly gatePosition = new THREE.Vector3(0, 1.48, -8);
  readonly slothHabitatPosition = new THREE.Vector3(0, 1.48, -128.6);
  readonly stationReturnPosition = new THREE.Vector3(0, 2.5, 19.5);
  readonly cameraPosition = new THREE.Vector3(0, 4.2, -118);
  readonly cameraTarget = new THREE.Vector3(0, 3.8, -140);
  readonly worldBounds = Object.freeze({ minX: -84, maxX: 84, minZ: -158, maxZ: 39.5 });
  readonly environmentSettings = Object.freeze({ cameraFar: 440, fogDensity: .0045, background: "#9bb5a0" });
  readonly attendant: THREE.Group;
  readonly ticketDonor: THREE.Group;
  readonly captiveSloths: THREE.Group[] = [];

  private ownedTextures: THREE.Texture[] = [];
  private readonly guestAgents: AmbientHumanAgent[] = [];
  private readonly animals: ZooAnimalRig[] = [];
  private readonly obstacles: Obstacle[] = [];
  private readonly entryGateLeaves: THREE.Group[] = [];
  private readonly keeperDoorLeaves: THREE.Group[] = [];
  private readonly sun = new THREE.DirectionalLight("#ffdda1", 2.6);
  private hasAdmissionTicket = false;
  private releasedFriends = false;
  private state: BronxZooQuestState = "NEED_TICKET";

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "bronx-zoo-rescue-level";
    scene.add(this.root);
    const high = quality > .72;
    this.root.add(new THREE.HemisphereLight("#edf5df", "#314738", 1.7));
    this.sun.position.set(-22, 38, 18);
    this.sun.castShadow = high;
    this.sun.shadow.mapSize.set(quality > .9 ? 2048 : 1024, quality > .9 ? 2048 : 1024);
    this.sun.shadow.camera.left = -42;
    this.sun.shadow.camera.right = 42;
    this.sun.shadow.camera.top = 42;
    this.sun.shadow.camera.bottom = -42;
    this.root.add(this.sun, this.sun.target);

    const materials: ZooMaterials = {
      bark: new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .1, color: "#715a42", roughness: .97 }),
      earth: new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .09, color: "#776b4d", roughness: .98 }),
      glass: new THREE.MeshPhysicalMaterial({ color: "#b7d2cb", transparent: true, opacity: .22, roughness: .08, clearcoat: .86, side: THREE.DoubleSide }),
      iron: new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .014, color: "#17221d", metalness: .79, roughness: .31 }),
      leaf: new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .23, color: "#4d7646", roughness: .9, side: THREE.DoubleSide }),
      path: new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .055, color: "#b7a98c", roughness: .94 }),
      stone: new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .055, color: "#bdb29b", roughness: .9 }),
      water: new THREE.MeshPhysicalMaterial({ normalMap: textures.waterNormal, normalScale: new THREE.Vector2(.28, .28), color: "#55969a", roughness: .12, transmission: .2, clearcoat: .9 }),
      wood: new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .075, color: "#86674a", roughness: .94 }),
    };

    addTerrain(this.root, textures);
    addPathRibbon(this.root, [[0, 10], [0, -27], [-30, -43], [-39, -79], [-34, -118], [0, -139], [34, -118], [39, -79], [30, -43], [0, -27]], 7.4, materials.path, "bronx-zoo-grand-conservation-loop");
    addPathRibbon(this.root, [[0, -27], [0, -66], [0, -112], [0, -130]], 6.1, materials.path, "bronx-zoo-central-rescue-walk");
    addStationExit(this.root, materials, textures, this.ownedTextures, quality);
    addArrivalFountain(this.root, materials, quality);

    this.addEntryGate(materials, quality);
    this.addTicketPavilions(materials);
    this.addBirdHabitat(materials, textures, quality);
    this.addGaryHabitat(materials, textures, quality);
    this.addSeaLionHabitat(materials, textures, quality);
    this.addMonkeyHabitat(materials, textures, quality);
    this.addZebraHabitat(materials, textures, quality);
    this.addRedPandaHabitat(materials, textures, quality);
    this.addTortoiseHabitat(materials, textures, quality);
    this.addSlothHabitat(materials, textures, quality);

    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-wildlife-health-center", "WILDLIFE HEALTH", -68, -26, 18, 7.6, 12, "#a47b62");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-conservation-center", "CONSERVATION CENTER", 68, -28, 19, 8.2, 12, "#b9ab8d");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-world-of-reptiles", "WORLD OF REPTILES", -68, -82, 19, 7.5, 13, "#806f55");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-jungleworld-pavilion", "JUNGLEWORLD", 69, -82, 20, 8.6, 14, "#9a7258");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-dancing-crane-cafe", "DANCING CRANE CAFE", -66, -128, 18, 7, 12, "#a48462");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-nature-trek-center", "NATURE TREK", 66, -129, 18, 7.2, 12, "#8f856c");

    addLandscape(this.root, materials, textures, quality, this.obstacles);
    this.addPermanentCollisions();

    const makeVisitor = (variant: number, faceVariant: number, coat: string, trousers: string, skin: string, outfit: PremiumHumanOutfit, accessory: "backpack" | "camera" | "tote" = "backpack") => createPremiumHuman({
      role: "visitor", quality, variant, faceVariant, coat, trousers, skin, outfit, accessory, pose: accessory === "camera" ? "photographing" : "neutral",
    });
    const donor = makeVisitor(31, 13, "#7f5266", "#363b43", "#a96f52", "cotton-denim", "tote");
    this.ticketDonor = donor.root;
    this.ticketDonor.name = "bronx-zoo-extra-ticket-donor";
    this.ticketDonor.userData.dialogue = "I couldn’t make it today, so please take my extra ticket.";
    this.ticketDonor.userData.givesExtraTicket = true;
    this.ticketDonor.position.set(this.ticketDonorPosition.x, 0, this.ticketDonorPosition.z);
    this.ticketDonor.rotation.y = Math.PI * .72;
    this.root.add(this.ticketDonor);
    this.ownedTextures.push(...donor.ownedTextures);

    const attendant = createPremiumHuman({
      role: "attendant", quality, variant: 24, faceVariant: 19,
      coat: "#2f6244", trousers: "#20382c", skin: "#9a684f",
      accessory: "radio", pose: "neutral", outfit: "zoo-uniform", zooNameTag: "Bronx Zoo",
    });
    this.attendant = attendant.root;
    this.attendant.name = "bronx-zoo-arrival-attendant";
    this.attendant.userData.dialogue = "Your sloth friends are in the conservation habitat at the far end of the zoo.";
    this.attendant.position.set(this.attendantPosition.x, terrainHeight(this.attendantPosition.x, this.attendantPosition.z), this.attendantPosition.z);
    this.attendant.rotation.y = Math.PI;
    this.root.add(this.attendant);
    this.ownedTextures.push(...attendant.ownedTextures);

    const guestData = [
      [-9, -22, .1, 11, 12, "#5c7f9b", "#354a67", "#b77e61", "cotton-denim"],
      [12, -35, 2.4, 14, 16, "#a65d78", "#26262d", "#79503e", "silk-leggings"],
      [-32, -68, -.6, 17, 18, "#a85239", "#51493f", "#cf9d78", "knit-chinos"],
      [34, -75, 2.7, 19, 11, "#496c62", "#373c38", "#85573f", "cotton-denim"],
      [-28, -112, .5, 22, 15, "#82704d", "#393033", "#d29a73", "knit-chinos"],
      [29, -119, -2.3, 27, 17, "#6d5481", "#242a35", "#634536", "silk-leggings"],
      [7, -89, 2.9, 29, 20, "#8c6354", "#3d4c50", "#bb8060", "cotton-denim"],
    ] as const;
    guestData.slice(0, quality < .58 ? 4 : quality < .82 ? 6 : guestData.length).forEach((data, index) => {
      const result = makeVisitor(data[3], data[4], data[5], data[6], data[7], data[8], index % 3 === 1 ? "camera" : index % 3 === 2 ? "tote" : "backpack");
      result.root.name = `bronx-zoo-wandering-visitor-${index + 1}`;
      result.root.position.set(data[0], terrainHeight(data[0], data[1]), data[1]);
      result.root.rotation.y = data[2];
      this.root.add(result.root);
      this.ownedTextures.push(...result.ownedTextures);
      this.guestAgents.push(createAmbientHumanAgent(result.root, {
        axis: new THREE.Vector3(index % 2 ? -1 : .25, 0, index % 2 ? .18 : 1),
        travel: 2.3 + index * .22,
        speed: .72 + index * .025,
        pauseSeconds: 2.5 + index * .37,
        phase: index * 2.1,
      }));
    });
  }

  get questState() { return this.state; }
  get hasTicket() { return this.hasAdmissionTicket; }
  get friendsReleased() { return this.releasedFriends; }

  get objectiveTarget() {
    if (this.state === "NEED_TICKET") return this.ticketDonorPosition.clone();
    if (this.state === "ENTER_ZOO") return this.gatePosition.clone();
    if (this.state === "FIND_SLOTHS") return this.slothHabitatPosition.clone();
    return this.stationReturnPosition.clone();
  }

  get objectiveLabel() {
    if (this.state === "NEED_TICKET") return "Find an admission ticket outside the Bronx Zoo";
    if (this.state === "ENTER_ZOO") return "Use the ticket to enter the Bronx Zoo";
    if (this.state === "FIND_SLOTHS") return "Find and release your sloth friends";
    return "Bring your friends to the West Farms station";
  }

  interactionHint(player: THREE.Vector3): BronxZooInteractionHint | null {
    const donorDistance = this.distanceXZ(player, this.ticketDonorPosition);
    if (!this.hasAdmissionTicket && donorDistance <= 2.6) return { kind: "TICKET_DONOR", label: "SPEAK WITH TICKET DONOR · ASK ABOUT EXTRA TICKET", target: this.ticketDonorPosition.clone(), distance: donorDistance };
    const gateDistance = this.distanceXZ(player, this.gatePosition);
    if (!this.hasAdmissionTicket && gateDistance <= 3.5) return { kind: "ENTRY_GATE", label: "ADMISSION TICKET REQUIRED", target: this.gatePosition.clone(), distance: gateDistance };
    const habitatDistance = this.distanceXZ(player, this.slothHabitatPosition);
    if (this.hasAdmissionTicket && !this.releasedFriends && habitatDistance <= 3.2) return { kind: "SLOTH_HABITAT", label: "OPEN THE SLOTH KEEPER DOOR", target: this.slothHabitatPosition.clone(), distance: habitatDistance };
    return null;
  }

  interact(player: THREE.Vector3): BronxZooEvent | null {
    const hint = this.interactionHint(player);
    if (!hint) return null;
    if (hint.kind === "TICKET_DONOR") {
      this.setTicketCollected(true);
      return { kind: "TICKET_RECEIVED", message: "“I couldn’t make it today, so please take my extra ticket.” Admission ticket received." };
    }
    if (hint.kind === "ENTRY_GATE") return { kind: "ENTRY_DENIED", message: "The entrance scanner flashes red. Find someone outside with an extra ticket." };
    this.setFriendsReleased(true);
    return { kind: "SLOTHS_RELEASED", message: "The keeper door is open. Your four sloth friends are free — bring them back to Central Park." };
  }

  setTicketCollected(collected: boolean) {
    this.hasAdmissionTicket = collected;
    if (!collected) this.state = "NEED_TICKET";
    else if (!this.releasedFriends && this.state === "NEED_TICKET") this.state = "ENTER_ZOO";
  }

  setFriendsReleased(released: boolean) {
    this.releasedFriends = released;
    this.captiveSloths.forEach(sloth => { sloth.visible = !released; });
    if (released) {
      this.hasAdmissionTicket = true;
      this.state = "ESCORT_TO_STATION";
    } else this.state = this.hasAdmissionTicket ? "FIND_SLOTHS" : "NEED_TICKET";
  }

  ticketDonorNearby(player: THREE.Vector3, distance = 2.6) { return this.distanceXZ(player, this.ticketDonorPosition) <= distance; }
  gateNearby(player: THREE.Vector3, distance = 3.5) { return this.distanceXZ(player, this.gatePosition) <= distance; }
  slothHabitatNearby(player: THREE.Vector3, distance = 3.2) { return this.distanceXZ(player, this.slothHabitatPosition) <= distance; }
  stationReturnReached(player: THREE.Vector3, distance = 2.4) { return this.releasedFriends && this.distanceXZ(player, this.stationReturnPosition) <= distance; }

  attendantNearby(player: THREE.Vector3, distance = 2.35) {
    return this.hasAdmissionTicket && this.distanceXZ(player, this.attendantPosition) <= distance;
  }

  floorHeight(xOrZ: number, zMaybe?: number) {
    const x = zMaybe === undefined ? 0 : xOrZ, z = zMaybe === undefined ? xOrZ : zMaybe;
    if (z >= 18 && z <= 30.2) return 1.02;
    if (z >= 10.4 && z < 18) {
      const amount = THREE.MathUtils.clamp((z - 10.4) / 7.6, 0, 1), step = Math.round(amount * 11);
      return .145 + step * .085;
    }
    return terrainHeight(x, z);
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    player.x = THREE.MathUtils.clamp(player.x, this.worldBounds.minX, this.worldBounds.maxX);
    player.z = THREE.MathUtils.clamp(player.z, this.worldBounds.minZ, this.worldBounds.maxZ);
    for (const obstacle of this.obstacles) {
      if (obstacle.enabled && !obstacle.enabled()) continue;
      if (obstacle.kind === "circle") this.resolveCircle(player, velocity, obstacle);
      else this.resolveBox(player, velocity, obstacle);
    }
    player.y = this.floorHeight(player.x, player.z) + 1.48;
  }

  update(elapsed: number, delta = 1 / 60, player?: THREE.Vector3) {
    if (this.hasAdmissionTicket && this.state === "ENTER_ZOO" && player && player.z < -10.5) this.state = "FIND_SLOTHS";
    const gateOpen = this.hasAdmissionTicket ? 1 : 0;
    this.entryGateLeaves.forEach((leaf, index) => {
      const target = gateOpen * (index ? -1.36 : 1.36);
      leaf.rotation.y += (target - leaf.rotation.y) * (1 - Math.exp(-delta * 4.5));
    });
    this.keeperDoorLeaves.forEach((leaf, index) => {
      const target = this.releasedFriends ? (index ? -1.42 : 1.42) : 0;
      leaf.rotation.y += (target - leaf.rotation.y) * (1 - Math.exp(-delta * 4.8));
    });
    idleAuthoredHuman(this.attendant, delta);
    idleAuthoredHuman(this.ticketDonor, delta);
    this.guestAgents.forEach(agent => updateAmbientHumanAgent(agent, elapsed, delta));
    this.animals.forEach(animal => animal.update(elapsed, delta));
    if (player) {
      this.sun.position.set(player.x - 22, 38, player.z + 18);
      this.sun.target.position.set(player.x, 0, player.z);
    }
  }

  dispose() {
    markPremiumCharactersDisposed(this.root);
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

  private addEntryGate(materials: ZooMaterials, quality: number) {
    const gateZ = -8;
    for (const side of [-1, 1]) {
      const pillar = setShadow(new THREE.Mesh(new RoundedBoxGeometry(2.3, 9.2, 2.3, 7, .2), materials.stone), true, true);
      pillar.position.set(side * 7.2, 4.6, gateZ);
      this.root.add(pillar);
      const finial = new THREE.Mesh(new THREE.SphereGeometry(.48, quality > .72 ? 24 : 16, 14), materials.stone);
      finial.position.set(side * 7.2, 9.45, gateZ);
      this.root.add(finial);
      const wall = new THREE.Mesh(new RoundedBoxGeometry(71, 3.1, .85, 5, .1), materials.stone);
      wall.position.set(side * 43.8, 1.55, gateZ);
      this.root.add(wall);
      const pivot = new THREE.Group();
      pivot.name = side < 0 ? "bronx-zoo-ticket-gate-left-leaf" : "bronx-zoo-ticket-gate-right-leaf";
      pivot.position.set(side * 6.1, 0, gateZ);
      for (let index = 0; index < 6; index++) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, 5.1, 9), materials.iron);
        bar.position.set(-side * (.5 + index * 1.02), 2.55, 0);
        pivot.add(bar);
      }
      for (const y of [.55, 2.55, 4.55]) {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(5.9, .1, .1), materials.iron);
        rail.position.set(-side * 3, y, 0);
        pivot.add(rail);
      }
      this.entryGateLeaves.push(pivot);
      this.root.add(pivot);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(7.2, .48, 18, quality > .72 ? 88 : 60, Math.PI), materials.iron);
    arch.position.set(0, 7.18, gateZ);
    this.root.add(arch);
    const texture = signTexture("BRONX ZOO", "ASIA GATE · WILDLIFE CONSERVATION");
    this.ownedTextures.push(texture);
    const sign = new THREE.Mesh(new RoundedBoxGeometry(9.2, 1.38, .3, 6, .1), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    sign.name = "bronx-zoo-asia-gate-sign";
    sign.position.set(0, 8.32, gateZ);
    this.root.add(sign);
  }

  private addTicketPavilions(materials: ZooMaterials) {
    for (const side of [-1, 1]) {
      const pavilion = new THREE.Group();
      pavilion.name = "bronx-zoo-ticket-and-member-pavilion";
      pavilion.position.set(side * 16, 0, -3.2);
      const body = setShadow(new THREE.Mesh(new RoundedBoxGeometry(4.8, 3.8, 3.7, 6, .14), materials.earth), true, true);
      body.position.y = 1.9;
      pavilion.add(body);
      const roof = new THREE.Mesh(new RoundedBoxGeometry(5.25, .36, 4.15, 4, .08), materials.iron);
      roof.position.y = 3.9;
      pavilion.add(roof);
      const window = new THREE.Mesh(new RoundedBoxGeometry(3.1, 1.42, .06, 5, .04), materials.glass);
      window.position.set(0, 2.18, 1.88);
      pavilion.add(window);
      this.root.add(pavilion);
    }
  }

  private addBirdHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const x = -43, z = -51, radius = 14.5;
    const habitat = new THREE.Group();
    habitat.name = "bronx-zoo-world-of-birds-sun-conure-aviary";
    const earth = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .12, 56), materials.earth);
    earth.position.set(x, terrainHeight(x, z) + .03, z);
    habitat.add(earth);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(radius, quality > .72 ? 40 : 28, 18, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: "#263b32", wireframe: true, transparent: true, opacity: .38, metalness: .7, roughness: .3 }));
    dome.position.set(x, terrainHeight(x, z), z);
    habitat.add(dome);
    for (let index = 0; index < 7; index++) {
      const angle = index / 7 * Math.PI * 2, branch = cylinderBetween(new THREE.Vector3(x + Math.cos(angle) * 8, 2.3 + index % 2, z + Math.sin(angle) * 8), new THREE.Vector3(x + Math.cos(angle + 1.1) * 3, 4.7 + index % 3, z + Math.sin(angle + 1.1) * 3), .12, materials.wood, 10);
      branch.name = "world-of-birds-natural-perch";
      habitat.add(branch);
    }
    this.root.add(habitat);
    const birds = [createSunConure(textures, quality), createBlueAndGoldMacaw(textures, quality), createScarletIbis(textures, quality), createGreenAracari(textures, quality)];
    const positions = [[-46, -49, 4.7, .4], [-39, -52, 5.7, -1.2], [-45, -56, 3.6, 2.4], [-40, -45, 4.2, -2.6]];
    birds.forEach((bird, index) => placeAnimal(this.root, this.animals, bird, positions[index][0], positions[index][1], positions[index][3], positions[index][2]));
    addHabitatLabel(this.root, this.ownedTextures, materials, "WORLD OF BIRDS", "SUN CONURE · MACAW · SCARLET IBIS · GREEN ARACARI", -31, -39, -.74);
  }

  private addGaryHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const x = 43, z = -51, radius = 14.5;
    addCircularFence(this.root, materials, x, z, radius, quality > .72 ? 26 : 18, true);
    const pool = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 6.2, .45, 48), materials.water);
    pool.name = "gary-polar-bear-cold-water-pool";
    pool.position.set(47, terrainHeight(47, -53) + .08, -53);
    this.root.add(pool);
    for (let index = 0; index < 12; index++) {
      const angle = index * 2.39, rock = setShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(.8 + index % 3 * .25, 1), materials.stone), true, true);
      rock.position.set(x + Math.cos(angle) * (6 + index % 4), terrainHeight(x, z) + .5, z + Math.sin(angle) * (5.5 + index % 3));
      rock.scale.y = .62;
      this.root.add(rock);
    }
    placeAnimal(this.root, this.animals, createGaryPolarBear(textures, quality), 39, -48, -1.05);
    const texture = plaqueTexture();
    this.ownedTextures.push(texture);
    const plaque = new THREE.Group();
    plaque.name = "gary-polar-bear-togyl-support-plaque";
    plaque.position.set(31.6, terrainHeight(31.6, -41.3), -41.3);
    plaque.rotation.y = -.72;
    const pedestal = new THREE.Mesh(new RoundedBoxGeometry(3.9, 2.45, .42, 5, .07), new THREE.MeshStandardMaterial({ color: "#6d5730", metalness: .58, roughness: .31 }));
    pedestal.position.y = 1.225;
    plaque.add(pedestal);
    const face = new THREE.Mesh(new RoundedBoxGeometry(3.55, 2.12, .08, 4, .04), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    face.position.set(0, 1.3, .25);
    plaque.add(face);
    this.root.add(plaque);
    addHabitatLabel(this.root, this.ownedTextures, materials, "POLAR BEAR", "GARY · ARCTIC CONSERVATION", 32, -61.5, -.15);
  }

  private addSeaLionHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const pool = new THREE.Group();
    pool.name = "bronx-zoo-sea-lion-pool";
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(10.5, 11.2, .8, quality > .72 ? 64 : 40), materials.stone);
    basin.position.set(0, terrainHeight(0, -76) + .2, -76);
    pool.add(basin);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(9.8, 9.8, .12, quality > .72 ? 64 : 40), materials.water);
    water.position.set(0, terrainHeight(0, -76) + .66, -76);
    pool.add(water);
    this.root.add(pool);
    placeAnimal(this.root, this.animals, createSeaLion(textures, quality, 0), -2.5, -76, .7, .75);
    placeAnimal(this.root, this.animals, createSeaLion(textures, quality, 1), 3.2, -78.5, -1.4, .75);
    addHabitatLabel(this.root, this.ownedTextures, materials, "SEA LION POOL", "CALIFORNIA SEA LIONS", -9, -65, -.2);
    this.obstacles.push({ kind: "circle", x: 0, z: -76, radius: 11.4 });
  }

  private addMonkeyHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const x = -43, z = -101, radius = 14.5;
    addCircularFence(this.root, materials, x, z, radius, quality > .72 ? 26 : 18, true);
    for (let index = 0; index < 5; index++) {
      const angle = index / 5 * Math.PI * 2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, 8, 12), materials.wood);
      pole.position.set(x + Math.cos(angle) * 6, terrainHeight(x, z) + 4, z + Math.sin(angle) * 6);
      this.root.add(pole);
      const rope = cylinderBetween(new THREE.Vector3(x + Math.cos(angle) * 6, 7, z + Math.sin(angle) * 6), new THREE.Vector3(x + Math.cos(angle + 1.25) * 6, 4.5, z + Math.sin(angle + 1.25) * 6), .045, materials.iron, 8);
      rope.name = "spider-monkey-climbing-rope";
      this.root.add(rope);
    }
    for (let index = 0; index < 3; index++) placeAnimal(this.root, this.animals, createSpiderMonkey(textures, quality, index), x - 3 + index * 3.2, z + (index % 2 ? 2 : -2), index * .8, index === 1 ? 3.8 : 0);
    addHabitatLabel(this.root, this.ownedTextures, materials, "MONKEY FOREST", "GEOFFROY'S SPIDER MONKEYS", -31, -89, -.75);
  }

  private addZebraHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    addCircularFence(this.root, materials, 43, -101, 15.5, quality > .72 ? 28 : 20);
    placeAnimal(this.root, this.animals, createZebra(textures, quality, 0), 40, -101, -1.1);
    placeAnimal(this.root, this.animals, createZebra(textures, quality, 1), 47, -105, 2.1);
    addHabitatLabel(this.root, this.ownedTextures, materials, "AFRICAN PLAINS", "PLAINS ZEBRA · GRASSLAND CONSERVATION", 31, -89, .75);
  }

  private addRedPandaHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    addCircularFence(this.root, materials, -36, -132, 9.5, quality > .72 ? 20 : 14, true);
    const branch = cylinderBetween(new THREE.Vector3(-40, 1.6, -134), new THREE.Vector3(-32, 4.2, -130), .24, materials.wood, 12);
    branch.name = "red-panda-arboreal-branch";
    this.root.add(branch);
    placeAnimal(this.root, this.animals, createRedPanda(textures, quality), -35, -132, .7, 2.85);
    addHabitatLabel(this.root, this.ownedTextures, materials, "RED PANDA", "HIMALAYAN FOREST", -28, -123, -.7);
  }

  private addTortoiseHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    addCircularFence(this.root, materials, 36, -132, 9.5, quality > .72 ? 20 : 14);
    placeAnimal(this.root, this.animals, createAldabraTortoise(textures, quality), 36, -132, -.6);
    addHabitatLabel(this.root, this.ownedTextures, materials, "GIANT TORTOISE", "ALDABRA ATOLL CONSERVATION", 28, -123, .7);
  }

  private addSlothHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const habitat = new THREE.Group();
    habitat.name = "bronx-zoo-sloth-conservation-enclosure";
    const floor = new THREE.Mesh(new RoundedBoxGeometry(31, .16, 25, 6, .16), materials.earth);
    floor.position.set(0, terrainHeight(0, -143), -143);
    habitat.add(floor);
    for (const x of [-15.5, 15.5]) {
      const wall = new THREE.Mesh(new RoundedBoxGeometry(.18, 5.5, 25, 3, .04), materials.glass);
      wall.position.set(x, 2.75, -143);
      habitat.add(wall);
    }
    const back = new THREE.Mesh(new RoundedBoxGeometry(31, 5.5, .18, 3, .04), materials.glass);
    back.position.set(0, 2.75, -155.5);
    habitat.add(back);
    for (const side of [-1, 1]) {
      const front = new THREE.Mesh(new RoundedBoxGeometry(12.7, 5.5, .18, 3, .04), materials.glass);
      front.position.set(side * 9.15, 2.75, -130.5);
      habitat.add(front);
      const pivot = new THREE.Group();
      pivot.name = side < 0 ? "sloth-habitat-left-keeper-door" : "sloth-habitat-right-keeper-door";
      pivot.position.set(side * 2.65, 0, -130.5);
      const doorCenterX = -side * 1.325;
      const door = new THREE.Mesh(new RoundedBoxGeometry(2.65, 5.1, .12, 3, .035), materials.glass);
      door.name = "sloth-habitat-clear-keeper-door-panel";
      door.position.set(doorCenterX, 2.55, 0);
      pivot.add(door);
      for (const xOffset of [-1.285, 1.285]) {
        const upright = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, 5.2, 9), materials.iron);
        upright.position.set(doorCenterX + xOffset, 2.6, 0);
        pivot.add(upright);
      }
      for (const y of [.1, 2.55, 5.05]) {
        const crossbar = new THREE.Mesh(new THREE.BoxGeometry(2.65, .1, .11), materials.iron);
        crossbar.position.set(doorCenterX, y, 0);
        pivot.add(crossbar);
      }
      this.keeperDoorLeaves.push(pivot);
      habitat.add(pivot);
    }
    const trunkPositions = [-9, -3, 4, 10];
    trunkPositions.forEach((x, index) => {
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.36, .58, 8.6, quality > .72 ? 15 : 10), materials.bark);
      trunk.position.set(x, 4.3, -145 + (index % 2 ? 2.5 : -1.5));
      habitat.add(trunk);
    });
    const branches = [
      [new THREE.Vector3(-11, 4.1, -143), new THREE.Vector3(-2, 5.6, -145)],
      [new THREE.Vector3(-5, 5, -139), new THREE.Vector3(5, 4.4, -142)],
      [new THREE.Vector3(1, 5.3, -147), new THREE.Vector3(11, 4.25, -144)],
      [new THREE.Vector3(-10, 3.7, -150), new THREE.Vector3(9, 5.8, -150)],
    ] as const;
    branches.forEach(([start, end], index) => {
      const branch = cylinderBetween(start, end, .31 - index * .025, materials.wood, quality > .72 ? 14 : 10);
      branch.name = `sloth-enclosure-load-bearing-tree-branch-${index + 1}`;
      habitat.add(branch);
    });
    const canopyGeometry = new THREE.PlaneGeometry(5.3, 5.7);
    for (let index = 0; index < 12; index++) {
      const angle = index * 2.399, radius = 3.2 + index % 3 * 2.7;
      const canopy = new THREE.Mesh(canopyGeometry, materials.leaf);
      canopy.name = "sloth-enclosure-broadleaf-canopy";
      canopy.position.set(Math.cos(angle) * radius, 6.2 + index % 3 * .62, -144 + Math.sin(angle) * radius);
      canopy.rotation.set(0, angle + index % 2 * Math.PI / 2, (index % 3 - 1) * .08);
      canopy.scale.setScalar(.82 + index % 4 * .08);
      habitat.add(canopy);
    }
    const fernMaterial = new THREE.MeshStandardMaterial({ map: textures.fern, alphaTest: .23, color: "#5d844e", roughness: .91, side: THREE.DoubleSide });
    for (let index = 0; index < 28; index++) {
      const x = -13 + index % 7 * 4.25, z = -153 + Math.floor(index / 7) * 5.35 + Math.sin(index * 1.7) * .7;
      const fern = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.55), fernMaterial);
      fern.name = "sloth-enclosure-fern-understory";
      fern.position.set(x, .72, z);
      fern.rotation.y = index * 1.37;
      fern.scale.setScalar(.72 + index % 5 * .08);
      habitat.add(fern);
    }
    this.root.add(habitat);
    const slothData = [
      [-7.6, -143.55, 4.28, -1.4, "#514536"],
      [-2.1, -140.6, 4.9, 1.2, "#423a31"],
      [4.2, -147.2, 4.74, -.8, "#594936"],
      [7.7, -149.8, 5.3, 2.2, "#443a30"],
    ] as const;
    slothData.forEach((data, index) => {
      const result = createPremiumSlothFriend(textures, quality, index, data[4]);
      result.root.name = `captive-sloth-friend-${index + 1}-on-real-branch`;
      result.root.position.set(data[0], data[2], data[1]);
      result.root.rotation.set(0, data[3], index % 2 ? .08 : -.06);
      result.root.userData.captive = true;
      habitat.add(result.root);
      this.captiveSloths.push(result.root);
      this.ownedTextures.push(...result.ownedTextures);
    });
    addHabitatLabel(this.root, this.ownedTextures, materials, "SLOTH CONSERVATION", "RESCUE HABITAT · KEEPER ACCESS", -9.5, -126.5, -.22);
  }

  private addPermanentCollisions() {
    this.obstacles.push(
      { kind: "circle", x: -12, z: -1, radius: 4.3 },
      { kind: "circle", x: -16, z: -3.2, radius: 2.8 },
      { kind: "circle", x: 16, z: -3.2, radius: 2.8 },
      { kind: "box", minX: -84, maxX: -6.45, minZ: -8.55, maxZ: -7.45 },
      { kind: "box", minX: 6.45, maxX: 84, minZ: -8.55, maxZ: -7.45 },
      { kind: "box", minX: -6.45, maxX: 6.45, minZ: -8.55, maxZ: -7.45, enabled: () => !this.hasAdmissionTicket },
      { kind: "circle", x: -43, z: -51, radius: 15.1 },
      { kind: "circle", x: 43, z: -51, radius: 15.1 },
      { kind: "circle", x: -43, z: -101, radius: 15.1 },
      { kind: "circle", x: 43, z: -101, radius: 16.1 },
      { kind: "circle", x: -36, z: -132, radius: 10.1 },
      { kind: "circle", x: 36, z: -132, radius: 10.1 },
      { kind: "box", minX: -77.5, maxX: -58.5, minZ: -32.5, maxZ: -19.5 },
      { kind: "box", minX: 58, maxX: 78, minZ: -34.5, maxZ: -21.5 },
      { kind: "box", minX: -78, maxX: -58, minZ: -89, maxZ: -75 },
      { kind: "box", minX: 58.5, maxX: 79.5, minZ: -89.5, maxZ: -74.5 },
      { kind: "box", minX: -75.5, maxX: -56.5, minZ: -134.5, maxZ: -121.5 },
      { kind: "box", minX: 56.5, maxX: 75.5, minZ: -135.5, maxZ: -122.5 },
      { kind: "box", minX: -16, maxX: -3, minZ: -156, maxZ: -130 },
      { kind: "box", minX: 3, maxX: 16, minZ: -156, maxZ: -130 },
      { kind: "box", minX: -3, maxX: 3, minZ: -156, maxZ: -130.2, enabled: () => !this.releasedFriends },
    );
  }

  private resolveCircle(player: THREE.Vector3, velocity: THREE.Vector3, obstacle: CircleObstacle) {
    const dx = player.x - obstacle.x, dz = player.z - obstacle.z, distance = Math.hypot(dx, dz);
    if (distance <= 0 || distance >= obstacle.radius) return;
    const correction = (obstacle.radius - distance) / distance;
    player.x += dx * correction;
    player.z += dz * correction;
    velocity.multiplyScalar(.58);
  }

  private resolveBox(player: THREE.Vector3, velocity: THREE.Vector3, obstacle: BoxObstacle) {
    if (player.x <= obstacle.minX || player.x >= obstacle.maxX || player.z <= obstacle.minZ || player.z >= obstacle.maxZ) return;
    const distances = [player.x - obstacle.minX, obstacle.maxX - player.x, player.z - obstacle.minZ, obstacle.maxZ - player.z];
    const smallest = Math.min(...distances), index = distances.indexOf(smallest);
    if (index === 0) player.x = obstacle.minX;
    else if (index === 1) player.x = obstacle.maxX;
    else if (index === 2) player.z = obstacle.minZ;
    else player.z = obstacle.maxZ;
    velocity.multiplyScalar(.52);
  }

  private distanceXZ(a: THREE.Vector3, b: THREE.Vector3) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
}
