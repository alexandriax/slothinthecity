import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

export type ParkRowboatOptions = {
  scene?: THREE.Scene;
  position?: THREE.Vector3;
  rotationY?: number;
  quality?: number;
  name?: string;
  boatNumber?: number;
};

export type ParkRowboatDriveInput = {
  /** -1 backwater, 0 drift, 1 full forward stroke. */
  throttle: number;
  /** -1 port, 0 straight, 1 starboard. */
  steering: number;
  /** 0 released, 1 full braking/backwater stroke. */
  brake?: number;
};

export type ParkRowboatOar = {
  rig: THREE.Group;
  shaft: THREE.Mesh;
  blade: THREE.Mesh;
};

type RowboatMaterials = {
  hull: THREE.MeshPhysicalMaterial;
  innerHull: THREE.MeshStandardMaterial;
  varnishedWood: THREE.MeshPhysicalMaterial;
  darkWood: THREE.MeshStandardMaterial;
  metal: THREE.MeshStandardMaterial;
  rope: THREE.MeshStandardMaterial;
  label: THREE.MeshStandardMaterial;
};

const HALF_LENGTH = 2.58;
const MAX_BEAM = .82;

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
  if (!context) throw new Error("ParkRowboat requires a 2D canvas context");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function makeRowboatLabelTexture(boatNumber: number) {
  return createCanvasTexture(1024, 320, [239, 226, 185, 255], (context, width, height) => {
    const random = seeded(boatNumber * 83 + 19);
    context.fillStyle = "#eee2b9";
    context.fillRect(0, 0, width, height);
    for (let index = 0; index < 1400; index++) {
      const tone = random() > .48 ? "42,66,50" : "123,95,53";
      context.fillStyle = `rgba(${tone},${.018 + random() * .045})`;
      context.fillRect(random() * width, random() * height, .7 + random() * 2.4, .5 + random() * 1.3);
    }
    context.strokeStyle = "#183d2e";
    context.lineWidth = 18;
    context.strokeRect(12, 12, width - 24, height - 24);
    context.fillStyle = "#183d2e";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = "700 72px Georgia, serif";
    context.fillText("THE LAKE", width / 2, 83);
    context.font = "700 37px Arial, sans-serif";
    context.letterSpacing = "9px";
    context.fillText("CENTRAL PARK ROWBOATS", width / 2, 161);
    context.font = "800 61px ui-monospace, monospace";
    context.letterSpacing = "5px";
    context.fillText(`BOAT ${String(boatNumber).padStart(2, "0")}`, width / 2, 247);
  });
}

function stationShape(u: number) {
  const end = Math.abs(u * 2 - 1);
  const fullness = Math.pow(Math.max(0, Math.sin(Math.PI * u)), .58);
  return {
    width: .035 + MAX_BEAM * fullness,
    gunwale: .52 + Math.pow(end, 2.5) * .2,
    keel: -.34 + Math.pow(end, 1.7) * .2,
  };
}

