import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, readdir } from "node:fs/promises";
import test from "node:test";

const ASSET_ROOT = new URL("../public/game/animals/authored/", import.meta.url);
const REPOSITORY_ROOT = new URL("../", import.meta.url);
const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const EXPECTED_SPECIES = {
  "california-sea-lion": ["SeaLionIdle", "SeaLionSwim", "SeaLionSurface", "SeaLionDive"],
  "gary-polar-bear": ["BearIdle", "BearWalk", "BearForage", "BearTurn"],
  "spider-monkey": ["MonkeyIdle", "MonkeyWalk", "MonkeyPerch", "MonkeyClimb", "MonkeySwing"],
  "sun-conure": ["LandingSettle", "Perch", "Preen", "ShortFlight"],
};

async function loadGlb(file) {
  const buffer = await readFile(new URL(file, ASSET_ROOT));
  assert.ok(buffer.length >= 28, `${file} should contain complete GLB chunks`);
  assert.equal(buffer.readUInt32LE(0), GLB_MAGIC, `${file} should use the glTF binary magic`);
  assert.equal(buffer.readUInt32LE(4), 2, `${file} should use glTF 2.0`);
  assert.equal(buffer.readUInt32LE(8), buffer.length, `${file} should declare its exact byte length`);
  const jsonLength = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(16), JSON_CHUNK, `${file} should begin with JSON`);
  const jsonEnd = 20 + jsonLength;
  const json = JSON.parse(buffer.subarray(20, jsonEnd).toString("utf8").trim());
  assert.equal(buffer.readUInt32LE(jsonEnd + 4), BIN_CHUNK, `${file} should include a binary geometry chunk`);
  const binaryLength = buffer.readUInt32LE(jsonEnd);
  assert.equal(jsonEnd + 8 + binaryLength, buffer.length, `${file} binary chunk should consume the payload`);
  return { buffer, json };
}

function primitives(json) {
  return (json.meshes ?? []).flatMap(mesh => mesh.primitives ?? []);
}

function triangleCount(json) {
  return primitives(json).reduce((total, primitive) => {
    assert.ok(Number.isInteger(primitive.indices), "authored animal surfaces should be indexed");
    return total + json.accessors[primitive.indices].count / 3;
  }, 0);
}

function vertexCount(json) {
  return primitives(json).reduce(
    (total, primitive) => total + json.accessors[primitive.attributes.POSITION].count,
    0,
  );
}

