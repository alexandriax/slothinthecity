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
  mobile: { radialSegments: 8, npcCount: 3, wallAds: 4, ceilingLights: 3, trainInterior: false },
  balanced: { radialSegments: 12, npcCount: 5, wallAds: 6, ceilingLights: 4, trainInterior: true },
  ultra: { radialSegments: 18, npcCount: 8, wallAds: 8, ceilingLights: 6, trainInterior: true },
};

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

function addNpc(parent: THREE.Group, x: number, z: number, palette: [string, string], facing = 0, variant = 0, quality: SubwayQuality = "balanced") {
  const npc = new THREE.Group(); npc.name = `subway-passenger-${variant}`; npc.position.set(x, 0, z); npc.rotation.y = facing;
  const segments = SUBWAY_DETAIL[quality].radialSegments;
  const coat = new THREE.MeshStandardMaterial({ color: palette[0], roughness: .72, metalness: .015 });
  const skin = new THREE.MeshPhysicalMaterial({ color: palette[1], roughness: .78, sheen: .12, sheenRoughness: .8 });
  const hairColors = ["#171412", "#302019", "#65442e", "#b5aaa0", "#201d22"];
  const hair = new THREE.MeshStandardMaterial({ color: hairColors[variant % hairColors.length], roughness: .9 });
  const trouserColors = ["#171b1e", "#292a35", "#2d382f", "#443b35", "#182c3d"];
  const trouser = new THREE.MeshStandardMaterial({ color: trouserColors[variant % trouserColors.length], roughness: .82 });
  const leather = new THREE.MeshStandardMaterial({ color: variant % 2 ? "#30221c" : "#111515", roughness: .58, metalness: .04 });
  const accentColors = ["#d6aa54", "#b1463e", "#3b7089", "#7870a2", "#638a58"];
  const accent = new THREE.MeshStandardMaterial({ color: accentColors[variant % accentColors.length], roughness: .7 });
  const eye = new THREE.MeshStandardMaterial({ color: "#161313", roughness: .36 });
  const stature = 1 + ((variant % 3) - 1) * .04;
  npc.scale.setScalar(stature);

  const hips = new THREE.Mesh(new RoundedBoxGeometry(.48, .35, .31, 4, .12), trouser); hips.position.y = .83; npc.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.28 + (variant % 2) * .025, .67, 8, segments), coat); torso.position.y = 1.3; npc.add(torso);
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
  for (const side of [-1, 1]) {
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(.021, segments, Math.max(6, segments - 2)), eye); eyeball.position.set(side * .076, 2.012, -.2); npc.add(eyeball);
    if (quality !== "mobile") {
      const brow = addCylinderBetween(npc, new THREE.Vector3(side * .045, 2.06, -.213), new THREE.Vector3(side * .108, 2.052, -.203), .007, hair, 6); brow.name = "eyebrow";
    }
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

function addStairs(parent: THREE.Group, x: number, side: -1 | 1, material: THREE.Material) {
  const steps = 16;
  for (let index = 0; index < steps; index++) {
    const amount = index / (steps - 1), step = new THREE.Mesh(new RoundedBoxGeometry(4.2, .14, .58, 2, .025), material);
    step.position.set(x, amount * 4 - .07, THREE.MathUtils.lerp(4.4, 13.6, amount)); step.receiveShadow = true; parent.add(step);
  }
  const railMaterial = new THREE.MeshStandardMaterial({ color: "#747b78", metalness: .9, roughness: .2 });
  for (const railSide of [-1, 1]) {
    const start = new THREE.Vector3(x + railSide * 1.85, .72, 4.3), end = new THREE.Vector3(x + railSide * 1.85, 4.72, 13.8), direction = end.clone().sub(start);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, direction.length(), 10), railMaterial); rail.position.copy(start).add(end).multiplyScalar(.5); rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); rail.castShadow = true; parent.add(rail);
  }
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.15, .45, 12), new THREE.MeshBasicMaterial({ color: side < 0 ? "#d9ef8b" : "#e6a85e" })); arrow.position.set(x, 4.25, 14.05); arrow.rotation.x = side < 0 ? Math.PI : 0; parent.add(arrow);
}

