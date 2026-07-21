import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import * as esbuild from "esbuild";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

let harnessPromise;
function loadBronxZooHarness() {
  harnessPromise ??= (async () => {
    const nodeRequire = createRequire(import.meta.url);
    const result = await esbuild.build({
      stdin: {
        contents: `
          export { BronxZooWorld } from "./app/game/world/BronxZooWorld.ts";
          export * as THREE from "three";
        `,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "cjs",
      external: [
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
  return harnessPromise;
}

function textureSet(THREE) {
  const texture = () => {
    const result = new THREE.Texture();
    result.source = new THREE.Source({ width: 4, height: 4 });
    return result;
  };
  return {
    ground: texture(), bark: texture(), fur: texture(), zooAnimalAtlas: texture(),
    foliage: texture(), foliageBranch: texture(), fern: texture(), gravel: texture(),
    stone: texture(), moss: texture(), waterNormal: texture(),
  };
}

test("visitor paths use terrain-following drainage edges instead of detached box kerbs", async () => {
  const [source, { BronxZooWorld, THREE }] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    loadBronxZooHarness(),
  ]);
  const edgeBuilder = source.slice(source.indexOf("function addPathDrainageEdges"), source.indexOf("// Visitor circulation"));
  assert.match(edgeBuilder, /pathPointNormal\(points, segmentIndex\)/);
  assert.match(edgeBuilder, /pathPointNormal\(points, segmentIndex \+ 1\)/);
  assert.doesNotMatch(edgeBuilder, /BoxGeometry/, "path edges must conform to the same mitered boundary as the path ribbon");

  const world = new BronxZooWorld(new THREE.Scene(), textureSet(THREE), .22);
  const edges = [];
  world.root.traverse(object => {
    if (object.name.endsWith("-terrain-following-drainage-edges")) edges.push(object);
  });
  assert.equal(edges.length, 9);
  edges.forEach(edge => {
    const positions = edge.geometry.getAttribute("position");
    assert.ok(positions.count >= 40, `${edge.name} should contain both continuous path boundaries`);
    edge.geometry.computeBoundingBox();
    assert.ok(edge.geometry.boundingBox.max.y - edge.geometry.boundingBox.min.y < 2, `${edge.name} should remain terrain-hugging`);
  });
  world.dispose();
});

test("Bronx Zoo collision projects companions off full signs, benches, and degenerate circles", async () => {
  const { BronxZooWorld, THREE } = await loadBronxZooHarness();
  const world = new BronxZooWorld(new THREE.Scene(), textureSet(THREE), .22);
  const velocity = new THREE.Vector3(1, 0, 1);

  const signCenter = new THREE.Vector3(-31, 0, -39), signYaw = -.74;
  const signPoint = new THREE.Vector3(1.8, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), signYaw).add(signCenter);
  world.resolveCompanion(signPoint, velocity, .7);
  const signLocal = signPoint.clone().sub(signCenter).applyAxisAngle(new THREE.Vector3(0, 1, 0), -signYaw);
  assert.ok(Math.abs(signLocal.x) >= 3.02 - 1e-6 || Math.abs(signLocal.z) >= .88 - 1e-6, "companion remained inside the World of Birds sign face");

  const benchCenter = new THREE.Vector3(-11, 0, -31), benchYaw = -.12;
  const benchPoint = new THREE.Vector3(.9, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), benchYaw).add(benchCenter);
  world.resolveCompanion(benchPoint, velocity, .62);
  const benchLocal = benchPoint.clone().sub(benchCenter).applyAxisAngle(new THREE.Vector3(0, 1, 0), -benchYaw);
  assert.ok(Math.abs(benchLocal.x) >= 2.34 - 1e-6 || Math.abs(benchLocal.z) >= 1.1 - 1e-6, "companion remained inside a visitor bench");

  const fountainCenter = new THREE.Vector3(-12, 0, -1);
  world.resolveCompanion(fountainCenter, velocity, .5);
  assert.ok(Math.hypot(fountainCenter.x + 12, fountainCenter.z + 1) >= 4.8 - 1e-6, "an exact-center circle overlap must get a stable escape direction");
  world.dispose();
});

test("Gary's follower footprint clears his authored shoulders and hips", async () => {
  const source = await readSource("../app/game/world/GaryCompanion.ts");
  assert.match(source, /radius: 1\.35/);
  assert.match(source, /this\.scooterMode \? 1\.2 : 1\.35/);
});

test("habitat research stays in the live zoo and starts across each enclosure edge", async () => {
  const [game, quests, zoo, { BronxZooWorld, THREE }] = await Promise.all([
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/InWorldZooQuests.ts"),
    readSource("../app/game/world/BronxZooWorld.ts"),
    loadBronxZooHarness(),
  ]);
  assert.doesNotMatch(game, /ZooSideQuestScreen/);
  assert.match(game, /data-side-quest="in-world"/);
  assert.match(game, /zooOverlayPaused = transitStage === "BRONX_ZOO" && lockPickingRef\.current/);
  assert.match(game, /event\.kind\.startsWith\("ANIMAL_QUEST_"\)/);
  assert.match(quests, /covers the whole visitor edge of its enclosure/);
  assert.match(quests, /createInWorldZooQuestOrder/);
  assert.match(zoo, /bronx-zoo-physical-in-world-habitat-quest-equipment/);
  assert.match(zoo, /bronx-zoo-continuous-world-ground-beyond-visitor-boundary/);
  assert.match(zoo, /bronx-zoo-perimeter-woodland-trunks-to-fog/);
  assert.match(zoo, /bronx-zoo-perimeter-woodland-canopy-to-fog/);
  assert.match(zoo, /bronx-zoo-perimeter-understory-to-fog/);
  assert.match(zoo, /bronx-zoo-sightline-safe-conservation-rail/);
  assert.match(zoo, /bronx-zoo-fine-upper-safety-cable/);
  assert.match(zoo, /habitatResearchStreak\+\+/);
  assert.match(game, /reviewWorld\.beginAnimalQuest\(qaZooSideQuest\.questId\)/);
  assert.match(game, /setZooPhase\(activeHabitatQuest \? `IN_WORLD_QUEST_/);
  assert.match(game, /activeHabitatQuest[\s\S]{0,120}"Active habitat research station"/);
  assert.doesNotMatch(game, /player\.copy\(reviewWorld\.objectiveTarget\)/, "a review checkpoint must never spawn inside its physical research station");
  assert.match(game, /bronxquestbirds:[^{]+\{ questId: "aviary-voices", position: \[-26, -40\]/);
  assert.match(game, /bronxquestredpanda:[^{]+\{ questId: "red-panda-scent-wind", position: \[-24, -135\]/);
  assert.match(game, /bronxquesttortoise:[^{]+\{ questId: "tortoise-sun-trail", position: \[24, -135\]/);
  assert.match(game, /bronxquestflamingo:[^{]+\{ questId: "flamingo-wetland-balance", position: \[-71, -67\]/);
  assert.match(game, /bronxquestbison:[^{]+\{ questId: "bison-prairie-seeding", position: \[59, -107\]/);

  const world = new BronxZooWorld(new THREE.Scene(), textureSet(THREE), .22, 73021);
  const liveResponses = [];
  world.root.traverse(object => {
    if (object.userData.embeddedHabitatResponse) liveResponses.push(object);
  });
  assert.equal(liveResponses.length, 24, "every physical field station should own a response inside its habitat");
  assert.deepEqual(
    [...new Set(liveResponses.map(response => response.userData.responseKind))].sort(),
    ["bird-perch", "buoy-dock", "rope-anchor", "scent-vane", "seed-plot", "solar-mirror", "stripe-scanner", "wetland-valve"],
  );
  assert.ok(liveResponses.every(response => !response.visible), "habitat responses should appear only when their equipment is operated");
  const anywhereAlongAviaryEdge = new THREE.Vector3(-56, 1.48, -51);
  const hint = world.interactionHint(anywhereAlongAviaryEdge);
  assert.equal(hint?.kind, "ANIMAL_QUEST");
  assert.equal(hint?.questId, "aviary-voices");
  const started = world.interact(anywhereAlongAviaryEdge);
  assert.equal(started?.kind, "ANIMAL_QUEST_STARTED");
  assert.equal(world.activeSideQuestProgress?.total, 3);
  assert.ok(world.objectiveTarget.distanceTo(anywhereAlongAviaryEdge) > 2, "the first task should point at physical habitat equipment, not an overlay");
  world.dispose();

  const reviewWorld = new BronxZooWorld(new THREE.Scene(), textureSet(THREE), .22, 73021);
  const reviewStart = reviewWorld.beginAnimalQuest("flamingo-wetland-balance");
  assert.equal(reviewStart?.kind, "ANIMAL_QUEST_STARTED");
  assert.equal(reviewStart?.questId, "flamingo-wetland-balance");
  assert.equal(reviewWorld.activeSideQuestProgress?.total, 3);
  assert.equal(reviewWorld.beginAnimalQuest("flamingo-wetland-balance"), null, "one world cannot start a second copy of an active route");
  reviewWorld.dispose();
});

test("habitat research requires live first-person focus, preserves zoo animals, and supports field replays", async () => {
  const { BronxZooWorld, THREE } = await loadBronxZooHarness();
  const world = new BronxZooWorld(new THREE.Scene(), textureSet(THREE), .22, 73021);
  const mangoHabitatRoot = world.root.getObjectByName("sun-conure-hero-bird");
  assert.ok(mangoHabitatRoot, "the live aviary should own Mango's habitat rig");
  const mangoVisibilityBeforeResearch = mangoHabitatRoot.visible;
  const start = world.beginAnimalQuest("aviary-voices");
  assert.equal(start?.kind, "ANIMAL_QUEST_STARTED");
  const firstRouteTarget = world.objectiveTarget.clone();

  let completion;
  for (let stationIndex = 0; stationIndex < 3; stationIndex++) {
    const player = world.objectiveTarget.clone();
    const habitatCenter = new THREE.Vector3(-43, player.y, -51);
    const direction = habitatCenter.sub(player);
    const alignedYaw = Math.atan2(-direction.x, -direction.z);
    if (stationIndex === 0) {
      const wrongWay = world.interact(player, alignedYaw + Math.PI);
      assert.equal(wrongWay?.kind, "ANIMAL_QUEST_FOCUS_REQUIRED");
      assert.equal(world.activeSideQuestProgress?.operation, 0, "a blind button press must not advance live habitat research");
    }
    const operation = world.interact(player, alignedYaw);
    assert.equal(operation?.kind, "ANIMAL_QUEST_OPERATION_STARTED");
    assert.equal(world.activeSideQuestProgress?.operation, 0);
    assert.equal(world.activeSideQuestProgress?.operationActive, true);
    assert.ok(world.activeHabitatResponseTarget, "operating a station should produce a physical response inside the enclosure");

    const responseStart = world.activeHabitatResponseTarget.clone();
    let result;
    for (let frame = 0; frame < 360 && !result; frame++) {
      const liveTarget = world.activeHabitatResponseTarget;
      assert.ok(liveTarget, "the live response should remain in-world until the observation completes");
      const responseDirection = liveTarget.clone().sub(player);
      const trackingYaw = Math.atan2(-responseDirection.x, -responseDirection.z);
      world.update(frame / 60, 1 / 60, player, trackingYaw);
      result = world.consumeHabitatEvent();
    }
    if (stationIndex === 0) {
      assert.ok(world.root.getObjectByName("live-habitat-response-aviary-voices-mango"));
      assert.ok(responseStart.distanceTo(firstRouteTarget) > 3, "the response must happen inside the habitat, away from its control post");
    }
    assert.ok(result, "sustained focus should finish the active physical station");
    if (stationIndex < 2) assert.equal(result.kind, "ANIMAL_QUEST_ADVANCED");
    else completion = result;
  }

  assert.equal(completion?.kind, "ANIMAL_QUEST_COMPLETED");
  assert.equal(completion?.firstCompletion, true);
  assert.equal(mangoHabitatRoot.visible, mangoVisibilityBeforeResearch, "Mango's live aviary visibility must not change when an ambassador joins");

  const aviaryEdge = new THREE.Vector3(-56, 1.48, -51);
  const replayHint = world.interactionHint(aviaryEdge);
  assert.equal(replayHint?.kind, "ANIMAL_QUEST");
  assert.match(replayHint?.label ?? "", /REVISIT MANGO'S CANOPY CHORUS/);
  const replay = world.interact(aviaryEdge);
  assert.equal(replay?.kind, "ANIMAL_QUEST_STARTED");
  assert.equal(world.activeSideQuestProgress?.replay, true);
  assert.match(replay?.message ?? "", /field replay started with a new route/i);
  assert.ok(world.objectiveTarget.distanceTo(firstRouteTarget) > 1, "a replay must not open on the same station order as the previous route");
  world.dispose();
});

test("sea-lion enrichment follows the moving buoy rather than a generic pool-center timer", async () => {
  const { BronxZooWorld, THREE } = await loadBronxZooHarness();
  const world = new BronxZooWorld(new THREE.Scene(), textureSet(THREE), .22, 99117);
  world.beginAnimalQuest("sea-lion-current");
  const player = world.objectiveTarget.clone();
  const poolCenter = new THREE.Vector3(0, player.y, -76);
  const centerDirection = poolCenter.clone().sub(player);
  const centerYaw = Math.atan2(-centerDirection.x, -centerDirection.z);
  assert.equal(world.interact(player, centerYaw)?.kind, "ANIMAL_QUEST_OPERATION_STARTED");

  const responseStart = world.activeHabitatResponseTarget.clone();
  for (let frame = 0; frame < 420; frame++) world.update(frame / 60, 1 / 60, player, centerYaw);
  assert.equal(world.consumeHabitatEvent(), null, "staring at the pool center must not complete a moving-buoy observation");
  assert.ok((world.activeSideQuestProgress?.operation ?? 0) < .92);
  assert.ok(world.activeHabitatResponseTarget.distanceTo(responseStart) > 1.5, "the released buoy should visibly travel through the pool");

  let completion;
  for (let frame = 0; frame < 420 && !completion; frame++) {
    const target = world.activeHabitatResponseTarget;
    const direction = target.clone().sub(player);
    const trackingYaw = Math.atan2(-direction.x, -direction.z);
    world.update(8 + frame / 60, 1 / 60, player, trackingYaw);
    completion = world.consumeHabitatEvent();
  }
  assert.equal(completion?.kind, "ANIMAL_QUEST_ADVANCED", "following the actual buoy should complete the station");
  world.dispose();
});
