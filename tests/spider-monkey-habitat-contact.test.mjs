import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("the monkey habitat limits canopy motion and keeps two asynchronous ground foragers", async () => {
  const zoo = await readSource("../app/game/world/BronxZooWorld.ts");
  const start = zoo.indexOf("private addMonkeyHabitat");
  const end = zoo.indexOf("private addZebraHabitat", start);
  const habitat = zoo.slice(start, end);

  assert.equal((habitat.match(/createSpiderMonkey\(textures, quality,/g) ?? []).length, 3);
  assert.equal((habitat.match(/habitatRole = "canopy-contact-climber"/g) ?? []).length, 1);
  assert.equal((habitat.match(/habitatRole = "ground-walk-forage"/g) ?? []).length, 2);
  assert.equal((habitat.match(/mode: "terrestrial"/g) ?? []).length, 2);
  assert.equal((habitat.match(/mode: "arboreal"/g) ?? []).length, 0, "monkeys must not use the generic airborne arboreal orbit");

  assert.match(habitat, /motionPhase = 2\.6/);
  assert.match(habitat, /phase: 2\.8, animationSpeed: \.91/);
  assert.match(habitat, /phase: 7\.1, animationSpeed: 1\.08/);
  assert.match(habitat, /state === "perch" \? \.78 : state === "climb" \? \.93 : 1\.07/);

  const canopyWrapper = habitat.slice(
    habitat.indexOf("const contactAnimatedCanopy"),
    habitat.indexOf("placeAnimal(this.root, this.animals, contactAnimatedCanopy"),
  );
  assert.match(canopyWrapper, /const state = cycle < 10\.2 \? "perch" : cycle < 16\.4 \? "climb" : "swing"/);
  assert.doesNotMatch(canopyWrapper, /root\.position\.|configureAutonomousZooAnimal/, "contact clips must not translate through empty canopy space");
});

test("perch, climb, and swing clips have visible measured contact geometry", async () => {
  const zoo = await readSource("../app/game/world/BronxZooWorld.ts");
  const start = zoo.indexOf("private addMonkeyHabitat");
  const end = zoo.indexOf("private addZebraHabitat", start);
  const habitat = zoo.slice(start, end);

  for (const support of [
    "spider-monkey-load-bearing-contact-branch",
    "spider-monkey-perch-hand-contact-branch",
    "spider-monkey-swing-hand-contact-branch",
    "spider-monkey-prehensile-tail-contact-branch",
    "spider-monkey-authored-climb-hand-contact-rope",
    "spider-monkey-authored-climb-foot-contact-rung",
  ]) assert.match(habitat, new RegExp(support));

  assert.match(habitat, /canopyMotionUsesRootTranslation = false/);
  assert.match(habitat, /supportedClipStates = \["perch", "climb", "swing"\]/);
  assert.match(habitat, /climbContactFrames = \[1, 16, 31, 46, 61\]/);
  assert.match(habitat, /new THREE\.Vector3\(-\.14, \.98, 1\.05\)[\s\S]{0,180}new THREE\.Vector3\(\.14, 1\.78, \.12\)/);
  assert.match(habitat, /measuredHandContacts = \[/);
  assert.match(habitat, /"foot-and-hand-branches"/);
  assert.match(habitat, /"measured-climb-rope-and-foot-rung"/);
  assert.match(habitat, /"hand-and-prehensile-tail-branches"/);
});

test("authored animal clips honor per-animal animation speed separately from route speed", async () => {
  const [animals, authored] = await Promise.all([
    readSource("../app/game/world/ZooAnimals.ts"),
    readSource("../app/game/world/animals/AuthoredZooAnimalAssets.ts"),
  ]);

  assert.match(animals, /animationSpeed\?: number/);
  assert.match(animals, /userData\.animationSpeed = THREE\.MathUtils\.clamp\(options\.animationSpeed \?\? 1, \.35, 1\.8\)/);
  assert.match(animals, /userData\.habitatMotionPhase = phase/);
  assert.match(authored, /const requestedSpeed = Number\(rig\.root\.userData\.animationSpeed \?\? 1\)/);
  assert.match(authored, /Number\.isFinite\(requestedSpeed\) \? requestedSpeed : 1/);
});
