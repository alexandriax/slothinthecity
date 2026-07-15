#!/usr/bin/env python3
"""Build browser-ready, rigged human GLBs from Blender Studio's CC0 base meshes.

Run through Blender, not a system Python interpreter:

  blender --background --factory-startup \
    --python tools/character-pipeline/build_humans.py -- \
    --source /path/to/human_base_meshes_bundle.blend \
    --output public/game/characters/authored \
    --preview /tmp/sloth-human-previews

The script intentionally keeps the source bundle outside this repository. It emits
two Draco-compressed LODs for four archetypes and a manifest, plus optional preview
PNGs when run with Blender 3.6 or newer.
Every visible body is one continuous anatomical mesh. Clothing and hair are fitted
surface shells rather than the disconnected capsules used by the runtime fallback.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Dict, Iterable, List, Sequence, Tuple

import bpy
import bmesh
from mathutils import Matrix, Vector


MATERIAL_NAMES = (
    "Skin",
    "ClothUpper",
    "ClothLower",
    "Hair",
    "Shoe",
    "EyeWhite",
    "Iris",
    "Pupil",
)


@dataclass(frozen=True)
class Archetype:
    slug: str
    source: str
    eye_segments: int
    build: str
    stature: float
    shoulder_scale: float
    waist_scale: float
    hair: str
    upper_style: str
    palette: Dict[str, Tuple[float, float, float, float]]


ARCHETYPES: Tuple[Archetype, ...] = (
    Archetype(
        slug="human-male-short",
        source="male",
        eye_segments=24,
        build="athletic",
        stature=1.00,
        shoulder_scale=1.04,
        waist_scale=0.98,
        hair="short",
        upper_style="jacket",
        palette={
            "Skin": (0.34, 0.13, 0.06, 1.0),
            "ClothUpper": (0.045, 0.055, 0.060, 1.0),
            "ClothLower": (0.035, 0.045, 0.055, 1.0),
            "Hair": (0.018, 0.012, 0.010, 1.0),
            "Shoe": (0.028, 0.022, 0.018, 1.0),
            "Iris": (0.09, 0.045, 0.018, 1.0),
        },
    ),
    Archetype(
        slug="human-male-curly",
        source="male",
        eye_segments=24,
        build="broad",
        stature=0.97,
        shoulder_scale=1.10,
        waist_scale=1.06,
        hair="curly",
        upper_style="uniform",
        palette={
            "Skin": (0.15, 0.055, 0.025, 1.0),
            "ClothUpper": (0.06, 0.16, 0.105, 1.0),
            "ClothLower": (0.035, 0.052, 0.045, 1.0),
            "Hair": (0.010, 0.008, 0.006, 1.0),
            "Shoe": (0.020, 0.022, 0.020, 1.0),
            "Iris": (0.045, 0.025, 0.012, 1.0),
        },
    ),
    Archetype(
        slug="human-female-bob",
        source="female",
        eye_segments=24,
        build="balanced",
        stature=1.04,
        shoulder_scale=0.98,
        waist_scale=0.96,
        hair="bob",
        upper_style="coat",
        palette={
            "Skin": (0.62, 0.31, 0.19, 1.0),
            "ClothUpper": (0.055, 0.10, 0.16, 1.0),
            "ClothLower": (0.035, 0.045, 0.065, 1.0),
            "Hair": (0.035, 0.016, 0.008, 1.0),
            "Shoe": (0.032, 0.026, 0.022, 1.0),
            "Iris": (0.035, 0.085, 0.075, 1.0),
        },
    ),
    Archetype(
        slug="human-female-ponytail",
        source="female",
        eye_segments=24,
        build="lean",
        stature=1.07,
        shoulder_scale=0.96,
        waist_scale=0.92,
        hair="ponytail",
        upper_style="technical",
        palette={
            "Skin": (0.76, 0.50, 0.34, 1.0),
            "ClothUpper": (0.16, 0.055, 0.075, 1.0),
            "ClothLower": (0.045, 0.050, 0.060, 1.0),
            "Hair": (0.016, 0.010, 0.008, 1.0),
            "Shoe": (0.025, 0.025, 0.028, 1.0),
            "Iris": (0.075, 0.12, 0.095, 1.0),
        },
    ),
)


SOURCE_OBJECTS = {
    "male": "GEO-body_male_realistic",
    "female": "GEO-body_female_realistic",
}


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--only", choices=[a.slug for a in ARCHETYPES])
    return parser.parse_args(argv)


def ensure_object_mode() -> None:
    if bpy.context.object and bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")


def select_only(objects: Iterable[bpy.types.Object]) -> None:
    ensure_object_mode()
    bpy.ops.object.select_all(action="DESELECT")
    active = None
    for obj in objects:
        obj.hide_set(False)
        obj.hide_viewport = False
        obj.hide_render = False
        obj.select_set(True)
        active = obj
    if active is not None:
        bpy.context.view_layer.objects.active = active


def purge_scene() -> None:
    ensure_object_mode()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.armatures, bpy.data.materials):
        for block in list(datablocks):
            if block.users == 0:
                datablocks.remove(block)


def make_material(name: str, rgba: Tuple[float, float, float, float]) -> bpy.types.Material:
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.name = name
    material.use_nodes = True
    material.diffuse_color = rgba
    node = material.node_tree.nodes.get("Principled BSDF")
    if node:
        node.inputs["Base Color"].default_value = rgba
        node.inputs["Roughness"].default_value = 0.52 if name not in {"EyeWhite", "Iris", "Pupil", "Metal"} else 0.30
        node.inputs["Specular"].default_value = 0.34
        if name == "Skin":
            if "Subsurface" in node.inputs:
                node.inputs["Subsurface"].default_value = 0.055
            if "Subsurface Color" in node.inputs:
                node.inputs["Subsurface Color"].default_value = rgba
        if name == "Metal":
            node.inputs["Metallic"].default_value = 0.82
            node.inputs["Roughness"].default_value = 0.24
    return material


def create_materials(archetype: Archetype) -> Dict[str, bpy.types.Material]:
    defaults = {
        "Skin": (0.50, 0.25, 0.15, 1.0),
        "ClothUpper": (0.06, 0.08, 0.10, 1.0),
        "ClothLower": (0.035, 0.04, 0.05, 1.0),
        "Hair": (0.018, 0.012, 0.008, 1.0),
        "Shoe": (0.025, 0.022, 0.020, 1.0),
        "EyeWhite": (0.86, 0.84, 0.78, 1.0),
        "Iris": (0.05, 0.08, 0.06, 1.0),
        "Pupil": (0.002, 0.002, 0.002, 1.0),
        "Lip": (0.32, 0.095, 0.075, 1.0),
        "Metal": (0.38, 0.42, 0.44, 1.0),
    }
    return {
        name: make_material(name, archetype.palette.get(name, defaults[name]))
        for name in MATERIAL_NAMES
    }


def copy_source_object(source_name: str, name: str, collection: bpy.types.Collection) -> bpy.types.Object:
    source = bpy.data.objects[source_name]
    clone = source.copy()
    clone.data = source.data.copy()
    clone.animation_data_clear()
    clone.name = name
    clone.location = (0.0, 0.0, 0.0)
    clone.rotation_euler = (0.0, 0.0, 0.0)
    clone.scale = (1.0, 1.0, 1.0)
    for modifier in list(clone.modifiers):
        clone.modifiers.remove(modifier)
    collection.objects.link(clone)
    return clone


def object_bounds(obj: bpy.types.Object) -> Tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for corner in obj.bound_box]
    return (
        Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))),
        Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points))),
    )


def deform_body(obj: bpy.types.Object, archetype: Archetype) -> None:
    """Preserve the source anatomy and vary only overall stature.

    Earlier builds scaled every vertex by height bands. Because the source
    figures' arms sit beside the torso, those broad X/Y operations also warped
    shoulders, hands and facial proportions. Hair, wardrobe and materials now
    carry identity variation while the CC0 anatomical topology stays intact.
    """
    low, high = object_bounds(obj)
    for vertex in obj.data.vertices:
        vertex.co.z = low.z + (vertex.co.z - low.z) * archetype.stature
    obj.data.update()
    straighten_head_and_neck(obj)


def smoothstep(edge0: float, edge1: float, value: float) -> float:
    t = max(0.0, min(1.0, (value - edge0) / max(edge1 - edge0, 1e-9)))
    return t * t * (3.0 - 2.0 * t)


def corrected_head_point(point: Vector, low: Vector, high: Vector, rigid: bool = False) -> Vector:
    """Return a point corrected from the source's forward-head rest sculpt."""
    height = high.z - low.z
    normalized_z = (point.z - low.z) / height
    normalized_x = abs(point.x) / height
    if rigid:
        weight = 1.0
    elif normalized_z <= 0.755 or normalized_x >= 0.155:
        return point.copy()
    else:
        vertical = smoothstep(0.755, 0.885, normalized_z)
        central = 1.0 - smoothstep(0.105, 0.155, normalized_x)
        weight = vertical * central
    if weight <= 0.0:
        return point.copy()
    pivot = Vector((0.0, height * 0.008, low.z + height * 0.775))
    # The scan's neutral head is pitched sharply toward the chest. A 10°
    # anatomical correction restores a forward gaze without tipping the chin
    # above the horizon (the earlier 21° correction overcompensated).
    angle = math.radians(-10.0) * weight
    relative = point - pivot
    return pivot + Vector(
        (
            relative.x,
            relative.y * math.cos(angle) - relative.z * math.sin(angle),
            relative.y * math.sin(angle) + relative.z * math.cos(angle),
        )
    )


