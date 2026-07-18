import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export type PersonalMobilityVehicle = {
  root: THREE.Group;
  wheels: THREE.Group[];
  gripAnchors: readonly [THREE.Object3D, THREE.Object3D] | null;
};

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, segments = 12) {
  const direction = end.clone().sub(start);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, direction.length(), segments), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}

function rollingWheel(radius: number, width: number, rubber: THREE.Material, hub: THREE.Material, segments = 20) {
  const pivot = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, segments, 2), rubber);
  tyre.rotation.z = Math.PI / 2;
  const wheelHub = new THREE.Mesh(new THREE.CylinderGeometry(radius * .35, radius * .35, width + .025, Math.max(12, segments - 4)), hub);
  wheelHub.rotation.z = Math.PI / 2;
  pivot.add(tyre, wheelHub);
  return pivot;
}

/** Project-authored maple street deck with working trucks and rolling wheels. */
export function createSkateboard(variant = 0): PersonalMobilityVehicle {
  const root = new THREE.Group();
  root.name = "bronx-zoo-project-authored-fast-travel-skateboard";
  const maple = new THREE.MeshPhysicalMaterial({ color: variant % 2 ? "#d1a55e" : "#bd783e", roughness: .58, clearcoat: .3, clearcoatRoughness: .48 });
  const grip = new THREE.MeshStandardMaterial({ color: "#25292b", roughness: .96, bumpScale: .02 });
  const metal = new THREE.MeshStandardMaterial({ color: "#9da5a4", roughness: .28, metalness: .78 });
  const rubber = new THREE.MeshStandardMaterial({ color: "#d9d3b2", roughness: .72 });
  const accent = new THREE.MeshStandardMaterial({ color: "#315d66", roughness: .62 });

  const deck = new THREE.Mesh(new RoundedBoxGeometry(.48, .115, 1.58, 8, .075), maple);
  deck.name = "skateboard-continuous-kicktail-maple-deck";
  deck.position.y = .34;
  root.add(deck);
  const gripTape = new THREE.Mesh(new RoundedBoxGeometry(.445, .018, 1.48, 7, .06), grip);
  gripTape.name = "skateboard-textured-grip-tape";
  gripTape.position.set(0, .405, 0);
  root.add(gripTape);
  for (const z of [-.62, .62]) {
    const kick = new THREE.Mesh(new RoundedBoxGeometry(.43, .095, .28, 6, .06), maple);
    kick.name = "skateboard-formed-nose-and-kicktail";
    kick.position.set(0, .36, z);
    kick.rotation.x = z < 0 ? -.16 : .16;
    root.add(kick);
  }

  const wheels: THREE.Group[] = [];
  for (const z of [-.52, .52]) {
    const truck = new THREE.Group(); truck.name = "skateboard-cast-aluminum-truck"; truck.position.set(0, .23, z);
    const hanger = cylinderBetween(new THREE.Vector3(-.37, 0, 0), new THREE.Vector3(.37, 0, 0), .035, metal, 12); truck.add(hanger);
    const baseplate = new THREE.Mesh(new RoundedBoxGeometry(.24, .055, .19, 4, .025), metal); baseplate.position.y = .065; truck.add(baseplate);
    const bushing = new THREE.Mesh(new THREE.CylinderGeometry(.055, .065, .11, 12), accent); bushing.position.y = .02; truck.add(bushing);
    root.add(truck);
    for (const x of [-.4, .4]) {
      const wheel = rollingWheel(.095, .065, rubber, metal, 18);
      wheel.name = "skateboard-road-wheel";
      wheel.position.set(x, .18, z);
      root.add(wheel); wheels.push(wheel);
    }
  }
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
  return { root, wheels, gripAnchors: null };
}

/**
 * Upright shared e-scooter inspired by common New York micromobility fleets.
 * The stem, fork, brake line, lights, grips, wheels and standing deck are all
 * modeled separately so the parked row and moving convoy hold up at eye level.
 */
