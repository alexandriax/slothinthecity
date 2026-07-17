import * as THREE from "three";
import type { GameTextures } from "../rendering/textures";

export type ZooAnimalRig = {
  root: THREE.Group;
  update(elapsed: number, delta: number): void;
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

function shadows(root: THREE.Object3D, enabled: boolean) {
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.castShadow = enabled;
    object.receiveShadow = false;
  });
}

function material(texture: THREE.Texture, color: string, roughness = .88) {
  return new THREE.MeshStandardMaterial({
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
  const fur = material(textures.fur, "#e8e3d5", .94);
  const shadowFur = material(textures.fur, "#c8c4b7", .96);
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
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.19, segments, 12), fur);
    ear.scale.set(.72, .92, .48);
    ear.position.set(side * .48, .48, -.05);
    headPivot.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.055, 12, 9), dark);
    eye.position.set(side * .31, .1, -.66);
    headPivot.add(eye);
  }

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
  }
  shadows(root, quality > .62);
  const phase = .37;
  return {
    root,
    update(elapsed) {
      const breath = Math.sin(elapsed * 1.17 + phase) * .014;
      body.scale.y = .78 + breath;
      shoulders.scale.y = .9 + breath * .7;
      headPivot.rotation.y = Math.sin(elapsed * .31 + phase) * .12;
      headPivot.rotation.x = -.02 + Math.sin(elapsed * .47) * .025;
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
  root.name = `${slug}-bird`;
  root.userData.species = slug;
  const segments = qualitySegments(quality, 24, 18, 12);
  const breast = material(textures.fur, palette.breast, .82);
  const crown = material(textures.fur, palette.crown, .8);
  const wing = material(textures.fur, palette.wing, .79);
  const tail = material(textures.fur, palette.tail, .84);
  const beakMaterial = new THREE.MeshStandardMaterial({ color: "#2b2924", roughness: .55 });
  const feet = new THREE.MeshStandardMaterial({ color: "#7b7164", roughness: .68 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, Math.max(10, segments - 5)), breast);
  body.name = `${slug}-continuous-bird-torso`;
  body.scale.set(.32, .5, .35);
  body.position.y = .55;
  root.add(body);
  const headPivot = new THREE.Group();
  headPivot.name = `${slug}-head-pivot`;
  headPivot.position.set(0, 1.03, -.09);
  root.add(headPivot);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.3, segments, 12), crown);
  head.name = `${slug}-bird-head`;
  headPivot.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.115, .28, Math.max(10, segments / 2)), beakMaterial);
  beak.name = `${slug}-curved-beak`;
  beak.rotation.x = -Math.PI / 2;
  beak.position.set(0, -.02, -.34);
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
  const tailMesh = new THREE.Mesh(new THREE.ConeGeometry(.22, .92, Math.max(10, segments / 2)), tail);
  tailMesh.name = `${slug}-long-tail-feathers`;
  tailMesh.rotation.x = Math.PI / 2;
  tailMesh.position.set(0, .43, .57);
  tailMesh.scale.x = .72;
  root.add(tailMesh);
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.022, .028, .26, 8), feet);
    leg.position.set(side * .1, .16, -.02);
    root.add(leg);
    for (const toeSide of [-1, 1]) {
      const toe = cylinderBetween(new THREE.Vector3(side * .1, .04, -.02), new THREE.Vector3(side * .1 + toeSide * .07, .015, -.1), .009, feet, 7);
      root.add(toe);
    }
  }
  root.scale.setScalar(scale);
  shadows(root, quality > .72);
  const phase = slug.length * .71;
  return {
    root,
    update(elapsed) {
      headPivot.rotation.y = Math.sin(elapsed * .82 + phase) * .22;
      headPivot.rotation.x = Math.sin(elapsed * 1.27 + phase) * .04;
      root.children.forEach(child => {
        if (child.name !== `${slug}-folded-wing`) return;
        const side = child.userData.side as number;
        child.rotation.z = side * (-.16 - Math.max(0, Math.sin(elapsed * .63 + phase) - .94) * .7);
      });
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
  const coat = material(textures.fur, variant % 2 ? "#332b25" : "#493b2e", .94);
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
    update(elapsed) {
      root.rotation.y = Math.sin(elapsed * .22 + phase) * .12;
      limbRoots.forEach((pivot, index) => {
        pivot.rotation.z = Math.sin(elapsed * .58 + phase + index * 1.4) * .08;
      });
      head.rotation.y = Math.sin(elapsed * .49 + phase) * .16;
    },
  };
}

