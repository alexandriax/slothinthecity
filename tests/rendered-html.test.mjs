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
  assert.match(html, /<title>Sloth in the City — A New York City Adventure<\/title>/i);
  assert.match(html, /Play as a displaced sloth in a cinematic first-person New York City adventure/i);
  assert.match(html, /rel="canonical" href="https:\/\/www\.slothinthecity\.com"/i);
  assert.match(html, /property="og:url" content="https:\/\/www\.slothinthecity\.com"/i);
  assert.match(html, /property="og:image" content="https:\/\/www\.slothinthecity\.com\/social\/sloth-in-the-city-og\.jpg"/i);
  assert.match(html, /property="og:image:width" content="1200"/i);
  assert.match(html, /property="og:image:height" content="630"/i);
  assert.match(html, /name="twitter:card" content="summary_large_image"/i);
  assert.match(html, /rel="icon" href="\/icon\.svg/i);
  assert.match(html, /THE RAMBLE · CENTRAL PARK/);
  assert.match(html, /PREPARING THE PARK|ENTER THE RAMBLE/);
  assert.match(html, /data-game-state="intro"/);
  assert.match(html, /3D game viewport/);
  assert.match(html, /game\/splash-city\.webp/);
  assert.match(html, /Sloth in the City/i);
  assert.doesNotMatch(html, /SLOTH \/ PARK/i);
  assert.match(html, /viewport-fit=cover/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("landing wordmark remains responsive instead of relying on crop-prone image text", async () => {
  const [css, game] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(game, /<div className="mobile-wordmark"/);
  assert.match(css, /\.mobile-wordmark \{ display:block;/);
  assert.match(css, /font-size:clamp\(58px,7\.4vw,108px\)/);
  assert.match(css, /@media\(max-height:650px\)/);
  assert.match(css, /@media\(max-height:460px\) and \(orientation:landscape\)/);
  assert.match(css, /env\(safe-area-inset-left\)/);
  assert.match(css, /\.intro-location \{[^}]*text-overflow:ellipsis/);
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
  assert.match(layout, /Play as a displaced sloth in a cinematic first-person New York City adventure/i);
  assert.match(layout, /sloth-in-the-city-og\.jpg/);
  assert.match(layout, /applicationName: "Sloth in the City"/);
  assert.match(layout, /https:\/\/www\.slothinthecity\.com/);
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
  assert.match(game, /useState<"park" \| "subway">\("park"\)/);
  assert.match(game, /const enterSubway = useCallback\(\(\) => setLevel\("subway"\), \[\]\)/);
});

test("mobile wayfinding stays bounded and the atmospheric sky follows the camera", async () => {
  const [styles, world] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
  ]);

  assert.match(styles, /grid-template-columns:minmax\(0,1fr\) auto/);
  assert.match(styles, /text-overflow:ellipsis/);
  assert.match(styles, /width:min\(232px,calc\(100vw - 124px\)\)/);
  assert.match(world, /sky\.onBeforeRender/);
  assert.match(world, /sky\.position\.copy\(camera\.position\)/);
  assert.match(world, /sky\.frustumCulled = false/);
});

test("foraging opens the Bow Bridge, island ticket, zoo, and subway campaign with adaptive wayfinding", async () => {
  const [game, mobileHud, wayfinder, world, landmarks] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/mobile/MobileHud.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/GoalWayfinder.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/CampaignLandmarks.ts", import.meta.url), "utf8"),
  ]);

  assert.match(game, /type ParkStage = "FORAGE" \| "BOW_BRIDGE" \| "LAKE_TICKET" \| "ZOO" \| "SUBWAY_ENTRANCE"/);
  assert.match(game, /collected\.current\.size >= 5\) parkStage = "BOW_BRIDGE"/);
  assert.match(game, /parkStage === "BOW_BRIDGE"[\s\S]{0,800}parkStage = "LAKE_TICKET"/);
  assert.match(game, /actionRequested && ticketNearby[\s\S]{0,300}parkStage = "ZOO"/);
  assert.match(game, /RECOVER CENTRAL PARK ZOO TICKET/);
  assert.match(game, /data-ticket-collected/);
  assert.match(game, /Attendant: “There are no sloths here\.”/);
  assert.match(game, /parkStage = "SUBWAY_ENTRANCE"/);
  assert.match(game, /subwayStepsReached[\s\S]{0,300}onEnterSubway\(\)/);
  assert.match(game, /<GoalWayfinder/);
  assert.match(game, /data-goal-distance/);
  assert.match(game, /active=\{hud\.targetActive\}/);
  assert.match(game, /label=\{hud\.waypointLabel\}/);
  assert.match(mobileHud, /objectiveShort/);
  assert.match(mobileHud, /objectiveValue/);
  assert.match(wayfinder, /aria-label=\{`\$\{label\}, \$\{meters\} meters away`\}/);
  assert.match(world, /export const GOAL = BOW_BRIDGE_TARGET/);
  assert.match(landmarks, /bow-bridge-northwest-inlet-span/);
  assert.match(landmarks, /bow-bridge-side-abutment/);
  assert.match(landmarks, /bow-bridge-clear-walkable-approach/);
  assert.match(landmarks, /central-park-zoo-exterior-campus/);
  assert.match(landmarks, /5-av-59-st-full-stair-subway-entrance/);
  assert.match(landmarks, /sidewalkWithStairOpeningGeometry/);
  assert.match(landmarks, /subway-sidewalk-with-true-stairwell-cutout/);
  assert.match(landmarks, /position\.set\(0, -\.085 - step \* \.165/);
  assert.match(landmarks, /subway-mid-descent-transition-step/);
  assert.match(world, /subwayLocalX <= SUBWAY_STAIR_CUTOUT\.halfWidth \+ \.07/);
  assert.match(world, /terrainGeometryWithSubwayCutout/);
  assert.match(landmarks, /UPTOWN  ·  DOWNTOWN  ·  QUEENS  VIA CONCOURSE/);
  assert.doesNotMatch(landmarks, /QUEENS & ASTORIA/);
  assert.doesNotMatch(game, /qaInput === "gate"|gatecomplete|Follow the marker to sanctuary/);
  assert.doesNotMatch(wayfinder, /Sanctuary gate/);
});

