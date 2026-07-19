import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("premium humans use twenty identities and head-conforming photographic facial geometry", async () => {
  const source = await readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8");
  const human = source.slice(source.indexOf("function createProceduralPremiumHuman"), source.indexOf("export function createPremiumHuman"));
  const factory = source.slice(source.indexOf("export function createPremiumHuman"), source.indexOf("// CapsuleGeometry requires"));

  assert.match(source, /identityCount: 20/);
  for (const index of ["01", "02", "03"]) {
    assert.match(source, new RegExp(`npc-face-atlas-v2-${index}\\.webp`));
    assert.match(source, new RegExp(`npc-cloth-atlas-v2-${index}\\.webp`));
  }
  for (const index of ["01", "02"]) assert.match(source, new RegExp(`npc-face-atlas-v3-${index}\\.webp`));
  assert.match(source, /function anatomicalHeadGeometry/);
  assert.match(source, /function faceSurfaceGeometry/);
  assert.match(human, /head-conforming-generated-face-surface/);
  assert.match(human, /faceVariant/);
  assert.match(human, /clothingVariant/);
  assert.match(human, /continuous-tailored-human-arm/);
  assert.match(human, /continuous-tailored-human-leg/);
  assert.match(source, /onSkinTone\?\./);
  assert.match(source, /backgroundMask = THREE\.MathUtils\.smoothstep/);
  assert.match(human, /face-atlas-sampled-seamless/);
  assert.match(human, /depthWrite: false/);
  assert.match(human, /anatomical-head-neck-skin-transition/);
  assert.doesNotMatch(human, /elbowBlend|kneeBlend|ConeGeometry/);
  assert.doesNotMatch(human, /eyeWhite|noseBridge|photoreal-generated-face-albedo|const lips =/);
  assert.match(factory, /hydrateAuthoredHuman\(result\.root/);
});

test("zoo sloth friends use continuous anatomical silhouettes", async () => {
  const [source, finale, game] = await Promise.all([
    readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/BronxZooWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
  ]);
  const friend = source.slice(source.indexOf("export function createPremiumSlothFriend"));

  for (const feature of ["continuous-horizontal-anatomical-sloth-torso", "anatomical-sloth-head-jaw-and-integrated-mask", "weight-bearing-anatomical-sloth-forelimb", "weight-bearing-anatomical-sloth-hindlimb", "ground-contact-capped-sloth-foreclaw", "ground-contact-capped-sloth-hindclaw"]) {
    assert.match(friend, new RegExp(feature));
  }
  for (const feature of ["head-attached-embedded-sloth-eye", "head-attached-embedded-sloth-nose", "continuous-furred-sloth-forepaw-claw-root-pad", "continuous-furred-sloth-hindpaw-claw-root-pad", "scooter-head-attached-embedded-sloth-eye", "scooter-handlebar-wrapped-sloth-forepaw", "scooter-deck-planted-furred-sloth-hindpaw"]) {
    assert.match(friend, new RegExp(feature));
  }
  assert.match(source, /function paintSlothSurface/);
  assert.match(source, /vertexColors: true/);
  assert.match(source, /function quadrupedalSlothTorsoGeometry/);
  assert.match(friend, /locomotion = "quadrupedal"/);
  assert.match(friend, /adultHeightMeters = 1\.24/);
  assert.match(friend, /integratedFacialMask = true/);
  assert.doesNotMatch(friend, /friend-wave-arm|friend-rest-arm|integrated-bib|satchel|leatherMap/);
  assert.doesNotMatch(friend, /slothFaceMaskGeometry|slothChestBibGeometry|conforming-sloth|neckMantle|overlapping-sloth-shoulder/);
  assert.doesNotMatch(friend, /new THREE\.TubeGeometry|new THREE\.ConeGeometry/);
  assert.doesNotMatch(friend, /const upper = new THREE\.Mesh\(new THREE\.CapsuleGeometry|const wrist = new THREE\.Mesh\(new THREE\.CapsuleGeometry|const palm = new THREE\.Mesh\(new THREE\.SphereGeometry/);
  assert.doesNotMatch(finale, /friend-wave-arm|waiting-sloth-friend"\) object\.rotation\.z/);
  assert.match(finale, /captive-sloth-friend-\$\{index \+ 1\}-on-real-branch/);
  assert.match(finale, /sloth-enclosure-load-bearing-tree-branch-\$\{index \+ 1\}/);
  assert.match(game, /"bronxsloths"/);
  assert.match(game, /player\.copy\(reviewWorld\.habitatReviewSpawn\)/);
  assert.match(game, /qaInput === "finale"[\s\S]{0,320}reviewPark\.sanctuaryTarget/);
});

test("Bronx Zoo populations, grounding, and fabric wardrobes stay explicit", async () => {
  const [campaign, finale, runtime, showroom] = await Promise.all([
    readFile(new URL("../app/game/world/CampaignLandmarks.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/BronxZooWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/characters/AuthoredHumanAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/debug/characters/CharacterShowroom.tsx", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(campaign, /createPremiumHuman|function addZoo|central-park-zoo/);
  assert.match(finale, /guestData\.slice\(0, quality < \.58 \? 4 : quality < \.82 \? 6 : guestData\.length\)/);
  assert.match(finale, /this\.guestAgents\.push\(createAmbientHumanAgent\(result\.root/);

  for (const outfit of ["zoo-uniform", "cotton-denim", "silk-leggings", "knit-chinos"]) {
    assert.match(`${campaign}\n${finale}\n${showroom}`, new RegExp(outfit));
  }
  assert.match(finale, /zooNameTag: "Bronx Zoo"/);
  assert.match(showroom, /zooNameTag: "Bronx Zoo"/);
  assert.match(runtime, /color: options\.coat/);
  assert.match(runtime, /color: options\.trousers/);
  const shirtPrint = runtime.slice(runtime.indexOf("function applyZooUniformShirtPrint"), runtime.indexOf("function disposeInstance"));
  assert.match(shirtPrint, /integratedShirtPrint = true/);
  assert.match(shirtPrint, /material\.onBeforeCompile/);
  assert.match(shirtPrint, /diffuseColor\.rgb = mix/);
  assert.match(shirtPrint, /zooPrintFront/);
  assert.doesNotMatch(shirtPrint, /PlaneGeometry|new THREE\.Mesh|instance\.add|polygonOffset/);
  assert.doesNotMatch(shirtPrint, /strokeRect|fillRect/);
  assert.match(runtime, /options\.zooNameTag\.toUpperCase\(\)/);
});

test("premium character detail scales with the active quality tier", async () => {
  const source = await readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8");

  assert.match(source, /quality > \.86 \? 34 : quality > \.62 \? 24 : 18/);
  assert.match(source, /quality > \.86 \? 36 : quality > \.62 \? 26 : 20/);
  assert.match(source, /quality > \.86 \? 384 : quality > \.62 \? 256 : 128/);
  assert.match(source, /quality > \.92 \? 40 : quality > \.68 \? 28 : 18/);
});
