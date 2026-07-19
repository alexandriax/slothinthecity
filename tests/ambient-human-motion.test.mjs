import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("ambient humans have explicit walk and pause windows with idle during a stop", async () => {
  const source = await readSource("../app/game/world/characters/AmbientHumanMotion.ts");

  assert.match(source, /walkSeconds: options\.walkSeconds/);
  assert.match(source, /pauseSeconds: options\.pauseSeconds/);
  assert.match(source, /cycle < walkSeconds \+ pauseSeconds/);
  assert.match(source, /const walking = moving && distance > \.00008/);
  assert.match(source, /walking \? "walk" : "idle"/);
  assert.match(source, /Math\.atan2\(-facing\.x, -facing\.z\)/);
  assert.match(source, /yawDelta \* \(1 - Math\.exp\(-delta \* 7\)\)/);
  assert.match(source, /prepareAuthoredHumanLocomotion\(root\)/);
});

test("station and Bronx Zoo worlds advance authored walker state every frame", async () => {
  const [subway, zoo] = await Promise.all([
    readSource("../app/game/world/SubwayWorld.ts"),
    readSource("../app/game/world/BronxZooWorld.ts"),
  ]);

  assert.match(zoo, /guestAgents\.forEach\(agent => updateAmbientHumanAgent\(agent, elapsed, delta\)\)/);
  assert.match(subway, /mode: "ALIGHT" \| "AMBIENT" \| "BOARD" \| "WAIT"/);
  assert.match(subway, /const walkSeconds = 2\.7/);
  assert.match(subway, /flow\.group\.visible && locomoting \? "walk" : "idle"/);
  assert.match(subway, /const cycle = elapsed % SUBWAY_TRAIN_INTERVAL_SECONDS/);
  assert.match(subway, /this\.updateStationPassengerFlows\(cycle, delta\)/);
});
