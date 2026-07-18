import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const assetDir = path.resolve("public/game/animals/authored");
const sourceDir = path.resolve("tools/animal-pipeline/source");
const manifest = JSON.parse(fs.readFileSync(path.join(sourceDir, "gary-polar-bear.asset.json"), "utf8"));

function sha256(filepath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filepath)).digest("hex");
}

function readGlbJson(filepath) {
  const buffer = fs.readFileSync(filepath);
  assert.equal(buffer.subarray(0, 4).toString(), "glTF", `${filepath} must be a GLB`);
  assert.equal(buffer.readUInt32LE(4), 2, `${filepath} must use glTF 2.0`);
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) return JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString("utf8"));
    offset += 8 + length;
  }
  throw new Error(`${filepath} has no JSON chunk`);
}

function primitiveStats(gltf) {
  let triangles = 0;
  let vertices = 0;
  for (const mesh of gltf.meshes ?? []) for (const primitive of mesh.primitives ?? []) {
    triangles += gltf.accessors[primitive.indices].count / 3;
    vertices += gltf.accessors[primitive.attributes.POSITION].count;
  }
  return { triangles, vertices };
}

test("Gary is an original, realistically scaled, reproducible project asset", () => {
  assert.equal(manifest.id, "gary-polar-bear");
  assert.equal(manifest.license, "Original-Project-Asset");
  assert.match(manifest.generator, /tools\/animal-pipeline\/build_gary\.py$/);
  assert.match(manifest.provenance.geometry, /Original/i);
  assert.match(manifest.provenance.geometry, /no third-party geometry/i);
  assert.ok(manifest.provenance.visualReferences.every(url => /^https:\/\//.test(url)));
  assert.ok(manifest.dimensionsMeters.length >= 2.6 && manifest.dimensionsMeters.length <= 3.3);
  assert.ok(manifest.dimensionsMeters.height >= 1.45 && manifest.dimensionsMeters.height <= 1.85);
});

test("Gary carries 2K project-authored albedo, normal, and roughness maps", () => {
  assert.deepEqual(Object.keys(manifest.maps).sort(), ["albedo", "normal", "roughness"]);
  for (const [kind, map] of Object.entries(manifest.maps)) {
    const filepath = path.resolve(map.sourceFile);
    assert.equal(map.kind, kind);
    assert.equal(map.embeddedImageName, `gary-polar-bear-${kind}`);
    assert.equal(map.runtimeMimeType, kind === "roughness" ? "image/png" : "image/jpeg");
    assert.equal(map.width, 2048);
    assert.equal(map.height, 2048);
    assert.ok(map.bytes > 250_000, `${kind} must contain actual texture information`);
    assert.equal(fs.statSync(filepath).size, map.bytes);
    assert.equal(sha256(filepath), map.sha256);
  }
});

for (const lod of ["lod0", "lod2"]) test(`Gary ${lod} is a skinned, textured GLB with four authored clips`, () => {
  const contract = manifest[lod];
  const filepath = path.join(assetDir, contract.file);
  const gltf = readGlbJson(filepath);
  assert.equal(fs.statSync(filepath).size, contract.bytes);
  assert.equal(sha256(filepath), contract.sha256);
  assert.equal(gltf.skins.length, 1);
  assert.deepEqual(gltf.animations.map(animation => animation.name).sort(), ["BearForage", "BearIdle", "BearTurn", "BearWalk"]);
  assert.equal(gltf.images.length, 3);
  assert.ok(gltf.images.every(image => image.bufferView !== undefined));
  assert.equal(gltf.images.find(image => image.name === "gary-polar-bear-albedo")?.mimeType, "image/jpeg");
  assert.equal(gltf.images.find(image => image.name === "gary-polar-bear-normal")?.mimeType, "image/jpeg");
  assert.equal(gltf.images.find(image => image.name === "gary-polar-bear-roughness")?.mimeType, "image/png");

  const body = gltf.meshes.find(mesh => mesh.name.startsWith("GaryContinuousAnatomicalSkin"));
  assert.ok(body, "one semantic continuous body mesh must be present");
  assert.equal(body.primitives.length, 1, "the anatomical skin must not be an intersecting primitive assembly");
  const attributes = body.primitives[0].attributes;
  for (const attribute of ["POSITION", "NORMAL", "TANGENT", "TEXCOORD_0", "JOINTS_0", "WEIGHTS_0"])
    assert.ok(Number.isInteger(attributes[attribute]), `Body must export ${attribute}`);
  const fur = gltf.materials.find(material => material.name === "GaryPolarBearFur");
  assert.ok(fur.normalTexture);
  assert.ok(fur.pbrMetallicRoughness.baseColorTexture);
  assert.ok(fur.pbrMetallicRoughness.metallicRoughnessTexture);

  const names = [...(gltf.nodes ?? []).map(node => node.name), ...(gltf.meshes ?? []).map(mesh => mesh.name)].join(" ");
  assert.doesNotMatch(names, /\b(?:Cube|Sphere|Cylinder|Cone|Torus|SculptVolume)\b/i, "no Blender/default or blockout primitive may ship");
  assert.deepEqual(primitiveStats(gltf), { triangles: contract.triangles, vertices: contract.vertices });
});

test("Gary LOD budgets preserve the hero and materially reduce the mobile asset", () => {
  assert.ok(manifest.lod0.triangles >= 100_000 && manifest.lod0.triangles <= 160_000);
  assert.ok(manifest.lod2.triangles <= manifest.lod0.triangles * .38);
  assert.ok(manifest.lod2.vertices < manifest.lod0.vertices * .4);
  assert.equal(manifest.lod0.meshes, 6);
  assert.equal(manifest.lod2.meshes, 6);
  assert.ok(manifest.lod0.bytes < 8_000_000, "hero GLB should embed web-compressed maps");
  assert.ok(manifest.lod2.bytes < 7_000_000, "mobile GLB should not embed source PNGs");
});
