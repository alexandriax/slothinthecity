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
    BOW_BRIDGE_TARGET.clone(), new THREE.Vector3(8, 0, -70), new THREE.Vector3(18, 0, -77), new THREE.Vector3(43, 0, -80),
    new THREE.Vector3(63, 0, -77), ZOO_TARGET.clone(), new THREE.Vector3(94, 0, -96), SUBWAY_TARGET.clone(),
  ];
  const material = new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .075, color: "#a8997e", roughness: .98 });
  const path = new THREE.Mesh(parkPathGeometry(points, 3.5, heightAt), material); path.name = "bow-bridge-to-zoo-southbound-path"; path.receiveShadow = true; root.add(path);
}

function addBowBridge(root: THREE.Group, textures: GameTextures, heightAt: (x: number, z: number) => number, ownedTextures: THREE.Texture[]) {
  const bridge = new THREE.Group(); bridge.name = "bow-bridge-and-lake-landing";
  const lakeSurface = heightAt(34, -43) + .82;
  bridge.position.set(BOW_BRIDGE_CENTER.x, Math.max(heightAt(BOW_BRIDGE_CENTER.x, BOW_BRIDGE_CENTER.z) + .18, lakeSurface + .2), BOW_BRIDGE_CENTER.z); bridge.rotation.y = -.2;
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
  bridge.add(landing);

  // A broad T-shaped floating landing reaches both authored boat berths. It
  // turns the boats from scenery in open water into obvious shore-accessible
  // vehicles without adding collision-heavy dock physics.
  const boatLanding = new THREE.Group(); boatLanding.name = "bow-bridge-rowboat-landing"; boatLanding.position.set(10.1, lakeSurface - bridge.position.y + .08, 1.35); boatLanding.rotation.y = -.16;
  for (let index = 0; index < 15; index++) {
    const plank = new THREE.Mesh(new RoundedBoxGeometry(2.8, .105, .38, 2, .025), deckMaterial); plank.position.z = (index - 7) * .4; plank.receiveShadow = true; boatLanding.add(plank);
  }
  for (let index = 0; index < 15; index++) {
    const plank = new THREE.Mesh(new RoundedBoxGeometry(.38, .105, 2.55, 2, .025), deckMaterial); plank.position.set((index - 7) * .4, .01, 2.75); plank.receiveShadow = true; boatLanding.add(plank);
  }
  for (let index = 0; index < 13; index++) {
    const plank = new THREE.Mesh(new RoundedBoxGeometry(.38, .105, 2.25, 2, .025), deckMaterial); plank.position.set(index * .4, .012, -2.72); plank.receiveShadow = true; boatLanding.add(plank);
  }
  for (const x of [-2.95, 2.95]) for (const z of [-2.65, 2.75]) {
    const piling = new THREE.Mesh(new THREE.CylinderGeometry(.12, .17, 2.65, 14), deckMaterial); piling.position.set(x, -.7, z); piling.castShadow = true; boatLanding.add(piling);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, .08, 14), iron); cap.position.set(x, .64, z); boatLanding.add(cap);
  }
  const landingSignTexture = signTexture("THE LAKE", "ROWBOATS  ·  SWIM  ·  BOW BRIDGE", "#e5c46c");
  ownedTextures.push(landingSignTexture);
  const landingSign = new THREE.Mesh(new RoundedBoxGeometry(3.7, 1.05, .16, 4, .07), new THREE.MeshStandardMaterial({ map: landingSignTexture, roughness: .55 }));
  landingSign.position.set(-2.15, 1.52, -2.55); landingSign.rotation.y = .2; boatLanding.add(landingSign);
  const gangway = new THREE.Group(); gangway.name = "bow-bridge-to-floating-dock-gangway";
  const gangwayStart = new THREE.Vector3(8.1, -.08, -3.35), gangwayEnd = new THREE.Vector3(9.35, boatLanding.position.y + .09, -1.15);
  for (let index = 0; index < 13; index++) {
    const amount = index / 12, plank = new THREE.Mesh(new RoundedBoxGeometry(2.35, .1, .31, 2, .022), deckMaterial); plank.position.lerpVectors(gangwayStart, gangwayEnd, amount); plank.receiveShadow = true; gangway.add(plank);
  }
  for (const side of [-1, 1]) { const railStart = gangwayStart.clone().add(new THREE.Vector3(side * 1.05, .72, 0)), railEnd = gangwayEnd.clone().add(new THREE.Vector3(side * 1.05, .72, 0)); const railDirection = railEnd.clone().sub(railStart); const rail = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, railDirection.length(), 8), iron); rail.position.copy(railStart).add(railEnd).multiplyScalar(.5); rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), railDirection.normalize()); gangway.add(rail); }
  bridge.add(gangway, boatLanding); root.add(bridge); return bridge;
}

