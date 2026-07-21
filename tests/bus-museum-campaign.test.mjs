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
  assert.match(zoo, /function addPathDrainageEdges/);
  assert.match(zoo, /pathPointNormal\(points, segmentIndex \+ 1\)/);
  assert.match(zoo, /const endAmount = THREE\.MathUtils\.clamp\(1 - endTrim \/ length, \.55, 1\)/);
});

test("museum shuttle is drivable through signed NYC traffic rather than a cutscene", async () => {
  const [bus, network, game, osm, minimap, styles] = await Promise.all([
    readSource("../app/game/world/CityBusWorld.ts"),
    readSource("../app/game/world/CityRoadNetwork.ts"),
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/world/nycShuttleOsmData.ts"),
    readSource("../app/game/ShuttleMinimap.tsx"),
    readSource("../app/globals.css"),
  ]);

  for (const road of ["Jungleworld Road", "Boston Road", "East Tremont Avenue", "East 177th Street", "Sheridan Boulevard", "Cross Bronx Expressway", "Henry Hudson Parkway", "West 79th Street", "Central Park West"]) assert.match(bus, new RegExp(road));
  assert.match(bus, /new-york-stop-and-go-traffic-vehicle-/);
  assert.match(bus, /const WEST_79_GRID_OFFSETS = \[44\.5, 89, 133\.5\]/);
  assert.match(bus, /const SIGNAL_STOPS = \[150, 335, 565, \.\.\.WEST_79_GRID_OFFSETS\.map/);
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
  assert.match(bus, /const EXIT_RAMP_TOP_SPEED = 40/);
  assert.match(bus, /const UWS_TOP_SPEED = 30/);
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
  assert.match(bus, /west-79-local-access-dead-end-/);
  assert.match(bus, /VISIBLE_OSM_ROADS/);
  assert.match(bus, /movementSteps = Math\.max\(1, Math\.ceil\(Math\.abs\(movement\) \/ \.62\)\)/);
  assert.match(bus, /this\.busPosition\.addScaledVector\(driveForward, movement \/ movementSteps\)/);
  assert.match(bus, /missed-w79-highway/);
  assert.match(bus, /const HIGHWAY_EXIT_JUNCTION = \[-99\.762, -2562\.723\]/);
  assert.match(bus, /HIGHWAY_OSM_BLEND_START/);
  assert.match(bus, /const HIGHWAY_EXIT_RAMP_POINTS = cubicRoutePoints/);
  assert.match(bus, /\[-99\.762, -2589\]/);
  assert.match(bus, /const MANHATTAN_STREET_EAST = \[-\.95394, -\.3\]/);
  assert.match(bus, /const MANHATTAN_AVENUE_NORTH = \[-\.3, \.95394\]/);
  assert.match(bus, /const CENTRAL_PARK_WEST_TURN_POINTS = quadraticRoutePoints/);
  assert.match(bus, /missed-w79-highway-osm-connector/);
  assert.match(bus, /road\.end\[1\] < road\.start\[1\]/);
  assert.match(bus, /west-side-highway-osm-continuation-hudson-safety-barrier/);
  assert.match(bus, /hudson-river-greenway-mapped-highway-continuation/);
  assert.match(bus, /closure\.road !== "West Side Highway"/);
  assert.match(bus, /west-side-highway-following-streetwall-podium-section/);
  assert.match(bus, /const highwayStreetwallEnd = HIGHWAY_EXIT_START - 138/);
  assert.match(bus, /private resolveRoadBoundaryCollision/);
  assert.match(bus, /const allowedDistance = road\.road\.halfWidth \+ 5\.5/);
  assert.match(bus, /this\.collisionCooldowns\.get\("road-envelope"\)/);
  assert.doesNotMatch(bus, /routeFollowingStaticColliders|filterCollidersOutsidePrimaryLanes/);
  assert.doesNotMatch(bus, /collisionIndex\.add\(\{ id: `(?:osm-building|route-building|bronx-streetwall|highway-osm)/);
  assert.match(bus, /CITY_BUS_EXIT_REVIEW_PROGRESS = HIGHWAY_EXIT_START - 18/);
  assert.match(bus, /segmentIntersectsExpandedBuilding/);
  assert.match(bus, /const VISIBLE_OSM_BUILDINGS = NYC_OSM_BUILDINGS\.filter/);
  assert.match(bus, /building\.height > minimumFootprint \* 9/);
  assert.match(bus, /exitRamp \? road\.halfWidth \+ 1\.4 : recommendedRoute \? road\.halfWidth \+ 1\.05/);
  assert.match(bus, /progress >= HIGHWAY_EXIT_START - 170/);
  assert.match(bus, /for \(const side of curbFreeExitMerge \|\| curbFreeIntersection \? \[\] : \[-1, 1\]\)/);
  assert.match(bus, /compact-seamless-west-79th-exit-road-joint/);
  assert.match(bus, /west-79-exit-ramp-reflective-channelizer/);
  assert.match(bus, /overlapsExitTransition \|\| isSouthboundHighwayContinuation/);
  assert.match(bus, /Number\.isFinite\(this\.guidance\.distance\)/);
  assert.match(bus, /this\.progress >= HIGHWAY_EXIT_START && this\.progress < CROSSTOWN_START/);
  assert.match(bus, /manhattan-grid-continuous-driveable-intersection/);
  assert.match(bus, /smooth-two-lane-west-79th-off-ramp-segment/);
  assert.match(bus, /const laneDividers = exitRamp \? \[0\] : \[-LANE_WIDTH, 0, LANE_WIDTH\]/);
  assert.match(bus, /for \(const distance of MANHATTAN_PRIMARY_CUMULATIVE\) surfaceAnchors\.add/);
  assert.match(bus, /OPEN-WORLD REROUTE ACTIVE/);
  assert.match(bus, /upper-west-side-open-world-loop-traffic-/);
  assert.doesNotMatch(bus, /desiredLateral/);
  assert.match(network, /class CityRoadNetwork/);
  assert.match(network, /shortest-path guidance/);
  assert.match(network, /route\(position: THREE\.Vector3, destination: THREE\.Vector3, heading\?: THREE\.Vector3\)/);
  assert.match(network, /end\.edges\.push\(\{ to: startId, length, road \}\)/);
  assert.match(bus, /openstreetmap-authored-upper-west-side-driveable-road-surfaces/);
  assert.match(game, /Wrong turn — this local-access block ends at the blue barriers/);
  assert.match(bus, /CITY_BUS_ROUTE_LENGTH = CENTRAL_PARK_WEST_START/);
  assert.match(bus, /hudson-river-route-following-surface/);
  assert.doesNotMatch(bus, /new THREE\.PlaneGeometry\(320, 2380\)/);
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
  assert.match(bus, /bronx-continuous-streetwall-infill/);
  assert.match(bus, /continuous-painted-road-edge-line/);
  assert.match(bus, /bronx-surface-street-intersection-/);
  assert.match(bus, /nyc-near-side-before-intersection-signal-pole/);
  assert.match(bus, /west-side-highway-continuous-manhattan-streetwall-podium/);
  assert.match(bus, /dense-west-side-highway-riverfront-building/);
  assert.match(bus, /west-side-highway-roadway-light-not-traffic-signal/);
  assert.match(bus, /rescue-bus-full-cab-windscreen-glare/);
  assert.doesNotMatch(bus, /museum-shuttle-unclipped-destination-sign-frame|museum-shuttle-full-width-visible-destination-sign/);
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
  assert.match(minimap, /CITY_BUS_LOCAL_CLOSURE_POINTS/);
  assert.match(minimap, /minimap-local-access/);
  assert.match(minimap, /Guided · Upper West Side/);
  assert.match(minimap, /NYC_OSM_SNAPSHOT\.attributionUrl/);
  assert.match(minimap, /CITY_BUS_MANHATTAN_MINIMAP_POINTS/);
  assert.match(minimap, /const mapX = \(x: number\) => 238 -/);
  assert.match(minimap, /const headingDegrees = 180 - snapshot\.heading/);
  assert.match(minimap, /className="minimap-river" x="0"/);
  assert.doesNotMatch(minimap, /minimap-player-dot/);
  assert.match(styles, /\.game-shell\[data-level="city-bus"\] \.mission \{ display:none; \}/);
  assert.match(styles, /\[data-shuttle-transmission="true"\].*right:max\(16px.*width:230px.*height:52px/s);
  assert.match(game, /cityBusWorld\.minimapSnapshot/);
  assert.match(game, /<ShuttleMinimap snapshot=\{busMap\}/);
  assert.match(game, /progress: parked \? 1 : cityBusWorld\.routeCompletion/);
  assert.match(game, /hud\.progress !== undefined/);
  assert.match(game, /cityBusWorld\.getWorldGripPositions\(busGripWorld\)/);
  assert.match(game, /camera\.worldToLocal\(busGripCamera\.left\)/);
  assert.match(game, /sloth\.setVehiclePose\(\s*"cart",\s*cityBusWorld\.steeringAmount/);
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
  assert.match(game, /function scheduleMuseumPreload/);
  assert.match(game, /new NaturalHistoryMuseumWorld\(\s*museumPreloadScene/);
  assert.match(game, /renderer\.compile\(museumPreloadScene, preloadCamera\)/);
  assert.match(game, /Math\.min\(next\.pixelRatio, 1\.25\)/);
  assert.match(game, /renderPipeline\.render\(!museumRendering\(\)\)/);
});

test("the canonical first-person fur sampler becomes ready in every scene", async () => {
  const [textures, rig, checkpoints, game] = await Promise.all([
    readSource("../app/game/rendering/textures.ts"),
    readSource("../app/game/player/SlothRig.ts"),
    readSource("../app/game/debugCheckpoints.ts"),
    readSource("../app/game/SubwayGame.tsx"),
  ]);

  assert.match(textures, /const fur = load\("\/game\/textures\/sloth-fur\.webp", 1\.2, 2\.2, decodedFur =>/);
  assert.match(textures, /releasePendingTextureClones\(decodedFur\)/);
  assert.match(rig, /viewmodelFur\.source = furTexture\.source/);
  assert.match(rig, /markTextureCloneReadyAfterSource\(viewmodelFur, furTexture\)/);
  assert.match(rig, /viewmodelFur\.repeat\.set\(\.42, \.78\)/);
  assert.match(rig, /emissiveMap: viewmodelFur/);
  assert.match(checkpoints, /"bus-highway-continuation": "busmissedexit"/);
  assert.match(game, /qaInput === "busmissedexit"\s*\?\s*"missed-exit"/);
});

test("mobile shuttle controls expose both sequential gear shifts", async () => {
  const touch = await readSource("../app/game/mobile/TouchControls.tsx");

  assert.match(touch, /vehicle === "bus" && <div className="touch-gears"/);
  assert.match(touch, /aria-label="Shift shuttle gear up"/);
  assert.match(touch, /emitKey\("KeyR", true\)/);
  assert.match(touch, /aria-label="Shift shuttle gear down"/);
  assert.match(touch, /emitKey\("KeyF", true\)/);
});

test("the zoo skateboard and AMNH six-scooter convoy provide fast travel", async () => {
  const [mobility, zoo, museum, party, gary, game, touch] = await Promise.all([
    readSource("../app/game/world/PersonalMobility.ts"),
    readSource("../app/game/world/BronxZooWorld.ts"),
    readSource("../app/game/world/NaturalHistoryMuseumWorld.ts"),
    readSource("../app/game/world/SlothFollowerParty.ts"),
    readSource("../app/game/world/GaryCompanion.ts"),
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
  assert.match(museum, /for \(let index = 0; index < scooterCapacity; index\+\+\)/);
  assert.match(museum, /amnh-menagerie-scooter-/);
  assert.match(museum, /WHOLE MENAGERIE/);
  assert.match(party, /rescued-sloth-friend-\$\{index \+ 1\}-ridden-electric-scooter/);
  assert.match(party, /formation === "scooter" \? catchingUp \? 10\.5 : 9\.1/);
  assert.match(party, /createPremiumScooterSlothFriend/);
  assert.match(party, /follower\.riderRig\.visible = active/);
  assert.doesNotMatch(party, /this\.scooterMode \? 1\.2/);
  assert.match(party, /ride-electric-scooter-upright/);
  assert.match(game, /rescuedParty\.setScooterMode\(true\)/);
  assert.match(gary, /fed-gary-sixth-ridden-electric-scooter/);
  assert.match(gary, /gary-balanced-on-sixth-scooter/);
  assert.match(game, /garyCompanion\.setScooterMode\(garyCompanion\.isFed\)/);
  assert.match(touch, /vehicle === "skateboard" \? "Trick"/);
  for (const source of [mobility, zoo, museum, party, gary, game, touch]) assert.doesNotMatch(source, /se[g]way/i);
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
  assert.match(zoo, /museum-shuttle-open-doorway-interior-shadow/);
  assert.match(zoo, /museum-shuttle-recessed-entry-step-/);
  assert.match(zoo, /museum-shuttle-folded-open-glass-door-leaf/);
  assert.match(zoo, /bronx-zoo-human-scale-museum-shuttle-stop-blade/);
  assert.match(zoo, /museum-shuttle-segmented-wheel-clear-underbody/);
  assert.match(zoo, /museum-shuttle-visible-metal-wheel-hub/);
  assert.match(zoo, /museum-shuttle-stop-dedicated-front-back-face/);
  assert.match(zoo, /kind: "BUS_BOARDING"/);
  assert.match(zoo, /BOARD MUSEUM SHUTTLE WITH YOUR WHOLE MENAGERIE/);
  assert.match(zoo, /RoundedBoxGeometry\(9\.4, \.055, 7\.2/);
  assert.match(zoo, /boardingDistance <= 7\.5/);
  assert.match(game, /const prompt = shuttleReady[\s\S]{0,220}RIDE ZOO SKATEBOARD/);
  assert.match(game, /actionRequested && shuttleReady/);
  assert.match(game, /shuttleBoardingRadiusFor\(totalFollowerCount\(\)\)/);
  assert.match(game, /allFollowersWithin\(zooWorld\.busBoardingPosition, boardingRadius\)/);
  assert.match(game, /broad yellow shuttle apron/);
  assert.doesNotMatch(game, /if \(zooWorld\.busBoardingReached\(player\)/);
});

test("the island-ticket route continues directly from Bow Bridge to the Fifth Avenue subway", async () => {
  const landmarks = await readSource("../app/game/world/CampaignLandmarks.ts");

  assert.match(landmarks, /bow-bridge-to-fifth-avenue-subway-landscaped-path/);
  assert.match(landmarks, /new THREE\.Vector3\(282, 0, -327\)/);
  assert.match(landmarks, /new THREE\.Vector3\(299, 0, -344\)/);
  assert.match(landmarks, /SUBWAY_TARGET\.clone\(\)/);
  assert.doesNotMatch(landmarks, /central-park-zoo|function addZoo/);
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
  assert.match(museum, /this\.resolveCompanion\(player, velocity, \.42\);[\s\S]{0,80}player\.y \+= 1\.48/);
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
  assert.match(museum, /const MUSEUM_RESIDENT_GUEST_INDEXES/);
  assert.match(museum, /this\.createResidentGuests\(\)/);
  assert.doesNotMatch(museum, /ensureGuestsNear|updateStreaming|section\.object\.visible/);
  assert.match(museum, /Static gallery content remains resident after the offscreen compile/);
  assert.match(museum, /const nearby = !player \|\| Math\.abs\(agent\.root\.position\.z - player\.z\) < 76/);
  assert.match(game, /museumWorld\.update\(gameTime, delta, player\)/);
  assert.match(game, /transitStage === "MUSEUM" && museumWorld/);
  assert.match(game, /function museumMissionReady\(\)/);
  assert.match(game, /allFollowersWithin\([\s\S]{0,120}scooterRiding \? 13\.5 : 11\.5/);
});
