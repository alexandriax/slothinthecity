import * as THREE from "three";

export type SlothRig = {
  root: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  animate(time: number, speed: number, gripping: boolean): void;
};

function taperedLimb(length: number, baseRadius: number, tipRadius: number, radialSegments = 20) {
  const profile = [
    new THREE.Vector2(baseRadius * .72, -length * .5),
    new THREE.Vector2(baseRadius, -length * .36),
    new THREE.Vector2(baseRadius * 1.04, 0),
    new THREE.Vector2((baseRadius + tipRadius) * .54, length * .38),
    new THREE.Vector2(tipRadius, length * .5),
  ];
  return new THREE.LatheGeometry(profile, radialSegments);
}

function pointedClawGeometry(curve: THREE.QuadraticBezierCurve3, segments = 24, radialSegments = 10) {
  const frames = curve.computeFrenetFrames(segments, false);
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  const point = new THREE.Vector3(), normal = new THREE.Vector3(), rootColor = new THREE.Color("#806a4d"), tipColor = new THREE.Color("#f2e7c8"), color = new THREE.Color();
  for (let segment = 0; segment <= segments; segment++) {
    const t = segment / segments, radius = .019 * Math.pow(Math.max(0, 1 - t), .72) + .00015;
    curve.getPointAt(t, point); color.lerpColors(rootColor, tipColor, Math.pow(t, .55));
    for (let radial = 0; radial < radialSegments; radial++) {
      const angle = radial / radialSegments * Math.PI * 2;
      normal.copy(frames.normals[segment]).multiplyScalar(Math.cos(angle)).addScaledVector(frames.binormals[segment], Math.sin(angle)).normalize();
      positions.push(point.x + normal.x * radius, point.y + normal.y * radius, point.z + normal.z * radius);
      normals.push(normal.x, normal.y, normal.z); colors.push(color.r, color.g, color.b);
      if (segment < segments) {
        const next = (segment + 1) * radialSegments + radial, current = segment * radialSegments + radial, nextRadial = (radial + 1) % radialSegments;
        indices.push(current, next, segment * radialSegments + nextRadial, segment * radialSegments + nextRadial, next, (segment + 1) * radialSegments + nextRadial);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices); geometry.computeBoundingSphere(); return geometry;
}

function digit(index: number, side: number, fur: THREE.Material, keratin: THREE.Material) {
  const root = new THREE.Group(), splay = index * .052;
  root.position.set(splay, .018 - Math.abs(index) * .008, -.018);
  root.rotation.set(index * .025, 0, index * -.1);

  const proximal = new THREE.Mesh(taperedLimb(.17, .029, .024, 16), fur);
  proximal.position.y = .075; proximal.scale.z = .82; proximal.castShadow = true; root.add(proximal);
  const knuckle = new THREE.Mesh(new THREE.SphereGeometry(.027, 16, 12), fur);
  knuckle.scale.set(1, .86, .82); knuckle.position.y = .16; knuckle.castShadow = true; root.add(knuckle);

  const curl = index * .026 + side * .012;
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, .175, -.003),
    new THREE.Vector3(curl * .55, .285, -.035),
    new THREE.Vector3(curl, .35, -.135),
  );
  const claw = new THREE.Mesh(pointedClawGeometry(curve), keratin);
  claw.castShadow = true; root.add(claw); return root;
}

function arm(side: number, fur: THREE.Material, keratin: THREE.Material) {
  const shoulder = new THREE.Group();
  const forearm = new THREE.Mesh(taperedLimb(.48, .094, .072, 24), fur);
  forearm.scale.z = .84; forearm.position.y = .015; forearm.castShadow = true; shoulder.add(forearm);

  const wrist = new THREE.Mesh(new THREE.SphereGeometry(.086, 24, 18), fur);
  wrist.scale.set(1.02, 1.22, .78); wrist.position.set(0, .255, -.012); wrist.castShadow = true; shoulder.add(wrist);

  const hand = new THREE.Group(); hand.position.set(0, .292, -.012);
  for (let index = -1; index <= 1; index++) hand.add(digit(index, side, fur, keratin));
  shoulder.add(hand);
  shoulder.position.set(side * .14, -.39, -.72); shoulder.rotation.set(-.19, side * -.06, side * .18); return shoulder;
}

export function createSlothRig(furTexture: THREE.Texture): SlothRig {
  const root = new THREE.Group(); root.renderOrder = 20;
  const fur = new THREE.MeshPhysicalMaterial({
    map: furTexture, bumpMap: furTexture, bumpScale: .021, color: "#b49a79", roughness: .94,
    sheen: .82, sheenColor: new THREE.Color("#876a48"), sheenRoughness: .74,
  });
  const keratin = new THREE.MeshPhysicalMaterial({
    color: "#fff4d7", vertexColors: true, roughness: .32, clearcoat: .28, clearcoatRoughness: .42,
  });
  const left = arm(-1, fur, keratin), right = arm(1, fur, keratin); root.add(left, right);
  return {
    root, left, right,
    animate(time, speed, gripping) {
      const stride = Math.min(1, speed / 4), settle = gripping ? .038 : 0;
      left.rotation.x = -.19 + Math.sin(time * 3.1) * .03 * stride - settle;
      right.rotation.x = -.19 - Math.sin(time * 3.1) * .03 * stride - settle;
      left.rotation.z = -.18 + (gripping ? .042 : 0) + Math.sin(time * 1.3) * .007;
      right.rotation.z = .18 + (gripping ? -.042 : 0) - Math.sin(time * 1.3) * .007;
      root.position.y = -.265 + Math.sin(time * 1.7) * .006 + Math.sin(time * 5.2) * .007 * stride;
    },
  };
}
