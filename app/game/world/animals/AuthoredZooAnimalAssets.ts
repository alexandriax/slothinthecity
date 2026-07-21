import * as THREE from "three";
import type { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export type AuthoredZooAnimalSpecies =
  | "gary-polar-bear"
  | "spider-monkey"
  | "sun-conure"
  | "california-sea-lion"
  | "mallard-duck"
  | "whiskers-cat";
export type AuthoredZooAnimalLod = "lod0" | "lod1" | "lod2";
export type AuthoredZooAnimalMotion =
  | "idle"
  | "walk"
  | "forage"
  | "turn"
  | "perch"
  | "climb"
  | "swing"
  | "short-flight"
  | "landing-settle"
  | "preen"
  | "swim"
  | "surface"
  | "dive"
  | "pounce";

export type AuthoredZooAnimalAssetContract = {
  bytes: number;
  file: string;
  materials: number;
  meshes: number;
  sha256: string;
  triangles: number;
  vertices: number;
};

export type AuthoredZooAnimalTextureContract = {
  bytes: number;
  embedded: true;
  embeddedImage: string;
  height: number;
  kind: "albedo" | "normal" | "roughness" | "orm";
  sha256: string;
  sourceFile: string;
  width: number;
};

export type AuthoredZooAnimalSpeciesContract = {
  id: AuthoredZooAnimalSpecies;
  commonName: string;
  sourceFacing: "+z" | "-z";
  targetHeightMeters: number;
  groundOffsetMeters?: number;
  license: "Project-original";
  source: {
    blendBytes: number;
    blendFile: string;
    blendSha256: string;
    generator: string;
    method: string;
    referenceUse: "visual-reference-only";
  };
  lod0: AuthoredZooAnimalAssetContract;
  lod1?: AuthoredZooAnimalAssetContract;
  lod2?: AuthoredZooAnimalAssetContract;
  clips: Partial<Record<AuthoredZooAnimalMotion, string[]>>;
  textures: AuthoredZooAnimalTextureContract[];
};

export type AuthoredZooAnimalManifest = {
  schemaVersion: 1;
  generator: string;
  species: AuthoredZooAnimalSpeciesContract[];
};

export type AuthoredZooAnimalOptions = {
  species: AuthoredZooAnimalSpecies;
  quality: number;
  defaultMotion?: AuthoredZooAnimalMotion;
  phaseOffset?: number;
};

export type AuthoredZooAnimalRigContract = {
  root: THREE.Group;
  ownedTextures?: THREE.Texture[];
  update(elapsed: number, delta: number): void;
};

export type AuthoredZooAnimalDebugState = {
  activeClip?: string;
  animationClips: string[];
  bones: number;
  contract?: Pick<AuthoredZooAnimalAssetContract, "materials" | "meshes" | "triangles" | "vertices">;
  error?: string;
  lod?: AuthoredZooAnimalLod;
  meshes: number;
  skinnedMeshes: number;
  species?: AuthoredZooAnimalSpecies;
  status: string;
  triangles: number;
  vertices: number;
  visibleAuthoredRoots: number;
};

type AnimalTemplate = {
  animations: THREE.AnimationClip[];
  scene: THREE.Group;
};

type LoadedTemplate = {
  contract: AuthoredZooAnimalAssetContract;
  lod: AuthoredZooAnimalLod;
  species: AuthoredZooAnimalSpeciesContract;
  template: AnimalTemplate;
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
    requestedMotion?: AuthoredZooAnimalMotion;
    requestedSeconds: number;
  };
  options: AuthoredZooAnimalOptions;
  ownedTextures: THREE.Texture[];
  contract?: AuthoredZooAnimalAssetContract;
  species?: AuthoredZooAnimalSpeciesContract;
};