function createHullGeometry(longitudinalSegments: number, crossSegments: number, inner = false) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let zIndex = 0; zIndex <= longitudinalSegments; zIndex++) {
    const u = zIndex / longitudinalSegments;
    const z = THREE.MathUtils.lerp(-HALF_LENGTH, HALF_LENGTH, u);
    const station = stationShape(u);
    const width = Math.max(.025, station.width - (inner ? .075 : 0));
    const gunwale = station.gunwale - (inner ? .035 : 0);
    const keel = inner ? .015 + Math.pow(Math.abs(u * 2 - 1), 2) * .08 : station.keel;
    for (let crossIndex = 0; crossIndex <= crossSegments; crossIndex++) {
      const v = crossIndex / crossSegments;
      const angle = v * Math.PI;
      positions.push(-Math.cos(angle) * width, gunwale - Math.sin(angle) * (gunwale - keel), z);
      uvs.push(u * 4, v * 1.5);
    }
  }
  const stride = crossSegments + 1;
  for (let zIndex = 0; zIndex < longitudinalSegments; zIndex++) {
    for (let crossIndex = 0; crossIndex < crossSegments; crossIndex++) {
      const a = zIndex * stride + crossIndex;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      if (inner) indices.push(a, b, c, b, d, c);
      else indices.push(a, c, b, b, c, d);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function sideCurve(side: -1 | 1, inset = 0, heightOffset = 0) {
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= 18; index++) {
    const u = index / 18;
    const station = stationShape(u);
    points.push(new THREE.Vector3(side * Math.max(.025, station.width - inset), station.gunwale + heightOffset, THREE.MathUtils.lerp(-HALF_LENGTH, HALF_LENGTH, u)));
  }
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

function waterlineCurve(side: -1 | 1) {
  const points: THREE.Vector3[] = [];
  for (let index = 1; index < 18; index++) {
    const u = index / 18;
    const station = stationShape(u);
    const waterline = .04;
    const ratio = THREE.MathUtils.clamp((station.gunwale - waterline) / (station.gunwale - station.keel), 0, .98);
    const x = Math.cos(Math.asin(ratio)) * station.width;
    points.push(new THREE.Vector3(side * x * 1.012, waterline, THREE.MathUtils.lerp(-HALF_LENGTH, HALF_LENGTH, u)));
  }
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

function ribCurve(z: number) {
  const u = THREE.MathUtils.clamp((z + HALF_LENGTH) / (HALF_LENGTH * 2), 0, 1);
  const station = stationShape(u);
  const points: THREE.Vector3[] = [];
  for (let index = 0; index <= 12; index++) {
    const v = index / 12;
    const angle = v * Math.PI;
    const width = station.width - .055;
    const gunwale = station.gunwale - .045;
    const keel = .035;
    points.push(new THREE.Vector3(-Math.cos(angle) * width, gunwale - Math.sin(angle) * (gunwale - keel) + .018, z));
  }
  return new THREE.CatmullRomCurve3(points, false, "centripetal");
}

function makeOarBladeGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(0, -.045);
  shape.lineTo(.23, -.09);
  shape.quadraticCurveTo(.58, -.18, .72, -.09);
  shape.quadraticCurveTo(.79, 0, .72, .09);
  shape.quadraticCurveTo(.58, .18, .23, .09);
  shape.lineTo(0, .045);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: .032,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: .018,
    bevelThickness: .012,
    curveSegments: 10,
  });
  geometry.translate(0, 0, -.016);
  geometry.rotateX(Math.PI / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function setShadow(mesh: THREE.Mesh, cast = true, receive = true) {
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  return mesh;
}

function buildOar(side: -1 | 1, materials: RowboatMaterials, quality: number): ParkRowboatOar {
  const rig = new THREE.Group();
  rig.name = side < 0 ? "port-oar" : "starboard-oar";
  rig.position.set(side * .63, .625, .2);

  const shaft = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.026, .034, 2.2, quality > .7 ? 14 : 9), materials.varnishedWood));
  shaft.name = "ash-oar-shaft";
  shaft.rotation.z = Math.PI / 2;
  shaft.position.x = side * .72;
  rig.add(shaft);

  const bladeGeometry = makeOarBladeGeometry();
  if (side < 0) bladeGeometry.rotateY(Math.PI);
  const blade = setShadow(new THREE.Mesh(bladeGeometry, materials.varnishedWood));
  blade.name = "varnished-oar-blade";
  blade.position.x = side * 1.79;
  rig.add(blade);
  return { rig, shaft, blade };
}

