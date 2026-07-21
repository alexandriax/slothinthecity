import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { GameTextures } from "../rendering/textures";
import { createPremiumHuman, createPremiumSlothFriend, markPremiumCharactersDisposed } from "./PremiumCharacter";
import { createAmbientHumanAgent, updateAmbientHumanAgent, type AmbientHumanAgent } from "./characters/AmbientHumanMotion";
import { createElectricScooter, rollPersonalMobility, type PersonalMobilityVehicle } from "./PersonalMobility";
import { createWhiskersCat, type ZooAnimalRig } from "./ZooAnimals";
import { markAuthoredZooAnimalDisposed } from "./animals/AuthoredZooAnimalAssets";

type BoxObstacle = { minX: number; maxX: number; minZ: number; maxZ: number };
type CircleObstacle = { x: number; z: number; radius: number };

export type WhiskersQuestState = "AVAILABLE" | "TRAIL" | "COMPLETE";
export type WhiskersQuestEvent = {
  kind: "WHISKERS_TRAIL_STARTED" | "WHISKERS_TRAIL_ADVANCED" | "WHISKERS_FOUND";
  message: string;
  progress: number;
  total: number;
};
export type WhiskersInteractionHint = { label: string; target: THREE.Vector3; distance: number };

const WHISKERS_HIDEOUTS = [
  { position: new THREE.Vector3(-7, 0, 15), label: "CALL TO WHISKERS INSIDE THE ROTUNDA ENTRANCE", moment: "Whiskers chirps back, then trots toward the blue whale gallery." },
  { position: new THREE.Vector3(-24, 0, -43), label: "GREET WHISKERS BY THE BLUE WHALE", moment: "A tan tail slips past the ocean-life case; fresh pawprints continue south." },
  { position: new THREE.Vector3(24, 0, -83), label: "FIND WHISKERS AT THE AKELEY DIORAMAS", moment: "Whiskers studies the painted savanna, then pads toward the meteorite halls." },
  { position: new THREE.Vector3(-24, 0, -112), label: "FOLLOW WHISKERS TO AHNIGHITO", moment: "Whiskers' white paws circle the meteorite and turn toward the fossil halls." },
  { position: new THREE.Vector3(19, 0, -145), label: "SPOT WHISKERS IN THE MAMMAL HALL", moment: "Whiskers pauses beside a fossil case, waiting until the whole group catches up." },
  { position: new THREE.Vector3(-10, 0, -174), label: "READ WHISKERS' BRASS MUSEUM TAG", moment: "The tag reads “Whiskers · Resident Gallery Cat.” She joins the final walk to Megatherium." },
] as const;

function whiskersRoute(seed: number) {
  const middle = [1, 2, 3, 4], order = [0];
  let value = seed >>> 0;
  const random = () => ((value = Math.imul(value ^ value >>> 15, 1 | value), value ^= value + Math.imul(value ^ value >>> 7, 61 | value), ((value ^ value >>> 14) >>> 0) / 4294967296));
  for (let index = middle.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [middle[index], middle[swap]] = [middle[swap], middle[index]];
  }
  order.push(...middle.slice(0, 3), 5);
  return Object.freeze(order);
}

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
    const fit = (text: string, start: number, minimum: number, weight: number, family: string, maxWidth: number) => {
      let size = start;
      while (size > minimum) {
        context.font = `${weight} ${size}px ${family}`;
        if (context.measureText(text).width <= maxWidth) break;
        size -= 2;
      }
      return size;
    };
    const titleSize = fit(title, 88, 42, 700, "Georgia, serif", 1120);
    context.font = `700 ${titleSize}px Georgia, serif`; context.fillText(title, 640, 172, 1120);
    context.fillStyle = accent;
    const subtitleSize = fit(subtitle, 34, 23, 600, "Helvetica, Arial, sans-serif", 1120);
    context.font = `600 ${subtitleSize}px Helvetica, Arial, sans-serif`; context.fillText(subtitle, 640, 314, 1120);
  });
}

function facadeBannerTexture() {
  return canvasTexture(1536, 512, context => {
    context.fillStyle = "#d9d1bd"; context.fillRect(0, 0, 1536, 512);
    context.fillStyle = "#3c3932"; context.textAlign = "center"; context.textBaseline = "middle";
    const title = "AMERICAN MUSEUM OF NATURAL HISTORY", subtitle = "CENTRAL PARK WEST · THEODORE ROOSEVELT MEMORIAL";
    let titleSize = 83; context.font = `700 ${titleSize}px Georgia, serif`;
    while (titleSize > 54 && context.measureText(title).width > 1370) { titleSize -= 2; context.font = `700 ${titleSize}px Georgia, serif`; }
    context.fillText(title, 768, 210, 1370);
    let subtitleSize = 34; context.font = `600 ${subtitleSize}px Helvetica, Arial, sans-serif`;
    while (subtitleSize > 24 && context.measureText(subtitle).width > 1320) { subtitleSize -= 1; context.font = `600 ${subtitleSize}px Helvetica, Arial, sans-serif`; }
    context.fillText(subtitle, 768, 340, 1320);
  });
}

function collectionGraphicTexture(title: string, subtitle: string, index: number) {
  return canvasTexture(1024, 640, context => {
    const palettes = [
      ["#152b31", "#557b78", "#d7c091"], ["#30281f", "#8b6545", "#dfcfa7"],
      ["#202c22", "#58714f", "#d5c997"], ["#2d2732", "#76647c", "#d7c7a5"],
    ] as const;
    const [background, mid, accent] = palettes[index % palettes.length];
    const gradient = context.createLinearGradient(0, 0, 1024, 640); gradient.addColorStop(0, background); gradient.addColorStop(.58, mid); gradient.addColorStop(1, background);
    context.fillStyle = gradient; context.fillRect(0, 0, 1024, 640);
    context.globalAlpha = .22;
    for (let ring = 0; ring < 18; ring++) {
      context.strokeStyle = ring % 3 ? accent : "#ffffff"; context.lineWidth = 4 + ring % 4;
      context.beginPath(); context.ellipse(170 + ring * 43, 310 + Math.sin(ring * 1.7) * 120, 92 + ring * 9, 34 + ring * 2, ring * .31, 0, Math.PI * 2); context.stroke();
    }
    context.globalAlpha = 1;
    context.fillStyle = "rgba(12,16,15,.72)"; context.fillRect(42, 390, 940, 190);
    context.strokeStyle = accent; context.lineWidth = 10; context.strokeRect(18, 18, 988, 604);
    context.fillStyle = "#f7f0df"; context.textAlign = "left"; context.textBaseline = "middle";
    context.font = "700 62px Georgia, serif"; context.fillText(title, 76, 454, 870);
    context.fillStyle = accent; context.font = "600 28px Helvetica, Arial, sans-serif"; context.fillText(subtitle, 78, 530, 860);
  });
}

function cylinderBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, segments = 14) {
  const direction = end.clone().sub(start), mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius * .9, radius, direction.length(), segments, 2), material);
  mesh.position.copy(start).add(end).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); return mesh;
}

function fossilBoneBetween(start: THREE.Vector3, end: THREE.Vector3, radius: number, material: THREE.Material, segments = 20) {
  const root = new THREE.Group();
  root.name = "museum-sculpted-fossil-bone";
  const direction = end.clone().sub(start), length = direction.length();
  const shaft = new THREE.Mesh(new THREE.CapsuleGeometry(radius * .72, Math.max(.01, length - radius * 1.8), 7, segments), material);
  shaft.position.copy(start).add(end).multiplyScalar(.5);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  root.add(shaft);
  for (const point of [start, end]) {
    const epiphysis = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.12, segments, Math.max(10, Math.round(segments * .65))), material);
    epiphysis.position.copy(point);
    epiphysis.scale.set(1.06, .82, 1.18);
    root.add(epiphysis);
  }
  return root;
}

function fossilVertebra(point: THREE.Vector3, scale: number, material: THREE.Material, yaw = 0) {
  const vertebra = new THREE.Group();
  vertebra.name = "museum-anatomical-vertebra-with-processes";
  vertebra.position.copy(point); vertebra.rotation.y = yaw;
  const centrum = new THREE.Mesh(new THREE.SphereGeometry(scale, 14, 9), material);
  centrum.scale.set(1.18, .72, .82); vertebra.add(centrum);
  const neuralSpine = new THREE.Mesh(new THREE.ConeGeometry(scale * .24, scale * 1.85, 8), material);
  neuralSpine.position.y = scale * 1.05; neuralSpine.scale.z = .58; vertebra.add(neuralSpine);
  for (const side of [-1, 1]) {
    const process = cylinderBetween(
      new THREE.Vector3(side * scale * .55, scale * .12, 0),
      new THREE.Vector3(side * scale * 1.45, scale * .32, scale * .08),
      scale * .12,
      material,
      8,
    );
    vertebra.add(process);
  }
  return vertebra;
}

function fossilRib(start: THREE.Vector3, side: -1 | 1, drop: number, width: number, material: THREE.Material) {
  const curve = new THREE.CatmullRomCurve3([
    start,
    start.clone().add(new THREE.Vector3(side * width * .48, -.08, .02)),
    start.clone().add(new THREE.Vector3(side * width, -drop * .45, .18)),
    start.clone().add(new THREE.Vector3(side * width * .72, -drop, .42)),
  ], false, "centripetal");
  const rib = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, .055, 9, false), material);
  rib.name = "museum-curved-articulated-fossil-rib";
  return rib;
}

function mergeMuseumFossils(root: THREE.Group, material: THREE.Material, name: string) {
  root.updateMatrixWorld(true);
  const sources: THREE.Mesh[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  root.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object.material !== material) return;
    let geometry = object.geometry.clone();
    // BufferGeometryUtils requires every source to agree on index and
    // attribute layout. Museum bones combine rounded boxes, spheres, tubes,
    // cones and capsules, and those constructors do not all make the same
    // indexing choice. Flattening once at authoring time is far cheaper than
    // leaving hundreds of independent fossil draw calls alive at runtime.
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose();
      geometry = nonIndexed;
    }
    geometry.applyMatrix4(object.matrixWorld);
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    if (!geometry.getAttribute("uv")) {
      const count = geometry.getAttribute("position")?.count ?? 0;
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(count * 2), 2));
    }
    for (const attribute of Object.keys(geometry.attributes)) {
      if (!new Set(["position", "normal", "uv"]).has(attribute)) geometry.deleteAttribute(attribute);
    }
    geometry.clearGroups();
    sources.push(object); geometries.push(geometry);
  });
  const merged = mergeGeometries(geometries, false);
  geometries.forEach(geometry => geometry.dispose());
  if (!merged) return;
  sources.forEach(source => {
    source.removeFromParent(); source.geometry.dispose();
  });
  const mesh = new THREE.Mesh(merged, material); mesh.name = name; root.add(mesh);
}

function setShadows(root: THREE.Object3D, cast: boolean) {
  root.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = cast; object.receiveShadow = true; } });
}

function addExhibitSign(root: THREE.Group, ownedTextures: THREE.Texture[], title: string, subtitle: string, x: number, y: number, z: number, yaw = 0, scale = 1) {
  const texture = exhibitTexture(title, subtitle); ownedTextures.push(texture);
  const sign = new THREE.Mesh(new RoundedBoxGeometry(5.8 * scale, 2.15 * scale, .14, 4, .035), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  sign.name = title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-museum-label"; sign.position.set(x, y, z); sign.rotation.y = yaw; root.add(sign);
}

function addGroundedMegatheriumSign(root: THREE.Group, ownedTextures: THREE.Texture[], brass: THREE.Material) {
  const texture = exhibitTexture("MEGATHERIUM AMERICANUM", "GIANT GROUND SLOTH · FOSSIL MAMMAL HALLS · FLOOR 4");
  ownedTextures.push(texture);
  const sign = new THREE.Group();
  sign.name = "megatherium-americanum-grounded-exhibit-sign";
  sign.position.set(-6.2, 0, -210.5);
  sign.rotation.y = 0;
  const frame = new THREE.Mesh(new RoundedBoxGeometry(7.55, 2.95, .24, 5, .06), brass);
  frame.name = "megatherium-exhibit-sign-brass-frame";
  frame.position.y = 2.12;
  sign.add(frame);
  const face = new THREE.Mesh(new RoundedBoxGeometry(7.22, 2.62, .07, 4, .025), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
  face.name = "megatherium-americanum-museum-label";
  face.position.set(0, 2.12, .145);
  sign.add(face);
  for (const x of [-2.55, 2.55]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.075, .11, 1.45, 12), brass);
    post.name = "megatherium-exhibit-sign-grounded-support-post";
    post.position.set(x, .725, 0);
    sign.add(post);
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(.3, .36, .1, 16), brass);
    foot.name = "megatherium-exhibit-sign-floor-foot";
    foot.position.set(x, .05, 0);
    sign.add(foot);
  }
  root.add(sign);
}

