import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("the island Bronx Zoo ticket persists through transit and the former donor offers her skateboard", async () => {
  const [park, subway, zoo] = await Promise.all([
    readSource("../app/game/GameClient.tsx"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/BronxZooWorld.ts"),
  ]);

  assert.match(park, /RECOVER BRONX ZOO TICKET/);
  assert.match(park, /actionRequested && ticketNearby[\s\S]{0,280}parkStage = "SUBWAY_ENTRANCE"/);
  assert.doesNotMatch(park, /Central Park Zoo|parkStage = "ZOO"/);
  assert.match(subway, /const \[ticketHeld, setTicketHeld\] = useState\(true\)/);
  assert.match(subway, /Your island ticket is valid here/);
  assert.match(zoo, /BronxZooQuestState = "ENTER_ZOO" \| "FIND_SLOTHS" \| "ESCORT_TO_BUS"/);
  assert.match(zoo, /private hasAdmissionTicket = true/);
  assert.match(zoo, /bronx-zoo-skateboard-donor/);
  assert.match(zoo, /userData\.dialogue = "Oh, you can have my skateboard if you want\. It’s over there\."/);
  assert.match(zoo, /userData\.offersSkateboard = true/);
  assert.match(zoo, /TALK TO VISITOR ABOUT THE SKATEBOARD/);
  assert.match(zoo, /SKATEBOARD_OFFERED", message: "“Oh, you can have my skateboard if you want\. It’s over there\.”"/);
  assert.doesNotMatch(zoo, /extra ticket|TICKET_RECEIVED|ENTRY_DENIED|givesExtraTicket|NEED_TICKET/i);
  assert.match(zoo, /enabled: \(\) => !this\.hasAdmissionTicket/);
  assert.match(zoo, /const gateOpen = this\.hasAdmissionTicket \? 1 : 0/);
});

test("the sloth keeper door launches a full-screen randomized six-pin tension lock", async () => {
  const [zoo, game, lock, styles] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/SlothLockPick.tsx"),
    readSource("../app/globals.css"),
  ]);

  assert.match(zoo, /sloth-enclosure-six-pin-padlock/);
  assert.match(zoo, /PICK THE SIX-PIN SLOTH HABITAT LOCK/);
  assert.match(zoo, /LOCK_PICKING_STARTED/);
  assert.doesNotMatch(zoo.slice(zoo.indexOf("interact(player:"), zoo.indexOf("completeLockPicking")), /setFriendsReleased\(true\)/);
  assert.match(zoo, /completeLockPicking\(\)[\s\S]{0,120}setFriendsReleased\(true\)/);
  assert.match(lock, /LOCK_TENSION_MIN = 40/);
  assert.match(lock, /LOCK_TENSION_MAX = 60/);
  assert.match(lock, /LOCK_PIN_COUNT = 6/);
  assert.match(lock, /createBindingOrder\(random = Math\.random\)/);
  assert.match(lock, /Math\.floor\(random\(\) \* \(index \+ 1\)\)/);
  assert.match(lock, /const \[bindingOrder\] = useState\(\(\) => createBindingOrder\(\)\)/);
  assert.doesNotMatch(lock, /useRef\(createBindingOrder\(\)\)/);
  assert.match(lock, /tensionRef\.current \+ 9/);
  assert.match(lock, /prior - delta \* 12\.5/);
  assert.match(lock, /gaugeRef\.current\?\.style\.setProperty\("--lock-tension"/);
  assert.match(lock, /next < LOCK_TENSION_MIN[\s\S]{0,140}dropSetPins/);
  assert.match(lock, /tensionNow > LOCK_TENSION_MAX[\s\S]{0,260}"jammed"/);
  assert.match(lock, /bindingOrder\[setCount\] !== pin/);
  assert.match(lock, /setCount \+ 1 === LOCK_PIN_COUNT/);
  assert.match(lock, /lockpick-pin-gap/);
  assert.match(lock, /aria-pressed=\{state === "set"\}/);
  assert.match(lock, /Random order is fixed for this attempt/);
  assert.match(lock, /\^\(\?:Digit\|Numpad\)\(\[1-6\]\)\$/);
  assert.match(lock, /exec\(event\.code\) \?\? .*exec\(event\.key\)/);
  assert.match(lock, /Keyboard 1–6/);
  assert.match(lock, /role="dialog" aria-modal="true"/);
  assert.match(lock, /Space · \+9%/);
  assert.match(lock, /Below 40%, set pins fall\. Above 60%, the plug locks and tested pins jam\./);
  assert.match(game, /event\.kind === "LOCK_PICKING_STARTED"/);
  assert.match(game, /lockPicking\s*&&\s*\(\s*<SlothLockPick/);
  assert.match(game, /zooWorld\.completeLockPicking\(\)/);
  const zooFrameStart = game.indexOf('transitStage === "BRONX_ZOO"');
  const lockPauseStart = game.indexOf("if (lockPickingRef.current || sideQuestRef.current)", zooFrameStart);
  const pausedWorldBranch = game.slice(lockPauseStart, game.indexOf("const forward", lockPauseStart));
  assert.match(pausedWorldBranch, /Preserve the last rendered zoo frame/);
  assert.doesNotMatch(pausedWorldBranch, /zooWorld\.update|sloth\.animate|renderFrame/);
  assert.match(styles, /\.lockpick-screen/);
  assert.match(styles, /\.lockpick-gauge/);
  assert.match(styles, /\.lockpick-pin-row/);
  assert.match(styles, /\.lockpick-pin\.set \.lockpick-pin-gap/);
  assert.match(styles, /\.lockpick-pin\.set \.lockpick-driver/);
  assert.match(styles, /\.lockpick-pin\.set \.lockpick-key-pin/);
  assert.match(styles, /\.lockpick-claw/);
});

test("Gary's polar-bear habitat carries the exact TOGYL support plaque", async () => {
  const [zoo, animals] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/ZooAnimals.ts"),
  ]);

  assert.match(animals, /export function createGaryPolarBear/);
  assert.match(animals, /root\.name = "gary-the-polar-bear"/);
  assert.match(animals, /root\.userData\.animalName = "Gary"/);
  assert.match(zoo, /context\.fillText\("GARY", width \/ 2, 145\)/);
  assert.match(zoo, /context\.fillText\("POLAR BEAR", width \/ 2, 252\)/);
  assert.match(zoo, /context\.fillText\("Provided thanks to generous support by", width \/ 2, 380\)/);
  assert.match(zoo, /context\.fillText\("TOGYL", width \/ 2, 505\)/);
  assert.match(zoo, /context\.font = "700 44px Helvetica, Arial, sans-serif"/);
  assert.match(zoo, /gary-polar-bear-togyl-support-plaque/);
  assert.match(zoo, /createGaryPolarBear\(textures, quality\)/);
});

