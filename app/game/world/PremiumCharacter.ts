import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";
import { hydrateAuthoredHuman, markAuthoredHumanDisposed, markAuthoredHumansDisposed } from "./characters/AuthoredHumanAssets";

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
  faceVariant?: number;
  clothingVariant?: number;
  /** Optional overrides keep the rig reusable in streamed worlds. */
  faceAtlasUrl?: string;
  clothingAtlasUrl?: string;
};

export type PremiumCharacterResult = {
  root: THREE.Group;
  ownedTextures: THREE.Texture[];
};

export const PREMIUM_CHARACTER_ASSETS = {
  columns: 2,
  rows: 2,
  tilesPerAtlas: 4,
  identityCount: 20,
  faceAtlases: [
    "/game/characters/npc-face-atlas-v2-01.webp",
    "/game/characters/npc-face-atlas-v2-02.webp",
    "/game/characters/npc-face-atlas-v2-03.webp",
    "/game/characters/npc-face-atlas-v3-01.webp",
    "/game/characters/npc-face-atlas-v3-02.webp",
  ],
  clothingAtlases: [
    "/game/characters/npc-cloth-atlas-v2-01.webp",
    "/game/characters/npc-cloth-atlas-v2-02.webp",
    "/game/characters/npc-cloth-atlas-v2-03.webp",
  ],
  legacyFaceAtlas: "/game/characters/npc-face-atlas-v1.webp",
  legacyClothingAtlas: "/game/characters/npc-cloth-atlas-v1.webp",
} as const;

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

function normalizedVariant(variant: number, count: number = PREMIUM_CHARACTER_ASSETS.identityCount) {
  return ((Math.floor(variant) % count) + count) % count;
}

function defaultAtlas(kind: "face" | "clothing", variant: number) {
  const paths = kind === "face" ? PREMIUM_CHARACTER_ASSETS.faceAtlases : PREMIUM_CHARACTER_ASSETS.clothingAtlases;
  const availableIdentities = paths.length * PREMIUM_CHARACTER_ASSETS.tilesPerAtlas;
  return paths[Math.floor(normalizedVariant(variant, availableIdentities) / PREMIUM_CHARACTER_ASSETS.tilesPerAtlas)];
}

function portraitTile(url: string, tile: number, quality: number, onSkinTone?: (cssColor: string) => void) {
  if (typeof document === "undefined") return atlasTile(url, tile, quality);
  const size = quality > .86 ? 384 : quality > .62 ? 256 : 128;
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = size;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = quality > .86 ? 8 : 4;
  if (!context) return texture;
  const image = new Image(); image.decoding = "async";
  image.onload = () => {
    const index = ((tile % 4) + 4) % 4, tileWidth = image.naturalWidth / 2, tileHeight = image.naturalHeight / 2;
    const legacy = url.includes("-v1."), cropX = legacy ? .07 : .055, cropY = legacy ? .015 : .018, cropWidth = legacy ? .86 : .89, cropHeight = legacy ? .84 : .94;
    const sourceX = (index % 2) * tileWidth + tileWidth * cropX, sourceY = (index < 2 ? 0 : tileHeight) + tileHeight * cropY;
    context.clearRect(0, 0, size, size);
    context.drawImage(image, sourceX, sourceY, tileWidth * cropWidth, tileHeight * cropHeight, 0, 0, size, size);
    const pixels = context.getImageData(0, 0, size, size), sample = (x: number, y: number) => {
      const offset = (y * size + x) * 4; return [pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2]] as const;
    };
    // Sample broad cheek and jaw patches from the actual portrait. The same
    // tone is applied to the cranium, neck, ears and hands once the image is
    // decoded, so photographic faces no longer sit on a differently coloured
    // procedural body like a mask.
    const toneSamples: number[][] = [];
    for (const [centerX, centerY] of [[.31, .55], [.69, .55], [.36, .68], [.64, .68], [.5, .79]]) {
      const radius = Math.max(2, Math.round(size * .028));
      for (let offsetY = -radius; offsetY <= radius; offsetY++) for (let offsetX = -radius; offsetX <= radius; offsetX++) {
        if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
        const color = sample(Math.round(centerX * (size - 1)) + offsetX, Math.round(centerY * (size - 1)) + offsetY);
        const luminance = color[0] * .2126 + color[1] * .7152 + color[2] * .0722;
        if (luminance > 28 && luminance < 238) toneSamples.push([...color]);
      }
    }
    if (toneSamples.length) {
      const average = [0, 1, 2].map(channel => Math.round(toneSamples.reduce((sum, color) => sum + color[channel], 0) / toneSamples.length));
      onSkinTone?.(`rgb(${average[0]} ${average[1]} ${average[2]})`);
    }
    const corners = [sample(2, 2), sample(size - 3, 2), sample(2, size - 3), sample(size - 3, size - 3)];
    const background = [0, 1, 2].map(channel => corners.reduce((sum, color) => sum + color[channel], 0) / corners.length);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const offset = (y * size + x) * 4;
      const distance = Math.hypot(pixels.data[offset] - background[0], pixels.data[offset + 1] - background[1], pixels.data[offset + 2] - background[2]);
      const edgeX = Math.min(1, x / (size * .085), (size - 1 - x) / (size * .085));
      const edgeY = Math.min(1, y / (size * .065), (size - 1 - y) / (size * .065));
      const edgeFeather = Math.max(0, Math.min(edgeX, edgeY));
      const normalizedX = (x / (size - 1) - .5) / .51, normalizedY = (y / (size - 1) - .505) / .57;
      const portraitMask = 1 - THREE.MathUtils.smoothstep(Math.hypot(normalizedX, normalizedY), .76, 1);
      const backgroundMask = THREE.MathUtils.smoothstep(distance, legacy ? 18 : 9, legacy ? 42 : 30);
      pixels.data[offset + 3] = Math.round(255 * edgeFeather * portraitMask * backgroundMask);
    }
    context.putImageData(pixels, 0, 0); texture.needsUpdate = true;
  };
  image.src = url;
  return texture;
}

