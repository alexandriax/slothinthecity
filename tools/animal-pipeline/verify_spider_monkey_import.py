#!/usr/bin/env python3
"""Fresh-import and deformation QA for the authored spider-monkey GLBs."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import bpy


CLIPS = ("MonkeyIdle", "MonkeyWalk", "MonkeyPerch", "MonkeyClimb", "MonkeySwing")


def arguments() -> list[Path]:
    values = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if not values:
        raise SystemExit("Pass one or more GLB paths after --")
    return [Path(value).resolve() for value in values]


def clear_import() -> None:
    # Match the authored/exported time base before the importer creates action
    # keyframes; Blender otherwise rescales 30 fps glTF samples into its 24 fps
    # factory default and our integer-frame contact samples land between keys.
    bpy.context.scene.render.fps = 30
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)


def matching_action(clip: str) -> bpy.types.Action:
    matches = [action for action in bpy.data.actions if action.name == clip or action.name.startswith(f"{clip}_")]
    if len(matches) != 1:
        raise RuntimeError(f"Expected one imported action for {clip}, found {[action.name for action in matches]}")
    return matches[0]


def validate(path: Path) -> dict[str, object]:
    clear_import()
    bpy.ops.import_scene.gltf(filepath=str(path))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    rigs = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
    if len(meshes) != 1 or len(rigs) != 1:
        raise RuntimeError(f"{path.name}: expected one mesh and rig, found {len(meshes)} meshes/{len(rigs)} rigs")
    mesh = meshes[0]
    rig = rigs[0]
    base_positions = [vertex.co.copy() for vertex in mesh.data.vertices]
    rig.animation_data_create()
    clip_results: dict[str, object] = {}
    all_contact_minima: list[float] = []
    for clip in CLIPS:
        action = matching_action(clip)
        rig.animation_data.action = action
        start, end = (int(value) for value in action.frame_range)
        sample_frames = sorted({start + round((end - start) * step / 8) for step in range(9)})
        greatest_delta = 0.0
        contact_minima: list[float] = []
        root_heights: list[float] = []
        for frame in sample_frames:
            bpy.context.scene.frame_set(frame)
            bpy.context.view_layer.update()
            depsgraph = bpy.context.evaluated_depsgraph_get()
            evaluated_object = mesh.evaluated_get(depsgraph)
            evaluated_mesh = evaluated_object.to_mesh()
            if len(evaluated_mesh.vertices) != len(base_positions):
                evaluated_object.to_mesh_clear()
                raise RuntimeError(f"{path.name}/{clip}: evaluated vertex count changed")
            minimum_z = math.inf
            for index, vertex in enumerate(evaluated_mesh.vertices):
                coordinate = vertex.co
                if not all(math.isfinite(value) for value in coordinate):
                    evaluated_object.to_mesh_clear()
                    raise RuntimeError(f"{path.name}/{clip}: non-finite vertex at frame {frame}")
                greatest_delta = max(greatest_delta, (coordinate - base_positions[index]).length)
                minimum_z = min(minimum_z, (evaluated_object.matrix_world @ coordinate).z)
            contact_minima.append(minimum_z)
            root_bone = rig.pose.bones.get("MonkeyRoot")
            root_heights.append((rig.matrix_world @ root_bone.head).z if root_bone else math.nan)
            evaluated_object.to_mesh_clear()
        if greatest_delta <= 1e-5:
            raise RuntimeError(f"{path.name}/{clip}: clip produced no measurable deformation")
        contact_range = max(contact_minima) - min(contact_minima)
        if contact_range > 0.0025:
            raise RuntimeError(
                f"{path.name}/{clip}: imported contact plane drifted by {contact_range:.6f} m; "
                f"samples={list(zip(sample_frames, [round(value, 6) for value in contact_minima]))}; "
                f"rootZ={[round(value, 6) for value in root_heights]}"
            )
        all_contact_minima.extend(contact_minima)
        clip_results[clip] = {
            "frames": sample_frames,
            "maxLocalVertexDelta": round(greatest_delta, 6),
            "minimumWorldZ": round(min(contact_minima), 6),
            "maximumWorldZ": round(max(contact_minima), 6),
            "contactPlaneRangeMeters": round(contact_range, 8),
        }
    common_contact_range = max(all_contact_minima) - min(all_contact_minima)
    if common_contact_range > 0.003:
        raise RuntimeError(f"{path.name}: clip contact planes differ by {common_contact_range:.6f} m")
    return {
        "file": path.name,
        "armature": rig.name,
        "bones": len(rig.data.bones),
        "clips": clip_results,
        "commonContactPlaneRangeMeters": round(common_contact_range, 8),
        "materials": len(mesh.data.materials),
        "vertices": len(mesh.data.vertices),
    }


print(json.dumps([validate(path) for path in arguments()], indent=2, sort_keys=True))
