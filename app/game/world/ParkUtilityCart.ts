import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

export type ParkUtilityCartOptions = {
  scene?: THREE.Scene;
  position?: THREE.Vector3;
  rotationY?: number;
  quality?: number;
  name?: string;
};

export type ParkUtilityCartDriveInput = {
  /** -1 reverse, 0 coast, 1 full forward. */
  throttle: number;
  /** -1 left, 0 straight, 1 right. */
  steering: number;
  /** 0 released, 1 full service brake. */
  brake?: number;
  handbrake?: boolean;
};

export type ParkUtilityCartWheel = {
  steeringPivot: THREE.Group;
  spinPivot: THREE.Group;
  tire: THREE.Mesh;
  rim: THREE.Mesh;
  tread: THREE.InstancedMesh;
  radius: number;
};

export type ParkUtilityCartSteeringParts = {
  steeringWheel: THREE.Group;
  steeringWheelRim: THREE.Mesh;
  steeringColumn: THREE.Mesh;
  frontLeftPivot: THREE.Group;
  frontRightPivot: THREE.Group;
};

export type ParkUtilityCartLights = {
  headlights: [THREE.Mesh, THREE.Mesh];
  tailLights: [THREE.Mesh, THREE.Mesh];
  beacon: THREE.Group;
  beaconLens: THREE.Mesh;
};

type CartMaterials = {
  paint: THREE.MeshPhysicalMaterial;
  paintDark: THREE.MeshStandardMaterial;
  cream: THREE.MeshPhysicalMaterial;
  vinyl: THREE.MeshPhysicalMaterial;
  rubber: THREE.MeshStandardMaterial;
  blackMetal: THREE.MeshStandardMaterial;
  galvanized: THREE.MeshStandardMaterial;
  chrome: THREE.MeshPhysicalMaterial;
  glass: THREE.MeshPhysicalMaterial;
  ivory: THREE.MeshStandardMaterial;
  darkGlass: THREE.MeshPhysicalMaterial;
  timber: THREE.MeshStandardMaterial;
  headlight: THREE.MeshStandardMaterial;
  tailLight: THREE.MeshStandardMaterial;
  amber: THREE.MeshStandardMaterial;
  label: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
};

type BuiltCart = {
  body: THREE.Group;
  wheels: {
    frontLeft: ParkUtilityCartWheel;
    frontRight: ParkUtilityCartWheel;
    rearLeft: ParkUtilityCartWheel;
    rearRight: ParkUtilityCartWheel;
  };
  steeringParts: ParkUtilityCartSteeringParts;
  lights: ParkUtilityCartLights;
  ownedTextures: THREE.Texture[];
};

const UP = new THREE.Vector3(0, 1, 0);
const WHEEL_RADIUS = 0.37;
const WHEELBASE = 2.18;

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value ^ (value >>> 15), 1 | value), value ^= value + Math.imul(value ^ (value >>> 7), 61 | value), ((value ^ (value >>> 14)) >>> 0) / 4294967296));
}

function createCanvasTexture(
  width: number,
  height: number,
  fallback: [number, number, number, number],
  draw: (context: CanvasRenderingContext2D, width: number, height: number) => void,
) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array(fallback), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("ParkUtilityCart requires a 2D canvas context");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makePaintTexture() {
  return createCanvasTexture(256, 256, [31, 82, 54, 255], (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#245f40");
    gradient.addColorStop(.48, "#174b34");
    gradient.addColorStop(1, "#0d3627");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    const random = seeded(817);
    for (let index = 0; index < 1900; index++) {
      const alpha = .012 + random() * .035;
      context.fillStyle = random() > .55 ? `rgba(224,238,218,${alpha})` : `rgba(0,18,10,${alpha})`;
      const size = .35 + random() * 1.25;
      context.fillRect(random() * width, random() * height, size, size);
    }
    context.fillStyle = "rgba(255,255,255,.045)";
    for (let y = 7; y < height; y += 31) context.fillRect(0, y, width, 1);
  });
}

function makeVinylTexture() {
  return createCanvasTexture(256, 256, [220, 208, 172, 255], (context, width, height) => {
    context.fillStyle = "#d9cfaa";
    context.fillRect(0, 0, width, height);
    const random = seeded(1447);
    for (let index = 0; index < 3600; index++) {
      const tone = 160 + Math.floor(random() * 75);
      context.fillStyle = `rgba(${tone},${tone - 5},${tone - 22},${.025 + random() * .075})`;
      context.fillRect(random() * width, random() * height, .5 + random() * 1.5, .4 + random());
    }
    context.strokeStyle = "rgba(90,81,59,.22)";
    context.lineWidth = 2;
    for (let x = 2; x < width; x += 64) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  });
}