test("Gary's optional jam-sandwich quest supports throwing, retry pickup, climbing, persistence, and a sixth scooter", async () => {
  const [zoo, gary, game, museum, checkpoints] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/GaryCompanion.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
    readSource("../app/game/debugCheckpoints.ts"),
  ]);

  assert.match(zoo, /gary-quest-project-authored-jam-sandwich/);
  assert.match(zoo, /bronx-zoo-jam-sandwich-vending-machine-/);
  assert.match(zoo, /VEND A JAM SANDWICH FOR GARY/);
  assert.match(zoo, /THROW THE JAM SANDWICH OVER GARY’S ENCLOSURE/);
  assert.match(zoo, /JAM_SANDWICH_MISSED/);
  assert.match(zoo, /PICK UP THE JAM SANDWICH AND TRY AGAIN/);
  assert.match(zoo, /landedInside = this\.distanceXZ\(this\.jamSandwich\.position, this\.garyHabitatCenter\) <= 13\.2/);
  assert.match(zoo, /kind: "GARY_FED"/);
  assert.match(gary, /gary-persistent-red-jam-splotches/);
  assert.match(gary, /authored-bear-climb-over-enclosure/);
  assert.match(gary, /this\.animal\.root\.userData\.animationState = "forage"/);
  assert.match(gary, /this\.animal\.root\.userData\.animationState = "walk"/);
  assert.match(gary, /Scene-owned Gary state/);
  assert.match(game, /garyCompanion\.feed\(gameTime/);
  assert.match(game, /garyCompanion\.update\(gameTime/);
  assert.match(game, /data-gary-fed=/);
  assert.match(museum, /const scooterCapacity = Math\.max\(1, Math\.floor\(riderCount\)\)/);
  assert.match(checkpoints, /"bronx-gary-fed": "bronxgaryfed"/);
  assert.match(checkpoints, /"museum-gary-scooter": "museumgaryscooter"/);
});

