import * as THREE from "three";
import { markTextureCloneReadyAfterSource, type GameTextures } from "../rendering/textures";
import { authorZooAnimalRig } from "./animals/AuthoredZooAnimalAssets";

export type ZooAnimalRig = {
  root: THREE.Group;
  ownedTextures?: THREE.Texture[];
  update(elapsed: number, delta: number): void;
};

export type ZooAnimalMotionMode = "terrestrial" | "aquatic" | "arboreal" | "perch";

export type ZooHabitatMotionOptions = {
  mode: ZooAnimalMotionMode;
  radius: number;
  animationSpeed?: number;
  speed?: number;
  phase?: number;
  verticalRange?: number;
  floorHeight?: (x: number, z: number) => number;
};

export type ZooAnimalEnrichmentDirective = {
  heading?: readonly [number, number];
  motion: "swim" | "surface";
  offset: readonly [number, number, number];
  responsiveness?: number;
  target: THREE.Object3D;
};

const zooAnimalEnrichmentDirectives = new WeakMap<THREE.Object3D, ZooAnimalEnrichmentDirective>();

/**
 * Temporarily hands an autonomous habitat animal a live world target without
 * putting an Object3D reference in userData (which would make Three.js scene
 * serialization recursive). Clearing the directive lets the animal blend
 * back onto its authored ambient route.
 */
export function setZooAnimalEnrichmentDirective(rig: ZooAnimalRig, directive: ZooAnimalEnrichmentDirective | null) {
  if (!directive) {
    zooAnimalEnrichmentDirectives.delete(rig.root);
    rig.root.userData.enrichmentActive = false;
    delete rig.root.userData.enrichmentTargetName;
    return;
  }
  zooAnimalEnrichmentDirectives.set(rig.root, directive);
  rig.root.userData.enrichmentTargetName = directive.target.name;
}

type BirdPalette = {
  breast: string;
  crown: string;
  wing: string;
  tail: string;
};

export type ZooAnimalGeometryMetrics = {
  triangles: number;
  vertices: number;
  meshes: number;
  articulatedJoints: number;
};

/**
 * Runtime fidelity audit used by the zoo QA route and regression tests. The
 * authored human LOD0s establish the close-camera comparison bar. Production
 * animals now report their imported manifest geometry independently because
 * silhouette needs vary substantially by species and fur/skin treatment.
 */
export function measureZooAnimalGeometry(root: THREE.Object3D): ZooAnimalGeometryMetrics {
  const metrics: ZooAnimalGeometryMetrics = { triangles: 0, vertices: 0, meshes: 0, articulatedJoints: 0 };
  root.traverse(object => {
    if (object instanceof THREE.Mesh) {
      const geometry = object.geometry;
      metrics.meshes++;
      metrics.vertices += geometry.getAttribute("position")?.count ?? 0;
      metrics.triangles += geometry.index ? geometry.index.count / 3 : (geometry.getAttribute("position")?.count ?? 0) / 3;
    }
    if (object instanceof THREE.Group && /pivot|joint|shoulder|hip|neck/i.test(object.name)) metrics.articulatedJoints++;
  });
  metrics.triangles = Math.round(metrics.triangles);
  return metrics;
}

function qualitySegments(quality: number, high = 48, medium = 32, low = 18) {
  return quality > .86 ? high : quality > .62 ? medium : low;
}

function stampPremiumAnimal(root: THREE.Group, animationStates: string[]) {
  root.userData.animalFidelity = "articulated-procedural-v2";
  root.userData.animationStates = animationStates;
  root.userData.geometryMetrics = measureZooAnimalGeometry(root);
}

function glossyEye(radius: number, irisColor = "#1a130b") {
  const root = new THREE.Group();
  root.name = "anatomical-eye-with-cornea";
  const iris = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshPhysicalMaterial({ color: irisColor, roughness: .12, clearcoat: .72, clearcoatRoughness: .12 }));
  iris.name = "single-natural-cornea";
  root.add(iris);
  return root;
}

function addTaperedEar(
  parent: THREE.Object3D,
  surface: THREE.Material,
  innerSurface: THREE.Material,
  position: THREE.Vector3,
  scale: THREE.Vector3,
  rotationZ = 0,
) {
  const pivot = new THREE.Group();
  pivot.name = "articulated-ear-pivot";
  pivot.position.copy(position);
  pivot.rotation.z = rotationZ;
  const outer = new THREE.Mesh(new THREE.ConeGeometry(1, 2, 20, 4), surface);
  outer.scale.copy(scale);
  pivot.add(outer);
  const inner = new THREE.Mesh(new THREE.ConeGeometry(.68, 1.5, 18, 3), innerSurface);
  inner.name = "recessed-inner-ear";
  inner.position.set(0, -.08 * scale.y, -.68 * scale.z);
  inner.scale.copy(scale);
  pivot.add(inner);
  parent.add(pivot);
  return pivot;
}

