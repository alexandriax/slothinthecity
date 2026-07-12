import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { GameTextures } from "../rendering/textures";

export type SubwayStationId = "FIFTH_AV" | "LEXINGTON" | "WEST_FARMS";
export type TrainPhase = "AWAY" | "APPROACHING" | "BOARDING" | "DEPARTING";

export const SUBWAY_TRAIN_INTERVAL_SECONDS = 30;

export type BoardingOption = {
  correct: boolean;
  direction: string;
  route: string;
  station: SubwayStationId;
};

type TrainRig = {
  root: THREE.Group;
  doors: THREE.Group[];
  badgeMaterial: THREE.MeshBasicMaterial;
  badgeTexture: THREE.Texture;
  route: string;
  direction: string;
  correct: boolean;
  platformSide: -1 | 1;
};

type StationRig = {
  root: THREE.Group;
  spawn: THREE.Vector3;
  waypoint: THREE.Vector3;
};

function canvasTexture(width: number, height: number, draw: (context: CanvasRenderingContext2D, width: number, height: number) => void) {
  if (typeof document === "undefined") {
    const texture = new THREE.DataTexture(new Uint8Array([18, 20, 19, 255]), 1, 1, THREE.RGBAFormat); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true; return texture;
  }
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const context = canvas.getContext("2d"); if (!context) throw new Error("SubwayWorld requires a canvas context"); draw(context, width, height);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; return texture;
}

function stationSignTexture(title: string, lines: string[], accent: string) {
  return canvasTexture(1536, 384, (context, width, height) => {
    const gradient = context.createLinearGradient(0, 0, width, height); gradient.addColorStop(0, "#111412"); gradient.addColorStop(1, "#252a26");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height); context.fillStyle = accent; context.fillRect(0, 0, 22, height);
    context.strokeStyle = "rgba(255,255,255,.22)"; context.lineWidth = 8; context.strokeRect(10, 10, width - 20, height - 20);
    context.textBaseline = "middle"; context.textAlign = "left"; context.fillStyle = "#f3f1e8"; context.font = "700 94px Helvetica, Arial, sans-serif"; context.fillText(title, 76, 118);
    context.fillStyle = "rgba(243,241,232,.72)"; context.font = "650 38px Helvetica, Arial, sans-serif"; context.letterSpacing = "5px";
    lines.forEach((line, index) => context.fillText(line, 80, 226 + index * 58));
  });
}

function trainBadgeTexture(route: string, direction: string, color: string) {
  return canvasTexture(768, 256, (context, width, height) => {
    context.fillStyle = "#0b0c0c"; context.fillRect(0, 0, width, height);
    context.beginPath(); context.arc(105, height / 2, 76, 0, Math.PI * 2); context.fillStyle = color; context.fill();
    context.fillStyle = "#fff"; context.textAlign = "center"; context.textBaseline = "middle"; context.font = "800 92px Helvetica, Arial, sans-serif"; context.fillText(route, 105, height / 2 + 3);
    context.textAlign = "left"; context.font = "700 31px Helvetica, Arial, sans-serif"; context.letterSpacing = "3px"; context.fillText(direction, 210, height / 2);
  });
}

function addTextPanel(parent: THREE.Group, texture: THREE.Texture, position: [number, number, number], scale: [number, number], rotationY = 0) {
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: .48, metalness: .02, side: THREE.DoubleSide, toneMapped: false });
  const mesh = new THREE.Mesh(new RoundedBoxGeometry(scale[0], scale[1], .08, 3, .025), material); mesh.position.set(...position); mesh.rotation.y = rotationY; mesh.castShadow = true; parent.add(mesh); return mesh;
}

