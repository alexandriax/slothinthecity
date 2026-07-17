import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";
import { createPremiumHuman, markPremiumCharactersDisposed } from "./PremiumCharacter";
import { createAmbientHumanAgent, updateAmbientHumanAgent, type AmbientHumanAgent } from "./characters/AmbientHumanMotion";

type BoxObstacle = { minX: number; maxX: number; minZ: number; maxZ: number };
type CircleObstacle = { x: number; z: number; radius: number };

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([35, 39, 34, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Natural History Museum requires a 2D canvas context");
  draw(context); const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

function exhibitTexture(title: string, subtitle: string, accent = "#d6c18a") {
  return canvasTexture(1280, 480, context => {
    context.fillStyle = "#17221e"; context.fillRect(0, 0, 1280, 480);
    context.strokeStyle = accent; context.lineWidth = 13; context.strokeRect(18, 18, 1244, 444);
    context.fillStyle = "#f8f2de"; context.textAlign = "center"; context.textBaseline = "middle";
    context.font = "700 88px Georgia, serif"; context.fillText(title, 640, 175);
    context.fillStyle = accent; context.font = "600 34px Helvetica, Arial, sans-serif"; context.fillText(subtitle, 640, 312);
  });
}

function facadeBannerTexture() {
  return canvasTexture(1536, 512, context => {
    context.fillStyle = "#d9d1bd"; context.fillRect(0, 0, 1536, 512);
    context.fillStyle = "#3c3932"; context.textAlign = "center"; context.textBaseline = "middle";
    context.font = "700 83px Georgia, serif"; context.fillText("AMERICAN MUSEUM OF NATURAL HISTORY", 768, 210);
    context.font = "600 34px Helvetica, Arial, sans-serif"; context.fillText("CENTRAL PARK WEST · THEODORE ROOSEVELT MEMORIAL", 768, 340);
  });
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, segments = 14) {
  const direction = end.clone().sub(start), mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * .9, radius, direction.length(), segments, 2), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return mesh;
}

function setShadows(root: THREE.Object3D, cast: boolean) {
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = cast; object.receiveShadow = true; } });
}

function addExhibitSign(root: THREE.Group, ownedTextures: THREE.Texture[], title: string, subtitle: string, x: number, y: number, z: number, yaw = 0, scale = 1) {
  const texture = exhibitTexture(title, subtitle); ownedTextures.push(texture);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(5.8 * scale, 2.15 * scale, .14, 4, .035), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  sign.name = title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-museum-label"; sign.position.set(x, y, z); sign.rotation.y = yaw; root.add(sign);
}

