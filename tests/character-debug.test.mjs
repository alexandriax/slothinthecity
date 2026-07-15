import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("character lab offers direct authored-human review without campaign traversal", async () => {
  const [page, showroom, checkpoints, game] = await Promise.all([
    readSource("../app/debug/characters/page.tsx"),
    readSource("../app/debug/characters/CharacterShowroom.tsx"),
    readSource("../app/game/debugCheckpoints.ts"),
    readSource("../app/game/GameClient.tsx"),
  ]);
  assert.match(page, /CharacterShowroom/);
  assert.match(showroom, /Human character lab/);
  assert.match(showroom, /lineup.*body.*face/s);
  assert.match(showroom, /Legacy/);
  assert.match(showroom, /\?debug=zoo/);
  assert.match(showroom, /\?debug=station/);
  assert.match(showroom, /\?debug=train/);
  assert.match(checkpoints, /zoo:\s*"zoo"/);
  assert.match(checkpoints, /station:\s*"subwayplatform"/);
  assert.match(checkpoints, /train:\s*"trainride"/);
  assert.match(game, /get\("debug"\)\s*===\s*"characters"/);
  assert.match(game, /location\.replace\("\/debug\/characters"\)/);
});

test("authored pipeline rejects primitive face and body remnants", async () => {
  const [pipeline, runtime, subway] = await Promise.all([
    readSource("../tools/character-pipeline/build_humans.py"),
    readSource("../app/game/world/characters/AuthoredHumanAssets.ts"),
    readSource("../app/game/world/SubwayWorld.ts"),
  ]);
  assert.doesNotMatch(pipeline, /details\.extend\(add_facial_details/);
  assert.doesNotMatch(pipeline, /def add_hair_volume/);
  assert.doesNotMatch(pipeline, /def add_garment_details/);
  assert.doesNotMatch(pipeline, /GarmentPlacket|UniformBadge|BobStrand|PonytailTie|Curl\./);
  assert.match(pipeline, /add_eye_disc/);
  assert.match(runtime, /replaceFallbackWithAuthored/);
  assert.match(runtime, /authoredHumanExclusive = true/);
  assert.match(runtime, /host\.visible = false/);
  assert.match(runtime, /host\.visible = true/);
  assert.match(runtime, /authoredHumanStatus = "authored-load-failed"/);
  assert.doesNotMatch(runtime, /procedural-fallback/);
  assert.doesNotMatch(subway, /return addLegacyNpc/);
});