test("The Lake is at least 15x larger, has a dry ticket island, and supplies faster rowboats", async () => {
  const [game, rowboat, world] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/ParkRowboat.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
  ]);

  assert.match(game, /world\.rowboatSpawns\.map\(spawn => createParkRowboat/);
  assert.match(game, /world\.containsLakePoint\(x, z\)/);
  assert.match(game, /world\.containsLakePoint\(x, z, 2\.4\)/);
  assert.match(game, /ROWBOAT_ROOT_WATERLINE_OFFSET/);
  assert.match(world, /THE_LAKE_RADII = new THREE\.Vector2\(150, 112\)/);
  assert.match(world, /THE_LAKE_AREA_SCALE = THE_LAKE_RADII\.x \* THE_LAKE_RADII\.y \/ \(33\.2 \*\* 2\)/);
  assert.match(world, /containsLakeWater\(x: number, z: number, shoreInset = 0\)/);
  assert.match(world, /central-zoo-ticket-island/);
  assert.match(world, /ticket-island-stone-and-timber-landing/);
  assert.match(world, /southeast-lake-zoo-route-pier/);
  assert.match(world, /imagegen-zoo-admission-ticket/);
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
  assert.match(rowboat, /watertight-dry-cockpit-sole/);
  assert.match(rowboat, /slatted-floorboard/);
  assert.match(rowboat, /readonly oars: \[ParkRowboatOar, ParkRowboatOar\]/);
  const speed = Number(rowboat.match(/readonly maxForwardSpeed = ([\d.]+)/)?.[1]);
  assert.ok(speed > 2.65, `expected rowboat speed to exceed walking speed, received ${speed}`);
  await access(new URL("../public/game/props/central-park-zoo-island-ticket.webp", import.meta.url));
});

