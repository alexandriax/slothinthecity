#!/usr/bin/env python3
"""Build the project's original authored Central Park mallard.

The mesh, textures, skeleton and motion are generated entirely by this file.
Wildlife references are used only to study mallard anatomy and movement; no
third-party geometry, pixels, rig, or animation data is imported or copied.

Run with Blender 3.4 or newer:

  /Applications/Blender.app/Contents/MacOS/Blender \
    --background --factory-startup \
    --python tools/animal-pipeline/build_mallard_duck.py -- \
    --output public/game/animals/authored \
    --source tools/animal-pipeline/source \
    --preview /private/tmp/sloth-mallard-previews --keep-blend
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import struct
import sys
import tempfile
from pathlib import Path
from typing import Dict, Iterable, List, Sequence, Tuple

import bpy
import bmesh
import numpy as np
from mathutils import Matrix, Vector


ASSET_ID = "mallard-duck"
CLIP_NAMES = ("DuckIdle", "DuckWaddle", "DuckSwim", "DuckShortFlight", "DuckLandingSettle")
TEXTURE_SIZE = 2048


def parse_args() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--source", type=Path, default=Path(__file__).resolve().parent / "source")
    parser.add_argument("--preview", type=Path)
    parser.add_argument("--keep-blend", action="store_true")
    parser.add_argument("--texture-size", type=int, default=TEXTURE_SIZE)
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
    if active:
        bpy.context.view_layer.objects.active = active


def purge() -> None:
    ensure_object_mode()
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (
        bpy.data.meshes, bpy.data.curves, bpy.data.armatures, bpy.data.materials,
        bpy.data.images, bpy.data.actions, bpy.data.textures,
    ):
        for item in list(datablocks):
            if item.users == 0:
                datablocks.remove(item)


def apply_modifier(obj: bpy.types.Object, name: str) -> None:
    select_only([obj])
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=name)


def smooth_mesh(obj: bpy.types.Object) -> bpy.types.Object:
    for polygon in obj.data.polygons:
        polygon.use_smooth = True
    return obj


def create_axial_body() -> bpy.types.Object:
    """One continuous keel-to-rump-to-skull mallard skin built from measured profiles."""
    # y, centre-z, half-width, dorsal radius, ventral radius
    sections = (
        (-.53, .405, .042, .035, .028),
        (-.47, .420, .105, .082, .068),
        (-.39, .438, .178, .135, .108),
        (-.28, .458, .226, .176, .142),
        (-.14, .470, .258, .202, .172),
        (.00, .480, .272, .208, .206),
        (.12, .500, .260, .195, .224),
        (.22, .535, .224, .165, .194),
        (.29, .575, .168, .138, .152),
        (.31, .605, .127, .121, .120),
        (.35, .646, .116, .122, .112),
        (.38, .676, .120, .122, .112),
        (.44, .696, .143, .134, .121),
        (.50, .684, .124, .112, .101),
        (.545, .661, .064, .061, .050),
    )
    radial = 56
    vertices: List[Tuple[float, float, float]] = []
    for section_index, (y, centre_z, radius_x, dorsal, ventral) in enumerate(sections):
        for index in range(radial):
            angle = math.tau * index / radial
            sine = math.sin(angle)
            radius_z = dorsal if sine >= 0 else ventral
            # A deep, forward keel and lifted rump create the characteristic
            # low waterfowl sternum instead of a spherical torso.
            keel = math.exp(-((y - .09) / .17) ** 2) * max(0.0, -sine) ** 3 * .032
            rump_taper = max(0.0, (-y - .28) / .25) * max(0.0, -sine) * .010
            x = math.cos(angle) * radius_x * (1 + .008 * math.sin(y * 17 + sine * 2.5))
            z = centre_z + sine * radius_z - keel + rump_taper
            vertices.append((x, y, z))
    faces: List[Tuple[int, ...]] = []
    for section in range(len(sections) - 1):
        for index in range(radial):
            nxt = (index + 1) % radial
            a = section * radial + index
            b = (section + 1) * radial + index
            faces.append((a, b, (section + 1) * radial + nxt, section * radial + nxt))
    rear = len(vertices); vertices.append((0, sections[0][0], sections[0][1]))
    front = len(vertices); vertices.append((0, sections[-1][0], sections[-1][1]))
    for index in range(radial):
        nxt = (index + 1) % radial
        faces.append((rear, nxt, index))
        last = (len(sections) - 1) * radial
        faces.append((front, last + index, last + nxt))
    mesh = bpy.data.meshes.new("MallardContinuousAnatomicalSkin")
    mesh.from_pydata(vertices, [], faces); mesh.update()
    body = bpy.data.objects.new("Body", mesh)
    bpy.context.collection.objects.link(body)
    subdivision = body.modifiers.new("Mallard anatomical surface", "SUBSURF")
    subdivision.levels = 2; subdivision.render_levels = 2
    body["continuous_anatomical_mesh"] = True
    body["source_geometry"] = "original-profile-loft"
    return body


def closed_shell(name: str, upper: Sequence[Sequence[float]], thickness: float) -> bpy.types.Object:
    """A closed, non-card shell used for feather fans, bill and webbed feet."""
    vertices = [(x, y, z + thickness * .5) for x, y, z in upper]
    vertices += [(x, y, z - thickness * .5) for x, y, z in upper]
    count = len(upper)
    faces: List[Tuple[int, ...]] = [tuple(range(count)), tuple(reversed(range(count, count * 2)))]
    for index in range(count):
        nxt = (index + 1) % count
        faces.append((index, nxt, count + nxt, count + index))
    mesh = bpy.data.meshes.new(f"{name}Mesh")
    mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    bevel = obj.modifiers.new(f"{name} edge roll", "BEVEL")
    bevel.width = min(thickness * .32, .009); bevel.segments = 3
    apply_modifier(obj, bevel.name)
    smooth_mesh(obj)
    return obj


def rounded_bill(name: str, sections: Sequence[Tuple[float, float, float, float]]) -> bpy.types.Object:
    """Smooth spatulate bill loft from (y, centre-z, half-width, half-height)."""
    radial = 48
    vertices: List[Tuple[float, float, float]] = []
    for y, centre_z, radius_x, radius_z in sections:
        for index in range(radial):
            angle = math.tau * index / radial
            sine = math.sin(angle)
            # Flatten the dorsal/ventral planes while retaining a rolled edge.
            z = centre_z + math.copysign(abs(sine) ** .64, sine) * radius_z
            vertices.append((math.cos(angle) * radius_x, y, z))
    faces: List[Tuple[int, ...]] = []
    for section in range(len(sections) - 1):
        for index in range(radial):
            nxt = (index + 1) % radial; a = section * radial + index; b = (section + 1) * radial + index
            faces.append((a, b, (section + 1) * radial + nxt, section * radial + nxt))
    faces.append(tuple(reversed(range(radial))))
    last = (len(sections) - 1) * radial; faces.append(tuple(last + index for index in reversed(range(radial))))
    mesh = bpy.data.meshes.new(f"{name}Mesh"); mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj)
    return smooth_mesh(obj)


def ellipsoid(name: str, location, scale, material, segments=28) -> bpy.types.Object:
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segments, ring_count=max(14, segments // 2), radius=1, location=location)
    obj = bpy.context.object; obj.name = name; obj.data.name = name
    obj.scale = scale
    select_only([obj]); bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(material)
    return smooth_mesh(obj)


def cylinder_between(name: str, start, end, radius: float, material) -> bpy.types.Object:
    a = Vector(start); b = Vector(end); delta = b - a
    bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=radius, depth=delta.length, location=(a + b) * .5)
    obj = bpy.context.object; obj.name = name; obj.data.name = name
    obj.rotation_mode = "QUATERNION"; obj.rotation_quaternion = delta.to_track_quat("Z", "Y")
    select_only([obj]); bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.rotation_mode = "XYZ"; obj.data.materials.append(material)
    bevel = obj.modifiers.new(f"{name} rounded transition", "BEVEL"); bevel.width = radius * .24; bevel.segments = 2
    apply_modifier(obj, bevel.name)
    return smooth_mesh(obj)


def tapered_path(name: str, points: Sequence[Sequence[float]], radii: Sequence[float], material, sides=20) -> bpy.types.Object:
    """A smoothly tapered curved limb/digit with closed ends."""
    centres = [Vector(point) for point in points]
    vertices: List[Tuple[float, float, float]] = []
    for index, (centre, radius) in enumerate(zip(centres, radii)):
        if index == 0: tangent = (centres[1] - centre).normalized()
        elif index == len(centres) - 1: tangent = (centre - centres[index - 1]).normalized()
        else: tangent = (centres[index + 1] - centres[index - 1]).normalized()
        reference = Vector((0, 0, 1)) if abs(tangent.z) < .92 else Vector((1, 0, 0))
        basis_a = tangent.cross(reference).normalized(); basis_b = tangent.cross(basis_a).normalized()
        for radial in range(sides):
            angle = math.tau * radial / sides
            position = centre + basis_a * math.cos(angle) * radius + basis_b * math.sin(angle) * radius
            vertices.append(tuple(position))
    faces: List[Tuple[int, ...]] = []
    for section in range(len(centres) - 1):
        for radial in range(sides):
            nxt = (radial + 1) % sides; a = section * sides + radial; b = (section + 1) * sides + radial
            faces.append((a, b, (section + 1) * sides + nxt, section * sides + nxt))
    faces.append(tuple(reversed(range(sides))))
    last = (len(centres) - 1) * sides; faces.append(tuple(last + radial for radial in range(sides)))
    mesh = bpy.data.meshes.new(f"{name}Mesh"); mesh.from_pydata(vertices, [], faces); mesh.update()
    obj = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(obj); obj.data.materials.append(material)
    return smooth_mesh(obj)


def folded_wing(name: str, sign: int, materials: Dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Convex scapular-to-primary loft authored folded against the flank."""
    sections = (
        (sign * .150, .205, .575, .024, .018),
        (sign * .205, .135, .558, .040, .052),
        (sign * .244, .055, .526, .055, .092),
        (sign * .260, -.055, .485, .061, .112),
        (sign * .252, -.165, .452, .055, .098),
        (sign * .224, -.275, .425, .045, .074),
        (sign * .177, -.385, .405, .032, .046),
        (sign * .105, -.485, .392, .012, .014),
    )
    radial = 24; vertices: List[Tuple[float, float, float]] = []
    for x, y, z, radius_x, radius_z in sections:
        for index in range(radial):
            angle = math.tau * index / radial
            vertices.append((x + math.cos(angle) * radius_x, y, z + math.sin(angle) * radius_z))
    faces: List[Tuple[int, ...]] = []
    for section in range(len(sections) - 1):
        for index in range(radial):
            nxt = (index + 1) % radial; a = section * radial + index; b = (section + 1) * radial + index
            faces.append((a, b, (section + 1) * radial + nxt, section * radial + nxt))
    faces.append(tuple(reversed(range(radial)))); last = (len(sections) - 1) * radial; faces.append(tuple(last + index for index in range(radial)))
    mesh = bpy.data.meshes.new(f"{name}Mesh"); mesh.from_pydata(vertices, [], faces); mesh.update()
    wing = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(wing)
    wing.data.materials.append(materials["wing"]); wing.data.materials.append(materials["speculum"])
    for polygon in wing.data.polygons:
        center = sum((wing.data.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        polygon.material_index = 1 if -.285 < center.y < -.145 and center.z > .435 and sign * center.x > .238 else 0
    return smooth_mesh(wing)


def organic_webbed_foot(name: str, centre: float, sign: int, material) -> bpy.types.Object:
    """A continuous domed plantar membrane with three softly lobed toe spans."""
    columns = 17; rows = 12
    vertices: List[Tuple[float, float, float]] = []
    for layer in (0, 1):
        for row in range(rows):
            v = row / (rows - 1)
            half_width = .038 + .067 * (v ** .82)
            for column in range(columns):
                u = column / (columns - 1) * 2 - 1
                toe_length = .225 + .095 * math.exp(-((u / .19) ** 2)) + .052 * math.exp(-(((u - .88) / .18) ** 2)) + .052 * math.exp(-(((u + .88) / .18) ** 2))
                y = .045 + v * (toe_length - .045)
                dome = math.sin(math.pi * v) * (1 - u * u) * .007
                digit_relief = v * (.0055 * math.exp(-((u / .16) ** 2)) + .004 * math.exp(-(((u - .88) / .18) ** 2)) + .004 * math.exp(-(((u + .88) / .18) ** 2)))
                z = .061 - .040 * v + dome + digit_relief - layer * .014
                vertices.append((centre + sign * u * half_width, y, z))
    faces: List[Tuple[int, ...]] = []; layer_size = columns * rows
    for row in range(rows - 1):
        for column in range(columns - 1):
            a = row * columns + column; b = a + 1; c = a + columns + 1; d = a + columns
            faces.append((a, b, c, d)); faces.append((layer_size + d, layer_size + c, layer_size + b, layer_size + a))
    perimeter = [*range(columns), *[row * columns + columns - 1 for row in range(1, rows)], *range((rows - 1) * columns + columns - 2, (rows - 1) * columns - 1, -1), *[row * columns for row in range(rows - 2, 0, -1)]]
    for index, top_index in enumerate(perimeter):
        next_index = perimeter[(index + 1) % len(perimeter)]
        faces.append((top_index, layer_size + top_index, layer_size + next_index, next_index))
    mesh = bpy.data.meshes.new(f"{name}Mesh"); mesh.from_pydata(vertices, [], faces); mesh.update()
    foot = bpy.data.objects.new(name, mesh); bpy.context.collection.objects.link(foot); foot.data.materials.append(material)
    bevel = foot.modifiers.new(f"{name} organic edge", "BEVEL"); bevel.width = .0045; bevel.segments = 3; apply_modifier(foot, bevel.name)
    return smooth_mesh(foot)


def coherent_tail(material) -> bpy.types.Object:
    sections = ((-.370, .472, .162, .042), (-.470, .455, .202, .042), (-.580, .432, .184, .033), (-.680, .407, .142, .022), (-.770, .386, .084, .012))
    radial = 32; vertices: List[Tuple[float, float, float]] = []
    for y, z, radius_x, radius_z in sections:
        for index in range(radial):
            angle = math.tau * index / radial; vertices.append((math.cos(angle) * radius_x, y, z + math.sin(angle) * radius_z))
    faces: List[Tuple[int, ...]] = []
    for section in range(len(sections) - 1):
        for index in range(radial):
            nxt = (index + 1) % radial; a = section * radial + index; b = (section + 1) * radial + index
            faces.append((a, b, (section + 1) * radial + nxt, section * radial + nxt))
    faces.append(tuple(reversed(range(radial)))); last = (len(sections) - 1) * radial; faces.append(tuple(last + index for index in range(radial)))
    mesh = bpy.data.meshes.new("TailCovertFanMesh"); mesh.from_pydata(vertices, [], faces); mesh.update()
    tail = bpy.data.objects.new("TailCovertFan", mesh); bpy.context.collection.objects.link(tail); tail.data.materials.append(material)
    return smooth_mesh(tail)


def create_appendages(materials: Dict[str, bpy.types.Material]) -> Dict[str, bpy.types.Object]:
    pieces: Dict[str, bpy.types.Object] = {}
    for side, sign in (("L", 1), ("R", -1)):
        wing = folded_wing(f"Wing.{side}", sign, materials); pieces[f"wing_{side}"] = wing
        centre = sign * .105
        tarsus = tapered_path(f"Tarsus.{side}", ((centre, -.018, .292), (centre + sign * .005, -.040, .188), (centre, .020, .092), (centre, .047, .060)), (.025, .019, .016, .026), materials["foot"], 24)
        pieces[f"tarsus_{side}"] = tarsus
        foot = organic_webbed_foot(f"WebbedFoot.{side}", centre, sign, materials["foot"]); pieces[f"foot_{side}"] = foot

    tail = coherent_tail(materials["tail"]); pieces["tail"] = tail
    bill = rounded_bill("MallardBill", ((.510, .665, .064, .026), (.555, .665, .084, .031), (.615, .660, .095, .030), (.670, .655, .082, .024), (.712, .650, .052, .016), (.738, .649, .018, .008)))
    bill.data.materials.append(materials["bill"]); bill.data.materials.append(materials["bill_dark"])
    for polygon in bill.data.polygons:
        center = sum((bill.data.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        polygon.material_index = 1 if .695 < center.y < .731 and center.z > .653 else 0
    pieces["bill"] = bill
    return pieces


def smart_uv(obj: bpy.types.Object) -> None:
    select_only([obj]); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(56), island_margin=.012)
    bpy.ops.object.mode_set(mode="OBJECT")


def save_image(path: Path, pixels: np.ndarray) -> None:
    image = bpy.data.images.new(path.stem, width=pixels.shape[1], height=pixels.shape[0], alpha=True, float_buffer=False)
    image.pixels.foreach_set(np.flipud(pixels).reshape(-1))
    image.filepath_raw = str(path); image.file_format = "PNG"; image.save()
    bpy.data.images.remove(image)


def write_source_maps(source: Path, size: int) -> Dict[str, Path]:
    source.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(4201938)
    noise = rng.normal(0, 1, (size, size)).astype(np.float32)
    for _ in range(4):
        noise = (noise * 2 + np.roll(noise, 1, 0) + np.roll(noise, -1, 0) + np.roll(noise, 1, 1) + np.roll(noise, -1, 1)) / 6
    noise /= max(float(noise.std()), 1e-6)
    u = np.linspace(0, 1, size, endpoint=False, dtype=np.float32)
    v = np.linspace(0, 1, size, endpoint=False, dtype=np.float32)
    xx, yy = np.meshgrid(u, v)
    barb = np.sin((xx * .32 + yy) * math.tau * 118 + noise * .26)
    rachis = np.cos((xx * 23 - yy * 3) * math.tau) ** 24
    height = np.clip(noise * .28 + barb * .58 + rachis * .14, -1, 1)
    base = np.array((.74, .68, .58), dtype=np.float32)
    variation = np.clip(1 + noise[..., None] * .018 + barb[..., None] * .012, .90, 1.10)
    albedo = np.zeros((size, size, 4), dtype=np.float32)
    albedo[..., :3] = np.clip(base * variation, 0, 1); albedo[..., 3] = 1
    gy, gx = np.gradient(height)
    nx, ny, nz = -gx * 1.35, -gy * 1.35, np.ones_like(gx)
    length = np.sqrt(nx * nx + ny * ny + nz * nz)
    normal = np.stack((nx / length * .5 + .5, ny / length * .5 + .5, nz / length * .5 + .5, np.ones_like(gx)), axis=-1)
    rough_value = np.clip(.76 + noise * .016 - barb * .018, .68, .84)
    roughness = np.stack((rough_value, rough_value, rough_value, np.ones_like(rough_value)), axis=-1)
    paths = {kind: source / f"{ASSET_ID}-{kind}.png" for kind in ("albedo", "normal", "roughness")}
    for kind, pixels in (("albedo", albedo), ("normal", normal), ("roughness", roughness)):
        save_image(paths[kind], pixels)
    return paths


def make_runtime_maps(source_paths: Dict[str, Path]) -> Dict[str, Path]:
    directory = Path(tempfile.gettempdir()) / "sloth-mallard-runtime-textures"
    directory.mkdir(parents=True, exist_ok=True)
    result: Dict[str, Path] = {}
    for kind, source in source_paths.items():
        image = bpy.data.images.load(str(source), check_existing=False); _ = image.pixels[0]
        image.scale(1024, 1024)
        target = directory / f"{ASSET_ID}-{kind}.{'jpg' if kind == 'albedo' else 'png'}"
        image.filepath_raw = str(target); image.file_format = "JPEG" if kind == "albedo" else "PNG"; image.save()
        result[kind] = target; bpy.data.images.remove(image)
    return result


def principled(material: bpy.types.Material):
    return material.node_tree.nodes.get("Principled BSDF")


def tinted_runtime_albedo(source: Path, name: str, tint) -> Path:
    """Bake a glTF-native feather tint instead of relying on unsupported MixRGB export."""
    target = source.parent / f"{ASSET_ID}-{name.lower().replace(' ', '-')}-albedo.jpg"
    image = bpy.data.images.load(str(source), check_existing=False); _ = image.pixels[0]
    pixels = np.empty(len(image.pixels), dtype=np.float32); image.pixels.foreach_get(pixels)
    rgba = pixels.reshape((-1, 4))
    source_base = np.array((.74, .68, .58), dtype=np.float32)
    variation = np.mean(rgba[:, :3] / source_base, axis=1, keepdims=True)
    rgba[:, :3] = np.clip(variation * np.asarray(tint, dtype=np.float32), 0, 1)
    image.pixels.foreach_set(rgba.reshape(-1)); image.filepath_raw = str(target); image.file_format = "JPEG"; image.save()
    bpy.data.images.remove(image)
    return target


def simple_material(name: str, color, roughness: float, metallic=0.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name); material.use_nodes = True
    node = principled(material); node.inputs["Base Color"].default_value = tuple(color)
    node.inputs["Roughness"].default_value = roughness; node.inputs["Metallic"].default_value = metallic
    if "Specular" in node.inputs: node.inputs["Specular"].default_value = .38
    return material


def feather_material(name: str, tint, paths: Dict[str, Path], iridescence=0.0) -> bpy.types.Material:
    material = bpy.data.materials.new(name); material.use_nodes = True
    material["mallard_tint"] = list(tint)
    nodes = material.node_tree.nodes; links = material.node_tree.links; node = principled(material)
    node.inputs["Base Color"].default_value = (*tint, 1); node.inputs["Roughness"].default_value = .76
    albedo_path = tinted_runtime_albedo(paths["albedo"], name, tint)
    albedo = nodes.new("ShaderNodeTexImage"); albedo.name = f"{name}.Albedo"; albedo.image = bpy.data.images.load(str(albedo_path), check_existing=True)
    links.new(albedo.outputs["Color"], node.inputs["Base Color"])
    rough = nodes.new("ShaderNodeTexImage"); rough.name = f"{name}.Roughness"; rough.image = bpy.data.images.load(str(paths["roughness"]), check_existing=True); rough.image.colorspace_settings.name = "Non-Color"
    links.new(rough.outputs["Color"], node.inputs["Roughness"])
    normal = nodes.new("ShaderNodeTexImage"); normal.name = f"{name}.Normal"; normal.image = bpy.data.images.load(str(paths["normal"]), check_existing=True); normal.image.colorspace_settings.name = "Non-Color"
    normal_map = nodes.new("ShaderNodeNormalMap"); normal_map.inputs["Strength"].default_value = .32
    links.new(normal.outputs["Color"], normal_map.inputs["Color"]); links.new(normal_map.outputs["Normal"], node.inputs["Normal"])
    if iridescence and "Metallic" in node.inputs:
        node.inputs["Metallic"].default_value = iridescence; node.inputs["Roughness"].default_value = .46
    return material


def relink_feather_materials(materials: Iterable[bpy.types.Material], source_paths: Dict[str, Path]) -> None:
    for material in materials:
        if not material.use_nodes: continue
        for node in material.node_tree.nodes:
            if node.type != "TEX_IMAGE": continue
            kind = "normal" if node.name.endswith(".Normal") else "roughness" if node.name.endswith(".Roughness") else "albedo"
            source_path = source_paths[kind]
            if kind == "albedo" and material.get("mallard_tint"):
                source_path = tinted_runtime_albedo(source_path, material.name, material["mallard_tint"])
            old = node.image; node.image = bpy.data.images.load(str(source_path), check_existing=True)
            if kind != "albedo": node.image.colorspace_settings.name = "Non-Color"
            if old and old.users == 0: bpy.data.images.remove(old)


def assign_body_materials(body: bpy.types.Object, materials: Dict[str, bpy.types.Material]) -> None:
    ordered = [materials[name] for name in ("body", "chest", "collar", "head")]
    for material in ordered: body.data.materials.append(material)
    paint_body_material_regions(body)


def paint_body_material_regions(body: bpy.types.Object) -> None:
    """Assign anatomical plumage on coarse profile rings before subdivision."""
    for polygon in body.data.polygons:
        center = sum((body.data.vertices[i].co for i in polygon.vertices), Vector()) / len(polygon.vertices)
        if center.y > .345: polygon.material_index = 3
        elif center.y > .310: polygon.material_index = 2
        elif .02 < center.y < .31 and center.z < .575: polygon.material_index = 1
        else: polygon.material_index = 0


def make_rig() -> bpy.types.Object:
    data = bpy.data.armatures.new("MallardDuckRig")
    rig = bpy.data.objects.new("MallardDuckRig", data); bpy.context.collection.objects.link(rig)
    select_only([rig]); bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode="EDIT")
    def bone(name, head, tail, parent=None, connected=False):
        item = data.edit_bones.new(name); item.head = head; item.tail = tail
        if parent: item.parent = data.edit_bones[parent]; item.use_connect = connected
        return item
    bone("Root", (0, 0, .03), (0, 0, .22))
    bone("Body", (0, -.26, .44), (0, .18, .50), "Root")
    bone("Neck", (0, .18, .50), (0, .35, .646), "Body", True)
    bone("Head", (0, .35, .646), (0, .545, .663), "Neck", True)
    bone("Bill", (0, .51, .665), (0, .75, .649), "Head")
    bone("Tail", (0, -.30, .45), (0, -.78, .38), "Body")
    for side, sign in (("L", 1), ("R", -1)):
        bone(f"Wing.{side}", (sign * .16, .17, .57), (sign * .23, -.10, .47), "Body")
        bone(f"WingTip.{side}", (sign * .23, -.10, .47), (sign * .13, -.47, .39), f"Wing.{side}", True)
        bone(f"Leg.{side}", (sign * .105, -.006, .30), (sign * .105, .036, .078), "Body")
        bone(f"Foot.{side}", (sign * .105, .036, .078), (sign * .105, .30, .03), f"Leg.{side}", True)
    bpy.ops.object.mode_set(mode="OBJECT")
    rig.show_in_front = True; rig["asset_id"] = ASSET_ID; rig["skeleton_contract"] = "mallard-v2-anatomical"
    return rig


def skin_object(obj: bpy.types.Object, rig: bpy.types.Object, rigid_bone: str | None = None) -> None:
    for group in list(obj.vertex_groups): obj.vertex_groups.remove(group)
    groups = {bone.name: obj.vertex_groups.new(name=bone.name) for bone in rig.data.bones}
    if rigid_bone:
        groups[rigid_bone].add([v.index for v in obj.data.vertices], 1, "REPLACE")
    else:
        axis = (("Tail", -.48), ("Body", .12), ("Neck", .31), ("Head", .48))
        for vertex in obj.data.vertices:
            y = vertex.co.y
            if y <= axis[0][1]: groups[axis[0][0]].add([vertex.index], 1, "REPLACE"); continue
            if y >= axis[-1][1]: groups[axis[-1][0]].add([vertex.index], 1, "REPLACE"); continue
            for (left_name, left_y), (right_name, right_y) in zip(axis, axis[1:]):
                if left_y <= y <= right_y:
                    amount = (y - left_y) / (right_y - left_y); amount = amount * amount * (3 - 2 * amount)
                    groups[left_name].add([vertex.index], 1 - amount, "REPLACE")
                    groups[right_name].add([vertex.index], amount, "REPLACE"); break
    modifier = obj.modifiers.new("MallardDuckRig", "ARMATURE"); modifier.object = rig
    obj.parent = rig; obj.matrix_parent_inverse = rig.matrix_world.inverted()


def skin_folded_wing(obj: bpy.types.Object, rig: bpy.types.Object, side: str) -> None:
    """Blend one continuous wing loft across shoulder and primary fan bones."""
    for group in list(obj.vertex_groups): obj.vertex_groups.remove(group)
    groups = {bone.name: obj.vertex_groups.new(name=bone.name) for bone in rig.data.bones}
    shoulder = groups[f"Wing.{side}"]; tip = groups[f"WingTip.{side}"]
    for vertex in obj.data.vertices:
        amount = max(0.0, min(1.0, (-vertex.co.y - .045) / .255))
        amount = amount * amount * (3 - 2 * amount)
        shoulder.add([vertex.index], 1 - amount, "REPLACE"); tip.add([vertex.index], amount, "REPLACE")
    modifier = obj.modifiers.new("MallardDuckRig", "ARMATURE"); modifier.object = rig
    obj.parent = rig; obj.matrix_parent_inverse = rig.matrix_world.inverted()


def reset_pose(rig: bpy.types.Object) -> None:
    for bone in rig.pose.bones:
        bone.rotation_mode = "XYZ"; bone.location = (0, 0, 0); bone.rotation_euler = (0, 0, 0); bone.scale = (1, 1, 1)


def action_begin(rig: bpy.types.Object, name: str) -> bpy.types.Action:
    reset_pose(rig); action = bpy.data.actions.new(name); action.use_fake_user = True
    rig.animation_data_create(); rig.animation_data.action = action; return action


def key(rig, bone_name, frame, rotation=None, location=None, scale=None, group=""):
    bone = rig.pose.bones[bone_name]; bone.rotation_mode = "XYZ"
    if rotation is not None: bone.rotation_euler = rotation; bone.keyframe_insert("rotation_euler", frame=frame, group=group)
    if location is not None: bone.location = location; bone.keyframe_insert("location", frame=frame, group=group)
    if scale is not None: bone.scale = scale; bone.keyframe_insert("scale", frame=frame, group=group)


def key_armature_delta(rig, bone_name: str, frame: int, rotation: Matrix, group="") -> None:
    """Convert an armature-space delta to local Euler channels so every clip survives pose resets."""
    bone = rig.pose.bones[bone_name]; rest_basis = bone.bone.matrix_local.to_3x3()
    local_rotation = rest_basis.inverted() @ rotation.to_3x3() @ rest_basis
    key(rig, bone_name, frame, rotation=local_rotation.to_euler("XYZ"), group=group)


def finish_action(action: bpy.types.Action) -> bpy.types.Action:
    for fcurve in action.fcurves:
        for point in fcurve.keyframe_points: point.interpolation = "BEZIER"
    return action


def make_idle(rig) -> bpy.types.Action:
    name = "DuckIdle"; action = action_begin(rig, name)
    for frame, breath, look in ((1, 0, 0), (30, .012, -.12), (60, 0, .08), (90, .010, .15), (120, 0, 0)):
        key(rig, "Root", frame, location=(0, 0, 0), group=name)
        key(rig, "Body", frame, scale=(1 + breath * .3, 1 + breath * .25, 1 + breath), rotation=(0, 0, look * .06), group=name)
        key(rig, "Neck", frame, rotation=(look * .14, 0, look * .34), group=name)
        key(rig, "Head", frame, rotation=(-look * .08, 0, look * .72), group=name)
        for side, sign in (("L", 1), ("R", -1)):
            key(rig, f"Wing.{side}", frame, rotation=(breath * .4, 0, sign * breath * .6), group=name)
            key(rig, f"WingTip.{side}", frame, rotation=(-breath * .25, 0, 0), group=name)
    return finish_action(action)


def make_waddle(rig) -> bpy.types.Action:
    name = "DuckWaddle"; action = action_begin(rig, name)
    for frame, phase in ((1, 0), (10, math.pi / 2), (19, math.pi), (28, math.pi * 1.5), (37, math.tau)):
        sway = math.sin(phase); lift = abs(math.sin(phase))
        key(rig, "Root", frame, location=(0, 0, lift * .016), rotation=(0, 0, sway * math.radians(5.5)), group=name)
        key(rig, "Body", frame, rotation=(sway * math.radians(1.6), 0, -sway * math.radians(3)), group=name)
        key(rig, "Neck", frame, rotation=(-sway * math.radians(2), 0, sway * math.radians(2)), group=name)
        key(rig, "Head", frame, rotation=(sway * math.radians(2.3), 0, -sway * math.radians(1.5)), group=name)
        for side, sign in (("L", 1), ("R", -1)):
            stroke = math.sin(phase + (0 if sign > 0 else math.pi))
            key(rig, f"Leg.{side}", frame, rotation=(stroke * math.radians(18), 0, 0), group=name)
            key(rig, f"Foot.{side}", frame, rotation=(-max(0, stroke) * math.radians(17), 0, 0), group=name)
            key(rig, f"Wing.{side}", frame, rotation=(0, 0, sign * sway * math.radians(1.5)), group=name)
            key(rig, f"WingTip.{side}", frame, rotation=(0, 0, -sign * sway * math.radians(.8)), group=name)
    return finish_action(action)


def make_swim(rig) -> bpy.types.Action:
    name = "DuckSwim"; action = action_begin(rig, name)
    for frame, phase in ((1, 0), (12, math.pi / 2), (23, math.pi), (34, math.pi * 1.5), (45, math.tau)):
        stroke = math.sin(phase); bob = math.sin(phase * 2)
        key(rig, "Root", frame, location=(0, 0, bob * .008), rotation=(0, 0, stroke * math.radians(1.8)), group=name)
        key(rig, "Neck", frame, rotation=(-stroke * math.radians(1.6), 0, -stroke * math.radians(2.5)), group=name)
        key(rig, "Head", frame, rotation=(stroke * math.radians(1.2), 0, stroke * math.radians(2)), group=name)
        for side, sign in (("L", 1), ("R", -1)):
            paddle = math.sin(phase + (0 if sign > 0 else math.pi))
            key(rig, f"Leg.{side}", frame, rotation=(paddle * math.radians(24), 0, sign * math.radians(4)), group=name)
            key(rig, f"Foot.{side}", frame, rotation=(-paddle * math.radians(18), 0, 0), group=name)
            key(rig, f"Wing.{side}", frame, rotation=(0, 0, sign * bob * math.radians(1.2)), group=name)
            key(rig, f"WingTip.{side}", frame, rotation=(0, 0, -sign * bob * math.radians(.6)), group=name)
    return finish_action(action)


def make_short_flight(rig) -> bpy.types.Action:
    name = "DuckShortFlight"; action = action_begin(rig, name)
    for frame, phase in ((1, 0), (7, math.pi / 2), (13, math.pi), (19, math.pi * 1.5), (25, math.tau)):
        flap = math.sin(phase); key(rig, "Root", frame, location=(0, 0, math.sin(phase * 2) * .018), rotation=(math.radians(-8), 0, -flap * math.radians(1.5)), group=name)
        key(rig, "Neck", frame, rotation=(math.radians(7), 0, 0), group=name); key(rig, "Head", frame, rotation=(math.radians(-4), 0, 0), group=name)
        for side, sign in (("L", 1), ("R", -1)):
            unfold = Matrix.Rotation(sign * math.radians(78), 4, "Z")
            flap_rotation = Matrix.Rotation(-sign * flap * math.radians(34), 4, "Y")
            key_armature_delta(rig, f"Wing.{side}", frame, flap_rotation @ unfold, group=name)
            key(rig, f"Leg.{side}", frame, rotation=(math.radians(32), 0, 0), group=name)
    return finish_action(action)


def make_landing(rig) -> bpy.types.Action:
    name = "DuckLandingSettle"; action = action_begin(rig, name)
    for frame, amount in ((1, 1), (18, .72), (36, .28), (54, 0), (78, 0)):
        key(rig, "Root", frame, location=(0, -amount * .06, amount * .22), rotation=(-amount * math.radians(12), 0, 0), group=name)
        key(rig, "Body", frame, rotation=(amount * math.radians(8), 0, 0), group=name)
        key(rig, "Neck", frame, rotation=(-amount * math.radians(12), 0, 0), group=name)
        for side, sign in (("L", 1), ("R", -1)):
            unfold = Matrix.Rotation(sign * amount * math.radians(74), 4, "Z")
            flare = Matrix.Rotation(-sign * amount * math.radians(18), 4, "Y")
            key_armature_delta(rig, f"Wing.{side}", frame, flare @ unfold, group=name)
            key(rig, f"Leg.{side}", frame, rotation=(-amount * math.radians(12), 0, 0), group=name)
    return finish_action(action)


def install_tracks(rig, actions: Sequence[bpy.types.Action]) -> None:
    rig.animation_data_create(); rig.animation_data.action = None
    for track in list(rig.animation_data.nla_tracks): rig.animation_data.nla_tracks.remove(track)
    for action in actions:
        track = rig.animation_data.nla_tracks.new(); track.name = action.name
        strip = track.strips.new(action.name, int(action.frame_range[0]), action)
        strip.action_frame_start = action.frame_range[0]; strip.action_frame_end = action.frame_range[1]
    reset_pose(rig)


def triangulate(meshes: Sequence[bpy.types.Object]) -> None:
    for obj in meshes:
        mesh = bmesh.new(); mesh.from_mesh(obj.data); bmesh.ops.triangulate(mesh, faces=list(mesh.faces)); mesh.to_mesh(obj.data); mesh.free(); obj.data.update()
        if obj.name.startswith("Body") and len(obj.data.materials) >= 4:
            paint_body_material_regions(obj)


def limit_influences(obj: bpy.types.Object, maximum=4) -> None:
    for vertex in obj.data.vertices:
        assignments = sorted(((g.group, g.weight) for g in vertex.groups if g.weight > 1e-8), key=lambda item: item[1], reverse=True)
        for index, _ in assignments[maximum:]: obj.vertex_groups[index].remove([vertex.index])
        kept = assignments[:maximum]; total = sum(weight for _, weight in kept)
        if total:
            for index, weight in kept: obj.vertex_groups[index].add([vertex.index], weight / total, "REPLACE")


def duplicate_lod(meshes, rig, ratio=.38):
    select_only([*meshes, rig]); bpy.ops.object.duplicate(); selected = list(bpy.context.selected_objects)
    lod_rig = next(obj for obj in selected if obj.type == "ARMATURE"); lod_rig.name = "MallardDuckRig.LOD2"
    lod_meshes = [obj for obj in selected if obj.type == "MESH"]
    for obj in lod_meshes:
        obj.name = f"{obj.name}.LOD2"; obj.parent = lod_rig
        for modifier in list(obj.modifiers):
            if modifier.type == "ARMATURE": obj.modifiers.remove(modifier)
        if len(obj.data.polygons) > 500:
            decimate = obj.modifiers.new("Mallard silhouette-aware LOD2", "DECIMATE"); decimate.ratio = ratio; decimate.use_collapse_triangulate = True; decimate.use_symmetry = True
            apply_modifier(obj, decimate.name); limit_influences(obj)
        armature = obj.modifiers.new("MallardDuckRig", "ARMATURE"); armature.object = lod_rig
    return lod_meshes, lod_rig


def gltf_export(path: Path, objects: Sequence[bpy.types.Object]) -> None:
    select_only(objects)
    kwargs = dict(filepath=str(path), export_format="GLB", use_selection=True, export_yup=True, export_apply=False,
        export_texcoords=True, export_normals=True, export_tangents=True, export_materials="EXPORT", export_colors=False,
        export_cameras=False, export_lights=False, export_skins=True, export_def_bones=True, export_animations=True,
        export_frame_range=True, export_force_sampling=False, export_nla_strips=True, export_optimize_animation_size=True,
        export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6,
        export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_texcoord_quantization=12,
        export_draco_generic_quantization=12, export_extras=True)
    try: bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        for optional in ("export_force_sampling", "export_optimize_animation_size", "export_nla_strips"): kwargs.pop(optional, None)
        bpy.ops.export_scene.gltf(**kwargs)


def aim(obj, target) -> None:
    obj.rotation_euler = (Vector(target) - obj.location).to_track_quat("-Z", "Y").to_euler()


def retained_review_path(path: Path) -> str:
    try:
        return str(path.relative_to(Path.cwd()))
    except ValueError:
        return str(path)


def render_previews(rig, actions: Sequence[bpy.types.Action], meshes: Sequence[bpy.types.Object], directory: Path) -> Dict[str, str]:
    directory.mkdir(parents=True, exist_ok=True); scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"; scene.eevee.taa_render_samples = 64; scene.eevee.use_gtao = True; scene.eevee.gtao_distance = 2; scene.eevee.gtao_factor = 1.25
    scene.render.resolution_x = 1200; scene.render.resolution_y = 900; scene.render.resolution_percentage = 100; scene.render.image_settings.file_format = "PNG"
    scene.world.use_nodes = True; scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (.010, .018, .022, 1); scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = .28
    scene.view_settings.look = "Medium High Contrast"; scene.view_settings.exposure = -.05
    helpers = []
    bpy.ops.mesh.primitive_plane_add(size=8, location=(0, 0, .005)); ground = bpy.context.object; ground.name = "QA.GroundContactPlane"; ground.data.materials.append(simple_material("QA dark stone", (.025, .034, .035, 1), .76)); helpers.append(ground)
    for name, location, energy, size, color in (("QA.Key", (-2.8, 3.3, 3.2), 320, 2.6, (1, .78, .62)), ("QA.Fill", (3.0, 1.0, 2.4), 190, 2.4, (.52, .72, 1)), ("QA.Rim", (-2.2, -2.6, 2.6), 350, 2.2, (.44, .82, 1))):
        bpy.ops.object.light_add(type="AREA", location=location); light = bpy.context.object; light.name = name; light.data.energy = energy; light.data.size = size; light.data.color = color; aim(light, (0, .08, .42)); helpers.append(light)
    bpy.ops.object.camera_add(location=(1.75, 2.65, 1.35)); camera = bpy.context.object; camera.name = "QA.FixedCamera"; camera.data.lens = 65; aim(camera, (0, .02, .44)); scene.camera = camera; helpers.append(camera)
    frames = {"DuckIdle": 30, "DuckWaddle": 10, "DuckSwim": 12, "DuckShortFlight": 1, "DuckLandingSettle": 36}
    outputs: Dict[str, str] = {}; rig.animation_data_create()
    for action in actions:
        if action.name == "DuckShortFlight":
            camera.location = (0, 2.85, 1.35); camera.data.lens = 65; aim(camera, (0, .02, .44))
        else:
            camera.location = (1.75, 2.65, 1.35); camera.data.lens = 65; aim(camera, (0, .02, .44))
        rig.animation_data.action = action; scene.frame_set(frames[action.name]); path = directory / f"{ASSET_ID}-{action.name}.png"; scene.render.filepath = str(path); bpy.ops.render.render(write_still=True); outputs[action.name] = retained_review_path(path)
    rig.animation_data.action = next(a for a in actions if a.name == "DuckIdle"); scene.frame_set(30)
    camera.location = (1.05, 1.78, 1.02); camera.data.lens = 78; aim(camera, (0, .58, .68)); face = directory / f"{ASSET_ID}-face-closeup.png"; scene.render.filepath = str(face); bpy.ops.render.render(write_still=True); outputs["FaceCloseup"] = retained_review_path(face)
    camera.location = (1.05, .65, .52); camera.data.lens = 78; aim(camera, (.08, .10, .09)); foot = directory / f"{ASSET_ID}-webbed-foot-contact.png"; scene.render.filepath = str(foot); bpy.ops.render.render(write_still=True); outputs["FootContact"] = retained_review_path(foot)
    water = bpy.data.objects.new("QA.Waterline", bpy.data.meshes.new("QA.WaterlineMesh")); bpy.context.collection.objects.link(water)
    water_mesh = closed_shell("QA.WaterSurface", ((-1.2, -1.3, .34), (1.2, -1.3, .34), (1.2, 1.3, .34), (-1.2, 1.3, .34)), .006); water_mesh.data.materials.append(simple_material("QA water cyan", (.02, .35, .48, .42), .18)); helpers.append(water_mesh)
    rig.animation_data.action = next(a for a in actions if a.name == "DuckSwim"); scene.frame_set(12); camera.location = (1.75, 2.65, 1.35); camera.data.lens = 65; aim(camera, (0, .02, .44)); water_path = directory / f"{ASSET_ID}-waterline-review.png"; scene.render.filepath = str(water_path); bpy.ops.render.render(write_still=True); outputs["Waterline"] = retained_review_path(water_path)
    water_mesh.hide_render = True; rig.animation_data.action = next(a for a in actions if a.name == "DuckIdle"); scene.frame_set(30)
    clay = simple_material("QA neutral clay", (.46, .49, .47, 1), .72)
    original_materials = {obj.name: list(obj.data.materials) for obj in meshes}
    original_material_indices = {obj.name: [polygon.material_index for polygon in obj.data.polygons] for obj in meshes}
    for obj in meshes:
        obj.data.materials.clear(); obj.data.materials.append(clay)
    camera.location = (1.75, 2.65, 1.35); camera.data.lens = 65; aim(camera, (0, .02, .44)); clay_three = directory / f"{ASSET_ID}-clay-three-quarter.png"; scene.render.filepath = str(clay_three); bpy.ops.render.render(write_still=True); outputs["ClayThreeQuarter"] = retained_review_path(clay_three)
    camera.location = (2.15, .06, .83); camera.data.lens = 72; aim(camera, (0, .02, .42)); clay_profile = directory / f"{ASSET_ID}-clay-profile.png"; scene.render.filepath = str(clay_profile); bpy.ops.render.render(write_still=True); outputs["ClayProfile"] = retained_review_path(clay_profile)
    camera.location = (1.05, 1.78, 1.02); camera.data.lens = 78; aim(camera, (0, .58, .68)); clay_face = directory / f"{ASSET_ID}-clay-face-closeup.png"; scene.render.filepath = str(clay_face); bpy.ops.render.render(write_still=True); outputs["ClayFaceCloseup"] = retained_review_path(clay_face)
    camera.location = (1.05, .65, .52); camera.data.lens = 78; aim(camera, (.08, .10, .09)); clay_foot = directory / f"{ASSET_ID}-clay-webbed-foot-contact.png"; scene.render.filepath = str(clay_foot); bpy.ops.render.render(write_still=True); outputs["ClayFootContact"] = retained_review_path(clay_foot)
    for obj in meshes:
        obj.data.materials.clear()
        for material in original_materials[obj.name]: obj.data.materials.append(material)
        for polygon, material_index in zip(obj.data.polygons, original_material_indices[obj.name]):
            polygon.material_index = material_index
    rig.animation_data.action = None; scene.frame_set(1)
    for obj in helpers:
        if obj.name in bpy.data.objects: bpy.data.objects.remove(obj, do_unlink=True)
    return outputs


def glb_json(path: Path) -> Dict:
    with path.open("rb") as handle:
        magic, version, length = struct.unpack("<4sII", handle.read(12))
        if magic != b"glTF" or version != 2: raise RuntimeError(f"{path} is not glTF 2.0")
        while handle.tell() < length:
            chunk_length, chunk_type = struct.unpack("<II", handle.read(8)); data = handle.read(chunk_length)
            if chunk_type == 0x4E4F534A: return json.loads(data.decode("utf-8"))
    raise RuntimeError(f"{path} has no JSON chunk")


def verify_glb(path: Path) -> Dict[str, object]:
    data = glb_json(path); clips = [animation.get("name") for animation in data.get("animations", [])]
    missing = [name for name in CLIP_NAMES if name not in clips]
    if missing: raise RuntimeError(f"{path.name} missing clips {missing}; found {clips}")
    if not data.get("skins"): raise RuntimeError(f"{path.name} has no skin")
    primitives = [primitive for mesh in data.get("meshes", []) for primitive in mesh.get("primitives", [])]
    if not any("JOINTS_0" in p.get("attributes", {}) and "WEIGHTS_0" in p.get("attributes", {}) for p in primitives): raise RuntimeError(f"{path.name} has no skinned primitive")
    if not any(material.get("normalTexture") for material in data.get("materials", [])): raise RuntimeError(f"{path.name} has no normal-mapped material")
    triangles = sum(data["accessors"][p["indices"]]["count"] // 3 for p in primitives); vertices = sum(data["accessors"][p["attributes"]["POSITION"]]["count"] for p in primitives)
    return {"animations": clips, "skins": len(data.get("skins", [])), "bones": max(len(s.get("joints", [])) for s in data.get("skins", [])), "meshes": len(primitives), "materials": len(data.get("materials", [])), "embeddedImages": len(data.get("images", [])), "triangles": triangles, "vertices": vertices}


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""): digest.update(block)
    return digest.hexdigest()


def object_bounds(objects: Sequence[bpy.types.Object]) -> Tuple[Vector, Vector]:
    points = [obj.matrix_world @ Vector(corner) for obj in objects for corner in obj.bound_box]
    return Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))), Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))


