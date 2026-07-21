#!/usr/bin/env python3
"""Build Zap, the project's original Eastern gray squirrel.

The geometry, texture pixels, rig, and animation are authored by this script.
Official National Park Service species references inform anatomy, coat breakup,
climbing posture, and tail function only; no external model, texture, rig,
animation, or photographic pixel is ingested.

Run with Blender 3.4 or newer:

  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup \
    --python tools/animal-pipeline/build_eastern_gray_squirrel.py -- \
    --output public/game/animals/authored \
    --source tools/animal-pipeline/source \
    --preview tools/animal-pipeline/review/eastern-gray-squirrel \
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
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build_mallard_duck as common


ASSET_ID = "eastern-gray-squirrel"
CLIP_NAMES = ("SquirrelIdle", "SquirrelScamper", "SquirrelForage", "SquirrelClimb")
TEXTURE_SIZE = 2048
ROOT_CONTACT_Z = -.105

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
    """Generate directional gray guard-hair maps without external pixels."""
    source.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(3274519)
    noise = rng.normal(0, 1, (size, size)).astype(np.float32)
    for _ in range(6):
        noise = (
            noise * 2 + np.roll(noise, 1, 0) + np.roll(noise, -1, 0)
            + np.roll(noise, 1, 1) + np.roll(noise, -1, 1)
        ) / 6
    noise /= max(float(noise.std()), 1e-6)
    u = np.linspace(0, 1, size, endpoint=False, dtype=np.float32)
    v = np.linspace(0, 1, size, endpoint=False, dtype=np.float32)
    xx, yy = np.meshgrid(u, v)
    guard = np.sin((yy * 173 + xx * 9) * math.tau + noise * .44)
    under = np.sin((yy * 81 - xx * 4) * math.tau + noise * .22)
    height = np.clip(noise * .24 + guard * .56 + under * .20, -1, 1)

    # Salt-and-pepper guard hairs keep the coat gray-brown rather than flat.
    # Keep directional fibers in the normal map while breaking up color with
    # irregular guard-hair variation. A strong sine in albedo reads as woven
    # cloth at close range rather than fur.
    warm = np.clip(.5 + guard * .035 + noise * .14, 0, 1)[..., None]
    cool_color = np.asarray((.265, .275, .27), dtype=np.float32)
    warm_color = np.asarray((.44, .37, .29), dtype=np.float32)
    gray_rgb = cool_color * (1 - warm) + warm_color * warm
    gray_rgb *= np.clip(1 + noise[..., None] * .035, .86, 1.13)
    gy, gx = np.gradient(height)
    nx, ny, nz = -gx * 1.52, -gy * 1.52, np.ones_like(gx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length * .5 + .5, ny / length * .5 + .5, nz / length * .5 + .5, np.ones_like(gx)), axis=-1)
    rough_value = np.clip(.82 + noise * .018 - guard * .026, .70, .9)
    roughness = np.stack((rough_value, rough_value, rough_value, np.ones_like(rough_value)), axis=-1)

    def rgba(rgb: np.ndarray) -> np.ndarray:
        pixels = np.ones((size, size, 4), dtype=np.float32)
        pixels[..., :3] = np.clip(rgb, 0, 1)
        return pixels

    paths = {
        "albedo": source / f"{ASSET_ID}-albedo.png",
        "normal": source / f"{ASSET_ID}-normal.png",
        "roughness": source / f"{ASSET_ID}-roughness.png",
    }
    for key, pixels in (
        ("albedo", rgba(gray_rgb)),
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
    shader.inputs["Roughness"].default_value = .82
    if "Specular" in shader.inputs:
        shader.inputs["Specular"].default_value = .28
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
    normal_map.inputs["Strength"].default_value = .055
    links.new(normal.outputs["Color"], normal_map.inputs["Color"])
    links.new(normal_map.outputs["Normal"], shader.inputs["Normal"])
    return material


def make_runtime_maps(source_maps: Dict[str, Path]) -> Dict[str, Path]:
    directory = Path(tempfile.gettempdir()) / "sloth-zap-squirrel-runtime-textures"
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
            else:
                key = "albedo"
            old = node.image
            node.image = bpy.data.images.load(str(source_maps[key]), check_existing=True)
            node.image.name = source_maps[key].stem
            if key in ("normal", "roughness"):
                node.image.colorspace_settings.name = "Non-Color"
            if old and old.users == 0:
                bpy.data.images.remove(old)


def make_continuous_body(materials: Dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Grow one connected quad skin over a species-authored anatomical graph."""
    vertices: List[Tuple[float, float, float]] = []
    radii: List[Tuple[float, float]] = []
    edges: List[Tuple[int, int]] = []

    def node(point, radius_x, radius_y=None):
        vertices.append(point)
        radii.append((radius_x, radius_y if radius_y is not None else radius_x))
        return len(vertices) - 1

    def connect(left, right):
        edges.append((left, right))

    rump = node((0, .33, .34), .17, .18)
    lumbar = node((0, .12, .36), .205, .19)
    chest = node((0, -.12, .40), .19, .18)
    neck = node((0, -.30, .49), .13, .14)
    head = node((0, -.45, .59), .17, .16)
    muzzle = node((0, -.59, .56), .09, .075)
    nose = node((0, -.66, .545), .035, .028)
    for left, right in ((rump, lumbar), (lumbar, chest), (chest, neck), (neck, head), (head, muzzle), (muzzle, nose)):
        connect(left, right)

    tail_nodes = [
        node((0, .46, .47), .13),
        node((.025, .55, .65), .17),
        node((.035, .50, .83), .18),
        node((.025, .35, .94), .15),
        node((.012, .18, .92), .10),
        node((0, .07, .82), .035),
    ]
    connect(rump, tail_nodes[0])
    for left, right in zip(tail_nodes, tail_nodes[1:]):
        connect(left, right)

    for sign in (1, -1):
        shoulder = node((sign * .13, -.13, .36), .082)
        wrist = node((sign * .155, -.24, .16), .048)
        fore_pad = node((sign * .155, -.37, .045), .035, .026)
        connect(chest, shoulder); connect(shoulder, wrist); connect(wrist, fore_pad)
        hip = node((sign * .15, .16, .31), .105)
        ankle = node((sign * .18, .18, .13), .057)
        hind_pad = node((sign * .18, .02, .04), .043, .028)
        connect(lumbar, hip); connect(hip, ankle); connect(ankle, hind_pad)
        # Eastern gray squirrels have compact, softly rounded ears rather than
        # the tall triangular pinnae common to cats and hares.
        ear_base = node((sign * .095, -.42, .685), .060, .044)
        ear_tip = node((sign * .112, -.38, .785), .031, .025)
        connect(head, ear_base); connect(ear_base, ear_tip)

    mesh = bpy.data.meshes.new("ZapSquirrelConnectedAnatomicalGraph")
    mesh.from_pydata(vertices, edges, [])
    mesh.update()
    body = bpy.data.objects.new("ZapSquirrelContinuousFusedSkin", mesh)
    bpy.context.collection.objects.link(body)
    body.data.materials.append(materials["gray"])
    skin = body.modifiers.new("Zap connected anatomical skin", "SKIN")
    skin.use_smooth_shade = True
    common.select_only([body])
    bpy.context.view_layer.objects.active = body
    _ = body.data.skin_vertices[0].data[0].radius
    for index, (radius_x, radius_y) in enumerate(radii):
        body.data.skin_vertices[0].data[index].radius = (radius_x, radius_y)
    body.data.skin_vertices[0].data[lumbar].use_root = True
    common.apply_modifier(body, skin.name)
    subdivision = body.modifiers.new("Zap connected-surface finish", "SUBSURF")
    subdivision.subdivision_type = "CATMULL_CLARK"
    subdivision.levels = 3
    subdivision.render_levels = 3
    common.apply_modifier(body, subdivision.name)
    # Skin-graph branch junctions can retain inward-facing pockets even after
    # subdivision. A deterministic voxel remesh turns the authored graph into
    # one watertight manifold before UVs, rigging, and export.
    common.select_only([body])
    bpy.context.view_layer.objects.active = body
    body.data.remesh_voxel_size = .0075
    body.data.remesh_voxel_adaptivity = 0
    bpy.ops.object.voxel_remesh()
    relax = body.modifiers.new("Zap manifold surface relaxation", "SMOOTH")
    relax.factor = .22
    relax.iterations = 2
    common.apply_modifier(body, relax.name)
    common.smooth_mesh(body)

    # Keep the skinned anatomical surface on one material primitive. Splitting
    # animated torso polygons by coat color duplicates boundary vertices in
    # glTF and can expose hairline seams at extreme climbing poses.
    body.data.materials.clear()
    body.data.materials.append(materials["gray"])
    body["continuous_anatomical_mesh"] = True
    body["source_geometry"] = "original-connected-sciurid-anatomical-skin-graph"
    common.smart_uv(body)
    return body


