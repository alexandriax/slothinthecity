import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

export const BOW_BRIDGE_CENTER = new THREE.Vector3(13, 0, -57);
// Route players to the Ramble-side abutment, not the decorative side rail.
export const BOW_BRIDGE_TARGET = new THREE.Vector3(4.1, 0, -58.8);
// The park waypoint lands at the attendant's position just inside the gate,
// so the marker never strands the player at the decorative arch.
export const ZOO_TARGET = new THREE.Vector3(83.7, 0, -90.3);
export const SUBWAY_TARGET = new THREE.Vector3(101, 0, -101);

export type CampaignObstacle =
  | { id: string; kind: "circle"; x: number; z: number; radius: number; minY: number; maxY: number }
  | { id: string; kind: "aabb"; minX: number; maxX: number; minZ: number; maxZ: number; minY: number; maxY: number };

export type CampaignLandmarks = {
  root: THREE.Group;
  attendant: THREE.Group;
  bowBridge: THREE.Group;
  subwayEntrance: THREE.Group;
  zooGate: THREE.Group;
  obstacles: CampaignObstacle[];
  dispose(): void;
};

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([26, 44, 34, 255]), 1, 1, THREE.RGBAFormat);
    texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Campaign landmarks require canvas textures");
  draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

function signTexture(title: string, subtitle: string, accent = "#d9ef8b") {
  return canvasTexture(1024, 384, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, "#10251c"); gradient.addColorStop(1, "#07100d");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(239,238,216,.72)"; context.lineWidth = 12; context.strokeRect(15, 15, width - 30, height - 30);
    context.fillStyle = accent; context.fillRect(52, 48, 12, height - 96);
    context.fillStyle = "#f2f0df"; context.textAlign = "left"; context.textBaseline = "middle";
    context.font = "700 75px Georgia, serif"; context.fillText(title, 100, 142);
    context.fillStyle = "rgba(242,240,223,.72)"; context.font = "700 34px Arial, sans-serif"; context.letterSpacing = "8px"; context.fillText(subtitle, 102, 246);
  });
}

function archedDeckGeometry(length: number, width: number, segments = 36) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const amount = index / segments, x = (amount - .5) * length, y = Math.sin(amount * Math.PI) * 1.15;
    for (const side of [-1, 1]) { positions.push(x, y, side * width / 2); uvs.push(amount * 8, (side + 1) / 2); }
    if (index < segments) { const base = index * 2; indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function parkPathGeometry(points: THREE.Vector3[], width: number, heightAt: (x: number, z: number) => number) {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  points.forEach((point, index) => {
    const previous = points[Math.max(0, index - 1)], next = points[Math.min(points.length - 1, index + 1)];
    const tangent = next.clone().sub(previous).setY(0).normalize(), normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
    for (const side of [-1, 1]) {
      const edge = point.clone().addScaledVector(normal, side * width / 2);
      positions.push(edge.x, heightAt(edge.x, edge.z) + .045, edge.z); uvs.push(index * 2.8, (side + 1) / 2);
    }
    if (index < points.length - 1) { const base = index * 2; indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2); }
  });
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

function addSouthboundParkPath(root: THREE.Group, textures: GameTextures, heightAt: (x: number, z: number) => number) {
  const points = [
    BOW_BRIDGE_TARGET.clone(), new THREE.Vector3(26, 0, -68), new THREE.Vector3(45, 0, -69),
    new THREE.Vector3(63, 0, -77), ZOO_TARGET.clone(), new THREE.Vector3(94, 0, -96), SUBWAY_TARGET.clone(),
  ];
  const material = new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .075, color: "#a8997e", roughness: .98 });
  const path = new THREE.Mesh(parkPathGeometry(points, 3.5, heightAt), material); path.name = "bow-bridge-to-zoo-southbound-path"; path.receiveShadow = true; root.add(path);
}

