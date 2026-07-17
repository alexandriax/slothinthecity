import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([21, 54, 35, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Central Park return world requires canvas textures");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

function sanctuarySignTexture() {
  return canvasTexture(1280, 440, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, "#173d2a"); gradient.addColorStop(1, "#081d13");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.strokeStyle = "#d9ef8b"; context.lineWidth = 13; context.strokeRect(20, 20, width - 40, height - 40);
    context.fillStyle = "#f4f0dc"; context.textAlign = "center"; context.textBaseline = "middle";
    context.font = "700 92px Georgia, serif"; context.fillText("HOME GROVE", width / 2, 160);
    context.fillStyle = "#d9ef8b"; context.font = "700 39px Helvetica, Arial, sans-serif"; context.letterSpacing = "10px";
    context.fillText("SLOTH SANCTUARY  ·  CENTRAL PARK", width / 2, 294);
  });
}

function setShadow<T extends THREE.Mesh>(mesh: T, cast = true, receive = false) {
  mesh.castShadow = cast; mesh.receiveShadow = receive; return mesh;
}

function floorHeight(x: number, z: number) {
  const broad = Math.sin(x * .032) * .42 + Math.cos(z * .026) * .34;
  const groveBowl = -Math.exp(-(x * x + (z + 61) * (z + 61)) / 1200) * .38;
  return broad + groveBowl;
}

function addTree(
  root: THREE.Group,
  textures: GameTextures,
  x: number,
  z: number,
  scale: number,
  quality: number,
  name = "central-park-premium-landscape-tree",
) {
  const high = quality > .7, tree = new THREE.Group(); tree.name = name; tree.position.set(x, floorHeight(x, z), z);
  const bark = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .1, color: "#78624d", roughness: .97 });
  const leaf = new THREE.MeshStandardMaterial({ map: textures.foliageBranch, alphaTest: .28, color: "#55784b", roughness: .88, side: THREE.DoubleSide });
  const height = 9.2 * scale, trunk = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.3 * scale, .57 * scale, height, high ? 18 : 11, 5), bark), true, true); trunk.position.y = height / 2; tree.add(trunk);
  const branchCount = high ? 9 : 6;
  for (let index = 0; index < branchCount; index++) {
    const angle = index * 2.399 + x * .017, length = (2.4 + index % 4 * .36) * scale;
    const start = new THREE.Vector3(0, height * (.52 + (index % 4) * .08), 0), end = new THREE.Vector3(Math.cos(angle) * length, start.y + length * (.18 + index % 2 * .08), Math.sin(angle) * length);
    const direction = end.clone().sub(start), branch = setShadow(new THREE.Mesh(new THREE.CylinderGeometry(.065 * scale, .2 * scale, direction.length(), high ? 10 : 7), bark));
    branch.position.copy(start).add(end).multiplyScalar(.5); branch.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); tree.add(branch);
    const sprays = high ? 3 : 2;
    for (let spray = 0; spray < sprays; spray++) {
      const foliage = setShadow(new THREE.Mesh(new THREE.PlaneGeometry((3.35 - spray * .28) * scale, (2.15 - spray * .18) * scale), leaf), high && spray === 0);
      foliage.position.copy(end).add(new THREE.Vector3(Math.cos(angle + spray * 1.8) * .5 * scale, spray * .32 * scale, Math.sin(angle + spray * 1.8) * .5 * scale));
      foliage.rotation.set(-.35 + spray * .42, angle + spray * .9, spray % 2 ? -.22 : .18); tree.add(foliage);
    }
  }
  root.add(tree); return { x, z, radius: .57 * scale };
}

export class CentralParkReturnWorld {
  readonly root = new THREE.Group();
  readonly spawn = new THREE.Vector3(0, 0, 56);
  readonly sanctuaryTarget = new THREE.Vector3(0, 0, -62);
  readonly cameraPosition = new THREE.Vector3(6, 2.8, -52);
  readonly cameraTarget = new THREE.Vector3(-12, .6, -61);
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly treeColliders: { x: number; z: number; radius: number }[] = [];
  private readonly fireflies: THREE.Points;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "central-park-homecoming-world"; scene.add(this.root);
    this.spawn.y = floorHeight(this.spawn.x, this.spawn.z) + 1.48;
    this.sanctuaryTarget.y = floorHeight(this.sanctuaryTarget.x, this.sanctuaryTarget.z);
    const high = quality > .7;
    const hemisphere = new THREE.HemisphereLight("#e8f1d8", "#263b2e", 1.38), moon = new THREE.DirectionalLight("#ffd6a0", 2.35);
    moon.position.set(-26, 48, 24); moon.castShadow = high; moon.shadow.mapSize.set(quality > .9 ? 2048 : 1024, quality > .9 ? 2048 : 1024); moon.shadow.camera.left = moon.shadow.camera.bottom = -52; moon.shadow.camera.right = moon.shadow.camera.top = 52; this.root.add(hemisphere, moon);