function anatomicalHeadGeometry(segments: number) {
  const geometry = new THREE.SphereGeometry(1, segments, Math.max(16, Math.floor(segments * .78)));
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const sourceX = positions.getX(index), sourceY = positions.getY(index), sourceZ = positions.getZ(index);
    const jawTaper = .8 + THREE.MathUtils.smoothstep(sourceY, -.83, -.05) * .2;
    const cheek = Math.exp(-Math.pow((sourceY + .08) / .3, 2)) * (sourceZ < 0 ? .035 : .012);
    const temple = Math.exp(-Math.pow((sourceY - .32) / .22, 2)) * .018;
    positions.setXYZ(index, sourceX * .247 * (jawTaper + cheek + temple), sourceY * .292, sourceZ * .245 * (1 + cheek * .75));
  }
  positions.needsUpdate = true; geometry.computeVertexNormals(); return geometry;
}

/**
 * A subdivided ellipsoidal facial shell follows the cranium instead of
 * presenting the generated portrait on a flat billboard. Standardized atlas
 * landmarks are also given subtle geometric depth at the brow, nose, cheeks,
 * lips and chin, so silhouettes remain human from oblique viewing angles.
 */
function faceSurfaceGeometry(quality: number) {
  const columns = quality > .86 ? 34 : quality > .62 ? 24 : 18;
  const rows = quality > .86 ? 36 : quality > .62 ? 26 : 20;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let row = 0; row <= rows; row++) {
    const v = row / rows, latitude = THREE.MathUtils.lerp(.96, -.99, v);
    for (let column = 0; column <= columns; column++) {
      const u = column / columns, longitude = (u - .5) * 1.76;
      const latitudeCosine = Math.cos(latitude);
      let x = Math.sin(longitude) * latitudeCosine * .249;
      const y = Math.sin(latitude) * .292;
      // Keep the photographic shell just proud of the unified skin cranium.
      // The extra clearance prevents the eye-socket recession from dipping
      // behind the underlying head at grazing camera angles.
      let z = -Math.cos(longitude) * latitudeCosine * .247 - .009;
      const gaussian = (centerU: number, centerV: number, spreadU: number, spreadV: number) => Math.exp(-Math.pow((u - centerU) / spreadU, 2) - Math.pow((v - centerV) / spreadV, 2));
      const nose = gaussian(.5, .51, .09, .17), brow = gaussian(.5, .245, .24, .075);
      const eyeSockets = gaussian(.34, .325, .095, .065) + gaussian(.66, .325, .095, .065);
      const cheeks = gaussian(.29, .55, .15, .15) + gaussian(.71, .55, .15, .15);
      const lips = gaussian(.5, .7, .14, .065), chin = gaussian(.5, .89, .19, .095);
      z -= nose * .042 + cheeks * .008 + lips * .008 + chin * .005;
      z += eyeSockets * .0025 + brow * .0015;
      x *= .985 + cheeks * .018;
      positions.push(x, y, z); uvs.push(u, 1 - v);
      const normal = new THREE.Vector3(x / (.249 * .249), y / (.292 * .292), z / (.247 * .247)).normalize();
      normals.push(normal.x, normal.y, normal.z);
    }
  }
  const stride = columns + 1;
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const topLeft = row * stride + column, bottomLeft = topLeft + stride;
    indices.push(topLeft, topLeft + 1, bottomLeft, topLeft + 1, bottomLeft + 1, bottomLeft);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
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

