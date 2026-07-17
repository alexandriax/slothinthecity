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
  assert.match(world, /station-booth-front-glass/);
  assert.match(world, /station-booth-back-glass/);
  assert.match(world, /station-booth-side-glass/);
  assert.match(world, /addStationAttendant\(booth, 0, 0, \.08/);
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
  assert.match(world, /updateStationPassengerFlows\(cycle, delta\)/);
  assert.match(world, /updateAuthoredHumanMotion\(flow\.group, delta, flow\.group\.visible && locomoting \? "walk" : "idle"/);
  assert.match(world, /prepareAuthoredHumanLocomotion\(passenger\)/);
  assert.match(world, /mode: z > 11 \|\| id === "WEST_FARMS" \? "AMBIENT" : index % 3 === 0 \? "BOARD" : index % 3 === 1 \? "ALIGHT"/);
  assert.match(world, /const alightProgress = THREE\.MathUtils\.smoothstep\(cycle, 6, 9\.35\)/);
  assert.match(world, /const boardProgress = THREE\.MathUtils\.smoothstep\(cycle, 8\.85, 12\.75\)/);
  assert.match(world, /exchangeComplete: false/);
  assert.match(world, /if \(boardProgress >= \.96\) flow\.exchangeComplete = true/);
  assert.match(world, /visible-open-car-interior/);
});

test("boarding requires a platform-level crossing through one open doorway", async () => {
  const [world, game] = await Promise.all([readFile(worldUrl, "utf8"), readFile(gameUrl, "utf8")]);

  assert.match(world, /boardingOption\(player: THREE\.Vector3, previousPlayer: THREE\.Vector3\)/);
  assert.match(world, /Math\.abs\(player\.y - 1\.48\) > \.48/);
  assert.match(world, /const previousDepth =/);
  assert.match(world, /previousDepth > \.16 \|\| depth < \.06/);
  assert.match(world, /Math\.abs\(player\.z - door\.z\) > \.78/);
  assert.match(world, /boardingHint[\s\S]{0,220}Math\.abs\(player\.y - 1\.48\) > \.58/);
  assert.match(game, /playerBeforeMovement\.copy\(player\)/);
  assert.match(game, /boardingOption\(player, playerBeforeMovement\)/);
});

test("street stairs blend daylight into the mezzanine without a fake initial loading card", async () => {
  const [world, game] = await Promise.all([readFile(worldUrl, "utf8"), readFile(gameUrl, "utf8")]);

  assert.match(world, /streetEnvironmentMix\(player: THREE\.Vector3\)/);
  assert.match(game, /const \[transition, setTransition\] = useState\(""\)/);
  assert.match(game, /scene\.fog\.color\.copy\(fogInterior\)\.lerp\(fogStreet, streetMix\)/);
  assert.match(game, /Now entering/);
});

test("failed rides restore the paid platform checkpoint without replaying door audio", async () => {
  const [world, game] = await Promise.all([readFile(worldUrl, "utf8"), readFile(gameUrl, "utf8")]);

  assert.match(world, /export type SubwayProgressState/);
  assert.match(world, /get progressState\(\): SubwayProgressState/);
  assert.match(world, /restoreProgressState\(progress: SubwayProgressState\)/);
  assert.match(world, /checkpointSpawn\(platform = false\)/);
  assert.match(game, /let subwayProgress = stationWorld\.progressState/);
  assert.match(game, /subwayProgress = stationWorld\.progressState; stationWorld\.dispose\(\)/);
  assert.match(game, /checkpoint\(currentStation, message, true, false, true\)/);
  assert.match(game, /stationWorld\.checkpointSpawn\(resumeAtPlatform\)/);
  assert.match(game, /stationWorld\.update\(stationClock\); previousTrainPhase = stationWorld\.trainPhase; previousDoorsOpen = stationWorld\.doorsOpen/);
});

test("successful transfers arrive on the paid Lexington concourse to choose a platform", async () => {
  const game = await readFile(gameUrl, "utf8");

  assert.match(game, /const destination = boarded\.destination/);
  assert.match(game, /destination === "LEXINGTON"/);
  assert.match(game, /Lexington Av \/ 59 St — take the uptown 5 for the Bronx, or a downtown N \/ R to ride back to Fifth Avenue/);
  assert.match(game, /checkpoint\(destination, message, false, true, destination !== "LEXINGTON"\)/);
  assert.match(game, /qaInput === "lexingtontransfer"/);
  assert.match(game, /paid-area transfer platform/);
});

test("Fifth Avenue alternates concrete N and R arrivals in geometry and HUD", async () => {
  const [world, game] = await Promise.all([readFile(worldUrl, "utf8"), readFile(gameUrl, "utf8")]);

  assert.match(world, /get recommendedTrain\(\) \{ return this\.trainOnPlatform\(this\.servicePlan\.correct\.platformSide\); \}/);
  assert.match(world, /get arrivingService\(\) \{ return \{ direction: this\.recommendedTrain\.direction, route: this\.recommendedTrain\.route \}; \}/);
  assert.match(game, /An uptown \$\{stationWorld\.arrivingService\.route\} train is approaching the station/);
  assert.match(game, /Take the Queens-bound \$\{arrivingRoute\} train one stop/);
  assert.match(game, /NEXT \$\{routeStatus\}/);
});

test("subway stations stream one active world and dispose the previous station", async () => {
  const world = await readFile(worldUrl, "utf8");

  assert.match(world, /initialStation\?: SubwayStationId/);
  assert.match(world, /this\.stationId = options\.initialStation \?\? "FIFTH_AV"/);
  assert.match(world, /for \(const stationId of \[\.\.\.this\.stations\.keys\(\)\]\) if \(stationId !== id\) this\.disposeStation\(stationId\)/);
  assert.match(world, /private disposeStation\(id: SubwayStationId\)/);
  assert.match(world, /this\.stationOwnedTextures\.delete\(id\); this\.stations\.delete\(id\)/);
  assert.doesNotMatch(world, /for \(const id of \["FIFTH_AV", "LEXINGTON", "WEST_FARMS"\]/);
});