def straighten_head_and_neck(body: bpy.types.Object) -> None:
    """Correct the source bundle's pronounced forward-head sculpt.

    The realistic CC0 figures are modeled with their chin and cranium pitched
    toward the chest. That is useful as a sculpting reference, but reads as a
    severe hunch once the figures are standing and walking in game. Rotate the
    central neck/head anatomy about the cervicothoracic junction with a smooth
    falloff. Shoulders and arms are intentionally excluded, preserving the
    source silhouette and the shared skeleton's relaxed stance.
    """
    low, high = object_bounds(body)
    for vertex in body.data.vertices:
        vertex.co = corrected_head_point(vertex.co, low, high)
    body.data.update()


def straighten_head_detail(obj: bpy.types.Object, body: bpy.types.Object) -> None:
    """Rigidly carry eye parts with the corrected cranium.

    Eye objects are separate source meshes, so changing only the anatomical
    body would leave sclera, iris and pupils at the old hunched pose.
    """
    low, high = object_bounds(body)
    corrected = corrected_head_point(obj.location, low, high, rigid=True)
    rotation = Matrix.Rotation(math.radians(-10.0), 4, "X")
    obj.location = corrected
    obj.rotation_euler.rotate(rotation.to_euler())


def assign_material(obj: bpy.types.Object, material: bpy.types.Material) -> None:
    obj.data.materials.clear()
    obj.data.materials.append(material)