function addNpc(parent: THREE.Group, x: number, z: number, palette: [string, string], facing = 0) {
  const npc = new THREE.Group(); npc.name = "subway-passenger"; npc.position.set(x, 0, z); npc.rotation.y = facing;
  const coat = new THREE.MeshStandardMaterial({ color: palette[0], roughness: .82 }), skin = new THREE.MeshStandardMaterial({ color: palette[1], roughness: .88 }), dark = new THREE.MeshStandardMaterial({ color: "#1a1a19", roughness: .78 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .72, 6, 14), coat); torso.position.y = 1.16; npc.add(torso);
  const head = new THREE.Mesh(new THREE.SphereGeometry(.22, 18, 12), skin); head.position.y = 1.92; npc.add(head);
  const hair = new THREE.Mesh(new THREE.SphereGeometry(.226, 18, 12, 0, Math.PI * 2, 0, Math.PI * .58), dark); hair.position.y = 2.015; npc.add(hair);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .48, 5, 10), coat); arm.position.set(side * .34, 1.18, 0); arm.rotation.z = side * -.12; npc.add(arm);
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .58, 5, 10), dark); leg.position.set(side * .13, .43, 0); npc.add(leg);
    const shoe = new THREE.Mesh(new RoundedBoxGeometry(.18, .1, .32, 2, .035), dark); shoe.position.set(side * .13, .07, -.07); npc.add(shoe);
  }
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(.2, .035, 7, 18), new THREE.MeshStandardMaterial({ color: "#d2b371", roughness: .76 })); scarf.rotation.x = Math.PI / 2; scarf.position.y = 1.68; npc.add(scarf);
  const bag = new THREE.Mesh(new RoundedBoxGeometry(.3, .42, .14, 3, .04), dark); bag.position.set(.34, 1.02, .02); npc.add(bag);
  npc.traverse(object => { if (object instanceof THREE.Mesh) object.castShadow = true; }); parent.add(npc); return npc;
}

function addStairs(parent: THREE.Group, x: number, side: -1 | 1, material: THREE.Material) {
  const steps = 16;
  for (let index = 0; index < steps; index++) {
    const amount = index / (steps - 1), step = new THREE.Mesh(new RoundedBoxGeometry(4.2, .14, .58, 2, .025), material);
    step.position.set(x, amount * 4 - .07, THREE.MathUtils.lerp(4.4, 13.6, amount)); step.receiveShadow = true; parent.add(step);
  }
  const railMaterial = new THREE.MeshStandardMaterial({ color: "#747b78", metalness: .9, roughness: .2 });
  for (const railSide of [-1, 1]) {
    const start = new THREE.Vector3(x + railSide * 1.85, .72, 4.3), end = new THREE.Vector3(x + railSide * 1.85, 4.72, 13.8), direction = end.clone().sub(start);
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, direction.length(), 10), railMaterial); rail.position.copy(start).add(end).multiplyScalar(.5); rail.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()); rail.castShadow = true; parent.add(rail);
  }
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(.15, .45, 12), new THREE.MeshBasicMaterial({ color: side < 0 ? "#d9ef8b" : "#e6a85e" })); arrow.position.set(x, 4.25, 14.05); arrow.rotation.x = side < 0 ? Math.PI : 0; parent.add(arrow);
}

