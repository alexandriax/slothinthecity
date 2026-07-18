import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Sky } from "three/addons/objects/Sky.js";
import type { GameTextures } from "../rendering/textures";
import { createPremiumHuman, createPremiumSlothFriend, markPremiumCharactersDisposed } from "./PremiumCharacter";
import { createAmbientHumanAgent, updateAmbientHumanAgent, type AmbientHumanAgent } from "./characters/AmbientHumanMotion";
import type { SlothVehicleGripTargets } from "../player/SlothRig";
import { CityRoadNetwork, type DriveRoad, type RouteGuidance } from "./CityRoadNetwork";

export type CityBusInput = {
  accelerate: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
};

export type ShuttleMinimapSnapshot = {
  x: number;
  z: number;
  heading: number;
  road: string;
  destinationX: number;
  destinationZ: number;
};

type TrafficVehicle = {
  root: THREE.Group;
  progress: number;
  lane: number;
  targetLane: number;
  speed: number;
  cruise: number;
  phase: number;
  nextLaneChange: number;
};

type LocalTrafficVehicle = {
  root: THREE.Group;
  path: readonly THREE.Vector3[];
  distance: number;
  speed: number;
  laneOffset: number;
};

type TrafficSignalAspect = "RED" | "YELLOW" | "GREEN";

type TrafficSignal = {
  progress: number;
  lenses: Record<TrafficSignalAspect, THREE.MeshStandardMaterial>;
};

type BuiltBus = {
  root: THREE.Group;
  steeringWheel: THREE.Group;
  gripAnchors: readonly [THREE.Object3D, THREE.Object3D];
};

const HIGHWAY_START = 900;
const HIGHWAY_EXIT_START = 2550;
const TURN_RADIUS = 24;
const TURN_ARC_LENGTH = TURN_RADIUS * Math.PI / 2;
const CROSSTOWN_START = HIGHWAY_EXIT_START + TURN_ARC_LENGTH;
const CROSSTOWN_LENGTH = 250;
const CENTRAL_PARK_WEST_TURN_START = CROSSTOWN_START + CROSSTOWN_LENGTH;
const CENTRAL_PARK_WEST_START = CENTRAL_PARK_WEST_TURN_START + TURN_ARC_LENGTH;
export const CITY_BUS_ROUTE_LENGTH = CENTRAL_PARK_WEST_START + 52;
export const CITY_BUS_HIGHWAY_REVIEW_PROGRESS = 1450;
export const CITY_BUS_EXIT_REVIEW_PROGRESS = HIGHWAY_EXIT_START - 150;
export const CITY_BUS_CITY_REVIEW_PROGRESS = CROSSTOWN_START + 86;
const LANE_WIDTH = 3.35;
const TRAFFIC_LANES = [-1.5, -.5, .5, 1.5] as const;
// Arcade pace is intentional: the sloth is slow on foot, but the vehicles are
// exhilarating. These caps are roughly 2–2.5× the previous values; traffic
// proximity remains readable, but only player brake/handbrake input takes pace.
const STREET_TOP_SPEED = 48;
const HIGHWAY_TOP_SPEED = 72;
const SIGNAL_STOPS = [150, 335, 565, CROSSTOWN_START + 72, CROSSTOWN_START + 176, CENTRAL_PARK_WEST_START + 26] as const;
const SIGNAL_COLORS: Record<TrafficSignalAspect, string> = { RED: "#ff3b2f", YELLOW: "#ffd02f", GREEN: "#37e778" };
const ROUTE_LEGS = [
  { from: 0, to: 220, name: "Southern Boulevard", detail: "Bronx Zoo shuttle gate · neighborhood traffic" },
  { from: 220, to: 470, name: "East 180th Street", detail: "West Farms shops · local intersections" },
  { from: 470, to: 700, name: "Fordham Road Connector", detail: "follow signs for the Henry Hudson" },
  { from: 700, to: HIGHWAY_START, name: "Henry Hudson Parkway Ramp", detail: "merge toward Manhattan" },
  { from: HIGHWAY_START, to: HIGHWAY_EXIT_START, name: "West Side Highway", detail: "south along the Hudson River" },
  { from: HIGHWAY_EXIT_START, to: CROSSTOWN_START, name: "West 79th Street Exit", detail: "take the museum exit" },
  { from: CROSSTOWN_START, to: CENTRAL_PARK_WEST_TURN_START, name: "West 79th Street", detail: "cross town toward Central Park West" },
  { from: CENTRAL_PARK_WEST_TURN_START, to: CENTRAL_PARK_WEST_START, name: "Central Park West Turn", detail: "turn right at Central Park West" },
  { from: CENTRAL_PARK_WEST_START, to: CITY_BUS_ROUTE_LENGTH, name: "Central Park West", detail: "American Museum of Natural History" },
] as const;

function signalAspectAt(elapsed: number, stop: number): TrafficSignalAspect {
  const phase = ((elapsed + stop * .07) % 16 + 16) % 16;
  return phase < 6.2 ? "RED" : phase < 12.8 ? "GREEN" : "YELLOW";
}

function signalLensMaterial(aspect: TrafficSignalAspect) {
  return new THREE.MeshStandardMaterial({
    color: "#161a18",
    emissive: SIGNAL_COLORS[aspect],
    emissiveIntensity: .035,
    roughness: .18,
    metalness: .02,
  });
}

function setSignalLens(material: THREE.MeshStandardMaterial, aspect: TrafficSignalAspect, active: boolean) {
  material.color.set(active ? SIGNAL_COLORS[aspect] : "#151a18");
  material.emissive.set(SIGNAL_COLORS[aspect]);
  // Preserve the hue under ACES tone mapping. Very high emissive values clip
  // every active lens to white, making red, amber, and green indistinguishable.
  material.emissiveIntensity = active ? (aspect === "YELLOW" ? 2.85 : 2.45) : .035;
  material.roughness = active ? .1 : .42;
}

function routeCenter(progress: number) {
  const p = THREE.MathUtils.clamp(progress, 0, CITY_BUS_ROUTE_LENGTH);
  if (p < HIGHWAY_START) {
    const taper = Math.sin(Math.PI * p / HIGHWAY_START);
    return new THREE.Vector3(Math.sin(p / 112) * 15 * taper, Math.sin(p / 145) * 1.15 * taper, -p);
  }
  if (p < HIGHWAY_EXIT_START) return new THREE.Vector3(0, .4, -p);
  if (p < CROSSTOWN_START) {
    const angle = (p - HIGHWAY_EXIT_START) / TURN_RADIUS;
    return new THREE.Vector3(-TURN_RADIUS + Math.cos(angle) * TURN_RADIUS, .4, -HIGHWAY_EXIT_START - Math.sin(angle) * TURN_RADIUS);
  }
  const crossTownZ = -HIGHWAY_EXIT_START - TURN_RADIUS;
  if (p < CENTRAL_PARK_WEST_TURN_START) return new THREE.Vector3(-TURN_RADIUS - (p - CROSSTOWN_START), .4, crossTownZ);
  const secondTurnX = -TURN_RADIUS - CROSSTOWN_LENGTH;
  if (p < CENTRAL_PARK_WEST_START) {
    const angle = (p - CENTRAL_PARK_WEST_TURN_START) / TURN_RADIUS;
    return new THREE.Vector3(secondTurnX - Math.sin(angle) * TURN_RADIUS, .4, crossTownZ - (1 - Math.cos(angle)) * TURN_RADIUS);
  }
  return new THREE.Vector3(secondTurnX - TURN_RADIUS, .4, crossTownZ - TURN_RADIUS - (p - CENTRAL_PARK_WEST_START));
}

function routeFrame(progress: number) {
  const before = routeCenter(Math.max(0, progress - .5)), after = routeCenter(Math.min(CITY_BUS_ROUTE_LENGTH, progress + .5));
  const tangent = after.sub(before).setY(0).normalize();
  const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
  const yaw = Math.atan2(-tangent.x, -tangent.z);
  return { center: routeCenter(progress), tangent, right, yaw };
}

const CROSSTOWN_Z = -HIGHWAY_EXIT_START - TURN_RADIUS;
const CENTRAL_PARK_WEST_X = -TURN_RADIUS - CROSSTOWN_LENGTH - TURN_RADIUS;
const CENTRAL_PARK_WEST_NORTH_Z = CROSSTOWN_Z - TURN_RADIUS;
const AMNH_BUS_BAY = new THREE.Vector3(CENTRAL_PARK_WEST_X + 6.8, .4, CENTRAL_PARK_WEST_NORTH_Z - 52);

// Local deterministic street graph traced from OpenStreetMap topology around
// the West 79th Street Henry Hudson exit and AMNH. Distances are compressed
// for play, while west-to-east avenue order and the W 72–81 grid stay true.
const UWS_AVENUES = [
  { x: 0, name: "West Side Highway" },
  { x: -46, name: "Riverside Drive" },
  { x: -92, name: "West End Avenue" },
  { x: -146, name: "Broadway" },
  { x: -202, name: "Amsterdam Avenue" },
  { x: -250, name: "Columbus Avenue" },
  { x: CENTRAL_PARK_WEST_X, name: "Central Park West" },
] as const;
const UWS_CROSS_STREETS = [
  { z: -2494, name: "West 81st Street" },
  { z: -2534, name: "West 80th Street" },
  { z: CROSSTOWN_Z, name: "West 79th Street" },
  { z: -2614, name: "West 78th Street" },
  { z: -2654, name: "West 77th Street" },
  { z: -2694, name: "West 76th Street" },
  { z: -2734, name: "West 75th Street" },
  { z: -2774, name: "West 74th Street" },
  { z: -2814, name: "West 73rd Street" },
  { z: -2854, name: "West 72nd Street" },
] as const;

function primaryRoadName(progress: number) {
  return ROUTE_LEGS.find(leg => progress >= leg.from && progress < leg.to)?.name ?? "Central Park West";
}

function displayRoadName(name: string) { return name === "Central Park West Turn" ? "Central Park West" : name; }

function buildDriveRoads() {
  const anchors = new Set<number>();
  for (let progress = 0; progress <= CITY_BUS_ROUTE_LENGTH; progress += 18) anchors.add(Math.min(progress, CITY_BUS_ROUTE_LENGTH));
  for (const progress of [
    0, HIGHWAY_START, HIGHWAY_EXIT_START, CROSSTOWN_START,
    ...[-46, -92, -146, -202, -250, -274].map(x => CROSSTOWN_START + Math.abs(x + TURN_RADIUS)),
    CROSSTOWN_START + 80, CROSSTOWN_START + 166, CENTRAL_PARK_WEST_TURN_START,
    CENTRAL_PARK_WEST_START, CENTRAL_PARK_WEST_START + 52,
    CENTRAL_PARK_WEST_START + 132, CENTRAL_PARK_WEST_START + 212,
    CITY_BUS_ROUTE_LENGTH,
  ]) anchors.add(progress);
  const ordered = [...anchors].sort((a, b) => a - b), roads: DriveRoad[] = [];
  for (let index = 0; index < ordered.length - 1; index++) {
    const from = ordered[index], to = ordered[index + 1], middle = (from + to) * .5;
    roads.push({
      id: `recommended-route-${index + 1}`,
      name: primaryRoadName(middle),
      start: routeCenter(from), end: routeCenter(to),
      halfWidth: middle >= CROSSTOWN_START ? 8.1 : 10.75,
      speedLimit: middle >= 420 && middle < HIGHWAY_EXIT_START ? HIGHWAY_TOP_SPEED : STREET_TOP_SPEED,
      primaryFrom: from, primaryTo: to,
    });
  }
  const add = (id: string, name: string, start: [number, number], end: [number, number], halfWidth = 8.1, speedLimit = STREET_TOP_SPEED) => roads.push({
    id, name,
    start: new THREE.Vector3(start[0], .4, start[1]),
    end: new THREE.Vector3(end[0], .4, end[1]),
    halfWidth, speedLimit,
  });
  add("missed-w79-highway", "West Side Highway · Southbound", [0, -HIGHWAY_EXIT_START], [0, -2854], 10.75, HIGHWAY_TOP_SPEED);
  const avenueBreaks = [...new Set([...UWS_CROSS_STREETS.map(street => street.z), CENTRAL_PARK_WEST_NORTH_Z])].sort((a, b) => b - a);
  for (const avenue of UWS_AVENUES.slice(1)) {
    for (let index = 0; index < avenueBreaks.length - 1; index++) {
      add(`${avenue.name.toLowerCase().replaceAll(" ", "-")}-${index}`, avenue.name, [avenue.x, avenueBreaks[index]], [avenue.x, avenueBreaks[index + 1]]);
    }
  }
  const avenueBreakpoints = [0, -24, ...UWS_AVENUES.slice(1).map(avenue => avenue.x), -274, CENTRAL_PARK_WEST_X].sort((a, b) => b - a);
  for (const street of UWS_CROSS_STREETS) for (let index = 0; index < avenueBreakpoints.length - 1; index++) {
    add(`${street.name.toLowerCase().replaceAll(" ", "-")}-${index}`, street.name, [avenueBreakpoints[index], street.z], [avenueBreakpoints[index + 1], street.z]);
  }
  return roads;
}

