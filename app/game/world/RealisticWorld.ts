import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

export const BUDS = [
  new THREE.Vector3(-12, 0, 14), new THREE.Vector3(17, 0, -4),
  new THREE.Vector3(38, 0, -26), new THREE.Vector3(8, 0, -48),
  new THREE.Vector3(-24, 0, -58), new THREE.Vector3(-45, 0, -28),
];
export const START = new THREE.Vector3(-43, 0, 54);
export const GOAL = new THREE.Vector3(-10, 0, -78);

export type RealisticWorld = {
  buds: THREE.Group[];
  rings: THREE.Mesh[];
  hawk: THREE.Group;
  lake: THREE.Mesh;
  trailCurve: THREE.CatmullRomCurve3;
  animate(time: number, player: THREE.Vector3, scent: boolean, collected: Set<number>): void;
};

function seeded(seed: number) {
  let value = seed >>> 0;
  return () => ((value = Math.imul(value ^ (value >>> 15), 1 | value), value ^= value + Math.imul(value ^ (value >>> 7), 61 | value), ((value ^ (value >>> 14)) >>> 0) / 4294967296));
}

export function terrainY(x: number, z: number) {
  const roll = Math.sin(x * .037) * 1.5 + Math.cos(z * .042) * 1.1 + Math.sin((x + z) * .071) * .45;
  const lake = Math.max(0, 1 - Math.hypot(x - 34, z + 43) / 27) * 3.6;
  return roll - lake;
}

function trailRibbon(curve: THREE.CatmullRomCurve3) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  const segments = 120, width = 1.65;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments, point = curve.getPoint(t), tangent = curve.getTangent(t).normalize();
    const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const edgeNoise = Math.sin(i * 1.71) * .16 + Math.sin(i * .37) * .1;
    for (const edge of [-1, 1]) {
      positions.push(point.x + side.x * (width + edgeNoise) * edge, point.y + .035, point.z + side.z * (width + edgeNoise) * edge);
      uvs.push((edge + 1) / 2, t * 30);
    }
    if (i < segments) { const n = i * 2; indices.push(n, n + 2, n + 1, n + 1, n + 2, n + 3); }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function alignCylinder(object: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, radius: number) {
  const direction = end.clone().sub(start), length = direction.length();
  object.position.copy(start).add(end).multiplyScalar(.5);
  object.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  object.scale.set(radius, length, radius); object.updateMatrix();
}

