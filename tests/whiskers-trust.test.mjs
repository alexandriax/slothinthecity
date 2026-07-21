import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as esbuild from "esbuild";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

let trustHarnessPromise;
function loadTrustHarness() {
  trustHarnessPromise ??= (async () => {
    const source = await readSource("../app/game/world/WhiskersTrust.ts");
    const result = await esbuild.transform(source, { format: "cjs", loader: "ts", target: "es2022" });
    const loadedModule = { exports: {} };
    new Function("module", "exports", result.code)(loadedModule, loadedModule.exports);
    return loadedModule.exports;
  })();
  return trustHarnessPromise;
}

test("Whiskers trust rewards respectful stillness and gaze instead of proximity alone", async () => {
  const { advanceWhiskersTrust } = await loadTrustHarness();
  const initial = .6;
  const tooClose = advanceWhiskersTrust(initial, .1, { alignment: 1, distance: .8, playerSpeed: 0 });
  const tooFar = advanceWhiskersTrust(initial, .1, { alignment: 1, distance: 7, playerSpeed: 0 });
  const lookingAway = advanceWhiskersTrust(initial, .1, { alignment: .2, distance: 3, playerSpeed: 0 });
  const stillMoving = advanceWhiskersTrust(initial, .1, { alignment: 1, distance: 3, playerSpeed: 1.2 });
  const quietMoment = advanceWhiskersTrust(initial, .1, { alignment: .96, distance: 3, playerSpeed: .04 });

  assert.equal(tooClose.state, "GIVE_SPACE");
  assert.equal(tooFar.state, "APPROACH");
  assert.equal(lookingAway.state, "FACE_WHISKERS");
  assert.equal(stillMoving.state, "SETTLE");
  for (const interrupted of [tooClose, tooFar, lookingAway, stillMoving]) {
    assert.equal(interrupted.engaged, false);
    assert.ok(interrupted.progress < initial, "a missed condition should gently release trust");
  }
  assert.equal(quietMoment.state, "CONNECTING");
  assert.equal(quietMoment.engaged, true);
  assert.ok(quietMoment.progress > initial);
});

test("the quiet moment completes consistently and rejects invalid frame deltas", async () => {
  const { advanceWhiskersTrust } = await loadTrustHarness();
  let progress = 0;
  let result;
  for (let frame = 0; frame < 90; frame++) {
    result = advanceWhiskersTrust(progress, 1 / 60, { alignment: .94, distance: 3.2, playerSpeed: 0 });
    progress = result.progress;
  }
  assert.equal(progress, 1);
  assert.equal(result.state, "READY");
  assert.equal(advanceWhiskersTrust(.4, -.5, { alignment: 1, distance: 3, playerSpeed: 0 }).progress, .4);
  assert.equal(advanceWhiskersTrust(Number.NaN, .1, { alignment: Number.NaN, distance: Number.NaN, playerSpeed: Number.NaN }).progress, 0);
});

test("the museum uses one greeting, then automatic world-space trust moments", async () => {
  const [museum, game, checkpoints] = await Promise.all([
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/debugCheckpoints.ts"),
  ]);

  assert.match(museum, /this\.whiskersStateValue !== "AVAILABLE"/);
  assert.match(museum, /advanceWhiskersTrust\(this\.whiskersTrustProgressValue, delta/);
  assert.match(museum, /if \(trust\.state === "READY"\) this\.advanceWhiskersTrail\(elapsed\)/);
  assert.match(museum, /whiskersTrustActive/);
  assert.match(museum, /trustWarmth/);
  assert.match(museum, /whiskers-restrained-gallery-story-pool-light/);
  assert.match(museum, /stageWhiskersTrustMoment\(\)/);
  assert.match(game, /museumWorld\.update\(gameTime, delta, player, yaw, velocity\.length\(\)\)/);
  assert.match(game, /museumWorld\.consumeWhiskersEvent\(\)/);
  assert.match(game, /QUIET TRUST/);
  assert.match(game, /fieldStatus: whiskersTrust\.active/);
  assert.match(game, /stage === "MUSEUM" && hud\.fieldStatus \? hud\.fieldStatus : hud\.motion/);
  assert.match(game, /wayfinding: pursuingWhiskers \? !whiskersTrust\.active/);
  assert.match(checkpoints, /"museum-whiskers-trust": "museumwhiskerstrust"/);
});
