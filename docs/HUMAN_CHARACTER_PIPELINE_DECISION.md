# Human Character Pipeline Decision

**Status:** Accepted for the photoreal-human rebuild
**Scope:** Park visitors, zoo staff and guests, subway passengers, and train passengers
**Decision owner:** Sloth in the City art/runtime pipeline

## Decision

Build the shipping browser characters from the [Blender Studio Human Base Meshes bundle](https://download.blender.org/demo/bundles/bundles-3.6/human-base-meshes-bundle-v1.0.0.zip), then author wardrobe, hair, materials, rigging, poses, and browser LODs in Blender. The bundle is published as CC0 and gives us unified, anatomically credible topology without importing a service-specific avatar runtime or a noncommercial reconstruction model.

The source artifact is pinned by checksum:

```text
human-base-meshes-bundle-v1.0.0.zip
SHA-256 46a912c0524072ac3b78c35d5d2471df7b8df102394a050ca8cd7184e3393648
```

Generated characters ship as rigged, Draco-compressed GLBs under `public/game/characters/authored/`. Skin and cloth detail comes from shared atlases rather than flat face cards or a separate photograph floating in front of a generic head.

## Why the current approach misses the target

The legacy humans are assembled at runtime from dozens of disconnected primitives. They can carry detailed textures and still read as mannequins because silhouette, joint anatomy, hands, facial planes, clothing volume, and deformation are determined by the underlying geometry. A projected face image also cannot replace a continuous head mesh: in profile and close-up it reads as a mask.

The new acceptance bar is therefore structural, not merely cosmetic:

- one continuous anatomical body and head, with separate geometry only where physically appropriate;
- wrapped UV materials, never a planar photo shell used as a face;
- shaped eyelids, nose, mouth, ears, hands, and feet that hold up from oblique views;
- a shared skeleton and weighted joints so poses do not expose gaps;
- wardrobe and hair with credible volume and material response;
- authored LODs that preserve silhouette while meeting browser budgets.

## Options reviewed

| Option | Advantages | Decision |
|---|---|---|
| Continue procedural primitives | Small assets and simple runtime variation | Rejected as a renderer. It cannot meet the anatomical or deformation target, and is never shown as a loading/error fallback. |
| PIFuHD from single full-body images | Can infer clothed geometry from photographs | Rejected. The official project is archived and licensed CC BY-NC 4.0; it is not a safe production dependency for a potentially commercial game or redistributed generated assets. Its unconstrained output also needs retopology, UVs, rigging, and aggressive cleanup. |
| ICON/ECON and related research reconstruction stacks | Better body priors and clothed-human reconstruction than basic photogrammetry | Rejected for this product pipeline. Their research/noncommercial terms and model dependencies introduce the same commercial and redistribution uncertainty, while still leaving a substantial game-retopology and rigging pass. |
| MakeHuman with MPFB | Mature parametric body generation, broad morph controls, and generated model output intended for CC0 use | Deferred but viable. It is a strong candidate for future crowd body diversity, but adopting it now would add another authoring dependency and source-to-rig normalization pass when the pinned Blender Studio bases already provide clean, reproducible topology. Tool/add-on licensing and every imported third-party asset would still be reviewed separately from generated-model output. |
| Paid avatar systems such as Character Creator or MetaHuman | High visual ceiling, mature facial and wardrobe tooling | Deferred. They remain candidates for a future hero-character budget, but require separate tool, export, redistribution, and performance validation. They would not remove the need for browser LODs. |
| Blender Studio CC0 base meshes plus authored Blender pipeline | Licensable, inspectable, reproducible, real topology, no hosted runtime | **Selected.** It gives the team control over anatomy, UVs, wardrobe, hair, skeleton, LODs, compression, and runtime behavior. |

Image-based reconstruction is still useful as visual reference, but reference imagery must not silently become an unlicensed texture or model input. Any future replacement source must pass the same license and redistribution review.

## Shipping asset contract

The initial set contains four distinct archetypes:

| Archetype ID | Art direction |
|---|---|
| `human-male-short` | masculine realistic base, short hair, city jacket |
| `human-male-curly` | masculine realistic base, cropped/curly hair, staff-capable wardrobe |
| `human-female-bob` | feminine realistic base, bob haircut, commuter wardrobe |
| `human-female-ponytail` | feminine realistic base, tied-back hair, park/station wardrobe |

Each archetype is produced with an authored close mesh and mobile/far mesh. A middle-distance LOD may be generated as the crowd system grows:

| Level | Intended use | Target triangles per complete character | Draco GLB ceiling | Texture contract |
|---|---|---:|---:|---|
| LOD0 | desktop close/hero NPC | 60k–80k | 600 KB | shared 1254×1254 2×2 atlases |
| LOD1 | nearby crowd | 35k–55k | validate when introduced | shared atlas, runtime-selected detail |
| LOD2 | mobile or distant crowd | 17k–25k | 260 KB | shared 1254×1254 2×2 atlases |

Triangle numbers are measured shipping guardrails, not permission to sacrifice hands, face silhouette, or clean deformation. The current eight GLBs span 60,644–77,360 triangles at LOD0 and 17,215–21,896 at LOD2, with Draco files below the listed ceilings. Prefer fewer well-shaped surfaces and no more than ten mesh/material draw calls over many disconnected pieces. The required first milestone is LOD0 plus LOD2 for all four archetypes; LOD1 is added when crowd density justifies it.

Every GLB uses these stable material slot names so runtime variants can assign shared maps without knowing mesh internals:

- `Skin`
- `ClothUpper`
- `ClothLower`
- `Hair`
- `Shoe`
- `EyeWhite`
- `Iris`
- `Pupil`

The shared source atlases are:

- `public/game/characters/human-skin-pbr-v4.webp`
- `public/game/characters/human-cloth-pbr-v4.webp`

Both are 1254×1254 WebP 2×2 sheets. The runtime crops the selected 627×627 skin or cloth tile once and caches it for reuse rather than embedding textures in each GLB.

GLBs must preserve the common skeleton, material names, UVs, skin weights, and supported pose/animation data after Draco compression. Runtime code may clone skeletons and instance immutable textures; it must not mutate or dispose a cached template used by another character.

## Quality gates

A generated character is not accepted because it exported successfully. It must pass all of the following:

1. Front, three-quarter, profile, back, seated, and raised-arm views show no floating facial card, open wrist, split elbow, or intersecting wardrobe.
2. Eyes, mouth, ears, fingers/hands, knees, and shoulders read as anatomy rather than attached primitives.
3. Skin and clothing maps wrap continuously and retain plausible roughness under park dusk and bright subway lighting.
4. Idle and scenario poses deform without gaps, collapsing shoulders, or detached hands.
5. LOD changes preserve height, footprint, silhouette, skeleton names, and material names.
6. The authored asset is the only visible NPC geometry. Its host stays hidden during loading, and a failed load suppresses that NPC rather than revealing a procedural face or body.
7. Desktop and mobile frame-time tests are run with representative crowd counts, not a single isolated figure.

## Licensing and provenance rules

- Record source URL, version, license, and checksum for every imported base mesh, wardrobe, hair, motion, and texture.
- Do not add noncommercial or research-only assets to shipping output.
- Do not commit downloaded source bundles unless their license and repository-size impact are explicitly reviewed; rebuild them from the pinned source instead.
- Generated or internally painted atlases remain project assets. Source imagery must be owned, licensed for this use, or generated specifically for the project.
- A future source swap requires a new decision entry and a clean regeneration of affected GLBs; provenance is part of the asset, not an afterthought.

## Consequences

This choice adds an offline Blender build step and increases checked-in game assets, but removes per-frame procedural mesh construction and the face-mask artifact. It gives us one controllable pipeline for park, zoo, station, and train populations, plus explicit performance tiers. It does not claim film-quality digital humans: the practical target is convincing real-world anatomy and materials at browser distances, with close characters receiving the highest budget and distant crowds using deliberate LODs.
