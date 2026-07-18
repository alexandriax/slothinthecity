# Original authored animal pipeline

Every production animal in this directory is a project-owned Blender source,
not a downloaded marketplace model. Wildlife photographs and zoo species pages
may inform anatomy, markings, contact poses, and locomotion, but no mesh,
texture pixels, rig, or animation data may be copied or linked into a build.
Each accepted animal retains its generator, editable `.blend`, uncompressed 2K
maps, provenance, two re-imported GLBs, and fixed-camera review renders.

After every reviewed species has passed its visual gate, regenerate the runtime
contract from the files themselves:

```bash
npm run animals:manifest
```

That command hashes the Blender sources, source maps, and GLBs and derives the
actual runtime primitive/material/triangle/vertex counts. The automated asset
test also rejects network ingestion and Blender append/link/import operations
inside production generators. A passing structural contract is necessary but
does not replace review in `/debug/animals` and the real Bronx habitat.

## Visual acceptance gate

Do not publish a species merely because it has a large triangle count or a
valid GLB. The fixed review set must show, at minimum:

- one continuous anatomical body silhouette with no visible primitive seams,
  socket gaps, floating eyes, detached paws/hooves, or card-like limb roots;
- species-correct head, mouth/beak, eyelid, ear, hand/foot/hoof, and tail forms
  in clay closeups before color or fur can conceal the topology;
- planted or gripping support contacts in every locomotion/perch clip, with a
  shared ground plane and no phase-through, hovering, or root teleport;
- shoulder, hip, neck, wrist/ankle and tail-root deformation without rubber
  tubes, collapsing joints, or intersecting rigid shells;
- a textured three-quarter, profile, face, extremity/contact, and in-world
  browser capture at the actual ACES exposure used by the game.

Reject and rebuild any candidate that still reads as assembled primitives,
even if its source and automated contract are otherwise valid.

`build_gary.py` creates Gary from source geometry authored entirely by the
project. It does not download or incorporate an external mesh, texture, rig or
animation. The Blender script is the editable source of truth and produces:

- one fused, watertight anatomical body mesh;
- separate embedded eyes, nose, mouth, inner-ear and claw detail meshes;
- an explicit 19-bone quadruped skeleton with four-weight skinning;
- `BearIdle`, `BearWalk`, `BearForage`, and `BearTurn` clips;
- original albedo, tangent-space normal and roughness maps;
- close and mobile GLBs plus a machine-readable asset manifest;
- an optional three-quarter QA render.

Run:

```bash
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup \
  --python tools/animal-pipeline/build_gary.py -- \
  --output public/game/animals/authored \
  --source tools/animal-pipeline/source \
  --preview /tmp/sloth-animal-previews
```

The editable `.blend` and uncompressed 2K source maps live under `source/` so
they are versioned without being served by Vercel. Runtime GLBs embed optimized
copies of all maps; `public/` does not contain duplicate source files.

The sculpt faces Blender `+Y`; glTF export converts this to Three.js `-Z`.
Dimensions are authored in meters with the origin at ground level beneath the
torso. Review the preview and `/debug/animals` before production integration.

Visual proportion and motion study references (no pixels, meshes, rigs or
animations are copied into the asset):

- U.S. Fish & Wildlife Service, polar bear walking footage:
  <https://www.fws.gov/media/polar-bear-walking-ice>
- San Diego Zoo Wildlife Alliance, polar bear anatomy and behavior overview:
  <https://animals.sandiegozoo.org/animals/polar-bear>
