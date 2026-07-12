import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

export type TrainInteriorQuality = "mobile" | "desktop";
export type TrainInteriorPhase = "CRUISING" | "APPROACHING" | "DWELL" | "DEPARTING" | "COMPLETE" | "FAILED";
export type TrainDoorSide = -1 | 1;

export type TrainInteriorStop = {
  name: string;
  side: TrainDoorSide;
};

export type TrainInteriorJourney = {
  readonly destination: TrainInteriorStop;
  readonly intermediateStops: readonly TrainInteriorStop[];
  readonly origin: string;
  readonly route: "N" | "R" | "5";
  readonly service: string;
};

export type TrainInteriorEvent =
  | { type: "INTERMEDIATE_STOP"; stop: string }
  | { type: "PUSHED_OUT"; stop: string }
  | { type: "DESTINATION_READY"; stop: string }
  | { type: "WRONG_DOOR"; stop: string }
  | { type: "MISSED_STOP"; stop: string }
  | { type: "ARRIVED"; stop: string };

export type TrainInteriorSnapshot = {
  cameraOffset: THREE.Vector3;
  cameraRoll: number;
  crowdPressure: number;
  destination: string;
  doorsOpen: boolean;
  event: TrainInteriorEvent | null;
  exitWaypoint: THREE.Vector3;
  objective: string;
  phase: TrainInteriorPhase;
  prompt: string;
  secondsRemaining: number;
  stop: string;
};

export const TRAIN_INTERIOR_JOURNEYS = {
  FIFTH_TO_LEXINGTON: {
    destination: { name: "Lexington Av / 59 St", side: 1 },
    intermediateStops: [],
    origin: "5 Av / 59 St",
    route: "N",
    service: "Queens-bound Broadway Local",
  },
  LEXINGTON_TO_WEST_FARMS: {
    destination: { name: "West Farms Sq–E Tremont Av", side: -1 },
    intermediateStops: [
      { name: "86 St", side: 1 },
      { name: "125 St", side: -1 },
      { name: "E 180 St", side: 1 },
    ],
    origin: "Lexington Av / 59 St",
    route: "5",
    service: "Uptown / Bronx Express",
  },
} as const satisfies Record<string, TrainInteriorJourney>;

type DoorRig = {
  correctMarker: THREE.Mesh;
  left: THREE.Object3D;
  right: THREE.Object3D;
  side: TrainDoorSide;
  warningLights: THREE.Mesh[];
  z: number;
};

type PassengerRig = {
  armLeft: THREE.Group;
  armRight: THREE.Group;
  base: THREE.Vector3;
  group: THREE.Group;
  head: THREE.Group;
  phase: number;
};

