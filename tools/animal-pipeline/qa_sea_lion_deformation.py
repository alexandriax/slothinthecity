#!/usr/bin/env python3
"""Audit every authored California sea-lion deformation frame.

Run after opening the generated production source blend:

  blender --background california-sea-lion-source.blend \
    --python tools/animal-pipeline/qa_sea_lion_deformation.py -- report.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
import numpy as np


CLIPS = ("SeaLionIdle", "SeaLionSwim", "SeaLionSurface", "SeaLionDive")


def script_args() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []


def coordinates(mesh: bpy.types.Mesh) -> np.ndarray:
    values = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get("co", values)
    return values.reshape((-1, 3))


def evaluated_geometry(obj: bpy.types.Object) -> tuple[np.ndarray, np.ndarray]:
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        local = coordinates(mesh)
        homogeneous = np.column_stack((local, np.ones(len(local))))
        matrix = np.asarray(evaluated.matrix_world.transposed(), dtype=np.float64)
        world = homogeneous @ matrix
        return local, world[:, :3]
    finally:
        evaluated.to_mesh_clear()


def main() -> None:
    args = script_args()
    output = Path(args[0]).resolve() if args else Path("/private/tmp/sea-lion-deformation-audit.json")
    body = bpy.data.objects["Body"]
    rig = bpy.data.objects["CaliforniaSeaLionRig"]
    for track in rig.animation_data.nla_tracks:
        track.mute = True

    base = coordinates(body.data)
    triangles = np.asarray([polygon.vertices[:] for polygon in body.data.polygons], dtype=np.int64)
    edges = np.asarray([edge.vertices[:] for edge in body.data.edges], dtype=np.int64)
    rest_cross = np.cross(
        base[triangles[:, 1]] - base[triangles[:, 0]],
        base[triangles[:, 2]] - base[triangles[:, 0]],
    )
    rest_double_area = np.linalg.norm(rest_cross, axis=1)
    rest_unit = rest_cross / np.maximum(rest_double_area[:, None], 1e-12)
    rest_edge_length = np.linalg.norm(base[edges[:, 1]] - base[edges[:, 0]], axis=1)

    audit: dict[str, object] = {
        "sourceBlend": bpy.data.filepath,
        "vertices": len(base),
        "triangles": len(triangles),
        "clips": {},
    }
    for clip_name in CLIPS:
        action = bpy.data.actions[clip_name]
        rig.animation_data.action = action
        start, end = (int(round(value)) for value in action.frame_range)
        worst = {
            "flippedTriangles": 0,
            "degenerateTriangles": 0,
            "minimumNormalDot": 1.0,
            "maximumEdgeStretch": 1.0,
            "minimumEdgeScale": 1.0,
            "minimumWorldZ": 1e9,
        }
        worst_frames: dict[str, int] = {}
        flipped_region: dict[str, object] = {}
        for frame in range(start, end + 1):
            bpy.context.scene.frame_set(frame)
            posed, world = evaluated_geometry(body)
            cross = np.cross(
                posed[triangles[:, 1]] - posed[triangles[:, 0]],
                posed[triangles[:, 2]] - posed[triangles[:, 0]],
            )
            double_area = np.linalg.norm(cross, axis=1)
            unit = cross / np.maximum(double_area[:, None], 1e-12)
            normal_dot = np.einsum("ij,ij->i", unit, rest_unit)
            flipped = int(np.count_nonzero(normal_dot <= 0.0))
            degenerate = int(np.count_nonzero(double_area <= rest_double_area * 1e-4))
            posed_edge = np.linalg.norm(posed[edges[:, 1]] - posed[edges[:, 0]], axis=1)
            edge_scale = posed_edge / np.maximum(rest_edge_length, 1e-12)
            metrics = {
                "flippedTriangles": flipped,
                "degenerateTriangles": degenerate,
                "minimumNormalDot": float(normal_dot.min()),
                "maximumEdgeStretch": float(edge_scale.max()),
                "minimumEdgeScale": float(edge_scale.min()),
                "minimumWorldZ": float(world[:, 2].min()),
            }
            if flipped > worst["flippedTriangles"]:
                flipped_vertices = np.unique(triangles[normal_dot <= 0.0])
                if len(flipped_vertices):
                    flipped_region = {
                        "frame": frame,
                        "restMinimum": base[flipped_vertices].min(axis=0).tolist(),
                        "restMaximum": base[flipped_vertices].max(axis=0).tolist(),
                        "posedMinimum": posed[flipped_vertices].min(axis=0).tolist(),
                        "posedMaximum": posed[flipped_vertices].max(axis=0).tolist(),
                    }
            for metric, value in metrics.items():
                is_minimum = metric in {"minimumNormalDot", "minimumEdgeScale", "minimumWorldZ"}
                if (is_minimum and value < worst[metric]) or (not is_minimum and value > worst[metric]):
                    worst[metric] = value
                    worst_frames[metric] = frame
        audit["clips"][clip_name] = {
            "frameRange": [start, end],
            "framesAudited": end - start + 1,
            "worst": worst,
            "worstFrames": worst_frames,
            "flippedRegionAtWorstFrame": flipped_region,
        }

    rig.animation_data.action = None
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
