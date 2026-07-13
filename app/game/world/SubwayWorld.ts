import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

export type SubwayStationId = "FIFTH_AV" | "LEXINGTON" | "WEST_FARMS";
export type TrainPhase = "AWAY" | "APPROACHING" | "BOARDING" | "DEPARTING";

export const SUBWAY_TRAIN_INTERVAL_SECONDS = 30;

export type SubwayQuality = "mobile" | "balanced" | "ultra";

export type SubwayWorldOptions = {
  /** Scales cosmetic geometry and local lights without changing traversal or progression. */
  quality?: SubwayQuality;
};

type SubwayDetail = {
  radialSegments: number;
  npcCount: number;
  wallAds: number;
  ceilingLights: number;
  trainInterior: boolean;
};

const SUBWAY_DETAIL: Record<SubwayQuality, SubwayDetail> = {
  mobile: { radialSegments: 10, npcCount: 3, wallAds: 4, ceilingLights: 4, trainInterior: false },
  balanced: { radialSegments: 18, npcCount: 5, wallAds: 6, ceilingLights: 6, trainInterior: true },
  ultra: { radialSegments: 24, npcCount: 8, wallAds: 8, ceilingLights: 8, trainInterior: true },
};

const PLATFORM_MIN_Z = -50;
const PLATFORM_MAX_Z = 34;
const PLATFORM_CENTER_Z = (PLATFORM_MIN_Z + PLATFORM_MAX_Z) / 2;
const PLATFORM_LENGTH = PLATFORM_MAX_Z - PLATFORM_MIN_Z;
const CONCOURSE_FLOOR_Y = 4;
const STREET_FLOOR_Y = 8;
const STREET_STAIR_BOTTOM_Z = 28.5;
const STREET_STAIR_TOP_Z = 42;
const TRAIN_APPROACH_DISTANCE = 74;
const TRAIN_STOP_Z = -10;

export type BoardingOption = {
  correct: boolean;
  direction: string;
  route: string;
  station: SubwayStationId;
};

type TrainRig = {
  root: THREE.Group;
  doors: THREE.Group[];
  badgeMaterial: THREE.MeshBasicMaterial;
  badgeTexture: THREE.Texture;
  interiorMaterial: THREE.MeshBasicMaterial;
  interiorTexture: THREE.Texture;
  route: string;
  direction: string;
  correct: boolean;
  platformSide: -1 | 1;
};

type StationRig = {
  root: THREE.Group;
  spawn: THREE.Vector3;
  waypoint: THREE.Vector3;
};

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([18, 20, 19, 255]), 1, 1, THREE.RGBAFormat); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("SubwayWorld requires a canvas context"); draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

type CommuterSurfaceMaps = {
  fabric: THREE.Texture;
  leather: THREE.Texture;
  skin: THREE.Texture;
};

function microSurfaceTexture(kind: "fabric" | "leather" | "skin" | "paint" | "wood" | "brick") {
  return canvasTexture(256, 256, (context, width, height) => {
    const image = context.createImageData(width, height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = (y * width + x) * 4;
      const hash = Math.sin(x * 12.9898 + y * 78.233 + kind.length * 31.7) * 43758.5453;
      const noise = hash - Math.floor(hash);
      let value = 188;
      if (kind === "fabric") value = 154 + ((x + y) % 5 === 0 ? 34 : 0) + noise * 28;
      else if (kind === "leather") value = 128 + noise * 48 + Math.sin(x * .17 + Math.sin(y * .08) * 2) * 12;
      else if (kind === "skin") value = 196 + noise * 23 + Math.sin(x * .055 + y * .018) * 7;
      else if (kind === "paint") value = 176 + noise * 22 + Math.sin(y * .05) * 5;
      else if (kind === "wood") value = 132 + noise * 26 + Math.sin(x * .09 + Math.sin(y * .025) * 4) * 42;
      else value = 142 + noise * 32 + (y % 64 < 4 || (x + (Math.floor(y / 64) % 2) * 32) % 64 < 4 ? -54 : 18);
      image.data[index] = image.data[index + 1] = image.data[index + 2] = THREE.MathUtils.clamp(value, 0, 255);
      image.data[index + 3] = 255;
    }
    context.putImageData(image, 0, 0);
  });
}

function fitCanvasText(context: CanvasRenderingContext2D, text: string, maximumWidth: number, initialSize: number, weight = 700, family = "Helvetica, Arial, sans-serif") {
  let size = initialSize;
  do { context.font = `${weight} ${size}px ${family}`; size -= 2; } while (size > 18 && context.measureText(text).width > maximumWidth);
}

function platformChoiceTexture(title: string, detail: string, routes: string[], accent: string, arrow: "LEFT" | "RIGHT") {
  return canvasTexture(1280, 360, (context, width, height) => {
    context.fillStyle = "#080a09"; context.fillRect(0, 0, width, height);
    context.fillStyle = accent; context.fillRect(0, 0, width, 18);
    context.fillStyle = "#f6f4ed"; context.textBaseline = "middle"; context.textAlign = "left";
    let cursor = 46;
    for (const route of routes) {
      const bulletColor = ["N", "R", "W"].includes(route) ? "#fccc0a" : ["4", "5", "6"].includes(route) ? "#00933c" : "#ee352e";
      context.beginPath(); context.arc(cursor + 38, 93, 35, 0, Math.PI * 2); context.fillStyle = bulletColor; context.fill();
      context.fillStyle = ["N", "R", "W"].includes(route) ? "#111" : "#fff"; context.textAlign = "center"; context.font = "800 44px Helvetica, Arial, sans-serif"; context.fillText(route, cursor + 38, 96); cursor += 84;
    }
    context.textAlign = "left"; context.fillStyle = "#fff"; fitCanvasText(context, title, width - cursor - 170, 55, 760); context.fillText(title, cursor + 12, 92);
    context.fillStyle = "#c9cec9"; fitCanvasText(context, detail, width - 165, 31, 620); context.fillText(detail, 48, 228);
    context.fillStyle = accent; context.font = "900 84px Helvetica, Arial, sans-serif"; context.textAlign = "right"; context.fillText(arrow === "LEFT" ? "←" : "→", width - 48, 205);
  });
}

function openCarInteriorTexture(route: string, quality: SubwayQuality) {
  return canvasTexture(1024, 1344, (context, width, height) => {
    const horizon = height * .45;
    const gradient = context.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, "#f7f0db"); gradient.addColorStop(.46, "#d8d5c9"); gradient.addColorStop(1, "#353d3b");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.fillStyle = "#171d1e"; context.fillRect(0, 0, width, 72);
    context.fillStyle = "#f7edc2"; context.fillRect(width * .28, 82, width * .44, 24);
    context.fillStyle = route === "5" ? "#00933c" : "#fccc0a"; context.beginPath(); context.arc(width * .5, 178, 58, 0, Math.PI * 2); context.fill();
    context.fillStyle = route === "5" ? "#fff" : "#111"; context.textAlign = "center"; context.textBaseline = "middle"; context.font = "900 78px Helvetica, Arial, sans-serif"; context.fillText(route, width * .5, 184);
    // Perspective aisle, longitudinal seats, poles, and ceiling ribs.
    context.fillStyle = "#49514e"; context.beginPath(); context.moveTo(width * .43, horizon); context.lineTo(width * .57, horizon); context.lineTo(width * .77, height); context.lineTo(width * .23, height); context.closePath(); context.fill();
    context.fillStyle = route === "5" ? "#dc8d32" : "#2772a8";
    for (const side of [-1, 1]) for (let row = 0; row < 4; row++) {
      const amount = row / 4, y = horizon + 65 + amount * 165, seatWidth = 105 + amount * 58, x = side < 0 ? width * .18 - amount * 38 : width * .82 + amount * 38;
      context.fillRect(x - seatWidth / 2, y, seatWidth, 72 + amount * 38);
      context.strokeStyle = "rgba(255,255,255,.38)"; context.lineWidth = 7; context.strokeRect(x - seatWidth / 2, y, seatWidth, 72 + amount * 38);
    }
    context.strokeStyle = "#b9c3be"; context.lineWidth = 22;
    for (const x of [width * .28, width * .72]) { context.beginPath(); context.moveTo(width * .5 + (x - width * .5) * .18, 260); context.lineTo(x, height); context.stroke(); }
    context.lineWidth = 11; for (let rib = 0; rib < 6; rib++) { const y = 265 + rib * 138; context.beginPath(); context.moveTo(width * .22, y); context.lineTo(width * .78, y); context.stroke(); }
    if (quality !== "mobile") for (let person = 0; person < 5; person++) {
      const side = person % 2 ? -1 : 1, amount = person / 5, x = width * .5 + side * (110 + amount * 150), y = horizon + 110 + amount * 155, scale = .58 + amount * .42;
      context.fillStyle = ["#344f5c", "#6f4b3f", "#455b42", "#76526d", "#505b69"][person]; context.beginPath(); context.ellipse(x, y + 88 * scale, 42 * scale, 90 * scale, 0, 0, Math.PI * 2); context.fill();
      context.fillStyle = ["#bd8464", "#e0b18b", "#8b5c43", "#c88d69", "#d9aa87"][person]; context.beginPath(); context.arc(x, y, 37 * scale, 0, Math.PI * 2); context.fill();
    }
    context.fillStyle = "rgba(255,255,255,.16)"; for (let stripe = 0; stripe < 9; stripe++) context.fillRect(0, stripe * 150, width, 2);
  });
}

function animalTracksPanelTexture(panel: number) {
  return canvasTexture(1024, 640, (context, width, height) => {
    const backgrounds = ["#295d58", "#765644", "#496683"];
    context.fillStyle = backgrounds[panel % backgrounds.length]; context.fillRect(0, 0, width, height);
    const colors = ["#e1bc6b", "#8db8aa", "#c77b65", "#7896b5", "#d9d0aa"];
    for (let index = 0; index < 19; index++) {
      const x = (index * 173 + panel * 89) % width, y = 92 + (index * 127 + panel * 63) % (height - 180), radius = 54 + (index % 4) * 17;
      context.globalAlpha = .48; context.fillStyle = colors[(index + panel) % colors.length]; context.beginPath(); context.moveTo(x, y - radius); context.lineTo(x + radius, y + radius * .58); context.lineTo(x - radius, y + radius * .58); context.closePath(); context.fill();
    }
    context.globalAlpha = 1; context.strokeStyle = "rgba(244,239,214,.9)"; context.lineWidth = 20;
    for (let mark = 0; mark < 4; mark++) { const x = 155 + mark * 215; context.beginPath(); context.arc(x, 330 + Math.sin(mark + panel) * 82, 48 + mark % 2 * 18, .2, Math.PI * 1.65); context.stroke(); }
    context.fillStyle = "rgba(9,18,16,.82)"; context.fillRect(0, height - 106, width, 106);
    context.fillStyle = "#f5f0df"; context.font = "800 38px Helvetica, Arial, sans-serif"; context.textAlign = "left"; context.fillText(panel === 0 ? "ANIMAL TRACKS" : panel === 1 ? "MIGRATION / MOVEMENT" : "BRONX WILDLIFE", 42, height - 56);
    context.fillStyle = "#d7cfae"; context.font = "600 20px Helvetica, Arial, sans-serif"; context.fillText(`FACETED GLASS STUDY  ${String(panel + 1).padStart(2, "0")}`, 650, height - 54);
  });
}

function stationSignTexture(title: string, lines: string[], accent: string) {
  return canvasTexture(1536, 384, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, "#111412"); gradient.addColorStop(1, "#252a26");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height); context.fillStyle = accent; context.fillRect(0, 0, 22, height);
    context.strokeStyle = "rgba(255,255,255,.22)"; context.lineWidth = 8; context.strokeRect(10, 10, width - 20, height - 20);
    context.textBaseline = "middle"; context.textAlign = "left"; context.fillStyle = "#f3f1e8"; context.font = "700 94px Helvetica, Arial, sans-serif"; context.fillText(title, 76, 118);
    context.fillStyle = "rgba(243,241,232,.72)"; context.font = "650 38px Helvetica, Arial, sans-serif"; context.letterSpacing = "5px";
    lines.forEach((line, index) => context.fillText(line, 80, 226 + index * 58));
  });
}

