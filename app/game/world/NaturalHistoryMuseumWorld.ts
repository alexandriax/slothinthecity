import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { GameTextures } from "../rendering/textures";
import { createPremiumHuman, createPremiumSlothFriend, markPremiumCharactersDisposed } from "./PremiumCharacter";
import { createAmbientHumanAgent, updateAmbientHumanAgent, type AmbientHumanAgent } from "./characters/AmbientHumanMotion";
import { createSegwayScooter, rollPersonalMobility, type PersonalMobilityVehicle } from "./PersonalMobility";

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
  const portalDark = new THREE.MeshStandardMaterial({ color: "#171b1a", emissive: "#6a4d24", emissiveIntensity: .42, roughness: .72 });
  const entryBrass = new THREE.MeshStandardMaterial({ color: "#9d824b", metalness: .68, roughness: .36 });
  for (const x of [-6, 0, 6]) {
    const recess = new THREE.Mesh(new RoundedBoxGeometry(4.6, 7.2, .22, 6, .08), portalDark);
    recess.name = "amnh-open-warm-lit-public-entrance"; recess.position.set(x, 4.78, 23.92); facade.add(recess);
    for (const side of [-1, 1]) {
      const door = new THREE.Mesh(new RoundedBoxGeometry(1.84, 6.35, .09, 5, .04), glass);
      door.name = "amnh-open-glass-entrance-door-leaf"; door.position.set(x + side * 2.02, 4.55, 24.2); door.rotation.y = side * .9; facade.add(door);
      const pull = new THREE.Mesh(new RoundedBoxGeometry(.055, 1.25, .08, 3, .02), entryBrass);
      pull.position.set(x + side * 1.38, 4.55, 24.42); facade.add(pull);
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
    const artifact = index % 3 === 1 ? detailedInvertebrateFossil(fossil) : detailedMineralSpecimen(index, mineralPalette);
    artifact.name = index % 3 === 1 ? "museum-invertebrate-fossil-cast" : "museum-mineral-specimen";
    artifact.position.set((index % 3 - 1) * .22, 1.42, 0); artifact.rotation.set(index * .19, index * .37, index * .11); display.add(artifact);
    const caption = new THREE.Mesh(new RoundedBoxGeometry(2.45, .34, .06, 3, .02), label); caption.name = "museum-case-interpretation-label"; caption.position.set(0, .68, 1.56); caption.rotation.x = -.22; display.add(caption);
    fixtures.add(display);
  }

  for (let row = 0; row < 8; row++) for (const side of [-1, 1]) {
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
  skeleton.rotation.y = -.34;
  gallery.add(skeleton);

  for (const side of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.045, .055, 19.5, 10), brass);
    rail.name = "megatherium-gallery-brass-visitor-rail"; rail.position.set(side * 10.4, 1.02, -198); rail.rotation.x = Math.PI / 2; gallery.add(rail);
  }
  root.add(gallery); circles.push({ x: 0, z: -198, radius: 11.5 });
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
  readonly scooterDockTarget = new THREE.Vector3(-18, 1.48, 47.5);
  readonly environmentSettings = { background: "#8da0a2", fog: "#9eaaa7", fogDensity: .0035, toneMappingExposure: 1.22, cameraFar: 520 } as const;
  private readonly boxes: BoxObstacle[] = [];
  private readonly circles: CircleObstacle[] = [];
  private readonly guests: AmbientHumanAgent[] = [];
  private readonly ownedTextures: THREE.Texture[] = [];
  private readonly scooters: PersonalMobilityVehicle[] = [];
  private readonly scooterPrevious = new THREE.Vector3();
  private scooterConvoyActive = false;
  private scooterHeading = 0;
  private disposed = false;

  constructor(scene: THREE.Scene, textures: GameTextures, quality = 1) {
    this.root.name = "american-museum-of-natural-history-exploration-level"; scene.add(this.root);
    const bone = new THREE.MeshStandardMaterial({ color: "#d5c6a2", roughness: .8, metalness: .02 });
    addArchitecture(this.root, textures, this.ownedTextures, quality, this.boxes);
    addGalleryFixtures(this.root, textures, this.ownedTextures, quality);
    addRotundaDinosaurs(this.root, bone, this.circles);
    addBlueWhale(this.root, this.circles);
    addMilsteinOceanLifeDetails(this.root, quality, this.circles);
    addAfricanMammals(this.root, bone, this.circles);
    addAkeleyHabitatDioramas(this.root, quality, this.circles);
    addEarthAndMeteoriteHalls(this.root, this.circles);
    addSlothEvolutionGallery(this.root, textures, this.ownedTextures, bone, quality, this.circles);
    addMegatherium(this.root, this.ownedTextures, bone, this.circles);
    for (let index = 0; index < 5; index++) {
      const scooter = createSegwayScooter(index);
      scooter.root.name = `amnh-five-scooter-fast-travel-line-${index + 1}`;
      scooter.root.position.set(-21.1 + index * 1.55, 0, 47.5);
      scooter.root.rotation.y = index % 2 ? -.045 : .045;
      scooter.root.userData.interactable = true;
      scooter.root.userData.interactionKind = "amnh-segway-scooter";
      this.scooters.push(scooter); this.root.add(scooter.root);
    }
    this.scooterPrevious.copy(this.scooters[0].root.position);
    const mobilityTexture = exhibitTexture("SEGWAY SCOOTER CORRAL", "E TO RIDE · ALL FOUR FRIENDS RIDE TOGETHER", "#78c8ba"); this.ownedTextures.push(mobilityTexture);
    const mobilitySign = new THREE.Mesh(new RoundedBoxGeometry(6.8, 1.12, .16, 5, .05), new THREE.MeshBasicMaterial({ map: mobilityTexture, toneMapped: false }));
    mobilitySign.name = "amnh-five-segway-scooters-group-fast-travel-sign"; mobilitySign.position.set(-23.4, 2.42, 45.1); this.root.add(mobilitySign);
    const mobilityPostMaterial = new THREE.MeshStandardMaterial({ color: "#343a38", metalness: .66, roughness: .38 });
    for (const x of [-25.9, -20.9]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(.055, .08, 1.9, 10), mobilityPostMaterial); post.name = "amnh-segway-corral-grounded-sign-post"; post.position.set(x, .95, 45.14); this.root.add(post);
    }
    addExhibitSign(this.root, this.ownedTextures, "THEODORE ROOSEVELT ROTUNDA", "BAROSAURUS · ALLOSAURUS · FLOOR 1", 0, 6.7, 14.2, 0, 1.12);
    addExhibitSign(this.root, this.ownedTextures, "MILSTEIN HALL OF OCEAN LIFE", "94-FOOT BLUE WHALE · ANDROS REEF · DEEP-OCEAN ENCOUNTER", -34.5, 3.1, -45, Math.PI / 2, .78);
    addExhibitSign(this.root, this.ownedTextures, "AKELEY HALL OF AFRICAN MAMMALS", "ELEPHANT GROUP · WATER HOLE · HABITAT DIORAMAS", 34.5, 3.1, -47, -Math.PI / 2, .78);
    addExhibitSign(this.root, this.ownedTextures, "ARTHUR ROSS HALL OF METEORITES", "AHNIGHITO · CAPE YORK METEORITE", -34.5, 3.1, -109, Math.PI / 2, .72);
    addExhibitSign(this.root, this.ownedTextures, "GOTTESMAN HALL OF PLANET EARTH", "ROCKS · MINERALS · PLANETARY PROCESSES", 34.5, 3.1, -109, -Math.PI / 2, .72);
    addExhibitSign(this.root, this.ownedTextures, "FOSSIL MAMMAL HALLS", "SLOTHS THROUGH TIME · GIANT GROUND SLOTH AHEAD", 0, 4.4, -158, 0, .9);
    const guestSpawns = [
      [-10, 6], [11, 4], [-28, -45], [-25, -82], [27, -44], [30, -86],
      [-26, -143], [26, -143], [-10, -171], [10, -174], [-5, -214], [7, -216],
      [-18, -194], [18, -202], [-12, -208], [13, -190], [-30, -116], [31, -117],
    ] as const;
    const count = quality < .58 ? 8 : quality < .82 ? 12 : 18;
    for (let index = 0; index < count; index++) {
      const [x, z] = guestSpawns[index], result = createPremiumHuman({ role: index === count - 1 ? "attendant" : "visitor", quality, variant: 61 + index, faceVariant: 9 + index, coat: ["#4d6d78", "#8b5b42", "#6a5b82", "#65744e"][index % 4], trousers: ["#30363c", "#403c38", "#292d35"][index % 3], skin: ["#b57959", "#77503e", "#d1a17d", "#906047"][index % 4], outfit: index % 3 === 1 ? "knit-chinos" : "cotton-denim", accessory: index % 4 === 0 ? "camera" : index % 4 === 1 ? "tote" : "backpack", pose: index % 4 === 0 ? "photographing" : "neutral" });
      result.root.name = index === count - 1 ? "fossil-mammal-hall-docent" : "amnh-wandering-museum-visitor-" + (index + 1); result.root.position.set(x, 0, z); this.root.add(result.root); this.ownedTextures.push(...result.ownedTextures);
      this.guests.push(createAmbientHumanAgent(result.root, { axis: Math.abs(x) > 18 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(index % 2 ? 1 : -1, 0, .3), travel: index === count - 1 ? .4 : 2.5 + index % 4, speed: .7 + index % 3 * .06, pauseSeconds: 2.6 + index % 3, phase: index * 1.9 }));
    }
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
      [0, 7, 82, "#ffe3b0"], [-21, -45, 58, "#d7e7ec"], [22, -70, 62, "#f2d2a0"],
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

  get objectiveTarget() { return this.megatheriumTarget.clone(); }
  get objectiveLabel() { return "Find the Megatherium in the Fossil Mammal Halls"; }
  get isScooterConvoyActive() { return this.scooterConvoyActive; }
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
  megatheriumNearby(player: THREE.Vector3, distance = 8.5) { return Math.hypot(player.x - this.megatheriumTarget.x, player.z - this.megatheriumTarget.z) <= distance; }
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
    player.x = THREE.MathUtils.clamp(player.x, -62, 62); player.z = THREE.MathUtils.clamp(player.z, -221, 61);
    this.boxes.forEach(box => resolveBox(player, velocity, box));
    for (const circle of this.circles) {
      const dx = player.x - circle.x, dz = player.z - circle.z, distance = Math.hypot(dx, dz), clearance = circle.radius + .42;
      if (distance <= .001 || distance >= clearance) continue;
      player.x = circle.x + dx / distance * clearance; player.z = circle.z + dz / distance * clearance; velocity.set(0, 0, 0);
    }
    player.y = this.floorHeight(player.x, player.z) + 1.48;
  }

  update(elapsed: number, delta: number) { if (!this.disposed) this.guests.forEach(agent => updateAmbientHumanAgent(agent, elapsed, delta)); }

  dispose() {
    if (this.disposed) return; this.disposed = true; markPremiumCharactersDisposed(this.root); this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); (Array.isArray(object.material) ? object.material : [object.material]).forEach(surface => materials.add(surface)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(surface => surface.dispose()); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
