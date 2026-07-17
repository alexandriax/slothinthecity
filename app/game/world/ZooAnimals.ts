import * as THREE from "three";
import { markTextureCloneReadyAfterSource, type GameTextures } from "../rendering/textures";

export type ZooAnimalRig = {
  root: THREE.Group;
  ownedTextures?: THREE.Texture[];
  update(elapsed: number, delta: number): void;
};

export type ZooAnimalMotionMode = "terrestrial" | "aquatic" | "arboreal" | "perch";

export type ZooHabitatMotionOptions = {
  mode: ZooAnimalMotionMode;
  radius: number;
  speed?: number;
  phase?: number;
  verticalRange?: number;
  floorHeight?: (x: number, z: number) => number;
};

type BirdPalette = {
  breast: string;
  crown: string;
  wing: string;
  tail: string;
};

function qualitySegments(quality: number, high = 28, medium = 20, low = 14) {
  return quality > .86 ? high : quality > .62 ? medium : low;
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
  const tangent = new THREE.Vector3(), next = new THREE.Vector3();
  return {
    root: rig.root,
    ownedTextures: rig.ownedTextures,
    update(elapsed, delta) {
      const cycle = ((elapsed + phase) % 18 + 18) % 18;
      const locomoting = options.mode === "aquatic" ? cycle < 13.2 : options.mode === "arboreal" ? cycle > 3.1 && cycle < 12.8 : options.mode === "perch" ? cycle > 11.6 && cycle < 14.4 : cycle > 3.4 && cycle < 12.7;
      const state = options.mode === "aquatic"
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
  const segments = qualitySegments(quality, 34, 24, 16);
  const polarSurface = cloneZooAnimalAtlasCell(textures, 0, 0, "polar-bear");
  const fur = material(textures.fur, "#eeeadd", .94, polarSurface);
  const shadowFur = material(textures.fur, "#d0ccc0", .96, polarSurface);
  const dark = new THREE.MeshPhysicalMaterial({ color: "#171916", roughness: .3, clearcoat: .42 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(14, segments - 7)), fur);
  body.name = "gary-continuous-polar-bear-torso";
  body.scale.set(1.2, .78, 1.82);
  body.position.set(0, 1.3, .35);
  root.add(body);

  const shoulders = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(14, segments - 7)), fur);
  shoulders.name = "gary-polar-bear-shoulder-mass";
  shoulders.scale.set(1.28, .9, 1.02);
  shoulders.position.set(0, 1.48, -.88);
  root.add(shoulders);

  const neck = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(14, segments - 7)), fur);
  neck.name = "gary-polar-bear-neck-transition";
  neck.scale.set(.82, .78, .9);
  neck.position.set(0, 1.63, -1.55);
  neck.rotation.x = -.13;
  root.add(neck);

  const headPivot = new THREE.Group();
  headPivot.name = "gary-polar-bear-head-pivot";
  headPivot.position.set(0, 1.8, -1.94);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(14, segments - 7)), fur);
  head.name = "gary-anatomical-polar-bear-head";
  head.scale.set(.68, .62, .78);
  headPivot.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(12, segments - 9)), shadowFur);
  muzzle.name = "gary-polar-bear-integrated-muzzle";
  muzzle.scale.set(.42, .3, .48);
  muzzle.position.set(0, -.12, -.62);
  headPivot.add(muzzle);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.16, segments, 12), dark);
  nose.name = "gary-polar-bear-nose";
  nose.scale.set(1.18, .72, .8);
  nose.position.set(0, -.1, -1.08);
  headPivot.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.13, .018, 7, 20, Math.PI), dark);
  mouth.name = "gary-polar-bear-mouth-line";
  mouth.position.set(0, -.24, -.93);
  mouth.rotation.set(Math.PI / 2, 0, Math.PI);
  headPivot.add(mouth);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.19, segments, 12), fur);
    ear.scale.set(.72, .92, .48);
    ear.position.set(side * .48, .48, -.05);
    headPivot.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 9), dark);
    eye.position.set(side * .31, .1, -.66);
    headPivot.add(eye);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(.025, .18, 5, 9), shadowFur);
    brow.position.set(side * .27, .22, -.68);
    brow.rotation.z = side * -.32;
    headPivot.add(brow);
  }

  const paws: THREE.Mesh[] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const z = front < 0 ? -1.03 : 1.12;
    const upper = new THREE.Vector3(side * .72, 1.38, z);
    const lower = new THREE.Vector3(side * .8, .46, z + (front < 0 ? -.12 : .08));
    const leg = cylinderBetween(upper, lower, .29, front < 0 ? fur : shadowFur, Math.max(10, segments / 2));
    leg.name = front < 0 ? "gary-weight-bearing-polar-bear-forelimb" : "gary-weight-bearing-polar-bear-hindlimb";
    root.add(leg);
    const paw = new THREE.Mesh(new THREE.SphereGeometry(.33, segments, 12), shadowFur);
    paw.name = "gary-grounded-polar-bear-paw";
    paw.scale.set(1.1, .48, 1.35);
    paw.position.copy(lower).add(new THREE.Vector3(0, -.18, -.08));
    root.add(paw);
    paws.push(paw);
    for (let claw = -1; claw <= 1; claw++) {
      const clawMesh = new THREE.Mesh(new THREE.ConeGeometry(.025, .13, 8), new THREE.MeshStandardMaterial({ color: "#4c493f", roughness: .7 }));
      clawMesh.name = "gary-polar-bear-visible-claw";
      clawMesh.position.copy(paw.position).add(new THREE.Vector3(claw * .085, -.03, -.31));
      clawMesh.rotation.x = -Math.PI / 2;
      root.add(clawMesh);
    }
  }
  shadows(root, quality > .62);
  const phase = .37;
  return {
    root,
    ownedTextures: [polarSurface],
    update(elapsed) {
      const state = root.userData.animationState as string | undefined;
      const breath = Math.sin(elapsed * 1.17 + phase) * .014;
      const gait = state === "walk" ? Math.sin(elapsed * 3.4) : 0;
      body.scale.y = .78 + breath + Math.abs(gait) * .008;
      shoulders.scale.y = .9 + breath * .7;
      headPivot.rotation.y = Math.sin(elapsed * .31 + phase) * (state === "forage" ? .28 : .12);
      headPivot.rotation.x = (state === "forage" ? .24 : -.02) + Math.sin(elapsed * .47) * .025;
      paws.forEach((paw, index) => { paw.position.y += (Math.sin(elapsed * 3.4 + index * Math.PI) * .016 - (paw.userData.gaitOffset ?? 0)); paw.userData.gaitOffset = Math.sin(elapsed * 3.4 + index * Math.PI) * .016; });
    },
  };
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
  const segments = qualitySegments(quality, 24, 18, 12);
  const birdCell: [0 | 1 | 2, 0 | 1 | 2] = slug === "blue-and-gold-macaw" ? [1, 1] : [0, 1];
  const featherSurface = cloneZooAnimalAtlasCell(textures, birdCell[0], birdCell[1], slug);
  const breast = material(textures.fur, palette.breast, .82, featherSurface);
  const crown = material(textures.fur, palette.crown, .8, featherSurface);
  const wing = material(textures.fur, palette.wing, .79, featherSurface);
  const tail = material(textures.fur, palette.tail, .84, featherSurface);
  const beakMaterial = new THREE.MeshStandardMaterial({ color: "#2b2924", roughness: .55 });
  const feet = new THREE.MeshStandardMaterial({ color: "#7b7164", roughness: .68 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(10, segments - 5)), breast);
  body.name = `${slug}-continuous-bird-torso`;
  body.scale.set(isIbis ? .28 : isMacaw ? .36 : .32, isIbis ? .58 : isMacaw ? .56 : .5, isIbis ? .4 : isMacaw ? .4 : .35);
  body.position.y = isIbis ? .82 : .55;
  root.add(body);
  const headPivot = new THREE.Group();
  headPivot.name = `${slug}-head-pivot`;
  headPivot.position.set(0, isIbis ? 1.55 : isMacaw ? 1.12 : 1.03, isIbis ? -.22 : -.09);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, segments, 12), crown);
  head.name = `${slug}-bird-head`;
  headPivot.add(head);
  const beak = isIbis
    ? new THREE.Mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, -.18), new THREE.Vector3(0, -.03, -.54), new THREE.Vector3(0, -.2, -.78)), 22, .032, 8, false), beakMaterial)
    : new THREE.Mesh(new THREE.ConeGeometry(isAracari ? .16 : isMacaw ? .15 : .115, isAracari ? .5 : isMacaw ? .38 : .28, Math.max(10, segments / 2)), beakMaterial);
  beak.name = isIbis ? `${slug}-long-decurved-probing-bill` : isAracari ? `${slug}-oversized-aracari-bill` : `${slug}-curved-beak`;
  if (!isIbis) {
    beak.rotation.x = -Math.PI / 2;
    beak.position.set(0, -.02, isAracari ? -.46 : isMacaw ? -.4 : -.34);
  }
  headPivot.add(beak);
  const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: "#080a08", roughness: .1, clearcoat: 1 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.033, 10, 8), eyeMaterial);
    eye.position.set(side * .22, .08, -.19);
    headPivot.add(eye);
    const wingMesh = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 12), wing);
    wingMesh.name = `${slug}-folded-wing`;
    wingMesh.scale.set(.08, .37, .3);
    wingMesh.position.set(side * .3, .57, .05);
    wingMesh.rotation.z = side * -.16;
    root.add(wingMesh);
    wingMesh.userData.side = side;
  }
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(isIbis ? .13 : isMacaw ? .25 : .22, isIbis ? .46 : isMacaw ? 1.22 : .92, Math.max(10, segments / 2)), tail);
  tailMesh.name = `${slug}-long-tail-feathers`;
  tailMesh.rotation.x = Math.PI / 2;
  tailMesh.position.set(0, isIbis ? .72 : .43, isIbis ? .46 : .57);
  tailMesh.scale.x = .72;
  root.add(tailMesh);
  const throat = new THREE.Mesh(new THREE.SphereGeometry(isIbis ? .16 : .22, segments, 10), breast);
  throat.name = `${slug}-layered-throat-plumage`;
  throat.scale.set(.82, 1.15, .48);
  throat.position.set(0, isIbis ? 1.22 : .82, isIbis ? -.2 : -.27);
  root.add(throat);
  if (isIbis) {
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
    for (const toeSide of [-1, 1]) {
      const toe = cylinderBetween(new THREE.Vector3(side * .1, isIbis ? -.01 : .04, -.02), new THREE.Vector3(side * .1 + toeSide * (isIbis ? .11 : .07), isIbis ? -.02 : .015, -.1), .009, feet, 7);
      root.add(toe);
    }
  }
  root.scale.setScalar(scale);
  shadows(root, quality > .72);
  const phase = slug.length * .71;
  return {
    root,
    ownedTextures: [featherSurface],
    update(elapsed) {
      const state = root.userData.animationState as string | undefined;
      headPivot.rotation.y = Math.sin(elapsed * .82 + phase) * .22;
      headPivot.rotation.x = (state === "preen" ? .42 : 0) + Math.sin(elapsed * 1.27 + phase) * .04;
      root.children.forEach(child => {
        if (child.name !== `${slug}-folded-wing`) return;
        const side = child.userData.side as number;
        const flight = state === "short-flight" ? Math.sin(elapsed * 11 + phase) * .72 : Math.max(0, Math.sin(elapsed * .63 + phase) - .94) * .7;
        child.rotation.z = side * (-.16 - flight);
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
  bird.root.userData.commonName = "Sun conure";
  return bird;
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
  const segments = qualitySegments(quality, 22, 16, 11);
  const monkeySurface = cloneZooAnimalAtlasCell(textures, 1, 0, `spider-monkey-${variant + 1}`);
  const coat = material(textures.fur, variant % 2 ? "#332b25" : "#493b2e", .94, monkeySurface);
  const face = material(textures.fur, "#b78d65", .86);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 14), coat);
  body.name = "spider-monkey-anatomical-torso";
  body.scale.set(.36, .62, .3);
  body.position.y = 1.18;
  root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.32, segments, 12), coat);
  head.name = "spider-monkey-head";
  head.position.set(0, 1.92, -.05);
  root.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.2, segments, 10), face);
  muzzle.name = "spider-monkey-muzzle";
  muzzle.scale.set(.9, .65, .65);
  muzzle.position.set(0, 1.85, -.27);
  root.add(muzzle);
  const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: "#090806", roughness: .12, clearcoat: .9 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.036, 10, 8), eyeMaterial);
    eye.name = "spider-monkey-forward-eye";
    eye.position.set(side * .13, 1.99, -.27);
    root.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.11, segments, 9), face);
    ear.scale.x = .45;
    ear.position.set(side * .31, 1.94, -.03);
    root.add(ear);
  }
  const limbRoots: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const arm of [true, false]) {
    const pivot = new THREE.Group();
    pivot.name = arm ? "spider-monkey-arm-pivot" : "spider-monkey-leg-pivot";
    pivot.position.set(side * (arm ? .31 : .24), arm ? 1.55 : .88, 0);
    const end = new THREE.Vector3(side * (arm ? .55 : .4), arm ? -.88 : -.72, arm ? -.06 : .08);
    const limb = cylinderBetween(new THREE.Vector3(), end, arm ? .075 : .09, coat, Math.max(8, segments / 2));
    limb.name = arm ? "long-spider-monkey-arm" : "spider-monkey-hindlimb";
    pivot.add(limb);
    root.add(pivot);
    limbRoots.push(pivot);
  }
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.1, .25),
    new THREE.Vector3(.42, 1.02, .58),
    new THREE.Vector3(.55, 1.6, .76),
    new THREE.Vector3(.2, 2.18, .62),
    new THREE.Vector3(-.15, 2.12, .45),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, quality > .72 ? 34 : 22, .055, 9, false), coat);
  tail.name = "prehensile-spider-monkey-tail";
  root.add(tail);
  shadows(root, quality > .72);
  const phase = variant * 1.73;
  return {
    root,
    ownedTextures: [monkeySurface],
    update(elapsed) {
      const state = root.userData.animationState as string | undefined;
      limbRoots.forEach((pivot, index) => {
        const amplitude = state === "swing" ? .42 : state === "forage" ? .16 : .06;
        pivot.rotation.z = Math.sin(elapsed * (state === "swing" ? 2.2 : .58) + phase + index * 1.4) * amplitude;
        pivot.rotation.x = state === "swing" ? Math.sin(elapsed * 2.2 + index * Math.PI) * .18 : 0;
      });
      head.rotation.y = Math.sin(elapsed * .49 + phase) * .16;
      body.rotation.z = state === "swing" ? Math.sin(elapsed * 2.2 + phase) * .1 : 0;
    },
  };
}

