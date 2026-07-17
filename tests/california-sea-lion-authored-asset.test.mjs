import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repositoryRoot = path.resolve(".");
const runtimeDir = path.join(repositoryRoot, "public/game/animals/authored");
const sourceDir = path.join(repositoryRoot, "tools/animal-pipeline/source");
const manifest = JSON.parse(
  fs.readFileSync(path.join(sourceDir, "california-sea-lion.asset.json"), "utf8"),
);
const metrics = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "tools/animal-pipeline/california-sea-lion-metrics.json"), "utf8"),
);

const clips = ["SeaLionDive", "SeaLionIdle", "SeaLionSurface", "SeaLionSwim"];

function sha256(filepath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filepath)).digest("hex");
}

function readGlbJson(filepath) {
  const buffer = fs.readFileSync(filepath);
  assert.equal(buffer.subarray(0, 4).toString(), "glTF", `${filepath} must be a GLB`);
  assert.equal(buffer.readUInt32LE(4), 2, `${filepath} must use glTF 2.0`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${filepath} must declare its exact length`);
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) {
      return JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString("utf8"));
    }
    offset += 8 + length;
  }
  throw new Error(`${filepath} has no JSON chunk`);
}

function primitiveStats(gltf) {
  let triangles = 0;
  let vertices = 0;
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      triangles += gltf.accessors[primitive.indices].count / 3;
      vertices += gltf.accessors[primitive.attributes.POSITION].count;
    }
  }
  return { triangles, vertices };
}

test("California sea lion is an original, reproducible, realistically scaled asset", () => {
  assert.equal(manifest.id, "california-sea-lion");
  assert.equal(manifest.species, "Zalophus californianus");
  assert.equal(manifest.license, "Original-Project-Asset");
  assert.match(manifest.generator, /tools\/animal-pipeline\/build_sea_lion\.py$/);
  assert.match(manifest.provenance.geometry, /Original repository-authored/i);
  assert.match(manifest.provenance.geometry, /no third-party geometry/i);
  assert.match(manifest.provenance.textures, /no third-party pixels/i);
  assert.ok(manifest.provenance.visualReferences.every(url => /^https:\/\//.test(url)));
  assert.ok(manifest.dimensionsMeters.length >= 2.6 && manifest.dimensionsMeters.length <= 3.3);
  assert.ok(manifest.dimensionsMeters.width >= 1 && manifest.dimensionsMeters.width <= 1.7);
  assert.ok(manifest.dimensionsMeters.height >= 1 && manifest.dimensionsMeters.height <= 1.6);

  const provenance = JSON.parse(
    fs.readFileSync(path.join(sourceDir, "california-sea-lion.provenance.json"), "utf8"),
  );
  assert.equal(provenance.license, "Original-Project-Asset");
  assert.deepEqual(provenance.thirdPartyAssets, []);
  assert.match(provenance.referenceUse, /no geometry or pixels copied/i);
  assert.deepEqual(provenance.visualReferences, manifest.provenance.visualReferences);

  const blend = fs.readFileSync(path.join(sourceDir, "california-sea-lion-source.blend"));
  assert.equal(blend.subarray(0, 7).toString("ascii"), "BLENDER");
  assert.ok(blend.length > 1_000_000, "source blend must retain the authored mesh, rig, and clips");
});

test("California sea lion carries original 2K albedo, normal, and roughness maps", () => {
  assert.deepEqual(Object.keys(manifest.maps).sort(), ["albedo", "normal", "roughness"]);
  for (const [kind, map] of Object.entries(manifest.maps)) {
    const filepath = path.resolve(map.sourceFile);
    assert.equal(map.kind, kind);
    assert.equal(map.embeddedImageName, `california-sea-lion-${kind}`);
    assert.equal(map.runtimeMimeType, kind === "roughness" ? "image/png" : "image/jpeg");
    assert.equal(map.width, 2048);
    assert.equal(map.height, 2048);
    assert.ok(map.bytes > 250_000, `${kind} must contain actual texture information`);
    assert.equal(fs.statSync(filepath).size, map.bytes);
    assert.equal(sha256(filepath), map.sha256);
  }
});

for (const lod of ["lod0", "lod2"]) {
  test(`California sea lion ${lod} is a skinned, textured GLB with four authored clips`, () => {
    const contract = manifest[lod];
    const filepath = path.join(runtimeDir, contract.file);
    const gltf = readGlbJson(filepath);
    assert.equal(fs.statSync(filepath).size, contract.bytes);
    assert.equal(sha256(filepath), contract.sha256);
    assert.equal(gltf.skins.length, 1);
    assert.equal(gltf.skins[0].joints.length, 17);
    assert.deepEqual(gltf.animations.map(animation => animation.name).sort(), clips);
    assert.ok(gltf.animations.every(animation => animation.channels.length >= 8));
    assert.equal(gltf.images.length, 3);
    assert.ok(gltf.images.every(image => image.bufferView !== undefined));
    assert.equal(
      gltf.images.find(image => image.name === "california-sea-lion-albedo")?.mimeType,
      "image/jpeg",
    );
    assert.equal(
      gltf.images.find(image => image.name === "california-sea-lion-normal")?.mimeType,
      "image/jpeg",
    );
    assert.equal(
      gltf.images.find(image => image.name === "california-sea-lion-roughness")?.mimeType,
      "image/png",
    );

    const body = gltf.meshes.find(mesh =>
      mesh.name.startsWith("CaliforniaSeaLionContinuousAnatomicalSkin"),
    );
    assert.ok(body, "one semantic continuous body mesh must be present");
    assert.equal(body.primitives.length, 1, "the anatomical skin must not be a primitive assembly");
    const attributes = body.primitives[0].attributes;
    for (const attribute of [
      "POSITION",
      "NORMAL",
      "TANGENT",
      "TEXCOORD_0",
      "JOINTS_0",
      "WEIGHTS_0",
    ]) {
      assert.ok(Number.isInteger(attributes[attribute]), `body must export ${attribute}`);
    }
    const wetHide = gltf.materials.find(material => material.name === "CaliforniaSeaLionWetHide");
    assert.ok(wetHide.normalTexture);
    assert.ok(wetHide.pbrMetallicRoughness.baseColorTexture);
    assert.ok(wetHide.pbrMetallicRoughness.metallicRoughnessTexture);

    const names = [
      ...(gltf.nodes ?? []).map(node => node.name),
      ...(gltf.meshes ?? []).map(mesh => mesh.name),
    ].join(" ");
    assert.doesNotMatch(
      names,
      /\b(?:Cube|Sphere|Cylinder|Cone|Torus|SculptVolume)\b/i,
      "no Blender/default or blockout primitive may ship",
    );
    assert.doesNotMatch(
      names,
      /(?:DigitChannel|DigitCrease|InsetCutter)/i,
      "flipper digit channels must be sculpted into the skin, never detached line meshes",
    );
    assert.deepEqual(primitiveStats(gltf), {
      triangles: contract.triangles,
      vertices: contract.vertices,
    });
  });
}

test("California sea lion LOD budgets preserve the hero and reduce the mobile mesh", () => {
  assert.equal(metrics.speciesId, manifest.id);
  assert.deepEqual(metrics.clips.sort(), clips);
  assert.deepEqual(metrics.dimensionsMeters, manifest.dimensionsMeters);
  assert.deepEqual(metrics.skeleton, manifest.skeleton);
  assert.deepEqual(metrics.maps, manifest.maps);
  assert.deepEqual(metrics.previews, manifest.previews);
  assert.deepEqual(metrics.lod0, manifest.lod0);
  assert.deepEqual(metrics.lod2, manifest.lod2);
  assert.ok(manifest.lod0.triangles >= 110_000 && manifest.lod0.triangles <= 160_000);
  assert.ok(manifest.lod2.triangles <= manifest.lod0.triangles * .38);
  assert.ok(manifest.lod2.vertices < manifest.lod0.vertices * .4);
  assert.equal(manifest.lod0.meshes, 9);
  assert.equal(manifest.lod2.meshes, 9);
  assert.ok(manifest.lod0.bytes < 8_000_000, "hero GLB should embed compressed runtime maps");
  assert.ok(manifest.lod2.bytes < 7_000_000, "mobile GLB should not embed source PNGs");

  const publicSeaLionFiles = fs
    .readdirSync(runtimeDir)
    .filter(name => name.startsWith("california-sea-lion"))
    .sort();
  assert.deepEqual(publicSeaLionFiles, [
    "california-sea-lion-lod0.glb",
    "california-sea-lion-lod2.glb",
  ]);
});
