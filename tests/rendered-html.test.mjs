import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const html = await readFile(new URL("../.next/server/app/index.html", import.meta.url), "utf8");
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

test("server-renders the branded game shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>SLOTH \/ PARK — A Central Park Survival Adventure<\/title>/i);
  assert.match(html, /Play as a displaced sloth in a cinematic first-person Central Park adventure/i);
  assert.match(html, /property="og:image" content="https?:\/\/[^\"]+\/social\/sloth-park-og-v2\.jpg"/i);
  assert.match(html, /property="og:image:width" content="1200"/i);
  assert.match(html, /property="og:image:height" content="630"/i);
  assert.match(html, /name="twitter:card" content="summary_large_image"/i);
  assert.match(html, /THE RAMBLE · CENTRAL PARK/);
  assert.match(html, /PREPARING THE PARK|ENTER THE RAMBLE/);
  assert.match(html, /data-game-state="intro"/);
  assert.match(html, /3D game viewport/);
  assert.match(html, /game\/splash\.webp/);
  assert.match(html, /viewport-fit=cover/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("removes the disposable starter and keeps the game browser-safe", async () => {
  const [page, layout, game, quality, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/systems/quality/AdaptiveQualityManager.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /GameClient/);
  assert.match(layout, /Play as a displaced sloth in a cinematic first-person Central Park adventure/i);
  assert.match(layout, /sloth-park-og-v2\.jpg/);
  assert.match(game, /^"use client";/);
  assert.match(game, /requestPointerLock/);
  assert.match(game, /typeof canvas\.requestPointerLock !== "function"/);
  assert.match(game, /requestPointerLockSafely/);
  assert.match(quality, /prefers-reduced-motion/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
});

test("mobile entry cannot be stranded by unavailable Pointer Lock", async () => {
  const game = await readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8");
  const beginStart = game.indexOf("const begin = useCallback");
  const beginEnd = game.indexOf("const resume", beginStart);
  assert.ok(beginStart >= 0 && beginEnd > beginStart);
  const begin = game.slice(beginStart, beginEnd);
  assert.ok(begin.indexOf('setPhase("playing")') < begin.indexOf("safeLock()"));
  assert.match(begin, /audio\.setScene\("central-park"/);
  assert.match(begin, /void audio\.unlock\(\)/);
  assert.match(game, /phase === "intro" \|\| exiting/);
  assert.match(game, /data-touch-capable/);
});

test("foraging opens the Bow Bridge to zoo to subway campaign with adaptive wayfinding", async () => {
  const [game, mobileHud, wayfinder, world, landmarks] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/mobile/MobileHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/GoalWayfinder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/CampaignLandmarks.ts", import.meta.url), "utf8"),
  ]);

  assert.match(game, /type ParkStage = "FORAGE" \| "BOW_BRIDGE" \| "ZOO" \| "SUBWAY_ENTRANCE"/);
  assert.match(game, /collected\.current\.size >= 5\) parkStage = "BOW_BRIDGE"/);
  assert.match(game, /parkStage === "BOW_BRIDGE"[\s\S]{0,800}parkStage = "ZOO"/);
  assert.match(game, /Attendant: “There are no sloths here\.”/);
  assert.match(game, /parkStage = "SUBWAY_ENTRANCE"/);
  assert.match(game, /onEnterSubway\(\)/);
  assert.match(game, /<GoalWayfinder/);
  assert.match(game, /data-goal-distance/);
  assert.match(game, /active=\{hud\.targetActive\}/);
  assert.match(game, /label=\{hud\.waypointLabel\}/);
  assert.match(mobileHud, /objectiveShort/);
  assert.match(mobileHud, /objectiveValue/);
  assert.match(wayfinder, /aria-label=\{`\$\{label\}, \$\{meters\} meters away`\}/);
  assert.match(world, /export const GOAL = BOW_BRIDGE_TARGET/);
  assert.match(landmarks, /bow-bridge-and-lake-landing/);
  assert.match(landmarks, /central-park-zoo-entrance/);
  assert.match(landmarks, /5-av-59-st-subway-entrance/);
  assert.doesNotMatch(game, /qaInput === "gate"|gatecomplete|Follow the marker to sanctuary/);
  assert.doesNotMatch(wayfinder, /Sanctuary gate/);
});

test("The expanded Lake supplies two driveable rowboats that are faster than swimming", async () => {
  const [game, rowboat, world] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/ParkRowboat.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
  ]);

  assert.match(game, /world\.rowboatSpawns\.map\(spawn => createParkRowboat/);
  assert.match(game, /const lakeRadius = world\.lakeRadius/);
  assert.match(game, /world\.boatRadius/);
  assert.match(world, /LAKE_SWIM_RADIUS = 33\.2/);
  assert.match(world, /name: "Bow Bridge rowboat 7"/);
  assert.match(world, /name: "Bow Bridge rowboat 12"/);
  assert.match(world, /the-lake-playable-water/);
  assert.match(world, /the-lake-irregular-bank/);
  assert.match(game, /activeBoat\.update\(/);
  assert.match(game, /isBoatWater\(/);
  assert.match(game, /Rowboat boarded/);
  assert.match(game, /rowboats\.forEach\(\(?boat\)? => boat\.dispose\(\)\)/);
  assert.match(rowboat, /interactionKind = "park-rowboat"/);
  assert.match(rowboat, /interactionLabel = "Row across The Lake"/);
  assert.match(rowboat, /readonly oars: \[ParkRowboatOar, ParkRowboatOar\]/);
  const speed = Number(rowboat.match(/readonly maxForwardSpeed = ([\d.]+)/)?.[1]);
  assert.ok(speed > 2.65, `expected rowboat speed to exceed walking speed, received ${speed}`);
});

test("field-services cart has the requested plate and wheel-clear side placards", async () => {
  const cart = await readFile(new URL("../app/game/world/ParkUtilityCart.ts", import.meta.url), "utf8");

  assert.match(cart, /context\.fillText\("SLTHPRK", width \/ 2, 143\)/);
  assert.match(cart, /left-service-sign-backing/);
  assert.match(cart, /right-service-sign-backing/);
  assert.match(cart, /left-central-park-field-services-marking/);
  assert.match(cart, /right-central-park-field-services-marking/);

  const labelSize = cart.match(/const label = new THREE\.Mesh\(new THREE\.PlaneGeometry\(([\d.]+), ([\d.]+)\), materials\.label\)/);
  const labelPosition = cart.match(/label\.position\.set\(side \* ([\d.]+), ([\d.]+), ([\d.]+)\)/);
  const fender = cart.match(/new THREE\.TorusGeometry\(([\d.]+), ([\d.]+), 8, 24, Math\.PI\)[\s\S]{0,220}frontFender\.position\.set\(x, ([\d.]+), -1\.17\)/);
  assert.ok(labelSize && labelPosition && fender, "expected measurable label and fender geometry");
  const labelBottom = Number(labelPosition[2]) - Number(labelSize[2]) / 2;
  const fenderTop = Number(fender[3]) + Number(fender[1]) + Number(fender[2]);
  assert.ok(labelBottom > fenderTop, `service label bottom ${labelBottom} must clear fender top ${fenderTop}`);
});

test("subway service cycles every 30 seconds and presents route-correct trains", async () => {
  const world = await readFile(new URL("../app/game/world/SubwayWorld.ts", import.meta.url), "utf8");

  assert.match(world, /"FIFTH_AV", "LEXINGTON", "WEST_FARMS"/);
  assert.match(world, /SUBWAY_TRAIN_INTERVAL_SECONDS = 30/);
  assert.match(world, /const cycle = elapsed % SUBWAY_TRAIN_INTERVAL_SECONDS/);
  assert.match(world, /cycle < 4[\s\S]{0,240}cycle < 16[\s\S]{0,240}cycle < 21/);
  assert.match(world, /this\.doorsOpen = cycle >= 5 && cycle < 15/);
  assert.match(world, /buildTrain\(textures, "N", "QUEENS-BOUND", true/);
  assert.match(world, /const route = cycleNumber % 2 === 0 \? "N" : "R"/);
  assert.match(world, /buildTrain\(textures, "W", "[^"]+", false/);
  assert.match(world, /configureTrain\(this\.correctTrain, "5", "UPTOWN \/ BRONX", true/);
  assert.match(world, /configureTrain\(this\.wrongTrain,[\s\S]{0,160}"DOWNTOWN[^"]*"[\s\S]{0,80}false/);
  assert.match(world, /sloth-themed-subway-ad/);
  assert.match(world, /subway-passenger/);
  assert.match(world, /addStairs\(root, -5\.1[\s\S]{0,80}addStairs\(root, 5\.1/);
  await Promise.all([
    access(new URL("../public/game/ads/slow-superpower.webp", import.meta.url)),
    access(new URL("../public/game/ads/branch-out.webp", import.meta.url)),
    access(new URL("../public/game/ads/canopy-commute.webp", import.meta.url)),
    access(new URL("../public/game/ads/slow-fashion.webp", import.meta.url)),
    access(new URL("../public/game/ads/bronx-bound.webp", import.meta.url)),
    access(new URL("../public/game/ads/ramble-after-dark.webp", import.meta.url)),
  ]);
});

test("wrong trains restore the current station checkpoint and correct trains advance", async () => {
  const subway = await readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8");
  const checkpointStart = subway.indexOf("function checkpoint");
  const finishRideStart = subway.indexOf("function finishRide");
  const frameStart = subway.indexOf("function frame");
  assert.ok(checkpointStart >= 0 && finishRideStart > checkpointStart && frameStart > finishRideStart);
  const checkpoint = subway.slice(checkpointStart, finishRideStart);
  const finishRide = subway.slice(finishRideStart, frameStart);

  assert.match(checkpoint, /stationWorld\.setStation\(station\)/);
  assert.match(checkpoint, /player\.copy\(stationWorld\.spawn\)/);
  assert.match(checkpoint, /stationClock = waitForNextTrain \? 18 : 0/);
  assert.match(checkpoint, /boarded = null/);
  assert.match(finishRide, /if \(!boarded\.correct\)[\s\S]{0,220}checkpoint\(currentStation/);
  assert.match(finishRide, /Wrong train — checkpoint restored/);
  assert.match(finishRide, /checkpoint\("LEXINGTON"/);
  assert.match(finishRide, /checkpoint\("WEST_FARMS"/);
});

test("West Farms north exit completes the mission at the Bronx Zoo", async () => {
  const [subway, world] = await Promise.all([
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/SubwayWorld.ts", import.meta.url), "utf8"),
  ]);

  assert.match(world, /WEST FARMS SQ \/ E TREMONT AV/);
  assert.match(world, /EXIT · BOSTON RD \/ E 178 ST/);
  assert.match(world, /BRONX ZOO · ASIA GATE/);
  assert.match(world, /this\.stationId === "WEST_FARMS"[\s\S]{0,140}this\.trainPhase = "AWAY"/);
  assert.match(subway, /prompt = "WALK UP TO THE BRONX ZOO EXIT"/);
  assert.match(subway, /distance < 1\.45\) enterBronxZoo\(\)/);
  assert.match(subway, /setTransitStage\("COMPLETE"\)/);
  assert.match(subway, /new BronxZooWorld\(scene, textures/);
  assert.match(subway, /stationWorld\.dispose\(\); stationWorld = null/);
  assert.match(subway, /<div className="eyebrow">Bronx Zoo · Asia Gate<\/div>/);
  assert.match(subway, /<h2>Mission complete\.<\/h2>/);
});

test("train boarding streams a dedicated interior world with crowd and door gameplay", async () => {
  const [subway, interior] = await Promise.all([
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/TrainInteriorWorld.ts", import.meta.url), "utf8"),
  ]);

  assert.match(subway, /stationWorld\.dispose\(\); stationWorld = null; interiorWorld = new TrainInteriorWorld/);
  assert.match(subway, /stationWorld \?\?= createStationWorld\(\)/);
  assert.match(subway, /new TrainInteriorWorld\(scene, textures/);
  assert.match(subway, /data-loaded-world=\{stage === "RIDING" \? "train-interior"/);
  assert.match(subway, /boardThroughOpenDoor\(option\)/);
  assert.match(subway, /stationWorld\.boardingHint\(player\)/);
  assert.match(subway, /WALK THROUGH OPEN/);
  assert.match(subway, /The crowd carried you onto the platform/);
  assert.match(interior, /PUSHED_OUT/);
  assert.match(interior, /MISSED_STOP/);
  assert.match(interior, /destination-door-marker/);
  assert.match(interior, /Stay clear of the doors until/);
  assert.match(interior, /Move to the illuminated/);
  assert.match(interior, /"86 St"[\s\S]{0,120}"125 St"[\s\S]{0,120}"E 180 St"/);
});

test("premium audio and adaptive graphics cover every loaded world", async () => {
  const [game, subway, audio, quality] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/systems/audio/PremiumAudioDirector.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/systems/quality/AdaptiveQualityManager.ts", import.meta.url), "utf8"),
  ]);

  assert.match(game, /AudioQualitySettings/);
  assert.match(game, /createAdaptiveQualityManager/);
  for (const scene of ["central-park", "subway-station", "moving-train", "west-farms", "finale"]) assert.match(audio, new RegExp(`"${scene}"`));
  for (const effect of ["playTrainChime", "playTrainDoors", "playTrainArrival", "playCrowdBed", "playFootstep", "playQuestComplete", "playFailure"]) assert.match(subway + audio, new RegExp(effect));
  assert.match(quality, /"auto" \| QualityLevel/);
  assert.match(quality, /reportFrame\(timestamp/);
  assert.match(quality, /pixelBudget/);
  assert.match(quality, /targetFps/);
});
