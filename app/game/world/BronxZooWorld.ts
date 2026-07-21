import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Sky } from "three/addons/objects/Sky.js";
import type { GameTextures } from "../rendering/textures";
import {
  ZOO_SIDE_QUESTS,
  createZooSideQuestConfig,
  operateWetlandValve,
  wetlandReadingSafe,
  type WetlandReading,
  type WetlandValve,
  type ZooSideQuestConfig,
  type ZooSideQuestId,
} from "../zooSideQuestLogic";
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
  setZooAnimalEnrichmentDirective,
  type ZooHabitatMotionOptions,
  type ZooAnimalRig,
} from "./ZooAnimals";
import { markAuthoredZooAnimalsDisposed } from "./animals/AuthoredZooAnimalAssets";
import { createSkateboard, rollPersonalMobility, type PersonalMobilityVehicle } from "./PersonalMobility";
import {
  HABITAT_QUEST_OPERATIONS,
  IN_WORLD_ZOO_QUESTS,
  activeQuestObjective,
  activeQuestStation,
  createInWorldZooQuestOrder,
  habitatQuestAt,
  type ActiveInWorldZooQuest,
  type HabitatQuestStation,
  type HabitatQuestStationKind,
} from "./InWorldZooQuests";

export type BronxZooQuestState = "ENTER_ZOO" | "FIND_SLOTHS" | "ESCORT_TO_BUS";

export type BronxZooEvent = {
  kind: "SKATEBOARD_OFFERED" | "LOCK_PICKING_STARTED" | "SLOTHS_RELEASED" | "GARY_HUNGRY" | "JAM_SANDWICH_VENDED" | "JAM_SANDWICH_RECOVERED" | "JAM_SANDWICH_MISSED" | "GARY_FED" | "ANIMAL_QUEST_STARTED" | "ANIMAL_QUEST_OPERATION_STARTED" | "ANIMAL_QUEST_FOCUS_REQUIRED" | "ANIMAL_QUEST_ADVANCED" | "ANIMAL_QUEST_COMPLETED";
  firstCompletion?: boolean;
  message: string;
  questId?: ZooSideQuestId;
  step?: number;
  stepCount?: number;
};

export type BronxZooInteractionHint = {
  kind: "SKATEBOARD_DONOR" | "SLOTH_HABITAT" | "BUS_BOARDING" | "SNACK_MACHINE" | "GARY_HABITAT" | "LOOSE_JAM_SANDWICH" | "ANIMAL_QUEST" | "ANIMAL_QUEST_STEP" | "ANIMAL_QUEST_FOCUS";
  label: string;
  target: THREE.Vector3;
  distance: number;
  questId?: ZooSideQuestId;
};

type ActiveHabitatOperation = {
  calibration: HabitatCalibration;
  key: string;
  progress: number;
  tracking: boolean;
};

type HabitatCalibration =
  | { kind: "passive" }
  | { feedback: number; kind: "rope-tension"; target: number; tension: number }
  | { direction: number; feedback: number; kind: "scent-vane"; target: number }
  | { angle: number; feedback: number; kind: "solar-mirror"; target: number }
  | { drift: WetlandReading; feedback: number; kind: "wetland-balance"; lastValve: WetlandValve | null; reading: WetlandReading };

export type HabitatFieldControlOption = {
  ariaLabel: string;
  code: string;
  label: string;
};

export type HabitatFieldControl = {
  hint: string;
  options: readonly HabitatFieldControlOption[];
  ready: boolean;
  status: string;
};

type GarySnackState = "NONE" | "CARRIED" | "AIRBORNE" | "LOOSE" | "EATEN";

type CircleObstacle = { kind: "circle"; x: number; z: number; radius: number; enabled?: () => boolean };
type BoxObstacle = { kind: "box"; minX: number; maxX: number; minZ: number; maxZ: number; enabled?: () => boolean };
type OrientedBoxObstacle = {
  kind: "oriented-box";
  x: number;
  z: number;
  halfWidth: number;
  halfDepth: number;
  yaw: number;
  enabled?: () => boolean;
};
type Obstacle = CircleObstacle | BoxObstacle | OrientedBoxObstacle;

const ZOO_WORLD_MAX_Z = 39.5;
const BRONX_BACKDROP_MIN_Z = ZOO_WORLD_MAX_Z + 1.5;
const BRONX_BACKDROP_MAX_Z = 760;
const BRONX_CITY_HALF_EXTENT = 760;

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

function storefrontSignTexture(title: string, subtitle: string, paletteIndex: number) {
  const palettes = [
    ["#762f2a", "#281514", "#f3cf7a"],
    ["#245044", "#0d241f", "#d8df9d"],
    ["#315374", "#111d2b", "#e8d6a0"],
    ["#6d4d22", "#251b0e", "#f4d38a"],
  ] as const;
  const [top, bottom, accent] = palettes[paletteIndex % palettes.length];
  return canvasTexture(1280, 320, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, top);
    gradient.addColorStop(1, bottom);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = accent;
    context.lineWidth = 12;
    context.strokeRect(18, 18, width - 36, height - 36);
    context.fillStyle = "#fff8e8";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "800 86px Helvetica, Arial, sans-serif";
    context.fillText(title, width / 2, 125);
    context.fillStyle = accent;
    context.font = "700 34px Helvetica, Arial, sans-serif";
    context.fillText(subtitle, width / 2, 232);
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

function addZooPerimeterWorldContext(root: THREE.Group, textures: GameTextures, quality: number) {
  // The detailed terrain is intentionally bounded to the walkable campus, but
  // the camera can see far beyond it from several enclosure overlooks. A low
  // underlay and layered woodland keep those views grounded all the way into
  // fog without adding collision or expensive individual tree objects.
  const underlay = new THREE.Mesh(
    new THREE.BoxGeometry(900, .22, 780),
    new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .035, color: "#2f4630", roughness: .99 }),
  );
  underlay.name = "bronx-zoo-continuous-world-ground-beyond-visitor-boundary";
  underlay.position.set(0, -.7, -250);
  underlay.receiveShadow = true;
  root.add(underlay);

  const random = seeded(8126071);
  const treePositions: Array<{ x: number; z: number; scale: number }> = [];
  const southRows = quality < .58 ? 3 : 4;
  const southColumns = quality < .58 ? 13 : 19;
  for (let row = 0; row < southRows; row++) for (let column = 0; column < southColumns; column++) {
    const amount = column / Math.max(1, southColumns - 1);
    treePositions.push({
      x: -340 + amount * 680 + (row % 2 ? 13 : 0) + (random() - .5) * 15,
      z: -182 - row * 94 + (random() - .5) * 18,
      scale: .9 + random() * .62,
    });
  }
  const sideRows = quality < .58 ? 2 : 3;
  const sideColumns = quality < .58 ? 10 : 15;
  for (const side of [-1, 1]) for (let row = 0; row < sideRows; row++) for (let column = 0; column < sideColumns; column++) {
    const amount = column / Math.max(1, sideColumns - 1);
    treePositions.push({
      x: side * (106 + row * 72 + (random() - .5) * 9),
      z: -166 + amount * 205 + (column % 2 ? 4 : -4) + (random() - .5) * 10,
      scale: .82 + random() * .56,
    });
  }

  const trunkMaterial = new THREE.MeshStandardMaterial({ map: textures.bark, color: "#554636", roughness: .99 });
  const canopyMaterial = new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .23, color: "#3b653c", roughness: .96, side: THREE.DoubleSide });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22, .38, 6.2, quality > .72 ? 9 : 7), trunkMaterial, treePositions.length);
  trunks.name = "bronx-zoo-perimeter-woodland-trunks-to-fog";
  const crownsPerTree = quality < .58 ? 3 : 4;
  const crowns = new THREE.InstancedMesh(new THREE.PlaneGeometry(7.4, 7.9), canopyMaterial, treePositions.length * crownsPerTree);
  crowns.name = "bronx-zoo-perimeter-woodland-canopy-to-fog";
  const dummy = new THREE.Object3D();
  treePositions.forEach((tree, index) => {
    const groundY = -.56 + Math.sin(tree.x * .019 + tree.z * .013) * .12;
    dummy.position.set(tree.x, groundY + 3.1 * tree.scale, tree.z);
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.scale.set(tree.scale, tree.scale, tree.scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);
    for (let crownIndex = 0; crownIndex < crownsPerTree; crownIndex++) {
      const angle = crownIndex / crownsPerTree * Math.PI + (random() - .5) * .16;
      dummy.position.set(
        tree.x + Math.cos(angle * 2) * .9 * tree.scale,
        groundY + (6.15 + crownIndex % 2 * .82) * tree.scale,
        tree.z + Math.sin(angle * 2) * .9 * tree.scale,
      );
      dummy.rotation.set(0, angle, (random() - .5) * .07);
      dummy.scale.set(tree.scale * (.78 + crownIndex % 2 * .1), tree.scale * (.72 + crownIndex % 3 * .05), tree.scale);
      dummy.updateMatrix();
      crowns.setMatrixAt(index * crownsPerTree + crownIndex, dummy.matrix);
    }
  });
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  trunks.castShadow = quality > .84;
  root.add(trunks, crowns);

  const understoryCount = quality < .58 ? treePositions.length : treePositions.length * 2;
  const understory = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, quality > .72 ? 2 : 1),
    new THREE.MeshStandardMaterial({ map: textures.foliage, color: "#426644", roughness: .99 }),
    understoryCount,
  );
  understory.name = "bronx-zoo-perimeter-understory-to-fog";
  for (let index = 0; index < understoryCount; index++) {
    const tree = treePositions[index % treePositions.length];
    const scale = 1.1 + random() * 1.25;
    dummy.position.set(tree.x + (random() - .5) * 8.5, -.18, tree.z + (random() - .5) * 8.5);
    dummy.rotation.set(0, random() * Math.PI, 0);
    dummy.scale.set(scale * 1.55, scale * .74, scale * 1.2);
    dummy.updateMatrix();
    understory.setMatrixAt(index, dummy.matrix);
  }
  understory.instanceMatrix.needsUpdate = true;
  root.add(understory);
}

function addZooSky(root: THREE.Group) {
  const sky = new Sky();
  sky.name = "bronx-zoo-atmospheric-daylight-sky";
  sky.scale.setScalar(820);
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

function pathPointNormal(points: ReadonlyArray<readonly [number, number]>, index: number) {
  const previous = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)];
  const tangent = new THREE.Vector2(next[0] - previous[0], next[1] - previous[1]).normalize();
  return new THREE.Vector2(-tangent.y, tangent.x);
}

function addPathRibbon(root: THREE.Group, points: ReadonlyArray<readonly [number, number]>, width: number, material: THREE.Material, name: string) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let cumulativeLength = 0;
  for (let index = 0; index < points.length; index++) {
    const [x, z] = points[index];
    if (index > 0) cumulativeLength += Math.hypot(x - points[index - 1][0], z - points[index - 1][1]);
    const normal = pathPointNormal(points, index);
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

function addPathDrainageEdges(root: THREE.Group, points: ReadonlyArray<readonly [number, number]>, width: number, material: THREE.Material, name: string) {
  const positions: number[] = [], indices: number[] = [];
  const pushQuad = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3) => {
    const base = positions.length / 3;
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, d.x, d.y, d.z);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  const atJunction = (point: readonly [number, number]) => ZOO_PATH_JUNCTIONS.some(junction => Math.hypot(point[0] - junction[0], point[1] - junction[1]) < .25);
  const edgeWidth = .22, topLift = .065, bottomLift = .018;

  points.slice(1).forEach((end, segmentIndex) => {
    const start = points[segmentIndex];
    const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
    const startNormal = pathPointNormal(points, segmentIndex), endNormal = pathPointNormal(points, segmentIndex + 1);
    const startTrim = atJunction(start) ? Math.min(width * .64, length * .28) : segmentIndex === 0 ? .24 : 0;
    const endTrim = atJunction(end) ? Math.min(width * .64, length * .28) : segmentIndex === points.length - 2 ? .24 : 0;
    const startAmount = THREE.MathUtils.clamp(startTrim / length, 0, .45);
    const endAmount = THREE.MathUtils.clamp(1 - endTrim / length, .55, 1);

    for (const side of [-1, 1] as const) {
      const crossSection = (amount: number) => {
        const x = THREE.MathUtils.lerp(start[0], end[0], amount), z = THREE.MathUtils.lerp(start[1], end[1], amount);
        const nx = THREE.MathUtils.lerp(startNormal.x, endNormal.x, amount), nz = THREE.MathUtils.lerp(startNormal.y, endNormal.y, amount);
        const normalLength = Math.max(.0001, Math.hypot(nx, nz));
        const unitX = nx / normalLength * side, unitZ = nz / normalLength * side;
        const innerX = x + unitX * width * .5, innerZ = z + unitZ * width * .5;
        const outerX = x + unitX * (width * .5 + edgeWidth), outerZ = z + unitZ * (width * .5 + edgeWidth);
        return {
          innerBottom: new THREE.Vector3(innerX, terrainHeight(innerX, innerZ) + bottomLift, innerZ),
          outerBottom: new THREE.Vector3(outerX, terrainHeight(outerX, outerZ) + bottomLift, outerZ),
          innerTop: new THREE.Vector3(innerX, terrainHeight(innerX, innerZ) + topLift, innerZ),
          outerTop: new THREE.Vector3(outerX, terrainHeight(outerX, outerZ) + topLift, outerZ),
        };
      };
      const startEdge = crossSection(startAmount), endEdge = crossSection(endAmount);
      pushQuad(startEdge.innerTop, startEdge.outerTop, endEdge.outerTop, endEdge.innerTop);
      pushQuad(startEdge.outerBottom, endEdge.outerBottom, endEdge.outerTop, startEdge.outerTop);
      pushQuad(startEdge.innerTop, endEdge.innerTop, endEdge.innerBottom, startEdge.innerBottom);
      pushQuad(startEdge.innerBottom, startEdge.outerBottom, startEdge.outerTop, startEdge.innerTop);
      pushQuad(endEdge.outerBottom, endEdge.innerBottom, endEdge.innerTop, endEdge.outerTop);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const drainageEdges = setShadow(new THREE.Mesh(geometry, material), false, true);
  drainageEdges.name = `${name}-terrain-following-drainage-edges`;
  root.add(drainageEdges);
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
  const stationMetal = new THREE.MeshPhysicalMaterial({
    color: "#29483d",
    metalness: .48,
    roughness: .44,
    clearcoat: .22,
    clearcoatRoughness: .52,
  });
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
  const canopy = setShadow(new THREE.Mesh(new RoundedBoxGeometry(10.3, .38, 5.2, 6, .12), stationMetal));
  canopy.name = "west-farms-human-scale-green-station-canopy";
  canopy.position.set(0, 4.15, 19.5);
  exit.add(canopy);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(7.7, 1.28, .22, 5, .08), new THREE.MeshBasicMaterial({ map: exitTexture, toneMapped: false }));
  sign.name = "west-farms-return-station-sign";
  // Keep the station identity legible without blocking the player's first
  // view of the donor, admission gate, and tree-lined zoo beyond it.
  sign.position.set(0, 5.18, 20.2);
  exit.add(sign);
  for (const x of [-4.35, 4.35]) for (const z of [18.2, 21.3]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.075, .095, 3.25, quality > .72 ? 14 : 9), stationMetal);
    post.name = "west-farms-recessive-station-canopy-post";
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

function addHabitatLabel(root: THREE.Group, ownedTextures: THREE.Texture[], materials: ZooMaterials, title: string, subtitle: string, x: number, z: number, yaw: number, obstacles: Obstacle[]) {
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
  // Match the full interpreted sign face, not just its narrow center post.
  // This keeps large followers from visibly walking through either end while
  // leaving the visitor-facing side close enough for the interaction prompt.
  obstacles.push({ kind: "oriented-box", x, z, halfWidth: 2.32, halfDepth: .18, yaw });
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
    const postHeight = glass ? 3.1 : 1.62;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(glass ? .065 : .052, glass ? .085 : .07, postHeight, 9), materials.iron);
    post.name = glass ? "bronx-zoo-glass-barrier-mullion" : "bronx-zoo-sightline-safe-conservation-post";
    post.position.set(px, baseY + postHeight * .5, pz);
    fence.add(post);
    if (glass) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(Math.hypot(nx - px, nz - pz), 2.75), materials.glass);
      panel.position.set((px + nx) * .5, baseY + 1.42, (pz + nz) * .5);
      panel.rotation.y = -Math.atan2(nz - pz, nx - px);
      fence.add(panel);
    } else for (const y of [.5, 1.08]) {
      const rail = cylinderBetween(new THREE.Vector3(px, baseY + y, pz), new THREE.Vector3(nx, terrainHeight(nx, nz) + y, nz), .035, materials.iron, 8);
      rail.name = "bronx-zoo-sightline-safe-conservation-rail";
      fence.add(rail);
    }
    if (!glass) {
      const cable = cylinderBetween(new THREE.Vector3(px, baseY + 1.48, pz), new THREE.Vector3(nx, terrainHeight(nx, nz) + 1.48, nz), .012, materials.iron, 6);
      cable.name = "bronx-zoo-fine-upper-safety-cable";
      fence.add(cable);
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
  const placed = motion ? configureAutonomousZooAnimal(rig, { ...motion, floorHeight: terrainHeight }) : rig;
  animals.push(placed);
  return placed;
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
  // Fourteen large companions need a real marshalling apron, not a one-person
  // doormat. The broad painted zone communicates the same generous gathering
  // tolerance used by the campaign boarding check.
  const pad = new THREE.Mesh(new RoundedBoxGeometry(9.4, .055, 7.2, 4, .035), new THREE.MeshStandardMaterial({ color: "#29302e", roughness: .9 }));
  pad.position.y = .028; boardingPad.add(pad);
  for (const x of [-4.45, 4.45]) {
    const edge = new THREE.Mesh(new RoundedBoxGeometry(.12, .07, 6.8, 2, .018), boardingYellow);
    edge.position.set(x, .07, 0); boardingPad.add(edge);
  }
  for (const z of [-3.35, 3.35]) {
    const edge = new THREE.Mesh(new RoundedBoxGeometry(8.9, .07, .12, 2, .018), boardingYellow);
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

type HabitatQuestStationVisual = {
  indicator: THREE.MeshStandardMaterial;
  kind: HabitatQuestStationKind;
  mechanism: THREE.Group;
  progressHalo: THREE.Mesh;
  progressMaterial: THREE.MeshBasicMaterial;
  questId: ZooSideQuestId;
  response: HabitatQuestResponseVisual;
  root: THREE.Group;
  stationId: string;
  stationIndex: number;
};

type HabitatQuestResponseVisual = {
  end: THREE.Vector3;
  facingYaw: number;
  link: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null;
  linkStart: THREE.Vector3 | null;
  pathBend: THREE.Vector3;
  root: THREE.Group;
  start: THREE.Vector3;
};

function addHabitatQuestStationTop(group: THREE.Group, kind: HabitatQuestStationKind, materials: ZooMaterials, quality: number) {
  const dark = new THREE.MeshStandardMaterial({ color: "#26322d", roughness: .52, metalness: .42 });
  const accent = new THREE.MeshStandardMaterial({ color: "#d2aa48", roughness: .5, metalness: .3 });
  if (kind === "bird-perch") {
    const callHorn = new THREE.Mesh(new THREE.CylinderGeometry(.17, .085, .36, quality > .72 ? 18 : 12), accent);
    callHorn.rotation.z = Math.PI / 2; callHorn.position.set(0, 1.32, 0); callHorn.name = "in-world-aviary-acoustic-response-horn"; group.add(callHorn);
  } else if (kind === "buoy-dock") {
    const cradle = new THREE.Mesh(new THREE.TorusGeometry(.34, .075, 10, quality > .72 ? 28 : 18), dark);
    cradle.rotation.x = Math.PI / 2; cradle.position.y = 1.35; cradle.name = "in-world-sea-lion-floating-buoy-cradle"; group.add(cradle);
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(.21, quality > .72 ? 20 : 14, 10), accent);
    buoy.position.y = 1.35; buoy.name = "sea-lion-enrichment-buoy"; group.add(buoy);
  } else if (kind === "rope-anchor") {
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(.3, .055, 10, 26), accent);
    wheel.rotation.y = Math.PI / 2; wheel.position.y = 1.37; wheel.name = "monkey-rig-hand-tension-wheel"; group.add(wheel);
    for (let spoke = 0; spoke < 4; spoke++) {
      const bar = new THREE.Mesh(new RoundedBoxGeometry(.56, .045, .045, 2, .012), dark);
      bar.position.y = 1.37; bar.rotation.z = spoke * Math.PI / 4; group.add(bar);
    }
  } else if (kind === "stripe-scanner") {
    const scanner = new THREE.Mesh(new RoundedBoxGeometry(.62, .5, .18, 5, .05), dark);
    scanner.position.y = 1.43; scanner.name = "zebra-live-stripe-scanner-head"; group.add(scanner);
    for (const x of [-.18, 0, .18]) {
      const lens = new THREE.Mesh(new RoundedBoxGeometry(.08, .3, .035, 3, .02), accent);
      lens.position.set(x, 1.43, .105); group.add(lens);
    }
  } else if (kind === "scent-vane") {
    const vane = new THREE.Mesh(new THREE.ConeGeometry(.14, .42, 4), accent);
    vane.rotation.z = -Math.PI / 2; vane.position.y = 1.5; vane.name = "red-panda-canopy-scent-vane"; group.add(vane);
  } else if (kind === "solar-mirror") {
    const mirror = new THREE.Mesh(new THREE.CircleGeometry(.34, quality > .72 ? 28 : 18), new THREE.MeshPhysicalMaterial({ color: "#d8e4dc", metalness: .72, roughness: .12, clearcoat: .8 }));
    mirror.position.set(0, 1.48, .08); mirror.rotation.x = -.22; mirror.name = "tortoise-tilting-warming-mirror"; group.add(mirror);
  } else if (kind === "wetland-valve") {
    const valve = new THREE.Mesh(new THREE.TorusGeometry(.3, .05, 10, 28), accent);
    valve.position.set(0, 1.38, .08); valve.name = "flamingo-wetland-flow-valve"; group.add(valve);
    for (let spoke = 0; spoke < 3; spoke++) {
      const bar = new THREE.Mesh(new RoundedBoxGeometry(.56, .04, .04, 2, .012), dark);
      bar.position.set(0, 1.38, .08); bar.rotation.z = spoke * Math.PI / 3; group.add(bar);
    }
  } else {
    const hopper = new THREE.Mesh(new THREE.CylinderGeometry(.24, .38, .48, quality > .72 ? 16 : 11), materials.wood);
    hopper.position.y = 1.38; hopper.name = "bison-native-prairie-seed-hopper"; group.add(hopper);
    for (let seed = 0; seed < 5; seed++) {
      const pod = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), accent);
      pod.position.set((seed - 2) * .075, 1.68 + Math.abs(seed - 2) * -.02, .02); group.add(pod);
    }
  }
}