function addAttendant(materials: { uniform: THREE.Material; skin: THREE.Material; metal: THREE.Material }) {
  const attendant = new THREE.Group(); attendant.name = "central-park-zoo-attendant";
  attendant.userData.role = "zoo-attendant"; attendant.userData.dialogue = "There are no sloths here.";
  const dark = new THREE.MeshStandardMaterial({ color: "#17211c", roughness: .68 }), white = new THREE.MeshStandardMaterial({ color: "#eeeade", roughness: .58 });
  const hair = new THREE.MeshStandardMaterial({ color: "#30251e", roughness: .92 }), iris = new THREE.MeshPhysicalMaterial({ color: "#513923", roughness: .16, clearcoat: .85 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.31, .7, 12, 24), materials.uniform); torso.position.y = 1.48; torso.scale.set(1.05, 1, .8); attendant.add(torso);
  const shirt = new THREE.Mesh(new RoundedBoxGeometry(.34, .52, .055, 4, .025), white); shirt.position.set(0, 1.53, -.276); attendant.add(shirt);
  for (const side of [-1, 1]) {
    const lapel = new THREE.Mesh(new THREE.ConeGeometry(.16, .42, 3), materials.uniform); lapel.position.set(side * .13, 1.69, -.322); lapel.rotation.set(Math.PI / 2, 0, side * -.18); attendant.add(lapel);
  }
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(.105, .12, .22, 16), materials.skin); neck.position.y = 1.94; attendant.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.255, 32, 24), materials.skin); head.scale.set(.92, 1.08, .92); head.position.y = 2.18; attendant.add(head);
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(.19, 24, 16), materials.skin); jaw.scale.set(.86, .72, .68); jaw.position.set(0, 2.06, -.13); attendant.add(jaw);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.262, 28, 18, 0, Math.PI * 2, 0, Math.PI * .52), hair); hairCap.position.y = 2.22; attendant.add(hairCap);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(.25, .285, .16, 28), materials.uniform); cap.position.y = 2.43; attendant.add(cap);
  const capCrown = new THREE.Mesh(new THREE.SphereGeometry(.255, 24, 12, 0, Math.PI * 2, 0, Math.PI * .48), materials.uniform); capCrown.position.y = 2.43; attendant.add(capCrown);
  const brim = new THREE.Mesh(new RoundedBoxGeometry(.39, .042, .22, 4, .025), materials.uniform); brim.position.set(0, 2.4, -.2); attendant.add(brim);
  const capBadge = new THREE.Mesh(new THREE.CircleGeometry(.07, 18), materials.metal); capBadge.position.set(0, 2.48, -.252); attendant.add(capBadge);
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.07, 14, 10), materials.skin); ear.scale.x = .55; ear.position.set(side * .245, 2.2, -.01); attendant.add(ear);
    const upperArm = new THREE.Mesh(new THREE.CapsuleGeometry(.085, .38, 8, 14), materials.uniform); upperArm.position.set(side * .37, 1.53, -.01); upperArm.rotation.z = side * -.13; attendant.add(upperArm);
    const lowerArm = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .32, 8, 14), materials.skin); lowerArm.position.set(side * .42, 1.14, -.11); lowerArm.rotation.set(side * -.11, 0, side * .08); attendant.add(lowerArm);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(.083, .083, .09, 14), white); cuff.position.set(side * .405, 1.34, -.06); cuff.rotation.z = side * -.08; attendant.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.09, 18, 12), materials.skin); hand.scale.set(.82, 1.08, .56); hand.position.set(side * .43, .94, -.14); attendant.add(hand);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.105, .68, 8, 16), dark); leg.position.set(side * .145, .58, 0); attendant.add(leg);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(.23, .12, .39, 4, .045), dark); shoe.position.set(side * .145, .08, -.095); attendant.add(shoe);
    const eyeWhite = new THREE.Mesh(new THREE.SphereGeometry(.046, 18, 12), white); eyeWhite.scale.set(.84, .62, .35); eyeWhite.position.set(side * .082, 2.22, -.238); attendant.add(eyeWhite);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.022, 14, 10), iris); eye.position.set(side * .082, 2.22, -.269); attendant.add(eye);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(.012, .075, 4, 8), hair); brow.position.set(side * .084, 2.29, -.244); brow.rotation.z = side * -.12; attendant.add(brow);
  }
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.04, 14, 10), materials.skin); nose.position.set(0, 2.14, -.282); nose.scale.set(.8, 1.05, .72); attendant.add(nose);
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.055, .009, 6, 18, Math.PI * .78), new THREE.MeshStandardMaterial({ color: "#72483e", roughness: .74 })); mouth.position.set(0, 2.065, -.283); mouth.rotation.z = Math.PI * .11; attendant.add(mouth);
  const tie = new THREE.Mesh(new THREE.ConeGeometry(.055, .25, 4), dark); tie.position.set(0, 1.59, -.32); tie.rotation.x = Math.PI; attendant.add(tie);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(.295, .035, 8, 28), dark); belt.rotation.x = Math.PI / 2; belt.position.y = 1.09; attendant.add(belt);
  const buckle = new THREE.Mesh(new RoundedBoxGeometry(.12, .085, .035, 2, .012), materials.metal); buckle.position.set(0, 1.09, -.3); attendant.add(buckle);
  const badge = new THREE.Mesh(new THREE.CircleGeometry(.075, 18), materials.metal); badge.position.set(.15, 1.69, -.34); attendant.add(badge);
  const nameTag = new THREE.Mesh(new RoundedBoxGeometry(.19, .07, .028, 2, .01), white); nameTag.position.set(-.13, 1.68, -.34); attendant.add(nameTag);
  const radio = new THREE.Mesh(new RoundedBoxGeometry(.13, .22, .075, 3, .02), dark); radio.position.set(.29, 1.48, -.3); attendant.add(radio);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, .19, 7), dark); antenna.position.set(.34, 1.68, -.3); antenna.rotation.z = -.16; attendant.add(antenna);
  const keys = new THREE.Mesh(new THREE.TorusGeometry(.06, .012, 6, 14), materials.metal); keys.position.set(-.27, 1.01, -.25); keys.rotation.y = Math.PI / 2; attendant.add(keys);
  attendant.scale.setScalar(1.04);
  attendant.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; }); return attendant;
}

