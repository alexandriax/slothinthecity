import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { PremiumHumanOptions } from "../PremiumCharacter";

type HumanArchetype = "human-male-short" | "human-male-curly" | "human-female-bob" | "human-female-ponytail";
type HumanLod = "lod0" | "lod2";

type HumanTemplate = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

type HydrationState = {
  disposed: boolean;
  fallbackChildren: THREE.Object3D[];
  fallbackTextures: THREE.Texture[];
  hydrated?: THREE.Group;
  ownedTextures: THREE.Texture[];
};

const AUTHORED_HUMAN_ROOT = "/game/characters/authored";
const DRACO_DECODER_ROOT = "/game/draco/";
const SKIN_ATLAS_URL = "/game/characters/human-skin-pbr-v4.webp";
const CLOTH_ATLAS_URL = "/game/characters/human-cloth-pbr-v4.webp";

const templatePromises = new Map<string, Promise<HumanTemplate>>();
const atlasPromises = new Map<string, Promise<THREE.Texture>>();
// Texture transforms belong to Texture rather than Material in Three.js. A
// per-character clone would therefore create a new GPU upload of the complete
// atlas for every NPC. Cache cropped quadrants by tile and sampling tier for
// the application lifetime; the bounded set is shared by all streamed worlds.
const atlasTileTextures = new Map<string, THREE.Texture>();
const hydrationStates = new WeakMap<THREE.Group, HydrationState>();
let sharedGltfLoader: GLTFLoader | undefined;

function positiveModulo(value: number, count: number) {
  return ((Math.floor(value) % count) + count) % count;
}

function archetypeFor(options: PremiumHumanOptions): HumanArchetype {
  const identity = positiveModulo(options.faceVariant ?? options.variant, 20);
  const feminine = [12, 13, 14, 16, 17, 18].includes(identity);
  if (feminine) return identity % 2 === 0 ? "human-female-bob" : "human-female-ponytail";
  return identity % 2 === 0 ? "human-male-short" : "human-male-curly";
}

function skinTileFor(color: string) {
  const normalized = color.trim().replace("#", "");
  const expanded = normalized.length === 3
    ? normalized.split("").map(channel => channel + channel).join("")
    : normalized;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return 1;
  const value = Number.parseInt(expanded, 16);
  const red = (value >> 16) & 255, green = (value >> 8) & 255, blue = value & 255;
  const luminance = red * .2126 + green * .7152 + blue * .0722;
  // Atlas quadrants progress from deep brown through medium brown and
  // olive/tan to light beige. Matching the caller's authored skin palette is
  // more reliable than coupling tone to hairstyle/identity indexes.
  return luminance < 95 ? 0 : luminance < 130 ? 1 : luminance < 165 ? 2 : 3;
}

function lodFor(quality: number): HumanLod {
  // LOD0 is intended for desktop/high-end tablet. LOD2 keeps skinning and the
  // same silhouette on phones while substantially reducing vertex transform
  // and fragment cost.
  return quality >= .76 ? "lod0" : "lod2";
}

function createLoader() {
  if (sharedGltfLoader) return sharedGltfLoader;
  const draco = new DRACOLoader();
  draco.setDecoderPath(DRACO_DECODER_ROOT);
  // A single small worker pool serves all archetypes. Creating one decoder per
  // concurrently requested NPC can briefly multiply WASM memory on phones.
  draco.setWorkerLimit(2);
  const loader = new GLTFLoader();
  loader.setDRACOLoader(draco);
  sharedGltfLoader = loader;
  return sharedGltfLoader;
}

function loadTemplate(url: string) {
  let promise = templatePromises.get(url);
  if (!promise) {
    promise = new Promise<HumanTemplate>((resolve, reject) => {
      const loader = createLoader();
      loader.load(
        url,
        gltf => {
          resolve({ scene: gltf.scene, animations: gltf.animations });
        },
        undefined,
        reject,
      );
    });
    templatePromises.set(url, promise);
  }
  return promise;
}