function addArchitecture(root: THREE.Group, textures: GameTextures, ownedTextures: THREE.Texture[], quality: number, boxes: BoxObstacle[]) {
  const limestone = new THREE.MeshStandardMaterial({ color: "#c6bda8", map: textures.stone, roughness: .83 });
  const redStone = new THREE.MeshStandardMaterial({ color: "#7a4b40", map: textures.stone, roughness: .86 });
  const bronze = new THREE.MeshStandardMaterial({ color: "#4b4a3d", roughness: .38, metalness: .58 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#8eb4bd", roughness: .12, transparent: true, opacity: .6, transmission: .25 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(96, 290), new THREE.MeshStandardMaterial({ color: "#aa9e87", map: textures.stone, roughness: .7, metalness: .05 }));
  floor.name = "museum-polished-stone-floor"; floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -90); root.add(floor);
  const plaza = new THREE.Mesh(new THREE.PlaneGeometry(126, 66), new THREE.MeshStandardMaterial({ color: "#8c887d", map: textures.stone, roughness: .9 })); plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, -.02, 47); root.add(plaza);
  const park = new THREE.Mesh(new THREE.PlaneGeometry(80, 70), new THREE.MeshStandardMaterial({ color: "#425d39", map: textures.ground, roughness: 1 })); park.rotation.x = -Math.PI / 2; park.position.set(83, -.03, 45); root.add(park);
  const facade = new THREE.Group(); facade.name = "american-museum-central-park-west-facade";
  // Build real entrance apertures instead of placing decorative glass over an
  // opaque block. The rendered facade and collision opening now agree.
  const centerHeader = new THREE.Mesh(new RoundedBoxGeometry(74, 6, 12, 5, .16), limestone); centerHeader.name = "roosevelt-memorial-entrance-entablature"; centerHeader.position.set(0, 17, 17); facade.add(centerHeader);
  for (const side of [-1, 1]) {
    const entranceWing = new THREE.Mesh(new RoundedBoxGeometry(27, 14, 12, 5, .16), limestone);
    entranceWing.name = "roosevelt-memorial-open-entrance-masonry";
    entranceWing.position.set(side * 23.5, 7, 17);
    facade.add(entranceWing);
  }
  for (const side of [-1, 1]) { const wing = new THREE.Mesh(new RoundedBoxGeometry(28, 17, 18, 5, .18), redStone); wing.position.set(side * 47, 8.5, 14); facade.add(wing); }
  const steps = 9;
  for (let step = 0; step < steps; step++) { const stair = new THREE.Mesh(new RoundedBoxGeometry(34 + step * 1.25, .22, 1.25, 3, .04), limestone); stair.position.set(0, step * .18, 30 - step * 1.12); facade.add(stair); }
  for (let column = -5; column <= 5; column++) {
    if (column === 0) continue;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.62, .72, 10.5, quality > .72 ? 22 : 14), limestone); shaft.position.set(column * 4.5, 7.2, 24); facade.add(shaft);
    const capital = new THREE.Mesh(new RoundedBoxGeometry(1.7, .55, 1.7, 3, .08), limestone); capital.position.set(column * 4.5, 12.55, 24); facade.add(capital);
  }
  for (const x of [-6, 0, 6]) { const door = new THREE.Mesh(new RoundedBoxGeometry(4.6, 7.2, .16, 6, .08), glass); door.position.set(x, 4.35, 23.92); facade.add(door); }
  for (const x of [-6, 0, 6]) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(2.42, .24, 12, quality > .72 ? 36 : 24, Math.PI), limestone);
    arch.name = "central-park-west-carved-entrance-arch"; arch.position.set(x, 8, 24.08); facade.add(arch);
    for (const side of [-1, 1]) { const jamb = new THREE.Mesh(new RoundedBoxGeometry(.48, 5.9, .38, 3, .05), limestone); jamb.position.set(x + side * 2.35, 4.95, 24.03); facade.add(jamb); }
  }
  for (const side of [-1, 1]) for (let column = 0; column < 4; column++) for (let row = 0; row < 2; row++) {
    const window = new THREE.Mesh(new RoundedBoxGeometry(3.6, 4.15, .14, 5, .08), glass);
    window.name = "museum-wing-recessed-arched-window"; window.position.set(side * (37.5 + column * 6.1), 5.25 + row * 5.2, 23.08); facade.add(window);
    const sill = new THREE.Mesh(new RoundedBoxGeometry(4.2, .34, .5, 3, .04), limestone); sill.position.set(window.position.x, window.position.y - 2.25, 23.22); facade.add(sill);
  }
  for (const y of [14.6, 18.25]) { const cornice = new THREE.Mesh(new RoundedBoxGeometry(78, .58, .85, 3, .06), limestone); cornice.name = "roosevelt-memorial-carved-cornice"; cornice.position.set(0, y, 23.48); facade.add(cornice); }
  for (const side of [-1, 1]) {
    const banner = new THREE.Mesh(new RoundedBoxGeometry(2.2, 5.6, .1, 3, .03), new THREE.MeshStandardMaterial({ color: side > 0 ? "#244f55" : "#87513e", roughness: .72 }));
    banner.name = "amnh-seasonal-exhibition-banner"; banner.position.set(side * 29.5, 9.7, 24.02); facade.add(banner);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.34, 18, 12), new THREE.MeshStandardMaterial({ color: "#f6e0a2", emissive: "#d7a742", emissiveIntensity: .55, roughness: .3 })); lamp.position.set(side * 12.2, 4.1, 24.5); facade.add(lamp);
  }
  const bannerTexture = facadeBannerTexture(); ownedTextures.push(bannerTexture);
  const banner = new THREE.Mesh(new RoundedBoxGeometry(47, 3.2, .12, 4, .04), new THREE.MeshBasicMaterial({ map: bannerTexture, toneMapped: false })); banner.position.set(0, 16.6, 23.98); facade.add(banner);
  const statue = new THREE.Mesh(new THREE.CapsuleGeometry(1.05, 3.1, 8, 22), bronze); statue.position.set(0, 3.6, 37); facade.add(statue);
  const pedestal = new THREE.Mesh(new RoundedBoxGeometry(4.6, 2.4, 4.6, 5, .12), limestone); pedestal.position.set(0, 1.2, 37); facade.add(pedestal);
  root.add(facade);
  // Keep only the masonry beside the three open doors collidable.
  boxes.push({ minX: -38, maxX: -8.4, minZ: 22, maxZ: 26 }, { minX: 8.4, maxX: 38, minZ: 22, maxZ: 26 });

  const wall = new THREE.MeshStandardMaterial({ color: "#d2c9b7", roughness: .88 });
  const darkWall = new THREE.MeshStandardMaterial({ color: "#32423c", roughness: .9 });
  const addWall = (name: string, x: number, y: number, z: number, width: number, height: number, depth: number, surface = wall) => {
    const mesh = new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, 4, .08), surface); mesh.name = name; mesh.position.set(x, y, z); root.add(mesh); return mesh;
  };
  addWall("roosevelt-rotunda-west-wall", -45, 5.5, -8, 3, 11, 48);
  addWall("roosevelt-rotunda-east-wall", 45, 5.5, -8, 3, 11, 48);
  addWall("museum-west-gallery-outer-wall", -45, 5, -116, 3, 10, 170, darkWall);
  addWall("museum-east-gallery-outer-wall", 45, 5, -116, 3, 10, 170, darkWall);
  addWall("museum-fossil-halls-back-wall", 0, 6, -227, 92, 12, 3, darkWall);
  // Longitudinal galleries leave broad, legible portals at every cross hall.
  for (const x of [-17, 17]) for (const z of [-50, -112, -174]) {
    addWall("museum-gallery-pier", x, 4.2, z, 2.2, 8.4, 19, darkWall);
  }
  for (const z of [-31, -92, -153]) {
    addWall("museum-cross-gallery-west-partition", -33, 4.4, z, 22, 8.8, 2.1, wall);
    addWall("museum-cross-gallery-east-partition", 33, 4.4, z, 22, 8.8, 2.1, wall);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(92, 220), new THREE.MeshStandardMaterial({ color: "#d6cfbf", roughness: 1, side: THREE.DoubleSide })); ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 11.2, -105); root.add(ceiling);
  for (let z = 9; z > -220; z -= 26) for (const x of [-24, 0, 24]) {
    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(.28, .5, .18, 12), new THREE.MeshStandardMaterial({ color: "#eee2bd", emissive: "#ffe2a2", emissiveIntensity: 1.25 })); fixture.position.set(x, 8.8, z); root.add(fixture);
  }
}

