import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Sky } from "three/addons/objects/Sky.js";
import type { GameTextures } from "../rendering/textures";
import { ZOO_SIDE_QUESTS, type ZooSideQuestId } from "../zooSideQuestLogic";
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
  cloneZooAnimalAtlasCell,
  configureAutonomousZooAnimal,
  createAldabraTortoise,
  createAmericanBison,
  createAmericanFlamingo,
  createBlueAndGoldMacaw,
  createGaryPolarBear,
  createGreenAracari,
  createRedPanda,
  createScarletIbis,
  createSeaLion,
  createSpiderMonkey,
  createSunConure,
  createZebra,
  type ZooHabitatMotionOptions,
  type ZooAnimalRig,
} from "./ZooAnimals";
import { markAuthoredZooAnimalsDisposed } from "./animals/AuthoredZooAnimalAssets";
import { createSkateboard, rollPersonalMobility, type PersonalMobilityVehicle } from "./PersonalMobility";

export type BronxZooQuestState = "ENTER_ZOO" | "FIND_SLOTHS" | "ESCORT_TO_BUS";

export type BronxZooEvent = {
  kind: "SKATEBOARD_OFFERED" | "LOCK_PICKING_STARTED" | "SLOTHS_RELEASED" | "GARY_HUNGRY" | "JAM_SANDWICH_VENDED" | "JAM_SANDWICH_RECOVERED" | "JAM_SANDWICH_MISSED" | "GARY_FED" | "ANIMAL_QUEST_STARTED";
  message: string;
  questId?: ZooSideQuestId;
};

export type BronxZooInteractionHint = {
  kind: "SKATEBOARD_DONOR" | "SLOTH_HABITAT" | "BUS_BOARDING" | "SNACK_MACHINE" | "GARY_HABITAT" | "LOOSE_JAM_SANDWICH" | "ANIMAL_QUEST";
  label: string;
  target: THREE.Vector3;
  distance: number;
  questId?: ZooSideQuestId;
};

type GarySnackState = "NONE" | "CARRIED" | "AIRBORNE" | "LOOSE" | "EATEN";

type CircleObstacle = { kind: "circle"; x: number; z: number; radius: number; enabled?: () => boolean };
type BoxObstacle = { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number; enabled?: () => boolean };
type Obstacle = CircleObstacle | BoxObstacle;

const ANIMAL_QUEST_ANCHORS: Record<ZooSideQuestId, { target: THREE.Vector3; prompt: string }> = {
  "aviary-voices": { target: new THREE.Vector3(-29.5, 1.48, -39), prompt: "JOIN THE WORLD OF BIRDS CANOPY CHORUS" },
  "sea-lion-current": { target: new THREE.Vector3(0, 1.48, -63), prompt: "STEER THE SEA LION ENRICHMENT CURRENT" },
  "monkey-canopy-rig": { target: new THREE.Vector3(-24, 1.48, -98), prompt: "STABILIZE THE MONKEY CANOPY RIG" },
  "zebra-stripe-scan": { target: new THREE.Vector3(26, 1.48, -98), prompt: "CALIBRATE THE ZEBRA STRIPE SCANNER" },
  "red-panda-scent-wind": { target: new THREE.Vector3(-25.5, 1.48, -123), prompt: "ROUTE THE RED PANDA SCENT TRAIL" },
  "tortoise-sun-trail": { target: new THREE.Vector3(25.5, 1.48, -123), prompt: "AIM THE TORTOISE WARMING MIRRORS" },
  "flamingo-wetland-balance": { target: new THREE.Vector3(-62, 1.48, -47), prompt: "BALANCE THE FLAMINGO WETLAND" },
  "bison-prairie-seeding": { target: new THREE.Vector3(62, 1.48, -97), prompt: "RESEED THE BISON PRAIRIE" },
};

const ANIMAL_QUEST_SOURCE_ROOTS: Record<ZooSideQuestId, readonly string[]> = {
  "aviary-voices": ["sun-conure-hero-bird", "blue-and-gold-macaw-bird", "scarlet-ibis-bird", "green-aracari-bird"],
  "sea-lion-current": ["bronx-zoo-sea-lion-1"],
  "monkey-canopy-rig": ["spider-monkey-1"],
  "zebra-stripe-scan": ["bronx-zoo-plains-zebra-1"],
  "red-panda-scent-wind": ["bronx-zoo-red-panda"],
  "tortoise-sun-trail": ["bronx-zoo-aldabra-giant-tortoise"],
  "flamingo-wetland-balance": ["bronx-zoo-american-flamingo-1"],
  "bison-prairie-seeding": ["bronx-zoo-american-bison-1"],
};

type CaptiveSlothMotion = {
  root: THREE.Group;
  body: THREE.Mesh | null;
  head: THREE.Mesh | null;
  basePosition: THREE.Vector3;
  baseRotation: THREE.Euler;
  baseHeadRotation: THREE.Euler | null;
  baseHeadScale: THREE.Vector3 | null;
  phase: number;
};

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

function shuttleStopTexture() {
  return canvasTexture(640, 960, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#174b36");
    gradient.addColorStop(1, "#082418");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.strokeStyle = "#f0d36a"; context.lineWidth = 20; context.strokeRect(22, 22, width - 44, height - 44);
    context.fillStyle = "#f0d36a"; context.beginPath(); context.arc(width / 2, 170, 88, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#102d22"; context.font = "800 92px Helvetica, Arial, sans-serif"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText("M", width / 2, 172);
    context.fillStyle = "#fff8e6"; context.font = "800 72px Helvetica, Arial, sans-serif"; context.fillText("MUSEUM", width / 2, 350); context.fillText("SHUTTLE", width / 2, 438);
    context.fillStyle = "#f0d36a"; context.fillRect(88, 505, width - 176, 6);
    context.font = "700 42px Helvetica, Arial, sans-serif"; context.fillText("BRONX ZOO", width / 2, 596); context.fillText("TO AMNH", width / 2, 660);
    context.fillStyle = "#d6e7d8"; context.font = "600 31px Helvetica, Arial, sans-serif"; context.fillText("WHOLE MENAGERIE", width / 2, 780); context.fillText("BOARDS TOGETHER", width / 2, 828);
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
    context.font = "700 44px Helvetica, Arial, sans-serif";
    context.fillText("TOGYL", width / 2, 505);
  });
}

function createJamSandwich() {
  const root = new THREE.Group();
  root.name = "gary-quest-project-authored-jam-sandwich";
  const bread = new THREE.MeshStandardMaterial({ color: "#e9c98d", roughness: .86 });
  const crust = new THREE.MeshStandardMaterial({ color: "#9c6536", roughness: .9 });
  const jam = new THREE.MeshPhysicalMaterial({ color: "#a71829", roughness: .38, clearcoat: .28, clearcoatRoughness: .4 });
  const lower = new THREE.Mesh(new RoundedBoxGeometry(.48, .08, .42, 5, .045), bread);
  lower.name = "jam-sandwich-lower-bread"; lower.position.y = .06;
  const filling = new THREE.Mesh(new RoundedBoxGeometry(.43, .035, .37, 4, .025), jam);
  filling.name = "jam-sandwich-visible-red-jam-filling"; filling.position.y = .12;
  const upper = new THREE.Mesh(new RoundedBoxGeometry(.48, .08, .42, 5, .045), bread);
  upper.name = "jam-sandwich-upper-bread"; upper.position.y = .18;
  const crustBand = new THREE.Mesh(new RoundedBoxGeometry(.5, .025, .44, 4, .04), crust);
  crustBand.name = "jam-sandwich-baked-crust-edge"; crustBand.position.y = .235;
  root.add(lower, filling, upper, crustBand);
  root.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; });
  return root;
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

function distanceToSegmentXZ(x: number, z: number, start: readonly [number, number], end: readonly [number, number]) {
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

function addZooSky(root: THREE.Group) {
  const sky = new Sky();
  sky.name = "bronx-zoo-atmospheric-daylight-sky";
  sky.scale.setScalar(620);
  sky.frustumCulled = false;
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld(true);
  };
  sky.material.uniforms.turbidity.value = 6.8;
  sky.material.uniforms.rayleigh.value = 2.2;
  sky.material.uniforms.mieCoefficient.value = .008;
  sky.material.uniforms.mieDirectionalG.value = .84;
  sky.material.uniforms.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(72), THREE.MathUtils.degToRad(214));
  root.add(sky);
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

function addPathKerbs(root: THREE.Group, points: ReadonlyArray<readonly [number, number]>, width: number, material: THREE.Material, name: string) {
  const kerbs = new THREE.Group();
  kerbs.name = `${name}-stone-kerbs-and-drainage-edge`;
  points.slice(1).forEach((end, index) => {
    const start = points[index];
    const dx = end[0] - start[0], dz = end[1] - start[1], length = Math.hypot(dx, dz);
    const unitX = dx / length, unitZ = dz / length;
    const normalX = -dz / length, normalZ = dx / length;
    const atJunction = (point: readonly [number, number]) => ZOO_PATH_JUNCTIONS.some(junction => Math.hypot(point[0] - junction[0], point[1] - junction[1]) < .25);
    // Kerbs stop before the shared path envelope. Previously every branch was
    // authored edge-to-edge, so long rectangular kerbs crossed the promenade
    // and each other like loose boards. Small miter trims remain at ordinary
    // bends; true circulation junctions get a full curb-cut opening.
    const startTrim = atJunction(start) ? Math.min(width * .64, length * .28) : index > 0 ? .12 : .3;
    const endTrim = atJunction(end) ? Math.min(width * .64, length * .28) : index < points.length - 2 ? .12 : .3;
    const kerbLength = Math.max(.35, length - startTrim - endTrim);
    for (const side of [-1, 1]) {
      const midpointX = start[0] + unitX * (startTrim + kerbLength * .5) + normalX * width * .5 * side;
      const midpointZ = start[1] + unitZ * (startTrim + kerbLength * .5) + normalZ * width * .5 * side;
      const kerb = setShadow(new THREE.Mesh(new THREE.BoxGeometry(kerbLength, .14, .19), material), false, true);
      kerb.position.set(midpointX, terrainHeight(midpointX, midpointZ) + .085, midpointZ);
      kerb.rotation.y = -Math.atan2(dz, dx);
      kerbs.add(kerb);
    }
  });
  root.add(kerbs);
}

// Visitor circulation is authored independently from habitat geometry. Every
// branch terminates at an observation edge instead of crossing a fence or
// pool, and the two sea-lion bypasses reconnect into one readable promenade.
const ZOO_VISITOR_PATHS = [
  { name: "bronx-zoo-entry-promenade", width: 8.2, points: [[0, 10], [0, -26], [0, -32], [0, -52]] },
  { name: "bronx-zoo-sea-lion-west-bypass", width: 6.8, points: [[0, -52], [-18.5, -62], [-18.5, -87], [0, -97]] },
  { name: "bronx-zoo-sea-lion-east-bypass", width: 6.8, points: [[0, -52], [18.5, -62], [18.5, -87], [0, -97]] },
  { name: "bronx-zoo-rescue-promenade", width: 7.6, points: [[0, -97], [0, -116], [0, -139]] },
  { name: "bronx-zoo-north-habitat-overlook", width: 5.4, points: [[-25, -39], [0, -32], [25, -39]] },
  { name: "bronx-zoo-monkey-and-plains-overlook", width: 5.4, points: [[-25, -90], [0, -97], [25, -90]] },
  { name: "bronx-zoo-south-conservation-overlook", width: 5.2, points: [[-23, -121], [0, -116], [23, -121]] },
  { name: "bronx-zoo-flamingo-wetland-spur", width: 4.8, points: [[-25, -39], [-46, -44], [-60.5, -47]] },
  { name: "bronx-zoo-bison-range-spur", width: 4.8, points: [[25, -90], [47, -94], [61.5, -97]] },
] as const satisfies ReadonlyArray<{ name: string; width: number; points: ReadonlyArray<readonly [number, number]> }>;

