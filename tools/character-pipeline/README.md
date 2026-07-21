# Authored Human Character Pipeline

This directory rebuilds the game’s human NPCs from a pinned CC0 anatomical base into rigged, browser-ready GLBs. The build is offline: the deployed game does not require Blender, an AI service, an API key, or source `.blend` files.

For the rationale, rejected reconstruction approaches, licensing policy, and quality gates, see [`docs/HUMAN_CHARACTER_PIPELINE_DECISION.md`](../../docs/HUMAN_CHARACTER_PIPELINE_DECISION.md).

## Prerequisites

- Blender 3.4 or newer with its bundled glTF 2.0 exporter and Draco support. Blender 3.4 is sufficient for the shipping GLB build; deterministic headless preview renders require Blender 3.6 or newer.
- Approximately 1 GB of temporary disk space for the downloaded bundle, extracted `.blend`, previews, and intermediate meshes.
- A project checkout with the generated skin and cloth atlases in `public/game/characters/`.

The build script is intentionally a Blender Python script and should be run through Blender, not a system Python interpreter.

## 1. Download and verify the base meshes

Download the official Blender Studio CC0 bundle:

```sh
curl -L \
  https://download.blender.org/demo/bundles/bundles-3.6/human-base-meshes-bundle-v1.0.0.zip \
  -o /tmp/human-base-meshes.zip

shasum -a 256 /tmp/human-base-meshes.zip
```

The output must be:

```text
46a912c0524072ac3b78c35d5d2471df7b8df102394a050ca8cd7184e3393648  /tmp/human-base-meshes.zip
```

Stop if the checksum differs. Then extract it:

```sh
mkdir -p /tmp/human-base-meshes
unzip -q /tmp/human-base-meshes.zip -d /tmp/human-base-meshes
```

The expected source file is:

```text
/tmp/human-base-meshes/human_base_meshes_bundle.blend
```

## 2. Regenerate the shipping assets

From the repository root, run:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background \
  --factory-startup \
  --python tools/character-pipeline/build_humans.py \
  -- \
  --source /tmp/human-base-meshes/human_base_meshes_bundle.blend \
  --output public/game/characters/authored \
  --preview /tmp/human-previews
```

On Linux, replace the application path with `blender`. The `--` separator is required: arguments after it are consumed by `build_humans.py`, not Blender. On Blender 3.4 the GLBs and manifest are still generated, but the script reports `PREVIEW_SKIPPED`; this intentionally avoids an unstable Apple Silicon Workbench path. Use Blender 3.6+ for headless previews, or perform the required visual review in the browser.

Do not hand-edit generated GLBs. Make changes in the pipeline, rebuild, inspect available previews and the actual browser render, and commit the resulting assets together with the pipeline change that produced them.

## Expected output

`public/game/characters/authored/` contains Draco-compressed GLBs for four archetypes:

```text
human-male-short-lod0.glb
human-male-short-lod2.glb
human-male-curly-lod0.glb
human-male-curly-lod2.glb
human-female-bob-lod0.glb
human-female-bob-lod2.glb
human-female-ponytail-lod0.glb
human-female-ponytail-lod2.glb
```

The preview directory is disposable and is not part of the deployed game. When generated with Blender 3.6+, it contains full-body renders for catching gross silhouette, UV, material, and joint problems before browser QA. Browser QA remains mandatory because Blender 3.4 deliberately skips preview rendering and because the runtime owns the final atlas sampling, lighting, animation, and LOD selection.

Shipping guardrails are:

| LOD | Use | Complete-character triangle target | Draco GLB ceiling |
|---|---|---:|---:|
| 0 | close desktop characters | 60k–80k | 600 KB |
| 1 | optional nearby crowd tier | 35k–55k | to be validated when introduced |
| 2 | mobile and distant characters | 17k–25k | 260 KB |

LOD0 and LOD2 are required for each initial archetype. LOD1 is an optional later output; if added, use the same basename and `-lod1.glb` suffix.

The current rebuild spans 61,536–76,226 triangles and 321,548–386,952 bytes at LOD0, and 20,168–24,619 triangles and 157,316–188,680 bytes at LOD2. These ranges are enforced by `tests/authored-human-assets.test.mjs`; update the documented contract and test deliberately if the art direction changes.

## Stable asset interface

Every output must retain a compatible armature and these exact material names:

```text
Skin
ClothUpper
ClothLower
Hair
Shoe
EyeWhite
Iris
Pupil
```

The browser assigns variants from these shared atlases:

```text
public/game/characters/human-skin-pbr-v4.webp
public/game/characters/human-cloth-pbr-v4.webp
```

Changing an archetype filename, bone name, material name, UV quadrant, or orientation is a runtime API change. Update runtime mappings and tests in the same change rather than silently breaking the contract.

## Export and optimization requirements

- Export binary glTF (`.glb`) with skinning, normals, UVs, and required animation/pose data. The current materials do not use normal maps, so tangents are intentionally omitted; enable and validate them if tangent-space maps are introduced.
- Enable Draco mesh compression. Quantization must not visibly damage faces, hands, eyelids, or finger/claw-adjacent silhouettes.
- Keep one coherent body/head mesh. Separate eyes, hair, clothing layers, and metal accessories are acceptable; disconnected anatomical primitives are not.
- Keep each character at no more than ten mesh/material draw calls. Do not create a unique material per body part.
- Preserve a consistent character origin, facing direction, ground plane, height convention, skeleton, and clip naming across all archetypes and LODs.
- Prefer decimation/retopology that preserves outline and deformation loops. Do not hit a triangle budget by destroying the face and hands.
- Keep texture detail external and shared. The two 1254×1254 WebP atlases are 2×2 sheets whose 627×627 tiles are cropped and cached by the runtime; do not embed duplicate textures in each GLB.

## Validation checklist

After every rebuild:

1. Confirm all expected GLBs exist and inspect their file sizes.
2. Confirm the glTF payload contains a skin, expected mesh primitives, the named materials, and Draco-compressed geometry.
3. Compare front, profile, three-quarter, back, seated, and raised-arm poses for seams or intersections.
4. Check the same model under low, warm park lighting and bright, neutral subway lighting.
5. Verify the LODs share footprint, height, facing direction, bone names, and material slots.
6. Test representative crowds on desktop and mobile quality settings; check both frame time and memory.
7. Visit every use site: park/zoo exterior, station concourse/platform, train exterior/interior, and final Bronx Zoo scene.
8. Let `HumanWalk` loop for at least ten cycles and inspect the seam at normal and slow speed; automatic Bézier handles are not permitted on the short gait loop because they can overshoot limb rotation.
9. Verify an ambient walker stops translating and switches completely to `HumanIdle` during each route pause.

The procedural character is only a loading/error fallback. If it remains visible after the authored GLB has loaded, treat that as a failure rather than an acceptable quality tier.

## Source hygiene

The downloaded ZIP, extracted source `.blend`, and preview renders belong in temporary storage and are not committed. Shipping GLBs, shared atlases, this README, the build script, and any validation fixtures belong in the repository. If a new source asset is introduced, document its URL, version, license, and checksum before it enters an exported GLB.