const DRIVE_ROADS = buildDriveRoads();

const UWS_TRAFFIC_LOOPS = [
  [new THREE.Vector3(0, .4, CROSSTOWN_Z), new THREE.Vector3(0, .4, -2854), new THREE.Vector3(-92, .4, -2854), new THREE.Vector3(-92, .4, CROSSTOWN_Z)],
  [new THREE.Vector3(-92, .4, CROSSTOWN_Z), new THREE.Vector3(-92, .4, -2654), new THREE.Vector3(-202, .4, -2654), new THREE.Vector3(-202, .4, CROSSTOWN_Z)],
  [new THREE.Vector3(-202, .4, -2654), new THREE.Vector3(-202, .4, -2734), new THREE.Vector3(CENTRAL_PARK_WEST_X, .4, -2734), new THREE.Vector3(CENTRAL_PARK_WEST_X, .4, -2654)],
  [new THREE.Vector3(-146, .4, -2734), new THREE.Vector3(-146, .4, -2814), new THREE.Vector3(-250, .4, -2814), new THREE.Vector3(-250, .4, -2734)],
] as const;

function closedPathFrame(points: readonly THREE.Vector3[], distance: number) {
  const lengths = points.map((point, index) => point.distanceTo(points[(index + 1) % points.length]));
  const total = lengths.reduce((sum, length) => sum + length, 0);
  let cursor = ((distance % total) + total) % total;
  for (let index = 0; index < points.length; index++) {
    if (cursor > lengths[index]) { cursor -= lengths[index]; continue; }
    const start = points[index], end = points[(index + 1) % points.length], tangent = end.clone().sub(start).setY(0).normalize();
    const center = start.clone().addScaledVector(tangent, cursor), right = new THREE.Vector3(-tangent.z, 0, tangent.x);
    return { center, tangent, right, yaw: Math.atan2(-tangent.x, -tangent.z), total };
  }
  return { center: points[0].clone(), tangent: new THREE.Vector3(0, 0, -1), right: new THREE.Vector3(1, 0, 0), yaw: 0, total };
}

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([24, 36, 42, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("City bus world requires a 2D canvas context");
  draw(context); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

function signTexture(title: string, subtitle: string) {
  return canvasTexture(1024, 384, context => {
    context.fillStyle = "#123f2f"; context.fillRect(0, 0, 1024, 384);
    context.strokeStyle = "#f0f4df"; context.lineWidth = 15; context.strokeRect(18, 18, 988, 348);
    context.fillStyle = "#ffffff"; context.textAlign = "center"; context.textBaseline = "middle";
    const fittedSize = (text: string, start: number, minimum: number, weight: number, maxWidth: number) => {
      let size = start;
      while (size > minimum) {
        context.font = `${weight} ${size}px Helvetica, Arial, sans-serif`;
        if (context.measureText(text).width <= maxWidth) break;
        size -= 2;
      }
      return size;
    };
    const titleSize = fittedSize(title, 78, 38, 700, 880);
    context.font = `700 ${titleSize}px Helvetica, Arial, sans-serif`; context.fillText(title, 512, 145, 880);
    context.fillStyle = "#d3e7d0";
    const subtitleSize = fittedSize(subtitle, 35, 22, 600, 880);
    context.font = `600 ${subtitleSize}px Helvetica, Arial, sans-serif`; context.fillText(subtitle, 512, 252, 880);
  });
}

function streetBladeTexture(label: string) {
  return canvasTexture(512, 128, context => {
    context.fillStyle = "#174c37"; context.fillRect(0, 0, 512, 128);
    context.strokeStyle = "#e6eee3"; context.lineWidth = 7; context.strokeRect(8, 8, 496, 112);
    context.fillStyle = "#fff"; context.textAlign = "center"; context.textBaseline = "middle";
    context.font = "700 44px Helvetica, Arial, sans-serif"; context.fillText(label.toUpperCase(), 256, 66, 460);
  });
}

function windowTexture() {
  return canvasTexture(512, 512, context => {
    context.fillStyle = "#9a8d7f"; context.fillRect(0, 0, 512, 512);
    // A compact prewar masonry façade tile: stone courses, inset bays,
    // lintels/sills, mullions, curtains and a restrained mix of lit rooms.
    // The prior texture was a field of tiny glowing dots, which made every
    // block read as the same generic office tower from the driver's seat.
    context.lineWidth = 1;
    for (let y = 0; y < 512; y += 16) {
      context.strokeStyle = y % 32 ? "rgba(46,40,35,.13)" : "rgba(255,244,224,.13)";
      context.beginPath(); context.moveTo(0, y + .5); context.lineTo(512, y + .5); context.stroke();
      for (let x = y % 32 ? -34 : 0; x < 512; x += 68) {
        context.strokeStyle = "rgba(46,40,35,.085)";
        context.beginPath(); context.moveTo(x + .5, y); context.lineTo(x + .5, y + 16); context.stroke();
      }
    }
    for (let floor = 0; floor < 7; floor++) for (let bay = 0; bay < 4; bay++) {
      const x = 25 + bay * 126, y = 22 + floor * 70;
      const lit = (floor * 11 + bay * 7) % 9 < 3;
      context.fillStyle = "rgba(49,43,39,.5)"; context.fillRect(x - 7, y - 7, 91, 57);
      context.fillStyle = lit ? "#d7b77a" : "#4b6770"; context.fillRect(x, y, 77, 43);
      const windowGradient = context.createLinearGradient(x, y, x + 77, y + 43);
      windowGradient.addColorStop(0, lit ? "rgba(255,236,179,.55)" : "rgba(179,212,219,.28)");
      windowGradient.addColorStop(.48, "rgba(21,34,39,.18)");
      windowGradient.addColorStop(1, "rgba(8,16,20,.48)");
      context.fillStyle = windowGradient; context.fillRect(x, y, 77, 43);
      context.fillStyle = "rgba(40,43,42,.75)"; context.fillRect(x + 37, y, 3, 43);
      context.fillRect(x, y + 21, 77, 3);
      context.fillStyle = "rgba(230,220,199,.72)"; context.fillRect(x - 4, y + 46, 85, 5);
      if ((floor + bay) % 5 === 0) {
        context.fillStyle = "rgba(216,206,186,.46)"; context.fillRect(x + 4, y + 4, 27, 16);
      }
    }
  });
}

function roadSurfaceTexture() {
  return canvasTexture(1024, 1024, context => {
    context.fillStyle = "#4a4f50"; context.fillRect(0, 0, 1024, 1024);
    // Deterministic aggregate, patched seams and tire-darkened lanes keep the
    // road from reading as one flat gray plane at windshield distance.
    for (let index = 0; index < 5200; index++) {
      const x = index * 193 % 1024, y = index * 433 % 1024, value = 45 + index * 17 % 42;
      context.fillStyle = `rgba(${value},${value + 2},${value + 3},${.08 + index % 5 * .018})`;
      context.fillRect(x, y, 1 + index % 3, 1 + index % 2);
    }
    context.strokeStyle = "rgba(24,28,29,.24)"; context.lineWidth = 7;
    for (let index = 0; index < 9; index++) {
      context.beginPath(); context.moveTo(index * 137 - 50, 0);
      context.bezierCurveTo(index * 137 + 40, 260, index * 137 - 70, 710, index * 137 + 26, 1024); context.stroke();
    }
    context.fillStyle = "rgba(23,26,27,.12)";
    for (const x of [268, 756]) context.fillRect(x, 0, 94, 1024);
  });
}

function setShadows(root: THREE.Object3D, enabled: boolean) {
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = enabled; object.receiveShadow = true; } });
}

function addCitySky(root: THREE.Group) {
  const sky = new Sky();
  sky.name = "bronx-manhattan-atmospheric-evening-sky";
  sky.scale.setScalar(720);
  sky.frustumCulled = false;
  sky.onBeforeRender = (_renderer, _scene, camera) => {
    sky.position.copy(camera.position);
    sky.updateMatrixWorld(true);
  };
  sky.material.uniforms.turbidity.value = 8.2;
  sky.material.uniforms.rayleigh.value = 1.75;
  sky.material.uniforms.mieCoefficient.value = .012;
  sky.material.uniforms.mieDirectionalG.value = .88;
  sky.material.uniforms.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(79), THREE.MathUtils.degToRad(236));
  root.add(sky);
}

function makeBus(quality: number, textures: GameTextures, passengerTextures: THREE.Texture[]): BuiltBus {
  const root = new THREE.Group(); root.name = "bronx-to-amnh-rescue-shuttle-bus";
  const yellow = new THREE.MeshPhysicalMaterial({ color: "#e0ad22", roughness: .48, clearcoat: .5, clearcoatRoughness: .3 });
  const dark = new THREE.MeshStandardMaterial({ color: "#171d1e", roughness: .62 });
  const metal = new THREE.MeshStandardMaterial({ color: "#778184", roughness: .28, metalness: .7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#9ac0c8", roughness: .1, transmission: .52, transparent: true, opacity: .3, metalness: .03, depthWrite: false });
  glass.forceSinglePass = true;
  const rubber = new THREE.MeshStandardMaterial({ color: "#101112", roughness: .92 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(3.05, 2.05, 7.8, 8, .22), yellow); body.position.y = 1.65; body.name = "rescue-bus-continuous-coach-body"; root.add(body);
  const lower = new THREE.Mesh(new RoundedBoxGeometry(3.14, .68, 7.9, 6, .16), dark); lower.position.y = .72; root.add(lower);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(3.08, .24, 7.55, 7, .12), yellow); roof.position.y = 2.82; root.add(roof);
  const windshield = new THREE.Mesh(new RoundedBoxGeometry(2.55, 1.25, .07, 5, .04), glass); windshield.position.set(0, 2.02, -3.92); windshield.rotation.x = -.08; windshield.name = "rescue-bus-panoramic-windshield"; root.add(windshield);
  for (const side of [-1, 1]) for (let row = 0; row < 4; row++) {
    const window = new THREE.Mesh(new RoundedBoxGeometry(.07, 1.08, 1.35, 4, .035), glass);
    window.position.set(side * 1.55, 2.05, -2.35 + row * 1.55); root.add(window);
  }
  const destinationTexture = signTexture("MUSEUM SHUTTLE", "BRONX ZOO  →  AMNH");
  passengerTextures.push(destinationTexture);
  const destination = new THREE.Mesh(new RoundedBoxGeometry(1.08, .17, .045, 4, .02), new THREE.MeshBasicMaterial({ map: destinationTexture, toneMapped: false }));
  // Keep the route box in the header above the driver's eye line; it should
  // identify the vehicle without becoming a billboard across the windshield.
  destination.position.set(.42, 2.78, -3.965); root.add(destination);
  const wheelGeometry = new THREE.CylinderGeometry(.49, .49, .32, quality > .75 ? 28 : 18);
  for (const side of [-1, 1]) for (const z of [-2.5, 2.45]) {
    const wheel = new THREE.Mesh(wheelGeometry, rubber); wheel.rotation.z = Math.PI / 2; wheel.position.set(side * 1.58, .55, z); wheel.name = "rescue-bus-road-wheel"; root.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .34, 18), metal); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); root.add(hub);
  }
  const dashboard = new THREE.Mesh(new RoundedBoxGeometry(2.7, .5, .72, 5, .08), dark); dashboard.position.set(0, 1.38, -3.48); root.add(dashboard);
  const steeringWheel = new THREE.Group();
  steeringWheel.name = "museum-shuttle-steering-wheel-assembly";
  steeringWheel.position.set(-.82, 1.74, -3.28);
  steeringWheel.rotation.x = -.25;
  const steeringRim = new THREE.Mesh(new THREE.TorusGeometry(.235, .034, 12, 36), rubber);
  steeringRim.name = "museum-shuttle-steering-wheel-rim";
  steeringWheel.add(steeringRim);
  for (const angle of [0, Math.PI * 2 / 3, Math.PI * 4 / 3]) {
    const end = new THREE.Vector3(Math.cos(angle) * .19, Math.sin(angle) * .19, 0);
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(.015, .018, end.length(), 9), metal);
    spoke.position.copy(end).multiplyScalar(.5);
    spoke.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().normalize());
    steeringWheel.add(spoke);
  }
  // The wrists sit just camera-side of the rim. Sloth claws project forward
  // from each wrist, so this clearance keeps the digits wrapped visibly over
  // the wheel instead of disappearing behind its silhouette in the cockpit.
  const leftGrip = new THREE.Object3D(); leftGrip.name = "museum-shuttle-steering-wheel-left-paw-grip"; leftGrip.position.set(-.205, .055, .19);
  const rightGrip = new THREE.Object3D(); rightGrip.name = "museum-shuttle-steering-wheel-right-paw-grip"; rightGrip.position.set(.205, .055, .19);
  steeringWheel.add(leftGrip, rightGrip);
  root.add(steeringWheel);

  for (let row = 0; row < 4; row++) for (const side of [-1, 1]) {
    const seat = new THREE.Mesh(new RoundedBoxGeometry(.64, .88, .68, 4, .08), new THREE.MeshStandardMaterial({ color: row % 2 ? "#315b69" : "#3b6d72", roughness: .8 }));
    seat.position.set(side * .78, 1.25, -.9 + row * 1.25); seat.name = "museum-shuttle-passenger-seat"; root.add(seat);
  }
  for (let index = 0; index < 4; index++) {
    const result = createPremiumSlothFriend(textures, quality, index, ["#514536", "#423a31", "#594936", "#443a30"][index]);
    result.root.name = "rescued-sloth-on-museum-shuttle-" + (index + 1);
    result.root.scale.multiplyScalar(.72); result.root.position.set(index % 2 ? .78 : -.78, 1.08, -.28 + Math.floor(index / 2) * 1.32); result.root.rotation.y = Math.PI;
    root.add(result.root); passengerTextures.push(...result.ownedTextures);
  }
  setShadows(root, quality > .58);
  return { root, steeringWheel, gripAnchors: [leftGrip, rightGrip] };
}

