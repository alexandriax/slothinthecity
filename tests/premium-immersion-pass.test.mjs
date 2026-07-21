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
      "bronx-borough-scale-urban-ground-to-fog",
      "bronx-borough-complete-street-grid",
      "bronx-full-volume-varied-building-field",
      "west-farms-elevated-subway-viaduct",
      "bronx-animated-context-traffic",
      "bronx-street-tree-network-canopies",
      "bronx-utility-pole-and-wire-network-catenary",
      "bronx-distant-density-skyline-through-fog",
      "bronx-corridor-recessed-storefront-door-network",
      "bronx-corridor-human-scale-blade-sign-network",
      "bronx-building-south-north-window-frame-depth-field",
      "bronx-corridor-curbside-grounded-parked-vehicle",
      "bronx-neighborhood-ground-floor-glazing-and-interior-light",
      "bronx-neighborhood-luminous-storefront-signage",
      "bronx-neighborhood-masonry-floor-and-spandrel-bands",
      "bronx-arrival-plaza-grounded-stone-planter",
      "bronx-arrival-city-newsbox-and-litter-bin-network",
      "bronx-arrival-sidewalk-grounded-bicycle-rack",
      "bronx-animated-context-traffic-ground-contact-wheel",
    ].map(marker => [bronx, marker]),
    ...[
      "fifth-avenue-continuous-roadway",
      "west-59-street-continuous-cross-street",
      "fifth-avenue-59-street-zebra-crossing",
      "fifth-avenue-articulated-storefront-base",
      "fifth-avenue-park-edge-newsstand",
      "fifth-avenue-continuous-central-park-ground-underlay",
      "fifth-avenue-layered-park-woodland-canopy-to-fog",
      "fifth-avenue-human-scale-overhead-subway-sign",
      "fifth-avenue-transparent-human-scale-subway-canopy",
      "fifth-avenue-dense-park-horizon-canopy-wall",
      "fifth-avenue-dense-park-horizon-understory",
    ].map(marker => [fifth, marker]),
    ...[
      "central-park-west-parallel-pedestrian-greenway",
      "central-park-west-continuous-rusticated-boundary-wall",
      "central-park-west-natural-schist-outcrop",
      "amnh-central-park-west-bicycle-dock",
      "upper-west-side-amnh-surrounding-corner-building",
    ].map(marker => [arrival, marker]),
    ...["new THREE.CatmullRomCurve3", "pauseSeconds", "lookAround"].map(marker => [crowd, marker]),
    ...["Tanner", "WAITING_FOR_YIELD", "DUCKS HAVE RIGHT OF WAY", "family-crossing-duck"].map(marker => [pond, marker]),
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
  assert.match(museum, /Meet the planetarium's manager Skye's cat Whiskers/);
  assert.doesNotMatch(museum, /amnh-whiskers-resident-gallery-cat-introduction-sign/);
  assert.doesNotMatch(museum, /TAN & WHITE RESIDENT GALLERY CAT/);
  assert.match(museum, /resident-gallery-cat/);
  assert.match(museum, /function whiskersRoute\(seed: number\)/);
  assert.match(museum, /if \(distance > 5\.2\) return null/);
  assert.match(museum, /beginWhiskersTrail\(elapsed: number\)/);
  assert.match(museum, /planMuseumCompanionPath\(from, to, this\.boxes, this\.circles, \.28\)/);
  assert.match(museum, /whiskers-brass-pawprint-waypoint/);
  assert.match(museum, /forwardGalleryVariants/);
  assert.match(museum, /const travelDelta = Number\.isFinite\(delta\) \? Math\.max\(0, delta\) : 0/);
  assert.match(museum, /whiskersTravelProgress \+ travelDelta \* 3\.35/);
  assert.match(museum, /sampleWhiskersTravel\(this\.whiskersTravelProgress, this\.whiskers\.root\.position\)/);
  assert.match(museum, /if \(!Number\.isFinite\(this\.whiskersTravelProgress\)\) this\.whiskersTravelProgress = 0/);
  assert.match(museum, /playerDistance < 7\.5 : playerDistance > 11\.5/);
  assert.match(museum, /if \(this\.whiskersTravelActive\) return this\.whiskers\.root\.position\.clone\(\)/);
  assert.match(museum, /whiskers-fresh-route-paw/);
  assert.match(museum, /this\.resolveCompanion\(this\.whiskers\.root\.position, this\.whiskersResolveVelocity, \.28\)/);
  assert.match(museum, /WHISKERS_FOUND/);
  assert.match(museum, /museum-continuous-warm-terrazzo-gallery-runner/);
  assert.match(museum, /museum-central-gallery-grounded-pilaster/);
  assert.match(museum, /museum-central-gallery-overhead-lintel/);
  assert.match(museum, /museum-central-gallery-warm-pendant/);
  assert.match(museum, /museum-scene-owned-warm-hemisphere-light/);
  assert.match(museum, /museum-scene-owned-conservation-fill-light/);
  assert.match(museum, /museum-scene-owned-skylight-key/);
  assert.match(museum, /museum-scene-owned-gallery-pool-light/);
  assert.match(museum, /current: this\.whiskersStateValue === "COMPLETE" \? this\.whiskersOrder\.length : this\.whiskersWaypointIndex/);
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