function makeRubberTexture() {
  const texture = createCanvasTexture(256, 256, [36, 36, 33, 255], (context, width, height) => {
    context.fillStyle = "#242421";
    context.fillRect(0, 0, width, height);
    const random = seeded(231);
    for (let index = 0; index < 2600; index++) {
      const value = 24 + Math.floor(random() * 36);
      context.fillStyle = `rgba(${value},${value},${value - 2},${.08 + random() * .18})`;
      context.fillRect(random() * width, random() * height, .6 + random() * 2, .6 + random() * 2);
    }
    context.strokeStyle = "rgba(4,4,4,.65)";
    context.lineWidth = 9;
    for (let x = -height; x < width + height; x += 36) {
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x + height, height);
      context.stroke();
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 1);
  return texture;
}

function makeServiceLabelTexture() {
  return createCanvasTexture(1024, 440, [24, 72, 48, 255], (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#1b5539");
    gradient.addColorStop(1, "#103c2c");
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#e8e0bd";
    context.lineWidth = 18;
    context.strokeRect(13, 13, width - 26, height - 26);

    context.save();
    context.translate(105, 220);
    context.fillStyle = "#f0e8c8";
    context.beginPath();
    context.moveTo(-8, 116);
    context.bezierCurveTo(-73, 50, -72, -22, -10, -114);
    context.bezierCurveTo(58, -42, 62, 39, -8, 116);
    context.fill();
    context.strokeStyle = "#1b5539";
    context.lineWidth = 12;
    context.beginPath();
    context.moveTo(-4, 102);
    context.quadraticCurveTo(4, 25, 29, -67);
    context.stroke();
    context.restore();

    context.fillStyle = "#f4edcf";
    context.textAlign = "left";
    context.textBaseline = "middle";
    context.font = "700 82px Georgia, serif";
    context.fillText("CENTRAL PARK", 210, 144);
    context.font = "600 46px Arial, sans-serif";
    context.letterSpacing = "8px";
    context.fillText("FIELD SERVICES", 216, 245);
    context.font = "700 34px Arial, sans-serif";
    context.letterSpacing = "3px";
    context.fillText("ELECTRIC  •  UNIT 17", 218, 334);
  });
}

function makePlateTexture() {
  return createCanvasTexture(512, 220, [236, 223, 169, 255], (context, width, height) => {
    context.fillStyle = "#eee4bd";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#173b2d";
    context.lineWidth = 15;
    context.strokeRect(9, 9, width - 18, height - 18);
    context.fillStyle = "#173b2d";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 42px Arial, sans-serif";
    context.fillText("CENTRAL PARK", width / 2, 54);
    context.font = "800 82px ui-monospace, monospace";
    context.fillText("SLTHPRK", width / 2, 143);
  });
}

function createMaterials(textures: GameTextures) {
  const paintTexture = makePaintTexture();
  const vinylTexture = makeVinylTexture();
  const rubberTexture = makeRubberTexture();
  const labelTexture = makeServiceLabelTexture();
  const plateTexture = makePlateTexture();
  const ownedTextures = [paintTexture, vinylTexture, rubberTexture, labelTexture, plateTexture];
  const materials: CartMaterials = {
    paint: new THREE.MeshPhysicalMaterial({ map: paintTexture, color: "#d8e2d8", roughness: .31, metalness: .08, clearcoat: .8, clearcoatRoughness: .19 }),
    paintDark: new THREE.MeshStandardMaterial({ map: paintTexture, color: "#799387", roughness: .56, metalness: .16 }),
    cream: new THREE.MeshPhysicalMaterial({ color: "#e9e0be", roughness: .42, clearcoat: .38, clearcoatRoughness: .32 }),
    vinyl: new THREE.MeshPhysicalMaterial({ map: vinylTexture, bumpMap: vinylTexture, bumpScale: .025, color: "#fff9df", roughness: .62, clearcoat: .15 }),
    rubber: new THREE.MeshStandardMaterial({ map: rubberTexture, bumpMap: rubberTexture, bumpScale: .075, color: "#676762", roughness: .93 }),
    blackMetal: new THREE.MeshStandardMaterial({ color: "#111715", roughness: .36, metalness: .76 }),
    galvanized: new THREE.MeshStandardMaterial({ color: "#76817d", roughness: .48, metalness: .83 }),
    chrome: new THREE.MeshPhysicalMaterial({ color: "#dfe7e4", roughness: .15, metalness: .95, clearcoat: .8 }),
    glass: new THREE.MeshPhysicalMaterial({ color: "#c9e0dc", roughness: .08, metalness: 0, transmission: .68, transparent: true, opacity: .32, thickness: .02, side: THREE.DoubleSide, depthWrite: false }),
    ivory: new THREE.MeshStandardMaterial({ color: "#eee3bd", roughness: .58, metalness: 0 }),
    darkGlass: new THREE.MeshPhysicalMaterial({ color: "#182320", roughness: .12, transmission: .18, transparent: true, opacity: .78, clearcoat: .55 }),
    timber: new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .04, color: "#b89464", roughness: .87 }),
    headlight: new THREE.MeshStandardMaterial({ color: "#fff4c6", emissive: "#ffd67a", emissiveIntensity: 2.2, roughness: .16 }),
    tailLight: new THREE.MeshStandardMaterial({ color: "#9e1d18", emissive: "#d51c16", emissiveIntensity: .75, roughness: .24 }),
    amber: new THREE.MeshStandardMaterial({ color: "#e89824", emissive: "#ff9d21", emissiveIntensity: 1.15, transparent: true, opacity: .86, roughness: .18 }),
    label: new THREE.MeshStandardMaterial({ map: labelTexture, roughness: .48, metalness: .02, polygonOffset: true, polygonOffsetFactor: -2 }),
    plate: new THREE.MeshStandardMaterial({ map: plateTexture, roughness: .52, metalness: .04, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
  return { materials, ownedTextures };
}

function addRoundedBox(
  parent: THREE.Object3D,
  name: string,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  radius = .06,
  segments = 4,
) {
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(size[0], size[1], size[2], segments, Math.min(radius, ...size.map((dimension) => dimension * .48))), material);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function addRod(
  parent: THREE.Object3D,
  name: string,
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
  radialSegments = 12,
) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), radialSegments, 1), material);
  mesh.name = name;
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(UP, direction.normalize());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function buildWheel(
  name: string,
  x: number,
  z: number,
  front: boolean,
  materials: CartMaterials,
  treadCount: number,
) {
  const steeringPivot = new THREE.Group();
  steeringPivot.name = `${name}-steering-pivot`;
  steeringPivot.position.set(x, WHEEL_RADIUS, z);
  const spinPivot = new THREE.Group();
  spinPivot.name = `${name}-spin-pivot`;
  steeringPivot.add(spinPivot);

  const tire = new THREE.Mesh(new THREE.TorusGeometry(.287, .092, 14, 32), materials.rubber);
  tire.name = `${name}-tire`;
  tire.rotation.y = Math.PI / 2;
  tire.castShadow = tire.receiveShadow = true;
  spinPivot.add(tire);

  const rim = new THREE.Mesh(new THREE.CylinderGeometry(.19, .19, .165, 24, 2), materials.galvanized);
  rim.name = `${name}-rim`;
  rim.rotation.z = Math.PI / 2;
  rim.castShadow = rim.receiveShadow = true;
  spinPivot.add(rim);
  for (const side of [-1, 1]) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, .03, 18), materials.chrome);
    hub.name = `${name}-hub`;
    hub.rotation.z = Math.PI / 2;
    hub.position.x = side * .097;
    spinPivot.add(hub);
    for (let boltIndex = 0; boltIndex < 5; boltIndex++) {
      const angle = boltIndex / 5 * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(.011, .011, .012, 8), materials.blackMetal);
      bolt.name = `${name}-lug-bolt`;
      bolt.rotation.z = Math.PI / 2;
      bolt.position.set(side * .115, Math.cos(angle) * .105, Math.sin(angle) * .105);
      spinPivot.add(bolt);
    }
  }

  const treadGeometry = new THREE.BoxGeometry(.235, .07, .105);
  const tread = new THREE.InstancedMesh(treadGeometry, materials.rubber, treadCount);
  tread.name = `${name}-tread`;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < treadCount; index++) {
    const angle = index / treadCount * Math.PI * 2;
    dummy.position.set(0, Math.cos(angle) * .371, Math.sin(angle) * .371);
    dummy.rotation.set(angle, 0, (index % 2 ? 1 : -1) * .12);
    dummy.updateMatrix();
    tread.setMatrixAt(index, dummy.matrix);
  }
  tread.instanceMatrix.needsUpdate = true;
  tread.castShadow = tread.receiveShadow = true;
  spinPivot.add(tread);

  const brakeDisc = new THREE.Mesh(new THREE.CylinderGeometry(.135, .135, .018, 22), materials.blackMetal);
  brakeDisc.name = `${name}-brake-disc`;
  brakeDisc.rotation.z = Math.PI / 2;
  brakeDisc.position.x = x < 0 ? .135 : -.135;
  spinPivot.add(brakeDisc);

  return { steeringPivot, spinPivot, tire, rim, tread, radius: WHEEL_RADIUS, front } satisfies ParkUtilityCartWheel & { front: boolean };
}