function habitatResponseHeight(kind: HabitatQuestStationKind) {
  if (kind === "bird-perch") return 4.35;
  if (kind === "rope-anchor") return 5.8;
  if (kind === "scent-vane") return 4.35;
  if (kind === "stripe-scanner") return 1.75;
  if (kind === "buoy-dock") return .78;
  if (kind === "solar-mirror" || kind === "wetland-valve") return .34;
  return .72;
}

/**
 * Builds the thing the player observes inside the enclosure. These responses
 * deliberately live away from the control post: operating equipment now
 * produces an event in the animal's space instead of filling a hidden timer.
 */
function addHabitatQuestResponse(
  parent: THREE.Group,
  definition: (typeof IN_WORLD_ZOO_QUESTS)[ZooSideQuestId],
  station: HabitatQuestStation,
  stationIndex: number,
  quality: number,
) {
  const root = new THREE.Group();
  root.name = `live-habitat-response-${definition.id}-${station.id}`;
  root.visible = false;
  root.userData.embeddedHabitatResponse = true;
  root.userData.responseKind = station.kind;

  const glow = new THREE.MeshStandardMaterial({
    color: station.kind === "solar-mirror" ? "#fff3b0" : station.kind === "wetland-valve" ? "#9fe9ed" : "#f1c954",
    emissive: station.kind === "wetland-valve" ? "#23777d" : "#8d6714",
    emissiveIntensity: .52,
    roughness: .31,
    metalness: .12,
  });
  const dark = new THREE.MeshStandardMaterial({ color: "#293a37", roughness: .55, metalness: .32 });
  const translucent = new THREE.MeshBasicMaterial({
    color: station.kind === "scent-vane"
      ? "#d5f09d"
      : station.kind === "solar-mirror" || station.kind === "bird-perch"
        ? "#ffe28a"
        : "#bcebf0",
    transparent: true,
    opacity: station.kind === "stripe-scanner" ? .035 : .58,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });

  if (station.kind === "bird-perch") {
    for (let ringIndex = 0; ringIndex < 3; ringIndex++) {
      const call = new THREE.Mesh(new THREE.TorusGeometry(.42 + ringIndex * .32, .042, 8, quality > .72 ? 32 : 20), translucent.clone());
      call.name = "aviary-live-call-wave";
      call.position.z = ringIndex * .09;
      root.add(call);
    }
    const callCore = new THREE.Mesh(new THREE.SphereGeometry(.16, 14, 9), glow);
    callCore.name = "aviary-live-call-source";
    root.add(callCore);
    const contactPerch = new THREE.Mesh(new THREE.CylinderGeometry(.045, .06, 1.05, 10), dark);
    contactPerch.name = "aviary-live-contact-perch";
    contactPerch.rotation.z = Math.PI / 2;
    root.add(contactPerch);
  } else if (station.kind === "buoy-dock") {
    const buoyOrange = new THREE.MeshStandardMaterial({ color: "#e95f3c", emissive: "#672010", emissiveIntensity: .2, roughness: .38, metalness: .08 });
    const buoyWhite = new THREE.MeshStandardMaterial({ color: "#f5efdc", roughness: .34, metalness: .12 });
    const buoy = new THREE.Mesh(new THREE.SphereGeometry(.42, quality > .72 ? 24 : 16, 12), buoyOrange);
    buoy.name = "sea-lion-live-current-buoy";
    root.add(buoy);
    const safetyBand = new THREE.Mesh(new THREE.TorusGeometry(.37, .07, 8, quality > .72 ? 24 : 16), buoyWhite);
    safetyBand.name = "sea-lion-buoy-reflective-safety-band";
    safetyBand.rotation.x = Math.PI / 2;
    safetyBand.position.y = .04;
    root.add(safetyBand);
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, .46, 10), buoyOrange);
    mast.name = "sea-lion-buoy-grab-mast";
    mast.position.y = .5;
    root.add(mast);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.13, .035, 8, 18, Math.PI * 1.6), buoyWhite);
    handle.name = "sea-lion-buoy-enrichment-handle";
    handle.position.y = .77;
    handle.rotation.z = -.3;
    root.add(handle);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.52, .055, 9, quality > .72 ? 28 : 18), dark);
    collar.name = "sea-lion-buoy-water-collar";
    collar.rotation.x = Math.PI / 2;
    collar.position.y = -.08;
    root.add(collar);
    for (let wakeIndex = 0; wakeIndex < 3; wakeIndex++) {
      const wake = new THREE.Mesh(new THREE.RingGeometry(.62 + wakeIndex * .36, .66 + wakeIndex * .36, quality > .72 ? 28 : 18), translucent.clone());
      wake.name = "sea-lion-physical-buoy-wake";
      wake.rotation.x = -Math.PI / 2;
      wake.position.y = -.22;
      root.add(wake);
    }
  } else if (station.kind === "rope-anchor") {
    const trolley = new THREE.Mesh(new RoundedBoxGeometry(.68, .28, .34, 4, .06), glow);
    trolley.name = "monkey-canopy-live-load-trolley";
    root.add(trolley);
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(.13, .035, 8, 18), dark);
      wheel.position.set(side * .21, -.19, 0);
      wheel.rotation.y = Math.PI / 2;
      root.add(wheel);
    }
  } else if (station.kind === "stripe-scanner") {
    const scanBand = new THREE.Mesh(new THREE.PlaneGeometry(2.05, 2.35), translucent);
    scanBand.name = "zebra-live-profile-scan-band";
    scanBand.rotation.y = Math.PI / 2;
    root.add(scanBand);
    const scanLineMaterial = new THREE.MeshBasicMaterial({ color: "#8ce8e4", transparent: true, opacity: .46, depthWrite: false, toneMapped: false });
    for (const [width, height, depth, y, z] of [
      [.028, .025, 2.08, 1.16, 0], [.028, .025, 2.08, -1.16, 0],
      [.028, 2.3, .025, 0, 1.02], [.028, 2.3, .025, 0, -1.02],
    ] as const) {
      const frame = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 2, .007), scanLineMaterial);
      frame.name = "zebra-live-profile-scanner-frame";
      frame.position.set(.015, y, z);
      root.add(frame);
    }
    for (let scanLine = -2; scanLine <= 2; scanLine++) {
      const line = new THREE.Mesh(new RoundedBoxGeometry(.026, .018, 1.9, 2, .007), scanLineMaterial);
      line.name = "zebra-live-profile-scanner-line";
      line.position.y = scanLine * .48;
      root.add(line);
    }
    const lens = new THREE.Mesh(new RoundedBoxGeometry(.12, .18, .25, 4, .035), dark);
    lens.name = "zebra-live-profile-tracker";
    lens.position.set(.1, 1.02, -.86);
    root.add(lens);
  } else if (station.kind === "scent-vane") {
    for (let moteIndex = 0; moteIndex < 9; moteIndex++) {
      const mote = new THREE.Mesh(new THREE.SphereGeometry(.075 + moteIndex % 3 * .018, 8, 6), moteIndex % 2 ? glow : translucent);
      mote.name = "red-panda-live-scent-ribbon-mote";
      mote.position.set(-moteIndex * .22, Math.sin(moteIndex * 1.7) * .16, Math.cos(moteIndex * 1.3) * .18);
      mote.userData.restingRibbonY = mote.position.y;
      mote.userData.ribbonPhase = moteIndex * .78;
      root.add(mote);
    }
  } else if (station.kind === "solar-mirror") {
    const sunSpot = new THREE.Mesh(new THREE.CircleGeometry(.62, quality > .72 ? 32 : 20), translucent);
    sunSpot.name = "tortoise-live-warming-sun-spot";
    sunSpot.rotation.x = -Math.PI / 2;
    root.add(sunSpot);
    const warmCenter = new THREE.Mesh(new THREE.CircleGeometry(.24, 20), glow);
    warmCenter.rotation.x = -Math.PI / 2;
    warmCenter.position.y = .014;
    root.add(warmCenter);
  } else if (station.kind === "wetland-valve") {
    const float = new THREE.Mesh(new THREE.CylinderGeometry(.24, .28, .18, 16), glow);
    float.name = "flamingo-live-waterline-float";
    root.add(float);
    for (let rippleIndex = 0; rippleIndex < 3; rippleIndex++) {
      const ripple = new THREE.Mesh(new THREE.RingGeometry(.38 + rippleIndex * .31, .415 + rippleIndex * .31, 24), translucent.clone());
      ripple.name = "flamingo-physical-waterline-ripple";
      ripple.rotation.x = -Math.PI / 2;
      ripple.position.y = -.08;
      root.add(ripple);
    }
  } else {
    for (let seedIndex = 0; seedIndex < 11; seedIndex++) {
      const seed = new THREE.Mesh(new THREE.SphereGeometry(.055 + seedIndex % 2 * .018, 8, 6), seedIndex % 3 ? glow : dark);
      seed.name = "bison-live-native-seed-arc";
      seed.position.set((seedIndex - 5) * .075, Math.abs(seedIndex - 5) * -.035, Math.sin(seedIndex * 2.2) * .09);
      root.add(seed);
    }
  }

  const center = new THREE.Vector2(definition.center[0], definition.center[1]);
  const stationPosition = new THREE.Vector2(station.position[0], station.position[1]);
  const outward = stationPosition.clone().sub(center).normalize();
  const tangent = new THREE.Vector2(-outward.y, outward.x).multiplyScalar(stationIndex % 2 ? -1 : 1);
  const responseHeight = station.responseHeight ?? habitatResponseHeight(station.kind);
  const startXZ = station.responsePath
    ? new THREE.Vector2(station.responsePath[0][0], station.responsePath[0][1])
    : center.clone().addScaledVector(outward, 6.2);
  const endXZ = station.responsePath
    ? new THREE.Vector2(station.responsePath[1][0], station.responsePath[1][1])
    : center.clone().addScaledVector(outward, -4.7).addScaledVector(tangent, 3.4);
  const start = new THREE.Vector3(startXZ.x, terrainHeight(startXZ.x, startXZ.y) + responseHeight, startXZ.y);
  const end = new THREE.Vector3(endXZ.x, terrainHeight(endXZ.x, endXZ.y) + responseHeight, endXZ.y);
  if (station.kind === "buoy-dock") {
    start.y = terrainHeight(definition.center[0], definition.center[1]) + 1.02;
    end.y = start.y;
  }
  const pathBend = new THREE.Vector3(tangent.x, 0, tangent.y).multiplyScalar(station.responseBend ?? 4.6);
  const facingYaw = Math.atan2(outward.x, outward.y);
  const travelX = end.x - start.x, travelZ = end.z - start.z;
  const travelLength = Math.hypot(travelX, travelZ) || 1;
  root.userData.responseTravelDirection = [travelX / travelLength, travelZ / travelLength];
  root.position.copy(start);
  root.rotation.y = facingYaw;
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.castShadow = quality > .72 && station.kind !== "solar-mirror";
      object.frustumCulled = false;
    }
  });
  parent.add(root);
  let link: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial> | null = null, linkStart: THREE.Vector3 | null = null;
  if (station.kind === "solar-mirror" || station.kind === "rope-anchor") {
    linkStart = new THREE.Vector3(station.position[0], terrainHeight(station.position[0], station.position[1]) + 1.48, station.position[1]);
    link = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([linkStart, start]),
      new THREE.LineBasicMaterial({
        color: station.kind === "solar-mirror" ? "#fff0a3" : "#46584e",
        transparent: true,
        opacity: station.kind === "solar-mirror" ? .62 : .88,
        depthWrite: false,
        toneMapped: false,
      }),
    );
    link.name = station.kind === "solar-mirror"
      ? `tortoise-physical-mirror-beam-${station.id}`
      : `monkey-physical-tension-cable-${station.id}`;
    link.visible = false;
    link.frustumCulled = false;
    parent.add(link);
  }
  return { end, facingYaw, link, linkStart, pathBend, root, start } satisfies HabitatQuestResponseVisual;
}

function addInWorldHabitatQuestStations(root: THREE.Group, materials: ZooMaterials, quality: number, obstacles: Obstacle[]) {
  const visuals = new Map<string, HabitatQuestStationVisual>();
  const stationGroup = new THREE.Group();
  stationGroup.name = "bronx-zoo-physical-in-world-habitat-quest-equipment";
  for (const definition of Object.values(IN_WORLD_ZOO_QUESTS)) {
    definition.stations.forEach((station, index) => {
      const stationRoot = new THREE.Group();
      stationRoot.name = `habitat-quest-station-${definition.id}-${station.id}`;
      stationRoot.position.set(station.position[0], terrainHeight(station.position[0], station.position[1]), station.position[1]);
      stationRoot.rotation.y = Math.atan2(definition.center[0] - station.position[0], definition.center[1] - station.position[1]);
      stationRoot.userData.questId = definition.id;
      stationRoot.userData.stationId = station.id;
      stationRoot.userData.embeddedWorldInteraction = true;
      const foot = new THREE.Mesh(new RoundedBoxGeometry(.82, .18, .72, 4, .055), materials.stone);
      foot.position.y = .09; foot.receiveShadow = true; stationRoot.add(foot);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, 1.15, quality > .72 ? 12 : 8), materials.iron);
      post.position.y = .72; post.castShadow = true; stationRoot.add(post);
      const mechanism = new THREE.Group();
      mechanism.name = `habitat-research-live-mechanism-${station.kind}`;
      addHabitatQuestStationTop(mechanism, station.kind, materials, quality);
      stationRoot.add(mechanism);
      const indicator = new THREE.MeshStandardMaterial({ color: "#c8af65", emissive: "#7a5d18", emissiveIntensity: .12, roughness: .3, metalness: .18 });
      const beacon = new THREE.Mesh(new THREE.SphereGeometry(.045, quality > .72 ? 16 : 10, 8), indicator);
      beacon.name = `habitat-research-beacon-${index + 1}`; beacon.position.set(.3, 1.62, .04); stationRoot.add(beacon);
      const progressMaterial = new THREE.MeshBasicMaterial({ color: "#ffe27b", transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
      const progressHalo = new THREE.Mesh(new THREE.RingGeometry(.145, .205, quality > .72 ? 28 : 18), progressMaterial);
      progressHalo.name = "habitat-research-sustained-focus-progress-halo";
      progressHalo.position.set(.3, 1.62, .055);
      progressHalo.scale.setScalar(.02);
      stationRoot.add(progressHalo);
      stationRoot.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = quality > .66; });
      stationGroup.add(stationRoot);
      const response = addHabitatQuestResponse(stationGroup, definition, station, index, quality);
      obstacles.push({ kind: "circle", x: station.position[0], z: station.position[1], radius: .5 });
      visuals.set(`${definition.id}:${station.id}`, {
        indicator,
        kind: station.kind,
        mechanism,
        progressHalo,
        progressMaterial,
        questId: definition.id,
        response,
        root: stationRoot,
        stationId: station.id,
        stationIndex: index,
      });
    });
  }
  root.add(stationGroup);
  return visuals;
}

type ZooArrivalDistrictRuntime = {
  update(elapsed: number): void;
};

type ArrivalVehicleMotion = {
  root: THREE.Group;
  axis: "x" | "z";
  lane: number;
  start: number;
  end: number;
  speed: number;
  phase: number;
  direction: 1 | -1;
};