function loadAtlas(url: string) {
  let promise = atlasPromises.get(url);
  if (!promise) {
    promise = new Promise<THREE.Texture>((resolve, reject) => {
      new THREE.TextureLoader().load(url, texture => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.flipY = false;
        texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
        resolve(texture);
      }, undefined, reject);
    });
    atlasPromises.set(url, promise);
  }
  return promise;
}

function atlasTile(source: THREE.Texture, url: string, tile: number, quality: number) {
  const index = positiveModulo(tile, 4);
  const anisotropy = quality > .86 ? 8 : quality > .62 ? 4 : 2;
  const cacheKey = `${url}:${index}:${anisotropy}`;
  const cached = atlasTileTextures.get(cacheKey);
  if (cached) return cached;

  const image = source.image as HTMLImageElement;
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const tileWidth = Math.floor(sourceWidth / 2), tileHeight = Math.floor(sourceHeight / 2);
  const canvas = document.createElement("canvas");
  canvas.width = tileWidth; canvas.height = tileHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Authored human atlases require a 2D canvas context");
  // The generated sheets are top-left first. Cropping avoids uploading the
  // unused three quadrants for every tile and lets all matching NPCs share one
  // immutable Texture object.
  context.drawImage(
    image,
    (index % 2) * tileWidth,
    index < 2 ? 0 : tileHeight,
    tileWidth,
    tileHeight,
    0,
    0,
    tileWidth,
    tileHeight,
  );
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  // The CC0 body meshes use repeated/multi-tile UV islands. The cropped PBR
  // micro-texture is intentionally seamless, so repeat it rather than smearing
  // the border pixel over every UV coordinate outside the first tile.
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  atlasTileTextures.set(cacheKey, texture);
  return texture;
}

function canonicalMaterialName(material: THREE.Material) {
  return material.name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function mappedMaterial(
  source: THREE.Material,
  options: PremiumHumanOptions,
  textures: { skin: THREE.Texture; clothUpper: THREE.Texture; clothLower: THREE.Texture },
) {
  const name = canonicalMaterialName(source);
  const physical = (parameters: THREE.MeshPhysicalMaterialParameters) => {
    const material = new THREE.MeshPhysicalMaterial(parameters);
    material.name = source.name;
    return material;
  };
  if (name.includes("skin")) return physical({
    map: textures.skin,
    color: "#ffffff",
    roughness: .68,
    metalness: 0,
    clearcoat: .025,
    clearcoatRoughness: .86,
    sheen: .08,
  });
  if (name.includes("clothupper") || name.includes("uppercloth") || name.includes("jacket") || name.includes("shirt")) return physical({
    map: textures.clothUpper,
    color: "#ffffff",
    roughness: .88,
    metalness: 0,
    sheen: .28,
    sheenRoughness: .78,
  });
  if (name.includes("clothlower") || name.includes("lowercloth") || name.includes("trouser") || name.includes("pants")) return physical({
    map: textures.clothLower,
    color: "#ffffff",
    roughness: .9,
    metalness: 0,
    sheen: .18,
  });
  if (name.includes("hair")) return physical({
    color: options.hair ?? (positiveModulo(options.variant, 4) === 2 ? "#57402e" : "#201a17"),
    roughness: .82,
    metalness: 0,
    sheen: .42,
    sheenRoughness: .72,
  });
  if (name.includes("shoe") || name.includes("leather")) return physical({
    color: options.role === "attendant" ? "#111613" : "#2b211d",
    roughness: .7,
    metalness: 0,
    clearcoat: .08,
    clearcoatRoughness: .72,
  });
  if (name.includes("eyewhite") || name.includes("sclera")) return physical({
    color: "#ece7dc",
    roughness: .32,
    clearcoat: .42,
    clearcoatRoughness: .25,
  });
  if (name.includes("iris")) return physical({
    color: positiveModulo(options.variant, 3) === 0 ? "#4b3622" : positiveModulo(options.variant, 3) === 1 ? "#52674b" : "#50657a",
    roughness: .25,
    clearcoat: .55,
    clearcoatRoughness: .16,
  });
  if (name.includes("pupil")) return physical({ color: "#080808", roughness: .2, clearcoat: .7, clearcoatRoughness: .12 });
  if (name.includes("lip")) return physical({
    color: skinTileFor(options.skin) < 2 ? "#8f5149" : "#a85e58",
    roughness: .58,
    metalness: 0,
    clearcoat: .06,
    clearcoatRoughness: .72,
  });
  if (name.includes("metal")) return physical({ color: "#aeb5b2", roughness: .28, metalness: .86 });
  return source.clone();
}

function uniqueInstance(template: HumanTemplate) {
  const instance = cloneSkeleton(template.scene) as THREE.Group;
  // SkeletonUtils clones the hierarchy and skeleton bindings, but animation
  // clips live on the GLTF result rather than the scene. Preserve independent
  // clips on each instance so a future mixer can animate a character without
  // mutating the cached template or another NPC.
  instance.animations = template.animations.map(clip => clip.clone());
  instance.userData.authoredHumanAnimationNames = instance.animations.map(clip => clip.name);
  instance.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    // SkeletonUtils deliberately shares immutable render resources. Every game
    // world currently owns and disposes its meshes, so instance-local clones
    // prevent one streamed world from invalidating the cached template or a
    // character in a different world.
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map(material => material.clone())
      : object.material.clone();
  });
  return instance;
}