function addSeat(body: THREE.Group, x: number, materials: CartMaterials) {
  const seat = new THREE.Group();
  seat.name = x < 0 ? "driver-seat" : "passenger-seat";
  const cushion = addRoundedBox(seat, "seat-cushion", [.64, .16, .58], [x, .88, .15], materials.vinyl, .075, 5);
  cushion.rotation.x = -.055;
  const back = addRoundedBox(seat, "seat-back", [.64, .68, .14], [x, 1.22, .39], materials.vinyl, .07, 5);
  back.rotation.x = -.12;
  for (const seamX of [-.18, .18]) addRod(seat, "vinyl-seat-seam", new THREE.Vector3(x + seamX, .98, .325), new THREE.Vector3(x + seamX, 1.46, .267), .009, materials.ivory, 8);
  body.add(seat);
}

function addCargoTools(body: THREE.Group, materials: CartMaterials) {
  const cargo = new THREE.Group();
  cargo.name = "maintenance-cargo";
  addRoundedBox(cargo, "weatherproof-toolbox", [1.12, .35, .48], [0, .91, 1.28], materials.paintDark, .055, 4);
  addRoundedBox(cargo, "toolbox-lid", [1.15, .055, .5], [0, 1.105, 1.28], materials.galvanized, .025, 3);
  addRoundedBox(cargo, "toolbox-latch", [.12, .14, .035], [0, .93, 1.02], materials.chrome, .012, 2);

  const cone = new THREE.Group();
  cone.name = "folding-safety-cone";
  const coneMaterial = new THREE.MeshStandardMaterial({ color: "#dd6f25", roughness: .58 });
  const coneBody = new THREE.Mesh(new THREE.ConeGeometry(.17, .56, 20, 1, true), coneMaterial);
  coneBody.position.y = .33;
  cone.add(coneBody);
  addRoundedBox(cone, "cone-base", [.44, .055, .44], [0, .025, 0], materials.rubber, .015, 2);
  const reflectiveBand = new THREE.Mesh(new THREE.CylinderGeometry(.116, .14, .085, 20, 1, true), materials.ivory);
  reflectiveBand.position.y = .29;
  cone.add(reflectiveBand);
  cone.scale.setScalar(.72);
  cone.position.set(.38, 1.11, 1.31);
  cargo.add(cone);

  const toolPositions = [
    { name: "shovel", x: -.48, z: 1.34, head: "shovel" },
    { name: "rake", x: .52, z: 1.43, head: "rake" },
  ];
  for (const tool of toolPositions) {
    const toolGroup = new THREE.Group();
    toolGroup.name = tool.name;
    const handle = addRod(toolGroup, `${tool.name}-handle`, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1.38, 0), .025, materials.timber, 10);
    handle.rotation.z = -.06;
    if (tool.head === "shovel") {
      const headShape = new THREE.Shape();
      headShape.moveTo(-.13, .12); headShape.quadraticCurveTo(-.18, -.11, 0, -.28); headShape.quadraticCurveTo(.18, -.11, .13, .12); headShape.closePath();
      const head = new THREE.Mesh(new THREE.ExtrudeGeometry(headShape, { depth: .035, bevelEnabled: true, bevelSize: .012, bevelThickness: .012, bevelSegments: 2 }), materials.galvanized);
      head.rotation.x = Math.PI / 2;
      head.position.y = 1.52;
      toolGroup.add(head);
    } else {
      addRoundedBox(toolGroup, "rake-head", [.52, .055, .075], [0, 1.43, 0], materials.galvanized, .012, 2);
      for (let tine = -4; tine <= 4; tine++) addRod(toolGroup, "rake-tine", new THREE.Vector3(tine * .055, 1.4, 0), new THREE.Vector3(tine * .055, 1.23, .02), .009, materials.galvanized, 6);
    }
    toolGroup.position.set(tool.x, .78, tool.z);
    toolGroup.rotation.x = .08;
    cargo.add(toolGroup);
  }
  body.add(cargo);
}

