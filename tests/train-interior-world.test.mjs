import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL("../app/game/world/TrainInteriorWorld.ts", import.meta.url);

test("train interior provides a complete onboard door-positioning quest", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /FIFTH_TO_LEXINGTON/);
  assert.match(source, /LEXINGTON_TO_WEST_FARMS/);
  assert.match(source, /"86 St"[\s\S]{0,100}"125 St"[\s\S]{0,100}"E 180 St"/);
  assert.match(source, /type: "PUSHED_OUT"/);
  assert.match(source, /type: "MISSED_STOP"/);
  assert.match(source, /type: "ARRIVED"/);
  assert.match(source, /Move to the illuminated/);
  assert.match(source, /Stay clear of the doors until/);
  assert.match(source, /interact\(player: THREE\.Vector3\)/);
});

test("train interior scales detail for mobile without losing authored features", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /TrainInteriorQuality = "mobile" \| "desktop"/);
  assert.match(source, /quality === "desktop" \? 9 : 5/);
  assert.match(source, /detailed-train-passenger/);
  assert.match(source, /destination-door-marker/);
  assert.match(source, /SLOTH & STEADY/);
  assert.match(source, /CANOPY CLUB/);
  assert.match(source, /TAKE THE LOCAL/);
  assert.match(source, /NO RUSH HOUR/);
  assert.match(source, /cameraOffset/);
  assert.match(source, /cameraRoll/);
});
