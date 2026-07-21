#!/usr/bin/env python3
"""Build Whiskers, the project's original tan-and-white museum cat.

The geometry, texture pixels, rig, and animation are authored by this script.
General domestic-cat anatomy and locomotion references inform proportions only;
no third-party model, texture, rig, animation, or photographic pixel is ingested.

Run with Blender 3.4 or newer:

  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup \
    --python tools/animal-pipeline/build_whiskers_cat.py -- \
    --output public/game/animals/authored \
    --source tools/animal-pipeline/source \
    --preview tools/animal-pipeline/review/whiskers-cat \
    --keep-blend
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import tempfile
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

import bpy
import bmesh
import numpy as np
from mathutils import Vector

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_mallard_duck as common


ASSET_ID = "whiskers-cat"
CLIP_NAMES = ("CatIdle", "CatWalk", "CatPounce")
TEXTURE_SIZE = 2048

# The shared exporter and contract reader intentionally use these globals.
common.ASSET_ID = ASSET_ID
common.CLIP_NAMES = CLIP_NAMES


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parent / "source")
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--keep-blend", action="store_true")
    parser.add_argument("--texture-size", type=int, default=TEXTURE_SIZE)
    return parser.parse_args(argv)


def write_source_maps(source: Path, size: int) -> Dict[str, Path]:
    """Create deterministic close-view fur maps with no external pixel input."""
    source.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(9447261)
    noise = rng.normal(0, 1, (size, size)).astype(np.float32)
    for _ in range(5):
        noise = (
            noise * 2
            + np.roll(noise, 1, 0) + np.roll(noise, -1, 0)
            + np.roll(noise, 1, 1) + np.roll(noise, -1, 1)
        ) / 6
    noise /= max(float(noise.std()), 1e-6)
    u = np.linspace(0, 1, size, endpoint=False, dtype=np.float32)
    v = np.linspace(0, 1, size, endpoint=False, dtype=np.float32)
    xx, yy = np.meshgrid(u, v)
    short_fur = np.sin((yy * 154 + xx * 13) * math.tau + noise * .46)
    guard_hairs = np.sin((yy * 47 - xx * 5) * math.tau + noise * .22)
    height = np.clip(noise * .22 + short_fur * .58 + guard_hairs * .20, -1, 1)

    def albedo(base: Tuple[float, float, float], variation_amount: float) -> np.ndarray:
        pixels = np.zeros((size, size, 4), dtype=np.float32)
        variation = np.clip(1 + noise[..., None] * variation_amount + short_fur[..., None] * .012, .84, 1.12)
        pixels[..., :3] = np.clip(np.asarray(base, dtype=np.float32) * variation, 0, 1)
        pixels[..., 3] = 1
        return pixels

    gy, gx = np.gradient(height)
    nx, ny, nz = -gx * 1.45, -gy * 1.45, np.ones_like(gx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length * .5 + .5, ny / length * .5 + .5, nz / length * .5 + .5, np.ones_like(gx)), axis=-1)
    rough_value = np.clip(.79 + noise * .018 - short_fur * .022, .69, .87)
    roughness = np.stack((rough_value, rough_value, rough_value, np.ones_like(rough_value)), axis=-1)
    paths = {
        "albedo": source / f"{ASSET_ID}-albedo.png",
        "whiteAlbedo": source / f"{ASSET_ID}-white-albedo.png",
        "normal": source / f"{ASSET_ID}-normal.png",
        "roughness": source / f"{ASSET_ID}-roughness.png",
    }
    for key, pixels in (
        ("albedo", albedo((.63, .34, .14), .032)),
        ("whiteAlbedo", albedo((.91, .86, .74), .020)),
        ("normal", normal),
        ("roughness", roughness),
    ):
        common.save_image(paths[key], pixels)
    return paths


def fur_material(name: str, albedo: Path, maps: Dict[str, Path]) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    shader = common.principled(material)
    shader.inputs["Roughness"].default_value = .78
    if "Specular" in shader.inputs:
        shader.inputs["Specular"].default_value = .34

    color_image = bpy.data.images.load(str(albedo), check_existing=True)
    color_image.name = albedo.stem
    color = nodes.new("ShaderNodeTexImage")
    color.name = f"{name}.Albedo"
    color.image = color_image
    links.new(color.outputs["Color"], shader.inputs["Base Color"])

    rough_image = bpy.data.images.load(str(maps["roughness"]), check_existing=True)
    rough_image.name = maps["roughness"].stem
    rough_image.colorspace_settings.name = "Non-Color"
    rough = nodes.new("ShaderNodeTexImage")
    rough.name = f"{name}.Roughness"
    rough.image = rough_image
    links.new(rough.outputs["Color"], shader.inputs["Roughness"])

    normal_image = bpy.data.images.load(str(maps["normal"]), check_existing=True)
    normal_image.name = maps["normal"].stem
    normal_image.colorspace_settings.name = "Non-Color"
    normal = nodes.new("ShaderNodeTexImage")
    normal.name = f"{name}.Normal"
    normal.image = normal_image
    normal_map = nodes.new("ShaderNodeNormalMap")
    normal_map.inputs["Strength"].default_value = .16
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_runtime_maps(source_maps: Dict[str, Path]) -> Dict[str, Path]:
    """Downsample embedded runtime maps while retaining 2K editable sources."""
    directory = Path(tempfile.gettempdir()) / "sloth-whiskers-runtime-textures"
    directory.mkdir(parents=True, exist_ok=True)
    result: Dict[str, Path] = {}
    for key, source in source_maps.items():
        image = bpy.data.images.load(str(source), check_existing=False)
        _ = image.pixels[0]
        image.scale(1024, 1024)
        is_albedo = "albedo" in key.lower()
        target = directory / f"{source.stem}.{'jpg' if is_albedo else 'png'}"
        image.filepath_raw = str(target)
        image.file_format = "JPEG" if is_albedo else "PNG"
        image.save()
        result[key] = target
        bpy.data.images.remove(image)
    return result


def relink_source_maps(materials: Iterable[bpy.types.Material], source_maps: Dict[str, Path]) -> None:
    """Keep the editable Blender source linked to retained 2K project maps."""
    for material in materials:
        if not material.use_nodes:
            continue
        for node in material.node_tree.nodes:
            if node.type != "TEX_IMAGE":
                continue
            if node.name.endswith(".Normal"):
                key = "normal"
            elif node.name.endswith(".Roughness"):
                key = "roughness"
            elif "White" in material.name:
                key = "whiteAlbedo"
            else:
                key = "albedo"
            old = node.image
            node.image = bpy.data.images.load(str(source_maps[key]), check_existing=True)
            node.image.name = source_maps[key].stem
            if key in ("normal", "roughness"):
                node.image.colorspace_settings.name = "Non-Color"
            if old and old.users == 0:
                bpy.data.images.remove(old)


def axial_cat_surface(material: bpy.types.Material) -> bpy.types.Object:
    """A measured rump-to-muzzle loft forming one coherent feline axial skin."""
    # y, centre z, half width, dorsal radius, ventral radius
    sections = (
        (.72, .55, .135, .15, .14),
        (.62, .56, .255, .245, .245),
        (.42, .56, .300, .275, .255),
        (.12, .58, .292, .280, .250),
        (-.16, .61, .270, .265, .245),
        (-.38, .66, .235, .235, .220),
        (-.51, .75, .165, .185, .175),
        (-.61, .89, .205, .220, .185),
        (-.78, .96, .235, .215, .190),
        (-.91, .91, .190, .135, .125),
        (-1.04, .875, .118, .080, .070),
        (-1.10, .875, .050, .032, .030),
    )
    radial = 48
    vertices: List[Tuple[float, float, float]] = []
    for y, center_z, radius_x, dorsal, ventral in sections:
        for index in range(radial):
            angle = math.tau * index / radial
            sine = math.sin(angle)
            radius_z = dorsal if sine >= 0 else ventral
            cheek = math.exp(-((y + .82) / .16) ** 2) * max(0, -sine) * .022
            z = center_z + sine * radius_z - cheek
            x = math.cos(angle) * radius_x
            vertices.append((x, y, z))
    faces: List[Tuple[int, ...]] = []
    for section in range(len(sections) - 1):
        for index in range(radial):
            nxt = (index + 1) % radial
            a = section * radial + index
            b = (section + 1) * radial + index
            faces.append((a, b, (section + 1) * radial + nxt, section * radial + nxt))
    faces.append(tuple(reversed(range(radial))))
    last = (len(sections) - 1) * radial
    faces.append(tuple(last + index for index in range(radial)))
    mesh = bpy.data.meshes.new("WhiskersContinuousAxialSkin")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    body = bpy.data.objects.new("WhiskersAnatomicalSurface", mesh)
    bpy.context.collection.objects.link(body)
    body.data.materials.append(material)
    subdivision = body.modifiers.new("Whiskers axial surface", "SUBSURF")
    subdivision.levels = 2
    subdivision.render_levels = 2
    common.apply_modifier(body, subdivision.name)
    common.smooth_mesh(body)
    return body


def ear_volume(name: str, sign: int, material: bpy.types.Material) -> bpy.types.Object:
    inner_x = sign * .095
    outer_x = sign * .225
    vertices = [
        (inner_x, -.79, 1.10), (outer_x, -.75, 1.06), (sign * .185, -.74, 1.35),
        (inner_x, -.67, 1.10), (outer_x, -.65, 1.06), (sign * .185, -.66, 1.35),
    ]
    faces = [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    bevel = obj.modifiers.new(f"{name} soft cartilage", "BEVEL")
    bevel.width = .018
    bevel.segments = 3
    common.apply_modifier(obj, bevel.name)
    return common.smooth_mesh(obj)


def make_continuous_body(materials: Dict[str, bpy.types.Material]) -> bpy.types.Object:
    body = axial_cat_surface(materials["tan"])
    parts: List[bpy.types.Object] = [body]
    # Each limb is an anatomical shoulder/hip-to-digital path that overlaps the
    # axial skin before a voxel union creates a single watertight surface.
    for side, sign in (("L", 1), ("R", -1)):
        parts.append(common.tapered_path(
            f"Foreleg.{side}.AnatomicalPath",
            ((sign * .205, -.35, .64), (sign * .245, -.42, .42), (sign * .235, -.46, .19),
             (sign * .225, -.53, .09), (sign * .225, -.64, .07)),
            (.145, .115, .078, .105, .070), materials["tan"], 28,
        ))
        parts.append(common.tapered_path(
            f"Hindleg.{side}.AnatomicalPath",
            ((sign * .235, .43, .62), (sign * .285, .49, .40), (sign * .255, .40, .17),
             (sign * .245, .27, .09), (sign * .245, .13, .07)),
            (.175, .145, .085, .112, .074), materials["tan"], 28,
        ))
        parts.append(ear_volume(f"Ear.{side}.Cartilage", sign, materials["tan"]))
    parts.append(common.tapered_path(
        "Tail.AnatomicalCurve",
        ((0, .62, .64), (.12, .82, .70), (.33, .95, .82), (.48, .89, 1.02), (.52, .69, 1.18)),
        (.135, .120, .098, .076, .046), materials["tan"], 32,
    ))

    common.select_only(parts)
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = "WhiskersContinuousFusedSkin"
    body.data.name = "WhiskersContinuousFusedSkin"
    union = body.modifiers.new("Whiskers watertight anatomical union", "REMESH")
    union.mode = "VOXEL"
    union.octree_depth = 8
    union.scale = .97
    union.use_remove_disconnected = True
    union.threshold = 1.0
    union.use_smooth_shade = True
    common.apply_modifier(body, union.name)
    smooth = body.modifiers.new("Whiskers sculptural relax", "SMOOTH")
    smooth.factor = .42
    smooth.iterations = 3
    common.apply_modifier(body, smooth.name)
    subdivision = body.modifiers.new("Whiskers close-view finish", "SUBSURF")
    subdivision.levels = 1
    subdivision.render_levels = 1
    common.apply_modifier(body, subdivision.name)
    common.smooth_mesh(body)

    # Voxel remesh can leave a sub-voxel cap island at an aggressively tapered
    # extremity. Remove only tiny disconnected islands before skinning; the
    # primary anatomical surface remains a single connected component.
    adjacency = [set() for _ in body.data.vertices]
    for polygon in body.data.polygons:
        indices = list(polygon.vertices)
        for left, right in zip(indices, indices[1:] + indices[:1]):
            adjacency[left].add(right)
            adjacency[right].add(left)
    remaining = set(range(len(adjacency)))
    remove_indices = set()
    while remaining:
        seed = remaining.pop()
        stack = [seed]
        component = {seed}
        while stack:
            vertex = stack.pop()
            for neighbor in adjacency[vertex]:
                if neighbor in remaining:
                    remaining.remove(neighbor)
                    component.add(neighbor)
                    stack.append(neighbor)
        if len(component) < 100:
            remove_indices.update(component)
    if remove_indices:
        mesh = bmesh.new()
        mesh.from_mesh(body.data)
        mesh.verts.ensure_lookup_table()
        bmesh.ops.delete(mesh, geom=[mesh.verts[index] for index in remove_indices], context="VERTS")
        mesh.to_mesh(body.data)
        mesh.free()
        body.data.update()

    body.data.materials.clear()
    body.data.materials.append(materials["tan"])
    body.data.materials.append(materials["white"])
    # White muzzle, bib, belly, and socks are painted onto the continuous skin.
    for polygon in body.data.polygons:
        center = sum((body.data.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        muzzle = center.y < -.88 and center.z < .94
        bib = -.62 < center.y < -.16 and center.z < .61 and abs(center.x) < .19
        belly = -.16 <= center.y < .36 and center.z < .42
        socks = center.z < .19 and abs(center.x) > .12
        polygon.material_index = 1 if muzzle or bib or belly or socks else 0
    body["continuous_anatomical_mesh"] = True
    body["source_geometry"] = "original-profile-loft-voxel-union"
    common.smart_uv(body)
    return body


def inner_ear(name: str, sign: int, material: bpy.types.Material) -> bpy.types.Object:
    vertices = [
        (sign * .118, -.798, 1.115),
        (sign * .204, -.765, 1.095),
        (sign * .180, -.754, 1.305),
    ]
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], [(0, 1, 2)])
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(material)
    solidify = obj.modifiers.new(f"{name} tissue", "SOLIDIFY")
    solidify.thickness = .006
    common.apply_modifier(obj, solidify.name)
    bevel = obj.modifiers.new(f"{name} edge", "BEVEL")
    bevel.width = .004
    bevel.segments = 2
    common.apply_modifier(obj, bevel.name)
    return obj


def make_face_details(materials: Dict[str, bpy.types.Material]) -> List[bpy.types.Object]:
    details: List[bpy.types.Object] = []
    for side, sign in (("L", 1), ("R", -1)):
        eye = common.ellipsoid(f"Eye.{side}.Cornea", (sign * .105, -.982, 1.018), (.041, .019, .045), materials["eye"], 36)
        iris = common.ellipsoid(f"Eye.{side}.AmberIris", (sign * .105, -.999, 1.018), (.027, .007, .032), materials["iris"], 32)
        pupil = common.ellipsoid(f"Eye.{side}.Pupil", (sign * .105, -1.005, 1.018), (.0065, .004, .025), materials["pupil"], 28)
        details.extend((eye, iris, pupil))
        for row, z in enumerate((.875, .895, .915)):
            start = (sign * .105, -.995, z)
            end = (sign * (.34 + row * .018), -1.035 - row * .018, z + (row - 1) * .018)
            whisker = common.tapered_path(
                f"Whisker.{side}.{row + 1}",
                (start, ((start[0] + end[0]) * .5, -1.045, z + (row - 1) * .012), end),
                (.006, .0035, .0015), materials["whisker"], 8,
            )
            details.append(whisker)
    details.append(common.ellipsoid("Nose.Leather", (0, -1.116, .89), (.043, .018, .030), materials["nose"], 36))
    return details


def make_rig() -> bpy.types.Object:
    data = bpy.data.armatures.new("WhiskersCatRig")
    rig = bpy.data.objects.new("WhiskersCatRig", data)
    bpy.context.collection.objects.link(rig)
    common.select_only([rig])
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None, connected=False):
        item = data.edit_bones.new(name)
        item.head = head
        item.tail = tail
        if parent:
            item.parent = data.edit_bones[parent]
            item.use_connect = connected
        return item

    bone("Root", (0, .05, .03), (0, .05, .28))
    bone("Spine", (0, .50, .54), (0, .02, .60), "Root")
    bone("Chest", (0, .02, .60), (0, -.40, .68), "Spine", True)
    bone("Neck", (0, -.40, .68), (0, -.62, .88), "Chest", True)
    bone("Head", (0, -.62, .88), (0, -.93, .95), "Neck", True)
    bone("Muzzle", (0, -.93, .91), (0, -1.12, .89), "Head")
    bone("TailBase", (0, .58, .63), (.14, .82, .72), "Spine")
    bone("TailMid", (.14, .82, .72), (.39, .93, .91), "TailBase", True)
    bone("TailTip", (.39, .93, .91), (.52, .69, 1.18), "TailMid", True)
    for side, sign in (("L", 1), ("R", -1)):
        bone(f"ForeUpper.{side}", (sign * .20, -.34, .62), (sign * .245, -.42, .37), "Chest")
        bone(f"ForeLower.{side}", (sign * .245, -.42, .37), (sign * .225, -.50, .10), f"ForeUpper.{side}", True)
        bone(f"ForePaw.{side}", (sign * .225, -.50, .10), (sign * .225, -.64, .07), f"ForeLower.{side}", True)
        bone(f"HindUpper.{side}", (sign * .22, .43, .60), (sign * .285, .48, .36), "Spine")
        bone(f"HindLower.{side}", (sign * .285, .48, .36), (sign * .245, .29, .10), f"HindUpper.{side}", True)
        bone(f"HindPaw.{side}", (sign * .245, .29, .10), (sign * .245, .13, .07), f"HindLower.{side}", True)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    rig["asset_id"] = ASSET_ID
    rig["skeleton_contract"] = "whiskers-cat-v1-anatomical"
    return rig


def skin_body(body: bpy.types.Object, rig: bpy.types.Object) -> None:
    groups = {bone.name: body.vertex_groups.new(name=bone.name) for bone in rig.data.bones}

    def add(vertex_index: int, assignments: Sequence[Tuple[str, float]]) -> None:
        total = sum(weight for _, weight in assignments)
        for name, weight in assignments:
            groups[name].add([vertex_index], weight / total, "REPLACE")

    for vertex in body.data.vertices:
        x, y, z = vertex.co
        side = "L" if x >= 0 else "R"
        if y > .72 and z > .60:
            amount = min(1, max(0, (y - .72) / .24))
            if x * x + (z - .98) ** 2 > .11:
                add(vertex.index, (("TailMid", 1 - amount * .55), ("TailTip", .35 + amount * .55)))
            else:
                add(vertex.index, (("TailBase", .72), ("TailMid", .28)))
        elif y < -.88:
            add(vertex.index, (("Head", .34), ("Muzzle", .66)))
        elif y < -.58:
            add(vertex.index, (("Neck", .18), ("Head", .82)))
        elif z < .48 and abs(x) > .105:
            prefix = "Fore" if y < 0 else "Hind"
            if z < .15:
                add(vertex.index, ((f"{prefix}Paw.{side}", .82), (f"{prefix}Lower.{side}", .18)))
            elif z < .33:
                add(vertex.index, ((f"{prefix}Lower.{side}", .84), (f"{prefix}Upper.{side}", .16)))
            else:
                add(vertex.index, ((f"{prefix}Upper.{side}", .78), ("Chest" if prefix == "Fore" else "Spine", .22)))
        elif y < -.30:
            add(vertex.index, (("Chest", .70), ("Neck", .30)))
        elif y < .25:
            add(vertex.index, (("Spine", .45), ("Chest", .55)))
        else:
            add(vertex.index, (("Spine", .88), ("TailBase", .12)))
    modifier = body.modifiers.new("WhiskersCatRig", "ARMATURE")
    modifier.object = rig
    body.parent = rig
    body.matrix_parent_inverse = rig.matrix_world.inverted()


def skin_rigid(obj: bpy.types.Object, rig: bpy.types.Object, bone_name: str) -> None:
    group = obj.vertex_groups.new(name=bone_name)
    group.add([vertex.index for vertex in obj.data.vertices], 1, "REPLACE")
    modifier = obj.modifiers.new("WhiskersCatRig", "ARMATURE")
    modifier.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()


def make_idle(rig: bpy.types.Object) -> bpy.types.Action:
    name = "CatIdle"
    action = common.action_begin(rig, name)
    for frame, breath, look, tail in ((1, 0, 0, 0), (30, .012, -.20, .20), (60, 0, .14, -.13), (90, .010, .23, .17), (120, 0, 0, 0)):
        common.key(rig, "Root", frame, location=(0, 0, 0), group=name)
        common.key(rig, "Chest", frame, scale=(1 + breath * .25, 1 + breath * .18, 1 + breath), rotation=(0, 0, look * .035), group=name)
        common.key(rig, "Head", frame, rotation=(look * .08, 0, look * .46), group=name)
        common.key(rig, "TailBase", frame, rotation=(0, tail * .16, tail * .25), group=name)
        common.key(rig, "TailMid", frame, rotation=(tail * .10, tail * .21, -tail * .32), group=name)
        common.key(rig, "TailTip", frame, rotation=(-tail * .12, tail * .18, tail * .40), group=name)
    return common.finish_action(action)


def make_walk(rig: bpy.types.Object) -> bpy.types.Action:
    name = "CatWalk"
    action = common.action_begin(rig, name)
    for frame, phase in ((1, 0), (9, math.pi / 2), (17, math.pi), (25, math.pi * 1.5), (33, math.tau)):
        bob = abs(math.sin(phase))
        sway = math.sin(phase)
        common.key(rig, "Root", frame, location=(0, 0, bob * .018), rotation=(0, 0, sway * math.radians(1.8)), group=name)
        common.key(rig, "Spine", frame, rotation=(sway * math.radians(2.2), 0, -sway * math.radians(2.8)), group=name)
        common.key(rig, "Chest", frame, rotation=(-sway * math.radians(1.6), 0, sway * math.radians(2.2)), group=name)
        common.key(rig, "Head", frame, rotation=(0, 0, -sway * math.radians(1.4)), group=name)
        common.key(rig, "TailBase", frame, rotation=(0, sway * math.radians(3), -sway * math.radians(7)), group=name)
        common.key(rig, "TailMid", frame, rotation=(0, -sway * math.radians(4), sway * math.radians(9)), group=name)
        for side, sign in (("L", 1), ("R", -1)):
            fore = math.sin(phase + (0 if sign > 0 else math.pi))
            hind = -fore
            common.key(rig, f"ForeUpper.{side}", frame, rotation=(fore * math.radians(25), 0, 0), group=name)
            common.key(rig, f"ForeLower.{side}", frame, rotation=(-max(0, fore) * math.radians(19), 0, 0), group=name)
            common.key(rig, f"ForePaw.{side}", frame, rotation=(-fore * math.radians(9), 0, 0), group=name)
            common.key(rig, f"HindUpper.{side}", frame, rotation=(hind * math.radians(23), 0, 0), group=name)
            common.key(rig, f"HindLower.{side}", frame, rotation=(-max(0, hind) * math.radians(22), 0, 0), group=name)
            common.key(rig, f"HindPaw.{side}", frame, rotation=(-hind * math.radians(10), 0, 0), group=name)
    return common.finish_action(action)


def make_pounce(rig: bpy.types.Object) -> bpy.types.Action:
    name = "CatPounce"
    action = common.action_begin(rig, name)
    for frame, lift, reach, crouch in ((1, 0, 0, 0), (12, -.02, -.08, 1), (23, .28, .16, .15), (34, .10, .08, .45), (50, 0, 0, 0)):
        common.key(rig, "Root", frame, location=(0, -reach, lift), rotation=(-reach * .22, 0, 0), group=name)
        common.key(rig, "Spine", frame, rotation=(crouch * math.radians(8), 0, 0), group=name)
        common.key(rig, "Chest", frame, rotation=(-crouch * math.radians(10), 0, 0), group=name)
        common.key(rig, "Head", frame, rotation=(crouch * math.radians(6), 0, 0), group=name)
        common.key(rig, "TailBase", frame, rotation=(0, -crouch * math.radians(9), 0), group=name)
        common.key(rig, "TailMid", frame, rotation=(0, crouch * math.radians(13), 0), group=name)
        for side in ("L", "R"):
            common.key(rig, f"ForeUpper.{side}", frame, rotation=(-reach * math.radians(115) + crouch * math.radians(10), 0, 0), group=name)
            common.key(rig, f"ForeLower.{side}", frame, rotation=(-crouch * math.radians(17), 0, 0), group=name)
            common.key(rig, f"HindUpper.{side}", frame, rotation=(crouch * math.radians(30), 0, 0), group=name)
            common.key(rig, f"HindLower.{side}", frame, rotation=(-crouch * math.radians(36), 0, 0), group=name)
    return common.finish_action(action)


def duplicate_lod(meshes: Sequence[bpy.types.Object], rig: bpy.types.Object, ratio=.31):
    common.select_only([*meshes, rig])
    bpy.ops.object.duplicate()
    selected = list(bpy.context.selected_objects)
    lod_rig = next(obj for obj in selected if obj.type == "ARMATURE")
    lod_rig.name = "WhiskersCatRig.LOD2"
    lod_meshes = [obj for obj in selected if obj.type == "MESH"]
    for obj in lod_meshes:
        obj.name = "WhiskersSkinnedSurface.LOD2"
        obj.parent = lod_rig
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        decimate = obj.modifiers.new("Whiskers silhouette LOD2", "DECIMATE")
        decimate.ratio = ratio
        decimate.use_collapse_triangulate = True
        decimate.use_symmetry = True
        common.apply_modifier(obj, decimate.name)
        common.limit_influences(obj)
        armature = obj.modifiers.new("WhiskersCatRig", "ARMATURE")
        armature.object = lod_rig
    return lod_meshes, lod_rig


def setup_review_scene() -> Tuple[bpy.types.Object, List[bpy.types.Object]]:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 64
    scene.eevee.use_gtao = True
    scene.eevee.gtao_distance = 2
    scene.eevee.gtao_factor = 1.2
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.012, .016, .019, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .30
    scene.view_settings.look = "Medium High Contrast"
    helpers: List[bpy.types.Object] = []
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, .006))
    ground = bpy.context.object
    ground.name = "QA.GroundContactPlane"
    ground.data.materials.append(common.simple_material("QA dark limestone", (.032, .037, .038, 1), .78))
    helpers.append(ground)
    for name, location, energy, size, color in (
        ("QA.Key", (-2.8, -3.1, 3.4), 360, 2.7, (1, .79, .63)),
        ("QA.Fill", (3.0, -1.2, 2.5), 210, 2.5, (.55, .73, 1)),
        ("QA.Rim", (-2.4, 2.5, 2.7), 390, 2.2, (.46, .82, 1)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.size = size
        light.data.color = color
        common.aim(light, (0, -.12, .58))
        helpers.append(light)
    bpy.ops.object.camera_add(location=(2.35, -3.35, 1.55))
    camera = bpy.context.object
    camera.name = "QA.FixedCamera"
    camera.data.lens = 68
    common.aim(camera, (0, -.08, .59))
    scene.camera = camera
    helpers.append(camera)
    return camera, helpers


def render_previews(rig: bpy.types.Object, actions: Sequence[bpy.types.Action], meshes: Sequence[bpy.types.Object], directory: Path) -> Dict[str, str]:
    directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    camera, helpers = setup_review_scene()
    outputs: Dict[str, str] = {}
    frames = {"CatIdle": 30, "CatWalk": 9, "CatPounce": 23}
    for action in actions:
        rig.animation_data.action = action
        scene.frame_set(frames[action.name])
        path = directory / f"{ASSET_ID}-{action.name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs[action.name] = common.retained_review_path(path)

    rig.animation_data.action = next(action for action in actions if action.name == "CatIdle")
    scene.frame_set(30)
    camera.location = (1.18, -2.12, 1.34)
    camera.data.lens = 82
    common.aim(camera, (0, -.84, .98))
    face = directory / f"{ASSET_ID}-face-closeup.png"
    scene.render.filepath = str(face)
    bpy.ops.render.render(write_still=True)
    outputs["FaceCloseup"] = common.retained_review_path(face)
    camera.location = (1.35, -.95, .52)
    camera.data.lens = 78
    common.aim(camera, (.20, -.24, .08))
    contact = directory / f"{ASSET_ID}-paw-contact.png"
    scene.render.filepath = str(contact)
    bpy.ops.render.render(write_still=True)
    outputs["PawContact"] = common.retained_review_path(contact)

    clay = common.simple_material("QA neutral sculpt clay", (.49, .51, .49, 1), .72)
    original_materials = {obj.name: list(obj.data.materials) for obj in meshes}
    original_indices = {obj.name: [polygon.material_index for polygon in obj.data.polygons] for obj in meshes}
    for obj in meshes:
        obj.data.materials.clear()
        obj.data.materials.append(clay)
    camera.location = (2.35, -3.35, 1.55)
    camera.data.lens = 68
    common.aim(camera, (0, -.08, .59))
    three_quarter = directory / f"{ASSET_ID}-clay-three-quarter.png"
    scene.render.filepath = str(three_quarter)
    bpy.ops.render.render(write_still=True)
    outputs["ClayThreeQuarter"] = common.retained_review_path(three_quarter)
    camera.location = (3.25, .02, 1.25)
    camera.data.lens = 72
    common.aim(camera, (0, -.10, .58))
    profile = directory / f"{ASSET_ID}-clay-profile.png"
    scene.render.filepath = str(profile)
    bpy.ops.render.render(write_still=True)
    outputs["ClayProfile"] = common.retained_review_path(profile)
    camera.location = (1.18, -2.12, 1.34)
    camera.data.lens = 82
    common.aim(camera, (0, -.84, .98))
    clay_face = directory / f"{ASSET_ID}-clay-face-closeup.png"
    scene.render.filepath = str(clay_face)
    bpy.ops.render.render(write_still=True)
    outputs["ClayFaceCloseup"] = common.retained_review_path(clay_face)
    camera.location = (1.35, -.95, .52)
    camera.data.lens = 78
    common.aim(camera, (.20, -.24, .08))
    clay_contact = directory / f"{ASSET_ID}-clay-paw-contact.png"
    scene.render.filepath = str(clay_contact)
    bpy.ops.render.render(write_still=True)
    outputs["ClayPawContact"] = common.retained_review_path(clay_contact)

    for obj in meshes:
        obj.data.materials.clear()
        for material in original_materials[obj.name]:
            obj.data.materials.append(material)
        for polygon, index in zip(obj.data.polygons, original_indices[obj.name]):
            polygon.material_index = index
    rig.animation_data.action = None
    scene.frame_set(1)
    for obj in helpers:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    return outputs


def render_fresh_import(glb: Path, directory: Path) -> Dict[str, str]:
    """Re-import the shipped LOD0 once and retain clip/contact gate renders."""
    common.purge()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    scene = bpy.context.scene
    rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    actions = [bpy.data.actions.get(name) for name in CLIP_NAMES]
    actions = [action for action in actions if action]
    camera, helpers = setup_review_scene()
    directory.mkdir(parents=True, exist_ok=True)
    outputs: Dict[str, str] = {}
    frames = {"CatIdle": 30, "CatWalk": 9, "CatPounce": 23}
    for action in actions:
        rig.animation_data_create()
        rig.animation_data.action = action
        scene.frame_set(frames[action.name])
        path = directory / f"{ASSET_ID}-fresh-import-{action.name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs[f"FreshImport{action.name}"] = common.retained_review_path(path)
    camera.location = (1.35, -.95, .52)
    camera.data.lens = 78
    common.aim(camera, (.20, -.24, .08))
    rig.animation_data.action = bpy.data.actions.get("CatIdle")
    scene.frame_set(30)
    contact = directory / f"{ASSET_ID}-fresh-import-paw-contact.png"
    scene.render.filepath = str(contact)
    bpy.ops.render.render(write_still=True)
    outputs["FreshImportPawContact"] = common.retained_review_path(contact)
    for obj in helpers:
        if obj.name in bpy.data.objects:
            bpy.data.objects.remove(obj, do_unlink=True)
    return outputs


def main() -> None:
    args = parse_args()
    args.output = args.output.resolve()
    args.source = args.source.resolve()
    args.output.mkdir(parents=True, exist_ok=True)
    args.source.mkdir(parents=True, exist_ok=True)
    if args.preview:
        args.preview = args.preview.resolve()
    common.purge()
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1

    source_maps = write_source_maps(args.source, args.texture_size)
    runtime_maps = make_runtime_maps(source_maps)
    materials = {
        "tan": fur_material("WhiskersTanFurPBR", runtime_maps["albedo"], runtime_maps),
        "white": fur_material("WhiskersWhiteFurPBR", runtime_maps["whiteAlbedo"], runtime_maps),
        "inner_ear": common.simple_material("WhiskersInnerEarTissue", (.63, .26, .23, 1), .67),
        "eye": common.simple_material("WhiskersEyeCornea", (.32, .16, .035, 1), .12),
        "iris": common.simple_material("WhiskersAmberIris", (.88, .54, .06, 1), .28),
        "pupil": common.simple_material("WhiskersPupil", (.003, .002, .001, 1), .10),
        "nose": common.simple_material("WhiskersRoseNose", (.36, .095, .075, 1), .50),
        "whisker": common.simple_material("WhiskersVibrissae", (.82, .78, .67, 1), .72),
    }
    body = make_continuous_body(materials)
    details = make_face_details(materials)
    for obj in details:
        if not obj.data.uv_layers:
            common.smart_uv(obj)
    rig = make_rig()
    skin_body(body, rig)
    for detail in details:
        skin_rigid(detail, rig, "Head")
    common.select_only([body, *details])
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.join()
    body = bpy.context.object
    body.name = "WhiskersSkinnedSurface"
    body.data.name = "WhiskersSkinnedSurface"
    body["draw_call_consolidated"] = True
    meshes = [body]

    actions = [make_idle(rig), make_walk(rig), make_pounce(rig)]
    common.install_tracks(rig, actions)
    common.triangulate(meshes)
    previews = render_previews(rig, actions, meshes, args.preview) if args.preview else {}
    common.install_tracks(rig, actions)
    lod2_meshes, lod2_rig = duplicate_lod(meshes, rig)
    common.triangulate(lod2_meshes)
    lod0_path = args.output / f"{ASSET_ID}-lod0.glb"
    lod2_path = args.output / f"{ASSET_ID}-lod2.glb"
    common.gltf_export(lod0_path, [*meshes, rig])
    common.gltf_export(lod2_path, [*lod2_meshes, lod2_rig])
    lod0 = common.verify_glb(lod0_path)
    lod2 = common.verify_glb(lod2_path)
    low, high = common.object_bounds(meshes)
    dimensions = high - low
    bone_names = [bone.name for bone in rig.data.bones]
    material_names = [material.name for material in materials.values()]

    if args.keep_blend:
        relink_source_maps(materials.values(), source_maps)
        bpy.context.preferences.filepaths.save_version = 0
        bpy.ops.wm.save_as_mainfile(filepath=str(args.source / f"{ASSET_ID}-source.blend"))
    if args.preview:
        previews.update(render_fresh_import(lod0_path, args.preview))

    visual_references = [
        "https://icatcare.org/advice/cat-anatomy/",
        "https://www.vet.cornell.edu/departments-centers-and-institutes/cornell-feline-health-center",
    ]
    map_embedded_names = {
        "albedo": f"{ASSET_ID}-albedo",
        "whiteAlbedo": f"{ASSET_ID}-white-albedo",
        "normal": f"{ASSET_ID}-normal",
        "roughness": f"{ASSET_ID}-roughness",
    }
    manifest = {
        "schemaVersion": 1,
        "id": ASSET_ID,
        "displayName": "Whiskers",
        "species": "Felis catus",
        "license": "Original-Project-Asset",
        "generator": "tools/animal-pipeline/build_whiskers_cat.py",
        "provenance": {
            "geometry": "Original repository-authored feline axial loft, fused anatomical limb, digital, ear and tail volumes, and consolidated face details; no third-party geometry.",
            "textures": "Original deterministic NumPy-generated tan and white short-fur PBR maps; no third-party pixels.",
            "rigging": "Original 21-bone feline skeleton, constrained skin influences, and three project-authored motion clips.",
            "referencePolicy": "Reputable feline health references informed anatomy and locomotion only; no files or pixels were copied.",
            "visualReferences": visual_references,
        },
        "coordinateSystem": {"unit": "meter", "up": "+Y", "forward": "-Z", "origin": "paw contact plane"},
        "dimensionsMeters": {"width": round(dimensions.x, 3), "length": round(dimensions.y, 3), "height": round(dimensions.z, 3)},
        "skeleton": {"name": "WhiskersCatRig", "bones": bone_names, "maxInfluences": 4},
        "clips": [{"name": name} for name in CLIP_NAMES],
        "materials": material_names,
        "maps": {
            key: {
                "kind": "albedo" if "albedo" in key.lower() else key,
                "sourceFile": str(path.relative_to(Path.cwd())),
                "embeddedImageName": map_embedded_names[key],
                "width": args.texture_size,
                "height": args.texture_size,
                "bytes": path.stat().st_size,
                "sha256": common.sha256(path),
                "runtimeMimeType": "image/png",
            }
            for key, path in source_maps.items()
        },
        "lod0": {"file": lod0_path.name, "bytes": lod0_path.stat().st_size, "sha256": common.sha256(lod0_path), **lod0},
        "lod2": {"file": lod2_path.name, "bytes": lod2_path.stat().st_size, "sha256": common.sha256(lod2_path), **lod2},
        "previews": previews,
    }
    (args.source / f"{ASSET_ID}.asset.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    (Path(__file__).resolve().parent / f"{ASSET_ID}-metrics.json").write_text(json.dumps({
        "speciesId": ASSET_ID,
        "dimensionsMeters": manifest["dimensionsMeters"],
        "skeleton": manifest["skeleton"],
        "clips": list(CLIP_NAMES),
        "lod0": manifest["lod0"],
        "lod2": manifest["lod2"],
        "maps": manifest["maps"],
        "previews": previews,
    }, indent=2, sort_keys=True) + "\n")
    (args.source / f"{ASSET_ID}.provenance.json").write_text(json.dumps({
        "speciesId": ASSET_ID,
        "license": "Original-Project-Asset",
        "source": "tools/animal-pipeline/build_whiskers_cat.py",
        "generatedSourceBlend": f"tools/animal-pipeline/source/{ASSET_ID}-source.blend",
        "thirdPartyAssets": [],
        "visualReferences": visual_references,
        "referenceUse": "Anatomy, proportion, coat breakup, and locomotion study only; no geometry, pixels, rig, or animation copied.",
        "review": {
            "clayGate": "Retained fixed-camera three-quarter, profile, face, and paw-contact clay renders generated for visual sign-off.",
            "texturedGate": "Retained fixed-camera idle, walk, pounce, face, and paw-contact renders generated for visual sign-off.",
            "liveShowroomGate": "Fresh Hero and Mobile showroom inspection remains required after generation.",
            "freshImportCount": 1 if args.preview else 0,
        },
    }, indent=2, sort_keys=True) + "\n")
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