function addTrees(scene: THREE.Scene, textures: GameTextures, quality: number) {
  const random = seeded(7331), treeCount = Math.round(132 * quality);
  const heroPositions: Array<[number, number]> = [[-51,54],[-36,59],[-43,44],[-54,66],[-31,47],[-25,35],[-17,26],[-10,17],[3,12],[15,1],[26,-7],[29,-20],[16,-31],[4,-43],[-5,-55],[-18,-63],[-25,-75]];
  const trunkGeometry = new THREE.CylinderGeometry(.72, 1, 1, 14, 5);
  const branchGeometry = new THREE.CylinderGeometry(.34, 1, 1, 9, 2);
  const barkMaterial = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .11, color: "#afa18e", roughness: .95 });
  const trunks = new THREE.InstancedMesh(trunkGeometry, barkMaterial, treeCount);
  const branchesPerTree = 5;
  const branches = new THREE.InstancedMesh(branchGeometry, barkMaterial, treeCount * branchesPerTree);
  const foliageMaterial = new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .38, side: THREE.DoubleSide, roughness: .78, metalness: 0, color: "#d8e0c6" });
  const shrubMaterial = new THREE.MeshStandardMaterial({ map: textures.foliage, alphaTest: .38, side: THREE.DoubleSide, roughness: .8, color: "#d2dbc2" });
  const leafGeometry = new THREE.PlaneGeometry(1, 1, 2, 2);
  const leavesPerTree = quality > .85 ? 16 : 11;
  const leaves = new THREE.InstancedMesh(leafGeometry, foliageMaterial, treeCount * leavesPerTree * 2);
  trunks.castShadow = trunks.receiveShadow = true; branches.castShadow = true; leaves.castShadow = false;
  const dummy = new THREE.Object3D(), start = new THREE.Vector3(), end = new THREE.Vector3();
  let tree = 0;
  while (tree < treeCount) {
    const forced = heroPositions[tree];
    const x = forced ? forced[0] : random() * 220 - 110, z = forced ? forced[1] : random() * 220 - 110;
    if (!forced && (Math.hypot(x - 34, z + 43) < 34 || Math.hypot(x, z) < 9 || Math.hypot(x + 43, z - 54) < 7)) continue;
    const baseY = terrainY(x, z), height = 7.5 + random() * 6, radius = .34 + random() * .26;
    dummy.position.set(x, baseY + height / 2, z); dummy.rotation.set(0, random() * Math.PI * 2, 0); dummy.scale.set(radius, height, radius); dummy.updateMatrix(); trunks.setMatrixAt(tree, dummy.matrix);
    for (let branch = 0; branch < branchesPerTree; branch++) {
      const angle = random() * Math.PI * 2 + branch * 1.7, level = .48 + branch * .085 + random() * .08;
      const length = 2.2 + random() * 2.8;
      start.set(x, baseY + height * level, z);
      end.set(x + Math.cos(angle) * length, baseY + height * (level + .12 + random() * .12), z + Math.sin(angle) * length);
      alignCylinder(dummy, start, end, radius * (.48 - branch * .045)); branches.setMatrixAt(tree * branchesPerTree + branch, dummy.matrix);
    }
    for (let cluster = 0; cluster < leavesPerTree; cluster++) {
      const angle = cluster / leavesPerTree * Math.PI * 2 + random() * .45;
      const orbit = cluster === 0 ? 0 : 1.2 + random() * 2.9;
      const clusterPosition = new THREE.Vector3(x + Math.cos(angle) * orbit, baseY + height * (.61 + random() * .38), z + Math.sin(angle) * orbit);
      const scale = 3.2 + random() * 2.8;
      for (let card = 0; card < 2; card++) {
        dummy.position.copy(clusterPosition); dummy.rotation.set((random() - .5) * .12, angle + card * Math.PI / 2, (random() - .5) * .08);
        dummy.scale.set(scale, scale * (.42 + random() * .14), 1); dummy.updateMatrix(); leaves.setMatrixAt((tree * leavesPerTree + cluster) * 2 + card, dummy.matrix);
      }
    }
    tree++;
  }
  trunks.instanceMatrix.needsUpdate = branches.instanceMatrix.needsUpdate = leaves.instanceMatrix.needsUpdate = true;
  scene.add(trunks, branches, leaves);

  // Understory detail: rocks, shrubs, and fallen bark-covered logs in a handful of draw calls.
  const scatterCount = Math.round(360 * quality);
  const shrubs = new THREE.InstancedMesh(leafGeometry, shrubMaterial, scatterCount * 2);
  const fernMaterial = new THREE.MeshStandardMaterial({ map: textures.fern, alphaTest: .34, side: THREE.DoubleSide, roughness: .84, color: "#c5d0b2" });
  const fernCount = Math.round(720 * quality);
  const ferns = new THREE.InstancedMesh(leafGeometry, fernMaterial, fernCount * 2);
  const rockMaterial = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .1, color: "#777a69", roughness: .96 });
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(.55, 1), rockMaterial, Math.round(90 * quality));
  const understoryAnchors: Array<[number,number]> = [[-47,51],[-39,50],[-49,59],[-36,53],[-31,41],[-27,34],[-18,22],[-5,16],[10,4],[16,-11],[-1,-50],[-17,-60]];
  for (let i = 0; i < scatterCount; i++) {
    const anchor = understoryAnchors[i];
    const x = anchor ? anchor[0] : random() * 210 - 105, z = anchor ? anchor[1] : random() * 210 - 105, scale = anchor ? .78 + random() * .35 : .32 + random() * .66;
    const y = terrainY(x, z) + scale * .48, angle = random() * Math.PI;
    for (let card = 0; card < 2; card++) { dummy.position.set(x, y, z); dummy.rotation.set((random() - .5) * .16, angle + card * Math.PI / 2, 0); dummy.scale.set(scale, scale * (.7 + random() * .45), 1); dummy.updateMatrix(); shrubs.setMatrixAt(i * 2 + card, dummy.matrix); }
  }
  for (let i = 0; i < rocks.count; i++) {
    const x = random() * 200 - 100, z = random() * 200 - 100, scale = .35 + random() * 1.15;
    dummy.position.set(x, terrainY(x, z) + scale * .22, z); dummy.rotation.set(random(), random() * Math.PI, random()); dummy.scale.set(scale, scale * (.45 + random() * .32), scale); dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  shrubs.instanceMatrix.needsUpdate = rocks.instanceMatrix.needsUpdate = true; rocks.castShadow = rocks.receiveShadow = true;
  for (let i = 0; i < fernCount; i++) {
    const anchor = understoryAnchors[i % understoryAnchors.length], clustered = i < understoryAnchors.length * 5;
    const x = clustered ? anchor[0] + (random() - .5) * 7 : random() * 205 - 102.5, z = clustered ? anchor[1] + (random() - .5) * 7 : random() * 205 - 102.5;
    const scale = .48 + random() * 1.08, y = terrainY(x, z) + scale * .5, angle = random() * Math.PI;
    for (let card = 0; card < 2; card++) { dummy.position.set(x, y, z); dummy.rotation.set(0, angle + card * Math.PI / 2, 0); dummy.scale.set(scale, scale * 1.2, 1); dummy.updateMatrix(); ferns.setMatrixAt(i * 2 + card, dummy.matrix); }
  }
  ferns.instanceMatrix.needsUpdate = true;
  scene.add(shrubs, ferns, rocks);

  // Thousands of cheap, individually tinted leaves break up the ground plane at eye level.
  const litterCount = Math.round(1500 * quality);
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, -.12); leafShape.quadraticCurveTo(.09, -.025, 0, .14); leafShape.quadraticCurveTo(-.09, -.025, 0, -.12);
  const litterMaterial = new THREE.MeshStandardMaterial({ vertexColors:true, color:"#b5a989", roughness:1, side:THREE.DoubleSide });
  const litter = new THREE.InstancedMesh(new THREE.ShapeGeometry(leafShape), litterMaterial, litterCount);
  const litterPalette = [new THREE.Color("#51442d"),new THREE.Color("#6e5830"),new THREE.Color("#38422b"),new THREE.Color("#8a6b39"),new THREE.Color("#433725")];
  for (let i = 0; i < litterCount; i++) {
    let x = random() * 214 - 107, z = random() * 214 - 107;
    if (i < 280) { x = -43 + (random() - .5) * 34; z = 54 + (random() - .5) * 32; }
    if (Math.hypot(x - 34, z + 43) < 27.5) { i--; continue; }
    const scale = .48 + random() * 1.05;
    dummy.position.set(x, terrainY(x,z) + .035 + random() * .018, z);
    dummy.rotation.set(-Math.PI / 2 + (random() - .5) * .16, random() * Math.PI * 2, (random() - .5) * .12);
    dummy.scale.set(scale * (.72 + random() * .45),scale,scale); dummy.updateMatrix(); litter.setMatrixAt(i,dummy.matrix);
    const tint = litterPalette[Math.floor(random() * litterPalette.length)].clone().offsetHSL((random() - .5) * .025,0,(random() - .5) * .06);
    litter.setColorAt(i,tint);
  }
  litter.instanceMatrix.needsUpdate = true; if (litter.instanceColor) litter.instanceColor.needsUpdate = true; litter.receiveShadow = true; scene.add(litter);
  for (let i = 0; i < 12; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(.24 + random() * .18, .34 + random() * .2, 3 + random() * 3, 12), barkMaterial);
    log.rotation.set(Math.PI / 2 + (random() - .5) * .15, random() * Math.PI, 0); log.position.set(random() * 160 - 80, 0, random() * 160 - 80); log.position.y = terrainY(log.position.x, log.position.z) + .3; log.castShadow = log.receiveShadow = true; scene.add(log);
  }
}

