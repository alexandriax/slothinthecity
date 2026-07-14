import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const worldUrl = new URL("../app/game/world/SubwayWorld.ts", import.meta.url);
const gameUrl = new URL("../app/game/SubwayGame.tsx", import.meta.url);
const touchUrl = new URL("../app/game/mobile/TouchControls.tsx", import.meta.url);

test("Fifth Avenue starts unpaid and requires a touch-capable MetroCard sequence", async () => {
  const [world, game, touch] = await Promise.all([
    readFile(worldUrl, "utf8"), readFile(gameUrl, "utf8"), readFile(touchUrl, "utf8"),
  ]);

  assert.match(world, /\["FIFTH_AV", false\]/);
  assert.match(world, /unpaid-side-metrocard-machine/);
  assert.match(world, /collectible-metrocard/);
  assert.match(world, /kind: "COLLECT_METROCARD"/);
  assert.match(world, /kind: "SWIPE_METROCARD"/);
  assert.match(world, /farePaidByStation\.set\(this\.stationId, true\)/);
  assert.match(game, /stationWorld\.interactionHint\(player\)/);
  assert.match(game, /stationWorld\.interact\(player\)/);
  assert.match(touch, /prompt\.includes\("SWIPE METROCARD"\) \? "Swipe"/);
  assert.match(touch, /prompt\.includes\("COLLECT METROCARD"\) \? "Card"/);
});

test("fare control is wall-to-wall, booth-side correct, and guidance cones are gone", async () => {
  const world = await readFile(worldUrl, "utf8");

  assert.match(world, /unpaid-side-station-agent-booth/);
  assert.match(world, /\[\[-9\.72, -2\.42\], \[2\.42, 9\.72\]\]/);
  assert.match(world, /blockedByFare/);
  assert.match(world, /outsideTurnstileLanes/);
  assert.match(world, /locked-three-arm-rotor/);
  assert.doesNotMatch(world, /new THREE\.ConeGeometry/);
});

test("station doors ease and platform passengers visibly exchange", async () => {
  const world = await readFile(worldUrl, "utf8");

  assert.match(world, /doorOpenAmount = Math\.min\(THREE\.MathUtils\.smoothstep/);
  assert.match(world, /setDoorAmount\(train, this\.doorOpenAmount\)/);
  assert.match(world, /transparent-exterior-door-window/);
  assert.match(world, /transparent-exterior-side-window/);
  assert.match(world, /updateStationPassengerFlows\(cycle\)/);
  assert.match(world, /mode: index % 3 === 0 \? "BOARD" : index % 3 === 1 \? "ALIGHT"/);
  assert.match(world, /const alightProgress = THREE\.MathUtils\.smoothstep\(cycle, 6, 9\.35\)/);
  assert.match(world, /const boardProgress = THREE\.MathUtils\.smoothstep\(cycle, 8\.85, 12\.75\)/);
});

test("street stairs blend daylight into the mezzanine without a fake initial loading card", async () => {
  const [world, game] = await Promise.all([readFile(worldUrl, "utf8"), readFile(gameUrl, "utf8")]);

  assert.match(world, /streetEnvironmentMix\(player: THREE\.Vector3\)/);
  assert.match(game, /const \[transition, setTransition\] = useState\(""\)/);
  assert.match(game, /scene\.fog\.color\.copy\(fogInterior\)\.lerp\(fogStreet, streetMix\)/);
  assert.match(game, /Now entering/);
});
