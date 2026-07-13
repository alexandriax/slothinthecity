import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

type SurfaceKind = "cloth" | "skin" | "hair" | "leather" | "metal" | "ivory" | "fur";

export type PremiumHumanRole = "attendant" | "visitor";

export type PremiumHumanOptions = {
  role: PremiumHumanRole;
  quality: number;
  variant: number;
  coat: string;
  trousers: string;
  skin: string;
  hair?: string;
  accessory?: "backpack" | "camera" | "tote" | "radio" | "none";
  pose?: "neutral" | "checking-map" | "photographing" | "waving";
};

export type PremiumCharacterResult = {
  root: THREE.Group;
  ownedTextures: THREE.Texture[];
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value ^ (value >>> 15), 1 | value), value ^= value + Math.imul(value ^ (value >>> 7), 61 | value), ((value ^ (value >>> 14)) >>> 0) / 4294967296));
}

function rgb(hex: string) {
  const raw = hex.replace("#", ""), expanded = raw.length === 3 ? raw.split("").map(character => character + character).join("") : raw;
  const value = Number.parseInt(expanded, 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255] as const;
}

function proceduralSurface(kind: SurfaceKind, base: string, accent: string, seed: number, quality: number) {
  const [red, green, blue] = rgb(base);
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([red, green, blue, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const size = quality > .82 ? 256 : quality > .58 ? 160 : 96;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Premium characters require a 2D canvas context");
  const random = seeded(seed * 7919 + kind.length * 104729), accentRgb = rgb(accent);
  context.fillStyle = base; context.fillRect(0, 0, size, size);
  const image = context.getImageData(0, 0, size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    const grain = (random() - .5) * (kind === "metal" ? 17 : kind === "skin" ? 10 : 24);
    const weave = kind === "cloth" ? (Math.sin(x * .68) + Math.sin(y * .72)) * 5
      : kind === "hair" || kind === "fur" ? Math.sin((x + y * .19) * .27) * 10
        : kind === "ivory" ? Math.sin(x * .11 + Math.sin(y * .04)) * 6
          : kind === "metal" ? Math.sin(y * .44) * 8 : 0;
    image.data[offset] = THREE.MathUtils.clamp(red + grain + weave, 0, 255);
    image.data[offset + 1] = THREE.MathUtils.clamp(green + grain * .72 + weave * .8, 0, 255);
    image.data[offset + 2] = THREE.MathUtils.clamp(blue + grain * .48 + weave * .62, 0, 255);
  }
  context.putImageData(image, 0, 0);
  context.globalAlpha = kind === "skin" ? .13 : kind === "metal" ? .17 : .24;
  context.strokeStyle = accent;
  if (kind === "cloth") {
    context.lineWidth = 1;
    for (let line = 0; line < size; line += 6) {
      context.beginPath(); context.moveTo(0, line + .5); context.lineTo(size, line + .5); context.stroke();
      context.beginPath(); context.moveTo(line + .5, 0); context.lineTo(line + .5, size); context.stroke();
    }
  } else if (kind === "hair" || kind === "fur") {
    context.lineWidth = quality > .7 ? 1.2 : 1;
    for (let strand = 0; strand < Math.round(size * 1.3); strand++) {
      const x = random() * size, y = random() * size, length = size * (.045 + random() * .11);
      context.beginPath(); context.moveTo(x, y); context.bezierCurveTo(x + length * .35, y - length * .1, x + length * .68, y + length * .15, x + length, y + length * .05); context.stroke();
    }
  } else if (kind === "skin") {
    context.fillStyle = `rgb(${accentRgb[0]} ${accentRgb[1]} ${accentRgb[2]})`;
    for (let pore = 0; pore < size * .8; pore++) { const radius = .25 + random() * .55; context.beginPath(); context.arc(random() * size, random() * size, radius, 0, Math.PI * 2); context.fill(); }
  } else if (kind === "leather") {
    context.lineWidth = 1;
    for (let crease = 0; crease < 28; crease++) { const x = random() * size, y = random() * size; context.beginPath(); context.moveTo(x, y); context.quadraticCurveTo(x + random() * 30 - 15, y + random() * 18 - 9, x + random() * 42 - 21, y + random() * 30 - 15); context.stroke(); }
  } else if (kind === "metal") {
    context.lineWidth = .7;
    for (let line = 0; line < size; line += 3) { context.beginPath(); context.moveTo(0, line); context.lineTo(size, line + random() * 2); context.stroke(); }
  } else if (kind === "ivory") {
    context.lineWidth = 1;
    for (let line = -size; line < size * 2; line += 18) { context.beginPath(); context.moveTo(line, 0); context.lineTo(line + size * .35, size); context.stroke(); }
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(kind === "skin" ? 1.2 : 2.5, kind === "hair" || kind === "fur" ? 4 : 2.5); texture.anisotropy = quality > .82 ? 8 : quality > .58 ? 4 : 2;
  return texture;
}

function texturedMaterial(texture: THREE.Texture, roughness: number, options: { metalness?: number; clearcoat?: number } = {}) {
  return new THREE.MeshPhysicalMaterial({ map: texture, bumpMap: texture, bumpScale: .018, color: "#ffffff", roughness, metalness: options.metalness ?? 0, clearcoat: options.clearcoat ?? 0 });
}

function castCharacterShadows(root: THREE.Group, high: boolean) {
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = high; object.receiveShadow = false; } });
}

function capsuleBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, segments: number) {
  const length = start.distanceTo(end), mesh = new THREE.Mesh(new THREE.CapsuleGeometry(radius, Math.max(.01, length - radius * 2), Math.max(6, Math.floor(segments * .5)), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize()); return mesh;
}

export function createPremiumHuman(options: PremiumHumanOptions): PremiumCharacterResult {
  const quality = THREE.MathUtils.clamp(options.quality, .42, 1.2), high = quality > .7, segments = quality > .9 ? 28 : high ? 20 : 14;
  const hairColor = options.hair ?? (options.variant % 3 === 0 ? "#241b17" : options.variant % 3 === 1 ? "#4a3223" : "#17191a");
  const coatMap = proceduralSurface("cloth", options.coat, "#d8d2bc", 17 + options.variant, quality);
  const trouserMap = proceduralSurface("cloth", options.trousers, "#7f8d8b", 31 + options.variant, quality);
  const skinMap = proceduralSurface("skin", options.skin, "#6f4536", 47 + options.variant, quality);
  const hairMap = proceduralSurface("hair", hairColor, "#8d765c", 61 + options.variant, quality);
  const leatherMap = proceduralSurface("leather", options.role === "attendant" ? "#151b18" : "#5a3c2b", "#b18c63", 79 + options.variant, quality);
  const metalMap = proceduralSurface("metal", "#a8aaa2", "#f5f1dc", 97 + options.variant, quality);
  const trimMap = proceduralSurface("cloth", options.role === "attendant" ? "#e7e0cf" : "#b7a582", "#ffffff", 103 + options.variant, quality);
  const ownedTextures = [coatMap, trouserMap, skinMap, hairMap, leatherMap, metalMap, trimMap];
  const coat = texturedMaterial(coatMap, .78), trousers = texturedMaterial(trouserMap, .83), skin = texturedMaterial(skinMap, .76);
  const hair = texturedMaterial(hairMap, .91), leather = texturedMaterial(leatherMap, .72), metal = texturedMaterial(metalMap, .32, { metalness: .76, clearcoat: .22 }), trim = texturedMaterial(trimMap, .72);
  const root = new THREE.Group(); root.name = options.role === "attendant" ? "central-park-zoo-attendant" : "central-park-zoo-visitor";
  root.userData.role = options.role === "attendant" ? "zoo-attendant" : "zoo-visitor";
  if (options.role === "attendant") root.userData.dialogue = "There are no sloths here.";

  const hips = new THREE.Mesh(CapsuleGeometrySafe(.285, .28, segments), coat); hips.position.y = 1.02; hips.scale.set(1, .72, .78); root.add(hips);
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.32, .67, Math.max(8, segments / 2), segments), coat); torso.position.y = 1.48; torso.scale.set(1.04, 1, .78); root.add(torso);
  const shoulderLine = new THREE.Mesh(new RoundedBoxGeometry(.77, .16, .42, high ? 6 : 3, .07), coat); shoulderLine.position.set(0, 1.73, 0); root.add(shoulderLine);
  if (options.role === "attendant") {
    const shirt = new THREE.Mesh(new RoundedBoxGeometry(.33, .51, .055, high ? 5 : 3, .02), trim); shirt.position.set(0, 1.55, -.287); root.add(shirt);
    for (const side of [-1, 1]) { const lapel = new THREE.Mesh(new THREE.ConeGeometry(.155, .41, 4), coat); lapel.position.set(side * .13, 1.68, -.33); lapel.rotation.set(Math.PI / 2, 0, side * -.17); root.add(lapel); }
    const tie = new THREE.Mesh(new THREE.ConeGeometry(.05, .25, 5), leather); tie.position.set(0, 1.55, -.335); tie.rotation.x = Math.PI; root.add(tie);
  } else {
    const zip = new THREE.Mesh(new RoundedBoxGeometry(.026, .63, .014, 2, .006), metal); zip.position.set(0, 1.48, -.326); root.add(zip);
    const collar = new THREE.Mesh(new THREE.TorusGeometry(.25, .055, 8, segments, Math.PI), trim); collar.position.set(0, 1.78, -.035); collar.rotation.x = Math.PI / 2; root.add(collar);
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.11, .125, .22, segments), skin); neck.position.y = 1.97; root.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.265, segments, Math.max(12, segments - 5)), skin); head.scale.set(.91, 1.07, .94); head.position.y = 2.2; root.add(head);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(.198, segments, Math.max(12, segments - 7)), skin); jaw.scale.set(.86, .72, .68); jaw.position.set(0, 2.08, -.135); root.add(jaw);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.271, segments, Math.max(10, segments - 8), 0, Math.PI * 2, 0, Math.PI * .54), hair); hairCap.position.y = 2.245; hairCap.rotation.y = options.variant * .3; root.add(hairCap);
  if (options.variant % 3 === 1) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(.13, segments, 12), hair); bun.position.set(0, 2.35, .21); root.add(bun);
  }
  const eyeTexture = proceduralSurface("ivory", "#493324", "#cab98f", 131 + options.variant, quality); ownedTextures.push(eyeTexture);
  const iris = new THREE.MeshPhysicalMaterial({ map: eyeTexture, color: "#ffffff", roughness: .12, clearcoat: 1 });
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.072, segments, 12), skin); ear.scale.x = .55; ear.position.set(side * .25, 2.2, -.005); root.add(ear);
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(.049, segments, 12), trim); eyeWhite.scale.set(.86, .63, .34); eyeWhite.position.set(side * .085, 2.23, -.242); root.add(eyeWhite);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.024, 16, 12), iris); eye.position.set(side * .085, 2.23, -.274); root.add(eye);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(.012, .075, 5, 9), hair); brow.position.set(side * .085, 2.3, -.247); brow.rotation.z = side * (-.09 + options.variant * .015); root.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.042, segments, 12), skin); nose.scale.set(.8, 1.08, .75); nose.position.set(0, 2.15, -.29); root.add(nose);
  const lipsMap = proceduralSurface("skin", "#74483f", "#ab7466", 149 + options.variant, quality); ownedTextures.push(lipsMap);
  const lips = new THREE.Mesh(new THREE.TorusGeometry(.057, .009, 7, 20, Math.PI * .8), texturedMaterial(lipsMap, .68)); lips.position.set(0, 2.075, -.291); lips.rotation.z = .11; root.add(lips);

  const pose = options.pose ?? "neutral";
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * .37, 1.64, 0);
    const elbow = new THREE.Vector3(side * (pose === "waving" && side > 0 ? .56 : .43), pose === "waving" && side > 0 ? 1.9 : 1.3, pose === "checking-map" ? -.22 : -.03);
    const wrist = new THREE.Vector3(side * (pose === "waving" && side > 0 ? .48 : pose === "photographing" ? .2 : .45), pose === "waving" && side > 0 ? 2.25 : pose === "photographing" ? 1.58 : 1.02, pose === "checking-map" || pose === "photographing" ? -.42 : -.09);
    root.add(capsuleBetween(shoulder, elbow, .09, coat, segments), capsuleBetween(elbow, wrist, .075, coat, segments));
    if (options.role === "attendant") { const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.084, .084, .09, segments), trim); cuff.position.copy(elbow).lerp(wrist, .72); cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wrist.clone().sub(elbow).normalize()); root.add(cuff); }
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.09, segments, 12), skin); hand.scale.set(.78, 1.08, .58); hand.position.copy(wrist); root.add(hand);
    if (high) for (let finger = 0; finger < 4; finger++) {
      const digit = new THREE.Mesh(new THREE.CapsuleGeometry(.014, .065, 4, 8), skin); digit.position.set(wrist.x + side * (finger - 1.5) * .018, wrist.y - .07, wrist.z - .025); digit.rotation.x = .18; root.add(digit);
    }
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.108, .67, Math.max(7, segments / 2), segments), trousers); leg.position.set(side * .15, .56, options.variant % 2 ? side * .015 : 0); leg.rotation.z = side * (options.variant % 2 ? .025 : -.01); root.add(leg);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(.235, .14, .43, high ? 5 : 3, .05), leather); shoe.position.set(side * .15, .09, -.11); root.add(shoe);
  }

  const belt = new THREE.Mesh(new THREE.TorusGeometry(.295, .036, 9, segments), leather); belt.rotation.x = Math.PI / 2; belt.position.y = 1.08; root.add(belt);
  const buckle = new THREE.Mesh(new RoundedBoxGeometry(.12, .085, .035, 3, .012), metal); buckle.position.set(0, 1.08, -.3); root.add(buckle);
  if (options.role === "attendant") {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.25, .29, .16, segments), coat); cap.position.y = 2.44; root.add(cap);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(.258, segments, 12, 0, Math.PI * 2, 0, Math.PI * .48), coat); crown.position.y = 2.44; root.add(crown);
    const brim = new THREE.Mesh(new RoundedBoxGeometry(.4, .045, .22, 5, .025), coat); brim.position.set(0, 2.415, -.2); root.add(brim);
    const badge = new THREE.Mesh(new THREE.CircleGeometry(.073, 22), metal); badge.position.set(.15, 1.69, -.343); root.add(badge);
    const nameTag = new THREE.Mesh(new RoundedBoxGeometry(.2, .072, .028, 3, .01), trim); nameTag.position.set(-.13, 1.68, -.343); root.add(nameTag);
    const radio = new THREE.Mesh(new RoundedBoxGeometry(.135, .23, .075, 4, .02), leather); radio.position.set(.31, 1.48, -.29); root.add(radio);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .2, 8), leather); antenna.position.set(.35, 1.68, -.29); antenna.rotation.z = -.16; root.add(antenna);
  } else if ((options.accessory ?? "backpack") === "backpack") {
    const backpack = new THREE.Mesh(new RoundedBoxGeometry(.46, .68, .2, high ? 6 : 4, .07), leather); backpack.position.set(0, 1.42, .31); root.add(backpack);
    for (const side of [-1, 1]) { const strap = new THREE.Mesh(new THREE.TorusGeometry(.19, .025, 6, 18, Math.PI), leather); strap.position.set(side * .19, 1.48, -.17); strap.rotation.set(Math.PI / 2, 0, side * .18); root.add(strap); }
  } else if (options.accessory === "camera") {
    const camera = new THREE.Mesh(new RoundedBoxGeometry(.28, .2, .14, 4, .035), leather); camera.position.set(0, 1.55, -.5); root.add(camera);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(.075, .085, .1, segments), metal); lens.position.set(0, 1.55, -.59); lens.rotation.x = Math.PI / 2; root.add(lens);
  } else if (options.accessory === "tote") {
    const tote = new THREE.Mesh(new RoundedBoxGeometry(.4, .52, .08, 4, .03), trim); tote.position.set(.42, .88, .02); tote.rotation.z = -.08; root.add(tote);
  }
  castCharacterShadows(root, high); root.scale.setScalar(options.role === "attendant" ? 1.04 : .98 + options.variant % 3 * .025);
  return { root, ownedTextures };
}

