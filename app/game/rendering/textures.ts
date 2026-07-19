import * as THREE from "three";

const pendingTextureClones = new WeakMap<THREE.Texture, THREE.Texture[]>();
const disposedTextureClones = new WeakSet<THREE.Texture>();

export function hasDecodedTextureImage(texture: THREE.Texture) {
  const image = texture.source.data as (CanvasImageSource & {
    complete?: boolean;
    naturalWidth?: number;
    width?: number;
  }) | null | undefined;
  if (!image) return false;
  if (image.complete === false) return false;
  const width = image.naturalWidth ?? image.width;
  return width === undefined || Number(width) > 0;
}

export function markTextureCloneReadyAfterSource(texture: THREE.Texture, source: THREE.Texture) {
  texture.addEventListener("dispose", () => disposedTextureClones.add(texture));
  // TextureLoader installs an HTMLImageElement before its pixels have decoded.
  // Marking clones dirty during that gap makes WebGL attempt an upload with no
  // image data, producing a warning per zoo animal and occasionally a blank
  // first frame. Only upload immediately when the shared Source is usable.
  if (hasDecodedTextureImage(source)) {
    texture.needsUpdate = true;
    return;
  }
  const pending = pendingTextureClones.get(source) ?? [];
  pending.push(texture);
  pendingTextureClones.set(source, pending);
}

function releasePendingTextureClones(source: THREE.Texture) {
  pendingTextureClones.get(source)?.forEach(texture => {
    if (!disposedTextureClones.has(texture) && hasDecodedTextureImage(source)) texture.needsUpdate = true;
  });
  pendingTextureClones.delete(source);
}

export type GameTextures = {
  ground: THREE.Texture;
  bark: THREE.Texture;
  fur: THREE.Texture;
  zooAnimalAtlas: THREE.Texture;
  foliage: THREE.Texture;
  foliageBranch: THREE.Texture;
  fern: THREE.Texture;
  gravel: THREE.CanvasTexture;
  stone: THREE.CanvasTexture;
  moss: THREE.CanvasTexture;
  waterNormal: THREE.CanvasTexture;
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value ^ (value >>> 15), 1 | value), value ^= value + Math.imul(value ^ (value >>> 7), 61 | value), ((value ^ (value >>> 14)) >>> 0) / 4294967296));
}

function detailTexture(kind: "gravel" | "stone" | "moss" | "water") {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 512;
  const context = canvas.getContext("2d")!;
  const random = seeded(kind === "gravel" ? 802 : kind === "stone" ? 431 : kind === "moss" ? 619 : 971);
  const image = context.createImageData(512, 512);
  for (let y = 0; y < 512; y++) {
    for (let x = 0; x < 512; x++) {
      const index = (y * 512 + x) * 4;
      const wave = Math.sin(x * .105 + Math.sin(y * .031) * 3) * .5 + .5;
      const noise = random();
      if (kind === "water") {
        image.data[index] = 112 + wave * 28;
        image.data[index + 1] = 126 + noise * 10;
        image.data[index + 2] = 235;
      } else if (kind === "moss") {
        const clump = THREE.MathUtils.clamp(.48 + Math.sin(x * .047 + Math.sin(y * .023) * 3.2) * .24 + Math.sin(y * .071 - x * .014) * .18 + (noise - .5) * .42, 0, 1);
        image.data[index] = 54 + clump * 62;
        image.data[index + 1] = 72 + clump * 96;
        image.data[index + 2] = 35 + clump * 45;
        image.data[index + 3] = clump > .43 ? 150 + clump * 105 : clump > .34 ? 58 : 0;
      } else if (kind === "stone") {
        const value = 140 + noise * 38 + Math.sin(x * .018) * 8;
        image.data[index] = value + 11; image.data[index + 1] = value + 5; image.data[index + 2] = value - 5;
      } else {
        const value = 92 + noise * 62 + wave * 16;
        image.data[index] = value + 18; image.data[index + 1] = value + 10; image.data[index + 2] = value - 4;
      }
      if (kind !== "moss") image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = kind === "water" ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  return texture;
}

export function loadGameTextures(renderer: THREE.WebGLRenderer, onReady: () => void): GameTextures {
  const manager = new THREE.LoadingManager(onReady);
  const loader = new THREE.TextureLoader(manager);
  const anisotropy = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  const load = (url: string, repeatX: number, repeatY = repeatX, onLoad?: (texture: THREE.Texture) => void) => {
    const texture = loader.load(url, onLoad);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = anisotropy;
    return texture;
  };
  const ground = load("/game/textures/forest-floor.webp", 18);
  const bark = load("/game/textures/elm-bark.webp", 1.3, 5);
  const fur = load("/game/textures/sloth-fur.webp", 1.2, 2.2, decodedFur => {
    // The first-person rig owns a private sampler so its UVs stay stable in
    // every scene. SubwayGame creates that sampler before this image usually
    // finishes decoding; release it here just as we do for authored animal
    // atlases, otherwise later scenes render only the material's flat tint.
    releasePendingTextureClones(decodedFur);
  });
  const zooAnimalAtlas = load("/game/textures/zoo-animal-surface-atlas.webp", 1, 1, atlas => {
    releasePendingTextureClones(atlas);
  });
  const foliage = load("/game/textures/foliage-cluster.webp", 1);
  foliage.wrapS = foliage.wrapT = THREE.ClampToEdgeWrapping;
  foliage.repeat.set(1, 1);
  const foliageBranch = load("/game/textures/foliage-branch.webp", 1);
  foliageBranch.wrapS = foliageBranch.wrapT = THREE.ClampToEdgeWrapping;
  foliageBranch.repeat.set(1, 1);
  const fern = load("/game/textures/fern.webp", 1);
  fern.wrapS = fern.wrapT = THREE.ClampToEdgeWrapping;
  fern.repeat.set(1, 1);
  const gravel = detailTexture("gravel"); gravel.repeat.set(2, 28); gravel.anisotropy = anisotropy;
  const stone = detailTexture("stone"); stone.repeat.set(3, 3); stone.anisotropy = anisotropy;
  const moss = detailTexture("moss"); moss.repeat.set(2, 14); moss.anisotropy = anisotropy;
  const waterNormal = detailTexture("water"); waterNormal.repeat.set(8, 8); waterNormal.anisotropy = anisotropy;
  return { ground, bark, fur, zooAnimalAtlas, foliage, foliageBranch, fern, gravel, stone, moss, waterNormal };
}