export function createSeaLion(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `bronx-zoo-sea-lion-${variant + 1}`;
  root.userData.species = "california-sea-lion";
  const segments = qualitySegments(quality, 28, 20, 14);
  const seaLionSurface = cloneZooAnimalAtlasCell(textures, 0, 2, `sea-lion-${variant + 1}`);
  const skin = material(textures.fur, variant % 2 ? "#394846" : "#4b5551", .54, seaLionSurface);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.48, 1.35, 12, segments), skin);
  body.name = "streamlined-sea-lion-body";
  body.rotation.x = Math.PI / 2;
  body.position.set(0, .5, .15);
  root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.42, segments, 14), skin);
  head.name = "sea-lion-head";
  head.position.set(0, .62, -1.08);
  root.add(head);
  const flippers: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const flipper = new THREE.Mesh(new THREE.ConeGeometry(.2, .72, 12), skin);
    flipper.name = "sea-lion-front-flipper";
    flipper.position.set(side * .42, .25, -.3);
    flipper.rotation.z = side * -.95;
    root.add(flipper);
    flippers.push(flipper);
  }
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.23, segments, 10), skin);
  muzzle.name = "sea-lion-whiskered-muzzle";
  muzzle.scale.set(1.15, .7, .8);
  muzzle.position.set(0, .54, -1.42);
  root.add(muzzle);
  const eyeMaterial = new THREE.MeshPhysicalMaterial({ color: "#0b0d0c", roughness: .08, clearcoat: 1 });
  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), eyeMaterial);
    eye.position.set(side * .22, .75, -1.36);
    root.add(eye);
    for (let whisker = -1; whisker <= 1; whisker++) {
      const line = cylinderBetween(new THREE.Vector3(side * .12, .54 + whisker * .035, -1.58), new THREE.Vector3(side * .48, .5 + whisker * .08, -1.79), .006, eyeMaterial, 5);
      line.name = "sea-lion-sensitive-whisker";
      root.add(line);
    }
  }
  shadows(root, quality > .72);
  const phase = variant * 2.1;
  return { root, ownedTextures: [seaLionSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    head.rotation.y = Math.sin(elapsed * .45 + phase) * (state === "surface" ? .3 : .16);
    body.position.y = .5 + Math.sin(elapsed * (state === "swim" ? 2.1 : .9) + phase) * (state === "swim" ? .055 : .018);
    body.rotation.z = state === "swim" ? Math.sin(elapsed * 2.1 + phase) * .08 : 0;
    flippers.forEach((flipper, index) => { flipper.rotation.x = state === "swim" ? Math.sin(elapsed * 3.4 + index * Math.PI) * .34 : 0; });
  } };
}

