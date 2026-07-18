#!/usr/bin/env python3
"""Render fixed-camera deformation gates from an exported Gary GLB.

This intentionally imports the shipping GLB into a clean Blender scene before
rendering.  It therefore exercises glTF skin inverse binds and animation
channels instead of merely reviewing the source .blend.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def arguments():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    return parser.parse_args(argv)


def material(name, color, roughness):
    result = bpy.data.materials.new(name)
    result.use_nodes = True
    node = result.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = color
    node.inputs["Roughness"].default_value = roughness
    return result


def main():
    options = arguments()
    options.output.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    bpy.ops.import_scene.gltf(filepath=str(options.input.resolve()))
    scene = bpy.context.scene
    rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    for track in rig.animation_data.nla_tracks:
        track.mute = True

    bpy.ops.object.camera_add(location=(5.3, 6.6, 3.0))
    camera = bpy.context.object
    camera.data.lens = 62
    camera.rotation_euler = (Vector((0, .45, 1.08)) - camera.location).to_track_quat("-Z", "Y").to_euler()
    scene.camera = camera

    def light(name, location, energy, size, color):
        bpy.ops.object.light_add(type="AREA", location=location)
        item = bpy.context.object
        item.name = name; item.data.energy = energy; item.data.size = size; item.data.color = color
        item.rotation_euler = (Vector((0, .3, 1.0)) - item.location).to_track_quat("-Z", "Y").to_euler()

    light("QAKey", (-3.4, 4.3, 5.1), 420, 3.2, (1.0, .87, .74))
    light("QAFill", (3.3, 1.2, 3.4), 270, 3.0, (.63, .80, 1.0))
    light("QARim", (-1.4, -3.2, 3.5), 390, 2.4, (.72, .91, 1.0))
    bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, .015))
    bpy.context.object.data.materials.append(material("QAGround", (.025, .038, .045, 1), .72))

    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 48
    scene.eevee.use_gtao = True
    scene.eevee.gtao_factor = 1.25
    scene.render.resolution_x = 1200; scene.render.resolution_y = 900; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "Medium High Contrast"; scene.view_settings.exposure = -.35
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.012, .019, .027, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .22

    actions = {action.name.split("_GaryRig", 1)[0]: action for action in bpy.data.actions}
    review = {
        "BearIdle": (24,),
        "BearWalk": (1, 8, 15, 22, 29),
        "BearForage": (29, 58, 86),
        "BearTurn": (18, 36, 54),
    }
    for clip, frames in review.items():
        rig.animation_data.action = actions[clip]
        for frame in frames:
            scene.frame_set(frame)
            target = options.output / f"gary-polar-bear-imported-{clip}-f{frame:03d}.png"
            scene.render.filepath = str(target)
            bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
