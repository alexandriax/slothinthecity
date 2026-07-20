import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("every Bronx Zoo habitat quest hands its animal to the persistent menagerie", async () => {
  const [logic, zoo, game, menagerie, screen, audio, css] = await Promise.all([
    readSource("../app/game/zooSideQuestLogic.ts"),
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/AnimalMenagerie.ts"),
    readSource("../app/game/ZooSideQuestScreen.tsx"),
    readSource("../app/game/systems/audio/PremiumAudioDirector.ts"),
    readSource("../app/game/ZooSideQuestScreen.module.css"),
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
  assert.match(game, /audio=\{audio\}/);
  assert.match(screen, /Listen to phrase/);
  assert.match(screen, /playZooQuestCue\("bird-call"/);
  assert.match(screen, /function seaLionStagePosition/);
  assert.match(screen, /13 \+ \(point\.x \/ 6\) \* 74/);
  assert.match(screen, /className=\{styles\.gateManifest\}/);
  assert.match(screen, /className=\{styles\.launchControls\}/);
  assert.match(screen, /completionTimerRef\.current = window\.setTimeout\(onSolved, 420\)/);
  assert.match(screen, /Math\.min\(2600, previous\.hold \+ 100\)/);
  assert.doesNotMatch(css, /prairieLayout \.launchControls \{ display: none/);
  assert.match(css, /z-index: 620/);
  assert.match(audio, /playZooQuestCue\(cue: ZooQuestAudioCue/);
  assert.match(audio, /this\.duckScoreFor\(\.58, \.24\)/);
  assert.match(audio, /gain: variant === 1 \? \.18 : \.155/);
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
  assert.match(park, /getWorldPassengerTransform/);
  assert.match(park, /const duckInteractionActor = activeBoat\?\.root\.position \?\? player/);
  assert.match(park, /duckActionLockedUntil/);
  assert.match(park, /floorYAt: \(x, z\) => groundHeight\(x, z\) - 1\.48/);
  assert.match(park, /resolveBody: resolveDuckCompanion/);
  assert.match(game, /totalFollowerCount/);
  assert.match(game, /friendCountLabel\(totalFollowerCount\(\)\)/);
  assert.match(game, /riderCountLabel\(totalFollowerCount\(\)\)/);
  assert.match(game, /useState\(initialCompanionIds\.length\)/);
  assert.match(game, /animalMenagerie\.reset\(player, player\.y - 1\.48, yaw\)/);
  assert.match(game, /if \(!zooOverlayPaused\) gameTime \+= delta/);
  assert.match(museum, /const scooterCapacity = Math\.max\(1, Math\.floor\(riderCount\)\)/);
  assert.match(museum, /for \(let index = 0; index < scooterCapacity; index\+\+\)/);
  assert.match(navigation, /solveCompanionCollisions/);
  assert.match(navigation, /const iterations = options\.iterations \?\? 5/);
  assert.match(navigation, /for \(let iteration = 0; iteration < iterations; iteration\+\+\)/);
  for (const source of [subway, train, zoo, museum, returnPark]) assert.match(source, /resolveCompanion\(/);
});
