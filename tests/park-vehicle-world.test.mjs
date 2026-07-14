import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { createSlothRig } from "../app/game/player/SlothRig.ts";

test("both lake shores provide usable boats and field-services carts", async () => {
  const [game, world] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
  ]);

  for (const name of [
    "Bow Bridge checkpoint rowboat 5",
    "Bow Bridge rowboat 7",
    "Bow Bridge rowboat 12",
    "Southeast shore rowboat 18",
    "Southeast shore rowboat 23",
  ]) assert.match(world, new RegExp(name));

  assert.match(world, /LAKE_SOUTHEAST_CART_TARGET/);
  assert.match(game, /const carts = \[/);
  assert.match(game, /let cart: ParkUtilityCart = carts\[0\]/);
  assert.match(game, /for \(const candidate of carts\)/);
  assert.match(game, /cart = nearbyCart/);
  assert.match(game, /carts\.forEach\(candidate => candidate\.dispose\(\)\)/);
});

test("rowboats are closed, dry, clearly labelled, and omit the ambiguous bow ring", async () => {
  const rowboat = await readFile(new URL("../app/game/world/ParkRowboat.ts", import.meta.url), "utf8");

  assert.match(rowboat, /watertight-bow-stem-post/);
  assert.match(rowboat, /watertight-stern-post/);
  assert.match(rowboat, /watertight-dry-cockpit-sole/);
  assert.match(rowboat, /label\.position\.set\(side \* \.872, \.43, \.26\)/);
  assert.doesNotMatch(rowboat, /ropeCoil|bow-mooring-rope/);
  assert.match(rowboat, /get oarStrokePhaseRadians\(\)/);
  assert.match(rowboat, /get rowingEffort\(\)/);
  assert.match(rowboat, /port-oar-hand-grip/);
  assert.match(rowboat, /bronze-oarlock-collar/);
  assert.match(rowboat, /materials\.oarWood/);
  assert.match(rowboat, /shaft\.frustumCulled = false/);
  assert.match(rowboat, /blade\.frustumCulled = false/);
});

test("Bow Bridge and each timber pier provide dry, elevated player support", async () => {
  const [campaign, world] = await Promise.all([
    readFile(new URL("../app/game/world/CampaignLandmarks.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
  ]);

  assert.match(campaign, /BOW_BRIDGE_YAW = -\.43/);
  assert.match(campaign, /const rotation = BOW_BRIDGE_YAW/);
  assert.match(campaign, /length: length \+ 5\.2/);
  assert.match(world, /function bowBridgeSupportsPlayer/);
  assert.match(world, /export function lakeDockSurfaceHeightAt/);
  assert.match(world, /shoreInset === 0 && \(bowBridgeSupportsPlayer\(x, z\) \|\| lakeDockSurfaceHeightAt\(x, z\) !== null\)/);
  assert.match(world, /dummy\.position\.y = dockTopAt\(definition, amount\) - \.0525/);
  assert.match(world, /return lakeDockSurfaceHeightAt\(x, z\) \?\? baseTerrainY\(x, z\)/);
});

test("shore forestry and first-person vehicle grips preserve visual clarity", async () => {
  const [game, world, sloth] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/player/SlothRig.ts", import.meta.url), "utf8"),
  ]);

  assert.match(world, /containsLakeWater\(x, z, -radius - 6\.5\)/);
  assert.match(world, /containsLakeWater\(x, z, -8\)/);
  assert.match(game, /layoutDepth/);
  assert.match(game, /setVehiclePose\("cart", -cart\.steeringAngleRadians \/ \.54\)/);
  assert.match(game, /setVehiclePose\("rowboat", activeBoat\.steeringAngleRadians \/ \.62, activeBoat\.oarStrokePhaseRadians, activeBoat\.rowingEffort\)/);
  assert.match(sloth, /vehicleMode === "cart"/);
  assert.match(sloth, /vehicleMode === "rowboat"/);
});

test("first-person sloth arms use watertight sweeps and overlapping articulated joins", async () => {
  const sloth = await readFile(new URL("../app/game/player/SlothRig.ts", import.meta.url), "utf8");

  assert.match(sloth, /capStart = true/);
  assert.match(sloth, /capEnd = true/);
  assert.match(sloth, /capVertexRanges/);
  assert.match(sloth, /continuous-upper-arm/);
  assert.match(sloth, /continuous-wrist-blend/);
  assert.match(sloth, /continuous-paw-sweep/);
  assert.match(sloth, /new THREE\.Vector3\(side \* \.004, -\.052, \.012\)/);
  assert.match(sloth, /THREE\.MathUtils\.lerp\(\.094, \.058, t\)/);
  assert.doesNotMatch(sloth, /palmFur/);
});