function trainBadgeTexture(route: string, direction: string, color: string) {
  return canvasTexture(768, 256, (context, width, height) => {
    context.fillStyle = "#0b0c0c"; context.fillRect(0, 0, width, height);
    context.beginPath(); context.arc(105, height / 2, 76, 0, Math.PI * 2); context.fillStyle = color; context.fill();
    context.fillStyle = "#fff"; context.textAlign = "center"; context.textBaseline = "middle"; context.font = "800 92px Helvetica, Arial, sans-serif"; context.fillText(route, 105, height / 2 + 3);
    context.textAlign = "left"; context.font = "700 31px Helvetica, Arial, sans-serif"; context.letterSpacing = "3px"; context.fillText(direction, 210, height / 2);
  });
}

function trainIdentityTexture(number: string) {
  return canvasTexture(1024, 192, (context, width, height) => {
    context.fillStyle = "#d4d9d7"; context.fillRect(0, 0, width, height);
    context.beginPath(); context.arc(92, height / 2, 62, 0, Math.PI * 2); context.fillStyle = "#135d94"; context.fill();
    context.fillStyle = "#fff"; context.textAlign = "center"; context.textBaseline = "middle"; context.font = "800 52px Helvetica, Arial, sans-serif"; context.fillText("M", 92, height / 2 + 2);
    context.fillStyle = "#111"; context.textAlign = "left"; context.font = "700 39px Helvetica, Arial, sans-serif"; context.fillText("NEW YORK CITY SUBWAY", 184, 73);
    context.font = "650 32px Helvetica, Arial, sans-serif"; context.fillStyle = "#38403d"; context.fillText(`CAR ${number} · DO NOT LEAN ON DOORS`, 184, 128);
  });
}

function mosaicTexture(title: string, accent: string) {
  return canvasTexture(1024, 192, (context, width, height) => {
    context.fillStyle = "#ece7d7"; context.fillRect(0, 0, width, height);
    context.fillStyle = accent; context.fillRect(12, 12, width - 24, height - 24);
    context.strokeStyle = "rgba(255,255,255,.42)"; context.lineWidth = 8; context.strokeRect(26, 26, width - 52, height - 52);
    context.fillStyle = "#f7f3e8"; context.textAlign = "center"; context.textBaseline = "middle";
    context.font = "700 68px Georgia, serif"; context.fillText(title, width / 2, height / 2 + 2);
    context.globalAlpha = .22; context.strokeStyle = "#1a1c1b"; context.lineWidth = 2;
    for (let x = 0; x < width; x += 18) { context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke(); }
    for (let y = 0; y < height; y += 18) { context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke(); }
  });
}

function exitSignTexture(title: string, detail: string, routes: string[], accent = "#f4c430") {
  return canvasTexture(1536, 360, (context, width, height) => {
    context.fillStyle = "#080a09"; context.fillRect(0, 0, width, height);
    context.fillStyle = accent; context.fillRect(0, 0, width, 18);
    context.fillStyle = "#fff"; context.textAlign = "left"; context.textBaseline = "middle";
    let cursor = 58;
    for (const route of routes) {
      const color = route === "2" ? "#ee352e" : route === "5" || route === "4" || route === "6" ? "#00933c" : "#fccc0a";
      context.beginPath(); context.arc(cursor + 48, 105, 45, 0, Math.PI * 2); context.fillStyle = color; context.fill();
      context.fillStyle = route === "N" || route === "R" || route === "W" ? "#111" : "#fff"; context.textAlign = "center"; context.font = "800 62px Helvetica, Arial, sans-serif"; context.fillText(route, cursor + 48, 109); cursor += 112;
    }
    context.textAlign = "left"; context.fillStyle = "#fff"; context.font = "750 62px Helvetica, Arial, sans-serif"; context.fillText(title, cursor + 18, 102);
    context.fillStyle = "#d8d9d5"; context.font = "600 34px Helvetica, Arial, sans-serif"; context.fillText(detail, 58, 225);
    context.fillStyle = accent; context.font = "800 62px Helvetica, Arial, sans-serif"; context.textAlign = "right"; context.fillText("↑", width - 62, 205);
  });
}

function neighborhoodMapTexture(id: SubwayStationId) {
  return canvasTexture(768, 1024, (context, width, height) => {
    context.fillStyle = "#ebe7dc"; context.fillRect(0, 0, width, height);
    context.fillStyle = "#111"; context.font = "800 42px Helvetica, Arial, sans-serif"; context.fillText(id === "WEST_FARMS" ? "WEST FARMS / BRONX ZOO" : id === "LEXINGTON" ? "LEXINGTON AV / 59 ST" : "FIFTH AV / CENTRAL PARK", 38, 64);
    context.strokeStyle = "#b8b3a8"; context.lineWidth = 18;
    for (let x = 70; x < width; x += 106) { context.beginPath(); context.moveTo(x, 110); context.lineTo(x, height - 70); context.stroke(); }
    for (let y = 160; y < height; y += 112) { context.beginPath(); context.moveTo(28, y); context.lineTo(width - 28, y); context.stroke(); }
    context.fillStyle = id === "WEST_FARMS" ? "#89a878" : "#7f9f73"; context.fillRect(id === "WEST_FARMS" ? 430 : 40, 130, id === "WEST_FARMS" ? 280 : 220, id === "WEST_FARMS" ? 620 : 790);
    context.strokeStyle = "#4577a8"; context.lineWidth = 24; context.beginPath(); context.moveTo(102, 900); context.bezierCurveTo(220, 730, 510, 760, 670, 520); context.stroke();
    context.fillStyle = "#e33b32"; context.beginPath(); context.arc(id === "WEST_FARMS" ? 505 : 350, id === "WEST_FARMS" ? 710 : 535, 22, 0, Math.PI * 2); context.fill();
    context.fillStyle = "#111"; context.font = "700 28px Helvetica, Arial, sans-serif"; context.fillText("YOU ARE HERE", id === "WEST_FARMS" ? 535 : 380, id === "WEST_FARMS" ? 716 : 542);
    context.font = "600 24px Helvetica, Arial, sans-serif"; context.fillText(id === "WEST_FARMS" ? "Bronx Zoo · Boston Rd →" : "Central Park · 5 Av →", 42, 970);
  });
}

function addTextPanel(parent: THREE.Group, texture: THREE.Texture, position: [number, number, number], scale: [number, number], rotationY = 0) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .48, metalness: .02, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(scale[0], scale[1], .08, 3, .025), material); mesh.position.set(...position); mesh.rotation.y = rotationY; mesh.castShadow = true; parent.add(mesh); return mesh;
}

function addCylinderBetween(parent: THREE.Group, start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, segments: number) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