function buildCart(textures: GameTextures, quality: number): BuiltCart {
  const { materials, ownedTextures } = createMaterials(textures);
  const body = new THREE.Group();
  body.name = "park-utility-cart-body";

  addRoundedBox(body, "ladder-frame", [1.42, .15, 3.02], [0, .49, .04], materials.blackMetal, .045, 3);
  addRoundedBox(body, "underbody-battery", [1.16, .31, 1.07], [0, .42, .23], materials.paintDark, .055, 4);
  addRoundedBox(body, "front-body-cowl", [1.46, .55, .82], [0, .73, -1.24], materials.paint, .15, 6);
  addRoundedBox(body, "front-nose", [1.42, .33, .32], [0, .61, -1.65], materials.paint, .13, 6);
  addRoundedBox(body, "front-bumper", [1.54, .13, .15], [0, .39, -1.84], materials.blackMetal, .045, 3);
  addRoundedBox(body, "rear-body-cowl", [1.45, .47, .61], [0, .72, .91], materials.paint, .11, 5);
  addRoundedBox(body, "floor-pan", [1.32, .12, 1.15], [0, .64, -.12], materials.paintDark, .045, 3);
  addRoundedBox(body, "left-running-board", [.23, .11, 1.03], [-.82, .55, -.08], materials.blackMetal, .025, 3);
  addRoundedBox(body, "right-running-board", [.23, .11, 1.03], [.82, .55, -.08], materials.blackMetal, .025, 3);
  for (const x of [-.82, .82]) for (let groove = 0; groove < 7; groove++) addRoundedBox(body, "step-grip", [.25, .015, .04], [x, .616, -.5 + groove * .16], materials.rubber, .008, 2);

  for (const x of [-.55, .55]) {
    const headlight = new THREE.Mesh(new THREE.CylinderGeometry(.105, .12, .035, 24), materials.headlight);
    headlight.name = "headlight";
    headlight.rotation.x = Math.PI / 2;
    headlight.position.set(x, .77, -1.817);
    body.add(headlight);
    const bezel = new THREE.Mesh(new THREE.TorusGeometry(.122, .018, 10, 24), materials.chrome);
    bezel.position.set(x, .77, -1.839);
    body.add(bezel);
  }
  const headlights = body.children.filter((child) => child.name === "headlight") as THREE.Mesh[];

  const dash = addRoundedBox(body, "dashboard", [1.18, .35, .29], [0, 1.04, -.66], materials.paintDark, .075, 5);
  dash.rotation.x = -.14;
  const instrumentFace = new THREE.Mesh(new THREE.CylinderGeometry(.105, .105, .022, 24), materials.darkGlass);
  instrumentFace.name = "digital-instrument-cluster";
  instrumentFace.rotation.x = Math.PI / 2 + .14;
  instrumentFace.position.set(.31, 1.145, -.817);
  body.add(instrumentFace);
  for (const x of [-.12, .04]) {
    const switchMesh = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, .025, 12), materials.chrome);
    switchMesh.name = "dashboard-switch";
    switchMesh.rotation.x = Math.PI / 2 + .14;
    switchMesh.position.set(x, 1.13, -.815);
    body.add(switchMesh);
  }

  addSeat(body, -.35, materials);
  addSeat(body, .35, materials);

  const steeringWheel = new THREE.Group();
  steeringWheel.name = "steering-wheel-assembly";
  steeringWheel.position.set(-.36, 1.28, -.54);
  steeringWheel.rotation.x = -.36;
  const steeringWheelRim = new THREE.Mesh(new THREE.TorusGeometry(.205, .026, 12, 36), materials.blackMetal);
  steeringWheelRim.name = "steering-wheel-rim";
  steeringWheelRim.castShadow = true;
  steeringWheel.add(steeringWheelRim);
  for (let spoke = 0; spoke < 3; spoke++) {
    const angle = spoke / 3 * Math.PI * 2 + Math.PI / 2;
    addRod(steeringWheel, "steering-wheel-spoke", new THREE.Vector3(0, 0, .004), new THREE.Vector3(Math.cos(angle) * .18, Math.sin(angle) * .18, .004), .013, materials.galvanized, 8);
  }
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(.052, .052, .045, 18), materials.paintDark);
  wheelHub.rotation.x = Math.PI / 2;
  steeringWheel.add(wheelHub);
  body.add(steeringWheel);
  const steeringColumn = addRod(body, "steering-column", new THREE.Vector3(-.36, .89, -.67), new THREE.Vector3(-.36, 1.275, -.53), .035, materials.blackMetal, 14);

  const roof = addRoundedBox(body, "cream-canopy", [1.82, .13, 2.37], [0, 2.12, -.1], materials.cream, .09, 5);
  roof.castShadow = true;
  addRoundedBox(body, "canopy-liner", [1.67, .035, 2.2], [0, 2.047, -.1], materials.ivory, .025, 3);
  for (const x of [-.72, .72]) {
    addRod(body, "front-roof-upright", new THREE.Vector3(x, .72, -.72), new THREE.Vector3(x, 2.08, -.72), .032, materials.blackMetal, 12);
    addRod(body, "rear-roof-upright", new THREE.Vector3(x, .72, .79), new THREE.Vector3(x, 2.08, .94), .035, materials.blackMetal, 12);
  }

  const windshield = new THREE.Mesh(new THREE.PlaneGeometry(1.37, .87, 2, 2), materials.glass);
  windshield.name = "laminated-windshield";
  windshield.position.set(0, 1.57, -.735);
  windshield.rotation.x = -.04;
  windshield.renderOrder = 2;
  body.add(windshield);
  for (const x of [-.72, .72]) addRod(body, "windshield-frame", new THREE.Vector3(x, 1.13, -.72), new THREE.Vector3(x, 2.01, -.76), .025, materials.blackMetal, 10);
  addRod(body, "windshield-lower-frame", new THREE.Vector3(-.72, 1.12, -.72), new THREE.Vector3(.72, 1.12, -.72), .027, materials.blackMetal, 10);
  addRod(body, "windshield-upper-frame", new THREE.Vector3(-.72, 2.01, -.76), new THREE.Vector3(.72, 2.01, -.76), .027, materials.blackMetal, 10);
  const wiperPivot = new THREE.Group();
  wiperPivot.position.set(.48, 1.16, -.765);
  const wiper = addRod(wiperPivot, "windshield-wiper", new THREE.Vector3(0, 0, 0), new THREE.Vector3(-.37, .55, 0), .012, materials.blackMetal, 8);
  wiper.position.z -= .005;
  wiperPivot.rotation.z = -.18;
  body.add(wiperPivot);

  addRoundedBox(body, "cargo-bed-floor", [1.41, .12, 1.02], [0, .78, 1.35], materials.galvanized, .035, 3);
  addRoundedBox(body, "cargo-left-wall", [.1, .36, 1.03], [-.71, .95, 1.35], materials.paint, .035, 3);
  addRoundedBox(body, "cargo-right-wall", [.1, .36, 1.03], [.71, .95, 1.35], materials.paint, .035, 3);
  addRoundedBox(body, "cargo-tailgate", [1.42, .36, .09], [0, .95, 1.85], materials.paint, .04, 3);
  for (const x of [-.46, 0, .46]) addRoundedBox(body, "tailgate-stamp", [.045, .25, .025], [x, .95, 1.803], materials.paintDark, .008, 2);
  addCargoTools(body, materials);

  for (const side of [-1, 1]) {
    // Mount the service identity on a raised cargo-bed placard. The previous
    // decal crossed the rear wheel's silhouette, obscuring its border and copy.
    // This backing clears the complete fender arc while retaining the cart's
    // enamel-and-black-metal field-services finish.
    addRoundedBox(
      body,
      side < 0 ? "left-service-sign-backing" : "right-service-sign-backing",
      [.04, .43, 1.01],
      [side * .766, 1.055, 1.35],
      materials.blackMetal,
      .035,
      4,
    );
    const label = new THREE.Mesh(new THREE.PlaneGeometry(.93, .4), materials.label);
    label.name = side < 0 ? "left-central-park-field-services-marking" : "right-central-park-field-services-marking";
    label.position.set(side * .791, 1.055, 1.35);
    label.rotation.y = side * Math.PI / 2;
    label.renderOrder = 2;
    body.add(label);
  }
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(.42, .18), materials.plate);
  plate.name = "unit-license-plate";
  plate.position.set(0, .55, 1.897);
  body.add(plate);

  for (const x of [-.53, .53]) {
    const light = new THREE.Mesh(new RoundedBoxGeometry(.19, .14, .05, 3, .025), materials.tailLight);
    light.name = "tail-light";
    light.position.set(x, .7, 1.897);
    body.add(light);
  }
  const tailLights = body.children.filter((child) => child.name === "tail-light") as THREE.Mesh[];

  const beacon = new THREE.Group();
  beacon.name = "amber-safety-beacon";
  beacon.position.set(0, 2.22, .14);
  const beaconBase = new THREE.Mesh(new THREE.CylinderGeometry(.105, .125, .055, 20), materials.blackMetal);
  beacon.add(beaconBase);
  const beaconLens = new THREE.Mesh(new THREE.CylinderGeometry(.085, .1, .18, 20, 1, false), materials.amber);
  beaconLens.name = "rotating-beacon-lens";
  beaconLens.position.y = .105;
  beacon.add(beaconLens);
  const beaconCap = new THREE.Mesh(new THREE.SphereGeometry(.086, 20, 9, 0, Math.PI * 2, 0, Math.PI / 2), materials.amber);
  beaconCap.position.y = .195;
  beacon.add(beaconCap);
  body.add(beacon);

  const treadCount = quality > .75 ? 16 : 12;
  const frontLeft = buildWheel("front-left-wheel", -.78, -1.17, true, materials, treadCount);
  const frontRight = buildWheel("front-right-wheel", .78, -1.17, true, materials, treadCount);
  const rearLeft = buildWheel("rear-left-wheel", -.78, 1.01, false, materials, treadCount);
  const rearRight = buildWheel("rear-right-wheel", .78, 1.01, false, materials, treadCount);
  for (const wheel of [frontLeft, frontRight, rearLeft, rearRight]) body.add(wheel.steeringPivot);

  for (const x of [-.78, .78]) {
    const frontFender = new THREE.Mesh(new THREE.TorusGeometry(.4, .035, 8, 24, Math.PI), materials.paintDark);
    frontFender.name = "front-wheel-arch";
    frontFender.rotation.set(0, Math.PI / 2, 0);
    frontFender.position.set(x, .4, -1.17);
    body.add(frontFender);
    const rearFender = frontFender.clone();
    rearFender.name = "rear-wheel-arch";
    rearFender.position.z = 1.01;
    body.add(rearFender);
  }

  if (quality < .75) {
    // Mobile keeps the silhouette, labels, materials, lights and first-person
    // controls, while omitting dozens of sub-pixel parts that each cost a draw.
    const microDetail = /(?:lug-bolt|brake-disc|vinyl-seat-seam|step-grip|rake-tine|tailgate-stamp|dashboard-switch)$/;
    body.traverse((child) => {
      if (microDetail.test(child.name)) child.visible = false;
      if (child instanceof THREE.Mesh && !child.visible) child.castShadow = child.receiveShadow = false;
    });
  }

  return {
    body,
    wheels: { frontLeft, frontRight, rearLeft, rearRight },
    steeringParts: {
      steeringWheel,
      steeringWheelRim,
      steeringColumn,
      frontLeftPivot: frontLeft.steeringPivot,
      frontRightPivot: frontRight.steeringPivot,
    },
    lights: { headlights: [headlights[0], headlights[1]], tailLights: [tailLights[0], tailLights[1]], beacon, beaconLens },
    ownedTextures,
  };
}