def face_center(mesh: bpy.types.Mesh, polygon: bpy.types.MeshPolygon) -> Vector:
    return sum((mesh.vertices[i].co for i in polygon.vertices), Vector()) / len(polygon.vertices)


def make_surface_shell(
    body: bpy.types.Object,
    name: str,
    material: bpy.types.Material,
    predicate: Callable[[Vector, Vector, Vector], bool],
    thickness: float,
    collection: bpy.types.Collection,
) -> bpy.types.Object:
    low, high = object_bounds(body)
    shell = body.copy()
    shell.data = body.data.copy()
    shell.name = name
    shell.animation_data_clear()
    for modifier in list(shell.modifiers):
        shell.modifiers.remove(modifier)
    collection.objects.link(shell)
    mesh = shell.data
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bm.faces.ensure_lookup_table()
    delete_faces = []
    for face in bm.faces:
        center = sum((v.co for v in face.verts), Vector()) / len(face.verts)
        if not predicate(center, low, high):
            delete_faces.append(face)
    bmesh.ops.delete(bm, geom=delete_faces, context="FACES")
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
    bm.to_mesh(mesh)
    bm.free()
    mesh.update()
    assign_material(shell, material)
    if thickness > 0:
        solidify = shell.modifiers.new("Tailored volume", "SOLIDIFY")
        solidify.thickness = thickness
        solidify.offset = 1.0
        solidify.use_rim = True
        bevel = shell.modifiers.new("Soft garment edge", "BEVEL")
        bevel.width = thickness * 0.45
        bevel.segments = 2
    shell["sloth_city_surface_shell"] = True
    return shell


def level_surface_boundary(
    shell: bpy.types.Object,
    body: bpy.types.Object,
    selector: Callable[[Vector, Vector, Vector], bool],
    target_height: float,
) -> None:
    """Finish a fitted shell with a deliberate, non-triangulated edge.

    Selecting wardrobe and hair from anatomical source faces is ideal for fit,
    but raw face deletion leaves a visible sawtooth wherever alternating
    triangles cross the selection threshold. Only boundary vertices matching
    the supplied region are leveled; the interior continues to follow the
    authored anatomy exactly.
    """
    low, high = object_bounds(body)
    height = high.z - low.z
    bm = bmesh.new()
    bm.from_mesh(shell.data)
    bm.verts.ensure_lookup_table()
    for vertex in bm.verts:
        if any(len(edge.link_faces) == 1 for edge in vertex.link_edges) and selector(vertex.co, low, high):
            vertex.co.z = low.z + height * target_height
    bm.to_mesh(shell.data)
    bm.free()
    shell.data.update()


def torso_predicate(center: Vector, low: Vector, high: Vector) -> bool:
    h = high.z - low.z
    z = (center.z - low.z) / h
    x = abs(center.x) / h
    # Torso and upper arms; ends above the wrist to preserve anatomical hands.
    return 0.48 < z < 0.815 and (x < 0.185 or (z > 0.56 and x < 0.275))


def neckline_boundary(point: Vector, low: Vector, high: Vector) -> bool:
    """Select only the central top edge of the upper garment.

    Wrist openings follow the arm anatomy and must not be flattened in world
    Z. Keeping this selector central and high removes scan-triangle teeth at
    the neckline without recreating the stretched torso spikes seen in the
    earlier broad boundary pass.
    """
    h = high.z - low.z
    z = (point.z - low.z) / h
    x = abs(point.x) / h
    return z > 0.77 and x < 0.19


def pants_predicate(center: Vector, low: Vector, high: Vector) -> bool:
    h = high.z - low.z
    z = (center.z - low.z) / h
    x = abs(center.x) / h
    return 0.105 < z < 0.525 and x < 0.135


def shoe_predicate(center: Vector, low: Vector, high: Vector) -> bool:
    h = high.z - low.z
    z = (center.z - low.z) / h
    x = abs(center.x) / h
    return z < 0.105 and x < 0.14


def hair_predicate(style: str) -> Callable[[Vector, Vector, Vector], bool]:
    def predicate(center: Vector, low: Vector, high: Vector) -> bool:
        h = high.z - low.z
        z = (center.z - low.z) / h
        x = abs(center.x) / h
        y = center.y / h
        # A single contiguous scalp selection is intentionally preferred over
        # broad height-only rules. The bundled figures face -Y, so a longer
        # style may continue down the back of the skull but must never select
        # forehead, eye, cheek or mouth polygons. Those facial islands were
        # the dark "mask" remnants visible on the earlier female rigs.
        long_style = style in {"bob", "ponytail"}
        # Height alone is not enough: on the more compact female head the
        # brow, eye sockets and upper cheeks also sit above 0.94. Keep the
        # crown on/behind the hairline in depth as well.
        crown = z > 0.940 and y > -0.040
        back_drop = long_style and z > 0.895 and y > -0.004
        return x < 0.125 and (crown or back_drop)
    return predicate