export function createRedPanda(textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "bronx-zoo-red-panda";
  root.userData.species = "red-panda";
  const segments = qualitySegments(quality, 24, 18, 12);
  const redPandaSurface = cloneZooAnimalAtlasCell(textures, 2, 0, "red-panda");
  const tailSurface = cloneZooAnimalAtlasCell(textures, 2, 0, "red-panda-tail");
  const red = material(textures.fur, "#9b4528", .94, redPandaSurface);
  const dark = material(textures.fur, "#2d2722", .95);
  const cream = material(textures.fur, "#d8c39b", .93);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 14), red);
  body.name = "red-panda-torso";
  body.scale.set(.42, .38, .78);
  body.position.y = .58;
  root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.38, segments, 13), red);
  head.name = "red-panda-head";
  head.position.set(0, .83, -.68);
  root.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.23, segments, 10), cream);
  muzzle.scale.set(1, .7, .62);
  muzzle.position.set(0, .77, -.98);
  root.add(muzzle);
  const legs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.16, .28, 12), dark);
    ear.position.set(side * .25, 1.16, -.68);
    root.add(ear);
    for (const front of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.075, .09, .48, 10), dark);
      leg.position.set(side * .28, .27, front * .4);
      root.add(leg);
      legs.push(leg);
    }
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), new THREE.MeshPhysicalMaterial({ color: "#0c0b09", clearcoat: 1, roughness: .1 }));
    eye.position.set(side * .14, .9, -.99);
    root.add(eye);
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(.15, segments, 9), cream);
    cheek.scale.set(.72, 1, .42);
    cheek.position.set(side * .17, .83, -.94);
    root.add(cheek);
  }
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .63, .67), new THREE.Vector3(.5, .65, 1.08), new THREE.Vector3(.86, .5, 1.38), new THREE.Vector3(1.12, .42, 1.62),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 34, .14, 14, false), material(textures.fur, "#a54d2b", .94, tailSurface));
  tail.name = "red-panda-ringed-tail";
  root.add(tail);
  shadows(root, quality > .72);
  return { root, ownedTextures: [redPandaSurface, tailSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    head.rotation.y = Math.sin(elapsed * .38) * (state === "forage" ? .34 : .2);
    head.rotation.x = state === "forage" ? .28 : 0;
    tail.rotation.y = Math.sin(elapsed * .52) * .12;
    legs.forEach((leg, index) => { leg.rotation.x = state === "walk" ? Math.sin(elapsed * 4 + index * Math.PI) * .22 : 0; });
  } };
}

