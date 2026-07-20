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

test("Reedline Rescue keeps one stable snag order and recruits the Central Park mallard", async () => {
  const { LakeDuckQuest, THREE } = await loadQuestHarness();
  const scene = new THREE.Scene();
  const quest = new LakeDuckQuest(scene, {}, 1, { sessionSeed: 90125 });
  const secondQuest = new LakeDuckQuest(new THREE.Scene(), {}, 1, { sessionSeed: 90125 });
  assert.deepEqual(quest.snagOrder, secondQuest.snagOrder);
  assert.deepEqual([...quest.snagOrder].toSorted(), [0, 1, 2]);
  assert.equal(quest.companionId, "central-park-mallard");

  const encounter = quest.duckPosition.clone();
  quest.update(0, 1 / 60, { player: encounter, locomotion: "water" });
  assert.equal(quest.state, "SNAG_1");
  assert.equal(quest.consumeEvent()?.kind, "DUCK_CALLED");
  for (let progress = 0; progress < 3; progress++) {
    const target = quest.currentTarget.clone();
    const event = quest.interact(target, progress + 1);
    assert.equal(event?.progress, progress + 1);
  }
  assert.equal(quest.state, "FREED");
  quest.update(5, 1 / 60, { player: encounter, locomotion: "water" });
  assert.equal(quest.state, "FOLLOWING");
  assert.equal(quest.isComplete, true);
  quest.dispose();
  secondQuest.dispose();
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
