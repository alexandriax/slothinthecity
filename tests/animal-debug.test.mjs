import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = relative => readFile(new URL(relative, import.meta.url), "utf8");

test("animal lab exposes every zoo rig with geometry, material, LOD, and motion review controls", async () => {
  const [showroom, menu, page] = await Promise.all([
    readSource("../app/debug/animals/AnimalShowroom.tsx"),
    readSource("../app/game/mobile/DebugJumpMenu.tsx"),
    readSource("../app/debug/animals/page.tsx"),
  ]);

  for (const creator of [
    "createGaryPolarBear", "createSunConure", "createBlueAndGoldMacaw", "createScarletIbis",
    "createGreenAracari", "createSpiderMonkey", "createSeaLion", "createRedPanda", "createZebra",
    "createAldabraTortoise", "createAmericanFlamingo", "createAmericanBison", "createWhiskersCat",
  ]) assert.match(showroom, new RegExp(creator));
  assert.match(showroom, /measureZooAnimalGeometry\(rig\.root\)/);
  assert.match(showroom, /Hero · ultra/);
  assert.match(showroom, /wireframe/);
  assert.match(showroom, /rig\.root\.userData\.animationState = motionRef\.current/);
  assert.match(showroom, /Triangles/);
  assert.match(showroom, /Articulated|Joints/);
  assert.match(menu, /href="\/debug\/animals"/);
  assert.match(page, /robots: \{ index: false, follow: false \}/);
});