function makeTrafficCar(index: number, quality: number) {
  const root = new THREE.Group(); root.name = "new-york-stop-and-go-traffic-vehicle-" + (index + 1);
  const palette = ["#c7b329", "#2c5868", "#a8aaa5", "#812e2b", "#242a31", "#e7e4d8"];
  const paint = new THREE.MeshPhysicalMaterial({ color: palette[index % palette.length], roughness: .42, clearcoat: .58 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#75929c", roughness: .14, transparent: true, opacity: .72 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#111212", roughness: .95 });
  const chrome = new THREE.MeshStandardMaterial({ color: "#aeb5b5", roughness: .25, metalness: .78 });
  const headlamp = new THREE.MeshPhysicalMaterial({ color: "#fff3cf", emissive: "#ffd78a", emissiveIntensity: .9, roughness: .18, clearcoat: .65 });
  const tailLamp = new THREE.MeshPhysicalMaterial({ color: "#a91f19", emissive: "#6f0806", emissiveIntensity: .42, roughness: .25, clearcoat: .55 });
  const chassis = new THREE.Mesh(new RoundedBoxGeometry(1.76, .48, 3.82, 6, .14), paint); chassis.position.y = .58; root.add(chassis);
  const hood = new THREE.Mesh(new RoundedBoxGeometry(1.66, .34, 1.38, 5, .12), paint); hood.position.set(0, .84, -1.18); root.add(hood);
  const trunk = new THREE.Mesh(new RoundedBoxGeometry(1.68, .4, 1.02, 5, .12), paint); trunk.position.set(0, .87, 1.43); root.add(trunk);
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.49, .72, 1.88, 6, .16), glass); cabin.position.set(0, 1.18, -.1); root.add(cabin);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.38, .11, 1.35, 4, .05), paint); roof.position.set(0, 1.55, -.08); root.add(roof);
  // Painted pillars and window rails prevent the transparent cabin from
  // reading as a single aquarium block.
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new RoundedBoxGeometry(.055, .13, 1.82, 3, .02), paint); rail.position.set(side * .755, 1.16, -.08); root.add(rail);
    for (const z of [-.73, .58]) {
      const pillar = new THREE.Mesh(new RoundedBoxGeometry(.065, .68, .11, 3, .02), paint); pillar.position.set(side * .755, 1.18, z); root.add(pillar);
    }
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(.18, .11, .28, 4, .04), paint); mirror.position.set(side * .95, 1.08, -.72); root.add(mirror);
  }
  const grille = new THREE.Mesh(new RoundedBoxGeometry(1.02, .18, .055, 3, .018), chrome); grille.position.set(0, .62, -1.9); root.add(grille);
  const rearBumper = new THREE.Mesh(new RoundedBoxGeometry(1.45, .13, .08, 3, .025), chrome); rearBumper.position.set(0, .47, 1.96); root.add(rearBumper);
  const licensePlate = new THREE.Mesh(new RoundedBoxGeometry(.42, .18, .035, 3, .012), new THREE.MeshStandardMaterial({ color: "#e7be47", roughness: .48 })); licensePlate.position.set(0, .69, 1.945); root.add(licensePlate);
  for (const side of [-1, 1]) {
    const light = new THREE.Mesh(new RoundedBoxGeometry(.32, .2, .07, 3, .025), headlamp); light.position.set(side * .58, .76, -1.91); root.add(light);
    const tail = new THREE.Mesh(new RoundedBoxGeometry(.3, .22, .07, 3, .025), tailLamp); tail.position.set(side * .6, .73, 1.9); root.add(tail);
  }
  if (index % 5 === 0) {
    const roofLight = new THREE.Mesh(new RoundedBoxGeometry(.62, .18, .3, 3, .04), new THREE.MeshStandardMaterial({ color: "#e8c230", emissive: "#a2710c", emissiveIntensity: .2 })); roofLight.position.set(0, 1.55, -.2); root.add(roofLight);
  }
  const wheel = new THREE.CylinderGeometry(.3, .3, .2, quality > .75 ? 20 : 14);
  for (const side of [-1, 1]) for (const z of [-1.2, 1.2]) {
    const tire = new THREE.Mesh(wheel, rubber); tire.rotation.z = Math.PI / 2; tire.position.set(side * .88, .4, z); root.add(tire);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .22, quality > .75 ? 16 : 10), chrome); hub.rotation.z = Math.PI / 2; hub.position.set(side * .89, .4, z); root.add(hub);
  }
  setShadows(root, quality > .65); return root;
}