/**
 * Self-contained, procedural Central Park field-services cart.
 *
 * The model faces local -Z. `driverEntryPoint`, `seatTransform`, and
 * `cameraTransform` are children of `root`, so consumers can read their world
 * position/quaternion after calling `root.updateMatrixWorld(true)`.
 */
export class ParkUtilityCart {
  readonly root = new THREE.Group();
  readonly body: THREE.Group;
  readonly driverEntryPoint = new THREE.Object3D();
  readonly seatTransform = new THREE.Object3D();
  readonly cameraTransform = new THREE.Object3D();
  readonly collisionBounds = new THREE.Box3(
    new THREE.Vector3(-.96, 0, -1.94),
    new THREE.Vector3(.96, 2.54, 1.98),
  );
  readonly collisionRadius = 1.08;
  readonly wheels: BuiltCart["wheels"];
  readonly wheelMeshes: readonly THREE.Mesh[];
  readonly steeringParts: ParkUtilityCartSteeringParts;
  readonly lights: ParkUtilityCartLights;
  readonly maxForwardSpeed = 8.8;
  readonly maxReverseSpeed = 3.5;

  private readonly ownedTextures: THREE.Texture[];
  private speed = 0;
  private steerAngle = 0;
  private disposed = false;

  constructor(textures: GameTextures, options: ParkUtilityCartOptions = {}) {
    const quality = THREE.MathUtils.clamp(options.quality ?? 1, .35, 1);
    const built = buildCart(textures, quality);
    this.body = built.body;
    this.wheels = built.wheels;
    this.wheelMeshes = [built.wheels.frontLeft.tire, built.wheels.frontRight.tire, built.wheels.rearLeft.tire, built.wheels.rearRight.tire];
    this.steeringParts = built.steeringParts;
    this.lights = built.lights;
    this.ownedTextures = built.ownedTextures;

    this.root.name = options.name ?? "central-park-field-services-cart";
    this.root.add(this.body);
    this.root.position.copy(options.position ?? new THREE.Vector3());
    this.root.rotation.y = options.rotationY ?? 0;

    this.driverEntryPoint.name = "driver-entry-point";
    this.driverEntryPoint.position.set(-1.26, .08, -.06);
    this.driverEntryPoint.rotation.y = -Math.PI / 2;
    this.root.add(this.driverEntryPoint);

    this.seatTransform.name = "driver-seat-transform";
    this.seatTransform.position.set(-.35, 1.03, .12);
    this.root.add(this.seatTransform);

    this.cameraTransform.name = "driver-camera-transform";
    this.cameraTransform.position.set(-.35, 1.64, -.03);
    this.cameraTransform.rotation.x = -.035;
    this.root.add(this.cameraTransform);

    this.root.userData.interactable = true;
    this.root.userData.interactionKind = "park-utility-cart";
    this.root.userData.interactionLabel = "Drive park-services cart";
    options.scene?.add(this.root);
  }