def make_face_details(materials: Dict[str, bpy.types.Material]) -> List[bpy.types.Object]:
    details: List[bpy.types.Object] = []
    for side, sign in (("L", 1), ("R", -1)):
        details.append(common.ellipsoid(f"Eye.{side}.Cornea", (sign * .150, -.45, .625), (.030, .017, .034), materials["eye"], 36))
        details.append(common.ellipsoid(f"Eye.{side}.Catchlight", (sign * .162, -.464, .637), (.0055, .0035, .0065), materials["catchlight"], 20))
        for row, z in enumerate((.515, .535, .555)):
            start = (sign * .075, -.635, z)
            end = (sign * (.255 + row * .018), -.69 - row * .012, z + (row - 1) * .014)
            details.append(common.tapered_path(
                f"Vibrissa.{side}.{row + 1}",
                (start, ((start[0] + end[0]) * .5, -.685, z), end),
                (.0032, .0018, .0008), materials["whisker"], 7,
            ))
    details.append(common.ellipsoid("Nose.Charcoal", (0, -.665, .535), (.026, .015, .020), materials["nose"], 32))
    return details


def make_rig() -> bpy.types.Object:
    data = bpy.data.armatures.new("ZapSquirrelRig")
    rig = bpy.data.objects.new("ZapSquirrelRig", data)
    bpy.context.collection.objects.link(rig)
    common.select_only([rig])
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode="EDIT")

    def bone(name, head, tail, parent=None, connected=False):
        item = data.edit_bones.new(name)
        item.head, item.tail = head, tail
        if parent:
            item.parent = data.edit_bones[parent]
            item.use_connect = connected
        return item

    bone("Root", (0, .04, .025), (0, .04, .23))
    bone("Spine", (0, .30, .34), (0, .03, .38), "Root")
    bone("Chest", (0, .03, .38), (0, -.25, .43), "Spine", True)
    bone("Neck", (0, -.25, .43), (0, -.36, .54), "Chest", True)
    bone("Head", (0, -.36, .54), (0, -.56, .57), "Neck", True)
    bone("Muzzle", (0, -.56, .55), (0, -.67, .535), "Head")
    bone("TailBase", (0, .31, .38), (.05, .50, .54), "Spine")
    bone("TailMid", (.05, .50, .54), (.09, .53, .88), "TailBase", True)
    bone("TailCrown", (.09, .53, .88), (.05, .22, 1.07), "TailMid", True)
    bone("TailTip", (.05, .22, 1.07), (0, .01, .94), "TailCrown", True)
    for side, sign in (("L", 1), ("R", -1)):
        bone(f"ForeUpper.{side}", (sign * .14, -.17, .42), (sign * .175, -.27, .26), "Chest")
        bone(f"ForeLower.{side}", (sign * .175, -.27, .26), (sign * .17, -.37, .07), f"ForeUpper.{side}", True)
        bone(f"ForePaw.{side}", (sign * .17, -.37, .07), (sign * .17, -.49, .05), f"ForeLower.{side}", True)
        bone(f"HindUpper.{side}", (sign * .16, .21, .35), (sign * .225, .27, .21), "Spine")
        bone(f"HindLower.{side}", (sign * .225, .27, .21), (sign * .205, .10, .065), f"HindUpper.{side}", True)
        bone(f"HindPaw.{side}", (sign * .205, .10, .065), (sign * .205, -.055, .047), f"HindLower.{side}", True)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True
    rig["asset_id"] = ASSET_ID
    rig["skeleton_contract"] = "eastern-gray-squirrel-v1-anatomical"
    return rig