const CAR_HALF_WIDTH = 1.36;
const CAR_HALF_LENGTH = 9.2;
const DOOR_Z = [-5.85, 0, 5.85] as const;
const PLAYER_EYE_Y = 1.48;
const CRUISE_SECONDS = 9;
const APPROACH_SECONDS = 3.5;
const DWELL_SECONDS = 7.5;
const DEPART_SECONDS = 3.2;

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([20, 23, 22, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("TrainInteriorWorld requires canvas support");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

function routeTexture(journey: TrainInteriorJourney) {
  return canvasTexture(1536, 312, (context, width, height) => {
    context.fillStyle = "#f4f1e9"; context.fillRect(0, 0, width, height);
    context.fillStyle = "#181b1a"; context.font = "700 42px Helvetica, Arial, sans-serif"; context.fillText(`${journey.route}  ${journey.service}`, 58, 62);
    const stops = [journey.origin, ...journey.intermediateStops.map(stop => stop.name), journey.destination.name];
    const start = 88, end = width - 88, lineY = 166;
    context.strokeStyle = journey.route === "5" ? "#00933c" : "#f5b800"; context.lineWidth = 18; context.beginPath(); context.moveTo(start, lineY); context.lineTo(end, lineY); context.stroke();
    context.font = "650 25px Helvetica, Arial, sans-serif"; context.textAlign = "center"; context.textBaseline = "top";
    stops.forEach((stop, index) => {
      const x = THREE.MathUtils.lerp(start, end, index / Math.max(1, stops.length - 1));
      context.beginPath(); context.arc(x, lineY, index === stops.length - 1 ? 19 : 14, 0, Math.PI * 2); context.fillStyle = "#fff"; context.fill(); context.strokeStyle = "#151716"; context.lineWidth = 6; context.stroke();
      context.save(); context.translate(x, lineY + 34); context.rotate(index % 2 ? -.14 : .14); context.fillStyle = "#191b1a"; context.fillText(stop, 0, 0); context.restore();
    });
  });
}

function destinationTexture(journey: TrainInteriorJourney) {
  return canvasTexture(1024, 256, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, 0); gradient.addColorStop(0, "#080b09"); gradient.addColorStop(.5, "#17211b"); gradient.addColorStop(1, "#080b09");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.strokeStyle = "#8ea995"; context.lineWidth = 6; context.strokeRect(8, 8, width - 16, height - 16);
    context.fillStyle = "#ccefb2"; context.textAlign = "center"; context.textBaseline = "middle"; context.font = "700 58px Helvetica, Arial, sans-serif"; context.fillText(`NEXT · ${journey.destination.name.toUpperCase()}`, width / 2, 100);
    context.fillStyle = "#f2f5ed"; context.font = "650 28px Helvetica, Arial, sans-serif"; context.letterSpacing = "6px"; context.fillText("MOVE TO THE ILLUMINATED EXIT", width / 2, 176);
  });
}

function advertisementTexture(index: number) {
  const campaigns = [
    ["SLOTH & STEADY", "THE CITY REWARDS PATIENCE", "#d4e79e", "#183d2c"],
    ["CANOPY CLUB", "MEMBERSHIP GROWS ON YOU", "#f2c27c", "#43291f"],
    ["TAKE THE LOCAL", "SEE EVERY BRANCH", "#8ad1d0", "#172f3d"],
    ["NO RUSH HOUR", "BREATHE BETWEEN STOPS", "#e8b1be", "#43233b"],
  ][index % 4];
  return canvasTexture(768, 320, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, campaigns[3]); gradient.addColorStop(1, "#101714"); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.globalAlpha = .2; context.fillStyle = campaigns[2];
    for (let ring = 0; ring < 7; ring++) { context.beginPath(); context.arc(width * .8, height * .54, 28 + ring * 22, 0, Math.PI * 2); context.strokeStyle = campaigns[2]; context.lineWidth = 5; context.stroke(); }
    context.globalAlpha = 1; context.fillStyle = campaigns[2]; context.fillRect(0, 0, 18, height);
    context.fillStyle = "#f9f5e9"; context.font = "800 64px Helvetica, Arial, sans-serif"; context.fillText(campaigns[0], 52, 104);
    context.fillStyle = campaigns[2]; context.font = "700 28px Helvetica, Arial, sans-serif"; context.letterSpacing = "5px"; context.fillText(campaigns[1], 54, 166);
    context.fillStyle = "rgba(255,255,255,.7)"; context.font = "500 22px Georgia, serif"; context.fillText("A kinder commute, one stop at a time.", 54, 242);
    context.strokeStyle = "rgba(255,255,255,.3)"; context.lineWidth = 5; context.strokeRect(9, 9, width - 18, height - 18);
  });
}