function addRotundaDinosaurs(root: THREE.Group, bone: THREE.Material, circles: CircleObstacle[]) {
  const exhibit = new THREE.Group(); exhibit.name = "theodore-roosevelt-rotunda-barosaurus-allosaurus-display";
  const base = new THREE.Mesh(new RoundedBoxGeometry(23, .55, 12, 6, .15), new THREE.MeshStandardMaterial({ color: "#554d42", roughness: .82 })); base.position.set(0, .28, -5); exhibit.add(base);
  const hip = new THREE.Vector3(2, 5.6, -5), shoulder = new THREE.Vector3(-4.5, 7.8, -7.2);
  exhibit.add(cylinderBetween(hip, shoulder, .34, bone, 20));
  for (let index = 0; index < 24; index++) {
    const amount = index / 23, point = hip.clone().lerp(new THREE.Vector3(-14, 9.6, -8.5), amount); point.y += Math.sin(amount * Math.PI) * 1.2;
    const vertebra = new THREE.Mesh(new THREE.SphereGeometry(.27 - amount * .1, 16, 11), bone); vertebra.name = "barosaurus-neck-vertebra"; vertebra.position.copy(point); exhibit.add(vertebra);
  }
  for (const side of [-1, 1]) {
    const rearKnee = new THREE.Vector3(side * 2.2, 3, -2.8), rearFoot = new THREE.Vector3(side * 2.7, .72, -1.5);
    exhibit.add(cylinderBetween(hip.clone().add(new THREE.Vector3(side * 1.1, 0, 0)), rearKnee, .38, bone, 20), cylinderBetween(rearKnee, rearFoot, .29, bone, 18));
    const frontKnee = new THREE.Vector3(side * 3.2, 3.3, -8), frontFoot = new THREE.Vector3(side * 3.4, .72, -8.4);
    exhibit.add(cylinderBetween(shoulder.clone().add(new THREE.Vector3(side * .7, 0, 0)), frontKnee, .27, bone, 18), cylinderBetween(frontKnee, frontFoot, .22, bone, 18));
  }
  for (let index = 0; index < 12; index++) {
    const point = hip.clone().lerp(new THREE.Vector3(13, 4, -2), index / 11), vertebra = new THREE.Mesh(new THREE.SphereGeometry(.24 - index * .012, 14, 10), bone); vertebra.position.copy(point); exhibit.add(vertebra);
  }
  root.add(exhibit); circles.push({ x: 0, z: -5, radius: 12.2 });
}