test("zoo species use the project atlas and enclosure-safe multi-state motion", async () => {
  const [zoo, animals, textures, provenance] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/ZooAnimals.ts"),
    readSource("../app/game/rendering/textures.ts"),
    readSource("../public/game/textures/zoo-animal-surface-atlas.provenance.json"),
    access(new URL("../public/game/textures/zoo-animal-surface-atlas.webp", import.meta.url)),
  ]);

  assert.match(textures, /zooAnimalAtlas: THREE\.Texture/);
  assert.match(textures, /game\/textures\/zoo-animal-surface-atlas\.webp/);
  assert.match(animals, /cloneZooAnimalAtlasCell/);
  assert.match(animals, /texture\.repeat\.set\(1 \/ 3, 1 \/ 3\)/);
  assert.match(animals, /configureAutonomousZooAnimal/);
  for (const state of ["walk", "forage", "swim", "surface", "dive", "swing", "perch", "short-flight", "preen"]) {
    assert.match(animals, new RegExp(`"${state}"`));
  }
  assert.match(zoo, /configureAutonomousZooAnimal\(rig, \{ \.\.\.motion/);
  const metadata = JSON.parse(provenance);
  assert.equal(metadata.asset, "zoo-animal-surface-atlas.webp");
  assert.equal(metadata.license, "Original project-generated asset");
});

test("pending atlas clones cannot recursively serialize through Three.js texture userData", async () => {
  const [textures, animals, humans] = await Promise.all([
    readSource("../app/game/rendering/textures.ts"),
    readSource("../app/game/world/ZooAnimals.ts"),
    readSource("../app/game/world/PremiumCharacter.ts"),
  ]);

  assert.match(textures, /const pendingTextureClones = new WeakMap<THREE\.Texture, THREE\.Texture\[]>\(\)/);
  assert.match(textures, /markTextureCloneReadyAfterSource\(texture: THREE\.Texture, source: THREE\.Texture\)/);
  assert.match(animals, /markTextureCloneReadyAfterSource\(texture, textures\.zooAnimalAtlas\)/);
  assert.match(animals, /texture\.source = textures\.zooAnimalAtlas\.source/);
  assert.match(humans, /const pendingAtlasClones = new WeakMap<THREE\.Texture, THREE\.Texture\[]>\(\)/);
  assert.match(humans, /texture\.source = source\.source/);
  assert.doesNotMatch(animals, /zooAnimalAtlas\.clone\(\)/);
  assert.doesNotMatch(humans, /source\.clone\(\)/);
  assert.doesNotMatch(textures, /userData\.pendingAtlasClones|userData\.atlasReady/);
  assert.doesNotMatch(animals, /userData\.pendingAtlasClones|userData\.atlasReady/);
  assert.doesNotMatch(humans, /userData\.pendingAtlasClones|userData\.atlasReady/);
});