function addZooVisitor(root: THREE.Group, x: number, z: number, rotation: number, colors: { coat: string; trousers: string; skin: string }, variant: number) {
  const visitor = new THREE.Group(); visitor.name = "central-park-zoo-visitor"; visitor.position.set(x, 0, z); visitor.rotation.y = rotation;
  const coat = new THREE.MeshStandardMaterial({ color: colors.coat, roughness: .83 }), trousers = new THREE.MeshStandardMaterial({ color: colors.trousers, roughness: .86 });
  const skin = new THREE.MeshStandardMaterial({ color: colors.skin, roughness: .84 }), hair = new THREE.MeshStandardMaterial({ color: variant % 2 ? "#37291f" : "#171817", roughness: .92 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.25, .62, 8, 18), coat); torso.position.y = 1.31; torso.scale.z = .76; visitor.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, 22, 16), skin); head.position.y = 2.02; visitor.add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(.226, 20, 12, 0, Math.PI * 2, 0, Math.PI * .48), hair); hairCap.position.y = 2.06; visitor.add(hairCap);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.07, .48, 6, 12), coat); arm.position.set(side * .32, 1.3, -.02); arm.rotation.z = side * -.12; visitor.add(arm);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(.075, 12, 9), skin); hand.position.set(side * .36, .98, -.04); visitor.add(hand);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .62, 6, 12), trousers); leg.position.set(side * .13, .5, 0); visitor.add(leg);
  }
  const backpack = new THREE.Mesh(new RoundedBoxGeometry(.42, .64, .18, 4, .06), new THREE.MeshStandardMaterial({ color: variant % 2 ? "#8d5a3b" : "#465f63", roughness: .8 })); backpack.position.set(0, 1.35, .27); visitor.add(backpack);
  visitor.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; }); root.add(visitor); return visitor;
}