function addLandmarks(scene: THREE.Scene, textures: GameTextures, trailCurve: THREE.CatmullRomCurve3) {
  const stoneMaterial = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .07, color: "#b9ad92", roughness: .82 });
  const iron = new THREE.MeshStandardMaterial({ color: "#17221d", roughness: .35, metalness: .78 });
  const bridge = new THREE.Group();
  const deck = new THREE.Mesh(new RoundedBoxGeometry(18, .75, 4, 5, .22), stoneMaterial); deck.position.y = 1.5; deck.castShadow = deck.receiveShadow = true; bridge.add(deck);
  for (const side of [-1, 1]) for (let x = -8; x <= 8; x += 1.15) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .07, 1.25, 10), iron); post.position.set(x, 2.45, side * 1.72); bridge.add(post);
  }
  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, 17, 10), iron); rail.rotation.z = Math.PI / 2; rail.position.set(0, 3.02, side * 1.72); bridge.add(rail);
  }
  bridge.position.set(18, terrainY(18, -4), -4); bridge.rotation.y = -.45; scene.add(bridge);

  const gate = new THREE.Group();
  for (const x of [-3.8, 3.8]) { const pillar = new THREE.Mesh(new RoundedBoxGeometry(1.3, 5, 1.3, 4, .12), stoneMaterial); pillar.position.set(x, 2.5, 0); pillar.castShadow = pillar.receiveShadow = true; gate.add(pillar); }
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.8, .64, 16, 48, Math.PI), stoneMaterial); arch.rotation.z = Math.PI; arch.position.y = 4.5; arch.castShadow = true; gate.add(arch);
  gate.position.set(GOAL.x, terrainY(GOAL.x, GOAL.z), GOAL.z); scene.add(gate);

  for (let i = 0; i < 18; i++) {
    const point = trailCurve.getPoint(i / 17), side = i % 2 ? 3.15 : -3.15;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.065, .105, 4, 12), iron); pole.position.set(point.x, point.y + 2, point.z + side); pole.castShadow = true; scene.add(pole);
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), new THREE.MeshStandardMaterial({ color: "#f6dc9b", emissive: "#ffcb6b", emissiveIntensity: 1.8, roughness: .18 })); lantern.position.copy(pole.position).add(new THREE.Vector3(0, 2, 0)); scene.add(lantern);
  }
}

