# Original spider monkey asset

`build_spider_monkey.py` is the editable source of truth for the Bronx Zoo
spider monkey. It creates the anatomy, topology, UVs, PBR maps, skeleton, skin
weights, motion clips, LODs, source `.blend`, provenance, metrics, and QA
renders without ingesting any third-party model or texture.

## Build

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup \
  --python tools/animal-pipeline/build_spider_monkey.py -- \
  --output public/game/animals/authored \
  --preview tools/animal-pipeline/previews \
  --texture-size 2048
```

Runtime artifacts:

- `public/game/animals/authored/spider-monkey-lod0.glb`
- `public/game/animals/authored/spider-monkey-lod2.glb`

Editable and review artifacts remain outside the public web root:

- `tools/animal-pipeline/source/monkey-spider-source.blend`
- `tools/animal-pipeline/source/monkey-spider-fur-*.png`
- `tools/animal-pipeline/source/spider-monkey.asset.json`
- `tools/animal-pipeline/source/spider-monkey.provenance.json`
- `tools/animal-pipeline/monkey-spider-metrics.json`
- `tools/animal-pipeline/previews/monkey-*.png`

## Authored contract

- Species id: `spider-monkey`
- Metres, glTF Y-up, source faces glTF +Z
- Clips: `MonkeyIdle`, `MonkeyWalk`, `MonkeyPerch`, `MonkeyClimb`, `MonkeySwing`
- The exported animal is one skinned mesh. Its continuous implicit core carries
  the ribcage, waist, scapular/pelvic masses, limbs, palms/soles and tapered
  prehensile tail; recessed almond corneas, modeled lid wraps, shallow pinnae
  and tapered hooked digits are deeply seated before all anatomy is joined into
  that one mesh. Pupils and the restrained catchlights are flush planes, never
  protruding spheres.
- Hero maps are embedded 2K image textures: base colour, tangent-space normal,
  and roughness. A smooth `COLOR_0` multiplier carries the organic dark face
  transition across the welded surface without a polygon-slot staircase; only
  the nostril and lip microdefinition is rasterized into the atlas. The glTF
  material consumes that standard vertex colour attribute at runtime.
- The in-place motion clips are loop-safe. Habitat code owns world translation.

## Morphology reference use

The generator uses factual proportions and locomotor characteristics as art
direction only. It does not download, trace, or copy reference imagery:

- [Animal Diversity Web — *Ateles geoffroyi*](https://animaldiversity.org/accounts/Ateles_geoffroyi/)
- [San Diego Zoo — monkeys](https://animals.sandiegozoo.org/animals/monkey)
- [Brookfield Zoo — black-handed spider monkey](https://www.brookfieldzoo.org/animals/black-handed-spider-monkey)

Those references informed the small head, narrow torso, forelimbs longer than
hind limbs, reduced thumbs, hook-like digits, dark hands and feet, and muscular
prehensile tail with a bare gripping pad.

## QA

The build emits standard idle, walk, perch, climb and swing views, two facial
views, plus a dedicated contact close-up for every clip. The support renders
include non-exported floor, branch and trunk guides so hooked digits, planted
feet and tail support can be reviewed rather than judged in empty space. Each
authored frame is source-validated against one common contact plane; fresh GLB
reimport repeats that gate across nine samples per clip. Validate the GLB
contract independently with:

```sh
npx --yes @gltf-transform/cli inspect public/game/animals/authored/spider-monkey-lod0.glb
```

The inspection must report a skin, all five animation clips, UVs, tangents,
`COLOR_0`, `JOINTS_0`, `WEIGHTS_0`, and embedded images before the asset is
accepted. Both LODs must then be reimported into a clean Blender scene and every
clip evaluated for finite, visibly deformed vertices.