function addZoo(root: THREE.Group, textures: GameTextures, heightAt: (x: number, z: number) => number, ownedTextures: THREE.Texture[]) {
  const gate = new THREE.Group(); gate.name = "central-park-zoo-entrance"; gate.position.set(ZOO_TARGET.x + 4, heightAt(ZOO_TARGET.x + 4, ZOO_TARGET.z - 4), ZOO_TARGET.z - 4); gate.rotation.y = -.28;
  const brick = new THREE.MeshStandardMaterial({ map: textures.ground, bumpMap: textures.ground, bumpScale: .055, color: "#9a8267", roughness: .92 });
  const iron = new THREE.MeshStandardMaterial({ color: "#151b18", metalness: .82, roughness: .3 });
  const cream = new THREE.MeshStandardMaterial({ map: textures.stone, bumpMap: textures.stone, bumpScale: .025, color: "#d9cfb7", roughness: .7 });
  const zooTexture = signTexture("CENTRAL PARK ZOO", "WILDLIFE CONSERVATION · EAST 64TH", "#e5c46c"); ownedTextures.push(zooTexture);
  const welcomeTexture = signTexture("WILDLIFE WELCOME", "TISCH CHILDREN'S ZOO  ·  SEA LION POOL", "#9fc96d"); ownedTextures.push(welcomeTexture);
  const zooSignMaterial = new THREE.MeshStandardMaterial({ map: zooTexture, roughness: .48 });
  const forecourt = new THREE.Mesh(new RoundedBoxGeometry(16.5, .13, 11.5, 5, .18), new THREE.MeshStandardMaterial({ map: textures.gravel, bumpMap: textures.gravel, bumpScale: .045, color: "#aa9f88", roughness: .91 })); forecourt.name = "zoo-entry-forecourt"; forecourt.position.set(0, -.035, 4.2); forecourt.receiveShadow = true; gate.add(forecourt);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new RoundedBoxGeometry(1.75, 5.75, 1.75, 6, .17), brick); pillar.position.set(side * 6.35, 2.87, 0); pillar.castShadow = pillar.receiveShadow = true; gate.add(pillar);
    for (const y of [.75, 2.05, 3.35, 4.65]) { const band = new THREE.Mesh(new RoundedBoxGeometry(1.83, .11, 1.83, 3, .035), cream); band.position.set(side * 6.35, y, 0); gate.add(band); }
    const cap = new THREE.Mesh(new RoundedBoxGeometry(2.08, .34, 2.08, 5, .1), cream); cap.position.set(side * 6.35, 5.84, 0); gate.add(cap);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(.27, 22, 16), new THREE.MeshPhysicalMaterial({ color: "#f7dda0", emissive: "#ffd275", emissiveIntensity: 1.8, roughness: .2, clearcoat: .6 })); globe.position.set(side * 6.35, 6.38, 0); gate.add(globe);
    const sideWall = new THREE.Mesh(new RoundedBoxGeometry(5.6, 2.15, .75, 4, .1), brick); sideWall.position.set(side * 9.85, 1.07, .12); sideWall.castShadow = sideWall.receiveShadow = true; gate.add(sideWall);
  }
  const header = new THREE.Mesh(new RoundedBoxGeometry(11.1, 1.42, .38, 6, .12), zooSignMaterial); header.position.set(0, 5.05, 0); header.castShadow = true; gate.add(header);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(5.55, .12, 12, 72, Math.PI), iron); arch.position.set(0, 3.18, -.04); gate.add(arch);
  for (const side of [-1, 1]) for (let index = 0; index < 6; index++) {
    const x = side * (1.3 + index * .78), bar = new THREE.Mesh(new THREE.CylinderGeometry(.045, .058, 3.55, 10), iron); bar.position.set(x, 1.78, 0); gate.add(bar);
    const spear = new THREE.Mesh(new THREE.ConeGeometry(.095, .31, 8), iron); spear.position.set(x, 3.69, 0); gate.add(spear);
  }
  for (const side of [-1, 1]) {
    const booth = new THREE.Group(); booth.name = "zoo-ticket-kiosk"; booth.position.set(side * 8.15, 0, 3.25);
    const body = new THREE.Mesh(new RoundedBoxGeometry(2.35, 2.7, 1.7, 5, .1), brick); body.position.y = 1.35; body.castShadow = body.receiveShadow = true; booth.add(body);
    const window = new THREE.Mesh(new RoundedBoxGeometry(1.5, .93, .045, 4, .04), new THREE.MeshPhysicalMaterial({ color: "#789392", metalness: .08, roughness: .2, transmission: .28, transparent: true, opacity: .82 })); window.position.set(0, 1.67, -.875); booth.add(window);
    const awning = new THREE.Mesh(new RoundedBoxGeometry(2.55, .14, 1.95, 3, .045), cream); awning.position.y = 2.78; booth.add(awning); gate.add(booth);
  }
  for (const side of [-1, 1]) {
    const banner = new THREE.Mesh(new RoundedBoxGeometry(2.4, 1.55, .12, 4, .06), new THREE.MeshStandardMaterial({ map: welcomeTexture, roughness: .52 })); banner.position.set(side * 4.75, 3.5, -.53); gate.add(banner);
    const planter = new THREE.Mesh(new THREE.CylinderGeometry(.82, .68, .72, 20), brick); planter.position.set(side * 4.55, .36, 4.1); planter.receiveShadow = true; gate.add(planter);
    for (let index = 0; index < 5; index++) { const shrub = new THREE.Mesh(new THREE.IcosahedronGeometry(.42 + (index % 2) * .12, 1), new THREE.MeshStandardMaterial({ color: index % 2 ? "#587443" : "#6f8650", roughness: .9 })); shrub.position.set(side * 4.55 + Math.cos(index * 2.2) * .42, .82 + (index % 2) * .2, 4.1 + Math.sin(index * 2.2) * .38); shrub.castShadow = true; gate.add(shrub); }
  }
  for (const x of [-1.85, 0, 1.85]) {
    const turnstile = new THREE.Mesh(new THREE.CylinderGeometry(.1, .13, 1.2, 12), iron); turnstile.position.set(x, .62, -.36); gate.add(turnstile);
    for (let arm = 0; arm < 3; arm++) { const rail = new THREE.Mesh(new RoundedBoxGeometry(1.2, .055, .055, 2, .015), iron); rail.position.set(x, .78, -.36); rail.rotation.y = arm * Math.PI / 3; gate.add(rail); }
  }
  const uniform = new THREE.MeshStandardMaterial({ color: "#334f3d", roughness: .72 }), skin = new THREE.MeshStandardMaterial({ color: "#9b6d50", roughness: .8 });
  const attendant = addAttendant({ uniform, skin, metal: cream }); attendant.position.set(-2.65, .08, 4.45); attendant.rotation.y = .12; gate.add(attendant);
  addZooVisitor(gate, 1.4, 4.55, -.28, { coat: "#8b6248", trousers: "#303d43", skin: "#c18d68" }, 0);
  addZooVisitor(gate, 3.1, 6.3, 2.72, { coat: "#426271", trousers: "#3d3937", skin: "#7d523e" }, 1);
  const benchWood = new THREE.MeshStandardMaterial({ map: textures.bark, bumpMap: textures.bark, bumpScale: .025, color: "#76543a", roughness: .8 });
  for (const side of [-1, 1]) { const bench = new THREE.Group(); bench.position.set(side * 6.3, .35, 7); bench.rotation.y = side * -.16; for (const y of [0, .42]) { const slat = new THREE.Mesh(new RoundedBoxGeometry(2.5, .12, .38, 3, .035), benchWood); slat.position.y = y; if (y) slat.rotation.x = -.12; bench.add(slat); } gate.add(bench); }
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
  const bowBridge = addBowBridge(root, textures, heightAt, ownedTextures);
  const { gate: zooGate, attendant } = addZoo(root, textures, heightAt, ownedTextures);
  const subwayEntrance = addSubwayEntrance(root, heightAt, ownedTextures);
  zooGate.updateMatrixWorld(true);
  const zooWestPillar = zooGate.localToWorld(new THREE.Vector3(-6.35, 0, 0));
  const zooEastPillar = zooGate.localToWorld(new THREE.Vector3(6.35, 0, 0));
  const zooWestBooth = zooGate.localToWorld(new THREE.Vector3(-8.15, 0, 3.25));
  const zooEastBooth = zooGate.localToWorld(new THREE.Vector3(8.15, 0, 3.25));
  obstacles.push(
    { id: "bow-bridge-ramble-pier", kind: "circle", x: BOW_BRIDGE_TARGET.x, z: BOW_BRIDGE_TARGET.z, radius: 1.2, minY: -5, maxY: 8 },
    { id: "zoo-gate-west", kind: "circle", x: zooWestPillar.x, z: zooWestPillar.z, radius: 1.08, minY: -5, maxY: 8 },
    { id: "zoo-gate-east", kind: "circle", x: zooEastPillar.x, z: zooEastPillar.z, radius: 1.08, minY: -5, maxY: 8 },
    { id: "zoo-booth-west", kind: "circle", x: zooWestBooth.x, z: zooWestBooth.z, radius: 1.45, minY: -5, maxY: 5 },
    { id: "zoo-booth-east", kind: "circle", x: zooEastBooth.x, z: zooEastBooth.z, radius: 1.45, minY: -5, maxY: 5 },
    { id: "subway-railing-west", kind: "aabb", minX: SUBWAY_TARGET.x - 2.7, maxX: SUBWAY_TARGET.x - 2.1, minZ: SUBWAY_TARGET.z - 3.2, maxZ: SUBWAY_TARGET.z + 2.5, minY: -5, maxY: 4 },
    { id: "subway-railing-east", kind: "aabb", minX: SUBWAY_TARGET.x + 2.1, maxX: SUBWAY_TARGET.x + 2.7, minZ: SUBWAY_TARGET.z - 3.2, maxZ: SUBWAY_TARGET.z + 2.5, minY: -5, maxY: 4 },
  );
  return { root, attendant, bowBridge, subwayEntrance, zooGate, obstacles, dispose() {
    scene.remove(root); root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); }); ownedTextures.forEach(texture => texture.dispose());
  } };
}
