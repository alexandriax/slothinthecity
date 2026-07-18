import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Sky } from "three/addons/objects/Sky.js";
import type { GameTextures } from "../rendering/textures";
import { createPremiumHuman, createPremiumSlothFriend, markPremiumCharactersDisposed } from "./PremiumCharacter";
import { createAmbientHumanAgent, updateAmbientHumanAgent, type AmbientHumanAgent } from "./characters/AmbientHumanMotion";

export type CityBusInput = {
  accelerate: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  handbrake: boolean;
};

type TrafficVehicle = {
  root: THREE.Group;
  progress: number;
  lane: number;
  speed: number;
  cruise: number;
  phase: number;
};

const ROUTE_LENGTH = 1180;
const LANE_WIDTH = 3.35;
const ROUTE_LEGS = [
  { from: 0, to: 155, name: "Southern Boulevard", detail: "Bronx Zoo shuttle gate" },
  { from: 155, to: 330, name: "Bronx River Parkway", detail: "south toward East 177th Street" },
  { from: 330, to: 505, name: "Cross Bronx Expressway", detail: "westbound toward the Hudson" },
  { from: 505, to: 705, name: "Henry Hudson Parkway", detail: "Manhattan-bound river crossing" },
  { from: 705, to: 1038, name: "West Side Highway", detail: "south along the Hudson River" },
  { from: 1038, to: ROUTE_LENGTH, name: "West 79th Street · Central Park West", detail: "American Museum of Natural History" },
] as const;

function routeCenter(progress: number) {
  const p = THREE.MathUtils.clamp(progress, 0, ROUTE_LENGTH);
  const x = p < 330
    ? Math.sin(p / 118) * 13
    : p < 705
      ? 4 + Math.sin((p - 290) / 92) * 19
      : p < 1038
        ? -11 + Math.sin((p - 705) / 165) * 7
        : -6 + (p - 1038) * .075 + Math.sin((p - 1038) / 30) * 2.2;
  return new THREE.Vector3(x, p < 505 ? Math.sin(p / 145) * 1.4 : p < 705 ? 1.8 - (p - 505) * .007 : .4, -p);
}

function routeFrame(progress: number) {
  const before = routeCenter(Math.max(0, progress - .5)), after = routeCenter(Math.min(ROUTE_LENGTH, progress + .5));
  const tangent = after.sub(before).setY(0).normalize();
  const right = new THREE.Vector3(-tangent.z, 0, tangent.x);
  const yaw = Math.atan2(-tangent.x, -tangent.z);
  return { center: routeCenter(progress), tangent, right, yaw };
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
    context.font = "700 78px Helvetica, Arial, sans-serif"; context.fillText(title, 512, 145);
    context.fillStyle = "#d3e7d0"; context.font = "600 35px Helvetica, Arial, sans-serif"; context.fillText(subtitle, 512, 252);
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

function makeBus(quality: number, textures: GameTextures, passengerTextures: THREE.Texture[]) {
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
  const destination = new THREE.Mesh(new RoundedBoxGeometry(1.46, .24, .06, 4, .025), new THREE.MeshBasicMaterial({ map: destinationTexture, toneMapped: false }));
  // Keep the route box in the header above the driver's eye line; it should
  // identify the vehicle without becoming a billboard across the windshield.
  destination.position.set(.36, 2.7, -3.98); root.add(destination);
  const wheelGeometry = new THREE.CylinderGeometry(.49, .49, .32, quality > .75 ? 28 : 18);
  for (const side of [-1, 1]) for (const z of [-2.5, 2.45]) {
    const wheel = new THREE.Mesh(wheelGeometry, rubber); wheel.rotation.z = Math.PI / 2; wheel.position.set(side * 1.58, .55, z); wheel.name = "rescue-bus-road-wheel"; root.add(wheel);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.2, .2, .34, 18), metal); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); root.add(hub);
  }
  const dashboard = new THREE.Mesh(new RoundedBoxGeometry(2.7, .5, .72, 5, .08), dark); dashboard.position.set(0, 1.38, -3.48); root.add(dashboard);
  const steering = new THREE.Mesh(new THREE.TorusGeometry(.27, .045, 9, 30), rubber); steering.position.set(-.82, 1.74, -3.28); steering.rotation.x = -.25; root.add(steering);
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
  setShadows(root, quality > .58); return root;
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