function profiledTorsoGeometry(segments: number, role: PremiumHumanRole, feminine: boolean) {
  const attendant = role === "attendant";
  const shoulderScale = feminine ? .91 : 1;
  const levels = [
    { y: -.55, x: feminine ? .275 : .245, z: .19 },
    { y: -.46, x: feminine ? .32 : .305, z: .22 },
    { y: -.2, x: feminine ? .295 : .318, z: .232 },
    { y: .08, x: feminine ? .305 : .325, z: .24 },
    { y: .3, x: (attendant ? .375 : .36) * shoulderScale, z: .235 },
    { y: .42, x: (attendant ? .415 : .392) * shoulderScale, z: .22 },
    { y: .52, x: .225, z: .17 },
  ];
  const ringSegments = Math.max(18, segments), positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let level = 0; level < levels.length; level++) {
    const data = levels[level];
    for (let segment = 0; segment <= ringSegments; segment++) {
      const u = segment / ringSegments, angle = u * Math.PI * 2, front = Math.max(0, -Math.sin(angle));
      const chest = Math.exp(-Math.pow((data.y - .18) / .25, 2)) * front * .018;
      positions.push(Math.cos(angle) * data.x, data.y, Math.sin(angle) * data.z - chest);
      uvs.push(u, level / (levels.length - 1));
    }
  }
  const stride = ringSegments + 1;
  for (let level = 0; level < levels.length - 1; level++) for (let segment = 0; segment < ringSegments; segment++) {
    const current = level * stride + segment, next = current + stride;
    indices.push(current, next, current + 1, current + 1, next, next + 1);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

/**
 * Builds one tapered anatomical sweep through every authored joint. Shoulder,
 * elbow and wrist therefore share a silhouette instead of being assembled from
 * cylinders and cover spheres, which used to read as toy-like bulbs and cones.
 */
function taperedSweepGeometry(points: THREE.Vector3[], radii: number[], segments: number, radialSegments: number, depthScale = .86) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const frames = curve.computeFrenetFrames(segments, false), ring = radialSegments + 1;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const center = new THREE.Vector3(), offset = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let segment = 0; segment <= segments; segment++) {
    const t = segment / segments, scaled = t * (radii.length - 1), radiusIndex = Math.min(radii.length - 2, Math.floor(scaled));
    const radius = THREE.MathUtils.lerp(radii[radiusIndex], radii[radiusIndex + 1], THREE.MathUtils.smootherstep(scaled - radiusIndex, 0, 1));
    curve.getPointAt(t, center);
    for (let radial = 0; radial <= radialSegments; radial++) {
      const u = radial / radialSegments, angle = u * Math.PI * 2, cosine = Math.cos(angle), sine = Math.sin(angle);
      offset.copy(frames.normals[segment]).multiplyScalar(cosine * radius);
      offset.addScaledVector(frames.binormals[segment], sine * radius * depthScale);
      positions.push(center.x + offset.x, center.y + offset.y, center.z + offset.z);
      normal.copy(frames.normals[segment]).multiplyScalar(cosine).addScaledVector(frames.binormals[segment], sine / depthScale).normalize();
      normals.push(normal.x, normal.y, normal.z); uvs.push(u, t);
      if (segment < segments && radial < radialSegments) {
        const current = segment * ring + radial, next = current + ring;
        indices.push(current, next, current + 1, current + 1, next, next + 1);
      }
    }
  }
  // Cap the sweep itself instead of hiding open ends inside cover spheres.
  // The shoulder/hand joins can now overlap anatomically without exposing a
  // hollow tube when the waving arm rotates toward the camera.
  for (const end of [0, 1] as const) {
    const segment = end * segments, ringStart = segment * ring;
    curve.getPointAt(end, center);
    const tangent = curve.getTangentAt(end).normalize().multiplyScalar(end === 0 ? -1 : 1);
    const capCenter = positions.length / 3;
    positions.push(center.x, center.y, center.z);
    normals.push(tangent.x, tangent.y, tangent.z);
    uvs.push(.5, .5);
    for (let radial = 0; radial < radialSegments; radial++) {
      const current = ringStart + radial, next = current + 1;
      if (end === 0) indices.push(capCenter, next, current);
      else indices.push(capCenter, current, next);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeBoundingSphere(); return geometry;
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

function createProceduralPremiumHuman(options: PremiumHumanOptions): PremiumCharacterResult {
  const quality = THREE.MathUtils.clamp(options.quality, .42, 1.2), high = quality > .7;
  const segments = quality > .92 ? 40 : quality > .68 ? 28 : 18;
  const identityVariant = normalizedVariant(options.faceVariant ?? options.variant);
  const wardrobeVariant = normalizedVariant(options.clothingVariant ?? options.variant + (options.role === "attendant" ? 4 : 0));
  const feminine = identityVariant >= 12
    ? [12, 13, 14, 16, 17, 18].includes(identityVariant)
    : identityVariant % 2 === 1;
  const faceAtlasUrl = options.faceAtlasUrl ?? defaultAtlas("face", identityVariant);
  const clothingAtlasUrl = options.clothingAtlasUrl ?? defaultAtlas("clothing", wardrobeVariant);
  const hairColor = options.hair ?? (identityVariant % 4 === 0 ? "#241b17" : identityVariant % 4 === 1 ? "#38251d" : identityVariant % 4 === 2 ? "#5a402f" : "#17191a");
  const coatMap = proceduralSurface("cloth", options.coat, "#d8d2bc", 17 + options.variant, quality);
  const trouserMap = proceduralSurface("cloth", options.trousers, "#7f8d8b", 31 + options.variant, quality);
  const skinMap = proceduralSurface("skin", options.skin, "#6f4536", 47 + options.variant, quality);
  const hairMap = proceduralSurface("hair", hairColor, "#8d765c", 61 + options.variant, quality);
  const leatherMap = proceduralSurface("leather", options.role === "attendant" ? "#151b18" : "#5a3c2b", "#b18c63", 79 + options.variant, quality);
  const metalMap = proceduralSurface("metal", "#a8aaa2", "#f5f1dc", 97 + options.variant, quality);
  const trimMap = proceduralSurface("cloth", options.role === "attendant" ? "#e7e0cf" : "#b7a582", "#ffffff", 103 + options.variant, quality);
  const skinIntegration: { tone: string; material?: THREE.MeshPhysicalMaterial } = { tone: options.skin };
  const faceAtlas = portraitTile(faceAtlasUrl, identityVariant % PREMIUM_CHARACTER_ASSETS.tilesPerAtlas, quality, tone => {
    skinIntegration.tone = tone;
    skinIntegration.material?.color.setStyle(tone);
  });
  const clothingAtlas = atlasTile(clothingAtlasUrl, wardrobeVariant % PREMIUM_CHARACTER_ASSETS.tilesPerAtlas, quality);
  const ownedTextures = [coatMap, trouserMap, skinMap, hairMap, leatherMap, metalMap, trimMap, faceAtlas, clothingAtlas];
  const coat = atlasMaterial(clothingAtlas, coatMap, .8), trousers = texturedMaterial(trouserMap, .83);
  const skin = new THREE.MeshPhysicalMaterial({ color: skinIntegration.tone, bumpMap: skinMap, bumpScale: .014, roughness: .76, clearcoat: .012, clearcoatRoughness: .92 }); skinIntegration.material = skin;
  const faceSkin = new THREE.MeshPhysicalMaterial({ map: faceAtlas, bumpMap: skinMap, bumpScale: .004, transparent: true, alphaTest: .015, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, roughness: .72, clearcoat: .018, clearcoatRoughness: .9, side: THREE.FrontSide });
  const hair = texturedMaterial(hairMap, .91), leather = texturedMaterial(leatherMap, .72), metal = texturedMaterial(metalMap, .32, { metalness: .76, clearcoat: .22 }), trim = texturedMaterial(trimMap, .72);
  const root = new THREE.Group(); root.name = options.role === "attendant" ? "central-park-zoo-attendant" : "central-park-zoo-visitor";
  root.userData.role = options.role === "attendant" ? "zoo-attendant" : "zoo-visitor";
  root.userData.characterFidelity = high ? "premium-high" : "premium-mobile";
  root.userData.faceAtlas = faceAtlasUrl;
  root.userData.faceVariant = identityVariant;
  root.userData.skinIntegration = "face-atlas-sampled-seamless";
  root.userData.presentation = feminine ? "feminine" : "masculine";
  root.userData.clothingAtlas = clothingAtlasUrl;
  root.userData.clothingVariant = wardrobeVariant;
  if (options.role === "attendant") root.userData.dialogue = "There are no sloths here.";

  // A profiled, slightly asymmetrical torso replaces the stacked-box outline.
  const build = identityVariant % 4;
  const hips = new THREE.Mesh(CapsuleGeometrySafe(.29, .24, segments), trousers); hips.position.y = 1.02; hips.scale.set((feminine ? 1.08 : 1.02) + build * .018, .68, .76 + (build % 2) * .035); root.add(hips);
  const torso = new THREE.Mesh(profiledTorsoGeometry(segments, options.role, feminine), coat); torso.position.y = 1.5; torso.rotation.y = (identityVariant % 3 - 1) * .018; torso.scale.set(.96 + build * .018, 1 + (identityVariant % 2) * .018, .98 + (build % 2) * .025); root.add(torso);
  const jacketHem = new THREE.Mesh(new THREE.TorusGeometry(.295, .025, Math.max(8, segments / 3), segments), coat); jacketHem.rotation.x = Math.PI / 2; jacketHem.scale.z = .74; jacketHem.position.y = .99; root.add(jacketHem);
  if (options.role === "attendant") {
    const shirt = new THREE.Mesh(new RoundedBoxGeometry(.32, .5, .045, high ? 8 : 4, .025), trim); shirt.position.set(0, 1.52, -.286); root.add(shirt);
    for (const side of [-1, 1]) { const lapel = new THREE.Mesh(new RoundedBoxGeometry(.13, .37, .025, 4, .018), coat); lapel.position.set(side * .105, 1.67, -.322); lapel.rotation.z = side * -.22; root.add(lapel); }
    const tie = new THREE.Mesh(new RoundedBoxGeometry(.055, .23, .02, 3, .012), leather); tie.position.set(0, 1.56, -.342); root.add(tie);
  } else {
    const zip = new THREE.Mesh(new RoundedBoxGeometry(.02, .72, .018, 3, .006), metal); zip.position.set(0, 1.47, -.307); root.add(zip);
    for (const side of [-1, 1]) { const seam = new THREE.Mesh(new THREE.TorusGeometry(.24, .014, 7, segments, Math.PI * .62), trim); seam.position.set(side * .045, 1.76, -.015); seam.rotation.set(Math.PI / 2, 0, side * .2); root.add(seam); }
  }
  if (high) for (const side of [-1, 1]) {
    const pocketWelt = new THREE.Mesh(new RoundedBoxGeometry(.17, .035, .025, 4, .009), coat); pocketWelt.name = "tailored-textured-pocket-welt"; pocketWelt.position.set(side * .18, 1.3, -.238); pocketWelt.rotation.z = side * -.055; root.add(pocketWelt);
    const shoulderSeam = new THREE.Mesh(new THREE.TorusGeometry(.105, .009, 6, Math.max(16, segments / 2), Math.PI * .72), trim); shoulderSeam.position.set(side * .31, 1.77, -.015); shoulderSeam.rotation.set(Math.PI / 2, 0, side * .46); root.add(shoulderSeam);
  }
  if (quality > .9) for (const y of [1.62, 1.48, 1.34]) { const button = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, .009, 12), metal); button.position.set(.018, y, -.316); button.rotation.x = Math.PI / 2; root.add(button); }

  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(.108, .065, Math.max(8, Math.floor(segments / 2)), segments), skin); neck.name = "anatomical-head-neck-skin-transition"; neck.position.y = 1.985; neck.scale.set(1, .94, .92); root.add(neck);
  const head = new THREE.Mesh(anatomicalHeadGeometry(segments), skin); head.name = "unified-anatomical-head-and-jaw"; head.position.y = 2.23; root.add(head);
  const faceSurface = new THREE.Mesh(faceSurfaceGeometry(quality), faceSkin); faceSurface.name = "head-conforming-generated-face-surface"; faceSurface.position.y = 2.23; faceSurface.renderOrder = 4; root.add(faceSurface);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.278, segments, Math.max(14, Math.floor(segments * .7)), 0, Math.PI * 2, 0, Math.PI * .56), hair); hairCap.scale.set(.9, 1.04, .91); hairCap.position.y = 2.285; hairCap.rotation.y = identityVariant * .23; root.add(hairCap);
  if (identityVariant % 4 === 1) {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(.125, segments, 16), hair); bun.scale.set(.9, 1.07, .92); bun.position.set(0, 2.4, .205); root.add(bun);
  } else if (identityVariant % 4 === 2) {
    for (const side of [-1, 1]) { const sideHair = new THREE.Mesh(new THREE.CapsuleGeometry(.057, .22, 10, segments), hair); sideHair.position.set(side * .205, 2.12, .018); sideHair.rotation.z = side * .055; root.add(sideHair); }
  } else if (identityVariant % 4 === 3 && high) {
    for (let curl = 0; curl < 9; curl++) { const angle = curl / 9 * Math.PI * 2; const coil = new THREE.Mesh(new THREE.TorusGeometry(.048, .016, 8, 14), hair); coil.position.set(Math.cos(angle) * .19, 2.39 + Math.sin(curl * 1.7) * .025, Math.sin(angle) * .14); coil.rotation.set(Math.PI / 2, angle, 0); root.add(coil); }
  }
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.071, segments, Math.max(12, Math.floor(segments * .5))), skin); ear.scale.set(.52, .96, .68); ear.position.set(side * .248, 2.22, -.002); root.add(ear);
    const earFold = new THREE.Mesh(new THREE.TorusGeometry(.027, .007, 7, 18, Math.PI * 1.45), skin); earFold.position.set(side * .257, 2.22, -.035); earFold.rotation.y = side * Math.PI / 2; root.add(earFold);
  }

  const pose = options.pose ?? "neutral";
  for (const side of [-1, 1]) {
    const shoulder = new THREE.Vector3(side * (feminine ? .345 : .37), 1.68, 0);
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
    const arm = new THREE.Mesh(taperedSweepGeometry([
      new THREE.Vector3(side * (feminine ? .285 : .305), 1.72, .018),
      shoulder,
      elbow,
      wrist,
    ], [feminine ? .105 : .115, .11, .082, .057], high ? 34 : 24, Math.max(14, Math.floor(segments * .72)), .82), coat);
    arm.name = "continuous-tailored-human-arm"; root.add(arm);
    if (options.role === "attendant") { const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.068, .073, .095, segments), trim); cuff.position.copy(elbow).lerp(wrist, .78); cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), wrist.clone().sub(elbow).normalize()); root.add(cuff); }
    addNaturalHand(root, wrist, side, skin, segments, pose === "waving" || pose === "photographing" ? "open" : "relaxed");
    const hip = new THREE.Vector3(side * .15, .89, 0);
    const knee = pose === "seated"
      ? new THREE.Vector3(side * .17, .67, -.34)
      : new THREE.Vector3(side * (.15 + (options.variant % 2 ? .018 : 0)), .48, side * .012);
    const ankle = pose === "seated" ? new THREE.Vector3(side * .16, .22, -.52) : new THREE.Vector3(side * .15, .16, -.015);
    const leg = new THREE.Mesh(taperedSweepGeometry([
      new THREE.Vector3(side * .135, .98, .012),
      hip,
      knee,
      ankle,
    ], [feminine ? .12 : .13, .125, .101, .072], high ? 32 : 22, Math.max(14, Math.floor(segments * .72)), .9), trousers);
    leg.name = "continuous-tailored-human-leg"; root.add(leg);
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

