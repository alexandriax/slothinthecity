import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import * as esbuild from "esbuild";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

async function loadAviaryHarness() {
  const nodeRequire = createRequire(import.meta.url);
  const result = await esbuild.build({
    stdin: {
      contents: `
        export { BronxZooWorld } from "./app/game/world/BronxZooWorld.ts";
        export * as THREE from "three";
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    external: [
      "three/addons/loaders/DRACOLoader.js",
      "three/addons/loaders/GLTFLoader.js",
      "three/addons/utils/SkeletonUtils.js",
    ],
    write: false,
    logLevel: "silent",
  });
  const loadedModule = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(
    loadedModule,
    loadedModule.exports,
    request => nodeRequire(request),
  );
  return loadedModule.exports;
}

test("World of Birds uses three contact perchers and only one contained flyer", async () => {
  const zoo = await readSource("../app/game/world/BronxZooWorld.ts");
  const start = zoo.indexOf("private addBirdHabitat");
  const end = zoo.indexOf("private addGaryHabitat", start);
  const habitat = zoo.slice(start, end);

  for (const creator of ["createSunConure", "createBlueAndGoldMacaw", "createScarletIbis", "createGreenAracari"]) {
    assert.equal((habitat.match(new RegExp(`${creator}\\(textures, quality\\)`, "g")) ?? []).length, 1);
  }
  assert.equal((habitat.match(/addContactPerchedBird\(create/g) ?? []).length, 3);
  assert.equal((habitat.match(/habitatRole = "contained-contact-flyer"/g) ?? []).length, 1);
  assert.equal((habitat.match(/"short-flight"/g) ?? []).length, 1);
  assert.doesNotMatch(habitat, /mode: "perch"|configureAutonomousZooAnimal/, "aviary birds must not use the generic airborne orbit");

  const fixedWrapper = habitat.slice(
    habitat.indexOf("const addContactPerchedBird"),
    habitat.indexOf("// Only the aracari flies"),
  );
  assert.match(fixedWrapper, /const state = cycle < 10\.5 \? "perch" : "preen"/);
  assert.doesNotMatch(fixedWrapper.slice(fixedWrapper.indexOf("update(elapsed, delta)")), /root\.position\./, "fixed perch clips must not translate the bird root");
});

test("aviary perches publish toe contact and the flight arc has supported endpoints", async () => {
  const zoo = await readSource("../app/game/world/BronxZooWorld.ts");
  const start = zoo.indexOf("private addBirdHabitat");
  const end = zoo.indexOf("private addGaryHabitat", start);
  const habitat = zoo.slice(start, end);

  assert.equal((habitat.match(/addContactPerch\("/g) ?? []).length, 5);
  assert.match(habitat, /new THREE\.Vector3\(Math\.cos\(yaw\), 0, -Math\.sin\(yaw\)\)/, "support must follow the bird's lateral foot axis");
  assert.match(habitat, /contactTopY - footContactOffset/);
  assert.match(habitat, /-load-bearing-foot-contact-branch/);
  assert.match(habitat, /-visible-suspension-rope-/);
  assert.match(habitat, /flightFrom\.copy\(outbound \? aracariTakeoffPerch\.contactPosition : aracariLandingPerch\.contactPosition\)/);
  assert.match(habitat, /flightTo\.copy\(outbound \? aracariLandingPerch\.contactPosition : aracariTakeoffPerch\.contactPosition\)/);
  assert.match(habitat, /const eased = flightT \* flightT \* \(3 - 2 \* flightT\)/);
  assert.match(habitat, /Math\.sin\(flightT \* Math\.PI\) \* 1\.35/);
  assert.match(habitat, /const perch = atLandingPerch \? aracariLandingPerch : aracariTakeoffPerch/);
});

test("runtime aviary motion stays on supports and lands the sole flyer exactly", async () => {
  const { BronxZooWorld, THREE } = await loadAviaryHarness();
  const texture = () => {
    const result = new THREE.Texture();
    result.source = new THREE.Source({ width: 4, height: 4 });
    return result;
  };
  const textures = {
    ground: texture(), bark: texture(), fur: texture(), zooAnimalAtlas: texture(),
    foliage: texture(), foliageBranch: texture(), fern: texture(), gravel: texture(),
    stone: texture(), moss: texture(), waterNormal: texture(),
  };
  const scene = new THREE.Scene();
  const world = new BronxZooWorld(scene, textures, .22);
  const fixedBirds = [], flyers = [], contactBranches = new Map();
  world.root.traverse(object => {
    if (object.userData.habitatRole === "fixed-contact-percher") fixedBirds.push(object);
    if (object.userData.habitatRole === "contained-contact-flyer") flyers.push(object);
    if (object.name.endsWith("-load-bearing-foot-contact-branch")) contactBranches.set(object.name, object);
  });
  assert.equal(fixedBirds.length, 3);
  assert.equal(flyers.length, 1);
  assert.equal(contactBranches.size, 5);

  const fixedStarts = fixedBirds.map(bird => bird.position.clone());
  world.update(0, 1 / 60);
  world.update(7, 1 / 60);
  world.update(14, 1 / 60);
  fixedBirds.forEach((bird, index) => {
    assert.ok(bird.position.distanceTo(fixedStarts[index]) < 1e-9, `${bird.name} left its contact perch`);
    const branch = contactBranches.get(bird.userData.contactSupport);
    assert.ok(branch, `${bird.name} is missing its published contact branch`);
    assert.ok(Math.abs(bird.position.y + branch.userData.footContactOffset - branch.userData.contactTopY) < 1e-9);
  });

  const flyer = flyers[0];
  world.update(5.000001, 1 / 60); // immediately after cycle 8.4: numerical takeoff endpoint
  const takeoff = flyer.position.clone();
  assert.equal(flyer.userData.animationState, "short-flight");
  world.update(6.4, 1 / 60); // cycle 9.8: top of the contained arc
  const apex = flyer.position.clone();
  assert.ok(apex.y > takeoff.y + 1, "contained flight needs a readable airborne phase");
  world.update(7.800001, 1 / 60); // immediately after cycle 11.2: exact landing support
  const landing = flyer.position.clone();
  assert.equal(flyer.userData.animationState, "perch");
  assert.equal(flyer.userData.activeContactSupport, "green-aracari-landing");
  const landingBranch = contactBranches.get("green-aracari-landing-load-bearing-foot-contact-branch");
  assert.ok(landingBranch);
  assert.ok(Math.abs(landing.y + landingBranch.userData.footContactOffset - landingBranch.userData.contactTopY) < 1e-9);
  assert.ok(landing.distanceTo(takeoff) > 2, "flight must connect two distinct visible supports");

  world.dispose();
});
