import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import * as esbuild from "esbuild";

const readSource = path => readFile(new URL(path, import.meta.url), "utf8");

let harnessPromise;
function loadBronxZooHarness() {
  harnessPromise ??= (async () => {
    const nodeRequire = createRequire(import.meta.url);
    const result = await esbuild.build({
      stdin: {
        contents: `
          export { BronxZooWorld } from "./app/game/world/BronxZooWorld.ts";
          export * as THREE from "three";
        `,
        resolveDir: process.cwd(),
      },
      bundle: true,
      platform: "node",
      format: "cjs",
      external: [
        "three/addons/loaders/DRACOLoader.js",
        "three/addons/loaders/GLTFLoader.js",
        "three/addons/utils/SkeletonUtils.js",
      ],
      write: false,
      logLevel: "silent",
    });
    const loadedModule = { exports: {} };
    new Function("module", "exports", "require", result.outputFiles[0].text)(
      loadedModule,
      loadedModule.exports,
      request => nodeRequire(request),
    );
    return loadedModule.exports;
  })();
  return harnessPromise;
}

function textureSet(THREE) {
  const texture = () => {
    const result = new THREE.Texture();
    result.source = new THREE.Source({ width: 4, height: 4 });
    return result;
  };
  return {
    ground: texture(), bark: texture(), fur: texture(), zooAnimalAtlas: texture(),
    foliage: texture(), foliageBranch: texture(), fern: texture(), gravel: texture(),
    stone: texture(), moss: texture(), waterNormal: texture(),
  };
}

test("visitor paths use terrain-following drainage edges instead of detached box kerbs", async () => {
  const [source, { BronxZooWorld, THREE }] = await Promise.all([
    readSource("../app/game/world/BronxZooWorld.ts"),
    loadBronxZooHarness(),
  ]);
  const edgeBuilder = source.slice(source.indexOf("function addPathDrainageEdges"), source.indexOf("// Visitor circulation"));
  assert.match(edgeBuilder, /pathPointNormal\(points, segmentIndex\)/);
  assert.match(edgeBuilder, /pathPointNormal\(points, segmentIndex \+ 1\)/);
  assert.doesNotMatch(edgeBuilder, /BoxGeometry/, "path edges must conform to the same mitered boundary as the path ribbon");

  const world = new BronxZooWorld(new THREE.Scene(), textureSet(THREE), .22);
  const edges = [];
  world.root.traverse(object => {
    if (object.name.endsWith("-terrain-following-drainage-edges")) edges.push(object);
  });
  assert.equal(edges.length, 9);
  edges.forEach(edge => {
    const positions = edge.geometry.getAttribute("position");
    assert.ok(positions.count >= 40, `${edge.name} should contain both continuous path boundaries`);
    edge.geometry.computeBoundingBox();
    assert.ok(edge.geometry.boundingBox.max.y - edge.geometry.boundingBox.min.y < 2, `${edge.name} should remain terrain-hugging`);
  });
  world.dispose();
});

test("Bronx Zoo collision projects companions off full signs, benches, and degenerate circles", async () => {
  const { BronxZooWorld, THREE } = await loadBronxZooHarness();
  const world = new BronxZooWorld(new THREE.Scene(), textureSet(THREE), .22);
  const velocity = new THREE.Vector3(1, 0, 1);

  const signCenter = new THREE.Vector3(-31, 0, -39), signYaw = -.74;
  const signPoint = new THREE.Vector3(1.8, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), signYaw).add(signCenter);
  world.resolveCompanion(signPoint, velocity, .7);
  const signLocal = signPoint.clone().sub(signCenter).applyAxisAngle(new THREE.Vector3(0, 1, 0), -signYaw);
  assert.ok(Math.abs(signLocal.x) >= 3.02 - 1e-6 || Math.abs(signLocal.z) >= .88 - 1e-6, "companion remained inside the World of Birds sign face");

  const benchCenter = new THREE.Vector3(-11, 0, -31), benchYaw = -.12;
  const benchPoint = new THREE.Vector3(.9, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), benchYaw).add(benchCenter);
  world.resolveCompanion(benchPoint, velocity, .62);
  const benchLocal = benchPoint.clone().sub(benchCenter).applyAxisAngle(new THREE.Vector3(0, 1, 0), -benchYaw);
  assert.ok(Math.abs(benchLocal.x) >= 2.34 - 1e-6 || Math.abs(benchLocal.z) >= 1.1 - 1e-6, "companion remained inside a visitor bench");

  const fountainCenter = new THREE.Vector3(-12, 0, -1);
  world.resolveCompanion(fountainCenter, velocity, .5);
  assert.ok(Math.hypot(fountainCenter.x + 12, fountainCenter.z + 1) >= 4.8 - 1e-6, "an exact-center circle overlap must get a stable escape direction");
  world.dispose();
});

test("Gary's follower footprint clears his authored shoulders and hips", async () => {
  const source = await readSource("../app/game/world/GaryCompanion.ts");
  assert.match(source, /radius: 1\.35/);
  assert.match(source, /this\.scooterMode \? 1\.2 : 1\.35/);
});

test("full-screen zoo mechanics stop hidden world rendering and keep extreme targets in-frame", async () => {
  const [game, screen] = await Promise.all([
    readSource("../app/game/SubwayGame.tsx"),
    readSource("../app/game/ZooSideQuestScreen.tsx"),
  ]);
  assert.match(game, /if \(zooOverlayPaused\) \{[\s\S]{0,220}overlayBackdropRendered = true;[\s\S]{0,80}return;/);
  assert.match(screen, /clamp\(50 \+ point\.x \* 6\.2, 12, 88\)/);
  assert.match(screen, /clamp\(96 - point\.y \* 7, 10, 88\)/);
});