function addNpc(parent: THREE.Group, x: number, z: number, palette: [string, string], facing = 0, variant = 0, quality: SubwayQuality = "balanced", surfaceMaps?: CommuterSurfaceMaps) {
  const npc = new THREE.Group(); npc.name = `subway-passenger-${variant}`; npc.position.set(x, 0, z); npc.rotation.y = facing;
  const segments = SUBWAY_DETAIL[quality].radialSegments;
  const coat = new THREE.MeshStandardMaterial({ color: palette[0], roughness: .72, metalness: .015, map: surfaceMaps?.fabric ?? null, bumpMap: surfaceMaps?.fabric ?? null, bumpScale: .012 });
  const skin = new THREE.MeshPhysicalMaterial({ color: palette[1], roughness: .78, sheen: .12, sheenRoughness: .8, map: surfaceMaps?.skin ?? null, bumpMap: surfaceMaps?.skin ?? null, bumpScale: .004 });
  const hairColors = ["#171412", "#302019", "#65442e", "#b5aaa0", "#201d22"];
  const hair = new THREE.MeshStandardMaterial({ color: hairColors[variant % hairColors.length], roughness: .9, map: surfaceMaps?.fabric ?? null, bumpMap: surfaceMaps?.fabric ?? null, bumpScale: .016 });
  const trouserColors = ["#171b1e", "#292a35", "#2d382f", "#443b35", "#182c3d"];
  const trouser = new THREE.MeshStandardMaterial({ color: trouserColors[variant % trouserColors.length], roughness: .82, map: surfaceMaps?.fabric ?? null, bumpMap: surfaceMaps?.fabric ?? null, bumpScale: .014 });
  const leather = new THREE.MeshStandardMaterial({ color: variant % 2 ? "#30221c" : "#111515", roughness: .58, metalness: .04, map: surfaceMaps?.leather ?? null, bumpMap: surfaceMaps?.leather ?? null, bumpScale: .013 });
  const accentColors = ["#d6aa54", "#b1463e", "#3b7089", "#7870a2", "#638a58"];
  const accent = new THREE.MeshStandardMaterial({ color: accentColors[variant % accentColors.length], roughness: .7, map: surfaceMaps?.fabric ?? null, bumpMap: surfaceMaps?.fabric ?? null, bumpScale: .01 });
  const eye = new THREE.MeshStandardMaterial({ color: "#161313", roughness: .36 });
  const eyeWhite = new THREE.MeshPhysicalMaterial({ color: "#eee9dc", roughness: .32, clearcoat: .12 });
  const metalTrim = new THREE.MeshStandardMaterial({ color: "#b8b2a2", metalness: .72, roughness: .28 });
  const stature = 1 + ((variant % 3) - 1) * .04;
  npc.scale.setScalar(stature);

  const hips = new THREE.Mesh(new RoundedBoxGeometry(.48, .35, .31, 4, .12), trouser); hips.position.y = .83; npc.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.28 + (variant % 2) * .025, .67, 8, segments), coat); torso.position.y = 1.3; npc.add(torso);
  if (quality !== "mobile") {
    for (const side of [-1, 1]) {
      const lapel = new THREE.Mesh(new RoundedBoxGeometry(.13, .4, .028, 3, .02), accent); lapel.position.set(side * .095, 1.48, -.272); lapel.rotation.z = side * .28; npc.add(lapel);
    }
    for (const y of [1.34, 1.18, 1.02]) { const button = new THREE.Mesh(new THREE.SphereGeometry(.018, 7, 5), metalTrim); button.position.set(0, y, -.294); npc.add(button); }
  }
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.205, .032, 7, segments), accent); collar.rotation.x = Math.PI / 2; collar.position.set(0, 1.67, -.01); npc.add(collar);
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group(); shoulder.position.set(side * .32, 1.48, 0); shoulder.rotation.z = side * (-.08 - (variant % 3) * .035); shoulder.rotation.x = variant % 4 === 1 ? -.46 : variant % 4 === 2 ? .18 : 0;
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.068, .44, 6, segments), coat); arm.position.y = -.25; shoulder.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.078, segments, Math.max(6, segments - 2)), skin); hand.scale.set(.78, 1.15, .72); hand.position.y = -.54; shoulder.add(hand); npc.add(shoulder);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.088, .55, 6, segments), trouser); leg.position.set(side * .14, .45, variant % 4 === 3 ? side * .035 : 0); leg.rotation.x = variant % 4 === 3 ? side * .08 : 0; npc.add(leg);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(.19, .11, .34, 3, .045), leather); shoe.position.set(side * .14, .075, -.075); npc.add(shoe);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.09, .105, .15, segments), skin); neck.position.y = 1.72; npc.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.225, segments + 4, segments), skin); head.scale.set(.89, 1.08, .92); head.position.y = 1.94; npc.add(head);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.042, segments, Math.max(6, segments - 2)), skin); nose.scale.set(.78, 1.08, 1.18); nose.position.set(0, 1.95, -.218); npc.add(nose);
  if (quality !== "mobile") {
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(.052, segments, Math.max(7, segments - 3)), skin); cheek.scale.set(1.1, .72, .52); cheek.position.set(side * .11, 1.91, -.194); npc.add(cheek);
      const nostril = new THREE.Mesh(new THREE.SphereGeometry(.008, 7, 5), eye); nostril.position.set(side * .013, 1.962, -.254); npc.add(nostril);
    }
    const zipper = new THREE.Mesh(new RoundedBoxGeometry(.013, .48, .013, 2, .004), metalTrim); zipper.position.set(0, 1.29, -.298); npc.add(zipper);
    for (const side of [-1, 1]) {
      const pocket = new THREE.Mesh(new RoundedBoxGeometry(.14, .12, .018, 3, .009), coat); pocket.position.set(side * .15, 1.12, -.3); pocket.rotation.z = side * .06; npc.add(pocket);
    }
  }
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.052, segments, Math.max(6, segments - 2)), skin); ear.scale.set(.48, 1, .72); ear.position.set(side * .205, 1.96, 0); npc.add(ear);
    const sclera = new THREE.Mesh(new THREE.SphereGeometry(.03, segments, Math.max(6, segments - 2)), eyeWhite); sclera.scale.set(1.15, .82, .55); sclera.position.set(side * .076, 2.012, -.203); npc.add(sclera);
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(.013, segments, Math.max(6, segments - 2)), eye); eyeball.position.set(side * .076, 2.012, -.224); npc.add(eyeball);
    if (quality !== "mobile") {
      const brow = addCylinderBetween(npc, new THREE.Vector3(side * .045, 2.06, -.213), new THREE.Vector3(side * .108, 2.052, -.203), .007, hair, 6); brow.name = "eyebrow";
    }
  }
  if (quality !== "mobile") {
    const mouth = new THREE.Mesh(new THREE.TorusGeometry(.044, .006, 5, 12, Math.PI), new THREE.MeshStandardMaterial({ color: "#794d48", roughness: .75 })); mouth.position.set(0, 1.887, -.216); mouth.rotation.z = Math.PI; npc.add(mouth);
  }
  if (variant % 3 === 0) {
    const cap = new THREE.Mesh(new THREE.SphereGeometry(.232, segments + 4, segments, 0, Math.PI * 2, 0, Math.PI * .48), accent); cap.position.y = 2.075; npc.add(cap);
    const brim = new THREE.Mesh(new RoundedBoxGeometry(.25, .025, .12, 3, .025), accent); brim.position.set(0, 2.075, -.19); npc.add(brim);
  } else if (variant % 3 === 1) {
    const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.231, segments + 4, segments, 0, Math.PI * 2, 0, Math.PI * .6), hair); hairCap.position.y = 2.03; npc.add(hairCap);
    for (const side of [-1, 1]) { const lock = new THREE.Mesh(new THREE.CapsuleGeometry(.025, .2, 4, 7), hair); lock.position.set(side * .19, 1.94, .02); lock.rotation.z = side * .12; npc.add(lock); }
  } else {
    const shortHair = new THREE.Mesh(new THREE.SphereGeometry(.23, segments + 4, segments, 0, Math.PI * 2, 0, Math.PI * .54), hair); shortHair.position.y = 2.06; npc.add(shortHair);
  }

  // Commuter props and poses make silhouettes readable without skeletal animation.
  if (variant % 4 === 0) {
    const backpack = new THREE.Mesh(new RoundedBoxGeometry(.43, .63, .22, 4, .08), accent); backpack.position.set(0, 1.25, .27); npc.add(backpack);
    const pocket = new THREE.Mesh(new RoundedBoxGeometry(.3, .25, .05, 3, .035), leather); pocket.position.set(0, 1.17, .4); backpack.add(pocket);
  } else if (variant % 4 === 1) {
    const phone = new THREE.Mesh(new RoundedBoxGeometry(.105, .18, .025, 3, .014), new THREE.MeshStandardMaterial({ color: "#101719", metalness: .5, roughness: .22 })); phone.position.set(.32, 1.08, -.27); phone.rotation.z = -.18; npc.add(phone);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(.078, .14), new THREE.MeshBasicMaterial({ color: "#9fd5d8", toneMapped: false })); screen.position.set(0, 0, -.014); screen.rotation.y = Math.PI; phone.add(screen);
  } else if (variant % 4 === 2) {
    const tote = new THREE.Mesh(new RoundedBoxGeometry(.4, .48, .12, 3, .045), accent); tote.position.set(.4, .85, .02); npc.add(tote);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(.16, .018, 6, 14, Math.PI), leather); handle.position.set(.4, 1.12, .02); npc.add(handle);
  } else {
    const headphones = new THREE.Mesh(new THREE.TorusGeometry(.247, .018, 6, segments, Math.PI), accent); headphones.rotation.z = Math.PI; headphones.position.set(0, 2.03, 0); npc.add(headphones);
    for (const side of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(.045, .045, .04, segments), accent); cup.rotation.z = Math.PI / 2; cup.position.set(side * .22, 1.98, 0); npc.add(cup); }
  }
  npc.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } }); parent.add(npc); return npc;
}

function addStationAttendant(parent: THREE.Group, x: number, y: number, z: number, facing: number, quality: SubwayQuality, surfaceMaps?: CommuterSurfaceMaps) {
  const attendant = addNpc(parent, x, z, ["#173d67", "#b87f62"], facing, 9, quality, surfaceMaps); attendant.name = "mta-station-attendant"; attendant.position.y = y;
  const vest = new THREE.MeshStandardMaterial({ color: "#efc440", roughness: .58 });
  const reflective = new THREE.MeshPhysicalMaterial({ color: "#e9f2df", roughness: .24, clearcoat: .3 });
  const radioMaterial = new THREE.MeshStandardMaterial({ color: "#151b1c", metalness: .32, roughness: .44 });
  for (const side of [-1, 1]) {
    const vestPanel = new THREE.Mesh(new RoundedBoxGeometry(.14, .56, .026, 3, .018), vest); vestPanel.position.set(side * .105, 1.34, -.292); vestPanel.rotation.z = side * .05; attendant.add(vestPanel);
    const strip = new THREE.Mesh(new RoundedBoxGeometry(.035, .5, .012, 2, .006), reflective); strip.position.set(side * .105, 1.34, -.31); attendant.add(strip);
  }
  const badge = new THREE.Mesh(new RoundedBoxGeometry(.095, .065, .014, 2, .008), reflective); badge.position.set(-.13, 1.48, -.318); attendant.add(badge);
  const radio = new THREE.Mesh(new RoundedBoxGeometry(.11, .2, .06, 3, .018), radioMaterial); radio.position.set(.31, 1.35, -.05); attendant.add(radio);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .14, 6), radioMaterial); antenna.position.set(.31, 1.52, -.05); attendant.add(antenna);
  return attendant;
}

function addStairs(parent: THREE.Group, x: number, side: -1 | 1, material: THREE.Material, surfaceMap?: THREE.Texture) {
  const steps = 16;
  for (let index = 0; index < steps; index++) {
    const amount = index / (steps - 1), step = new THREE.Mesh(new RoundedBoxGeometry(4.2, .14, .66, 2, .025), material);
    step.position.set(x, amount * 4 - .07, THREE.MathUtils.lerp(4.4, 13.6, amount)); step.receiveShadow = true; parent.add(step);
  }
  const railMaterial = new THREE.MeshStandardMaterial({ color: "#747b78", metalness: .9, roughness: .2, map: surfaceMap ?? null, bumpMap: surfaceMap ?? null, bumpScale: .006 });
  for (const railSide of [-1, 1]) {
    const start = new THREE.Vector3(x + railSide * 1.85, .72, 4.3), end = new THREE.Vector3(x + railSide * 1.85, 4.72, 13.8), direction = end.clone().sub(start);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, direction.length(), 10), railMaterial); rail.position.copy(start).add(end).multiplyScalar(.5); rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); rail.castShadow = true; parent.add(rail);
  }
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.15, .45, 12), new THREE.MeshBasicMaterial({ color: side < 0 ? "#d9ef8b" : "#e6a85e" })); arrow.position.set(x, 4.25, 14.05); arrow.rotation.x = side < 0 ? Math.PI : 0; parent.add(arrow);
}

function addStreetEntrance(parent: THREE.Group, stairMaterial: THREE.Material, signTexture: THREE.Texture, quality: SubwayQuality, surfaceMap?: THREE.Texture) {
  const radial = SUBWAY_DETAIL[quality].radialSegments;
  const rail = new THREE.MeshStandardMaterial({ color: "#202724", metalness: .82, roughness: .3, map: surfaceMap ?? null, bumpMap: surfaceMap ?? null, bumpScale: .006 });
  const stone = new THREE.MeshStandardMaterial({ color: "#918c81", roughness: .9, map: surfaceMap ?? null, bumpMap: surfaceMap ?? null, bumpScale: .014 });
  const globe = new THREE.MeshPhysicalMaterial({ color: "#b9e5bb", emissive: "#4a8653", emissiveIntensity: .42, roughness: .18, transmission: quality === "mobile" ? 0 : .18 });
  const steps = 22;
  for (let index = 0; index < steps; index++) {
    const amount = index / (steps - 1);
    const step = new THREE.Mesh(new RoundedBoxGeometry(6.1, .16, .72, 2, .025), stairMaterial);
    step.position.set(0, CONCOURSE_FLOOR_Y + amount * (STREET_FLOOR_Y - CONCOURSE_FLOOR_Y) - .08, THREE.MathUtils.lerp(STREET_STAIR_BOTTOM_Z, STREET_STAIR_TOP_Z, amount));
    step.receiveShadow = true; parent.add(step);
  }
  const sidewalk = new THREE.Mesh(new RoundedBoxGeometry(19.8, .34, 9, 2, .05), stone); sidewalk.position.set(0, STREET_FLOOR_Y - .18, 46.2); sidewalk.receiveShadow = true; parent.add(sidewalk);
  for (const side of [-1, 1]) {
    const lower = new THREE.Vector3(side * 3.22, CONCOURSE_FLOOR_Y + .65, STREET_STAIR_BOTTOM_Z - .2);
    const upper = new THREE.Vector3(side * 3.22, STREET_FLOOR_Y + .65, STREET_STAIR_TOP_Z + .15);
    addCylinderBetween(parent, lower, upper, .045, rail, radial);
    for (let post = 0; post <= 6; post++) {
      const amount = post / 6, y = THREE.MathUtils.lerp(CONCOURSE_FLOOR_Y, STREET_FLOOR_Y, amount), z = THREE.MathUtils.lerp(STREET_STAIR_BOTTOM_Z, STREET_STAIR_TOP_Z, amount);
      addCylinderBetween(parent, new THREE.Vector3(side * 3.22, y, z), new THREE.Vector3(side * 3.22, y + .7, z), .027, rail, radial);
    }
    const curb = new THREE.Mesh(new RoundedBoxGeometry(.34, 1.2, 14.3, 2, .045), stone); curb.position.set(side * 3.48, 6, 35.25); curb.rotation.x = -.29; parent.add(curb);
    const globePost = new THREE.Mesh(new THREE.CylinderGeometry(.065, .075, 1.34, radial), rail); globePost.position.set(side * 3.52, 8.68, 43.5); parent.add(globePost);
    const globeLight = new THREE.Mesh(new THREE.SphereGeometry(.21, radial, radial), globe); globeLight.position.set(side * 3.52, 9.38, 43.5); parent.add(globeLight);
  }
  const lintel = new THREE.Mesh(new RoundedBoxGeometry(7.5, .34, .34, 3, .05), rail); lintel.position.set(0, 10.82, 42.65); parent.add(lintel);
  for (const side of [-1, 1]) { const pillar = new THREE.Mesh(new RoundedBoxGeometry(.28, 2.65, .3, 3, .04), rail); pillar.position.set(side * 3.55, 9.48, 42.65); parent.add(pillar); }
  addTextPanel(parent, signTexture, [0, 10.36, 42.45], [6.65, .88], 0).name = "street-entrance-sign";
}