function createMaterials(textures: GameTextures, labelTexture: THREE.Texture): RowboatMaterials {
  return {
    hull: new THREE.MeshPhysicalMaterial({
      map: textures.bark,
      bumpMap: textures.bark,
      bumpScale: .035,
      color: "#42634c",
      roughness: .38,
      metalness: .02,
      clearcoat: .72,
      clearcoatRoughness: .24,
      side: THREE.DoubleSide,
    }),
    innerHull: new THREE.MeshStandardMaterial({
      map: textures.bark,
      bumpMap: textures.bark,
      bumpScale: .025,
      color: "#9d7447",
      roughness: .64,
      side: THREE.DoubleSide,
    }),
    varnishedWood: new THREE.MeshPhysicalMaterial({
      map: textures.bark,
      bumpMap: textures.bark,
      bumpScale: .028,
      color: "#c59a64",
      roughness: .4,
      clearcoat: .62,
      clearcoatRoughness: .27,
    }),
    darkWood: new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .03, color: "#59402a", roughness: .72 }),
    metal: new THREE.MeshStandardMaterial({ color: "#75817c", roughness: .28, metalness: .88 }),
    rope: new THREE.MeshStandardMaterial({ color: "#b9a47b", roughness: .94 }),
    label: new THREE.MeshStandardMaterial({ map: labelTexture, roughness: .5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 }),
  };
}

function buildBoat(textures: GameTextures, quality: number, boatNumber: number) {
  const body = new THREE.Group();
  body.name = "premium-central-park-rowboat-model";
  const labelTexture = makeRowboatLabelTexture(boatNumber);
  const materials = createMaterials(textures, labelTexture);
  const longitudinalSegments = quality > .72 ? 22 : 14;
  const crossSegments = quality > .72 ? 14 : 9;

  const hull = setShadow(new THREE.Mesh(createHullGeometry(longitudinalSegments, crossSegments), materials.hull));
  hull.name = "painted-lapstrake-hull";
  body.add(hull);
  const innerHull = setShadow(new THREE.Mesh(createHullGeometry(longitudinalSegments, crossSegments, true), materials.innerHull), false, true);
  innerHull.name = "varnished-inner-hull";
  body.add(innerHull);

  for (const side of [-1, 1] as const) {
    const gunwale = setShadow(new THREE.Mesh(new THREE.TubeGeometry(sideCurve(side), quality > .7 ? 72 : 40, .044, quality > .7 ? 10 : 7, false), materials.darkWood));
    gunwale.name = side < 0 ? "port-gunwale" : "starboard-gunwale";
    body.add(gunwale);
    const waterline = new THREE.Mesh(new THREE.TubeGeometry(waterlineCurve(side), quality > .7 ? 54 : 30, .018, 6, false), materials.rope);
    waterline.name = "cream-waterline-inlay";
    waterline.castShadow = false;
    body.add(waterline);

    const label = new THREE.Mesh(new THREE.PlaneGeometry(1.18, .37), materials.label);
    label.name = "central-park-rowboat-marking";
    label.position.set(side * .79, .33, .26);
    label.rotation.y = side * Math.PI / 2;
    body.add(label);
  }

  for (const z of [-1.55, -.77, 0, .77, 1.55]) {
    const rib = setShadow(new THREE.Mesh(new THREE.TubeGeometry(ribCurve(z), quality > .7 ? 28 : 18, .023, 6, false), materials.darkWood));
    rib.name = "steam-bent-oak-rib";
    body.add(rib);
  }

  for (const z of [-1.04, -.05, .95]) {
    const u = (z + HALF_LENGTH) / (HALF_LENGTH * 2);
    const seatWidth = Math.max(.72, (stationShape(u).width - .07) * 2);
    const seat = setShadow(new THREE.Mesh(new RoundedBoxGeometry(seatWidth, .09, .3, quality > .7 ? 4 : 2, .035), materials.varnishedWood));
    seat.name = "varnished-rowing-bench";
    seat.position.set(0, .51, z);
    body.add(seat);
  }

  for (const x of [-.22, 0, .22]) {
    const floorboard = setShadow(new THREE.Mesh(new RoundedBoxGeometry(.16, .045, 3.08, 2, .018), materials.varnishedWood), false, true);
    floorboard.name = "slatted-floorboard";
    floorboard.position.set(x, .1, .02);
    body.add(floorboard);
  }

  for (const side of [-1, 1] as const) {
    const lock = new THREE.Group();
    lock.name = side < 0 ? "port-bronze-oarlock" : "starboard-bronze-oarlock";
    lock.position.set(side * .77, .65, .2);
    const post = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.025, .03, .13, 10), materials.metal));
    post.position.y = -.03;
    lock.add(post);
    const ring = setShadow(new THREE.Mesh(new THREE.TorusGeometry(.075, .018, 7, 16), materials.metal));
    ring.rotation.x = Math.PI / 2;
    ring.rotation.y = Math.PI / 2;
    ring.position.y = .04;
    lock.add(ring);
    body.add(lock);
  }

  const ropeCoil = setShadow(new THREE.Mesh(new THREE.TorusGeometry(.19, .022, 7, quality > .7 ? 36 : 20), materials.rope));
  ropeCoil.name = "bow-mooring-rope";
  ropeCoil.rotation.x = Math.PI / 2;
  ropeCoil.position.set(.24, .64, -1.82);
  body.add(ropeCoil);
  const bowEye = setShadow(new THREE.Mesh(new THREE.TorusGeometry(.055, .012, 6, 16), materials.metal));
  bowEye.name = "bronze-bow-eye";
  bowEye.position.set(0, .57, -2.45);
  body.add(bowEye);

  const portOar = buildOar(-1, materials, quality);
  const starboardOar = buildOar(1, materials, quality);
  body.add(portOar.rig, starboardOar.rig);

  return { body, oars: [portOar, starboardOar] as [ParkRowboatOar, ParkRowboatOar], ownedTextures: [labelTexture] };
}