def skin_body(body: bpy.types.Object, rig: bpy.types.Object) -> None:
    groups = {bone.name: body.vertex_groups.new(name=bone.name) for bone in rig.data.bones}
    authored_weights: List[Dict[str, float]] = [{} for _ in body.data.vertices]

    def add(vertex_index: int, assignments: Sequence[Tuple[str, float]]) -> None:
        total = sum(weight for _, weight in assignments)
        for name, weight in assignments:
            authored_weights[vertex_index][name] = weight / total

    for vertex in body.data.vertices:
        x, y, z = vertex.co
        side = "L" if x >= 0 else "R"
        # The high plume is tail, while the head remains forward at negative y.
        if z > .78 and y > -.02:
            if y > .42:
                add(vertex.index, (("TailBase", .30), ("TailMid", .70)))
            elif y > .18:
                add(vertex.index, (("TailMid", .25), ("TailCrown", .75)))
            else:
                add(vertex.index, (("TailCrown", .42), ("TailTip", .58)))
        elif y > .38 and z > .38:
            add(vertex.index, (("Spine", .55), ("TailBase", .45)))
        elif y < -.54:
            add(vertex.index, (("Head", .35), ("Muzzle", .65)))
        elif y < -.34 and z > .43:
            add(vertex.index, (("Neck", .15), ("Head", .85)))
        elif z < .29 and abs(x) > .09:
            prefix = "Fore" if y < -.08 else "Hind"
            if z < .085:
                add(vertex.index, ((f"{prefix}Paw.{side}", .82), (f"{prefix}Lower.{side}", .18)))
            elif z < .20:
                add(vertex.index, ((f"{prefix}Lower.{side}", .84), (f"{prefix}Upper.{side}", .16)))
            else:
                add(vertex.index, ((f"{prefix}Upper.{side}", .78), ("Chest" if prefix == "Fore" else "Spine", .22)))
        elif y < -.20:
            add(vertex.index, (("Chest", .68), ("Neck", .32)))
        elif y < .10:
            add(vertex.index, (("Spine", .42), ("Chest", .58)))
        else:
            add(vertex.index, (("Spine", .88), ("TailBase", .12)))

    # Blend authored regions over mesh adjacency. Hard coordinate boundaries
    # make a watertight surface crease at tail/torso and shoulder junctions;
    # topology-aware relaxation preserves intent while producing organic skin.
    neighbors: List[List[int]] = [[] for _ in body.data.vertices]
    for edge in body.data.edges:
        left, right = edge.vertices
        neighbors[left].append(right)
        neighbors[right].append(left)
    for _ in range(6):
        relaxed: List[Dict[str, float]] = []
        for index, current in enumerate(authored_weights):
            adjacent = neighbors[index]
            if not adjacent:
                relaxed.append(dict(current))
                continue
            average: Dict[str, float] = {}
            for neighbor in adjacent:
                for name, weight in authored_weights[neighbor].items():
                    average[name] = average.get(name, 0) + weight / len(adjacent)
            blended = {
                name: current.get(name, 0) * .52 + average.get(name, 0) * .48
                for name in set(current) | set(average)
            }
            total = sum(blended.values()) or 1
            relaxed.append({name: weight / total for name, weight in blended.items() if weight > 1e-5})
        authored_weights = relaxed
    for index, weights in enumerate(authored_weights):
        strongest = sorted(weights.items(), key=lambda item: item[1], reverse=True)[:4]
        total = sum(weight for _, weight in strongest) or 1
        for name, weight in strongest:
            groups[name].add([index], weight / total, "REPLACE")
    modifier = body.modifiers.new("ZapSquirrelRig", "ARMATURE")
    modifier.object = rig
    body.parent = rig
    body.matrix_parent_inverse = rig.matrix_world.inverted()


