# Repository agent guidance

## Premium human characters

When adding or modifying human NPC meshes, textures, rigs, animations, LODs, runtime loading, or crowd behavior, read [`skills/create-premium-characters/SKILL.md`](skills/create-premium-characters/SKILL.md) completely and follow its linked references. Treat the stable skeleton/material/clip interface and `/debug/characters` visual review as required production gates.

Do not hand-edit generated GLBs, ship unlicensed source material, overlay photographic face cards, retain hidden primitive-era body parts, or accept a procedural fallback flash before authored characters load.

## Original premium animals

Animal meshes, textures, rigs, and animations must be authored for this project. Real-animal photography and reputable species references may guide anatomy, markings, contact, and motion, but their pixels or geometry must not be copied into production. Do not import, append, or link marketplace, stock, proprietary, or otherwise third-party animal assets.

Retain an editable Blender source, reproducible generator, project-authored PBR source maps, LOD exports, provenance, and fixed-camera clay/textured review for every accepted animal. Treat `tools/animal-pipeline/README.md`, `/debug/animals`, fresh-import animation/contact review, and the approved-only runtime manifest as production gates. Polygon counts and structural tests never substitute for visual approval; reject any animal that still reads as disconnected primitives, toy-like masses, floating extremities, or unsupported motion.
