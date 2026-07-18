import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as esbuild from "esbuild";

async function loadVehicleHarness() {
  const result = await esbuild.build({
    stdin: {
      contents: `
        export { createSlothRig } from "./app/game/player/SlothRig.ts";
        export { createParkRowboat } from "./app/game/world/ParkRowboat.ts";
        export { createParkUtilityCart } from "./app/game/world/ParkUtilityCart.ts";
        export * as THREE from "three";
      `,
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
    logLevel: "silent",
  });
  const loadedModule = { exports: {} };
  new Function("module", "exports", "require", result.outputFiles[0].text)(
    loadedModule,
    loadedModule.exports,
    () => { throw new Error("vehicle harness encountered an unexpected external require"); },
  );
  return loadedModule.exports;
}

const { THREE, createSlothRig, createParkRowboat, createParkUtilityCart } = await loadVehicleHarness();

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
  assert.match(campaign, /BOW_BRIDGE_DECK_BASE_Y = -\.68/);
  assert.match(campaign, /Math\.max\(BOW_BRIDGE_DECK_BASE_Y/);
  assert.match(campaign, /bow-bridge-abutment-mounted-plaque/);
  assert.match(campaign, /const rotation = BOW_BRIDGE_YAW/);
  assert.match(campaign, /length: length \+ 5\.2/);
  assert.match(campaign, /bow-bridge-dry-elevated-deck/);
  assert.match(campaign, /bow-bridge-solid-underside/);
  assert.match(campaign, /bow-bridge-visible-side-fascia/);
  assert.match(world, /function bowBridgeSupportsPlayer/);
  assert.match(world, /export function lakeDockSurfaceHeightAt/);
  assert.match(world, /shoulderBlend = 1 - THREE\.MathUtils\.smoothstep/);
  assert.match(world, /shoreInset === 0 && \(bowBridgeSupportsPlayer\(x, z\) \|\| lakeDockSurfaceHeightAt\(x, z\) !== null\)/);
  assert.match(world, /dummy\.position\.y = dockTopAt\(definition, amount\) - \.0525/);
  assert.match(world, /return lakeDockSurfaceHeightAt\(x, z\) \?\? baseTerrainY\(x, z\)/);
  assert.match(world, /new THREE\.Vector3\(-20\.1, THE_LAKE_SURFACE_Y - \.04, -138\.2\)/);
  assert.match(world, /new THREE\.Vector3\(194\.7, THE_LAKE_SURFACE_Y - \.04, -295\.8\)/);
});

test("lake shore support, bridge approaches, and the subway excavation share authored terrain", async () => {
  const [game, world, campaign] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/CampaignLandmarks.ts", import.meta.url), "utf8"),
  ]);

  assert.match(world, /approachDatum = BOW_BRIDGE_DECK_BASE_Y - \.08/);
  assert.match(world, /terrainGeometryWithSubwayCutout/);
  assert.match(world, /insideSubwayCutout/);
  assert.match(world, /terrainSegments = quality > \.72 \? 248 : 184/);
  assert.match(campaign, /SUBWAY_STAIR_CUTOUT/);
  assert.match(game, /qaInput === "shoreclimb"/);
  assert.match(game, /terrainTargetY - \.52/);
});

test("shore forestry and first-person vehicle grips preserve visual clarity", async () => {
  const [game, world, sloth, cart, rowboat] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/RealisticWorld.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/player/SlothRig.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/ParkUtilityCart.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/game/world/ParkRowboat.ts", import.meta.url), "utf8"),
  ]);

  assert.match(world, /containsLakeWater\(x, z, -radius - 6\.5\)/);
  assert.match(world, /containsLakeWater\(x, z, -8\)/);
  assert.match(game, /layoutCanonicalSlothViewmodel/);
  assert.match(sloth, /layoutDepth/);
  assert.match(game, /getWorldGripTransforms\(vehicleGripTransforms\)/);
  assert.match(game, /camera\.worldToLocal\(vehicleGripTargets\.left\)/);
  assert.match(game, /camera\.worldToLocal\(vehicleGripTargets\.right\)/);
  assert.match(game, /setVehiclePose\("cart", -cart\.steeringAngleRadians \/ \.54, 0, 0, vehicleGripTargets\)/);
  assert.match(game, /setVehiclePose\("rowboat", activeBoat\.steeringAngleRadians \/ \.62, activeBoat\.oarStrokePhaseRadians, activeBoat\.rowingEffort, vehicleGripTargets\)/);
  assert.match(cart, /steering-wheel-left-hand-grip/);
  assert.match(cart, /steering-wheel-right-hand-grip/);
  assert.match(cart, /getWorldGripTransforms/);
  assert.match(rowboat, /getWorldGripTransforms/);
  assert.match(sloth, /vehicleMode === "cart"/);
  assert.match(sloth, /vehicleMode === "rowboat"/);
  assert.doesNotMatch(sloth, /wheelCenterX|gripWorldY|cameraTiltCosine/);
});