def skin_rigid(obj: bpy.types.Object, rig: bpy.types.Object, bone_name: str) -> None:
    group = obj.vertex_groups.new(name=bone_name)
    group.add([vertex.index for vertex in obj.data.vertices], 1, "REPLACE")
    modifier = obj.modifiers.new("ZapSquirrelRig", "ARMATURE")
    modifier.object = rig
    obj.parent = rig
    obj.matrix_parent_inverse = rig.matrix_world.inverted()


def make_idle(rig: bpy.types.Object) -> bpy.types.Action:
    name = "SquirrelIdle"
    action = common.action_begin(rig, name)
    for frame, breath, look, tail in ((1, 0, 0, 0), (30, .012, -.18, .16), (60, 0, .14, -.11), (90, .01, .23, .18), (120, 0, 0, 0)):
        # Root bone points along world Z, so its local Y channel is vertical.
        common.key(rig, "Root", frame, location=(0, ROOT_CONTACT_Z, 0), group=name)
        common.key(rig, "Chest", frame, scale=(1 + breath * .2, 1 + breath * .2, 1 + breath), rotation=(0, 0, look * .04), group=name)
        common.key(rig, "Head", frame, rotation=(look * .07, 0, look * .48), group=name)
        common.key(rig, "TailBase", frame, rotation=(0, tail * .12, tail * .18), group=name)
        common.key(rig, "TailMid", frame, rotation=(tail * .08, tail * .18, -tail * .24), group=name)
        common.key(rig, "TailCrown", frame, rotation=(-tail * .06, tail * .12, tail * .27), group=name)
        common.key(rig, "TailTip", frame, rotation=(tail * .08, -tail * .15, tail * .31), group=name)
        # Every clip owns a complete limb pose. Leaving an unkeyed transform
        # lets Blender retain the preceding climb clip's crouch during review.
        for side in ("L", "R"):
            for prefix in ("Fore", "Hind"):
                common.key(rig, f"{prefix}Upper.{side}", frame, rotation=(0, 0, 0), group=name)
                common.key(rig, f"{prefix}Lower.{side}", frame, rotation=(0, 0, 0), group=name)
                common.key(rig, f"{prefix}Paw.{side}", frame, rotation=(0, 0, 0), group=name)
    return common.finish_action(action)