def recess_body_under_shells(
    body: bpy.types.Object,
    predicates: Sequence[Callable[[Vector, Vector, Vector], bool]],
    clearance: float,
) -> None:
    """Move only fully covered anatomical vertices beneath fitted surfaces.

    The source anatomy includes subtle raised landmarks that can z-fight
    through close-fitting cloth. Recessing vertices whose every adjacent face
    is covered preserves visible skin and garment boundaries while preventing
    chest/torso pinpricks without deleting the continuous authored body.
    """
    mesh = body.data
    low, high = object_bounds(body)
    covered_faces = {
        polygon.index: any(predicate(face_center(mesh, polygon), low, high) for predicate in predicates)
        for polygon in mesh.polygons
    }
    linked_faces: Dict[int, List[int]] = {vertex.index: [] for vertex in mesh.vertices}
    for polygon in mesh.polygons:
        for vertex_index in polygon.vertices:
            linked_faces[vertex_index].append(polygon.index)
    offsets = {
        vertex.index: vertex.normal.copy() * clearance
        for vertex in mesh.vertices
        if linked_faces[vertex.index] and all(covered_faces[index] for index in linked_faces[vertex.index])
    }
    for vertex_index, offset in offsets.items():
        mesh.vertices[vertex_index].co -= offset
    mesh.update()


def apply_modifiers(obj: bpy.types.Object) -> None:
    select_only([obj])
    for modifier in list(obj.modifiers):
        try:
            bpy.context.view_layer.objects.active = obj
            bpy.ops.object.modifier_apply(modifier=modifier.name)
        except RuntimeError:
            obj.modifiers.remove(modifier)


def add_eye_disc(
    name: str,
    location: Sequence[float],
    radius: float,
    depth: float,
    material: bpy.types.Material,
    collection: bpy.types.Collection,
    vertices: int = 32,
) -> bpy.types.Object:
    """Create a thin, flush iris/pupil instead of a protruding second eyeball."""
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices,
        radius=radius,
        depth=depth,
        location=location,
        rotation=(math.pi / 2.0, 0.0, 0.0),
    )
    obj = bpy.context.object
    obj.name = name
    for old_collection in list(obj.users_collection):
        old_collection.objects.unlink(obj)
    collection.objects.link(obj)
    assign_material(obj, material)
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def add_eye_details(
    source_kind: str,
    body_source_location: Vector,
    archetype: Archetype,
    materials: Dict[str, bpy.types.Material],
    collection: bpy.types.Collection,
) -> List[bpy.types.Object]:
    objects: List[bpy.types.Object] = []
    prefix = SOURCE_OBJECTS[source_kind]
    for side in ("L", "R"):
        source_eye = bpy.data.objects[f"{prefix}.eye.{side}"]
        eye = source_eye.copy()
        eye.data = source_eye.data.copy()
        eye.name = f"Eye.{side}"
        eye.location = source_eye.location - body_source_location
        # The body is lengthened/shortened in object space. Scale the eye
        # origin by the same factor or non-default statures place the eyeballs
        # on the brow/cheek while the head moves underneath them.
        eye.location.z *= archetype.stature
        eye.scale.z *= archetype.stature
        eye.hide_render = False
        eye.hide_viewport = False
        for modifier in list(eye.modifiers):
            eye.modifiers.remove(modifier)
        collection.objects.link(eye)
        assign_material(eye, materials["EyeWhite"])
        objects.append(eye)

        # The bundled bodies face -Y. Keep the colored anatomy nearly flush to
        # the existing sclera and use source-specific adult proportions.
        iris_radius = (0.0081 if source_kind == "male" else 0.0067) * archetype.stature
        iris_location = Vector(eye.location)
        iris_location.y -= 0.0146
        iris = add_eye_disc(
            f"Iris.{side}",
            iris_location,
            iris_radius,
            0.0010,
            materials["Iris"],
            collection,
            vertices=archetype.eye_segments,
        )
        pupil_location = iris_location.copy()
        pupil_location.y -= 0.0007
        pupil = add_eye_disc(
            f"Pupil.{side}",
            pupil_location,
            iris_radius * 0.39,
            0.0008,
            materials["Pupil"],
            collection,
            vertices=20,
        )
        objects.extend([iris, pupil])
    return objects


