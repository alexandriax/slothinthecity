import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const ASSET_ROOT = new URL("../public/game/characters/authored/", import.meta.url);
const MANIFEST_URL = new URL("manifest.json", ASSET_ROOT);
const ARCHETYPES = [
  "human-male-short",
  "human-male-curly",
  "human-female-bob",
  "human-female-ponytail",
];
const MATERIALS = [
  "Skin",
  "ClothUpper",
  "ClothLower",
  "Hair",
  "Shoe",
  "EyeWhite",
  "Iris",
  "Pupil",
].sort();
const BONES = [
  "Hips",
  "Spine",
  "Chest",
  "Neck",
  "Head",
  "UpperArm.L",
  "LowerArm.L",
  "Hand.L",
  "UpperArm.R",
  "LowerArm.R",
  "Hand.R",
  "UpperLeg.L",
  "LowerLeg.L",
  "Foot.L",
  "UpperLeg.R",
  "LowerLeg.R",
  "Foot.R",
].sort();

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;

async function loadGlb(file) {
  const buffer = await readFile(new URL(file, ASSET_ROOT));
  assert.ok(buffer.length >= 28, `${file} should contain a GLB header and chunks`);
  assert.equal(buffer.readUInt32LE(0), GLB_MAGIC, `${file} should use the glTF binary magic`);
  assert.equal(buffer.readUInt32LE(4), 2, `${file} should use glTF 2.0`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${file} should declare its exact byte length`);

  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), JSON_CHUNK, `${file} should begin with a JSON chunk`);
  const jsonEnd = 20 + jsonLength;
  const json = JSON.parse(buffer.subarray(20, jsonEnd).toString("utf8").trim());
  assert.ok(jsonEnd + 8 <= buffer.length, `${file} should include a binary geometry chunk`);
  const binaryLength = buffer.readUInt32LE(jsonEnd);
  assert.equal(buffer.readUInt32LE(jsonEnd + 4), BIN_CHUNK, `${file} should contain a BIN chunk`);
  assert.equal(jsonEnd + 8 + binaryLength, buffer.length, `${file} BIN chunk should consume the remaining payload`);
  return { buffer, json };
}

function primitives(json) {
  return (json.meshes ?? []).flatMap(mesh => mesh.primitives ?? []);
}

function gltfTriangleCount(json) {
  return primitives(json).reduce((total, primitive) => {
    assert.ok(Number.isInteger(primitive.indices), "authored human primitives should be indexed");
    return total + json.accessors[primitive.indices].count / 3;
  }, 0);
}

function gltfVertexCount(json) {
  return primitives(json).reduce(
    (total, primitive) => total + json.accessors[primitive.attributes.POSITION].count,
    0,
  );
}

function lossyWebpDimensions(buffer) {
  assert.equal(buffer.subarray(12, 16).toString("ascii"), "VP8 ", "atlas should use the expected lossy VP8 WebP payload");
  assert.deepEqual([...buffer.subarray(23, 26)], [0x9d, 0x01, 0x2a], "atlas should contain a valid VP8 frame header");
  return {
    width: buffer.readUInt16LE(26) & 0x3fff,
    height: buffer.readUInt16LE(28) & 0x3fff,
  };
}

test("authored-human manifest pins complete CC0 provenance and the shipping interface", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_URL, "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.generator, "tools/character-pipeline/build_humans.py");
  assert.deepEqual(manifest.materials.toSorted(), MATERIALS);
  assert.deepEqual(manifest.archetypes.map(entry => entry.id).toSorted(), ARCHETYPES.toSorted());
  assert.deepEqual(manifest.source, {
    license: "CC0-1.0",
    name: "Blender Studio Human Base Meshes bundle v1.0.0",
    sha256: "46a912c0524072ac3b78c35d5d2471df7b8df102394a050ca8cd7184e3393648",
    url: "https://download.blender.org/demo/bundles/bundles-3.6/human-base-meshes-bundle-v1.0.0.zip",
  });
  for (const entry of manifest.archetypes) {
    assert.equal(entry.license, "CC0-1.0", `${entry.id} should retain source license provenance`);
    assert.ok(["male", "female"].includes(entry.source), `${entry.id} should identify its source base`);
    assert.equal(entry.lod0.file, `${entry.id}-lod0.glb`);
    assert.equal(entry.lod2.file, `${entry.id}-lod2.glb`);
  }
});

test("all eight GLBs stay Draco-compressed, truly skinned, animated, and draw-call bounded", async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_URL, "utf8"));

  for (const archetype of manifest.archetypes) {
    const loaded = {};
    for (const lod of ["lod0", "lod2"]) {
      const contract = archetype[lod];
      const { buffer, json } = await loadGlb(contract.file);
      loaded[lod] = { buffer, json };
      const allPrimitives = primitives(json);
      const meshNodes = (json.nodes ?? []).filter(node => Number.isInteger(node.mesh));
      const nodeNames = (json.nodes ?? []).map(node => node.name ?? "");

      assert.ok(
        nodeNames.every(name => !/mouthdetail|brow\.|garmentplacket|collar\.|bobstrand|ponytail|curl\./i.test(name)),
        `${contract.file} should not ship detached face, hair, or garment primitives`,
      );

      assert.equal(json.asset.version, "2.0", `${contract.file} should be glTF 2.0`);
      assert.deepEqual(json.extensionsRequired, ["KHR_draco_mesh_compression"]);
      assert.ok(json.extensionsUsed.includes("KHR_draco_mesh_compression"));
      assert.equal(json.scenes?.length, 1, `${contract.file} should have one scene`);
      assert.equal(json.meshes?.length, contract.meshes);
      assert.ok(json.meshes.length <= 10, `${contract.file} should stay within ten material draw calls`);
      assert.equal(allPrimitives.length, json.meshes.length, `${contract.file} should keep one primitive per mesh/material`);
      assert.equal(meshNodes.length, json.meshes.length);
      assert.ok(meshNodes.every(node => Number.isInteger(node.skin)), `${contract.file} every rendered mesh should reference its skin`);
      assert.deepEqual((json.materials ?? []).map(material => material.name).toSorted(), MATERIALS);
      assert.equal(json.materials.length, contract.materials);
      assert.equal(json.images, undefined, `${contract.file} should not embed duplicate atlas images`);
      assert.equal(json.textures, undefined, `${contract.file} should use shared runtime atlases`);

      for (const [index, primitive] of allPrimitives.entries()) {
        assert.ok(primitive.extensions?.KHR_draco_mesh_compression, `${contract.file} primitive ${index} should be Draco-compressed`);
        assert.deepEqual(
          Object.keys(primitive.attributes).toSorted(),
          ["JOINTS_0", "NORMAL", "POSITION", "TEXCOORD_0", "WEIGHTS_0"],
          `${contract.file} primitive ${index} should retain UVs, normals, and skin weights`,
        );
      }

      assert.equal(json.skins?.length, 1, `${contract.file} should use one shared skeleton`);
      const skin = json.skins[0];
      assert.ok(Number.isInteger(skin.inverseBindMatrices), `${contract.file} should carry inverse bind matrices`);
      assert.deepEqual(skin.joints.map(node => json.nodes[node].name).toSorted(), BONES);
      assert.ok((json.animations?.length ?? 0) >= 1, `${contract.file} should remain animation-ready`);
      assert.ok(json.animations.some(animation => animation.channels.length >= 2), `${contract.file} should carry the authored idle clip`);

      const triangles = gltfTriangleCount(json);
      const vertices = gltfVertexCount(json);
      assert.equal(triangles, contract.triangles, `${contract.file} manifest triangle count should match its GLB`);
      assert.ok(vertices >= contract.vertices, `${contract.file} exported vertex count should include at least its source vertices`);
      assert.ok(vertices < contract.vertices * 1.35, `${contract.file} seam splitting should remain bounded`);
      assert.equal(buffer.length, contract.bytes, `${contract.file} manifest byte count should match`);

      const limits = lod === "lod0"
        ? { minTriangles: 60_000, maxTriangles: 80_000, maxBytes: 600_000 }
        : { minTriangles: 17_000, maxTriangles: 25_000, maxBytes: 260_000 };
      assert.ok(triangles >= limits.minTriangles, `${contract.file} should retain its anatomical detail floor`);
      assert.ok(triangles <= limits.maxTriangles, `${contract.file} should respect its triangle ceiling`);
      assert.ok(buffer.length <= limits.maxBytes, `${contract.file} should respect its compressed byte ceiling`);
    }

    assert.ok(
      loaded.lod2.buffer.length < loaded.lod0.buffer.length * 0.5,
      `${archetype.id} mobile LOD should be less than half the close asset bytes`,
    );
    assert.ok(
      gltfTriangleCount(loaded.lod2.json) < gltfTriangleCount(loaded.lod0.json) * 0.32,
      `${archetype.id} mobile LOD should remove at least 68% of close triangles`,
    );
  }
});

test("authored-human atlases and local Draco decoder are packaged for offline hosting", async () => {
  for (const file of ["human-skin-pbr-v4.webp", "human-cloth-pbr-v4.webp"]) {
    const url = new URL(`../public/game/characters/${file}`, import.meta.url);
    const buffer = await readFile(url);
    assert.equal(buffer.subarray(0, 4).toString("ascii"), "RIFF", `${file} should be a RIFF WebP`);
    assert.equal(buffer.subarray(8, 12).toString("ascii"), "WEBP", `${file} should be a WebP`);
    assert.deepEqual(lossyWebpDimensions(buffer), { width: 1254, height: 1254 }, `${file} should retain its 2x2 atlas dimensions`);
    assert.ok(buffer.length > 300_000 && buffer.length < 1_000_000, `${file} should be a substantial compressed atlas`);
  }

  const decoderRoot = new URL("../public/game/draco/", import.meta.url);
  const decoderJs = await readFile(new URL("draco_decoder.js", decoderRoot), "utf8");
  const wrapperJs = await readFile(new URL("draco_wasm_wrapper.js", decoderRoot), "utf8");
  const wasm = await readFile(new URL("draco_decoder.wasm", decoderRoot));
  assert.match(decoderJs, /DracoDecoderModule/);
  assert.match(wrapperJs, /DracoDecoderModule/);
  assert.deepEqual([...wasm.subarray(0, 4)], [0x00, 0x61, 0x73, 0x6d], "Draco decoder should be WebAssembly");
  assert.ok((await stat(new URL("draco_decoder.js", decoderRoot))).size > 400_000);
  assert.ok(wasm.length > 150_000);
});

test("runtime loader points at the packaged LODs, atlases, Draco decoder, and skeleton clone path", async () => {
  const source = await readFile(
    new URL("../app/game/world/characters/AuthoredHumanAssets.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /AUTHORED_HUMAN_ROOT = "\/game\/characters\/authored"/);
  assert.match(source, /DRACO_DECODER_ROOT = "\/game\/draco\/"/);
  assert.match(source, /human-skin-pbr-v4\.webp/);
  assert.match(source, /human-cloth-pbr-v4\.webp/);
  assert.match(source, /new DRACOLoader\(\)/);
  assert.match(source, /new GLTFLoader\(\)/);
  assert.match(source, /loader\.setDRACOLoader\(draco\)/);
  assert.match(source, /cloneSkeleton\(template\.scene\)/);
  assert.match(source, /preferredLod === "lod0" \? "lod2" : "lod0"/);
  assert.match(source, /name\.includes\("lip"\)/);
});
