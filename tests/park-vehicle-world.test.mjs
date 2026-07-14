import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("both lake shores provide usable boats and field-services carts", async () => {
  const [game, world] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
  ]);

  for (const name of [
    "Bow Bridge rowboat 7",
    "Bow Bridge rowboat 12",
    "Southeast shore rowboat 18",
    "Southeast shore rowboat 23",
  ]) assert.match(world, new RegExp(name));

  assert.match(world, /LAKE_SOUTHEAST_CART_TARGET/);
  assert.match(game, /const carts = \[/);
  assert.match(game, /let cart: ParkUtilityCart = carts\[0\]/);
  assert.match(game, /for \(const candidate of carts\)/);
  assert.match(game, /cart = nearbyCart/);
  assert.match(game, /carts\.forEach\(candidate => candidate\.dispose\(\)\)/);
});

test("rowboats are closed, dry, clearly labelled, and omit the ambiguous bow ring", async () => {
  const rowboat = await readFile(new URL("../app/game/world/ParkRowboat.ts", import.meta.url), "utf8");

  assert.match(rowboat, /watertight-bow-stem-post/);
  assert.match(rowboat, /watertight-stern-post/);
  assert.match(rowboat, /watertight-dry-cockpit-sole/);
  assert.match(rowboat, /label\.position\.set\(side \* \.872, \.43, \.26\)/);
  assert.doesNotMatch(rowboat, /ropeCoil|bow-mooring-rope/);
  assert.match(rowboat, /get oarStrokePhaseRadians\(\)/);
  assert.match(rowboat, /get rowingEffort\(\)/);
});

test("shore forestry and first-person vehicle grips preserve visual clarity", async () => {
  const [game, world, sloth] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/player/SlothRig.ts", import.meta.url), "utf8"),
  ]);

  assert.match(world, /containsLakeWater\(x, z, -radius - 6\.5\)/);
  assert.match(world, /containsLakeWater\(x, z, -8\)/);
  assert.match(game, /layoutDepth/);
  assert.match(game, /setVehiclePose\("cart", -cart\.steeringAngleRadians \/ \.54\)/);
  assert.match(game, /setVehiclePose\("rowboat", activeBoat\.steeringAngleRadians \/ \.62, activeBoat\.oarStrokePhaseRadians\)/);
  assert.match(sloth, /vehicleMode === "cart"/);
  assert.match(sloth, /vehicleMode === "rowboat"/);
});