def make_scamper(rig: bpy.types.Object) -> bpy.types.Action:
    name = "SquirrelScamper"
    action = common.action_begin(rig, name)
    for frame, phase in ((1, 0), (7, math.pi / 2), (13, math.pi), (19, math.pi * 1.5), (25, math.tau)):
        bound = max(0, math.sin(phase))
        sway = math.sin(phase)
        common.key(rig, "Root", frame, location=(0, ROOT_CONTACT_Z + bound * .035, 0), rotation=(bound * math.radians(-4), 0, sway * math.radians(1.5)), group=name)
        common.key(rig, "Spine", frame, rotation=(sway * math.radians(3), 0, -sway * math.radians(2.6)), group=name)
        common.key(rig, "Head", frame, rotation=(-bound * math.radians(3), 0, -sway * math.radians(1.4)), group=name)
        common.key(rig, "TailBase", frame, rotation=(0, -bound * math.radians(5), -sway * math.radians(5)), group=name)
        common.key(rig, "TailMid", frame, rotation=(bound * math.radians(3), 0, sway * math.radians(7)), group=name)
        for side, sign in (("L", 1), ("R", -1)):
            fore = math.sin(phase + (0 if sign > 0 else math.pi))
            hind = -fore
            common.key(rig, f"ForeUpper.{side}", frame, rotation=(fore * math.radians(34), 0, 0), group=name)
            common.key(rig, f"ForeLower.{side}", frame, rotation=(-max(0, fore) * math.radians(24), 0, 0), group=name)
            common.key(rig, f"ForePaw.{side}", frame, rotation=(-fore * math.radians(8), 0, 0), group=name)
            common.key(rig, f"HindUpper.{side}", frame, rotation=(hind * math.radians(31), 0, 0), group=name)
            common.key(rig, f"HindLower.{side}", frame, rotation=(-max(0, hind) * math.radians(28), 0, 0), group=name)
            common.key(rig, f"HindPaw.{side}", frame, rotation=(-hind * math.radians(8), 0, 0), group=name)
    return common.finish_action(action)