function addRoadNetwork(root: THREE.Group, ownedTextures: THREE.Texture[], quality: number, textures: GameTextures) {
  const roadTexture = roadSurfaceTexture(); roadTexture.wrapS = roadTexture.wrapT = THREE.RepeatWrapping; roadTexture.repeat.set(2, 8); roadTexture.anisotropy = 8; ownedTextures.push(roadTexture);
  const asphalt = new THREE.MeshStandardMaterial({ color: "#5a5e5f", map: roadTexture, bumpMap: roadTexture, bumpScale: .018, roughness: .94 });
  const concrete = new THREE.MeshStandardMaterial({ color: "#8b8980", roughness: .9 });
  const lane = new THREE.MeshStandardMaterial({ color: "#ebe5c5", roughness: .75, emissive: "#4a4632", emissiveIntensity: .06 });
  for (let progress = 0; progress < ROUTE_LENGTH; progress += 24) {
    const next = Math.min(ROUTE_LENGTH, progress + 24), a = routeCenter(progress), b = routeCenter(next), frame = routeFrame((progress + next) / 2), length = a.distanceTo(b);
    const road = new THREE.Mesh(new RoundedBoxGeometry(21.5, .18, length + .8, 3, .04), asphalt); road.name = "compressed-nyc-road-segment"; road.position.copy(a).add(b).multiplyScalar(.5); road.position.y -= .08; road.rotation.y = frame.yaw; root.add(road);
    for (const side of [-1, 1]) {
      const walk = new THREE.Mesh(new RoundedBoxGeometry(5.2, .28, length + .6, 3, .05), concrete); walk.position.copy(road.position).addScaledVector(frame.right, side * 13.2); walk.position.y += .07; walk.rotation.y = frame.yaw; root.add(walk);
      const barrier = new THREE.Mesh(new RoundedBoxGeometry(.28, .72, length + .25, 3, .05), concrete); barrier.position.copy(road.position).addScaledVector(frame.right, side * 10.95); barrier.position.y += .35; barrier.rotation.y = frame.yaw; root.add(barrier);
    }
    for (const offset of [-LANE_WIDTH * 1.5, -LANE_WIDTH * .5, LANE_WIDTH * .5, LANE_WIDTH * 1.5]) {
      const stripe = new THREE.Mesh(new RoundedBoxGeometry(.09, .025, length * .62, 2, .01), lane); stripe.position.copy(road.position).addScaledVector(frame.right, offset); stripe.position.y += .12; stripe.rotation.y = frame.yaw; root.add(stripe);
    }
  }
  const signalMetal = new THREE.MeshStandardMaterial({ color: "#26302f", metalness: .7, roughness: .35 });
  const signalHousing = new THREE.MeshStandardMaterial({ color: "#151b19", metalness: .42, roughness: .48 });
  const signalColors = [
    new THREE.MeshStandardMaterial({ color: "#b52d24", emissive: "#8a110d", emissiveIntensity: .65, roughness: .3 }),
    new THREE.MeshStandardMaterial({ color: "#e0aa21", emissive: "#8a5e08", emissiveIntensity: .35, roughness: .3 }),
    new THREE.MeshStandardMaterial({ color: "#3c9b5b", emissive: "#12602d", emissiveIntensity: .52, roughness: .3 }),
  ];
  for (const stop of [126, 282, 1044, 1114]) {
    const frame = routeFrame(stop);
    const crossing = new THREE.Group(); crossing.name = "new-york-signalized-crosswalk";
    for (let stripe = -7; stripe <= 7; stripe++) {
      const mark = new THREE.Mesh(new RoundedBoxGeometry(.82, .022, 4.7, 2, .012), lane);
      mark.position.copy(frame.center).addScaledVector(frame.right, stripe * 1.25).addScaledVector(frame.tangent, -1.2);
      mark.position.y += .13; mark.rotation.y = frame.yaw; crossing.add(mark);
    }
    for (const side of [-1, 1]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.08, .11, 5.2, 10), signalMetal);
      pole.position.copy(frame.center).addScaledVector(frame.right, side * 10.25); pole.position.y += 2.6; crossing.add(pole);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, 4.7, 9), signalMetal);
      arm.position.copy(pole.position).addScaledVector(frame.right, -side * 2.25).add(new THREE.Vector3(0, 2.25, 0)); arm.rotation.z = Math.PI / 2; crossing.add(arm);
      const housing = new THREE.Mesh(new RoundedBoxGeometry(.46, 1.18, .34, 4, .045), signalHousing);
      housing.position.copy(arm.position).addScaledVector(frame.right, -side * 2.15).add(new THREE.Vector3(0, -.42, 0)); housing.rotation.y = frame.yaw; crossing.add(housing);
      for (let lens = 0; lens < 3; lens++) {
        const light = new THREE.Mesh(new THREE.CircleGeometry(.12, 18), signalColors[lens]);
        light.position.copy(housing.position).add(new THREE.Vector3(0, .34 - lens * .34, 0)).addScaledVector(frame.tangent, -.18);
        light.rotation.set(0, frame.yaw, 0); crossing.add(light);
      }
    }
    root.add(crossing);
  }
  const windows = windowTexture(); windows.wrapS = windows.wrapT = THREE.RepeatWrapping; windows.repeat.set(1, 2.25); ownedTextures.push(windows);
  const buildingMaterials = ["#a99583", "#93877b", "#817d78", "#b39d85", "#77716c"].map(color => new THREE.MeshStandardMaterial({ color, map: windows, emissive: "#493b2a", emissiveIntensity: .08, roughness: .84 }));
  const corniceMaterials = ["#aaa08d", "#6f675e"].map(color => new THREE.MeshStandardMaterial({ color, roughness: .85 }));
  const baseMaterials = ["#403f3b", "#6f6458", "#514b45"].map(color => new THREE.MeshStandardMaterial({ color, map: textures.stone, bumpMap: textures.stone, bumpScale: .025, roughness: .9 }));
  const storefrontMaterials = ["#7fa2a7", "#b49065", "#648b84", "#8e6b82"].map(color => new THREE.MeshPhysicalMaterial({ color, roughness: .2, transmission: .12, transparent: true, opacity: .82, metalness: .06 }));
  const fireEscapeMaterial = new THREE.MeshStandardMaterial({ color: "#242a29", roughness: .56, metalness: .68 });
  const buildingCount = quality < .58 ? 58 : quality < .82 ? 86 : 118;
  for (let index = 0; index < buildingCount; index++) {
    const progress = 18 + index / Math.max(1, buildingCount - 1) * (ROUTE_LENGTH - 36), frame = routeFrame(progress), side = index % 2 ? 1 : -1, groundY = frame.center.y;
    const urban = progress > 700, width = 7 + index % 5 * 2.2, depth = 7 + index % 4 * 2.6, height = urban ? 15 + index % 9 * 5.2 : 7 + index % 6 * 3.1;
    const building = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 3, .16), buildingMaterials[index % buildingMaterials.length]);
    building.name = urban ? "west-side-manhattan-streetwall" : "bronx-neighborhood-building";
    building.position.copy(frame.center).addScaledVector(frame.right, side * (17 + depth * .5 + index % 3 * 2.5)); building.position.y += height * .5 - .05; building.rotation.y = frame.yaw; root.add(building);
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
  for (const leg of ROUTE_LEGS) {
    const progress = leg.from + 18, frame = routeFrame(progress), texture = signTexture(leg.name.toUpperCase(), leg.detail.toUpperCase()); ownedTextures.push(texture);
    const gantry = new THREE.Group(); gantry.name = "nyc-route-wayfinding-" + leg.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const beam = new THREE.Mesh(new RoundedBoxGeometry(20, .24, .24, 3, .04), concrete); beam.position.y = 5.8; gantry.add(beam);
    for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, 5.8, 10), concrete); post.position.set(side * 9.2, 2.9, 0); gantry.add(post); }
    const sign = new THREE.Mesh(new RoundedBoxGeometry(7.6, 2.25, .16, 4, .04), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); sign.position.set(0, 4.55, -.18); gantry.add(sign);
    gantry.position.copy(frame.center); gantry.rotation.y = frame.yaw; root.add(gantry);
  }
  const river = new THREE.Mesh(new THREE.PlaneGeometry(150, 430), new THREE.MeshPhysicalMaterial({ color: "#446d79", roughness: .24, metalness: .05, clearcoat: .6 })); river.name = "hudson-river-corridor"; river.rotation.x = -Math.PI / 2; river.position.set(-83, -.22, -850); root.add(river);

  const streetscapeCount = quality < .58 ? 20 : quality < .82 ? 34 : 52;
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
    const progress = 16 + index / Math.max(1, streetscapeCount - 1) * (ROUTE_LENGTH - 32);
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

