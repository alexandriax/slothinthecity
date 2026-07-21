import * as THREE from "three";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { clone as cloneSkeleton } from "three/addons/utils/SkeletonUtils.js";
import type { PremiumHumanOptions } from "../PremiumCharacter";

type HumanArchetype = "human-male-short" | "human-male-curly" | "human-female-bob" | "human-female-ponytail";
type HumanLod = "lod0" | "lod2";

type HumanTemplate = {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
};

type HumanManifest = {
  archetypes: Array<{
    id: HumanArchetype;
    lod0: { file: string; sha256: string };
    lod2: { file: string; sha256: string };
  }>;
};

type HydrationState = {
  disposed: boolean;
  fallbackChildren: THREE.Object3D[];
  fallbackTextures: THREE.Texture[];
  hydrated?: THREE.Group;
  motion?: {
    action?: THREE.AnimationAction;
    clipName?: string;
    mixer: THREE.AnimationMixer;
    requestedClipName?: string;
    requestedSeconds: number;
  };
  ownedTextures: THREE.Texture[];
  stationaryPose?: PremiumHumanOptions["pose"];
  gestureBones?: Array<{ bone: THREE.Bone; neutral: THREE.Quaternion }>;
};

export type AuthoredHumanMotion = "idle" | "walk";

const AUTHORED_HUMAN_ROOT = "/game/characters/authored";
const DRACO_DECODER_ROOT = "/game/draco/";
const SKIN_ATLAS_URL = "/game/characters/human-skin-pbr-v4.webp";
const CLOTH_ATLAS_URL = "/game/characters/human-cloth-pbr-v4.webp";
// Bounds include hair and footwear. These values preserve realistic stature
// after world-owned scale multipliers (the train uses .88) instead of making
// visitors brush a 2.72 m car ceiling as the former 2.43/2.5 m targets did.
const AUTHORED_VISITOR_HEIGHT_METERS = 2.04;
const AUTHORED_ATTENDANT_HEIGHT_METERS = 2.1;
const IDENTITY_HEIGHT = [.96, 1.025, .985, 1.04, .945, 1.015, .975, 1.05, .955, 1.0] as const;
const IDENTITY_WIDTH = [1.04, .96, 1.08, .93, 1.0, 1.055, .95, 1.02, .975, 1.065] as const;
const IDENTITY_DEPTH = [.98, 1.035, 1.02, .965, 1.045, .985, 1.025, .95, 1.01, 1.04] as const;

const templatePromises = new Map<string, Promise<HumanTemplate>>();
const atlasPromises = new Map<string, Promise<THREE.Texture>>();
// Texture transforms belong to Texture rather than Material in Three.js. A
// per-character clone would therefore create a new GPU upload of the complete
// atlas for every NPC. Cache cropped quadrants by tile and sampling tier for
// the application lifetime; the bounded set is shared by all streamed worlds.
const atlasTileTextures = new Map<string, THREE.Texture>();
const hydrationStates = new WeakMap<THREE.Group, HydrationState>();
let sharedGltfLoader: GLTFLoader | undefined;
let manifestPromise: Promise<HumanManifest | undefined> | undefined;

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