function addBlueWhale(root: THREE.Group, circles: CircleObstacle[]) {
  const group = new THREE.Group(); group.name = "milstein-hall-blue-whale-life-size-model"; group.position.set(-28, 6.4, -66); group.rotation.y = .08;
  const surface = new THREE.MeshStandardMaterial({ color: "#31505d", roughness: .76 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(2.05, 8.8, 12, 32), surface); body.name = "suspended-blue-whale-continuous-body"; body.rotation.x = Math.PI / 2; group.add(body);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(1.7, 2.2, 10, 28), surface); head.position.z = -6; head.rotation.x = Math.PI / 2; group.add(head);
  for (const side of [-1, 1]) { const fin = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.4, 24), surface); fin.position.set(side * 2.25, -.25, -.5); fin.rotation.z = side * 1.12; group.add(fin); }
  root.add(group); circles.push({ x: -28, z: -66, radius: 8.5 });
}

function addAfricanMammals(root: THREE.Group, bone: THREE.Material, circles: CircleObstacle[]) {
  const group = new THREE.Group(); group.name = "akeley-hall-african-elephant-group"; group.position.set(27, 0, -70);
  const skin = new THREE.MeshStandardMaterial({ color: "#716f67", roughness: .96 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.72, 2.2, 10, 28), skin); body.position.y = 3.25; body.rotation.x = Math.PI / 2; group.add(body);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(1.28, .65, 10, 26), skin); head.position.set(0, 3.42, -2.8); head.rotation.x = Math.PI / 2; group.add(head);
  group.add(cylinderBetween(new THREE.Vector3(0, 2.9, -3.3), new THREE.Vector3(0, .75, -4.1), .35, skin, 22));
  for (const side of [-1, 1]) {
    for (const z of [-1.2, 1.3]) group.add(cylinderBetween(new THREE.Vector3(side * 1.05, 2.75, z), new THREE.Vector3(side * 1.08, .55, z), .42, skin, 20));
    const tusk = new THREE.Mesh(new THREE.ConeGeometry(.14, 2.2, 20), bone); tusk.position.set(side * .55, 2.55, -4); tusk.rotation.x = -.45; group.add(tusk);
    const ear = new THREE.Mesh(new THREE.CircleGeometry(1.35, 30), skin); ear.position.set(side * 1.25, 4.05, -2.2); ear.rotation.y = side * .72; group.add(ear);
  }
  root.add(group); circles.push({ x: 27, z: -70, radius: 6.3 });
}

function addEarthAndMeteoriteHalls(root: THREE.Group, circles: CircleObstacle[]) {
  const meteor = new THREE.Mesh(new THREE.IcosahedronGeometry(2.25, 4), new THREE.MeshStandardMaterial({ color: "#373b3b", roughness: .55, metalness: .72 })); meteor.name = "arthur-ross-hall-ahnighito-meteorite"; meteor.position.set(-28, 2.5, -128); meteor.scale.set(1.35, .85, 1.1); root.add(meteor); circles.push({ x: -28, z: -128, radius: 4.4 });
  const planet = new THREE.Group(); planet.name = "gottesman-hall-of-planet-earth-exhibits"; planet.position.set(27, 0, -127);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(2.5, 40, 28), new THREE.MeshStandardMaterial({ color: "#547b87", roughness: .54, metalness: .08 })); globe.position.y = 3.5; planet.add(globe);
  for (let index = 0; index < 9; index++) { const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(.55 + index % 3 * .14, 2), new THREE.MeshStandardMaterial({ color: ["#7f6854", "#665f59", "#8b7867"][index % 3], roughness: .96 })); rock.position.set(Math.cos(index * 2.3) * 4, .65, Math.sin(index * 2.3) * 4); planet.add(rock); }
  root.add(planet); circles.push({ x: 27, z: -127, radius: 5.2 });
}