function buildTrain(textures: GameTextures, route: string, direction: string, correct: boolean, trackX: number, quality: SubwayQuality, ownedTextures: THREE.Texture[]) {
  const root = new THREE.Group(); root.name = `${route}-${correct ? "correct" : "wrong"}-train`;
  const platformSide: -1 | 1 = trackX < 0 ? -1 : 1;
  const detail = SUBWAY_DETAIL[quality], radial = detail.radialSegments;
  const steel = new THREE.MeshStandardMaterial({ color: "#c8cecc", metalness: .72, roughness: .3, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .01, envMapIntensity: 1.15 });
  const brushedSteel = new THREE.MeshStandardMaterial({ color: "#aeb7b5", metalness: .82, roughness: .24 });
  const dark = new THREE.MeshStandardMaterial({ color: "#111719", metalness: .58, roughness: .3 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#090b0c", metalness: .06, roughness: .76 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#263b44", roughness: .08, metalness: .15, transmission: quality === "mobile" ? 0 : .18, transparent: true, opacity: quality === "mobile" ? .92 : .78, envMapIntensity: 1.3 });
  const interior = new THREE.MeshStandardMaterial({ color: "#ddd8ca", roughness: .62, metalness: .02 });
  const warmLight = new THREE.MeshBasicMaterial({ color: "#fff4d5", toneMapped: false });
  const cabinGlow = new THREE.MeshBasicMaterial({ color: "#e8d9af", toneMapped: false });
  const seatSilhouetteMaterial = new THREE.MeshStandardMaterial({ color: "#b16f32", roughness: .7 });
  const doorGasket = new THREE.MeshStandardMaterial({ color: "#242728", roughness: .55 });
  const headlight = new THREE.MeshBasicMaterial({ color: "#fff4ca", toneMapped: false });
  const taillight = new THREE.MeshBasicMaterial({ color: "#d03a2f", toneMapped: false });
  const identityTexture = trainIdentityTexture(correct ? "9027" : "9144"); ownedTextures.push(identityTexture);
  const identityMaterial = new THREE.MeshBasicMaterial({ map: identityTexture, toneMapped: false });
  const openInteriorTexture = openCarInteriorTexture(route, quality); ownedTextures.push(openInteriorTexture);
  const openInteriorMaterial = new THREE.MeshBasicMaterial({ map: openInteriorTexture, toneMapped: false });
  // Two trains share the four-metre track bed. A real two-track loading gauge
  // leaves a visible gap between cars rather than allowing their bodies to
  // intersect at the centre line.
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.12, 3.08, 19.5, 5, .18), steel); body.position.y = 1.7; body.castShadow = true; body.receiveShadow = true; root.add(body);
  const sill = new THREE.Mesh(new RoundedBoxGeometry(2.2, .18, 19.25, 2, .035), dark); sill.position.y = .36; root.add(sill);
  const undercarriage = new THREE.Mesh(new RoundedBoxGeometry(1.42, .42, 12.8, 3, .06), dark); undercarriage.position.y = .16; root.add(undercarriage);
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: "#315a78", roughness: .5, metalness: .2 });
  for (const side of [-1, 1]) {
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(.045, .23, 18.5, 2, .015), stripeMaterial); stripe.position.set(side * 1.075, 1.1, 0); root.add(stripe);
    const belt = new THREE.Mesh(new RoundedBoxGeometry(.035, .052, 18.9, 2, .012), brushedSteel); belt.position.set(side * 1.092, .83, 0); root.add(belt);
    for (const z of [-9.1, -3.08, 3.08, 9.1]) {
      const seam = new THREE.Mesh(new RoundedBoxGeometry(.025, 2.68, .035, 2, .008), dark); seam.position.set(side * 1.098, 1.72, z); root.add(seam);
    }
    if (quality === "ultra") for (let z = -8.8; z <= 8.8; z += .8) {
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(.012, 6, 4), brushedSteel); rivet.position.set(side * 1.112, .67, z); root.add(rivet);
    }
    const identity = new THREE.Mesh(new THREE.PlaneGeometry(1.26, .25), identityMaterial); identity.position.set(side * 1.112, .72, 7.85); identity.rotation.y = side * Math.PI / 2; root.add(identity);
  }
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.98, .22, 19.1, 4, .09), dark); roof.position.y = 3.28; root.add(roof);
  for (const z of [-5.8, 0, 5.8]) {
    const hvac = new THREE.Mesh(new RoundedBoxGeometry(1.38, .18, 2.2, 3, .06), brushedSteel); hvac.position.set(0, 3.48, z); root.add(hvac);
    if (quality !== "mobile") for (let fin = -4; fin <= 4; fin++) {
      const grille = new THREE.Mesh(new RoundedBoxGeometry(1.08, .025, .025, 2, .008), dark); grille.position.set(0, 3.58, z + fin * .16); root.add(grille);
    }
  }
  // Bogies, wheels, suspension boxes, and couplers keep the car grounded when
  // viewed from platform height instead of reading as a floating silver block.
  for (const bogieZ of [-6.35, 6.35]) {
    const frame = new THREE.Mesh(new RoundedBoxGeometry(1.8, .3, 2.35, 3, .05), dark); frame.position.set(0, .18, bogieZ); root.add(frame);
    for (const axleZ of [-.65, .65]) for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .13, radial), rubber); wheel.rotation.z = Math.PI / 2; wheel.position.set(side * .99, .22, bogieZ + axleZ); root.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .145, radial), brushedSteel); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); root.add(hub);
    }
    const spring = new THREE.Mesh(new THREE.TorusGeometry(.15, .035, 7, radial), brushedSteel); spring.rotation.x = Math.PI / 2; spring.position.set(0, .38, bogieZ); root.add(spring);
  }
  for (const end of [-1, 1]) {
    const couplerStem = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .6, radial), dark); couplerStem.rotation.x = Math.PI / 2; couplerStem.position.set(0, .38, end * 9.95); root.add(couplerStem);
    const knuckle = new THREE.Mesh(new RoundedBoxGeometry(.34, .24, .28, 3, .05), dark); knuckle.position.set(0, .38, end * 10.25); root.add(knuckle);
    const endDoor = new THREE.Mesh(new RoundedBoxGeometry(1.05, 2.15, .055, 3, .04), brushedSteel); endDoor.position.set(0, 1.62, end * 9.79); root.add(endDoor);
    const windshield = new THREE.Mesh(new RoundedBoxGeometry(.74, .68, .03, 3, .04), glass); windshield.position.set(0, 2.2, end * 9.83); root.add(windshield);
    for (const side of [-1, 1]) {
      const marker = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .035, radial), end < 0 ? headlight : taillight); marker.rotation.x = Math.PI / 2; marker.position.set(side * .72, 1.12, end * 9.84); root.add(marker);
    }
  }
  const doors: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const z of [-6.1, 0, 6.1]) {
    const pair = new THREE.Group(); pair.name = "exterior-door-pair"; pair.position.set(side * 1.071, 1.62, z); pair.rotation.y = side * Math.PI / 2;
    for (const half of [-1, 1]) {
      const door = new THREE.Mesh(new RoundedBoxGeometry(1.1, 2.36, .07, 3, .035), steel); door.position.x = half * .56;
      const doorWindow = new THREE.Mesh(new RoundedBoxGeometry(.54, .68, .025, 3, .035), glass); doorWindow.position.set(0, .4, .055); door.add(doorWindow); pair.add(door);
      if (quality !== "mobile") {
        const gasket = new THREE.Mesh(new RoundedBoxGeometry(.61, .76, .018, 3, .04), doorGasket); gasket.position.set(0, .4, .041); door.add(gasket); doorWindow.position.z = .056;
      }
    }
    const doorway = new THREE.Mesh(new RoundedBoxGeometry(2.18, 2.35, .018, 3, .04), dark); doorway.position.z = -.006; pair.add(doorway);
    // Keep the open doorway behind the sliding leaves, but far enough in front
    // of the dark recess to avoid z-fighting. A lit vestibule, floor threshold,
    // pole, and seat edge make boarding read as a real car interior instead of
    // a black teleport portal from platform height.
    const doorwayGlow = new THREE.Mesh(new RoundedBoxGeometry(1.82, 2.02, .012, 3, .025), cabinGlow); doorwayGlow.position.z = .012; pair.add(doorwayGlow);
    const vestibule = new THREE.Mesh(new RoundedBoxGeometry(1.22, 1.76, .009, 3, .018), interior); vestibule.position.set(0, -.03, .021); pair.add(vestibule);
    const aisle = new THREE.Mesh(new RoundedBoxGeometry(.62, 1.42, .006, 3, .012), new THREE.MeshStandardMaterial({ color: "#4a4d48", roughness: .78 })); aisle.position.set(0, -.12, .028); pair.add(aisle);
    const portal = new THREE.Mesh(new RoundedBoxGeometry(1.78, 1.98, .012, 3, .024), openInteriorMaterial); portal.name = "visible-open-car-interior"; portal.position.set(0, 0, .039); pair.add(portal);
    const threshold = new THREE.Mesh(new RoundedBoxGeometry(1.76, .09, .075, 2, .015), brushedSteel); threshold.position.set(0, -1.03, .045); pair.add(threshold);
    const seatEdge = new THREE.Mesh(new RoundedBoxGeometry(.34, .52, .035, 5, .05), seatSilhouetteMaterial); seatEdge.position.set(-.63, -.55, .054); pair.add(seatEdge);
    const headerLight = new THREE.Mesh(new RoundedBoxGeometry(1.48, .06, .028, 2, .012), warmLight); headerLight.position.set(0, .89, .04); pair.add(headerLight);
    const centrePole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 2, radial), brushedSteel); centrePole.position.set(.52, 0, .065); pair.add(centrePole);
    const indicator = new THREE.Mesh(new THREE.SphereGeometry(.055, radial, Math.max(6, radial - 2)), new THREE.MeshBasicMaterial({ color: "#e2513f", toneMapped: false })); indicator.position.set(0, 1.25, .075); pair.add(indicator);
    pair.userData.platformFacing = side === platformSide; root.add(pair); doors.push(pair);
  }
  for (const side of [-1, 1]) for (const z of [-8.25, -3.1, 3.1, 8.25]) {
    const glow = new THREE.Mesh(new RoundedBoxGeometry(1.04, .78, .02, 3, .035), cabinGlow); glow.position.set(side * 1.087, 2.15, z); glow.rotation.y = side * Math.PI / 2; root.add(glow);
    const window = new THREE.Mesh(new RoundedBoxGeometry(1.18, .9, .045, 3, .04), glass); window.position.set(side * 1.095, 2.15, z); window.rotation.y = side * Math.PI / 2; root.add(window);
    if (quality !== "mobile") {
      const seatSilhouette = new THREE.Mesh(new RoundedBoxGeometry(.42, .3, .02, 3, .04), seatSilhouetteMaterial); seatSilhouette.position.set(side * 1.104, 1.84, z); seatSilhouette.rotation.y = side * Math.PI / 2; root.add(seatSilhouette);
    }
  }
  const badgeTexture = trainBadgeTexture(route, direction, route === "5" ? "#00933c" : route === "R" || route === "W" ? "#fccc0a" : "#fccc0a");
  const badgeMaterial = new THREE.MeshBasicMaterial({ map: badgeTexture, toneMapped: false });
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.95, .65), badgeMaterial); badge.position.set(platformSide * 1.108, 2.72, -5.2); badge.rotation.y = platformSide * Math.PI / 2; root.add(badge);
  for (const end of [-1, 1]) {
    const endBadge = new THREE.Mesh(new THREE.PlaneGeometry(.88, .29), badgeMaterial); endBadge.position.set(0, 2.85, end * 9.84); endBadge.rotation.y = end < 0 ? Math.PI : 0; root.add(endBadge);
  }
  if (detail.trainInterior) {
    const cabin = new THREE.Group(); cabin.name = "lit-passenger-cabin";
    const cabinFloor = new THREE.Mesh(new RoundedBoxGeometry(1.75, .08, 18.1, 2, .02), new THREE.MeshStandardMaterial({ color: "#353a38", roughness: .82 })); cabinFloor.position.y = .57; cabin.add(cabinFloor);
    const cabinCeiling = new THREE.Mesh(new RoundedBoxGeometry(1.7, .06, 18, 2, .02), interior); cabinCeiling.position.y = 3.02; cabin.add(cabinCeiling);
    const seatMaterial = new THREE.MeshStandardMaterial({ color: "#db9a3f", roughness: .56, metalness: .04 });
    for (const side of [-1, 1]) for (const z of [-7.7, -3.1, 3.1, 7.7]) {
      const seat = new THREE.Mesh(new RoundedBoxGeometry(.32, .45, 1.5, 4, .08), seatMaterial); seat.position.set(side * .75, .82, z); cabin.add(seat);
    }
    const poleMaterial = new THREE.MeshStandardMaterial({ color: "#d5d0b7", metalness: .88, roughness: .18 });
    for (const z of [-6, -2, 2, 6]) {
      addCylinderBetween(cabin, new THREE.Vector3(0, .62, z), new THREE.Vector3(0, 2.95, z), .025, poleMaterial, radial);
      const light = new THREE.Mesh(new RoundedBoxGeometry(.62, .025, 1.5, 2, .015), warmLight); light.position.set(0, 2.97, z); cabin.add(light);
    }
    root.add(cabin);
  }
  // Render a true multi-car consist. Geometry and materials stay shared through
  // Object3D cloning, keeping mobile memory bounded while fixing the toy-car scale.
  const carTemplate = [...root.children];
  const extraCarOffsets = quality === "mobile" ? [19.85] : [-19.85, 19.85];
  for (const offset of extraCarOffsets) {
    const car = new THREE.Group(); car.name = "connected-subway-car"; car.position.z = offset;
    for (const part of carTemplate) car.add(part.clone(true));
    car.traverse(object => { if (object instanceof THREE.Group && object.name === "exterior-door-pair") doors.push(object); });
    root.add(car);
  }
  const bellows = new THREE.MeshStandardMaterial({ color: "#171a1a", roughness: .82, metalness: .12 });
  for (const z of extraCarOffsets.map(offset => offset > 0 ? 9.93 : -9.93)) {
    const gangway = new THREE.Mesh(new RoundedBoxGeometry(1.46, 2.72, .34, 4, .06), bellows); gangway.position.set(0, 1.72, z); root.add(gangway);
  }
  root.position.x = trackX; return { root, doors, badgeMaterial, badgeTexture, interiorMaterial: openInteriorMaterial, interiorTexture: openInteriorTexture, route, direction, correct, platformSide } satisfies TrainRig;
}