def make_forage(rig: bpy.types.Object) -> bpy.types.Action:
    name = "SquirrelForage"
    action = common.action_begin(rig, name)
    for frame, crouch, nibble in ((1, 0, 0), (16, 1, .2), (34, 1, 1), (52, 1, -.7), (68, .4, .3), (81, 0, 0)):
        common.key(rig, "Root", frame, location=(0, ROOT_CONTACT_Z - crouch * .018, 0), group=name)
        common.key(rig, "Spine", frame, rotation=(crouch * math.radians(8), 0, 0), group=name)
        common.key(rig, "Chest", frame, rotation=(crouch * math.radians(15), 0, 0), group=name)
        common.key(rig, "Head", frame, rotation=(crouch * math.radians(14) + nibble * math.radians(2.2), 0, nibble * math.radians(2.5)), group=name)
        common.key(rig, "TailBase", frame, rotation=(0, -crouch * math.radians(7), 0), group=name)
        common.key(rig, "TailMid", frame, rotation=(0, crouch * math.radians(4), 0), group=name)
        common.key(rig, "TailCrown", frame, rotation=(0, -crouch * math.radians(3), 0), group=name)
        common.key(rig, "TailTip", frame, rotation=(0, 0, 0), group=name)
        for side in ("L", "R"):
            common.key(rig, f"ForeUpper.{side}", frame, rotation=(-crouch * math.radians(28), 0, 0), group=name)
            common.key(rig, f"ForeLower.{side}", frame, rotation=(crouch * math.radians(16), 0, 0), group=name)
            common.key(rig, f"ForePaw.{side}", frame, rotation=(0, 0, 0), group=name)
            common.key(rig, f"HindUpper.{side}", frame, rotation=(0, 0, 0), group=name)
            common.key(rig, f"HindLower.{side}", frame, rotation=(0, 0, 0), group=name)
            common.key(rig, f"HindPaw.{side}", frame, rotation=(0, 0, 0), group=name)
    return common.finish_action(action)


def make_climb(rig: bpy.types.Object) -> bpy.types.Action:
    name = "SquirrelClimb"
    action = common.action_begin(rig, name)
    for frame, phase in ((1, 0), (10, math.pi / 2), (19, math.pi), (28, math.pi * 1.5), (37, math.tau)):
        reach = math.sin(phase)
        common.key(rig, "Root", frame, location=(0, ROOT_CONTACT_Z + abs(math.sin(phase)) * .018, 0), rotation=(math.radians(-7), 0, 0), group=name)
        common.key(rig, "Spine", frame, rotation=(math.radians(-10), 0, -reach * math.radians(2)), group=name)
        common.key(rig, "Chest", frame, rotation=(math.radians(-13), 0, reach * math.radians(2)), group=name)
        common.key(rig, "Head", frame, rotation=(math.radians(10), 0, -reach * math.radians(2)), group=name)
        common.key(rig, "TailBase", frame, rotation=(math.radians(5), 0, -reach * math.radians(5)), group=name)
        common.key(rig, "TailMid", frame, rotation=(0, 0, reach * math.radians(3)), group=name)
        common.key(rig, "TailCrown", frame, rotation=(0, 0, -reach * math.radians(2)), group=name)
        common.key(rig, "TailTip", frame, rotation=(0, 0, 0), group=name)
        for side, sign in (("L", 1), ("R", -1)):
            limb = math.sin(phase + (0 if sign > 0 else math.pi))
            common.key(rig, f"ForeUpper.{side}", frame, rotation=(-math.radians(7) - limb * math.radians(11), 0, 0), group=name)
            common.key(rig, f"ForeLower.{side}", frame, rotation=(math.radians(4) + max(0, limb) * math.radians(6), 0, 0), group=name)
            common.key(rig, f"ForePaw.{side}", frame, rotation=(0, 0, 0), group=name)
            common.key(rig, f"HindUpper.{side}", frame, rotation=(math.radians(6) - limb * math.radians(10), 0, 0), group=name)
            common.key(rig, f"HindLower.{side}", frame, rotation=(-math.radians(8) - max(0, -limb) * math.radians(6), 0, 0), group=name)
            common.key(rig, f"HindPaw.{side}", frame, rotation=(0, 0, 0), group=name)
    return common.finish_action(action)