function buildTrain(textures: GameTextures, route: string, direction: string, correct: boolean, trackX: number) {
  const root = new THREE.Group(); root.name = `${route}-${correct ? "correct" : "wrong"}-train`;
  const platformSide: -1 | 1 = trackX < 0 ? -1 : 1;
  const steel = new THREE.MeshStandardMaterial({ color: "#c7cdca", metalness: .54, roughness: .36, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .012 });
  const dark = new THREE.MeshStandardMaterial({ color: "#161b1c", metalness: .48, roughness: .28 }), glass = new THREE.MeshPhysicalMaterial({ color: "#263b44", roughness: .08, metalness: .15, transmission: .18, transparent: true, opacity: .82 });
  // Two trains share the four-metre track bed. A real two-track loading gauge
  // leaves a visible gap between cars rather than allowing their bodies to
  // intersect at the centre line.
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.12, 3.08, 19.5, 5, .18), steel); body.position.y = 1.7; body.castShadow = true; root.add(body);
  const stripeMaterial = new THREE.MeshStandardMaterial({ color: "#315a78", roughness: .5, metalness: .2 });
  for (const side of [-1, 1]) { const stripe = new THREE.Mesh(new RoundedBoxGeometry(.045, .23, 18.5, 2, .015), stripeMaterial); stripe.position.set(side * 1.075, 1.1, 0); root.add(stripe); }
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.98, .22, 19.1, 4, .09), dark); roof.position.y = 3.28; root.add(roof);
  const doors: THREE.Group[] = [];
  for (const side of [-1, 1]) for (const z of [-6.1, 0, 6.1]) {
    const pair = new THREE.Group(); pair.position.set(side * 1.071, 1.62, z); pair.rotation.y = side * Math.PI / 2;
    for (const half of [-1, 1]) {
      const door = new THREE.Mesh(new RoundedBoxGeometry(1.1, 2.36, .07, 3, .035), steel); door.position.x = half * .56;
      const doorWindow = new THREE.Mesh(new RoundedBoxGeometry(.54, .68, .025, 3, .035), glass); doorWindow.position.set(0, .4, .055); door.add(doorWindow); pair.add(door);
    }
    pair.userData.platformFacing = side === platformSide; root.add(pair); doors.push(pair);
  }
  for (const side of [-1, 1]) for (const z of [-8.25, -3.1, 3.1, 8.25]) { const window = new THREE.Mesh(new RoundedBoxGeometry(1.18, .9, .045, 3, .04), glass); window.position.set(side * 1.095, 2.15, z); window.rotation.y = side * Math.PI / 2; root.add(window); }
  const badgeTexture = trainBadgeTexture(route, direction, route === "5" ? "#00933c" : route === "R" || route === "W" ? "#fccc0a" : "#fccc0a");
  const badgeMaterial = new THREE.MeshBasicMaterial({ map: badgeTexture, toneMapped: false });
  const badge = new THREE.Mesh(new THREE.PlaneGeometry(1.95, .65), badgeMaterial); badge.position.set(platformSide * 1.108, 2.72, -5.2); badge.rotation.y = platformSide * Math.PI / 2; root.add(badge);
  root.position.x = trackX; return { root, doors, badgeMaterial, badgeTexture, route, direction, correct, platformSide } satisfies TrainRig;
}

