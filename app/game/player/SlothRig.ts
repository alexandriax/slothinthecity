import * as THREE from "three";

export type SlothVehicleGripTargets = {
  left: THREE.Vector3;
  right: THREE.Vector3;
};

export type SlothRig = {
  root: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  animate(time: number, speed: number, gripping: boolean): void;
  setVehiclePose(mode: "none" | "cart" | "rowboat", steering?: number, oarPhase?: number, rowingEffort?: number, gripTargets?: SlothVehicleGripTargets): void;
};

type ArmJoints = {
  elbow: THREE.Group;
  wrist: THREE.Group;
  digits: THREE.Group[];
};

const CLAW_ROOT = new THREE.Color("#cdbb8f");
const CLAW_BODY = new THREE.Color("#eadbb7");
const CLAW_TIP = new THREE.Color("#fff3d2");

/**
 * Builds a smooth elliptical tube around a curve. The ellipse keeps the limbs
 * organic rather than pipe-like and makes the keratin claws blade-thin in the
 * lateral direction, as on a three-toed sloth.
 */
function sweptGeometry(
  curve: THREE.Curve<THREE.Vector3>,
  segments: number,
  radialSegments: number,
  radiusAt: (t: number) => number,
  ellipse = .84,
  colorAt?: (t: number, target: THREE.Color) => THREE.Color,
  capStart = true,
  capEnd = true,
) {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const point = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const surfaceNormal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const capA = new THREE.Vector3();
  const capB = new THREE.Vector3();
  const capNormal = new THREE.Vector3();
  const color = new THREE.Color();
  const ringSize = radialSegments + 1;
  const capVertexRanges: Array<{ start: number; count: number }> = [];

  for (let segment = 0; segment <= segments; segment++) {
    const t = segment / segments;
    const radius = radiusAt(t);
    curve.getPointAt(t, point);

    for (let radial = 0; radial <= radialSegments; radial++) {
      const u = radial / radialSegments;
      const angle = u * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);

      offset.copy(frames.normals[segment]).multiplyScalar(cosine * radius * ellipse);
      offset.addScaledVector(frames.binormals[segment], sine * radius);
      positions.push(point.x + offset.x, point.y + offset.y, point.z + offset.z);

      surfaceNormal.copy(frames.normals[segment]).multiplyScalar(cosine / ellipse);
      surfaceNormal.addScaledVector(frames.binormals[segment], sine).normalize();
      normals.push(surfaceNormal.x, surfaceNormal.y, surfaceNormal.z);
      uvs.push(u, t);

      if (colorAt) {
        colorAt(t, color);
        colors.push(color.r, color.g, color.b);
      }

      if (segment < segments && radial < radialSegments) {
        const current = segment * ringSize + radial;
        const next = current + ringSize;
        indices.push(current, next, current + 1, current + 1, next, next + 1);
      }
    }
  }

  // Close both tube ends. The viewmodel uses articulated overlapping sweeps,
  // and an uncapped ring can become a conspicuous sky-colored hole as a child
  // joint rotates—especially in the tighter portrait framing.
  const addCap = (segment: number, t: number, direction: -1 | 1) => {
    curve.getPointAt(t, point);
    curve.getTangentAt(t, tangent).normalize().multiplyScalar(direction);
    const ring = segment * ringSize;
    const capRing = positions.length / 3;
    const radius = Math.max(radiusAt(t), .0001);
    for (let radial = 0; radial <= radialSegments; radial++) {
      const source = ring + radial;
      capA.fromArray(positions, source * 3);
      positions.push(capA.x, capA.y, capA.z);
      normals.push(tangent.x, tangent.y, tangent.z);
      offset.copy(capA).sub(point);
      uvs.push(
        .5 + offset.dot(frames.normals[segment]) / (radius * ellipse * 2),
        .5 + offset.dot(frames.binormals[segment]) / (radius * 2),
      );
      if (colorAt) {
        colorAt(t, color);
        colors.push(color.r, color.g, color.b);
      }
    }

    const center = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    normals.push(tangent.x, tangent.y, tangent.z);
    uvs.push(.5, .5);
    if (colorAt) {
      colorAt(t, color);
      colors.push(color.r, color.g, color.b);
    }
    capVertexRanges.push({ start: capRing, count: radialSegments + 2 });

    capA.fromArray(positions, capRing * 3).sub(point);
    capB.fromArray(positions, (capRing + 1) * 3).sub(point);
    const forwardWinding = capNormal.crossVectors(capA, capB).dot(tangent) >= 0;
    for (let radial = 0; radial < radialSegments; radial++) {
      const current = capRing + radial;
      const next = current + 1;
      if (forwardWinding) indices.push(center, current, next);
      else indices.push(center, next, current);
    }
  };

  if (capStart) addCap(0, 0, -1);
  if (capEnd) addCap(segments, 1, 1);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  if (colors.length) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.userData.sweep = {
    segments,
    radialSegments,
    sideVertexCount: (segments + 1) * ringSize,
    capVertexRanges,
  };
  geometry.computeBoundingSphere();
  return geometry;
}

