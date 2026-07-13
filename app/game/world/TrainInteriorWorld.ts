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
  armLeftBaseX: number;
  armRight: THREE.Group;
  armRightBaseX: number;
  base: THREE.Vector3;
  group: THREE.Group;
  head: THREE.Group;
  movable: boolean;
  phase: number;
  seated: boolean;
};

type TrainSurfaceMaps = {
  fabric: THREE.Texture;
  leather: THREE.Texture;
  paint: THREE.Texture;
  skin: THREE.Texture;
  vinyl: THREE.Texture;
};

const CAR_HALF_WIDTH = 1.36;
const CAR_HALF_LENGTH = 9.2;
const DOOR_Z = [-5.85, 0, 5.85] as const;
const PLAYER_EYE_Y = 1.48;
const CRUISE_SECONDS = 4.6;
const APPROACH_SECONDS = 2.2;
const DWELL_SECONDS = 4.8;
const DEPART_SECONDS = 2;

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

function microSurfaceTexture(kind: keyof TrainSurfaceMaps) {
  return canvasTexture(256, 256, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4, hash = Math.sin(x * 15.37 + y * 91.17 + kind.length * 21.1) * 34821.731, noise = hash - Math.floor(hash);
      let value = 180;
      if (kind === "fabric") value = 148 + noise * 30 + ((x + y) % 6 === 0 ? 35 : 0);
      else if (kind === "leather") value = 132 + noise * 46 + Math.sin(x * .13 + Math.sin(y * .04) * 4) * 16;
      else if (kind === "skin") value = 198 + noise * 22 + Math.sin(x * .04 + y * .02) * 6;
      else if (kind === "vinyl") value = 164 + noise * 22 + Math.sin(x * .18) * 11;
      else value = 176 + noise * 20 + Math.sin(y * .06) * 5;
      image.data[index] = image.data[index + 1] = image.data[index + 2] = THREE.MathUtils.clamp(value, 0, 255); image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  });
}

function fitCanvasText(context: CanvasRenderingContext2D, text: string, maximumWidth: number, initialSize: number, weight = 700) {
  let size = initialSize;
  do { context.font = `${weight} ${size}px Helvetica, Arial, sans-serif`; size -= 2; } while (size > 17 && context.measureText(text).width > maximumWidth);
}

function routeTexture(journey: TrainInteriorJourney) {
  return canvasTexture(1536, 312, (context, width, height) => {
    context.fillStyle = "#f4f1e9"; context.fillRect(0, 0, width, height);
    context.fillStyle = "#181b1a"; context.font = "700 42px Helvetica, Arial, sans-serif"; context.fillText(`${journey.route}  ${journey.service}`, 58, 62);
    const stops = [journey.origin, ...journey.intermediateStops.map(stop => stop.name), journey.destination.name];
    const start = 88, end = width - 88, lineY = 166;
    context.strokeStyle = journey.route === "5" ? "#00933c" : "#f5b800"; context.lineWidth = 18; context.beginPath(); context.moveTo(start, lineY); context.lineTo(end, lineY); context.stroke();
    context.textAlign = "center"; context.textBaseline = "top";
    stops.forEach((stop, index) => {
      const x = THREE.MathUtils.lerp(start, end, index / Math.max(1, stops.length - 1));
      context.beginPath(); context.arc(x, lineY, index === stops.length - 1 ? 19 : 14, 0, Math.PI * 2); context.fillStyle = "#fff"; context.fill(); context.strokeStyle = "#151716"; context.lineWidth = 6; context.stroke();
      context.save(); context.translate(x, lineY + 30); context.rotate(index % 2 ? -.06 : .06); context.fillStyle = "#191b1a"; fitCanvasText(context, stop, Math.max(165, (end - start) / stops.length - 18), 25, 650); context.fillText(stop, 0, 0); context.restore();
      const transfers = stop.includes("Lexington") ? ["N", "R", "W", "4", "5", "6"] : stop.includes("West Farms") ? ["2", "5"] : stop.includes("5 Av") ? ["N", "R", "W"] : stop === "E 180 St" ? ["2", "5"] : [journey.route];
      const bulletStart = x - (transfers.length - 1) * 15;
      transfers.forEach((line, lineIndex) => {
        context.beginPath(); context.arc(bulletStart + lineIndex * 30, 273, 12, 0, Math.PI * 2); context.fillStyle = ["N", "R", "W"].includes(line) ? "#fccc0a" : ["4", "5", "6"].includes(line) ? "#00933c" : "#ee352e"; context.fill();
        context.fillStyle = line === "N" || line === "R" || line === "W" ? "#111" : "#fff"; context.font = "800 17px Helvetica, Arial, sans-serif"; context.textBaseline = "middle"; context.fillText(line, bulletStart + lineIndex * 30, 273); context.textBaseline = "top";
      });
    });
  });
}

function destinationTexture(journey: TrainInteriorJourney) {
  return canvasTexture(1024, 256, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, 0); gradient.addColorStop(0, "#080b09"); gradient.addColorStop(.5, "#17211b"); gradient.addColorStop(1, "#080b09");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.strokeStyle = "#8ea995"; context.lineWidth = 6; context.strokeRect(8, 8, width - 16, height - 16);
    context.fillStyle = "#ccefb2"; context.textAlign = "center"; context.textBaseline = "middle"; fitCanvasText(context, `NEXT · ${journey.destination.name.toUpperCase()}`, width - 70, 58, 700); context.fillText(`NEXT · ${journey.destination.name.toUpperCase()}`, width / 2, 100);
    context.fillStyle = "#f2f5ed"; fitCanvasText(context, "MOVE TO THE ILLUMINATED EXIT", width - 90, 28, 650); context.letterSpacing = "4px"; context.fillText("MOVE TO THE ILLUMINATED EXIT", width / 2, 176);
  });
}

function routeBulletTexture(route: TrainInteriorJourney["route"]) {
  return canvasTexture(256, 256, (context, width, height) => {
    context.clearRect(0, 0, width, height); context.beginPath(); context.arc(width / 2, height / 2, 112, 0, Math.PI * 2); context.fillStyle = route === "5" ? "#00933c" : "#fccc0a"; context.fill();
    context.fillStyle = route === "5" ? "#fff" : "#111"; context.font = "900 158px Helvetica, Arial, sans-serif"; context.textAlign = "center"; context.textBaseline = "middle"; context.fillText(route, width / 2, height / 2 + 8);
  });
}