function taperedSweepGeometry(points: THREE.Vector3[], radii: number[], tubularSegments: number, radialSegments: number) {
  const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
  const frames = curve.computeFrenetFrames(tubularSegments, false), ring = radialSegments + 1;
  const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), offset = new THREE.Vector3();
  for (let segment = 0; segment <= tubularSegments; segment++) {
    const t = segment / tubularSegments, radiusPosition = t * (radii.length - 1);
    const radiusIndex = Math.min(radii.length - 2, Math.floor(radiusPosition));
    const radius = THREE.MathUtils.lerp(radii[radiusIndex], radii[radiusIndex + 1], THREE.MathUtils.smootherstep(radiusPosition - radiusIndex, 0, 1));
    curve.getPointAt(t, point);
    for (let radial = 0; radial <= radialSegments; radial++) {
      const u = radial / radialSegments, angle = u * Math.PI * 2;
      offset.copy(frames.normals[segment]).multiplyScalar(Math.cos(angle) * radius).addScaledVector(frames.binormals[segment], Math.sin(angle) * radius);
      positions.push(point.x + offset.x, point.y + offset.y, point.z + offset.z);
      normal.copy(offset).normalize(); normals.push(normal.x, normal.y, normal.z); uvs.push(u, t);
      if (segment < tubularSegments && radial < radialSegments) {
        const current = segment * ring + radial, next = current + ring;
        indices.push(current, next, current + 1, current + 1, next, next + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeBoundingSphere();
  return geometry;
}

function articulatedSweep(
  name: string,
  position: THREE.Vector3,
  points: THREE.Vector3[],
  radii: number[],
  surface: THREE.Material,
  quality: number,
) {
  const pivot = new THREE.Group();
  pivot.name = `${name}-articulated-joint-pivot`;
  pivot.position.copy(position);
  const sweep = new THREE.Mesh(taperedSweepGeometry(points, radii, quality > .86 ? 28 : quality > .62 ? 20 : 14, quality > .86 ? 18 : quality > .62 ? 14 : 10), surface);
  sweep.name = `${name}-continuous-anatomical-sweep`;
  pivot.add(sweep);
  return pivot;
}

export function cloneZooAnimalAtlasCell(textures: GameTextures, column: 0 | 1 | 2, rowFromTop: 0 | 1 | 2, name: string) {
  const texture = new THREE.Texture();
  texture.source = textures.zooAnimalAtlas.source;
  texture.name = `zoo-animal-atlas-${name}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.repeat.set(1 / 3, 1 / 3);
  // Texture V origins are bottom-left; atlas rows are documented top-down.
  texture.offset.set(column / 3, (2 - rowFromTop) / 3);
  markTextureCloneReadyAfterSource(texture, textures.zooAnimalAtlas);
  return texture;
}

/**
 * Wraps a species rig in deterministic habitat locomotion. Each animal cycles
 * through at least three readable states without physics, random teleports, or
 * route drift beyond its authored enclosure.
 */
export function configureAutonomousZooAnimal(rig: ZooAnimalRig, options: ZooHabitatMotionOptions): ZooAnimalRig {
  const origin = rig.root.position.clone(), baseYaw = rig.root.rotation.y;
  const phase = options.phase ?? rig.root.name.length * .37, speed = options.speed ?? .24;
  const radius = Math.max(.12, options.radius), verticalRange = options.verticalRange ?? 1.8;
  let travelClock = phase * .17;
  let initialized = false;
  let enrichmentBlend = 0;
  const tangent = new THREE.Vector3(), next = new THREE.Vector3();
  const enrichmentTarget = new THREE.Vector3(), enrichmentDesired = new THREE.Vector3();
  return {
    root: rig.root,
    ownedTextures: rig.ownedTextures,
    update(elapsed, delta) {
      const cycle = ((elapsed + phase) % 18 + 18) % 18;
      const locomoting = options.mode === "aquatic" ? cycle < 13.2 : options.mode === "arboreal" ? cycle > 3.1 && cycle < 12.8 : options.mode === "perch" ? cycle > 11.6 && cycle < 14.4 : cycle > 3.4 && cycle < 12.7;
      let state = options.mode === "aquatic"
        ? locomoting ? "swim" : cycle < 15.2 ? "surface" : "dive"
        : options.mode === "arboreal"
          ? locomoting ? "swing" : cycle < 3.1 ? "perch" : "forage"
          : options.mode === "perch"
            ? locomoting ? "short-flight" : cycle < 6.8 ? "perch" : "preen"
            : locomoting ? "walk" : cycle < 3.4 ? "idle" : "forage";
      rig.root.userData.animationState = state;
      if (options.mode === "aquatic") travelClock += delta * speed * (state === "swim" ? 1 : state === "dive" ? .46 : .14);
      else if (locomoting) travelClock += delta * speed;
      const angle = travelClock + phase;
      if (!initialized) {
        if (options.mode === "aquatic") {
          origin.x -= Math.cos(angle) * radius; origin.z -= Math.sin(angle) * radius * .68;
        } else if (options.mode === "arboreal") {
          origin.x -= Math.sin(angle) * radius; origin.y -= Math.abs(Math.cos(angle)) * verticalRange; origin.z -= Math.sin(angle * .63) * radius * .3;
        } else if (options.mode === "perch") {
          const initialFlight = state === "short-flight" ? Math.sin(((cycle - 11.6) / 2.8) * Math.PI) : 0;
          origin.x -= Math.sin(angle * 2) * radius * initialFlight; origin.y -= initialFlight * verticalRange; origin.z -= Math.cos(angle * 1.7) * radius * .45 * initialFlight;
        } else {
          origin.x -= Math.cos(angle) * radius; origin.z -= Math.sin(angle) * radius * .68;
        }
        initialized = true;
      }
      if (options.mode === "aquatic") {
        rig.root.position.set(origin.x + Math.cos(angle) * radius, origin.y + Math.sin(elapsed * 1.4 + phase) * .09 - (state === "dive" ? .42 : 0), origin.z + Math.sin(angle) * radius * .68);
        next.set(origin.x + Math.cos(angle + .02) * radius, rig.root.position.y, origin.z + Math.sin(angle + .02) * radius * .68);
      } else if (options.mode === "arboreal") {
        const swing = Math.sin(angle) * radius;
        rig.root.position.set(origin.x + swing, origin.y + Math.abs(Math.cos(angle)) * verticalRange + (state === "forage" ? -.2 : 0), origin.z + Math.sin(angle * .63) * radius * .3);
        next.set(origin.x + Math.sin(angle + .02) * radius, rig.root.position.y, origin.z + Math.sin((angle + .02) * .63) * radius * .3);
      } else if (options.mode === "perch") {
        const flightAmount = state === "short-flight" ? Math.sin(((cycle - 11.6) / 2.8) * Math.PI) : 0;
        rig.root.position.set(origin.x + Math.sin(angle * 2) * radius * flightAmount, origin.y + flightAmount * verticalRange, origin.z + Math.cos(angle * 1.7) * radius * .45 * flightAmount);
        next.set(origin.x + Math.sin((angle + .02) * 2) * radius, rig.root.position.y, origin.z + Math.cos((angle + .02) * 1.7) * radius * .45);
      } else {
        rig.root.position.set(origin.x + Math.cos(angle) * radius, origin.y, origin.z + Math.sin(angle) * radius * .68);
        if (options.floorHeight) rig.root.position.y = options.floorHeight(rig.root.position.x, rig.root.position.z);
        next.set(origin.x + Math.cos(angle + .02) * radius, rig.root.position.y, origin.z + Math.sin(angle + .02) * radius * .68);
      }
      if (locomoting || options.mode === "aquatic") {
        tangent.copy(next).sub(rig.root.position);
        if (tangent.lengthSq() > .00001) rig.root.rotation.y = Math.atan2(-tangent.x, -tangent.z);
      } else rig.root.rotation.y += Math.atan2(Math.sin(baseYaw - rig.root.rotation.y), Math.cos(baseYaw - rig.root.rotation.y)) * (1 - Math.exp(-delta * 2.4));
      const enrichment = zooAnimalEnrichmentDirectives.get(rig.root);
      const enrichmentTargetBlend = enrichment ? 1 : 0;
      const responseRate = enrichment?.responsiveness ?? 2.25;
      enrichmentBlend += (enrichmentTargetBlend - enrichmentBlend) * (1 - Math.exp(-delta * responseRate));
      if (enrichment && enrichmentBlend > .001) {
        enrichment.target.getWorldPosition(enrichmentTarget);
        enrichmentDesired.copy(enrichmentTarget);
        enrichmentDesired.x += enrichment.offset[0];
        enrichmentDesired.y += enrichment.offset[1];
        enrichmentDesired.z += enrichment.offset[2];
        rig.root.position.lerp(enrichmentDesired, enrichmentBlend);
        if (enrichment.heading) rig.root.rotation.y = Math.atan2(-enrichment.heading[0], -enrichment.heading[1]);
        else {
          tangent.copy(enrichmentTarget).sub(rig.root.position).setY(0);
          if (tangent.lengthSq() > .00001) rig.root.rotation.y = Math.atan2(-tangent.x, -tangent.z);
        }
        state = enrichment.motion;
      }
      rig.root.userData.animationState = state;
      rig.root.userData.enrichmentActive = Boolean(enrichment) && enrichmentBlend > .08;
      rig.root.userData.enrichmentBlend = enrichmentBlend;
      // Locomotion speed controls the habitat route; clip speed is a separate
      // authored-behavior choice so nearby animals do not march in lockstep.
      rig.root.userData.animationSpeed = THREE.MathUtils.clamp(options.animationSpeed ?? 1, .35, 1.8);
      rig.root.userData.habitatMotionPhase = phase;
      rig.update(elapsed, delta);
    },
  };
}

function shadows(root: THREE.Object3D, enabled: boolean) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = enabled;
    object.receiveShadow = false;
  });
}

function material(texture: THREE.Texture, color: string, roughness = .88, map?: THREE.Texture) {
  return new THREE.MeshStandardMaterial({
    map: map ?? texture,
    bumpMap: texture,
    bumpScale: .035,
    color,
    roughness,
  });
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, surface: THREE.Material, radialSegments: number) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * .82, radius, direction.length(), radialSegments, 2), surface);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

/** A close-view polar bear with a coherent shoulder-to-muzzle silhouette and restrained idle motion. */
export function createGaryPolarBear(textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "gary-the-polar-bear";
  root.userData.species = "polar-bear";
  root.userData.animalName = "Gary";
  const segments = qualitySegments(quality, 52, 36, 20);
  const polarSurface = cloneZooAnimalAtlasCell(textures, 0, 0, "polar-bear");
  const fur = material(textures.fur, "#eeeadd", .94, polarSurface);
  const shadowFur = material(textures.fur, "#d0ccc0", .96, polarSurface);
  const dark = new THREE.MeshPhysicalMaterial({ color: "#171916", roughness: .3, clearcoat: .42 });

  // Gary's trunk is one tapered anatomical sweep. The previous three
  // intersecting spheres read as separate toy orbs whenever the light caught
  // their seams; this continuous surface carries the rib cage into the hips.
  const body = new THREE.Mesh(taperedSweepGeometry([
    new THREE.Vector3(0, .03, -1.4),
    new THREE.Vector3(0, .08, -.78),
    new THREE.Vector3(0, 0, .16),
    new THREE.Vector3(0, -.04, .94),
    new THREE.Vector3(0, .02, 1.42),
  ], [.68, .94, .98, .86, .56], quality > .86 ? 44 : quality > .62 ? 30 : 20, quality > .86 ? 30 : quality > .62 ? 20 : 14), fur);
  body.name = "gary-continuous-polar-bear-torso";
  body.scale.set(1, .78, 1);
  body.position.set(0, 1.5, .35);
  root.add(body);

  const neck = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(14, segments - 7)), fur);
  neck.name = "gary-polar-bear-neck-transition";
  neck.scale.set(.74, .68, .86);
  neck.position.set(0, 1.77, -1.45);
  neck.rotation.x = -.13;
  root.add(neck);

  const headPivot = new THREE.Group();
  headPivot.name = "gary-polar-bear-head-pivot";
  headPivot.position.set(0, 1.96, -1.94);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(14, segments - 7)), fur);
  head.name = "gary-anatomical-polar-bear-head";
  head.scale.set(.62, .55, .72);
  headPivot.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(12, segments - 9)), shadowFur);
  muzzle.name = "gary-polar-bear-integrated-muzzle";
  muzzle.scale.set(.34, .24, .48);
  muzzle.position.set(0, -.13, -.59);
  headPivot.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.11, segments, 14), dark);
  nose.name = "gary-polar-bear-nose";
  nose.scale.set(1.15, .72, .8);
  nose.position.set(0, -.12, -1.02);
  headPivot.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.1, .012, 7, 24, Math.PI), dark);
  mouth.name = "gary-polar-bear-mouth-line";
  mouth.position.set(0, -.24, -.91);
  mouth.rotation.set(Math.PI / 2, 0, Math.PI);
  headPivot.add(mouth);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.15, segments, 14), fur);
    ear.name = "gary-rounded-polar-bear-ear";
    ear.scale.set(.72, .92, .48);
    ear.position.set(side * .43, .42, -.03);
    headPivot.add(ear);
    const innerEar = new THREE.Mesh(new THREE.SphereGeometry(.078, 20, 12), shadowFur);
    innerEar.name = "gary-recessed-inner-ear";
    innerEar.scale.set(.72, .92, .25);
    innerEar.position.set(side * .43, .42, -.115);
    headPivot.add(innerEar);
    const eye = glossyEye(.032, "#16130d");
    eye.position.set(side * .27, .07, -.63);
    headPivot.add(eye);
  }

  const legPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const z = front < 0 ? -.9 : 1.02;
    const upper = new THREE.Vector3(side * .6, 1.48, z);
    const lower = new THREE.Vector3(side * .63, .4, z + (front < 0 ? -.12 : .08));
    const leg = articulatedSweep(
      front < 0 ? "gary-weight-bearing-polar-bear-forelimb" : "gary-weight-bearing-polar-bear-hindlimb",
      upper,
      [new THREE.Vector3(), new THREE.Vector3(side * .035, -.48, front < 0 ? -.045 : .06), lower.clone().sub(upper)],
      front < 0 ? [.27, .23, .17] : [.3, .25, .18],
      front < 0 ? fur : shadowFur,
      quality,
    );
    const jointMass = new THREE.Mesh(new THREE.SphereGeometry(front < 0 ? .27 : .3, 30, 19), front < 0 ? fur : shadowFur);
    jointMass.name = front < 0 ? "gary-polar-bear-scapular-forelimb-transition" : "gary-polar-bear-haunch-leg-transition";
    jointMass.scale.set(1, 1.32, .92);
    jointMass.position.y = -.12;
    leg.add(jointMass);
    root.add(leg); legPivots.push(leg);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(.26, segments, 16), shadowFur);
    paw.name = "gary-grounded-polar-bear-paw";
    paw.scale.set(1, .58, 1.3);
    paw.position.copy(lower).sub(upper).add(new THREE.Vector3(0, -.23, -.12));
    // Feet belong to their articulated limb pivots so a walking leg can never
    // leave a disconnected paw behind in world space.
    leg.add(paw);
    for (let claw = -1; claw <= 1; claw++) {
      const clawMesh = new THREE.Mesh(new THREE.ConeGeometry(.025, .13, 8), new THREE.MeshStandardMaterial({ color: "#4c493f", roughness: .7 }));
      clawMesh.name = "gary-polar-bear-visible-claw";
      clawMesh.position.copy(paw.position).add(new THREE.Vector3(claw * .065, -.015, -.3));
      clawMesh.rotation.x = -Math.PI / 2;
      leg.add(clawMesh);
    }
  }
  shadows(root, quality > .62);
  stampPremiumAnimal(root, ["idle", "walk", "forage"]);
  const phase = .37;
  return authorZooAnimalRig({
    root,
    ownedTextures: [polarSurface],
    update(elapsed) {
      const state = root.userData.animationState as string | undefined;
      const breath = Math.sin(elapsed * 1.17 + phase) * .014;
      const gait = state === "walk" ? Math.sin(elapsed * 3.4) : 0;
      body.scale.y = .78 + breath + Math.abs(gait) * .008;
      headPivot.rotation.y = Math.sin(elapsed * .31 + phase) * (state === "forage" ? .28 : .12);
      headPivot.rotation.x = (state === "forage" ? .24 : -.02) + Math.sin(elapsed * .47) * .025;
      legPivots.forEach((pivot, index) => {
        pivot.rotation.x = state === "walk" ? Math.sin(elapsed * 3.4 + index * Math.PI) * .19 : 0;
        pivot.rotation.z = state === "forage" && index < 2 ? Math.sin(elapsed * .72 + index) * .035 : 0;
      });
    },
  }, { species: "gary-polar-bear", quality, defaultMotion: "idle", phaseOffset: .23 });
}

function createPerchedBird(
  textures: GameTextures,
  quality: number,
  name: string,
  palette: BirdPalette,
  scale = 1,
): ZooAnimalRig {
  const root = new THREE.Group();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const isIbis = slug === "scarlet-ibis", isMacaw = slug === "blue-and-gold-macaw", isAracari = slug === "green-aracari";
  root.name = `${slug}-bird`;
  root.userData.species = slug;
  const segments = qualitySegments(quality, 44, 30, 18);
  const birdCell: [0 | 1 | 2, 0 | 1 | 2] = slug === "blue-and-gold-macaw" ? [1, 1] : [0, 1];
  const featherSurface = cloneZooAnimalAtlasCell(textures, birdCell[0], birdCell[1], slug);
  const breast = material(textures.fur, palette.breast, .82, featherSurface);
  const crown = material(textures.fur, palette.crown, .8, featherSurface);
  const wing = material(textures.fur, palette.wing, .79, featherSurface);
  const tail = material(textures.fur, palette.tail, .84, featherSurface);
  const beakMaterial = new THREE.MeshStandardMaterial({ color: "#2b2924", roughness: .55 });
  const feet = new THREE.MeshStandardMaterial({ color: "#7b7164", roughness: .68 });
  const headRadius = isIbis ? .18 : isMacaw ? .21 : .155;

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(10, segments - 5)), breast);
  body.name = `${slug}-continuous-bird-torso`;
  body.scale.set(isIbis ? .24 : isMacaw ? .28 : .24, isIbis ? .52 : isMacaw ? .5 : .46, isIbis ? .34 : isMacaw ? .33 : .29);
  body.position.y = isIbis ? .82 : .55;
  root.add(body);
  const headPivot = new THREE.Group();
  headPivot.name = `${slug}-head-pivot`;
  headPivot.position.set(0, isIbis ? 1.47 : isMacaw ? 1.08 : .99, isIbis ? -.19 : isMacaw ? -.09 : -.085);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(headRadius, segments, Math.max(14, segments - 12)), crown);
  head.name = `${slug}-bird-head`;
  headPivot.add(head);
  const beak = isIbis
    ? new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, -.18), new THREE.Vector3(0, -.03, -.54), new THREE.Vector3(0, -.2, -.78)), 22, .032, 8, false), beakMaterial)
    : new THREE.Mesh(taperedSweepGeometry([
      new THREE.Vector3(0, .02, isAracari ? -.12 : isMacaw ? -.11 : -.1),
      new THREE.Vector3(0, isMacaw ? -.02 : .01, isAracari ? -.4 : isMacaw ? -.3 : -.21),
      new THREE.Vector3(0, isMacaw ? -.11 : -.035, isAracari ? -.65 : isMacaw ? -.45 : -.285),
    ], isAracari ? [.12, .095, .012] : isMacaw ? [.1, .08, .011] : [.055, .038, .006], quality > .86 ? 30 : 20, quality > .86 ? 18 : 12), beakMaterial);
  beak.name = isIbis ? `${slug}-long-decurved-probing-bill` : isAracari ? `${slug}-oversized-aracari-bill` : `${slug}-curved-beak`;
  headPivot.add(beak);
  const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: "#080a08", roughness: .1, clearcoat: 1 });
  const wingPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const eyePatch = new THREE.Mesh(new THREE.SphereGeometry(isMacaw ? .052 : .043, 22, 14), isMacaw ? new THREE.MeshStandardMaterial({ color: "#e8dcc6", roughness: .88 }) : crown);
    eyePatch.name = `${slug}-orbital-feather-patch`;
    eyePatch.scale.set(1, 1.08, .24);
    eyePatch.position.set(side * (isMacaw ? .175 : .15), .05, -headRadius * .78);
    if (isMacaw) headPivot.add(eyePatch);
    const eye = glossyEye(isIbis ? .014 : isMacaw ? .017 : .013, isIbis ? "#8d6c27" : "#151007");
    eye.position.set(side * (isMacaw ? .11 : .075), .04, -headRadius * .88);
    headPivot.add(eye);
    const wingPivot = new THREE.Group();
    wingPivot.name = `${slug}-articulated-wing-pivot`;
    wingPivot.position.set(side * (isMacaw ? .235 : isIbis ? .205 : .195), isIbis ? .82 : .57, .055);
    wingPivot.userData.side = side;
    const wingMesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(14, segments - 10)), wing);
    wingMesh.name = `${slug}-attached-layered-folded-wing-flight-feathers`;
    wingMesh.scale.set(.043, isMacaw ? .3 : isIbis ? .31 : .27, isMacaw ? .25 : isIbis ? .27 : .22);
    wingMesh.rotation.z = side * -.08;
    wingPivot.add(wingMesh);
    root.add(wingPivot); wingPivots.push(wingPivot);
  }
  const tailLength = isMacaw ? 1.03 : isIbis ? .64 : .72, tailBaseY = isIbis ? .78 : .5;
  for (let feather = -1; feather <= 1; feather++) {
    const tailFeather = new THREE.Mesh(taperedSweepGeometry([
      new THREE.Vector3(feather * .045, tailBaseY, .24),
      new THREE.Vector3(feather * .055, tailBaseY - tailLength * .3, .24 + tailLength * .48),
      new THREE.Vector3(feather * .035, tailBaseY - tailLength * .58, .24 + tailLength),
    ], [.055, .04, .006], quality > .86 ? 36 : 24, quality > .86 ? 14 : 10), tail);
    tailFeather.name = `${slug}-separated-tail-flight-feather`;
    root.add(tailFeather);
  }
  if (isIbis) {
    const throat = new THREE.Mesh(new THREE.SphereGeometry(.105, segments, 14), breast);
    throat.name = `${slug}-layered-throat-plumage`;
    throat.scale.set(.74, 1.08, .52);
    throat.position.set(0, 1.19, -.19);
    root.add(throat);
    const neckCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 1.12, -.18), new THREE.Vector3(0, 1.34, -.34), new THREE.Vector3(0, 1.52, -.25), new THREE.Vector3(0, 1.55, -.12),
    ]);
    const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, 24, .09, 10, false), crown);
    neck.name = "scarlet-ibis-long-flexible-neck";
    root.add(neck);
  }
  for (const side of [-1, 1]) {
    const legLength = isIbis ? .72 : .26;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.022, .028, legLength, 8), feet);
    leg.position.set(side * .1, isIbis ? .35 : .16, -.02);
    root.add(leg);
    for (const toeSide of [-1, 0, 1]) {
      const toe = cylinderBetween(new THREE.Vector3(side * .1, isIbis ? -.01 : .04, -.02), new THREE.Vector3(side * .1 + toeSide * (isIbis ? .1 : .055), isIbis ? -.02 : .015, -.12 - Math.abs(toeSide) * .025), .009, feet, 9);
      toe.name = `${slug}-forward-grasping-toe`;
      root.add(toe);
    }
    const rearToe = cylinderBetween(new THREE.Vector3(side * .1, isIbis ? -.01 : .04, -.01), new THREE.Vector3(side * .1, isIbis ? -.02 : .015, .12), .009, feet, 9);
    rearToe.name = `${slug}-opposable-rear-toe`;
    root.add(rearToe);
  }
  if (!isIbis) {
    // An ellipsoidal lower ramphotheca keeps the bill closed from every
    // showroom angle. The earlier rotated cone exposed its circular base to
    // the camera and read as a toy cylinder rather than a curved mandible.
    const lowerBeak = new THREE.Mesh(new THREE.SphereGeometry(isMacaw || isAracari ? .065 : .052, 30, 18), new THREE.MeshStandardMaterial({ color: isMacaw ? "#201f1b" : isAracari ? "#a98443" : "#34302a", roughness: .62 }));
    lowerBeak.name = `${slug}-separate-lower-mandible`;
    lowerBeak.scale.set(isAracari ? 1.05 : .72, .42, isAracari ? 1.75 : 1.08);
    lowerBeak.position.set(0, isMacaw ? -.065 : isAracari ? -.05 : -.038, isAracari ? -.34 : isMacaw ? -.27 : -.19);
    headPivot.add(lowerBeak);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(isAracari ? .01 : .006, 12, 8), eyeMaterial);
    nostril.name = `${slug}-bill-nostril`;
    nostril.position.set(isAracari ? .035 : .022, .018, isAracari ? -.31 : isMacaw ? -.2 : -.145);
    headPivot.add(nostril);
  }
  root.scale.setScalar(scale);
  shadows(root, quality > .72);
  stampPremiumAnimal(root, ["perch", "preen", "short-flight"]);
  const phase = slug.length * .71;
  return {
    root,
    ownedTextures: [featherSurface],
    update(elapsed) {
      const state = root.userData.animationState as string | undefined;
      headPivot.rotation.y = Math.sin(elapsed * .82 + phase) * .22;
      headPivot.rotation.x = (state === "preen" ? .42 : 0) + Math.sin(elapsed * 1.27 + phase) * .04;
      wingPivots.forEach(child => {
        const side = child.userData.side as number;
        const flight = state === "short-flight" ? Math.sin(elapsed * 11 + phase) * .72 : Math.max(0, Math.sin(elapsed * .63 + phase) - .94) * .7;
        child.rotation.z = side * (-.16 - flight);
        child.rotation.x = state === "preen" ? -.22 : state === "short-flight" ? Math.sin(elapsed * 5.5 + phase) * .08 : 0;
      });
      body.rotation.z = state === "short-flight" ? Math.sin(elapsed * 5 + phase) * .06 : 0;
    },
  };
}

export function createSunConure(textures: GameTextures, quality: number) {
  const bird = createPerchedBird(textures, quality, "sun-conure", {
    breast: "#f29a2e",
    crown: "#ffd34f",
    wing: "#309b63",
    tail: "#258168",
  }, 1.08);
  bird.root.name = "sun-conure-hero-bird";
  bird.root.userData.commonName = "Mango · Sun conure";
  bird.root.userData.displayName = "Mango";
  bird.root.userData.logicalId = "mango-sun-conure";
  return authorZooAnimalRig(bird, {
    species: "sun-conure",
    quality,
    defaultMotion: "perch",
    phaseOffset: .61,
  });
}

/**
 * Project-authored Central Park mallard. The empty synchronous shell is
 * intentional: the manifest loader keeps it hidden until the reviewed GLB is
 * decoded, so no primitive-era bird can flash before the authored animal.
 */
export function createMallard(_textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "central-park-mallard-duck";
  root.userData.species = "mallard-duck";
  root.userData.commonName = "Mallard duck";
  root.userData.logicalId = "central-park-mallard";
  root.userData.animationStates = ["idle", "walk", "swim", "short-flight", "landing-settle"];
  return authorZooAnimalRig({ root, update() {} }, {
    species: "mallard-duck",
    quality,
    defaultMotion: "swim",
    phaseOffset: .37,
  }) as ZooAnimalRig;
}

export const createMallardDuck = createMallard;

/** Project-authored Eastern gray squirrel used by Zap's park story. */
export function createEasternGraySquirrel(_textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "central-park-zap-eastern-gray-squirrel";
  root.userData.species = "eastern-gray-squirrel";
  root.userData.commonName = "Zap · Eastern gray squirrel";
  root.userData.displayName = "Zap";
  root.userData.logicalId = "central-park-squirrel";
  root.userData.animationStates = ["idle", "walk", "forage", "climb"];
  return authorZooAnimalRig({ root, update() {} }, {
    species: "eastern-gray-squirrel",
    quality,
    defaultMotion: "idle",
    phaseOffset: .71,
  }) as ZooAnimalRig;
}

/** Project-authored tan-and-white museum cat used by the Whiskers trail. */
export function createWhiskersCat(_textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "amnh-whiskers-tan-and-white-museum-cat";
  root.userData.species = "whiskers-cat";
  root.userData.commonName = "Whiskers · Tan and white museum cat";
  root.userData.displayName = "Whiskers";
  root.userData.logicalId = "amnh-whiskers";
  root.userData.animationStates = ["idle", "walk", "pounce"];
  return authorZooAnimalRig({ root, update() {} }, {
    species: "whiskers-cat",
    quality,
    defaultMotion: "idle",
    phaseOffset: .23,
  }) as ZooAnimalRig;
}

export function createBlueAndGoldMacaw(textures: GameTextures, quality: number) {
  return createPerchedBird(textures, quality, "blue-and-gold-macaw", {
    breast: "#dcae35", crown: "#2777a5", wing: "#1f638f", tail: "#22557f",
  }, 1.36);
}

export function createScarletIbis(textures: GameTextures, quality: number) {
  return createPerchedBird(textures, quality, "scarlet-ibis", {
    breast: "#d54332", crown: "#ef5c40", wing: "#9f2d29", tail: "#7d2726",
  }, 1.18);
}

export function createGreenAracari(textures: GameTextures, quality: number) {
  return createPerchedBird(textures, quality, "green-aracari", {
    breast: "#d8c65a", crown: "#252a22", wing: "#477e4a", tail: "#315b39",
  }, 1.12);
}

export function createSpiderMonkey(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `spider-monkey-${variant + 1}`;
  root.userData.species = "spider-monkey";
  const segments = qualitySegments(quality, 48, 32, 18);
  const monkeySurface = cloneZooAnimalAtlasCell(textures, 1, 0, `spider-monkey-${variant + 1}`);
  const coat = material(textures.fur, variant % 2 ? "#9d8976" : "#b19a82", .94, monkeySurface);
  const face = new THREE.MeshStandardMaterial({ color: "#4a372b", roughness: .91, bumpMap: textures.fur, bumpScale: .008 });
  const muzzleSkin = new THREE.MeshStandardMaterial({ color: "#2f251f", roughness: .94, bumpMap: textures.fur, bumpScale: .006 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(18, segments - 10)), coat);
  body.name = "spider-monkey-anatomical-torso";
  body.scale.set(.235, .39, .19);
  body.position.set(0, 1.18, .015);
  body.rotation.x = -.13;
  root.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(18, segments - 12)), coat);
  chest.name = "spider-monkey-broad-scapular-chest-transition";
  chest.scale.set(.25, .22, .195);
  chest.position.set(0, 1.37, -.045);
  chest.rotation.x = -.16;
  root.add(chest);
  const pelvis = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(18, segments - 12)), coat);
  pelvis.name = "spider-monkey-compact-pelvic-mass";
  pelvis.scale.set(.24, .21, .2);
  pelvis.position.set(0, .92, .085);
  pelvis.rotation.x = .13;
  root.add(pelvis);
  const headPivot = new THREE.Group();
  headPivot.name = "spider-monkey-neck-and-head-pivot";
  headPivot.position.set(0, 1.68, -.13);
  headPivot.rotation.x = -.08;
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.2, segments, Math.max(18, segments - 12)), coat);
  head.name = "spider-monkey-compact-cranial-vault";
  head.scale.set(.88, .98, .85);
  headPivot.add(head);
  const faceMask = new THREE.Mesh(new THREE.SphereGeometry(.145, segments, Math.max(16, segments - 14)), face);
  faceMask.name = "spider-monkey-heart-shaped-facial-mask";
  faceMask.scale.set(.56, .88, .18);
  faceMask.position.set(0, -.002, -.172);
  headPivot.add(faceMask);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.085, segments, Math.max(14, segments - 16)), muzzleSkin);
  muzzle.name = "spider-monkey-projecting-primate-muzzle";
  muzzle.scale.set(.78, .5, .7);
  muzzle.position.set(0, -.06, -.198);
  headPivot.add(muzzle);
  const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: "#090806", roughness: .12, clearcoat: .9 });
  for (const side of [-1, 1]) {
    const eye = glossyEye(.017, "#21140d");
    eye.name = "spider-monkey-forward-eye anatomical-eye-with-cornea";
    eye.position.set(side * .052, .034, -.19);
    headPivot.add(eye);
    const ear = new THREE.Mesh(new THREE.TorusGeometry(.044, .014, 12, 28), face);
    ear.name = "spider-monkey-sculpted-outer-ear";
    ear.scale.x = .45;
    ear.position.set(side * .175, .005, -.025);
    ear.rotation.y = side * Math.PI / 2;
    headPivot.add(ear);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.02, 24, 14), eyeMaterial);
  nose.name = "spider-monkey-nose-with-nostrils";
  nose.scale.set(1.08, .44, .36);
  nose.position.set(0, -.052, -.252);
  headPivot.add(nose);
  const limbRoots: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const arm of [true, false]) {
    const bend = arm
      ? new THREE.Vector3(side * (side < 0 ? .25 : .2), side < 0 ? -.35 : -.31, side < 0 ? -.14 : .12)
      : new THREE.Vector3(side * (side < 0 ? .22 : .18), side < 0 ? -.28 : -.24, side < 0 ? .13 : -.13);
    const end = arm
      ? new THREE.Vector3(side * (side < 0 ? .1 : .06), side < 0 ? -.78 : -.73, side < 0 ? -.29 : .2)
      : new THREE.Vector3(side * (side < 0 ? .1 : .07), side < 0 ? -.6 : -.55, side < 0 ? .2 : -.04);
    const rootPosition = new THREE.Vector3(side * (arm ? .255 : .18), arm ? 1.47 : .93, arm ? -.04 : .07);
    const pivot = articulatedSweep(
      arm ? "spider-monkey-arm" : "spider-monkey-leg",
      rootPosition,
      [new THREE.Vector3(), bend, end],
      arm ? [.074, .054, .033] : [.088, .065, .038],
      coat,
      quality,
    );
    pivot.userData.baseZ = arm ? side * (side < 0 ? .12 : .04) : side * (side < 0 ? -.08 : -.03);
    const distalJoint = new THREE.Mesh(new THREE.SphereGeometry(arm ? .043 : .05, 26, 16), coat);
    distalJoint.name = arm ? "spider-monkey-defined-elbow-volume" : "spider-monkey-defined-knee-volume";
    distalJoint.scale.set(.82, 1.08, .82);
    distalJoint.position.copy(bend);
    pivot.add(distalJoint);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(arm ? .05 : .06, 26, 16), face);
    hand.name = arm ? "spider-monkey-continuous-wrist-palm-transition" : "spider-monkey-continuous-ankle-foot-transition";
    hand.scale.set(arm ? .52 : .62, arm ? .9 : .58, arm ? .4 : .86);
    hand.position.copy(end);
    pivot.add(hand);
    for (let digit = -2; digit <= 2; digit++) {
      const spread = digit * (arm ? .011 : .013);
      const start = end.clone().add(new THREE.Vector3(spread, arm ? -.025 : -.012, arm ? -.008 : -.032));
      const middle = start.clone().add(new THREE.Vector3(spread * .28, arm ? -.045 : -.018, arm ? -.014 : -.052));
      const tip = middle.clone().add(new THREE.Vector3(spread * .18, arm ? -.04 + Math.abs(digit) * .005 : .006, arm ? .018 : -.055 + Math.abs(digit) * .006));
      const finger = new THREE.Mesh(taperedSweepGeometry(
        [start, middle, tip],
        [arm ? .006 : .007, arm ? .0048 : .0055, .0015],
        quality > .86 ? 14 : 9,
        quality > .86 ? 9 : 7,
      ), face);
      finger.name = arm ? "spider-monkey-long-curved-finger" : "spider-monkey-prehensile-toe";
      pivot.add(finger);
    }
    root.add(pivot);
    limbRoots.push(pivot);
  }
  const tail = new THREE.Mesh(taperedSweepGeometry([
    new THREE.Vector3(0, 1.1, .25),
    new THREE.Vector3(.42, 1.02, .58),
    new THREE.Vector3(.55, 1.6, .76),
    new THREE.Vector3(.2, 2.18, .62),
    new THREE.Vector3(-.15, 2.12, .45),
  ], [.045, .043, .038, .025, .006], quality > .86 ? 64 : quality > .62 ? 42 : 26, quality > .86 ? 16 : 11), coat);
  tail.name = "prehensile-spider-monkey-tail";
  root.add(tail);
  shadows(root, quality > .72);
  stampPremiumAnimal(root, ["perch", "swing", "forage", "walk"]);
  const phase = variant * 1.73;
  return authorZooAnimalRig({
    root,
    ownedTextures: [monkeySurface],
    update(elapsed) {
      const state = root.userData.animationState as string | undefined;
      limbRoots.forEach((pivot, index) => {
        const walking = state === "walk";
        const amplitude = state === "swing" ? .42 : state === "forage" ? .16 : walking ? .1 : .06;
        const cadence = state === "swing" ? 2.2 : walking ? 3.4 : .58;
        pivot.rotation.z = (pivot.userData.baseZ as number) + Math.sin(elapsed * cadence + phase + index * 1.4) * amplitude;
        const walkPhase = [0, Math.PI, Math.PI, 0][index];
        pivot.rotation.x = state === "swing"
          ? Math.sin(elapsed * 2.2 + index * Math.PI) * .18
          : walking
            ? Math.sin(elapsed * 3.4 + phase + walkPhase) * (index % 2 === 0 ? .2 : .27)
            : 0;
      });
      headPivot.rotation.y = Math.sin(elapsed * .49 + phase) * .16;
      headPivot.rotation.x = state === "forage" ? .18 + Math.sin(elapsed * 1.2 + phase) * .07 : Math.sin(elapsed * .36) * .025;
      body.rotation.z = state === "swing" ? Math.sin(elapsed * 2.2 + phase) * .1 : state === "walk" ? Math.sin(elapsed * 3.4 + phase) * .035 : 0;
      body.position.y = 1.18 + (state === "walk" ? Math.abs(Math.sin(elapsed * 3.4 + phase)) * .025 : 0);
      tail.rotation.y = Math.sin(elapsed * (state === "swing" ? 1.2 : .42) + phase) * (state === "swing" ? .22 : .08);
    },
  }, {
    species: "spider-monkey",
    quality,
    defaultMotion: variant === 0 ? "perch" : "walk",
    phaseOffset: variant * 1.37,
  });
}

export function createSeaLion(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `bronx-zoo-sea-lion-${variant + 1}`;
  root.userData.species = "california-sea-lion";
  const segments = qualitySegments(quality, 48, 32, 18);
  const seaLionSurface = cloneZooAnimalAtlasCell(textures, 0, 2, `sea-lion-${variant + 1}`);
  const skin = material(textures.fur, variant % 2 ? "#9ea9a6" : "#b0b6b1", .54, seaLionSurface);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.48, 1.35, quality > .86 ? 20 : 12, segments), skin);
  body.name = "streamlined-sea-lion-body";
  body.rotation.x = Math.PI / 2;
  body.position.set(0, .5, .15);
  root.add(body);
  const neck = new THREE.Mesh(new THREE.SphereGeometry(.48, segments, Math.max(18, segments - 10)), skin);
  neck.name = "sea-lion-muscular-neck-transition";
  neck.scale.set(.86, 1.02, 1.2);
  neck.position.set(0, .55, -.75);
  root.add(neck);
  const headPivot = new THREE.Group();
  headPivot.name = "sea-lion-neck-and-head-pivot";
  headPivot.position.set(0, .62, -1.08);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.36, segments, Math.max(18, segments - 10)), skin);
  head.name = "sea-lion-head";
  head.scale.set(.95, .9, 1.06);
  headPivot.add(head);
  const flippers: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const flipper = new THREE.Group();
    flipper.name = "sea-lion-articulated-front-flipper-pivot";
    flipper.position.set(side * .42, .25, -.3);
    flipper.rotation.z = side * -.95;
    const flipperBlade = new THREE.Mesh(taperedSweepGeometry([
      new THREE.Vector3(), new THREE.Vector3(side * .05, -.31, .02), new THREE.Vector3(side * .03, -.69, .12),
    ], [.2, .15, .055], quality > .86 ? 26 : 16, quality > .86 ? 18 : 12), skin);
    flipperBlade.name = "sea-lion-tapered-five-digit-front-flipper";
    flipper.add(flipperBlade);
    root.add(flipper);
    flippers.push(flipper);
  }
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.19, segments, Math.max(16, segments - 14)), skin);
  muzzle.name = "sea-lion-whiskered-muzzle";
  muzzle.scale.set(1.15, .7, .8);
  muzzle.position.set(0, -.08, -.34);
  headPivot.add(muzzle);
  const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: "#0b0d0c", roughness: .08, clearcoat: 1 });
  for (const side of [-1, 1]) {
    const eye = glossyEye(.027, "#33210e");
    eye.position.set(side * .185, .1, -.27);
    headPivot.add(eye);
    const ear = new THREE.Mesh(new THREE.TorusGeometry(.055, .018, 10, 24, Math.PI * 1.45), skin);
    ear.name = "sea-lion-visible-external-pinna";
    ear.position.set(side * .39, .02, -.03);
    ear.rotation.set(0, side * Math.PI / 2, side * -.32);
    headPivot.add(ear);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(.022, 12, 8), eyeMaterial);
    nostril.name = "sea-lion-nostril";
    nostril.scale.set(1.2, .45, .32);
    nostril.position.set(side * .075, -.045, -.52);
    headPivot.add(nostril);
    for (let whisker = -2; whisker <= 2; whisker++) {
      const line = cylinderBetween(new THREE.Vector3(side * .12, -.08 + whisker * .028, -.5), new THREE.Vector3(side * (.46 + Math.abs(whisker) * .035), -.1 + whisker * .075, -.7), .0045, eyeMaterial, 6);
      line.name = "sea-lion-sensitive-whisker";
      headPivot.add(line);
    }
  }
  const mouthLine = new THREE.Mesh(new THREE.TorusGeometry(.12, .012, 8, 28, Math.PI), eyeMaterial);
  mouthLine.name = "sea-lion-defined-mouth-line";
  mouthLine.position.set(0, -.17, -.49);
  mouthLine.rotation.set(Math.PI / 2, 0, Math.PI);
  headPivot.add(mouthLine);
  const hindFlippers: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const hind = articulatedSweep("sea-lion-hind-flipper", new THREE.Vector3(side * .18, .48, 1.38), [
      new THREE.Vector3(), new THREE.Vector3(side * .13, -.08, .25), new THREE.Vector3(side * .3, -.12, .52),
    ], [.17, .13, .035], skin, quality);
    hind.rotation.x = -.08;
    root.add(hind); hindFlippers.push(hind);
  }
  shadows(root, quality > .72);
  stampPremiumAnimal(root, ["swim", "surface", "dive"]);
  const phase = variant * 2.1;
  return authorZooAnimalRig({
    root,
    ownedTextures: [seaLionSurface],
    update(elapsed) {
      const state = root.userData.animationState as string | undefined;
      headPivot.rotation.y = Math.sin(elapsed * .45 + phase) * (state === "surface" ? .3 : .16);
      headPivot.rotation.x = state === "dive" ? .22 : Math.sin(elapsed * .61 + phase) * .035;
      body.position.y = .5 + Math.sin(elapsed * (state === "swim" ? 2.1 : .9) + phase) * (state === "swim" ? .055 : .018);
      body.rotation.z = state === "swim" ? Math.sin(elapsed * 2.1 + phase) * .08 : 0;
      flippers.forEach((flipper, index) => { flipper.rotation.x = state === "swim" ? Math.sin(elapsed * 3.4 + index * Math.PI) * .34 : 0; });
      hindFlippers.forEach((flipper, index) => { flipper.rotation.y = state === "swim" ? Math.sin(elapsed * 3.4 + index * Math.PI) * .24 : 0; });
    },
  }, {
    species: "california-sea-lion",
    quality,
    defaultMotion: variant % 3 === 1 ? "swim" : variant % 3 === 2 ? "dive" : "surface",
    phaseOffset: variant * 2.1,
  });
}

export function createRedPanda(textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "bronx-zoo-red-panda";
  root.userData.species = "red-panda";
  const segments = qualitySegments(quality, 48, 32, 18);
  const redPandaSurface = cloneZooAnimalAtlasCell(textures, 2, 0, "red-panda");
  const tailSurface = cloneZooAnimalAtlasCell(textures, 2, 0, "red-panda-tail");
  const red = material(textures.fur, "#9b4528", .94, redPandaSurface);
  const dark = material(textures.fur, "#2d2722", .95);
  const cream = material(textures.fur, "#d8c39b", .93);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(18, segments - 10)), red);
  body.name = "red-panda-torso";
  body.scale.set(.36, .32, .76);
  body.position.y = .6;
  root.add(body);
  const headPivot = new THREE.Group();
  headPivot.name = "red-panda-neck-and-head-pivot";
  headPivot.position.set(0, .82, -.67);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, segments, Math.max(18, segments - 12)), red);
  head.name = "red-panda-head";
  headPivot.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.17, segments, Math.max(16, segments - 14)), cream);
  muzzle.scale.set(1, .7, .62);
  muzzle.position.set(0, -.055, -.245);
  headPivot.add(muzzle);
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    addTaperedEar(headPivot, red, dark, new THREE.Vector3(side * .2, .27, 0), new THREE.Vector3(.12, .105, .1), side * -.12);
    for (const front of [-1, 1]) {
      const leg = articulatedSweep("red-panda-limb", new THREE.Vector3(side * .28, .47, front * .4), [
        new THREE.Vector3(), new THREE.Vector3(side * .02, -.2, front * .015), new THREE.Vector3(side * .03, -.43, front * -.03),
      ], [.095, .08, .055], dark, quality);
      root.add(leg);
      legs.push(leg);
      const paw = new THREE.Mesh(new THREE.SphereGeometry(.09, 26, 16), dark);
      paw.name = "red-panda-furred-paw";
      paw.scale.set(1.15, .55, 1.35);
      paw.position.set(side * .31, .035, front * .37 - .035);
      root.add(paw);
      for (let toe = -1; toe <= 1; toe++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(.009, .05, 8), new THREE.MeshStandardMaterial({ color: "#c9bca0", roughness: .65 }));
        claw.name = "red-panda-semi-retractile-claw";
        claw.position.set(side * .31 + toe * .024, .025, front * .37 - .14);
        claw.rotation.x = -Math.PI / 2;
        root.add(claw);
      }
    }
    const eye = glossyEye(.026, "#2f190b");
    eye.position.set(side * .11, .055, -.25);
    headPivot.add(eye);
    const tearMark = new THREE.Mesh(new THREE.CapsuleGeometry(.022, .15, 7, 12), dark);
    tearMark.name = "red-panda-dark-tear-mark";
    tearMark.position.set(side * .107, -.02, -.27);
    tearMark.rotation.z = side * .18;
    headPivot.add(tearMark);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(.115, segments, Math.max(14, segments - 16)), cream);
    cheek.scale.set(.72, 1, .42);
    cheek.position.set(side * .13, 0, -.22);
    headPivot.add(cheek);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.04, 22, 14), new THREE.MeshPhysicalMaterial({ color: "#17130f", roughness: .34, clearcoat: .25 }));
  nose.name = "red-panda-moist-nose";
  nose.scale.set(1.15, .75, .7);
  nose.position.set(0, -.04, -.36);
  headPivot.add(nose);
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .63, .67), new THREE.Vector3(.5, .65, 1.08), new THREE.Vector3(.86, .5, 1.38), new THREE.Vector3(1.12, .42, 1.62),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, quality > .86 ? 64 : quality > .62 ? 42 : 26, .14, quality > .86 ? 18 : 12, false), material(textures.fur, "#a54d2b", .94, tailSurface));
  tail.name = "red-panda-ringed-tail";
  root.add(tail);
  for (let ring = 1; ring <= 5; ring++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(.14 - ring * .007, .027, 10, 28), ring % 2 ? cream : dark);
    band.name = "red-panda-sculpted-tail-ring";
    band.position.set(ring * .2 + .04, .64 - ring * .035, .77 + ring * .19);
    band.rotation.set(Math.PI / 2 + .15, .15, -.6);
    root.add(band);
  }
  shadows(root, quality > .72);
  stampPremiumAnimal(root, ["idle", "walk", "forage"]);
  return { root, ownedTextures: [redPandaSurface, tailSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    headPivot.rotation.y = Math.sin(elapsed * .38) * (state === "forage" ? .34 : .2);
    headPivot.rotation.x = state === "forage" ? .28 + Math.sin(elapsed * 1.15) * .06 : 0;
    tail.rotation.y = Math.sin(elapsed * .52) * .12;
    legs.forEach((leg, index) => { leg.rotation.x = state === "walk" ? Math.sin(elapsed * 4 + index * Math.PI) * .22 : 0; });
  } };
}

export function createZebra(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `bronx-zoo-plains-zebra-${variant + 1}`;
  root.userData.species = "plains-zebra";
  const segments = qualitySegments(quality, 48, 32, 18);
  const zebraSurface = cloneZooAnimalAtlasCell(textures, 2, 1, `zebra-${variant + 1}`);
  const white = material(textures.fur, "#d8d4c7", .91, zebraSurface);
  const black = material(textures.fur, "#24241f", .94);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(18, segments - 10)), white);
  body.name = "zebra-anatomical-torso";
  body.scale.set(.55, .5, 1.22);
  body.position.y = 1.35;
  root.add(body);
  const neck = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(18, segments - 12)), white);
  neck.name = "zebra-tapered-muscular-neck-transition";
  neck.scale.set(.28, .7, .33);
  neck.position.set(0, 1.88, -.88);
  neck.rotation.x = -.42;
  root.add(neck);
  const headPivot = new THREE.Group();
  headPivot.name = "zebra-articulated-poll-and-head-pivot";
  headPivot.position.set(0, 2.34, -1.3);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.27, segments, Math.max(18, segments - 12)), white);
  head.name = "zebra-head";
  head.scale.set(.72, .76, 1.45);
  headPivot.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.16, segments, Math.max(16, segments - 14)), material(textures.fur, "#aaa49a", .9, zebraSurface));
  muzzle.name = "zebra-soft-anatomical-muzzle";
  muzzle.scale.set(.82, .62, 1.3);
  muzzle.position.set(0, -.1, -.42);
  headPivot.add(muzzle);
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const leg = articulatedSweep("zebra-knee-hock-leg", new THREE.Vector3(side * .42, 1.06, front * .72), [
      new THREE.Vector3(),
      new THREE.Vector3(side * .025, -.43, front < 0 ? .035 : -.04),
      new THREE.Vector3(side * .015, -.95, front < 0 ? -.015 : .06),
    ], [.13, .105, .065], white, quality);
    const upperLegMass = new THREE.Mesh(new THREE.SphereGeometry(.11, 30, 19), white);
    upperLegMass.name = front < 0 ? "zebra-sculpted-scapular-forelimb-mass" : "zebra-rounded-haunch-transition";
    upperLegMass.scale.set(1.05, 1.15, .95);
    upperLegMass.position.y = -.12;
    leg.add(upperLegMass);
    root.add(leg);
    legs.push(leg);
    for (const toe of [-1, 1]) {
      const hoof = new THREE.Mesh(new THREE.SphereGeometry(.1, 24, 16), black);
      hoof.name = "zebra-split-weight-bearing-hoof";
      hoof.scale.set(.68, .62, 1.3);
      hoof.position.set(side * .42 + toe * .043, .08, front * .72 - .025);
      root.add(hoof);
    }
  }
  const mane = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), black);
  mane.name = "zebra-continuous-upright-mane-ridge";
  mane.scale.set(.045, .58, .48);
  mane.position.set(0, 2.02, -.88);
  mane.rotation.x = -.42;
  root.add(mane);
  for (const side of [-1, 1]) {
    addTaperedEar(headPivot, white, black, new THREE.Vector3(side * .155, .27, .07), new THREE.Vector3(.075, .13, .07), side * -.18);
    const eye = glossyEye(.023, "#37210d");
    eye.position.set(side * .15, .065, -.24);
    headPivot.add(eye);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(.026, 14, 9), black);
    nostril.name = "zebra-defined-nostril";
    nostril.scale.set(1.15, .55, .4);
    nostril.position.set(side * .09, -.12, -.65);
    headPivot.add(nostril);
  }
  const tailPivot = articulatedSweep("zebra-tail", new THREE.Vector3(0, 1.5, 1.3), [
    new THREE.Vector3(), new THREE.Vector3(0, -.28, .23), new THREE.Vector3(0, -.64, .29),
  ], [.075, .05, .025], black, quality);
  root.add(tailPivot);
  const tailTuft = new THREE.Mesh(new THREE.SphereGeometry(.11, 28, 17), black);
  tailTuft.name = "zebra-tail-switch-tuft";
  tailTuft.scale.set(.65, 1.7, .7);
  tailTuft.position.set(0, .86, 1.59);
  root.add(tailTuft);
  root.scale.setScalar(.9 + variant * .04);
  shadows(root, quality > .72);
  stampPremiumAnimal(root, ["idle", "walk", "forage"]);
  const phase = variant * 1.2;
  return { root, ownedTextures: [zebraSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    headPivot.rotation.y = Math.sin(elapsed * .3 + phase) * .12;
    headPivot.rotation.x = state === "forage" ? .38 + Math.sin(elapsed * .7 + phase) * .04 : 0;
    body.position.y = 1.35 + Math.sin(elapsed * .72 + phase) * .009;
    legs.forEach((leg, index) => { leg.rotation.x = state === "walk" ? Math.sin(elapsed * 3.5 + index * Math.PI) * .2 : 0; });
    tailPivot.rotation.z = Math.sin(elapsed * .72 + phase) * .16;
  } };
}

export function createAldabraTortoise(textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "bronx-zoo-aldabra-giant-tortoise";
  root.userData.species = "aldabra-giant-tortoise";
  const segments = qualitySegments(quality, 46, 30, 18);
  const shellSurface = cloneZooAnimalAtlasCell(textures, 1, 2, "aldabra-tortoise-shell");
  const skinSurface = cloneZooAnimalAtlasCell(textures, 1, 2, "aldabra-tortoise-skin");
  const shellMaterial = new THREE.MeshStandardMaterial({ map: shellSurface, bumpMap: textures.bark, bumpScale: .07, color: "#6f6851", roughness: .96 });
  const skin = material(textures.fur, "#676851", .96, skinSurface);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(18, segments - 10)), shellMaterial);
  shell.name = "aldabra-tortoise-domed-shell";
  shell.scale.set(.92, .48, 1.12);
  shell.position.y = .54;
  root.add(shell);
  for (let row = -2; row <= 2; row++) for (let column = -2; column <= 2; column++) {
    if (Math.abs(row) + Math.abs(column) > 3) continue;
    const scute = new THREE.Mesh(new THREE.CylinderGeometry(.15 - Math.abs(column) * .012, .17, .026, 6, 2), shellMaterial);
    scute.name = "aldabra-tortoise-raised-hexagonal-shell-scute";
    scute.position.set(column * .285, .99 - Math.abs(column) * .055 - Math.abs(row) * .035, row * .4);
    scute.rotation.y = (row + column) * .09;
    root.add(scute);
  }
  const headPivot = new THREE.Group(); headPivot.name = "aldabra-tortoise-neck-and-head-pivot"; headPivot.position.set(0, .42, -1.05); root.add(headPivot);
  const neck = new THREE.Mesh(taperedSweepGeometry([
    new THREE.Vector3(0, 0, .32), new THREE.Vector3(0, .01, .08), new THREE.Vector3(0, 0, -.18),
  ], [.2, .17, .12], quality > .86 ? 24 : 16, quality > .86 ? 18 : 12), skin);
  neck.name = "aldabra-tortoise-wrinkled-extensible-neck";
  headPivot.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.27, segments, Math.max(16, segments - 12)), skin);
  head.name = "aldabra-tortoise-head";
  head.scale.set(.82, .72, 1.08);
  head.position.z = -.25;
  headPivot.add(head);
  const eyeSurface = new THREE.MeshPhysicalMaterial({ color: "#13150d", roughness: .16, clearcoat: .8 });
  for (const side of [-1, 1]) {
    const eye = glossyEye(.02, "#554225");
    eye.position.set(side * .18, .06, -.47);
    headPivot.add(eye);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(.015, 12, 8), eyeSurface);
    nostril.name = "aldabra-tortoise-nostril";
    nostril.position.set(side * .055, .02, -.55);
    headPivot.add(nostril);
  }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.13, .21, 22), skin);
  beak.name = "aldabra-tortoise-keratinous-beak";
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, -.045, -.55);
  headPivot.add(beak);
  const legs: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const leg = articulatedSweep("aldabra-tortoise-elephantine-leg", new THREE.Vector3(side * .64, .44, front * .68), [
      new THREE.Vector3(), new THREE.Vector3(side * .025, -.2, front * .015), new THREE.Vector3(side * .04, -.39, front * .04),
    ], [.19, .17, .13], skin, quality);
    leg.rotation.z = side * .08;
    root.add(leg);
    legs.push(leg);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.17, 28, 17), skin);
    foot.name = "aldabra-tortoise-scale-plated-foot";
    foot.scale.set(1.1, .54, 1.3);
    foot.position.set(side * .68, .07, front * .72 - .03);
    root.add(foot);
    for (let claw = -1; claw <= 1; claw++) {
      const nail = new THREE.Mesh(new THREE.ConeGeometry(.024, .1, 10), new THREE.MeshStandardMaterial({ color: "#d1c4a2", roughness: .8 }));
      nail.name = "aldabra-tortoise-blunt-claw";
      nail.position.set(side * .68 + claw * .055, .06, front * .72 - .2);
      nail.rotation.x = -Math.PI / 2;
      root.add(nail);
    }
  }
  shadows(root, quality > .72);
  stampPremiumAnimal(root, ["idle", "walk", "forage"]);
  return { root, ownedTextures: [shellSurface, skinSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    headPivot.position.z = -1.05 - (Math.sin(elapsed * .22) * .5 + .5) * (state === "forage" ? .22 : .12);
    headPivot.rotation.y = Math.sin(elapsed * .28) * .1;
    legs.forEach((leg, index) => { leg.rotation.x = state === "walk" ? Math.sin(elapsed * 1.3 + index * Math.PI) * .12 : 0; });
  } };
}

export function createAmericanFlamingo(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `bronx-zoo-american-flamingo-${variant + 1}`;
  root.userData.species = "american-flamingo";
  const segments = qualitySegments(quality, 46, 30, 18);
  const featherSurface = cloneZooAnimalAtlasCell(textures, 0, 1, `american-flamingo-${variant + 1}`);
  const plumage = material(textures.fur, "#ed9790", .86, featherSurface);
  const darkPlumage = material(textures.fur, "#bb5260", .89, featherSurface);
  const legMaterial = new THREE.MeshStandardMaterial({ color: "#bf7770", roughness: .72 });
  const beakMaterial = new THREE.MeshStandardMaterial({ color: "#efe4d4", roughness: .54 });
  const black = new THREE.MeshPhysicalMaterial({ color: "#151615", roughness: .22, clearcoat: .6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(18, segments - 10)), plumage);
  body.name = "flamingo-layered-ovoid-torso";
  body.scale.set(.43, .5, .72);
  body.position.y = 1.75;
  root.add(body);
  const wingPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wingPivot = new THREE.Group();
    wingPivot.name = "flamingo-articulated-wing-pivot";
    wingPivot.position.set(side * .39, 1.8, .08);
    wingPivot.userData.side = side;
    const wing = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(16, segments - 12)), darkPlumage);
    wing.name = "flamingo-folded-flight-feathers";
    wing.scale.set(.075, .38, .58);
    wingPivot.add(wing);
    for (let feather = 0; feather < 9; feather++) {
      const primary = new THREE.Mesh(new THREE.CapsuleGeometry(.025, .27 + feather * .014, 8, 12), feather < 4 ? darkPlumage : plumage);
      primary.name = "flamingo-layered-primary-and-secondary-feather";
      primary.position.set(side * (.025 + feather * .004), -.02 - feather * .045, .1 + feather * .02);
      primary.rotation.x = .18;
      primary.rotation.z = side * (.05 + feather * .018);
      wingPivot.add(primary);
    }
    root.add(wingPivot); wingPivots.push(wingPivot);
  }
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.95, -.48), new THREE.Vector3(0, 2.52, -.72),
    new THREE.Vector3(0, 3.05, -.25), new THREE.Vector3(0, 2.78, .17),
  ]);
  const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, quality > .86 ? 72 : quality > .62 ? 48 : 30, .115, quality > .86 ? 18 : 12, false), plumage);
  neck.name = "flamingo-s-curved-neck";
  root.add(neck);
  const headPivot = new THREE.Group();
  headPivot.name = "flamingo-atlas-axis-head-pivot";
  headPivot.position.set(0, 2.76, .2);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, segments, Math.max(16, segments - 12)), plumage);
  head.scale.set(.82, .9, 1.08);
  headPivot.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.12, .42, 24, 3), beakMaterial);
  beak.name = "flamingo-deep-keeled-upper-bill";
  beak.position.set(0, -.06, -.35);
  beak.rotation.x = -Math.PI / 2;
  headPivot.add(beak);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.105, .2, 24, 3), black);
  tip.name = "flamingo-black-filtering-bill-tip";
  tip.position.set(0, -.1, -.62);
  tip.rotation.x = -Math.PI / 2;
  headPivot.add(tip);
  const lowerBill = new THREE.Mesh(new THREE.CapsuleGeometry(.072, .28, 9, 18), beakMaterial);
  lowerBill.name = "flamingo-separate-lower-mandible";
  lowerBill.position.set(0, -.13, -.42);
  lowerBill.rotation.x = Math.PI / 2;
  headPivot.add(lowerBill);
  const legPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = articulatedSweep("flamingo-knee-and-ankle-leg", new THREE.Vector3(side * .17, 1.43, .08), [
      new THREE.Vector3(), new THREE.Vector3(0, -.64, .055), new THREE.Vector3(0, -1.05, -.035), new THREE.Vector3(0, -1.5, 0),
    ], [.035, .029, .025, .018], legMaterial, quality);
    root.add(pivot);
    legPivots.push(pivot);
    for (const toe of [-1, 0, 1]) {
      const foot = cylinderBetween(new THREE.Vector3(side * .17, -.07, .08), new THREE.Vector3(side * .17 + toe * .09, -.075, -.2 - Math.abs(toe) * .03), .014, legMaterial, 9);
      foot.name = "flamingo-webbed-forward-toe";
      root.add(foot);
    }
    const rearToe = cylinderBetween(new THREE.Vector3(side * .17, -.07, .08), new THREE.Vector3(side * .17, -.075, .22), .012, legMaterial, 9);
    rearToe.name = "flamingo-rear-toe"; root.add(rearToe);
    const eye = glossyEye(.016, "#d5ac40");
    eye.position.set(side * .15, .06, -.15);
    headPivot.add(eye);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(.012, 10, 7), black);
    nostril.name = "flamingo-bill-nostril";
    nostril.position.set(side * .045, -.035, -.38);
    headPivot.add(nostril);
  }
  shadows(root, quality > .72);
  stampPremiumAnimal(root, ["idle", "walk", "forage"]);
  const phase = variant * 1.4;
  return { root, ownedTextures: [featherSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    headPivot.rotation.y = Math.sin(elapsed * .43 + phase) * .18;
    headPivot.rotation.x = state === "forage" ? .45 : 0;
    legPivots.forEach((pivot, index) => { pivot.rotation.x = state === "walk" ? Math.sin(elapsed * 2.2 + index * Math.PI) * .16 : 0; });
    wingPivots.forEach((pivot, index) => { pivot.rotation.z = state === "walk" ? Math.sin(elapsed * 2.2 + index * Math.PI) * .035 : Math.sin(elapsed * .41 + index) * .012; });
    body.position.y = 1.75 + Math.sin(elapsed * .9 + phase) * .012;
  } };
}

export function createAmericanBison(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `bronx-zoo-american-bison-${variant + 1}`;
  root.userData.species = "american-bison";
  const segments = qualitySegments(quality, 50, 34, 20);
  const bisonSurface = cloneZooAnimalAtlasCell(textures, 1, 0, `american-bison-${variant + 1}`);
  const coat = material(textures.fur, "#cfb69d", .97, bisonSurface);
  const darkCoat = material(textures.fur, "#bca58f", .98, bisonSurface);
  const horn = new THREE.MeshStandardMaterial({ color: "#d4c49d", roughness: .66 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(20, segments - 10)), coat);
  body.name = "bison-massive-barrel-torso";
  body.scale.set(.74, .64, 1.35);
  body.position.set(0, 1.45, .28);
  root.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(20, segments - 10)), darkCoat);
  hump.name = "bison-shoulder-hump";
  hump.scale.set(.82, .98, .74);
  hump.position.set(0, 1.78, -.72);
  root.add(hump);
  const haunch = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(20, segments - 10)), coat);
  haunch.name = "bison-muscular-posterior-haunch";
  haunch.scale.set(.7, .65, .72);
  haunch.position.set(0, 1.42, .95);
  root.add(haunch);
  const headPivot = new THREE.Group();
  headPivot.name = "bison-heavy-neck-and-head-pivot";
  headPivot.position.set(0, 1.54, -1.54);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.63, segments, Math.max(18, segments - 12)), darkCoat);
  head.scale.set(.84, .98, 1.02);
  headPivot.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.28, segments, Math.max(16, segments - 14)), coat);
  muzzle.name = "bison-broad-natural-muzzle";
  muzzle.scale.set(1, .6, .9);
  muzzle.position.set(0, -.18, -.54);
  headPivot.add(muzzle);
  const black = new THREE.MeshPhysicalMaterial({ color: "#0d0e0c", roughness: .26, clearcoat: .25 });
  const hoofMaterial = new THREE.MeshStandardMaterial({ color: "#24201b", roughness: .88 });
  for (const side of [-1, 1]) {
    const hornMesh = new THREE.Mesh(taperedSweepGeometry([
      new THREE.Vector3(side * .38, .19, -.02), new THREE.Vector3(side * .54, .2, -.07), new THREE.Vector3(side * .64, .32, -.12), new THREE.Vector3(side * .62, .47, -.16),
    ], [.073, .06, .038, .008], quality > .86 ? 34 : 22, quality > .86 ? 18 : 12), horn);
    hornMesh.name = "bison-curved-tapered-upturned-horn";
    headPivot.add(hornMesh);
    const eye = glossyEye(.025, "#251607");
    eye.position.set(side * .35, .1, -.42);
    headPivot.add(eye);
    addTaperedEar(headPivot, darkCoat, coat, new THREE.Vector3(side * .42, .34, .02), new THREE.Vector3(.1, .075, .08), side * -.58);
    const nostril = new THREE.Mesh(new THREE.SphereGeometry(.022, 14, 9), black);
    nostril.name = "bison-defined-nostril";
    nostril.scale.set(1.25, .55, .45);
    nostril.position.set(side * .105, -.19, -.79);
    headPivot.add(nostril);
  }
  const legPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const pivot = articulatedSweep("bison-knee-hock-leg", new THREE.Vector3(side * .5, 1.18, front < 0 ? -.68 : .76), [
      new THREE.Vector3(), new THREE.Vector3(side * .02, -.48, front < 0 ? .045 : -.055), new THREE.Vector3(side * .015, -1.08, front < 0 ? -.015 : .065),
    ], front < 0 ? [.25, .19, .12] : [.23, .175, .11], front < 0 ? darkCoat : coat, quality);
    const upperLegMass = new THREE.Mesh(new THREE.SphereGeometry(front < 0 ? .25 : .23, 30, 19), front < 0 ? darkCoat : coat);
    upperLegMass.name = front < 0 ? "bison-heavy-scapular-forelimb-mass" : "bison-rounded-haunch-transition";
    upperLegMass.scale.set(1.08, 1.55, 1);
    upperLegMass.position.y = -.14;
    pivot.add(upperLegMass);
    root.add(pivot);
    legPivots.push(pivot);
    for (const toe of [-1, 1]) {
      const hoof = new THREE.Mesh(new THREE.SphereGeometry(.105, 24, 16), hoofMaterial);
      hoof.name = "bison-split-cloven-hoof";
      hoof.scale.set(.64, .5, 1.18);
      hoof.position.set(side * .5 + toe * .048, .055, front < 0 ? -.71 : .82);
      root.add(hoof);
    }
  }
  const beard = new THREE.Mesh(taperedSweepGeometry([
    new THREE.Vector3(0, 1.28, -1.48), new THREE.Vector3(0, 1.02, -1.5), new THREE.Vector3(0, .76, -1.45),
  ], [.2, .16, .018], quality > .86 ? 28 : 18, quality > .86 ? 18 : 12), darkCoat);
  beard.name = "bison-continuous-tapered-throat-beard";
  root.add(beard);
  const tailPivot = articulatedSweep("bison-tail", new THREE.Vector3(0, 1.42, 1.52), [
    new THREE.Vector3(), new THREE.Vector3(0, -.25, .18), new THREE.Vector3(0, -.58, .21),
  ], [.08, .055, .03], coat, quality);
  root.add(tailPivot);
  const tailTuft = new THREE.Mesh(new THREE.SphereGeometry(.14, 28, 17), darkCoat);
  tailTuft.name = "bison-tail-switch";
  tailTuft.scale.set(.68, 1.55, .72);
  tailTuft.position.set(0, .84, 1.73);
  root.add(tailTuft);
  shadows(root, quality > .68);
  stampPremiumAnimal(root, ["idle", "walk", "forage"]);
  const phase = variant * 1.9;
  return { root, ownedTextures: [bisonSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    headPivot.rotation.x = state === "forage" ? .34 : -.03;
    headPivot.rotation.y = Math.sin(elapsed * .26 + phase) * .08;
    legPivots.forEach((pivot, index) => { pivot.rotation.x = state === "walk" ? Math.sin(elapsed * 2.6 + index * Math.PI) * .17 : 0; });
    hump.scale.y = .98 + Math.sin(elapsed * .85 + phase) * .012;
    haunch.scale.y = .65 + Math.sin(elapsed * .85 + phase) * .006;
    tailPivot.rotation.z = Math.sin(elapsed * .58 + phase) * .12;
  } };
}
