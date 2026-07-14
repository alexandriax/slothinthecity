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
  pose?: "neutral" | "checking-map" | "photographing" | "waving" | "seated";
  /** Optional overrides keep the rig reusable in streamed worlds. */
  faceAtlasUrl?: string;
  clothingAtlasUrl?: string;
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

const atlasSources = new Map<string, THREE.Texture>();

/**
 * The generated atlases are 2 x 2 sheets. Cloning shares the decoded image but
 * gives every streamed character an independently disposable tile transform.
 */
function atlasTile(url: string, tile: number, quality: number) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([188, 158, 135, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  let source = atlasSources.get(url);
  if (!source) {
    source = new THREE.TextureLoader().load(url);
    source.colorSpace = THREE.SRGBColorSpace;
    source.wrapS = source.wrapT = THREE.ClampToEdgeWrapping;
    atlasSources.set(url, source);
  }
  const texture = source.clone();
  const index = ((tile % 4) + 4) % 4;
  texture.repeat.set(.5, .5);
  texture.offset.set((index % 2) * .5, index < 2 ? .5 : 0);
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = quality > .86 ? 8 : quality > .62 ? 4 : 2;
  texture.needsUpdate = true;
  return texture;
}

function portraitTile(url: string, tile: number, quality: number) {
  if (typeof document === "undefined") return atlasTile(url, tile, quality);
  const size = quality > .86 ? 384 : quality > .62 ? 256 : 160;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = quality > .86 ? 8 : 4;
  if (!context) return texture;
  const image = new Image(); image.decoding = "async";
  image.onload = () => {
    const index = ((tile % 4) + 4) % 4, tileWidth = image.naturalWidth / 2, tileHeight = image.naturalHeight / 2;
    const sourceX = (index % 2) * tileWidth + tileWidth * .07, sourceY = (index < 2 ? 0 : tileHeight) + tileHeight * .015;
    context.clearRect(0, 0, size, size);
    context.drawImage(image, sourceX, sourceY, tileWidth * .86, tileHeight * .84, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size), sample = (x: number, y: number) => {
      const offset = (y * size + x) * 4; return [pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2]] as const;
    };
    const corners = [sample(2, 2), sample(size - 3, 2), sample(2, size - 3), sample(size - 3, size - 3)];
    const background = [0, 1, 2].map(channel => corners.reduce((sum, color) => sum + color[channel], 0) / corners.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const distance = Math.hypot(pixels.data[offset] - background[0], pixels.data[offset + 1] - background[1], pixels.data[offset + 2] - background[2]);
      const edgeX = Math.min(1, x / (size * .055), (size - 1 - x) / (size * .055));
      const edgeY = Math.min(1, y / (size * .035), (size - 1 - y) / (size * .035));
      pixels.data[offset + 3] = Math.round(255 * THREE.MathUtils.smoothstep(distance, 18, 42) * Math.max(0, Math.min(edgeX, edgeY)));
    }
    context.putImageData(pixels, 0, 0); texture.needsUpdate = true;
  };
  image.src = url;
  return texture;
}

function portraitGeometry(segments: number) {
  const geometry = new THREE.CircleGeometry(.245, segments);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), radial = Math.min(1, (x * x + y * y) / (.245 * .245));
    positions.setZ(index, -.305 + radial * .052);
  }
  positions.needsUpdate = true; geometry.computeVertexNormals(); return geometry;
}

function atlasMaterial(atlas: THREE.Texture, relief: THREE.Texture, roughness: number) {
  return new THREE.MeshPhysicalMaterial({
    map: atlas,
    bumpMap: relief,
    bumpScale: .012,
    roughness,
    clearcoat: .035,
    clearcoatRoughness: .86,
    sheen: .18,
  });
}

function profiledTorsoGeometry(segments: number, role: PremiumHumanRole) {
  const attendant = role === "attendant";
  const points = [
    new THREE.Vector2(.235, -.55),
    new THREE.Vector2(.315, -.47),
    new THREE.Vector2(.33, -.23),
    new THREE.Vector2(.315, .02),
    new THREE.Vector2(attendant ? .38 : .355, .31),
    new THREE.Vector2(attendant ? .405 : .385, .43),
    new THREE.Vector2(.235, .52),
  ];
  const geometry = new THREE.LatheGeometry(points, segments);
  geometry.scale(1, 1, .72);
  geometry.computeVertexNormals();
  return geometry;
}