function servicePanelTexture(kind: "accessibility" | "door" | "emergency" | "intercom", route: TrainInteriorJourney["route"]) {
  return canvasTexture(640, 420, (context, width, height) => {
    const accent = kind === "accessibility" ? "#1677bb" : kind === "emergency" ? "#b51f2b" : kind === "intercom" ? "#e1b63d" : "#304a6a";
    const copy = kind === "accessibility" ? ["PRIORITY SEATING", "Please offer this seat", "to seniors and riders with disabilities"]
      : kind === "emergency" ? ["EMERGENCY INSTRUCTIONS", "Notify train crew", "Use intercom · remain on board"]
      : kind === "intercom" ? ["PASSENGER INTERCOM", "Press once · speak clearly", "Crew will answer"]
      : ["DO NOT LEAN ON DOOR", "Stand clear of closing doors", `${route} SERVICE`];
    context.fillStyle = "#f4f3ec"; context.fillRect(0, 0, width, height); context.fillStyle = accent; context.fillRect(0, 0, width, 68);
    context.strokeStyle = "#202321"; context.lineWidth = 7; context.strokeRect(10, 10, width - 20, height - 20);
    context.fillStyle = "#fff"; context.textAlign = "center"; context.textBaseline = "middle"; fitCanvasText(context, copy[0], width - 38, 30, 800); context.fillText(copy[0], width / 2, 35);
    if (kind === "accessibility") {
      context.strokeStyle = accent; context.lineWidth = 17; context.beginPath(); context.arc(132, 163, 47, 0, Math.PI * 2); context.stroke(); context.beginPath(); context.arc(162, 260, 73, 0, Math.PI * 2); context.stroke();
      context.beginPath(); context.moveTo(130, 212); context.lineTo(190, 310); context.lineTo(276, 310); context.stroke();
    } else {
      context.fillStyle = accent; context.beginPath(); context.arc(135, 205, 77, 0, Math.PI * 2); context.fill();
      context.fillStyle = "#fff"; context.font = "900 95px Helvetica, Arial, sans-serif"; context.fillText(kind === "emergency" ? "!" : kind === "intercom" ? "●" : "↔", 135, 209);
    }
    context.textAlign = "left"; context.fillStyle = "#161918"; fitCanvasText(context, copy[1], width - 300, 36, 750); context.fillText(copy[1], 272, 185);
    context.fillStyle = "#505653"; fitCanvasText(context, copy[2], width - 300, 25, 600); context.fillText(copy[2], 272, 239);
    context.fillStyle = accent; context.fillRect(272, 279, 292, 8); fitCanvasText(context, "SLOTH PARK TRANSIT", width - 300, 34, 800); context.fillText("SLOTH PARK TRANSIT", 272, 338);
  });
}