test("mobile vehicle braking emits Space and cart audio follows pause and resume", async () => {
  const [game, touch] = await Promise.all([
    readFile(new URL("../app/game/GameClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/mobile/TouchControls.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(touch, /\(vehicle \|\| arboreal\)/);
  assert.match(touch, /setHeld\(vehicle \? "Space" : "ShiftLeft", true\)/);
  assert.match(touch, /\["ShiftLeft", "Space"\]/);
  assert.match(game, /if \(next === "playing" && cartMotorStateRef\.current\.driving\) audio\.setCartMotor\(true, cartMotorStateRef\.current\.speed\)/);
  assert.match(game, /else if \(next !== "playing"\) audio\.setCartMotor\(false\)/);
  assert.match(game, /cartMotorState\.speed = traversalSpeed/);
});

test("cart and rowboat expose live grip transforms that remain camera-relative during free-look", () => {
  const texture = new THREE.Texture();
  const textures = new Proxy({}, { get: () => texture });
  const cart = createParkUtilityCart(textures, { position: new THREE.Vector3(7, 2, -4), rotationY: .38 });
  const rowboat = createParkRowboat(textures, { position: new THREE.Vector3(-5, 1, 8), rotationY: -.27 });
  for (let index = 0; index < 24; index++) {
    cart.update(1 / 60, { throttle: 0, steering: .8 });
    rowboat.update(1 / 60, { throttle: .7, steering: -.55 });
  }

  const transforms = {
    leftPosition: new THREE.Vector3(), leftQuaternion: new THREE.Quaternion(),
    rightPosition: new THREE.Vector3(), rightQuaternion: new THREE.Quaternion(),
  };
  const cameraPosition = new THREE.Vector3();
  const cameraQuaternion = new THREE.Quaternion();
  const camera = new THREE.PerspectiveCamera();
  camera.rotation.order = "YXZ";
  const rig = createSlothRig(texture);
  rig.root.scale.setScalar(.78);
  rig.left.userData.layoutZ = -.74;
  rig.right.userData.layoutZ = .74;

  const assertAttached = (label, vehicle, mode, steering, oarPhase = 0, rowingEffort = 0) => {
    vehicle.getWorldGripTransforms(transforms);
    vehicle.getWorldCameraTransform(cameraPosition, cameraQuaternion);
    camera.position.copy(cameraPosition);
    camera.rotation.set(.31, vehicle.root.rotation.y + 1.08, 0);
    camera.updateMatrixWorld(true);
    const targets = {
      left: camera.worldToLocal(transforms.leftPosition.clone()),
      right: camera.worldToLocal(transforms.rightPosition.clone()),
    };
    rig.setVehiclePose(mode, steering, oarPhase, rowingEffort, targets);
    rig.animate(2.35, 1.2, false);
    rig.root.updateMatrixWorld(true);
    const leftWrist = rig.left.userData.joints.wrist.getWorldPosition(new THREE.Vector3());
    const rightWrist = rig.right.userData.joints.wrist.getWorldPosition(new THREE.Vector3());
    assert.ok(leftWrist.distanceTo(targets.left) < 1e-5, `${label} left paw follows the live anchor in free-look`);
    assert.ok(rightWrist.distanceTo(targets.right) < 1e-5, `${label} right paw follows the live anchor in free-look`);
    assert.ok(leftWrist.distanceTo(rightWrist) > .16, `${label} paws retain physical separation`);
  };

  assertAttached("cart", cart, "cart", -cart.steeringAngleRadians / .54);
  assertAttached("rowboat", rowboat, "rowboat", rowboat.steeringAngleRadians / .62, rowboat.oarStrokePhaseRadians, rowboat.rowingEffort);
  cart.dispose();
  rowboat.dispose();
  texture.dispose();
});

test("first-person sloth arms use one skinned anatomical surface without bulbous joint covers", async () => {
  const sloth = await readFile(new URL("../app/game/player/SlothRig.ts", import.meta.url), "utf8");

  assert.match(sloth, /capStart = true/);
  assert.match(sloth, /capEnd = true/);
  assert.match(sloth, /capVertexRanges/);
  assert.match(sloth, /continuous-skinned-anatomical-arm/);
  assert.match(sloth, /new THREE\.SkinnedMesh/);
  assert.match(sloth, /new THREE\.Skeleton\(\[rootBone, elbow, wrist\]\)/);
  assert.match(sloth, /skinIndex/);
  assert.match(sloth, /skinWeight/);
  assert.match(sloth, /wrapT = THREE\.ClampToEdgeWrapping/);
  assert.doesNotMatch(sloth, /continuous-upper-arm|continuous-anatomical-forearm-sweep|continuous-anatomical-paw-sweep/);
  assert.doesNotMatch(sloth, /elbowMass|wristBlend|addEllipsoidShell|palmFur/);
});

test("skinned arm surfaces remain continuous and animated in every gameplay pose", () => {
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

  const assertCaps = (mesh, label) => {
    const positions = mesh.geometry.getAttribute("position");
    const normals = mesh.geometry.getAttribute("normal");
    const indices = mesh.geometry.getIndex();
    const { capVertexRanges } = mesh.geometry.userData.sweep;
    assert.equal(capVertexRanges.length, 2, `${label} caps only the shoulder and paw ends`);
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
      const mesh = arm.getObjectByName("continuous-skinned-anatomical-arm");
      const elbow = arm.getObjectByName("anatomical-elbow-bone");
      const wrist = arm.getObjectByName("anatomical-wrist-bone");
      for (const object of [mesh, elbow, wrist]) assert.ok(object, `${side} ${label} rig element exists`);
      assert.ok(mesh.isSkinnedMesh, `${side} ${label} arm is skinned as one surface`);
      assert.equal(mesh.skeleton.bones.length, 3, `${side} ${label} arm has shoulder, elbow, and wrist bones`);
      mesh.geometry.computeBoundingBox();
      assert.ok(mesh.geometry.boundingBox.min.y <= -.45, `${side} ${label} arm begins below the camera mount`);
      assert.ok(mesh.geometry.boundingBox.max.y >= .82, `${side} ${label} surface reaches through the paw`);
      assert.equal(mesh.geometry.getAttribute("skinIndex").count, mesh.geometry.getAttribute("position").count);
      assert.equal(mesh.geometry.getAttribute("skinWeight").count, mesh.geometry.getAttribute("position").count);
      const skinWeights = mesh.geometry.getAttribute("skinWeight");
      let blendedVertices = 0;
      for (let index = 0; index < skinWeights.count; index++) {
        const first = skinWeights.getX(index), second = skinWeights.getY(index);
        if (first > 0 && first < 1 && second > 0 && second < 1) blendedVertices++;
      }
      assert.ok(blendedVertices > 100, `${side} ${label} joints use broad deformation blends`);
      assertCaps(mesh, `${side} ${label} anatomical arm`);
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
    const gripTargets = mode === "none" ? undefined : {
      left: new THREE.Vector3(-.24 + steering * .025, -.36 + Math.sin(oarPhase) * .03, -.51),
      right: new THREE.Vector3(.24 + steering * .025, -.36 + Math.sin(oarPhase) * .03, -.51),
    };
    rig.setVehiclePose(mode, steering, oarPhase, rowingEffort, gripTargets);
    rig.animate(1.7, speed, gripping);
    assertContinuous(label);
    if (mode === "none") continue;

    rig.root.updateMatrixWorld(true);
    const leftWrist = rig.left.userData.joints.wrist.getWorldPosition(new THREE.Vector3());
    const rightWrist = rig.right.userData.joints.wrist.getWorldPosition(new THREE.Vector3());
    assert.ok(leftWrist.x < rightWrist.x, `${label} wrists remain on their authored sides`);
    assert.ok(rightWrist.x - leftWrist.x > .08, `${label} wrists never collapse into one another`);

    assert.ok(leftWrist.distanceTo(gripTargets.left) < 1e-5, `${label} left paw follows its supplied vehicle grip`);
    assert.ok(rightWrist.distanceTo(gripTargets.right) < 1e-5, `${label} right paw follows its supplied vehicle grip`);
  }
});