def make_armature(body: bpy.types.Object, collection: bpy.types.Collection, source_kind: str) -> bpy.types.Object:
    low, high = object_bounds(body)
    h = high.z - low.z
    armature_data = bpy.data.armatures.new("HumanRig")
    rig = bpy.data.objects.new("HumanRig", armature_data)
    collection.objects.link(rig)
    select_only([rig])
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name: str, head: Sequence[float], tail: Sequence[float], parent: str | None = None, connected: bool = False):
        item = armature_data.edit_bones.new(name)
        item.head = head
        item.tail = tail
        if parent:
            item.parent = armature_data.edit_bones[parent]
            item.use_connect = connected
        return item

    z0 = low.z
    bone("Hips", (0, 0, z0 + h * 0.475), (0, 0, z0 + h * 0.535))
    bone("Spine", (0, 0, z0 + h * 0.535), (0, 0, z0 + h * 0.650), "Hips", True)
    bone("Chest", (0, 0, z0 + h * 0.650), (0, 0, z0 + h * 0.775), "Spine", True)
    neck_head = corrected_head_point(Vector((0, 0, z0 + h * 0.815)), low, high)
    neck_tail = corrected_head_point(Vector((0, 0, z0 + h * 0.855)), low, high)
    head_tail = corrected_head_point(Vector((0, 0, z0 + h * 0.985)), low, high)
    bone("Neck", neck_head, neck_tail, "Chest")
    bone("Head", neck_tail, head_tail, "Neck", True)

    landmarks = {
        "male": {
            "shoulder": (0.127, 0.008, 0.805), "elbow": (0.201, -0.006, 0.655),
            "wrist": (0.234, -0.059, 0.515), "hand": (0.239, -0.051, 0.450),
            "hip": (0.065, -0.005, 0.505), "knee": (0.061, 0.0, 0.285),
            "ankle": (0.070, 0.001, 0.075), "toe": (0.091, -0.068, 0.018),
        },
        "female": {
            "shoulder": (0.117, 0.004, 0.805), "elbow": (0.163, 0.015, 0.655),
            "wrist": (0.223, -0.022, 0.515), "hand": (0.245, -0.048, 0.450),
            "hip": (0.065, -0.010, 0.505), "knee": (0.067, 0.003, 0.285),
            "ankle": (0.076, 0.023, 0.075), "toe": (0.094, -0.052, 0.018),
        },
    }[source_kind]

    def point(name: str, sign: float) -> Vector:
        x, y, z = landmarks[name]
        return Vector((sign * h * x, h * y, z0 + h * z))

    for side, sign in (("L", 1.0), ("R", -1.0)):
        shoulder, elbow, wrist, hand = (point(name, sign) for name in ("shoulder", "elbow", "wrist", "hand"))
        bone(f"UpperArm.{side}", shoulder, elbow, "Chest")
        bone(f"LowerArm.{side}", elbow, wrist, f"UpperArm.{side}", True)
        bone(f"Hand.{side}", wrist, hand, f"LowerArm.{side}", True)
        hip, knee, ankle, toe = (point(name, sign) for name in ("hip", "knee", "ankle", "toe"))
        bone(f"UpperLeg.{side}", hip, knee, "Hips")
        bone(f"LowerLeg.{side}", knee, ankle, f"UpperLeg.{side}", True)
        bone(f"Foot.{side}", ankle, toe, f"LowerLeg.{side}")
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    rig["sloth_city_shared_rig"] = True
    return rig


def point_segment_distance(point: Vector, start: Vector, end: Vector) -> float:
    delta = end - start
    length_squared = delta.length_squared
    if length_squared <= 1e-12:
        return (point - start).length
    t = max(0.0, min(1.0, (point - start).dot(delta) / length_squared))
    return (point - (start + delta * t)).length


def skin_object(obj: bpy.types.Object, rig: bpy.types.Object) -> None:
    if obj.type != "MESH" or not obj.data.vertices:
        return
    for group in list(obj.vertex_groups):
        obj.vertex_groups.remove(group)
    bones = [bone for bone in rig.data.bones if not bone.name.startswith("ORG-")]
    groups = {bone.name: obj.vertex_groups.new(name=bone.name) for bone in bones}
    bone_segments = {bone.name: (rig.matrix_world @ bone.head_local, rig.matrix_world @ bone.tail_local) for bone in bones}
    for vertex in obj.data.vertices:
        point = obj.matrix_world @ vertex.co
        distances = sorted(
            ((name, point_segment_distance(point, start, end)) for name, (start, end) in bone_segments.items()),
            key=lambda item: item[1],
        )[:4]
        # Smooth inverse-distance blending; nearby anatomy wins without hard seams.
        weighted = [(name, 1.0 / max(distance, 0.012) ** 2.3) for name, distance in distances]
        total = sum(weight for _, weight in weighted)
        for name, weight in weighted:
            groups[name].add([vertex.index], weight / total, "REPLACE")
    modifier = obj.modifiers.new("HumanRig", "ARMATURE")
    modifier.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()


def reset_pose(rig: bpy.types.Object) -> None:
    for pose_bone in rig.pose.bones:
        pose_bone.location = (0.0, 0.0, 0.0)
        pose_bone.rotation_mode = "XYZ"
        pose_bone.rotation_euler = (0.0, 0.0, 0.0)
        pose_bone.scale = (1.0, 1.0, 1.0)


def add_idle_action(rig: bpy.types.Object) -> bpy.types.Action:
    bpy.context.view_layer.objects.active = rig
    reset_pose(rig)
    action = bpy.data.actions.new("HumanIdle")
    rig.animation_data_create()
    rig.animation_data.action = action
    for frame, breath in ((1, 0.0), (32, 0.010), (64, 0.0)):
        chest = rig.pose.bones.get("Chest")
        head = rig.pose.bones.get("Head")
        if chest:
            chest.scale = (1.0 + breath * 0.35, 1.0 + breath * 0.35, 1.0 + breath)
            chest.keyframe_insert("scale", frame=frame, group="HumanIdle")
        if head:
            head.rotation_mode = "XYZ"
            head.rotation_euler.z = math.radians(0.8) * math.sin(frame / 64.0 * math.pi * 2.0)
            head.keyframe_insert("rotation_euler", frame=frame, group="HumanIdle")
    for fcurve in action.fcurves:
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "SINE"
    action.use_fake_user = True
    return action