function exteriorTexture(kind: "platform" | "tunnel", stationName = "") {
  return canvasTexture(1024, 384, (context, width, height) => {
    if (kind === "tunnel") {
      const gradient = context.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, "#0b1112"); gradient.addColorStop(.52, "#202b2b"); gradient.addColorStop(1, "#080b0c"); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
      for (let x = 0; x < width; x += 188) { context.fillStyle = "#36413f"; context.fillRect(x, 0, 24, height); context.fillStyle = "rgba(210,226,208,.16)"; context.fillRect(x + 24, 0, 5, height); }
      context.strokeStyle = "#17201f"; context.lineWidth = 30; context.beginPath(); context.moveTo(0, 360); context.bezierCurveTo(340, 322, 720, 405, width, 342); context.stroke();
      context.strokeStyle = "#62716a"; context.lineWidth = 7; context.beginPath(); context.moveTo(0, 338); context.bezierCurveTo(340, 300, 720, 383, width, 320); context.stroke();
      for (let x = 105; x < width; x += 520) { context.fillStyle = "#b44230"; context.fillRect(x, 128, 38, 72); context.shadowColor = "#ff4c38"; context.shadowBlur = 24; context.fillStyle = "#ff4c38"; context.beginPath(); context.arc(x + 19, 145, 10, 0, Math.PI * 2); context.fill(); context.shadowBlur = 0; }
    } else {
      context.fillStyle = "#d8d1bd"; context.fillRect(0, 0, width, height);
      for (let y = 0; y < height; y += 62) { context.strokeStyle = "rgba(79,72,61,.34)"; context.lineWidth = 3; context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
      for (let x = 0; x < width; x += 112) { context.strokeStyle = "rgba(79,72,61,.24)"; context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
      for (let x = 48; x < width; x += 340) { context.fillStyle = "#26302d"; context.fillRect(x, 0, 42, height); context.fillStyle = "#161a19"; context.fillRect(x + 48, 122, 274, 112); context.fillStyle = "#f4f0e5"; context.font = "700 28px Helvetica, Arial, sans-serif"; context.fillText(stationName.toUpperCase(), x + 68, 172); context.fillStyle = "#aeb8b3"; context.font = "650 19px Helvetica, Arial, sans-serif"; context.fillText("SLOTH PARK TRANSIT", x + 68, 207); }
      context.fillStyle = "#e9c637"; context.fillRect(0, height - 42, width, 42);
    }
  });
}

function advertisementTexture(index: number) {
  const campaigns = [
    ["SLOTH & STEADY", "THE CITY REWARDS PATIENCE", "#d4e79e", "#183d2c"],
    ["CANOPY CLUB", "MEMBERSHIP GROWS ON YOU", "#f2c27c", "#43291f"],
    ["TAKE THE LOCAL", "SEE EVERY BRANCH", "#8ad1d0", "#172f3d"],
    ["NO RUSH HOUR", "BREATHE BETWEEN STOPS", "#e8b1be", "#43233b"],
    ["NIGHT OWL", "AFTER-DARK CANOPY TOURS", "#b6b2ec", "#21254c"],
    ["HANG IN THERE", "BETTER DAYS ARE BRANCHING", "#f0cf76", "#4b341a"],
  ][index % 6];
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

function createPassenger(index: number, quality: TrainInteriorQuality, pose: "holding" | "reading" | "seated" | "standing", surfaceMaps: TrainSurfaceMaps) {
  const group = new THREE.Group(); group.name = "detailed-train-passenger";
  const palettes = [
    ["#6d4436", "#ae785c", "#25201e"], ["#264d5a", "#d4a27f", "#34251e"], ["#625b35", "#80573f", "#171715"],
    ["#69405d", "#e0b58d", "#643c29"], ["#313e64", "#9a674d", "#24201d"], ["#4b5d45", "#c18767", "#463026"],
  ][index % 6];
  const coat = new THREE.MeshStandardMaterial({ color: palettes[0], roughness: .72, map: surfaceMaps.fabric, bumpMap: surfaceMaps.fabric, bumpScale: .012 }), skin = new THREE.MeshStandardMaterial({ color: palettes[1], roughness: .82, map: surfaceMaps.skin, bumpMap: surfaceMaps.skin, bumpScale: .004 });
  const dark = new THREE.MeshStandardMaterial({ color: palettes[2], roughness: .67, map: surfaceMaps.fabric, bumpMap: surfaceMaps.fabric, bumpScale: .014 }), accent = new THREE.MeshStandardMaterial({ color: index % 2 ? "#d8b962" : "#b84b42", roughness: .62, map: surfaceMaps.fabric, bumpMap: surfaceMaps.fabric, bumpScale: .01 });
  const segments = quality === "desktop" ? 22 : 12;
  const stature = .92 + index % 5 * .032; group.scale.set(stature * (.96 + index % 2 * .025), stature, stature);
  const hips = new THREE.Mesh(new THREE.CapsuleGeometry(.23, .32, 5, segments), dark); hips.position.y = .86; group.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.29, .67, 7, segments), coat); torso.position.y = 1.34; torso.scale.z = .78; group.add(torso);
  for (const side of [-1, 1]) { const lapel = new THREE.Mesh(new THREE.ConeGeometry(.105, .38, 3), accent); lapel.position.set(side * .105, 1.54, -.245); lapel.rotation.z = side * .22; lapel.rotation.x = .14; group.add(lapel); }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.085, .1, .15, segments), skin); neck.position.y = 1.78; group.add(neck);
  const headGroup = new THREE.Group(); headGroup.position.y = 2.02; group.add(headGroup);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.215, segments, Math.max(8, segments - 2)), skin); head.scale.set(.86, 1.08, .92); headGroup.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.221, segments, 10, 0, Math.PI * 2, 0, Math.PI * .56), dark); hair.position.y = .04; hair.scale.set(.88, 1.08, .94); headGroup.add(hair);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.032, 8, 6), skin); nose.position.set(0, -.015, -.202); nose.scale.set(.7, .8, 1.2); headGroup.add(nose);
  if (index % 4 === 2) {
    const eyewear = new THREE.MeshStandardMaterial({ color: "#202321", metalness: .58, roughness: .28 });
    for (const side of [-1, 1]) { const lens = new THREE.Mesh(new THREE.TorusGeometry(.052, .008, 6, 16), eyewear); lens.position.set(side * .061, .035, -.211); headGroup.add(lens); }
    const bridge = new THREE.Mesh(new RoundedBoxGeometry(.055, .009, .01, 2, .002), eyewear); bridge.position.set(0, .035, -.214); headGroup.add(bridge);
  }
  const legs: THREE.Mesh[] = [], shoes: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.015, 7, 5), dark); eye.position.set(side * .069, .035, -.197); headGroup.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.042, 8, 6), skin); ear.position.set(side * .196, .01, 0); ear.scale.x = .48; headGroup.add(ear);
    if (quality === "desktop") {
      const brow = new THREE.Mesh(new RoundedBoxGeometry(.062, .011, .008, 3, .004), dark); brow.position.set(side * .069, .087, -.207); brow.rotation.z = side * -.08; headGroup.add(brow);
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(.042, 10, 8), skin); cheek.scale.set(1.12, .66, .48); cheek.position.set(side * .108, -.04, -.184); headGroup.add(cheek);
    }
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.085, .52, 5, segments), dark); leg.position.set(side * .13, .4, 0); group.add(leg); legs.push(leg);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(.19, .105, .34, 4, .04), new THREE.MeshStandardMaterial({ color: "#111312", roughness: .48, map: surfaceMaps.leather, bumpMap: surfaceMaps.leather, bumpScale: .012 })); shoe.position.set(side * .13, .07, -.08); group.add(shoe); shoes.push(shoe);
  }
  if (quality === "desktop") {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(.039, .005, 6, 16, Math.PI), new THREE.MeshStandardMaterial({ color: "#774946", roughness: .72, map: surfaceMaps.skin })); mouth.position.set(0, -.075, -.203); mouth.rotation.z = Math.PI; headGroup.add(mouth);
    const coatSeam = new THREE.Mesh(new RoundedBoxGeometry(.014, .5, .012, 2, .004), accent); coatSeam.position.set(0, 1.31, -.248); group.add(coatSeam);
    for (const y of [1.42, 1.27, 1.12]) { const button = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .008, 8), dark); button.rotation.x = Math.PI / 2; button.position.set(0, y, -.264); group.add(button); }
  }
  const armLeft = new THREE.Group(), armRight = new THREE.Group();
  for (const [side, arm] of [[-1, armLeft], [1, armRight]] as const) {
    arm.position.set(side * .34, 1.53, 0); arm.rotation.z = side * -.11;
    const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .48, 5, segments), coat); sleeve.position.y = -.22; arm.add(sleeve);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.075, segments, Math.max(8, segments - 4)), skin); hand.position.y = -.52; arm.add(hand);
    if (quality === "desktop") for (let finger = -1; finger <= 1; finger++) {
      const digit = new THREE.Mesh(new THREE.CapsuleGeometry(.012, .055, 4, 8), skin); digit.position.set(finger * .023, -.58, -.012); digit.rotation.x = -.18; arm.add(digit);
    }
    group.add(arm);
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
  if (pose === "holding") {
    armLeft.rotation.z = 2.72; armLeft.rotation.x = -.08;
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(.071, .012, 6, 14), accent); cuff.position.set(-.69, 1.94, 0); cuff.rotation.x = Math.PI / 2; group.add(cuff);
  } else if (pose === "reading") {
    armLeft.rotation.x = -.72; armRight.rotation.x = -.72; armLeft.rotation.z = -.26; armRight.rotation.z = .26;
  } else if (pose === "seated") {
    hips.position.y = .56; torso.position.y = 1.04; neck.position.y = 1.49; headGroup.position.y = 1.73; scarf.position.y = 1.43;
    legs.forEach((leg, legIndex) => { leg.position.set(legIndex ? .13 : -.13, .38, -.2); leg.rotation.x = 1.02; });
    shoes.forEach((shoe, shoeIndex) => { shoe.position.set(shoeIndex ? .13 : -.13, .17, -.54); });
    armLeft.position.y = armRight.position.y = 1.23; armLeft.rotation.x = armRight.rotation.x = -.48;
  }
  group.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = quality === "desktop"; object.receiveShadow = true; } });
  return { armLeft, armLeftBaseX: armLeft.rotation.x, armRight, armRightBaseX: armRight.rotation.x, base: new THREE.Vector3(), group, head: headGroup, movable: pose !== "seated", phase: index * 1.73, seated: pose === "seated" } satisfies PassengerRig;
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
  readonly spawn = new THREE.Vector3(-.42, PLAYER_EYE_Y, 8.28);
  readonly cameraOffset = new THREE.Vector3();
  /** Stable raster-ad targets. Call setAdvertisementTexture after loading generated creative. */
  readonly adSlots: THREE.Mesh[] = [];
  readonly journey: TrainInteriorJourney;
  readonly quality: TrainInteriorQuality;
  private readonly doors: DoorRig[] = [];
  private readonly passengers: PassengerRig[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly platformTextures = new Map<string, THREE.Texture>();
  private readonly surfaceMaps: TrainSurfaceMaps;
  private readonly tunnelPanels: THREE.Mesh[] = [];
  private tunnelTexture: THREE.Texture | null = null;
  private phase: TrainInteriorPhase = "CRUISING";
  private phaseTime = 0;
  private elapsed = 0;
  private stopIndex = 0;
  private pendingEvent: TrainInteriorEvent | null = null;
  private doorsOpenAmount = 0;
  private cameraRoll = 0;
  private disposed = false;
  private wrongDoorNotified = false;

  constructor(scene: THREE.Scene, textures: GameTextures, journey: TrainInteriorJourney, quality: TrainInteriorQuality = "desktop") {
    this.journey = journey; this.quality = quality; this.root.name = `train-interior-${journey.route}`; scene.add(this.root);
    this.surfaceMaps = {
      fabric: microSurfaceTexture("fabric"), leather: microSurfaceTexture("leather"), paint: microSurfaceTexture("paint"), skin: microSurfaceTexture("skin"), vinyl: microSurfaceTexture("vinyl"),
    };
    for (const texture of Object.values(this.surfaceMaps)) { texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(3, 3); texture.anisotropy = quality === "desktop" ? 8 : 4; this.ownedTextures.push(texture); }
    this.buildCar(textures); this.buildCrowd(); this.reset();
  }

  get currentStop() { return this.stopIndex < this.journey.intermediateStops.length ? this.journey.intermediateStops[this.stopIndex] : this.journey.destination; }
  get isDestination() { return this.stopIndex >= this.journey.intermediateStops.length; }
  get exitWaypoint() { return new THREE.Vector3(this.journey.destination.side * (CAR_HALF_WIDTH + .36), PLAYER_EYE_Y, 0); }

  /** Replaces one authored fallback without taking ownership of the supplied texture. */
  setAdvertisementTexture(slotIndex: number, texture: THREE.Texture) {
    const slot = this.adSlots[slotIndex]; if (!slot) return false;
    texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = Math.max(texture.anisotropy, 4);
    const material = slot.material as THREE.MeshBasicMaterial; material.map = texture; material.needsUpdate = true; return true;
  }

  private loadGeneratedAdvertisements() {
    if (typeof document === "undefined") return;
    const loader = new THREE.TextureLoader(), generatedAds: Array<[number, string]> = [[1, "/game/ads/bronx-bound.webp"], [6, "/game/ads/ramble-after-dark.webp"]];
    generatedAds.forEach(([slot, url]) => {
      loader.load(url, texture => {
        if (this.disposed) { texture.dispose(); return; }
        this.ownedTextures.push(texture); this.setAdvertisementTexture(slot, texture);
      }, undefined, () => undefined);
    });
  }

  private buildCar(textures: GameTextures) {
    const shell = new THREE.Group(); shell.name = "train-interior-shell"; this.root.add(shell);
    const steel = new THREE.MeshStandardMaterial({ color: "#c3c9c6", metalness: .68, roughness: .27, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .004 });
    const brushedSteel = new THREE.MeshStandardMaterial({ color: "#9da7a3", metalness: .78, roughness: .3, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .008 });
    const panel = new THREE.MeshStandardMaterial({ color: "#e7e2d5", metalness: .04, roughness: .43, map: this.surfaceMaps.paint, bumpMap: this.surfaceMaps.paint, bumpScale: .008 }), dark = new THREE.MeshStandardMaterial({ color: "#161b1a", metalness: .34, roughness: .34, map: this.surfaceMaps.paint, bumpMap: this.surfaceMaps.paint, bumpScale: .008 });
    const floorMaterial = new THREE.MeshStandardMaterial({ color: "#414844", roughness: .88, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .014 });
    const glass = new THREE.MeshPhysicalMaterial({ color: "#6d8790", roughness: .09, metalness: .05, transmission: .14, transparent: true, opacity: .76 });
    const seatBlue = new THREE.MeshPhysicalMaterial({ color: "#2870a2", roughness: .31, clearcoat: .58, clearcoatRoughness: .25, map: this.surfaceMaps.vinyl, bumpMap: this.surfaceMaps.vinyl, bumpScale: .01 });
    const seatOrange = new THREE.MeshPhysicalMaterial({ color: "#e79632", roughness: .33, clearcoat: .5, clearcoatRoughness: .28, map: this.surfaceMaps.vinyl, bumpMap: this.surfaceMaps.vinyl, bumpScale: .01 });
    const floor = new THREE.Mesh(new RoundedBoxGeometry(CAR_HALF_WIDTH * 2, .14, CAR_HALF_LENGTH * 2, 4, .04), floorMaterial); floor.position.y = -.09; floor.receiveShadow = true; shell.add(floor);
    const ceiling = new THREE.Mesh(new RoundedBoxGeometry(CAR_HALF_WIDTH * 2, .16, CAR_HALF_LENGTH * 2, 5, .06), panel); ceiling.position.y = 2.72; shell.add(ceiling);
    for (const side of [-1, 1]) {
      const cove = new THREE.Mesh(new RoundedBoxGeometry(.34, .17, CAR_HALF_LENGTH * 1.98, 5, .055), panel); cove.position.set(side * 1.18, 2.55, 0); cove.rotation.z = side * .32; shell.add(cove);
      const lowerSkirt = new THREE.Mesh(new RoundedBoxGeometry(.12, .56, CAR_HALF_LENGTH * 1.98, 3, .025), brushedSteel); lowerSkirt.position.set(side * 1.32, .29, 0); shell.add(lowerSkirt);
    }
    const centreFloorInlay = new THREE.Mesh(new RoundedBoxGeometry(1.24, .012, CAR_HALF_LENGTH * 1.96, 2, .01), new THREE.MeshStandardMaterial({ color: "#4f5652", roughness: .92 })); centreFloorInlay.position.y = .005; shell.add(centreFloorInlay);
    const routeBullet = routeBulletTexture(this.journey.route); this.ownedTextures.push(routeBullet);
    for (const end of [-1, 1]) {
      const wall = new THREE.Mesh(new RoundedBoxGeometry(CAR_HALF_WIDTH * 2, 2.75, .15, 4, .04), panel); wall.position.set(0, 1.32, end * CAR_HALF_LENGTH); shell.add(wall);
      const endGasket = new THREE.Mesh(new RoundedBoxGeometry(1.14, 2.28, .085, 4, .035), dark); endGasket.position.set(0, 1.16, end * (CAR_HALF_LENGTH - .16)); shell.add(endGasket);
      const endDoor = new THREE.Mesh(new RoundedBoxGeometry(1.02, 2.15, .08, 4, .035), steel); endDoor.position.set(0, 1.15, end * (CAR_HALF_LENGTH - .22)); shell.add(endDoor);
      const endWindow = new THREE.Mesh(new RoundedBoxGeometry(.6, .82, .025, 4, .04), glass); endWindow.position.set(0, 1.5, end * (CAR_HALF_LENGTH - .14)); shell.add(endWindow);
      const kickPlate = new THREE.Mesh(new RoundedBoxGeometry(.72, .3, .025, 3, .02), brushedSteel); kickPlate.position.set(0, .3, end * (CAR_HALF_LENGTH - .28)); shell.add(kickPlate);
      const routeBadge = new THREE.Mesh(new THREE.PlaneGeometry(.48, .48), new THREE.MeshBasicMaterial({ map: routeBullet, transparent: true, toneMapped: false, side: THREE.FrontSide })); routeBadge.position.set(.86, 2.14, end * (CAR_HALF_LENGTH - .27)); routeBadge.rotation.y = end < 0 ? 0 : Math.PI; shell.add(routeBadge);
    }
    this.tunnelTexture = exteriorTexture("tunnel"); this.tunnelTexture.wrapS = THREE.RepeatWrapping; this.tunnelTexture.repeat.set(1.25, 1); this.ownedTextures.push(this.tunnelTexture);
    for (const stop of [...this.journey.intermediateStops, this.journey.destination]) {
      const texture = exteriorTexture("platform", stop.name); texture.wrapS = THREE.RepeatWrapping; texture.repeat.set(1.05, 1); this.platformTextures.set(stop.name, texture); this.ownedTextures.push(texture);
    }
    const doorNoticeTexture = servicePanelTexture("door", this.journey.route); this.ownedTextures.push(doorNoticeTexture);
    for (const side of [-1, 1] as const) {
      for (const z of [-8.2, -3.9, 2, 8.2]) {
        const wallPanel = new THREE.Mesh(new RoundedBoxGeometry(.13, 2.7, 2.15, 4, .035), panel); wallPanel.position.set(side * CAR_HALF_WIDTH, 1.33, z); shell.add(wallPanel);
      }
      for (const z of [-7.9, -2.95, 2.95, 7.9]) {
        const windowGasket = new THREE.Mesh(new RoundedBoxGeometry(.065, 1.08, 1.58, 4, .055), dark); windowGasket.position.set(side * (CAR_HALF_WIDTH - .045), 1.72, z); shell.add(windowGasket);
        const outside = new THREE.Mesh(new THREE.PlaneGeometry(1.3, .8), new THREE.MeshBasicMaterial({ map: this.tunnelTexture, side: THREE.DoubleSide, toneMapped: false })); outside.position.set(side * (CAR_HALF_WIDTH - .087), 1.72, z); outside.rotation.y = side * -Math.PI / 2; outside.userData.side = side; outside.userData.windowIndex = this.tunnelPanels.length; shell.add(outside); this.tunnelPanels.push(outside);
        const window = new THREE.Mesh(new RoundedBoxGeometry(.035, .9, 1.4, 4, .04), glass); window.position.set(side * (CAR_HALF_WIDTH - .115), 1.72, z); shell.add(window);
        const sill = new THREE.Mesh(new RoundedBoxGeometry(.13, .07, 1.48, 3, .025), brushedSteel); sill.position.set(side * (CAR_HALF_WIDTH - .1), 1.21, z); shell.add(sill);
      }
      for (const z of [-7.1, -2.9, 2.9, 7.1]) {
        for (const seatIndex of [-1, 0, 1]) {
          const prioritySeat = seatIndex === -1 && Math.abs(z) > 6;
          const material = prioritySeat || this.journey.route !== "5" ? seatBlue : seatOrange;
          const seatZ = z + seatIndex * .64;
          const cushion = new THREE.Mesh(new RoundedBoxGeometry(.5, .17, .59, 6, .075), material); cushion.position.set(side * (CAR_HALF_WIDTH - .29), .57, seatZ); cushion.rotation.z = side * .025; shell.add(cushion);
          const back = new THREE.Mesh(new RoundedBoxGeometry(.16, .73, .59, 6, .07), material); back.position.set(side * (CAR_HALF_WIDTH - .095), .93, seatZ); back.rotation.z = side * -.095; shell.add(back);
          const seatDivide = new THREE.Mesh(new RoundedBoxGeometry(.055, .06, .025, 2, .012), brushedSteel); seatDivide.position.set(side * (CAR_HALF_WIDTH - .55), .65, seatZ + .31); shell.add(seatDivide);
        }
      }
      for (const z of DOOR_Z) {
        for (const edge of [-1, 1]) { const jamb = new THREE.Mesh(new RoundedBoxGeometry(.16, 2.5, .14, 3, .028), dark); jamb.position.set(side * (CAR_HALF_WIDTH - .005), 1.27, z + edge * 1.02); shell.add(jamb); }
        const header = new THREE.Mesh(new RoundedBoxGeometry(.16, .18, 2.1, 3, .028), dark); header.position.set(side * (CAR_HALF_WIDTH - .005), 2.48, z); shell.add(header);
        const threshold = new THREE.Mesh(new RoundedBoxGeometry(.24, .045, 2.02, 3, .018), new THREE.MeshStandardMaterial({ color: "#e2bd3d", metalness: .32, roughness: .56 })); threshold.position.set(side * (CAR_HALF_WIDTH - .03), .025, z); shell.add(threshold);
        const doorGroup = new THREE.Group(); doorGroup.position.set(side * (CAR_HALF_WIDTH - .04), 1.25, z); shell.add(doorGroup);
        const leaves: THREE.Object3D[] = [];
        for (const half of [-1, 1]) {
          const leaf = new THREE.Mesh(new RoundedBoxGeometry(.09, 2.28, .92, 4, .025), steel); leaf.position.z = half * .47; doorGroup.add(leaf); leaves.push(leaf);
          const leafGasket = new THREE.Mesh(new RoundedBoxGeometry(.035, 2.23, .045, 2, .012), dark); leafGasket.position.set(-side * .052, 0, -half * .43); leaf.add(leafGasket);
          const windowGasket = new THREE.Mesh(new RoundedBoxGeometry(.034, .79, .58, 3, .04), dark); windowGasket.position.set(-side * .053, .34, 0); leaf.add(windowGasket);
          const window = new THREE.Mesh(new RoundedBoxGeometry(.025, .67, .47, 4, .035), glass); window.position.set(-side * .074, .34, 0); leaf.add(window);
          const notice = new THREE.Mesh(new THREE.PlaneGeometry(.28, .18), new THREE.MeshBasicMaterial({ map: doorNoticeTexture, toneMapped: false, side: THREE.FrontSide })); notice.position.set(-side * .09, -.53, 0); notice.rotation.y = -side * Math.PI / 2; leaf.add(notice);
        }
        const marker = new THREE.Mesh(new RoundedBoxGeometry(.035, 2.58, 2.13, 4, .04), new THREE.MeshBasicMaterial({ color: "#c7ff77", transparent: true, opacity: 0, toneMapped: false })); marker.position.set(side * (CAR_HALF_WIDTH - .105), 1.3, z); marker.name = "destination-door-marker"; shell.add(marker);
        const warningLights: THREE.Mesh[] = [];
        for (const offset of [-.62, .62]) { const light = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), new THREE.MeshBasicMaterial({ color: "#ff9c4f", toneMapped: false })); light.position.set(side * (CAR_HALF_WIDTH - .12), 2.45, z + offset); shell.add(light); warningLights.push(light); }
        this.doors.push({ correctMarker: marker, left: leaves[0], right: leaves[1], side, warningLights, z });
      }
    }
    const pole = new THREE.MeshStandardMaterial({ color: "#b7c0bd", metalness: .93, roughness: .14 });
    for (const x of [-.58, .58]) addCylinderBetween(shell, new THREE.Vector3(x, 2.08, -8.6), new THREE.Vector3(x, 2.08, 8.6), .024, pole);
    for (const z of [-7.9, -3.95, 0, 3.95, 7.9]) {
      addCylinderBetween(shell, new THREE.Vector3(0, .08, z), new THREE.Vector3(0, 2.62, z), .026, pole);
      for (const side of [-1, 1]) addCylinderBetween(shell, new THREE.Vector3(0, 2.05, z), new THREE.Vector3(side * 1.08, 2.05, z), .022, pole);
      const grabBar = new THREE.Mesh(new THREE.TorusGeometry(.115, .017, 8, 16), new THREE.MeshStandardMaterial({ color: "#e5aa3b", roughness: .54 })); grabBar.position.set(.33 * (z % 2 ? 1 : -1), 1.84, z); shell.add(grabBar);
    }
    for (const z of DOOR_Z) for (const side of [-1, 1]) for (const edge of [-1, 1]) {
      addCylinderBetween(shell, new THREE.Vector3(side * .91, .09, z + edge * 1.12), new THREE.Vector3(side * .91, 2.1, z + edge * 1.12), .022, pole);
    }
    for (const z of [-7.25, -2.45, 2.45, 7.25]) {
      const light = new THREE.Mesh(new RoundedBoxGeometry(1.62, .055, 1.5, 4, .03), new THREE.MeshBasicMaterial({ color: "#f0f6e8", toneMapped: false })); light.position.set(0, 2.61, z); shell.add(light);
      if (this.quality === "desktop") { const glow = new THREE.PointLight("#e9f3e1", 10, 5.8, 1.65); glow.position.set(0, 2.42, z); shell.add(glow); }
    }
    const ventMaterial = new THREE.MeshStandardMaterial({ color: "#707b77", metalness: .78, roughness: .37 });
    for (const z of [-5, 0, 5]) for (let slat = -3; slat <= 3; slat++) {
      const vent = new THREE.Mesh(new RoundedBoxGeometry(.035, .016, 1.12, 2, .006), ventMaterial); vent.position.set(slat * .065, 2.625, z); shell.add(vent);
    }
    const routeMap = routeTexture(this.journey); this.ownedTextures.push(routeMap);
    const map = new THREE.Mesh(new RoundedBoxGeometry(2.36, .66, .045, 3, .02), new THREE.MeshBasicMaterial({ map: routeMap, toneMapped: false })); map.position.set(0, 2.23, -8.83); shell.add(map);
    const destination = destinationTexture(this.journey); this.ownedTextures.push(destination);
    const display = new THREE.Mesh(new RoundedBoxGeometry(2.22, .5, .05, 3, .02), new THREE.MeshBasicMaterial({ map: destination, toneMapped: false })); display.position.set(0, 2.18, 8.82); display.rotation.y = Math.PI; shell.add(display);
    const serviceKinds = ["accessibility", "emergency", "intercom"] as const;
    const serviceTextures = serviceKinds.map(kind => servicePanelTexture(kind, this.journey.route)); this.ownedTextures.push(...serviceTextures);
    serviceKinds.forEach((kind, index) => {
      const side = index === 1 ? 1 : -1, z = [-7.15, 7.35, 7.65][index];
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(.64, .42), new THREE.MeshBasicMaterial({ map: serviceTextures[index], toneMapped: false, side: THREE.FrontSide })); sign.position.set(side * (CAR_HALF_WIDTH - .135), 1.68, z); sign.rotation.y = -side * Math.PI / 2; sign.name = `${kind}-service-sign`; shell.add(sign);
    });
    const intercomCase = new THREE.Mesh(new RoundedBoxGeometry(.08, .48, .3, 4, .035), brushedSteel); intercomCase.position.set(-(CAR_HALF_WIDTH - .12), 1.1, 8.05); shell.add(intercomCase);
    const callButton = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .018, 16), new THREE.MeshStandardMaterial({ color: "#e4bd37", metalness: .2, roughness: .42 })); callButton.rotation.z = Math.PI / 2; callButton.position.set(-(CAR_HALF_WIDTH - .065), 1.02, 8.05); shell.add(callButton);
    for (let hole = -2; hole <= 2; hole++) { const grille = new THREE.Mesh(new THREE.SphereGeometry(.012, 6, 4), dark); grille.position.set(-(CAR_HALF_WIDTH - .06), 1.2, 8.05 + hole * .045); shell.add(grille); }
    const emergencyCase = new THREE.Mesh(new RoundedBoxGeometry(.08, .55, .34, 4, .035), new THREE.MeshStandardMaterial({ color: "#a4242f", roughness: .45, metalness: .1 })); emergencyCase.position.set(CAR_HALF_WIDTH - .11, 1.08, 8); emergencyCase.name = "emergency-equipment-cabinet"; shell.add(emergencyCase);
    const adTextures = Array.from({ length: 6 }, (_, index) => advertisementTexture(index)); this.ownedTextures.push(...adTextures);
    const adPositions = [-7.55, -3.72, 3.72, 7.55];
    for (const side of [-1, 1]) for (let positionIndex = 0; positionIndex < adPositions.length; positionIndex++) {
      const slotIndex = this.adSlots.length, adFrame = new THREE.Mesh(new RoundedBoxGeometry(.07, .65, 1.55, 3, .025), dark); adFrame.position.set(side * (CAR_HALF_WIDTH - .075), 2.24, adPositions[positionIndex]); shell.add(adFrame);
      const material = new THREE.MeshBasicMaterial({ map: adTextures[slotIndex % adTextures.length], side: THREE.FrontSide, toneMapped: false });
      const ad = new THREE.Mesh(new THREE.PlaneGeometry(1.43, .54), material); ad.position.set(side * (CAR_HALF_WIDTH - .125), 2.24, adPositions[positionIndex]); ad.rotation.y = -side * Math.PI / 2; ad.name = `train-interior-ad-slot-${slotIndex}`; ad.userData.adSlot = slotIndex; shell.add(ad); this.adSlots.push(ad);
    }
    this.loadGeneratedAdvertisements();
    const fill = new THREE.HemisphereLight("#eff5e8", "#26302e", .82); this.root.add(fill);
  }

  private buildCrowd() {
    const count = this.quality === "desktop" ? 10 : 6;
    const placements: Array<{ pose: "holding" | "reading" | "seated" | "standing"; rotation: number; x: number; z: number }> = [
      { pose: "seated", rotation: -Math.PI / 2, x: -1.02, z: 7.15 }, { pose: "holding", rotation: .08, x: .42, z: 4.2 },
      { pose: "reading", rotation: Math.PI + .08, x: -.46, z: 2.55 }, { pose: "seated", rotation: Math.PI / 2, x: 1.02, z: 3.05 },
      { pose: "standing", rotation: .16, x: -.48, z: -1.65 }, { pose: "holding", rotation: Math.PI - .1, x: .46, z: -3.35 },
      { pose: "seated", rotation: -Math.PI / 2, x: -1.02, z: -3.02 }, { pose: "reading", rotation: .04, x: .46, z: -5.05 },
      { pose: "seated", rotation: Math.PI / 2, x: 1.02, z: -7.12 }, { pose: "standing", rotation: Math.PI + .15, x: -.42, z: -7.75 },
    ];
    for (let index = 0; index < count; index++) {
      const placement = placements[index], passenger = createPassenger(index, this.quality, placement.pose, this.surfaceMaps); passenger.base.set(placement.x, 0, placement.z); passenger.group.position.copy(passenger.base); passenger.group.rotation.y = placement.rotation; this.passengers.push(passenger); this.root.add(passenger.group);
    }
  }

  reset() {
    this.phase = "CRUISING"; this.phaseTime = 0; this.elapsed = 0; this.stopIndex = 0; this.pendingEvent = null; this.doorsOpenAmount = 0; this.cameraOffset.set(0, 0, 0); this.cameraRoll = 0; this.wrongDoorNotified = false;
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
    this.phase = phase; this.phaseTime = 0; this.wrongDoorNotified = false;
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
      if (stopActivity && passenger.movable && index < Math.ceil(this.passengers.length * .68)) {
        const doorIndex = this.isDestination ? (index % 2 ? 0 : 2) : index % DOOR_Z.length;
        target.x = this.currentStop.side * (.78 + index % 2 * .13); target.z = DOOR_Z[doorIndex] + (index % 3 - 1) * .3;
      }
      const playerDistance = Math.hypot(player.x - passenger.group.position.x, player.z - passenger.group.position.z);
      if (passenger.movable && playerDistance < .82) { const part = passenger.group.position.x <= player.x ? -1 : 1; target.x += part * (.82 - playerDistance) * .6; }
      passenger.group.position.lerp(target, 1 - Math.exp(-delta * (stopActivity ? 2.8 : 1.3)));
      passenger.group.position.y = Math.sin(this.elapsed * (passenger.seated ? 1.3 : 2.4) + passenger.phase) * (passenger.seated ? .002 : .006);
      passenger.group.rotation.z = Math.sin(this.elapsed * 2.1 + passenger.phase) * .008 + this.cameraRoll * .36;
      passenger.head.rotation.y = Math.sin(this.elapsed * .38 + passenger.phase) * .16;
      if (passenger.movable) {
        const leftTarget = passenger.armLeftBaseX + Math.sin(this.elapsed * 1.1 + passenger.phase) * .045 - pressure * .08;
        const rightTarget = passenger.armRightBaseX + Math.sin(this.elapsed * 1.1 + passenger.phase + 1) * .045 - pressure * .08;
        passenger.armLeft.rotation.x += (leftTarget - passenger.armLeft.rotation.x) * Math.min(1, delta * 4);
        passenger.armRight.rotation.x += (rightTarget - passenger.armRight.rotation.x) * Math.min(1, delta * 4);
      }
    });
    return pressure;
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    if (this.phase === "FAILED" || this.phase === "COMPLETE") return;
    player.z = THREE.MathUtils.clamp(player.z, -8.58, 8.58); player.y = PLAYER_EYE_Y;
    const openDoorZ = DOOR_Z.find(z => Math.abs(player.z - z) < .78);
    const passageOpen = openDoorZ !== undefined && this.doorsOpenAmount > .55 && this.phase === "DWELL";
    const minX = passageOpen && this.currentStop.side < 0 ? -(CAR_HALF_WIDTH + .48) : -1.08;
    const maxX = passageOpen && this.currentStop.side > 0 ? CAR_HALF_WIDTH + .48 : 1.08;
    player.x = THREE.MathUtils.clamp(player.x, minX, maxX);
    for (const passenger of this.passengers) {
      const dx = player.x - passenger.group.position.x, dz = player.z - passenger.group.position.z, distance = Math.hypot(dx, dz);
      if (distance > 0 && distance < .36) { const correction = (.36 - distance) / distance; player.x += dx * correction; player.z += dz * correction; velocity.multiplyScalar(.72); }
    }
    player.x = THREE.MathUtils.clamp(player.x, minX, maxX); player.z = THREE.MathUtils.clamp(player.z, -8.58, 8.58);
  }

  private detectDestinationCrossing(player: THREE.Vector3, velocity: THREE.Vector3) {
    if (this.phase !== "DWELL" || !this.isDestination || this.doorsOpenAmount <= .58) return;
    const crossedThreshold = this.journey.destination.side * player.x > CAR_HALF_WIDTH + .08;
    if (!crossedThreshold) { this.wrongDoorNotified = false; return; }
    if (Math.abs(player.z) < .78) {
      this.phase = "COMPLETE"; this.pendingEvent = { type: "ARRIVED", stop: this.currentStop.name }; this.setDoorAmount(1); return;
    }
    if (!this.wrongDoorNotified) this.pendingEvent = { type: "WRONG_DOOR", stop: this.currentStop.name };
    this.wrongDoorNotified = true; player.x = this.journey.destination.side * 1.02; velocity.x = 0;
  }

  /** Call once per animation frame after applying the caller's player input. */
  update(delta: number, player: THREE.Vector3, velocity: THREE.Vector3): TrainInteriorSnapshot {
    const step = Math.min(Math.max(delta, 0), .08); this.elapsed += step; this.phaseTime += step;
    this.resolvePlayer(player, velocity);
    if (this.phase !== "FAILED" && this.phase !== "COMPLETE") this.advanceTimeline(player);
    let doorAmount = 0;
    if (this.phase === "DWELL") doorAmount = Math.min(THREE.MathUtils.smoothstep(this.phaseTime, 0, 1.05), 1 - THREE.MathUtils.smoothstep(this.phaseTime, DWELL_SECONDS - 1.1, DWELL_SECONDS));
    this.setDoorAmount(doorAmount);
    this.detectDestinationCrossing(player, velocity);
    const crowdPressure = this.updateCrowd(step, player);
    const speed = this.phase === "CRUISING" ? 1 : this.phase === "APPROACHING" ? Math.max(0, 1 - this.phaseTime / APPROACH_SECONDS) : this.phase === "DEPARTING" ? Math.min(1, this.phaseTime / DEPART_SECONDS) : 0;
    this.cameraRoll = Math.sin(this.elapsed * 1.32) * .008 * speed + Math.sin(this.elapsed * 7.4) * .0018 * speed;
    this.cameraOffset.set(Math.sin(this.elapsed * 1.32) * .012 * speed, Math.sin(this.elapsed * 7.4) * .006 * speed, 0);
    if (this.tunnelTexture) this.tunnelTexture.offset.x = (this.tunnelTexture.offset.x + step * speed * .82) % 1;
    const platformTexture = this.platformTextures.get(this.currentStop.name) ?? null;
    if (platformTexture) platformTexture.offset.x = (platformTexture.offset.x + step * speed * .16) % 1;
    const platformVisible = this.phase === "APPROACHING" || this.phase === "DWELL" || (this.phase === "DEPARTING" && this.phaseTime < 1.45);
    this.tunnelPanels.forEach(panel => {
      const material = panel.material as THREE.MeshBasicMaterial;
      const map = platformVisible && panel.userData.side === this.currentStop.side ? platformTexture : this.tunnelTexture;
      if (map && material.map !== map) { material.map = map; material.needsUpdate = true; }
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
    this.disposed = true; this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