function buildStation(id: SubwayStationId, textures: GameTextures, adTextures: THREE.Texture[], bronxMosaicTexture: THREE.Texture, ownedTextures: THREE.Texture[], quality: SubwayQuality) {
  const root = new THREE.Group(); root.name = `station-${id.toLowerCase()}`;
  const detail = SUBWAY_DETAIL[quality], radial = detail.radialSegments;
  const isFifth = id === "FIFTH_AV", isLex = id === "LEXINGTON";
  const fabricMap = microSurfaceTexture("fabric"), leatherMap = microSurfaceTexture("leather"), skinMap = microSurfaceTexture("skin"), paintMap = microSurfaceTexture("paint"), woodMap = microSurfaceTexture("wood"), brickMap = microSurfaceTexture("brick");
  for (const texture of [fabricMap, leatherMap, skinMap, paintMap, woodMap, brickMap]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(3, 3); texture.anisotropy = quality === "ultra" ? 8 : 4; ownedTextures.push(texture);
  }
  const commuterMaps: CommuterSurfaceMaps = { fabric: fabricMap, leather: leatherMap, skin: skinMap };
  const tile = new THREE.MeshStandardMaterial({ color: isFifth ? "#d9d2bd" : isLex ? "#cdbb9d" : "#c5d1cf", roughness: .78, map: textures.stone, bumpMap: textures.stone, bumpScale: .018 });
  const floor = new THREE.MeshStandardMaterial({ color: "#77736a", roughness: .95, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .03 });
  const edge = new THREE.MeshStandardMaterial({ color: "#e3b93f", roughness: .74, map: paintMap, bumpMap: paintMap, bumpScale: .006 }), steel = new THREE.MeshStandardMaterial({ color: "#333b39", metalness: .78, roughness: .35, map: paintMap, bumpMap: paintMap, bumpScale: .008 }), brushedSteel = new THREE.MeshStandardMaterial({ color: "#8e9995", metalness: .82, roughness: .24, map: paintMap, bumpMap: paintMap, bumpScale: .006 }), dark = new THREE.MeshStandardMaterial({ color: "#151918", metalness: .24, roughness: .68, map: paintMap, bumpMap: paintMap, bumpScale: .01 });
  const ceiling = new THREE.MeshStandardMaterial({ color: "#242926", roughness: .94, map: paintMap, bumpMap: paintMap, bumpScale: .012 }), track = new THREE.MeshStandardMaterial({ color: "#292b29", roughness: .92, metalness: .3, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .02 });
  const sleeperMaterial = new THREE.MeshStandardMaterial({ color: "#3e3329", roughness: .92, map: woodMap, bumpMap: woodMap, bumpScale: .026 });
  const rivetMaterial = new THREE.MeshStandardMaterial({ color: "#77807d", metalness: .86, roughness: .22, map: paintMap });
  const groutMaterial = new THREE.MeshStandardMaterial({ color: "#8d8b80", roughness: .95, map: textures.stone });
  const boardingZoneMaterial = new THREE.MeshStandardMaterial({ color: "#d9d4c5", roughness: .68, map: paintMap, bumpMap: paintMap, bumpScale: .006 });
  const platformY = 0;
  for (const side of [-1, 1]) {
    const platform = new THREE.Mesh(new RoundedBoxGeometry(7.45, .35, PLATFORM_LENGTH, 2, .04), floor); platform.position.set(side * 6.02, platformY - .19, PLATFORM_CENTER_Z); platform.receiveShadow = true; root.add(platform);
    const tactile = new THREE.Mesh(new RoundedBoxGeometry(.48, .08, PLATFORM_LENGTH - 2, 2, .02), edge); tactile.position.set(side * 2.34, .04, PLATFORM_CENTER_Z); root.add(tactile);
    for (const doorZ of [-35.95, -29.85, -23.75, -16.1, -15.95, -10, -9.85, -3.9, -3.75]) for (const offset of [-.64, .64]) {
      const marker = new THREE.Mesh(new RoundedBoxGeometry(.9, .025, .065, 2, .012), boardingZoneMaterial); marker.position.set(side * 2.84, .075, doorZ + offset); root.add(marker);
    }
    for (let z = PLATFORM_MIN_Z + 4; z <= PLATFORM_MAX_Z - 3; z += 5.8) {
      const column = new THREE.Mesh(new RoundedBoxGeometry(.3, 4.7, .28, 2, .025), steel); column.position.set(side * 8.25, 2.25, z); column.castShadow = true; root.add(column);
      for (const flangeX of [-1, 1]) { const flange = new THREE.Mesh(new RoundedBoxGeometry(.09, 4.7, .52, 2, .018), steel); flange.position.set(side * 8.25 + flangeX * .15, 2.25, z); root.add(flange); }
      if (quality === "ultra") for (let y = .28; y < 4.35; y += .42) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 4), rivetMaterial); rivet.position.set(side * 8.25 - side * .18, y, z); root.add(rivet);
      }
    }
  }
  const trackBed = new THREE.Mesh(new RoundedBoxGeometry(4.4, .18, PLATFORM_LENGTH + 4, 2, .02), track); trackBed.position.set(0, -.62, PLATFORM_CENTER_Z); root.add(trackBed);
  for (let z = PLATFORM_MIN_Z - 1; z <= PLATFORM_MAX_Z + 1; z += 1.15) { const sleeper = new THREE.Mesh(new RoundedBoxGeometry(3.65, .12, .18, 2, .02), sleeperMaterial); sleeper.position.set(0, -.48, z); root.add(sleeper); }
  for (const x of [-1.2, 1.2]) { const rail = new THREE.Mesh(new RoundedBoxGeometry(.09, .11, PLATFORM_LENGTH + 4, 2, .02), steel); rail.position.set(x, -.32, PLATFORM_CENTER_Z); root.add(rail); }
  for (const x of [-1.78, 1.78]) { const thirdRail = new THREE.Mesh(new RoundedBoxGeometry(.12, .14, PLATFORM_LENGTH + 2, 2, .025), dark); thirdRail.position.set(x, -.4, PLATFORM_CENTER_Z); root.add(thirdRail); }
  const concourse = new THREE.Mesh(new RoundedBoxGeometry(20.2, .38, 23.5, 2, .04), floor); concourse.position.set(0, 3.81, 23.25); concourse.receiveShadow = true; root.add(concourse);
  // The concourse sits four metres above the platforms, so a single flat roof
  // intersected the upper floor and placed its spawn point above the ceiling.
  const lowerRoofMaxZ = 11.25, lowerRoofLength = lowerRoofMaxZ - PLATFORM_MIN_Z, lowerRoofCenterZ = (PLATFORM_MIN_Z + lowerRoofMaxZ) / 2;
  const platformRoof = new THREE.Mesh(new RoundedBoxGeometry(21, .4, lowerRoofLength, 2, .04), ceiling); platformRoof.position.set(0, 5.1, lowerRoofCenterZ); root.add(platformRoof);
  const concourseRoof = new THREE.Mesh(new RoundedBoxGeometry(21, .4, 18, 2, .04), ceiling); concourseRoof.position.set(0, 7.45, 20.5); root.add(concourseRoof);
  for (const side of [-1, 1]) {
    const platformWall = new THREE.Mesh(new RoundedBoxGeometry(.3, 4.7, PLATFORM_LENGTH + 2, 2, .04), tile); platformWall.position.set(side * 10.1, 2.25, PLATFORM_CENTER_Z); platformWall.receiveShadow = true; root.add(platformWall);
    const concourseWall = new THREE.Mesh(new RoundedBoxGeometry(.3, 3.25, 23.5, 2, .04), tile); concourseWall.position.set(side * 10.1, 5.55, 23.25); concourseWall.receiveShadow = true; root.add(concourseWall);
    const mosaicBand = new THREE.Mesh(new RoundedBoxGeometry(.325, .24, PLATFORM_LENGTH + 1, 2, .018), new THREE.MeshStandardMaterial({ color: isFifth ? "#c29d2e" : isLex ? "#28704e" : "#557f75", roughness: .72, map: paintMap, bumpMap: paintMap, bumpScale: .006 })); mosaicBand.position.set(side * 9.94, 4.25, PLATFORM_CENTER_Z); root.add(mosaicBand);
    const dado = new THREE.Mesh(new RoundedBoxGeometry(.326, .08, PLATFORM_LENGTH + 1, 2, .018), steel); dado.position.set(side * 9.93, 1.02, PLATFORM_CENTER_Z); root.add(dado);
    if (quality !== "mobile") for (let z = PLATFORM_MIN_Z + 1; z <= PLATFORM_MAX_Z - 1; z += 1.75) {
      const grout = new THREE.Mesh(new RoundedBoxGeometry(.018, 4.1, .025, 2, .005), groutMaterial); grout.position.set(side * 9.925, 2.38, z); root.add(grout);
    }
  }
  const pipeMaterials = [
    new THREE.MeshStandardMaterial({ color: "#765443", metalness: .42, roughness: .48, map: paintMap, bumpMap: paintMap, bumpScale: .008 }),
    new THREE.MeshStandardMaterial({ color: "#6d7c74", metalness: .62, roughness: .36, map: paintMap, bumpMap: paintMap, bumpScale: .008 }),
    new THREE.MeshStandardMaterial({ color: "#353b39", metalness: .68, roughness: .3, map: paintMap, bumpMap: paintMap, bumpScale: .008 }),
  ];
  for (const [index, x] of [-7.3, 0, 7.3].entries()) {
    addCylinderBetween(root, new THREE.Vector3(x, 4.77 + index * .045, PLATFORM_MIN_Z + 2), new THREE.Vector3(x, 4.77 + index * .045, 10.7), .045 + index * .012, pipeMaterials[index], radial);
  }
  addStairs(root, -5.1, -1, tile, paintMap); addStairs(root, 5.1, 1, tile, paintMap);
  const title = isFifth ? "5 AV / 59 ST" : isLex ? "LEXINGTON AV / 59 ST" : "WEST FARMS SQ / E TREMONT AV";
  const lines = isFifth ? ["QUEENS-BOUND  N  R  ←", "DOWNTOWN / BROOKLYN  W  →"] : isLex ? ["TRANSFER TO UPTOWN / BRONX  4  5  6  ←", "N  R  W · BROADWAY LINE  →"] : ["EXIT · BOSTON RD / E 178 ST", "2  5 · BRONX ZOO · ASIA GATE"];
  const signTexture = stationSignTexture(title, lines, isFifth ? "#fccc0a" : isLex ? "#00933c" : "#5f8f82"); ownedTextures.push(signTexture);
  addTextPanel(root, signTexture, [0, 3.55, 15.6], [6.1, 1.3], 0).name = "primary-platform-wayfinding";
  for (const side of [-1, 1]) addTextPanel(root, signTexture, [side * 6.1, 3.72, -35], [4.8, 1.05], 0).name = "route-direction-sign";
  const leftChoice = platformChoiceTexture(
    isFifth ? "QUEENS-BOUND" : isLex ? "UPTOWN / THE BRONX" : "BRONX ZOO / BOSTON RD",
    isFifth ? "N / R to Lexington Av–59 St" : isLex ? "4 / 5 express and 6 local" : "Exit via north stair · Asia Gate",
    isFifth ? ["N", "R"] : isLex ? ["4", "5", "6"] : ["2", "5"], isFifth ? "#fccc0a" : "#00933c", "LEFT",
  );
  const rightChoice = platformChoiceTexture(
    isFifth ? "DOWNTOWN / BROOKLYN" : isLex ? "DOWNTOWN" : "E TREMONT AV / BUS",
    isFifth ? "W and downtown Broadway service" : isLex ? "4 / 5 toward Brooklyn · 6 local" : "Street exit · local connections",
    isFifth ? ["W"] : isLex ? ["4", "5", "6"] : ["2", "5"], isFifth ? "#fccc0a" : "#00933c", "RIGHT",
  );
  ownedTextures.push(leftChoice, rightChoice);
  addTextPanel(root, leftChoice, [-5.1, 6.02, 13.95], [4.15, 1.17], 0).name = "left-stair-route-choice";
  addTextPanel(root, rightChoice, [5.1, 6.02, 13.95], [4.15, 1.17], 0).name = "right-stair-route-choice";
  const streetRoutes = isFifth ? ["N", "R", "W"] : isLex ? ["4", "5", "6"] : ["2", "5"];
  const streetTexture = exitSignTexture(isFifth ? "Subway entrance · 5 Av / 60 St" : isLex ? "Lexington Av / 59 St" : "Exit · Boston Rd / E 178 St", isFifth ? "Central Park South · Queens-bound N / R" : isLex ? "Uptown / The Bronx transfer" : "Bronx Zoo · Asia Gate", streetRoutes); ownedTextures.push(streetTexture);
  addStreetEntrance(root, floor, streetTexture, quality, paintMap);
  const exitTexture = exitSignTexture(isFifth ? "Queens-bound platform" : isLex ? "Uptown & The Bronx" : "North exit · Bronx Zoo", isFifth ? "N / R via 59 St platform" : isLex ? "4 / 5 / 6 · stairs down" : "Boston Rd & E 178 St", isFifth ? ["N", "R"] : isLex ? ["4", "5", "6"] : ["2", "5"], isLex ? "#00933c" : "#fccc0a"); ownedTextures.push(exitTexture);
  addTextPanel(root, exitTexture, [0, 6.35, 26.6], [7.4, 1.25], 0).name = "concourse-direction-sign";
  const mosaic = mosaicTexture(isFifth ? "Fifth Avenue" : isLex ? "Lexington Avenue" : "West Farms Square", isFifth ? "#80522c" : isLex ? "#2c7351" : "#426f69"); ownedTextures.push(mosaic);
  for (const side of [-1, 1]) for (const z of [-43, -20, 3, 24]) addTextPanel(root, mosaic, [side * 9.88, 3.72, z], [3.55, .64], side > 0 ? -Math.PI / 2 : Math.PI / 2);
  const adsPerWall = Math.ceil(detail.wallAds / 2);
  for (const side of [-1, 1]) for (let index = 0; index < adsPerWall; index++) {
    const texture = adTextures[(index + (side > 0 ? 1 : 0)) % adTextures.length];
    const ad = addTextPanel(root, texture, [side * 9.82, 2.08, -34 + index * 13], [2.72, 3.22], side > 0 ? -Math.PI / 2 : Math.PI / 2); ad.name = "unobstructed-sloth-themed-subway-ad";
  }
  const benchMaterial = new THREE.MeshStandardMaterial({ color: "#976748", roughness: .54, metalness: .04, map: woodMap, bumpMap: woodMap, bumpScale: .024 });
  for (const side of [-1, 1]) for (const z of [-27, 5]) {
    const bench = new THREE.Group(); bench.name = "platform-parallel-bench"; bench.position.set(side * 7.35, 0, z);
    for (let slat = -2; slat <= 2; slat++) { const seatSlat = new THREE.Mesh(new RoundedBoxGeometry(.18, .12, 3.6, 3, .04), benchMaterial); seatSlat.position.set(slat * .205, .67, 0); bench.add(seatSlat); }
    for (const legZ of [-1.3, 1.3]) addCylinderBetween(bench, new THREE.Vector3(-.34, .05, legZ), new THREE.Vector3(-.34, .62, legZ), .035, steel, radial);
    const back = new THREE.Mesh(new RoundedBoxGeometry(.12, .72, 3.6, 3, .045), benchMaterial); back.position.set(side * .48, 1.02, 0); back.rotation.z = side * -.08; bench.add(back); root.add(bench);
  }
  // Platform furniture: clocks, help points, bins, maps, and open turnstiles.
  const clockFace = new THREE.MeshBasicMaterial({ color: "#f3f0df", toneMapped: false });
  for (const clockZ of [-31, 8]) {
    const clock = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .07, radial), clockFace); clock.rotation.z = Math.PI / 2; clock.position.set(-8.25, 3.85, clockZ); root.add(clock);
    for (const angle of [0, Math.PI / 2]) addCylinderBetween(root, clock.position.clone().add(new THREE.Vector3(-.05, 0, 0)), clock.position.clone().add(new THREE.Vector3(-.055, Math.sin(angle) * .17, -Math.cos(angle) * .17)), .012, dark, 6);
  }
  const mapTexture = neighborhoodMapTexture(id); ownedTextures.push(mapTexture);
  for (const side of [-1, 1]) {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(.24, .28, .72, radial), new THREE.MeshStandardMaterial({ color: side < 0 ? "#4b7758" : "#3b586c", metalness: .36, roughness: .48, map: paintMap, bumpMap: paintMap, bumpScale: .008 })); bin.position.set(side * 8.55, .36, -8); root.add(bin);
    addTextPanel(root, mapTexture, [side * 9.8, 2.15, 29], [2.4, 3.2], side > 0 ? -Math.PI / 2 : Math.PI / 2).name = "neighborhood-service-map";
  }
  for (const x of [-7.4, -2.45, 2.45, 7.4]) {
    const turnstile = new THREE.Mesh(new RoundedBoxGeometry(.42, .86, .72, 4, .08), steel); turnstile.position.set(x, 4.43, 23.4); root.add(turnstile);
    addCylinderBetween(root, new THREE.Vector3(x, 4.9, 23.4), new THREE.Vector3(x + .62, 4.9, 23.4), .025, brushedSteel, radial);
  }
  const booth = new THREE.Group(); booth.name = "station-agent-booth"; booth.position.set(8.15, 4, 20.2);
  const boothBlue = new THREE.MeshStandardMaterial({ color: "#174f78", metalness: .28, roughness: .5, map: paintMap, bumpMap: paintMap, bumpScale: .01 });
  const boothGlass = new THREE.MeshPhysicalMaterial({ color: "#b8d1d1", transparent: true, opacity: .36, transmission: quality === "mobile" ? 0 : .36, roughness: .16 });
  const boothBase = new THREE.Mesh(new RoundedBoxGeometry(2.85, .78, 2.1, 4, .08), boothBlue); boothBase.position.y = .38; booth.add(boothBase);
  const boothRoof = new THREE.Mesh(new RoundedBoxGeometry(3.05, .16, 2.3, 4, .06), steel); boothRoof.position.y = 2.2; booth.add(boothRoof);
  for (const side of [-1, 1]) { const post = new THREE.Mesh(new RoundedBoxGeometry(.1, 1.45, .1, 2, .02), steel); post.position.set(side * 1.32, 1.42, 1); booth.add(post); }
  const boothWindow = new THREE.Mesh(new RoundedBoxGeometry(2.55, 1.28, .055, 3, .035), boothGlass); boothWindow.position.set(0, 1.43, 1.04); booth.add(boothWindow); root.add(booth);
  addStationAttendant(root, 8.15, 4, 20.35, Math.PI, quality, commuterMaps);
  const npcPlacements: Array<[number, number, [string, string], number]> = [
    [-7.15, -9, ["#7a463f", "#986e59"], .3], [7.1, -17, ["#31566a", "#d0a27d"], -2.7], [7.3, 5.5, ["#6c6544", "#704c38"], -1.4],
    [-7.2, -35.5, ["#824d63", "#c68f6d"], .8], [7.15, -4.5, ["#4b6653", "#e0b894"], -2.1], [-7.2, 2.6, ["#705a83", "#815a43"], .15],
    [7.2, 21, ["#a36f3f", "#b87857"], 2.6], [-7.15, -24.5, ["#38566f", "#d0aa91"], -.4],
  ];
  npcPlacements.slice(0, detail.npcCount).forEach(([x, z, palette, facing], index) => addNpc(root, x, z, palette, facing, index + (isLex ? 3 : id === "WEST_FARMS" ? 6 : 0), quality, commuterMaps));
  if (id === "WEST_FARMS") {
    const artWall = new THREE.Mesh(new RoundedBoxGeometry(18.8, 4.35, .22, 3, .035), new THREE.MeshStandardMaterial({ color: "#26312f", roughness: .72, map: paintMap, bumpMap: paintMap, bumpScale: .012 })); artWall.position.set(0, 2.25, -25.18); root.add(artWall);
    const artColors = ["#4d8e7e", "#d1a459", "#8c594b", "#65809f"];
    const artPanelTextures = [0, 1, 2].map(index => animalTracksPanelTexture(index)); ownedTextures.push(...artPanelTextures);
    const featuredMosaic = addTextPanel(root, bronxMosaicTexture, [0, 2.42, -24.92], [9.3, 4.08], 0); featuredMosaic.name = "bronx-zoo-featured-mosaic";
    const artLabelTexture = stationSignTexture("MTA ARTS & DESIGN", ["ANIMAL TRACKS · WEST FARMS SQUARE"], "#72aa92"); ownedTextures.push(artLabelTexture);
    addTextPanel(root, artLabelTexture, [-6.55, 3.95, -24.82], [3.45, .88], 0).name = "animal-tracks-gallery-label";
    for (const x of [-6.55, 6.55]) { const galleryLight = new THREE.SpotLight("#fff0ce", 27, 9, .62, .45, 1.3); galleryLight.position.set(x, 4.55, -21.4); galleryLight.target.position.set(x, 2.35, -25); root.add(galleryLight, galleryLight.target); }
    const artMaterials = artColors.map((color, index) => new THREE.MeshPhysicalMaterial({ color, map: artPanelTextures[index % artPanelTextures.length], transparent: true, opacity: .72, roughness: .12, transmission: quality === "mobile" ? 0 : .18, thickness: .08 }));
    // Original faceted windscreens evoke the station's zoo-linked glass art
    // through abstract tracks, plumage, and leaf colors without copying it.
    for (const side of [-1, 1]) for (let index = 0; index < 8; index++) {
      const z = -43 + index * 4.9;
      const pane = new THREE.Mesh(new RoundedBoxGeometry(.045, 2.7, 3.9, 3, .035), artMaterials[(index + (side > 0 ? 2 : 0)) % artMaterials.length]); pane.position.set(side * 9.74, 2.42, z); root.add(pane);
      if (quality !== "mobile") for (let facet = 0; facet < 3; facet++) {
        const triangle = new THREE.Mesh(new THREE.CircleGeometry(.44 + facet * .09, 3), artMaterials[(index + facet + 1) % artMaterials.length]); triangle.position.set(side * 9.705, 1.68 + facet * .72, z - .9 + facet * .84); triangle.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; triangle.rotation.z = index * .41 + facet * .72; root.add(triangle);
      }
    }
    const elevatedSteel = new THREE.MeshStandardMaterial({ color: "#31433f", metalness: .72, roughness: .38 });
    for (const x of [-9.25, 9.25]) for (const z of [-42, -27, -12, 3, 18]) {
      addCylinderBetween(root, new THREE.Vector3(x, -.1, z), new THREE.Vector3(x, 5.1, z), .13, elevatedSteel, radial);
      addCylinderBetween(root, new THREE.Vector3(x, .4, z), new THREE.Vector3(x, 4.7, z + 5.5), .075, elevatedSteel, radial);
      addCylinderBetween(root, new THREE.Vector3(x, 4.7, z), new THREE.Vector3(x, .4, z + 5.5), .075, elevatedSteel, radial);
    }
    for (const z of [-20, -5, 10]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.15, radial, radial), new THREE.MeshBasicMaterial({ color: "#fff0c6", toneMapped: false })); lamp.position.set(0, 4.52, z); root.add(lamp);
    }
    // The final staircase opens onto a modeled Bronx streetscape so the exit
    // reads as daylight and a real destination before the level transition.
    const streetSkyTexture = canvasTexture(1024, 512, (context, width, height) => {
      const gradient = context.createLinearGradient(0, 0, 0, height); gradient.addColorStop(0, "#82aeb8"); gradient.addColorStop(.55, "#c6d1c1"); gradient.addColorStop(1, "#e3c9a7"); context.fillStyle = gradient; context.fillRect(0, 0, width, height);
      context.fillStyle = "rgba(255,244,205,.62)"; context.beginPath(); context.arc(width * .77, height * .22, 52, 0, Math.PI * 2); context.fill();
      context.fillStyle = "rgba(255,255,255,.25)"; for (let cloud = 0; cloud < 6; cloud++) { context.beginPath(); context.ellipse(80 + cloud * 180, 110 + Math.sin(cloud) * 36, 110, 24, 0, 0, Math.PI * 2); context.fill(); }
    }); ownedTextures.push(streetSkyTexture);
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(31, 15), new THREE.MeshBasicMaterial({ map: streetSkyTexture, side: THREE.DoubleSide, toneMapped: false })); sky.position.set(0, 14.8, 61); root.add(sky);
    const street = new THREE.Mesh(new RoundedBoxGeometry(19.8, .18, 11.5, 2, .025), new THREE.MeshStandardMaterial({ color: "#373c3b", roughness: .96, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .018 })); street.position.set(0, 7.88, 54); root.add(street);
    for (let stripe = -3; stripe <= 3; stripe++) { const crossing = new THREE.Mesh(new RoundedBoxGeometry(1.3, .025, 5.6, 2, .008), new THREE.MeshStandardMaterial({ color: "#d8d5c8", roughness: .72, map: paintMap })); crossing.position.set(stripe * 2.25, 8, 52.3); root.add(crossing); }
    const brickMaterials = ["#8b5442", "#6f493e"].map(color => new THREE.MeshStandardMaterial({ color, roughness: .9, map: brickMap, bumpMap: brickMap, bumpScale: .035 }));
    for (const side of [-1, 1]) {
      const building = new THREE.Mesh(new RoundedBoxGeometry(7.8, 11.5, 4.4, 3, .08), brickMaterials[side > 0 ? 1 : 0]); building.position.set(side * 8.1, 13.75, 59); root.add(building);
      for (let floorIndex = 0; floorIndex < 4; floorIndex++) for (let bay = 0; bay < 3; bay++) {
        const window = new THREE.Mesh(new RoundedBoxGeometry(1.08, 1.35, .035, 3, .03), new THREE.MeshPhysicalMaterial({ color: "#6b8790", emissive: floorIndex === 2 && bay === 1 ? "#d3a85d" : "#1c2f35", emissiveIntensity: .16, metalness: .18, roughness: .2, transmission: quality === "mobile" ? 0 : .1 }));
        window.position.set(side * (4.15 + bay * 1.65), 10.25 + floorIndex * 2.35, 56.77); root.add(window);
      }
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.22, .29, 4.5, radial), new THREE.MeshStandardMaterial({ color: "#644932", roughness: .92, map: textures.bark, bumpMap: textures.bark, bumpScale: .08 })); trunk.position.set(side * 7.7, 10.25, 50.5); root.add(trunk);
      const crownMaterial = new THREE.MeshStandardMaterial({ color: "#496b3f", roughness: .86, map: textures.foliage, alphaTest: .3, side: THREE.DoubleSide });
      for (const offset of [[0, 0], [.8, .3], [-.75, .25]] as const) { const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, quality === "ultra" ? 2 : 1), crownMaterial); crown.position.set(side * 7.7 + offset[0], 13.15 + offset[1], 50.5); root.add(crown); }
    }
    const zooWayfinding = exitSignTexture("Bronx Zoo · Asia Gate", "Boston Road entrance · cross at the signal", ["2", "5"], "#72aa92"); ownedTextures.push(zooWayfinding);
    addTextPanel(root, zooWayfinding, [0, 11.1, 55.75], [8.2, 1.65], 0).name = "daylight-bronx-zoo-wayfinding";
    const streetPole = new THREE.MeshStandardMaterial({ color: "#25312e", metalness: .7, roughness: .34, map: paintMap });
    for (const side of [-1, 1]) {
      addCylinderBetween(root, new THREE.Vector3(side * 4.7, 8, 51.5), new THREE.Vector3(side * 4.7, 12.2, 51.5), .065, streetPole, radial);
      const streetLamp = new THREE.Mesh(new THREE.SphereGeometry(.22, radial, radial), new THREE.MeshBasicMaterial({ color: "#fff2c9", toneMapped: false })); streetLamp.position.set(side * 4.7, 12.35, 51.5); root.add(streetLamp);
    }
  }
  const spawn = id === "FIFTH_AV" ? new THREE.Vector3(0, STREET_FLOOR_Y + 1.48, 46) : id === "LEXINGTON" ? new THREE.Vector3(0, CONCOURSE_FLOOR_Y + 1.48, 26) : new THREE.Vector3(-6, 1.48, -10);
  const waypoint = id === "WEST_FARMS" ? new THREE.Vector3(0, STREET_FLOOR_Y, 46) : new THREE.Vector3(-6, 0, TRAIN_STOP_Z);
  return { root, spawn, waypoint } satisfies StationRig;
}

