import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

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

function addFriend(root: THREE.Group, textures: GameTextures, x: number, z: number, rotation: number, tint: string, pose: number) {
  const friend = new THREE.Group(); friend.name = "waiting-sloth-friend"; friend.position.set(x, 0, z); friend.rotation.y = rotation; friend.userData.pose = pose;
  const fur = new THREE.MeshStandardMaterial({ map: textures.fur, bumpMap: textures.fur, bumpScale: .085, color: tint, roughness: .94 });
  const face = new THREE.MeshStandardMaterial({ color: "#b9aa8d", roughness: .92 }), dark = new THREE.MeshStandardMaterial({ color: "#191b18", roughness: .7 });
  const ivory = new THREE.MeshStandardMaterial({ color: "#e8d6aa", roughness: .5 }), eyeGloss = new THREE.MeshPhysicalMaterial({ color: "#35261a", roughness: .12, clearcoat: 1 });
  const body = setShadow(new THREE.Mesh(new THREE.CapsuleGeometry(.62, 1.18, 14, 26), fur)); body.position.y = 1.43; body.rotation.z = -.04 + pose * .025; friend.add(body);
  const chest = new THREE.Mesh(new THREE.SphereGeometry(.52, 26, 18), fur); chest.scale.set(.92, 1.14, .7); chest.position.set(0, 1.68, -.36); friend.add(chest);
  const head = setShadow(new THREE.Mesh(new THREE.SphereGeometry(.57, 32, 24), fur)); head.scale.set(1, .9, .9); head.position.set(0, 2.54, -.08); friend.add(head);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(.43, 30, 20, 0, Math.PI * 2, .18, Math.PI * .68), face); mask.scale.set(1.08, .87, .29); mask.position.set(0, 2.5, -.56); mask.rotation.x = -.09; friend.add(mask);
  for (const side of [-1, 1]) {
    const eyePatch = new THREE.Mesh(new THREE.SphereGeometry(.135, 18, 14), dark); eyePatch.scale.set(1.48, .72, .34); eyePatch.position.set(side * .205, 2.57, -.7); eyePatch.rotation.z = side * .32; friend.add(eyePatch);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.045, 16, 12), eyeGloss); eye.position.set(side * .205, 2.585, -.755); friend.add(eye);
    const armRig = new THREE.Group(); armRig.name = side === (pose % 2 ? -1 : 1) ? "friend-wave-arm" : "friend-rest-arm"; armRig.position.set(side * .54, 1.82, -.04);
    armRig.rotation.z = side * (armRig.name === "friend-wave-arm" ? -.92 : -.28); armRig.rotation.x = armRig.name === "friend-wave-arm" ? -.22 : .04;
    const upper = setShadow(new THREE.Mesh(new THREE.CapsuleGeometry(.18, .72, 9, 19), fur)); upper.position.y = .18; armRig.add(upper);
    const hand = setShadow(new THREE.Mesh(new THREE.SphereGeometry(.21, 20, 15), fur)); hand.scale.set(.85, 1.08, .7); hand.position.y = -.36; armRig.add(hand);
    for (let claw = -1; claw <= 1; claw++) {
      const talon = new THREE.Mesh(new THREE.ConeGeometry(.045, .42, 12), ivory); talon.position.set(claw * .085, -.67, -.055); talon.rotation.x = -.2; armRig.add(talon);
    }
    friend.add(armRig);
    const foot = setShadow(new THREE.Mesh(new THREE.CapsuleGeometry(.2, .42, 8, 16), fur)); foot.position.set(side * .31, .32, -.14); foot.rotation.z = side * -.12; friend.add(foot);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.095, 18, 14), dark); nose.scale.set(1.25, .7, .72); nose.position.set(0, 2.39, -.79); friend.add(nose);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(.095, .014, 6, 22, Math.PI * .72), dark); smile.position.set(0, 2.31, -.78); smile.rotation.z = .44; friend.add(smile);
  friend.scale.setScalar(.94); root.add(friend); return friend;
}

function addStationExit(root: THREE.Group, stone: THREE.Material, iron: THREE.Material, green: THREE.Material) {
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
  root.add(exit);
}