function createPassenger(index: number, quality: TrainInteriorQuality) {
  const group = new THREE.Group(); group.name = "detailed-train-passenger";
  const palettes = [
    ["#6d4436", "#ae785c", "#25201e"], ["#264d5a", "#d4a27f", "#34251e"], ["#625b35", "#80573f", "#171715"],
    ["#69405d", "#e0b58d", "#643c29"], ["#313e64", "#9a674d", "#24201d"], ["#4b5d45", "#c18767", "#463026"],
  ][index % 6];
  const coat = new THREE.MeshStandardMaterial({ color: palettes[0], roughness: .72 }), skin = new THREE.MeshStandardMaterial({ color: palettes[1], roughness: .82 });
  const dark = new THREE.MeshStandardMaterial({ color: palettes[2], roughness: .67 }), accent = new THREE.MeshStandardMaterial({ color: index % 2 ? "#d8b962" : "#b84b42", roughness: .62 });
  const segments = quality === "desktop" ? 16 : 10;
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(.23, .32, 5, segments), dark); hips.position.y = .86; group.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.29, .67, 7, segments), coat); torso.position.y = 1.34; torso.scale.z = .78; group.add(torso);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.085, .1, .15, segments), skin); neck.position.y = 1.78; group.add(neck);
  const headGroup = new THREE.Group(); headGroup.position.y = 2.02; group.add(headGroup);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.215, segments, Math.max(8, segments - 2)), skin); head.scale.set(.86, 1.08, .92); headGroup.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.221, segments, 10, 0, Math.PI * 2, 0, Math.PI * .56), dark); hair.position.y = .04; hair.scale.set(.88, 1.08, .94); headGroup.add(hair);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 6), skin); nose.position.set(0, -.015, -.202); nose.scale.set(.7, .8, 1.2); headGroup.add(nose);
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.015, 7, 5), dark); eye.position.set(side * .069, .035, -.197); headGroup.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.042, 8, 6), skin); ear.position.set(side * .196, .01, 0); ear.scale.x = .48; headGroup.add(ear);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.085, .52, 5, segments), dark); leg.position.set(side * .13, .4, 0); group.add(leg);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(.19, .105, .34, 3, .04), new THREE.MeshStandardMaterial({ color: "#111312", roughness: .48 })); shoe.position.set(side * .13, .07, -.08); group.add(shoe);
  }
  const armLeft = new THREE.Group(), armRight = new THREE.Group();
  for (const [side, arm] of [[-1, armLeft], [1, armRight]] as const) {
    arm.position.set(side * .34, 1.53, 0); arm.rotation.z = side * -.11;
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .48, 5, segments), coat); sleeve.position.y = -.22; arm.add(sleeve);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.075, 10, 8), skin); hand.position.y = -.52; arm.add(hand); group.add(arm);
  }
  if (index % 3 === 0) {
    const phone = new THREE.Mesh(new RoundedBoxGeometry(.13, .23, .018, 3, .02), dark); phone.position.set(.28, 1.04, -.23); phone.rotation.z = -.16; group.add(phone); armRight.rotation.x = -.55;
  } else if (index % 3 === 1) {
    const bag = new THREE.Mesh(new RoundedBoxGeometry(.34, .43, .16, 4, .045), accent); bag.position.set(.36, .9, .03); group.add(bag);
    const strap = new THREE.Mesh(new THREE.TorusGeometry(.27, .018, 6, 20, Math.PI), dark); strap.position.set(.24, 1.22, .03); strap.rotation.z = -.35; group.add(strap);
  } else {
    const book = new THREE.Mesh(new RoundedBoxGeometry(.26, .34, .045, 3, .02), accent); book.position.set(-.27, 1.08, -.25); book.rotation.z = .13; group.add(book); armLeft.rotation.x = -.52;
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(.2, .03, 7, 20), accent); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.72; group.add(scarf);
  group.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = quality === "desktop"; object.receiveShadow = true; } });
  return { armLeft, armRight, base: new THREE.Vector3(), group, head: headGroup, phase: index * 1.73 } satisfies PassengerRig;
}

function addCylinderBetween(parent: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material) {
  const direction = end.clone().sub(start), mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 12), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); parent.add(mesh); return mesh;
}

/**
 * A self-contained, performance-tiered subway-car level and onboard quest.
 * The caller owns player input; this class owns car collision, stops, crowds,
 * doors, motion cues and the door-positioning failure/success rules.
 */
