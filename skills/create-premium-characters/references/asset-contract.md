# Character asset and QA contract

## Shipping files

Each archetype ships as `<archetype>-lod0.glb` and `<archetype>-lod2.glb` in `public/game/characters/authored/`, plus an entry in `manifest.json`. Generated GLBs and the pipeline change that created them belong in the same commit.

## Required GLB interface

- glTF 2.0 binary container.
- `KHR_draco_mesh_compression` required and used.
- One compatible skin with named joints shared across LODs.
- Every rendered mesh node references that skin.
- UVs, normals, joint indices, and normalized joint weights.
- Exact clips `HumanIdle` and `HumanWalk`.
- Exact materials `Skin`, `ClothUpper`, `ClothLower`, `Hair`, `Shoe`, `EyeWhite`, `Iris`, `Pupil`.
- At most ten material draw calls unless the contract is deliberately revised.
- No embedded atlas images; runtime owns shared surface maps.

## Source and generated-art record

Record source URL, publisher, asset/version, license, retrieval date, SHA-256, modifications, and export command. For generated reference or texture imagery, record the app/model, prompt purpose, date, and human cleanup performed. A visual resemblance request does not override publicity, copyright, or model-release requirements.

## Visual review matrix

Review every archetype and LOD in these combinations:

| View | Pose/motion | Lighting |
|---|---|---|
| front, profile, three-quarter, back | bind/idle | studio neutral |
| front and profile | ten walk loops | studio neutral |
| close face and hands | idle/walk seam | bright subway |
| full body | walk, stop, pause, restart | warm park |
| crowd spacing | ambient/boarding/alighting | station and train |

Reject visible neck pitch, shoulder collapse, detached cards, hidden primitive remnants, garment spikes, unweighted vertices, toe penetration, foot skate, loop pops, dramatic arm overshoot, or stepping while paused.

## Runtime review

- Authored asset becomes visible atomically after hydration.
- Default high detail works on desktop and mobile.
- Manual lower-quality selection swaps LOD without changing identity, scale, or pose.
- Measured displacement controls walk versus idle.
- Stationary roles do not wander; moving roles have explicit destinations and pauses.
- Dispose mixers, geometries, cloned materials, and textures when worlds unload.

## Validation commands

```sh
node skills/create-premium-characters/scripts/verify_character_contract.mjs
npm run build
node --test tests/authored-human-assets.test.mjs tests/character-debug.test.mjs
```

Also inspect `/debug/characters` and representative `?debug=` checkpoints; automated geometry checks cannot judge anatomy or gait quality.
