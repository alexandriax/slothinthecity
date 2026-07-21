import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("homecoming reuses the exact original Central Park world and landmark builders", async () => {
  const [homecoming, game, originalWorld] = await Promise.all([
    readSource("../app/game/world/CentralParkReturnWorld.ts"),
    readSource("../app/game/GameClient.tsx"),
    readSource("../app/game/world/RealisticWorld.ts"),
  ]);

  assert.match(homecoming, /buildRealisticWorld\(this\.root, textures, tier\)/);
  assert.match(homecoming, /createCampaignLandmarks\(this\.root, textures, terrainY, tier\)/);
  assert.match(homecoming, /createParkUtilityCart\(textures/);
  assert.match(homecoming, /this\.world\.rowboatSpawns\.map\(\(spawn\) => createParkRowboat\(textures/);
  assert.match(homecoming, /LAKE_SOUTHEAST_CART_TARGET\.clone\(\)/);
  assert.match(homecoming, /name: "Ramble field-services cart"/);
  assert.match(homecoming, /name: "Southeast lake field-services cart"/);
  assert.match(homecoming, /this\.world\.setTicketCollected\(true\)/);

  assert.match(originalWorld, /export function addCentralParkLighting/);
  assert.match(game, /const \{ sun \} = addCentralParkLighting\(scene, initialBudget\.shadowMapSize\)/);
  assert.match(homecoming, /const lighting = addCentralParkLighting\(this\.root/);
  assert.match(homecoming, /this\.sun\.position\.set\(this\.lastPlayer\.x - 35, this\.lastPlayer\.y \+ 68, this\.lastPlayer\.z \+ 25\)/);
  assert.match(homecoming, /this\.sun\.target\.position\.set\(this\.lastPlayer\.x, this\.lastPlayer\.y, this\.lastPlayer\.z - 8\)/);
});

test("return begins on the authored Fifth Avenue stair and ends beside an original opening tree", async () => {
  const [homecoming, landmarks] = await Promise.all([
    readSource("../app/game/world/CentralParkReturnWorld.ts"),
    readSource("../app/game/world/CampaignLandmarks.ts"),
  ]);

  assert.match(homecoming, /readonly spawn = SUBWAY_ENTRY_TRIGGER\.clone\(\)/);
  assert.match(homecoming, /this\.spawn\.set\(SUBWAY_TARGET\.x, 0, SUBWAY_TARGET\.z - \.68\)/);
  assert.match(homecoming, /readonly spawnYaw = Math\.PI/);
  assert.match(homecoming, /readonly sanctuaryTarget = START\.clone\(\)/);
  assert.match(homecoming, /this\.world\.trees\.length/);
  assert.match(homecoming, /homeMarker\.userData\.originalTreeIndex = sanctuaryTree \? sanctuaryTreeIndex : -1/);
  assert.match(homecoming, /central-park-home-grove-destination-ring/);
  assert.match(homecoming, /central-park-sloth-sanctuary-sign/);
  assert.match(landmarks, /function addGroundUnderlayPanels/);
  assert.match(landmarks, /group\.userData\.stairOpeningPreserved = true/);
  assert.match(landmarks, /SUBWAY_STAIR_CUTOUT\.halfWidth \+ \.45/);
  assert.doesNotMatch(landmarks, /parkGround\.position\.set\(-70, -\.12, 0\)/);

  assert.doesNotMatch(homecoming, /function floorHeight|function addTree/);
  assert.doesNotMatch(homecoming, /new THREE\.PlaneGeometry\(132, 184|groveTrees|edgeTrees|instanced-central-park-understory|fifth-avenue-return-subway-exit/);
});

test("homecoming retains original collisions, animation, and idempotent ownership boundaries", async () => {
  const homecoming = await readSource("../app/game/world/CentralParkReturnWorld.ts");

  assert.match(homecoming, /for \(const tree of this\.world\.trees\)/);
  assert.match(homecoming, /this\.world\.obstacles\.forEach\(\(obstacle\) => this\.resolveObstacle/);
  assert.match(homecoming, /for \(const cart of this\.carts\)/);
  assert.match(homecoming, /this\.world\.animate\(elapsed, this\.lastPlayer, false, this\.collectedBuds\)/);
  assert.match(homecoming, /this\.campaign\.update\(elapsed, delta\)/);
  assert.match(homecoming, /this\.carts\.forEach\(\(cart\) => cart\.animate\(elapsed\)\)/);
  assert.match(homecoming, /this\.rowboats\.forEach\(\(rowboat\) => rowboat\.animate\(elapsed\)\)/);

  assert.match(homecoming, /if \(this\.disposed\) return;[\s\S]{0,80}this\.disposed = true/);
  assert.match(homecoming, /this\.campaign\.dispose\(\)/);
  assert.match(homecoming, /this\.carts\.forEach\(\(cart\) => cart\.dispose\(\)\)/);
  assert.match(homecoming, /this\.rowboats\.forEach\(\(rowboat\) => rowboat\.dispose\(\)\)/);
  assert.match(homecoming, /this\.root\.removeFromParent\(\)[\s\S]{0,80}this\.root\.clear\(\)/);
  assert.match(homecoming, /GameTextures are shared/);
  assert.doesNotMatch(homecoming, /Object\.values\(textures\)|textures\.[a-zA-Z]+\.dispose/);
});

test("authored human hydration uses believable height and preserves complete grounded bodies", async () => {
  const runtime = await readSource("../app/game/world/characters/AuthoredHumanAssets.ts");

  assert.match(runtime, /AUTHORED_VISITOR_HEIGHT_METERS = 2\.04/);
  assert.match(runtime, /AUTHORED_ATTENDANT_HEIGHT_METERS = 2\.1/);
  assert.doesNotMatch(runtime, /normalizeHeight\(instance, options\.role === "attendant" \? 2\.5 : 2\.43\)/);
  assert.match(runtime, /host\.userData\.authoredHumanTargetHeightMeters = targetHeight/);
  assert.match(runtime, /options\.pose === "seated" && host\.position\.y < 0/);
  assert.match(runtime, /instance\.position\.y \+= compensation/);
  assert.match(runtime, /host\.visible = false/);
  assert.match(runtime, /authoredHumanExclusive = true/);
  assert.match(runtime, /host\.visible = true/);
});