function addZooArrivalDistrictBackdrop(root: THREE.Group, materials: ZooMaterials, textures: GameTextures, ownedTextures: THREE.Texture[], quality: number): ZooArrivalDistrictRuntime {
  const district = new THREE.Group();
  district.name = "bronx-zoo-layered-arrival-district-behind-museum-shuttle";
  const asphalt = new THREE.MeshStandardMaterial({ color: "#454a49", map: textures.gravel, bumpMap: textures.gravel, bumpScale: .018, roughness: .96 });
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: "#aaa697", map: textures.stone, bumpMap: textures.stone, bumpScale: .025, roughness: .91 });
  const brick = new THREE.MeshStandardMaterial({ color: "#845d49", map: textures.stone, roughness: .88 });
  const limestone = new THREE.MeshStandardMaterial({ color: "#c3b9a4", map: textures.stone, roughness: .86 });
  const windowMaterial = new THREE.MeshStandardMaterial({ color: "#182729", emissive: "#836b42", emissiveIntensity: .16, roughness: .44, metalness: .12 });
  const arrivalCorridorMinZ = 14;
  const arrivalCorridorDepth = BRONX_BACKDROP_MAX_Z - arrivalCorridorMinZ;
  const arrivalCorridorCenterZ = arrivalCorridorMinZ + arrivalCorridorDepth * .5;
  const arrivalRoad = new THREE.Mesh(new RoundedBoxGeometry(25, .16, arrivalCorridorDepth, 4, .05), asphalt);
  arrivalRoad.name = "bronx-zoo-continuous-southern-boulevard-arrival-road"; arrivalRoad.position.set(18, .94, arrivalCorridorCenterZ); arrivalRoad.receiveShadow = true; district.add(arrivalRoad);
  for (const x of [5.3, 30.7]) {
    const sidewalk = new THREE.Mesh(new RoundedBoxGeometry(4.2, .2, arrivalCorridorDepth, 4, .05), sidewalkMaterial);
    sidewalk.name = "bronx-zoo-arrival-road-continuous-sidewalk"; sidewalk.position.set(x, 1.03, arrivalCorridorCenterZ); sidewalk.receiveShadow = true; district.add(sidewalk);
  }
  const centerLineMaterial = new THREE.MeshStandardMaterial({ color: "#e2c861", emissive: "#5f4b0b", emissiveIntensity: .08, roughness: .72 });
  for (let dashZ = 19; dashZ < BRONX_BACKDROP_MAX_Z - 8; dashZ += 8.7) {
    const line = new THREE.Mesh(new RoundedBoxGeometry(.12, .025, 4.8, 2, .01), centerLineMaterial);
    line.name = "southern-boulevard-arrival-centerline"; line.position.set(18, 1.035, dashZ); district.add(line);
  }
  for (let stripe = 0; stripe < 8; stripe++) {
    const crossing = new THREE.Mesh(new RoundedBoxGeometry(1.65, .03, 6.4, 2, .01), limestone);
    crossing.name = "bronx-zoo-shuttle-stop-raised-visibility-crosswalk"; crossing.position.set(7.2 + stripe * 3.1, 1.05, 39.2); district.add(crossing);
  }

  // Layered, full-volume blocks close the north sightline. Their setbacks and
  // rooflines read as the real Bronx neighborhood beyond the landscaped zoo
  // campus instead of one theatrical wall at the player boundary.
  const blockData = [
    [-40, 75, 32, 45, 25, brick], [-6, 92, 24, 31, 29, limestone], [47, 79, 30, 42, 26, brick],
    [-58, 126, 38, 38, 32, limestone], [1, 134, 34, 58, 28, brick], [58, 126, 41, 42, 31, limestone],
  ] as const;
  blockData.forEach(([x, z, width, height, depth, surface], blockIndex) => {
    const building = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 4, .18), surface);
    building.name = "bronx-neighborhood-authored-arrival-horizon-building"; building.position.set(x, 1 + height * .5, z); building.castShadow = quality > .78; building.receiveShadow = true; district.add(building);
    const cornice = new THREE.Mesh(new RoundedBoxGeometry(width + .7, .48, depth + .7, 3, .06), materials.iron);
    cornice.name = "bronx-neighborhood-stepped-roof-cornice"; cornice.position.set(x, 1.2 + height, z); district.add(cornice);
    const facadeSide = x < 10 ? 1 : -1;
    const floorCount = Math.min(8, Math.max(4, Math.floor((height - 3) / 4.35)));
    for (let floor = 0; floor < floorCount; floor++) for (let bay = 0; bay < 4; bay++) {
      const sideWindow = new THREE.Mesh(new RoundedBoxGeometry(.12, 2.25, 2.4, 3, .035), windowMaterial);
      sideWindow.name = "bronx-neighborhood-recessed-side-window-bay";
      sideWindow.position.set(x + facadeSide * (width * .5 + .08), 4.2 + floor * 4.15, z - depth * .31 + bay * depth * .2);
      district.add(sideWindow);
      const streetWindow = new THREE.Mesh(new RoundedBoxGeometry(2.4, 2.25, .12, 3, .035), windowMaterial);
      streetWindow.name = "bronx-neighborhood-recessed-street-facing-window-bay";
      streetWindow.position.set(x - width * .31 + bay * width * .2, 4.2 + floor * 4.15, z - depth * .5 - .08);
      district.add(streetWindow);
    }
    if (blockIndex % 2 === 0) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 2.7, 16), materials.wood);
      tank.name = "bronx-neighborhood-rooftop-water-tank"; tank.position.set(x + width * .16, height + 2.7, z - depth * .14); district.add(tank);
    }
  });

  const visitorCenter = new THREE.Group();
  visitorCenter.name = "bronx-zoo-southern-boulevard-visitor-services-pavilion"; visitorCenter.position.set(-18, 1.02, 52);
  const visitorBody = new THREE.Mesh(new RoundedBoxGeometry(27, 7.2, 10, 5, .18), brick); visitorBody.position.y = 3.6; visitorCenter.add(visitorBody);
  const visitorCanopy = new THREE.Mesh(new RoundedBoxGeometry(29, .38, 5.6, 5, .09), materials.iron); visitorCanopy.position.set(0, 5.8, -6.5); visitorCenter.add(visitorCanopy);
  for (const x of [-11, -5.5, 0, 5.5, 11]) {
    const glazing = new THREE.Mesh(new RoundedBoxGeometry(4.6, 3.3, .12, 4, .04), windowMaterial); glazing.position.set(x, 2.7, -5.14); visitorCenter.add(glazing);
    const support = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, 5.6, 10), materials.iron); support.position.set(x, 2.8, -7.4); visitorCenter.add(support);
  }
  district.add(visitorCenter);

  const contextSignTexture = signTexture("BRONX ZOO ARRIVAL", "SOUTHERN BOULEVARD · SHUTTLES · VISITOR SERVICES", "#f0d36a");
  ownedTextures.push(contextSignTexture);
  const districtSign = new THREE.Mesh(new RoundedBoxGeometry(10.8, 2.6, .25, 5, .07), new THREE.MeshBasicMaterial({ map: contextSignTexture, toneMapped: false }));
  districtSign.name = "bronx-zoo-arrival-district-wayfinding-sign"; districtSign.position.set(-18, 7.8, 45.7); district.add(districtSign);

  const treeTrunk = new THREE.CylinderGeometry(.22, .36, 6.2, quality > .72 ? 11 : 8);
  const treeCrown = new THREE.IcosahedronGeometry(2.9, quality > .72 ? 2 : 1);
  const arrivalTrees = quality < .58 ? 18 : quality < .82 ? 28 : 40;
  const random = seeded(2041908), dummy = new THREE.Object3D();
  const trunks = new THREE.InstancedMesh(treeTrunk, materials.bark, arrivalTrees);
  trunks.name = "bronx-zoo-layered-arrival-buffer-tree-trunks";
  const crowns = new THREE.InstancedMesh(treeCrown, materials.leaf, arrivalTrees * 2);
  crowns.name = "bronx-zoo-layered-arrival-buffer-tree-canopy";
  for (let index = 0; index < arrivalTrees; index++) {
    const side = index % 2 ? -1 : 1;
    const x = side > 0 ? 36 + random() * 43 : -35 - random() * 43;
    const z = 42 + random() * 89;
    dummy.position.set(x, 4.1, z); dummy.rotation.set(0, random() * Math.PI, 0); dummy.scale.set(1, .92 + random() * .22, 1); dummy.updateMatrix(); trunks.setMatrixAt(index, dummy.matrix);
    for (let layer = 0; layer < 2; layer++) {
      dummy.position.set(x + (random() - .5) * 2.7, 7.5 + layer * 1.35 + random(), z + (random() - .5) * 2.4);
      const scale = .8 + random() * .48; dummy.scale.set(scale, scale * .78, scale); dummy.updateMatrix(); crowns.setMatrixAt(index * 2 + layer, dummy.matrix);
    }
  }
  trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = true;
  trunks.castShadow = quality > .7; crowns.castShadow = quality > .82; district.add(trunks, crowns);

  for (let carIndex = 0; carIndex < 4; carIndex++) {
    const car = new THREE.Group(); car.name = "bronx-zoo-arrival-context-parked-city-vehicle"; car.position.set(carIndex % 2 ? 11 : 25, 1.02, 59 + carIndex * 13); car.rotation.y = carIndex % 2 ? Math.PI : 0;
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.05, .72, 4.4, 6, .18), new THREE.MeshPhysicalMaterial({ color: ["#516c78", "#7e4e45", "#d1c3a8", "#3e5548"][carIndex], roughness: .53, clearcoat: .34 })); body.position.y = .62; car.add(body);
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.72, .72, 2.15, 6, .16), windowMaterial); cabin.position.set(0, 1.16, .12); car.add(cabin);
    for (const wheelX of [-1.03, 1.03]) for (const wheelZ of [-1.43, 1.43]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .18, quality > .72 ? 14 : 9), materials.iron);
      wheel.name = "bronx-arrival-context-parked-vehicle-ground-contact-wheel";
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wheelX, .35, wheelZ);
      car.add(wheel);
    }
    district.add(car);
  }

  // Parked curbside cars make the first lateral glance read as an inhabited
  // city block, not an empty debug road. They stay beyond the playable zoo
  // boundary and use full wheel contact rather than floating body boxes.
  const corridorParkedCarCount = quality < .58 ? 8 : 14;
  const corridorCarColors = ["#355b66", "#7b443b", "#d2c3a5", "#334a3f", "#555960", "#b4a33c"];
  for (let index = 0; index < corridorParkedCarCount; index++) {
    const direction = index % 2 ? -1 : 1;
    const distance = 118 + Math.floor(index / 2) * 68;
    const vehicle = new THREE.Group();
    vehicle.name = "bronx-corridor-curbside-grounded-parked-vehicle";
    vehicle.position.set(direction * distance, 1.02, index % 4 < 2 ? 30.1 : 42.2);
    vehicle.rotation.y = direction > 0 ? Math.PI / 2 : -Math.PI / 2;
    const bodyMaterial = new THREE.MeshPhysicalMaterial({ color: corridorCarColors[index % corridorCarColors.length], roughness: .5, clearcoat: .34, clearcoatRoughness: .34 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.02, .72, 4.25, 6, .17), bodyMaterial); body.position.y = .65; vehicle.add(body);
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.7, .7, 2.05, 6, .15), windowMaterial); cabin.position.set(0, 1.16, .08); vehicle.add(cabin);
    for (const wheelX of [-1.03, 1.03]) for (const wheelZ of [-1.4, 1.4]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .18, quality > .72 ? 14 : 9), materials.iron);
      wheel.name = "bronx-corridor-parked-vehicle-ground-contact-wheel";
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wheelX, .35, wheelZ);
      vehicle.add(wheel);
    }
    district.add(vehicle);
  }

  // The arrival is backed by a complete low-rise Bronx district, not a row of
  // scenery cards. Streets, block interiors, the elevated line, traffic,
  // vegetation, utilities, and a distant skyline continue beyond the playable
  // boundary until exponential fog fully owns the view.
  const borough = new THREE.Group();
  borough.name = "bronx-borough-scale-arrival-environment-to-fog";
  const cityGroundMaterial = new THREE.MeshStandardMaterial({ color: "#77766c", map: textures.ground, bumpMap: textures.ground, bumpScale: .025, roughness: .98 });
  const cityAsphalt = new THREE.MeshStandardMaterial({ color: "#343a3b", map: textures.gravel, bumpMap: textures.gravel, bumpScale: .016, roughness: .97 });
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", map: textures.stone, bumpMap: textures.stone, bumpScale: .012, roughness: .89, vertexColors: true });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: "#343c3b", roughness: .91, metalness: .08 });
  const fireEscapeMaterial = new THREE.MeshStandardMaterial({ color: "#171b1a", roughness: .54, metalness: .76 });
  const backdropDepth = BRONX_BACKDROP_MAX_Z - BRONX_BACKDROP_MIN_Z;
  const ground = new THREE.Mesh(new RoundedBoxGeometry(BRONX_CITY_HALF_EXTENT * 2, .18, backdropDepth, 3, .04), cityGroundMaterial);
  ground.name = "bronx-borough-scale-urban-ground-to-fog";
  ground.position.set(0, .7, (BRONX_BACKDROP_MIN_Z + BRONX_BACKDROP_MAX_Z) * .5);
  ground.receiveShadow = true;
  borough.add(ground);

  type InstanceSpec = { x: number; y: number; z: number; sx: number; sy: number; sz: number; rotationY?: number; color?: string };
  const instanceDummy = new THREE.Object3D();
  const addInstances = (name: string, geometry: THREE.BufferGeometry, material: THREE.Material, specs: InstanceSpec[]) => {
    const instances = new THREE.InstancedMesh(geometry, material, specs.length);
    instances.name = name;
    specs.forEach((spec, index) => {
      instanceDummy.position.set(spec.x, spec.y, spec.z);
      instanceDummy.rotation.set(0, spec.rotationY ?? 0, 0);
      instanceDummy.scale.set(spec.sx, spec.sy, spec.sz);
      instanceDummy.updateMatrix();
      instances.setMatrixAt(index, instanceDummy.matrix);
      if (spec.color) instances.setColorAt(index, new THREE.Color(spec.color));
    });
    instances.instanceMatrix.needsUpdate = true;
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
    borough.add(instances);
    return instances;
  };

  const avenueCenters = [-310, -250, -180, -108, -36, 18, 90, 162, 234, 306, 366];
  const crossStreetCenters = [42, 74, 128, 190, 258, 332, 410, 478];
  const roadSpecs: InstanceSpec[] = [];
  avenueCenters.slice(1, -1).filter(x => x !== 18).forEach(x => roadSpecs.push({ x, y: .84, z: 258, sx: 14, sy: .16, sz: 440 }));
  crossStreetCenters.slice(1, -1).forEach(z => roadSpecs.push({ x: 0, y: .85, z, sx: BRONX_CITY_HALF_EXTENT * 2, sy: .16, sz: 14 }));
  // Continue the authored 176 m station road only beyond its two ends. A
  // second full-width slab over the arrival road created overlapping depth
  // surfaces and visible shimmer across the debug spawn and shuttle apron.
  const arrivalRoadHalfWidth = 88, boroughRoadHalfWidth = BRONX_CITY_HALF_EXTENT;
  const outerRoadWidth = boroughRoadHalfWidth - arrivalRoadHalfWidth;
  const outerRoadCenter = arrivalRoadHalfWidth + outerRoadWidth * .5;
  for (const side of [-1, 1]) roadSpecs.push({ x: side * outerRoadCenter, y: .84, z: 35.8, sx: outerRoadWidth, sy: .16, sz: 14.5 });
  addInstances("bronx-borough-complete-street-grid", new THREE.BoxGeometry(1, 1, 1), cityAsphalt, roadSpecs).receiveShadow = true;

  const laneSpecs: InstanceSpec[] = [];
  avenueCenters.slice(1, -1).forEach(x => {
    for (let z = 52; z < 470; z += 17.5) laneSpecs.push({ x, y: .94, z, sx: .13, sy: .025, sz: 5.8, color: x === 18 ? "#e4c451" : "#d9d7c9" });
  });
  crossStreetCenters.slice(1, -1).forEach(z => {
    for (let x = -500; x < 505; x += 22) laneSpecs.push({ x, y: .95, z, sx: 7.2, sy: .025, sz: .12, color: "#d9d7c9" });
  });
  for (let x = -750; x <= 750; x += 20) {
    if (Math.abs(x) <= arrivalRoadHalfWidth + 7) continue;
    laneSpecs.push({ x, y: .95, z: 35.8, sx: 6.8, sy: .025, sz: .12, color: "#e4c451" });
  }
  const laneMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .75, vertexColors: true });
  addInstances("bronx-borough-lane-marking-network", new THREE.BoxGeometry(1, 1, 1), laneMaterial, laneSpecs);

  const sidewalkSpecs: InstanceSpec[] = [];
  const buildingSpecs: InstanceSpec[] = [];
  const corniceSpecs: InstanceSpec[] = [];
  const storefrontSpecs: InstanceSpec[] = [];
  const rooftopUnitSpecs: InstanceSpec[] = [];
  const southNorthWindowSpecs: InstanceSpec[] = [];
  const eastWestWindowSpecs: InstanceSpec[] = [];
  const fireEscapeDeckSpecs: InstanceSpec[] = [];
  const fireEscapeLadderSpecs: InstanceSpec[] = [];
  const awningSpecs: InstanceSpec[] = [];
  const storefrontDoorSpecs: InstanceSpec[] = [];
  const storefrontBladeSignSpecs: InstanceSpec[] = [];
  const storefrontGlazingSpecs: InstanceSpec[] = [];
  const facadeBandSpecs: InstanceSpec[] = [];
  const storefrontSignAnchors: Array<{ x: number; y: number; z: number; title: string; subtitle: string; palette: number }> = [];
  const storefrontDirectory = [
    ["TREMONT BAKERY", "BREAD · COFFEE · PASTRIES"],
    ["SOUTHERN MARKET", "FRUIT · DELI · GROCERY"],
    ["BRONX BIKE SHOP", "REPAIRS · PARTS · SERVICE"],
    ["BOTANICA", "HERBS · CANDLES · GIFTS"],
    ["CAFÉ 1899", "BREAKFAST · COFFEE · LUNCH"],
    ["NEIGHBORHOOD BOOKS", "NEW · USED · LOCAL"],
    ["PHARMACY", "PRESCRIPTIONS · HEALTH"],
    ["FLOWER & ROOT", "PLANTS · BOUQUETS · SOIL"],
  ] as const;
  const urbanRandom = seeded(7211904);
  const facadeColors = ["#86634f", "#a08b72", "#776f69", "#a8785c", "#b0a58d", "#6f7c78", "#927967", "#c0b69f"];
  let blockIndex = 0;
  let buildingIndex = 0;
  for (let xIndex = 0; xIndex < avenueCenters.length - 1; xIndex++) {
    const minX = avenueCenters[xIndex] + 9, maxX = avenueCenters[xIndex + 1] - 9;
    for (let zIndex = 1; zIndex < crossStreetCenters.length - 1; zIndex++) {
      const minZ = crossStreetCenters[zIndex] + 9, maxZ = crossStreetCenters[zIndex + 1] - 9;
      const blockWidth = maxX - minX, blockDepth = maxZ - minZ;
      if (blockWidth < 18 || blockDepth < 18) continue;
      sidewalkSpecs.push({ x: (minX + maxX) * .5, y: .99, z: (minZ + maxZ) * .5, sx: blockWidth, sy: .2, sz: blockDepth });
      const includeBlock = quality >= .58 || blockIndex % 2 === 0;
      blockIndex++;
      if (!includeBlock) continue;
      const buildingsPerBlock = quality > .82 ? 3 : 2;
      const slotWidth = blockWidth / buildingsPerBlock;
      for (let slot = 0; slot < buildingsPerBlock; slot++) {
        const width = Math.max(9, slotWidth - 3.2 - urbanRandom() * 2.2);
        const depth = Math.max(13, Math.min(blockDepth - 4, 17 + urbanRandom() * 17));
        const x = minX + slotWidth * (slot + .5) + (urbanRandom() - .5) * 1.6;
        const z = (minZ + maxZ) * .5 + (slot % 2 ? 1 : -1) * Math.max(0, (blockDepth - depth) * .24);
        const distanceLift = z > 250 ? urbanRandom() * 18 : 0;
        const height = 15 + urbanRandom() * 38 + distanceLift + (Math.abs(x) < 115 ? 7 : 0);
        const color = facadeColors[(buildingIndex + Math.floor(urbanRandom() * facadeColors.length)) % facadeColors.length];
        buildingSpecs.push({ x, y: 1.1 + height * .5, z, sx: width, sy: height, sz: depth, color });
        corniceSpecs.push({ x, y: 1.25 + height, z, sx: width + .75, sy: .48, sz: depth + .72 });
        storefrontSpecs.push({ x, y: 2.7, z, sx: width + .22, sy: 3.25, sz: depth + .16, color: buildingIndex % 2 ? "#6d6257" : "#82725f" });
        const storefrontBayCount = Math.min(5, Math.max(2, Math.floor(width / 4.6)));
        const entryX = x + (buildingIndex % 2 ? -1 : 1) * width * .28;
        for (let bay = 0; bay < storefrontBayCount; bay++) {
          const glassX = x - width * .37 + bay * (width * .74 / Math.max(1, storefrontBayCount - 1));
          if (Math.abs(glassX - entryX) > 1.35) storefrontGlazingSpecs.push({ x: glassX, y: 2.55, z: z - depth * .5 - .2, sx: Math.min(2.7, width / storefrontBayCount * .72), sy: 2.35, sz: .12 });
          storefrontGlazingSpecs.push({ x: glassX, y: 2.55, z: z + depth * .5 + .2, sx: Math.min(2.7, width / storefrontBayCount * .72), sy: 2.35, sz: .12 });
        }
        storefrontDoorSpecs.push({ x: entryX, y: 2.35, z: z - depth * .5 - .23, sx: 1.55, sy: 2.85, sz: .16, color: buildingIndex % 3 === 0 ? "#244f47" : buildingIndex % 3 === 1 ? "#6f3e35" : "#2c3432" });
        if (buildingIndex % 2 === 0) rooftopUnitSpecs.push({ x: x + width * .17, y: height + 2, z: z - depth * .16, sx: 2.4, sy: 1.35, sz: 2.1 });
        const floorCount = Math.min(10, Math.max(3, Math.floor((height - 4) / 4.15)));
        const bayCount = Math.min(7, Math.max(2, Math.floor(width / 4.25)));
        const sideBayCount = Math.min(5, Math.max(2, Math.floor(depth / 4.8)));
        const floorStep = quality < .58 ? 2 : 1;
        for (let floor = 0; floor < floorCount; floor += floorStep) {
          const y = 5 + floor * 4.05;
          for (let bay = 0; bay < bayCount; bay++) {
            const wx = x - width * .38 + bay * (width * .76 / Math.max(1, bayCount - 1));
            const lit = (floor + bay + buildingIndex) % 5 === 0 ? "#b89a62" : "#26383a";
            southNorthWindowSpecs.push({ x: wx, y, z: z - depth * .5 - .07, sx: 1.18, sy: 1.75, sz: .12, color: lit });
            southNorthWindowSpecs.push({ x: wx, y, z: z + depth * .5 + .07, sx: 1.18, sy: 1.75, sz: .12, color: lit });
          }
          if (floor > 0 && z < 360) {
            const bandY = 3.86 + floor * 4.05;
            facadeBandSpecs.push({ x, y: bandY, z: z - depth * .5 - .11, sx: width + .28, sy: .16, sz: .18 });
            facadeBandSpecs.push({ x, y: bandY, z: z + depth * .5 + .11, sx: width + .28, sy: .16, sz: .18 });
          }
          if (z < 360) for (let bay = 0; bay < sideBayCount; bay++) {
            const wz = z - depth * .36 + bay * (depth * .72 / Math.max(1, sideBayCount - 1));
            const lit = (floor + bay + buildingIndex) % 6 === 0 ? "#a98c59" : "#243638";
            eastWestWindowSpecs.push({ x: x - width * .5 - .07, y, z: wz, sx: 1.15, sy: 1.72, sz: .12, rotationY: Math.PI / 2, color: lit });
            eastWestWindowSpecs.push({ x: x + width * .5 + .07, y, z: wz, sx: 1.15, sy: 1.72, sz: .12, rotationY: Math.PI / 2, color: lit });
          }
        }
        if (buildingIndex % 5 === 0 && z < 280) {
          const decks = Math.min(6, Math.max(2, Math.floor(height / 5.2)));
          for (let deck = 0; deck < decks; deck++) {
            const deckY = 6.2 + deck * 4.35;
            fireEscapeDeckSpecs.push({ x: x + width * .18, y: deckY, z: z - depth * .5 - .65, sx: Math.min(4.8, width * .44), sy: .12, sz: 1.15 });
            fireEscapeLadderSpecs.push({ x: x + width * .18 + (deck % 2 ? 1.25 : -1.25), y: deckY - 1.9, z: z - depth * .5 - .72, sx: .12, sy: 3.8, sz: .12 });
          }
        }
        if (buildingIndex % 3 === 0 && z < 240) awningSpecs.push({ x, y: 3.7, z: z - depth * .5 - .92, sx: Math.min(width * .62, 8), sy: .24, sz: 1.7, color: buildingIndex % 2 ? "#315b4d" : "#8a493f" });
        buildingIndex++;
      }
    }
  }
  // Two detailed streetwalls continue the east-west road beyond both sides of
  // the playable zoo. They turn the arrival forecourt into one intersection
  // inside a larger neighborhood instead of a road that ends at the set edge.
  for (const direction of [-1, 1] as const) for (let corridorIndex = 0; corridorIndex < 18; corridorIndex++) {
    const x = direction * (100 + corridorIndex * 32);
    const width = 27 + urbanRandom() * 3.5;
    for (const streetSide of [-1, 1] as const) {
      const z = streetSide < 0 ? 13 : 59;
      const depth = 24 + urbanRandom() * 8;
      const height = 19 + urbanRandom() * 31 + corridorIndex * .85;
      const color = facadeColors[(corridorIndex + (direction > 0 ? 2 : 5) + (streetSide > 0 ? 1 : 0)) % facadeColors.length];
      buildingSpecs.push({ x, y: 1.1 + height * .5, z, sx: width, sy: height, sz: depth, color });
      corniceSpecs.push({ x, y: 1.25 + height, z, sx: width + .8, sy: .5, sz: depth + .75 });
      storefrontSpecs.push({ x, y: 2.72, z, sx: width + .2, sy: 3.3, sz: depth + .14, color: corridorIndex % 2 ? "#786755" : "#615d56" });
      if (corridorIndex % 3 === 0) rooftopUnitSpecs.push({ x: x + direction * width * .17, y: height + 1.95, z: z + streetSide * depth * .12, sx: 2.5, sy: 1.35, sz: 2.2 });
      const floors = Math.min(9, Math.max(3, Math.floor((height - 4) / 4.1)));
      const bays = Math.min(7, Math.max(3, Math.floor(width / 4.1)));
      const sideBays = Math.min(6, Math.max(3, Math.floor(depth / 4.25)));
      for (let floor = 0; floor < floors; floor++) {
        for (let bay = 0; bay < bays; bay++) {
          const wx = x - width * .39 + bay * (width * .78 / Math.max(1, bays - 1));
          const lit = (floor + bay + corridorIndex) % 5 === 0 ? "#b99d68" : "#26383a";
          southNorthWindowSpecs.push({ x: wx, y: 5 + floor * 4.02, z: z - depth * .5 - .08, sx: 1.25, sy: 1.78, sz: .12, color: lit });
          southNorthWindowSpecs.push({ x: wx, y: 5 + floor * 4.02, z: z + depth * .5 + .08, sx: 1.25, sy: 1.78, sz: .12, color: lit });
        }
        for (let bay = 0; bay < sideBays; bay++) {
          const wz = z - depth * .37 + bay * (depth * .74 / Math.max(1, sideBays - 1));
          const lit = (floor + bay + corridorIndex + streetSide) % 6 === 0 ? "#ad915e" : "#26383a";
          eastWestWindowSpecs.push({ x: x - width * .5 - .08, y: 5 + floor * 4.02, z: wz, sx: 1.2, sy: 1.76, sz: .12, rotationY: Math.PI / 2, color: lit });
          eastWestWindowSpecs.push({ x: x + width * .5 + .08, y: 5 + floor * 4.02, z: wz, sx: 1.2, sy: 1.76, sz: .12, rotationY: Math.PI / 2, color: lit });
        }
        if (floor > 0) {
          const bandY = 3.84 + floor * 4.02;
          facadeBandSpecs.push({ x, y: bandY, z: z - depth * .5 - .11, sx: width + .3, sy: .16, sz: .18 });
          facadeBandSpecs.push({ x, y: bandY, z: z + depth * .5 + .11, sx: width + .3, sy: .16, sz: .18 });
        }
      }
      if (streetSide > 0 && corridorIndex % 2 === 0) awningSpecs.push({ x, y: 3.75, z: z - depth * .5 - .95, sx: Math.min(8.5, width * .58), sy: .24, sz: 1.8, color: corridorIndex % 4 ? "#315b4d" : "#8a493f" });
      const roadFacingZ = z + (streetSide < 0 ? depth * .5 + .1 : -depth * .5 - .1);
      const doorX = x + (corridorIndex % 2 ? -1 : 1) * width * .24;
      storefrontDoorSpecs.push({ x: doorX, y: 2.22, z: roadFacingZ, sx: 1.55, sy: 2.72, sz: .14, color: corridorIndex % 3 === 0 ? "#244f47" : corridorIndex % 3 === 1 ? "#6f3e35" : "#2c3432" });
      storefrontBladeSignSpecs.push({ x: x - direction * width * .38, y: 4.45, z: roadFacingZ + (streetSide < 0 ? .6 : -.6), sx: .2, sy: 1.2, sz: .78, color: corridorIndex % 2 ? "#d0b663" : "#d9d2bf" });
      const glazingBays = Math.min(6, Math.max(3, Math.floor(width / 4.35)));
      for (let bay = 0; bay < glazingBays; bay++) {
        const glassX = x - width * .38 + bay * (width * .76 / Math.max(1, glazingBays - 1));
        if (Math.abs(glassX - doorX) < 1.35) continue;
        storefrontGlazingSpecs.push({ x: glassX, y: 2.45, z: roadFacingZ + (streetSide < 0 ? .12 : -.12), sx: Math.min(2.75, width / glazingBays * .72), sy: 2.25, sz: .12 });
      }
      if (corridorIndex < (quality < .58 ? 3 : 6) && streetSide === (corridorIndex % 2 ? -1 : 1)) {
        const directoryIndex = (corridorIndex + (direction > 0 ? 0 : 4)) % storefrontDirectory.length;
        const [title, subtitle] = storefrontDirectory[directoryIndex];
        storefrontSignAnchors.push({ x, y: 4.55, z: roadFacingZ + (streetSide < 0 ? .18 : -.18), title, subtitle, palette: directoryIndex });
      }
    }
  }
  addInstances("bronx-city-block-raised-sidewalk-islands", new THREE.BoxGeometry(1, 1, 1), sidewalkMaterial, sidewalkSpecs).receiveShadow = true;
  const shells = addInstances("bronx-full-volume-varied-building-field", new RoundedBoxGeometry(1, 1, 1, 3, .025), buildingMaterial, buildingSpecs);
  shells.castShadow = quality > .82;
  shells.receiveShadow = true;
  addInstances("bronx-building-roofline-cornice-network", new THREE.BoxGeometry(1, 1, 1), roofMaterial, corniceSpecs);
  addInstances("bronx-building-articulated-storefront-plinths", new THREE.BoxGeometry(1, 1, 1), buildingMaterial, storefrontSpecs);
  addInstances("bronx-rooftop-hvac-and-service-units", new RoundedBoxGeometry(1, 1, 1, 3, .06), roofMaterial, rooftopUnitSpecs);
  const boroughWindowMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#725d3e", emissiveIntensity: .18, roughness: .38, metalness: .14, vertexColors: true });
  const windowFrameMaterial = new THREE.MeshStandardMaterial({ color: "#d0c2a8", roughness: .74, metalness: .05 });
  addInstances("bronx-building-south-north-window-frame-depth-field", new THREE.BoxGeometry(1, 1, 1), windowFrameMaterial, southNorthWindowSpecs.map(spec => ({ ...spec, sx: spec.sx + .38, sy: spec.sy + .34, sz: .08 })));
  addInstances("bronx-building-east-west-window-frame-depth-field", new THREE.BoxGeometry(1, 1, 1), windowFrameMaterial, eastWestWindowSpecs.map(spec => ({ ...spec, sx: spec.sx + .38, sy: spec.sy + .34, sz: .08 })));
  addInstances("bronx-building-south-north-window-depth-field", new THREE.BoxGeometry(1, 1, 1), boroughWindowMaterial, southNorthWindowSpecs);
  addInstances("bronx-building-east-west-window-depth-field", new THREE.BoxGeometry(1, 1, 1), boroughWindowMaterial, eastWestWindowSpecs);
  const facadeBandMaterial = new THREE.MeshStandardMaterial({ color: "#b7aa90", map: textures.stone, roughness: .86 });
  addInstances("bronx-neighborhood-masonry-floor-and-spandrel-bands", new THREE.BoxGeometry(1, 1, 1), facadeBandMaterial, facadeBandSpecs);
  addInstances("bronx-fire-escape-platform-network", new THREE.BoxGeometry(1, 1, 1), fireEscapeMaterial, fireEscapeDeckSpecs);
  addInstances("bronx-fire-escape-ladder-network", new THREE.BoxGeometry(1, 1, 1), fireEscapeMaterial, fireEscapeLadderSpecs);
  const awningMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .72, vertexColors: true });
  addInstances("bronx-neighborhood-storefront-awning-network", new THREE.BoxGeometry(1, 1, 1), awningMaterial, awningSpecs);
  const storefrontDoorMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .48, metalness: .18, vertexColors: true });
  addInstances("bronx-corridor-recessed-storefront-door-network", new RoundedBoxGeometry(1, 1, 1, 3, .03), storefrontDoorMaterial, storefrontDoorSpecs);
  addInstances("bronx-neighborhood-ground-floor-storefront-frame-network", new RoundedBoxGeometry(1, 1, 1, 3, .035), windowFrameMaterial, storefrontGlazingSpecs.map(spec => ({ ...spec, sx: spec.sx + .3, sy: spec.sy + .3, sz: .09 })));
  const storefrontGlassMaterial = new THREE.MeshStandardMaterial({ color: "#294545", emissive: "#8a6d3d", emissiveIntensity: .34, roughness: .28, metalness: .18 });
  addInstances("bronx-neighborhood-ground-floor-glazing-and-interior-light", new RoundedBoxGeometry(1, 1, 1, 3, .025), storefrontGlassMaterial, storefrontGlazingSpecs);
  const bladeSignMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#54451f", emissiveIntensity: .16, roughness: .44, metalness: .22, vertexColors: true });
  addInstances("bronx-corridor-human-scale-blade-sign-network", new RoundedBoxGeometry(1, 1, 1, 3, .04), bladeSignMaterial, storefrontBladeSignSpecs);
  storefrontSignAnchors.forEach((anchor, index) => {
    const texture = storefrontSignTexture(anchor.title, anchor.subtitle, anchor.palette);
    ownedTextures.push(texture);
    const sign = new THREE.Mesh(new RoundedBoxGeometry(8.8, 1.5, .22, 4, .045), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    sign.name = "bronx-neighborhood-luminous-storefront-signage";
    sign.position.set(anchor.x, anchor.y, anchor.z);
    sign.userData.storefront = anchor.title;
    borough.add(sign);
    if (index % 3 === 0) {
      const downlight = new THREE.PointLight("#f0cf88", .42, 7.5, 2);
      downlight.name = "bronx-storefront-restrained-sign-downlight";
      downlight.position.set(anchor.x, anchor.y - .75, anchor.z);
      borough.add(downlight);
    }
  });

  const roofTankSpecs: InstanceSpec[] = [];
  buildingSpecs.forEach((building, index) => {
    if (index % 7 !== 0) return;
    roofTankSpecs.push({ x: building.x - building.sx * .18, y: building.y + building.sy * .5 + 2.15, z: building.z + building.sz * .1, sx: 1.25, sy: 2.2, sz: 1.25 });
  });
  addInstances("bronx-rooftop-water-tank-skyline-rhythm", new THREE.CylinderGeometry(1, 1.18, 1, 14), materials.wood, roofTankSpecs);

  const streetTreePositions: Array<[number, number, number]> = [];
  const streetTreeRandom = seeded(887421);
  const treeRows = quality < .58 ? [128, 258, 410] : [96, 158, 224, 294, 367, 444];
  treeRows.forEach((z, rowIndex) => {
    for (let x = -332 + rowIndex % 2 * 8; x <= 334; x += quality < .58 ? 34 : 22) {
      if (avenueCenters.some(avenue => Math.abs(avenue - x) < 10.5)) continue;
      streetTreePositions.push([x, z + (streetTreeRandom() - .5) * 3.5, .72 + streetTreeRandom() * .48]);
    }
  });
  for (let x = -105; x <= 322; x += quality < .58 ? 18 : 12) {
    if (Math.abs(x - 18) < 17) continue;
    streetTreePositions.push([x, 52 + (streetTreeRandom() - .5) * 7, .9 + streetTreeRandom() * .35]);
  }
  const streetTrunks = streetTreePositions.map(([x, z, scale]) => ({ x, y: 1 + scale * 2.8, z, sx: scale, sy: scale, sz: scale }));
  const streetCrowns: InstanceSpec[] = [];
  streetTreePositions.forEach(([x, z, scale], index) => {
    streetCrowns.push({ x: x - scale * .8, y: 5.8 + scale * 2.1, z: z - .4, sx: scale * 1.45, sy: scale * 1.05, sz: scale * 1.35, color: index % 3 === 0 ? "#375e3c" : index % 3 === 1 ? "#4b6e43" : "#2e5136" });
    streetCrowns.push({ x: x + scale * .9, y: 6.35 + scale * 2, z: z + .55, sx: scale * 1.28, sy: scale, sz: scale * 1.22, color: index % 2 ? "#496a3d" : "#365b39" });
    streetCrowns.push({ x: x + (index % 2 ? -.15 : .25), y: 7.25 + scale * 1.82, z: z - scale * .2, sx: scale * 1.12, sy: scale * .9, sz: scale * 1.08, color: index % 4 < 2 ? "#41683e" : "#31573a" });
  });
  addInstances("bronx-street-tree-network-trunks", new THREE.CylinderGeometry(.23, .36, 5.8, quality > .72 ? 10 : 7), materials.bark, streetTrunks);
  const streetLeafMaterial = new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .23, color: "#ffffff", roughness: .92, side: THREE.DoubleSide, vertexColors: true });
  addInstances("bronx-street-tree-network-canopies", new THREE.IcosahedronGeometry(2.2, quality > .72 ? 2 : 1), streetLeafMaterial, streetCrowns);

  const understorySpecs: InstanceSpec[] = [];
  for (let index = 0; index < (quality < .58 ? 48 : 92); index++) {
    const x = -118 + index * (450 / (quality < .58 ? 48 : 92)) + (streetTreeRandom() - .5) * 4;
    if (Math.abs(x - 18) < 19) continue;
    understorySpecs.push({ x, y: 1.35, z: 44 + streetTreeRandom() * 14, sx: 1.2 + streetTreeRandom(), sy: .72 + streetTreeRandom() * .32, sz: 1.1 + streetTreeRandom() * .8, color: index % 2 ? "#3c633e" : "#527447" });
  }
  const understoryMaterial = new THREE.MeshStandardMaterial({ map: textures.foliage, alphaTest: .24, color: "#ffffff", roughness: .95, side: THREE.DoubleSide, vertexColors: true });
  addInstances("bronx-zoo-to-city-layered-understory-transition", new THREE.IcosahedronGeometry(1, quality > .72 ? 2 : 1), understoryMaterial, understorySpecs);

  const viaduct = new THREE.Group();
  viaduct.name = "west-farms-elevated-subway-viaduct";
  const viaductDeck = new THREE.Mesh(new RoundedBoxGeometry(720, .92, 7.6, 4, .09), fireEscapeMaterial);
  viaductDeck.name = "west-farms-elevated-line-continuous-track-deck"; viaductDeck.position.set(0, 9.25, 78); viaduct.add(viaductDeck);
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(720, .28, .22, 3, .04), materials.iron);
    rail.name = "west-farms-elevated-line-safety-rail"; rail.position.set(0, 10.05, 78 + side * 3.55); viaduct.add(rail);
  }
  const columnSpecs: InstanceSpec[] = [];
  const crossBeamSpecs: InstanceSpec[] = [];
  for (let x = -344; x <= 345; x += 21.5) {
    columnSpecs.push({ x, y: 4.78, z: 78, sx: 1, sy: 8.5, sz: 1 });
    crossBeamSpecs.push({ x, y: 8.5, z: 78, sx: 7.5, sy: .45, sz: .55 });
  }
  const columns = new THREE.InstancedMesh(new THREE.CylinderGeometry(.32, .48, 1, 10), fireEscapeMaterial, columnSpecs.length);
  columns.name = "west-farms-elevated-line-grounded-columns";
  columnSpecs.forEach((spec, index) => { instanceDummy.position.set(spec.x, spec.y, spec.z); instanceDummy.rotation.set(0, 0, 0); instanceDummy.scale.set(spec.sx, spec.sy, spec.sz); instanceDummy.updateMatrix(); columns.setMatrixAt(index, instanceDummy.matrix); });
  columns.instanceMatrix.needsUpdate = true; viaduct.add(columns);
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), fireEscapeMaterial, crossBeamSpecs.length);
  beams.name = "west-farms-elevated-line-cross-beams";
  crossBeamSpecs.forEach((spec, index) => { instanceDummy.position.set(spec.x, spec.y, spec.z); instanceDummy.rotation.set(0, 0, 0); instanceDummy.scale.set(spec.sx, spec.sy, spec.sz); instanceDummy.updateMatrix(); beams.setMatrixAt(index, instanceDummy.matrix); });
  beams.instanceMatrix.needsUpdate = true; viaduct.add(beams);
  for (let x = -330; x <= 330; x += 43) {
    const leftBrace = cylinderBetween(new THREE.Vector3(x - 8, 1.1, 78), new THREE.Vector3(x, 8.72, 78), .115, fireEscapeMaterial, 7);
    leftBrace.name = "west-farms-elevated-line-cross-brace";
    const rightBrace = cylinderBetween(new THREE.Vector3(x + 8, 1.1, 78), new THREE.Vector3(x, 8.72, 78), .115, fireEscapeMaterial, 7);
    rightBrace.name = "west-farms-elevated-line-cross-brace";
    viaduct.add(leftBrace, rightBrace);
  }
  const platform = new THREE.Mesh(new RoundedBoxGeometry(88, .4, 11.4, 4, .07), sidewalkMaterial);
  platform.name = "west-farms-elevated-station-platform"; platform.position.set(-15, 10.1, 78); viaduct.add(platform);
  const canopy = new THREE.Mesh(new RoundedBoxGeometry(82, .34, 12.8, 5, .08), roofMaterial);
  canopy.name = "west-farms-elevated-station-canopy"; canopy.position.set(-15, 14, 78); viaduct.add(canopy);
  for (const x of [-52, -34, -16, 2, 20]) {
    const support = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 3.8, 10), materials.iron);
    support.position.set(x, 12, 78); viaduct.add(support);
  }
  const stationTexture = signTexture("WEST FARMS SQ", "2 · 5  E TREMONT AV · BRONX ZOO", "#f0d36a");
  ownedTextures.push(stationTexture);
  const elevatedSign = new THREE.Mesh(new RoundedBoxGeometry(13.5, 2.3, .2, 5, .06), new THREE.MeshBasicMaterial({ map: stationTexture, toneMapped: false }));
  elevatedSign.name = "west-farms-elevated-station-neighborhood-anchor-sign"; elevatedSign.position.set(-15, 12.15, 71.65); viaduct.add(elevatedSign);
  borough.add(viaduct);

  const elevatedTrain = new THREE.Group();
  elevatedTrain.name = "bronx-moving-elevated-subway-context-train";
  const trainBodyMaterial = new THREE.MeshStandardMaterial({ color: "#b9c2bd", metalness: .68, roughness: .34 });
  for (let carIndex = 0; carIndex < 5; carIndex++) {
    const car = new THREE.Mesh(new RoundedBoxGeometry(11.2, 2.55, 3.15, 5, .22), trainBodyMaterial);
    car.name = "bronx-elevated-context-train-car"; car.position.set(carIndex * 11.8, 0, 0); elevatedTrain.add(car);
    for (const side of [-1, 1]) for (let bay = 0; bay < 4; bay++) {
      const window = new THREE.Mesh(new RoundedBoxGeometry(1.7, .86, .08, 4, .04), windowMaterial);
      window.position.set(carIndex * 11.8 - 3.5 + bay * 2.35, .22, side * 1.61); elevatedTrain.add(window);
    }
  }
  borough.add(elevatedTrain);

  const lampSpecs: InstanceSpec[] = [];
  for (let z = 52; z < 466; z += quality < .58 ? 34 : 22) for (const x of [4.4, 31.6]) lampSpecs.push({ x, y: 3.55, z, sx: 1, sy: 1, sz: 1 });
  for (const z of [128, 190, 258, 332, 410]) for (let x = -320; x <= 322; x += quality < .58 ? 64 : 42) lampSpecs.push({ x, y: 3.55, z: z - 8.5, sx: 1, sy: 1, sz: 1 });
  for (let x = -620; x <= 620; x += quality < .58 ? 52 : 34) {
    if (Math.abs(x) < 94) continue;
    lampSpecs.push({ x, y: 3.55, z: 25.5, sx: 1, sy: 1, sz: 1 });
    lampSpecs.push({ x: x + 12, y: 3.55, z: 46.2, sx: 1, sy: 1, sz: 1 });
  }
  addInstances("bronx-streetlight-and-pedestrian-lamp-network", new THREE.CylinderGeometry(.07, .105, 7, 9), materials.iron, lampSpecs);
  const lampBulbMaterial = new THREE.MeshStandardMaterial({ color: "#ffe9b0", emissive: "#e3a94a", emissiveIntensity: 1.35, roughness: .22 });
  addInstances("bronx-streetlight-warm-lantern-network", new THREE.SphereGeometry(.19, 11, 8), lampBulbMaterial, lampSpecs.map(spec => ({ ...spec, y: 7.15, sx: 1, sy: 1, sz: 1 })));

  const hydrantSpecs: InstanceSpec[] = [];
  for (let z = 94; z < 450; z += 38) for (const x of [-98, 8, 100, 172]) hydrantSpecs.push({ x, y: 1.35, z, sx: 1, sy: 1, sz: 1, color: (z + x) % 3 ? "#b44734" : "#d0a42f" });
  const hydrantMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .58, metalness: .42, vertexColors: true });
  addInstances("bronx-curbside-fire-hydrant-network", new THREE.CylinderGeometry(.18, .25, .62, 10), hydrantMaterial, hydrantSpecs);

  // The first intersection needs close-range life as much as it needs a far
  // skyline. Planters, bins, news boxes, meters, and bike racks give the broad
  // arrival pavement human scale without blocking the playable gate route.
  const planterCenters = [-72, -48, 48, 72].map((x, index) => ({ x, y: 1.27, z: 48 + index % 2 * 7, sx: 3.2, sy: .55, sz: 1.15 }));
  addInstances("bronx-arrival-plaza-grounded-stone-planter", new RoundedBoxGeometry(1, 1, 1, 4, .08), sidewalkMaterial, planterCenters);
  const planterFoliageSpecs: InstanceSpec[] = [];
  planterCenters.forEach((planter, index) => {
    for (let tuft = 0; tuft < 5; tuft++) planterFoliageSpecs.push({
      x: planter.x - 1.18 + tuft * .58,
      y: 1.9 + (tuft % 2) * .16,
      z: planter.z + (tuft % 3 - 1) * .18,
      sx: .48 + (tuft % 2) * .12,
      sy: .62 + (tuft % 3) * .08,
      sz: .42 + (tuft % 2) * .1,
      color: (index + tuft) % 3 === 0 ? "#567a43" : (index + tuft) % 3 === 1 ? "#3e653c" : "#6d7f3e",
    });
  });
  addInstances("bronx-arrival-plaza-layered-planter-foliage", new THREE.IcosahedronGeometry(1, quality > .72 ? 2 : 1), streetLeafMaterial, planterFoliageSpecs);

  const furnitureSpecs: InstanceSpec[] = [];
  for (const x of [-236, -172, -108, 108, 172, 236]) {
    furnitureSpecs.push({ x, y: 1.58, z: x < 0 ? 27.2 : 44.3, sx: .72, sy: 1.12, sz: .66, color: x % 3 ? "#284d43" : "#7b493b" });
  }
  const furnitureMaterial = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: .58, metalness: .26, vertexColors: true });
  addInstances("bronx-arrival-city-newsbox-and-litter-bin-network", new RoundedBoxGeometry(1, 1, 1, 4, .08), furnitureMaterial, furnitureSpecs);
  const meterSpecs: InstanceSpec[] = [];
  for (const x of [-286, -222, -158, -94, 94, 158, 222, 286]) meterSpecs.push({ x, y: 1.72, z: x < 0 ? 45.2 : 26.1, sx: 1, sy: 1, sz: 1 });
  addInstances("bronx-arrival-curbside-parking-meter-network", new THREE.CylinderGeometry(.07, .1, 1.48, 9), fireEscapeMaterial, meterSpecs);
  const bikeRackMaterial = new THREE.MeshStandardMaterial({ color: "#5d6966", roughness: .42, metalness: .72 });
  for (const [rackX, rackZ] of [[-198, 27.1], [-194.5, 27.1], [196, 44.5], [199.5, 44.5]] as const) {
    const rack = new THREE.Mesh(new THREE.TorusGeometry(.68, .055, 8, 20, Math.PI), bikeRackMaterial);
    rack.name = "bronx-arrival-sidewalk-grounded-bicycle-rack";
    rack.position.set(rackX, 1.05, rackZ);
    borough.add(rack);
  }

  const shelterPositions = [[34, 113], [-92, 180], [106, 244], [178, 320], [-164, 398]] as const;
  shelterPositions.slice(0, quality < .58 ? 3 : shelterPositions.length).forEach(([x, z], index) => {
    const shelter = new THREE.Group(); shelter.name = `bronx-neighborhood-bus-shelter-${index + 1}`; shelter.position.set(x, 1.02, z);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(5.8, .22, 2.2, 4, .06), roofMaterial); roof.position.y = 3.1; shelter.add(roof);
    const back = new THREE.Mesh(new RoundedBoxGeometry(5.5, 2.8, .08, 4, .03), new THREE.MeshPhysicalMaterial({ color: "#9fc2c0", transparent: true, opacity: .34, roughness: .18, transmission: .1 })); back.position.set(0, 1.62, 1); shelter.add(back);
    for (const sx of [-2.55, 2.55]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.06, .08, 3.1, 8), materials.iron); post.position.set(sx, 1.55, 1); shelter.add(post); }
    const bench = new THREE.Mesh(new RoundedBoxGeometry(3.8, .18, .62, 4, .04), materials.wood); bench.position.set(0, .72, .65); shelter.add(bench); borough.add(shelter);
  });

  const utilityPoleMaterial = new THREE.MeshStandardMaterial({ color: "#4e4030", map: textures.bark, roughness: .98 });
  const utilityPoints: THREE.Vector3[] = [];
  for (let index = 0; index < 17; index++) {
    const z = 58 + index * 24;
    utilityPoints.push(new THREE.Vector3(-128, 7.3 + Math.sin(index * .72) * .18, z));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .2, 8.7, 9), utilityPoleMaterial);
    pole.name = "bronx-utility-pole-and-wire-network-pole"; pole.position.set(-128, 4.85, z); borough.add(pole);
    const arm = new THREE.Mesh(new RoundedBoxGeometry(2.7, .12, .12, 3, .03), utilityPoleMaterial); arm.position.set(-128, 8.45, z); borough.add(arm);
  }
  for (const offset of [-.72, 0, .72]) {
    const curve = new THREE.CatmullRomCurve3(utilityPoints.map(point => point.clone().add(new THREE.Vector3(offset, 1.05 - Math.abs(offset) * .25, 0))));
    const wire = new THREE.Mesh(new THREE.TubeGeometry(curve, 96, .028, 6, false), fireEscapeMaterial);
    wire.name = "bronx-utility-pole-and-wire-network-catenary"; borough.add(wire);
  }

  const trafficRed = new THREE.MeshStandardMaterial({ color: "#9b271f", emissive: "#e3392c", emissiveIntensity: 1.4, roughness: .28 });
  const trafficGreen = new THREE.MeshStandardMaterial({ color: "#255d36", emissive: "#4fd076", emissiveIntensity: .25, roughness: .28 });
  for (const z of [128, 190, 258, 332]) for (const side of [-1, 1]) {
    const signal = new THREE.Group(); signal.name = "bronx-signalized-city-intersection"; signal.position.set(18 + side * 15.5, .95, z - 8.5);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.075, .11, 5.7, 9), materials.iron); pole.position.y = 2.85; signal.add(pole);
    const arm = new THREE.Mesh(new RoundedBoxGeometry(5.4, .12, .12, 3, .025), materials.iron); arm.position.set(-side * 2.65, 5.55, 0); signal.add(arm);
    const housing = new THREE.Mesh(new RoundedBoxGeometry(.52, 1.45, .45, 4, .06), roofMaterial); housing.position.set(-side * 5, 5.05, 0); signal.add(housing);
    const red = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 7), trafficRed); red.position.set(-side * 5, 5.48, -.24); signal.add(red);
    const green = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 7), trafficGreen); green.position.set(-side * 5, 4.63, -.24); signal.add(green); borough.add(signal);
  }

  const horizonSpecs: InstanceSpec[] = [];
  const horizonRandom = seeded(249851);
  for (let index = 0; index < (quality < .58 ? 38 : 72); index++) {
    const rim = index % 3;
    const side = index % 2 ? -1 : 1;
    const x = rim === 0 ? -620 + horizonRandom() * 1240 : side * (650 + horizonRandom() * 96);
    const z = rim === 0 ? 650 + horizonRandom() * 84 : 82 + horizonRandom() * 600;
    const width = 18 + horizonRandom() * 34, depth = 18 + horizonRandom() * 28, height = 32 + horizonRandom() * 72;
    horizonSpecs.push({ x, y: 1 + height * .5, z, sx: width, sy: height, sz: depth, color: facadeColors[index % facadeColors.length] });
  }
  addInstances("bronx-distant-density-skyline-through-fog", new RoundedBoxGeometry(1, 1, 1, 3, .02), buildingMaterial, horizonSpecs);

  const trafficMotions: ArrivalVehicleMotion[] = [];
  const trafficRandom = seeded(930177);
  const carMaterials = ["#536f7a", "#8d4f43", "#d7c74a", "#ddd4c2", "#304b40", "#222727", "#7b6b85", "#a9a8a0"].map(color => new THREE.MeshPhysicalMaterial({ color, roughness: .48, clearcoat: .38, clearcoatRoughness: .32 }));
  const trafficHeadlampMaterial = new THREE.MeshStandardMaterial({ color: "#f2e1ab", emissive: "#ffe2a0", emissiveIntensity: 1.35, roughness: .22 });
  const trafficTailLampMaterial = new THREE.MeshStandardMaterial({ color: "#8c1c18", emissive: "#d82f25", emissiveIntensity: .82, roughness: .28 });
  const carCount = quality < .58 ? 10 : quality < .82 ? 15 : 22;
  for (let carIndex = 0; carIndex < carCount; carIndex++) {
    const car = new THREE.Group(); car.name = "bronx-animated-context-traffic";
    const delivery = carIndex % 7 === 0;
    const body = new THREE.Mesh(new RoundedBoxGeometry(delivery ? 2.25 : 2, delivery ? 1.55 : .7, delivery ? 5.5 : 4.25, 5, .16), carMaterials[carIndex % carMaterials.length]); body.position.y = delivery ? 1.04 : .64; car.add(body);
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(delivery ? 1.95 : 1.7, delivery ? .85 : .7, delivery ? 1.65 : 2.05, 5, .14), windowMaterial); cabin.position.set(0, delivery ? 1.78 : 1.16, delivery ? -1.5 : .05); car.add(cabin);
    const axleX = delivery ? 1.12 : 1.03;
    const axleZ = delivery ? 1.9 : 1.43;
    for (const wheelX of [-axleX, axleX]) for (const wheelZ of [-axleZ, axleZ]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .18, quality > .72 ? 14 : 9), materials.iron);
      wheel.name = "bronx-animated-context-traffic-ground-contact-wheel";
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wheelX, .35, wheelZ);
      car.add(wheel);
    }
    for (const lightX of [-.61, .61]) {
      const headlamp = new THREE.Mesh(new RoundedBoxGeometry(.34, .18, .08, 3, .035), trafficHeadlampMaterial);
      headlamp.name = "bronx-animated-context-traffic-headlamp";
      headlamp.position.set(lightX, delivery ? .96 : .67, delivery ? 2.78 : 2.16);
      car.add(headlamp);
      const tailLamp = new THREE.Mesh(new RoundedBoxGeometry(.32, .17, .08, 3, .03), trafficTailLampMaterial);
      tailLamp.name = "bronx-animated-context-traffic-tail-lamp";
      tailLamp.position.set(lightX, delivery ? .96 : .67, delivery ? -2.78 : -2.16);
      car.add(tailLamp);
    }
    const axis: "x" | "z" = carIndex < Math.ceil(carCount * .65) ? "z" : "x";
    const direction: 1 | -1 = carIndex % 2 ? -1 : 1;
    const lane = axis === "z" ? [14.2, 21.8, 86.8, 93.2, -39.2, -32.8, 158.8, 165.2][carIndex % 8] : [124.5, 131.5, 186.5, 193.5, 254.5, 261.5, 328.5, 335.5][carIndex % 8];
    trafficMotions.push({ root: car, axis, lane, start: axis === "z" ? 48 : -344, end: axis === "z" ? 468 : 344, speed: 7 + trafficRandom() * 7, phase: trafficRandom() * 610, direction });
    borough.add(car);
  }

  district.add(borough);
  root.add(district);
  const runtime: ZooArrivalDistrictRuntime = {
    update(elapsed) {
      trafficMotions.forEach(motion => {
        const span = motion.end - motion.start;
        const progress = THREE.MathUtils.euclideanModulo(elapsed * motion.speed + motion.phase, span);
        const position = motion.direction > 0 ? motion.start + progress : motion.end - progress;
        if (motion.axis === "z") motion.root.position.set(motion.lane, 1.02, position);
        else motion.root.position.set(position, 1.02, motion.lane);
        motion.root.rotation.y = motion.axis === "x" ? motion.direction > 0 ? Math.PI / 2 : -Math.PI / 2 : motion.direction > 0 ? 0 : Math.PI;
      });
      elevatedTrain.position.set(-360 + THREE.MathUtils.euclideanModulo(elapsed * 13.5 + 106, 780), 11.55, 78);
      trafficRed.emissiveIntensity = Math.sin(elapsed * .9) > 0 ? 1.55 : .18;
      trafficGreen.emissiveIntensity = Math.sin(elapsed * .9) > 0 ? .18 : 1.35;
    },
  };
  runtime.update(0);
  return runtime;
}