function identitySilhouette(options: PremiumHumanOptions) {
  const identity = positiveModulo(options.faceVariant ?? options.variant, 20);
  // The four source rigs provide topology and hairstyle compatibility; these
  // stable per-identity proportions stop a twenty-person crowd from collapsing
  // back into four same-height silhouettes after normalization.
  const profile = identity % IDENTITY_HEIGHT.length;
  const secondCohort = identity >= IDENTITY_HEIGHT.length;
  return {
    height: IDENTITY_HEIGHT[profile] * (secondCohort ? 1.012 : 1),
    width: IDENTITY_WIDTH[profile] * (secondCohort ? .985 : 1),
    depth: IDENTITY_DEPTH[profile] * (secondCohort ? 1.012 : 1),
  };
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

function loadManifest() {
  manifestPromise ??= fetch(`${AUTHORED_HUMAN_ROOT}/manifest.json`, { cache: "no-cache" })
    .then(response => {
      if (!response.ok) throw new Error(`Authored human manifest returned ${response.status}`);
      return response.json() as Promise<HumanManifest>;
    })
    // Static file hosts that omit the manifest still get the stable filenames;
    // the checked-in asset test guarantees those files remain complete.
    .catch(() => undefined);
  return manifestPromise;
}

function versionedAssetUrl(file: string, sha256?: string) {
  const revision = sha256?.slice(0, 12);
  return `${AUTHORED_HUMAN_ROOT}/${file}${revision ? `?v=${revision}` : ""}`;
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

function resolvedOutfit(options: PremiumHumanOptions) {
  if (options.outfit) return options.outfit;
  if (options.role === "attendant") return "zoo-uniform" as const;
  return positiveModulo(options.clothingVariant ?? options.variant, 3) === 0
    ? "cotton-denim" as const
    : positiveModulo(options.clothingVariant ?? options.variant, 3) === 1
      ? "silk-leggings" as const
      : "knit-chinos" as const;
}

function mappedMaterial(
  source: THREE.Material,
  options: PremiumHumanOptions,
  textures: { skin: THREE.Texture; clothUpper: THREE.Texture; clothLower: THREE.Texture },
) {
  const name = canonicalMaterialName(source);
  const outfit = resolvedOutfit(options);
  const physical = (parameters: THREE.MeshPhysicalMaterialParameters) => {
    const material = new THREE.MeshPhysicalMaterial(parameters);
    material.name = source.name;
    return material;
  };
  if (name.includes("skin")) return physical({
    // The atlas is a seamless pore/detail field, not a second identity color.
    // Using it as albedo made UV islands turn the face nearly black while the
    // neck stayed pale. Keep the caller's authored tone uniform and reuse the
    // shared atlas only for small-scale surface relief.
    bumpMap: textures.skin,
    bumpScale: .012,
    color: options.skin,
    roughness: .68,
    metalness: 0,
    clearcoat: .025,
    clearcoatRoughness: .86,
    sheen: .08,
  });
  if (name.includes("clothupper") || name.includes("uppercloth") || name.includes("jacket") || name.includes("shirt")) return physical({
    bumpMap: textures.clothUpper,
    bumpScale: outfit === "silk-leggings" ? .006 : .014,
    color: options.coat,
    roughness: outfit === "silk-leggings" ? .52 : outfit === "zoo-uniform" ? .74 : .88,
    metalness: 0,
    sheen: outfit === "silk-leggings" ? .62 : outfit === "zoo-uniform" ? .38 : .2,
    sheenRoughness: outfit === "silk-leggings" ? .48 : .76,
    clearcoat: outfit === "silk-leggings" ? .02 : 0,
    clearcoatRoughness: .68,
  });
  if (name.includes("clothlower") || name.includes("lowercloth") || name.includes("trouser") || name.includes("pants")) return physical({
    bumpMap: textures.clothLower,
    bumpScale: outfit === "silk-leggings" ? .005 : outfit === "cotton-denim" ? .022 : .014,
    color: options.trousers,
    roughness: outfit === "silk-leggings" ? .64 : outfit === "cotton-denim" ? .94 : .84,
    metalness: 0,
    sheen: outfit === "silk-leggings" ? .3 : outfit === "cotton-denim" ? .08 : .16,
    sheenRoughness: outfit === "silk-leggings" ? .62 : .82,
  });
  if (name.includes("hair")) return physical({
    color: options.hair ?? (positiveModulo(options.variant, 4) === 2 ? "#57402e" : "#201a17"),
    roughness: .72,
    metalness: 0,
    sheen: .62,
    sheenRoughness: .5,
    clearcoat: .018,
    clearcoatRoughness: .82,
  });
  if (name.includes("shoe") || name.includes("leather")) return physical({
    color: options.role === "attendant" ? "#111613" : "#2b211d",
    roughness: .7,
    metalness: 0,
    clearcoat: .08,
    clearcoatRoughness: .72,
  });
  if (name.includes("eyewhite") || name.includes("sclera")) return physical({
    // Real sclera is warm and vascular, never paper white. Pulling the value
    // down also keeps the large source eye opening from reading as a toy.
    color: "#d8d0c2",
    roughness: .48,
    clearcoat: .18,
    clearcoatRoughness: .42,
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

function addAuthoredAccessory(instance: THREE.Group, options: PremiumHumanOptions) {
  const kind = options.accessory ?? "none";
  if (kind === "none") return;
  const bounds = new THREE.Box3().setFromObject(instance);
  if (bounds.isEmpty()) return;
  const size = bounds.getSize(new THREE.Vector3()), height = size.y;
  const group = new THREE.Group();
  group.name = `authored-human-accessory-${kind}`;
  group.userData.authoredHumanAccessoryAnchor = "stable-authored-root";
  const darkMaterial = () => new THREE.MeshPhysicalMaterial({ color: "#202421", roughness: .58, metalness: .08, clearcoat: .16, clearcoatRoughness: .58 });
  const textileMaterial = (color = options.coat) => new THREE.MeshPhysicalMaterial({ color, roughness: .84, metalness: 0, sheen: .28, sheenRoughness: .7 });
  const metalMaterial = () => new THREE.MeshStandardMaterial({ color: "#aeb5b2", roughness: .28, metalness: .82 });
  const add = (mesh: THREE.Mesh) => { mesh.castShadow = options.quality > .7; mesh.receiveShadow = options.quality > .56; group.add(mesh); return mesh; };
  const addConnector = (start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material) => {
    const direction = end.clone().sub(start);
    const connector = add(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), 8), material));
    connector.position.copy(start).add(end).multiplyScalar(.5);
    connector.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return connector;
  };
  instance.updateMatrixWorld(true);
  const bones: THREE.Bone[] = [];
  instance.traverse(object => { if (object instanceof THREE.Bone) bones.push(object); });
  if (kind === "backpack") {
    const dark = darkMaterial(), textile = textileMaterial();
    const body = add(new THREE.Mesh(new RoundedBoxGeometry(height * .22, height * .29, height * .095, 4, height * .024), textile));
    body.position.set(0, bounds.min.y + height * .57, bounds.min.z - height * .04);
    const flap = add(new THREE.Mesh(new RoundedBoxGeometry(height * .18, height * .075, height * .018, 3, height * .01), dark));
    flap.position.set(0, bounds.min.y + height * .65, bounds.min.z - height * .095);
  } else if (kind === "camera") {
    const dark = darkMaterial(), metal = metalMaterial();
    const chest = findBone(bones, "Chest");
    const chestCenter = chest
      ? instance.worldToLocal(chest.getWorldPosition(new THREE.Vector3()))
      : new THREE.Vector3(0, bounds.min.y + height * .7, 0);
    const bodyY = bounds.min.y + height * .755;
    const bodyZ = chestCenter.z + height * .064;
    const body = add(new THREE.Mesh(new RoundedBoxGeometry(height * .12, height * .078, height * .046, 4, height * .01), dark));
    body.name = "authored-camera-body-resting-against-chest";
    body.position.set(chestCenter.x, bodyY, bodyZ);
    const lens = add(new THREE.Mesh(new THREE.CylinderGeometry(height * .026, height * .03, height * .036, 18), metal));
    lens.name = "authored-camera-lens-seated-in-body";
    lens.rotation.x = Math.PI / 2; lens.position.set(chestCenter.x, bodyY, bodyZ + height * .041);
    const strapTopY = bounds.min.y + height * .845, strapTopZ = chestCenter.z + height * .022;
    for (const side of [-1, 1]) {
      const strap = addConnector(
        new THREE.Vector3(chestCenter.x + side * height * .052, bodyY + height * .036, bodyZ - height * .008),
        new THREE.Vector3(chestCenter.x + side * height * .092, strapTopY, strapTopZ),
        height * .0035,
        dark,
      );
      strap.name = "authored-camera-full-neck-strap";
    }
    group.userData.authoredHumanAccessorySupport = "neck-strap-and-chest-contact";
  } else if (kind === "tote") {
    const dark = darkMaterial(), textile = textileMaterial(options.trousers);
    const side = options.variant % 2 ? -1 : 1;
    const bagWidth = height * .19, bagHeight = height * .21, bagDepth = height * .04;
    const bagShape = new THREE.Shape();
    bagShape.moveTo(-bagWidth * .5, -bagHeight * .5); bagShape.lineTo(bagWidth * .5, -bagHeight * .5);
    bagShape.lineTo(bagWidth * .43, bagHeight * .5); bagShape.lineTo(-bagWidth * .43, bagHeight * .5); bagShape.closePath();
    const bagGeometry = new THREE.ExtrudeGeometry(bagShape, { depth: bagDepth, bevelEnabled: true, bevelSegments: 2, bevelSize: height * .006, bevelThickness: height * .006 });
    bagGeometry.translate(0, 0, -bagDepth * .5);
    const bag = add(new THREE.Mesh(bagGeometry, textile));
    bag.position.set(side * (Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) + height * .055), bounds.min.y + height * .3, 0);
    const topY = bag.position.y + height * .11, handX = side * (Math.max(Math.abs(bounds.min.x), Math.abs(bounds.max.x)) + height * .006);
    const handleCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(bag.position.x - height * .06, topY, 0),
      new THREE.Vector3(handX, bounds.min.y + height * .49, 0),
      new THREE.Vector3(bag.position.x + height * .06, topY, 0),
    ]);
    add(new THREE.Mesh(new THREE.TubeGeometry(handleCurve, 18, height * .007, 8, false), dark));
  } else if (kind === "radio") {
    const dark = darkMaterial(), metal = metalMaterial();
    const radio = add(new THREE.Mesh(new RoundedBoxGeometry(height * .07, height * .115, height * .038, 3, height * .009), dark));
    radio.position.set(bounds.max.x + height * .018, bounds.min.y + height * .58, bounds.max.z * .35);
    const antenna = add(new THREE.Mesh(new THREE.CylinderGeometry(height * .004, height * .004, height * .09, 8), metal));
    antenna.position.set(radio.position.x + height * .022, radio.position.y + height * .09, radio.position.z);
  }
  instance.add(group);
  instance.updateMatrixWorld(true);
  let anchor: THREE.Bone | undefined;
  if (kind === "tote") {
    const center = new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3());
    anchor = bones
      .filter(bone => normalizedBoneName(bone).startsWith("hand"))
      .map(bone => ({ bone, distance: bone.getWorldPosition(new THREE.Vector3()).distanceTo(center) }))
      .sort((left, right) => left.distance - right.distance)[0]?.bone;
  } else if (kind === "radio") anchor = findBone(bones, "Hips");
  else anchor = findBone(bones, "Chest");
  if (anchor) {
    anchor.attach(group);
    group.userData.authoredHumanAccessoryAnchor = anchor.name;
  }
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
    applyArmPose(bones, "L", .18, -.7, -.96, .22);
    applyArmPose(bones, "R", -.18, -.7, -.96, -.22);
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