def duplicate_lod(meshes: Sequence[bpy.types.Object], rig: bpy.types.Object, ratio=.22):
    common.select_only([*meshes, rig])
    bpy.ops.object.duplicate()
    selected = list(bpy.context.selected_objects)
    lod_rig = next(obj for obj in selected if obj.type == "ARMATURE")
    lod_rig.name = "ZapSquirrelRig.LOD2"
    lod_meshes = [obj for obj in selected if obj.type == "MESH"]
    for obj in lod_meshes:
        obj.name = "ZapSquirrelSkinnedSurface.LOD2"
        obj.parent = lod_rig
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE":
                obj.modifiers.remove(modifier)
        decimate = obj.modifiers.new("Zap silhouette LOD2", "DECIMATE")
        decimate.ratio = ratio
        decimate.use_collapse_triangulate = True
        decimate.use_symmetry = True
        common.apply_modifier(obj, decimate.name)
        common.limit_influences(obj)
        armature = obj.modifiers.new("ZapSquirrelRig", "ARMATURE")
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
        ("QA.Key", (-2.5, -2.8, 2.8), 340, 2.5, (1, .79, .63)),
        ("QA.Fill", (2.8, -1.0, 2.2), 200, 2.4, (.55, .73, 1)),
        ("QA.Rim", (-2.2, 2.3, 2.5), 370, 2.1, (.46, .82, 1)),
    ):
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.name = name
        light.data.energy = energy
        light.data.size = size
        light.data.color = color
        common.aim(light, (0, -.05, .50))
        helpers.append(light)
    bpy.ops.object.camera_add(location=(2.45, -3.45, 1.48))
    camera = bpy.context.object
    camera.name = "QA.FixedCamera"
    camera.data.lens = 72
    common.aim(camera, (0, -.03, .48))
    scene.camera = camera
    helpers.append(camera)
    return camera, helpers