function furSegment(
  end: THREE.Vector3,
  bendA: THREE.Vector3,
  bendB: THREE.Vector3,
  baseRadius: number,
  tipRadius: number,
  material: THREE.Material,
  segments = 36,
  start = new THREE.Vector3(),
) {
  const curve = new THREE.CubicBezierCurve3(start, bendA, bendB, end);
  const geometry = sweptGeometry(
    curve,
    segments,
    28,
    (t) => {
      const taper = THREE.MathUtils.smootherstep(t, 0, 1);
      const muscle = Math.sin(Math.PI * t) * baseRadius * .12;
      return THREE.MathUtils.lerp(baseRadius, tipRadius, taper) + muscle;
    },
    .82,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = false;
  return mesh;
}

function pawSegment(side: number, material: THREE.Material) {
  const curve = new THREE.CubicBezierCurve3(
    // Begin behind the wrist pivot so the palm remains embedded in its blend
    // volume throughout the full articulated rotation range.
    new THREE.Vector3(side * .004, -.052, .012),
    new THREE.Vector3(-side * .004, .038, .002),
    new THREE.Vector3(-side * .018, .145, -.018),
    new THREE.Vector3(-side * .019, .205, -.031),
  );
  const geometry = sweptGeometry(
    curve,
    54,
    34,
    (t) => {
      // Tendon at the wrist, a single muscular palm bulge, then the compact
      // distal pad from which all three hooks emerge.
      const wrist = THREE.MathUtils.lerp(.094, .058, t);
      return wrist + Math.sin(Math.PI * t) * .024 + Math.sin(Math.PI * Math.min(1, t * 1.35)) * .005;
    },
    .7,
  );
  const paw = new THREE.Mesh(geometry, material);
  paw.castShadow = true;
  paw.receiveShadow = false;
  paw.frustumCulled = false;
  return paw;
}

function addFurShell(parent: THREE.Object3D, mesh: THREE.Mesh, fringe: THREE.Material) {
  parent.add(mesh);
  const shell = new THREE.Mesh(mesh.geometry, fringe);
  shell.scale.set(1.045, 1, 1.045);
  shell.castShadow = true;
  shell.frustumCulled = false;
  shell.renderOrder = 21;
  parent.add(shell);
}

function addEllipsoidShell(parent: THREE.Object3D, mesh: THREE.Mesh, fringe: THREE.Material) {
  const shell = new THREE.Mesh(mesh.geometry, fringe);
  shell.position.copy(mesh.position);
  shell.rotation.copy(mesh.rotation);
  shell.scale.copy(mesh.scale).multiplyScalar(1.045);
  shell.castShadow = true;
  shell.frustumCulled = false;
  shell.renderOrder = 21;
  parent.add(shell);
}

function clawColor(t: number, target: THREE.Color) {
  if (t < .28) return target.lerpColors(CLAW_ROOT, CLAW_BODY, t / .28);
  return target.lerpColors(CLAW_BODY, CLAW_TIP, THREE.MathUtils.smoothstep(t, .28, 1));
}

function hookedClawGeometry(length: number, lateralDrift: number, hookBias: number) {
  // A readable C/J profile lives in screen space while the latter half rolls
  // forward through depth. This preserves the hook silhouette without making
  // the claws look like flat crescents pasted onto the paw.
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, 0, .006),
    new THREE.Vector3(lateralDrift * .14, length * .58, -length * .1),
    new THREE.Vector3(lateralDrift * .68, length * .48, -length * (.5 + hookBias)),
    new THREE.Vector3(lateralDrift, -length * .24, -length * (.82 + hookBias * .24)),
  );
  return sweptGeometry(
    curve,
    56,
    24,
    (t) => {
      const rootFlare = Math.exp(-t * 11) * .003;
      return .0155 * Math.pow(Math.max(0, 1 - t), .68) + rootFlare + .0002;
    },
    .38,
    clawColor,
  );
}

