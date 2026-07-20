import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("every Bronx Zoo habitat quest hands its animal to the persistent menagerie", async () => {
  const [logic, zoo, game, menagerie] = await Promise.all([
    readSource("../app/game/zooSideQuestLogic.ts"),
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/AnimalMenagerie.ts"),
  ]);

  const questIds = [
    "aviary-voices",
    "sea-lion-current",
    "monkey-canopy-rig",
    "zebra-stripe-scan",
    "red-panda-scent-wind",
    "tortoise-sun-trail",
    "flamingo-wetland-balance",
    "bison-prairie-seeding",
  ];
  for (const id of questIds) {
    assert.match(logic, new RegExp(`"${id}"`));
    assert.match(zoo, new RegExp(`"${id}"`));
  }
  for (const species of [
    "sun-conure", "blue-and-gold-macaw", "scarlet-ibis", "green-aracari",
    "california-sea-lion", "spider-monkey", "plains-zebra", "red-panda",
    "aldabra-tortoise", "american-flamingo", "american-bison",
  ]) assert.match(menagerie, new RegExp(`"${species}"`));

  assert.match(zoo, /kind: "ANIMAL_QUEST_STARTED"/);
  assert.match(zoo, /completeAnimalQuest\(questId: ZooSideQuestId\)/);
  assert.match(game, /zooWorld\.completeAnimalQuest\(questId\)/);
  assert.match(game, /animalMenagerie\.recruit\(id, spawn, floorY\)/);
  assert.match(game, /<ZooSideQuestScreen/);
});

test("the lake duck, dynamic counts, scalable scooters, and collision-safe convoy persist across worlds", async () => {
  const [park, game, museum, navigation, subway, train, zoo, returnPark] = await Promise.all([
    readSource("../app/game/GameClient.tsx"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
    readSource("../app/game/world/CompanionNavigation.ts"),
    readSource("../app/game/world/SubwayWorld.ts"),
    readSource("../app/game/world/TrainInteriorWorld.ts"),
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/CentralParkReturnWorld.ts"),
  ]);

  assert.match(park, /new LakeDuckQuest/);
  assert.match(park, /CENTRAL_PARK_MALLARD_COMPANION_ID/);
  assert.match(park, /onEnterSubway\(duckRecruited \? \[CENTRAL_PARK_MALLARD_COMPANION_ID\] : \[\]\)/);
  assert.match(game, /totalFollowerCount/);
  assert.match(game, /friendCountLabel\(totalFollowerCount\(\)\)/);
  assert.match(game, /riderCountLabel\(totalFollowerCount\(\)\)/);
  assert.match(museum, /const scooterCapacity = Math\.max\(1, Math\.floor\(riderCount\)\)/);
  assert.match(museum, /for \(let index = 0; index < scooterCapacity; index\+\+\)/);
  assert.match(navigation, /solveCompanionCollisions/);
  assert.match(navigation, /const iterations = options\.iterations \?\? 5/);
  assert.match(navigation, /for \(let iteration = 0; iteration < iterations; iteration\+\+\)/);
  for (const source of [subway, train, zoo, museum, returnPark]) assert.match(source, /resolveCompanion\(/);
});
