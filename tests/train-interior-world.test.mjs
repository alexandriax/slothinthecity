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
  assert.match(source, /Use any illuminated/);
  assert.match(source, /Stay clear of the doors until/);
  assert.match(source, /interact\(player: THREE\.Vector3\)/);
});

test("train interior scales detail for mobile without losing authored features", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /TrainInteriorQuality = "mobile" \| "desktop"/);
  assert.match(source, /quality === "desktop" \? 10 : 6/);
  assert.match(source, /detailed-train-passenger/);
  assert.match(source, /destination-door-marker/);
  assert.match(source, /SLOTH & STEADY/);
  assert.match(source, /CANOPY CLUB/);
  assert.match(source, /TAKE THE LOCAL/);
  assert.match(source, /NO RUSH HOUR/);
  assert.match(source, /NIGHT OWL/);
  assert.match(source, /HANG IN THERE/);
  assert.match(source, /bronx-bound\.webp/);
  assert.match(source, /ramble-after-dark\.webp/);
  assert.match(source, /setAdvertisementTexture/);
  assert.match(source, /cameraOffset/);
  assert.match(source, /cameraRoll/);
  assert.match(source, /createPremiumHuman/);
  assert.match(source, /\/game\/characters\/npc-face-atlas-v1\.webp/);
  assert.match(source, /\/game\/characters\/npc-cloth-atlas-v1\.webp/);
});

test("train doors create real passages and walking through the lit exit completes the ride", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /const passageOpen = openDoorZ !== undefined && this\.doorsOpenAmount > \.55/);
  assert.match(source, /CAR_HALF_WIDTH \+ \.48/);
  assert.match(source, /detectDestinationCrossing\(player, velocity\)/);
  assert.match(source, /crossedThreshold[\s\S]{0,500}type: "ARRIVED"/);
  assert.match(source, /door\.left\.position\.z = -\.47 - opening/);
  assert.match(source, /leaf\.add\(window\)/);
  assert.match(source, /threshold/);
  assert.doesNotMatch(source, /door\.z === 0/);
  assert.match(source, /this\.doorZone\(player, this\.journey\.destination\.side\)/);
  assert.match(source, /Every platform-side doorway is a valid/);
  assert.match(source, /nearestExitWaypoint\(player/);
});

test("onboard wayfinding reflects the authored MTA route and transfer topology", async () => {
  const source = await readFile(sourceUrl, "utf8");

  assert.match(source, /stop\.includes\("Lexington"\) \? \["N", "R", "W", "4", "5", "6"\]/);
  assert.match(source, /stop\.includes\("West Farms"\) \? \["2", "5"\]/);
  assert.match(source, /PRIORITY SEATING/);
  assert.match(source, /PASSENGER INTERCOM/);
  assert.match(source, /EMERGENCY INSTRUCTIONS/);
  assert.match(source, /DO NOT LEAN ON DOOR/);
  assert.match(source, /platformVisible/);
});
