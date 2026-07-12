import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

function signTexture() {
  const canvas = document.createElement("canvas"); canvas.width = 1536; canvas.height = 384;
  const context = canvas.getContext("2d"); if (!context) return null;
  const gradient = context.createLinearGradient(0, 0, canvas.width, canvas.height); gradient.addColorStop(0, "#173d2a"); gradient.addColorStop(1, "#081e13");
  context.fillStyle = gradient; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#cfe59b"; context.lineWidth = 15; context.strokeRect(22, 22, canvas.width - 44, canvas.height - 44);
  context.fillStyle = "#f4f0dc"; context.textAlign = "center"; context.textBaseline = "middle"; context.font = "700 116px Georgia, serif"; context.fillText("BRONX ZOO", canvas.width / 2, 145);
  context.fillStyle = "#cfe59b"; context.font = "700 40px Helvetica, Arial, sans-serif"; context.letterSpacing = "13px"; context.fillText("ASIA GATE · WELCOME HOME", canvas.width / 2, 266);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
}

function addTree(root: THREE.Group, textures: GameTextures, x: number, z: number, scale: number) {
  const trunkMaterial = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .09, color: "#78624d", roughness: .96 });
  const leafMaterial = new THREE.MeshStandardMaterial({ map: textures.foliage, alphaMap: textures.foliage, alphaTest: .24, color: "#4f7447", roughness: .86, side: THREE.DoubleSide });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.34 * scale, .56 * scale, 7.5 * scale, 18), trunkMaterial); trunk.position.set(x, 3.75 * scale, z); trunk.castShadow = trunk.receiveShadow = true; root.add(trunk);
  for (let index = 0; index < 7; index++) {
    const angle = index * 2.399, radius = (1.1 + index % 3 * .5) * scale;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry((2.25 + index % 2 * .52) * scale, 2), leafMaterial);
    crown.position.set(x + Math.cos(angle) * radius, (7.3 + (index % 3) * .7) * scale, z + Math.sin(angle) * radius); crown.rotation.set(index * .19, angle, index * .11); crown.castShadow = true; root.add(crown);
  }
}

function addFriend(root: THREE.Group, textures: GameTextures, x: number, z: number, rotation: number, tint: string) {
  const friend = new THREE.Group(); friend.name = "waiting-sloth-friend"; friend.position.set(x, 0, z); friend.rotation.y = rotation;
  const fur = new THREE.MeshStandardMaterial({ map: textures.fur, bumpMap: textures.fur, bumpScale: .075, color: tint, roughness: .94 });
  const face = new THREE.MeshStandardMaterial({ color: "#b9aa8d", roughness: .92 }), dark = new THREE.MeshStandardMaterial({ color: "#191b18", roughness: .72 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.64, 1.12, 12, 22), fur); body.position.y = 1.42; body.rotation.z = -.08; body.castShadow = true; friend.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.56, 28, 20), fur); head.scale.set(1, .9, .88); head.position.set(0, 2.5, -.08); head.castShadow = true; friend.add(head);
  const mask = new THREE.Mesh(new THREE.SphereGeometry(.42, 28, 18, 0, Math.PI * 2, .18, Math.PI * .68), face); mask.scale.set(1.06, .86, .28); mask.position.set(0, 2.48, -.55); mask.rotation.x = -.09; friend.add(mask);
  for (const side of [-1, 1]) {
    const eyePatch = new THREE.Mesh(new THREE.SphereGeometry(.13, 16, 12), dark); eyePatch.scale.set(1.45, .72, .34); eyePatch.position.set(side * .2, 2.54, -.69); eyePatch.rotation.z = side * .32; friend.add(eyePatch);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.044, 14, 10), new THREE.MeshPhysicalMaterial({ color: "#35261a", roughness: .12, clearcoat: 1 })); eye.position.set(side * .2, 2.56, -.75); friend.add(eye);
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.18, .92, 8, 18), fur); arm.position.set(side * .7, 1.62, -.04); arm.rotation.z = side * -.32; arm.castShadow = true; friend.add(arm);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.09, 16, 12), dark); nose.scale.set(1.25, .7, .72); nose.position.set(0, 2.38, -.78); friend.add(nose);
  friend.scale.setScalar(.92); root.add(friend); return friend;
}

export class BronxZooWorld {
  readonly root = new THREE.Group();
  readonly cameraPosition = new THREE.Vector3(0, 2.15, 11.5);
  readonly cameraTarget = new THREE.Vector3(0, 3.3, -4);
  private ownedTextures: THREE.Texture[] = [];

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "bronx-zoo-finale-world"; scene.add(this.root);
    const skyFill = new THREE.HemisphereLight("#e9f4dc", "#32483a", 1.7), sunset = new THREE.DirectionalLight("#ffdda1", 2.65); sunset.position.set(-18, 30, 16); sunset.castShadow = quality > .72; sunset.shadow.mapSize.set(quality > .9 ? 2048 : 1024, quality > .9 ? 2048 : 1024); this.root.add(skyFill, sunset);
    const groundMaterial = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .08, color: "#768361", roughness: .96 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(72, 52, 12, 10), groundMaterial); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.root.add(ground);
    const path = new THREE.Mesh(new THREE.PlaneGeometry(10, 48), new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .04, color: "#b3a98f", roughness: .94 })); path.rotation.x = -Math.PI / 2; path.position.set(0, .018, 10); path.receiveShadow = true; this.root.add(path);
    const stone = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .045, color: "#b8ad95", roughness: .89 }), iron = new THREE.MeshStandardMaterial({ color: "#121b17", metalness: .84, roughness: .28 });
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(new RoundedBoxGeometry(2.2, 8, 2.2, 6, .18), stone); pillar.position.set(side * 6.2, 4, -4); pillar.castShadow = true; this.root.add(pillar);
      for (let x = 7.4; x < 19; x += 1.25) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, 4.8, 10), iron); bar.position.set(side * x, 2.35, -4); this.root.add(bar); }
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(6.2, .46, 18, 80, Math.PI), iron); arch.position.set(0, 6.55, -4); this.root.add(arch);
    const texture = signTexture(); if (texture) this.ownedTextures.push(texture);
    const sign = new THREE.Mesh(new RoundedBoxGeometry(7.6, 1.14, .26, 5, .09), new THREE.MeshBasicMaterial({ color: "#fff", map: texture, toneMapped: false })); sign.position.set(0, 7.55, -4); this.root.add(sign);
    for (const [x, z, scale] of [[-17, -6, 1.05], [-13, 1, .82], [13, 0, .9], [18, -7, 1.08], [-20, 10, .78], [20, 11, .76]] as const) addTree(this.root, textures, x, z, scale);
    addFriend(this.root, textures, -2.25, -1.45, .08, "#8d8068"); addFriend(this.root, textures, 0, -2.1, 0, "#756957"); addFriend(this.root, textures, 2.25, -1.4, -.08, "#9a886d");
    const glow = new THREE.PointLight("#e5f3b9", 26, 18, 1.45); glow.position.set(0, 6.4, -1); this.root.add(glow);
  }

  update(elapsed: number) {
    this.root.traverse(object => { if (object.name === "waiting-sloth-friend") { object.rotation.z = Math.sin(elapsed * .9 + object.position.x) * .018; } });
  }

  dispose() {
    this.root.removeFromParent(); const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => materials.add(material)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