function captureStationaryGestureBones(instance: THREE.Group) {
  const gesturePattern = /^(upperarm|lowerarm|hand|head)/;
  const captured: Array<{ bone: THREE.Bone; neutral: THREE.Quaternion }> = [];
  instance.traverse(object => {
    if (!(object instanceof THREE.Bone)) return;
    if (!gesturePattern.test(normalizedBoneName(object))) return;
    captured.push({ bone: object, neutral: object.quaternion.clone() });
  });
  return captured;
}

function applyStationaryGesture(state: HydrationState, motion: AuthoredHumanMotion, activity: string) {
  const pose = state.stationaryPose;
  if (motion !== "idle" || !pose || pose === "neutral" || pose === "seated" || !state.gestureBones?.length) return;
  state.gestureBones.forEach(({ bone, neutral }) => bone.quaternion.copy(neutral));
  const bones = state.gestureBones.map(item => item.bone);
  if (pose === "checking-map") {
    if (activity !== "checking-route") return;
    applyArmPose(bones, "L", .18, -.78, -1.05, .18);
    applyArmPose(bones, "R", -.18, -.78, -1.05, -.18);
  } else if (pose === "photographing") {
    if (activity !== "photographing") return;
    // Cradle the strapped camera at sternum height. The former face-height
    // crossing pose magnified every digit and left both hands far above the
    // camera body, producing the fan of finger spikes seen in close QA.
    applyArmPose(bones, "L", .18, -.7, -.96, .22);
    applyArmPose(bones, "R", -.18, -.7, -.96, -.22);
  } else if (pose === "waving") {
    applyArmPose(bones, "R", -1.05, -.22, -1.28, -.16);
  }
}

