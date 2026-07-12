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

function clawColor(t: number, target: THREE.Color) {
  if (t < .28) return target.lerpColors(CLAW_ROOT, CLAW_BODY, t / .28);
  return target.lerpColors(CLAW_BODY, CLAW_TIP, THREE.MathUtils.smoothstep(t, .28, 1));
}

function hookedClawGeometry(length: number, lateralDrift: number, hookBias: number) {
  // The tip curls back almost to the height of the claw bed. That deep return,
  // rather than a simple swept cone, creates the characteristic load-bearing hook.
  const curve = new THREE.CubicBezierCurve3(
    new THREE.Vector3(0, -.006, -.002),
    new THREE.Vector3(lateralDrift * .15, length * .48, -.016),
    new THREE.Vector3(lateralDrift * .62, length * .58, -length * (.56 + hookBias)),
    new THREE.Vector3(lateralDrift, length * .08, -length * (.86 + hookBias)),
  );
  return sweptGeometry(
    curve,
    44,
    18,
    (t) => .0265 * Math.pow(Math.max(0, 1 - t), .72) + .00035,
    .5,
    clawColor,
  );
}

function makeDigit(
  index: number,
  side: number,
  fur: THREE.Material,
  keratin: THREE.Material,
) {
  const digit = new THREE.Group();
  const outer = Math.abs(index);
  const length = .154 - outer * .012 + index * side * .004;
  const lateralBend = index * .008 + side * (index === 0 ? .004 : 0);
  const end = new THREE.Vector3(lateralBend, length, -.016 - outer * .005);
  const digitMesh = furSegment(
    end,
    new THREE.Vector3(lateralBend * .18, length * .34, -.002),
    new THREE.Vector3(lateralBend * .68, length * .74, -.009),
    .031,
    .0205,
    fur,
    26,
  );
  digit.add(digitMesh);

  const fingertip = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), fur);
  fingertip.scale.set(.021, .030, .018);
  fingertip.position.copy(end);
  fingertip.castShadow = true;
  digit.add(fingertip);

  const clawRoot = new THREE.Group();
  clawRoot.position.copy(end).add(new THREE.Vector3(0, .018, -.004));
  clawRoot.rotation.z = -index * .018 + side * .006;
  clawRoot.rotation.y = side * (.075 + outer * .025);
  const clawLength = .238 - outer * .011 + index * side * .003;
  const claw = new THREE.Mesh(
    hookedClawGeometry(clawLength, index * .018 + side * .004, outer * .025),
    keratin,
  );
  claw.castShadow = true;
  claw.receiveShadow = true;
  clawRoot.add(claw);
  digit.add(clawRoot);

  // A restrained fan reads as three parallel sloth digits, not a human hand.
  digit.rotation.z = -index * .09 + side * (index === 0 ? .008 : 0);
  digit.rotation.x = outer * -.022;
  digit.userData.clawRoot = clawRoot;
  return digit;
}