export function createSeaLion(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `bronx-zoo-sea-lion-${variant + 1}`;
  root.userData.species = "california-sea-lion";
  const segments = qualitySegments(quality, 28, 20, 14);
  const skin = material(textures.fur, variant % 2 ? "#394846" : "#4b5551", .54);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.48, 1.35, 12, segments), skin);
  body.name = "streamlined-sea-lion-body";
  body.rotation.x = Math.PI / 2;
  body.position.set(0, .5, .15);
  root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.42, segments, 14), skin);
  head.name = "sea-lion-head";
  head.position.set(0, .62, -1.08);
  root.add(head);
  for (const side of [-1, 1]) {
    const flipper = new THREE.Mesh(new THREE.ConeGeometry(.2, .72, 12), skin);
    flipper.name = "sea-lion-front-flipper";
    flipper.position.set(side * .42, .25, -.3);
    flipper.rotation.z = side * -.95;
    root.add(flipper);
  }
  shadows(root, quality > .72);
  const phase = variant * 2.1;
  return { root, update(elapsed) { head.rotation.y = Math.sin(elapsed * .45 + phase) * .16; body.position.y = .5 + Math.sin(elapsed * .9 + phase) * .018; } };
}

export function createRedPanda(textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "bronx-zoo-red-panda";
  root.userData.species = "red-panda";
  const segments = qualitySegments(quality, 24, 18, 12);
  const red = material(textures.fur, "#9b4528", .94);
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
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.16, .28, 12), dark);
    ear.position.set(side * .25, 1.16, -.68);
    root.add(ear);
    for (const front of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(.075, .09, .48, 10), dark);
      leg.position.set(side * .28, .27, front * .4);
      root.add(leg);
    }
  }
  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, .63, .67), new THREE.Vector3(.5, .65, 1.08), new THREE.Vector3(.86, .5, 1.38), new THREE.Vector3(1.12, .42, 1.62),
  ]);
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 26, .14, 12, false), red);
  tail.name = "red-panda-ringed-tail";
  root.add(tail);
  shadows(root, quality > .72);
  return { root, update(elapsed) { head.rotation.y = Math.sin(elapsed * .38) * .2; tail.rotation.y = Math.sin(elapsed * .52) * .12; } };
}

export function createZebra(textures: GameTextures, quality: number, variant = 0): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = `bronx-zoo-plains-zebra-${variant + 1}`;
  root.userData.species = "plains-zebra";
  const segments = qualitySegments(quality, 24, 17, 12);
  const white = material(textures.fur, "#d8d4c7", .91);
  const black = material(textures.fur, "#24241f", .94);
  const body = new THREE.Mesh(new THREE.SphereGeometry(1, segments, 14), white);
  body.name = "zebra-anatomical-torso";
  body.scale.set(.64, .58, 1.18);
  body.position.y = 1.3;
  root.add(body);
  for (let stripe = -4; stripe <= 4; stripe++) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(.61, .035, 8, 22), black);
    band.name = "zebra-body-stripe";
    band.position.set(0, 1.3, stripe * .23);
    band.rotation.x = Math.PI / 2;
    band.scale.y = .9;
    root.add(band);
  }
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
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 1.18, 11), white);
    leg.name = "zebra-leg";
    leg.position.set(side * .42, .62, front * .72);
    root.add(leg);
    const hoof = new THREE.Mesh(new THREE.CylinderGeometry(.12, .1, .18, 11), black);
    hoof.position.set(side * .42, .04, front * .72);
    root.add(hoof);
  }
  const mane = new THREE.Mesh(new THREE.BoxGeometry(.08, .55, .92), black);
  mane.name = "zebra-mane";
  mane.position.set(0, 2.15, -.87);
  mane.rotation.x = -.35;
  root.add(mane);
  root.scale.setScalar(.9 + variant * .04);
  shadows(root, quality > .72);
  const phase = variant * 1.2;
  return { root, update(elapsed) { head.rotation.y = Math.sin(elapsed * .3 + phase) * .12; body.position.y = 1.3 + Math.sin(elapsed * .72 + phase) * .009; } };
}

export function createAldabraTortoise(textures: GameTextures, quality: number): ZooAnimalRig {
  const root = new THREE.Group();
  root.name = "bronx-zoo-aldabra-giant-tortoise";
  root.userData.species = "aldabra-giant-tortoise";
  const segments = qualitySegments(quality, 26, 18, 12);
  const shellMaterial = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .07, color: "#514b37", roughness: .96 });
  const skin = material(textures.fur, "#676851", .96);
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
  for (const side of [-1, 1]) for (const front of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.13, .17, .52, 11), skin);
    leg.name = "aldabra-tortoise-leg";
    leg.position.set(side * .64, .23, front * .68);
    leg.rotation.z = side * .08;
    root.add(leg);
  }
  shadows(root, quality > .72);
  return { root, update(elapsed) { headPivot.position.z = -1.05 - (Math.sin(elapsed * .22) * .5 + .5) * .12; headPivot.rotation.y = Math.sin(elapsed * .28) * .1; } };
}