function addSky(scene: THREE.Scene) {
  const sky = new Sky(); sky.scale.setScalar(450); scene.add(sky);
  sky.material.uniforms.turbidity.value = 7.4; sky.material.uniforms.rayleigh.value = 2.05;
  sky.material.uniforms.mieCoefficient.value = .009; sky.material.uniforms.mieDirectionalG.value = .86;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(86), THREE.MathUtils.degToRad(224));
  sky.material.uniforms.sunPosition.value.copy(sun);
}

export function buildRealisticWorld(scene: THREE.Scene, textures: GameTextures, quality: number): RealisticWorld {
  addSky(scene);
  const terrain = new THREE.PlaneGeometry(240, 240, 120, 120); terrain.rotateX(-Math.PI / 2);
  const positions = terrain.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < positions.count; i++) positions.setY(i, terrainY(positions.getX(i), positions.getZ(i)));
  terrain.computeVertexNormals();
  const groundMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .14, color: "#d0c6b5", roughness: .95, metalness: 0 });
  const ground = new THREE.Mesh(terrain, groundMaterial); ground.receiveShadow = true; scene.add(ground);

  const trailPoints = [new THREE.Vector3(-50, 0, 62), new THREE.Vector3(-28, 0, 35), new THREE.Vector3(-4, 0, 18), new THREE.Vector3(18, 0, -4), new THREE.Vector3(12, 0, -34), new THREE.Vector3(-8, 0, -62), new THREE.Vector3(-10, 0, -82)];
  for (const point of trailPoints) point.y = terrainY(point.x, point.z) + .06;
  const trailCurve = new THREE.CatmullRomCurve3(trailPoints);
  const trail = new THREE.Mesh(trailRibbon(trailCurve), new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .09, color: "#a59678", roughness: .98 })); trail.receiveShadow = true; scene.add(trail);

  addTrees(scene, textures, quality); addLandmarks(scene, textures, trailCurve);
  const lakeMaterial = new THREE.MeshPhysicalMaterial({ color: "#345d59", normalMap: textures.waterNormal, normalScale: new THREE.Vector2(.32, .32), roughness: .16, metalness: .08, transmission: .08, transparent: true, opacity: .9, clearcoat: .72, clearcoatRoughness: .18, envMapIntensity: 1.4 });
  const lake = new THREE.Mesh(new THREE.CircleGeometry(25, 96), lakeMaterial); lake.rotation.x = -Math.PI / 2; lake.position.set(34, terrainY(34, -43) + .82, -43); lake.receiveShadow = true; scene.add(lake);
  // Shoreline breaks the mathematically perfect circle.
  const shoreMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .1, color: "#545a42", roughness: 1 });
  const shore = new THREE.Mesh(new THREE.RingGeometry(23.8, 27, 96), shoreMaterial); shore.rotation.x = -Math.PI / 2; shore.position.copy(lake.position).add(new THREE.Vector3(0, -.05, 0)); scene.add(shore);

  const buds: THREE.Group[] = [], rings: THREE.Mesh[] = [];
  const budMaterial = new THREE.MeshPhysicalMaterial({ color: "#9ec55c", roughness: .65, clearcoat: .12 });
  BUDS.forEach((point, index) => {
    point.y = terrainY(point.x, point.z) + 1; const group = new THREE.Group();
    for (let j = 0; j < 5; j++) { const leaf = new THREE.Mesh(new THREE.SphereGeometry(.22, 14, 9), budMaterial); leaf.scale.set(.48, 1, .24); leaf.rotation.z = j * 1.26; leaf.position.set(Math.cos(j * 1.25) * .24, Math.sin(j * .8) * .1, Math.sin(j * 1.25) * .24); group.add(leaf); }
    group.position.copy(point); group.userData.index = index; scene.add(group); buds.push(group);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, .028, 8, 48), new THREE.MeshBasicMaterial({ color: "#d9ef8b", transparent: true, opacity: 0 })); ring.rotation.x = Math.PI / 2; ring.position.copy(point).add(new THREE.Vector3(0, .2, 0)); scene.add(ring); rings.push(ring);
  });

  const hawk = new THREE.Group(), hawkMaterial = new THREE.MeshStandardMaterial({ color: "#30241c", roughness: .82, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.22, 1.15, 6, 12), hawkMaterial); body.rotation.z = Math.PI / 2; hawk.add(body);
  for (const side of [-1, 1]) { const wingShape = new THREE.Shape(); wingShape.moveTo(0, 0); wingShape.bezierCurveTo(.5, side * .4, 1.8, side * 1.35, 3.25, side * 1.1); wingShape.bezierCurveTo(2.1, side * .3, 1.05, side * .02, 0, 0); const wing = new THREE.Mesh(new THREE.ShapeGeometry(wingShape), hawkMaterial); wing.rotation.x = -Math.PI / 2; hawk.add(wing); } scene.add(hawk);

  return {
    buds, rings, hawk, lake, trailCurve,
    animate(time, player, scent, collected) {
      textures.waterNormal.offset.set(time * .008, time * -.011);
      hawk.position.set(player.x + Math.cos(time * .42) * 24, 18 + Math.sin(time * .7) * 2, player.z + Math.sin(time * .42) * 24); hawk.rotation.y = -time * .42;
      buds.forEach((bud, index) => { if (!bud.visible) return; bud.rotation.y += .008; bud.position.y = terrainY(bud.position.x, bud.position.z) + 1 + Math.sin(time * 2 + index) * .1; });
      rings.forEach((ring, index) => { (ring.material as THREE.MeshBasicMaterial).opacity = scent && !collected.has(index) ? .48 : 0; ring.scale.setScalar(1 + (time * .6 + index * .17) % 2.5); });
    },
  };
}