function buildStation(id: SubwayStationId, textures: GameTextures, adTextures: THREE.Texture[], ownedTextures: THREE.Texture[]) {
  const root = new THREE.Group(); root.name = `station-${id.toLowerCase()}`;
  const isFifth = id === "FIFTH_AV", isLex = id === "LEXINGTON";
  const tile = new THREE.MeshStandardMaterial({ color: isFifth ? "#d9d2bd" : isLex ? "#cdbb9d" : "#c5d1cf", roughness: .86, map: textures.ground, bumpMap: textures.ground, bumpScale: .025 });
  const floor = new THREE.MeshStandardMaterial({ color: "#77736a", roughness: .95, map: textures.gravel, bumpMap: textures.gravel, bumpScale: .03 });
  const edge = new THREE.MeshStandardMaterial({ color: "#e3b93f", roughness: .74 }), steel = new THREE.MeshStandardMaterial({ color: "#333b39", metalness: .78, roughness: .35 });
  const ceiling = new THREE.MeshStandardMaterial({ color: "#242926", roughness: .94 }), track = new THREE.MeshStandardMaterial({ color: "#292b29", roughness: .92, metalness: .3 });
  const platformY = 0;
  for (const side of [-1, 1]) {
    const platform = new THREE.Mesh(new RoundedBoxGeometry(5.6, .35, 50, 2, .04), floor); platform.position.set(side * 5.1, platformY - .19, -7); platform.receiveShadow = true; root.add(platform);
    const tactile = new THREE.Mesh(new RoundedBoxGeometry(.42, .08, 48, 2, .02), edge); tactile.position.set(side * 2.35, .04, -7); root.add(tactile);
    for (let z = -28; z <= 14; z += 5.3) { const column = new THREE.Mesh(new THREE.CylinderGeometry(.15, .18, 4.7, 14), steel); column.position.set(side * 6.8, 2.25, z); column.castShadow = true; root.add(column); }
  }
  const trackBed = new THREE.Mesh(new RoundedBoxGeometry(4.4, .18, 52, 2, .02), track); trackBed.position.set(0, -.62, -7); root.add(trackBed);
  for (const x of [-1.2, 1.2]) { const rail = new THREE.Mesh(new RoundedBoxGeometry(.09, .11, 52, 2, .02), steel); rail.position.set(x, -.38, -7); root.add(rail); }
  const concourse = new THREE.Mesh(new RoundedBoxGeometry(17, .38, 10, 2, .04), floor); concourse.position.set(0, 3.81, 17.2); concourse.receiveShadow = true; root.add(concourse);
  // The concourse sits four metres above the platforms, so a single flat roof
  // intersected the upper floor and placed its spawn point above the ceiling.
  const platformRoof = new THREE.Mesh(new RoundedBoxGeometry(18, .4, 40, 2, .04), ceiling); platformRoof.position.set(0, 5.1, -9); root.add(platformRoof);
  const concourseRoof = new THREE.Mesh(new RoundedBoxGeometry(18, .4, 12, 2, .04), ceiling); concourseRoof.position.set(0, 7.45, 17); root.add(concourseRoof);
  for (const side of [-1, 1]) {
    const platformWall = new THREE.Mesh(new RoundedBoxGeometry(.3, 4.7, 50, 2, .04), tile); platformWall.position.set(side * 8.3, 2.25, -7); platformWall.receiveShadow = true; root.add(platformWall);
    const concourseWall = new THREE.Mesh(new RoundedBoxGeometry(.3, 3.25, 10, 2, .04), tile); concourseWall.position.set(side * 8.3, 5.55, 17.2); concourseWall.receiveShadow = true; root.add(concourseWall);
  }
  addStairs(root, -5.1, -1, tile); addStairs(root, 5.1, 1, tile);
  const title = isFifth ? "5 AV / 59 ST" : isLex ? "LEXINGTON AV / 59 ST" : "WEST FARMS SQ / E TREMONT AV";
  const lines = isFifth ? ["QUEENS-BOUND  N  R  ←", "DOWNTOWN / BROOKLYN  W  →"] : isLex ? ["TRANSFER TO UPTOWN / BRONX  4  5  6  ←", "DOWNTOWN & BROOKLYN  →"] : ["EXIT · BOSTON RD / E 178 ST", "BRONX ZOO · ASIA GATE"];
  const signTexture = stationSignTexture(title, lines, isFifth ? "#fccc0a" : isLex ? "#00933c" : "#5f8f82"); ownedTextures.push(signTexture);
  // Keep the sign between the two stair openings. The former full-width panel
  // physically cut through both flights at eye level.
  addTextPanel(root, signTexture, [0, 3.45, 12], [4.75, 1.2], 0);
  for (const side of [-1, 1]) for (let index = 0; index < 2; index++) {
    const texture = adTextures[(index + (side > 0 ? 1 : 0)) % adTextures.length];
    const ad = addTextPanel(root, texture, [side * 8.02, 2.25, -2 - index * 11], [2.65, 4], side > 0 ? -Math.PI / 2 : Math.PI / 2); ad.name = "sloth-themed-subway-ad";
  }
  const benchMaterial = new THREE.MeshStandardMaterial({ color: "#7b4d32", roughness: .68, metalness: .12 });
  for (const side of [-1, 1]) { const bench = new THREE.Mesh(new RoundedBoxGeometry(1.1, .18, 3.3, 3, .05), benchMaterial); bench.position.set(side * 6, .68, -12); bench.rotation.y = Math.PI / 2; root.add(bench); }
  addNpc(root, -6.1, -9, ["#7a463f", "#986e59"], .3); addNpc(root, 5.7, -17, ["#31566a", "#d0a27d"], -2.7); addNpc(root, 6.2, 5.5, ["#6c6544", "#704c38"], -1.4);
  if (id === "WEST_FARMS") {
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(48, 14), new THREE.MeshBasicMaterial({ color: "#9ab7bd" })); sky.position.set(0, 3, -31); root.add(sky);
    const artMaterial = new THREE.MeshPhysicalMaterial({ color: "#80a895", transparent: true, opacity: .72, roughness: .16, transmission: .22 });
    for (let index = 0; index < 14; index++) { const pane = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 2.4), artMaterial); pane.position.set(-8 + index * 1.22, 2.4, -25); pane.rotation.z = Math.sin(index * 2.1) * .18; root.add(pane); }
  }
  const spawn = id === "WEST_FARMS" ? new THREE.Vector3(-5, 1.48, -10) : new THREE.Vector3(0, 5.48, 18.5);
  const waypoint = id === "WEST_FARMS" ? new THREE.Vector3(0, 4, 18) : new THREE.Vector3(-5, 0, 0);
  return { root, spawn, waypoint } satisfies StationRig;
}