const ZOO_PATH_JUNCTIONS = [
  [0, -32], [0, -52], [0, -97], [0, -116],
  [-25, -39], [25, -39], [-25, -90], [25, -90], [-23, -121], [23, -121],
] as const satisfies ReadonlyArray<readonly [number, number]>;

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
  const treeCount = Math.round(120 + quality * 180);
  const branchesPerTree = quality > .75 ? 18 : quality > .5 ? 10 : 6;
  const canopyCardsPerTree = quality > .75 ? 32 : quality > .5 ? 16 : 8;
  const trunkGeometry = new THREE.CylinderGeometry(.32, .52, 7.1, quality > .75 ? 12 : 8, 3);
  const trunks = new THREE.InstancedMesh(trunkGeometry, materials.bark, treeCount);
  trunks.name = "bronx-zoo-instanced-landscape-trunks";
  trunks.castShadow = quality > .65;
  trunks.receiveShadow = true;
  const branchGeometry = new THREE.CylinderGeometry(.08, .19, 1, quality > .75 ? 10 : 7, 2);
  const branches = new THREE.InstancedMesh(branchGeometry, materials.bark, treeCount * branchesPerTree);
  branches.name = "bronx-zoo-instanced-articulated-landscape-branches";
  branches.castShadow = quality > .74;
  const canopyGeometry = new THREE.PlaneGeometry(6.2, 6.9);
  const canopies = new THREE.InstancedMesh(canopyGeometry, materials.leaf, treeCount * canopyCardsPerTree);
  canopies.name = "bronx-zoo-instanced-foliage-branch-canopies";
  canopies.castShadow = quality > .82;
  const dummy = new THREE.Object3D();
  const canopyPalette = [new THREE.Color("#335f35"), new THREE.Color("#477642"), new THREE.Color("#5d874b"), new THREE.Color("#2d5231"), new THREE.Color("#6f9255")];
  const branchStart = new THREE.Vector3(), branchEnd = new THREE.Vector3(), branchDirection = new THREE.Vector3();
  let placed = 0, attempts = 0;
  const habitatClearings = [
    [-43, -51, 18], [43, -51, 18], [0, -76, 13], [-43, -101, 18], [43, -101, 19],
    [-71, -55, 10], [72, -105, 11], [-36, -132, 12], [36, -132, 12], [0, -144, 21],
    [-68, -26, 13], [68, -28, 14], [-68, -82, 14], [69, -82, 15], [-66, -128, 14], [66, -129, 14],
    [22, -151, 9], [-13, -69, 3], [14, -107, 3], [-18, -122, 3],
  ];
  const clearRoutes = ZOO_VISITOR_PATHS.map(path => path.points);
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
    const crownRotation = random() * Math.PI * 2;
    for (let branch = 0; branch < branchesPerTree; branch++) {
      const angle = crownRotation + branch / branchesPerTree * Math.PI * 2 + (random() - .5) * .38;
      branchStart.set(x, y + (4.25 + branch % 3 * .48) * scale, z);
      branchEnd.set(x + Math.cos(angle) * (2.25 + branch % 2 * .7) * scale, y + (5.45 + branch % 3 * .62) * scale, z + Math.sin(angle) * (2.25 + branch % 2 * .7) * scale);
      branchDirection.copy(branchEnd).sub(branchStart);
      dummy.position.copy(branchStart).add(branchEnd).multiplyScalar(.5);
      dummy.quaternion.setFromUnitVectors(UP, branchDirection.clone().normalize());
      dummy.scale.set(scale, branchDirection.length(), scale);
      dummy.updateMatrix();
      branches.setMatrixAt(placed * branchesPerTree + branch, dummy.matrix);
    }
    for (let card = 0; card < canopyCardsPerTree; card++) {
      const crownRadius = 1.1 + random() * 2.35;
      const crownAngle = random() * Math.PI * 2;
      dummy.position.set(x + Math.cos(crownAngle) * crownRadius * scale, y + (5.75 + random() * 2.45) * scale, z + Math.sin(crownAngle) * crownRadius * scale);
      dummy.rotation.set(0, card * Math.PI / canopyCardsPerTree + random() * .2, (random() - .5) * .09);
      dummy.scale.set(scale * (.46 + random() * .36), scale * (.48 + random() * .38), scale);
      dummy.updateMatrix();
      const canopyIndex = placed * canopyCardsPerTree + card;
      canopies.setMatrixAt(canopyIndex, dummy.matrix);
      canopies.setColorAt(canopyIndex, canopyPalette[(placed + card * 3) % canopyPalette.length]);
    }
    if (placed % 3 === 0) obstacles.push({ kind: "circle", x, z, radius: .44 * scale });
    placed++;
  }
  trunks.count = placed;
  branches.count = placed * branchesPerTree;
  canopies.count = placed * canopyCardsPerTree;
  trunks.instanceMatrix.needsUpdate = true;
  branches.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  if (canopies.instanceColor) canopies.instanceColor.needsUpdate = true;
  root.add(trunks, branches, canopies);

  const fernCount = Math.round(420 + quality * 480);
  const ferns = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.45, 1.5), new THREE.MeshStandardMaterial({ map: textures.fern, alphaTest: .23, color: "#527a49", roughness: .9, side: THREE.DoubleSide }), fernCount * 2);
  ferns.name = "bronx-zoo-instanced-fern-understory";
  let placedFerns = 0, fernAttempts = 0;
  while (placedFerns < fernCount && fernAttempts++ < fernCount * 20) {
    const x = (random() * 2 - 1) * 82, z = -154 + random() * 155, scale = .55 + random() * .72;
    const nearRoute = clearRoutes.some(route => route.slice(1).some((end, index) => distanceToSegmentXZ(x, z, route[index], end) < 4.7));
    const inClearing = habitatClearings.some(([cx, cz, radius]) => Math.hypot(x - cx, z - cz) < radius - 1);
    if (nearRoute || inClearing || (z > -15 && Math.abs(x) < 25)) continue;
    const angle = random() * Math.PI;
    for (let card = 0; card < 2; card++) {
      dummy.position.set(x, terrainHeight(x, z) + scale * .7, z);
      dummy.rotation.set(0, angle + card * Math.PI / 2, 0);
      dummy.scale.set(scale, scale * 1.12, scale);
      dummy.updateMatrix();
      ferns.setMatrixAt(placedFerns * 2 + card, dummy.matrix);
    }
    placedFerns++;
  }
  ferns.count = placedFerns * 2;
  ferns.instanceMatrix.needsUpdate = true;

  const shrubCount = Math.round(220 + quality * 250);
  const shrubs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.65, 1.4), new THREE.MeshStandardMaterial({ map: textures.foliage, alphaTest: .27, color: "#617e50", roughness: .88, side: THREE.DoubleSide }), shrubCount * 2);
  shrubs.name = "bronx-zoo-instanced-native-shrub-layer";
  let placedShrubs = 0, shrubAttempts = 0;
  while (placedShrubs < shrubCount && shrubAttempts++ < shrubCount * 20) {
    const x = (random() * 2 - 1) * 82, z = -154 + random() * 155, scale = .55 + random() * .85;
    const nearRoute = clearRoutes.some(route => route.slice(1).some((end, index) => distanceToSegmentXZ(x, z, route[index], end) < 5.2));
    const inClearing = habitatClearings.some(([cx, cz, radius]) => Math.hypot(x - cx, z - cz) < radius - 1);
    if (nearRoute || inClearing || (z > -15 && Math.abs(x) < 25)) continue;
    const angle = random() * Math.PI;
    for (let card = 0; card < 2; card++) {
      dummy.position.set(x, terrainHeight(x, z) + scale * .54, z);
      dummy.rotation.set(0, angle + card * Math.PI / 2, 0);
      dummy.scale.set(scale, scale * (.72 + random() * .3), scale);
      dummy.updateMatrix(); shrubs.setMatrixAt(placedShrubs * 2 + card, dummy.matrix);
    }
    placedShrubs++;
  }
  shrubs.count = placedShrubs * 2; shrubs.instanceMatrix.needsUpdate = true;

  const rockCount = Math.round(55 + quality * 55), rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.55, 1), materials.stone, rockCount);
  rocks.name = "bronx-zoo-instanced-mossy-landscape-rocks";
  for (let index = 0; index < rockCount; index++) {
    const x = (random() * 2 - 1) * 82, z = -154 + random() * 154, scale = .28 + random() * .85;
    dummy.position.set(x, terrainHeight(x, z) + scale * .22, z); dummy.rotation.set(random(), random() * Math.PI, random()); dummy.scale.set(scale, scale * (.45 + random() * .3), scale); dummy.updateMatrix(); rocks.setMatrixAt(index, dummy.matrix);
  }
  rocks.instanceMatrix.needsUpdate = true; rocks.castShadow = quality > .72; rocks.receiveShadow = true;

  const litterCount = Math.round(620 + quality * 900), leafShape = new THREE.Shape();
  leafShape.moveTo(0, -.12); leafShape.quadraticCurveTo(.09, -.025, 0, .14); leafShape.quadraticCurveTo(-.09, -.025, 0, -.12);
  const litter = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape), new THREE.MeshStandardMaterial({ vertexColors: true, color: "#b5a989", roughness: 1, side: THREE.DoubleSide }), litterCount);
  litter.name = "bronx-zoo-instanced-forest-floor-leaf-litter";
  const litterPalette = [new THREE.Color("#51442d"), new THREE.Color("#6e5830"), new THREE.Color("#38422b"), new THREE.Color("#8a6b39"), new THREE.Color("#433725")];
  for (let index = 0; index < litterCount; index++) {
    const x = (random() * 2 - 1) * 83, z = -155 + random() * 158, scale = .5 + random() * .95;
    dummy.position.set(x, terrainHeight(x, z) + .035, z); dummy.rotation.set(-Math.PI / 2 + (random() - .5) * .12, random() * Math.PI * 2, (random() - .5) * .1); dummy.scale.setScalar(scale); dummy.updateMatrix(); litter.setMatrixAt(index, dummy.matrix); litter.setColorAt(index, litterPalette[index % litterPalette.length]);
  }
  litter.instanceMatrix.needsUpdate = true; if (litter.instanceColor) litter.instanceColor.needsUpdate = true;
  root.add(ferns, shrubs, rocks, litter);
}

function placeAnimal(
  root: THREE.Group,
  animals: ZooAnimalRig[],
  rig: ZooAnimalRig,
  x: number,
  z: number,
  yaw = 0,
  yOffset = 0,
  motion?: Omit<ZooHabitatMotionOptions, "floorHeight">,
) {
  rig.root.position.set(x, terrainHeight(x, z) + yOffset, z);
  rig.root.rotation.y = yaw;
  root.add(rig.root);
  animals.push(motion ? configureAutonomousZooAnimal(rig, { ...motion, floorHeight: terrainHeight }) : rig);
}

