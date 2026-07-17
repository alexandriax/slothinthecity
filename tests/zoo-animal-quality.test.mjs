import assert from "node:assert/strict";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadBundledModule(entryPoint, source = null) {
  const options = source
    ? { stdin: { contents: source, resolveDir: process.cwd() } }
    : { entryPoints: [entryPoint] };
  const result = await esbuild.build({
    ...options,
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  const loadedModule = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(
    loadedModule,
    loadedModule.exports,
    () => { throw new Error("quality harness encountered an unexpected external require"); },
  );
  return loadedModule.exports;
}

const ZooAnimals = await loadBundledModule("app/game/world/ZooAnimals.ts");
const THREE = await loadBundledModule(null, "export * from 'three'");

function testTextures() {
  const texture = () => {
    const result = new THREE.Texture();
    result.source = new THREE.Source({ width: 3, height: 3 });
    return result;
  };
  return { zooAnimalAtlas: texture(), fur: texture(), bark: texture() };
}

const SPECIES = [
  { name: "Gary", create: ZooAnimals.createGaryPolarBear, anatomy: /muzzle|paw|claw|inner-ear/ },
  { name: "Sun conure", create: ZooAnimals.createSunConure, anatomy: /mandible|feather|grasping-toe/ },
  { name: "Macaw", create: ZooAnimals.createBlueAndGoldMacaw, anatomy: /mandible|feather|grasping-toe/ },
  { name: "Scarlet ibis", create: ZooAnimals.createScarletIbis, anatomy: /probing-bill|feather|grasping-toe/ },
  { name: "Green aracari", create: ZooAnimals.createGreenAracari, anatomy: /mandible|feather|grasping-toe/ },
  { name: "Spider monkey", create: ZooAnimals.createSpiderMonkey, anatomy: /facial-mask|finger|prehensile.*tail/ },
  { name: "Sea lion", create: ZooAnimals.createSeaLion, anatomy: /pinna|whisker|hind-flipper/ },
  { name: "Red panda", create: ZooAnimals.createRedPanda, anatomy: /tear-mark|claw|tail-ring/ },
  { name: "Zebra", create: ZooAnimals.createZebra, anatomy: /nostril|mane-ridge|split-weight-bearing-hoof/ },
  { name: "Aldabra tortoise", create: ZooAnimals.createAldabraTortoise, anatomy: /shell-scute|keratinous-beak|blunt-claw/ },
  { name: "Flamingo", create: ZooAnimals.createAmericanFlamingo, anatomy: /mandible|primary-and-secondary-feather|webbed-forward-toe/ },
  { name: "American bison", create: ZooAnimals.createAmericanBison, anatomy: /curved-tapered.*horn|nostril|cloven-hoof/ },
];

function namedAnatomy(root) {
  const names = [];
  root.traverse(object => { if (object.name) names.push(object.name); });
  return names.join(" ");
}

function articulationSnapshot(root) {
  const values = [];
  root.traverse(object => {
    if (object.type !== "Group" || !/pivot|joint|shoulder|hip|neck/i.test(object.name)) return;
    values.push(
      object.position.x, object.position.y, object.position.z,
      object.rotation.x, object.rotation.y, object.rotation.z,
    );
  });
  return values.map(value => value.toFixed(4)).join(",");
}

function allNamed(root, name) {
  const matches = [];
  root.traverse(object => { if (object.name === name) matches.push(object); });
  return matches;
}

test("premium zoo animals hold five-figure close geometry with real mobile and balanced budgets", () => {
  const textures = testTextures();
  for (const species of SPECIES) {
    const highRig = species.create(textures, 1);
    const balancedRig = species.create(textures, .72);
    const mobileRig = species.create(textures, .5);
    const high = ZooAnimals.measureZooAnimalGeometry(highRig.root);
    const balanced = ZooAnimals.measureZooAnimalGeometry(balancedRig.root);
    const mobile = ZooAnimals.measureZooAnimalGeometry(mobileRig.root);

    assert.ok(high.triangles >= 15_000, `${species.name} high tier should retain a five-figure close silhouette`);
    assert.ok(high.vertices >= 10_000, `${species.name} high tier should retain a dense anatomical surface`);
    assert.ok(high.meshes >= 20 && high.meshes <= 60, `${species.name} should retain detailed but bounded modular anatomy`);
    assert.ok(high.articulatedJoints >= 3, `${species.name} should expose at least three named articulated joints`);
    assert.ok(balanced.triangles < high.triangles * .76, `${species.name} balanced tier should materially reduce high-tier triangles`);
    assert.ok(mobile.triangles < balanced.triangles, `${species.name} mobile tier should be the smallest geometry budget`);
    assert.equal(highRig.root.userData.animalFidelity, "articulated-procedural-v2");
    assert.deepEqual(highRig.root.userData.geometryMetrics, high, `${species.name} should publish exact showroom metrics`);
    assert.match(namedAnatomy(highRig.root), /anatomical-eye-with-cornea/, `${species.name} should use layered glossy eyes`);
    assert.match(namedAnatomy(highRig.root), species.anatomy, `${species.name} should preserve identifying anatomy`);
  }
});

test("every species publishes and visibly performs three distinct species-appropriate animation states", () => {
  const textures = testTextures();
  for (const species of SPECIES) {
    const rig = species.create(textures, 1);
    const states = rig.root.userData.animationStates;
    assert.ok(Array.isArray(states) && states.length >= 3, `${species.name} should publish at least three animation states`);
    const snapshots = states.map((state, index) => {
      rig.root.userData.animationState = state;
      rig.update(1.37 + index * 1.91, 1 / 60);
      return articulationSnapshot(rig.root);
    });
    assert.equal(new Set(snapshots).size, states.length, `${species.name} states should produce distinct joint poses`);
  }
});

test("hero anatomy uses natural proportions instead of bean bodies, plush heads, bars, or glossy toy feet", () => {
  const textures = testTextures();

  const gary = ZooAnimals.createGaryPolarBear(textures, 1).root;
  const garyTorso = gary.getObjectByName("gary-continuous-polar-bear-torso");
  const garyEyes = allNamed(gary, "anatomical-eye-with-cornea");
  garyTorso.geometry.computeBoundingBox();
  const garyTorsoSize = new THREE.Vector3();
  garyTorso.geometry.boundingBox.getSize(garyTorsoSize);
  assert.ok(garyTorsoSize.z / garyTorsoSize.x > 1.45, "Gary should have one elongated tapered ursine trunk, not intersecting orb masses");
  assert.ok(garyTorso.position.y - garyTorsoSize.y * garyTorso.scale.y * .5 > .7, "Gary's abdomen should clear visibly long weight-bearing limbs");
  const garyPaws = allNamed(gary, "gary-grounded-polar-bear-paw");
  assert.equal(garyPaws.length, 4);
  assert.ok(garyPaws.every(paw => /limb.*pivot/.test(paw.parent.name)), "Gary's paws must be parented to the articulated legs they visually contact");
  assert.equal(garyEyes.length, 2);
  assert.ok(garyEyes.every(eye => eye.children.length === 1), "Gary's clearcoat corneas should not add fake geometric catchlight eyes");
  assert.ok(garyEyes[0].children[0].geometry.parameters.radius <= .032, "Gary's eye scale should remain natural relative to his skull");

  const conure = ZooAnimals.createSunConure(textures, 1).root;
  const conureHead = conure.getObjectByName("sun-conure-bird-head");
  const conureTorso = conure.getObjectByName("sun-conure-continuous-bird-torso");
  assert.ok(conureHead.geometry.parameters.radius <= .2, "the conure skull should not dominate its body like a plush toy");
  assert.ok(conureTorso.scale.y / conureTorso.scale.x > 1.8, "the conure should retain a tapered upright avian trunk");
  assert.ok(allNamed(conure, "anatomical-eye-with-cornea").every(eye => eye.children.length === 1), "bird eyes should not contain duplicate catchlight spheres");

  const monkey = ZooAnimals.createSpiderMonkey(textures, 1).root;
  assert.doesNotMatch(namedAnatomy(monkey), /brow/i, "spider monkeys should not use human-cartoon eyebrow bars");
  assert.equal(allNamed(monkey, "spider-monkey-defined-elbow-volume").length, 2);
  assert.equal(allNamed(monkey, "spider-monkey-defined-knee-volume").length, 2);
  assert.ok(monkey.getObjectByName("spider-monkey-anatomical-torso").scale.y < .5, "monkey torso should be compact between distinct chest and pelvis masses");

  const bison = ZooAnimals.createAmericanBison(textures, 1).root;
  const bisonTorso = bison.getObjectByName("bison-massive-barrel-torso");
  const bisonHooves = allNamed(bison, "bison-split-cloven-hoof");
  assert.ok(bisonTorso.scale.z / bisonTorso.scale.x > 1.75, "bison should use a long barrel silhouette instead of a giant sphere");
  assert.ok(bisonTorso.position.y - bisonTorso.scale.y > .75, "bison barrel should clear full weight-bearing leg anatomy");
  assert.equal(allNamed(bison, "bison-curved-tapered-upturned-horn").length, 2);
  assert.doesNotMatch(namedAnatomy(bison), /horn-fine-tip/, "bison horns should be continuous tapered sweeps without cone seams");
  assert.equal(bisonHooves.length, 8);
  assert.ok(bisonHooves.every(hoof => hoof.material.roughness >= .8), "cloven hooves should be matte keratin, not glossy dots");
});