def add_walk_action(rig: bpy.types.Object) -> bpy.types.Action:
    """Author a compact, looping walk with opposing limbs and planted cadence."""
    bpy.context.view_layer.objects.active = rig
    reset_pose(rig)
    action = bpy.data.actions.new("HumanWalk")
    rig.animation_data_create()
    rig.animation_data.action = action
    keyframes = (
        (1, 0.0, 1.0),
        (7, 1.0, 0.0),
        (13, 0.0, -1.0),
        (19, 1.0, 0.0),
        (25, 0.0, 1.0),
    )
    hips = rig.pose.bones.get("Hips")
    chest = rig.pose.bones.get("Chest")
    for frame, bounce, stride in keyframes:
        if hips:
            hips.location.z = 0.011 * bounce
            hips.rotation_euler.z = math.radians(1.6) * stride
            hips.keyframe_insert("location", frame=frame, group="HumanWalk")
            hips.keyframe_insert("rotation_euler", frame=frame, group="HumanWalk")
        if chest:
            chest.rotation_euler.z = math.radians(-2.2) * stride
            chest.keyframe_insert("rotation_euler", frame=frame, group="HumanWalk")
        for side, direction in (("L", 1.0), ("R", -1.0)):
            upper_leg = rig.pose.bones.get(f"UpperLeg.{side}")
            lower_leg = rig.pose.bones.get(f"LowerLeg.{side}")
            upper_arm = rig.pose.bones.get(f"UpperArm.{side}")
            lower_arm = rig.pose.bones.get(f"LowerArm.{side}")
            phase = stride * direction
            if upper_leg:
                upper_leg.rotation_euler.x = math.radians(23.0) * phase
                upper_leg.keyframe_insert("rotation_euler", frame=frame, group="HumanWalk")
            if lower_leg:
                # Flex the trailing knee most at mid-stride without hyperextension.
                lower_leg.rotation_euler.x = math.radians(-13.0) * max(0.0, -phase) - math.radians(5.0) * bounce
                lower_leg.keyframe_insert("rotation_euler", frame=frame, group="HumanWalk")
            if upper_arm:
                upper_arm.rotation_euler.x = math.radians(-16.0) * phase
                upper_arm.keyframe_insert("rotation_euler", frame=frame, group="HumanWalk")
            if lower_arm:
                lower_arm.rotation_euler.x = math.radians(-8.0) * (0.35 + max(0.0, phase))
                lower_arm.keyframe_insert("rotation_euler", frame=frame, group="HumanWalk")
    for fcurve in action.fcurves:
        for keyframe in fcurve.keyframe_points:
            keyframe.interpolation = "BEZIER"
    action.use_fake_user = True
    reset_pose(rig)
    return action


def install_animation_tracks(rig: bpy.types.Object, actions: Sequence[bpy.types.Action]) -> None:
    """Expose each authored action as its own glTF clip through NLA tracks."""
    rig.animation_data_create()
    rig.animation_data.action = None
    for existing in list(rig.animation_data.nla_tracks):
        rig.animation_data.nla_tracks.remove(existing)
    for action in actions:
        track = rig.animation_data.nla_tracks.new()
        track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.action_frame_start = action.frame_range[0]
        strip.action_frame_end = action.frame_range[1]
        strip.use_auto_blend = False
    reset_pose(rig)


def triangulate_and_smooth(obj: bpy.types.Object) -> None:
    if obj.type != "MESH":
        return
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    triangulate = obj.modifiers.new("Export triangulation", "TRIANGULATE")
    triangulate.keep_custom_normals = True
    apply_modifiers(obj)


def merge_by_material(objects: Sequence[bpy.types.Object]) -> List[bpy.types.Object]:
    """Collapse decorative parts into one mesh per material/draw call."""
    grouped: Dict[str, List[bpy.types.Object]] = {}
    for obj in objects:
        if obj.type != "MESH" or not obj.data.materials:
            continue
        material = obj.data.materials[0]
        key = material.name if material else "Unassigned"
        grouped.setdefault(key, []).append(obj)
    merged: List[bpy.types.Object] = []
    for material_name, group in grouped.items():
        if len(group) > 1:
            select_only(group)
            bpy.context.view_layer.objects.active = group[0]
            bpy.ops.object.join()
            joined = bpy.context.object
        else:
            joined = group[0]
        joined.name = material_name
        merged.append(joined)
    return merged


def duplicate_for_lod(objects: Sequence[bpy.types.Object], rig: bpy.types.Object, ratio: float) -> Tuple[List[bpy.types.Object], bpy.types.Object]:
    select_only(list(objects) + [rig])
    bpy.ops.object.duplicate()
    duplicates = list(bpy.context.selected_objects)
    lod_rig = next(obj for obj in duplicates if obj.type == "ARMATURE")
    lod_meshes = [obj for obj in duplicates if obj.type == "MESH"]
    for obj in lod_meshes:
        obj.name = f"{obj.name}.LOD2"
        # Parent/armature links after a plain duplicate can still point to the original.
        obj.parent = lod_rig
        # Decimation is a topology operation. Remove and recreate the armature
        # modifier around it so Blender does not bake the current pose while
        # applying a later modifier in the stack. Vertex groups survive and are
        # interpolated by the decimator.
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        if len(obj.data.polygons) > 320:
            decimate = obj.modifiers.new("Mobile decimation", "DECIMATE")
            decimate.decimate_type = "COLLAPSE"
            decimate.ratio = ratio
            decimate.use_collapse_triangulate = True
            decimate.use_symmetry = True
            apply_modifiers(obj)
        modifier = obj.modifiers.new("HumanRig", "ARMATURE")
        modifier.object = lod_rig
    return lod_meshes, lod_rig