export function createElectricScooter(variant = 0): PersonalMobilityVehicle {
  const root = new THREE.Group();
  root.name = `amnh-electric-scooter-${variant + 1}`;
  const bodyColors = ["#2e6267", "#3f5559", "#76533e", "#526248", "#4f4867"];
  const body = new THREE.MeshPhysicalMaterial({ color: bodyColors[variant % bodyColors.length], roughness: .42, clearcoat: .42, clearcoatRoughness: .32 });
  const black = new THREE.MeshStandardMaterial({ color: "#171a1b", roughness: .88 });
  const metal = new THREE.MeshStandardMaterial({ color: "#899191", roughness: .3, metalness: .72 });
  const cable = new THREE.MeshStandardMaterial({ color: "#202324", roughness: .66, metalness: .25 });
  const lamp = new THREE.MeshStandardMaterial({ color: "#fff3c2", emissive: "#ffd879", emissiveIntensity: 1.7, roughness: .18 });
  const tail = new THREE.MeshStandardMaterial({ color: "#aa302b", emissive: "#72110e", emissiveIntensity: .75, roughness: .25 });

  const deck = new THREE.Mesh(new RoundedBoxGeometry(.42, .15, 1.15, 8, .09), body);
  deck.name = "electric-scooter-battery-standing-deck"; deck.position.set(0, .2, .05); root.add(deck);
  const deckPad = new THREE.Mesh(new RoundedBoxGeometry(.36, .018, .86, 6, .05), black);
  deckPad.name = "electric-scooter-nonslip-deck-pad"; deckPad.position.set(0, .286, .08); root.add(deckPad);
  const rearFender = new THREE.Mesh(new THREE.TorusGeometry(.19, .035, 10, 26, Math.PI), body);
  rearFender.name = "electric-scooter-rear-wheel-fender"; rearFender.position.set(0, .3, .61); rearFender.rotation.set(0, Math.PI / 2, 0); root.add(rearFender);

  const wheels: THREE.Group[] = [];
  for (const z of [-.61, .62]) {
    const wheel = rollingWheel(.19, .105, black, metal, 24);
    wheel.name = "electric-scooter-pneumatic-road-wheel"; wheel.position.set(0, .2, z); root.add(wheel); wheels.push(wheel);
  }
  const fork = cylinderBetween(new THREE.Vector3(0, .2, -.61), new THREE.Vector3(0, .47, -.53), .037, metal, 14);
  fork.name = "electric-scooter-front-fork"; root.add(fork);
  const stem = cylinderBetween(new THREE.Vector3(0, .39, -.54), new THREE.Vector3(0, 1.36, -.31), .052, body, 16);
  stem.name = "electric-scooter-sloped-steering-stem"; root.add(stem);
  const handlebar = cylinderBetween(new THREE.Vector3(-.39, 1.37, -.3), new THREE.Vector3(.39, 1.37, -.3), .036, metal, 14);
  handlebar.name = "electric-scooter-full-width-handlebar"; root.add(handlebar);
  for (const side of [-1, 1]) {
    const handgrip = cylinderBetween(new THREE.Vector3(side * .27, 1.37, -.3), new THREE.Vector3(side * .43, 1.37, -.3), .048, black, 14);
    handgrip.name = "electric-scooter-rubber-handgrip"; root.add(handgrip);
    const brakeLever = new THREE.Mesh(new RoundedBoxGeometry(.13, .025, .035, 3, .01), metal);
    brakeLever.name = "electric-scooter-hand-brake-lever"; brakeLever.position.set(side * .27, 1.31, -.315); brakeLever.rotation.z = side * .18; root.add(brakeLever);
  }
  const display = new THREE.Mesh(new RoundedBoxGeometry(.22, .08, .11, 5, .025), black);
  display.name = "electric-scooter-speed-display"; display.position.set(0, 1.39, -.3); root.add(display);
  const headlight = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 10), lamp);
  headlight.name = "electric-scooter-led-headlight"; headlight.position.set(0, 1.25, -.37); root.add(headlight);
  const tailLight = new THREE.Mesh(new RoundedBoxGeometry(.16, .07, .035, 4, .018), tail);
  tailLight.name = "electric-scooter-rear-brake-light"; tailLight.position.set(0, .34, .72); root.add(tailLight);
  const brakeLine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-.3, 1.32, -.3), new THREE.Vector3(-.17, .98, -.42), new THREE.Vector3(-.11, .56, -.52), new THREE.Vector3(-.06, .3, -.6),
  ]), 18, .011, 7, false), cable);
  brakeLine.name = "electric-scooter-visible-brake-cable"; root.add(brakeLine);
  const leftGrip = new THREE.Object3D(); leftGrip.name = "electric-scooter-left-sloth-grip"; leftGrip.position.set(-.32, 1.37, -.27);
  const rightGrip = new THREE.Object3D(); rightGrip.name = "electric-scooter-right-sloth-grip"; rightGrip.position.set(.32, 1.37, -.27);
  root.add(leftGrip, rightGrip);
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = true; object.receiveShadow = true; } });
  return { root, wheels, gripAnchors: [leftGrip, rightGrip] };
}

export function rollPersonalMobility(vehicle: PersonalMobilityVehicle, distance: number, wheelRadius: number) {
  const rotation = distance / Math.max(.01, wheelRadius);
  vehicle.wheels.forEach(wheel => { wheel.rotation.x -= rotation; });
}
