import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("outdoor zoo rendering cannot inherit the old subway reflection bars", async () => {
  const styles = await readSource("../app/globals.css");
  const gradeStart = styles.indexOf(".subway-shell .world-grade");
  const gradeEnd = styles.indexOf("}", gradeStart);
  const grade = styles.slice(gradeStart, gradeEnd);

  assert.ok(gradeStart >= 0);
  assert.doesNotMatch(grade, /16\.2%|16\.45%|83\.55%|83\.8%/);
  assert.doesNotMatch(grade, /linear-gradient\(90deg/);
});

test("zoo circulation uses habitat overlooks and routes around the sea-lion pool", async () => {
  const zoo = await readSource("../app/game/world/BronxZooWorld.ts");

  for (const route of [
    "bronx-zoo-entry-promenade",
    "bronx-zoo-sea-lion-west-bypass",
    "bronx-zoo-sea-lion-east-bypass",
    "bronx-zoo-rescue-promenade",
    "bronx-zoo-north-habitat-overlook",
    "bronx-zoo-monkey-and-plains-overlook",
    "bronx-zoo-south-conservation-overlook",
  ]) assert.match(zoo, new RegExp(route));
  assert.doesNotMatch(zoo, /bronx-zoo-central-rescue-walk/);
  assert.match(zoo, /const clearRoutes = ZOO_VISITOR_PATHS\.map/);
  assert.match(zoo, /\[0, -52\], \[-18\.5, -62\], \[-18\.5, -87\], \[0, -97\]/);
  assert.match(zoo, /\[0, -52\], \[18\.5, -62\], \[18\.5, -87\], \[0, -97\]/);
});

test("museum shuttle is drivable through signed NYC traffic rather than a cutscene", async () => {
  const [bus, game] = await Promise.all([
    readSource("../app/game/world/CityBusWorld.ts"),
    readSource("../app/game/SubwayGame.tsx"),
  ]);

  for (const road of ["Southern Boulevard", "Bronx River Parkway", "Cross Bronx Expressway", "Henry Hudson Parkway", "West Side Highway", "West 79th Street · Central Park West"]) assert.match(bus, new RegExp(road.replace("·", "·")));
  assert.match(bus, /new-york-stop-and-go-traffic-vehicle-/);
  assert.match(bus, /const signalStops = \[126, 282, 1044, 1114\]/);
  assert.match(bus, /nearestGap < 18/);
  assert.match(bus, /RED LIGHT · HOLD POSITION/);
  assert.match(bus, /input\.accelerate/);
  assert.match(bus, /input\.brake/);
  assert.match(bus, /input\.steerLeft/);
  assert.match(bus, /input\.steerRight/);
  assert.match(bus, /input\.handbrake/);
  assert.match(bus, /createPremiumHuman/);
  assert.match(bus, /createAmbientHumanAgent/);
  assert.match(bus, /updateAmbientHumanAgent/);
  assert.match(bus, /markPremiumCharactersDisposed/);
  assert.match(game, /transitStage === "BUS_DRIVE" && cityBusWorld/);
  assert.match(game, /W accelerates, S brakes, A \/ D steer, and Space is the handbrake/);
  assert.match(game, /audio\.setCartMotor\(true, speed\)/);
  assert.match(game, /cityBusWorld\.parkingReached/);
});

test("AMNH is a full exploration level with permanent halls, crowds, and Megatherium", async () => {
  const [museum, game] = await Promise.all([
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
    readSource("../app/game/SubwayGame.tsx"),
  ]);

  for (const feature of [
    "american-museum-central-park-west-facade",
    "THEODORE ROOSEVELT ROTUNDA",
    "MILSTEIN HALL OF OCEAN LIFE",
    "AKELEY HALL OF AFRICAN MAMMALS",
    "ARTHUR ROSS HALL OF METEORITES",
    "GOTTESMAN HALL OF PLANET EARTH",
    "FOSSIL MAMMAL HALLS",
    "MEGATHERIUM AMERICANUM",
  ]) assert.match(museum, new RegExp(feature));
  assert.match(museum, /barosaurus-allosaurus-display/);
  assert.match(museum, /megatherium-enormous-curved-manual-claw/);
  assert.match(museum, /megatherium-balancing-tail-vertebra/);
  assert.match(museum, /amnh-wandering-museum-visitor-/);
  assert.match(museum, /fossil-mammal-hall-docent/);
  assert.match(museum, /createPremiumHuman/);
  assert.match(museum, /updateAmbientHumanAgent/);
  assert.match(museum, /markPremiumCharactersDisposed/);
  assert.match(game, /transitStage === "MUSEUM" && museumWorld/);
  assert.match(game, /museumCompletionArmed && museumWorld\.megatheriumNearby\(player\) && rescuedParty\.allWithin\(target, 9\.5\)/);
});