function addArchitecture(root: THREE.Group, textures: GameTextures, ownedTextures: THREE.Texture[], quality: number, boxes: BoxObstacle[]) {
  const limestone = new THREE.MeshStandardMaterial({ color: "#c6bda8", map: textures.stone, roughness: .83 });
  const redStone = new THREE.MeshStandardMaterial({ color: "#7a4b40", map: textures.stone, roughness: .86 });
  const bronze = new THREE.MeshStandardMaterial({ color: "#4b4a3d", roughness: .38, metalness: .58 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#b7d5d8", roughness: .08, transparent: true, opacity: .18, transmission: .72, depthWrite: false, clearcoat: .32 });
  glass.forceSinglePass = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(96, 290), new THREE.MeshStandardMaterial({ color: "#aa9e87", map: textures.stone, roughness: .7, metalness: .05 }));
  floor.name = "museum-polished-stone-floor"; floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, -90); root.add(floor);
  const galleryRunner = new THREE.Mesh(
    new THREE.PlaneGeometry(18.5, 228),
    new THREE.MeshStandardMaterial({ color: "#675f52", map: textures.stone, roughness: .74, metalness: .04 }),
  );
  galleryRunner.name = "museum-continuous-warm-terrazzo-gallery-runner";
  galleryRunner.rotation.x = -Math.PI / 2;
  galleryRunner.position.set(0, .018, -106);
  root.add(galleryRunner);
  const galleryBrass = new THREE.MeshStandardMaterial({ color: "#9c8147", metalness: .62, roughness: .42 });
  for (const x of [-9.15, 9.15]) {
    const inlay = new THREE.Mesh(new RoundedBoxGeometry(.11, .026, 228, 2, .012), galleryBrass);
    inlay.name = "museum-continuous-brass-floor-inlay";
    inlay.position.set(x, .035, -106);
    root.add(inlay);
  }
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
  for (let step = 0; step < steps; step++) { const stair = new THREE.Mesh(new RoundedBoxGeometry(34 + step * 1.25, .22, 1.25, 3, .04), limestone); stair.name = "amnh-player-climbable-roosevelt-entrance-step"; stair.position.set(0, step * .135, 34 - step * 1.12); facade.add(stair); }
  for (let column = -5; column <= 5; column++) {
    if (column === 0) continue;
    const base = new THREE.Mesh(new RoundedBoxGeometry(1.68, .5, 1.68, 4, .07), limestone);
    base.name = "roosevelt-portico-grounded-column-base"; base.position.set(column * 4.5, 1.15, 24); facade.add(base);
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.62, .72, 12, quality > .72 ? 22 : 14), limestone);
    shaft.name = "roosevelt-portico-column-shaft-touching-base"; shaft.position.set(column * 4.5, 7.4, 24); facade.add(shaft);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.78, .65, .34, quality > .72 ? 22 : 14), limestone);
    neck.position.set(column * 4.5, 13.48, 24); facade.add(neck);
    const capital = new THREE.Mesh(new RoundedBoxGeometry(1.82, .52, 1.82, 4, .08), limestone);
    capital.name = "roosevelt-portico-capital-touching-entablature"; capital.position.set(column * 4.5, 13.74, 24); facade.add(capital);
  }
  const entryBrass = new THREE.MeshStandardMaterial({ color: "#9d824b", metalness: .68, roughness: .36 });
  // Close the narrow reveal gaps between the three portals and the flanking
  // wings. These are true masonry piers, not an opaque wall behind the doors.
  for (const x of [-9.15, -3, 3, 9.15]) {
    const pierWidth = Math.abs(x) > 6 ? 1.7 : 1.3;
    const pier = new THREE.Mesh(new RoundedBoxGeometry(pierWidth, 10.1, 1.1, 5, .08), limestone);
    pier.name = "amnh-solid-masonry-between-public-entry-portals";
    pier.position.set(x, 6.05, 23.55); facade.add(pier);
  }
  for (const x of [-6, 0, 6]) {
    // The portal remains physically empty all the way to the rotunda. A warm
    // soffit and side reveals communicate depth without hiding the interior.
    const soffit = new THREE.Mesh(new RoundedBoxGeometry(4.5, .34, 4.8, 5, .06), limestone);
    soffit.name = "amnh-cut-through-portal-limestone-soffit"; soffit.position.set(x, 8.25, 21.7); facade.add(soffit);
    for (const side of [-1, 1]) {
      const reveal = new THREE.Mesh(new RoundedBoxGeometry(.3, 7.05, 4.8, 4, .05), limestone);
      reveal.name = "amnh-cut-through-portal-solid-side-reveal"; reveal.position.set(x + side * 2.28, 4.72, 21.7); facade.add(reveal);
    }
    const transom = new THREE.Mesh(new RoundedBoxGeometry(3.8, 2.05, .08, 5, .035), glass);
    transom.name = "amnh-entrance-glass-transom-above-human-scale-doors"; transom.position.set(x, 6.55, 24.12); facade.add(transom);
    for (const mullionX of [-1.25, 0, 1.25]) {
      const mullion = new THREE.Mesh(new RoundedBoxGeometry(.075, 2.08, .1, 3, .025), entryBrass);
      mullion.position.set(x + mullionX, 6.55, 24.2); facade.add(mullion);
    }
    for (const side of [-1, 1]) {
      const pivot = new THREE.Group(); pivot.name = "amnh-human-scale-open-entry-door-pivot"; pivot.position.set(x + side * 1.82, 1.13, 24.18); pivot.rotation.y = side * .78;
      const door = new THREE.Mesh(new RoundedBoxGeometry(1.72, 3.65, .09, 5, .04), glass);
      door.name = "amnh-human-scale-bronze-and-glass-entrance-door"; door.position.set(-side * .86, 1.83, 0); pivot.add(door);
      for (const stileX of [-.78, .78]) { const stile = new THREE.Mesh(new RoundedBoxGeometry(.075, 3.64, .11, 3, .025), entryBrass); stile.position.set(-side * .86 + stileX, 1.83, .02); pivot.add(stile); }
      for (const railY of [.22, 1.12, 3.42]) { const rail = new THREE.Mesh(new RoundedBoxGeometry(1.72, .075, .11, 3, .025), entryBrass); rail.position.set(-side * .86, railY, .02); pivot.add(rail); }
      const kickPlate = new THREE.Mesh(new RoundedBoxGeometry(1.48, .52, .035, 3, .015), entryBrass); kickPlate.position.set(-side * .86, .49, -.055); pivot.add(kickPlate);
      const pull = new THREE.Mesh(new RoundedBoxGeometry(.055, 1.05, .08, 3, .02), entryBrass);
      pull.position.set(-side * .42, 1.95, -.11); pivot.add(pull); facade.add(pivot);
    }
    const threshold = new THREE.Mesh(new RoundedBoxGeometry(4.9, .16, 1.25, 3, .035), limestone);
    threshold.name = "amnh-grounded-public-entry-threshold"; threshold.position.set(x, 1.1, 24.7); facade.add(threshold);
  }
  const entryCarpet = new THREE.Mesh(new RoundedBoxGeometry(8.8, .035, 8.4, 4, .014), new THREE.MeshStandardMaterial({ color: "#65342b", roughness: .94 }));
  entryCarpet.name = "amnh-clearly-marked-public-entry-carpet"; entryCarpet.position.set(0, 1.12, 28.2); facade.add(entryCarpet);
  const entryLanding = new THREE.Mesh(new RoundedBoxGeometry(17.2, .16, 5.6, 4, .04), limestone);
  entryLanding.name = "amnh-collision-matched-entrance-landing"; entryLanding.position.set(0, 1.1, 22.6); facade.add(entryLanding);
  const lobbyRamp = new THREE.Mesh(new THREE.PlaneGeometry(16.4, 10.2, 1, 10), new THREE.MeshStandardMaterial({ color: "#b8ab91", map: textures.stone, roughness: .76, side: THREE.DoubleSide }));
  lobbyRamp.name = "amnh-interior-access-ramp-from-portico-to-rotunda"; lobbyRamp.rotation.x = -Math.PI / 2 - Math.atan2(1.12, 10.2); lobbyRamp.position.set(0, .56, 15.5); facade.add(lobbyRamp);
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
  addExhibitSign(root, ownedTextures, "PUBLIC ENTRANCE", "THEODORE ROOSEVELT ROTUNDA · ALL VISITORS", 0, 10.65, 24.18, 0, .62);
  // Keep only the real masonry beside and between the three open doors
  // collidable. Every portal opening stays walkable and visually transparent.
  boxes.push(
    { minX: -38, maxX: -10, minZ: 22, maxZ: 26 },
    { minX: 10, maxX: 38, minZ: 22, maxZ: 26 },
    { minX: -3.7, maxX: -2.3, minZ: 22, maxZ: 26 },
    { minX: 2.3, maxX: 3.7, minZ: 22, maxZ: 26 },
  );

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
  // A repeating architectural frame gives the 230-metre gallery a readable
  // human scale. Previously its distant signs floated against fog because the
  // only longitudinal walls sat beyond the first-person camera's field of
  // view.
  const galleryFrames = [8, -31, -61, -92, -122, -153, -183, -218];
  galleryFrames.forEach((z, index) => {
    const surface = index % 2 ? darkWall : wall;
    for (const x of [-13.5, 13.5]) {
      addWall("museum-central-gallery-grounded-pilaster", x, 4.6, z, 1.15, 9.2, 1.2, surface);
      boxes.push({ minX: x - .575, maxX: x + .575, minZ: z - .6, maxZ: z + .6 });
      const base = new THREE.Mesh(new RoundedBoxGeometry(1.65, .34, 1.65, 4, .06), galleryBrass);
      base.name = "museum-central-gallery-pilaster-brass-foot";
      base.position.set(x, .17, z);
      root.add(base);
    }
    addWall("museum-central-gallery-overhead-lintel", 0, 9.15, z, 28.15, 1.05, 1.2, surface);
    const medallion = new THREE.Mesh(new THREE.RingGeometry(2.45, 2.62, 56), galleryBrass);
    medallion.name = "museum-brass-floor-medallion";
    medallion.rotation.x = -Math.PI / 2;
    medallion.position.set(0, .052, z + 2.1);
    root.add(medallion);
    const pendant = new THREE.Mesh(
      new THREE.SphereGeometry(.3, 18, 12),
      new THREE.MeshStandardMaterial({ color: "#f5dfaa", emissive: "#e1ac55", emissiveIntensity: 1.15, roughness: .28 }),
    );
    pendant.name = "museum-central-gallery-warm-pendant";
    pendant.position.set(0, 8.35, z + 1.1);
    root.add(pendant);
  });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(92, 220), new THREE.MeshStandardMaterial({ color: "#e4ddcf", roughness: .96, side: THREE.DoubleSide })); ceiling.rotation.x = Math.PI / 2; ceiling.position.set(0, 11.2, -105); root.add(ceiling);
  for (let z = 9; z > -220; z -= 26) for (const x of [-24, 0, 24]) {
    const fixture = new THREE.Mesh(new THREE.CylinderGeometry(.28, .5, .18, 12), new THREE.MeshStandardMaterial({ color: "#eee2bd", emissive: "#ffe2a2", emissiveIntensity: 1.25 })); fixture.position.set(x, 8.8, z); root.add(fixture);
  }
}

function detailedMineralSpecimen(index: number, materials: THREE.Material[]) {
  const specimen = new THREE.Group(); specimen.name = "museum-multi-crystal-geological-specimen";
  const base = new THREE.Mesh(new THREE.DodecahedronGeometry(.54, 2), materials[(index + 2) % materials.length]); base.scale.set(1.25, .42, .92); base.position.y = -.18; specimen.add(base);
  for (let crystal = 0; crystal < 7; crystal++) {
    const height = .42 + (crystal * 17 % 5) * .13;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(.11 + crystal % 2 * .025, .13 + crystal % 3 * .018, height, 6), materials[(index + crystal) % materials.length]);
    shaft.name = "museum-faceted-crystal-prism"; shaft.position.set((crystal % 3 - 1) * .24, height * .5, (Math.floor(crystal / 3) - .8) * .22); shaft.rotation.set((crystal % 2 - .5) * .16, crystal * .7, (crystal % 3 - 1) * .1); specimen.add(shaft);
    const termination = new THREE.Mesh(new THREE.ConeGeometry(.115 + crystal % 2 * .025, .19, 6), materials[(index + crystal) % materials.length]);
    termination.name = "museum-natural-crystal-termination"; termination.position.copy(shaft.position).add(new THREE.Vector3(0, height * .55, 0)); termination.rotation.copy(shaft.rotation); specimen.add(termination);
  }
  return specimen;
}

function detailedInvertebrateFossil(material: THREE.Material) {
  const specimen = new THREE.Group(); specimen.name = "museum-detailed-coiled-invertebrate-fossil";
  const points: THREE.Vector3[] = [];
  for (let segment = 0; segment < 72; segment++) {
    const t = segment / 71, angle = t * Math.PI * 5.4, radius = .07 + t * .52;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, Math.sin(t * Math.PI) * .055));
  }
  const shell = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 110, .065, 10, false), material); shell.name = "museum-ammonite-continuous-ribbed-shell"; specimen.add(shell);
  for (let rib = 9; rib < points.length; rib += 5) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.075, .012, 7, 14), material); ring.name = "museum-ammonite-growth-rib"; ring.position.copy(points[rib]); ring.rotation.y = Math.PI / 2; specimen.add(ring);
  }
  return specimen;
}

function detailedCollectionSpecimen(index: number, fossil: THREE.Material, minerals: THREE.Material[], dark: THREE.Material) {
  const specimen = new THREE.Group();
  const kind = index % 8;
  specimen.name = `amnh-unique-accessioned-specimen-${String(index + 1).padStart(3, "0")}`;
  specimen.userData.accession = `AMNH-LOCAL-${String(index + 1).padStart(4, "0")}`;
  if (kind === 0) {
    specimen.add(detailedMineralSpecimen(index, minerals));
  } else if (kind === 1) {
    specimen.add(detailedInvertebrateFossil(fossil));
  } else if (kind === 2) {
    const slab = new THREE.Mesh(new RoundedBoxGeometry(1.55, .18, 1.1, 5, .07), minerals[(index + 1) % minerals.length]);
    slab.name = "ordovician-trilobite-matrix-slab"; slab.rotation.x = -.18; specimen.add(slab);
    for (let segment = 0; segment < 10; segment++) {
      const plate = new THREE.Mesh(new THREE.CapsuleGeometry(.1 + Math.sin(segment / 9 * Math.PI) * .06, .12, 6, 12), fossil);
      plate.name = "trilobite-articulated-thoracic-segment"; plate.position.set(0, .16 + segment * .004, -.42 + segment * .095); plate.rotation.set(Math.PI / 2, 0, Math.sin(segment * .6) * .05); specimen.add(plate);
    }
    const cephalon = new THREE.Mesh(new THREE.SphereGeometry(.27, 18, 12), fossil); cephalon.name = "trilobite-sculpted-cephalon"; cephalon.scale.set(1, .35, .78); cephalon.position.set(0, .18, -.55); specimen.add(cephalon);
  } else if (kind === 3) {
    const jaw = new THREE.Mesh(new THREE.TorusGeometry(.64, .09, 10, 38, Math.PI * 1.28), fossil);
    jaw.name = "oreodont-curved-mandible-cast"; jaw.rotation.set(Math.PI / 2, 0, -.44); specimen.add(jaw);
    for (let tooth = 0; tooth < 9; tooth++) {
      const angle = .12 + tooth / 8 * Math.PI * 1.05;
      const molar = new THREE.Mesh(new RoundedBoxGeometry(.085, .18, .1, 4, .02), fossil);
      molar.name = "oreodont-individual-cheek-tooth"; molar.position.set(Math.cos(angle) * .59, .15, Math.sin(angle) * .45); molar.rotation.y = -angle; specimen.add(molar);
    }
  } else if (kind === 4) {
    const slice = new THREE.Mesh(new THREE.CylinderGeometry(.62, .66, .18, 16), minerals[(index + 2) % minerals.length]);
    slice.name = "etched-iron-meteorite-cross-section"; slice.rotation.x = Math.PI / 2; specimen.add(slice);
    for (let band = -2; band <= 2; band++) {
      const lamella = new THREE.Mesh(new RoundedBoxGeometry(1.02, .025, .025, 2, .008), dark);
      lamella.name = "meteorite-widmanstatten-lamella"; lamella.position.set(0, band * .16, .105); lamella.rotation.z = band % 2 ? .55 : -.48; specimen.add(lamella);
    }
  } else if (kind === 5) {
    for (let egg = 0; egg < 5; egg++) {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(.2 + egg % 2 * .025, 20, 14), fossil);
      shell.name = "elephant-bird-egg-clutch-fragment"; shell.scale.set(.78, 1.28, .82); shell.position.set((egg % 3 - 1) * .38, .22 + Math.floor(egg / 3) * .12, (Math.floor(egg / 3) - .35) * .42); shell.rotation.z = (egg - 2) * .08; specimen.add(shell);
    }
  } else if (kind === 6) {
    for (let tooth = 0; tooth < 4; tooth++) {
      const fang = new THREE.Mesh(new THREE.ConeGeometry(.14 + tooth * .012, .68 + tooth * .08, 18), fossil);
      fang.name = "theropod-serrated-tooth-crown"; fang.position.set(-.55 + tooth * .36, .35, (tooth % 2 - .5) * .22); fang.rotation.z = -.12 + tooth * .07; specimen.add(fang);
      for (let serration = 0; serration < 5; serration++) {
        const denticle = new THREE.Mesh(new THREE.ConeGeometry(.018, .055, 7), fossil);
        denticle.name = "theropod-tooth-edge-denticle"; denticle.position.set(fang.position.x + .13, .12 + serration * .09, fang.position.z); denticle.rotation.z = Math.PI / 2; specimen.add(denticle);
      }
    }
  } else {
    const shale = new THREE.Mesh(new RoundedBoxGeometry(1.5, .16, 1.12, 5, .055), minerals[index % minerals.length]);
    shale.name = "green-river-formation-leaf-shale"; shale.rotation.x = -.12; specimen.add(shale);
    const midribStart = new THREE.Vector3(0, .14, -.42), midribEnd = new THREE.Vector3(0, .16, .42);
    const midrib = cylinderBetween(midribStart, midribEnd, .022, fossil, 8); midrib.name = "fossil-leaf-central-midrib"; specimen.add(midrib);
    for (let vein = -4; vein <= 4; vein++) {
      if (vein === 0) continue;
      const y = vein * .085;
      for (const side of [-1, 1]) {
        const lateral = cylinderBetween(new THREE.Vector3(0, .155, y), new THREE.Vector3(side * (.42 - Math.abs(vein) * .035), .16, y + Math.sign(vein) * .08), .012, fossil, 7);
        lateral.name = "fossil-leaf-secondary-vein"; specimen.add(lateral);
      }
    }
  }
  return specimen;
}

