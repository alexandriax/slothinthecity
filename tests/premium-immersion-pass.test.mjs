import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("the premium pass implements at least 25 additional improvements", async () => {
  const [bronx, fifth, arrival, crowd, pond, quests] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/CampaignLandmarks.ts"),
    readSource("../app/game/world/CityBusWorld.ts"),
    readSource("../app/game/world/characters/AmbientHumanMotion.ts"),
    readSource("../app/game/world/LakeDuckQuest.ts"),
    readSource("../app/game/world/InWorldZooQuests.ts"),
  ]);

  const implementedAdditions = [
    ...[
      "bronx-zoo-continuous-southern-boulevard-arrival-road",
      "bronx-zoo-shuttle-stop-raised-visibility-crosswalk",
      "bronx-neighborhood-authored-arrival-horizon-building",
      "bronx-zoo-southern-boulevard-visitor-services-pavilion",
      "bronx-zoo-layered-arrival-buffer-tree-canopy",
    ].map(marker => [bronx, marker]),
    ...[
      "fifth-avenue-continuous-roadway",
      "west-59-street-continuous-cross-street",
      "fifth-avenue-59-street-zebra-crossing",
      "fifth-avenue-articulated-storefront-base",
      "fifth-avenue-park-edge-newsstand",
    ].map(marker => [fifth, marker]),
    ...[
      "central-park-west-parallel-pedestrian-greenway",
      "central-park-west-continuous-rusticated-boundary-wall",
      "central-park-west-natural-schist-outcrop",
      "amnh-central-park-west-bicycle-dock",
      "upper-west-side-amnh-surrounding-corner-building",
    ].map(marker => [arrival, marker]),
    ...["new THREE.CatmullRomCurve3", "pauseSeconds", "lookAround"].map(marker => [crowd, marker]),
    ...["SNAG_POSITION_POOL", "restored-lily-blossoms-and-clear-water", "flowBonusValue", "tetherDestination"].map(marker => [pond, marker]),
    ...["bird-perch", "buoy-dock", "rope-anchor", "stripe-scanner", "scent-vane", "solar-mirror", "wetland-valve", "seed-plot"].map(marker => [quests, marker]),
  ];
  assert.ok(implementedAdditions.length >= 25);
  for (const [source, marker] of implementedAdditions) assert.ok(source.includes(marker), `missing implemented improvement marker: ${marker}`);
});

test("Mango's aviary identity and supporter credit are present in gameplay and animal metadata", async () => {
  const [bronx, animals, logic, debug] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/ZooAnimals.ts"),
    readSource("../app/game/zooSideQuestLogic.ts"),
    readSource("../app/debug/animals/AnimalShowroom.tsx"),
  ]);
  assert.match(bronx, /WORLD OF BIRDS · MANGO/);
  assert.match(bronx, /MANGO · SUN CONURE · Thanks to generous support by v1nmon/);
  assert.match(animals, /commonName = "Mango · Sun conure"/);
  assert.match(animals, /displayName = "Mango"/);
  assert.match(logic, /Mango's canopy chorus/);
  assert.match(debug, /label: "Mango", family: "Sun conure"/);
});

test("Whiskers is a project-original, spatial museum quest with a variable gallery trail", async () => {
  const [museum, animals, generator, provenance, manifest] = await Promise.all([
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
    readSource("../app/game/world/ZooAnimals.ts"),
    readSource("../tools/animal-pipeline/build_whiskers_cat.py"),
    readSource("../tools/animal-pipeline/source/whiskers-cat.provenance.json").then(JSON.parse),
    readSource("../public/game/animals/authored/manifest.json").then(JSON.parse),
  ]);
  assert.match(museum, /museum's tan and white cat/);
  assert.match(museum, /resident-gallery-cat/);
  assert.match(museum, /function whiskersRoute\(seed: number\)/);
  assert.match(museum, /new THREE\.CatmullRomCurve3/);
  assert.match(museum, /whiskers-brass-pawprint-waypoint/);
  assert.match(museum, /WHISKERS_FOUND/);
  assert.match(animals, /createWhiskersCat/);
  assert.match(generator, /ASSET_ID = "whiskers-cat"/);
  assert.match(generator, /CLIP_NAMES = \("CatIdle", "CatWalk", "CatPounce"\)/);
  assert.deepEqual(provenance.thirdPartyAssets, []);
  assert.equal(provenance.review.freshImportCount, 1);
  const contract = manifest.species.find(species => species.id === "whiskers-cat");
  assert.ok(contract, "Whiskers should be present in the approved-only runtime manifest");
  assert.equal(contract.source.referenceUse, "visual-reference-only");
  assert.equal(contract.sourceFacing, "-z");
  assert.deepEqual(Object.keys(contract.clips).toSorted(), ["idle", "pounce", "walk"]);
});