export class SubwayWorld {
  readonly root = new THREE.Group();
  readonly stations = new Map<SubwayStationId, StationRig>();
  readonly correctTrain: TrainRig;
  readonly wrongTrain: TrainRig;
  readonly ownedTextures: THREE.Texture[] = [];
  readonly quality: SubwayQuality;
  stationId: SubwayStationId = "FIFTH_AV";
  trainPhase: TrainPhase = "APPROACHING";
  secondsToTrain = 4;
  doorsOpen = false;
  private serviceCycle = -1;

  constructor(scene: THREE.Scene, textures: GameTextures, options: SubwayWorldOptions = {}) {
    this.quality = options.quality ?? "balanced";
    const detail = SUBWAY_DETAIL[this.quality];
    this.root.name = "premium-nyc-subway-campaign"; scene.add(this.root);
    const loader = new THREE.TextureLoader();
    const adTextures = [
      loader.load("/game/ads/slow-superpower.webp"), loader.load("/game/ads/branch-out.webp"),
      loader.load("/game/ads/canopy-commute.webp"), loader.load("/game/ads/slow-fashion.webp"),
      loader.load("/game/ads/bronx-bound.webp"), loader.load("/game/ads/ramble-after-dark.webp"),
    ];
    adTextures.forEach(texture => { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = this.quality === "ultra" ? 8 : 4; }); this.ownedTextures.push(...adTextures);
    const bronxMosaicTexture = loader.load("/game/subway/bronx-zoo-mosaic.webp"); bronxMosaicTexture.colorSpace = THREE.SRGBColorSpace; bronxMosaicTexture.anisotropy = this.quality === "ultra" ? 8 : 4; this.ownedTextures.push(bronxMosaicTexture);
    for (const id of ["FIFTH_AV", "LEXINGTON", "WEST_FARMS"] as const) { const station = buildStation(id, textures, adTextures, bronxMosaicTexture, this.ownedTextures, this.quality); station.root.visible = false; this.stations.set(id, station); this.root.add(station.root); }
    this.correctTrain = buildTrain(textures, "N", "QUEENS-BOUND", true, -1.1, this.quality, this.ownedTextures); this.wrongTrain = buildTrain(textures, "W", "DOWNTOWN / BROOKLYN", false, 1.1, this.quality, this.ownedTextures); this.root.add(this.correctTrain.root, this.wrongTrain.root);
    const ambient = new THREE.HemisphereLight("#e9eee5", "#394039", 1.08), fill = new THREE.AmbientLight("#c8d1c7", .48);
    this.root.add(ambient, fill);
    const fluorescent = new THREE.MeshBasicMaterial({ color: "#eaf5df", toneMapped: false });
    const lightPositions = Array.from({ length: detail.ceilingLights }, (_, index) => THREE.MathUtils.lerp(PLATFORM_MIN_Z + 4, 9.2, index / Math.max(1, detail.ceilingLights - 1)));
    for (const z of lightPositions) {
      const strip = new THREE.Mesh(new RoundedBoxGeometry(9.4, .07, .22, 2, .025), fluorescent); strip.position.set(0, 4.82, z); this.root.add(strip);
      for (const x of [-4.6, 4.6]) { const fixture = new THREE.PointLight("#e5f1d3", this.quality === "mobile" ? 31 : 38, 18, 1.25); fixture.position.set(x, 4.5, z); this.root.add(fixture); }
    }
    for (const z of [17, 27, 37]) {
      const concourseStrip = new THREE.Mesh(new RoundedBoxGeometry(9.4, .07, .22, 2, .025), fluorescent); concourseStrip.position.set(0, z < 32 ? 7.15 : 9.95, z); this.root.add(concourseStrip);
      if (z < 32 || this.quality !== "mobile") for (const x of [-4.6, 4.6]) { const fixture = new THREE.PointLight("#e5f1d3", z < 32 ? 34 : 26, 16, 1.25); fixture.position.set(x, z < 32 ? 6.9 : 9.7, z); this.root.add(fixture); }
    }
    this.setStation("FIFTH_AV");
  }