function addMuseumShuttleBus(root: THREE.Group, materials: ZooMaterials, ownedTextures: THREE.Texture[], quality: number) {
  const shuttle = new THREE.Group();
  shuttle.name = "bronx-zoo-parked-natural-history-museum-shuttle";
  shuttle.position.set(19.5, 1.02, 24.2);
  shuttle.rotation.y = Math.PI / 2;
  const yellow = new THREE.MeshPhysicalMaterial({ color: "#dfaa20", roughness: .46, clearcoat: .5, clearcoatRoughness: .28 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#101112", roughness: .95 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#8db9c1", roughness: .1, transmission: .24, transparent: true, opacity: .62 });
  const interiorDark = new THREE.MeshStandardMaterial({ color: "#202725", roughness: .88 });
  const doorMetal = new THREE.MeshStandardMaterial({ color: "#242b2b", roughness: .42, metalness: .58 });
  const wheelHub = new THREE.MeshStandardMaterial({ color: "#a9aaa4", roughness: .3, metalness: .72 });
  // Build the parked coach as a real shell with a cut-through curb-side
  // doorway. A single solid yellow capsule previously sat behind the open
  // glass leaf, so the player saw bodywork where an aisle should be.
  const roof = new THREE.Mesh(new RoundedBoxGeometry(3.1, .34, 8.1, 7, .14), yellow);
  roof.name = "museum-shuttle-roof-shell"; roof.position.y = 2.7; shuttle.add(roof);
  const lowerBody = new THREE.Mesh(new RoundedBoxGeometry(3.1, .72, 8.1, 6, .15), yellow);
  lowerBody.name = "museum-shuttle-lower-body-shell"; lowerBody.position.y = 1.02; shuttle.add(lowerBody);
  const driverSide = new THREE.Mesh(new RoundedBoxGeometry(.16, 1.55, 7.78, 5, .06), yellow);
  driverSide.name = "museum-shuttle-driver-side-body-shell"; driverSide.position.set(-1.48, 1.87, 0); shuttle.add(driverSide);
  const curbFront = new THREE.Mesh(new RoundedBoxGeometry(.16, 1.55, 1.18, 5, .06), yellow);
  curbFront.name = "museum-shuttle-curb-side-front-pillar"; curbFront.position.set(1.48, 1.87, -3.38); shuttle.add(curbFront);
  const curbRear = new THREE.Mesh(new RoundedBoxGeometry(.16, 1.55, 4.85, 5, .06), yellow);
  curbRear.name = "museum-shuttle-curb-side-body-behind-door"; curbRear.position.set(1.48, 1.87, .56); shuttle.add(curbRear);
  for (const z of [-4.0, 4.0]) {
    const endCap = new THREE.Mesh(new RoundedBoxGeometry(3.02, 1.76, .16, 5, .06), yellow);
    endCap.name = z < 0 ? "museum-shuttle-front-body-shell" : "museum-shuttle-rear-body-shell"; endCap.position.set(0, 1.78, z); shuttle.add(endCap);
  }
  // Segment the underbody around both axles. A single full-length black block
  // hid the tyres and made the shuttle hover like a rail car.
  for (const [z, length] of [[-3.92, .42], [-.28, 4.46], [3.56, 1.02]] as const) {
    const skirt = new THREE.Mesh(new RoundedBoxGeometry(3.18, .4, length, 5, .1), materials.iron);
    skirt.name = "museum-shuttle-segmented-wheel-clear-underbody"; skirt.position.set(0, .67, z); shuttle.add(skirt);
  }
  for (const side of [-1, 1]) {
    const belt = new THREE.Mesh(new RoundedBoxGeometry(.12, .18, 7.82, 4, .035), doorMetal);
    belt.name = "museum-shuttle-continuous-window-belt-trim"; belt.position.set(side * 1.56, 1.48, 0); shuttle.add(belt);
  }
  const windshield = new THREE.Mesh(new RoundedBoxGeometry(2.55, 1.25, .08, 5, .04), glass);
  windshield.position.set(0, 2.04, -4.08);
  shuttle.add(windshield);
  for (const side of [-1, 1]) for (let windowIndex = 0; windowIndex < 4; windowIndex++) {
    if (side > 0 && windowIndex === 0) continue;
    const window = new THREE.Mesh(new RoundedBoxGeometry(.08, 1.1, 1.36, 4, .035), glass);
    window.position.set(side * 1.57, 2.03, -2.42 + windowIndex * 1.6);
    shuttle.add(window);
  }
  const aisle = new THREE.Mesh(new RoundedBoxGeometry(2.62, .12, 7.45, 4, .04), new THREE.MeshStandardMaterial({ color: "#4a4c49", roughness: .92 }));
  aisle.name = "museum-shuttle-visible-interior-aisle"; aisle.position.set(0, .91, .12); shuttle.add(aisle);
  const interiorWall = new THREE.Mesh(new RoundedBoxGeometry(.06, 1.5, 6.8, 3, .02), new THREE.MeshStandardMaterial({ color: "#d8d0b9", emissive: "#755f35", emissiveIntensity: .12, roughness: .82 }));
  interiorWall.name = "museum-shuttle-visible-warm-interior-wall"; interiorWall.position.set(-1.37, 1.8, .3); shuttle.add(interiorWall);
  for (let row = 0; row < 3; row++) {
    const seat = new THREE.Mesh(new RoundedBoxGeometry(1.05, .62, .7, 5, .08), new THREE.MeshStandardMaterial({ color: row % 2 ? "#386b72" : "#315963", roughness: .78 }));
    seat.name = "museum-shuttle-visible-passenger-seat"; seat.position.set(-.68, 1.22, -.35 + row * 1.45); shuttle.add(seat);
  }
  const wheelGeometry = new THREE.CylinderGeometry(.5, .5, .34, quality > .72 ? 28 : 18);
  for (const side of [-1, 1]) for (const z of [-3.12, 2.55]) {
    const wheel = new THREE.Mesh(wheelGeometry, rubber);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(side * 1.59, .52, z);
    shuttle.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .07, quality > .72 ? 24 : 16), wheelHub);
    hub.name = "museum-shuttle-visible-metal-wheel-hub"; hub.rotation.z = Math.PI / 2; hub.position.set(side * 1.79, .52, z); shuttle.add(hub);
  }
  // A full-depth dark vestibule and three grounded treads make this read as an
  // actual open coach entrance. Door leaves fold perpendicular to the body at
  // the jambs; they never sit across the opening or intersect the front wheel.
  const portal = new THREE.Mesh(new RoundedBoxGeometry(.12, 1.72, 1.42, 4, .035), interiorDark);
  portal.name = "museum-shuttle-open-doorway-interior-shadow"; portal.position.set(1.38, 1.76, -2.14); shuttle.add(portal);
  for (let tread = 0; tread < 3; tread++) {
    const stepwell = new THREE.Mesh(new RoundedBoxGeometry(.72, .13, 1.36, 4, .035), tread % 2 ? doorMetal : materials.iron);
    stepwell.name = `museum-shuttle-recessed-entry-step-${tread + 1}`;
    stepwell.position.set(1.44 - tread * .58, .83 + tread * .22, -2.14); shuttle.add(stepwell);
    const nosing = new THREE.Mesh(new RoundedBoxGeometry(.06, .035, 1.22, 3, .012), new THREE.MeshStandardMaterial({ color: "#f0c83e", emissive: "#684d09", emissiveIntensity: .18, roughness: .58 }));
    nosing.position.set(stepwell.position.x + .36, stepwell.position.y + .075, stepwell.position.z); shuttle.add(nosing);
  }
  const doorway = new THREE.Group(); doorway.name = "museum-shuttle-true-open-boarding-doorway"; doorway.position.set(1.5, 0, -2.14);
  for (const z of [-.62, .62]) {
    const jamb = new THREE.Mesh(new RoundedBoxGeometry(.15, 1.92, .14, 4, .035), doorMetal); jamb.name = "museum-shuttle-grounded-door-jamb"; jamb.position.set(0, 1.76, z); doorway.add(jamb);
  }
  const header = new THREE.Mesh(new RoundedBoxGeometry(.15, .16, 1.38, 4, .035), doorMetal); header.position.set(0, 2.7, 0); doorway.add(header);
  for (const side of [-1, 1]) {
    const leaf = new THREE.Mesh(new RoundedBoxGeometry(.62, 1.68, .065, 4, .03), glass);
    leaf.name = "museum-shuttle-folded-open-glass-door-leaf"; leaf.position.set(.32, 1.77, side * .58); doorway.add(leaf);
    const leafRail = new THREE.Mesh(new RoundedBoxGeometry(.66, .065, .08, 3, .02), doorMetal);
    leafRail.name = "museum-shuttle-folded-door-waist-rail"; leafRail.position.set(.32, 1.72, side * .58); doorway.add(leafRail);
  }
  const grabMaterial = new THREE.MeshStandardMaterial({ color: "#e2c53e", metalness: .5, roughness: .38 });
  for (const side of [-1, 1]) {
    const grabRail = new THREE.Mesh(new THREE.TorusGeometry(.38, .04, 10, 28, Math.PI), grabMaterial);
    grabRail.name = "museum-shuttle-doorway-yellow-grab-rail"; grabRail.position.set(-.44, 1.72, side * .48); grabRail.rotation.set(0, Math.PI / 2, side < 0 ? Math.PI : 0); doorway.add(grabRail);
  }
  shuttle.add(doorway);
  const destinationTexture = signTexture("MUSEUM SHUTTLE", "BRONX ZOO  →  AMNH", "#f4d25f");
  ownedTextures.push(destinationTexture);
  const destination = new THREE.Mesh(new RoundedBoxGeometry(2.32, .46, .08, 4, .025), new THREE.MeshBasicMaterial({ map: destinationTexture, toneMapped: false }));
  destination.position.set(0, 2.58, -4.12);
  shuttle.add(destination);
  const boardingPad = new THREE.Group();
  boardingPad.name = "museum-shuttle-visible-exterior-boarding-zone";
  boardingPad.position.set(17.05, 1.035, 22.48);
  const boardingYellow = new THREE.MeshStandardMaterial({ color: "#f3c722", emissive: "#7d5c05", emissiveIntensity: .22, roughness: .68 });
  const pad = new THREE.Mesh(new RoundedBoxGeometry(3.4, .055, 2.15, 4, .035), new THREE.MeshStandardMaterial({ color: "#29302e", roughness: .9 }));
  pad.position.y = .028; boardingPad.add(pad);
  for (const x of [-1.5, 1.5]) {
    const edge = new THREE.Mesh(new RoundedBoxGeometry(.12, .07, 2.05, 2, .018), boardingYellow);
    edge.position.set(x, .07, 0); boardingPad.add(edge);
  }
  for (const z of [-.92, .92]) {
    const edge = new THREE.Mesh(new RoundedBoxGeometry(3.05, .07, .12, 2, .018), boardingYellow);
    edge.position.set(0, .07, z); boardingPad.add(edge);
  }
  const step = new THREE.Mesh(new RoundedBoxGeometry(1.55, .16, .72, 4, .04), materials.stone);
  step.name = "museum-shuttle-grounded-door-step";
  step.position.set(.12, .1, .64); boardingPad.add(step);
  const stopTexture = shuttleStopTexture(); ownedTextures.push(stopTexture);
  const stop = new THREE.Group();
  stop.name = "bronx-zoo-museum-shuttle-stop";
  stop.position.set(14.9, 1.02, 20.75);
  const post = new THREE.Mesh(new THREE.CylinderGeometry(.065, .085, 2.55, 12), doorMetal);
  post.position.y = 1.275;
  stop.add(post);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.11, 12, 8), new THREE.MeshStandardMaterial({ color: "#f0d36a", roughness: .35, metalness: .28 })); cap.position.y = 2.62; stop.add(cap);
  const marker = new THREE.Mesh(new RoundedBoxGeometry(1.12, 1.68, .12, 5, .04), new THREE.MeshStandardMaterial({ color: "#123a2a", roughness: .68, metalness: .16 }));
  marker.name = "bronx-zoo-human-scale-museum-shuttle-stop-blade"; marker.position.y = 2.35;
  stop.add(marker);
  const stopFaceMaterial = new THREE.MeshBasicMaterial({ map: stopTexture, toneMapped: false });
  for (const side of [-1, 1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(1.02, 1.58), stopFaceMaterial);
    face.name = "bronx-zoo-museum-shuttle-stop-dedicated-front-back-face"; face.position.set(0, 2.35, side * .066); if (side < 0) face.rotation.y = Math.PI; stop.add(face);
  }
  root.add(shuttle, boardingPad, stop);
  shuttle.traverse(object => { if (object instanceof THREE.Mesh) setShadow(object, quality > .6, true); });
}

export class BronxZooWorld {
  readonly root = new THREE.Group();
  readonly spawn = new THREE.Vector3(0, 2.5, 25.5);
  readonly friendReviewSpawn = new THREE.Vector3(0, 1.48, -124.5);
  readonly entryReviewSpawn = new THREE.Vector3(-8.5, 1.48, 7.8);
  readonly habitatReviewSpawn = new THREE.Vector3(0, 1.48, -125.8);
  readonly attendantPosition = new THREE.Vector3(3.5, 1.48, -16);
  readonly skateboardDonorPosition = new THREE.Vector3(-8.5, 1.48, 6.2);
  readonly gatePosition = new THREE.Vector3(0, 1.48, -8);
  readonly slothHabitatPosition = new THREE.Vector3(0, 1.48, -128.6);
  readonly garyHabitatCenter = new THREE.Vector3(43, 0, -51);
  readonly garyViewingPosition = new THREE.Vector3(28.5, 1.48, -37.5);
  // Exterior of the visible open door. Boarding is an explicit interaction;
  // the player never needs to intersect the coach body to trigger it.
  readonly busBoardingPosition = new THREE.Vector3(17.05, 2.5, 22.48);
  // Deliberately placed on the donor-to-gate desire line so her offer points
  // to a clearly visible, immediately usable mobility option.
  readonly skateboardPosition = new THREE.Vector3(-4.1, terrainHeight(-4.1, -1.1), -1.1);
  readonly cameraPosition = new THREE.Vector3(0, 4.2, -118);
  readonly cameraTarget = new THREE.Vector3(0, 3.8, -140);
  readonly worldBounds = Object.freeze({ minX: -84, maxX: 84, minZ: -158, maxZ: 39.5 });
  readonly environmentSettings = Object.freeze({ cameraFar: 440, fogDensity: .0045, background: "#9bb5a0" });
  readonly attendant: THREE.Group;
  readonly skateboardDonor: THREE.Group;
  readonly captiveSloths: THREE.Group[] = [];

  private ownedTextures: THREE.Texture[] = [];
  private readonly guestAgents: AmbientHumanAgent[] = [];
  private readonly animals: ZooAnimalRig[] = [];
  private readonly captiveSlothMotion: CaptiveSlothMotion[] = [];
  private readonly obstacles: Obstacle[] = [];
  private readonly entryGateLeaves: THREE.Group[] = [];
  private readonly keeperDoorLeaves: THREE.Group[] = [];
  private readonly keeperPadlock = new THREE.Group();
  private readonly sun = new THREE.DirectionalLight("#ffdda1", 2.6);
  private readonly snackMachinePositions = [new THREE.Vector3(-13, 0, -69), new THREE.Vector3(14, 0, -107), new THREE.Vector3(-18, 0, -122)];
  private readonly jamSandwich = createJamSandwich();
  private readonly jamSandwichVelocity = new THREE.Vector3();
  private readonly garyEvents: BronxZooEvent[] = [];
  private readonly completedAnimalQuests = new Set<ZooSideQuestId>();
  private garyRig: ZooAnimalRig | null = null;
  private garySnackState: GarySnackState = "NONE";
  private garyHungryAnnounced = false;
  private garyFed = false;
  private readonly skateboard: PersonalMobilityVehicle;
  private readonly skateboardPrevious = new THREE.Vector3();
  private skateboardMounted = false;
  private skateboardTrickStarted = -Infinity;
  private skateboardLift = 0;
  private hasAdmissionTicket = true;
  private releasedFriends = false;
  private state: BronxZooQuestState = "ENTER_ZOO";

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