export class CityBusWorld {
  readonly root = new THREE.Group();
  readonly arrivalTarget = routeCenter(ROUTE_LENGTH).add(new THREE.Vector3(0, 0, -3));
  readonly routeMilestones = ROUTE_LEGS;
  private readonly bus: THREE.Group;
  private readonly traffic: TrafficVehicle[] = [];
  private readonly pedestrians: AmbientHumanAgent[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly sun: THREE.DirectionalLight;
  private progress = 0;
  private lateral = -LANE_WIDTH * .5;
  private speed = 0;
  private trafficMessage = "Zoo shuttle loading zone";
  private disposed = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1, startProgress = 0) {
    this.root.name = "bronx-to-natural-history-museum-driving-level"; scene.add(this.root);
    this.progress = THREE.MathUtils.clamp(startProgress, 0, ROUTE_LENGTH - .5);
    addCitySky(this.root);
    addRoadNetwork(this.root, this.ownedTextures, quality, textures);
    this.bus = makeBus(quality, textures, this.ownedTextures); this.root.add(this.bus);
    const trafficCount = quality < .58 ? 16 : quality < .82 ? 24 : 30;
    for (let index = 0; index < trafficCount; index++) {
      const car = makeTrafficCar(index, quality), vehicle: TrafficVehicle = { root: car, progress: (this.progress + 12 + index * ROUTE_LENGTH / trafficCount) % ROUTE_LENGTH, lane: [-.5, .5, -1.5, 1.5][index % 4], speed: 3.2 + index % 4 * .45, cruise: 4.6 + index % 5 * .52, phase: index * 1.83 };
      this.traffic.push(vehicle); this.root.add(car);
    }
    const skins = ["#b77859", "#704936", "#d0a17d", "#926047", "#573c32", "#c28b6b"];
    const pedestrianCount = quality < .58 ? 6 : quality < .82 ? 10 : 14;
    for (let index = 0; index < pedestrianCount; index++) {
      const progress = 16 + index / Math.max(1, pedestrianCount - 1) * (ROUTE_LENGTH - 32), atMuseum = progress > 1038, frame = routeFrame(progress), side = index % 2 ? 1 : -1;
      const result = createPremiumHuman({ role: "visitor", quality, variant: 40 + index, faceVariant: 7 + index, coat: ["#476779", "#8a5143", "#596846", "#7a668c"][index % 4], trousers: "#30363c", skin: skins[index % skins.length], outfit: index % 2 ? "knit-chinos" : "cotton-denim", accessory: index % 3 === 1 ? "tote" : "backpack", pose: "neutral" });
      result.root.name = atMuseum ? "central-park-west-pedestrian-" + index : "southern-boulevard-pedestrian-" + index;
      result.root.position.copy(frame.center).addScaledVector(frame.right, side * 13.2); result.root.position.y += .2; this.root.add(result.root); this.ownedTextures.push(...result.ownedTextures);
      this.pedestrians.push(createAmbientHumanAgent(result.root, { axis: frame.tangent, travel: 3.5 + index % 3, speed: .76 + index % 2 * .08, pauseSeconds: 2.2 + index % 3, phase: index * 2.4 }));
    }
    this.sun = new THREE.DirectionalLight("#fff0cf", 2.75); this.sun.castShadow = quality > .58; this.sun.shadow.mapSize.set(quality > .82 ? 2048 : 1024, quality > .82 ? 2048 : 1024); this.root.add(this.sun, this.sun.target);
    const ambient = new THREE.HemisphereLight("#c7dde3", "#45493c", 1.72); ambient.name = "city-evening-hemisphere-light"; this.root.add(ambient);
    this.updateTransforms(0, 0);
  }