export class SubwayWorld {
  readonly root = new THREE.Group();
  readonly stations = new Map<SubwayStationId, StationRig>();
  readonly correctTrain: TrainRig;
  readonly wrongTrain: TrainRig;
  readonly ownedTextures: THREE.Texture[] = [];
  stationId: SubwayStationId = "FIFTH_AV";
  trainPhase: TrainPhase = "APPROACHING";
  secondsToTrain = 4;
  doorsOpen = false;
  private serviceCycle = -1;

  constructor(scene: THREE.Scene, textures: GameTextures) {
    this.root.name = "premium-nyc-subway-campaign"; scene.add(this.root);
    const loader = new THREE.TextureLoader();
    const adTextures = [loader.load("/game/ads/slow-superpower.webp"), loader.load("/game/ads/branch-out.webp")];
    adTextures.forEach(texture => { texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 4; }); this.ownedTextures.push(...adTextures);
    for (const id of ["FIFTH_AV", "LEXINGTON", "WEST_FARMS"] as const) { const station = buildStation(id, textures, adTextures, this.ownedTextures); station.root.visible = false; this.stations.set(id, station); this.root.add(station.root); }
    this.correctTrain = buildTrain(textures, "N", "QUEENS-BOUND", true, -1.1); this.wrongTrain = buildTrain(textures, "W", "DOWNTOWN / BROOKLYN", false, 1.1); this.root.add(this.correctTrain.root, this.wrongTrain.root);
    const ambient = new THREE.HemisphereLight("#e9eee5", "#394039", 1.08), fill = new THREE.AmbientLight("#c8d1c7", .48);
    this.root.add(ambient, fill);
    const fluorescent = new THREE.MeshBasicMaterial({ color: "#eaf5df", toneMapped: false });
    for (const z of [-24, -12, 0, 12]) {
      const strip = new THREE.Mesh(new RoundedBoxGeometry(9.4, .07, .22, 2, .025), fluorescent); strip.position.set(0, 4.82, z); this.root.add(strip);
      for (const x of [-4.6, 4.6]) { const fixture = new THREE.PointLight("#e5f1d3", 38, 18, 1.25); fixture.position.set(x, 4.5, z); this.root.add(fixture); }
    }
    const concourseStrip = new THREE.Mesh(new RoundedBoxGeometry(9.4, .07, .22, 2, .025), fluorescent); concourseStrip.position.set(0, 7.15, 17); this.root.add(concourseStrip);
    for (const x of [-4.6, 4.6]) { const fixture = new THREE.PointLight("#e5f1d3", 34, 16, 1.25); fixture.position.set(x, 6.9, 17); this.root.add(fixture); }
    this.setStation("FIFTH_AV");
  }

  get spawn() { return this.stations.get(this.stationId)!.spawn; }
  get waypoint() { return this.stations.get(this.stationId)!.waypoint; }

