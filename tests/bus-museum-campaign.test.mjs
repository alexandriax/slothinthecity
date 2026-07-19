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
  assert.match(zoo, /const ZOO_PATH_JUNCTIONS/);
  assert.match(zoo, /atJunction\(start\) \? Math\.min\(width \* \.64/);
  assert.match(zoo, /kerbLength = Math\.max\(\.35, length - startTrim - endTrim\)/);
});

test("museum shuttle is drivable through signed NYC traffic rather than a cutscene", async () => {
  const [bus, network, game, osm, minimap] = await Promise.all([
    readSource("../app/game/world/CityBusWorld.ts"),
    readSource("../app/game/world/CityRoadNetwork.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/nycShuttleOsmData.ts"),
    readSource("../app/game/ShuttleMinimap.tsx"),
  ]);

  for (const road of ["Jungleworld Road", "Boston Road", "East Tremont Avenue", "East 177th Street", "Sheridan Boulevard", "Cross Bronx Expressway", "Henry Hudson Parkway", "West 79th Street", "Amsterdam Avenue", "West 81st Street", "Central Park West"]) assert.match(bus, new RegExp(road));
  assert.match(bus, /new-york-stop-and-go-traffic-vehicle-/);
  assert.match(bus, /const SIGNAL_STOPS = \[150, 335, 565, CROSSTOWN_START \+ 42/);
  assert.match(bus, /nearestGap < 28/);
  assert.doesNotMatch(bus, /RED LIGHT · HOLD POSITION|upcomingSignalAspect|upcomingSignalDistance/);
  assert.match(bus, /input\.accelerate/);
  assert.match(bus, /input\.brake/);
  assert.match(bus, /input\.steerLeft/);
  assert.match(bus, /input\.steerRight/);
  assert.match(bus, /input\.handbrake/);
  assert.match(bus, /shiftUp: boolean/);
  assert.match(bus, /shiftDown: boolean/);
  assert.match(bus, /createPremiumHuman/);
  assert.match(bus, /createAmbientHumanAgent/);
  assert.match(bus, /updateAmbientHumanAgent/);
  assert.match(bus, /markPremiumCharactersDisposed/);
  assert.match(game, /transitStage === "BUS_DRIVE" && cityBusWorld/);
  assert.match(game, /continuous free-driving trip/);
  assert.match(game, /audio\.setCartMotor\(true, speed\)/);
  assert.match(game, /cityBusWorld\.parkingReached/);
  assert.match(bus, /const STREET_TOP_SPEED = 48/);
  assert.match(bus, /const HIGHWAY_TOP_SPEED = 72/);
  assert.match(bus, /const SHUTTLE_GEARS = \[/);
  for (const speedBand of [20, 36, 52]) assert.match(bus, new RegExp(`topSpeed: ${speedBand}`));
  assert.match(bus, /topSpeed: HIGHWAY_TOP_SPEED/);
  assert.match(bus, /private forwardGear = 2/);
  assert.match(bus, /input\.shiftUp !== input\.shiftDown/);
  assert.match(bus, /Math\.min\(road\.road\.speedLimit, this\.gearTopSpeedMetersPerSecond\)/);
  assert.match(bus, /this\.speed > forwardTopSpeed/);
  assert.match(game, /event\.code === "KeyR"/);
  assert.match(game, /event\.code === "KeyF"/);
  assert.match(game, /data-bus-gear=\{busGear\}/);
  assert.match(game, /data-bus-gear-limit=\{busGearLimit\}/);
  assert.match(game, /data-bus-impact=\{busImpactStatus\}/);
  assert.match(game, /data-bus-speed=\{vehicleSpeed\.toFixed\(1\)\}/);
  assert.match(game, /className="shuttle-transmission"/);
  assert.match(bus, /targetSpeed = driveInput > 0 \? forwardTopSpeed : -11/);
  assert.match(bus, /targetLane/);
  assert.match(bus, /vehicle\.lane \+= \(vehicle\.targetLane - vehicle\.lane\)/);
  assert.match(bus, /new CityRoadNetwork\(DRIVE_ROADS\)/);
  assert.match(bus, /movementSteps = Math\.max\(1, Math\.ceil\(Math\.abs\(movement\) \/ \.62\)\)/);
  assert.match(bus, /this\.busPosition\.addScaledVector\(driveForward, movement \/ movementSteps\)/);
  assert.match(bus, /missed-w79-highway/);
  assert.match(bus, /Amsterdam Avenue/);
  assert.match(bus, /OPEN-WORLD REROUTE ACTIVE/);
  assert.match(bus, /upper-west-side-open-world-loop-traffic-/);
  assert.doesNotMatch(bus, /desiredLateral/);
  assert.match(network, /class CityRoadNetwork/);
  assert.match(network, /shortest-path guidance/);
  assert.match(network, /route\(position: THREE\.Vector3, destination: THREE\.Vector3, heading\?: THREE\.Vector3\)/);
  assert.match(bus, /openstreetmap-authored-upper-west-side-driveable-road-surfaces/);
  assert.match(game, /Wrong turn — navigation recalculated through the connected street grid/);
  assert.match(bus, /CITY_BUS_ROUTE_LENGTH = CENTRAL_PARK_WEST_START/);
  assert.match(bus, /hudson-river-right-side-of-southbound-west-side-highway/);
  assert.match(bus, /openstreetmap-central-park-continuous-landscape-context/);
  assert.match(bus, /exit-here-for-american-museum-of-natural-history-sign/);
  assert.match(bus, /get signedSpeedMetersPerSecond\(\)/);
  assert.match(bus, /nyc-crosswalk-separated-ladder-bar/);
  assert.match(bus, /nyc-traffic-signal-\$\{aspect\.toLowerCase\(\)\}-lens/);
  assert.match(bus, /setSignalLens\(signal\.lenses\[aspect\], aspect, aspect === active\)/);
  assert.doesNotMatch(bus, /museum-shuttle-dashboard-\$\{aspect\.toLowerCase\(\)\}-signal-repeater|dashboardLenses/);
  assert.match(bus, /central-park-west-amnh-arrival-asphalt-continuation/);
  assert.match(bus, /amnh-route-end-grounded-preview-facade/);
  assert.match(bus, /continuous-bronx-neighborhood-ground-plane/);
  assert.match(bus, /bronx-surface-street-intersection-/);
  assert.match(bus, /nyc-near-side-before-intersection-signal-pole/);
  assert.match(bus, /west-side-highway-continuous-manhattan-streetwall-podium/);
  assert.match(bus, /dense-west-side-highway-riverfront-building/);
  assert.match(bus, /west-side-highway-roadway-light-not-traffic-signal/);
  assert.match(bus, /get routeCompletion\(\)/);
  assert.match(bus, /completionHighWater = Math\.max/);
  assert.doesNotMatch(bus, /UWS_AVENUES|UWS_CROSS_STREETS/);
  assert.match(bus, /finite-no-void-openstreetmap-upper-west-side-district-ground-plane/);
  assert.match(bus, /NYC_OSM_ROADS/);
  assert.match(bus, /NYC_OSM_BUILDINGS/);
  assert.match(bus, /nyc-blue-open-streets-performance-boundary-/);
  assert.match(osm, /sourceDate: "2026-07-11"/);
  assert.match(osm, /© OpenStreetMap contributors · ODbL/);
  assert.ok((osm.match(/"id":"osm-/g) ?? []).length >= 900, "the playable district retains a dense OSM street network");
  assert.ok((osm.match(/\{"id":\d+/g) ?? []).length >= 3900, "the context district retains thousands of OSM building footprints");
  assert.match(minimap, /NYC_OSM_ROADS/);
  assert.match(minimap, /NYC_OSM_BOUNDARY_CLOSURES/);
  assert.match(minimap, /NYC_OSM_SNAPSHOT\.attributionUrl/);
  assert.match(game, /cityBusWorld\.minimapSnapshot/);
  assert.match(game, /<ShuttleMinimap snapshot=\{busMap\}/);
  assert.match(game, /progress: parked \? 1 : cityBusWorld\.routeCompletion/);
  assert.match(game, /hud\.progress !== undefined/);
  assert.match(game, /cityBusWorld\.getWorldGripPositions\(busGripWorld\)/);
  assert.match(game, /camera\.worldToLocal\(busGripCamera\.left\)/);
  assert.match(game, /sloth\.setVehiclePose\("cart", cityBusWorld\.steeringAmount/);
  assert.match(bus, /resolveStaticCollisions/);
  assert.match(bus, /resolveTrafficCollisions/);
  assert.match(bus, /circleObbContact/);
  assert.match(bus, /get integrity\(\)/);
  assert.match(bus, /museum-shuttle-visible-damage-stage-/);
  assert.match(game, /data-bus-integrity=\{busIntegrity\}/);
  assert.match(game, /Returning to the Bronx Zoo boarding checkpoint/);
  assert.match(game, /startBusDrive\(0\)/);
  assert.match(game, /audio\.playVehicleImpact\(impact\.severity\)/);
  assert.match(bus, /rearTrafficCatch/);
  assert.match(bus, /vehicleForwardSpeed - this\.speed > \.35/);
  assert.match(bus, /rearTrafficCatch \? 0 : 2 \+ severity \* 7/);
  assert.match(bus, /protected: true/);
  assert.match(game, /Rear impact absorbed · traffic pushed the shuttle forward · no integrity lost/);
  assert.match(bus, /collider\.kind === "barrier" \? 1\.5 : 3/);
  assert.match(bus, /collider\.kind === "barrier" \? 4\.5 : 9/);
});

test("mobile shuttle controls expose both sequential gear shifts", async () => {
  const touch = await readSource("../app/game/mobile/TouchControls.tsx");

  assert.match(touch, /vehicle === "bus" && <div className="touch-gears"/);
  assert.match(touch, /aria-label="Shift shuttle gear up"/);
  assert.match(touch, /emitKey\("KeyR", true\)/);
  assert.match(touch, /aria-label="Shift shuttle gear down"/);
  assert.match(touch, /emitKey\("KeyF", true\)/);
});

test("the zoo skateboard and AMNH five-scooter convoy provide fast travel", async () => {
  const [mobility, zoo, museum, party, game, touch] = await Promise.all([
    readSource("../app/game/world/PersonalMobility.ts"),
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
    readSource("../app/game/world/SlothFollowerParty.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/mobile/TouchControls.tsx"),
  ]);

  assert.match(mobility, /createSkateboard/);
  assert.match(mobility, /skateboard-continuous-kicktail-maple-deck/);
  assert.match(mobility, /createElectricScooter/);
  assert.match(mobility, /electric-scooter-visible-brake-cable/);
  assert.match(zoo, /skateboardPosition = new THREE\.Vector3\(-4\.1, terrainHeight\(-4\.1, -1\.1\), -1\.1\)/);
  assert.doesNotMatch(zoo, /zoo-skateboard-wayfinding-sign|RIDE ZOO SKATEBOARD · SPACE KICKFLIP|E TO RIDE · SPACE KICKFLIP/);
  assert.match(zoo, /triggerSkateboardKickflip/);
  assert.match(game, /travelSpeed = skateboarding \? 8\.8 : 2\.5/);
  assert.match(museum, /for \(let index = 0; index < 5; index\+\+\)/);
  assert.match(museum, /amnh-five-scooter-fast-travel-line-/);
  assert.match(party, /rescued-sloth-friend-\$\{index \+ 1\}-ridden-electric-scooter/);
  assert.match(party, /formation === "scooter" \? catchingUp \? 10\.5 : 9\.1/);
  assert.match(party, /createPremiumScooterSlothFriend/);
  assert.match(party, /follower\.riderRig\.visible = active/);
  assert.doesNotMatch(party, /this\.scooterMode \? 1\.2/);
  assert.match(party, /ride-electric-scooter-upright/);
  assert.match(game, /rescuedParty\.setScooterMode\(true\)/);
  assert.match(touch, /vehicle === "skateboard" \? "Trick"/);
  for (const source of [mobility, zoo, museum, party, game, touch]) assert.doesNotMatch(source, /se[g]way/i);
});

test("shuttle boarding is a visible exterior interaction, never an invisible body trigger", async () => {
  const [zoo, game] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/SubwayGame.tsx"),
  ]);

  assert.match(zoo, /museum-shuttle-visible-exterior-boarding-zone/);
  assert.match(zoo, /museum-shuttle-grounded-door-step/);
  assert.match(zoo, /museum-shuttle-true-open-boarding-doorway/);
  assert.match(zoo, /museum-shuttle-visible-interior-aisle/);
  assert.match(zoo, /museum-shuttle-recessed-stepwell-through-open-door/);
  assert.match(zoo, /kind: "BUS_BOARDING"/);
  assert.match(zoo, /BOARD MUSEUM SHUTTLE WITH ALL FOUR FRIENDS/);
  assert.match(game, /actionRequested && hint\?\.kind === "BUS_BOARDING"/);
  assert.match(game, /rescuedParty\.allWithin\(zooWorld\.busBoardingPosition, 9\.5\)/);
  assert.match(game, /Wait in the marked loading zone until all four rescued sloths reach the shuttle door/);
  assert.doesNotMatch(game, /if \(zooWorld\.busBoardingReached\(player\)/);
});

test("Central Park Zoo approach and departure paths terminate at the forecourt curb", async () => {
  const landmarks = await readSource("../app/game/world/CampaignLandmarks.ts");

  assert.match(landmarks, /bow-bridge-to-central-park-zoo-curb-safe-path/);
  assert.match(landmarks, /central-park-zoo-to-subway-curb-safe-path/);
  assert.match(landmarks, /new THREE\.Vector3\(274\.8, 0, -327\.35\)/);
  assert.match(landmarks, /new THREE\.Vector3\(304\.25, 0, -349\.7\)/);
  assert.doesNotMatch(landmarks, /bow-bridge-to-zoo-and-subway-landscaped-path/);
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
  assert.match(museum, /roosevelt-portico-grounded-column-base/);
  assert.match(museum, /amnh-solid-masonry-between-public-entry-portals/);
  assert.match(museum, /amnh-cut-through-portal-solid-side-reveal/);
  assert.match(museum, /transmission: \.72/);
  assert.match(museum, /amnh-human-scale-bronze-and-glass-entrance-door/);
  assert.match(museum, /amnh-entrance-glass-transom-above-human-scale-doors/);
  assert.match(museum, /amnh-clearly-marked-public-entry-carpet/);
  assert.match(museum, /amnh-player-climbable-roosevelt-entrance-step/);
  assert.match(museum, /amnh-collision-matched-entrance-landing/);
  assert.match(museum, /if \(z >= 24\.45 && z <= 34\.65\)/);
  assert.match(museum, /player\.y = this\.floorHeight\(player\.x, player\.z\) \+ 1\.48/);
  assert.match(museum, /context\.measureText\(text\)\.width <= maxWidth/);
  assert.match(museum, /amnh-textured-permanent-hall-wall-graphic-/);
  assert.match(museum, /amnh-interactive-collection-study-station/);
  assert.match(museum, /andros-coral-reef-diorama/);
  assert.match(museum, /sperm-whale-and-giant-squid-deep-ocean-display/);
  assert.match(museum, /akeley-water-hole-panoramic-diorama/);
  for (const species of ["lestodon-armatus", "mylodon-darwinii", "megalonyx-jeffersonii", "acratocnus-odontrigonus"]) assert.match(museum, new RegExp(`name: "${species}"`));
  assert.match(museum, /display\.name = `\$\{specimen\.name\}-museum-study-case`/);
  assert.match(museum, /living-sloth-adaptations-canopy-diorama/);
  assert.match(museum, /roosevelt-collection-ground-sloth-skin-and-dung-case/);
  assert.match(museum, /amnh-official-permanent-hall-dense-exhibit-program/);
  assert.match(museum, /MIGNONE HALLS OF GEMS AND MINERALS/);
  assert.match(museum, /HALL OF SAURISCHIAN DINOSAURS/);
  assert.match(museum, /glen-rose-riverbed-trackway-cast/);
  assert.match(museum, /amnh-5027-tyrannosaurus-jaw-study-cast/);
  assert.match(museum, /apatosaurus-mounted-vertebral-study/);
  assert.match(museum, /amnh-dense-main-aisle-interpretive-media-panel/);
  assert.match(museum, /amnh-unique-accessioned-specimen-/);
  assert.match(museum, /trilobite-articulated-thoracic-segment/);
  assert.match(museum, /etched-iron-meteorite-cross-section/);
  assert.match(museum, /green-river-formation-leaf-shale/);
  assert.match(museum, /african-elephant-continuously-curved-muscular-trunk/);
  assert.match(museum, /african-elephant-anatomical-fan-ear/);
  assert.match(game, /transitStage === "MUSEUM" && museumWorld/);
  assert.match(game, /museumCompletionArmed && museumWorld\.megatheriumNearby\(player\) && rescuedParty\.allWithin\(target, 9\.5\)/);
});
