import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("hot gameplay loops avoid recurring allocations and off-camera crowd mixers run on a bounded schedule", async () => {
  const [game, subway, museum, zoo, scheduler] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/SubwayWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/NaturalHistoryMuseumWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/BronxZooWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/systems/performance/VisibilityAwareUpdateScheduler.ts", import.meta.url), "utf8"),
  ]);

  assert.match(game, /movementForward\.set\(/);
  assert.doesNotMatch(game, /const forward = new THREE\.Vector3\(-Math\.sin\(yaw\)/);
  assert.match(subway, /const previous = flow\.previous\.copy\(flow\.group\.position\)/);
  assert.doesNotMatch(subway, /const previous = flow\.group\.position\.clone\(\)/);
  assert.match(museum, /guestUpdateScheduler\.deltaFor/);
  assert.match(zoo, /guestUpdateScheduler\.deltaFor/);
  assert.match(scheduler, /likelyVisible/);
  assert.match(scheduler, /backgroundHz/);
  assert.match(museum, /whiskersPrints\.forEach/);
  assert.doesNotMatch(museum, /\[\.\.\.this\.whiskersPawprints, \.\.\.this\.whiskersFreshTrail\]/);
});

test("museum shader warm-up uses non-blocking parallel compilation", async () => {
  const subwayGame = await readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8");
  assert.match(subwayGame, /renderer\.compileAsync\(museumPreloadScene, preloadCamera\)/);
  assert.doesNotMatch(subwayGame, /renderer\.compile\(museumPreloadScene, preloadCamera\)/);
});

test("dense static zoo and museum scenery is spatially batched without touching animated roots", async () => {
  const [batcher, zoo, museum] = await Promise.all([
    readFile(new URL("../app/game/systems/performance/StaticSceneBatcher.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/BronxZooWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/NaturalHistoryMuseumWorld.ts", import.meta.url), "utf8"),
  ]);
  assert.match(batcher, /mergeGeometries/);
  assert.match(batcher, /cellX/);
  assert.match(batcher, /excludedByAncestor/);
  assert.match(zoo, /batchStaticMeshes\(this\.root/);
  assert.match(zoo, /\.\.\.this\.animals\.map\(animal => animal\.root\)/);
  assert.match(zoo, /\.\.\.this\.arrivalDistrictMotion\.movingRoots/);
  assert.match(museum, /batchStaticMeshes\(this\.root/);
  assert.match(museum, /\.\.\.this\.guests\.map\(guest => guest\.root\)/);
});

test("GTAO reuses the full-resolution beauty depth instead of re-rendering the scene G-buffer", async () => {
  const pipeline = await readFile(new URL("../app/game/rendering/AdaptiveRenderPipeline.ts", import.meta.url), "utf8");
  assert.match(pipeline, /renderTarget\.depthTexture = new THREE\.DepthTexture/);
  assert.match(pipeline, /const sharedDepthTexture = this\.composer\.readBuffer\.depthTexture/);
  assert.match(pipeline, /this\.gtao\.setGBuffer\(sharedDepthTexture\)/);
});

test("the immersive Bronx backdrop keeps its density without sub-pixel bevel over-tessellation", async () => {
  const zoo = await readFile(new URL("../app/game/world/BronxZooWorld.ts", import.meta.url), "utf8");
  assert.match(zoo, /"bronx-full-volume-varied-building-field", new THREE\.BoxGeometry/);
  assert.match(zoo, /"bronx-neighborhood-ground-floor-storefront-frame-network", new THREE\.BoxGeometry/);
  assert.match(zoo, /"bronx-neighborhood-ground-floor-glazing-and-interior-light", new THREE\.BoxGeometry/);
  assert.match(zoo, /new THREE\.CylinderGeometry\(\.08, \.19, 1, quality > \.75 \? 10 : 7, 1\)/);
});
