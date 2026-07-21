import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadQuestHarness() {
  const result = await esbuild.build({
    stdin: {
      contents: `export { ParkSquirrelQuest } from "./app/game/world/ParkSquirrelQuest.ts"; export * as THREE from "three";`,
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
    () => { throw new Error("squirrel harness encountered an unexpected external require"); },
  );
  return loadedModule.exports;
}

function makeWorld(THREE) {
  const tree = { x: 0, z: 0, baseY: 0, height: 8, radius: .52, canopyY: 3 };
  const branch = {
    id: 0,
    treeIndex: 0,
    startNodeId: 0,
    endNodeId: 1,
    start: new THREE.Vector3(0, 3, 0),
    end: new THREE.Vector3(4, 5, 0),
    radius: .2,
    adjacentRouteIds: [],
    crossTreeRouteIds: [],
    belowRouteIds: [],
    forwardRouteIds: [],
    backwardRouteIds: [],
    destinationTreeIndex: null,
    corridorId: null,
    corridorOrder: -1,
  };
  return { trees: [tree], branches: [branch] };
}

test("Zap's favorite acorn uses a real branch, requires embodied rocking, falls physically, and recruits a follower", async () => {
  const { ParkSquirrelQuest, THREE } = await loadQuestHarness();
  const quest = new ParkSquirrelQuest(new THREE.Scene(), {}, makeWorld(THREE), 1);
  assert.equal(quest.companionId, "central-park-squirrel");
  assert.equal(quest.squirrel.root.userData.animalName, "Zap");
  assert.equal(quest.branch.id, 0);
  assert.ok(quest.acornPosition.y > quest.tree.canopyY, "the favorite acorn must be physically lodged on a climbable branch");
  assert.equal(quest.interactionHint(quest.squirrel.root.position)?.label, "NOTICE WHAT ZAP IS WATCHING");
  assert.equal(quest.interact(quest.squirrel.root.position)?.kind, "ZAP_NOTICED");
  assert.equal(quest.state, "SEEKING_ACORN");
  assert.equal(quest.interactionHint(quest.acorn.position)?.label, "GRIP THE BRANCH BESIDE ZAP'S ACORN");
  assert.equal(quest.interact(quest.acorn.position)?.kind, "BRANCH_GRIPPED");
  assert.equal(quest.state, "LOOSENING_ACORN");
  quest.update(.025, .025, { player: quest.acorn.position.clone(), floorYAt: () => 0, onFavoriteBranch: false, branchRockDirection: 1 });
  assert.equal(quest.state, "SEEKING_ACORN", "leaving the authored limb should return to the climb objective instead of trapping the quest");
  assert.equal(quest.interact(quest.acorn.position)?.kind, "BRANCH_GRIPPED");
  const rockingContext = { player: quest.acorn.position.clone(), floorYAt: () => 0, onFavoriteBranch: true, branchRockDirection: 1 };
  quest.update(.05, .05, rockingContext);
  quest.update(.1, .05, rockingContext);
  assert.equal(quest.rockProgress, 25, "holding one direction cannot cheese the living-branch interaction");
  for (const [index, direction] of [-1, 1, -1].entries()) {
    quest.update(.15 + index * .05, .05, { ...rockingContext, branchRockDirection: direction });
  }
  assert.equal(quest.state, "ACORN_FALLING");
  assert.equal(quest.consumeEvent()?.kind, "ZAP_NOTICED");
  assert.equal(quest.consumeEvent()?.kind, "BRANCH_GRIPPED");
  assert.equal(quest.consumeEvent()?.kind, "BRANCH_GRIPPED");
  assert.equal(quest.consumeEvent()?.kind, "ACORN_DISLODGED");
  const startHeight = quest.acorn.position.y;
  const context = { player: new THREE.Vector3(), floorYAt: () => 0 };
  let elapsed = 0;
  for (let index = 0; index < 240 && quest.state !== "REUNITING"; index++) {
    elapsed += .05;
    quest.update(elapsed, .05, context);
  }
  assert.equal(quest.state, "REUNITING");
  assert.ok(quest.acorn.position.y < startHeight - 1, "dislodged acorn should fall from the authored branch to the ground");
  for (let index = 0; index < 240 && quest.state !== "FOLLOWING"; index++) {
    elapsed += .05;
    quest.update(elapsed, .05, context);
  }
  assert.equal(quest.state, "FOLLOWING");
  assert.equal(quest.isComplete, true);
  const player = new THREE.Vector3(12, 4, -3);
  quest.update(elapsed + .1, .1, { player, playerYaw: .4, playerArboreal: true, floorYAt: () => 0 });
  assert.equal(quest.squirrel.root.userData.followMode, "canopy");
  assert.equal(quest.squirrel.root.userData.animationState, "climb");
  quest.dispose();
});

test("Zap's production asset retains original source, PBR, LOD, review, and runtime contracts", async () => {
  const [generator, asset, provenance, manifest, runtime] = await Promise.all([
    readFile(new URL("../tools/animal-pipeline/build_eastern_gray_squirrel.py", import.meta.url), "utf8"),
    readFile(new URL("../tools/animal-pipeline/source/eastern-gray-squirrel.asset.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../tools/animal-pipeline/source/eastern-gray-squirrel.provenance.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../public/game/animals/authored/manifest.json", import.meta.url), "utf8").then(JSON.parse),
    readFile(new URL("../app/game/world/animals/AuthoredZooAnimalAssets.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(generator, /bpy\.ops\.(?:wm\.(?:append|link)|import_mesh\.)/);
  assert.match(generator, /bpy\.ops\.import_scene\.gltf\(filepath=str\(glb\)\)/, "the only import should be the generator's own fresh-export review");
  assert.equal(asset.license, "Original-Project-Asset");
  assert.deepEqual(provenance.thirdPartyAssets, []);
  assert.deepEqual(asset.clips.map(clip => clip.name), ["SquirrelIdle", "SquirrelScamper", "SquirrelForage", "SquirrelClimb"]);
  assert.ok(asset.lod0.triangles > asset.lod2.triangles);
  assert.ok(asset.lod2.triangles < asset.lod0.triangles * .5);
  assert.ok(Object.values(asset.previews).length >= 14);
  assert.ok(Object.values(asset.maps).every(map => map.width === 2048 && map.height === 2048));
  assert.match(asset.provenance.geometry, /Original repository-authored/i);
  assert.match(asset.provenance.textures, /no third-party pixels/i);
  assert.ok(manifest.species.some(species => species.id === "eastern-gray-squirrel"));
  assert.match(runtime, /"eastern-gray-squirrel"/);
});

test("Zap's direct acorn checkpoint frames the actual branch objective", async () => {
  const [game, checkpoints] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/debugCheckpoints.ts", import.meta.url), "utf8"),
  ]);
  assert.match(game, /qaInput === "squirrelacorn"[\s\S]{0,520}distanceTo\(squirrelQuest\.acornPosition\) > 1\.46/);
  assert.match(game, /const acornDirection = squirrelQuest\.acornPosition\.clone\(\)\.sub\(player\)/);
  assert.match(game, /pitch = Math\.atan2\(acornDirection\.y, Math\.hypot\(acornDirection\.x, acornDirection\.z\)\)/);
  assert.match(game, /Find out what Zap is watching/);
  assert.match(game, /Help Zap recover his favorite acorn/);
  assert.match(game, /rockingZapBranch/);
  assert.match(game, /branchRockDirection: zapRockDirection/);
  assert.match(game, /Rock Zap's branch until the acorn loosens/);
  assert.match(game, /DESCEND TO ZAP AT THE ROOTS/);
  assert.match(game, /STAY NEAR ZAP WHILE HE RECLAIMS THE ACORN/);
  assert.match(game, /targetActive: !localQuestCopy && parkStage !== "FORAGE"/);
  assert.match(checkpoints, /"squirrel-rocking": "squirrelrocking"/);
});
