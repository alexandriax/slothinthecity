import * as THREE from "three";

export type SlothRig = {
  root: THREE.Group;
  left: THREE.Group;
  right: THREE.Group;
  animate(time: number, speed: number, gripping: boolean): void;
};

function curvedClaw(material: THREE.Material, side: number, offset: number) {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(offset, .31, -.01),
    new THREE.Vector3(offset + side * .035, .41, -.055),
    new THREE.Vector3(offset + side * .072, .47, -.12),
  );
  const geometry = new THREE.TubeGeometry(curve, 16, .016, 10, false);
  const claw = new THREE.Mesh(geometry, material);
  claw.castShadow = true;
  return claw;
}

function arm(side: number, fur: THREE.Material, keratin: THREE.Material) {
  const shoulder = new THREE.Group();
  const forearm = new THREE.Mesh(new THREE.CapsuleGeometry(.072, .32, 10, 18), fur);
  forearm.scale.set(1.08, 1, .9);
  forearm.position.y = .04;
  forearm.castShadow = true;
  shoulder.add(forearm);

  const palm = new THREE.Mesh(new THREE.SphereGeometry(.09, 20, 14), fur);
  palm.scale.set(.94, 1.25, .72);
  palm.position.set(0, .285, -.012);
  palm.castShadow = true;
  shoulder.add(palm);

  for (let digit = -1; digit <= 1; digit++) {
    const x = digit * .047;
    const finger = new THREE.Mesh(new THREE.CapsuleGeometry(.023, .13, 7, 10), fur);
    finger.position.set(x, .355, -.02);
    finger.rotation.z = digit * -.08;
    finger.castShadow = true;
    shoulder.add(finger);
    shoulder.add(curvedClaw(keratin, side, x));
  }
  shoulder.position.set(side * .14, -.38, -.72);
  shoulder.rotation.set(-.19, side * -.06, side * .18);
  return shoulder;
}

export function createSlothRig(furTexture: THREE.Texture): SlothRig {
  const root = new THREE.Group();
  root.renderOrder = 20;
  const fur = new THREE.MeshPhysicalMaterial({
    map: furTexture, bumpMap: furTexture, bumpScale: .018,
    color: "#c1aa8c", roughness: .92, sheen: .7, sheenColor: new THREE.Color("#8d704e"),
  });
  const keratin = new THREE.MeshPhysicalMaterial({
    color: "#dbcda8", roughness: .42, clearcoat: .18, clearcoatRoughness: .58,
  });
  const left = arm(-1, fur, keratin);
  const right = arm(1, fur, keratin);
  root.add(left, right);
  return {
    root, left, right,
    animate(time, speed, gripping) {
      const stride = Math.min(1, speed / 4);
      left.rotation.x = -.19 + Math.sin(time * 3.1) * .035 * stride;
      right.rotation.x = -.19 - Math.sin(time * 3.1) * .035 * stride;
      left.rotation.z = -.18 + (gripping ? .045 : 0) + Math.sin(time * 1.3) * .008;
      right.rotation.z = .18 + (gripping ? -.045 : 0) - Math.sin(time * 1.3) * .008;
      root.position.y = -.26 + Math.sin(time * 1.7) * .006 + Math.sin(time * 5.2) * .008 * stride;
    },
  };
}