function buildTrain(textures: GameTextures, route: string, direction: string, correct: boolean, trackX: number, quality: SubwayQuality) {
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
    const pair = new THREE.Group(); pair.position.set(side * 1.071, 1.62, z); pair.rotation.y = side * Math.PI / 2;
    for (const half of [-1, 1]) {
      const door = new THREE.Mesh(new RoundedBoxGeometry(1.1, 2.36, .07, 3, .035), steel); door.position.x = half * .56;
      const doorWindow = new THREE.Mesh(new RoundedBoxGeometry(.54, .68, .025, 3, .035), glass); doorWindow.position.set(0, .4, .055); door.add(doorWindow); pair.add(door);
      if (quality !== "mobile") {
        const gasket = new THREE.Mesh(new RoundedBoxGeometry(.61, .76, .018, 3, .04), doorGasket); gasket.position.set(0, .4, .041); door.add(gasket); doorWindow.position.z = .056;
      }
    }
    const doorway = new THREE.Mesh(new RoundedBoxGeometry(2.18, 2.35, .025, 3, .04), dark); doorway.position.z = -.025; pair.add(doorway);
    const doorwayGlow = new THREE.Mesh(new RoundedBoxGeometry(1.82, 2.02, .018, 3, .025), cabinGlow); doorwayGlow.position.z = -.041; pair.add(doorwayGlow);
    const centrePole = new THREE.Mesh(new THREE.CylinderGeometry(.025, .025, 2, radial), brushedSteel); centrePole.position.z = -.065; pair.add(centrePole);
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
  root.position.x = trackX; return { root, doors, badgeMaterial, badgeTexture, route, direction, correct, platformSide } satisfies TrainRig;
}

