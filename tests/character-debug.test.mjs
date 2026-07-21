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
  assert.match(showroom, /profile.*three-quarter.*back/s);
  assert.match(showroom, /mode === "profile"/);
  assert.match(showroom, /mode === "three-quarter"/);
  assert.match(showroom, /mode === "back"/);
  assert.match(showroom, /backdrop\.visible = framingRef\.current !== "back"/);
  assert.match(showroom, /accessory\.visible = !\["face", "back"\]\.includes\(framingRef\.current\)/);
  assert.match(showroom, /Natural walk/);
  assert.match(showroom, /HumanWalk/);
  assert.match(showroom, /result\.root\.visible = ready/);
  assert.match(showroom, /function reviewBodyBounds/);
  assert.match(showroom, /object instanceof THREE\.SkinnedMesh/);
  assert.match(showroom, /reviewBodyBounds\(selectedRoot\)/);
  assert.match(showroom, /new THREE\.Timer\(\)/);
  assert.match(showroom, /timer\.connect\(document\)/);
  assert.match(showroom, /THREE\.PCFShadowMap/);
  assert.doesNotMatch(showroom, /THREE\.Clock|PCFSoftShadowMap/);
  assert.match(showroom, /bounds\.min\.y \+ height \* \.91/);
  assert.match(showroom, /appliedFramingGeometry !== framingGeometry/);
  assert.match(showroom, /next !== "neutral"\) setAnimationClip\("HumanIdle"\)/);
  assert.doesNotMatch(showroom, /controls\.target\.set\(focusX, 2\.18, 0\)/);
  assert.match(showroom, /Legacy/);
  assert.match(showroom, /\?debug=bronx/);
  assert.match(showroom, /\?debug=station/);
  assert.match(showroom, /\?debug=train/);
  assert.doesNotMatch(checkpoints, /zoo:\s*"zoo"/);
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
  assert.match(pipeline, /straighten_head_and_neck/);
  assert.match(pipeline, /straighten_head_detail/);
  assert.match(pipeline, /HEAD_PITCH_CORRECTION_DEGREES = -10\.0/);
  assert.match(pipeline, /finish_upper_garment_openings\(upper, body, archetype\.source\)/);
  assert.match(pipeline, /bmesh\.ops\.bisect_plane/);
  assert.match(pipeline, /height \* 0\.515/);
  assert.match(pipeline, /height \* 0\.820/);
  assert.match(pipeline, /finished_upper_predicate_for/);
  assert.match(pipeline, /keep_largest_component=True/);
  assert.match(pipeline, /cuff_progress = 0\.88/);
  assert.match(pipeline, /loosen_upper_garment\(upper, body\)/);
  assert.match(pipeline, /finish_upper_garment_openings\(upper, body, archetype\.source\)\s+loosen_upper_garment\(upper, body\)/);
  assert.match(pipeline, /remaining_boundary_edges/);
  assert.match(pipeline, /edge\.other_vert\(vertex\)/);
  assert.match(pipeline, /bmesh\.ops\.smooth_vert/);
  assert.match(pipeline, /sloth_city_loose_shirt_ease/);
  assert.match(pipeline, /def make_authored_hair_cap/);
  assert.match(pipeline, /def make_hair_back_extension/);
  assert.match(pipeline, /eye\.dimensions\.y \* 0\.5 \+ 0\.00015/);
  assert.match(pipeline, /sloth_city_authored_hair_extension/);
  assert.match(pipeline, /target_hairline = 0\.948/);
  assert.match(pipeline, /material_name == "Skin"/);
  assert.match(pipeline, /max\(ratio, 0\.36\)/);
  assert.match(pipeline, /sloth_city_authored_hair_shell/);
  assert.match(pipeline, /sha256.*file_sha256/s);
  assert.match(pipeline, /add_walk_action/);
  assert.match(pipeline, /transfer_skin_object/);
  assert.match(pipeline, /Anatomical skin-weight transfer/);
  assert.match(runtime, /requestedSeconds/);
  assert.match(runtime, /prepareAuthoredHumanLocomotion/);
  assert.match(runtime, /replaceFallbackWithAuthored/);
  assert.match(runtime, /authoredHumanExclusive = true/);
  assert.match(runtime, /host\.visible = false/);
  assert.match(runtime, /host\.visible = true/);
  assert.match(runtime, /authoredHumanStatus = "authored-load-failed"/);
  assert.match(runtime, /captureStationaryGestureBones/);
  assert.match(runtime, /applyStationaryGesture\(state, motion, activity\)/);
  assert.match(runtime, /function addAuthoredAccessory/);
  assert.match(runtime, /stable-authored-root/);
  assert.match(runtime, /authored-human-accessory-\$\{kind\}/);
  assert.match(runtime, /anchor\.attach\(group\)/);
  assert.match(runtime, /color: "#d8d0c2"/);
  assert.match(runtime, /sheen: \.62/);
  assert.doesNotMatch(runtime, /procedural-fallback/);
  assert.doesNotMatch(subway, /return addLegacyNpc/);
});