  get spawn() { return this.stations.get(this.stationId)!.spawn; }
  get waypoint() { return this.stations.get(this.stationId)!.waypoint; }

  setStation(id: SubwayStationId) {
    this.stationId = id; for (const [stationId, station] of this.stations) station.root.visible = stationId === id;
    const westFarms = id === "WEST_FARMS"; this.correctTrain.root.visible = this.wrongTrain.root.visible = !westFarms; this.serviceCycle = -1;
    if (id === "LEXINGTON") {
      this.configureTrain(this.correctTrain, "5", "UPTOWN / BRONX", true, "#00933c");
      this.configureTrain(this.wrongTrain, "5", "DOWNTOWN / BROOKLYN", false, "#00933c");
    } else if (id === "FIFTH_AV") {
      this.configureTrain(this.correctTrain, "N", "QUEENS-BOUND", true, "#fccc0a");
      this.configureTrain(this.wrongTrain, "W", "DOWNTOWN / BROOKLYN", false, "#fccc0a");
    }
    this.setDoorAmount(this.correctTrain, 0); this.setDoorAmount(this.wrongTrain, 0); this.doorsOpen = false;
    this.correctTrain.root.position.z = -TRAIN_APPROACH_DISTANCE; this.wrongTrain.root.position.z = TRAIN_APPROACH_DISTANCE;
    this.root.updateMatrixWorld(true); return this;
  }