function addRoadNetwork(root: THREE.Group, ownedTextures: THREE.Texture[], quality: number, textures: GameTextures, signals: TrafficSignal[]) {
  const roadTexture = roadSurfaceTexture(); roadTexture.wrapS = roadTexture.wrapT = THREE.RepeatWrapping; roadTexture.repeat.set(2, 8); roadTexture.anisotropy = 8; ownedTextures.push(roadTexture);
  const asphalt = new THREE.MeshStandardMaterial({ color: "#5a5e5f", map: roadTexture, bumpMap: roadTexture, bumpScale: .018, roughness: .94 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#8b8980", roughness: .9 });
  const lane = new THREE.MeshStandardMaterial({ color: "#ebe5c5", roughness: .75, emissive: "#4a4632", emissiveIntensity: .06 });
  // Opaque city ground closes the pale void that was visible between detached
  // building footprints. These slabs sit below every driveable surface and
  // establish continuous Bronx blocks and the Manhattan riverbank.
  const cityGround = new THREE.MeshStandardMaterial({ color: "#66665f", map: textures.ground, roughness: 1 });
  const bronxGround = new THREE.Mesh(new RoundedBoxGeometry(250, .28, HIGHWAY_START + 90, 3, .04), cityGround);
  bronxGround.name = "continuous-bronx-neighborhood-ground-plane"; bronxGround.position.set(0, -.27, -HIGHWAY_START * .5); root.add(bronxGround);
  const manhattanGround = new THREE.Mesh(new RoundedBoxGeometry(150, .28, HIGHWAY_EXIT_START - HIGHWAY_START + 120, 3, .04), cityGround);
  manhattanGround.name = "continuous-west-side-manhattan-ground-plane"; manhattanGround.position.set(-84, -.27, -(HIGHWAY_START + HIGHWAY_EXIT_START) * .5); root.add(manhattanGround);
  const upperWestSideGround = new THREE.Mesh(new RoundedBoxGeometry(338, .28, 430, 3, .04), cityGround);
  upperWestSideGround.name = "finite-no-void-upper-west-side-district-ground-plane";
  upperWestSideGround.position.set(CENTRAL_PARK_WEST_X * .5, -.27, -2674); root.add(upperWestSideGround);
  for (let progress = 0; progress < CITY_BUS_ROUTE_LENGTH; progress += 18) {
    const next = Math.min(CITY_BUS_ROUTE_LENGTH, progress + 18), middle = (progress + next) / 2, a = routeCenter(progress), b = routeCenter(next), frame = routeFrame(middle), length = a.distanceTo(b);
    const upperWestSide = middle >= CROSSTOWN_START, roadWidth = upperWestSide ? 16.2 : 21.5, sidewalkOffset = roadWidth * .5 + 2.55;
    const openGridJunction = middle >= CROSSTOWN_START && middle < CENTRAL_PARK_WEST_TURN_START && UWS_AVENUES.slice(1).some(avenue => Math.abs(frame.center.x - avenue.x) < 11)
      || middle >= CENTRAL_PARK_WEST_START && UWS_CROSS_STREETS.some(street => Math.abs(frame.center.z - street.z) < 11);
    const road = new THREE.Mesh(new RoundedBoxGeometry(roadWidth, .18, length + .8, 3, .04), asphalt); road.name = upperWestSide ? "upper-west-side-narrower-city-street-segment" : "compressed-nyc-road-segment"; road.position.copy(a).add(b).multiplyScalar(.5); road.position.y -= .08; road.rotation.y = frame.yaw; root.add(road);
    for (const side of openGridJunction ? [] : [-1, 1]) {
      const walk = new THREE.Mesh(new RoundedBoxGeometry(5.2, .28, length + .6, 3, .05), concrete); walk.position.copy(road.position).addScaledVector(frame.right, side * sidewalkOffset); walk.position.y += .07; walk.rotation.y = frame.yaw; root.add(walk);
      const barrier = new THREE.Mesh(new RoundedBoxGeometry(.28, .72, length + .25, 3, .05), concrete); barrier.position.copy(road.position).addScaledVector(frame.right, side * (roadWidth * .5 + .2)); barrier.position.y += .35; barrier.rotation.y = frame.yaw; root.add(barrier);
    }
    for (const offset of [-LANE_WIDTH * 1.5, -LANE_WIDTH * .5, LANE_WIDTH * .5, LANE_WIDTH * 1.5]) {
      const stripe = new THREE.Mesh(new RoundedBoxGeometry(.09, .025, length * .62, 2, .01), lane); stripe.position.copy(road.position).addScaledVector(frame.right, offset); stripe.position.y += .12; stripe.rotation.y = frame.yaw; root.add(stripe);
    }
  }
  // The trip now begins on actual Bronx surface streets: each controlled
  // intersection has a full cross street, curb returns and lane markings
  // before the expressway ramp. No traffic signals are authored on the river
  // highway itself.
  for (const [index, progress] of [150, 335, 565].entries()) {
    const frame = routeFrame(progress), cross = new THREE.Group(); cross.name = `bronx-surface-street-intersection-${index + 1}`;
    const road = new THREE.Mesh(new RoundedBoxGeometry(14.8, .16, 86, 3, .04), asphalt); road.name = "bronx-driveable-cross-street"; road.position.copy(frame.center); road.position.y -= .07; road.rotation.y = frame.yaw + Math.PI / 2; cross.add(road);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new RoundedBoxGeometry(4.5, .26, 86, 3, .05), concrete); walk.name = "bronx-cross-street-sidewalk-with-curb-return"; walk.position.copy(frame.center).addScaledVector(frame.tangent, side * 9.65); walk.position.y += .06; walk.rotation.y = frame.yaw + Math.PI / 2; cross.add(walk);
    }
    for (const offset of [-LANE_WIDTH * .5, LANE_WIDTH * .5]) {
      const marking = new THREE.Mesh(new RoundedBoxGeometry(.09, .025, 70, 2, .01), lane); marking.position.copy(frame.center).addScaledVector(frame.tangent, offset); marking.position.y += .12; marking.rotation.y = frame.yaw + Math.PI / 2; cross.add(marking);
    }
    root.add(cross);
  }
  for (const driveRoad of DRIVE_ROADS.filter(candidate => candidate.primaryFrom === undefined)) {
    const tangent = driveRoad.end.clone().sub(driveRoad.start).setY(0), length = tangent.length(); tangent.normalize();
    const right = new THREE.Vector3(-tangent.z, 0, tangent.x), yaw = Math.atan2(-tangent.x, -tangent.z), center = driveRoad.start.clone().add(driveRoad.end).multiplyScalar(.5);
    const roadWidth = driveRoad.halfWidth * 2;
    const road = new THREE.Mesh(new RoundedBoxGeometry(roadWidth, .18, length + 1.2, 3, .04), asphalt);
    road.name = `open-world-driveable-${driveRoad.id}`; road.position.copy(center); road.position.y -= .08; road.rotation.y = yaw; root.add(road);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new RoundedBoxGeometry(4.8, .28, Math.max(2, length - 18), 3, .05), concrete);
      walk.name = "upper-west-side-connected-sidewalk"; walk.position.copy(center).addScaledVector(right, side * (driveRoad.halfWidth + 2.45)); walk.position.y += .07; walk.rotation.y = yaw; root.add(walk);
    }
    const laneOffsets = driveRoad.halfWidth > 9 ? [-LANE_WIDTH * 1.5, -LANE_WIDTH * .5, LANE_WIDTH * .5, LANE_WIDTH * 1.5] : [-LANE_WIDTH * .5, LANE_WIDTH * .5];
    for (const offset of laneOffsets) {
      const stripe = new THREE.Mesh(new RoundedBoxGeometry(.09, .025, Math.max(2, length * .68), 2, .01), lane);
      stripe.name = "open-world-alternate-road-lane-marking"; stripe.position.copy(center).addScaledVector(right, offset); stripe.position.y += .12; stripe.rotation.y = yaw; root.add(stripe);
    }
  }
  const signalMetal = new THREE.MeshStandardMaterial({ color: "#26302f", metalness: .7, roughness: .35 });
  const signalHousing = new THREE.MeshStandardMaterial({ color: "#151b19", metalness: .42, roughness: .48 });
  for (const stop of SIGNAL_STOPS) {
    const frame = routeFrame(stop);
    const crossing = new THREE.Group(); crossing.name = "new-york-signalized-crosswalk";
    // NYC ladder crossing: two full-width boundary lines and separated bars
    // across the pedestrian path. The old longitudinal comb collapsed into a
    // single white slab at driving distance.
    for (const longitudinal of [-2.4, 2.4]) {
      const boundary = new THREE.Mesh(new RoundedBoxGeometry(19.2, .026, .2, 2, .012), lane);
      boundary.name = "nyc-crosswalk-full-width-boundary-line";
      boundary.position.copy(frame.center).addScaledVector(frame.tangent, longitudinal);
      boundary.position.y += .132; boundary.rotation.y = frame.yaw; crossing.add(boundary);
    }
    for (let stripe = -3; stripe <= 3; stripe++) {
      const mark = new THREE.Mesh(new RoundedBoxGeometry(18.4, .024, .34, 2, .012), lane);
      mark.name = "nyc-crosswalk-separated-ladder-bar";
      mark.position.copy(frame.center).addScaledVector(frame.tangent, stripe * .62);
      mark.position.y += .134; mark.rotation.y = frame.yaw; crossing.add(mark);
    }
    const lenses = {
      RED: signalLensMaterial("RED"),
      YELLOW: signalLensMaterial("YELLOW"),
      GREEN: signalLensMaterial("GREEN"),
    } satisfies Record<TrafficSignalAspect, THREE.MeshStandardMaterial>;
    // Signals belong on the near side of the intersection. The crosswalk stays
    // centered on the junction while the mast arms and stop logic sit twelve
    // metres upstream in the shuttle's direction of travel.
    const signalAnchor = frame.center.clone().addScaledVector(frame.tangent, -12);
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .11, 5.2, 10), signalMetal);
      pole.name = "nyc-near-side-before-intersection-signal-pole"; pole.position.copy(signalAnchor).addScaledVector(frame.right, side * 10.25); pole.position.y += 2.6; crossing.add(pole);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, 4.7, 9), signalMetal);
      arm.position.copy(pole.position).addScaledVector(frame.right, -side * 2.25).add(new THREE.Vector3(0, 2.25, 0)); arm.rotation.z = Math.PI / 2; crossing.add(arm);
      const housing = new THREE.Mesh(new RoundedBoxGeometry(.46, 1.18, .34, 4, .045), signalHousing);
      housing.position.copy(arm.position).addScaledVector(frame.right, -side * 2.15).add(new THREE.Vector3(0, -.42, 0)); housing.rotation.y = frame.yaw; crossing.add(housing);
      (["RED", "YELLOW", "GREEN"] as const).forEach((aspect, lensIndex) => {
        const light = new THREE.Mesh(new THREE.CircleGeometry(.19, 24), lenses[aspect]);
        light.name = `nyc-traffic-signal-${aspect.toLowerCase()}-lens`;
        light.position.copy(housing.position).add(new THREE.Vector3(0, .34 - lensIndex * .34, 0)).addScaledVector(frame.tangent, -.181);
        light.rotation.set(0, frame.yaw, 0); crossing.add(light);
        const visor = new THREE.Mesh(new THREE.TorusGeometry(.2, .028, 8, 24, Math.PI), signalHousing);
        visor.name = "nyc-traffic-signal-lens-visor";
        visor.position.copy(light.position).add(new THREE.Vector3(0, .045, 0)).addScaledVector(frame.tangent, -.012);
        visor.rotation.set(0, frame.yaw, Math.PI); crossing.add(visor);
      });
    }
    signals.push({ progress: stop, lenses });
    root.add(crossing);
  }
  const windows = windowTexture(); windows.wrapS = windows.wrapT = THREE.RepeatWrapping; windows.repeat.set(1, 2.25); ownedTextures.push(windows);
  const buildingMaterials = ["#a99583", "#93877b", "#817d78", "#b39d85", "#77716c"].map(color => new THREE.MeshStandardMaterial({ color, map: windows, emissive: "#493b2a", emissiveIntensity: .08, roughness: .84 }));
  const corniceMaterials = ["#aaa08d", "#6f675e"].map(color => new THREE.MeshStandardMaterial({ color, roughness: .85 }));
  const baseMaterials = ["#403f3b", "#6f6458", "#514b45"].map(color => new THREE.MeshStandardMaterial({ color, map: textures.stone, bumpMap: textures.stone, bumpScale: .025, roughness: .9 }));
  const storefrontMaterials = ["#7fa2a7", "#b49065", "#648b84", "#8e6b82"].map(color => new THREE.MeshPhysicalMaterial({ color, roughness: .2, transmission: .12, transparent: true, opacity: .82, metalness: .06 }));
  const fireEscapeMaterial = new THREE.MeshStandardMaterial({ color: "#242a29", roughness: .56, metalness: .68 });
  const buildingCount = quality < .58 ? 82 : quality < .82 ? 124 : 168;
  for (let index = 0; index < buildingCount; index++) {
    const progress = 18 + index / Math.max(1, buildingCount - 1) * (CITY_BUS_ROUTE_LENGTH - 36), frame = routeFrame(progress), side = index % 2 ? 1 : -1, groundY = frame.center.y;
    const onRiverHighway = progress >= HIGHWAY_START && progress < HIGHWAY_EXIT_START;
    const onCentralParkWest = progress >= CENTRAL_PARK_WEST_START;
    const nearCrosstownJunction = progress >= CROSSTOWN_START && progress < CENTRAL_PARK_WEST_TURN_START && UWS_AVENUES.slice(1).some(avenue => Math.abs(frame.center.x - avenue.x) < 11);
    const nearAvenueJunction = onCentralParkWest && UWS_CROSS_STREETS.some(street => Math.abs(frame.center.z - street.z) < 11);
    // Southbound, the Hudson is on the driver's right and the Manhattan
    // street wall is on the left. Central Park replaces the left street wall
    // after the second turn, while the museum blocks remain on the right.
    if (onRiverHighway && side === 1 || onCentralParkWest && side === -1 || nearCrosstownJunction || nearAvenueJunction) continue;
    const urban = progress > 700, width = 7 + index % 5 * 2.2, depth = 7 + index % 4 * 2.6, height = urban ? 15 + index % 9 * 5.2 : 7 + index % 6 * 3.1;
    const building = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, .16), buildingMaterials[index % buildingMaterials.length]);
    building.name = urban ? "west-side-manhattan-streetwall" : "bronx-neighborhood-building";
    const cityStreet = progress >= CROSSTOWN_START, setback = cityStreet ? 12.3 : 17;
    building.position.copy(frame.center).addScaledVector(frame.right, side * (setback + depth * .5 + index % 3 * (cityStreet ? .8 : 2.5))); building.position.y += height * .5 - .05; building.rotation.y = frame.yaw; root.add(building);
    if (urban || index % 3 === 0) {
      const cornice = new THREE.Mesh(new RoundedBoxGeometry(width + .45, .34, depth + .45, 3, .045), corniceMaterials[index % 2]);
      cornice.name = "new-york-masonry-cornice"; cornice.position.copy(building.position); cornice.position.y += height * .5 + .12; cornice.rotation.y = frame.yaw; root.add(cornice);
    }
    const groundFloor = new THREE.Mesh(new RoundedBoxGeometry(.24, 2.75, depth * .94, 4, .045), baseMaterials[index % baseMaterials.length]);
    groundFloor.name = "new-york-articulated-streetwall-base";
    groundFloor.position.copy(building.position).addScaledVector(frame.right, -side * (width * .5 + .03)); groundFloor.position.y = groundY + 1.37; groundFloor.rotation.y = frame.yaw; root.add(groundFloor);
    if (urban && index % 2 === 0) {
      const storefront = new THREE.Mesh(new RoundedBoxGeometry(.16, 2.18, depth * .72, 4, .035), storefrontMaterials[index % storefrontMaterials.length]);
      storefront.name = "upper-west-side-ground-floor-storefront";
      storefront.position.copy(building.position).addScaledVector(frame.right, -side * (width * .5 + .16)); storefront.position.y = groundY + 1.28; storefront.rotation.y = frame.yaw; root.add(storefront);
    }
    if (urban && index % 4 === 0) {
      for (const y of [5.1, 8.6, 12.1].filter(value => value < height - 1.4)) {
        const landing = new THREE.Mesh(new RoundedBoxGeometry(.62, .08, depth * .48, 2, .018), fireEscapeMaterial);
        landing.name = "upper-west-side-fire-escape-landing";
        landing.position.copy(building.position).addScaledVector(frame.right, -side * (width * .5 + .36)); landing.position.y = groundY + y; landing.rotation.y = frame.yaw; root.add(landing);
        for (const along of [-.22, .22]) {
          const rail = new THREE.Mesh(new RoundedBoxGeometry(.035, .82, depth * .48, 2, .01), fireEscapeMaterial);
          rail.position.copy(landing.position).addScaledVector(frame.right, -side * along); rail.position.y += .42; rail.rotation.y = frame.yaw; root.add(rail);
        }
      }
    }
    if (index % 7 === 0) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.35, 2.1, 14), new THREE.MeshStandardMaterial({ color: "#4e3c2d", roughness: .93 })); tank.position.copy(building.position); tank.position.y += height * .5 + 1.15; root.add(tank);
    }
  }
  // A continuous two-depth street wall replaces the isolated boxes and white
  // gaps on the driver's left along the West Side Highway. The foreground
  // podiums, varied setbacks, roof plant and water towers are deliberately
  // contiguous at speed; the second row carries the skyline into the haze.
  const highwayPodium = new THREE.Mesh(new RoundedBoxGeometry(9.5, 5.2, HIGHWAY_EXIT_START - HIGHWAY_START + 42, 4, .08), baseMaterials[1]);
  highwayPodium.name = "west-side-highway-continuous-manhattan-streetwall-podium"; highwayPodium.position.set(-15.9, 2.5, -(HIGHWAY_START + HIGHWAY_EXIT_START) * .5); root.add(highwayPodium);
  const highwayBlockCount = Math.ceil((HIGHWAY_EXIT_START - HIGHWAY_START) / 24);
  for (let index = 0; index < highwayBlockCount; index++) {
    const z = -HIGHWAY_START - 12 - index * 24, foregroundHeight = 24 + index % 8 * 5.4;
    const foreground = new THREE.Mesh(new RoundedBoxGeometry(18 + index % 3 * 3.2, foregroundHeight, 25.2, 4, .16), buildingMaterials[(index + 2) % buildingMaterials.length]);
    foreground.name = "dense-west-side-highway-riverfront-building"; foreground.position.set(-25.2 - index % 3 * 1.8, foregroundHeight * .5, z); root.add(foreground);
    const cornice = new THREE.Mesh(new RoundedBoxGeometry(18.5 + index % 3 * 3.2, .42, 25.6, 3, .045), corniceMaterials[index % corniceMaterials.length]);
    cornice.position.copy(foreground.position); cornice.position.y += foregroundHeight * .5 + .12; root.add(cornice);
    if (index % 2 === 0) {
      const towerHeight = 35 + index % 6 * 8.5;
      const tower = new THREE.Mesh(new RoundedBoxGeometry(23 + index % 4 * 3, towerHeight, 27, 4, .18), buildingMaterials[(index + 4) % buildingMaterials.length]);
      tower.name = "west-side-highway-layered-background-skyline-tower"; tower.position.set(-58 - index % 4 * 8, towerHeight * .5, z - 5); root.add(tower);
      if (index % 6 === 0) {
        const tank = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.65, 2.4, 14), new THREE.MeshStandardMaterial({ color: "#4b392b", roughness: .94 }));
        tank.name = "west-side-highway-rooftop-water-tank"; tank.position.set(tower.position.x, towerHeight + 1.3, tower.position.z); root.add(tank);
      }
    }
  }
  const highwayLampMaterial = new THREE.MeshStandardMaterial({ color: "#26302f", metalness: .68, roughness: .36 });
  const highwayLampGlow = new THREE.MeshStandardMaterial({ color: "#f7e6b0", emissive: "#ffd279", emissiveIntensity: 1.7, roughness: .22 });
  for (let index = 0; index < 34; index++) {
    const z = -HIGHWAY_START - 26 - index * 48;
    for (const x of [-10.9, 14.8]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.055, .09, 6.4, 9), highwayLampMaterial); pole.name = "west-side-highway-roadway-light-not-traffic-signal"; pole.position.set(x, 3.2, z); root.add(pole);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), highwayLampGlow); lamp.position.set(x, 6.42, z); root.add(lamp);
    }
  }
  const blockAvenues = [...UWS_AVENUES.slice(1)].sort((a, b) => a.x - b.x);
  const blockX = blockAvenues.slice(0, -1).map((avenue, index) => [avenue.x, blockAvenues[index + 1].x] as const);
  const blockZ = UWS_CROSS_STREETS.slice(0, -1).map((street, index) => [street.z, UWS_CROSS_STREETS[index + 1].z] as const);
  let blockIndex = 0;
  for (const [west, east] of blockX) for (const [north, south] of blockZ) {
    // Reserve the real W 77–81 superblock between Columbus and CPW for the
    // museum campus instead of filling it with apartment towers.
    if (west === CENTRAL_PARK_WEST_X && north >= -2654) continue;
    const blockWidth = east - west - 16, blockDepth = Math.abs(south - north) - 14, centerX = (west + east) * .5;
    const buildingRows = quality < .58 ? [-1] : [-1, 1];
    for (const side of buildingRows) {
      const depth = Math.max(9, blockDepth * (quality < .58 ? .78 : .42)), height = 21 + blockIndex % 7 * 4.8 + (side > 0 ? 3.5 : 0);
      const building = new THREE.Mesh(new RoundedBoxGeometry(blockWidth, height, depth, 4, .18), buildingMaterials[(blockIndex + (side > 0 ? 2 : 0)) % buildingMaterials.length]);
      building.name = "osm-referenced-finite-upper-west-side-articulated-block-building";
      building.position.set(centerX, height * .5, THREE.MathUtils.lerp(north, south, side < 0 ? .27 : .73)); root.add(building);
      const cornice = new THREE.Mesh(new RoundedBoxGeometry(blockWidth + .5, .42, depth + .5, 3, .055), corniceMaterials[blockIndex % corniceMaterials.length]);
      cornice.position.copy(building.position); cornice.position.y += height * .5 + .08; root.add(cornice);
      if (quality > .56) {
        const shops = new THREE.Mesh(new RoundedBoxGeometry(blockWidth * .82, 2.4, .18, 4, .045), storefrontMaterials[blockIndex % storefrontMaterials.length]);
        shops.name = "open-world-upper-west-side-cafe-and-shopfront-row"; shops.position.set(centerX, 1.3, building.position.z + (side < 0 ? depth * .5 + .12 : -depth * .5 - .12)); root.add(shops);
      }
      blockIndex++;
    }
  }
  const reviewedAvenues = UWS_AVENUES.slice(1);
  const reviewedStreets = UWS_CROSS_STREETS.filter((_, index) => [0, 2, 4, 6, 9].includes(index));
  const shortAvenue = (name: string) => name === "Central Park West" ? "Central Park W" : name.replace("Avenue", "Av").replace("Drive", "Dr");
  const shortStreet = (name: string) => name.replace("West ", "W ").replace("th Street", " St").replace("st Street", " St").replace("nd Street", " St").replace("rd Street", " St");
  const bladeLabels = [...reviewedAvenues.map(avenue => shortAvenue(avenue.name)), ...reviewedStreets.map(street => shortStreet(street.name))];
  const bladeTextures = new Map(bladeLabels.map(label => { const texture = streetBladeTexture(label); ownedTextures.push(texture); return [label, texture] as const; }));
  const intersections = reviewedAvenues.map(avenue => ({ x: avenue.x, avenue: shortAvenue(avenue.name) }));
  const crossingStreets = reviewedStreets.map(street => ({ z: street.z, name: shortStreet(street.name) }));
  const crossingStripeCount = quality < .58 ? 3 : 5, crosswalkDummy = new THREE.Object3D(); let crosswalkIndex = 0;
  const crosswalks = new THREE.InstancedMesh(new RoundedBoxGeometry(.72, .026, 12.8, 2, .01), lane, intersections.length * crossingStreets.length * crossingStripeCount * 4);
  crosswalks.name = "performance-instanced-open-world-upper-west-side-zebra-crosswalks"; crosswalks.receiveShadow = true;
  const streetLampSurface = new THREE.MeshStandardMaterial({ color: "#f8e8b0", emissive: "#ffd36e", emissiveIntensity: 1.6, roughness: .25 });
  const hydrantSurface = new THREE.MeshStandardMaterial({ color: "#a7332b", roughness: .62, metalness: .22 });
  for (const intersection of intersections) for (const street of crossingStreets) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.065, .09, 4.4, 10), signalMetal); pole.name = "open-world-nyc-intersection-street-sign-pole"; pole.position.set(intersection.x + 9.8, 2.2, street.z + 8.8); root.add(pole);
    const avenueBlade = new THREE.Mesh(new RoundedBoxGeometry(2.9, .62, .09, 4, .025), new THREE.MeshBasicMaterial({ map: bladeTextures.get(intersection.avenue), toneMapped: false }));
    avenueBlade.name = "readable-upper-west-side-avenue-blade"; avenueBlade.position.copy(pole.position).add(new THREE.Vector3(0, 2.05, 0)); root.add(avenueBlade);
    const streetBlade = new THREE.Mesh(new RoundedBoxGeometry(2.9, .62, .09, 4, .025), new THREE.MeshBasicMaterial({ map: bladeTextures.get(street.name), toneMapped: false }));
    streetBlade.name = "readable-upper-west-side-cross-street-blade"; streetBlade.position.copy(pole.position).add(new THREE.Vector3(0, 1.42, 0)); streetBlade.rotation.y = Math.PI / 2; root.add(streetBlade);
    for (let stripe = 0; stripe < crossingStripeCount; stripe++) {
      const offset = (stripe - (crossingStripeCount - 1) * .5) * 1.42;
      for (const approach of [-1, 1]) {
        crosswalkDummy.position.set(intersection.x + offset, .135, street.z + approach * 7.2); crosswalkDummy.rotation.set(0, 0, 0); crosswalkDummy.updateMatrix(); crosswalks.setMatrixAt(crosswalkIndex++, crosswalkDummy.matrix);
        crosswalkDummy.position.set(intersection.x + approach * 7.2, .137, street.z + offset); crosswalkDummy.rotation.set(0, Math.PI / 2, 0); crosswalkDummy.updateMatrix(); crosswalks.setMatrixAt(crosswalkIndex++, crosswalkDummy.matrix);
      }
    }
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(.065, .1, 5.2, 10), signalMetal); lampPost.name = "upper-west-side-cast-iron-street-lamp"; lampPost.position.set(intersection.x - 9.6, 2.6, street.z - 8.8); root.add(lampPost);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.19, 14, 10), streetLampSurface); lamp.position.copy(lampPost.position).add(new THREE.Vector3(0, 2.68, 0)); root.add(lamp);
    const hydrant = new THREE.Group(); hydrant.name = "upper-west-side-grounded-fire-hydrant"; hydrant.position.set(intersection.x + 9.1, .2, street.z - 8.6);
    const hydrantBody = new THREE.Mesh(new THREE.CylinderGeometry(.16, .19, .55, 12), hydrantSurface); hydrantBody.position.y = .28; hydrant.add(hydrantBody);
    const hydrantCap = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 8, 0, Math.PI * 2, 0, Math.PI * .55), hydrantBody.material); hydrantCap.position.y = .56; hydrant.add(hydrantCap); root.add(hydrant);
  }
  crosswalks.instanceMatrix.needsUpdate = true; root.add(crosswalks);
  const shelterGlass = new THREE.MeshPhysicalMaterial({ color: "#a8c1c4", transparent: true, opacity: .34, transmission: .35, roughness: .12, depthWrite: false }); shelterGlass.forceSinglePass = true;
  const shelterMetal = new THREE.MeshStandardMaterial({ color: "#252c2c", roughness: .36, metalness: .72 });
  for (const [index, x, z, rotation] of [[0, -92, -2614, 0], [1, -202, -2694, Math.PI], [2, CENTRAL_PARK_WEST_X, -2774, 0]] as const) {
    const shelter = new THREE.Group(); shelter.name = `upper-west-side-detailed-bus-shelter-${index + 1}`; shelter.position.set(x + (rotation ? -10.7 : 10.7), 0, z); shelter.rotation.y = rotation;
    const back = new THREE.Mesh(new RoundedBoxGeometry(4.6, 2.55, .09, 4, .03), shelterGlass); back.position.set(0, 1.38, 0); shelter.add(back);
    const roof = new THREE.Mesh(new RoundedBoxGeometry(5.05, .16, 1.65, 4, .05), shelterMetal); roof.position.set(0, 2.78, -.62); shelter.add(roof);
    const bench = new THREE.Mesh(new RoundedBoxGeometry(2.8, .16, .52, 4, .04), shelterMetal); bench.position.set(-.4, .72, -.42); shelter.add(bench);
    for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.045, .06, 2.7, 9), shelterMetal); post.position.set(side * 2.25, 1.35, -.65); shelter.add(post); }
    const arrivalDisplay = new THREE.Mesh(new RoundedBoxGeometry(.82, 1.65, .12, 4, .035), new THREE.MeshStandardMaterial({ color: "#263a40", emissive: "#5d877c", emissiveIntensity: .35, roughness: .42 })); arrivalDisplay.name = "bus-shelter-live-arrival-display"; arrivalDisplay.position.set(1.75, 1.45, -.12); shelter.add(arrivalDisplay);
    root.add(shelter);
  }
  for (const leg of ROUTE_LEGS) {
    const progress = leg.from + 18, frame = routeFrame(progress), texture = signTexture(leg.name.toUpperCase(), leg.detail.toUpperCase()); ownedTextures.push(texture);
    const gantry = new THREE.Group(); gantry.name = "nyc-route-wayfinding-" + leg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const beam = new THREE.Mesh(new RoundedBoxGeometry(20, .24, .24, 3, .04), concrete); beam.position.y = 5.8; gantry.add(beam);
    for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 5.8, 10), concrete); post.position.set(side * 9.2, 2.9, 0); gantry.add(post); }
    const sign = new THREE.Mesh(new RoundedBoxGeometry(7.6, 2.25, .16, 4, .04), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); sign.position.set(0, 4.55, -.18); gantry.add(sign);
    gantry.position.copy(frame.center); gantry.rotation.y = frame.yaw; root.add(gantry);
  }

  const exitFrame = routeFrame(HIGHWAY_EXIT_START - 112), exitTexture = signTexture("AMERICAN MUSEUM OF NATURAL HISTORY", "EXIT W 79 ST · KEEP LEFT · EXIT HERE");
  ownedTextures.push(exitTexture);
  const exitGantry = new THREE.Group(); exitGantry.name = "high-visibility-amnh-west-side-highway-exit-gantry";
  const exitBeam = new THREE.Mesh(new RoundedBoxGeometry(20.5, .28, .28, 3, .045), concrete); exitBeam.position.y = 6.45; exitGantry.add(exitBeam);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.14, .18, 6.45, 12), concrete); post.position.set(side * 9.45, 3.22, 0); exitGantry.add(post);
  }
  const exitSign = new THREE.Mesh(new RoundedBoxGeometry(12.8, 3.15, .2, 5, .05), new THREE.MeshBasicMaterial({ map: exitTexture, toneMapped: false }));
  exitSign.name = "exit-here-for-american-museum-of-natural-history-sign"; exitSign.position.set(-2.1, 5.05, -.2); exitGantry.add(exitSign);
  exitGantry.position.copy(exitFrame.center); exitGantry.rotation.y = exitFrame.yaw; root.add(exitGantry);

  const river = new THREE.Mesh(new THREE.PlaneGeometry(172, HIGHWAY_EXIT_START - HIGHWAY_START + 180), new THREE.MeshPhysicalMaterial({ color: "#446d79", normalMap: textures.waterNormal, normalScale: new THREE.Vector2(.32, .32), roughness: .2, metalness: .04, clearcoat: .72 }));
  river.name = "hudson-river-right-side-of-southbound-west-side-highway"; river.rotation.x = -Math.PI / 2; river.position.set(92, .05, -(HIGHWAY_START + HIGHWAY_EXIT_START) * .5); root.add(river);
  const waterfront = new THREE.Mesh(new RoundedBoxGeometry(9, .3, HIGHWAY_EXIT_START - HIGHWAY_START + 120, 3, .05), concrete);
  waterfront.name = "hudson-river-greenway-and-seawall"; waterfront.position.set(17.4, .12, -(HIGHWAY_START + HIGHWAY_EXIT_START) * .5); root.add(waterfront);
  const highwayBarrier = new THREE.Mesh(new RoundedBoxGeometry(.52, .72, HIGHWAY_EXIT_START - HIGHWAY_START + 54, 3, .09), concrete);
  highwayBarrier.name = "west-side-highway-hudson-safety-barrier"; highwayBarrier.position.set(11.15, .34, -(HIGHWAY_START + HIGHWAY_EXIT_START) * .5); root.add(highwayBarrier);
  const greenwayStripe = new THREE.Mesh(new RoundedBoxGeometry(.12, .035, HIGHWAY_EXIT_START - HIGHWAY_START + 110, 2, .012), new THREE.MeshStandardMaterial({ color: "#d6c85f", roughness: .72 }));
  greenwayStripe.name = "hudson-river-greenway-center-stripe"; greenwayStripe.position.set(17.4, .3, -(HIGHWAY_START + HIGHWAY_EXIT_START) * .5); root.add(greenwayStripe);
  const boatMaterials = ["#ece7d8", "#b74b39", "#315c70"].map(color => new THREE.MeshPhysicalMaterial({ color, roughness: .52, clearcoat: .3 }));
  for (let index = 0; index < 7; index++) {
    const boat = new THREE.Group(); boat.name = `hudson-river-detailed-commuter-and-sail-boat-${index + 1}`;
    const hull = new THREE.Mesh(new RoundedBoxGeometry(2.2 + index % 3, .45, 5.6 + index % 2 * 1.7, 8, .18), boatMaterials[index % boatMaterials.length]); hull.position.y = .28; boat.add(hull);
    const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.35, .72, 1.8, 6, .12), new THREE.MeshPhysicalMaterial({ color: "#c9d8d8", roughness: .14, transmission: .16, transparent: true, opacity: .82 })); cabin.position.set(0, .82, .35); boat.add(cabin);
    if (index % 2 === 1) {
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 4.2, 9), new THREE.MeshStandardMaterial({ color: "#d9d4c6", roughness: .48, metalness: .25 })); mast.position.set(0, 2.4, -.3); boat.add(mast);
      const sailGeometry = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, .35, 0), new THREE.Vector3(0, 3.9, 0), new THREE.Vector3(1.65, .55, 0)]);
      sailGeometry.setIndex([0, 1, 2]); sailGeometry.computeVertexNormals();
      const sail = new THREE.Mesh(sailGeometry, boatMaterials[0]); sail.position.set(.05, .35, -.3); boat.add(sail);
    }
    boat.position.set(45 + index % 3 * 23, .02, -(HIGHWAY_START + 70 + index * 92)); boat.rotation.y = index % 2 ? Math.PI : 0; root.add(boat);
  }

  const cpwFrame = routeFrame(CENTRAL_PARK_WEST_START + 128);
  const centralPark = new THREE.Mesh(new THREE.PlaneGeometry(150, 360), new THREE.MeshStandardMaterial({ color: "#42613b", map: textures.ground, roughness: 1 }));
  centralPark.name = "central-park-visible-left-side-of-central-park-west"; centralPark.rotation.x = -Math.PI / 2; centralPark.rotation.z = -cpwFrame.yaw; centralPark.position.copy(cpwFrame.center).addScaledVector(cpwFrame.right, -82); centralPark.position.y = .3; root.add(centralPark);
  const parkTrees = quality < .58 ? 24 : quality < .82 ? 38 : 56;
  const parkTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.25, .34, 6.4, quality > .72 ? 10 : 7), new THREE.MeshStandardMaterial({ map: textures.bark, color: "#66503c", roughness: .98 }), parkTrees);
  parkTrunks.name = "central-park-west-mature-park-tree-trunks";
  const parkCrowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.8, quality > .82 ? 2 : 1), new THREE.MeshStandardMaterial({ map: textures.foliage, color: "#476d42", roughness: .95 }), parkTrees);
  parkCrowns.name = "central-park-west-dense-layered-park-canopy";
  const parkDummy = new THREE.Object3D();
  for (let index = 0; index < parkTrees; index++) {
    const progress = CENTRAL_PARK_WEST_START + 10 + index / Math.max(1, parkTrees - 1) * 252, frame = routeFrame(progress);
    const distance = 23 + index % 5 * 11;
    const base = frame.center.clone().addScaledVector(frame.right, -distance).addScaledVector(frame.tangent, (index % 4 - 1.5) * 3.4);
    parkDummy.position.copy(base).add(new THREE.Vector3(0, 3.2, 0)); parkDummy.rotation.set(0, index * 1.7, 0); parkDummy.scale.setScalar(.8 + index % 4 * .11); parkDummy.updateMatrix(); parkTrunks.setMatrixAt(index, parkDummy.matrix);
    parkDummy.position.copy(base).add(new THREE.Vector3(0, 7.3, 0)); parkDummy.rotation.set(index * .17, index * .83, 0); parkDummy.scale.set(1.05 + index % 3 * .16, .82 + index % 4 * .08, 1.05 + (index + 1) % 3 * .13); parkDummy.updateMatrix(); parkCrowns.setMatrixAt(index, parkDummy.matrix);
  }
  parkTrunks.instanceMatrix.needsUpdate = true; parkCrowns.instanceMatrix.needsUpdate = true; root.add(parkTrunks, parkCrowns);

  // Zebra-striped crossings make the two actual ninety-degree street turns
  // legible at speed and visually separate the highway, crosstown and avenue.
  for (const progress of [CROSSTOWN_START + 38, CROSSTOWN_START + 145, CENTRAL_PARK_WEST_START + 35, CENTRAL_PARK_WEST_START + 146]) {
    const frame = routeFrame(progress);
    for (let stripeIndex = -5; stripeIndex <= 5; stripeIndex++) {
      const stripe = new THREE.Mesh(new RoundedBoxGeometry(1.12, .025, 4.3, 2, .01), lane);
      stripe.name = "upper-west-side-zebra-crosswalk-stripe";
      stripe.position.copy(frame.center).addScaledVector(frame.right, stripeIndex * 1.72); stripe.position.y += .105; stripe.rotation.y = frame.yaw; root.add(stripe);
    }
  }

  const streetscapeCount = quality < .58 ? 34 : quality < .82 ? 52 : 76;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.13, .2, 3.5, quality > .75 ? 10 : 7), new THREE.MeshStandardMaterial({ map: textures.bark, color: "#70543c", roughness: .96 }), streetscapeCount);
  trunk.name = "upper-west-side-street-tree-trunks";
  const crown = new THREE.InstancedMesh(new THREE.PlaneGeometry(4.4, 4.8), new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .24, color: "#57784b", roughness: .9, side: THREE.DoubleSide }), streetscapeCount * 2);
  crown.name = "upper-west-side-layered-street-tree-crowns";
  const lampPost = new THREE.InstancedMesh(new THREE.CylinderGeometry(.055, .085, 4.8, 8), new THREE.MeshStandardMaterial({ color: "#26302f", metalness: .66, roughness: .38 }), streetscapeCount);
  lampPost.name = "new-york-street-light-posts";
  const lampGlow = new THREE.InstancedMesh(new THREE.SphereGeometry(.18, 12, 8), new THREE.MeshStandardMaterial({ color: "#f4e6b0", emissive: "#ffd077", emissiveIntensity: 1.45, roughness: .24 }), streetscapeCount);
  lampGlow.name = "new-york-street-light-globes";
  const dummy = new THREE.Object3D();
  for (let index = 0; index < streetscapeCount; index++) {
    const progress = 16 + index / Math.max(1, streetscapeCount - 1) * (CITY_BUS_ROUTE_LENGTH - 32);
    const frame = routeFrame(progress), side = index % 2 ? 1 : -1;
    const base = frame.center.clone().addScaledVector(frame.right, side * 13.45);
    dummy.position.copy(base).add(new THREE.Vector3(0, 1.75, 0));
    dummy.rotation.set(0, frame.yaw + index * .37, 0);
    dummy.scale.setScalar(.82 + index % 4 * .08);
    dummy.updateMatrix();
    trunk.setMatrixAt(index, dummy.matrix);
    for (let card = 0; card < 2; card++) {
      dummy.position.copy(base).add(new THREE.Vector3(0, 4.45, 0));
      dummy.rotation.set(0, frame.yaw + card * Math.PI / 2 + index * .21, 0);
      dummy.scale.setScalar(.82 + index % 4 * .08);
      dummy.updateMatrix();
      crown.setMatrixAt(index * 2 + card, dummy.matrix);
    }
    const lampBase = frame.center.clone().addScaledVector(frame.right, -side * 14.25).addScaledVector(frame.tangent, 4.5);
    dummy.position.copy(lampBase).add(new THREE.Vector3(0, 2.4, 0)); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); lampPost.setMatrixAt(index, dummy.matrix);
    dummy.position.copy(lampBase).add(new THREE.Vector3(0, 4.82, 0)); dummy.updateMatrix(); lampGlow.setMatrixAt(index, dummy.matrix);
  }
  for (const instanced of [trunk, crown, lampPost, lampGlow]) instanced.instanceMatrix.needsUpdate = true;
  trunk.castShadow = quality > .72; crown.castShadow = quality > .82; trunk.receiveShadow = lampPost.receiveShadow = true;
  root.add(trunk, crown, lampPost, lampGlow);
}