  get speedMetersPerSecond() {
    return this.speed;
  }

  get steeringAngleRadians() {
    return this.steerAngle;
  }

  getWorldCollisionBounds(target = new THREE.Box3()) {
    this.root.updateMatrixWorld(true);
    return target.copy(this.collisionBounds).applyMatrix4(this.root.matrixWorld);
  }

  getWorldEntryPosition(target = new THREE.Vector3()) {
    return this.driverEntryPoint.getWorldPosition(target);
  }

  getWorldSeatTransform(position = new THREE.Vector3(), quaternion = new THREE.Quaternion()) {
    this.seatTransform.getWorldPosition(position);
    this.seatTransform.getWorldQuaternion(quaternion);
    return { position, quaternion };
  }

  getWorldCameraTransform(position = new THREE.Vector3(), quaternion = new THREE.Quaternion()) {
    this.cameraTransform.getWorldPosition(position);
    this.cameraTransform.getWorldQuaternion(quaternion);
    return { position, quaternion };
  }

  setPose(position: THREE.Vector3, rotationY = this.root.rotation.y) {
    this.root.position.copy(position);
    this.root.rotation.set(0, rotationY, 0);
    this.root.updateMatrixWorld(true);
    return this;
  }

  addTo(scene: THREE.Scene) {
    scene.add(this.root);
    return this;
  }