function makeClaw(
  index: number,
  side: number,
  keratin: THREE.Material,
) {
  const clawJoint = new THREE.Group();
  const outer = Math.abs(index);
  clawJoint.rotation.z = -index * .055 + side * .009;
  clawJoint.rotation.y = side * (.13 + outer * .035);
  clawJoint.rotation.x = outer * -.035;
  const clawLength = .19 - outer * .014 + index * side * .004;
  const claw = new THREE.Mesh(
    hookedClawGeometry(clawLength, index * .014 - side * .006, outer * .026),
    keratin,
  );
  claw.castShadow = true;
  claw.receiveShadow = true;
  claw.frustumCulled = false;
  clawJoint.add(claw);
  return clawJoint;
}

function makeArm(
  side: number,
  fur: THREE.Material,
  keratin: THREE.Material,
  fringe: THREE.Material,
) {
  const shoulder = new THREE.Group();
  // A single uninterrupted sweep now runs from below the camera mount to the
  // elbow. Besides removing two permanent viewmodel draw calls per arm, this
  // makes the proximal silhouette truly contiguous rather than merely hidden
  // by an overlap sphere.
  const proximalStart = new THREE.Vector3(side * .05, -.46, .075);
  const upperEnd = new THREE.Vector3(-side * .018, .35, -.046);
  const upperArm = furSegment(
    upperEnd,
    new THREE.Vector3(side * .035, -.24, .05),
    new THREE.Vector3(-side * .008, .19, .008),
    .195,
    .119,
    fur,
    54,
    proximalStart,
  );
  upperArm.name = "continuous-upper-arm";
  upperArm.frustumCulled = false;
  addFurShell(shoulder, upperArm, fringe);

  const elbow = new THREE.Group();
  elbow.position.copy(upperEnd);
  const elbowMass = new THREE.Mesh(new THREE.SphereGeometry(1, 34, 24), fur);
  elbowMass.scale.set(.116, .16, .096);
  elbowMass.castShadow = true;
  elbowMass.receiveShadow = false;
  elbowMass.frustumCulled = false;
  elbow.add(elbowMass);
  addEllipsoidShell(elbow, elbowMass, fringe);
  shoulder.add(elbow);

  const wristEnd = new THREE.Vector3(-side * .032, .36, -.10);
  const forearm = furSegment(
    wristEnd,
    new THREE.Vector3(-side * .015, .105, -.008),
    new THREE.Vector3(-side * .038, .265, -.052),
    .125,
    .086,
    fur,
    42,
  );
  forearm.name = "continuous-forearm-sweep";
  forearm.frustumCulled = false;
  addFurShell(elbow, forearm, fringe);

  // This textured blend volume overlaps both the forearm's closed end and the
  // paw's extended root. Because it lives at the articulation pivot, wrist
  // rotation can no longer tear a wedge-shaped hole through the silhouette.
  const wristBlend = new THREE.Mesh(new THREE.SphereGeometry(1, 42, 30), fur);
  wristBlend.name = "continuous-wrist-blend";
  wristBlend.position.copy(wristEnd);
  wristBlend.scale.set(.108, .135, .10);
  wristBlend.castShadow = true;
  wristBlend.frustumCulled = false;
  elbow.add(wristBlend);
  addEllipsoidShell(elbow, wristBlend, fringe);

  const wrist = new THREE.Group();
  wrist.position.copy(wristEnd);
  wrist.rotation.y = side * .12;
  wrist.rotation.z = -side * .34;
  elbow.add(wrist);

  // One continuous swept paw replaces the former wrist/palm/digit ellipsoid
  // stack. Its overlap with the forearm is hidden in the same fur shell, so
  // bright station lighting no longer reveals toy-like seams.
  const paw = pawSegment(side, fur);
  paw.name = "continuous-paw-sweep";
  wrist.add(paw);
  addFurShell(wrist, paw, fringe);

  const digits: THREE.Group[] = [];
  for (let index = -1; index <= 1; index++) {
    const claw = makeClaw(index, side, keratin);
    // Roots overlap the fur cap so the hooks emerge from the paw rather than
    // appearing glued onto a visible set of human-like fingers.
    claw.position.set(-side * .019 + index * .027, .198 - Math.abs(index) * .007, -.039 + (index === 0 ? -.008 : 0));
    wrist.add(claw);
    digits.push(claw);
  }

  // The broad placement leaves negative space between the hands and lets the
  // long forelimbs enter naturally from the lower corners of the viewport.
  shoulder.position.set(side * .57, -.70, -.72);
  shoulder.rotation.set(-.045, side * -.025, side * .34);
  shoulder.userData.joints = { elbow, wrist, digits } satisfies ArmJoints;
  return shoulder;
}