function addMuseumArrivalCampus(root: THREE.Group, ownedTextures: THREE.Texture[], textures: GameTextures) {
  const frame = routeFrame(CITY_BUS_ROUTE_LENGTH);
  const arrival = new THREE.Group();
  arrival.name = "amnh-visible-city-route-arrival-campus";
  arrival.position.copy(frame.center);
  arrival.rotation.y = frame.yaw;
  const asphalt = new THREE.MeshStandardMaterial({ color: "#4f5354", roughness: .96, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .012 });
  const limestone = new THREE.MeshStandardMaterial({ color: "#c8c0ae", roughness: .84, map: textures.stone, bumpMap: textures.stone, bumpScale: .022 });
  const redStone = new THREE.MeshStandardMaterial({ color: "#765047", roughness: .88, map: textures.stone });
  const bronze = new THREE.MeshStandardMaterial({ color: "#2f3431", roughness: .34, metalness: .72 });
  const warmDark = new THREE.MeshStandardMaterial({ color: "#181c1b", emissive: "#70562d", emissiveIntensity: .3, roughness: .76 });

  // Continue the asphalt beyond the playable stop so the route resolves into
  // a real bus bay instead of ending against fog/clear color like a white wall.
  const apron = new THREE.Mesh(new RoundedBoxGeometry(21.5, .18, 240, 4, .05), asphalt);
  apron.name = "central-park-west-amnh-arrival-asphalt-continuation";
  apron.position.set(0, -.08, -110); arrival.add(apron);
  const baySurface = new THREE.Mesh(new RoundedBoxGeometry(4.6, .035, 25, 3, .015), new THREE.MeshStandardMaterial({ color: "#424748", roughness: .96 }));
  baySurface.name = "amnh-museum-shuttle-signed-curb-bay"; baySurface.position.set(6.8, .032, -10); arrival.add(baySurface);
  const bayStripeMaterial = new THREE.MeshStandardMaterial({ color: "#e4bd25", emissive: "#4f3b04", emissiveIntensity: .08, roughness: .72 });
  for (const x of [4.65, 8.95]) {
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(.12, .045, 24.6, 2, .012), bayStripeMaterial);
    stripe.name = "amnh-shuttle-bay-yellow-perimeter-line"; stripe.position.set(x, .065, -10); arrival.add(stripe);
  }
  for (const z of [-22.2, 2.2]) {
    const stripe = new THREE.Mesh(new RoundedBoxGeometry(4.4, .045, .12, 2, .012), bayStripeMaterial);
    stripe.name = "amnh-shuttle-bay-yellow-perimeter-line"; stripe.position.set(6.8, .065, z); arrival.add(stripe);
  }
  const crossStreet = new THREE.Mesh(new RoundedBoxGeometry(112, .16, 17, 4, .045), asphalt);
  crossStreet.name = "west-77th-street-visible-cross-street-at-route-end"; crossStreet.position.set(0, -.07, -38); arrival.add(crossStreet);
  for (const side of [-1, 1]) {
    const sidewalk = new THREE.Mesh(new RoundedBoxGeometry(5.6, .3, 238, 4, .06), limestone);
    sidewalk.position.set(side * 13.25, .08, -110); arrival.add(sidewalk);
  }
  const parkExtension = new THREE.Mesh(new RoundedBoxGeometry(68, .12, 238, 4, .05), new THREE.MeshStandardMaterial({ color: "#42613b", map: textures.ground, roughness: 1 }));
  parkExtension.name = "central-park-landscape-continuing-beyond-amnh-bus-stop"; parkExtension.position.set(-48, -.02, -110); arrival.add(parkExtension);
  const parkBark = new THREE.MeshStandardMaterial({ color: "#66503b", map: textures.bark, roughness: .98 });
  const parkLeaf = new THREE.MeshStandardMaterial({ color: "#476b41", map: textures.foliage, roughness: .94 });
  for (let index = 0; index < 32; index++) {
    const tree = new THREE.Group(); tree.name = `central-park-visible-arrival-tree-${index + 1}`;
    tree.position.set(-22 - index % 5 * 11.5, 0, 7 - Math.floor(index / 5) * 29 - index % 2 * 5);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.25, .38, 6 + index % 3, 10), parkBark); trunk.position.y = 3; tree.add(trunk);
    for (const [x, y, z, scale] of [[0, 7, 0, 1.15], [-2, 6.6, .4, .78], [1.8, 7.15, -.5, .88]] as const) {
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(3.5, 2), parkLeaf); crown.position.set(x, y, z); crown.scale.set(scale, scale * .78, scale); tree.add(crown);
    }
    arrival.add(tree);
  }

  // Carry the avenue beyond the playable bay with lower-detail, full-volume
  // neighborhood blocks. They close the destination horizon without adding
  // another streamed gameplay district or expensive character simulation.
  for (let block = 0; block < 4; block++) {
    const height = 22 + block % 3 * 7, depth = 34 + block % 2 * 8;
    const building = new THREE.Mesh(new RoundedBoxGeometry(26 + block % 2 * 7, height, depth, 4, .18), block % 2 ? redStone : limestone);
    building.name = "central-park-west-post-museum-horizon-building"; building.position.set(29 + block % 2 * 4, height * .5, -58 - block * 48); arrival.add(building);
    const roofline = new THREE.Mesh(new RoundedBoxGeometry(27 + block % 2 * 7, .45, depth + .6, 3, .055), bronze); roofline.position.copy(building.position); roofline.position.y += height * .5 + .08; arrival.add(roofline);
    for (let floor = 0; floor < 3; floor++) for (let bay = 0; bay < 3; bay++) {
      const window = new THREE.Mesh(new RoundedBoxGeometry(.12, 2.65, 3.8, 4, .04), warmDark); window.name = "central-park-west-post-museum-recessed-window"; window.position.set(15.85, 4.1 + floor * 4.4, building.position.z - 9 + bay * 8.5); arrival.add(window);
    }
  }
  for (let lampIndex = 0; lampIndex < 7; lampIndex++) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .085, 4.8, 9), bronze); post.position.set(12.6, 2.4, -42 - lampIndex * 27); arrival.add(post);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(.18, 12, 8), new THREE.MeshStandardMaterial({ color: "#f4e6b0", emissive: "#ffd077", emissiveIntensity: 1.45, roughness: .24 })); glow.position.copy(post.position).add(new THREE.Vector3(0, 2.42, 0)); arrival.add(glow);
  }

  // The museum now sits on the curb side of Central Park West. It is no longer
  // a wall directly across the roadway, so the drive resolves as a real avenue
  // with parkland on one side and the AMNH frontage on the other.
  const facade = new THREE.Group(); facade.name = "amnh-route-end-grounded-preview-facade"; facade.position.set(24, 0, -10); facade.rotation.y = -Math.PI / 2;
  const center = new THREE.Mesh(new RoundedBoxGeometry(42, 18, 7, 6, .18), limestone); center.position.y = 9; facade.add(center);
  for (const side of [-1, 1]) {
    const wing = new THREE.Mesh(new RoundedBoxGeometry(17, 14, 8.5, 5, .18), redStone); wing.position.set(side * 28, 7, .4); facade.add(wing);
    const annex = new THREE.Mesh(new RoundedBoxGeometry(28, 18, 9.5, 5, .18), redStone);
    annex.name = "amnh-route-end-continuous-masonry-annex"; annex.position.set(side * 49.5, 9, .2); facade.add(annex);
    for (let bayIndex = 0; bayIndex < 4; bayIndex++) for (let floorIndex = 0; floorIndex < 2; floorIndex++) {
      const window = new THREE.Mesh(new RoundedBoxGeometry(3.8, 4.1, .12, 5, .06), warmDark);
      window.name = "amnh-route-end-annex-recessed-window";
      window.position.set(side * (39.5 + bayIndex * 6.5), 5.1 + floorIndex * 5.3, 4.98);
      facade.add(window);
    }
  }
  const porticoFloor = new THREE.Mesh(new RoundedBoxGeometry(28, .6, 7.5, 4, .08), limestone); porticoFloor.position.set(0, .3, 4.2); facade.add(porticoFloor);
  for (const x of [-10.5, -7, -3.5, 3.5, 7, 10.5]) {
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.45, .48, 1.45, 4, .06), limestone); base.position.set(x, .84, 4.25); facade.add(base);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(.48, .58, 10.5, 22), limestone); column.position.set(x, 6.32, 4.25); facade.add(column);
    const capital = new THREE.Mesh(new RoundedBoxGeometry(1.55, .48, 1.55, 4, .06), limestone); capital.position.set(x, 11.8, 4.25); facade.add(capital);
  }
  for (const x of [-6, 0, 6]) {
    const portal = new THREE.Mesh(new RoundedBoxGeometry(4.7, 7.4, .18, 6, .08), warmDark); portal.position.set(x, 4.25, 3.58); facade.add(portal);
  }
  const arrivalTexture = signTexture("AMERICAN MUSEUM OF NATURAL HISTORY", "CENTRAL PARK WEST · SHUTTLE ARRIVAL");
  ownedTextures.push(arrivalTexture);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(23, 2.25, .18, 4, .05), new THREE.MeshBasicMaterial({ map: arrivalTexture, toneMapped: false }));
  sign.position.set(0, 14.4, 3.62); facade.add(sign);
  for (const x of [-13.8, 13.8]) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(.32, 18, 12), new THREE.MeshStandardMaterial({ color: "#ffe4a2", emissive: "#ffc65a", emissiveIntensity: 2.8, roughness: .18 }));
    lantern.position.set(x, 4.2, 4.45); facade.add(lantern);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .08, 3.4, 10), bronze); post.position.set(x, 2.4, 4.45); facade.add(post);
  }
  arrival.add(facade); root.add(arrival);
}