function addBowBridge(root: THREE.Group, textures: GameTextures, heightAt: (x: number, z: number) => number) {
  const bridge = new THREE.Group(); bridge.name = "bow-bridge-and-lake-landing";
  bridge.position.set(BOW_BRIDGE_CENTER.x, heightAt(BOW_BRIDGE_CENTER.x, BOW_BRIDGE_CENTER.z) + .18, BOW_BRIDGE_CENTER.z); bridge.rotation.y = -.2;
  const iron = new THREE.MeshStandardMaterial({ color: "#e8e1ca", roughness: .42, metalness: .72 });
  const deckMaterial = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .035, color: "#a98f70", roughness: .84 });
  const stone = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .055, color: "#b9aa8d", roughness: .9 });
  const deck = new THREE.Mesh(archedDeckGeometry(18, 3.2), deckMaterial); deck.castShadow = deck.receiveShadow = true; bridge.add(deck);
  const postGeometry = new THREE.CylinderGeometry(.052, .07, 1, 10), postDummy = new THREE.Object3D(), posts = new THREE.InstancedMesh(postGeometry, iron, 34);
  for (const side of [-1, 1]) for (let index = 0; index < 17; index++) {
    const amount = index / 16, x = (amount - .5) * 17.4, deckY = Math.sin(amount * Math.PI) * 1.15;
    postDummy.position.set(x, deckY + .68, side * 1.57); postDummy.scale.set(1, 1.36, 1); postDummy.updateMatrix(); posts.setMatrixAt((side < 0 ? 0 : 17) + index, postDummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true; posts.castShadow = true; bridge.add(posts);
  for (const side of [-1, 1]) {
    const points = Array.from({ length: 37 }, (_, index) => { const amount = index / 36; return new THREE.Vector3((amount - .5) * 17.5, 1.36 + Math.sin(amount * Math.PI) * 1.15, side * 1.57); });
    const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 72, .065, 10, false), iron); rail.castShadow = true; bridge.add(rail);
    for (const height of [.38, .75]) {
      const scroll = new THREE.Mesh(new THREE.TorusGeometry(.34, .035, 8, 28), iron); scroll.scale.y = .65; scroll.position.set(side * 0, height + .55, side * 1.59); scroll.rotation.y = Math.PI / 2; bridge.add(scroll);
    }
  }
  for (const end of [-1, 1]) {
    const pier = new THREE.Mesh(new RoundedBoxGeometry(1.4, 2.2, 4.1, 5, .18), stone); pier.position.set(end * 9.15, .6, 0); pier.castShadow = pier.receiveShadow = true; bridge.add(pier);
  }
  const landing = new THREE.Group(); landing.position.set(6.7, -.05, -5.1); landing.rotation.y = .35;
  for (let index = 0; index < 8; index++) { const plank = new THREE.Mesh(new RoundedBoxGeometry(.48, .11, 4.2, 2, .025), deckMaterial); plank.position.set((index - 3.5) * .5, 0, 0); plank.receiveShadow = true; landing.add(plank); }
  for (const x of [-2.25, 2.25]) { const piling = new THREE.Mesh(new THREE.CylinderGeometry(.11, .15, 2.3, 12), deckMaterial); piling.position.set(x, -.55, 0); piling.castShadow = true; landing.add(piling); }
  bridge.add(landing); root.add(bridge); return bridge;
}