function taperedLimbBetween(start: THREE.Vector3, end: THREE.Vector3, startRadius: number, endRadius: number, material: THREE.Material, segments: number) {
  const direction = end.clone().sub(start), length = direction.length();
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(endRadius, startRadius, length, segments, Math.max(3, Math.floor(segments / 8)), false), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function addNaturalHand(root: THREE.Group, wrist: THREE.Vector3, side: number, skin: THREE.Material, segments: number, gesture: "relaxed" | "open") {
  const palm = new THREE.Mesh(new THREE.CapsuleGeometry(.052, .092, Math.max(8, Math.floor(segments / 2)), segments), skin);
  palm.position.copy(wrist); palm.rotation.z = side * -.12; palm.rotation.x = -.08; palm.scale.set(.82, 1, .56); root.add(palm);
  const fingerSpread = gesture === "open" ? .017 : .011;
  for (let finger = 0; finger < 4; finger++) {
    const lateral = (finger - 1.5) * fingerSpread;
    const length = .075 - Math.abs(finger - 1.5) * .009;
    const digit = new THREE.Mesh(new THREE.CapsuleGeometry(.0095, length, 6, Math.max(10, Math.floor(segments * .55))), skin);
    digit.position.set(wrist.x + lateral, wrist.y - .083, wrist.z - .025 - Math.abs(finger - 1.5) * .002);
    digit.rotation.x = .22; digit.rotation.z = gesture === "open" ? lateral * -2.4 : side * .025; root.add(digit);
  }
  const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(.014, .058, 6, Math.max(10, Math.floor(segments * .55))), skin);
  thumb.position.set(wrist.x - side * .059, wrist.y - .015, wrist.z - .02); thumb.rotation.z = side * .78; thumb.rotation.x = -.22; root.add(thumb);
}

function castCharacterShadows(root: THREE.Group, high: boolean) {
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = high; object.receiveShadow = false; } });
}