function addMegatherium(root: THREE.Group, ownedTextures: THREE.Texture[], bone: THREE.Material, circles: CircleObstacle[]) {
  const gallery = new THREE.Group(); gallery.name = "fossil-mammal-halls-megatherium-americanum-finale";
  const stage = new THREE.Mesh(new RoundedBoxGeometry(23, .65, 16, 7, .18), new THREE.MeshStandardMaterial({ color: "#3d3730", roughness: .78 })); stage.position.set(0, .32, -198); gallery.add(stage);
  const skeleton = new THREE.Group(); skeleton.name = "megatherium-americanum-giant-ground-sloth-articulated-skeleton"; skeleton.position.set(0, .65, -199);
  // Present the skeleton on a three-quarter museum mount so its broad pelvis,
  // balancing tail, rib cage, and enormous manual claws read on approach.
  skeleton.rotation.y = -.34;
  const pelvis = new THREE.Mesh(new THREE.TorusGeometry(1.45, .38, 16, 38), bone); pelvis.name = "megatherium-broad-fossil-pelvis"; pelvis.position.set(0, 4.15, 1.7); pelvis.rotation.x = Math.PI / 2; skeleton.add(pelvis);
  const spineStart = new THREE.Vector3(0, 4.4, 1.4), spineEnd = new THREE.Vector3(0, 7.35, -1.3); skeleton.add(cylinderBetween(spineStart, spineEnd, .25, bone, 22));
  for (let index = 0; index < 18; index++) {
    const amount = index / 17, point = spineStart.clone().lerp(spineEnd, amount); point.y += Math.sin(amount * Math.PI) * .25;
    const vertebra = new THREE.Mesh(new THREE.SphereGeometry(.3 - amount * .05, 18, 12), bone); vertebra.name = "megatherium-articulated-spinal-vertebra"; vertebra.position.copy(point); skeleton.add(vertebra);
  }
  const ribMaterial = bone;
  for (const side of [-1, 1]) for (let index = 0; index < 7; index++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(1.25 - index * .045, .075, 10, 30, Math.PI * 1.2), ribMaterial); rib.name = "megatherium-curved-fossil-rib"; rib.position.set(side * .18, 5.2 + index * .28, .15 - index * .22); rib.rotation.set(Math.PI / 2, side * .18, side > 0 ? -.55 : 2.6); skeleton.add(rib);
  }
  const neck = new THREE.Vector3(0, 7.9, -1.65), skullPoint = new THREE.Vector3(0, 8.35, -2.25); skeleton.add(cylinderBetween(spineEnd, neck, .22, bone, 18));
  const skull = new THREE.Mesh(new RoundedBoxGeometry(1.18, .85, 1.55, 7, .28), bone); skull.name = "megatherium-long-fossil-skull"; skull.position.copy(skullPoint); skull.rotation.x = -.18; skeleton.add(skull);
  const muzzle = new THREE.Mesh(new RoundedBoxGeometry(.72, .47, .8, 6, .18), bone); muzzle.position.set(0, 8.08, -3.12); skeleton.add(muzzle);
  for (const side of [-1, 1]) {
    const hip = new THREE.Vector3(side * 1.08, 4.25, 1.7), knee = new THREE.Vector3(side * 1.32, 2.35, 1.2), ankle = new THREE.Vector3(side * 1.48, .65, .15);
    skeleton.add(cylinderBetween(hip, knee, .32, bone, 22), cylinderBetween(knee, ankle, .27, bone, 20));
    const shoulder = new THREE.Vector3(side * .82, 6.85, -.72), wrist = new THREE.Vector3(side * 1.7, 4.15, -1.65), hand = new THREE.Vector3(side * 2.05, 3.15, -2.25);
    skeleton.add(cylinderBetween(shoulder, wrist, .25, bone, 20), cylinderBetween(wrist, hand, .2, bone, 18));
    for (let claw = 0; claw < 3; claw++) { const clawBone = new THREE.Mesh(new THREE.ConeGeometry(.09, .82 + claw * .08, 12), bone); clawBone.name = "megatherium-enormous-curved-manual-claw"; clawBone.position.set(side * (2.05 + claw * .2), 2.78 - claw * .08, -2.42 - claw * .15); clawBone.rotation.z = side * -.35; clawBone.rotation.x = -.55; skeleton.add(clawBone); }
  }
  for (let index = 0; index < 15; index++) { const amount = index / 14, point = new THREE.Vector3(0, 4.1 - amount * 2.8, 2.45 + amount * 4.8); const tail = new THREE.Mesh(new THREE.SphereGeometry(.36 - amount * .22, 16, 10), bone); tail.name = "megatherium-balancing-tail-vertebra"; tail.position.copy(point); skeleton.add(tail); }
  gallery.add(skeleton); root.add(gallery); circles.push({ x: 0, z: -198, radius: 10.7 });
  addExhibitSign(root, ownedTextures, "MEGATHERIUM AMERICANUM", "GIANT GROUND SLOTH · FOSSIL MAMMAL HALLS · FLOOR 4", 0, 3.4, -210.5, Math.PI, 1.25);
}