const AUTHORED_ZOO_ANIMAL_ROOT = "/game/animals/authored";
const DRACO_DECODER_ROOT = "/game/draco/";
// This runtime allowlist is intentionally independent from the published
// manifest. A stale or accidentally broadened manifest must not make a
// visually rejected study loadable in production.
const APPROVED_AUTHORED_ZOO_ANIMAL_SPECIES = new Set<AuthoredZooAnimalSpecies>([
  "gary-polar-bear",
  "spider-monkey",
  "california-sea-lion",
  "sun-conure",
  "mallard-duck",
  "whiskers-cat",
]);

const templatePromises = new Map<string, Promise<AnimalTemplate>>();
const hydrationStates = new WeakMap<THREE.Group, HydrationState>();
let manifestPromise: Promise<AuthoredZooAnimalManifest> | undefined;
let sharedGltfLoader: GLTFLoader | undefined;
let gltfLoaderPromise: Promise<GLTFLoader> | undefined;
let cloneSkeleton: typeof import("three/addons/utils/SkeletonUtils.js").clone | undefined;

async function createLoader() {
  if (sharedGltfLoader) return sharedGltfLoader;
  // These modules resolve their decoder resources from import.meta.url. Keep
  // them out of server/static geometry bundles and load only in the browser
  // after the host has already been hidden.
  gltfLoaderPromise ??= Promise.all([
      import("three/addons/loaders/DRACOLoader.js"),
      import("three/addons/loaders/GLTFLoader.js"),
      import("three/addons/utils/SkeletonUtils.js"),
    ]).then(([{ DRACOLoader }, { GLTFLoader }, skeletonUtils]) => {
      const draco = new DRACOLoader();
      draco.setDecoderPath(DRACO_DECODER_ROOT);
      draco.setWorkerLimit(2);
      const loader = new GLTFLoader();
      loader.setDRACOLoader(draco);
      cloneSkeleton = skeletonUtils.clone;
      sharedGltfLoader = loader;
      return loader;
    });
  return gltfLoaderPromise;
}

function loadManifest() {
  manifestPromise ??= fetch(`${AUTHORED_ZOO_ANIMAL_ROOT}/manifest.json`, { cache: "no-cache" })
    .then(async response => {
      if (!response.ok) throw new Error(`Authored zoo animal manifest returned ${response.status}`);
      const manifest = await response.json() as AuthoredZooAnimalManifest;
      if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.species)) {
        throw new Error("Authored zoo animal manifest has an unsupported schema");
      }
      return manifest;
    })
    .catch(error => {
      manifestPromise = undefined;
      throw error;
    });
  return manifestPromise;
}

function versionedAssetUrl(contract: AuthoredZooAnimalAssetContract) {
  const revision = contract.sha256.slice(0, 12);
  return `${AUTHORED_ZOO_ANIMAL_ROOT}/${contract.file}${revision ? `?v=${revision}` : ""}`;
}

function loadTemplate(url: string) {
  let promise = templatePromises.get(url);
  if (!promise) {
    promise = createLoader().then(loader => new Promise<AnimalTemplate>((resolve, reject) => {
        loader.load(
          url,
          gltf => resolve({ animations: gltf.animations, scene: gltf.scene }),
          undefined,
          reject,
        );
      }));
    templatePromises.set(url, promise);
    void promise.catch(() => {
      if (templatePromises.get(url) === promise) templatePromises.delete(url);
    });
  }
  return promise;
}

function preferredLod(quality: number): AuthoredZooAnimalLod {
  return quality >= .82 ? "lod0" : quality >= .6 ? "lod1" : "lod2";
}

function availableLods(species: AuthoredZooAnimalSpeciesContract, quality: number) {
  const preferred = preferredLod(quality);
  const order: AuthoredZooAnimalLod[] = preferred === "lod0"
    ? ["lod0", "lod1", "lod2"]
    : preferred === "lod1"
      ? ["lod1", "lod2", "lod0"]
      : ["lod2", "lod1", "lod0"];
  return order.flatMap(lod => {
    const contract = species[lod];
    return contract ? [{ contract, lod }] : [];
  });
}