export function createZebra(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `bronx-zoo-plains-zebra-${variant + 1}`;
  root.userData.species = "plains-zebra";
  const segments = qualitySegments(quality, 24, 17, 12);
  const zebraSurface = cloneZooAnimalAtlasCell(textures, 2, 1, `zebra-${variant + 1}`);
  const white = material(textures.fur, "#d8d4c7", .91, zebraSurface);
  const black = material(textures.fur, "#24241f", .94);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 14), white);
  body.name = "zebra-anatomical-torso";
  body.scale.set(.64, .58, 1.18);
  body.position.y = 1.3;
  root.add(body);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .85, 10, segments), white);
  neck.name = "zebra-neck";
  neck.position.set(0, 1.86, -.95);
  neck.rotation.x = -.42;
  root.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.34, segments, 12), white);
  head.name = "zebra-head";
  head.scale.set(.7, .8, 1.25);
  head.position.set(0, 2.38, -1.38);
  root.add(head);
  const legs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 1.18, 11), white);
    leg.name = "zebra-leg";
    leg.position.set(side * .42, .62, front * .72);
    root.add(leg);
    legs.push(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(.12, .1, .18, 11), black);
    hoof.position.set(side * .42, .04, front * .72);
    root.add(hoof);
  }
  const mane = new THREE.Mesh(new THREE.BoxGeometry(.08, .55, .92), black);
  mane.name = "zebra-mane";
  mane.position.set(0, 2.15, -.87);
  mane.rotation.x = -.35;
  root.add(mane);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.1, .31, 10), white);
    ear.position.set(side * .2, 2.72, -1.31);
    ear.rotation.z = side * -.18;
    root.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.032, 10, 8), black);
    eye.position.set(side * .2, 2.48, -1.62);
    root.add(eye);
  }
  root.scale.setScalar(.9 + variant * .04);
  shadows(root, quality > .72);
  const phase = variant * 1.2;
  return { root, ownedTextures: [zebraSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    head.rotation.y = Math.sin(elapsed * .3 + phase) * .12;
    head.rotation.x = state === "forage" ? .38 : 0;
    body.position.y = 1.3 + Math.sin(elapsed * .72 + phase) * .009;
    legs.forEach((leg, index) => { leg.rotation.x = state === "walk" ? Math.sin(elapsed * 3.5 + index * Math.PI) * .2 : 0; });
  } };
}