function addGalleryFixtures(root: THREE.Group, textures: GameTextures, ownedTextures: THREE.Texture[], quality: number) {
  const fixtures = new THREE.Group(); fixtures.name = "amnh-authored-gallery-fixtures-and-display-cases";
  const brass = new THREE.MeshStandardMaterial({ color: "#a88b4d", roughness: .38, metalness: .68 });
  const darkStone = new THREE.MeshStandardMaterial({ color: "#34342f", map: textures.stone, bumpMap: textures.stone, bumpScale: .025, roughness: .82 });
  const walnut = new THREE.MeshStandardMaterial({ color: "#5a3928", map: textures.bark, bumpMap: textures.bark, bumpScale: .035, roughness: .82 });
  const museumGlass = new THREE.MeshPhysicalMaterial({ color: "#bfd3d2", roughness: .09, transmission: .62, transparent: true, opacity: .16, depthWrite: false, clearcoat: .35 });
  museumGlass.forceSinglePass = true;
  const label = new THREE.MeshStandardMaterial({ color: "#e9e0ca", roughness: .72 });
  const fossil = new THREE.MeshStandardMaterial({ color: "#c9b890", map: textures.stone, bumpMap: textures.stone, bumpScale: .018, roughness: .84 });
  const mineralPalette = ["#7d6250", "#526f75", "#8a7656", "#6e5d79"].map(color => new THREE.MeshStandardMaterial({ color, roughness: .48, metalness: .12 }));

  // Brass route inlays and cross-hall thresholds keep the sprawling floor
  // legible without relying on floating HUD arrows.
  for (const x of [-14.8, 14.8]) {
    const inlay = new THREE.Mesh(new RoundedBoxGeometry(.09, .018, 224, 2, .008), brass);
    inlay.name = "fossil-halls-brass-floor-inlay"; inlay.position.set(x, .018, -104); fixtures.add(inlay);
  }
  for (const z of [-31, -92, -153, -190]) {
    const threshold = new THREE.Mesh(new RoundedBoxGeometry(35, .02, .1, 2, .008), brass);
    threshold.name = "museum-cross-hall-brass-threshold"; threshold.position.set(0, .02, z); fixtures.add(threshold);
  }

  const collectionTitles = [
    ["ORIGINS OF OCEAN LIFE", "MARINE INVERTEBRATES · 485–360 MILLION YEARS AGO"],
    ["MINERALS OF NEW YORK", "GARNET · TOURMALINE · HERKIMER QUARTZ"],
    ["DEEP TIME", "FOSSILS RECORD CHANGING CONTINENTS AND CLIMATES"],
    ["PLANETARY MATERIALS", "METEORITES · IMPACT GLASS · DIFFERENTIATED WORLDS"],
    ["NORTH AMERICAN MAMMALS", "ADAPTATION ACROSS ICE, GRASSLAND AND FOREST"],
    ["BIODIVERSITY IN DETAIL", "FORM, FUNCTION AND EVOLUTIONARY RELATIONSHIPS"],
    ["TRILOBITES OF NEW YORK", "ARTICULATED EXOSKELETONS · ORDOVICIAN SEAS"],
    ["JAWS AND TEETH", "DIET RECORDED IN ENAMEL, CUSPS AND WEAR"],
    ["IRON FROM SPACE", "CRYSTALLINE PATTERNS REVEALED BY ETCHING"],
    ["GIANT BIRD EGGS", "SHELL STRUCTURE · ISLAND EVOLUTION · EXTINCTION"],
    ["THEROPOD DENTITION", "SERRATIONS · REPLACEMENT · FEEDING ECOLOGY"],
    ["FOSSIL FORESTS", "LEAF VENATION · CLIMATE · ANCIENT LAKES"],
    ["AMMONITES", "COILED SHELL GROWTH THROUGH DEEP TIME"],
    ["CRYSTAL SYSTEMS", "ATOMIC ORDER EXPRESSED AS NATURAL GEOMETRY"],
    ["MAMMAL EVOLUTION", "SKULLS, LIMBS AND CHANGING LANDSCAPES"],
    ["COLLECTIONS AT WORK", "ACCESSION · CONSERVATION · COMPARATIVE STUDY"],
  ] as const;
  const collectionTextures = collectionTitles.map(([title, subtitle], index) => collectionGraphicTexture(title, subtitle, index));
  ownedTextures.push(...collectionTextures);
  for (let panelIndex = 0; panelIndex < 16; panelIndex++) {
    const side = panelIndex % 2 ? 1 : -1, row = Math.floor(panelIndex / 2);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 4.6), new THREE.MeshBasicMaterial({ map: collectionTextures[panelIndex % collectionTextures.length], toneMapped: false }));
    panel.name = `amnh-textured-permanent-hall-wall-graphic-${panelIndex + 1}`; panel.position.set(side * 43.42, 5.25, -22 - row * 26.5); panel.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; fixtures.add(panel);
    for (const y of [-2.42, 2.42]) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(.12, .16, 8.05, 3, .035), brass); rail.name = "amnh-bronze-wall-graphic-frame"; rail.position.copy(panel.position).add(new THREE.Vector3(-side * .07, y, 0)); fixtures.add(rail);
    }
    for (const z of [-3.95, 3.95]) {
      const rail = new THREE.Mesh(new RoundedBoxGeometry(.12, 5.02, .16, 3, .035), brass); rail.name = "amnh-bronze-wall-graphic-frame"; rail.position.copy(panel.position).add(new THREE.Vector3(-side * .07, 0, z)); fixtures.add(rail);
    }
  }

  const caseCount = quality < .58 ? 14 : quality < .82 ? 20 : 28;
  for (let index = 0; index < caseCount; index++) {
    const side = index % 2 ? 1 : -1, row = Math.floor(index / 2), z = -18 - row * (quality > .82 ? 14.2 : 19.2);
    const display = new THREE.Group(); display.name = `amnh-permanent-collection-vitrine-${index + 1}`;
    display.position.set(side * 31.5, 0, z);
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(4.2, .78, 3.05, 5, .09), darkStone); plinth.position.y = .39; display.add(plinth);
    const hood = new THREE.Mesh(new RoundedBoxGeometry(3.82, 2.35, 2.68, 5, .055), museumGlass); hood.position.y = 1.76; display.add(hood);
    const artifact = detailedCollectionSpecimen(index, fossil, mineralPalette, brass);
    artifact.position.set(0, 1.42, 0); artifact.rotation.y = index * .37; display.add(artifact);
    const caption = new THREE.Mesh(new RoundedBoxGeometry(2.45, .34, .06, 3, .02), label); caption.name = "museum-case-interpretation-label"; caption.position.set(0, .68, 1.56); caption.rotation.x = -.22; display.add(caption);
    fixtures.add(display);
  }

  // Stop the furniture program before the hero fossil hall. The previous
  // z=-189.5 row intersected the Megatherium plinth and brass visitor rail.
  for (let row = 0; row < 5; row++) for (const side of [-1, 1]) {
    const bench = new THREE.Group(); bench.name = "amnh-walnut-gallery-bench"; bench.position.set(side * 9.4, 0, -42 - row * 29.5);
    const seat = new THREE.Mesh(new RoundedBoxGeometry(3.7, .24, .86, 5, .07), walnut); seat.position.y = .82; bench.add(seat);
    const back = new THREE.Mesh(new RoundedBoxGeometry(3.7, .78, .18, 4, .045), walnut); back.position.set(0, 1.18, .34); back.rotation.x = -.1; bench.add(back);
    for (const x of [-1.42, 1.42]) { const leg = new THREE.Mesh(new RoundedBoxGeometry(.18, .76, .58, 3, .035), brass); leg.position.set(x, .42, 0); bench.add(leg); }
    fixtures.add(bench);
  }

  // Recessed ceiling coffers and bronze frames break up the single flat lid
  // that made the rotunda and long halls read as an unfinished box.
  const cofferMaterials = [
    new THREE.MeshStandardMaterial({ color: "#d2c7b2", roughness: .94 }),
    new THREE.MeshStandardMaterial({ color: "#e0d6c1", roughness: .94 }),
  ];
  for (let z = 4; z >= -212; z -= 18) for (const x of [-27, -9, 9, 27]) {
    const coffer = new THREE.Mesh(new RoundedBoxGeometry(12.5, .08, 11.5, 3, .04), cofferMaterials[Math.abs(x / 9 + Math.round(z / 18)) % 2]);
    coffer.name = "amnh-recessed-ceiling-coffer"; coffer.position.set(x, 11.12, z); fixtures.add(coffer);
    const pin = new THREE.Mesh(new THREE.CylinderGeometry(.075, .075, .9, 8), brass); pin.position.set(x, 10.65, z); fixtures.add(pin);
  }
  for (const z of [-24, -55, -86, -117, -148, -179, -210]) for (const x of [-20, 20]) {
    const station = new THREE.Group(); station.name = "amnh-interactive-collection-study-station"; station.position.set(x, 0, z);
    const cabinet = new THREE.Mesh(new RoundedBoxGeometry(3.4, 1.05, 1.55, 5, .08), walnut); cabinet.position.y = .53; station.add(cabinet);
    for (let drawer = 0; drawer < 4; drawer++) {
      const face = new THREE.Mesh(new RoundedBoxGeometry(.64, .24, .035, 3, .018), label); face.position.set(-1.05 + drawer * .7, .62, .795); station.add(face);
      const pull = new THREE.Mesh(new THREE.TorusGeometry(.055, .012, 7, 14, Math.PI), brass); pull.position.set(face.position.x, .61, .825); pull.rotation.x = Math.PI / 2; station.add(pull);
    }
    const taskLight = new THREE.Mesh(new THREE.CylinderGeometry(.18, .28, .14, 14), new THREE.MeshStandardMaterial({ color: "#eee0b6", emissive: "#ffd994", emissiveIntensity: 1.2, roughness: .3 })); taskLight.position.set(0, 2.2, 0); station.add(taskLight);
    fixtures.add(station);
  }
  root.add(fixtures);
}

function addRotundaDinosaurs(root: THREE.Group, bone: THREE.Material, circles: CircleObstacle[]) {
  const exhibit = new THREE.Group(); exhibit.name = "theodore-roosevelt-rotunda-barosaurus-allosaurus-display";
  const baseMaterial = new THREE.MeshStandardMaterial({ color: "#3e3b36", roughness: .76, metalness: .08 });
  const mountMetal = new THREE.MeshStandardMaterial({ color: "#171a18", roughness: .32, metalness: .82 });
  const base = new THREE.Mesh(new RoundedBoxGeometry(27, .62, 14, 7, .18), baseMaterial); base.position.set(0, .31, -5); exhibit.add(base);

  // Project-original anatomical reconstruction: distinct centra, neural and
  // transverse processes, curved ribs, paired limb bones, girdles and feet.
  // The old display was a row of spheres connected by cylinders and dominated
  // the player's first museum view as obvious blockout geometry.
  const hip = new THREE.Vector3(2.2, 5.55, -3.45), shoulder = new THREE.Vector3(-3.75, 6.85, -6.05);
  const bodyCurve = new THREE.CatmullRomCurve3([
    hip,
    new THREE.Vector3(.5, 6.15, -4.15),
    new THREE.Vector3(-1.8, 6.65, -5.15),
    shoulder,
  ], false, "centripetal");
  for (let index = 0; index < 10; index++) {
    const amount = index / 9, point = bodyCurve.getPoint(amount);
    exhibit.add(fossilVertebra(point, .25 - amount * .02, bone, -.24));
    if (index > 0 && index < 9) {
      const ribWidth = 1.95 - Math.abs(index - 4.5) * .14;
      exhibit.add(fossilRib(point.clone().add(new THREE.Vector3(0, -.03, .04)), -1, 2.45, ribWidth, bone));
      exhibit.add(fossilRib(point.clone().add(new THREE.Vector3(0, -.03, .04)), 1, 2.45, ribWidth, bone));
    }
  }

  const neckCurve = new THREE.CatmullRomCurve3([
    shoulder,
    new THREE.Vector3(-6.7, 7.45, -7.1),
    new THREE.Vector3(-10.5, 8.85, -7.65),
    new THREE.Vector3(-13.9, 9.35, -7.25),
  ], false, "centripetal");
  for (let index = 1; index < 17; index++) {
    const amount = index / 16, point = neckCurve.getPoint(amount), tangent = neckCurve.getTangent(amount);
    exhibit.add(fossilVertebra(point, .215 - amount * .08, bone, Math.atan2(tangent.x, tangent.z)));
  }
  const headPoint = neckCurve.getPoint(1);
  const skull = new THREE.Group(); skull.name = "barosaurus-sculpted-skull-and-jaw"; skull.position.copy(headPoint); skull.rotation.set(-.06, -.16, -.14);
  const cranium = new THREE.Mesh(new RoundedBoxGeometry(.72, .58, .9, 7, .18), bone); cranium.position.set(-.2, .02, -.18); skull.add(cranium);
  const snout = new THREE.Mesh(new RoundedBoxGeometry(.58, .34, 1.05, 7, .13), bone); snout.position.set(-.36, -.08, -.78); skull.add(snout);
  const jaw = new THREE.Mesh(new RoundedBoxGeometry(.54, .16, 1.08, 6, .07), bone); jaw.position.set(-.35, -.34, -.72); jaw.rotation.x = -.08; skull.add(jaw);
  for (const side of [-1, 1]) {
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(.13, .038, 8, 20), bone); orbit.position.set(side * .37 - .2, .1, -.25); orbit.rotation.y = Math.PI / 2; skull.add(orbit);
  }
  exhibit.add(skull);

  const tailCurve = new THREE.CatmullRomCurve3([
    hip,
    new THREE.Vector3(5.2, 5.2, -2.25),
    new THREE.Vector3(9.2, 4.3, -1.2),
    new THREE.Vector3(13.7, 3.2, -.55),
  ], false, "centripetal");
  for (let index = 1; index < 19; index++) {
    const amount = index / 18, point = tailCurve.getPoint(amount), tangent = tailCurve.getTangent(amount);
    exhibit.add(fossilVertebra(point, .235 - amount * .16, bone, Math.atan2(tangent.x, tangent.z)));
  }

  const pelvis = new THREE.Group(); pelvis.name = "barosaurus-pelvic-girdle"; pelvis.position.copy(hip);
  for (const side of [-1, 1]) {
    const ilium = new THREE.Mesh(new THREE.CapsuleGeometry(.31, 1.85, 8, 20), bone); ilium.position.set(side * .88, .05, .05); ilium.rotation.set(.1, 0, side * .92); pelvis.add(ilium);
    const socket = new THREE.Mesh(new THREE.TorusGeometry(.34, .11, 10, 24), bone); socket.position.set(side * 1.1, -.18, .2); socket.rotation.y = Math.PI / 2; pelvis.add(socket);
  }
  exhibit.add(pelvis);

  const scapula = new THREE.Group(); scapula.name = "barosaurus-pectoral-girdle";
  for (const side of [-1, 1]) {
    const blade = fossilBoneBetween(
      shoulder.clone().add(new THREE.Vector3(side * .3, .65, .15)),
      shoulder.clone().add(new THREE.Vector3(side * 1.05, -.7, .5)),
      .18,
      bone,
      18,
    );
    scapula.add(blade);
  }
  exhibit.add(scapula);

  for (const side of [-1, 1] as const) {
    const rearHip = hip.clone().add(new THREE.Vector3(side * 1.08, -.22, .15));
    const rearKnee = new THREE.Vector3(side * 2.25 + .55, 3.1, -2.05), rearAnkle = new THREE.Vector3(side * 2.55 + .55, .83, -1.3);
    exhibit.add(fossilBoneBetween(rearHip, rearKnee, .25, bone, 22), fossilBoneBetween(rearKnee, rearAnkle, .2, bone, 20));
    const frontShoulder = shoulder.clone().add(new THREE.Vector3(side * .82, -.55, .05));
    const frontElbow = new THREE.Vector3(side * 2.9 - 2.2, 3.35, -7.15), frontWrist = new THREE.Vector3(side * 3.05 - 2.2, .78, -7.55);
    exhibit.add(fossilBoneBetween(frontShoulder, frontElbow, .2, bone, 20), fossilBoneBetween(frontElbow, frontWrist, .16, bone, 18));
    for (const [foot, forward] of [[rearAnkle, 1], [frontWrist, -1]] as const) for (let toe = -1; toe <= 2; toe++) {
      exhibit.add(fossilBoneBetween(
        foot.clone().add(new THREE.Vector3(toe * .11, -.08, 0)),
        foot.clone().add(new THREE.Vector3(toe * .16, -.43, forward * (.55 + Math.abs(toe) * .06))),
        .055,
        bone,
        10,
      ));
    }
  }

  // Museum mounting hardware is intentionally thinner/darker than the fossil
  // so support structure reads as engineered steel rather than extra bones.
  for (const [x, y, z] of [[2.2, 5.1, -3.45], [-3.6, 6.2, -6.0], [-10.2, 8.25, -7.55]] as const) {
    const post = cylinderBetween(new THREE.Vector3(x, .62, z), new THREE.Vector3(x, y, z), .045, mountMetal, 10);
    post.name = "rotunda-fossil-mount-blackened-steel"; exhibit.add(post);
  }
  mergeMuseumFossils(exhibit, bone, "barosaurus-original-merged-anatomical-fossil-mesh");
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