function resolveBox(player: THREE.Vector3, velocity: THREE.Vector3, box: BoxObstacle) {
  const radius = .42;
  if (player.x < box.minX - radius || player.x > box.maxX + radius || player.z < box.minZ - radius || player.z > box.maxZ + radius) return;
  const distances = [Math.abs(player.x - (box.minX - radius)), Math.abs((box.maxX + radius) - player.x), Math.abs(player.z - (box.minZ - radius)), Math.abs((box.maxZ + radius) - player.z)];
  const edge = distances.indexOf(Math.min(...distances));
  if (edge === 0) player.x = box.minX - radius; else if (edge === 1) player.x = box.maxX + radius; else if (edge === 2) player.z = box.minZ - radius; else player.z = box.maxZ + radius;
  if (edge < 2) velocity.x = 0; else velocity.z = 0;
}

export class NaturalHistoryMuseumWorld {
  readonly root = new THREE.Group();
  readonly spawn = new THREE.Vector3(-18, 1.48, 52);
  readonly spawnYaw = .12;
  readonly megatheriumTarget = new THREE.Vector3(0, 1.48, -186);
  readonly cameraPosition = new THREE.Vector3(0, 7.2, -176);
  readonly cameraTarget = new THREE.Vector3(0, 5.2, -198);
  readonly environmentSettings = { background: "#8da0a2", fog: "#9eaaa7", fogDensity: .0035, toneMappingExposure: 1.22, cameraFar: 520 } as const;
  private readonly boxes: BoxObstacle[] = [];
  private readonly circles: CircleObstacle[] = [];
  private readonly guests: AmbientHumanAgent[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private disposed = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "american-museum-of-natural-history-exploration-level"; scene.add(this.root);
    const bone = new THREE.MeshStandardMaterial({ color: "#d5c6a2", roughness: .8, metalness: .02 });
    addArchitecture(this.root, textures, this.ownedTextures, quality, this.boxes);
    addRotundaDinosaurs(this.root, bone, this.circles);
    addBlueWhale(this.root, this.circles);
    addAfricanMammals(this.root, bone, this.circles);
    addEarthAndMeteoriteHalls(this.root, this.circles);
    addMegatherium(this.root, this.ownedTextures, bone, this.circles);
    addExhibitSign(this.root, this.ownedTextures, "THEODORE ROOSEVELT ROTUNDA", "BAROSAURUS · ALLOSAURUS · FLOOR 1", 0, 6.7, 14.2, 0, 1.12);
    addExhibitSign(this.root, this.ownedTextures, "MILSTEIN HALL OF OCEAN LIFE", "LIFE-SIZE BLUE WHALE MODEL", -34.5, 3.1, -45, Math.PI / 2, .78);
    addExhibitSign(this.root, this.ownedTextures, "AKELEY HALL OF AFRICAN MAMMALS", "AFRICAN ELEPHANT GROUP AND HABITAT DIORAMAS", 34.5, 3.1, -47, -Math.PI / 2, .78);
    addExhibitSign(this.root, this.ownedTextures, "ARTHUR ROSS HALL OF METEORITES", "AHNIGHITO · CAPE YORK METEORITE", -34.5, 3.1, -109, Math.PI / 2, .72);
    addExhibitSign(this.root, this.ownedTextures, "GOTTESMAN HALL OF PLANET EARTH", "ROCKS · MINERALS · PLANETARY PROCESSES", 34.5, 3.1, -109, -Math.PI / 2, .72);
    addExhibitSign(this.root, this.ownedTextures, "FOSSIL MAMMAL HALLS", "ADVANCED MAMMALS · GIANT GROUND SLOTH AHEAD", 0, 4.4, -158, 0, .9);
    const guestSpawns = [[-10, 6], [11, 4], [-28, -45], [-25, -82], [27, -44], [30, -86], [-26, -143], [26, -143], [-10, -171], [10, -174], [-5, -214], [7, -216]] as const;
    const count = quality < .58 ? 5 : quality < .82 ? 7 : 9;
    for (let index = 0; index < count; index++) {
      const [x, z] = guestSpawns[index], result = createPremiumHuman({ role: index === count - 1 ? "attendant" : "visitor", quality, variant: 61 + index, faceVariant: 9 + index, coat: ["#4d6d78", "#8b5b42", "#6a5b82", "#65744e"][index % 4], trousers: ["#30363c", "#403c38", "#292d35"][index % 3], skin: ["#b57959", "#77503e", "#d1a17d", "#906047"][index % 4], outfit: index % 3 === 1 ? "knit-chinos" : "cotton-denim", accessory: index % 4 === 0 ? "camera" : index % 4 === 1 ? "tote" : "backpack", pose: index % 4 === 0 ? "photographing" : "neutral" });
      result.root.name = index === count - 1 ? "fossil-mammal-hall-docent" : "amnh-wandering-museum-visitor-" + (index + 1); result.root.position.set(x, 0, z); this.root.add(result.root); this.ownedTextures.push(...result.ownedTextures);
      this.guests.push(createAmbientHumanAgent(result.root, { axis: Math.abs(x) > 18 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(index % 2 ? 1 : -1, 0, .3), travel: index === count - 1 ? .4 : 2.5 + index % 4, speed: .7 + index % 3 * .06, pauseSeconds: 2.6 + index % 3, phase: index * 1.9 }));
    }
    const hemi = new THREE.HemisphereLight("#c8d9df", "#423b33", 1.18), galleryFill = new THREE.AmbientLight("#f2dfbf", .62); this.root.add(hemi, galleryFill);
    const sun = new THREE.DirectionalLight("#fff0ce", 2.05); sun.position.set(-35, 48, 58); sun.castShadow = false; this.root.add(sun);
    // Hundreds of museum exhibit parts receive light, while only dedicated
    // hero assets need authored cast shadows. Avoiding a full-world shadow
    // submission keeps the sprawling level smooth on integrated GPUs.
    setShadows(this.root, false);
  }