function addAttendant(materials: { uniform: THREE.Material; skin: THREE.Material; metal: THREE.Material }) {
  const attendant = new THREE.Group(); attendant.name = "central-park-zoo-attendant";
  const dark = new THREE.MeshStandardMaterial({ color: "#17211c", roughness: .72 }), white = new THREE.MeshStandardMaterial({ color: "#e4e1d2", roughness: .65 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.27, .58, 8, 18), materials.uniform); torso.position.y = 1.39; attendant.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.23, 24, 16), materials.skin); head.position.y = 2.12; attendant.add(head);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.245, .27, .14, 24), materials.uniform); cap.position.y = 2.34; attendant.add(cap);
  const brim = new THREE.Mesh(new RoundedBoxGeometry(.35, .04, .19, 3, .025), materials.uniform); brim.position.set(0, 2.31, -.17); attendant.add(brim);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .52, 6, 12), materials.uniform); arm.position.set(side * .34, 1.42, 0); arm.rotation.z = side * -.15; attendant.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.085, 14, 10), materials.skin); hand.position.set(side * .39, 1.05, -.02); attendant.add(hand);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.095, .64, 6, 12), dark); leg.position.set(side * .135, .53, 0); attendant.add(leg);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(.22, .11, .34, 3, .04), dark); shoe.position.set(side * .135, .08, -.08); attendant.add(shoe);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.025, 12, 8), dark); eye.position.set(side * .072, 2.16, -.215); attendant.add(eye);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.035, 12, 8), materials.skin); nose.position.set(0, 2.1, -.235); nose.scale.z = .7; attendant.add(nose);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(.2, .03, 7, 20, Math.PI), white); collar.position.set(0, 1.72, -.155); collar.rotation.z = Math.PI; attendant.add(collar);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.26, .035, 7, 22), dark); belt.rotation.x = Math.PI / 2; belt.position.y = 1.06; attendant.add(belt);
  const badge = new THREE.Mesh(new RoundedBoxGeometry(.13, .075, .03, 2, .012), materials.metal); badge.position.set(.12, 1.56, -.27); attendant.add(badge);
  const nameTag = new THREE.Mesh(new RoundedBoxGeometry(.15, .06, .03, 2, .01), white); nameTag.position.set(-.11, 1.56, -.27); attendant.add(nameTag);
  attendant.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; }); return attendant;
}

function addZoo(root: THREE.Group, heightAt: (x: number, z: number) => number, ownedTextures: THREE.Texture[]) {
  const gate = new THREE.Group(); gate.name = "central-park-zoo-entrance"; gate.position.set(ZOO_TARGET.x + 4, heightAt(ZOO_TARGET.x + 4, ZOO_TARGET.z - 4), ZOO_TARGET.z - 4); gate.rotation.y = -.28;
  const brick = new THREE.MeshStandardMaterial({ color: "#9a8267", roughness: .92 });
  const iron = new THREE.MeshStandardMaterial({ color: "#151b18", metalness: .82, roughness: .3 });
  const cream = new THREE.MeshStandardMaterial({ color: "#d9cfb7", roughness: .7 });
  const zooTexture = signTexture("CENTRAL PARK ZOO", "WILDLIFE CONSERVATION · EAST 64TH", "#e5c46c"); ownedTextures.push(zooTexture);
  const zooSignMaterial = new THREE.MeshStandardMaterial({ map: zooTexture, roughness: .48 });
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(1.45, 4.7, 1.45, 5, .15), brick); pillar.position.set(side * 4.7, 2.35, 0); pillar.castShadow = pillar.receiveShadow = true; gate.add(pillar);
    const cap = new THREE.Mesh(new RoundedBoxGeometry(1.75, .28, 1.75, 4, .08), cream); cap.position.set(side * 4.7, 4.76, 0); gate.add(cap);
  }
  const header = new THREE.Mesh(new RoundedBoxGeometry(8.3, 1.18, .32, 5, .1), zooSignMaterial); header.position.set(0, 4.15, 0); header.castShadow = true; gate.add(header);
  for (const x of [-3.4, -2.55, -1.7, -.85, 0, .85, 1.7, 2.55, 3.4]) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, 3.3, 10), iron); bar.position.set(x, 1.65, 0); gate.add(bar); }
  const uniform = new THREE.MeshStandardMaterial({ color: "#334f3d", roughness: .72 }), skin = new THREE.MeshStandardMaterial({ color: "#9b6d50", roughness: .8 });
  const attendant = addAttendant({ uniform, skin, metal: cream }); attendant.position.set(-3.4, 0, -3.5); attendant.rotation.y = 1.85; gate.add(attendant);
  root.add(gate); return { gate, attendant };
}