function remapMaterials(
  instance: THREE.Group,
  options: PremiumHumanOptions,
  textures: { skin: THREE.Texture; clothUpper: THREE.Texture; clothLower: THREE.Texture },
) {
  instance.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const previous = Array.isArray(object.material) ? object.material : [object.material];
    const replacements = previous.map(material => mappedMaterial(material, options, textures));
    previous.forEach(material => material.dispose());
    object.material = Array.isArray(object.material) ? replacements : replacements[0];
    object.castShadow = options.quality > .7;
    object.receiveShadow = options.quality > .56;
    object.frustumCulled = true;
  });
}

function normalizedBoneName(bone: THREE.Bone) {
  return bone.name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findBone(bones: THREE.Bone[], ...candidates: string[]) {
  const normalized = candidates.map(candidate => candidate.toLowerCase().replace(/[^a-z0-9]/g, ""));
  return bones.find(bone => normalized.includes(normalizedBoneName(bone)));
}

function applyArmPose(bones: THREE.Bone[], side: "L" | "R", upperZ: number, upperX: number, lowerX: number, lowerZ = 0) {
  const label = side === "L" ? "left" : "right";
  const upper = findBone(bones, `UpperArm.${side}`, `UpperArm_${side}`, `${label}UpperArm`, `upper_arm_${side.toLowerCase()}`);
  const lower = findBone(bones, `LowerArm.${side}`, `LowerArm_${side}`, `${label}LowerArm`, `forearm.${side}`);
  if (upper) { upper.rotation.z += upperZ; upper.rotation.x += upperX; }
  if (lower) { lower.rotation.x += lowerX; lower.rotation.z += lowerZ; }
}

function poseSkeleton(instance: THREE.Group, pose: PremiumHumanOptions["pose"]) {
  const bones: THREE.Bone[] = [];
  instance.traverse(object => { if (object instanceof THREE.Bone) bones.push(object); });
  if (!bones.length) return;

  const selected = pose ?? "neutral";
  // Neutral preserves the deliberately relaxed bind pose authored by the
  // Blender pipeline. Scenario poses add only the rotations they require.
  if (selected === "checking-map") {
    applyArmPose(bones, "L", .18, -.78, -1.05, .18);
    applyArmPose(bones, "R", -.18, -.78, -1.05, -.18);
  } else if (selected === "photographing") {
    applyArmPose(bones, "L", .2, -1.08, -1.22, .26);
    applyArmPose(bones, "R", -.2, -1.08, -1.22, -.26);
  } else if (selected === "waving") {
    applyArmPose(bones, "R", -1.05, -.22, -1.28, -.16);
  } else if (selected === "seated") {
    applyArmPose(bones, "L", .12, -.34, -.72);
    applyArmPose(bones, "R", -.12, -.34, -.72);
    for (const side of ["L", "R"] as const) {
      const label = side === "L" ? "left" : "right";
      const upper = findBone(bones, `UpperLeg.${side}`, `UpperLeg_${side}`, `${label}UpperLeg`, `thigh.${side}`);
      const lower = findBone(bones, `LowerLeg.${side}`, `LowerLeg_${side}`, `${label}LowerLeg`, `shin.${side}`);
      if (upper) upper.rotation.x += 1.28;
      if (lower) lower.rotation.x -= 1.42;
    }
  }
  instance.userData.authoredHumanPose = selected;
  instance.updateMatrixWorld(true);
}

function normalizeHeight(instance: THREE.Group, targetHeight: number) {
  const bounds = new THREE.Box3().setFromObject(instance);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height < .01) return;
  instance.scale.multiplyScalar(targetHeight / height);
  instance.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3().setFromObject(instance);
  instance.position.y -= scaledBounds.min.y;
}