export function createAldabraTortoise(textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "bronx-zoo-aldabra-giant-tortoise";
  root.userData.species = "aldabra-giant-tortoise";
  const segments = qualitySegments(quality, 26, 18, 12);
  const shellSurface = cloneZooAnimalAtlasCell(textures, 1, 2, "aldabra-tortoise-shell");
  const skinSurface = cloneZooAnimalAtlasCell(textures, 1, 2, "aldabra-tortoise-skin");
  const shellMaterial = new THREE.MeshStandardMaterial({ map: shellSurface, bumpMap: textures.bark, bumpScale: .07, color: "#6f6851", roughness: .96 });
  const skin = material(textures.fur, "#676851", .96, skinSurface);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 14), shellMaterial);
  shell.name = "aldabra-tortoise-domed-shell";
  shell.scale.set(.92, .48, 1.12);
  shell.position.y = .54;
  root.add(shell);
  const headPivot = new THREE.Group(); headPivot.position.set(0, .42, -1.05); root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.27, segments, 11), skin);
  head.name = "aldabra-tortoise-head";
  head.scale.set(.82, .72, 1.08);
  headPivot.add(head);
  const legs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.13, .17, .52, 11), skin);
    leg.name = "aldabra-tortoise-leg";
    leg.position.set(side * .64, .23, front * .68);
    leg.rotation.z = side * .08;
    root.add(leg);
    legs.push(leg);
  }
  shadows(root, quality > .72);
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
  const segments = qualitySegments(quality, 26, 18, 12);
  const featherSurface = cloneZooAnimalAtlasCell(textures, 0, 1, `american-flamingo-${variant + 1}`);
  const plumage = material(textures.fur, "#ed9790", .86, featherSurface);
  const darkPlumage = material(textures.fur, "#bb5260", .89, featherSurface);
  const legMaterial = new THREE.MeshStandardMaterial({ color: "#bf7770", roughness: .72 });
  const beakMaterial = new THREE.MeshStandardMaterial({ color: "#efe4d4", roughness: .54 });
  const black = new THREE.MeshPhysicalMaterial({ color: "#151615", roughness: .22, clearcoat: .6 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 14), plumage);
  body.name = "flamingo-layered-ovoid-torso";
  body.scale.set(.43, .5, .72);
  body.position.y = 1.75;
  root.add(body);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 12), darkPlumage);
    wing.name = "flamingo-folded-flight-feathers";
    wing.scale.set(.075, .38, .58);
    wing.position.set(side * .39, 1.8, .08);
    root.add(wing);
  }
  const neckCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 1.95, -.48), new THREE.Vector3(0, 2.52, -.72),
    new THREE.Vector3(0, 3.05, -.25), new THREE.Vector3(0, 2.78, .17),
  ]);
  const neck = new THREE.Mesh(new THREE.TubeGeometry(neckCurve, quality > .72 ? 42 : 28, .115, 12, false), plumage);
  neck.name = "flamingo-s-curved-neck";
  root.add(neck);
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 2.76, .2);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, segments, 11), plumage);
  head.scale.set(.82, .9, 1.08);
  headPivot.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.12, .42, 12), beakMaterial);
  beak.position.set(0, -.06, -.35);
  beak.rotation.x = -Math.PI / 2;
  headPivot.add(beak);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.105, .2, 12), black);
  tip.position.set(0, -.1, -.62);
  tip.rotation.x = -Math.PI / 2;
  headPivot.add(tip);
  const legPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * .17, 1.43, .08);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.024, .03, 1.5, 8), legMaterial);
    leg.position.y = -.75;
    pivot.add(leg);
    const foot = cylinderBetween(new THREE.Vector3(0, -1.49, 0), new THREE.Vector3(0, -1.5, -.28), .018, legMaterial, 6);
    pivot.add(foot);
    root.add(pivot);
    legPivots.push(pivot);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.025, 9, 7), black);
    eye.position.set(side * .15, .06, -.15);
    headPivot.add(eye);
  }
  shadows(root, quality > .72);
  const phase = variant * 1.4;
  return { root, ownedTextures: [featherSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    headPivot.rotation.y = Math.sin(elapsed * .43 + phase) * .18;
    headPivot.rotation.x = state === "forage" ? .45 : 0;
    legPivots.forEach((pivot, index) => { pivot.rotation.x = state === "walk" ? Math.sin(elapsed * 2.2 + index * Math.PI) * .16 : 0; });
    body.position.y = 1.75 + Math.sin(elapsed * .9 + phase) * .012;
  } };
}

