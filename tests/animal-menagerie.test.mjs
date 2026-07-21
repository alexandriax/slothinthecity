import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("the optional menagerie has one persistent authored companion for every side quest", async () => {
  const source = await readSource("../app/game/world/AnimalMenagerie.ts");
  for (const id of [
    "central-park-mallard",
    "central-park-squirrel",
    "sun-conure",
    "blue-and-gold-macaw",
    "scarlet-ibis",
    "green-aracari",
    "california-sea-lion",
    "spider-monkey",
    "plains-zebra",
    "red-panda",
    "aldabra-tortoise",
    "american-flamingo",
    "american-bison",
  ]) assert.match(source, new RegExp(`\\|? "${id}"`));

  for (const factory of [
    "createMallard",
    "createEasternGraySquirrel",
    "createSunConure",
    "createBlueAndGoldMacaw",
    "createScarletIbis",
    "createGreenAracari",
    "createSeaLion",
    "createSpiderMonkey",
    "createZebra",
    "createRedPanda",
    "createAldabraTortoise",
    "createAmericanFlamingo",
    "createAmericanBison",
  ]) assert.match(source, new RegExp(factory));

  assert.match(source, /sceneOwnedCompanionParty = true/);
  assert.match(source, /get count\(\) \{ return this\.recruited\.length; \}/);
  assert.match(source, /get riderCount\(\) \{ return this\.count \+ 1; \}/);
  assert.match(source, /recruitmentOrder = this\.nextRecruitmentOrder\+\+/);
  assert.match(source, /private createCompanion\(definition: CompanionDefinition\)/);
  assert.match(source, /this\.companions\.get\(id\) \?\? this\.createCompanion\(definition\)/);
  const constructor = source.slice(source.indexOf("constructor(scene:"), source.indexOf("get isActive"));
  assert.doesNotMatch(constructor, /definition\.factory|createElectricScooter/);
  assert.match(source, /markAuthoredZooAnimalsDisposed\(this\.root\)/);
});

test("one allocation-light route and solver coordinate optional, sloth, and Gary bodies", async () => {
  const [navigation, menagerie, sloths, gary] = await Promise.all([
    readSource("../app/game/world/CompanionNavigation.ts"),
    readSource("../app/game/world/AnimalMenagerie.ts"),
    readSource("../app/game/world/SlothFollowerParty.ts"),
    readSource("../app/game/world/GaryCompanion.ts"),
  ]);

  assert.match(navigation, /class SharedCompanionRoute/);
  assert.match(navigation, /private head = 0/);
  assert.match(navigation, /private size = 0/);
  assert.doesNotMatch(navigation.slice(navigation.indexOf("solveCompanionCollisions")), /new THREE\.Vector/);
  assert.match(navigation, /clearance = left\.radius \+ right\.radius \+ padding/);
  assert.match(navigation, /deterministicSeparationDirection/);
  assert.match(navigation, /if \(left\.enabled === false\) continue/);
  assert.match(navigation, /options\.resolveBody\(body\.root\.position, body\.velocity, body\.radius\)/);
  assert.match(menagerie, /for \(const body of externalBodies\) this\.solverBodies\.push\(body\)/);
  assert.match(menagerie, /solveCompanionCollisions\(this\.solverBodies/);
  assert.match(sloths, /get collisionBodies\(\): readonly CompanionCollisionBody\[\]/);
  assert.match(sloths, /follower\.collisionBody\.enabled = false/);
  assert.match(sloths, /follower\.collisionBody\.enabled = true/);
  assert.match(gary, /get collisionBodies\(\): readonly CompanionCollisionBody\[\]/);
  assert.match(gary, /id: "gary-polar-bear"/);
});

test("formation slots and scooter travel scale without random reshuffling", async () => {
  const [navigation, menagerie] = await Promise.all([
    readSource("../app/game/world/CompanionNavigation.ts"),
    readSource("../app/game/world/AnimalMenagerie.ts"),
  ]);

  for (const formation of ["station", "train", "scooter", "grove"]) {
    assert.match(navigation, new RegExp(`formation === "${formation}"`));
  }
  assert.match(navigation, /export type CompanionFormation = "grove" \| "open" \| "scooter" \| "station" \| "train"/);
  assert.doesNotMatch(navigation, /Math\.random/);
  assert.doesNotMatch(menagerie, /Math\.random/);
  assert.match(menagerie, /formation === "scooter" \? catchingUp \? 10\.8 : 9\.05/);
  assert.match(menagerie, /createElectricScooter\(scooterIndex \+ 6\)/);
  assert.match(menagerie, /rollPersonalMobility\(companion\.scooter, moved, \.19\)/);
  assert.match(menagerie, /allWithin\(point: THREE\.Vector3, radius: number\)/);
  assert.match(menagerie, /stageFinale\(point: THREE\.Vector3/);
});