export function createSlothRig(furTexture: THREE.Texture): SlothRig {
  const root = new THREE.Group();
  root.renderOrder = 20;
  // Match the first animated frame so entering play cannot introduce a large
  // camera-space drop. GameClient already handles arm placement and scaling.
  root.position.set(0, .012, -.02);

  const fur = new THREE.MeshPhysicalMaterial({
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: .032,
    color: "#b7aa98",
    roughness: .96,
    sheen: .32,
    sheenColor: new THREE.Color("#8d8373"),
    sheenRoughness: .9,
    emissive: new THREE.Color("#2a241e"),
    emissiveIntensity: .055,
  });
  const fringe = new THREE.MeshPhysicalMaterial({
    map: furTexture,
    alphaMap: furTexture,
    bumpMap: furTexture,
    bumpScale: .012,
    color: "#b8aa97",
    roughness: .98,
    sheen: .9,
    sheenColor: new THREE.Color("#938670"),
    sheenRoughness: .9,
    alphaTest: .3,
    transparent: true,
    opacity: .52,
    depthWrite: false,
  });
  const keratin = new THREE.MeshPhysicalMaterial({
    color: "#fff9e9",
    vertexColors: true,
    roughness: .4,
    clearcoat: .16,
    clearcoatRoughness: .5,
  });

  const left = makeArm(-1, fur, keratin, fringe);
  const right = makeArm(1, fur, keratin, fringe);
  root.add(left, right);

  const joints = (arm: THREE.Group) => arm.userData.joints as ArmJoints;
  const leftJoints = joints(left);
  const rightJoints = joints(right);
  let vehicleMode: "none" | "cart" | "rowboat" = "none";
  let vehicleSteering = 0;
  let vehicleOarPhase = 0;
  let vehicleRowingEffort = 0;
  let vehicleGripTargetsValid = false;
  const leftVehicleGrip = new THREE.Vector3();
  const rightVehicleGrip = new THREE.Vector3();
  const vehicleTarget = new THREE.Vector3();
  const vehicleChain = new THREE.Vector3();

  /**
   * Positions an articulated wrist at an authored camera-space grip point.
   * Solving the short two-joint chain from its live rotations avoids the old
   * hard-coded shoulder offsets, which let the paws cross at steering and
   * rowing extremes and drift away from the object they were meant to hold.
   */
  const placeWristAt = (arm: THREE.Group, armJoints: ArmJoints, target: THREE.Vector3) => {
    vehicleTarget.set(
      (target.x - root.position.x) / Math.max(.001, root.scale.x),
      (target.y - root.position.y) / Math.max(.001, root.scale.y),
      (target.z - root.position.z) / Math.max(.001, root.scale.z),
    );
    vehicleChain.copy(armJoints.wrist.position)
      .applyEuler(armJoints.elbow.rotation)
      .add(armJoints.elbow.position)
      .applyEuler(arm.rotation);
    arm.position.copy(vehicleTarget).sub(vehicleChain);
  };

  return {
    root,
    left,
    right,
    setVehiclePose(mode, steering = 0, oarPhase = 0, rowingEffort = 0, gripTargets) {
      vehicleMode = mode;
      vehicleSteering = THREE.MathUtils.clamp(steering, -1, 1);
      vehicleOarPhase = oarPhase;
      vehicleRowingEffort = THREE.MathUtils.clamp(rowingEffort, 0, 1);
      vehicleGripTargetsValid = mode !== "none" && Boolean(gripTargets);
      if (gripTargets) {
        leftVehicleGrip.copy(gripTargets.left);
        rightVehicleGrip.copy(gripTargets.right);
      }
    },
    animate(time, speed, gripping) {
      const stride = Math.min(1, speed / 4);
      const gait = Math.sin(time * 3.05);
      const breath = Math.sin(time * 1.35);
      const grip = gripping ? 1 : 0;
      const leftBaseX = left.userData.layoutX as number | undefined;
      const rightBaseX = right.userData.layoutX as number | undefined;
      const leftBaseY = left.userData.layoutY as number | undefined;
      const rightBaseY = right.userData.layoutY as number | undefined;
      const leftBaseDepth = left.userData.layoutDepth as number | undefined;
      const rightBaseDepth = right.userData.layoutDepth as number | undefined;

      // Establish the viewmodel anchor before solving vehicle grip points, so
      // locomotion bob never pulls a planted paw off a steering wheel or oar.
      root.position.y = .012 + breath * .004 + Math.sin(time * 5.15) * .004 * stride;
      root.position.z = -.02 - grip * .004;

      if (vehicleMode === "none") {
        if (leftBaseX !== undefined) left.position.x = leftBaseX;
        if (rightBaseX !== undefined) right.position.x = rightBaseX;
        if (leftBaseY !== undefined) left.position.y = leftBaseY;
        if (rightBaseY !== undefined) right.position.y = rightBaseY;
        if (leftBaseDepth !== undefined) left.position.z = leftBaseDepth;
        if (rightBaseDepth !== undefined) right.position.z = rightBaseDepth;
      }

      left.rotation.x = -.045 + gait * .022 * stride - grip * .03;
      right.rotation.x = -.045 - gait * .022 * stride - grip * .03;
      left.rotation.z = (left.userData.layoutZ ?? -.34) + breath * .006 + grip * .022;
      right.rotation.z = (right.userData.layoutZ ?? .34) - breath * .006 - grip * .022;

      leftJoints.elbow.rotation.x = -.018 - gait * .018 * stride - grip * .034;
      rightJoints.elbow.rotation.x = -.018 + gait * .018 * stride - grip * .034;
      leftJoints.wrist.rotation.x = -.025 + gait * .014 * stride - grip * .065;
      rightJoints.wrist.rotation.x = -.025 - gait * .014 * stride - grip * .065;
      const leftLayout = left.userData.layoutZ ?? -.34;
      const rightLayout = right.userData.layoutZ ?? .34;
      leftJoints.wrist.rotation.z = -leftLayout * .72 + breath * .004;
      rightJoints.wrist.rotation.z = -rightLayout * .72 - breath * .004;

      for (let index = 0; index < 3; index++) {
        const phase = time * 1.15 + index * .72;
        const leftDigit = leftJoints.digits[index];
        const rightDigit = rightJoints.digits[index];
        leftDigit.rotation.x = Math.abs(index - 1) * -.035 - grip * (.018 + index * .003) + Math.sin(phase) * .0025;
        rightDigit.rotation.x = Math.abs(index - 1) * -.035 - grip * (.022 - index * .003) + Math.sin(phase + .8) * .0025;
      }

      if (vehicleMode === "cart") {
        // Grip targets come from the rendered steering-wheel anchors after
        // their world transforms are projected through the live camera. This
        // keeps both paws attached through steering and unrestricted free-look.
        const wheelTurn = vehicleSteering * 1.161;
        left.rotation.set(-.22, 0, -.15);
        right.rotation.set(-.22, 0, .15);
        leftJoints.elbow.rotation.x = rightJoints.elbow.rotation.x = -.12;
        if (vehicleGripTargetsValid) {
          placeWristAt(left, leftJoints, leftVehicleGrip);
          placeWristAt(right, rightJoints, rightVehicleGrip);
        }
        leftJoints.wrist.rotation.x = rightJoints.wrist.rotation.x = -.32;
        leftJoints.wrist.rotation.z = .34 + wheelTurn;
        rightJoints.wrist.rotation.z = -.34 + wheelTurn;
        for (const digit of [...leftJoints.digits, ...rightJoints.digits]) digit.rotation.x = -.19;
      } else if (vehicleMode === "rowboat") {
        // The live oar anchors already include float, sweep and feather motion;
        // only wrist articulation remains authored here.
        const effort = vehicleRowingEffort;
        const feather = Math.cos(vehicleOarPhase) * (.025 + effort * .115);
        left.rotation.set(-.22, 0, -.15);
        right.rotation.set(-.22, 0, .15);
        leftJoints.elbow.rotation.x = rightJoints.elbow.rotation.x = -.12;
        if (vehicleGripTargetsValid) {
          placeWristAt(left, leftJoints, leftVehicleGrip);
          placeWristAt(right, rightJoints, rightVehicleGrip);
        }
        leftJoints.wrist.rotation.x = rightJoints.wrist.rotation.x = -.28 + feather;
        leftJoints.wrist.rotation.z = .34;
        rightJoints.wrist.rotation.z = -.34;
        for (const digit of [...leftJoints.digits, ...rightJoints.digits]) digit.rotation.x = -.17;
      }
    },
  };
}