function addMilsteinOceanLifeDetails(root: THREE.Group, quality: number, circles: CircleObstacle[]) {
  const hall = new THREE.Group(); hall.name = "milstein-ocean-life-coral-reef-and-deep-ocean-exhibits";
  const deepBlue = new THREE.MeshStandardMaterial({ color: "#153746", roughness: .76 });
  const reefPalette = ["#ba7057", "#d99a61", "#a95e78", "#7c9b83", "#d1b86c"].map(color => new THREE.MeshStandardMaterial({ color, roughness: .86 }));
  const glass = new THREE.MeshPhysicalMaterial({ color: "#9cc4ce", transparent: true, opacity: .16, transmission: .55, roughness: .08, depthWrite: false });
  glass.forceSinglePass = true;
  const reef = new THREE.Group(); reef.name = "andros-coral-reef-diorama"; reef.position.set(-31, 0, -92);
  const reefBackdrop = new THREE.Mesh(new RoundedBoxGeometry(18, 7.6, .35, 6, .12), deepBlue); reefBackdrop.position.set(0, 3.8, 3.6); reef.add(reefBackdrop);
  const reefFloor = new THREE.Mesh(new RoundedBoxGeometry(17.4, .46, 7.6, 7, .16), new THREE.MeshStandardMaterial({ color: "#b39c76", roughness: .96 })); reefFloor.position.y = .23; reef.add(reefFloor);
  const coralCount = quality < .65 ? 18 : 30;
  for (let index = 0; index < coralCount; index++) {
    const x = -7.4 + index * 2.91 % 14.8, z = -2.6 + index * 1.73 % 5.4, height = .55 + index % 5 * .22;
    const coral = new THREE.Group(); coral.name = "andros-reef-original-branching-coral"; coral.position.set(x, .42, z);
    const material = reefPalette[index % reefPalette.length];
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.11, .2, height, 9), material); trunk.position.y = height * .5; coral.add(trunk);
    for (const side of [-1, 1]) {
      const branch = cylinderBetween(new THREE.Vector3(0, height * .55, 0), new THREE.Vector3(side * (.3 + index % 3 * .08), height * (.82 + index % 2 * .12), .08), .065, material, 8);
      coral.add(branch);
    }
    reef.add(coral);
  }
  const reefGlass = new THREE.Mesh(new RoundedBoxGeometry(17.9, 7.4, .14, 6, .06), glass); reefGlass.name = "andros-reef-diorama-glazing"; reefGlass.position.set(0, 3.65, -3.72); reef.add(reefGlass);
  hall.add(reef); circles.push({ x: -31, z: -92, radius: 8.6 });

  const encounter = new THREE.Group(); encounter.name = "sperm-whale-and-giant-squid-deep-ocean-display"; encounter.position.set(-27, 3.7, -112);
  const whale = new THREE.Mesh(new THREE.CapsuleGeometry(.74, 3.6, 10, quality > .7 ? 24 : 16), new THREE.MeshStandardMaterial({ color: "#445a63", roughness: .82 }));
  whale.name = "deep-ocean-sperm-whale-model"; whale.rotation.x = Math.PI / 2; whale.rotation.z = -.08; encounter.add(whale);
  const squidMaterial = new THREE.MeshPhysicalMaterial({ color: "#8d403b", roughness: .8, sheen: .25, sheenColor: new THREE.Color("#c3715d") });
  const mantle = new THREE.Mesh(new THREE.CapsuleGeometry(.48, 1.3, 9, 20), squidMaterial); mantle.name = "giant-squid-sculpted-mantle"; mantle.position.set(1.8, -.45, .6); mantle.rotation.x = Math.PI / 2; encounter.add(mantle);
  for (let tentacle = 0; tentacle < 8; tentacle++) {
    const angle = tentacle / 8 * Math.PI * 2;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(1.8 + Math.cos(angle) * .2, -.45 + Math.sin(angle) * .15, -.15),
      new THREE.Vector3(1.3 + Math.cos(angle) * .5, -.7 + Math.sin(angle) * .28, -1.2),
      new THREE.Vector3(.65 + Math.cos(angle) * .75, -.35 + Math.sin(angle) * .4, -2.4 - tentacle % 2 * .55),
    ], false, "centripetal");
    const arm = new THREE.Mesh(new THREE.TubeGeometry(curve, 22, .055, 8, false), squidMaterial); arm.name = "giant-squid-curled-tentacle"; encounter.add(arm);
  }
  hall.add(encounter); root.add(hall);
}

function elephantCraniumGeometry() {
  const geometry = new THREE.SphereGeometry(1, 40, 30);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let index = 0; index < positions.count; index++) {
    const x = positions.getX(index), y = positions.getY(index), z = positions.getZ(index);
    const forehead = THREE.MathUtils.smoothstep(y, -.15, .78);
    const cheek = THREE.MathUtils.smoothstep(-y, -.52, .2);
    positions.setXYZ(index, x * (1.02 - cheek * .12), y * 1.12 + forehead * .06, z * (1.2 - cheek * .08));
  }
  positions.needsUpdate = true; geometry.computeVertexNormals();
  return geometry;
}

function elephantEarGeometry() {
  const earShape = new THREE.Shape();
  earShape.moveTo(0, 1.15);
  earShape.bezierCurveTo(.78, 1.28, 1.52, .68, 1.58, -.18);
  earShape.bezierCurveTo(1.58, -.92, .88, -1.56, .18, -1.18);
  earShape.bezierCurveTo(-.12, -.62, -.18, .52, 0, 1.15);
  return new THREE.ShapeGeometry(earShape, 28);
}

function addAfricanMammals(root: THREE.Group, textures: GameTextures, ownedTextures: THREE.Texture[], bone: THREE.Material, circles: CircleObstacle[]) {
  const group = new THREE.Group(); group.name = "akeley-hall-african-elephant-group"; group.position.set(27, 0, -70);
  const skinTexture = canvasTexture(1024, 1024, context => {
    context.fillStyle = "#77746c"; context.fillRect(0, 0, 1024, 1024);
    for (let line = 0; line < 620; line++) {
      const x = (line * 193 + line * line * 7) % 1024, y = (line * 431 + line * line * 3) % 1024;
      const length = 8 + line % 31, angle = (line * 1.79) % (Math.PI * 2);
      context.strokeStyle = line % 4 ? "rgba(38,36,33,.15)" : "rgba(225,218,198,.11)";
      context.lineWidth = .7 + line % 3 * .45; context.beginPath(); context.moveTo(x, y);
      context.quadraticCurveTo(x + Math.cos(angle + .7) * length * .55, y + Math.sin(angle + .7) * length * .55, x + Math.cos(angle) * length, y + Math.sin(angle) * length); context.stroke();
    }
    for (let fold = 0; fold < 32; fold++) {
      const y = 30 + fold * 31; context.strokeStyle = "rgba(34,31,28,.12)"; context.lineWidth = 1.4;
      context.beginPath(); context.moveTo(-20, y); context.bezierCurveTo(280, y - 14, 680, y + 18, 1044, y - 3); context.stroke();
    }
  });
  skinTexture.wrapS = skinTexture.wrapT = THREE.RepeatWrapping; skinTexture.repeat.set(2.6, 2.2); ownedTextures.push(skinTexture);
  const skin = new THREE.MeshStandardMaterial({ color: "#d0cdc3", map: skinTexture, bumpMap: skinTexture, bumpScale: .045, roughness: .98, emissive: "#25231f", emissiveIntensity: .12, side: THREE.DoubleSide });
  const darkSkin = new THREE.MeshStandardMaterial({ color: "#514f49", roughness: .95 });
  const ground = new THREE.Mesh(new RoundedBoxGeometry(14.5, .38, 11.5, 7, .14), new THREE.MeshStandardMaterial({ color: "#866c4d", roughness: 1 }));
  ground.name = "akeley-elephant-group-continuous-habitat-ground"; ground.position.y = .19; group.add(ground);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.72, 2.2, 12, 34), skin); body.name = "african-elephant-continuous-ribcage-and-abdomen"; body.position.y = 3.25; body.rotation.x = Math.PI / 2; body.scale.set(1.04, 1, 1.08); group.add(body);
  const head = new THREE.Mesh(elephantCraniumGeometry(), skin); head.name = "african-elephant-single-sculpted-cranium-cheek-and-trunk-root"; head.scale.set(1.08, 1.03, 1.12); head.position.set(0, 3.42, -3.18); group.add(head);
  const jaw = new THREE.Mesh(new THREE.CapsuleGeometry(.46, .62, 10, 26), skin); jaw.name = "african-elephant-integrated-lower-jaw-and-mouth-mass"; jaw.position.set(0, 2.82, -3.92); jaw.rotation.x = Math.PI / 2; jaw.scale.set(1.16, 1, .82); group.add(jaw);
  const trunkCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 3.25, -3.75), new THREE.Vector3(.08, 2.55, -4.18),
    new THREE.Vector3(-.08, 1.52, -4.25), new THREE.Vector3(.12, .62, -3.92),
  ], false, "centripetal");
  const trunk = new THREE.Mesh(new THREE.TubeGeometry(trunkCurve, 38, .31, 18, false), skin); trunk.name = "african-elephant-continuously-curved-muscular-trunk"; group.add(trunk);
  const trunkTip = new THREE.Mesh(new THREE.SphereGeometry(.32, 22, 16), skin); trunkTip.name = "african-elephant-trunk-tip-with-finger"; trunkTip.scale.set(1, .72, .88); trunkTip.position.set(.12, .62, -3.92); group.add(trunkTip);
  for (let wrinkle = 0; wrinkle < 7; wrinkle++) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.29 - wrinkle * .009, .012, 7, 24), darkSkin);
    ring.name = "african-elephant-trunk-anatomical-wrinkle-ring"; ring.position.set(Math.sin(wrinkle * .8) * .055, 2.7 - wrinkle * .28, -4.13 - Math.sin(wrinkle * .45) * .1); ring.rotation.x = Math.PI / 2; ring.scale.y = .82; group.add(ring);
  }
  for (const side of [-1, 1]) {
    for (const z of [-1.25, 1.3]) {
      const upper = cylinderBetween(new THREE.Vector3(side * 1.03, 2.85, z), new THREE.Vector3(side * 1.1, 1.45, z + .06), .47, skin, 24);
      upper.name = "african-elephant-weight-bearing-upper-leg"; group.add(upper);
      const lower = cylinderBetween(new THREE.Vector3(side * 1.1, 1.5, z + .06), new THREE.Vector3(side * 1.08, .48, z + .12), .39, skin, 24);
      lower.name = "african-elephant-columnar-lower-leg"; group.add(lower);
      const foot = new THREE.Mesh(new THREE.SphereGeometry(.48, 24, 16), skin); foot.name = "african-elephant-cushioned-foot"; foot.scale.set(1.08, .5, 1.2); foot.position.set(side * 1.08, .42, z - .02); group.add(foot);
      for (let nail = -1; nail <= 1; nail++) { const toe = new THREE.Mesh(new THREE.SphereGeometry(.095, 14, 10), bone); toe.name = "african-elephant-individual-toenail"; toe.scale.set(1, .42, .62); toe.position.set(side * 1.08 + nail * .18, .37, z - .48); group.add(toe); }
    }
    const tuskCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * .54, 2.96, -3.8), new THREE.Vector3(side * .64, 2.5, -4.35),
      new THREE.Vector3(side * .76, 2.05, -4.72), new THREE.Vector3(side * .7, 1.72, -4.78),
    ], false, "centripetal");
    const tusk = new THREE.Mesh(new THREE.TubeGeometry(tuskCurve, 28, .13, 14, false), bone); tusk.name = "african-elephant-curved-ivory-tusk"; group.add(tusk);
    const ear = new THREE.Mesh(elephantEarGeometry(), skin); ear.name = "african-elephant-anatomical-fan-ear"; ear.scale.set(side * .82, .98, 1); ear.position.set(side * .9, 3.7, -2.82); ear.rotation.y = side * .14; group.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 12), darkSkin); eye.name = "african-elephant-head-attached-eye"; eye.position.set(side * .73, 3.75, -3.87); group.add(eye);
    const eyelid = new THREE.Mesh(new THREE.TorusGeometry(.098, .018, 7, 22, Math.PI), skin); eyelid.name = "african-elephant-sculpted-upper-eyelid"; eyelid.position.set(side * .73, 3.79, -3.92); eyelid.rotation.set(Math.PI / 2, 0, side > 0 ? 0 : Math.PI); group.add(eyelid);
  }
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(.38, .025, 7, 30, Math.PI), darkSkin); mouth.name = "african-elephant-defined-mouth-line"; mouth.position.set(0, 2.66, -4.22); mouth.rotation.set(Math.PI / 2, 0, Math.PI); group.add(mouth);
  const tailCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 3.3, 2.95), new THREE.Vector3(.12, 2.25, 3.65), new THREE.Vector3(-.05, 1.2, 3.76)], false, "centripetal");
  const tail = new THREE.Mesh(new THREE.TubeGeometry(tailCurve, 22, .075, 10, false), skin); tail.name = "african-elephant-tapered-tail"; group.add(tail);
  const tailBrush = new THREE.Mesh(new THREE.SphereGeometry(.18, 16, 10), darkSkin); tailBrush.scale.set(.72, 1.5, .72); tailBrush.position.set(-.05, 1.08, 3.76); group.add(tailBrush);
  root.add(group); circles.push({ x: 27, z: -70, radius: 6.3 });
}

function addAkeleyHabitatDioramas(root: THREE.Group, quality: number, circles: CircleObstacle[]) {
  const hall = new THREE.Group(); hall.name = "akeley-african-mammals-water-hole-habitat-dioramas";
  const earth = new THREE.MeshStandardMaterial({ color: "#8e6f4d", roughness: .98 });
  const hide = new THREE.MeshStandardMaterial({ color: "#b59663", roughness: .96 });
  const dark = new THREE.MeshStandardMaterial({ color: "#392f28", roughness: .93 });
  const savanna = new THREE.Group(); savanna.name = "akeley-water-hole-panoramic-diorama"; savanna.position.set(28, 0, -98);
  const floor = new THREE.Mesh(new RoundedBoxGeometry(17, .4, 10, 7, .14), earth); floor.position.y = .2; savanna.add(floor);
  const water = new THREE.Mesh(new RoundedBoxGeometry(7.2, .05, 3.1, 10, .14), new THREE.MeshPhysicalMaterial({ color: "#547f86", roughness: .18, clearcoat: .52 })); water.position.set(-1.8, .43, .5); savanna.add(water);
  for (let tree = 0; tree < (quality < .7 ? 3 : 5); tree++) {
    const x = -6.5 + tree * 3.2, z = tree % 2 ? 3.2 : -3;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.12, .22, 2.7, 9), dark); trunk.position.set(x, 1.55, z); savanna.add(trunk);
    const crown = new THREE.Mesh(new THREE.SphereGeometry(1.1 + tree % 2 * .3, 18, 10), new THREE.MeshStandardMaterial({ color: "#647348", roughness: 1 })); crown.name = "akeley-sculpted-savanna-acacia-crown"; crown.position.set(x, 3.05, z); crown.scale.set(1.8, .42, 1.1); savanna.add(crown);
  }
  for (let animal = 0; animal < 4; animal++) {
    const antelope = new THREE.Group(); antelope.name = "akeley-water-hole-antelope-specimen"; antelope.position.set(-4.2 + animal * 2.7, .35, -1.8 + animal % 2 * 4.1); antelope.rotation.y = animal % 2 ? 2.6 : .3;
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.35, .95, 8, 18), hide); torso.position.y = 1.28; torso.rotation.x = Math.PI / 2; antelope.add(torso);
    const neck = cylinderBetween(new THREE.Vector3(0, 1.35, -.45), new THREE.Vector3(0, 2.05, -.78), .18, hide, 14); antelope.add(neck);
    const head = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .38, 7, 16), hide); head.position.set(0, 2.08, -1.02); head.rotation.x = Math.PI / 2; antelope.add(head);
    for (const side of [-1, 1]) for (const z of [-.34, .35]) antelope.add(cylinderBetween(new THREE.Vector3(side * .24, 1.18, z), new THREE.Vector3(side * .26, .18, z + .06), .075, dark, 10));
    for (const side of [-1, 1]) antelope.add(cylinderBetween(new THREE.Vector3(side * .09, 2.23, -1.14), new THREE.Vector3(side * .18, 2.72, -1.03), .025, dark, 8));
    savanna.add(antelope);
  }
  hall.add(savanna); root.add(hall); circles.push({ x: 28, z: -98, radius: 8.5 });
}

function addEarthAndMeteoriteHalls(root: THREE.Group, circles: CircleObstacle[]) {
  const meteor = new THREE.Mesh(new THREE.IcosahedronGeometry(2.25, 4), new THREE.MeshStandardMaterial({ color: "#373b3b", roughness: .55, metalness: .72 })); meteor.name = "arthur-ross-hall-ahnighito-meteorite"; meteor.position.set(-28, 2.5, -128); meteor.scale.set(1.35, .85, 1.1); root.add(meteor); circles.push({ x: -28, z: -128, radius: 4.4 });
  const planet = new THREE.Group(); planet.name = "gottesman-hall-of-planet-earth-exhibits"; planet.position.set(27, 0, -127);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(2.5, 40, 28), new THREE.MeshStandardMaterial({ color: "#547b87", roughness: .54, metalness: .08 })); globe.position.y = 3.5; planet.add(globe);
  for (let index = 0; index < 9; index++) { const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(.55 + index % 3 * .14, 2), new THREE.MeshStandardMaterial({ color: ["#7f6854", "#665f59", "#8b7867"][index % 3], roughness: .96 })); rock.position.set(Math.cos(index * 2.3) * 4, .65, Math.sin(index * 2.3) * 4); planet.add(rock); }
  root.add(planet); circles.push({ x: 27, z: -127, radius: 5.2 });
}

/**
 * Dense, project-authored interpretations of the Museum's real permanent-hall
 * program. Official AMNH hall pages supplied the exhibit names and groupings;
 * all geometry and graphics below are original to this project. These islands
 * fill the formerly empty central procession without narrowing its clear
 * scooter route, while framed media and portals eliminate unprogrammed walls.
 */
