import * as THREE from "three";

export type SlothRig = {
  root: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  animate(time: number, speed: number, gripping: boolean): void;
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
  const color = new THREE.Color();
  const ringSize = radialSegments + 1;

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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  if (colors.length) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
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
) {
  const curve = new THREE.CubicBezierCurve3(new THREE.Vector3(), bendA, bendB, end);
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
  mesh.receiveShadow = true;
  return mesh;
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
  palmFur: THREE.Material,
  keratin: THREE.Material,
  fringe: THREE.Material,
) {
  const shoulder = new THREE.Group();
  const upperEnd = new THREE.Vector3(-side * .018, .35, -.046);
  const upperArm = furSegment(
    upperEnd,
    new THREE.Vector3(-side * .008, .105, .008),
    new THREE.Vector3(-side * .022, .245, -.006),
    .16,
    .119,
    fur,
    40,
  );
  upperArm.frustumCulled = false;
  addFurShell(shoulder, upperArm, fringe);

  const elbow = new THREE.Group();
  elbow.position.copy(upperEnd);
  const elbowMass = new THREE.Mesh(new THREE.SphereGeometry(1, 34, 24), fur);
  elbowMass.scale.set(.116, .16, .096);
  elbowMass.castShadow = true;
  elbowMass.frustumCulled = false;
  elbow.add(elbowMass);
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
  forearm.frustumCulled = false;
  addFurShell(elbow, forearm, fringe);

  const wrist = new THREE.Group();
  wrist.position.copy(wristEnd);
  wrist.rotation.y = side * .12;
  wrist.rotation.z = -side * .34;
  elbow.add(wrist);

  const wristMass = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), fur);
  wristMass.position.set(0, .024, -.004);
  wristMass.scale.set(.074, .124, .057);
  wristMass.castShadow = true;
  wristMass.frustumCulled = false;
  wrist.add(wristMass);
  addEllipsoidShell(wrist, wristMass, fringe);

  // The splash silhouette reads as a compact fur-covered paw. The three distal
  // phalanges are buried in this mass; only their keratin hooks should show.
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 30), palmFur);
  palm.position.set(-side * .014, .105, -.016);
  palm.scale.set(.073, .135, .053);
  palm.castShadow = true;
  palm.receiveShadow = true;
  palm.frustumCulled = false;
  wrist.add(palm);
  addEllipsoidShell(wrist, palm, fringe);

  const digitWeb = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 22), palmFur);
  digitWeb.position.set(-side * .02, .176, -.025);
  digitWeb.scale.set(.078, .052, .046);
  digitWeb.castShadow = true;
  digitWeb.frustumCulled = false;
  wrist.add(digitWeb);

  const digits: THREE.Group[] = [];
  for (let index = -1; index <= 1; index++) {
    const claw = makeClaw(index, side, keratin);
    // Roots overlap the fur cap so the hooks emerge from the paw rather than
    // appearing glued onto a visible set of human-like fingers.
    claw.position.set(-side * .022 + index * .027, .182 - Math.abs(index) * .007, -.033 + (index === 0 ? -.008 : 0));
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
    color: "#d7d2c8",
    roughness: .93,
    sheen: .9,
    sheenColor: new THREE.Color("#8d8373"),
    sheenRoughness: .78,
    emissive: new THREE.Color("#27231d"),
    emissiveIntensity: .11,
  });
  const palmFur = new THREE.MeshPhysicalMaterial({
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: .018,
    color: "#cac3b7",
    roughness: .96,
    sheen: .65,
    sheenColor: new THREE.Color("#716653"),
    sheenRoughness: .85,
    emissive: new THREE.Color("#25211c"),
    emissiveIntensity: .12,
  });
  const fringe = new THREE.MeshPhysicalMaterial({
    map: furTexture,
    alphaMap: furTexture,
    bumpMap: furTexture,
    bumpScale: .012,
    color: "#ddd5c7",
    roughness: .98,
    sheen: .9,
    sheenColor: new THREE.Color("#938670"),
    sheenRoughness: .9,
    alphaTest: .3,
    transparent: true,
    opacity: .62,
    depthWrite: false,
  });
  const keratin = new THREE.MeshPhysicalMaterial({
    color: "#fff9e9",
    vertexColors: true,
    roughness: .4,
    clearcoat: .16,
    clearcoatRoughness: .5,
  });

  const left = makeArm(-1, fur, palmFur, keratin, fringe);
  const right = makeArm(1, fur, palmFur, keratin, fringe);
  root.add(left, right);

  const joints = (arm: THREE.Group) => arm.userData.joints as ArmJoints;
  const leftJoints = joints(left);
  const rightJoints = joints(right);

  return {
    root,
    left,
    right,
    animate(time, speed, gripping) {
      const stride = Math.min(1, speed / 4);
      const gait = Math.sin(time * 3.05);
      const breath = Math.sin(time * 1.35);
      const grip = gripping ? 1 : 0;

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

      // Keep the viewmodel anchored to the camera. Motion is deliberately
      // millimetric; locomotion and climbing must never push the paws offscreen.
      root.position.y = .012 + breath * .004 + Math.sin(time * 5.15) * .004 * stride;
      root.position.z = -.02 - grip * .004;
    },
  };
}