function disposeInstance(instance: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  instance.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach(material => materials.add(material));
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

function releaseFallback(state: HydrationState) {
  state.fallbackChildren.forEach(child => {
    child.removeFromParent();
    disposeInstance(child);
  });
  state.fallbackChildren.length = 0;
  state.fallbackTextures.forEach(texture => {
    const index = state.ownedTextures.indexOf(texture);
    if (index >= 0) state.ownedTextures.splice(index, 1);
    texture.dispose();
  });
  state.fallbackTextures.length = 0;
}

function clearHostGeometry(host: THREE.Group) {
  for (const child of [...host.children]) {
    child.removeFromParent();
    disposeInstance(child);
  }
}

function replaceFallbackWithAuthored(host: THREE.Group, state: HydrationState, instance: THREE.Group) {
  releaseFallback(state);
  // The character root is a private render container. Clear any procedural
  // child attached after hydration started too, so the authored body is the
  // only visible character geometry rather than a layer over old primitives.
  clearHostGeometry(host);
  host.add(instance);
  host.visible = true;
  host.userData.authoredHumanExclusive = true;
  host.userData.authoredHumanVisibleRoots = 1;
}

async function hydrate(
  host: THREE.Group,
  options: PremiumHumanOptions,
  state: HydrationState,
) {
  const archetype = archetypeFor(options), preferredLod = lodFor(options.quality);
  const preferredUrl = `${AUTHORED_HUMAN_ROOT}/${archetype}-${preferredLod}.glb`;
  const fallbackUrl = `${AUTHORED_HUMAN_ROOT}/${archetype}-${preferredLod === "lod0" ? "lod2" : "lod0"}.glb`;
  host.userData.authoredHumanArchetype = archetype;
  host.userData.authoredHumanLod = preferredLod;
  host.userData.authoredHumanStatus = "loading";

  let pendingInstance: THREE.Group | undefined;
  try {
    const [loadedTemplate, skinAtlas, clothAtlas] = await Promise.all([
      loadTemplate(preferredUrl)
        .then(template => ({ template, lod: preferredLod }))
        .catch(() => loadTemplate(fallbackUrl).then(template => ({
          template,
          lod: preferredLod === "lod0" ? "lod2" as const : "lod0" as const,
        }))),
      loadAtlas(SKIN_ATLAS_URL),
      loadAtlas(CLOTH_ATLAS_URL),
    ]);
    if (state.disposed || host.userData.authoredHumanDisposed) return;

    const wardrobe = positiveModulo(options.clothingVariant ?? options.variant, 20);
    const textures = {
      skin: atlasTile(skinAtlas, SKIN_ATLAS_URL, skinTileFor(options.skin), options.quality),
      clothUpper: atlasTile(clothAtlas, CLOTH_ATLAS_URL, options.role === "attendant" ? 2 : wardrobe, options.quality),
      clothLower: atlasTile(clothAtlas, CLOTH_ATLAS_URL, options.role === "attendant" ? 0 : wardrobe + 2, options.quality),
    };
    const instance = uniqueInstance(loadedTemplate.template);
    pendingInstance = instance;
    instance.name = `authored-human-${archetype}`;
    remapMaterials(instance, options, textures);
    poseSkeleton(instance, options.pose);
    // Blender's authored bodies face -Y. The glTF Y-up conversion maps that
    // to +Z, while every existing game placement expects a -Z-facing model.
    // Rotate only the authored child so host transforms and interaction roots
    // remain compatible with the synchronous procedural implementation.
    instance.rotation.y = Math.PI;
    normalizeHeight(instance, options.role === "attendant" ? 2.5 : 2.43);
    if (state.disposed || host.userData.authoredHumanDisposed) {
      disposeInstance(instance);
      return;
    }

    state.hydrated = instance;
    pendingInstance = undefined;
    replaceFallbackWithAuthored(host, state, instance);
    host.animations = instance.animations;
    host.userData.authoredHumanLod = loadedTemplate.lod;
    host.userData.characterFidelity = loadedTemplate.lod === "lod0" ? "authored-photoreal" : "authored-mobile";
    host.userData.skinIntegration = "uv-wrapped-authored-anatomy";
    host.userData.authoredHumanStatus = "ready";
  } catch {
    if (pendingInstance) disposeInstance(pendingInstance);
    // Never reveal the disconnected procedural construction rig. A missing or
    // unsupported authored asset suppresses this NPC instead of flashing the
    // legacy face, limbs, clothing, hair, or accessories into the scene.
    releaseFallback(state);
    clearHostGeometry(host);
    host.visible = false;
    host.userData.authoredHumanVisibleRoots = 0;
    host.userData.authoredHumanStatus = "authored-load-failed";
  }
}

/**
 * Starts an authored GLB replacement without changing the synchronous world
 * construction API. Procedural children are retained only as invisible transform
 * scaffolding until the GLB and atlases decode; only authored geometry is shown.
 */
export function hydrateAuthoredHuman(host: THREE.Group, options: PremiumHumanOptions, ownedTextures: THREE.Texture[]) {
  // Hide synchronously before the host can be attached to a world. This closes
  // the loading-frame window that previously exposed primitive remnants over
  // the face and across the full body.
  host.visible = false;
  host.userData.authoredHumanVisibleRoots = 0;
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const state: HydrationState = {
    disposed: false,
    fallbackChildren: [...host.children],
    fallbackTextures: [...ownedTextures],
    ownedTextures,
  };
  hydrationStates.set(host, state);
  host.userData.premiumHumanRoot = true;
  void hydrate(host, options, state);
}

/**
 * Marks a streamed character as dead before its world disposes geometry. This
 * prevents a pending GLB request from attaching resources to a detached world.
 * It is safe to call whether loading has completed or not.
 */
export function markAuthoredHumanDisposed(host: THREE.Group) {
  host.userData.authoredHumanDisposed = true;
  const state = hydrationStates.get(host);
  if (!state || state.disposed) return;
  state.disposed = true;
  if (state.hydrated) {
    host.remove(state.hydrated);
    disposeInstance(state.hydrated);
    state.hydrated = undefined;
  }
  host.animations = [];
  hydrationStates.delete(host);
}

/** Marks every premium human below a streamed world root before teardown. */
export function markAuthoredHumansDisposed(root: THREE.Object3D) {
  root.traverse(object => {
    if (object instanceof THREE.Group && object.userData.premiumHumanRoot) markAuthoredHumanDisposed(object);
  });
}