function addOfficialPermanentHallMoments(root: THREE.Group, textures: GameTextures, ownedTextures: THREE.Texture[], quality: number, circles: CircleObstacle[]) {
  const collection = new THREE.Group(); collection.name = "amnh-official-permanent-hall-dense-exhibit-program";
  const bronze = new THREE.MeshStandardMaterial({ color: "#8f7541", metalness: .72, roughness: .34 });
  const blackenedSteel = new THREE.MeshStandardMaterial({ color: "#1c211f", metalness: .76, roughness: .34 });
  const stone = new THREE.MeshStandardMaterial({ color: "#45443e", map: textures.stone, bumpMap: textures.stone, bumpScale: .025, roughness: .82 });
  const bone = new THREE.MeshStandardMaterial({ color: "#d2c29c", map: textures.stone, bumpMap: textures.stone, bumpScale: .012, roughness: .82 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#bad0d1", transparent: true, opacity: .12, transmission: .64, roughness: .07, depthWrite: false, clearcoat: .42 });
  glass.forceSinglePass = true;
  const mediaSurface = new THREE.MeshStandardMaterial({ color: "#163b45", emissive: "#4e9bae", emissiveIntensity: .52, roughness: .38 });
  const officialMoments = [
    { title: "MIGNONE HALLS OF GEMS AND MINERALS", subtitle: "GEMS · FLUORESCENCE · CRYSTAL SYSTEMS", x: -10.2, z: -34, kind: "mineral" },
    { title: "BERNARD FAMILY HALL", subtitle: "NORTH AMERICAN MAMMALS · HABITAT DIORAMAS", x: 10.2, z: -56, kind: "diorama" },
    { title: "HALL OF SAURISCHIAN DINOSAURS", subtitle: "T. REX AMNH 5027 · SIX-INCH TEETH", x: -10.2, z: -78, kind: "jaw" },
    { title: "GLEN ROSE TRACKWAY", subtitle: "107-MILLION-YEAR-OLD DINOSAUR FOOTPRINTS", x: 10.2, z: -100, kind: "trackway" },
    { title: "APATOSAURUS", subtitle: "THE FIRST SAUROPOD DINOSAUR EVER MOUNTED", x: -10.2, z: -122, kind: "vertebrae" },
    { title: "ARTHUR ROSS HALL OF METEORITES", subtitle: "AHNIGHITO · CAPE YORK IRON METEORITE", x: 10.2, z: -144, kind: "meteorite" },
    { title: "CULLMAN HALL OF THE UNIVERSE", subtitle: "GALAXIES · STARS · PLANETS · COSMIC SCALE", x: -10.2, z: -166, kind: "universe" },
    { title: "FOSSIL PREPARATION LAB", subtitle: "FIELD JACKETS · TOOLS · GOBI DESERT EXPEDITIONS", x: 10.2, z: -188, kind: "lab" },
  ] as const;
  const visibleMoments = officialMoments.slice(0, quality < .58 ? 5 : quality < .82 ? 7 : officialMoments.length);
  for (const [index, moment] of visibleMoments.entries()) {
    const island = new THREE.Group(); island.name = `amnh-dense-official-exhibit-island-${index + 1}`; island.position.set(moment.x, 0, moment.z);
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(5.9, .68, 4.35, 6, .13), stone); plinth.name = "amnh-exhibit-island-grounded-stone-plinth"; plinth.position.y = .34; island.add(plinth);
    const hood = new THREE.Mesh(new RoundedBoxGeometry(5.5, 3.45, 3.95, 6, .07), glass); hood.name = "amnh-exhibit-island-low-reflection-vitrine"; hood.position.y = 2.22; island.add(hood);
    if (moment.kind === "mineral") {
      for (let specimen = 0; specimen < 4; specimen++) {
        const crystal = detailedMineralSpecimen(index + specimen, [
          new THREE.MeshStandardMaterial({ color: "#8d6baa", roughness: .3, metalness: .1 }),
          new THREE.MeshStandardMaterial({ color: "#3b7d78", roughness: .28, metalness: .12 }),
          new THREE.MeshStandardMaterial({ color: "#c18a52", roughness: .3, metalness: .18 }),
        ]);
        crystal.position.set(-1.65 + specimen * 1.1, 1.25, (specimen % 2 - .5) * .72); crystal.scale.setScalar(.72 + specimen % 2 * .16); island.add(crystal);
      }
    } else if (moment.kind === "jaw") {
      const jaw = new THREE.Mesh(new THREE.TorusGeometry(1.62, .16, 12, 46, Math.PI * 1.18), bone); jaw.name = "amnh-5027-tyrannosaurus-jaw-study-cast"; jaw.position.set(0, 1.85, .22); jaw.rotation.set(Math.PI / 2, 0, -.3); island.add(jaw);
      for (let tooth = 0; tooth < 14; tooth++) { const angle = -.08 + tooth / 13 * Math.PI * 1.1, fang = new THREE.Mesh(new THREE.ConeGeometry(.09 + tooth % 3 * .015, .52 + tooth % 4 * .08, 12), bone); fang.name = "tyrannosaurus-six-inch-tooth-cast"; fang.position.set(Math.cos(angle) * 1.48, 1.55, Math.sin(angle) * .96); fang.rotation.z = Math.cos(angle) * .42; island.add(fang); }
    } else if (moment.kind === "trackway") {
      const slab = new THREE.Mesh(new RoundedBoxGeometry(4.95, .22, 3.25, 5, .08), new THREE.MeshStandardMaterial({ color: "#8e765d", map: textures.stone, roughness: .96 })); slab.name = "glen-rose-riverbed-trackway-cast"; slab.position.y = .92; island.add(slab);
      for (let track = 0; track < 4; track++) for (let toe = -1; toe <= 1; toe++) { const impression = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .36, 5, 10), blackenedSteel); impression.name = "glen-rose-three-toed-footprint-impression"; impression.position.set((track % 2 ? .72 : -.72) + toe * .14, 1.045, -1.05 + track * .7); impression.rotation.x = Math.PI / 2; impression.rotation.z = toe * .38; island.add(impression); }
    } else if (moment.kind === "vertebrae") {
      for (let vertebra = 0; vertebra < 9; vertebra++) { const fossil = fossilVertebra(new THREE.Vector3(0, 1.35 + Math.sin(vertebra * .45) * .2, -1.55 + vertebra * .39), .2 + Math.sin(vertebra / 8 * Math.PI) * .09, bone, .08); fossil.name = "apatosaurus-mounted-vertebral-study"; island.add(fossil); }
      const support = new THREE.Mesh(new RoundedBoxGeometry(.08, 1.5, 3.7, 3, .02), blackenedSteel); support.position.set(0, 1.16, 0); island.add(support);
    } else if (moment.kind === "meteorite") {
      const iron = new THREE.Mesh(new THREE.IcosahedronGeometry(1.16, 4), new THREE.MeshStandardMaterial({ color: "#343a3b", metalness: .82, roughness: .44 })); iron.name = "cape-york-iron-meteorite-touchable-study"; iron.position.set(0, 1.66, 0); iron.scale.set(1.45, .78, 1.08); island.add(iron);
      for (const x of [-1.75, 1.75]) { const support = new THREE.Mesh(new RoundedBoxGeometry(.16, 1.2, .16, 3, .025), bronze); support.position.set(x, 1.1, 0); island.add(support); }
    } else if (moment.kind === "universe") {
      const planetColors = ["#b86e47", "#567ca1", "#d4b06a", "#8b6eaa"];
      for (let planet = 0; planet < 4; planet++) { const sphere = new THREE.Mesh(new THREE.SphereGeometry(.32 + planet * .1, 24, 16), new THREE.MeshStandardMaterial({ color: planetColors[planet], roughness: .68, emissive: planetColors[planet], emissiveIntensity: .08 })); sphere.name = "scales-of-the-universe-suspended-planet-model"; sphere.position.set(-1.65 + planet * 1.1, 1.7 + planet % 2 * .65, -.2 + planet % 2 * .5); island.add(sphere); const cable = new THREE.Mesh(new THREE.CylinderGeometry(.008, .008, 1.6, 6), blackenedSteel); cable.position.set(sphere.position.x, 3.15, sphere.position.z); island.add(cable); }
    } else if (moment.kind === "lab") {
      const fieldJacket = new THREE.Mesh(new RoundedBoxGeometry(2.4, .62, 1.55, 7, .16), new THREE.MeshStandardMaterial({ color: "#d4c29a", roughness: 1 })); fieldJacket.name = "gobi-desert-fossil-field-jacket"; fieldJacket.position.set(-.65, 1.34, 0); fieldJacket.rotation.y = -.18; island.add(fieldJacket);
      for (let tool = 0; tool < 5; tool++) { const handle = new THREE.Mesh(new THREE.CylinderGeometry(.035, .05, 1.15, 9), tool % 2 ? bronze : blackenedSteel); handle.name = "fossil-preparation-hand-tool"; handle.position.set(1.15 + tool * .2, 1.45, -.8 + tool * .38); handle.rotation.z = .65 + tool * .12; island.add(handle); }
    } else {
      const panorama = new THREE.Mesh(new RoundedBoxGeometry(4.8, 2.45, .12, 5, .04), mediaSurface); panorama.name = "north-american-mammals-layered-habitat-media"; panorama.position.set(0, 2.05, 1.66); island.add(panorama);
      for (let layer = 0; layer < 18; layer++) { const grass = new THREE.Mesh(new THREE.ConeGeometry(.04, .65 + layer % 3 * .18, 5), new THREE.MeshStandardMaterial({ color: layer % 2 ? "#7c834b" : "#a18b4d", roughness: 1 })); grass.position.set(-2.15 + layer * .25, 1.12, -.7 + layer % 4 * .42); grass.rotation.z = (layer % 3 - 1) * .16; island.add(grass); }
    }
    const graphic = exhibitTexture(moment.title, moment.subtitle, index % 2 ? "#7fc2c0" : "#d4b56d"); ownedTextures.push(graphic);
    const label = new THREE.Mesh(new RoundedBoxGeometry(5.15, 1.2, .08, 4, .025), new THREE.MeshBasicMaterial({ map: graphic, toneMapped: false })); label.name = "official-amnh-exhibit-identity-panel"; label.position.set(0, 3.38, 2.06); island.add(label);
    collection.add(island); circles.push({ x: moment.x, z: moment.z, radius: 3.3 });
  }

  const portalProgram = [
    ["OCEAN LIFE · AFRICAN MAMMALS", "BLUE WHALE · ELEPHANT GROUP · WATER HOLE", -31, "#315d6e"],
    ["EARTH · SPACE · DEEP TIME", "AHNIGHITO · PLANET EARTH · FOSSIL RECORD", -92, "#6e5a42"],
    ["DINOSAURS · FOSSIL MAMMALS", "T. REX · APATOSAURUS · SLOTHS THROUGH TIME", -153, "#4e654c"],
  ] as const;
  for (const [title, subtitle, z, color] of portalProgram) {
    const headerTexture = exhibitTexture(title, subtitle, color); ownedTextures.push(headerTexture);
    const header = new THREE.Mesh(new RoundedBoxGeometry(29, 2.15, .32, 5, .06), new THREE.MeshBasicMaterial({ map: headerTexture, toneMapped: false })); header.name = "amnh-cross-hall-illuminated-identity-portal"; header.position.set(0, 8.7, z); collection.add(header);
    for (const x of [-15.2, 15.2]) { const pier = new THREE.Mesh(new RoundedBoxGeometry(1.05, 8.2, .72, 5, .1), bronze); pier.name = "amnh-cross-hall-bronze-portal-pier"; pier.position.set(x, 4.1, z); collection.add(pier); }
  }

  // Compact media/label clusters face the main aisle at every previously bare
  // partition. They add readable texture density even when the player looks
  // sideways instead of directly at a hero object.
  const panelCount = quality < .58 ? 12 : quality < .82 ? 20 : 28;
  const researchTopics = [
    ["CONGO BASIN FIELD NOTES", "MAMMAL SURVEY · 1921 EXPEDITION"], ["WHALE EAR BONES", "HEARING ANATOMY · OCEAN ACOUSTICS"],
    ["DINOSAUR GROWTH RINGS", "HISTOLOGY · AGE · METABOLISM"], ["CAPE YORK METEORITES", "INUIT KNOWLEDGE · IRON · ORBIT"],
    ["GARNET UNDER PRESSURE", "NEW YORK BEDROCK · METAMORPHISM"], ["CORAL REEF TRANSECT", "ANDROS ISLAND · SPECIES COUNTS"],
    ["ELEPHANT FAMILY LIFE", "COMMUNICATION · MEMORY · KINSHIP"], ["TRILOBITE VISION", "CALCITE LENSES · ANCIENT SEAS"],
    ["BLUE WHALE FEEDING", "BALEEN · KRILL · LUNGE MECHANICS"], ["GOBI DESERT CAMP", "JACKETS · MAPS · FOSSIL PREPARATION"],
    ["SLOTH HAIR ECOSYSTEM", "ALGAE · MOTHS · CANOPY CAMOUFLAGE"], ["VOLCANIC ISLAND CLOCK", "ARGON DATING · PLATE MOTION"],
    ["MAMMOTH TOOTH WEAR", "GRASSLAND DIET · ENAMEL RIDGES"], ["SQUID SUCKER RINGS", "DEEP-SEA PREDATION · CHITIN"],
    ["BIRD EGG MICROSTRUCTURE", "SHELL PORES · INCUBATION"], ["TYRANNOSAURUS BITE", "MUSCLE RECONSTRUCTION · BONE DAMAGE"],
    ["LEAF VEINS AND CLIMATE", "GREEN RIVER FLORA · TEMPERATURE"], ["AMMONITE BUOYANCY", "CHAMBERS · SIPHUNCLE · SWIMMING"],
    ["PLANETARY CORES", "DENSITY · MAGNETISM · DIFFERENTIATION"], ["BAT ECHOLOCATION", "COCHLEA · FREQUENCY · FLIGHT"],
    ["FOSSIL PIGMENTS", "MELANOSOMES · COLOR RECONSTRUCTION"], ["GLACIAL BOULDERS", "TRANSPORT · STRIATIONS · ICE FLOW"],
    ["HUMAN EVOLUTION CASTS", "SKULL SHAPE · LOCOMOTION · DIET"], ["MUSEUM CONSERVATION LAB", "HUMIDITY · ADHESIVES · REVERSIBILITY"],
    ["DNA FROM COLLECTIONS", "TISSUE BANKS · LINEAGES · BIODIVERSITY"], ["INSECT WING ARCHIVE", "VENATION · FLIGHT · CLASSIFICATION"],
    ["DEEP OCEAN LIGHT", "BIOLUMINESCENCE · SIGNALS · CAMOUFLAGE"], ["ACCESSION TO EXHIBITION", "PROVENANCE · CATALOGING · PUBLIC SCIENCE"],
  ] as const;
  for (let index = 0; index < panelCount; index++) {
    const side = index % 2 ? 1 : -1, row = Math.floor(index / 2), topic = researchTopics[index], texture = collectionGraphicTexture(topic[0], topic[1], index + 12);
    ownedTextures.push(texture);
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 3.35), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); panel.name = "amnh-dense-main-aisle-interpretive-media-panel"; panel.position.set(side * 15.82, 4.8, -17 - row * 15.1); panel.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2; collection.add(panel);
    const light = new THREE.Mesh(new RoundedBoxGeometry(.16, .12, 4.9, 3, .025), mediaSurface); light.name = "amnh-media-panel-integrated-wash-light"; light.position.copy(panel.position).add(new THREE.Vector3(-side * .12, 2.02, 0)); collection.add(light);
  }
  root.add(collection);
}

function createCompactGroundSlothSkeleton(name: string, bone: THREE.Material, scale = 1) {
  const skeleton = new THREE.Group(); skeleton.name = name;
  const spine = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 2.45, 1.4),
    new THREE.Vector3(0, 2.85, .45),
    new THREE.Vector3(0, 2.95, -.55),
    new THREE.Vector3(0, 2.6, -1.35),
  ], false, "centripetal");
  const vertebrae: THREE.Vector3[] = [];
  for (let index = 0; index < 11; index++) {
    const amount = index / 10, point = spine.getPoint(amount); vertebrae.push(point);
    skeleton.add(fossilVertebra(point, .17 - Math.abs(.5 - amount) * .035, bone));
  }
  for (let index = 2; index < 9; index += 2) {
    const point = vertebrae[index], fullness = 1 - Math.abs(index - 5) / 6;
    skeleton.add(fossilRib(point, -1, .82 + fullness * .38, .58 + fullness * .28, bone), fossilRib(point, 1, .82 + fullness * .38, .58 + fullness * .28, bone));
  }
  const skull = new THREE.Group(); skull.name = `${name}-sculpted-skull`; skull.position.set(0, 2.58, -1.72);
  const cranium = new THREE.Mesh(new RoundedBoxGeometry(.68, .54, .72, 7, .16), bone); skull.add(cranium);
  const muzzle = new THREE.Mesh(new RoundedBoxGeometry(.48, .3, .64, 6, .1), bone); muzzle.position.set(0, -.1, -.55); skull.add(muzzle);
  for (const side of [-1, 1]) { const orbit = new THREE.Mesh(new THREE.TorusGeometry(.12, .035, 8, 18), bone); orbit.position.set(side * .3, .08, -.12); orbit.rotation.y = Math.PI / 2; skull.add(orbit); }
  skeleton.add(skull);
  for (const side of [-1, 1] as const) {
    const hip = new THREE.Vector3(side * .58, 2.38, 1.0), knee = new THREE.Vector3(side * .72, 1.2, .78), heel = new THREE.Vector3(side * .78, .32, .5);
    skeleton.add(fossilBoneBetween(hip, knee, .17, bone, 16), fossilBoneBetween(knee, heel, .135, bone, 14));
    const shoulder = new THREE.Vector3(side * .5, 2.45, -.92), elbow = new THREE.Vector3(side * .76, 1.42, -1.08), wrist = new THREE.Vector3(side * .9, .56, -1.35);
    skeleton.add(fossilBoneBetween(shoulder, elbow, .145, bone, 15), fossilBoneBetween(elbow, wrist, .11, bone, 14));
    for (let digit = 0; digit < 3; digit++) {
      const spread = (digit - 1) * .13;
      const curve = new THREE.CatmullRomCurve3([
        wrist.clone().add(new THREE.Vector3(side * spread, 0, 0)),
        wrist.clone().add(new THREE.Vector3(side * (spread + .12), -.18, -.35 - digit * .06)),
        wrist.clone().add(new THREE.Vector3(side * (spread + .08), -.38, -.28 - digit * .08)),
      ], false, "centripetal");
      const claw = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, .045, 8, false), bone); claw.name = `${name}-curved-manual-ungual`; skeleton.add(claw);
    }
  }
  const tail = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 2.25, 1.42), new THREE.Vector3(0, 1.7, 2.35), new THREE.Vector3(0, .78, 3.18)], false, "centripetal");
  for (let index = 0; index < 10; index++) skeleton.add(fossilVertebra(tail.getPoint(index / 9), .14 - index * .009, bone));
  mergeMuseumFossils(skeleton, bone, `${name}-merged-anatomical-fossil-mesh`);
  skeleton.scale.setScalar(scale);
  return skeleton;
}