function addSubwayEntrance(root: THREE.Group, heightAt: (x: number, z: number) => number, ownedTextures: THREE.Texture[]) {
  const entrance = new THREE.Group(); entrance.name = "5-av-59-st-subway-entrance"; entrance.position.set(SUBWAY_TARGET.x, heightAt(SUBWAY_TARGET.x, SUBWAY_TARGET.z), SUBWAY_TARGET.z); entrance.rotation.y = -.2;
  const iron = new THREE.MeshStandardMaterial({ color: "#141917", metalness: .86, roughness: .28 }), stone = new THREE.MeshStandardMaterial({ color: "#aaa08e", roughness: .88 });
  const green = new THREE.MeshPhysicalMaterial({ color: "#5b8f5b", emissive: "#8cc58a", emissiveIntensity: 1.25, roughness: .2, clearcoat: .7 });
  const subwayTexture = signTexture("SUBWAY", "5 AV / 59 ST   ·   N  R  W", "#f0c94c"); ownedTextures.push(subwayTexture);
  const subwaySign = new THREE.Mesh(new RoundedBoxGeometry(5.5, 1.2, .25, 4, .08), new THREE.MeshStandardMaterial({ map: subwayTexture, roughness: .5 })); subwaySign.position.set(0, 2.45, -2.9); entrance.add(subwaySign);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 7; index++) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.035, .045, 1.45, 9), iron); post.position.set(side * 2.35, .76, -2.2 + index * .72); entrance.add(post); }
    const rail = new THREE.Mesh(new RoundedBoxGeometry(.09, .09, 4.6, 3, .025), iron); rail.position.set(side * 2.35, 1.4, 0); entrance.add(rail);
    const globePost = new THREE.Mesh(new THREE.CylinderGeometry(.075, .09, 2.25, 12), iron); globePost.position.set(side * 2.75, 1.12, -2.85); entrance.add(globePost);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.27, 20, 14), green); globe.position.set(side * 2.75, 2.32, -2.85); entrance.add(globe);
  }
  for (let step = 0; step < 11; step++) { const stair = new THREE.Mesh(new RoundedBoxGeometry(4.45, .13, .46, 2, .025), stone); stair.position.set(0, -.11 - step * .12, -2 + step * .43); stair.receiveShadow = true; entrance.add(stair); }
  root.add(entrance); return entrance;
}

export function createCampaignLandmarks(scene: THREE.Scene, textures: GameTextures, heightAt: (x: number, z: number) => number): CampaignLandmarks {
  const root = new THREE.Group(); root.name = "central-park-south-campaign-landmarks"; scene.add(root);
  const ownedTextures: THREE.Texture[] = [], obstacles: CampaignObstacle[] = [];
  addSouthboundParkPath(root, textures, heightAt);
  const bowBridge = addBowBridge(root, textures, heightAt);
  const { gate: zooGate, attendant } = addZoo(root, heightAt, ownedTextures);
  const subwayEntrance = addSubwayEntrance(root, heightAt, ownedTextures);
  obstacles.push(
    { id: "bow-bridge-ramble-pier", kind: "circle", x: BOW_BRIDGE_TARGET.x, z: BOW_BRIDGE_TARGET.z, radius: 1.2, minY: -5, maxY: 8 },
    { id: "zoo-gate-west", kind: "circle", x: ZOO_TARGET.x + .2, z: ZOO_TARGET.z - 2.7, radius: .95, minY: -5, maxY: 8 },
    { id: "zoo-gate-east", kind: "circle", x: ZOO_TARGET.x + 9, z: ZOO_TARGET.z - 5.3, radius: .95, minY: -5, maxY: 8 },
    { id: "subway-railing-west", kind: "aabb", minX: SUBWAY_TARGET.x - 2.7, maxX: SUBWAY_TARGET.x - 2.1, minZ: SUBWAY_TARGET.z - 3.2, maxZ: SUBWAY_TARGET.z + 2.5, minY: -5, maxY: 4 },
    { id: "subway-railing-east", kind: "aabb", minX: SUBWAY_TARGET.x + 2.1, maxX: SUBWAY_TARGET.x + 2.7, minZ: SUBWAY_TARGET.z - 3.2, maxZ: SUBWAY_TARGET.z + 2.5, minY: -5, maxY: 4 },
  );
  return { root, attendant, bowBridge, subwayEntrance, zooGate, obstacles, dispose() {
    scene.remove(root); root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); }); ownedTextures.forEach(texture => texture.dispose());
  } };
}
