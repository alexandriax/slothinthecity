"""Audit Gary's evaluated skin over every authored locomotion/forage frame.

Run with Blender after opening the generated source blend:

    blender --background gary-polar-bear-source.blend \
      --python tools/animal-pipeline/qa_gary_deformation.py -- report.json
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import bpy
import numpy as np


def script_args() -> list[str]:
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def coordinates(mesh: bpy.types.Mesh) -> np.ndarray:
    values = np.empty(len(mesh.vertices) * 3, dtype=np.float64)
    mesh.vertices.foreach_get("co", values)
    return values.reshape((-1, 3))


def evaluated_coordinates(obj: bpy.types.Object) -> np.ndarray:
    evaluated = obj.evaluated_get(bpy.context.evaluated_depsgraph_get())
    mesh = evaluated.to_mesh()
    try:
        return coordinates(mesh)
    finally:
        evaluated.to_mesh_clear()


def main() -> None:
    args = script_args()
    output = Path(args[0]).resolve() if args else Path("/private/tmp/gary-deformation-audit.json")
    body = bpy.data.objects["Body"]
    rig = bpy.data.objects["GaryRig"]
    base = coordinates(body.data)
    triangles = np.asarray([polygon.vertices[:] for polygon in body.data.polygons], dtype=np.int64)
    edges = np.asarray([edge.vertices[:] for edge in body.data.edges], dtype=np.int64)

    rest_cross = np.cross(base[triangles[:, 1]] - base[triangles[:, 0]], base[triangles[:, 2]] - base[triangles[:, 0]])
    rest_double_area = np.linalg.norm(rest_cross, axis=1)
    rest_unit = rest_cross / np.maximum(rest_double_area[:, None], 1e-12)
    rest_edge_length = np.linalg.norm(base[edges[:, 1]] - base[edges[:, 0]], axis=1)

    audit: dict[str, object] = {
        "sourceBlend": bpy.data.filepath,
        "vertices": len(base),
        "triangles": len(triangles),
        "clips": {},
    }
    clips = {"BearWalk": range(1, 38), "BearForage": range(1, 145)}
    for clip_name, frames in clips.items():
        rig.animation_data.action = bpy.data.actions[clip_name]
        worst = {
            "flippedTriangles": 0,
            "degenerateTriangles": 0,
            "minimumNormalDot": 1.0,
            "maximumEdgeStretch": 1.0,
            "minimumEdgeScale": 1.0,
        }
        worst_frames: dict[str, int] = {}
        for frame in frames:
            bpy.context.scene.frame_set(frame)
            posed = evaluated_coordinates(body)
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
            }
            for metric, value in metrics.items():
                is_minimum = metric in {"minimumNormalDot", "minimumEdgeScale"}
                if (is_minimum and value < worst[metric]) or (not is_minimum and value > worst[metric]):
                    worst[metric] = value
                    worst_frames[metric] = frame
        audit["clips"][clip_name] = {"framesAudited": len(frames), "worst": worst, "worstFrames": worst_frames}

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(audit, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(audit, indent=2))


if __name__ == "__main__":
    main()