// CapsuleGeometry requires a strictly positive body length. This wrapper keeps
// the pelvis rounded without relying on a sphere that reads as a toy primitive.
function CapsuleGeometrySafe(radius: number, length: number, segments: number) {
  return new THREE.CapsuleGeometry(radius, length, Math.max(6, Math.floor(segments / 2)), segments);
}

export function createPremiumSlothFriend(textures: GameTextures, quality: number, variant: number, tint: string): PremiumCharacterResult {
  const clamped = THREE.MathUtils.clamp(quality, .42, 1.2), high = clamped > .7, segments = clamped > .9 ? 30 : high ? 22 : 15;
  const creamMap = proceduralSurface("fur", "#c7b99a", "#eee1bd", 211 + variant, clamped);
  const darkMap = proceduralSurface("fur", "#29231d", "#715b46", 229 + variant, clamped);
  const clawMap = proceduralSurface("ivory", "#e4d2a6", "#fff1c7", 241 + variant, clamped);
  const leatherMap = proceduralSurface("leather", "#304c36", "#9eb67d", 251 + variant, clamped);
  const ownedTextures = [creamMap, darkMap, clawMap, leatherMap];
  const fur = new THREE.MeshStandardMaterial({ map: textures.fur, bumpMap: textures.fur, bumpScale: .09, color: tint, roughness: .94 });
  const creamFur = texturedMaterial(creamMap, .94), darkFur = texturedMaterial(darkMap, .9), ivory = texturedMaterial(clawMap, .54, { clearcoat: .16 }), leather = texturedMaterial(leatherMap, .78);
  const eye = new THREE.MeshPhysicalMaterial({ map: darkMap, color: "#ffffff", roughness: .12, clearcoat: 1 });
  const root = new THREE.Group(); root.name = "waiting-sloth-friend"; root.userData.pose = variant;
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.59, 1.28, Math.max(9, segments / 2), segments), fur); body.position.set(0, 1.47, .05); body.rotation.z = -.045 + variant * .018; body.scale.z = .82; root.add(body);
  const belly = new THREE.Mesh(new THREE.SphereGeometry(.5, segments, segments - 5), creamFur); belly.scale.set(.78, 1.15, .46); belly.position.set(0, 1.48, -.49); root.add(belly);
  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(.66, segments, segments - 5), fur); shoulders.scale.set(1.02, .58, .72); shoulders.position.set(0, 2.02, -.01); root.add(shoulders);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.55, segments, segments - 5), fur); head.scale.set(1, .91, .92); head.position.set(0, 2.62, -.1); root.add(head);
  const face = new THREE.Mesh(new THREE.SphereGeometry(.425, segments, segments - 7, 0, Math.PI * 2, .14, Math.PI * .73), creamFur); face.scale.set(1.07, .88, .31); face.position.set(0, 2.57, -.58); face.rotation.x = -.06; root.add(face);
  for (const side of [-1, 1]) {
    const patch = new THREE.Mesh(new THREE.SphereGeometry(.148, segments, 14), darkFur); patch.scale.set(1.52, .73, .35); patch.position.set(side * .205, 2.64, -.72); patch.rotation.z = side * .34; root.add(patch);
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(.048, 18, 14), eye); eyeball.position.set(side * .205, 2.65, -.775); root.add(eyeball);
    const gleam = new THREE.Mesh(new THREE.SphereGeometry(.011, 10, 8), new THREE.MeshBasicMaterial({ map: creamMap, color: "#fffbe8", toneMapped: false })); gleam.position.set(side * .19, 2.668, -.816); root.add(gleam);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.11, segments, 12), fur); ear.scale.set(.55, 1, .72); ear.position.set(side * .51, 2.64, -.08); root.add(ear);
    const waving = side === (variant % 2 ? -1 : 1), arm = new THREE.Group(); arm.name = waving ? "friend-wave-arm" : "friend-rest-arm"; arm.position.set(side * .54, 1.93, 0);
    arm.rotation.z = side * (waving ? -.9 : -.3); arm.rotation.x = waving ? -.18 : .08;
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(.185, .76, Math.max(8, segments / 2), segments), fur); upper.position.y = .18; upper.scale.z = .86; arm.add(upper);
    const wrist = new THREE.Mesh(new THREE.CapsuleGeometry(.17, .38, Math.max(7, segments / 2), segments), fur); wrist.position.y = -.42; wrist.rotation.z = side * .08; arm.add(wrist);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(.205, segments, 15), darkFur); palm.scale.set(.9, 1.1, .68); palm.position.y = -.72; arm.add(palm);
    for (let claw = -1; claw <= 1; claw++) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(claw * .09, -.79, -.08), new THREE.Vector3(claw * .105, -.98, -.18), new THREE.Vector3(claw * .1, -1.12, -.33)]), tube = new THREE.Mesh(new THREE.TubeGeometry(curve, high ? 14 : 8, .034, high ? 10 : 7, false), ivory); arm.add(tube);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(.034, .16, high ? 10 : 7), ivory); tip.position.set(claw * .1, -1.17, -.37); tip.rotation.x = -.62; arm.add(tip);
    }
    root.add(arm);
    const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(.21, .47, 8, segments), fur); thigh.position.set(side * .31, .43, -.02); thigh.rotation.z = side * -.12; root.add(thigh);
  }
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.16, segments, 14), creamFur); muzzle.scale.set(1.05, .58, .44); muzzle.position.set(0, 2.45, -.75); root.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.098, segments, 14), darkFur); nose.scale.set(1.25, .7, .72); nose.position.set(0, 2.48, -.82); root.add(nose);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(.1, .014, 7, 24, Math.PI * .74), darkFur); smile.position.set(0, 2.36, -.8); smile.rotation.z = .42; root.add(smile);
  if (variant === 1) { const satchel = new THREE.Mesh(new RoundedBoxGeometry(.42, .5, .15, 5, .05), leather); satchel.position.set(.5, 1.38, .05); satchel.rotation.z = -.13; root.add(satchel); }
  castCharacterShadows(root, high); root.scale.setScalar(.96 + variant * .012); return { root, ownedTextures };
}
