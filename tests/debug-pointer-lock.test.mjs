import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("direct debug scenes preserve pointer-lock look and menu recovery", async () => {
  const [checkpoints, game, subway, menu] = await Promise.all([
    readSource("../app/game/debugCheckpoints.ts"),
    readSource("../app/game/GameClient.tsx"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/mobile/DebugJumpMenu.tsx"),
  ]);

  assert.match(checkpoints, /DEBUG_LOOK_REQUEST_EVENT\s*=\s*"sloth-debug-look-requested"/);
  assert.doesNotMatch(game, /isDirectDebugSession/);
  assert.doesNotMatch(subway, /isDirectDebugSession/);
  assert.match(game, /isAutomatedQaSession/);
  assert.match(subway, /isAutomatedQaSession/);
  assert.match(game, /addEventListener\(DEBUG_LOOK_REQUEST_EVENT, requestLock\)/);
  assert.match(subway, /addEventListener\(DEBUG_LOOK_REQUEST_EVENT, requestDebugLook\)/);
  assert.match(subway, /addEventListener\("pointerlockchange", pointerLockChanged\)/);
  assert.match(subway, /className="mouse-resume"/);
  assert.match(menu, /if \(!nextOpen\) document\.dispatchEvent\(new Event\(DEBUG_LOOK_REQUEST_EVENT\)\)/);
  assert.match(menu, /Close QA menu and resume mouse look/);
});

test("only localhost qa automation suppresses pointer lock", async () => {
  const { isAutomatedQaSession } = await import("../app/game/debugCheckpoints.ts");

  assert.equal(isAutomatedQaSession("?debug=station&debugMenu=1", "localhost"), false);
  assert.equal(isAutomatedQaSession("?debug=station&debugMenu=1", "preview.example"), false);
  assert.equal(isAutomatedQaSession("?qa=subwayplatform", "localhost"), true);
  assert.equal(isAutomatedQaSession("?qa=subwayplatform", "127.0.0.1"), true);
  assert.equal(isAutomatedQaSession("?qa=subwayplatform", "preview.example"), false);
  assert.equal(isAutomatedQaSession("", "localhost"), false);
});
