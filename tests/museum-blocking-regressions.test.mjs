import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as esbuild from "esbuild";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

let navigationPromise;
function loadNavigation() {
  navigationPromise ??= (async () => {
    const source = await readSource("../app/game/world/MuseumCompanionPath.ts");
    const result = await esbuild.transform(source, { format: "cjs", loader: "ts", target: "es2022" });
    const loadedModule = { exports: {} };
    new Function("module", "exports", result.code)(loadedModule, loadedModule.exports);
    return loadedModule.exports;
  })();
  return navigationPromise;
}

test("museum companion paths route around walls and raised exhibit footprints", async () => {
  const { planMuseumCompanionPath, museumCompanionSegmentClear } = await loadNavigation();
  const bounds = { minX: -15, maxX: 15, minZ: -15, maxZ: 15 };
  const boxes = [{ minX: -1.2, maxX: 1.2, minZ: -5.5, maxZ: 5.5 }];
  const circles = [{ x: 5.3, z: 5.2, radius: 2.4 }];
  const from = { x: -11, z: 0 }, to = { x: 11, z: 0 }, radius = .3;
  const route = planMuseumCompanionPath(from, to, boxes, circles, radius, bounds);

  assert.ok(route.length >= 3, "a wall between endpoints must produce a routed path");
  assert.deepEqual(route, planMuseumCompanionPath(from, to, boxes, circles, radius, bounds));
  route.slice(1).forEach((point, index) => {
    assert.equal(
      museumCompanionSegmentClear(route[index], point, boxes, circles, radius + .12, bounds),
      true,
      `route segment ${index + 1} must clear every expanded obstacle`,
    );
  });
});

test("Whiskers uses planned floor routes and every grounded wall owns collision", async () => {
  const museum = await readSource("../app/game/world/NaturalHistoryMuseumWorld.ts");
  assert.match(museum, /import \{ planMuseumCompanionPath \} from "\.\/MuseumCompanionPath"/);
  assert.match(museum, /if \(y - height \* \.5 <= \.08\) boxes\.push/);
  assert.match(museum, /planMuseumCompanionPath\(from, to, this\.boxes, this\.circles, \.28\)/);
  assert.match(museum, /this\.whiskersTravelCumulative/);
  assert.doesNotMatch(museum, /firstTurn\.x \*=|secondTurn\.x \*=/);
  assert.match(museum, /this\.resolveCompanion\(this\.whiskers\.root\.position, this\.whiskersResolveVelocity, \.28\)/);
});

test("photographers only pose while photographing and their resting camera is physically supported", async () => {
  const [runtime, ambient] = await Promise.all([
    readSource("../app/game/world/characters/AuthoredHumanAssets.ts"),
    readSource("../app/game/world/characters/AmbientHumanMotion.ts"),
  ]);
  assert.match(runtime, /authored-camera-body-resting-against-chest/);
  assert.match(runtime, /authored-camera-full-neck-strap/);
  assert.match(runtime, /neck-strap-and-chest-contact/);
  assert.match(runtime, /if \(activity !== "photographing"\) return/);
  assert.match(runtime, /applyArmPose\(bones, "L", \.18, -\.7, -\.96, \.22\)/);
  assert.match(runtime, /activity = "observing"/);
  assert.match(ambient, /const activity = walking/);
  assert.match(ambient, /updateAuthoredHumanMotion\([\s\S]{0,240}activity,/);
});