test("the expansive zoo includes the sun conure, companion birds, monkeys, and additional habitats", async () => {
  const [zoo, animals] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/ZooAnimals.ts"),
  ]);

  assert.match(zoo, /bronx-zoo-world-of-birds-sun-conure-aviary/);
  for (const creator of ["createSunConure", "createBlueAndGoldMacaw", "createScarletIbis", "createGreenAracari"]) {
    assert.match(zoo, new RegExp(`${creator}\\(textures, quality\\)`));
    assert.match(animals, new RegExp(`export function ${creator}`));
  }
  assert.match(animals, /sun-conure-hero-bird/);
  assert.match(animals, /commonName = "Sun conure"/);
  assert.match(zoo, /SUN CONURE · MACAW · SCARLET IBIS · GREEN ARACARI/);
  assert.match(zoo, /MONKEY FOREST/);
  assert.match(zoo, /spider-monkey-load-bearing-contact-branch/);
  assert.match(zoo, /spider-monkey-authored-contact-support-rig/);
  assert.match(zoo, /spider-monkey-perch-hand-contact-branch/);
  assert.match(zoo, /spider-monkey-prehensile-tail-contact-branch/);
  assert.match(zoo, /const state = cycle < 10\.2 \? "perch" : cycle < 16\.4 \? "climb" : "swing"/);
  assert.match(zoo, /spider-monkey-authored-climb-hand-contact-rope/);
  assert.match(zoo, /spider-monkey-authored-climb-foot-contact-rung/);
  assert.equal((zoo.match(/mode: "terrestrial"[\s\S]{0,80}speed: \.1/g) ?? []).length >= 2, true);
  assert.match(zoo, /spider-monkey-climbing-rope/);
  for (const habitat of ["SEA LION POOL", "AFRICAN PLAINS", "RED PANDA", "GIANT TORTOISE", "FLAMINGO WETLAND", "AMERICAN BISON"]) assert.match(zoo, new RegExp(habitat));
  for (const amenity of ["bronx-zoo-water-refill-and-snack-station", "bronx-zoo-waste-recycling-pair", "bronx-zoo-low-glare-path-lamp", "bronx-zoo-keeper-service-yard-detail"]) assert.match(zoo, new RegExp(amenity));
  for (const building of ["bronx-zoo-wildlife-health-center", "bronx-zoo-conservation-center", "bronx-zoo-world-of-reptiles", "bronx-zoo-jungleworld-pavilion", "bronx-zoo-dancing-crane-cafe", "bronx-zoo-nature-trek-center"]) assert.match(zoo, new RegExp(building));
  assert.match(zoo, /worldBounds = Object\.freeze\(\{ minX: -84, maxX: 84, minZ: -158, maxZ: 39\.5 \}\)/);
  assert.match(zoo, /bronx-zoo-textured-undulating-parkland/);
  assert.match(zoo, /bronx-zoo-instanced-foliage-branch-canopies/);
});