export class CityBusWorld {
  readonly root = new THREE.Group();
  readonly arrivalTarget = AMNH_BUS_BAY.clone();
  readonly routeMilestones = ROUTE_LEGS;
  private readonly bus: BuiltBus;
  private readonly traffic: TrafficVehicle[] = [];
  private readonly localTraffic: LocalTrafficVehicle[] = [];
  private readonly signals: TrafficSignal[] = [];
  private readonly pedestrians: AmbientHumanAgent[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly sun: THREE.DirectionalLight;
  private readonly roadNetwork = new CityRoadNetwork(DRIVE_ROADS);
  private readonly busPosition = new THREE.Vector3();
  private busHeading = 0;
  private guidance: RouteGuidance;
  private progress = 0;
  private speed = 0;
  private steerAmount = 0;
  private roadSurfaceMessage = "ON AUTHORED ROUTE";
  private guidanceRefreshAt = -Infinity;
  private initialRouteDistance = CITY_BUS_ROUTE_LENGTH;
  private completionHighWater = 0;
  private trafficMessage = "Zoo shuttle loading zone";
  private disposed = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1, startProgress = 0, reviewSpawn?: "missed-exit" | "uws-reroute") {
    this.root.name = "bronx-to-natural-history-museum-driving-level"; scene.add(this.root);
    this.progress = THREE.MathUtils.clamp(startProgress, 0, CITY_BUS_ROUTE_LENGTH - .5);
    const spawnFrame = routeFrame(this.progress);
    this.busPosition.copy(spawnFrame.center).addScaledVector(spawnFrame.right, -LANE_WIDTH * .5);
    this.busHeading = spawnFrame.yaw;
    if (reviewSpawn === "missed-exit") { this.busPosition.set(-1.7, .4, -2635); this.busHeading = 0; this.progress = HIGHWAY_EXIT_START; }
    if (reviewSpawn === "uws-reroute") { this.busPosition.set(-144.2, .4, -2678); this.busHeading = 0; this.progress = CROSSTOWN_START + 80; }
    const spawnHeading = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    this.guidance = this.roadNetwork.route(this.busPosition, AMNH_BUS_BAY, spawnHeading);
    this.initialRouteDistance = Math.max(1, this.guidance.distance);
    this.roadSurfaceMessage = this.guidance.current.primaryProgress === null ? "OPEN-WORLD REROUTE ACTIVE" : "AUTHORED ROUTE · FREE STEERING";
    addCitySky(this.root);
    addRoadNetwork(this.root, this.ownedTextures, quality, textures, this.signals);
    addMuseumArrivalCampus(this.root, this.ownedTextures, textures);
    this.bus = makeBus(quality, textures, this.ownedTextures); this.root.add(this.bus.root);
    const trafficCount = quality < .58 ? 36 : quality < .82 ? 52 : 68;
    for (let index = 0; index < trafficCount; index++) {
      const lane = TRAFFIC_LANES[index % TRAFFIC_LANES.length];
      // Seed a readable near-field pack at every review/start point. The rest
      // remains distributed across the route so traffic keeps arriving rather
      // than appearing as a one-time set piece.
      const trafficOffset = index < 12
        ? 20 + index * 17
        : 220 + (index - 12) * (CITY_BUS_ROUTE_LENGTH - 245) / Math.max(1, trafficCount - 12);
      const car = makeTrafficCar(index, quality), vehicle: TrafficVehicle = {
        root: car,
        progress: (this.progress + trafficOffset) % CITY_BUS_ROUTE_LENGTH,
        lane,
        targetLane: lane,
        speed: 28 + index % 5 * 2.4,
        cruise: 38 + index % 7 * 2.65,
        phase: index * 1.83,
        nextLaneChange: 3.8 + index % 7 * 1.32,
      };
      this.traffic.push(vehicle); this.root.add(car);
    }
    const localTrafficCount = quality < .58 ? 6 : quality < .82 ? 10 : 14;
    for (let index = 0; index < localTrafficCount; index++) {
      const path = UWS_TRAFFIC_LOOPS[index % UWS_TRAFFIC_LOOPS.length], frame = closedPathFrame(path, 0);
      const vehicle: LocalTrafficVehicle = {
        root: makeTrafficCar(100 + index, quality), path,
        distance: index / Math.max(1, localTrafficCount) * frame.total + index % 3 * 17,
        speed: 22 + index % 5 * 2.1,
        laneOffset: index % 2 ? -1.8 : 1.8,
      };
      vehicle.root.name = `upper-west-side-open-world-loop-traffic-${index + 1}`;
      this.localTraffic.push(vehicle); this.root.add(vehicle.root);
    }
    const skins = ["#b77859", "#704936", "#d0a17d", "#926047", "#573c32", "#c28b6b"];
    const pedestrianCount = quality < .58 ? 6 : quality < .82 ? 10 : 14;
    for (let index = 0; index < pedestrianCount; index++) {
      const progress = 16 + index / Math.max(1, pedestrianCount - 1) * (CITY_BUS_ROUTE_LENGTH - 32), atMuseum = progress > CENTRAL_PARK_WEST_START, frame = routeFrame(progress), side = index % 2 ? 1 : -1;
      const result = createPremiumHuman({ role: "visitor", quality, variant: 40 + index, faceVariant: 7 + index, coat: ["#476779", "#8a5143", "#596846", "#7a668c"][index % 4], trousers: "#30363c", skin: skins[index % skins.length], outfit: index % 2 ? "knit-chinos" : "cotton-denim", accessory: index % 3 === 1 ? "tote" : "backpack", pose: "neutral" });
      result.root.name = atMuseum ? "central-park-west-pedestrian-" + index : "southern-boulevard-pedestrian-" + index;
      result.root.position.copy(frame.center).addScaledVector(frame.right, side * 13.2); result.root.position.y += .2; this.root.add(result.root); this.ownedTextures.push(...result.ownedTextures);
      this.pedestrians.push(createAmbientHumanAgent(result.root, { axis: frame.tangent, travel: 3.5 + index % 3, speed: .76 + index % 2 * .08, pauseSeconds: 2.2 + index % 3, phase: index * 2.4 }));
    }
    this.sun = new THREE.DirectionalLight("#fff0cf", 2.75); this.sun.castShadow = quality > .58; this.sun.shadow.mapSize.set(quality > .82 ? 2048 : 1024, quality > .82 ? 2048 : 1024); this.root.add(this.sun, this.sun.target);
    const ambient = new THREE.HemisphereLight("#c7dde3", "#45493c", 1.72); ambient.name = "city-evening-hemisphere-light"; this.root.add(ambient);
    this.updateTransforms(0, 0);
  }