def gltf_export(filepath: Path, objects: Sequence[bpy.types.Object]) -> None:
    select_only(objects)
    kwargs = dict(
        filepath=str(filepath),
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_tangents=False,
        export_materials="EXPORT",
        export_colors=True,
        export_cameras=False,
        export_lights=False,
        export_skins=True,
        export_def_bones=True,
        export_animations=True,
        export_frame_range=True,
        export_force_sampling=False,
        export_nla_strips=True,
        export_optimize_animation_size=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=12,
        export_draco_color_quantization=10,
        export_draco_generic_quantization=12,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        # Blender minor releases occasionally rename optional exporter switches.
        for optional in ("export_force_sampling", "export_optimize_animation_size", "export_nla_strips"):
            kwargs.pop(optional, None)
        bpy.ops.export_scene.gltf(**kwargs)


def render_preview(
    archetype: Archetype,
    objects: Sequence[bpy.types.Object],
    body: bpy.types.Object,
    preview_dir: Path,
) -> None:
    scene = bpy.context.scene
    low, high = object_bounds(body)
    height = high.z - low.z
    center = Vector((0.0, 0.0, low.z + height * 0.52))
    bpy.ops.object.camera_add(location=(height * 0.45, -height * 2.45, low.z + height * 0.64))
    camera = bpy.context.object
    camera.name = "PreviewCamera"
    direction = center - camera.location
    camera.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    camera.data.lens = 70
    scene.camera = camera

    def area_light(name: str, location: Sequence[float], energy: float, size: float, color: Sequence[float]):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.size = size
        light.data.color = color
        light.rotation_euler = (Vector((0.0, 0.0, low.z + height * 0.60)) - light.location).to_track_quat("-Z", "Y").to_euler()
        return light

    key = area_light("Key", (-height * 1.0, -height * 1.5, low.z + height * 1.25), 900, height, (1.0, 0.78, 0.62))
    fill = area_light("Fill", (height * 1.1, -height * 0.8, low.z + height * 0.75), 520, height * 0.8, (0.58, 0.76, 1.0))
    rim = area_light("Rim", (0.0, height * 1.4, low.z + height * 1.05), 780, height * 0.7, (0.72, 0.92, 1.0))

    bpy.ops.mesh.primitive_plane_add(size=height * 6.0, location=(0.0, 0.0, low.z - 0.015))
    floor = bpy.context.object
    floor.name = "PreviewFloor"
    floor.data.materials.append(make_material("PreviewFloor", (0.018, 0.024, 0.028, 1.0)))

    # Workbench is deliberately used for deterministic CI/headless previews. Eevee
    # in Blender 3.4 can abort on Apple Silicon after a Draco export in background
    # mode; the shipped GLBs still use their full physically based materials.
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"
    scene.display.shading.studio_light = "paint.sl"
    scene.display.shading.color_type = "MATERIAL"
    scene.display.shading.show_shadows = True
    scene.display.shading.show_cavity = True
    scene.display.shading.cavity_type = "BOTH"
    scene.display.shading.curvature_ridge_factor = 1.5
    scene.display.shading.curvature_valley_factor = 1.25
    scene.render.resolution_x = 1024
    scene.render.resolution_y = 1024
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.view_settings.look = "Medium High Contrast"
    scene.render.film_transparent = False
    scene.world.color = (0.008, 0.012, 0.016)
    scene.render.filepath = str(preview_dir / f"{archetype.slug}.png")
    bpy.ops.render.render(write_still=True)

    for obj in (camera, key, fill, rim, floor):
        bpy.data.objects.remove(obj, do_unlink=True)


def mesh_stats(objects: Sequence[bpy.types.Object]) -> Dict[str, int]:
    meshes = [obj for obj in objects if obj.type == "MESH"]
    for obj in meshes:
        obj.data.calc_loop_triangles()
    return {
        "meshes": len(meshes),
        "vertices": sum(len(obj.data.vertices) for obj in meshes),
        "triangles": sum(len(obj.data.loop_triangles) for obj in meshes),
        "materials": len({slot.material.name for obj in meshes for slot in obj.material_slots if slot.material}),
    }


def build_archetype(
    archetype: Archetype,
    output_dir: Path,
    preview_dir: Path | None,
) -> Dict[str, object]:
    collection = bpy.data.collections.new(archetype.slug)
    bpy.context.scene.collection.children.link(collection)
    materials = create_materials(archetype)
    source_name = SOURCE_OBJECTS[archetype.source]
    source_body = bpy.data.objects[source_name]
    source_location = source_body.location.copy()
    body = copy_source_object(source_name, "Body", collection)
    deform_body(body, archetype)
    assign_material(body, materials["Skin"])

    # Extra upper-shell clearance keeps modeled anatomical landmarks from
    # z-fighting through fitted cloth at close range without inflating limbs.
    upper = make_surface_shell(body, "UpperGarment", materials["ClothUpper"], torso_predicate, 0.012, collection)
    lower = make_surface_shell(body, "LowerGarment", materials["ClothLower"], pants_predicate, 0.008, collection)
    shoes = make_surface_shell(body, "Shoes", materials["Shoe"], shoe_predicate, 0.010, collection)
    # Hair is an exact fitted scalp surface rather than an inflated primitive.
    # The underlying fully covered body vertices are recessed below, preserving
    # a continuous silhouette with no helmet rim or detached style pieces.
    hair = make_surface_shell(body, "HairCap", materials["Hair"], hair_predicate(archetype.hair), 0.0, collection)

    # Keep the fitted source boundary rather than forcing it onto a single Z
    # plane. Only the central neckline gets a narrow finishing pass; flattening
    # wrists or scalp boundaries stretched alternating triangles into the
    # pointy chest and shoulder fragments seen in review.
    level_surface_boundary(upper, body, neckline_boundary, 0.815)
    for obj in (upper, lower, shoes, hair):
        apply_modifiers(obj)
    recess_body_under_shells(
        body,
        (torso_predicate, pants_predicate, shoe_predicate, hair_predicate(archetype.hair)),
        clearance=0.014,
    )

    eye_details = add_eye_details(archetype.source, source_location, archetype, materials, collection)
    for detail in eye_details:
        straighten_head_detail(detail, body)
    # The source head already contains continuous eyelids, brows, nose and
    # modeled lips. Do not layer the legacy curve-tube mouth/brow primitives
    # over that anatomy; those were the visible browser "squigglies".
    # Likewise, do not bake the old bob strands, ponytail tubes, curl spheres,
    # collar tubes, placket or badge into the authored body. Those decorative
    # primitives detached under skinning and were the non-facial remnants the
    # browser review exposed. Shell cut and PBR material carry those details.

    rig = make_armature(body, collection, archetype.source)
    meshes = merge_by_material([obj for obj in collection.objects if obj.type == "MESH"])
    for obj in meshes:
        # Apply topology-only modifiers before binding. Applying every modifier
        # after the armature was added baked the bind pose and silently stripped
        # JOINTS_0/WEIGHTS_0 from the exported GLB.
        triangulate_and_smooth(obj)
        skin_object(obj, rig)
        obj["sloth_city_authored_human"] = True
        obj["archetype"] = archetype.slug
    actions = (add_idle_action(rig), add_walk_action(rig))
    install_animation_tracks(rig, actions)

    lod0_path = output_dir / f"{archetype.slug}-lod0.glb"
    gltf_export(lod0_path, meshes + [rig])
    if preview_dir and bpy.app.version >= (3, 6, 0):
        render_preview(archetype, meshes + [rig], body, preview_dir)
    elif preview_dir:
        print(
            "PREVIEW_SKIPPED",
            "Blender 3.4 headless rendering is unstable after Draco export; inspect the GLB in the browser QA scene.",
        )

    lod2_meshes, lod2_rig = duplicate_for_lod(meshes, rig, ratio=0.28)
    lod2_path = output_dir / f"{archetype.slug}-lod2.glb"
    gltf_export(lod2_path, lod2_meshes + [lod2_rig])

    stats = {
        "id": archetype.slug,
        "source": archetype.source,
        "license": "CC0-1.0",
        "lod0": {**mesh_stats(meshes), "bytes": lod0_path.stat().st_size, "file": lod0_path.name},
        "lod2": {**mesh_stats(lod2_meshes), "bytes": lod2_path.stat().st_size, "file": lod2_path.name},
    }
    print("BUILT", json.dumps(stats, sort_keys=True))

    # Remove generated collection before building the next archetype; source bundle stays loaded.
    for obj in list(collection.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    bpy.data.collections.remove(collection)
    # Prevent animation datablocks from accumulating suffixed copies between
    # archetypes. Every GLB must expose one unambiguous HumanIdle/HumanWalk pair.
    for action in actions:
        action.use_fake_user = False
        bpy.data.actions.remove(action)
    return stats


def main() -> None:
    args = parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    if args.preview:
        args.preview.mkdir(parents=True, exist_ok=True)
    if not args.source.exists():
        raise SystemExit(f"Source blend not found: {args.source}")

    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    # The source bundle contains many alternate bodies, heads, hands and thumbnails.
    # They are data sources only; leaving them render-visible makes preview rendering
    # needlessly huge and can exhaust older Blender builds in headless mode.
    for source_object in bpy.context.scene.objects:
        source_object.hide_render = True
        source_object.hide_viewport = True
    bpy.context.scene.frame_start = 1
    bpy.context.scene.frame_end = 64
    bpy.context.scene.render.fps = 30
    chosen = [a for a in ARCHETYPES if not args.only or a.slug == args.only]
    results = [build_archetype(a, args.output, args.preview) for a in chosen]
    manifest = {
        "schemaVersion": 1,
        "generator": "tools/character-pipeline/build_humans.py",
        "source": {
            "name": "Blender Studio Human Base Meshes bundle v1.0.0",
            "url": "https://download.blender.org/demo/bundles/bundles-3.6/human-base-meshes-bundle-v1.0.0.zip",
            "license": "CC0-1.0",
            "sha256": "46a912c0524072ac3b78c35d5d2471df7b8df102394a050ca8cd7184e3393648",
        },
        "materials": list(MATERIAL_NAMES),
        "archetypes": results,
    }
    with (args.output / "manifest.json").open("w", encoding="utf-8") as handle:
        json.dump(manifest, handle, indent=2, sort_keys=True)
        handle.write("\n")


if __name__ == "__main__":
    main()