test("completing the keeper lock releases four branch-dwelling sloths into a scene-owned follower party", async () => {
  const [zoo, party, game] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/SlothFollowerParty.ts"),
    readSource("../app/game/SubwayGame.tsx"),
  ]);

  const slothData = zoo.slice(zoo.indexOf("const slothData = ["), zoo.indexOf("] as const;", zoo.indexOf("const slothData = [")));
  assert.equal((slothData.match(/#[0-9a-f]{6}/gi) ?? []).length, 4);
  assert.match(zoo, /bronx-zoo-sloth-conservation-enclosure/);
  assert.match(zoo, /sloth-enclosure-load-bearing-tree-branch-\$\{index \+ 1\}/);
  assert.match(zoo, /captive-sloth-friend-\$\{index \+ 1\}-on-real-branch/);
  assert.match(zoo, /PICK THE SIX-PIN SLOTH HABITAT LOCK/);
  assert.match(zoo, /The six pins set and the keeper lock turns\. Lead your growing menagerie along the promenade and board the museum shuttle bus\./);
  assert.match(zoo, /this\.captiveSloths\.forEach\(sloth => \{ sloth\.visible = !released; \}\)/);

  const tints = party.slice(party.indexOf("const FOLLOWER_TINTS"), party.indexOf("as const;", party.indexOf("const FOLLOWER_TINTS")));
  assert.equal((tints.match(/#[0-9a-f]{6}/gi) ?? []).length, 4);
  assert.match(party, /root\.name = "rescued-sloth-follower-party"/);
  assert.match(party, /scene\.add\(this\.root\)/);
  assert.match(party, /rescued-sloth-follower-\$\{index \+ 1\}/);
  assert.match(party, /SlothPartyFormation = "grove" \| "open" \| "station" \| "train"/);
  assert.match(game, /const rescuedParty = new SlothFollowerParty\(\s*scene,\s*textures/);
  assert.match(game, /zooWorld\.completeLockPicking\(\)[\s\S]{0,320}rescuedParty\.setActive\(\s*true/);
});

test("opening the keeper door preserves every authored sloth transform until it naturally catches the player", async () => {
  const [zoo, party] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/SlothFollowerParty.ts"),
  ]);

  const slothData = zoo.slice(zoo.indexOf("const slothData = ["), zoo.indexOf("] as const;", zoo.indexOf("const slothData = [")));
  const followerTints = party.slice(party.indexOf("const FOLLOWER_TINTS"), party.indexOf("as const;", party.indexOf("const FOLLOWER_TINTS")));
  assert.deepEqual(followerTints.match(/#[0-9a-f]{6}/gi), slothData.match(/#[0-9a-f]{6}/gi));
  assert.doesNotMatch(party, /result\.root\.scale\.multiplyScalar/);
  assert.match(party, /const persistentSlothSurface = cloneZooAnimalAtlasCell\(textures, 2, 2, "rescued-sloth-friends"\)/);
  assert.match(party, /this\.ownedTextures\.push\(persistentSlothSurface\)/);
  assert.match(party, /\!\/\(sloth-\(\?:torso\|head\|forelimb\|hindlimb\)\|anatomical-sloth\)\/[\s\S]{0,260}surface\.map = persistentSlothSurface/);
  assert.ok(party.indexOf("this.ownedTextures.push(persistentSlothSurface)") < party.indexOf("FOLLOWER_TINTS.forEach"));

  const activation = party.slice(party.indexOf("setActive(active:"), party.indexOf("private seedBreadcrumbs"));
  assert.match(activation, /if \(!wasActive && this\.releaseFromEnclosure\(leader, floorY\)\) return;[\s\S]{0,80}this\.reset\(leader, floorY\)/);
  assert.match(activation, /getObjectByName\(`captive-sloth-friend-\$\{index \+ 1\}-on-real-branch`\)/);
  assert.match(activation, /getWorldPosition\(follower\.root\.position\)/);
  assert.match(activation, /getWorldQuaternion\(follower\.root\.quaternion\)/);
  assert.match(activation, /follower\.formationJoined = false/);
  assert.doesNotMatch(activation.slice(activation.indexOf("private releaseFromEnclosure")), /follower\.root\.position\.set\(leader/);

  assert.match(party, /const catchingUp = !follower\.formationJoined/);
  assert.match(party, /targetDistance = catchingUp \? 1\.35 \+ index \* 1\.08/);
  assert.match(party, /desired\.addScaledVector\(side, offset\.x \* \(catchingUp \? \.62 : 1\)\)\.addScaledVector\(tangent, offset\.y\)/);
  assert.match(party, /if \(catchingUp && distance <= 2\.15\)[\s\S]{0,120}follower\.formationJoined = true[\s\S]{0,120}follower\.collisionBody\.enabled = true/);
  assert.match(party, /maximumSpeed = catchingUp \? 3\.25/);
  assert.match(party, /for \(let iteration = 0; iteration < 4; iteration\+\+\)/);
  assert.match(party, /if \(distance <= \.001\) \{ const angle =/);
  assert.match(party, /formation === "scooter" \? 1\.78 : 1\.34/);
  assert.match(party, /"release-climb-down"/);
});

test("rescued sloths persist through zoo disposal, shuttle boarding, and the museum", async () => {
  const [game, party, bus, museum] = await Promise.all([
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/SlothFollowerParty.ts"),
    readSource("../app/game/world/CityBusWorld.ts"),
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
  ]);

  assert.match(game, /actionRequested && shuttleReady[\s\S]{0,300}allFollowersWithin\(zooWorld\.busBoardingPosition, boardingRadius\)[\s\S]{0,160}startBusDrive\(\)/);
  assert.doesNotMatch(game, /if \(zooWorld\.busBoardingReached\(player\)/);
  assert.match(game, /function startBusDrive\([\s\S]{0,360}reviewSpawn\?:[\s\S]{0,260}"failure-impact"[\s\S]{0,500}zooWorld\.dispose\(\);\s*zooWorld = null/);
  assert.match(game, /cityBusWorld = new CityBusWorld\(/);
  assert.match(game, /rescuedParty\.root\.visible = false/);
  assert.match(bus, /rescued-sloth-on-museum-shuttle-/);
  assert.match(bus, /createPremiumSlothFriend\(textures, quality, index/);
  assert.match(game, /function enterMuseum/);
  assert.match(game, /cityBusWorld\.dispose\(\);\s*cityBusWorld = null/);
  assert.match(game, /museumWorld = new NaturalHistoryMuseumWorld/);
  assert.match(game, /rescuedParty\.root\.visible = true;[\s\S]{0,100}rescuedParty\.reset\(player/);
  assert.match(museum, /american-museum-of-natural-history-exploration-level/);
  assert.match(party, /deliberately outlives streamed zoo, station,[\s\S]{0,80}and train worlds/);
  assert.match(game, /zooWorld\?\.dispose\(\);[\s\S]{0,240}cityBusWorld\?\.dispose\(\);[\s\S]{0,240}museumWorld\?\.dispose\(\);[\s\S]{0,240}parkReturnWorld\?\.dispose\(\);[\s\S]{0,240}rescuedParty\.dispose\(\)/);
});

test("all four followers can reach Megatherium from every side on foot or scooter", async () => {
  const [game, museum] = await Promise.all([
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
  ]);

  assert.match(museum, /readonly megatheriumViewingTargets = \[/);
  assert.match(museum, /new THREE\.Vector3\(0, 1\.48, -184\.5\)/);
  assert.match(museum, /new THREE\.Vector3\(14\.5, 1\.48, -198\)/);
  assert.match(museum, /new THREE\.Vector3\(0, 1\.48, -211\.5\)/);
  assert.match(museum, /new THREE\.Vector3\(-14\.5, 1\.48, -198\)/);
  assert.match(museum, /const MEGATHERIUM_VIEWING_HALF_SPAN = 9\.5/);
  assert.match(museum, /nearestMegatheriumViewingTarget/);
  assert.match(museum, /northOrSouth \? THREE\.MathUtils\.clamp\(player\.x, -MEGATHERIUM_VIEWING_HALF_SPAN, MEGATHERIUM_VIEWING_HALF_SPAN\) : anchor\.x/);
  assert.match(museum, /megatherium-americanum-giant-ground-sloth-articulated-skeleton/);
  assert.match(museum, /skeleton\.rotation\.y = -\.34 \+ Math\.PI \/ 2/);
  assert.match(museum, /megatherium-americanum-grounded-exhibit-sign/);
  assert.match(museum, /megatherium-exhibit-sign-grounded-support-post/);
  assert.match(game, /function museumMissionReady\(\)[\s\S]{0,600}museumWorld\.nearestMegatheriumViewingTarget[\s\S]{0,220}allFollowersWithin\([\s\S]{0,120}scooterRiding \? 13\.5 : 11\.5/);
  assert.match(game, /if \(museumMissionReady\(\)\) \{\s*completeMission\(\);\s*renderFrame\(\);\s*return;\s*\}/);
  assert.match(game, /<h2>Your friends found a giant ancestor\.<\/h2>/);
});

test("mobile prompts, debug checkpoints, and runtime data expose the full rescue path", async () => {
  const [touch, checkpoints, menu, game] = await Promise.all([
    readSource("../app/game/mobile/TouchControls.tsx"),
    readSource("../app/game/debugCheckpoints.ts"),
    readSource("../app/game/mobile/DebugJumpMenu.tsx"),
    readSource("../app/game/SubwayGame.tsx"),
  ]);

  assert.match(touch, /prompt\.includes\("PICK THE SIX-PIN"\) \|\| prompt\.includes\("HABITAT LOCK"\) \? "Pick"/);
  assert.match(touch, /prompt\.includes\("SPEAK WITH"\) \|\| prompt\.includes\("TALK TO"\) \? "Talk"/);
  for (const checkpoint of ["bronxentry", "bronxpolar", "bronxbirds", "bronxmonkeys", "bronxsloths", "rescuefollowers", "busboarding", "busbronx", "busdrive", "busarrival", "museumentry", "museumrotunda", "museummegatherium", "museumfinale"]) {
    assert.match(checkpoints, new RegExp(`"?${checkpoint}"?`));
    assert.match(game, new RegExp(`"${checkpoint}"`));
  }
  for (const label of ["Gary", "World of Birds", "Monkey habitat", "Sloth habitat", "Rescued friends", "Museum shuttle", "Bus arrival", "AMNH exterior", "Museum rotunda", "Fossil mammals", "Finale"]) assert.match(menu, new RegExp(label.replace("/", "\\/")));
  for (const attribute of ["data-campaign-phase", "data-zoo-phase", "data-ticket-held", "data-lock-picking", "data-follower-count", "data-return-leg", "data-loaded-world"]) assert.match(game, new RegExp(attribute));
});

test("follower resources have one idempotent owner and are disposed after streamed worlds", async () => {
  const [party, game, zoo] = await Promise.all([
    readSource("../app/game/world/SlothFollowerParty.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/BronxZooWorld.ts"),
  ]);

  assert.match(party, /if \(this\.disposed\) return;[\s\S]{0,80}this\.disposed = true/);
  assert.match(party, /this\.root\.removeFromParent\(\)/);
  assert.match(party, /geometries\.forEach\(geometry => geometry\.dispose\(\)\)/);
  assert.match(party, /materials\.forEach\(material => material\.dispose\(\)\)/);
  assert.match(party, /this\.ownedTextures\.forEach\(texture => texture\.dispose\(\)\)/);
  assert.doesNotMatch(zoo, /SlothFollowerParty|rescuedParty/);
  const cleanupStart = game.indexOf("lockPickingRef.current = false");
  const cleanup = game.slice(cleanupStart, game.indexOf("}, [audio, quality, showToast])", cleanupStart));
  assert.ok(cleanup.indexOf("zooWorld?.dispose()") < cleanup.indexOf("rescuedParty.dispose()"));
  assert.ok(cleanup.indexOf("cityBusWorld?.dispose()") < cleanup.indexOf("rescuedParty.dispose()"));
  assert.ok(cleanup.indexOf("museumWorld?.dispose()") < cleanup.indexOf("rescuedParty.dispose()"));
  assert.ok(cleanup.indexOf("parkReturnWorld?.dispose()") < cleanup.indexOf("rescuedParty.dispose()"));
});