    // Thin habitat panels were previously rendered as double-sided, depth-writing
    // translucent sheets. At grazing angles their overlapping passes accumulated
    // into the tall milky bands visible in first person. Keep the physical edge
    // catches, but render each pane once and never let it occlude later geometry.
    const habitatGlass = new THREE.MeshPhysicalMaterial({
      color: "#a9c8c0",
      transparent: true,
      opacity: .085,
      roughness: .2,
      clearcoat: .34,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    habitatGlass.forceSinglePass = true;

    const materials: ZooMaterials = {
      bark: new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .1, color: "#715a42", roughness: .97 }),
      earth: new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .09, color: "#776b4d", roughness: .98 }),
      glass: habitatGlass,
      iron: new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .014, color: "#17221d", metalness: .79, roughness: .31 }),
      leaf: new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .23, color: "#4d7646", roughness: .9, side: THREE.DoubleSide }),
      path: new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .055, color: "#b7a98c", roughness: .94 }),
      stone: new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .055, color: "#bdb29b", roughness: .9 }),
      water: new THREE.MeshPhysicalMaterial({ normalMap: textures.waterNormal, normalScale: new THREE.Vector2(.28, .28), color: "#55969a", roughness: .12, transmission: .2, clearcoat: .9 }),
      wood: new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .075, color: "#86674a", roughness: .94 }),
    };

    addZooSky(this.root);
    addTerrain(this.root, textures);
    ZOO_VISITOR_PATHS.forEach(path => {
      addPathRibbon(this.root, path.points.map(point => [...point] as [number, number]), path.width, materials.path, path.name);
      addPathKerbs(this.root, path.points, path.width, materials.stone, path.name);
    });
    addStationExit(this.root, materials, textures, this.ownedTextures, quality);
    addArrivalFountain(this.root, materials, quality);
    addMuseumShuttleBus(this.root, materials, this.ownedTextures, quality);
    this.skateboard = createSkateboard();
    this.skateboard.root.position.copy(this.skateboardPosition);
    this.skateboard.root.rotation.y = -.16;
    this.skateboard.root.userData.interactable = true;
    this.skateboard.root.userData.interactionKind = "zoo-skateboard";
    this.root.add(this.skateboard.root);
    this.skateboardPrevious.copy(this.skateboard.root.position);

    this.addEntryGate(materials, quality);
    this.addTicketPavilions(materials);
    this.addBirdHabitat(materials, textures, quality);
    this.addGaryHabitat(materials, textures, quality);
    this.addSeaLionHabitat(materials, textures, quality);
    this.addMonkeyHabitat(materials, textures, quality);
    this.addZebraHabitat(materials, textures, quality);
    this.addRedPandaHabitat(materials, textures, quality);
    this.addTortoiseHabitat(materials, textures, quality);
    this.addFlamingoWetland(materials, textures, quality);
    this.addBisonHabitat(materials, textures, quality);
    this.addSlothHabitat(materials, textures, quality);

    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-wildlife-health-center", "WILDLIFE HEALTH", -68, -26, 18, 7.6, 12, "#a47b62");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-conservation-center", "CONSERVATION CENTER", 68, -28, 19, 8.2, 12, "#b9ab8d");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-world-of-reptiles", "WORLD OF REPTILES", -68, -82, 19, 7.5, 13, "#806f55");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-jungleworld-pavilion", "JUNGLEWORLD", 69, -82, 20, 8.6, 14, "#9a7258");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-dancing-crane-cafe", "DANCING CRANE CAFE", -66, -128, 18, 7, 12, "#a48462");
    addCampusBuilding(this.root, materials, this.ownedTextures, "bronx-zoo-nature-trek-center", "NATURE TREK", 66, -129, 18, 7.2, 12, "#8f856c");

    this.addGuestAmenities(materials, textures, quality);
    this.jamSandwich.visible = false;
    this.root.add(this.jamSandwich);
    addLandscape(this.root, materials, textures, quality, this.obstacles);
    this.addPermanentCollisions();

    const makeVisitor = (variant: number, faceVariant: number, coat: string, trousers: string, skin: string, outfit: PremiumHumanOutfit, accessory: "backpack" | "camera" | "tote" = "backpack") => createPremiumHuman({
      role: "visitor", quality, variant, faceVariant, coat, trousers, skin, outfit, accessory, pose: accessory === "camera" ? "photographing" : "neutral",
    });
    const donor = makeVisitor(31, 13, "#7f5266", "#363b43", "#a96f52", "cotton-denim", "tote");
    this.skateboardDonor = donor.root;
    this.skateboardDonor.name = "bronx-zoo-skateboard-donor";
    this.skateboardDonor.userData.dialogue = "Oh, you can have my skateboard if you want. It’s over there.";
    this.skateboardDonor.userData.offersSkateboard = true;
    this.skateboardDonor.position.set(this.skateboardDonorPosition.x, 0, this.skateboardDonorPosition.z);
    this.skateboardDonor.rotation.y = Math.PI * .72;
    this.root.add(this.skateboardDonor);
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
  get isGaryFed() { return this.garyFed; }
  get hasJamSandwich() { return this.garySnackState === "CARRIED"; }
  get isSkateboardMounted() { return this.skateboardMounted; }
  get skateboardRideLift() { return this.skateboardLift; }
  get completedSideQuestIds() { return [...this.completedAnimalQuests]; }

  get objectiveTarget() {
    if (this.state === "ENTER_ZOO") return this.gatePosition.clone();
    if (this.state === "FIND_SLOTHS") return this.slothHabitatPosition.clone();
    return this.busBoardingPosition.clone();
  }

  get objectiveLabel() {
    if (this.state === "ENTER_ZOO") return "Enter the Bronx Zoo with your island ticket";
    if (this.state === "FIND_SLOTHS") return "Find the sloth habitat and pick its keeper lock";
    return "Bring your friends to the zoo shuttle bus";
  }

  interactionHint(player: THREE.Vector3): BronxZooInteractionHint | null {
    const donorDistance = this.distanceXZ(player, this.skateboardDonorPosition);
    if (donorDistance <= 2.6) return { kind: "SKATEBOARD_DONOR", label: "TALK TO VISITOR ABOUT THE SKATEBOARD", target: this.skateboardDonorPosition.clone(), distance: donorDistance };
    if (this.garySnackState === "LOOSE") {
      const looseDistance = this.distanceXZ(player, this.jamSandwich.position);
      if (looseDistance <= 2.1) return { kind: "LOOSE_JAM_SANDWICH", label: "PICK UP THE JAM SANDWICH AND TRY AGAIN", target: this.jamSandwich.position.clone(), distance: looseDistance };
    }
    if (!this.garyFed && this.garySnackState === "NONE") {
      let nearestMachineIndex = -1, machineDistance = Infinity;
      this.snackMachinePositions.forEach((position, index) => {
        const distance = this.distanceXZ(player, position);
        if (distance < machineDistance) { machineDistance = distance; nearestMachineIndex = index; }
      });
      if (nearestMachineIndex >= 0 && machineDistance <= 2.4) return { kind: "SNACK_MACHINE", label: "VEND A JAM SANDWICH FOR GARY", target: this.snackMachinePositions[nearestMachineIndex].clone(), distance: machineDistance };
    }
    if (!this.garyFed) {
      const garyDistance = this.distanceXZ(player, this.garyViewingPosition);
      if (garyDistance <= 4.3) return {
        kind: "GARY_HABITAT",
        label: this.garySnackState === "CARRIED" ? "THROW THE JAM SANDWICH OVER GARY’S ENCLOSURE" : "GARY IS HUNGRY · FIND A SNACK MACHINE",
        target: this.garyViewingPosition.clone(),
        distance: garyDistance,
      };
    }
    let closestAnimalQuest: BronxZooInteractionHint | null = null;
    for (const [questId, anchor] of Object.entries(ANIMAL_QUEST_ANCHORS) as Array<[ZooSideQuestId, (typeof ANIMAL_QUEST_ANCHORS)[ZooSideQuestId]]>) {
      if (this.completedAnimalQuests.has(questId)) continue;
      const distance = this.distanceXZ(player, anchor.target);
      if (distance > 4.6 || closestAnimalQuest && distance >= closestAnimalQuest.distance) continue;
      closestAnimalQuest = { kind: "ANIMAL_QUEST", questId, label: anchor.prompt, target: anchor.target.clone(), distance };
    }
    if (closestAnimalQuest) return closestAnimalQuest;
    const habitatDistance = this.distanceXZ(player, this.slothHabitatPosition);
    if (!this.releasedFriends && habitatDistance <= 3.2) return { kind: "SLOTH_HABITAT", label: "PICK THE SIX-PIN SLOTH HABITAT LOCK", target: this.slothHabitatPosition.clone(), distance: habitatDistance };
    const boardingDistance = this.distanceXZ(player, this.busBoardingPosition);
    if (this.releasedFriends && boardingDistance <= 4.2) return { kind: "BUS_BOARDING", label: "BOARD MUSEUM SHUTTLE WITH YOUR WHOLE MENAGERIE", target: this.busBoardingPosition.clone(), distance: boardingDistance };
    return null;
  }

  interact(player: THREE.Vector3, yaw = 0): BronxZooEvent | null {
    const hint = this.interactionHint(player);
    if (!hint) return null;
    if (hint.kind === "SKATEBOARD_DONOR") return { kind: "SKATEBOARD_OFFERED", message: "“Oh, you can have my skateboard if you want. It’s over there.”" };
    if (hint.kind === "BUS_BOARDING") return null;
    if (hint.kind === "SNACK_MACHINE") {
      this.garySnackState = "CARRIED";
      this.jamSandwich.visible = true;
      return { kind: "JAM_SANDWICH_VENDED", message: "The machine vends a fresh jam sandwich. Bring it to hungry Gary at the polar bear enclosure." };
    }
    if (hint.kind === "LOOSE_JAM_SANDWICH") {
      this.garySnackState = "CARRIED";
      return { kind: "JAM_SANDWICH_RECOVERED", message: "You pick the sandwich back up. Face Gary’s enclosure and try the throw again." };
    }
    if (hint.kind === "GARY_HABITAT") {
      if (this.garySnackState !== "CARRIED") return { kind: "GARY_HUNGRY", message: "Gary is hungry. One of the green snack machines can vend him a jam sandwich." };
      const forward = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      this.jamSandwich.position.copy(player).addScaledVector(forward, .72);
      this.jamSandwich.position.y -= .3;
      this.jamSandwichVelocity.copy(forward).multiplyScalar(14.5).setY(4.35);
      this.garySnackState = "AIRBORNE";
      return null;
    }
    if (hint.kind === "ANIMAL_QUEST" && hint.questId) {
      const quest = ZOO_SIDE_QUESTS[hint.questId];
      return { kind: "ANIMAL_QUEST_STARTED", questId: hint.questId, message: `${quest.title}: ${quest.objective}` };
    }
    return { kind: "LOCK_PICKING_STARTED", message: "Keep plug tension between 40% and 60%, then find the six pins in binding order." };
  }

  completeAnimalQuest(questId: ZooSideQuestId) {
    if (this.completedAnimalQuests.has(questId)) return ZOO_SIDE_QUESTS[questId].recruitedSpecies;
    this.completedAnimalQuests.add(questId);
    ANIMAL_QUEST_SOURCE_ROOTS[questId].forEach(name => {
      const source = this.root.getObjectByName(name);
      if (source) source.visible = false;
    });
    return ZOO_SIDE_QUESTS[questId].recruitedSpecies;
  }

  consumeGaryEvent() { return this.garyEvents.shift() ?? null; }

  setGaryFed(fed = true) {
    this.garyFed = fed;
    this.garySnackState = fed ? "EATEN" : "NONE";
    this.jamSandwich.visible = false;
    if (this.garyRig) this.garyRig.root.visible = !fed;
  }

  completeLockPicking() {
    this.setFriendsReleased(true);
    return { kind: "SLOTHS_RELEASED", message: "The six pins set and the keeper lock turns. Lead your growing menagerie along the promenade and board the museum shuttle bus." } as const;
  }

  setFriendsReleased(released: boolean) {
    this.releasedFriends = released;
    this.captiveSloths.forEach(sloth => { sloth.visible = !released; });
    this.keeperPadlock.visible = !released;
    if (released) {
      this.hasAdmissionTicket = true;
      this.state = "ESCORT_TO_BUS";
    } else this.state = "FIND_SLOTHS";
  }

  skateboardDonorNearby(player: THREE.Vector3, distance = 2.6) { return this.distanceXZ(player, this.skateboardDonorPosition) <= distance; }
  gateNearby(player: THREE.Vector3, distance = 3.5) { return this.distanceXZ(player, this.gatePosition) <= distance; }
  slothHabitatNearby(player: THREE.Vector3, distance = 3.2) { return this.distanceXZ(player, this.slothHabitatPosition) <= distance; }
  busBoardingReached(player: THREE.Vector3, distance = 2.8) { return this.releasedFriends && this.distanceXZ(player, this.busBoardingPosition) <= distance; }
  skateboardNearby(player: THREE.Vector3, distance = 2.4) { return !this.skateboardMounted && this.distanceXZ(player, this.skateboard.root.position) <= distance; }

  setSkateboardMounted(mounted: boolean, player?: THREE.Vector3, yaw = 0) {
    this.skateboardMounted = mounted;
    this.skateboardLift = 0;
    this.skateboardTrickStarted = -Infinity;
    this.skateboard.root.userData.ridden = mounted;
    if (!mounted && player) {
      const floor = this.floorHeight(player.x, player.z);
      this.skateboard.root.position.set(player.x + Math.cos(yaw) * 1.15, floor, player.z - Math.sin(yaw) * 1.15);
      this.skateboard.root.rotation.set(0, yaw, 0);
      this.skateboardPrevious.copy(this.skateboard.root.position);
    }
  }

  triggerSkateboardKickflip(elapsed: number) {
    if (this.skateboardMounted && elapsed - this.skateboardTrickStarted > .9) this.skateboardTrickStarted = elapsed;
  }

  updateSkateboard(elapsed: number, player: THREE.Vector3, movementYaw: number) {
    if (!this.skateboardMounted) return;
    const floor = this.floorHeight(player.x, player.z);
    const distance = Math.hypot(player.x - this.skateboardPrevious.x, player.z - this.skateboardPrevious.z);
    const trickPhase = THREE.MathUtils.clamp((elapsed - this.skateboardTrickStarted) / .82, 0, 1);
    const trickActive = trickPhase > 0 && trickPhase < 1;
    this.skateboardLift = trickActive ? Math.sin(trickPhase * Math.PI) * .6 : 0;
    this.skateboard.root.position.set(player.x, floor + this.skateboardLift, player.z);
    this.skateboard.root.rotation.set(0, movementYaw, trickActive ? trickPhase * Math.PI * 2 : 0);
    rollPersonalMobility(this.skateboard, distance, .095);
    this.skateboardPrevious.copy(player);
  }

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

  resolveCompanion(position: THREE.Vector3, velocity: THREE.Vector3, radius: number) {
    position.x = THREE.MathUtils.clamp(position.x, this.worldBounds.minX + radius, this.worldBounds.maxX - radius);
    position.z = THREE.MathUtils.clamp(position.z, this.worldBounds.minZ + radius, this.worldBounds.maxZ - radius);
    for (const obstacle of this.obstacles) {
      if (obstacle.enabled && !obstacle.enabled()) continue;
      if (obstacle.kind === "circle") this.resolveCircle(position, velocity, obstacle, radius);
      else this.resolveBox(position, velocity, obstacle, radius);
    }
    position.y = this.floorHeight(position.x, position.z);
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
    idleAuthoredHuman(this.skateboardDonor, delta);
    this.guestAgents.forEach(agent => updateAmbientHumanAgent(agent, elapsed, delta));
    this.animals.forEach(animal => animal.update(elapsed, delta));
    this.completedAnimalQuests.forEach(questId => {
      ANIMAL_QUEST_SOURCE_ROOTS[questId].forEach(name => {
        const source = this.root.getObjectByName(name);
        if (source) source.visible = false;
      });
    });
    if (player && !this.garyFed && !this.garyHungryAnnounced && this.distanceXZ(player, this.garyViewingPosition) <= 5.2) {
      this.garyHungryAnnounced = true;
      this.garyEvents.push({ kind: "GARY_HUNGRY", message: "Gary presses his nose toward the fence. He’s hungry — a nearby snack machine vends jam sandwiches." });
    }
    this.updateGarySandwich(delta, player);
    this.updateCaptiveSlothMotion(elapsed);
    if (player) {
      this.sun.position.set(player.x - 22, 38, player.z + 18);
      this.sun.target.position.set(player.x, 0, player.z);
    }
  }

  private updateGarySandwich(delta: number, player?: THREE.Vector3) {
    if (this.garySnackState === "CARRIED" && player) {
      this.jamSandwich.visible = true;
      this.jamSandwich.position.set(player.x + .38, player.y - .7, player.z - .16);
      this.jamSandwich.rotation.set(.08, -.2, -.12);
      return;
    }
    if (this.garySnackState !== "AIRBORNE") return;
    this.jamSandwichVelocity.y -= 9.81 * delta;
    this.jamSandwich.position.addScaledVector(this.jamSandwichVelocity, delta);
    this.jamSandwich.rotation.x += delta * 4.4;
    this.jamSandwich.rotation.z += delta * 3.2;
    const floor = terrainHeight(this.jamSandwich.position.x, this.jamSandwich.position.z) + .12;
    if (this.jamSandwich.position.y > floor || this.jamSandwichVelocity.y >= 0) return;
    this.jamSandwich.position.y = floor;
    this.jamSandwichVelocity.set(0, 0, 0);
    const landedInside = this.distanceXZ(this.jamSandwich.position, this.garyHabitatCenter) <= 13.2;
    if (landedInside) {
      this.setGaryFed(true);
      this.garyEvents.push({ kind: "GARY_FED", message: "Gary devours the jam sandwich, splattering red jam across his white coat. He’s climbing over the enclosure to join you!" });
    } else {
      this.garySnackState = "LOOSE";
      this.garyEvents.push({ kind: "JAM_SANDWICH_MISSED", message: "The sandwich lands on your side of the enclosure. Pick it up and try the throw again." });
    }
  }

  dispose() {
    markAuthoredZooAnimalsDisposed(this.root);
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
    this.animals.forEach(animal => animal.ownedTextures?.forEach(texture => texture.dispose()));
    this.ownedTextures.forEach(texture => texture.dispose());
  }

  private updateCaptiveSlothMotion(elapsed: number) {
    this.captiveSlothMotion.forEach((motion, index) => {
      if (!motion.root.visible) return;
      const cycle = ((elapsed + motion.phase) % 16 + 16) % 16;
      const state = cycle < 5.5 ? "branch-rest" : cycle < 10.5 ? "leaf-forage" : "careful-branch-climb";
      motion.root.userData.animationState = state;
      const climbAmount = state === "careful-branch-climb" ? Math.sin((cycle - 10.5) / 5.5 * Math.PI) * .22 : 0;
      motion.root.position.copy(motion.basePosition);
      motion.root.position.x += Math.sin(motion.baseRotation.y) * climbAmount;
      motion.root.position.z += Math.cos(motion.baseRotation.y) * climbAmount;
      motion.root.position.y += state === "careful-branch-climb" ? Math.sin(elapsed * 2.2 + index) * .018 : 0;
      motion.root.rotation.copy(motion.baseRotation);
      motion.root.rotation.z += state === "careful-branch-climb" ? Math.sin(elapsed * 1.6 + index) * .025 : 0;
      if (motion.body) {
        motion.body.rotation.y = state === "leaf-forage" ? Math.sin(elapsed * .7 + motion.phase) * .045 : 0;
        motion.body.scale.y = 1 + Math.sin(elapsed * .92 + motion.phase) * .012;
      }
      if (motion.head && motion.baseHeadRotation && motion.baseHeadScale) {
        motion.head.rotation.copy(motion.baseHeadRotation);
        motion.head.rotation.y += state === "leaf-forage" ? Math.sin(elapsed * .83 + motion.phase) * .24 : Math.sin(elapsed * .31 + motion.phase) * .07;
        motion.head.rotation.x += state === "leaf-forage" ? .12 + Math.sin(elapsed * .58 + index) * .04 : Math.sin(elapsed * .42 + index) * .025;
        motion.head.scale.copy(motion.baseHeadScale);
        motion.head.scale.y *= 1 + Math.sin(elapsed * .92 + motion.phase) * .008;
      }
    });
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
    type AviaryPerch = {
      contactPosition: THREE.Vector3;
      name: string;
      yaw: number;
    };
    const addContactPerch = (
      name: string,
      perchX: number,
      perchZ: number,
      height: number,
      yaw: number,
      halfLength: number,
      footContactOffset: number,
      branchRadius = .095,
    ): AviaryPerch => {
      // Bird roots are normalized to a floor/contact plane while the
      // procedural companions publish their toe tips a few centimetres above
      // or below it. Build the branch from that measured offset so the visible
      // toe geometry lands on timber instead of hovering beside a decorative
      // limb. The same contactPosition remains valid for a hydrated host.
      const contactTopY = terrainHeight(perchX, perchZ) + height;
      // A bird's paired feet sit on its local X axis. Rotate that lateral
      // axis into world space so both feet, not only the root origin, lie over
      // the branch centreline after the bird receives the matching yaw.
      const along = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const center = new THREE.Vector3(perchX, contactTopY - branchRadius, perchZ);
      const start = center.clone().addScaledVector(along, -halfLength);
      const end = center.clone().addScaledVector(along, halfLength);
      const branch = cylinderBetween(start, end, branchRadius, materials.wood, quality > .72 ? 18 : 12);
      branch.name = `${name}-load-bearing-foot-contact-branch`;
      branch.castShadow = branch.receiveShadow = true;
      branch.userData.contactTopY = contactTopY;
      branch.userData.footContactOffset = footContactOffset;
      habitat.add(branch);
      // Paired suspension ropes make the load path readable from the visitor
      // overlook and prevent the contact branch looking like another loose,
      // arbitrary cylinder in the canopy.
      [start, end].forEach((anchor, index) => {
        const upper = anchor.clone().add(new THREE.Vector3(index === 0 ? -.3 : .3, 2.7, index === 0 ? .18 : -.18));
        const rope = cylinderBetween(anchor, upper, .026, materials.iron, quality > .72 ? 10 : 7);
        rope.name = `${name}-visible-suspension-rope-${index + 1}`;
        rope.castShadow = true;
        habitat.add(rope);
      });
      return {
        name,
        yaw,
        contactPosition: new THREE.Vector3(perchX, contactTopY - footContactOffset, perchZ),
      };
    };
    const conurePerch = addContactPerch("sun-conure", -46, -49, 4.7, .4, 1.55, .0162);
    const macawPerch = addContactPerch("blue-and-gold-macaw", -39, -52, 5.7, -1.2, 1.9, .0204, .115);
    const ibisPerch = addContactPerch("scarlet-ibis", -45, -56, 1.55, 2.4, 1.7, -.0236, .11);
    const aracariTakeoffPerch = addContactPerch("green-aracari-takeoff", -40, -45, 4.2, -2.6, 1.35, .0168);
    const aracariLandingPerch = addContactPerch("green-aracari-landing", -47, -46.5, 5.05, -.35, 1.35, .0168);
    this.root.add(habitat);
    const addContactPerchedBird = (
      bird: ZooAnimalRig,
      perch: AviaryPerch,
      phase: number,
      animationSpeeds: readonly [number, number],
    ) => {
      bird.root.position.copy(perch.contactPosition);
      bird.root.rotation.y = perch.yaw;
      bird.root.userData.habitatRole = "fixed-contact-percher";
      bird.root.userData.motionPhase = phase;
      bird.root.userData.contactSupport = `${perch.name}-load-bearing-foot-contact-branch`;
      this.root.add(bird.root);
      this.animals.push({
        root: bird.root,
        ownedTextures: bird.ownedTextures,
        update(elapsed, delta) {
          // Perching and preening retain a fixed root; the feet therefore
          // remain on the same load-bearing branch through both clips.
          const cycle = ((elapsed * .72 + phase) % 15 + 15) % 15;
          const state = cycle < 10.5 ? "perch" : "preen";
          bird.root.userData.animationState = state;
          bird.root.userData.animationSpeed = state === "perch" ? animationSpeeds[0] : animationSpeeds[1];
          bird.root.userData.activeContactSupport = perch.name;
          bird.update(elapsed + phase, delta);
        },
      });
    };
    addContactPerchedBird(createSunConure(textures, quality), conurePerch, .8, [.74, .86]);
    addContactPerchedBird(createBlueAndGoldMacaw(textures, quality), macawPerch, 4.9, [.81, .94]);
    addContactPerchedBird(createScarletIbis(textures, quality), ibisPerch, 9.2, [.68, .79]);

    // Only the aracari flies. It travels between two published foot-contact
    // positions in a clear, short corridor at the front of the aviary. The
    // smooth arc is exactly zero at both endpoints, so takeoff and landing
    // begin and end on the corresponding support rather than in open air.
    const aracari = createGreenAracari(textures, quality);
    aracari.root.position.copy(aracariTakeoffPerch.contactPosition);
    aracari.root.rotation.y = aracariTakeoffPerch.yaw;
    aracari.root.userData.habitatRole = "contained-contact-flyer";
    aracari.root.userData.motionPhase = 3.4;
    aracari.root.userData.flightSupports = [aracariTakeoffPerch.name, aracariLandingPerch.name];
    this.root.add(aracari.root);
    const flightFrom = new THREE.Vector3(), flightTo = new THREE.Vector3(), nextFlightPoint = new THREE.Vector3();
    this.animals.push({
      root: aracari.root,
      ownedTextures: aracari.ownedTextures,
      update(elapsed, delta) {
        const cycle = ((elapsed + 3.4) % 24 + 24) % 24;
        const outbound = cycle >= 8.4 && cycle < 11.2;
        const inbound = cycle >= 19.4 && cycle < 22.2;
        const flying = outbound || inbound;
        const atLandingPerch = cycle >= 11.2 && cycle < 19.4;
        const state = flying ? "short-flight" : cycle >= 6.5 && cycle < 8.4 || cycle >= 17.5 && cycle < 19.4 ? "preen" : "perch";
        aracari.root.userData.animationState = state;
        aracari.root.userData.animationSpeed = flying ? 1.08 : state === "preen" ? .88 : .76;
        if (flying) {
          flightFrom.copy(outbound ? aracariTakeoffPerch.contactPosition : aracariLandingPerch.contactPosition);
          flightTo.copy(outbound ? aracariLandingPerch.contactPosition : aracariTakeoffPerch.contactPosition);
          const flightStart = outbound ? 8.4 : 19.4;
          const flightT = THREE.MathUtils.clamp((cycle - flightStart) / 2.8, 0, 1);
          const eased = flightT * flightT * (3 - 2 * flightT);
          aracari.root.position.lerpVectors(flightFrom, flightTo, eased);
          aracari.root.position.y += Math.sin(flightT * Math.PI) * 1.35;
          const nextT = Math.min(1, flightT + .015);
          const nextEased = nextT * nextT * (3 - 2 * nextT);
          nextFlightPoint.lerpVectors(flightFrom, flightTo, nextEased);
          nextFlightPoint.y += Math.sin(nextT * Math.PI) * 1.35;
          const dx = nextFlightPoint.x - aracari.root.position.x, dz = nextFlightPoint.z - aracari.root.position.z;
          if (dx * dx + dz * dz > .000001) aracari.root.rotation.y = Math.atan2(-dx, -dz);
          aracari.root.userData.activeContactSupport = "airborne-between-published-supports";
        } else {
          const perch = atLandingPerch ? aracariLandingPerch : aracariTakeoffPerch;
          aracari.root.position.copy(perch.contactPosition);
          aracari.root.rotation.y = perch.yaw;
          aracari.root.userData.activeContactSupport = perch.name;
        }
        aracari.update(elapsed + 3.4, delta);
      },
    });
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
    this.garyRig = createGaryPolarBear(textures, quality);
    this.garyRig.root.position.set(39, terrainHeight(39, -48) - 1.05, -48);
    this.garyRig.root.rotation.y = -1.05;
    this.garyRig.root.userData.animationState = "idle";
    this.root.add(this.garyRig.root);
    this.animals.push(this.garyRig);
    const texture = plaqueTexture();
    this.ownedTextures.push(texture);
    const plaque = new THREE.Group();
    plaque.name = "gary-polar-bear-togyl-support-plaque";
    // Place the interpretation plaque at the shoulder of the overlook.  The
    // old billboard-sized placement sat directly between the fixed review
    // camera and Gary, making the habitat feel staged around a sign instead of
    // giving the animal a clear sightline.
    plaque.position.set(28.6, terrainHeight(28.6, -36.8), -36.8);
    plaque.rotation.y = -2.12;
    const pedestal = new THREE.Mesh(new RoundedBoxGeometry(3.15, 1.95, .36, 5, .07), new THREE.MeshStandardMaterial({ color: "#6d5730", metalness: .58, roughness: .31 }));
    pedestal.position.y = .975;
    plaque.add(pedestal);
    const face = new THREE.Mesh(new RoundedBoxGeometry(2.86, 1.7, .08, 4, .04), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    face.position.set(0, 1.04, .22);
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
    placeAnimal(this.root, this.animals, createSeaLion(textures, quality, 0), -2.5, -76, .7, .75, { mode: "aquatic", radius: 2.8, speed: .34, phase: .7 });
    placeAnimal(this.root, this.animals, createSeaLion(textures, quality, 1), 3.2, -78.5, -1.4, .75, { mode: "aquatic", radius: 2.2, speed: .29, phase: 4.1 });
    addHabitatLabel(this.root, this.ownedTextures, materials, "SEA LION POOL", "CALIFORNIA SEA LIONS", -9, -65, -.2);
    this.obstacles.push({ kind: "circle", x: 0, z: -76, radius: 11.4 });
  }

  private addMonkeyHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const x = -43, z = -101, radius = 14.5;
    addCircularFence(this.root, materials, x, z, radius, quality > .72 ? 26 : 18, true);

    // Give the habitat a legible forest-floor composition instead of leaving
    // the climbing poles on an empty copy of the park terrain.  The inset is
    // intentionally irregular so its edge reads as planted mulch, not a
    // circular stage under the animals.
    const mulchShape = new THREE.Shape();
    for (let index = 0; index < 28; index++) {
      const angle = index / 28 * Math.PI * 2;
      const insetRadius = radius - 1.05 + Math.sin(index * 2.17) * .38 + Math.cos(index * .73) * .22;
      const px = Math.cos(angle) * insetRadius, py = Math.sin(angle) * insetRadius;
      if (index === 0) mulchShape.moveTo(px, py); else mulchShape.lineTo(px, py);
    }
    mulchShape.closePath();
    const mulch = new THREE.Mesh(
      new THREE.ShapeGeometry(mulchShape, 10),
      new THREE.MeshStandardMaterial({ color: "#2b261c", roughness: 1, bumpMap: textures.ground, bumpScale: .09 }),
    );
    mulch.name = "monkey-forest-irregular-mulch-floor";
    mulch.rotation.x = -Math.PI / 2;
    mulch.position.set(x, terrainHeight(x, z) + .055, z);
    mulch.receiveShadow = true;
    this.root.add(mulch);

    const branchMaterial = new THREE.MeshStandardMaterial({
      color: "#4a3320", roughness: .94, bumpMap: textures.bark, bumpScale: .085,
    });
    const branchPaths = [
      [[-8.8, 1.2, -4.4], [-6.4, 2.8, -2.7], [-2.2, 4.4, -1.4], [2.7, 5.2, .8]],
      [[8.1, 1.1, 4.8], [6.2, 2.6, 2.4], [3.1, 3.7, -.4], [-1.5, 4.25, -2.4]],
      [[-6.8, 1.0, 5.7], [-4.2, 2.4, 4.1], [-.8, 3.15, 2.5], [4.8, 3.4, 2.1]],
      [[7.4, 1.15, -5.2], [5.6, 2.5, -3.6], [1.7, 3.2, -2.2], [-4.4, 3.5, -.5]],
    ];
    branchPaths.forEach((points, index) => {
      const curve = new THREE.CatmullRomCurve3(points.map(([px, py, pz]) => new THREE.Vector3(x + px, terrainHeight(x, z) + py, z + pz)));
      const branch = new THREE.Mesh(
        new THREE.TubeGeometry(curve, quality > .72 ? 42 : 26, .19 - index * .018, quality > .72 ? 12 : 8, false),
        branchMaterial,
      );
      branch.name = "monkey-forest-continuous-climbing-tree";
      branch.castShadow = branch.receiveShadow = true;
      this.root.add(branch);
    });

    const habitatCanopyCount = quality > .72 ? 56 : 32;
    const habitatCanopy = new THREE.InstancedMesh(new THREE.PlaneGeometry(2.8, 3.35), materials.leaf, habitatCanopyCount);
    habitatCanopy.name = "monkey-forest-layered-live-canopy";
    habitatCanopy.castShadow = quality > .78;
    const canopyDummy = new THREE.Object3D();
    const canopyRandom = seeded(19360711);
    const canopyColors = [new THREE.Color("#315c35"), new THREE.Color("#477a42"), new THREE.Color("#567f45"), new THREE.Color("#294d32")];
    for (let index = 0; index < habitatCanopyCount; index++) {
      const cluster = index % 4;
      const anchor = branchPaths[cluster][branchPaths[cluster].length - 1];
      const angle = canopyRandom() * Math.PI * 2, spread = .55 + canopyRandom() * 2.7;
      canopyDummy.position.set(
        x + anchor[0] + Math.cos(angle) * spread,
        terrainHeight(x, z) + anchor[1] + .9 + canopyRandom() * 2.2,
        z + anchor[2] + Math.sin(angle) * spread,
      );
      canopyDummy.rotation.set((canopyRandom() - .5) * .12, angle + index * .71, (canopyRandom() - .5) * .18);
      const canopyScale = .58 + canopyRandom() * .54;
      canopyDummy.scale.set(canopyScale, canopyScale * (.84 + canopyRandom() * .28), canopyScale);
      canopyDummy.updateMatrix();
      habitatCanopy.setMatrixAt(index, canopyDummy.matrix);
      habitatCanopy.setColorAt(index, canopyColors[index % canopyColors.length]);
    }
    habitatCanopy.instanceMatrix.needsUpdate = true;
    if (habitatCanopy.instanceColor) habitatCanopy.instanceColor.needsUpdate = true;
    this.root.add(habitatCanopy);

    const understoryCount = quality > .72 ? 44 : 28;
    const understory = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(1.6, 1.55),
      new THREE.MeshStandardMaterial({ map: textures.fern, alphaTest: .23, color: "#4c7648", roughness: .94, side: THREE.DoubleSide }),
      understoryCount * 2,
    );
    understory.name = "monkey-forest-dense-understory";
    for (let index = 0; index < understoryCount; index++) {
      const angle = index / understoryCount * Math.PI * 2 + canopyRandom() * .18;
      const distance = 6.2 + canopyRandom() * 5.6;
      const visitorSightline = Math.cos(angle) > .72;
      for (let card = 0; card < 2; card++) {
        canopyDummy.position.set(
          x + Math.cos(angle) * distance,
          terrainHeight(x, z) + .72,
          z + Math.sin(angle) * distance,
        );
        canopyDummy.rotation.set(0, angle + card * Math.PI / 2, 0);
        // Preserve a deliberate viewing aperture on the east overlook. Dense
        // planting still frames the exhibit, but no longer hides the closest
        // walking monkey behind two crossed fern cards.
        const foliageScale = visitorSightline ? .12 : .72 + canopyRandom() * .5;
        canopyDummy.scale.set(foliageScale, foliageScale, foliageScale);
        canopyDummy.updateMatrix();
        understory.setMatrixAt(index * 2 + card, canopyDummy.matrix);
      }
    }
    understory.instanceMatrix.needsUpdate = true;
    this.root.add(understory);

    // Two joined timber decks create distinct high and low destinations for
    // the climb/swing clips.  Their braces and rope net make the apparatus
    // feel engineered for a real primate habitat rather than decorative poles.
    const decks = [
      { px: x - 4.8, pz: z - 2.3, py: 4.35, rotation: .22 },
      { px: x + 4.9, pz: z + 2.6, py: 3.35, rotation: -.3 },
    ];
    decks.forEach((deck, index) => {
      const platform = new THREE.Group();
      platform.name = "monkey-forest-timber-lookout-platform";
      platform.position.set(deck.px, terrainHeight(x, z) + deck.py, deck.pz);
      platform.rotation.y = deck.rotation;
      const slab = setShadow(new THREE.Mesh(new RoundedBoxGeometry(3.6, .24, 2.3, 5, .08), branchMaterial), true, true);
      platform.add(slab);
      for (const side of [-1, 1]) {
        const brace = cylinderBetween(
          new THREE.Vector3(side * 1.35, -.08, -.65),
          new THREE.Vector3(side * 1.72, -deck.py + .15, side * .36),
          .1,
          branchMaterial,
          10,
        );
        brace.name = "monkey-platform-diagonal-timber-brace";
        platform.add(brace);
      }
      const shadeRoof = setShadow(new THREE.Mesh(new RoundedBoxGeometry(3.95, .16, 2.7, 4, .07), materials.iron), true, true);
      shadeRoof.position.y = 2.15;
      shadeRoof.rotation.z = index ? -.055 : .055;
      platform.add(shadeRoof);
      for (const cornerX of [-1.55, 1.55]) for (const cornerZ of [-.88, .88]) {
        const support = new THREE.Mesh(new THREE.CylinderGeometry(.07, .085, 2.15, 10), materials.iron);
        support.position.set(cornerX, 1.03, cornerZ);
        platform.add(support);
      }
      this.root.add(platform);
    });

    const netOrigin = new THREE.Vector3(x - .5, terrainHeight(x, z) + 3.15, z + .1);
    for (let column = -3; column <= 3; column++) {
      const top = netOrigin.clone().add(new THREE.Vector3(column * .52, 1.45 - Math.abs(column) * .08, -.35));
      const bottom = netOrigin.clone().add(new THREE.Vector3(column * .52, -1.18 + Math.abs(column) * .06, .35));
      const cord = cylinderBetween(top, bottom, .026, materials.iron, 7);
      cord.name = "monkey-forest-knotted-rope-net-vertical";
      this.root.add(cord);
    }
    for (let row = -2; row <= 2; row++) {
      const left = netOrigin.clone().add(new THREE.Vector3(-1.68, row * .5, row * .05));
      const right = netOrigin.clone().add(new THREE.Vector3(1.68, row * .5, -row * .05));
      const cord = cylinderBetween(left, right, .025, materials.iron, 7);
      cord.name = "monkey-forest-knotted-rope-net-horizontal";
      this.root.add(cord);
    }

    for (let index = 0; index < 9; index++) {
      const angle = index * 2.399, distance = 8.2 + index % 3 * 1.35;
      const stone = setShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(.65 + index % 2 * .28, 2), materials.stone), true, true);
      stone.name = "monkey-forest-naturalistic-rockwork";
      stone.scale.set(1.35, .62 + index % 3 * .08, .9);
      stone.rotation.set(index * .13, angle, index * .09);
      stone.position.set(x + Math.cos(angle) * distance, terrainHeight(x, z) + .33, z + Math.sin(angle) * distance);
      this.root.add(stone);
    }
    for (let index = 0; index < 5; index++) {
      const angle = index / 5 * Math.PI * 2;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, 8, 12), materials.wood);
      pole.position.set(x + Math.cos(angle) * 6, terrainHeight(x, z) + 4, z + Math.sin(angle) * 6);
      this.root.add(pole);
      const rope = cylinderBetween(new THREE.Vector3(x + Math.cos(angle) * 6, 7, z + Math.sin(angle) * 6), new THREE.Vector3(x + Math.cos(angle + 1.25) * 6, 4.5, z + Math.sin(angle + 1.25) * 6), .045, materials.iron, 8);
      rope.name = "spider-monkey-climbing-rope";
      this.root.add(rope);
    }
    // The authored perch and swing clips publish their support cylinders in
    // source-GLTF coordinates. Recreate those exact supports in the habitat,
    // including the loader's +Z-to-world rotation and height normalization,
    // so hands, feet and prehensile tail meet real timber on every reviewed
    // frame instead of hovering near a decorative diagonal branch.
    const monkeySupportRoot = new THREE.Group();
    monkeySupportRoot.name = "spider-monkey-authored-contact-support-rig";
    monkeySupportRoot.userData.canopyMonkeyCount = 1;
    monkeySupportRoot.userData.canopyMotionUsesRootTranslation = false;
    monkeySupportRoot.userData.supportedClipStates = ["perch", "climb", "swing"];
    const perchedMonkeyX = x + 6.5, perchedMonkeyZ = z + .3;
    monkeySupportRoot.position.set(perchedMonkeyX, terrainHeight(perchedMonkeyX, perchedMonkeyZ) + 3.15, perchedMonkeyZ);
    monkeySupportRoot.rotation.y = .35;
    const monkeyAssetSpace = new THREE.Group();
    monkeyAssetSpace.name = "spider-monkey-runtime-gltf-support-space";
    monkeyAssetSpace.rotation.y = Math.PI;
    const monkeyAssetScale = 1.48 / 1.520934375;
    monkeyAssetSpace.scale.setScalar(monkeyAssetScale);
    monkeyAssetSpace.position.y = .007 * monkeyAssetScale;
    const authoredSupports = [
      {
        name: "spider-monkey-load-bearing-contact-branch",
        a: [-.7, .041345, .278193], b: [.7, .041345, .278193], radius: .052,
      },
      {
        name: "spider-monkey-perch-hand-contact-branch",
        a: [-.7, .738797, .941977], b: [.7, .738797, .941977], radius: .052,
      },
      {
        name: "spider-monkey-swing-hand-contact-branch",
        a: [-.665919, 1.036024, 1.008346], b: [.734081, 1.036024, 1.008346], radius: .052,
      },
      {
        name: "spider-monkey-prehensile-tail-contact-branch",
        a: [-.094583, 1.563347, -.589839], b: [.113329, 1.563347, .388308], radius: .04,
      },
    ] as const;
    authoredSupports.forEach(support => {
      const timber = cylinderBetween(
        new THREE.Vector3(...support.a),
        new THREE.Vector3(...support.b),
        support.radius,
        branchMaterial,
        quality > .72 ? 16 : 10,
      );
      timber.name = support.name;
      timber.castShadow = timber.receiveShadow = true;
      monkeyAssetSpace.add(timber);
    });
    // The authored climb clip alternates its hands between a low/front and a
    // high/rear contact while its feet remain on the low rung.  This rope
    // follows the measured project-source hand path at frames 1/16/31/46/61;
    // the canopy wrapper never translates the monkey through empty air.
    const climbContactPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-.14, .98, 1.05),
      new THREE.Vector3(0, 1.431, .715),
      new THREE.Vector3(.14, 1.78, .12),
    ]);
    const climbContactRope = new THREE.Mesh(
      new THREE.TubeGeometry(climbContactPath, quality > .72 ? 32 : 20, .038, quality > .72 ? 10 : 7, false),
      materials.iron,
    );
    climbContactRope.name = "spider-monkey-authored-climb-hand-contact-rope";
    climbContactRope.userData.measuredHandContacts = [
      [-.034, 1.431, .715], [.101, 1.088, .958], [.053, 1.681, .212],
      [-.053, 1.678, .212], [-.101, 1.084, .958], [.034, 1.431, .715],
    ];
    climbContactRope.castShadow = climbContactRope.receiveShadow = true;
    monkeyAssetSpace.add(climbContactRope);
    const climbFootRung = cylinderBetween(
      new THREE.Vector3(-.34, .04, .34),
      new THREE.Vector3(.34, .04, .34),
      .045,
      branchMaterial,
      quality > .72 ? 14 : 9,
    );
    climbFootRung.name = "spider-monkey-authored-climb-foot-contact-rung";
    climbFootRung.castShadow = climbFootRung.receiveShadow = true;
    monkeyAssetSpace.add(climbFootRung);
    monkeyAssetSpace.userData.supportCoordinateSystem = "+Y up · +Z forward · meters";
    monkeyAssetSpace.userData.perchContactFrame = 45;
    monkeyAssetSpace.userData.swingContactFrame = 16;
    monkeyAssetSpace.userData.climbContactFrames = [1, 16, 31, 46, 61];
    monkeySupportRoot.add(monkeyAssetSpace);
    this.root.add(monkeySupportRoot);
    const perched = createSpiderMonkey(textures, quality, 0);
    perched.root.userData.habitatRole = "canopy-contact-climber";
    perched.root.userData.motionPhase = 2.6;
    const contactAnimatedCanopy: ZooAnimalRig = {
      root: perched.root,
      ownedTextures: perched.ownedTextures,
      update(elapsed, delta) {
        // A fixed-root contact schedule keeps every state on its measured
        // support. Distinct state speeds and the non-zero behavior phase stop
        // this animal synchronizing with either ground walker.
        const cycle = ((elapsed * .83 + 2.6) % 24 + 24) % 24;
        const state = cycle < 10.2 ? "perch" : cycle < 16.4 ? "climb" : "swing";
        perched.root.userData.animationState = state;
        perched.root.userData.animationSpeed = state === "perch" ? .78 : state === "climb" ? .93 : 1.07;
        perched.root.userData.activeContactSupport = state === "perch"
          ? "foot-and-hand-branches"
          : state === "climb"
            ? "measured-climb-rope-and-foot-rung"
            : "hand-and-prehensile-tail-branches";
        perched.update(elapsed + 2.6, delta);
      },
    };
    placeAnimal(this.root, this.animals, contactAnimatedCanopy, perchedMonkeyX, perchedMonkeyZ, .35, 3.15);
    // Two animals remain grounded and use the habitat floor for every update;
    // they forage and walk rather than all orbiting invisibly in the canopy.
    // Keep one ground route in the eastern third of the habitat so visitors
    // at the overlook can actually read the authored gait, hands and face.
    // The previous orbit was buried behind the central fern bank and made a
    // 137k-triangle hero animal disappear into the backdrop.
    const eastGroundMonkey = createSpiderMonkey(textures, quality, 1);
    eastGroundMonkey.root.userData.habitatRole = "ground-walk-forage";
    eastGroundMonkey.root.userData.motionPhase = 2.8;
    placeAnimal(this.root, this.animals, eastGroundMonkey, x + 7.8, z + 2.6, -1.35, 0, {
      mode: "terrestrial", radius: 1.8, speed: .16, phase: 2.8, animationSpeed: .91,
    });
    const westGroundMonkey = createSpiderMonkey(textures, quality, 2);
    westGroundMonkey.root.userData.habitatRole = "ground-walk-forage";
    westGroundMonkey.root.userData.motionPhase = 7.1;
    placeAnimal(this.root, this.animals, westGroundMonkey, x - 3.8, z + 6, 1.7, 0, {
      mode: "terrestrial", radius: 1.65, speed: .13, phase: 7.1, animationSpeed: 1.08,
    });
    addHabitatLabel(this.root, this.ownedTextures, materials, "MONKEY FOREST", "GEOFFROY'S SPIDER MONKEYS", -31, -89, -.75);
  }

  private addZebraHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    addCircularFence(this.root, materials, 43, -101, 15.5, quality > .72 ? 28 : 20);
    placeAnimal(this.root, this.animals, createZebra(textures, quality, 0), 40, -101, -1.1, 0, { mode: "terrestrial", radius: 2.8, speed: .12, phase: 1.2 });
    placeAnimal(this.root, this.animals, createZebra(textures, quality, 1), 47, -105, 2.1, 0, { mode: "terrestrial", radius: 2.2, speed: .1, phase: 5.6 });
    addHabitatLabel(this.root, this.ownedTextures, materials, "AFRICAN PLAINS", "PLAINS ZEBRA · GRASSLAND CONSERVATION", 31, -89, .75);
  }

  private addRedPandaHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    addCircularFence(this.root, materials, -36, -132, 9.5, quality > .72 ? 20 : 14, true);
    const branch = cylinderBetween(new THREE.Vector3(-40, 1.6, -134), new THREE.Vector3(-32, 4.2, -130), .24, materials.wood, 12);
    branch.name = "red-panda-arboreal-branch";
    this.root.add(branch);
    placeAnimal(this.root, this.animals, createRedPanda(textures, quality), -35, -132, .7, 2.85, { mode: "arboreal", radius: 1.7, speed: .18, phase: 2.4, verticalRange: .65 });
    addHabitatLabel(this.root, this.ownedTextures, materials, "RED PANDA", "HIMALAYAN FOREST", -28, -123, -.7);
  }

  private addTortoiseHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    addCircularFence(this.root, materials, 36, -132, 9.5, quality > .72 ? 20 : 14);
    placeAnimal(this.root, this.animals, createAldabraTortoise(textures, quality), 36, -132, -.6, 0, { mode: "terrestrial", radius: 1.35, speed: .035, phase: 3.7 });
    addHabitatLabel(this.root, this.ownedTextures, materials, "GIANT TORTOISE", "ALDABRA ATOLL CONSERVATION", 28, -123, .7);
  }

  private addFlamingoWetland(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const x = -71, z = -55, radius = 7.7;
    const wetland = new THREE.Group();
    wetland.name = "bronx-zoo-american-flamingo-wetland";
    const bank = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius + .35, .45, quality > .72 ? 44 : 30), materials.earth);
    bank.position.set(x, terrainHeight(x, z) + .08, z);
    wetland.add(bank);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(5.8, 6.1, .16, quality > .72 ? 44 : 30), materials.water);
    water.position.set(x, terrainHeight(x, z) + .32, z);
    wetland.add(water);
    for (let index = 0; index < 18; index++) {
      const angle = index * 2.399, reed = new THREE.Mesh(new THREE.CylinderGeometry(.018, .025, 1.1 + index % 3 * .25, 6), new THREE.MeshStandardMaterial({ color: index % 2 ? "#718152" : "#8f8d55", roughness: .92 }));
      reed.position.set(x + Math.cos(angle) * (5.5 + index % 3 * .35), terrainHeight(x, z) + .85, z + Math.sin(angle) * (5.2 + index % 4 * .3));
      reed.rotation.z = Math.sin(index * 1.7) * .08;
      wetland.add(reed);
    }
    this.root.add(wetland);
    addCircularFence(this.root, materials, x, z, radius + .3, quality > .72 ? 18 : 13);
    for (let index = 0; index < 3; index++) placeAnimal(this.root, this.animals, createAmericanFlamingo(textures, quality, index), x - 2.1 + index * 2.1, z + (index % 2 ? 1.3 : -1), index * .7, .3, {
      mode: "terrestrial", radius: 1 + index * .22, speed: .06 + index * .012, phase: index * 4.2,
    });
    addHabitatLabel(this.root, this.ownedTextures, materials, "FLAMINGO WETLAND", "AMERICAN FLAMINGOS · WETLAND RESTORATION", -63.5, -47, -.7);
  }

  private addBisonHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const x = 72, z = -105, radius = 8.2;
    const paddock = new THREE.Group();
    paddock.name = "bronx-zoo-american-bison-paddock";
    const meadow = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, .12, quality > .72 ? 42 : 28), new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .08, color: "#817c52", roughness: .98 }));
    meadow.position.set(x, terrainHeight(x, z) + .025, z);
    paddock.add(meadow);
    const shelter = new THREE.Mesh(new RoundedBoxGeometry(5.8, .3, 3.8, 4, .08), materials.wood);
    shelter.position.set(x + 2.6, terrainHeight(x, z) + 3.25, z + 2.5);
    shelter.rotation.z = -.08;
    paddock.add(shelter);
    for (const px of [x, x + 5.1]) for (const pz of [z + 1.1, z + 3.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, 3.2, 10), materials.wood);
      post.position.set(px, terrainHeight(px, pz) + 1.6, pz);
      paddock.add(post);
    }
    const rubbingLog = cylinderBetween(new THREE.Vector3(x - 4.5, .5, z - 2.8), new THREE.Vector3(x + 1.2, .9, z - 3.5), .23, materials.wood, 12);
    rubbingLog.name = "bison-natural-rubbing-log";
    paddock.add(rubbingLog);
    this.root.add(paddock);
    addCircularFence(this.root, materials, x, z, radius + .35, quality > .72 ? 20 : 14);
    placeAnimal(this.root, this.animals, createAmericanBison(textures, quality, 0), x - 1.7, z - .4, .2, 0, { mode: "terrestrial", radius: 1.7, speed: .055, phase: 1.1 });
    placeAnimal(this.root, this.animals, createAmericanBison(textures, quality, 1), x + 2.4, z + 1.2, -2.1, 0, { mode: "terrestrial", radius: 1.2, speed: .045, phase: 6.2 });
    addHabitatLabel(this.root, this.ownedTextures, materials, "BISON RANGE", "AMERICAN BISON · GRASSLAND RECOVERY", 63, -97, .72);
  }

  private addGuestAmenities(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const amenities = new THREE.Group();
    amenities.name = "bronx-zoo-premium-guest-amenities-and-service-details";
    const benchMaterial = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .035, color: "#805d3e", roughness: .88 });
    const benchData = [
      [-11, -31, -.12], [14, -37, .2], [-29, -59, .85], [29, -61, -.82], [-34, -87, 1.45], [34, -88, -1.4],
      [-27, -118, .75], [27, -117, -.72], [-11, -137, .12], [12, -136, -.18],
    ] as const;
    benchData.slice(0, quality < .62 ? 7 : benchData.length).forEach(([x, z, yaw], index) => {
      const bench = new THREE.Group();
      bench.name = `bronx-zoo-visitor-bench-${index + 1}`;
      bench.position.set(x, terrainHeight(x, z), z);
      bench.rotation.y = yaw;
      for (let slat = 0; slat < 5; slat++) {
        const board = new THREE.Mesh(new RoundedBoxGeometry(3.3, .12, .2, 3, .03), benchMaterial);
        board.position.set(0, slat < 3 ? .62 + slat * .08 : .92 + (slat - 3) * .22, slat < 3 ? (slat - 1) * .23 : .37);
        if (slat >= 3) board.rotation.x = -.16;
        bench.add(board);
      }
      for (const bx of [-1.28, 1.28]) {
        const leg = new THREE.Mesh(new RoundedBoxGeometry(.1, .67, .1, 2, .02), materials.iron);
        leg.position.set(bx, .31, 0);
        bench.add(leg);
      }
      amenities.add(bench);
    });

    const vendingTexture = canvasTexture(768, 1024, (context, width, height) => {
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#1f625b"); gradient.addColorStop(1, "#11342f");
      context.fillStyle = gradient; context.fillRect(0, 0, width, height);
      context.fillStyle = "#f2e4a3"; context.textAlign = "center"; context.font = "700 82px Helvetica, Arial, sans-serif";
      context.fillText("SNACKS", width / 2, 125); context.font = "600 40px Helvetica, Arial, sans-serif"; context.fillText("JAM SANDWICHES · WATER", width / 2, 190);
      for (let row = 0; row < 4; row++) for (let column = 0; column < 3; column++) {
        context.fillStyle = ["#d8a448", "#8bb593", "#be6955"][column]; context.fillRect(105 + column * 190, 270 + row * 145, 110, 95);
      }
      context.strokeStyle = "#f2e4a3"; context.lineWidth = 16; context.strokeRect(24, 24, width - 48, height - 48);
    });
    this.ownedTextures.push(vendingTexture);
    const vendingMaterial = new THREE.MeshStandardMaterial({ map: vendingTexture, color: "#ffffff", roughness: .5, metalness: .08 });
    for (const [index, [x, z, yaw]] of ([[-13, -69, -.15], [14, -107, .12], [-18, -122, -.1]] as const).entries()) {
      const station = new THREE.Group();
      station.name = "bronx-zoo-water-refill-and-snack-station";
      station.position.set(x, terrainHeight(x, z), z); station.rotation.y = yaw;
      station.userData.interactable = true;
      station.userData.interactionKind = "gary-jam-sandwich-vending";
      const cabinet = new THREE.Mesh(new RoundedBoxGeometry(1.25, 2.35, .82, 5, .08), vendingMaterial);
      cabinet.name = `bronx-zoo-jam-sandwich-vending-machine-${index + 1}`;
      cabinet.position.y = 1.18; station.add(cabinet);
      const payment = new THREE.Mesh(new RoundedBoxGeometry(.2, .34, .04, 3, .025), materials.iron);
      payment.position.set(.39, 1.35, .44); station.add(payment);
      amenities.add(station);
    }

    const binPositions = [[-8, -27], [8, -27], [-31, -79], [31, -79], [-23, -126], [23, -126]] as const;
    binPositions.forEach(([x, z], index) => {
      const pair = new THREE.Group(); pair.name = "bronx-zoo-waste-recycling-pair"; pair.position.set(x, terrainHeight(x, z), z);
      for (const side of [-1, 1]) {
        const bin = new THREE.Mesh(new THREE.CylinderGeometry(.3, .34, .92, 16), new THREE.MeshStandardMaterial({ color: side < 0 ? "#34483b" : "#426b79", metalness: .18, roughness: .61 }));
        bin.position.set(side * .35, .46, 0); pair.add(bin);
        const lid = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .09, 16), materials.iron); lid.position.set(side * .35, .95, 0); pair.add(lid);
      }
      pair.rotation.y = index * .7; amenities.add(pair);
    });

    const lampMaterial = new THREE.MeshPhysicalMaterial({ color: "#fff0bf", emissive: "#f5cb72", emissiveIntensity: 1.4, roughness: .28, clearcoat: .55 });
    for (let index = 0; index < 16; index++) {
      const angle = index / 16 * Math.PI * 2, x = Math.cos(angle) * (34 + index % 3 * 4), z = -82 + Math.sin(angle) * 49;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .08, 4.4, 10), materials.iron);
      post.name = "bronx-zoo-low-glare-path-lamp"; post.position.set(x, terrainHeight(x, z) + 2.2, z); amenities.add(post);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 11), lampMaterial); lantern.position.set(x, terrainHeight(x, z) + 4.48, z); amenities.add(lantern);
    }

    const service = new THREE.Group(); service.name = "bronx-zoo-keeper-service-yard-detail"; service.position.set(21, terrainHeight(21, -151), -151);
    const serviceDoor = new THREE.Mesh(new RoundedBoxGeometry(4.2, 3.6, .28, 4, .06), materials.iron); serviceDoor.position.y = 1.8; service.add(serviceDoor);
    for (let index = 0; index < 7; index++) {
      const crate = new THREE.Mesh(new RoundedBoxGeometry(1.1, .72, .82, 3, .04), materials.wood);
      crate.name = "keeper-feed-and-bedding-crate"; crate.position.set(3.2 + index % 3 * 1.15, .36 + Math.floor(index / 3) * .73, (index % 2) * .85); service.add(crate);
    }
    const cart = new THREE.Mesh(new RoundedBoxGeometry(2.1, .55, 1.05, 4, .08), new THREE.MeshStandardMaterial({ color: "#416a4b", roughness: .62, metalness: .12 }));
    cart.name = "keeper-feed-service-cart"; cart.position.set(-3.2, .65, .2); service.add(cart);
    amenities.add(service);
    this.root.add(amenities);
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
    this.keeperPadlock.name = "sloth-enclosure-six-pin-padlock";
    this.keeperPadlock.position.set(0, 2.05, -130.34);
    const lockBody = new THREE.Mesh(new RoundedBoxGeometry(.62, .72, .24, 6, .075), new THREE.MeshStandardMaterial({ color: "#b88635", metalness: .84, roughness: .24 }));
    lockBody.name = "six-pin-brass-lock-body";
    const shackle = new THREE.Mesh(new THREE.TorusGeometry(.28, .065, 10, 28, Math.PI), materials.iron);
    shackle.name = "keeper-lock-steel-shackle";
    shackle.position.y = .34;
    const keyway = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .028, 18), materials.iron);
    keyway.name = "keeper-lock-plug-keyway";
    keyway.rotation.x = Math.PI / 2;
    keyway.position.set(0, -.08, .135);
    this.keeperPadlock.add(lockBody, shackle, keyway);
    habitat.add(this.keeperPadlock);
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
    const slothAtlasSurface = cloneZooAnimalAtlasCell(textures, 2, 2, "captive-sloth-friends");
    this.ownedTextures.push(slothAtlasSurface);
    slothData.forEach((data, index) => {
      const result = createPremiumSlothFriend(textures, quality, index, data[4]);
      result.root.name = `captive-sloth-friend-${index + 1}-on-real-branch`;
      result.root.position.set(data[0], data[2], data[1]);
      result.root.rotation.set(0, data[3], index % 2 ? .08 : -.06);
      result.root.userData.captive = true;
      result.root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !/(sloth-(?:torso|head|forelimb|hindlimb)|anatomical-sloth)/.test(object.name)) return;
        const surfaces = Array.isArray(object.material) ? object.material : [object.material];
        surfaces.forEach(surface => {
          if (!(surface instanceof THREE.MeshStandardMaterial)) return;
          surface.map = slothAtlasSurface;
          surface.needsUpdate = true;
        });
      });
      habitat.add(result.root);
      this.captiveSloths.push(result.root);
      const body = result.root.getObjectByName("continuous-horizontal-anatomical-sloth-torso");
      const head = result.root.getObjectByName("anatomical-sloth-head-jaw-and-integrated-mask");
      this.captiveSlothMotion.push({
        root: result.root,
        body: body instanceof THREE.Mesh ? body : null,
        head: head instanceof THREE.Mesh ? head : null,
        basePosition: result.root.position.clone(),
        baseRotation: result.root.rotation.clone(),
        baseHeadRotation: head instanceof THREE.Mesh ? head.rotation.clone() : null,
        baseHeadScale: head instanceof THREE.Mesh ? head.scale.clone() : null,
        phase: index * 3.7,
      });
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
      { kind: "circle", x: -71, z: -55, radius: 8.6 },
      { kind: "circle", x: 72, z: -105, radius: 9 },
      { kind: "box", minX: -77.5, maxX: -58.5, minZ: -32.5, maxZ: -19.5 },
      { kind: "box", minX: 58, maxX: 78, minZ: -34.5, maxZ: -21.5 },
      { kind: "box", minX: -78, maxX: -58, minZ: -89, maxZ: -75 },
      { kind: "box", minX: 58.5, maxX: 79.5, minZ: -89.5, maxZ: -74.5 },
      { kind: "box", minX: -75.5, maxX: -56.5, minZ: -134.5, maxZ: -121.5 },
      { kind: "box", minX: 56.5, maxX: 75.5, minZ: -135.5, maxZ: -122.5 },
      { kind: "box", minX: -16, maxX: -3, minZ: -156, maxZ: -130 },
      { kind: "box", minX: 3, maxX: 16, minZ: -156, maxZ: -130 },
      { kind: "box", minX: -3, maxX: 3, minZ: -156, maxZ: -130.2, enabled: () => !this.releasedFriends },
      // Habitat signs and vending machines are physical street furniture for
      // the menagerie as well as the player. Small circular footprints keep
      // wide animals from cutting through posts while preserving prompt reach.
      ...[
        [-31, -39], [32, -61.5], [-9, -65], [-31, -89], [31, -89],
        [-28, -123], [28, -123], [-63.5, -47], [63, -97], [-9.5, -126.5],
      ].map(([x, z]) => ({ kind: "circle" as const, x, z, radius: .52 })),
      ...this.snackMachinePositions.map(position => ({ kind: "circle" as const, x: position.x, z: position.z, radius: .68 })),
    );
  }

  private resolveCircle(player: THREE.Vector3, velocity: THREE.Vector3, obstacle: CircleObstacle, padding = 0) {
    const dx = player.x - obstacle.x, dz = player.z - obstacle.z, distance = Math.hypot(dx, dz);
    const clearance = obstacle.radius + padding;
    if (distance <= 0 || distance >= clearance) return;
    const correction = (clearance - distance) / distance;
    player.x += dx * correction;
    player.z += dz * correction;
    velocity.multiplyScalar(.58);
  }

  private resolveBox(player: THREE.Vector3, velocity: THREE.Vector3, obstacle: BoxObstacle, padding = 0) {
    const minX = obstacle.minX - padding, maxX = obstacle.maxX + padding, minZ = obstacle.minZ - padding, maxZ = obstacle.maxZ + padding;
    if (player.x <= minX || player.x >= maxX || player.z <= minZ || player.z >= maxZ) return;
    const distances = [player.x - minX, maxX - player.x, player.z - minZ, maxZ - player.z];
    const smallest = Math.min(...distances), index = distances.indexOf(smallest);
    if (index === 0) player.x = minX;
    else if (index === 1) player.x = maxX;
    else if (index === 2) player.z = minZ;
    else player.z = maxZ;
    velocity.multiplyScalar(.52);
  }

  private distanceXZ(a: THREE.Vector3, b: THREE.Vector3) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
}
