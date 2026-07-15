#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(process.argv[2] ?? "public/game/characters/authored");
const requiredMaterials = ["ClothLower", "ClothUpper", "EyeWhite", "Hair", "Iris", "Pupil", "Shoe", "Skin"];

function glbJson(buffer, file) {
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file}: not a binary glTF`);
  if (buffer.readUInt32LE(4) !== 2) throw new Error(`${file}: expected glTF 2`);
  const chunkLength = buffer.readUInt32LE(12), chunkType = buffer.readUInt32LE(16);
  if (chunkType !== 0x4e4f534a) throw new Error(`${file}: first chunk is not JSON`);
  return JSON.parse(buffer.subarray(20, 20 + chunkLength).toString("utf8").trimEnd());
}

const files = (await readdir(root)).filter(file => file.endsWith(".glb")).sort();
if (!files.length) throw new Error(`No GLBs found in ${root}`);
const archetypes = new Map();

for (const file of files) {
  const match = file.match(/^(.*)-lod(0|2)\.glb$/);
  if (!match) throw new Error(`${file}: expected <archetype>-lod0.glb or -lod2.glb`);
  const [, archetype, lod] = match;
  archetypes.set(archetype, new Set([...(archetypes.get(archetype) ?? []), lod]));
  const json = glbJson(await readFile(path.join(root, file)), file);
  const materials = (json.materials ?? []).map(material => material.name).sort();
  const clips = (json.animations ?? []).map(animation => animation.name).sort();
  if (JSON.stringify(materials) !== JSON.stringify(requiredMaterials)) throw new Error(`${file}: material contract mismatch: ${materials.join(", ")}`);
  if (JSON.stringify(clips) !== JSON.stringify(["HumanIdle", "HumanWalk"])) throw new Error(`${file}: expected HumanIdle and HumanWalk`);
  if ((json.skins ?? []).length !== 1) throw new Error(`${file}: expected one shared skin`);
  if (!(json.extensionsRequired ?? []).includes("KHR_draco_mesh_compression")) throw new Error(`${file}: Draco is not required`);
  const meshNodes = (json.nodes ?? []).filter(node => Number.isInteger(node.mesh));
  if (!meshNodes.length || meshNodes.some(node => !Number.isInteger(node.skin))) throw new Error(`${file}: every rendered mesh must reference the skin`);
  if ((json.materials ?? []).length > 10) throw new Error(`${file}: exceeds ten material draw calls`);
  console.log(`ok ${file} · ${meshNodes.length} skinned meshes · ${clips.join("/")}`);
}

for (const [archetype, lods] of archetypes) if (!lods.has("0") || !lods.has("2")) throw new Error(`${archetype}: LOD0 and LOD2 are both required`);
console.log(`validated ${files.length} files across ${archetypes.size} archetypes`);
