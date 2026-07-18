import * as THREE from "three";
import { markTextureCloneReadyAfterSource } from "../rendering/textures";

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
  elbow: THREE.Bone;
  wrist: THREE.Bone;
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
  uvVAt?: (t: number) => number,
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
      uvs.push(u, uvVAt ? uvVAt(t) : t);

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

  // Close the two external ends of each sweep so the shoulder mount and claw
  // roots remain watertight in the tighter portrait framing.
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

function anatomicalArmGeometry(side: number, elbowPivot: THREE.Vector3, wristEnd: THREE.Vector3) {
  const proximalStart = new THREE.Vector3(side * .05, -.46, .075);
  const wristPivot = elbowPivot.clone().add(wristEnd);
  const wristRotation = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(0, side * .12, -side * .34));
  const wristPoint = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(wristRotation).add(wristPivot);
  const forearmControlA = elbowPivot.clone().add(new THREE.Vector3(-side * .015, .105, -.008));
  const forearmControlB = elbowPivot.clone().add(new THREE.Vector3(-side * .038, .265, -.052));
  const elbowTangent = forearmControlA.clone().sub(elbowPivot);
  const wristTangent = wristPivot.clone().sub(forearmControlB);
  const upperCurve = new THREE.CubicBezierCurve3(
    proximalStart,
    new THREE.Vector3(side * .035, -.24, .05),
    elbowPivot.clone().addScaledVector(elbowTangent, -.9),
    elbowPivot,
  );
  const forearmCurve = new THREE.CubicBezierCurve3(
    elbowPivot,
    forearmControlA,
    forearmControlB,
    wristPivot,
  );
  const pawCurve = new THREE.CubicBezierCurve3(
    wristPivot,
    wristPivot.clone().addScaledVector(wristTangent, .58),
    wristPoint(-side * .018, .145, -.018),
    wristPoint(-side * .019, .212, -.035),
  );
  const curve = new THREE.CurvePath<THREE.Vector3>();
  curve.add(upperCurve); curve.add(forearmCurve); curve.add(pawCurve);
  const upperLength = upperCurve.getLength();
  const forearmLength = forearmCurve.getLength();
  const totalLength = upperLength + forearmLength + pawCurve.getLength();
  const elbowT = upperLength / totalLength;
  const wristT = (upperLength + forearmLength) / totalLength;
  const segments = 104;
  const radialSegments = 34;
  const geometry = sweptGeometry(
    curve,
    segments,
    radialSegments,
    (t) => {
      if (t <= elbowT) {
        const local = THREE.MathUtils.smootherstep(t / elbowT, 0, 1);
        return THREE.MathUtils.lerp(.15, .103, local) + Math.sin(Math.PI * local) * .012;
      }
      if (t <= wristT) {
        const local = THREE.MathUtils.smootherstep((t - elbowT) / (wristT - elbowT), 0, 1);
        return THREE.MathUtils.lerp(.103, .071, local) + Math.sin(Math.PI * local) * .007;
      }
      const local = THREE.MathUtils.smootherstep((t - wristT) / (1 - wristT), 0, 1);
      return THREE.MathUtils.lerp(.071, .052, local) + Math.sin(Math.PI * local) * .013;
    },
    .78,
    undefined,
    true,
    true,
    (t) => t,
  );

  // Blend the single surface across two compact deformation zones. The broad
  // spans remain rigid enough to preserve sloth proportions, while elbow and
  // wrist motion bend the same vertices instead of rotating intersecting
  // meshes through one another.
  const skinIndices: number[] = [];
  const skinWeights: number[] = [];
  const sideVertexCount = geometry.userData.sweep.sideVertexCount as number;
  const { capVertexRanges } = geometry.userData.sweep as { capVertexRanges: Array<{ start: number; count: number }> };
  const vertexCount = geometry.getAttribute("position").count;
  const elbowBlend = .075;
  const wristDeformSpan = .06;
  for (let vertex = 0; vertex < vertexCount; vertex++) {
    let t = 0;
    if (vertex < sideVertexCount) t = Math.floor(vertex / (radialSegments + 1)) / segments;
    else if (capVertexRanges[1] && vertex >= capVertexRanges[1].start) t = 1;
    if (t < elbowT - elbowBlend) {
      skinIndices.push(0, 0, 0, 0); skinWeights.push(1, 0, 0, 0);
    } else if (t < elbowT + elbowBlend) {
      const blend = THREE.MathUtils.smoothstep(t, elbowT - elbowBlend, elbowT + elbowBlend);
      skinIndices.push(0, 1, 0, 0); skinWeights.push(1 - blend, blend, 0, 0);
    } else if (t < wristT - wristDeformSpan) {
      skinIndices.push(1, 0, 0, 0); skinWeights.push(1, 0, 0, 0);
    } else if (t < wristT + wristDeformSpan) {
      const blend = THREE.MathUtils.smoothstep(t, wristT - wristDeformSpan, wristT + wristDeformSpan);
      skinIndices.push(1, 2, 0, 0); skinWeights.push(1 - blend, blend, 0, 0);
    } else {
      skinIndices.push(2, 0, 0, 0); skinWeights.push(1, 0, 0, 0);
    }
  }
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
  return geometry;
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
) {
  const shoulder = new THREE.Group();
  const elbowPivot = new THREE.Vector3(-side * .018, .35, -.046);
  const wristEnd = new THREE.Vector3(-side * .032, .36, -.10);
  const rootBone = new THREE.Bone();
  rootBone.name = "viewmodel-shoulder-bone";
  const elbow = new THREE.Bone();
  elbow.name = "anatomical-elbow-bone";
  elbow.position.copy(elbowPivot);
  const wrist = new THREE.Bone();
  wrist.name = "anatomical-wrist-bone";
  wrist.position.copy(wristEnd);
  wrist.rotation.y = side * .12;
  wrist.rotation.z = -side * .34;
  rootBone.add(elbow);
  elbow.add(wrist);
  shoulder.add(rootBone);

  const arm = new THREE.SkinnedMesh(anatomicalArmGeometry(side, elbowPivot, wristEnd), fur);
  arm.name = "continuous-skinned-anatomical-arm";
  arm.castShadow = true;
  arm.receiveShadow = false;
  arm.frustumCulled = false;
  shoulder.add(arm);
  shoulder.updateMatrixWorld(true);
  arm.bind(new THREE.Skeleton([rootBone, elbow, wrist]));
  arm.normalizeSkinWeights();

  const digits: THREE.Group[] = [];
  for (let index = -1; index <= 1; index++) {
    const claw = makeClaw(index, side, keratin);
    // Roots emerge directly from the tapered paw end rather than a separate
    // palm or finger primitive.
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

  // The world texture repeats vertically for large creature meshes. A private
  // clamped viewmodel sampler maps it once along each arm so a tile boundary
  // can never masquerade as a dark wrist or elbow joint.
  // Texture.clone() always marks the result for upload, even when the shared
  // TextureLoader source has not decoded yet. Build the independent sampler
  // explicitly and arm it only after the source owns real pixels.
  const viewmodelFur = new THREE.Texture();
  viewmodelFur.source = furTexture.source;
  viewmodelFur.colorSpace = furTexture.colorSpace;
  viewmodelFur.wrapS = THREE.RepeatWrapping;
  viewmodelFur.wrapT = THREE.ClampToEdgeWrapping;
  viewmodelFur.repeat.set(1.1, .92);
  viewmodelFur.offset.set(.03, .04);
  viewmodelFur.anisotropy = furTexture.anisotropy;
  markTextureCloneReadyAfterSource(viewmodelFur, furTexture);
  const fur = new THREE.MeshPhysicalMaterial({
    map: viewmodelFur,
    bumpMap: viewmodelFur,
    bumpScale: .024,
    color: "#aaa08f",
    roughness: .96,
    sheen: .32,
    sheenColor: new THREE.Color("#8d8373"),
    sheenRoughness: .9,
    emissive: new THREE.Color("#766c5d"),
    emissiveMap: viewmodelFur,
    emissiveIntensity: .72,
  });
  const keratin = new THREE.MeshPhysicalMaterial({
    color: "#fff9e9",
    vertexColors: true,
    roughness: .4,
    clearcoat: .16,
    clearcoatRoughness: .5,
  });

  const left = makeArm(-1, fur, keratin);
  const right = makeArm(1, fur, keratin);
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