async function loadSpeciesTemplate(speciesId: AuthoredZooAnimalSpecies, quality: number): Promise<LoadedTemplate> {
  if (!APPROVED_AUTHORED_ZOO_ANIMAL_SPECIES.has(speciesId)) {
    throw new Error(`Authored zoo animal ${speciesId} has not passed visual approval`);
  }
  const manifest = await loadManifest();
  const species = manifest.species.find(candidate => candidate.id === speciesId);
  if (!species) throw new Error(`Authored zoo animal ${speciesId} is absent from the manifest`);
  const candidates = availableLods(species, quality);
  if (!candidates.length) throw new Error(`Authored zoo animal ${speciesId} has no packaged LOD`);

  let previousError: unknown;
  for (const candidate of candidates) {
    try {
      const template = await loadTemplate(versionedAssetUrl(candidate.contract));
      return { ...candidate, species, template };
    } catch (error) {
      previousError = error;
    }
  }
  throw previousError ?? new Error(`Authored zoo animal ${speciesId} could not be loaded`);
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

function uniqueInstance(template: AnimalTemplate) {
  if (!cloneSkeleton) throw new Error("Authored zoo animal skeleton utilities are unavailable");
  const instance = cloneSkeleton(template.scene) as THREE.Group;
  const materialClones = new Map<THREE.Material, THREE.Material>();
  const cloneMaterial = (material: THREE.Material) => {
    let cloned = materialClones.get(material);
    if (!cloned) {
      cloned = material.clone();
      materialClones.set(material, cloned);
    }
    return cloned;
  };
  instance.animations = template.animations.map(clip => clip.clone());
  instance.userData.authoredZooAnimalAnimationNames = instance.animations.map(clip => clip.name);
  instance.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    // Streamed worlds dispose their own render resources. Keep each instance
    // independent from the cached decode and every other animal instance.
    object.geometry = object.geometry.clone();
    object.material = Array.isArray(object.material)
      ? object.material.map(cloneMaterial)
      : cloneMaterial(object.material);
    object.castShadow = true;
    object.receiveShadow = true;
    object.frustumCulled = true;
  });
  return instance;
}

function assertAuthoredRig(
  instance: THREE.Group,
  species: AuthoredZooAnimalSpeciesContract,
  contract: AuthoredZooAnimalAssetContract,
) {
  let skinnedMeshes = 0;
  let boneCount = 0;
  let meshes = 0;
  let triangles = 0;
  let hasAlbedo = false, hasNormal = false, hasRoughness = false;
  const materials = new Set<THREE.Material>();
  instance.traverse(object => {
    if (object instanceof THREE.SkinnedMesh) skinnedMeshes++;
    if (object instanceof THREE.Bone) boneCount++;
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    const positions = object.geometry.getAttribute("position")?.count ?? 0;
    triangles += object.geometry.index ? object.geometry.index.count / 3 : positions / 3;
    const meshMaterials = Array.isArray(object.material) ? object.material : [object.material];
    meshMaterials.forEach(material => {
      materials.add(material);
      if (!(material instanceof THREE.MeshStandardMaterial)) return;
      hasAlbedo ||= Boolean(material.map);
      hasNormal ||= Boolean(material.normalMap);
      hasRoughness ||= Boolean(material.roughnessMap);
    });
  });
  if (!skinnedMeshes || !boneCount) throw new Error(`${species.id} is not a skinned authored animal`);
  if (!instance.animations.length) throw new Error(`${species.id} has no animation clips`);
  if (Math.round(triangles) !== contract.triangles || meshes !== contract.meshes || materials.size !== contract.materials) {
    throw new Error(
      `${species.id} does not match its reviewed geometry contract `
      + `(runtime ${Math.round(triangles)} tris/${meshes} meshes/${materials.size} materials; `
      + `manifest ${contract.triangles}/${contract.meshes}/${contract.materials})`,
    );
  }
  if (!hasAlbedo || !hasNormal || !hasRoughness) {
    throw new Error(`${species.id} is missing an authored albedo, normal, or roughness map`);
  }
  const available = new Set(instance.animations.map(clip => clip.name));
  for (const [motion, aliases] of Object.entries(species.clips)) {
    if (!aliases?.some(alias => available.has(alias))) {
      throw new Error(`${species.id} does not provide its declared ${motion} clip`);
    }
  }
}

