import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";
import { createPremiumHuman, createPremiumSlothFriend } from "./PremiumCharacter";

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([22, 56, 38, 255]), 1, 1, THREE.RGBAFormat); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Bronx Zoo finale requires a 2D canvas context"); draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

function signTexture(title = "BRONX ZOO", subtitle = "ASIA GATE · WELCOME HOME") {
  return canvasTexture(1536, 384, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, "#173d2a"); gradient.addColorStop(1, "#081e13");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.strokeStyle = "#cfe59b"; context.lineWidth = 15; context.strokeRect(22, 22, width - 44, height - 44);
    context.fillStyle = "#f4f0dc"; context.textAlign = "center"; context.textBaseline = "middle"; context.font = "700 116px Georgia, serif"; context.fillText(title, width / 2, 145);
    context.fillStyle = "#cfe59b"; context.font = "700 40px Helvetica, Arial, sans-serif"; context.letterSpacing = "13px"; context.fillText(subtitle, width / 2, 266);
  });
}

function setShadow<T extends THREE.Mesh>(mesh: T, cast = true, receive = false) {
  mesh.castShadow = cast; mesh.receiveShadow = receive; return mesh;
}

type TreeMaterials = { trunk: THREE.MeshStandardMaterial; leaves: THREE.MeshStandardMaterial };

function addTree(root: THREE.Group, materials: TreeMaterials, x: number, z: number, scale: number, quality: number) {
  const tree = new THREE.Group(); tree.name = "bronx-zoo-landscape-tree"; tree.position.set(x, 0, z);
  const trunk = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.34 * scale, .58 * scale, 7.8 * scale, quality > .72 ? 20 : 12, 4), materials.trunk), true, true); trunk.position.y = 3.9 * scale; tree.add(trunk);
  const branchCount = quality > .72 ? 7 : 5;
  for (let index = 0; index < branchCount; index++) {
    const angle = index / branchCount * Math.PI * 2 + Math.sin(index * 2.1) * .26, length = (2.2 + index % 3 * .4) * scale;
    const branch = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.07 * scale, .19 * scale, length, quality > .72 ? 11 : 7), materials.trunk));
    branch.position.set(Math.cos(angle) * length * .36, (5.8 + index % 3 * .58) * scale, Math.sin(angle) * length * .36);
    branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(Math.cos(angle) * .72, .58 + index % 2 * .16, Math.sin(angle) * .72).normalize()); tree.add(branch);
  }
  const clusterCount = quality > .72 ? 10 : 7;
  for (let index = 0; index < clusterCount; index++) {
    const angle = index * 2.399, radius = (1.05 + index % 3 * .58) * scale;
    const crown = setShadow(new THREE.Mesh(new THREE.IcosahedronGeometry((2.05 + index % 2 * .48) * scale, quality > .82 ? 2 : 1), materials.leaves), quality > .85);
    crown.position.set(Math.cos(angle) * radius, (7.25 + (index % 3) * .7) * scale, Math.sin(angle) * radius); crown.scale.y = .64 + index % 2 * .1; crown.rotation.set(index * .19, angle, index * .11); tree.add(crown);
  }
  root.add(tree);
}

function addFriend(root: THREE.Group, textures: GameTextures, ownedTextures: THREE.Texture[], quality: number, x: number, z: number, rotation: number, tint: string, pose: number) {
  const result = createPremiumSlothFriend(textures, quality, pose, tint); result.root.position.set(x, 0, z); result.root.rotation.y = rotation; root.add(result.root); ownedTextures.push(...result.ownedTextures); return result.root;
}