function addSlothEvolutionGallery(root: THREE.Group, textures: GameTextures, ownedTextures: THREE.Texture[], bone: THREE.Material, quality: number, circles: CircleObstacle[]) {
  const gallery = new THREE.Group(); gallery.name = "fossil-mammal-halls-expanded-sloths-through-time-gallery";
  const walnut = new THREE.MeshStandardMaterial({ color: "#4d3327", map: textures.bark, roughness: .88 });
  const plinthMaterial = new THREE.MeshStandardMaterial({ color: "#302f2b", map: textures.stone, roughness: .8 });
  const glass = new THREE.MeshPhysicalMaterial({ color: "#b7d0d0", transparent: true, opacity: .14, transmission: .58, roughness: .08, depthWrite: false });
  glass.forceSinglePass = true;
  const specimens = [
    { name: "lestodon-armatus", title: "LESTODON ARMATUS", subtitle: "ARMORED-SKIN GROUND SLOTH · SOUTH AMERICA", x: -27, z: -169, yaw: .34, scale: 1.02 },
    { name: "mylodon-darwinii", title: "MYLODON DARWINII", subtitle: "PATAGONIAN GROUND SLOTH · SKIN AND HAIR PRESERVED", x: 27, z: -175, yaw: -.34, scale: .9 },
    { name: "megalonyx-jeffersonii", title: "MEGALONYX JEFFERSONII", subtitle: "JEFFERSON'S GROUND SLOTH · NORTH AMERICA", x: -27, z: -195, yaw: .3, scale: .84 },
    { name: "acratocnus-odontrigonus", title: "ACRATOCNUS", subtitle: "CARIBBEAN ISLAND SLOTH · COMPACT GROUND-DWELLER", x: 27, z: -207, yaw: -.3, scale: .68 },
  ] as const;
  for (const specimen of specimens) {
    const display = new THREE.Group(); display.name = `${specimen.name}-museum-study-case`; display.position.set(specimen.x, 0, specimen.z); display.rotation.y = specimen.yaw;
    const plinth = new THREE.Mesh(new RoundedBoxGeometry(8.8, .68, 6.2, 6, .14), plinthMaterial); plinth.position.y = .34; display.add(plinth);
    const skeleton = createCompactGroundSlothSkeleton(specimen.name, bone, specimen.scale); skeleton.position.set(0, .72, 0); skeleton.rotation.y = Math.PI / 2; display.add(skeleton);
    const hood = new THREE.Mesh(new RoundedBoxGeometry(8.3, 5.3, 5.75, 6, .08), glass); hood.name = "sloth-evolution-low-reflection-study-case"; hood.position.y = 3.22; display.add(hood);
    gallery.add(display); circles.push({ x: specimen.x, z: specimen.z, radius: 5.2 });
    addExhibitSign(root, ownedTextures, specimen.title, specimen.subtitle, specimen.x + (specimen.x < 0 ? 5.1 : -5.1), 3.2, specimen.z, specimen.x < 0 ? Math.PI / 2 : -Math.PI / 2, .58);
  }

  const living = new THREE.Group(); living.name = "living-sloth-adaptations-canopy-diorama"; living.position.set(27.5, 0, -158.5);
  const dioramaFloor = new THREE.Mesh(new RoundedBoxGeometry(12, .42, 8.5, 7, .13), new THREE.MeshStandardMaterial({ color: "#4f5d3b", map: textures.ground, roughness: 1 })); dioramaFloor.position.y = .21; living.add(dioramaFloor);
  const branch = new THREE.Mesh(new THREE.CylinderGeometry(.32, .48, 9.2, 16), walnut); branch.name = "living-sloth-diorama-continuous-canopy-branch"; branch.position.set(0, 3.55, 0); branch.rotation.z = Math.PI / 2; branch.rotation.y = .16; living.add(branch);
  const livingSloth = createPremiumSlothFriend(textures, quality, 8, "#51483b");
  livingSloth.root.name = "bradypus-living-three-toed-sloth-anatomy-model"; livingSloth.root.position.set(-1.2, 3.78, -.1); livingSloth.root.rotation.set(0, .5, .06); livingSloth.root.scale.multiplyScalar(.9); living.add(livingSloth.root); ownedTextures.push(...livingSloth.ownedTextures);
  const canopyGlass = new THREE.Mesh(new RoundedBoxGeometry(11.6, 6.8, 8.1, 7, .1), glass); canopyGlass.name = "living-sloth-canopy-diorama-glazing"; canopyGlass.position.y = 3.65; living.add(canopyGlass);
  gallery.add(living); circles.push({ x: 27.5, z: -158.5, radius: 6.3 });
  addExhibitSign(root, ownedTextures, "BRADYPUS · LIVING THREE-TOED SLOTH", "CANOPY ANATOMY · SUSPENSORY LOCOMOTION · LIVING XENARTHRAN", 22.2, 3.4, -158.5, -Math.PI / 2, .62);

  const rooseveltCase = new THREE.Group(); rooseveltCase.name = "roosevelt-collection-ground-sloth-skin-and-dung-case"; rooseveltCase.position.set(-28, 0, -213);
  const rooseveltPlinth = new THREE.Mesh(new RoundedBoxGeometry(10, .72, 6.3, 6, .14), plinthMaterial); rooseveltPlinth.position.y = .36; rooseveltCase.add(rooseveltPlinth);
  const skinSample = new THREE.Mesh(new RoundedBoxGeometry(6.8, .18, 2.9, 8, .08), new THREE.MeshStandardMaterial({ color: "#665343", map: textures.fur, bumpMap: textures.fur, bumpScale: .035, roughness: 1 })); skinSample.name = "roosevelt-collection-giant-ground-sloth-skin-study"; skinSample.position.set(0, 1.18, .65); skinSample.rotation.y = -.14; rooseveltCase.add(skinSample);
  for (let index = 0; index < 4; index++) { const coprolite = new THREE.Mesh(new THREE.IcosahedronGeometry(.35 + index % 2 * .09, 3), new THREE.MeshStandardMaterial({ color: "#514333", roughness: 1 })); coprolite.name = "roosevelt-collection-ground-sloth-coprolite"; coprolite.position.set(-2 + index * 1.3, 1.2, -1.25); coprolite.scale.set(1.45, .7, .9); rooseveltCase.add(coprolite); }
  const rooseveltGlass = new THREE.Mesh(new RoundedBoxGeometry(9.6, 3.4, 5.9, 6, .08), glass); rooseveltGlass.position.y = 2.18; rooseveltCase.add(rooseveltGlass); gallery.add(rooseveltCase); circles.push({ x: -28, z: -213, radius: 5.4 });
  addExhibitSign(root, ownedTextures, "ROOSEVELT COLLECTION", "GIANT GROUND SLOTH SKIN · DUNG · SOUTH AMERICAN PEOPLES", -22.5, 3.2, -213, Math.PI / 2, .62);

  const familyTreePanels = [
    ["SLOTH FAMILY TREE", "ACRATOCNUS · BRADYPUS · MYLODON · MEGALONYX · MEGATHERIUM", -42.9, -182, Math.PI / 2],
    ["XENARTHRAN RELATIVES", "SLOTHS · ARMADILLOS · GLYPTODONTS · SHARED DEEP ANCESTRY", 42.9, -190, -Math.PI / 2],
  ] as const;
  for (const [title, subtitle, x, z, yaw] of familyTreePanels) addExhibitSign(root, ownedTextures, title, subtitle, x, 5.8, z, yaw, 1.02);
  root.add(gallery);
}

function addMegatherium(root: THREE.Group, ownedTextures: THREE.Texture[], bone: THREE.Material, circles: CircleObstacle[]) {
  const gallery = new THREE.Group(); gallery.name = "fossil-mammal-halls-megatherium-americanum-finale";
  const stageMaterial = new THREE.MeshStandardMaterial({ color: "#302d29", roughness: .72, metalness: .06 });
  const mountMaterial = new THREE.MeshStandardMaterial({ color: "#151817", roughness: .3, metalness: .86 });
  const brass = new THREE.MeshStandardMaterial({ color: "#9d8045", roughness: .35, metalness: .72 });
  const stage = new THREE.Mesh(new RoundedBoxGeometry(25, .72, 17.5, 8, .2), stageMaterial); stage.position.set(0, .36, -198); gallery.add(stage);
  const interpretation = [
    ["SLOTHS THROUGH TIME", "ANATOMY · ADAPTATION · SOUTH AMERICAN PALEOECOLOGY"],
    ["A GIANT HERBIVORE", "MIOCENE–PLEISTOCENE · CLAWS FOR PULLING VEGETATION"],
  ] as const;
  interpretation.forEach(([title, subtitle], index) => {
    const texture = exhibitTexture(title, subtitle, index ? "#c8a96a" : "#a8c5b5"); ownedTextures.push(texture);
    const panel = new THREE.Group(); panel.name = "megatherium-fossil-hall-interpretation-wall";
    panel.position.set(index ? 23 : -23, 5.15, -224.9);
    const frame = new THREE.Mesh(new RoundedBoxGeometry(19.2, 7.1, .3, 5, .07), brass); panel.add(frame);
    const face = new THREE.Mesh(new RoundedBoxGeometry(18.5, 6.45, .08, 4, .035), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false })); face.position.z = .2; panel.add(face);
    gallery.add(panel);
  });

  // Project-original skeletal reconstruction built from anatomical landmarks,
  // not a row of spheres and straight rods. The mount is authored locally and
  // then rotated as a complete museum specimen so the pelvis, rib cage, long
  // balancing tail and hook-like manual unguals read together on approach.
  const skeleton = new THREE.Group();
  skeleton.name = "megatherium-americanum-giant-ground-sloth-articulated-skeleton";

  const pelvisCenter = new THREE.Vector3(0, 4.2, 1.55);
  const sacrum = fossilBoneBetween(new THREE.Vector3(0, 3.85, 1.85), new THREE.Vector3(0, 4.55, 1.18), .34, bone, 24);
  sacrum.name = "megatherium-fused-sacrum"; skeleton.add(sacrum);
  for (const side of [-1, 1] as const) {
    const iliumTop = new THREE.Vector3(side * 1.42, 4.95, 1.6);
    const acetabulum = new THREE.Vector3(side * 1.18, 4.02, 1.52);
    skeleton.add(
      fossilBoneBetween(pelvisCenter.clone().add(new THREE.Vector3(side * .18, .35, .05)), iliumTop, .3, bone, 24),
      fossilBoneBetween(iliumTop, acetabulum, .34, bone, 24),
      fossilBoneBetween(acetabulum, pelvisCenter.clone().add(new THREE.Vector3(side * .18, -.38, .12)), .27, bone, 22),
    );
    const socket = new THREE.Mesh(new THREE.TorusGeometry(.36, .095, 12, 30), bone);
    socket.name = "megatherium-pelvic-acetabulum"; socket.position.copy(acetabulum); socket.rotation.y = Math.PI / 2; skeleton.add(socket);
  }

  const spineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 4.55, 1.35),
    new THREE.Vector3(0, 5.25, .72),
    new THREE.Vector3(0, 6.25, -.12),
    new THREE.Vector3(0, 7.18, -1.0),
  ], false, "centripetal");
  const spinePoints: THREE.Vector3[] = [];
  for (let index = 0; index < 20; index++) {
    const amount = index / 19, point = spineCurve.getPoint(amount), tangent = spineCurve.getTangent(amount);
    spinePoints.push(point);
    skeleton.add(fossilVertebra(point, .31 - amount * .065, bone, Math.atan2(tangent.x, tangent.z)));
  }
  const sternumStart = new THREE.Vector3(0, 4.1, .7), sternumEnd = new THREE.Vector3(0, 5.55, -1.05);
  skeleton.add(fossilBoneBetween(sternumStart, sternumEnd, .14, bone, 18));
  for (let index = 3; index < 16; index += 2) {
    const point = spinePoints[index], amount = index / 19;
    const drop = 1.7 + Math.sin(amount * Math.PI) * .65;
    const width = 1.04 + Math.sin(amount * Math.PI) * .56;
    skeleton.add(fossilRib(point, -1, drop, width, bone), fossilRib(point, 1, drop, width, bone));
  }

  const neckCurve = new THREE.CatmullRomCurve3([
    spineCurve.getPoint(1),
    new THREE.Vector3(0, 7.68, -1.42),
    new THREE.Vector3(0, 8.08, -1.83),
    new THREE.Vector3(0, 8.2, -2.28),
  ], false, "centripetal");
  for (let index = 1; index < 7; index++) {
    const amount = index / 6, point = neckCurve.getPoint(amount), tangent = neckCurve.getTangent(amount);
    skeleton.add(fossilVertebra(point, .23 - amount * .035, bone, Math.atan2(tangent.x, tangent.z)));
  }

  const skull = new THREE.Group(); skull.name = "megatherium-sculpted-skull-jaw-and-dentition"; skull.position.set(0, 8.18, -2.5); skull.rotation.x = -.12;
  const cranium = new THREE.Mesh(new RoundedBoxGeometry(1.18, .9, 1.35, 8, .25), bone); cranium.position.z = -.15; skull.add(cranium);
  const rostrum = new THREE.Mesh(new RoundedBoxGeometry(.82, .48, 1.18, 7, .16), bone); rostrum.position.set(0, -.16, -.98); skull.add(rostrum);
  const jaw = new THREE.Mesh(new RoundedBoxGeometry(.76, .18, 1.45, 6, .08), bone); jaw.position.set(0, -.52, -.8); jaw.rotation.x = -.045; skull.add(jaw);
  for (const side of [-1, 1]) {
    const orbit = new THREE.Mesh(new THREE.TorusGeometry(.25, .075, 10, 28), bone); orbit.name = "megatherium-deep-orbit"; orbit.position.set(side * .5, .1, -.27); orbit.rotation.y = Math.PI / 2; skull.add(orbit);
    const arch = fossilBoneBetween(new THREE.Vector3(side * .5, -.02, -.2), new THREE.Vector3(side * .46, -.22, -.86), .075, bone, 12); arch.name = "megatherium-zygomatic-arch"; skull.add(arch);
  }
  for (const side of [-1, 1]) for (let tooth = 0; tooth < 4; tooth++) {
    const molar = new THREE.Mesh(new RoundedBoxGeometry(.13, .24, .13, 4, .03), bone);
    molar.name = "megatherium-high-crowned-cheek-tooth"; molar.position.set(side * .24, -.42, -.35 - tooth * .24); skull.add(molar);
  }
  skeleton.add(skull);

  const addCurvedUngual = (points: THREE.Vector3[], radius: number, name: string) => {
    const curve = new THREE.CatmullRomCurve3(points, false, "centripetal");
    const claw = new THREE.Mesh(new THREE.TubeGeometry(curve, 18, radius, 10, false), bone);
    claw.name = name; skeleton.add(claw);
  };

  for (const side of [-1, 1] as const) {
    const hip = new THREE.Vector3(side * 1.18, 4.04, 1.5);
    const knee = new THREE.Vector3(side * 1.52, 2.55, .9);
    const hock = new THREE.Vector3(side * 1.38, 1.02, -.08);
    const heel = new THREE.Vector3(side * 1.42, .55, .48);
    skeleton.add(
      fossilBoneBetween(hip, knee, .34, bone, 24),
      fossilBoneBetween(knee, hock, .27, bone, 22),
      fossilBoneBetween(hock, heel, .2, bone, 18),
    );
    for (let toe = 0; toe < 4; toe++) {
      const spread = (toe - 1.5) * .18;
      const metatarsal = new THREE.Vector3(side * (1.43 + spread), .42, -.15 - toe * .12);
      const toeEnd = new THREE.Vector3(side * (1.48 + spread * 1.25), .32, -.92 - toe * .1);
      skeleton.add(fossilBoneBetween(heel, metatarsal, .105, bone, 14), fossilBoneBetween(metatarsal, toeEnd, .075, bone, 12));
    }

    const shoulder = new THREE.Vector3(side * .9, 6.72, -.62);
    const elbow = new THREE.Vector3(side * 1.42, 5.18, -1.05);
    const wrist = new THREE.Vector3(side * 1.82, 3.82, -1.62);
    const palm = new THREE.Vector3(side * 1.98, 3.15, -2.08);
    skeleton.add(
      fossilBoneBetween(shoulder, elbow, .26, bone, 22),
      fossilBoneBetween(elbow, wrist, .21, bone, 20),
      fossilBoneBetween(wrist, palm, .16, bone, 18),
    );
    for (let digit = 0; digit < 3; digit++) {
      const lateral = (digit - 1) * .22;
      const knuckle = new THREE.Vector3(side * (2.03 + lateral), 3.0 - digit * .035, -2.38 - digit * .12);
      const clawMid = new THREE.Vector3(side * (2.15 + lateral * 1.18), 2.62 - digit * .05, -2.72 - digit * .16);
      const clawTip = new THREE.Vector3(side * (2.08 + lateral * 1.28), 2.3 - digit * .06, -2.58 - digit * .19);
      skeleton.add(fossilBoneBetween(palm, knuckle, .095, bone, 14));
      addCurvedUngual([knuckle, clawMid, clawTip], .075 + digit * .008, "megatherium-enormous-curved-manual-claw-ungual");
    }
  }

  const tailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 4.12, 2.05),
    new THREE.Vector3(0, 3.45, 3.35),
    new THREE.Vector3(0, 2.35, 5.05),
    new THREE.Vector3(0, 1.15, 7.15),
    new THREE.Vector3(0, .72, 8.35),
  ], false, "centripetal");
  for (let index = 0; index < 22; index++) {
    const amount = index / 21, point = tailCurve.getPoint(amount), tangent = tailCurve.getTangent(amount);
    const tailVertebra = fossilVertebra(point, .29 - amount * .19, bone, Math.atan2(tangent.x, tangent.z));
    tailVertebra.name = `megatherium-balancing-tail-vertebra-${index + 1}`;
    skeleton.add(tailVertebra);
  }

  // Thin blackened-steel uprights make the support system believable without
  // visually replacing the bones they carry.
  for (const [px, py, pz, height] of [[0, 4.55, 1.35, 4.3], [-1.42, 2.52, .35, 4.7], [1.42, 2.52, .35, 4.7], [0, 6.25, -1.0, 8.0]] as const) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.045, .065, height, 10), mountMaterial);
    post.name = "megatherium-blackened-steel-mount"; post.position.set(px, py - height * .5 + .08, pz); skeleton.add(post);
  }
  const mountCrossbar = fossilBoneBetween(new THREE.Vector3(-1.45, 4.55, 1.48), new THREE.Vector3(1.45, 4.55, 1.48), .045, mountMaterial, 10);
  mountCrossbar.name = "megatherium-mount-crossbar"; skeleton.add(mountCrossbar);

  mergeMuseumFossils(skeleton, bone, "megatherium-original-merged-anatomical-fossil-mesh");
  skeleton.position.set(0, .68, -199);
  // Turn the complete articulated mount a true quarter-turn so visitors see
  // the animal broadside from the main gallery approach. Keeping the rotation
  // on the specimen root preserves every anatomical landmark and steel mount.
  skeleton.rotation.y = -.34 + Math.PI / 2;
  gallery.add(skeleton);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, 19.5, 10), brass);
    rail.name = "megatherium-gallery-brass-visitor-rail"; rail.position.set(side * 10.4, 1.02, -198); rail.rotation.x = Math.PI / 2; gallery.add(rail);
  }
  root.add(gallery); circles.push({ x: 0, z: -198, radius: 11.5 });
  addGroundedMegatheriumSign(root, ownedTextures, brass);
}