  get speedMetersPerSecond() { return this.speed; }
  get remainingMeters() { return Math.max(0, ROUTE_LENGTH - this.progress); }
  get currentRoad() { return ROUTE_LEGS.find(leg => this.progress >= leg.from && this.progress < leg.to)?.name ?? "American Museum of Natural History"; }
  get congestionStatus() { return this.trafficMessage; }
  get parkingReached() { return this.progress >= ROUTE_LENGTH - 2.2 && this.speed < .6; }
  get headingYaw() { return routeFrame(this.progress).yaw; }
  get cameraPosition() {
    const frame = routeFrame(this.progress), point = frame.center.addScaledVector(frame.right, this.lateral - .72).addScaledVector(frame.tangent, 2.15);
    point.y += 2.27; return point;
  }

  update(delta: number, elapsed: number, input: CityBusInput) {
    if (this.disposed) return;
    const frame = routeFrame(this.progress), desiredLateral = this.lateral + ((input.steerRight ? 1 : 0) - (input.steerLeft ? 1 : 0)) * delta * (2.1 + this.speed * .17);
    this.lateral = THREE.MathUtils.clamp(desiredLateral, -LANE_WIDTH * 1.35, LANE_WIDTH * 1.35);
    const targetThrottle = input.accelerate ? 12.5 : 0;
    this.speed += (targetThrottle - this.speed) * (1 - Math.exp(-delta * (input.accelerate ? .72 : .42)));
    if (input.brake) this.speed = Math.max(0, this.speed - delta * 8.5);
    if (input.handbrake) this.speed = Math.max(0, this.speed - delta * 15);
    const signalStops = [126, 282, 1044, 1114], signal = signalStops.find(stop => stop > this.progress && stop - this.progress < 28);
    const signalRed = signal !== undefined && ((elapsed + signal * .07) % 16) < 6.2;
    // Hold the authored traffic tableau during the level card. Cars begin
    // flowing as soon as the player takes control, so a debug/load transition
    // cannot silently drain the nearest vehicles out of the opening view.
    const trafficDelta = input.accelerate || this.speed > .05 ? delta : 0;
    let nearestGap = Infinity;
    for (const vehicle of this.traffic) {
      const wave = .28 + .72 * (Math.sin(elapsed * .34 + vehicle.phase) * .5 + .5);
      const signalAhead = signalStops.find(stop => stop > vehicle.progress && stop - vehicle.progress < 22 && ((elapsed + stop * .07) % 16) < 6.2);
      const target = signalAhead ? Math.max(0, (signalAhead - vehicle.progress - 4) * .65) : vehicle.cruise * wave;
      vehicle.speed += (target - vehicle.speed) * (1 - Math.exp(-trafficDelta * 1.25)); vehicle.progress = Math.min(ROUTE_LENGTH + 30, vehicle.progress + vehicle.speed * trafficDelta);
      if (Math.abs(vehicle.lane * LANE_WIDTH - this.lateral) < 2.3 && vehicle.progress > this.progress) nearestGap = Math.min(nearestGap, vehicle.progress - this.progress);
    }
    if (nearestGap < 18) { const cap = Math.max(0, (nearestGap - 7) * .75); this.speed = Math.min(this.speed, cap); this.trafficMessage = nearestGap < 10 ? "BRAKING · VEHICLE AHEAD" : "STOP-AND-GO TRAFFIC"; }
    else if (signalRed && signal !== undefined) { this.speed = Math.min(this.speed, Math.max(0, (signal - this.progress - 4) * .7)); this.trafficMessage = "RED LIGHT · HOLD POSITION"; }
    else this.trafficMessage = this.speed < 2 && input.accelerate ? "CONGESTION CLEARING" : "MOVING WITH CITY TRAFFIC";
    const remaining = ROUTE_LENGTH - this.progress;
    if (remaining < 35) { this.speed = Math.min(this.speed, Math.max(0, (remaining - 1.2) * .34)); this.trafficMessage = "MUSEUM BUS BAY · BRAKE TO PARK"; }
    this.progress = Math.min(ROUTE_LENGTH, this.progress + this.speed * delta);
    this.updateTransforms(elapsed, delta);
    this.pedestrians.forEach(agent => updateAmbientHumanAgent(agent, elapsed, delta));
    this.sun.position.copy(frame.center).add(new THREE.Vector3(-40, 58, 30)); this.sun.target.position.copy(frame.center);
  }

  private updateTransforms(elapsed: number, delta: number) {
    const busFrame = routeFrame(this.progress); this.bus.position.copy(busFrame.center).addScaledVector(busFrame.right, this.lateral); this.bus.rotation.y = busFrame.yaw;
    this.bus.position.y += Math.sin(elapsed * 5.5) * Math.min(.018, this.speed * .0015);
    this.bus.traverse(object => { if (object.name === "rescue-bus-road-wheel") object.rotation.x -= this.speed * delta / .49; });
    for (const vehicle of this.traffic) { const frame = routeFrame(vehicle.progress); vehicle.root.position.copy(frame.center).addScaledVector(frame.right, vehicle.lane * LANE_WIDTH); vehicle.root.position.y += .02; vehicle.root.rotation.y = frame.yaw; }
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; markPremiumCharactersDisposed(this.root); this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(surface => materials.add(surface)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(surface => surface.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
