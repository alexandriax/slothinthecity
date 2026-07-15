# Premium character production pipeline

## 1. Audit before making art

Inspect `tools/character-pipeline/`, `public/game/characters/authored/manifest.json`, `AuthoredHumanAssets.ts`, character use sites, `/debug/characters`, and existing tests. Identify whether the request is a new archetype, texture-only variant, topology correction, rig correction, animation correction, or runtime behavior change. Do not rebuild topology for a texture-only request and do not try to texture over anatomical defects.

## 2. References and generated imagery

Create a consistent full-body turnaround: front, back, left/right profile, and three-quarter views in a neutral A-pose. Lock apparent age, proportions, hair, clothing layers, footwear, camera focal length, lighting, and neutral expression. Add close face, hand, garment, and footwear studies.

Image generation is appropriate for original people, clothing concepts, pore/fabric reference, and texture-source plates. Ask for even diffuse lighting, no cast shadow, no depth of field, no jewelry crossing the silhouette, and no cropped hands or feet. Never use a single perspective portrait as a literal face plane. Convert generated imagery into UV-aware albedo/roughness/normal detail and remove baked highlights.

Keep generation prompts, tool/model name, date, and source images with the work record. Do not ship API keys or runtime generation dependencies.

## 3. Mesh source decision

Prefer the pinned CC0 Blender Studio Human Base Meshes when consistency and clean licensing matter. Consider PIFuHD, ECON, HumanGaussian, photogrammetry, or a licensed scanned human only when multi-view inputs are consistent and the result is materially better than the base mesh.

Treat automatic reconstruction as raw sculpture, not a game asset. Evaluate profile accuracy, hands, feet, ears, hair, clothing layers, back view, watertightness, symmetry, and texture projection. Reject single-view output with invented backs, fused limbs, or perspective-shaped faces. Retopologize, re-UV, and re-rig accepted reconstruction output.

## 4. Blender cleanup and topology

Work headlessly when possible through `tools/character-pipeline/build_humans.py`; use interactive Blender only for sculpt, weight-paint, or visual cleanup that cannot be expressed repeatably. Keep source downloads and `.blend` files outside the repository unless licensing and size policy explicitly allow them.

Delete hidden primitive-era geometry rather than scaling or burying it. Join contiguous anatomy where appropriate. Inspect non-manifold edges, internal faces, flipped normals, duplicate vertices, zero-area triangles, disconnected islands, and garment intersections. Preserve loops around eyes, mouth, jaw, shoulders, elbows, wrists, fingers, hips, knees, and ankles.

Use a coherent scale, origin at ground center, +Z up, and the repository's facing convention. Apply transforms before skinning. Keep eyes, hair, garments, and accessories separate only when they need different materials or deformation.

## 5. Texture and material work

Use the stable shared material slots: `Skin`, `ClothUpper`, `ClothLower`, `Hair`, `Shoe`, `EyeWhite`, `Iris`, and `Pupil`. Maintain atlas UV quadrants and runtime tile mapping. Favor shared external WebP atlases over embedded duplicate images.

Clean albedo of directional light. Encode fabric weave, leather grain, pores, and seams at believable scale. Put gloss variation in roughness and surface relief in normal/bump, not painted white highlights. Verify diverse skin tones under warm park light and bright neutral subway light.

## 6. Rigging and animation

Bind every rendered mesh to the shared skeleton. Normalize weights and test neck, shoulder, wrist, hip, knee, and ankle deformation. Heads must face forward in the bind pose; do not compensate for a bad bind pose with permanent runtime rotation.

Ship exact clip names `HumanIdle` and `HumanWalk`. Idle should be small breathing/head motion. Walk should use opposing limbs, grounded feet, restrained arms, and a loop-identical final key. Prefer `LINEAR` or deliberately clamped handles for short loop clips; automatic Bézier handles can overshoot at the loop seam and flick arms.

In runtime, select gait from measured world translation. A stationary pause must select idle and stop foot stepping. Do not repeatedly restart an animation action every frame. Crossfade only when state changes, synchronize loop time where helpful, and clamp playback speed.

## 7. LOD and browser integration

Produce LOD0 for close review and LOD2 for mobile/distant crowds. Preserve skeleton, material names, proportions, ground contact, and animation names across LODs. Protect face, hands, and deformation loops during decimation. Use Draco and stay inside the repository's triangle, file-size, and draw-call gates.

Load authored assets invisibly, assign shared atlases, prepare clips, then reveal the complete character in one frame. High detail is the default; manual quality settings may select lower LODs. Do not briefly display a procedural fallback or old character underneath.

## 8. Behavior integration

Assign every NPC a role: stationary attendant, seated rider, ambient walker, waiting rider, boarding rider, or alighting rider. Ambient routes need walk and pause windows. During pauses, position remains fixed and the idle clip plays. Turn gradually or at route endpoints; avoid frame-to-frame orientation flips. Boarding/alighting movement should be physically tied to open doors.

## 9. QA

Use `/debug/characters` for lineup, face, body, profile, idle, and walk review. Use checkpoint query parameters for park, zoo, station, and train contexts. Keep one browser tab to avoid duplicate render loops and memory pressure.

Review at normal speed and slow motion. Watch hands and arms through the animation seam for at least ten loops. Check stepping stops during pauses. Inspect LOD0 and LOD2 on desktop and a mobile viewport, then check the final character under every game lighting family.