function normalizeInstance(instance: THREE.Group, species: AuthoredZooAnimalSpeciesContract) {
  instance.rotation.y = species.sourceFacing === "+z" ? Math.PI : 0;
  instance.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(instance);
  const height = bounds.max.y - bounds.min.y;
  if (!Number.isFinite(height) || height < .01) throw new Error(`${species.id} has invalid authored bounds`);
  instance.scale.multiplyScalar(species.targetHeightMeters / height);
  instance.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3().setFromObject(instance);
  instance.position.y += (species.groundOffsetMeters ?? 0) - scaledBounds.min.y;
  instance.updateMatrixWorld(true);
}

function findClip(
  instance: THREE.Group,
  species: AuthoredZooAnimalSpeciesContract,
  motion: AuthoredZooAnimalMotion,
) {
  const aliases = species.clips[motion] ?? species.clips.idle ?? [];
  return aliases.flatMap(alias => instance.animations.filter(clip => clip.name === alias))[0]
    ?? instance.animations.find(clip => clip.name.toLowerCase().includes(motion))
    ?? instance.animations[0];
}

function startMotion(
  instance: THREE.Group,
  species: AuthoredZooAnimalSpeciesContract,
  motion: AuthoredZooAnimalMotion,
  state: HydrationState,
) {
  const clip = findClip(instance, species, motion);
  if (!clip) return;
  const mixer = new THREE.AnimationMixer(instance);
  const action = mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat, Infinity);
  action.time = THREE.MathUtils.euclideanModulo(state.options.phaseOffset ?? 0, Math.max(clip.duration, .001));
  action.enabled = true;
  action.play();
  mixer.update(0);
  state.motion = {
    action,
    clipName: clip.name,
    mixer,
    requestedMotion: motion,
    requestedSeconds: 0,
  };
}

function replaceFallbackWithAuthored(host: THREE.Group, state: HydrationState, instance: THREE.Group) {
  releaseFallback(state);
  clearHostGeometry(host);
  host.add(instance);
  host.visible = true;
  host.userData.authoredZooAnimalExclusive = true;
  host.userData.authoredZooAnimalVisibleRoots = 1;
}

async function hydrate(host: THREE.Group, state: HydrationState) {
  let pendingInstance: THREE.Group | undefined;
  try {
    const loaded = await loadSpeciesTemplate(state.options.species, state.options.quality);
    if (state.disposed || host.userData.authoredZooAnimalDisposed) return;
    const instance = uniqueInstance(loaded.template);
    pendingInstance = instance;
    instance.name = `authored-zoo-animal-${loaded.species.id}`;
    assertAuthoredRig(instance, loaded.species, loaded.contract);
    // Evaluate the authored neutral clip before measuring the animal. This
    // prevents a crouched or extended bind pose from changing its world scale
    // as the first animation frame starts.
    startMotion(instance, loaded.species, state.options.defaultMotion ?? "idle", state);
    normalizeInstance(instance, loaded.species);
    if (state.disposed || host.userData.authoredZooAnimalDisposed) {
      state.motion?.mixer.stopAllAction();
      disposeInstance(instance);
      return;
    }

    state.hydrated = instance;
    state.contract = loaded.contract;
    state.species = loaded.species;
    pendingInstance = undefined;
    replaceFallbackWithAuthored(host, state, instance);
    host.animations = instance.animations;
    host.userData.animationStates = Object.keys(loaded.species.clips);
    host.userData.animalFidelity = "authored-skinned-glb";
    host.userData.authoredZooAnimalLod = loaded.lod;
    host.userData.authoredZooAnimalAssetRevision = loaded.contract.sha256;
    host.userData.authoredZooAnimalAssetUrl = versionedAssetUrl(loaded.contract);
    host.userData.authoredZooAnimalStatus = "ready";
  } catch (error) {
    state.motion?.mixer.stopAllAction();
    if (pendingInstance) disposeInstance(pendingInstance);
    // A failed decode must never reveal the old primitive construction. The
    // animal stays absent and publishes an inspectable status for debug QA.
    releaseFallback(state);
    clearHostGeometry(host);
    host.visible = false;
    host.userData.authoredZooAnimalVisibleRoots = 0;
    host.userData.authoredZooAnimalStatus = "authored-load-failed";
    host.userData.authoredZooAnimalError = error instanceof Error ? error.message : String(error);
  }
}