  /**
   * Advances simple arcade vehicle dynamics. The optional height callback
   * should return the ground surface Y at the cart's new X/Z position.
   */
  update(
    deltaSeconds: number,
    input: ParkUtilityCartDriveInput,
    heightAt?: (x: number, z: number) => number,
  ) {
    if (this.disposed) return;
    const delta = THREE.MathUtils.clamp(deltaSeconds, 0, .08);
    const throttle = THREE.MathUtils.clamp(input.throttle, -1, 1);
    const steering = THREE.MathUtils.clamp(input.steering, -1, 1);
    const brake = THREE.MathUtils.clamp(input.brake ?? 0, 0, 1);
    const targetSteer = steering * .54;
    this.steerAngle += (targetSteer - this.steerAngle) * (1 - Math.exp(-10 * delta));

    if (Math.abs(throttle) > .015) {
      const traction = throttle > 0 ? 4.5 : 3.2;
      const speedRatio = throttle > 0 ? Math.max(0, this.speed / this.maxForwardSpeed) : Math.max(0, -this.speed / this.maxReverseSpeed);
      this.speed += throttle * traction * (1 - speedRatio * .7) * delta;
    } else {
      const rollingResistance = .72 + Math.abs(this.speed) * .09;
      this.speed = THREE.MathUtils.clamp(this.speed, -Math.max(0, -this.speed - rollingResistance * delta), Math.max(0, this.speed - rollingResistance * delta));
    }
    const brakingForce = (input.handbrake ? 11 : 7.8 * brake) * delta;
    if (brakingForce > 0) this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - brakingForce);
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxReverseSpeed, this.maxForwardSpeed);

    const distance = this.speed * delta;
    if (Math.abs(distance) > 1e-5) {
      this.root.rotation.y -= Math.tan(this.steerAngle) * distance / WHEELBASE;
      this.root.position.x -= Math.sin(this.root.rotation.y) * distance;
      this.root.position.z -= Math.cos(this.root.rotation.y) * distance;
      if (heightAt) this.root.position.y = heightAt(this.root.position.x, this.root.position.z);
      const wheelRotation = -distance / WHEEL_RADIUS;
      for (const wheel of Object.values(this.wheels)) wheel.spinPivot.rotation.x += wheelRotation;
    }

    this.wheels.frontLeft.steeringPivot.rotation.y = -this.steerAngle;
    this.wheels.frontRight.steeringPivot.rotation.y = -this.steerAngle;
    this.steeringParts.steeringWheel.rotation.z = -this.steerAngle * 2.15;
    this.root.updateMatrixWorld(true);
  }

  /** Animates non-physics details such as the rotating amber safety beacon. */
  animate(elapsedSeconds: number) {
    if (this.disposed) return;
    this.lights.beacon.rotation.y = elapsedSeconds * 5.5;
    const material = this.lights.beaconLens.material as THREE.MeshStandardMaterial;
    material.emissiveIntensity = 1.05 + Math.pow(Math.max(0, Math.sin(elapsedSeconds * 5.5)), 10) * 2.4;
  }

  stop() {
    this.speed = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    this.ownedTextures.forEach((texture) => texture.dispose());
  }
}

export function createParkUtilityCart(textures: GameTextures, options: ParkUtilityCartOptions = {}) {
  return new ParkUtilityCart(textures, options);
}
