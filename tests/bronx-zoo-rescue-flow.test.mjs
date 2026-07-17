import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("Bronx Zoo admission requires the donor's exact extra-ticket interaction", async () => {
  const zoo = await readSource("../app/game/world/BronxZooWorld.ts");

  assert.match(zoo, /BronxZooQuestState = "NEED_TICKET" \| "ENTER_ZOO" \| "FIND_SLOTHS" \| "ESCORT_TO_STATION"/);
  assert.match(zoo, /bronx-zoo-extra-ticket-donor/);
  assert.match(zoo, /userData\.dialogue = "I couldn’t make it today, so please take my extra ticket\."/);
  assert.match(zoo, /userData\.givesExtraTicket = true/);
  assert.match(zoo, /!this\.hasAdmissionTicket && donorDistance <= 2\.6[\s\S]{0,180}SPEAK WITH TICKET DONOR · ASK ABOUT EXTRA TICKET/);
  assert.match(zoo, /TICKET_RECEIVED", message: "“I couldn’t make it today, so please take my extra ticket\.” Admission ticket received\."/);
  assert.match(zoo, /!this\.hasAdmissionTicket && gateDistance <= 3\.5[\s\S]{0,150}ADMISSION TICKET REQUIRED/);
  assert.match(zoo, /ENTRY_DENIED", message: "The entrance scanner flashes red\. Find someone outside with an extra ticket\."/);
  assert.match(zoo, /enabled: \(\) => !this\.hasAdmissionTicket/);
  assert.match(zoo, /const gateOpen = this\.hasAdmissionTicket \? 1 : 0/);
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
  assert.match(zoo, /context\.font = "700 62px Georgia, serif"/);
  assert.match(zoo, /gary-polar-bear-togyl-support-plaque/);
  assert.match(zoo, /createGaryPolarBear\(textures, quality\)/);
});

test("zoo species use the licensed project atlas and enclosure-safe multi-state motion", async () => {
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
  assert.match(zoo, /for \(let index = 0; index < 3; index\+\+\) placeAnimal[\s\S]{0,120}createSpiderMonkey/);
  assert.match(zoo, /spider-monkey-climbing-rope/);
  for (const habitat of ["SEA LION POOL", "AFRICAN PLAINS", "RED PANDA", "GIANT TORTOISE", "FLAMINGO WETLAND", "AMERICAN BISON"]) assert.match(zoo, new RegExp(habitat));
  for (const amenity of ["bronx-zoo-water-refill-and-snack-station", "bronx-zoo-waste-recycling-pair", "bronx-zoo-low-glare-path-lamp", "bronx-zoo-keeper-service-yard-detail"]) assert.match(zoo, new RegExp(amenity));
  for (const building of ["bronx-zoo-wildlife-health-center", "bronx-zoo-conservation-center", "bronx-zoo-world-of-reptiles", "bronx-zoo-jungleworld-pavilion", "bronx-zoo-dancing-crane-cafe", "bronx-zoo-nature-trek-center"]) assert.match(zoo, new RegExp(building));
  assert.match(zoo, /worldBounds = Object\.freeze\(\{ minX: -84, maxX: 84, minZ: -158, maxZ: 39\.5 \}\)/);
  assert.match(zoo, /bronx-zoo-textured-undulating-parkland/);
  assert.match(zoo, /bronx-zoo-instanced-foliage-branch-canopies/);
});

test("the keeper door releases four branch-dwelling sloths into a scene-owned follower party", async () => {
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
  assert.match(zoo, /OPEN THE SLOTH KEEPER DOOR/);
  assert.match(zoo, /The keeper door is open\. Your four sloth friends are free — bring them back to Central Park\./);
  assert.match(zoo, /this\.captiveSloths\.forEach\(sloth => \{ sloth\.visible = !released; \}\)/);

  const tints = party.slice(party.indexOf("const FOLLOWER_TINTS"), party.indexOf("as const;", party.indexOf("const FOLLOWER_TINTS")));
  assert.equal((tints.match(/#[0-9a-f]{6}/gi) ?? []).length, 4);
  assert.match(party, /root\.name = "rescued-sloth-follower-party"/);
  assert.match(party, /scene\.add\(this\.root\)/);
  assert.match(party, /rescued-sloth-follower-\$\{index \+ 1\}/);
  assert.match(party, /SlothPartyFormation = "grove" \| "open" \| "station" \| "train"/);
  assert.match(game, /const rescuedParty = new SlothFollowerParty\(scene, textures/);
  assert.match(game, /event\.kind === "SLOTHS_RELEASED"[\s\S]{0,180}rescuedParty\.setActive\(true/);
});

test("rescued sloths persist through zoo disposal and both reverse subway journeys", async () => {
  const [game, party, journeys] = await Promise.all([
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/SlothFollowerParty.ts"),
    readSource("../app/game/world/TrainInteriorWorld.ts"),
  ]);

  assert.match(game, /zooWorld\.stationReturnReached\(player\)[\s\S]{0,120}rescuedParty\.allWithin[\s\S]{0,100}startReturnTransit\(\)/);
  assert.match(game, /function startReturnTransit\(\)[\s\S]{0,180}zooWorld\.dispose\(\); zooWorld = null[\s\S]{0,260}createStationWorld\("WEST_FARMS", "RETURN"\)/);
  assert.match(game, /const base = TRAIN_INTERIOR_JOURNEYS\[option\.journeyKey\]/);
  assert.match(game, /option\.journeyKey === "WEST_FARMS_TO_LEXINGTON"/);
  assert.match(game, /const destination = boarded\.destination/);
  assert.match(game, /checkpoint\(destination, message, false, true, destination !== "LEXINGTON"\)/);
  assert.match(journeys, /WEST_FARMS_TO_LEXINGTON/);
  assert.match(journeys, /LEXINGTON_TO_FIFTH/);
  assert.match(game, /travelDirection === "RETURN" && currentStation === "FIFTH_AV" && distance < 1\.45\) enterCentralPark\(\)/);
  assert.match(party, /deliberately outlives streamed zoo, station,[\s\S]{0,80}and train worlds/);
  assert.match(game, /zooWorld\?\.dispose\(\); parkReturnWorld\?\.dispose\(\); rescuedParty\.dispose\(\)/);
});

test("only all four followers reaching the designated Home Grove completes the campaign", async () => {
  const [game, park] = await Promise.all([
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/CentralParkReturnWorld.ts"),
  ]);

  assert.match(park, /root\.name = "central-park-homecoming-original-world"/);
  assert.match(park, /readonly spawn = SUBWAY_ENTRY_TRIGGER\.clone\(\)/);
  assert.match(park, /readonly sanctuaryTarget = START\.clone\(\)/);
  assert.match(park, /homeMarker\.userData\.originalTreeIndex/);
  assert.match(park, /context\.fillText\("HOME GROVE"/);
  assert.match(park, /central-park-sloth-sanctuary-sign/);
  assert.match(game, /function completeMission\(\)[\s\S]{0,220}!parkReturnWorld \|\| transitStage !== "CENTRAL_PARK" \|\| !rescuedParty\.allWithin\(parkReturnWorld\.sanctuaryTarget, 9\.5\)/);
  assert.match(game, /parkReturnWorld\.sanctuaryNearby\(player\) && rescuedParty\.allWithin\(target, 9\.5\)[\s\S]{0,80}completeMission\(\)/);
  assert.match(game, /Bring all four rescued sloths to the Home Grove/);
  assert.match(game, /<h2>Your friends are home\.<\/h2>/);
});

test("mobile prompts, debug checkpoints, and runtime data expose the full rescue path", async () => {
  const [touch, checkpoints, menu, game] = await Promise.all([
    readSource("../app/game/mobile/TouchControls.tsx"),
    readSource("../app/game/debugCheckpoints.ts"),
    readSource("../app/game/mobile/DebugJumpMenu.tsx"),
    readSource("../app/game/SubwayGame.tsx"),
  ]);

  assert.match(touch, /prompt\.includes\("OPEN SLOTH"\) \|\| prompt\.includes\("HABITAT DOOR"\) \? "Open"/);
  assert.match(touch, /prompt\.includes\("TICKET DONOR"\) \|\| prompt\.includes\("SPEAK WITH"\) \? "Talk"/);
  for (const checkpoint of ["bronxentry", "bronxpolar", "bronxbirds", "bronxmonkeys", "bronxsloths", "rescuefollowers", "returnwestfarms", "returntrain5", "returnlexington", "returntrainnr", "homecoming", "finale"]) {
    assert.match(checkpoints, new RegExp(`"?${checkpoint}"?`));
    assert.match(game, new RegExp(`"${checkpoint}"`));
  }
  for (const label of ["Gary", "World of Birds", "Monkey habitat", "Sloth habitat", "Rescued friends", "Return platform", "Return 5 train", "Return transfer", "Return N / R", "Central Park return", "Finale"]) assert.match(menu, new RegExp(label.replace("/", "\\/")));
  for (const attribute of ["data-campaign-phase", "data-zoo-phase", "data-ticket-held", "data-follower-count", "data-return-leg", "data-loaded-world"]) assert.match(game, new RegExp(attribute));
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
  const cleanup = game.slice(game.indexOf("return () => { cancelAnimationFrame"), game.indexOf("}, [audio, quality, showToast])"));
  assert.ok(cleanup.indexOf("zooWorld?.dispose()") < cleanup.indexOf("rescuedParty.dispose()"));
  assert.ok(cleanup.indexOf("parkReturnWorld?.dispose()") < cleanup.indexOf("rescuedParty.dispose()"));
});