def main() -> None:
    args = parse_args(); args.output = args.output.resolve(); args.source = args.source.resolve(); args.output.mkdir(parents=True, exist_ok=True); args.source.mkdir(parents=True, exist_ok=True)
    if args.preview: args.preview = args.preview.resolve()
    purge(); scene = bpy.context.scene; scene.render.fps = 30; scene.unit_settings.system = "METRIC"; scene.unit_settings.scale_length = 1
    source_maps = write_source_maps(args.source, args.texture_size); runtime_maps = make_runtime_maps(source_maps)
    materials = {
        "body": feather_material("MallardMottledBodyPBR", (.58, .43, .30), runtime_maps),
        "chest": feather_material("MallardChestnutBreastPBR", (.48, .16, .09), runtime_maps),
        "collar": feather_material("MallardWhiteNeckRingPBR", (.95, .93, .84), runtime_maps),
        "head": feather_material("MallardIridescentHeadPBR", (.035, .24, .14), runtime_maps, .10),
        "wing": feather_material("MallardFoldedWingPBR", (.42, .31, .22), runtime_maps),
        "speculum": feather_material("MallardBlueSpeculumPBR", (.025, .12, .42), runtime_maps, .18),
        "tail": feather_material("MallardTailFeatherPBR", (.34, .32, .28), runtime_maps),
        "bill": simple_material("MallardBillKeratin", (.91, .61, .08, 1), .54),
        "bill_dark": simple_material("MallardBillNailKeratin", (.54, .35, .07, 1), .61),
        "foot": simple_material("MallardWebbedFootKeratin", (.89, .39, .065, 1), .67),
        "eye": simple_material("MallardEyeCornea", (.006, .004, .002, 1), .12),
        "nostril": simple_material("MallardNareRecess", (.035, .025, .012, 1), .65),
    }
    body = create_axial_body(); assign_body_materials(body, materials)
    apply_modifier(body, "Mallard anatomical surface"); smooth_mesh(body); smart_uv(body)
    appendages = create_appendages(materials)
    eyes = []
    for side, sign in (("L", 1), ("R", -1)):
        eyes.append(ellipsoid(f"Eye.{side}", (sign * .142, .455, .722), (.009, .0135, .0135), materials["eye"], 36))
    select_only(eyes); bpy.context.view_layer.objects.active = eyes[0]; bpy.ops.object.join(); eyes_obj = bpy.context.object; eyes_obj.name = "Eyes"
    nostrils = []
    for side, sign in (("L", 1), ("R", -1)):
        nostrils.append(ellipsoid(f"Nare.{side}", (sign * .037, .592, .689), (.008, .012, .004), materials["nostril"], 24))
    select_only(nostrils); bpy.context.view_layer.objects.active = nostrils[0]; bpy.ops.object.join(); nostril_obj = bpy.context.object; nostril_obj.name = "Nares"
    meshes = [body, *appendages.values(), eyes_obj, nostril_obj]
    for obj in meshes:
        if not obj.data.uv_layers: smart_uv(obj)
    rig = make_rig(); skin_object(body, rig)
    for side in ("L", "R"):
        skin_folded_wing(appendages[f"wing_{side}"], rig, side)
        skin_object(appendages[f"tarsus_{side}"], rig, f"Leg.{side}"); skin_object(appendages[f"foot_{side}"], rig, f"Foot.{side}")
    skin_object(appendages["tail"], rig, "Tail"); skin_object(appendages["bill"], rig, "Bill"); skin_object(eyes_obj, rig, "Head"); skin_object(nostril_obj, rig, "Bill")
    # All authored surfaces share one skeleton and are consolidated into a
    # single skinned host. glTF still emits one primitive per unique material,
    # but avoids a draw call for every toe, eye, wing and keratin detail object.
    select_only(meshes); bpy.context.view_layer.objects.active = body; bpy.ops.object.join()
    body = bpy.context.object; body.name = "MallardDuckSkinnedSurface"; body.data.name = "MallardDuckSkinnedSurface"
    body["continuous_anatomical_mesh"] = True; body["draw_call_consolidated"] = True
    meshes = [body]
    actions = [make_idle(rig), make_waddle(rig), make_swim(rig), make_short_flight(rig), make_landing(rig)]; install_tracks(rig, actions); triangulate(meshes)
    previews = render_previews(rig, actions, meshes, args.preview) if args.preview else {}; install_tracks(rig, actions)
    lod2_meshes, lod2_rig = duplicate_lod(meshes, rig, .38); triangulate(lod2_meshes)
    lod0_path = args.output / f"{ASSET_ID}-lod0.glb"; lod2_path = args.output / f"{ASSET_ID}-lod2.glb"
    gltf_export(lod0_path, [*meshes, rig]); gltf_export(lod2_path, [*lod2_meshes, lod2_rig])
    lod0 = verify_glb(lod0_path); lod2 = verify_glb(lod2_path); low, high = object_bounds(meshes); dimensions = high - low
    visual_references = ["https://www.allaboutbirds.org/guide/Mallard/overview", "https://www.audubon.org/field-guide/bird/mallard"]
    manifest = {"schemaVersion": 1, "id": ASSET_ID, "displayName": "Mallard duck", "species": "Anas platyrhynchos", "license": "Original-Project-Asset", "generator": "tools/animal-pipeline/build_mallard_duck.py",
        "provenance": {"geometry": "Original repository-authored continuous tapered chest/keel/rump/skull loft, integrated scapular-primary wing masses, closed spatulate bill, coherent tail covert fan, curved tarsi and continuous sculpted webbed feet; no third-party geometry.", "textures": "Original deterministic NumPy-generated feather PBR maps; no third-party pixels.", "rigging": "Original 14-bone mallard skeleton, blended skin weights and five animation clips authored by this pipeline.", "referencePolicy": "Reputable bird references informed anatomy, plumage and locomotion only; no files or pixels were copied.", "visualReferences": visual_references},
        "coordinateSystem": {"unit": "meter", "up": "+Y", "forward": "-Z", "origin": "webbed-foot contact plane"},
        "dimensionsMeters": {"width": round(dimensions.x, 3), "length": round(dimensions.y, 3), "height": round(dimensions.z, 3)},
        "skeleton": {"name": "MallardDuckRig", "bones": [bone.name for bone in rig.data.bones], "maxInfluences": 4}, "clips": [{"name": name} for name in CLIP_NAMES], "materials": [m.name for m in materials.values()],
        "maps": {kind: {"kind": kind, "sourceFile": str(path.relative_to(Path.cwd())), "embeddedImageName": f"{ASSET_ID}-mallardmottledbodypbr-albedo" if kind == "albedo" else f"{ASSET_ID}-{kind}", "width": args.texture_size, "height": args.texture_size, "bytes": path.stat().st_size, "sha256": sha256(path), "runtimeMimeType": "image/jpeg" if kind == "albedo" else "image/png"} for kind, path in source_maps.items()},
        "lod0": {"file": lod0_path.name, "bytes": lod0_path.stat().st_size, "sha256": sha256(lod0_path), **lod0}, "lod2": {"file": lod2_path.name, "bytes": lod2_path.stat().st_size, "sha256": sha256(lod2_path), **lod2}, "previews": previews}
    (args.source / f"{ASSET_ID}.asset.json").write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    (Path(__file__).resolve().parent / f"{ASSET_ID}-metrics.json").write_text(json.dumps({"speciesId": ASSET_ID, "dimensionsMeters": manifest["dimensionsMeters"], "skeleton": manifest["skeleton"], "clips": list(CLIP_NAMES), "lod0": manifest["lod0"], "lod2": manifest["lod2"], "maps": manifest["maps"], "previews": previews}, indent=2, sort_keys=True) + "\n")
    (args.source / f"{ASSET_ID}.provenance.json").write_text(json.dumps({"speciesId": ASSET_ID, "license": "Original-Project-Asset", "source": "tools/animal-pipeline/build_mallard_duck.py", "generatedSourceBlend": f"tools/animal-pipeline/source/{ASSET_ID}-source.blend", "thirdPartyAssets": [], "visualReferences": visual_references, "referenceUse": "Anatomy, plumage and locomotion study only; no geometry, pixels, rig or animation copied.", "review": {"clayGate": "retained fixed-camera anatomical clay three-quarter, profile, face and webbed-foot contact renders generated; awaiting final visual sign-off", "texturedGate": "retained fixed-camera five-motion, face, webbed-foot and waterline renders generated; awaiting final visual sign-off", "liveShowroomGate": "fresh Hero and Mobile showroom imports required after generation", "freshImportCount": 0}}, indent=2, sort_keys=True) + "\n")
    if args.keep_blend:
        relink_feather_materials(materials.values(), source_maps); bpy.context.preferences.filepaths.save_version = 0; bpy.ops.wm.save_as_mainfile(filepath=str(args.source / f"{ASSET_ID}-source.blend"))
    print(json.dumps(manifest, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