/**
 * Begins asynchronous authored-asset hydration while preserving the existing
 * synchronous world construction API. Legacy geometry is hidden on the same
 * tick and is used only as detached placement scaffolding until decode ends.
 */
export function hydrateAuthoredZooAnimal(
  host: THREE.Group,
  options: AuthoredZooAnimalOptions,
  ownedTextures: THREE.Texture[] = [],
) {
  host.visible = false;
  host.userData.premiumZooAnimalRoot = true;
  host.userData.authoredZooAnimalSpecies = options.species;
  host.userData.authoredZooAnimalRequestedLod = preferredLod(options.quality);
  host.userData.authoredZooAnimalVisibleRoots = 0;
  host.userData.authoredZooAnimalStatus = "loading";
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const state: HydrationState = {
    disposed: false,
    fallbackChildren: [...host.children],
    fallbackTextures: [...ownedTextures],
    options,
    ownedTextures,
  };
  hydrationStates.set(host, state);
  void hydrate(host, state);
}

/** Loads and decodes a species into the shared template cache before a world needs it. */
export async function preloadAuthoredZooAnimal(species: AuthoredZooAnimalSpecies, quality: number) {
  if (typeof window === "undefined") return;
  await loadSpeciesTemplate(species, quality);
}

export async function preloadAuthoredZooAnimals(
  requests: Array<{ species: AuthoredZooAnimalSpecies; quality: number }>,
) {
  await Promise.all(requests.map(request => preloadAuthoredZooAnimal(request.species, request.quality)));
}

/**
 * Advances a real skeletal clip. Returns true only after authored hydration,
 * allowing integration wrappers to retain Node-only procedural QA behavior.
 */
export function updateAuthoredZooAnimalMotion(
  host: THREE.Group,
  delta: number,
  motion: AuthoredZooAnimalMotion,
  speed = 1,
) {
  const state = hydrationStates.get(host);
  const instance = state?.hydrated;
  const species = state?.species;
  if (!state || state.disposed || !instance || !species || !instance.animations.length) return false;
  const clip = findClip(instance, species, motion);
  if (!clip) return false;
  state.motion ??= { mixer: new THREE.AnimationMixer(instance), requestedSeconds: 0 };
  if (state.motion.requestedMotion !== motion) {
    state.motion.requestedMotion = motion;
    state.motion.requestedSeconds = 0;
  } else {
    state.motion.requestedSeconds += Math.min(Math.max(delta, 0), .08);
  }
  const settleSeconds = motion === "walk" || motion === "climb" || motion === "swing" || motion === "short-flight" || motion === "swim" || motion === "dive" ? .08 : .15;
  if (state.motion.clipName && state.motion.clipName !== clip.name && state.motion.requestedSeconds < settleSeconds) {
    state.motion.mixer.update(Math.min(Math.max(delta, 0), .08));
    return true;
  }
  if (state.motion.clipName !== clip.name) {
    const next = state.motion.mixer.clipAction(clip).reset().setLoop(THREE.LoopRepeat, Infinity);
    next.time = THREE.MathUtils.euclideanModulo(state.options.phaseOffset ?? 0, Math.max(clip.duration, .001));
    next.enabled = true;
    next.fadeIn(.18).play();
    state.motion.action?.fadeOut(.18);
    state.motion.action = next;
    state.motion.clipName = clip.name;
    state.motion.requestedSeconds = 0;
  }
  state.motion.mixer.timeScale = THREE.MathUtils.clamp(speed, .35, 1.8);
  state.motion.mixer.update(Math.min(Math.max(delta, 0), .08));
  host.userData.authoredZooAnimalMotion = motion;
  return true;
}

