import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("every Bronx Zoo habitat quest plays in-world and hands its animal to the persistent menagerie", async () => {
  const [logic, zoo, game, menagerie, spatialQuests, audio] = await Promise.all([
    readSource("../app/game/zooSideQuestLogic.ts"),
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/AnimalMenagerie.ts"),
    readSource("../app/game/world/InWorldZooQuests.ts"),
    readSource("../app/game/systems/audio/PremiumAudioDirector.ts"),
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
    assert.match(spatialQuests, new RegExp(`"${id}"`));
  }
  for (const species of [
    "sun-conure", "blue-and-gold-macaw", "scarlet-ibis", "green-aracari",
    "california-sea-lion", "spider-monkey", "plains-zebra", "red-panda",
    "aldabra-tortoise", "american-flamingo", "american-bison",
  ]) assert.match(menagerie, new RegExp(`"${species}"`));

  assert.match(zoo, /kind: "ANIMAL_QUEST_STARTED"/);
  assert.match(zoo, /kind: "ANIMAL_QUEST_ADVANCED"/);
  assert.match(zoo, /kind: "ANIMAL_QUEST_COMPLETED"/);
  assert.match(zoo, /kind: "ANIMAL_QUEST_OPERATION_STARTED"/);
  assert.match(zoo, /consumeHabitatEvent/);
  assert.match(zoo, /The habitat remains alive for future field replays/);
  assert.doesNotMatch(zoo, /source\.visible = false/, "recruiting an ambassador must not empty the zoo habitat");
  assert.match(zoo, /completeAnimalQuest\(questId: ZooSideQuestId\)/);
  assert.match(game, /const recruitHabitatQuestAnimals = \(questId: ZooSideQuestId\)/);
  assert.match(game, /animalMenagerie\.recruit\(id, spawn, floorY\)/);
  assert.doesNotMatch(game, /ZooSideQuestScreen/);
  assert.match(game, /data-side-quest="in-world"/);
  assert.match(spatialQuests, /triggerRadius: 20\.5/);
  assert.match(spatialQuests, /createInWorldZooQuestOrder/);
  assert.match(spatialQuests, /HABITAT_QUEST_OPERATIONS/);
  for (const kind of ["bird-perch", "buoy-dock", "rope-anchor", "stripe-scanner", "scent-vane", "solar-mirror", "wetland-valve", "seed-plot"]) {
    assert.match(spatialQuests, new RegExp(`kind: "${kind}"`));
  }
  assert.match(audio, /playZooQuestCue\(cue: ZooQuestAudioCue/);
  assert.match(audio, /this\.duckScoreFor\(\.58, \.24\)/);
  assert.match(audio, /gain: variant === 1 \? \.18 : \.155/);
});

test("Tanner, Zap, dynamic counts, scalable scooters, and collision-safe convoy persist across worlds", async () => {
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
  assert.match(park, /new ParkSquirrelQuest/);
  assert.match(park, /CENTRAL_PARK_MALLARD_COMPANION_ID/);
  assert.match(park, /CENTRAL_PARK_SQUIRREL_COMPANION_ID/);
  assert.match(park, /\.\.\.\(duckRecruited \? \[CENTRAL_PARK_MALLARD_COMPANION_ID\] : \[\]\)/);
  assert.match(park, /\.\.\.\(squirrelRecruited \? \[CENTRAL_PARK_SQUIRREL_COMPANION_ID\] : \[\]\)/);
  assert.match(park, /getWorldPassengerTransform/);
  assert.match(park, /const duckInteractionActor = activeBoat\?\.root\.position \?\? player/);
  assert.match(park, /duckActionLockedUntil/);
  assert.match(park, /floorYAt: \(x, z\) => groundHeight\(x, z\) - 1\.48/);
  assert.match(park, /resolveBody: resolveDuckCompanion/);
  assert.match(park, /squirrelQuest\.update/);
  assert.match(game, /totalFollowerCount/);
  assert.match(game, /friendCountLabel\(totalFollowerCount\(\)\)/);
  assert.match(game, /riderCountLabel\(totalFollowerCount\(\)\)/);
  assert.match(game, /useState\(initialCompanionIds\.length\)/);
  assert.match(game, /animalMenagerie\.reset\(player, player\.y - 1\.48, yaw\)/);
  assert.match(game, /zooOverlayPaused = transitStage === "BRONX_ZOO" && lockPickingRef\.current/);
  assert.match(museum, /const scooterCapacity = Math\.max\(1, Math\.floor\(riderCount\)\)/);
  assert.match(museum, /for \(let index = 0; index < scooterCapacity; index\+\+\)/);
  assert.match(navigation, /solveCompanionCollisions/);
  assert.match(navigation, /const iterations = options\.iterations \?\? 5/);
  assert.match(navigation, /for \(let iteration = 0; iteration < iterations; iteration\+\+\)/);
  for (const source of [subway, train, zoo, museum, returnPark]) assert.match(source, /resolveCompanion\(/);
});