  private configureTrain(train: TrainRig, route: string, direction: string, correct: boolean, color: string) {
    if (train.route === route && train.direction === direction && train.correct === correct) return;
    train.badgeTexture.dispose(); train.badgeTexture = trainBadgeTexture(route, direction, color); train.badgeMaterial.map = train.badgeTexture; train.badgeMaterial.needsUpdate = true;
    train.interiorTexture = openCarInteriorTexture(route, this.quality); this.ownedTextures.push(train.interiorTexture); train.interiorMaterial.map = train.interiorTexture; train.interiorMaterial.needsUpdate = true;
    train.route = route; train.direction = direction; train.correct = correct;
  }

  private setDoorAmount(train: TrainRig, amount: number) {
    const opening = THREE.MathUtils.clamp(amount, 0, 1) * .62;
    for (const pair of train.doors) {
      // The centre-facing doors stay closed: there is no platform between the
      // two tracks, and opening them invited the player into moving traffic.
      const pairOpening = pair.userData.platformFacing === true ? opening : 0;
      pair.children[0].position.x = -.56 - pairOpening;
      pair.children[1].position.x = .56 + pairOpening;
    }
  }

  private staircaseAt(x: number) {
    const absoluteX = Math.abs(x);
    return absoluteX >= 3 && absoluteX <= 7.2;
  }

  private streetStaircaseAt(x: number) {
    return Math.abs(x) <= 3.05;
  }

  private stairSurface(z: number, startZ: number, endZ: number, startY: number, endY: number, stepCount: number) {
    const amount = THREE.MathUtils.clamp((z - startZ) / (endZ - startZ), 0, 1);
    const step = Math.round(amount * (stepCount - 1));
    return THREE.MathUtils.lerp(startY, endY, step / (stepCount - 1));
  }

  private platformDoorPositions(train: TrainRig) {
    if (!train.root.visible) return [];
    return train.doors.filter(door => door.userData.platformFacing === true).map(door => door.getWorldPosition(new THREE.Vector3()));
  }

  private nearestOpenDoor(player: THREE.Vector3, maximumZDistance: number) {
    if (!this.doorsOpen || this.stationId === "WEST_FARMS") return null;
    let best: { distance: number; position: THREE.Vector3; train: TrainRig } | null = null;
    for (const train of [this.correctTrain, this.wrongTrain]) for (const position of this.platformDoorPositions(train)) {
      if (Math.sign(position.x) !== Math.sign(player.x)) continue;
      const distance = Math.abs(player.z - position.z);
      if (distance <= maximumZDistance && (!best || distance < best.distance)) best = { distance, position, train };
    }
    return best;
  }

  floorHeight(x: number, z: number) {
    if (z >= STREET_STAIR_TOP_Z) return STREET_FLOOR_Y;
    if (z >= STREET_STAIR_BOTTOM_Z && this.streetStaircaseAt(x)) return this.stairSurface(z, STREET_STAIR_BOTTOM_Z, STREET_STAIR_TOP_Z, CONCOURSE_FLOOR_Y, STREET_FLOOR_Y, 22);
    if (z >= 13.6) return CONCOURSE_FLOOR_Y;
    if (z >= 4.4 && this.staircaseAt(x)) return this.stairSurface(z, 4.4, 13.6, 0, CONCOURSE_FLOOR_Y, 16);
    return 0;
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    player.x = THREE.MathUtils.clamp(player.x, -9.82, 9.82); player.z = THREE.MathUtils.clamp(player.z, PLATFORM_MIN_Z + .8, 49.5);
    if (player.z > STREET_STAIR_BOTTOM_Z && player.z < STREET_STAIR_TOP_Z && !this.streetStaircaseAt(player.x)) {
      player.z = player.z >= (STREET_STAIR_BOTTOM_Z + STREET_STAIR_TOP_Z) * .5 ? STREET_STAIR_TOP_Z : STREET_STAIR_BOTTOM_Z; velocity.z = 0;
    }
    if (player.z < 13.6 && player.z > 4.15 && !this.staircaseAt(player.x)) {
      const absoluteX = Math.abs(player.x), side = player.x <= 0 ? -1 : 1;
      if (absoluteX >= 2.15) { player.x = side * THREE.MathUtils.clamp(absoluteX, 3, 7.2); velocity.x = 0; }
      else { player.z = player.z >= 8.95 ? 13.6 : 4.15; velocity.z = 0; }
    }
    if (player.z <= 4.15 && Math.abs(player.x) < 2.25) {
      const side = player.x <= 0 ? -1 : 1, openDoor = this.nearestOpenDoor(player, .61);
      if (openDoor && openDoor.train.platformSide === side) {
        player.z = THREE.MathUtils.clamp(player.z, openDoor.position.z - .47, openDoor.position.z + .47);
        player.x = side < 0 ? THREE.MathUtils.clamp(player.x, -9.82, -1.35) : THREE.MathUtils.clamp(player.x, 1.35, 9.82);
      } else { player.x = side * 2.25; velocity.x = 0; }
    }
    player.y = this.floorHeight(player.x, player.z) + 1.48;
  }

  update(elapsed: number) {
    if (this.stationId === "WEST_FARMS") { this.trainPhase = "AWAY"; this.doorsOpen = false; this.secondsToTrain = 0; this.correctTrain.root.visible = this.wrongTrain.root.visible = false; return; }
    const cycleNumber = Math.floor(elapsed / SUBWAY_TRAIN_INTERVAL_SECONDS);
    if (this.stationId === "FIFTH_AV" && cycleNumber !== this.serviceCycle) {
      // Successive 30-second arrivals alternate the two valid Broadway-line
      // services, so the authored N / R objective is true in play as well as UI.
      const route = cycleNumber % 2 === 0 ? "N" : "R";
      this.configureTrain(this.correctTrain, route, "QUEENS-BOUND", true, "#fccc0a");
    }
    this.serviceCycle = cycleNumber;
    const cycle = elapsed % SUBWAY_TRAIN_INTERVAL_SECONDS;
    let z = TRAIN_APPROACH_DISTANCE;
    if (cycle < 4) { this.trainPhase = "APPROACHING"; z = THREE.MathUtils.lerp(-TRAIN_APPROACH_DISTANCE, TRAIN_STOP_Z, cycle / 4); this.secondsToTrain = Math.ceil(4 - cycle); }
    else if (cycle < 16) { this.trainPhase = "BOARDING"; z = TRAIN_STOP_Z; this.secondsToTrain = 0; }
    else if (cycle < 21) { this.trainPhase = "DEPARTING"; z = THREE.MathUtils.lerp(TRAIN_STOP_Z, TRAIN_APPROACH_DISTANCE + 8, (cycle - 16) / 5); this.secondsToTrain = Math.ceil(SUBWAY_TRAIN_INTERVAL_SECONDS + 4 - cycle); }
    else { this.trainPhase = "AWAY"; this.secondsToTrain = Math.ceil(SUBWAY_TRAIN_INTERVAL_SECONDS + 4 - cycle); }
    this.doorsOpen = cycle >= 5 && cycle < 15;
    for (const train of [this.correctTrain, this.wrongTrain]) {
      train.root.visible = this.trainPhase !== "AWAY"; train.root.position.z = train.correct ? z : -z;
      train.root.position.y = -.08 + Math.sin(elapsed * 8 + (train.correct ? 0 : 1)) * .008;
      this.setDoorAmount(train, this.doorsOpen ? 1 : 0);
    }
  }

  /** Closes the doors, hides the other service, and moves the boarded train out. */
  updateRide(option: BoardingOption, progress: number, elapsed: number) {
    const train = option.correct ? this.correctTrain : this.wrongTrain;
    const other = option.correct ? this.wrongTrain : this.correctTrain;
    const amount = THREE.MathUtils.clamp(progress, 0, 1);
    train.root.visible = true; other.root.visible = false;
    this.setDoorAmount(train, 1 - THREE.MathUtils.smoothstep(amount, 0, .18));
    train.root.position.z = THREE.MathUtils.lerp(train.correct ? TRAIN_STOP_Z : -TRAIN_STOP_Z, train.correct ? TRAIN_APPROACH_DISTANCE : -TRAIN_APPROACH_DISTANCE, THREE.MathUtils.smoothstep(amount, .16, 1));
    train.root.position.y = -.08 + Math.sin(elapsed * 8 + (train.correct ? 0 : 1)) * .008;
    this.doorsOpen = amount < .18;
    this.trainPhase = amount < .18 ? "BOARDING" : "DEPARTING";
    train.root.updateMatrixWorld(true);
  }

  boardingOption(player: THREE.Vector3): BoardingOption | null {
    if (!this.doorsOpen || this.stationId === "WEST_FARMS") return null;
    let boarded: { depth: number; train: TrainRig } | null = null;
    for (const train of [this.correctTrain, this.wrongTrain]) for (const door of this.platformDoorPositions(train)) {
      const depth = train.platformSide < 0 ? player.x - door.x : door.x - player.x;
      if (depth < .09 || depth > .86 || Math.abs(player.z - door.z) > .46) continue;
      if (!boarded || depth < boarded.depth) boarded = { depth, train };
    }
    return boarded ? { correct: boarded.train.correct, direction: boarded.train.direction, route: boarded.train.route, station: this.stationId } : null;
  }

  /** A wider non-boarding zone for optional UI hints; crossing the threshold is handled by boardingOption. */
  boardingHint(player: THREE.Vector3): BoardingOption | null {
    if (!this.doorsOpen || this.stationId === "WEST_FARMS") return null;
    let nearest: { distance: number; train: TrainRig } | null = null;
    for (const train of [this.correctTrain, this.wrongTrain]) for (const door of this.platformDoorPositions(train)) {
      const distance = Math.hypot(player.x - door.x, player.z - door.z);
      if (distance > 1.35 || nearest && nearest.distance <= distance) continue;
      nearest = { distance, train };
    }
    return nearest ? { correct: nearest.train.correct, direction: nearest.train.direction, route: nearest.train.route, station: this.stationId } : null;
  }

  dispose() {
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]; meshMaterials.forEach(material => materials.add(material)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    this.correctTrain.badgeTexture.dispose(); this.wrongTrain.badgeTexture.dispose(); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