  setStation(id: SubwayStationId) {
    this.stationId = id; for (const [stationId, station] of this.stations) station.root.visible = stationId === id;
    const westFarms = id === "WEST_FARMS"; this.correctTrain.root.visible = this.wrongTrain.root.visible = !westFarms; this.serviceCycle = -1;
    if (id === "LEXINGTON") {
      this.configureTrain(this.correctTrain, "5", "UPTOWN / BRONX", true, "#00933c");
      this.configureTrain(this.wrongTrain, "5", "DOWNTOWN / BROOKLYN", false, "#00933c");
    } else if (id === "FIFTH_AV") {
      this.configureTrain(this.correctTrain, "N", "QUEENS-BOUND", true, "#fccc0a");
      this.configureTrain(this.wrongTrain, "W", "DOWNTOWN / BROOKLYN", false, "#fccc0a");
    }
    this.setDoorAmount(this.correctTrain, 0); this.setDoorAmount(this.wrongTrain, 0); this.doorsOpen = false;
    this.correctTrain.root.position.z = -42; this.wrongTrain.root.position.z = 42;
    this.root.updateMatrixWorld(true); return this;
  }

  private configureTrain(train: TrainRig, route: string, direction: string, correct: boolean, color: string) {
    if (train.route === route && train.direction === direction && train.correct === correct) return;
    train.badgeTexture.dispose(); train.badgeTexture = trainBadgeTexture(route, direction, color); train.badgeMaterial.map = train.badgeTexture; train.badgeMaterial.needsUpdate = true; train.route = route; train.direction = direction; train.correct = correct;
  }

  private setDoorAmount(train: TrainRig, amount: number) {
    const opening = THREE.MathUtils.clamp(amount, 0, 1) * .47;
    for (const pair of train.doors) {
      // The centre-facing doors stay closed: there is no platform between the
      // two tracks, and opening them invited the player into moving traffic.
      const pairOpening = pair.userData.platformFacing === true ? opening : 0;
      pair.children[0].position.x = -.56 - pairOpening;
      pair.children[1].position.x = .56 + pairOpening;
    }
  }

  private staircaseAt(x: number) {
    const absoluteX = Math.abs(x);
    return absoluteX >= 2.85 && absoluteX <= 7.35;
  }

  floorHeight(x: number, z: number) {
    if (z >= 13.6) return 4;
    if (z > 4.3 && this.staircaseAt(x)) return THREE.MathUtils.clamp((z - 4.3) / 9.3 * 4, 0, 4);
    return 0;
  }

  resolvePlayer(player: THREE.Vector3, velocity: THREE.Vector3) {
    player.x = THREE.MathUtils.clamp(player.x, -8.15, 8.15); player.z = THREE.MathUtils.clamp(player.z, -29, 21);
    if (player.z < 13.6 && player.z > 4.15 && !this.staircaseAt(player.x)) {
      const absoluteX = Math.abs(player.x), side = player.x <= 0 ? -1 : 1;
      if (absoluteX >= 2.15) { player.x = side * THREE.MathUtils.clamp(absoluteX, 2.85, 7.35); velocity.x = 0; }
      else { player.z = player.z >= 8.95 ? 13.6 : 4.15; velocity.z = 0; }
    }
    if (player.z <= 4.15 && Math.abs(player.x) < 2.25) { const side = player.x <= 0 ? -1 : 1; player.x = side * 2.25; velocity.x = 0; }
    player.y = this.floorHeight(player.x, player.z) + 1.48;
  }