test("authored zoo animal runtime is manifest-driven, skeleton-safe, and never flashes procedural bodies", async () => {
  const [source, showroom, subway] = await Promise.all([
    readFile(new URL("../app/game/world/animals/AuthoredZooAnimalAssets.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/debug/animals/AnimalShowroom.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/game/SubwayGame.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(source, /AUTHORED_ZOO_ANIMAL_ROOT = "\/game\/animals\/authored"/);
  assert.match(source, /APPROVED_AUTHORED_ZOO_ANIMAL_SPECIES/);
  assert.match(source, /"gary-polar-bear",\s+"spider-monkey",\s+"california-sea-lion",\s+"sun-conure"/);
  assert.match(source, /if \(!APPROVED_AUTHORED_ZOO_ANIMAL_SPECIES\.has\(speciesId\)\)/);
  assert.match(source, /fetch\(`\$\{AUTHORED_ZOO_ANIMAL_ROOT\}\/manifest\.json`, \{ cache: "no-cache" \}\)/);
  assert.match(source, /new DRACOLoader\(\)/);
  assert.match(source, /new GLTFLoader\(\)/);
  assert.match(source, /loader\.setDRACOLoader\(draco\)/);
  assert.match(source, /cloneSkeleton\(template\.scene\)/);
  assert.match(source, /host\.visible = false;[\s\S]*typeof window === "undefined"/);
  assert.match(source, /releaseFallback\(state\);[\s\S]*clearHostGeometry\(host\);[\s\S]*host\.add\(instance\)/);
  assert.match(source, /host\.userData\.authoredZooAnimalStatus = "authored-load-failed"/);
  assert.match(source, /new THREE\.AnimationMixer\(instance\)/);
  assert.match(source, /fadeIn\(\.18\)/);
  assert.match(source, /euclideanModulo\(state\.options\.phaseOffset/);
  assert.match(source, /preloadAuthoredZooAnimals/);
  assert.match(source, /markAuthoredZooAnimalsDisposed/);
  assert.match(source, /material\.normalMap/);
  assert.match(source, /material\.roughnessMap/);
  assert.match(showroom, /inspectAuthoredZooAnimal\(rig\.root\)/);
  assert.match(showroom, /authored asset failed QA/);
  assert.match(showroom, /Active clip/);
  assert.match(showroom, /authoredState\.contract\.triangles/);
  assert.match(showroom, /if \(!authoredManaged && !bounds\.isEmpty\(\) && Number\.isFinite\(bounds\.min\.y\)\)/);
  assert.match(showroom, /if \(bounds\.isEmpty\(\)\) return false/);
  assert.match(showroom, /every\(Number\.isFinite\)/);
  assert.match(subway, /option\.journeyKey === "LEXINGTON_TO_WEST_FARMS"[\s\S]*preloadAuthoredZooAnimals/);
  assert.match(subway, /species: "gary-polar-bear"/);
  assert.match(subway, /species: "spider-monkey"/);
  assert.match(subway, /species: "sun-conure"/);
});

test("original animal manifest pins every reviewed species, authored PBR maps, clips, LODs, and hashes", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", ASSET_ROOT), "utf8"));
  assert.equal(manifest.schemaVersion, 1);
  assert.match(manifest.generator, /^tools\/animal-pipeline\//);
  assert.deepEqual(manifest.species.map(entry => entry.id).toSorted(), Object.keys(EXPECTED_SPECIES).toSorted());

  for (const species of manifest.species) {
    assert.equal(species.license, "Project-original", `${species.id} should be an original project asset`);
    assert.equal(species.source.referenceUse, "visual-reference-only");
    assert.match(species.source.generator, /^tools\/animal-pipeline\//);
    assert.match(species.source.blendFile, /^tools\/animal-pipeline\/source\/.*\.blend$/);
    assert.ok(species.source.method.length >= 24, `${species.id} should document its original modeling method`);
    const sourceBlend = await readFile(new URL(species.source.blendFile, REPOSITORY_ROOT));
    const isPlainBlend = sourceBlend.subarray(0, 7).toString("ascii") === "BLENDER";
    const isZstdBlend = sourceBlend.length >= 4 && sourceBlend.readUInt32LE(0) === 0xfd2fb528;
    assert.ok(isPlainBlend || isZstdBlend, `${species.id} should retain its original Blender source`);
    assert.equal(sourceBlend.length, species.source.blendBytes);
    assert.equal(createHash("sha256").update(sourceBlend).digest("hex"), species.source.blendSha256);
    await assert.rejects(
      access(new URL(`${species.source.blendFile}1`, REPOSITORY_ROOT)),
      `${species.id} should not retain an accidental Blender backup beside its reviewed source`,
    );
    assert.ok(species.targetHeightMeters > .15 && species.targetHeightMeters < 2.5);
    assert.ok(["+z", "-z"].includes(species.sourceFacing));
    assert.deepEqual(
      [...new Set(Object.values(species.clips).flat())].toSorted(),
      EXPECTED_SPECIES[species.id].toSorted(),
      `${species.id} should map every reviewed clip explicitly`,
    );
    assert.deepEqual([...new Set(species.textures.map(texture => texture.kind))].toSorted(), ["albedo", "normal", "roughness"]);
    for (const texture of species.textures) {
      assert.equal(texture.embedded, true, `${texture.kind} should ship inside each reviewed GLB, not as a duplicate public file`);
      assert.match(texture.sourceFile, /^tools\/animal-pipeline\/source\//);
      assert.ok(texture.embeddedImage.length >= 4);
      const buffer = await readFile(new URL(texture.sourceFile, REPOSITORY_ROOT));
      assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], `${texture.sourceFile} should be PNG`);
      assert.equal(buffer.readUInt32BE(16), texture.width);
      assert.equal(buffer.readUInt32BE(20), texture.height);
      const minimumTextureSize = species.id === "sun-conure" ? 1024 : 2048;
      assert.ok(texture.width >= minimumTextureSize && texture.height >= minimumTextureSize, `${texture.sourceFile} should retain close-view texture detail`);
      assert.equal(buffer.length, texture.bytes);
      assert.equal(createHash("sha256").update(buffer).digest("hex"), texture.sha256);
    }
  }
});

test("manifest generation publishes only animals that passed visual review", async () => {
  const builder = await readFile(new URL("../tools/animal-pipeline/build-manifest.mjs", import.meta.url), "utf8");
  for (const species of Object.keys(EXPECTED_SPECIES)) {
    assert.match(builder, new RegExp(`id: ["']${species}["'],\\s+approved: true`));
  }
  assert.match(builder, /id: ["']sun-conure["'],\s+approved: true/);
  assert.match(builder, /id: ["']plains-zebra["'],\s+approved: false/);
  assert.match(builder, /reviewedSpecies\.filter\(review => review\.approved\)/);
  assert.match(builder, /not visually approved/);
  assert.match(builder, /contract\.sha256 !== assetContract\.sha256/);
  assert.match(builder, /contract\.bytes !== assetContract\.bytes/);
  assert.match(builder, /path\.basename\(filename\) !== filename/);
  assert.match(builder, /Rejected or unreviewed animal files remain deployable/);
});

test("the deployable animal directory contains only visually approved manifest assets", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", ASSET_ROOT), "utf8"));
  assert.ok(
    manifest.species.every(species => Object.hasOwn(EXPECTED_SPECIES, species.id)),
    "the deployable manifest must not grant approval to a rejected species",
  );
  const approvedFiles = new Set([
    "manifest.json",
    ...manifest.species.flatMap(species => [species.lod0?.file, species.lod1?.file, species.lod2?.file]),
  ].filter(Boolean));
  const deployedFiles = (await readdir(ASSET_ROOT)).filter(file => !file.startsWith("."));
  assert.deepEqual(
    deployedFiles.toSorted(),
    [...approvedFiles].toSorted(),
    "rejected studies must never be left in public/, even when the runtime manifest omits them",
  );
});

test("production animal generators cannot ingest third-party scenes, models, textures, or downloads", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", ASSET_ROOT), "utf8"));
  const forbiddenIngestion = [
    /\brequests\s*\.\s*(?:get|post|request)\s*\(/,
    /\burllib\b|\burlopen\s*\(/,
    /(?:subprocess\.(?:run|call|Popen)|os\.system)\s*\([^)]*\b(?:curl|wget)\b/,
    /bpy\.data\.libraries\.load\s*\(/,
    /bpy\.ops\.wm\.(?:append|link)\s*\(/,
    /bpy\.ops\.import_(?:mesh|image)\b/,
    /bpy\.ops\.import_scene\.(?!gltf\b)/,
  ];

  for (const species of manifest.species) {
    const generator = await readFile(new URL(species.source.generator, REPOSITORY_ROOT), "utf8");
    for (const pattern of forbiddenIngestion) {
      assert.doesNotMatch(
        generator,
        pattern,
        `${species.id} generator must construct the reviewed asset from repository-authored source only`,
      );
    }
    const gltfImports = generator.match(/bpy\.ops\.import_scene\.gltf\b/g) ?? [];
    assert.ok(gltfImports.length <= 1, `${species.id} may only re-import one freshly exported GLB for QA`);
    if (gltfImports.length) {
      assert.match(
        generator,
        /(?:def calibrate_root_from_fresh_import\([\s\S]*?bpy\.ops\.import_scene\.gltf\(filepath=str\(path\.resolve\(\)\)\)|def render_fresh_import\([\s\S]*?bpy\.ops\.import_scene\.gltf\(filepath=str\(glb\)\))/,
        `${species.id} may only re-import its own local export for fresh-import calibration or render QA`,
      );
    }
    assert.match(generator, /bpy/, `${species.id} should retain a reproducible Blender generator`);
  }
});

test("authored animal GLBs are continuous skinned meshes with PBR texture inputs and real clips", async () => {
  const manifest = JSON.parse(await readFile(new URL("manifest.json", ASSET_ROOT), "utf8"));
  for (const species of manifest.species) {
    const loaded = {};
    for (const lod of ["lod0", "lod2"]) {
      const contract = species[lod];
      assert.ok(contract, `${species.id} should package ${lod}`);
      const { buffer, json } = await loadGlb(contract.file);
      loaded[lod] = { buffer, json };
      const meshNodes = (json.nodes ?? []).filter(node => Number.isInteger(node.mesh));
      const skinnedMeshNodes = meshNodes.filter(node => Number.isInteger(node.skin));
      const nodeNames = (json.nodes ?? []).map(node => node.name ?? "");

      assert.equal(json.asset.version, "2.0");
      assert.equal(json.scenes?.length, 1, `${contract.file} should have one authored scene`);
      assert.ok(json.skins?.length >= 1, `${contract.file} should include a skeleton`);
      assert.ok(skinnedMeshNodes.length >= 1, `${contract.file} should bind its continuous body mesh to the skeleton`);
      const minimumBones = species.id === "sun-conure" ? 40 : species.id === "spider-monkey" ? 24 : species.id === "gary-polar-bear" ? 18 : 10;
      assert.ok(json.skins[0].joints.length >= minimumBones, `${contract.file} should retain a complete animal rig`);
      assert.ok(nodeNames.every(name => !/(^|[_ .-])(ico)?sphere|torus|capsule|cylinder|cone|cube([_ .-]|$)/i.test(name)), `${contract.file} should not expose primitive construction parts`);
      assert.equal(primitives(json).length, contract.meshes, `${contract.file} contract should count runtime primitives`);
      assert.equal(json.materials.length, contract.materials);
      assert.ok(json.images?.length >= 3, `${contract.file} should embed original albedo, normal, and roughness sources`);
      assert.ok(json.textures?.length >= 3, `${contract.file} should bind its original texture sources`);
      assert.ok(json.materials.some(material => material.pbrMetallicRoughness?.baseColorTexture), `${contract.file} should use mapped albedo`);
      assert.ok(json.materials.some(material => material.normalTexture), `${contract.file} should use tangent-space mapped normals`);
      assert.ok(json.materials.some(material => material.pbrMetallicRoughness?.metallicRoughnessTexture), `${contract.file} should use mapped surface roughness`);
      for (const texture of species.textures) {
        assert.ok(json.images.some(image => image.name === texture.embeddedImage), `${contract.file} should embed reviewed ${texture.kind} image ${texture.embeddedImage}`);
      }

      for (const node of skinnedMeshNodes) {
        for (const primitive of json.meshes[node.mesh].primitives) {
          assert.ok(Number.isInteger(primitive.attributes.POSITION));
          assert.ok(Number.isInteger(primitive.attributes.NORMAL));
          assert.ok(Number.isInteger(primitive.attributes.TEXCOORD_0));
          assert.ok(Number.isInteger(primitive.attributes.JOINTS_0));
          assert.ok(Number.isInteger(primitive.attributes.WEIGHTS_0));
        }
      }

      const clipNames = (json.animations ?? []).map(animation => animation.name);
      assert.deepEqual(clipNames.toSorted(), EXPECTED_SPECIES[species.id].toSorted());
      for (const animation of json.animations) {
        assert.ok(animation.channels.length >= 4, `${contract.file} ${animation.name} should deform multiple rig controls`);
        assert.ok(animation.samplers.every(sampler => {
          const accessor = json.accessors[sampler.input];
          return accessor.count >= 2 && accessor.max?.[0] > accessor.min?.[0];
        }), `${contract.file} ${animation.name} should have a real nonzero timeline`);
      }

      assert.equal(triangleCount(json), contract.triangles, `${contract.file} manifest triangle count should be exact`);
      assert.equal(vertexCount(json), contract.vertices, `${contract.file} manifest vertex count should be exact`);
      assert.equal(buffer.length, contract.bytes, `${contract.file} manifest byte count should be exact`);
      assert.equal(createHash("sha256").update(buffer).digest("hex"), contract.sha256, `${contract.file} hash should pin the reviewed export`);
      assert.ok(contract.triangles >= (lod === "lod0" ? 20_000 : 4_000), `${contract.file} should retain an intentional silhouette budget`);
      assert.ok(contract.meshes <= 12, `${contract.file} should keep draw calls bounded`);
    }
    assert.ok(loaded.lod2.json.meshes, `${species.id} should load its mobile geometry`);
    assert.ok(triangleCount(loaded.lod2.json) < triangleCount(loaded.lod0.json) * .6, `${species.id} lod2 should remove at least 40% of hero triangles`);
  }
});
