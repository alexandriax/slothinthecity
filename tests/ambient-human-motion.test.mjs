import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import * as esbuild from "esbuild";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

let ambientHarnessPromise;
function loadAmbientHarness() {
  ambientHarnessPromise ??= (async () => {
    const nodeRequire = createRequire(import.meta.url);
    const result = await esbuild.build({
      stdin: {
        contents: `
          export { createAmbientHumanAgent, updateAmbientHumanAgent } from "./app/game/world/characters/AmbientHumanMotion.ts";
          export * as THREE from "three";
        `,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "cjs",
      external: [
        "three/addons/geometries/RoundedBoxGeometry.js",
        "three/addons/loaders/DRACOLoader.js",
        "three/addons/loaders/GLTFLoader.js",
        "three/addons/utils/SkeletonUtils.js",
      ],
      write: false,
      logLevel: "silent",
    });
    const loadedModule = { exports: {} };
    new Function("module", "exports", "require", result.outputFiles[0].text)(
      loadedModule,
      loadedModule.exports,
      request => nodeRequire(request),
    );
    return loadedModule.exports;
  })();
  return ambientHarnessPromise;
}

test("ambient humans have explicit walk and pause windows with idle during a stop", async () => {
  const source = await readSource("../app/game/world/characters/AmbientHumanMotion.ts");

  assert.match(source, /walkSeconds: options\.walkSeconds/);
  assert.match(source, /const pauseSeconds = options\.pauseSeconds/);
  assert.match(source, /cycle < walkSeconds \+ outwardPause/);
  assert.match(source, /const pauseCount = Math\.max/);
  assert.match(source, /agent\.pauseDurations\.reduce/);
  assert.match(source, /pauseSeconds \* \(1 \+ Math\.sin/);
  assert.match(source, /paceVariation \* Math\.sin/);
  assert.match(source, /Math\.sin\(pauseProgress \* Math\.PI\)/);
  assert.match(source, /const walking = moving && distance > \.00008/);
  assert.match(source, /walking \? "walk" : "idle"/);
  assert.match(source, /Math\.atan2\(-facing\.x, -facing\.z\)/);
  assert.match(source, /yawDelta \* \(1 - Math\.exp\(-delta \* 7\)\)/);
  assert.match(source, /prepareAuthoredHumanLocomotion\(root\)/);
  assert.match(source, /new THREE\.CatmullRomCurve3/);
  assert.match(source, /closedRoute/);
  assert.match(source, /lookAround/);
  assert.match(source, /agent\.route\.getTangentAt/);
  assert.match(source, /facing\.copy\(attentionTarget\)\.sub\(agent\.root\.position\)/);
  assert.match(source, /ambientHumanActivity/);
  assert.match(source, /ambientHumanAttentionTarget/);
});

test("ambient visitors vary dwell times and deliberately face their world-space subject", async () => {
  const { createAmbientHumanAgent, updateAmbientHumanAgent, THREE } = await loadAmbientHarness();
  const root = new THREE.Group();
  const attention = new THREE.Vector3(8, 1.4, 0);
  const agent = createAmbientHumanAgent(root, {
    waypoints: [
      new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -2),
      new THREE.Vector3(2, 0, -2), new THREE.Vector3(2, 0, 0),
    ],
    walkSeconds: 2,
    pauseSeconds: 2.4,
    pauseCount: 2,
    pauseVariance: .35,
    pauseTargets: [attention],
    pauseActivities: ["photographing", "observing"],
    phase: .5,
  });
  assert.notEqual(agent.pauseDurations[0], agent.pauseDurations[1], "each overlook should keep its own deterministic dwell");

  const segmentWalkSeconds = agent.walkSeconds / agent.pauseCount;
  const pauseStart = segmentWalkSeconds - agent.phase + .05;
  for (let frame = 0; frame < 28; frame++) updateAmbientHumanAgent(agent, pauseStart + frame / 60, 1 / 60);

  assert.equal(root.userData.ambientHumanMotionState, "idle");
  assert.equal(root.userData.ambientHumanActivity, "photographing");
  assert.deepEqual(root.userData.ambientHumanAttentionTarget, attention.toArray());
  const subjectDirection = attention.clone().sub(root.position).setY(0).normalize();
  const expectedYaw = Math.atan2(-subjectDirection.x, -subjectDirection.z);
  const yawError = Math.abs(Math.atan2(Math.sin(root.rotation.y - expectedYaw), Math.cos(root.rotation.y - expectedYaw)));
  assert.ok(yawError < .16, "the paused visitor should smoothly settle toward the exhibit rather than stare down the route");
});

test("station, zoo, museum, and streets advance authored roles with contextual pause targets", async () => {
  const [subway, zoo, museum, city] = await Promise.all([
    readSource("../app/game/world/SubwayWorld.ts"),
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
    readSource("../app/game/world/CityBusWorld.ts"),
  ]);

  assert.match(zoo, /guestUpdateScheduler\.deltaFor\(agent\.root, elapsed, delta, player, yaw/);
  assert.match(zoo, /scheduledDelta !== null\) updateAmbientHumanAgent\(agent, elapsed, scheduledDelta\)/);
  assert.match(zoo, /pauseTargets: \[attentionTarget\]/);
  assert.match(zoo, /pauseActivities: \[pauseActivity, "observing", pauseActivity\]/);
  assert.match(museum, /exhibitAttentionPoints/);
  assert.match(museum, /pauseTargets: \[attentionTarget\]/);
  assert.match(museum, /guestUpdateScheduler\.deltaFor\(agent\.root, elapsed, delta, player, playerYaw/);
  assert.match(city, /storefrontAttention/);
  assert.match(city, /pauseTargets: \[storefrontAttention\]/);
  assert.match(subway, /mode: "ALIGHT" \| "AMBIENT" \| "BOARD" \| "WAIT"/);
  assert.match(subway, /const walkSeconds = 2\.7/);
  assert.match(subway, /flow\.group\.visible && locomoting \? "walk" : "idle"/);
  assert.match(subway, /const cycle = elapsed % SUBWAY_TRAIN_INTERVAL_SECONDS/);
  assert.match(subway, /this\.updateStationPassengerFlows\(cycle, delta\)/);
});