function addStationExit(root: THREE.Group, textures: GameTextures, stone: THREE.Material, iron: THREE.Material, green: THREE.Material, ownedTextures: THREE.Texture[], quality: number) {
  const exit = new THREE.Group(); exit.name = "west-farms-station-exit-approach";
  for (let step = 0; step < 12; step++) {
    const stair = setShadow(new THREE.Mesh(new RoundedBoxGeometry(8.1, .13, .72, 2, .025), stone), false, true); stair.position.set(0, .08 + step * .085, 10.4 + step * .69); exit.add(stair);
  }
  for (const side of [-1, 1]) {
    const wall = setShadow(new THREE.Mesh(new RoundedBoxGeometry(.42, 1.65, 9.2, 4, .07), stone), true, true); wall.position.set(side * 4.28, .62, 14.55); wall.rotation.x = -.075; exit.add(wall);
    const lowerRail = new THREE.Vector3(side * 4.05, 1.15, 10.3), upperRail = new THREE.Vector3(side * 4.05, 2.1, 18.8);
    const railDirection = upperRail.clone().sub(lowerRail), rail = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, railDirection.length(), 10), iron); rail.position.copy(lowerRail).add(upperRail).multiplyScalar(.5); rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), railDirection.normalize()); exit.add(rail);
    const globePost = new THREE.Mesh(new THREE.CylinderGeometry(.075, .095, 2.2, 12), iron); globePost.position.set(side * 4.7, 1.1, 18.7); exit.add(globePost);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.26, 20, 14), green); globe.position.set(side * 4.7, 2.3, 18.7); exit.add(globe);
  }
  const sidewalk = setShadow(new THREE.Mesh(new RoundedBoxGeometry(35, .16, 14, 6, .16), new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .035, color: "#a9a69d", roughness: .92 })), false, true); sidewalk.position.set(0, .94, 23.2); exit.add(sidewalk);
  const road = setShadow(new THREE.Mesh(new RoundedBoxGeometry(76, .12, 12, 5, .1), new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .025, color: "#414640", roughness: .96 })), false, true); road.position.set(0, .83, 34.8); exit.add(road);
  for (let stripe = -4; stripe <= 4; stripe++) { const crossing = new THREE.Mesh(new RoundedBoxGeometry(1.15, .035, 9.5, 2, .015), stone); crossing.position.set(stripe * 1.65, .91, 34.3); exit.add(crossing); }
  const exitTexture = signTexture("WEST FARMS SQ", "2  ·  5   BRONX ZOO / BOSTON ROAD"); ownedTextures.push(exitTexture);
  const canopy = setShadow(new THREE.Mesh(new RoundedBoxGeometry(10.3, .38, 5.2, 6, .12), iron)); canopy.position.set(0, 4.15, 19.5); exit.add(canopy);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(7.7, 1.28, .22, 5, .08), new THREE.MeshStandardMaterial({ map: exitTexture, roughness: .48 })); sign.position.set(0, 3.2, 20.2); exit.add(sign);
  for (const x of [-4.35, 4.35]) for (const z of [18.2, 21.3]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.085, .11, 3.25, quality > .72 ? 14 : 9), iron); post.position.set(x, 2.5, z); exit.add(post); }
  for (const x of [-14, 14]) {
    const lampPost = new THREE.Mesh(new THREE.CylinderGeometry(.09, .12, 5.8, 12), iron); lampPost.position.set(x, 3.82, 24); exit.add(lampPost);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.31, 22, 14), green); lamp.position.set(x, 6.85, 24); exit.add(lamp);
  }
  const newsbox = new THREE.Mesh(new RoundedBoxGeometry(1.15, 1.55, .8, 5, .1), new THREE.MeshStandardMaterial({ map: exitTexture, roughness: .72 })); newsbox.position.set(7.2, 1.75, 24); newsbox.rotation.y = -.12; exit.add(newsbox);
  root.add(exit);
}

