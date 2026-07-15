---
name: create-premium-characters
description: Create, extend, rebuild, animate, optimize, and validate photorealistic game-ready human characters for Sloth in the City. Use for new NPC archetypes, face or clothing texture variants, mesh-generation or Blender work, skeleton/animation changes, LOD exports, runtime character integration, crowd behavior, or character visual QA.
---

# Create Premium Characters

Build characters as a complete asset system: licensed source, coherent anatomy, PBR surfaces, shared rig, restrained animation, browser budgets, runtime state, and visual QA. Never hide primitive geometry with a photographic face card or accept a loading fallback flashing before the authored asset.

## Required workflow

1. Read [pipeline.md](references/pipeline.md) and [asset-contract.md](references/asset-contract.md) completely.
2. Inspect the existing character pipeline, runtime loader, manifest, tests, and `/debug/characters` before choosing a source or changing topology.
3. Record source URL, version, license, checksum, and any generated-image provenance. Reject an asset whose shipping rights are unclear.
4. Select a source method based on the requested result:
   - Extend the pinned CC0 Blender base for consistent crowd archetypes.
   - Use a licensed scan or reconstruction only when it provides materially better full-body anatomy and cleanable topology.
   - Use image generation for reference sheets and surface maps, not as a flat face mask.
5. Produce front, profile, back, and three-quarter reference views with consistent lens, lighting, expression, clothing, body proportions, and neutral pose.
6. Build or adapt one contiguous anatomical surface. Remove legacy primitives, hidden bodies, detached facial cards, intersecting shells, and non-manifold remnants.
7. Retopologize and UV for face, hands, shoulders, hips, knees, and elbows. Preserve deformation loops before spending triangles on invisible regions.
8. Rig to the shared skeleton, normalize weights, pose-test extreme joints, then author named `HumanIdle` and `HumanWalk` clips. Use loop-safe interpolation and modest limb arcs.
9. Export LOD0 and LOD2 GLBs with the stable material and bone contract. Rebuild through the checked-in Blender script; do not hand-edit generated GLBs.
10. Integrate through the authored runtime with no procedural flash. Drive walk/idle from measured translation and provide explicit pauses that use the idle clip.
11. Run the validator, project tests, and browser QA. Use one browser tab and direct debug/checkpoint routes instead of replaying the campaign.
12. Commit source-pipeline changes, generated assets, manifest, tests, and documentation together.

## Commands

Rebuild the checked-in archetypes from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup \
  --python tools/character-pipeline/build_humans.py -- \
  --source /tmp/human-base-meshes/human_base_meshes_bundle.blend \
  --output public/game/characters/authored \
  --preview /tmp/human-previews
```

Validate the GLB interface:

```sh
node skills/create-premium-characters/scripts/verify_character_contract.mjs
```

Then run:

```sh
npm run build
node --test tests/authored-human-assets.test.mjs tests/character-debug.test.mjs
```

## Definition of done

- The silhouette reads as a natural human from front, profile, and motion views.
- Head and neck are upright; shoulders, hands, garments, hair, and face contain no detached remnants.
- Skin and clothing read as wrapped materials, not images worn over primitive shapes.
- Idle/walk transitions do not pop, overshoot, skate, or continue stepping while stopped.
- Every gameplay NPC either follows a deliberate walk/pause state or a deliberate stationary role.
- High detail is the default on desktop and mobile; lower detail remains user-selectable.
- `/debug/characters` passes line-up, profile, face, idle, and walk review under studio and game lighting.
- The same asset is checked in park, station, train, and zoo contexts.

## Non-negotiable failures

Stop and repair the pipeline if any of these appear: photographic face planes, visible fallback flashes, disconnected body parts, collapsed necks, wild arm motion, foot sliding during pauses, missing skin weights, embedded duplicate atlases, unlicensed source data, or a visual-only change without regenerated contract tests.