function resolveBox(player: THREE.Vector3, velocity: THREE.Vector3, box: BoxObstacle, radius = .42) {
  if (player.x < box.minX - radius || player.x > box.maxX + radius || player.z < box.minZ - radius || player.z > box.maxZ + radius) return;
  const distances = [Math.abs(player.x - (box.minX - radius)), Math.abs((box.maxX + radius) - player.x), Math.abs(player.z - (box.minZ - radius)), Math.abs((box.maxZ + radius) - player.z)];
  const edge = distances.indexOf(Math.min(...distances));
  if (edge === 0) player.x = box.minX - radius; else if (edge === 1) player.x = box.maxX + radius; else if (edge === 2) player.z = box.minZ - radius; else player.z = box.maxZ + radius;
  if (edge < 2) velocity.x = 0; else velocity.z = 0;
}

const MUSEUM_GUEST_SPAWNS = [
  [-10, 6], [11, 4], [-28, -45], [-25, -82], [27, -44], [30, -86],
  [-26, -143], [26, -143], [-10, -171], [10, -174], [-5, -214], [7, -216],
  [-18, -194], [18, -202], [-12, -208], [13, -190], [-30, -116], [31, -117],
] as const;
const MEGATHERIUM_VIEWING_HALF_SPAN = 9.5;
// Build one deliberately distributed cohort during the existing offscreen
// museum prewarm. Creating new premium rigs as the player crossed each hall
// caused the repeatable multi-second hitches reported on the museum approach.
const MUSEUM_RESIDENT_GUEST_INDEXES = [0, 1, 2, 6, 10, 4, 7, 11, 3, 5, 12, 16] as const;

export class NaturalHistoryMuseumWorld {
  readonly root = new THREE.Group();
  readonly spawn = new THREE.Vector3(-18, 1.48, 52);
  readonly spawnYaw = .12;
  // Four equally valid viewing zones surround the mount. The former single
  // north-side target made side and rear approaches look correct but fail the
  // mission gate, particularly with the wider six-scooter convoy.
  readonly megatheriumViewingTargets = [
    new THREE.Vector3(0, 1.48, -184.5),
    new THREE.Vector3(14.5, 1.48, -198),
    new THREE.Vector3(0, 1.48, -211.5),
    new THREE.Vector3(-14.5, 1.48, -198),
  ] as const;
  readonly megatheriumTarget = this.megatheriumViewingTargets[0];
  readonly cameraPosition = new THREE.Vector3(0, 7.2, -176);
  readonly cameraTarget = new THREE.Vector3(0, 5.2, -198);
  readonly scooterDockTarget = new THREE.Vector3(-18, 1.48, 47.5);
  readonly environmentSettings = { background: "#8da0a2", fog: "#9eaaa7", fogDensity: .0035, toneMappingExposure: 1.22, cameraFar: 520 } as const;
  private readonly boxes: BoxObstacle[] = [];
  private readonly circles: CircleObstacle[] = [];
  private readonly guests: AmbientHumanAgent[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly scooters: PersonalMobilityVehicle[] = [];
  private readonly whiskers: ZooAnimalRig;
  private readonly whiskersOrder: readonly number[];
  private readonly whiskersPawprints: THREE.Group[] = [];
  private readonly whiskersPrevious = new THREE.Vector3();
  private whiskersStateValue: WhiskersQuestState = "AVAILABLE";
  private whiskersWaypointIndex = 0;
  private whiskersTravelCurve: THREE.CatmullRomCurve3 | null = null;
  private whiskersTravelStartedAt = 0;
  private whiskersTravelDuration = 1;
  private whiskersFollowing = false;
  private readonly megatheriumProximityTarget = new THREE.Vector3();
  private readonly scooterPrevious = new THREE.Vector3();
  private scooterConvoyActive = false;
  private scooterHeading = 0;
  private disposed = false;
  private readonly quality: number;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1, riderCount = 6, sessionSeed = Math.floor(Math.random() * 0x7fffffff)) {
    this.quality = quality;
    this.whiskersOrder = whiskersRoute(sessionSeed);
    this.root.name = "american-museum-of-natural-history-exploration-level"; scene.add(this.root);
    // The museum owns its complete light rig. Relying on station or shuttle
    // lights made the galleries briefly look correct during a transition and
    // then collapse into a gray fog void as soon as the previous world was
    // disposed. These fixtures leave with this root and cannot leak between
    // streamed scenes.
    const museumHemisphere = new THREE.HemisphereLight("#f4ead5", "#313932", 1.45);
    museumHemisphere.name = "museum-scene-owned-warm-hemisphere-light";
    const museumFill = new THREE.AmbientLight("#f0ddbd", .34);
    museumFill.name = "museum-scene-owned-conservation-fill-light";
    const museumKey = new THREE.DirectionalLight("#fff0d0", 1.65);
    museumKey.name = "museum-scene-owned-skylight-key";
    museumKey.position.set(-18, 28, 34);
    museumKey.target.position.set(0, 1.5, -98);
    museumKey.castShadow = quality > .72;
    museumKey.shadow.mapSize.set(quality > .86 ? 2048 : 1024, quality > .86 ? 2048 : 1024);
    this.root.add(museumHemisphere, museumFill, museumKey, museumKey.target);
    for (const z of [9, -49, -108, -167, -214]) {
      const galleryLight = new THREE.PointLight("#ffe2ae", quality > .58 ? 34 : 25, 48, 1.55);
      galleryLight.name = "museum-scene-owned-gallery-pool-light";
      galleryLight.position.set(0, 8.1, z);
      this.root.add(galleryLight);
    }
    const bone = new THREE.MeshStandardMaterial({ color: "#d5c6a2", roughness: .8, metalness: .02 });
    addArchitecture(this.root, textures, this.ownedTextures, quality, this.boxes);
    addGalleryFixtures(this.root, textures, this.ownedTextures, quality);
    addRotundaDinosaurs(this.root, bone, this.circles);
    addBlueWhale(this.root, this.circles);
    addMilsteinOceanLifeDetails(this.root, quality, this.circles);
    addAfricanMammals(this.root, textures, this.ownedTextures, bone, this.circles);
    addAkeleyHabitatDioramas(this.root, quality, this.circles);
    addEarthAndMeteoriteHalls(this.root, this.circles);
    addOfficialPermanentHallMoments(this.root, textures, this.ownedTextures, quality, this.circles);
    addSlothEvolutionGallery(this.root, textures, this.ownedTextures, bone, quality, this.circles);
    addMegatherium(this.root, this.ownedTextures, bone, this.circles);
    this.whiskers = createWhiskersCat(textures, quality);
    this.whiskers.root.position.copy(WHISKERS_HIDEOUTS[this.whiskersOrder[0]].position);
    this.whiskers.root.position.y = this.floorHeight(this.whiskers.root.position.x, this.whiskers.root.position.z);
    this.whiskers.root.userData.questRole = "resident-gallery-cat";
    this.root.add(this.whiskers.root);
    this.whiskersPrevious.copy(this.whiskers.root.position);
    this.addWhiskersTrailPresentation();
    const scooterCapacity = Math.max(1, Math.floor(riderCount));
    const scooterColumns = Math.min(6, scooterCapacity);
    for (let index = 0; index < scooterCapacity; index++) {
      const scooter = createElectricScooter(index);
      const column = index % scooterColumns, row = Math.floor(index / scooterColumns);
      scooter.root.name = `amnh-menagerie-scooter-${index + 1}-of-${scooterCapacity}`;
      scooter.root.position.set(-21.85 + column * 1.5, 0, 47.5 - row * 1.55);
      scooter.root.rotation.y = index % 2 ? -.045 : .045;
      scooter.root.userData.interactable = true;
      scooter.root.userData.interactionKind = "amnh-electric-scooter";
      this.scooters.push(scooter); this.root.add(scooter.root);
    }
    this.scooterPrevious.copy(this.scooters[0].root.position);
    const mobilityTexture = exhibitTexture("ELECTRIC SCOOTER CORRAL", `${scooterCapacity} SCOOTERS READY · WHOLE MENAGERIE`, "#78c8ba"); this.ownedTextures.push(mobilityTexture);
    const mobilitySign = new THREE.Mesh(new RoundedBoxGeometry(6.8, 1.12, .16, 5, .05), new THREE.MeshBasicMaterial({ map: mobilityTexture, toneMapped: false }));
    mobilitySign.name = "amnh-dynamic-menagerie-scooter-capacity-sign"; mobilitySign.position.set(-23.4, 2.42, 45.1); this.root.add(mobilitySign);
    this.circles.push({ x: -23.4, z: 45.1, radius: .62 });
    const mobilityPostMaterial = new THREE.MeshStandardMaterial({ color: "#343a38", metalness: .66, roughness: .38 });
    for (const x of [-25.9, -20.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .08, 1.9, 10), mobilityPostMaterial); post.name = "amnh-electric-scooter-corral-grounded-sign-post"; post.position.set(x, .95, 45.14); this.root.add(post);
    }
    addExhibitSign(this.root, this.ownedTextures, "THEODORE ROOSEVELT ROTUNDA", "BAROSAURUS · ALLOSAURUS · FLOOR 1", 0, 6.7, 14.2, 0, 1.12);
    addExhibitSign(this.root, this.ownedTextures, "MILSTEIN HALL OF OCEAN LIFE", "94-FOOT BLUE WHALE · ANDROS REEF · DEEP-OCEAN ENCOUNTER", -34.5, 3.1, -45, Math.PI / 2, .78);
    addExhibitSign(this.root, this.ownedTextures, "AKELEY HALL OF AFRICAN MAMMALS", "ELEPHANT GROUP · WATER HOLE · HABITAT DIORAMAS", 34.5, 3.1, -47, -Math.PI / 2, .78);
    addExhibitSign(this.root, this.ownedTextures, "ARTHUR ROSS HALL OF METEORITES", "AHNIGHITO · CAPE YORK METEORITE", -34.5, 3.1, -109, Math.PI / 2, .72);
    addExhibitSign(this.root, this.ownedTextures, "GOTTESMAN HALL OF PLANET EARTH", "ROCKS · MINERALS · PLANETARY PROCESSES", 34.5, 3.1, -109, -Math.PI / 2, .72);
    addExhibitSign(this.root, this.ownedTextures, "FOSSIL MAMMAL HALLS", "SLOTHS THROUGH TIME · GIANT GROUND SLOTH AHEAD", 0, 4.4, -158, 0, .9);
    // This work happens once while SubwayGame's museum scene is still
    // offscreen. The update loop never constructs or hydrates a character.
    this.createResidentGuests();
    const hemi = new THREE.HemisphereLight("#c8d9df", "#352f2a", .7);
    const galleryFill = new THREE.AmbientLight("#e7d8bd", .24);
    this.root.add(hemi, galleryFill);
    const sun = new THREE.DirectionalLight("#fff0ce", 2.2);
    sun.position.set(-35, 48, 58);
    sun.castShadow = quality > .72;
    sun.shadow.mapSize.set(quality > .9 ? 2048 : 1024, quality > .9 ? 2048 : 1024);
    sun.shadow.camera.left = sun.shadow.camera.bottom = -55;
    sun.shadow.camera.right = sun.shadow.camera.top = 55;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.normalBias = .03;
    this.root.add(sun, sun.target);

    // The previous uniform ambient wash made every exhibit read like an
    // ungrounded viewport model. Use localized ceiling spots to shape each
    // gallery and reserve expensive shadow maps for the two hero mounts.
    const gallerySpots = [
      [0, 7, 82, "#ffe3b0"], [-21, -45, 58, "#d7e7ec"], [27, -70, 84, "#f2d2a0"],
      [-22, -104, 54, "#d7e3e8"], [22, -130, 58, "#e9d4b7"], [-18, -162, 56, "#e5d6b9"], [0, -198, 88, "#ffe0a2"],
    ] as const;
    gallerySpots.slice(0, quality < .6 ? 4 : gallerySpots.length).forEach(([x, z, intensity, color], index, visible) => {
      const light = new THREE.SpotLight(color, intensity, 34, .72, .72, 1.7);
      light.name = `amnh-gallery-exhibit-spot-${index + 1}`;
      light.position.set(x, 9.7, z + 2.5);
      light.target.position.set(x, 1.2, z);
      light.castShadow = quality > .82 && (index === 0 || index === visible.length - 1);
      if (light.castShadow) {
        light.shadow.mapSize.set(1024, 1024);
        light.shadow.bias = -.00015;
        light.shadow.normalBias = .025;
      }
      this.root.add(light, light.target);
    });