function addCampusBuilding(root: THREE.Group, textures: GameTextures, x: number, z: number, width: number, height: number, depth: number, style: "stone" | "brick" | "glass", quality: number) {
  const building = new THREE.Group(); building.name = `bronx-zoo-${style}-pavilion`; building.position.set(x, 0, z);
  const facade = new THREE.MeshStandardMaterial({ map: style === "stone" ? textures.stone : textures.ground, bumpMap: style === "stone" ? textures.stone : textures.ground, bumpScale: .05, color: style === "brick" ? "#9b725d" : style === "glass" ? "#708c82" : "#c1b79e", roughness: style === "glass" ? .32 : .9, metalness: style === "glass" ? .14 : 0 });
  const trim = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .025, color: "#d8ceb4", roughness: .76 });
  const roofMaterial = new THREE.MeshStandardMaterial({ map: textures.moss, bumpMap: textures.moss, bumpScale: .025, color: "#526e5d", roughness: .6, metalness: .38 });
  const glassMaterial = new THREE.MeshPhysicalMaterial({ map: textures.stone, color: "#8fb3ad", transparent: true, opacity: .68, transmission: .15, roughness: .13, clearcoat: .8 });
  const body = setShadow(new THREE.Mesh(new RoundedBoxGeometry(width, height, depth, quality > .72 ? 7 : 4, .18), facade), true, true); body.position.y = height / 2; building.add(body);
  const base = new THREE.Mesh(new RoundedBoxGeometry(width + .4, .4, depth + .4, 4, .06), trim); base.position.y = .2; building.add(base);
  const cornice = new THREE.Mesh(new RoundedBoxGeometry(width + .55, .42, depth + .55, 4, .07), trim); cornice.position.y = height - .18; building.add(cornice);
  const windows = Math.max(3, Math.floor(width / 2.8));
  for (let index = 0; index < windows; index++) { const window = new THREE.Mesh(new RoundedBoxGeometry(1.2, 1.9, .08, 4, .04), glassMaterial); window.position.set((index - (windows - 1) / 2) * (width - 2.1) / Math.max(1, windows - 1), height * .56, depth / 2 + .055); building.add(window); const sill = new THREE.Mesh(new RoundedBoxGeometry(1.42, .12, .2, 3, .025), trim); sill.position.set(window.position.x, height * .56 - 1.03, depth / 2 + .08); building.add(sill); }
  if (style === "glass") for (const side of [-1, 1]) { const roof = new THREE.Mesh(new RoundedBoxGeometry(width * .72, .16, depth * .8, 3, .04), glassMaterial); roof.position.set(side * width * .19, height + 1.25, 0); roof.rotation.z = side * .34; building.add(roof); }
  else { const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * .72, 2.7, 4), roofMaterial); roof.position.y = height + 1.22; roof.rotation.y = Math.PI / 4; roof.scale.z = depth / width; building.add(roof); }
  root.add(building);
}

function addArrivalFountain(root: THREE.Group, textures: GameTextures, quality: number) {
  const stone = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .04, color: "#bcb39d", roughness: .82 });
  const water = new THREE.MeshPhysicalMaterial({ map: textures.waterNormal, normalMap: textures.waterNormal, normalScale: new THREE.Vector2(.25, .25), color: "#6faaa5", roughness: .18, transmission: .2, clearcoat: .8 });
  const fountain = new THREE.Group(); fountain.name = "bronx-zoo-arrival-fountain"; fountain.position.set(-12, 0, -2);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.1, 4.45, .75, quality > .72 ? 64 : 36), stone); basin.position.y = .36; fountain.add(basin);
  const surface = new THREE.Mesh(new THREE.CylinderGeometry(3.72, 3.72, .12, quality > .72 ? 64 : 36), water); surface.position.y = .72; fountain.add(surface);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(.55, .82, 2.3, 24), stone); pedestal.position.y = 1.55; fountain.add(pedestal);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(.63, 28, 18), stone); globe.position.y = 2.9; fountain.add(globe);
  for (let index = 0; index < (quality > .72 ? 8 : 4); index++) { const angle = index / (quality > .72 ? 8 : 4) * Math.PI * 2, curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(Math.cos(angle) * .55, 2.55, Math.sin(angle) * .55), new THREE.Vector3(Math.cos(angle) * 2.4, 3.65, Math.sin(angle) * 2.4), new THREE.Vector3(Math.cos(angle) * 3.3, .82, Math.sin(angle) * 3.3)); fountain.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 18, .026, 6, false), water)); }
  root.add(fountain);
}