function normalizeHeight(instance: THREE.Group, targetHeight: number, widthScale: number, depthScale: number) {
  const bounds = new THREE.Box3().setFromObject(instance);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height < .01) return;
  instance.scale.multiplyScalar(targetHeight / height);
  instance.scale.x *= widthScale;
  instance.scale.z *= depthScale;
  instance.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3().setFromObject(instance);
  instance.position.y -= scaledBounds.min.y;
}

function applyZooUniformShirtPrint(instance: THREE.Group, options: PremiumHumanOptions) {
  if (!options.zooNameTag) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = 1024; canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ffffff";
  context.textAlign = "center"; context.textBaseline = "middle";
  context.font = "700 70px Helvetica, Arial, sans-serif";
  context.fillText(options.zooNameTag.toUpperCase(), canvas.width / 2, canvas.height / 2, canvas.width - 36);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = `${options.zooNameTag}-integrated-shirt-print-texture`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = options.quality > .8 ? 8 : 4;
  texture.needsUpdate = true;

  const bounds = new THREE.Box3().setFromObject(instance);
  const bodyHeight = bounds.max.y - bounds.min.y;
  const printCenter = new THREE.Vector2(
    bounds.min.x + bodyHeight * .205,
    bounds.min.y + bodyHeight * .705,
  );
  const printSize = new THREE.Vector2(bodyHeight * .085, bodyHeight * .021);
  const printColor = new THREE.Color("#c6d4a7");
  let applied = false;
  instance.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => {
      if (!(material instanceof THREE.MeshPhysicalMaterial)) return;
      if (!canonicalMaterialName(material).includes("clothupper")) return;
      applied = true;
      material.userData.zooName = options.zooNameTag;
      material.userData.integratedShirtPrint = true;
      material.onBeforeCompile = shader => {
        shader.uniforms.zooPrintMap = { value: texture };
        shader.uniforms.zooPrintCenter = { value: printCenter };
        shader.uniforms.zooPrintSize = { value: printSize };
        shader.uniforms.zooPrintColor = { value: printColor };
        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vZooPrintPosition;\nvarying vec3 vZooPrintNormal;",
          )
          .replace(
            "#include <skinnormal_vertex>",
            "#include <skinnormal_vertex>\nvZooPrintNormal = objectNormal;",
          )
          .replace(
            "#include <skinning_vertex>",
            "#include <skinning_vertex>\nvZooPrintPosition = transformed;",
          );
        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform sampler2D zooPrintMap;\nuniform vec2 zooPrintCenter;\nuniform vec2 zooPrintSize;\nuniform vec3 zooPrintColor;\nvarying vec3 vZooPrintPosition;\nvarying vec3 vZooPrintNormal;",
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>
            vec2 zooPrintUv = (vZooPrintPosition.xy - zooPrintCenter) / zooPrintSize + vec2(0.5);
            float zooPrintBounds = step(0.0, zooPrintUv.x) * step(zooPrintUv.x, 1.0)
              * step(0.0, zooPrintUv.y) * step(zooPrintUv.y, 1.0);
            float zooPrintFront = smoothstep(0.30, 0.72, normalize(vZooPrintNormal).z);
            float zooPrintInk = texture2D(zooPrintMap, zooPrintUv).a * zooPrintBounds * zooPrintFront * 0.72;
            diffuseColor.rgb = mix(diffuseColor.rgb, zooPrintColor, zooPrintInk);`,
          );
      };
      material.customProgramCacheKey = () => "authored-zoo-uniform-integrated-print-v1";
      material.needsUpdate = true;
    });
  });
  return applied ? texture : undefined;
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

function seedNeutralAnimation(instance: THREE.Group, state: HydrationState) {
  const clip = instance.animations.find(candidate => candidate.name === "HumanIdle")
    ?? instance.animations.find(candidate => candidate.name.toLowerCase().includes("idle"));
  if (!clip) return;
  const mixer = new THREE.AnimationMixer(instance);
  const action = mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat, Infinity);
  action.enabled = true;
  action.play();
  mixer.update(0);
  state.motion = {
    action,
    clipName: clip.name,
    mixer,
    requestedClipName: clip.name,
    requestedSeconds: 0,
  };
}

async function hydrate(
  host: THREE.Group,
  options: PremiumHumanOptions,
  state: HydrationState,
) {
  const archetype = archetypeFor(options), preferredLod = lodFor(options.quality);
  host.userData.authoredHumanArchetype = archetype;
  host.userData.authoredHumanLod = preferredLod;
  host.userData.authoredHumanStatus = "loading";

  let pendingInstance: THREE.Group | undefined;
  try {
    const manifest = await loadManifest();
    const manifestEntry = manifest?.archetypes.find(entry => entry.id === archetype);
    const fallbackLod = preferredLod === "lod0" ? "lod2" : "lod0";
    const preferredContract = manifestEntry?.[preferredLod];
    const fallbackContract = manifestEntry?.[fallbackLod];
    const preferredUrl = versionedAssetUrl(preferredContract?.file ?? `${archetype}-${preferredLod}.glb`, preferredContract?.sha256);
    const fallbackUrl = versionedAssetUrl(fallbackContract?.file ?? `${archetype}-${fallbackLod}.glb`, fallbackContract?.sha256);
    host.userData.authoredHumanAssetRevision = preferredContract?.sha256 ?? "unversioned";
    host.userData.authoredHumanAssetUrl = preferredUrl;
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
    addAuthoredAccessory(instance, options);
    // Locomoting characters must begin from the authored neutral bind pose.
    // Layering the legacy map/phone/wave overrides under HumanWalk produced
    // doubled hands, long fingers, hunched shoulders and violent limb arcs.
    poseSkeleton(instance, host.userData.authoredHumanLocomotion ? "neutral" : options.pose);
    state.gestureBones = captureStationaryGestureBones(instance);
    const uniformShirtPrint = applyZooUniformShirtPrint(instance, options);
    if (uniformShirtPrint) state.ownedTextures.push(uniformShirtPrint);
    // Blender's authored bodies face -Y. The glTF Y-up conversion maps that
    // to +Z, while every existing game placement expects a -Z-facing model.
    // Rotate only the authored child so host transforms and interaction roots
    // remain compatible with the synchronous procedural implementation.
    instance.rotation.y = Math.PI;
    // Evaluate the authored neutral clip before sizing or revealing the model.
    // Otherwise the first rendered frame exposes the (historically hunched)
    // bind pose and the head appears to snap upright when motion first updates.
    seedNeutralAnimation(instance, state);
    const silhouette = identitySilhouette(options);
    const targetHeight = (options.role === "attendant"
      ? AUTHORED_ATTENDANT_HEIGHT_METERS
      : AUTHORED_VISITOR_HEIGHT_METERS) * silhouette.height;
    normalizeHeight(instance, targetHeight, silhouette.width, silhouette.depth);
    host.userData.authoredHumanTargetHeightMeters = targetHeight;
    host.userData.authoredHumanSilhouette = silhouette;
    // A seated host may be lowered by its world before asynchronous hydration
    // completes. Counter that world-space offset on the authored child so the
    // complete legs and feet remain above the floor rather than being clipped.
    if (options.pose === "seated" && host.position.y < 0) {
      const compensation = -host.position.y / Math.max(Math.abs(host.scale.y), .001);
      instance.position.y += compensation;
      instance.userData.authoredHumanGroundCompensation = compensation;
      instance.updateMatrixWorld(true);
    }
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
    stationaryPose: options.pose,
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
  state.motion?.mixer.stopAllAction();
  if (state.hydrated) {
    host.remove(state.hydrated);
    disposeInstance(state.hydrated);
    state.hydrated = undefined;
  }
  host.animations = [];
  hydrationStates.delete(host);
}

/**
 * Advances an authored character clip from world-space motion. Callers pass
 * their actual movement state, so feet cycle only while the NPC translates
 * instead of the former ice-skating/sliding presentation.
 */
export function updateAuthoredHumanMotion(
  host: THREE.Group,
  delta: number,
  motion: AuthoredHumanMotion,
  speed = 1,
  activity = "observing",
) {
  const state = hydrationStates.get(host);
  const hydrated = state?.hydrated;
  if (!state || state.disposed || !hydrated || !hydrated.animations.length) return;
  const desired = motion === "walk" ? "HumanWalk" : "HumanIdle";
  const clip = hydrated.animations.find(candidate => candidate.name === desired)
    ?? hydrated.animations.find(candidate => candidate.name.toLowerCase().includes(motion))
    ?? hydrated.animations[0];
  state.motion ??= { mixer: new THREE.AnimationMixer(hydrated), requestedSeconds: 0 };
  if (state.motion.requestedClipName !== clip.name) {
    state.motion.requestedClipName = clip.name;
    state.motion.requestedSeconds = 0;
  } else {
    state.motion.requestedSeconds += Math.min(Math.max(delta, 0), .08);
  }
  // Route easing and collision correction can move an otherwise stationary
  // NPC by fractions of a millimetre. A short hysteresis window prevents those
  // changes from restarting opposing crossfades every frame.
  const settleSeconds = motion === "walk" ? .1 : .18;
  if (state.motion.clipName && state.motion.clipName !== clip.name && state.motion.requestedSeconds < settleSeconds) {
    state.motion.mixer.update(Math.min(Math.max(delta, 0), .08));
    applyStationaryGesture(state, motion, activity);
    return;
  }
  if (state.motion.clipName !== clip.name) {
    const next = state.motion.mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat, Infinity);
    next.enabled = true;
    next.fadeIn(.16).play();
    state.motion.action?.fadeOut(.16);
    state.motion.action = next;
    state.motion.clipName = clip.name;
    state.motion.requestedSeconds = 0;
  }
  state.motion.mixer.timeScale = THREE.MathUtils.clamp(speed, .45, 1.65);
  state.motion.mixer.update(Math.min(Math.max(delta, 0), .08));
  applyStationaryGesture(state, motion, activity);
}

/**
 * Declares that a premium human will translate through the world. This is set
 * synchronously, before its GLB finishes loading, so hydration never applies a
 * static gesture underneath the walk cycle.
 */
export function prepareAuthoredHumanLocomotion(host: THREE.Group) {
  host.userData.authoredHumanLocomotion = true;
}

/** Marks every premium human below a streamed world root before teardown. */
export function markAuthoredHumansDisposed(root: THREE.Object3D) {
  root.traverse(object => {
    if (object instanceof THREE.Group && object.userData.premiumHumanRoot) markAuthoredHumanDisposed(object);
  });
}