  update(elapsed: number) {
    if (this.stationId === "WEST_FARMS") { this.trainPhase = "AWAY"; this.doorsOpen = false; this.secondsToTrain = 0; this.correctTrain.root.visible = this.wrongTrain.root.visible = false; return; }
    const cycleNumber = Math.floor(elapsed / SUBWAY_TRAIN_INTERVAL_SECONDS);
    if (this.stationId === "FIFTH_AV" && cycleNumber !== this.serviceCycle) {
      // Successive 30-second arrivals alternate the two valid Broadway-line
      // services, so the authored N / R objective is true in play as well as UI.
      const route = cycleNumber % 2 === 0 ? "N" : "R";
      this.configureTrain(this.correctTrain, route, "QUEENS-BOUND", true, "#fccc0a");
    }
    this.serviceCycle = cycleNumber;
    const cycle = elapsed % SUBWAY_TRAIN_INTERVAL_SECONDS;
    let z = 42;
    if (cycle < 4) { this.trainPhase = "APPROACHING"; z = THREE.MathUtils.lerp(-42, 0, cycle / 4); this.secondsToTrain = Math.ceil(4 - cycle); }
    else if (cycle < 16) { this.trainPhase = "BOARDING"; z = 0; this.secondsToTrain = 0; }
    else if (cycle < 21) { this.trainPhase = "DEPARTING"; z = THREE.MathUtils.lerp(0, 46, (cycle - 16) / 5); this.secondsToTrain = Math.ceil(SUBWAY_TRAIN_INTERVAL_SECONDS + 4 - cycle); }
    else { this.trainPhase = "AWAY"; this.secondsToTrain = Math.ceil(SUBWAY_TRAIN_INTERVAL_SECONDS + 4 - cycle); }
    this.doorsOpen = cycle >= 5 && cycle < 15;
    for (const train of [this.correctTrain, this.wrongTrain]) {
      train.root.visible = this.trainPhase !== "AWAY"; train.root.position.z = train.correct ? z : -z;
      train.root.position.y = -.08 + Math.sin(elapsed * 8 + (train.correct ? 0 : 1)) * .008;
      this.setDoorAmount(train, this.doorsOpen ? 1 : 0);
    }
  }

  /** Closes the doors, hides the other service, and moves the boarded train out. */
  updateRide(option: BoardingOption, progress: number, elapsed: number) {
    const train = option.correct ? this.correctTrain : this.wrongTrain;
    const other = option.correct ? this.wrongTrain : this.correctTrain;
    const amount = THREE.MathUtils.clamp(progress, 0, 1);
    train.root.visible = true; other.root.visible = false;
    this.setDoorAmount(train, 1 - THREE.MathUtils.smoothstep(amount, 0, .18));
    train.root.position.z = (train.correct ? 1 : -1) * THREE.MathUtils.smoothstep(amount, .16, 1) * 42;
    train.root.position.y = -.08 + Math.sin(elapsed * 8 + (train.correct ? 0 : 1)) * .008;
    this.doorsOpen = amount < .18;
    this.trainPhase = amount < .18 ? "BOARDING" : "DEPARTING";
    train.root.updateMatrixWorld(true);
  }

  boardingOption(player: THREE.Vector3): BoardingOption | null {
    if (!this.doorsOpen || this.stationId === "WEST_FARMS") return null;
    const correctDoor = new THREE.Vector3(this.correctTrain.root.position.x + this.correctTrain.platformSide * 1.071, 1.48, this.correctTrain.root.position.z);
    const wrongDoor = new THREE.Vector3(this.wrongTrain.root.position.x + this.wrongTrain.platformSide * 1.071, 1.48, this.wrongTrain.root.position.z);
    const correctDistance = Math.hypot(player.x - correctDoor.x, player.z - correctDoor.z), wrongDistance = Math.hypot(player.x - wrongDoor.x, player.z - wrongDoor.z);
    const train = correctDistance <= wrongDistance ? this.correctTrain : this.wrongTrain, distance = Math.min(correctDistance, wrongDistance);
    return distance < 2.15 ? { correct: train.correct, direction: train.direction, route: train.route, station: this.stationId } : null;
  }

  dispose() {
    this.root.removeFromParent();
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    this.root.traverse(object => { if (!(object instanceof THREE.Mesh)) return; geometries.add(object.geometry); const meshMaterials = Array.isArray(object.material) ? object.material : [object.material]; meshMaterials.forEach(material => materials.add(material)); });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose());
    this.correctTrain.badgeTexture.dispose(); this.wrongTrain.badgeTexture.dispose(); this.ownedTextures.forEach(texture => texture.dispose());
  }
}