export function createPremiumHuman(options: PremiumHumanOptions): PremiumCharacterResult {
  const quality = THREE.MathUtils.clamp(options.quality, .42, 1.2), high = quality > .7;
  const segments = quality > .92 ? 40 : quality > .68 ? 28 : 18;
  const hairColor = options.hair ?? (options.variant % 3 === 0 ? "#241b17" : options.variant % 3 === 1 ? "#4a3223" : "#17191a");
  const coatMap = proceduralSurface("cloth", options.coat, "#d8d2bc", 17 + options.variant, quality);
  const trouserMap = proceduralSurface("cloth", options.trousers, "#7f8d8b", 31 + options.variant, quality);
  const skinMap = proceduralSurface("skin", options.skin, "#6f4536", 47 + options.variant, quality);
  const hairMap = proceduralSurface("hair", hairColor, "#8d765c", 61 + options.variant, quality);
  const leatherMap = proceduralSurface("leather", options.role === "attendant" ? "#151b18" : "#5a3c2b", "#b18c63", 79 + options.variant, quality);
  const metalMap = proceduralSurface("metal", "#a8aaa2", "#f5f1dc", 97 + options.variant, quality);
  const trimMap = proceduralSurface("cloth", options.role === "attendant" ? "#e7e0cf" : "#b7a582", "#ffffff", 103 + options.variant, quality);
  const faceAtlas = portraitTile(options.faceAtlasUrl ?? "/game/characters/npc-face-atlas-v1.webp", options.variant, quality);
  const clothingAtlas = atlasTile(options.clothingAtlasUrl ?? "/game/characters/npc-cloth-atlas-v1.webp", options.variant + (options.role === "attendant" ? 1 : 0), quality);
  const ownedTextures = [coatMap, trouserMap, skinMap, hairMap, leatherMap, metalMap, trimMap, faceAtlas, clothingAtlas];
  const coat = atlasMaterial(clothingAtlas, coatMap, .8), trousers = texturedMaterial(trouserMap, .83), skin = texturedMaterial(skinMap, .76);
  const faceSkin = new THREE.MeshPhysicalMaterial({ map: faceAtlas, transparent: true, alphaTest: .08, roughness: .72, clearcoat: .025, side: THREE.DoubleSide });
  const hair = texturedMaterial(hairMap, .91), leather = texturedMaterial(leatherMap, .72), metal = texturedMaterial(metalMap, .32, { metalness: .76, clearcoat: .22 }), trim = texturedMaterial(trimMap, .72);
  const root = new THREE.Group(); root.name = options.role === "attendant" ? "central-park-zoo-attendant" : "central-park-zoo-visitor";
  root.userData.role = options.role === "attendant" ? "zoo-attendant" : "zoo-visitor";
  root.userData.characterFidelity = high ? "premium-high" : "premium-mobile";
  root.userData.faceAtlas = options.faceAtlasUrl ?? "/game/characters/npc-face-atlas-v1.webp";
  root.userData.clothingAtlas = options.clothingAtlasUrl ?? "/game/characters/npc-cloth-atlas-v1.webp";
  if (options.role === "attendant") root.userData.dialogue = "There are no sloths here.";

  // A profiled, slightly asymmetrical torso replaces the stacked-box outline.
  const hips = new THREE.Mesh(CapsuleGeometrySafe(.29, .24, segments), trousers); hips.position.y = 1.02; hips.scale.set(1.06, .68, .78); root.add(hips);
  const torso = new THREE.Mesh(profiledTorsoGeometry(segments, options.role), coat); torso.position.y = 1.5; torso.rotation.y = (options.variant % 3 - 1) * .018; root.add(torso);
  const jacketHem = new THREE.Mesh(new THREE.TorusGeometry(.295, .025, Math.max(8, segments / 3), segments), coat); jacketHem.rotation.x = Math.PI / 2; jacketHem.scale.z = .74; jacketHem.position.y = .99; root.add(jacketHem);
  for (const side of [-1, 1]) {
    const deltoid = new THREE.Mesh(new THREE.SphereGeometry(.145, segments, Math.max(12, Math.floor(segments * .65))), coat);
    deltoid.scale.set(1.18, .94, .85); deltoid.position.set(side * .38, 1.78, 0); root.add(deltoid);
  }
  if (options.role === "attendant") {
    const shirt = new THREE.Mesh(new RoundedBoxGeometry(.32, .5, .045, high ? 8 : 4, .025), trim); shirt.position.set(0, 1.52, -.286); root.add(shirt);
    for (const side of [-1, 1]) { const lapel = new THREE.Mesh(new THREE.ConeGeometry(.14, .4, 8), coat); lapel.position.set(side * .115, 1.67, -.32); lapel.rotation.set(Math.PI / 2, 0, side * -.17); root.add(lapel); }
    const tie = new THREE.Mesh(new THREE.ConeGeometry(.044, .24, 8), leather); tie.position.set(0, 1.54, -.335); tie.rotation.x = Math.PI; root.add(tie);
  } else {
    const zip = new THREE.Mesh(new RoundedBoxGeometry(.02, .72, .018, 3, .006), metal); zip.position.set(0, 1.47, -.307); root.add(zip);
    for (const side of [-1, 1]) { const seam = new THREE.Mesh(new THREE.TorusGeometry(.24, .014, 7, segments, Math.PI * .62), trim); seam.position.set(side * .045, 1.76, -.015); seam.rotation.set(Math.PI / 2, 0, side * .2); root.add(seam); }
  }

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.105, .125, .235, segments), skin); neck.position.y = 1.99; root.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.27, segments, Math.max(16, Math.floor(segments * .76))), skin); head.scale.set(.9, 1.08, .92); head.position.y = 2.23; root.add(head);
  const portrait = new THREE.Mesh(portraitGeometry(segments), faceSkin); portrait.name = "photoreal-generated-face-albedo"; portrait.scale.set(.9, 1.12, 1); portrait.position.set(0, 2.235, 0); root.add(portrait);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(.205, segments, Math.max(14, Math.floor(segments * .68))), skin); jaw.scale.set(.85, .74, .66); jaw.position.set(0, 2.1, -.14); root.add(jaw);
  for (const side of [-1, 1]) { const cheek = new THREE.Mesh(new THREE.SphereGeometry(.086, segments, 13), skin); cheek.scale.set(1.05, .72, .35); cheek.position.set(side * .11, 2.15, -.238); root.add(cheek); }
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.278, segments, Math.max(14, Math.floor(segments * .7)), 0, Math.PI * 2, 0, Math.PI * .57), hair); hairCap.position.y = 2.28; hairCap.rotation.y = options.variant * .3; root.add(hairCap);
  if (options.variant % 3 === 1) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(.125, segments, 14), hair); bun.scale.set(.9, 1.07, .92); bun.position.set(0, 2.39, .205); root.add(bun);
  } else if (options.variant % 3 === 2) {
    for (const side of [-1, 1]) { const sideHair = new THREE.Mesh(new THREE.CapsuleGeometry(.065, .17, 8, segments), hair); sideHair.position.set(side * .21, 2.13, .02); sideHair.rotation.z = side * .08; root.add(sideHair); }
  }
  const eyeTexture = proceduralSurface("ivory", "#493324", "#cab98f", 131 + options.variant, quality); ownedTextures.push(eyeTexture);
  const iris = new THREE.MeshPhysicalMaterial({ map: eyeTexture, color: "#ffffff", roughness: .12, clearcoat: 1 });
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.071, segments, 14), skin); ear.scale.set(.52, .96, .68); ear.position.set(side * .252, 2.22, -.002); root.add(ear);
    const earFold = new THREE.Mesh(new THREE.TorusGeometry(.027, .007, 7, 18, Math.PI * 1.45), skin); earFold.position.set(side * .257, 2.22, -.035); earFold.rotation.y = side * Math.PI / 2; root.add(earFold);
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(.039, segments, 14), trim); eyeWhite.scale.set(1, .58, .3); eyeWhite.position.set(side * .086, 2.24, -.247); root.add(eyeWhite);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.018, Math.max(14, segments / 2), 12), iris); eye.position.set(side * .086, 2.24, -.273); root.add(eye);
    const upperLid = new THREE.Mesh(new THREE.TorusGeometry(.038, .006, 6, 20, Math.PI), skin); upperLid.position.set(side * .086, 2.248, -.274); upperLid.rotation.z = Math.PI; root.add(upperLid);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(.008, .07, 6, 12), hair); brow.position.set(side * .086, 2.302, -.248); brow.rotation.z = side * (-.08 + options.variant * .012); root.add(brow);
  }
  const noseBridge = new THREE.Mesh(new THREE.CapsuleGeometry(.021, .085, 7, segments), skin); noseBridge.position.set(0, 2.19, -.266); noseBridge.rotation.x = .08; root.add(noseBridge);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.041, segments, 14), skin); nose.scale.set(.88, .74, .82); nose.position.set(0, 2.145, -.294); root.add(nose);
  for (const side of [-1, 1]) { const nostril = new THREE.Mesh(new THREE.SphereGeometry(.0065, 10, 8), hair); nostril.position.set(side * .017, 2.139, -.326); root.add(nostril); }
  const lipsMap = proceduralSurface("skin", "#74483f", "#ab7466", 149 + options.variant, quality); ownedTextures.push(lipsMap);
  const lips = new THREE.Mesh(new THREE.TorusGeometry(.052, .007, 7, 26, Math.PI * .82), texturedMaterial(lipsMap, .68)); lips.position.set(0, 2.074, -.289); lips.rotation.z = .13; root.add(lips);

  const pose = options.pose ?? "neutral";
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * .37, 1.64, 0);
    const elbow = new THREE.Vector3(
      side * (pose === "waving" && side > 0 ? .56 : pose === "seated" ? .34 : .43),
      pose === "waving" && side > 0 ? 1.9 : pose === "seated" ? 1.31 : 1.3,
      pose === "checking-map" ? -.22 : pose === "seated" ? -.17 : -.03,
    );
    const wrist = new THREE.Vector3(
      side * (pose === "waving" && side > 0 ? .48 : pose === "photographing" ? .2 : pose === "seated" ? .27 : .45),
      pose === "waving" && side > 0 ? 2.25 : pose === "photographing" ? 1.58 : pose === "seated" ? 1.08 : 1.02,
      pose === "checking-map" || pose === "photographing" ? -.42 : pose === "seated" ? -.34 : -.09,
    );
    const upperArm = taperedLimbBetween(shoulder, elbow, .105, .085, coat, segments), forearm = taperedLimbBetween(elbow, wrist, .082, .06, coat, segments);
    root.add(upperArm, forearm);
    const elbowBlend = new THREE.Mesh(new THREE.SphereGeometry(.087, segments, 14), coat); elbowBlend.scale.set(1.03, 1.1, .92); elbowBlend.position.copy(elbow); root.add(elbowBlend);
    if (options.role === "attendant") { const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.068, .073, .095, segments), trim); cuff.position.copy(elbow).lerp(wrist, .78); cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wrist.clone().sub(elbow).normalize()); root.add(cuff); }
    addNaturalHand(root, wrist, side, skin, segments, pose === "waving" || pose === "photographing" ? "open" : "relaxed");
    const hip = new THREE.Vector3(side * .15, .89, 0);
    const knee = pose === "seated"
      ? new THREE.Vector3(side * .17, .67, -.34)
      : new THREE.Vector3(side * (.15 + (options.variant % 2 ? .018 : 0)), .48, side * .012);
    const ankle = pose === "seated" ? new THREE.Vector3(side * .16, .22, -.52) : new THREE.Vector3(side * .15, .16, -.015);
    root.add(taperedLimbBetween(hip, knee, .13, .105, trousers, segments), taperedLimbBetween(knee, ankle, .105, .075, trousers, segments));
    const kneeBlend = new THREE.Mesh(new THREE.SphereGeometry(.105, segments, 14), trousers); kneeBlend.scale.set(.94, 1.07, .9); kneeBlend.position.copy(knee); root.add(kneeBlend);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(.235, .14, .43, high ? 5 : 3, .05), leather); shoe.position.set(side * .15, pose === "seated" ? .11 : .09, pose === "seated" ? -.67 : -.11); root.add(shoe);
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
  root.traverse(object => { if (object instanceof THREE.Mesh) object.name ||= `premium-human-${options.role}-anatomy`; });
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
