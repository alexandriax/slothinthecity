#!/usr/bin/env python3
"""Render production gates from a fresh import of the shipping sea-lion GLB.

The neutral views are deliberately unobstructed: no waterline, contact marker,
or habitat prop can hide the appendages.  Clip frames exercise the imported
glTF skin, inverse binds, and animation channels rather than the source blend.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Dict, Iterable, Sequence, Tuple

import bpy
from mathutils import Vector


def arguments() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--neutral-only", action="store_true")
    parser.add_argument("--clips-only", action="store_true")
    return parser.parse_args(argv)


def studio_material(name: str, color: Sequence[float], roughness: float) -> bpy.types.Material:
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    node = result.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*color[:3], 1)
    node.inputs["Roughness"].default_value = roughness
    return result


def aim(obj: bpy.types.Object, target: Sequence[float]) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def add_light(
    name: str,
    location: Sequence[float],
    target: Sequence[float],
    energy: float,
    size: float,
    color: Sequence[float],
) -> None:
    bpy.ops.object.light_add(type="AREA", location=location)
    item = bpy.context.object
    item.name = name
    item.data.energy = energy
    item.data.size = size
    item.data.color = color
    aim(item, target)


def action_map() -> Dict[str, bpy.types.Action]:
    result: Dict[str, bpy.types.Action] = {}
    for action in bpy.data.actions:
        for expected in ("SeaLionIdle", "SeaLionSwim", "SeaLionSurface", "SeaLionDive"):
            if action.name == expected or action.name.startswith(expected + "_"):
                result[expected] = action
    missing = sorted(set(("SeaLionIdle", "SeaLionSwim", "SeaLionSurface", "SeaLionDive")) - set(result))
    if missing:
        raise RuntimeError(f"Shipping GLB is missing actions: {', '.join(missing)}")
    return result


def reset_pose(rig: bpy.types.Object) -> None:
    rig.animation_data.action = None
    for bone in rig.pose.bones:
        bone.matrix_basis.identity()
    bpy.context.scene.frame_set(1)
    bpy.context.view_layer.update()


def render_view(
    scene: bpy.types.Scene,
    camera: bpy.types.Object,
    output: Path,
    name: str,
    location: Sequence[float],
    target: Sequence[float],
    lens: float,
    resolution: Tuple[int, int] = (1400, 1050),
) -> Path:
    camera.location = location
    camera.data.lens = lens
    aim(camera, target)
    scene.render.resolution_x, scene.render.resolution_y = resolution
    path = output / f"california-sea-lion-imported-{name}.png"
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    return path


def main() -> None:
    options = arguments()
    options.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(options.input.resolve()))

    scene = bpy.context.scene
    rigs = [obj for obj in scene.objects if obj.type == "ARMATURE"]
    if len(rigs) != 1:
        raise RuntimeError(f"Expected one imported armature, got {len(rigs)}")
    rig = rigs[0]
    rig.animation_data_create()
    for track in rig.animation_data.nla_tracks:
        track.mute = True
    actions = action_map()

    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 56
    scene.eevee.use_gtao = True
    scene.eevee.gtao_distance = 3
    scene.eevee.gtao_factor = 1.15
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "Medium High Contrast"
    scene.view_settings.exposure = .55
    scene.world.use_nodes = True
    background = scene.world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (.055, .070, .082, 1)
    background.inputs["Strength"].default_value = .50

    bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, .012))
    ground = bpy.context.object
    ground.name = "QA.UnobstructedGround"
    ground.data.materials.append(studio_material("QA Warm Gray Ground", (.105, .115, .120), .76))

    light_target = (0, .05, .72)
    add_light("QA.Key", (-3.8, 4.4, 5.2), light_target, 710, 3.0, (1.0, .88, .76))
    add_light("QA.Fill", (4.1, 2.4, 3.2), light_target, 510, 3.4, (.68, .82, 1.0))
    add_light("QA.Rim", (-2.0, -4.0, 3.8), light_target, 720, 2.8, (.76, .91, 1.0))
    add_light("QA.FrontSoft", (0, 4.8, 2.3), (0, .75, .80), 360, 2.6, (1.0, .72, .58))

    bpy.ops.object.camera_add(location=(3.2, 3.7, 1.9))
    camera = bpy.context.object
    camera.name = "QA.FreshImportCamera"
    scene.camera = camera

    reset_pose(rig)
    neutral_views = (
        ("neutral-side", (5.15, .10, 1.42), (0, .02, .74), 55),
        ("neutral-front", (0, 5.10, 1.44), (0, .34, .79), 58),
        ("neutral-three-quarter", (3.82, 4.38, 2.10), (0, .03, .72), 60),
        ("neutral-rear-three-quarter", (-3.95, -4.25, 2.12), (0, -.34, .63), 58),
        ("neutral-face", (1.05, 2.72, 1.56), (0, 1.28, 1.24), 77),
        ("neutral-foreflipper", (2.20, 1.72, .98), (.62, .36, .31), 72),
        ("neutral-hindflipper", (2.15, -2.42, .88), (0, -1.30, .18), 72),
        ("neutral-contact", (3.22, 2.65, .48), (0, .02, .22), 68),
    )
    if not options.clips_only:
        for name, location, target, lens in neutral_views:
            render_view(scene, camera, options.output, name, location, target, lens)

    if options.neutral_only:
        return

    clip_frames: Dict[str, Iterable[int]] = {
        "SeaLionIdle": (1, 20, 40, 60, 80, 100, 120),
        "SeaLionSwim": (1, 7, 13, 19, 25, 31, 37),
        "SeaLionSurface": (1, 18, 36, 54, 72, 90, 108),
        "SeaLionDive": (1, 16, 32, 48, 64, 80, 96),
    }
    camera.location = (3.72, 3.82, 2.24)
    camera.data.lens = 60
    aim(camera, (0, .03, .68))
    scene.render.resolution_x, scene.render.resolution_y = (1000, 750)
    for clip_name, frames in clip_frames.items():
        rig.animation_data.action = actions[clip_name]
        for frame in frames:
            scene.frame_set(frame)
            path = options.output / f"california-sea-lion-imported-{clip_name}-f{frame:03d}.png"
            scene.render.filepath = str(path)
            bpy.ops.render.render(write_still=True)

    reset_pose(rig)


if __name__ == "__main__":
    main()