export class TrainInteriorWorld {
  readonly root = new THREE.Group();
  readonly spawn = new THREE.Vector3(0, PLAYER_EYE_Y, 6.9);
  readonly cameraOffset = new THREE.Vector3();
  readonly journey: TrainInteriorJourney;
  readonly quality: TrainInteriorQuality;
  private readonly doors: DoorRig[] = [];
  private readonly passengers: PassengerRig[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly tunnelPanels: THREE.Mesh[] = [];
  private phase: TrainInteriorPhase = "CRUISING";
  private phaseTime = 0;
  private elapsed = 0;
  private stopIndex = 0;
  private pendingEvent: TrainInteriorEvent | null = null;
  private doorsOpenAmount = 0;
  private cameraRoll = 0;

  constructor(scene: THREE.Scene, textures: GameTextures, journey: TrainInteriorJourney, quality: TrainInteriorQuality = "desktop") {
    this.journey = journey; this.quality = quality; this.root.name = `train-interior-${journey.route}`; scene.add(this.root);
    this.buildCar(textures); this.buildCrowd(); this.reset();
  }

  get currentStop() { return this.stopIndex < this.journey.intermediateStops.length ? this.journey.intermediateStops[this.stopIndex] : this.journey.destination; }
  get isDestination() { return this.stopIndex >= this.journey.intermediateStops.length; }
  get exitWaypoint() { return new THREE.Vector3(this.journey.destination.side * 1.13, PLAYER_EYE_Y, 0); }

  private buildCar(textures: GameTextures) {
    const shell = new THREE.Group(); shell.name = "train-interior-shell"; this.root.add(shell);
    const steel = new THREE.MeshStandardMaterial({ color: "#b9c0bc", metalness: .58, roughness: .31, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .006 });
    const panel = new THREE.MeshStandardMaterial({ color: "#e2dfd3", metalness: .05, roughness: .48 }), dark = new THREE.MeshStandardMaterial({ color: "#1b2221", metalness: .3, roughness: .38 });
    const floorMaterial = new THREE.MeshStandardMaterial({ color: "#414844", roughness: .88, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .014 });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#6d8790", roughness: .09, metalness: .05, transmission: .14, transparent: true, opacity: .76 });
    const seatMaterial = new THREE.MeshPhysicalMaterial({ color: "#315f78", roughness: .34, clearcoat: .5, clearcoatRoughness: .28 });
    const floor = new THREE.Mesh(new RoundedBoxGeometry(CAR_HALF_WIDTH * 2, .14, CAR_HALF_LENGTH * 2, 4, .04), floorMaterial); floor.position.y = -.09; floor.receiveShadow = true; shell.add(floor);
    const ceiling = new THREE.Mesh(new RoundedBoxGeometry(CAR_HALF_WIDTH * 2, .16, CAR_HALF_LENGTH * 2, 5, .06), panel); ceiling.position.y = 2.72; shell.add(ceiling);
    for (const end of [-1, 1]) {
      const wall = new THREE.Mesh(new RoundedBoxGeometry(CAR_HALF_WIDTH * 2, 2.75, .15, 4, .04), panel); wall.position.set(0, 1.32, end * CAR_HALF_LENGTH); shell.add(wall);
      const endDoor = new THREE.Mesh(new RoundedBoxGeometry(1.02, 2.15, .08, 4, .035), steel); endDoor.position.set(0, 1.15, end * (CAR_HALF_LENGTH - .09)); shell.add(endDoor);
      const endWindow = new THREE.Mesh(new RoundedBoxGeometry(.6, .82, .025, 4, .04), glass); endWindow.position.set(0, 1.5, end * (CAR_HALF_LENGTH - .14)); shell.add(endWindow);
    }
    for (const side of [-1, 1] as const) {
      for (const z of [-8.2, -3.9, 2, 8.2]) {
        const wallPanel = new THREE.Mesh(new RoundedBoxGeometry(.13, 2.7, 2.15, 4, .035), panel); wallPanel.position.set(side * CAR_HALF_WIDTH, 1.33, z); shell.add(wallPanel);
      }
      for (const z of [-7.9, -2.95, 2.95, 7.9]) {
        const window = new THREE.Mesh(new RoundedBoxGeometry(.045, .92, 1.38, 4, .04), glass); window.position.set(side * (CAR_HALF_WIDTH - .08), 1.72, z); shell.add(window);
        const tunnel = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 2.3), new THREE.MeshBasicMaterial({ color: z % 2 ? "#1a2729" : "#202c2b" })); tunnel.position.set(side * (CAR_HALF_WIDTH + .14), 1.58, z); tunnel.rotation.y = side * -Math.PI / 2; shell.add(tunnel); this.tunnelPanels.push(tunnel);
      }
      for (const z of [-7.1, -2.9, 2.9, 7.1]) {
        const bench = new THREE.Mesh(new RoundedBoxGeometry(.48, .18, 2.05, 5, .07), seatMaterial); bench.position.set(side * (CAR_HALF_WIDTH - .27), .58, z); shell.add(bench);
        const back = new THREE.Mesh(new RoundedBoxGeometry(.17, .78, 2.05, 5, .07), seatMaterial); back.position.set(side * (CAR_HALF_WIDTH - .08), .94, z); back.rotation.z = side * -.09; shell.add(back);
      }
      for (const z of DOOR_Z) {
        const frame = new THREE.Mesh(new RoundedBoxGeometry(.16, 2.55, 2.05, 4, .035), dark); frame.position.set(side * (CAR_HALF_WIDTH - .005), 1.3, z); shell.add(frame);
        const doorGroup = new THREE.Group(); doorGroup.position.set(side * (CAR_HALF_WIDTH - .04), 1.25, z); shell.add(doorGroup);
        const leaves: THREE.Object3D[] = [];
        for (const half of [-1, 1]) {
          const leaf = new THREE.Mesh(new RoundedBoxGeometry(.09, 2.28, .92, 4, .025), steel); leaf.position.z = half * .47; doorGroup.add(leaf); leaves.push(leaf);
          const window = new THREE.Mesh(new RoundedBoxGeometry(.03, .66, .46, 4, .035), glass); window.position.set(-side * .055, .34, half * .47); doorGroup.add(window);
        }
        const marker = new THREE.Mesh(new RoundedBoxGeometry(.035, 2.58, 2.13, 4, .04), new THREE.MeshBasicMaterial({ color: "#c7ff77", transparent: true, opacity: 0, toneMapped: false })); marker.position.set(side * (CAR_HALF_WIDTH - .105), 1.3, z); marker.name = "destination-door-marker"; shell.add(marker);
        const warningLights: THREE.Mesh[] = [];
        for (const offset of [-.62, .62]) { const light = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshBasicMaterial({ color: "#ff9c4f", toneMapped: false })); light.position.set(side * (CAR_HALF_WIDTH - .12), 2.45, z + offset); shell.add(light); warningLights.push(light); }
        this.doors.push({ correctMarker: marker, left: leaves[0], right: leaves[1], side, warningLights, z });
      }
    }
    const pole = new THREE.MeshStandardMaterial({ color: "#b7c0bd", metalness: .93, roughness: .14 });
    for (const z of [-7.9, -3.95, 0, 3.95, 7.9]) {
      addCylinderBetween(shell, new THREE.Vector3(0, .08, z), new THREE.Vector3(0, 2.62, z), .026, pole);
      for (const side of [-1, 1]) addCylinderBetween(shell, new THREE.Vector3(0, 2.05, z), new THREE.Vector3(side * 1.08, 2.05, z), .022, pole);
      const grabBar = new THREE.Mesh(new THREE.TorusGeometry(.115, .017, 8, 16), new THREE.MeshStandardMaterial({ color: "#e5aa3b", roughness: .54 })); grabBar.position.set(.33 * (z % 2 ? 1 : -1), 1.84, z); shell.add(grabBar);
    }
    for (const z of [-7.25, -2.45, 2.45, 7.25]) {
      const light = new THREE.Mesh(new RoundedBoxGeometry(1.62, .055, 1.5, 4, .03), new THREE.MeshBasicMaterial({ color: "#f0f6e8", toneMapped: false })); light.position.set(0, 2.61, z); shell.add(light);
      if (this.quality === "desktop") { const glow = new THREE.PointLight("#e9f3e1", 10, 5.8, 1.65); glow.position.set(0, 2.42, z); shell.add(glow); }
    }
    const routeMap = routeTexture(this.journey); this.ownedTextures.push(routeMap);
    const map = new THREE.Mesh(new RoundedBoxGeometry(2.36, .66, .045, 3, .02), new THREE.MeshBasicMaterial({ map: routeMap, toneMapped: false })); map.position.set(0, 2.23, -8.83); shell.add(map);
    const destination = destinationTexture(this.journey); this.ownedTextures.push(destination);
    const display = new THREE.Mesh(new RoundedBoxGeometry(2.22, .5, .05, 3, .02), new THREE.MeshBasicMaterial({ map: destination, toneMapped: false })); display.position.set(0, 2.18, 8.82); display.rotation.y = Math.PI; shell.add(display);
    for (let index = 0; index < 4; index++) {
      const adTexture = advertisementTexture(index); this.ownedTextures.push(adTexture);
      const ad = new THREE.Mesh(new RoundedBoxGeometry(.055, .54, 1.3, 3, .025), new THREE.MeshBasicMaterial({ map: adTexture, toneMapped: false })); ad.position.set((index % 2 ? 1 : -1) * (CAR_HALF_WIDTH - .07), 2.25, -4.15 + index * 2.8); shell.add(ad);
    }
    const fill = new THREE.HemisphereLight("#eff5e8", "#26302e", .82); this.root.add(fill);
  }

  private buildCrowd() {
    const count = this.quality === "desktop" ? 9 : 5;
    const positions: [number, number][] = [[-.55, 6.2], [.5, 4.25], [-.48, 2.45], [.52, .85], [-.52, -1.6], [.55, -3.35], [-.48, -5.15], [.5, -7], [0, 7.7]];
    for (let index = 0; index < count; index++) {
      const passenger = createPassenger(index, this.quality), [x, z] = positions[index]; passenger.base.set(x, 0, z); passenger.group.position.copy(passenger.base); passenger.group.rotation.y = index % 2 ? .1 : Math.PI + .1; this.passengers.push(passenger); this.root.add(passenger.group);
    }
  }

  reset() {
    this.phase = "CRUISING"; this.phaseTime = 0; this.elapsed = 0; this.stopIndex = 0; this.pendingEvent = null; this.doorsOpenAmount = 0; this.cameraOffset.set(0, 0, 0); this.cameraRoll = 0;
    this.setDoorAmount(0); return this;
  }

  private setDoorAmount(amount: number) {
    this.doorsOpenAmount = THREE.MathUtils.clamp(amount, 0, 1);
    for (const door of this.doors) {
      const active = door.side === this.currentStop.side;
      const opening = active ? this.doorsOpenAmount * .82 : 0;
      door.left.position.z = -.47 - opening; door.right.position.z = .47 + opening;
      const destinationMarker = this.isDestination && active && door.z === 0 && (this.phase === "APPROACHING" || this.phase === "DWELL");
      (door.correctMarker.material as THREE.MeshBasicMaterial).opacity = destinationMarker ? .13 + Math.sin(this.elapsed * 5) * .055 : 0;
      for (const light of door.warningLights) light.visible = active && (this.phase === "APPROACHING" || this.phase === "DWELL") && Math.floor(this.elapsed * 4) % 2 === 0;
    }
  }

  private doorZone(player: THREE.Vector3, side = this.currentStop.side, requiredZ?: number) {
    if (Math.sign(player.x) !== side || Math.abs(player.x) < .87) return null;
    if (requiredZ !== undefined) return Math.abs(player.z - requiredZ) < 1.08 ? { side, z: requiredZ } : null;
    let closest: number = DOOR_Z[0], distance = Infinity;
    for (const z of DOOR_Z) { const candidate = Math.abs(player.z - z); if (candidate < distance) { closest = z; distance = candidate; } }
    return distance < 1.08 ? { side, z: closest } : null;
  }

  private enterPhase(phase: TrainInteriorPhase) {
    this.phase = phase; this.phaseTime = 0;
    if (phase === "DWELL") this.pendingEvent = this.isDestination ? { type: "DESTINATION_READY", stop: this.currentStop.name } : { type: "INTERMEDIATE_STOP", stop: this.currentStop.name };
  }

  private advanceTimeline(player: THREE.Vector3) {
    if (this.phase === "CRUISING" && this.phaseTime >= CRUISE_SECONDS) this.enterPhase("APPROACHING");
    else if (this.phase === "APPROACHING" && this.phaseTime >= APPROACH_SECONDS) this.enterPhase("DWELL");
    else if (this.phase === "DWELL" && this.phaseTime >= DWELL_SECONDS) {
      if (this.isDestination) { this.phase = "FAILED"; this.pendingEvent = { type: "MISSED_STOP", stop: this.currentStop.name }; }
      else this.enterPhase("DEPARTING");
    } else if (this.phase === "DEPARTING" && this.phaseTime >= DEPART_SECONDS) { this.stopIndex++; this.enterPhase("CRUISING"); }
    if (this.phase === "DWELL" && !this.isDestination && this.doorsOpenAmount > .58 && this.doorZone(player)) {
      player.x = this.currentStop.side * (CAR_HALF_WIDTH + .28); this.phase = "FAILED"; this.pendingEvent = { type: "PUSHED_OUT", stop: this.currentStop.name };
    }
  }

  private updateCrowd(delta: number, player: THREE.Vector3) {
    const stopActivity = this.phase === "APPROACHING" || this.phase === "DWELL";
    const pressure = stopActivity ? THREE.MathUtils.smoothstep(this.phaseTime, 0, this.phase === "DWELL" ? 2 : APPROACH_SECONDS) : 0;
    this.passengers.forEach((passenger, index) => {
      const target = passenger.base.clone();
      if (stopActivity && index < Math.ceil(this.passengers.length * .55)) {
        target.x = this.currentStop.side * (.78 + index % 2 * .13); target.z = DOOR_Z[index % DOOR_Z.length] + (index % 3 - 1) * .3;
      }
      const playerDistance = Math.hypot(player.x - passenger.group.position.x, player.z - passenger.group.position.z);
      if (playerDistance < .82) { const part = passenger.group.position.x <= player.x ? -1 : 1; target.x += part * (.82 - playerDistance) * .6; }
      passenger.group.position.lerp(target, 1 - Math.exp(-delta * (stopActivity ? 2.8 : 1.3)));
      passenger.group.position.y = Math.sin(this.elapsed * 2.4 + passenger.phase) * .006;
      passenger.group.rotation.z = Math.sin(this.elapsed * 2.1 + passenger.phase) * .008 + this.cameraRoll * .36;
      passenger.head.rotation.y = Math.sin(this.elapsed * .38 + passenger.phase) * .16;
      passenger.armLeft.rotation.x = Math.sin(this.elapsed * 1.1 + passenger.phase) * .045 - pressure * .08;
      passenger.armRight.rotation.x = Math.sin(this.elapsed * 1.1 + passenger.phase + 1) * .045 - pressure * .08;
    });
    return pressure;
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    if (this.phase === "FAILED" || this.phase === "COMPLETE") return;
    player.x = THREE.MathUtils.clamp(player.x, -1.08, 1.08); player.z = THREE.MathUtils.clamp(player.z, -8.58, 8.58); player.y = PLAYER_EYE_Y;
    for (const passenger of this.passengers) {
      const dx = player.x - passenger.group.position.x, dz = player.z - passenger.group.position.z, distance = Math.hypot(dx, dz);
      if (distance > 0 && distance < .36) { const correction = (.36 - distance) / distance; player.x += dx * correction; player.z += dz * correction; velocity.multiplyScalar(.72); }
    }
    player.x = THREE.MathUtils.clamp(player.x, -1.08, 1.08); player.z = THREE.MathUtils.clamp(player.z, -8.58, 8.58);
  }

  /** Call once per animation frame after applying the caller's player input. */
  update(delta: number, player: THREE.Vector3, velocity: THREE.Vector3): TrainInteriorSnapshot {
    const step = Math.min(Math.max(delta, 0), .08); this.elapsed += step; this.phaseTime += step;
    this.resolvePlayer(player, velocity);
    if (this.phase !== "FAILED" && this.phase !== "COMPLETE") this.advanceTimeline(player);
    let doorAmount = 0;
    if (this.phase === "DWELL") doorAmount = Math.min(THREE.MathUtils.smoothstep(this.phaseTime, 0, 1.05), 1 - THREE.MathUtils.smoothstep(this.phaseTime, DWELL_SECONDS - 1.1, DWELL_SECONDS));
    this.setDoorAmount(doorAmount);
    const crowdPressure = this.updateCrowd(step, player);
    const speed = this.phase === "CRUISING" ? 1 : this.phase === "APPROACHING" ? Math.max(0, 1 - this.phaseTime / APPROACH_SECONDS) : this.phase === "DEPARTING" ? Math.min(1, this.phaseTime / DEPART_SECONDS) : 0;
    this.cameraRoll = Math.sin(this.elapsed * 1.32) * .008 * speed + Math.sin(this.elapsed * 7.4) * .0018 * speed;
    this.cameraOffset.set(Math.sin(this.elapsed * 1.32) * .012 * speed, Math.sin(this.elapsed * 7.4) * .006 * speed, 0);
    this.tunnelPanels.forEach((panel, index) => {
      const span = CAR_HALF_LENGTH * 2, next = panel.position.z - step * speed * 14 + index * .0001;
      panel.position.z = ((next + CAR_HALF_LENGTH) % span + span) % span - CAR_HALF_LENGTH;
    });
    const event = this.pendingEvent; this.pendingEvent = null;
    const zone = this.doorZone(player, this.journey.destination.side, 0);
    const seconds = this.phase === "CRUISING" ? CRUISE_SECONDS - this.phaseTime : this.phase === "APPROACHING" ? APPROACH_SECONDS - this.phaseTime : this.phase === "DWELL" ? DWELL_SECONDS - this.phaseTime : DEPART_SECONDS - this.phaseTime;
    const objective = this.isDestination && (this.phase === "APPROACHING" || this.phase === "DWELL")
      ? `Move to the illuminated ${this.journey.destination.side < 0 ? "left" : "right"} doors for ${this.journey.destination.name}`
      : `Stay clear of the doors until ${this.journey.destination.name}`;
    return {
      cameraOffset: this.cameraOffset,
      cameraRoll: this.cameraRoll,
      crowdPressure,
      destination: this.journey.destination.name,
      doorsOpen: this.doorsOpenAmount > .65,
      event,
      exitWaypoint: this.exitWaypoint,
      objective,
      phase: this.phase,
      prompt: this.isDestination && this.phase === "DWELL" && this.doorsOpenAmount > .65 && zone ? "EXIT TRAIN" : "",
      secondsRemaining: Math.max(0, Math.ceil(seconds)),
      stop: this.currentStop.name,
    };
  }

  /** Route an E/touch interaction through the destination-door rules. */
  interact(player: THREE.Vector3): TrainInteriorEvent | null {
    if (this.phase !== "DWELL" || !this.isDestination || this.doorsOpenAmount <= .65) return null;
    if (!this.doorZone(player, this.journey.destination.side, 0)) return { type: "WRONG_DOOR", stop: this.currentStop.name };
    this.phase = "COMPLETE"; this.setDoorAmount(1); return { type: "ARRIVED", stop: this.currentStop.name };
  }

  dispose() {
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
