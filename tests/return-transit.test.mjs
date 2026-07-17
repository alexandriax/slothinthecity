import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

test("subway service exposes the complete playable graph independently of quest direction", async () => {
  const source = await readSource("../app/game/world/SubwayWorld.ts");

  assert.match(source, /SubwayTravelDirection = "OUTBOUND" \| "RETURN"/);
  assert.match(source, /travelDirection\?: SubwayTravelDirection/);
  assert.match(source, /subwayServicePlan\(station: SubwayStationId, travelDirection: SubwayTravelDirection\)/);
  assert.match(source, /station === "WEST_FARMS"[\s\S]{0,220}DOWNTOWN \/ MANHATTAN[\s\S]{0,100}terminal: false/);
  assert.match(source, /SubwayJourneyKey =[\s\S]{0,200}"FIFTH_TO_LEXINGTON"[\s\S]{0,200}"LEXINGTON_TO_FIFTH"/);
  assert.match(source, /subwayJourneyForService\(station: SubwayStationId, route: string, direction: string\)/);
  assert.match(source, /station === "FIFTH_AV"[\s\S]{0,200}destination: "LEXINGTON", journeyKey: "FIFTH_TO_LEXINGTON"/);
  assert.match(source, /station === "LEXINGTON" && route === "5"[\s\S]{0,180}destination: "WEST_FARMS", journeyKey: "LEXINGTON_TO_WEST_FARMS"/);
  assert.match(source, /station === "LEXINGTON" && \(route === "N" \|\| route === "R"\)[\s\S]{0,180}destination: "FIFTH_AV", journeyKey: "LEXINGTON_TO_FIFTH"/);
  assert.match(source, /station === "WEST_FARMS" && route === "5"[\s\S]{0,180}destination: "LEXINGTON", journeyKey: "WEST_FARMS_TO_LEXINGTON"/);
  assert.match(source, /journeyKey: SubwayJourneyKey \| null/);
  assert.match(source, /destination: SubwayStationId \| null/);
  assert.match(source, /if \(!this\.doorsOpen \|\| this\.servicePlan\.terminal\) return null/);
  assert.match(source, /if \(id === "WEST_FARMS" && z <= 11\)[\s\S]{0,120}"BOARD"/);
});

test("direction changes reuse one authored station instance and permanent bidirectional signs", async () => {
  const source = await readSource("../app/game/world/SubwayWorld.ts");
  const switcher = source.slice(source.indexOf("setTravelDirection("), source.indexOf("private disposeStation", source.indexOf("setTravelDirection(")));

  assert.doesNotMatch(switcher, /directionChanged|disposeStation\(id\)/);
  assert.match(switcher, /return this\.setStation\(this\.stationId, travelDirection\)/);
  assert.match(source, /function buildStation\([^)]*quality: SubwayQuality\)/);
  assert.doesNotMatch(source, /function buildStation\([^)]*travelDirection/);
  assert.match(source, /Keeping both choices visible lets the same geometry support/);
  assert.match(source, /DOWNTOWN \/ MANHATTAN  2  5/);
  assert.match(source, /UPTOWN \/ EASTCHESTER  5/);
});

test("return stations expose street-to-platform and platform-to-street navigation without a second fare", async () => {
  const source = await readSource("../app/game/world/SubwayWorld.ts");

  assert.match(source, /this\.travelDirection === "RETURN" && this\.stationId === "WEST_FARMS"\) return station\.streetCheckpoint/);
  assert.match(source, /this\.travelDirection === "RETURN" && this\.stationId === "FIFTH_AV"\) return station\.platformCheckpoint/);
  assert.match(source, /this\.stationId === "FIFTH_AV"\) return this\.stations\.get\(this\.stationId\)!\.streetCheckpoint/);
  assert.match(source, /const freeExit = this\.travelDirection === "RETURN" && this\.stationId === "FIFTH_AV"/);
  assert.match(source, /blockedByFare = this\.travelDirection === "OUTBOUND"/);
  assert.match(source, /Street exit · Central Park/);
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

test("onboard displays advance through the actual reverse next stops", async () => {
  const source = await readSource("../app/game/world/TrainInteriorWorld.ts");

  assert.match(source, /nextStopTexture\(journey: TrainInteriorJourney, stop: TrainInteriorStop\)/);
  assert.match(source, /const heading = `NEXT · \$\{stop\.name\.toUpperCase\(\)\}`/);
  assert.match(source, /this\.nextStopTextures\[Math\.min\(this\.stopIndex/);
  assert.match(source, /this\.updateNextStopDisplay\(\)/);
  assert.match(source, /Stay aboard through \$\{this\.currentStop\.name\} · destination \$\{this\.journey\.destination\.name\}/);
  assert.doesNotMatch(source, /premium\.root\.position\.y = -\.3/);
  assert.doesNotMatch(source, /pose: "seated"/);
});

test("rescued sloths interpolate elevation along route breadcrumbs on stairs", async () => {
  const source = await readSource("../app/game/world/SlothFollowerParty.ts");

  assert.match(source, /routeElevationAt\(position: THREE\.Vector3, fallback: number\)/);
  assert.match(source, /elevation = THREE\.MathUtils\.lerp\(start\.y, end\.y, amount\)/);
  assert.match(source, /formation === "station" \|\| formation === "train"/);
  assert.match(source, /maximumVerticalStep = Math\.max\(delta \* \.18, planarStep \* 1\.35\)/);
  assert.match(source, /follower\.groundY \+= THREE\.MathUtils\.clamp/);
  assert.match(source, /Math\.hypot\(start\.x - end\.x, start\.z - end\.z\)/);
  assert.doesNotMatch(source, /desired\.y = floorYAt\(desired\.x, desired\.z\)/);
});