test("field-services cart has the requested plate and wheel-clear side placards", async () => {
  const cart = await readFile(new URL("../app/game/world/ParkUtilityCart.ts", import.meta.url), "utf8");

  assert.match(cart, /context\.fillText\("SLTHPRK", width \/ 2, 143\)/);
  assert.match(cart, /left-service-sign-backing/);
  assert.match(cart, /right-service-sign-backing/);
  assert.match(cart, /left-central-park-field-services-marking/);
  assert.match(cart, /right-central-park-field-services-marking/);
  assert.match(cart, /back\.rotation\.set\(0, 0, 0\)/);
  assert.match(cart, /toolGroup\.scale\.y = \.66/);
  assert.match(cart, /tool heads below the canopy/);

  const labelSize = cart.match(/const label = new THREE\.Mesh\(new THREE\.PlaneGeometry\(([\d.]+), ([\d.]+)\), materials\.label\)/);
  const labelPosition = cart.match(/label\.position\.set\(side \* ([\d.]+), ([\d.]+), ([\d.]+)\)/);
  const fender = cart.match(/new THREE\.TorusGeometry\(([\d.]+), ([\d.]+), 8, 24, Math\.PI\)[\s\S]{0,220}frontFender\.position\.set\(x, ([\d.]+), -1\.17\)/);
  assert.ok(labelSize && labelPosition && fender, "expected measurable label and fender geometry");
  const labelBottom = Number(labelPosition[2]) - Number(labelSize[2]) / 2;
  const fenderTop = Number(fender[3]) + Number(fender[1]) + Number(fender[2]);
  assert.ok(labelBottom > fenderTop, `service label bottom ${labelBottom} must clear fender top ${fenderTop}`);
});