  get speedMetersPerSecond() { return Math.abs(this.speed); }
  get signedSpeedMetersPerSecond() { return this.speed; }
  get steeringAmount() { return this.steerAmount; }
  get remainingMeters() { return Math.max(0, this.guidance.distance); }
  get routeCompletion() { return this.parkingReached ? 1 : this.completionHighWater; }
  get minimapSnapshot(): ShuttleMinimapSnapshot {
    return {
      x: this.busPosition.x,
      z: this.busPosition.z,
      heading: this.busHeading,
      road: this.currentRoad,
      destinationX: AMNH_BUS_BAY.x,
      destinationZ: AMNH_BUS_BAY.z,
    };
  }
  get currentRoad() {
    // The primary-route progress is the authoritative leg label. Route search
    // can temporarily select a geometrically close connector at a wide merge,
    // which previously made the highway HUD jump back to Southern Boulevard.
    return displayRoadName(this.guidance.current.primaryProgress !== null ? primaryRoadName(this.progress) : this.guidance.current.road.name);
  }
  get congestionStatus() { return this.trafficMessage; }
  get routeStatus() { return this.roadSurfaceMessage; }
  get navigationBearingDegrees() {
    const forward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading)), right = new THREE.Vector3(-forward.z, 0, forward.x);
    const direction = this.guidance.nextPoint.clone().sub(this.busPosition).setY(0).normalize();
    return THREE.MathUtils.radToDeg(Math.atan2(direction.dot(right), direction.dot(forward)));
  }
  get navigationInstruction() {
    const remaining = this.guidance.distance;
    if (remaining <= 45) return `BRAKE FOR MARKED MUSEUM SHUTTLE BAY · ${Math.max(0, Math.round(remaining))} M`;
    if (this.guidance.current.distance > this.guidance.current.road.halfWidth + 1.5) return `RETURN TO ${displayRoadName(this.guidance.current.road.name).toUpperCase()} · ${Math.round(this.guidance.current.distance)} M OFF ROAD`;
    const forward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const toWaypoint = this.guidance.nextPoint.clone().sub(this.busPosition).setY(0);
    const waypointDistance = toWaypoint.length();
    if (waypointDistance > .01) toWaypoint.multiplyScalar(1 / waypointDistance);
    const turn = Math.atan2(toWaypoint.dot(right), toWaypoint.dot(forward));
    const rerouting = this.guidance.onRecommendedRoute ? "" : "REROUTING · ";
    if (waypointDistance < 68 && Math.abs(turn) > .38) return `${rerouting}TURN ${turn > 0 ? "RIGHT" : "LEFT"} ONTO ${displayRoadName(this.guidance.nextRoadName).toUpperCase()}`;
    if (this.guidance.current.primaryProgress !== null && this.progress >= HIGHWAY_EXIT_START - 170 && this.progress < CROSSTOWN_START) return `EXIT HERE FOR AMERICAN MUSEUM OF NATURAL HISTORY · KEEP LEFT`;
    return `${rerouting}CONTINUE ON ${this.currentRoad.toUpperCase()} · NEXT ${displayRoadName(this.guidance.nextRoadName).toUpperCase()}`;
  }
  get parkingReached() { return this.busPosition.distanceTo(AMNH_BUS_BAY) < 5.2 && Math.abs(this.speed) < .6; }
  get headingYaw() { return this.busHeading; }
  get cameraPosition() {
    const forward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading)), right = new THREE.Vector3(-forward.z, 0, forward.x);
    return this.busPosition.clone().addScaledVector(right, -.72).addScaledVector(forward, 2.15).add(new THREE.Vector3(0, 2.27, 0));
  }

  getWorldGripPositions(target: SlothVehicleGripTargets) {
    this.bus.root.updateMatrixWorld(true);
    this.bus.gripAnchors[0].getWorldPosition(target.left);
    this.bus.gripAnchors[1].getWorldPosition(target.right);
    return target;
  }

  update(delta: number, elapsed: number, input: CityBusInput) {
    if (this.disposed) return;
    const headingVector = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    let road = this.roadNetwork.nearest(this.busPosition, headingVector);
    if (elapsed >= this.guidanceRefreshAt) {
      this.guidance = this.roadNetwork.route(this.busPosition, AMNH_BUS_BAY, headingVector);
      this.completionHighWater = Math.max(this.completionHighWater, THREE.MathUtils.clamp(1 - this.guidance.distance / this.initialRouteDistance, 0, 1));
      this.guidanceRefreshAt = elapsed + .18;
    }
    const steerInput = (input.steerRight ? 1 : 0) - (input.steerLeft ? 1 : 0);
    this.steerAmount += (steerInput - this.steerAmount) * (1 - Math.exp(-delta * 8.5));
    const travelDirection = Math.abs(this.speed) > .08 ? Math.sign(this.speed) : input.brake && !input.accelerate ? -1 : 1;
    const speedRatio = THREE.MathUtils.clamp(Math.abs(this.speed) / HIGHWAY_TOP_SPEED, 0, 1);
    const steeringRate = (.42 + speedRatio * .78) * (input.handbrake ? 1.42 : 1);
    this.busHeading -= this.steerAmount * travelDirection * steeringRate * delta;
    const driveInput = input.accelerate ? 1 : input.brake ? -1 : 0;
    // Road signals and junction proximity never take throttle authority from
    // the player. Off-route guidance remains visible, but the arcade shuttle
    // keeps its full commanded pace until the player brakes or handbrakes.
    const forwardTopSpeed = road.road.speedLimit;
    if (driveInput !== 0) {
      if (this.speed * driveInput < -.05) {
        this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - delta * 38);
      } else {
        const targetSpeed = driveInput > 0 ? forwardTopSpeed : -11;
        this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-delta * (driveInput > 0 ? 2.55 : 2.1)));
      }
    } else {
      const resistance = .38 + Math.abs(this.speed) * .035;
      this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - resistance * delta);
    }
    if (input.handbrake) this.speed = Math.sign(this.speed) * Math.max(0, Math.abs(this.speed) - delta * 52);
    this.speed = THREE.MathUtils.clamp(this.speed, -11, forwardTopSpeed);
    const driveForward = new THREE.Vector3(-Math.sin(this.busHeading), 0, -Math.cos(this.busHeading));
    this.busPosition.addScaledVector(driveForward, this.speed * delta);
    road = this.roadNetwork.nearest(this.busPosition, driveForward);
    const hardRoadLimit = road.road.halfWidth + 7.5;
    if (road.distance > hardRoadLimit) {
      const correction = road.point.clone().sub(this.busPosition).setY(0).normalize();
      this.busPosition.addScaledVector(correction, road.distance - hardRoadLimit);
      road = this.roadNetwork.nearest(this.busPosition, driveForward);
    }
    this.busPosition.y = THREE.MathUtils.lerp(this.busPosition.y, road.point.y, 1 - Math.exp(-delta * 9));
    if (road.primaryProgress !== null && road.distance < road.road.halfWidth + 3) this.progress = road.primaryProgress;
    this.roadSurfaceMessage = road.distance > road.road.halfWidth + 1.4
      ? "OFF STREET · RETURN TO ROAD"
      : road.primaryProgress === null ? "OPEN-WORLD REROUTE ACTIVE" : "AUTHORED ROUTE · FREE STEERING";
    const onPrimaryRoad = road.primaryProgress !== null;
    // Hold the authored traffic tableau during the level card. Cars begin
    // flowing as soon as the player takes control, so a debug/load transition
    // cannot silently drain the nearest vehicles out of the opening view.
    const trafficDelta = input.accelerate || input.brake || Math.abs(this.speed) > .05 ? delta : 0;
    const driveRight = new THREE.Vector3(-driveForward.z, 0, driveForward.x);
    const busLaneOffset = this.busPosition.clone().sub(road.point).dot(road.right);
    let nearestGap = Infinity;
    for (let index = 0; index < this.traffic.length; index++) {
      const vehicle = this.traffic[index];
      const wave = .78 + .3 * (Math.sin(elapsed * .52 + vehicle.phase) * .5 + .5);
      if (elapsed >= vehicle.nextLaneChange && vehicle.progress < CITY_BUS_ROUTE_LENGTH - 90) {
        const currentIndex = TRAFFIC_LANES.reduce((best, lane, laneIndex) => Math.abs(lane - vehicle.targetLane) < Math.abs(TRAFFIC_LANES[best] - vehicle.targetLane) ? laneIndex : best, 0);
        const passingBus = onPrimaryRoad && vehicle.progress > this.progress - 20 && vehicle.progress < this.progress + 12 && Math.abs(vehicle.lane * LANE_WIDTH - busLaneOffset) < 2.5;
        const direction = passingBus ? (currentIndex < TRAFFIC_LANES.length - 1 ? 1 : -1) : (Math.sin(vehicle.phase + elapsed * .19) >= 0 ? 1 : -1);
        const nextIndex = THREE.MathUtils.clamp(currentIndex + direction, 0, TRAFFIC_LANES.length - 1);
        vehicle.targetLane = TRAFFIC_LANES[nextIndex];
        vehicle.nextLaneChange = elapsed + 3.1 + (index * 1.37 % 4.8);
      }
      vehicle.lane += (vehicle.targetLane - vehicle.lane) * (1 - Math.exp(-trafficDelta * (Math.abs(vehicle.targetLane - vehicle.lane) > .08 ? 1.65 : 4)));
      const target = vehicle.cruise * wave;
      vehicle.speed += (target - vehicle.speed) * (1 - Math.exp(-trafficDelta * 1.65));
      vehicle.progress = Math.min(CITY_BUS_ROUTE_LENGTH + 24, vehicle.progress + vehicle.speed * trafficDelta);
      if (vehicle.progress < this.progress - 70 && this.progress < CITY_BUS_ROUTE_LENGTH - 260) {
        vehicle.progress = Math.min(CITY_BUS_ROUTE_LENGTH + 20, this.progress + 115 + (index * 47 % 520));
        vehicle.speed = Math.max(vehicle.speed, vehicle.cruise * .82);
        vehicle.root.visible = true;
      } else vehicle.root.visible = vehicle.progress <= CITY_BUS_ROUTE_LENGTH + 7;
      const vehicleFrame = routeFrame(vehicle.progress), vehiclePosition = vehicleFrame.center.clone().addScaledVector(vehicleFrame.right, vehicle.lane * LANE_WIDTH);
      const toVehicle = vehiclePosition.sub(this.busPosition);
      if (driveForward.dot(toVehicle) > 0 && driveForward.dot(vehicleFrame.tangent) > .25 && Math.abs(driveRight.dot(toVehicle)) < 2.35 && toVehicle.length() < 62) nearestGap = Math.min(nearestGap, toVehicle.length());
    }
    for (const vehicle of this.localTraffic) {
      vehicle.distance += vehicle.speed * trafficDelta;
      const frame = closedPathFrame(vehicle.path, vehicle.distance);
      vehicle.root.position.copy(frame.center).addScaledVector(frame.right, vehicle.laneOffset); vehicle.root.position.y += .02; vehicle.root.rotation.y = frame.yaw;
      const toVehicle = vehicle.root.position.clone().sub(this.busPosition);
      const headingAgreement = driveForward.dot(frame.tangent);
      if (driveForward.dot(toVehicle) > 0 && headingAgreement > .25 && Math.abs(driveRight.dot(toVehicle)) < 2.35 && toVehicle.length() < 58) nearestGap = Math.min(nearestGap, toVehicle.length());
    }
    if (this.speed < -.08) this.trafficMessage = "REVERSING · CHECK MIRRORS";
    else if (input.handbrake && this.speed > 8) this.trafficMessage = "HANDBRAKE TURN · REAR WEIGHT TRANSFER";
    else if (nearestGap < 28) this.trafficMessage = nearestGap < 10 ? "DODGE NOW · VEHICLE AHEAD" : "CHANGE LANES TO PASS";
    else if (!onPrimaryRoad) this.trafficMessage = "REROUTING THROUGH LIVE UPPER WEST SIDE TRAFFIC";
    else this.trafficMessage = this.speed > 42 ? "HIGH-SPEED RUN · WEST SIDE HIGHWAY" : Math.abs(this.speed) < 2 && input.accelerate ? "TRAFFIC OPENING AHEAD" : "FAST CITY TRAFFIC · ALL LANES SOUTHBOUND";
    this.updateSignalVisuals(elapsed);
    this.updateTransforms(elapsed, delta);
    this.pedestrians.forEach(agent => updateAmbientHumanAgent(agent, elapsed, delta));
    this.sun.position.copy(this.busPosition).add(new THREE.Vector3(-40, 58, 30)); this.sun.target.position.copy(this.busPosition);
  }

  private updateTransforms(elapsed: number, delta: number) {
    this.bus.root.position.copy(this.busPosition); this.bus.root.rotation.y = this.busHeading;
    this.bus.root.rotation.z = -this.steerAmount * THREE.MathUtils.clamp(Math.abs(this.speed) / HIGHWAY_TOP_SPEED, 0, 1) * .035;
    this.bus.root.position.y += Math.sin(elapsed * 5.5) * Math.min(.018, Math.abs(this.speed) * .0015);
    this.bus.steeringWheel.rotation.z = -this.steerAmount * .9;
    this.bus.root.traverse(object => { if (object.name === "rescue-bus-road-wheel") object.rotation.x -= this.speed * delta / .49; });
    for (const vehicle of this.traffic) { const frame = routeFrame(vehicle.progress); vehicle.root.position.copy(frame.center).addScaledVector(frame.right, vehicle.lane * LANE_WIDTH); vehicle.root.position.y += .02; vehicle.root.rotation.y = frame.yaw; }
    for (const vehicle of this.localTraffic) { const frame = closedPathFrame(vehicle.path, vehicle.distance); vehicle.root.position.copy(frame.center).addScaledVector(frame.right, vehicle.laneOffset); vehicle.root.position.y += .02; vehicle.root.rotation.y = frame.yaw; }
  }

  private updateSignalVisuals(elapsed: number) {
    for (const signal of this.signals) {
      const active = signalAspectAt(elapsed, signal.progress);
      for (const aspect of ["RED", "YELLOW", "GREEN"] as const) setSignalLens(signal.lenses[aspect], aspect, aspect === active);
    }
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; markPremiumCharactersDisposed(this.root); this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(surface => materials.add(surface)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(surface => surface.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
