import { createHash } from "node:crypto";
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const publicRoot = path.join(repositoryRoot, "public/game/animals/authored");

const reviewedSpecies = [
  {
    id: "gary-polar-bear",
    approved: true,
    asset: "tools/animal-pipeline/source/gary-polar-bear.asset.json",
    blend: "tools/animal-pipeline/source/gary-polar-bear-source.blend",
    commonName: "Polar bear",
    sourceFacing: "-z",
    targetHeightMeters: 1.706,
    method: "Original fused anatomical Blender sculpt, project-authored quadruped skin, clips, UVs, and deterministic PBR maps.",
    clips: { idle: ["BearIdle"], walk: ["BearWalk"], forage: ["BearForage"], turn: ["BearTurn"] },
  },
  {
    id: "california-sea-lion",
    approved: true,
    asset: "tools/animal-pipeline/source/california-sea-lion.asset.json",
    blend: "tools/animal-pipeline/source/california-sea-lion-source.blend",
    commonName: "California sea lion",
    sourceFacing: "-z",
    targetHeightMeters: 1.292,
    method: "Original fused cross-section pinniped loft, sculpted webbed flippers, project-authored skinning, clips, UVs, and deterministic PBR maps.",
    clips: { idle: ["SeaLionIdle"], swim: ["SeaLionSwim"], surface: ["SeaLionSurface"], dive: ["SeaLionDive"] },
  },
  {
    id: "spider-monkey",
    approved: true,
    asset: "tools/animal-pipeline/source/spider-monkey.asset.json",
    blend: "tools/animal-pipeline/source/monkey-spider-source.blend",
    commonName: "Geoffroy's spider monkey",
    sourceFacing: "+z",
    targetHeightMeters: 1.48,
    method: "Original continuous spider-monkey anatomical skin with sculpted face, grasping extremities and prehensile tail; project-authored rig, clips, UVs, and PBR maps.",
    clips: { idle: ["MonkeyIdle"], walk: ["MonkeyWalk"], perch: ["MonkeyPerch"], climb: ["MonkeyClimb"], swing: ["MonkeySwing"] },
  },
  {
    id: "sun-conure",
    approved: true,
    asset: "tools/animal-pipeline/source/sun-conure.asset.json",
    blend: "tools/animal-pipeline/source/sun-conure-source.blend",
    commonName: "Sun conure",
    sourceFacing: "-z",
    targetHeightMeters: .36,
    groundOffsetMeters: -.1064,
    method: "Approved original manual-loop avian topology with continuous head-neck-torso anatomy, independently rigged primary fan, measured zygodactyl contact, project-authored clips, UVs, and analytic PBR maps.",
    clips: { idle: ["Perch"], perch: ["Perch"], "short-flight": ["ShortFlight"], preen: ["Preen"], "landing-settle": ["LandingSettle"] },
  },
  {
    id: "plains-zebra",
    approved: false,
    asset: "tools/animal-pipeline/source/plains-zebra.asset.json",
    blend: "tools/animal-pipeline/source/plains-zebra-source.blend",
    commonName: "Plains zebra",
    sourceFacing: "-z",
    targetHeightMeters: 2.3,
    method: "Original fused equine anatomical sculpt, continuous species-aware stripe UVs, project-authored skinning, gait clips, and deterministic PBR maps.",
    clips: { idle: ["ZebraIdle"], walk: ["ZebraWalk"], forage: ["ZebraGraze"] },
  },
];

const requestedSpeciesArgument = process.argv.find(argument => argument.startsWith("--species="));
const requestedSpecies = requestedSpeciesArgument
  ? new Set(requestedSpeciesArgument.slice("--species=".length).split(",").map(value => value.trim()).filter(Boolean))
  : undefined;
const selectedSpecies = requestedSpecies
  ? reviewedSpecies.filter(review => requestedSpecies.has(review.id) && review.approved)
  : reviewedSpecies.filter(review => review.approved);