/**
 * World construction remains synchronous, but the procedural rig is retained
 * only as hidden transform scaffolding. The character becomes visible after its
 * exclusive authored, rigged GLB has decoded successfully.
 */
export function createPremiumHuman(options: PremiumHumanOptions): PremiumCharacterResult {
  const result = createProceduralPremiumHuman(options);
  hydrateAuthoredHuman(result.root, options, result.ownedTextures);
  return result;
}

export {
  markAuthoredHumanDisposed as markPremiumHumanDisposed,
  markAuthoredHumansDisposed as markPremiumHumansDisposed,
  markAuthoredHumansDisposed as markPremiumCharactersDisposed,
};

// CapsuleGeometry requires a strictly positive body length. This wrapper keeps
// the pelvis rounded without relying on a sphere that reads as a toy primitive.
function CapsuleGeometrySafe(radius: number, length: number, segments: number) {
  return new THREE.CapsuleGeometry(radius, length, Math.max(6, Math.floor(segments / 2)), segments);
}

function paintSlothSurface(
  geometry: THREE.BufferGeometry,
  colorAt: (point: THREE.Vector3, target: THREE.Color) => THREE.Color,
) {
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors: number[] = [];
  const point = new THREE.Vector3(), color = new THREE.Color();
  for (let index = 0; index < positions.count; index++) {
    point.fromBufferAttribute(positions, index);
    colorAt(point, color);
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

function anatomicalSlothTorsoGeometry(segments: number, base: THREE.Color, cream: THREE.Color) {
  const geometry = new THREE.SphereGeometry(1, segments, Math.max(16, segments - 5));
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    const shoulders = Math.exp(-Math.pow((y - .48) / .29, 2)), ribs = Math.exp(-Math.pow(y / .52, 2)), hips = Math.exp(-Math.pow((y + .55) / .29, 2));
    const width = .42 + shoulders * .21 + ribs * .075 + hips * .04, depth = .34 + shoulders * .055 + ribs * .05 + hips * .025;
    positions.setXYZ(index, x * width, y * 1.16, z * depth - Math.max(0, -z) * shoulders * .03);
  }
  positions.needsUpdate = true; geometry.computeVertexNormals();
  return paintSlothSurface(geometry, (point, target) => {
    const front = THREE.MathUtils.smoothstep(-point.z, .07, .39);
    const vertical = 1 - THREE.MathUtils.smoothstep(Math.abs(point.y + .03), .48, .94);
    const bibWidth = .17 + vertical * .2;
    const central = 1 - THREE.MathUtils.smoothstep(Math.abs(point.x), bibWidth, bibWidth + .075);
    return target.copy(base).lerp(cream, front * vertical * central * .92);
  });
}

function anatomicalSlothHeadGeometry(segments: number, base: THREE.Color, cream: THREE.Color, dark: THREE.Color) {
  const geometry = new THREE.SphereGeometry(1, segments, Math.max(16, segments - 5));
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    const jaw = .84 + THREE.MathUtils.smoothstep(y, -.82, .18) * .16;
    const brow = Math.exp(-Math.pow((y - .28) / .29, 2)) * .045, crown = Math.exp(-Math.pow((y - .72) / .25, 2)) * .035;
    positions.setXYZ(index, x * (.5 * jaw + brow), y * .45 + crown, z * (.41 + Math.max(0, -z) * .035));
  }
  positions.needsUpdate = true; geometry.computeVertexNormals();
  return paintSlothSurface(geometry, (point, target) => {
    const front = THREE.MathUtils.smoothstep(-point.z, .05, .36);
    const faceEllipse = Math.max(0, 1 - Math.pow(point.x / .43, 2) - Math.pow((point.y + .005) / .34, 2));
    const mantle = front * THREE.MathUtils.smoothstep(faceEllipse, .04, .42);
    const eyePatch = front * Math.exp(
      -Math.pow((Math.abs(point.x) - .19) / .105, 2)
      -Math.pow((point.y - .08) / .105, 2),
    );
    const muzzle = front * Math.exp(-Math.pow(point.x / .17, 2) - Math.pow((point.y + .13) / .11, 2));
    return target.copy(base).lerp(cream, mantle * .94).lerp(dark, eyePatch * .92).lerp(cream, muzzle * .82);
  });
}