  get objectiveTarget() { return this.megatheriumTarget.clone(); }
  get objectiveLabel() { return "Find the Megatherium in the Fossil Mammal Halls"; }
  floorHeight() { return 0; }
  megatheriumNearby(player: THREE.Vector3, distance = 8.5) { return Math.hypot(player.x - this.megatheriumTarget.x, player.z - this.megatheriumTarget.z) <= distance; }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    player.x = THREE.MathUtils.clamp(player.x, -62, 62); player.z = THREE.MathUtils.clamp(player.z, -221, 61);
    this.boxes.forEach(box => resolveBox(player, velocity, box));
    for (const circle of this.circles) {
      const dx = player.x - circle.x, dz = player.z - circle.z, distance = Math.hypot(dx, dz), clearance = circle.radius + .42;
      if (distance <= .001 || distance >= clearance) continue;
      player.x = circle.x + dx / distance * clearance; player.z = circle.z + dz / distance * clearance; velocity.set(0, 0, 0);
    }
    player.y = 1.48;
  }

  update(elapsed: number, delta: number) { if (!this.disposed) this.guests.forEach(agent => updateAmbientHumanAgent(agent, elapsed, delta)); }

  dispose() {
    if (this.disposed) return; this.disposed = true; markPremiumCharactersDisposed(this.root); this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(surface => materials.add(surface)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(surface => surface.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
