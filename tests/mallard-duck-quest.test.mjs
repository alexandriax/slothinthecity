import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadQuestHarness() {
  const result = await esbuild.build({
    stdin: {
      contents: `export { LakeDuckQuest } from "./app/game/world/LakeDuckQuest.ts"; export * as THREE from "three";`,
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  const loadedModule = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(
    loadedModule,
    loadedModule.exports,
    () => { throw new Error("mallard harness encountered an unexpected external require"); },
  );
  return loadedModule.exports;
}

test("Tanner rewards yielding to his family and becomes a persistent companion", async () => {
  const { LakeDuckQuest, THREE } = await loadQuestHarness();
  const scene = new THREE.Scene();
  const quest = new LakeDuckQuest(scene, {}, 1, { requiredYieldSeconds: .2 });
  assert.equal(quest.companionId, "central-park-mallard");
  assert.equal(quest.duck.root.userData.animalName, "Tanner");
  assert.equal(quest.family.length, 4);

  const encounter = quest.duckPosition.clone();
  quest.update(0, 1 / 60, { player: encounter, locomotion: "water" });
  assert.ok(quest.duckPosition.distanceTo(encounter) < .001, "mallard should begin on its authored swim path without a first-frame teleport");
  assert.equal(quest.state, "ROAMING", "approaching must reveal the local greeting without silently starting the story");
  assert.equal(quest.interactionHint(encounter)?.label, "GREET TANNER · ASK TO CROSS");
  assert.equal(quest.interact(encounter, 0)?.kind, "DUCK_CALLED");
  assert.equal(quest.state, "WAITING_FOR_YIELD");
  assert.equal(quest.consumeEvent()?.kind, "DUCK_CALLED");
  assert.match(quest.instruction, /LET TANNER'S FAMILY PASS/);

  const respectfulBoatPosition = quest.currentTarget.clone().add(new THREE.Vector3(0, 0, 10));
  quest.update(.1, .1, { player: respectfulBoatPosition, locomotion: "rowboat", rowboatPosition: respectfulBoatPosition, rowboatSpeedMetersPerSecond: 0 });
  quest.update(.2, .1, { player: respectfulBoatPosition, locomotion: "rowboat", rowboatPosition: respectfulBoatPosition, rowboatSpeedMetersPerSecond: 0 });
  assert.equal(quest.state, "CROSSING", "holding outside the path should let the family begin crossing");
  assert.equal(quest.consumeEvent()?.kind, "DUCKS_CROSSING");

  quest.update(6, 1 / 60, { player: respectfulBoatPosition, locomotion: "rowboat", rowboatPosition: respectfulBoatPosition, rowboatSpeedMetersPerSecond: 0 });
  assert.equal(quest.state, "HONORED");
  assert.equal(quest.consumeEvent()?.kind, "DUCKS_PASSED");
  const passenger = {
    position: new THREE.Vector3(12, 3.25, -8),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .7),
  };
  quest.update(8, 1 / 60, { player: encounter, locomotion: "rowboat", rowboatPassenger: passenger });
  assert.equal(quest.state, "FOLLOWING");
  assert.equal(quest.isComplete, true);
  assert.equal(quest.consumeEvent()?.kind, "DUCK_RECRUITED");
  quest.update(8.1, 1 / 60, { player: encounter, locomotion: "rowboat", rowboatPassenger: passenger });
  assert.ok(quest.duckPosition.distanceTo(passenger.position) < .001, "recruited duck should ride at the authored passenger anchor");
  assert.equal(quest.duck.root.userData.followMode, "rowboat");

  let collisionProjections = 0;
  quest.duck.root.rotation.set(.18, .7, -.12);
  const beforePitch = Math.abs(quest.duck.root.rotation.x), beforeRoll = Math.abs(quest.duck.root.rotation.z);
  const landPlayer = new THREE.Vector3(16, 1.48, -4);
  quest.update(8.2, 1 / 60, {
    player: landPlayer,
    locomotion: "land",
    floorYAt: () => 0,
    resolveBody: () => { collisionProjections++; },
  });
  assert.equal(collisionProjections, 1, "land follower should be projected through the park obstacle resolver");
  assert.ok(Math.abs(quest.duck.root.rotation.x) < beforePitch && Math.abs(quest.duck.root.rotation.z) < beforeRoll, "boat pitch and roll should settle when the duck returns to land");

  const laterPassenger = {
    position: new THREE.Vector3(-18, 2.9, 14),
    quaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -1.1),
  };
  quest.update(8.3, 1 / 60, { player: landPlayer, locomotion: "rowboat", rowboatPassenger: laterPassenger });
  assert.ok(quest.duckPosition.distanceTo(laterPassenger.position) > 1, "boarding a later boat should animate instead of teleporting to the bench");
  quest.update(9.1, 1 / 60, { player: landPlayer, locomotion: "rowboat", rowboatPassenger: laterPassenger });
  assert.ok(quest.duckPosition.distanceTo(laterPassenger.position) < .001, "boarding transition should finish at the authored passenger anchor");
  quest.dispose();
});

test("mallard production source and runtime contract retain original authored provenance", async () => {
  const [generator, asset, provenance, manifest, runtime] = await Promise.all([
    readFile(new URL("../tools/animal-pipeline/build_mallard_duck.py", import.meta.url), "utf8"),
    readFile(new URL("../tools/animal-pipeline/source/mallard-duck.asset.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../tools/animal-pipeline/source/mallard-duck.provenance.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/game/animals/authored/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../app/game/world/animals/AuthoredZooAnimalAssets.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(generator, /bpy\.ops\.(?:wm\.(?:append|link)|import_scene\.|import_mesh\.)/);
  assert.equal(asset.license, "Original-Project-Asset");
  assert.deepEqual(provenance.thirdPartyAssets, []);
  assert.deepEqual(asset.clips.map(clip => clip.name), ["DuckIdle", "DuckWaddle", "DuckSwim", "DuckShortFlight", "DuckLandingSettle"]);
  assert.ok(asset.lod0.triangles > asset.lod2.triangles);
  assert.ok(asset.lod2.triangles < asset.lod0.triangles * .5);
  assert.match(asset.provenance.geometry, /Original repository-authored/i);
  assert.match(asset.provenance.textures, /no third-party pixels/i);
  assert.ok(Object.values(asset.previews).length >= 10);
  assert.ok(manifest.species.some(species => species.id === "mallard-duck"));
  assert.match(runtime, /"mallard-duck"/);
});