export function createAmericanBison(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `bronx-zoo-american-bison-${variant + 1}`;
  root.userData.species = "american-bison";
  const segments = qualitySegments(quality, 26, 19, 13);
  const bisonSurface = cloneZooAnimalAtlasCell(textures, 1, 0, `american-bison-${variant + 1}`);
  const coat = material(textures.fur, "#49372a", .97, bisonSurface);
  const darkCoat = material(textures.fur, "#2d241e", .98, bisonSurface);
  const horn = new THREE.MeshStandardMaterial({ color: "#d4c49d", roughness: .66 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 15), coat);
  body.name = "bison-massive-barrel-torso";
  body.scale.set(.9, .88, 1.48);
  body.position.set(0, 1.4, .25);
  root.add(body);
  const hump = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 14), darkCoat);
  hump.name = "bison-shoulder-hump";
  hump.scale.set(.98, 1.12, .88);
  hump.position.set(0, 1.78, -.78);
  root.add(hump);
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.53, -1.6);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.62, segments, 13), darkCoat);
  head.scale.set(.9, 1.02, 1.05);
  headPivot.add(head);
  const muzzle = new THREE.Mesh(new THREE.SphereGeometry(.35, segments, 11), coat);
  muzzle.scale.set(1, .65, .75);
  muzzle.position.set(0, -.19, -.55);
  headPivot.add(muzzle);
  const black = new THREE.MeshPhysicalMaterial({ color: "#0d0e0c", roughness: .2, clearcoat: .55 });
  for (const side of [-1, 1]) {
    const hornMesh = new THREE.Mesh(new THREE.ConeGeometry(.1, .52, 12), horn);
    hornMesh.name = "bison-upturned-horn";
    hornMesh.position.set(side * .55, .23, -.08);
    hornMesh.rotation.z = side * -.9;
    headPivot.add(hornMesh);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.035, 10, 8), black);
    eye.position.set(side * .42, .12, -.43);
    headPivot.add(eye);
  }
  const legPivots: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * .58, 1.05, front < 0 ? -.78 : .82);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, 1.05, 11), front < 0 ? darkCoat : coat);
    leg.position.y = -.52;
    pivot.add(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(.17, .14, .18, 10), black);
    hoof.position.y = -1.03;
    pivot.add(hoof);
    root.add(pivot);
    legPivots.push(pivot);
  }
  const beard = new THREE.Mesh(new THREE.ConeGeometry(.24, .7, 14), darkCoat);
  beard.name = "bison-throat-beard";
  beard.position.set(0, .95, -1.55);
  root.add(beard);
  shadows(root, quality > .68);
  const phase = variant * 1.9;
  return { root, ownedTextures: [bisonSurface], update(elapsed) {
    const state = root.userData.animationState as string | undefined;
    headPivot.rotation.x = state === "forage" ? .34 : -.03;
    headPivot.rotation.y = Math.sin(elapsed * .26 + phase) * .08;
    legPivots.forEach((pivot, index) => { pivot.rotation.x = state === "walk" ? Math.sin(elapsed * 2.6 + index * Math.PI) * .17 : 0; });
    hump.scale.y = 1.12 + Math.sin(elapsed * .85 + phase) * .012;
  } };
}