export class BronxZooWorld {
  readonly root = new THREE.Group();
  readonly spawn = new THREE.Vector3(0, 2.5, 25.5);
  readonly friendReviewSpawn = new THREE.Vector3(0, 1.48, -124.5);
  readonly entryReviewSpawn = new THREE.Vector3(-18, 1.48, 9.5);
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
  readonly worldBounds = Object.freeze({ minX: -84, maxX: 84, minZ: -158, maxZ: ZOO_WORLD_MAX_Z });
  readonly environmentSettings = Object.freeze({ cameraFar: 720, fogDensity: .0038, background: "#95aaa0" });
  readonly attendant: THREE.Group;
  readonly skateboardDonor: THREE.Group;
  readonly captiveSloths: THREE.Group[] = [];

  private ownedTextures: THREE.Texture[] = [];
  private readonly guestAgents: AmbientHumanAgent[] = [];
  private readonly animals: ZooAnimalRig[] = [];
  private readonly seaLionRigs: ZooAnimalRig[] = [];
  private readonly zebraRigs: ZooAnimalRig[] = [];
  private readonly flamingoRigs: ZooAnimalRig[] = [];
  private readonly bisonRigs: ZooAnimalRig[] = [];
  private seaLionEnrichmentTarget: THREE.Object3D | null = null;
  private monkeyEnrichmentTarget: THREE.Object3D | null = null;
  private tortoiseEnrichmentTarget: THREE.Object3D | null = null;
  private redPandaEnrichmentTarget: THREE.Object3D | null = null;
  private flamingoEnrichmentTarget: THREE.Object3D | null = null;
  private bisonEnrichmentTarget: THREE.Object3D | null = null;
  private tortoiseRig: ZooAnimalRig | null = null;
  private redPandaRig: ZooAnimalRig | null = null;
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
  private readonly habitatEvents: BronxZooEvent[] = [];
  private readonly completedAnimalQuests = new Set<ZooSideQuestId>();
  private readonly lastAnimalQuestOrders = new Map<ZooSideQuestId, string>();
  private readonly questStationVisuals: Map<string, HabitatQuestStationVisual>;
  private readonly arrivalDistrictMotion: ZooArrivalDistrictRuntime;
  private readonly sessionSeed: number;
  private activeAnimalQuest: ActiveInWorldZooQuest | null = null;
  private activeAnimalQuestConfig: ZooSideQuestConfig | null = null;
  private activeHabitatOperation: ActiveHabitatOperation | null = null;
  private habitatResearchStreak = 0;
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

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1, sessionSeed = Math.floor(Math.random() * 0x7fffffff)) {
    this.sessionSeed = sessionSeed;
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
    addZooPerimeterWorldContext(this.root, textures, quality);
    ZOO_VISITOR_PATHS.forEach(path => {
      addPathRibbon(this.root, path.points, path.width, materials.path, path.name);
      addPathDrainageEdges(this.root, path.points, path.width, materials.stone, path.name);
    });
    addStationExit(this.root, materials, textures, this.ownedTextures, quality);
    addArrivalFountain(this.root, materials, quality);
    addMuseumShuttleBus(this.root, materials, this.ownedTextures, quality);
    this.arrivalDistrictMotion = addZooArrivalDistrictBackdrop(this.root, materials, textures, this.ownedTextures, quality);
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

    this.questStationVisuals = addInWorldHabitatQuestStations(this.root, materials, quality, this.obstacles);
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
    this.skateboardDonor.position.set(
      this.skateboardDonorPosition.x,
      this.floorHeight(this.skateboardDonorPosition.x, this.skateboardDonorPosition.z),
      this.skateboardDonorPosition.z,
    );
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
      [-48, -37, 1.1, 33, 14, "#3d7180", "#493d35", "#583c31", "knit-chinos"],
      [48, -89, -1.7, 36, 13, "#b07842", "#2d3340", "#d2a17a", "cotton-denim"],
      [-9, -108, .2, 41, 19, "#607b52", "#302b36", "#906049", "silk-leggings"],
      [13, -54, -2.8, 44, 10, "#8b4d50", "#4a463e", "#724c39", "knit-chinos"],
      [4, -139, 3.05, 47, 12, "#4f667f", "#292d30", "#c18a68", "cotton-denim"],
    ] as const;
    guestData.slice(0, quality < .58 ? 6 : quality < .82 ? 9 : guestData.length).forEach((data, index) => {
      const result = makeVisitor(data[3], data[4], data[5], data[6], data[7], data[8], index % 3 === 1 ? "camera" : index % 3 === 2 ? "tote" : "backpack");
      result.root.name = `bronx-zoo-wandering-visitor-${index + 1}`;
      result.root.position.set(data[0], terrainHeight(data[0], data[1]), data[1]);
      result.root.rotation.y = data[2];
      this.root.add(result.root);
      this.ownedTextures.push(...result.ownedTextures);
      const axis = new THREE.Vector3(index % 2 ? -1 : .25, 0, index % 2 ? .18 : 1).normalize();
      const right = new THREE.Vector3(-axis.z, 0, axis.x);
      const origin = result.root.position.clone(), routeLength = 4.4 + index % 4 * .75, routeWidth = .9 + index % 3 * .35;
      this.guestAgents.push(createAmbientHumanAgent(result.root, {
        axis,
        waypoints: [
          origin,
          origin.clone().addScaledVector(axis, routeLength * .48).addScaledVector(right, routeWidth * .2),
          origin.clone().addScaledVector(axis, routeLength).addScaledVector(right, routeWidth),
          origin.clone().addScaledVector(axis, routeLength * .34).addScaledVector(right, routeWidth * 1.35),
        ],
        speed: .72 + index * .025,
        pauseSeconds: 2.5 + index * .37,
        pauseCount: 3,
        paceVariation: .07 + index % 4 * .025,
        phase: index * 2.1,
        lookAround: .13 + index % 4 * .035,
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
  get activeSideQuestId() { return this.activeAnimalQuest?.id ?? null; }
  get activeSideQuestProgress() {
    if (!this.activeAnimalQuest) return null;
    const control = this.activeHabitatFieldControl;
    return {
      calibrated: control?.ready ?? true,
      control,
      current: this.activeAnimalQuest.step + 1,
      operationActive: Boolean(this.activeHabitatOperation),
      operation: this.activeHabitatOperation?.progress ?? 0,
      replay: this.activeAnimalQuest.replay,
      tracking: this.activeHabitatOperation?.tracking ?? false,
      total: this.activeAnimalQuest.order.length,
    };
  }
  get activeHabitatFieldControl(): HabitatFieldControl | null {
    const calibration = this.activeHabitatOperation?.calibration;
    if (!calibration || calibration.kind === "passive") return null;
    const ready = this.habitatCalibrationReady(calibration);
    if (calibration.kind === "rope-tension") {
      const low = Math.round((calibration.target - .11) * 100);
      const high = Math.round((calibration.target + .11) * 100);
      return {
        hint: "Tap to feed measured tension into the live canopy line",
        options: [{ ariaLabel: "Pulse the monkey canopy tension wheel", code: "KeyE", label: "Pulse" }],
        ready,
        status: `TENSION ${Math.round(calibration.tension * 100)}% · SAFE ${low}–${high}%`,
      };
    }
    if (calibration.kind === "scent-vane") return {
      hint: "Turn the physical vane until the scent ribbon connects",
      options: [
        { ariaLabel: "Turn the red panda scent vane left", code: "KeyA", label: "Vane −" },
        { ariaLabel: "Turn the red panda scent vane right", code: "KeyD", label: "Vane +" },
      ],
      ready,
      status: `VANE ${calibration.direction + 1} / 4 · ${ready ? "SCENT LINE CONNECTED" : "SEEK THE CANOPY LINE"}`,
    };
    if (calibration.kind === "solar-mirror") return {
      hint: "Aim the real mirror until the next beam segment ignites",
      options: [
        { ariaLabel: "Rotate the tortoise warming mirror left", code: "KeyA", label: "Mirror −" },
        { ariaLabel: "Rotate the tortoise warming mirror right", code: "KeyD", label: "Mirror +" },
      ],
      ready,
      status: `MIRROR ${calibration.angle + 1} / 6 · ${ready ? "BEAM LOCKED" : "AIM AT THE WARMING STONE"}`,
    };
    return {
      hint: "Balance both live wetland readings with the three physical flows",
      options: [
        { ariaLabel: "Open the flamingo wetland intake", code: "Digit1", label: "Intake" },
        { ariaLabel: "Send fresh flow through the flamingo reed bed", code: "Digit2", label: "Fresh" },
        { ariaLabel: "Open the flamingo wetland drain", code: "Digit3", label: "Drain" },
      ],
      ready,
      status: `WATER ${Math.round(calibration.reading.water)} · SALT ${Math.round(calibration.reading.salinity)} · ${ready ? "HABITAT BAND" : "BALANCE 46–59 / 42–57"}`,
    };
  }
  get activeHabitatResponseTarget() {
    if (!this.activeAnimalQuest || !this.activeHabitatOperation) return null;
    const station = activeQuestStation(this.activeAnimalQuest);
    const visual = this.questStationVisuals.get(`${this.activeAnimalQuest.id}:${station.id}`);
    return visual?.response.root.getWorldPosition(new THREE.Vector3()) ?? null;
  }
  get researchStreak() { return this.habitatResearchStreak; }

  get objectiveTarget() {
    if (this.activeAnimalQuest) return activeQuestObjective(this.activeAnimalQuest).position;
    if (this.state === "ENTER_ZOO") return this.gatePosition.clone();
    if (this.state === "FIND_SLOTHS") return this.slothHabitatPosition.clone();
    return this.busBoardingPosition.clone();
  }

  get objectiveLabel() {
    if (this.activeAnimalQuest) {
      if (this.activeHabitatOperation) {
        const station = activeQuestStation(this.activeAnimalQuest);
        const operation = HABITAT_QUEST_OPERATIONS[station.kind];
        const control = this.activeHabitatFieldControl;
        const operationState = !this.activeHabitatOperation.tracking
          ? "FIND THE LIVE RESPONSE"
          : control && !control.ready
            ? control.status
            : "CALIBRATED · RESPONSE HELD";
        return `${operation.objective} · ${operationState}`;
      }
      return activeQuestObjective(this.activeAnimalQuest).objective;
    }
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
    if (this.activeAnimalQuest) {
      const station = activeQuestStation(this.activeAnimalQuest);
      const target = new THREE.Vector3(station.position[0], 1.48, station.position[1]);
      const distance = this.distanceXZ(player, target);
      if (this.activeHabitatOperation && distance <= 3.25) {
        const operation = HABITAT_QUEST_OPERATIONS[station.kind];
        const control = this.activeHabitatFieldControl;
        return {
          kind: "ANIMAL_QUEST_FOCUS",
          questId: this.activeAnimalQuest.id,
          label: !this.activeHabitatOperation.tracking
            ? `FIND THE LIVE RESPONSE · ${operation.focusLabel}`
            : control && !control.ready
              ? `${control.status} · ${control.hint}`
              : operation.focusLabel,
          target: this.activeHabitatResponseTarget ?? target,
          distance,
        };
      }
      if (distance <= 2.75) return { kind: "ANIMAL_QUEST_STEP", questId: this.activeAnimalQuest.id, label: station.action, target, distance };
    } else {
      const nearbyHabitat = habitatQuestAt(player, this.completedAnimalQuests);
      if (nearbyHabitat) return {
        kind: "ANIMAL_QUEST",
        questId: nearbyHabitat.definition.id,
        label: nearbyHabitat.replay
          ? `REVISIT ${nearbyHabitat.definition.routeLabel.toUpperCase()} · BUILD YOUR FIELD STREAK`
          : nearbyHabitat.definition.startPrompt,
        target: player.clone(),
        distance: 0,
      };
    }
    const habitatDistance = this.distanceXZ(player, this.slothHabitatPosition);
    if (!this.releasedFriends && habitatDistance <= 3.2) return { kind: "SLOTH_HABITAT", label: "PICK THE SIX-PIN SLOTH HABITAT LOCK", target: this.slothHabitatPosition.clone(), distance: habitatDistance };
    const boardingDistance = this.distanceXZ(player, this.busBoardingPosition);
    if (this.releasedFriends && boardingDistance <= 7.5) return { kind: "BUS_BOARDING", label: "BOARD MUSEUM SHUTTLE WITH YOUR WHOLE MENAGERIE", target: this.busBoardingPosition.clone(), distance: boardingDistance };
    return null;
  }

  private habitatCalibrationReady(calibration: HabitatCalibration) {
    if (calibration.kind === "passive") return true;
    if (calibration.kind === "rope-tension") return Math.abs(calibration.tension - calibration.target) <= .11;
    if (calibration.kind === "scent-vane") return calibration.direction === calibration.target;
    if (calibration.kind === "solar-mirror") return calibration.angle === calibration.target;
    return wetlandReadingSafe(calibration.reading);
  }

  private createHabitatCalibration(station: HabitatQuestStation): HabitatCalibration {
    const stationIndex = this.activeAnimalQuest?.order[this.activeAnimalQuest.step] ?? 0;
    const config = this.activeAnimalQuestConfig;
    if (station.kind === "rope-anchor" && config?.questId === "monkey-canopy-rig") {
      const target = .47 + config.anchorOffsets[stationIndex % config.anchorOffsets.length] * .1;
      return { feedback: 0, kind: "rope-tension", target, tension: Math.max(.12, target - .31) };
    }
    if (station.kind === "scent-vane" && config?.questId === "red-panda-scent-wind") return {
      direction: config.initialDirections[stationIndex % config.initialDirections.length],
      feedback: 0,
      kind: "scent-vane",
      target: config.solution[stationIndex % config.solution.length],
    };
    if (station.kind === "solar-mirror" && config?.questId === "tortoise-sun-trail") return {
      angle: config.initialAngles[stationIndex % config.initialAngles.length],
      feedback: 0,
      kind: "solar-mirror",
      target: config.solution[stationIndex % config.solution.length],
    };
    if (station.kind === "wetland-valve" && config?.questId === "flamingo-wetland-balance") return {
      drift: { water: config.waterDrift, salinity: config.salinityDrift },
      feedback: 0,
      kind: "wetland-balance",
      lastValve: null,
      reading: {
        water: THREE.MathUtils.clamp(config.initialWater + stationIndex * 1.7, 0, 100),
        salinity: THREE.MathUtils.clamp(config.initialSalinity - stationIndex * 1.3, 0, 100),
      },
    };
    return { kind: "passive" };
  }

  handleHabitatControl(code: string) {
    const calibration = this.activeHabitatOperation?.calibration;
    if (!calibration || calibration.kind === "passive") return false;
    if (calibration.kind === "rope-tension") {
      if (code !== "KeyE") return false;
      calibration.tension = THREE.MathUtils.clamp(calibration.tension + .19, 0, 1);
      calibration.feedback = 1;
      return true;
    }
    if (calibration.kind === "scent-vane") {
      if (code !== "KeyA" && code !== "KeyD") return false;
      calibration.direction = THREE.MathUtils.euclideanModulo(calibration.direction + (code === "KeyD" ? 1 : -1), 4);
      calibration.feedback = 1;
      return true;
    }
    if (calibration.kind === "solar-mirror") {
      if (code !== "KeyA" && code !== "KeyD") return false;
      calibration.angle = THREE.MathUtils.euclideanModulo(calibration.angle + (code === "KeyD" ? 1 : -1), 6);
      calibration.feedback = 1;
      return true;
    }
    const valve = code === "Digit1" ? "intake" : code === "Digit2" ? "fresh" : code === "Digit3" ? "drain" : null;
    if (!valve) return false;
    calibration.reading = operateWetlandValve(calibration.reading, valve);
    calibration.lastValve = valve;
    calibration.feedback = 1;
    return true;
  }

  beginAnimalQuest(id: ZooSideQuestId): BronxZooEvent | null {
    if (this.activeAnimalQuest) return null;
    const quest = ZOO_SIDE_QUESTS[id];
    const replay = this.completedAnimalQuests.has(id);
    const replaySeed = this.sessionSeed + this.habitatResearchStreak * 0x9e3779b1;
    let order = createInWorldZooQuestOrder(id, replaySeed);
    const previousOrder = this.lastAnimalQuestOrders.get(id);
    if (previousOrder === order.join(",") && order.length > 1) order = [...order.slice(1), order[0]];
    this.lastAnimalQuestOrders.set(id, order.join(","));
    this.activeAnimalQuest = { id, order, replay, step: 0 };
    this.activeAnimalQuestConfig = createZooSideQuestConfig(id, seeded(replaySeed ^ 0x51f15e));
    this.activeHabitatOperation = null;
    const route = activeQuestObjective(this.activeAnimalQuest);
    return {
      kind: "ANIMAL_QUEST_STARTED",
      questId: id,
      step: 1,
      stepCount: this.activeAnimalQuest.order.length,
      message: replay
        ? `${quest.title} field replay started with a new route. ${route.objective} Follow each physical response through the habitat to extend your research streak.`
        : `${quest.title} is now live in the habitat. ${route.objective} Follow the numbered field station, then track what its equipment sets in motion.`,
    };
  }

  private habitatFocusAligned(player: THREE.Vector3, yaw: number, target?: THREE.Vector3, minimumDot = .5) {
    if (!this.activeAnimalQuest) return false;
    const center = IN_WORLD_ZOO_QUESTS[this.activeAnimalQuest.id].center;
    const toHabitatX = (target?.x ?? center[0]) - player.x;
    const toHabitatZ = (target?.z ?? center[1]) - player.z;
    const length = Math.hypot(toHabitatX, toHabitatZ) || 1;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    return (forwardX * toHabitatX + forwardZ * toHabitatZ) / length >= minimumDot;
  }

  private finishActiveHabitatStation(): BronxZooEvent | null {
    if (!this.activeAnimalQuest) return null;
    const quest = this.activeAnimalQuest;
    const station = activeQuestStation(quest);
    const completedStep = quest.step + 1;
    const stepCount = quest.order.length;
    this.activeHabitatOperation = null;
    if (completedStep >= stepCount) {
      const firstCompletion = !this.completedAnimalQuests.has(quest.id);
      this.activeAnimalQuest = null;
      this.activeAnimalQuestConfig = null;
      this.habitatResearchStreak++;
      this.completeAnimalQuest(quest.id);
      return {
        kind: "ANIMAL_QUEST_COMPLETED",
        firstCompletion,
        questId: quest.id,
        step: stepCount,
        stepCount,
        message: firstCompletion
          ? `${station.confirmation} ${ZOO_SIDE_QUESTS[quest.id].title} complete · research streak ${this.habitatResearchStreak}. The habitat remains alive for future field replays.`
          : `${station.confirmation} Field replay complete · research streak ${this.habitatResearchStreak}. A new route will be waiting on the next visit.`,
      };
    }
    quest.step++;
    const next = activeQuestObjective(quest);
    return {
      kind: "ANIMAL_QUEST_ADVANCED",
      questId: quest.id,
      step: completedStep,
      stepCount,
      message: `${station.confirmation} Field observation captured. Next: ${next.objective}`,
    };
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
    if (hint.kind === "ANIMAL_QUEST" && hint.questId) return this.beginAnimalQuest(hint.questId);
    if (hint.kind === "ANIMAL_QUEST_FOCUS") return null;
    if (hint.kind === "ANIMAL_QUEST_STEP" && hint.questId && this.activeAnimalQuest?.id === hint.questId) {
      const station = activeQuestStation(this.activeAnimalQuest);
      const operation = HABITAT_QUEST_OPERATIONS[station.kind];
      if (!this.habitatFocusAligned(player, yaw)) {
        return {
          kind: "ANIMAL_QUEST_FOCUS_REQUIRED",
          questId: hint.questId,
          step: this.activeAnimalQuest.step + 1,
          stepCount: this.activeAnimalQuest.order.length,
          message: `Use the station from here, then face the live enclosure. ${operation.objective}.`,
        };
      }
      this.activeHabitatOperation = {
        calibration: this.createHabitatCalibration(station),
        key: `${this.activeAnimalQuest.id}:${station.id}`,
        progress: 0,
        tracking: true,
      };
      const response = this.questStationVisuals.get(this.activeHabitatOperation.key)?.response;
      if (response) {
        response.root.position.copy(response.start);
        response.root.visible = true;
      }
      return {
        kind: "ANIMAL_QUEST_OPERATION_STARTED",
        questId: hint.questId,
        step: this.activeAnimalQuest.step + 1,
        stepCount: this.activeAnimalQuest.order.length,
        message: `${station.action}. ${this.activeHabitatFieldControl ? `${this.activeHabitatFieldControl.hint}. ` : ""}The habitat is responding now — ${operation.objective.toLowerCase()} all the way through.`,
      };
    }
    return { kind: "LOCK_PICKING_STARTED", message: "Keep plug tension between 40% and 60%, then find the six pins in binding order." };
  }

  completeAnimalQuest(questId: ZooSideQuestId) {
    this.completedAnimalQuests.add(questId);
    return ZOO_SIDE_QUESTS[questId].recruitedSpecies;
  }

  consumeGaryEvent() { return this.garyEvents.shift() ?? null; }
  consumeHabitatEvent() { return this.habitatEvents.shift() ?? null; }

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
  busBoardingReached(player: THREE.Vector3, distance = 7.5) { return this.releasedFriends && this.distanceXZ(player, this.busBoardingPosition) <= distance; }
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
      else if (obstacle.kind === "box") this.resolveBox(player, velocity, obstacle);
      else this.resolveOrientedBox(player, velocity, obstacle);
    }
    player.y = this.floorHeight(player.x, player.z) + 1.48;
  }

  resolveCompanion(position: THREE.Vector3, velocity: THREE.Vector3, radius: number) {
    position.x = THREE.MathUtils.clamp(position.x, this.worldBounds.minX + radius, this.worldBounds.maxX - radius);
    position.z = THREE.MathUtils.clamp(position.z, this.worldBounds.minZ + radius, this.worldBounds.maxZ - radius);
    for (const obstacle of this.obstacles) {
      if (obstacle.enabled && !obstacle.enabled()) continue;
      if (obstacle.kind === "circle") this.resolveCircle(position, velocity, obstacle, radius);
      else if (obstacle.kind === "box") this.resolveBox(position, velocity, obstacle, radius);
      else this.resolveOrientedBox(position, velocity, obstacle, radius);
    }
    position.y = this.floorHeight(position.x, position.z);
  }

  update(elapsed: number, delta = 1 / 60, player?: THREE.Vector3, yaw = 0) {
    if (this.hasAdmissionTicket && this.state === "ENTER_ZOO" && player && player.z < -10.5) this.state = "FIND_SLOTHS";
    const gateOpen = this.hasAdmissionTicket ? 1 : 0;
    this.entryGateLeaves.forEach(leaf => {
      const target = gateOpen * Number(leaf.userData.openRotation ?? 0);
      leaf.rotation.y += (target - leaf.rotation.y) * (1 - Math.exp(-delta * 4.5));
    });
    this.keeperDoorLeaves.forEach((leaf, index) => {
      const target = this.releasedFriends ? (index ? -1.42 : 1.42) : 0;
      leaf.rotation.y += (target - leaf.rotation.y) * (1 - Math.exp(-delta * 4.8));
    });
    idleAuthoredHuman(this.attendant, delta);
    idleAuthoredHuman(this.skateboardDonor, delta);
    this.guestAgents.forEach(agent => updateAmbientHumanAgent(agent, elapsed, delta));
    this.arrivalDistrictMotion.update(elapsed);
    this.updateHabitatOperation(delta, player, yaw);
    this.updateHabitatQuestStations(elapsed);
    this.animals.forEach(animal => animal.update(elapsed, delta));
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

  private updateHabitatOperation(delta: number, player?: THREE.Vector3, yaw = 0) {
    if (!this.activeAnimalQuest || !this.activeHabitatOperation || !player) return;
    const station = activeQuestStation(this.activeAnimalQuest);
    const stationKey = `${this.activeAnimalQuest.id}:${station.id}`;
    if (this.activeHabitatOperation.key !== stationKey) {
      this.activeHabitatOperation = null;
      return;
    }
    const operation = HABITAT_QUEST_OPERATIONS[station.kind];
    const distance = Math.hypot(player.x - station.position[0], player.z - station.position[1]);
    const responseTarget = this.activeHabitatResponseTarget;
    const tracking = distance <= 3.25 && Boolean(responseTarget) && this.habitatFocusAligned(player, yaw, responseTarget ?? undefined, .955);
    const calibration = this.activeHabitatOperation.calibration;
    if (calibration.kind !== "passive") calibration.feedback = Math.max(0, calibration.feedback - delta * 3.4);
    if (calibration.kind === "rope-tension") calibration.tension = Math.max(0, calibration.tension - delta * (tracking ? .058 : .032));
    else if (calibration.kind === "wetland-balance") calibration.reading = {
      water: THREE.MathUtils.clamp(calibration.reading.water + calibration.drift.water * delta, 0, 100),
      salinity: THREE.MathUtils.clamp(calibration.reading.salinity + calibration.drift.salinity * delta, 0, 100),
    };
    const engaged = tracking && this.habitatCalibrationReady(calibration);
    this.activeHabitatOperation.tracking = tracking;
    this.activeHabitatOperation.progress = THREE.MathUtils.clamp(
      this.activeHabitatOperation.progress + delta / operation.duration * (engaged ? 1 : -.16),
      0,
      1,
    );
    if (this.activeHabitatOperation.progress >= 1) {
      const event = this.finishActiveHabitatStation();
      if (event) this.habitatEvents.push(event);
    }
  }

  private updateHabitatQuestStations(elapsed: number) {
    const activeStation = this.activeAnimalQuest ? activeQuestStation(this.activeAnimalQuest) : null;
    const activeKey = this.activeAnimalQuest && activeStation ? `${this.activeAnimalQuest.id}:${activeStation.id}` : "";
    this.questStationVisuals.forEach((visual, key) => {
      const activeRouteIndex = this.activeAnimalQuest?.id === visual.questId
        ? this.activeAnimalQuest.order.indexOf(visual.stationIndex)
        : -1;
      const routeStepComplete = activeRouteIndex >= 0 && activeRouteIndex < (this.activeAnimalQuest?.step ?? 0);
      const completed = routeStepComplete || (
        this.completedAnimalQuests.has(visual.questId) && this.activeAnimalQuest?.id !== visual.questId
      );
      const active = key === activeKey;
      visual.indicator.color.set(completed ? "#8fd49a" : active ? "#ffe27b" : "#9d936f");
      visual.indicator.emissive.set(completed ? "#3d9c57" : active ? "#f0a72b" : "#493b18");
      visual.indicator.emissiveIntensity = completed ? .42 : active ? .78 + Math.sin(elapsed * 5.2) * .18 : .08;
      visual.root.userData.questStationState = completed ? "complete" : active ? "active" : "available";
      const operating = active && this.activeHabitatOperation?.key === key;
      const progress = operating ? this.activeHabitatOperation?.progress ?? 0 : completed ? 1 : 0;
      const calibration = operating ? this.activeHabitatOperation?.calibration ?? null : null;
      visual.root.userData.sustainedFocusProgress = progress;
      visual.root.userData.fieldCalibrationKind = calibration?.kind ?? "none";
      visual.root.userData.fieldCalibrationReady = calibration ? this.habitatCalibrationReady(calibration) : completed;
      visual.progressHalo.visible = operating;
      visual.progressMaterial.opacity = operating ? .42 + progress * .48 : 0;
      visual.progressHalo.scale.setScalar(.42 + progress * .58);
      visual.progressHalo.rotation.z = elapsed * .72;
      visual.mechanism.position.y = 0;
      visual.mechanism.rotation.set(0, 0, 0);
      visual.response.root.visible = operating;
      if (visual.response.link) visual.response.link.visible = operating;
      visual.response.root.scale.setScalar(1);
      visual.response.root.rotation.set(0, visual.response.facingYaw, 0);
      if (operating) {
        const responseProgress = THREE.MathUtils.smoothstep(progress, 0, 1);
        visual.response.root.position.lerpVectors(visual.response.start, visual.response.end, responseProgress);
        visual.response.root.position.addScaledVector(visual.response.pathBend, Math.sin(responseProgress * Math.PI));
        if (visual.kind === "bird-perch") {
          visual.response.root.position.y += Math.sin(responseProgress * Math.PI) * 1.05;
          visual.response.root.scale.setScalar(1 + Math.sin(elapsed * 7.4) * .07);
          visual.response.root.rotation.y += Math.sin(elapsed * .9) * .08;
        } else if (visual.kind === "buoy-dock") {
          visual.response.root.position.y += Math.sin(elapsed * 4.2) * .09;
          visual.response.root.rotation.y += elapsed * .42;
        } else if (visual.kind === "rope-anchor") {
          visual.response.root.position.y += Math.sin(responseProgress * Math.PI) * .5;
          visual.response.root.rotation.z = Math.sin(elapsed * 6.1) * .045;
        } else if (visual.kind === "stripe-scanner") {
          const zebra = this.zebraRigs[visual.stationIndex % this.zebraRigs.length];
          if (zebra) {
            visual.response.root.position.copy(zebra.root.position);
            visual.response.root.position.y += 1.28 + Math.sin(elapsed * 2.2) * .06;
            visual.response.root.rotation.y = zebra.root.rotation.y;
            visual.response.root.userData.liveAnimalTarget = zebra.root.name;
          }
        } else if (visual.kind === "scent-vane") {
          visual.response.root.position.y += Math.sin(elapsed * 2.1) * .025;
          visual.response.root.rotation.y += elapsed * .34;
          visual.response.root.children.forEach(child => {
            if (child.name !== "red-panda-live-scent-ribbon-mote") return;
            child.position.y = Number(child.userData.restingRibbonY ?? 0) + Math.sin(elapsed * 2.4 + Number(child.userData.ribbonPhase ?? 0)) * .08;
          });
        } else if (visual.kind === "solar-mirror") {
          visual.response.root.scale.setScalar(.84 + responseProgress * .34 + Math.sin(elapsed * 5.5) * .04);
          visual.response.root.rotation.y += elapsed * .18;
        } else if (visual.kind === "wetland-valve") {
          visual.response.root.position.y += Math.sin(elapsed * 3.6) * .035;
          visual.response.root.scale.setScalar(.9 + responseProgress * .22);
        } else {
          visual.response.root.position.y += Math.sin(responseProgress * Math.PI) * 3.8;
          visual.response.root.rotation.z = -responseProgress * Math.PI * 1.2;
        }
        visual.response.root.userData.trackingProgress = progress;
        if (visual.response.link && visual.response.linkStart) {
          const positions = visual.response.link.geometry.getAttribute("position") as THREE.BufferAttribute;
          positions.setXYZ(0, visual.response.linkStart.x, visual.response.linkStart.y, visual.response.linkStart.z);
          positions.setXYZ(1, visual.response.root.position.x, visual.response.root.position.y, visual.response.root.position.z);
          positions.needsUpdate = true;
        }
      }
      if (operating || completed) {
        const motion = completed
          ? 1
          : calibration?.kind === "rope-tension"
            ? calibration.tension
            : calibration?.kind === "wetland-balance"
              ? calibration.reading.water / 100
              : progress;
        const feedback = calibration && calibration.kind !== "passive" ? calibration.feedback : 0;
        const pulse = operating ? Math.sin(elapsed * 8) * .05 + feedback * .08 : 0;
        if (visual.kind === "rope-anchor" || visual.kind === "wetland-valve") visual.mechanism.rotation.z = motion * Math.PI * 1.5 + pulse;
        else if (visual.kind === "scent-vane") visual.mechanism.rotation.y = calibration?.kind === "scent-vane" ? calibration.direction * Math.PI / 2 + pulse : motion * Math.PI * .72 + pulse;
        else if (visual.kind === "solar-mirror") {
          visual.mechanism.rotation.y = calibration?.kind === "solar-mirror" ? calibration.angle * Math.PI / 3 : motion * Math.PI * .72;
          visual.mechanism.rotation.x = -.16 + pulse;
        }
        else if (visual.kind === "buoy-dock") visual.mechanism.position.y = Math.sin(elapsed * 4.8) * .08 * motion;
        else if (visual.kind === "stripe-scanner") visual.mechanism.rotation.y = Math.sin(elapsed * 2.5) * .18 * motion;
        else if (visual.kind === "bird-perch") visual.mechanism.rotation.x = Math.sin(elapsed * 5.4) * .07 * motion;
        else visual.mechanism.rotation.z = Math.sin(elapsed * 7.2) * .06 * motion;
      }
    });
    const seaLionResponse = this.activeAnimalQuest?.id === "sea-lion-current" && this.activeHabitatOperation
      ? this.questStationVisuals.get(this.activeHabitatOperation.key)?.response.root ?? null
      : null;
    this.updateSeaLionEnrichmentTarget(seaLionResponse);
    const monkeyResponse = this.activeAnimalQuest?.id === "monkey-canopy-rig" && this.activeHabitatOperation
      ? this.questStationVisuals.get(this.activeHabitatOperation.key)?.response.root ?? null
      : null;
    this.updateMonkeyEnrichmentTarget(monkeyResponse);
    const tortoiseResponse = this.activeAnimalQuest?.id === "tortoise-sun-trail" && this.activeHabitatOperation
      ? this.questStationVisuals.get(this.activeHabitatOperation.key)?.response.root ?? null
      : null;
    this.updateTortoiseEnrichmentTarget(tortoiseResponse);
    const redPandaResponse = this.activeAnimalQuest?.id === "red-panda-scent-wind" && this.activeHabitatOperation
      ? this.questStationVisuals.get(this.activeHabitatOperation.key)?.response.root ?? null
      : null;
    this.updateRedPandaEnrichmentTarget(redPandaResponse);
    const flamingoResponse = this.activeAnimalQuest?.id === "flamingo-wetland-balance" && this.activeHabitatOperation
      ? this.questStationVisuals.get(this.activeHabitatOperation.key)?.response.root ?? null
      : null;
    this.updateFlamingoEnrichmentTarget(flamingoResponse);
    const bisonResponse = this.activeAnimalQuest?.id === "bison-prairie-seeding" && this.activeHabitatOperation
      ? this.questStationVisuals.get(this.activeHabitatOperation.key)?.response.root ?? null
      : null;
    this.updateBisonEnrichmentTarget(bisonResponse);
  }

  private updateSeaLionEnrichmentTarget(target: THREE.Object3D | null) {
    if (target === this.seaLionEnrichmentTarget) return;
    this.seaLionEnrichmentTarget = target;
    const travel = target?.userData.responseTravelDirection as [number, number] | undefined;
    const directionX = travel?.[0] ?? 0, directionZ = travel?.[1] ?? -1;
    const rightX = -directionZ, rightZ = directionX;
    this.seaLionRigs.forEach((rig, index) => {
      const lateral = index === 0 ? -.72 : .72;
      const trailing = index === 0 ? .68 : 2.72;
      setZooAnimalEnrichmentDirective(rig, target ? {
        heading: [directionX, directionZ],
        motion: index === 0 ? "swim" : "surface",
        offset: [rightX * lateral - directionX * trailing, index === 0 ? -.9 : -.84, rightZ * lateral - directionZ * trailing],
        responsiveness: index === 0 ? 2.45 : 2.05,
        target,
      } : null);
    });
  }

  private updateMonkeyEnrichmentTarget(target: THREE.Object3D | null) {
    this.monkeyEnrichmentTarget = target;
  }

  private updateTortoiseEnrichmentTarget(target: THREE.Object3D | null) {
    if (target === this.tortoiseEnrichmentTarget) return;
    this.tortoiseEnrichmentTarget = target;
    if (!this.tortoiseRig) return;
    setZooAnimalEnrichmentDirective(this.tortoiseRig, target ? {
      motion: "walk",
      offset: [0, -.48, 0],
      responsiveness: .12,
      target,
    } : null);
  }

  private updateRedPandaEnrichmentTarget(target: THREE.Object3D | null) {
    if (target === this.redPandaEnrichmentTarget) return;
    this.redPandaEnrichmentTarget = target;
    if (!this.redPandaRig) return;
    setZooAnimalEnrichmentDirective(this.redPandaRig, target ? {
      motion: "walk",
      offset: [0, -.25, 0],
      responsiveness: .72,
      target,
    } : null);
  }

  private updateFlamingoEnrichmentTarget(target: THREE.Object3D | null) {
    if (target === this.flamingoEnrichmentTarget) return;
    this.flamingoEnrichmentTarget = target;
    const travel = target?.userData.responseTravelDirection as [number, number] | undefined;
    const directionX = travel?.[0] ?? 0, directionZ = travel?.[1] ?? -1;
    const rightX = -directionZ, rightZ = directionX;
    this.flamingoRigs.forEach((rig, index) => {
      const lateral = (index - 1) * 1.24;
      const trailing = .82 + index * .72;
      setZooAnimalEnrichmentDirective(rig, target ? {
        grounded: true,
        heading: [directionX, directionZ],
        motion: "walk",
        offset: [rightX * lateral - directionX * trailing, 0, rightZ * lateral - directionZ * trailing],
        responsiveness: 1.42 - index * .12,
        target,
      } : null);
    });
  }

  private updateBisonEnrichmentTarget(target: THREE.Object3D | null) {
    if (target === this.bisonEnrichmentTarget) return;
    this.bisonEnrichmentTarget = target;
    const travel = target?.userData.responseTravelDirection as [number, number] | undefined;
    const directionX = travel?.[0] ?? 0, directionZ = travel?.[1] ?? -1;
    const rightX = -directionZ, rightZ = directionX;
    this.bisonRigs.forEach((rig, index) => {
      const lateral = index ? 1.25 : -1.05;
      const trailing = index ? 2.8 : 1.05;
      setZooAnimalEnrichmentDirective(rig, target ? {
        grounded: true,
        heading: [directionX, directionZ],
        motion: "walk",
        offset: [rightX * lateral - directionX * trailing, 0, rightZ * lateral - directionZ * trailing],
        responsiveness: index ? .42 : .58,
        target,
      } : null);
    });
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
    this.updateSeaLionEnrichmentTarget(null);
    this.updateMonkeyEnrichmentTarget(null);
    this.updateTortoiseEnrichmentTarget(null);
    this.updateRedPandaEnrichmentTarget(null);
    this.updateFlamingoEnrichmentTarget(null);
    this.updateBisonEnrichmentTarget(null);
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
      pivot.userData.openRotation = -side * 1.36;
      // Admission is already valid when this streamed world is constructed.
      // Start at the authoritative state so debug/Strict Mode initialization
      // cannot visibly replay a closed-to-open gate animation.
      pivot.rotation.y = this.hasAdmissionTicket ? pivot.userData.openRotation : 0;
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
    addHabitatLabel(this.root, this.ownedTextures, materials, "WORLD OF BIRDS · MANGO", "MANGO · SUN CONURE · Thanks to generous support by v1nmon", -31, -39, -.74, this.obstacles);
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
    this.obstacles.push({ kind: "oriented-box", x: 28.6, z: -36.8, halfWidth: 1.66, halfDepth: .26, yaw: -2.12 });
    addHabitatLabel(this.root, this.ownedTextures, materials, "POLAR BEAR", "GARY · ARCTIC CONSERVATION", 32, -61.5, -.15, this.obstacles);
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
    this.seaLionRigs.push(
      placeAnimal(this.root, this.animals, createSeaLion(textures, quality, 0), -2.5, -76, .7, .12, { mode: "aquatic", radius: 2.8, speed: .34, phase: .7 }),
      placeAnimal(this.root, this.animals, createSeaLion(textures, quality, 1), 3.2, -78.5, -1.4, .18, { mode: "aquatic", radius: 2.2, speed: .29, phase: 4.1 }),
    );
    addHabitatLabel(this.root, this.ownedTextures, materials, "SEA LION POOL", "CALIFORNIA SEA LIONS", -9, -65, -.2, this.obstacles);
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
    let lastLiveRigState = "climb";
    let lastLiveRigTime = -Infinity;
    const contactAnimatedCanopy: ZooAnimalRig = {
      root: perched.root,
      ownedTextures: perched.ownedTextures,
      update: (elapsed, delta) => {
        // A fixed-root contact schedule keeps every state on its measured
        // support. Distinct state speeds and the non-zero behavior phase stop
        // this animal synchronizing with either ground walker.
        const cycle = ((elapsed * .83 + 2.6) % 24 + 24) % 24;
        const state = cycle < 10.2 ? "perch" : cycle < 16.4 ? "climb" : "swing";
        const ambientAnimationSpeed = state === "perch" ? .78 : state === "climb" ? .93 : 1.07;
        const liveRigTarget = this.monkeyEnrichmentTarget;
        if (liveRigTarget) {
          lastLiveRigState = Number(liveRigTarget.userData.trackingProgress ?? 0) < .55 ? "climb" : "swing";
          lastLiveRigTime = elapsed;
          perched.root.userData.enrichmentTargetName = liveRigTarget.name;
        } else delete perched.root.userData.enrichmentTargetName;
        const settlingFromLiveRig = elapsed - lastLiveRigTime < .65;
        const activeState = liveRigTarget || settlingFromLiveRig
          ? lastLiveRigState
          : state;
        perched.root.userData.enrichmentActive = Boolean(liveRigTarget);
        perched.root.userData.animationState = activeState;
        perched.root.userData.animationSpeed = activeState === state
          ? ambientAnimationSpeed
          : activeState === "climb" ? .93 : 1.07;
        perched.root.userData.activeContactSupport = activeState === "perch"
          ? "foot-and-hand-branches"
          : activeState === "climb"
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
    addHabitatLabel(this.root, this.ownedTextures, materials, "MONKEY FOREST", "GEOFFROY'S SPIDER MONKEYS", -31, -89, -.75, this.obstacles);
  }

  private addZebraHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const x = 43, z = -101, radius = 15.5;
    addCircularFence(this.root, materials, x, z, radius, quality > .72 ? 28 : 20);
    const plains = new THREE.Group();
    plains.name = "bronx-zoo-layered-zebra-grassland-habitat";
    const grassland = new THREE.Mesh(
      new THREE.CylinderGeometry(radius - .65, radius - .45, .06, quality > .72 ? 56 : 36),
      new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .085, color: "#8c8555", roughness: .99 }),
    );
    grassland.name = "zebra-drained-native-grassland-substrate";
    grassland.position.set(x, terrainHeight(x, z) + .01, z);
    grassland.receiveShadow = true;
    plains.add(grassland);

    const random = seeded(413901);
    const clumpCount = quality < .58 ? 22 : 38;
    const grassCount = clumpCount * 3;
    const tallGrass = new THREE.InstancedMesh(
      new THREE.ConeGeometry(.035, .58, 4),
      new THREE.MeshStandardMaterial({ color: "#c0ae68", roughness: 1, vertexColors: true }),
      grassCount,
    );
    tallGrass.name = "zebra-instanced-native-bunchgrass-edge";
    const dummy = new THREE.Object3D();
    const grassPalette = [new THREE.Color("#b6a45f"), new THREE.Color("#887f49"), new THREE.Color("#6f7546")];
    let clumpX = 0, clumpZ = 0;
    for (let index = 0; index < grassCount; index++) {
      if (index % 3 === 0) {
        const angle = random() * Math.PI * 2, patchRadius = 5.4 + random() * 8.35;
        clumpX = x + Math.cos(angle) * patchRadius;
        clumpZ = z + Math.sin(angle) * patchRadius;
      }
      const gx = clumpX + (random() - .5) * .23, gz = clumpZ + (random() - .5) * .23;
      dummy.position.set(gx, terrainHeight(gx, gz) + .27, gz);
      dummy.rotation.set((random() - .5) * .13, random() * Math.PI * 2, (random() - .5) * .16);
      dummy.scale.set(.78 + random() * .5, .72 + random() * .65, .78 + random() * .5);
      dummy.updateMatrix();
      tallGrass.setMatrixAt(index, dummy.matrix);
      tallGrass.setColorAt(index, grassPalette[index % grassPalette.length]);
    }
    tallGrass.instanceMatrix.needsUpdate = true;
    if (tallGrass.instanceColor) tallGrass.instanceColor.needsUpdate = true;
    tallGrass.castShadow = quality > .72;
    plains.add(tallGrass);

    const shadeRoof = new THREE.Mesh(
      new RoundedBoxGeometry(6.4, .16, 4.4, 5, .08),
      new THREE.MeshStandardMaterial({ color: "#b8a77e", roughness: .9, side: THREE.DoubleSide }),
    );
    shadeRoof.name = "zebra-weathered-field-shade-roof";
    shadeRoof.position.set(48.7, terrainHeight(48.7, -110.2) + 3.2, -110.2);
    shadeRoof.rotation.z = -.055;
    shadeRoof.castShadow = true;
    plains.add(shadeRoof);
    for (const px of [46.1, 51.3]) for (const pz of [-108.7, -111.7]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.09, .13, 3.1, 10), materials.wood);
      post.name = "zebra-shade-load-bearing-post";
      post.position.set(px, terrainHeight(px, pz) + 1.55, pz);
      post.castShadow = true;
      plains.add(post);
    }
    const trough = new THREE.Mesh(new RoundedBoxGeometry(3.8, .46, 1.18, 5, .12), materials.stone);
    trough.name = "zebra-grounded-stone-water-trough";
    trough.position.set(34.6, terrainHeight(34.6, -106.3) + .24, -106.3);
    trough.rotation.y = -.22;
    trough.castShadow = trough.receiveShadow = true;
    plains.add(trough);
    const troughWater = new THREE.Mesh(new RoundedBoxGeometry(3.26, .055, .69, 4, .05), materials.water);
    troughWater.name = "zebra-trough-visible-water-surface";
    troughWater.position.copy(trough.position).add(new THREE.Vector3(0, .245, 0));
    troughWater.rotation.y = trough.rotation.y;
    plains.add(troughWater);
    for (const [px, pz] of [[52.5, -97.4], [34.8, -96.2]] as const) {
      const brush = new THREE.Mesh(new THREE.CylinderGeometry(.2, .24, 1.85, 12), materials.wood);
      brush.name = "zebra-natural-rubbing-and-scent-post";
      brush.position.set(px, terrainHeight(px, pz) + .925, pz);
      brush.rotation.z = px > x ? .08 : -.1;
      plains.add(brush);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.27, 12, 8), new THREE.MeshStandardMaterial({ color: "#706042", roughness: .93 }));
      cap.name = "zebra-mineral-lick-cap";
      cap.position.copy(brush.position).add(new THREE.Vector3(0, .92, 0));
      plains.add(cap);
    }
    this.root.add(plains);
    this.zebraRigs.push(
      placeAnimal(this.root, this.animals, createZebra(textures, quality, 0), 40, -101, -1.1, .14, { mode: "terrestrial", radius: 2.8, speed: .12, phase: 1.2 }),
      placeAnimal(this.root, this.animals, createZebra(textures, quality, 1), 47, -105, 2.1, .14, { mode: "terrestrial", radius: 2.2, speed: .1, phase: 5.6 }),
    );
    addHabitatLabel(this.root, this.ownedTextures, materials, "AFRICAN PLAINS", "PLAINS ZEBRA · GRASSLAND CONSERVATION", 31, -89, .75, this.obstacles);
  }

  private addRedPandaHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const x = -36, z = -132, radius = 9.5;
    addCircularFence(this.root, materials, x, z, radius, quality > .72 ? 20 : 14, true);
    const canopyRoute = new THREE.Group();
    canopyRoute.name = "red-panda-supported-live-scent-route";
    const supportPoint = (px: number, pz: number) => new THREE.Vector3(px, terrainHeight(px, pz) + 2.7, pz);
    const routeSegments = [
      [[-40, -134.5], [-36, -132.8]],
      [[-36, -132.8], [-32.4, -130.5]],
      [[-39.3, -134.2], [-32.4, -130.5]],
    ] as const;
    routeSegments.forEach(([[ax, az], [bx, bz]], index) => {
      const branch = cylinderBetween(supportPoint(ax, az), supportPoint(bx, bz), index === 2 ? .14 : .18, materials.wood, quality > .72 ? 14 : 10);
      branch.name = `red-panda-weight-bearing-scent-route-branch-${index + 1}`;
      branch.castShadow = branch.receiveShadow = true;
      canopyRoute.add(branch);
    });
    for (const [px, pz, height] of [[-40, -134.5, 2.72], [-36, -132.8, 2.74], [-32.4, -130.5, 2.7]] as const) {
      const base = terrainHeight(px, pz);
      const trunk = cylinderBetween(new THREE.Vector3(px, base, pz), new THREE.Vector3(px, base + height, pz), .2, materials.wood, quality > .72 ? 14 : 10);
      trunk.name = "red-panda-grounded-canopy-route-support";
      trunk.castShadow = trunk.receiveShadow = true;
      canopyRoute.add(trunk);
    }
    const nestBox = new THREE.Mesh(new RoundedBoxGeometry(1.55, 1.22, 1.3, 5, .08), materials.wood);
    nestBox.name = "red-panda-shaded-rest-and-nest-box";
    nestBox.position.set(-32.35, terrainHeight(-32.35, -130.35) + 3.28, -130.35);
    nestBox.rotation.y = -.56;
    nestBox.castShadow = nestBox.receiveShadow = true;
    canopyRoute.add(nestBox);
    const nestOpening = new THREE.Mesh(new THREE.CircleGeometry(.34, 24), new THREE.MeshStandardMaterial({ color: "#171a14", roughness: 1 }));
    nestOpening.name = "red-panda-nest-box-access-opening";
    nestOpening.position.copy(nestBox.position).add(new THREE.Vector3(-.37, .02, .58));
    nestOpening.rotation.y = -.56;
    canopyRoute.add(nestOpening);
    const bambooMaterial = new THREE.MeshStandardMaterial({ color: "#66824d", roughness: .92 });
    for (let cluster = 0; cluster < 3; cluster++) for (let stem = 0; stem < 5; stem++) {
      const angle = stem / 5 * Math.PI * 2;
      const px = -40.8 + cluster * 3.7 + Math.cos(angle) * .18;
      const pz = -129.6 - cluster * 2.5 + Math.sin(angle) * .18;
      const bamboo = new THREE.Mesh(new THREE.CylinderGeometry(.022, .032, 1.6 + (stem % 2) * .35, 7), bambooMaterial);
      bamboo.name = "red-panda-live-bamboo-browse-cluster";
      bamboo.position.set(px, terrainHeight(px, pz) + .8, pz);
      bamboo.rotation.z = Math.cos(angle) * .08;
      canopyRoute.add(bamboo);
    }
    this.root.add(canopyRoute);
    this.redPandaRig = placeAnimal(this.root, this.animals, createRedPanda(textures, quality), -35, -132, .7, 2.85, { mode: "arboreal", radius: 1.7, speed: .18, phase: 2.4, verticalRange: .65 });
    addHabitatLabel(this.root, this.ownedTextures, materials, "RED PANDA", "HIMALAYAN FOREST", -28, -123, -.7, this.obstacles);
  }

  private addTortoiseHabitat(materials: ZooMaterials, textures: GameTextures, quality: number) {
    const x = 36, z = -132, radius = 9.5;
    addCircularFence(this.root, materials, x, z, radius, quality > .72 ? 20 : 14);
    const yard = new THREE.Group();
    yard.name = "bronx-zoo-layered-aldabra-tortoise-yard";
    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(radius - .45, radius - .3, .06, quality > .72 ? 42 : 28),
      new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .07, color: "#9b8b68", roughness: .99 }),
    );
    sand.name = "tortoise-warm-drained-sand-and-soil-substrate";
    sand.position.set(x, terrainHeight(x, z) + .01, z);
    sand.receiveShadow = true;
    yard.add(sand);
    const baskingShelves = [[40, -128.5, -.2], [38, -136, .35], [31.8, -132.5, -.45]] as const;
    baskingShelves.forEach(([px, pz, yaw], index) => {
      const shelf = new THREE.Mesh(new THREE.DodecahedronGeometry(1 + index * .06, 1), materials.stone);
      shelf.name = `tortoise-sun-trail-basking-shelf-${index + 1}`;
      shelf.position.set(px, terrainHeight(px, pz) + .23, pz);
      shelf.rotation.set(.06, yaw, -.04);
      shelf.scale.set(1.25, .2, .9);
      shelf.castShadow = shelf.receiveShadow = true;
      yard.add(shelf);
    });
    const shelterRoof = new THREE.Mesh(new RoundedBoxGeometry(4.3, .24, 3.2, 5, .09), materials.wood);
    shelterRoof.name = "tortoise-low-weather-shelter-roof";
    shelterRoof.position.set(40, terrainHeight(40, -137.6) + 1.72, -137.6);
    shelterRoof.rotation.z = -.04;
    shelterRoof.castShadow = true;
    yard.add(shelterRoof);
    for (const px of [38.25, 41.75]) for (const pz of [-136.4, -138.8]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.08, .12, 1.7, 9), materials.wood);
      post.name = "tortoise-shelter-grounded-post";
      post.position.set(px, terrainHeight(px, pz) + .85, pz);
      yard.add(post);
    }
    const wallow = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.42, .14, 28), materials.water);
    wallow.name = "tortoise-shallow-hydration-wallow";
    wallow.position.set(40.5, terrainHeight(40.5, -132.2) + .08, -132.2);
    yard.add(wallow);
    const succulentMaterial = new THREE.MeshStandardMaterial({ color: "#687b4d", roughness: .94 });
    [[32.2, -137.2], [42.3, -133.8], [33, -127.8], [38.8, -125.8]].forEach(([px, pz], cluster) => {
      for (let leaf = 0; leaf < 5; leaf++) {
        const succulent = new THREE.Mesh(new THREE.ConeGeometry(.09, .68, 5), succulentMaterial);
        succulent.name = "tortoise-safe-succulent-browse-cluster";
        const angle = leaf / 5 * Math.PI * 2;
        succulent.position.set(px + Math.cos(angle) * .13, terrainHeight(px, pz) + .3, pz + Math.sin(angle) * .13);
        succulent.rotation.set(Math.cos(angle) * .38, angle + cluster * .4, -Math.sin(angle) * .38);
        succulent.castShadow = true;
        yard.add(succulent);
      }
    });
    this.root.add(yard);
    this.tortoiseRig = placeAnimal(this.root, this.animals, createAldabraTortoise(textures, quality), 36, -132, -.6, .14, { mode: "terrestrial", radius: 1.35, speed: .035, phase: 3.7 });
    addHabitatLabel(this.root, this.ownedTextures, materials, "GIANT TORTOISE", "ALDABRA ATOLL CONSERVATION", 28, -123, .7, this.obstacles);
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
    for (let index = 0; index < 3; index++) {
      const flamingo = createAmericanFlamingo(textures, quality, index);
      flamingo.root.scale.setScalar(.56);
      flamingo.root.userData.habitatScale = "adult-american-flamingo-1.65m";
      this.flamingoRigs.push(
        placeAnimal(this.root, this.animals, flamingo, x - 2.1 + index * 2.1, z + (index % 2 ? 1.3 : -1), index * .7, .3, {
          mode: "terrestrial", radius: 1 + index * .22, speed: .06 + index * .012, phase: index * 4.2,
        }),
      );
    }
    addHabitatLabel(this.root, this.ownedTextures, materials, "FLAMINGO WETLAND", "AMERICAN FLAMINGOS · WETLAND RESTORATION", -63.5, -47, -.7, this.obstacles);
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
    const restorationCenters = [[68.5, -102.5], [69.2, -108.2], [76, -108]] as const;
    const restoredGrass = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(.045, .72),
      new THREE.MeshStandardMaterial({ color: "#8d9855", roughness: 1, side: THREE.DoubleSide, vertexColors: true }),
      restorationCenters.length * 34,
    );
    restoredGrass.name = "bison-physical-native-prairie-restoration-plots";
    const grassDummy = new THREE.Object3D();
    const grassRandom = seeded(72105);
    const grassPalette = [new THREE.Color("#7e8849"), new THREE.Color("#a09455"), new THREE.Color("#647748")];
    restorationCenters.forEach(([plotX, plotZ], plotIndex) => {
      for (let blade = 0; blade < 34; blade++) {
        const angle = grassRandom() * Math.PI * 2, distance = Math.sqrt(grassRandom()) * 1.05;
        const px = plotX + Math.cos(angle) * distance, pz = plotZ + Math.sin(angle) * distance;
        const height = .62 + grassRandom() * .72;
        const instance = plotIndex * 34 + blade;
        grassDummy.position.set(px, terrainHeight(px, pz) + height * .5, pz);
        grassDummy.rotation.set(0, grassRandom() * Math.PI, (grassRandom() - .5) * .12);
        grassDummy.scale.set(.75 + grassRandom() * .5, height / .72, 1);
        grassDummy.updateMatrix();
        restoredGrass.setMatrixAt(instance, grassDummy.matrix);
        restoredGrass.setColorAt(instance, grassPalette[(plotIndex + blade) % grassPalette.length]);
      }
      for (let marker = 0; marker < 8; marker++) {
        const markerAngle = marker / 8 * Math.PI * 2 + plotIndex * .21;
        const markerX = plotX + Math.cos(markerAngle) * 1.13;
        const markerZ = plotZ + Math.sin(markerAngle) * 1.13;
        const plotStone = new THREE.Mesh(new THREE.DodecahedronGeometry(.065 + (marker % 3) * .018, 1), materials.stone);
        plotStone.name = `bison-restoration-natural-fieldstone-marker-${plotIndex + 1}`;
        plotStone.position.set(markerX, terrainHeight(markerX, markerZ) + .045, markerZ);
        plotStone.rotation.set(marker * .17, markerAngle, marker * .11);
        plotStone.scale.set(1.35, .58, .95);
        paddock.add(plotStone);
      }
    });
    restoredGrass.instanceMatrix.needsUpdate = true;
    if (restoredGrass.instanceColor) restoredGrass.instanceColor.needsUpdate = true;
    restoredGrass.castShadow = quality > .72;
    paddock.add(restoredGrass);
    this.root.add(paddock);
    addCircularFence(this.root, materials, x, z, radius + .35, quality > .72 ? 20 : 14);
    const leadBison = createAmericanBison(textures, quality, 0);
    const trailingBison = createAmericanBison(textures, quality, 1);
    for (const bison of [leadBison, trailingBison]) {
      bison.root.scale.setScalar(.72);
      bison.root.userData.habitatScale = "adult-american-bison-2m-hump";
    }
    this.bisonRigs.push(
      placeAnimal(this.root, this.animals, leadBison, x - 1.7, z - .4, .2, 0, { mode: "terrestrial", radius: 1.7, speed: .055, phase: 1.1 }),
      placeAnimal(this.root, this.animals, trailingBison, x + 2.4, z + 1.2, -2.1, 0, { mode: "terrestrial", radius: 1.2, speed: .045, phase: 6.2 }),
    );
    addHabitatLabel(this.root, this.ownedTextures, materials, "BISON RANGE", "AMERICAN BISON · GRASSLAND RECOVERY", 63, -97, .72, this.obstacles);
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
      this.obstacles.push({ kind: "oriented-box", x, z, halfWidth: 1.72, halfDepth: .48, yaw });
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
      this.obstacles.push({ kind: "oriented-box", x, z, halfWidth: .7, halfDepth: .48, yaw });
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
      this.obstacles.push({ kind: "oriented-box", x, z, halfWidth: .72, halfDepth: .38, yaw: pair.rotation.y });
    });

    const lampMaterial = new THREE.MeshPhysicalMaterial({ color: "#fff0bf", emissive: "#f5cb72", emissiveIntensity: 1.4, roughness: .28, clearcoat: .55 });
    for (let index = 0; index < 16; index++) {
      const angle = index / 16 * Math.PI * 2, x = Math.cos(angle) * (34 + index % 3 * 4), z = -82 + Math.sin(angle) * 49;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .08, 4.4, 10), materials.iron);
      post.name = "bronx-zoo-low-glare-path-lamp"; post.position.set(x, terrainHeight(x, z) + 2.2, z); amenities.add(post);
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 11), lampMaterial); lantern.position.set(x, terrainHeight(x, z) + 4.48, z); amenities.add(lantern);
      this.obstacles.push({ kind: "circle", x, z, radius: .13 });
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
    this.obstacles.push(
      { kind: "box", minX: 18.7, maxX: 23.3, minZ: -151.5, maxZ: -150.5 },
      { kind: "box", minX: 23.05, maxX: 26.7, minZ: -151.55, maxZ: -149.65 },
      { kind: "box", minX: 16.65, maxX: 18.95, minZ: -151.55, maxZ: -149.95 },
    );
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
    addHabitatLabel(this.root, this.ownedTextures, materials, "SLOTH CONSERVATION", "RESCUE HABITAT · KEEPER ACCESS", -9.5, -126.5, -.22, this.obstacles);
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
    );
  }

  private resolveCircle(player: THREE.Vector3, velocity: THREE.Vector3, obstacle: CircleObstacle, padding = 0) {
    const dx = player.x - obstacle.x, dz = player.z - obstacle.z, distance = Math.hypot(dx, dz);
    const clearance = obstacle.radius + padding;
    if (distance >= clearance) return;
    if (distance <= .0001) {
      // A follower can be projected to an object's exact center by an earlier
      // pairwise solve. Give that degenerate overlap a stable escape direction
      // instead of leaving it embedded forever.
      player.x = obstacle.x + clearance;
      player.z = obstacle.z;
      velocity.multiplyScalar(.58);
      return;
    }
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

  private resolveOrientedBox(player: THREE.Vector3, velocity: THREE.Vector3, obstacle: OrientedBoxObstacle, padding = 0) {
    const cosine = Math.cos(obstacle.yaw), sine = Math.sin(obstacle.yaw);
    const dx = player.x - obstacle.x, dz = player.z - obstacle.z;
    let localX = cosine * dx - sine * dz, localZ = sine * dx + cosine * dz;
    const halfWidth = obstacle.halfWidth + padding, halfDepth = obstacle.halfDepth + padding;
    if (Math.abs(localX) >= halfWidth || Math.abs(localZ) >= halfDepth) return;
    const distances = [localX + halfWidth, halfWidth - localX, localZ + halfDepth, halfDepth - localZ];
    const side = distances.indexOf(Math.min(...distances));
    if (side === 0) localX = -halfWidth;
    else if (side === 1) localX = halfWidth;
    else if (side === 2) localZ = -halfDepth;
    else localZ = halfDepth;
    player.x = obstacle.x + cosine * localX + sine * localZ;
    player.z = obstacle.z - sine * localX + cosine * localZ;
    velocity.multiplyScalar(.5);
  }

  private distanceXZ(a: THREE.Vector3, b: THREE.Vector3) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
}
