import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("subway service has a typed return direction with boardable downtown West Farms service", async () => {
  const source = await readSource("../app/game/world/SubwayWorld.ts");

  assert.match(source, /SubwayTravelDirection = "OUTBOUND" \| "RETURN"/);
  assert.match(source, /travelDirection\?: SubwayTravelDirection/);
  assert.match(source, /subwayServicePlan\(station: SubwayStationId, travelDirection: SubwayTravelDirection\)/);
  assert.match(source, /station === "WEST_FARMS"[\s\S]{0,220}DOWNTOWN \/ MANHATTAN[\s\S]{0,100}terminal: false/);
  assert.match(source, /if \(!this\.doorsOpen \|\| this\.servicePlan\.terminal\) return null/);
  assert.match(source, /returnTrip && id === "WEST_FARMS"[\s\S]{0,120}"BOARD"/);
});

test("return stations expose street-to-platform and platform-to-street navigation without a second fare", async () => {
  const source = await readSource("../app/game/world/SubwayWorld.ts");

  assert.match(source, /this\.travelDirection === "RETURN" && this\.stationId === "WEST_FARMS"\) return station\.streetCheckpoint/);
  assert.match(source, /this\.travelDirection === "RETURN" && this\.stationId === "FIFTH_AV"\) return station\.platformCheckpoint/);
  assert.match(source, /this\.stationId === "FIFTH_AV"\) return this\.stations\.get\(this\.stationId\)!\.streetCheckpoint/);
  assert.match(source, /const freeExit = this\.travelDirection === "RETURN" && this\.stationId === "FIFTH_AV"/);
  assert.match(source, /blockedByFare = this\.travelDirection === "OUTBOUND"/);
  assert.match(source, /Exit · Central Park/);
});

test("train interiors define the reverse Bronx-to-Central-Park journeys", async () => {
  const source = await readSource("../app/game/world/TrainInteriorWorld.ts");
  const westToLex = source.slice(source.indexOf("WEST_FARMS_TO_LEXINGTON"), source.indexOf("LEXINGTON_TO_FIFTH"));
  const lexToFifth = source.slice(source.indexOf("LEXINGTON_TO_FIFTH"), source.indexOf("} as const satisfies"));

  assert.match(westToLex, /origin: "West Farms Sq–E Tremont Av"/);
  assert.match(westToLex, /"E 180 St"[\s\S]{0,100}"125 St"[\s\S]{0,100}"86 St"/);
  assert.match(westToLex, /destination: \{ name: "Lexington Av \/ 59 St", side: 1 \}/);
  assert.match(westToLex, /service: "Downtown \/ Manhattan Express"/);
  assert.match(lexToFifth, /origin: "Lexington Av \/ 59 St"/);
  assert.match(lexToFifth, /destination: \{ name: "5 Av \/ 59 St", side: -1 \}/);
  assert.match(lexToFifth, /service: "Downtown \/ Brooklyn Broadway service"/);
});