/**
 * Adapts an existing synchronous zoo rig to authored loading. In browsers the
 * procedural update never runs; in Node it remains available to legacy static
 * geometry tests until those species are fully migrated.
 */
export function authorZooAnimalRig<T extends AuthoredZooAnimalRigContract>(
  rig: T,
  options: AuthoredZooAnimalOptions,
): AuthoredZooAnimalRigContract {
  hydrateAuthoredZooAnimal(rig.root, options, rig.ownedTextures ?? []);
  return {
    root: rig.root,
    ownedTextures: rig.ownedTextures,
    update(elapsed, delta) {
      if (typeof window === "undefined") {
        rig.update(elapsed, delta);
        return;
      }
      const requested = String(rig.root.userData.animationState ?? options.defaultMotion ?? "idle") as AuthoredZooAnimalMotion;
      const requestedSpeed = Number(rig.root.userData.animationSpeed ?? 1);
      updateAuthoredZooAnimalMotion(
        rig.root,
        delta,
        requested,
        Number.isFinite(requestedSpeed) ? requestedSpeed : 1,
      );
    },
  };
}

/** Read-only production metrics used by /debug/animals and visual QA. */
export function inspectAuthoredZooAnimal(host: THREE.Group): AuthoredZooAnimalDebugState {
  const state = hydrationStates.get(host);
  const instance = state?.hydrated;
  let bones = 0, meshes = 0, skinnedMeshes = 0, triangles = 0, vertices = 0;
  instance?.traverse(object => {
    if (object instanceof THREE.Bone) bones++;
    if (!(object instanceof THREE.Mesh)) return;
    meshes++;
    if (object instanceof THREE.SkinnedMesh) skinnedMeshes++;
    const positions = object.geometry.getAttribute("position")?.count ?? 0;
    vertices += positions;
    triangles += object.geometry.index ? object.geometry.index.count / 3 : positions / 3;
  });
  return {
    activeClip: state?.motion?.clipName,
    animationClips: instance?.animations.map(clip => clip.name) ?? [],
    bones,
    contract: state?.contract ? {
      materials: state.contract.materials,
      meshes: state.contract.meshes,
      triangles: state.contract.triangles,
      vertices: state.contract.vertices,
    } : undefined,
    error: host.userData.authoredZooAnimalError as string | undefined,
    lod: host.userData.authoredZooAnimalLod as AuthoredZooAnimalLod | undefined,
    meshes,
    skinnedMeshes,
    species: host.userData.authoredZooAnimalSpecies as AuthoredZooAnimalSpecies | undefined,
    status: String(host.userData.authoredZooAnimalStatus ?? "unmanaged"),
    triangles: Math.round(triangles),
    vertices,
    visibleAuthoredRoots: Number(host.userData.authoredZooAnimalVisibleRoots ?? 0),
  };
}

export function markAuthoredZooAnimalDisposed(host: THREE.Group) {
  host.userData.authoredZooAnimalDisposed = true;
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

/** Marks every authored animal below a streamed world before geometry teardown. */
export function markAuthoredZooAnimalsDisposed(root: THREE.Object3D) {
  root.traverse(object => {
    if (object instanceof THREE.Group && object.userData.premiumZooAnimalRoot) {
      markAuthoredZooAnimalDisposed(object);
    }
  });
}