test("wrist volumes remain deeply overlapped and sweep caps shade correctly in every gameplay pose", () => {
  const rig = createSlothRig(new THREE.Texture());
  rig.root.scale.setScalar(.54);
  rig.left.position.set(-.55, -.74, -.72);
  rig.right.position.set(.55, -.74, -.72);
  rig.left.userData.layoutX = -.55;
  rig.right.userData.layoutX = .55;
  rig.left.userData.layoutY = rig.right.userData.layoutY = -.74;
  rig.left.userData.layoutDepth = rig.right.userData.layoutDepth = -.72;
  rig.left.userData.layoutZ = -.48;
  rig.right.userData.layoutZ = .48;

  const overlappingSweepRings = (blend, mesh) => {
    rig.root.updateMatrixWorld(true);
    const positions = mesh.geometry.getAttribute("position");
    const { segments, radialSegments } = mesh.geometry.userData.sweep;
    const inverseBlend = new THREE.Matrix4().copy(blend.matrixWorld).invert();
    const point = new THREE.Vector3();
    const overlappingRings = [];
    for (let segment = 0; segment <= segments; segment++) {
      let overlaps = false;
      for (let radial = 0; radial <= radialSegments; radial++) {
        const index = segment * (radialSegments + 1) + radial;
        point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseBlend);
        if (point.lengthSq() <= 1.001) { overlaps = true; break; }
      }
      if (overlaps) overlappingRings.push(segment);
    }
    return overlappingRings;
  };

  const assertCaps = (mesh, label) => {
    const positions = mesh.geometry.getAttribute("position");
    const normals = mesh.geometry.getAttribute("normal");
    const indices = mesh.geometry.getIndex();
    const { capVertexRanges } = mesh.geometry.userData.sweep;
    assert.equal(capVertexRanges.length, 2, `${label} has both sweep caps`);
    const reference = new THREE.Vector3();
    const normal = new THREE.Vector3();
    const triangleA = new THREE.Vector3();
    const triangleB = new THREE.Vector3();
    const triangleC = new THREE.Vector3();
    const geometricNormal = new THREE.Vector3();
    for (const range of capVertexRanges) {
      reference.fromBufferAttribute(normals, range.start);
      assert.ok(Math.abs(reference.length() - 1) < 1e-5, `${label} cap normal is normalized`);
      for (let index = range.start + 1; index < range.start + range.count; index++) {
        normal.fromBufferAttribute(normals, index);
        assert.ok(Number.isFinite(normal.x + normal.y + normal.z), `${label} cap normal is finite`);
        assert.ok(reference.dot(normal) > .99999, `${label} cap uses a flat tangent normal`);
      }
      const center = range.start + range.count - 1;
      let outwardTriangleFound = false;
      for (let index = 0; index < indices.count; index += 3) {
        const a = indices.getX(index);
        const b = indices.getX(index + 1);
        const c = indices.getX(index + 2);
        if (a !== center && b !== center && c !== center) continue;
        triangleA.fromBufferAttribute(positions, a);
        triangleB.fromBufferAttribute(positions, b);
        triangleC.fromBufferAttribute(positions, c);
        geometricNormal
          .crossVectors(triangleB.clone().sub(triangleA), triangleC.clone().sub(triangleA))
          .normalize();
        outwardTriangleFound = geometricNormal.dot(reference) > .999;
        break;
      }
      assert.ok(outwardTriangleFound, `${label} cap triangles face their stored outward normal`);
    }
  };

  const assertContinuous = (label) => {
    for (const [side, arm] of [["left", rig.left], ["right", rig.right]]) {
      const upper = arm.getObjectByName("continuous-upper-arm");
      const wrist = arm.getObjectByName("continuous-wrist-blend");
      const forearm = arm.getObjectByName("continuous-forearm-sweep");
      const paw = arm.getObjectByName("continuous-paw-sweep");
      for (const object of [upper, wrist, forearm, paw]) assert.ok(object, `${side} ${label} mesh exists`);
      upper.geometry.computeBoundingBox();
      assert.ok(upper.geometry.boundingBox.min.y <= -.45, `${side} ${label} arm begins below the camera mount`);
      assert.ok(upper.geometry.boundingBox.max.y >= .34, `${side} ${label} arm reaches the elbow without a root seam`);
      const forearmRings = overlappingSweepRings(wrist, forearm);
      const pawRings = overlappingSweepRings(wrist, paw);
      const forearmLastRing = forearm.geometry.userData.sweep.segments;
      assert.ok(forearmRings.length >= 2 && forearmRings.some(ring => ring < forearmLastRing), `${side} ${label} forearm penetrates beyond its endpoint ring`);
      assert.ok(pawRings.length >= 2 && pawRings.some(ring => ring > 0), `${side} ${label} paw penetrates beyond its endpoint ring`);
      assertCaps(upper, `${side} ${label} upper arm`);
      assertCaps(forearm, `${side} ${label} forearm`);
      assertCaps(paw, `${side} ${label} paw`);
    }
  };

  const poses = [
    ["neutral", "none", 0, 0, 0, 0, false],
    ["walking", "none", 0, 0, 0, 4, false],
    ["gripping", "none", 0, 0, 0, 2, true],
    ["cart-left", "cart", -1, 0, 0, 0, false],
    ["cart-right", "cart", 1, 0, 0, 0, false],
    ["rowboat-idle", "rowboat", 0, 0, 0, 0, false],
    ["rowboat-catch", "rowboat", -.7, 0, 1, 0, false],
    ["rowboat-drive", "rowboat", .7, Math.PI / 2, .8, 0, false],
    ["rowboat-finish", "rowboat", 0, Math.PI, 1, 0, false],
  ];

  for (const [label, mode, steering, oarPhase, rowingEffort, speed, gripping] of poses) {
    rig.setVehiclePose(mode, steering, oarPhase, rowingEffort);
    rig.animate(1.7, speed, gripping);
    assertContinuous(label);
    if (mode === "none") continue;

    rig.root.updateMatrixWorld(true);
    const leftWrist = rig.left.userData.joints.wrist.getWorldPosition(new THREE.Vector3());
    const rightWrist = rig.right.userData.joints.wrist.getWorldPosition(new THREE.Vector3());
    assert.ok(leftWrist.x < rightWrist.x, `${label} wrists remain on their authored sides`);
    assert.ok(rightWrist.x - leftWrist.x > .08, `${label} wrists never collapse into one another`);

    if (mode === "cart") {
      const turn = steering * 1.161, cosine = Math.cos(turn), sine = Math.sin(turn);
      const expectedLeft = new THREE.Vector3(-.01 - .185 * cosine, -.342 - .185 * sine * .948, -.522 + .185 * sine * -.319);
      const expectedRight = new THREE.Vector3(-.01 + .185 * cosine, -.342 + .185 * sine * .948, -.522 - .185 * sine * -.319);
      assert.ok(leftWrist.distanceTo(expectedLeft) < 1e-5, `${label} left paw is planted on the steering-wheel rim`);
      assert.ok(rightWrist.distanceTo(expectedRight) < 1e-5, `${label} right paw is planted on the steering-wheel rim`);
    } else {
      const effort = rowingEffort;
      const sweep = Math.sin(oarPhase) * (.08 + effort * .47);
      const dip = Math.max(0, Math.cos(oarPhase) * effort);
      const yaw = -.04 + sweep, roll = -.075 - dip * .11;
      const x = .63 - .45 * Math.cos(yaw) * Math.cos(roll);
      const worldY = .625 - .45 * Math.cos(yaw) * Math.sin(roll);
      const worldZ = .2 + .45 * Math.sin(yaw);
      const deltaY = worldY - 1.34, deltaZ = worldZ - .96;
      const expectedY = Math.cos(.045) * deltaY - Math.sin(.045) * deltaZ;
      const expectedZ = Math.sin(.045) * deltaY + Math.cos(.045) * deltaZ;
      assert.ok(leftWrist.distanceTo(new THREE.Vector3(-x, expectedY, expectedZ)) < 1e-5, `${label} left paw follows its oar grip`);
      assert.ok(rightWrist.distanceTo(new THREE.Vector3(x, expectedY, expectedZ)) < 1e-5, `${label} right paw follows its oar grip`);
    }
  }
});