function buildStation(id: SubwayStationId, textures: GameTextures, adTextures: THREE.Texture[], ownedTextures: THREE.Texture[], quality: SubwayQuality) {
  const root = new THREE.Group(); root.name = `station-${id.toLowerCase()}`;
  const detail = SUBWAY_DETAIL[quality], radial = detail.radialSegments;
  const isFifth = id === "FIFTH_AV", isLex = id === "LEXINGTON";
  const tile = new THREE.MeshStandardMaterial({ color: isFifth ? "#d9d2bd" : isLex ? "#cdbb9d" : "#c5d1cf", roughness: .86, map: textures.ground, bumpMap: textures.ground, bumpScale: .025 });
  const floor = new THREE.MeshStandardMaterial({ color: "#77736a", roughness: .95, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .03 });
  const edge = new THREE.MeshStandardMaterial({ color: "#e3b93f", roughness: .74 }), steel = new THREE.MeshStandardMaterial({ color: "#333b39", metalness: .78, roughness: .35 }), brushedSteel = new THREE.MeshStandardMaterial({ color: "#8e9995", metalness: .82, roughness: .24 }), dark = new THREE.MeshStandardMaterial({ color: "#151918", metalness: .24, roughness: .68 });
  const ceiling = new THREE.MeshStandardMaterial({ color: "#242926", roughness: .94 }), track = new THREE.MeshStandardMaterial({ color: "#292b29", roughness: .92, metalness: .3 });
  const sleeperMaterial = new THREE.MeshStandardMaterial({ color: "#3e3329", roughness: .92 });
  const rivetMaterial = new THREE.MeshStandardMaterial({ color: "#77807d", metalness: .86, roughness: .22 });
  const groutMaterial = new THREE.MeshStandardMaterial({ color: "#8d8b80", roughness: .95 });
  const platformY = 0;
  for (const side of [-1, 1]) {
    const platform = new THREE.Mesh(new RoundedBoxGeometry(5.6, .35, 50, 2, .04), floor); platform.position.set(side * 5.1, platformY - .19, -7); platform.receiveShadow = true; root.add(platform);
    const tactile = new THREE.Mesh(new RoundedBoxGeometry(.42, .08, 48, 2, .02), edge); tactile.position.set(side * 2.35, .04, -7); root.add(tactile);
    for (let z = -28; z <= 14; z += 5.3) {
      const column = new THREE.Mesh(new RoundedBoxGeometry(.3, 4.7, .28, 2, .025), steel); column.position.set(side * 6.8, 2.25, z); column.castShadow = true; root.add(column);
      for (const flangeX of [-1, 1]) { const flange = new THREE.Mesh(new RoundedBoxGeometry(.09, 4.7, .52, 2, .018), steel); flange.position.set(side * 6.8 + flangeX * .15, 2.25, z); root.add(flange); }
      if (quality === "ultra") for (let y = .28; y < 4.35; y += .42) {
        const rivet = new THREE.Mesh(new THREE.SphereGeometry(.018, 6, 4), rivetMaterial); rivet.position.set(side * 6.8 - side * .18, y, z); root.add(rivet);
      }
    }
  }
  const trackBed = new THREE.Mesh(new RoundedBoxGeometry(4.4, .18, 52, 2, .02), track); trackBed.position.set(0, -.62, -7); root.add(trackBed);
  for (let z = -32; z <= 18; z += 1.15) { const sleeper = new THREE.Mesh(new RoundedBoxGeometry(3.65, .12, .18, 2, .02), sleeperMaterial); sleeper.position.set(0, -.48, z); root.add(sleeper); }
  for (const x of [-1.2, 1.2]) { const rail = new THREE.Mesh(new RoundedBoxGeometry(.09, .11, 52, 2, .02), steel); rail.position.set(x, -.32, -7); root.add(rail); }
  for (const x of [-1.78, 1.78]) { const thirdRail = new THREE.Mesh(new RoundedBoxGeometry(.12, .14, 50, 2, .025), dark); thirdRail.position.set(x, -.4, -7); root.add(thirdRail); }
  const concourse = new THREE.Mesh(new RoundedBoxGeometry(17, .38, 10, 2, .04), floor); concourse.position.set(0, 3.81, 17.2); concourse.receiveShadow = true; root.add(concourse);
  // The concourse sits four metres above the platforms, so a single flat roof
  // intersected the upper floor and placed its spawn point above the ceiling.
  const platformRoof = new THREE.Mesh(new RoundedBoxGeometry(18, .4, 40, 2, .04), ceiling); platformRoof.position.set(0, 5.1, -9); root.add(platformRoof);
  const concourseRoof = new THREE.Mesh(new RoundedBoxGeometry(18, .4, 12, 2, .04), ceiling); concourseRoof.position.set(0, 7.45, 17); root.add(concourseRoof);
  for (const side of [-1, 1]) {
    const platformWall = new THREE.Mesh(new RoundedBoxGeometry(.3, 4.7, 50, 2, .04), tile); platformWall.position.set(side * 8.3, 2.25, -7); platformWall.receiveShadow = true; root.add(platformWall);
    const concourseWall = new THREE.Mesh(new RoundedBoxGeometry(.3, 3.25, 10, 2, .04), tile); concourseWall.position.set(side * 8.3, 5.55, 17.2); concourseWall.receiveShadow = true; root.add(concourseWall);
    const mosaicBand = new THREE.Mesh(new RoundedBoxGeometry(.325, .24, 49, 2, .018), new THREE.MeshStandardMaterial({ color: isFifth ? "#c29d2e" : isLex ? "#28704e" : "#557f75", roughness: .72 })); mosaicBand.position.set(side * 8.14, 3.35, -7); root.add(mosaicBand);
    const dado = new THREE.Mesh(new RoundedBoxGeometry(.326, .08, 49, 2, .018), steel); dado.position.set(side * 8.13, 1.02, -7); root.add(dado);
    if (quality !== "mobile") for (let z = -31; z <= 16; z += 1.55) {
      const grout = new THREE.Mesh(new RoundedBoxGeometry(.018, 4.1, .025, 2, .005), groutMaterial); grout.position.set(side * 8.125, 2.38, z); root.add(grout);
    }
  }
  const pipeMaterials = [
    new THREE.MeshStandardMaterial({ color: "#765443", metalness: .42, roughness: .48 }),
    new THREE.MeshStandardMaterial({ color: "#6d7c74", metalness: .62, roughness: .36 }),
    new THREE.MeshStandardMaterial({ color: "#353b39", metalness: .68, roughness: .3 }),
  ];
  for (const [index, x] of [-5.7, 0, 5.7].entries()) {
    addCylinderBetween(root, new THREE.Vector3(x, 4.77 + index * .045, -29), new THREE.Vector3(x, 4.77 + index * .045, 10), .045 + index * .012, pipeMaterials[index], radial);
  }
  addStairs(root, -5.1, -1, tile); addStairs(root, 5.1, 1, tile);
  const title = isFifth ? "5 AV / 59 ST" : isLex ? "LEXINGTON AV / 59 ST" : "WEST FARMS SQ / E TREMONT AV";
  const lines = isFifth ? ["QUEENS-BOUND  N  R  ←", "DOWNTOWN / BROOKLYN  W  →"] : isLex ? ["TRANSFER TO UPTOWN / BRONX  4  5  6  ←", "DOWNTOWN & BROOKLYN  →"] : ["EXIT · BOSTON RD / E 178 ST", "BRONX ZOO · ASIA GATE"];
  const signTexture = stationSignTexture(title, lines, isFifth ? "#fccc0a" : isLex ? "#00933c" : "#5f8f82"); ownedTextures.push(signTexture);
  // Keep the sign between the two stair openings. The former full-width panel
  // physically cut through both flights at eye level.
  addTextPanel(root, signTexture, [0, 3.45, 12], [4.75, 1.2], 0);
  const mosaic = mosaicTexture(isFifth ? "Fifth Avenue" : isLex ? "Lexington Avenue" : "West Farms Square", isFifth ? "#80522c" : isLex ? "#2c7351" : "#426f69"); ownedTextures.push(mosaic);
  for (const side of [-1, 1]) for (const z of [-27.8, 10.8]) addTextPanel(root, mosaic, [side * 8.08, 3.72, z], [3.3, .62], side > 0 ? -Math.PI / 2 : Math.PI / 2);
  const adsPerWall = Math.ceil(detail.wallAds / 2);
  for (const side of [-1, 1]) for (let index = 0; index < adsPerWall; index++) {
    const texture = adTextures[(index + (side > 0 ? 1 : 0)) % adTextures.length];
    const ad = addTextPanel(root, texture, [side * 8.02, 2.18, -22.2 + index * 8.8], [2.55, 3.75], side > 0 ? -Math.PI / 2 : Math.PI / 2); ad.name = "sloth-themed-subway-ad";
  }
  const benchMaterial = new THREE.MeshStandardMaterial({ color: "#976748", roughness: .54, metalness: .14 });
  for (const side of [-1, 1]) {
    const bench = new THREE.Group(); bench.position.set(side * 6, 0, -12); bench.rotation.y = Math.PI / 2;
    for (let slat = -2; slat <= 2; slat++) { const seatSlat = new THREE.Mesh(new RoundedBoxGeometry(.18, .12, 3.3, 3, .04), benchMaterial); seatSlat.position.set(slat * .205, .67, 0); bench.add(seatSlat); }
    for (const legZ of [-1.2, 1.2]) addCylinderBetween(bench, new THREE.Vector3(-.34, .05, legZ), new THREE.Vector3(-.34, .62, legZ), .035, steel, radial);
    const back = new THREE.Mesh(new RoundedBoxGeometry(.12, .72, 3.3, 3, .045), benchMaterial); back.position.set(.48, 1.02, 0); back.rotation.z = -.08; bench.add(back); root.add(bench);
  }
  // Platform furniture: clocks, help points, bins, maps, and open turnstiles.
  const clockFace = new THREE.MeshBasicMaterial({ color: "#f3f0df", toneMapped: false });
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(.31, .31, .07, radial), clockFace); clock.rotation.z = Math.PI / 2; clock.position.set(-6.7, 3.85, -7); root.add(clock);
  for (const angle of [0, Math.PI / 2]) addCylinderBetween(root, clock.position.clone().add(new THREE.Vector3(-.05, 0, 0)), clock.position.clone().add(new THREE.Vector3(-.055, Math.sin(angle) * .17, -Math.cos(angle) * .17)), .012, dark, 6);
  for (const side of [-1, 1]) {
    const bin = new THREE.Mesh(new THREE.CylinderGeometry(.24, .28, .72, radial), new THREE.MeshStandardMaterial({ color: side < 0 ? "#4b7758" : "#3b586c", metalness: .36, roughness: .48 })); bin.position.set(side * 7.1, .36, -4.8); root.add(bin);
    const mapFrame = new THREE.Mesh(new RoundedBoxGeometry(.08, 1.55, 1.05, 3, .035), steel); mapFrame.position.set(side * 7.15, 1.35, 8.8); root.add(mapFrame);
  }
  for (const x of [-5.8, 0, 5.8]) {
    const turnstile = new THREE.Mesh(new RoundedBoxGeometry(.42, .86, .72, 4, .08), steel); turnstile.position.set(x, 4.43, 18.4); root.add(turnstile);
    addCylinderBetween(root, new THREE.Vector3(x, 4.9, 18.4), new THREE.Vector3(x + .62, 4.9, 18.4), .025, brushedSteel, radial);
  }
  const npcPlacements: Array<[number, number, [string, string], number]> = [
    [-6.1, -9, ["#7a463f", "#986e59"], .3], [5.7, -17, ["#31566a", "#d0a27d"], -2.7], [6.2, 5.5, ["#6c6544", "#704c38"], -1.4],
    [-6.2, -22.5, ["#824d63", "#c68f6d"], .8], [5.9, -5.5, ["#4b6653", "#e0b894"], -2.1], [-6.15, 2.6, ["#705a83", "#815a43"], .15],
    [5.8, 10, ["#a36f3f", "#b87857"], 2.6], [-5.6, -16.5, ["#38566f", "#d0aa91"], -.4],
  ];
  npcPlacements.slice(0, detail.npcCount).forEach(([x, z, palette, facing], index) => addNpc(root, x, z, palette, facing, index + (isLex ? 3 : id === "WEST_FARMS" ? 6 : 0), quality));
  if (id === "WEST_FARMS") {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(48, 14), new THREE.MeshBasicMaterial({ color: "#9ab7bd" })); sky.position.set(0, 3, -31); root.add(sky);
    const artColors = ["#4d8e7e", "#d1a459", "#8c594b", "#65809f"];
    const artMaterials = artColors.map(color => new THREE.MeshPhysicalMaterial({ color, transparent: true, opacity: .68, roughness: .12, transmission: quality === "mobile" ? 0 : .28, thickness: .08 }));
    const animalMarkMaterial = new THREE.MeshStandardMaterial({ color: "#e6ddc3", roughness: .62 });
    for (let index = 0; index < 18; index++) {
      const pane = new THREE.Mesh(new RoundedBoxGeometry(.92 + (index % 3) * .16, 2.35, .045, 3, .035), artMaterials[index % artMaterials.length]); pane.position.set(-8 + index * .94, 2.42 + Math.sin(index * 1.7) * .14, -25); pane.rotation.z = Math.sin(index * 2.1) * .13; root.add(pane);
      const animalMark = new THREE.Mesh(new THREE.TorusGeometry(.19 + (index % 2) * .06, .035, 7, radial, Math.PI * 1.5), animalMarkMaterial); animalMark.position.set(pane.position.x, pane.position.y, -24.93); animalMark.rotation.z = index * .7; root.add(animalMark);
    }
    const elevatedSteel = new THREE.MeshStandardMaterial({ color: "#31433f", metalness: .72, roughness: .38 });
    for (const x of [-7.5, 7.5]) for (const z of [-27, -14, -1, 12]) {
      addCylinderBetween(root, new THREE.Vector3(x, -.1, z), new THREE.Vector3(x, 5.1, z), .13, elevatedSteel, radial);
      addCylinderBetween(root, new THREE.Vector3(x, .4, z), new THREE.Vector3(x, 4.7, z + 5.5), .075, elevatedSteel, radial);
      addCylinderBetween(root, new THREE.Vector3(x, 4.7, z), new THREE.Vector3(x, .4, z + 5.5), .075, elevatedSteel, radial);
    }
    for (const z of [-20, -5, 10]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.15, radial, radial), new THREE.MeshBasicMaterial({ color: "#fff0c6", toneMapped: false })); lamp.position.set(0, 4.52, z); root.add(lamp);
    }
  }
  const spawn = id === "WEST_FARMS" ? new THREE.Vector3(-5, 1.48, -10) : new THREE.Vector3(0, 5.48, 18.5);
  const waypoint = id === "WEST_FARMS" ? new THREE.Vector3(0, 4, 18) : new THREE.Vector3(-5, 0, 0);
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
    ];
    adTextures.forEach(texture => { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = this.quality === "ultra" ? 8 : 4; }); this.ownedTextures.push(...adTextures);
    for (const id of ["FIFTH_AV", "LEXINGTON", "WEST_FARMS"] as const) { const station = buildStation(id, textures, adTextures, this.ownedTextures, this.quality); station.root.visible = false; this.stations.set(id, station); this.root.add(station.root); }
    this.correctTrain = buildTrain(textures, "N", "QUEENS-BOUND", true, -1.1, this.quality); this.wrongTrain = buildTrain(textures, "W", "DOWNTOWN / BROOKLYN", false, 1.1, this.quality); this.root.add(this.correctTrain.root, this.wrongTrain.root);
    const ambient = new THREE.HemisphereLight("#e9eee5", "#394039", 1.08), fill = new THREE.AmbientLight("#c8d1c7", .48);
    this.root.add(ambient, fill);
    const fluorescent = new THREE.MeshBasicMaterial({ color: "#eaf5df", toneMapped: false });
    const lightPositions = Array.from({ length: detail.ceilingLights }, (_, index) => THREE.MathUtils.lerp(-25, 12, index / Math.max(1, detail.ceilingLights - 1)));
    for (const z of lightPositions) {
      const strip = new THREE.Mesh(new RoundedBoxGeometry(9.4, .07, .22, 2, .025), fluorescent); strip.position.set(0, 4.82, z); this.root.add(strip);
      for (const x of [-4.6, 4.6]) { const fixture = new THREE.PointLight("#e5f1d3", this.quality === "mobile" ? 31 : 38, 18, 1.25); fixture.position.set(x, 4.5, z); this.root.add(fixture); }
    }
    const concourseStrip = new THREE.Mesh(new RoundedBoxGeometry(9.4, .07, .22, 2, .025), fluorescent); concourseStrip.position.set(0, 7.15, 17); this.root.add(concourseStrip);
    for (const x of [-4.6, 4.6]) { const fixture = new THREE.PointLight("#e5f1d3", 34, 16, 1.25); fixture.position.set(x, 6.9, 17); this.root.add(fixture); }
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
    this.correctTrain.root.position.z = -42; this.wrongTrain.root.position.z = 42;
    this.root.updateMatrixWorld(true); return this;
  }

  private configureTrain(train: TrainRig, route: string, direction: string, correct: boolean, color: string) {
    if (train.route === route && train.direction === direction && train.correct === correct) return;
    train.badgeTexture.dispose(); train.badgeTexture = trainBadgeTexture(route, direction, color); train.badgeMaterial.map = train.badgeTexture; train.badgeMaterial.needsUpdate = true; train.route = route; train.direction = direction; train.correct = correct;
  }

  private setDoorAmount(train: TrainRig, amount: number) {
    const opening = THREE.MathUtils.clamp(amount, 0, 1) * .47;
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
    return absoluteX >= 2.85 && absoluteX <= 7.35;
  }

  floorHeight(x: number, z: number) {
    if (z >= 13.6) return 4;
    if (z > 4.3 && this.staircaseAt(x)) return THREE.MathUtils.clamp((z - 4.3) / 9.3 * 4, 0, 4);
    return 0;
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    player.x = THREE.MathUtils.clamp(player.x, -8.15, 8.15); player.z = THREE.MathUtils.clamp(player.z, -29, 21);
    if (player.z < 13.6 && player.z > 4.15 && !this.staircaseAt(player.x)) {
      const absoluteX = Math.abs(player.x), side = player.x <= 0 ? -1 : 1;
      if (absoluteX >= 2.15) { player.x = side * THREE.MathUtils.clamp(absoluteX, 2.85, 7.35); velocity.x = 0; }
      else { player.z = player.z >= 8.95 ? 13.6 : 4.15; velocity.z = 0; }
    }
    if (player.z <= 4.15 && Math.abs(player.x) < 2.25) { const side = player.x <= 0 ? -1 : 1; player.x = side * 2.25; velocity.x = 0; }
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
    let z = 42;
    if (cycle < 4) { this.trainPhase = "APPROACHING"; z = THREE.MathUtils.lerp(-42, 0, cycle / 4); this.secondsToTrain = Math.ceil(4 - cycle); }
    else if (cycle < 16) { this.trainPhase = "BOARDING"; z = 0; this.secondsToTrain = 0; }
    else if (cycle < 21) { this.trainPhase = "DEPARTING"; z = THREE.MathUtils.lerp(0, 46, (cycle - 16) / 5); this.secondsToTrain = Math.ceil(SUBWAY_TRAIN_INTERVAL_SECONDS + 4 - cycle); }
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
    train.root.position.z = (train.correct ? 1 : -1) * THREE.MathUtils.smoothstep(amount, .16, 1) * 42;
    train.root.position.y = -.08 + Math.sin(elapsed * 8 + (train.correct ? 0 : 1)) * .008;
    this.doorsOpen = amount < .18;
    this.trainPhase = amount < .18 ? "BOARDING" : "DEPARTING";
    train.root.updateMatrixWorld(true);
  }

  boardingOption(player: THREE.Vector3): BoardingOption | null {
    if (!this.doorsOpen || this.stationId === "WEST_FARMS") return null;
    const correctDoor = new THREE.Vector3(this.correctTrain.root.position.x + this.correctTrain.platformSide * 1.071, 1.48, this.correctTrain.root.position.z);
    const wrongDoor = new THREE.Vector3(this.wrongTrain.root.position.x + this.wrongTrain.platformSide * 1.071, 1.48, this.wrongTrain.root.position.z);
    const correctDistance = Math.hypot(player.x - correctDoor.x, player.z - correctDoor.z), wrongDistance = Math.hypot(player.x - wrongDoor.x, player.z - wrongDoor.z);
    const train = correctDistance <= wrongDistance ? this.correctTrain : this.wrongTrain, distance = Math.min(correctDistance, wrongDistance);
    return distance < 2.15 ? { correct: train.correct, direction: train.direction, route: train.route, station: this.stationId } : null;
  }

  dispose() {
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]; meshMaterials.forEach(material => materials.add(material)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    this.correctTrain.badgeTexture.dispose(); this.wrongTrain.badgeTexture.dispose(); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