if (requestedSpecies && selectedSpecies.length !== requestedSpecies.size) {
  const known = new Set(reviewedSpecies.map(review => review.id));
  const unknown = [...requestedSpecies].filter(id => !known.has(id));
  const unapproved = [...requestedSpecies].filter(id => known.has(id) && !reviewedSpecies.find(review => review.id === id)?.approved);
  const details = [
    unknown.length ? `unknown: ${unknown.join(", ")}` : "",
    unapproved.length ? `not visually approved: ${unapproved.join(", ")}` : "",
  ].filter(Boolean).join("; ");
  throw new Error(`Authored species request rejected (${details})`);
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function glbJson(buffer, filename) {
  if (buffer.subarray(0, 4).toString("ascii") !== "glTF" || buffer.readUInt32LE(4) !== 2) {
    throw new Error(`${filename} is not a glTF 2.0 binary`);
  }
  if (buffer.readUInt32LE(8) !== buffer.length) throw new Error(`${filename} declares the wrong byte length`);
  let offset = 12;
  while (offset < buffer.length) {
    const length = buffer.readUInt32LE(offset), type = buffer.readUInt32LE(offset + 4);
    if (type === 0x4e4f534a) return JSON.parse(buffer.subarray(offset + 8, offset + 8 + length).toString("utf8"));
    offset += 8 + length;
  }
  throw new Error(`${filename} has no JSON chunk`);
}

function runtimeContract(buffer, filename) {
  const json = glbJson(buffer, filename);
  const primitives = (json.meshes ?? []).flatMap(mesh => mesh.primitives ?? []);
  const triangles = primitives.reduce((total, primitive) => total + json.accessors[primitive.indices].count / 3, 0);
  const vertices = primitives.reduce((total, primitive) => total + json.accessors[primitive.attributes.POSITION].count, 0);
  return {
    bytes: buffer.length,
    file: filename,
    materials: json.materials?.length ?? 0,
    meshes: primitives.length,
    sha256: sha256(buffer),
    triangles,
    vertices,
  };
}

function verifiedRuntimeContract(review, lod, buffer, assetContract) {
  const expectedFilename = `${review.id}-${lod}.glb`;
  const filename = assetContract.file ?? expectedFilename;
  if (filename !== expectedFilename || path.basename(filename) !== filename) {
    throw new Error(`${review.id} ${lod} must use the reviewed filename ${expectedFilename}`);
  }
  const contract = runtimeContract(buffer, filename);
  if (contract.sha256 !== assetContract.sha256 || contract.bytes !== assetContract.bytes) {
    throw new Error(
      `${review.id} ${lod} differs from its generator-authored asset contract; `
      + "regenerate and visually review it before publishing",
    );
  }
  return contract;
}

function normalizedTextureKind(key, map) {
  const value = `${key} ${map.kind ?? ""}`.toLowerCase();
  if (value.includes("normal")) return "normal";
  if (value.includes("rough")) return "roughness";
  if (value.includes("albedo") || value.includes("basecolor") || value.includes("base-color")) return "albedo";
  throw new Error(`Unrecognized authored texture kind ${key}`);
}

async function textureContract(key, map) {
  const sourceFile = map.sourceFile;
  const buffer = await readFile(path.join(repositoryRoot, sourceFile));
  const width = map.width, height = map.height;
  if (buffer.readUInt32BE(16) !== width || buffer.readUInt32BE(20) !== height) {
    throw new Error(`${sourceFile} dimensions do not match its source contract`);
  }
  return {
    bytes: buffer.length,
    embedded: true,
    embeddedImage: map.embeddedImageName,
    height,
    kind: normalizedTextureKind(key, map),
    sha256: sha256(buffer),
    sourceFile,
    width,
  };
}

async function speciesContract(review) {
  const asset = JSON.parse(await readFile(path.join(repositoryRoot, review.asset), "utf8"));
  if (asset.id !== review.id) throw new Error(`${review.asset} describes ${asset.id}, not ${review.id}`);
  if (asset.license !== "Original-Project-Asset") throw new Error(`${review.id} is not marked project-original`);
  const blend = await readFile(path.join(repositoryRoot, review.blend));
  const isPlainBlend = blend.subarray(0, 7).toString("ascii") === "BLENDER";
  const isZstdBlend = blend.length >= 4 && blend.readUInt32LE(0) === 0xfd2fb528;
  if (!isPlainBlend && !isZstdBlend) throw new Error(`${review.blend} is not editable Blender source`);
  try {
    await access(path.join(repositoryRoot, `${review.blend}1`));
    throw new Error(`${review.id} retains an accidental .blend1 backup`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const lod0Name = asset.lod0.file ?? `${review.id}-lod0.glb`;
  const lod2Name = asset.lod2.file ?? `${review.id}-lod2.glb`;
  const [lod0Buffer, lod2Buffer] = await Promise.all([
    readFile(path.join(publicRoot, lod0Name)),
    readFile(path.join(publicRoot, lod2Name)),
  ]);
  const lod0Images = new Set((glbJson(lod0Buffer, lod0Name).images ?? []).map(image => image.name));
  const lod2Images = new Set((glbJson(lod2Buffer, lod2Name).images ?? []).map(image => image.name));
  const embeddedMaps = Object.entries(asset.maps).filter(([, map]) =>
    lod0Images.has(map.embeddedImageName) && lod2Images.has(map.embeddedImageName));
  const textures = await Promise.all(embeddedMaps.map(([key, map]) => textureContract(key, map)));
  if (!new Set(textures.map(texture => texture.kind)).has("albedo")
    || !new Set(textures.map(texture => texture.kind)).has("normal")
    || !new Set(textures.map(texture => texture.kind)).has("roughness")) {
    throw new Error(`${review.id} must retain original albedo, normal, and roughness source maps`);
  }

  return {
    id: review.id,
    commonName: review.commonName,
    sourceFacing: review.sourceFacing,
    targetHeightMeters: review.targetHeightMeters,
    groundOffsetMeters: review.groundOffsetMeters ?? 0,
    license: "Project-original",
    source: {
      blendBytes: blend.length,
      blendFile: review.blend,
      blendSha256: sha256(blend),
      generator: asset.generator,
      method: review.method,
      referenceUse: "visual-reference-only",
    },
    lod0: verifiedRuntimeContract(review, "lod0", lod0Buffer, asset.lod0),
    lod2: verifiedRuntimeContract(review, "lod2", lod2Buffer, asset.lod2),
    clips: review.clips,
    textures,
  };
}

const species = [];
for (const review of selectedSpecies) species.push(await speciesContract(review));
const manifest = { schemaVersion: 1, generator: "tools/animal-pipeline/build-manifest.mjs", species };
const approvedPublicFiles = new Set([
  "manifest.json",
  ...species.flatMap(entry => [entry.lod0.file, entry.lod1?.file, entry.lod2?.file]).filter(Boolean),
]);
const unexpectedPublicFiles = (await readdir(publicRoot))
  .filter(filename => !filename.startsWith(".") && !approvedPublicFiles.has(filename));
if (unexpectedPublicFiles.length) {
  throw new Error(
    `Rejected or unreviewed animal files remain deployable: ${unexpectedPublicFiles.join(", ")}`,
  );
}
await writeFile(path.join(publicRoot, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${species.length} project-original species to public/game/animals/authored/manifest.json`);