def render_previews(rig: bpy.types.Object, actions: Sequence[bpy.types.Action], meshes: Sequence[bpy.types.Object], directory: Path) -> Dict[str, str]:
    directory.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    camera, helpers = setup_review_scene()
    outputs: Dict[str, str] = {}
    frames = {"SquirrelIdle": 30, "SquirrelScamper": 7, "SquirrelForage": 34, "SquirrelClimb": 10}
    for action in actions:
        rig.animation_data.action = action
        scene.frame_set(frames[action.name])
        path = directory / f"{ASSET_ID}-{action.name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs[action.name] = common.retained_review_path(path)
    rig.animation_data.action = next(action for action in actions if action.name == "SquirrelIdle")
    scene.frame_set(30)
    camera.location = (1.02, -1.52, .98)
    camera.data.lens = 88
    common.aim(camera, (0, -.48, .61))
    face = directory / f"{ASSET_ID}-face-closeup.png"
    scene.render.filepath = str(face)
    bpy.ops.render.render(write_still=True)
    outputs["FaceCloseup"] = common.retained_review_path(face)
    camera.location = (1.35, -1.48, .48)
    camera.data.lens = 90
    common.aim(camera, (0, -.14, .12))
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
    camera.location = (2.45, -3.45, 1.48)
    camera.data.lens = 72
    common.aim(camera, (0, -.03, .48))
    three_quarter = directory / f"{ASSET_ID}-clay-three-quarter.png"
    scene.render.filepath = str(three_quarter)
    bpy.ops.render.render(write_still=True)
    outputs["ClayThreeQuarter"] = common.retained_review_path(three_quarter)
    camera.location = (3.25, .04, 1.28)
    camera.data.lens = 76
    common.aim(camera, (0, -.03, .48))
    profile = directory / f"{ASSET_ID}-clay-profile.png"
    scene.render.filepath = str(profile)
    bpy.ops.render.render(write_still=True)
    outputs["ClayProfile"] = common.retained_review_path(profile)
    camera.location = (1.02, -1.52, .98)
    camera.data.lens = 88
    common.aim(camera, (0, -.48, .61))
    clay_face = directory / f"{ASSET_ID}-clay-face-closeup.png"
    scene.render.filepath = str(clay_face)
    bpy.ops.render.render(write_still=True)
    outputs["ClayFaceCloseup"] = common.retained_review_path(clay_face)
    camera.location = (1.35, -1.48, .48)
    camera.data.lens = 90
    common.aim(camera, (0, -.14, .12))
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
    common.purge()
    bpy.ops.import_scene.gltf(filepath=str(glb))
    scene = bpy.context.scene
    rig = next(obj for obj in scene.objects if obj.type == "ARMATURE")
    actions = [bpy.data.actions.get(name) for name in CLIP_NAMES]
    actions = [action for action in actions if action]
    camera, helpers = setup_review_scene()
    directory.mkdir(parents=True, exist_ok=True)
    outputs: Dict[str, str] = {}
    frames = {"SquirrelIdle": 30, "SquirrelScamper": 7, "SquirrelForage": 34, "SquirrelClimb": 10}
    for action in actions:
        rig.animation_data_create()
        rig.animation_data.action = action
        scene.frame_set(frames[action.name])
        path = directory / f"{ASSET_ID}-fresh-import-{action.name}.png"
        scene.render.filepath = str(path)
        bpy.ops.render.render(write_still=True)
        outputs[f"FreshImport{action.name}"] = common.retained_review_path(path)
    camera.location = (1.35, -1.48, .48)
    camera.data.lens = 90
    common.aim(camera, (0, -.14, .12))
    rig.animation_data.action = bpy.data.actions.get("SquirrelIdle")
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
        "gray": fur_material("ZapGrayGuardHairPBR", runtime_maps["albedo"], runtime_maps),
        "eye": common.simple_material("ZapDeepBrownEye", (.025, .015, .009, 1), .12),
        "catchlight": common.simple_material("ZapEyeCatchlight", (.82, .85, .76, 1), .18),
        "nose": common.simple_material("ZapCharcoalNose", (.035, .026, .022, 1), .42),
        "whisker": common.simple_material("ZapVibrissae", (.70, .67, .60, 1), .74),
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
    body.name = "ZapSquirrelSkinnedSurface"
    body.data.name = body.name
    body["draw_call_consolidated"] = True
    meshes = [body]
    actions = [make_idle(rig), make_scamper(rig), make_forage(rig), make_climb(rig)]
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
        "https://www.nps.gov/bith/learn/nature/eastern-gray-squirrel.htm",
        "https://www.nps.gov/lowe/learn/nature/squirrel.htm",
    ]
    embedded_names = {
        "albedo": f"{ASSET_ID}-albedo",
        "normal": f"{ASSET_ID}-normal",
        "roughness": f"{ASSET_ID}-roughness",
    }
    manifest = {
        "schemaVersion": 1,
        "id": ASSET_ID,
        "displayName": "Zap",
        "species": "Sciurus carolinensis",
        "license": "Original-Project-Asset",
        "generator": "tools/animal-pipeline/build_eastern_gray_squirrel.py",
        "provenance": {
            "geometry": "Original repository-authored connected sciurid anatomical skin graph, deterministically remeshed to one watertight manifold integrating trunk, limbs, compact ears, and bushy counterbalance tail, plus consolidated face details; no third-party geometry.",
            "textures": "Original deterministic NumPy-generated gray guard-hair albedo, tangent normal, and roughness maps; no third-party pixels.",
            "rigging": "Original 22-bone squirrel skeleton, constrained skin influences, and four project-authored motion clips.",
            "referencePolicy": "Official National Park Service references informed anatomy, coat, climbing posture, and tail function only; no files or pixels were copied.",
            "visualReferences": visual_references,
        },
        "coordinateSystem": {"unit": "meter", "up": "+Y", "forward": "-Z", "origin": "paw contact plane"},
        "dimensionsMeters": {"width": round(dimensions.x, 3), "length": round(dimensions.y, 3), "height": round(dimensions.z, 3)},
        "skeleton": {"name": "ZapSquirrelRig", "bones": bone_names, "maxInfluences": 4},
        "clips": [{"name": name} for name in CLIP_NAMES],
        "materials": material_names,
        "maps": {
            key: {
                "kind": "albedo" if "albedo" in key.lower() else key,
                "sourceFile": str(path.relative_to(Path.cwd())),
                "embeddedImageName": embedded_names[key],
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
        "source": "tools/animal-pipeline/build_eastern_gray_squirrel.py",
        "generatedSourceBlend": f"tools/animal-pipeline/source/{ASSET_ID}-source.blend",
        "thirdPartyAssets": [],
        "visualReferences": visual_references,
        "referenceUse": "Anatomy, proportion, gray-brown coat breakup, climbing contact, and tail-balance study only; no geometry, pixels, rig, or animation copied.",
        "review": {
            "clayGate": "Retained fixed-camera three-quarter, profile, face, and paw-contact clay renders generated for visual sign-off.",
            "texturedGate": "Retained fixed-camera idle, scamper, forage, climb, face, and paw-contact renders generated for visual sign-off.",
            "liveShowroomGate": "Fresh Hero and Mobile showroom inspection remains required after generation.",
            "freshImportCount": 1 if args.preview else 0,
        },
    }, indent=2, sort_keys=True) + "\n")
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