export function createPremiumSlothFriend(textures: GameTextures, quality: number, variant: number, tint: string): PremiumCharacterResult {
  const clamped = THREE.MathUtils.clamp(quality, .42, 1.2), high = clamped > .7, segments = clamped > .9 ? 30 : high ? 22 : 15;
  const darkMap = proceduralSurface("fur", "#241f19", "#5b4b3a", 229 + variant, clamped);
  const clawMap = proceduralSurface("ivory", "#e4d2a6", "#fff1c7", 241 + variant, clamped);
  const leatherMap = proceduralSurface("leather", "#304c36", "#9eb67d", 251 + variant, clamped);
  const ownedTextures = [darkMap, clawMap, leatherMap];
  const bodyTint = new THREE.Color(tint).multiplyScalar(.82 + variant * .035);
  const creamTint = new THREE.Color("#c3b694").lerp(bodyTint, .12), darkTint = new THREE.Color("#201b17");
  const fur = new THREE.MeshStandardMaterial({ map: textures.fur, bumpMap: textures.fur, bumpScale: .105, color: bodyTint, roughness: .96 });
  const paintedFur = new THREE.MeshStandardMaterial({ map: textures.fur, bumpMap: textures.fur, bumpScale: .105, color: "#ffffff", vertexColors: true, roughness: .96 });
  const darkFur = texturedMaterial(darkMap, .92), ivory = texturedMaterial(clawMap, .54, { clearcoat: .16 }), leather = texturedMaterial(leatherMap, .78);
  const eye = new THREE.MeshPhysicalMaterial({ map: darkMap, color: "#ffffff", roughness: .12, clearcoat: 1 });
  const root = new THREE.Group(); root.name = "waiting-sloth-friend"; root.userData.pose = variant;
  const body = new THREE.Mesh(anatomicalSlothTorsoGeometry(segments, bodyTint, creamTint), paintedFur); body.name = "continuous-anatomical-sloth-torso-with-integrated-bib"; body.position.set(0, 1.39, .04); body.rotation.z = -.02 + variant * .008; root.add(body);
  const head = new THREE.Mesh(anatomicalSlothHeadGeometry(segments, bodyTint, creamTint, darkTint), paintedFur); head.name = "anatomical-sloth-head-jaw-and-integrated-mask"; head.position.set(0, 2.5, -.1); root.add(head);
  const wavingSide = variant === 0 ? 1 : variant === 3 ? -1 : 0;
  for (const side of [-1, 1]) {
    const eyeball = new THREE.Mesh(new THREE.SphereGeometry(.042, 18, 14), eye); eyeball.position.set(side * .193, 2.59, -.59); root.add(eyeball);
    const gleam = new THREE.Mesh(new THREE.SphereGeometry(.009, 9, 7), new THREE.MeshBasicMaterial({ color: "#fffbe8", toneMapped: false })); gleam.position.set(side * .18, 2.604, -.627); root.add(gleam);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.105, segments, 12), fur); ear.scale.set(.48, .92, .63); ear.position.set(side * .49, 2.55, -.08); root.add(ear);
    const waving = side === wavingSide, arm = new THREE.Group(); arm.name = waving ? "friend-wave-arm" : "friend-rest-arm"; arm.position.set(side * .46, 1.96, -.005);
    arm.rotation.z = waving ? side * 2.25 : side * -.1; arm.rotation.x = waving ? -.08 : .035;
    const forelimb = new THREE.Mesh(taperedSweepGeometry([
      new THREE.Vector3(0, .38, .01),
      new THREE.Vector3(side * .018, .02, -.005),
      new THREE.Vector3(side * .055, -.44, -.055),
      new THREE.Vector3(side * .07, -.78, -.16),
      new THREE.Vector3(side * .065, -.93, -.28),
    ], [.205, .18, .145, .132, .112], high ? 40 : 26, Math.max(14, segments), .78), fur);
    forelimb.name = "continuous-anatomical-sloth-forelimb"; arm.add(forelimb);
    for (let claw = -1; claw <= 1; claw++) {
      const clawMesh = new THREE.Mesh(taperedSweepGeometry([
        new THREE.Vector3(side * .065 + claw * .07, -.91, -.27),
        new THREE.Vector3(side * .067 + claw * .076, -1.04, -.37),
        new THREE.Vector3(side * .065 + claw * .078, -1.13, -.5),
      ], [.031, .022, .004], high ? 18 : 11, high ? 9 : 7, .52), ivory);
      clawMesh.name = "capped-anatomical-sloth-hook-claw"; arm.add(clawMesh);
    }
    root.add(arm);
    const hindlimb = new THREE.Mesh(taperedSweepGeometry([
      new THREE.Vector3(side * .26, .78, .02),
      new THREE.Vector3(side * .34, .53, -.025),
      new THREE.Vector3(side * .33, .25, -.11),
      new THREE.Vector3(side * .3, .13, -.27),
      new THREE.Vector3(side * .3, .115, -.39),
    ], [.225, .205, .17, .13, .105], high ? 32 : 22, Math.max(13, segments), .74), fur);
    hindlimb.name = "continuous-anatomical-sloth-hindlimb"; root.add(hindlimb);
    for (let claw = -1; claw <= 1; claw++) {
      const footClaw = new THREE.Mesh(taperedSweepGeometry([
        new THREE.Vector3(side * .3 + claw * .055, .12, -.37),
        new THREE.Vector3(side * .3 + claw * .059, .095, -.5),
        new THREE.Vector3(side * .3 + claw * .06, .08, -.61),
      ], [.027, .019, .004], high ? 15 : 9, high ? 8 : 6, .5), ivory);
      footClaw.name = "ground-cleared-capped-hind-claw"; root.add(footClaw);
    }
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.077, segments, 14), darkFur); nose.scale.set(1.18, .66, .66); nose.position.set(0, 2.425, -.625); root.add(nose);
  if (variant === 1) { const satchel = new THREE.Mesh(new RoundedBoxGeometry(.42, .5, .15, 5, .05), leather); satchel.position.set(.5, 1.38, .05); satchel.rotation.z = -.13; root.add(satchel); }
  root.userData.anatomicalSurfaceCount = 4;
  root.userData.integratedFaceAndBib = true;
  castCharacterShadows(root, high); root.scale.setScalar(.97 + variant * .01); return { root, ownedTextures };
}