    setShadows(this.root, false);
    for (const heroName of [
      "theodore-roosevelt-rotunda-barosaurus-allosaurus-display",
      "fossil-mammal-halls-megatherium-americanum-finale",
      "american-museum-central-park-west-facade",
    ]) {
      const hero = this.root.getObjectByName(heroName);
      if (hero) setShadows(hero, quality > .62);
    }
  }

  private createResidentGuests() {
    const count = this.quality < .58 ? 5 : this.quality < .82 ? 8 : MUSEUM_RESIDENT_GUEST_INDEXES.length;
    MUSEUM_RESIDENT_GUEST_INDEXES.slice(0, count).forEach((index, cohortIndex) => {
      const [x, z] = MUSEUM_GUEST_SPAWNS[index];
      const docent = cohortIndex === count - 1;
      const result = createPremiumHuman({ role: docent ? "attendant" : "visitor", quality: this.quality, variant: 61 + index, faceVariant: 9 + index, clothingVariant: 17 + index * 3, coat: ["#4d6d78", "#8b5b42", "#6a5b82", "#65744e", "#875f67", "#4d7468"][index % 6], trousers: ["#30363c", "#403c38", "#292d35", "#4b453d"][index % 4], skin: ["#b57959", "#77503e", "#d1a17d", "#906047", "#583d32", "#c18c6a"][index % 6], outfit: index % 3 === 0 ? "silk-leggings" : index % 3 === 1 ? "knit-chinos" : "cotton-denim", accessory: index % 5 === 0 ? "camera" : index % 5 === 1 ? "tote" : index % 5 === 2 ? "none" : "backpack", pose: index % 5 === 0 ? "photographing" : index % 5 === 2 ? "checking-map" : "neutral" });
      result.root.name = docent ? "fossil-mammal-hall-docent" : "amnh-wandering-museum-visitor-" + (index + 1); result.root.position.set(x, 0, z); this.root.add(result.root); this.ownedTextures.push(...result.ownedTextures);
      const axis = (Math.abs(x) > 18 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(index % 2 ? 1 : -1, 0, .3)).normalize();
      const right = new THREE.Vector3(-axis.z, 0, axis.x), origin = result.root.position.clone();
      const travel = docent ? .65 : 3.2 + index % 4;
      this.guests.push(createAmbientHumanAgent(result.root, {
        axis,
        waypoints: [origin, origin.clone().addScaledVector(axis, travel * .55), origin.clone().addScaledVector(axis, travel).addScaledVector(right, 1 + index % 3 * .28), origin.clone().addScaledVector(right, .8)],
        speed: docent ? .46 : .68 + index % 3 * .06,
        pauseSeconds: docent ? 5.2 : 2.6 + index % 3,
        phase: index * 1.9,
        lookAround: docent ? .28 : .12 + index % 4 * .04,
      }));
    });
  }

  private addWhiskersTrailPresentation() {
    const tagTexture = exhibitTexture("WHISKERS", "TAN & WHITE RESIDENT GALLERY CAT · FOLLOW THE BRASS PAWPRINTS", "#e5bd72");
    this.ownedTextures.push(tagTexture);
    const sign = new THREE.Mesh(new RoundedBoxGeometry(5.8, 1.55, .18, 5, .055), new THREE.MeshBasicMaterial({ map: tagTexture, toneMapped: false }));
    sign.name = "amnh-whiskers-resident-gallery-cat-introduction-sign"; sign.position.set(-10.5, 2.15, 29); sign.rotation.y = .08; this.root.add(sign);
    for (const x of [-12.8, -8.2]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.045, .07, 1.5, 10), new THREE.MeshStandardMaterial({ color: "#5e4d2d", metalness: .68, roughness: .34 }));
      post.position.set(x, .75, 29.05); this.root.add(post);
    }
    this.circles.push({ x: -10.5, z: 29, radius: .55 });

    const brass = new THREE.MeshStandardMaterial({ color: "#d6af5d", emissive: "#664a13", emissiveIntensity: .18, metalness: .46, roughness: .38, transparent: true, opacity: .82 });
    this.whiskersOrder.forEach((hideoutIndex, routeIndex) => {
      const hideout = WHISKERS_HIDEOUTS[hideoutIndex], trail = new THREE.Group();
      trail.name = `whiskers-brass-pawprint-waypoint-${routeIndex + 1}`;
      trail.position.copy(hideout.position).add(new THREE.Vector3(routeIndex % 2 ? -.85 : .85, .022, .72));
      trail.rotation.y = routeIndex % 2 ? -.32 : .28;
      for (let print = 0; print < 3; print++) {
        const paw = new THREE.Group(); paw.position.set((print % 2 ? -.18 : .18), 0, print * .5);
        const pad = new THREE.Mesh(new THREE.CircleGeometry(.11, 16), brass.clone()); pad.rotation.x = -Math.PI / 2; pad.scale.set(1, 1.25, 1); paw.add(pad);
        for (let toe = 0; toe < 4; toe++) {
          const toeMark = new THREE.Mesh(new THREE.CircleGeometry(.035, 12), brass.clone());
          toeMark.rotation.x = -Math.PI / 2; toeMark.position.set((toe - 1.5) * .055, .002, -.13 - Math.abs(toe - 1.5) * .018); paw.add(toeMark);
        }
        trail.add(paw);
      }
      trail.visible = routeIndex === 0;
      this.whiskersPawprints.push(trail); this.root.add(trail);
    });
  }

  get whiskersQuestState() { return this.whiskersStateValue; }
  get isWhiskersQuestActive() { return this.whiskersStateValue === "TRAIL"; }
  get isWhiskersQuestComplete() { return this.whiskersStateValue === "COMPLETE"; }
  get whiskersProgress() {
    return {
      current: this.whiskersStateValue === "COMPLETE" ? this.whiskersOrder.length : this.whiskersWaypointIndex,
      total: this.whiskersOrder.length,
    };
  }
  get whiskersObjectiveTarget() {
    const hideout = WHISKERS_HIDEOUTS[this.whiskersOrder[this.whiskersWaypointIndex]];
    return hideout.position.clone().setY(1.48);
  }
  get whiskersObjectiveLabel() {
    if (this.whiskersStateValue === "COMPLETE") return "Whiskers found · continue to Megatherium";
    const hideout = WHISKERS_HIDEOUTS[this.whiskersOrder[this.whiskersWaypointIndex]];
    return this.whiskersStateValue === "AVAILABLE" ? "Meet Whiskers, the museum's tan and white cat" : `Follow Whiskers: ${hideout.label.toLowerCase()}`;
  }
  whiskersInteractionHint(player: THREE.Vector3): WhiskersInteractionHint | null {
    if (this.whiskersFollowing || this.whiskersTravelCurve) return null;
    const distance = Math.hypot(player.x - this.whiskers.root.position.x, player.z - this.whiskers.root.position.z);
    if (distance > 3.1) return null;
    const hideout = WHISKERS_HIDEOUTS[this.whiskersOrder[this.whiskersWaypointIndex]];
    return { label: hideout.label, target: this.whiskers.root.position.clone().setY(1.48), distance };
  }
  interactWhiskers(player: THREE.Vector3, elapsed: number): WhiskersQuestEvent | null {
    if (!this.whiskersInteractionHint(player)) return null;
    const hideout = WHISKERS_HIDEOUTS[this.whiskersOrder[this.whiskersWaypointIndex]];
    if (this.whiskersWaypointIndex >= this.whiskersOrder.length - 1) {
      this.whiskersStateValue = "COMPLETE";
      this.whiskersFollowing = true;
      this.whiskers.root.userData.animationState = "pounce";
      this.whiskersPawprints.forEach(print => { print.visible = false; });
      return { kind: "WHISKERS_FOUND", progress: this.whiskersOrder.length, total: this.whiskersOrder.length, message: hideout.moment };
    }
    const first = this.whiskersStateValue === "AVAILABLE";
    this.whiskersStateValue = "TRAIL";
    this.whiskersWaypointIndex++;
    this.beginWhiskersTravel(elapsed);
    return {
      kind: first ? "WHISKERS_TRAIL_STARTED" : "WHISKERS_TRAIL_ADVANCED",
      progress: this.whiskersWaypointIndex,
      total: this.whiskersOrder.length,
      message: `${hideout.moment} Follow the glowing brass pawprints · ${this.whiskersWaypointIndex} / ${this.whiskersOrder.length}.`,
    };
  }
  private beginWhiskersTravel(elapsed: number) {
    const from = this.whiskers.root.position.clone(), to = WHISKERS_HIDEOUTS[this.whiskersOrder[this.whiskersWaypointIndex]].position.clone();
    const midpointZ = (from.z + to.z) * .5;
    this.whiskersTravelCurve = new THREE.CatmullRomCurve3([
      from,
      new THREE.Vector3(from.x * .62, 0, midpointZ - 2),
      new THREE.Vector3(to.x * .58, 0, midpointZ + 2),
      to,
    ], false, "catmullrom", .34);
    this.whiskersTravelStartedAt = elapsed;
    this.whiskersTravelDuration = THREE.MathUtils.clamp(this.whiskersTravelCurve.getLength() / 5.4, 1.4, 8.5);
    this.whiskers.root.userData.animationState = "walk";
    this.whiskersPawprints.forEach((print, index) => { print.visible = index === this.whiskersWaypointIndex; });
  }

  get objectiveTarget() { return this.megatheriumTarget.clone(); }
  get objectiveLabel() { return "Find the Megatherium in the Fossil Mammal Halls"; }
  get isScooterConvoyActive() { return this.scooterConvoyActive; }
  get scooterCapacity() { return this.scooters.length; }
  floorHeight(x = 0, z = 0) {
    if (Math.abs(x) > 22.5) return 0;
    if (z >= 24.45 && z <= 34.65) {
      const step = THREE.MathUtils.clamp(Math.round((34.15 - z) / 1.12), 0, 8);
      return .11 + step * .135;
    }
    if (z >= 20.1 && z < 24.45) return 1.19;
    if (z >= 10.4 && z < 20.1) return THREE.MathUtils.clamp((z - 10.4) / 9.7, 0, 1) * 1.19;
    return 0;
  }
  nearestMegatheriumViewingTarget(player: THREE.Vector3, target = new THREE.Vector3()) {
    let nearestX = 0, nearestZ = 0, nearestDistance = Infinity;
    for (let index = 0; index < this.megatheriumViewingTargets.length; index++) {
      const anchor = this.megatheriumViewingTargets[index];
      const northOrSouth = index === 0 || index === 2;
      const candidateX = northOrSouth ? THREE.MathUtils.clamp(player.x, -MEGATHERIUM_VIEWING_HALF_SPAN, MEGATHERIUM_VIEWING_HALF_SPAN) : anchor.x;
      const candidateZ = northOrSouth ? anchor.z : THREE.MathUtils.clamp(player.z, -198 - MEGATHERIUM_VIEWING_HALF_SPAN, -198 + MEGATHERIUM_VIEWING_HALF_SPAN);
      const candidateDistance = Math.hypot(player.x - candidateX, player.z - candidateZ);
      if (candidateDistance < nearestDistance) { nearestX = candidateX; nearestZ = candidateZ; nearestDistance = candidateDistance; }
    }
    return target.set(nearestX, 1.48, nearestZ);
  }
  megatheriumNearby(player: THREE.Vector3, distance = 8.5) {
    const nearest = this.nearestMegatheriumViewingTarget(player, this.megatheriumProximityTarget);
    return Math.hypot(player.x - nearest.x, player.z - nearest.z) <= distance;
  }
  scooterDockNearby(player: THREE.Vector3, distance = 5.2) {
    return !this.scooterConvoyActive && this.scooters.some(scooter => scooter.root.visible && Math.hypot(player.x - scooter.root.position.x, player.z - scooter.root.position.z) <= distance);
  }

  setScooterConvoyActive(active: boolean, player?: THREE.Vector3, yaw = 0) {
    this.scooterConvoyActive = active;
    this.scooterHeading = yaw;
    this.scooters.forEach((scooter, index) => { scooter.root.visible = active ? index === 0 : true; });
    if (player) {
      const lead = this.scooters[0];
      lead.root.position.set(player.x, this.floorHeight(player.x, player.z), player.z);
      lead.root.rotation.set(0, yaw, 0);
      this.scooterPrevious.copy(player);
    }
  }

  updateScooter(player: THREE.Vector3, movementYaw: number) {
    if (!this.scooterConvoyActive) return;
    const scooter = this.scooters[0], distance = Math.hypot(player.x - this.scooterPrevious.x, player.z - this.scooterPrevious.z);
    if (distance > .001) this.scooterHeading = movementYaw;
    scooter.root.position.set(player.x, this.floorHeight(player.x, player.z), player.z);
    scooter.root.rotation.set(0, this.scooterHeading, 0);
    rollPersonalMobility(scooter, distance, .19);
    this.scooterPrevious.copy(player);
  }

  getScooterGripPositions(target: { left: THREE.Vector3; right: THREE.Vector3 }) {
    const anchors = this.scooters[0].gripAnchors;
    if (!anchors) return target;
    this.scooters[0].root.updateMatrixWorld(true);
    anchors[0].getWorldPosition(target.left); anchors[1].getWorldPosition(target.right);
    return target;
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    this.resolveCompanion(player, velocity, .42);
    player.y += 1.48;
  }

  resolveCompanion(position: THREE.Vector3, velocity: THREE.Vector3, radius: number) {
    position.x = THREE.MathUtils.clamp(position.x, -62 + radius, 62 - radius);
    position.z = THREE.MathUtils.clamp(position.z, -221 + radius, 61 - radius);
    this.boxes.forEach(box => resolveBox(position, velocity, box, radius));
    for (const circle of this.circles) {
      const dx = position.x - circle.x, dz = position.z - circle.z, distance = Math.hypot(dx, dz), clearance = circle.radius + radius;
      if (distance <= .001 || distance >= clearance) continue;
      position.x = circle.x + dx / distance * clearance; position.z = circle.z + dz / distance * clearance; velocity.set(0, 0, 0);
    }
    position.y = this.floorHeight(position.x, position.z);
  }

  update(elapsed: number, delta: number, player?: THREE.Vector3) {
    if (this.disposed) return;
    // Static gallery content remains resident after the offscreen compile and
    // uses Three's frustum culling. Runtime visibility streaming caused cold
    // geometry and texture uploads every few metres, presenting as freezes.
    this.guests.forEach(agent => {
      const nearby = !player || Math.abs(agent.root.position.z - player.z) < 76;
      agent.root.visible = nearby;
      if (nearby) updateAmbientHumanAgent(agent, elapsed, delta);
    });
    this.updateWhiskers(elapsed, delta, player);
  }

  private updateWhiskers(elapsed: number, delta: number, player?: THREE.Vector3) {
    this.whiskersPrevious.copy(this.whiskers.root.position);
    if (this.whiskersTravelCurve) {
      const amount = THREE.MathUtils.clamp((elapsed - this.whiskersTravelStartedAt) / this.whiskersTravelDuration, 0, 1);
      const eased = amount * amount * (3 - 2 * amount);
      this.whiskersTravelCurve.getPointAt(eased, this.whiskers.root.position);
      this.whiskers.root.position.y = this.floorHeight(this.whiskers.root.position.x, this.whiskers.root.position.z);
      if (amount >= 1) {
        this.whiskersTravelCurve = null;
        this.whiskers.root.userData.animationState = "idle";
      }
    } else if (this.whiskersFollowing && player) {
      const target = player.clone().add(new THREE.Vector3(1.3, -1.48, 2.25));
      const dx = target.x - this.whiskers.root.position.x, dz = target.z - this.whiskers.root.position.z, distance = Math.hypot(dx, dz);
      if (distance > .08) {
        const step = Math.min(distance, delta * 4.2 * THREE.MathUtils.clamp(distance * .5, .75, 1.8));
        this.whiskers.root.position.x += dx / distance * step;
        this.whiskers.root.position.z += dz / distance * step;
      }
      this.whiskers.root.position.y = this.floorHeight(this.whiskers.root.position.x, this.whiskers.root.position.z);
      this.whiskers.root.userData.animationState = distance > .22 ? "walk" : "idle";
    }
    const movedX = this.whiskers.root.position.x - this.whiskersPrevious.x, movedZ = this.whiskers.root.position.z - this.whiskersPrevious.z;
    if (Math.hypot(movedX, movedZ) > .001) {
      const yaw = Math.atan2(-movedX, -movedZ), error = Math.atan2(Math.sin(yaw - this.whiskers.root.rotation.y), Math.cos(yaw - this.whiskers.root.rotation.y));
      this.whiskers.root.rotation.y += error * (1 - Math.exp(-delta * 8));
    }
    this.whiskersPawprints.forEach((print, index) => {
      if (!print.visible) return;
      const pulse = .35 + Math.sin(elapsed * 3.7 + index) * .16;
      print.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        const surface = object.material;
        if (surface instanceof THREE.MeshStandardMaterial) surface.emissiveIntensity = pulse;
      });
    });
    this.whiskers.update(elapsed, delta);
  }

  dispose() {
    if (this.disposed) return; this.disposed = true; markAuthoredZooAnimalDisposed(this.whiskers.root); markPremiumCharactersDisposed(this.root); this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(surface => materials.add(surface)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(surface => surface.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