function makeArm(side: number, fur: THREE.Material, palmFur: THREE.Material, keratin: THREE.Material) {
  const shoulder = new THREE.Group();
  const upperEnd = new THREE.Vector3(-side * .018, .345, -.038);
  shoulder.add(furSegment(
    upperEnd,
    new THREE.Vector3(-side * .008, .105, .008),
    new THREE.Vector3(-side * .022, .245, -.006),
    .119,
    .086,
    fur,
    40,
  ));

  const elbow = new THREE.Group();
  elbow.position.copy(upperEnd);
  const elbowMass = new THREE.Mesh(new THREE.SphereGeometry(1, 34, 24), fur);
  elbowMass.scale.set(.087, .097, .074);
  elbowMass.castShadow = true;
  elbow.add(elbowMass);
  shoulder.add(elbow);

  const wristEnd = new THREE.Vector3(-side * .026, .385, -.086);
  elbow.add(furSegment(
    wristEnd,
    new THREE.Vector3(-side * .015, .105, -.008),
    new THREE.Vector3(-side * .035, .285, -.045),
    .089,
    .061,
    fur,
    42,
  ));

  const wrist = new THREE.Group();
  wrist.position.copy(wristEnd);
  wrist.rotation.y = side * .105;
  elbow.add(wrist);

  const wristMass = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), fur);
  wristMass.scale.set(.064, .079, .052);
  wristMass.castShadow = true;
  wrist.add(wristMass);

  // Bradypus has a narrow, hairy autopodium with partially fused digital bases.
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 30), palmFur);
  palm.position.set(0, .095, -.012);
  palm.scale.set(.088, .143, .061);
  palm.castShadow = true;
  palm.receiveShadow = true;
  wrist.add(palm);

  const digitWeb = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 22), palmFur);
  digitWeb.position.set(0, .176, -.021);
  digitWeb.scale.set(.103, .052, .050);
  digitWeb.castShadow = true;
  wrist.add(digitWeb);

  const digits: THREE.Group[] = [];
  for (let index = -1; index <= 1; index++) {
    const finger = makeDigit(index, side, fur, keratin);
    finger.position.set(index * .054, .168 - Math.abs(index) * .006, -.020 + (index === 0 ? -.008 : 0));
    wrist.add(finger);
    digits.push(finger);
  }

  // The broad placement leaves negative space between the hands and lets the
  // long forelimbs enter naturally from the lower corners of the viewport.
  shoulder.position.set(side * .44, -.84, -.62);
  shoulder.rotation.set(-.055, side * -.035, side * .075);
  shoulder.userData.joints = { elbow, wrist, digits } satisfies ArmJoints;
  return shoulder;
}

export function createSlothRig(furTexture: THREE.Texture): SlothRig {
  const root = new THREE.Group();
  root.renderOrder = 20;

  const fur = new THREE.MeshPhysicalMaterial({
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: .027,
    color: "#aaa08e",
    roughness: .93,
    sheen: .9,
    sheenColor: new THREE.Color("#8c7557"),
    sheenRoughness: .78,
  });
  const palmFur = new THREE.MeshPhysicalMaterial({
    map: furTexture,
    bumpMap: furTexture,
    bumpScale: .018,
    color: "#887a66",
    roughness: .96,
    sheen: .65,
    sheenColor: new THREE.Color("#77634a"),
    sheenRoughness: .85,
  });
  const keratin = new THREE.MeshPhysicalMaterial({
    color: "#fff8e9",
    vertexColors: true,
    roughness: .4,
    clearcoat: .16,
    clearcoatRoughness: .5,
  });

  const left = makeArm(-1, fur, palmFur, keratin);
  const right = makeArm(1, fur, palmFur, keratin);
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

      left.rotation.x = -.055 + gait * .026 * stride - grip * .035;
      right.rotation.x = -.055 - gait * .026 * stride - grip * .035;
      left.rotation.z = -.075 + breath * .006 + grip * .026;
      right.rotation.z = .075 - breath * .006 - grip * .026;

      leftJoints.elbow.rotation.x = -.018 - gait * .018 * stride - grip * .034;
      rightJoints.elbow.rotation.x = -.018 + gait * .018 * stride - grip * .034;
      leftJoints.wrist.rotation.x = -.025 + gait * .014 * stride - grip * .065;
      rightJoints.wrist.rotation.x = -.025 - gait * .014 * stride - grip * .065;
      leftJoints.wrist.rotation.z = -.012 + breath * .004;
      rightJoints.wrist.rotation.z = .012 - breath * .004;

      for (let index = 0; index < 3; index++) {
        const phase = time * 1.15 + index * .72;
        const leftDigit = leftJoints.digits[index];
        const rightDigit = rightJoints.digits[index];
        leftDigit.rotation.x = Math.abs(index - 1) * -.022 - grip * (.052 + index * .007) + Math.sin(phase) * .004;
        rightDigit.rotation.x = Math.abs(index - 1) * -.022 - grip * (.066 - index * .007) + Math.sin(phase + .8) * .004;
      }

      root.position.y = -.265 + breath * .006 + Math.sin(time * 5.15) * .006 * stride;
      root.position.z = gripping ? -.012 : 0;
    },
  };
}
