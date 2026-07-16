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
  assert.match(finale, /friendReviewSpawn/);
  assert.match(game, /if \(qaInput === "finale"\) player\.copy\(zooWorld\.friendReviewSpawn\)/);
});

test("zoo populations, grounding, and fabric wardrobes stay explicit", async () => {
  const [campaign, finale, runtime, showroom] = await Promise.all([
    readFile(new URL("../app/game/world/CampaignLandmarks.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/BronxZooWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/characters/AuthoredHumanAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/debug/characters/CharacterShowroom.tsx", import.meta.url), "utf8"),
  ]);
  const zoo = campaign.slice(campaign.indexOf("function addZoo"), campaign.indexOf("function addSubwayEntrance"));
  const population = zoo.slice(zoo.indexOf("const visitorData"), zoo.indexOf("] as const;") + 11);
  assert.equal((population.match(/zone: "inside"/g) ?? []).length, 3);
  assert.equal((population.match(/zone: "outside"/g) ?? []).length, 1);
  assert.match(zoo, /groundedLocalY/);
  assert.match(zoo, /heightAt\(gate\.position\.x \+ x, gate\.position\.z \+ z\)/);
  assert.match(campaign, /walkingVisitors\.map/);
  assert.match(zoo, /walkingVisitors\.push\(result\.root\)/);
  assert.doesNotMatch(campaign, /stationaryVisitors/);
  assert.doesNotMatch(population, /checking-map/);
  assert.doesNotMatch(population, /slice\(0, quality/);

  for (const outfit of ["zoo-uniform", "cotton-denim", "silk-leggings", "knit-chinos"]) {
    assert.match(`${campaign}\n${finale}\n${showroom}`, new RegExp(outfit));
  }
  assert.match(campaign, /zooNameTag: "Central Park Zoo"/);
  assert.match(finale, /zooNameTag: "Bronx Zoo"/);
  assert.match(runtime, /color: options\.coat/);
  assert.match(runtime, /color: options\.trousers/);
  assert.match(runtime, /authored-zoo-uniform-shirt-print/);
  assert.match(runtime, /findBone\(bones, "Chest", "Spine2", "chest"\)/);
  assert.match(runtime, /transparent: true/);
  assert.doesNotMatch(runtime.slice(runtime.indexOf("function addZooUniformShirtPrint"), runtime.indexOf("function disposeInstance")), /strokeRect|fillRect/);
  assert.match(runtime, /options\.zooNameTag\.toUpperCase\(\)/);
});

test("premium character detail scales with the active quality tier", async () => {
  const source = await readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8");

  assert.match(source, /quality > \.86 \? 34 : quality > \.62 \? 24 : 18/);
  assert.match(source, /quality > \.86 \? 36 : quality > \.62 \? 26 : 20/);
  assert.match(source, /quality > \.86 \? 384 : quality > \.62 \? 256 : 128/);
  assert.match(source, /quality > \.92 \? 40 : quality > \.68 \? 28 : 18/);
});