export class BronxZooWorld {
  readonly root = new THREE.Group();
  readonly cameraPosition = new THREE.Vector3(0, 2.62, 20.4);
  readonly cameraTarget = new THREE.Vector3(0, 3.45, -7.5);
  private ownedTextures: THREE.Texture[] = [];

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "bronx-zoo-finale-world"; scene.add(this.root);
    const high = quality > .72;
    const skyFill = new THREE.HemisphereLight("#e9f4dc", "#32483a", 1.82), sunset = new THREE.DirectionalLight("#ffdda1", 2.78); sunset.position.set(-18, 30, 16); sunset.castShadow = high; sunset.shadow.mapSize.set(quality > .9 ? 2048 : 1024, quality > .9 ? 2048 : 1024); this.root.add(skyFill, sunset);
    const groundMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .08, color: "#768361", roughness: .96 });
    const ground = setShadow(new THREE.Mesh(new THREE.PlaneGeometry(86, 68, 16, 12), groundMaterial), false, true); ground.rotation.x = -Math.PI / 2; ground.position.z = 5; this.root.add(ground);
    const pathMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .045, color: "#b9ae94", roughness: .93 });
    const path = setShadow(new THREE.Mesh(new RoundedBoxGeometry(11.5, .11, 47, 5, .18), pathMaterial), false, true); path.position.set(0, .015, 3.5); this.root.add(path);
    const stone = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .055, color: "#b8ad95", roughness: .89 });
    const iron = new THREE.MeshStandardMaterial({ color: "#121b17", metalness: .84, roughness: .28 });
    const green = new THREE.MeshPhysicalMaterial({ color: "#4f8857", emissive: "#8cc58a", emissiveIntensity: 1.35, roughness: .22, clearcoat: .68 });
    addStationExit(this.root, stone, iron, green);

    const gateZ = -8;
    for (const side of [-1, 1]) {
      const pillar = setShadow(new THREE.Mesh(new RoundedBoxGeometry(2.35, 9.1, 2.35, 7, .2), stone), true, true); pillar.position.set(side * 7.4, 4.55, gateZ); this.root.add(pillar);
      for (const y of [1.1, 3.3, 5.5, 7.7]) { const band = new THREE.Mesh(new RoundedBoxGeometry(2.44, .13, 2.44, 3, .04), iron); band.position.set(side * 7.4, y, gateZ); this.root.add(band); }
      const finial = new THREE.Mesh(new THREE.SphereGeometry(.48, 24, 16), stone); finial.position.set(side * 7.4, 9.42, gateZ); this.root.add(finial);
      const wall = setShadow(new THREE.Mesh(new RoundedBoxGeometry(12, 3.2, .9, 5, .12), stone), true, true); wall.position.set(side * 13.8, 1.6, gateZ); this.root.add(wall);
      for (let index = 0; index < 9; index++) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, 4.9, 10), iron); bar.position.set(side * (8.8 + index * 1.25), 4.55, gateZ); this.root.add(bar); }
      const lantern = new THREE.Mesh(new RoundedBoxGeometry(.52, .85, .52, 4, .05), new THREE.MeshPhysicalMaterial({ color: "#ffe8a7", emissive: "#ffd477", emissiveIntensity: 2.1, roughness: .22, transmission: .18 })); lantern.position.set(side * 6.45, 6.3, gateZ + .3); this.root.add(lantern);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(7.4, .5, 20, high ? 96 : 64, Math.PI), iron); arch.position.set(0, 7.15, gateZ); this.root.add(arch);
    for (const side of [-1, 1]) for (let index = 0; index < 5; index++) {
      const x = side * (1.2 + index * 1.05), bar = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, 5.25, 11), iron); bar.position.set(x, 2.6, gateZ); this.root.add(bar);
      const spear = new THREE.Mesh(new THREE.ConeGeometry(.12, .38, 9), iron); spear.position.set(x, 5.38, gateZ); this.root.add(spear);
    }
    const texture = signTexture(); this.ownedTextures.push(texture);
    const sign = new THREE.Mesh(new RoundedBoxGeometry(9.3, 1.38, .3, 6, .1), new THREE.MeshBasicMaterial({ color: "#fff", map: texture, toneMapped: false })); sign.position.set(0, 8.3, gateZ); this.root.add(sign);

    const wayfindingTexture = signTexture("ASIA GATE", "BRONX ZOO  ·  FRIENDS AHEAD"); this.ownedTextures.push(wayfindingTexture);
    const wayfinding = new THREE.Mesh(new RoundedBoxGeometry(4.5, 1.12, .18, 4, .07), new THREE.MeshStandardMaterial({ map: wayfindingTexture, roughness: .55 })); wayfinding.position.set(-7.1, 2.3, 4.1); wayfinding.rotation.y = .14; this.root.add(wayfinding);
    const mapCase = new THREE.Mesh(new RoundedBoxGeometry(3.1, 2.65, .32, 5, .09), new THREE.MeshPhysicalMaterial({ color: "#304d3a", roughness: .32, clearcoat: .6 })); mapCase.position.set(7.25, 1.45, 3.2); mapCase.rotation.y = -.12; this.root.add(mapCase);
    const mapGlass = new THREE.Mesh(new RoundedBoxGeometry(2.5, 1.95, .04, 4, .04), new THREE.MeshPhysicalMaterial({ map: wayfindingTexture, color: "#dce7c5", roughness: .16, clearcoat: .8 })); mapGlass.position.set(7.08, 1.55, 3.03); mapGlass.rotation.y = -.12; this.root.add(mapGlass);

    const treeMaterials: TreeMaterials = {
      trunk: new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .09, color: "#78624d", roughness: .96 }),
      leaves: new THREE.MeshStandardMaterial({ map: textures.foliage, alphaMap: textures.foliage, alphaTest: .24, color: "#4f7447", roughness: .86, side: THREE.DoubleSide }),
    };
    const trees = [[-22, -7, 1.08], [-18, 4, .88], [-20, 15, .82], [20, -8, 1.1], [17, 3, .92], [21, 15, .8], [-28, 13, .95], [28, 8, .92]] as const;
    trees.slice(0, quality < .62 ? 6 : trees.length).forEach(([x, z, scale]) => addTree(this.root, treeMaterials, x, z, scale, quality));

    const plantCount = Math.round(34 + quality * 46), plantGeometry = new THREE.IcosahedronGeometry(.52, 1);
    const plants = new THREE.InstancedMesh(plantGeometry, new THREE.MeshStandardMaterial({ color: "#547345", roughness: .9 }), plantCount); const dummy = new THREE.Object3D();
    for (let index = 0; index < plantCount; index++) { const side = index % 2 ? -1 : 1, z = -5 + index / plantCount * 31 + Math.sin(index * 2.1) * 1.6, scale = .45 + (index * 17 % 11) / 15; dummy.position.set(side * (7 + (index * 13 % 8) * .56), scale * .32, z); dummy.rotation.set(index * .1, index * 1.8, 0); dummy.scale.set(scale * 1.25, scale, scale); dummy.updateMatrix(); plants.setMatrixAt(index, dummy.matrix); }
    plants.instanceMatrix.needsUpdate = true; plants.castShadow = high; this.root.add(plants);

    addFriend(this.root, textures, -3.1, -2.5, Math.PI + .12, "#8d8068", 0);
    addFriend(this.root, textures, 0, -3.65, Math.PI, "#756957", 1);
    addFriend(this.root, textures, 3.05, -2.45, Math.PI - .12, "#9a886d", 2);
    addFriend(this.root, textures, 5.25, -.5, Math.PI - .28, "#756b5c", 3);
    const glow = new THREE.PointLight("#e5f3b9", 34, 23, 1.45); glow.position.set(0, 7.2, -3); this.root.add(glow);
  }

  update(elapsed: number) {
    this.root.traverse(object => {
      if (object.name === "waiting-sloth-friend") object.rotation.z = Math.sin(elapsed * .9 + object.position.x) * .018;
      else if (object.name === "friend-wave-arm") object.rotation.x = -.22 + Math.sin(elapsed * 2.35 + object.parent!.position.x) * .22;
    });
  }

  dispose() {
    this.root.removeFromParent(); const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