export class BronxZooWorld {
  readonly root = new THREE.Group();
  readonly spawn = new THREE.Vector3(0, 2.5, 25.5);
  readonly attendantPosition = new THREE.Vector3(4.9, 1.48, -1.3);
  readonly cameraPosition = new THREE.Vector3(0, 3.1, 20.5);
  readonly cameraTarget = new THREE.Vector3(0, 3.6, -10);
  readonly attendant: THREE.Group;
  private ownedTextures: THREE.Texture[] = [];

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "bronx-zoo-finale-world"; scene.add(this.root);
    const high = quality > .72;
    const skyFill = new THREE.HemisphereLight("#e9f4dc", "#32483a", 1.82), sunset = new THREE.DirectionalLight("#ffdda1", 2.78); sunset.position.set(-18, 30, 16); sunset.castShadow = high; sunset.shadow.mapSize.set(quality > .9 ? 2048 : 1024, quality > .9 ? 2048 : 1024); this.root.add(skyFill, sunset);
    const groundMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .08, color: "#768361", roughness: .96 });
    const ground = setShadow(new THREE.Mesh(new THREE.PlaneGeometry(112, 94, 20, 16), groundMaterial), false, true); ground.rotation.x = -Math.PI / 2; ground.position.z = -2; this.root.add(ground);
    const pathMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .045, color: "#b9ae94", roughness: .93 });
    const path = setShadow(new THREE.Mesh(new RoundedBoxGeometry(18.5, .11, 57, 6, .22), pathMaterial), false, true); path.position.set(0, .015, 1.5); this.root.add(path);
    const stone = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .055, color: "#b8ad95", roughness: .89 });
    const iron = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .012, color: "#17211c", metalness: .82, roughness: .3 });
    const green = new THREE.MeshPhysicalMaterial({ map: textures.stone, color: "#4f8857", emissive: "#8cc58a", emissiveIntensity: 1.35, roughness: .22, clearcoat: .68 });
    addStationExit(this.root, textures, stone, iron, green, this.ownedTextures, quality);

    const gateZ = -8;
    for (const side of [-1, 1]) {
      const pillar = setShadow(new THREE.Mesh(new RoundedBoxGeometry(2.35, 9.1, 2.35, 7, .2), stone), true, true); pillar.position.set(side * 7.4, 4.55, gateZ); this.root.add(pillar);
      for (const y of [1.1, 3.3, 5.5, 7.7]) { const band = new THREE.Mesh(new RoundedBoxGeometry(2.44, .13, 2.44, 3, .04), iron); band.position.set(side * 7.4, y, gateZ); this.root.add(band); }
      const finial = new THREE.Mesh(new THREE.SphereGeometry(.48, 24, 16), stone); finial.position.set(side * 7.4, 9.42, gateZ); this.root.add(finial);
      const wall = setShadow(new THREE.Mesh(new RoundedBoxGeometry(12, 3.2, .9, 5, .12), stone), true, true); wall.position.set(side * 13.8, 1.6, gateZ); this.root.add(wall);
      for (let index = 0; index < 9; index++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, 4.9, 10), iron); bar.position.set(side * (8.8 + index * 1.25), 4.55, gateZ); this.root.add(bar); }
      const lantern = new THREE.Mesh(new RoundedBoxGeometry(.52, .85, .52, 4, .05), new THREE.MeshPhysicalMaterial({ map: textures.stone, color: "#ffe8a7", emissive: "#ffd477", emissiveIntensity: 2.1, roughness: .22, transmission: .18 })); lantern.position.set(side * 6.45, 6.3, gateZ + .3); this.root.add(lantern);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(7.4, .5, 20, high ? 96 : 64, Math.PI), iron); arch.position.set(0, 7.15, gateZ); this.root.add(arch);
    for (const side of [-1, 1]) for (let index = 0; index < 5; index++) {
      const x = side * (1.2 + index * 1.05), bar = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, 5.25, 11), iron); bar.position.set(x, 2.6, gateZ); this.root.add(bar);
      const spear = new THREE.Mesh(new THREE.ConeGeometry(.12, .38, 9), iron); spear.position.set(x, 5.38, gateZ); this.root.add(spear);
    }
    const texture = signTexture(); this.ownedTextures.push(texture);
    const sign = new THREE.Mesh(new RoundedBoxGeometry(9.3, 1.38, .3, 6, .1), new THREE.MeshBasicMaterial({ color: "#fff", map: texture, toneMapped: false })); sign.position.set(0, 8.3, gateZ); this.root.add(sign);

    addCampusBuilding(this.root, textures, 0, -25, 26, 9.5, 12, "stone", quality);
    addCampusBuilding(this.root, textures, -22, -23, 15, 8.2, 13, "glass", quality);
    addCampusBuilding(this.root, textures, 22, -24, 16, 8.8, 13, "brick", quality);
    if (high) { addCampusBuilding(this.root, textures, -34, -37, 13, 6.8, 10, "brick", quality); addCampusBuilding(this.root, textures, 34, -37, 14, 7.1, 10, "stone", quality); }
    const entryCourt = setShadow(new THREE.Mesh(new RoundedBoxGeometry(47, .14, 28, 8, .24), pathMaterial), false, true); entryCourt.position.set(0, .01, -15.5); this.root.add(entryCourt);
    addArrivalFountain(this.root, textures, quality);
    for (const side of [-1, 1]) {
      const ticket = new THREE.Group(); ticket.name = "bronx-zoo-ticket-and-member-pavilion"; ticket.position.set(side * 15.5, 0, -5.2);
      const body = setShadow(new THREE.Mesh(new RoundedBoxGeometry(4.2, 3.7, 3.3, 6, .14), new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .04, color: "#99735d", roughness: .88 })), true, true); body.position.y = 1.85; ticket.add(body);
      const roof = new THREE.Mesh(new RoundedBoxGeometry(4.7, .35, 3.8, 4, .08), new THREE.MeshStandardMaterial({ map: textures.moss, bumpMap: textures.moss, bumpScale: .02, color: "#5a7564", metalness: .35, roughness: .58 })); roof.position.y = 3.78; ticket.add(roof);
      const window = new THREE.Mesh(new RoundedBoxGeometry(2.7, 1.32, .06, 5, .04), new THREE.MeshPhysicalMaterial({ map: textures.stone, color: "#8eb4ae", roughness: .13, transmission: .16, transparent: true, opacity: .72 })); window.position.set(0, 2.2, 1.68); ticket.add(window); this.root.add(ticket);
    }

    const wayfindingTexture = signTexture("ASIA GATE", "BRONX ZOO  ·  FRIENDS AHEAD"); this.ownedTextures.push(wayfindingTexture);
    const wayfinding = new THREE.Mesh(new RoundedBoxGeometry(4.5, 1.12, .18, 4, .07), new THREE.MeshStandardMaterial({ map: wayfindingTexture, roughness: .55 })); wayfinding.position.set(-7.1, 2.3, 4.1); wayfinding.rotation.y = .14; this.root.add(wayfinding);
    const mapCase = new THREE.Mesh(new RoundedBoxGeometry(3.1, 2.65, .32, 5, .09), new THREE.MeshPhysicalMaterial({ map: textures.stone, color: "#304d3a", roughness: .32, clearcoat: .6 })); mapCase.position.set(7.25, 1.45, 3.2); mapCase.rotation.y = -.12; this.root.add(mapCase);
    const mapGlass = new THREE.Mesh(new RoundedBoxGeometry(2.5, 1.95, .04, 4, .04), new THREE.MeshPhysicalMaterial({ map: wayfindingTexture, color: "#dce7c5", roughness: .16, clearcoat: .8 })); mapGlass.position.set(7.08, 1.55, 3.03); mapGlass.rotation.y = -.12; this.root.add(mapGlass);

    const treeMaterials: TreeMaterials = {
      trunk: new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .09, color: "#78624d", roughness: .96 }),
      leaves: new THREE.MeshStandardMaterial({ map: textures.foliage, alphaMap: textures.foliage, alphaTest: .24, color: "#4f7447", roughness: .86, side: THREE.DoubleSide }),
    };
    const trees = [[-22, -7, 1.08], [-18, 4, .88], [-20, 15, .82], [20, -8, 1.1], [17, 3, .92], [21, 15, .8], [-28, 13, .95], [28, 8, .92]] as const;
    trees.slice(0, quality < .62 ? 6 : trees.length).forEach(([x, z, scale]) => addTree(this.root, treeMaterials, x, z, scale, quality));

    const plantCount = Math.round(34 + quality * 46), plantGeometry = new THREE.IcosahedronGeometry(.52, quality > .75 ? 2 : 1);
    const plants = new THREE.InstancedMesh(plantGeometry, new THREE.MeshStandardMaterial({ map: textures.foliage, alphaMap: textures.foliage, alphaTest: .18, color: "#648455", roughness: .9 }), plantCount); const dummy = new THREE.Object3D();
    for (let index = 0; index < plantCount; index++) { const side = index % 2 ? -1 : 1, z = -8 + index / plantCount * 39 + Math.sin(index * 2.1) * 1.6, scale = .45 + (index * 17 % 11) / 15; dummy.position.set(side * (10 + (index * 13 % 10) * .62), scale * .32, z); dummy.rotation.set(index * .1, index * 1.8, 0); dummy.scale.set(scale * 1.25, scale, scale); dummy.updateMatrix(); plants.setMatrixAt(index, dummy.matrix); }
    plants.instanceMatrix.needsUpdate = true; plants.castShadow = high; this.root.add(plants);

    addFriend(this.root, textures, this.ownedTextures, quality, -3.4, -2.2, Math.PI + .12, "#8d8068", 0);
    addFriend(this.root, textures, this.ownedTextures, quality, .1, -3.35, Math.PI, "#756957", 1);
    addFriend(this.root, textures, this.ownedTextures, quality, 3.55, -2.15, Math.PI - .12, "#9a886d", 2);
    addFriend(this.root, textures, this.ownedTextures, quality, 6.7, -.15, Math.PI - .28, "#756b5c", 3);
    const attendant = createPremiumHuman({
      role: "attendant", quality, variant: 24, faceVariant: 19, coat: "#315747", trousers: "#252c2a", skin: "#9a684f", accessory: "radio", pose: "waving",
    });
    this.attendant = attendant.root; this.attendant.name = "bronx-zoo-arrival-attendant"; this.attendant.userData.dialogue = "Welcome to the Bronx Zoo — your friends are waiting at Asia Gate.";
    this.attendant.position.set(this.attendantPosition.x, 0, this.attendantPosition.z); this.attendant.rotation.y = Math.PI; this.root.add(this.attendant); this.ownedTextures.push(...attendant.ownedTextures);
    const guestData = [[-8.2, 5.7, -.2, "#516d76", "#343a3c", "#b77e61"], [10.3, 5.3, .24, "#875a48", "#30383d", "#7b503d"], [14.2, -1.3, 2.7, "#667a4e", "#383438", "#cf9d78"]] as const;
    guestData.slice(0, quality < .62 ? 1 : quality < .82 ? 2 : 3).forEach((data, index) => { const result = createPremiumHuman({ role: "visitor", quality, variant: index + 11, faceVariant: [12, 16, 18][index], coat: data[3], trousers: data[4], skin: data[5], accessory: index === 1 ? "camera" : "backpack", pose: index === 1 ? "photographing" : "neutral" }); result.root.position.set(data[0], 0, data[1]); result.root.rotation.y = data[2]; this.root.add(result.root); this.ownedTextures.push(...result.ownedTextures); });
    const glow = new THREE.PointLight("#e5f3b9", 34, 23, 1.45); glow.position.set(0, 7.2, -3); this.root.add(glow);
  }

  update(elapsed: number) {
    this.root.traverse(object => {
      if (object.name === "waiting-sloth-friend") object.rotation.z = Math.sin(elapsed * .9 + object.position.x) * .018;
      else if (object.name === "friend-wave-arm") object.rotation.x = -.22 + Math.sin(elapsed * 2.35 + object.parent!.position.x) * .22;
    });
    this.attendant.rotation.z = Math.sin(elapsed * .72) * .008;
  }

  attendantNearby(player: THREE.Vector3, distance = 2.35) {
    return Math.hypot(player.x - this.attendantPosition.x, player.z - this.attendantPosition.z) <= distance;
  }

  floorHeight(z: number) {
    if (z >= 18 && z <= 30.2) return 1.02;
    if (z >= 10.4 && z < 18) {
      const amount = THREE.MathUtils.clamp((z - 10.4) / 7.6, 0, 1), step = Math.round(amount * 11);
      return .145 + step * .085;
    }
    return 0;
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    player.x = THREE.MathUtils.clamp(player.x, -17.2, 17.2);
    player.z = THREE.MathUtils.clamp(player.z, -5.5, 29.5);
    // Keep the arrival walk legible while still allowing the player to explore
    // the full forecourt. Props use compact circular footprints, never invisible
    // rectangular walls across the route.
    for (const obstacle of [
      { x: -12, z: -2, radius: 4.65 },
      { x: -15.5, z: -5.2, radius: 2.55 },
      { x: 15.5, z: -5.2, radius: 2.55 },
      { x: 7.25, z: 3.2, radius: 1.85 },
    ]) {
      const dx = player.x - obstacle.x, dz = player.z - obstacle.z, distance = Math.hypot(dx, dz);
      if (distance > 0 && distance < obstacle.radius) { const correction = (obstacle.radius - distance) / distance; player.x += dx * correction; player.z += dz * correction; velocity.multiplyScalar(.65); }
    }
    player.y = this.floorHeight(player.z) + 1.48;
  }

  dispose() {
    this.root.removeFromParent(); const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