/**
 * Procedural, driveable Central Park rowboat. The hull faces local -Z.
 * `entryPoint`, `seatTransform`, and `cameraTransform` follow the boat in world
 * space, including its subtle floating motion.
 */
export class ParkRowboat {
  readonly root = new THREE.Group();
  readonly floatPivot = new THREE.Group();
  readonly body: THREE.Group;
  readonly driverEntryPoint = new THREE.Object3D();
  readonly entryPoint = this.driverEntryPoint;
  readonly seatTransform = new THREE.Object3D();
  readonly cameraTransform = new THREE.Object3D();
  readonly collisionBounds = new THREE.Box3(
    new THREE.Vector3(-.88, -.38, -2.65),
    new THREE.Vector3(.88, .77, 2.65),
  );
  readonly collisionRadius = .94;
  readonly maxForwardSpeed = 4.8;
  readonly maxReverseSpeed = 2.15;
  readonly oars: [ParkRowboatOar, ParkRowboatOar];

  private readonly ownedTextures: THREE.Texture[];
  private speed = 0;
  private steerAngle = 0;
  private rowEffort = 0;
  private oarPhase = 0;
  private elapsedTime = 0;
  private disposed = false;

  constructor(textures: GameTextures, options: ParkRowboatOptions = {}) {
    const quality = THREE.MathUtils.clamp(options.quality ?? 1, .35, 1);
    const built = buildBoat(textures, quality, options.boatNumber ?? 7);
    this.body = built.body;
    this.oars = built.oars;
    this.ownedTextures = built.ownedTextures;

    this.root.name = options.name ?? "central-park-lake-rowboat";
    this.root.position.copy(options.position ?? new THREE.Vector3());
    this.root.rotation.y = options.rotationY ?? 0;
    this.root.add(this.floatPivot);
    this.floatPivot.name = "rowboat-floating-pivot";
    this.floatPivot.add(this.body);

    this.driverEntryPoint.name = "rowboat-entry-point";
    this.driverEntryPoint.position.set(-1.05, .05, .3);
    this.driverEntryPoint.rotation.y = -Math.PI / 2;
    this.root.add(this.driverEntryPoint);

    this.seatTransform.name = "rower-seat-transform";
    this.seatTransform.position.set(0, .61, .93);
    this.floatPivot.add(this.seatTransform);

    this.cameraTransform.name = "rower-camera-transform";
    this.cameraTransform.position.set(0, 1.28, .96);
    this.cameraTransform.rotation.x = -.045;
    this.floatPivot.add(this.cameraTransform);

    this.root.userData.interactable = true;
    this.root.userData.interactionKind = "park-rowboat";
    this.root.userData.interactionLabel = "Row across The Lake";
    this.root.userData.boatNumber = options.boatNumber ?? 7;
    options.scene?.add(this.root);
    this.root.updateMatrixWorld(true);
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

  /** Advances lightweight rowing dynamics and optionally follows a water height sampler. */
  update(
    deltaSeconds: number,
    input: ParkRowboatDriveInput,
    waterHeightAt?: (x: number, z: number) => number,
  ) {
    if (this.disposed) return this;
    const delta = THREE.MathUtils.clamp(deltaSeconds, 0, .08);
    const throttle = THREE.MathUtils.clamp(input.throttle, -1, 1);
    const steering = THREE.MathUtils.clamp(input.steering, -1, 1);
    const brake = THREE.MathUtils.clamp(input.brake ?? 0, 0, 1);
    this.elapsedTime += delta;
    this.rowEffort += (Math.max(Math.abs(throttle), Math.abs(steering) * .62) - this.rowEffort) * (1 - Math.exp(-5.5 * delta));
    this.oarPhase += delta * (1.7 + this.rowEffort * 3.1 + Math.abs(this.speed) * .18);

    const targetSteer = steering * .62;
    this.steerAngle += (targetSteer - this.steerAngle) * (1 - Math.exp(-6.5 * delta));
    if (Math.abs(throttle) > .02) {
      const limit = throttle > 0 ? this.maxForwardSpeed : this.maxReverseSpeed;
      const ratio = THREE.MathUtils.clamp(Math.abs(this.speed) / limit, 0, 1);
      this.speed += throttle * (throttle > 0 ? 2.75 : 1.85) * (1 - ratio * .66) * delta;
    } else {
      const waterDrag = .34 + Math.abs(this.speed) * .18;
      this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - waterDrag * delta);
    }
    if (brake > .01) this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - (2.3 + brake * 3.6) * delta);
    this.speed = THREE.MathUtils.clamp(this.speed, -this.maxReverseSpeed, this.maxForwardSpeed);