test("park and Bronx Zoo landmarks use complete campuses and textured articulated characters", async () => {
  const [landmarks, finale, characters] = await Promise.all([
    readFile(new URL("../app/game/world/CampaignLandmarks.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/BronxZooWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/PremiumCharacter.ts", import.meta.url), "utf8"),
  ]);

  for (const feature of [
    "central-park-zoo-exterior-campus",
    "central-park-zoo-public-forecourt",
    "central-park-zoo-sea-lion-pool",
    "central-park-zoo-ticket-kiosk",
    "5-av-59-st-full-stair-subway-entrance",
  ]) assert.match(landmarks, new RegExp(feature));
  assert.match(landmarks, /for \(let step = 0; step < 20; step\+\+\)/);
  assert.match(landmarks, /SUBWAY_ENTRY_TRIGGER/);
  assert.match(characters, /proceduralSurface\("cloth"/);
  assert.match(characters, /proceduralSurface\("skin"/);
  assert.match(characters, /proceduralSurface\("fur"/);
  assert.match(characters, /new THREE\.CapsuleGeometry/);
  assert.match(characters, /createPremiumSlothFriend/);
  for (const feature of [
    "west-farms-station-exit-approach",
    "bronx-zoo-arrival-fountain",
    "bronx-zoo-ticket-and-member-pavilion",
    "bronx-zoo-world-of-birds-sun-conure-aviary",
    "gary-polar-bear-togyl-support-plaque",
    "bronx-zoo-sloth-conservation-enclosure",
    "captive-sloth-friend-",
  ]) assert.match(finale + characters, new RegExp(feature));
  assert.match(finale, /bronx-zoo-arrival-attendant/);
  assert.match(finale, /attendantNearby\(player: THREE\.Vector3/);
  assert.match(characters, /\/game\/characters\/npc-face-atlas-v2-03\.webp/);
  assert.match(characters, /\/game\/characters\/npc-cloth-atlas-v2-03\.webp/);
  assert.doesNotMatch(finale, /npc-(?:face|cloth)-atlas-v1/);
});

test("subway service cycles every 30 seconds and presents route-correct trains", async () => {
  const world = await readFile(new URL("../app/game/world/SubwayWorld.ts", import.meta.url), "utf8");

  assert.match(world, /SubwayStationId = "FIFTH_AV" \| "LEXINGTON" \| "WEST_FARMS"/);
  assert.match(world, /initialStation\?: SubwayStationId/);
  assert.match(world, /private disposeStation\(id: SubwayStationId\)/);
  assert.match(world, /SUBWAY_TRAIN_INTERVAL_SECONDS = 30/);
  assert.match(world, /const cycle = elapsed % SUBWAY_TRAIN_INTERVAL_SECONDS/);
  assert.match(world, /cycle < 4[\s\S]{0,240}cycle < 16[\s\S]{0,240}cycle < 21/);
  assert.match(world, /this\.doorOpenAmount = Math\.min\(THREE\.MathUtils\.smoothstep\(cycle, 5, 6\.15\)/);
  assert.match(world, /this\.doorsOpen = this\.doorOpenAmount > \.62/);
  assert.match(world, /buildTrain\(textures, "N", "QUEENS-BOUND", true/);
  assert.match(world, /const route = cycleNumber % 2 === 0 \? "N" : "R"/);
  assert.match(world, /buildTrain\(textures, "W", "[^"]+", false/);
  assert.match(world, /correct: \{ color: "#00933c", direction: "UPTOWN \/ BRONX", platformSide: -1, route: "5" \}/);
  assert.match(world, /wrong: \{ color: "#fccc0a", direction: "DOWNTOWN \/ BROOKLYN", platformSide: 1, route: "N" \}/);
  assert.match(world, /sloth-themed-subway-ad/);
  assert.match(world, /subway-passenger/);
  assert.match(world, /left-stair-route-choice/);
  assert.match(world, /right-stair-route-choice/);
  assert.match(world, /unobstructed-sloth-themed-subway-ad/);
  assert.match(world, /visible-open-car-interior/);
  assert.match(world, /open-door-interior/);
  assert.match(world, /opening > \.035/);
  assert.match(world, /lit-passenger-cabin/);
  assert.match(world, /three-arm-mta-turnstile/);
  assert.match(world, /\[-1\.8, -\.6, \.6, 1\.8\]/);
  assert.match(world, /fare-control-side-rail-funnel/);
  assert.match(world, /view straight across the car from a platform doorway/);
  assert.doesNotMatch(world, /Perspective aisle, longitudinal seats/);
  assert.match(world, /choose direction in concourse/);
  assert.match(world, /createPremiumHuman/);
  assert.doesNotMatch(world, /faceAtlasUrl:/);
  assert.doesNotMatch(world, /clothingAtlasUrl:/);
  assert.match(world, /bronx-zoo-featured-mosaic/);
  assert.match(world, /daylight-bronx-zoo-wayfinding/);
  assert.match(world, /addStairs\(root, -5\.1[\s\S]{0,80}addStairs\(root, 5\.1/);
  await Promise.all([
    access(new URL("../public/game/ads/slow-superpower.webp", import.meta.url)),
    access(new URL("../public/game/ads/branch-out.webp", import.meta.url)),
    access(new URL("../public/game/ads/canopy-commute.webp", import.meta.url)),
    access(new URL("../public/game/ads/slow-fashion.webp", import.meta.url)),
    access(new URL("../public/game/ads/bronx-bound.webp", import.meta.url)),
    access(new URL("../public/game/ads/ramble-after-dark.webp", import.meta.url)),
    access(new URL("../public/game/subway/bronx-zoo-mosaic.webp", import.meta.url)),
  ]);
});

test("playable subway services advance through graph destinations while out-of-scope services stay in station", async () => {
  const subway = await readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8");
  const checkpointStart = subway.indexOf("function checkpoint");
  const finishRideStart = subway.indexOf("function finishRide");
  const frameStart = subway.indexOf("function frame");
  assert.ok(checkpointStart >= 0 && finishRideStart > checkpointStart && frameStart > finishRideStart);
  const checkpoint = subway.slice(checkpointStart, finishRideStart);
  const finishRide = subway.slice(finishRideStart, frameStart);

  assert.match(checkpoint, /stationWorld\.setStation\(station, travelDirection\)\.restoreProgressState\(subwayProgress\)/);
  assert.match(checkpoint, /player\.copy\(stationWorld\.checkpointSpawn\(resumeAtPlatform\)\)/);
  assert.match(checkpoint, /stationClock = waitForNextTrain \? 18 : 0/);
  assert.match(checkpoint, /previousDoorsOpen = stationWorld\.doorsOpen/);
  assert.match(checkpoint, /boarded = null/);
  assert.match(finishRide, /if \(!boarded\?\.destination\) return/);
  assert.match(finishRide, /const destination = boarded\.destination/);
  assert.match(finishRide, /checkpoint\(destination, message/);
  assert.match(finishRide, /if \(!option\.journeyKey \|\| !option\.destination\)[\s\S]{0,220}player\.copy\(playerBeforeMovement\)/);
  assert.match(finishRide, /continues beyond this playable route/);
});

test("West Farms streams the Bronx Zoo and completion waits for Megatherium at AMNH", async () => {
  const [subway, world, zoo, bus, museum] = await Promise.all([
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/SubwayWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/BronxZooWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/CityBusWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/NaturalHistoryMuseumWorld.ts", import.meta.url), "utf8"),
  ]);

  assert.match(world, /WEST FARMS SQ \/ E TREMONT AV/);
  assert.match(world, /Street exit · Bronx Zoo/);
  assert.match(world, /Bronx Zoo · Asia Gate/);
  assert.match(world, /station === "WEST_FARMS" && route === "5"[\s\S]{0,180}journeyKey: "WEST_FARMS_TO_LEXINGTON"/);
  assert.match(subway, /prompt = "WALK UP TO THE BRONX ZOO EXIT"/);
  assert.match(subway, /distance < 1\.45\) enterBronxZoo\(\)/);
  assert.match(subway, /setTransitStage\("BRONX_ZOO"\)/);
  assert.match(subway, /new BronxZooWorld\(scene, textures/);
  assert.match(subway, /stationWorld\.dispose\(\); stationWorld = null/);
  assert.match(subway, /player\.copy\(zooWorld\.spawn\)/);
  assert.match(subway, /zooWorld\.interactionHint\(player\)/);
  assert.match(subway, /event\.kind === "SLOTHS_RELEASED"[\s\S]{0,180}rescuedParty\.setActive\(true/);
  assert.match(subway, /actionRequested && hint\?\.kind === "BUS_BOARDING"[\s\S]{0,220}rescuedParty\.allWithin\(zooWorld\.busBoardingPosition, 9\.5\)[\s\S]{0,100}startBusDrive\(\)/);
  assert.doesNotMatch(subway, /if \(zooWorld\.busBoardingReached\(player\)/);
  assert.match(subway, /function completeMission\(\)[\s\S]{0,260}transitStage !== "MUSEUM"[\s\S]{0,260}setTransitStage\("COMPLETE"\)/);
  assert.match(zoo, /readonly spawn = new THREE\.Vector3/);
  assert.match(zoo, /resolvePlayer\(player: THREE\.Vector3/);
  assert.match(zoo, /busBoardingReached\(player: THREE\.Vector3/);
  assert.match(bus, /bronx-to-natural-history-museum-driving-level/);
  assert.match(museum, /american-museum-of-natural-history-exploration-level/);
  assert.match(museum, /megatherium-americanum-giant-ground-sloth-articulated-skeleton/);
  assert.match(subway, /<div className="eyebrow">AMNH · Fossil Mammal Halls<\/div>/);
  assert.match(subway, /<h2>Your friends found a giant ancestor\.<\/h2>/);
});

test("train boarding streams a dedicated interior world with crowd and door gameplay", async () => {
  const [subway, interior] = await Promise.all([
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/TrainInteriorWorld.ts", import.meta.url), "utf8"),
  ]);

  assert.match(subway, /stationWorld\.dispose\(\); stationWorld = null; interiorWorld = new TrainInteriorWorld/);
  assert.match(subway, /stationWorld \?\?= createStationWorld\(station, travelDirection\)/);
  assert.match(subway, /new TrainInteriorWorld\(scene, textures/);
  assert.match(subway, /data-loaded-world=\{stage === "RIDING" \? "train-interior"/);
  assert.match(subway, /boardThroughOpenDoor\(option\)/);
  assert.match(subway, /stationWorld\.boardingHint\(player\)/);
  assert.match(subway, /WALK THROUGH OPEN/);
  assert.match(subway, /The crowd carried you and the rescued group onto the platform/);
  assert.match(interior, /PUSHED_OUT/);
  assert.match(interior, /MISSED_STOP/);
  assert.match(interior, /destination-door-marker/);
  assert.match(interior, /Stay clear of the doors until/);
  assert.match(interior, /Use any illuminated/);
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