    const groundGeometry = new THREE.PlaneGeometry(132, 184, high ? 44 : 26, high ? 58 : 34), positions = groundGeometry.getAttribute("position") as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index++) positions.setZ(index, floorHeight(positions.getX(index), -positions.getY(index) - 20));
    positions.needsUpdate = true; groundGeometry.computeVertexNormals(); groundGeometry.rotateX(-Math.PI / 2); groundGeometry.translate(0, 0, -20);
    const ground = setShadow(new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .11, color: "#71805c", roughness: .98 })), false, true); this.root.add(ground);

    const pathMaterial = new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .045, color: "#c2b99f", roughness: .94 });
    const pathPoints = [new THREE.Vector2(0, 55), new THREE.Vector2(-5, 34), new THREE.Vector2(7, 12), new THREE.Vector2(-6, -12), new THREE.Vector2(5, -37), new THREE.Vector2(0, -59)];
    for (let index = 1; index < pathPoints.length; index++) {
      const start = pathPoints[index - 1], end = pathPoints[index], dx = end.x - start.x, dz = end.y - start.y, length = Math.hypot(dx, dz);
      const segment = setShadow(new THREE.Mesh(new RoundedBoxGeometry(6.2, .13, length + .7, 4, .12), pathMaterial), false, true);
      segment.name = "homecoming-gravel-path"; segment.position.set((start.x + end.x) / 2, floorHeight((start.x + end.x) / 2, (start.y + end.y) / 2) + .02, (start.y + end.y) / 2); segment.rotation.y = Math.atan2(dx, dz); this.root.add(segment);
    }

    const stone = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .045, color: "#aaa69b", roughness: .9 });
    const iron = new THREE.MeshStandardMaterial({ map: textures.stone, color: "#17211d", metalness: .8, roughness: .32 });
    const entrance = new THREE.Group(); entrance.name = "fifth-avenue-return-subway-exit"; entrance.position.set(0, floorHeight(0, 64), 64);
    for (let step = 0; step < 10; step++) { const stair = new THREE.Mesh(new RoundedBoxGeometry(7.4, .12, .7, 2, .02), stone); stair.position.set(0, -.8 + step * .09, -step * .58); entrance.add(stair); }
    for (const side of [-1, 1]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.07, .1, 2.25, 12), iron); post.position.set(side * 4.1, 1.18, -3.5); entrance.add(post); const globe = new THREE.Mesh(new THREE.SphereGeometry(.25, 18, 12), new THREE.MeshPhysicalMaterial({ color: "#61af72", emissive: "#7ccc82", emissiveIntensity: 1.1, roughness: .2 })); globe.position.set(side * 4.1, 2.42, -3.5); entrance.add(globe); }
    const canopy = new THREE.Mesh(new RoundedBoxGeometry(9, .35, 4.7, 5, .1), iron); canopy.position.set(0, 3.35, -3.2); entrance.add(canopy); this.root.add(entrance);

    const edgeTrees = [
      [-27, 49, 1.05], [24, 45, 1.18], [-33, 29, .96], [30, 23, 1.08], [-29, 8, 1.14], [34, 2, .98],
      [-31, -18, 1.15], [29, -23, 1.08], [-27, -42, .97], [32, -47, 1.12], [-43, -62, 1.3], [43, -66, 1.24],
      [-22, -78, 1.18], [24, -81, 1.1], [-52, 13, 1.05], [51, 28, 1.16],
    ] as const;
    edgeTrees.slice(0, quality < .62 ? 10 : edgeTrees.length).forEach(([x, z, scale]) => this.treeColliders.push(addTree(this.root, textures, x, z, scale, quality)));
    const groveTrees = [[-11, -61, 1.35], [11, -62, 1.28], [-7, -71, 1.18], [7, -72, 1.22], [0, -79, 1.36]] as const;
    groveTrees.forEach(([x, z, scale], index) => this.treeColliders.push(addTree(this.root, textures, x, z, scale, quality, index === 0 ? "central-park-designated-sloth-sanctuary-tree" : "central-park-home-grove-tree")));

    const shrubCount = Math.round(150 + quality * 170), shrubGeometry = new THREE.IcosahedronGeometry(.42, high ? 2 : 1);
    const shrubs = new THREE.InstancedMesh(shrubGeometry, new THREE.MeshStandardMaterial({ map: textures.foliage, alphaTest: .25, color: "#5b7b4d", roughness: .92 }), shrubCount); const dummy = new THREE.Object3D();
    for (let index = 0; index < shrubCount; index++) {
      const side = index % 2 ? -1 : 1, z = 57 - (index / shrubCount) * 145 + Math.sin(index * 2.3) * 3.4, x = side * (10 + (index * 17 % 28));
      const scale = .45 + (index * 13 % 17) / 18; dummy.position.set(x, floorHeight(x, z) + scale * .28, z); dummy.rotation.set(index * .13, index * 1.7, 0); dummy.scale.set(scale * 1.35, scale, scale); dummy.updateMatrix(); shrubs.setMatrixAt(index, dummy.matrix);
    }
    shrubs.instanceMatrix.needsUpdate = true; shrubs.castShadow = high; shrubs.name = "instanced-central-park-understory"; this.root.add(shrubs);

    const fernCount = Math.round(220 + quality * 330), fernGeometry = new THREE.PlaneGeometry(.9, .72), fernMaterial = new THREE.MeshStandardMaterial({ map: textures.fern, alphaTest: .28, color: "#6d8c59", roughness: .9, side: THREE.DoubleSide });
    const ferns = new THREE.InstancedMesh(fernGeometry, fernMaterial, fernCount);
    for (let index = 0; index < fernCount; index++) {
      const angle = index * 2.399, radius = 12 + (index * 29 % 46), centerZ = index % 3 === 0 ? -62 : -10;
      const x = Math.cos(angle) * radius, z = centerZ + Math.sin(angle) * radius * .62, scale = .55 + (index * 7 % 11) / 14;
      dummy.position.set(x, floorHeight(x, z) + .34 * scale, z); dummy.rotation.set(0, angle + Math.PI / 2, 0); dummy.scale.setScalar(scale); dummy.updateMatrix(); ferns.setMatrixAt(index, dummy.matrix);
    }
    ferns.instanceMatrix.needsUpdate = true; ferns.name = "instanced-central-park-ferns"; this.root.add(ferns);

    const signMap = sanctuarySignTexture(); this.ownedTextures.push(signMap);
    const sign = new THREE.Mesh(new RoundedBoxGeometry(7.2, 2.4, .24, 5, .08), new THREE.MeshStandardMaterial({ map: signMap, roughness: .55 })); sign.name = "central-park-sloth-sanctuary-sign"; sign.position.set(-12.5, floorHeight(-12.5, -52) + 2.05, -52); sign.rotation.y = .24; this.root.add(sign);
    for (const x of [-15.1, -9.9]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.08, .1, 2.8, 10), iron); post.position.set(x, floorHeight(x, -52) + 1.35, -52.05); this.root.add(post); }

    const fireflyCount = high ? 90 : 46, fireflyPositions = new Float32Array(fireflyCount * 3);
    for (let index = 0; index < fireflyCount; index++) { const angle = index * 2.399, radius = 4 + index % 15; fireflyPositions[index * 3] = Math.cos(angle) * radius; fireflyPositions[index * 3 + 1] = 1.2 + (index * 17 % 28) / 10; fireflyPositions[index * 3 + 2] = -64 + Math.sin(angle) * radius * .65; }
    const fireflyGeometry = new THREE.BufferGeometry(); fireflyGeometry.setAttribute("position", new THREE.BufferAttribute(fireflyPositions, 3));
    this.fireflies = new THREE.Points(fireflyGeometry, new THREE.PointsMaterial({ color: "#e5f39f", size: .075, transparent: true, opacity: .72, depthWrite: false, blending: THREE.AdditiveBlending })); this.fireflies.name = "home-grove-fireflies"; this.root.add(this.fireflies);
    const groveGlow = new THREE.PointLight("#e7efae", 62, 30, 1.55); groveGlow.position.set(0, 5.2, -61); this.root.add(groveGlow);
  }

  floorHeight(x: number, z: number) { return floorHeight(x, z); }

  sanctuaryNearby(player: THREE.Vector3, distance = 7.5) {
    return Math.hypot(player.x - this.sanctuaryTarget.x, player.z - this.sanctuaryTarget.z) <= distance;
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    player.x = THREE.MathUtils.clamp(player.x, -58, 58); player.z = THREE.MathUtils.clamp(player.z, -92, 61);
    for (const tree of this.treeColliders) {
      const dx = player.x - tree.x, dz = player.z - tree.z, distance = Math.hypot(dx, dz), clearance = tree.radius + .46;
      if (distance > 0 && distance < clearance) { const correction = (clearance - distance) / distance; player.x += dx * correction; player.z += dz * correction; velocity.multiplyScalar(.68); }
    }
    player.y = floorHeight(player.x, player.z) + 1.48;
  }

  update(elapsed: number) {
    this.fireflies.rotation.y = Math.sin(elapsed * .08) * .08;
    const material = this.fireflies.material as THREE.PointsMaterial; material.opacity = .62 + Math.sin(elapsed * 1.8) * .12;
  }

  dispose() {
    this.root.removeFromParent(); const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh || object instanceof THREE.Points)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