    const distance = this.speed * delta;
    const directionalAuthority = .32 + Math.min(1, Math.abs(this.speed) / 1.8) * .68;
    this.root.rotation.y -= this.steerAngle * directionalAuthority * delta * (this.speed < 0 ? -.72 : 1);
    this.root.position.x -= Math.sin(this.root.rotation.y) * distance;
    this.root.position.z -= Math.cos(this.root.rotation.y) * distance;
    if (waterHeightAt) this.root.position.y = waterHeightAt(this.root.position.x, this.root.position.z);

    this.animate(this.elapsedTime);
    this.root.updateMatrixWorld(true);
    return this;
  }

  /** Animates buoyancy and the paired rowing stroke without adding physics cost. */
  animate(elapsedSeconds: number) {
    if (this.disposed) return this;
    const effort = THREE.MathUtils.clamp(this.rowEffort, 0, 1);
    const wake = Math.min(1, Math.abs(this.speed) / this.maxForwardSpeed);
    this.floatPivot.position.y = Math.sin(elapsedSeconds * .92) * .016 + Math.sin(elapsedSeconds * 1.61 + .8) * .007;
    this.floatPivot.rotation.x = Math.sin(elapsedSeconds * .57 + 1.1) * .008 - Math.abs(this.speed) * .0014;
    this.floatPivot.rotation.z = Math.sin(elapsedSeconds * .76) * .012 - this.steerAngle * .022 * wake;

    const sweep = Math.sin(this.oarPhase) * (.08 + effort * .47);
    const dip = Math.cos(this.oarPhase) * effort;
    for (const [index, oar] of this.oars.entries()) {
      const side = index === 0 ? -1 : 1;
      oar.rig.rotation.y = side * (-.04 + sweep);
      oar.rig.rotation.z = side * (-.075 - Math.max(0, dip) * .11);
      oar.blade.rotation.x = (dip > 0 ? .05 : .48) * effort;
    }
    return this;
  }

  stop() {
    this.speed = 0;
    this.rowEffort = 0;
    return this;
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

export function createParkRowboat(textures: GameTextures, options: ParkRowboatOptions = {}) {
  return new ParkRowboat(textures, options);
}
